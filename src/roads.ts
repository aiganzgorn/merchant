// Inter-city roads: each town is joined to its nearest neighbours by a path that
// follows the terrain, and the path's terrain cost is what a journey costs in days.
import type { Settlement, World } from "./world.ts";
import type { Road } from "./world.ts";
import {
  ROAD_BIOME_COST, ROAD_RIVER_COST, ROAD_TILES_PER_DAY, ROAD_SEARCH_MARGIN, ROAD_REUSE_COST,
} from "./config.ts";

const BIOME_FIELD = 3; // index of the field biome in ROAD_BIOME_COST

export type { Road };

const DIRS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

// A* over tiles inside the box around both ends. Roads may ford a river (costly)
// but never cross open water, so lakes and the sea are walked around.
// `use` marks tiles an earlier road already crosses; those are cheaper to walk on,
// so a new road joins an existing one and forks off where they part.
function findPath(world: World, ax: number, ay: number, bx: number, by: number, use: Uint8Array): { tiles: number[]; cost: number } {
  const { w, h, biome, water, river } = world;
  const margin = ROAD_SEARCH_MARGIN;
  const x0 = Math.max(0, Math.min(ax, bx) - margin), x1 = Math.min(w - 1, Math.max(ax, bx) + margin);
  const y0 = Math.max(0, Math.min(ay, by) - margin), y1 = Math.min(h - 1, Math.max(ay, by) + margin);
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const cost = new Float32Array(bw * bh).fill(Infinity);   // what the search pays, discounts included
  const real = new Float32Array(bw * bh).fill(Infinity);   // honest travel cost, no reuse discount
  const prev = new Int32Array(bw * bh).fill(-1);
  const done = new Uint8Array(bw * bh);

  const terrainAt = (i: number): number => {
    if (water[i]) return Infinity;
    const c = ROAD_BIOME_COST[biome[i]] ?? 2;
    return river[i] ? Math.max(c, ROAD_RIVER_COST) : c;
  };

  const start = (ay - y0) * bw + (ax - x0);
  const goal = (by - y0) * bw + (bx - x0);
  cost[start] = 0;
  real[start] = 0;

  // Admissible estimate of the cost still ahead: the cheapest possible tile per step.
  const goalX = bx - x0, goalY = by - y0;
  const cheapest = (ROAD_BIOME_COST[BIOME_FIELD] ?? 1) * ROAD_REUSE_COST;
  const estimate = (cell: number): number => {
    const dx = Math.abs((cell % bw) - goalX), dy = Math.abs(((cell / bw) | 0) - goalY);
    return (Math.max(dx, dy) + 0.41 * Math.min(dx, dy)) * cheapest;
  };

  // Small binary heap of (cost, cell); a plain array would be fine at this size
  // but a heap keeps a long road across the map from crawling.
  const heap: number[] = [start];
  const heapCost: number[] = [estimate(start)];
  const push = (cell: number, c: number) => {
    let i = heap.length;
    heap.push(cell); heapCost.push(c);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heapCost[p] <= heapCost[i]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      [heapCost[p], heapCost[i]] = [heapCost[i], heapCost[p]];
      i = p;
    }
  };
  const pop = (): number => {
    const top = heap[0];
    const lastCell = heap.pop()!, lastCost = heapCost.pop()!;
    if (heap.length) {
      heap[0] = lastCell; heapCost[0] = lastCost;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < heap.length && heapCost[l] < heapCost[m]) m = l;
        if (r < heap.length && heapCost[r] < heapCost[m]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        [heapCost[m], heapCost[i]] = [heapCost[i], heapCost[m]];
        i = m;
      }
    }
    return top;
  };

  while (heap.length) {
    const cell = pop();
    if (done[cell]) continue;
    done[cell] = 1;
    if (cell === goal) break;
    const cx = x0 + (cell % bw), cy = y0 + ((cell / bw) | 0);
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < x0 || ny < y0 || nx > x1 || ny > y1) continue;
      const ni = ny * w + nx;
      const stepTerrain = terrainAt(ni);
      if (stepTerrain === Infinity) continue;
      const ncell = (ny - y0) * bw + (nx - x0);
      if (done[ncell]) continue;
      const diag = dx !== 0 && dy !== 0 ? 1.41 : 1;
      const step = (use[ni] ? stepTerrain * ROAD_REUSE_COST : stepTerrain) * diag;
      const next = cost[cell] + step;
      if (next < cost[ncell]) {
        cost[ncell] = next;
        real[ncell] = real[cell] + stepTerrain * diag;
        prev[ncell] = cell;
        push(ncell, next + estimate(ncell));
      }
    }
  }

  if (!Number.isFinite(real[goal])) return { tiles: [], cost: 0 };
  const tiles: number[] = [];
  for (let c = goal; c >= 0; c = prev[c]) tiles.push((y0 + ((c / bw) | 0)) * w + (x0 + (c % bw)));
  tiles.reverse();
  return { tiles, cost: real[goal] };
}

// The network grows one road at a time: every new town is joined from the closest
// town that already has a road, and the search walks over the roads laid before
// (they are cheaper), so new roads reuse a trunk and fork off at a junction.
export function buildRoads(world: World): Road[] {
  const towns = world.settlements;
  const roads: Road[] = [];
  if (towns.length < 2) return roads;

  const use = new Uint8Array(world.w * world.h);
  const joined = new Uint8Array(towns.length);
  joined[0] = 1;

  for (;;) {
    let from = -1, to = -1, bestDist = Infinity;
    for (let a = 0; a < towns.length; a++) {
      if (!joined[a]) continue;
      for (let b = 0; b < towns.length; b++) {
        if (joined[b]) continue;
        const d = Math.hypot(towns[a].x - towns[b].x, towns[a].y - towns[b].y);
        if (d < bestDist) { bestDist = d; from = a; to = b; }
      }
    }
    if (to < 0) break;

    const A = towns[from], B = towns[to];
    const { tiles, cost } = findPath(world, A.x, A.y, B.x, B.y, use);
    for (const t of tiles) use[t] = 1;
    joined[to] = 1;
    // tiles run from town a to town b, so drawing and travel agree on direction
    roads.push({
      a: from, b: to, tiles,
      days: tiles.length === 0
        ? Math.ceil(bestDist / ROAD_TILES_PER_DAY)
        : Math.max(1, Math.ceil(cost / ROAD_TILES_PER_DAY)),
    });
  }
  return roads;
}

// Roads touching a town, shortest journey first.
export function roadsOf(world: World, index: number): { other: Settlement; days: number }[] {
  const out: { other: Settlement; days: number }[] = [];
  for (const r of world.roads) {
    if (r.a !== index && r.b !== index) continue;
    const other = world.settlements[r.a === index ? r.b : r.a];
    if (other) out.push({ other, days: r.days });
  }
  return out.sort((p, q) => p.days - q.days);
}
