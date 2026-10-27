// Turn a craton layout into the starting supercontinent's crust — as an ASSEMBLY (plans/V2_START_WORLD_PLAN.md, S2–S3):
// each cluster of cratons is a proto-continent that grew outward (a core of cratons and the belts between them, then
// accreted rings, younger outward and wider on one side — Laurentia's Archean provinces welded, then rimmed by ever younger
// belts, Hoffman 1988), and the proto-continents met along a few long seams. Its outputs: irregular craton outlines, the
// accreted crust that wraps and joins them, a terrane id per cell, and the seams between terranes by kind (inner seams
// between a core's cratons, ring seams between accreted rings, major seams between proto-continents) — future rift
// corridors and the start world's old ranges (start-world.js).
// The coast is drawn by that growth, not by noise: lobes where the proto-continents bulge, bays where they do not meet,
// smooth arcs joined at cusps where the rim trench lies (a subduction margin, convex to the ocean) and rifted steps along
// the passive stretch; noise only adds bays and headlands smaller than that.
//
// The two spacing promises are enforced separately so no shape function can break them:
//   craton ↔ craton  — cratons.js packs the ideal outlines, measured between the outlines, at least
//                      (cratonMinGapKm + 2 × cratonEdgeNoiseKm) apart, and the noise applied here
//                      moves an outline by at most cratonEdgeNoiseKm.
//   craton ↔ sea     — after shaping, every cell within cratonMinCoastKm of a craton is made land.

import { PLANET_RADIUS_KM } from '../../core/sim-mesh.js';
import { floodFrom, withinKm } from '../../core/mesh-bfs.js';
import { polarFrame, tangentBasis } from '../../core/sphere-geom.js';
import { CrustType } from '../model/crust.js';
import { cratonEdge } from './cratons.js';

/** The kinds of seam (the `suture` array): 0 none. */
export const Seam = Object.freeze({ NONE: 0, INNER: 1, RING: 2, MAJOR: 3 });
const MAX_RINGS = 4;

/**
 * @param {{cratons: Object[], centre: number[], clusters: number}} layout   init/cratons.js placeCratons
 * @param {() => number} rng   the landmass's own stream (each proto-continent's growth, the margin's arcs and steps)
 * @param {{from: number, span: number}} passive   the passive stretch of the rim, as azimuths (degrees) about the cratons'
 *        centroid — chosen before the land so the coast can be drawn for it (rim-trench.js chooseActiveRim uses the same)
 * @returns {null | {type: Uint8Array, terrane: Uint16Array, suture: Uint8Array, owner: Int8Array, skirtKm: number,
 *          rimCentre: number[], passive: Object}}  type uses CrustType (OCEAN / CONTINENT / CRATON); suture the Seam kind;
 *          owner the proto-continent; null if the layout cannot form one landmass
 */
