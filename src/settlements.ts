import { type World, type Settlement, POI } from "./world.ts";
import {
  NEED_TIERS,
  NEED_TIER_FROM_LEVEL,
  LEVEL_POP,
  LEVEL_NAMES,
  LEVEL_NAMES_INSTRUMENTAL,
  GROWTH_RATE,
  BOOM_FACTOR,
  DECLINE_RATE,
  PRODUCE_PER_DAY,
  REGEN_RATE,
  ABANDON_POP,
  HOUSES_PER_POP,
} from "./config.ts";

export type Need = { label: string; resources: number[]; perCapita: number; water?: boolean };

export { NEED_TIERS };

export function levelOf(population: number): number {
  let level = 0;
  for (let i = 0; i < LEVEL_POP.length; i++) {
    if (population >= LEVEL_POP[i]) level = i;
    else break;
  }
  return level;
}

export function availableTiers(level: number): number {
  let count = 0;
  for (const from of NEED_TIER_FROM_LEVEL) {
    if (from <= level) count++;
  }
  return count;
}

export function settlementCard(s: Settlement) {
  const levelName = LEVEL_NAMES[s.level];
  const open = availableTiers(s.level);
  const needs: { label: string; ok: boolean; have: number; need: number }[] = [];
  for (let t = 0; t < open; t++) {
    for (const need of NEED_TIERS[t]) {
      const n = s.population * need.perCapita;
      if (need.water) {
        needs.push({ label: need.label, ok: s.water, have: s.water ? 1 : 0, need: 1 });
      } else {
        const have = need.resources.reduce((sum, r) => sum + s.stock[r], 0);
        needs.push({ label: need.label, ok: have >= n, have, need: n });
      }
    }
  }
  return { levelName, needs };
}

export function stepDay(world: World): string[] {
  const events: string[] = [];
  const renewable = new Set<number>([POI.logging, POI.hunting, POI.fishing, POI.farm, POI.pasture]);

  for (const s of world.settlements) {
    if (s.abandoned) continue;

    const oldLevel = s.level;

    // 1. production
    for (const pi of s.pois) {
      const p = world.poi[pi];
      const amount = PRODUCE_PER_DAY * p.yield;
      s.stock[p.resource] += amount;
      p.reserve = Math.max(0, p.reserve - amount);
      if (renewable.has(p.kind)) {
        // shortcut: regen never raises reserves above the starting cap
        p.reserve = Math.min(p.reserveMax, p.reserve + p.reserveMax * REGEN_RATE);
      }
    }

    // 2. consumption
    const open = availableTiers(s.level);
    let closed = 0;
    let total = 0;
    const tier0Unclosed: string[] = [];

    for (let t = 0; t < open; t++) {
      for (const need of NEED_TIERS[t]) {
        total++;
        const needAmount = s.population * need.perCapita;
        if (need.water) {
          if (s.water) {
            closed++;
          } else if (t === 0) {
            tier0Unclosed.push(need.label);
          }
        } else {
          let met = false;
          for (const r of need.resources) {
            if (s.stock[r] >= needAmount) {
              s.stock[r] -= needAmount;
              met = true;
              break;
            }
          }
          if (met) {
            closed++;
          } else if (t === 0) {
            tier0Unclosed.push(need.label);
          }
        }
      }
    }

    // 3. starvation (only unclosed tier-0 needs)
    for (const _ of tier0Unclosed) {
      s.population *= 1 - DECLINE_RATE;
    }

    // 4. growth uses the post-consumption satisfaction
    const satisfied = total > 0 ? closed / total : 0;
    s.population *= 1 + GROWTH_RATE * satisfied * (satisfied === 1 ? BOOM_FACTOR : 1);

    // 5. level and buildings
    s.level = levelOf(s.population);
    s.buildings.houses = Math.ceil(s.population / HOUSES_PER_POP);
    s.buildings.admin = s.population >= 60 ? 1 : 0;
    s.buildings.industry = s.pois.length;
    s.buildings.trade = s.level >= 3 ? s.level - 2 : 0;

    // 6. abandonment
    if (s.population < ABANDON_POP) {
      s.abandoned = true;
      s.population = 0;
      events.push(`${s.name} покинут`);
      continue;
    }

    // 7. at most one event per settlement per day
    if (s.level !== oldLevel) {
      if (s.level > oldLevel) {
        events.push(`${s.name} стал ${LEVEL_NAMES_INSTRUMENTAL[s.level]}`);
      } else {
        events.push(`${s.name} снизился до уровня ${LEVEL_NAMES[s.level]}`);
      }
    } else if (tier0Unclosed.length > 0) {
      events.push(`в ${s.name} не хватает ${tier0Unclosed[0]}`);
    }
  }

  return events;
}
