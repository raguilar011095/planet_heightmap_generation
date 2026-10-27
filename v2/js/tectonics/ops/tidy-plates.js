// Plate integrity. Subduction, docking and arc collapse can leave a plate in disconnected pieces:
// an ocean sliver cut off by a trench, a stretch of arc beyond the continent it docked against, a
// scrap of land adrift. Left alone those pieces keep the old plate's motion and drift about looking
// like swiss cheese. Every step, each plate keeps only its main piece (the one with the most land; by area when
// there is no land); every other piece
//   · ocean only                                          → is given to the passive ocean, to be subducted in time
//   · with land, near another plate (fragmentJoinKm)      → joins that plate (a terrane docking, in effect)
//   · with land, far from every other plate               → stays as it is: land is never deleted
// Scraps of land (under terraneMinAreaKm2) join quietly, without an event. A plate that has just received a piece is
// not itself tidied again in the same pass (the piece is not joined to it until the next resolve).

import { CrustType, CrustFlag } from '../model/crust.js';
import { frameRotation } from '../model/plate.js';
import { EventKind } from '../model/world.js';
import { hopsFrom } from '../../core/mesh-bfs.js';

/** @returns {number} pieces dealt with */
export function tidyPlates(world) {
    const { mesh, plates, owner, config } = world, { adjOffset, adjList, xyz, index, cellAreaKm2 } = mesh;
    const background = plates.find(p => p.isBackground);
    const nearHops = Math.max(1, Math.round(config.fragmentJoinKm / mesh.edgeKm)), received = new Set();
    let handled = 0;
    for (const plate of plates) {
        if (!plate.alive || plate.isBackground || plate.crust.count === 0 || received.has(plate)) continue;
        const pieces = componentsOf(plate.crust, mesh);
        if (pieces.length < 2) continue;
        pieces.sort((a, b) => b.land - a.land || b.cells.length - a.cells.length);
        for (const piece of pieces.slice(1)) {
            handled++;
            if (piece.land === 0) { giveToBackground(world, plate, background, piece.cells); continue; }
            // which plate is it nearest to? (other plates' crust within a few world cells of it, nearer counting more)
            const contact = new Map(), P = [0, 0, 0], seen = new Set();
            let ring = [];
            for (const c of piece.cells) { plate.toWorld(xyz[3 * c], xyz[3 * c + 1], xyz[3 * c + 2], P); const w = index.nearest(P[0], P[1], P[2]); if (!seen.has(w)) { seen.add(w); ring.push(w); } }
            for (let hop = 1; hop <= nearHops; hop++) {
                const next = [];
                for (const w of ring) for (let k = adjOffset[w]; k < adjOffset[w + 1]; k++) {
                    const nb = adjList[k];
                    if (seen.has(nb)) continue;
                    seen.add(nb); next.push(nb);
                    const o = owner[nb];
                    if (o >= 0 && o !== plate.id && plates[o].alive && !plates[o].isBackground) contact.set(o, (contact.get(o) ?? 0) + 1 / hop);
                }
                ring = next;
            }
            const host = [...contact.entries()].sort((a, b) => b[1] - a[1])[0], scrap = piece.land * cellAreaKm2 < config.terraneMinAreaKm2;
            if (host) {
                const to = plates[host[0]], moved = transferCells(world, plate, to, piece.cells);
                received.add(to);
                if (!scrap) world.log(EventKind.FRAGMENT, `a piece of ${plate.name} (${(piece.land * cellAreaKm2 / 1e6).toFixed(2)} Mkm² of land) cut off from the rest joins ${to.name}: ${moved} cells`, { from: plate.id, to: to.id, areaMkm2: piece.land * cellAreaKm2 / 1e6, cells: moved });
            }                                              // (land with nothing near it stays put: land is never deleted)
        }
        if (plate.crust.count === 0) { plate.alive = false; plate.omega = [0, 0, 0]; plate.dynamics = null; }
    }
    return handled;
}

/**
 * Pinholes: a world cell nobody owns, surrounded by one plate's crust (a rewritten raster — suture, rift,
 * collapse — does not land on every world cell). The plate gets a copy of a neighbouring cell there.
 * @returns cells filled
 */
