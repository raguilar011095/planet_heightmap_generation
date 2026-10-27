// Step 1 of terrain synthesis: read a Frame into smooth per-sim-cell fields that heights are built from — distance
// to the coast, the depth of the sea floor, the trench, the platform a continent stands at, and for every mountain
// belt: what kind it is, where across it a cell lies, which way its ridges run, and how high its relief stands.
// All on the 40K-cell sim mesh (cheap); synthesize.js carries them onto the terrain mesh.

import { CrustType, CrustFlag, OrogenyType, VolcanicType, BeltSide } from '../tectonics/model/crust.js';
import { BoundaryKind } from '../tectonics/model/world.js';
import { Margin, seaDepthKm } from '../tectonics/measure.js';
import { spreadKm } from '../core/min-heap.js';
import { hopDistance } from '../core/mesh-bfs.js';
import { erosionAtLatitude } from './terrain-config.js';
import { FastNoise as SimplexNoise } from '../core/fast-noise.js';     // (bit-identical to V1's SimplexNoise, faster)
import { buildAnchor } from './anchor.js';
import { plateCratons } from './cratons.js';

const R = 6371;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** A belt KIND: its orogeny type and its side of a collision (the profile depends on both). 0 = no belt. */
export const kindOf = (type, side) => type * 3 + side;
export const kindType = kind => (kind / 3) | 0;
export const kindSide = kind => kind % 3;

/**
 * Which way across the strike, measured on each plate's own raster (Phase 9, steady detail) — as beltLayer measures it on
 * the world grid (straight away from the nearest point of the belt's front, then smoothed within the belt), but on the
 * crust itself: the world grid shows a moving plate re-sampled each step, its fronts jittering by up to half a cell, and a
 * ridge is sensitive to its direction (5° off, and a ridge 150 km from its kernel moves by a quarter of its spacing).
 * Each raster cell takes the belt kind and position of the world cell showing it; one no world cell shows, its shown
 * neighbours' (the most common kind, the mean position). Returned per plate: a unit vector per raster cell IN THE PLATE'S
 * FRAME (0 where it has none), which the ridge kernels turn into the world with the plate (stripes.js).
 */
function rasterAcross(simMesh, A, kind, u, reach, worldAcross, frame, layer) {
    const { xyz, numCells: n, adjOffset, adjList } = simMesh, m = A.mats, out = new Map(), byPlate = new Map();
    for (let w = 0; w < n; w++) { const o = A.owner[w]; if (o >= 0 && kind[w]) (byPlate.get(o) ?? byPlate.set(o, []).get(o)).push(w); }
    const kindR = new Uint8Array(n), uR = new Float32Array(n), reachR = new Float32Array(n), has = new Uint8Array(n), fromFront = new Float32Array(n), frontOf = new Int32Array(n);
    const fallback = new Float32Array(3 * n), grad = [0, 0, 0];
    // the plates' own belts, where the frame carries them (plate by plate: where each plate's run starts)
    const runs = new Map();
    if (frame.crustBelt) for (let i = 0; i < frame.crustCells.length; i++) { const o = Math.floor(frame.crustCells[i] / n); const r = runs.get(o); if (r) r.end = i + 1; else runs.set(o, { start: i, end: i + 1 }); }
    for (const o of [...byPlate.keys()].sort((a, b) => a - b)) {
        const cells = byPlate.get(o), b = 9 * o, touched = [], run = runs.get(o);
        for (const w of cells) {
            const r = A.cell[w];
            if (!has[r]) touched.push(r);
            kindR[r] = kind[w]; uR[r] = u[w]; reachR[r] = reach[w]; has[r] = 1;
            // (the world grid's own direction, turned into the plate's frame: kept for cells the raster gives none)
            const ax = worldAcross[3 * w], ay = worldAcross[3 * w + 1], az = worldAcross[3 * w + 2];
            fallback[3 * r] = m[b] * ax + m[b + 3] * ay + m[b + 6] * az; fallback[3 * r + 1] = m[b + 1] * ax + m[b + 4] * ay + m[b + 7] * az; fallback[3 * r + 2] = m[b + 2] * ax + m[b + 5] * ay + m[b + 8] * az;
        }
        if (run) {
            // every crust cell of the plate, exactly: its own belt kind, position and reach (cells no world cell shows
            // included), as beltLayer reads them from the world view
            for (let i = run.start; i < run.end; i++) {
                const r = frame.crustCells[i] - o * n, t = frame.crustType[i], B = 6 * i + 3 * layer, type = frame.crustBelt[B];
                if (has[r] || t === CrustType.OCEAN || !type) continue;
                kindR[r] = kindOf(type, type === OrogenyType.URAL || type === OrogenyType.HIMALAYAN ? frame.crustBelt[B + 1] || BeltSide.UPPER : BeltSide.NONE);
                uR[r] = frame.crustBelt[B + 2]; reachR[r] = frame.crustReach[2 * i + layer]; has[r] = 2; touched.push(r);
                fallback[3 * r] = 0; fallback[3 * r + 1] = 0; fallback[3 * r + 2] = 0;
            }
        }
        // (no belts in the frame: a hidden belt cell surrounded by the belt's shown cells takes the most common kind among
        // them, their mean position)
        const shownCount = run ? 0 : touched.length;
        for (let i = 0; i < shownCount; i++) {
            const r0 = touched[i];
            for (let k = adjOffset[r0]; k < adjOffset[r0 + 1]; k++) {
                const r = adjList[k];
                if (has[r]) continue;
                let count = 0, sumU = 0, sumReach = 0, best = 0, bestN = 0;
                for (let j = adjOffset[r]; j < adjOffset[r + 1]; j++) {
                    const q = adjList[j];
                    if (has[q] !== 1) continue;
                    count++; sumU += uR[q]; sumReach += reachR[q];
                    let same = 0;
                    for (let jj = adjOffset[r]; jj < adjOffset[r + 1]; jj++) if (has[adjList[jj]] === 1 && kindR[adjList[jj]] === kindR[q]) same++;
                    if (same > bestN) { bestN = same; best = kindR[q]; }
                }
                if (count * 3 < 2 * (adjOffset[r + 1] - adjOffset[r])) continue;
                kindR[r] = best; uR[r] = Math.round(sumU / count); reachR[r] = sumReach / count; has[r] = 2; touched.push(r);
                fallback[3 * r] = 0; fallback[3 * r + 1] = 0; fallback[3 * r + 2] = 0;
            }
        }
        // straight away from the nearest front cell, over the raster, within the kind
        for (const r of touched) { fromFront[r] = Infinity; frontOf[r] = -1; }
        for (const r of touched) if (reachR[r] > 0 && uR[r] === 0) { fromFront[r] = 0; frontOf[r] = r; }
        spreadKm(simMesh, fromFront, { canEnter: (a, q) => has[q] && kindR[q] === kindR[a], onReach: (a, q) => { frontOf[q] = frontOf[a]; } });
        let across = new Float32Array(3 * n);
        const dKmR = r => (uR[r] / 255) * reachR[r];
        for (const r of touched) {
            const f = frontOf[r];
            if (f >= 0 && f !== r) {
                const x = xyz[3 * r], y = xyz[3 * r + 1], z = xyz[3 * r + 2];
                let ax = x - xyz[3 * f], ay = y - xyz[3 * f + 1], az = z - xyz[3 * f + 2];
                const d = ax * x + ay * y + az * z; ax -= d * x; ay -= d * y; az -= d * z;
                const l = Math.hypot(ax, ay, az);
                if (l > 1e-9) { across[3 * r] = ax / l; across[3 * r + 1] = ay / l; across[3 * r + 2] = az / l; continue; }
            }
            // (a front cell: the slope of the belt's position there)
            let gx = 0, gy = 0, gz = 0;
            for (let k = adjOffset[r]; k < adjOffset[r + 1]; k++) {
                const q = adjList[k];
                if (!has[q] || kindR[q] !== kindR[r] || !(reachR[q] > 0)) continue;
                const dx = xyz[3 * q] - xyz[3 * r], dy = xyz[3 * q + 1] - xyz[3 * r + 1], dz = xyz[3 * q + 2] - xyz[3 * r + 2], s = dKmR(q) - dKmR(r);
                gx += s * dx; gy += s * dy; gz += s * dz;
            }
            const x = xyz[3 * r], y = xyz[3 * r + 1], z = xyz[3 * r + 2], d = gx * x + gy * y + gz * z;
            gx -= d * x; gy -= d * y; gz -= d * z;
            const g = Math.hypot(gx, gy, gz);
            if (g > 1e-9) { across[3 * r] = gx / g; across[3 * r + 1] = gy / g; across[3 * r + 2] = gz / g; }
            else { across[3 * r] = fallback[3 * r]; across[3 * r + 1] = fallback[3 * r + 1]; across[3 * r + 2] = fallback[3 * r + 2]; }
        }
        // smoothed within the belt over ~250 km, as on the world grid
        for (let pass = 0; pass < 2; pass++) {
            const next = new Float32Array(3 * n);
            for (const r of touched) {
                let ax = across[3 * r], ay = across[3 * r + 1], az = across[3 * r + 2];
                for (let k = adjOffset[r]; k < adjOffset[r + 1]; k++) { const q = adjList[k]; if (has[q] && kindR[q] === kindR[r]) { ax += across[3 * q]; ay += across[3 * q + 1]; az += across[3 * q + 2]; } }
                const x = xyz[3 * r], y = xyz[3 * r + 1], z = xyz[3 * r + 2], d = ax * x + ay * y + az * z;
                ax -= d * x; ay -= d * y; az -= d * z;
                const l = Math.hypot(ax, ay, az);
                if (l > 1e-6) { next[3 * r] = ax / l; next[3 * r + 1] = ay / l; next[3 * r + 2] = az / l; }
            }
            across = next;
        }
        out.set(o, across);
        for (const r of touched) { has[r] = 0; kindR[r] = 0; }
    }
    return out;
}

