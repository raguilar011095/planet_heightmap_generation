// R1 — rivers and lakes of a finished moment, by the climate (plans/V2_FINISH_PLAN.md). On the finished surface:
//   · the flow network: a priority flood from the sea — every land cell drains to the sea or into a hollow;
//   · lakes by water balance: a hollow fills if its inflow outweighs what evaporates from it full — a fresh lake spilling
//     on down the river below; else it shrinks to where the two balance — a salt lake (terminal); where next to nothing
//     flows in, a dry salt pan. Tiny or very shallow hollows are passed through (a lake smaller than the map can show);
//   · discharge (m³/s): the runoff (rain less evaporation) of everything upstream, less what a river loses in dry country
//     — seepage and evaporation along its bed, ∝ its width (∝ √discharge) and the aridity: big rivers from wet mountains
//     cross deserts, small ones die out;
//   · each river's year: its twelve monthly flows — each month's runoff (the climate's rain, snow kept until it melts,
//     part of it seeping to groundwater that feeds the river all year) routed down the same network, big lakes evening
//     out what they pass on — and its regime: permanent and steady, permanent with a flood season (the Nile's), seasonal
//     (dry some months), dry most of the year; and whether it is fed from afar (permanent across dry country);
//   · the rivers as polylines: every reach carrying at least F.riverMinM3s, from its source or confluence to the next
//     confluence, the sea, a lake or its end — each point with its discharge and seasonality.
// In m³/s, km, mm: the same rivers at every terrain detail, more of their bends on the finer.

import { MinHeap } from '../core/min-heap.js';

const SEC_PER_YEAR = 3.156e7, R = 6371;
/** The distance (km) between two neighbouring cells (the chord: the same to well under a metre at a cell's size). */
const edgeKmOf = (xyz, a, b) => R * Math.hypot(xyz[3 * a] - xyz[3 * b], xyz[3 * a + 1] - xyz[3 * b + 1], xyz[3 * a + 2] - xyz[3 * b + 2]);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Lake kinds (per cell, and per pixel of the finished picture). */
export const Water = Object.freeze({ NONE: 0, FRESH: 1, SALT: 2, PAN: 3 });

/**
 * Inland seas the open ocean all but reaches: a body below sea level behind a low, short barrier — a strait narrower than
 * the mesh's cells, low land the carve keeps at its floor — is opened into the ocean, the barrier cut to F.straitDepthKm
 * below sea level along the way its water would spill (a priority flood from the sea). By a smooth weight on the
 * barrier's height (its sill, m) and its length over dry land (km): the same at every detail. A body left closed is the
 * hydrology's: a remnant of the sea in a basin (hydrology: `sea` hollows).
 * @returns {{opened: number, cut: number}} bodies opened, cells cut
 */
export function openStraits(mesh, z, ocean, F) {
    const { adjOffset, adjList, numCells: n, xyz } = mesh;
    const { fill, parent, rank } = spillFlood(mesh, z, ocean);
    // each body below sea level the ocean does not reach: its way out from the cell the flood reached first
    const seen = new Uint8Array(n);
    let opened = 0, cut = 0;
    for (let s = 0; s < n; s++) {
        if (seen[s] || ocean[s] || !(z[s] < 0)) continue;
        const cells = [s];
        seen[s] = 1;
        let first = s;
        for (let i = 0; i < cells.length; i++) {
            const c = cells[i];
            if (rank[c] >= 0 && (rank[first] < 0 || rank[c] < rank[first])) first = c;
            for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const nb = adjList[k]; if (!seen[nb] && !ocean[nb] && z[nb] < 0) { seen[nb] = 1; cells.push(nb); } }
        }
        if (rank[first] < 0) continue;
        let barrierKm = 0, sillKm = 0;
        const path = [];
        for (let c = first, guard = 0; c >= 0 && rank[c] !== -2 && guard < 1e6; guard++) {
            path.push(c);
            const p = parent[c];
            if (z[c] >= 0 && p >= 0) barrierKm += R * Math.hypot(xyz[3 * p] - xyz[3 * c], xyz[3 * p + 1] - xyz[3 * c + 1], xyz[3 * p + 2] - xyz[3 * c + 2]);
            if (z[c] > sillKm) sillKm = z[c];
            c = p;
        }
        const open = (1 - smooth(F.straitSillM[0], F.straitSillM[1], 1000 * sillKm)) * (1 - smooth(F.straitKm[0], F.straitKm[1], barrierKm));
        if (open < 0.5) continue;
        for (const c of path) if (z[c] > -F.straitDepthKm) { z[c] = -F.straitDepthKm; cut++; }
        opened++;
    }
    return { opened, cut };
}

/** The way water would spill to the sea from every cell (a priority flood from the ocean, water below sea level standing
 *  at it): each cell's spill level (km, ≥ 0), the cell it was reached from, and its order (-2: the ocean). */
function spillFlood(mesh, z, ocean) {
    const { adjOffset, adjList, numCells: n } = mesh;
    const fill = new Float32Array(n), parent = new Int32Array(n).fill(-1), rank = new Int32Array(n).fill(-1), heap = new MinHeap(1 << 16);
    let count = 0;
    for (let c = 0; c < n; c++) {
        if (!ocean[c]) continue;
        rank[c] = -2;
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const nb = adjList[k]; if (!ocean[nb] && parent[nb] === -1) { parent[nb] = c; fill[nb] = Math.max(0, z[nb]); heap.push(fill[nb], nb); } }
    }
    while (heap.size) {
        const c = heap.pop();
        if (rank[c] !== -1) continue;
        rank[c] = count++;
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
            const nb = adjList[k];
            if (rank[nb] !== -1 || ocean[nb]) continue;
            const level = Math.max(fill[c], Math.max(0, z[nb]));
            if (parent[nb] === -1 || level < fill[nb]) { parent[nb] = c; fill[nb] = level; heap.push(level, nb); }
        }
    }
    return { fill, parent, rank };
}

