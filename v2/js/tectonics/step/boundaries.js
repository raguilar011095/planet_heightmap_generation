// Boundary classification on the resolved world view. For every cell that touches another
// plate, the relative plate velocity across that contact decides: ridge (opening), trench
// (closing, with a subducting and an overriding side), transform (sliding) or collision.
// Also maintains the persistent TRENCH flag on the overriding plate's crust and logs how much
// crust each trench cell has consumed — records only; interpretation comes later.

import { CrustType, CrustFlag } from '../model/crust.js';
import { BoundaryKind, EventKind } from '../model/world.js';
import { CM_PER_YR_TO_RAD_PER_MYR, CM_PER_YR_TO_KM_PER_MYR } from '../config.js';
import { PLANET_RADIUS_KM } from '../../core/sim-mesh.js';
import { overrides } from './polarity.js';
import { contactAt } from './contact.js';
import { spreadBelt, beltWidthKm, beltShape, obliquityDeg, OrogenyType } from './orogeny.js';
import { feedFarField } from './far-field.js';
import { reachesWithin } from '../../core/mesh-bfs.js';

const Motion = Object.freeze({ LOCKED: 0, OPENING: 1, CLOSING: 2, SLIDING: 3 });

/** What the two sides of a contact are doing, from the normal (+ = closing) and shear parts of their relative velocity. */
function classifyMotion(closing, shear, activeSpeed, obliqueLimit) {
    const normalDominates = Math.abs(closing) > obliqueLimit * shear;
    if (closing < -activeSpeed && normalDominates) return Motion.OPENING;
    if (closing > activeSpeed && normalDominates) return Motion.CLOSING;
    return shear > activeSpeed ? Motion.SLIDING : Motion.LOCKED;
}

