// Phase 8b-1: rivers carve the tectonic surface. The stream power law with n = 1,
//     ∂z/∂t = u − k A^m |∇z|,
// solved ANALYTICALLY in time along the river network (Tzathas, Gailleton, Steer & Cordonnier, "Physically-based
// analytical erosion for fast terrain generation", Eurographics 2024): erosion is a wave travelling up each river at
// a(s) = k A(s)^m, so after a time t the height at x is the starting surface at the point D downstream of x that the
// wave needed t to come from, plus the uplift gathered on the way (their eqns 6–9):
//     T(D, x) = ∫_D^x ds / a = t,     z(x, t) = z0(D) + ∫_D^x u / a ds,
// or, where the wave reached x from beyond the coast within t (the steady state), z = z(coast) + ∫_0^x u / a ds.
// One pass per river tree instead of thousands of time steps. Adapted to a planet:
//   · the network: a priority flood from the sea (every land cell drains out; depressions are crossed at their
//     spill point, so small pits are breached), then each cell's receiver its steepest way down — over the surface
//     plus a faint micro-relief of the crust's own (the hummocks every real surface has, below this mesh; developer:
//     small rivers should hold their courses from frame to frame and shift only as the land changes — the paper's
//     random receivers were drawn afresh wherever the crust moved under the mesh);
//   · the rivers of the history (8b-2, tectonics/step/rivers.js): the routing runs over the surface less what the
//     history's rivers cut, so rivers follow the old courses — through ranges they cut as those rose — and a river bed
//     is at least as deep as the history cut it: gorges and canyons where big rivers held their ways;
//   · drainage area in km², weighted by rainfall (a river from wet mountains keeps cutting across a desert);
//   · every river carves its bed; a cell drops by the share of it its valley takes — valleys widen with the square root
//     of discharge (hydraulic geometry) — so great rivers cut whole cells and streams barely mark theirs, smoothly;
//     valley sides are held to a critical gradient;
//   · the starting surface is the tectonic surface less the uplift the time t would add (z0 = z − u t), so ground the
//     wave has not reached keeps the tectonic height; the result never rises above the tectonic surface;
//   · network and heights depend on each other: solved coarse to fine (the paper's multigrid idea) over meshes a
//     factor 4 apart — the sim mesh, then the terrain meshes up to the one shown — each level routing over the finer
//     surface plus the carving found on the coarser one, so big rivers are settled where the whole continent is seen.
// Heights in km, distances in km, time in Myr.

import { MinHeap, spreadKm } from '../core/min-heap.js';
import { locate } from '../core/mesh-locate.js';

const R = 6371;
// Across a flat — a hollow filled to its spill level — a priority flood takes its cells in whatever order its heap gives
// them, and the ways it finds there (each cell's way: the cell it was reached from) wander: a river crossing a hollow
// meandered all over it (developer, 2026-10-27: "rivers have gone crazy/are just meandering all over the place"). So
// across a flat the flood follows the ground under the water — the lower first, so a river crossing a hollow runs down
// its low line to the outlet, joining the others there (a tree, not parallel lines) — and, where that ground is flat
// too, the nearer to where it came in: FLAT_KEY_DEPTH on the key per km below the level, FLAT_KEY_PER_KM per km crossed
// (a metre down weighs as 5 km across — 1 km: "slightly too straight now", developer — so the ground under the water,
// its micro-relief and meanders, still bends the way; at most millimetres in all — under any real slope's difference)
export const FLAT_KEY_DEPTH = 1e-6, FLAT_KEY_PER_KM = 2e-10;
/** The flood's key for a cell reached at `level`, its ground at `ground` (≤ level in a hollow), `km` across the flat. */
export const flatKey = (level, ground, km) => level + FLAT_KEY_DEPTH * Math.min(0, ground - level) + FLAT_KEY_PER_KM * km;

/** Per mesh: the distance (km) along each adjacency entry, and the area of a cell (km²; the meshes are near-uniform). */
const infos = new WeakMap();
function infoOf(mesh) {
    let I = infos.get(mesh);
    if (I) return I;
    const { xyz, adjOffset, adjList, numCells } = mesh, dist = new Float32Array(adjList.length);
    for (let c = 0; c < numCells; c++) for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
        const n = adjList[k], dx = xyz[3 * n] - xyz[3 * c], dy = xyz[3 * n + 1] - xyz[3 * c + 1], dz = xyz[3 * n + 2] - xyz[3 * c + 2];
        dist[k] = 2 * R * Math.asin(Math.min(1, 0.5 * Math.hypot(dx, dy, dz)));
    }
    I = { dist, area: 4 * Math.PI * R * R / numCells };
    infos.set(mesh, I);
    return I;
}

