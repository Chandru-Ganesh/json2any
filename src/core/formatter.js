
/**
 * Low-level CSV formatting utilities.
 *
 * All functions here are pure and stateless — they can safely be used
 * from multiple worker threads without synchronisation.
 *
 * Excel compatibility checklist implemented here:
 *  ✓ UTF-8 BOM prefix
 *  ✓ CRLF line endings
 *  ✓ RFC-4180 quoting (comma / quote / newline triggers quoting)
 *  ✓ Double-quote escaping (" → "")
 *  ✓ =, +, -, @ prefix stripping (formula injection defence)
 *  ✓ Date ISO serialisation (handled upstream in flatten.js)
 */

/** UTF-8 BOM — makes Excel auto-detect UTF-8 instead of ANSI */
const BOM = '\uFEFF';
const CRLF = '\r\n';
const DELIMITER = ',';

/**
 * Characters that force a field to be quoted per RFC-4180.
 * We compile this as a single regex and cache it at module load.
 */
const NEEDS_QUOTING_RE = /[",\r\n]/;

/**
 * Prefixes that Excel misinterprets as formula starters.
 * Strip them when excelSafe mode is active.
 */
const FORMULA_PREFIXES_RE = /^[=+\-@\t\r]/;

/**
 * Escape and optionally quote a single CSV field value.
 *
 * @param {string}  value
 * @param {boolean} excelSafe  - Strip formula-injection prefixes
 * @returns {string}
 */
function escapeField(value, excelSafe = true) {
  if (value === null || value === undefined) return '';

  let str = String(value);

  // Guard against formula injection (=SUM(...), +cmd, -cmd, @label, etc.)
  if (excelSafe && FORMULA_PREFIXES_RE.test(str)) {
    str = `'${str}`; // Prefix with apostrophe — Excel treats as text literal
  }

  // Quoting: wrap field in double-quotes if it contains a delimiter, quote, or newline.
  // Then escape any embedded double-quotes as "".
  if (NEEDS_QUOTING_RE.test(str)) {
    str = `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Build a single CSV row string (no line ending appended).
 *
 * @param {string[]} fields
 * @param {object}   opts
 * @param {string}   opts.delimiter   - Field separator (default ",")
 * @param {boolean}  opts.excelSafe   - Strip formula-injection prefixes
 * @returns {string}
 */
function buildRow(fields, opts = {}) {
  const { delimiter = DELIMITER, excelSafe = true } = opts;
  // Pre-allocate result parts array to avoid repeated string concatenation
  const parts = new Array(fields.length);
  for (let i = 0; i < fields.length; i++) {
    parts[i] = escapeField(fields[i], excelSafe);
  }
  return parts.join(delimiter);
}

/**
 * Build a complete CSV string from pre-flattened rows.
 *
 * This is the synchronous, in-memory path suitable for datasets that
 * comfortably fit in RAM (a few thousand rows).  For large files use
 * the streaming path in csvWriter.js.
 *
 * @param {string[]}                   headers   - Ordered column names
 * @param {Record<string, string>[]}   flatRows  - Pre-flattened row objects
 * @param {object}                     opts
 * @param {boolean}                    opts.bom           - Prepend UTF-8 BOM (default true)
 * @param {string}                     opts.delimiter     - Field separator
 * @param {boolean}                    opts.excelSafe     - Formula-injection guard
 * @returns {string}
 */
function buildCSV(headers, flatRows, opts = {}) {
  const { bom = true, delimiter = DELIMITER, excelSafe = true } = opts;
  const rowOpts = { delimiter, excelSafe };

  // Rough capacity estimate to reduce dynamic string builder reallocations.
  // Average ~30 chars/field × columns × rows — tunable.
  const parts = [];
  if (bom) parts.push(BOM);
  parts.push(buildRow(headers, rowOpts));
  parts.push(CRLF);

  for (let r = 0; r < flatRows.length; r++) {
    const row = flatRows[r];
    const fields = new Array(headers.length);
    for (let c = 0; c < headers.length; c++) {
      // Missing fields → empty string (never "undefined")
      const v = row[headers[c]];
      fields[c] = v !== undefined ? v : '';
    }
    parts.push(buildRow(fields, rowOpts));
    parts.push(CRLF);
  }

  return parts.join('');
}

export { escapeField, buildRow, buildCSV, BOM, CRLF, DELIMITER };