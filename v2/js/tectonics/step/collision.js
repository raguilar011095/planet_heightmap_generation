// Continental collision, tracked per pair of plates. Where land overlaps land the overlap zone is
// the lower plate's leading edge pushed under and into the upper plate: it is not consumed while
// the collision lasts (the viscous lock in torque-balance.js limits how deep it gets). Each step
// the convergence across the seam is integrated as SHORTENING, recorded as orogeny belts on both
// sides (step/orogeny.js), and once enough has been absorbed — or the seam has stalled — the two
// plates weld into one (ops/merge-plates.js redraws the outlines as it does so).
//
//   upper plate  the one whose margin was active (trench flags at the front); a plateau side
//   lower plate  the one whose ocean went down that trench; its edge indents the upper plate
//
// Island-arc crust is not a continent (developer): an arc that meets another plate's land is thin and
// gets scraped onto it — it accretes, piece by piece, as a terrane onto whichever plate it hits (arc
// against arc: the arc of the plate with less continent goes onto the other) — and the ocean behind it
// keeps going down, so the two continents keep closing until their CORES meet. Only continent-on-
// continent overlap counts toward a collision record, its front, its shortening and the weld.

import { CrustType, CrustFlag } from '../model/crust.js';
import { CM_PER_YR_TO_RAD_PER_MYR } from '../config.js';
import { PLANET_RADIUS_KM } from '../../core/sim-mesh.js';
import { tangentToward } from '../../core/sphere-geom.js';
import { spreadBelt, beltWidthKm, beltShape, obliquityDeg, OrogenyType, BeltSide } from './orogeny.js';
import { feedFarField } from './far-field.js';
import { mergePlates } from '../ops/merge-plates.js';
import { accreteTerrane, landmassOf } from '../ops/accrete-terrane.js';
import { scrapeArc } from '../ops/scrape-arc.js';
import { EventKind } from '../model/world.js';
import { centroidOfCells } from '../../core/sphere-geom.js';
import { hopsFrom } from '../../core/mesh-bfs.js';

/**
 * @typedef {Object} Collision
 * @property {number} upper  @property {number} lower       plate ids
 * @property {number} startedAt  @property {number} lastActive   Myr
 * @property {number} shorteningKm      convergence absorbed across the seam so far
 * @property {number} frontKm           length of the collision front now
 * @property {number} closingCmYr       convergence rate across the seam now
 * @property {number} meanRateCmYr      mean convergence rate since the collision began (what sets the belts' reach)
 * @property {number} stalledMyr        how long the seam has been closing slower than sutureStallCmYr
 * @property {number} contactMyr        how long the two have been in contact, counting only steps they actually overlap
 * @property {number} cells             overlap cells now
 * @property {boolean} sutured
 */