/**
 * Carve one mesh level.
 * @param {Object} mesh
 * @param {Object} f       per-cell fields on this mesh: z (tectonic surface, km), u (rock uplift, km/Myr), k (the
 *                         wave speed at 1 km² of drainage, km/Myr), rain (drainage weight), micro (km: the crust's
 *                         micro-relief, for the routing only), inc (km: how deep the history's rivers cut here), slope
 *                         (hillslope gradient, km per km); optionally sink (> 0.5: the floor of a closed basin — rivers
 *                         end there as at the sea) and base (km: that floor's level, their base level instead of 0)
 * @param {Float32Array} route   the surface the rivers are routed over (the current estimate, micro-relief included)
 * @param {Object} cfg     { timeMyr, m, valleyKm, activeHold }
 * @returns {{z: Float32Array, recv: Int32Array, area: Float32Array}}  carved heights, receivers (−1: the sea), drainage (km²)
 */
export function carveLevel(mesh, f, route, cfg) {
    const { adjOffset, adjList, numCells: n } = mesh, { dist, area: cellArea } = infoOf(mesh);
    // (closed basins' floors are outlets like the sea, each at its own level: the finish's dry basins)
    const sink = f.sink ?? null, land = sink ? c => f.z[c] > 0 && !(sink[c] > 0.5) : c => f.z[c] > 0;
    const baseOf = sink ? c => (sink[c] > 0.5 ? f.base[c] : 0) : () => 0;
    // ── the priority flood: from the sea inward, lowest spill first ──
    const fill = new Float32Array(n), rank = new Int32Array(n).fill(-1), parent = new Int32Array(n).fill(-1), order = new Int32Array(n);
    const heap = new MinHeap(1 << 16), flatKm = new Float32Array(n);     // (how far across the flat it is in: FLAT_KEY_PER_KM)
    let count = 0;
    for (let c = 0; c < n; c++) {
        if (land(c)) continue;
        rank[c] = -2;                                                     // (the sea: a boundary, never ranked)
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) if (land(adjList[k]) && parent[adjList[k]] === -1) {
            const nb = adjList[k];
            parent[nb] = c; fill[nb] = Math.max(baseOf(c), route[nb]); heap.push(fill[nb], nb);
        }
    }
    while (heap.size) {
        const c = heap.pop();
        if (rank[c] !== -1) continue;
        rank[c] = count; order[count++] = c;
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
            const nb = adjList[k];
            if (rank[nb] !== -1 || !land(nb)) continue;
            const level = Math.max(fill[c], route[nb]), fk = route[nb] <= fill[c] ? flatKm[c] + dist[k] : 0;
            if (parent[nb] === -1 || level < fill[nb] || (level === fill[nb] && fk < flatKm[nb])) { parent[nb] = c; fill[nb] = level; flatKm[nb] = fk; heap.push(flatKey(level, route[nb], fk), nb); }
        }
    }
    // ── receivers: the steepest way down to a neighbour already reached (or the sea); on a flat, the flood's way ──
    const recv = new Int32Array(n).fill(-1), recvKm = new Float32Array(n);
    for (let i = 0; i < count; i++) {
        const c = order[i];
        let pick = -1, km = 0, steepest = 0;
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
            const nb = adjList[k], fn = rank[nb] === -2 ? baseOf(nb) : fill[nb];
            if (!(rank[nb] === -2 || (rank[nb] >= 0 && rank[nb] < i)) || fn >= fill[c]) continue;
            const s = (fill[c] - fn) / dist[k];
            if (s > steepest) { steepest = s; pick = nb; km = dist[k]; }
        }
        if (pick < 0) {
            pick = parent[c];
            for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) if (adjList[k] === pick) { km = dist[k]; break; }
        }
        recv[c] = rank[pick] === -2 ? -1 - pick : pick;                  // (−1 − s: drains into sea cell s)
        recvKm[c] = km;
    }
    // ── drainage area (km², rain-weighted), leaves to the sea ──
    const area = new Float32Array(n);
    for (let i = count - 1; i >= 0; i--) {
        const c = order[i];
        area[c] += cellArea * f.rain[c];
        if (recv[c] >= 0) area[recv[c]] += area[c];
    }
    // ── the river beds: the analytical solution, from the sea up each river: travel time T and uplift gathered S from
    // the coast — for every river, the river through a cell draining that cell's area (every cell comes after its
    // receiver in the flood's order, so its downstream path is known; D is found by a binary search over that path's
    // travel times, kept on a stack by a depth-first walk) ──
    const t = cfg.timeMyr, m = cfg.m, bed = new Float32Array(n), z = new Float32Array(n);
    for (let c = 0; c < n; c++) { bed[c] = f.z[c]; z[c] = f.z[c]; }
    const donorsAt = new Int32Array(n + 1), donors = new Int32Array(count);
    for (let i = 0; i < count; i++) { const r = recv[order[i]]; if (r >= 0) donorsAt[r + 1]++; }
    for (let c = 0; c < n; c++) donorsAt[c + 1] += donorsAt[c];
    const fillAt = donorsAt.slice(0, n);
    for (let i = 0; i < count; i++) { const c = order[i], r = recv[c]; if (r >= 0) donors[fillAt[r]++] = c; }
    const pathCell = new Int32Array(count + 1), pathT = new Float64Array(count + 1), pathS = new Float64Array(count + 1), pathZ0 = new Float64Array(count + 1);
    const walk = new Int32Array(count), walkDepth = new Int32Array(count), baseAt = sink ? new Float32Array(n) : null;
    for (let i = 0; i < count; i++) {
        const root = order[i];
        if (recv[root] >= 0) continue;                                    // (roots: rivers that reach the sea)
        const base = baseOf(-1 - recv[root]);                             // (or a closed basin's floor)
        let top = 0;
        walk[top] = root; walkDepth[top++] = 1;
        pathT[0] = 0; pathS[0] = base; pathZ0[0] = base;                  // (depth 0: the coast, at sea level)
        while (top > 0) {
            const c = walk[--top], d = walkDepth[top];
            // the path so far is depth 0 … d−1; c is at depth d
            const a = f.k[c] * Math.max(area[c], 1e-6) ** m, dx = recvKm[c];
            pathCell[d] = c; pathT[d] = pathT[d - 1] + dx / a; pathS[d] = pathS[d - 1] + dx * f.u[c] / a; pathZ0[d] = Math.max(base, f.z[c] - f.u[c] * t);   // (never below the sea: its base level)
            if (baseAt) baseAt[c] = base;
            const target = pathT[d] - t;
            let h;
            if (target <= 0) h = pathS[d];                                // the steady state: graded from the coast
            else {
                let lo = 0, hi = d;                                        // pathT[lo] ≤ target < pathT[hi]
                while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pathT[mid] <= target) lo = mid; else hi = mid; }
                const fr = (target - pathT[lo]) / (pathT[hi] - pathT[lo]);
                h = pathZ0[lo] + fr * (pathZ0[hi] - pathZ0[lo]) + pathS[d] - (pathS[lo] + fr * (pathS[hi] - pathS[lo]));
            }
            if (h < bed[c]) bed[c] = h;
            for (let k = donorsAt[c]; k < donorsAt[c + 1]; k++) { walk[top] = donors[k]; walkDepth[top++] = d + 1; }
        }
    }
    // ── the history's rivers: a bed is at least as deep as they cut it (a canyon where a river held its way) ──
    for (let i = 0; i < count; i++) { const c = order[i], old = f.z[c] - f.inc[c]; if (old < bed[c]) bed[c] = Math.max(baseAt ? baseAt[c] : 0, old); }
    // ── an active belt rises as fast as its rivers cut: its beds stand higher — by activeHold at full activity (f.hold):
    // the range is shaped, not trenched (developer, 8b round 3) ──
    for (let i = 0; i < count; i++) { const c = order[i]; bed[c] = f.z[c] - (1 - cfg.activeHold * f.hold[c]) * (f.z[c] - bed[c]); }
    // ── rivers run downhill: where the wave left a bed below the reach it drains into (it carried a dip of the surface
    // upstream), the bed stands at that reach's height — never above the tectonic surface: a pit in the tectonic
    // surface itself stays, a basin a lake would fill ──
    for (let i = 0; i < count; i++) {
        const c = order[i], r = recv[c];
        if (r >= 0 && bed[c] < bed[r]) bed[c] = Math.min(f.z[c], bed[r]);
    }
    // ── how much of a cell its valley takes: a valley widens with the square root of its river's discharge (hydraulic
    // geometry, Leopold & Maddock 1953) — valleyKm wide at 10⁴ km². A great river's valley fills its cell and the cell
    // drops to the bed; a stream's is a sliver of it and the cell hardly drops. No threshold: every river counts, in
    // proportion; and a coarse cell, holding more than a valley, drops less — its mean, as at any resolution ──
    const perCell = cfg.valleyKm / Math.sqrt(cellArea);
    for (let i = 0; i < count; i++) {
        const c = order[i], share = Math.min(1, perCell * Math.sqrt(area[c] / 1e4));
        z[c] = f.z[c] - share * Math.max(0, f.z[c] - bed[c]);
    }
    // ── a valley wider than its cell (cfg.valleySides, the finish's: 0 none … 1): its sides carried into the cells beside it
    // — each lowered toward the floor by how far inside the valley's half-width it lies, a V across — rather than the whole
    // valley crammed into its own cell ──
    if (cfg.valleySides > 0) {
        const { xyz } = mesh, cellKm = Math.sqrt(cellArea), before = z.slice();
        for (let i = 0; i < count; i++) {
            const c = order[i], half = 0.5 * cfg.valleyKm * Math.sqrt(area[c] / 1e4);
            if (half < 0.6 * cellKm) continue;
            const x = xyz[3 * c], y = xyz[3 * c + 1], w = xyz[3 * c + 2], reach = Math.min(half, 4 * cellKm);
            for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
                const q = adjList[k];
                if (!land(q)) continue;
                const d = R * Math.hypot(xyz[3 * q] - x, xyz[3 * q + 1] - y, xyz[3 * q + 2] - w);
                if (d >= reach) continue;
                const to = f.z[q] - cfg.valleySides * (1 - d / reach) * Math.max(0, f.z[q] - bed[c]);
                if (to < z[q]) z[q] = to;
            }
        }
        // (a side lowered below the ground it drains to — it drains elsewhere — stands at that ground: no new pits)
        for (let i = 0; i < count; i++) { const c = order[i], r = recv[c]; if (r >= 0 && z[c] < before[c] && z[c] < z[r]) z[c] = Math.min(before[c], z[r]); }
    }
    // ── valley sides: no ground stands more than its critical gradient (f.slope) above the ground its water runs to
    // — a limit, like the paper's thermal erosion: the sides of a deep valley reach into the cells beside it ──
    for (let i = 0; i < count; i++) {
        const c = order[i], r = recv[c], lim = (r >= 0 ? z[r] : baseOf(-1 - r)) + f.slope[c] * recvKm[c];
        if (lim < z[c]) z[c] = lim;
    }
    // (land stays land: a river cut to its base level stands just above the sea — or above its basin's floor)
    if (!baseAt) { for (let c = 0; c < n; c++) if (f.z[c] > 0 && z[c] < LAND_FLOOR) z[c] = Math.min(f.z[c], LAND_FLOOR); }
    else for (let i = 0; i < count; i++) { const c = order[i], fl = baseAt[c] + LAND_FLOOR; if (z[c] < fl) z[c] = Math.min(f.z[c], fl); }
    return { z, recv, area, order: order.subarray(0, count) };
}
const LAND_FLOOR = 0.002;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** The stair's levels above the foot of a pile (km): steps of `step` ± 40 %, from a fixed hash — every mesh alike. */
function stairLevels(step) {
    const levels = [0];
    for (let k = 0; levels[k] < 10; k++) {
        let h = Math.imul(k + 1, 0x9e3779b1); h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13;
        levels.push(levels[k] + step * (0.6 + 0.8 * ((h >>> 0) / 4294967296)));
    }
    return levels;
}

