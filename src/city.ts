// City layout: pure geometry, no canvas. A town is a grid of blocks with a house in
// each cell and a street between rows; the plan is deterministic for a position.
import { CITY_CELL, CITY_HOUSE, CITY_MAIN_STREET } from "./config.ts";

export type House = { x: number; y: number; s: number };
export type Street = { x1: number; y1: number; x2: number; y2: number };
export type CityPlan = { houses: House[]; streets: Street[]; size: number };

// Stable per-town jitter so two towns of equal size do not look stamped.
function jitter(x: number, y: number, k: number): number {
  let h = Math.imul(x * 374761393 + k * 668265263, 1274126177) ^ Math.imul(y + k, 2246822519);
  h = Math.imul(h ^ (h >>> 15), 2654435761);
  return (((h ^ (h >>> 13)) >>> 0) / 4294967296) - 0.5;
}

// Tile footprint of a plan, so callers can place labels and cull without building it.
export function citySize(houses: number): { w: number; h: number } {
  const cols = Math.max(1, Math.ceil(Math.sqrt(houses)));
  const rows = Math.ceil(houses / cols);
  return { w: cols * CITY_CELL, h: rows * CITY_CELL };
}

export function cityPlan(sx: number, sy: number, houses: number): CityPlan {
  const cols = Math.max(1, Math.ceil(Math.sqrt(houses)));
  const rows = Math.ceil(houses / cols);
  const size = Math.max(cols, rows) * CITY_CELL;
  // town origin: the plan is centred on the settlement tile
  const ox = sx + 0.5 - (cols * CITY_CELL) / 2;
  const oy = sy + 0.5 - (rows * CITY_CELL) / 2;

  const out: House[] = [];
  for (let i = 0; i < houses; i++) {
    const cx = i % cols, cy = (i / cols) | 0;
    const jx = jitter(sx, sy, i) * CITY_CELL * 0.12;
    const jy = jitter(sy, sx, i + 977) * CITY_CELL * 0.12;
    out.push({
      x: ox + cx * CITY_CELL + (CITY_CELL - CITY_HOUSE) / 2 + jx,
      y: oy + cy * CITY_CELL + (CITY_CELL - CITY_HOUSE) / 2 + jy,
      s: CITY_HOUSE,
    });
  }

  // A street along every row gap keeps the blocks readable from above;
  // one main street down the middle is what an outside road connects to.
  const streets: Street[] = [];
  const x0 = ox - CITY_CELL * 0.1, x1 = ox + cols * CITY_CELL + CITY_CELL * 0.1;
  for (let r = 0; r <= rows; r++) {
    const y = oy + r * CITY_CELL;
    streets.push({ x1: x0, y1: y, x2: x1, y2: y });
  }
  const mainX = ox + (cols * CITY_CELL) / 2;
  streets.push({
    x1: mainX, y1: oy - CITY_MAIN_STREET,
    x2: mainX, y2: oy + rows * CITY_CELL + CITY_MAIN_STREET,
  });

  return { houses: out, streets, size };
}