/** @returns {boolean} whether any plates were merged (the world view must then be rebuilt) */
export function trackCollisions(world, dt) {
    const { mesh, owner, ownerCell, landClaims, collider, plates, collisions, config, time } = world;
    const { xyz, numCells, adjOffset, adjList, index, edgeKm, cellAreaKm2 } = mesh;

    // overlap cells by pair — and, separately, land that merely TOUCHES another plate's land: a small landmass
    // docks as soon as it touches (an arc fragment sliding along a coast would otherwise never overlap it)
    const byPair = new Map(), touching = new Map();
    for (let w = 0; w < numCells; w++) {
        if (landClaims[w] > 1 && collider[w] >= 0) {
            const a = owner[w], b = collider[w], key = a < b ? `${a}:${b}` : `${b}:${a}`;
            (byPair.get(key) ?? byPair.set(key, []).get(key)).push(w);
            continue;
        }
        const a = owner[w];
        if (a < 0 || plates[a].isBackground || plates[a].crust.type[ownerCell[w]] === CrustType.OCEAN) continue;
        if (plates[a].crust.flags[ownerCell[w]] & CrustFlag.RIFT_MARGIN) continue;        // conjugate rift margins touching are not a docking
        for (let k = adjOffset[w]; k < adjOffset[w + 1]; k++) {
            const nb = adjList[k], b = owner[nb];
            if (b < 0 || b === a || landClaims[nb] > 1 || plates[b].isBackground || plates[b].crust.type[ownerCell[nb]] === CrustType.OCEAN) continue;
            if (plates[b].crust.flags[ownerCell[nb]] & CrustFlag.RIFT_MARGIN) continue;
            const key = a < b ? `${a}:${b}` : `${b}:${a}`;
            (touching.get(key) ?? touching.set(key, []).get(key)).push(w);
        }
    }

    for (const [key, rec] of collisions) if (!rec.sutured && time - rec.lastActive > config.collisionForgetMyr) collisions.delete(key);

    // The pairs were found on the world view as it stood at the start of the step. Every pair below re-checks that
    // both plates are still alive: an earlier pair may have merged one away (its raster is then empty, and welding
    // onto it would make a live plate's crust vanish).
    const bothAlive = (a, b) => plates[a].alive && plates[b].alive;
    let merged = false;
    for (const [key, cells] of touching) {
        if (byPair.has(key) || collisions.has(key)) continue;
        const [idA, idB] = key.split(':').map(Number);
        if (!bothAlive(idA, idB)) continue;
        if (dockIfTerrane(world, plates[idA], plates[idB], cells)) merged = true;
    }
    for (const [key, overlap] of byPair) {
        const [idA, idB] = key.split(':').map(Number);
        if (!bothAlive(idA, idB)) continue;
        // arcs first: whatever arc crust lies in the overlap accretes onto the other plate; what is left is core on core
        const { core, accreted } = accreteArcs(world, plates[idA], plates[idB], overlap);
        if (accreted) merged = true;
        if (!core.length || !bothAlive(idA, idB)) continue;                        // (the arcs may have been all there was of one)
        const cells = core;
        let rec = collisions.get(key);
        if (!rec && isRiftJitter(world, plates[idA], plates[idB], cells)) continue;        // two halves that just parted, one cell out of step
        // the two halves of a fresh rift jitter against each other along it: no collision — but only while the contact is a
        // sliver. Driven back into each other (another plate pushing), their overlap is a collision like any other.
        if (!rec && areYoungRiftPartners(plates[idA], plates[idB], time, config) && cells.length * cellAreaKm2 / edgeKm <= config.riftJitterFrontKm) continue;
        if (!rec) {
            const { upper, lower } = chooseSides(world, plates[idA], plates[idB], cells);
            rec = { upper: upper.id, lower: lower.id, startedAt: time, lastActive: time, shorteningKm: 0, frontKm: 0, closingCmYr: 0, meanRateCmYr: 0, stalledMyr: 0, contactMyr: 0, cells: 0, sutured: false, announce: false, underthrustDue: 0, underthrustCells: 0 };
            collisions.set(key, rec);
            // A small landmass (a microcontinent, an arc) is a terrane: it docks at once instead of colliding as an equal.
            const docked = dockIfTerrane(world, upper, lower, cells);
            if (docked) { collisions.delete(key); merged = true; continue; }        // (the next piece to arrive starts afresh)
            rec.announce = true;                                                        // "meets" is logged once the record is confirmed below
        }
        if (rec.sutured) continue;
        const U = plates[rec.upper], L = plates[rec.lower];
        rec.cells = cells.length;
        rec.lastActive = time;
        rec.contactMyr += dt;

        // convergence across the seam: the lower plate's velocity relative to the upper, along the line from
        // the lower body to the upper body, at the centre of the overlap
        const c = centroidOfCells(xyz, cells), cU = U.toWorld(U.capCenter[0], U.capCenter[1], U.capCenter[2], [0, 0, 0]), cL = L.toWorld(L.capCenter[0], L.capCenter[1], L.capCenter[2], [0, 0, 0]);
        const n = tangentToward(c, cL, cU);
        const o = [L.omega[0] - U.omega[0], L.omega[1] - U.omega[1], L.omega[2] - U.omega[2]];
        const closing = (o[1] * c[2] - o[2] * c[1]) * n[0] + (o[2] * c[0] - o[0] * c[2]) * n[1] + (o[0] * c[1] - o[1] * c[0]) * n[2];
        rec.closingCmYr = closing / CM_PER_YR_TO_RAD_PER_MYR;
        if (rec.startedAt === time && rec.closingCmYr < 0 && cells.length * cellAreaKm2 / edgeKm <= config.collisionJitterFrontKm) { collisions.delete(key); continue; }   // parting plates one cell out of step: not a collision
        if (rec.announce) { rec.announce = false; world.log(EventKind.COLLISION, `${L.name} meets ${U.name}`, { upper: U.id, lower: L.id }); }
        const km = Math.max(0, closing) * dt * PLANET_RADIUS_KM;
        rec.shorteningKm += km;
        rec.stalledMyr = rec.closingCmYr < config.sutureStallCmYr ? rec.stalledMyr + dt : 0;
        rec.meanRateCmYr = rec.shorteningKm / Math.max(dt, time - rec.startedAt) / 10;          // km/Myr ÷ 10 = cm/yr

        // the front: overlap cells that touch the upper plate's own land (and the lower plate's, on the other side)
        const upperFront = [], lowerFront = [];
        for (const w of cells) {
            let touchesU = false, touchesL = false;
            for (let k = adjOffset[w]; k < adjOffset[w + 1]; k++) {
                const nb = adjList[k];
                if (landClaims[nb] > 1 || owner[nb] < 0) continue;
                if (owner[nb] === U.id && plates[U.id].crust.type[ownerCell[nb]] !== CrustType.OCEAN) touchesU = true;
                if (owner[nb] === L.id && plates[L.id].crust.type[ownerCell[nb]] !== CrustType.OCEAN) touchesL = true;
            }
            if (touchesU) upperFront.push(U.cellAt(index, xyz[3 * w], xyz[3 * w + 1], xyz[3 * w + 2]));
            if (touchesL) lowerFront.push(L.cellAt(index, xyz[3 * w], xyz[3 * w + 1], xyz[3 * w + 2]));
        }
        rec.frontKm = Math.max(upperFront.length, lowerFront.length) * edgeKm * Math.sqrt(3) / 2;

        // records: a plateau-side belt on the upper plate, a foreland belt on the lower one — both reaching further
        // the more shortening they have absorbed and the faster it comes
        if (km > 0) {
            const major = rec.frontKm >= config.sutureMinContactKm, type = major ? OrogenyType.HIMALAYAN : OrogenyType.URAL;
            // an oblique collision takes much of its motion up as strike-slip along the seam: narrower belts
            const vx = o[1] * c[2] - o[2] * c[1], vy = o[2] * c[0] - o[0] * c[2], vz = o[0] * c[1] - o[1] * c[0];
            const shape = beltShape(closing / Math.max(1e-12, Math.hypot(vx, vy, vz)), undefined, config);
            const upperWidth = beltWidthKm(major ? 'himalayan' : 'ural', rec.shorteningKm, rec.meanRateCmYr, config) * shape;
            const lowerWidth = beltWidthKm(major ? 'foreland' : 'ural', rec.shorteningKm, rec.meanRateCmYr, config) * shape;
            const shear = obliquityDeg([vx, vy, vz], n, c, closing);
            spreadBelt(U, mesh, uniq(upperFront), { type, widthKm: upperWidth, workKm: km, time, side: BeltSide.UPPER, shear }, config);
            spreadBelt(L, mesh, uniq(lowerFront), { type, widthKm: lowerWidth, workKm: km, time, side: BeltSide.LOWER, shear }, config);
            // …and the push it sends through both plates, far beyond the belts (step/far-field.js; records only)
            feedFarField(world, U, `c${key}:u`, uniq(upperFront), km, rec.frontKm, config.farCollisionShare);
            feedFarField(world, L, `c${key}:l`, uniq(lowerFront), km, rec.frontKm, config.farCollisionShare);
        }

        // the lower plate's continent slides under the upper one: its land deep in the overlap is consumed, and the
        // upper plate's crust above it thickens (area → thickness: Tibet)
        const underNow = underthrust(world, U, L, cells, rec, km);

        // weld?
        // enough convergence absorbed, or the seam has stalled, or they have simply been locked together long enough
        const ready = rec.shorteningKm >= config.sutureShorteningKm
            || (rec.stalledMyr >= config.sutureStallMyr && rec.shorteningKm >= config.sutureStallMinKm)
            || rec.contactMyr >= config.sutureContactMyr
            || cells.length * cellAreaKm2 >= config.sutureOverlapKm2;     // so much land stacked on land: they are one already
        // …and the seam has closed (Phase 11): welded with ocean still open between the two, that ocean would be sealed
        // inside one plate for good — or they have been locked together so long that it never will
        // (both measures flood the sea: taken at most every sutureCheckMyr while a pair waits — a seam closes over Myr)
        rec.frontMaxKm = Math.max(rec.frontMaxKm ?? 0, rec.frontKm);          // (a collision's front wanders; once long, it is a collision)
        const due = ready && rec.frontMaxKm >= config.sutureMinContactKm && !(time - (rec.checkedAt ?? -Infinity) < config.sutureCheckMyr);
        if (due) {
            ({ km2: rec.gapKm2, widestKm: rec.gapWidestKm } = openSeaBetween(world, U, L));
            // (is the gap still closing? — the zipper's progress: the smallest gap so far, and when it last shrank by a tenth)
            if (!(rec.gapKm2 >= 0.9 * (rec.gapBestKm2 ?? Infinity))) { rec.gapBestKm2 = rec.gapKm2; rec.gapShrankAt = time; }
        }
        rec.gapKm2 ??= Infinity;
        // (a seam that has stalled long has closed all it will: the pivot has done its work — what is left is a remnant sea)
        const closed = (rec.gapWidestKm ?? Infinity) <= config.sutureGapWidthKm || rec.stalledMyr >= config.sutureStallGiveUpMyr
            || time - (rec.gapShrankAt ?? time) >= config.sutureGapStallMyr, overdue = rec.contactMyr >= config.sutureLockMaxMyr;
        // …and never into a ring: welded round a big sea, one rigid plate would hold it for good — apart, the two can still
        // close it
        // (so much land stacked on land that the two are one already: they weld now, whatever sea is left — a remnant — or
        // whatever they ring; waiting would only stack them deeper)
        // (stacked: how deep, on average, the one lies on the other — the overlap left after this step's underthrusting over the
        // front's length; an area alone would call a long front's single contact row "stacked")
        const stacked = (cells.length - underNow) * cellAreaKm2 / Math.max(rec.frontKm, edgeKm) >= config.sutureStackKm;
        const wouldWeld = ((ready && (closed || stacked)) || overdue) && rec.frontMaxKm >= config.sutureMinContactKm;
        if (wouldWeld && (due || rec.ringKm2 === undefined)) rec.ringKm2 = enclosedSeaBetweenKm2(world, U, L);
        if (due) rec.checkedAt = time;
        if (wouldWeld && rec.ringKm2 > config.ringSeaKm2 && !rec.ringLogged) { rec.ringLogged = true; world.log(EventKind.COLLISION, `${L.name} and ${U.name} stay apart: their land rings a ${(rec.ringKm2 / 1e6).toFixed(1)} Mkm² sea`, { upper: U.id, lower: L.id, ringKm2: rec.ringKm2 }); }
        // (…but not for ever: locked together sutureLockMaxMyr, they weld round it — the sea is then sealed inside one plate,
        // and closes from its shores, step/remnant-seas.js; held apart for good, the pair ground on as a collision without end)
        if (wouldWeld && (rec.ringKm2 <= config.ringSeaKm2 || stacked || overdue)) {
            const result = mergePlates(world, U, L, cells, rec);
            rec.sutured = true;
            merged = true;
            const why = stacked && !closed ? 'stacked' : !closed ? 'overdue' : rec.stalledMyr >= config.sutureStallMyr ? 'stalled' : rec.shorteningKm < config.sutureShorteningKm ? 'contact' : 'shortening';
            world.log(EventKind.SUTURE, `${L.name} sutured to ${U.name} after ${(time - rec.startedAt).toFixed(0)} Myr: ${rec.frontKm.toFixed(0)} km front, ${rec.shorteningKm.toFixed(0)} km of shortening, ` +
                `outlines redrawn (indented up to ${result.maxIndentKm.toFixed(0)} km; ${result.landLostCells} cells of land absorbed into the belt${result.sealedCells ? `, ${result.sealedCells} cells of sea between them closed` : ''})${!closed ? ` — locked together ${rec.contactMyr.toFixed(0)} Myr with ${(rec.gapKm2 / 1e6).toFixed(2)} Mkm² of sea still between them` : rec.stalledMyr >= config.sutureStallMyr ? ' — the seam had stalled' : rec.shorteningKm < config.sutureShorteningKm ? ` — they had been locked together ${rec.contactMyr.toFixed(0)} Myr` : ''}`,
                { upper: U.id, lower: L.id, afterMyr: time - rec.startedAt, frontKm: rec.frontKm, shorteningKm: rec.shorteningKm, maxIndentKm: result.maxIndentKm, landLostCells: result.landLostCells, sealedCells: result.sealedCells, gapKm2: rec.gapKm2, gapWidestKm: rec.gapWidestKm, why });
        }
    }
    return merged;
}

