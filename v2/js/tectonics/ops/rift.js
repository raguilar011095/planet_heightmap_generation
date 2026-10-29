// Rifting (WBP Part Va): a continent breaks along a zig-zag line that goes AROUND cratons (a craton is
// never cut — developer requirement) and
// REUSES old sutures and failed rifts. Rifts begin at a junction — a plume head, or simply the weakest
// point deep in the interior — from which three arms run to the coast; the two cheapest become the
// rift, the third stops short and stays as a failed arm (an aulacogen: a weak line and, later, a
// river corridor). The plate is then split in two along the rift; the halves keep the parent's motion
// for a moment and the torque balance pulls them apart if their trenches disagree, and the Phase 2
// rules open a ridge between them.
//
// This file splits the plate and chooses where a rift starts; finding the rift is ops/rift-path.js, and the sides
// of a rift line are ops/rift-partition.js.

import { CrustType, CrustFlag } from '../model/crust.js';
import { tangentToward, normalize, dot } from '../../core/sphere-geom.js';
import { spreadBelt, OrogenyType } from '../step/orogeny.js';
import { partition } from './rift-partition.js';
export { findRift, riftContext } from './rift-path.js';

/**
 * Split `plate` in two along `path` (raster cells, coast to coast). Cells left of the path stay with the
 * plate; cells to its right go to a new plate that starts with the same orientation and motion.
 * Both new margins are flagged RIFT_MARGIN; the failed arm is flagged FAILED_RIFT.
 * @returns {import('../model/plate.js').Plate} the new plate
 */
export function splitPlate(world, plate, path, failedArm, nameFor, across = null) {
    const { mesh, time, config } = world, { xyz, adjOffset, adjList, numCells } = mesh, crust = plate.crust;
    const onPath = new Uint8Array(numCells);
    for (const c of path) onPath[c] = 1;
    const { side } = partition(mesh, crust, path);      // 1 left (stays) · 2 right (new plate)

    const fresh = world.addPlate('');
    fresh.setQuat(plate.quat.slice());
    fresh.omega = plate.omega.slice();
    for (let c = 0; c < numCells; c++) {
        if (!crust.mask[c] || side[c] !== 2) continue;
        fresh.crust.copyFrom(c, crust, c);
        crust.remove(c);
    }
    for (const [tip, dir] of plate.wings) if (side[tip] === 2) { fresh.wings.set(tip, dir); plate.wings.delete(tip); }   // wing tips go with their half (same frame)
    // margins
    const shoulders = [[], []];                          // the cells each half was left standing along: plate, then fresh
    for (const c of path) if (crust.mask[c]) { crust.flags[c] |= CrustFlag.RIFT_MARGIN; shoulders[0].push(c); }
    for (let c = 0; c < numCells; c++) {
        if (!fresh.crust.mask[c]) continue;
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) if (onPath[adjList[k]]) { fresh.crust.flags[c] |= CrustFlag.RIFT_MARGIN; shoulders[1].push(c); break; }
    }
    // The arm that FAILED gets no shoulders (developer): an aulacogen is a trough that sagged and filled with
    // sediment, not a flank that was lifted — it is a weak, low corridor, and later a river’s way to the sea.
    for (const c of failedArm) { const owner = crust.mask[c] ? crust : fresh.crust.mask[c] ? fresh.crust : null; if (owner) owner.flags[c] |= CrustFlag.FAILED_RIFT; }
    // (the geological record: when each rift basin opened — step/geology.js fills it while it is young; records only)
    for (const c of path) if (crust.mask[c]) crust.riftAt[c] = time;
    for (const s of shoulders[1]) fresh.crust.riftAt[s] = time;
    for (const c of failedArm) { if (crust.mask[c]) crust.riftAt[c] = time; if (fresh.crust.mask[c]) fresh.crust.riftAt[c] = time; }
    // Stretching makes relief too: the flanks a rift opened along are lifted into shoulders (the East African Rift,
    // the Western Ghats, the Brazilian highlands). Recorded here as a belt like any orogeny, so the terrain stage
    // need not work out afterwards where a rift once ran (developer).
    const shoulder = { type: OrogenyType.RIFT, widthKm: config.riftShoulderKm, workKm: config.riftShoulderWorkKm, time };
    const notFailed = cr => (q => !(cr.flags[q] & CrustFlag.FAILED_RIFT));     // the belt spreads AROUND the failed arm, never onto it
    const standing = (cells, cr) => cells.filter(c => !(cr.flags[c] & CrustFlag.FAILED_RIFT));   // a cell on both the rift line and the arm belongs to the arm
    const lifted = [standing(shoulders[0], crust), standing(shoulders[1], fresh.crust)];
    if (lifted[0].length) spreadBelt(plate, mesh, lifted[0], shoulder, config, notFailed(crust));
    if (lifted[1].length) spreadBelt(fresh, mesh, lifted[1], shoulder, config, notFailed(fresh.crust));
    plate.born = time; fresh.born = time;
    if (fresh.crust.count > crust.count) { fresh.hue = plate.hue; plate.hue = fresh.id; }      // (the larger half keeps the colour)
    plate.bornOfRift = fresh.bornOfRift = true;
    plate.riftPartner = fresh.id; fresh.riftPartner = plate.id;
    // the rift push drives each half straight ACROSS the rift's line (the normal to its great circle), each toward its own side
    const centroidOf = cr => { let x = 0, y = 0, z = 0; for (let c = 0; c < numCells; c++) if (cr.mask[c] && cr.type[c] !== CrustType.OCEAN) { x += xyz[3 * c]; y += xyz[3 * c + 1]; z += xyz[3 * c + 2]; } const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
    const ca = centroidOf(crust), cb = centroidOf(fresh.crust);
    if (across) {
        const mid = normalize([ca[0] + cb[0], ca[1] + cb[1], ca[2] + cb[2]]), toA = tangentToward(mid, cb, ca), sign = dot(across, toA) >= 0 ? 1 : -1;
        plate.riftPushDir = across.map(x => sign * x); fresh.riftPushDir = across.map(x => -sign * x);
    } else { plate.riftPushDir = tangentToward(ca, cb, ca); fresh.riftPushDir = tangentToward(cb, ca, cb); }
    plate.markReshaped(); fresh.markReshaped();
    plate.refreshExtent(xyz); fresh.refreshExtent(xyz);
    const [nameA, nameB] = nameFor(plate, fresh);
    plate.name = nameA; fresh.name = nameB;
    return fresh;
}

