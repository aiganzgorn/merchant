export type Speed = 0 | 1 | 2 | 4;
export type Sim = { day: number; speed: Speed; acc: number };
export const DAY_SECONDS = 60;

export function dayLength(speed: Speed): number {
  if (speed === 0) return Infinity;
  return DAY_SECONDS / speed;
}

export function advance(sim: Sim, dtSec: number): Sim {
  if (sim.speed === 0) return sim;
  let acc = sim.acc + dtSec * sim.speed;
  let day = sim.day;
  while (acc >= DAY_SECONDS) {
    day++;
    acc -= DAY_SECONDS;
  }
  return { ...sim, day, acc };
}
