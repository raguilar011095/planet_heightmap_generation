// G1 — plates that move (plans/GENERATE_REDESIGN_PLAN.md §3.1).
//
// Generate's layout (js/coarse-plates.js, kept byte for byte) cuts the sphere into ~80 PIECES, each land or ocean.
// Here neighbouring pieces are grouped into fewer plates that move and carry continent and ocean alike, as Evolution's
// do — so most coasts lie inside a plate (passive margins), trenches appear where a continent leads into another plate,
// and ridges where two continents' trailing oceans meet.
//
// Everything is decided on the UNEDITED layout (the land each piece had before any Ctrl-click), so an edit changes only
// the crust, never which plate a piece rides on: raising one piece changes only its own neighbourhood. The boundaries'
// kinds (classifyBoundaries) read the crust as edited.
//
// The plates' motion is seeded from the pieces' own motion today (js/plate-physics.js, on the unedited layout), so the
// big convergent seams — today's big ranges — stay loosely where they were (owner, 2026-11-02).

import { makeRng } from '../../../js/rng.js';
import { MinHeap } from '../core/min-heap.js';
import { PRESENT } from './present-config.js';

const R = 6371;                          // km

/** What a stretch of plate boundary is (classifyBoundaries). */
export const Boundary = Object.freeze({ NONE: 0, RIDGE: 1, RIFT: 2, SUBDUCTION: 3, COLLISION: 4, TRANSFORM: 5, INACTIVE: 6 });
export const BOUNDARY_NAME = ['—', 'Ridge', 'Rift', 'Trench', 'Collision', 'Transform', 'Inactive seam'];

// ── small vector helpers (arrays of 3) ──
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const l = norm(a); return l > 1e-15 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]; };
const at = (xyz, c) => [xyz[3 * c], xyz[3 * c + 1], xyz[3 * c + 2]];
const gcKm = (a, b) => R * Math.acos(Math.max(-1, Math.min(1, dot(a, b))));

/** The rotation (Euler vector) that best fits velocities v at unit points p, least squares: Σ(I − ppᵀ)·w = Σ p × v. */
function fitEuler(cells, xyz, velOf) {
    let a00 = 0, a01 = 0, a02 = 0, a11 = 0, a12 = 0, a22 = 0, b0 = 0, b1 = 0, b2 = 0;
    for (const c of cells) {
        const x = xyz[3 * c], y = xyz[3 * c + 1], z = xyz[3 * c + 2];
        a00 += 1 - x * x; a11 += 1 - y * y; a22 += 1 - z * z;
        a01 -= x * y; a02 -= x * z; a12 -= y * z;
        const v = velOf(c);
        b0 += y * v[2] - z * v[1]; b1 += z * v[0] - x * v[2]; b2 += x * v[1] - y * v[0];
    }
    // Cramer's rule on the symmetric 3×3
    const det = a00 * (a11 * a22 - a12 * a12) - a01 * (a01 * a22 - a12 * a02) + a02 * (a01 * a12 - a11 * a02);
    if (Math.abs(det) < 1e-12) return [0, 0, 0];
    const w0 = (b0 * (a11 * a22 - a12 * a12) - a01 * (b1 * a22 - a12 * b2) + a02 * (b1 * a12 - a11 * b2)) / det;
    const w1 = (a00 * (b1 * a22 - a12 * b2) - b0 * (a01 * a22 - a12 * a02) + a02 * (a01 * b2 - b1 * a02)) / det;
    const w2 = (a00 * (a11 * b2 - b1 * a12) - a01 * (a01 * b2 - b1 * a02) + b0 * (a01 * a12 - a11 * a02)) / det;
    return [w0, w1, w2];
}

/**
 * The pieces and how they touch, on the layout's coarse mesh.
 * @returns {{P:number, cellP:Int32Array, idOf:Map<number,number>, cells:number[][], area:Float64Array, cen:number[][],
 *   nbr:Map<number,number>[], seam:Map<number,number>[]}}  (nbr[i].get(j): cell edges shared; seam[i].get(j): today's
 *   mean opening rate across them, negative = closing — in the layout's own units)
 */
