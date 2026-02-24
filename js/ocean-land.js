// Ocean / land assignment.
// Targets ~30% land by surface area. numContinents controls how many
// separate landmasses to create. Small trapped interior seas are absorbed.

import { makeRng } from './rng.js';

export function assignOceanLand(mesh, r_plate, plateSeeds, r_xyz, seed, numContinents) {
    const rng = makeRng(seed + 42);
    const numRegions = mesh.numRegions;
    const plateIds = Array.from(plateSeeds);
    const numPlates = plateIds.length;
    const { adjOffset, adjList } = mesh;

    // 1. Plate areas and centroids
    const plateArea = {};
    const plateCentroid = {};
    for (const pid of plateIds) {
        plateArea[pid] = 0;
        plateCentroid[pid] = [0, 0, 0];
    }
    for (let r = 0; r < numRegions; r++) {
        const p = r_plate[r];
        if (!plateCentroid[p]) { plateArea[p] = 0; plateCentroid[p] = [0, 0, 0]; }
        plateArea[p]++;
        plateCentroid[p][0] += r_xyz[3*r];
        plateCentroid[p][1] += r_xyz[3*r+1];
        plateCentroid[p][2] += r_xyz[3*r+2];
    }
    for (const pid of plateIds) {
        const a = plateArea[pid] || 1;
        plateCentroid[pid][0] /= a;
        plateCentroid[pid][1] /= a;
        plateCentroid[pid][2] /= a;
    }

    // 2. Plate adjacency graph + perimeter
    const plateAdj = {};
    const platePerim = {};
    for (const pid of plateIds) { plateAdj[pid] = new Set(); platePerim[pid] = 0; }
    for (let r = 0; r < numRegions; r++) {
        const myPlate = r_plate[r];
        let isBoundary = false;
        for (let ni = adjOffset[r], niEnd = adjOffset[r + 1]; ni < niEnd; ni++) {
            const nbPlate = r_plate[adjList[ni]];
            if (myPlate !== nbPlate) {
                plateAdj[myPlate].add(nbPlate);
                isBoundary = true;
            }
        }
        if (isBoundary) platePerim[myPlate]++;
    }

    // Plate compactness
    const plateCompact = {};
    let maxCompact = 0;
    for (const pid of plateIds) {
        const c = Math.sqrt(plateArea[pid] || 1) / (platePerim[pid] || 1);
        plateCompact[pid] = c;
        if (c > maxCompact) maxCompact = c;
    }
    if (maxCompact > 0) {
        for (const pid of plateIds) plateCompact[pid] /= maxCompact;
    }

    const targetLandArea = 0.3 * numRegions;

    // 3. Pick continent seeds via farthest-point sampling
    const effectiveNum = Math.min(numContinents, numPlates);
    const continentSeeds = [];
    const chosen = new Set();

    const first = plateIds[Math.floor(rng() * numPlates)];
    continentSeeds.push(first);
    chosen.add(first);

    for (let s = 1; s < effectiveNum; s++) {
        const candidates = [];
        for (const pid of plateIds) {
            if (chosen.has(pid)) continue;
            const cx = plateCentroid[pid];
            let minDist = Infinity;
            for (const existing of continentSeeds) {
                const ex = plateCentroid[existing];
                const dx = cx[0]-ex[0], dy = cx[1]-ex[1], dz = cx[2]-ex[2];
                const d = dx*dx + dy*dy + dz*dz;
                if (d < minDist) minDist = d;
            }
            const areaFactor = Math.sqrt(numRegions / numPlates) / Math.sqrt(plateArea[pid] || 1);
            const compact = 0.3 + 0.7 * plateCompact[pid];
            candidates.push({ pid, score: minDist * areaFactor * compact });
        }
        if (candidates.length === 0) break;
        candidates.sort((a, b) => b.score - a.score);
        const topK = Math.min(candidates.length, 3);
        const pick = candidates[Math.floor(rng() * topK)];
        continentSeeds.push(pick.pid);
        chosen.add(pick.pid);
    }

    // If seeds alone exceed the land budget, trim the largest seeds
    let seedArea = 0;
    for (const pid of continentSeeds) seedArea += plateArea[pid];
    while (continentSeeds.length > 1 && seedArea > targetLandArea) {
        let maxIdx = 0;
        for (let i = 1; i < continentSeeds.length; i++) {
            if (plateArea[continentSeeds[i]] > plateArea[continentSeeds[maxIdx]]) maxIdx = i;
        }
        seedArea -= plateArea[continentSeeds[maxIdx]];
        chosen.delete(continentSeeds[maxIdx]);
        continentSeeds.splice(maxIdx, 1);
    }

    // 4. Initialize continent assignment
    const plateContinent = {};
    for (let c = 0; c < continentSeeds.length; c++) {
        plateContinent[continentSeeds[c]] = c;
    }
    let landArea = seedArea;

    // 5. Round-robin growth
    const growTarget = targetLandArea * 0.9;

    let progress = true;
    while (progress && landArea < growTarget) {
        progress = false;
        for (let c = 0; c < continentSeeds.length && landArea < growTarget; c++) {
            const candidates = [];
            for (const pid of plateIds) {
                if (plateContinent[pid] !== undefined) continue;
                let touchesSelf = false, touchesOther = false;
                let sameCount = 0;
                for (const adj of plateAdj[pid]) {
                    const ac = plateContinent[adj];
                    if (ac === c) { touchesSelf = true; sameCount++; }
                    else if (ac !== undefined) { touchesOther = true; break; }
                }
                if (touchesSelf && !touchesOther) {
                    candidates.push({ pid, score: sameCount + plateCompact[pid] * 3 + rng() * 0.5 });
                }
            }
            if (candidates.length === 0) continue;

            candidates.sort((a, b) => b.score - a.score);
            const topK = Math.min(candidates.length, 3);
            const pick = candidates[Math.floor(rng() * topK)];

            plateContinent[pick.pid] = c;
            landArea += plateArea[pick.pid];
            progress = true;
        }
    }

    // 6. Absorb trapped interior seas
    const oceanComponents = [];
    const visited = new Set();
    for (const pid of plateIds) {
        if (plateContinent[pid] !== undefined || visited.has(pid)) continue;
        const component = [pid];
        visited.add(pid);
        for (let qi = 0; qi < component.length; qi++) {
            for (const adj of plateAdj[component[qi]]) {
                if (plateContinent[adj] === undefined && !visited.has(adj)) {
                    visited.add(adj);
                    component.push(adj);
                }
            }
        }
        oceanComponents.push(component);
    }

    let mainIdx = 0;
    for (let i = 1; i < oceanComponents.length; i++) {
        let areaI = 0, areaM = 0;
        for (const p of oceanComponents[i]) areaI += plateArea[p];
        for (const p of oceanComponents[mainIdx]) areaM += plateArea[p];
        if (areaI > areaM) mainIdx = i;
    }

    const absorbCap = targetLandArea * 1.1;
    for (let i = 0; i < oceanComponents.length; i++) {
        if (i === mainIdx) continue;
        const component = oceanComponents[i];

        const bordering = new Set();
        for (const op of component) {
            for (const adj of plateAdj[op]) {
                if (plateContinent[adj] !== undefined) bordering.add(plateContinent[adj]);
            }
            if (bordering.size > 1) break;
        }

        if (bordering.size === 1) {
            let compArea = 0;
            for (const op of component) compArea += plateArea[op];
            if (landArea + compArea <= absorbCap) {
                const c = bordering.values().next().value;
                for (const op of component) plateContinent[op] = c;
                landArea += compArea;
            }
        }
    }

    // 7. Build plateIsOcean set
    const plateIsOcean = new Set();
    for (const pid of plateIds) {
        if (plateContinent[pid] === undefined) plateIsOcean.add(pid);
    }
    return plateIsOcean;
}
