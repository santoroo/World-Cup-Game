// ============================================================================
// Deterministic pseudo-random number generator (mulberry32) + string hashing.
// Same seed → same sequence. Keeps the whole engine reproducible.
// ============================================================================

export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** Float in [min, max). */
  range(min: number, max: number): number;
  /** true with probability p. */
  chance(p: number): boolean;
  /** Pick a random element. */
  pick<T>(arr: readonly T[]): T;
  /** Weighted pick: weights[i] is the weight of arr[i]. */
  weighted<T>(arr: readonly T[], weights: readonly number[]): T;
  /** Returns a new shuffled copy (Fisher–Yates). */
  shuffle<T>(arr: readonly T[]): T[];
}

/** FNV-1a-ish hash: string → uint32 seed. */
export function hashSeed(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 generator. Accepts a numeric or string seed. */
export function createRng(seed: number | string): Rng {
  let state = (typeof seed === 'string' ? hashSeed(seed) : seed >>> 0) || 1;

  const next = (): number => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const rng: Rng = {
    next,
    int: (min, max) => Math.floor(next() * (max - min + 1)) + min,
    range: (min, max) => next() * (max - min) + min,
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    weighted: (arr, weights) => {
      const total = weights.reduce((a, b) => a + b, 0);
      let r = next() * total;
      for (let i = 0; i < arr.length; i++) {
        r -= weights[i];
        if (r < 0) return arr[i];
      }
      return arr[arr.length - 1];
    },
    shuffle: (arr) => {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };

  return rng;
}

/** Generates a fresh random seed string (for new games). */
export function randomSeed(): string {
  return Math.floor(Math.random() * 0xffffffff).toString(36) + Date.now().toString(36);
}