/**
 * A flood basalt cut up as real ones are (developer: the old mesa noise was "super blotchy … dont really remind me of
 * actual LIPs like the Deccan"): the plateau is eaten from its edges — its escarpment retreats inward (the Western Ghats,
 * the Drakensberg) — and down its rivers, whose valleys widen through it with time, the bigger river the faster; the cap
 * stands on the divides between them, a dissected plateau (the Deccan), then mesas and buttes along the divides (the
 * ambas of Ethiopia), then remnants. Each basalt cell is stripped to the ground under the lava where some edge or river's
 * reach — retreat rate × the wear's age (lipAge: Myr, × the climate's erosion) — goes past its distance from it (along
 * the basalt), with a wall lipWallKm wide that wanders by a noise of its own; the stair (terraceBasalt) then steps the
 * walls. On the mesh shown only; a river counts only if it drains lipValleyAreaKm2 and at least four of its cells.
 */
function stripBasalt(mesh, f, C, cfg) {
    const { z, area } = C, n = mesh.numCells, { adjOffset, adjList } = mesh, { area: cellArea } = infoOf(mesh);
    const basalt = c => f.lip[c] > 0.05 && f.z[c] > 0, minArea = Math.max(cfg.lipValleyAreaKm2, 4 * cellArea);
    const dist = new Float32Array(n).fill(Infinity), reach = new Float32Array(n);
    let big = 0;
    for (let c = 0; c < n; c++) {
        const t = f.lipAge[c];
        if (!(t > 0) || !basalt(c)) continue;
        let r = 0;
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) if (!basalt(adjList[k])) { r = cfg.lipEdgeRetreat * t; break; }
        // (a river first cuts a canyon through the pile; its valley widens only after that)
        if (area[c] >= minArea) r = Math.max(r, cfg.lipValleyRate * Math.max(0, t - cfg.lipIncisionMyr) * (area[c] / 1e4) ** 0.3);
        reach[c] = r;
        if (r > big) big = r;
    }
    if (!(big > 0)) return;
    // (the furthest reach at each cell, as a distance: B − reach at the sources, growing along the basalt)
    const B = big + 1;
    for (let c = 0; c < n; c++) if (reach[c] > 0) dist[c] = B - reach[c];
    spreadKm(mesh, dist, { canEnter: (a, b) => basalt(b), maxKm: B });
    const before = z.slice();
    for (let c = 0; c < n; c++) {
        if (!basalt(c) || !(f.lipAge[c] > 0)) continue;
        // (a young escarpment is steep; it slopes back more gently as it retreats: its width grows with the retreat, to lipWallKm)
        const back = cfg.lipEdgeRetreat * f.lipAge[c], W = Math.max(3, Math.min(cfg.lipWallKm, 0.5 * back));
        const v = (dist[c] < Infinity ? B - dist[c] : -1e9) + cfg.lipWallNoise * Math.min(40, back) * f.lipNoise[c];
        const s = smooth(-W, W, v), rel = z[c] - f.lipBase[c];
        if (s > 0 && rel > 0) z[c] -= s * rel;
    }
    // (rivers still run downhill: a cell left below the one it drains into stands at that one's height again — never above
    // where it was; in the flood's order, every cell after its receiver)
    for (let i = 0; i < C.order.length; i++) { const c = C.order[i], r = C.recv[c]; if (r >= 0 && z[c] < z[r] && z[c] < before[c]) z[c] = Math.min(before[c], z[r]); }
}

