// Mountain-building records. Convergence absorbed at a plate's edge is recorded as a BELT that
// reaches inland, not just at the cells in contact: the belt's width depends on the kind of
// orogeny (WBP's table: Andean a few hundred km, a continental collision a plateau of 1000+ km on
// the upper plate and a narrow foreland on the lower one), it enters only a craton's rim — as a low,
// thin-skinned fold-thrust belt over the shield's edge (cratons are rigid: deformation piles up
// against them and goes around; Phase 10) — and it travels further along old
// sutures and rift margins (the Tian Shan and Altai were rejuvenated 1000+ km behind the
// Himalayan front, along old weak lines). Records only — terrain synthesis interprets them.

import { CrustType, CrustFlag, OrogenyType, BeltSide } from '../model/crust.js';
import { cellDistanceKm } from '../../core/sphere-geom.js';
import { buildHeights } from './heights.js';

/**
 * How far inland a belt of this kind reaches, given the convergence it has absorbed so far (km, i.e.
 * rate × time) and the rate it is being absorbed at now (cm/yr). Wider the longer and the faster.
 * @param {'andean'|'himalayan'|'foreland'|'ural'} kind
 */
export function beltWidthKm(kind, workKm, rateCmYr, config) {
    const b = config.belts[kind];
    const speed = Math.min(config.beltSpeedFactorMax, Math.max(config.beltSpeedFactorMin, (Math.max(0, rateCmYr) / config.beltSpeedRefCmYr) ** config.beltSpeedExponent));
    return Math.min(b.maxKm, b.baseKm + b.perKm * workKm) * speed;
}

/**
 * How a front's geometry scales its belt (× on the width): a head-on front deforms deep inland, an oblique one
 * takes much of the motion up as strike-slip along the margin and stays narrow (the obliquity is the angle
 * between the relative motion and the front's normal); and under a young slab — the ridge close offshore — the
 * warm, buoyant slab couples to the plate above over a wider zone than an old, steep one does.
 * @param {number} headOn   cos of the obliquity: closing ÷ relative speed (1 = head-on)
 * @param {number} [slabAgeMyr]   age of the slab going down (subduction fronts only)
 */
export function beltShape(headOn, slabAgeMyr, config) {
    const h = Math.min(1, Math.max(0, headOn));
    let k = config.beltObliqueMin + (1 - config.beltObliqueMin) * h * h;
    if (slabAgeMyr !== undefined) {
        const youth = 1 + config.beltYoungSlabBoost * (1 - slabAgeMyr / config.beltYoungSlabRefMyr);
        k *= Math.min(1 + config.beltYoungSlabBoost, Math.max(config.beltOldSlabMin, youth));
    }
    return k;
}

/**
 * Spread `workKm` of convergence from the given source cells of one plate's raster into a belt.
 * Every land cell within the belt's reach of the front (measured along the raster; weak cells at
 * `weakCellCost`; a craton only its rim, cratonRimKm deep, at cratonRimCost — there the belt is thin-skinned:
 * cratonRimShare of its uplift and crests, no thickening) gets the record, with the work tapering from the front to the
 * belt's far edge. Each source may carry its own reach and work (`widths`, `works`, parallel to
 * `sources`): a head-on stretch of a front then reaches further inland than an oblique one beside it, and
 * each cell takes the reach of the front cell it was reached from. Thickening spreads with the same reach
 * but a smooth profile — flat behind the front, dropping at the belt's edge — so it forms a plateau rather
 * than a spike at the front cell. A front on the sea (a trench on the ocean apron) first crosses the sea to the
 * nearest coast, which then counts as the front — outward only, and no further than the apron is wide,
 * so a belt never runs along the sea to reach land elsewhere.
 * Each cell the belt shapes also records the belt's GEOMETRY (crust.beltU…beltShear): its share of the reach from the
 * front, the reach, the side of a collision and the obliquity — what the ridges of Phase 8 are laid out from. A cell
 * keeps the geometry of the belt its orogeny record belongs to: a passing belt of another kind that does not take
 * over the record leaves the geometry alone, and of two belts of the same kind in one step the nearer front wins.
 * When a belt DOES take a cell over (a new event, or an escalation such as Andean → Himalayan), the old belt's record
 * moves to crust.prev*, so the terrain can show the old grain under the new.
 *
 * @param {import('../model/plate.js').Plate} plate
 * @param {number[]} sources        raster cells at the front (each with `workKm` of convergence this step)
 * @param {{type: number, widthKm: number, workKm: number, time: number, widths?: number[], works?: number[],
 *          side?: number, shear?: number, shears?: number[], keepShear?: boolean, noRoot?: boolean}} belt   side: BeltSide (default NONE);
 *          shear / shears: the obliquity in degrees (+ dextral), for the whole front or per source (default 0, head-on);
 *          keepShear: leave the obliquity the cells already carry (a suture redrawing the belts its collision built)
 *          noRoot: the belt raises its uplift and crests but does not thicken the crust (an intraplate range: step/far-field.js)
 * @param {(cell: number) => boolean} [allow]   restrict the belt to these cells (e.g. one side of a seam)
 */