/**
 * The signed coast distance measured on each plate's own raster (Phase 9, developer: steady detail). The world grid shows
 * a moving plate re-sampled cell by cell each step, so the land's outline on it jitters by up to half a cell and the coast
 * distance measured there with it: a drifting continent's coasts, shelves and coastal plains re-formed frame by frame.
 * On the plate's raster — the sim mesh carried by the plate — its land is where its crust is: each raster cell takes the
 * land/sea of the world cell showing it; one no world cell shows (a rotated raster leaves a few) takes its neighbours'
 * majority; beyond the plate's edge, the world as it stands (another plate's land, or the sea). The distance is spread over
 * the raster from where land meets sea, carrying the kind of coast (and `carried`: fields that go with it — its maturity), as
 * on the world grid. It overwrites `dist`, `coastKind` and the carried fields for the plate's world cells, and is
 * returned per plate (signed km per raster cell, the kind and the carried fields by their names — the plate and the ring
 * just beyond its edge; NaN further off) for the terrain, which reads the coast on the raster of the plate whose land is
 * there (synthesize.js): so a coastline rides with its continent even where the sea beyond is another plate's.
 */
function plateCoasts(simMesh, A, land, dist, coastKind, carried, frame, pocketKm2) {
    const { xyz, numCells: n, adjOffset, adjList } = simMesh, m = A.mats, out = new Map();
    const byPlate = new Map();
    for (let w = 0; w < n; w++) { const o = A.owner[w]; if (o >= 0) (byPlate.get(o) ?? byPlate.set(o, []).get(o)).push(w); }
    // the plates' own crust, where the frame carries it (plate by plate: where each plate's run starts)
    const runs = new Map();
    if (frame.crustCells) for (let i = 0; i < frame.crustCells.length; i++) { const o = Math.floor(frame.crustCells[i] / n); const r = runs.get(o); if (r) r.end = i + 1; else runs.set(o, { start: i, end: i + 1 }); }
    const landR = new Int8Array(n), kindR = new Uint8Array(n), onPlate = new Uint8Array(n), d = new Float32Array(n), land01 = new Uint8Array(n);
    const names = Object.keys(carried), from = names.map(k => carried[k]), onR = names.map(() => new Float32Array(n));
    const take = (r, w) => { for (let e = 0; e < onR.length; e++) onR[e][r] = from[e][w]; };       // (raster cell ← world cell)
    const copy = (r, q) => { for (let e = 0; e < onR.length; e++) onR[e][r] = onR[e][q]; };        // (raster cell ← raster cell)
    for (const o of [...byPlate.keys()].sort((a, b) => a - b)) {
        const cells = byPlate.get(o), b = 9 * o, known = [], run = runs.get(o);
        landR.fill(-1); onPlate.fill(0);
        for (const w of cells) { const r = A.cell[w]; if (landR[r] < 0) known.push(r); landR[r] = land[w]; kindR[r] = coastKind[w]; take(r, w); onPlate[r] = 1; }
        if (run) {
            // the whole plate, exactly: every crust cell's own type (small sea pockets in its land filled, as on the world
            // grid); a cell no world cell shows takes a shown neighbour's kind of coast
            land01.fill(0);
            for (let i = run.start; i < run.end; i++) { const r = frame.crustCells[i] - o * n; land01[r] = frame.crustType[i] !== CrustType.OCEAN ? 1 : 0; if (!onPlate[r]) { onPlate[r] = 2; kindR[r] = 255; } }
            fillPockets(simMesh, land01, pocketKm2);
            for (let i = run.start; i < run.end; i++) { const r = frame.crustCells[i] - o * n; landR[r] = land01[r]; }
            for (let pass = 0; pass < 3; pass++) for (let i = run.start; i < run.end; i++) {
                const r = frame.crustCells[i] - o * n;
                if (kindR[r] !== 255) continue;
                for (let k = adjOffset[r]; k < adjOffset[r + 1]; k++) { const q = adjList[k]; if (onPlate[q] && kindR[q] !== 255) { kindR[r] = kindR[q]; copy(r, q); break; } }
            }
            for (let i = run.start; i < run.end; i++) { const r = frame.crustCells[i] - o * n; if (kindR[r] === 255) { kindR[r] = 0; for (const a of onR) a[r] = 0; } }
        }
        // (no crust in the frame: a cell no world cell shows takes its shown neighbours' majority)
        if (!run) for (const r0 of known) for (let k = adjOffset[r0]; k < adjOffset[r0 + 1]; k++) {
            const r = adjList[k];
            if (landR[r] >= 0) continue;
            let shown = 0, landN = 0, kind = 0, last = -1;
            for (let j = adjOffset[r]; j < adjOffset[r + 1]; j++) { const q = adjList[j]; if (onPlate[q]) { shown++; landN += landR[q]; kind = kindR[q]; last = q; } }
            if (shown * 3 < 2 * (adjOffset[r + 1] - adjOffset[r])) continue;
            landR[r] = landN * 2 >= shown ? 1 : 0; kindR[r] = kind; copy(r, last); onPlate[r] = 2;
        }
        // one ring beyond the plate's edge: the world there, as it stands
        const ring = [], inRing = new Uint8Array(n);
        for (let r0 = 0; r0 < n; r0++) {
            if (!onPlate[r0]) continue;
            for (let k = adjOffset[r0]; k < adjOffset[r0 + 1]; k++) {
                const r = adjList[k];
                if (landR[r] >= 0) continue;
                const x = xyz[3 * r], y = xyz[3 * r + 1], z = xyz[3 * r + 2];
                const w = simMesh.index.nearest(m[b] * x + m[b + 1] * y + m[b + 2] * z, m[b + 3] * x + m[b + 4] * y + m[b + 5] * z, m[b + 6] * x + m[b + 7] * y + m[b + 8] * z);
                landR[r] = land[w]; kindR[r] = coastKind[w]; take(r, w); ring.push(r); inRing[r] = 1;
            }
        }
        // where land meets sea: half the distance between the two cells, the kind of the land side's coast
        d.fill(Infinity);
        for (let r = 0; r < n; r++) {
            if (landR[r] < 0) continue;
            for (let k = adjOffset[r]; k < adjOffset[r + 1]; k++) {
                const q = adjList[k];
                if (landR[q] < 0 || landR[q] === landR[r]) continue;
                const half = 0.5 * R * Math.acos(Math.min(1, xyz[3 * r] * xyz[3 * q] + xyz[3 * r + 1] * xyz[3 * q + 1] + xyz[3 * r + 2] * xyz[3 * q + 2]));
                if (half < d[r]) { d[r] = half; if (!landR[r]) { kindR[r] = kindR[q]; copy(r, q); } }
            }
        }
        spreadKm(simMesh, d, { canEnter: (a, q) => landR[q] >= 0 && landR[q] === landR[a], onReach: (a, q) => { kindR[q] = kindR[a]; copy(q, a); }, maxKm: 6000 });
        const signed = new Float32Array(n).fill(NaN);
        for (let r = 0; r < n; r++) if (onPlate[r] || inRing[r]) signed[r] = d[r] === Infinity ? (landR[r] ? 6000 : -6000) : landR[r] ? Math.min(6000, d[r]) : -Math.min(6000, d[r]);
        for (const w of cells) { const r = A.cell[w]; if (d[r] < Infinity) { dist[w] = d[r]; coastKind[w] = kindR[r]; for (let e = 0; e < onR.length; e++) from[e][w] = onR[e][r]; } }
        const kind = new Uint8Array(n), P = { coast: signed, kind };
        for (const k of names) P[k] = new Float32Array(n);
        for (let r = 0; r < n; r++) if (signed[r] === signed[r]) { kind[r] = kindR[r]; for (let e = 0; e < onR.length; e++) P[names[e]][r] = onR[e][r]; }
        out.set(o, P);
    }
    return out;
}

