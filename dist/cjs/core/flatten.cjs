'use strict';


/**
 * Iterative JSON flattener using an explicit stack.
 *
 * Why iterative instead of recursive?
 *  - No call-stack overflow on deeply nested documents (>10k levels)
 *  - V8 optimises tight while-loops better than recursive calls
 *  - Easier to reason about memory usage: one stack array, O(depth) extra space
 *
 * Complexity: O(k) where k = total number of leaf values across the object tree.
 * For a document with n top-level rows each of depth d and width w: O(n * d * w).
 */

/**
 * Flatten a single object into a 1-level map with dot-notation keys.
 *
 * @param {Record<string, unknown>} obj   - Source object (may be deeply nested)
 * @param {string}                  sep   - Key separator (default ".")
 * @returns {Record<string, string>}      - Flat key → string-value map
 */
function flattenObject(obj, sep = '.') {
  const out = Object.create(null); // plain hash, no prototype overhead

  // Stack entries: [currentObject, keyPrefix]
  // We pre-allocate a modest fixed array; JS engines keep this in contiguous memory.
  const stack = [[obj, '']];

  while (stack.length > 0) {
    const [node, prefix] = stack.pop();

    const keys = Object.keys(node);
    // Iterate in reverse so that when we push children back they come out
    // in the original order when popped (LIFO reversal cancels itself).
    for (let i = keys.length - 1; i >= 0; i--) {
      const key = keys[i];
      const fullKey = prefix ? `${prefix}${sep}${key}` : key;
      const val = node[key];

      if (val !== null && typeof val === 'object') {
        if (Array.isArray(val)) {
          // Arrays → pipe-separated leaf string; we do NOT recurse into them.
          out[fullKey] = serializeArray(val);
        } else if (val instanceof Date) {
          out[fullKey] = val.toISOString();
        } else {
          // Plain object → push onto stack for further flattening
          stack.push([val, fullKey]);
        }
      } else {
        out[fullKey] = serializeScalar(val);
      }
    }
  }

  return out;
}

/**
 * Serialize a scalar value to its string representation.
 * Guarantees no "[object Object]" leaks.
 */
function serializeScalar(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (val instanceof Date) return val.toISOString();
  // Numbers, strings, bigints
  return String(val);
}

/**
 * Serialize an array (possibly nested) to a pipe-separated string.
 * Nested arrays are flattened to 1-D before joining.
 * Objects inside arrays are JSON-stringified as a fallback.
 */
function serializeArray(arr) {
  const parts = [];
  // Iterative depth-first traversal of potentially nested arrays
  const stack = [arr];
  while (stack.length > 0) {
    const current = stack.pop();
    if (Array.isArray(current)) {
      // Push children in reverse order to maintain left-to-right output
      for (let i = current.length - 1; i >= 0; i--) {
        stack.push(current[i]);
      }
    } else if (current !== null && typeof current === 'object') {
      if (current instanceof Date) {
        parts.push(current.toISOString());
      } else {
        // Embedded object in array → compact JSON (prevents [object Object])
        parts.push(JSON.stringify(current));
      }
    } else {
      parts.push(serializeScalar(current));
    }
  }
  return parts.join('|');
}

/**
 * Collect the union of all keys across a collection of flat objects.
 * Returns keys in stable insertion order (first-seen wins).
 *
 * Uses a Map (ordered) instead of a Set so we preserve order without a sort.
 *
 * @param {Iterable<Record<string, string>>} flatRows
 * @returns {string[]}
 */
function collectHeaders(flatRows) {
  const seen = new Map(); // key → index (for O(1) lookup)
  for (const row of flatRows) {
    const keys = Object.keys(row);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (!seen.has(k)) seen.set(k, seen.size);
    }
  }
  return [...seen.keys()];
}

module.exports = {
  flattenObject,
  collectHeaders,
  serializeScalar,
  serializeArray
};