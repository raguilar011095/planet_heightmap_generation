// Headless acceptance checks for Phase 8a (the tectonic surface: heights from the history's records, before carving).
// Usage: node v2/tools/check-phase8a.mjs

import { check, section, finish, labMesh, checkLabPhaseLoads, LAB_MESH_SEED } from './lib/check-kit.mjs';
import { simulate } from '../js/tectonics/simulate.js';
import { TERRAIN_SCENES } from '../js/tectonics/scenarios/terrain-scenes.js';
import { CrustType, CrustFlag, OrogenyType, BeltSide, VolcanicType } from '../js/tectonics/model/crust.js';
import { terrainMesh } from '../js/terrain/terrain-mesh.js';
import { synthesizeTerrain, hypsometry, preparePlan } from '../js/terrain/synthesize.js';
import { coneAt, VOLCANO_STRIDE, VOLCANO_WEAR_SLOT } from '../js/terrain/volcanoes.js';
import { locate } from '../js/core/mesh-locate.js';
import { quatToMat3 } from '../js/core/rotation.js';
import { TerrainPool } from '../js/terrain/terrain-pool.js';
import { TERRAIN, terrainConfig, erosionAtLatitude } from '../js/terrain/terrain-config.js';
import { kindType, kindSide, gradient, CoastKind } from '../js/terrain/records.js';
import { crossAt } from '../js/terrain/stripes.js';

const SEED = 12345;
const mesh = labMesh();
const median = a => { if (!a.length) return NaN; const s = Float64Array.from(a).sort(); return s[s.length >> 1]; };
const quantile = (a, p) => { if (!a.length) return NaN; const s = Float64Array.from(a).sort(); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const mean = a => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);

function run(id, heights = null) {
    const scene = TERRAIN_SCENES.find(s => s.id === id), world = scene.build(mesh, SEED);
    if (heights) world.config.heights = terrainConfig(heights);           // (the heights evolve with these; the history is the same)
    const { frames } = simulate(world, { untilMyr: scene.maxMyr, drive: w => scene.drive(w), snapshotEveryMyr: scene.maxMyr > 200 ? 50 : 10 });
    return { world, frame: frames.at(-1), first: frames[0], frames };
}
function terrainWith(frame, cells, overrides) {
    const tm = terrainMesh(cells);
    return { ...synthesizeTerrain(frame, mesh, tm, { seed: SEED, parts: true, cfg: terrainConfig(overrides) }), tm };
}
function terrain(frame, cells = 640000) {
    const tm = terrainMesh(cells), started = performance.now();
    const T = synthesizeTerrain(frame, mesh, tm, { seed: SEED, parts: true });
    return { ...T, tm, seconds: (performance.now() - started) / 1000 };
}
/** Per terrain cell: the sim cell it takes its records from (its nearest corner), and that cell's belt kind / position. */
const corner = (T, t) => T.sampler.cells[3 * t];
/** Angle between two tangent directions taken as LINES (0…90°). */
const lineAngle = (a, b) => { const la = Math.hypot(...a), lb = Math.hypot(...b); return Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (la * lb))) * 180 / Math.PI; };
/**
 * How the ridges run against a direction field. For every sim cell, the dominant direction ACROSS the ridges is read
 * from the terrain cells around it (the structure tensor of the ridge stripes' gradient — the standard measure of a
 * texture's orientation), and compared with `awayAt(c)`, the direction straight away from a line (the coast, the
 * suture): 0° means the ridges run parallel to that line. Only sim cells whose ridges clearly run one way count.
 * @returns {number[]} one angle (0…90°) per sim cell measured
 */
function ridgeAngles(T, awayAt, use) {
    const g = [0, 0, 0], J = new Map();                              // sim cell → [Jee, Jen, Jnn, count]
    for (let t = 0; t < T.tm.numCells; t++) {
        if (!use(t)) continue;
        if (gradient(T.tm, T.parts.stripes, t, () => true, g) < 1e-6) continue;      // (orientation only: the tensor is weighted by g² anyway)
        const c = mesh.index.nearest(T.tm.xyz[3 * t], T.tm.xyz[3 * t + 1], T.tm.xyz[3 * t + 2]);
        const [e, n] = frameAt(c), ge = g[0] * e[0] + g[1] * e[1] + g[2] * e[2], gn = g[0] * n[0] + g[1] * n[1] + g[2] * n[2];
        const a = J.get(c) ?? J.set(c, [0, 0, 0, 0]).get(c);
        a[0] += ge * ge; a[1] += ge * gn; a[2] += gn * gn; a[3]++;
    }
    const out = [];
    for (const [c, [ee, en, nn, count]] of J) {
        if (count < 4) continue;
        const coherence = Math.hypot(ee - nn, 2 * en) / (ee + nn);
        const f = awayAt(c);
        if (coherence < 0.3 || !f) continue;
        const th = 0.5 * Math.atan2(2 * en, ee - nn), [e, n] = frameAt(c);
        const across = [Math.cos(th) * e[0] + Math.sin(th) * n[0], Math.cos(th) * e[1] + Math.sin(th) * n[1], Math.cos(th) * e[2] + Math.sin(th) * n[2]];
        out.push(lineAngle(across, f));
    }
    return out;
}
/**
 * Straight away from the nearest of a set of points (unit vectors, 3 per point), as a tangent direction at sim cell
 * c — measured in straight lines, not along mesh edges (a distance measured along the mesh has contours that snap to
 * its six directions, and its gradient is no fair reference). Null at the points themselves.
 */
function awayFrom(points) {
    return c => {
        const x = mesh.xyz[3 * c], y = mesh.xyz[3 * c + 1], z = mesh.xyz[3 * c + 2];
        let best = -2, bx = 0, by = 0, bz = 0;
        for (let i = 0; i < points.length; i += 3) { const d = x * points[i] + y * points[i + 1] + z * points[i + 2]; if (d > best) { best = d; bx = points[i]; by = points[i + 1]; bz = points[i + 2]; } }
        let ax = x - bx, ay = y - by, az = z - bz;
        const r = ax * x + ay * y + az * z; ax -= r * x; ay -= r * y; az -= r * z;
        return Math.hypot(ax, ay, az) > 1e-4 ? [ax, ay, az] : null;
    };
}
/**
 * The inland direction of a coast, smoothed along it: at every edge between a land cell (passing `land`) and a sea
 * cell (passing `sea`), the direction from sea to land, averaged over σ = smoothKm of coast (the sim coast zigzags
 * cell by cell). At sim cell c: that smoothed direction at the nearest point of the coast.
 */
