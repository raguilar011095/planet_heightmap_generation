// The "gather": how the world view is rebuilt from plate-frame rasters. For every world cell, each
// plate is asked "do you have crust here?" by rotating the cell's position into the plate's frame
// and looking up the nearest raster cell. Gathering (rather than scattering each plate's cells
// into the world) is what guarantees a plate's interior can never show holes.
//
// Plates are visited in id order, so a claim handler sees lower ids first. Both users of this loop —
// step/reconstruct.js (read-only) and step/resolve.js (settles conflicts) — are written so that the
// outcome does not depend on that order.

import { ringsOf, RING_COUNT } from '../../core/mesh-rings.js';

/**
 * Calls `onClaim(worldCell, plate, rasterCell)` for every (world cell, plate) pair where the plate has
 * crust under that world cell. Plates whose bounding cap cannot reach a cell are skipped cheaply.
 * `pass`: a number for this gather (resolve.js: the world's occupancy stamp) — a plate whose near-edge marks were built
 * during it carries it as `_nearEdge.pass`, so the growth step can tell the marks are of this gather's crust.
 */
export function forEachClaim(world, onClaim, pass = 0) {
    const { mesh, plates } = world, { xyz, numCells, index } = mesh;
    for (const plate of plates) {
        if (!plate.alive || plate.crust.count === 0) continue;
        const mask = plate.crust.mask, [cx, cy, cz, capCos] = plate.capInWorld(mesh);
        if (isIdentity(plate.mat)) {                    // not rotated (the passive background): world cell w IS raster cell w
            for (let w = 0; w < numCells; w++) {
                if (xyz[3 * w] * cx + xyz[3 * w + 1] * cy + xyz[3 * w + 2] * cz < capCos) continue;
                if (mask[w]) onClaim(w, plate, w);
            }
            continue;
        }
        // Two exact shortcuts (what is claimed never changes):
        // · the world cell → raster cell map depends on the rotation alone, and nearly every step gathers twice with the
        //   same rotations (before and after the events), so each plate keeps its map until it turns: map[w] = the raster
        //   cell, −1 = not looked up yet, ≤ −2 = skipped (below), holding the index's first guess as −2 − guess;
        // · a lookup is skipped where the crust is nowhere near: the true nearest raster cell is always within 2 hops of
        //   the index's first guess, so if that guess is not crust and lies over RING_COUNT rings from the crust's edge,
        //   the answer cannot be crust — re-tested against the crust of the moment whenever the map is reused.
        const map = claimMap(plate, numCells), m = plate.mat;
        let near = null;
        // (the mesh's cells are numbered down the sphere — a Fibonacci spiral — so blocks of them lie in bands of latitude:
        // a block wholly outside the cap's band of latitude is passed over; every other cell is tested as before, in order)
        const blocks = latitudeBlocks(mesh), { zLo, zHi } = capBand(cx, cy, cz, capCos);
        for (let b = 0, w = 0; b < blocks.count; b++) {
            const end = Math.min(numCells, w + BLOCK);
            if (blocks.zMax[b] < zLo || blocks.zMin[b] > zHi) { w = end; continue; }
            for (; w < end; w++) {
                const x = xyz[3 * w], y = xyz[3 * w + 1], z = xyz[3 * w + 2];
                if (x * cx + y * cy + z * cz < capCos) continue;
                let cell = map[w];
                if (cell < 0) {
                    const px = m[0] * x + m[3] * y + m[6] * z, py = m[1] * x + m[4] * y + m[7] * z, pz = m[2] * x + m[5] * y + m[8] * z;
                    const guess = cell === -1 ? index.start(px, py, pz) : -2 - cell;
                    if (!near) { near = nearEdge(plate, mesh); near.pass = pass; }
                    if (!mask[guess] && near.marks[guess] !== near.stamp) { map[w] = -2 - guess; continue; }
                    cell = map[w] = index.walk(guess, px, py, pz);
                }
                if (mask[cell]) onClaim(w, plate, cell);
            }
        }
    }
}

