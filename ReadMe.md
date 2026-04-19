# json2any

Convert JSON to clean, Excel-compatible CSV — with full streaming support for datasets of any size.

Currently supports: **JSON → CSV**
Planned: JSON → Excel, XML, and more.

---

## Why this exists

Most JSON → CSV tools either:

- break on nested data
- produce messy or inconsistent output
- ignore Excel-specific issues (encoding, formulas, quoting)
- run out of memory on large files

This fixes all of those problems with a simple API, solid defaults, and a two-pass streaming engine that keeps memory constant regardless of how large your data is.

---

## Features

- Nested object flattening (dot notation)
- Safe array serialization
- Excel-compatible output (BOM, CRLF, formula protection)
- Correct CSV escaping (quotes, commas, newlines in values)
- Stable column order (first-seen, insertion order)
- Heterogeneous schemas — missing fields filled with empty string
- **Two-pass streaming** — handles GB-scale files with O(h) memory
- Works with NDJSON and JSON arrays
- Full TypeScript support — ships a `.d.ts` definition file
- Dual ESM + CommonJS — works in any Node.js project
- Zero external dependencies

---

## Installation

```bash
npm install json2any
```

---

## Quick start

```js
import { toCSV } from 'json2any';

const csv = toCSV([
  { id: 1, name: 'Alice' },
  { id: 2, name: 'Bob' }
]);

console.log(csv);
```

```
id,name
1,Alice
2,Bob
```

---

## Usage

### Nested objects

Nested objects are flattened using dot notation automatically.

```js
const csv = toCSV([
  { user: { name: 'Alice', age: 30 }, active: true }
]);
```

```
user.name,user.age,active
Alice,30,true
```

---

### Arrays

```js
const csv = toCSV([
  { tags: ['js', 'ts', 'node'] }
]);
```

```
tags
js|ts|node
```

- Primitive arrays → pipe-separated string
- Arrays of objects → JSON string (not expanded into columns)

---

### Heterogeneous schemas

Rows with different keys are handled correctly. Missing fields become empty strings.

```js
const csv = toCSV([
  { id: 1, name: 'Alice' },
  { id: 2, name: 'Bob', role: 'admin' }
]);
```

```
id,name,role
1,Alice,
2,Bob,admin
```

---

### Excel safety

```js
const csv = toCSV([
  { formula: '=SUM(A1:A10)', note: 'hello, world' }
]);
```

```
formula,note
'=SUM(A1:A10),"hello, world"
```

- Formula prefixes (`=`, `+`, `-`, `@`) are escaped with a leading apostrophe
- Fields containing commas, quotes, or newlines are RFC-4180 quoted
- UTF-8 BOM prepended so Excel opens the file with correct encoding

---

### Options

```js
toCSV(data, {
  flatten:   true,   // flatten nested objects (default: true)
  separator: '.',    // key separator for nested fields (default: '.')
  delimiter: ',',    // CSV field delimiter (default: ',')
  bom:       true,   // prepend UTF-8 BOM for Excel (default: true)
  excelSafe: true,   // escape formula injection prefixes (default: true)
})
```

---

## Streaming

### Standard streaming — `toCSVStream`

Returns a readable CSV stream. Suitable for small to medium datasets.

```js
import fs from 'fs';
import { Readable } from 'stream';
import { toCSVStream } from 'json2any';

const source = Readable.from([
  '{"id":1,"name":"Alice"}\n',
  '{"id":2,"name":"Bob"}\n'
]);

toCSVStream(source).pipe(fs.createWriteStream('output.csv'));
```

---

### Two-pass streaming — for large files

Use `streamJSONToCSV` with `twoPass: true` for datasets that don't fit in memory.

Instead of buffering rows, it spills flattened rows to a temp file during Pass 1, then streams the formatted CSV output in Pass 2. The temp file is deleted automatically.

**Memory stays O(h) regardless of row count** — where h is the number of unique columns.

```js
import fs from 'fs';
import { streamJSONToCSV } from 'json2any';

const source = fs.createReadStream('large-input.ndjson');
const dest   = fs.createWriteStream('output.csv');

await streamJSONToCSV(source, dest, { twoPass: true });
```

Both NDJSON and JSON arrays are supported as input.

```
// NDJSON — one object per line
{"id":1,"name":"Alice"}
{"id":2,"name":"Bob"}

// JSON array
[{"id":1,"name":"Alice"},{"id":2,"name":"Bob"}]
```

#### Two-pass options

