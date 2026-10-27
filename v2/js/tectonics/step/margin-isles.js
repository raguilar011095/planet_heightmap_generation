// Fore-arc islands on continental margins. Above an Andean or Laramide trench, mountains do not only rise on the
// coast: the fore-arc between the coast and the trench is scraped up and pushed above the sea too — first as
// islands off the coast (Chiloé, Vancouver Island, the Channel Islands), which grow and in time merge with the
// mainland, until the land reaches almost to the trench. Each island is born at random along a mature, active
// trench, grows outward at a steady rate, and the coast itself creeps seaward more slowly (the accretionary
// wedge); an island that touches the mainland becomes part of it — continental crust, its own terrane.
// A strip of sea, marginIsleGapKm wide, is always left in front of the trench: the gap closes almost, never quite.
// Rates are per area and per km, not per cell: the same margin looks the same at every resolution.
//
// That is an ACCRETIONARY margin. About half of Earth's active margins are EROSIVE instead (Phase 7c): the trench
// scrapes the base of the fore-arc away and the coast retreats — the Andes have lost ~250 km of coast since the
// Jurassic. Which a stretch of margin is comes from a slowly varying field fixed in the overriding plate's own frame
// (patches ~marginErosionPatchKm across that keep their character as the plate moves), tipped toward erosive where
// convergence is fast; marginErosiveShare of margins are erosive. An erosive margin raises no islands, and its coast
// — never a craton — turns to fore-arc sea at marginErosionKmPerMyr, until the coast lies marginErosionMaxGapKm from
// its trench. Trench cells carry CrustFlag.EROSIVE so frames can show which margins are which.

import { CrustType, CrustFlag } from '../model/crust.js';
import { BoundaryKind, EventKind } from '../model/world.js';
import { hopsFrom } from '../../core/mesh-bfs.js';
import { SimplexNoise } from '../../../../js/simplex-noise.js';
import { PLANET_RADIUS_KM } from '../../core/sim-mesh.js';

