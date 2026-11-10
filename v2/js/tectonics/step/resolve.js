// Resolve: rebuild the world view for "now" AND settle what plate motion did to the crust.
//   • two plates claim a cell → convergence: the subducting crust is deleted (polarity.js);
//                               land against land is left overlapping and reported as a collision
//   • no plate claims a cell  → divergence: new ocean crust grows on the flanking plates, split
//                               along the gap's mid-line (never on the passive background)
// Afterwards every world cell has an owner. `ownerCell` always points at real crust; the few cells
// that may not be filled yet are flagged in `world.provisional` (see assignGapOwners).

import { CrustType, CrustFlag } from '../model/crust.js';
import { Provisional } from '../model/world.js';
import { CM_PER_YR_TO_RAD_PER_MYR } from '../config.js';
import { forEachClaim, clearWorldView, claimMapNow } from './gather.js';
import { overrides } from './polarity.js';
import { binIndex, markBin, mayHaveCrustNear } from './occupancy.js';
import { ringsOf, RING_COUNT } from '../../core/mesh-rings.js';
import { fractureCoordinate } from '../model/segments.js';

// How far the growth step looks, in cells. Both assume a gap opens by a cell or so per step, each flank growing its half
// (config.maxCellsPerStep ≲ 2.25 — the whole-planet scenes' — about a cell a flank): raise that and these must grow with it.
const REACH_RINGS = 2;        // rings of raster cells around a gap cell that are considered for growth
const AHEAD_CONE = 0.5;        // cos 60°: crust counts as "ahead" of a moving edge if it lies within 60° of the motion
const PROXIMITY_RINGS = 3;    // how far from existing crust a new cell may be, and how far "nearby" crust is sought
if (PROXIMITY_RINGS > RING_COUNT) throw new Error('core/mesh-rings.js keeps too few rings for the growth step');

/** @returns {{created:number, consumed:number, collisionCells:number}} this step's tallies, in cells */
export function resolve(world) {
    world.occupancyStamp++;                            // this pass's mark in the coarse occupancy bins (step/occupancy.js)
    const consumed = gatherAndSubduct(world);
    const gaps = [];
    for (let w = 0; w < world.owner.length; w++) if (world.owner[w] < 0) gaps.push(w);
    const created = gaps.length ? growCrustIntoGaps(world, gaps) : 0;
    if (gaps.length) assignGapOwners(world, gaps);
    world.budget.created += created;
    world.budget.consumed += consumed;

    let collisionCells = 0;
    for (let w = 0; w < world.landClaims.length; w++) if (world.landClaims[w] > 1) collisionCells++;
    for (const p of world.plates) {
        if (p.alive && p.dirty) p.refreshExtent(world.mesh.xyz);
        p.reshaped = false;                            // the world view is current again for every plate
    }
    return { created, consumed, collisionCells };
}

// ─────────────────────────────── convergence ───────────────────────────────

