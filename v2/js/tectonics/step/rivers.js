// The rivers of the history (Phase 8b-2; developer: "the important part is to indicate a history of rivers in the
// terrain" — "'grand canyon' type rivers that cut deep into the rock"). Every riverEveryMyr the land is drained on the
// sim mesh: a priority flood from the sea over the land's evolved height LESS what rivers have already cut there, each
// cell draining its steepest way down, drainage in km² weighted by the rain of the latitude at the time. Each river
// then cuts down by the stream power law, E = k A^m S, never below the reach it drains into, toward a depth that is a
// share of the land's relief growing smoothly with the river, A / (A + riverHalfKm2) — a stream notches its valley,
// a great river cuts most of the way through the range it crosses (the relief is what belts raised above the land's
// base — belts, the start world's swells, flood basalts; the rest of the wearing-down is the evolving heights' own), less where the belt is still rising (it keeps pace
// with its rivers: they shape it rather than trench it) — plus, even on flat land, a valley of its own up to
// riverPlainKm deep (a great river's floodplain below its bluffs): so rivers keep their ways on the plains too.
// The cut is a record of the crust (crust.riverIncKm), carried with its plate and worn away like the rest of its relief
// (step/heights.js). Because the rivers are routed over the land less its cuts, a cut course stays the lowest way and
// its river keeps it: when land rises under a river that keeps up — its slope steepens, so it cuts faster — the record
// deepens into a gorge through the rising ground (an antecedent river: the Indus and the Brahmaputra through the
// Himalaya, the Colorado through its plateau); a river too small to keep up is turned aside. The terrain draws the
// record (terrain/carve.js: rivers follow the old courses, their beds at least as deep as the history cut them).
// Records only: the history never reads them. world.riverKm2 keeps the drainage last computed, per world cell.

import { CrustType, CrustFlag, VolcanicType } from '../model/crust.js';
import { MinHeap } from '../../core/min-heap.js';
import { heightsOf } from './heights.js';
import { rainAtLatitude } from '../../terrain/terrain-config.js';

const R = 6371;

/** Drain the land and let the rivers cut, every riverEveryMyr. @returns {number} 0 (it never changes crust) */
export function evolveRivers(world, dt) {
    const H = heightsOf(world.config);
    world.riverClock = (world.riverClock ?? 0) + dt;
    if (world.riverClock < H.riverEveryMyr - 1e-9) return 0;
    const span = world.riverClock;
    world.riverClock = 0;
    const { mesh, plates, owner, ownerCell, time } = world, { adjOffset, adjList, xyz, numCells: n } = mesh;
    const { dist } = meshInfo(mesh), cellArea = 4 * Math.PI * R * R / n;
    const s = scratchFor(n);
    const { land, base, lift, height, fill, rank, order, recv, recvKm, area, cutNow, hold } = s;
    world.riverKm2 ??= new Float32Array(n);
    // ── the land: its evolved height (as records.js draws the platform: crust kind, the root's isostatic lift, the
    // uplift) less what rivers have cut; `base` is what it stands on without the relief belts gave it ──
    for (let w = 0; w < n; w++) {
        const o = owner[w];
        land[w] = 0;
        if (o < 0) continue;
        const crust = plates[o].crust, c = ownerCell[w];
        if (crust.type[c] === CrustType.OCEAN) continue;
        land[w] = 1;
        landHeightParts(crust, c, H, time, parts);
        const b = parts[0], l = parts[1];
        base[w] = b; lift[w] = l; cutNow[w] = Math.min(crust.riverIncKm[c], l + H.riverPlainKm);
        // (a belt still rising keeps pace with its rivers: they cut less there — shaping it, not trenching it)
        hold[w] = 1 - H.riverActiveHold * (crust.oroType[c] ? Math.exp(-Math.max(0, time - crust.oroLast[c]) / H.carveActiveMyr) : 0);
        height[w] = b + l - cutNow[w];
    }
    // ── the priority flood from the sea, lowest spill first; each cell's receiver its steepest way down ──
    const heap = s.heap;
    heap.size = 0;
    rank.fill(-1);
    let count = 0;
    for (let w = 0; w < n; w++) {
        if (land[w]) continue;
        rank[w] = -2;
        for (let k = adjOffset[w]; k < adjOffset[w + 1]; k++) { const nb = adjList[k]; if (land[nb]) heap.push(Math.max(0, height[nb]), nb); }
    }
    for (let w = 0; w < n; w++) fill[w] = Infinity;
    while (heap.size) {
        const c = heap.pop(), level = heap.lastKey;
        if (rank[c] !== -1) continue;
        rank[c] = count; order[count++] = c; fill[c] = level;
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
            const nb = adjList[k];
            if (rank[nb] === -1 && land[nb]) heap.push(Math.max(level, height[nb]), nb);
        }
    }
    for (let i = 0; i < count; i++) {
        const c = order[i];
        let pick = -1, km = 0, steepest = -1;
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
            const nb = adjList[k];
            if (!(rank[nb] === -2 || (rank[nb] >= 0 && rank[nb] < i))) continue;
            const s2 = ((rank[nb] === -2 ? fill[c] : fill[c] - fill[nb]) + 1e-9) / dist[k];
            if (s2 > steepest) { steepest = s2; pick = nb; km = dist[k]; }
        }
        recv[c] = rank[pick] === -2 ? -1 : pick;
        recvKm[c] = km;
    }
    // ── drainage (km², rain-weighted), leaves to the sea ──
    area.fill(0);
    for (let i = count - 1; i >= 0; i--) {
        const c = order[i];
        area[c] += cellArea * rainAtLatitude(Math.asin(Math.max(-1, Math.min(1, xyz[3 * c + 2]))) * 180 / Math.PI, H) / H.rainRefMm;
        if (recv[c] >= 0) area[recv[c]] += area[c];
    }
    for (let w = 0; w < n; w++) world.riverKm2[w] = land[w] ? area[w] : 0;
    // ── the cut: E = k A^m S over the span, downstream first; never below the reach below, and only toward the river's
    // share of the relief ──
    for (let i = 0; i < count; i++) {
        const c = order[i], r = recv[c], below = r >= 0 ? height[r] : 0;
        const drop = height[c] - below, want = hold[c] * (lift[c] + H.riverPlainKm) * area[c] / (area[c] + H.riverHalfKm2) - cutNow[c];
        if (drop <= 0 || want <= 0) continue;
        const cut = Math.min(drop, want, H.riverCutK * area[c] ** H.carveM * (drop / Math.max(1, recvKm[c])) * span);
        if (cut <= 0) continue;
        height[c] -= cut;                                     // (the cells above now drain to the cut reach)
        const crust = plates[owner[c]].crust, cc = ownerCell[c];
        crust.riverIncKm[cc] += cut;
    }
    return 0;
}