/**
 * Flood basalt is stepped wherever it is cut into (developer, 8b round 6 — "trap" is a stair; terrain/lips.js): flow on
 * flow, hard and soft in turn, so a slope through the pile is flat treads and cliffs. The height above the ground under
 * the pile goes through an irregular stair — each step's foot a flat tread, its last lipRiser a cliff steepening to a
 * sharp rim (a talus foot, a caprock edge) — by how far below the unbroken top the ground now is: the intact plateau
 * top stays as it is; canyon walls, the escarpment and the flanks of mesas become stairs. A stair never rises above the
 * slope it replaces, and never turns water back: where a tread left a cell below the cell it drains into, the cell
 * stands at that cell's height again (never above where it was).
 */
function terraceBasalt(f, C, cfg) {
    const { z } = C, step = cfg.lipStepKm, riser = cfg.lipRiser, levels = stairLevels(step), before = z.slice();
    for (let c = 0; c < z.length; c++) {
        if (!(f.lip[c] > 0) || !(f.z[c] > 0)) continue;
        const rel = z[c] - f.lipBase[c];
        if (rel <= 0) continue;
        const w = (cfg.lipStairShare ?? 1) * f.lip[c] * smooth(0.25 * step, step, f.lipTop[c] - rel);
        if (w <= 0) continue;
        let k = 0;
        while (k < levels.length - 2 && levels[k + 1] <= rel) k++;
        const lo = levels[k], s = levels[k + 1] - lo, t = Math.max(0, ((rel - lo) / s - (1 - riser)) / riser);
        z[c] = f.lipBase[c] + rel + w * (lo + s * t ** 1.5 - rel);
    }
    for (let i = 0; i < C.order.length; i++) { const c = C.order[i], r = C.recv[c]; if (r >= 0 && z[c] < z[r] && z[c] < before[c]) z[c] = Math.min(before[c], z[r]); }
}

