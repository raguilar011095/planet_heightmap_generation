// The ground held to the pieces (plans/GENERATE_REDESIGN_PLAN.md G2c; owner, 2026-11-03: "anything labeled as a land
// plate needs to be some minimum height, and the same for the ocean plates (land can be underwater for sure, ocean can
// only be above during orogeny) I think this will help keep the sharpness"). On Generate's own mesh, each region by its
// piece as edited — the outlines the Plates tab draws, as fine as the Detail and Irregularity make them:
//   · a land piece is continental crust: never deeper than a shelf (landFloorKm), but where the crust itself opened a
//     sea (a rift's young sea); along another plate's ocean piece (an active margin) its fore-arc is drowned, so the
//     trench lies offshore;
//   · an ocean piece is oceanic crust: under the sea, shallowest at the land pieces' edge and deepening away from it (a
//     shelf: oceanCeilKm → shelfDeepKm over shelfKm), but where orogeny raised it — an island arc's crust, a volcano.
// Every hold is soft (the ground keeps its own texture, squeezed into a band under the bound), and the exceptions are
// read through the terrain's own warped sampling of the sim mesh (as the belts and coasts are), not cell by cell — so
// no sim cell's outline shows (G2d: flat light-blue bands and "diamonds" on the sea).
// Laid down before the rivers carve, so they run to the coast it draws.

import { CrustType } from '../tectonics/model/crust.js';
import { PRESENT } from './present-config.js';

/** h held above f, softly: unchanged from f + s up, squeezed toward f below (continuous, its slope 1 at f + s). */
const softFloor = (h, f, s) => (h >= f + s ? h : f + s * Math.exp((h - f - s) / s));
/** h held below c, softly: unchanged up to c − s, squeezed toward c above. */
const softCeil = (h, c, s) => (h <= c - s ? h : c - s * Math.exp(-(h - c + s) / s));

/**
 * Per sim cell: where a land piece's crust opened a sea (ocean crust on a land piece: 1 in `opened`), and where orogeny
 * raised an ocean piece (island-arc crust, and every cell within volcanoReachKm of a volcano: 1 in `raised`).
 * @param {Uint8Array} crustLand  each sim cell's piece is land (as edited)
 * @param {Uint8Array} [shelfSea]  G3e: the seas between a stretched continent's blocks on their shelves (present/belts.js):
 *   not opened — held on the land pieces' floor, a shelf sea (the Java Sea), and counted with the sea, not the land
 */
export function heldCells(frame, sim, crustLand, cfg = PRESENT, shelfSea = null) {
    const n = frame.type.length, { adjOffset, adjList } = sim, opened = new Uint8Array(n), raised = new Uint8Array(n);
    let front = [];
    for (let c = 0; c < n; c++) {
        if (crustLand[c]) { if (frame.type[c] === CrustType.OCEAN && !shelfSea?.[c]) opened[c] = 1; continue; }
        if (frame.type[c] === CrustType.ARC) raised[c] = 1;
        if (frame.volcType[c]) { raised[c] = 1; front.push(c); }
    }
    const rings = Math.max(1, Math.round(cfg.volcanoReachKm / sim.edgeKm));
    for (let r = 0; r < rings; r++) {
        const next = [];
        for (const c of front) for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const nb = adjList[k]; if (!raised[nb] && !crustLand[nb]) { raised[nb] = 1; next.push(nb); } }
        front = next;
    }
    return { opened, raised, shelf: shelfSea ?? null };
}

/**
 * Holds a terrain surface to the pieces, in place.
 * @param {Float32Array} heightKm  the surface on Generate's mesh (km)
 * @param {{regionLand: Uint8Array, regionPlate: Int16Array, opened: Uint8Array, raised: Uint8Array, shelf?: Uint8Array}} m
 *   regionLand: each region's piece is land (as edited); regionPlate: its plate; opened, raised, shelf: heldCells (per
 *   sim cell)
 * @param {{adjOffset, adjList, edgeKm: number}} mesh  Generate's mesh (its terrain mesh)
 * @param {{cells: Int32Array, weights: Float32Array}} S  each region's three sim cells and weights (sampleOnto)
 */
