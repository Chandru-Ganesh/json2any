'use strict';

/**
 * bench/benchmark.js
 * Quick synthetic benchmark for flatten + CSV generation.
 *
 * Usage:
 *   node bench/benchmark.js [rows] [depth] [keys]
 *
 * Defaults: 100_000 rows, depth 3, 5 keys per level
 */

const { toCSV } = require('../index');

const ROWS  = parseInt(process.argv[2], 10) || 100_000;
const DEPTH = parseInt(process.argv[3], 10) || 3;
const KEYS  = parseInt(process.argv[4], 10) || 5;

// ── Generate synthetic nested data ──────────────────────────────────────────

function makeNestedObject(depth, keys) {
  if (depth === 0) return Math.random().toString(36).slice(2);
  const obj = {};
  for (let i = 0; i < keys; i++) {
    const key = `k${i}`;
    // Mix of scalars, arrays, and nested objects
    if (i % 3 === 0) {
      obj[key] = makeNestedObject(depth - 1, keys);
    } else if (i % 3 === 1) {
      obj[key] = [Math.random(), Math.random(), Math.random()];
    } else {
      obj[key] = `value_${Math.random().toString(36).slice(2)}`;
    }
  }
  return obj;
}

console.log(`Generating ${ROWS.toLocaleString()} rows (depth=${DEPTH}, keys/level=${KEYS})...`);
const genStart = process.hrtime.bigint();
const data = Array.from({ length: ROWS }, () => makeNestedObject(DEPTH, KEYS));
const genMs = Number(process.hrtime.bigint() - genStart) / 1e6;
console.log(`  Generation: ${genMs.toFixed(1)} ms`);

// Estimate raw data size
const sampleJson = JSON.stringify(data[0]);
const estimatedInputMB = ((sampleJson.length * ROWS) / 1024 / 1024).toFixed(1);
console.log(`  Estimated input size: ~${estimatedInputMB} MB\n`);

// ── Run benchmark ────────────────────────────────────────────────────────────

const RUNS = 3;
const results = [];

for (let run = 1; run <= RUNS; run++) {
  const start = process.hrtime.bigint();
  const csv = toCSV(data);
  const elapsed = Number(process.hrtime.bigint() - start) / 1e6;
  results.push(elapsed);

  const outputKB = (Buffer.byteLength(csv, 'utf8') / 1024).toFixed(1);
  console.log(`  Run ${run}: ${elapsed.toFixed(1)} ms  →  ${outputKB} KB output`);

  // Prevent GC from being too clever between runs
  global._csv = csv;
}

const avg = results.reduce((a, b) => a + b, 0) / results.length;
const throughputMBs = (parseFloat(estimatedInputMB) / (avg / 1000)).toFixed(1);

console.log(`\n  Average:    ${avg.toFixed(1)} ms`);
console.log(`  Throughput: ~${throughputMBs} MB/s (input-equivalent)`);
console.log(`  Rows/sec:   ~${Math.round(ROWS / (avg / 1000)).toLocaleString()}`);

// Memory snapshot
const mem = process.memoryUsage();
console.log(`\n  Heap used:  ${(mem.heapUsed / 1024 / 1024).toFixed(1)} MB`);
console.log(`  RSS:        ${(mem.rss / 1024 / 1024).toFixed(1)} MB`);