/** For each cell of `fine`: the 3 cells of `coarse` around it and their weights (barycentric), and its nearest. Cached. */
const maps = new WeakMap();

/** A field of the `fine` mesh as the `coarse` one sees it — each coarse cell the mean of the fine cells nearest it — and
 *  each fine cell's nearest coarse cell. */
export function meanOnCoarser(coarse, fine, values) {
    const M = mapBetween(coarse, fine), n = coarse.numCells, sum = new Float64Array(n), count = new Uint32Array(n), out = new Float32Array(n);
    for (let i = 0; i < fine.numCells; i++) { sum[M.nearest[i]] += values[i]; count[M.nearest[i]]++; }
    for (let c = 0; c < n; c++) out[c] = count[c] ? sum[c] / count[c] : 0;
    return { values: out, nearest: M.nearest };
}
/** Let go of what is cached for a mesh (its edge lengths, its maps to coarser meshes): ~0.5 GB at 10M cells (the finish). */
export function forgetMesh(mesh) { infos.delete(mesh); maps.delete(mesh); }
function mapBetween(coarse, fine) {
    let byCoarse = maps.get(fine);
    if (!byCoarse) maps.set(fine, byCoarse = new WeakMap());
    let M = byCoarse.get(coarse);
    if (M) return M;
    const n = fine.numCells, cells = new Int32Array(3 * n), weights = new Float32Array(3 * n), nearest = new Int32Array(n), c3 = [0, 0, 0], w3 = [0, 0, 0];
    for (let i = 0; i < n; i++) {
        locate(coarse, fine.xyz[3 * i], fine.xyz[3 * i + 1], fine.xyz[3 * i + 2], c3, w3);
        let best = 0;
        for (let j = 0; j < 3; j++) { cells[3 * i + j] = c3[j]; weights[3 * i + j] = w3[j]; if (w3[j] > w3[best]) best = j; }
        nearest[i] = c3[best];
    }
    M = { cells, weights, nearest };
    byCoarse.set(coarse, M);
    return M;
}

