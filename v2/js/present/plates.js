// G1 — plates that move (plans/GENERATE_REDESIGN_PLAN.md §3.1), G1b — free of the piece grid.
//
// Generate's layout (js/coarse-plates.js, kept byte for byte) cuts the sphere into ~80 PIECES, each land or ocean; on
// the sim mesh (present/layout.js) they say only which crust is land. Here the sphere is divided into fewer plates that
// move and carry continent and ocean alike, as Evolution's do — so most coasts lie inside a plate (passive margins),
// trenches appear where a continent leads into another plate, and ridges where two continents' trailing oceans meet.
// The plates are drawn cell by cell (G1b, owner: "I don't like how obvious the grid looks"): a continent rides whole on
// one plate (or is cut once or twice by a line of its own, not a piece border), and the oceans are divided by a
// Dijkstra in km — so no plate boundary follows the pieces.
//
// Everything is decided on the UNEDITED layout (the land each piece had before any Ctrl-click), so an edit changes only
// the crust, never the plates: raising one piece changes only its own neighbourhood. The boundaries' kinds
// (classifyBoundaries) read the crust as edited.
//
// The plates' motion is seeded from the pieces' own motion today (js/plate-physics.js, on the unedited layout), so the
// big convergent seams — today's big ranges — stay loosely where they were (owner, 2026-11-02).

import { makeRng } from '../../../js/rng.js';
import { MinHeap } from '../core/min-heap.js';
import { FastNoise } from '../core/fast-noise.js';
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
 *   euler:number[][], nbr:Map<number,number>[], seam:Map<number,number>[]}}  (nbr[i].get(j): cell edges shared;
 *   seam[i].get(j): today's mean opening rate across them, negative = closing — in the layout's own units)
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

/** Cells in connected groups over the mesh, among those `inSet` marks. */
function cellComponents(mesh, cells, inSet) {
    const { adjOffset, adjList } = mesh, seen = new Uint8Array(mesh.numRegions), out = [];
    for (const s of cells) {
        if (seen[s]) continue;
        const comp = [s]; seen[s] = 1;
        for (let q = 0; q < comp.length; q++) {
            const c = comp[q];
            for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const nb = adjList[k]; if (inSet[nb] && !seen[nb]) { seen[nb] = 1; comp.push(nb); } }
        }
        out.push(comp);
    }
    return out;
}

/**
 * A Dijkstra in km over the cells `allowed` marks, from labelled sources: each reached cell takes its source's label.
 * `costAt(c)` (optional) weighs each step into cell c — a noise there makes the line where two labels meet wander.
 */
function labelFrom(mesh, xyz, allowed, sources, costAt = null) {
    const n = mesh.numRegions, { adjOffset, adjList } = mesh;
    const dist = new Float64Array(n).fill(Infinity), label = new Int16Array(n).fill(-1), heap = new MinHeap(1024);
    for (const [c, l] of sources) { dist[c] = 0; label[c] = l; heap.push(0, c); }
    while (heap.size) {
        const c = heap.pop(), dc = heap.lastKey;
        if (dc > dist[c]) continue;
        const pc = at(xyz, c);
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
            const nb = adjList[k];
            if (!allowed[nb]) continue;
            const nd = dc + gcKm(pc, at(xyz, nb)) * (costAt ? costAt(nb) : 1);
            if (nd < dist[nb]) { dist[nb] = nd; label[nb] = label[c]; heap.push(nd, nb); }
        }
    }
    return label;
}

/** The cell of a list nearest a unit point. */
function nearestOf(cells, xyz, p) {
    let best = cells[0], bd = -2;
    for (const c of cells) { const d = dot(p, at(xyz, c)); if (d > bd) { bd = d; best = c; } }
    return best;
}