/** @param {number} dt  length of the step just taken (Myr) — how long the current closing rates have applied */
export function classifyBoundaries(world, dt) {
    const { mesh, owner, ownerCell, plates, boundaryKind, convergence, landClaims, provisional, config } = world;
    const { xyz, numCells } = mesh;
    const activeSpeed = config.boundaryActiveCmYr * CM_PER_YR_TO_RAD_PER_MYR;
    const normal = [0, 0, 0, 0];
    boundaryKind.fill(BoundaryKind.NONE);
    convergence.fill(0);
    const fed = new Map();                         // plate → { cells, kms, headOn, age }: trench cells that consumed crust this step
    const slid = new Map();                        // plate → { cells, kms, headOn, shear }: land sliding past a neighbour while pressed against it
    const oceanContacts = [], oceanOverrider = world.oceanOverrider;

    for (let w = 0; w < numCells; w++) {
        const a = owner[w];
        if (a < 0) continue;
        if (landClaims[w] > 1) { boundaryKind[w] = BoundaryKind.COLLISION; continue; }
        const A = plates[a], cellA = ownerCell[w], real = !provisional[w];
        const otherW = contactAt(world, w, normal);
        if (otherW < 0) {                              // interior cell
            // A trench flag only means something on ocean crust while that crust is a plate edge;
            // on land it stays as the record of a former active margin.
            if (real && A.crust.type[cellA] === CrustType.OCEAN) A.crust.flags[cellA] &= ~CrustFlag.TRENCH;
            continue;
        }
        const B = plates[owner[otherW]], x = xyz[3 * w], y = xyz[3 * w + 1], z = xyz[3 * w + 2];
        const ox = A.omega[0] - B.omega[0], oy = A.omega[1] - B.omega[1], oz = A.omega[2] - B.omega[2];
        const vx = oy * z - oz * y, vy = oz * x - ox * z, vz = ox * y - oy * x;                     // A relative to B, at w
        const closing = vx * normal[0] + vy * normal[1] + vz * normal[2];                          // + = A advancing on B
        const shear = Math.hypot(vx - closing * normal[0], vy - closing * normal[1], vz - closing * normal[2]);
        convergence[w] = closing / CM_PER_YR_TO_RAD_PER_MYR;

        const motion = classifyMotion(closing, shear, activeSpeed, config.obliqueLimit);
        if (motion === Motion.OPENING) boundaryKind[w] = BoundaryKind.RIDGE;
        else if (motion === Motion.SLIDING) {
            boundaryKind[w] = BoundaryKind.TRANSFORM;
            // TRANSPRESSION: land sliding past its neighbour while also pressed against it (the Southern Alps, the
            // Transverse Ranges) builds a narrow ridge along the fault — narrow because most of the motion is strike-slip
            if (real && closing > 0 && A.crust.type[cellA] !== CrustType.OCEAN && A.crust.type[cellA] !== CrustType.CRATON) {
                const s = slid.get(A) ?? slid.set(A, { cells: [], kms: [], headOn: [], shear: [] }).get(A);
                s.cells.push(cellA); s.kms.push(closing * dt * PLANET_RADIUS_KM); s.headOn.push(closing / Math.hypot(closing, shear));
                s.shear.push(obliquityDeg([vx, vy, vz], normal, [x, y, z], closing));
            }
        }
        else if (motion === Motion.CLOSING) {
            const aOverrides = overrides(A, cellA, B, ownerCell[otherW], oceanOverrider[w]);
            if (A.crust.type[cellA] === CrustType.OCEAN && B.crust.type[ownerCell[otherW]] === CrustType.OCEAN) {
                // remember it for the vote below: which way this one cell leans, on the physical rules alone
                const lower = A.id < B.id ? A : B, upper = A.id < B.id ? B : A;
                const lowerCell = A.id < B.id ? cellA : ownerCell[otherW], upperCell = A.id < B.id ? ownerCell[otherW] : cellA;
                const trenched = (A.crust.flags[cellA] & CrustFlag.TRENCH) || (B.crust.flags[ownerCell[otherW]] & CrustFlag.TRENCH);
                oceanContacts.push({ w, key: `${lower.id}:${upper.id}`, lowerId: lower.id, upperId: upper.id,
                    prefersLower: overrides(lower, lowerCell, upper, upperCell) === true, weight: trenched ? config.segmentTrenchWeight : 1 });
            }
            boundaryKind[w] = aOverrides === null ? BoundaryKind.COLLISION : aOverrides ? BoundaryKind.OVERRIDING : BoundaryKind.SUBDUCTING;
            // an ocean trench cell that is itself going down (its polarity was reversed by land arriving on the other side) loses its trench
            if (aOverrides === false && real && A.crust.type[cellA] === CrustType.OCEAN && B.crust.type[ownerCell[otherW]] !== CrustType.OCEAN) A.crust.flags[cellA] &= ~CrustFlag.TRENCH;
            if (aOverrides && real) {
                const km = closing * dt * PLANET_RADIUS_KM;
                if (feedTrench(world, w, A.crust, cellA, km)) {
                    const f = fed.get(A) ?? fed.set(A, { cells: [], kms: [], headOn: [], shear: [], age: [], km: 0, flat: 0 }).get(A);
                    const slabAge = world.time - B.crust.formedAt[ownerCell[otherW]];
                    f.cells.push(cellA); f.kms.push(km); f.headOn.push(closing / Math.hypot(closing, shear)); f.age.push(slabAge); f.km += km;
                    f.shear.push(obliquityDeg([vx, vy, vz], normal, [x, y, z], closing));
                    // FLAT SLAB: a young, warm, buoyant slab under a plate that drives at the trench goes in shallow
                    // (the Laramide, the Andes of Peru today): judged by the slab's age and by how fast the overriding
                    // plate itself — not the pair — advances on the trench
                    const advance = ((A.omega[1] * z - A.omega[2] * y) * normal[0] + (A.omega[2] * x - A.omega[0] * z) * normal[1] + (A.omega[0] * y - A.omega[1] * x) * normal[2]) / CM_PER_YR_TO_RAD_PER_MYR;
                    if (slabAge < config.flatSlabMaxAgeMyr && advance > config.flatSlabAdvanceCmYr) f.flat++;
                }
            }
        }
    }
    if (config.segmentPolarity) voteSegments(world, oceanContacts); else world.oceanOverrider.fill(-1);

    // Andean belts: the crust that went down builds mountains inland of every trench that fed this step. Each
    // stretch of the front reaches its own way inland: further the more slab it has swallowed so far (rate × time —
    // a young margin starts narrow), the faster it closes now, the more head-on the plates meet across it, and the
    // younger the slab (the ridge close offshore); an oblique stretch stays narrow.
    for (const [plate, f] of fed) {
        // a plate whose trenches paused for longer than an orogeny's quiet gap starts afresh: its slab is no longer flat
        if (world.time - plate.lastFedAt > config.orogenyQuietMyr) { plate.flatSlab = false; plate.flatSlabKm = 0; }
        plate.lastFedAt = world.time;
        const keep = f.cells.map((c, i) => i).filter(i => plate.crust.type[f.cells[i]] !== CrustType.OCEAN || nearLand(plate, mesh, f.cells[i], config));
        const andean = keep.map(i => f.cells[i]);
        if (!andean.length || dt <= 0) { if (!andean.length) plate.flatSlabKm = 0; continue; }
        // a flat slab (most of this plate's feeding trench): the belt is Laramide and reaches far inland, and there
        // is no volcanic arc above it — the slab never gets deep enough under the coast to melt (the magmatic gap)
        const share = f.flat / f.cells.length, flat = plate.flatSlab ? share > config.flatSlabOffShare : share > config.flatSlabOnShare;   // (hysteresis)
        if (flat !== plate.flatSlab) {
            plate.flatSlab = flat;
            world.log(flat ? EventKind.SLAB_FLAT : EventKind.SLAB_STEEP, flat ? `the slab going down beneath ${plate.name} is young and it drives at it: the slab flattens, deformation reaches far inland (a Laramide belt) and the arc volcanoes fall silent`
                : `the slab beneath ${plate.name} steepens again: the belt narrows to an Andean one`, { plate: plate.id });
        }
        // a flat slab creeps inland under the plate as it goes down, and the deformation above it with it: the Laramide
        // belt starts where the Andean one was and migrates inland with the length of slab gone down flat
        plate.flatSlabKm = flat ? plate.flatSlabKm + f.km / f.cells.length : 0;
        const widths = keep.map(i => {
            const c = f.cells[i], rate = f.kms[i] / dt / CM_PER_YR_TO_KM_PER_MYR, shape = beltShape(f.headOn[i], f.age[i], config);   
            const steep = beltWidthKm('andean', plate.crust.slabKm[c] * config.andeanWorkShare, rate, config);
            if (!flat) return Math.min(cap(config, 'andean'), steep * shape);
            return Math.min(cap(config, 'laramide'), Math.max(steep, beltWidthKm('laramide', plate.flatSlabKm, rate, config)) * shape);
        });
        const works = keep.map(i => f.kms[i] * config.andeanWorkShare * beltShape(f.headOn[i], undefined, config)), shears = keep.map(i => f.shear[i]);
        const belt = { type: flat ? OrogenyType.LARAMIDE : OrogenyType.ANDEAN, time: world.time };
        const pick = (arr, test) => arr.filter((_, j) => test(andean[j]));
        const isArc = c => plate.crust.type[c] === CrustType.ARC, notArc = c => !isArc(c);
        if (andean.some(notArc)) spreadBelt(plate, mesh, andean.filter(notArc), { ...belt, widths: pick(widths, notArc), works: pick(works, notArc), shears: pick(shears, notArc) }, config);
        if (andean.some(isArc) && !flat) spreadBelt(plate, mesh, andean.filter(isArc), { ...belt, type: OrogenyType.ARC, widths: pick(widths, isArc).map(v => Math.min(v, config.arcBeltMaxKm)), works: pick(works, isArc), shears: pick(shears, isArc) }, config);   // an arc is a narrow line
        // the push a strongly coupled coast sends far inland (step/far-field.js; records only): a flat slab grinds on the plate
        // far inland at any rate; a steep one pushes only when it converges fast (× (rate ÷ farAndeanRateCmYr)², up to 1)
        const pushes = keep.map((i, j) => works[j] * (flat ? config.farFlatShare
            : config.farAndeanShare * Math.min(1, (f.kms[i] / dt / CM_PER_YR_TO_KM_PER_MYR / config.farAndeanRateCmYr) ** 2)));
        feedFarField(world, plate, `s${plate.id}`, andean, pushes, andean.length * mesh.edgeKm * 0.87, 1);
    }

    // Transpression belts: narrow, and wider the longer the fault has been pressed together (the front's own record).
    for (const [plate, s] of slid) {
        if (dt <= 0) continue;
        const widths = s.cells.map((c, i) => Math.min(cap(config, 'transpression'), beltWidthKm('transpression', plate.crust.oroWork[c], s.kms[i] / dt / CM_PER_YR_TO_KM_PER_MYR, config)));
        spreadBelt(plate, mesh, s.cells, { type: OrogenyType.TRANSPRESSION, time: world.time, widths, works: s.kms, shears: s.shear }, config);
    }
}