function pieceGraph(L) {
    const { mesh, xyz, cellPiece, pieceIds, pieceVec } = L;
    const n = mesh.numRegions, { adjOffset, adjList } = mesh;
    const P = pieceIds.length, idOf = new Map(pieceIds.map((id, i) => [id, i]));
    const cellP = new Int32Array(n);
    const cells = Array.from({ length: P }, () => []);
    const sum = Array.from({ length: P }, () => [0, 0, 0]);
    for (let c = 0; c < n; c++) {
        const i = idOf.get(cellPiece[c]);
        cellP[c] = i; cells[i].push(c);
        sum[i][0] += xyz[3 * c]; sum[i][1] += xyz[3 * c + 1]; sum[i][2] += xyz[3 * c + 2];
    }
    const area = Float64Array.from(cells, a => a.length);
    const cen = sum.map(unit);
    const euler = pieceIds.map(id => { const v = pieceVec[id]; return [v.pole[0] * v.omega, v.pole[1] * v.omega, v.pole[2] * v.omega]; });
    const nbr = Array.from({ length: P }, () => new Map());
    const seamSum = Array.from({ length: P }, () => new Map());
    for (let c = 0; c < n; c++) {
        const i = cellP[c], pc = at(xyz, c);
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
            const nb = adjList[k], j = cellP[nb];
            if (j === i || nb < c) continue;
            const pn = at(xyz, nb), m = unit([pc[0] + pn[0], pc[1] + pn[1], pc[2] + pn[2]]);
            const d = [pn[0] - pc[0], pn[1] - pc[1], pn[2] - pc[2]], dm = dot(d, m);
            const nrm = unit([d[0] - dm * m[0], d[1] - dm * m[1], d[2] - dm * m[2]]);
            const rel = cross([euler[j][0] - euler[i][0], euler[j][1] - euler[i][1], euler[j][2] - euler[i][2]], m);
            const open = dot(rel, nrm);                 // j relative to i, along i → j: > 0 opening
            for (const [a, b] of [[i, j], [j, i]]) {
                nbr[a].set(b, (nbr[a].get(b) ?? 0) + 1);
                seamSum[a].set(b, (seamSum[a].get(b) ?? 0) + open);
            }
        }
    }
    const seam = seamSum.map((m, a) => new Map([...m].map(([b, s]) => [b, s / nbr[a].get(b)])));
    return { P, cellP, idOf, cells, area, cen, euler, nbr, seam };
}

/** Pieces in connected groups (over the piece graph), keeping only those `keep` allows. */
function componentsOf(G, members) {
    const inSet = new Set(members), seen = new Set(), out = [];
    for (const s of members) {
        if (seen.has(s)) continue;
        const comp = [s]; seen.add(s);
        for (let q = 0; q < comp.length; q++) for (const j of G.nbr[comp[q]].keys()) if (inSet.has(j) && !seen.has(j)) { seen.add(j); comp.push(j); }
        out.push(comp);
    }
    return out;
}

/** Split a continent's pieces in two from a seam (i | j): Dijkstra over the piece graph from both sides. */
function splitFrom(G, members, i, j) {
    const inSet = new Set(members), side = new Map([[i, 0], [j, 1]]), dist = new Map([[i, 0], [j, 0]]);
    const heap = new MinHeap(64);
    const key = new Map(); let next = 0;                  // heap ids → piece
    const push = (d, p) => { key.set(next, p); heap.push(d, next++); };
    push(0, i); push(0, j);
    while (heap.size) {
        const p = key.get(heap.pop()), d = heap.lastKey;
        if (d > dist.get(p)) continue;
        for (const q of G.nbr[p].keys()) {
            if (!inSet.has(q)) continue;
            const nd = d + gcKm(G.cen[p], G.cen[q]);
            if (nd < (dist.get(q) ?? Infinity)) { dist.set(q, nd); side.set(q, side.get(p)); push(nd, q); }
        }
    }
    const parts = [[], []];
    for (const p of members) parts[side.get(p) ?? 0].push(p);
    return parts;
}