/**
 * The largest sea cut off from the world ocean that both plates' land borders (km²): what a weld would lock inside
 * one rigid plate.
 */
function enclosedSeaBetweenKm2(world, U, L) {
    const { mesh, owner, ownerCell, plates, landClaims } = world, { numCells, adjOffset, adjList, cellAreaKm2 } = mesh;
    const isSea = w => owner[w] < 0 || (landClaims[w] <= 1 && plates[owner[w]].crust.type[ownerCell[w]] === CrustType.OCEAN);
    const comp = new Int32Array(numCells).fill(-1), sizes = [];
    for (let w0 = 0; w0 < numCells; w0++) {
        if (!isSea(w0) || comp[w0] >= 0) continue;
        const id = sizes.length, q = [w0]; comp[w0] = id;
        for (let i = 0; i < q.length; i++) for (let k = adjOffset[q[i]]; k < adjOffset[q[i] + 1]; k++) { const nb = adjList[k]; if (comp[nb] < 0 && isSea(nb)) { comp[nb] = id; q.push(nb); } }
        sizes.push(q.length);
    }
    let world_ = 0;
    for (let i = 1; i < sizes.length; i++) if (sizes[i] > sizes[world_]) world_ = i;
    const bordersU = new Uint8Array(sizes.length), bordersL = new Uint8Array(sizes.length);
    for (let w = 0; w < numCells; w++) {
        const o = owner[w];
        if ((o !== U.id && o !== L.id) || isSea(w)) continue;
        for (let k = adjOffset[w]; k < adjOffset[w + 1]; k++) { const c = comp[adjList[k]]; if (c >= 0) (o === U.id ? bordersU : bordersL)[c] = 1; }
    }
    let biggest = 0;
    for (let i = 0; i < sizes.length; i++) if (i !== world_ && bordersU[i] && bordersL[i]) biggest = Math.max(biggest, sizes[i]);
    return biggest * cellAreaKm2;
}