export function holdToPieces(heightKm, m, mesh, S, cfg = PRESENT) {
    const { regionLand, regionPlate, opened, raised, shelf = null } = m, { adjOffset, adjList } = mesh, n = heightKm.length;
    const read = (field, r) => { const o = 3 * r; return S.weights[o] * field[S.cells[o]] + S.weights[o + 1] * field[S.cells[o + 1]] + S.weights[o + 2] * field[S.cells[o + 2]]; };
    // the fore-arc: a land piece's edge where another plate's ocean piece meets it (an active margin, present/plates.js
    // G1c), drowned over foreArcDrownKm so the trench lies offshore — on the pieces' own outline, at any Detail
    const foreArc = new Uint8Array(n);
    let front = [];
    if (regionPlate) for (let r = 0; r < n; r++) {
        if (!regionLand[r]) continue;
        for (let k = adjOffset[r]; k < adjOffset[r + 1]; k++) { const nb = adjList[k]; if (!regionLand[nb] && regionPlate[nb] !== regionPlate[r]) { foreArc[r] = 1; front.push(r); break; } }
    }
    for (let ring = 1; ring < Math.round(cfg.foreArcDrownKm / mesh.edgeKm); ring++) {
        const next = [];
        for (const r of front) for (let k = adjOffset[r]; k < adjOffset[r + 1]; k++) { const nb = adjList[k]; if (regionLand[nb] && !foreArc[nb]) { foreArc[nb] = 1; next.push(nb); } }
        front = next;
    }
    // how far out from the land pieces each ocean piece's region lies, in rings of the mesh (km): the shelf deepens
    const rings = Math.ceil(cfg.shelfKm / mesh.edgeKm), out = new Uint16Array(n).fill(65535);
    front = [];
    for (let r = 0; r < n; r++) if (regionLand[r]) { out[r] = 0; front.push(r); }
    for (let ring = 1; ring <= rings && front.length; ring++) {
        const next = [];
        for (const r of front) for (let k = adjOffset[r]; k < adjOffset[r + 1]; k++) { const nb = adjList[k]; if (out[nb] === 65535) { out[nb] = ring; next.push(nb); } }
        front = next;
    }
    const soft = cfg.holdSoftKm;
    let pieces = 0, flooded = 0;
    const fringe = [];
    for (let r = 0; r < n; r++) {
        const h = heightKm[r];
        if (foreArc[r]) { heightKm[r] = Math.max(cfg.foreArcFloorKm, Math.min(cfg.foreArcDepthKm, h)); pieces++; flooded++; continue; }
        if (regionLand[r]) {
            const o = read(opened, r);                    // (1 inside a sea the crust opened, 0 outside, blended between)
            // (a stretched continent's shelf sea: held on a deeper, softer floor — shallow by its islands, deepening a little
            // away from them, as the Java Sea does)
            const sh = shelf ? read(shelf, r) : 0;
            const floor = sh > 0 ? sh * softFloor(h, cfg.shelfSeaFloorKm, cfg.shelfSeaSoftKm) + (1 - sh) * softFloor(h, cfg.landFloorKm, soft) : softFloor(h, cfg.landFloorKm, soft);
            const held = o * h + (1 - o) * floor;
            heightKm[r] = held;
            // (a stretched continent's shelf sea is sea — Land Coverage counts the land beside it, and never lifts it)
            if (sh > 0.3 || m.fitShelf?.[r]) continue;      // (G5b: nor a fitting coast's edge drowned to interlock)
            pieces++;
            if (held <= 0) { flooded++; if (o < 0.5) fringe.push(r); }
            continue;
        }
        const q = read(raised, r);                        // (1 on an arc's crust or a volcano's flanks)
        const t = Math.min(1, (out[r] === 65535 ? rings : out[r]) * mesh.edgeKm / cfg.shelfKm);
        const ceil = cfg.oceanCeilKm + (cfg.shelfDeepKm - cfg.oceanCeilKm) * t * t * (3 - 2 * t);
        heightKm[r] = q * h + (1 - q) * softCeil(h, ceil, soft);
    }
    // Land Coverage: at most landFloodShare of the land pieces under the sea (the fore-arcs and the crust's own seas
    // counted); past that, the coastal fringe barely under it is lifted just above, the shallowest first — the gulfs a
    // sag drowned and the bays the coast cuts deep stay
    const lift = Math.min(fringe.length, flooded - Math.floor(cfg.landFloodShare * pieces));
    if (lift > 0) {
        fringe.sort((a, b) => heightKm[b] - heightKm[a] || a - b);
        for (let k = 0; k < lift; k++) heightKm[fringe[k]] = cfg.landLiftKm;
    }
}