/**
 * Group the layout's pieces into plates that move.
 * @param {Object} L  the layout: { mesh (coarse SphereMesh: numRegions, adjOffset, adjList), xyz, cellPiece (piece id per
 *   coarse cell), pieceIds (array, the planet code's toggle order), pieceOcean (Set of piece ids — UNEDITED), pieceVec
 *   ({id: {pole, omega}} — the pieces' motion today, from js/plate-physics.js on the unedited layout), seed }
 * @returns {Object} the plates: piecePlate (plate index per piece index), plates[], and the graph it was built on
 */
export function buildPresentPlates(L, cfg = PRESENT) {
    const { mesh, xyz, pieceIds, pieceOcean, seed } = L;
    const n = mesh.numRegions, { adjOffset, adjList } = mesh;
    const G = pieceGraph(L);
    const { P, cellP, cells, area } = G;
    const land = Uint8Array.from(pieceIds, id => (pieceOcean.has(id) ? 0 : 1));
    const totalCells = n;

    // ── continents: connected land pieces (unedited) ──
    const landPieces = []; for (let i = 0; i < P; i++) if (land[i]) landPieces.push(i);
    const continents = componentsOf(G, landPieces).sort((a, b) => sumArea(b) - sumArea(a) || a[0] - b[0]);
    function sumArea(list) { let s = 0; for (const p of list) s += area[p]; return s; }

    // ── how many plates ──
    let M = Math.round(cfg.platesPerSqrtPieces * Math.sqrt(P));
    M = Math.max(cfg.minPlates, Math.min(cfg.maxPlates, M));
    M = Math.max(M, continents.length + cfg.oceanPlateMin);
    M = Math.min(M, P);

    // the pieces' motion today, per cell
    const velOf = (c) => { const e = G.euler[cellP[c]]; return cross(e, at(xyz, c)); };
    const cellsOf = (pieces) => { const out = []; for (const p of pieces) for (const c of cells[p]) out.push(c); return out; };

    // ── units: each continent rides whole on one plate, the biggest split along their strongest seam ──
    const units = [];                       // { pieces, continent, euler (direction, today's units) }
    let splitBudget = Math.max(0, Math.floor((M - continents.length - cfg.oceanPlateMin) / 2));
    continents.forEach((cont, ci) => {
        const share = sumArea(cont) / totalCells;
        let parts = [cont];
        const wanted = share >= cfg.splitTwiceShare ? 2 : share >= cfg.splitMinShare ? 1 : 0;
        for (let s = 0; s < wanted && splitBudget > 0; s++) {
            parts.sort((a, b) => sumArea(b) - sumArea(a));
            const big = parts[0];
            if (big.length < 4) break;
            const done = trySplit(big, sumArea(cont));
            if (!done) break;
            parts = [done[0], done[1], ...parts.slice(1)];
            splitBudget--;
        }
        for (const part of parts) units.push({ pieces: part, continent: ci });
    });
    function trySplit(members, contArea) {
        const inSet = new Set(members), pairs = [];
        for (const i of members) for (const [j, cnt] of G.nbr[i]) if (j > i && inSet.has(j)) pairs.push([i, j, Math.abs(G.seam[i].get(j)) * Math.sqrt(cnt)]);
        pairs.sort((a, b) => b[2] - a[2] || a[0] - b[0] || a[1] - b[1]);
        for (let t = 0; t < Math.min(cfg.splitTries, pairs.length); t++) {
            const parts = splitFrom(G, members, pairs[t][0], pairs[t][1]);
            if (Math.min(sumArea(parts[0]), sumArea(parts[1])) >= cfg.splitMinPart * contArea) return parts;
        }
        return null;
    }
    for (const u of units) u.euler = fitEuler(cellsOf(u.pieces), xyz, velOf);

    // ── ocean-only plates: seeded farthest from land and from each other ──
    const K = Math.max(cfg.oceanPlateMin, M - units.length);
    const isLandCell = new Uint8Array(n); for (let c = 0; c < n; c++) isLandCell[c] = land[cellP[c]];
    const fromLand = dijkstraCells(mesh, xyz, isLandCell);
    const oceanPieces = []; for (let i = 0; i < P; i++) if (!land[i]) oceanPieces.push(i);
    const pieceFromLand = new Map(oceanPieces.map(i => { let s = 0; for (const c of cells[i]) s += fromLand[c]; return [i, s / cells[i].length]; }));
    const rng = makeRng(seed ^ 0x51ab);
    const oceanSeeds = [];
    for (let k = 0; k < K && oceanSeeds.length < oceanPieces.length; k++) {
        const scored = [];
        for (const i of oceanPieces) {
            if (oceanSeeds.includes(i)) continue;
            let s = pieceFromLand.get(i);
            for (const o of oceanSeeds) s = Math.min(s, gcKm(G.cen[i], G.cen[o]));
            scored.push([s, i]);
        }
        scored.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
        const pick = scored[Math.min(scored.length - 1, Math.floor(rng() * Math.min(3, scored.length)))];
        oceanSeeds.push(pick[1]);
    }

    // ── the oceans divided: a Dijkstra in km from every plate's seeds; a continent's grows less far ahead of it ──
    const U = units.length, plateOf = new Int16Array(n).fill(-1), origin = new Int32Array(n).fill(-1);
    const dist = new Float64Array(n).fill(Infinity), heap = new MinHeap(4096);
    units.forEach((u, ui) => { for (const c of cellsOf(u.pieces)) { plateOf[c] = ui; origin[c] = c; dist[c] = 0; heap.push(0, c); } });
    oceanSeeds.forEach((p, k) => { for (const c of cells[p]) { plateOf[c] = U + k; origin[c] = c; dist[c] = 0; heap.push(0, c); } });
    const lead = units.map(u => u.euler);
    const alpha = cfg.leadingAnisotropy;
    while (heap.size) {
        const c = heap.pop(), dc = heap.lastKey;
        if (dc > dist[c]) continue;
        const pl = plateOf[c], o = origin[c], po = at(xyz, o);
        const vo = pl < U ? unit(cross(lead[pl], po)) : null;
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
            const nb = adjList[k];
            const pn = at(xyz, nb);
            let f = 1;
            if (vo) {
                const t = [pn[0] - dot(pn, po) * po[0], pn[1] - dot(pn, po) * po[1], pn[2] - dot(pn, po) * po[2]];
                const tl = norm(t);
                if (tl > 1e-9) f = 1 + alpha * Math.max(0, (vo[0] * t[0] + vo[1] * t[1] + vo[2] * t[2]) / tl);
            }
            const nd = dc + gcKm(at(xyz, c), pn) * f;
            if (nd < dist[nb]) { dist[nb] = nd; plateOf[nb] = pl; origin[nb] = o; heap.push(nd, nb); }
        }
    }

    // ── each ocean piece to the plate holding most of it; land pieces to their unit ──
    const piecePlate = new Int16Array(P).fill(-1);
    units.forEach((u, ui) => { for (const p of u.pieces) piecePlate[p] = ui; });
    for (const i of oceanPieces) {
        const votes = new Map();
        for (const c of cells[i]) votes.set(plateOf[c], (votes.get(plateOf[c]) ?? 0) + 1);
        let best = -1, bestN = -1;
        for (const [pl, cnt] of votes) if (cnt > bestN || (cnt === bestN && pl < best)) { best = pl; bestN = cnt; }
        piecePlate[i] = best;
    }
    oceanSeeds.forEach((p, k) => { piecePlate[p] = U + k; });

    // ── every plate one piece of the globe: a stray group of pieces joins the neighbour it shares most border with ──
    const NP = U + oceanSeeds.length;
    for (let pass = 0; pass < 6; pass++) {
        let moved = 0;
        for (let pl = 0; pl < NP; pl++) {
            const mine = []; for (let i = 0; i < P; i++) if (piecePlate[i] === pl) mine.push(i);
            if (!mine.length) continue;
            const comps = componentsOf(G, mine);
            if (comps.length < 2) continue;
            // keep the group holding the plate's land (a unit) or its seed (an ocean plate), else the biggest
            const anchor = pl < U ? units[pl].pieces[0] : oceanSeeds[pl - U];
            for (const comp of comps) {
                if (comp.includes(anchor)) continue;
                const border = new Map();
                for (const i of comp) for (const [j, cnt] of G.nbr[i]) if (piecePlate[j] !== pl) border.set(piecePlate[j], (border.get(piecePlate[j]) ?? 0) + cnt);
                let best = -1, bestN = -1;
                for (const [q, cnt] of border) if (cnt > bestN || (cnt === bestN && q < best)) { best = q; bestN = cnt; }
                if (best < 0) continue;
                for (const i of comp) if (!land[i]) { piecePlate[i] = best; moved++; }
            }
        }
        if (!moved) break;
    }

    // ── each plate's motion ──
    const plates = [];
    for (let pl = 0; pl < NP; pl++) {
        const pieces = []; for (let i = 0; i < P; i++) if (piecePlate[i] === pl) pieces.push(i);
        const pc = cellsOf(pieces);
        let landCells = 0, s0 = 0, s1 = 0, s2 = 0;
        for (const c of pc) { landCells += isLandCell[c]; s0 += xyz[3 * c]; s1 += xyz[3 * c + 1]; s2 += xyz[3 * c + 2]; }
        plates.push({
            index: pl, continental: pl < U, continent: pl < U ? units[pl].continent : -1,
            pieces, cellCount: pc.length, share: pc.length / totalCells, landShare: pc.length ? landCells / pc.length : 0,
            centroid: unit([s0, s1, s2]),
            dir: unit(pl < U ? units[pl].euler : fitEuler(pc, xyz, velOf)),
        });
    }
    const plateOfCell = (c) => piecePlate[cellP[c]];
    // slab pull: an ocean plate is drawn toward the continent plates it borders (it dives under them)
    for (const pl of plates) {
        if (pl.continental) continue;
        let t = [0, 0, 0], rim = 0, rimCont = 0;
        for (const p of pl.pieces) for (const c of cells[p]) {
            const pc = at(xyz, c);
            for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
                const nb = adjList[k], q = plateOfCell(nb);
                if (q === pl.index) continue;
                rim++;
                if (!plates[q].continental) continue;
                rimCont++;
                const pn = at(xyz, nb), m = unit([pc[0] + pn[0], pc[1] + pn[1], pc[2] + pn[2]]);
                const d = [pn[0] - pc[0], pn[1] - pc[1], pn[2] - pc[2]], dm = dot(d, m);
                const nrm = unit([d[0] - dm * m[0], d[1] - dm * m[1], d[2] - dm * m[2]]);
                const ax = cross(m, nrm);
                t = [t[0] + ax[0], t[1] + ax[1], t[2] + ax[2]];
            }
        }
        pl.trenchShare = rim ? rimCont / rim : 0;
        const tu = unit(t), b = rimCont ? cfg.slabPullBlend : 0;
        const d = unit([(1 - b) * pl.dir[0] + b * tu[0], (1 - b) * pl.dir[1] + b * tu[1], (1 - b) * pl.dir[2] + b * tu[2]]);
        if (norm(d) > 0) pl.dir = d;
    }
    // speeds: continents slow (the bigger the slower), ocean plates fast where they dive under continents
    const srng = makeRng(seed ^ 0x5bed);
    for (const pl of plates) {
        let cm;
        if (pl.continental) {
            const [fast, slow] = [cfg.continentSpeedCmYr[1], cfg.continentSpeedCmYr[0]];
            cm = fast + (slow - fast) * Math.min(1, pl.share / cfg.continentSpeedFullShare);
        } else {
            cm = cfg.oceanSpeedCmYr[0] + (cfg.oceanSpeedCmYr[1] - cfg.oceanSpeedCmYr[0]) * Math.min(1, pl.trenchShare ?? 0);
        }
        cm *= 1 + cfg.speedJitter * (2 * srng() - 1);
        // |ω| so that the plate's RMS surface speed is cm (cm/yr → km/Myr ×10)
        let m2 = 0;
        for (const p of pl.pieces) for (const c of cells[p]) { const s = dot(pl.dir, at(xyz, c)); m2 += 1 - s * s; }
        const rms = Math.sqrt(m2 / Math.max(1, pl.cellCount)) || 1;
        const w = (cm * 10) / (R * rms);                       // rad/Myr
        pl.speedCmYr = cm;
        pl.euler = [pl.dir[0] * w, pl.dir[1] * w, pl.dir[2] * w];
    }

    return { M: NP, units: U, continents, piecePlate, plates, graph: G, land, oceanSeeds };
}

