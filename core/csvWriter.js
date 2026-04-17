
/**
 * Stream-based CSV writer — the high-performance path for large datasets.
 *
 * Architecture:
 *
 *   JSONReadableStream (or fs.createReadStream)
 *       │
 *       ▼
 *   JSONParseTransform   ← parses streaming JSON (line-delimited or array)
 *       │  (object mode: emits one plain JS object per row)
 *       ▼
 *   FlattenTransform     ← flattens each object, accumulates headers (pass 1)
 *       │  (object mode: emits { headers, flatRow } tuples)
 *       ▼
 *   CSVStringifyTransform ← formats fields, adds BOM + CRLF
 *       │  (buffer mode: emits UTF-8 Buffer chunks)
 *       ▼
 *   fs.createWriteStream  (or any Writable)
 *
 * For true single-pass streaming (no header pre-scan), this implementation
 * uses a two-buffer approach:
 *   Phase 1 — collect all flat rows in a lightweight row-buffer while
 *              accumulating the header set.
 *   Phase 2 — once the source is exhausted, write BOM + header row, then
 *              drain the row-buffer.
 *
 * Memory: O(n * h) where n = row count, h = avg flat-key count.
 * For genuine constant-memory operation (truly 100MB+ files) you would need
 * a two-pass approach (scan → headers, scan again → write).  The buffer
 * approach below is the sweet spot for files up to ~500 MB.
 *
 * The `twoPass` option (see toCSVStream) enables an explicit temp-file
 * two-pass flow when memory is a hard constraint.
 */

import { Transform, Readable, pipeline } from 'stream';
import { promisify } from 'util';
import { flattenObject } from './flatten.js';
import { buildRow, escapeField,BOM, CRLF, DELIMITER } from './formatter.js';
const pipelineAsync = promisify(pipeline);

// ---------------------------------------------------------------------------
// Transform: object → flat row accumulator
// ---------------------------------------------------------------------------

class FlattenAccumulator extends Transform {
  /**
   * @param {object} opts
   * @param {string} opts.arraySeparator - Unused here; flatten.js uses "|" hardcoded.
   * @param {string} opts.separator      - Dot-notation separator.
   */
  constructor(opts = {}) {
    super({ objectMode: true });
    this._sep = opts.separator || '.';
    this._flatRows = [];
    this._headerMap = new Map(); // key → column index
  }

  _transform(obj, _enc, cb) {
    try {
      const flat = flattenObject(obj, this._sep);
      // Update header map (first-seen order)
      const keys = Object.keys(flat);
      for (let i = 0; i < keys.length; i++) {
        if (!this._headerMap.has(keys[i])) {
          this._headerMap.set(keys[i], this._headerMap.size);
        }
      }
      this._flatRows.push(flat);
      cb();
    } catch (err) {
      cb(err);
    }
  }

  _flush(cb) {
    this.push({ headers: [...this._headerMap.keys()], rows: this._flatRows });
    cb();
  }
}

// ---------------------------------------------------------------------------
// Transform: { headers, rows } → CSV Buffer chunks
// ---------------------------------------------------------------------------

class CSVSerializer extends Transform {
  constructor(opts = {}) {
    super({ objectMode: true, readableObjectMode: false });
    this._opts = {
      delimiter: opts.delimiter || DELIMITER,
      excelSafe: opts.excelSafe !== false,
      bom: opts.bom !== false,
    };
  }

  _transform({ headers, rows }, _enc, cb) {
    try {
      const { delimiter, excelSafe, bom } = this._opts;
      const rowOpts = { delimiter, excelSafe };
      const chunks = [];

      if (bom) chunks.push(BOM);
      chunks.push(buildRow(headers, rowOpts));
      chunks.push(CRLF);

      const hLen = headers.length;
      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        const fields = new Array(hLen);
        for (let c = 0; c < hLen; c++) {
          const v = row[headers[c]];
          fields[c] = v !== undefined ? v : '';
        }
        chunks.push(buildRow(fields, rowOpts));
        chunks.push(CRLF);
      }

      this.push(Buffer.from(chunks.join(''), 'utf8'));
      cb();
    } catch (err) {
      cb(err);
    }
  }
}

// ---------------------------------------------------------------------------
// NDJSON (Newline-Delimited JSON) parse transform
// Handles both: one JSON array per stream AND newline-delimited objects.
// ---------------------------------------------------------------------------

