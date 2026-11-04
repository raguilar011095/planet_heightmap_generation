// G5b — continents that fit (plans/GENERATE_REDESIGN_PLAN.md; owner, 2026-11-04: "create more of an illusion that some
// of these continents would have fit together like a puzzle in the past … all in 1 pr").
//
// Generate's continents are its layout's, placed apart; nothing in their outlines was ever joined. But two continents
// on plates parting across the ocean between them (present/plates.js conjugates: its ridge already runs down that
// ocean's middle) can be made to carry the evidence Wegener read:
//   · the rotation that closes their ocean — fitted to their facing coasts (an ICP: each coast point to the nearest of the
//     other's, the best rotation for those pairs by Horn's quaternion method, again) — says which points were joined;
//   · their old ranges and shields carry on across it (present/past.js), and a failed rift arm points inland from the
//     join on one side or the other (the Benue trough);
//   · and their coasts are made to interlock: overlaid by that rotation (pushed a little further, so they overlap more
//     than they gap), where one's land lies on the other's, one of the two is drowned to a shelf there — which one by a
//     noise read at the join itself, so the two coasts are cut as one line (the owner's rule: a land piece may drown, an
//     ocean piece never rises).
// All on Evolution's z-up sim positions (the terrain mesh's frame).

import { MinHeap } from '../core/min-heap.js';
import { FastNoise } from '../core/fast-noise.js';
import { PRESENT } from './present-config.js';

const R = 6371;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return l > 1e-15 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]; };
const at = (xyz, c) => [xyz[3 * c], xyz[3 * c + 1], xyz[3 * c + 2]];
const kmOf = (a, b) => R * Math.acos(Math.max(-1, Math.min(1, dot(a, b))));

/** A rotation matrix (row-major, 9) about unit `k` by `t` radians. */
export function rotation(k, t) {
    const c = Math.cos(t), s = Math.sin(t), v = 1 - c, [x, y, z] = k;
    return [c + x * x * v, x * y * v - z * s, x * z * v + y * s, y * x * v + z * s, c + y * y * v, y * z * v - x * s, z * x * v - y * s, z * y * v + x * s, c + z * z * v];
}
export const apply = (M, p) => [M[0] * p[0] + M[1] * p[1] + M[2] * p[2], M[3] * p[0] + M[4] * p[1] + M[5] * p[2], M[6] * p[0] + M[7] * p[1] + M[8] * p[2]];
const mul = (A, B) => { const o = new Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[3 * i + j] = A[3 * i] * B[j] + A[3 * i + 1] * B[3 + j] + A[3 * i + 2] * B[6 + j]; return o; };
const transpose = (M) => [M[0], M[3], M[6], M[1], M[4], M[7], M[2], M[5], M[8]];
/** The rotation's axis and angle. */
function axisAngle(M) {
    const t = Math.acos(Math.max(-1, Math.min(1, (M[0] + M[4] + M[8] - 1) / 2)));
    if (t < 1e-9) return { k: [0, 0, 1], t: 0 };
    return { k: unit([M[7] - M[5], M[2] - M[6], M[3] - M[1]]), t };
}
/** Horn (1987): the rotation taking points p onto q best (unit vectors, no translation), as a matrix. */
function horn(P, Q) {
    let Sxx = 0, Sxy = 0, Sxz = 0, Syx = 0, Syy = 0, Syz = 0, Szx = 0, Szy = 0, Szz = 0;
    for (let i = 0; i < P.length; i++) {
        const p = P[i], q = Q[i];
        Sxx += p[0] * q[0]; Sxy += p[0] * q[1]; Sxz += p[0] * q[2];
        Syx += p[1] * q[0]; Syy += p[1] * q[1]; Syz += p[1] * q[2];
        Szx += p[2] * q[0]; Szy += p[2] * q[1]; Szz += p[2] * q[2];
    }
    const N = [
        [Sxx + Syy + Szz, Syz - Szy, Szx - Sxz, Sxy - Syx],
        [Syz - Szy, Sxx - Syy - Szz, Sxy + Syx, Szx + Sxz],
        [Szx - Sxz, Sxy + Syx, -Sxx + Syy - Szz, Syz + Szy],
        [Sxy - Syx, Szx + Sxz, Syz + Szy, -Sxx - Syy + Szz],
    ];
    // (the largest eigenvector, by power iteration on N shifted positive)
    let shift = 0; for (const row of N) for (const v of row) shift += Math.abs(v);
    let q = [1, 0.1, 0.1, 0.1];
    for (let it = 0; it < 200; it++) {
        const r = [0, 0, 0, 0];
        for (let i = 0; i < 4; i++) { for (let j = 0; j < 4; j++) r[i] += N[i][j] * q[j]; r[i] += shift * q[i]; }
        const l = Math.hypot(...r) || 1; q = r.map(v => v / l);
    }
    const [w, x, y, z] = q;
    return [w * w + x * x - y * y - z * z, 2 * (x * y - w * z), 2 * (x * z + w * y),
        2 * (x * y + w * z), w * w - x * x + y * y - z * z, 2 * (y * z - w * x),
        2 * (x * z - w * y), 2 * (y * z + w * x), w * w - x * x - y * y + z * z];
}