/** The area (km²) of the body of sea each sea cell belongs to (connected non-land cells); 0 on land. */
function seaAreas(simMesh, land) {
    const { adjOffset, adjList, numCells: n } = simMesh, cellKm2 = 4 * Math.PI * R * R / n;
    const area = new Float32Array(n), seen = new Uint8Array(n), members = [];
    for (let s = 0; s < n; s++) {
        if (land[s] || seen[s]) continue;
        members.length = 0; members.push(s); seen[s] = 1;
        for (let i = 0; i < members.length; i++) {
            const c = members[i];
            for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const nb = adjList[k]; if (!land[nb] && !seen[nb]) { seen[nb] = 1; members.push(nb); } }
        }
        for (const c of members) area[c] = members.length * cellKm2;
    }
    return area;
}

/** Sea pockets smaller than `maxKm2` (connected non-land cells enclosed by land) become land, in place. */
function fillPockets(simMesh, land, maxKm2) {
    const { adjOffset, adjList, numCells: n } = simMesh, maxCells = maxKm2 / (4 * Math.PI * 6371 * 6371 / n);
    if (maxCells < 1) return;
    const seen = new Uint8Array(n), members = [];
    for (let s = 0; s < n; s++) {
        if (land[s] || seen[s]) continue;
        members.length = 0; members.push(s); seen[s] = 1;
        for (let i = 0; i < members.length; i++) {
            const c = members[i];
            for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const nb = adjList[k]; if (!land[nb] && !seen[nb]) { seen[nb] = 1; members.push(nb); } }
        }
        if (members.length < maxCells) for (const c of members) land[c] = 1;
    }
}

/** Kinds of coast, for shelf / plain / slope widths (terrain-config.js `margins`). */
export const CoastKind = Object.freeze({ PASSIVE: 0, ACTIVE: 1, TRANSFORM: 2, COLLISION: 3, ARC: 4 });
const COAST_KEYS = ['passive', 'active', 'transform', 'collision', 'arc'];
/** A margin's shelf and coastal plain (km): its kind's, or for a passive one between the young and the mature widths by
 *  how far it has widened (its maturity on the open ocean) and its maturity (terrain-config.js marginMatureMyr). */
const shelfOf = (m, mature) => (m.youngShelfKm === undefined ? m.shelfKm : m.youngShelfKm + (m.shelfKm - m.youngShelfKm) * mature);
const plainOf = (m, mature) => (m.youngPlainKm === undefined ? m.plainKm : m.youngPlainKm + (m.plainKm - m.youngPlainKm) * mature);

/**
 * @returns {Object} per-sim-cell fields (typed arrays of length numCells unless noted):
 *   land (1 = non-ocean crust) · arc (1 = island-arc crust) · craton · riverIncKm / riverKm2 (the history's rivers:
 *   how deep they cut, what they drain; tectonics/step/rivers.js) · coastKm (signed distance to the edge of the continental crust, + inland) ·
 *   shelfKm / plainKm / slopeKm (from the nearest coast's kind) · maturity (the nearest coast's, if passive: 0 young … 1
 *   mature — its relief buried under the shelf and plain by that share; its shelf widened by it on the open ocean only:
 *   widen) · depthKm (sea floor, ocean cells) · ageMyr and
 *   fabricKm (abyssal-hill wavelength) for ocean cells · trenchKm / trenchDepthKm (distance to, and depth of, the
 *   live trench nearby) · riseKm (distance to it on the subducting plate) · platformKm (what a land cell stands at
 *   before relief) · armKm (distance from a failed rift arm) · erosion (how many times faster than the reference things
 *   erode here, by the latitude's estimated rainfall) · belts: [current, overprinted] (beltLayer below; the
 *   current layer's fields are also on the record itself: kind / dKm / reach / reliefKm / shear / across) · across (3 per cell: unit vector
 *   across the belt's strike, toward its far edge; zero if unknown).
 */
