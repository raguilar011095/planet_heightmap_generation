// Terrain synthesis, stage 1 (Phase 8a): the TECTONIC SURFACE — the planet as its tectonic history built it,
// before rivers carve it (8b). WBP Part VIIc draws ranges "higher and broader than the target, since erosion
// removes material"; this is that drawing, done from the records:
//   · the sea floor from crust age (ridges, abyssal plains, fracture-zone steps), abyssal hills along the isochrons,
//     trenches with their outer rise, oceanic plateaus;
//   · continents on an isostatic platform (thickened crust floats high, and sinks back as a quiet belt's root
//     erodes), with shelves, slopes and coastal plains by kind of margin;
//   · mountain belts laid out across their width by kind and side (profiles.js), with parallel ridges along their
//     strike (stripes.js), and volcanoes (volcanoes.js).
// In km above sea level, on a terrain mesh of any resolution (terrain-mesh.js). The fine detail belongs to the crust:
// noise is read in the frame of the plate under each point, and ridges and volcanoes are keyed to crust cells
// (anchor.js), so a range keeps its detail as its plate moves.

import { TERRAIN } from './terrain-config.js';
import { deriveRecords, kindType, kindSide } from './records.js';
import { beltProfile, broadProfile, crestProfile, stripeZone, beltEdge, mainRangeBackKm } from './profiles.js';
import { buildStripeKernels, stripeAt, crossAt, beltAt, carriedField, carriedStripeAt } from './stripes.js';
import { lipPieces, dykeAt, lipPlumeAt } from './lips.js';
import { SEGMENT_KM } from '../tectonics/model/segments.js';
import { buildVolcanoes, coneAt, volcanoNoise } from './volcanoes.js';
import { cratonCharacter } from './cratons.js';
import { BeltSide, CrustType } from '../tectonics/model/crust.js';
import { sampleOnto, warpField, warpPoint } from './terrain-mesh.js';
import { buildAnchor, plateFramePoint, plateToWorld, rasterToWorld } from './anchor.js';
import { locate } from '../core/mesh-locate.js';
import { rainAtLatitude } from './terrain-config.js';
import { carveTerrain } from './carve.js';
import { terrainMesh } from './terrain-mesh.js';
import { FastNoise as SimplexNoise } from '../core/fast-noise.js';     // (bit-identical to V1's SimplexNoise, faster)

const R = 6371;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** A ridge's value (−1 valley … +1 crest) broken by a notch (0…1): lowered toward the valley floors, to −0.4 at 1. */
const broken = (v, notch) => notch > 0 && v > -0.4 ? v - notch * (v + 0.4) : v;
/** A push down, from `before` to `after`, eased into the floor `f` that keeps land above the sea: unchanged until within
 *  `m` of it, then e-folding toward it, never below it; ground already under the floor keeps its height (m = 0: a hard floor). */
const softFloor = (before, after, f, m) => after >= f + m ? after : Math.min(before, m > 0 ? f + m * Math.exp((after - f - m) / m) : Math.max(after, f));

/**
 * @param {import('../tectonics/snapshot.js').Frame} frame
 * @param {Object} simMesh      the mesh the frame lives on
 * @param {Object} tMesh        the terrain mesh (terrain-mesh.js)
 * @param {{cfg?: Object, seed?: number, sampler?: Object, parts?: boolean, carve?: boolean}} [opts]
 *        sampler: reuse sampleOnto()'s result for this (sim, terrain, seed); parts: also return the components;
 *        carve: let rivers carve it (Phase 8b) — heightKm is then the carved surface, tectonicKm the one before,
 *        drainage the drainage area (km², rain-weighted), receivers where each cell drains (−1 − s: into sea cell s)
 * @returns {{heightKm: Float32Array, parts: Object|null, rec: Object, ms: Object}}
 */
export function synthesizeTerrain(frame, simMesh, tMesh, opts = {}) {
    const cfg = opts.cfg ?? TERRAIN, seed = opts.seed ?? 0;
    const ms = {}, clock = () => performance.now();
    let t0 = clock();
    const plan = preparePlan(frame, simMesh, cfg, seed, tMesh.edgeKm);
    ms.records = clock() - t0; t0 = clock();
    const S = opts.sampler ?? sampleOnto(simMesh, tMesh, cfg, seed);
    ms.sample = clock() - t0; t0 = clock();
    const n = tMesh.numCells, heightKm = new Float32Array(n);
    const parts = opts.parts ? surfaceParts(n) : null;
    const carveIn = opts.carve ? carveInputs(n) : null;
    surfaceRange(plan, cfg, seed, tMesh.edgeKm, tMesh.xyz, S.cells, S.weights, 0, n, heightKm, parts, carveIn);
    ms.surface = clock() - t0;
    const out = { heightKm, parts, rec: plan.rec, sampler: S, ms, kernels: plan.Ks[0].count + plan.Ks[1].count, volcanoes: plan.V.count };
    if (!opts.carve) return out;
    t0 = clock();
    const C = carveTerrain(carveLadder(simMesh, tMesh, terrainMesh), { ...carveIn, z: heightKm }, carveSettings(cfg), settleFields(frame, simMesh, tMesh, cfg, seed));
    ms.carve = clock() - t0;
    return { ...out, heightKm: C.z, tectonicKm: heightKm, drainage: C.area, receivers: C.recv };
}

/** Per-terrain-cell arrays of the surface's components (platform — flood basalt included —, belt relief, ridges, cones, the flood basalt alone). */
export function surfaceParts(n) {
    return { platform: new Float32Array(n), relief: new Float32Array(n), stripes: new Float32Array(n), cones: new Float32Array(n), lip: new Float32Array(n), dcoast: new Float32Array(n), dshelf: new Float32Array(n), dplain: new Float32Array(n), dcoastRaw: new Float32Array(n) };
}

/** Per-terrain-cell arrays the surface pass fills for the carving (u, k, rain, micro, slope, inc; carve.js). */
export function carveInputs(n) {
    return { u: new Float32Array(n), k: new Float32Array(n), rain: new Float32Array(n), micro: new Float32Array(n), slope: new Float32Array(n), inc: new Float32Array(n), hold: new Float32Array(n),
        lip: new Float32Array(n), lipBase: new Float32Array(n), lipTop: new Float32Array(n), lipAge: new Float32Array(n), lipNoise: new Float32Array(n) };
}

/**
 * The surface the big rivers are settled on (terrain-config carveSettleCells): on a terrain mesh finer than that, the
 * carving's level of that many cells is given the surface synthesized there — exactly what that terrain detail itself
 * would carve — rather than the finer surface averaged onto it (which differs with the detail: a crest sampled or
 * missed, ridges drawn or faded), so the big rivers run the same ways at every terrain detail. null: nothing to give.
 */
export function settleFields(frame, simMesh, tMesh, cfg, seed) {
    const cells = cfg.carveSettleCells ?? 0;
    if (!(cells > 0) || !(tMesh.numCells > 1.5 * cells) || !(cells > 1.5 * simMesh.numCells)) return null;
    const m = terrainMesh(cells), n = m.numCells, S = sampleOnto(simMesh, m, cfg, seed), plan = preparePlan(frame, simMesh, cfg, seed, m.edgeKm);
    const z = new Float32Array(n), f = carveInputs(n);
    surfaceRange(plan, cfg, seed, m.edgeKm, m.xyz, S.cells, S.weights, 0, n, z, null, f);
    return new Map([[n, { ...f, z }]]);
}

/**
 * The meshes the carving climbs, coarse to fine, a factor 4 apart: the sim mesh, then the terrain meshes between it and
 * the one carved (made by `meshOf(numCells)`), then that one.
 */
export function carveLadder(simMesh, tMesh, meshOf) {
    return [simMesh, ...ladderCells(simMesh.numCells, tMesh.numCells).map(meshOf), tMesh];
}

/** The terrain meshes' sizes between a sim mesh of `simCells` and a terrain mesh of `cells` on the carving's ladder. */
export const ladderCells = (simCells, cells) => [160000, 640000, 2500000].filter(c => c < cells * 0.9 && c > simCells * 1.5);

/** The carving's settings (the same on every mesh: carve.js scales the valleys to each mesh's cells). */
export function carveSettings(cfg) {
    return { timeMyr: cfg.carveTimeMyr, m: cfg.carveM, rounds: cfg.carveRounds, valleyKm: cfg.carveValleyKm, valleySides: cfg.carveValleySides ?? 0, activeHold: cfg.carveActiveHold, lipStepKm: cfg.lipStepKm, lipRiser: cfg.lipRiser,
        lipEdgeRetreat: cfg.lipEdgeRetreatKmPerMyr ?? 0, lipValleyRate: cfg.lipValleyKmPerMyr ?? 0, lipValleyAreaKm2: cfg.lipValleyAreaKm2 ?? 3000, lipWallKm: cfg.lipWallKm ?? 6, lipWallNoise: cfg.lipWallNoise ?? 0, lipStairShare: cfg.lipStairShare ?? 1, lipIncisionMyr: cfg.lipIncisionMyr ?? 0,
        lipEscarpDropKm: cfg.lipEscarpDropKm ?? null, lipValleyCutAreaKm2: cfg.lipValleyCutAreaKm2 ?? null, lipMesaMinKm2: cfg.lipMesaMinKm2 ?? 0,
        drownKm: cfg.drownKm ?? 0, drownDepthKm: cfg.drownDepthKm ?? 0, drownAreaKm2: cfg.drownAreaKm2, drownReliefKm: cfg.drownReliefKm, drownWiden: cfg.drownWiden ?? 0,
        riaKm: cfg.riaKm ?? cfg.drownKm ?? 0, riaDepthKm: cfg.riaDepthKm ?? cfg.drownDepthKm ?? 0, drownColdLat: cfg.drownColdLat,
        canyonKm: cfg.canyonKm ?? 0, canyonDepthKm: cfg.canyonDepthKm ?? 0, canyonAreaKm2: cfg.canyonAreaKm2 };
}

/**
 * Everything per frame that the surface pass reads — the records, each belt layer's ridge kernels (with their
 * resolution fade for a terrain mesh of `edgeKm` spacing) and the volcanoes. Small (sim-mesh sized): on the pool, one
 * worker builds it from the frame and hands it to the others (planToData).
 */
