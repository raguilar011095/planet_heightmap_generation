// Plate generation — round-robin weighted fill with directional bias.
// Each plate gets a random growth rate and preferred direction.

import { makeRng, makeRandInt } from './rng.js';

export function generatePlates(mesh, r_xyz, numPlates, seed) {
    const { numRegions } = mesh;
    const r_plate = new Int32Array(numRegions).fill(-1);
    const rng = makeRng(seed + 0.5);
    const randInt = makeRandInt(seed);

    // Farthest-point seed distribution with top-3 jitter
    const plateSeeds = new Set();
    const isSeed = new Uint8Array(numRegions);
    const minDistToSeed = new Float32Array(numRegions).fill(Infinity);

    const firstSeed = randInt(numRegions);
    plateSeeds.add(firstSeed);
    isSeed[firstSeed] = 1;
    const fsx = r_xyz[3*firstSeed], fsy = r_xyz[3*firstSeed+1], fsz = r_xyz[3*firstSeed+2];
    for (let r = 0; r < numRegions; r++) {
        minDistToSeed[r] = 1 - (r_xyz[3*r]*fsx + r_xyz[3*r+1]*fsy + r_xyz[3*r+2]*fsz);
    }
    minDistToSeed[firstSeed] = 0;

    while (plateSeeds.size < numPlates && plateSeeds.size < numRegions) {
        // Find top-3 farthest regions (flat vars, no object allocation)
        let t0r = -1, t0d = -1, t1r = -1, t1d = -1, t2r = -1, t2d = -1;
        for (let r = 0; r < numRegions; r++) {
            if (isSeed[r]) continue;
            const d = minDistToSeed[r];
            if (d > t2d) {
                if (d > t0d) {
                    t2r = t1r; t2d = t1d; t1r = t0r; t1d = t0d; t0r = r; t0d = d;
                } else if (d > t1d) {
                    t2r = t1r; t2d = t1d; t1r = r; t1d = d;
                } else {
                    t2r = r; t2d = d;
                }
            }
        }
        let validCount = (t0r !== -1) + (t1r !== -1) + (t2r !== -1);
        if (!validCount) break;
        const pick = randInt(validCount);
        const newSeed = pick === 0 ? t0r : pick === 1 ? t1r : t2r;
        plateSeeds.add(newSeed);
        isSeed[newSeed] = 1;
        const nsx = r_xyz[3*newSeed], nsy = r_xyz[3*newSeed+1], nsz = r_xyz[3*newSeed+2];

        // Fused pass: update minDistToSeed from new seed AND find top-3 for next iteration
        if (plateSeeds.size < numPlates) {
            t0r = -1; t0d = -1; t1r = -1; t1d = -1; t2r = -1; t2d = -1;
            for (let r = 0; r < numRegions; r++) {
                const d = 1 - (r_xyz[3*r]*nsx + r_xyz[3*r+1]*nsy + r_xyz[3*r+2]*nsz);
                if (d < minDistToSeed[r]) minDistToSeed[r] = d;
                if (isSeed[r]) continue;
                const md = minDistToSeed[r];
                if (md > t2d) {
                    if (md > t0d) {
                        t2r = t1r; t2d = t1d; t1r = t0r; t1d = t0d; t0r = r; t0d = md;
                    } else if (md > t1d) {
                        t2r = t1r; t2d = t1d; t1r = r; t1d = md;
                    } else {
                        t2r = r; t2d = md;
                    }
                }
            }
            // Next iteration can skip the search pass — top-3 is already computed
            validCount = (t0r !== -1) + (t1r !== -1) + (t2r !== -1);
            if (!validCount) break;
            const pick2 = randInt(validCount);
            const newSeed2 = pick2 === 0 ? t0r : pick2 === 1 ? t1r : t2r;
            plateSeeds.add(newSeed2);
            isSeed[newSeed2] = 1;
            const ns2x = r_xyz[3*newSeed2], ns2y = r_xyz[3*newSeed2+1], ns2z = r_xyz[3*newSeed2+2];
            for (let r = 0; r < numRegions; r++) {
                const d = 1 - (r_xyz[3*r]*ns2x + r_xyz[3*r+1]*ns2y + r_xyz[3*r+2]*ns2z);
                if (d < minDistToSeed[r]) minDistToSeed[r] = d;
            }
        } else {
            // Last seed — just update distances (needed for distance field, but loop will exit)
            for (let r = 0; r < numRegions; r++) {
                const d = 1 - (r_xyz[3*r]*nsx + r_xyz[3*r+1]*nsy + r_xyz[3*r+2]*nsz);
                if (d < minDistToSeed[r]) minDistToSeed[r] = d;
            }
        }
    }

    // Interpolation factor: more cragginess at low plate counts
    const lowPlateT = Math.max(0, Math.min(1, (80 - numPlates) / 60));

    // Per-plate growth properties
    const plateGrowthRate = {};
    const plateGrowthDir = {};
    const plateDirStrength = {};

    const rateMin = 0.7 - 0.4 * lowPlateT;   // 0.7 → 0.3
    const rateRange = 2.3 + 2.4 * lowPlateT;  // 2.3 → 4.7
    const dirBase = 0.15 + 0.25 * lowPlateT;  // 0.15 → 0.4
    const dirScale = 0.25 + 0.25 * lowPlateT; // 0.25 → 0.5

    for (const center of plateSeeds) {
        plateGrowthRate[center] = rateMin + rng() * rng() * rateRange;

        const px = r_xyz[3*center], py = r_xyz[3*center+1], pz = r_xyz[3*center+2];
        const pLen = Math.sqrt(px*px + py*py + pz*pz) || 1;
        const nx = px/pLen, ny = py/pLen, nz = pz/pLen;
        const rx = rng()-0.5, ry = rng()-0.5, rz = rng()-0.5;
        const d = rx*nx + ry*ny + rz*nz;
        let tx = rx - d*nx, ty = ry - d*ny, tz = rz - d*nz;
        const tLen = Math.sqrt(tx*tx + ty*ty + tz*tz) || 1;
        plateGrowthDir[center] = [tx/tLen, ty/tLen, tz/tLen];

        plateDirStrength[center] = Math.min(0.85, rng() * (dirBase + dirScale / plateGrowthRate[center]));
    }

    // Per-plate frontiers — round-robin ensures every plate advances
    const plateIds = Array.from(plateSeeds);
    const frontiers = new Map();
    const plateAreaCount = {};
    for (const pid of plateIds) {
        r_plate[pid] = pid;
        frontiers.set(pid, [pid]);
        plateAreaCount[pid] = 1;
    }

    const { adjOffset, adjList } = mesh;
    let remaining = numRegions - plateIds.length;
    const COMPACT_WEIGHT = 0.3 - 0.22 * lowPlateT; // 0.3 → 0.08
    const expectedArea = Math.max(1, (numRegions - plateIds.length) / numPlates);
    const areaGovernorMult = 2.0 + 2.0 * lowPlateT; // 2.0 → 4.0
    const invNumRegions = 1 / numRegions;

    while (remaining > 0) {
        let anyProgress = false;
        for (const pid of plateIds) {
            const frontier = frontiers.get(pid);
            if (frontier.length === 0) continue;

            const rate = plateGrowthRate[pid];
            const dir = plateGrowthDir[pid];
            const d0 = dir[0], d1 = dir[1], d2 = dir[2];
            const dirStr = plateDirStrength[pid];
            const dirStrHalf = dirStr * 0.5;
            let steps = Math.max(1, Math.ceil(rate * (0.5 + rng())));

            // Governor: halve steps for plates exceeding threshold
            if (plateAreaCount[pid] > expectedArea * areaGovernorMult) {
                steps = Math.max(1, Math.ceil(steps * 0.5));
            }

            // Compactness: expected chord distance for a circular plate of current area
            const expectedChordDist = Math.sqrt((plateAreaCount[pid] || 1) * invNumRegions / Math.PI) * 2;
            const compactThreshold = expectedChordDist * 1.8;

            // Precompute seed coordinates
            const sx = r_xyz[3*pid], sy = r_xyz[3*pid+1], sz = r_xyz[3*pid+2];

            for (let s = 0; s < steps && frontier.length > 0; s++) {
                let bestIdx = 0, bestScore = -Infinity;
                const samples = Math.min(frontier.length, 3 + Math.floor(dirStr * 5));
                for (let i = 0; i < samples; i++) {
                    const idx = randInt(frontier.length);
                    const cell = frontier[idx];
                    const ci = 3*cell;
                    const dx = r_xyz[ci] - sx, dy = r_xyz[ci+1] - sy, dz = r_xyz[ci+2] - sz;
                    const dLenSq = dx*dx + dy*dy + dz*dz;
                    const dLen = Math.sqrt(dLenSq) || 1;
                    const alignment = (dx*d0 + dy*d1 + dz*d2) / dLen;

                    // Compactness: seedDist = dLenSq/2 for unit-sphere points
                    const excess = Math.max(0, dLenSq * 0.5 - compactThreshold);
                    const compactPenalty = excess * (COMPACT_WEIGHT * 4);

                    const score = alignment * dirStr + rng() * (1 - dirStrHalf) - compactPenalty;
                    if (score > bestScore) { bestScore = score; bestIdx = idx; }
                }

                const current = frontier[bestIdx];
                frontier[bestIdx] = frontier[frontier.length - 1];
                frontier.pop();

                for (let j = adjOffset[current], jEnd = adjOffset[current + 1]; j < jEnd; j++) {
                    const nb = adjList[j];
                    if (r_plate[nb] === -1) {
                        r_plate[nb] = pid;
                        frontier.push(nb);
                        plateAreaCount[pid]++;
                        remaining--;
                        anyProgress = true;
                    }
                }
            }
        }
        if (!anyProgress) break;
    }

    // Cleanup: assign orphaned regions to nearest claimed neighbor
    let orphans = true;
    while (orphans) {
        orphans = false;
        for (let r = 0; r < numRegions; r++) {
            if (r_plate[r] === -1) {
                for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
                    const nb = adjList[j];
                    if (r_plate[nb] !== -1) {
                        r_plate[r] = r_plate[nb];
                        orphans = true;
                        break;
                    }
                }
            }
        }
    }

    smoothAndReconnectPlates(mesh, r_plate, plateSeeds, Math.round(3 - 2 * lowPlateT));

    // Assign an Euler pole + angular velocity per plate
    const plateVec = {};
    for (const center of plateSeeds) {
        // Random Euler pole uniformly distributed on the sphere
        const theta = rng() * 2 * Math.PI;
        const cosP = 2 * rng() - 1;
        const sinP = Math.sqrt(1 - cosP * cosP);
        const pole = [sinP * Math.cos(theta), sinP * Math.sin(theta), cosP];
        // Angular velocity: magnitude 0.5–2.0, random sign
        const omega = (0.5 + rng() * 1.5) * (rng() < 0.5 ? -1 : 1);
        plateVec[center] = { pole, omega };
    }

    return { r_plate, plateSeeds, plateVec };
}

