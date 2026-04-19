// ─────────────────────────────────────────────────────────────────────────────
// examples/usage-esm.mjs  — run with:  node examples/usage-esm.mjs
// ─────────────────────────────────────────────────────────────────────────────
import { toCSV, toCSVStream, streamJSONToCSV } from 'json2any';
import { Readable, Writable } from 'stream';
import { createWriteStream } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// ── 1. Simple flat array ─────────────────────────────────────────────────────
const csv = toCSV([
  { name: 'Alice', age: 30, city: 'London' },
  { name: 'Bob',   age: 25, city: 'Paris'  },
]);
console.log('── Flat array ──');
console.log(csv);

// ── 2. Nested objects ────────────────────────────────────────────────────────
const nestedCsv = toCSV([
  { user: { name: 'Charlie', role: 'admin' }, tags: ['js', 'ts'] },
  { user: { name: 'Diana',   role: 'user'  }, tags: ['python']   },
]);
console.log('── Nested ──');
console.log(nestedCsv);

// ── 3. Options: tab-delimited, no BOM ────────────────────────────────────────
const tsvCsv = toCSV(
  [{ a: 1, b: 2 }],
  { delimiter: '\t', bom: false, excelSafe: false },
);
console.log('── TSV (tab-delimited) ──');
console.log(JSON.stringify(tsvCsv));

// ── 4. Single object ─────────────────────────────────────────────────────────
console.log('── Single object ──');
console.log(toCSV({ id: 42, status: 'active' }));

// ── 5. Streaming: JSON Readable → CSV Readable ───────────────────────────────
const ndjsonSource = Readable.from([
  '{"product":"Widget","price":9.99}\n',
  '{"product":"Gadget","price":19.99}\n',
]);
console.log('── Stream output ──');
const csvReadable = toCSVStream(ndjsonSource);
csvReadable.pipe(process.stdout);

// ── 6. Async pipeline: stream to a file ──────────────────────────────────────
async function writeToFile() {
  const outPath = join(tmpdir(), 'json2any-output.csv');   // ← os.tmpdir(), works on Windows + Linux + macOS
  const source  = Readable.from(['[{"x":1},{"x":2},{"x":3}]']);
  const dest    = createWriteStream(outPath);
  await streamJSONToCSV(source, dest);
  console.log(`\n── Wrote ${outPath} ──`);
}
await writeToFile();