/**
 * A remnant of the sea in a basin — a body below sea level the ocean does not reach — has been filling with sediment as
 * long as it has been cut off: its basin's floor levelled toward at most about F.seaFillKm below its rim (depth d →
 * seaFillKm × tanh(d / seaFillKm)) — the Caspian's and the Black Sea's depths rather than an ocean's. Its water is then
 * the hydrology's (sea hollows: a lake to its rim, a salt sea, a pan).
 * @returns {Uint8Array} 1 on the basins' cells (below their rim)
 */
export function fillSeaBasins(mesh, z, ocean, F) {
    const { adjOffset, adjList, numCells: n } = mesh, EPS = 1e-4, cellKm2 = 4 * Math.PI * R * R / n;
    const { fill } = spillFlood(mesh, z, ocean), basin = new Uint8Array(n), seen = new Uint8Array(n);
    for (let s = 0; s < n; s++) {
        if (seen[s] || basin[s] || ocean[s] || !(z[s] < 0)) continue;
        // (the body below sea level: big and deep enough to be a remnant of the sea — a smooth weight in km² and km)
        const below = [s];
        seen[s] = 1;
        let deepest = z[s];
        for (let i = 0; i < below.length; i++) for (let k = adjOffset[below[i]]; k < adjOffset[below[i] + 1]; k++) {
            const nb = adjList[k];
            if (!seen[nb] && !ocean[nb] && z[nb] < 0) { seen[nb] = 1; below.push(nb); if (z[nb] < deepest) deepest = z[nb]; }
        }
        const sea = smooth(F.seaBasinKm2[0], F.seaBasinKm2[1], below.length * cellKm2) * smooth(F.seaBasinDeepKm[0], F.seaBasinDeepKm[1], -deepest);
        if (sea < 0.5) continue;
        const L = fill[s], cells = [s];
        basin[s] = 1;
        for (let i = 0; i < cells.length; i++) for (let k = adjOffset[cells[i]]; k < adjOffset[cells[i] + 1]; k++) {
            const nb = adjList[k];
            if (!basin[nb] && !ocean[nb] && fill[nb] > z[nb] + EPS && Math.abs(fill[nb] - L) < 1e-6) { basin[nb] = 1; cells.push(nb); }
        }
        for (const c of cells) { const d = L - z[c]; if (d > 0) z[c] = Math.max(z[c], L - F.seaFillKm * Math.tanh(d / F.seaFillKm)); }
    }
    return basin;
}

/**
 * @param {{mesh, z: Float32Array, ocean: Uint8Array, runoff: Float32Array (mm/yr), pet: Float32Array (mm/yr),
 *          rain: Float32Array (mm/yr), wetMonths: Float32Array (0–12), ice: Uint8Array|null (1: an ice cap now), glaciated: Uint8Array|null (1: under the ice age's ice), lat, lon}} ctx
 * @returns {{lake: Uint8Array (Water per cell), lakeLevel: Float32Array (km; NaN if none), q: Float32Array (m³/s),
 *            rivers: {start: Int32Array, lat: Float32Array, lon: Float32Array, q: Float32Array, season: Float32Array},
 *            stats: Object}}
 */