// Blocks of BLOCK consecutive cells, each with the least and greatest z of its cells (per mesh, once).
const BLOCK = 128, blocksOf = new WeakMap();
function latitudeBlocks(mesh) {
    let B = blocksOf.get(mesh);
    if (B) return B;
    const { xyz, numCells } = mesh, count = Math.ceil(numCells / BLOCK);
    B = { count, zMin: new Float64Array(count).fill(Infinity), zMax: new Float64Array(count).fill(-Infinity) };
    for (let w = 0; w < numCells; w++) { const b = (w / BLOCK) | 0, z = xyz[3 * w + 2]; if (z < B.zMin[b]) B.zMin[b] = z; if (z > B.zMax[b]) B.zMax[b] = z; }
    blocksOf.set(mesh, B);
    return B;
}
/** The band of z a cap (unit centre, cosine of its radius) covers, widened by a margin far beyond rounding (1e-4 ≈ 0.6 km). */
function capBand(cx, cy, cz, capCos) {
    if (capCos <= -1) return { zLo: -Infinity, zHi: Infinity };
    const theta = Math.acos(Math.max(-1, Math.min(1, cz))), r = Math.acos(capCos);
    return { zLo: Math.cos(Math.min(Math.PI, theta + r)) - 1e-4, zHi: Math.cos(Math.max(0, theta - r)) + 1e-4 };
}

/**
 * The plate's world cell → raster cell map if it is of the plate's rotation now (else null): map[w] ≥ 0 is plate.cellAt at
 * world cell w's centre — the same lookup, kept — and ≤ −2 holds the index's first guess for it, as −2 − guess (see
 * forEachClaim). For the growth step, which asks for the same cells the gather looked up moments before.
 */
export function claimMapNow(plate, numCells) {
    const c = plate._claimMap, m = plate.mat;
    if (!c || c.map.length !== numCells) return null;
    for (let i = 0; i < 9; i++) if (c.mat[i] !== m[i]) return null;
    return c.map;
}

/** The plate's world cell → raster cell map for its current rotation (see forEachClaim), reset when it has turned. */
function claimMap(plate, numCells) {
    let c = plate._claimMap;
    const m = plate.mat;
    if (!c || c.map.length !== numCells) c = plate._claimMap = { map: new Int32Array(numCells).fill(-1), mat: new Float64Array(9).fill(NaN) };
    for (let i = 0; i < 9; i++) if (c.mat[i] !== m[i]) { c.map.fill(-1); c.mat.set(m); break; }
    return c.map;
}

/**
 * Marks (`marks[cell] === stamp`) on every raster cell of `plate` within RING_COUNT rings of the edge of its crust — a
 * crust cell with a non-crust neighbour. With the crust itself, that covers every cell the nearest-cell search can end
 * on from a first guess that is not marked. Rebuilt per gather (crust changes every step); only edge cells are expanded.
 */
function nearEdge(plate, mesh) {
    const { numCells, adjOffset, adjList } = mesh, mask = plate.crust.mask, { start, cells, stride } = ringsOf(mesh);
    let near = plate._nearEdge;
    if (!near || near.marks.length !== numCells) near = plate._nearEdge = { marks: new Uint32Array(numCells), stamp: 0 };
    if (++near.stamp === 0xFFFFFFFF) { near.marks.fill(0); near.stamp = 1; }
    const { marks, stamp } = near;
    for (let c = 0; c < numCells; c++) {
        if (!mask[c]) continue;
        let edge = false;
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) if (!mask[adjList[k]]) { edge = true; break; }
        if (!edge) continue;
        for (let i = start[c * stride], e = start[c * stride + RING_COUNT + 1]; i < e; i++) marks[cells[i]] = stamp;
    }
    return near;
}

const isIdentity = m => m[0] === 1 && m[4] === 1 && m[8] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 0 && m[5] === 0 && m[6] === 0 && m[7] === 0;

/** Reset the per-step world view before a gather. */
export function clearWorldView(world) {
    world.owner.fill(-1);
    world.claimCount.fill(0);
    world.landClaims.fill(0);
    world.collider.fill(-1);
    world.consumedAt.fill(0);
    world.provisional.fill(0);
}