/**
 * The sea still open between the two plates' land: sea cells within sutureGapKm of both — measured through the sea from
 * each plate's coast — with the two distances together no more than sutureGapKm, and the two nearest coasts on opposite
 * sides of it (more than 120° apart): between them, not beside them (the seas either side of India's nose never close,
 * and need not). @returns {{km2: number, widestKm: number}} its area, and how wide it is at its widest, coast to coast
 */
function openSeaBetween(world, U, L) {
    const { mesh, owner, ownerCell, plates, landClaims, config } = world, { numCells, adjOffset, adjList, edgeKm, cellAreaKm2 } = mesh;
    const isSea = w => owner[w] < 0 || (landClaims[w] <= 1 && plates[owner[w]].crust.type[ownerCell[w]] === CrustType.OCEAN);
    const coastU = [], coastL = [];
    for (let w = 0; w < numCells; w++) {
        const o = owner[w];
        if ((o !== U.id && o !== L.id) || isSea(w)) continue;
        for (let k = adjOffset[w]; k < adjOffset[w + 1]; k++) if (isSea(adjList[k])) { (o === U.id ? coastU : coastL).push(w); break; }
    }
    const hops = Math.max(1, Math.round(config.sutureGapKm / edgeKm)), fU = hopsFrom(mesh, coastU, isSea, hops), fL = hopsFrom(mesh, coastL, isSea, hops);
    const { xyz } = mesh, dir = (w, s, out) => { const x = xyz[3 * w], y = xyz[3 * w + 1], z = xyz[3 * w + 2]; let ax = xyz[3 * s] - x, ay = xyz[3 * s + 1] - y, az = xyz[3 * s + 2] - z; const d = ax * x + ay * y + az * z; ax -= d * x; ay -= d * y; az -= d * z; const l = Math.hypot(ax, ay, az) || 1; out[0] = ax / l; out[1] = ay / l; out[2] = az / l; };
    const a = [0, 0, 0], b = [0, 0, 0];
    let cells = 0, widest = 0;
    for (let w = 0; w < numCells; w++) {
        const du = fU.dist[w], dl = fL.dist[w];
        if (!(du > 0 && dl > 0 && du + dl <= hops + 1)) continue;
        dir(w, fU.source[w], a); dir(w, fL.source[w], b);
        const facing = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
        if (facing < -0.5) cells++;
        if (facing < -0.87) widest = Math.max(widest, du + dl - 1);
    }
    // (the area, and the widest the sea is across — from coast to coast through its widest cell, in cells and so in km —
    // taken where the two coasts face each other (over 150° apart): the open sea beyond the end of a closing seam has one
    // coast to the side, not across, and is not a gap still to close)
    return { km2: cells * cellAreaKm2, widestKm: widest * edgeKm };
}

