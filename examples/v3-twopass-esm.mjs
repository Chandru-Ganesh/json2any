// ─────────────────────────────────────────────────────────────────────────────
// examples/v3-twopass-esm.mjs  — run with:  node examples/v3-twopass-esm.mjs
// ─────────────────────────────────────────────────────────────────────────────
import { streamJSONToCSV } from 'json2any';
import { Readable, Writable } from 'stream';
import { createWriteStream } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// ── Example 1: NDJSON → CSV file (large-file safe) ───────────────────────────
const outPath = join(tmpdir(), 'json2any-v3-output.csv'); // os.tmpdir() — works on Windows + Linux + macOS

const ndjsonSource = Readable.from([
  '{"product":"Widget","price":9.99,"category":"tools"}\n',
  '{"product":"Gadget","price":19.99,"category":"electronics"}\n',
  '{"product":"Donut","price":1.50,"category":"food","calories":350}\n',
  //  ↑ heterogeneous schema — 'calories' only in row 3, handled correctly
]);

await streamJSONToCSV(ndjsonSource, createWriteStream(outPath), {
  twoPass:   true,
  cleanup:   true,    // delete temp spill file after completion (default)
  bom:       true,    // UTF-8 BOM for Excel (default)
  excelSafe: true,    // formula injection guard (default)
});
console.log(`Wrote ${outPath}`);

// ── Example 2: JSON array → buffer, then print ───────────────────────────────
// NOTE: Avoid piping directly to process.stdout when more console.log calls
// follow — stdout stream close races with subsequent writes causing EPIPE.
const arrayChunks = [];
const arraySink   = new Writable({ write(c, _, cb) { arrayChunks.push(c); cb(); } });

await streamJSONToCSV(
  Readable.from(['[{"name":"Alice","dept":"eng"},{"name":"Bob","dept":"sales","remote":true}]']),
  arraySink,
  { twoPass: true, bom: false },
);
console.log('\n── JSON array → CSV ──');
console.log(Buffer.concat(arrayChunks).toString());

// ── Example 3: Small dataset — V2 buffered path (still works unchanged) ──────
const smallChunks = [];
const smallSink   = new Writable({ write(c, _, cb) { smallChunks.push(c); cb(); } });
await streamJSONToCSV(Readable.from(['{"a":1}\n{"a":2}']), smallSink);
console.log('── Buffered path output ──');
console.log(Buffer.concat(smallChunks).toString());