const FIELDS = ['z', 'u', 'k', 'rain', 'micro', 'slope', 'inc', 'hold', 'lip', 'lipBase', 'lipTop'];
/** Fine fields averaged onto a coarse mesh (each fine cell counts for its nearest coarse cell). */
function downsample(coarse, fine, f) {
    const M = mapBetween(coarse, fine), n = coarse.numCells, near = M.nearest, count = new Uint32Array(n), sum = new Float64Array(n);
    for (let i = 0; i < fine.numCells; i++) count[near[i]]++;
    const out = {};
    // (closed basins: the share of a coarse cell that is basin floor, and the floor's mean level there)
    if (f.sink) {
        const sk = out.sink = new Float32Array(n), bs = out.base = new Float32Array(n), sb = new Float64Array(n);
        sum.fill(0);
        for (let i = 0; i < fine.numCells; i++) { const s = f.sink[i] > 0.5 ? 1 : 0; sum[near[i]] += s; sb[near[i]] += s * f.base[i]; }
        for (let c = 0; c < n; c++) { sk[c] = count[c] ? sum[c] / count[c] : 0; bs[c] = sum[c] > 0 ? sb[c] / sum[c] : 0; }
    }
    // (field by field — each coarse cell sums its fine cells in the same order, so to the same bits)
    for (const key of FIELDS) {
        const a = f[key], o = out[key] = new Float32Array(n);
        sum.fill(0);
        for (let i = 0; i < fine.numCells; i++) sum[near[i]] += a[i];
        for (let c = 0; c < n; c++) o[c] = count[c] ? sum[c] / count[c] : 0;
    }
    // (a coarse cell no fine cell fell in — rare at a factor 4 — takes the values of the fine cell nearest it)
    for (let c = 0; c < n; c++) if (!count[c]) {
        const i = fine.index.nearest(coarse.xyz[3 * c], coarse.xyz[3 * c + 1], coarse.xyz[3 * c + 2]);
        for (const key of FIELDS) out[key][c] = f[key][i];
        if (f.sink) { out.sink[c] = f.sink[i]; out.base[c] = f.base[i]; }
    }
    return out;
}

/** A coarse field carried onto the fine mesh (barycentric). */
function upsample(coarse, fine, values) {
    const M = mapBetween(coarse, fine), out = new Float32Array(fine.numCells);
    for (let i = 0; i < fine.numCells; i++) out[i] = M.weights[3 * i] * values[M.cells[3 * i]] + M.weights[3 * i + 1] * values[M.cells[3 * i + 1]] + M.weights[3 * i + 2] * values[M.cells[3 * i + 2]];
    return out;
}

/**
 * Carve the finest mesh's surface, coarse to fine. `meshes`: coarsest first, the finest last (a factor ~4 apart);
 * `fields`: per-cell z, u, k, rain, micro, slope, inc on the finest. cfg: { timeMyr, m, rounds: [coarsest, …, finest] }.
 * @returns {{z: Float32Array, recv: Int32Array, area: Float32Array}} on the finest mesh
 */