/**
 * Smooth plate boundaries via majority-vote, then reconnect severed plates.
 * @param {SphereMesh} mesh
 * @param {Int32Array} r_plate — mutated in place
 * @param {Set|Array} plateSeeds — seed region IDs (used for connectivity roots & protection)
 * @param {number} numPasses — number of majority-vote smoothing passes
 */
export function smoothAndReconnectPlates(mesh, r_plate, plateSeeds, numPasses) {
    const { numRegions, adjOffset, adjList } = mesh;
    const plateIds = Array.from(plateSeeds);

    // Build seed lookup for protection during smoothing.
    // Protects plate seed regions from being reassigned by majority-vote.
    // After coarse→hi-res projection the seed IDs are coarse-mesh indices
    // that won't satisfy r_plate[pid] === pid on the hi-res mesh, so the
    // array stays all-zeros and protection is effectively skipped — this is
    // intentional since projected boundaries don't need seed anchoring.
    const isSeed = new Uint8Array(numRegions);
    for (const pid of plateIds) {
        if (pid < numRegions && r_plate[pid] === pid) isSeed[pid] = 1;
    }

    // Smooth boundaries: majority-vote removes thin tendrils
    let maxDeg = 0;
    for (let r = 0; r < numRegions; r++) {
        const deg = adjOffset[r + 1] - adjOffset[r];
        if (deg > maxDeg) maxDeg = deg;
    }
    const cntPlates = new Int32Array(maxDeg);
    const cntValues = new Uint8Array(maxDeg);
    for (let pass = 0; pass < numPasses; pass++) {
        const threshold = pass === 0 ? 0.4 : 0.5;
        for (let r = 0; r < numRegions; r++) {
            const rStart = adjOffset[r], rEnd = adjOffset[r + 1];
            const deg = rEnd - rStart;
            let nDistinct = 0;
            for (let j = rStart; j < rEnd; j++) {
                const p = r_plate[adjList[j]];
                let found = false;
                for (let k = 0; k < nDistinct; k++) {
                    if (cntPlates[k] === p) { cntValues[k]++; found = true; break; }
                }
                if (!found) { cntPlates[nDistinct] = p; cntValues[nDistinct] = 1; nDistinct++; }
            }
            let bestPlate = r_plate[r], bestCount = 0;
            for (let k = 0; k < nDistinct; k++) {
                if (cntValues[k] > bestCount) { bestCount = cntValues[k]; bestPlate = cntPlates[k]; }
            }
            if (bestCount > deg * threshold && !isSeed[r]) {
                r_plate[r] = bestPlate;
            }
        }
    }

    // Reconnect: smoothing or projection may create disconnected plate fragments.
    // For each plate, keep the LARGEST connected component and mark the rest
    // for reassignment. This is stable across resolutions (unlike first-found).
    {
        const visited = new Uint8Array(numRegions);
        // Per-plate: track the largest component's BFS list
        const bestComponent = {}; // pid → [region indices]

        for (let r = 0; r < numRegions; r++) {
            if (visited[r]) continue;
            const pid = r_plate[r];
            const bfs = [r];
            visited[r] = 1;
            for (let qi = 0; qi < bfs.length; qi++) {
                for (let ni = adjOffset[bfs[qi]], niEnd = adjOffset[bfs[qi] + 1]; ni < niEnd; ni++) {
                    const nb = adjList[ni];
                    if (!visited[nb] && r_plate[nb] === pid) {
                        visited[nb] = 1;
                        bfs.push(nb);
                    }
                }
            }
            if (!bestComponent[pid] || bfs.length > bestComponent[pid].length) {
                bestComponent[pid] = bfs;
            }
        }

        // Mark regions in the largest component per plate
        const inMain = new Uint8Array(numRegions);
        for (const pid of Object.keys(bestComponent)) {
            for (const r of bestComponent[pid]) inMain[r] = 1;
        }

        // Reassign orphaned regions (not in their plate's largest component)
        // via BFS from the main-component boundary
        const queue = [];
        for (let r = 0; r < numRegions; r++) {
            if (!inMain[r]) {
                for (let ni = adjOffset[r], niEnd = adjOffset[r + 1]; ni < niEnd; ni++) {
                    if (inMain[adjList[ni]]) {
                        r_plate[r] = r_plate[adjList[ni]];
                        inMain[r] = 1;
                        queue.push(r);
                        break;
                    }
                }
            }
        }
        for (let qi = 0; qi < queue.length; qi++) {
            const r = queue[qi];
            for (let ni = adjOffset[r], niEnd = adjOffset[r + 1]; ni < niEnd; ni++) {
                const nb = adjList[ni];
                if (!inMain[nb]) {
                    r_plate[nb] = r_plate[r];
                    inMain[nb] = 1;
                    queue.push(nb);
                }
            }
        }
    }
}