/**
 * The continents that fit: for each conjugate pair of plates, the two landmasses facing each other across their ocean,
 * their facing coasts, and the rotation that closes the ocean (B onto A).
 * @param {Object} L  the layout   @param {Object} W  the plates (W.conjugates)   @param {Uint8Array} land  as drawn
 * @returns {{pairs: Object[], mass: Int32Array, side: Int16Array, facingKm: Float32Array, fitCoast: Uint8Array}}  per sim
 *   cell: its landmass; side: pair × 2 + (0: A, 1: B) within fitCarveKm of that pair's facing coast (−1: none); facingKm:
 *   km from its own facing coast (Infinity: none); fitCoast: within fitGeoBandKm of a facing coast
 */
export function continentFits(L, W, land, cfg = PRESENT) {
    const { sim } = L, n = sim.numCells, { adjOffset, adjList, xyz } = sim;
    const mass = new Int32Array(n).fill(-1), masses = [];
    for (let s = 0; s < n; s++) {
        if (!land[s] || mass[s] >= 0) continue;
        const q = [s]; mass[s] = masses.length;
        for (let h = 0; h < q.length; h++) for (let k = adjOffset[q[h]]; k < adjOffset[q[h] + 1]; k++) { const nb = adjList[k]; if (land[nb] && mass[nb] < 0) { mass[nb] = masses.length; q.push(nb); } }
        masses.push(q);
    }
    const side = new Int16Array(n).fill(-1), facingKm = new Float32Array(n).fill(Infinity), fitCoast = new Uint8Array(n);
    const pairs = [];
    for (const { a, b } of W.conjugates ?? []) {
        const plateOf = W.cellPlate, basin = (c) => !land[c] && (plateOf[c] === a || plateOf[c] === b);
        // each side's landmass: the one of its plate with the most coast on the basin
        const coastOf = (p) => {
            const count = new Map();
            for (let c = 0; c < n; c++) {
                if (!land[c] || plateOf[c] !== p) continue;
                for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) if (basin(adjList[k])) { count.set(mass[c], (count.get(mass[c]) ?? 0) + 1); break; }
            }
            let best = -1, bn = 0; for (const [m, v] of count) if (v > bn || (v === bn && m < best)) { best = m; bn = v; }
            if (best < 0) return null;
            const cells = [];
            for (const c of masses[best]) for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) if (basin(adjList[k])) { cells.push(c); break; }
            return { mass: best, cells };
        };
        const A = coastOf(a), B = coastOf(b);
        if (!A || !B || A.mass === B.mass) continue;
        // the coasts that face each other: within the narrowest gap + fitFacingExtraKm of the other's
        const near = (from, to) => from.cells.map(c => { const p = at(xyz, c); let d = Infinity; for (const o of to.cells) d = Math.min(d, kmOf(p, at(xyz, o))); return d; });
        const dA = near(A, B), dB = near(B, A), gap = Math.min(...dA);
        const fa = A.cells.filter((c, i) => dA[i] <= gap + cfg.fitFacingExtraKm), fb = B.cells.filter((c, i) => dB[i] <= gap + cfg.fitFacingExtraKm);
        if (fa.length < cfg.fitMinCoastCells || fb.length < cfg.fitMinCoastCells) continue;
        const PA = fa.map(c => at(xyz, c)), PB = fb.map(c => at(xyz, c));
        const cen = (P) => unit(P.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]));
        const cA = cen(PA), cB = cen(PB), mA = cen(masses[A.mass].map(c => at(xyz, c))), mB = cen(masses[B.mass].map(c => at(xyz, c)));
        // the closing rotation: B's facing coast carried onto A's (its centroid first, then fitted)
        let Rm = rotation(unit(cross(cB, cA)), Math.acos(Math.max(-1, Math.min(1, dot(cB, cA)))));
        const R0 = Rm;
        const misfit = (M) => { let s = 0; for (const p of PB) { const q = apply(M, p); let d = Infinity; for (const o of PA) d = Math.min(d, kmOf(q, o)); s += d; } return s / PB.length; };
        for (let it = 0; it < cfg.fitIterations; it++) {
            const Q = PB.map(p => { const q = apply(Rm, p); let best = PA[0], bd = -2; for (const o of PA) { const d = dot(q, o); if (d > bd) { bd = d; best = o; } } return best; });
            Rm = horn(PB, Q);
        }
        // (never one that lays B's land over A's: B's interior must land beyond A's coast, on A's ocean side)
        const beyond = (M) => dot(apply(M, mB), mA) < dot(cA, mA);
        if (!beyond(Rm) || misfit(Rm) > misfit(R0) + 50) Rm = R0;
        const fitKm = misfit(Rm);
        // pushed a little further into A (along A's coast toward its interior): the coasts overlap more than they gap
        const tA = unit([mA[0] - dot(mA, cA) * cA[0], mA[1] - dot(mA, cA) * cA[1], mA[2] - dot(mA, cA) * cA[2]]);
        Rm = mul(rotation(unit(cross(cA, tA)), cfg.fitPushKm / R), Rm);
        const { k, t } = axisAngle(Rm), Rh = rotation(k, t / 2);
        const pr = { a, b, massA: A.mass, massB: B.mass, R: Rm, Rinv: transpose(Rm), Rh, Rhinv: transpose(Rh), gapKm: gap, fitKm, ok: fitKm <= cfg.fitMaxMisfitKm, facingA: fa, facingB: fb };
        // how far each cell of the two landmasses lies from its own facing coast
        for (const [cellsF, m, s] of [[fa, A.mass, 0], [fb, B.mass, 1]]) {
            const d = dijkstra(sim, cellsF, (c) => mass[c] === m, cfg.fitGeoBandKm * 2);
            pr[s ? 'kmB' : 'kmA'] = d;
            for (let c = 0; c < n; c++) {
                if (!(d[c] < Infinity)) continue;
                facingKm[c] = Math.min(facingKm[c], d[c]);
                if (d[c] <= cfg.fitGeoBandKm) fitCoast[c] = 1;
                if (pr.ok && d[c] <= cfg.fitCarveKm) side[c] = 2 * pairs.length + s;
            }
        }
        pairs.push(pr);
    }
    return { pairs, mass, side, facingKm, fitCoast };
}

