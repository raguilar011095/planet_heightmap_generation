// The present-day world, put together (plans/GENERATE_REDESIGN_PLAN.md): from Generate's layout and its plates that
// move, the crust as edited, its coast drawn, its boundaries, its sea floor's past, the Frame — and the ground: Evolution's
// terrain synthesis and carving on Generate's own render mesh, in km.

import { meshFromArrays } from '../core/sim-mesh.js';
import { preparePlan, surfaceRange, carveInputs, settleFields, carveLadder, carveSettings } from '../terrain/synthesize.js';
import { sampleOnto, terrainMesh } from '../terrain/terrain-mesh.js';
import { carveTerrain } from '../terrain/carve.js';
import { terrainConfig } from '../terrain/terrain-config.js';
import { classifyBoundaries, cellLandNow } from './plates.js';
import { naturalCoast } from './coast.js';
import { seaFloorAges } from './seafloor.js';
import { presentFrame } from './frame.js';
import { presentBelts, presentTectonics, newCrust } from './belts.js';
import { presentPast } from './past.js';
import { presentPlumes, presentFarField } from './plumes.js';
import { knobOverrides, reliefShareOf } from './knobs.js';
import { addFineRelief } from './relief.js';
import { heldCells, holdToPieces } from './hold.js';
import { pieceSeams, sagSeams, frontDistance } from './seams.js';
import { bentPieces } from './warp.js';
import { PRESENT, PRESENT_TERRAIN } from './present-config.js';

const tMeshes = new WeakMap();
/** Generate's render mesh as a terrain mesh (SimMesh-shaped), its positions turned into Evolution's z-up frame. */
export function presentTerrainMesh(genMesh, r_xyz) {
    let t = tMeshes.get(genMesh);
    if (t && t.numCells === genMesh.numRegions) return t;
    const n = genMesh.numRegions, xyz = new Float32Array(3 * n);
    for (let r = 0; r < n; r++) { xyz[3 * r] = r_xyz[3 * r + 2]; xyz[3 * r + 1] = r_xyz[3 * r]; xyz[3 * r + 2] = r_xyz[3 * r + 1]; }
    t = meshFromArrays({ numCells: n, xyz, adjOffset: genMesh.adjOffset, adjList: genMesh.adjList });
    tMeshes.set(genMesh, t);
    return t;
}

/**
 * Everything of the present-day world but its plates (present/plates.js, built once per layout).
 * @param {{L, P}} present  the layout and its plates   @param {Uint8Array} pieceLandNow  each piece's land as edited
 * @param {Object} genMesh  Generate's render mesh   @param {Float32Array} r_xyz  its positions (Generate's frame)
 * @param {{seed: number, terrain?: Object, knobs?: Object, regionLand?: Uint8Array, regionCell?: Int32Array,
 *   regionPlate?: Int16Array}} o  terrain: terrain-config overrides; regionLand, regionCell, regionPlate: each region's
 *   piece as edited (1: land), its sim cell and its plate
 *   — given, the ground is held to the pieces (present/hold.js)
 * @returns {{land, B, sea, frame, mask, heightKm: Float32Array, ms: Object}}  mask: what the hold read (for Reapply)
 */
export function presentWorld(present, pieceLandNow, genMesh, r_xyz, o) {
    const { L, P } = present, ms = {}, clock = () => performance.now();
    let t0 = clock();
    const crustLand = cellLandNow(L, P, pieceLandNow);
    const land = naturalCoast(L, crustLand, P.cellPlate);
    ms.coast = clock() - t0; t0 = clock();
    const B = classifyBoundaries(L, P, land, undefined, crustLand);
    ms.boundaries = clock() - t0; t0 = clock();
    const sea = seaFloorAges(L, P, B, land);
    ms.seaFloor = clock() - t0; t0 = clock();
    // the continents' past first (G4: old orogenies replayed), then today's belts over it
    const config = presentTectonics(), crust = newCrust(L, land, sea);
    // (G3b: the inner seams — where two land pieces of one plate meet — replayed with the past, or sagged)
    // (G4c: the pieces' outlines bent — by today's plates' drag and a slow warp — and the smaller terranes within them)
    const bent = bentPieces(L, P, B, land, crustLand);
    const seams = pieceSeams(L, P, land, crustLand, PRESENT, bent.wp);
    const past = presentPast(L, land, crust, config, PRESENT, seams.events, bent);
    past.bent = bent;
    sagSeams(L, land, crust, seams.sags);
    past.seams = { closing: seams.events.length, parting: seams.sags.length, count: seams.count };
    ms.past = clock() - t0; t0 = clock();
    const belts = presentBelts(L, P, B, land, sea, undefined, config, crust, bent.sub);
    belts.past = past;
    ms.belts = clock() - t0; t0 = clock();
    // G5: today's collisions squeezing up old sutures far inland; the plumes' tracks and flood basalts
    belts.far = presentFarField(L, P, B, land, crust, config);
    belts.plumes = presentPlumes(L, P, land, crust);
    ms.plumes = clock() - t0; t0 = clock();
    const frame = presentFrame(L, P, B, land, sea, belts.crust);
    ms.frame = clock() - t0; t0 = clock();
    // (G2c: the ground held to the pieces on Generate's mesh — each region by its own piece, as edited)
    const mask = o.regionLand ? { regionLand: o.regionLand, regionCell: o.regionCell, regionPlate: o.regionPlate ?? null, ...heldCells(frame, L.sim, crustLand, PRESENT, belts.shelfSea) } : null;
    // (G3b: the grain — how far each place lies from a closing front, today's or the past's)
    const frontKm = frontDistance(L, B, land, past.events);
    const G = presentGroundOf(frame, L.sim, genMesh, r_xyz, { ...o, mask, frontKm });
    Object.assign(ms, G.ms);
    return { land, B, sea, belts, frame, mask, frontKm, heightKm: G.heightKm, drainage: G.drainage, receivers: G.receivers, ms };
}

