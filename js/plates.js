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

    // Per-plate growth properties
    const plateGrowthRate = {};
    const plateGrowthDir = {};
    const plateDirStrength = {};

    for (const center of plateSeeds) {
        plateGrowthRate[center] = 0.7 + rng() * rng() * 2.3;

        const px = r_xyz[3*center], py = r_xyz[3*center+1], pz = r_xyz[3*center+2];
        const pLen = Math.sqrt(px*px + py*py + pz*pz) || 1;
        const nx = px/pLen, ny = py/pLen, nz = pz/pLen;
        const rx = rng()-0.5, ry = rng()-0.5, rz = rng()-0.5;
        const d = rx*nx + ry*ny + rz*nz;
        let tx = rx - d*nx, ty = ry - d*ny, tz = rz - d*nz;
        const tLen = Math.sqrt(tx*tx + ty*ty + tz*tz) || 1;
        plateGrowthDir[center] = [tx/tLen, ty/tLen, tz/tLen];

        plateDirStrength[center] = rng() * (0.15 + 0.25 / plateGrowthRate[center]);
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
    const COMPACT_WEIGHT = 0.3;
    const expectedArea = Math.max(1, (numRegions - plateIds.length) / numPlates);
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

            // Governor: halve steps for plates exceeding 2x expected area
            if (plateAreaCount[pid] > expectedArea * 2.0) {
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

    // Smooth boundaries: majority-vote removes thin tendrils
    // Uses inline plate-count arrays instead of Map for performance.
    const SMOOTH_PASSES = 3;
    let maxDeg = 0;
    for (let r = 0; r < numRegions; r++) {
        const deg = adjOffset[r + 1] - adjOffset[r];
        if (deg > maxDeg) maxDeg = deg;
    }
    const cntPlates = new Int32Array(maxDeg);
    const cntValues = new Uint8Array(maxDeg);
    for (let pass = 0; pass < SMOOTH_PASSES; pass++) {
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

    // Reconnect: smoothing may sever narrow isthmuses
    {
        const visited = new Uint8Array(numRegions);
        for (const pid of plateIds) {
            const bfs = [pid];
            visited[pid] = 1;
            for (let qi = 0; qi < bfs.length; qi++) {
                for (let ni = adjOffset[bfs[qi]], niEnd = adjOffset[bfs[qi] + 1]; ni < niEnd; ni++) {
                    const nb = adjList[ni];
                    if (!visited[nb] && r_plate[nb] === pid) {
                        visited[nb] = 1;
                        bfs.push(nb);
                    }
                }
            }
        }
        const queue = [];
        for (let r = 0; r < numRegions; r++) {
            if (!visited[r]) {
                for (let ni = adjOffset[r], niEnd = adjOffset[r + 1]; ni < niEnd; ni++) {
                    if (visited[adjList[ni]]) {
                        r_plate[r] = r_plate[adjList[ni]];
                        visited[r] = 1;
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
                if (!visited[nb]) {
                    r_plate[nb] = r_plate[r];
                    visited[nb] = 1;
                    queue.push(nb);
                }
            }
        }
    }

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