| Option  | Default       | Description                                      |
|---------|---------------|--------------------------------------------------|
| twoPass | false         | Enable two-pass streaming engine                 |
| tempDir | `os.tmpdir()` | Directory for the temp spill file                |
| cleanup | true          | Delete temp file after completion (or on error)  |

---

## API

### `toCSV(data, options?)`

Synchronous, in-memory conversion. Returns a CSV string.

```ts
toCSV(data: object | object[], options?: CSVOptions): string
```

Use for small to medium datasets that comfortably fit in memory.

---

### `toCSVStream(source, options?)`

Returns a readable CSV stream. Buffers all rows before emitting output.

```ts
toCSVStream(source: Readable, options?: CSVOptions): Readable
```

---

### `streamJSONToCSV(source, dest, options?)`

Async pipeline — streams JSON input to a writable destination.

```ts
streamJSONToCSV(source: Readable, dest: Writable, options?: CSVOptions): Promise<void>
```

- Without `twoPass` — buffered, same memory behaviour as `toCSVStream`
- With `twoPass: true` — two-pass engine, constant memory, GB-scale safe

---

## TypeScript

The package ships a `.d.ts` file. No `@types/` package needed.

```ts
import { toCSV, streamJSONToCSV } from 'json2any';
import type { CSVOptions, FlatRecord } from 'json2any';

const opts: CSVOptions = {
  twoPass:   true,
  delimiter: ',',
  bom:       true,
};

await streamJSONToCSV(source, dest, opts);
```

---

## ESM and CommonJS

Both module systems are supported with zero configuration.

```js
// ESM
import { toCSV } from 'json2any';

// CommonJS
const { toCSV } = require('json2any');
```

---

## Architecture

```
src/
  index.js              → public API
  core/
    flatten.js          → iterative JSON flattener (no recursion)
    formatter.js        → CSV formatting, Excel safety, RFC-4180 quoting
    parser.js           → NDJSON + JSON array stream parser
    csvWriter.js        → buffered streaming pipeline
    twoPassWriter.js    → two-pass streaming engine
dist/
  esm/                  → ESM build (tree-shakeable)
  cjs/                  → CommonJS build
  types/                → TypeScript definitions
```

### Flattening

Uses an iterative stack — no recursion, no call-stack limits.

- Objects → dot-notation keys (`user.address.city`)
- Arrays → serialized immediately (pipe-separated string)
- Complexity: O(k) where k = total leaf values across the object tree

### Formatting

All formatting is pure and stateless.

- RFC-4180 quoting (fields with commas, quotes, or newlines)
- Double-quote escaping (`"` → `""`)
- Excel formula protection (`=`, `+`, `-`, `@`)
- UTF-8 BOM
- CRLF line endings

### Two-pass streaming engine

```
Pass 1 — Scan + Spill                     Memory: O(h)
──────────────────────────────────────────────────────
Input stream
  → NDJSONParser        (emit one JS object per record)
  → Pass1Spiller        (flatten → collect header keys → write line to disk)
  → temp file

Pass 2 — Emit CSV                         Memory: O(1) per row
──────────────────────────────────────────────────────
temp file (read stream)
  → Pass2CSVFormatter   (parse line → format CSV row → emit immediately)
  → output stream
```

The header Map is the only structure that grows with the dataset — one entry per unique column name, never per row.

---

## Performance

- ~25–30 MB/s on typical datasets
- Linear with respect to output size
- No recursion — iterative flattening throughout
- Under 15 MB heap growth measured at 100k rows on the two-pass path

---

## Behavior reference

| Input               | Output                                    |
|---------------------|-------------------------------------------|
| Nested object       | Dot-notation keys (`user.name`)           |
| Array of primitives | Pipe-separated (`a\|b\|c`)               |
| Array of objects    | JSON string per cell                      |
| `null` / `undefined`| Empty string                              |
| `Date`              | ISO 8601 string                           |
| Boolean             | `"true"` or `"false"`                     |
| Formula prefix      | Apostrophe-prefixed (`'=SUM(...)`)        |
| Missing field       | Empty string                              |

---

## Limitations

- Arrays of objects are not expanded into sub-columns
- Header order follows first-seen insertion order
- Two-pass mode writes a temp file roughly equal in size to the input

---

## When to use this

- You need predictable, Excel-ready CSV output
- Your data is nested and other tools mangle it
- You are working with large files and need constant-memory streaming
- You want TypeScript types without extra packages
- You want zero production dependencies

---

## Roadmap

- JSON → Excel (`.xlsx`)
- CSV → JSON
- Worker-thread parallel processing

---

## License

MIT