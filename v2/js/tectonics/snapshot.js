// A Frame is a self-contained, world-frame picture of one instant: what every view, layer, stat
// panel and check script reads. Frames are what the timeline scrubs through, so nothing downstream
// ever needs to reach into plate-frame rasters. (Measurements on frames live in measure.js.)

import { CrustType, CrustFlag, VolcanicType } from './model/crust.js';
import { BoundaryKind, Provisional } from './model/world.js';
import { speedCmYrAt } from './step/kinematics.js';
import { classifyMargins } from './measure.js';
import { recentPush } from './step/far-field.js';

const LIVE_TRENCH_HOPS = 2;   // a flagged cell this close to an overriding edge counts as part of the live trench:
                              // the visible edge of a rotated raster jitters by about a cell from step to step

/**
 * @typedef {Object} Frame
 * @property {number} time                Myr
 * @property {Int16Array} owner           plate id per world cell, −1 = gap
 * @property {Uint8Array} type            CrustType (valid where owner ≥ 0)
 * @property {Float32Array} formedAt      sim time the crust formed; < 0 = pre-history
 * @property {Uint8Array} flags           CrustFlag bits
 * @property {Uint16Array} terrane        tectonic-unit id (0 = none)
 * @property {Uint8Array} boundary        BoundaryKind
 * @property {Uint8Array} overlap         0 none · 1 land over ocean · 2 land over land (collision)
 * @property {Int16Array} collider        at a collision cell: the other plate whose land is here (−1 elsewhere)
 * @property {Uint8Array} trench          0 none · 1 live trench · 2 dormant (flagged, no longer active)
 * @property {Uint8Array} provisional     Provisional.* — shown as crust, but no raster holds crust here yet
 * @property {Float32Array} slabKm        crust subducted beneath this trench cell so far
 * @property {Uint8Array} oroType         OrogenyType of the latest mountain-building event here (0 = none)
 * @property {Float32Array} oroWork       km of convergence that event has absorbed here
 * @property {Float32Array} oroStart      when it began  @property {Float32Array} oroLast  when it was last active
 * @property {Float32Array} thickKm       crustal thickening from every orogeny so far
 * @property {Uint8Array} beltU           where across its belt the cell lies: 0 at the front … 255 at the far edge (crust.beltU)
 * @property {Uint16Array} beltReach      how far that belt reached, km (0 = no geometry recorded)
 * @property {Uint8Array} beltSide        BeltSide  @property {Int8Array} beltShear  obliquity, degrees (+ dextral)
 * @property {Uint8Array} prevType        the belt this one overprinted (crust.prev*): its type, when it was last active
 * @property {Float32Array} prevLast      (prevLast), position across it (prevU, 0…255), reach (prevReach, km), side and obliquity
 * @property {Uint8Array} prevU  @property {Uint16Array} prevReach  @property {Uint8Array} prevSide  @property {Int8Array} prevShear
 * @property {Float32Array} rootKm  @property {Float32Array} upliftKm  @property {Float32Array} baseKm  @property {Float32Array} rugged  @property {Float32Array} prevRugged
 * @property {Float32Array} volcWornKm    the evolving heights (step/heights.js): root, uplift, crest heights, volcano wear
 * @property {Float32Array} riverIncKm    how deep the history's rivers have cut (step/rivers.js)
 * @property {Float32Array} riverKm2      the drainage (km², rain-weighted) the history last routed through each cell
 * @property {Int32Array} crustCells      every plate's crust cells (plate id × numCells + raster cell), plate by plate…
 * @property {Uint8Array} crustType       …and what each is (CrustType): the plates' own outlines, which the world view shows
 *                                        only in part (a world cell shows the crust cell nearest it)
 * @property {Uint8Array} crustBelt       …and its belts, 6 per cell: oroType, beltSide, beltU, prevType, prevSide, prevU (as the
 *                                        world view carries them)…
 * @property {Uint16Array} crustReach     …with 2 per cell: beltReach, prevReach
 * @property {{time:number, kind:string, text:string}[]} events   the world's event log up to this frame
 * @property {FramePlate[]} plates        per-plate summary, indexed by plate id
 * @property {{created:number, consumed:number, erodedCells:number, underthrustCells:number, recycledCells:number}} budget   cumulative, in cells (world.budget)
 * @property {{up:number[]|null, down:number[]|null, upHeat:number, share:number, landmasses:number, state:string, since:number}|null} cycle
 *                                        the supercontinent cycle (step/supercontinent.js): the mantle's upwelling and downwelling, the
 *                                        heat left at the upwelling, the largest landmass's share of the continental crust, how many
 *                                        landmasses of 1 Mkm² or more, 'assembled' | 'dispersed' and since when
 *
 * @typedef {Object} FramePlate
 * @property {number} id  @property {string} name  @property {boolean} alive  @property {boolean} isBackground
 * @property {number[]} omega  @property {number[]} quat  @property {number[]} centre   world position of its centre of area
 * @property {number} cells  @property {number} landCells  @property {number} speedCmYr  speed at `centre`
 * @property {Object|null} dynamics     force diagnostics (step/torque-balance.js), when the force model drives the world
 */

