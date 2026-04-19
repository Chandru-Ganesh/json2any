# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.0.1] - 2026-04-19

### Added
-**Updated Readme.md**

## [2.0.0] - 2026-04-19

### Added

- **True two-pass streaming** via `streamJSONToCSV` with `{ twoPass: true }` — handles arbitrarily large datasets (GB-scale, 10M+ rows) without running out of memory
- Memory during streaming is now **O(h)** where h = unique column count, regardless of row count — previously O(n × h)
- Pass 1 flattens each record and spills it immediately to a temp file (NDJSON format); no rows are held in memory
- Pass 2 reads the temp file as a stream, writes BOM + headers once, then formats and emits each CSV row immediately
- Temp file is automatically deleted on both success and failure — no orphan files under any error condition
- New `twoPass`, `tempDir`, and `cleanup` options on `streamJSONToCSV`
- Full **TypeScript support** — ships a `.d.ts` definition file with every exported function and type fully typed, zero `any`
- `CSVOptions` and `FlatRecord` types exported for TypeScript consumers
- Both `import { streamJSONToCSV } from 'json2any'` and `const { streamJSONToCSV } = require('json2any')` work with full type inference in TypeScript
- `NDJSONParser` extracted into its own internal module (`core/parser.js`) for cleaner dependency graph
- **Dual module support** — package now ships both ESM and CommonJS builds with zero runtime overhead
- Conditional exports via the `"exports"` field: `"import"` resolves to ESM, `"require"` resolves to CJS
- `"main"` field pointing to the CJS build for legacy bundlers and older Node versions
- `"module"` field pointing to the ESM build for bundlers that support it
- ESM build at `dist/esm/` — untouched source copies, fully tree-shakeable
- CJS build at `dist/cjs/` — auto-transformed `.cjs` files, no external tooling required
- Zero-dependency build script (`build.mjs`) using only Node built-ins (`fs`, `path`, `url`)
- Both import styles now work identically:
  ```js
  import { toCSV } from 'json2any'
  const { toCSV } = require('json2any')
  const json2any  = require('json2any')
  import * as json2any from 'json2any'
  ```


### Changed

- Package `"type"` remains `"module"` (ESM-first)
- Source files moved to `src/` and `src/core/`; published files are in `dist/`
- `"files"` field in `package.json` updated to publish only `dist/`, `LICENSE`, and `README.md`
- `streamJSONToCSV` now accepts an optional third argument `options.twoPass` — when `false` or omitted, behaviour is identical to previous versions (backward compatible)
- Package version bumped to `2.0.0`

### Fixed

- Streaming path no longer silently buffers all rows before writing — previous implementation held every flattened row in a `_flatRows` array until the source stream ended
- CommonJS consumers no longer receive `ERR_REQUIRE_ESM` when calling `require('json2any')`

---

## [1.0.0] - 2026-04-17

### Added

- Initial release
- `toCSV(data, opts)` — synchronous JSON to CSV conversion, in-memory
- `toCSVStream(source, opts)` — streaming JSON input to CSV readable stream
- `streamJSONToCSV(source, dest, opts)` — async pipeline, JSON stream to writable
- Iterative (non-recursive) object flattener using an explicit stack — no call-stack overflow on deeply nested documents
- Dot-notation keys for nested objects (`user.name`, `address.city.zip`)
- Pipe-separated array serialisation (`["a","b"]` → `a|b`)
- Excel-safe output: UTF-8 BOM, CRLF line endings, RFC-4180 quoting, formula injection defence (`=`, `+`, `-`, `@` prefixed with apostrophe)
- Heterogeneous schema support — header union collected across all rows, missing fields filled with empty string
- NDJSON and JSON array input both supported in streaming path
- Configurable delimiter, separator, BOM, and excelSafe options
