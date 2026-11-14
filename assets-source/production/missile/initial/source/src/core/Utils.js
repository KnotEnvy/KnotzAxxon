/**
 * Small, dependency-free helpers used all over the game.
 * Everything here is hot-path code, so it avoids allocation where it can.
 */

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const remap = (v, a, b, c, d) => lerp(c, d, clamp01(invLerp(a, b, v)));
export const sign = Math.sign;

/** Smoothstep, the classic cubic ease. */
export const smoothstep = (t) => {
  t = clamp01(t);
  return t * t * (3 - 2 * t);
};

/** Quintic smootherstep — no second-derivative discontinuity. */
export const smootherstep = (t) => {
  t = clamp01(t);
  return t * t * t * (t * (t * 6 - 15) + 10);
};

/**
 * Framerate-independent exponential approach.
 * `lambda` is roughly "how many e-folds per second" — higher is snappier.
 */
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

/** Shortest signed angular difference, in radians. */
export const angleDelta = (a, b) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};

export const dampAngle = (a, b, lambda, dt) => a + angleDelta(a, b) * (1 - Math.exp(-lambda * dt));

/** Move `a` toward `b` by at most `maxDelta`. */
export const approach = (a, b, maxDelta) => {
  const d = b - a;
  return Math.abs(d) <= maxDelta ? b : a + Math.sign(d) * maxDelta;
};

/**
 * mulberry32 — small, fast, decent-quality seeded PRNG.
 * Deterministic level generation depends on this being stable.
 */
export class Rng {
  constructor(seed = 1) {
    this.seed = seed >>> 0 || 1;
    this._s = this.seed;
  }
  reset(seed = this.seed) {
    this.seed = seed >>> 0 || 1;
    this._s = this.seed;
    return this;
  }
  /** [0, 1) */
  next() {
    this._s = (this._s + 0x6d2b79f5) >>> 0;
    let t = this._s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(lo, hi) {
    return lo + this.next() * (hi - lo);
  }
  int(lo, hi) {
    return Math.floor(this.range(lo, hi + 1));
  }
  bool(p = 0.5) {
    return this.next() < p;
  }
  /** Random element of an array. */
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length) % arr.length];
  }
  /**
   * Weighted pick. `entries` is [[value, weight], ...].
   */
  weighted(entries) {
    let total = 0;
    for (let i = 0; i < entries.length; i++) total += entries[i][1];
    let r = this.next() * total;
    for (let i = 0; i < entries.length; i++) {
      r -= entries[i][1];
      if (r <= 0) return entries[i][0];
    }
    return entries[entries.length - 1][0];
  }
  /** Fisher-Yates, in place. */
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }
  /** Roughly gaussian via the sum of four uniforms. */
  gauss() {
    return (this.next() + this.next() + this.next() + this.next() - 2) * 1.1;
  }
}

/** Shared, non-deterministic RNG for cosmetic effects. */
export const rand = new Rng((Math.random() * 0xffffffff) >>> 0);

/**
 * Fixed-capacity object pool. Growth is allowed but logged in dev, because a
 * pool that keeps growing usually means something forgot to release.
 */
export class Pool {
  constructor(factory, capacity = 64, reset = null) {
    this.factory = factory;
    this.reset = reset;
    this.free = [];
    this.capacity = capacity;
    for (let i = 0; i < capacity; i++) this.free.push(factory(i));
  }
  acquire() {
    const obj = this.free.pop() ?? this.factory(this.capacity++);
    return obj;
  }
  release(obj) {
    if (this.reset) this.reset(obj);
    this.free.push(obj);
  }
}

/**
 * Swap-remove from an array. O(1), does not preserve order — which is exactly
 * what every entity list in this game wants.
 */
export const swapRemove = (arr, i) => {
  const last = arr.length - 1;
  if (i !== last) arr[i] = arr[last];
  arr.length = last;
};

/** Zero-padded integer, for score readouts. */
export const pad = (n, width) => String(Math.max(0, Math.floor(n))).padStart(width, '0');

/** 12345 -> "12,345" */
export const commafy = (n) => Math.floor(n).toLocaleString('en-US');

/** Seconds -> "M:SS" */
export const timeString = (sec) => {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Cheap 1D value noise, smooth and periodic-free. Good for camera drift. */
export const noise1 = (x) => {
  const i = Math.floor(x);
  const f = x - i;
  const h = (n) => {
    let t = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
    t ^= t >>> 13;
    t = Math.imul(t, 0xc2b2ae35);
    return ((t ^ (t >>> 16)) >>> 0) / 4294967296 * 2 - 1;
  };
  return lerp(h(i), h(i + 1), smoothstep(f));
};