function gatherAndSubduct(world) {
    const { owner, ownerCell, claimCount, landClaims, consumedAt, collider, plates } = world;
    let consumed = 0;
    const subduct = (plate, cell, w) => {
        plate.crust.remove(cell); plate.dirty = true; consumedAt[w] = 1; consumed++;
        // (the plate's marks of what lies near the edge of its crust — gather.js nearEdge — were made with this cell as
        // crust, if they were made before now: it is marked itself, so the growth step, which reads them, still searches here)
        const ne = plate._nearEdge;
        if (ne) ne.marks[cell] = ne.stamp;
    };
    const bins = binIndex(world.mesh), stamp = world.occupancyStamp;
    clearWorldView(world);

    forEachClaim(world, (w, plate, cell) => {
        markBin(plate, bins.binOf[w], stamp, bins.count);
        const land = plate.crust.type[cell] !== CrustType.OCEAN;
        const holder = owner[w] < 0 ? null : plates[owner[w]];
        // no holder yet — or its crust here was just subducted via another world cell that maps to the same raster cell
        if (!holder || !holder.crust.mask[ownerCell[w]]) {
            owner[w] = plate.id; ownerCell[w] = cell;
            claimCount[w] = 1; landClaims[w] = land ? 1 : 0;
            return;
        }
        const wins = overrides(plate, cell, holder, ownerCell[w], world.oceanOverrider[w]);
        if (wins === null) {                            // land on land — unresolved collision
            claimCount[w]++; landClaims[w]++;
            if (collider[w] < 0) collider[w] = plate.id;
        } else if (wins) {                              // the holder's crust goes down
            subduct(holder, ownerCell[w], w);
            owner[w] = plate.id; ownerCell[w] = cell;
            if (land) landClaims[w] = 1;
        } else subduct(plate, cell, w);                 // this plate's crust goes down
    }, stamp);

    // A raster cell can be the nearest one for two world cells; if it was subducted through one of them,
    // the other must not keep pointing at it.
    for (let w = 0; w < owner.length; w++) if (owner[w] >= 0 && !plates[owner[w]].crust.mask[ownerCell[w]]) { owner[w] = -1; claimCount[w] = 0; landClaims[w] = 0; }
    return consumed;
}

// ─────────────────────────────── divergence ───────────────────────────────
// Symmetric spreading: each flank takes the half of a gap on its side of the mid-line, so the ridge
// sits mid-way and migrates at the mean of the two plate velocities.
//
// Growth happens on each plate's OWN lattice: plate X creates exactly those of its raster cells whose
// true centres (a) lie in the gap, (b) are nearer to X's existing crust than to any other plate's —
// by at least half a cell, because a cell's footprint reaches half a cell past its centre — and
// (c) are not at an edge of X that is advancing on a neighbour. Deciding per WORLD cell instead is
// subtly biased: a plate's lattice is rotated against the world's, a created cell lands up to half a
// cell off the world cell it stands for, and the faster-moving plate creeps outward every step.
// All tests use the crust as it was before this step, so plate order cannot matter. The passive
// background never grows: beside it, the moving plate takes the whole gap.

function growCrustIntoGaps(world, gaps) {
    const growers = world.plates.filter(p => p.alive && !p.isBackground && p.crust.count > 0);
    const everyone = world.plates.filter(p => p.alive && p.crust.count > 0).map(plate => ({ plate, cap: plate.capInWorld(world.mesh) }));
    const births = [];
    for (const grower of growers) {
        // (the gather's marks of what lies within PROXIMITY_RINGS rings of the edge of this plate's crust, if it made them
        // this pass: a candidate off the crust and not marked has no crust within reach — birthOf's first test)
        const ne = grower._nearEdge, marks = ne && ne.pass === world.occupancyStamp && ne.marks.length === world.mesh.numCells ? ne.marks : null;
        for (const cell of candidateCells(world, grower, gaps)) {
            const trenchParent = birthOf(world, grower, cell, everyone, marks, marks ? ne.stamp : 0);
            if (trenchParent !== NOT_BORN) births.push({ plate: grower, cell, trenchParent });
        }
    }
    const bins = binIndex(world.mesh), P = [0, 0, 0];
    for (const { plate, cell, trenchParent } of births) {
        const crust = plate.crust;
        crust.create(cell, CrustType.OCEAN, world.time);
        plate.toWorld(world.mesh.xyz[3 * cell], world.mesh.xyz[3 * cell + 1], world.mesh.xyz[3 * cell + 2], P);
        crust.fzU[cell] = fractureAt(world, plate, cell, P);
        markBin(plate, bins.at(P[0], P[1], P[2]), world.occupancyStamp, bins.count);       // so the owner search below sees it
        // Trench rollback, in its simplest form: when a plate backs away from its own trench, the trench is
        // not left behind inside the plate — it stays at the plate's edge, on the new crust that forms
        // there, and keeps its slab (WBP's trailing-edge margin; arcs and back-arc basins come later).
        if (trenchParent >= 0) { crust.armTrench(cell, crust.slabKm[trenchParent]); crust.flags[cell] |= CrustFlag.APRON; }
        plate.dirty = true;
    }
    return births.length;
}