/**
 * Arc crust in the overlap of plates A and B goes onto the plate whose land it lies against: A's arc cells under
 * B's continent accrete to B (and the other way round); arc on arc, the arc of the plate with less continent
 * accretes to the other. Each arc takes with it the strip of arc it is joined to, out to arcAccreteReachKm — the
 * rest of a long chain follows as it arrives. @returns the overlap cells that are core on core, and whether anything moved
 */
function accreteArcs(world, A, B, overlap) {
    const { mesh } = world, { xyz, index, cellAreaKm2 } = mesh;
    const isArc = (plate, cell) => plate.crust.mask[cell] && plate.crust.type[cell] === CrustType.ARC;
    const cellOf = (plate, w) => plate.cellAt(index, xyz[3 * w], xyz[3 * w + 1], xyz[3 * w + 2]);
    const core = [], fromA = [], fromB = [];
    // arc against arc: the arc of the plate carrying less continent is the one scraped off
    const arcOfALoses = A.stats.continentalCells < B.stats.continentalCells || (A.stats.continentalCells === B.stats.continentalCells && A.id > B.id);
    for (const w of overlap) {
        const a = cellOf(A, w), b = cellOf(B, w), arcA = isArc(A, a), arcB = isArc(B, b);
        if (!arcA && !arcB) { core.push(w); continue; }              // core on core: a collision proper
        if (arcA && arcB) { if (arcOfALoses) fromA.push(a); else fromB.push(b); continue; }
        if (arcA) fromA.push(a); else fromB.push(b);
    }
    let accreted = 0;
    for (const [donor, host, arriving] of [[A, B, fromA], [B, A, fromB]]) {
        if (!arriving.length || !donor.alive || !host.alive) continue;
        // a small arc does not accrete: it goes down with its slab (Phase 7c) — what continents gain from arcs is
        // fewer, bigger pieces (Japan, Kohistan), not every islet
        const seeds = [...new Set(arriving)].filter(c => !recycleSmallArc(world, donor, c));
        if (!seeds.length) { accreted++; continue; }
        const { moved } = scrapeArc(world, host, donor, seeds);
        accreted += moved;
        const at = world.arcScrapes.get(`${donor.id}:${host.id}`) ?? { cells: 0, since: world.time, donorName: donor.name };
        at.cells += moved; at.last = world.time;
        world.arcScrapes.set(`${donor.id}:${host.id}`, at);
        // one line per arrival, once the strip is worth naming (it arrives a cell at a time over several Myr)
        if (!at.logged && at.cells * cellAreaKm2 >= world.config.arcScrapeLogKm2) {
            at.logged = true;
            world.log(EventKind.ARC_SCRAPE, `island arc of ${at.donorName} is scraped onto ${host.name} (${(at.cells * cellAreaKm2 / 1e6).toFixed(2)} Mkm² so far): the ocean behind it keeps going down${donor.alive ? '' : `; ${at.donorName} is gone`}`,
                { host: host.id, donor: donor.id, areaMkm2: at.cells * cellAreaKm2 / 1e6, donorGone: !donor.alive });
        }
    }
    return { core, accreted: accreted > 0 };
}