export function hydrology(ctx, F) {
    const { mesh, z, ocean, runoff, pet, rain, wetMonths } = ctx, n = mesh.numCells, { adjOffset, adjList, xyz } = mesh;
    const cellKm2 = 4 * Math.PI * R * R / n, EPS = 1e-4;
    // ── the priority flood from the sea: each land cell's spill level (fill), its order, the way it was reached ──
    const fill = new Float32Array(n), rank = new Int32Array(n).fill(-1), parent = new Int32Array(n).fill(-1), order = new Int32Array(n);
    const heap = new MinHeap(1 << 16);
    let count = 0;
    for (let c = 0; c < n; c++) {
        if (!ocean[c]) continue;
        rank[c] = -2;
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const nb = adjList[k]; if (!ocean[nb] && parent[nb] === -1) { parent[nb] = c; fill[nb] = Math.max(0, z[nb]); heap.push(fill[nb], nb); } }
    }
    while (heap.size) {
        const c = heap.pop();
        if (rank[c] !== -1) continue;
        rank[c] = count; order[count++] = c;
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
            const nb = adjList[k];
            if (rank[nb] !== -1 || ocean[nb]) continue;
            const level = Math.max(fill[c], z[nb]);
            if (parent[nb] === -1 || level < fill[nb]) { parent[nb] = c; fill[nb] = level; heap.push(level, nb); }
        }
    }
    // ── receivers: the steepest way down the filled surface to a cell reached before (or the sea); on a flat, the flood's way ──
    const recv = new Int32Array(n).fill(-1), stepKm = new Float32Array(n);
    for (let i = 0; i < count; i++) {
        const c = order[i];
        let pick = -1, steepest = 0;
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
            const nb = adjList[k];
            if (!(rank[nb] === -2 || (rank[nb] >= 0 && rank[nb] < i))) continue;
            const fn = rank[nb] === -2 ? Math.min(0, z[nb]) : fill[nb], s = fill[c] - fn;
            if (s > steepest) { steepest = s; pick = nb; }
        }
        if (pick < 0) pick = parent[c];
        recv[c] = pick;
        const dx = xyz[3 * pick] - xyz[3 * c], dy = xyz[3 * pick + 1] - xyz[3 * c + 1], dz = xyz[3 * pick + 2] - xyz[3 * c + 2];
        stepKm[c] = R * Math.hypot(dx, dy, dz);
    }
    // (inside a hollow: a priority flood over its cells from its outlet, on the ground as it is — `ground`, its water at
    // its level: where each cell's water would stand (innerFill). Scratch arrays, stamped)
    const innerFill = new Float32Array(n), innerStamp = new Int32Array(n), innerHeap = new MinHeap(1 << 12);
    let innerId = 0;
    const innerFlood = (id, outlet, ground) => {
        innerId++;
        innerFill[outlet] = ground(outlet); innerStamp[outlet] = innerId; innerHeap.push(innerFill[outlet], outlet);
        while (innerHeap.size) {
            const x = innerHeap.pop();
            for (let k = adjOffset[x]; k < adjOffset[x + 1]; k++) {
                const nb = adjList[k];
                if (hollow[nb] !== id || innerStamp[nb] === innerId) continue;
                innerStamp[nb] = innerId; innerFill[nb] = Math.max(innerFill[x], ground(nb)); innerHeap.push(innerFill[nb], nb);
            }
        }
    };
    const groundZ = x => z[x];
    // (a gorge's way through its hollow, from cell x to the outlet: its river's own course — down its receivers, the way the
    // flood found across the hollow, every bend of it — unless a shortcut is enough less work. The work: the rock cut down to
    // `level` and a little for the length (gorgeLengthKm); along the river's own course only riverDirectness of it — so a
    // bend is cut through only where the course round it is over 1 / riverDirectness times the shortcut's work (0.5: a
    // detour twice as long). Developer: rivers "that go back and forth", but "some windyness is good" — 0 keeps every
    // course as it was, 1 takes the way of least work. Dijkstra over the hollow's cells)
    const pathCost = new Float64Array(n), pathFrom = new Int32Array(n), pathStamp = new Int32Array(n), pathDone = new Int32Array(n), onCourse = new Int32Array(n);
    const pathHeap = new MinHeap(1 << 12), pathCells = [], keepCourse = Math.min(1, Math.max(0, F.riverDirectness ?? 0.1));
    let pathId = 0;
    // (exitAt: a cell the gorge may end at instead — from there its water already runs out without rising above `level`)
    const gorgeWay = (x, own, out, level, ground, exitAt = null) => {
        pathId++;
        for (let y = x, g = 0; y >= 0 && hollow[y] === own && g < 1e6; y = recv[y], g++) { onCourse[y] = pathId; if (y === out) break; }
        pathCost[x] = 0; pathFrom[x] = -1; pathStamp[x] = pathId; pathHeap.push(0, x);
        let end = -1;
        while (pathHeap.size) {
            const a = pathHeap.pop();
            if (pathDone[a] === pathId) continue;
            pathDone[a] = pathId;
            if (a === out || (exitAt && exitAt(a, level))) { end = a; break; }
            for (let k = adjOffset[a]; k < adjOffset[a + 1]; k++) {
                const nb = adjList[k];
                if (hollow[nb] !== own || pathDone[nb] === pathId) continue;
                const c = pathCost[a] + edgeKmOf(xyz, a, nb) * (F.gorgeLengthKm + Math.max(0, ground(nb) - level)) * (onCourse[nb] === pathId && onCourse[a] === pathId ? keepCourse : 1);
                if (pathStamp[nb] !== pathId || c < pathCost[nb]) { pathStamp[nb] = pathId; pathCost[nb] = c; pathFrom[nb] = a; pathHeap.push(c, nb); }
            }
        }
        pathHeap.size = 0;
        pathCells.length = 0;
        if (end < 0) return pathCells;
        for (let y = end; y >= 0; y = pathFrom[y]) pathCells.push(y);
        return pathCells.reverse();                                 // (x … out, or the cell it could end at)
    };
    // (a gorge: from cell x the way its water would find out — through its hollow by gorgeWay to the hollow's outlet, then
    // down the receivers — the ground cut down to `level` until it is lower: rivers carve through, the land is never raised)
    let cutCells = 0, cutMaxKm = 0, cutKm3 = 0;
    // (and where each gorge ran, at what level: a lake further down that a gorge cut through below its rim drains by it)
    const cutAt = new Float32Array(n).fill(Infinity);
    const lower = (y, level) => { if (z[y] > level) { const d = z[y] - level; cutCells++; cutKm3 += d * cellKm2; if (d > cutMaxKm) cutMaxKm = d; z[y] = level; if (level < cutAt[y]) cutAt[y] = level; } };
    const cut = (x, level, ground = groundZ, exitAt = null) => {
        // (below sea level only to open a small trapped sea into the ocean nearby — its cut through dry land at most
        // seaCutKm long; further, the sea would wind inland down the gorge: then the gorge stops at sea level)
        if (level < 0) {
            let km = 0, open = false;
            for (let y = x, guard = 0; y >= 0 && guard < 100000; guard++) {
                if (z[y] > 0) km += stepKm[y];
                const r = recv[y];
                if (r < 0 || rank[r] < 0) { open = true; break; }
                if (z[r] < level || km > F.seaCutKm) break;
                y = r;
            }
            if (!(open && km <= F.seaCutKm)) level = Math.max(level, F.seaCutFloorKm);
        }
        const own = hollow[x];
        if (own >= 0 && x !== hollows[own].outlet && keepCourse > 0) {
            const out = hollows[own].outlet, way = gorgeWay(x, own, out, level, ground, exitAt);
            if (way.length) { for (const y of way) lower(y, level); x = way[way.length - 1]; }
            if (x !== out) return level;                            // (it ended where its water runs out anyway)
        }
        for (let guard = 0; x >= 0 && rank[x] >= 0 && guard < 100000; guard++) {
            lower(x, level);
            const r = recv[x];
            if (r < 0 || rank[r] < 0 || (z[r] < level && !(own >= 0 && hollow[r] === own))) break;
            x = r;
        }
        return level;
    };
    // ── hollows: connected cells under their spill level, one spill level each (one lake, if it were full) ──
    const hollow = new Int32Array(n).fill(-1), hollows = [], laterCuts = [];
    for (let i = 0; i < count; i++) {
        const s = order[i];
        if (hollow[s] >= 0 || !(fill[s] > z[s] + EPS)) continue;
        const id = hollows.length, cells = [s], L = fill[s];
        hollow[s] = id;
        let deepest = z[s], deepCell = s;
        for (let q = 0; q < cells.length; q++) for (let k = adjOffset[cells[q]]; k < adjOffset[cells[q] + 1]; k++) {
            const nb = adjList[k];
            if (hollow[nb] < 0 && rank[nb] >= 0 && fill[nb] > z[nb] + EPS && Math.abs(fill[nb] - L) < 1e-6) { hollow[nb] = id; cells.push(nb); if (z[nb] < deepest) { deepest = z[nb]; deepCell = nb; } }
        }
        // (the outlet: the hollow's cell the flood reached first — the spill point's side)
        let outlet = cells[0];
        for (const c of cells) if (rank[c] < rank[outlet]) outlet = c;
        // (a lake needs a hollow the map can show, with a origin: scoured by the ice age (lake districts), or a hollow of the
        // tectonic surface itself (rifts, forelands, closed basins). The finishing's own hollows — a fan or loess damming a
        // valley, a dissected floor — the rivers cut through: a channel from the hollow's floor out through its rim
        // (developer: rivers "shouldn't 'elevate' a ton of the land, it should just carve through" — they were filled))
        let glacial = 0, tect = 0;
        for (const c of cells) { if (ctx.glaciated?.[c]) glacial++; if (ctx.tectonic?.[c]) tect++; }
        // (a hollow whose floor lies below sea level is a remnant of the sea — old, whatever else: it holds water as its
        // water balance allows, and is never cut through to its floor, which no gorge could drain)
        const sea = !!ctx.seaBasin && cells.some(c => ctx.seaBasin[c]);
        const origin = sea || glacial >= 0.5 * cells.length || tect >= F.lakeTectonicShare * cells.length || !ctx.tectonic;
        const lake = origin && cells.length * cellKm2 >= F.lakeMinKm2 && cells.length >= 2 && (L - deepest) * 1000 >= F.lakeMinDepthM;
        if (!origin && ctx.fillHollows) laterCuts.push(id);
        // (old: a hollow of the tectonic surface, glaciated or not; the ice age's own hollows are young)
        hollows.push({ cells, level: L, outlet, deepCell, floor: deepest, lake, inflow: 0, seasonW: 0, area: 0, glacial: glacial >= 0.5 * cells.length, old: sea || (!!ctx.tectonic && tect >= F.lakeTectonicShare * cells.length), sea });
    }
    // ── discharge, upstream first (each cell comes after the cell it drains into in the flood's order): each cell's own
    // runoff; a lake gathers its cells' and passes on only what it does not evaporate, at its outlet; a river loses water
    // along its bed in dry country ──
    // (with the water, the area each place drains — km², whatever the rain: the satellite view's flow texture)
    const area = new Float32Array(n);
    const q = new Float32Array(n), qw = new Float32Array(n), lakeKind = new Uint8Array(n), lakeLevel = new Float32Array(n).fill(NaN), seen = new Int32Array(n);
    const own = c => Math.max(0, runoff[c]) * cellKm2 * 1e3 / SEC_PER_YEAR;         // (mm × km² → m³/s)
    // (a hollow that drains whole — a land hollow left without water, the lowland round a trapped sea that spills — has no
    // closed basin left in it (developer: no closed basins, no holes): every pocket in it, a sub-basin behind its own sill
    // that the gorge from the hollow's floor does not reach, gets its own gorge out from its lowest point, down the way its
    // water would spill; until none is left — a pocket within a pocket next. Its water counts at its level. Scratch
    // arrays, stamped)
    const pocketSeen = new Int32Array(n);
    const ground = x => (lakeKind[x] === Water.FRESH || lakeKind[x] === Water.SALT ? Math.max(z[x], lakeLevel[x]) : z[x]);
    const drainsAt = (y, level) => innerStamp[y] === innerId && innerFill[y] <= level;
    const cutPockets = (h, id, outlet) => {
        for (let round = 0; round < 8; round++) {
            innerFlood(id, outlet, ground);
            let any = false;
            for (const s of h.cells) {
                if (innerStamp[s] !== innerId || pocketSeen[s] === innerId || !(innerFill[s] > ground(s) + EPS)) continue;
                // (the pocket: connected cells under the same spill level; cut from its lowest)
                const L = innerFill[s], cells = [s];
                pocketSeen[s] = innerId;
                let low = s;
                for (let i = 0; i < cells.length; i++) for (let k = adjOffset[cells[i]]; k < adjOffset[cells[i] + 1]; k++) {
                    const nb = adjList[k];
                    if (hollow[nb] === id && innerStamp[nb] === innerId && pocketSeen[nb] !== innerId && innerFill[nb] > ground(nb) + EPS && Math.abs(innerFill[nb] - L) < 1e-6) {
                        pocketSeen[nb] = innerId; cells.push(nb); if (z[nb] < z[low]) low = nb;
                    }
                }
                cut(low, z[low], ground, drainsAt);
                any = true;
            }
            if (!any) break;
        }
    };
    // (the finishing's hollows cut through once every hollow is found — a cell cut below the flood's surface mid-search
    // read as a hollow of its own: spurious lakes the size of plains — each drained whole, its pockets too)
    for (const id of laterCuts) { const h = hollows[id]; cut(h.deepCell, h.floor); cutPockets(h, id, h.outlet); }
    const lakeDeficit = c => Math.max(0, F.lakeEvapShare * pet[c] - Math.max(0, rain[c]));     // (mm/yr off open water)
    let toSea = 0, toBasins = 0, lost = 0, total = 0;
    for (let i = count - 1; i >= 0; i--) {
        const c = order[i], h = hollow[c] >= 0 ? hollows[hollow[c]] : null;
        const r0 = own(c);
        total += r0;
        q[c] += r0; qw[c] += r0 * (wetMonths[c] ?? 12); area[c] += cellKm2;
        if (h && h.lake) {
            h.inflow += q[c]; h.seasonW += qw[c]; h.area += area[c];
            if (c !== h.outlet) continue;
            // what evaporates from the lake full
            let full = 0;
            for (const x of h.cells) full += lakeDeficit(x) * cellKm2 * 1e3 / SEC_PER_YEAR;
            // Every river ends at the sea (developer: "every river needs to end at ocean not lake"): a lake stays only where
            // its river fills it and it is big for its river — at least lakeKeepKm2 × √(inflow / 1000 m³/s), the ice age's
            // lake districts half that — and passes on all that flows in. Else it is cut through to its floor and the river
            // runs on in its gorge: a big river's pond ("a lot of the time large rivers are ending up in tiny lakes"), and a
            // basin its river cannot fill — no closed basins, no salt lakes or pans for a river to end in
            const areaKm2 = h.cells.length * cellKm2, young = h.glacial && !h.old;
            // (a gorge cut from a basin upstream already runs through it below its rim: its water has a lower way out and
            // drains by it — no lake strung along the gorge)
            let crossed = Infinity;
            if (!h.sea) for (const x of h.cells) if (cutAt[x] < crossed) crossed = cutAt[x];
            const drained = crossed < h.level - 0.01;
            const keepKm2 = F.lakeKeepKm2 * Math.sqrt(Math.max(1, h.inflow) / 1000) * (young ? F.glacialKeepShare : 1);
            let outflow = h.inflow, level = h.level, kind = Water.FRESH, from = c;
            // A remnant of the sea (developer, 2026-10-15: inland seas "COMPLETELY dried out … leaving holes in the ground")
            // is its hole — the basin's cells below sea level — and its water stays in it (developer: the lakes over trapped
            // seas were "just too enormous": filled to the basin's sill they drowned the whole lowland round the hole)
            let hole = null, fullHole = 0;
            if (h.sea) {
                hole = h.cells.filter(x => z[x] < 0);
                for (const x of hole) fullHole += lakeDeficit(x) * cellKm2 * 1e3 / SEC_PER_YEAR;
            }
            if (h.sea && h.inflow < fullHole) {
                // short of filling it, it shrinks to where what flows in balances what evaporates — the lowest cells, as
                // much area as its inflow keeps wet. A terminal salt sea where that is big for its river, or the basin an old
                // sea floor deep enough (the Caspian, the Dead Sea — developer: "allow terminal salt seas"); else a salt pan,
                // its floor filled toward a flat (below). Its rivers end there
                const low = hole.sort((a, b) => z[a] - z[b]);
                let evap = 0, k = -1;
                for (let i = 0; i < low.length; i++) { const e = lakeDeficit(low[i]) * cellKm2 * 1e3 / SEC_PER_YEAR; if (evap + e > h.inflow) break; evap += e; k = i; }
                outflow = 0; toBasins += h.inflow; from = h.deepCell;
                if (k >= 1 && ((k + 1) * cellKm2 >= keepKm2 || smooth(F.saltSeaDeepKm[0], F.saltSeaDeepKm[1], -h.floor) >= 0.5)) { kind = Water.SALT; level = z[low[k]] + 1e-5; }
                else { kind = Water.PAN; level = h.floor; h.pan = true; }
            } else if (h.sea) {
                // full, it fills its hole to the brim and spills: its outflow has cut its way down to it (a gorge just above
                // sea level), and the lowland round it drains as land does (below)
                level = cut(h.deepCell, F.seaCutFloorKm); from = h.deepCell;
            } else if (drained || areaKm2 < keepKm2 || h.inflow < full) { cut(h.deepCell, h.floor); level = h.floor; }
            else if (F.breachKm > 0) {
                // an old basin that overflows has cut its outlet down (developer: the erosion should "break these basins
                // up"): a gorge through its rim, deeper the more spills over; the lake drains to what lies below the gorge —
                // often nothing. (The carving could not: a gorge is far narrower than a cell, so the rim cell hardly drops.)
                // The ice age's own hollows are young: cut only a share as deep (a big river breaks through its lakes; a
                // small one keeps its lake district)
                const Q = young ? F.glacialBreachQ : F.breachQ;
                const B = (young ? F.glacialBreachShare : 1) * F.breachKm * smooth(Math.log(Q[0]), Math.log(Q[1]), Math.log(Math.max(1e-9, h.inflow - full)));
                if (B > 0) {
                    let floor = Infinity;
                    for (const x of h.cells) if (z[x] < floor) floor = z[x];
                    level = cut(c, Math.max(floor, h.level - B));
                }
            }
            // the water: what is connected to the outlet below the level. Pockets below it but cut off from it (a breached
            // basin's hollows) are dry ground the rivers cross
            const id = hollow[c], water = [], seeds = [];
            // (a trapped sea full to its brim: the whole of its hole, each part of it behind a low sill too)
            if (h.sea && kind === Water.FRESH) for (const x of hole) if (z[x] < level) seeds.push(x);
            if (kind !== Water.PAN) {
                if (z[from] < level) seeds.push(from);
                else for (let k = adjOffset[from]; k < adjOffset[from + 1]; k++) { const nb = adjList[k]; if (hollow[nb] === id && z[nb] < level) seeds.push(nb); }
            }
            for (const x of seeds) if (seen[x] !== id + 1) { seen[x] = id + 1; water.push(x); }
            for (let i = 0; i < water.length; i++) for (let k = adjOffset[water[i]]; k < adjOffset[water[i] + 1]; k++) {
                const nb = adjList[k];
                if (seen[nb] !== id + 1 && hollow[nb] === id && z[nb] < level) { seen[nb] = id + 1; water.push(nb); }
            }
            // (a lake the map can show: at least lakeMinKm2 and two cells — not a blob on a river)
            if (water.length < 2 || water.length * cellKm2 < F.lakeMinKm2) water.length = 0;
            // (a river's pond — what water a partly cut basin keeps, small for its river — cut through too: the size that
            // counts is the water left, not the basin's)
            // (a remnant of the sea keeps its water whatever its size: no gorge could drain it)
            if (!h.sea && water.length && water.length * cellKm2 < keepKm2) { cut(h.deepCell, h.floor); level = h.floor; water.length = 0; }
            if (kind === Water.SALT && !water.length) { kind = Water.PAN; h.pan = true; }
            for (const x of water) { lakeKind[x] = kind; lakeLevel[x] = level; }
            if (h.sea ? kind === Water.FRESH : !water.length) cutPockets(h, id, c);
            h.kind = water.length ? kind : h.pan ? Water.PAN : Water.NONE; h.levelNow = level; h.outflow = outflow; h.fullEvap = full; h.outletIn = h.inflow;
            q[c] = outflow; qw[c] = h.seasonW; area[c] = h.area;
            if (!(outflow > 0)) continue;
        }
        // down the bed to the next cell, losing water where it is dry (width ∝ √Q, loss ∝ width × length × aridity)
        let out = q[c];
        const arid = pet[c] > 0 ? smooth(0, 1, (pet[c] - Math.max(0, rain[c])) / pet[c]) : 0;
        if (arid > 0 && out > 0) {
            const widthM = F.riverWidthPerSqrtQ * Math.sqrt(out), loss = F.bedLossMPerYear * arid * widthM * stepKm[c] * 1000 / SEC_PER_YEAR;
            const kept = Math.max(0, out - loss);
            lost += out - kept;
            qw[c] *= out > 0 ? kept / out : 0; out = kept;
        }
        q[c] = out;
        const r = recv[c];
        if (r >= 0 && rank[r] >= 0) { q[r] += out; qw[r] += qw[c]; area[r] += area[c]; }
        else toSea += out;
    }
    // (no deep dry holes, no dry land below sea level: a remnant of the sea left without water — a salt pan, the pockets a
    // breach left — is filled with its own sediment and salts toward a flat at most about panDepthKm below its rim (depth
    // d → panDepthKm × tanh(d / panDepthKm): the Qattara's scale, not a hole the size of the sea that was there — developer,
    // 2026-10-15), a pan's flat floor its pan; elsewhere, what a gorge left below sea level is filled to just above it —
    // developer, "huge holes in the ground")
    for (let c = 0; c < n; c++) {
        if (rank[c] < 0 || lakeKind[c] === Water.FRESH || lakeKind[c] === Water.SALT) continue;
        const h = hollow[c] >= 0 ? hollows[hollow[c]] : null;
        if (h && h.sea) {
            // (a pan from its hole's rim, sea level; a basin that keeps water — its dry ground above the water is its shore —
            // only where it lies below the water, cut off from it)
            const ref = h.pan ? 0 : !(h.levelNow === h.levelNow) ? h.level : h.levelNow, d = ref - z[c];
            if (d > 0) {
                z[c] = Math.max(z[c], ref - F.panDepthKm * Math.tanh(d / F.panDepthKm));
                if (h.pan && d > F.panFlatShare * F.panDepthKm) { lakeKind[c] = Water.PAN; lakeLevel[c] = Math.max(z[c], F.seaCutFloorKm) + 1e-3; }
            }
        }
        // (the shore of a salt sea may lie below sea level — the Dead Sea's, the Caspian's; elsewhere none)
        if (z[c] < 0 && !(h && h.sea && h.kind === Water.SALT)) z[c] = F.seaCutFloorKm;
    }
    // ── the rivers inside a lake's basin: its cells gathered their water straight into the lake (its balance); where the
    // water does not cover the basin — a lake shrunk to its balance, a basin breached and drained — the rivers still
    // cross the dry ground: down to the shore (a priority flood from the water over the basin's dry cells), or, with
    // no water left, down to the gorge the basin drains by (from its outlet) ──
    const lr = new Int32Array(n).fill(-1), lp = new Int32Array(n).fill(-1), lfill = new Float32Array(n), lorder = [];
    for (const h of hollows) {
        if (!h.lake) continue;
        const cells = h.cells, dry = c => hollow[c] === hollow[h.outlet] && !lakeKind[c] && c !== h.outlet;
        const seeds = cells.filter(c => lakeKind[c]);
        if (!seeds.length) seeds.push(h.outlet);
        const hp = new MinHeap(256);
        lorder.length = 0;
        for (const s of seeds) {
            lr[s] = -2;
            const w = lakeKind[s] ? lakeLevel[s] : z[s];
            for (let k = adjOffset[s]; k < adjOffset[s + 1]; k++) { const nb = adjList[k]; if (dry(nb) && lp[nb] === -1) { lp[nb] = s; lfill[nb] = Math.max(w, z[nb]); hp.push(lfill[nb], nb); } }
        }
        while (hp.size) {
            const c = hp.pop();
            if (lr[c] !== -1) continue;
            lr[c] = lorder.length; lorder.push(c);
            for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
                const nb = adjList[k];
                if (lr[nb] !== -1 || !dry(nb)) continue;
                const level = Math.max(lfill[c], z[nb]);
                if (lp[nb] === -1 || level < lfill[nb]) { lp[nb] = c; lfill[nb] = level; hp.push(level, nb); }
            }
        }
        // (each dry cell drains the steepest way down to a cell reached before — or the water, or the outlet; on a flat, the
        // flood's way — and carries what it gathered: its own runoff and what came in from outside the basin, kept in q)
        for (let i = 0; i < lorder.length; i++) {
            const c = lorder[i];
            let pick = -1, steepest = 0;
            for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
                const nb = adjList[k];
                if (!(lr[nb] === -2 || (lr[nb] >= 0 && lr[nb] < i))) continue;
                const s = lfill[c] - (lr[nb] === -2 ? (lakeKind[nb] ? lakeLevel[nb] : z[nb]) : lfill[nb]);
                if (s > steepest) { steepest = s; pick = nb; }
            }
            recv[c] = pick >= 0 ? pick : lp[c];
        }
        for (let i = lorder.length - 1; i >= 0; i--) {
            const c = lorder[i], r = recv[c];
            if (lr[r] >= 0) { q[r] += q[c]; qw[r] += qw[c]; area[r] += area[c]; }
        }
        h.dryOrder = Int32Array.from(lorder);                       // (kept: the monthly pass routes the same way)
        for (const c of lorder) lr[c] = -1;
        for (const s of seeds) lr[s] = -1;
        for (const c of cells) lp[c] = -1;
    }

    // ── the rivers: reaches carrying at least riverMinM3s, not on lakes, not on ice caps ──
    const on = c => rank[c] >= 0 && q[c] >= F.riverMinM3s && !lakeKind[c] && !(ctx.ice && ctx.ice[c]);
    const upCount = new Uint8Array(n);
    for (let i = 0; i < count; i++) { const c = order[i]; if (on(c) && recv[c] >= 0 && on(recv[c])) upCount[recv[c]] = Math.min(255, upCount[recv[c]] + 1); }
    const lat = ctx.lat, lon = ctx.lon, L = { start: [], lat: [], lon: [], q: [], season: [], cell: [] };
    // (a point: where, its discharge, and the cell whose year it has — a mouth's point, the river's last cell's)
    const pushPoint = (c, qq, ss, from = c) => {
        if (lat) { L.lat.push(lat[c]); L.lon.push(lon[c]); }
        else { L.lat.push(Math.asin(Math.max(-1, Math.min(1, xyz[3 * c + 2]))) * 180 / Math.PI); L.lon.push(Math.atan2(xyz[3 * c + 1], xyz[3 * c]) * 180 / Math.PI); }
        L.q.push(qq); L.season.push(ss); L.cell.push(from);
    };
    let reaches = 0, biggest = 0;
    for (let i = count - 1; i >= 0; i--) {
        const s = order[i];
        if (!on(s) || upCount[s] === 1) continue;             // (a head: a source, or a confluence — rivers start there)
        L.start.push(L.lat.length);
        let c = s;
        for (let guard = 0; guard < 1e6; guard++) {
            pushPoint(c, q[c], q[c] > 0 ? qw[c] / q[c] : 0);
            if (q[c] > biggest) biggest = q[c];
            const r = recv[c];
            if (r < 0) break;
            // (the mouth: into the sea, a lake, or another river's confluence — its point ends this reach)
            if (rank[r] === -2 || lakeKind[r] || !on(r) || upCount[r] !== 1) { if (rank[r] === -2 || lakeKind[r] || on(r)) pushPoint(r, q[c], q[c] > 0 ? qw[c] / q[c] : 0, c); break; }
            c = r;
        }
        reaches++;
    }
    // ── each river's year (ctx.months: the monthly shares of each place's runoff, on the climate's grid) ──
    const regimes = ctx.months ? riverYears(ctx, F, { n, count, order, hollow, hollows, recv, rank, lakeKind, stepKm, own, cells: Int32Array.from(L.cell) }) : null;
    let lakes = 0, salt = 0, pans = 0, lakeKm2 = 0;
    const byOrigin = { glacialFresh: 0, tectonicFresh: 0, salt: 0, pan: 0 }, sizes = [];
    for (const h of hollows) if (h.kind) {
        if (h.kind === Water.FRESH) lakes++; else if (h.kind === Water.SALT) salt++; else pans++;
        let a = 0; for (const c of h.cells) if (lakeKind[c]) a += cellKm2;
        byOrigin[h.kind === Water.FRESH ? (h.glacial ? 'glacialFresh' : 'tectonicFresh') : h.kind === Water.SALT ? 'salt' : 'pan'] += a;
        sizes.push(a);
    }
    sizes.sort((a, b) => b - a);
    for (let c = 0; c < n; c++) if (lakeKind[c]) lakeKm2 += cellKm2;
    const landKm2 = count * cellKm2;
    return {
        lake: lakeKind, lakeLevel, q, area, recv, order: order.subarray(0, count),
        rivers: { start: Int32Array.from(L.start), lat: Float32Array.from(L.lat), lon: Float32Array.from(L.lon), q: Float32Array.from(L.q), season: Float32Array.from(L.season),
            ...(regimes ?? {}) },
        terminal: ctx.debug ? hollows.filter(h => h.kind && h.kind !== Water.FRESH).sort((a, b) => b.inflow - a.inflow).slice(0, 12).map(h => {
            let P = 0, E = 0, la = 0, lo = 0; for (const c of h.cells) { P += rain[c]; E += pet[c]; la += (ctx.lat?.[c] ?? 0); lo += (ctx.lon?.[c] ?? 0); }
            const k = h.cells.length; return { inflow: +h.inflow.toFixed(0), fullEvap: +h.fullEvap.toFixed(0), grown: h.grown, grownE: +(h.grownE ?? 0).toFixed(0), cells: k, km2: Math.round(k * cellKm2), depthM: Math.round((h.level - Math.min(...h.cells.map(c => z[c]))) * 1000), rain: Math.round(P / k), pet: Math.round(E / k), at: `${(lo / k).toFixed(0)},${(la / k).toFixed(0)}`, kind: h.kind };
        }) : null,
        stats: { runoffMm: total * SEC_PER_YEAR / 1e3 / Math.max(1, landKm2), toSeaShare: toSea / Math.max(1e-9, total), toBasinsShare: toBasins / Math.max(1e-9, total),
            lostShare: lost / Math.max(1e-9, total), byOriginShare: Object.fromEntries(Object.entries(byOrigin).map(([k, v]) => [k, +(100 * v / Math.max(1, count * cellKm2)).toFixed(2)])),
            biggestLakesKm2: sizes.slice(0, 6).map(Math.round), cutCells, cutMaxKm: +cutMaxKm.toFixed(3), cutMeanM: Math.round(1000 * cutKm3 / Math.max(1, cutCells) / cellKm2), reaches, points: L.lat.length, biggestM3s: biggest, freshLakes: lakes, saltLakes: salt, pans, lakeShare: lakeKm2 / Math.max(1, landKm2) },
    };
}