function inlandOf(land, sea, smoothKm = 200) {
    const pts = [], dirs = [];
    for (let w = 0; w < mesh.numCells; w++) if (land(w)) for (let k = mesh.adjOffset[w]; k < mesh.adjOffset[w + 1]; k++) {
        const nb = mesh.adjList[k];
        if (!sea(nb)) continue;
        pts.push([(mesh.xyz[3 * w] + mesh.xyz[3 * nb]) / 2, (mesh.xyz[3 * w + 1] + mesh.xyz[3 * nb + 1]) / 2, (mesh.xyz[3 * w + 2] + mesh.xyz[3 * nb + 2]) / 2]);
        dirs.push([mesh.xyz[3 * w] - mesh.xyz[3 * nb], mesh.xyz[3 * w + 1] - mesh.xyz[3 * nb + 1], mesh.xyz[3 * w + 2] - mesh.xyz[3 * nb + 2]]);
    }
    const s2 = (smoothKm / 6371) ** 2, smoothDir = pts.map(p => {
        const sum = [0, 0, 0];
        pts.forEach((q, j) => { const d2 = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2; if (d2 < 9 * s2) { const g = Math.exp(-d2 / (2 * s2)); sum[0] += g * dirs[j][0]; sum[1] += g * dirs[j][1]; sum[2] += g * dirs[j][2]; } });
        return sum;
    });
    return c => {
        const x = mesh.xyz[3 * c], y = mesh.xyz[3 * c + 1], z = mesh.xyz[3 * c + 2];
        let best = -2, bi = -1;
        pts.forEach((p, i) => { const d = x * p[0] + y * p[1] + z * p[2]; if (d > best) { best = d; bi = i; } });
        return bi >= 0 ? smoothDir[bi] : null;
    };
}
/** Midpoints of the edges between cells passing `a` and cells passing `b`: a line, sampled finer than the cells. */
function edgeMidpoints(a, b) {
    const out = [];
    for (let w = 0; w < mesh.numCells; w++) if (a(w)) for (let k = mesh.adjOffset[w]; k < mesh.adjOffset[w + 1]; k++) { const nb = mesh.adjList[k]; if (b(nb)) out.push((mesh.xyz[3 * w] + mesh.xyz[3 * nb]) / 2, (mesh.xyz[3 * w + 1] + mesh.xyz[3 * nb + 1]) / 2, (mesh.xyz[3 * w + 2] + mesh.xyz[3 * nb + 2]) / 2); }
    return out;
}
/** East and north unit vectors at sim cell c. */
function frameAt(c) {
    const x = mesh.xyz[3 * c], y = mesh.xyz[3 * c + 1], z = mesh.xyz[3 * c + 2], l = Math.hypot(x, y) || 1;
    const e = [-y / l, x / l, 0];
    return [e, [y * e[2] - z * e[1], z * e[0] - x * e[2], x * e[1] - y * e[0]]];
}

// ── the records the ridges are laid out from ──
section('belt geometry is recorded');
const history = run('history');
{
    const f = history.frame;
    let belt = 0, withGeometry = 0, sideWrong = 0;
    const shear = { [OrogenyType.ANDEAN]: [], [OrogenyType.TRANSPRESSION]: [] };
    for (let w = 0; w < mesh.numCells; w++) {
        if (f.owner[w] < 0 || f.type[w] === CrustType.OCEAN || !f.oroType[w]) continue;
        if (f.oroType[w] !== OrogenyType.ARC) { belt++; if (f.beltReach[w] > 0) withGeometry++; }
        const collision = f.oroType[w] === OrogenyType.URAL || f.oroType[w] === OrogenyType.HIMALAYAN;
        if (!collision && f.beltSide[w] !== BeltSide.NONE) sideWrong++;
        shear[f.oroType[w]]?.push(Math.abs(f.beltShear[w]));
    }
    check('every belt cell records where across its belt it lies (island-arc birth lines aside)', withGeometry >= 0.95 * belt, `${withGeometry} of ${belt} belt cells`);
    check('only collision belts have an upper and a lower side', sideWrong === 0, `${sideWrong} other belt cells with a side`);
    const ma = median(shear[OrogenyType.ANDEAN]), mt = median(shear[OrogenyType.TRANSPRESSION]);
    check('transform belts record strongly oblique convergence, Andean belts mostly head-on', mt >= ma + 20, `median |obliquity|: transpression ${mt}°, Andean ${ma}°`);
    // a newer orogeny keeps the belt it overprinted (the terrain shows the old grain under the new)
    let land = 0, overprinted = 0, andeanUnderCollision = 0, geometry = 0;
    for (let w = 0; w < mesh.numCells; w++) {
        if (f.owner[w] < 0 || f.type[w] === CrustType.OCEAN) continue;
        land++;
        if (!f.prevType[w]) continue;
        overprinted++;
        if (f.prevReach[w] > 0) geometry++;
        if (f.prevType[w] === OrogenyType.ANDEAN && f.oroType[w] === OrogenyType.HIMALAYAN) andeanUnderCollision++;
    }
    check('an overprinted belt is kept under the new one — an Andean margin under a later collision among them', overprinted >= 0.15 * land && geometry === overprinted && andeanUnderCollision > 0,
        `${overprinted} of ${land} land cells carry an overprinted belt (${geometry} with its geometry); ${andeanUnderCollision} an Andean belt under a collision`);
}

// ── an Andean margin ──
section('an Andean margin');
{
    const { frame } = run('andes'), T = terrain(frame), { rec, heightKm } = T;
    // (by position across the belt — a young belt is narrow, a mature one wide)
    const byU = (lo, hi) => { const a = []; for (let t = 0; t < T.tm.numCells; t++) { const c = corner(T, t), u = rec.dKm[c] / Math.max(1, rec.reach[c]); if (kindType(rec.kind[c]) === OrogenyType.ANDEAN && u >= lo && u < hi && heightKm[t] > 0) a.push(heightKm[t]); } return mean(a); };
    const coastH = byU(0, 0.08), mainH = byU(0.2, 0.5), farH = byU(0.85, 1.01);
    check('the main range stands behind the coast, higher than the coast and than the belt’s far edge', mainH > coastH + 0.3 && mainH > farH + 0.3,
        `mean height ${coastH.toFixed(2)} km at the coast (u < 0.08), ${mainH.toFixed(2)} km across u 0.2–0.5, ${farH.toFixed(2)} km at the far edge`);
    // (only where the nearest coast IS the trench-side one: near a continent's ends another coast is nearer)
    const coast = inlandOf(w => rec.land[w] === 1 && rec.coastKind[w] === CoastKind.ACTIVE, w => rec.land[w] === 0);
    const angles = ridgeAngles(T, coast, t => { const c = corner(T, t); return kindType(rec.kind[c]) === OrogenyType.ANDEAN && rec.coastKind[c] === CoastKind.ACTIVE && heightKm[t] > 0; });
    // (≤ 30°, not tighter: the developer asked for ridges less perfect — wandering, jittered — and random would be 45°)
    check('ridges run parallel to the trench-side coast (their cross-direction follows the distance from it)', angles.length >= 10 && median(angles) <= 30,
        `median ${median(angles).toFixed(0)}° between the ridges’ cross-direction and the direction inland, over ${angles.length} sim cells (random: 45°)`);
    let deepest = 0;
    for (let t = 0; t < T.tm.numCells; t++) { const c = corner(T, t); if (rec.trenchKm[c] < 150) deepest = Math.min(deepest, heightKm[t]); }
    check('a trench offshore, 7–11.5 km deep', deepest <= -7 && deepest >= -11.5, `deepest ${deepest.toFixed(2)} km`);
    let cones = 0; for (let t = 0; t < T.tm.numCells; t++) if (T.parts.cones[t] > 0.5 && kindType(rec.kind[corner(T, t)]) === OrogenyType.ANDEAN) cones++;
    check('volcanoes stand on the main range', cones >= 20, `${cones} terrain cells of volcano over 0.5 km`);
    const passive = [], active = [];
    for (let w = 0; w < mesh.numCells; w++) if (rec.land[w] && rec.coastKm[w] < 130) (rec.coastKind[w] === 0 ? passive : rec.coastKind[w] === 1 ? active : []).push(rec.shelfKm[w]);
    check('the trailing coast has a wider shelf than the leading one', median(passive) > 3 * median(active), `median shelf ${median(passive).toFixed(0)} km (passive) vs ${median(active).toFixed(0)} km (active)`);
}

