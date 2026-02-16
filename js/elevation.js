// Elevation pipeline: collision detection, stress propagation,
// distance fields, and final elevation assignment.

import { makeRandInt } from './rng.js';
import { SimplexNoise } from './simplex-noise.js';

// ----------------------------------------------------------------
//  Collision detection
// ----------------------------------------------------------------
const COLLISION_THRESHOLD = 0.75;

export function findCollisions(mesh, r_xyz, plateIsOcean, r_plate, plateVec, plateDensity, noise) {
    const dt = 1e-2 / Math.max(1, Math.sqrt(mesh.numRegions / 10000));
    const { numRegions } = mesh;
    const mountain_r  = new Set();
    const coastline_r = new Set();
    const ocean_r     = new Set();
    const r_stress    = new Float32Array(numRegions);
    const r_subductFactor = new Float32Array(numRegions).fill(0.5);
    const r_boundaryType = new Int8Array(numRegions);
    const r_bothOcean = new Uint8Array(numRegions);
    const r_hasOcean  = new Uint8Array(numRegions);
    const out_r = [];

    const plateOcean = {};
    for (const pid of plateIsOcean) plateOcean[pid] = 1;

    const pairIntensityCache = new Map();
    function getPairIntensity(a, b) {
        const lo = Math.min(a, b), hi = Math.max(a, b);
        const key = lo * 1000003 + hi;
        if (pairIntensityCache.has(key)) return pairIntensityCache.get(key);
        let h = ((lo * 16807) ^ (hi * 48271)) >>> 0;
        h = (((h >> 16) ^ h) * 0x45d9f3b) >>> 0;
        const val = 0.5 + (h % 10001) / 10000;
        pairIntensityCache.set(key, val);
        return val;
    }

    const undulOctaves = numRegions > 200000 ? 2 : 3;

    for (let r = 0; r < numRegions; r++) {
        const myPlate = r_plate[r];
        let bestComp = -Infinity;
        let best = -1;
        let bestNormalComp = 0;
        mesh.r_circulate_r(out_r, r);
        for (let ni = 0; ni < out_r.length; ni++) {
            const nb = out_r[ni];
            if (myPlate !== r_plate[nb]) {
                const ri3 = 3*r, ni3 = 3*nb;
                const dx = r_xyz[ri3]-r_xyz[ni3], dy = r_xyz[ri3+1]-r_xyz[ni3+1], dz = r_xyz[ri3+2]-r_xyz[ni3+2];
                const dBefore = Math.sqrt(dx*dx+dy*dy+dz*dz);
                const v1 = plateVec[myPlate], v2 = plateVec[r_plate[nb]];
                const ax = r_xyz[ri3]  +v1[0]*dt, ay = r_xyz[ri3+1]  +v1[1]*dt, az = r_xyz[ri3+2]  +v1[2]*dt;
                const bx = r_xyz[ni3] +v2[0]*dt, by = r_xyz[ni3+1] +v2[1]*dt, bz = r_xyz[ni3+2] +v2[2]*dt;
                const adx = ax-bx, ady = ay-by, adz = az-bz;
                const dAfter = Math.sqrt(adx*adx+ady*ady+adz*adz);
                const comp = dBefore - dAfter;
                if (comp > bestComp) {
                    bestComp = comp; best = nb;
                    const rvx = v1[0]-v2[0], rvy = v1[1]-v2[1], rvz = v1[2]-v2[2];
                    const bnLen = dBefore || 1;
                    bestNormalComp = -(rvx*dx + rvy*dy + rvz*dz) / bnLen;
                }
            }
        }
        if (best !== -1) {
            const collided = bestComp > COLLISION_THRESHOLD * dt;
            const rOcean = plateOcean[myPlate] || 0;
            const nOcean = plateOcean[r_plate[best]] || 0;
            r_bothOcean[r] = (rOcean && nOcean) ? 1 : 0;
            r_hasOcean[r] = (rOcean || nOcean) ? 1 : 0;

            const thresh = 0.3 * dt;
            if (bestNormalComp > thresh) r_boundaryType[r] = 1;
            else if (bestNormalComp < -thresh) r_boundaryType[r] = 2;
            else r_boundaryType[r] = 3;

            if (collided) {
                r_stress[r] = (bestComp / dt) * getPairIntensity(myPlate, r_plate[best]);
            }

            const myDensity = plateDensity[myPlate];
            const nbDensity = plateDensity[r_plate[best]];
            const densityDiff = myDensity - nbDensity;
            const baseFactor = 0.5 + 0.5 * Math.tanh(densityDiff * 8);
            const densityContrast = Math.abs(densityDiff);
            const undulationStrength = Math.exp(-densityContrast * 12);
            const x = r_xyz[3*r], y = r_xyz[3*r+1], z = r_xyz[3*r+2];
            const undulation = noise.fbm(x * 6, y * 6, z * 6, undulOctaves) * 0.4 * undulationStrength;
            r_subductFactor[r] = Math.max(0, Math.min(1, baseFactor + undulation));

            if (rOcean && nOcean) {
                (collided ? coastline_r : ocean_r).add(r);
            } else if (!rOcean && !nOcean) {
                if (collided) {
                    if (r_subductFactor[r] < 0.55) mountain_r.add(r);
                    else coastline_r.add(r);
                }
            } else {
                (collided ? mountain_r : coastline_r).add(r);
            }
        }
    }
    return { mountain_r, coastline_r, ocean_r, r_stress, r_subductFactor, r_boundaryType, r_bothOcean, r_hasOcean };
}

