// G1 — plates that move (plans/GENERATE_REDESIGN_PLAN.md §3.1); G1c — made of whole pieces, edges at some coasts.
//
// Generate's layout (js/coarse-plates.js, kept byte for byte) cuts the sphere into ~80 PIECES, each land or ocean: what
// Ctrl-click raises or sinks, and what the Plates tab shades. Here they are grouped into fewer plates that move and carry
// continent and ocean alike, as Evolution's do. Each plate is whole pieces, so its edges run along the outlines the
// Plates tab shows and you click (owner, 2026-11-03: the boundaries "don't follow the plates" when drawn free of them).
// A continent rides whole on one plate, or is split along its pieces' strongest seam. Most coasts lie inside a plate
// (passive margins), but a continent leading into the ocean has the ocean ahead of it on another plate, diving under it,
// so that plate's edge runs along the coast: an active margin, like the Andes (owner: "some/a lot of the edges of plates
// should be on the sides of the ocean/land boundaries"). The coast hugs such an edge (present/coast.js).
//
// The plates are grouped on the layout AS EDITED (G1d, owner 2026-11-03: an edit regroups them, as loading its planet
// code would): a raised piece rides its continent's plate, whose motion is fitted again. Only the pieces' own motion
// comes from the unedited layout (js/plate-physics.js run again on an edit moved all of them), and the draws are keyed
// per piece, so an edit changes little beyond its own neighbourhood. The boundaries' kinds (classifyBoundaries) read the
// crust as edited.
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
const edgeKmOf = (mesh) => Math.PI * R / Math.sqrt(mesh.numRegions);

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
 * The pieces and how they touch, on the layout's mesh.
 * @returns {{P:number, cellP:Int32Array, idOf:Map<number,number>, cells:number[][], area:Float64Array, cen:number[][],
 *   euler:number[][], nbr:Map<number,number>[], seam:Map<number,number>[], mid:Map<number,number[]>[]}}  (nbr[i].get(j):
 *   cell edges shared; seam[i].get(j): today's mean opening rate across them, negative = closing — in the layout's own
 *   units; mid[i].get(j): the middle of their shared border, a unit vector)
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
    const midSum = Array.from({ length: P }, () => new Map());
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
                const s = midSum[a].get(b) ?? [0, 0, 0];
                s[0] += m[0]; s[1] += m[1]; s[2] += m[2];
                midSum[a].set(b, s);
            }
        }
    }
    const seam = seamSum.map((m, a) => new Map([...m].map(([b, s]) => [b, s / nbr[a].get(b)])));
    const mid = midSum.map((m) => new Map([...m].map(([b, s]) => [b, unit(s)])));
    return { P, cellP, idOf, cells, area, cen, euler, nbr, seam, mid };
}

/** Split a continent's pieces in two from a seam (i | j): a Dijkstra over the piece graph from both sides. */
function splitFrom(G, members, i, j) {
    const inSet = new Set(members), side = new Map([[i, 0], [j, 1]]), dist = new Map([[i, 0], [j, 0]]);
    const heap = new MinHeap(64);
    heap.push(0, i); heap.push(0, j);
    while (heap.size) {
        const p = heap.pop(), d = heap.lastKey;
        if (d > dist.get(p)) continue;
        for (const q of G.nbr[p].keys()) {
            if (!inSet.has(q)) continue;
            const nd = d + gcKm(G.cen[p], G.cen[q]);
            if (nd < (dist.get(q) ?? Infinity)) { dist.set(q, nd); side.set(q, side.get(p)); heap.push(nd, q); }
        }
    }
    const parts = [[], []];
    for (const p of members) parts[side.get(p) ?? 0].push(p);
    return parts;
}

/** Pieces in connected groups over the piece graph. */
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

/**
 * Divide the sphere into plates that move.
 * @param {Object} L  the layout (present/layout.js): { mesh: {numRegions, adjOffset, adjList}, xyz (Generate's frame),
 *   cellPiece, pieceIds (the planet code's toggle order), pieceOcean (Set — as edited), pieceVec ({id: {pole, omega}}:
 *   the pieces' motion today on the unedited layout), seed }
 * @param {{cellPlate, plates}} [motionFrom]  M4, on an edited layout: the plates as first built (motionsOf) — each plate
 *   most of whose cells rode one of them moves as that one did
 * @returns {Object} W: { M, units, continents, cellPlate (plate per cell), piecePlate (plate per piece index; −1 for a
 *   piece too small to hold a sim cell), plates[], graph, land (per piece, unedited), cellLand (per cell, unedited),
 *   oceanSeeds }
 */
export function buildPresentPlates(L, cfg = PRESENT, motionFrom = null) {
    // Every continent has an active margin somewhere (G1d, owner 2026-11-03: "each continent have at least 1 active
    // orogeny/plate boundary"): built once as drawn; a continent of at least activeMinShare of the sphere left with no
    // trench, collision or pressed transform on it then leads into the ocean with its biggest unit, and all is built again
    const W = buildPlatesWith(L, cfg, null, motionFrom);
    const B = classifyBoundaries(L, W, W.cellLand, cfg), active = new Uint8Array(W.cellPlate.length);
    for (let i = 0; i < B.count; i++) {
        const k = B.kind[i];
        if (k === Boundary.SUBDUCTION || k === Boundary.COLLISION || (k === Boundary.TRANSFORM && B.openCmYr[i] < 0)) { active[B.cellA[i]] = 1; active[B.cellB[i]] = 1; }
    }
    const quiet = new Set();
    W.continents.forEach((cont, ci) => {
        let cells = 0, hit = false;
        for (const i of cont) for (const c of W.graph.cells[i]) { cells++; hit ||= active[c] === 1; }
        if (!hit && cells >= cfg.activeMinShare * W.cellPlate.length) quiet.add(ci);
    });
    return quiet.size ? buildPlatesWith(L, cfg, quiet, motionFrom) : W;
}

