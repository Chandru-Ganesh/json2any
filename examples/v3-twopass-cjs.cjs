// ─────────────────────────────────────────────────────────────────────────────
// examples/v3-twopass-cjs.cjs  — run with:  node examples/v3-twopass-cjs.cjs
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const { streamJSONToCSV } = require('json2any');
const { Readable, Writable } = require('stream');
const { createWriteStream }  = require('fs');
const { join }               = require('path');
const { tmpdir }             = require('os');

async function main() {

  // ── Example 1: NDJSON → CSV file ─────────────────────────────────────────
  const outPath = join(tmpdir(), 'json2any-v3-cjs-output.csv');  // ← works on Windows, Linux, macOS

  const source = Readable.from([
    '{"id":1,"name":"Alice","role":"engineer"}\n',
    '{"id":2,"name":"Bob","role":"designer","team":"ux"}\n',
    //  ↑ 'team' only in row 2 — two-pass collects full header union
  ]);

  await streamJSONToCSV(source, createWriteStream(outPath), {
    twoPass: true,
  });
  console.log(`Wrote ${outPath}`);


  // ── Example 2: JSON array → in-memory buffer ──────────────────────────────
  const chunks = [];
  const sink   = new Writable({ write(c, _, cb) { chunks.push(c); cb(); } });

  await streamJSONToCSV(
    Readable.from(['[{"x":10,"y":20},{"x":30,"y":40}]']),
    sink,
    { twoPass: true, bom: false },
  );
  console.log('\n── JSON array output ──');
  console.log(Buffer.concat(chunks).toString());


  // ── Example 3: Buffered path — twoPass omitted, V2 behaviour ─────────────
  const buf = [];
  const w   = new Writable({ write(c, _, cb) { buf.push(c); cb(); } });
  await streamJSONToCSV(Readable.from(['{"col":"val1"}\n{"col":"val2"}']), w);
  console.log('\n── Buffered path output ──');
  console.log(Buffer.concat(buf).toString());

}

main().catch(console.error);