// Which raster cells some world cell shows this capture: a stamp per plate, reused from capture to capture.
const shownStamps = new WeakMap();
let captureEpoch = 0;

/**
 * A frame's per-cell arrays, for `n` cells, zeroed: every field captureFrame fills a cell at a time. (The planet file
 * reads a field an older file lacks as these zeros: that feature off — save/migrations.js.)
 */
export function frameArrays(n) {
    return {
        owner: new Int16Array(n), collider: new Int16Array(n), type: new Uint8Array(n), formedAt: new Float32Array(n), flags: new Uint8Array(n),
        terrane: new Uint16Array(n), boundary: new Uint8Array(n), overlap: new Uint8Array(n), trench: new Uint8Array(n),
        provisional: new Uint8Array(n), slabKm: new Float32Array(n), fzU: new Float32Array(n),
        oroType: new Uint8Array(n), oroWork: new Float32Array(n), oroStart: new Float32Array(n), oroLast: new Float32Array(n), thickKm: new Float32Array(n),
        beltU: new Uint8Array(n), beltReach: new Uint16Array(n), beltSide: new Uint8Array(n), beltShear: new Int8Array(n),
        prevType: new Uint8Array(n), prevLast: new Float32Array(n), prevU: new Uint8Array(n), prevReach: new Uint16Array(n), prevSide: new Uint8Array(n), prevShear: new Int8Array(n),
        rootKm: new Float32Array(n), upliftKm: new Float32Array(n), baseKm: new Float32Array(n), rugged: new Float32Array(n), prevRugged: new Float32Array(n), volcWornKm: new Float32Array(n),
        riverIncKm: new Float32Array(n), riverKm2: new Float32Array(n),
        volcType: new Uint8Array(n), volcAt: new Float32Array(n), volcKm: new Float32Array(n), volcSource: new Uint16Array(n),
        mantleHeat: new Uint8Array(n),                      // 0…255 for 0…1 (a frame need not carry it at full precision)
        margin: new Uint8Array(n),                          // what kind of coast each coastal land cell is (measure.js Margin)
        // the far field (step/far-field.js): the push felt in all (the grain), how far it came (km of path cost, to the
        // km: what the terrain reads the folds and the grain across), the push felt lately as of the frame's time (the
        // folds), and its axis — 3 per cell, × 127, in the plate's frame (as the terrain reads its points)
        farWork: new Float32Array(n), farDist: new Uint16Array(n), farFold: new Float32Array(n), farDir: new Int8Array(3 * n),
    };
}