export function carveTerrain(meshes, fields, cfg, given = null) {
    const L = meshes.length, F = new Array(L);
    F[L - 1] = fields;
    // (a coarser level's fields given as they are at that detail — the surface synthesized there — rather than averaged
    // from the finest: the levels that settle the big rivers then see the same surface whatever the detail shown)
    for (let l = L - 2; l >= 0; l--) F[l] = given?.get(meshes[l].numCells) ?? downsample(meshes[l], meshes[l + 1], F[l + 1]);
    let result = null, delta = null;
    for (let l = 0; l < L; l++) {
        const mesh = meshes[l], f = F[l];
        // route over this level's surface plus the carving the coarser level found, and the crust's micro-relief
        const n = mesh.numCells, { z, micro, inc } = f;
        let route = new Float32Array(n);
        for (let i = 0; i < n; i++) route[i] = z[i] + micro[i] - inc[i];
        if (delta) { const up = upsample(meshes[l - 1], mesh, delta); for (let i = 0; i < n; i++) route[i] += up[i]; }
        const rounds = cfg.rounds[Math.min(l, cfg.rounds.length - 1)];
        for (let r = 0; r < rounds; r++) {
            result = carveLevel(mesh, f, route, cfg);
            // (the next round routes over an average of the old estimate and the new heights: no oscillation)
            if (r < rounds - 1) {
                const next = new Float32Array(n), rz = result.z;
                for (let i = 0; i < n; i++) next[i] = 0.5 * route[i] + 0.5 * (rz[i] + micro[i] - inc[i]);
                route = next;
            }
        }
        delta = new Float32Array(n);
        for (let i = 0; i < n; i++) delta[i] = result.z[i] - z[i];
    }
    if (F[L - 1].lipAge && (cfg.lipEdgeRetreat > 0 || cfg.lipValleyRate > 0)) stripBasalt(meshes[L - 1], F[L - 1], result, cfg);
    if (cfg.lipStepKm > 0) terraceBasalt(F[L - 1], result, cfg);     // (on the mesh shown only)
    if (cfg.drownKm > 0 && cfg.drownDepthKm > 0) drownValleys(meshes, F, result, cfg);
    if (cfg.canyonKm > 0 && cfg.canyonDepthKm > 0) cutCanyons(meshes[L - 1], F[L - 1], result, cfg);
    return result;
}

/**
 * Drowned valleys (terrain-config drownKm …): where hills and mountains meet the sea, the sea runs up the big river valleys
 * — rias and fjords — and the ridges between them stand out as headlands. Each land cell's distance to the sea along its
 * river (the flood's order: every cell after the one it drains into); its valley floor lowered by
 *     depth · (1 − s / reach)² · (how much it drains) · (how high the land around is)
 * — depth and reach a fjord's where the coast is cold, a ria's where it is not (fields.fjord, 0…1: Add detail's climate;
 * without it, by latitude: drownColdLat)
 * — the land around read on the next coarser mesh (its mean tectonic height, over ~4 of these cells), so a valley's mouth,
 * graded to the sea, still counts as mountainous where its sides are. Then the sea floods in from the open ocean over
 * whatever is now below it; a hollow it cannot reach is given back its height (no pools of sea inland). Fades out where
 * the terrain cannot draw a valley's width (cells over ~25 km).
 */
