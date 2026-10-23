// Pure helpers for the POI info card and click-vs-drag detection.
import { POI_NAMES, RESOURCE_NAMES, POI_ZONE } from "./config.ts";
import type { Poi, World } from "./world.ts";

export type PoiCard = {
  kindName: string;
  resourceName: string;
  yield: number;
  reserve: number;
  nearestSettlement: { dist: number } | null;
  sameKindInZone: number;
};

// Closest settlement to a POI, with Euclidean distance in tiles.
export function nearestSettlement(poi: Poi, world: World): { x: number; y: number; dist: number } | null {
  if (world.settlements.length === 0) return null;
  let best: { x: number; y: number; dist: number } | null = null;
  for (const s of world.settlements) {
    const d = Math.hypot(s.x - poi.x, s.y - poi.y);
    if (!best || d < best.dist) best = { x: s.x, y: s.y, dist: d };
  }
  return best;
}

// How many POIs of the same kind are within POI_ZONE tiles (including the point itself).
export function sameKindInZone(world: World, poi: Poi): number {
  let count = 0;
  for (const p of world.poi) {
    if (p.kind === poi.kind && Math.hypot(p.x - poi.x, p.y - poi.y) <= POI_ZONE) count++;
  }
  return count;
}

// All text data needed to render a POI card.
export function poiCard(world: World, poi: Poi): PoiCard {
  const settlement = nearestSettlement(poi, world);
  return {
    kindName: POI_NAMES[poi.kind] ?? "неизвестно",
    resourceName: RESOURCE_NAMES[poi.resource] ?? "неизвестно",
    yield: poi.yield,
    reserve: poi.reserve,
    nearestSettlement: settlement ? { dist: settlement.dist } : null,
    sameKindInZone: sameKindInZone(world, poi),
  };
}

// A pointer move smaller than threshold pixels is a click, not a drag.
export function isClick(dx: number, dy: number, threshold: number): boolean {
  return Math.hypot(dx, dy) < threshold;
}
