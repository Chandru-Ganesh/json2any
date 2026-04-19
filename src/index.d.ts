// Type definitions for json2any v3
// Project: https://github.com/chandruganesh/json2any

/// <reference types="node" />

import type { Readable, Writable } from 'stream';

// ─── Option types ─────────────────────────────────────────────────────────────

/**
 * Options shared by all conversion functions.
 */
export interface CSVOptions {
  /**
   * Deep-flatten nested objects using dot-notation keys.
   * Arrays are serialised as pipe-separated strings.
   * @default true
   */
  flatten?: boolean;

  /**
   * Separator used when building dot-notation keys for nested objects.
   * @default '.'
   */
  separator?: string;

  /**
   * Field delimiter character.
   * @default ','
   */
  delimiter?: string;

  /**
   * Prepend a UTF-8 BOM (0xEF 0xBB 0xBF) so Excel auto-detects UTF-8.
   * @default true
   */
  bom?: boolean;

  /**
   * Prefix formula-triggering field values (`=`, `+`, `-`, `@`) with an
   * apostrophe so Excel treats them as literal text, not formulas.
   * @default true
   */
  excelSafe?: boolean;

  /**
   * When `true`, use the two-pass streaming path instead of the buffered
   * default.  Required for datasets larger than available heap (GB-scale).
   *
   * Two-pass memory: O(h) where h = unique column count.
   * Buffered memory: O(n × h) — bounded by process heap (~1.5 GB default).
   *
   * Only relevant for `streamJSONToCSV`.
   * @default false
   */
  twoPass?: boolean;

  /**
   * Directory for the temporary spill file used during two-pass streaming.
   * Must have read/write access.
   * @default os.tmpdir()
   */
  tempDir?: string;

  /**
   * Delete the temporary spill file after the pipeline completes (or fails).
   * Set to `false` only for debugging.
   * @default true
   */
  cleanup?: boolean;
}

/** A flat record where every value has been serialised to a string. */
export type FlatRecord = Record<string, string>;

// ─── Core functions ───────────────────────────────────────────────────────────

/**
 * Convert a JSON value (array of objects, or a single object) to a CSV string.
 *
 * Synchronous in-memory conversion. Suitable for small to medium datasets
 * that comfortably fit in memory.
 *
 * @example
 * import { toCSV } from 'json2any';
 * const csv = toCSV([{ name: 'Alice', age: 30 }]);
 *
 * @example
 * // Nested objects
 * const csv = toCSV([{ user: { name: 'Bob' }, tags: ['a', 'b'] }]);
 * // → user.name,tags\r\nBob,a|b\r\n
 */
export function toCSV(
  data: object | object[],
  opts?: CSVOptions,
): string;

/**
 * Convert a JSON Readable stream into a CSV Readable stream.
 *
 * Uses the buffered path (O(n×h) memory). For GB-scale data, use
 * `streamJSONToCSV` with `{ twoPass: true }`.
 *
 * Accepts both NDJSON (one object per line) and a top-level JSON array.
 *
 * @example
 * import { toCSVStream } from 'json2any';
 * const csvStream = toCSVStream(jsonReadable);
 * csvStream.pipe(fs.createWriteStream('output.csv'));
 */
export function toCSVStream(
  source: Readable,
  opts?: CSVOptions,
): Readable;

/**
 * Async pipeline: JSON input stream → CSV output stream.
 *
 * ### Buffered path (default, `twoPass: false`)
 * Memory: O(n×h). Fast. Use for datasets up to ~200 MB of JSON.
 *
 * ### Two-pass path (`twoPass: true`)
 * Memory: O(h) — constant regardless of row count.
 * Suitable for datasets of any size (10 M+ rows, GB-scale files).
 *
 * Uses one temporary file (deleted on completion or error).
 *
 * @example
 * // Buffered (small files):
 * await streamJSONToCSV(input, output);
 *
 * @example
 * // Two-pass (large files):
 * await streamJSONToCSV(input, output, { twoPass: true });
 *
 * @example
 * // TypeScript — all options typed:
 * await streamJSONToCSV(input, output, {
 *   twoPass:   true,
 *   tempDir:   '/fast-ssd/tmp',
 *   delimiter: '\t',
 *   bom:       false,
 * });
 */
export function streamJSONToCSV(
  source: Readable,
  dest:   Writable,
  opts?:  CSVOptions,
): Promise<void>;

// ─── Internal utilities (exported for extensibility / testing) ────────────────

/**
 * Flatten a nested object into a 1-level map with dot-notation keys.
 * Uses an iterative stack — no recursion, no call-stack overflow.
 *
 * @example
 * flattenObject({ a: { b: 1 } })
 * // → { 'a.b': '1' }
 */
export function flattenObject(
  obj: Record<string, unknown>,
  sep?: string,
): FlatRecord;

/**
 * Collect the union of all keys across a collection of flat records,
 * in stable first-seen insertion order.
 */
export function collectHeaders(
  flatRows: Iterable<FlatRecord>,
): string[];

/**
 * Escape and optionally quote a single CSV field value per RFC-4180.
 */
export function escapeField(
  value: string,
  excelSafe?: boolean,
): string;

/**
 * Build a single CSV row string (no line ending appended).
 */
export function buildRow(
  fields: string[],
  opts?: { delimiter?: string; excelSafe?: boolean },
): string;

/**
 * Build a complete in-memory CSV string from pre-flattened rows.
 */
export function buildCSV(
  headers:  string[],
  flatRows: FlatRecord[],
  opts?:    Pick<CSVOptions, 'bom' | 'delimiter' | 'excelSafe'>,
): string;
