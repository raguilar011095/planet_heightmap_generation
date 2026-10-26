// The far field (plans/V2_FAR_FIELD_PLAN.md): a front's push felt far inland. A collision — or a strongly coupled
// subduction coast — squeezes the whole plate behind it, thousands of km from the front: stiff cratons pass the push on
// without deforming, and weak lines (old sutures, failed rifts, rift margins) take it up — the Tian Shan rising behind the
// rigid Tarim block, 1500–2500 km from India (Molnar & Tapponnier 1975; Neil & Houseman 1997), the Alpine foreland's
// basins squeezed back up (Ziegler et al. 1995). Stiff blocks in a soft sheet (England & McKenzie 1982).
//
// Each crust cell records the push that has reached it (model/crust.js): how much in all (farWork, km of shortening-equivalent —
// the grain it leaves), how far it came (farDist: the path cost from the fronts, averaged over the pushes by what each
// brought — its level lines run along the fronts, and the terrain reads its folds and grain across them; an average, so it
// holds still while a front keeps pushing from where it stands, where a running total would creep), how much lately
// (farFold, fading over farFoldMyr from farAt — the lithosphere's folds), and the axis it was squeezed along (farDx/Dy/Dz ×
// 127, in the plate's frame; an axis, so its sign means nothing — the lab's ticks). What a cell takes up of it (farTake) is
// what a push raises. Records only: the history never reads them.
//
// Fronts feed it as they work (feedFarField: step/collision.js, step/boundaries.js); every farFieldEveryMyr the pushes
// gathered are spread over their plates — one cost-weighted Dijkstra per front, the stronger front cells starting
// ahead (each cell feels the strongest of them: the most that reaches it, W·exp(−d/L)) — on a clock of its own, as the
// rivers' is.

import { CrustType, CrustFlag, OrogenyType } from '../model/crust.js';
import { MinHeap } from '../../core/min-heap.js';
import { spreadBelt } from './orogeny.js';
import { cellDistanceKm } from '../../core/sphere-geom.js';

const WEAK = CrustFlag.SUTURE | CrustFlag.FAILED_RIFT | CrustFlag.RIFT_MARGIN;

/**
 * A front pushed this step: gather it until the next spread. `cells` are raster cells of `plate` at the front, `works` the
 * km of shortening each absorbed (a number: the same for all), `frontKm` the front's length, `share` how much of it pushes.
 * `key` names the front (one collision's side, one plate's trenches), so its pushes add up between spreads.
 */
export function feedFarField(world, plate, key, cells, works, frontKm, share) {
    if (!(share > 0) || !cells.length) return;
    const pending = world.farPending ??= new Map();
    let g = pending.get(key);
    if (!g || g.plate !== plate) pending.set(key, g = { plate, cells: new Map(), frontKm: 0 });
    g.frontKm = Math.max(g.frontKm, frontKm);
    cells.forEach((c, i) => {
        const w = (typeof works === 'number' ? works : works[i]) * share;
        if (w > 0) g.cells.set(c, (g.cells.get(c) ?? 0) + w);
    });
}

/** Every farFieldEveryMyr, spread the pushes gathered since over their plates. @returns {number} 0 (records only) */
export function evolveFarField(world, dt) {
    world.farClock = (world.farClock ?? 0) + dt;
    if (world.farClock < world.config.farFieldEveryMyr - 1e-9) return 0;
    const window = world.farClock;                          // (the Myr these pushes were gathered over)
    world.farClock = 0;
    const pending = world.farPending;
    if (!pending?.size) return 0;
    for (const g of [...pending.values()].sort((a, b) => a.plate.id - b.plate.id)) {
        if (!g.plate.alive) continue;
        const push = spreadPush(world, g.plate, g.cells, g.frontKm, world.time);
        if (world.config.farReactivate > 0) reactivate(world, g.plate, push, window);
    }
    pending.clear();
    return 0;
}

const REACTIVATES = CrustFlag.SUTURE | CrustFlag.FAILED_RIFT;      // (a rift margin soaks the push up too, but is a coast: no range)

/**
 * Where a push lands on an old weak line far from its front, the line is squeezed up again: an INTRAPLATE belt along it
 * (records only, like every belt) — the Tian Shan on its Paleozoic suture behind the Tarim block, the Ancestral Rockies,
 * an aulacogen inverted into a ridge (Raimondo et al. 2014). Its work: the push the cell took × how squarely the push
 * meets the line (cos² of the angle to the line's normal: struck head-on it thrusts, struck along its length it mostly
 * slides) × farReactivate, less farReactMinKmPerMyr × the time since the last spread (a weak push does not stir it, however
 * long it lasts — the yield strength); only from farNearKm of the front on (nearer, the front's own belts are at work),
 * eased in. The range is wider the harder it was pushed.
 */