const BLEND = 11;
export function preparePlan(frame, simMesh, cfg, seed, edgeKm) {
    const A = buildAnchor(frame, simMesh), rec = deriveRecords(frame, simMesh, cfg, seed, A);
    // The current belt's envelope (the evolved uplift) and its thickened crust (the isostatic part of the platform) as each
    // sim cell samples them, and how high each stands against its profile there — the broad profile, and the thickening's
    // (1 − u²) across the belt (tectonics/step/orogeny.js): the terrain takes their SHAPES from the profiles at the point
    // (the smooth across-belt coordinate) and their heights from these ratios blended over the belt's kernels
    // (surfaceRange: envelopeCarry) — moving each by its height × (the profile at the point − the profile as the cells
    // sampled it): nothing counted twice, and where the cells sampled the profile well, nothing changes. Only cells that
    // clearly fit a profile give a ratio, capped at a belt's own height (a cell at a belt's edge holding an older belt's
    // uplift is not a tall belt) and at the most thickened crust's lift; a shield never thickens.
    {
        const L0 = rec.belts[0], n = simMesh.numCells;
        const envRatio = new Float32Array(n).fill(-1), envShape = new Float32Array(n), rootRatio = new Float32Array(n).fill(-1), rootShape = new Float32Array(n);
        for (let w = 0; w < n; w++) {
            const k = L0.kind[w];
            if (!k || !rec.land[w]) continue;
            // (the belt's own height: what the history builds its uplift toward — tectonics/step/heights.js beltReliefKm)
            const type = kindType(k), side = kindSide(k), p = broadProfile(type, side, L0.dKm[w], L0.reach[w]);
            const own = cfg.reliefKm[type] * (cfg.youngShare + (1 - cfg.youngShare) * Math.min(1, L0.reach[w] / cfg.fullReachKm[type]));
            envShape[w] = p;
            if (p > 0.25) envRatio[w] = Math.min(own, Math.max(0, rec.upliftKm[w] / p));
            if (frame.type[w] === CrustType.CRATON) continue;          // (a shield never thickens)
            const u = L0.dKm[w] / Math.max(40, L0.reach[w]), t = 1 - u * u;
            rootShape[w] = Math.max(0, t) * (1 - smooth(0.85, 1.05, u));
            if (t > 0.3) {
                const root = frame.rootKm[w] * (frame.type[w] === CrustType.ARC ? 0.25 : 1), iso = cfg.isoMaxKm * (1 - Math.exp(-root / cfg.isoScaleKm));
                rootRatio[w] = Math.min(cfg.isoMaxKm, iso / t);
            }
        }
        Object.assign(L0, { envRatio, rootRatio });
        rec.envShape = envShape; rec.rootShape = rootShape;
    }
    // where the crust each world cell shows lies this frame (a moved plate's raster cell, turned into the world): the cells'
    // blends below are read there, so they ride with the crust as the records do (Phase 9) — read at the world cells'
    // own centres, a moving plate's ranges changed width and height at the scale of its cells as it went
    const crustPos = new Float32Array(3 * simMesh.numCells);
    {
        const { xyz } = simMesh, m = A.mats;
        for (let w = 0; w < simMesh.numCells; w++) {
            const o = A.owner[w];
            if (o < 0 || !A.moved[o]) { crustPos[3 * w] = xyz[3 * w]; crustPos[3 * w + 1] = xyz[3 * w + 1]; crustPos[3 * w + 2] = xyz[3 * w + 2]; continue; }
            const r = A.cell[w], b = 9 * o, x = xyz[3 * r], y = xyz[3 * r + 1], z = xyz[3 * r + 2];
            crustPos[3 * w] = m[b] * x + m[b + 1] * y + m[b + 2] * z; crustPos[3 * w + 1] = m[b + 3] * x + m[b + 4] * y + m[b + 5] * z; crustPos[3 * w + 2] = m[b + 6] * x + m[b + 7] * y + m[b + 8] * z;
        }
    }
    const timeMyr = frame.time ?? 0, Ks = rec.belts.map((layer, i) => buildStripeKernels(layer, simMesh, cfg, seed + 7919 * i, A, timeMyr));
    // each belt cell's blend of its kind's kernels (stripes.js beltAt): its width, crest height and quiet time, its across
    // direction, how high its envelope and thickened crust stand — once per cell, read over the triangles by the terrain.
    // Interleaved, BLEND values a cell: [W, A, Q, cover, ax, ay, az, envelope weight, × its height, root weight, × its height]
    {
        const L0 = rec.belts[0], K = Ks[0], n = simMesh.numCells, xyz = crustPos, out = new Array(11).fill(0), B = new Float32Array(BLEND * n);
        if (K.count) for (let w = 0; w < n; w++) {
            if (!L0.kind[w]) continue;
            beltAt(K, w, xyz[3 * w], xyz[3 * w + 1], xyz[3 * w + 2], L0.kind[w], out);
            const o = BLEND * w;
            for (let i = 0; i < 7; i++) B[o + i] = out[i];
            B[o + 7] = out[7]; B[o + 8] = out[7] * out[8]; B[o + 9] = out[9]; B[o + 10] = out[9] * out[10];
        }
        L0.blend = B;
    }
    // each kernel's resolution fade (main and fine set) depends only on its wavelength and this mesh: computed once
    for (const K of Ks) {
        K.fade1 = Float64Array.from(K.wave, lam => smooth(cfg.minWavesPerCell, cfg.fullWavesPerCell, lam / edgeKm));
        K.fade2 = Float64Array.from(K.wave, lam => (cfg.stripeFineShare > 0 ? smooth(cfg.minWavesPerCell, cfg.fullWavesPerCell, lam / cfg.stripeFineRatio / edgeKm) : 0));
    }
    return { rec, Ks, A, V: buildVolcanoes(frame, rec, simMesh, cfg, seed, A, edgeKm), L: lipPieces(frame, simMesh, A), mesh: simMesh, timeMyr };
}

/**
 * A plan as plain data — no mesh, no noise objects — to send to another worker (terrain-pool.js: one worker builds each
 * frame's plan, the others receive it); planFromData(data, simMesh, seed) there gives back the same plan, bit for bit.
 */
export function planToData(plan) {
    const { mesh, carry, V: { noise, ...V }, ...rest } = plan;
    return { ...rest, V };
}
export function planFromData(data, simMesh, seed) {
    return { ...data, V: { ...data.V, noise: volcanoNoise(seed) }, mesh: simMesh };
}

// ── curved coasts: a coast-distance field read with each corner's slope ──
// Linear interpolation over a sim triangle draws a distance's lines straight across it: a coastline of the sim's cells,
// polygonal at high terrain detail (developer: "the coast can look a bit polygonal, especially on island arcs"). Read
// with each corner's slope instead — Σ wᵢ (dᵢ + ∇dᵢ · (q − pᵢ)), q the point on the triangle — the lines curve between
// the cells as the coast they measure does; at a cell it is still exactly the cell's distance, along a triangle's edge
// it depends on that edge's two cells only (no seams), and a field that is linear stays exactly linear. Far from any
// coast (every corner over 1000 km) the slope term fades out: nothing there needs it.

/** Each sim cell's slope of a coast-distance field (km per unit length on the unit sphere, 3 per cell): found once per
 *  plan and field, as it is asked for; the arrays kept between frames (one per plate raster, one for the world). */
const slopePool = new Map();
let slopeStamp = 0;
function slopeMemo(plan, mesh) {
    if (!plan._slopeStamp) {
        plan._slopeStamp = ++slopeStamp;
        // (a plate unseen for two plans lets its arrays go: new plates keep coming over a long history)
        for (const [key, m] of slopePool) if (m.stamp < slopeStamp - 2) slopePool.delete(key);
    }
    const stamp = plan._slopeStamp, n = mesh.numCells;
    return {
        of(key, field, range = false) {
            let m = slopePool.get(key);
            if (!m || m.mark.length !== n) slopePool.set(key, m = { grad: new Float32Array(3 * n), mark: new Uint32Array(n), stamp: 0, field: null, round: 0, lo: range ? new Float32Array(n) : null, hi: range ? new Float32Array(n) : null });
            if (m.stamp !== stamp || m.field !== field) { m.stamp = stamp; m.field = field; if (++m.round === 0xFFFFFFFF) { m.mark.fill(0); m.round = 1; } }
            return m;
        },
    };
}
/** The slope of `field` at cell c: a least-squares plane through its neighbours (those the field has), in the tangent
 *  plane — capped at 1.25 km per km for a distance (it rises about 1 km per km: a steeper fit is the field's crease along
 *  a coast's middle line, not a slope; m.cap), and, for m.range, the least and most of the cell and its neighbours. */
function slopeAt(mesh, m, field, c) {
    if (m.mark[c] === m.round) return;
    m.mark[c] = m.round;
    if (m.lo) {
        let lo = field[c], hi = lo;
        for (let k = mesh.adjOffset[c]; k < mesh.adjOffset[c + 1]; k++) { const v = field[mesh.adjList[k]]; if (v < lo) lo = v; if (v > hi) hi = v; }
        m.lo[c] = lo; m.hi[c] = hi;
    }
    const { xyz, adjOffset, adjList } = mesh, x = xyz[3 * c], y = xyz[3 * c + 1], z = xyz[3 * c + 2], v = field[c];
    // a tangent basis: e ⟂ p (from whichever axis is further from p), n = p × e
    let ex, ey, ez;
    if (Math.abs(z) < 0.9) { ex = -y; ey = x; ez = 0; } else { ex = 0; ey = -z; ez = y; }
    const el = Math.hypot(ex, ey, ez); ex /= el; ey /= el; ez /= el;
    const nx = y * ez - z * ey, ny = z * ex - x * ez, nz = x * ey - y * ex;
    let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0, count = 0;
    for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
        const q = adjList[k], fq = field[q];
        if (fq !== fq) continue;
        const dx = xyz[3 * q] - x, dy = xyz[3 * q + 1] - y, dz = xyz[3 * q + 2] - z;
        const u = dx * ex + dy * ey + dz * ez, w = dx * nx + dy * ny + dz * nz, dv = fq - v;
        a11 += u * u; a12 += u * w; a22 += w * w; b1 += u * dv; b2 += w * dv; count++;
    }
    const det = a11 * a22 - a12 * a12, g = m.grad;
    if (count < 2 || !(Math.abs(det) > 1e-18) || v !== v) { g[3 * c] = g[3 * c + 1] = g[3 * c + 2] = 0; return; }
    let ge = (a22 * b1 - a12 * b2) / det, gn = (a11 * b2 - a12 * b1) / det;
    const len = Math.hypot(ge, gn), cap = m.lo ? Infinity : 1.25 * R;
    if (len > cap) { ge *= cap / len; gn *= cap / len; }
    g[3 * c] = ge * ex + gn * nx; g[3 * c + 1] = ge * ey + gn * ny; g[3 * c + 2] = ge * ez + gn * nz;
}
/**
 * A world field read over three cells with weights na, nb, nc (any: the platform's noisy shares), each corner's value
 * carried to the point along its slope and kept within its cell's neighbourhood range (m.lo … m.hi) — curved between the
 * cells, no overshoot at a steep front, seamless along an edge (a corner's reading does not depend on the triangle);
 * `k` blends it with the plain weighted mean (0: that mean). The point: the cells' positions, by the weights wa, wb, wc.
 */
function curvedRead(mesh, m, field, a, b, c, na, nb, nc, wa, wb, wc, k) {
    const sum = na + nb + nc;
    if (!(sum > 0)) return 0;
    const flat = (na * field[a] + nb * field[b] + nc * field[c]) / sum;
    if (!(k > 0)) return flat;
    slopeAt(mesh, m, field, a); slopeAt(mesh, m, field, b); slopeAt(mesh, m, field, c);
    const X = mesh.xyz, g = m.grad;
    const qx = wa * X[3 * a] + wb * X[3 * b] + wc * X[3 * c], qy = wa * X[3 * a + 1] + wb * X[3 * b + 1] + wc * X[3 * c + 1], qz = wa * X[3 * a + 2] + wb * X[3 * b + 2] + wc * X[3 * c + 2];
    const at = i => Math.min(m.hi[i], Math.max(m.lo[i], field[i] + g[3 * i] * (qx - X[3 * i]) + g[3 * i + 1] * (qy - X[3 * i + 1]) + g[3 * i + 2] * (qz - X[3 * i + 2])));
    return flat + k * ((na * at(a) + nb * at(b) + nc * at(c)) / sum - flat);
}

/** The slope term of reading `field` at the point with barycentric weights wa, wb, wc on cells a, b, c. */
function curveOf(mesh, m, field, a, b, c, wa, wb, wc) {
    const near = Math.min(Math.abs(field[a]), Math.abs(field[b]), Math.abs(field[c]));
    if (!(near < 1000)) return 0;
    slopeAt(mesh, m, field, a); slopeAt(mesh, m, field, b); slopeAt(mesh, m, field, c);
    const X = mesh.xyz, g = m.grad;
    const qx = wa * X[3 * a] + wb * X[3 * b] + wc * X[3 * c], qy = wa * X[3 * a + 1] + wb * X[3 * b + 1] + wc * X[3 * c + 1], qz = wa * X[3 * a + 2] + wb * X[3 * b + 2] + wc * X[3 * c + 2];
    const ta = g[3 * a] * (qx - X[3 * a]) + g[3 * a + 1] * (qy - X[3 * a + 1]) + g[3 * a + 2] * (qz - X[3 * a + 2]);
    const tb = g[3 * b] * (qx - X[3 * b]) + g[3 * b + 1] * (qy - X[3 * b + 1]) + g[3 * b + 2] * (qz - X[3 * b + 2]);
    const tc = g[3 * c] * (qx - X[3 * c]) + g[3 * c + 1] * (qy - X[3 * c + 1]) + g[3 * c + 2] * (qz - X[3 * c + 2]);
    return (wa * ta + wb * tb + wc * tc) * smooth(1000, 700, near);
}

/**
 * The tectonic surface for terrain cells from…to−1: positions from `xyz`, sim-mesh corners and weights from sCells /
 * sWeights (sampleOnto), heights into heightKm (and the components into `parts`, the carving's inputs into `carve`,
 * the world cell whose record each point shows into `recCell`, if given) — all indexed alike. Every cell depends only
 * on its own position and the plan, so any split of the cells gives the same heights.
 */