/** @returns {number} cells raised or merged this step */
export function growMarginIsles(world, dt) {
    const { mesh, plates, config, time, boundaryKind, rngMarginIsle: rng } = world;
    const { adjOffset, adjList, xyz, index, edgeKm, cellAreaKm2, numCells } = mesh;
    if (dt <= 0 || (config.marginIsleRatePerMyr <= 0 && config.marginIsleGrowKmPerMyr <= 0 && config.marginErosionKmPerMyr <= 0)) return 0;
    const erosiveAt = erosionField(world), pErode = Math.min(1, config.marginErosionKmPerMyr * dt / edgeKm);
    const erodeHops = Math.max(1, Math.round(config.marginErosionMaxGapKm / edgeKm));
    const reachHops = Math.max(1, Math.round(config.marginIsleReachKm / edgeKm)), gapHops = Math.max(1, Math.round(config.marginIsleGapKm / edgeKm));
    const pBorn = config.marginIsleRatePerMyr * dt * cellAreaKm2 / (1000 * 0.5 * config.marginIsleReachKm);     // per km² of fore-arc: births per 1000 km of margin
    const pGrow = Math.min(1, config.marginIsleGrowKmPerMyr * dt / edgeKm), pCoast = pGrow * config.marginIsleCoastShare;
    const P = [0, 0, 0];
    let changed = 0;
    for (const plate of plates) {
        if (!plate.alive || plate.isBackground || plate.crust.count === 0) continue;
        const crust = plate.crust, { mask, type, flags, slabKm } = crust;
        const isLand = c => type[c] === CrustType.CONTINENT || type[c] === CrustType.CRATON;
        let anyTrench = false;                                   // (no trench cell at all: nothing below applies — skip the searches)
        for (let c = 0; c < numCells && !anyTrench; c++) if (mask[c] && type[c] === CrustType.OCEAN && (flags[c] & CrustFlag.TRENCH)) anyTrench = true;
        if (!anyTrench) continue;
        // the trench cells of a mature, active continental margin
        const onPlate = c => mask[c] === 1, landD = hopsFrom(mesh, cellsWhere(numCells, c => mask[c] && isLand(c)), onPlate, reachHops + 1).dist;
        const trench = cellsWhere(numCells, c => {
            if (!mask[c] || type[c] !== CrustType.OCEAN || !(flags[c] & CrustFlag.TRENCH) || landD[c] < 0) return false;
            let slab = slabKm[c];
            for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const nb = adjList[k]; if (mask[nb] && (flags[nb] & CrustFlag.TRENCH)) slab = Math.max(slab, slabKm[nb]); }
            if (slab < config.marginIsleSlabKm) return false;
            plate.toWorld(xyz[3 * c], xyz[3 * c + 1], xyz[3 * c + 2], P);
            return boundaryKind[index.nearest(P[0], P[1], P[2])] === BoundaryKind.OVERRIDING;
        });
        if (!trench.length) continue;
        // erosive or accretionary, trench cell by trench cell (the flag is what frames show)
        for (const c of trench) {
            plate.toWorld(xyz[3 * c], xyz[3 * c + 1], xyz[3 * c + 2], P);
            const rate = Math.max(0, world.convergence[index.nearest(P[0], P[1], P[2])]);
            if (erosiveAt(c, rate)) flags[c] |= CrustFlag.EROSIVE; else flags[c] &= ~CrustFlag.EROSIVE;
        }
        const { dist: trenchD, source: nearestTrench } = hopsFrom(mesh, trench, onPlate, Math.max(reachHops, erodeHops) + 1);
        const erosive = c => (flags[nearestTrench[c]] & CrustFlag.EROSIVE) !== 0;
        // an erosive margin eats its coast (never a craton), back to marginErosionMaxGapKm from its trench
        if (pErode > 0) {
            const coastCells = [], exposed = [];
            for (let c = 0; c < numCells; c++) {
                if (!mask[c] || trenchD[c] < 0 || trenchD[c] >= erodeHops || !erosive(c)) continue;
                if (type[c] === CrustType.OCEAN || type[c] === CrustType.CRATON) continue;
                let sea = null, seaSide = 0;                             // a coast cell: sea of its own plate beside it
                for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const nb = adjList[k]; if (mask[nb] && type[nb] === CrustType.OCEAN) { sea ??= nb; seaSide++; } }
                if (sea !== null) { coastCells.push([c, sea]); exposed.push(shapeWeight(seaSide / (adjOffset[c + 1] - adjOffset[c]), config.marginCoastShape)); }
            }
            // (the coast retreats marginErosionKmPerMyr along the TRENCH's length: a coast counted cell by cell is longer
            // the finer the mesh — its every inlet drawn — so per coast cell it lost twice the land at 160K as at 20K;
            // where the coast is more intricate than its trench, the same retreat is shared among more cells)
            // (the sea takes a headland before a cove — the more of a cell's sides face the sea, the sooner it goes — so a
            // retreating coast straightens instead of fraying cell by cell (issue #73); as many cells go as before)
            let erosiveTrench = 0;
            for (const c of trench) if (flags[c] & CrustFlag.EROSIVE) erosiveTrench++;
            const p = pErode * Math.min(1, erosiveTrench / Math.max(1, coastCells.length)) / meanOf(exposed), eaten = [];
            for (let i = 0; i < coastCells.length; i++) { const [c, sea] = coastCells[i]; if (rng() < p * exposed[i]) eaten.push([c, crust.formedAt[sea]]); }
            for (const [c, age] of eaten) { crust.create(c, CrustType.OCEAN, age); flags[c] = CrustFlag.APRON; }
            if (eaten.length) { plate.dirty = true; changed += eaten.length; world.budget.erodedCells += eaten.length; }
        }
        // the fore-arc: sea between this coast and its trench, keeping the gap in front of the trench
        // (an island or the coast grows into its bays before it pushes out a spit — the more of a sea cell's sides are land,
        // the sooner it rises — so islands grow as bodies and the coast creeps out evenly, not cell by cell at random
        // (issue #73); as many cells rise as before, each kind of growth by its own rate)
        const raise = [], cand = [], kindOf = [], weight = [], sum = [0, 0, 0], count = [0, 0, 0], rate = [pGrow, pCoast, pBorn];
        for (let c = 0; c < numCells; c++) {
            if (!mask[c] || type[c] !== CrustType.OCEAN || (flags[c] & CrustFlag.TRENCH) || trenchD[c] < gapHops || landD[c] < 1 || landD[c] + trenchD[c] > reachHops + 1 || erosive(c)) continue;
            let island = false, coast = false, edge = false, landSides = 0;
            for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
                const nb = adjList[k];
                if (!mask[nb]) { edge = true; break; }
                if (type[nb] === CrustType.ARC && (flags[nb] & CrustFlag.MARGIN_ISLE)) { island = true; landSides++; } else if (isLand(nb)) { coast = true; landSides++; }
            }
            if (edge) continue;
            const kind = island ? 0 : coast ? 1 : 2, w = kind < 2 ? shapeWeight(landSides / (adjOffset[c + 1] - adjOffset[c]), config.marginCoastShape) : 1;
            cand.push(c); kindOf.push(kind); weight.push(w); sum[kind] += w; count[kind]++;
        }
        for (let i = 0; i < cand.length; i++) { const k = kindOf[i]; if (rng() < rate[k] * (weight[i] * count[k] / sum[k])) raise.push(cand[i]); }
        if (raise.length) {
            plate.marginIsleTerrane ??= world.nextTerraneId();
            for (const c of raise) {
                type[c] = CrustType.ARC; crust.formedAt[c] = time;
                flags[c] = (flags[c] & ~CrustFlag.APRON) | CrustFlag.MARGIN_ISLE;
                crust.terrane[c] = plate.marginIsleTerrane;
            }
            changed += raise.length;
            plate.dirty = true;
        }
        changed += mergeIntoMainland(world, plate);
    }
    return changed;
}

