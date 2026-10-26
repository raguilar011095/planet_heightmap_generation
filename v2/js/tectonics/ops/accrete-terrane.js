// Terrane accretion (WBP): a small landmass — a microcontinent, or an island arc — that reaches
// another landmass does not suture as an equal; it is added to the bigger one's plate, with a narrow
// belt, and the rest of its own plate carries on. Subduction then JUMPS to the terrane's outboard
// side, and if the terrane came from the overriding plate the polarity REVERSES: neither needs a
// rule of its own, because land always overrides ocean (step/polarity.js) — once the terrane's land
// belongs to the host, whatever ocean arrives at it goes down beneath the host. An arc brings its
// fore-arc with it: the trench-flagged ocean right in front of it moves to the host too, flags and
// all, so the trench line is continuous and its new polarity holds from the first step.

import { CrustType, CrustFlag } from '../model/crust.js';
import { frameRotation } from '../model/plate.js';
import { spreadBelt, beltWidthKm, OrogenyType, BeltSide } from '../step/orogeny.js';
import { closeSeasBetween } from './merge-plates.js';
import { freeCellBeside } from './tidy-plates.js';

/**
 * Move the land cells `terrane` (raster cells of `donor`) onto `host`. Terrane land that would land on land already
 * there goes onto the nearest free cell beside it; only when there is none is it absorbed (counted in `absorbed`).
 * @returns {{cells: number, sealed: number, absorbed: number, scrap?: boolean}}
 */
export function accreteTerrane(world, host, donor, terrane, rateCmYr) {
    const { mesh, config, time } = world, { xyz, index, numCells, adjOffset, adjList } = mesh;
    const H = host.crust, D = donor.crust;
    const origin = new Int8Array(numCells);
    for (let q = 0; q < numCells; q++) if (H.mask[q] && H.type[q] !== CrustType.OCEAN) origin[q] = 1;

    // the fore-arc: the donor's trench-flagged ocean within two cells of the terrane comes along, flags intact — and
    // the ocean right next to the terrane whatever its flags, so the pieces of a broken chain arrive as one strip
    const isTerrane = new Uint8Array(numCells);
    for (const c of terrane) isTerrane[c] = 1;
    const foreArc = [];
    let ring = terrane;
    const seen = new Set(terrane);
    const foreArcHops = Math.max(1, Math.round(config.terraneForeArcKm / mesh.edgeKm));
    for (let hop = 0; hop < foreArcHops; hop++) {
        const next = [];
        for (const c of ring) for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
            const nb = adjList[k];
            if (seen.has(nb) || !D.mask[nb] || D.type[nb] !== CrustType.OCEAN || (hop > 0 && !(D.flags[nb] & CrustFlag.TRENCH))) continue;
            seen.add(nb); next.push(nb); foreArc.push(nb);
        }
        ring = next;
    }

    const P = [0, 0, 0];
    let moved = 0, absorbed = 0, rot = null;
    for (const c of [...terrane, ...foreArc]) {
        donor.toWorld(xyz[3 * c], xyz[3 * c + 1], xyz[3 * c + 2], P);
        let q = host.cellAt(index, P[0], P[1], P[2]);
        const land = isTerrane[c] === 1;
        if (land && origin[q]) {                                          // land (the host's, or terrane already placed) is here
            q = freeCellBeside(host, mesh, q, P, n => origin[n] !== 0);
            if (q < 0) { absorbed++; D.remove(c); continue; }
        }
        if (origin[q] !== 1 && (land || !H.mask[q])) {                   // the host keeps its own land, and its own crust over the fore-arc
            H.copyFrom(q, D, c, rot ??= frameRotation(donor, host));
            if (land) H.flags[q] &= ~CrustFlag.TRENCH;                     // on land the polarity rule re-establishes the trench where it belongs
            if (land) origin[q] = 2;
            if (land) moved++;
        }
        D.remove(c);
    }
    donor.markReshaped();
    host.markReshaped();
    if (D.count === 0) { donor.alive = false; donor.omega = [0, 0, 0]; donor.dynamics = null; }
    if (terrane.length * mesh.cellAreaKm2 < config.terraneMinAreaKm2) { host.refreshExtent(xyz); donor.refreshExtent(xyz); return { cells: moved, sealed: 0, absorbed, scrap: true }; }

    // the strait between terrane and host closes; the seam is a suture; a short belt on both sides
    const sealed = closeSeasBetween(H, origin, mesh, host, config, time);
    const seam = [];
    for (let q = 0; q < numCells; q++) {
        if (!H.mask[q] || H.type[q] === CrustType.OCEAN) continue;
        for (let k = adjOffset[q]; k < adjOffset[q + 1]; k++) { const nb = adjList[k]; if (H.mask[nb] && H.type[nb] !== CrustType.OCEAN && origin[nb] && origin[nb] !== origin[q]) { seam.push(q); break; } }
    }
    for (const q of seam) if (H.type[q] !== CrustType.CRATON) H.flags[q] |= CrustFlag.SUTURE;
    const width = beltWidthKm('ural', 0, rateCmYr, config), work = config.belts.ural.baseKm * 0.5;
    spreadBelt(host, mesh, seam.filter(q => origin[q] === 1), { type: OrogenyType.URAL, widthKm: width, workKm: work, time, side: BeltSide.UPPER }, config, q => origin[q] === 1);
    spreadBelt(host, mesh, seam.filter(q => origin[q] !== 1), { type: OrogenyType.URAL, widthKm: width, workKm: work, time, side: BeltSide.LOWER }, config, q => origin[q] !== 1);
    host.refreshExtent(xyz);
    donor.refreshExtent(xyz);
    return { cells: moved, sealed, absorbed };
}

/** The connected landmass of `plate` that contains any of the given raster cells. */
export function landmassOf(plate, mesh, seeds) {
    const { adjOffset, adjList } = mesh, { mask, type } = plate.crust;
    const seen = new Uint8Array(mask.length), out = [];
    for (const s of seeds) if (mask[s] && type[s] !== CrustType.OCEAN && !seen[s]) { seen[s] = 1; out.push(s); }
    for (let i = 0; i < out.length; i++) for (let k = adjOffset[out[i]]; k < adjOffset[out[i] + 1]; k++) {
        const nb = adjList[k];
        if (!seen[nb] && mask[nb] && type[nb] !== CrustType.OCEAN) { seen[nb] = 1; out.push(nb); }
    }
    return out;
}