/**
 * The coasts made to interlock, on Generate's mesh (before the hold): within fitCarveKm of a fitting pair's facing coast,
 * where the closing rotation lays one's land on the other's, one of the two is drowned to a shelf — which, by a noise
 * read at the join (the same point from either side), so the two are cut along one line.
 * @param {Float32Array} heightKm  the surface (km)   @param {Object} m  the hold's mask: regionLand, regionCell, fit, seed
 * @param {{xyz: Float32Array, index: {nearest}}} tMesh  Generate's mesh as a terrain mesh (z-up)
 * @returns {Uint8Array}  1 where a region was drowned
 */
export function interlockCoasts(heightKm, m, tMesh, cfg = PRESENT) {
    const { regionLand, regionCell, fit } = m, n = heightKm.length, drowned = new Uint8Array(n);
    if (!fit?.pairs.length) return drowned;
    const noise = new FastNoise(((m.seed ?? 0) ^ 0xf17f) >>> 0), f = R / cfg.fitCutKm;
    for (let r = 0; r < n; r++) {
        if (!regionLand[r] || !(heightKm[r] > 0)) continue;
        const s = fit.side[regionCell[r]];
        if (s < 0) continue;
        const pr = fit.pairs[s >> 1], isB = s & 1, x = at(tMesh.xyz, r);
        const y = apply(isB ? pr.R : pr.Rinv, x), q = tMesh.index.nearest(y[0], y[1], y[2]);
        if (!regionLand[q] || fit.mass[regionCell[q]] !== (isB ? pr.massA : pr.massB)) continue;
        const j = apply(isB ? pr.Rh : pr.Rhinv, x), v = noise.noise3D(j[0] * f + 7.1, j[1] * f - 3.3, j[2] * f + 1.9);
        if (isB ? v > 0 : v <= 0) { heightKm[r] = Math.min(heightKm[r], cfg.fitShelfKm); drowned[r] = 1; }
    }
    return drowned;
}

function dijkstra(sim, sources, canEnter, maxKm) {
    const n = sim.numCells, { adjOffset, adjList, xyz } = sim, d = new Float64Array(n).fill(Infinity), heap = new MinHeap(1024);
    for (const c of sources) { d[c] = 0; heap.push(0, c); }
    while (heap.size) {
        const c = heap.pop(), dc = heap.lastKey;
        if (dc > d[c]) continue;
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
            const nb = adjList[k];
            if (!canEnter(nb)) continue;
            const nd = dc + kmOf(at(xyz, c), at(xyz, nb));
            if (nd < d[nb] && nd <= maxKm) { d[nb] = nd; heap.push(nd, nb); }
        }
    }
    return d;
}
