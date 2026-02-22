// Elevation pipeline: collision detection, stress propagation,
// distance fields, and final elevation assignment.

import { makeRandInt, makeRng } from './rng.js';
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
    const _timing = [];
    let _t0 = performance.now();

    // Debug layers — track each component's contribution
    const dl_base     = new Float32Array(numRegions);
    const dl_tectonic = new Float32Array(numRegions);
    const dl_noise    = new Float32Array(numRegions);
    const dl_interior = new Float32Array(numRegions);
    const dl_coastal  = new Float32Array(numRegions);
    const dl_ocean    = new Float32Array(numRegions);
    const dl_hotspot  = new Float32Array(numRegions);
    const dl_tecActivity = new Float32Array(numRegions);
    const dl_margins = new Float32Array(numRegions);
    const dl_backArc = new Float32Array(numRegions);

    const { mountain_r, coastline_r, ocean_r, r_stress, r_subductFactor, r_boundaryType, r_bothOcean, r_hasOcean } =
        findCollisions(mesh, r_xyz, plateIsOcean, r_plate, plateVec, plateDensity, noise);
    _timing.push({ stage: 'Collisions', ms: performance.now() - _t0 }); _t0 = performance.now();

    // Propagate stress inward
    const scaleFactor = Math.sqrt(numRegions / 10000);
    const baseDecay = 0.5 + spread * 0.04;
    const decayFactor = Math.pow(baseDecay, 1 / scaleFactor);
    const subductBaseDecay = baseDecay * 0.45;
    const subductDecayFactor = Math.pow(subductBaseDecay, 1 / scaleFactor);
    const numPasses = Math.max(1, Math.round(spread * 3 * scaleFactor));
    propagateStress(mesh, r_stress, r_subductFactor, r_plate, plateIsOcean, decayFactor, subductDecayFactor, numPasses);
    _timing.push({ stage: 'Stress propagation', ms: performance.now() - _t0 }); _t0 = performance.now();

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

    // Land-only coast distance: seeds are land cells adjacent to ocean,
    // propagates only through land (ocean cells are barriers).
    const landCoastSeeds = new Set();
    for (let r = 0; r < numRegions; r++) {
        if (r_isOcean[r]) continue;
        mesh.r_circulate_r(out_r, r);
        for (let ni = 0; ni < out_r.length; ni++) {
            if (r_isOcean[out_r[ni]]) { landCoastSeeds.add(r); break; }
        }
    }
    const oceanBarriers = new Set();
    for (let r = 0; r < numRegions; r++) {
        if (r_isOcean[r]) oceanBarriers.add(r);
    }
    const dist_coast_land = assignDistanceField(mesh, landCoastSeeds, oceanBarriers, seed + 5);
    _timing.push({ stage: 'Distance fields (6x BFS)', ms: performance.now() - _t0 }); _t0 = performance.now();

    // Fixed band width for interior uplift (in BFS cells), scaled by resolution.
    // Tune INTERIOR_BAND_BASE to control how many cells deep the transition is.
    const INTERIOR_BAND_BASE = 16;
    const interiorBand = Math.max(4, Math.round(INTERIOR_BAND_BASE * scaleFactor));

    // How far mountain-building collisions influence interior uplift (BFS cells).
    // Uses dist_mountain (already computed from stress_mountain_r seeds, blocked by ocean).
    // Only major convergent boundaries drive plateau formation, not every minor boundary.
    const TECTONIC_REACH_BASE = 20;
    const tectonicReach = Math.max(6, Math.round(TECTONIC_REACH_BASE * scaleFactor));

    let maxStress = 0;
    for (let r = 0; r < numRegions; r++) {
        if (r_stress[r] > maxStress) maxStress = r_stress[r];
    }
    if (maxStress < 0.01) maxStress = 1;

    const eps = 1e-3;
    const warpScale = 0.4;
    const warpOctaves = numRegions > 200000 ? 2 : 3;

    // Plateau zone: overriding-side cells beyond this distance from mountain front
    const plateauStart = Math.max(2, Math.round(3 * scaleFactor));

    // ---- Coast-boundary BFS (hoisted for use by ocean floor + coastal roughening) ----
    // Identifies each cell's nearest coastline boundary and propagates boundary type info.
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
    {
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
    }

    // ---- Rift BFS (structured graben profile for divergent continent-continent boundaries) ----
    const RIFT_HALF_WIDTH_BASE = 4;
    const riftHalfWidth = Math.max(2, Math.round(RIFT_HALF_WIDTH_BASE * scaleFactor));
    const riftDist = new Float32Array(numRegions);
    riftDist.fill(Infinity);
    const riftSeeds = [];
    for (let r = 0; r < numRegions; r++) {
        if (r_boundaryType[r] === 2 && !r_hasOcean[r]) {
            riftSeeds.push(r);
            riftDist[r] = 0;
        }
    }
    {
        let qi = 0;
        while (qi < riftSeeds.length) {
            const r = riftSeeds[qi++];
            const nd = riftDist[r] + 1;
            if (nd > riftHalfWidth) continue;
            const plate = r_plate[r];
            mesh.r_circulate_r(out_r, r);
            for (let ni = 0; ni < out_r.length; ni++) {
                const nr = out_r[ni];
                if (nd < riftDist[nr] && r_plate[nr] === plate && !r_isOcean[nr]) {
                    riftDist[nr] = nd;
                    riftSeeds.push(nr);
                }
            }
        }
    }
    const riftNoise = new SimplexNoise(seed + 419);
    _timing.push({ stage: 'Coast boundary + rift BFS', ms: performance.now() - _t0 }); _t0 = performance.now();

    // ---- Mid-ocean ridge BFS (wider ridge feature from divergent ocean-ocean boundaries) ----
    const RIDGE_HALF_WIDTH_BASE = 4;
    const ridgeHalfWidth = Math.max(2, Math.round(RIDGE_HALF_WIDTH_BASE * scaleFactor));
    const ridgeDist = new Float32Array(numRegions);
    ridgeDist.fill(Infinity);
    const ridgeSeeds = [];
    for (let r = 0; r < numRegions; r++) {
        if (r_boundaryType[r] === 2 && r_bothOcean[r]) {
            ridgeSeeds.push(r);
            ridgeDist[r] = 0;
        }
    }
    {
        let qi = 0;
        while (qi < ridgeSeeds.length) {
            const r = ridgeSeeds[qi++];
            const nd = ridgeDist[r] + 1;
            if (nd > ridgeHalfWidth) continue;
            mesh.r_circulate_r(out_r, r);
            for (let ni = 0; ni < out_r.length; ni++) {
                const nr = out_r[ni];
                if (nd < ridgeDist[nr] && r_isOcean[nr]) {
                    ridgeDist[nr] = nd;
                    ridgeSeeds.push(nr);
                }
            }
        }
    }

    // ---- Oceanic fracture zone BFS (transform ocean-ocean boundaries) ----
    const FRACTURE_HALF_WIDTH_BASE = 3;
    const fractureHalfWidth = Math.max(2, Math.round(FRACTURE_HALF_WIDTH_BASE * scaleFactor));
    const fractureDist = new Float32Array(numRegions);
    fractureDist.fill(Infinity);
    const fractureSeeds = [];
    for (let r = 0; r < numRegions; r++) {
        if (r_boundaryType[r] === 3 && r_bothOcean[r]) {
            fractureSeeds.push(r);
            fractureDist[r] = 0;
        }
    }
    {
        let qi = 0;
        while (qi < fractureSeeds.length) {
            const r = fractureSeeds[qi++];
            const nd = fractureDist[r] + 1;
            if (nd > fractureHalfWidth) continue;
            mesh.r_circulate_r(out_r, r);
            for (let ni = 0; ni < out_r.length; ni++) {
                const nr = out_r[ni];
                if (nd < fractureDist[nr] && r_isOcean[nr]) {
                    fractureDist[nr] = nd;
                    fractureSeeds.push(nr);
                }
            }
        }
    }

    // ---- Back-arc basin BFS (depression behind subduction zones) ----
    // Seeds: overriding side of any convergent boundary involving ocean.
    // Excludes continent-continent collisions (r_hasOcean === 0).
    const baStart = Math.max(1, Math.round(2 * scaleFactor));
    const baPeak = Math.max(2, Math.round(3 * scaleFactor));
    const baEnd = Math.max(3, Math.round(5 * scaleFactor));
    const backArcDist = new Float32Array(numRegions);
    backArcDist.fill(Infinity);
    const backArcStress = new Float32Array(numRegions);
    const backArcSeeds = [];
    for (let r = 0; r < numRegions; r++) {
        if (r_boundaryType[r] === 1 && r_hasOcean[r] && r_subductFactor[r] < 0.50) {
            backArcSeeds.push(r);
            backArcDist[r] = 0;
            backArcStress[r] = r_stress[r] / maxStress;
        }
    }
    {
        let qi = 0;
        while (qi < backArcSeeds.length) {
            const r = backArcSeeds[qi++];
            const nd = backArcDist[r] + 1;
            if (nd > baEnd) continue;
            const plate = r_plate[r];
            mesh.r_circulate_r(out_r, r);
            for (let ni = 0; ni < out_r.length; ni++) {
                const nr = out_r[ni];
                if (nd < backArcDist[nr] && r_plate[nr] === plate) {
                    backArcDist[nr] = nd;
                    backArcStress[nr] = backArcStress[r];
                    backArcSeeds.push(nr);
                }
            }
        }
    }

    _timing.push({ stage: 'Ridge/fracture/back-arc BFS', ms: performance.now() - _t0 }); _t0 = performance.now();

    for (let r = 0; r < numRegions; r++) {
        const isOceanPlate = r_isOcean[r];

        // Asymmetric mountain profiles: shift ridge peak toward subducting side.
        // sf > 0.5 (subducting): inflated distance → lower base → steeper drop-off
        // sf < 0.5 (overriding): compressed distance → higher base → gentler slope
        // sf = 0.5 (neutral / far from boundary): no effect
        const sfAsym = r_subductFactor[r];
        const asymmetry = 1.0 + (sfAsym - 0.5) * 0.8;
        const a = dist_mountain[r] * asymmetry + eps;
        const b = dist_ocean[r]     + eps;
        const c = dist_coastline[r] + eps;
        const BASE_SCALE = 0.6;
        if (a === Infinity && b === Infinity) {
            r_elevation[r] = 0.1 * BASE_SCALE;
        } else {
            r_elevation[r] = (1/a - 1/b) / (1/a + 1/b + 1/c) * BASE_SCALE;
        }
        dl_base[r] = r_elevation[r];

        const stressNorm = r_stress[r] / maxStress;
        const btype = r_boundaryType[r];

        const x = r_xyz[3*r], y = r_xyz[3*r+1], z = r_xyz[3*r+2];
        const wx = x + warpScale * noise.fbm(x + 5.3, y + 1.7, z + 3.1, warpOctaves);
        const wy = y + warpScale * noise.fbm(x + 8.1, y + 2.9, z + 7.3, warpOctaves);
        const wz = z + warpScale * noise.fbm(x + 1.4, y + 6.2, z + 4.8, warpOctaves);

        if (!isOceanPlate) {
            const sf = r_subductFactor[r];
            const elevBefore = r_elevation[r];

            if (sf > 0.5 && r_elevation[r] > 0) {
                const suppression = (sf - 0.5) * 2;
                r_elevation[r] *= 1 - suppression * 0.42;
            }

            if (stressNorm > 0.01) {
                const stressMag = stressNorm * stressNorm * 0.55;
                const uplift  = stressMag * (1 - sf);
                const depress = stressMag * 0.4 * sf;
                const heightVar = 0.75 + 0.5 * noise.fbm(x * 8 + 13.7, y * 8 + 9.2, z * 8 + 4.5, 3);
                r_elevation[r] += (uplift - depress) * heightVar;
            }

            if (stressNorm > 0 && stressNorm < 0.10) {
                const forelandT = stressNorm / 0.10;
                r_elevation[r] -= 0.06 * (1 - forelandT);
            }

            // Rift valley: structured graben profile replaces flat depression.
            // Uses pre-computed riftDist BFS from divergent continent-continent boundaries.
            {
                const rd = riftDist[r];
                if (rd !== Infinity) {
                    const floorEnd = Math.max(1, Math.round(1.5 * scaleFactor));
                    const shoulderEnd = Math.max(2, Math.round(2.5 * scaleFactor));
                    let riftEffect = 0;
                    if (rd <= 0.5) {
                        // Rift axis: deepest depression
                        riftEffect = -0.15;
                        // Volcanic ridged noise along axis
                        riftEffect += riftNoise.ridgedFbm(x * 8, y * 8, z * 8, 3) * 0.04;
                    } else if (rd <= floorEnd) {
                        // Rift floor: still depressed, with volcanic texture
                        const t = rd / floorEnd;
                        riftEffect = -0.12 * (1 - t * 0.3);
                        riftEffect += riftNoise.ridgedFbm(x * 8, y * 8, z * 8, 3) * 0.03 * (1 - t);
                    } else if (rd <= shoulderEnd) {
                        // Rift shoulders: modest uplift flanking the graben
                        const t = (rd - floorEnd) / (shoulderEnd - floorEnd);
                        riftEffect = 0.03 * (1 - t);
                    } else if (riftHalfWidth > shoulderEnd) {
                        // Smooth fadeout to ambient
                        const t = (rd - shoulderEnd) / (riftHalfWidth - shoulderEnd);
                        const fadeT = Math.min(1, t);
                        const fade = fadeT * fadeT * (3 - 2 * fadeT); // smoothstep
                        riftEffect = 0.03 * (1 - fade) * 0.2; // tiny residual shoulder
                    }
                    r_elevation[r] += riftEffect;
                }
            }

            // Back-arc basin: bell-shaped depression behind subduction zones.
            // Uses pre-computed backArcDist BFS from convergent boundaries with ocean involvement.
            // Suppressed when another mountain-building collision is closer than the subduction source.
            {
                const bad = backArcDist[r];
                if (bad !== Infinity && bad >= baStart) {
                    // Orogeny suppression: if dist_mountain < backArcDist, another collision is closer
                    const dMtn = dist_mountain[r];
                    const orogenyFactor = (dMtn !== Infinity && dMtn < bad)
                        ? Math.max(0, dMtn / bad)
                        : 1.0;
                    let baEffect = 0;
                    if (bad <= baPeak) {
                        const t = (bad - baStart) / Math.max(1, baPeak - baStart);
                        const s = t * t * (3 - 2 * t);
                        baEffect = -0.10 * backArcStress[r] * s * orogenyFactor;
                    } else if (bad <= baEnd) {
                        const t = (bad - baPeak) / Math.max(1, baEnd - baPeak);
                        const s = t * t * (3 - 2 * t);
                        baEffect = -0.10 * backArcStress[r] * (1 - s) * orogenyFactor;
                    }
                    r_elevation[r] += baEffect;
                    dl_backArc[r] = baEffect;
                }
            }

            dl_tectonic[r] = r_elevation[r] - elevBefore;

            // Compute tectonic activity early — used by noise, interior, and plateau sections.
            // Uses dist_mountain: distance from mountain-building collisions only.
            // Plates with no major collisions get tectonicActivity ≈ 0 (cratons).
            const dMtn = dist_mountain[r];
            const rawProximity = (dMtn === Infinity || dMtn >= tectonicReach)
                ? 0
                : (1 - dMtn / tectonicReach);
            const tectonicActivity = Math.max(stressNorm, rawProximity * rawProximity);
            dl_tecActivity[r] = tectonicActivity;

            // Plateau zone: overriding side, behind collision front, with tectonic influence
            const isPlateauZone = sf < 0.45 && dMtn !== Infinity && dMtn > plateauStart;

            const blend = Math.min(1, stressNorm * 3);
            const smoothNoise = noise.fbm(wx, wy, wz) * noiseMag;
            const ridgedNoise = noise.ridgedFbm(wx, wy, wz) * noiseMag * 1.5;
            const noiseVal = smoothNoise * (1 - blend) + ridgedNoise * blend;
            // Higher-freq detail layer: zero-mean, half strength
            const detailNoise = noise.fbm(wx * 4 + 22.1, wy * 4 + 6.8, wz * 4 + 15.4, 4, 0.5) * noiseMag * 0.5;
            // Scale noise amplitude by tectonic activity: rough near collisions, smooth in quiet interiors
            const noiseActivity = Math.min(1, stressNorm * 4);
            // Plateau flatness: additionally suppress noise on overriding side behind collisions
            const plateauSuppress = isPlateauZone
                ? Math.max(0.30, 1 - tectonicActivity * 0.60)
                : 1.0;
            const noiseScale = (0.25 + 0.75 * noiseActivity) * plateauSuppress;
            // Fine detail layer: 8x frequency, quarter strength, half-dampened.
            // Uses sqrt of noiseScale so it retains texture in quiet interiors where other noise is suppressed.
            const fineNoise = noise.fbm(wx * 8 + 41.7, wy * 8 + 13.2, wz * 8 + 27.9, 3, 0.5) * noiseMag * 0.25;
            const fineScale = Math.sqrt(noiseScale);
            const totalNoise = (noiseVal + detailNoise) * noiseScale + fineNoise * fineScale;
            r_elevation[r] += totalNoise;
            dl_noise[r] = totalNoise;

            // Continental interior uplift: tectonic-aware.
            // Collision-backed interiors (plateaus) get higher uplift than quiet cratons.
            const lcd = dist_coast_land[r];
            if (lcd < Infinity) {
                // Depression: smoothstep over full band (0 → -0.08 at coast)
                const tDown = Math.min(lcd / interiorBand, 1);
                const sDown = tDown * tDown * (3 - 2 * tDown);
                // Uplift: reaches plateau much sooner (40% of band)
                const tUp = Math.min(lcd / (interiorBand * 0.4), 1);
                const sUp = tUp * tUp * (3 - 2 * tUp);
                // Tectonic-modulated uplift: +0.06 (quiet craton) to +0.22 (collision plateau)
                const INTERIOR_BASE = 0.06;
                const INTERIOR_TECTONIC = 0.16;
                const interiorUplift = INTERIOR_BASE + tectonicActivity * INTERIOR_TECTONIC;
                const baseBias = -0.08 * (1 - sDown) + interiorUplift * sUp;
                // Low-freq noise modulation: 80%–120% of bias
                const mod = 1.0 + 0.2 * noise.fbm(x * 2 + 19.3, y * 2 + 7.6, z * 2 + 13.1, 2);
                const bias = baseBias * mod;
                r_elevation[r] += bias;
                dl_interior[r] = bias;
            }

            // Plateau uplift boost: modest extra elevation on overriding side behind collisions
            if (isPlateauZone && tectonicActivity > 0.1) {
                const plateauBoost = 0.025 * tectonicActivity * (1 - sf);
                r_elevation[r] += plateauBoost;
                dl_interior[r] += plateauBoost;
            }

        } else {
            const dc = dist_coast[r];
            // Ocean floor profile: deeper than original to survive coastal roughening.
            // Fixed breakpoints (5/12) — margin differentiation handled by coastal roughening character.
            let oceanBase;
            if (dc < 5) {
                oceanBase = -0.04 - 0.06 * (dc / 5);
            } else if (dc < 12) {
                oceanBase = -0.10 - 0.25 * ((dc - 5) / 7);
            } else {
                oceanBase = -0.35 + noise.fbm(x * 2, y * 2, z * 2, 3) * 0.03;
            }

            r_elevation[r] = Math.min(r_elevation[r], oceanBase);
            dl_ocean[r] = r_elevation[r];

            // Margins debug: encode margin type + features
            // 0.2=passive, 0.8=active, boosted by ridge/fracture presence
            const isActiveMargin = coastConvergent[r] === 1;
            dl_margins[r] = isActiveMargin ? 0.8 : 0.2;
            if (ridgeDist[r] !== Infinity && ridgeDist[r] <= ridgeHalfWidth) dl_margins[r] = 1.0;
            if (fractureDist[r] !== Infinity && fractureDist[r] <= fractureHalfWidth) dl_margins[r] = -0.5;

            const elevBeforeOcTec = r_elevation[r];

            // Mid-ocean ridge: wider feature with quadratic falloff from divergent boundary
            const rd = ridgeDist[r];
            if (rd !== Infinity && rd <= ridgeHalfWidth) {
                const t = rd / ridgeHalfWidth;
                const ridgeFade = (1 - t) * (1 - t);
                const ridgeNoise = noise.ridgedFbm(x * 3, y * 3, z * 3, 4);
                const ridgeUplift = (0.12 * ridgeNoise + 0.06) * ridgeFade;
                r_elevation[r] += ridgeUplift;
            }

            // Oceanic fracture zones: linear depressions at transform boundaries
            const fd = fractureDist[r];
            if (fd !== Infinity && fd <= fractureHalfWidth) {
                const ft = fd / fractureHalfWidth;
                const fractureFade = 1 - ft;
                r_elevation[r] -= 0.03 * fractureFade;
            }

            // Trenches at convergent boundaries
            if (btype === 1) {
                r_elevation[r] -= 0.15 + 0.15 * stressNorm;
            }

            // Back-arc basin: deepen ocean floor behind subduction zones
            {
                const bad = backArcDist[r];
                if (bad !== Infinity && bad >= baStart) {
                    const dMtn = dist_mountain[r];
                    const orogenyFactor = (dMtn !== Infinity && dMtn < bad)
                        ? Math.max(0, dMtn / bad)
                        : 1.0;
                    let baEffect = 0;
                    if (bad <= baPeak) {
                        const t = (bad - baStart) / Math.max(1, baPeak - baStart);
                        const s = t * t * (3 - 2 * t);
                        baEffect = -0.10 * backArcStress[r] * s * orogenyFactor;
                    } else if (bad <= baEnd) {
                        const t = (bad - baPeak) / Math.max(1, baEnd - baPeak);
                        const s = t * t * (3 - 2 * t);
                        baEffect = -0.10 * backArcStress[r] * (1 - s) * orogenyFactor;
                    }
                    r_elevation[r] += baEffect;
                    dl_backArc[r] = baEffect;
                }
            }

            dl_tectonic[r] = r_elevation[r] - elevBeforeOcTec;

            const oceanNoise = noise.fbm(wx, wy, wz) * noiseMag * 0.3;
            r_elevation[r] += oceanNoise;
            dl_noise[r] = oceanNoise;
        }
    }

    _timing.push({ stage: 'Main elevation loop (land+ocean)', ms: performance.now() - _t0 }); _t0 = performance.now();

    // Coastal roughening (uses hoisted coastBdry BFS data: dBdry, coastStressMax, etc.)
    {
        const coastRoughenDist = Math.max(8, Math.round(8 * scaleFactor));
        const cNoise  = new SimplexNoise(seed + 77);
        const cNoise2 = new SimplexNoise(seed + 133);
        const cNoise3 = new SimplexNoise(seed + 211);

        for (let r = 0; r < numRegions; r++) {
            if (dBdry[r] > coastRoughenDist) continue;
            const x = r_xyz[3*r], y = r_xyz[3*r+1], z = r_xyz[3*r+2];
            const t = dBdry[r] / coastRoughenDist;

            const sn = Math.max(coastStressMax[r], r_stress[r] / maxStress);

            const isSubductingOcean = r_isOcean[r]
                && coastConvergent[r]
                && coastSubductMax[r] > 0.45;
            const subSup = isSubductingOcean
                ? Math.min(1, (coastSubductMax[r] - 0.45) / 0.55)
                : 0;

            const elevBeforeCoast = r_elevation[r];
            const isPassiveCoast = !coastConvergent[r];

            // Layer 1: Coastal fractal noise
            // Passive: lower freq + amp → broad bays, gentle peninsulas
            // Active: higher freq + amp → rugged, fjord-like
            const falloff1 = (1 - t) * (1 - t);
            const stressAmp1 = 1 + sn * 5;
            const coastFreq = isPassiveCoast ? 12 : 18;
            const coastAmp = isPassiveCoast ? 0.08 : 0.12;
            let n1 = cNoise.fbm(x * coastFreq + 3.7, y * coastFreq + 7.1, z * coastFreq + 2.3, 5, 0.55);
            let coastNoise1 = n1 * coastAmp * falloff1 * stressAmp1;
            if (subSup > 0 && coastNoise1 > 0) {
                coastNoise1 *= (1 - subSup);
            }
            r_elevation[r] += coastNoise1;

            // Layer 3: Coastline-aware domain warping
            // Passive: wider influence (warp dies slower). Active: concentrated near coast.
            const warpReach = isPassiveCoast ? 1.2 : 1.5;
            const falloffW = Math.max(0, 1 - t * warpReach);
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

            // Layer 2: Island scattering (original behavior — kept conservative to avoid false land)
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

            dl_coastal[r] += r_elevation[r] - elevBeforeCoast;
        }
    }

    _timing.push({ stage: 'Coastal roughening', ms: performance.now() - _t0 }); _t0 = performance.now();

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
                dl_coastal[r] += uplift;
            }
        }
    }

    _timing.push({ stage: 'Island arcs', ms: performance.now() - _t0 }); _t0 = performance.now();

    // Hotspot volcanism — mantle plumes with drift chains
    {
        const NUM_HOTSPOTS = 5;
        const CHAIN_LENGTH = 6;        // base, varies ±2
        const CHAIN_DECAY  = 0.75;     // base, varies ±0.08
        const CHAIN_SPACING = 0.06;    // base radians, varies ±30%
        const DOME_SIGMA   = 0.01;     // base dome radius, varies ±30%
        const DOME_STRENGTH = 0.50;    // base, varies ±20%

        const hsRng = makeRng(seed + 999);
        const hsNoise = new SimplexNoise(seed + 501);

        // Build list of all dome sources: active hotspots + ghost chain points
        const domes = []; // { x, y, z, strength, sigma }

        const hsRandInt = makeRandInt(seed + 1001);
        for (let h = 0; h < NUM_HOTSPOTS; h++) {
            // Per-hotspot variation (wide ranges)
            const hStrength = DOME_STRENGTH * (0.4 + hsRng() * 1.2);
            const hSigma    = DOME_SIGMA * (0.4 + hsRng() * 1.2);
            const hDecay    = CHAIN_DECAY + (hsRng() - 0.5) * 0.35;
            const hLength   = Math.max(2, CHAIN_LENGTH + Math.round((hsRng() - 0.5) * 10));

            // Pick a random region as hotspot center
            const centerR = hsRandInt(numRegions);
            const hx = r_xyz[3*centerR], hy = r_xyz[3*centerR+1], hz = r_xyz[3*centerR+2];
            const plate = r_plate[centerR];
            const drift = plateVec[plate];
            if (!drift) continue;

            // Ocean hotspots are stronger so they punch through the ocean floor
            const isOceanHotspot = plateIsOcean.has(plate);
            const oceanBoost = isOceanHotspot ? 1.8 : 1.0;

            // Active hotspot dome
            domes.push({ x: hx, y: hy, z: hz, strength: hStrength * oceanBoost, sigma: hSigma });

            // Chain: trail in direction opposite to plate drift (great-circle steps)
            // Compute a perpendicular vector for trajectory wobble
            const pdot = drift[1] * hx - drift[0] * hy;
            let perpX = drift[1] * hz - drift[2] * hy;
            let perpY = drift[2] * hx - drift[0] * hz;
            let perpZ = drift[0] * hy - drift[1] * hx;
            const perpLen = Math.sqrt(perpX*perpX + perpY*perpY + perpZ*perpZ) || 1;
            perpX /= perpLen; perpY /= perpLen; perpZ /= perpLen;

            let cx = hx, cy = hy, cz = hz;
            let str = hStrength * oceanBoost;
            for (let c = 0; c < hLength; c++) {
                str *= hDecay;
                // Per-step variation (wide ranges)
                str *= (0.7 + hsRng() * 0.6);  // extra per-step strength jitter
                const stepSpacing = CHAIN_SPACING * (0.3 + hsRng() * 1.4);
                const stepSigma   = hSigma * (0.5 + hsRng() * 1.0);
                // Wobble: deflect direction by a random angle off the main drift
                const wobble = (hsRng() - 0.5) * 0.8; // ±0.4 radians off-axis
                const dx = -drift[0] + perpX * wobble;
                const dy = -drift[1] + perpY * wobble;
                const dz = -drift[2] + perpZ * wobble;
                // Project onto tangent plane at current point
                const dot = dx * cx + dy * cy + dz * cz;
                let tx = dx - dot * cx, ty = dy - dot * cy, tz = dz - dot * cz;
                const tLen = Math.sqrt(tx*tx + ty*ty + tz*tz);
                if (tLen < 1e-6) break;
                tx /= tLen; ty /= tLen; tz /= tLen;
                // Rotate point along great circle
                const cosA = Math.cos(stepSpacing);
                const sinA = Math.sin(stepSpacing);
                cx = cx * cosA + tx * sinA;
                cy = cy * cosA + ty * sinA;
                cz = cz * cosA + tz * sinA;
                const nLen = Math.sqrt(cx*cx + cy*cy + cz*cz);
                cx /= nLen; cy /= nLen; cz /= nLen;
                domes.push({ x: cx, y: cy, z: cz, strength: str, sigma: stepSigma });
            }
        }

        // Pre-compute per-dome constants for the inner loop:
        // - cosThresh: cosine-domain early exit (replaces Math.acos + comparison)
        // - invS2: Gaussian exponent factor (avoids division in inner loop)
        for (let d = 0; d < domes.length; d++) {
            const dm = domes[d];
            dm.cosThresh = Math.cos(dm.sigma * 5);
            dm.invS2 = -0.5 / (dm.sigma * dm.sigma);
        }

        // Apply dome uplift to all cells
        for (let r = 0; r < numRegions; r++) {
            const rx = r_xyz[3*r], ry = r_xyz[3*r+1], rz = r_xyz[3*r+2];

            // Quick check: is this region near ANY dome? (cosine domain, no trig)
            // Skips the expensive shapeWarp noise for the ~99% of regions far from all domes.
            let near = false;
            for (let d = 0; d < domes.length; d++) {
                if (domes[d].x * rx + domes[d].y * ry + domes[d].z * rz > domes[d].cosThresh) {
                    near = true; break;
                }
            }
            if (!near) continue;

            // Shape warp: distort dome radius so edges aren't perfect circles
            const shapeWarp = 1.0 + 0.3 * hsNoise.fbm(rx * 25 + 3.2, ry * 25 + 7.8, rz * 25 + 1.5, 2);
            const shapeWarpSq = shapeWarp * shapeWarp;
            let totalUplift = 0;
            for (let d = 0; d < domes.length; d++) {
                const dm = domes[d];
                const dot = dm.x * rx + dm.y * ry + dm.z * rz;
                if (dot < dm.cosThresh) continue;
                // Small-angle approximation: angle² ≈ 2(1 - dot).
                // Valid here because sigma*5 ≈ 0.05 rad; error < 0.1% in this range.
                const angleSq = 2 * (1 - dot);
                const gauss = Math.exp(angleSq * shapeWarpSq * dm.invS2);
                totalUplift += dm.strength * gauss;
            }
            if (totalUplift > 0.001) {
                // Modulate with ridged noise for volcanic texture
                const volc = 0.6 + 0.4 * hsNoise.ridgedFbm(rx * 6, ry * 6, rz * 6, 3);
                const uplift = totalUplift * volc;
                r_elevation[r] += uplift;
                dl_hotspot[r] = uplift;
            }
        }
    }

    _timing.push({ stage: 'Hotspot volcanism', ms: performance.now() - _t0 }); _t0 = performance.now();

    // Compress positive elevations to soften tall peaks
    for (let r = 0; r < numRegions; r++) {
        if (r_elevation[r] > 0) {
            r_elevation[r] = Math.pow(r_elevation[r], 0.9);
        }
    }

    _timing.push({ stage: 'Peak compression', ms: performance.now() - _t0 });

    const debugLayers = { base: dl_base, tectonic: dl_tectonic, noise: dl_noise, interior: dl_interior, coastal: dl_coastal, ocean: dl_ocean, hotspot: dl_hotspot, tecActivity: dl_tecActivity, margins: dl_margins, backArc: dl_backArc };
    return { r_elevation, mountain_r, coastline_r, ocean_r, r_stress, debugLayers, _timing };
}
