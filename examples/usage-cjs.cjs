// ─────────────────────────────────────────────────────────────────────────────
// examples/usage-cjs.cjs  — run with:  node examples/usage-cjs.cjs
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const { toCSV, toCSVStream, streamJSONToCSV } = require('json2any');
const { Readable, Writable } = require('stream');
const { createWriteStream }  = require('fs');
const { join }               = require('path');
const { tmpdir }             = require('os');

// ── 1. Flat array ────────────────────────────────────────────────────────────
const csv = toCSV([
  { name: 'Alice', age: 30 },
  { name: 'Bob',   age: 25 },
]);
console.log('── Flat array ──');
console.log(csv);

// ── 2. Nested ────────────────────────────────────────────────────────────────
const nested = toCSV([
  { user: { name: 'Charlie' }, scores: [10, 20] },
]);
console.log('── Nested ──');
console.log(nested);

// ── 3. Single object ─────────────────────────────────────────────────────────
console.log('── Single object ──');
console.log(toCSV({ id: 1, active: true }));

// ── 4. Streaming → stdout ────────────────────────────────────────────────────
const source = Readable.from(['[{"item":"A","qty":3},{"item":"B","qty":7}]']);
console.log('── Stream output ──');
const stream = toCSVStream(source);
stream.pipe(process.stdout);

// ── 5. Async pipeline → file ─────────────────────────────────────────────────
async function main() {
  const outPath = join(tmpdir(), 'json2any-cjs-output.csv');  // ← os.tmpdir(), works on Windows + Linux + macOS
  const src     = Readable.from(['{"col":"val1"}\n{"col":"val2"}']);
  const dest    = createWriteStream(outPath);
  await streamJSONToCSV(src, dest);
  console.log(`\n── Wrote ${outPath} ──`);
}

main().catch(console.error);
