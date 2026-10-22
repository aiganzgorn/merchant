// Deterministic RNG — the whole world must be reproducible from a seed.
export type Rng = () => number;

export function mulberry32(a: number): Rng {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// An integer in [0, maxExclusive).
export function int(rng: Rng, maxExclusive: number): number {
  return Math.floor(rng() * maxExclusive);
}
