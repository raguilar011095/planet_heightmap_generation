// Measurements of a generated start world, straight from the crust rasters — independent of how
// the generator reasons, so they can confirm (or refute) its guarantees. Used by the lab's stat
// panel and by check-phase3.mjs. Distances are centre-to-centre minus one cell, i.e. the width
// of other crust actually lying between two regions.

import { PLANET_RADIUS_KM, kmToHops } from '../../core/sim-mesh.js';
import { floodFrom, hopDistance, touches } from '../../core/mesh-bfs.js';
import { CrustType, CrustFlag } from '../model/crust.js';

export function measureStartWorld(world, start) {
    const mesh = world.mesh, { xyz, numCells, edgeKm } = mesh;
    const crust = world.plates[start.continentId].crust;
    const isLand = c => crust.mask[c] === 1 && crust.type[c] !== CrustType.OCEAN;
    const isCraton = c => crust.mask[c] === 1 && crust.type[c] === CrustType.CRATON;
    const cellKm2 = mesh.cellAreaKm2;

    // ── areas ──
    let land = 0, cratonCells = 0, apron = 0, sutures = 0;
    const cratonArea = new Map(), terraneArea = new Map();
    for (let c = 0; c < numCells; c++) {
        if (!crust.mask[c]) continue;
        if (!isLand(c)) { apron++; continue; }
        land++;
        const t = crust.terrane[c];
        terraneArea.set(t, (terraneArea.get(t) || 0) + 1);
        if (crust.flags[c] & CrustFlag.SUTURE) sutures++;
        if (isCraton(c)) { cratonCells++; cratonArea.set(t, (cratonArea.get(t) || 0) + 1); }
    }
    const cratons = start.cratons.map(k => {
        const km2 = (cratonArea.get(k.id) || 0) * cellKm2;
        return { id: k.id, letter: k.letter, areaKm2: km2, diameterKm: 2 * Math.sqrt(km2 / Math.PI), terraneKm2: (terraneArea.get(k.id) || 0) * cellKm2 };
    });

    // ── spacing: exact centre-to-centre distances between region edges ──
    const edgeOf = test => { const out = []; for (let c = 0; c < numCells; c++) if (test(c) && touches(mesh, c, nb => !test(nb))) out.push(c); return out; };
    const cratonEdges = start.cratons.map(k => edgeOf(c => isCraton(c) && crust.terrane[c] === k.id));
    const coast = edgeOf(c => !isLand(c)).filter(c => touches(mesh, c, isLand));          // sea cells touching land
    const minSeparationKm = (a, b) => {
        let best = -2;
        for (const p of a) for (const q of b) {
            const d = xyz[3 * p] * xyz[3 * q] + xyz[3 * p + 1] * xyz[3 * q + 1] + xyz[3 * p + 2] * xyz[3 * q + 2];
            if (d > best) best = d;
        }
        return Math.acos(Math.min(1, best)) * PLANET_RADIUS_KM - edgeKm;
    };
    let minGapKm = Infinity, minCoastKm = Infinity;
    for (let i = 0; i < cratonEdges.length; i++) {
        minCoastKm = Math.min(minCoastKm, minSeparationKm(cratonEdges[i], coast));
        for (let j = i + 1; j < cratonEdges.length; j++) {
            // cheap reject: discs far apart cannot be the closest pair
            const a = start.cratons[i], b = start.cratons[j];
            const discGap = Math.acos(Math.max(-1, Math.min(1, a.centre[0] * b.centre[0] + a.centre[1] * b.centre[1] + a.centre[2] * b.centre[2]))) - a.radius - b.radius;
            if (discGap * PLANET_RADIUS_KM > minGapKm + 600) continue;
            minGapKm = Math.min(minGapKm, minSeparationKm(cratonEdges[i], cratonEdges[j]));
        }
    }

    // ── the cratons' own shape: no slivers (the nearest the outside comes to a craton's centroid, against the radius
    // of a disc of its area) — and their clusters: the gap from each cluster to its nearest neighbour cluster, against the
    // gap from each craton to its nearest cluster-mate (plans/V2_START_WORLD_PLAN.md, S1) ──
    const compactness = start.cratons.map(k => {
        let sx = 0, sy = 0, sz = 0, n = 0;
        for (let c = 0; c < numCells; c++) if (isCraton(c) && crust.terrane[c] === k.id) { sx += xyz[3 * c]; sy += xyz[3 * c + 1]; sz += xyz[3 * c + 2]; n++; }
        if (!n) return 0;
        const l = Math.hypot(sx, sy, sz);
        let best = -2;
        for (let c = 0; c < numCells; c++) {
            if (isCraton(c) && crust.terrane[c] === k.id) continue;
            const d = (xyz[3 * c] * sx + xyz[3 * c + 1] * sy + xyz[3 * c + 2] * sz) / l;
            if (d > best) best = d;
        }
        return (Math.acos(Math.min(1, best)) * PLANET_RADIUS_KM - edgeKm / 2) / Math.sqrt(n * cellKm2 / Math.PI);
    });
    let clusterContrast = null;
    if (start.cratons.every(k => k.cluster !== undefined) && new Set(start.cratons.map(k => k.cluster)).size > 1) {
        const n = start.cratons.length, gap = Array.from({ length: n }, () => new Float64Array(n));
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) gap[i][j] = gap[j][i] = minSeparationKm(cratonEdges[i], cratonEdges[j]);
        const median = list => { const s = list.slice().sort((a, b) => a - b); return s.length ? s[s.length >> 1] : NaN; };
        const cl = start.cratons.map(k => k.cluster), intra = [], inter = new Map();
        for (let i = 0; i < n; i++) {
            let mate = Infinity;
            for (let j = 0; j < n; j++) if (j !== i) {
                if (cl[j] === cl[i]) mate = Math.min(mate, gap[i][j]);
                else inter.set(cl[i], Math.min(inter.get(cl[i]) ?? Infinity, gap[i][j]));
            }
            if (mate < Infinity) intra.push(mate);
        }
        clusterContrast = { intraKm: median(intra), interKm: median([...inter.values()]), ratio: median([...inter.values()]) / median(intra) };
    }

    // ── the old ranges (S2): pieces of ground the start world's belts raised (upliftKm ≥ 0.2 km), each one's length (the
    // farthest two of its cells apart) — a few long belts, not a scatter of short segments over a honeycomb ──
    const raised = c => isLand(c) && crust.upliftKm[c] >= 0.2, seenR = new Uint8Array(numCells), ranges = [];
    for (let c0 = 0; c0 < numCells; c0++) {
        if (seenR[c0] || !raised(c0)) continue;
        const piece = [c0];
        seenR[c0] = 1;
        for (let i = 0; i < piece.length; i++) for (let k = mesh.adjOffset[piece[i]]; k < mesh.adjOffset[piece[i] + 1]; k++) { const q = mesh.adjList[k]; if (!seenR[q] && raised(q)) { seenR[q] = 1; piece.push(q); } }
        const far = from => { let best = from, d = 2; for (const q of piece) { const t = xyz[3 * from] * xyz[3 * q] + xyz[3 * from + 1] * xyz[3 * q + 1] + xyz[3 * from + 2] * xyz[3 * q + 2]; if (t < d) { d = t; best = q; } } return { best, km: Math.acos(Math.max(-1, Math.min(1, d))) * PLANET_RADIUS_KM }; };
        ranges.push({ cells: piece.length, km: far(far(c0).best).km });
    }
    const raisedCells = ranges.reduce((s, r) => s + r.cells, 0);
    // (and how evenly they are spread: the share of the land within ~500 km of one — a honeycomb's ranges ring every
    // craton, so nearly all the land lies near one; a few seams leave broad plains and shields between them)
    const fromRaised = hopDistance(mesh, raised, kmToHops(mesh, 500));
    let nearRange = 0;
    for (let c = 0; c < numCells; c++) if (isLand(c) && fromRaised[c] >= 0) nearRange++;
    const oldRanges = { pieces: ranges.filter(r => r.cells >= 3).length, longShare: raisedCells ? ranges.filter(r => r.km >= 1500).reduce((s, r) => s + r.cells, 0) / raisedCells : 0,
        longestKm: ranges.length ? Math.max(...ranges.map(r => r.km)) : 0, raisedShare: raisedCells / land, nearShare: nearRange / land };

    // ── shape ──
    const landEdge = edgeOf(isLand);
    let longest = 1;
    for (let i = 0; i < landEdge.length; i += 2) for (let j = i + 1; j < landEdge.length; j += 2) {
        const p = landEdge[i], q = landEdge[j];
        const d = xyz[3 * p] * xyz[3 * q] + xyz[3 * p + 1] * xyz[3 * q + 1] + xyz[3 * p + 2] * xyz[3 * q + 2];
        if (d < longest) longest = d;
    }
    const firstLand = landEdge[0];
    const mainland = floodFrom(mesh, firstLand, isLand);
    let strayLand = 0;
    for (let c = 0; c < numCells; c++) if (isLand(c) && !mainland[c]) strayLand++;
    const antipode = mesh.index.nearest(-start.centre[0], -start.centre[1], -start.centre[2]);
    const openSea = floodFrom(mesh, antipode, c => !isLand(c));
    let enclosedSea = 0;
    for (let c = 0; c < numCells; c++) if (!isLand(c) && !openSea[c]) enclosedSea++;

    // ── apron & trench ──
    const inPlate = c => crust.mask[c] === 1;
    const fromOutside = hopDistance(mesh, c => !inPlate(c), kmToHops(mesh, 5000), inPlate);
    let minApronHops = Infinity;
    for (const c of landEdge) if (fromOutside[c] >= 0 && fromOutside[c] < minApronHops) minApronHops = fromOutside[c];
    let trenchCells = 0, trenchOffRim = 0;
    const rimSet = new Set(start.rim);
    for (let c = 0; c < numCells; c++) if (crust.mask[c] && (crust.flags[c] & CrustFlag.TRENCH)) { trenchCells++; if (!rimSet.has(c)) trenchOffRim++; }

    const diam = cratons.map(k => k.diameterKm), terr = cratons.map(k => k.terraneKm2);
    return {
        cratons,
        continentalFraction: land / numCells, cratonShare: cratonCells / land,
        apronFraction: apron / numCells, sutureShare: sutures / land,
        minGapKm, minCoastKm,
        cratonSizeRatio: Math.max(...diam) / Math.min(...diam), terraneSizeRatio: Math.max(...terr) / Math.min(...terr),
        cratonCompactMin: Math.min(...compactness), clusterContrast, oldRanges,
        siblingPairs: new Set(start.cratons.filter(k => k.block?.pieces.length > 1).map(k => k.block)).size,
        longestAxisDeg: Math.acos(Math.max(-1, longest)) * 180 / Math.PI,
        strayLandCells: strayLand, enclosedSeaCells: enclosedSea,
        minApronKm: (minApronHops - 1) * edgeKm,                 // sea cells between the coast and the plate edge
        coastCells: landEdge.length, rimCells: start.rim.length,
        trenchCoverage: trenchCells / start.rim.length, trenchOffRim,
    };
}
