// The fixed-resolution simulation mesh. Tectonic history always runs on this mesh so
// results are independent of the render Detail slider. Reuses V1's Fibonacci/Delaunay
// sphere builder (call V1's setDelaunator() before building).

import { spherePoints, sphereFromPoints } from '../../../js/sphere-mesh.js';
import { makeRng } from '../../../js/rng.js';
import { SphereIndex } from './sphere-index.js';

export const PLANET_RADIUS_KM = 6371;

/**
 * @typedef {Object} SimMesh
 * @property {number} numCells
 * @property {Float32Array} xyz          unit positions (z = north)
 * @property {Int32Array} adjOffset      CSR adjacency
 * @property {Int32Array} adjList
 * @property {SphereIndex} index         nearest-cell lookup
 * @property {number} edgeKm             mean distance between neighbouring cell centres, km
 * @property {number} edgeRad            the same in radians
 * @property {number} cellAreaKm2        mean cell area
 */

/** @returns {SimMesh} */
export function buildSimMesh(numCells, seed, points = null) {
    // Light jitter breaks up Fibonacci lattice directions without hurting uniformity.
    const { mesh, r_xyz } = sphereFromPoints(points ?? spherePoints(numCells, 0.35, makeRng(seed + 4242)));
    const n = mesh.numRegions;
    // Cells are near-hexagonal: area = (√3 / 2) · spacing², and n of them tile 4π. (Measured mean
    // neighbour distance on the jittered Fibonacci mesh agrees to ~3 %.)
    const edgeRad = Math.sqrt(8 * Math.PI / (Math.sqrt(3) * n));
    return {
        numCells: n,
        xyz: r_xyz,
        adjOffset: mesh.adjOffset,
        adjList: mesh.adjList,
        index: new SphereIndex(r_xyz, mesh, texelsFor(n)),
        edgeRad,
        edgeKm: edgeRad * PLANET_RADIUS_KM,
        cellAreaKm2: (4 * Math.PI * PLANET_RADIUS_KM * PLANET_RADIUS_KM) / n,
    };
}

/**
 * A mesh's cells before it is a mesh: where they are (`xyz`: buildSimMesh's own points, to hand back to it as `points`),
 * how many, and how far apart — known in a moment, where the mesh takes its triangulation. For work that needs only the
 * cells' positions, begun while the mesh is built (finish/finish.js: the surface).
 */
export function simMeshPoints(numCells, seed) {
    const xyz = spherePoints(numCells, 0.35, makeRng(seed + 4242)), n = xyz.length / 3, edgeRad = Math.sqrt(8 * Math.PI / (Math.sqrt(3) * n));
    return { numCells: n, xyz, edgeRad, edgeKm: edgeRad * PLANET_RADIUS_KM };
}

/**
 * The nearest-cell index's start table: 2 texels per cell across on sim-sized meshes (step/gather.js counts on its
 * guesses being within 2 hops), 1 on huge terrain meshes — 4× less to build; a lookup still ends at the true nearest.
 */
const texelsFor = n => (n > 1e6 ? 1 : 2);

/** Convert a physical distance to a hop count on this mesh (never below `min`). */
export function kmToHops(simMesh, km, min = 1) {
    return Math.max(min, Math.round(km / simMesh.edgeKm));
}

/**
 * A SimMesh rebuilt from its arrays alone (no Delaunay step): how a worker gets the mesh it was sent. The index is
 * rebuilt from the same arrays, so every lookup gives the same answer as on the original.
 * @param {{numCells: number, xyz: Float32Array, adjOffset: Int32Array, adjList: Int32Array}} arrays
 */
export function meshFromArrays({ numCells, xyz, adjOffset, adjList }) {
    const edgeRad = Math.sqrt(8 * Math.PI / (Math.sqrt(3) * numCells));
    return {
        numCells, xyz, adjOffset, adjList,
        index: new SphereIndex(xyz, { adjOffset, adjList, numRegions: numCells }, texelsFor(numCells)),
        edgeRad,
        edgeKm: edgeRad * PLANET_RADIUS_KM,
        cellAreaKm2: (4 * Math.PI * PLANET_RADIUS_KM * PLANET_RADIUS_KM) / numCells,
    };
}
