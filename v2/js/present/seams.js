// G3b — the pieces jostle (plans/GENERATE_REDESIGN_PLAN.md; owner, 2026-11-03: "adding back in some of the inner/smaller
// plate collisions for noise (in whatever way could make sense, doesnt need to be that realistic) could force more
// interesting and 'organic' looking shapes", and "variety based on the mesh and directions of the collisions at the
// macro and micro level and how that spreads").
//
// Inside a plate, where two land pieces meet, the pieces' own motion today (js/plate-physics.js — what today's Generate
// built its mountains from) says what their seam did in the past: one closing raised a range, replayed with the rest
// of the continents' past (present/past.js: worn by its age, most of them old and low, a few young); one parting sagged
// into a basin — a lowland inland, a gulf or a shallow sea where it meets the coast. Each seam its own draw.
//
// And the grain: every closing front — a plate edge's belt, an old weld or ring, an inner seam — gives the ground around
// it a grain along its strike, spreading out and fading with distance: the fine relief (present/relief.js) is drawn out
// along it, so spurs and valleys run along the ranges near them and wander freely far from any.

import { makeRng } from '../../../js/rng.js';
import { MinHeap } from '../core/min-heap.js';
import { OrogenyType, BeltSide } from '../tectonics/model/crust.js';
import { Boundary } from './plates.js';
import { PRESENT } from './present-config.js';

const R = 6371;

/**
 * The inner seams: each pair of land pieces on one plate where they meet on the land, and what the pieces' motion did
 * there.
 * @param {Object} L  the layout   @param {Object} W  the plates   @param {Uint8Array} land  the land per sim cell
 * @param {Uint8Array} crustLand  each sim cell's piece is land (as edited): a seam is where two land pieces meet
 * @param {Int32Array} [wp]  each land cell's piece as bent (present/warp.js, G4c): the seams run along the bent outlines
 * @returns {{events: Object[], sags: {cells: number[], depthKm: number}[], count: number}}  events: closing seams as past
 *   collisions (present/past.js's event form); sags: parting seams
 */
export function pieceSeams(L, W, land, crustLand, cfg = PRESENT, wp = null) {
    const { mesh, seed } = L, n = mesh.numRegions, { adjOffset, adjList } = mesh, G = W.graph, cp = wp ?? G.cellP;
    const pairs = new Map();
    for (let c = 0; c < n; c++) {
        if (!land[c] || !crustLand[c]) continue;
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
            const nb = adjList[k];
            if (!land[nb] || !crustLand[nb] || cp[nb] === cp[c] || W.cellPlate[nb] !== W.cellPlate[c]) continue;
            // (two pieces of one plate: a bent outline can bring another plate's piece across a plate edge — not a seam)
            if (W.piecePlate[cp[nb]] !== W.piecePlate[cp[c]] || W.piecePlate[cp[c]] < 0) continue;
            const key = Math.min(cp[c], cp[nb]) * 4096 + Math.max(cp[c], cp[nb]);
            if (!pairs.has(key)) pairs.set(key, new Set());
            pairs.get(key).add(c);
        }
    }
    const keys = [...pairs.keys()].sort((a, b) => a - b);
    const rateOf = (key) => G.seam[Math.floor(key / 4096)].get(key % 4096) ?? 0;
    // (each planet's seams by their own spread: the pieces of one continent may move nearly together, and the seams then
    // still differ — the owner asked for variety, not realism)
    const rms = Math.sqrt(keys.reduce((s, k) => s + rateOf(k) ** 2, 0) / Math.max(1, keys.length)) || 1;
    const events = [], sags = [], [a0, a1] = cfg.seamAgeMyr, [w0, w1] = cfg.seamWorkKm;
    for (const key of keys) {
        const cells = [...pairs.get(key)].sort((a, b) => a - b);
        if (cells.length < cfg.seamMinCells) continue;
        const s = rateOf(key) / rms, i = Math.floor(key / 4096), j = key % 4096;
        const rng = makeRng((seed ^ 0x5ea3) + i * 131 + j * 17);        // (its own draw)
        const r1 = rng(), r2 = rng();
        if (s < -cfg.seamQuiet) {
            const strength = Math.min(cfg.seamMaxStrength, -s);
            events.push({ age: Math.exp(Math.log(a0) + (Math.log(a1) - Math.log(a0)) * r1), kind: 'seam', type: OrogenyType.URAL,
                side: BeltSide.NONE, front: cells, work: (w0 + (w1 - w0) * r2) * strength, allow: (c) => land[c] === 1, strength: 1 });
        } else if (s > cfg.seamQuiet) {
            sags.push({ cells, depthKm: cfg.seamSagKm * Math.min(cfg.seamMaxStrength, s) * (0.6 + 0.8 * r2) });
        }
    }
    return { events, sags, count: keys.length };
}