export function fillPinholes(world) {
    const { mesh, owner, ownerCell, plates } = world, { numCells, adjOffset, adjList, xyz, index } = mesh;
    let filled = 0;
    for (let w = 0; w < numCells; w++) {
        if (owner[w] >= 0) continue;
        let plate = -1, from = -1, others = false, count = 0, background = -1;
        for (let k = adjOffset[w]; k < adjOffset[w + 1]; k++) {
            const nb = adjList[k], o = owner[nb];
            if (o < 0) continue;
            if (plates[o].isBackground) background = o;
            if (plate < 0) { plate = o; from = ownerCell[nb]; }
            if (o !== plate) others = true;
            count++;
        }
        if (plate < 0 || count < 3) continue;
        if (others) {                                   // between plates: the passive ocean takes it if it is there at all
            if (background < 0) continue;
            plate = background; from = -1;
        }
        const p = plates[plate], q = p.cellAt(index, xyz[3 * w], xyz[3 * w + 1], xyz[3 * w + 2]);
        if (p.crust.mask[q]) continue;
        if (from < 0) p.crust.create(q, CrustType.OCEAN, -world.config.initialOceanAgeMyr); else p.crust.copyFrom(q, p.crust, from);
        p.markReshaped();
        filled++;
    }
    return filled;
}

/**
 * Join a plate's pieces to its largest one where they lie within `maxKm` of it across empty raster cells: every
 * empty cell lying between the two (on a path no longer than that) gets a copy of the nearest crust beside it —
 * ocean, on the sea side of the seam. For pieces that belong together but were resampled onto one lattice with
 * a seam of missed cells between them.
 * @returns {number} cells filled
 */
export function bridgePieces(plate, mesh, maxKm) {
    const pieces = componentsOf(plate.crust, mesh);
    if (pieces.length < 2) return 0;
    pieces.sort((a, b) => b.cells.length - a.cells.length);
    const { adjOffset, adjList, numCells, edgeKm } = mesh, crust = plate.crust, maxHops = Math.max(2, Math.round(maxKm / edgeKm));
    const overEmpty = cells => hopsFrom(mesh, cells, c => !crust.mask[c], maxHops).dist;       // hops over EMPTY cells from these cells
    const main = overEmpty(pieces[0].cells);
    let filled = 0;
    for (const piece of pieces.slice(1)) {
        const d = overEmpty(piece.cells), between = [];
        for (let c = 0; c < numCells; c++) if (!crust.mask[c] && d[c] > 0 && main[c] > 0 && d[c] + main[c] <= maxHops + 1) between.push(c);
        between.sort((a, b) => Math.min(d[a], main[a]) - Math.min(d[b], main[b]));     // fill from both shores inward
        for (const c of between) {
            let from = -1;
            for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const nb = adjList[k]; if (crust.mask[nb] && (from < 0 || crust.type[nb] === CrustType.OCEAN)) from = nb; }
            if (from < 0) continue;
            if (crust.type[from] === CrustType.OCEAN) crust.copyFrom(c, crust, from);
            else crust.create(c, CrustType.OCEAN, crust.formedAt[from]);          // (beside land only: new sea floor, as old as that coast)
            filled++;
        }
    }
    if (filled) plate.markReshaped();
    return filled;
}

let piecesSeen = null;       // (componentsOf's working array, kept between calls)

/** Connected pieces of a plate's crust, in its own raster. */
export function componentsOf(crust, mesh) {
    const { numCells, adjOffset, adjList } = mesh, { mask, type } = crust;
    if (!piecesSeen || piecesSeen.length !== numCells) piecesSeen = new Uint8Array(numCells);
    const seen = piecesSeen.fill(0), pieces = [];
    for (let s = 0; s < numCells; s++) {
        if (!mask[s] || seen[s]) continue;
        const cells = [s]; seen[s] = 1;
        let land = 0;
        for (let i = 0; i < cells.length; i++) {
            if (type[cells[i]] !== CrustType.OCEAN) land++;
            for (let k = adjOffset[cells[i]]; k < adjOffset[cells[i] + 1]; k++) { const nb = adjList[k]; if (mask[nb] && !seen[nb]) { seen[nb] = 1; cells.push(nb); } }
        }
        pieces.push({ cells, land });
    }
    return pieces;
}