// ── a continental collision ──
section('a continental collision');
{
    const { frame } = run('india'), T = terrain(frame), { rec, heightKm } = T;
    const band = (side, lo, hi) => { const a = []; for (let t = 0; t < T.tm.numCells; t++) { const c = corner(T, t); const u = rec.dKm[c] / Math.max(1, rec.reach[c]); if (kindType(rec.kind[c]) === OrogenyType.HIMALAYAN && kindSide(rec.kind[c]) === side && u >= lo && u < hi && heightKm[t] > -0.2) a.push(heightKm[t]); } return a; };
    const plateau = mean(band(BeltSide.UPPER, 0.2, 0.8)), range = mean(band(BeltSide.LOWER, 0.1, 0.35)), foreland = mean(band(BeltSide.LOWER, 0.75, 1.01));
    // (0.75 km: heights evolve — this collision welded 30 Myr ago and has worn down in the tropics since)
    check('the upper plate carries a plateau, well above the foreland on the lower plate', plateau >= foreland + 0.75, `mean ${plateau.toFixed(2)} km across the upper plate’s belt (u 0.2–0.8), ${foreland.toFixed(2)} km in the lower plate’s foreland (u > 0.75)`);
    // (0.7 km: Phase 11's weld waits for the seam to close, and the range stands 0.74 km over the foreland — 0.8 before)
    check('the lower plate has a range near the suture and a basin beyond it', range >= foreland + 0.7, `mean ${range.toFixed(2)} km at u 0.1–0.35, ${foreland.toFixed(2)} km at u > 0.75`);
    const near = [...band(BeltSide.UPPER, 0, 0.35), ...band(BeltSide.LOWER, 0, 0.35)], all = [...near, ...band(BeltSide.UPPER, 0.35, 1.01), ...band(BeltSide.LOWER, 0.35, 1.01)];
    check('the highest ground is near the suture', quantile(near, 0.99) >= 0.9 * quantile(all, 0.99), `99th percentile ${quantile(near, 0.99).toFixed(2)} km within u < 0.35 of the suture, ${quantile(all, 0.99).toFixed(2)} km over the whole belt`);
    // ridges against the suture itself (flagged in the crust), measured independently of the belt records
    const sutured = w => frame.owner[w] >= 0 && (frame.flags[w] & CrustFlag.SUTURE) !== 0;
    const suture = [];
    for (let w = 0; w < mesh.numCells; w++) if (sutured(w)) suture.push(mesh.xyz[3 * w], mesh.xyz[3 * w + 1], mesh.xyz[3 * w + 2]);
    const away = awayFrom(suture), withinKm = (c, km) => { for (let i = 0; i < suture.length; i += 3) if (mesh.xyz[3 * c] * suture[i] + mesh.xyz[3 * c + 1] * suture[i + 1] + mesh.xyz[3 * c + 2] * suture[i + 2] > Math.cos(km / 6371)) return true; return false; };
    const nearSuture = new Uint8Array(mesh.numCells); for (let w = 0; w < mesh.numCells; w++) if (rec.kind[w] && withinKm(w, 800)) nearSuture[w] = 1;
    const angles = ridgeAngles(T, away, t => { const c = corner(T, t); return kindType(rec.kind[c]) === OrogenyType.HIMALAYAN && nearSuture[c] && heightKm[t] > 0; });
    check('ridges run parallel to the suture', angles.length >= 10 && median(angles) <= 30, `median ${median(angles).toFixed(0)}° between the ridges’ cross-direction and the direction away from the suture, over ${angles.length} sim cells (random: 45°)`);
    // the ridge noise (8b round 5): the same place with and without it; its value against itself a little way along the
    // strike and the same way across it — drawn out along the belt, it should hold along and change across. The strike
    // it follows: the level lines of the distance across the belt as the ridge kernels carry it (stripes.js crossAt) —
    // since Phase 9 measured on the crust, a few degrees off the world grid's rec.across
    const N = terrainWith(frame, 640000, { ridgeNoiseShare: 0, ridgeNoiseBaseKm: 0 }), tm = T.tm, noiseAt = t => T.parts.stripes[t] - N.parts.stripes[t];
    const c3 = [0, 0, 0], w3 = [0, 0, 0], R = 6371, stepKm = 45;
    const K = preparePlan(frame, mesh, TERRAIN, SEED, tm.edgeKm).Ks[0], cr = [0, 0];
    const dAt = (x, y, z) => { const l = Math.hypot(x, y, z); x /= l; y /= l; z /= l; crossAt(K, mesh.index.nearest(x, y, z), x, y, z, cr); return cr[1] > 0 ? cr[0] : NaN; };
    const at = (x, y, z) => { const l = Math.hypot(x, y, z); locate(tm, x / l, y / l, z / l, c3, w3); return w3[0] * noiseAt(c3[0]) + w3[1] * noiseAt(c3[1]) + w3[2] * noiseAt(c3[2]); };
    const here = [], along = [], across = [];
    let rms = 0;
    for (let t = 0; t < tm.numCells; t += 3) {
        const c = corner(T, t);
        if (!rec.kind[c] || T.parts.relief[t] < 0.5 || heightKm[t] <= 0) continue;
        const x = tm.xyz[3 * t], y = tm.xyz[3 * t + 1], z = tm.xyz[3 * t + 2], el = Math.hypot(x, y) || 1, ex = -y / el, ey = x / el;
        const nx = -z * ey, ny = z * ex, nz = x * ey - y * ex, e = 20 / R;             // (east and north here; ±20 km)
        const gE = dAt(x + e * ex, y + e * ey, z) - dAt(x - e * ex, y - e * ey, z), gN = dAt(x + e * nx, y + e * ny, z + e * nz) - dAt(x - e * nx, y - e * ny, z - e * nz);
        const gl = Math.hypot(gE, gN);
        if (!(gl > 0)) continue;
        const ax = (gE * ex + gN * nx) / gl, ay = (gE * ey + gN * ny) / gl, az = (gN * nz) / gl;
        const bx = y * az - z * ay, by = z * ax - x * az, bz = x * ay - y * ax, s = stepKm / R;
        here.push(noiseAt(t)); along.push(at(x + s * bx, y + s * by, z + s * bz)); across.push(at(x + s * ax, y + s * ay, z + s * az));
        rms += noiseAt(t) ** 2;
    }
    const corr = (a, b) => { const ma = mean(a), mb = mean(b); let ab = 0, aa = 0, bb = 0; for (let i = 0; i < a.length; i++) { ab += (a[i] - ma) * (b[i] - mb); aa += (a[i] - ma) ** 2; bb += (b[i] - mb) ** 2; } return ab / Math.sqrt(aa * bb); };
    const rAlong = corr(here, along), rAcross = corr(here, across);
    check('the ridge noise is drawn out along the ranges: it holds along the strike and changes across it', here.length >= 1000 && rAlong >= 0.7 && rAlong >= rAcross + 0.25,
        `over ${here.length} belt cells (± ${Math.sqrt(rms / here.length).toFixed(2)} km): correlation with itself ${stepKm} km along the strike ${rAlong.toFixed(2)}, ${stepKm} km across it ${rAcross.toFixed(2)}`);
}