export function deriveRecords(frame, simMesh, cfg, seed = 0, A = buildAnchor(frame, simMesh)) {
    const n = simMesh.numCells, { xyz, adjOffset, adjList } = simMesh, time = frame.time;
    const noise = new SimplexNoise(seed * 13 + 5);
    const land = new Uint8Array(n);
    const arc = new Uint8Array(n), craton = new Uint8Array(n);
    for (let w = 0; w < n; w++) {
        land[w] = frame.owner[w] >= 0 && frame.type[w] !== CrustType.OCEAN ? 1 : 0;
        arc[w] = land[w] && frame.type[w] === CrustType.ARC ? 1 : 0;
        craton[w] = land[w] && frame.type[w] === CrustType.CRATON ? 1 : 0;
    }
    fillPockets(simMesh, land, cfg.pocketSeaKm2);

    // ── the coast: signed distance to the edge of the land crust, and what kind of coast is nearest ──
    const dist = new Float32Array(n).fill(Infinity), coastKind = new Uint8Array(n), maturity = new Float32Array(n), widen = new Float32Array(n), fresh = new Float32Array(n);
    const kindAtCoast = w => {                                        // w: a land cell on the coast
        if (frame.type[w] === CrustType.ARC && !(frame.flags[w] & CrustFlag.MARGIN_ISLE)) return CoastKind.ARC;
        const t = frame.margin[w] & Margin.TYPE;
        return t === Margin.ACTIVE ? CoastKind.ACTIVE : t === Margin.TRANSFORM ? CoastKind.TRANSFORM : t === Margin.COLLISION ? CoastKind.COLLISION : CoastKind.PASSIVE;
    };
    // A margin's kind is a property of a stretch of coast, not of one cell: the coast cells of a bay, or of a headland's
    // flank, on an active margin are not themselves at the plate boundary — alone they would read passive, and a passive
    // shelf (150 km) would drown the land behind the coastal range in patches. So the kinds other than passive carry
    // along the coast (coast cell to coast cell) for coastKindKm; a passive coast cell they reach takes the nearest.
    const onCoast = new Uint8Array(n), ownKind = new Uint8Array(n), along = new Float32Array(n).fill(Infinity);
    for (let w = 0; w < n; w++) {
        if (!land[w]) continue;
        for (let k = adjOffset[w]; k < adjOffset[w + 1]; k++) if (!land[adjList[k]]) { onCoast[w] = 1; break; }
        if (!onCoast[w]) continue;
        ownKind[w] = kindAtCoast(w);
        if (ownKind[w] !== CoastKind.PASSIVE && ownKind[w] !== CoastKind.ARC) along[w] = 0;
    }
    const carried = ownKind.slice();
    spreadKm(simMesh, along, { canEnter: (a, b) => onCoast[b] === 1, onReach: (a, b) => { carried[b] = carried[a]; }, maxKm: cfg.coastKindKm });
    for (let w = 0; w < n; w++) if (onCoast[w] && ownKind[w] === CoastKind.PASSIVE && along[w] <= cfg.coastKindKm) ownKind[w] = carried[w];
    // a passive coast's maturity (cfg.marginMatureMyr), by its age: the oldest ocean floor beside it — the floor that formed
    // as it broke away (a pre-history coast's: the pre-history floor's) — or less where its own belt was active since; on
    // its shelf widening with it on the open ocean only (cfg.marginOpenSeaKm2: by the area of the sea it faces)
    const seaKm2 = seaAreas(simMesh, land), ownMature = new Float32Array(n), ownWiden = new Float32Array(n);
    for (let w = 0; w < n; w++) {
        if (!onCoast[w] || ownKind[w] !== CoastKind.PASSIVE) continue;
        let age = frame.oroType[w] ? Math.max(0, time - frame.oroLast[w]) : Infinity, floor = -1, sea = 0;
        for (let k = adjOffset[w]; k < adjOffset[w + 1]; k++) {
            const nb = adjList[k];
            if (land[nb]) continue;
            if (seaKm2[nb] > sea) sea = seaKm2[nb];
            if (frame.owner[nb] >= 0) floor = Math.max(floor, time - frame.formedAt[nb]);
        }
        if (floor >= 0) age = Math.min(age, floor);
        ownMature[w] = age === Infinity ? 1 : 1 - Math.exp(-age / cfg.marginMatureMyr);
        ownWiden[w] = ownMature[w] * smooth(cfg.marginOpenSeaKm2[0], cfg.marginOpenSeaKm2[1], sea);
    }
    // how fresh a coast is (developer, 2026-10-18: the coast's cell-scale noise "weaker around fresh orogeny/rifts so that
    // mountain building dominates and the 'puzzle pieces' around continents sort of still fit"): a young rifted margin's
    // youth (1 − its maturity: the two sides of a young ocean still mirror each other), or how recently its own belt was
    // active (a rift's shoulders are a belt too) — 1 fresh, 0 long settled
    const ownFresh = new Float32Array(n);
    for (let w = 0; w < n; w++) {
        if (!onCoast[w]) continue;
        const belt = frame.oroType[w] ? Math.exp(-Math.max(0, time - frame.oroLast[w]) / cfg.coastFreshMyr) : 0;
        ownFresh[w] = Math.max(belt, ownKind[w] === CoastKind.PASSIVE ? 1 - ownMature[w] : 0);
    }
    for (let w = 0; w < n; w++) for (let k = adjOffset[w]; k < adjOffset[w + 1]; k++) {
        const nb = adjList[k];
        if (land[nb] === land[w]) continue;
        const half = 0.5 * R * Math.acos(Math.min(1, xyz[3 * w] * xyz[3 * nb] + xyz[3 * w + 1] * xyz[3 * nb + 1] + xyz[3 * w + 2] * xyz[3 * nb + 2]));
        if (half < dist[w]) { const at = land[w] ? w : nb; dist[w] = half; coastKind[w] = ownKind[at]; maturity[w] = ownMature[at]; widen[w] = ownWiden[at]; fresh[w] = ownFresh[at]; }
    }
    spreadKm(simMesh, dist, { canEnter: (a, b) => land[a] === land[b], onReach: (a, b) => { coastKind[b] = coastKind[a]; maturity[b] = maturity[a]; widen[b] = widen[a]; fresh[b] = fresh[a]; }, maxKm: 6000 });
    // …and measured again on each plate's own raster, which the world grid shows re-sampled a little differently every
    // step as the plate moves: the coast measured there is fixed in the crust (Phase 9, steady detail)
    const coastRaster = plateCoasts(simMesh, A, land, dist, coastKind, { maturity, widen, fresh }, frame, cfg.pocketSeaKm2);
    const coastKm = new Float32Array(n), shelfKm = new Float32Array(n), plainKm = new Float32Array(n), slopeKm = new Float32Array(n);
    for (let w = 0; w < n; w++) {
        const d = Math.min(6000, dist[w]);
        coastKm[w] = land[w] ? d : -d;
        // (the shelf's width varies by a noise read where the crust is in its plate's frame: it rides with the coast)
        const m = cfg.margins[COAST_KEYS[coastKind[w]]], rc = A.cell[w], x = xyz[3 * rc], y = xyz[3 * rc + 1], z = xyz[3 * rc + 2];
        const vary = 1 + cfg.shelfNoise * noise.fbm(x * 9 + 1.7, y * 9 + 4.2, z * 9 + 8.1, 3, 0.5) * 1.6;
        shelfKm[w] = shelfOf(m, widen[w]) * Math.max(0.2, vary); plainKm[w] = plainOf(m, maturity[w]); slopeKm[w] = m.slopeKm;
    }
    // …and each plate's shelf and coastal plain on its raster, from its kind of coast there (the same noise, read at the
    // raster cell: the crust's own position): the terrain reads them with the coast
    for (const P of coastRaster.values()) {
        P.shelf = new Float32Array(n); P.plain = new Float32Array(n);
        for (let r = 0; r < n; r++) {
            if (!(P.coast[r] === P.coast[r])) continue;
            const m = cfg.margins[COAST_KEYS[P.kind[r]]], x = xyz[3 * r], y = xyz[3 * r + 1], z = xyz[3 * r + 2];
            const vary = 1 + cfg.shelfNoise * noise.fbm(x * 9 + 1.7, y * 9 + 4.2, z * 9 + 8.1, 3, 0.5) * 1.6;
            P.shelf[r] = shelfOf(m, P.widen[r]) * Math.max(0.2, vary); P.plain[r] = plainOf(m, P.maturity[r]);
        }
    }

    // ── the sea floor: half-space cooling depth; oceanic plateaus; abyssal-hill wavelength from the age gradient ──
    // Ridge segments (plans/V2_REALISM_PASS_PLAN.md, phase 6; tectonics/model/segments.js): each segment's floor (the whole
    // part of its fracture-zone coordinate) reads as a little older or younger (± fractureOffsetMyr, fixed per segment), so
    // the ridge crest and the isochrons step where two segments meet — transform faults at the ridge, the scarps of fracture
    // zones across the ocean, shrinking with age as the two sides' depths converge (a fracture zone joins floor of two ages)
    const depthKm = new Float32Array(n), ageMyr = new Float32Array(n), fabricKm = new Float32Array(n), fzU = frame.fzU;
    const segmentShift = u => { const k = Math.floor(u), h = (Math.imul(k | 0, 2654435761) >>> 0) / 4294967296; return 2 * h - 1; };
    for (let w = 0; w < n; w++) {
        if (land[w]) continue;
        const raw = frame.owner[w] >= 0 ? Math.max(0, time - frame.formedAt[w]) : 100;
        const age = fzU?.[w] ? Math.max(0, raw + cfg.fractureOffsetMyr * segmentShift(fzU[w])) : raw;
        ageMyr[w] = age;
        depthKm[w] = seaDepthKm(age);
    }
    // oceanic plateaus (a flood basalt on the sea floor): read from the world view, where at any moment ~15 % of a moving
    // plate's cells show a neighbour's crust, then smoothed over lipSeaSmoothKm and never lowered inside — one broad rise
    // with gentle flanks, not pocked by those cells and the province's ragged edge (plans/V2_REALISM_PASS_PLAN.md, phase 4:
    // the recordings showed moth-eaten plateaus, and a rash of shallow specks wherever one moved)
    {
        const lift = new Float32Array(n);
        for (let w = 0; w < n; w++) if (!land[w] && frame.volcType[w] === VolcanicType.LIP) lift[w] = cfg.lipSeaKm * Math.min(cfg.lipMaxKm, frame.volcKm[w]);
        let a = lift.slice(), b = new Float32Array(n);
        for (let pass = 0, passes = Math.max(1, Math.round(cfg.lipSeaSmoothKm / simMesh.edgeKm)); pass < passes; pass++) {
            for (let w = 0; w < n; w++) {
                if (land[w]) { b[w] = 0; continue; }
                let s = a[w], k = 1;
                for (let j = adjOffset[w]; j < adjOffset[w + 1]; j++) { const nb = adjList[j]; if (!land[nb]) { s += a[nb]; k++; } }
                b[w] = s / k;
            }
            [a, b] = [b, a];
        }
        for (let w = 0; w < n; w++) if (!land[w]) depthKm[w] -= Math.max(lift[w], a[w]);
    }
    const grad = [0, 0, 0];
    for (let w = 0; w < n; w++) {
        if (land[w]) continue;
        const g = gradient(simMesh, ageMyr, w, nb => !land[nb], grad);     // Myr per km
        fabricKm[w] = g > 1e-4 ? cfg.fabricPeriodMyr / g : 1e4;
    }

    // the fracture zones themselves are drawn where the coordinate, read across the terrain mesh, passes a whole number
    // (synthesize.js): the ocean's coordinates, handed on
    // (smoothed over fractureSmoothKm within each plate's floor: the spreading poles drift a few degrees between rows, and
    // the strips show through the noise that leaves)
    let fractureU = new Float32Array(n);
    if (fzU) {
        for (let w = 0; w < n; w++) if (!land[w] && frame.owner[w] >= 0) fractureU[w] = fzU[w];
        let b = new Float32Array(n);
        for (let pass = 0, passes = Math.max(1, Math.round(cfg.fractureSmoothKm / simMesh.edgeKm)); pass < passes; pass++) {
            for (let w = 0; w < n; w++) {
                if (!fractureU[w]) { b[w] = 0; continue; }
                let s = fractureU[w], k = 1;
                for (let j = adjOffset[w]; j < adjOffset[w + 1]; j++) { const nb = adjList[j]; if (fractureU[nb] && frame.owner[nb] === frame.owner[w] && Math.abs(fractureU[nb] - fractureU[w]) < 2) { s += fractureU[nb]; k++; } }
                b[w] = s / k;
            }
            [fractureU, b] = [b, fractureU];
        }
    }

    // ── live trenches: the axis is the subducting plate's edge; depth by the age of the slab going down ──
    const trenchDist = new Float32Array(n).fill(Infinity), riseDist = new Float32Array(n).fill(Infinity), trenchDepthKm = new Float32Array(n);
    for (let w = 0; w < n; w++) {
        if (frame.boundary[w] !== BoundaryKind.SUBDUCTING || land[w]) continue;
        trenchDist[w] = 0; riseDist[w] = 0;
        trenchDepthKm[w] = cfg.trenchKm * (0.6 + 0.4 * Math.min(1, ageMyr[w] / 100));
    }
    spreadKm(simMesh, trenchDist, { canEnter: (a, b) => !land[b], onReach: (a, b) => { trenchDepthKm[b] = trenchDepthKm[a]; }, maxKm: 500 });
    spreadKm(simMesh, riseDist, { canEnter: (a, b) => !land[b] && frame.owner[b] === frame.owner[a], maxKm: 500 });
    const trenchKm = new Float32Array(n), riseKm = new Float32Array(n);
    for (let w = 0; w < n; w++) { trenchKm[w] = Math.min(1e4, trenchDist[w]); riseKm[w] = Math.min(1e4, riseDist[w]); }

    // ── how fast things erode here: faster where it rains more (terrain-config.js rainByLatitude) ──
    const erosion = new Float32Array(n);
    for (let w = 0; w < n; w++) erosion[w] = erosionAtLatitude(Math.asin(Math.max(-1, Math.min(1, xyz[3 * w + 2]))) * 180 / Math.PI, cfg);

    // ── the continental platform: crust kind, isostasy of the thickened crust, mantle swell (relative), flood basalts apart ──
    const platformKm = new Float32Array(n), quietMyr = new Float32Array(n);
    const lipKm = new Float32Array(n), lipWornKm = new Float32Array(n), lipSrc = new Uint16Array(n), lipBornMyr = new Float32Array(n);
    // dynamic topography is relative: the land rises where the mantle under it is hotter than under the land on average
    // (a continent that sat still while the others drifted), and none rises where all of it is as hot (a supercontinent)
    let heatSum = 0, landCount = 0;
    for (let w = 0; w < n; w++) if (land[w]) { heatSum += (frame.mantleHeat[w] / 255) ** 2; landCount++; }
    const heatMean = landCount ? heatSum / landCount : 0;
    // an island arc out in the open ocean stays a submerged ridge its volcanoes break through (the Marianas, Tonga); near a
    // continent it matures into land (Japan) — by its distance from continental crust (developer: far-ocean arcs "just
    // getting huge"; the history also keeps them narrow there, tectonics/step/wings.js)
    const farHops = Math.ceil(cfg.arcOceanKm / simMesh.edgeKm);
    const contHops = hopDistance(simMesh, w => frame.owner[w] >= 0 && (frame.type[w] === CrustType.CONTINENT || frame.type[w] === CrustType.CRATON), farHops);
    const arcMatureAt = w => {
        const km = contHops[w] < 0 ? Infinity : contHops[w] * simMesh.edgeKm;
        const t = Math.min(1, Math.max(0, (cfg.arcOceanKm - km) / (cfg.arcOceanKm - cfg.arcCoastKm)));
        return cfg.arcOceanMatureKm + (cfg.arcMatureKm - cfg.arcOceanMatureKm) * t * t * (3 - 2 * t);
    };
    for (let w = 0; w < n; w++) {
        if (!land[w]) continue;
        const type = frame.type[w], flags = frame.flags[w];
        const quiet = frame.oroType[w] ? Math.max(0, time - frame.oroLast[w]) : time;
        quietMyr[w] = quiet;
        let h;
        if (type === CrustType.CRATON) h = cfg.cratonKm;
        else if (type === CrustType.ARC) {
            if (flags & CrustFlag.MARGIN_ISLE) h = cfg.foreArcIsleKm;
            else { const m = Math.min(1, Math.max(0, (time - frame.formedAt[w]) / cfg.arcMatureMyr)); h = cfg.arcYoungKm + (arcMatureAt(w) - cfg.arcYoungKm) * m ** 0.7; }
        } else h = cfg.continentKm;
        // the evolved root, by Airy isostasy, and the evolved uplift above it (tectonics/step/heights.js)
        const root = frame.rootKm[w] * (type === CrustType.ARC ? 0.25 : 1);     // (an arc's recorded thickening is mostly its own growth, already in its maturity)
        h += cfg.isoMaxKm * (1 - Math.exp(-root / cfg.isoScaleKm));        // (the evolved uplift is carried separately: upliftKm)
        h += cfg.swellKm * Math.max(0, (frame.mantleHeat[w] / 255) ** 2 - heatMean);
        h += frame.baseKm[w];                                               // (the start world's swells, as worn so far)
        if (frame.volcType[w] === VolcanicType.LIP) {                   // (the pile, and how far it has worn: lips.js)
            lipKm[w] = cfg.lipLandKm * Math.min(cfg.lipMaxKm, frame.volcKm[w]); lipWornKm[w] = frame.volcWornKm[w]; lipSrc[w] = frame.volcSource[w];
            lipBornMyr[w] = Math.max(0, frame.time - frame.volcAt[w]);     // (how long ago it erupted: a belt active since folded it)
        }
        platformKm[w] = h;
    }
    // how far in from a province's edge (its escarpment retreats from there)
    const lipEdge = new Float32Array(n);
    for (let w = 0; w < n; w++) lipEdge[w] = lipKm[w] > 0 ? Infinity : 0;
    spreadKm(simMesh, lipEdge, { canEnter: (a, b) => lipKm[b] > 0, maxKm: 2000 });
    const lipEdgeKm = Float32Array.from(lipEdge, d => Math.min(2000, d));
    // …and how far out from one, over the land (its dykes come out from under the lava across the edge)
    const lipOut = new Float32Array(n);
    for (let w = 0; w < n; w++) lipOut[w] = lipKm[w] > 0 ? 0 : Infinity;
    spreadKm(simMesh, lipOut, { canEnter: (a, b) => land[b] === 1, maxKm: 3000 });
    const lipOutKm = Float32Array.from(lipOut, d => Math.min(3000, d));

    // ── failed rift arms: distance from the arm (a line one cell wide — the terrain gives it a width in km) ──
    const armDist = new Float32Array(n).fill(Infinity);
    for (let w = 0; w < n; w++) if (land[w] && (frame.flags[w] & CrustFlag.FAILED_RIFT)) armDist[w] = 0;
    spreadKm(simMesh, armDist, { maxKm: 600 });
    const armKm = Float32Array.from(armDist, d => Math.min(1e4, d));

    // ── belts, in two layers: the current belt, and the one it overprinted (crust.prev*) ──
    const current = beltLayer(frame, simMesh, cfg, land, coastKm, A, { type: frame.oroType, u: frame.beltU, reach: frame.beltReach, side: frame.beltSide, shear: frame.beltShear, last: frame.oroLast, rugged: frame.rugged, layer: 0 });
    const overprinted = beltLayer(frame, simMesh, cfg, land, coastKm, A, { type: frame.prevType, u: frame.prevU, reach: frame.prevReach, side: frame.prevSide, shear: frame.prevShear, last: frame.prevLast, rugged: frame.prevRugged, layer: 1 });
    const { kind, dKm, reach, reliefKm, shear, across } = current;

    // ── cratons (terrain/cratons.js): what a range beside a shield weighs on it — its height above the lowland, by the
    // kind of front (a foreland bends into the shield before an Andean range or a collision's lower plate; where a
    // plateau's back meets the block, the front stays steep) ──
    const loadW = new Float32Array(n);
    for (let w = 0; w < n; w++) {
        if (!land[w] || craton[w] || !kind[w]) continue;
        const type = kindType(kind[w]), side = kindSide(kind[w]);
        const weight = (cfg.forelandByKind?.[type] ?? 0) * (type === OrogenyType.HIMALAYAN && side === BeltSide.UPPER ? cfg.forelandUpperPlate : 1);
        if (!(weight > 0)) continue;
        loadW[w] = weight * Math.min(cfg.foredeepMaxKm, cfg.foredeepPerKm * Math.max(0, platformKm[w] - cfg.continentKm + frame.upliftKm[w] + 0.5 * reliefKm[w]));
    }
    const cratons = plateCratons(simMesh, A, frame, loadW);
    // a scrap of craton (a patch whose deepest point is under ~cratonScrapKm from its edge) reads as its surroundings: it
    // takes the ground around it — the range's thickened crust, its uplift and crests (a shield never thickens, so a
    // scrap inside a plateau would stand as a hole in it) — by the share the terrain reads it as them (terrain/cratons.js)
    let upliftKm = frame.upliftKm;
    const seenScrap = new Uint8Array(n), members = [];
    for (let w0 = 0; w0 < n; w0++) {
        if (!craton[w0] || seenScrap[w0] || cratons.patchW[w0] >= 1.5 * cfg.cratonScrapKm) continue;
        members.length = 0; members.push(w0); seenScrap[w0] = 1;
        let m = 0, pl = 0, up = 0, r0 = 0, r1 = 0;
        for (let i = 0; i < members.length; i++) for (let k = simMesh.adjOffset[members[i]]; k < simMesh.adjOffset[members[i] + 1]; k++) {
            const q = simMesh.adjList[k];
            if (craton[q]) { if (!seenScrap[q]) { seenScrap[q] = 1; members.push(q); } continue; }
            if (!land[q]) continue;
            m++; pl += platformKm[q]; up += frame.upliftKm[q]; r0 += reliefKm[q]; r1 += overprinted.reliefKm[q];
        }
        if (!m) continue;
        if (upliftKm === frame.upliftKm) upliftKm = Float32Array.from(frame.upliftKm);
        for (const w of members) {
            const s = Math.min(1, Math.max(0, (cratons.patchW[w] - 0.5 * cfg.cratonScrapKm) / cfg.cratonScrapKm)), f = 1 - s * s * (3 - 2 * s);
            // (the platform keeps the shield's own offset: the terrain takes it off by the same share)
            platformKm[w] += f * (pl / m + cfg.cratonKm - cfg.continentKm - platformKm[w]);
            upliftKm[w] += f * (up / m - upliftKm[w]);
            reliefKm[w] = Math.max(reliefKm[w], f * r0 / m); overprinted.reliefKm[w] = Math.max(overprinted.reliefKm[w], f * r1 / m);
        }
    }

    return { coastRaster, land, arc, craton, riverIncKm: frame.riverIncKm, riverKm2: frame.riverKm2, coastKm, coastKind, maturity, coastFresh: fresh, shelfKm, plainKm, slopeKm, depthKm, ageMyr, fabricKm, trenchKm, riseKm, trenchDepthKm, fractureU,
        platformKm, upliftKm, cratons, terrane: frame.terrane, lipKm, lipWornKm, lipSrc, lipBornMyr, lipEdgeKm, lipOutKm, quietMyr, armKm, erosion, kind, dKm, reach, reliefKm, shear, across, belts: [current, overprinted], time,
        ...farFieldRecords(frame, n, cfg) };
}

