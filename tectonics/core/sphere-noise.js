// Smooth, seedable scalar noise on the unit sphere with no tables and no
// dependencies: a sum of random plane waves across a few octaves. Adequate for
// warping coastlines and craton outlines at global scale. It is not a
// substitute for simplex noise at render detail and is never used for that.

import { rand01 } from './hash-rng.js';

const WAVES_PER_OCTAVE = 3;

export function makeSphereNoise({ seed, tag = 0, octaves = 5, baseFreq = 2.5, lacunarity = 1.9, gain = 0.55 } = {}) {
  const waves = [];
  let amp = 1, freq = baseFreq, total = 0;
  for (let o = 0; o < octaves; o++) {
    for (let w = 0; w < WAVES_PER_OCTAVE; w++) {
      const id = o * WAVES_PER_OCTAVE + w;
      const u = rand01(seed, tag, 1, id) * 2 - 1;
      const th = rand01(seed, tag, 2, id) * 2 * Math.PI;
      const r = Math.sqrt(1 - u * u);
      waves.push({
        kx: r * Math.cos(th) * freq, ky: r * Math.sin(th) * freq, kz: u * freq,
        phase: rand01(seed, tag, 3, id) * 2 * Math.PI, amp,
      });
    }
    total += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  // Normalise so the typical magnitude is ~1 rather than the worst case.
  const norm = 1 / (total * Math.sqrt(WAVES_PER_OCTAVE / 2));
  return function noise(x, y, z) {
    let s = 0;
    for (let i = 0; i < waves.length; i++) {
      const w = waves[i];
      s += w.amp * Math.cos(w.kx * x + w.ky * y + w.kz * z + w.phase);
    }
    return s * norm;
  };
}
