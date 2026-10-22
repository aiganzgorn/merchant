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

// --- terrain, moisture, biomes -----------------------------------------------
import { generateWorld, seedFromQuery } from "../src/gen.ts";
import { BIOME, idx } from "../src/world.ts";
import { MAP_W, MAP_H } from "../src/config.ts";

const seedA = generateWorld(42), seedB = generateWorld(42);
assert.deepEqual(seedA.biome, seedB.biome, "один seed — один рельеф");
assert.deepEqual(seedA.elev, seedB.elev, "и одна высота");
assert.notDeepEqual(generateWorld(43).biome, seedA.biome, "другой seed — другой мир");
assert.equal(seedA.biome.length, MAP_W * MAP_H, "карта 512×512");

const share = (v) => Array.from(seedA.biome).filter(x => x === v).length / seedA.biome.length;
assert.ok(share(BIOME.water) > 0.05 && share(BIOME.water) < 0.6, `воды ${(share(BIOME.water) * 100).toFixed(0)}%`);
for (let i = 0; i < seedA.elev.length; i++) {
  const v = seedA.elev[i];
  assert.ok(Number.isFinite(v) && v >= 0 && v <= 1, `высота ${v} в 0..1`);
}

// every land biome shows up somewhere across the first five seeds
const seen = new Set();
for (let s = 1; s <= 5; s++) for (const v of generateWorld(s).biome) seen.add(v);
for (const v of [BIOME.water, BIOME.sand, BIOME.steppe, BIOME.field, BIOME.forest, BIOME.hill, BIOME.mountain]) {
  assert.ok(seen.has(v), `биом ${v} встречается`);
}

// the map edge is ocean, so the world does not run into a wall
for (let x = 0; x < MAP_W; x++) {
  assert.equal(seedA.biome[idx(seedA, x, 0)], BIOME.water, "верхний край — вода");
  assert.equal(seedA.biome[idx(seedA, x, MAP_H - 1)], BIOME.water, "нижний край — вода");
}
for (let y = 0; y < MAP_H; y++) {
  assert.equal(seedA.biome[idx(seedA, 0, y)], BIOME.water, "левый край — вода");
  assert.equal(seedA.biome[idx(seedA, MAP_W - 1, y)], BIOME.water, "правый край — вода");
}

assert.equal(seedFromQuery(""), 1, "без seed — 1");
assert.equal(seedFromQuery("?seed=7"), 7, "число из строки");
assert.equal(seedFromQuery("?seed=abc"), 1, "мусор — запасной seed");
assert.equal(seedFromQuery("?seed=-4"), 1, "отрицательный — запасной seed");
assert.equal(seedFromQuery("?seed=0"), 1, "ноль — запасной seed");

console.log(`ok — рельеф: воды ${(share(BIOME.water) * 100).toFixed(0)}%, биомы все`);