export function spreadBelt(plate, mesh, sources, belt, config, allow = null) {
    if (!sources.length) return;
    const { adjOffset, adjList, xyz, edgeKm } = mesh, crust = plate.crust;
    const { mask, type, flags } = crust;
    const widthOf = i => belt.widths?.[i] ?? belt.widthKm, workOf = i => belt.works?.[i] ?? belt.workKm;
    // u: the share of its reach a cell lies from the front (0 at the front, 1 at the belt's edge); src: which front cell reached it
    // (scratch arrays shared across calls, reset below for exactly the cells this call touched)
    if (!scratch.u || scratch.u.length !== mask.length) scratch.u = new Float32Array(mask.length).fill(Infinity), scratch.src = new Int32Array(mask.length).fill(-1), scratch.seaKm = new Float32Array(mask.length), scratch.rimKm = new Float32Array(mask.length);
    const { u, src, seaKm, rimKm } = scratch;
    const rimMax = config.cratonRimKm ?? 0;
    const seaLimit = config.apronKm * 1.5 + edgeKm;
    const queue = [];                                   // Dijkstra would be exact; costs are ≥ 0 and few-valued, so a
    sources.forEach((c, i) => {                         // relaxing breadth-first pass is close enough for a record
        if (widthOf(i) <= 0 || workOf(i) <= 0) return;
        if (src[c] < 0) queue.push(c);
        else if (widthOf(i) <= widthOf(src[c])) return;  // (a front cell listed twice keeps its widest reach)
        u[c] = 0; src[c] = i;
    });
    for (let head = 0; head < queue.length; head++) {
        const c = queue[head], here = u[c], atSea = type[c] === CrustType.OCEAN, reach = widthOf(src[c]);
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
            const nb = adjList[k];
            if (!mask[nb] || (allow && !allow(nb))) continue;
            if (type[nb] === CrustType.OCEAN) {                                  // sea: only outward from a front at sea, and not far
                if (!atSea) continue;
                const sea = seaKm[c] + cellDistanceKm(xyz, c, nb);
                if (sea > seaLimit || u[nb] < Infinity) continue;
                u[nb] = 0; src[nb] = src[c]; seaKm[nb] = sea; queue.push(nb);
                continue;
            }
            let hop = cellDistanceKm(xyz, c, nb) * ((flags[nb] & (CrustFlag.SUTURE | CrustFlag.FAILED_RIFT | CrustFlag.RIFT_MARGIN)) ? config.weakCellCost : 1);
            // a craton: only its rim — how far into it, from where the path met its edge (halfway to the first cell)
            let rim = 0;
            if (type[nb] === CrustType.CRATON) {
                const d = cellDistanceKm(xyz, c, nb);
                rim = type[c] === CrustType.CRATON ? rimKm[c] + d : 0.5 * d;
                if (rim > rimMax) continue;
                hop *= config.cratonRimCost;
            }
            const next = atSea ? 0 : here + hop / reach;                         // the coast is the front for a trench at sea
            if (next >= u[nb] || next > 1) continue;
            u[nb] = next; src[nb] = src[c]; rimKm[nb] = rim;
            queue.push(nb);
        }
    }
    // the cells reached, in index order (every one was queued at least once)
    const reached = Int32Array.from(new Set(queue)).sort();
    for (const c of reached) {
        if (u[c] === Infinity || type[c] === CrustType.OCEAN) continue;
        // (a craton's rim, a front cell on a craton included: thin-skinned — the cover folds and thrusts, the shield does
        // not thicken; with no rim, a craton takes no record)
        const rimCell = type[c] === CrustType.CRATON;
        if (rimCell && !(rimMax > 0)) continue;
        const workKm = workOf(src[c]) * (rimCell ? config.cratonRimShare : 1);
        // the record: the full amount at the front itself; across the belt a share of it, tapering to nothing at the far edge
        const work = u[c] === 0 ? workKm : workKm * config.beltWorkShare * (1 - u[c]);
        const wasType = crust.oroType[c], wasStart = crust.oroStart[c], wasLast = crust.oroLast[c];
        crust.recordOrogeny(c, belt.type, work, belt.time, config.orogenyQuietMyr);
        // another orogeny takes the cell over (a new event, or an escalation): its belt becomes the overprinted one
        if (wasType !== OrogenyType.NONE && crust.beltReach[c] > 0 && (crust.oroType[c] !== wasType || crust.oroStart[c] !== wasStart)) {
            crust.prevType[c] = wasType; crust.prevLast[c] = wasLast; crust.prevU[c] = crust.beltU[c]; crust.prevReach[c] = crust.beltReach[c];
            crust.prevSide[c] = crust.beltSide[c]; crust.prevShear[c] = crust.beltShear[c];
            crust.prevRugged[c] = crust.rugged[c]; crust.rugged[c] = 0;             // (its crests stand on, under the new belt's)
            crust.beltReach[c] = 0;                                                   // (the new event's geometry is written just below)
        }
        if (crust.oroType[c] === belt.type && (crust.beltReach[c] === 0 || crust.beltAt[c] < belt.time || u[c] < crust.beltU[c])) {
            crust.beltU[c] = u[c]; crust.beltReach[c] = widthOf(src[c]); crust.beltAt[c] = belt.time; crust.beltSide[c] = belt.side ?? BeltSide.NONE;
            if (!belt.keepShear) crust.beltShear[c] = Math.max(-90, Math.min(90, Math.round(belt.shears?.[src[c]] ?? belt.shear ?? 0)));
        }
        // the thickening: the same share everywhere, with a smooth plateau profile
        const thickened = rimCell || belt.noRoot ? 0 : workKm * config.beltWorkShare * (1 - u[c] ** 2) * config.thickeningPerWorkKm;
        crust.thickKm[c] += thickened;
        // heights (records only): the root thickens with the crust; uplift and crests rise toward the belt's shape — the
        // whole belt at the pace of its front's convergence
        buildHeights(crust, c, belt.type, belt.side ?? BeltSide.NONE, u[c], widthOf(src[c]), workKm, thickened, config, rimCell ? config.cratonRimShare : 1);
    }
    for (const c of reached) { u[c] = Infinity; src[c] = -1; seaKm[c] = 0; rimKm[c] = 0; }
}

export { OrogenyType, BeltSide };
const scratch = { u: null, src: null, seaKm: null, rimKm: null };

/**
 * The obliquity (degrees) of a convergence: the angle between the relative velocity `v` of one side against the other
 * and the normal `n` pointing from that side toward the other, at unit position `p`. Positive = dextral (standing on
 * either side facing the other, the far side moves to the right), negative = sinistral; 0 = head-on.
 */
export function obliquityDeg(v, n, p, closing) {
    const along = v[0] * (p[1] * n[2] - p[2] * n[1]) + v[1] * (p[2] * n[0] - p[0] * n[2]) + v[2] * (p[0] * n[1] - p[1] * n[0]);
    return Math.atan2(along, Math.max(1e-12, closing)) * 180 / Math.PI;     // (p × n points to the left, facing along n)
}