/** Distance in km from the cells flagged in `src` (a plain Dijkstra over the coarse mesh). */
function dijkstraCells(mesh, xyz, src) {
    const n = mesh.numRegions, { adjOffset, adjList } = mesh;
    const dist = new Float64Array(n).fill(Infinity), heap = new MinHeap(4096);
    for (let c = 0; c < n; c++) if (src[c]) { dist[c] = 0; heap.push(0, c); }
    while (heap.size) {
        const c = heap.pop(), dc = heap.lastKey;
        if (dc > dist[c]) continue;
        const pc = at(xyz, c);
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
            const nb = adjList[k], nd = dc + gcKm(pc, at(xyz, nb));
            if (nd < dist[nb]) { dist[nb] = nd; heap.push(nd, nb); }
        }
    }
    return dist;
}

/**
 * The plate boundaries on the coarse mesh, each cell edge between two plates classified by the plates' relative motion
 * averaged along the boundary (cfg.smoothKm), and by the crust on each side AS EDITED (`pieceLandNow`: 1 = land, per
 * piece index).
 * @returns {{count:number, mid:Float32Array, a:Int16Array, b:Int16Array, kind:Uint8Array, openCmYr:Float32Array,
 *   slipCmYr:Float32Array, over:Int8Array, landA:Uint8Array, landB:Uint8Array}}  over: which side rides over a trench
 *   (0 = a, 1 = b, −1 none)
 */
