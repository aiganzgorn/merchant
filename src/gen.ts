// Procedural world from a seed: elevation, mountain seams, moisture, biomes, rivers.
import { mulberry32 } from "./rng.ts";
import { BIOME, type World } from "./world.ts";
import {
  MAP_W, MAP_H, ELEV_SCALE, MOIST_SCALE, OCTAVES, EDGE_FALLOFF, SAND_LEVEL,
  HILL_LEVEL, MOUNTAIN_LEVEL, FIELD_MOIST, FOREST_MOIST, LAND_SHARE,
  PLATE_GRID, PLATE_JITTER, PLATE_WARP, PLATE_SEAM, PLATE_SCALE, PLATE_PEAKS, RIDGE_HEIGHT,
  RIVER_COUNT, RIVER_MIN_CATCHMENT, RIVER_MAX_LEN, LAKE_SHARE, LAKE_MIN_AREA, RIVER_MIN_LEN,
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
  const n = w * h;
  const elev = new Float32Array(n);
  const moist = new Float32Array(n);

  // Tectonic plates: a jittered grid of seeds. Mountains rise along their seams.
  const plates: number[] = [];
  for (let gy = 0; gy < PLATE_GRID; gy++) {
    for (let gx = 0; gx < PLATE_GRID; gx++) {
      const cx = (gx + 0.5 + (rng() - 0.5) * PLATE_JITTER) * (w / PLATE_GRID);
      const cy = (gy + 0.5 + (rng() - 0.5) * PLATE_JITTER) * (h / PLATE_GRID);
      plates.push(cx, cy);
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      // the seam line is curved by a slow noise, so ranges wind instead of ruling straight
      const wx = x + (fbm(seed + 2000, x, y, PLATE_SCALE, OCTAVES) - 0.5) * PLATE_WARP;
      const wy = y + (fbm(seed + 3000, x, y, PLATE_SCALE, OCTAVES) - 0.5) * PLATE_WARP;

      let d1 = Infinity, d2 = Infinity;
      for (let p = 0; p < plates.length; p += 2) {
        const dx = wx - plates[p], dy = wy - plates[p + 1];
        const d = dx * dx + dy * dy;
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
      }
      // distance to the nearest seam: zero on the border between two plates
      const gap = Math.sqrt(d2) - Math.sqrt(d1);
      const seam = Math.exp(-((gap / PLATE_SEAM) ** 2));
      // saddles: where the peak noise dips, the ridge opens into a pass
      const crest = 0.55 + 0.75 * fbm(seed + 5000, x, y, PLATE_PEAKS, 3);

      const base = fbm(seed, x, y, ELEV_SCALE, OCTAVES);
      const lift = 0.35 + 0.65 * fbm(seed + 4000, x, y, ELEV_SCALE * 0.6, OCTAVES);
      elev[i] = base * (1 - RIDGE_HEIGHT) + RIDGE_HEIGHT * Math.min(1, seam * crest) * lift;
      moist[i] = fbm(seed + 1000, x, y, MOIST_SCALE, OCTAVES);
    }
  }
  normalize(elev);
  normalize(moist);

  // The rim sinks into ocean, so the world has a coast and no wall.
  const edge = EDGE_FALLOFF * Math.min(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = (Math.min(x, y, w - 1 - x, h - 1 - y) - 1) / edge;
      const f = Math.min(1, Math.max(0, d));
      elev[y * w + x] *= smooth(f) ** 2;
    }
  }

  // Land share decides the water line, so the ocean only hugs the rim.
  const sorted = Float32Array.from(elev).sort();
  const waterLevel = sorted[Math.min(n - 1, Math.floor(n * (1 - LAND_SHARE)))];
  // biome thresholds are read as "how far from water to peak"
  const above = (v: number): number => waterLevel + v * (1 - waterLevel);

  const biome = new Uint8Array(n);
  const water = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const e = elev[i], m = moist[i];
    let b: number;
    if (e <= waterLevel) b = BIOME.water;
    else if (e <= above(SAND_LEVEL)) b = BIOME.sand;
    else if (e > above(MOUNTAIN_LEVEL)) b = BIOME.mountain;
    else if (e > above(HILL_LEVEL)) b = BIOME.hill;
    else if (m > FIELD_MOIST) b = BIOME.field;
    else if (m > FOREST_MOIST) b = BIOME.forest;
    else b = BIOME.steppe;
    biome[i] = b;
    water[i] = b === BIOME.water ? 1 : 0;
  }

  // Drainage: fill every depression (priority flood) so all land drains to water.
  const filled = Float32Array.from(elev);
  const dir = new Int32Array(n).fill(-1);
  const visited = new Uint8Array(n);
  const BUCKETS = 4096;
  const buckets: number[][] = Array.from({ length: BUCKETS }, () => []);
  const bucketOf = (v: number): number => Math.min(BUCKETS - 1, Math.max(0, Math.round(v * (BUCKETS - 1))));

  for (let i = 0; i < n; i++) {
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

  // Lakes: every depression is a basin; the deepest basins fill with water up to a budget.
  // Marking the whole basin (not just its deepest tiles) keeps rivers out of the flat
  // bottoms, where the drainage tree would otherwise serpentine across the whole plain.
  const EPS = 1e-6;
  const depression = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!water[i] && filled[i] - elev[i] > EPS) depression[i] = 1;
  }

  const seen = new Uint8Array(n);
  const stack: number[] = [];
  const bodies: { tiles: number[]; depth: number }[] = [];
  for (let start = 0; start < n; start++) {
    if (!depression[start] || seen[start]) continue;
    stack.length = 0;
    stack.push(start);
    seen[start] = 1;
    const body: number[] = [];
    let depth = 0;
    while (stack.length) {
      const j = stack.pop()!;
      body.push(j);
      const d = filled[j] - elev[j];
      if (d > depth) depth = d;
      const x = j % w, y = (j / w) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const k = ny * w + nx;
          if (depression[k] && !seen[k]) { seen[k] = 1; stack.push(k); }
        }
      }
    }
    if (body.length >= LAKE_MIN_AREA) bodies.push({ tiles: body, depth });
  }

  let land = 0;
  for (let i = 0; i < n; i++) if (!water[i]) land++;
  bodies.sort((a, b) => b.depth - a.depth || a.tiles[0] - b.tiles[0]);

  let lakes = 0;
  const lakeBudget = Math.floor(n * LAKE_SHARE);
  for (const body of bodies) {
    if (lakes >= lakeBudget) break;
    for (const j of body.tiles) { water[j] = 1; biome[j] = BIOME.water; }
    lakes += body.tiles.length;
  }

  // River network: one trunk per outlet. Tributaries merge instead of running parallel,
  // and each trunk is the heaviest branch, so the map shows real catchments.
  const head = new Int32Array(n).fill(-1);
  const sibling = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    const d = dir[i];
    if (d < 0) continue;
    sibling[i] = head[d];
    head[d] = i;
  }

  const height = new Int32Array(n);     // longest path from a source down to this tile
  const catchment = new Int32Array(n);  // land tiles draining through this tile
  const order: number[] = [];
  const queued = new Uint8Array(n);
  // Lakes turned to water after the drainage tree was built, so a lake tile is both an
  // outlet seed and somebody's child. Visit each tile once, or the walk doubles without end.
  for (let i = 0; i < n; i++) if (water[i]) { order.push(i); queued[i] = 1; }
  for (let k = 0; k < order.length; k++) {
    for (let c = head[order[k]]; c >= 0; c = sibling[c]) {
      if (queued[c]) continue;
      queued[c] = 1;
      order.push(c);
    }
  }
  for (let k = order.length - 1; k >= 0; k--) {
    const i = order[k];
    let h = 0, size = water[i] ? 0 : 1;
    for (let c = head[i]; c >= 0; c = sibling[c]) {
      if (height[c] + 1 > h) h = height[c] + 1;
      size += catchment[c];
    }
    height[i] = h;
    catchment[i] = size;
  }

  // outlets: coastal tiles with enough land behind them, the biggest first
  const outlets: number[] = [];
  for (let i = 0; i < n; i++) {
    if (water[i]) continue;
    const d = dir[i];
    if (d >= 0 && water[d] && catchment[i] >= RIVER_MIN_CATCHMENT) outlets.push(i);
  }
  outlets.sort((a, b) => catchment[b] - catchment[a] || a - b);

  // Rivers: one trunk per outlet, drawn downstream from its longest branch. Plateaus and
  // hollows are crossed in a straight line from inlet to spill point — following the
  // drainage tree there would snake back and forth and fill a whole district with river.
  const basinId = new Int32Array(n).fill(-1);
  const basinExit: number[] = [];
  {
    const mark = new Int32Array(n);
    let token = 0;
    const flatSeen = new Uint8Array(n);
    for (let start = 0; start < n; start++) {
      if (flatSeen[start] || water[start]) continue;
      const base = filled[start];
      const body: number[] = [];
      stack.length = 0;
      stack.push(start);
      flatSeen[start] = 1;
      while (stack.length) {
        const j = stack.pop()!;
        body.push(j);
        const x = j % w, y = (j / w) | 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const k = ny * w + nx;
            if (flatSeen[k] || water[k]) continue;
            if (Math.abs(filled[k] - base) > 2e-6) continue;
            flatSeen[k] = 1;
            stack.push(k);
          }
        }
      }
      if (body.length < 8) continue;            // a few tiles are not worth a shortcut

      token++;
      for (const j of body) mark[j] = token;
      let exitTile = -1, bestCatch = -1;
      for (const j of body) {
        const d = dir[j];
        if (d < 0 || mark[d] === token) continue;   // water leaves here, not inside
        if (catchment[j] > bestCatch) { bestCatch = catchment[j]; exitTile = j; }
      }
      if (exitTile < 0) continue;

      const id = basinExit.length;
      basinExit.push(exitTile);
      for (const j of body) basinId[j] = id;
    }
  }

  const river = new Uint8Array(n);
  const flow = new Int32Array(n).fill(-1);
  const streamSize = new Int32Array(n);
  let rivers = 0;
  let riverLength = 0;

  const span = (a: number, b: number): number => {
    const dx = Math.abs((a % w) - (b % w));
    const dy = Math.abs(((a / w) | 0) - ((b / w) | 0));
    return Math.max(dx, dy);
  };

  for (const outlet of outlets.slice(0, RIVER_COUNT)) {
    let src = outlet;
    for (;;) {
      let next = -1, bestH = -1;
      for (let c = head[src]; c >= 0; c = sibling[c]) {
        if (height[c] > bestH) { bestH = height[c]; next = c; }
      }
      if (next < 0) break;
      src = next;
    }

    let cur = src;
    let len = 0;
    while (len < RIVER_MAX_LEN && !water[cur]) {
      const b = basinId[cur];
      let next = b >= 0 ? basinExit[b] : dir[cur];
      if (next === cur) next = dir[cur];    // already at the spill point: just flow out
      if (next < 0 || next === cur) break;
      river[cur] = 1;
      streamSize[cur] = catchment[cur];
      flow[cur] = next;
      len += Math.max(1, span(cur, next));
      cur = next;
    }
    if (len > RIVER_MIN_LEN) { rivers++; riverLength += len; }
  }

  return { seed, w, h, elev, filled, moist, biome, water, river, flow, streamSize, rivers, riverLength, lakes, waterLevel };
}

// ?seed=42 → 42; missing, zero, negative or garbage → 1, so the map always builds.
export function seedFromQuery(qs: string): number {
  const raw = new URLSearchParams(qs).get("seed");
  const n = raw === null ? NaN : Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}