function reactivate(world, plate, push, window) {
    const cfg = world.config, { mesh } = world, { xyz } = mesh, crust = plate.crust, { type, flags } = crust;
    const sources = [], works = [];
    for (let i = 0; i < push.cells.length; i++) {
        const c = push.cells[i];
        if (!(flags[c] & REACTIVATES) || type[c] === CrustType.CRATON) continue;
        // (a line inside a belt still at work — another front's — is that belt's: only a quiet one is squeezed up again)
        const o = crust.oroType[c];
        if (o && o !== OrogenyType.INTRAPLATE && world.time - crust.oroLast[c] < cfg.orogenyQuietMyr) continue;
        const far = smoothstep((push.dist[i] - cfg.farNearKm) / cfg.farNearKm);
        if (!(far > 0)) continue;
        // the push's direction here (away from the front cell it came from) against the line's strike
        const s = push.from[i];
        if (s < 0 || s === c) continue;
        const px = xyz[3 * c], py = xyz[3 * c + 1], pz = xyz[3 * c + 2], k = px * xyz[3 * s] + py * xyz[3 * s + 1] + pz * xyz[3 * s + 2];
        let ax = k * px - xyz[3 * s], ay = k * py - xyz[3 * s + 1], az = k * pz - xyz[3 * s + 2];
        const al = Math.hypot(ax, ay, az) || 1;
        ax /= al; ay /= al; az /= al;
        const t = lineStrike(crust, mesh, c);
        const along = t ? ax * t[0] + ay * t[1] + az * t[2] : 0, square = 1 - along * along;
        const w = push.inc[i] * square * far * cfg.farReactivate - cfg.farReactMinKmPerMyr * window;
        if (w > 0) { sources.push(c); works.push(w); }
    }
    if (!sources.length) return;
    const [narrow, wide] = cfg.farBeltKm;
    // (its relief is uplift and crests: a basement block thrust up, the crust not thickened — a root stacked on whatever
    // thick crust lay there stood 13 km high where a reactivated line ran through an old plateau)
    spreadBelt(plate, mesh, sources, { type: OrogenyType.INTRAPLATE, time: world.time, works, noRoot: true,
        widths: works.map(w => narrow + (wide - narrow) * Math.tanh(w / cfg.farBeltWorkKm)) }, cfg);
}