/**
 * The far field (tectonics/step/far-field.js) as the terrain reads it, per world cell:
 *   farPhase — a coordinate ACROSS the fronts that pushed the crust: how far the push came (km of path cost, averaged by
 *     what each push brought). Its level lines run along the fronts (and swing round a craton, which passes the push on:
 *     there they lie further apart — a stiff plate folds over a longer wavelength); smooth across craton edges and weak
 *     lines, and still while a front keeps pushing from where it stands — so what the terrain reads across it (the
 *     folds, the grain) rides with the crust, frame to frame, and changes only as the fronts that push it do;
 *   farGrain — how strongly the push the crust took up in all (× its take: a craton little) left its grain (0…1);
 *   farFold — how strongly the push it took up lately folds it now (0…1);
 *   farAxis — the axis it was squeezed along (3 per cell, unit, in the plate's frame; zero where none).
 * A frame from before the far field reads as none.
 */
function farFieldRecords(frame, n, cfg) {
    const farGrain = new Float32Array(n), farFold = new Float32Array(n), farPhase = new Float32Array(n), farAxis = new Float32Array(3 * n);
    if (!frame.farWork || !frame.farDir) return { farGrain, farFold, farPhase, farAxis };
    const weak = CrustFlag.SUTURE | CrustFlag.FAILED_RIFT | CrustFlag.RIFT_MARGIN;
    for (let w = 0; w < n; w++) {
        if (frame.owner[w] < 0 || frame.type[w] === CrustType.OCEAN) continue;
        const reached = frame.farWork[w];
        if (!(reached > 0)) continue;
        farPhase[w] = frame.farDist ? frame.farDist[w] : 0;
        const take = frame.type[w] === CrustType.CRATON ? cfg.farCratonTakeTerrain : (frame.flags[w] & weak) ? cfg.farWeakTakeTerrain : 1;
        farGrain[w] = 1 - Math.exp(-reached * take / cfg.farGrainWorkKm);
        farFold[w] = 1 - Math.exp(-(frame.farFold?.[w] ?? 0) * take / cfg.farFoldWorkKm);
        const dx = frame.farDir[3 * w], dy = frame.farDir[3 * w + 1], dz = frame.farDir[3 * w + 2], l = Math.hypot(dx, dy, dz);
        if (l > 0) { farAxis[3 * w] = dx / l; farAxis[3 * w + 1] = dy / l; farAxis[3 * w + 2] = dz / l; }
    }
    return { farGrain, farFold, farPhase, farAxis };
}