/** The plates, built with the continents in `forced` (indices; or null) leading into the ocean whatever their draw. */
function buildPlatesWith(L, cfg, forced, motionFrom = null) {
    const { mesh, xyz, pieceIds, pieceOcean, seed } = L;
    const n = mesh.numRegions, { adjOffset, adjList } = mesh;
    const G = pieceGraph(L);
    const { P, cellP, cells, area } = G;
    const land = Uint8Array.from(pieceIds, id => (pieceOcean.has(id) ? 0 : 1));
    const cellLand = new Uint8Array(n); for (let c = 0; c < n; c++) cellLand[c] = land[cellP[c]];

    // ── continents: connected land pieces (unedited) ──
    const landPieces = []; for (let i = 0; i < P; i++) if (land[i] && area[i]) landPieces.push(i);
    const sumArea = (list) => { let s = 0; for (const p of list) s += area[p]; return s; };
    const continents = componentsOf(G, landPieces).sort((a, b) => sumArea(b) - sumArea(a) || a[0] - b[0]);

    // ── how many plates ──
    let M = Math.round(cfg.platesPerSqrtPieces * Math.sqrt(P));
    M = Math.max(cfg.minPlates, Math.min(cfg.maxPlates, M));
    M = Math.max(M, continents.length + cfg.oceanPlateMin);
    M = Math.min(M, P);

    // the pieces' motion today, per cell
    const velOf = (c) => { const e = G.euler[cellP[c]]; return cross(e, at(xyz, c)); };
    const cellsOf = (pieces) => { const out = []; for (const p of pieces) for (const c of cells[p]) out.push(c); return out; };

    // ── units: each continent rides whole on one plate; the biggest are split once or twice along the seam where
    // today's pieces converged or parted hardest (a collision or a rift inside it: India–Asia, Africa–Arabia) ──
    const units = [];                       // { pieces, cells, continent, euler }
    let splitBudget = Math.max(0, Math.floor((M - continents.length - cfg.oceanPlateMin) / 2));
    // (M4: on an edited layout, each continent's pieces ride the units they rode as first built — `motionFrom` — so a
    // piece raised or sunk does not tip a continent over a split's threshold and regroup all of it: a raised piece joins
    // the unit it borders most, a continent an edit cut in two keeps each part on its unit, two joined by a raised piece
    // stay two plates meeting there)
    const was = motionFrom?.piecePlate ?? null;
    if (was) continents.forEach((cont, ci) => {
        const by = new Map(), loose = [];
        for (const p of cont) { const u = motionFrom.land[p] ? was[p] : -1; if (u < 0) loose.push(p); else { if (!by.has(u)) by.set(u, []); by.get(u).push(p); } }
        for (let pass = 0; loose.length && pass < cont.length; pass++) {
            for (let i = loose.length - 1; i >= 0; i--) {
                const p = loose[i], border = new Map();
                for (const [j, cnt] of G.nbr[p]) for (const [u, ps] of by) if (ps.includes(j)) border.set(u, (border.get(u) ?? 0) + cnt);
                if (!border.size) continue;
                const u = [...border.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
                by.get(u).push(p); loose.splice(i, 1);
            }
        }
        if (loose.length) units.push({ pieces: loose.sort((a, b) => a - b), continent: ci, base: -1 });
        for (const u of [...by.keys()].sort((a, b) => a - b)) units.push({ pieces: by.get(u).sort((a, b) => a - b), continent: ci, base: u });
    });
    else continents.forEach((cont, ci) => {
        const share = sumArea(cont) / n;
        let parts = [cont];
        const wanted = share >= cfg.splitTwiceShare ? 2 : share >= cfg.splitMinShare ? 1 : 0;
        for (let s = 0; s < wanted && splitBudget > 0; s++) {
            parts.sort((a, b) => sumArea(b) - sumArea(a) || a[0] - b[0]);
            if (parts[0].length < 2) break;
            const done = trySplit(parts[0], sumArea(cont));
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
    for (const u of units) { u.cells = cellsOf(u.pieces); u.euler = fitEuler(u.cells, xyz, velOf); }
    const U = units.length;
    const piecePlate = new Int16Array(P).fill(-1);
    units.forEach((u, ui) => { for (const p of u.pieces) piecePlate[p] = ui; });

    // ── ocean-only plates ──
    const K = Math.max(cfg.oceanPlateMin, M - U);
    const fromLand = dijkstraCells(mesh, xyz, cellLand);
    const oceanPieces = []; for (let i = 0; i < P; i++) if (!land[i] && area[i]) oceanPieces.push(i);
    const oceanSeeds = [];                  // each ocean-only plate's seed pieces: { pieces, unit (the continent it dives under, or −1) }
    if (was) {
        // (M4: on an edited layout, the ocean plates are the first build's, each ocean piece on the plate it rode — a
        // piece sunk on its continent's, as that plate's trailing ocean — so an edit does not reseed the oceans)
        const U0 = motionFrom.units, unitOf = new Map();          // (W.units: how many plates are units)
        units.forEach((u, ui) => { if (u.base >= 0 && !unitOf.has(u.base)) unitOf.set(u.base, ui); });
        const to = (b) => (b < 0 ? -1 : b < U0 ? (unitOf.get(b) ?? -1) : U + (b - U0));
        motionFrom.oceanSeeds.forEach(o => oceanSeeds.push({ pieces: o.pieces.filter(p => !land[p]), unit: o.unit >= 0 ? (unitOf.get(o.unit) ?? -1) : -1 }));
        for (const i of oceanPieces) piecePlate[i] = to(motionFrom.piecePlate[i]);
        // (an ocean plate whose seed pieces were all raised: anchored on another of its pieces)
        oceanSeeds.forEach((o, k) => { if (!o.pieces.length) { const i = oceanPieces.find(q => piecePlate[q] === U + k); if (i !== undefined) o.pieces.push(i); } });
    } else {
    const pieceFromLand = new Map(oceanPieces.map(i => { let s = 0; for (const c of cells[i]) s += fromLand[c]; return [i, s / cells[i].length]; }));
    const taken = new Uint8Array(P);
    // Some continents lead into an ocean plate that dives under them (an active margin: South America's Andes); the
    // rest lead into nothing (Africa). For each of the first, the ocean pieces its coast faces along its motion seed an
    // ocean plate of their own, so that plate's edge runs along the coast. Own stream.
    // (each unit's own draw, keyed to its first piece: an edit elsewhere leaves it be)
    const drawn = units.map(u => makeRng(((seed ^ 0x1ead) + Math.min(...u.pieces.map(p => pieceIds[p])) * 7919) >>> 0)() < cfg.activeLeadShare);
    // (at least the biggest continent has one, should the draw give none: a supercontinent's rim was never all quiet)
    if (!drawn.some(Boolean) && U) drawn[0] = true;
    // a continent forced to lead (buildPresentPlates: it had no active margin) leads with its biggest unit, seeded first,
    // whatever the plate count asks
    const firsts = [], rest = [];
    if (forced) continents.forEach((cont, ci) => {
        if (!forced.has(ci)) return;
        const us = units.map((u, ui) => ui).filter(ui => units[ui].continent === ci);
        firsts.push({ ui: us.reduce((a, b) => (units[b].cells.length > units[a].cells.length ? b : a), us[0]), must: true });
    });
    units.forEach((u, ui) => { if (drawn[ui] && !firsts.some(f => f.ui === ui)) rest.push({ ui, must: false }); });
    const leaders = [...firsts, ...rest];
    // the ocean pieces a unit's coast faces along its motion: from the middle of their shared border, the piece lies
    // within ~57° of the way the continent moves there
    const leadingPieces = (u, minCos = cfg.leadCoastCos, openOnly = true) => {
        const score = new Map();
        for (const p of u.pieces) for (const [q, cnt] of G.nbr[p]) {
            if (land[q]) continue;
            const m = G.mid[p].get(q), cq = G.cen[q], cm = dot(cq, m);
            const t = unit([cq[0] - cm * m[0], cq[1] - cm * m[1], cq[2] - cm * m[2]]);
            const s = score.get(q) ?? [0, 0];
            s[0] += cnt * dot(t, unit(cross(u.euler, m))); s[1] += cnt;
            score.set(q, s);
        }
        // (open sea: not a narrow one with another continent's coast across it)
        const otherCoast = (q) => [...G.nbr[q].keys()].some(p => land[p] && piecePlate[p] >= 0 && !u.pieces.includes(p));
        const out = [];
        for (const [q, [s, w]] of score) if (s / w >= minCos && (!openOnly || !otherCoast(q))) out.push(q);
        return out.sort((a, b) => a - b);
    };
    const coastWith = (u, q) => { let s = 0; for (const p of u.pieces) s += G.nbr[p].get(q) ?? 0; return s; };
    for (const { ui, must } of leaders) {
        if (!must && oceanSeeds.length >= K - 1) continue;      // (keep one for the open ocean)
        let ahead = leadingPieces(units[ui]).filter(q => !taken[q]);
        // (a continent's first margin, should no open sea lie squarely ahead: the sea most nearly ahead, then any)
        if (!ahead.length && must) ahead = leadingPieces(units[ui], 0).filter(q => !taken[q]);
        if (!ahead.length && must) ahead = leadingPieces(units[ui], 0, false).filter(q => !taken[q]);
        if (!ahead.length) continue;
        // (the longest connected stretch of them: one plate, one margin)
        const groups = componentsOf(G, ahead).map(g => [g, g.reduce((s, q) => s + coastWith(units[ui], q), 0)]);
        groups.sort((a, b) => b[1] - a[1] || a[0][0] - b[0][0]);
        for (const q of groups[0][0]) taken[q] = 1;
        oceanSeeds.push({ pieces: groups[0][0], unit: ui });
    }
    // the rest seeded farthest from land and from each other
    // (among the three farthest, each piece by a draw of its own: an edit elsewhere leaves the choice be)
    const pieceDraw = (i) => makeRng(((seed ^ 0x51ab) + pieceIds[i] * 104729) >>> 0)();
    for (let k = oceanSeeds.length; k < K; k++) {
        const scored = [];
        for (const i of oceanPieces) {
            if (taken[i]) continue;
            let s = pieceFromLand.get(i);
            for (const o of oceanSeeds) for (const j of o.pieces) s = Math.min(s, gcKm(G.cen[i], G.cen[j]));
            scored.push([s, i]);
        }
        if (!scored.length) break;
        scored.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
        const top = scored.slice(0, Math.min(3, scored.length));
        const pick = top.reduce((a, b) => (pieceDraw(b[1]) > pieceDraw(a[1]) ? b : a));
        taken[pick[1]] = 1;
        oceanSeeds.push({ pieces: [pick[1]], unit: -1 });
    }
    oceanSeeds.forEach((o, k) => { for (const p of o.pieces) piecePlate[p] = U + k; });

    // ── the oceans divided: a Dijkstra in km, cell by cell, from every plate's land and seeds — a continent's growing
    // less far ahead of its motion than behind, so it trails its ocean — and each ocean piece then goes whole to the
    // plate that reached most of it ──
    const reach = new Int16Array(n).fill(-1);
    const dist = new Float64Array(n).fill(Infinity), heap = new MinHeap(4096);
    const source = (c, pl) => { reach[c] = pl; dist[c] = 0; heap.push(0, c); };
    units.forEach((u, ui) => { for (const c of u.cells) source(c, ui); });
    oceanSeeds.forEach((o, k) => { for (const p of o.pieces) for (const c of cells[p]) source(c, U + k); });
    const alpha = cfg.leadingAnisotropy;
    while (heap.size) {
        const c = heap.pop(), dc = heap.lastKey;
        if (dc > dist[c]) continue;
        const pl = reach[c], pc = at(xyz, c);
        // a step costs more the more it goes the way the continent moves (a local metric, so a path cannot slip round
        // in front of the continent from its flanks)
        const vc = pl < U ? unit(cross(units[pl].euler, pc)) : null;
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
            const nb = adjList[k];
            if (cellLand[nb]) continue;                       // land is its continent's from the start
            const pn = at(xyz, nb);
            let f = 1;
            if (vc) {
                const step = [pn[0] - pc[0], pn[1] - pc[1], pn[2] - pc[2]], sl = norm(step);
                if (sl > 1e-12) f = 1 + alpha * Math.max(0, (vc[0] * step[0] + vc[1] * step[1] + vc[2] * step[2]) / sl);
            }
            const nd = dc + gcKm(pc, pn) * f;
            if (nd < dist[nb]) { dist[nb] = nd; reach[nb] = pl; heap.push(nd, nb); }
        }
    }
    for (const i of oceanPieces) {
        if (piecePlate[i] >= 0) continue;
        const votes = new Map();
        for (const c of cells[i]) if (reach[c] >= 0) votes.set(reach[c], (votes.get(reach[c]) ?? 0) + 1);
        let best = -1, bn = 0;
        for (const [pl, v] of votes) if (v > bn || (v === bn && pl < best)) { best = pl; bn = v; }
        piecePlate[i] = best;
    }
    }
    const NP = U + oceanSeeds.length;

    // ── every plate one piece of the globe: a stray group of ocean pieces (or one nothing reached) joins the plate it
    // borders most ──
    const borderOf = (group, not, ok = () => true) => {
        const border = new Map();
        for (const i of group) for (const [j, cnt] of G.nbr[i]) { const q = piecePlate[j]; if (q >= 0 && q !== not && ok(q)) border.set(q, (border.get(q) ?? 0) + cnt); }
        let best = -1, bn = -1;
        for (const [q, v] of border) if (v > bn || (v === bn && q < best)) { best = q; bn = v; }
        return best;
    };
    const anchorOf = (pl) => (pl < U ? units[pl].pieces[0] : oceanSeeds[pl - U].pieces[0]);
    for (let pass = 0; pass < 6; pass++) {
        let moved = 0;
        for (const i of oceanPieces) if (piecePlate[i] < 0) { const b = borderOf([i], -1); if (b >= 0) { piecePlate[i] = b; moved++; } }
        for (let pl = 0; pl < NP; pl++) {
            const mine = []; for (let i = 0; i < P; i++) if (piecePlate[i] === pl) mine.push(i);
            if (!mine.length) continue;
            const comps = componentsOf(G, mine);
            if (comps.length < 2) continue;
            const anchor = anchorOf(pl);
            for (const comp of comps) {
                if (comp.includes(anchor)) continue;
                const best = borderOf(comp, pl);
                if (best < 0) continue;
                for (const i of comp) if (!land[i]) { piecePlate[i] = best; moved++; }
            }
        }
        if (!moved) break;
    }

    // ── an ocean plate squeezed to a speck by its neighbours joins the one it borders most; the rest renumbered ──
    {
        const count = new Float64Array(NP); for (let i = 0; i < P; i++) if (piecePlate[i] >= 0) count[piecePlate[i]] += area[i];
        const keep = (pl) => pl < U || count[pl] >= cfg.minPlateShare * n;
        const remap = new Int16Array(NP).fill(-1);
        let next = U;
        for (let pl = 0; pl < NP; pl++) remap[pl] = keep(pl) ? (pl < U ? pl : next++) : -1;
        for (let pl = U; pl < NP; pl++) {
            if (remap[pl] >= 0) continue;
            const mine = []; for (let i = 0; i < P; i++) if (piecePlate[i] === pl) mine.push(i);
            remap[pl] = remap[Math.max(0, borderOf(mine, pl, keep))];
        }
        for (let i = 0; i < P; i++) if (piecePlate[i] >= 0) piecePlate[i] = remap[piecePlate[i]];
        const kept = oceanSeeds.filter((o, k) => keep(U + k));
        oceanSeeds.length = 0; oceanSeeds.push(...kept);
    }
    const plateOf = new Int16Array(n);
    const NPk = U + oceanSeeds.length;
    const override = new Int16Array(n).fill(-1);          // a cell's plate where its piece is split (below)
    let plates = motions();

    // ── no ridge along a continent's coast (a sea a few Myr old, there by chance): an ocean piece parting from the
    // continent it borders joins that continent's plate as its trailing ocean, and the ridge moves out by a piece ──
    const isAnchor = new Uint8Array(P); oceanSeeds.forEach(o => { isAnchor[o.pieces[0]] = 1; });
    for (let pass = 0; pass < 3; pass++) {
        let moved = 0;
        for (const q of oceanPieces) {
            const A = piecePlate[q];
            // (not a seed, nor a piece on its own continent's coast: that is its continent's margin either way)
            if (isAnchor[q] || [...G.nbr[q].keys()].some(p => land[p] && piecePlate[p] === A)) continue;
            const best = partingContinent(q, A);
            if (best < 0) continue;
            // (only if its plate stays one piece of the globe and big enough)
            const rest = []; let restArea = 0;
            for (let i = 0; i < P; i++) if (piecePlate[i] === A && i !== q) { rest.push(i); restArea += area[i]; }
            if (restArea < cfg.minPlateShare * n || componentsOf(G, rest).length !== 1) continue;
            piecePlate[q] = best; moved++;
        }
        if (!moved) break;
        plates = motions();
    }

    // ── a narrow sea between two continents parting: an ocean piece on one continent's plate whose far coast parts from
    // it is split down its middle, so its ridge runs there (the Red Sea), not along either coast ──
    const splitPiece = new Uint8Array(P);
    {
        const sd = new Float64Array(n).fill(Infinity), heap = new MinHeap(256);
        for (const q of oceanPieces) {
            const A = piecePlate[q];
            if (A >= U || ![...G.nbr[q].keys()].some(p => land[p] && piecePlate[p] === A)) continue;
            const other = partingContinent(q, A);
            if (other < 0) continue;
            // each of its cells to the nearer of the two coasts (a Dijkstra in km inside the piece)
            for (const c of cells[q]) for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
                const nb = adjList[k], pl = cellLand[nb] ? piecePlate[cellP[nb]] : -1;
                if ((pl === A || pl === other) && sd[c] > 0) { sd[c] = 0; override[c] = pl; heap.push(0, c); }
            }
            while (heap.size) {
                const c = heap.pop(), dc = heap.lastKey;
                if (dc > sd[c]) continue;
                for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
                    const nb = adjList[k];
                    if (cellP[nb] !== q) continue;
                    const nd = dc + gcKm(at(xyz, c), at(xyz, nb));
                    if (nd < sd[nb]) { sd[nb] = nd; override[nb] = override[c]; heap.push(nd, nb); }
                }
            }
            for (const c of cells[q]) { sd[c] = Infinity; if (override[c] < 0) override[c] = A; }
            splitPiece[q] = 1;
        }
    }
    // ── G5b (owner, 2026-11-04: "create more of an illusion that some of these continents would have fit together like a
    // puzzle in the past"): two continents on plates that border each other at sea and part there were one, and the ocean
    // between them opened from a ridge down its middle — so the ridge runs there, midway between the two coasts (the
    // Mid-Atlantic Ridge mirrors both): each ocean cell of the two plates goes to the plate of the nearer coast, as the
    // narrow sea's cells are split above, and the floor's ages (present/seafloor.js) stripe parallel to both coasts ──
    const conjugates = [];
    {
        const po = (c) => (override[c] >= 0 ? override[c] : Math.max(0, piecePlate[cellP[c]]));
        const meet = new Map();
        for (let c = 0; c < n; c++) {
            const a = po(c);
            if (cellLand[c] || a >= U) continue;
            for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
                const nb = adjList[k], b = po(nb);
                if (cellLand[nb] || b >= U || b <= a || units[a].continent === units[b].continent) continue;
                const pc = at(xyz, c), pn = at(xyz, nb), m = unit([pc[0] + pn[0], pc[1] + pn[1], pc[2] + pn[2]]);
                const d0 = [pn[0] - pc[0], pn[1] - pc[1], pn[2] - pc[2]], dm = dot(d0, m), d = unit([d0[0] - dm * m[0], d0[1] - dm * m[1], d0[2] - dm * m[2]]);
                const wa = plates[a].euler, wb = plates[b].euler, rel = cross([wb[0] - wa[0], wb[1] - wa[1], wb[2] - wa[2]], m);
                const open = dot(rel, d), slip = norm([rel[0] - open * d[0], rel[1] - open * d[1], rel[2] - open * d[2]]);
                const key = a * 4096 + b, s = meet.get(key) ?? [0, 0, 0];
                s[0] += open; s[1] += slip; s[2]++;
                meet.set(key, s);
            }
        }
        for (const [key, [o, sl, cnt]] of [...meet.entries()].sort((x, y) => x[0] - y[0])) {
            const open = o / cnt, slip = sl / cnt;
            if (cnt >= cfg.fitMinEdges && open * R > cfg.minRateCmYr * 10 && open >= cfg.transformRatio * slip) conjugates.push({ a: Math.floor(key / 4096), b: key % 4096 });
        }
        const sd = new Float64Array(n), lab = new Int16Array(n), heap = new MinHeap(1024);
        for (const { a, b } of conjugates) {
            sd.fill(Infinity); lab.fill(-1);
            for (let c = 0; c < n; c++) { const p = po(c); if (cellLand[c] && (p === a || p === b)) { sd[c] = 0; lab[c] = p; heap.push(0, c); } }
            while (heap.size) {
                const c = heap.pop(), dc = heap.lastKey;
                if (dc > sd[c]) continue;
                for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
                    const nb = adjList[k];
                    if (cellLand[nb]) continue;
                    const p = po(nb);
                    if (p !== a && p !== b) continue;
                    const nd = dc + gcKm(at(xyz, c), at(xyz, nb));
                    if (nd < sd[nb] && nd <= cfg.fitBasinKm) { sd[nb] = nd; lab[nb] = lab[c]; heap.push(nd, nb); }
                }
            }
            for (let c = 0; c < n; c++) if (!cellLand[c] && lab[c] >= 0 && lab[c] !== po(c)) { override[c] = lab[c]; splitPiece[cellP[c]] = 1; }
        }
    }
    // out at sea, far from any coast, the edge between two plates is smoothed: the pieces' outlines wiggle a few hundred
    // km across, and a trench and its island arc should sweep in arcs (the Plates tab still draws the pieces' own
    // outlines; within ~seaSmoothKm of land, where an active margin runs along the coast, the edge stays on them)
    plates = motions(true);

    // the continent plate whose land across an ocean piece's coast parts from that piece's plate A fastest (−1: none),
    // parting meaning a ridge there: opening faster than minRate and more than transformRatio × the slip along it
    function partingContinent(q, A) {
        const part = new Map();
        for (const [p, cnt] of G.nbr[q]) {
            const u = piecePlate[p];
            if (!land[p] || u < 0 || u >= U || u === A) continue;
            const m = G.mid[q].get(p), cp = G.cen[p], cm = dot(cp, m);
            const t = unit([cp[0] - cm * m[0], cp[1] - cm * m[1], cp[2] - cm * m[2]]);   // from the sea toward the land
            const wu = plates[u].euler, wa = plates[A].euler;
            const rel = cross([wu[0] - wa[0], wu[1] - wa[1], wu[2] - wa[2]], m);
            const open = dot(rel, t), slip = norm([rel[0] - open * t[0], rel[1] - open * t[1], rel[2] - open * t[2]]);
            const s = part.get(u) ?? [0, 0, 0];
            s[0] += cnt * open; s[1] += cnt * slip; s[2] += cnt;
            part.set(u, s);
        }
        let best = -1, bestOpen = 0;
        for (const [u, [o, sl, w]] of part) {
            const open = o / w, slip = sl / w;
            if (open * R > cfg.minRateCmYr * 10 && open >= cfg.transformRatio * slip && open > bestOpen) { best = u; bestOpen = open; }
        }
        return best;
    }

    // each cell's plate, out at sea, the plate whose share of the cells around it — blurred by a Gaussian of
    // σ = seaSmoothKm — is largest; then every plate made one piece of the globe again
    function smoothAtSea() {
        const NP = NPk, passes = Math.max(1, Math.round((cfg.seaSmoothKm / edgeKmOf(mesh)) ** 2 / 0.43));
        let a = new Float32Array(n * NP), b = new Float32Array(n * NP);
        for (let c = 0; c < n; c++) a[c * NP + plateOf[c]] = 1;
        for (let p = 0; p < passes; p++) {
            for (let c = 0; c < n; c++) {
                const o = c * NP;
                for (let j = 0; j < NP; j++) b[o + j] = a[o + j];
                for (let e = adjOffset[c]; e < adjOffset[c + 1]; e++) { const q = adjList[e] * NP; for (let j = 0; j < NP; j++) b[o + j] += a[q + j]; }
                const inv = 1 / (1 + adjOffset[c + 1] - adjOffset[c]);
                for (let j = 0; j < NP; j++) b[o + j] *= inv;
            }
            [a, b] = [b, a];
        }
        const reach = cfg.seaSmoothKm + edgeKmOf(mesh);
        for (let c = 0; c < n; c++) {
            if (fromLand[c] < reach || override[c] >= 0) continue;
            const o = c * NP; let best = plateOf[c], bv = a[o + best];
            for (let j = 0; j < NP; j++) if (a[o + j] > bv) { bv = a[o + j]; best = j; }
            plateOf[c] = best;
        }
        // (a sliver the blur cut off joins the plate it borders most)
        const anchor = new Int32Array(NP).fill(-1);
        for (let c = 0; c < n; c++) if (anchor[plateOf[c]] < 0 && (cellLand[c] || fromLand[c] < reach)) anchor[plateOf[c]] = c;
        const seen = new Uint8Array(n);
        for (let s = 0; s < n; s++) {
            if (seen[s]) continue;
            const pl = plateOf[s], comp = [s]; seen[s] = 1;
            for (let q = 0; q < comp.length; q++) for (let k = adjOffset[comp[q]]; k < adjOffset[comp[q] + 1]; k++) { const nb = adjList[k]; if (!seen[nb] && plateOf[nb] === pl) { seen[nb] = 1; comp.push(nb); } }
            if (anchor[pl] < 0 || comp.includes(anchor[pl])) continue;
            const border = new Map();
            for (const c of comp) for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const q = plateOf[adjList[k]]; if (q !== pl) border.set(q, (border.get(q) ?? 0) + 1); }
            let best = -1, bn = -1;
            for (const [q, v] of border) if (v > bn || (v === bn && q < best)) { best = q; bn = v; }
            if (best >= 0) for (const c of comp) plateOf[c] = best;
        }
    }

    // each plate's cells, its share of land and ocean, and its motion
    function motions(smooth = false) {
        for (let c = 0; c < n; c++) plateOf[c] = override[c] >= 0 ? override[c] : Math.max(0, piecePlate[cellP[c]]);
        if (smooth) smoothAtSea();
        const plates = [];
        const plateCells = Array.from({ length: NPk }, () => []);
        for (let c = 0; c < n; c++) plateCells[plateOf[c]].push(c);
        for (let pl = 0; pl < NPk; pl++) {
            const pc = plateCells[pl];
            let landCells = 0, s0 = 0, s1 = 0, s2 = 0;
            for (const c of pc) { landCells += cellLand[c]; s0 += xyz[3 * c]; s1 += xyz[3 * c + 1]; s2 += xyz[3 * c + 2]; }
            plates.push({
                index: pl, continental: pl < U, continent: pl < U ? units[pl].continent : -1,
                // (who it is across edits: its first piece — its land's, or its seed's at sea — the Plates tab's colour)
                key: pl < U ? Math.min(...units[pl].pieces.map(p => pieceIds[p])) : pieceIds[oceanSeeds[pl - U].pieces[0]],
                cellCount: pc.length, share: pc.length / n, landShare: pc.length ? landCells / pc.length : 0,
                centroid: unit([s0, s1, s2]),
                dir: unit(pl < U ? units[pl].euler : fitEuler(pc, xyz, velOf)),
            });
        }
        // slab pull: an ocean plate is drawn toward the continent plates it borders (it dives under them) — one seeded
        // ahead of a continent toward that continent alone (its slab hangs under that coast)
        for (const pl of plates) {
            if (pl.continental) continue;
            const under = oceanSeeds[pl.index - U].unit;
            let t = [0, 0, 0], rim = 0, rimCont = 0;
            for (const c of plateCells[pl.index]) {
                const pc = at(xyz, c);
                for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
                    const nb = adjList[k], q = plateOf[nb];
                    if (q === pl.index) continue;
                    rim++;
                    if (!plates[q].continental) continue;
                    rimCont++;
                    if (under >= 0 && q !== under) continue;
                    const pn = at(xyz, nb), m = unit([pc[0] + pn[0], pc[1] + pn[1], pc[2] + pn[2]]);
                    const d = [pn[0] - pc[0], pn[1] - pc[1], pn[2] - pc[2]], dm = dot(d, m);
                    const ax = cross(m, unit([d[0] - dm * m[0], d[1] - dm * m[1], d[2] - dm * m[2]]));
                    t = [t[0] + ax[0], t[1] + ax[1], t[2] + ax[2]];
                }
            }
            pl.trenchShare = rim ? rimCont / rim : 0;
            const tu = unit(t), b = rimCont ? cfg.slabPullBlend : 0;
            const d = unit([(1 - b) * pl.dir[0] + b * tu[0], (1 - b) * pl.dir[1] + b * tu[1], (1 - b) * pl.dir[2] + b * tu[2]]);
            if (norm(d) > 0) pl.dir = d;
        }
        // speeds: continents slow (the bigger the slower), ocean plates fast where they dive under continents
        // (each plate's jitter its own draw, keyed by who it is — its first piece — so an edit that renumbers the plates
        // leaves the others' speeds as they were)
        for (const pl of plates) {
            const srng = makeRng(((seed ^ 0x5bed) + pl.key * 7919) >>> 0);
            let cm;
            if (pl.continental) {
                const [slow, fast] = cfg.continentSpeedCmYr;
                cm = fast + (slow - fast) * Math.min(1, pl.share / cfg.continentSpeedFullShare);
            } else {
                cm = cfg.oceanSpeedCmYr[0] + (cfg.oceanSpeedCmYr[1] - cfg.oceanSpeedCmYr[0]) * Math.min(1, pl.trenchShare ?? 0);
            }
            cm *= 1 + cfg.speedJitter * (2 * srng() - 1);
            // |ω| so that the plate's RMS surface speed is cm (cm/yr → km/Myr ×10)
            let m2 = 0;
            for (const c of plateCells[pl.index]) { const s = dot(pl.dir, at(xyz, c)); m2 += 1 - s * s; }
            const rms = Math.sqrt(m2 / Math.max(1, pl.cellCount)) || 1;
            const w = (cm * 10) / (R * rms);                       // rad/Myr
            pl.speedCmYr = cm;
            pl.euler = [pl.dir[0] * w, pl.dir[1] * w, pl.dir[2] * w];
        }
        // (M4: on an edited layout, a plate there before — most of its cells rode it — moves as it did: a piece raised or
        // sunk does not turn or speed up the rest of its plate, so its other edges' belts stay as they were)
        if (motionFrom) for (const pl of plates) {
            const was = matchedPlate(motionFrom, plateCells[pl.index]);
            if (was) { pl.dir = was.dir.slice(); pl.speedCmYr = was.speedCmYr; pl.euler = was.euler.slice(); }
        }
        return plates;
    }

    return { M: NPk, units: U, continents, cellPlate: plateOf, piecePlate, splitPiece, plates, graph: G, land, cellLand, oceanSeeds, conjugates };
}