/** The widest a belt of this kind can reach: its cap at the fastest convergence. */
function cap(config, kind) { return config.belts[kind].maxKm * config.beltSpeedFactorMax; }


/**
 * One polarity per stretch of ocean-on-ocean boundary. The contact cells of each pair of plates are
 * split into connected segments, each segment votes on the physical rules (an established trench
 * counts several times over), and the winner is written back for every cell of that segment — so next
 * step the whole line goes one way instead of the older-sinks rule and the trench rule interleaving
 * cell by cell, which is what left ocean-ocean fronts ragged (Phase 5b limitation).
 */
function voteSegments(world, contacts) {
    const { adjOffset, adjList } = world.mesh, overrider = world.oceanOverrider;
    overrider.fill(-1);
    if (!contacts.length) return;
    const byPair = new Map();
    for (const c of contacts) (byPair.get(c.key) ?? byPair.set(c.key, []).get(c.key)).push(c);
    for (const group of byPair.values()) {
        const at = new Map(group.map(c => [c.w, c]));
        const seen = new Set();
        for (const start of group) {
            if (seen.has(start.w)) continue;
            const run = [start]; seen.add(start.w);
            for (let i = 0; i < run.length; i++) for (let k = adjOffset[run[i].w]; k < adjOffset[run[i].w + 1]; k++) {
                const nb = at.get(adjList[k]);
                if (nb && !seen.has(nb.w)) { seen.add(nb.w); run.push(nb); }
            }
            let score = 0;
            for (const c of run) score += c.prefersLower ? c.weight : -c.weight;
            const winner = score === 0 ? (run[0].prefersLower ? run[0].lowerId : run[0].upperId) : score > 0 ? run[0].lowerId : run[0].upperId;
            for (const c of run) overrider[c.w] = winner;
        }
    }
}