/** @returns {Frame} */
export function captureFrame(world, reuse = null) {
    const { mesh, owner, ownerCell, claimCount, landClaims, boundaryKind, provisional, plates } = world;      // (+ world.collider)
    const n = mesh.numCells, { adjOffset, adjList } = mesh;
    const f = reuse ?? frameArrays(n);
    f.time = world.time;
    // mark every raster cell that is some world cell's nearest; the rest are hidden between world cells (see below)
    const epoch = ++captureEpoch;
    for (let w = 0; w < n; w++) {
        if (owner[w] < 0) continue;
        const p = plates[owner[w]];
        let stamp = shownStamps.get(p);
        if (!stamp || stamp.length !== n) { stamp = new Uint32Array(n); shownStamps.set(p, stamp); }
        stamp[ownerCell[w]] = epoch;
    }
    f.owner.set(owner);
    f.collider.set(world.collider);
    f.boundary.set(boundaryKind);
    f.provisional.set(provisional);
    for (let w = 0; w < n; w++) {
        f.overlap[w] = landClaims[w] > 1 ? 2 : claimCount[w] > 1 ? 1 : 0;
        f.mantleHeat[w] = Math.round(255 * (world.mantleHeat ? world.mantleHeat[w] : 0));
        f.volcType[w] = 0; f.volcAt[w] = 0; f.volcKm[w] = 0; f.volcSource[w] = 0;
        f.beltU[w] = 0; f.beltReach[w] = 0; f.beltSide[w] = 0; f.beltShear[w] = 0;
        f.prevType[w] = 0; f.prevLast[w] = 0; f.prevU[w] = 0; f.prevReach[w] = 0; f.prevSide[w] = 0; f.prevShear[w] = 0;
        f.rootKm[w] = 0; f.upliftKm[w] = 0; f.baseKm[w] = 0; f.rugged[w] = 0; f.prevRugged[w] = 0; f.volcWornKm[w] = 0; f.riverIncKm[w] = 0;
        f.riverKm2[w] = world.riverKm2 ? world.riverKm2[w] : 0;
        f.fzU[w] = 0;
        f.farWork[w] = 0; f.farDist[w] = 0; f.farFold[w] = 0; f.farDir[3 * w] = 0; f.farDir[3 * w + 1] = 0; f.farDir[3 * w + 2] = 0;
        if (owner[w] < 0) { f.type[w] = 0; f.formedAt[w] = 0; f.flags[w] = 0; f.terrane[w] = 0; f.slabKm[w] = 0; f.oroType[w] = 0; f.oroWork[w] = 0; f.oroStart[w] = 0; f.oroLast[w] = 0; f.thickKm[w] = 0; continue; }
        const crust = plates[owner[w]].crust, c = ownerCell[w];
        if (provisional[w] === Provisional.NEWBORN) {          // the ridge axis: crust forming right now
            f.type[w] = CrustType.OCEAN; f.formedAt[w] = world.time; f.flags[w] = 0; f.terrane[w] = 0; f.slabKm[w] = 0; f.oroType[w] = 0; f.oroWork[w] = 0; f.oroStart[w] = 0; f.oroLast[w] = 0; f.thickKm[w] = 0;
            continue;
        }
        f.type[w] = crust.type[c];
        f.formedAt[w] = crust.formedAt[c];
        f.fzU[w] = crust.fzU[c];
        f.flags[w] = crust.flags[c];
        f.terrane[w] = crust.terrane[c];
        f.slabKm[w] = (crust.flags[c] & CrustFlag.TRENCH) ? crust.slabKm[c] : 0;
        f.oroType[w] = crust.oroType[c]; f.oroWork[w] = crust.oroWork[c]; f.oroStart[w] = crust.oroStart[c]; f.oroLast[w] = crust.oroLast[c]; f.thickKm[w] = crust.thickKm[c];
        f.beltU[w] = Math.round(255 * Math.min(1, crust.beltU[c])); f.beltReach[w] = Math.min(65535, Math.round(crust.beltReach[c])); f.beltSide[w] = crust.beltSide[c]; f.beltShear[w] = crust.beltShear[c];
        f.prevType[w] = crust.prevType[c]; f.prevLast[w] = crust.prevLast[c]; f.prevU[w] = Math.round(255 * Math.min(1, crust.prevU[c])); f.prevReach[w] = Math.min(65535, Math.round(crust.prevReach[c]));
        f.prevSide[w] = crust.prevSide[c]; f.prevShear[w] = crust.prevShear[c];
        f.rootKm[w] = crust.rootKm[c]; f.upliftKm[w] = crust.upliftKm[c]; f.rugged[w] = crust.rugged[c]; f.prevRugged[w] = crust.prevRugged[c]; f.volcWornKm[w] = crust.volcWornKm[c];
        f.riverIncKm[w] = crust.riverIncKm[c]; f.baseKm[w] = crust.baseKm[c];
        f.farWork[w] = crust.farWork[c]; f.farDist[w] = Math.min(65535, Math.round(crust.farDist[c])); f.farFold[w] = recentPush(crust.farFold[c], crust.farAt[c], world.time, world.config.farFoldMyr);
        f.farDir[3 * w] = crust.farDx[c]; f.farDir[3 * w + 1] = crust.farDy[c]; f.farDir[3 * w + 2] = crust.farDz[c];
        f.volcType[w] = crust.volcType[c]; f.volcAt[w] = crust.volcAt[c]; f.volcKm[w] = crust.volcKm[c]; f.volcSource[w] = crust.volcSource[c];
        // A hotspot track is a THIN record — about a cell wide on the plate's own lattice — and that lattice is rotated
        // against the world's, so some of its cells are nobody's nearest and a nearest-cell gather would show the chain
        // as dashes. Such a HIDDEN track cell is shown instead by a world cell next to it whose own raster cell carries
        // nothing — so every track cell is seen, and none is shown twice over.
        if (!crust.volcType[c]) {
            const stamp = shownStamps.get(plates[owner[w]]);
            let best = -1;
            for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
                const nb = adjList[k];
                if (crust.mask[nb] && crust.volcType[nb] === VolcanicType.TRACK && stamp[nb] !== epoch && (best < 0 || crust.volcAt[nb] > crust.volcAt[best])) best = nb;
            }
            if (best >= 0) { f.volcType[w] = VolcanicType.TRACK; f.volcAt[w] = crust.volcAt[best]; f.volcKm[w] = crust.volcKm[best]; f.volcSource[w] = crust.volcSource[best]; }
        }
    }
    markTrenchState(f, mesh);
    // the live plumes, where they are in the mantle (they never move)
    f.hotspots = (world.hotspots ?? []).filter(h => h.alive).map(h => ({ id: h.id, name: h.name, xyz: h.xyz.slice(), strength: h.strength, bornAt: h.bornAt }));
    // the supercontinent cycle (step/supercontinent.js): where the mantle wells up and goes down, how gathered the land is
    const cy = world.cycle;
    f.cycle = cy ? { up: cy.up?.slice() ?? null, down: cy.down?.slice() ?? null, upHeat: cy.upHeat, gather: cy.gather, hold: cy.hold, holdKm: cy.holdKm, share: cy.share, landmasses: cy.landmasses, state: cy.state, since: cy.since,
        phase: cy.phase, formedAt: cy.formedAt, periodMyr: cy.period, breakupAt: cy.breakupAt, gatherAt: cy.gatherAt } : null;
    f.plates = plates.map(p => {
        const centre = p.toWorld(p.capCenter[0], p.capCenter[1], p.capCenter[2], [0, 0, 0]);
        return {
            id: p.id, name: p.name, alive: p.alive, isBackground: p.isBackground,
            omega: p.omega.slice(), quat: p.quat.slice(), centre, hue: p.hue,
            cells: p.stats.cells, landCells: p.stats.continentalCells,
            speedCmYr: speedCmYrAt(p.omega, centre[0], centre[1], centre[2]),
            dynamics: p.dynamics ? JSON.parse(JSON.stringify(p.dynamics)) : null,
        };
    });
    // each plate's crust itself (Phase 9, developer: steady detail): which raster cells it has and what they are. A world
    // cell shows only the crust cell nearest it, and at any moment ~15 % of a moving plate's cells are nobody's nearest;
    // the terrain measures coasts on the plates' own rasters (terrain/records.js plateCoasts). Records only.
    let crustCount = 0;
    for (const p of plates) if (p.alive) crustCount += p.crust.count;
    f.crustCells = new Int32Array(crustCount); f.crustType = new Uint8Array(crustCount);
    f.crustBelt = new Uint8Array(6 * crustCount); f.crustReach = new Uint16Array(2 * crustCount);
    let ci = 0;
    for (const p of plates) {
        if (!p.alive) continue;
        const k = p.crust;
        for (let c = 0; c < n; c++) {
            if (!k.mask[c] || ci >= crustCount) continue;
            f.crustCells[ci] = p.id * n + c; f.crustType[ci] = k.type[c];
            // (belts as the world view carries them: the position across 0…255, the reach in whole km)
            const B = 6 * ci;
            f.crustBelt[B] = k.oroType[c]; f.crustBelt[B + 1] = k.beltSide[c]; f.crustBelt[B + 2] = Math.round(255 * Math.min(1, k.beltU[c]));
            f.crustBelt[B + 3] = k.prevType[c]; f.crustBelt[B + 4] = k.prevSide[c]; f.crustBelt[B + 5] = Math.round(255 * Math.min(1, k.prevU[c]));
            f.crustReach[2 * ci] = Math.min(65535, Math.round(k.beltReach[c])); f.crustReach[2 * ci + 1] = Math.min(65535, Math.round(k.prevReach[c]));
            ci++;
        }
    }
    if (ci < crustCount) { f.crustCells = f.crustCells.slice(0, ci); f.crustType = f.crustType.slice(0, ci); f.crustBelt = f.crustBelt.slice(0, 6 * ci); f.crustReach = f.crustReach.slice(0, 2 * ci); }
    f.margin.set(classifyMargins(f, mesh, world.config));      // (needs the plates’ motion, so last)
    f.budget = { ...world.budget };
    f.events = world.events.slice();
    return f;
}

// A flagged cell is "live" if it is an overriding edge now, or within a couple of hops of one; otherwise dormant.
function markTrenchState(f, mesh) {
    const { adjOffset, adjList, numCells } = mesh;
    let nearLive = new Uint8Array(numCells);
    for (let w = 0; w < numCells; w++) if (f.boundary[w] === BoundaryKind.OVERRIDING) nearLive[w] = 1;
    for (let hop = 0; hop < LIVE_TRENCH_HOPS; hop++) {
        const grown = nearLive.slice();
        for (let w = 0; w < numCells; w++) if (nearLive[w]) for (let k = adjOffset[w]; k < adjOffset[w + 1]; k++) grown[adjList[k]] = 1;
        nearLive = grown;
    }
    for (let w = 0; w < numCells; w++) f.trench[w] = f.owner[w] < 0 || !(f.flags[w] & CrustFlag.TRENCH) ? 0 : nearLive[w] ? 1 : 2;
}