/**
 * Where along its ridge new floor at world point P forms (records only: model/segments.js): its coordinate about the
 * relative rotation of the grower and the plate across the gap — the most frequent other owner around P's world cell
 * (the passive ocean, or no one, counts as still).
 */
function fractureAt(world, grower, cell, P) {
    const { index, adjOffset, adjList } = world.mesh, { owner, plates } = world, w = index.nearest(P[0], P[1], P[2]);
    // (across the gap, ring by ring through the gap's own cells, to the first ring that meets another plate: a gap is often
    // wider than a cell, and the grower alone around a cell would measure about its own rotation, not the ridge's)
    let partner = -1, most = 0, ring = [w];
    const seen = new Set(ring), count = new Map();
    for (let hop = 0; hop < 8 && ring.length && partner < 0; hop++) {
        const next = [];
        for (const q of ring) for (let k = adjOffset[q] - 1; k < adjOffset[q + 1]; k++) {
            const r = k < adjOffset[q] ? q : adjList[k], o = owner[r];
            if (o >= 0 && o !== grower.id) { const c = (count.get(o) ?? 0) + 1; count.set(o, c); if (c > most) { most = c; partner = o; } }
            else if (o < 0 && !seen.has(r)) { seen.add(r); next.push(r); }
        }
        ring = next;
    }
    // (their rotations averaged over ~20 Myr — simulate.js: the steady spreading pole, not the step's wobble)
    const other = partner >= 0 && !plates[partner].isBackground ? plates[partner].omegaSlow ?? plates[partner].omega : [0, 0, 0], g = grower.omegaSlow ?? grower.omega;
    // (oriented by plate id, so both flanks of a ridge measure about the same pole)
    const rel = partner < 0 || grower.id < partner ? [g[0] - other[0], g[1] - other[1], g[2] - other[2]] : [other[0] - g[0], other[1] - g[1], other[2] - g[2]];
    // (in the grower's own frame: a fracture zone is fixed to the plate's floor, not to the world the ridge drifts across —
    // about a steady relative pole the coordinate of new floor then stays the same along each strip)
    const { xyz } = world.mesh, a = grower.toPlateFrame(rel[0], rel[1], rel[2], [0, 0, 0]);
    return fractureCoordinate(xyz[3 * cell], xyz[3 * cell + 1], xyz[3 * cell + 2], a);
}

