'use strict';

const { flattenObject, collectHeaders } = require('./core/flatten.cjs');
const { buildCSV } = require('./core/formatter.cjs');
const { toCSVStream, streamJSONToCSV } = require('./core/csvWriter.cjs');

const DEFAULTS = {
  flatten: true,
  arraySeparator: '|',  // exposed in docs; array join is done inside flatten.js
  separator: '.',
  delimiter: ',',
  bom: true,
  excelSafe: true,
};


/**
 * Convert a JSON value (array of objects, or a single object) to a CSV string.
 *
 * @param {object | object[]} data   - Input JSON data
 * @param {Partial<DEFAULTS>} opts   - Optional configuration
 * @returns {string}                 - Excel-compatible CSV string
 *
 * @example
 *   import { toCSV } from 'jsonify-csv';
 *   const csv = toCSV([{ name: 'Alice', age: 30 }]);
 *
 * @example
 *   // Nested data
 *   const csv = toCSV([{ user: { name: 'Bob' }, tags: ['a', 'b'] }]);
 *   // → user.name,tags\r\nBob,a|b\r\n
 */
function toCSV(data, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };

  // Normalise: always work with an array of rows
  const rows = Array.isArray(data) ? data : [data];

  if (rows.length === 0) {
    return cfg.bom ? '\uFEFF' : '';
  }

  // Phase 1 — flatten all rows (O(n * k))
  const flatRows = cfg.flatten
    ? rows.map((row) => flattenObject(row, cfg.separator))
    : rows.map((row) => _shallowStringify(row));

  // Phase 2 — collect headers in stable first-seen order (O(n * h))
  const headers = collectHeaders(flatRows);

  // Phase 3 — serialise (O(n * h))
  return buildCSV(headers, flatRows, {
    bom: cfg.bom,
    delimiter: cfg.delimiter,
    excelSafe: cfg.excelSafe,
  });
}

/**
 * Shallow stringify for when flatten=false.
 * Prevents [object Object] without deep flattening.
 */
function _shallowStringify(obj) {
  const out = Object.create(null);
  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i++) {
    const v = obj[keys[i]];
    if (v === null || v === undefined) {
      out[keys[i]] = '';
    } else if (Array.isArray(v)) {
      out[keys[i]] = v.join('|');
    } else if (typeof v === 'object' && !(v instanceof Date)) {
      out[keys[i]] = JSON.stringify(v);
    } else {
      out[keys[i]] = String(v instanceof Date ? v.toISOString() : v);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Re-export streaming API unchanged
// ---------------------------------------------------------------------------

module.exports = { toCSV, toCSVStream, streamJSONToCSV };