export function shapeLandmass(simMesh, layout, noise, rng, cfg, stretch = 1, passive = { from: 0, span: 0 }) {
    const { cratons } = layout, K = layout.clusters ?? 1;
    const { xyz, numCells, adjOffset, adjList } = simMesh;
    const km = v => v / PLANET_RADIUS_KM;
    const edgeNoise = km(cfg.cratonEdgeNoiseKm), soft = km(cfg.coastUnionSoftnessKm), wander = km(cfg.terraneBorderWanderKm);
    const grainF = PLANET_RADIUS_KM / cfg.cratonGrainNoiseKm[0], acrossF = PLANET_RADIUS_KM / cfg.cratonGrainNoiseKm[1];
    const seamHalf = km(cfg.sutureHalfWidthKm), core = km(cfg.startCoreKm), seamWander = km(cfg.startSeamWanderKm);
    // (a cluster's cratons are joined softly over about half their gap — cratons.js packs cluster-mates ~1–1.15 × the
    // spacing reserve apart — so the core closes over the belts between them)
    const coreSoft = 0.55 * km(cfg.cratonMinGapKm + 2 * cfg.cratonEdgeNoiseKm), smallCraton = km(800);
    const edge = { d: 0, rift: 0, along: 0, across: 0 };
    const lerp = ([a, b], t) => a + (b - a) * t;

    // ── each proto-continent: its heart (its cratons' centroid), the side it accreted wider on, its rings' width ──
    const heartOf = list => {
        const s = [0, 0, 0];
        for (const k of list) { const w = k.radius * k.radius; s[0] += k.centre[0] * w; s[1] += k.centre[1] * w; s[2] += k.centre[2] * w; }
        const l = Math.hypot(...s) || 1;
        return [s[0] / l, s[1] / l, s[2] / l];
    };
    const clusters = Array.from({ length: K }, (_, k) => {
        const heart = heartOf(cratons.filter(c => (c.cluster ?? 0) === k)), [e, n] = tangentBasis(heart);
        return { heart, e, n, bias: cfg.startGrowthBias * (0.25 + 0.75 * rng()), towards: rng() * 2 * Math.PI, ringKm: lerp(cfg.startRingKm, rng()) };
    });
    const rimCentre = heartOf(cratons), toPolar = polarFrame(rimCentre, tangentBasis(rimCentre)[0]);
    const margin = marginProfile(rng, cfg, passive);

    const type = new Uint8Array(numCells), terrane = new Uint16Array(numCells), suture = new Uint8Array(numCells);
    const owner = new Int8Array(numCells), ring = new Uint8Array(numCells), pair = new Uint8Array(numCells);
    const field = new Float32Array(numCells), shape = new Float32Array(numCells);
    const G = new Float64Array(K), Gw = new Float64Array(K), D = new Float64Array(K);
    const roundSpan = Math.acos(1 - 2 * cfg.continentalFraction);
    for (let c = 0; c < numCells; c++) {
        const x = xyz[3 * c], y = xyz[3 * c + 1], z = xyz[3 * c + 2];
        G.fill(0);
        let nearest = Infinity, nearestId = 0, rift = 0, along = 0, across = 0, size = 0;
        for (const k of cratons) {
            const f = cratonEdge(k, x, y, z, edge).d;
            if (f < nearest) { nearest = f; nearestId = k.id; rift = edge.rift; along = edge.along; across = edge.across; size = k.radius; }
            G[k.cluster ?? 0] += Math.exp(-Math.max(f, -coreSoft * 4) / coreSoft);
        }
        // growth distance from each proto-continent: from its cratons softly joined (so the core takes in the belts
        // between them, and the rings wrap the whole cluster, not each craton), shortened on the side it accreted wider
        // (the seam between two proto-continents lies where their growths met, wandering a little)
        let o = 0, o2 = -1;
        for (let k = 0; k < K; k++) {
            const C = clusters[k], th = Math.atan2(x * C.n[0] + y * C.n[1] + z * C.n[2], x * C.e[0] + y * C.e[1] + z * C.e[2]);
            G[k] = D[k] = -coreSoft * Math.log(G[k]);
            if (G[k] > 0) G[k] /= 1 + C.bias * Math.cos(th - C.towards);
            Gw[k] = G[k] + seamWander * (noise.noise3D(x * 1.5 + 11.3 * k, y * 1.5 - 5.1 * k, z * 1.5 + 2.9 * k) + 0.2 * noise.noise3D(x * 4.5 - 3.7 * k, y * 4.5 + 8.2 * k, z * 4.5 + 1.3 * k));
            if (Gw[k] < Gw[o]) { o2 = o; o = k; } else if (o2 < 0 || Gw[k] < Gw[o2]) { if (k !== o) o2 = k; }
        }
        owner[c] = o;
        if (o2 >= 0 && o2 !== o && Gw[o2] - Gw[o] < 2 * seamHalf) { suture[c] = Seam.MAJOR; pair[c] = 1 + Math.min(o, o2) * K + Math.max(o, o2); }
        // within the core: each craton's terrane (the mid-line between it and its cluster-mates, pushed around), and the
        // inner seams between them; beyond it, the accreted rings — each a terrane, younger outward. Rings count the true
        // distance, not the growth distance: the side that grew wider holds more of them, the quiet side few or none
        // (a continent grows where its margin is busy — Laurentia south- and eastward, then west)
        if (D[o] < core) {
            let b1 = Infinity, b2 = Infinity, who = 0;
            for (const k of cratons) {
                if ((k.cluster ?? 0) !== o) continue;
                const b = cratonEdge(k, x, y, z, edge).d + wander * noise.noise3D(x * 2.2 + 7.3 * k.id, y * 2.2 - 3.1 * k.id, z * 2.2 + 1.7 * k.id);
                if (b < b1) { b2 = b1; b1 = b; who = k.id; } else if (b < b2) b2 = b;
            }
            terrane[c] = who;
            if (!suture[c] && b2 - b1 < 2 * seamHalf) suture[c] = Seam.INNER;
        } else {
            const r = 1 + Math.floor((D[o] - core) / km(clusters[o].ringKm) + 0.35 * noise.noise3D(x * 3 + 4.4 * o, y * 3 + 1.7, z * 3 - 2.2 * o));
            ring[c] = Math.max(1, Math.min(MAX_RINGS, r));
            terrane[c] = cratons.length + 1 + o * MAX_RINGS + ring[c] - 1;
        }
        // craton outline = ideal shape ± bounded noise that follows the craton's grain: bays and promontories drawn out
        // along the strike (long and gentle where the edge runs with the grain, short and ragged where it cuts across
        // it), and a rift edge only wanders a little — it stays a near-straight line; a small craton's edge wanders less
        // (in proportion below smallCraton across: the noise would bite a small core into a sliver). A craton cell always carries its
        // own craton's id, however far the terrane border wanders (a core labelled with a neighbour's id would count as
        // a divided craton).
        const wobble = clamp(1.4 * noise.fbm(along * grainF + 3.1 * nearestId, across * acrossF - 1.7 * nearestId, 5.3 + 0.37 * nearestId, 3, 0.55), -1, 1)
            * edgeNoise * (1 - (1 - cfg.cratonRiftNoise) * rift) * Math.min(1, size / smallCraton);
        if (nearest + wobble < 0) { type[c] = CrustType.CRATON; terrane[c] = nearestId; }
        // coast field = the proto-continents' growth, softly joined (no notch where two of them meet) …
        let union = 0;
        for (let k = 0; k < K; k++) union += Math.exp(-Math.max(G[k], -soft * 4) / soft);
        field[c] = -soft * Math.log(union);
        // … shaped by the margin (only out where the coast is: the interior keeps its own) — arcs and cusps along the
        // trench, rifted steps along the passive stretch — and bays and headlands smaller than that, fewer on the arcs
        const { colat, azimuth } = toPolar(x, y, z), at = margin.at(azimuth);
        const out = smoothstep((colat * Math.PI / 180 - 0.45 * roundSpan) / (0.35 * roundSpan));
        const detail = km(cfg.startCoastDetailKm) * (1 - 0.6 * at.active) * clamp(1.3 * noise.fbm(x * 9 + 23, y * 9 + 23, z * 9 + 23, 3, 0.5), -1, 1);
        shape[c] = out * (km(at.stepKm) - km(at.bulgeKm)) + detail + km(cfg.coastReliefKm) * (0.5 + 0.5 * stretch) * clamp(1.3 * noise.noise3D(x * 0.9 + 31, y * 0.9 + 31, z * 0.9 + 31), -1, 1);
    }
    // the ring seams: where the ring changes between two cells of one proto-continent (the outer side carries it) — only
    // between accreted rings, not round the core's edge: that edge follows the cratons' lumps and drawn all round every
    // cluster reads as contour lines; the rings beyond it lie only on the side that grew wider, a younger belt or two
    // (the Grenville front) rather than tree rings
    for (let c = 0; c < numCells; c++) {
        if (suture[c] || ring[c] < 2) continue;
        for (let j = adjOffset[c]; j < adjOffset[c + 1]; j++) { const q = adjList[j]; if (owner[q] === owner[c] && ring[q] < ring[c]) { suture[c] = Seam.RING; break; } }
    }

    // The promised margin of accreted crust around every craton: true distance between cell centres, plus one
    // cell because a cell has an extent (init/measure-start.js measures the margin the same way).
    const nearCraton = withinKm(simMesh, c => type[c] === CrustType.CRATON, cfg.cratonMinCoastKm + simMesh.edgeKm);
    // Bridges: a corridor of accreted crust along each edge of the cratons' spanning tree, so the landmass is one
    // body however deep the coast bites in between two cores (a loose, ragged cluster would otherwise lose a core).
    const bridge = bridges(simMesh, cratons, km(cfg.bridgeHalfWidthKm));

    // Skirt width: whatever reaches the requested continental fraction — counted the way the final landmass is
    // made: seas enclosed by the landmass become land, land not attached to the main body becomes sea.
    const antipode = simMesh.index.nearest(-layout.centre[0], -layout.centre[1], -layout.centre[2]);
    const heart = simMesh.index.nearest(cratons[0].centre[0], cratons[0].centre[1], cratons[0].centre[2]);
    const isLand = (c, skirt) => nearCraton[c] === 1 || bridge[c] === 1 || field[c] + shape[c] < skirt;
    const landmass = skirt => {
        const t = Uint8Array.from(type);
        for (let c = 0; c < numCells; c++) if (t[c] !== CrustType.CRATON && isLand(c, skirt)) t[c] = CrustType.CONTINENT;
        if (t[antipode] !== CrustType.OCEAN) return null;         // land right round the planet: not a layout we want
        const openOcean = floodFrom(simMesh, antipode, c => t[c] === CrustType.OCEAN);
        for (let c = 0; c < numCells; c++) if (t[c] === CrustType.OCEAN && !openOcean[c]) t[c] = CrustType.CONTINENT;
        const mainland = floodFrom(simMesh, heart, c => t[c] !== CrustType.OCEAN);
        let n = 0;
        for (let c = 0; c < numCells; c++) {
            if (t[c] === CrustType.OCEAN) continue;
            if (mainland[c]) { n++; continue; }
            if (t[c] === CrustType.CRATON) return null;            // a craton got cut off — layout rejected
            t[c] = CrustType.OCEAN;
        }
        return { t, n };
    };
    let lo = Infinity, hi = 0.7;                             // at lo nothing but the promised margins and bridges is land
    for (let c = 0; c < numCells; c++) lo = Math.min(lo, field[c] + shape[c]);
    lo -= 0.01;
    for (let it = 0; it < 24; it++) {
        const skirt = (lo + hi) / 2, made = landmass(skirt);
        if (!made) return null;
        if (made.n / numCells < cfg.continentalFraction) lo = skirt; else hi = skirt;
    }
    const skirt = (lo + hi) / 2, made = landmass(skirt);
    if (!made) return null;
    type.set(made.t);
    for (let c = 0; c < numCells; c++) {
        if (type[c] === CrustType.OCEAN) { terrane[c] = 0; suture[c] = 0; owner[c] = -1; }
        else if (type[c] === CrustType.CRATON) suture[c] = 0;
    }
    // each pair of proto-continents met at its own time: how strong the range along their seam still stands (the last of
    // them to meet, 1; the earlier, 0.25…0.7, worn longer) — so the seams round a proto-continent hemmed in by others do
    // not ring it with one even range (a crater rim), they stand high on one side and worn low on another
    const pairs = [...new Set(pair.filter(p => p > 0))].sort((a, b) => a - b), pairRange = new Float32Array(1 + K * K);
    const last = pairs.length ? pairs[Math.floor(rng() * pairs.length)] : 0;
    for (const p of pairs) pairRange[p] = p === last ? 1 : 0.25 + 0.45 * rng();
    for (let c = 0; c < numCells; c++) if (suture[c] !== Seam.MAJOR) pair[c] = 0;
    return { type, terrane, suture, owner, pair, pairRange, skirtKm: skirt * PLANET_RADIUS_KM, rimCentre, passive };
}

