// "Plates are larger than their land." A continent with a subduction zone carries an apron of
// captured old ocean, and the trench runs along the apron's smooth outer edge — a little
// offshore, cutting across bays — instead of tracing the jagged coastline.
//
// The plate outline is a morphological closing of the land: grow it by (apron + smoothing),
// then shrink it back by (smoothing). Bays narrower than the smoothing width end up inside the
// plate; everywhere else the outline sits about one apron-width off the coast.

import { kmToHops } from '../../core/sim-mesh.js';
import { hopDistance, touches } from '../../core/mesh-bfs.js';
import { polarFrame } from '../../core/sphere-geom.js';

/**
 * @param {Uint8Array} isLand  1 where the plate has continental crust
 * @returns {{inPlate: Uint8Array, rim: number[]}} plate footprint (land + apron) and its outer-edge cells
 */
export function plateOutlineWithApron(simMesh, isLand, cfg) {
    const { numCells } = simMesh;
    const apron = kmToHops(simMesh, cfg.apronKm), smooth = kmToHops(simMesh, cfg.apronSmoothKm);
    const fromLand = hopDistance(simMesh, c => isLand[c] === 1, apron + smooth);
    const grown = new Uint8Array(numCells);
    for (let c = 0; c < numCells; c++) if (fromLand[c] >= 0) grown[c] = 1;
    const fromOutside = hopDistance(simMesh, c => grown[c] === 0, smooth);
    const inPlate = new Uint8Array(numCells);
    for (let c = 0; c < numCells; c++) if (grown[c] && fromOutside[c] < 0) inPlate[c] = 1;   // deeper than `smooth` inside
    const rim = [];
    for (let c = 0; c < numCells; c++) if (inPlate[c] && touches(simMesh, c, nb => !inPlate[nb])) rim.push(c);
    return { inPlate, rim };
}

/** The passive stretch of the rim (WBP: a few subduction zones are enough to start with), at a random azimuth (degrees). */
export function passiveStretch(coverage, rng) {
    return { from: rng() * 360 - 180, span: 360 * (1 - Math.max(0, Math.min(1, coverage))) };
}

/**
 * Which rim cells start as an active trench: all but the passive stretch (passiveStretch, chosen before the land so the
 * coast is drawn for it — init/landmass.js), azimuths about `centre` measured from `reference`.
 * @returns {{active: Uint8Array, passiveFrom: number, passiveTo: number}} azimuths in degrees about `centre`
 */
export function chooseActiveRim(simMesh, rim, centre, reference, { from, span }) {
    const { xyz, numCells } = simMesh;
    const toPolar = polarFrame(centre, reference);
    const active = new Uint8Array(numCells);
    for (const c of rim) {
        const az = toPolar(xyz[3 * c], xyz[3 * c + 1], xyz[3 * c + 2]).azimuth;
        const offset = ((az - from) % 360 + 360) % 360;
        if (offset >= span) active[c] = 1;
    }
    return { active, passiveFrom: from, passiveTo: from + span };
}