export function surfaceRange(plan, cfg, seed, edgeKm, xyz, sCells, sWeights, from, to, heightKm, parts = null, carve = null, recCell = null) {
    const { rec, Ks, V, A, L, mesh: simMesh } = plan, { cell } = A, p = [0, 0, 0], d = [0, 0, 0], cross = [0, 0];
    const warpN = warpField(seed, cfg, simMesh.edgeKm), loc3 = [0, 0, 0], locw3 = [0, 0, 0], local = [0, 0, 0], warped = [0, 0, 0], r3 = [0, 0, 0], rw3 = [0, 0, 0], q3 = [0, 0, 0], qw3 = [0, 0, 0];
    const anchorOn = cfg.anchorRecords !== false;
    // the point located on plate o's raster (the point in o's frame, warped there): raster cells into cells, weights into weights
    const onRaster = (o, px, py, pz, cells, weights) => {
        const m = A.mats, b = 9 * o;
        local[0] = m[b] * px + m[b + 3] * py + m[b + 6] * pz; local[1] = m[b + 1] * px + m[b + 4] * py + m[b + 7] * pz; local[2] = m[b + 2] * px + m[b + 5] * py + m[b + 8] * pz;
        warpPoint(warpN, cfg, local[0], local[1], local[2], warped);
        locate(simMesh, warped[0], warped[1], warped[2], cells, weights);
    };
    const noise = new SimplexNoise(seed * 31 + 9);
    // Fine detail renews (detailRenewMyr): time runs in epochs of that length, and over each a renewing field fades from
    // one noise to the next — cos/sin weights, the two independent, so its spread never dips — steady from frame to
    // frame, new after an epoch or two. At time 0 (and with no renewal), exactly the field it replaced.
    const renewT = cfg.detailRenewMyr > 0 ? (plan.timeMyr ?? 0) / cfg.detailRenewMyr : 0, epoch = Math.floor(renewT);
    const fadeA = Math.cos((renewT - epoch) * Math.PI / 2), fadeB = Math.sin((renewT - epoch) * Math.PI / 2), offA = 57.31 * epoch, offB = 57.31 * (epoch + 1);
    const renewed = (fx, fy, fz, octaves) => {
        const a = noise.fbm(fx + offA, fy + offA, fz + offA, octaves, 0.5);
        return fadeB > 0 ? fadeA * a + fadeB * noise.fbm(fx + offB, fy + offB, fz + offB, octaves, 0.5) : a;
    };
    const fade = lam => smooth(cfg.minWavesPerCell, cfg.fullWavesPerCell, lam / edgeKm);
    // the coast's fine detail: its octaves (frequency, amplitude) down to what this terrain mesh can show
    const detailF = [], detailAmp = [];
    for (let o = 0, lam = cfg.coastDetailFromKm ?? 0; lam > 0 && o < 8; o++, lam /= 2) {
        const amp = (cfg.coastDetailKm ?? 0) * (cfg.coastDetailRoughness ?? 0.6) ** o * fade(lam);
        if (!(amp > 0.05)) break;
        detailF.push(R / lam); detailAmp.push(amp);
    }
    // the coast at the sim's own scale (developer, 2026-10-18: "obvious 'gridded' effects … on the coastline" at 20K and
    // 40K): the coast is the zero line of a distance read over the plates' cells, so it ran as a chain of rounded lobes all
    // about one cell across — and the coast noise above (45 km) and the fine detail (7 km) could not break lobes of ~150 km.
    // Octaves from coastCellWaveCells sim cells down, moving the coast in and out by up to coastCellNoise of a cell: in
    // sim cells, so a coarse mesh's lobes are broken as much as a fine one's; down to what this terrain mesh can show
    const cellCoastF = [], cellCoastAmp = [], simEdge = simMesh.edgeKm, cellCoastReach = 3 * simEdge;
    for (let o = 0, lam = (cfg.coastCellWaveCells ?? 0) * simEdge; lam > 0 && o < 5; o++, lam /= 2) {
        const amp = (cfg.coastCellNoise ?? 0) * simEdge * (cfg.coastDetailRoughness ?? 0.6) ** o * fade(lam);
        if (!(amp > 0.5)) break;
        cellCoastF.push(R / lam); cellCoastAmp.push(amp);
    }
    // the hills' octaves (frequency, amplitude) down to what this terrain mesh can show; the arcs' island noise
    const hillsF = [], hillsAmp = [];
    for (let o = 0, lam = cfg.hillsFromKm ?? 0; lam > 0 && o < 8; o++, lam /= 2) {
        const amp = (cfg.hillsKm ?? 0) * (cfg.hillsRoughness ?? 0.6) ** o * fade(lam);
        if (!(amp > 0.001)) break;
        hillsF.push(R / lam); hillsAmp.push(amp);
    }
    const islandF = R / Math.max(1, cfg.arcIslandKm ?? 140), strait = cfg.arcStraitKm ?? 0;
    const renewedNoise = (u, v, w) => fadeB > 0 ? fadeA * noise.noise3D(u + offA, v + offA, w + offA) + fadeB * noise.noise3D(u + offB, v + offB, w + offB) : noise.noise3D(u + offA, v + offA, w + offA);
    const coastCurve = cfg.coastCurve ?? 0, mountainCurve = cfg.mountainCurve ?? 0, crestFollow = cfg.crestFollow ?? 0;
    // (a belt's width, crest height and age blended over its kernels; its envelope's shape from the profile at the point;
    // its crests rising and falling along the strike only — read at the point moved back across the belt onto its front)
    const beltCarry = cfg.beltCarry ?? 0, envelopeCarry = cfg.envelopeCarry ?? 0, crestAlongVar = cfg.crestAlongVar ?? 0, crestAlongF = R / (cfg.crestAlongKm ?? 300);
    const bw = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], frontP = [0, 0, 0], A_ = A;   // (A_: in the belt loop below, A is a crest height)

    const slopes = coastCurve > 0 || mountainCurve > 0 ? slopeMemo(plan, simMesh) : null, crossC = [0, 0];
    const cratF = R / 600, shapeF = R / cfg.cratonShapeKm, grainF = R / cfg.cratonGrainScaleKm, grainShow = fade(cfg.cratonGrainScaleKm), grainStretch = cfg.cratonGrainStretch ?? 1;
    const coastF = R / 700, platF = R / 2000, strikeF = R / 900, segF = R / cfg.stripeSegmentKm, meanderF = R / cfg.stripeMeanderAlongKm, meander = cfg.stripeMeanderKm / R;
    const blendF = R / cfg.blendNoiseKm, crestF = R / 150, slopeF = R / 300, microF = R / cfg.carveMicroScaleKm, lipNoiseF = R / cfg.lipWallNoiseKm;
    // (a flood basalt's edge: the pile thinning out over lipFeatherKm inside it, the line wandering by lipEdgeNoiseKm as
    // flow lobes do; its plume's dome and shields — lips.js lipPlumeAt)
    const lipFeather = cfg.lipFeatherKm ?? 0, lipEdgeF = R / (cfg.lipEdgeNoiseScaleKm ?? 120), lipEdgeAmp = cfg.lipEdgeNoiseKm ?? 0, plume = { dome: 0, shield: 0 };
    // old ranges erode fatter; every belt's massif texture (terrain-config.js crestSpreadKm, massifKm): its octaves'
    // wavelengths and shares, down to what the mesh can show
    const spreadOn = (cfg.crestSpreadKm ?? 0) > 0, fineR2 = (cfg.stripeFineRatio ?? 2.6) ** 2 - 1, PI2x2 = 2 * Math.PI * Math.PI;
    // (every crest spread by at least crestBaseKm; crests made rugged by a ridged fractal: no crest is a line)
    const gBase = 2 * (cfg.crestBaseKm ?? 0) ** 2, rugged = cfg.crestRugged ?? 0;
    const lowGain = cfg.stripeLowGain ?? 1;                  // (the ridges' troughs deeper than their crests are high)
    // (broken ridgelines, cfg.ridgeBreak: how broken by kind of belt, least along the main range)
    const breakOn = !!cfg.ridgeBreak && Object.values(cfg.ridgeBreak).some(v => v > 0), breakFront = cfg.ridgeBreakFront ?? 1;
    // (old ranges keep their grain, cfg.oldGrainMyr: textures drawn out along the strike, ridges stronger, rock banded)
    const oldOn = (cfg.oldGrainMyr ?? 0) > 0, oldHillsStretch = cfg.oldHillsStretch ?? 4;
    const massL = [], massA = [];
    if ((cfg.massifShare ?? 0) > 0 || (cfg.massifWornShare ?? 0) > 0) {
        let norm = 0;
        for (let o = 0, lam = cfg.massifKm, a = 1; o < 7; o++, lam /= 2, a *= cfg.massifRoughness) norm += a;
        for (let o = 0, lam = cfg.massifKm, a = 1; o < 7; o++, lam /= 2, a *= cfg.massifRoughness) { const sh = a * fade(lam) / norm; if (sh > 1e-3) { massL.push(lam); massA.push(sh); } }
    }
    // a corner's share, scaled by a noise field of its own (decorrelated per crust cell, continuous across triangles)
    const noisy = (c, w) => { const r = cell[c]; return w * Math.exp(cfg.blendNoise * noise.fbm(x0 * blendF + (r % 101) * 1.37, y0 * blendF + (r % 89) * 2.11, z0 * blendF + (r % 83) * 0.73, 3, 0.5) * 1.6); };
    let x0 = 0, y0 = 0, z0 = 0;
    // the floor a push down eases into (terrain-config.js landFloorKm): rolling — its octaves down to what the mesh can
    // show, read in the crust's frame, once a point needs it (0 … 1) — and more so the deeper the push would have gone
    const floorKm = cfg.landFloorKm ?? 0.02, floorRoll = cfg.landFloorRollKm ?? 0, floorDeep = cfg.landFloorDeepKm ?? 0, floorDeepAt = cfg.landFloorDeepAtKm ?? 0.3, floorSoft = cfg.landFloorSoftKm ?? 0;
    const floorF = [], floorA = [];
    if (floorRoll > 0 || floorDeep > 0) {
        let norm = 0;
        for (let o = 0, lam = cfg.landFloorScaleKm ?? 240, a = 1; o < 6; o++, lam /= 2, a *= cfg.landFloorRoughness ?? 0.6) {
            norm += a;
            if (a * fade(lam) > 0.02) { floorF.push(R / lam); floorA.push(a * fade(lam)); }
        }
        for (let o = 0; o < floorA.length; o++) floorA[o] /= norm;
    }
    let floorHere = -1;
    const floorNoise = () => {
        if (floorHere >= 0) return floorHere;
        let v = 0;
        for (let o = 0; o < floorF.length; o++) { const f = floorF[o]; v += floorA[o] * renewedNoise(x0 * f + 5.7 + 1.3 * o, y0 * f + 9.1 + 2.9 * o, z0 * f + 2.3 + 0.7 * o); }
        return (floorHere = 0.5 + 0.5 * Math.max(-1, Math.min(1, 2 * v)));
    };
    const floorFor = after => floorKm + (floorRoll > 0 || floorDeep > 0 ? (floorRoll + floorDeep * Math.min(1, Math.max(0, floorKm - after) / floorDeepAt)) * floorNoise() : 0);
    const { cratons: CR, terrane } = rec;
    const { coastKm, land, arc: arcCrust, craton, quietMyr, kind: beltKind, riverIncKm, platformKm, upliftKm, lipKm, lipWornKm, lipSrc, lipBornMyr, lipEdgeKm, lipOutKm, depthKm, shelfKm, plainKm, maturity, slopeKm, ageMyr, fabricKm, trenchKm, riseKm, trenchDepthKm, armKm, fractureU, coastFresh, envShape, rootShape, farGrain, farFold, farPhase } = rec;
    // the far field (records.js farFieldRecords; plans/V2_FAR_FIELD_PLAN.md F3–F4): its folds and the grain it leaves, both
    // read as noise ACROSS its phase — near enough the distance from the fronts that pushed the crust — and slowly along it
    const farOn = !!farPhase, foldStretch = cfg.farFoldStretch ?? 1, foldWanderF = R / (cfg.farFoldWanderKm ?? 800);
    // (the grain's drawn-out noise: farGrainStretch times longer along the phase's level lines than across, the same
    // feature size on average — read at p·f + φ·c, the phase φ running across the fronts — over its broadest
    // farGrainOctaves octaves of the platform's four)
    const farK = Math.sqrt(Math.max(1, cfg.farGrainStretch ?? 1)), farF = platF / farK, farC = (farK - 1 / farK) * platF / R;
    const farOct = farK > 1 ? Math.max(0, Math.min(4, cfg.farGrainOctaves ?? 2)) : 0;
    /** The phase at a point: its corners' that the push reached, blended (a corner it did not — the sea — would bend the
     *  level lines toward the coast); −1 where none did. */
    const phaseAt = (c0, c1, c2, w0, w1, w2) => {
        let p = 0, ws = 0;
        if (farGrain[c0] > 0) { p += w0 * farPhase[c0]; ws += w0; }
        if (farGrain[c1] > 0) { p += w1 * farPhase[c1]; ws += w1; }
        if (farGrain[c2] > 0) { p += w2 * farPhase[c2]; ws += w2; }
        return ws > 0 ? p / ws : -1;
    };
    const kinds = [0, 0, 0], wts = [0, 0, 0], nts = [0, 0, 0];
    // carried ridges (cfg.stripeCarry, stripes.js): each belt layer's sums at the corners of the rasters, kept on the plan
    // (a worker's chunks share them); a point's corners on the raster of the plate under it
    const carry = cfg.stripeCarry ? (plan.carry ??= new Map()) : null, cr3 = [0, 0, 0], cw3 = [0, 0, 0];
    let carryO = -1;

    for (let t = from; t < to; t++) {
        let c0 = sCells[3 * t], c1 = sCells[3 * t + 1], c2 = sCells[3 * t + 2];
        let w0 = sWeights[3 * t], w1 = sWeights[3 * t + 1], w2 = sWeights[3 * t + 2];
        const px = xyz[3 * t], py = xyz[3 * t + 1], pz = xyz[3 * t + 2];
        // (the world cell nearest the point itself: what can reach it — ridge kernels, volcanoes — is listed by it, near-lists.js;
        // a sampling corner can lie two cells off once the lookup is warped and anchored)
        const cn = simMesh.index.nearest(px, py, pz);
        // ── the records are read over the plate's own raster, which rides with the crust (Phase 9, developer: steady
        // detail): the point, in the frame of the plate under it, warped there and located on the raster — its corners
        // are that plate's crust cells, shown this frame by the world cells nearest them. Interpolated over the fixed world
        // grid instead, a moving plate's coasts, belt edges and plains re-formed at the scale of its cells every frame.
        // (Where the point's corners belong to more than one plate, or a corner's crust is hidden, the world grid still.) ──
        const o = A.owner[c0];
        // the plate whose land is here — the coast is read on its raster, the sea beyond it included (a coastline belongs
        // to its continent) — or, with no land at the corners, the plate here
        let oc = o, best = -1;
        for (let j = 0; j < 3; j++) { const c = j === 0 ? c0 : j === 1 ? c1 : c2, wj = j === 0 ? w0 : j === 1 ? w1 : w2; if (land[c] && A.owner[c] >= 0 && wj > best) { best = wj; oc = A.owner[c]; } }
        let anchored = false, carried = false;
        if (anchorOn && o >= 0 && A.moved[o] && A.owner[c1] === o && A.owner[c2] === o) {
            onRaster(o, px, py, pz, r3, rw3);
            const a0 = rasterToWorld(A, simMesh, o, r3[0]), a1 = rasterToWorld(A, simMesh, o, r3[1]), a2 = rasterToWorld(A, simMesh, o, r3[2]);
            if (a0 >= 0 && a1 >= 0 && a2 >= 0) { c0 = a0; c1 = a1; c2 = a2; w0 = rw3[0]; w1 = rw3[1]; w2 = rw3[2]; anchored = true; }
        }
        // (off the rasters — where the point's corners are two plates' — the warps ride with the crust too, as on a raster:
        // developer, "all this noise stays relatively consistent across history at the same location". The point is
        // warped in the frame of the plate of its heaviest corner, then located on the world grid; the cached world
        // sampler above only had the fixed, large-scale warp)
        if (anchorOn && !anchored && warpN.cell) {
            const od = A.owner[w0 >= w1 && w0 >= w2 ? c0 : w1 >= w2 ? c1 : c2];
            if (od >= 0) {
                const m = A.mats, b = 9 * od;
                local[0] = m[b] * px + m[b + 3] * py + m[b + 6] * pz; local[1] = m[b + 1] * px + m[b + 4] * py + m[b + 7] * pz; local[2] = m[b + 2] * px + m[b + 5] * py + m[b + 8] * pz;
                warpPoint(warpN, cfg, local[0], local[1], local[2], warped);
                locate(simMesh, m[b] * warped[0] + m[b + 1] * warped[1] + m[b + 2] * warped[2], m[b + 3] * warped[0] + m[b + 4] * warped[1] + m[b + 5] * warped[2],
                    m[b + 6] * warped[0] + m[b + 7] * warped[1] + m[b + 8] * warped[2], loc3, locw3);
                c0 = loc3[0]; c1 = loc3[1]; c2 = loc3[2]; w0 = locw3[0]; w1 = locw3[1]; w2 = locw3[2];
            }
        }
        let coastR = null, shelfR = 0, plainR = 0, matureR = 0, freshR = 0;
        if (anchorOn && oc >= 0 && A.moved[oc]) {
            const S = rec.coastRaster.get(oc);
            if (S) {
                if (!(anchored && oc === o)) { onRaster(oc, px, py, pz, q3, qw3); } else { q3[0] = r3[0]; q3[1] = r3[1]; q3[2] = r3[2]; qw3[0] = rw3[0]; qw3[1] = rw3[1]; qw3[2] = rw3[2]; }
                const s0 = S.coast[q3[0]], s1 = S.coast[q3[1]], s2 = S.coast[q3[2]];
                if (s0 === s0 && s1 === s1 && s2 === s2) {
                    coastR = qw3[0] * s0 + qw3[1] * s1 + qw3[2] * s2;
                    if (coastCurve > 0) coastR += coastCurve * curveOf(simMesh, slopes.of(oc, S.coast), S.coast, q3[0], q3[1], q3[2], qw3[0], qw3[1], qw3[2]);
                    shelfR = qw3[0] * S.shelf[q3[0]] + qw3[1] * S.shelf[q3[1]] + qw3[2] * S.shelf[q3[2]];
                    plainR = qw3[0] * S.plain[q3[0]] + qw3[1] * S.plain[q3[1]] + qw3[2] * S.plain[q3[2]];
                    matureR = qw3[0] * S.maturity[q3[0]] + qw3[1] * S.maturity[q3[1]] + qw3[2] * S.maturity[q3[2]];
                    freshR = qw3[0] * S.fresh[q3[0]] + qw3[1] * S.fresh[q3[1]] + qw3[2] * S.fresh[q3[2]];
                }
            }
        }
        // (x, y, z): where the point lies in the frame of the crust under it — every noise below is read there
        plateFramePoint(A, c0, c1, c2, w0, w1, w2, px, py, pz, p);
        const x = p[0], y = p[1], z = p[2];
        x0 = x; y0 = y; z0 = z; floorHere = -1;
        // (the coast distance: on the raster of the plate whose land is here, where it can be — records.js plateCoasts)
        let coast = coastR;
        if (coast === null) {
            coast = w0 * coastKm[c0] + w1 * coastKm[c1] + w2 * coastKm[c2];
            if (coastCurve > 0) coast += coastCurve * curveOf(simMesh, slopes.of(-1, coastKm), coastKm, c0, c1, c2, w0, w1, w2);
        }
        if (parts) parts.dcoastRaw[t] = coast;
        if (Math.abs(coast) < 600) coast += cfg.coastNoiseKm * renewed(x * coastF + 3.3, y * coastF + 1.1, z * coastF + 7.9, 4) * 1.5;
        if (cellCoastF.length && Math.abs(coast) < cellCoastReach) {
            let sum = 0;
            for (let o = 0; o < cellCoastF.length; o++) { const f = cellCoastF[o]; sum += cellCoastAmp[o] * renewedNoise(x * f + 41.3 + 3.1 * o, y * f + 17.9 + 1.7 * o, z * f + 29.3 + 2.9 * o); }
            // (weaker on a fresh coast — a young rift's two sides still fit, a fresh belt's shape leads — to coastFreshFloor)
            const fr = coastR !== null ? freshR : w0 * coastFresh[c0] + w1 * coastFresh[c1] + w2 * coastFresh[c2];
            coast += 1.6 * sum * smooth(cellCoastReach, 0.5 * cellCoastReach, Math.abs(coast)) * (1 - (1 - (cfg.coastFreshFloor ?? 1)) * fr);
        }
        // (the fine detail — renewing as the coast noise does — within 400 km of the coast, fading out from 250)
        if (detailF.length && Math.abs(coast) < 400) {
            let sum = 0;
            for (let o = 0; o < detailF.length; o++) {
                const f = detailF[o], u = x * f + 11.3 + 1.7 * o, v = y * f + 4.9 + 2.3 * o, w = z * f + 8.1 + 0.9 * o;
                sum += detailAmp[o] * (fadeB > 0 ? fadeA * noise.noise3D(u + offA, v + offA, w + offA) + fadeB * noise.noise3D(u + offB, v + offB, w + offB) : noise.noise3D(u + offA, v + offA, w + offA));
            }
            coast += sum * smooth(400, 250, Math.abs(coast));
        }
        // ── island arcs as chains: on arc crust, the coast lowered where the island noise is low — straits between islands ──
        if (strait > 0 && coast > -300 && coast < 400) {
            const arcS = w0 * arcCrust[c0] + w1 * arcCrust[c1] + w2 * arcCrust[c2];
            if (arcS > 0.02) {
                const isl = 0.7 * renewedNoise(x * islandF + 21.7, y * islandF + 5.3, z * islandF + 13.1) + 0.3 * renewedNoise(x * islandF * 2 + 3.9, y * islandF * 2 + 17.7, z * islandF * 2 + 9.4);
                // (the cut acts near the arc's coasts: a narrow young arc is cut right through into islands, a broad mature
                // one only has its coast indented — the interior of a Japan or a Java stays whole)
                // (a strait is shallow sea: the coast is lowered to the shelf's edge at most, never into the slope below it)
                const cut = Math.min(1, arcS) * strait * smooth(0.05, -0.45, isl) * smooth(120, 45, coast);
                coast = Math.max(coast - cut, Math.min(coast, -10));
            }
        }
        let h, platform = 0, relief = 0, stripes = 0, lipTop = 0, lipKeep = 0, lipAge = 0, ramp = 0, shieldS = 0, rimFade = 1, foldLow = 0, notchMax = 0, combOld = 0, combD = 0, grainNum = 0, grainDen = 0, lipPile = 0, lavaCover = 0, lavaBelow = 0;

        if (coast >= 0) {
            // ── land side: the platform over the land corners (interfingering), dropping to the shelf toward the coast ──
            const e0 = noisy(c0, w0), e1 = noisy(c1, w1), e2 = noisy(c2, w2);          // (each corner's noisy share, computed once)
            const n0 = land[c0] ? e0 : 0, n1 = land[c1] ? e1 : 0, n2 = land[c2] ? e2 : 0, lw = n0 + n1 + n2;
            platform = lw > 0 ? (mountainCurve > 0 ? curvedRead(simMesh, slopes.of(-2, platformKm, true), platformKm, c0, c1, c2, n0, n1, n2, w0, w1, w2, mountainCurve)
                : (n0 * platformKm[c0] + n1 * platformKm[c1] + n2 * platformKm[c2]) / lw) : cfg.continentKm;
            // (its basins and arches drawn out along the fronts that pushed it — the grain: the broad octaves fade over to
            // the drawn-out noise as the push taken up grows, keeping the noise's spread; with no push, the noise as before.
            // A fade, not a stretch growing with the push: a stretch would slide the noise as the push grew, frame to frame)
            const ph = farOn ? phaseAt(c0, c1, c2, w0, w1, w2) : -1;
            const fg = ph >= 0 ? w0 * farGrain[c0] + w1 * farGrain[c1] + w2 * farGrain[c2] : 0;
            if (fg > 1e-3 && farOct > 0) {
                const px = x * platF + 5.1, py = y * platF + 9.2, pz = z * platF + 2.4;
                const qx = x * farF + 5.1, qy = y * farF + 9.2, qz = z * farF + ph * farC + 2.4;
                const keep = (1 - fg) / Math.hypot(1 - fg, fg), drawn = fg / Math.hypot(1 - fg, fg);
                let sum = 0, amp = 1;
                for (let o = 0; o < 4; o++, amp *= 0.5) {
                    const f = 1 << o, n0 = noise.noise3D(px * f, py * f, pz * f);
                    sum += amp * (o < farOct ? keep * n0 + drawn * noise.noise3D(qx * f, qy * f, qz * f) : n0);
                }
                platform += cfg.platformNoiseKm * (sum / 1.875) * 1.5;
            } else platform += cfg.platformNoiseKm * noise.fbm(x * platF + 5.1, y * platF + 9.2, z * platF + 2.4, 4, 0.5) * 1.5;
            // (and the lithosphere's folds across a recent push: farFoldKm high, farFoldWavelengthKm apart across the fronts,
            // farFoldStretch times longer along them — over a craton further apart, as the push crosses it with little loss)
            const ff = ph >= 0 ? w0 * farFold[c0] + w1 * farFold[c1] + w2 * farFold[c2] : 0;
            if (ff > 1e-3 && cfg.farFoldKm > 0) {
                const lam = cfg.farFoldWavelengthKm, amp = cfg.farFoldKm * ff * fade(lam), f = R / lam / foldStretch, before = platform;
                // (the bands wander — by up to farFoldWander of a wavelength, over ~farFoldWanderKm — so they do not ring a
                // short front like ripples round a stone)
                const wander = cfg.farFoldWander * noise.noise3D(x * foldWanderF + 3.3, y * foldWanderF + 17.1, z * foldWanderF + 5.9);
                // (a trough deepens only ground that stands well above the sea — lowland near the coast hardly sinks: what a
                // fold lowered there, a basin or a foreland beside it could take under the sea; and never below 40 m)
                const fold = amp * 1.4 * noise.noise3D(x * f + 13.7, y * f + 4.2, z * f + ph / lam + wander + 8.9);
                platform += fold > 0 ? fold : fold * smooth(0.04, 0.3, before);
                if (platform < 0.04 && platform < before) platform = Math.min(before, 0.04);
                foldLow = Math.min(0, platform - before);                         // (given back below if a basin beside takes it under)
            }
            // ── a flood basalt (lips.js): the pile as it has worn, its top lowering a little as it wears and gone once worn
            // through — thinning out across the province's edge (the distance to it, signed, read over the corners; the line
            // wandering as flow lobes do) instead of standing there as a wall — and not added to the ground: it is laid on
            // as a level surface below (the lavas fill the land's lows and bury its texture), and the carving cuts it up
            // (carve.js stripBasalt: its escarpment retreating where its edge stands above lower ground, its rivers'
            // canyons widening into valleys — flat-topped mesas left on the divides) ──
            if (lipFeather > 0) {
                const a0 = lipKm[c0] > 0 ? n0 : 0, a1 = lipKm[c1] > 0 ? n1 : 0, a2 = lipKm[c2] > 0 ? n2 : 0, aw = a0 + a1 + a2;
                lipTop = aw > 0 ? (a0 * lipKm[c0] + a1 * lipKm[c1] + a2 * lipKm[c2]) / aw : 0;
            } else lipTop = lw > 0 ? (n0 * lipKm[c0] + n1 * lipKm[c1] + n2 * lipKm[c2]) / lw : 0;
            if (lipTop > 0.002) {
                let feather = 1;
                if (lipFeather > 0) {
                    const inside = (n0 * (lipEdgeKm[c0] - lipOutKm[c0]) + n1 * (lipEdgeKm[c1] - lipOutKm[c1]) + n2 * (lipEdgeKm[c2] - lipOutKm[c2])) / lw
                        + lipEdgeAmp * 1.6 * noise.fbm(x * lipEdgeF + 4.7, y * lipEdgeF + 9.3, z * lipEdgeF + 1.9, 3, 0.5);
                    feather = smooth(0, lipFeather, inside);
                }
                lipPile = lipTop * feather;
                const worn = (n0 * lipWornKm[c0] + n1 * lipWornKm[c1] + n2 * lipWornKm[c2]) / lw, p = worn / Math.max(0.15, lipTop);
                lipKeep = lipPile * (1 - cfg.lipWearFloor * Math.min(1, p)) * (1 - smooth(1, 1.5, p));
                lipAge = worn / cfg.lipWearKmPerMyr;           // (Myr of wear at the reference rate: its age, × its climate's erosion)
                if (!(lipFeather > 0)) platform += lipKeep;       // (as before: a slab on the ground)
            }
            // ── a craton (terrain/cratons.js): its edge a line — the signed distance to it, on the plate's own raster where
            // the point was read there, moved in and out by noise — not the sim cells' staircase; a range pressed against it
            // fading across its rim; a foreland bent into it by the range's weight; its character and grain ──
            // (on the raster where all three corners carry the plate's crust there — a corner it does not cover is NaN,
            // and the point then reads the world cells, as the coast does)
            const CRr = anchored ? CR.rasters.get(o) : null, dr = CRr?.depth;
            const CRo = dr && dr[r3[0]] === dr[r3[0]] && dr[r3[1]] === dr[r3[1]] && dr[r3[2]] === dr[r3[2]] ? CRr : null;
            const cDepth = CRo ? rw3[0] * CRo.depth[r3[0]] + rw3[1] * CRo.depth[r3[1]] + rw3[2] * CRo.depth[r3[2]]
                : anchored && !CRr ? -2000 : w0 * CR.depthW[c0] + w1 * CR.depthW[c1] + w2 * CR.depthW[c2];
            // (the corners' own share of craton; and whether the craton can matter here at all: more than 200 km outside
            // its edge, with no craton corner, the edge noise (|fbm| < 1: ≤ 105 km) cannot bring the line within the blend —
            // every term below is exactly 0)
            const cells = lw > 0 ? (n0 * craton[c0] + n1 * craton[c1] + n2 * craton[c2]) / lw : 0;
            if (cDepth > -200 || cells > 0) {
                const cLoad = CRo ? rw3[0] * CRo.load[r3[0]] + rw3[1] * CRo.load[r3[1]] + rw3[2] * CRo.load[r3[2]] : w0 * CR.loadW[c0] + w1 * CR.loadW[c1] + w2 * CR.loadW[c2];
                const cPatch = CRo ? Math.max(CRo.patch[r3[0]], CRo.patch[r3[1]], CRo.patch[r3[2]]) : Math.max(CR.patchW[c0], CR.patchW[c1], CR.patchW[c2]);
                const crN = cDepth + cfg.cratonEdgeNoiseKm * noise.fbm(x * cratF + 9.1, y * cratF + 3.7, z * cratF + 5.3, 3, 0.5) * 1.5;
                const whole = smooth(0.5 * cfg.cratonScrapKm, 1.5 * cfg.cratonScrapKm, cPatch);      // (a scrap reads as its surroundings)
                const before = platform;
                shieldS = smooth(-cfg.cratonBlendKm, cfg.cratonBlendKm, crN) * whole;
                // the shield's platform over the line: the corners' own share of it replaced by the line's
                platform += (cfg.cratonKm - cfg.continentKm) * (shieldS - cells);
                rimFade = 1 - whole * smooth(cfg.cratonRimInKm, cfg.cratonRimOutKm, crN);
                // the foreland: deepest just in front of the rim's thrusts, rising to a low forebulge (a stiff plate's flexure)
                if (cLoad > 0.002) {
                    const xf = (crN - cfg.forelandFromKm) / cfg.forelandAlphaKm;
                    const f = xf <= 0 ? smooth(-cfg.cratonBlendKm, cfg.forelandFromKm, crN) : Math.exp(-xf) * Math.cos(xf);
                    platform -= whole * cLoad * (f > 0 ? f : cfg.forebulgeGain * f);
                }
                // the shield's character (per craton: a sag basin, a swell, a flat shield) and its grain of domes and keels
                if (shieldS > 0.01) {
                    let cT = c0, cW = -1;
                    for (let j = 0; j < 3; j++) { const c = j === 0 ? c0 : j === 1 ? c1 : c2, wj = j === 0 ? w0 : j === 1 ? w1 : w2; if (craton[c] && wj > cW) { cW = wj; cT = c; } }
                    const ch = cratonCharacter(CR, seed, terrane[cT]), k = cfg.cratonCharacter * shieldS;
                    const rho = Math.min(1, Math.max(0, crN / Math.max(1, cPatch)));
                    if (ch.kind !== 0) {
                        const form = smooth(0.1, 0.8, rho + 0.3 * 1.6 * noise.fbm(x * shapeF + ch.salt, y * shapeF + 2.3 * ch.salt, z * shapeF + 5.5, 3, 0.5));
                        platform += k * ch.amp * (ch.kind > 0 ? cfg.cratonSwellKm : -cfg.cratonSagKm) * form;
                    } else platform += k * ch.amp * cfg.cratonFlatKm * 1.6 * noise.fbm(x * shapeF + ch.salt, y * shapeF + 4.1, z * shapeF + 2.3 * ch.salt, 3, 0.5);
                    if (grainShow > 0) {
                        // drawn out along the craton's length (terrain/cratons.js: its grain), cratonGrainStretch times
                        // longer than across — greenstone belts between granite domes, as the Superior's run
                        const ax = CR.acrossW[3 * cT], ay = CR.acrossW[3 * cT + 1], az = CR.acrossW[3 * cT + 2];
                        const f = grainF / grainStretch;
                        const s = (x * ax + y * ay + z * az) * (grainStretch - 1) * f;
                        platform += k * cfg.cratonGrainKm * grainShow * smooth(0, 150, crN) * (0.7 - 2 * Math.abs(noise.noise3D(x * f + s * ax + 3.3, y * f + s * ay + 8.8, z * f + s * az + 1.1)));
                    }
                }
                if (platform < 0.04 && before >= 0.04) platform = 0.04;            // (a sag or a foredeep is lowland, not sea)
            }
            // (the shelf and the coastal plain: with the coast, on its plate's raster where it was read there)
            const shelf = coastR !== null ? shelfR : w0 * shelfKm[c0] + w1 * shelfKm[c1] + w2 * shelfKm[c2];
            const plain = coastR !== null ? plainR : w0 * plainKm[c0] + w1 * plainKm[c1] + w2 * plainKm[c2];
            ramp = coast < shelf ? 0 : smooth(0, 1, (coast - shelf) / Math.max(1, plain));
            // (a passive margin's relief buried under its shelf and coastal plain, by its maturity: records.js)
            const buried = (coastR !== null ? matureR : w0 * maturity[c0] + w1 * maturity[c1] + w2 * maturity[c2]) * (1 - smooth(shelf, shelf + plain, coast));
            if (parts) { parts.dcoast[t] = coast; parts.dshelf[t] = shelf; parts.dplain[t] = plain; }
            h = coast < shelf ? cfg.shelfEdgeKm * (1 - coast / shelf) : platform * ramp;
            // the radiating dykes: coming out from under the lava across its edge (a signed distance — negative inside the
            // province — over the land corners), and within it only where erosion has bared them; never drowning land
            // (a low of the grain stops just above the sea)
            if (L.count && ramp > 0 && lw > 0) {
                const out = (n0 * (lipOutKm[c0] - lipEdgeKm[c0]) + n1 * (lipOutKm[c1] - lipEdgeKm[c1]) + n2 * (lipOutKm[c2] - lipEdgeKm[c2])) / lw;
                const show = ramp * smooth(-cfg.dykeInKm, cfg.dykeOutKm, out) * (lipPile > 0.002 ? 1 - lipKeep / lipPile : lipTop > 0.002 ? 1 - lipKeep / lipTop : 1);
                if (show > 0) { const dk = show * dykeAt(L, A.owner[c0], x, y, z, noise, fade, cfg); if (dk) h = dk > 0 ? h + dk : softFloor(h, h + dk, floorFor(h + dk), floorSoft); }
            }

            // ── mountain belts, in two layers: the current belt, and the one it overprinted at overprintShare. In each,
            // every belt kind among the corners counts by its (noisy) share of the weight; the position across the belt
            // is carried smoothly, so crests stay in their place ──
            wts[0] = w0; wts[1] = w1; wts[2] = w2;
            const nsum = e0 + e1 + e2;
            nts[0] = e0 / nsum; nts[1] = e1 / nsum; nts[2] = e2 / nsum;
            const jitter = cfg.edgeJitter * noise.fbm(x * blendF + 6.2, y * blendF + 1.9, z * blendF + 4.4, 3, 0.5) * 1.6;
            // (relief tapers to nothing at the edge of the continental crust: no step at the slope; on a mature passive
            // margin it lies buried under the shelf and the coastal plain)
            const atEdge = smooth(0, 40, coast) * (1 - buried);
            let warped = false, wx = 0, wy = 0, wz = 0, texture = 0, massifAmp = 0, massifWear = 0, massif = 0, envHere = 0, envCover = 0, rootHere = 0, rootCover = 0;
            for (let li = 0; li < 2; li++) {
            const { kind, dKm, reach, reliefKm, quietMyr: beltQuiet } = rec.belts[li], share = li === 0 ? 1 : cfg.overprintShare;
            kinds[0] = kind[c0]; kinds[1] = kind[c1]; kinds[2] = kind[c2];
            if (!kinds[0] && !kinds[1] && !kinds[2]) continue;
            let layerRelief = 0, stripeAmp = 0, noiseAmp = 0, noiseAcross = 0, fineKeep = 0, noiseWear = 0, layerMassif = 0, layerMassifWear = 0;
            let brkSum = 0, brkW = 0, lamSum = 0, oldS = 0, oldN = 0, combSum = 0;
            // (the distance across the belt as the kernels carry it — bending with the front — and how well they cover here)
            let follow = 0;
            if (crestFollow > 0 && Ks[li].count) { crossAt(Ks[li], cn, px, py, pz, crossC); follow = crestFollow * smooth(0.05, 0.4, crossC[1]); }
            // (layer 0: its cells' blends — preparePlan — read over the triangles as the cells' own values are; the overprinted
            // layer, at half weight, keeps the cells' own)
            const Sb = li === 0 && (beltCarry > 0 || crestAlongVar > 0 || envelopeCarry > 0) ? rec.belts[0].blend : null;
            for (let a = 0; a < 3; a++) {
                const k = kinds[a];
                if (!k || (a > 0 && kinds[0] === k) || (a > 1 && kinds[1] === k)) continue;
                let m = 0, ws = 0, d = 0, W = 0, A = 0, Q = 0;
                let bW = 0, bA = 0, bQ = 0;
                bw[3] = 0; bw[4] = 0; bw[5] = 0; bw[6] = 0; bw[7] = 0; bw[8] = 0; bw[9] = 0; bw[10] = 0;
                for (let b = a; b < 3; b++) {
                    if (kinds[b] !== k) continue;
                    const c = b === 0 ? c0 : b === 1 ? c1 : c2, wb = wts[b];
                    m += nts[b]; ws += wb; d += wb * dKm[c]; W += wb * reach[c]; A += nts[b] * reliefKm[c]; Q += nts[b] * beltQuiet[c];
                    if (Sb) {
                        const o = BLEND * c;
                        bW += wb * Sb[o]; bA += nts[b] * Sb[o + 1]; bQ += nts[b] * Sb[o + 2]; bw[3] += wb * Sb[o + 3];
                        bw[4] += wb * Sb[o + 4]; bw[5] += wb * Sb[o + 5]; bw[6] += wb * Sb[o + 6];
                        bw[7] += wb * Sb[o + 7]; bw[8] += wb * Sb[o + 8]; bw[9] += wb * Sb[o + 9]; bw[10] += wb * Sb[o + 10];
                    }
                }
                if (m <= 0 || ws <= 0) continue;
                d /= ws; W /= ws; A /= m; Q /= m;
                // (width, crest height and age from this kind's kernels, where they cover it: no cell-to-cell steps)
                let bwSum = 0;
                if (Sb) {
                    bwSum = bw[3] /= ws;
                    if (bw[7] > 1e-9) { bw[8] /= bw[7]; bw[7] /= ws; }
                    if (bw[9] > 1e-9) { bw[10] /= bw[9]; bw[9] /= ws; }
                    const f = beltCarry * smooth(0.05, 0.4, bwSum);
                    if (f > 0) { W += f * (bW / ws - W); A += f * (bA / m - A); Q += f * (bQ / m - Q); }
                }
                // how far this belt has worn since it fell quiet: its crests smoothed by σ (g = 2σ²), its ridges by a share
                // of that (wear: 2π²σ², a wave λ keeping e^(−wear/λ²))
                let g = 0, wear = 0;
                if (spreadOn && Q > 0) {
                    const s = Math.min(cfg.crestSpreadMaxKm, cfg.crestSpreadKm * Math.sqrt(Q / cfg.crestSpreadMyr)), st = cfg.crestTextureShare * s;
                    g = 2 * s * s; wear = PI2x2 * st * st;
                }
                const gAge = g;
                g += gBase;
                // (how old: its textures drawn out along the strike, its ridges stronger, its rock banded — by this share)
                const old = oldOn && Q > 0 ? 1 - Math.exp(-Q / cfg.oldGrainMyr) : 0;
                const dCells = d;
                if (follow > 0) d += follow * (Math.max(0, kindSide(k) === BeltSide.LOWER ? -crossC[0] : crossC[0]) - d);
                // the crests (the broad part of the belt is in the evolved uplift, carried by the platform above) — rising and
                // falling along the strike (peaks and saddles), read on the belt's front line so nothing moves across the belt
                const type = kindType(k), side = kindSide(k);
                const crest = crestProfile(type, side, d, W, jitter, g);
                let alongK = 1;
                if (crestAlongVar > 0 && bwSum > 0.05 && crest !== 0) {
                    const al = Math.sqrt(bw[4] * bw[4] + bw[5] * bw[5] + bw[6] * bw[6]);
                    if (al > 1e-9) {
                        // (the point moved back across the belt by its distance from the front, in the world, then into the crust's
                        // frame as the point itself is — the noise rides with the range)
                        const s = (side === BeltSide.LOWER ? -d : d) / (R * al);
                        plateFramePoint(A_, c0, c1, c2, w0, w1, w2, px - s * bw[4], py - s * bw[5], pz - s * bw[6], frontP);
                        const fx = frontP[0], fy = frontP[1], fz = frontP[2];
                        const v = renewedNoise(fx * crestAlongF + 61.7, fy * crestAlongF + 23.3, fz * crestAlongF + 9.1) + 0.5 * renewedNoise(fx * 2 * crestAlongF + 4.9, fy * 2 * crestAlongF + 37.1, fz * 2 * crestAlongF + 15.5);
                        alongK = Math.max(0.15, 1 + (old ? crestAlongVar * (1 - cfg.oldEven * old) : crestAlongVar) * smooth(0.05, 0.4, bwSum) * v);
                    }
                }
                layerRelief += m * A * alongK * crest;
                // how broken this belt's ridges are here: by its kind, least along the main range by the plate edge
                if (breakOn) {
                    const back = mainRangeBackKm(type, side, W);
                    brkSum += m * (cfg.ridgeBreak[type] ?? 0) * (breakFront + (1 - breakFront) * smooth(back, back + 0.3 * Math.max(40, W), d));
                    brkW += m; lamSum += m * cfg.stripeKm[type];
                }
                // (the envelope and the thickened crust at the point: the profiles here × the belt's heights, blended over its kernels —
                // where the kernels' distance across the belt and the cells' agree to within about a sim cell: it straightens the
                // cells' lobes; where a junction of belts sets them hundreds of km apart, the records stand)
                const agree = envelopeCarry > 0 ? smooth(simEdge, 0.5 * simEdge, Math.abs(d - dCells)) : 0;
                if (li === 0 && envelopeCarry > 0 && bw[7] > 0) {
                    const f = envelopeCarry * m * smooth(0.05, 0.4, bw[7]) * agree;
                    envHere += f * bw[8] * broadProfile(type, side, d, W, jitter); envCover += f * bw[8];
                }
                if (li === 0 && envelopeCarry > 0 && bw[9] > 0) {
                    const u = d / Math.max(40, W), f = envelopeCarry * m * smooth(0.05, 0.4, bw[9]) * agree;
                    rootHere += f * bw[10] * Math.max(0, 1 - u * u) * (1 - smooth(0.85 + jitter, 1.05 + jitter, u)); rootCover += f * bw[10];
                }
                // the parallel ridges: a share of this belt's whole relief, plus a little on its low ground — worn by their
                // wavelength (the finer set more)
                const raised = Math.max(0, A * beltProfile(type, side, d, W, jitter)), intensity = A / cfg.reliefKm[type], lam = cfg.stripeKm[type];
                const sAmp = (wear ? Math.exp(-wear / (lam * lam)) : 1) * m * stripeZone(type, side, d, W, jitter) * (cfg.stripeShare * raised + cfg.stripeBaseKm * intensity) * (old ? 1 + cfg.oldRidgeGain * old : 1);
                stripeAmp += sAmp; fineKeep += sAmp * (wear ? Math.exp(-wear * fineR2 / (lam * lam)) : 1); oldS += sAmp * old;
                // the ridge noise, over the whole belt: its highs and lows drawn out along the strike
                const edge = beltEdge(d, W, jitter), amp = m * edge * (cfg.ridgeNoiseShare * raised + cfg.ridgeNoiseBaseKm * intensity);
                noiseAmp += amp; noiseAcross += amp * cfg.ridgeNoiseAcross * lam; noiseWear += amp * wear; oldN += amp * old; combSum += m * edge * old;
                // the massif: a share of the crest height, more as the crests have spread (1 − their bulk's height kept, for
                // a crest 40 km across)
                if (massL.length) {
                    let mAmp = m * edge * A * (cfg.massifShare + cfg.massifWornShare * (gAge ? 1 - 40 / Math.sqrt(1600 + gAge) : 0));
                    // (an old belt's drawn out along its strike: that share of it joins the ridge noise)
                    if (old > 0) { const mc = mAmp * cfg.oldComb * old; mAmp -= mc; noiseAmp += mc; noiseAcross += mc * cfg.ridgeNoiseAcross * lam; noiseWear += mc * wear; oldN += mc * old; }
                    layerMassif += mAmp; layerMassifWear += mAmp * wear;
                }
            }
            // (the ridges broken here — patches of a noise about a ridge wavelength across, so each ridge runs on in pieces —
            // faded where the mesh is too coarse to show them, as the ridges themselves are; the crests by ridgeBreakCrest as much)
            let notch = 0;
            if (brkSum > 0) {
                const lam = lamSum / brkW, sf = R / (cfg.ridgeBreakSize * lam), [lo, hi] = cfg.ridgeBreakPatch;
                notch = (brkSum / brkW) * fade(lam) * smooth(lo, hi, renewed(x * sf + 31.3, y * sf + 12.9, z * sf + 47.7, 2));
                if (layerRelief > 0) layerRelief *= 1 - cfg.ridgeBreakCrest * notch;
                notchMax = Math.max(notchMax, notch);
            }
            relief += share * layerRelief;
            // (how old this layer's ridges and ridge noise are, and how strongly its grain shows here: none past its edge)
            const oldStripes = stripeAmp > 0 ? oldS / stripeAmp : 0, oldNoise = noiseAmp > 0 ? oldN / noiseAmp : 0, layerComb = share * atEdge * combSum;
            fineKeep = stripeAmp > 0 ? fineKeep / stripeAmp : 1;
            stripeAmp *= share * atEdge;
            const acrossKm = noiseAmp > 0 ? noiseAcross / noiseAmp : 0;
            noiseWear = noiseAmp > 0 ? noiseWear / noiseAmp : 0;
            noiseAmp *= share * atEdge;
            massifAmp += share * atEdge * layerMassif; massifWear += share * atEdge * layerMassifWear;
            if (stripeAmp > 0.005 || noiseAmp > 0.002) {
                if (!warped) {                          // (the meander warp and the ridges' texture: shared by both layers)
                    warped = true;
                    // (a displacement in the crust's frame, turned into the world: the kernels live in the world)
                    d[0] = meander * noise.fbm(x * meanderF + 1.5, y * meanderF + 4.5, z * meanderF + 9.5, 2, 0.5);
                    d[1] = meander * noise.fbm(x * meanderF + 7.5, y * meanderF + 0.5, z * meanderF + 3.5, 2, 0.5);
                    d[2] = meander * noise.fbm(x * meanderF + 4.1, y * meanderF + 6.1, z * meanderF + 0.9, 2, 0.5);
                    plateToWorld(A, A.owner[c0], d);
                    wx = px + d[0]; wy = py + d[1]; wz = pz + d[2];
                    // segments that fade in and out along the strike, crests that rise and fall along their length
                    const seg = smooth(-0.35, 0.3, renewed(x * segF + 2.7, y * segF + 5.7, z * segF + 8.7, 2));
                    texture = (0.2 + 0.8 * seg) * (0.55 + 0.45 * renewed(x * crestF + 3.9, y * crestF + 7.3, z * crestF + 1.2, 2) * 1.8);
                }
                // (an old belt's ridges run on, evenly: its segments and crest variation fade by oldEven; its troughs no deeper
                // than its ridges are high — the rivers in them deepen them — so the stronger ridges leave it as high on the whole)
                const tex = oldStripes > 0 ? texture + (1 - texture) * cfg.oldEven * oldStripes : texture, lows = oldStripes > 0 ? lowGain - (lowGain - 1) * oldStripes : lowGain;
                if (stripeAmp > 0.005 && carry) {
                    if (!carried) {                     // (the point on the raster of the plate under it, unwarped)
                        carried = true;
                        carryO = A.owner[cn];
                        if (carryO >= 0 && A.moved[carryO]) {
                            const m = A.mats, b = 9 * carryO;
                            locate(simMesh, m[b] * px + m[b + 3] * py + m[b + 6] * pz, m[b + 1] * px + m[b + 4] * py + m[b + 7] * pz, m[b + 2] * px + m[b + 5] * py + m[b + 8] * pz, cr3, cw3);
                        } else { carryO = -1; locate(simMesh, px, py, pz, cr3, cw3); }
                    }
                    const key = 4096 * li + carryO + 1;
                    let C = carry.get(key);
                    if (!C) carry.set(key, C = carriedField(Ks[li], simMesh, A, carryO, cfg.stripeFineShare, cfg.stripeFineRatio));
                    const sv = broken(carriedStripeAt(C, cr3, cw3, wx, wy, wz, fineKeep), notch);
                    stripes += stripeAmp * tex * (sv < 0 ? lows * sv : sv);
                    if (oldStripes > 0) { grainNum += stripeAmp * oldStripes * sv; grainDen += stripeAmp * oldStripes; }
                } else if (stripeAmp > 0.005) {
                    const sv = broken(stripeAt(Ks[li], cn, px, py, pz, wx, wy, wz, cfg.stripeFineShare * fineKeep, cfg.stripeFineRatio), notch);
                    stripes += stripeAmp * tex * (sv < 0 ? lows * sv : sv);
                    if (oldStripes > 0) { grainNum += stripeAmp * oldStripes * sv; grainDen += stripeAmp * oldStripes; }
                }
                // the ridge noise, read at the distance across the belt as the kernels carry it (smooth, bending with the front)
                if (noiseAmp > 0.002) {
                    crossAt(Ks[li], cn, wx, wy, wz, cross);
                    if (cross[1] > 0) {
                        let v = ridgeNoise(noise, cfg, fade, x, y, z, cross[0], acrossKm, 7 + 5 * li + offA, noiseWear);
                        if (fadeB > 0) v = fadeA * v + fadeB * ridgeNoise(noise, cfg, fade, x, y, z, cross[0], acrossKm, 7 + 5 * li + offB, noiseWear);
                        stripes += noiseAmp * (notch > 0 && v > 0 ? v * (1 - notch) : v);
                        // (an old belt's grain: its rock banded with its ridges; its hills drawn out across this distance)
                        if (oldNoise > 0) { grainNum += noiseAmp * oldNoise * v; grainDen += noiseAmp * oldNoise; }
                        const cw = layerComb * smooth(0.05, 0.4, cross[1]);
                        if (cw > combOld) { combOld = cw; combD = cross[0]; }
                    }
                }
            }
            }
            // the belts' massif: rounded, fractal relief in every direction (read in the crust's frame, renewing as the other
            // detail does), its finer octaves worn as the ridges are
            // …and the same octaves, ridged, make the crests rugged: broken, branching ridges, not a contour's line
            const rugHere = rugged > 0 && relief > 0.005;
            if (massifAmp > 0.002 || rugHere) {
                const wm = massifAmp > 0 ? massifWear / massifAmp : 0;
                let v = 0, rs = 0, rw = 0;
                for (let o = 0; o < massL.length; o++) {
                    const L2 = massL[o] * massL[o], sh = massA[o] * (wm ? Math.exp(-wm / L2) : 1);
                    if (sh < 1e-3 && !rugHere) continue;
                    const f = R / massL[o], nv = renewedNoise(x * f + 17.9 + 3.1 * o, y * f + 6.3 + 1.9 * o, z * f + 24.1 + 0.7 * o);
                    if (sh >= 1e-3) v += sh * nv;
                    if (rugHere) { const r1 = 1 - Math.abs(nv); rs += massA[o] * r1 * r1; rw += massA[o]; }
                }
                if (massifAmp > 0.002) massif = massifAmp * 1.4 * v;
                // (the ridged sum's mean 0.474 and spread 0.286 for one octave: up to ± rugged of the crest, never below 0.1 of it)
                if (rugHere && rw > 0) relief *= Math.max(0.1, 1 + (combOld > 0 ? rugged * (1 - cfg.oldEven * combOld) : rugged) * (rs / rw - 0.474) / 0.286);
            }
            // (a range pressed against a craton fades across its rim, along the line — not the cells' staircase)
            if (rimFade < 1) { relief *= rimFade; stripes *= rimFade; massif *= rimFade; }
            // the evolved uplift (over the land corners, interfingering like the platform) — on top of the shelf and plain, so
            // a range or escarpment near the coast still rises from the sea
            let uplift = lw > 0 ? (mountainCurve > 0 ? curvedRead(simMesh, slopes.of(-3, upliftKm, true), upliftKm, c0, c1, c2, n0, n1, n2, w0, w1, w2, mountainCurve)
                : (n0 * upliftKm[c0] + n1 * upliftKm[c1] + n2 * upliftKm[c2]) / lw) : 0;
            // (within a belt, its part of the uplift — as the cells sampled it — replaced by the smooth one: fronts, plateau rims
            // and the far edge on the belt's own lines; older belts' uplift and basins stay as recorded)
            if (envCover > 0 && lw > 0) uplift += envHere - envCover * (n0 * envShape[c0] + n1 * envShape[c1] + n2 * envShape[c2]) / lw;
            uplift *= rimFade;
            // (and the thickened crust's lift likewise, into the ground under the belt: no lobes of it, cell by cell)
            if (rootCover > 0 && lw > 0) {
                const notShield = (n0 * (craton[c0] ? 0 : 1) + n1 * (craton[c1] ? 0 : 1) + n2 * (craton[c2] ? 0 : 1)) / lw;
                h += ramp * notShield * (rootHere - rootCover * (n0 * rootShape[c0] + n1 * rootShape[c1] + n2 * rootShape[c2]) / lw);
            }
            const along = relief !== 0 || uplift !== 0 ? atEdge * (1 + cfg.alongStrikeVar * noise.fbm(x * strikeF + 8.8, y * strikeF + 2.2, z * strikeF + 6.6, 3, 0.5) * 1.5) : 0;
            const broadKm = h + uplift * along;   // (the ground without its ridges, noise and crests: what a lava flow levels to)
            let lifted = h + uplift * along + stripes;
            // (the massif never takes land under the sea: a low of it eases into the floor above sea level)
            if (massif) lifted = massif > 0 ? lifted + massif : softFloor(lifted, lifted + massif, floorFor(lifted + massif), floorSoft);
            stripes += massif;
            const crests = relief * along;     // (lifted: the ground without the crests)
            relief = uplift * along + crests;
            h = lifted + crests;
            // a valley between crests (a fore-arc valley, a strike valley) eases into the land's floor on a continent: it does
            // not hole the land with little seas, nor lie flat at sea level (a basin of the evolved uplift itself may still
            // sink below it). Not on an arc: an ocean arc IS drowned between its islands
            if (crests < 0 && coast >= shelf && lifted > floorKm && w0 * arcCrust[c0] + w1 * arcCrust[c1] + w2 * arcCrust[c2] < 0.5) h = softFloor(lifted, h, floorFor(h), floorSoft);
            // a failed rift arm: a sagged corridor, low but still land (unless it reaches the sea as an embayment)
            const arm = w0 * armKm[c0] + w1 * armKm[c1] + w2 * armKm[c2];
            let armDrop = 0;                       // (a failed arm opens after the lavas that came with its plume: it sags them too)
            if (arm < 3 * cfg.failedArmHalfKm) { const was = h, sag = h - cfg.failedArmKm * Math.exp(-((arm / cfg.failedArmHalfKm) ** 2)); h = softFloor(h, sag, floorFor(sag), floorSoft); armDrop = was - h; }
            // (a fold's trough never takes land under the sea: where a basin beside it would, the trough gives back what it took)
            if (foldLow < 0) h = softFloor(h - foldLow * ramp, h, floorFor(h), floorSoft);
            // ── a flood basalt levels the land (the Deccan, Putorana): its lavas ponded in the lows and buried the ground's
            // texture — its surface the broad ground under it (the platform and the evolved uplift: not the hills, ridges or
            // crests a flow buries) raised by the pile, so its top is flat where the pile is whole; older ground higher than
            // that stands through it (kipukas, steptoes). The ground under it is kept for the carving, bared as it wears ──
            if (lipFeather > 0 && lipKeep > 0.002 && ramp > 0) {
                // (lavas a belt has folded and lifted since they erupted ride on its relief — draped over the range, not
                // levelling it: by how long the belt was still at work after the eruption, over lipFoldedMyr)
                let folded = 0;
                if (lipBornMyr) {
                    let bw = 0, b = 0, q = 0;
                    for (let j = 0; j < 3; j++) { const c = j === 0 ? c0 : j === 1 ? c1 : c2, wj = j === 0 ? n0 : j === 1 ? n1 : n2; if (lipKm[c] > 0) { bw += wj; b += wj * lipBornMyr[c]; q += wj * (beltKind[c] ? Math.min(quietMyr[c], 1e4) : 1e4); } }
                    if (bw > 0) folded = smooth(0, cfg.lipFoldedMyr ?? 20, b / bw - q / bw);
                }
                const S = (folded > 0 ? folded * h + (1 - folded) * broadKm : broadKm) + lipKeep * ramp - (1 - folded) * armDrop, d = S - h, k = 0.04;
                lavaBelow = h; lavaCover = smooth(-0.02, 0.04, d);
                h = Math.max(h, S) + (Math.abs(d) < k ? (k - Math.abs(d)) ** 2 / (4 * k) : 0);   // (a smooth max: no crease at the shore of a kipuka)
            }
            // ── the plume that erupted it: a broad dome over a young province, and shield volcanoes on its lavas (lips.js) ──
            if (L.count && ramp > 0 && (cfg.lipSwellKm > 0 || cfg.lipShieldKm > 0)) {
                lipPlumeAt(L, A.owner[c0], x, y, z, cfg, plume);
                if (plume.dome > 1e-4 || plume.shield > 1e-4) { h += ramp * (plume.dome + plume.shield); if (lavaCover > 0) lavaBelow += ramp * plume.dome; }   // (the dome lifts the ground under the lava too; a shield is lava)
            }
            // ── hills down to what the mesh can show: more on high ground, none at the shore ──
            if (hillsF.length && h > 0) {
                let sum = 0;
                // (on an old belt, that share of them drawn out along its strike: read at the distance across it, as the
                // ridge noise is — each octave's hills oldHillsStretch times longer along it)
                const hc = combOld > 0 ? Math.min(1, cfg.oldComb * combOld) : 0;
                for (let o = 0; o < hillsF.length; o++) {
                    const f = hillsF[o];
                    let v = renewedNoise(x * f + 31.3 + 2.1 * o, y * f + 7.7 + 1.3 * o, z * f + 19.9 + 0.7 * o);
                    if (hc > 0) {
                        const u = 1.5 * combD * f / R, a = 1.5 * f / oldHillsStretch, s0 = 13.7 + 2.3 * o;
                        const sn = q => noise.noise3D(x * a + 0.6 * u + q, y * a + 0.64 * u + 1.7 * q, z * a + 0.48 * u + 0.3 * q);
                        const drawn = fadeB > 0 ? fadeA * sn(s0 + offA) + fadeB * sn(s0 + offB) : sn(s0 + offA);
                        v = ((1 - hc) * v + hc * drawn) / Math.hypot(1 - hc, hc);
                    }
                    sum += hillsAmp[o] * v;
                }
                h += sum * (1 + ((cfg.hillsUplandGain ?? 4) - 1) * smooth(0.1, 1.5, h)) * smooth(0, 0.08, h) * (1 - lavaCover);   // (none on a lava plain)
            }
        } else {
            // ── sea side: the slope from the shelf break down to the floor the ocean corners give ──
            const ow = (land[c0] ? 0 : w0) + (land[c1] ? 0 : w1) + (land[c2] ? 0 : w2);
            const oc = (c, w) => (land[c] ? 0 : w);
            const floor = ow > 0 ? (oc(c0, w0) * depthKm[c0] + oc(c1, w1) * depthKm[c1] + oc(c2, w2) * depthKm[c2]) / ow : 3;
            const slope = w0 * slopeKm[c0] + w1 * slopeKm[c1] + w2 * slopeKm[c2];
            h = cfg.shelfEdgeKm + (-floor - cfg.shelfEdgeKm) * smooth(0, slope, -coast);
            // abyssal hills along the isochrons, faded where the mesh cannot show them
            if (ow > 0) {
                const age = (oc(c0, w0) * ageMyr[c0] + oc(c1, w1) * ageMyr[c1] + oc(c2, w2) * ageMyr[c2]) / ow;
                const lam = (oc(c0, w0) * fabricKm[c0] + oc(c1, w1) * fabricKm[c1] + oc(c2, w2) * fabricKm[c2]) / ow, f = fade(lam);
                if (f > 0) h += f * smooth(0, 150, -coast) * (cfg.fabricOldKm + (cfg.fabricKm - cfg.fabricOldKm) * Math.exp(-age / cfg.fabricTauMyr))
                    * Math.sin(2 * Math.PI * age / cfg.fabricPeriodMyr + 2 * noise.noise3D(x * 20, y * 20, z * 20));
            }
            // the trench, and the outer rise on the plate going down
            const tk = w0 * trenchKm[c0] + w1 * trenchKm[c1] + w2 * trenchKm[c2];
            if (tk < 450) h -= (w0 * trenchDepthKm[c0] + w1 * trenchDepthKm[c1] + w2 * trenchDepthKm[c2]) * Math.exp(-((tk / cfg.trenchHalfKm) ** 2)) * smooth(0, 40, -coast);
            const rk = w0 * riseKm[c0] + w1 * riseKm[c1] + w2 * riseKm[c2];
            if (rk < 450) h += cfg.riseKm * Math.exp(-(((rk - cfg.riseAtKm) / 70) ** 2));
            // a fracture zone's trough, where the fracture-zone coordinate (records.js) passes a whole number — read across
            // the triangle from its ocean corners; not where they disagree by a segment or more (a pole that jumped, two
            // plates' floor) — where the mesh can draw it
            if (fractureU && ow > 0) {
                const u0 = fractureU[c0], u1 = fractureU[c1], u2 = fractureU[c2];
                const has0 = !land[c0] && u0 !== 0, has1 = !land[c1] && u1 !== 0, has2 = !land[c2] && u2 !== 0;
                const uw = (has0 ? w0 : 0) + (has1 ? w1 : 0) + (has2 ? w2 : 0);
                const lo = Math.min(has0 ? u0 : Infinity, has1 ? u1 : Infinity, has2 ? u2 : Infinity), hi = Math.max(has0 ? u0 : -Infinity, has1 ? u1 : -Infinity, has2 ? u2 : -Infinity);
                if (uw > 0.5 && hi - lo < 0.8) {
                    const u = ((has0 ? w0 * u0 : 0) + (has1 ? w1 * u1 : 0) + (has2 ? w2 * u2 : 0)) / uw, d = Math.abs(u - Math.round(u)) * SEGMENT_KM;
                    if (d < 4 * cfg.fractureHalfKm) h -= cfg.fractureTroughKm * fade(4 * cfg.fractureHalfKm) * Math.exp(-((d / cfg.fractureHalfKm) ** 2)) * smooth(0, 150, -coast);
                }
            }
            platform = h;
        }
        const cone = coneAt(V, cn, px, py, pz, h);
        heightKm[t] = h + cone;
        if (recCell) {
            // the world cell whose record this point shows (for the geology: geology/rocks.js) — the land corner with the
            // largest noisy share, as the platform interfingers; with no land corner, the heaviest
            const n0 = land[c0] ? noisy(c0, w0) : 0, n1 = land[c1] ? noisy(c1, w1) : 0, n2 = land[c2] ? noisy(c2, w2) : 0;
            recCell[t - from] = n0 + n1 + n2 > 0 ? (n0 >= n1 && n0 >= n2 ? c0 : n1 >= n2 ? c1 : c2) : (w0 >= w1 && w0 >= w2 ? c0 : w1 >= w2 ? c1 : c2);
        }
        if (carve) {
            // the carving's inputs here: rock uplift (active belts rise, by their relief, fading once quiet), how easily
            // it erodes (shields and ridge crests are hard), the rain its drainage brings, the hillslope gradient, and the
            // crust's own micro-relief (read in the plate's frame: it rides with the crust) that steers small rivers
            const i = t - from;
            let quiet = 0, shield = 0;
            for (let j = 0; j < 3; j++) { const c = j === 0 ? c0 : j === 1 ? c1 : c2, w = j === 0 ? w0 : j === 1 ? w1 : w2; quiet += w * (beltKind[c] ? quietMyr[c] : 1e4); shield += w * craton[c]; }
            if (coast >= 0) shield = shieldS;              // (the shield's share by its edge line: terrain/cratons.js)
            const belt = coast >= 0 ? Math.max(0, relief) : 0;
            const active = Math.exp(-quiet / cfg.carveActiveMyr);
            carve.u[i] = cfg.carveBgUplift + cfg.carveUpliftPerKm * belt * active;
            carve.hold[i] = coast >= 0 ? active : 0;          // (how active the belt here is: its rivers cut less)
            carve.k[i] = cfg.carveK * (1 - cfg.carveCratonHardness * shield) * (1 - cfg.carveCrestHardness * Math.min(1, Math.max(0, stripes / 0.3)));
            if (notchMax > 0) carve.k[i] *= 1 + cfg.ridgeBreakSoft * notchMax;   // (a ridge's break gives: a river through it deepens it)
            // (an old belt's rock banded with its ridges: hard on them, soft in the troughs between — trellis drainage)
            // (linear in the band, so a belt's rock erodes as fast as before on the whole: only where differs)
            if (combOld > 0 && grainDen > 0) carve.k[i] *= 1 - cfg.oldGrainHardness * combOld * Math.max(-1, Math.min(1, grainNum / grainDen));
            carve.rain[i] = rainAtLatitude(Math.asin(Math.max(-1, Math.min(1, pz))) * 180 / Math.PI, cfg) / cfg.rainRefMm;
            carve.slope[i] = cfg.carveHillSlope * (1 + cfg.carveHillRelief * belt) * (1 + cfg.carveHillNoise * noise.fbm(x * slopeF + 4.4, y * slopeF + 8.2, z * slopeF + 1.6, 2, 0.5) * 1.6);
            // flood basalt: a hard cap — cliffed canyon walls, slower rivers; and the stair it is cut into (carve.js)
            // (levelled: the lava where it lies on top, as thick as it stands above the ground under it)
            const lavaKm = lipFeather > 0 ? (lavaCover > 0 ? Math.max(0, heightKm[t] - cone - lavaBelow) : 0) : lipKeep * ramp;
            const basalt = coast >= 0 ? (lipFeather > 0 ? smooth(0, 0.05, lavaKm) * lavaCover : smooth(0, 0.05, lipTop * ramp)) : 0;
            carve.lip[i] = basalt; carve.lipTop[i] = lipFeather > 0 ? lavaKm : lipTop * ramp; carve.lipBase[i] = heightKm[t] - lavaKm;
            carve.lipAge[i] = basalt > 0 ? lipAge : 0;
            carve.lipNoise[i] = basalt > 0 ? 1.6 * noise.fbm(x * lipNoiseF + 2.9, y * lipNoiseF + 1.3, z * lipNoiseF + 6.1, 3, 0.5) : 0;
            // (young lava has hardly been cut: its rivers' wave starts slow — erodibility from lipYoungFloor of its share
            // to all of it over lipYoungMyr of wear — so a fresh province is a plain cut only by its big rivers' canyons)
            if (basalt > 0) {
                carve.slope[i] *= 1 + cfg.lipCliff * basalt; carve.k[i] *= 1 - cfg.lipHardness * basalt;
                if (cfg.lipYoungMyr > 0) carve.k[i] *= 1 - basalt * (1 - cfg.lipYoungFloor) * (1 - Math.min(1, lipAge / cfg.lipYoungMyr));
            }
            carve.micro[i] = cfg.carveMicroKm * noise.fbm(x * microF + 7.3, y * microF + 2.9, z * microF + 5.1, 3, 0.5) * 1.6;
            // how deep the history's rivers cut here (8b-2), over the land corners
            const l0 = land[c0] ? w0 : 0, l1 = land[c1] ? w1 : 0, l2 = land[c2] ? w2 : 0, lw2 = l0 + l1 + l2;
            carve.inc[i] = coast >= 0 && lw2 > 0 ? (l0 * riverIncKm[c0] + l1 * riverIncKm[c1] + l2 * riverIncKm[c2]) / lw2 : 0;
        }
        if (parts) { parts.platform[t] = coast >= 0 ? platform : h; parts.relief[t] = relief; parts.stripes[t] = stripes; parts.cones[t] = cone; parts.lip[t] = lipFeather > 0 ? (lavaCover > 0 ? Math.max(0, h - lavaBelow) : 0) : lipKeep * ramp; }   // (levelled: the lava as thick as it stands)
    }
}

