'use strict';


/**
 * Two-pass streaming CSV writer.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  Problem: CSV needs headers on line 1, but headers are only known   │
 * │  after scanning every row. Buffering all rows causes OOM at scale.  │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * Solution — two passes, one temp file:
 *
 *   PASS 1 — Scan + Spill                     Memory: O(h)
 *   ─────────────────────────────────────────────────────
 *   source
 *     → NDJSONParser          (emits JS objects)
 *     → Pass1Spiller          (flatten + collect headers + stringify to disk)
 *     → fs.createWriteStream  (temp NDJSON file)
 *
 *   headerMap accumulates only unique header keys — no row data in memory.
 *
 *   PASS 2 — Emit CSV                         Memory: O(1) per row
 *   ─────────────────────────────────────────────────────────────────────
 *   fs.createReadStream (temp file)
 *     → Pass2CSVFormatter     (parse NDJSON lines → format CSV rows)
 *     → dest
 *
 *   CSV rows are emitted immediately — never accumulated.
 *
 * Memory guarantee:
 *   Regardless of n (row count), heap holds at most:
 *     • headerMap: O(h) — one string entry per unique column
 *     • Pass1Spiller: O(1) — one flattened row at a time (immediately serialised)
 *     • Pass2CSVFormatter: O(1) — one partial line buffer + one parsed row at a time
 *
 * Disk:
 *   One temp file, size ≈ input JSON (flattened, stringified).
 *   Deleted on success AND on error — no orphan files.
 */

const { Transform, pipeline } = require('stream');
const { promisify } = require('util');
const { createWriteStream, createReadStream, unlink } = require('fs');
const { tmpdir } = require('os');
const { join } = require('path');
const { randomBytes } = require('crypto');
const { flattenObject } = require('./flatten.cjs');
const { buildRow, BOM, CRLF, DELIMITER } = require('./formatter.cjs');
const { NDJSONParser } = require('./parser.cjs');

const pipelineAsync = promisify(pipeline);
const unlinkAsync   = promisify(unlink);


// ─── Pass 1 Transform ────────────────────────────────────────────────────────

/**
 * Pass1Spiller — receives JS objects, writes NDJSON lines to a temp file.
 *
 * Writable side: objectMode (receives JS objects from NDJSONParser)
 * Readable side: byte stream  (emits JSON-stringified lines)
 *
 * Side-effect: populates `headerMap` with flat keys in first-seen order.
 * This is the ONLY data that grows with the dataset — and only h-unique strings,
 * not the values.
 */
class Pass1Spiller extends Transform {
  /**
   * @param {Map<string, number>} headerMap  Shared header accumulator (mutated in-place)
   * @param {string}              separator  Dot-notation separator for flatten
   */
  constructor(headerMap, separator) {
    super({ writableObjectMode: true, readableObjectMode: false });
    this._headerMap = headerMap;
    this._sep       = separator;
  }

  _transform(obj, _enc, cb) {
    try {
      // Flatten — O(k) where k = leaf count of this object
      const flat = flattenObject(obj, this._sep);

      // Header discovery — O(h) total across entire dataset
      const keys = Object.keys(flat);
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (!this._headerMap.has(k)) this._headerMap.set(k, this._headerMap.size);
      }

      // Spill to disk — one Buffer allocation, zero accumulation
      cb(null, Buffer.from(JSON.stringify(flat) + '\n', 'utf8'));
    } catch (err) {
      cb(err);
    }
  }
  // No _flush needed — we produce one output chunk per input object.
}


// ─── Pass 2 Transform ────────────────────────────────────────────────────────

/**
 * Pass2CSVFormatter — reads NDJSON lines from temp file, emits CSV rows.
 *
 * Both sides are byte streams (no objectMode).
 *
 * Emits the BOM + header row exactly once (on first _transform call),
 * then streams each data row immediately.
 *
 * Memory: at most one incomplete line + one parsed flat object at a time.
 */
class Pass2CSVFormatter extends Transform {
  /**
   * @param {string[]} headers  Finalized column order (from headerMap after Pass 1)
   * @param {boolean}  bom      Prepend UTF-8 BOM
   * @param {object}   rowOpts  { delimiter, excelSafe }
   */
  constructor(headers, bom, rowOpts) {
    super({ readableObjectMode: false, writableObjectMode: false });
    this._headers = headers;
    this._bom     = bom;
    this._rowOpts = rowOpts;
    this._isFirst = true;  // controls one-time BOM + header row emission
    this._tail    = '';    // incomplete line fragment (at most one line buffered)
  }

