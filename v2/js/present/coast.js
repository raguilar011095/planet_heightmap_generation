// G2 — coasts drawn as coasts, not as the pieces' outlines (plans/GENERATE_REDESIGN_PLAN.md §3.1; owner: "I don't like
// how obvious the grid looks"). The land the pieces give (as edited) becomes a signed distance in km, smoothed over
// ~coastSmoothKm so no piece's outline shows, and moved by a broad shape at continent scale (bights and promontories a
// thousand km and more across); the threshold is set so the land's share is what the pieces gave — Land Coverage holds.
// What a raised piece adds is land around about its outline, its coast drawn with the rest. Finer than the sim mesh,
// Evolution's terrain draws the coast itself (coast noise, curved reads: synthesize.js).

import { FastNoise } from '../core/fast-noise.js';
import { dijkstraCells } from './plates.js';
import { PRESENT } from './present-config.js';

const R = 6371;

/**
 * @param {Object} L  the layout (present/layout.js)   @param {Uint8Array} landNow  the pieces' land per cell, as edited
 * @returns {Uint8Array} the land, redrawn
 */
export function naturalCoast(L, landNow, cfg = PRESENT) {
    const { mesh, xyz, seed } = L, n = mesh.numRegions, { adjOffset, adjList } = mesh;
    let target = 0; for (let c = 0; c < n; c++) target += landNow[c];
    if (target === 0 || target === n) return landNow.slice();
    // signed distance to the coast, km (+ on land)
    const sea = new Uint8Array(n); for (let c = 0; c < n; c++) sea[c] = landNow[c] ? 0 : 1;
    const toSea = dijkstraCells(mesh, xyz, sea), toLand = dijkstraCells(mesh, xyz, landNow);
    let phi = new Float32Array(n), tmp = new Float32Array(n);
    for (let c = 0; c < n; c++) phi[c] = landNow[c] ? toSea[c] - 0.5 * edgeKm(n) : -(toLand[c] - 0.5 * edgeKm(n));
    // smoothed: each pass the mean of a cell and its ~6 neighbours, which spreads it by ~0.43 edge² a pass — so a
    // Gaussian of σ = coastSmoothKm takes (σ / edge)² / 0.43 passes (in km: the same on any mesh)
    const passes = Math.max(1, Math.round((cfg.coastSmoothKm / edgeKm(n)) ** 2 / 0.43));
    for (let p = 0; p < passes; p++) {
        for (let c = 0; c < n; c++) {
            let s = phi[c], k = 1;
            for (let j = adjOffset[c]; j < adjOffset[c + 1]; j++) { s += phi[adjList[j]]; k++; }
            tmp[c] = s / k;
        }
        [phi, tmp] = [tmp, phi];
    }
    // the broad shape: two octaves of smooth noise at continent scale, its own stream
    const noise = new FastNoise((seed ^ 0xc0a5) >>> 0), f = R / cfg.coastShapeWaveKm;
    for (let c = 0; c < n; c++) {
        const x = xyz[3 * c] * f, y = xyz[3 * c + 1] * f, z = xyz[3 * c + 2] * f;
        phi[c] += cfg.coastShapeKm * (noise.noise3D(x, y, z) + 0.5 * noise.noise3D(2 * x + 31.7, 2 * y - 11.3, 2 * z + 5.1)) / 1.5;
    }
    // the level that keeps the land's share
    let lo = -4000, hi = 4000;
    for (let it = 0; it < 40; it++) {
        const mid = 0.5 * (lo + hi);
        let count = 0; for (let c = 0; c < n; c++) count += phi[c] > mid ? 1 : 0;
        if (count > target) lo = mid; else hi = mid;
    }
    const level = 0.5 * (lo + hi), out = new Uint8Array(n);
    for (let c = 0; c < n; c++) out[c] = phi[c] > level ? 1 : 0;
    // landmasses the pieces keep apart stay apart (the Continents slider): each cell is the nearest landmass's, and where
    // two different ones' land would touch, the sea runs between them
    const owner = nearestLandmass(mesh, xyz, landNow);
    const cut = [];
    for (let c = 0; c < n; c++) {
        if (!out[c]) continue;
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const nb = adjList[k]; if (out[nb] && owner[nb] !== owner[c]) { cut.push(c); break; } }
    }
    for (const c of cut) out[c] = 0;
    return out;
}

/** Each cell's nearest landmass (connected land), by a Dijkstra in km from all of them at once. */
function nearestLandmass(mesh, xyz, land) {
    const n = mesh.numRegions, { adjOffset, adjList } = mesh, id = new Int32Array(n).fill(-1);
    let next = 0;
    const src = [];
    for (let s = 0; s < n; s++) {
        if (!land[s] || id[s] >= 0) continue;
        const q = [s]; id[s] = next;
        while (q.length) { const c = q.pop(); src.push(c); for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const nb = adjList[k]; if (land[nb] && id[nb] < 0) { id[nb] = next; q.push(nb); } } }
        next++;
    }
    const dist = new Float64Array(n).fill(Infinity);
    for (const c of src) dist[c] = 0;
    // (a breadth-first sweep in km, relaxed until it settles: the landmasses are few and the sea is crossed in a few
    // hundred steps of the sim mesh)
    let front = src;
    while (front.length) {
        const nextFront = [];
        for (const c of front) for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
            const nb = adjList[k];
            const d = dist[c] + R * Math.acos(Math.min(1, xyz[3 * c] * xyz[3 * nb] + xyz[3 * c + 1] * xyz[3 * nb + 1] + xyz[3 * c + 2] * xyz[3 * nb + 2]));
            if (d < dist[nb] - 1e-6) { dist[nb] = d; id[nb] = id[c]; nextFront.push(nb); }
        }
        front = nextFront;
    }
    return id;
}

const edgeKm = (n) => Math.PI * R / Math.sqrt(n);