/**
 * Where a rift would start on this plate without a plume: a weak cell deep in the interior, chosen at
 * random weighted by weakness (suture / failed rift ≫ ordinary crust; never a craton) and by distance
 * from the coast. @returns raster cell, or −1 if the plate has no interior
 */
export function chooseJunction(world, plate, rng) {
    const { mesh, config } = world, { adjOffset, adjList, numCells, edgeKm } = mesh, crust = plate.crust;
    const land = c => crust.mask[c] && crust.type[c] !== CrustType.OCEAN;
    const dist = new Int16Array(numCells).fill(-1);
    let frontier = [];
    for (let c = 0; c < numCells; c++) { if (!land(c)) continue; for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) if (!land(adjList[k])) { dist[c] = 0; frontier.push(c); break; } }
    for (let d = 1; frontier.length; d++) { const next = []; for (const c of frontier) for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const nb = adjList[k]; if (land(nb) && dist[nb] < 0) { dist[nb] = d; next.push(nb); } } frontier = next; }
    const minHops = Math.ceil(config.riftMinArmKm / edgeKm), weak = CrustFlag.SUTURE | CrustFlag.FAILED_RIFT;
    const candidates = [], weights = [];
    let total = 0;
    for (let c = 0; c < numCells; c++) {
        if (!land(c) || dist[c] < minHops || crust.type[c] === CrustType.CRATON) continue;
        const w = ((crust.flags[c] & weak) ? 1 : config.riftWeaknessCost) * Math.min(1, dist[c] / (2 * minHops));
        candidates.push(c); weights.push(w); total += w;
    }
    if (!candidates.length) return -1;
    let pick = rng() * total;
    for (let i = 0; i < candidates.length; i++) { pick -= weights[i]; if (pick <= 0) return candidates[i]; }
    return candidates[candidates.length - 1];
}