// Islands that touch the mainland become part of it: continental crust, keeping their own terrane.
function mergeIntoMainland(world, plate) {
    const { mesh, config } = world, { adjOffset, adjList, numCells, cellAreaKm2 } = mesh, crust = plate.crust, { mask, type, flags } = crust;
    const seen = new Uint8Array(numCells);
    let merged = 0;
    for (let s = 0; s < numCells; s++) {
        if (seen[s] || !mask[s] || !(flags[s] & CrustFlag.MARGIN_ISLE) || type[s] !== CrustType.ARC) continue;
        const piece = [s]; seen[s] = 1;
        let touches = false;
        for (let i = 0; i < piece.length; i++) for (let k = adjOffset[piece[i]]; k < adjOffset[piece[i] + 1]; k++) {
            const nb = adjList[k];
            if (!mask[nb]) continue;
            if (type[nb] === CrustType.CONTINENT || type[nb] === CrustType.CRATON) touches = true;
            else if (!seen[nb] && type[nb] === CrustType.ARC && (flags[nb] & CrustFlag.MARGIN_ISLE)) { seen[nb] = 1; piece.push(nb); }
        }
        if (!touches) continue;
        for (const c of piece) type[c] = CrustType.CONTINENT;
        merged += piece.length;
        if (piece.length * cellAreaKm2 >= config.terraneMinAreaKm2) world.log(EventKind.ISLE_MERGE, `an island off ${plate.name}’s coast (${(piece.length * cellAreaKm2 / 1e3).toFixed(0)}k km²) has grown into the mainland`, { plate: plate.id, areaKm2: piece.length * cellAreaKm2 });
    }
    if (merged) plate.dirty = true;
    return merged;
}

/**
 * Is a trench erosive, at plate-frame position (x, y, z) converging at `rate` cm/yr? A 2-octave noise field fixed in
 * the plate's frame (patches ~marginErosionPatchKm across), plus a tilt toward erosive for convergence faster than
 * marginErosionRefCmYr (toward accretionary for slower), against the field's own (1 − marginErosiveShare) quantile — so
 * about marginErosiveShare of margins come out erosive.
 */
function erosionField(world) {
    const { config } = world;
    const f = PLANET_RADIUS_KM / config.marginErosionPatchKm;
    if (!world.erosionNoise) {
        // the threshold is calibrated on the field itself: the (1 − share) quantile of its values over the sphere
        world.erosionNoise = new SimplexNoise((world.seed ^ 0xe205) >>> 0);
        const { xyz, numCells } = world.mesh, values = [];
        for (let w = 0; w < numCells; w += 7) values.push(world.erosionNoise.fbm(xyz[3 * w] * f, xyz[3 * w + 1] * f, xyz[3 * w + 2] * f, 2));
        values.sort((p, q) => p - q);
        world.erosionThreshold = values[Math.min(values.length - 1, Math.floor((1 - config.marginErosiveShare) * values.length))];
    }
    const threshold = world.erosionThreshold, { xyz, numCells } = world.mesh;
    // (the field at each raster cell — a mesh cell, whose position never changes: computed the first time it is asked for)
    if (!world.erosionAt || world.erosionAt.length !== numCells) world.erosionAt = new Float64Array(numCells).fill(NaN);
    const at = world.erosionAt;
    return (c, rate) => {
        if (config.marginErosiveShare <= 0) return false;
        const tilt = config.marginErosionRateBias * Math.max(-1, Math.min(1, (rate - config.marginErosionRefCmYr) / config.marginErosionRefCmYr));
        let v = at[c];
        if (v !== v) v = at[c] = world.erosionNoise.fbm(xyz[3 * c] * f, xyz[3 * c + 1] * f, xyz[3 * c + 2] * f, 2);
        return v + tilt > threshold;
    };
}

function cellsWhere(n, test) { const out = []; for (let c = 0; c < n; c++) if (test(c)) out.push(c); return out; }

/** How strongly a cell's share of land (or sea) sides favours it: share^shape (shape 0: every cell alike, as before #73). */
const shapeWeight = (share, shape) => (shape > 0 ? share ** shape : 1);
const meanOf = a => { let s = 0; for (const v of a) s += v; return a.length && s > 0 ? s / a.length : 1; };

/** Hops through this plate's crust from the given cells (−1 beyond `maxHops`). */
