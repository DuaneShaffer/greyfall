/**
 * The battle's single random stream. `mulberry32` is used because it is a
 * 32-bit-integer generator: identical results on every platform, and its whole
 * state is one JSON-safe number that lives inside `GameState`.
 */
export interface RngState {
  /** Internal counter; advances on every draw. */
  s: number;
}

/** Create a stream from an encounter seed. */
export function createRng(seed: number): RngState {
  return { s: seed >>> 0 };
}

/** Draw the next raw 32-bit value, advancing the stream. */
export function nextUint32(rng: RngState): number {
  rng.s = (rng.s + 0x6d2b79f5) >>> 0;
  let t = rng.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

/** Uniform integer in `[0, maxExclusive)`. */
export function randomInt(rng: RngState, maxExclusive: number): number {
  if (maxExclusive <= 1) return 0;
  return nextUint32(rng) % maxExclusive;
}

/** Uniform integer in `[1, 100]`. */
export function rollPercent(rng: RngState): number {
  return randomInt(rng, 100) + 1;
}

/** True with probability `percent`%. Always draws exactly one value. */
export function chanceRoll(rng: RngState, percent: number): boolean {
  return rollPercent(rng) <= percent;
}