/** The two sides of a rift younger than riftPushMyr: pushed apart, never in collision with each other. */
export function areYoungRiftPartners(A, B, time, config) {
    return A.riftPartner === B.id && B.riftPartner === A.id && time - Math.max(A.born, B.born) < config.riftPushMyr;
}

/** A few overlap cells where both plates carry rift-margin flags: the conjugate margins of a fresh rift jittering, not a collision. */
function isRiftJitter(world, A, B, cells) {
    const { xyz, index, cellAreaKm2, edgeKm } = world.mesh;
    if (cells.length * cellAreaKm2 / edgeKm > world.config.riftJitterFrontKm) return false;      // (as long as a one-cell sliver of that area)
    return cells.every(w => (A.crust.flags[A.cellAt(index, xyz[3 * w], xyz[3 * w + 1], xyz[3 * w + 2])] & CrustFlag.RIFT_MARGIN) && (B.crust.flags[B.cellAt(index, xyz[3 * w], xyz[3 * w + 1], xyz[3 * w + 2])] & CrustFlag.RIFT_MARGIN));
}

/**
 * If either landmass at this contact is smaller than terraneMaxAreaKm2, move it onto the other's plate.
 * The smaller of the two docks; the other is the host. @returns {boolean} whether a terrane docked
 */
