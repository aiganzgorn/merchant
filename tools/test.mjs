// Headless self-check of the pure core: no DOM, no canvas.
import assert from "node:assert/strict";

// --- rng ---------------------------------------------------------------------
import { mulberry32, int } from "../src/rng.ts";

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

const a = mulberry32(42), b = mulberry32(42);
const seqA = Array.from({ length: 8 }, a), seqB = Array.from({ length: 8 }, b);
assert.deepEqual(seqA, seqB, "один seed — одна последовательность");
for (const v of seqA) assert.ok(v >= 0 && v < 1, `значение ${v} в [0,1)`);
assert.notDeepEqual(seqA, Array.from({ length: 8 }, mulberry32(43)), "другой seed — другая");

const r = mulberry32(1);
for (let i = 0; i < 200; i++) {
  const v = int(r, 7);
  assert.ok(Number.isInteger(v) && v >= 0 && v < 7, `int даёт 0..6, а не ${v}`);
}

console.log("ok — rng: детерминизм и диапазон");
