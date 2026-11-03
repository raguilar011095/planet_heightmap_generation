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
    const land = naturalCoast(L, cellLandNow(L, P, pieceLandNow));
    ms.coast = clock() - t0; t0 = clock();
    const B = classifyBoundaries(L, P, land);
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
    const tMesh = presentTerrainMesh(genMesh, r_xyz);
    ms.terrainMesh = clock() - t0; t0 = clock();
    const T = synthesizeTerrain(frame, L.sim, tMesh, { cfg: terrainConfig(o.terrain ?? {}), seed: o.seed, carve: true });
    ms.terrain = clock() - t0;
    Object.assign(ms, Object.fromEntries(Object.entries(T.ms).map(([k, v]) => [`  ${k}`, v])));
    return { land, B, sea, belts, frame, heightKm: T.heightKm, ms };
}