// An ocean trench cell counts as a continental margin if land — arc crust included — is within the apron's reach of it.
function nearLand(plate, mesh, cell, config) {
    const { mask, type } = plate.crust;
    const hops = Math.round((config.apronKm + 2 * mesh.edgeKm) / mesh.edgeKm);    // the apron and two cells beyond it (4 cells at 40K)
    return reachesWithin(mesh, cell, hops, c => mask[c] === 1, c => type[c] !== CrustType.OCEAN);
}

// The overriding edge of a closing contact: establish the trench here if crust has really gone down —
// at this cell or right next door — and lengthen its slab. Kinematics alone is not enough to establish
// one: cell-scale jitter at ridge offsets looks like closing for a step. @returns whether the slab grew
function feedTrench(world, w, crust, cell, subductedKm) {
    const { consumedAt, mesh } = world, { adjOffset, adjList } = mesh;
    if (!(crust.flags[cell] & CrustFlag.TRENCH)) {
        let fed = consumedAt[w];
        for (let k = adjOffset[w]; !fed && k < adjOffset[w + 1]; k++) fed = consumedAt[adjList[k]];
        if (!fed) return false;
        crust.flags[cell] |= CrustFlag.TRENCH;
    }
    crust.recordSubduction(cell, subductedKm);
    return subductedKm > 0;
}