  _transform(chunk, _enc, cb) {
    try {
      const text = this._tail + chunk.toString('utf8');

      // Find the last newline — everything before it is complete lines
      const nl = text.lastIndexOf('\n');
      if (nl === -1) {
        // No complete line yet — accumulate and wait for more data
        this._tail = text;
        return cb();
      }

      this._tail       = text.slice(nl + 1);         // keep incomplete tail
      const complete   = text.slice(0, nl);           // everything before last \n
      const out        = this._processLines(complete.split('\n'));

      if (out.length > 0) cb(null, Buffer.from(out, 'utf8'));
      else cb();
    } catch (err) {
      cb(err);
    }
  }

  _flush(cb) {
    try {
      const trimmed = this._tail.trim();
      if (!trimmed) return cb();
      const out = this._processLines([trimmed]);
      if (out.length > 0) cb(null, Buffer.from(out, 'utf8'));
      else cb();
    } catch (err) {
      cb(err);
    }
  }

  /**
   * Format an array of NDJSON line strings into a CSV string.
   * Emits header row on the very first call.
   *
   * @param {string[]} lines
   * @returns {string}
   */
  _processLines(lines) {
    const parts  = [];
    const hLen   = this._headers.length;

    // One-time header + BOM emission
    if (this._isFirst) {
      if (this._bom) parts.push(BOM);
      parts.push(buildRow(this._headers, this._rowOpts));
      parts.push(CRLF);
      this._isFirst = false;
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const flat   = JSON.parse(line);
      const fields = new Array(hLen);
      for (let c = 0; c < hLen; c++) {
        const v    = flat[this._headers[c]];
        fields[c]  = v !== undefined ? v : '';
      }
      parts.push(buildRow(fields, this._rowOpts));
      parts.push(CRLF);
    }

    return parts.join('');
  }
}


// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Two-pass streaming JSON → CSV.
 *
 * Handles arbitrarily large datasets without OOM.
 * Memory stays O(h) regardless of row count.
 *
 * @param {import('stream').Readable} source     JSON input (NDJSON or JSON array)
 * @param {import('stream').Writable} dest       CSV output
 * @param {object}  opts
 * @param {string}  [opts.tempDir]               Override temp directory (default: os.tmpdir())
 * @param {boolean} [opts.cleanup=true]          Delete temp file on completion
 * @param {string}  [opts.separator='.']         Dot-notation key separator
 * @param {string}  [opts.delimiter=',']         CSV field delimiter
 * @param {boolean} [opts.excelSafe=true]        Strip formula-injection prefixes
 * @param {boolean} [opts.bom=true]              Prepend UTF-8 BOM
 * @returns {Promise<void>}
 */
async function twoPassStreamJSONToCSV(source, dest, opts = {}) {
  const sep       = opts.separator  ?? '.';
  const delimiter = opts.delimiter  ?? DELIMITER;
  const excelSafe = opts.excelSafe  ?? true;
  const bom       = opts.bom        ?? true;
  const doClean   = opts.cleanup    ?? true;
  const dir       = opts.tempDir    ?? tmpdir();

  // Collision-free temp path — 16 random bytes = 32 hex chars
  const tempPath  = join(dir, `json2any-${randomBytes(16).toString('hex')}.ndjson`);

  const cleanup = async () => {
    if (doClean) {
      try { await unlinkAsync(tempPath); } catch (_) { /* already gone or never created */ }
    }
  };

  try {
    // ── PASS 1: stream → flatten → spill to disk ─────────────────────────
    const headerMap  = new Map();        // O(h) — only unique column keys, no values
    const parser     = new NDJSONParser();
    const spiller    = new Pass1Spiller(headerMap, sep);
    const tempWrite  = createWriteStream(tempPath);

    await pipelineAsync(source, parser, spiller, tempWrite);
    //                                                ↑
    // tempPath now contains all rows as NDJSON.
    // headerMap contains every unique column in first-seen insertion order.

    // ── Edge case: empty input ────────────────────────────────────────────
    if (headerMap.size === 0) {
      if (bom) {
        // Write BOM to dest to match toCSV([]) behaviour, then finish
        await new Promise((resolve, reject) => {
          dest.write(BOM, 'utf8', (err) => (err ? reject(err) : resolve()));
        });
      }
      await cleanup();
      return;
    }

    // ── PASS 2: temp file → format CSV → dest ────────────────────────────
    const headers   = [...headerMap.keys()];         // stable insertion order
    const rowOpts   = { delimiter, excelSafe };
    const formatter = new Pass2CSVFormatter(headers, bom, rowOpts);
    const tempRead  = createReadStream(tempPath);

    await pipelineAsync(tempRead, formatter, dest);
    //                                        ↑
    // dest has received the complete, well-formed CSV.

  } catch (err) {
    await cleanup();
    throw err;   // re-throw with original stack intact
  }

  await cleanup();
}

module.exports = { twoPassStreamJSONToCSV, Pass1Spiller, Pass2CSVFormatter };