/** Raster cells of `grower` that stand under a gap cell, plus a small neighbourhood of them. (Exported, like decideBirth, so a debugging script can ask why a cell was or was not born.) */
export function candidateCells(world, grower, gaps) {
    const { xyz, index, adjOffset, adjList, numCells } = world.mesh, cap = grower.capInWorld(world.mesh), mask = grower.crust.mask;
    const bins = binIndex(world.mesh), stamp = world.occupancyStamp;
    // (the cells seen, in the order first seen: marks instead of a Set — the same cells in the same order)
    const seen = seenMarks(numCells), mark = seen.stamp, marks = seen.marks, order = [];
    // (the gather looked most of these cells up moments ago: its map, while the plate has not turned since)
    const map = claimMapNow(grower, numCells), m = grower.mat;
    let ring = [];
    for (const g of gaps) {
        const x = xyz[3 * g], y = xyz[3 * g + 1], z = xyz[3 * g + 2];
        if (x * cap[0] + y * cap[1] + z * cap[2] < cap[3]) continue;
        if (!mayHaveCrustNear(grower, bins.binOf[g], stamp, bins)) continue;             // a gap nowhere near this plate: nothing could attach
        let c = map ? map[g] : -1;                                                        // (= grower.cellAt(index, x, y, z))
        if (c < 0) {
            const px = m[0] * x + m[3] * y + m[6] * z, py = m[1] * x + m[4] * y + m[7] * z, pz = m[2] * x + m[5] * y + m[8] * z;
            c = c === -1 ? index.nearest(px, py, pz) : index.walk(-2 - c, px, py, pz);
        }
        if (marks[c] !== mark) { marks[c] = mark; order.push(c); ring.push(c); }
    }
    for (let r = 0; r < REACH_RINGS; r++) {
        const next = [];
        for (const c of ring) for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const nb = adjList[k]; if (marks[nb] !== mark) { marks[nb] = mark; order.push(nb); next.push(nb); } }
        ring = next;
    }
    return order.filter(c => !mask[c]);
}
let seen = null;
/** A fresh mark on a cell-sized array (no clearing between uses). */
function seenMarks(numCells) {
    if (!seen || seen.marks.length !== numCells) seen = { marks: new Uint32Array(numCells), stamp: 0 };
    if (++seen.stamp === 0xFFFFFFFF) { seen.marks.fill(0); seen.stamp = 1; }
    return seen;
}

/**
 * May `grower` create its raster cell `cell` this step?
 * @returns {{born: boolean, why?: string, trenchParent?: number}} `why` names the rule that said no (for debugging)
 */
export function decideBirth(world, grower, cell, everyone) {
    const { mesh, config } = world, { xyz, edgeRad } = mesh;
    const p = grower.toWorld(xyz[3 * cell], xyz[3 * cell + 1], xyz[3 * cell + 2], [0, 0, 0]);
    const own = nearestCrust(grower, mesh, p);
    if (own.cell < 0) return { born: false, why: 'not attached to this plate’s crust' };

    const bins = binIndex(mesh), bin = bins.at(p[0], p[1], p[2]), stamp = world.occupancyStamp;
    let rivalDot = -2, neighbour = null, neighbourHit = null;
    for (const { plate, cap } of everyone) {
        if (plate === grower || p[0] * cap[0] + p[1] * cap[1] + p[2] * cap[2] < cap[3]) continue;
        if (!mayHaveCrustNear(plate, bin, stamp, bins)) continue;                        // nothing of that plate anywhere near
        const under = plate.cellAt(mesh.index, p[0], p[1], p[2]);
        if (plate.crust.mask[under]) return { born: false, why: 'not a gap: another plate has crust here' };   // (a)
        const hit = nearestCrust(plate, mesh, p, under);
        if (hit.cell < 0) continue;                                         // that plate has nothing nearby
        if (!plate.isBackground && hit.dot > rivalDot) rivalDot = hit.dot;
        if (!neighbourHit || hit.dot > neighbourHit.dot) { neighbourHit = hit; neighbour = plate; }
    }
    // (b) on this plate's side of the mid-line, with half a cell to spare
    if (rivalDot > -2 && Math.acos(Math.min(1, rivalDot)) - Math.acos(Math.min(1, own.dot)) < edgeRad) return { born: false, why: 'too close to the mid-line' };
    // (c) not where this plate's edge is advancing on the crust in front of it
    if (neighbour && isAdvancingOn(grower, neighbour, neighbourHit.cell, mesh, p, config.closingCmYr)) return { born: false, why: 'closing boundary' };

    // Trench rollback: crust created beside a trench cell carries the trench on, so a trailing trench stays at the
    // plate's edge. On a WING (step/wings.js) only crust beside or ahead of the trench inherits — a gap can open
    // behind a wing's tip as the plate moves on, and what fills it is ordinary ocean.
    const parentIsTrench = (grower.crust.flags[own.cell] & CrustFlag.TRENCH) && grower.crust.type[own.cell] === CrustType.OCEAN
        && (grower.crust.wingKm[own.cell] === 0 || !isBehind(grower, own.cell, cell, mesh));
    return { born: true, trenchParent: parentIsTrench ? own.cell : -1 };
}