function drownValleys(meshes, F, C, cfg) {
    const L = meshes.length, mesh = meshes[L - 1], f = F[L - 1], { z, recv, area, order } = C, n = mesh.numCells;
    const show = smooth(55, 25, mesh.edgeKm);
    if (show <= 0) return;
    const { adjOffset, adjList } = mesh, { dist } = infoOf(mesh);
    const around = L > 1 ? upsample(meshes[L - 2], mesh, F[L - 2].z) : f.z;
    const [a1, a2] = cfg.drownAreaKm2 ?? [2000, 30000], [r1, r2] = cfg.drownReliefKm ?? [0.15, 0.9], la1 = Math.log(a1), la2 = Math.log(a2);
    // (fjord or ria: how cold here, 0…1 — the climate's where given, else the latitude's)
    const [lat1, lat2] = cfg.drownColdLat ?? [44, 58], riaKm = cfg.riaKm ?? cfg.drownKm, riaDepth = cfg.riaDepthKm ?? cfg.drownDepthKm, { xyz } = mesh;
    const coldAt = f.fjord ? c => f.fjord[c] : c => smooth(lat1, lat2, Math.abs(Math.asin(Math.max(-1, Math.min(1, xyz[3 * c + 2])))) * 180 / Math.PI);
    // (along the river to the sea: each cell after its receiver, in the flood's order)
    const along = new Float32Array(n), before = z.slice(), sink = new Float32Array(n);
    let drowned = false;
    for (let i = 0; i < order.length; i++) {
        const c = order[i], r = recv[c], to = r >= 0 ? r : -1 - r;
        let step = 0;
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) if (adjList[k] === to) { step = dist[k]; break; }
        along[c] = (r >= 0 ? along[r] : f.sink && f.sink[to] > 0.5 ? Infinity : 0) + step;      // (a closed basin is no sea)
        if (along[c] >= cfg.drownKm) continue;
        const cold = coldAt(c), reach = riaKm + (cfg.drownKm - riaKm) * cold;
        if (along[c] >= reach) continue;
        const g = (1 - along[c] / reach) ** 2, drain = smooth(la1, la2, Math.log(Math.max(1, area[c]))), relief = smooth(r1, r2, around[c]);
        const d = show * (riaDepth + (cfg.drownDepthKm - riaDepth) * cold) * g * drain * relief;
        if (d > 0) { sink[c] = d; drowned = true; }
    }
    if (!drowned) return;
    // (the valley's sides go down with it, by drownWiden of it: an inlet a few cells wide, not a slit)
    const widen = cfg.drownWiden ?? 0, side = new Float32Array(n);
    if (widen > 0) for (let c = 0; c < n; c++) {
        if (!(sink[c] > 0)) continue;
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const q = adjList[k]; if (f.z[q] > 0 && widen * sink[c] > side[q]) side[q] = widen * sink[c]; }
    }
    for (let c = 0; c < n; c++) { const d = Math.max(sink[c], side[c]); if (d > 0) z[c] -= d; }
    // the sea floods in from the ocean over what is now below it; a hollow it does not reach is given back its height
    const reached = new Uint8Array(n), queue = new Int32Array(n);
    let tail = 0;
    for (let c = 0; c < n; c++) if (f.z[c] <= 0) { reached[c] = 1; queue[tail++] = c; }
    for (let head = 0; head < tail; head++) {
        const c = queue[head];
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const q = adjList[k]; if (!reached[q] && z[q] < 0) { reached[q] = 1; queue[tail++] = q; } }
    }
    for (let c = 0; c < n; c++) if (z[c] < before[c] && !reached[c] && z[c] < LAND_FLOOR) z[c] = Math.min(before[c], LAND_FLOOR);
}

/**
 * Submarine canyons (terrain-config canyonKm …): from the mouth of each big river, down the shelf and the slope by the
 * steepest way (from sea cell to lower sea cell) for up to canyonKm, a trough cut into the sea floor — deepest across the
 * shelf break and the upper slope, shallowing at its head and toward its foot, deeper for bigger rivers — its sides half as
 * deep. Where two meet, the deeper cut counts. A canyon follows its river's mouth: frame after frame, the same canyons.
 */
function cutCanyons(mesh, f, C, cfg) {
    const show = smooth(55, 25, mesh.edgeKm);
    if (show <= 0) return;
    const { z, recv, area, order } = C, n = mesh.numCells, { adjOffset, adjList } = mesh, { dist } = infoOf(mesh);
    const [a1, a2] = cfg.canyonAreaKm2 ?? [5000, 60000], la1 = Math.log(a1), la2 = Math.log(a2), L = cfg.canyonKm;
    const cut = new Float32Array(n);
    for (let i = 0; i < order.length; i++) {
        const c = order[i], r = recv[c];
        if (r >= 0 || !(area[c] > a1) || (f.sink && f.sink[-1 - r] > 0.5)) continue;     // (a river reaching the sea, and big enough)
        const size = smooth(la1, la2, Math.log(area[c])), depth = show * cfg.canyonDepthKm * size;
        let at = -1 - r, along = 0;
        for (let steps = 0; steps < 4096 && along < L; steps++) {
            const shape = smooth(0, 0.2 * L, along) * (1 - smooth(0.55 * L, L, along));
            const d = depth * (0.25 + 0.75 * shape);
            if (d > cut[at]) cut[at] = d;
            for (let k = adjOffset[at]; k < adjOffset[at + 1]; k++) { const q = adjList[k]; if (z[q] <= 0 && 0.5 * d > cut[q]) cut[q] = 0.5 * d; }
            let next = -1, low = z[at];
            for (let k = adjOffset[at]; k < adjOffset[at + 1]; k++) { const q = adjList[k]; if (z[q] < low) { low = z[q]; next = q; } }
            if (next < 0) break;
            for (let k = adjOffset[at]; k < adjOffset[at + 1]; k++) if (adjList[k] === next) { along += dist[k]; break; }
            at = next;
        }
    }
    for (let c = 0; c < n; c++) if (cut[c] > 0 && z[c] <= 0) z[c] -= cut[c];
}