// ── oceans, arcs and hotspots ──
section('the sea floor, island arcs and hotspots');
{
    const T = terrain(history.frame), { rec, heightKm } = T, ridge = [], old = [];
    for (let t = 0; t < T.tm.numCells; t++) {
        const c0 = T.sampler.cells[3 * t], c1 = T.sampler.cells[3 * t + 1], c2 = T.sampler.cells[3 * t + 2];
        if (rec.land[c0] || rec.land[c1] || rec.land[c2] || rec.coastKm[c0] > -300 || rec.trenchKm[c0] < 400) continue;
        const age = Math.max(rec.ageMyr[c0], rec.ageMyr[c1], rec.ageMyr[c2]), young = Math.min(rec.ageMyr[c0], rec.ageMyr[c1], rec.ageMyr[c2]);
        if (age < 4) ridge.push(heightKm[t]); else if (young > 100) old.push(heightKm[t]);
    }
    check('mid-ocean ridges stand about 2.5 km deep', median(ridge) >= -3.2 && median(ridge) <= -2.2, `median ${median(ridge).toFixed(2)} km over ${ridge.length} cells of crust under 4 Myr old`);
    check('old floor lies 5–6.5 km deep', median(old) >= -6.6 && median(old) <= -5.2, `median ${median(old).toFixed(2)} km over ${old.length} cells of crust over 100 Myr old`);
    const arcs = run('mariana'), A = terrain(arcs.frame);
    let arcCells = 0, arcLand = 0;
    for (let t = 0; t < A.tm.numCells; t++) { const c = corner(A, t); if (arcs.frame.type[c] === CrustType.ARC && arcs.frame.owner[c] >= 0) { arcCells++; if (A.heightKm[t] > 0) arcLand++; } }
    check('an ocean arc is a chain of islands: some land, most of the arc under water', arcLand >= 10 && arcLand < 0.5 * arcCells, `${arcLand} of ${arcCells} terrain cells of arc crust above the sea`);
    const hawaii = run('hawaii'), H = terrain(hawaii.frame);
    let islands = 0, seamounts = 0;
    for (let t = 0; t < H.tm.numCells; t++) if (H.parts.cones[t] > 1 && !H.rec.land[corner(H, t)]) { if (H.heightKm[t] > 0) islands++; else seamounts++; }
    check('a hotspot track has islands near the plume and drowned seamounts downstream', islands > 0 && seamounts > islands, `${islands} terrain cells of volcanic island, ${seamounts} of seamount`);
}

// ── a continent splits ──
section('a continent splits');
{
    const { frame } = run('rift'), T = terrain(frame), { rec, heightKm } = T;
    // (the plume that split the continent also left flood basalt inland — a plateau of its own, left out here)
    const rift = (lo, hi) => { const a = []; for (let t = 0; t < T.tm.numCells; t++) { const c = corner(T, t); if (kindType(rec.kind[c]) === OrogenyType.RIFT && frame.volcType[c] !== VolcanicType.LIP && rec.dKm[c] >= lo * rec.reach[c] && rec.dKm[c] < hi * rec.reach[c] && heightKm[t] > 0) a.push(heightKm[t]); } return median(a); };
    const shoulder = rift(0.05, 0.35), inland = rift(0.7, 1.01);
    // (the evolved uplift on the sim cells, and the drawn terrain: the drawing's along-strike noise — ±45 % over ~900 km —
    // moves one small shoulder's median by ±0.15 km, so the terrain's own margin is smaller)
    const lifted = (lo, hi) => { const a = []; for (let c = 0; c < mesh.numCells; c++) if (kindType(rec.kind[c]) === OrogenyType.RIFT && frame.volcType[c] !== VolcanicType.LIP && rec.land[c] && rec.dKm[c] >= lo * rec.reach[c] && rec.dKm[c] < hi * rec.reach[c]) a.push(rec.upliftKm[c]); return median(a); };
    const upShoulder = lifted(0.05, 0.35), upInland = lifted(0.7, 1.01);
    check('the new coasts are lifted into shoulders that slope down inland', upShoulder >= upInland + 0.3 && shoulder >= inland + 0.1,
        `evolved uplift ${upShoulder.toFixed(2)} km on the shoulders (u 0.05–0.35), ${upInland.toFixed(2)} km inland (u > 0.7); terrain median ${shoulder.toFixed(2)} vs ${inland.toFixed(2)} km, flood basalt aside`);
    // along the failed arm vs the land 150–400 km from it (both away from the coast; flood basalt aside, as for the
    // shoulders — since 2026-10-27 its plume domes the land round it, highest by the arm, which sags it the same)
    const arm = [], around = [];
    for (let t = 0; t < T.tm.numCells; t++) {
        const [c0, c1, c2] = [0, 1, 2].map(i => T.sampler.cells[3 * t + i]), [w0, w1, w2] = [0, 1, 2].map(i => T.sampler.weights[3 * t + i]);
        if (!rec.land[c0] || rec.coastKm[c0] < 150 || frame.volcType[c0] === VolcanicType.LIP) continue;
        const d = w0 * rec.armKm[c0] + w1 * rec.armKm[c1] + w2 * rec.armKm[c2];
        if (d < 20) arm.push(heightKm[t]); else if (d > 150 && d < 400) around.push(heightKm[t]);
    }
    check('the failed arm is a low corridor, but land', arm.length > 0 && median(arm) < median(around) - 0.1 && quantile(arm, 0.1) > -0.05,
        `median ${median(arm).toFixed(2)} km along the failed arm vs ${median(around).toFixed(2)} km on the land 150–400 km from it; 10th percentile ${quantile(arm, 0.1).toFixed(2)} km`);
    let young = []; for (let t = 0; t < T.tm.numCells; t++) { const c = corner(T, t); if (!rec.land[c] && frame.owner[c] >= 0 && frame.formedAt[c] > 0 && rec.ageMyr[c] < 3 && rec.coastKm[c] < -200) young.push(heightKm[t]); }
    check('a ridge runs down the young ocean', young.length > 0 && median(young) >= -3.2 && median(young) <= -2.2, `median ${median(young).toFixed(2)} km over ${young.length} terrain cells of crust under 3 Myr old`);
}