/**
 * One layer of belts, read from the given per-cell record arrays (the current belt's, or the overprinted one's):
 * { kind, dKm (distance from the front), reach, reliefKm (its crests' evolved height), shear, quietMyr, across (3 per cell:
 * unit vector across the strike, toward the far edge; zero if unknown) }.
 */
function beltLayer(frame, simMesh, cfg, land, coastKm, A, rec) {
    const n = simMesh.numCells, { xyz, adjOffset, adjList } = simMesh, time = frame.time, grad = [0, 0, 0];
    const kind = new Uint8Array(n), dKm = new Float32Array(n), reach = new Float32Array(n), reliefKm = new Float32Array(n), shear = new Float32Array(n), quietMyr = new Float32Array(n);
    for (let w = 0; w < n; w++) {
        const type = rec.type[w];
        if (!land[w] || !type) continue;
        kind[w] = kindOf(type, type === OrogenyType.URAL || type === OrogenyType.HIMALAYAN ? rec.side[w] || BeltSide.UPPER : BeltSide.NONE);
        reach[w] = rec.reach[w];
        dKm[w] = (rec.u[w] / 255) * reach[w];
        shear[w] = rec.shear[w];
        quietMyr[w] = Math.max(0, time - rec.last[w]);
        reliefKm[w] = rec.rugged[w];                  // the crests' height, as the history built and wore it (tectonics/step/heights.js)
    }
    // the distance across a belt is a coordinate: from one cell to the next it changes by no more than the distance between
    // them. The history leaves the odd cell with a stale one — at the belt's far edge amid its front — and the terrain,
    // interpolating across, drew the belt's ranges around it in a ring (developer: "mountain donuts or crescents"). Such a
    // cell takes the median of its same-kind neighbours'; the rest are left as recorded.
    const raw = dKm.slice(), vals = [], jumpKm = 1.3 * simMesh.edgeKm;
    for (let w = 0; w < n; w++) {
        if (!kind[w]) continue;
        vals.length = 0;
        for (let k = adjOffset[w]; k < adjOffset[w + 1]; k++) { const nb = adjList[k]; if (kind[nb] === kind[w]) vals.push(raw[nb]); }
        if (vals.length < 2) continue;
        vals.sort((a, b) => a - b);
        const mid = vals.length % 2 ? vals[vals.length >> 1] : 0.5 * (vals[(vals.length >> 1) - 1] + vals[vals.length >> 1]);
        if (Math.abs(raw[w] - mid) > jumpKm) dKm[w] = mid;
    }
    // a scrap of a belt cannot hold its cross-section: its crests scale with the area of its patch (terrain-config.js
    // beltPatchMinKm2) — the patch of the same kind of belt, both sides of a collision together
    const patch = new Int32Array(n).fill(-1), cellKm2 = 4 * Math.PI * 6371 * 6371 / n, queue = [];
    for (let w0 = 0; w0 < n; w0++) {
        if (!kind[w0] || patch[w0] >= 0) continue;
        const type = kindType(kind[w0]);
        queue.length = 0; queue.push(w0); patch[w0] = w0;
        for (let i = 0; i < queue.length; i++) for (let k = adjOffset[queue[i]]; k < adjOffset[queue[i] + 1]; k++) {
            const nb = adjList[k];
            if (kind[nb] && patch[nb] < 0 && kindType(kind[nb]) === type) { patch[nb] = w0; queue.push(nb); }
        }
        const s = Math.min(1, Math.max(0, (queue.length * cellKm2 - cfg.beltPatchMinKm2) / (cfg.beltPatchFullKm2 - cfg.beltPatchMinKm2))), scale = s * s * (3 - 2 * s);
        if (scale < 1) for (const w of queue) reliefKm[w] *= scale;
    }

    // which way across the strike: straight away from the nearest point of the belt's front
    // (Not the gradient of the recorded distance itself: that was measured along mesh edges, and a distance measured
    // that way has contours that snap toward the mesh's six directions — its gradient is off by tens of degrees.)
    let across = new Float32Array(3 * n);
    const fromFront = new Float32Array(n).fill(Infinity), frontOf = new Int32Array(n).fill(-1);
    for (let w = 0; w < n; w++) if (kind[w] && reach[w] > 0 && rec.u[w] === 0) { fromFront[w] = 0; frontOf[w] = w; }
    spreadKm(simMesh, fromFront, { canEnter: (a, b) => kind[b] === kind[a], onReach: (a, b) => { frontOf[b] = frontOf[a]; } });
    for (let w = 0; w < n; w++) {
        if (!kind[w]) continue;
        const f = frontOf[w];
        if (f >= 0 && f !== w) {
            const x = xyz[3 * w], y = xyz[3 * w + 1], z = xyz[3 * w + 2];
            let ax = x - xyz[3 * f], ay = y - xyz[3 * f + 1], az = z - xyz[3 * f + 2];
            const r = ax * x + ay * y + az * z; ax -= r * x; ay -= r * y; az -= r * z;
            const l = Math.hypot(ax, ay, az);
            if (l > 1e-9) { across[3 * w] = ax / l; across[3 * w + 1] = ay / l; across[3 * w + 2] = az / l; continue; }
        }
        const g = gradient(simMesh, dKm, w, nb => kind[nb] === kind[w] && reach[nb] > 0, grad);     // (a front cell: its belt's slope)
        if (g > 1e-3) { across[3 * w] = grad[0] / g; across[3 * w + 1] = grad[1] / g; across[3 * w + 2] = grad[2] / g; }
    }
    for (let pass = 0; pass < 2; pass++) {                                   // smooth over ~250 km within the belt
        const next = new Float32Array(3 * n);
        for (let w = 0; w < n; w++) {
            if (!kind[w]) continue;
            let ax = across[3 * w], ay = across[3 * w + 1], az = across[3 * w + 2];
            for (let k = adjOffset[w]; k < adjOffset[w + 1]; k++) { const nb = adjList[k]; if (kind[nb] === kind[w]) { ax += across[3 * nb]; ay += across[3 * nb + 1]; az += across[3 * nb + 2]; } }
            const x = xyz[3 * w], y = xyz[3 * w + 1], z = xyz[3 * w + 2], r = ax * x + ay * y + az * z;
            ax -= r * x; ay -= r * y; az -= r * z;
            const l = Math.hypot(ax, ay, az);
            if (l > 1e-6) { next[3 * w] = ax / l; next[3 * w + 1] = ay / l; next[3 * w + 2] = az / l; }
        }
        across = next;
    }
    // where the belt gives no direction (a belt one cell wide, an arc's birth line), fall back on the coast's: inland
    for (let w = 0; w < n; w++) {
        if (!kind[w] || across[3 * w] || across[3 * w + 1] || across[3 * w + 2]) continue;
        const g = gradient(simMesh, coastKm, w, () => true, grad);
        if (g > 1e-6) { across[3 * w] = grad[0] / g; across[3 * w + 1] = grad[1] / g; across[3 * w + 2] = grad[2] / g; }
    }
    return { kind, dKm, reach, reliefKm, shear, quietMyr, across, acrossRaster: rasterAcross(simMesh, A, kind, rec.u, reach, across, frame, rec.layer) };
}

