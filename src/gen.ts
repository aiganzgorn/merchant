// Procedural world from a seed: elevation, moisture, biomes, rivers.
import { mulberry32, int } from "./rng.ts";
import { BIOME, type World } from "./world.ts";
import {
  MAP_W, MAP_H, ELEV_SCALE, MOIST_SCALE, OCTAVES, EDGE_FALLOFF, WATER_LEVEL, SAND_LEVEL,
  HILL_LEVEL, MOUNTAIN_LEVEL, FIELD_MOIST, FOREST_MOIST,
  RIVER_COUNT, RIVER_SOURCE_MIN, RIVER_MAX_LEN, LAKE_DEPTH, RIVER_MIN_LEN,
} from "./config.ts";

const smooth = (t: number): number => t * t * (3 - 2 * t);

// A deterministic integer hash, so noise needs no global state.
function hash2(seed: number, x: number, y: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(seed: number, x: number, y: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = smooth(x - x0), fy = smooth(y - y0);
  const a = hash2(seed, x0, y0), b = hash2(seed, x0 + 1, y0);
  const c = hash2(seed, x0, y0 + 1), d = hash2(seed, x0 + 1, y0 + 1);
  const top = a + (b - a) * fx, bottom = c + (d - c) * fx;
  return top + (bottom - top) * fy;
}

// Octave-summed value noise in 0..1; `scale` is the width of the first octave in tiles.
function fbm(seed: number, x: number, y: number, scale: number, octaves: number): number {
  let sum = 0, norm = 0, amp = 1, freq = 1 / scale;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(seed + i * 101, x * freq, y * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

function normalize(values: Float32Array): void {
  let min = Infinity, max = -Infinity;
  for (const v of values) { if (v < min) min = v; if (v > max) max = v; }
  const span = max - min || 1;
  for (let i = 0; i < values.length; i++) values[i] = (values[i] - min) / span;
}

export function generateWorld(seed: number): World {
  const rng = mulberry32(seed);
  const w = MAP_W, h = MAP_H;
  const elev = new Float32Array(w * h);
  const moist = new Float32Array(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      elev[y * w + x] = fbm(seed, x, y, ELEV_SCALE, OCTAVES);
      moist[y * w + x] = fbm(seed + 1000, x, y, MOIST_SCALE, OCTAVES);
    }
  }
  normalize(elev);
  normalize(moist);

  // The rim sinks into ocean, so the world always has a coast and no wall.
  const edge = EDGE_FALLOFF * Math.min(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.min(x, y, w - 1 - x, h - 1 - y) / edge;
      const f = Math.min(1, Math.max(0, d));
      elev[y * w + x] *= 0.35 + 0.65 * smooth(f);
    }
  }

  const biome = new Uint8Array(w * h);
  const water = new Uint8Array(w * h);
  for (let i = 0; i < elev.length; i++) {
    const e = elev[i], m = moist[i];
    let b: number;
    if (e < WATER_LEVEL) b = BIOME.water;
    else if (e < WATER_LEVEL + SAND_LEVEL) b = BIOME.sand;
    else if (e > MOUNTAIN_LEVEL) b = BIOME.mountain;
    else if (e > HILL_LEVEL) b = BIOME.hill;
    else if (m > FIELD_MOIST) b = BIOME.field;
    else if (m > FOREST_MOIST) b = BIOME.forest;
    else b = BIOME.steppe;
    biome[i] = b;
    water[i] = b === BIOME.water ? 1 : 0;
  }

  // Drainage: fill every depression (priority flood) so all land drains to water.
  const filled = Float32Array.from(elev);
  const dir = new Int32Array(w * h).fill(-1);
  const visited = new Uint8Array(w * h);
  const BUCKETS = 4096;
  const buckets: number[][] = Array.from({ length: BUCKETS }, () => []);
  const bucketOf = (v: number): number => Math.min(BUCKETS - 1, Math.max(0, Math.round(v * (BUCKETS - 1))));

  for (let i = 0; i < water.length; i++) {
    if (!water[i]) continue;
    visited[i] = 1;
    buckets[bucketOf(filled[i])].push(i);
  }
  let cursor = 0;
  while (true) {
    while (cursor < BUCKETS && buckets[cursor].length === 0) cursor++;
    if (cursor >= BUCKETS) break;
    const i = buckets[cursor].pop()!;
    const x = i % w, y = (i / w) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (visited[j]) continue;
        visited[j] = 1;
        filled[j] = Math.max(elev[j], filled[i]);   // a pit fills up to its outlet
        dir[j] = i;
        buckets[bucketOf(filled[j])].push(j);
      }
    }
  }

  // Deep pits hold standing water; shallow ones are just damp ground on a river's way.
  let lakes = 0;
  for (let i = 0; i < water.length; i++) {
    if (water[i] || filled[i] - elev[i] <= LAKE_DEPTH) continue;
    water[i] = 1;
    biome[i] = BIOME.water;
    lakes++;
  }

  // Rivers: walk the drainage tree down from a high source until it reaches water.
  const river = new Uint8Array(w * h);
  const flow = new Int32Array(w * h).fill(-1);
  let rivers = 0;

  for (let attempt = 0; attempt < RIVER_COUNT; attempt++) {
    let cur = -1;
    for (let tries = 0; tries < 200; tries++) {
      const sx = 1 + int(rng, w - 2), sy = 1 + int(rng, h - 2);
      const i = sy * w + sx;
      if (!water[i] && elev[i] >= RIVER_SOURCE_MIN) { cur = i; break; }
    }
    if (cur < 0) continue;

    let len = 0;
    while (len < RIVER_MAX_LEN && !water[cur]) {
      river[cur] = 1;
      const next = dir[cur];
      if (next < 0) break;
      flow[cur] = next;
      cur = next;
      len++;
    }
    if (len > RIVER_MIN_LEN) rivers++;
    // a river that hits the cap must still end in water, never in the middle of land
    if (len >= RIVER_MAX_LEN && cur >= 0 && !water[cur]) {
      water[cur] = 1;
      biome[cur] = BIOME.water;
      lakes++;
    }
  }

  return { seed, w, h, elev, filled, moist, biome, water, river, flow, rivers, lakes };
}

// ?seed=42 → 42; missing, zero, negative or garbage → 1, so the map always builds.
export function seedFromQuery(qs: string): number {
  const raw = new URLSearchParams(qs).get("seed");
  const n = raw === null ? NaN : Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}