export function classifyBoundaries(L, W, pieceLandNow, cfg = PRESENT) {
    const { mesh, xyz } = L, { adjOffset, adjList } = mesh, n = mesh.numRegions;
    const { cellP } = W.graph, { piecePlate, plates } = W;
    const E = [];
    for (let c = 0; c < n; c++) {
        const A = piecePlate[cellP[c]], pc = at(xyz, c);
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
            const nb = adjList[k];
            if (nb < c) continue;
            const B = piecePlate[cellP[nb]];
            if (A === B) continue;
            const pn = at(xyz, nb), m = unit([pc[0] + pn[0], pc[1] + pn[1], pc[2] + pn[2]]);
            const d = [pn[0] - pc[0], pn[1] - pc[1], pn[2] - pc[2]], dm = dot(d, m);
            const nrm = unit([d[0] - dm * m[0], d[1] - dm * m[1], d[2] - dm * m[2]]);
            const vA = cross(plates[A].euler, m), vB = cross(plates[B].euler, m);
            const rel = [(vB[0] - vA[0]) * R, (vB[1] - vA[1]) * R, (vB[2] - vA[2]) * R];   // km/Myr
            const open = dot(rel, nrm);
            const slip = norm([rel[0] - open * nrm[0], rel[1] - open * nrm[1], rel[2] - open * nrm[2]]);
            // which side dives if it closes: the one moving harder toward the other (slab pull)
            const towardA = dot(vA, nrm) * R, towardB = -dot(vB, nrm) * R;
            E.push({ c, nb, A, B, m, open, slip, dive: towardA >= towardB ? 0 : 1,
                landA: pieceLandNow[cellP[c]], landB: pieceLandNow[cellP[nb]] });
        }
    }
    // average along the same boundary (the same pair of plates) within smoothKm
    const byPair = new Map();
    E.forEach((e, idx) => { const key = Math.min(e.A, e.B) * 1024 + Math.max(e.A, e.B); if (!byPair.has(key)) byPair.set(key, []); byPair.get(key).push(idx); });
    const cosR = Math.cos(cfg.smoothKm / R);
    const openS = new Float32Array(E.length), slipS = new Float32Array(E.length);
    for (const list of byPair.values()) {
        for (const i of list) {
            let so = 0, ss = 0, w = 0;
            const mi = E[i].m;
            for (const j of list) {
                const cj = dot(mi, E[j].m);
                if (cj < cosR) continue;
                // the same pair seen from either side: open is symmetric, but orient it the way i sees it
                const sgn = 1;
                const wt = 1 - (1 - cj) / (1 - cosR) * 0.5;
                so += sgn * E[j].open * wt; ss += E[j].slip * wt; w += wt;
            }
            openS[i] = so / w; slipS[i] = ss / w;
        }
    }
    const count = E.length;
    const out = {
        count, mid: new Float32Array(3 * count), a: new Int16Array(count), b: new Int16Array(count), kind: new Uint8Array(count),
        openCmYr: new Float32Array(count), slipCmYr: new Float32Array(count), over: new Int8Array(count),
        landA: new Uint8Array(count), landB: new Uint8Array(count), cellA: new Int32Array(count), cellB: new Int32Array(count),
    };
    const minRate = cfg.minRateCmYr * 10;
    E.forEach((e, i) => {
        out.mid[3 * i] = e.m[0]; out.mid[3 * i + 1] = e.m[1]; out.mid[3 * i + 2] = e.m[2];
        out.a[i] = e.A; out.b[i] = e.B; out.cellA[i] = e.c; out.cellB[i] = e.nb;
        out.landA[i] = e.landA; out.landB[i] = e.landB;
        const op = openS[i], sl = slipS[i];
        out.openCmYr[i] = op / 10; out.slipCmYr[i] = sl / 10;
        let kind, over = -1;
        if (Math.hypot(op, sl) < minRate) kind = Boundary.INACTIVE;
        else if (Math.abs(op) < cfg.transformRatio * sl) kind = Boundary.TRANSFORM;
        else if (op > 0) kind = e.landA && e.landB ? Boundary.RIFT : Boundary.RIDGE;
        else if (e.landA && e.landB) kind = Boundary.COLLISION;
        else {
            kind = Boundary.SUBDUCTION;
            // land never dives: the ocean side goes down; ocean against ocean, the side moving harder toward the other
            over = e.landA ? 0 : e.landB ? 1 : (e.dive === 0 ? 1 : 0);
        }
        out.kind[i] = kind; out.over[i] = over;
    });
    return out;
}