// ----------------------------------------------------------------
//  Stress propagation — frontier-based BFS diffusion inward
// ----------------------------------------------------------------
export function propagateStress(mesh, r_stress, r_subductFactor, r_plate, plateIsOcean, decayFactor, subductDecayFactor, numPasses) {
    const out_r = [];
    const plateOcean = {};
    for (const pid of plateIsOcean) plateOcean[pid] = 1;

    let frontier = [];
    for (let r = 0; r < mesh.numRegions; r++) {
        if (r_stress[r] > 0.01) frontier.push(r);
    }

    for (let pass = 0; pass < numPasses && frontier.length > 0; pass++) {
        const nextFrontier = [];
        for (let fi = 0; fi < frontier.length; fi++) {
            const r = frontier[fi];
            const plate = r_plate[r];
            if (plateOcean[plate]) continue;
            const sf = r_subductFactor[r];
            const effDecay = sf > 0.5 ? subductDecayFactor : decayFactor;
            const propagated = r_stress[r] * effDecay;
            if (propagated < 0.005) continue;

            mesh.r_circulate_r(out_r, r);
            for (let ni = 0; ni < out_r.length; ni++) {
                const nb = out_r[ni];
                if (r_plate[nb] === plate && propagated > r_stress[nb]) {
                    r_stress[nb] = propagated;
                    r_subductFactor[nb] = sf;
                    nextFrontier.push(nb);
                }
            }
        }
        frontier = nextFrontier;
    }
}

// ----------------------------------------------------------------
//  Distance field — random-fill outward from seeds, stopping at barriers
// ----------------------------------------------------------------
export function assignDistanceField(mesh, seeds, stops, seed) {
    const randInt = makeRandInt(seed);
    const { numRegions } = mesh;
    const r_dist = new Float32Array(numRegions).fill(Infinity);

    const isStop = new Uint8Array(numRegions);
    for (const r of stops) isStop[r] = 1;

    const queue = [];
    for (const r of seeds) { queue.push(r); r_dist[r] = 0; }

    const out_r = [];
    for (let qi = 0; qi < queue.length; qi++) {
        const pos = qi + randInt(queue.length - qi);
        const cur = queue[pos];
        queue[pos] = queue[qi];
        mesh.r_circulate_r(out_r, cur);
        for (let ni = 0; ni < out_r.length; ni++) {
            const nb = out_r[ni];
            if (r_dist[nb] === Infinity && !isStop[nb]) {
                r_dist[nb] = r_dist[cur] + 1;
                queue.push(nb);
            }
        }
    }
    return r_dist;
}

// BFS-expand a set of regions outward by `steps` rings
export function expandRegions(mesh, regions, steps) {
    if (steps <= 0) return regions;
    const expanded = new Set(regions);
    let frontier = [...regions];
    const out_r = [];
    for (let i = 0; i < steps; i++) {
        const next = [];
        for (const r of frontier) {
            mesh.r_circulate_r(out_r, r);
            for (const nb of out_r) {
                if (!expanded.has(nb)) {
                    expanded.add(nb);
                    next.push(nb);
                }
            }
        }
        frontier = next;
    }
    return expanded;
}