const smoothstep = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

/**
 * The margin's shape round the rim, by azimuth about the cratons' centroid (degrees, as rim-trench.js measures it): along
 * the active rim, arcs (startArcKm long, startArcRadiusKm tight) bulging seaward and joined at cusps — a subduction margin
 * is a chain of arcs convex to the ocean (the Aleutians, the Kurils, Japan); along the passive stretch, rift segments
 * (startStepKm) offset from one another by transforms (startStepOffsetKm) — promontories and recesses. `at(azimuth)` gives
 * the bulge and the step (km) there and how active the margin is (0…1, eased across the two ends of the passive stretch).
 */
function marginProfile(rng, cfg, passive) {
    const kmPerDeg = Math.sin(Math.acos(1 - 2 * cfg.continentalFraction)) * 2 * Math.PI * PLANET_RADIUS_KM / 360;
    const lerp = ([a, b], t) => a + (b - a) * t;
    const span = Math.max(0, Math.min(360, passive.span)), arcs = [], steps = [];
    for (let o = span; o < 360;) {                                  // (offsets from the passive stretch's start)
        const L = lerp(cfg.startArcKm, rng()), R = lerp(cfg.startArcRadiusKm, rng()), w = L / kmPerDeg;
        arcs.push({ from: o, to: Math.min(360, o + w), H: Math.min(0.2 * L, L * L / (8 * R)) });
        o += w;
    }
    for (let o = 0; o < span;) {
        const w = lerp(cfg.startStepKm, rng()) / kmPerDeg;
        steps.push({ from: o, to: Math.min(span, o + w), off: (rng() < 0.5 ? -1 : 1) * lerp(cfg.startStepOffsetKm, rng()) });
        o += w;
    }
    const EASE = 4, out = { bulgeKm: 0, stepKm: 0, active: 1 };
    return {
        at(azimuth) {
            const o = ((azimuth - passive.from) % 360 + 360) % 360;
            // how active: 0 inside the passive stretch, 1 on the active rim, eased over EASE degrees at both ends
            out.active = span <= 0 ? 1 : o < span ? 0 : smoothstep(Math.min(o - span, 360 - o) / EASE);
            out.bulgeKm = 0; out.stepKm = 0;
            if (o >= span) for (const a of arcs) { if (o >= a.from && o < a.to) { const u = (o - a.from) / (a.to - a.from); out.bulgeKm = a.H * (1 - (2 * u - 1) ** 2) * out.active; break; } }
            else {
                // a step's offset, eased into the next over half a degree (a transform is sharp, not a ramp)
                for (let i = 0; i < steps.length; i++) {
                    const s = steps[i];
                    if (o < s.from || o >= s.to) continue;
                    const next = steps[i + 1], blend = next ? smoothstep((o - (s.to - 0.5)) / 0.5) : 0;
                    out.stepKm = (s.off * (1 - blend) + (next ? next.off * blend : 0)) * (1 - out.active) * smoothstep(Math.min(o, span - o) / EASE);
                    break;
                }
            }
            return out;
        },
    };
}