/**
 * Least-squares gradient of `field` at cell w (per km, as a tangent vector in `out`) from the neighbours that pass
 * `use`. Returns its magnitude (0 if it cannot be fitted).
 */
export function gradient(mesh, field, w, use, out) {
    const { xyz, adjOffset, adjList } = mesh;
    const x = xyz[3 * w], y = xyz[3 * w + 1], z = xyz[3 * w + 2];
    // tangent basis at w
    let ex = -y, ey = x, ez = 0;
    if (Math.hypot(ex, ey) < 1e-6) { ex = 1; ey = 0; }
    const el = Math.hypot(ex, ey, ez); ex /= el; ey /= el; ez /= el;
    const nx = y * ez - z * ey, ny = z * ex - x * ez, nz = x * ey - y * ex;
    let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0, used = 0;
    for (let k = adjOffset[w]; k < adjOffset[w + 1]; k++) {
        const nb = adjList[k];
        if (!use(nb)) continue;
        const dx = (xyz[3 * nb] - x) * R, dy = (xyz[3 * nb + 1] - y) * R, dz = (xyz[3 * nb + 2] - z) * R;
        const u = dx * ex + dy * ey + dz * ez, v = dx * nx + dy * ny + dz * nz, df = field[nb] - field[w];
        a11 += u * u; a12 += u * v; a22 += v * v; b1 += u * df; b2 += v * df; used++;
    }
    const det = a11 * a22 - a12 * a12;
    if (used < 2 || Math.abs(det) < 1e-6 * (a11 + a22) ** 2) { out[0] = out[1] = out[2] = 0; return 0; }
    const g1 = (a22 * b1 - a12 * b2) / det, g2 = (a11 * b2 - a12 * b1) / det;
    out[0] = g1 * ex + g2 * nx; out[1] = g1 * ey + g2 * ny; out[2] = g1 * ez + g2 * nz;
    return Math.hypot(g1, g2);
}