/**
 * Simplex noise drawn out along a belt's strike (developer, 8b round 5): read at the distance across the belt, s (km,
 * stripes.js crossAt — fast), and at the point in the crust's frame (slow), so a feature is ridgeNoiseStretch times longer
 * along the belt than across it and bends with the front. Its features are `across` km across (ridgeNoiseAcross × the
 * belt kind's ridge wavelength), then halves and quarters of that, each faded where the mesh cannot show it; about −1…+1.
 * Both coordinates belong to the crust: the noise rides with the range. `salt` gives each belt layer a noise of its own.
 */
function ridgeNoise(noise, cfg, fade, x, y, z, d, across, salt, wear = 0) {
    const alongF = R / (across * cfg.ridgeNoiseStretch);
    let v = 0, amp = 1, norm = 0;
    for (let o = 0, f = 1; o < cfg.ridgeNoiseOctaves; o++, f *= 2) {
        norm += amp;
        const lam = 1.5 * across / f, show = fade(lam) * (wear ? Math.exp(-wear / (lam * lam)) : 1);   // (a simplex feature's wavelength ≈ 1.5 of its units; worn: see crestSpreadKm)
        if (show > 0) {
            const u = d / across * f, a = alongF * f;
            // (d moves the point fast along a fixed direction in noise space, the position slowly in every direction)
            v += amp * show * noise.noise3D(x * a + 0.6 * u + salt + 3.1 * o, y * a + 0.64 * u + 1.7 * salt, z * a + 0.48 * u + 0.3 * salt);
        }
        amp *= 0.5;
    }
    return 1.4 * v / norm;
}

