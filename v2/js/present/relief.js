// Detail that holds up close (owner, 2026-11-03: "the actual heights are still blobby regardless of the [Detail] slider").
// Evolution's terrain keeps its finest relief faint — hills from 120 km, three octaves of ridge noise — and draws the
// rest only with Add detail (finish/, fine-detail.js), so on Generate's mesh a range looked the same at 204K and at 1M.
// Here the uplands and mountains are given a ridged fractal of their own, its octaves from reliefFromKm down to what the
// terrain mesh can show (each faded in as Evolution's own are: a wave needs minWavesPerCell…fullWavesPerCell cells), so
// a finer Detail draws finer spurs and ravines. It is laid down before the rivers carve, so they cut through it: the
// spurs end in valleys, as a dissected range's do. Its strength follows the ground's height (none on the plains and at
// the shore, where Evolution's hills are), varied across the planet by a broad noise, and the Roughness slider.

import { FastNoise } from '../core/fast-noise.js';
import { PRESENT } from './present-config.js';

const R = 6371;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// the ridged value's mean, (1 − |n|)² over the noise's own spread — measured once, so the relief adds no net height
let ridgedMean = null;
function meanOfRidged(noise) {
    if (ridgedMean !== null) return ridgedMean;
    let s = 0; const N = 20000;
    for (let i = 0; i < N; i++) { const r = 1 - Math.abs(noise.noise3D(i * 0.7317 + 0.13, i * 0.3191 - 4.7, i * 0.5531 + 9.1)); s += r * r; }
    return (ridgedMean = s / N);
}

/**
 * Adds the fine relief to a terrain surface, in place.
 * @param {Float32Array} heightKm  the surface (km), before the carving
 * @param {Float32Array} xyz       the terrain mesh's unit positions
 * @param {number} edgeKm          its mean spacing   @param {number} seed
 * @param {{minWavesPerCell: number, fullWavesPerCell: number}} terrainCfg  the terrain's fade
 * @param {number} share           its strength (cfg.reliefShare × the Roughness slider's factor; 0: none)
 */
export function addFineRelief(heightKm, xyz, edgeKm, seed, terrainCfg, share, cfg = PRESENT) {
    if (!(share > 0)) return;
    const fade = (lam) => smooth(terrainCfg.minWavesPerCell, terrainCfg.fullWavesPerCell, lam / edgeKm);
    const F = [], A = [];
    for (let o = 0, lam = cfg.reliefFromKm, a = 1; o < 8; o++, lam /= 2, a *= cfg.reliefRoughness) {
        const show = fade(lam);
        if (show <= 0.01) break;
        F.push(R / lam); A.push(a * show);
    }
    if (!F.length) return;
    const noise = new FastNoise((seed ^ 0x7e1f) >>> 0), m = meanOfRidged(noise);
    const varyF = R / cfg.reliefVaryKm, [lo, hi] = cfg.reliefRiseKm;
    for (let c = 0; c < heightKm.length; c++) {
        const h = heightKm[c];
        if (h <= lo) continue;
        const x = xyz[3 * c], y = xyz[3 * c + 1], z = xyz[3 * c + 2];
        // (rugged in some places, smoother in others)
        const vary = 1 + cfg.reliefVary * noise.noise3D(x * varyF + 51.3, y * varyF - 7.7, z * varyF + 23.9);
        let v = 0;
        for (let o = 0; o < F.length; o++) {
            const f = F[o], r = 1 - Math.abs(noise.noise3D(x * f + 3.1 * o, y * f - 1.9 * o, z * f + 0.7 * o));
            v += A[o] * (r * r - m);
        }
        heightKm[c] = h + share * vary * h * smooth(lo, hi, h) * v;
    }
}