// ----------------------------------------------------------------
//  Elevation assignment — combines distance fields, stress, noise
// ----------------------------------------------------------------
export function assignElevation(mesh, r_xyz, plateIsOcean, r_plate, plateVec, plateSeeds, noise, noiseMag, seed, spread, plateDensity) {
    const { numRegions } = mesh;
    const r_elevation = new Float32Array(numRegions);

    const { mountain_r, coastline_r, ocean_r, r_stress, r_subductFactor, r_boundaryType, r_bothOcean, r_hasOcean } =
        findCollisions(mesh, r_xyz, plateIsOcean, r_plate, plateVec, plateDensity, noise);

    // Propagate stress inward
    const scaleFactor = Math.sqrt(numRegions / 10000);
    const baseDecay = 0.5 + spread * 0.04;
    const decayFactor = Math.pow(baseDecay, 1 / scaleFactor);
    const subductBaseDecay = baseDecay * 0.45;
    const subductDecayFactor = Math.pow(subductBaseDecay, 1 / scaleFactor);
    const numPasses = Math.max(1, Math.round(spread * 3 * scaleFactor));
    propagateStress(mesh, r_stress, r_subductFactor, r_plate, plateIsOcean, decayFactor, subductDecayFactor, numPasses);

    // Plate centres are also seeds
    for (const r of plateSeeds) {
        (plateIsOcean.has(r) ? ocean_r : coastline_r).add(r);
    }

    const stress_mountain_r = new Set();
    for (const r of mountain_r) {
        if (r_subductFactor[r] < 0.55) stress_mountain_r.add(r);
    }

    const stop_r = new Set([...stress_mountain_r, ...coastline_r, ...ocean_r]);

    // Three distance fields
    const dist_mountain  = assignDistanceField(mesh, stress_mountain_r, ocean_r,     seed + 1);
    const dist_ocean     = assignDistanceField(mesh, ocean_r,           coastline_r, seed + 2);
    const dist_coastline = assignDistanceField(mesh, coastline_r,       stop_r,      seed + 3);

    // Coast distance for ocean floor features
    const r_isOcean = new Uint8Array(numRegions);
    for (let r = 0; r < numRegions; r++) {
        if (plateIsOcean.has(r_plate[r])) r_isOcean[r] = 1;
    }

    const coastSeeds = new Set();
    const out_r = [];
    for (let r = 0; r < numRegions; r++) {
        if (!r_isOcean[r]) {
            mesh.r_circulate_r(out_r, r);
            for (let ni = 0; ni < out_r.length; ni++) {
                if (r_isOcean[out_r[ni]]) { coastSeeds.add(out_r[ni]); break; }
            }
        }
    }
    const dist_coast = assignDistanceField(mesh, coastSeeds, new Set(), seed + 4);

    let maxStress = 0;
    for (let r = 0; r < numRegions; r++) {
        if (r_stress[r] > maxStress) maxStress = r_stress[r];
    }
    if (maxStress < 0.01) maxStress = 1;

    const eps = 1e-3;
    const warpScale = 0.4;
    const warpOctaves = numRegions > 200000 ? 2 : 3;

    for (let r = 0; r < numRegions; r++) {
        const isOceanPlate = r_isOcean[r];

        const a = dist_mountain[r]  + eps;
        const b = dist_ocean[r]     + eps;
        const c = dist_coastline[r] + eps;
        if (a === Infinity && b === Infinity) {
            r_elevation[r] = 0.1;
        } else {
            r_elevation[r] = (1/a - 1/b) / (1/a + 1/b + 1/c);
        }

        const stressNorm = r_stress[r] / maxStress;
        const btype = r_boundaryType[r];

        const x = r_xyz[3*r], y = r_xyz[3*r+1], z = r_xyz[3*r+2];
        const wx = x + warpScale * noise.fbm(x + 5.3, y + 1.7, z + 3.1, warpOctaves);
        const wy = y + warpScale * noise.fbm(x + 8.1, y + 2.9, z + 7.3, warpOctaves);
        const wz = z + warpScale * noise.fbm(x + 1.4, y + 6.2, z + 4.8, warpOctaves);

        if (!isOceanPlate) {
            const sf = r_subductFactor[r];

            if (sf > 0.5 && r_elevation[r] > 0) {
                const suppression = (sf - 0.5) * 2;
                r_elevation[r] *= 1 - suppression * 0.35;
            }

            if (stressNorm > 0.01) {
                const stressMag = stressNorm * stressNorm * 0.35;
                const uplift  = stressMag * (1 - sf);
                const depress = stressMag * 0.4 * sf;
                const heightVar = 0.75 + 0.5 * noise.fbm(x * 8 + 13.7, y * 8 + 9.2, z * 8 + 4.5, 3);
                r_elevation[r] += (uplift - depress) * heightVar;
            }

            if (stressNorm < 0.05 && stressNorm > 0) {
                r_elevation[r] -= 0.03;
            }

            if (btype === 2 && !r_hasOcean[r]) {
                r_elevation[r] -= 0.12;
            }

            const blend = Math.min(1, stressNorm * 3);
            const smoothNoise = noise.fbm(wx, wy, wz) * noiseMag;
            const ridgedNoise = noise.ridgedFbm(wx, wy, wz) * noiseMag * 1.5;
            r_elevation[r] += smoothNoise * (1 - blend) + ridgedNoise * blend;

        } else {
            const dc = dist_coast[r];
            let oceanBase;
            if (dc < 5) {
                oceanBase = -0.02 - 0.06 * (dc / 5);
            } else if (dc < 12) {
                oceanBase = -0.08 - 0.25 * ((dc - 5) / 7);
            } else {
                oceanBase = -0.35 + noise.fbm(x * 2, y * 2, z * 2, 3) * 0.03;
            }

            r_elevation[r] = Math.min(r_elevation[r], oceanBase);

            if (btype === 2 && r_bothOcean[r]) {
                r_elevation[r] += 0.12 * noise.ridgedFbm(x * 3, y * 3, z * 3, 4) + 0.06;
            }

            if (btype === 1) {
                r_elevation[r] -= 0.15 + 0.15 * stressNorm;
            }

            r_elevation[r] += noise.fbm(wx, wy, wz) * noiseMag * 0.3;
        }
    }

    // Coastal roughening
    {
        const coastBdry = [];
        for (let r = 0; r < numRegions; r++) {
            const rOc = r_isOcean[r];
            mesh.r_circulate_r(out_r, r);
            for (let ni = 0; ni < out_r.length; ni++) {
                if (r_isOcean[out_r[ni]] !== rOc) {
                    coastBdry.push(r);
                    break;
                }
            }
        }

        const maxCD = Math.max(8, Math.round(8 * scaleFactor));
        const dBdry = new Float32Array(numRegions);
        dBdry.fill(maxCD + 1);
        const coastStressMax = new Float32Array(numRegions);
        const coastSubductMax = new Float32Array(numRegions);
        const coastConvergent = new Uint8Array(numRegions);
        for (let i = 0; i < coastBdry.length; i++) {
            const r = coastBdry[i];
            dBdry[r] = 0;
            coastStressMax[r] = r_stress[r] / maxStress;
            coastSubductMax[r] = r_subductFactor[r];
            coastConvergent[r] = r_boundaryType[r] === 1 ? 1 : 0;
        }
        let qi = 0;
        while (qi < coastBdry.length) {
            const r = coastBdry[qi++];
            const nd = dBdry[r] + 1;
            if (nd > maxCD) continue;
            mesh.r_circulate_r(out_r, r);
            for (let ni = 0; ni < out_r.length; ni++) {
                const nr = out_r[ni];
                if (nd < dBdry[nr]) {
                    dBdry[nr] = nd;
                    coastStressMax[nr] = coastStressMax[r];
                    coastSubductMax[nr] = coastSubductMax[r];
                    coastConvergent[nr] = coastConvergent[r];
                    coastBdry.push(nr);
                } else if (nd === dBdry[nr] && coastStressMax[r] > coastStressMax[nr]) {
                    coastStressMax[nr] = coastStressMax[r];
                    coastSubductMax[nr] = coastSubductMax[r];
                    coastConvergent[nr] = coastConvergent[r];
                }
            }
        }

        const cNoise  = new SimplexNoise(seed + 77);
        const cNoise2 = new SimplexNoise(seed + 133);
        const cNoise3 = new SimplexNoise(seed + 211);

        for (let r = 0; r < numRegions; r++) {
            if (dBdry[r] > maxCD) continue;
            const x = r_xyz[3*r], y = r_xyz[3*r+1], z = r_xyz[3*r+2];
            const t = dBdry[r] / maxCD;

            const sn = Math.max(coastStressMax[r], r_stress[r] / maxStress);

            const isSubductingOcean = r_isOcean[r]
                && coastConvergent[r]
                && coastSubductMax[r] > 0.45;
            const subSup = isSubductingOcean
                ? Math.min(1, (coastSubductMax[r] - 0.45) / 0.55)
                : 0;

            // Layer 1: Coastal fractal noise
            const falloff1 = (1 - t) * (1 - t);
            const stressAmp1 = 1 + sn * 5;
            let n1 = cNoise.fbm(x * 18 + 3.7, y * 18 + 7.1, z * 18 + 2.3, 5, 0.55);
            let coastNoise1 = n1 * 0.12 * falloff1 * stressAmp1;
            if (subSup > 0 && coastNoise1 > 0) {
                coastNoise1 *= (1 - subSup);
            }
            r_elevation[r] += coastNoise1;

            // Layer 3: Coastline-aware domain warping
            const falloffW = Math.max(0, 1 - t * 1.5);
            if (falloffW > 0) {
                const warpAmt = 0.35 * falloffW * (1 + sn * 2);
                const dwx = cNoise3.fbm(x * 6 + 11.3, y * 6 + 4.7, z * 6 + 8.2, 3, 0.6) * warpAmt;
                const dwy = cNoise3.fbm(x * 6 + 2.9,  y * 6 + 9.4, z * 6 + 1.6, 3, 0.6) * warpAmt;
                const dwz = cNoise3.fbm(x * 6 + 7.5,  y * 6 + 0.3, z * 6 + 5.9, 3, 0.6) * warpAmt;
                const origN = noise.fbm(x, y, z) * noiseMag;
                const warpN = noise.fbm(x + dwx, y + dwy, z + dwz) * noiseMag;
                let warpDelta = (warpN - origN) * falloffW;
                if (subSup > 0 && warpDelta > 0) {
                    warpDelta *= (1 - subSup);
                }
                r_elevation[r] += warpDelta;
            }

            // Layer 2: Island scattering
            if (r_isOcean[r] && dBdry[r] > 0
                && dBdry[r] <= Math.max(4, Math.round(4 * scaleFactor))
                && subSup < 0.3) {
                const islandN = cNoise2.fbm(x * 35 + 5.1, y * 35 + 9.3, z * 35 + 2.7, 4, 0.5);
                const threshold = 0.25 - sn * 0.2;
                if (islandN > threshold) {
                    const excess = (islandN - threshold) / (1 - threshold);
                    const distFade = 1 - (dBdry[r] / Math.max(4, Math.round(4 * scaleFactor)));
                    let bump = excess * excess * 0.18 * (1 + sn * 2) * distFade;
                    bump *= (1 - subSup / 0.3);
                    r_elevation[r] += bump;
                }
            }
        }
    }

    // Island arcs — ocean-ocean convergent boundary uplift
    {
        const arcNoise = new SimplexNoise(seed + 307);
        const maxArcDist = Math.max(5, Math.round(5 * scaleFactor));

        const arcSeeds = [];
        const arcDist = new Float32Array(numRegions);
        arcDist.fill(maxArcDist + 1);
        const arcStress = new Float32Array(numRegions);

        for (let r = 0; r < numRegions; r++) {
            if (r_boundaryType[r] === 1 && r_bothOcean[r] && r_subductFactor[r] < 0.45) {
                arcSeeds.push(r);
                arcDist[r] = 0;
                arcStress[r] = r_stress[r] / maxStress;
            }
        }

        let aq = 0;
        while (aq < arcSeeds.length) {
            const r = arcSeeds[aq++];
            const nd = arcDist[r] + 1;
            if (nd > maxArcDist) continue;
            const plate = r_plate[r];
            mesh.r_circulate_r(out_r, r);
            for (let ni = 0; ni < out_r.length; ni++) {
                const nr = out_r[ni];
                if (nd < arcDist[nr] && r_plate[nr] === plate && r_isOcean[nr]) {
                    arcDist[nr] = nd;
                    arcStress[nr] = arcStress[r];
                    arcSeeds.push(nr);
                }
            }
        }

        for (let r = 0; r < numRegions; r++) {
            const d = arcDist[r];
            if (d < 1 || d > maxArcDist) continue;

            const x = r_xyz[3*r], y = r_xyz[3*r+1], z = r_xyz[3*r+2];

            const peakDist = Math.max(1.5, 1.5 * scaleFactor);
            const sigma = Math.max(1.5, 1.5 * scaleFactor);
            const distWeight = Math.exp(-0.5 * ((d - peakDist) / sigma) ** 2);

            const n = arcNoise.ridgedFbm(x * 4, y * 4, z * 4, 4, 2.0, 0.5, 1.0);
            const threshold = 0.30;
            if (n > threshold) {
                const excess = (n - threshold) / (1 - threshold);
                const uplift = excess * excess * 0.55 * distWeight * (0.5 + arcStress[r]);
                r_elevation[r] += uplift;
            }
        }
    }

    return { r_elevation, mountain_r, coastline_r, ocean_r, r_stress };
}
