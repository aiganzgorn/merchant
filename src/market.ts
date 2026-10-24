// Market prices: what a good costs in one town. There is no money or trade yet, so the
// only honest signal is local scarcity — a town with an empty store asks more for it.
import type { Settlement } from "./world.ts";
import { RESOURCE_COUNT, NEED_TIERS, PRICE_BASE, PRICE_DAYS, PRICE_LOW, PRICE_HIGH } from "./config.ts";

// A town needs this much of a resource per day; goods no tier asks for have no daily need.
function dailyNeed(population: number, resource: number): number {
  for (const tier of NEED_TIERS) {
    for (const need of tier) {
      if (need.water || !need.resources.includes(resource)) continue;
      return population * need.perCapita;
    }
  }
  return 0;
}

// Price in one town. Empty store → expensive, PRICE_DAYS of stock → base, a glut → cheap.
export function priceOf(s: Settlement, resource: number): number {
  const base = PRICE_BASE[resource] ?? 1;
  const daily = dailyNeed(s.population, resource);
  if (daily <= 0) return Math.round(base); // nothing here needs it: the base price is the price
  const coverage = s.stock[resource] / (daily * PRICE_DAYS);
  const factor = Math.min(PRICE_HIGH, Math.max(PRICE_LOW, 1.6 - 0.6 * coverage));
  return Math.max(1, Math.round(base * factor));
}

export function marketPrices(s: Settlement): { resource: number; price: number }[] {
  const out: { resource: number; price: number }[] = [];
  for (let r = 0; r < RESOURCE_COUNT; r++) out.push({ resource: r, price: priceOf(s, r) });
  return out.sort((a, b) => a.price - b.price || a.resource - b.resource);
}
