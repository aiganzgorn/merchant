// Deterministic region naming: flood-fill regions, then generate settlement/state names.
import { mulberry32, int, type Rng } from "./rng.ts";
import { BIOME, type World, type CultureRegion, type Namer } from "./world.ts";
import {
  CULTURES, MAX_REGIONS, MIN_REGION_SHARE, NAME_MIN, NAME_MAX, NAME_TRIES,
} from "./config.ts";

export type { CultureRegion, Namer };

function pick<T>(arr: T[], rng: Rng): T {
  return arr[int(rng, arr.length)];
}

function capitalize(s: string): string {
  return s[0].toUpperCase() + s.slice(1).toLowerCase();
}

function buildSyllable(onset: string[], vowel: string[], coda: string[], rng: Rng): string {
  const o = pick(onset, rng);
  const v = pick(vowel, rng);
  const cd = rng() < 0.5 ? pick(coda, rng) : "";
  return o + v + cd;
}

function makeSyllable(culture: CultureRegion, rng: Rng): string {
  return buildSyllable(culture.onset, culture.vowel, culture.coda, rng);
}

function makeRandomName(culture: CultureRegion, rng: Rng): string {
  const ending = pick(culture.endings, rng);
  if (rng() < 0.4) {
    const a = makeSyllable(culture, rng);
    const b = makeSyllable(culture, rng);
    return capitalize(`${a}-${b}${ending}`);
  }
  return capitalize(`${makeSyllable(culture, rng)}${ending}`);
}

