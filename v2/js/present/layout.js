// The present-day world's ground plan (plans/GENERATE_REDESIGN_PLAN.md): Generate's layout — its pieces (what the
// planet code's plate edits raise or sink) and their land — carried onto Evolution's fixed sim mesh, where the
// present-day world is built: the same at every Detail and on every device.
//
// Frames: Generate's positions are y-up (lat = asin y, lon = atan2(x, z)); Evolution's are z-up (lat = asin z,
// lon = atan2(y, x)). A point is (x, y, z) in Generate's and (z, x, y) in Evolution's. The present-day world works in
// Generate's (its pieces' motion is there); the Frame handed to Evolution's terrain is turned into Evolution's.

import { projectCoarsePlates } from '../../../js/coarse-plates.js';
import { smoothAndReconnectPlates } from '../../../js/plates.js';
import { buildSimMesh } from '../core/sim-mesh.js';

export const PRESENT_SIM_CELLS = 40000;      // Evolution's default sim mesh (its seed too: the lab's MESH_SEED)
export const PRESENT_SIM_SEED = 12345;

let simCache = null;
/** Evolution's sim mesh at the present-day world's resolution, built once. */
export function presentSimMesh() {
    if (!simCache) simCache = buildSimMesh(PRESENT_SIM_CELLS, PRESENT_SIM_SEED);
    return simCache;
}

/** Evolution's z-up positions in Generate's y-up frame (a copy). */
export function evoToGen(xyz) {
    const out = new Float32Array(xyz.length);
    for (let i = 0; i < xyz.length; i += 3) { out[i] = xyz[i + 1]; out[i + 1] = xyz[i + 2]; out[i + 2] = xyz[i]; }
    return out;
}
/** A vector from Generate's frame into Evolution's. */
export const genToEvoVec = (v) => [v[2], v[0], v[1]];

const genXyzCache = new WeakMap();

/**
 * Generate's layout on the sim mesh.
 * @param {Object} o  { seed, P (pieces), coarse: generateCoarsePlates' output, pieceOcean (Set — as edited: G1d), pieceVec
 *   (the pieces' motion today on the unedited layout), sim (optional sim mesh) }
 * @returns {Object} L: { mesh: {numRegions, adjOffset, adjList}, xyz (Generate's frame), sim, cellPiece, pieceIds,
 *   pieceOcean, pieceVec, seed }
 */
export function presentLayout({ seed, P, coarse, pieceOcean, pieceVec, sim = presentSimMesh() }) {
    const n = sim.numCells;
    const mesh = { numRegions: n, adjOffset: sim.adjOffset, adjList: sim.adjList };
    let xyz = genXyzCache.get(sim);
    if (!xyz) { xyz = evoToGen(sim.xyz); genXyzCache.set(sim, xyz); }
    // the same projection as the render mesh's (js/planet-worker.js), so the pieces' borders agree with it
    const cellPiece = projectCoarsePlates(mesh, xyz, coarse.coarseMesh, coarse.coarse_xyz, coarse.coarse_r_plate, seed, P);
    smoothAndReconnectPlates(mesh, cellPiece, coarse.coarsePlateSeeds, 3);
    return { mesh, xyz, sim, cellPiece, pieceIds: Array.from(coarse.coarsePlateSeeds), pieceOcean, pieceVec, seed };
}
