

import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── File manifest ────────────────────────────────────────────────────────────
const FILES = [
  // Core utilities (no changes from V2)
  { src: 'src/core/flatten.js',        esmDest: 'dist/esm/core/flatten.js',        cjsDest: 'dist/cjs/core/flatten.cjs'        },
  { src: 'src/core/formatter.js',      esmDest: 'dist/esm/core/formatter.js',      cjsDest: 'dist/cjs/core/formatter.cjs'      },
  // V3 additions
  { src: 'src/core/parser.js',         esmDest: 'dist/esm/core/parser.js',         cjsDest: 'dist/cjs/core/parser.cjs'         },
  { src: 'src/core/twoPassWriter.js',  esmDest: 'dist/esm/core/twoPassWriter.js',  cjsDest: 'dist/cjs/core/twoPassWriter.cjs'  },
  // Updated csvWriter (routes twoPass)
  { src: 'src/core/csvWriter.js',      esmDest: 'dist/esm/core/csvWriter.js',      cjsDest: 'dist/cjs/core/csvWriter.cjs'      },
  // Public entry point
  { src: 'src/index.js',               esmDest: 'dist/esm/index.js',               cjsDest: 'dist/cjs/index.cjs'               },
];

// ─── ESM → CJS transformer ────────────────────────────────────────────────────

/**
 * Transform ESM source to CommonJS.
 *
 * Handles:
 *   • Named static imports (with optional `as` aliases)
 *   • Named export blocks at file bottom
 *   • Local path extension: .js → .cjs
 */
function toCJS(source) {
  let out = source;

  // 1. Transform static named imports
  //    import { X, Y as Z } from './path.js'
  //    → const { X, Y: Z } = require('./path.cjs')
  out = out.replace(
    /^import\s+\{([^}]+)\}\s+from\s+'([^']+)';?[ \t]*$/gm,
    (_, namedImports, specifier) => {
      // Convert ESM `as` rename syntax  →  CJS `:` rename syntax
      const cjsImports = namedImports.replace(/\b(\w+)\s+as\s+(\w+)/g, '$1: $2');
      // Local paths: swap .js → .cjs; built-ins / npm packages: unchanged
      const resolved   = specifier.startsWith('.')
        ? specifier.replace(/\.js$/, '.cjs')
        : specifier;
      return `const {${cjsImports}} = require('${resolved}');`;
    }
  );

  // 2. Transform named export block
  //    export { A, B, C };  →  module.exports = { A, B, C };
  out = out.replace(
    /^export\s+\{([^}]+)\};?[ \t]*$/gm,
    (_, named) => `module.exports = {${named}};`
  );

  // 3. Ensure 'use strict' — CJS is sloppy mode by default; ESM is always strict
  if (!/^\s*['"]use strict['"]/.test(out)) {
    out = `'use strict';\n\n${out}`;
  }

  return out;
}

// ─── Build runner ─────────────────────────────────────────────────────────────

let errors = 0;

// Create all output directories up front
mkdirSync('dist/esm/core',  { recursive: true });
mkdirSync('dist/cjs/core',  { recursive: true });
mkdirSync('dist/types',     { recursive: true });

console.log('\njson2any v3 — build\n');

for (const { src, esmDest, cjsDest } of FILES) {
  try {
    const source = readFileSync(src, 'utf8');

    // ESM: verbatim copy — preserves tree-shaking
    writeFileSync(esmDest, source, 'utf8');

    // CJS: transformed copy
    writeFileSync(cjsDest, toCJS(source), 'utf8');

    console.log(`  ✓  ${src.padEnd(34)} → esm + cjs`);
  } catch (err) {
    console.error(`  ✗  ${src}: ${err.message}`);
    errors++;
  }
}

// TypeScript definitions — copy to dist/types/
try {
  copyFileSync('src/index.d.ts', 'dist/types/index.d.ts');
  console.log(`  ✓  ${'src/index.d.ts'.padEnd(34)} → dist/types/index.d.ts`);
} catch (err) {
  console.error(`  ✗  src/index.d.ts: ${err.message}`);
  errors++;
}

if (errors > 0) {
  console.error(`\nBuild failed with ${errors} error(s).\n`);
  process.exit(1);
} else {
  console.log('\n  Build complete. dist/ is ready.\n');
}