export function buildRegions(world: World): { regionOf: Int16Array; cultures: CultureRegion[] } {
  const { w, h, biome, water, river } = world;
  const n = w * h;
  const regionOf = new Int16Array(n).fill(-1);

  const isWall = (i: number) => water[i] || river[i] || biome[i] === BIOME.hill || biome[i] === BIOME.mountain;

  const stack: number[] = [];
  let nextId = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (isWall(i) || regionOf[i] >= 0) continue;
      stack.length = 0;
      stack.push(i);
      regionOf[i] = nextId;
      while (stack.length) {
        const j = stack.pop()!;
        const jx = j % w, jy = (j / w) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = jx + dx, ny = jy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const k = ny * w + nx;
          if (isWall(k) || regionOf[k] >= 0) continue;
          regionOf[k] = nextId;
          stack.push(k);
        }
      }
      nextId++;
    }
  }

  const initialCount = nextId;
  const sizes = new Int32Array(initialCount).fill(0);
  let totalLand = 0;
  for (let i = 0; i < n; i++) {
    if (isWall(i)) continue;
    totalLand++;
    sizes[regionOf[i]]++;
  }

  // length of shared edge between two regions.
  const borders = new Map<string, number>();
  const borderKey = (a: number, b: number) => a < b ? `${a},${b}` : `${b},${a}`;

  const recomputeBorders = () => {
    borders.clear();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const r = regionOf[i];
        if (r < 0) continue;
        if (x + 1 < w) {
          const rr = regionOf[i + 1];
          if (rr >= 0 && rr !== r) borders.set(borderKey(r, rr), (borders.get(borderKey(r, rr)) || 0) + 1);
        }
        if (y + 1 < h) {
          const rr = regionOf[i + w];
          if (rr >= 0 && rr !== r) borders.set(borderKey(r, rr), (borders.get(borderKey(r, rr)) || 0) + 1);
        }
      }
    }
  };
  recomputeBorders();

  // culture template tied to the original flood-fill order of each surviving region.
  const templateIdx: number[] = [];
  for (let k = 0; k < initialCount; k++) templateIdx[k] = k % CULTURES.length;

  const activeRegions = () => {
    const out: number[] = [];
    for (let r = 0; r < sizes.length; r++) if (sizes[r] > 0) out.push(r);
    return out;
  };

  const findSmallest = (belowThresholdOnly: boolean) => {
    const threshold = MIN_REGION_SHARE * totalLand;
    let best = -1, bestSize = Infinity;
    for (const r of activeRegions()) {
      if (belowThresholdOnly && sizes[r] >= threshold) continue;
      if (sizes[r] < bestSize) { bestSize = sizes[r]; best = r; }
    }
    return best;
  };

  const centroids = () => {
    const sx = new Float64Array(sizes.length).fill(0);
    const sy = new Float64Array(sizes.length).fill(0);
    for (let i = 0; i < n; i++) {
      const r = regionOf[i];
      if (r < 0) continue;
      sx[r] += i % w;
      sy[r] += (i / w) | 0;
    }
    const out: { x: number; y: number }[] = [];
    for (let r = 0; r < sizes.length; r++) {
      out[r] = sizes[r] > 0 ? { x: sx[r] / sizes[r], y: sy[r] / sizes[r] } : { x: 0, y: 0 };
    }
    return out;
  };

  const findBestNeighbor = (r: number) => {
    let best = -1, bestLen = -1;
    for (const [key, len] of borders) {
      const [a, b] = key.split(",").map(Number);
      if (a !== r && b !== r) continue;
      const nb = a === r ? b : a;
      if (len > bestLen) { bestLen = len; best = nb; }
    }
    if (best >= 0) return best;
    // isolated pocket: merge into the nearest region by centroid distance.
    const c = centroids();
    let bestD = Infinity;
    for (const nb of activeRegions()) {
      if (nb === r) continue;
      const dx = c[r].x - c[nb].x, dy = c[r].y - c[nb].y;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = nb; }
    }
    return best;
  };

  const merge = (from: number, into: number) => {
    for (let i = 0; i < n; i++) if (regionOf[i] === from) regionOf[i] = into;
    sizes[into] += sizes[from];
    sizes[from] = 0;
    // the absorbing region keeps its own culture; only its geometry grows.
    // update border lengths incrementally instead of rescanning the whole map.
    const absorbed: { other: number; len: number }[] = [];
    for (const [key, len] of borders) {
      const [a, b] = key.split(",").map(Number);
      if (a !== from && b !== from) continue;
      const other = a === from ? b : a;
      if (other !== into) absorbed.push({ other, len });
      borders.delete(key);
    }
    for (const { other, len } of absorbed) {
      const key = borderKey(into, other);
      borders.set(key, (borders.get(key) || 0) + len);
    }
  };

  const threshold = MIN_REGION_SHARE * totalLand;

  // First absorb every region below the minimum land share, smallest first.
  // Stop if only 3 regions remain so the world always has several cultures.
  while (activeRegions().length > 3) {
    let victim = -1, victimSize = Infinity;
    for (const r of activeRegions()) {
      if (sizes[r] < threshold && sizes[r] < victimSize) { victim = r; victimSize = sizes[r]; }
    }
    if (victim < 0) break;
    const nb = findBestNeighbor(victim);
    if (nb < 0) break;
    merge(victim, nb);
  }

  // Then trim down to the desired cap.
  while (activeRegions().length > MAX_REGIONS) {
    const victim = findSmallest(false);
    if (victim < 0) break;
    const nb = findBestNeighbor(victim);
    if (nb < 0) break;
    merge(victim, nb);
  }

  // renumber survivors contiguously.
  const remap = new Int16Array(sizes.length).fill(-1);
  let newId = 0;
  for (let i = 0; i < n; i++) {
    const r = regionOf[i];
    if (r < 0 || remap[r] >= 0) continue;
    remap[r] = newId++;
  }
  for (let i = 0; i < n; i++) {
    const r = regionOf[i];
    if (r >= 0) regionOf[i] = remap[r];
  }

  // final sizes after renumbering.
  const newSizes = new Int32Array(newId).fill(0);
  for (let i = 0; i < n; i++) {
    const r = regionOf[i];
    if (r >= 0) newSizes[r]++;
  }

  const cultures: CultureRegion[] = [];
  for (let oldId = 0; oldId < sizes.length; oldId++) {
    if (sizes[oldId] === 0) continue;
    const id = remap[oldId];
    const tmpl = CULTURES[templateIdx[oldId]];
    cultures[id] = {
      id,
      name: tmpl.name,
      tiles: newSizes[id],
      endings: tmpl.endings.slice(),
      onset: tmpl.onset.slice(),
      vowel: tmpl.vowel.slice(),
      coda: tmpl.coda.slice(),
      roots: tmpl.roots.slice(),
      genitive: tmpl.genitive,
    };
  }

  return { regionOf, cultures };
}

