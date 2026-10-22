// Procedural world from a seed: elevation, moisture, biomes, rivers.
import { mulberry32 } from "./rng.ts";
import { BIOME, type World } from "./world.ts";
import {
  MAP_W, MAP_H, ELEV_SCALE, MOIST_SCALE, OCTAVES, EDGE_FALLOFF, WATER_LEVEL, SAND_LEVEL,
  HILL_LEVEL, MOUNTAIN_LEVEL, FIELD_MOIST, FOREST_MOIST,
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

  return {
    seed, w, h, elev, moist, biome, water,
    river: new Uint8Array(w * h),
    flow: new Int32Array(w * h).fill(-1),
    rivers: 0,
  };
}

// ?seed=42 → 42; missing, zero, negative or garbage → 1, so the map always builds.
export function seedFromQuery(qs: string): number {
  const raw = new URLSearchParams(qs).get("seed");
  const n = raw === null ? NaN : Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}