function dockIfTerrane(world, A, B, cells) {
    const { mesh, config } = world, { xyz, index, cellAreaKm2 } = mesh;
    const under = plate => cells.map(w => plate.cellAt(index, xyz[3 * w], xyz[3 * w + 1], xyz[3 * w + 2]));
    const massA = landmassOf(A, mesh, under(A)), massB = landmassOf(B, mesh, under(B));
    const areaA = massA.length * cellAreaKm2, areaB = massB.length * cellAreaKm2;
    // a terrane: a landmass under the size limit, or one that is mostly island-arc crust whatever its size (an arc never sutures as an equal)
    const mostlyArc = (plate, mass) => mass.filter(q => plate.crust.type[q] === CrustType.ARC).length * 2 > mass.length;
    const terraneA = areaA > 0 && (areaA < config.terraneMaxAreaKm2 || mostlyArc(A, massA)), terraneB = areaB > 0 && (areaB < config.terraneMaxAreaKm2 || mostlyArc(B, massB));
    if (!terraneA && !terraneB) return false;
    if (areaA === 0 || areaB === 0) return false;
    // the host is the plate that carries the continent: when both pieces are terranes, the plate with more land overall
    const aHosts = !terraneA || (terraneB && A.stats.continentalCells >= B.stats.continentalCells);
    const [host, donor, mass] = aHosts ? [A, B, massB] : [B, A, massA];   // each piece of an arc docks as it arrives
    const o = [donor.omega[0] - host.omega[0], donor.omega[1] - host.omega[1], donor.omega[2] - host.omega[2]];
    const c = centroidOfCells(xyz, cells), rate = Math.hypot(o[1] * c[2] - o[2] * c[1], o[2] * c[0] - o[0] * c[2], o[0] * c[1] - o[1] * c[0]) / CM_PER_YR_TO_RAD_PER_MYR;
    const kind = mass.filter(q => donor.crust.type[q] === CrustType.ARC).length * 2 > mass.length ? 'island arc' : 'terrane';
    if (kind === 'island arc' && mass.length * cellAreaKm2 < config.arcAccreteMinKm2) { recycle(world, donor, mass); return true; }   // too small to accrete: it goes down (Phase 7c)
    const donorName = donor.name, result = accreteTerrane(world, host, donor, mass, rate);
    if (result.scrap) return true;
    world.log(EventKind.DOCK, `${kind} of ${donorName} (${(mass.length * cellAreaKm2 / 1e6).toFixed(2)} Mkm²) accretes to ${host.name}: ${result.cells} cells transferred${result.sealed ? `, ${result.sealed} cells of strait closed` : ''}; subduction jumps to its outboard side${donor.alive ? '' : `; ${donorName} is gone`}`,
        { host: host.id, donor: donor.id, arc: kind === 'island arc', areaMkm2: mass.length * cellAreaKm2 / 1e6, cells: result.cells, sealed: result.sealed, donorGone: !donor.alive });
    return true;
}

/** The upper plate is the one whose land at the front carries the active-margin (trench) flags; failing that, the larger continent. */
function chooseSides(world, A, B, cells) {
    const { xyz, index, adjOffset, adjList } = world.mesh;
    const flagged = plate => {
        let n = 0;
        const seen = new Set();
        for (const w of cells) for (let k = adjOffset[w]; k < adjOffset[w + 1]; k++) {
            const nb = adjList[k];
            if (seen.has(nb)) continue;
            seen.add(nb);
            const c = plate.cellAt(index, xyz[3 * nb], xyz[3 * nb + 1], xyz[3 * nb + 2]);
            if (plate.crust.mask[c] && plate.crust.type[c] !== CrustType.OCEAN && (plate.crust.flags[c] & CrustFlag.TRENCH)) n++;
        }
        return n;
    };
    const fa = flagged(A), fb = flagged(B);
    if (fa !== fb) return fa > fb ? { upper: A, lower: B } : { upper: B, lower: A };
    return A.stats.continentalCells >= B.stats.continentalCells ? { upper: A, lower: B } : { upper: B, lower: A };
}


/**
 * Continental underthrusting (Phase 7c). Land does not subduct as a slab, but the leading edge of the lower plate's
 * continent slides under the upper plate as the two converge: every step, underthrustShare of the area the
 * convergence sweeps (shortening this step × the front's length) is consumed from the lower plate's land in the
 * overlap — its most advanced cells first (farthest from its own side), never the contact row itself, so the
 * collision still locks — and the upper plate's crust above each consumed cell thickens by underthrustThickenKm (up
 * to underthrustMaxThickKm). So a collision eats continental area in step with its convergence, as Tibet swallowed
 * ~2000 km of India, and turns it into a plateau for Phase 8. Cratons are never consumed: they never break.
 * @returns {number} cells consumed
 */
