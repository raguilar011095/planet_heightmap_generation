// F2 — closed basins. A hollow in the land fills with water until it spills — unless its inflow cannot make up what the
// lake would lose to evaporation: then it stays closed, its lake shrinking to the level where the two balance (the
// Great Basin, the Caspian, the Dead Sea, a salt pan). Without the water drawn, that lake is a flat floor — a playa —
// and the rivers of its catchment end there (carve.js: sink, base), instead of being led out over its rim.

import { MinHeap } from '../core/min-heap.js';

/**
 * @param {Object} mesh
 * @param {Float32Array} z        heights (km); raised in place where a closed basin's floor is levelled
 * @param {Float32Array} runoff   runoff per cell (mm/year)
 * @param {Float32Array} pet      potential evaporation (mm/year)
 * @param {Float32Array} rain     rain (mm/year)
 * @param {number} cellKm2
 * @returns {{sink: Uint8Array, base: Float32Array, basins: number, levelled: number}}
 */
export function closedBasins(mesh, z, runoff, pet, rain, cellKm2, F, broad = null) {
    const { adjOffset, adjList, numCells: n } = mesh;
    // ── the priority flood from the sea: each land cell's spill level, and the way it was reached (toward the sea) ──
    const fill = new Float32Array(n), parent = new Int32Array(n).fill(-1), order = new Int32Array(n), done = new Uint8Array(n), heap = new MinHeap(1 << 16);
    let count = 0;
    for (let c = 0; c < n; c++) {
        if (z[c] > 0) continue;
        done[c] = 2;
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const nb = adjList[k]; if (z[nb] > 0 && parent[nb] < 0) { parent[nb] = c; fill[nb] = z[nb]; heap.push(fill[nb], nb); } }
    }
    while (heap.size) {
        const c = heap.pop();
        if (done[c]) continue;
        done[c] = 1; order[count++] = c;
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
            const nb = adjList[k];
            if (done[nb] || !(z[nb] > 0)) continue;
            const level = Math.max(fill[c], z[nb]);
            if (parent[nb] < 0 || level < fill[nb]) { parent[nb] = c; fill[nb] = level; heap.push(level, nb); }
        }
    }
    // (the tectonic surface's own hollows — rifts, forelands, closed basins — where lakes may stand; the finishing's
    // later hollows are breached or filled: finish-hydro.js. Read on `broad` — the surface on a coarser mesh, {mesh, z,
    // nearest: each cell's coarse cell}, where a range's ridges and troughs, a lowland's hummocks, have averaged away and
    // the basins hundreds of km across stand — so a trough between two ridges is no lake's place)
    const tectonic = new Uint8Array(n);
    if (broad) {
        const bf = spillLevels(broad.mesh, broad.z).fill, deep = new Uint8Array(broad.mesh.numCells);
        for (let c = 0; c < deep.length; c++) if (broad.z[c] > 0 && bf[c] > broad.z[c] + F.tectonicHollowKm) deep[c] = 1;
        for (let i = 0; i < count; i++) { const c = order[i]; tectonic[c] = deep[broad.nearest[c]]; }
    } else for (let i = 0; i < count; i++) { const c = order[i]; if (fill[c] > z[c] + F.tectonicHollowKm) tectonic[c] = 1; }
    // ── the hollows: cells under their spill level, in patches of one level (one lake each, if it were full) ──
    const EPS = 1e-4, lake = new Int32Array(n).fill(-1), lakes = [];
    for (let i = 0; i < count; i++) {
        const s = order[i];
        if (lake[s] >= 0 || !(fill[s] > z[s] + EPS)) continue;
        const id = lakes.length, cells = [s], L = fill[s];
        lake[s] = id;
        for (let q = 0; q < cells.length; q++) for (let k = adjOffset[cells[q]]; k < adjOffset[cells[q] + 1]; k++) {
            const nb = adjList[k];
            if (lake[nb] < 0 && done[nb] === 1 && fill[nb] > z[nb] + EPS && Math.abs(fill[nb] - L) < 1e-6) { lake[nb] = id; cells.push(nb); }
        }
        lakes.push({ cells, level: L, inflow: 0 });
    }
    // ── each cell's water goes to the first hollow on its way to the sea (the flood's way back: every cell after the
    // cell it was reached from): a lake's inflow is its catchment's runoff (km² · mm / year) ──
    const first = new Int32Array(n).fill(-1);
    for (let i = 0; i < count; i++) {
        const c = order[i], p = parent[c];
        first[c] = lake[c] >= 0 ? lake[c] : p >= 0 && done[p] === 1 ? first[p] : -1;
        if (first[c] >= 0) lakes[first[c]].inflow += runoff[c] * cellKm2;
    }
    // ── closed where the full lake would lose more than it gets; its floor levelled where they balance ──
    const sink = new Uint8Array(n), base = new Float32Array(n);
    let basins = 0, levelled = 0;
    for (const L of lakes) {
        const area = L.cells.length * cellKm2;
        if (area < F.basinMinKm2) continue;
        let deficit = 0;
        for (const c of L.cells) deficit += Math.max(0, pet[c] - rain[c]);
        deficit /= L.cells.length;                                    // (mm/year a lake here loses, net of the rain on it)
        if (!(deficit > 0) || L.inflow >= deficit * area) continue;   // (it fills and spills: an open basin — the rivers lead it out)
        // the lake that balances: the lowest cells, as much area as its inflow can keep wet
        const keep = Math.max(cellKm2, L.inflow / deficit), cells = L.cells.slice().sort((a, b) => z[a] - z[b]);
        const k = Math.min(cells.length - 1, Math.max(0, Math.round(keep / cellKm2) - 1)), level = z[cells[k]];
        for (let i = 0; i <= k; i++) { const c = cells[i]; if (z[c] < level) { z[c] = level; levelled++; } sink[c] = 1; base[c] = level; }
        basins++;
    }
    return { sink, base, basins, levelled, tectonic };
}

/** Each land cell's spill level: a priority flood from the sea (cells at or below 0). */
function spillLevels(mesh, z) {
    const { adjOffset, adjList, numCells: n } = mesh, fill = new Float32Array(n), done = new Uint8Array(n), heap = new MinHeap(1 << 14);
    for (let c = 0; c < n; c++) {
        if (z[c] > 0) continue;
        done[c] = 1; fill[c] = z[c];
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const nb = adjList[k]; if (z[nb] > 0) heap.push(z[nb], nb); }
    }
    while (heap.size) {
        const L = heap.keys[0], c = heap.pop();
        if (done[c]) continue;
        done[c] = 1; fill[c] = Math.max(L, z[c]);
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const nb = adjList[k]; if (!done[nb]) heap.push(Math.max(fill[c], z[nb]), nb); }
    }
    return { fill };
}