/** The plates as built, for buildPresentPlates' `motionFrom` (M4): which plate each cell and land piece rode, the pieces'
 *  land, and the plates. */
export const motionsOf = (W) => ({ cellPlate: W.cellPlate, piecePlate: W.piecePlate, land: W.land, plates: W.plates, units: W.units, oceanSeeds: W.oceanSeeds });
/** The plate of `was` (motionsOf) that most of these cells rode — if at least half of them did — else null. */
export function matchedPlate(was, cells) {
    const count = new Map();
    let best = -1, most = 0;
    for (const c of cells) { const p = was.cellPlate[c], k = (count.get(p) ?? 0) + 1; count.set(p, k); if (k > most) { most = k; best = p; } }
    return best >= 0 && 2 * most >= cells.length ? was.plates[best] : null;
}

/** Distance in km from the cells flagged in `src` (a plain Dijkstra over the mesh). */
export function dijkstraCells(mesh, xyz, src) {
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

/** The crust's land per cell as edited: each cell its piece's land now (`pieceLandNow`, per piece index). */
export function cellLandNow(L, W, pieceLandNow) {
    const n = L.mesh.numRegions, out = new Uint8Array(n), { cellP } = W.graph;
    for (let c = 0; c < n; c++) out[c] = pieceLandNow[cellP[c]];
    return out;
}

/**
 * The plate boundaries: each mesh edge between two plates classified by the plates' relative motion averaged along
 * the boundary (cfg.smoothKm), and by the land on each side as drawn (`landNow`, per cell).
 * @param {Uint8Array} [crustLand]  the pieces' land per cell as edited: which side of a trench rides over — the
 *   continent, though the coast drawn along its edge leaves a strip of sea in front of it (present/coast.js)
 * @returns {{count:number, mid:Float32Array, a:Int16Array, b:Int16Array, kind:Uint8Array, openCmYr:Float32Array,
 *   slipCmYr:Float32Array, over:Int8Array, landA:Uint8Array, landB:Uint8Array, cellA:Int32Array, cellB:Int32Array}}
 *   over: which side rides over a trench (0 = a, 1 = b, −1 none)
 */
export function classifyBoundaries(L, W, landNow, cfg = PRESENT, crustLand = landNow) {
    const { mesh, xyz } = L, { adjOffset, adjList } = mesh, n = mesh.numRegions;
    const { cellPlate, plates } = W;
    const E = [];
    for (let c = 0; c < n; c++) {
        const A = cellPlate[c], pc = at(xyz, c);
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
            const nb = adjList[k];
            if (nb < c) continue;
            const B = cellPlate[nb];
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
            E.push({ c, nb, A, B, m, open, slip, dive: towardA >= towardB ? 0 : 1, landA: landNow[c], landB: landNow[nb], crustA: crustLand[c], crustB: crustLand[nb] });
        }
    }
    // averaged along the same boundary (the same pair of plates) within smoothKm — open and slip read the same from
    // either side, so edges seen from either plate average together
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
                const wt = 1 - (1 - cj) / (1 - cosR) * 0.5;
                so += E[j].open * wt; ss += E[j].slip * wt; w += wt;
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
            // land never dives: the ocean side goes down (the continent's, though a strip of sea lies in front of it);
            // ocean against ocean, the side moving harder toward the other
            over = e.landA ? 0 : e.landB ? 1 : e.crustA !== e.crustB ? (e.crustA ? 0 : 1) : (e.dive === 0 ? 1 : 0);
        }
        out.kind[i] = kind; out.over[i] = over;
    });
    return out;
}

