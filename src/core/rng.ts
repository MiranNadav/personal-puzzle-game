/**
 * Seeded PRNG — the single source of determinism for the whole app.
 *
 * Same seed → same stream, on any machine. Shared links and reloads depend on
 * regenerating byte-identical geometry elsewhere (see plan Q5/Q19), so this must
 * be a pure, platform-independent integer PRNG — never `Math.random()`.
 *
 * mulberry32: 32-bit state, good statistical quality for this use, trivially
 * portable.
 */
export interface Rng {
  /** Next float in [0, 1). */
  next(): number;
  /** Uniform float in [min, max). */
  uniform(min: number, max: number): number;
  /** Fair coin. */
  bool(): boolean;
  /** Integer in [min, max). */
  int(min: number, max: number): number;
}

export function makeRng(seed: number): Rng {
  // Force to uint32 so behaviour is identical regardless of how `seed` arrived.
  let a = seed >>> 0;

  const next = (): number => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    uniform: (min, max) => min + next() * (max - min),
    bool: () => next() < 0.5,
    int: (min, max) => min + Math.floor(next() * (max - min)),
  };
}
