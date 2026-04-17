'use strict';

/**
 * examples/usage.js
 * Demonstrates the full API surface of jsonify-csv.
 * Run with:  node examples/usage.js
 */

import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { toCSV, toCSVStream, streamJSONToCSV } from './index.js';
// ─────────────────────────────────────────────────────────────────────────────
// Example 1 — Simple flat array
// ─────────────────────────────────────────────────────────────────────────────
console.log('── Example 1: flat array ───────────────────────────────────');
const flat = [
  { id: 1, name: 'Alice', role: 'Engineer' },
  { id: 2, name: 'Bob',   role: 'Designer' },
];
console.log(toCSV(flat));

// ─────────────────────────────────────────────────────────────────────────────
// Example 2 — Nested objects (dot notation)
// ─────────────────────────────────────────────────────────────────────────────
console.log('── Example 2: nested objects ───────────────────────────────');
const nested = [
  {
    id: 1,
    user: { name: 'Alice', address: { city: 'London', zip: 'EC1A' } },
    active: true,
  },
  {
    id: 2,
    user: { name: 'Bob', address: { city: 'New York' } }, // missing zip
    active: false,
  },
];
console.log(toCSV(nested));
// Expected headers: id,user.name,user.address.city,user.address.zip,active

// ─────────────────────────────────────────────────────────────────────────────
// Example 3 — Arrays as pipe-separated values
// ─────────────────────────────────────────────────────────────────────────────
console.log('── Example 3: arrays ───────────────────────────────────────');
const withArrays = [
  { name: 'Alice', tags: ['admin', 'editor'], scores: [95, 87, 100] },
  { name: 'Bob',   tags: ['viewer'],          scores: [60] },
];
console.log(toCSV(withArrays));

// ─────────────────────────────────────────────────────────────────────────────
// Example 4 — Special characters & Excel formula injection
// ─────────────────────────────────────────────────────────────────────────────
console.log('── Example 4: special chars & formula injection ─────────────');
const nasty = [
  { name: 'O\'Brien, Jr.', note: 'Says "hello"', formula: '=SUM(A1:A10)' },
  { name: 'Line\nBreak',   note: 'Tab\there',    formula: '+malicious()' },
];
console.log(toCSV(nasty));

// ─────────────────────────────────────────────────────────────────────────────
// Example 5 — Date handling
// ─────────────────────────────────────────────────────────────────────────────
console.log('── Example 5: dates ────────────────────────────────────────');
const withDates = [
  { name: 'Alice', joinedAt: new Date('2023-03-15T10:00:00Z') },
  { name: 'Bob',   joinedAt: new Date('2024-01-01T00:00:00Z') },
];
console.log(toCSV(withDates));

// ─────────────────────────────────────────────────────────────────────────────
// Example 6 — Custom options
// ─────────────────────────────────────────────────────────────────────────────
console.log('── Example 6: custom options (semicolon delimiter) ──────────');
const euroData = [{ name: 'Müller', amount: 1234.56, city: 'München' }];
console.log(toCSV(euroData, { delimiter: ';', bom: false }));

// ─────────────────────────────────────────────────────────────────────────────
// Example 7 — Missing / null / undefined fields (sparse rows)
// ─────────────────────────────────────────────────────────────────────────────
console.log('── Example 7: sparse rows ──────────────────────────────────');
const sparse = [
  { a: 1, b: 'hello', c: true },
  { a: 2,             c: false, d: 'extra' }, // missing b, extra d
  {       b: 'world'           },              // only b
];
console.log(toCSV(sparse));

// ─────────────────────────────────────────────────────────────────────────────
// Example 8 — Stream API (in-memory Readable → stdout)
// ─────────────────────────────────────────────────────────────────────────────
console.log('── Example 8: stream API ────────────────────────────────────');
const jsonString = JSON.stringify([
  { product: 'Widget A', price: 9.99,  qty: 100 },
  { product: 'Widget B', price: 19.99, qty: 50  },
]);

const source = Readable.from([Buffer.from(jsonString)]);
const csvStream = toCSVStream(source, { bom: false });

process.stdout.write('Stream output:\n');
csvStream.on('data', (chunk) => process.stdout.write(chunk));
csvStream.on('end', () => {
  console.log('\n── All examples complete ────────────────────────────────────\n');
});
