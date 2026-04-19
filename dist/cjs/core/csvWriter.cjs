'use strict';


/**
 * Stream-based CSV writer.
 *
 * Two paths:
 *
 *   Default (twoPass: false) — buffered, fast for small/medium datasets:
 *     Accumulates all flattened rows in memory, then serialises in one pass.
 *     Memory: O(n * h). Safe up to ~200 MB of input JSON.
 *
 *   Two-pass (twoPass: true) — true streaming, GB-scale datasets:
 *     Pass 1: flatten + collect headers → spill rows to a temp file.
 *     Pass 2: read temp file → format CSV → stream to dest.
 *     Memory: O(h) — constant regardless of row count.
 *     See twoPassWriter.js for full architecture docs.
 */

const { Transform, pipeline } = require('stream');
const { promisify } = require('util');
const { flattenObject } = require('./flatten.cjs');
const { buildRow, BOM, CRLF, DELIMITER } = require('./formatter.cjs');
const { NDJSONParser } = require('./parser.cjs');
const { twoPassStreamJSONToCSV } = require('./twoPassWriter.cjs');

const pipelineAsync = promisify(pipeline);


// ─── Buffered path (V2-compatible) ───────────────────────────────────────────

/**
 * Accumulates all flattened rows then emits one CSV chunk.
 * O(n * h) memory — suitable for datasets up to ~200 MB.
 */
class FlattenAccumulator extends Transform {
  constructor(opts = {}) {
    super({ objectMode: true });
    this._sep       = opts.separator || '.';
    this._flatRows  = [];
    this._headerMap = new Map();
  }

  _transform(obj, _enc, cb) {
    try {
      const flat = flattenObject(obj, this._sep);
      const keys = Object.keys(flat);
      for (let i = 0; i < keys.length; i++) {
        if (!this._headerMap.has(keys[i])) this._headerMap.set(keys[i], this._headerMap.size);
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

/**
 * Receives { headers, rows } from FlattenAccumulator, emits a CSV Buffer.
 */
class CSVSerializer extends Transform {
  constructor(opts = {}) {
    super({ objectMode: true, readableObjectMode: false });
    this._opts = {
      delimiter: opts.delimiter || DELIMITER,
      excelSafe: opts.excelSafe !== false,
      bom:       opts.bom       !== false,
    };
  }

  _transform({ headers, rows }, _enc, cb) {
    try {
      const { delimiter, excelSafe, bom } = this._opts;
      const rowOpts = { delimiter, excelSafe };
      const chunks  = [];

      if (bom) chunks.push(BOM);
      chunks.push(buildRow(headers, rowOpts));
      chunks.push(CRLF);

      const hLen = headers.length;
      for (let r = 0; r < rows.length; r++) {
        const row    = rows[r];
        const fields = new Array(hLen);
        for (let c = 0; c < hLen; c++) {
          const v   = row[headers[c]];
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


// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Convert a JSON Readable stream into a CSV Readable stream.
 * Uses the buffered path — suitable for small/medium datasets.
 *
 * @param {import('stream').Readable} source
 * @param {object}                    opts
 * @returns {import('stream').Readable}
 */
function toCSVStream(source, opts = {}) {
  const parser      = new NDJSONParser();
  const accumulator = new FlattenAccumulator({ separator: opts.separator || '.' });
  const serializer  = new CSVSerializer(opts);

  source.pipe(parser).pipe(accumulator).pipe(serializer);

  parser.on('error',      (e) => serializer.destroy(e));
  accumulator.on('error', (e) => serializer.destroy(e));

  return serializer;
}

/**
 * Async JSON stream → CSV stream.
 *
 * opts.twoPass = false (default) → buffered, O(n·h) memory, fast for small datasets.
 * opts.twoPass = true            → two-pass, O(h) memory, handles GB-scale data.
 *
 * @param {import('stream').Readable} source
 * @param {import('stream').Writable} dest
 * @param {object}                    opts
 * @returns {Promise<void>}
 */
async function streamJSONToCSV(source, dest, opts = {}) {
  if (opts.twoPass) {
    return twoPassStreamJSONToCSV(source, dest, opts);
  }
  const csvStream = toCSVStream(source, opts);
  await pipelineAsync(csvStream, dest);
}

module.exports = {
  toCSVStream,
  streamJSONToCSV,
  NDJSONParser,
  FlattenAccumulator,
  CSVSerializer,
};
