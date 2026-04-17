# json2any

Convert JSON to clean, Excel-compatible CSV.

Currently supports: **JSON → CSV**
Planned: JSON → Excel, XML, and more.

This package focuses on correctness, performance, and predictable output. It handles nested objects, arrays, and edge cases that usually break CSV exports.

---

## Why this exists

Most JSON → CSV tools either:

* break on nested data
* produce messy or inconsistent output
* ignore Excel-specific issues (encoding, formulas, quoting)

This aims to fix those problems with a simple API and solid defaults.

---

## Features

* Handles nested objects (dot notation)
* Safe array serialization
* Excel-compatible output (BOM, CRLF, formula protection)
* Correct CSV escaping (quotes, commas, newlines)
* Stable column order (first-seen keys)
* Streaming API for large datasets
* No external dependencies

---

## Installation

```bash
npm install json2any
```

---

## Usage

### Basic

```js
import { toCSV } from 'json2any';

const data = [
  { id: 1, name: 'Alice' },
  { id: 2, name: 'Bob' }
];

const csv = toCSV(data);
console.log(csv);
```

---

### Nested objects

```js
const data = [
  { user: { name: 'Alice', age: 30 } }
];

const csv = toCSV(data);
```

Output:

```csv
user.name,user.age
Alice,30
```

---

### Arrays

```js
const data = [
  { tags: ['a', 'b', 'c'] }
];
```

Output:

```csv
tags
a|b|c
```

* Arrays of primitives → pipe-separated
* Arrays of objects → JSON string

---

### Special characters & Excel safety

```js
const data = [
  { formula: '=SUM(A1:A10)' }
];
```

Output:

```csv
formula
'=SUM(A1:A10)
```

* Prevents Excel from executing formulas
* Escapes quotes, commas, and newlines correctly

---

### Streaming (large data)

```js
import fs from 'fs';
import { Readable } from 'stream';
import { streamJSONToCSV } from 'json2any';

const source = Readable.from([
  JSON.stringify({ id: 1, name: 'Alice' }) + '\n',
  JSON.stringify({ id: 2, name: 'Bob' }) + '\n'
]);

const dest = fs.createWriteStream('output.csv');

await streamJSONToCSV(source, dest);
```

---

## API

### `toCSV(data, options?)`

Synchronous conversion (in-memory).
Use for small to medium datasets.

---

### `toCSVStream(source, options?)`

Returns a readable CSV stream.

---

### `streamJSONToCSV(source, destination, options?)`

Pipes JSON stream → CSV output.

---

## Options

| Option         | Default | Description                     |                           |
| -------------- | ------- | ------------------------------- | ------------------------- |
| flatten        | true    | Flatten nested objects          |                           |
| separator      | "."     | Key separator for nested fields |                           |
| delimiter      | ","     | CSV delimiter                   |                           |
| bom            | true    | Add UTF-8 BOM for Excel         |                           |
| excelSafe      | true    | Prevent formula injection       |                           |
| arraySeparator | "       | "                               | Used for primitive arrays |

---

## Behavior details

* Missing fields → empty string
* Column order → first appearance in data
* Dates → ISO format
* Objects → flattened (or stringified if `flatten=false`)
* Arrays → not expanded into multiple columns

---

## Architecture

The package is split into small, focused modules:

```
core/
  flatten.js     → iterative JSON flattener
  formatter.js   → CSV formatting + Excel safety
  csvWriter.js   → streaming pipeline
index.js         → public API
```

### Flattening

* Uses an **iterative stack (no recursion)**
* Avoids call stack limits and reduces overhead
* Complexity: O(k) where k = number of leaf values

Key idea:

* Objects → flattened using dot notation
* Arrays → serialized immediately (pipe-separated or JSON string)

---

### Formatting

Handles all CSV correctness rules:

* RFC-4180 quoting
* Double-quote escaping (`"` → `""`)
* Excel formula protection (`=`, `+`, `-`, `@`)
* UTF-8 BOM for Excel compatibility
* CRLF line endings

All functions are **pure and stateless**.

---

### Streaming pipeline

```
JSON stream
   ↓
NDJSONParser
   ↓
FlattenAccumulator
   ↓
CSVSerializer
   ↓
Writable stream (file / HTTP)
```

* Supports NDJSON and JSON arrays
* Buffers rows to collect headers before writing
* Designed for performance and simplicity

---

## Performance

* ~25–30 MB/s on typical datasets
* Linear with respect to output size
* No recursion (iterative processing)
* Minimal allocations in hot paths

---

## Limitations

* Not constant-memory streaming (rows buffered before writing)
* Arrays of objects are not expanded into separate columns
* Header order depends on input data order
* Very large datasets (>500MB) may require a two-pass approach

---

## When to use this

Use this if you need:

* predictable CSV output
* Excel-compatible files
* support for nested JSON
* good performance without extra dependencies

---

## When not to use this

* Extremely large datasets requiring strict constant memory
* Complex schema transformations
* Full Excel (.xlsx) generation (not yet supported)

---

## Roadmap

* JSON → Excel (.xlsx)
* CSV → JSON
* True constant-memory streaming (two-pass)
* Worker-thread parallel processing

---

## License

MIT