/**
 * decideBirth for the growth step, its tests in the order that settles most candidates soonest — the same verdict: NOT_BORN,
 * or the trench cell the new crust carries on (−1: none). Of a step's candidates about two in five stand where another
 * plate has crust, and three in ten have none of their own plate's within reach: neither needs a search of the rings.
 * `marks`, `markStamp`: the grower's near-edge marks of this pass (growCrustIntoGaps), or null.
 */
const NOT_BORN = -2;
function birthOf(world, grower, cell, everyone, marks, markStamp) {
    const { mesh, config } = world, { xyz, edgeRad, index } = mesh;
    const p = grower.toWorld(xyz[3 * cell], xyz[3 * cell + 1], xyz[3 * cell + 2], scratch.p);
    // (where nearestCrust's search for the grower's own crust starts — and whether it could find any: a cell that is not
    // crust and is not within reach of the edge of the crust has none in its rings)
    const l = grower.toPlateFrame(p[0], p[1], p[2], scratch.own), base = index.nearest(l[0], l[1], l[2]);
    if (marks && marks[base] !== markStamp && !grower.crust.mask[base]) return NOT_BORN;
    // (a) another plate has crust here
    const bins = binIndex(mesh), bin = bins.at(p[0], p[1], p[2]), stamp = world.occupancyStamp, near = scratch.near, under = scratch.under;
    let count = 0;
    for (let i = 0; i < everyone.length; i++) {
        const { plate, cap } = everyone[i];
        if (plate === grower || p[0] * cap[0] + p[1] * cap[1] + p[2] * cap[2] < cap[3]) continue;
        if (!mayHaveCrustNear(plate, bin, stamp, bins)) continue;
        const u = plate.cellAt(index, p[0], p[1], p[2]);
        if (plate.crust.mask[u]) return NOT_BORN;
        near[count] = plate; under[count++] = u;
    }
    searchCrust(grower, mesh, l, base);
    const ownCell = found.cell, ownDot = found.dot;
    if (ownCell < 0) return NOT_BORN;
    let rivalDot = -2, neighbour = null, neighbourCell = -1, neighbourDot = 0;
    for (let i = 0; i < count; i++) {
        const plate = near[i];
        searchCrust(plate, mesh, plate.toPlateFrame(p[0], p[1], p[2], scratch.l), under[i]);
        if (found.cell < 0) continue;
        if (!plate.isBackground && found.dot > rivalDot) rivalDot = found.dot;
        if (!neighbour || found.dot > neighbourDot) { neighbour = plate; neighbourCell = found.cell; neighbourDot = found.dot; }
    }
    if (rivalDot > -2 && Math.acos(Math.min(1, rivalDot)) - Math.acos(Math.min(1, ownDot)) < edgeRad) return NOT_BORN;
    if (neighbour && isAdvancingOn(grower, neighbour, neighbourCell, mesh, p, config.closingCmYr)) return NOT_BORN;
    const parentIsTrench = (grower.crust.flags[ownCell] & CrustFlag.TRENCH) && grower.crust.type[ownCell] === CrustType.OCEAN
        && (grower.crust.wingKm[ownCell] === 0 || !isBehind(grower, ownCell, cell, mesh));
    return parentIsTrench ? ownCell : -1;
}

/**
 * Gap cells that are still empty need an owner for this step's world view. They are the ridge axis (no
 * plate's cell centre is safely on its own side yet) or a jitter hole at a closing boundary. Each goes
 * to the nearest plate that may grow, points at that plate's nearest REAL crust cell, and is marked
 * provisional so that views can draw it and nothing mistakes it for crust.
 */
