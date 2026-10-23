// Inter-city roads: each town is joined to its nearest neighbours by a path that
// follows the terrain, and the path's terrain cost is what a journey costs in days.
import type { Settlement, World } from "./world.ts";
import type { Road } from "./world.ts";
import {
  ROAD_NEIGHBOURS, ROAD_BIOME_COST, ROAD_RIVER_COST, ROAD_TILES_PER_DAY, ROAD_SEARCH_MARGIN,
} from "./config.ts";

export type { Road };

const DIRS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

// Dijkstra over tiles inside the box around both ends. Roads may ford a river
// (costly) but never cross open water, so lakes and the sea are walked around.
function findPath(world: World, ax: number, ay: number, bx: number, by: number): { tiles: number[]; cost: number } {
  const { w, h, biome, water, river } = world;
  const margin = ROAD_SEARCH_MARGIN;
  const x0 = Math.max(0, Math.min(ax, bx) - margin), x1 = Math.min(w - 1, Math.max(ax, bx) + margin);
  const y0 = Math.max(0, Math.min(ay, by) - margin), y1 = Math.min(h - 1, Math.max(ay, by) + margin);
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const cost = new Float32Array(bw * bh).fill(Infinity);
  const prev = new Int32Array(bw * bh).fill(-1);
  const done = new Uint8Array(bw * bh);

  const tileCost = (i: number): number => {
    if (water[i]) return Infinity;
    const c = ROAD_BIOME_COST[biome[i]] ?? 2;
    return river[i] ? Math.max(c, ROAD_RIVER_COST) : c;
  };

  const start = (ay - y0) * bw + (ax - x0);
  const goal = (by - y0) * bw + (bx - x0);
  cost[start] = 0;

  // Small binary heap of (cost, cell); a plain array would be fine at this size
  // but a heap keeps a long road across the map from crawling.
  const heap: number[] = [start];
  const heapCost: number[] = [0];
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
      const step = tileCost(ni);
      if (step === Infinity) continue;
      const ncell = (ny - y0) * bw + (nx - x0);
      if (done[ncell]) continue;
      const diag = dx !== 0 && dy !== 0 ? 1.41 : 1;
      const next = cost[cell] + step * diag;
      if (next < cost[ncell]) {
        cost[ncell] = next;
        prev[ncell] = cell;
        push(ncell, next);
      }
    }
  }

  if (!Number.isFinite(cost[goal])) return { tiles: [], cost: 0 };
  const tiles: number[] = [];
  for (let c = goal; c >= 0; c = prev[c]) tiles.push((y0 + ((c / bw) | 0)) * w + (x0 + (c % bw)));
  tiles.reverse();
  return { tiles, cost: cost[goal] };
}

export function buildRoads(world: World): Road[] {
  const towns = world.settlements;
  const pairs = new Map<string, Road>();
  const near = towns.map((s, i) => {
    const list: { j: number; d: number }[] = [];
    for (let j = 0; j < towns.length; j++) {
      if (i === j) continue;
      list.push({ j, d: Math.hypot(towns[j].x - s.x, towns[j].y - s.y) });
    }
    return list.sort((p, q) => p.d - q.d).slice(0, ROAD_NEIGHBOURS);
  });

  for (let a = 0; a < towns.length; a++) {
    for (const { j: b } of near[a]) {
      const lo = Math.min(a, b), hi = Math.max(a, b);
      const key = `${lo}:${hi}`;
      if (pairs.has(key)) continue;
      const A = towns[lo], B = towns[hi];
      const { tiles, cost } = findPath(world, A.x, A.y, B.x, B.y);
      const road: Road = {
        a: lo, b: hi, tiles,
        days: tiles.length === 0 ? Math.ceil(Math.hypot(B.x - A.x, B.y - A.y) / ROAD_TILES_PER_DAY) : Math.max(1, Math.ceil(cost / ROAD_TILES_PER_DAY)),
      };
      pairs.set(key, road);
    }
  }
  return [...pairs.values()];
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
