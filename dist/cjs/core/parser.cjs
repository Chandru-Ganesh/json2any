'use strict';


/**
 * NDJSONParser — streaming JSON parser Transform.
 *
 * Handles two input formats transparently:
 *   1. Newline-Delimited JSON  (one object per line, no outer array)
 *   2. JSON Array              (one top-level array of objects)
 *
 * Emits one plain JS object per record in object mode.
 *
 * Memory: O(max_element_size) — only one incomplete element buffered at a time.
 * For typical NDJSON this is O(max_line_length); for JSON arrays it is
 * O(max_object_size_in_array).
 */

const { Transform } = require('stream');

class NDJSONParser extends Transform {
  constructor() {
    super({ readableObjectMode: true });
    this._buf       = '';
    this._arrayMode = null;  // null = not yet determined
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
    const trimmed = this._buf.trim();
    if (trimmed) {
      try {
        if (this._arrayMode && trimmed !== ']') {
          const clean = trimmed.replace(/,$/, '');
          if (clean) this.push(JSON.parse(clean));
        } else if (!this._arrayMode && trimmed) {
          this.push(JSON.parse(trimmed));
        }
      } catch (_) {
        // Ignore trailing partial data on stream end
      }
    }
    cb();
  }

  _processBuffer(cb) {
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
      this._buf   = this._buf.slice(nl + 1);
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
    // Bracket-balanced element extractor.
    // Handles the common case: array of objects up to arbitrary depth.
    let depth       = 0;
    let inString    = false;
    let escape      = false;
    let objectStart = -1;

    const startIdx = this._arrayStarted ? 0 : this._buf.indexOf('[') + 1;
    if (!this._arrayStarted) this._arrayStarted = true;

    for (let i = startIdx; i < this._buf.length; i++) {
      const ch = this._buf[i];

      if (escape)                       { escape = false; continue; }
      if (ch === '\\' && inString)      { escape = true;  continue; }
      if (ch === '"')                   { inString = !inString; continue; }
      if (inString)                      continue;

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
          this._buf = this._buf.slice(i + 1).replace(/^\s*,\s*/, '');
          return this._processArrayMode(cb);
        }
      }
    }
    cb();
  }
}

module.exports = { NDJSONParser };