function underthrust(world, U, L, cells, rec, km) {
    const { mesh, config, owner, ownerCell, landClaims } = world, { xyz, index, adjOffset, adjList, cellAreaKm2 } = mesh;
    if (!(config.underthrustShare > 0) || km <= 0) return 0;
    rec.underthrustDue = (rec.underthrustDue ?? 0) + config.underthrustShare * km * rec.frontKm / cellAreaKm2;   // cells owed
    const inOverlap = new Set(cells), lowerSide = [];
    for (const w of cells) for (let k = adjOffset[w]; k < adjOffset[w + 1]; k++) {
        const nb = adjList[k];
        if (!inOverlap.has(nb) && landClaims[nb] <= 1 && owner[nb] === L.id && L.crust.type[ownerCell[nb]] !== CrustType.OCEAN) { lowerSide.push(w); break; }
    }
    if (!lowerSide.length) return 0;
    const depth = hopsFrom(mesh, lowerSide, w => inOverlap.has(w)).dist;
    const candidates = cells.filter(w => depth[w] > 0).sort((p, q) => depth[q] - depth[p] || p - q);     // most advanced first
    // (and the overlap never piles up: land stacked deeper than overlapCapKm over the front goes under too — a collision
    // that waits for its seam to close, turning as it waits, keeps converging, and its lower plate's edge keeps going under:
    // India lost ~2,000 km of its front beneath Tibet)
    const excess = Math.max(0, cells.length - Math.max(1, Math.floor(rec.frontKm * config.overlapCapKm / cellAreaKm2)));
    let consumed = 0;
    for (const w of candidates) {
        if (consumed >= Math.max(Math.floor(rec.underthrustDue), excess)) break;
        const x = xyz[3 * w], y = xyz[3 * w + 1], z = xyz[3 * w + 2], cl = L.cellAt(index, x, y, z);
        if (!L.crust.mask[cl] || L.crust.type[cl] === CrustType.OCEAN || L.crust.type[cl] === CrustType.CRATON) continue;
        L.crust.remove(cl);
        consumed++;
        const cu = U.cellAt(index, x, y, z);
        if (U.crust.mask[cu] && U.crust.type[cu] !== CrustType.OCEAN) {
            U.crust.thickKm[cu] = Math.min(config.underthrustMaxThickKm, U.crust.thickKm[cu] + config.underthrustThickenKm);
            U.crust.rootKm[cu] = Math.min(config.underthrustMaxThickKm, U.crust.rootKm[cu] + config.underthrustThickenKm);    // (heights: the plateau's root)
        }
    }
    rec.underthrustDue = Math.min(Math.max(0, rec.underthrustDue - consumed), 1);      // (what could not be consumed this step is not carried)
    rec.underthrustCells = (rec.underthrustCells ?? 0) + consumed;
    world.budget.underthrustCells += consumed;
    if (consumed) { L.markReshaped(); U.dirty = true; }
    return consumed;
}

/**
 * If raster cell `cell` of `donor` belongs to a piece of island arc smaller than arcAccreteMinKm2, that whole piece is
 * recycled — it goes down with the slab instead of accreting — and true is returned.
 */
function recycleSmallArc(world, donor, cell) {
    const { mesh, config } = world, { adjOffset, adjList, cellAreaKm2 } = mesh, { mask, type } = donor.crust;
    if (!mask[cell] || type[cell] !== CrustType.ARC) return false;
    const piece = [cell], seen = new Set(piece), limit = Math.ceil(config.arcAccreteMinKm2 / cellAreaKm2);
    for (let i = 0; i < piece.length && piece.length < limit; i++) for (let k = adjOffset[piece[i]]; k < adjOffset[piece[i] + 1]; k++) {
        const nb = adjList[k];
        if (!seen.has(nb) && mask[nb] && type[nb] === CrustType.ARC) { seen.add(nb); piece.push(nb); }
    }
    if (piece.length >= limit) return false;                    // (the flood stops as soon as the piece is big enough to keep)
    recycle(world, donor, piece);
    return true;
}

/** Remove arc cells of `donor` into the mantle (they go down with the slab), logging it if the piece is worth naming. */
function recycle(world, donor, cells) {
    const { cellAreaKm2 } = world.mesh;
    for (const c of cells) donor.crust.remove(c);
    donor.markReshaped();
    world.budget.recycledCells += cells.length;
    if (cells.length * cellAreaKm2 >= world.config.terraneMinAreaKm2) world.log(EventKind.ARC_RECYCLED, `a small island arc of ${donor.name} (${(cells.length * cellAreaKm2 / 1e3).toFixed(0)}k km²) goes down with its slab instead of accreting`, { donor: donor.id, areaKm2: cells.length * cellAreaKm2 });
    if (donor.crust.count === 0) { donor.alive = false; donor.omega = [0, 0, 0]; donor.dynamics = null; }
}

const uniq = list => [...new Set(list)];