// ── volcano shapes, and erosion by rainfall ──
section('volcano shapes and erosion by rainfall');
{
    // outlines: the radius where each cone ends, in 36 directions round it — a circle would give one radius
    const hawaii = run('hawaii'), plan = preparePlan(hawaii.frame, mesh, TERRAIN, SEED, 30);
    const V = plan.V, spread = [];
    for (let k = 0; k < Math.min(V.count, 40); k++) {
        const cx = V.pos[3 * k], cy = V.pos[3 * k + 1], cz = V.pos[3 * k + 2], home = mesh.index.nearest(cx, cy, cz);
        let ex = -cy, ey = cx, ez = 0; const el = Math.hypot(ex, ey) || 1; ex /= el; ey /= el;
        const nx = cy * ez - cz * ey, ny = cz * ex - cx * ez, nz = cx * ey - cy * ex, radii = [];
        const ground = Number.isNaN(V.base[k]) ? 0 : V.base[k];           // (the whole edifice, from the floor it stands on)
        for (let i = 0; i < 36; i++) {
            const th = i * Math.PI / 18, dx = Math.cos(th) * ex + Math.sin(th) * nx, dy = Math.cos(th) * ey + Math.sin(th) * ny, dz = Math.cos(th) * ez + Math.sin(th) * nz;
            let lo = 0, hi = 3 * V.reach[k] / 6371;                       // bisect for the edge of this cone along the ray
            for (let s = 0; s < 30; s++) { const m = (lo + hi) / 2, x = cx + m * dx, y = cy + m * dy, z = cz + m * dz, l = Math.hypot(x, y, z); if (coneAt({ ...V, near: { offset: Int32Array.of(0, 1), items: Int32Array.of(k) } }, 0, x / l, y / l, z / l, ground) > 1e-6) lo = m; else hi = m; }
            radii.push(lo);
        }
        const mu = mean(radii), sd = Math.sqrt(mean(radii.map(r => (r - mu) ** 2)));
        spread.push(sd / mu);
    }
    check('volcanoes are not circles: their outlines vary by direction', spread.length >= 5 && median(spread) >= 0.1, `median spread of the outline radius ${(100 * median(spread)).toFixed(0)} % of its mean, over ${spread.length} volcanoes`);
    // the rainfall table: wet equator, dry subtropics, wetter storm tracks, and ice keeping the poles eroding
    const e = l => erosionAtLatitude(l, TERRAIN);
    // (round 4, developer: the contrast toned down, most at the wet equator — softer above the reference rainfall)
    check('erosion follows rainfall by latitude, and ice toward the poles', e(0) > 1.15 && e(0) < 1.45 && e(0) > e(10) && e(25) < 1 && e(50) > e(25) && e(80) >= 0.9 * e(50),
        `×${e(0).toFixed(2)} at the equator, ×${e(25).toFixed(2)} at 25°, ×${e(50).toFixed(2)} at 50°, ×${e(80).toFixed(2)} at 80°`);
    // (belts quiet 40–250 Myr: after Phase 13's quicker erosion a belt quiet 100+ Myr is worn to ~0.15 km wherever it stood)
    // and it shows: old belts are worn lower in the wet tropics, and kept higher in the dry subtropics, than in the same
    // history evolved with erosion alike everywhere (heights evolve through the history: it has to be run again)
    const alike = run('history', { rainErosionExponent: 0 });
    const on = terrain(history.frame, 160000), off = terrainWith(alike.frame, 160000, { rainErosionExponent: 0 });
    const band = (T, lo, hi) => { const a = []; for (let t = 0; t < T.tm.numCells; t++) { const c = corner(T, t), lat = Math.abs(Math.asin(T.tm.xyz[3 * t + 2])) * 180 / Math.PI; if (lat >= lo && lat < hi && T.rec.kind[c] && T.rec.quietMyr[c] > 40 && T.rec.quietMyr[c] < 250 && T.heightKm[t] > 0) a.push(T.parts.relief[t]); } return mean(a); };
    const wetOn = band(on, 0, 12), wetOff = band(off, 0, 12), dryOn = band(on, 20, 32), dryOff = band(off, 20, 32);
    check('old belts are lower in the wet tropics and higher in the dry subtropics than with erosion alike everywhere', wetOn < wetOff && dryOn > dryOff,
        `mean relief of belts quiet over 100 Myr: tropics ${wetOn.toFixed(2)} km (${wetOff.toFixed(2)} without), subtropics ${dryOn.toFixed(2)} km (${dryOff.toFixed(2)} without)`);
}

