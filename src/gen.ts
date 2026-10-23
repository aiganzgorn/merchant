// Procedural world from a seed: elevation, mountain seams, moisture, biomes, rivers.
import { mulberry32, int, type Rng } from "./rng.ts";
import { BIOME, POI, RESOURCE, type World, type Poi, type Settlement } from "./world.ts";
import {
  MAP_W, MAP_H, ELEV_SCALE, MOIST_SCALE, OCTAVES, EDGE_FALLOFF, SAND_LEVEL,
  HILL_LEVEL, MOUNTAIN_LEVEL, FIELD_MOIST, FOREST_MOIST, LAND_SHARE,
  COAST_SCALE, COAST_WARP,
  PLATE_GRID, PLATE_JITTER, PLATE_WARP, PLATE_SEAM, PLATE_SCALE, PLATE_PEAKS, RIDGE_HEIGHT,
  PLATE_PASS, PLATE_PASS_WIDTH,
  RIVER_COUNT, RIVER_MIN_CATCHMENT, RIVER_MEANDER, RIVER_MEANDER_SCALE,
  LAKE_SHARE, LAKE_MAX_RISE, LAKE_MIN_AREA, RIVER_MIN_LEN,
  POI_COUNTS, POI_MIN_GAP, POI_BIOMES, SETTLEMENT_COUNT, SETTLEMENT_REACH,
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

// Place points of interest on valid biomes, then scatter first settlements near
// fishing or logging POIs. Mines are hidden until discovered; everything else is known.
function placePoi(rng: Rng, seed: number, biome: Uint8Array, water: Uint8Array, w: number, h: number): { poi: Poi[]; settlements: Settlement[] } {
  const poi: Poi[] = [];
  const n = w * h;

  for (let kind: number = POI.logging; kind <= POI.mine; kind++) {
    const count = POI_COUNTS[kind] ?? 0;
    const allowed = POI_BIOMES[kind];
    if (!count || !allowed) continue;

    let placed = 0;
    for (let attempt = 0; attempt < count * 40 && placed < count; attempt++) {
      const i = int(rng, n);
      const x = i % w;
      const y = (i / w) | 0;
      if (!allowed.includes(biome[i])) continue;

      let tooClose = false;
      for (const p of poi) {
        if (p.kind !== kind) continue;
        if (Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) < POI_MIN_GAP) { tooClose = true; break; }
      }
      if (tooClose) continue;

      let resource: number, known: boolean;
      if (kind === POI.mine) {
        const ore = fbm(seed + 9100, x, y, 40, 2);
        resource = ore < 1 / 3 ? RESOURCE.copper : ore < 2 / 3 ? RESOURCE.iron : RESOURCE.silver;
        known = false;
      } else {
        resource = kind; // logging..quarry map 1:1 to wood..stone
        known = true;
      }

      poi.push({ kind, resource, x, y, yield: 0.45 + rng() * 0.55, reserve: 160 + Math.floor(rng() * 640), known });
      placed++;
    }
  }

  const settlements: Settlement[] = [];
  const anchors = poi.filter(p => p.kind === POI.fishing || p.kind === POI.logging);
  for (let s = 0; s < SETTLEMENT_COUNT; s++) {
    if (anchors.length === 0) break;
    const base = anchors[int(rng, anchors.length)];
    const options: Settlement[] = [];
    for (let dy = -SETTLEMENT_REACH; dy <= SETTLEMENT_REACH; dy++) {
      for (let dx = -SETTLEMENT_REACH; dx <= SETTLEMENT_REACH; dx++) {
        const nx = base.x + dx, ny = base.y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (water[ny * w + nx]) continue;
        options.push({ x: nx, y: ny });
      }
    }
    if (options.length === 0) continue;
    settlements.push(options[int(rng, options.length)]);
  }

  return { poi, settlements };
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
      // Saddles: where the crest noise dips the range is cut by a pass, so it never walls
      // one region off from its neighbour. Away from the dip the ridge keeps its old height.
      const peaks = fbm(seed + 5000, x, y, PLATE_PEAKS, 3);
      const pass = smooth(Math.min(1, Math.max(0, (peaks - PLATE_PASS) / PLATE_PASS_WIDTH)));
      const crest = (0.55 + 0.75 * peaks) * pass;

      const base = fbm(seed, x, y, ELEV_SCALE, OCTAVES);
      const lift = 0.35 + 0.65 * fbm(seed + 4000, x, y, ELEV_SCALE * 0.6, OCTAVES);
      elev[i] = base * (1 - RIDGE_HEIGHT) + RIDGE_HEIGHT * Math.min(1, seam * crest) * lift;
      moist[i] = fbm(seed + 1000, x, y, MOIST_SCALE, OCTAVES);
    }
  }
  normalize(elev);
  normalize(moist);

  // The rim sinks into ocean, so the world has a coast and no wall. The shoreline wanders
  // with the noise, so the land is not a rectangle: bays, headlands and a ragged coast.
  const edge = EDGE_FALLOFF * Math.min(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const raw = Math.min(x, y, w - 1 - x, h - 1 - y);
      const wx = x + (fbm(seed + 6000, x, y, COAST_SCALE, 3) - 0.5) * COAST_WARP;
      const wy = y + (fbm(seed + 7000, x, y, COAST_SCALE, 3) - 0.5) * COAST_WARP;
      const moved = Math.min(wx, wy, w - 1 - wx, h - 1 - wy);
      const d = raw <= 1 ? -1 : (moved - 1) / edge;   // the outer two rows always sink
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

  // Drainage runs on a slightly roughened copy of the height. On a perfectly smooth slope
  // steepest descent picks the same diagonal every tile, and rivers come out ruler-straight.
  const rain = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i % w, y = (i / w) | 0;
    rain[i] = elev[i] + (fbm(seed + 8000, x, y, RIVER_MEANDER_SCALE, 2) - 0.5) * RIVER_MEANDER;
  }

  // Drainage: fill every depression (priority flood) so all land drains to water.
  const filled = Float32Array.from(rain);
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
        filled[j] = Math.max(rain[j], filled[i]);   // a pit fills up to its outlet
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
    if (!water[i] && filled[i] - rain[i] > EPS) depression[i] = 1;
  }

  const seen = new Uint8Array(n);
  const stack: number[] = [];
  const bodies: { tiles: number[]; depth: number; spill: number }[] = [];
  for (let start = 0; start < n; start++) {
    if (!depression[start] || seen[start]) continue;
    stack.length = 0;
    stack.push(start);
    seen[start] = 1;
    const body: number[] = [];
    let depth = 0, spill = 0;
    while (stack.length) {
      const j = stack.pop()!;
      body.push(j);
      const d = filled[j] - elev[j];
      if (d > depth) depth = d;
      if (filled[j] > spill) spill = filled[j];
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
    if (body.length >= LAKE_MIN_AREA) bodies.push({ tiles: body, depth, spill });
  }

  bodies.sort((a, b) => b.depth - a.depth || a.tiles[0] - b.tiles[0]);

  // Lakes live in lowlands: a basin whose spill point sits high in the ridges stays dry,
  // otherwise the mountains end up holding a sea and the passes drown.
  const lakeTop = waterLevel + LAKE_MAX_RISE * (1 - waterLevel);
  let lakes = 0;
  const lakeBudget = Math.floor(n * LAKE_SHARE);
  for (const body of bodies) {
    if (body.spill > lakeTop) continue;
    if (body.tiles.length > lakeBudget - lakes) continue;   // one lake never eats the whole budget
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
  let basins = 0;
  // distance inside a basin to its spill point, so a river crosses a flat tile by tile
  const spillDist = new Int32Array(n).fill(-1);
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

      const id = basins++;
      for (const j of body) basinId[j] = id;

      // Breadth-first from the spill point: every basin tile now knows how many steps
      // separate it from the way out, which is the path a river takes across the flat.
      spillDist[exitTile] = 0;
      body.length = 0;
      body.push(exitTile);
      for (let q = 0; q < body.length; q++) {
        const j = body[q], dj = spillDist[j];
        const x = j % w, y = (j / w) | 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const k = ny * w + nx;
            if (basinId[k] !== id || spillDist[k] >= 0) continue;
            spillDist[k] = dj + 1;
            body.push(k);
          }
        }
      }
    }
  }

  const river = new Uint8Array(n);
  const flow = new Int32Array(n).fill(-1);
  const streamSize = new Int32Array(n);
  let rivers = 0;
  let riverLength = 0;

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
    while (!water[cur]) {
      // On a slope the river follows the drainage tree; across a flat basin it follows the
      // spill gradient. Either way it steps one tile at a time and always reaches water.
      let next = dir[cur];
      const b = basinId[cur];
      if (b >= 0) {
        let bestD = spillDist[cur];
        const x = cur % w, y = (cur / w) | 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const k = ny * w + nx;
            if (basinId[k] === b && spillDist[k] >= 0 && spillDist[k] < bestD) {
              bestD = spillDist[k];
              next = k;
            }
          }
        }
      }
      if (next < 0 || next === cur) break;
      river[cur] = 1;
      streamSize[cur] = catchment[cur];
      flow[cur] = next;
      len++;
      cur = next;
    }
    if (len > RIVER_MIN_LEN) { rivers++; riverLength += len; }
  }

  // Rivers as ordered chains (source → mouth), so the renderer strokes one line per river
  // instead of a pile of loose segments and can let it wind.
  const riverChains: number[][] = [];
  {
    const incoming = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (river[i] && flow[i] >= 0) incoming[flow[i]] = 1;
    for (let i = 0; i < n; i++) {
      if (!river[i] || incoming[i]) continue;
      const chain: number[] = [];
      let cur = i;
      while (cur >= 0 && river[cur]) {
        chain.push(cur);
        const next = flow[cur];
        if (next >= 0 && !river[next]) { chain.push(next); break; }   // the last step reaches water
        cur = next;
      }
      if (chain.length > 1) riverChains.push(chain);
    }
  }

  const { poi, settlements } = placePoi(rng, seed, biome, water, w, h);

  return { seed, w, h, elev, filled, moist, biome, water, river, flow, streamSize, rivers, riverLength, lakes, waterLevel, riverChains, poi, settlements };
}

// ?seed=42 → 42; missing, zero, negative or garbage → 1, so the map always builds.
export function seedFromQuery(qs: string): number {
  const raw = new URLSearchParams(qs).get("seed");
  const n = raw === null ? NaN : Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}