/**
 * Divide the sphere into plates that move.
 * @param {Object} L  the layout (present/layout.js): { mesh: {numRegions, adjOffset, adjList}, xyz (Generate's frame),
 *   cellPiece, pieceIds (the planet code's toggle order), pieceOcean (Set — UNEDITED), pieceVec ({id: {pole, omega}}:
 *   the pieces' motion today on the unedited layout), seed }
 * @returns {Object} W: { M, units, continents, cellPlate (plate per cell), plates[], graph, land (per piece, unedited),
 *   cellLand (per cell, unedited), oceanSeeds }
 */
export function buildPresentPlates(L, cfg = PRESENT) {
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

    // ── units: each continent rides whole on one plate; the biggest are cut once or twice, by a line of their own
    // through the seam where today's pieces converged or parted hardest ──
    const units = [];                       // { cells, continent, euler }
    const cutNoise = new FastNoise((seed ^ 0x5c07) >>> 0), cutF = R / cfg.splitWanderKm;
    let splitBudget = Math.max(0, Math.floor((M - continents.length - cfg.oceanPlateMin) / 2));
    const inUnit = new Uint8Array(n);
    continents.forEach((cont, ci) => {
        const share = sumArea(cont) / n;
        let parts = [cellsOf(cont)];
        const wanted = share >= cfg.splitTwiceShare ? 2 : share >= cfg.splitMinShare ? 1 : 0;
        for (let s = 0; s < wanted && splitBudget > 0; s++) {
            parts.sort((a, b) => b.length - a.length || a[0] - b[0]);
            const done = trySplit(parts[0], sumArea(cont));
            if (!done) break;
            parts = [done[0], done[1], ...parts.slice(1)];
            splitBudget--;
        }
        for (const part of parts) units.push({ cells: part, continent: ci });
    });
    function trySplit(partCells, contArea) {
        // the pieces mostly in this part, and their seams, strongest first
        inUnit.fill(0); for (const c of partCells) inUnit[c] = 1;
        const share = new Map();
        for (const c of partCells) share.set(cellP[c], (share.get(cellP[c]) ?? 0) + 1);
        const members = [...share].filter(([i, cnt]) => cnt > area[i] / 2).map(([i]) => i);
        const inSet = new Set(members), pairs = [];
        for (const i of members) for (const [j, cnt] of G.nbr[i]) if (j > i && inSet.has(j)) pairs.push([i, j, Math.abs(G.seam[i].get(j)) * Math.sqrt(cnt)]);
        pairs.sort((a, b) => b[2] - a[2] || a[0] - b[0] || a[1] - b[1]);
        for (let t = 0; t < Math.min(cfg.splitTries, pairs.length); t++) {
            // grown from the two pieces' middles: the cut runs across the seam between them, not along any piece border
            const a = nearestOf(cells[pairs[t][0]].filter(c => inUnit[c]), xyz, G.cen[pairs[t][0]]);
            const b = nearestOf(cells[pairs[t][1]].filter(c => inUnit[c]), xyz, G.cen[pairs[t][1]]);
            if (a === undefined || b === undefined || a === b) continue;
            // (through a noise of its own: a weighted Dijkstra's meeting line bends and steps — a collision front or a rift
            // is never the straight bisector a plain distance draws)
            const label = labelFrom(mesh, xyz, inUnit, [[a, 0], [b, 1]], (c) => 1 + cfg.splitWander * (1 + cutNoise.noise3D(xyz[3 * c] * cutF, xyz[3 * c + 1] * cutF, xyz[3 * c + 2] * cutF)));
            const parts = [[], []];
            for (const c of partCells) parts[Math.max(0, label[c])].push(c);
            if (Math.min(parts[0].length, parts[1].length) >= cfg.splitMinPart * contArea) return parts;
        }
        return null;
    }
    for (const u of units) u.euler = fitEuler(u.cells, xyz, velOf);

    // ── ocean-only plates: seeded farthest from land and from each other ──
    const K = Math.max(cfg.oceanPlateMin, M - units.length);
    const fromLand = dijkstraCells(mesh, xyz, cellLand);
    const oceanPieces = []; for (let i = 0; i < P; i++) if (!land[i] && area[i]) oceanPieces.push(i);
    const pieceFromLand = new Map(oceanPieces.map(i => { let s = 0; for (const c of cells[i]) s += fromLand[c]; return [i, s / cells[i].length]; }));
    const rng = makeRng(seed ^ 0x51ab);
    const oceanSeeds = [];                  // each ocean-only plate's seed cells: { cells, piece (or −1), unit (or −1) }
    const taken = new Uint8Array(n);
    // Some continents lead into an ocean plate that dives under them (an active margin: South America's Andes); the
    // rest lead into nothing (Africa). Each of the first gets an ocean plate seeded along a line ~leadSeedKm off its
    // leading coast — so the plate spans the whole margin (the Nazca plate off the Andes), and the growth below puts
    // the trench ~1/(2 + α) of that offshore (~150–250 km). Own stream.
    const lrng = makeRng(seed ^ 0x1ead);
    const leaders = units.map((u, ui) => ({ ui, active: lrng() < cfg.activeLeadShare })).filter(l => l.active);
    // (at least the biggest continent has one, should the draw give none: a supercontinent's rim was never all quiet)
    if (!leaders.length && units.length) leaders.push({ ui: 0, active: true });
    for (const { ui } of leaders) {
        if (oceanSeeds.length >= K - 1) break;                  // (keep one for the open ocean)
        const u = units[ui], line = [], th = cfg.leadSeedKm / R;
        for (const c of u.cells) {
            const pc = at(xyz, c);
            let out = [0, 0, 0], sea = 0;
            for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
                const nb = adjList[k];
                if (cellLand[nb]) continue;
                sea++; const pn = at(xyz, nb); out = [out[0] + pn[0] - pc[0], out[1] + pn[1] - pc[1], out[2] + pn[2] - pc[2]];
            }
            if (!sea) continue;
            const v = unit(cross(u.euler, pc));
            if (dot(unit(out), v) < cfg.leadCoastCos) continue;  // not on the leading coast
            // the point leadSeedKm ahead of the coast, along the motion
            const q = unit([pc[0] * Math.cos(th) + v[0] * Math.sin(th), pc[1] * Math.cos(th) + v[1] * Math.sin(th), pc[2] * Math.cos(th) + v[2] * Math.sin(th)]);
            let cur = c, best = dot(q, pc);
            for (let moved = true; moved;) {
                moved = false;
                for (let k = adjOffset[cur]; k < adjOffset[cur + 1]; k++) { const nb = adjList[k], d = dot(q, at(xyz, nb)); if (d > best) { best = d; cur = nb; moved = true; } }
            }
            // open sea there (not another coast across a narrow sea), and not another plate's seed
            if (!cellLand[cur] && fromLand[cur] > 0.6 * cfg.leadSeedKm && !taken[cur]) line.push(cur);
        }
        if (line.length < 3) continue;
        for (const c of line) taken[c] = 1;
        oceanSeeds.push({ cells: [...new Set(line)], piece: -1, unit: ui });
    }
    const seedPieces = new Set();
    for (let k = oceanSeeds.length; k < K && seedPieces.size < oceanPieces.length; k++) {
        const scored = [];
        for (const i of oceanPieces) {
            if (seedPieces.has(i)) continue;
            let s = pieceFromLand.get(i);
            for (const o of oceanSeeds) for (const c of o.cells) s = Math.min(s, gcKm(G.cen[i], at(xyz, c)));
            scored.push([s, i]);
        }
        if (!scored.length) break;
        scored.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
        const pick = scored[Math.min(scored.length - 1, Math.floor(rng() * Math.min(3, scored.length)))];
        seedPieces.add(pick[1]);
        // (a piece's middle only — the whole piece would draw its outline into the boundaries)
        oceanSeeds.push({ cells: [nearestOf(cells[pick[1]], xyz, G.cen[pick[1]])], piece: pick[1], unit: -1 });
    }

    // ── the oceans divided cell by cell: a Dijkstra in km from every plate's seeds; a continent's grows less far ahead
    // of its motion than behind, so it trails its ocean ──
    const U = units.length, NP = U + oceanSeeds.length;
    const plateOf = new Int16Array(n).fill(-1), origin = new Int32Array(n).fill(-1);
    const dist = new Float64Array(n).fill(Infinity), heap = new MinHeap(4096);
    units.forEach((u, ui) => { for (const c of u.cells) { plateOf[c] = ui; origin[c] = c; dist[c] = 0; heap.push(0, c); } });
    oceanSeeds.forEach((o, k) => { for (const c of o.cells) { plateOf[c] = U + k; origin[c] = c; dist[c] = 0; heap.push(0, c); } });
    const alpha = cfg.leadingAnisotropy;
    while (heap.size) {
        const c = heap.pop(), dc = heap.lastKey;
        if (dc > dist[c]) continue;
        const pl = plateOf[c], o = origin[c];
        const pc = at(xyz, c);
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
            if (nd < dist[nb]) { dist[nb] = nd; plateOf[nb] = pl; origin[nb] = o; heap.push(nd, nb); }
        }
    }
    // (a sea no plate's growth reached — ahead of a continent, cut off from the open ocean: the continent's after all)
    if (plateOf.includes(-1)) {
        const src = []; for (let c = 0; c < n; c++) if (plateOf[c] >= 0) src.push([c, plateOf[c]]);
        const all = new Uint8Array(n).fill(1), lab = labelFrom(mesh, xyz, all, src);
        for (let c = 0; c < n; c++) if (plateOf[c] < 0) plateOf[c] = Math.max(0, lab[c]);
    }

    // ── smoothed at sea (a majority of the neighbours, ~250 km of passes), then every plate one piece of the globe ──
    const passes = Math.max(1, Math.round(cfg.boundarySmoothKm / edgeKmOf(mesh)));
    for (let pass = 0; pass < passes; pass++) {
        const next = plateOf.slice();
        for (let c = 0; c < n; c++) {
            if (cellLand[c]) continue;
            const votes = new Map();
            for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const q = plateOf[adjList[k]]; votes.set(q, (votes.get(q) ?? 0) + 1); }
            let best = plateOf[c], bn = 0;
            for (const [q, v] of votes) if (v > bn || (v === bn && q < best)) { best = q; bn = v; }
            if (bn * 2 > adjOffset[c + 1] - adjOffset[c] && best !== plateOf[c]) next[c] = best;
        }
        plateOf.set(next);
    }
    const anchorOf = (pl) => (pl < U ? units[pl].cells[0] : oceanSeeds[pl - U].cells[0]);
    for (let pass = 0; pass < 6; pass++) {
        let moved = 0;
        const byPlate = Array.from({ length: NP }, () => []);
        for (let c = 0; c < n; c++) byPlate[plateOf[c]].push(c);
        const mark = new Uint8Array(n);
        for (let pl = 0; pl < NP; pl++) {
            if (!byPlate[pl].length) continue;
            mark.fill(0); for (const c of byPlate[pl]) mark[c] = 1;
            const comps = cellComponents(mesh, byPlate[pl], mark);
            if (comps.length < 2) continue;
            const anchor = anchorOf(pl);
            for (const comp of comps) {
                if (comp.includes(anchor)) continue;
                const border = new Map();
                for (const c of comp) for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const q = plateOf[adjList[k]]; if (q !== pl) border.set(q, (border.get(q) ?? 0) + 1); }
                let best = -1, bn = -1;
                for (const [q, v] of border) if (v > bn || (v === bn && q < best)) { best = q; bn = v; }
                if (best < 0) continue;
                for (const c of comp) { plateOf[c] = best; moved++; }
            }
        }
        if (!moved) break;
    }

    // ── an ocean plate squeezed to a speck by its neighbours joins the one it borders most; the rest renumbered ──
    {
        const count = new Int32Array(NP); for (let c = 0; c < n; c++) count[plateOf[c]]++;
        const remap = new Int16Array(NP).fill(-1);
        let next = U;
        for (let pl = 0; pl < NP; pl++) remap[pl] = pl < U ? pl : (count[pl] >= cfg.minPlateShare * n ? next++ : -1);
        for (let pl = U; pl < NP; pl++) {
            if (remap[pl] >= 0) continue;
            const border = new Map();
            for (let c = 0; c < n; c++) if (plateOf[c] === pl) for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const q = plateOf[adjList[k]]; if (q !== pl && remap[q] >= 0) border.set(q, (border.get(q) ?? 0) + 1); }
            let best = 0, bn = -1;
            for (const [q, v] of border) if (v > bn || (v === bn && q < best)) { best = q; bn = v; }
            remap[pl] = remap[best];
        }
        for (let c = 0; c < n; c++) plateOf[c] = remap[plateOf[c]];
        const kept = []; for (let pl = U; pl < NP; pl++) if (count[pl] >= cfg.minPlateShare * n) kept.push(oceanSeeds[pl - U]);
        oceanSeeds.length = 0; oceanSeeds.push(...kept);
    }
    const NPk = U + oceanSeeds.length;

    // ── each plate's motion ──
    const plates = [];
    const plateCells = Array.from({ length: NPk }, () => []);
    for (let c = 0; c < n; c++) plateCells[plateOf[c]].push(c);
    for (let pl = 0; pl < NPk; pl++) {
        const pc = plateCells[pl];
        let landCells = 0, s0 = 0, s1 = 0, s2 = 0;
        for (const c of pc) { landCells += cellLand[c]; s0 += xyz[3 * c]; s1 += xyz[3 * c + 1]; s2 += xyz[3 * c + 2]; }
        plates.push({
            index: pl, continental: pl < U, continent: pl < U ? units[pl].continent : -1,
            cellCount: pc.length, share: pc.length / n, landShare: pc.length ? landCells / pc.length : 0,
            centroid: unit([s0, s1, s2]),
            dir: unit(pl < U ? units[pl].euler : fitEuler(pc, xyz, velOf)),
        });
    }
    // slab pull: an ocean plate is drawn toward the continent plates it borders (it dives under them)
    for (const pl of plates) {
        if (pl.continental) continue;
        let t = [0, 0, 0], rim = 0, rimCont = 0;
        for (const c of plateCells[pl.index]) {
            const pc = at(xyz, c);
            for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
                const nb = adjList[k], q = plateOf[nb];
                if (q === pl.index) continue;
                rim++;
                if (!plates[q].continental) continue;
                rimCont++;
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
    const srng = makeRng(seed ^ 0x5bed);
    for (const pl of plates) {
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

    return { M: NPk, units: U, continents, cellPlate: plateOf, plates, graph: G, land, cellLand, oceanSeeds };
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
 * the boundary (cfg.smoothKm), and by the crust on each side as edited (`landNow`, per cell).
 * @returns {{count:number, mid:Float32Array, a:Int16Array, b:Int16Array, kind:Uint8Array, openCmYr:Float32Array,
 *   slipCmYr:Float32Array, over:Int8Array, landA:Uint8Array, landB:Uint8Array, cellA:Int32Array, cellB:Int32Array}}
 *   over: which side rides over a trench (0 = a, 1 = b, −1 none)
 */
export function classifyBoundaries(L, W, landNow, cfg = PRESENT) {
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
            E.push({ c, nb, A, B, m, open, slip, dive: towardA >= towardB ? 0 : 1, landA: landNow[c], landB: landNow[nb] });
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
            // land never dives: the ocean side goes down; ocean against ocean, the side moving harder toward the other
            over = e.landA ? 0 : e.landB ? 1 : (e.dive === 0 ? 1 : 0);
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