function assignGapOwners(world, gaps) {
    const { mesh, owner, ownerCell, claimCount, provisional, provisionalLike, plates, config } = world, { xyz, index } = mesh;
    const everyone = plates.filter(p => p.alive && p.crust.count > 0), bins = binIndex(mesh), stamp = world.occupancyStamp;
    // (each plate's raster cell under a gap's centre: the gather's own lookup, kept in its map while the plate has not turned)
    const maps = everyone.map(plate => claimMapNow(plate, mesh.numCells));
    const p = [0, 0, 0], near = scratch.near, under = scratch.under, hitDot = scratch.hitDot, hitCell = scratch.hitCell;
    for (const g of gaps) {
        const x = p[0] = xyz[3 * g], y = p[1] = xyz[3 * g + 1], z = p[2] = xyz[3 * g + 2];
        const bin = bins.binOf[g];
        let best = null, bestCell = -1, bestDot = 0, real = false, count = 0;
        for (let i = 0; i < everyone.length; i++) {
            const plate = everyone[i];
            if (!mayHaveCrustNear(plate, bin, stamp, bins)) continue;
            let cell = maps[i] ? maps[i][g] : -1;                                          // (= plate.cellAt(index, x, y, z))
            if (cell < 0) {
                const m = plate.mat, px = m[0] * x + m[3] * y + m[6] * z, py = m[1] * x + m[4] * y + m[7] * z, pz = m[2] * x + m[5] * y + m[8] * z;
                cell = cell === -1 ? index.nearest(px, py, pz) : index.walk(-2 - cell, px, py, pz);
            }
            near[count] = plate; under[count++] = cell;
            if (plate.crust.mask[cell]) { best = plate; bestCell = cell; real = true; break; }     // filled this step
        }
        let foreign = null, foreignCell = -1;
        if (!best) {
            // (each plate's nearest crust found once, for both searches)
            for (let i = 0; i < count; i++) {
                const plate = near[i];
                searchCrust(plate, mesh, plate.toPlateFrame(x, y, z, scratch.l), under[i]);
                hitDot[i] = found.dot; hitCell[i] = found.cell;
                if (found.cell >= 0 && !plate.isBackground && (!best || found.dot > bestDot)) { best = plate; bestCell = found.cell; bestDot = found.dot; }
            }
            let foreignDot = 0;
            for (let i = 0; i < count; i++) {
                const plate = near[i];
                if (plate === best) continue;
                if (hitCell[i] >= 0 && (!foreign || hitDot[i] > foreignDot)) { foreign = plate; foreignCell = hitCell[i]; foreignDot = hitDot[i]; }
            }
        }
        if (!best) continue;                               // nothing within reach: stays a gap and is reported as one
        owner[g] = best.id; ownerCell[g] = bestCell; claimCount[g] = 1;
        if (real) continue;
        const closing = foreign && isAdvancingOn(best, foreign, foreignCell, mesh, p, config.closingCmYr);
        provisional[g] = closing ? Provisional.LIKE_NEIGHBOUR : Provisional.NEWBORN;
        provisionalLike[g] = bestCell;
    }
}

// ─────────────────────────────── geometry helpers ───────────────────────────────

/**
 * Is plate X advancing on plate Y's crust at world position p? True if X moves, relative to Y, faster
 * than `closingCmYr` AND Y's nearest crust lies ahead of that motion (within AHEAD_CONE of it). Where X
 * slides past Y, or backs away from it, the answer is no — so holes on a transform margin get filled.
 * (Judged from the motion rather than from the edge's normal: a one-cell normal is mostly lattice noise.)
 */
