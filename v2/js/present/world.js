// The present-day world, put together (plans/GENERATE_REDESIGN_PLAN.md): from Generate's layout and its plates that
// move, the crust as edited, its coast drawn, its boundaries, its sea floor's past, the Frame — and the ground: Evolution's
// terrain synthesis and carving on Generate's own render mesh, in km.

import { meshFromArrays } from '../core/sim-mesh.js';
import { synthesizeTerrain } from '../terrain/synthesize.js';
import { terrainConfig } from '../terrain/terrain-config.js';
import { classifyBoundaries, cellLandNow } from './plates.js';
import { naturalCoast } from './coast.js';
import { seaFloorAges } from './seafloor.js';
import { presentFrame } from './frame.js';
import { presentBelts, presentTectonics, newCrust } from './belts.js';
import { presentPast } from './past.js';
import { presentPlumes, presentFarField } from './plumes.js';
import { knobOverrides } from './knobs.js';

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
 * @param {{seed: number, terrain?: Object}} o  terrain: terrain-config overrides
 * @returns {{land, B, sea, frame, heightKm: Float32Array, ms: Object}}
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
    const past = presentPast(L, land, crust, config);
    ms.past = clock() - t0; t0 = clock();
    const belts = presentBelts(L, P, B, land, sea, undefined, config, crust);
    belts.past = past;
    ms.belts = clock() - t0; t0 = clock();
    // G5: today's collisions squeezing up old sutures far inland; the plumes' tracks and flood basalts
    belts.far = presentFarField(L, P, B, land, crust, config);
    belts.plumes = presentPlumes(L, P, land, crust);
    ms.plumes = clock() - t0; t0 = clock();
    const frame = presentFrame(L, P, B, land, sea, belts.crust);
    ms.frame = clock() - t0; t0 = clock();
    const G = presentGroundOf(frame, L.sim, genMesh, r_xyz, o);
    Object.assign(ms, G.ms);
    return { land, B, sea, belts, frame, heightKm: G.heightKm, drainage: G.drainage, receivers: G.receivers, ms };
}

/**
 * Only the ground — Evolution's synthesis and carving of a Frame on Generate's mesh, with the sculpting knobs (G6,
 * present/knobs.js) — so Reapply keeps the Frame and redraws just this.
 * @param {{seed: number, knobs?: Object, terrain?: Object}} o
 */
export function presentGroundOf(frame, sim, genMesh, r_xyz, o) {
    const ms = {}, clock = () => performance.now();
    let t0 = clock();
    const tMesh = presentTerrainMesh(genMesh, r_xyz);
    ms.terrainMesh = clock() - t0; t0 = clock();
    const cfg = terrainConfig({ ...knobOverrides(o.knobs ?? {}), ...(o.terrain ?? {}) });
    const T = synthesizeTerrain(frame, sim, tMesh, { cfg, seed: o.seed, carve: cfg.carveTimeMyr > 0 });
    ms.terrain = clock() - t0;
    Object.assign(ms, Object.fromEntries(Object.entries(T.ms).map(([k, v]) => [`  ${k}`, v])));
    return { heightKm: T.heightKm, drainage: T.drainage ?? null, receivers: T.receivers ?? null, ms };
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