/** The parting seams sagged: each a trough along its seam, Gaussian across (seamSagWidthKm), on the land's base height. */
export function sagSeams(L, land, crust, sags, cfg = PRESENT) {
    if (!sags.length) return;
    const { mesh, xyz } = L, n = mesh.numRegions, sigma = cfg.seamSagWidthKm, reach = 3 * sigma;
    const d = new Float64Array(n).fill(Infinity), heap = new MinHeap(1024), touched = [];
    for (const sag of sags) {
        for (const c of sag.cells) { d[c] = 0; heap.push(0, c); touched.push(c); }
        while (heap.size) {
            const c = heap.pop(), dc = heap.lastKey;
            if (dc > d[c]) continue;
            for (let k = mesh.adjOffset[c]; k < mesh.adjOffset[c + 1]; k++) {
                const nb = mesh.adjList[k];
                if (!land[nb]) continue;
                const nd = dc + kmBetween(xyz, c, nb);
                if (nd < d[nb] && nd <= reach) { if (d[nb] === Infinity) touched.push(nb); d[nb] = nd; heap.push(nd, nb); }
            }
        }
        for (const c of touched) { crust.baseKm[c] -= sag.depthKm * Math.exp(-0.5 * (d[c] / sigma) ** 2); d[c] = Infinity; }
        touched.length = 0;
    }
}

/**
 * How far each sim cell lies from the nearest closing front (km): today's convergent plate edges (the land side of a
 * trench, a collision, a transform pressed together) and every front the past replayed (welds, rings, closing seams).
 * The grain of the ground around them (present/relief.js).
 */
export function frontDistance(L, B, land, pastEvents) {
    const { mesh, xyz } = L, n = mesh.numRegions, d = new Float32Array(n).fill(Infinity), heap = new MinHeap(4096);
    const seed = (c) => { if (d[c] > 0) { d[c] = 0; heap.push(0, c); } };
    for (let i = 0; i < B.count; i++) {
        const k = B.kind[i];
        if (k === Boundary.COLLISION) { seed(B.cellA[i]); seed(B.cellB[i]); }
        else if (k === Boundary.SUBDUCTION) seed(B.over[i] === 0 ? B.cellA[i] : B.cellB[i]);
        else if (k === Boundary.TRANSFORM && B.openCmYr[i] < 0 && (B.landA[i] || B.landB[i])) { seed(B.cellA[i]); seed(B.cellB[i]); }
    }
    for (const ev of pastEvents) for (const c of ev.front) seed(c);
    while (heap.size) {
        const c = heap.pop(), dc = heap.lastKey;
        if (dc > d[c]) continue;
        for (let k = mesh.adjOffset[c]; k < mesh.adjOffset[c + 1]; k++) {
            const nb = mesh.adjList[k], nd = dc + kmBetween(xyz, c, nb);
            if (nd < d[nb]) { d[nb] = nd; heap.push(nd, nb); }
        }
    }
    return d;
}

function kmBetween(xyz, a, b) {
    return R * Math.acos(Math.max(-1, Math.min(1, xyz[3 * a] * xyz[3 * b] + xyz[3 * a + 1] * xyz[3 * b + 1] + xyz[3 * a + 2] * xyz[3 * b + 2])));
}