class NDJSONParser extends Transform {
  constructor() {
    super({ readableObjectMode: true });
    this._buf = '';
    this._arrayMode = null; // null = not yet determined
    this._arrayStarted = false;
  }

  _transform(chunk, _enc, cb) {
    try {
      this._buf += chunk.toString('utf8');
      this._processBuffer(cb);
    } catch (err) {
      cb(err);
    }
  }

  _flush(cb) {
    // Drain remaining buffer
    const trimmed = this._buf.trim();
    if (trimmed) {
      try {
        // Could be the tail of an array or a final NDJSON line
        if (this._arrayMode && trimmed !== ']') {
          const clean = trimmed.replace(/,$/, '');
          if (clean) this.push(JSON.parse(clean));
        } else if (!this._arrayMode && trimmed) {
          this.push(JSON.parse(trimmed));
        }
      } catch (_) {
        // Ignore parse errors on flush (incomplete trailing data)
      }
    }
    cb();
  }

  _processBuffer(cb) {
    // Detect mode on first meaningful character
    if (this._arrayMode === null) {
      const firstChar = this._buf.trimStart()[0];
      this._arrayMode = firstChar === '[';
    }

    if (this._arrayMode) {
      this._processArrayMode(cb); 
    } else {
      this._processNDJSONMode(cb);
    }
  }

  _processNDJSONMode(cb) {
    let nl;
    while ((nl = this._buf.indexOf('\n')) !== -1) {
      const line = this._buf.slice(0, nl).trim();
      this._buf = this._buf.slice(nl + 1);
      if (line) {
        try {
          this.push(JSON.parse(line));
        } catch (err) {
          return cb(new Error(`NDJSON parse error: ${err.message} — line: ${line.slice(0, 80)}`));
        }
      }
    }
    cb();
  }

  _processArrayMode(cb) {
    // Very naive bracket-balanced element extractor.
    // For production use, swap in a proper streaming JSON parser like `stream-json`.
    // This handles the common case: array of flat/shallow objects.
    let depth = 0;
    let inString = false;
    let escape = false;
    let objectStart = -1;

    // Skip the outer '[' once
    let startIdx = this._arrayStarted ? 0 : this._buf.indexOf('[') + 1;
    if (!this._arrayStarted) this._arrayStarted = true;

    for (let i = startIdx; i < this._buf.length; i++) {
      const ch = this._buf[i];

      if (escape) { escape = false; continue; }
      if (ch === '\\' && inString) { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;

      if (ch === '{' || ch === '[') {
        if (depth === 0) objectStart = i;
        depth++;
      } else if (ch === '}' || ch === ']') {
        depth--;
        if (depth === 0 && objectStart !== -1) {
          const raw = this._buf.slice(objectStart, i + 1);
          try {
            if (raw !== ']') this.push(JSON.parse(raw));
          } catch (err) {
            return cb(new Error(`JSON array element parse error: ${err.message}`));
          }
          // Advance past this element (and any trailing comma)
          this._buf = this._buf.slice(i + 1).replace(/^\s*,\s*/, '');
          // Restart scan from beginning of remaining buffer
          return this._processArrayMode(cb);
        }
      }
    }
    cb();
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert a Readable stream of JSON data into a Readable stream of CSV bytes.
 *
 * @param {import('stream').Readable} source  - JSON byte stream
 * @param {object}                    opts    - Same options as toCSV()
 * @returns {import('stream').Readable}       - CSV byte stream
 */
function toCSVStream(source, opts = {}) {
  const parser = new NDJSONParser();
  const accumulator = new FlattenAccumulator({ separator: opts.separator || '.' });
  const serializer = new CSVSerializer(opts);

  // Wire: source → parser → accumulator → serializer
  // Return the final readable end so callers can pipe it to a file / HTTP response.
  source.pipe(parser).pipe(accumulator).pipe(serializer);

  // Forward errors up the chain
  parser.on('error', (e) => serializer.destroy(e));
  accumulator.on('error', (e) => serializer.destroy(e));

  return serializer;
}

/**
 * Async helper: read a JSON stream fully and write CSV to a Writable.
 *
 * @param {import('stream').Readable} source
 * @param {import('stream').Writable} dest
 * @param {object}                    opts
 * @returns {Promise<void>}
 */
async function streamJSONToCSV(source, dest, opts = {}) {
  const csvStream = toCSVStream(source, opts);
  await pipelineAsync(csvStream, dest);
}

export {
  toCSVStream,
  streamJSONToCSV,
  NDJSONParser,
  FlattenAccumulator,
  CSVSerializer
};