/**
 * Move raster cells of `from` onto `to` (resampled once into `to`'s frame); `to` keeps its own land where
 * the two overlap — moved land there goes onto the nearest free cell beside it (stacked, as an arc collapse
 * does), or failing that is absorbed: it is the same ground, already land on the host, and left behind it would
 * sit under the host's land for ever as a piece that can never join. Trench flags on moved land are dropped
 * (the polarity rule re-establishes them).
 * @returns {number} cells written onto `to`
 */
export function transferCells(world, from, to, cells) {
    const { mesh } = world, { xyz, index, adjOffset, adjList } = mesh, F = from.crust, T = to.crust;
    const P = [0, 0, 0];
    let moved = 0, rot = null;
    const isHostLand = q => T.mask[q] && T.type[q] !== CrustType.OCEAN;
    for (const c of cells) {
        from.toWorld(xyz[3 * c], xyz[3 * c + 1], xyz[3 * c + 2], P);
        let q = to.cellAt(index, P[0], P[1], P[2]);
        const land = F.type[c] !== CrustType.OCEAN;
        if (land && isHostLand(q)) q = freeCellBeside(to, mesh, q, P, isHostLand);     // the host's own land is here
        if (q >= 0 && (land || !T.mask[q])) {
            T.copyFrom(q, F, c, rot ??= frameRotation(from, to));
            if (land) T.flags[q] &= ~CrustFlag.TRENCH;
            moved++;
        }
        F.remove(c);
    }
    from.markReshaped(); to.markReshaped();
    from.refreshExtent(xyz); to.refreshExtent(xyz);
    return moved;
}

/**
 * Moved land that would land on a taken cell `q` of `to` goes onto the free neighbour of q nearest its world
 * position `P` (stacked beside it, as an arc collapse does), or −1 when every neighbour is taken.
 * @param {(q: number) => boolean} taken
 */
export function freeCellBeside(to, mesh, q, P, taken) {
    const { xyz, adjOffset, adjList } = mesh, L = to.toPlateFrame(P[0], P[1], P[2], [0, 0, 0]);
    let best = -1, bestD = Infinity;
    for (let k = adjOffset[q]; k < adjOffset[q + 1]; k++) {
        const nb = adjList[k];
        if (taken(nb)) continue;
        const d = (xyz[3 * nb] - L[0]) ** 2 + (xyz[3 * nb + 1] - L[1]) ** 2 + (xyz[3 * nb + 2] - L[2]) ** 2;
        if (d < bestD) { bestD = d; best = nb; }
    }
    return best;
}

/** Hand raster cells of `plate` back to the passive ocean (as old ocean at their world positions), pinholes filled. */
export function giveToBackground(world, plate, background, cells) {
    const { xyz, index, adjOffset, adjList } = world.mesh, { owner } = world, P = [0, 0, 0];
    for (const c of cells) {
        if (background) {
            plate.toWorld(xyz[3 * c], xyz[3 * c + 1], xyz[3 * c + 2], P);
            const w = index.nearest(P[0], P[1], P[2]), age = Math.min(plate.crust.formedAt[c], -1);
            if (!background.crust.mask[w]) background.crust.create(w, CrustType.OCEAN, age);
            // a rotated raster does not land on every world cell: fill the pinholes beside it that nobody owns
            for (let k = adjOffset[w]; k < adjOffset[w + 1]; k++) { const nb = adjList[k]; if (owner[nb] === plate.id && !background.crust.mask[nb] && !plate.crust.mask[plate.cellAt(index, xyz[3 * nb], xyz[3 * nb + 1], xyz[3 * nb + 2])]) background.crust.create(nb, CrustType.OCEAN, age); }
        }
        plate.crust.remove(c);
    }
    plate.markReshaped();
    if (background) background.markReshaped();
    plate.refreshExtent(xyz);
}

