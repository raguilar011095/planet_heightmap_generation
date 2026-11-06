// G4c — the pieces bent (plans/GENERATE_REDESIGN_PLAN.md; owner, 2026-11-04: "even the inner plate stuff should be more
// warped and twisted too (as should the old mountain building) so the big plates really drive it (and the smally
// plates give texture to the big plates mountains)").
//
// The continents' past (present/past.js) and their inner seams (present/seams.js) are laid along the pieces' outlines
// (G4b). Here those outlines are bent before the past is read from them, as old structures are bent by everything that
// came after:
//   · the drag of today's plates: near a front where a plate is pushed (a collision, a trench's upper plate, a transform
//     pressed together) the ground has been carried along with the push, most at the front and fading inland, so an
//     old seam that runs into the front bends toward it — an orocline — and one beside its end swings round it;
//   · a slow warp at two scales (the broad one bends a seam's course, the finer one twists it), the same over the
//     planet.
// And each piece is made of smaller terranes (the "small plates"), their outlines bent alike: the seams between them are
// the minor, older welts that texture the big ranges and the plains between (past.js).

import { MinHeap } from '../core/min-heap.js';
import { FastNoise } from '../core/fast-noise.js';
import { makeRng } from '../../../js/rng.js';
import { Boundary } from './plates.js';
import { PRESENT } from './present-config.js';

const R = 6371;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const at = (xyz, c) => [xyz[3 * c], xyz[3 * c + 1], xyz[3 * c + 2]];

/**
 * Each land cell's piece as bent, and its terrane within the piece.
 * @param {Object} L  the layout   @param {Object} W  the plates   @param {Object} B  the boundaries
 * @param {Uint8Array} land  the land per sim cell (the coast as drawn)   @param {Uint8Array} crustLand  its piece is land
 * @returns {{tp: Int32Array, wp: Int32Array, sub: Int32Array, dragKm: Float32Array}}  tp: each land cell's piece (−1 at
 *   sea; a land cell carried out onto an ocean piece's edge, the land piece's beside it); wp: the piece as bent; sub:
 *   its terrane (a global id, −1 at sea); dragKm: how far today's plates carried the ground (for the checks)
 */