/** River regimes (per river point): 0 permanent and steady, 1 permanent with a flood season, 2 seasonal (dry some months),
 *  3 dry most of the year. */
export const Regime = Object.freeze({ STEADY: 0, FLOOD: 1, SEASONAL: 2, EPHEMERAL: 3 });

/**
 * Each river point's year: the twelve monthly flows, four months at a time (at 10M cells four arrays of flows is 160 MB):
 * each cell's runoff shared out over the months (ctx.months.at: the shares, and each month's dryness), routed as the year's was — lakes gather their
 * cells' water and pass on at their outlet the year's outflow, shaped by their inflow's months and evened out
 * (F.lakeRegulation); a basin's dry ground routed as before; river beds losing water by each month's dryness (a dry
 * season's low flow can vanish into the bed: the river runs dry). Then per point: its regime, its flood months
 * (around the peak, the months within 60 % of it), and whether it is fed from afar (permanent where the land is dry).
 */
function riverYears(ctx, F, G) {
    const { n, count, order, hollow, hollows, recv, rank, lakeKind, stepKm, own, cells } = G, { pet, rain } = ctx, monthsAt = ctx.months.at;
    const P = cells.length, qm = new Float32Array(12 * P), M = 4, acc = Array.from({ length: M }, () => new Float32Array(n)), sh = new Float32Array(M), ar = new Float32Array(M);
    const dryMark = new Int32Array(n);
    hollows.forEach((h, i) => { if (h.dryOrder) for (const c of h.dryOrder) dryMark[c] = i + 1; });
    for (let m0 = 0; m0 < 12; m0 += M) {
        for (const a of acc) a.fill(0);
        for (const h of hollows) h.inM = h.lake ? new Float64Array(M) : null;
        for (let i = count - 1; i >= 0; i--) {
            const c = order[i], h = hollow[c] >= 0 ? hollows[hollow[c]] : null, r0 = 12 * own(c);
            monthsAt(c, m0, M, sh, ar);
            for (let j = 0; j < M; j++) acc[j][c] += r0 * sh[j];
            if (h && h.lake) {
                for (let j = 0; j < M; j++) h.inM[j] += acc[j][c];
                if (c !== h.outlet) continue;
                // (a lake passes on its year's outflow, shaped by its inflow's months — evened out by its storage)
                const lam = F.lakeRegulation;
                for (let j = 0; j < M; j++) acc[j][c] = h.outflow > 0 && h.inflow > 0 ? h.outflow * ((1 - lam) * h.inM[j] / h.inflow + lam) : 0;
                if (!(h.outflow > 0)) continue;
            }
            // (the bed loses water by the month's own dryness: most in the dry season, none while frozen)
            const r = recv[c], pass = r >= 0 && rank[r] >= 0;
            for (let j = 0; j < M; j++) {
                let out = acc[j][c];
                if (ar[j] > 0 && out > 0) out = Math.max(0, out - F.bedLossMPerYear * ar[j] * F.riverWidthPerSqrtQ * Math.sqrt(out) * stepKm[c] * 1000 / SEC_PER_YEAR);
                acc[j][c] = out;
                if (pass) acc[j][r] += out;
            }
        }
        // (a basin's dry ground, down to its water or its gorge — as the year's routing)
        for (const h of hollows) {
            const ord = h.dryOrder;
            if (!ord) continue;
            const id = hollow[h.outlet] + 1;
            for (let i = ord.length - 1; i >= 0; i--) {
                const c = ord[i], r = recv[c];
                if (dryMark[r] === id) for (let j = 0; j < M; j++) acc[j][r] += acc[j][c];
            }
        }
        for (let p = 0; p < P; p++) for (let j = 0; j < M; j++) qm[12 * p + m0 + j] = acc[j][cells[p]];
    }
    // ── regimes ──
    const regime = new Uint8Array(P), floodFrom = new Uint8Array(P), floodTo = new Uint8Array(P), farFed = new Uint8Array(P), months = qm;
    for (let p = 0; p < P; p++) {
        let sum = 0, max = 0, peak = 0;
        for (let m = 0; m < 12; m++) { const v = qm[12 * p + m]; sum += v; if (v > max) { max = v; peak = m; } }
        const mean = sum / 12;
        let dry = 0;
        for (let m = 0; m < 12; m++) if (qm[12 * p + m] < Math.max(F.dryM3s, F.dryShare * mean)) dry++;
        regime[p] = dry >= F.ephemeralMonths ? Regime.EPHEMERAL : dry >= 1 ? Regime.SEASONAL : max >= F.floodRatio * mean ? Regime.FLOOD : Regime.STEADY;
        let a = peak, b = peak;
        while (a !== (peak + 1) % 12 && qm[12 * p + (a + 11) % 12] >= 0.6 * max && (a + 11) % 12 !== peak) a = (a + 11) % 12;
        while (qm[12 * p + (b + 1) % 12] >= 0.6 * max && (b + 1) % 12 !== a) b = (b + 1) % 12;
        floodFrom[p] = a; floodTo[p] = b;
        const c = cells[p];
        farFed[p] = regime[p] <= Regime.FLOOD && pet[c] > 0 && Math.max(0, rain[c]) < F.farFedAridity * pet[c] ? 1 : 0;
    }
    return ctx.debug ? { regime, floodFrom, floodTo, farFed, months } : { regime, floodFrom, floodTo, farFed };     // (the months: for checks only)
}