function isAdvancingOn(X, Y, foreignCell, mesh, p, closingCmYr) {
    const { xyz } = mesh;
    const ox = X.omega[0] - Y.omega[0], oy = X.omega[1] - Y.omega[1], oz = X.omega[2] - Y.omega[2];
    const vx = oy * p[2] - oz * p[1], vy = oz * p[0] - ox * p[2], vz = ox * p[1] - oy * p[0];              // ω_rel × p
    const speed = Math.hypot(vx, vy, vz);
    if (speed <= closingCmYr * CM_PER_YR_TO_RAD_PER_MYR) return false;
    const q = Y.toWorld(xyz[3 * foreignCell], xyz[3 * foreignCell + 1], xyz[3 * foreignCell + 2], [0, 0, 0]);
    const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2], distance = Math.hypot(dx, dy, dz);
    if (distance < 1e-9) return true;
    return (dx * vx + dy * vy + dz * vz) / (distance * speed) > AHEAD_CONE;
}

/** Is raster cell `cell` behind `edgeCell` — away from the side where the plate has no crust (by more than ~110°)? */
function isBehind(plate, edgeCell, cell, mesh) {
    const { xyz, adjOffset, adjList } = mesh, mask = plate.crust.mask;
    let nx = 0, ny = 0, nz = 0, open = 0;
    for (let k = adjOffset[edgeCell]; k < adjOffset[edgeCell + 1]; k++) {
        const nb = adjList[k];
        if (mask[nb]) continue;
        open++; nx += xyz[3 * nb] - xyz[3 * edgeCell]; ny += xyz[3 * nb + 1] - xyz[3 * edgeCell + 1]; nz += xyz[3 * nb + 2] - xyz[3 * edgeCell + 2];
    }
    if (!open) return false;
    const dx = xyz[3 * cell] - xyz[3 * edgeCell], dy = xyz[3 * cell + 1] - xyz[3 * edgeCell + 1], dz = xyz[3 * cell + 2] - xyz[3 * edgeCell + 2];
    return (dx * nx + dy * ny + dz * nz) / (Math.hypot(dx, dy, dz) * Math.hypot(nx, ny, nz) || 1) < -0.35;
}

/**
 * Nearest crust in the plate's raster to world position p, searching a few rings around it in the
 * plate's frame: { dot: cosine of the angular distance, cell } — cell = −1 (dot = −2) if none is near.
 * `under`: the plate's raster cell under p if the caller has it already (plate.cellAt — the same lookup).
 */
function nearestCrust(plate, mesh, p, under = -1) {
    const l = plate.toPlateFrame(p[0], p[1], p[2], scratch.l);
    searchCrust(plate, mesh, l, under >= 0 ? under : mesh.index.nearest(l[0], l[1], l[2]));
    return { dot: found.dot, cell: found.cell };
}
/** nearestCrust's search, from the raster cell `from` under the plate-frame position l: its answer left in `found`. */
function searchCrust(plate, mesh, l, from) {
    const xyz = mesh.xyz, mask = plate.crust.mask, lx = l[0], ly = l[1], lz = l[2];
    // Rings are read from a table built once per mesh (this runs millions of times per history): the same cells in
    // the same order as a ring-by-ring search from the nearest cell, so the answer — ties included — is unchanged.
    if (ringMesh !== mesh) { ringMesh = mesh; rings = ringsOf(mesh); }
    const start = rings.start, cells = rings.cells, base = from * rings.stride;
    let best = -2, bestCell = -1;
    for (let r = 0; r <= PROXIMITY_RINGS; r++) {
        for (let i = start[base + r], e = start[base + r + 1]; i < e; i++) {
            const c = cells[i];
            if (mask[c]) {
                const d = lx * xyz[3 * c] + ly * xyz[3 * c + 1] + lz * xyz[3 * c + 2];
                if (d > best) { best = d; bestCell = c; }
            }
        }
        if (bestCell >= 0 && r >= 1) break;      // one ring past the first hit guarantees the true nearest
    }
    found.dot = best; found.cell = bestCell;
}
const scratch = { l: [0, 0, 0], own: [0, 0, 0], p: [0, 0, 0], near: [], under: [], hitDot: [], hitCell: [] }, found = { dot: -2, cell: -1 };
let ringMesh = null, rings = null;