/**
 * Only the ground — Evolution's synthesis and carving of a Frame on Generate's mesh, with the sculpting knobs (G6,
 * present/knobs.js) — so Reapply keeps the Frame and redraws just this.
 * @param {{seed: number, knobs?: Object, terrain?: Object, relief?: number, mask?: Object}} o  mask: hold the ground
 *   to the pieces (presentWorld's `mask`)
 */
export function presentGroundOf(frame, sim, genMesh, r_xyz, o) {
    const ms = {}, clock = () => performance.now();
    let t0 = clock();
    const tMesh = presentTerrainMesh(genMesh, r_xyz);
    ms.terrainMesh = clock() - t0; t0 = clock();
    const cfg = terrainConfig({ ...PRESENT_TERRAIN, ...knobOverrides(o.knobs ?? {}), ...(o.terrain ?? {}) });
    const T = presentSynthesize(frame, sim, tMesh, cfg, o.seed, o.relief ?? reliefShareOf(o.knobs ?? {}), o.mask ?? null, o.frontKm ?? null);
    ms.terrain = clock() - t0;
    Object.assign(ms, Object.fromEntries(Object.entries(T.ms).map(([k, v]) => [`  ${k}`, v])));
    return { heightKm: T.heightKm, drainage: T.drainage ?? null, receivers: T.receivers ?? null, ms };
}

/**
 * Evolution's terrain synthesis and carving (terrain/synthesize.js synthesizeTerrain, step for step — the same surface
 * when `relief` is 0), with the fine relief (present/relief.js, G6d) laid down between the two, so the rivers carve it.
 */
export function presentSynthesize(frame, sim, tMesh, cfg, seed, relief, mask = null, frontKm = null) {
    const ms = {}, clock = () => performance.now();
    let t0 = clock();
    const plan = preparePlan(frame, sim, cfg, seed, tMesh.edgeKm);
    ms.records = clock() - t0; t0 = clock();
    const S = sampleOnto(sim, tMesh, cfg, seed);
    ms.sample = clock() - t0; t0 = clock();
    const n = tMesh.numCells, heightKm = new Float32Array(n);
    const carveIn = cfg.carveTimeMyr > 0 ? carveInputs(n) : null;
    surfaceRange(plan, cfg, seed, tMesh.edgeKm, tMesh.xyz, S.cells, S.weights, 0, n, heightKm, null, carveIn);
    ms.surface = clock() - t0; t0 = clock();
    addFineRelief(heightKm, tMesh.xyz, tMesh.edgeKm, seed, cfg, relief, frontKm ? { frontKm, cells: S.cells, weights: S.weights } : null);
    if (mask) holdToPieces(heightKm, mask, tMesh, S);
    ms.relief = clock() - t0;
    if (!carveIn) return { heightKm, ms };
    t0 = clock();
    const C = carveTerrain(carveLadder(sim, tMesh, terrainMesh), { ...carveIn, z: heightKm }, carveSettings(cfg), settleFields(frame, sim, tMesh, cfg, seed));
    ms.carve = clock() - t0;
    return { heightKm: C.z, drainage: C.area, receivers: C.recv, ms };
}

/**
 * The rivers to draw (G7a): every land cell draining at least `minKm2` (rain-weighted, km² — the same rivers at every
 * Detail), a reach from it to the cell it drains into (or the sea cell it pours into); its size 0…1 by log of its area.
 */
export function presentRivers(heightKm, drainage, receivers, minKm2 = 60000, fullKm2 = 3e6) {
    if (!drainage || !receivers) return { count: 0, from: new Int32Array(0), to: new Int32Array(0), size: new Float32Array(0) };
    const from = [], to = [], size = [], lg = Math.log(fullKm2 / minKm2);
    for (let c = 0; c < heightKm.length; c++) {
        if (heightKm[c] <= 0 || drainage[c] < minKm2) continue;
        const r = receivers[c], d = r >= 0 ? r : -1 - r;
        from.push(c); to.push(d); size.push(Math.min(1, Math.log(drainage[c] / minKm2) / lg));
    }
    return { count: from.length, from: Int32Array.from(from), to: Int32Array.from(to), size: Float32Array.from(size) };
}