// ── the fine detail belongs to the crust (anchor.js): a moving plate carries its detail with it ──
section('fine detail moves with the crust');
{
    const scene = TERRAIN_SCENES.find(s => s.id === 'history'), world = scene.build(mesh, SEED);
    const { frames } = simulate(world, { untilMyr: 110, drive: w => scene.drive(w), snapshotEveryMyr: 10 });
    const A = frames.at(-2), B = frames.at(-1), tm = terrainMesh(640000);
    // the plate that turned the most in those 10 Myr, among those with plenty of land in both frames
    let p = -1, turned = 0;
    for (let i = 0; i < B.plates.length; i++) {
        const a = A.plates[i], b = B.plates[i];
        if (!a?.alive || !b?.alive || b.landCells < 200) continue;
        const ang = 2 * Math.acos(Math.min(1, Math.abs(a.quat[0] * b.quat[0] + a.quat[1] * b.quat[1] + a.quat[2] * b.quat[2] + a.quat[3] * b.quat[3])));
        if (ang > turned) { turned = ang; p = i; }
    }
    const MA = quatToMat3(A.plates[p].quat, new Float64Array(9)), MB = quatToMat3(B.plates[p].quat, new Float64Array(9));
    const moveBtoA = (x, y, z) => {                  // a world point of frame B → where the same crust was in frame A
        const lx = MB[0] * x + MB[3] * y + MB[6] * z, ly = MB[1] * x + MB[4] * y + MB[7] * z, lz = MB[2] * x + MB[5] * y + MB[8] * z;
        return [MA[0] * lx + MA[1] * ly + MA[2] * lz, MA[3] * lx + MA[4] * ly + MA[5] * lz, MA[6] * lx + MA[7] * ly + MA[8] * lz];
    };
    // the noise-driven detail of the land: the platform minus its smooth interpolation from the records, in plate
    // interiors (no coast, no belt, no flood basalt — records shape those) where the records barely change in 10 Myr
    // (the smooth part: the same platform with its noise off — the terrain samples a moving plate on its own raster)
    const detail = f => {
        const T = synthesizeTerrain(f, mesh, tm, { seed: SEED, parts: true }), r = new Float32Array(tm.numCells).fill(NaN);
        const U = synthesizeTerrain(f, mesh, tm, { seed: SEED, parts: true, cfg: terrainConfig({ platformNoiseKm: 0, blendNoise: 0 }) });
        for (let t = 0; t < tm.numCells; t++) {
            let ok = true, smoothPart = U.parts.platform[t];
            for (let i = 0; i < 3; i++) { const c = T.sampler.cells[3 * t + i]; ok &&= T.rec.land[c] && T.rec.coastKm[c] > 400 && !T.rec.kind[c] && !T.rec.belts[1].kind[c] && !T.rec.lipKm[c]; }
            if (ok) r[t] = T.parts.platform[t] - smoothPart;
        }
        return { T, r };
    };
    const DA = detail(A), DB = detail(B), xs = [], ys = [], c3 = [0, 0, 0], w3 = [0, 0, 0];
    for (let t = 0; t < tm.numCells; t++) {
        if (Number.isNaN(DB.r[t]) || B.owner[DB.T.sampler.cells[3 * t]] !== p) continue;
        const q = moveBtoA(tm.xyz[3 * t], tm.xyz[3 * t + 1], tm.xyz[3 * t + 2]);
        locate(tm, q[0], q[1], q[2], c3, w3);
        const va = w3[0] * DA.r[c3[0]] + w3[1] * DA.r[c3[1]] + w3[2] * DA.r[c3[2]];
        if (!Number.isNaN(va)) { xs.push(va); ys.push(DB.r[t]); }
    }
    const mx = mean(xs), my = mean(ys);
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
    const corr = sxy / Math.sqrt(sxx * syy);
    // (with the noise fixed to the world, as before: 0.3–0.6 here — only because the platform noise is broad)
    check('a moving continent carries its fine detail with it', xs.length > 2000 && corr >= 0.9,
        `plate ${p} turned ${(turned * 180 / Math.PI).toFixed(1)}° in 10 Myr: the detail of ${xs.length} interior cells correlates ${corr.toFixed(2)} with the same crust 10 Myr before`);
    // volcanoes: the same crust cell gives the same volcano — the same shape, carried exactly with its plate
    const key = (V, k) => `${V.plate[k]}|${V.crust[k]}`, firstOf = V => { const m = new Map(); for (let k = V.count - 1; k >= 0; k--) m.set(key(V, k), k); return m; };
    const VA = preparePlan(A, mesh, TERRAIN, SEED, 30).V, VB = preparePlan(B, mesh, TERRAIN, SEED, 30).V, inA = firstOf(VA);
    let both = 0, sameShape = 0, carried = 0;
    for (const [kk, kb] of firstOf(VB)) {
        const ka = inA.get(kk);
        if (ka === undefined || VB.plate[kb] < 0) continue;
        both++;
        let same = true;
        for (let s = 0; s < VOLCANO_STRIDE; s++) if (s !== VOLCANO_WEAR_SLOT && VA.shape[VOLCANO_STRIDE * ka + s] !== VB.shape[VOLCANO_STRIDE * kb + s]) same = false;
        if (same) sameShape++;
        const MA2 = quatToMat3(A.plates[VB.plate[kb]].quat, new Float64Array(9)), MB2 = quatToMat3(B.plates[VB.plate[kb]].quat, new Float64Array(9));
        const [x, y, z] = [0, 1, 2].map(i => VA.pos[3 * ka + i]);
        const lx = MA2[0] * x + MA2[3] * y + MA2[6] * z, ly = MA2[1] * x + MA2[4] * y + MA2[7] * z, lz = MA2[2] * x + MA2[5] * y + MA2[8] * z;
        const bx = MB2[0] * lx + MB2[1] * ly + MB2[2] * lz, by = MB2[3] * lx + MB2[4] * ly + MB2[5] * lz, bz = MB2[6] * lx + MB2[7] * ly + MB2[8] * lz;
        if (Math.hypot(bx - VB.pos[3 * kb], by - VB.pos[3 * kb + 1], bz - VB.pos[3 * kb + 2]) * 6371 < 0.1) carried++;
    }
    // (a crust cell no world cell shows this frame — ~15 % of a moving plate's — borrows the records of the world cell nearest
    // it: now and then a neighbour's belt, and a volcano of another kind; so 97 %, not all)
    check('a volcano keeps its shape and rides with its plate', both >= 20 && sameShape >= 0.97 * both && carried >= 0.97 * both,
        `${both} volcanoes in both frames: ${sameShape} with the same shape, ${carried} where their plate carried them (within 0.1 km)`);
}