const parts = [0, 0];
/**
 * The land's evolved height at raster cell `c` (land crust only), as records.js draws the platform, in two parts:
 * out[0] what it stands on by its kind of crust, out[1] the relief on that — the root's isostatic lift, the uplift, the
 * start world's swells, a flood basalt's pile. Their sum is its height above the sea before rivers cut it (step/geology.js
 * floods the lowest of it at a high stand).
 */
export function landHeightParts(crust, c, H, time, out) {
    const type = crust.type[c];
    let b;
    if (type === CrustType.CRATON) b = H.cratonKm;
    else if (type === CrustType.ARC) b = (crust.flags[c] & CrustFlag.MARGIN_ISLE) ? H.foreArcIsleKm
        : H.arcYoungKm + (H.arcMatureKm - H.arcYoungKm) * Math.min(1, Math.max(0, (time - crust.formedAt[c]) / H.arcMatureMyr)) ** 0.7;
    else b = H.continentKm;
    out[0] = b;
    out[1] = Math.max(0, H.isoMaxKm * (1 - Math.exp(-crust.rootKm[c] * (type === CrustType.ARC ? 0.25 : 1) / H.isoScaleKm)) + crust.upliftKm[c] + crust.baseKm[c]
        + (crust.volcType[c] === VolcanicType.LIP ? Math.max(0, H.lipLandKm * Math.min(H.lipMaxKm, crust.volcKm[c]) - crust.volcWornKm[c]) : 0));
    return out;
}

// per mesh: the distance (km) along each adjacency entry
const infos = new WeakMap();
function meshInfo(mesh) {
    let I = infos.get(mesh);
    if (I) return I;
    const { xyz, adjOffset, adjList, numCells } = mesh, dist = new Float32Array(adjList.length);
    for (let c = 0; c < numCells; c++) for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
        const nb = adjList[k];
        dist[k] = 2 * R * Math.asin(Math.min(1, 0.5 * Math.hypot(xyz[3 * nb] - xyz[3 * c], xyz[3 * nb + 1] - xyz[3 * c + 1], xyz[3 * nb + 2] - xyz[3 * c + 2])));
    }
    I = { dist };
    infos.set(mesh, I);
    return I;
}

let scratch = null;
function scratchFor(n) {
    if (scratch?.n === n) return scratch;
    scratch = { n, land: new Uint8Array(n), base: new Float32Array(n), lift: new Float32Array(n), cutNow: new Float32Array(n), hold: new Float32Array(n), height: new Float32Array(n), fill: new Float32Array(n), rank: new Int32Array(n),
        order: new Int32Array(n), recv: new Int32Array(n), recvKm: new Float32Array(n), area: new Float32Array(n), heap: new MinHeap(1 << 14) };
    return scratch;
}
