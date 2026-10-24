// The merchant: capital, cargo and the road being walked. Pure — no DOM, no canvas.
import type { World } from "./world.ts";
import { RESOURCE_COUNT, START_CAPITAL, TRADE_SPREAD } from "./config.ts";
import { priceOf } from "./market.ts";

export type Journey = { to: number; left: number };
export type Player = {
  capital: number;
  at: number;              // index of the town the merchant stands in
  cargo: Float32Array;     // units per resource
  journey: Journey | null; // null when standing still
};

export function newPlayer(at = 0): Player {
  return { capital: START_CAPITAL, at, cargo: new Float32Array(RESOURCE_COUNT), journey: null };
}

export const canTrade = (p: Player): boolean => p.journey === null;

export function cargoUnits(p: Player): number {
  let n = 0;
  for (const v of p.cargo) n += v;
  return Math.round(n);
}

export function buyPrice(world: World, p: Player, resource: number): number {
  return priceOf(world.settlements[p.at], resource);
}

// A town buys for less than it sells: the market has its cut.
export function sellPrice(world: World, p: Player, resource: number): number {
  return Math.max(1, Math.floor(buyPrice(world, p, resource) * TRADE_SPREAD));
}

// How many units the capital covers, capped by the requested amount.
export function affordable(p: Player, world: World, resource: number, want: number): number {
  const price = buyPrice(world, p, resource);
  return Math.max(0, Math.min(want, Math.floor(p.capital / price)));
}

export function buy(p: Player, world: World, resource: number, want = 1): number {
  if (!canTrade(p)) return 0;
  const n = affordable(p, world, resource, want);
  if (n <= 0) return 0;
  p.capital -= n * buyPrice(world, p, resource);
  p.cargo[resource] += n;
  return n;
}

export function sell(p: Player, world: World, resource: number, want = 1): number {
  if (!canTrade(p)) return 0;
  const n = Math.min(want, Math.floor(p.cargo[resource]));
  if (n <= 0) return 0;
  p.capital += n * sellPrice(world, p, resource);
  p.cargo[resource] -= n;
  return n;
}

export function sellAll(p: Player, world: World): number {
  if (!canTrade(p)) return 0;
  let earned = 0;
  for (let r = 0; r < RESOURCE_COUNT; r++) {
    const price = sellPrice(world, p, r);
    earned += sell(p, world, r, p.cargo[r]) * price;
  }
  return earned;
}

// Journey length in days between two towns on the road network, or 0 if no road joins them.
export function travelDays(world: World, from: number, to: number): number {
  for (const road of world.roads) {
    if ((road.a === from && road.b === to) || (road.a === to && road.b === from)) return road.days;
  }
  return 0;
}

export function canTravel(world: World, p: Player, to: number): boolean {
  return canTrade(p) && to !== p.at && travelDays(world, p.at, to) > 0;
}

export function startTravel(p: Player, world: World, to: number): boolean {
  if (!canTravel(world, p, to)) return false;
  p.journey = { to, left: travelDays(world, p.at, to) };
  return true;
}

// One game day on the road. Returns the town just reached, or -1 while still walking.
export function tickTravel(p: Player): number {
  if (!p.journey) return -1;
  p.journey.left--;
  if (p.journey.left > 0) return -1;
  p.at = p.journey.to;
  p.journey = null;
  return p.at;
}
