// Stateless, addressed randomness.
//
// Every draw is a pure function of (seed, pass, step, cell, k). There is no
// stream and no ordering, so disabling a pass, or changing how many cells a
// neighbouring pass touches, cannot shift anyone else's numbers. This is what
// makes A/B comparison between runs meaningful. See ARCHITECTURE.md §4.3.
//
// All inputs are coerced to uint32. Seeds larger than 2^32 alias; keep them in range.

const GOLD = 0x9e3779b9;

// murmur3 finaliser — a cheap, well-distributed 32-bit mixer.
export function mix32(h) {
  h = (h ^ (h >>> 16)) >>> 0;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

// Folds one more value into a running hash (boost::hash_combine shape, then remixed).
export function combine(h, v) {
  v = v >>> 0;
  return mix32((h ^ (v + GOLD + ((h << 6) >>> 0) + (h >>> 2))) >>> 0);
}

// FNV-1a over UTF-16 code units, remixed. Used for pass ids.
export function hashString(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h = (h ^ s.charCodeAt(i)) >>> 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return mix32(h);
}

export function hash5(a, b, c, d, e) {
  let h = mix32((a >>> 0) ^ GOLD);
  h = combine(h, b); h = combine(h, c); h = combine(h, d); h = combine(h, e);
  return h;
}

// Uniform in [0, 1).
export function rand01(seed, passHash, step, cell, k = 0) {
  return hash5(seed, passHash, step, cell, k) / 4294967296;
}

export function randRange(seed, passHash, step, cell, k, lo, hi) {
  return lo + (hi - lo) * rand01(seed, passHash, step, cell, k);
}