export function bentPieces(L, W, B, land, crustLand, cfg = PRESENT) {
    const { sim, xyz, seed } = L, n = sim.numCells, { adjOffset, adjList } = sim, cellP = W.graph.cellP;
    const kmOf = (a, b) => R * Math.acos(Math.max(-1, Math.min(1, dot(at(xyz, a), at(xyz, b)))));

    // each land cell's piece (as edited)
    const tp = new Int32Array(n).fill(-1);
    {
        const q = [];
        for (let c = 0; c < n; c++) if (land[c] && crustLand[c]) { tp[c] = cellP[c]; q.push(c); }
        for (let h = 0; h < q.length; h++) {
            const c = q[h];
            for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const nb = adjList[k]; if (land[nb] && tp[nb] < 0) { tp[nb] = tp[c]; q.push(nb); } }
        }
    }
    // the landmasses (a bent outline never takes a piece across the sea)
    const mass = new Int32Array(n).fill(-1);
    for (let s = 0, m = 0; s < n; s++) {
        if (!land[s] || mass[s] >= 0) continue;
        const q = [s]; mass[s] = m;
        for (let h = 0; h < q.length; h++) for (let k = adjOffset[q[h]]; k < adjOffset[q[h] + 1]; k++) { const nb = adjList[k]; if (land[nb] && mass[nb] < 0) { mass[nb] = m; q.push(nb); } }
        m++;
    }

    // ── the drag of today's plates: from every front where a plate is pushed, the push (km) along the other plate's
    // motion against it, fading inland ──
    const push = [], src = new Int32Array(n).fill(-1), dist = new Float64Array(n).fill(Infinity), heap = new MinHeap(1024);
    const pushFrom = (c, other) => {
        if (!land[c]) return;
        const p = at(xyz, c), va = cross(W.plates[W.cellPlate[c]].euler, p), vb = cross(W.plates[other].euler, p);
        const rel = [(vb[0] - va[0]) * R, (vb[1] - va[1]) * R, (vb[2] - va[2]) * R];      // km/Myr, the other plate against this one
        const km = Math.min(cfg.dragMaxKm, Math.hypot(...rel) * cfg.dragMyr), l = Math.hypot(...rel) || 1;
        if (dist[c] === 0 && push[src[c]].km >= km) return;
        if (dist[c] > 0) { dist[c] = 0; heap.push(0, c); }
        src[c] = push.length; push.push({ v: [rel[0] / l, rel[1] / l, rel[2] / l], km });
    };
    for (let i = 0; i < B.count; i++) {
        const k = B.kind[i], a = B.cellA[i], b = B.cellB[i];
        if (k === Boundary.COLLISION || (k === Boundary.TRANSFORM && B.openCmYr[i] < 0)) { pushFrom(a, W.cellPlate[b]); pushFrom(b, W.cellPlate[a]); }
        else if (k === Boundary.SUBDUCTION) { const over = B.over[i] === 0 ? a : b, down = over === a ? b : a; pushFrom(over, W.cellPlate[down]); }
    }
    const reach = 3 * cfg.dragKm;
    while (heap.size) {
        const c = heap.pop(), dc = heap.lastKey;
        if (dc > dist[c]) continue;
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
            const nb = adjList[k];
            if (!land[nb] || W.cellPlate[nb] !== W.cellPlate[c]) continue;
            const nd = dc + kmOf(c, nb);
            if (nd < dist[nb] && nd <= reach) { dist[nb] = nd; src[nb] = src[c]; heap.push(nd, nb); }
        }
    }
    // the carry (a tangent vector, km), smoothed over dragSmoothKm so a front's ends shear rather than tear
    let D = new Float32Array(3 * n);
    for (let c = 0; c < n; c++) {
        if (src[c] < 0) continue;
        const { v, km } = push[src[c]], p = at(xyz, c), s = km * Math.exp(-dist[c] / cfg.dragKm), r = dot(v, p);
        D[3 * c] = s * (v[0] - r * p[0]); D[3 * c + 1] = s * (v[1] - r * p[1]); D[3 * c + 2] = s * (v[2] - r * p[2]);
    }
    const passes = Math.max(1, Math.round((cfg.dragSmoothKm / sim.edgeKm) ** 2 / 0.43));
    for (let it = 0; it < passes; it++) {
        const next = new Float32Array(3 * n);
        for (let c = 0; c < n; c++) {
            if (!land[c]) continue;
            let sx = D[3 * c], sy = D[3 * c + 1], sz = D[3 * c + 2], m = 1;
            for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const nb = adjList[k]; if (!land[nb]) continue; sx += D[3 * nb]; sy += D[3 * nb + 1]; sz += D[3 * nb + 2]; m++; }
            next[3 * c] = sx / m; next[3 * c + 1] = sy / m; next[3 * c + 2] = sz / m;
        }
        D = next;
    }

    // ── the bend: where each land cell's ground came from — carried by the drag, warped at two scales — and the piece
    // there (on the same landmass; else its own) ──
    const noise = new FastNoise((seed ^ 0xb3d7) >>> 0), fB = R / cfg.bendBroadKm, fF = R / cfg.bendFineKm;
    const aB = cfg.bendBroadAmpKm / R, aF = cfg.bendFineAmpKm / R;
    const wp = new Int32Array(n).fill(-1), bent = new Float32Array(3 * n), dragKm = new Float32Array(n);
    const tang = (p, w) => { const r = dot(w, p); return [w[0] - r * p[0], w[1] - r * p[1], w[2] - r * p[2]]; };
    const norm = (p) => { const l = Math.hypot(p[0], p[1], p[2]); return [p[0] / l, p[1] / l, p[2] / l]; };
    for (let c = 0; c < n; c++) {
        if (tp[c] < 0) continue;
        let p = at(xyz, c);
        dragKm[c] = Math.hypot(D[3 * c], D[3 * c + 1], D[3 * c + 2]);
        // (the ground here was carried by the drag from upstream of it)
        p = norm([p[0] - D[3 * c] / R, p[1] - D[3 * c + 1] / R, p[2] - D[3 * c + 2] / R]);
        // (the broad warp, then the fine one read at the broadly warped point: it twists what the broad one bent)
        let w = tang(p, [noise.fbm(p[0] * fB + 11.3, p[1] * fB + 3.1, p[2] * fB + 7.7, 3, 0.5), noise.fbm(p[0] * fB + 2.9, p[1] * fB + 17.2, p[2] * fB + 5.5, 3, 0.5), noise.fbm(p[0] * fB + 23.4, p[1] * fB + 8.8, p[2] * fB + 13.6, 3, 0.5)]);
        p = norm([p[0] + aB * w[0], p[1] + aB * w[1], p[2] + aB * w[2]]);
        w = tang(p, [noise.fbm(p[0] * fF - 5.3, p[1] * fF + 31.1, p[2] * fF + 1.7, 2, 0.5), noise.fbm(p[0] * fF + 41.9, p[1] * fF - 7.2, p[2] * fF + 15.5, 2, 0.5), noise.fbm(p[0] * fF + 3.4, p[1] * fF + 28.8, p[2] * fF - 23.6, 2, 0.5)]);
        p = norm([p[0] + aF * w[0], p[1] + aF * w[1], p[2] + aF * w[2]]);
        bent[3 * c] = p[0]; bent[3 * c + 1] = p[1]; bent[3 * c + 2] = p[2];
        const s = sim.index.nearest(p[2], p[0], p[1]);           // (the sim index is in Evolution's frame: (z, x, y))
        wp[c] = tp[s] >= 0 && mass[s] === mass[c] ? tp[s] : tp[c];
    }

    // ── the terranes within each piece: a few, by area, their outlines bent alike (nearest of the piece's own seeds, read
    // at each cell's bent point) ──
    const sub = new Int32Array(n).fill(-1), byPiece = new Map();
    for (let c = 0; c < n; c++) if (wp[c] >= 0) { let a = byPiece.get(wp[c]); if (!a) byPiece.set(wp[c], a = []); a.push(c); }
    const cellKm2 = 4 * Math.PI * R * R / n;
    let next = 0;
    for (const p of [...byPiece.keys()].sort((a, b) => a - b)) {
        const cells = byPiece.get(p), k = Math.max(1, Math.min(cfg.subMax, Math.round(cells.length * cellKm2 / cfg.subAreaKm2)));
        const rng = makeRng((seed ^ 0x5ab7) + p * 7919);
        // (seeds spread out: the first at random, each next the farthest from those chosen, among a few random tries)
        const seeds = [cells[Math.floor(rng() * cells.length)]];
        while (seeds.length < k) {
            let best = -1, bs = -1;
            for (let t = 0; t < 12; t++) {
                const c = cells[Math.floor(rng() * cells.length)], q = at(bent, c);
                const s = Math.min(...seeds.map(s0 => 1 - dot(q, at(bent, s0))));
                if (s > bs) { bs = s; best = c; }
            }
            seeds.push(best);
        }
        const sp = seeds.map(s0 => at(bent, s0));
        for (const c of cells) {
            const q = at(bent, c);
            let bi = 0, bd = -2;
            for (let j = 0; j < sp.length; j++) { const d = dot(q, sp[j]); if (d > bd) { bd = d; bi = j; } }
            sub[c] = next + bi;
        }
        next += k;
    }
    return { tp, wp, sub, dragKm };
}
