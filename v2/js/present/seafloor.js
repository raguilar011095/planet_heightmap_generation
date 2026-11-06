// G2 — the sea floor's past in closed form (plans/GENERATE_REDESIGN_PLAN.md §3.2): each ocean cell's age is the time
// the floor took to travel from its ridge — distance ÷ half the spreading rate there — so the floor deepens away from
// the ridges by half-space cooling (Evolution's seaDepthKm), a passive margin is as old as the floor beside it (wide
// shelves on old oceans, narrow on young ones: records.js reads it), and the fracture zones run where Evolution draws them
// (their coordinate is the distance from the two plates' relative pole, model/segments.js).

import { MinHeap } from '../core/min-heap.js';
import { fractureCoordinate } from '../tectonics/model/segments.js';
import { Boundary } from './plates.js';
import { genToEvoVec } from './layout.js';
import { PRESENT } from './present-config.js';

const R = 6371;

/**
 * @param {Object} L  the layout (present/layout.js)   @param {Object} W  the plates (present/plates.js)
 * @param {Object} B  the boundaries (classifyBoundaries)   @param {Uint8Array} land  the crust's land per cell, as drawn
 * @returns {{ageMyr: Float32Array, fzU: Float32Array}}  per sim cell (land: 0)
 */
export function seaFloorAges(L, W, B, land, cfg = PRESENT) {
    const { mesh, xyz } = L, n = mesh.numRegions, { adjOffset, adjList } = mesh, plateOf = W.cellPlate;
    const time = new Float64Array(n).fill(Infinity);             // Myr since the floor formed
    const speed = new Float32Array(n);                           // km/Myr the floor here moved away from its ridge
    const pole = new Int32Array(n).fill(-1);                     // which ridge edge it came from (its spreading pole)
    const heap = new MinHeap(4096);
    const minHalf = cfg.minHalfSpreadCmYr * 10;
    for (let i = 0; i < B.count; i++) {
        if (B.kind[i] !== Boundary.RIDGE) continue;
        const half = Math.max(minHalf, 0.5 * B.openCmYr[i] * 10);
        for (const c of [B.cellA[i], B.cellB[i]]) {
            if (land[c] || time[c] === 0) continue;
            time[c] = 0; speed[c] = half; pole[c] = i; heap.push(0, c);
        }
    }
    const at = (c) => [xyz[3 * c], xyz[3 * c + 1], xyz[3 * c + 2]];
    const km = (a, b) => R * Math.acos(Math.max(-1, Math.min(1, xyz[3 * a] * xyz[3 * b] + xyz[3 * a + 1] * xyz[3 * b + 1] + xyz[3 * a + 2] * xyz[3 * b + 2])));
    const spread = (canEnter) => {
        while (heap.size) {
            const c = heap.pop(), tc = heap.lastKey;
            if (tc > time[c]) continue;
            for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
                const nb = adjList[k];
                if (land[nb] || !canEnter(c, nb)) continue;
                const t = tc + km(c, nb) / speed[c];
                if (t < time[nb]) { time[nb] = t; speed[nb] = speed[c]; pole[nb] = pole[c]; heap.push(t, nb); }
            }
        }
    };
    // away from the ridges, over each plate's own floor (a ridge's floor never crosses into another plate)
    spread((a, b) => plateOf[a] === plateOf[b]);
    const fromRidge = new Uint8Array(n); for (let c = 0; c < n; c++) fromRidge[c] = time[c] < Infinity ? 1 : 0;
    // floor no ridge reaches (a plate with no ridge of its own, a sea cut off by land): older still, ageing on from the
    // floor around it at a slow pace — or from its plate's edges, if nothing reached it at all
    const slow = cfg.unreachedHalfSpreadCmYr * 10;
    for (let c = 0; c < n; c++) if (!land[c] && time[c] < Infinity) { speed[c] = slow; heap.push(time[c], c); }
    spread(() => true);
    for (let c = 0; c < n; c++) {
        if (land[c] || time[c] < Infinity) continue;
        let edge = false;
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) if (land[adjList[k]] || plateOf[adjList[k]] !== plateOf[c]) { edge = true; break; }
        if (edge) { time[c] = cfg.unreachedStartMyr; speed[c] = slow; heap.push(time[c], c); }
    }
    spread(() => true);

    const ageMyr = new Float32Array(n), fzU = new Float32Array(n);
    for (let c = 0; c < n; c++) {
        if (land[c]) continue;
        ageMyr[c] = Math.min(cfg.maxFloorAgeMyr, time[c] < Infinity ? time[c] : cfg.maxFloorAgeMyr);
        const i = pole[c];
        if (i < 0 || !fromRidge[c]) continue;                     // (floor no ridge reached has no fracture zones)
        // the spreading pole: the two plates' relative rotation, in Evolution's frame (as the terrain reads positions)
        const a = W.plates[B.a[i]].euler, b = W.plates[B.b[i]].euler;
        const rel = genToEvoVec([b[0] - a[0], b[1] - a[1], b[2] - a[2]]), p = genToEvoVec(at(c));
        fzU[c] = fractureCoordinate(p[0], p[1], p[2], rel);
    }
    return { ageMyr, fzU };
}
