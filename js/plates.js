// Plate generation — round-robin weighted fill with directional bias.
// Each plate gets a random growth rate and preferred direction.

import { makeRng, makeRandInt } from './rng.js';

export function generatePlates(mesh, r_xyz, numPlates, seed) {
    const { numRegions } = mesh;
    const r_plate = new Int32Array(numRegions).fill(-1);
    const rng = makeRng(seed + 0.5);
    const randInt = makeRandInt(seed);

    // Pick random seed regions as plate centres
    const plateSeeds = new Set();
    while (plateSeeds.size < numPlates && plateSeeds.size < numRegions)
        plateSeeds.add(randInt(numRegions));

    // Per-plate growth properties
    const plateGrowthRate = {};
    const plateGrowthDir = {};
    const plateDirStrength = {};

    for (const center of plateSeeds) {
        plateGrowthRate[center] = 0.5 + rng() * rng() * 3.5;

        const px = r_xyz[3*center], py = r_xyz[3*center+1], pz = r_xyz[3*center+2];
        const pLen = Math.sqrt(px*px + py*py + pz*pz) || 1;
        const nx = px/pLen, ny = py/pLen, nz = pz/pLen;
        const rx = rng()-0.5, ry = rng()-0.5, rz = rng()-0.5;
        const d = rx*nx + ry*ny + rz*nz;
        let tx = rx - d*nx, ty = ry - d*ny, tz = rz - d*nz;
        const tLen = Math.sqrt(tx*tx + ty*ty + tz*tz) || 1;
        plateGrowthDir[center] = [tx/tLen, ty/tLen, tz/tLen];

        plateDirStrength[center] = rng() * 0.7;
    }

    // Per-plate frontiers — round-robin ensures every plate advances
    const plateIds = Array.from(plateSeeds);
    const frontiers = new Map();
    for (const pid of plateIds) {
        r_plate[pid] = pid;
        frontiers.set(pid, [pid]);
    }

    const out_r = [];
    let remaining = numRegions - plateIds.length;

    while (remaining > 0) {
        let anyProgress = false;
        for (const pid of plateIds) {
            const frontier = frontiers.get(pid);
            if (frontier.length === 0) continue;

            const rate = plateGrowthRate[pid];
            const dir = plateGrowthDir[pid];
            const dirStr = plateDirStrength[pid];
            const steps = Math.max(1, Math.ceil(rate * (0.5 + rng())));

            for (let s = 0; s < steps && frontier.length > 0; s++) {
                let bestIdx = 0, bestScore = -Infinity;
                const samples = Math.min(frontier.length, 3 + Math.floor(dirStr * 5));
                for (let i = 0; i < samples; i++) {
                    const idx = randInt(frontier.length);
                    const cell = frontier[idx];
                    const dx = r_xyz[3*cell] - r_xyz[3*pid];
                    const dy = r_xyz[3*cell+1] - r_xyz[3*pid+1];
                    const dz = r_xyz[3*cell+2] - r_xyz[3*pid+2];
                    const dLen = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1;
                    const alignment = (dx*dir[0] + dy*dir[1] + dz*dir[2]) / dLen;
                    const score = alignment * dirStr + rng() * (1 - dirStr * 0.5);
                    if (score > bestScore) { bestScore = score; bestIdx = idx; }
                }

                const current = frontier[bestIdx];
                frontier[bestIdx] = frontier[frontier.length - 1];
                frontier.pop();

                mesh.r_circulate_r(out_r, current);
                for (const nb of out_r) {
                    if (r_plate[nb] === -1) {
                        r_plate[nb] = pid;
                        frontier.push(nb);
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
                mesh.r_circulate_r(out_r, r);
                for (const nb of out_r) {
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
    const counts = new Map();
    for (let pass = 0; pass < 4; pass++) {
        for (let r = 0; r < numRegions; r++) {
            mesh.r_circulate_r(out_r, r);
            counts.clear();
            for (const nb of out_r) {
                const p = r_plate[nb];
                counts.set(p, (counts.get(p) || 0) + 1);
            }
            let bestPlate = r_plate[r], bestCount = 0;
            for (const [p, c] of counts) {
                if (c > bestCount) { bestCount = c; bestPlate = p; }
            }
            if (bestCount > out_r.length / 2 && !plateSeeds.has(r)) {
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
                mesh.r_circulate_r(out_r, bfs[qi]);
                for (let ni = 0; ni < out_r.length; ni++) {
                    const nb = out_r[ni];
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
                mesh.r_circulate_r(out_r, r);
                for (let ni = 0; ni < out_r.length; ni++) {
                    if (visited[out_r[ni]]) {
                        r_plate[r] = r_plate[out_r[ni]];
                        visited[r] = 1;
                        queue.push(r);
                        break;
                    }
                }
            }
        }
        for (let qi = 0; qi < queue.length; qi++) {
            const r = queue[qi];
            mesh.r_circulate_r(out_r, r);
            for (let ni = 0; ni < out_r.length; ni++) {
                const nb = out_r[ni];
                if (!visited[nb]) {
                    r_plate[nb] = r_plate[r];
                    visited[nb] = 1;
                    queue.push(nb);
                }
            }
        }
    }

    // Assign a random movement vector per plate
    const plateVec = {};
    for (const center of plateSeeds) {
        const nbs = mesh.r_circulate_r([], center);
        const nb = nbs[randInt(nbs.length)];
        const dx = r_xyz[3*nb]-r_xyz[3*center],
              dy = r_xyz[3*nb+1]-r_xyz[3*center+1],
              dz = r_xyz[3*nb+2]-r_xyz[3*center+2];
        const len = Math.sqrt(dx*dx+dy*dy+dz*dz) || 1;
        plateVec[center] = [dx/len, dy/len, dz/len];
    }

    return { r_plate, plateSeeds, plateVec };
}