export function createNamer(seed: number, cultures: CultureRegion[]): Namer {
  const rng = mulberry32(seed + 12000);
  const used = new Set<string>();
  const stateUsed = new Set<string>();
  let fallbackCounter = 0;
  let stateFallbackCounter = 0;

  const uniqueName = (name: string): string | null => {
    if (name.length < NAME_MIN || name.length > NAME_MAX) return null;
    const key = name.toLowerCase();
    if (used.has(key)) return null;
    used.add(key);
    return name;
  };

  const uniqueState = (name: string): string | null => {
    const key = name.toLowerCase();
    if (stateUsed.has(key)) return null;
    stateUsed.add(key);
    return name;
  };

  // Convert a positive integer to a Cyrillic tag (base-33, no digits).
  const cyrTag = (n: number): string => {
    const letters = "абвгдежзийклмнопрстуфхцчшщъыьэюя";
    let s = "";
    while (n > 0) {
      s = letters[(n - 1) % letters.length] + s;
      n = Math.floor((n - 1) / letters.length);
    }
    return s || letters[0];
  };

  // Guaranteed-terminating fallback: base + "-" + fresh Cyrillic counter tag.
  const fallbackName = (base: string): string => {
    fallbackCounter++;
    const tag = cyrTag(fallbackCounter);
    const maxPrefix = NAME_MAX - tag.length - 1;
    for (let len = Math.min(base.length, maxPrefix); len >= 0; len--) {
      const prefix = base.slice(0, len);
      const name = prefix ? `${prefix}-${tag}` : tag;
      const ok = uniqueName(name);
      if (ok) return ok;
    }
    // Should be unreachable: even an empty prefix gives a fresh tag-based name.
    return uniqueName(tag) || tag;
  };

  const regionName = (region: number): string => {
    const culture = cultures[region];
    if (!culture) return fallbackName(pick(["Село", "Град", "Посад"], rng));

    for (let t = 0; t < NAME_TRIES; t++) {
      const name = makeRandomName(culture, rng);
      const ok = uniqueName(name);
      if (ok) return ok;
    }

    // systematic fallback: roots × endings × extra syllables.
    for (let extra = 0; extra < 4; extra++) {
      for (const root of culture.roots) {
        for (const ending of culture.endings) {
          let suffix = "";
          for (let e = 0; e < extra; e++) suffix += pick(culture.vowel, rng) + pick(culture.coda, rng);
          const name = capitalize(`${root}${ending}${suffix}`);
          const ok = uniqueName(name);
          if (ok) return ok;
        }
      }
    }

    return fallbackName(capitalize(pick(culture.onset, rng) + pick(culture.vowel, rng)));
  };

  return {
    settlement(region: number): string {
      return regionName(region);
    },

    enterprise(kind: string, settlement: string, region: number): string {
      const culture = cultures[region];
      const suffix = culture ? culture.genitive : "а";
      return `${kind} ${settlement}${suffix}`;
    },

    state(region: number): string {
      const culture = cultures[region];
      const take = (name: string): string | null => uniqueState(name);
      if (!culture) {
        return take("Княжество") || take("Владение") || take("Государство") || fallbackState();
      }
      for (const root of culture.roots) {
        for (const suffix of ["ия", "ство"]) {
          const name = take(capitalize(`${root}${suffix}`));
          if (name) return name;
        }
      }
      const last = take(capitalize(`${culture.roots[0]}ия`));
      return last || take("Княжество") || take("Владение") || take("Государство") || fallbackState();
    },
  };

  function fallbackState(): string {
    stateFallbackCounter++;
    const tag = cyrTag(stateFallbackCounter);
    const base = "Государство";
    const maxPrefix = NAME_MAX - tag.length - 1;
    for (let len = Math.min(base.length, maxPrefix); len >= 0; len--) {
      const prefix = base.slice(0, len);
      const name = prefix ? `${prefix}-${tag}` : tag;
      const ok = uniqueState(name);
      if (ok) return ok;
    }
    return uniqueState(tag) || tag;
  }
}

// If a settlement lands on an unwalled tile (should not happen), adopt the nearest land
// region within the spiral radius. If nothing is found, fall back to the largest region.
export function nearestRegion(world: World, x: number, y: number, radius = 8): number {
  const i = y * world.w + x;
  const r = world.regionOf[i];
  if (r >= 0) return r;
  for (let d = 1; d <= radius; d++) {
    for (let dy = -d; dy <= d; dy++) {
      for (let dx = -d; dx <= d; dx++) {
        if (Math.abs(dx) !== d && Math.abs(dy) !== d) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= world.w || ny >= world.h) continue;
        const nr = world.regionOf[ny * world.w + nx];
        if (nr >= 0) return nr;
      }
    }
  }
  let best = 0, bestTiles = -1;
  for (const c of world.cultures) {
    if (c.tiles > bestTiles) { bestTiles = c.tiles; best = c.id; }
  }
  return best;
}