/** Share of the planet above `seaLevelKm`, and land heights at the given quantiles (km). */
export function hypsometry(heightKm, seaLevelKm = 0, quantiles = [0.1, 0.25, 0.5, 0.75, 0.9, 0.99]) {
    let n = 0, below400 = 0;
    for (let i = 0; i < heightKm.length; i++) if (heightKm[i] > seaLevelKm) n++;
    const landH = new Float64Array(n);
    for (let i = 0, j = 0; i < heightKm.length; i++) if (heightKm[i] > seaLevelKm) { const v = heightKm[i] - seaLevelKm; landH[j++] = v; if (v < 0.4) below400++; }
    // each quantile is one order statistic of the land heights: selected in place, lowest rank first (each selection
    // leaves everything below its rank to its left), rather than sorting all the land — the same values, in linear time
    const rank = p => Math.min(n - 1, Math.floor(p * n)), byRank = quantiles.map((p, i) => i).sort((a, b) => rank(quantiles[a]) - rank(quantiles[b]));
    const q = new Array(quantiles.length).fill(0);
    for (let s = 0, lo = 0; n && s < byRank.length; s++) { const k = rank(quantiles[byRank[s]]); selectKth(landH, lo, n - 1, k); q[byRank[s]] = landH[k]; lo = k; }
    return { landShare: n / heightKm.length, quantiles, landKm: q, below400: n ? below400 / n : 0 };
}

/** Reorder a[lo..hi] so that a[k] holds the value it would hold sorted, none greater before it, none smaller after (Wirth's selection, median-of-three pivot). */
function selectKth(a, lo, hi, k) {
    while (lo < hi) {
        const l = a[lo], m = a[(lo + hi) >> 1], h = a[hi];
        const x = l < m ? (m < h ? m : l < h ? h : l) : (l < h ? l : m < h ? h : m);
        let i = lo, j = hi;
        do {
            while (a[i] < x) i++;
            while (x < a[j]) j--;
            if (i <= j) { const t = a[i]; a[i] = a[j]; a[j] = t; i++; j--; }
        } while (i <= j);
        if (j < k) lo = i;
        if (k < i) hi = j;
    }
}