/** The strike of the weak line through `c`: the long axis of the weak cells within two rings of it (null if too few). */
function lineStrike(crust, mesh, c) {
    const { xyz, adjOffset, adjList } = mesh, { mask, flags } = crust;
    const near = [c], seen = new Set(near);
    for (let ring = 0, from = 0; ring < 2; ring++) {
        const to = near.length;
        for (let i = from; i < to; i++) for (let k = adjOffset[near[i]]; k < adjOffset[near[i] + 1]; k++) {
            const q = adjList[k];
            if (!seen.has(q) && mask[q] && (flags[q] & REACTIVATES)) { seen.add(q); near.push(q); }
        }
        from = to;
    }
    if (near.length < 4) return null;
    const p = [xyz[3 * c], xyz[3 * c + 1], xyz[3 * c + 2]], up = Math.abs(p[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
    let e = [up[1] * p[2] - up[2] * p[1], up[2] * p[0] - up[0] * p[2], up[0] * p[1] - up[1] * p[0]];
    const el = Math.hypot(...e); e = [e[0] / el, e[1] / el, e[2] / el];
    const n = [p[1] * e[2] - p[2] * e[1], p[2] * e[0] - p[0] * e[2], p[0] * e[1] - p[1] * e[0]];
    let su = 0, sv = 0, suu = 0, svv = 0, suv = 0;
    for (const q of near) {
        const u = xyz[3 * q] * e[0] + xyz[3 * q + 1] * e[1] + xyz[3 * q + 2] * e[2], v = xyz[3 * q] * n[0] + xyz[3 * q + 1] * n[1] + xyz[3 * q + 2] * n[2];
        su += u; sv += v; suu += u * u; svv += v * v; suv += u * v;
    }
    const m = near.length, cuu = suu / m - (su / m) ** 2, cvv = svv / m - (sv / m) ** 2, cuv = suv / m - (su / m) * (sv / m);
    const th = 0.5 * Math.atan2(2 * cuv, cuu - cvv), ct = Math.cos(th), st = Math.sin(th);
    return [e[0] * ct + n[0] * st, e[1] * ct + n[1] * st, e[2] * ct + n[2] * st];
}

const smoothstep = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

const scratch = { dist: null, from: null, heap: null };

/**
 * Spread one front's push over `plate`: from `sources` (raster cell → km), through the plate's crust — a craton passes it
 * on (farCratonCost per km), a weak line soaks it up (farWeakCost) — fading as exp(−cost / L), L = farReachKm for a front
 * farFrontRefKm long. Each land cell reached records what reaches it and turns its axis toward the direction away from
 * the front cell the push came from. @returns {{cells: number[], inc: Float32Array, from: Int32Array, dist: Float64Array}}
 * the land cells reached and what each took up of it (× farTake: what a push raises — reactivate)
 */
export function spreadPush(world, plate, sources, frontKm, time) {
    const cfg = world.config, { mesh } = world, { xyz, adjOffset, adjList } = mesh, crust = plate.crust;
    const { mask, type, flags } = crust, n = mask.length;
    if (!scratch.dist || scratch.dist.length !== n) { scratch.dist = new Float64Array(n).fill(Infinity); scratch.from = new Int32Array(n).fill(-1); scratch.heap = new MinHeap(4096); }
    const { dist, from, heap } = scratch;
    const L = cfg.farReachKm * Math.min(1.6, Math.max(0.5, Math.sqrt(frontKm / cfg.farFrontRefKm)));
    let W = 0;
    for (const [c, w] of sources) if (mask[c] && w > W) W = w;
    const reached = [];
    if (!(W > 0)) return { cells: [], inc: null, from, dist };
    // a weaker front cell starts behind: −L·ln(w / W) — so the cost reached is that of the strongest push arriving
    for (const [c, w] of sources) {
        if (!mask[c] || !(w > 0)) continue;
        const d = -L * Math.log(w / W);
        if (d < dist[c]) { dist[c] = d; from[c] = c; heap.push(d, c); }
    }
    const maxKm = cfg.farMaxKm;
    while (heap.size) {
        const c = heap.pop(), dc = heap.lastKey;
        if (dc > dist[c]) continue;
        reached.push(c);
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
            const nb = adjList[k];
            if (!mask[nb]) continue;
            const f = type[nb] === CrustType.CRATON ? cfg.farCratonCost : (flags[nb] & WEAK) ? cfg.farWeakCost : 1;
            const d = dc + cellDistanceKm(xyz, c, nb) * f;
            if (d >= dist[nb] || d > maxKm) continue;
            dist[nb] = d; from[nb] = from[c];
            heap.push(d, nb);
        }
    }
    // record what reached each land cell (the record holds the push that REACHES it — smooth across a craton's edge or a
    // weak line, so the terrain can read its level lines, which run along the front: plans/V2_FAR_FIELD_PLAN.md F3–F4); what
    // each takes up of it (farTake: a craton little, a weak line more) is what a push raises
    const cells = [], inc = new Float32Array(reached.length);
    for (const c of reached) {
        if (type[c] === CrustType.OCEAN) continue;
        const reach = W * Math.exp(-dist[c] / L);
        if (!(reach > 1e-4)) continue;
        inc[cells.length] = reach * farTake(cfg, type[c], flags[c]);
        cells.push(c);
        recordPush(crust, c, reach, dist[c], xyz, from[c], time, cfg.farFoldMyr);
    }
    // (the scratch is reset for exactly the cells this spread touched, the caller having read what it needs first)
    const out = { cells, inc: inc.subarray(0, cells.length), from: Int32Array.from(cells, c => from[c]), dist: Float64Array.from(cells, c => dist[c]) };
    for (const c of reached) { dist[c] = Infinity; from[c] = -1; }
    return out;
}

/**
 * Crust cell `c` felt `felt` km of push from the front cell `src`, `distKm` of path cost away (raster cells of one plate,
 * so positions in its frame): add it to the whole and to the recent push (decayed to now), and draw its distance and its
 * axis toward the push's — the axis away from the front — each weighted by how much each push brought (sign-blind: an axis).
 */
export function recordPush(crust, c, felt, distKm, xyz, src, time, foldMyr) {
    const old = crust.farWork[c];
    crust.farWork[c] = old + felt;
    crust.farDist[c] = (crust.farDist[c] * old + distKm * felt) / (old + felt);
    crust.farFold[c] = crust.farFold[c] * Math.exp(-Math.max(0, time - crust.farAt[c]) / foldMyr) + felt;
    crust.farAt[c] = time;
    if (src < 0 || src === c) return;
    const px = xyz[3 * c], py = xyz[3 * c + 1], pz = xyz[3 * c + 2], qx = xyz[3 * src], qy = xyz[3 * src + 1], qz = xyz[3 * src + 2];
    const k = px * qx + py * qy + pz * qz;
    let ax = k * px - qx, ay = k * py - qy, az = k * pz - qz;                  // at p, pointing away from q
    const al = Math.hypot(ax, ay, az);
    if (al < 1e-9) return;
    ax /= al; ay /= al; az /= al;
    let vx = crust.farDx[c] / 127, vy = crust.farDy[c] / 127, vz = crust.farDz[c] / 127;
    if (vx * ax + vy * ay + vz * az < 0) { vx = -vx; vy = -vy; vz = -vz; }
    const x = vx * old + ax * felt, y = vy * old + ay * felt, z = vz * old + az * felt, l = Math.hypot(x, y, z) || 1;
    crust.farDx[c] = Math.round(127 * x / l); crust.farDy[c] = Math.round(127 * y / l); crust.farDz[c] = Math.round(127 * z / l);
}

/** The share of a push reaching it that a cell takes up (deforms by): a craton little, a weak line more. */
export function farTake(cfg, type, flags) {
    return type === CrustType.CRATON ? cfg.farCratonTake : (flags & WEAK) ? cfg.farWeakTake : 1;
}

/** A cell's recent push as of `time` (what folds the lithosphere now). */
export function recentPush(farFold, farAt, time, foldMyr) {
    return farFold > 0 ? farFold * Math.exp(-Math.max(0, time - farAt) / foldMyr) : 0;
}