/**
 * Points spread evenly over the sphere (a Fibonacci lattice of `count`, about Generate's y axis), each with the plate
 * under it: where the Plates view draws the motion's arrows.
 */
export function arrowAnchors(L, W, count = 150) {
    const { mesh, xyz } = L, n = mesh.numRegions;
    const pts = new Float32Array(3 * count), plate = new Int16Array(count);
    const golden = Math.PI * (3 - Math.sqrt(5));
    let cur = 0;
    for (let k = 0; k < count; k++) {
        const y = 1 - (2 * k + 1) / count, r = Math.sqrt(1 - y * y), th = golden * k;
        const p = [Math.cos(th) * r, y, Math.sin(th) * r];
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
        plate[k] = W.cellPlate[cur];
    }
    return { pts, plate };
}

/**
 * Measures for the checks and the readout: how much of the continental coast is passive — no plate boundary within
 * `activeKm` of it (an Andean trench lies ~100–200 km offshore, so the coast itself is inside its plate) — and the
 * kinds' shares by length.
 */
export function plateStats(L, W, B, activeKm = 400) {
    const { mesh, xyz } = L, { adjOffset, adjList } = mesh, n = mesh.numRegions;
    const onBoundary = new Uint8Array(n);
    for (let i = 0; i < B.count; i++) { onBoundary[B.cellA[i]] = 1; onBoundary[B.cellB[i]] = 1; }
    const fromBoundary = dijkstraCells(mesh, xyz, onBoundary);
    let coast = 0, passive = 0;
    for (let c = 0; c < n; c++) {
        if (!W.cellLand[c]) continue;
        let isCoast = false;
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) if (!W.cellLand[adjList[k]]) { isCoast = true; break; }
        if (!isCoast) continue;
        coast++;
        if (fromBoundary[c] > activeKm) passive++;
    }
    const kindShare = new Array(BOUNDARY_NAME.length).fill(0);
    for (let i = 0; i < B.count; i++) kindShare[B.kind[i]]++;
    return { passiveCoastShare: coast ? passive / coast : 0, kindShare: kindShare.map(v => v / Math.max(1, B.count)), boundaryEdges: B.count };
}