// ── flood basalts (8b round 6): an intact plateau, then mesas, then remnants; dykes radiating ──
section('flood basalts through time');
{
    const scene = TERRAIN_SCENES.find(s => s.id === 'traps'), world = scene.build(mesh, SEED);
    const { frames } = simulate(world, { untilMyr: scene.maxMyr, drive: w => scene.drive(w), snapshotEveryMyr: 10 });
    const lipCells = f => { const a = []; for (let w = 0; w < mesh.numCells; w++) if (f.owner[w] >= 0 && f.type[w] !== CrustType.OCEAN && f.volcType[w] === VolcanicType.LIP) a.push(w); return a; };
    const erupted = frames.find(f => lipCells(f).length > 0).time, at = age => frames.find(f => f.time >= erupted + age - 1e-6);
    // over the province (0.25 km of pile or more), away from the coast: where its cap (its top tier) still stands, and how that
    // differs from the third of it nearest its edge to the third furthest in. (The whole province lowers a little
    // as it wears: the cap is what stands within 15 % of the province's highest share of its pile, if that is half.)
    // The pile unworn: the same frame with its wear record zeroed. The cap is cut up by the carving (carve.js stripBasalt,
    // 2026-09-29: along the drainage, from the edge and the rivers), so what stands is read on the carved terrain: the
    // carved height less the ground under the lava.
    const carved = f => { const tm = terrainMesh(640000), T = synthesizeTerrain(f, mesh, tm, { seed: SEED, parts: true, carve: true }); return { ...T, tm }; };
    const cap = f => {
        const T = carved(f), U = terrain({ ...f, volcWornKm: new Float32Array(f.volcWornKm.length) }), { rec } = T, S = T.sampler;
        const share = new Float32Array(T.tm.numCells).fill(NaN), shares = [];
        for (let t = 0; t < T.tm.numCells; t++) {
            let ok = true;
            for (let i = 0; i < 3; i++) { const c = S.cells[3 * t + i]; ok &&= rec.land[c] && rec.coastKm[c] > 300; }
            const standing = T.parts.lip[t] > 0 ? Math.max(0, T.heightKm[t] - (T.tectonicKm[t] - T.parts.lip[t])) : 0;
            if (ok && U.parts.lip[t] >= 0.25) shares.push(share[t] = standing / U.parts.lip[t]);
        }
        const highest = quantile(shares, 0.97);
        let thick = 0, kept = 0;
        const byEdge = [];
        for (let t = 0; t < T.tm.numCells; t++) {
            if (Number.isNaN(share[t])) continue;
            let edge = 0;
            for (let i = 0; i < 3; i++) edge += S.weights[3 * t + i] * rec.lipEdgeKm[S.cells[3 * t + i]];
            const k = highest >= 0.5 && share[t] >= 0.85 * highest ? 1 : 0;
            thick++; kept += k;
            byEdge.push([edge, k]);
        }
        byEdge.sort((a, b) => a[0] - b[0]);
        const third = Math.floor(byEdge.length / 3), share3 = a => a.reduce((s, e) => s + e[1], 0) / Math.max(1, a.length);
        return { f, T, thick, kept: kept / thick, edge: share3(byEdge.slice(0, third)), inner: share3(byEdge.slice(-third)), third };
    };
    const young = cap(at(10)), mid = cap(at(100)), old = cap(at(250));
    // (0.75 since 2026-09-29: measured on the carved terrain, where the rivers' canyons count — the carving alone leaves 82 %)
    check('a young flood basalt is an unbroken plateau', young.thick >= 200 && young.kept >= 0.75,
        `10 Myr after it erupted, the cap still stands over ${(100 * young.kept).toFixed(0)} % of ${young.thick} terrain cells of the province`);
    // (≤ 0.8 since 2026-10-27: the cap is hard, and only an edge standing above the ground beyond retreats — Paraná keeps
    // most of its cap at 132 Myr, Siberia about a third at 252)
    check('as it wears its cap is cut away into mesas, which shrink with time — but remnants stand for hundreds of Myr', mid.kept <= 0.8 && mid.kept >= 0.15 && old.kept < mid.kept && old.kept >= 0.02,
        `the cap still stands over ${(100 * mid.kept).toFixed(0)} % 100 Myr after the eruption, ${(100 * old.kept).toFixed(0)} % after 250 Myr`);
    // (≥ 60 cells a third since 2026-10-27: the lava thins out toward its edge, so fewer cells of it are thick)
    check('its escarpment retreats from the edge: the cap goes sooner there than inside', mid.third >= 60 && mid.inner >= mid.edge + 0.15,
        `100 Myr on, the cap stands over ${(100 * mid.edge).toFixed(0)} % of the third of the province nearest its edge, ${(100 * mid.inner).toFixed(0)} % of the third furthest in (${mid.third} terrain cells each)`);
    // the dykes: the grain alone (with and without it), around the province; against itself along the rays and across them
    const f = mid.f, T = terrain(f), N = terrainWith(f, 640000, { dykeKm: 0 }), tm = T.tm, cells = lipCells(f);
    const C = [0, 1, 2].map(i => cells.reduce((s, w) => s + mesh.xyz[3 * w + i], 0)), cl = Math.hypot(...C); C.forEach((v, i) => { C[i] = v / cl; });
    const Rp = Math.sqrt(cells.length * mesh.cellAreaKm2 / Math.PI), grain = t => T.heightKm[t] - N.heightKm[t];
    const c3 = [0, 0, 0], w3 = [0, 0, 0], s = 45 / 6371;
    const sample = (x, y, z) => { const l = Math.hypot(x, y, z); locate(tm, x / l, y / l, z / l, c3, w3); return w3[0] * grain(c3[0]) + w3[1] * grain(c3[1]) + w3[2] * grain(c3[2]); };
    const here = [], along = [], across = [];
    for (let t = 0; t < tm.numCells; t += 2) {
        const x = tm.xyz[3 * t], y = tm.xyz[3 * t + 1], z = tm.xyz[3 * t + 2], d = x * C[0] + y * C[1] + z * C[2], r = Math.acos(Math.min(1, d)) * 6371;
        const c = corner(T, t);
        if (r < 1.1 * Rp || r > 2.1 * Rp || !T.rec.land[c] || T.rec.lipKm[c] || T.rec.coastKm[c] < 100 || T.rec.kind[c]) continue;
        let ax = d * x - C[0], ay = d * y - C[1], az = d * z - C[2]; const al = Math.hypot(ax, ay, az); ax /= al; ay /= al; az /= al;   // (away from the centre)
        const bx = y * az - z * ay, by = z * ax - x * az, bz = x * ay - y * ax;                                                        // (around it)
        here.push(grain(t)); along.push(sample(x + s * ax, y + s * ay, z + s * az)); across.push(sample(x + s * bx, y + s * by, z + s * bz));
    }
    const corr = (a, b) => { const ma = mean(a), mb = mean(b); let ab = 0, aa = 0, bb = 0; for (let i = 0; i < a.length; i++) { ab += (a[i] - ma) * (b[i] - mb); aa += (a[i] - ma) ** 2; bb += (b[i] - mb) ** 2; } return ab / Math.sqrt(aa * bb); };
    const rAlong = corr(here, along), rAcross = corr(here, across);
    // (500 cells: provinces come in every size since 2026-09-29 — the scene's is smaller, and so is the ring around it)
    check('dykes radiate from the plume’s centre: their grain runs out along the rays', here.length >= 500 && rAlong >= 0.6 && rAlong >= rAcross + 0.25,
        `${here.length} land cells 1.1–2.1 radii from the centre: the grain against itself 45 km along the ray ${rAlong.toFixed(2)}, 45 km around ${rAcross.toFixed(2)}`);
}

