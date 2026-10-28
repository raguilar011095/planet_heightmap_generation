// The rocks shape the land (plans/V2_LITHOLOGY_RELIEF_PLAN.md L3): the finish works out what its surface is made of before
// its rivers cut it — the rocks the history's record puts there (geology/rocks.js on the uncarved surface: no river plains,
// dunes or moraines yet) — and lets that shape the relief, as differential erosion does:
//   · hard rock stands and soft rock is worn down: the surface raised or lowered by how much harder each place's rock is
//     than its region's — as far as the history has stripped the ground (an old worn belt or shield the most; a young
//     range, which its rising shapes, little) — the region's mean kept, so the land's heights stay where they were;
//   · the carve agrees: its stream power cuts soft rock faster (its k), and hard rock holds steeper sides (its critical
//     slope); soil creep and the dissection work soft rock more;
//   · where the rivers cut into layered cover its walls are stepped — bed on bed, as carve.js steps a flood basalt — crisp
//     where it is dry (benches, mesas' rims, a canyon's stair).
// The rocks are classified again after the carving, as always — their relief read without what the rock itself added (so a
// hard ridge raised by it keeps its hard rock): the ridges stand on the hard rock by construction.

import { classifyRocks, simRocks } from '../geology/rocks.js';
import { rockHard } from '../geology/lithology.js';
import { GEOLOGY } from '../geology/geology-config.js';
import { decodeUnroofKm, decodeExhumKm } from '../tectonics/model/geology.js';
import { LatLonGrid } from './finish-grid.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * The rocks of the uncarved surface and what they do: per cell, the rock (rocks.js Rock), its hardness (0…1, a soluble
 * rock's by the climate — lithology.js), how bedded it is, and the cover's thickness (km, the record's, read smoothly).
 * @param {Object} o  { mesh, z (km), frame, simMesh, seed, cfg (the terrain's), recCell, cues, lat, lon (°), rain (mm), temp (°C), grid (LatLonGrid 0.25°) }
 */
export function rocksBefore(o, G = GEOLOGY) {
    const { mesh, z, frame, simMesh, seed, cfg, recCell, cues, lat, lon, rain, temp, grid } = o, n = mesh.numCells, L = G.lithology;
    const ocean = new Uint8Array(n);
    for (let c = 0; c < n; c++) if (!(z[c] > 0)) ocean[c] = 1;
    const { rock } = classifyRocks({ mesh, z, ocean, frame, simMesh, seed, cfg, recCell, on: { grid, lat, lon }, local: { cues } }, G);
    const hard = new Float32Array(n), bedded = new Float32Array(n);
    for (let c = 0; c < n; c++) {
        const k = rock[c];
        if (!k) continue;
        hard[c] = rockHard(k, temp[c] === temp[c] ? temp[c] : 10, rain[c] === rain[c] ? rain[c] : 600, G);
        bedded[c] = L.bedded[k];
    }
    // (a cell's hardness with its neighbours' — a contact a cell or so wide, not a step between two cells)
    const { adjOffset, adjList } = mesh, was = hard.slice();
    for (let c = 0; c < n; c++) {
        if (!rock[c]) continue;
        let s = was[c], k = 1;
        for (let j = adjOffset[c]; j < adjOffset[c + 1]; j++) { const d = adjList[j]; if (rock[d]) { s += 0.5 * was[d]; k += 0.5; } }
        hard[c] = s / k;
    }
    // (the cover's thickness, as the rocks read it: each cell's record cell's, averaged over a sim cell or so)
    const S = simRocks(frame, simMesh, seed, G), coarse = new LatLonGrid(0.5);
    const T = coarse.blur(coarse.averageMapped(lat, lon, recCell, [S.cover], c => !ocean[c] && S.land[recCell[c]] === 1)[0], G.recordBlurCells * simMesh.edgeKm);
    const cover = new Float32Array(n);
    for (let c = 0; c < n; c++) if (rock[c]) { const v = coarse.at(T, lat[c], lon[c]); cover[c] = v === v ? v : 0; }
    return { rock, hard, bedded, cover };
}

/**
 * Hard rock stands, soft is worn down: z (km) raised or lowered in place by F.lithReliefKm × (the rock's hardness − its
 * region's mean, over F.lithRegionKm) × how much the history has stripped there (F.lithUnroofKm: the record's unroofing
 * since its belt was last active, and a quarter of its whole wear) × how quiet the ground is (none on a rising belt, `hold`,
 * or on lava, `lip`) × how high it stands above its base level (F.lithBaseKm: none on a lowland plain at the rivers' grade,
 * nor at the coast). Returns the change (km), per cell.
 */
export function differentialRelief(mesh, z, rocks, { frame, recCell, lat, lon, hold, lip }, F) {
    const n = mesh.numCells, { hard, rock } = rocks, dz = new Float32Array(n), coarse = new LatLonGrid(0.5);
    const mean = coarse.blur(coarse.average(lat, lon, hard, c => rock[c] > 0), F.lithRegionKm);
    for (let c = 0; c < n; c++) {
        if (!rock[c] || !(z[c] > F.lithBaseKm[0])) continue;
        const w = recCell[c], stripped = Math.max(0, decodeUnroofKm(frame.unroofKm[w])) + 0.25 * decodeExhumKm(frame.exhumKm[w]);
        const m = coarse.at(mean, lat[c], lon[c]);
        if (!(m === m)) continue;
        const k = F.lithReliefKm * smooth(F.lithUnroofKm[0], F.lithUnroofKm[1], stripped) * (1 - Math.min(1, Math.max(0, hold[c]))) * (1 - Math.min(1, lip[c])) * smooth(F.lithBaseKm[0], F.lithBaseKm[1], z[c]);
        if (!(k > 0)) continue;
        dz[c] = k * (hard[c] - m);
        z[c] = Math.max(z[c] + dz[c], Math.min(z[c], F.lithBaseKm[0]));
    }
    return dz;
}

/** The carve's inputs by the rock: its k (soft rock cut faster) and critical slope (hard rock standing steeper), in place. */
export function carveByRock(carveIn, rocks, F) {
    const { k, slope } = carveIn, { hard, rock } = rocks, [s0, s1] = F.lithSlope;
    for (let c = 0; c < k.length; c++) {
        if (!rock[c]) continue;
        k[c] *= Math.exp(F.lithK * (0.5 - hard[c]));
        slope[c] *= s0 + (s1 - s0) * hard[c];
    }
}

/**
 * The stairs in bedded cover (carve.js terraceBasalt's, for sediment): where the rivers have cut into it (`before`, the
 * surface they cut — z after), the ground's height above the cover's foot through a stair of beds ~F.coverStepKm thick,
 * each with its riser (F.coverRiser of it) — by how bedded the rock is, how deep the cut is (an uncut plateau top stays
 * whole) and how dry (crisp where dry, F.coverStairWet of it where wet). Never above the slope it replaces; rivers still
 * run downhill (each cell no lower than the one it drains into — in the carve's order). In place.
 */
export function coverStairs(z, before, C, rocks, rain, lip, F, seed) {
    const { bedded, cover, rock } = rocks, step = F.coverStepKm, riser = F.coverRiser, was = z.slice();
    const levels = [0];
    for (let k = 0; levels[k] < 12; k++) {
        let h = Math.imul(k + 1, 0x9e3779b1) ^ (seed | 0); h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13;
        levels.push(levels[k] + step * (0.6 + 0.8 * ((h >>> 0) / 4294967296)));
    }
    for (let c = 0; c < z.length; c++) {
        if (!rock[c] || !(bedded[c] > 0.02) || !(z[c] > 0)) continue;
        const T = cover[c], foot = before[c] - T, rel = z[c] - foot;
        if (!(T > 0.5 * step) || !(rel > 0)) continue;
        const dry = 1 - smooth(300, 1200, rain[c] === rain[c] ? rain[c] : 600);
        const w = bedded[c] * (F.coverStairWet + (F.coverStairShare - F.coverStairWet) * dry) * smooth(0.25 * step, step, before[c] - z[c]) * (1 - Math.min(1, lip[c])) * smooth(0.5 * step, 2 * step, T);
        if (!(w > 0)) continue;
        let k = 0;
        while (k < levels.length - 2 && levels[k + 1] <= rel) k++;
        const lo = levels[k], s = levels[k + 1] - lo, t = Math.max(0, ((rel - lo) / s - (1 - riser)) / riser);
        z[c] = foot + rel + w * (lo + s * t ** 1.5 - rel);
    }
    for (let i = 0; i < C.order.length; i++) { const c = C.order[i], r = C.recv[c]; if (r >= 0 && z[c] < z[r] && z[c] < was[c]) z[c] = Math.min(was[c], z[r]); }
}
