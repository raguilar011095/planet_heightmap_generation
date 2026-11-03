// The ground held to the pieces (plans/GENERATE_REDESIGN_PLAN.md G2c; owner, 2026-11-03: "anything labeled as a land
// plate needs to be some minimum height, and the same for the ocean plates (land can be underwater for sure, ocean can
// only be above during orogeny) I think this will help keep the sharpness"). On Generate's own mesh, each region by its
// piece as edited — the outlines the Plates tab draws, as fine as the Detail and Irregularity make them:
//   · a land piece is continental crust: never deeper than a shelf (landFloorKm), but where the crust itself opened a
//     sea (a rift's young sea); along another plate's ocean piece (an active margin) its fore-arc is drowned, so the
//     trench lies offshore;
//   · an ocean piece is oceanic crust: never above the sea (oceanCeilKm), but where orogeny raised it — an island arc's
//     crust, a volcano and its flanks.
// Laid down before the rivers carve, so they run to the coast it draws.

import { CrustType } from '../tectonics/model/crust.js';
import { PRESENT } from './present-config.js';

/**
 * Per sim cell: where a land piece's crust opened a sea (ocean crust on a land piece: 1 in `opened`), and where orogeny
 * raised an ocean piece (island-arc crust, and every cell within volcanoReachKm of a volcano: 1 in `raised`).
 * @param {Uint8Array} crustLand  each sim cell's piece is land (as edited)
 */
export function heldCells(frame, sim, crustLand, cfg = PRESENT) {
    const n = frame.type.length, { adjOffset, adjList } = sim, opened = new Uint8Array(n), raised = new Uint8Array(n);
    let front = [];
    for (let c = 0; c < n; c++) {
        if (crustLand[c]) { if (frame.type[c] === CrustType.OCEAN) opened[c] = 1; continue; }
        if (frame.type[c] === CrustType.ARC) raised[c] = 1;
        if (frame.volcType[c]) { raised[c] = 1; front.push(c); }
    }
    const rings = Math.max(1, Math.round(cfg.volcanoReachKm / sim.edgeKm));
    for (let r = 0; r < rings; r++) {
        const next = [];
        for (const c of front) for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const nb = adjList[k]; if (!raised[nb] && !crustLand[nb]) { raised[nb] = 1; next.push(nb); } }
        front = next;
    }
    return { opened, raised };
}

/**
 * Holds a terrain surface to the pieces, in place.
 * @param {Float32Array} heightKm  the surface on Generate's mesh (km)
 * @param {{regionLand: Uint8Array, regionCell: Int32Array, regionPlate: Int16Array, opened: Uint8Array,
 *   raised: Uint8Array}} m  regionLand: each region's piece is land (as edited); regionCell: its sim cell; regionPlate:
 *   its plate; opened, raised: heldCells
 * @param {{adjOffset, adjList, edgeKm: number}} mesh  Generate's mesh (its terrain mesh)
 */
export function holdToPieces(heightKm, m, mesh, cfg = PRESENT) {
    const { regionLand, regionCell, regionPlate, opened, raised } = m, { adjOffset, adjList } = mesh, n = heightKm.length;
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
    let pieces = 0, flooded = 0;
    const fringe = [];
    for (let r = 0; r < n; r++) {
        const c = regionCell[r], h = heightKm[r];
        if (foreArc[r]) { heightKm[r] = Math.max(cfg.foreArcFloorKm, Math.min(cfg.foreArcDepthKm, h)); pieces++; flooded++; }
        else if (regionLand[r]) {
            pieces++;
            if (opened[c]) { flooded += h <= 0; continue; }
            if (h < cfg.landFloorKm) heightKm[r] = cfg.landFloorKm;
            if (heightKm[r] <= 0) { flooded++; fringe.push(r); }
        } else if (h > cfg.oceanCeilKm && !raised[c]) heightKm[r] = cfg.oceanCeilKm;
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
