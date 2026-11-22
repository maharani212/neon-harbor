// Neon Harbor — a small deterministic random number generator.
// The city, the traffic and the missions all draw from one seeded stream so a
// given seed always builds the same Port Meridian.

/** Mulberry32: a fast 32-bit seeded PRNG. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seeded RNG with the helpers the city and the game use. */
export class Rng {
  constructor(seed = 1) {
    this.next = mulberry32(seed);
    this.seed = seed >>> 0;
  }

  /** A float in [0, 1). */
  float() {
    return this.next();
  }

  /** A float in [min, max). */
  range(min, max) {
    return min + this.next() * (max - min);
  }

  /** An integer in [min, max] inclusive. */
  int(min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** True with probability p (0..1). */
  chance(p) {
    return this.next() < p;
  }

  /** One element of an array, uniformly. */
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** A new array with the elements shuffled (Fisher-Yates). */
  shuffle(arr) {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const t = out[i];
      out[i] = out[j];
      out[j] = t;
    }
    return out;
  }
}