/** Cells within `halfWidth` (radians) of the great-circle segments joining the cratons' centres along their minimum spanning tree. */
function bridges(simMesh, cratons, halfWidth) {
    const { xyz, numCells } = simMesh, out = new Uint8Array(numCells), n = cratons.length;
    const dist = (a, b) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
    // Prim's spanning tree over the centres
    const inTree = new Array(n).fill(false), edges = [];
    inTree[0] = true;
    for (let added = 1; added < n; added++) {
        let best = null;
        for (let i = 0; i < n; i++) if (inTree[i]) for (let j = 0; j < n; j++) if (!inTree[j]) { const d = dist(cratons[i].centre, cratons[j].centre); if (!best || d < best.d) best = { i, j, d }; }
        inTree[best.j] = true; edges.push(best);
    }
    for (const { i, j, d } of edges) {
        const A = cratons[i].centre, B = cratons[j].centre;
        const nx = A[1] * B[2] - A[2] * B[1], ny = A[2] * B[0] - A[0] * B[2], nz = A[0] * B[1] - A[1] * B[0], nl = Math.hypot(nx, ny, nz) || 1;
        for (let c = 0; c < numCells; c++) {
            const x = xyz[3 * c], y = xyz[3 * c + 1], z = xyz[3 * c + 2];
            const crossTrack = Math.asin(Math.max(-1, Math.min(1, (x * nx + y * ny + z * nz) / nl)));          // signed distance from the great circle
            if (Math.abs(crossTrack) > halfWidth) continue;
            const p = [x, y, z], along = dist(A, p), alongB = dist(B, p);                                        // between the two ends?
            if (along <= d + halfWidth && alongB <= d + halfWidth) out[c] = 1;
        }
    }
    return out;
}