// ── continents through a whole history ──
section('continents through a whole history');
const T640 = terrain(history.frame);
{
    // the first continents' swells (8b round 5): seeded when the history starts, worn down as it runs; crust made since is flat
    const start = [], now = [], lastBase = history.frame.baseKm;
    let seaCarries = 0;
    for (let w = 0; w < mesh.numCells; w++) {
        const a = history.first, b = history.frame;
        if (a.owner[w] >= 0 && a.type[w] !== CrustType.OCEAN && a.type[w] !== CrustType.ARC) start.push(a.baseKm[w]);
        if (b.owner[w] >= 0 && b.type[w] !== CrustType.OCEAN) now.push(lastBase[w]);
        if ((a.owner[w] >= 0 && a.type[w] === CrustType.OCEAN && a.baseKm[w] !== 0) || (b.owner[w] >= 0 && b.type[w] === CrustType.OCEAN && lastBase[w] !== 0)) seaCarries++;
    }
    const top = TERRAIN.baseReliefKm;
    check('the first continents start with broad swells, and lowlands between them', quantile(start, 0.9) >= 0.5 * top && median(start) <= 0.3 * top && seaCarries === 0,
        `at the start: median ${median(start).toFixed(2)} km, 90th percentile ${quantile(start, 0.9).toFixed(2)} km (swells up to ${top} km); ${seaCarries} ocean cells carry any`);
    check('the swells wear down as the history runs', mean(now) <= 0.5 * mean(start),
        `mean over the land ${mean(start).toFixed(2)} km at the start, ${mean(now).toFixed(2)} km after ${history.frame.time} Myr`);
}
{
    const { rec, heightKm } = T640, f = history.frame, active = [], old = [], craton = [];
    for (let t = 0; t < T640.tm.numCells; t++) {
        const c = corner(T640, t);
        if (!rec.land[c] || heightKm[t] <= 0) continue;
        if (f.type[c] === CrustType.CRATON) craton.push(heightKm[t]);
        if (rec.kind[c] && kindType(rec.kind[c]) !== OrogenyType.ARC) { if (rec.quietMyr[c] < 10) active.push(heightKm[t]); else if (rec.quietMyr[c] > 250) old.push(heightKm[t]); }
    }
    // (active belts pooled over three frames: one frame alone can be a quiet one — the Phase 11 history's 600 Myr holds
    // only 289 cells of active belt, standing to 2.4 km, while every other frame from 250 Myr holds 5,000–39,000)
    const pooled = active.slice();
    for (const F of history.frames.filter(g => g.time === 400 || g.time === 500)) {
        const TT = terrain(F);
        for (let t = 0; t < TT.tm.numCells; t++) { const c = corner(TT, t); if (TT.rec.land[c] && TT.heightKm[t] > 0 && TT.rec.kind[c] && kindType(TT.rec.kind[c]) !== OrogenyType.ARC && TT.rec.quietMyr[c] < 10) pooled.push(TT.heightKm[t]); }
    }
    check('active belts stand high', quantile(pooled, 0.95) >= 3, `95th percentile ${quantile(pooled, 0.95).toFixed(2)} km over ${pooled.length} cells at 400, 500 and 600 Myr (${active.length} at 600)`);
    check('belts quiet for over 250 Myr are worn low', quantile(old, 0.95) <= 2.5, `95th percentile ${quantile(old, 0.95).toFixed(2)} km over ${old.length} cells`);
    check('cratons are low and flat', median(craton) <= 0.8 && quantile(craton, 0.9) <= 1.5, `median ${median(craton).toFixed(2)} km, 90th percentile ${quantile(craton, 0.9).toFixed(2)} km`);
    const hy = hypsometry(heightKm);
    let max = -Infinity, nan = 0; for (const v of heightKm) { if (!Number.isFinite(v)) nan++; else max = Math.max(max, v); }
    check('land covers a quarter to two fifths of the planet', hy.landShare >= 0.25 && hy.landShare <= 0.42, `${(100 * hy.landShare).toFixed(1)} %`);
    check('most land is lowland and upland, not mountain (before rivers carve it)', hy.landKm[2] <= 1, `median land height ${hy.landKm[2].toFixed(2)} km; ${(100 * hy.below400).toFixed(0)} % below 400 m`);
    check('no height is missing, none absurd', nan === 0 && max <= 9.5, `${nan} NaN; highest ${max.toFixed(2)} km`);
    check('terrain at 640K cells within 3 s', T640.seconds < 3, `${T640.seconds.toFixed(2)} s (records ${T640.ms.records.toFixed(0)} ms, sampling ${T640.ms.sample.toFixed(0)} ms, surface ${T640.ms.surface.toFixed(0)} ms)`);
}

// ── scale invariance: the same planet at every terrain resolution ──
section('the same planet at every resolution');
{
    const perSim = T => { const sum = new Float64Array(mesh.numCells), n = new Uint32Array(mesh.numCells); for (let t = 0; t < T.tm.numCells; t++) { const c = mesh.index.nearest(T.tm.xyz[3 * t], T.tm.xyz[3 * t + 1], T.tm.xyz[3 * t + 2]); sum[c] += T.heightKm[t]; n[c]++; } return Array.from(sum, (s, c) => (n[c] ? s / n[c] : NaN)); };
    const compare = (A, B) => {
        const a = perSim(A), b = perSim(B), pairs = a.map((v, c) => [v, b[c]]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
        const ma = mean(pairs.map(p => p[0])), mb = mean(pairs.map(p => p[1]));
        let sab = 0, saa = 0, sbb = 0, diff = 0;
        for (const [x, y] of pairs) { sab += (x - ma) * (y - mb); saa += (x - ma) ** 2; sbb += (y - mb) ** 2; diff += Math.abs(x - y); }
        return { corr: sab / Math.sqrt(saa * sbb), diff: diff / pairs.length };
    };
    const T160 = terrain(history.frame, 160000), T2M = terrain(history.frame, 2500000);
    for (const [name, X] of [['160K', T160], ['2.5M', T2M]]) {
        const { corr, diff } = compare(X, T640), hx = hypsometry(X.heightKm), h6 = hypsometry(T640.heightKm);
        check(`${name} vs 640K: the same heights, sim cell by sim cell`, corr >= 0.97 && diff <= 0.15, `correlation ${corr.toFixed(3)}, mean difference ${diff.toFixed(3)} km`);
        check(`${name} vs 640K: the same land and the same hypsometry`, Math.abs(hx.landShare - h6.landShare) <= 0.015 && Math.abs(hx.landKm[2] / h6.landKm[2] - 1) <= 0.12 && Math.abs(hx.landKm[4] / h6.landKm[4] - 1) <= 0.12,
            `land ${(100 * hx.landShare).toFixed(1)} vs ${(100 * h6.landShare).toFixed(1)} %; median ${hx.landKm[2].toFixed(2)} vs ${h6.landKm[2].toFixed(2)} km; 90th percentile ${hx.landKm[4].toFixed(2)} vs ${h6.landKm[4].toFixed(2)} km`);
    }
    const again = terrain(history.frame, 160000);
    check('the same seed gives the same terrain', again.heightKm.every((v, i) => v === T160.heightKm[i]), '160K, built twice');
    // the lab builds terrain on a pool of workers: it must be the very same terrain, bit for bit
    const pool = await TerrainPool.create(mesh, 4), pooled = await pool.synthesize(history.frame, T640.tm, { cfg: TERRAIN, seed: SEED, parts: true });
    pool.terminate();
    const same = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
    check('terrain built on a pool of workers is exactly the terrain built in place', same(pooled.heightKm, T640.heightKm) && same(pooled.parts.stripes, T640.parts.stripes) && same(pooled.sampler.cells, T640.sampler.cells),
        '640K cells on 4 workers: heights, ridges and sampler identical');
}

section('lab');
// every scene the lab offers builds and draws (the whole-planet one is covered above: it takes a minute)
check('every terrain scene can be built and driven', TERRAIN_SCENES.every(s => typeof s.build === 'function' && typeof s.drive === 'function' && s.maxMyr > 0), TERRAIN_SCENES.map(s => s.id).join(', '));
await checkLabPhaseLoads('../../js/app/phases/phase8a-terrain.js', mesh, LAB_MESH_SEED, TERRAIN_SCENES.filter(s => s.id !== 'history' && s.id !== 'cycle').map(s => ({ scene: s.id, cells: 160000 })));

finish('Phase 8a');