/**
 * Points spread evenly over the sphere (a Fibonacci lattice of `count`), each with the plate under it: where the Plates
 * view draws the motion's arrows.
 */
export function arrowAnchors(L, W, count = 150) {
    const { mesh, xyz } = L, n = mesh.numRegions, { cellP } = W.graph;
    const pts = new Float32Array(3 * count), plate = new Int16Array(count);
    const golden = Math.PI * (3 - Math.sqrt(5));
    let cur = 0;
    for (let k = 0; k < count; k++) {
        const y = 1 - (2 * k + 1) / count, r = Math.sqrt(1 - y * y), th = golden * k;
        const p = [Math.cos(th) * r, y, Math.sin(th) * r];
        // greedy walk to the nearest coarse cell, then make sure by its neighbours
        let best = dot(p, at(xyz, cur)), moved = true;
        while (moved) {
            moved = false;
            for (let j = mesh.adjOffset[cur]; j < mesh.adjOffset[cur + 1]; j++) {
                const nb = mesh.adjList[j], d = dot(p, at(xyz, nb));
                if (d > best) { best = d; cur = nb; moved = true; }
            }
        }
        if (best < 0.99) for (let c = 0; c < n; c++) { const d = dot(p, at(xyz, c)); if (d > best) { best = d; cur = c; } }
        pts[3 * k] = p[0]; pts[3 * k + 1] = p[1]; pts[3 * k + 2] = p[2];
        plate[k] = W.piecePlate[cellP[cur]];
    }
    return { pts, plate };
}

/** Measures for the checks and the readout: how much of the continental coast is passive, the kinds' shares by length. */
export function plateStats(L, W, B) {
    const { mesh } = L, { adjOffset, adjList } = mesh, n = mesh.numRegions;
    const { cellP } = W.graph;
    let coast = 0, passive = 0;
    for (let c = 0; c < n; c++) {
        const lc = W.land[cellP[c]];
        if (!lc) continue;
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
            const nb = adjList[k];
            if (W.land[cellP[nb]]) continue;
            coast++;
            if (W.piecePlate[cellP[c]] === W.piecePlate[cellP[nb]]) passive++;
        }
    }
    const kindShare = new Array(BOUNDARY_NAME.length).fill(0);
    for (let i = 0; i < B.count; i++) kindShare[B.kind[i]]++;
    return { passiveCoastShare: coast ? passive / coast : 0, kindShare: kindShare.map(v => v / Math.max(1, B.count)), boundaryEdges: B.count };
}
