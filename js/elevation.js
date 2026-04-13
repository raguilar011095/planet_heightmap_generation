// Elevation pipeline: collision detection, stress propagation,
// distance fields, and final elevation assignment.

import { makeRandInt, makeRng } from './rng.js';
import { SimplexNoise } from './simplex-noise.js';
import {
    COLLISION_THRESHOLD, COLLISION_DT_BASE, COLLISION_DT_REF_REGIONS,
    PAIR_INTENSITY_BASE, SUBDUCT_UNDULATION_DENSITY_DECAY, SUBDUCT_UNDULATION_FREQ,
    SUBDUCT_UNDULATION_AMP, SUBDUCT_FACTOR_BASE, SUBDUCT_FACTOR_TANH_SCALE,
    SUBDUCT_THRESHOLD, BOUNDARY_TYPE_THRESH_FACTOR,
    STRESS_PROPAGATE_MIN, STRESS_PROPAGATE_CUTOFF,
    STRESS_DIR_FACTOR_MIN, STRESS_DIR_FACTOR_BASE, STRESS_DIR_FACTOR_SCALE,
    STRESS_DIR_BLEND_PARENT, STRESS_DIR_BLEND_TRAVEL,
    STRESS_DIR_SMOOTH_PASSES, STRESS_DIR_SELF_WEIGHT,
    STRESS_DECAY_BASE, STRESS_DECAY_SPREAD_FACTOR, STRESS_SUBDUCT_DECAY_MULT,
    STRESS_PASSES_PER_SPREAD, STRESS_PERCENTILE,
    SMALL_W, SUPER_W,
    INTERIOR_BAND_BASE, TECTONIC_REACH_BASE, COASTAL_PLAIN_WIDTH_BASE, COAST_BFS_WIDTH_BASE,
    RIDGE_STRENGTH, RIDGE_SIGMA_BASE as RIDGE_SIGMA_BASE_CFG,
    RIDGE_PEAK_SHIFT_BASE, RIDGE_EXTENT_BASE,
    RIDGE_ASYM_SUBDUCT_NARROW, RIDGE_ASYM_OVERRIDE_WIDEN,
    RIDGE_STRESS_WIDTH_BASE, RIDGE_STRESS_WIDTH_SCALE, RIDGE_WIDTH_NOISE_AMP,
    RIDGE_HEIGHT_VAR_BASE, RIDGE_HEIGHT_VAR_SCALE, RIDGE_HEIGHT_VAR_FREQ,
    BASE_SCALE, ASYMMETRY_FACTOR,
    SUBDUCTING_SUPPRESSION, STRESS_MAG_SCALE, STRESS_DEPRESS_FRAC,
    STRESS_HEIGHT_VAR_BASE, STRESS_HEIGHT_VAR_SCALE,
    SUBDUCTING_REACH_MIN, SUBDUCTING_REACH_RANGE,
    FOLD_FREQ_PRIMARY, FOLD_FREQ_SECONDARY, FOLD_MEAN_OFFSET,
    FOLD_PHASE_WARP_AMP, FOLD_PHASE_WARP2_AMP,
    FOLD_AMP_MOD_BASE, FOLD_AMP_MOD_SCALE, FOLD_AMP_MOD2_BASE, FOLD_AMP_MOD2_SCALE,
    FOLD_SECONDARY_ALONG, FOLD_SECONDARY_CROSS, FOLD_SECONDARY_AMP,
    FOLD_NOISE_MAG_SCALE, FOLD_ELEV_THRESHOLD, FOLD_ELEV_SCALE,
    FOLD_ELEV_BOOST_OFFSET, FOLD_ELEV_BOOST_SCALE, FOLD_SF_SUPPRESS,
    FOLD_FREQ_MULT_SCALE,
    RIFT_HALF_WIDTH_BASE, RIFT_FLOOR_MULT, RIFT_SHOULDER_MULT,
    RIFT_AXIS_DEPTH, RIFT_AXIS_VOLCANIC_AMP,
    RIFT_FLOOR_DEPTH, RIFT_FLOOR_TAPER, RIFT_FLOOR_VOLCANIC_AMP,
    RIFT_SHOULDER_UPLIFT, RIFT_FADEOUT_RESIDUAL,
    BASIN_FREQ, BASIN_FACTOR_BIAS, BASIN_FACTOR_SCALE,
    FORELAND_STRESS_THRESH, FORELAND_WIDTH_FRAC, FORELAND_BASIN_DEPTH, FORELAND_PEAK_POS,
    FORELAND_BASIN_DEEPENING_BASE, FORELAND_BASIN_DEEPENING_SCALE,
    BACK_ARC_START_BASE, BACK_ARC_PEAK_BASE, BACK_ARC_END_BASE,
    BACK_ARC_DEPTH, BACK_ARC_SUBDUCT_THRESH,
    WARP_SCALE, OROGENIC_FREQ,
    NOISE_ACTIVITY_SCALE, NOISE_BASE_SCALE, NOISE_ACTIVITY_CONTRIB,
    PLATEAU_SUPPRESS_MIN, PLATEAU_SUPPRESS_SCALE,
    BASIN_AMP_SUPPRESS, CRATON_AMP_SUPPRESS,
    RIDGED_NOISE_AMP, DETAIL_NOISE_FREQ_MULT, DETAIL_NOISE_AMP,
    FINE_NOISE_FREQ_MULT, FINE_NOISE_AMP, OCEAN_NOISE_AMP,
    DISSECT_THRESHOLD as DISSECT_THRESHOLD_CFG, DISSECT_AMP, DISSECT_ELEV_SCALE,
    SUMMIT_THRESHOLD as SUMMIT_THRESHOLD_CFG, SUMMIT_STRESS_MIN, SUMMIT_SPIKE_OFFSET,
    SUMMIT_STRESS_FLOOR,
    PLATE_BASE_HEIGHT_MEAN, PLATE_BASE_HEIGHT_STDDEV,
    INTERIOR_BASE_SHIELD, INTERIOR_BASE_BASIN, INTERIOR_TECTONIC,
    COASTAL_DEPRESSION, COASTAL_DEPRESSION_BASIN_REDUCE,
    INTERIOR_UPLIFT_RAMP_FRAC, INTERIOR_UPLIFT_MOD_AMP, INTERIOR_FLOOR, PLATEAU_BOOST,
    PLATEAU_START_BASE, MOUNTAIN_BOOST_FRAC,
    FOLD_BELT_MULT, CRATON_TECTONIC_MULT, BASIN_TECTONIC_MULT,
    SHELF_NARROW_BASE, SHELF_WIDE_BASE, SLOPE_WIDTH_BASE,
    SHELF_DEPTH_START, SHELF_DEPTH_RANGE, SLOPE_DEPTH_RANGE,
    ABYSS_BASE, ABYSS_NOISE_AMP, OCEAN_FLOOR_CLAMP,
    RIDGE_HALF_WIDTH_BASE as RIDGE_HW_BASE, RIDGE_UPLIFT_NOISE, RIDGE_UPLIFT_BASE,
    FRACTURE_HALF_WIDTH_BASE, FRACTURE_DEPTH,
    TRENCH_BASE_DEPTH, TRENCH_STRESS_DEPTH,
    COAST_ROUGHEN_BASE, COAST_PASSIVE_FREQ, COAST_ACTIVE_FREQ,
    COAST_PASSIVE_AMP, COAST_ACTIVE_AMP,
    COAST_WARP_PASSIVE_REACH, COAST_WARP_ACTIVE_REACH, COAST_WARP_AMT,
    COAST_SUBDUCT_SUP_LOW, COAST_SUBDUCT_SUP_RANGE,
    ISLAND_DIST_BASE, ISLAND_FREQ, ISLAND_THRESHOLD_BASE, ISLAND_THRESHOLD_STRESS,
    ISLAND_BUMP_AMP, ISLAND_PEAK_FLOOR, ISLAND_SUBDUCT_MAX, MAX_OCEAN_ARC_ELEV,
    ARC_DIST_BASE, ARC_PEAK_DIST_BASE, ARC_SIGMA_BASE_VAL, ARC_THRESHOLD,
    ARC_UPLIFT_AMP, ARC_SUBDUCT_THRESH,
    VOLC_MIN_SPACING, VOLC_SIGMA_BASE, VOLC_HEIGHT_BASE,
    VOLC_HEIGHT_VAR_BASE, VOLC_HEIGHT_VAR_RANGE,
    VOLC_SIGMA_VAR_BASE, VOLC_SIGMA_VAR_RANGE, VOLC_SUBDUCT_THRESH,
    LIP_SIGMA, LIP_HEIGHT, LIP_UPWELLING_THRESHOLD,
    LIP_LOBE_COUNT, LIP_LOBE_OFFSET, LIP_LOBE_SIGMA, LIP_LOBE_STRENGTH,
    CONT_HOTSPOT_SIGMA_MULT, CONT_HOTSPOT_STRENGTH_MULT,
    CONT_HOTSPOT_CALDERA_SIGMA_FRAC, CONT_HOTSPOT_CALDERA_DEPTH_FRAC,
    CONT_HOTSPOT_SWELL_MULT,
    NUM_HOTSPOTS, CHAIN_LENGTH, CHAIN_DECAY, CHAIN_SPACING,
    DOME_SIGMA, DOME_STRENGTH, SWELL_SIGMA_MULT, SWELL_STR_MULT,
    DOME_OCEAN_BOOST, DOME_PEAK_THRESH_SIGMA, DOME_SWELL_THRESH_SIGMA,
    DOME_DRIFT_STRETCH,
    DOME_SATELLITE_COUNT, DOME_SATELLITE_OFFSET, DOME_SATELLITE_SIGMA, DOME_SATELLITE_STRENGTH,
    DOME_RIFT_BOOST, DOME_CALDERA_SIGMA_FRAC,
    DOME_CALDERA_DEPTH_FRAC, DOME_CALDERA_STRENGTH_MIN,
    DOME_AGE_BROADENING, DOME_SHAPE_WARP_FREQ, DOME_SHAPE_WARP_AMP,
    DOME_SHAPE_WARP_DETAIL_FREQ, DOME_SHAPE_WARP_DETAIL_AMP,
    DOME_TEXTURE_BASE_WEIGHT, DOME_TEXTURE_DETAIL_WEIGHT,
    DOME_TEXTURE_ACTIVE_MIN, DOME_TEXTURE_ACTIVE_MAX,
    DOME_TEXTURE_AGE_MIN_SHIFT, DOME_TEXTURE_AGE_MAX_SHIFT,
    PEAK_COMPRESS_POWER, ISOSTATIC_K, HYPS_BLEND,
    HYPS_LOW_BREAK, HYPS_MID_BREAK, HYPS_LOW_ELEV_FRAC, HYPS_MID_ELEV_FRAC,
    HYPS_HIGH_POWER, FILL_LEVEL,
    PLAIN_TARGET, PLAIN_SUPPRESSION_STRENGTH,
    UNIFORM_LAND_NOISE_FREQ, UNIFORM_LAND_NOISE_OCTAVES, UNIFORM_LAND_NOISE_AMP,
    MANTLE_STRESS_BOOST, DYNAMIC_TOPO_UPLIFT, DYNAMIC_TOPO_SUBSIDENCE,
    HOTSPOT_UPWELLING_CANDIDATES, HOTSPOT_UPWELLING_JITTER,
} from './terrain-config.js';

// ----------------------------------------------------------------
//  Euler-pole velocity helper
// ----------------------------------------------------------------
export function plateVelocityAt(plateVec, plateId, x, y, z) {
    const pv = plateVec[plateId];
    const px = pv.pole[0], py = pv.pole[1], pz = pv.pole[2];
    const omega = pv.omega;
    // v = omega * cross(pole, position)
    return [
        omega * (py * z - pz * y),
        omega * (pz * x - px * z),
        omega * (px * y - py * x)
    ];
}

// ----------------------------------------------------------------
//  Collision detection
// ----------------------------------------------------------------
export function findCollisions(mesh, r_xyz, plateIsOcean, r_plate, plateVec, plateDensity, noise) {
    const dt = COLLISION_DT_BASE / Math.max(1, Math.sqrt(mesh.numRegions / COLLISION_DT_REF_REGIONS));
    const { numRegions } = mesh;
    const mountain_r  = new Set();
    const coastline_r = new Set();
    const ocean_r     = new Set();
    const r_stress    = new Float32Array(numRegions);
    const r_stressDir = new Float32Array(numRegions * 3);
    const r_subductFactor = new Float32Array(numRegions).fill(0.5);
    const r_boundaryType = new Int8Array(numRegions);
    const r_bothOcean = new Uint8Array(numRegions);
    const r_hasOcean  = new Uint8Array(numRegions);
    const { adjOffset, adjList } = mesh;

    const plateOcean = {};
    for (const pid of plateIsOcean) plateOcean[pid] = 1;

    const pairIntensityCache = new Map();
    function getPairIntensity(a, b) {
        const lo = Math.min(a, b), hi = Math.max(a, b);
        const key = lo * 1000003 + hi;
        if (pairIntensityCache.has(key)) return pairIntensityCache.get(key);
        let h = ((lo * 16807) ^ (hi * 48271)) >>> 0;
        h = (((h >> 16) ^ h) * 0x45d9f3b) >>> 0;
        const val = PAIR_INTENSITY_BASE + (h % 10001) / 10000;
        pairIntensityCache.set(key, val);
        return val;
    }

    const undulOctaves = numRegions > 200000 ? 2 : 3;

    for (let r = 0; r < numRegions; r++) {
        const myPlate = r_plate[r];
        let bestComp = -Infinity;
        let best = -1;
        let bestNormalComp = 0;
        for (let ni = adjOffset[r], niEnd = adjOffset[r + 1]; ni < niEnd; ni++) {
            const nb = adjList[ni];
            if (myPlate !== r_plate[nb]) {
                const ri3 = 3*r, ni3 = 3*nb;
                const dx = r_xyz[ri3]-r_xyz[ni3], dy = r_xyz[ri3+1]-r_xyz[ni3+1], dz = r_xyz[ri3+2]-r_xyz[ni3+2];
                const dBefore = Math.sqrt(dx*dx+dy*dy+dz*dz);
                const v1 = plateVelocityAt(plateVec, myPlate, r_xyz[ri3], r_xyz[ri3+1], r_xyz[ri3+2]);
                const v2 = plateVelocityAt(plateVec, r_plate[nb], r_xyz[ni3], r_xyz[ni3+1], r_xyz[ni3+2]);
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

            const thresh = BOUNDARY_TYPE_THRESH_FACTOR * dt;
            if (bestNormalComp > thresh) r_boundaryType[r] = 1;
            else if (bestNormalComp < -thresh) r_boundaryType[r] = 2;
            else r_boundaryType[r] = 3;

            if (collided) {
                r_stress[r] = (bestComp / dt) * getPairIntensity(myPlate, r_plate[best]);
                // Stress direction: points from boundary neighbor toward this cell
                // (the direction compression pushes material into the plate interior)
                const sdx = r_xyz[3*r] - r_xyz[3*best], sdy = r_xyz[3*r+1] - r_xyz[3*best+1], sdz = r_xyz[3*r+2] - r_xyz[3*best+2];
                const sdLen = Math.sqrt(sdx*sdx + sdy*sdy + sdz*sdz) || 1e-10;
                r_stressDir[3*r] = sdx / sdLen;
                r_stressDir[3*r+1] = sdy / sdLen;
                r_stressDir[3*r+2] = sdz / sdLen;
            }

            const myDensity = plateDensity[myPlate];
            const nbDensity = plateDensity[r_plate[best]];
            const densityDiff = myDensity - nbDensity;
            const baseFactor = SUBDUCT_FACTOR_BASE + SUBDUCT_FACTOR_BASE * Math.tanh(densityDiff * SUBDUCT_FACTOR_TANH_SCALE);
            const densityContrast = Math.abs(densityDiff);
            const undulationStrength = Math.exp(-densityContrast * SUBDUCT_UNDULATION_DENSITY_DECAY);
            const x = r_xyz[3*r], y = r_xyz[3*r+1], z = r_xyz[3*r+2];
            const undulation = noise.fbm(x * SUBDUCT_UNDULATION_FREQ, y * SUBDUCT_UNDULATION_FREQ, z * SUBDUCT_UNDULATION_FREQ, undulOctaves) * SUBDUCT_UNDULATION_AMP * undulationStrength;
            r_subductFactor[r] = Math.max(0, Math.min(1, baseFactor + undulation));

            if (rOcean && nOcean) {
                (collided ? coastline_r : ocean_r).add(r);
            } else if (!rOcean && !nOcean) {
                if (collided) {
                    if (r_subductFactor[r] < SUBDUCT_THRESHOLD) mountain_r.add(r);
                    else coastline_r.add(r);
                }
            } else {
                (collided ? mountain_r : coastline_r).add(r);
            }
        }
    }
    return { mountain_r, coastline_r, ocean_r, r_stress, r_stressDir, r_subductFactor, r_boundaryType, r_bothOcean, r_hasOcean };
}

// ----------------------------------------------------------------
//  Stress propagation — frontier-based BFS diffusion inward
// ----------------------------------------------------------------
export function propagateStress(mesh, r_stress, r_stressDir, r_subductFactor, r_plate, r_xyz, plateIsOcean, decayFactor, subductDecayFactor, numPasses) {
    const { adjOffset, adjList } = mesh;
    const plateOcean = {};
    for (const pid of plateIsOcean) plateOcean[pid] = 1;

    let frontier = [];
    for (let r = 0; r < mesh.numRegions; r++) {
        if (r_stress[r] > STRESS_PROPAGATE_MIN) frontier.push(r);
    }

    for (let pass = 0; pass < numPasses && frontier.length > 0; pass++) {
        const nextFrontier = [];
        for (let fi = 0; fi < frontier.length; fi++) {
            const r = frontier[fi];
            const plate = r_plate[r];
            if (plateOcean[plate]) continue;
            const sf = r_subductFactor[r];
            const effDecay = sf > SUBDUCT_FACTOR_BASE ? subductDecayFactor : decayFactor;
            const basePropagate = r_stress[r] * effDecay;
            if (basePropagate < STRESS_PROPAGATE_CUTOFF) continue;

            // Stress direction at this cell
            const sdx = r_stressDir[3*r], sdy = r_stressDir[3*r+1], sdz = r_stressDir[3*r+2];
            const hasDir = (sdx !== 0 || sdy !== 0 || sdz !== 0);

            for (let ni = adjOffset[r], niEnd = adjOffset[r + 1]; ni < niEnd; ni++) {
                const nb = adjList[ni];
                if (r_plate[nb] !== plate) continue;

                let propagated = basePropagate;

                if (hasDir) {
                    // Direction from r toward neighbor nb
                    const tdx = r_xyz[3*nb] - r_xyz[3*r];
                    const tdy = r_xyz[3*nb+1] - r_xyz[3*r+1];
                    const tdz = r_xyz[3*nb+2] - r_xyz[3*r+2];
                    const tLen = Math.sqrt(tdx*tdx + tdy*tdy + tdz*tdz) || 1e-10;
                    // Alignment: 1 = propagating in stress direction, -1 = backward
                    const alignment = (sdx * tdx + sdy * tdy + sdz * tdz) / tLen;
                    // Directional factor: aligned propagation strong, perpendicular moderate, backward weak
                    const dirFactor = Math.max(STRESS_DIR_FACTOR_MIN, STRESS_DIR_FACTOR_BASE + STRESS_DIR_FACTOR_SCALE * alignment);
                    propagated *= dirFactor;
                }

                if (propagated > r_stress[nb]) {
                    r_stress[nb] = propagated;
                    r_subductFactor[nb] = sf;
                    nextFrontier.push(nb);

                    if (hasDir) {
                        // Propagate direction: blend parent direction with travel direction
                        // so the stress flow curves naturally through the plate
                        const tdx = r_xyz[3*nb] - r_xyz[3*r];
                        const tdy = r_xyz[3*nb+1] - r_xyz[3*r+1];
                        const tdz = r_xyz[3*nb+2] - r_xyz[3*r+2];
                        const tLen = Math.sqrt(tdx*tdx + tdy*tdy + tdz*tdz) || 1e-10;
                        const bx = sdx * STRESS_DIR_BLEND_PARENT + (tdx / tLen) * STRESS_DIR_BLEND_TRAVEL;
                        const by = sdy * STRESS_DIR_BLEND_PARENT + (tdy / tLen) * STRESS_DIR_BLEND_TRAVEL;
                        const bz = sdz * STRESS_DIR_BLEND_PARENT + (tdz / tLen) * STRESS_DIR_BLEND_TRAVEL;
                        const bLen = Math.sqrt(bx*bx + by*by + bz*bz) || 1e-10;
                        r_stressDir[3*nb] = bx / bLen;
                        r_stressDir[3*nb+1] = by / bLen;
                        r_stressDir[3*nb+2] = bz / bLen;
                    }
                }
            }
        }
        frontier = nextFrontier;
    }

    // Post-BFS direction smoothing: relax each stressed cell's direction toward
    // the stress-weighted average of its neighbors. Cleans up artifacts where
    // competing stress paths from different boundary segments meet.
    for (let pass = 0; pass < STRESS_DIR_SMOOTH_PASSES; pass++) {
        for (let r = 0; r < mesh.numRegions; r++) {
            if (r_stress[r] < STRESS_PROPAGATE_MIN) continue;
            const plate = r_plate[r];
            if (plateOcean[plate]) continue;
            let ax = 0, ay = 0, az = 0, totalW = 0;
            // Self contribution (strong anchor to prevent drift)
            const selfW = r_stress[r] * STRESS_DIR_SELF_WEIGHT;
            ax += r_stressDir[3*r]   * selfW;
            ay += r_stressDir[3*r+1] * selfW;
            az += r_stressDir[3*r+2] * selfW;
            totalW += selfW;
            for (let ni = adjOffset[r], niEnd = adjOffset[r + 1]; ni < niEnd; ni++) {
                const nb = adjList[ni];
                if (r_plate[nb] !== plate || r_stress[nb] < STRESS_PROPAGATE_MIN) continue;
                const w = r_stress[nb];
                ax += r_stressDir[3*nb]   * w;
                ay += r_stressDir[3*nb+1] * w;
                az += r_stressDir[3*nb+2] * w;
                totalW += w;
            }
            if (totalW > 0) {
                const len = Math.sqrt(ax*ax + ay*ay + az*az) || 1e-10;
                r_stressDir[3*r]   = ax / len;
                r_stressDir[3*r+1] = ay / len;
                r_stressDir[3*r+2] = az / len;
            }
        }
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

    const { adjOffset, adjList } = mesh;
    for (let qi = 0; qi < queue.length; qi++) {
        const pos = qi + randInt(queue.length - qi);
        const cur = queue[pos];
        queue[pos] = queue[qi];
        for (let ni = adjOffset[cur], niEnd = adjOffset[cur + 1]; ni < niEnd; ni++) {
            const nb = adjList[ni];
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
    const { adjOffset, adjList } = mesh;
    for (let i = 0; i < steps; i++) {
        const next = [];
        for (const r of frontier) {
            for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
                const nb = adjList[j];
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
export function assignElevation(mesh, r_xyz, plateIsOcean, r_plate, plateVec, plateSeeds, noise, noiseMag, seed, spread, plateDensity, superPlateData, r_mantleField) {
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
    const dl_lip      = new Float32Array(numRegions);
    const dl_tecActivity = new Float32Array(numRegions);
    const dl_margins = new Float32Array(numRegions);
    const dl_backArc = new Float32Array(numRegions);
    const dl_foldRidge = new Float32Array(numRegions);
    const dl_orogenicPower = new Float32Array(numRegions);
    const dl_uniformNoise  = new Float32Array(numRegions);
    const dl_dynamicTopo   = new Float32Array(numRegions);

    // Normalize mantle field to [-1, +1] for use by multiple features
    let r_mantleNorm = null;
    if (r_mantleField) {
        let mantleMax = 0;
        for (let r = 0; r < numRegions; r++) {
            const v = Math.abs(r_mantleField[r]);
            if (v > mantleMax) mantleMax = v;
        }
        if (mantleMax > 1e-6) {
            r_mantleNorm = new Float32Array(numRegions);
            const inv = 1 / mantleMax;
            for (let r = 0; r < numRegions; r++) r_mantleNorm[r] = r_mantleField[r] * inv;
        }
    }

    // --- Small-plate collisions (always computed) ---
    const smallCol = findCollisions(mesh, r_xyz, plateIsOcean, r_plate, plateVec, plateDensity, noise);

    // --- Super-plate collisions (when available) ---
    const hasSuperPlates = superPlateData != null;
    let superCol = null;
    if (hasSuperPlates) {
        superCol = findCollisions(mesh, r_xyz, superPlateData.superPlateIsOcean,
            superPlateData.r_superPlate, superPlateData.superPlateVec,
            superPlateData.superPlateDensity, noise);
    }
    _timing.push({ stage: 'Collisions' + (hasSuperPlates ? ' (dual)' : ''), ms: performance.now() - _t0 }); _t0 = performance.now();

    // --- Blend collision results ---
    let mountain_r, coastline_r, ocean_r, r_stress, r_stressDir, r_subductFactor, r_boundaryType, r_bothOcean, r_hasOcean;

    // Blend weights for dual-layer orogeny (small plates vs super plates).
    // All collision outputs use these same weights for consistency.
    // SMALL_W and SUPER_W imported from terrain-config.js

    if (!hasSuperPlates) {
        ({ mountain_r, coastline_r, ocean_r, r_stress, r_stressDir, r_subductFactor, r_boundaryType, r_bothOcean, r_hasOcean } = smallCol);
    } else {
        // Seed sets: union of both layers (small plates add noise everywhere)
        mountain_r  = new Set([...superCol.mountain_r, ...(SMALL_W > 0 ? smallCol.mountain_r : [])]);
        ocean_r     = new Set([...superCol.ocean_r,    ...(SMALL_W > 0 ? smallCol.ocean_r : [])]);
        coastline_r = new Set();
        for (const r of superCol.coastline_r) {
            if (!mountain_r.has(r)) coastline_r.add(r);
        }
        if (SMALL_W > 0) {
            for (const r of smallCol.coastline_r) {
                if (!mountain_r.has(r) && !coastline_r.has(r)) coastline_r.add(r);
            }
        }

        // Stress: smooth ramp — small-plate contribution scales up from SMALL_W²
        // (isolated, far from super plate orogeny) to full SMALL_W (where super
        // plate stress is strong). This lets small plates add texture everywhere
        // while keeping super plates as the dominant pattern.
        r_stress = new Float32Array(numRegions);
        {
            let maxSuperStress = 0;
            for (let r = 0; r < numRegions; r++) {
                if (superCol.r_stress[r] > maxSuperStress) maxSuperStress = superCol.r_stress[r];
            }
            const invMax = maxSuperStress > 1e-6 ? 1 / maxSuperStress : 0;
            for (let r = 0; r < numRegions; r++) {
                const sS = smallCol.r_stress[r], sP = superCol.r_stress[r];
                // proximity: 0 = no super plate stress, 1 = at max super plate stress
                const proximity = Math.min(1, sP * invMax * 3);
                // Smooth ramp: SMALL_W² at proximity=0 → SMALL_W at proximity=1
                const effectiveSmallW = SMALL_W * (SMALL_W + (1 - SMALL_W) * proximity);
                r_stress[r] = effectiveSmallW * sS + SUPER_W * sP;
            }
        }

        // SubductFactor: same blend weights
        r_subductFactor = new Float32Array(numRegions);
        for (let r = 0; r < numRegions; r++) {
            const wS = SMALL_W * smallCol.r_stress[r], wP = SUPER_W * superCol.r_stress[r];
            const total = wS + wP;
            if (total > 1e-6) {
                r_subductFactor[r] = (wS * smallCol.r_subductFactor[r] + wP * superCol.r_subductFactor[r]) / total;
            } else {
                r_subductFactor[r] = SMALL_W * smallCol.r_subductFactor[r] + SUPER_W * superCol.r_subductFactor[r];
            }
        }

        // BoundaryType: weighted by blended stress
        r_boundaryType = new Int8Array(numRegions);
        for (let r = 0; r < numRegions; r++) {
            const wS = SMALL_W * smallCol.r_stress[r];
            const wP = SUPER_W * superCol.r_stress[r];
            r_boundaryType[r] = wS > wP
                ? smallCol.r_boundaryType[r]
                : superCol.r_boundaryType[r];
        }

        // Stress direction: stress-weighted blend of both layers
        r_stressDir = new Float32Array(numRegions * 3);
        for (let r = 0; r < numRegions; r++) {
            const wS = SMALL_W * smallCol.r_stress[r], wP = SUPER_W * superCol.r_stress[r];
            const total = wS + wP;
            if (total > 1e-6) {
                const bx = wS * smallCol.r_stressDir[3*r]   + wP * superCol.r_stressDir[3*r];
                const by = wS * smallCol.r_stressDir[3*r+1] + wP * superCol.r_stressDir[3*r+1];
                const bz = wS * smallCol.r_stressDir[3*r+2] + wP * superCol.r_stressDir[3*r+2];
                const bLen = Math.sqrt(bx*bx + by*by + bz*bz) || 1e-10;
                r_stressDir[3*r] = bx / bLen;
                r_stressDir[3*r+1] = by / bLen;
                r_stressDir[3*r+2] = bz / bLen;
            }
        }

        // Boolean flags: blend-aware (only include a layer's flags if it has weight)
        r_bothOcean = new Uint8Array(numRegions);
        r_hasOcean  = new Uint8Array(numRegions);
        for (let r = 0; r < numRegions; r++) {
            const bSmall = SMALL_W > 0 ? smallCol.r_bothOcean[r] : 0;
            const bSuper = SUPER_W > 0 ? superCol.r_bothOcean[r] : 0;
            r_bothOcean[r] = bSmall | bSuper;
            const hSmall = SMALL_W > 0 ? smallCol.r_hasOcean[r] : 0;
            const hSuper = SUPER_W > 0 ? superCol.r_hasOcean[r] : 0;
            r_hasOcean[r]  = hSmall | hSuper;
        }
    }

    // Propagate stress inward
    const scaleFactor = Math.sqrt(numRegions / COLLISION_DT_REF_REGIONS);
    const baseDecay = STRESS_DECAY_BASE + spread * STRESS_DECAY_SPREAD_FACTOR;
    const decayFactor = Math.pow(baseDecay, 1 / scaleFactor);
    const subductBaseDecay = baseDecay * STRESS_SUBDUCT_DECAY_MULT;
    const subductDecayFactor = Math.pow(subductBaseDecay, 1 / scaleFactor);
    const numPasses = Math.max(1, Math.round(spread * STRESS_PASSES_PER_SPREAD * scaleFactor));

    if (!hasSuperPlates) {
        propagateStress(mesh, r_stress, r_stressDir, r_subductFactor, r_plate, r_xyz, plateIsOcean, decayFactor, subductDecayFactor, numPasses);
    } else {
        // Dual stress propagation: propagate each layer within its own plates, then blend
        const smallStress = new Float32Array(smallCol.r_stress);
        const smallDir = new Float32Array(smallCol.r_stressDir);
        const smallSubduct = new Float32Array(smallCol.r_subductFactor);
        propagateStress(mesh, smallStress, smallDir, smallSubduct, r_plate, r_xyz, plateIsOcean, decayFactor, subductDecayFactor, numPasses);

        const superStress = new Float32Array(superCol.r_stress);
        const superDir = new Float32Array(superCol.r_stressDir);
        const superSubduct = new Float32Array(superCol.r_subductFactor);
        propagateStress(mesh, superStress, superDir, superSubduct, superPlateData.r_superPlate, r_xyz, superPlateData.superPlateIsOcean, decayFactor, subductDecayFactor, numPasses);

        // Blend propagated stress using same SMALL_W / SUPER_W weights
        for (let r = 0; r < numRegions; r++) {
            r_stress[r] = SMALL_W * smallStress[r] + SUPER_W * superStress[r];
        }

        // Update subduct factor from propagated values using same weights
        for (let r = 0; r < numRegions; r++) {
            const wS = SMALL_W * smallStress[r], wP = SUPER_W * superStress[r];
            const total = wS + wP;
            if (total > 1e-6) {
                r_subductFactor[r] = (wS * smallSubduct[r] + wP * superSubduct[r]) / total;
            }
        }
    }
    _timing.push({ stage: 'Stress propagation' + (hasSuperPlates ? ' (dual)' : ''), ms: performance.now() - _t0 }); _t0 = performance.now();

    // Mantle-flow stress modulation: collisions backed by upwelling are more intense
    if (r_mantleNorm) {
        for (let r = 0; r < numRegions; r++) {
            if (r_stress[r] < 1e-6) continue;
            // Upwelling boosts stress, downwelling suppresses (capped at -50%)
            const mult = 1.0 + MANTLE_STRESS_BOOST * Math.max(-0.5, r_mantleNorm[r]);
            r_stress[r] *= mult;
        }
    }

    // Plate interiors are also seeds — find a representative hi-res region
    // per plate (plate seed IDs are coarse mesh indices that may not correspond
    // to regions of that plate on the hi-res mesh).
    {
        const plateRep = {};
        for (let r = 0; r < numRegions; r++) {
            const pid = r_plate[r];
            if (plateRep[pid] === undefined && !mountain_r.has(r) && !coastline_r.has(r) && !ocean_r.has(r)) {
                plateRep[pid] = r;
            }
        }
        for (const pid of plateSeeds) {
            const rep = plateRep[pid];
            if (rep !== undefined) {
                (plateIsOcean.has(pid) ? ocean_r : coastline_r).add(rep);
            }
        }
    }

    const stress_mountain_r = new Set();
    for (const r of mountain_r) {
        if (r_subductFactor[r] < SUBDUCT_THRESHOLD) stress_mountain_r.add(r);
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
    const { adjOffset, adjList } = mesh;
    for (let r = 0; r < numRegions; r++) {
        if (!r_isOcean[r]) {
            for (let ni = adjOffset[r], niEnd = adjOffset[r + 1]; ni < niEnd; ni++) {
                if (r_isOcean[adjList[ni]]) { coastSeeds.add(adjList[ni]); break; }
            }
        }
    }
    const dist_coast = assignDistanceField(mesh, coastSeeds, new Set(), seed + 4);

    // Land-only coast distance: seeds are land cells adjacent to ocean,
    // propagates only through land (ocean cells are barriers).
    const landCoastSeeds = new Set();
    for (let r = 0; r < numRegions; r++) {
        if (r_isOcean[r]) continue;
        for (let ni = adjOffset[r], niEnd = adjOffset[r + 1]; ni < niEnd; ni++) {
            if (r_isOcean[adjList[ni]]) { landCoastSeeds.add(r); break; }
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
    const interiorBand = Math.max(4, Math.round(INTERIOR_BAND_BASE * scaleFactor));

    // How far mountain-building collisions influence interior uplift (BFS cells).
    // Uses dist_mountain (already computed from stress_mountain_r seeds, blocked by ocean).
    // Only major convergent boundaries drive plateau formation, not every minor boundary.
    const tectonicReach = Math.max(6, Math.round(TECTONIC_REACH_BASE * scaleFactor));

    // Use 95th-percentile of non-zero stress for normalization.
    // Euler-pole velocity varies across plates, creating outlier high-stress
    // cells that would skew a raw-max normalizer and make typical mountains shorter.
    let maxStress = 0;
    const stressVals = [];
    for (let r = 0; r < numRegions; r++) {
        if (r_stress[r] > STRESS_PROPAGATE_MIN) stressVals.push(r_stress[r]);
        if (r_stress[r] > maxStress) maxStress = r_stress[r];
    }
    if (stressVals.length > 0) {
        stressVals.sort((a, b) => a - b);
        maxStress = stressVals[Math.min(stressVals.length - 1, Math.floor(stressVals.length * STRESS_PERCENTILE))];
    }
    if (maxStress < 0.01) maxStress = 1;

    const eps = 1e-3;
    const warpScale = WARP_SCALE;
    const warpOctaves = numRegions > 200000 ? 2 : 3;

    // Plateau zone: overriding-side cells beyond this distance from mountain front
    const plateauStart = Math.max(2, Math.round(PLATEAU_START_BASE * scaleFactor));

    // ---- Coast-boundary BFS (hoisted for use by ocean floor + coastal roughening) ----
    // Identifies each cell's nearest coastline boundary and propagates boundary type info.
    const coastBdry = [];
    for (let r = 0; r < numRegions; r++) {
        const rOc = r_isOcean[r];
        for (let ni = adjOffset[r], niEnd = adjOffset[r + 1]; ni < niEnd; ni++) {
            if (r_isOcean[adjList[ni]] !== rOc) {
                coastBdry.push(r);
                break;
            }
        }
    }

    const maxCD = Math.max(8, Math.round(COAST_BFS_WIDTH_BASE * scaleFactor));
    const dBdry = new Float32Array(numRegions);
    dBdry.fill(maxCD + 1);
    const coastStressMax = new Float32Array(numRegions);
    const coastSubductMax = new Float32Array(numRegions);
    const coastConvergent = new Uint8Array(numRegions);
    for (let i = 0; i < coastBdry.length; i++) {
        const r = coastBdry[i];
        dBdry[r] = 0;
        coastStressMax[r] = Math.min(1, r_stress[r] / maxStress);
        coastSubductMax[r] = r_subductFactor[r];
        coastConvergent[r] = r_boundaryType[r] === 1 ? 1 : 0;
    }
    {
        let qi = 0;
        while (qi < coastBdry.length) {
            const r = coastBdry[qi++];
            const nd = dBdry[r] + 1;
            if (nd > maxCD) continue;
            for (let ni = adjOffset[r], niEnd = adjOffset[r + 1]; ni < niEnd; ni++) {
                const nr = adjList[ni];
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
            for (let ni = adjOffset[r], niEnd = adjOffset[r + 1]; ni < niEnd; ni++) {
                const nr = adjList[ni];
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
    const ridgeHalfWidth = Math.max(2, Math.round(RIDGE_HW_BASE * scaleFactor));
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
            for (let ni = adjOffset[r], niEnd = adjOffset[r + 1]; ni < niEnd; ni++) {
                const nr = adjList[ni];
                if (nd < ridgeDist[nr] && r_isOcean[nr]) {
                    ridgeDist[nr] = nd;
                    ridgeSeeds.push(nr);
                }
            }
        }
    }

    // ---- Oceanic fracture zone BFS (transform ocean-ocean boundaries) ----
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
            for (let ni = adjOffset[r], niEnd = adjOffset[r + 1]; ni < niEnd; ni++) {
                const nr = adjList[ni];
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
    const baStart = Math.max(1, Math.round(BACK_ARC_START_BASE * scaleFactor));
    const baPeak = Math.max(2, Math.round(BACK_ARC_PEAK_BASE * scaleFactor));
    const baEnd = Math.max(3, Math.round(BACK_ARC_END_BASE * scaleFactor));
    const backArcDist = new Float32Array(numRegions);
    backArcDist.fill(Infinity);
    const backArcStress = new Float32Array(numRegions);
    const backArcSeeds = [];
    for (let r = 0; r < numRegions; r++) {
        if (r_boundaryType[r] === 1 && r_hasOcean[r] && r_subductFactor[r] < BACK_ARC_SUBDUCT_THRESH) {
            backArcSeeds.push(r);
            backArcDist[r] = 0;
            backArcStress[r] = Math.min(1, r_stress[r] / maxStress);
        }
    }
    {
        let qi = 0;
        while (qi < backArcSeeds.length) {
            const r = backArcSeeds[qi++];
            const nd = backArcDist[r] + 1;
            if (nd > baEnd) continue;
            const plate = r_plate[r];
            for (let ni = adjOffset[r], niEnd = adjOffset[r + 1]; ni < niEnd; ni++) {
                const nr = adjList[ni];
                if (nd < backArcDist[nr] && r_plate[nr] === plate) {
                    backArcDist[nr] = nd;
                    backArcStress[nr] = backArcStress[r];
                    backArcSeeds.push(nr);
                }
            }
        }
    }

    _timing.push({ stage: 'Ridge/fracture/back-arc BFS', ms: performance.now() - _t0 }); _t0 = performance.now();

    // Convergent boundary ridgeline parameters (scale-invariant)
    const ridgeSigmaBase = Math.max(2, Math.round(RIDGE_SIGMA_BASE_CFG * scaleFactor));
    const ridgePeakShift = Math.max(1, Math.round(RIDGE_PEAK_SHIFT_BASE * scaleFactor));
    const ridgeExtent = Math.max(4, Math.round(RIDGE_EXTENT_BASE * scaleFactor));

    // Separate noise instance for fold ridges (decorrelated from main noise)
    const foldNoise = new SimplexNoise(seed + 557);

    // Per-plate random starting height for land plates (mean -25m, stddev 12.5m).
    // In normalized elevation units: -25m ≈ -0.0025, 12.5m ≈ 0.00125.
    const plateBaseHeight = {};
    {
        const plateHeightRng = makeRng(seed + 777);
        // Box-Muller transform for normal distribution
        for (const pid of plateSeeds) {
            if (!plateIsOcean.has(pid)) {
                const u1 = plateHeightRng();
                const u2 = plateHeightRng();
                const normal = Math.sqrt(-2 * Math.log(u1 || 1e-10)) * Math.cos(2 * Math.PI * u2);
                plateBaseHeight[pid] = PLATE_BASE_HEIGHT_MEAN + normal * PLATE_BASE_HEIGHT_STDDEV;
            }
        }
    }

    // Basin vs Shield classification: low-frequency noise field.
    // 0.0 = cratonic shield (resistant, higher), 1.0 = sedimentary basin (low, flat).
    const r_basinFactor = new Float32Array(numRegions);
    {
        const basinNoise = new SimplexNoise(seed + 661);
        for (let r = 0; r < numRegions; r++) {
            if (r_isOcean[r]) continue;
            const bx = r_xyz[3 * r], by = r_xyz[3 * r + 1], bz = r_xyz[3 * r + 2];
            const raw = basinNoise.fbm(bx * BASIN_FREQ + 7.3, by * BASIN_FREQ + 3.1, bz * BASIN_FREQ + 9.7, 2, 0.5);
            r_basinFactor[r] = Math.max(0, Math.min(1, BASIN_FACTOR_BIAS + raw * BASIN_FACTOR_SCALE));
        }
    }

    for (let r = 0; r < numRegions; r++) {
        const isOceanPlate = r_isOcean[r];

        // Asymmetric mountain profiles: shift ridge peak toward subducting side.
        // sf > 0.5 (subducting): inflated distance → lower base → steeper drop-off
        // sf < 0.5 (overriding): compressed distance → higher base → gentler slope
        // sf = 0.5 (neutral / far from boundary): no effect
        const sfAsym = r_subductFactor[r];
        const asymmetry = 1.0 + (sfAsym - 0.5) * ASYMMETRY_FACTOR;
        const a = dist_mountain[r] * asymmetry + eps;
        const b = dist_ocean[r]     + eps;
        const c = dist_coastline[r] + eps;
        if (a === Infinity && b === Infinity) {
            r_elevation[r] = 0.1 * BASE_SCALE;
        } else {
            r_elevation[r] = (1/a - 1/b) / (1/a + 1/b + 1/c) * BASE_SCALE;
        }
        dl_base[r] = r_elevation[r];

        const stressNorm = Math.min(1, r_stress[r] / maxStress);
        const btype = r_boundaryType[r];

        const x = r_xyz[3*r], y = r_xyz[3*r+1], z = r_xyz[3*r+2];
        const wx = x + warpScale * noise.fbm(x + 5.3, y + 1.7, z + 3.1, warpOctaves);
        const wy = y + warpScale * noise.fbm(x + 8.1, y + 2.9, z + 7.3, warpOctaves);
        const wz = z + warpScale * noise.fbm(x + 1.4, y + 6.2, z + 4.8, warpOctaves);

        // Orogenic power: single-octave noise for blocky, high-contrast
        // zones.  Computed for ALL regions so the debug layer shows the
        // full noise field (not skewed by ocean zeros).
        const rawOro = noise.noise3D(x * OROGENIC_FREQ + 33.7, y * OROGENIC_FREQ + 11.2, z * OROGENIC_FREQ + 22.9);
        const shaped = rawOro >= 0 ? Math.sqrt(rawOro) : -Math.sqrt(-rawOro);
        const orogenicPower = Math.max(0, Math.min(1, 0.5 + 0.5 * shaped));
        dl_orogenicPower[r] = orogenicPower - 0.5;  // center on 0 for diverging debug color scale

        if (!isOceanPlate) {
            const sf = r_subductFactor[r];
            // Apply per-plate random starting height
            const pid = r_plate[r];
            if (plateBaseHeight[pid] !== undefined) {
                r_elevation[r] += plateBaseHeight[pid];
            }
            const elevBefore = r_elevation[r];

            if (sf > 0.5 && r_elevation[r] > 0) {
                const suppression = (sf - 0.5) * 2;
                r_elevation[r] *= 1 - suppression * SUBDUCTING_SUPPRESSION;
            }

            if (stressNorm > 0.01) {
                const stressMag = stressNorm * stressNorm * STRESS_MAG_SCALE * orogenicPower;
                const uplift  = stressMag * (1 - sf);
                const depress = stressMag * STRESS_DEPRESS_FRAC * sf;
                const heightVar = STRESS_HEIGHT_VAR_BASE + STRESS_HEIGHT_VAR_SCALE * noise.fbm(x * 8 + 13.7, y * 8 + 9.2, z * 8 + 4.5, 3);
                r_elevation[r] += (uplift - depress) * heightVar;
            }

            // Foreland basin: distance-aware depression ahead of orogen on overriding side.
            // Deepest near the mountain front, tapering away into the continental interior.
            {
                const dMtn = dist_mountain[r];
                if (dMtn !== Infinity && stressNorm < FORELAND_STRESS_THRESH && sf < BACK_ARC_SUBDUCT_THRESH) {
                    const forelandWidth = Math.max(2, Math.round(interiorBand * FORELAND_WIDTH_FRAC));
                    if (dMtn < forelandWidth) {
                        const t = dMtn / forelandWidth;
                        const peakPos = FORELAND_PEAK_POS; // deepest at 20% of width from orogen
                        let profile;
                        if (t < peakPos) {
                            const s = t / peakPos;
                            profile = s * s * (3 - 2 * s); // smoothstep ramp to max depth
                        } else {
                            const s = (t - peakPos) / (1 - peakPos);
                            profile = 1 - s * s * (3 - 2 * s); // smoothstep taper back to zero
                        }
                        const stressFade = 1 - Math.min(1, stressNorm / FORELAND_STRESS_THRESH);
                        // Basins near orogens deepen more (foreland basin connection)
                        const basinDeepening = FORELAND_BASIN_DEEPENING_BASE + FORELAND_BASIN_DEEPENING_SCALE * r_basinFactor[r];
                        r_elevation[r] -= FORELAND_BASIN_DEPTH * profile * stressFade * basinDeepening;
                    }
                }
            }

            // Rift valley: structured graben profile replaces flat depression.
            // Uses pre-computed riftDist BFS from divergent continent-continent boundaries.
            {
                const rd = riftDist[r];
                if (rd !== Infinity) {
                    const floorEnd = Math.max(1, Math.round(RIFT_FLOOR_MULT * scaleFactor));
                    const shoulderEnd = Math.max(2, Math.round(RIFT_SHOULDER_MULT * scaleFactor));
                    let riftEffect = 0;
                    if (rd <= 0.5) {
                        // Rift axis: deepest depression
                        riftEffect = RIFT_AXIS_DEPTH;
                        // Volcanic ridged noise along axis
                        riftEffect += riftNoise.ridgedFbm(x * 8, y * 8, z * 8, 3) * RIFT_AXIS_VOLCANIC_AMP;
                    } else if (rd <= floorEnd) {
                        // Rift floor: still depressed, with volcanic texture
                        const t = rd / floorEnd;
                        riftEffect = RIFT_FLOOR_DEPTH * (1 - t * RIFT_FLOOR_TAPER);
                        riftEffect += riftNoise.ridgedFbm(x * 8, y * 8, z * 8, 3) * RIFT_FLOOR_VOLCANIC_AMP * (1 - t);
                    } else if (rd <= shoulderEnd) {
                        // Rift shoulders: modest uplift flanking the graben
                        const t = (rd - floorEnd) / (shoulderEnd - floorEnd);
                        riftEffect = RIFT_SHOULDER_UPLIFT * (1 - t);
                    } else if (riftHalfWidth > shoulderEnd) {
                        // Smooth fadeout to ambient
                        const t = (rd - shoulderEnd) / (riftHalfWidth - shoulderEnd);
                        const fadeT = Math.min(1, t);
                        const fade = fadeT * fadeT * (3 - 2 * fadeT); // smoothstep
                        riftEffect = RIFT_SHOULDER_UPLIFT * (1 - fade) * RIFT_FADEOUT_RESIDUAL; // tiny residual shoulder
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
                        baEffect = -BACK_ARC_DEPTH * backArcStress[r] * s * orogenyFactor;
                    } else if (bad <= baEnd) {
                        const t = (bad - baPeak) / Math.max(1, baEnd - baPeak);
                        const s = t * t * (3 - 2 * t);
                        baEffect = -BACK_ARC_DEPTH * backArcStress[r] * (1 - s) * orogenyFactor;
                    }
                    r_elevation[r] += baEffect;
                    dl_backArc[r] = baEffect;
                }
            }

            // Convergent boundary ridgeline: Gaussian peak near the collision front.
            // Symmetric when plates have equal density (sf ≈ 0.5), biased heavily
            // toward the overriding side when one plate subducts.
            {
                const dMtnRidge = dist_mountain[r];
                if (dMtnRidge !== Infinity && dMtnRidge < ridgeExtent && stressNorm > 0.01) {
                    const sfAsymmetry = Math.abs(sf - 0.5) * 2; // 0 = equal, 1 = full subduction
                    // Signed distance: positive on subducting side, negative on overriding
                    const signedDist = sf > 0.5 ? dMtnRidge : -dMtnRidge;
                    // Peak shifts toward overriding side with subduction asymmetry
                    const peakPos = -sfAsymmetry * ridgePeakShift;
                    const dFromPeak = signedDist - peakPos;
                    // Modulate range width by local convergence rate and along-strike noise
                    const stressWidthMod = RIDGE_STRESS_WIDTH_BASE + RIDGE_STRESS_WIDTH_SCALE * stressNorm;
                    const widthNoise = 1.0 + RIDGE_WIDTH_NOISE_AMP * foldNoise.fbm(x * 3 + 44.1, y * 3 + 22.7, z * 3 + 11.3, 2);
                    const localRidgeSigma = ridgeSigmaBase * stressWidthMod * widthNoise;
                    // Asymmetric sigma: narrow on subducting side, wider on overriding
                    const sigma = dFromPeak > 0
                        ? localRidgeSigma * (1 - sfAsymmetry * RIDGE_ASYM_SUBDUCT_NARROW)  // subducting: tighter
                        : localRidgeSigma * (1 + sfAsymmetry * RIDGE_ASYM_OVERRIDE_WIDEN); // overriding: broader
                    const safeSigma = Math.max(0.5, sigma);
                    const gauss = Math.exp(-0.5 * (dFromPeak / safeSigma) ** 2);
                    // Along-strike height variation: low-frequency noise creates
                    // peaks and saddles along the ridge rather than a uniform wall.
                    // Uses a different noise offset from width noise for independence.
                    const ridgeHeightNoise = RIDGE_HEIGHT_VAR_BASE + RIDGE_HEIGHT_VAR_SCALE * foldNoise.fbm(x * RIDGE_HEIGHT_VAR_FREQ + 17.3, y * RIDGE_HEIGHT_VAR_FREQ + 31.7, z * RIDGE_HEIGHT_VAR_FREQ + 8.9, 2);
                    r_elevation[r] += gauss * stressNorm * RIDGE_STRENGTH * ridgeHeightNoise;
                }
            }

            dl_tectonic[r] = r_elevation[r] - elevBefore;

            // Compute tectonic activity early — used by noise, interior, and plateau sections.
            // Uses dist_mountain: distance from mountain-building collisions only.
            // Plates with no major collisions get tectonicActivity ≈ 0 (cratons).
            // Subducting side (sf > 0.5) falls off much faster to keep tectonic
            // influence concentrated near the boundary.
            const dMtn = dist_mountain[r];
            const effReach = sf > 0.5
                ? tectonicReach * (SUBDUCTING_REACH_MIN + SUBDUCTING_REACH_RANGE * (1 - sf))  // ~35-50% reach on subducting side
                : tectonicReach;
            const rawProximity = (dMtn === Infinity || dMtn >= effReach)
                ? 0
                : (1 - dMtn / effReach);
            const tectonicActivity = Math.max(stressNorm, rawProximity * rawProximity * rawProximity);
            dl_tecActivity[r] = tectonicActivity;

            // Fold ridge noise: directional ridges parallel to plate boundaries.
            // Uses dot(pos, Euler pole) as fold coordinate — creates concentric
            // arcs around the pole, perpendicular to plate motion.
            let foldContrib = 0;
            {
                const pid = r_plate[r];
                const pv = plateVec[pid];
                // Elevation-driven folds only kick in on substantial terrain (> 0.15 ≈ 1.5km),
                // so flat coasts and lowlands stay smooth while mountains get ridge texture
                const elevFoldDrive = Math.max(0, (r_elevation[r] - FOLD_ELEV_THRESHOLD) * FOLD_ELEV_SCALE);
                const clampedElevDrive = Math.min(1, elevFoldDrive);
                const foldActivity = Math.max(tectonicActivity, clampedElevDrive * SUBDUCT_FACTOR_BASE);
                if (pv && foldActivity > 0.01) {
                    const ppx = pv.pole[0], ppy = pv.pole[1], ppz = pv.pole[2];
                    // Fold coordinate: project velocity onto tangent plane, then use
                    // the component along velocity direction. Ridges form perpendicular
                    // to plate motion (parallel to the collision boundary).
                    // velocity = omega * cross(pole, pos)
                    const vx = ppy * z - ppz * y;
                    const vy = ppz * x - ppx * z;
                    const vz = ppx * y - ppy * x;
                    // u = dot(pos, velocity_direction) — oscillates along motion direction,
                    // creating ridges perpendicular to it
                    const vLen = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1e-10;
                    const u = (x * vx + y * vy + z * vz) / vLen;
                    // Mild phase warp for natural irregularity
                    // (arbitrary domain-shift offsets decorrelate from other noise channels)
                    const phaseWarp = foldNoise.fbm(x * 3 + 55.3, y * 3 + 33.7, z * 3 + 17.2, 2) * FOLD_PHASE_WARP_AMP;
                    const FOLD_FREQ = FOLD_FREQ_PRIMARY;
                    const phase = (u + phaseWarp) * FOLD_FREQ * Math.PI;
                    // Sharp ridges with valleys: 1-|sin| peaks at zero-crossings
                    const ridge = 1 - Math.abs(Math.sin(phase));
                    // Center around zero (mean of 1-|sin| ≈ 0.36)
                    const foldCentered = ridge - FOLD_MEAN_OFFSET;
                    // Amplitude varies along ridges to break uniformity
                    const ampMod = FOLD_AMP_MOD_BASE + FOLD_AMP_MOD_SCALE * foldNoise.fbm(x * 4 + 88.1, y * 4 + 62.3, z * 4 + 41.7, 2);
                    // Scale by elevation — folds only carve into significant terrain,
                    // flat coasts and lowlands stay smooth even near boundaries
                    const elevBoost = Math.max(0, r_elevation[r] - FOLD_ELEV_BOOST_OFFSET) * FOLD_ELEV_BOOST_SCALE;
                    // Strong near orogeny (squared falloff), suppressed on subducting side
                    const foldAmp = foldActivity * Math.max(0, 1 - sf * FOLD_SF_SUPPRESS) * noiseMag * FOLD_NOISE_MAG_SCALE * elevBoost;
                    foldContrib = foldCentered * foldAmp * ampMod;

                    // Secondary fold layer: 2.5x frequency, noisier, slightly cross-grain
                    // Perpendicular tangent direction: cross(pos, velocity)
                    const cx = y * vz - z * vy, cy = z * vx - x * vz, cz = x * vy - y * vx;
                    const cLen = Math.sqrt(cx * cx + cy * cy + cz * cz) || 1e-10;
                    // Mix: mostly along velocity (0.85) with slight cross-grain (0.15)
                    const u2 = (FOLD_SECONDARY_ALONG * (x * vx + y * vy + z * vz) / vLen
                              + FOLD_SECONDARY_CROSS * (x * cx + y * cy + z * cz) / cLen);
                    const phaseWarp2 = foldNoise.fbm(x * 5 + 71.2, y * 5 + 19.8, z * 5 + 43.6, 3) * FOLD_PHASE_WARP2_AMP;
                    const FOLD_FREQ_2 = FOLD_FREQ_SECONDARY;  // 2.5x primary
                    const phase2 = (u2 + phaseWarp2) * FOLD_FREQ_2 * Math.PI;
                    const ridge2 = 1 - Math.abs(Math.sin(phase2));
                    const fold2Centered = ridge2 - FOLD_MEAN_OFFSET;
                    const ampMod2 = FOLD_AMP_MOD2_BASE + FOLD_AMP_MOD2_SCALE * foldNoise.fbm(x * 6 + 33.4, y * 6 + 77.1, z * 6 + 52.9, 2);
                    foldContrib += fold2Centered * foldAmp * ampMod2 * FOLD_SECONDARY_AMP;

                    r_elevation[r] += foldContrib;
                    dl_foldRidge[r] = foldContrib;
                }
            }

            // Plateau zone: overriding side, behind collision front, with tectonic influence
            const isPlateauZone = sf < 0.45 && dMtn !== Infinity && dMtn > plateauStart;

            // Terrain-type-aware noise: classify into archetypes and modulate noise parameters.
            // Fold belts get higher frequency + ridged noise, cratons get smooth low-frequency,
            // sedimentary basins get suppressed amplitude (flat plains).
            const isFoldBelt = Math.min(1, stressNorm * FOLD_BELT_MULT);
            const isCraton = Math.max(0, 1 - tectonicActivity * CRATON_TECTONIC_MULT) * (1 - r_basinFactor[r]);
            const isBasin = r_basinFactor[r] * Math.max(0, 1 - tectonicActivity * BASIN_TECTONIC_MULT);

            // Fold belts get 1x-2.5x frequency for tighter, more chaotic terrain
            const foldFreqMult = 1.0 + isFoldBelt * FOLD_FREQ_MULT_SCALE;
            // Basin/craton amplitude suppression
            const basinAmpSuppress = 1.0 - isBasin * BASIN_AMP_SUPPRESS;    // basins: 30-100% amplitude
            const cratonAmpSuppress = 1.0 - isCraton * CRATON_AMP_SUPPRESS;  // cratons: 60-100% amplitude
            const terrainTypeSuppress = basinAmpSuppress * cratonAmpSuppress;

            const blend = isFoldBelt;
            const smoothNoise = noise.fbm(wx * foldFreqMult, wy * foldFreqMult, wz * foldFreqMult) * noiseMag;
            const ridgedNoise = noise.ridgedFbm(wx * foldFreqMult, wy * foldFreqMult, wz * foldFreqMult) * noiseMag * RIDGED_NOISE_AMP;
            const noiseVal = smoothNoise * (1 - blend) + ridgedNoise * blend;
            // Higher-freq detail layer: zero-mean, half strength
            const detailNoise = noise.fbm(wx * DETAIL_NOISE_FREQ_MULT * foldFreqMult + 22.1, wy * DETAIL_NOISE_FREQ_MULT * foldFreqMult + 6.8, wz * DETAIL_NOISE_FREQ_MULT * foldFreqMult + 15.4, 4, 0.5) * noiseMag * DETAIL_NOISE_AMP;
            // Scale noise amplitude by tectonic activity: rough near collisions, smooth in quiet interiors
            const noiseActivity = Math.min(1, stressNorm * NOISE_ACTIVITY_SCALE);
            // Plateau flatness: additionally suppress noise on overriding side behind collisions
            const plateauSuppress = isPlateauZone
                ? Math.max(PLATEAU_SUPPRESS_MIN, 1 - tectonicActivity * PLATEAU_SUPPRESS_SCALE)
                : 1.0;
            const noiseScale = (NOISE_BASE_SCALE + NOISE_ACTIVITY_CONTRIB * noiseActivity) * plateauSuppress * terrainTypeSuppress;
            // Fine detail layer: 8x frequency, quarter strength, half-dampened.
            // Uses sqrt of noiseScale so it retains texture in quiet interiors where other noise is suppressed.
            const fineNoise = noise.fbm(wx * FINE_NOISE_FREQ_MULT + 41.7, wy * FINE_NOISE_FREQ_MULT + 13.2, wz * FINE_NOISE_FREQ_MULT + 27.9, 3, 0.5) * noiseMag * FINE_NOISE_AMP;
            const fineScale = Math.sqrt(noiseScale);
            const totalNoise = (noiseVal + detailNoise) * noiseScale + fineNoise * fineScale;
            r_elevation[r] += totalNoise;
            dl_noise[r] = totalNoise;

            // Mountain dissection: high-frequency zero-mean noise on tall terrain.
            // Carves valleys and sharpens ridges in large mountain masses.
            // Activates above ~1.2 km equivalent (0.12 in normalized elevation,
            // where 1.0 ≈ 10 km Everest-scale).
            {
                const DISSECT_THRESHOLD = DISSECT_THRESHOLD_CFG;
                const currentElev = r_elevation[r];
                if (currentElev > DISSECT_THRESHOLD) {
                    const elevExcess = currentElev - DISSECT_THRESHOLD;
                    const dissectVal = noise.fbm(
                        wx * 16 + 71.3, wy * 16 + 44.8, wz * 16 + 29.1, 3, 0.5
                    );
                    // Elevation-driven dissection: tall terrain always gets valley carving,
                    // with stress adding extra intensity near boundaries
                    const elevDrive = Math.min(1, Math.sqrt(elevExcess) * DISSECT_ELEV_SCALE);
                    const dissectAmp = Math.sqrt(elevExcess) * Math.max(elevDrive, stressNorm) * noiseMag * DISSECT_AMP;
                    const dissectContrib = dissectVal * dissectAmp;
                    r_elevation[r] += dissectContrib;
                    dl_noise[r] += dissectContrib;
                }
            }

            // Summit peaks: sparse, sharp spikes along the tallest mountain
            // ridges.  Uses very high-frequency ridged noise with a high
            // threshold so only occasional points jut upward.  Base orogeny
            // caps around 4-5 km; only these peaks can push toward 6 km.
            {
                const SUMMIT_THRESHOLD = SUMMIT_THRESHOLD_CFG;  // ~2.6 km
                const currentElev = r_elevation[r];
                if (currentElev > SUMMIT_THRESHOLD && stressNorm > SUMMIT_STRESS_MIN) {
                    const excess = currentElev - SUMMIT_THRESHOLD;
                    // Ridged noise at high frequency — sharp, spiky features
                    const peakNoise = noise.ridgedFbm(
                        wx * 24 + 91.3, wy * 24 + 55.7, wz * 24 + 38.2, 3, 0.5
                    );
                    // Only the highest peaks of the noise create summits
                    const spike = Math.max(0, peakNoise - SUMMIT_SPIKE_OFFSET);
                    const peakContrib = spike * excess * Math.max(stressNorm, SUMMIT_STRESS_FLOOR) * 1.0;
                    r_elevation[r] += peakContrib;
                    dl_noise[r] += peakContrib;
                }
            }



            // Continental interior uplift: tectonic-aware.
            // Collision-backed interiors (plateaus) get higher uplift than quiet cratons.
            const lcd = dist_coast_land[r];
            if (lcd < Infinity) {
                // Mountains make nearby land on the overriding side act more "interior":
                // only applies when the mountain is BETWEEN the cell and the coast
                // (dMtn < lcd), meaning the cell is behind the orogen, not in front of it.
                let mountainBoost = 0;
                if (dMtn !== Infinity && sf < BACK_ARC_SUBDUCT_THRESH && dMtn < lcd) {
                    const proximity = Math.max(0, 1 - dMtn / Math.max(1, tectonicReach));
                    mountainBoost = proximity * interiorBand * MOUNTAIN_BOOST_FRAC;
                }
                const effectiveLcd = lcd + mountainBoost;

                // Depression: smoothstep over full band (0 → coastal depression at coast)
                const tDown = Math.min(effectiveLcd / interiorBand, 1);
                const sDown = tDown * tDown * (3 - 2 * tDown);
                // Uplift: reaches plateau much sooner (40% of band)
                const tUp = Math.min(effectiveLcd / (interiorBand * INTERIOR_UPLIFT_RAMP_FRAC), 1);
                const sUp = tUp * tUp * (3 - 2 * tUp);
                // Basin/shield modulated uplift: shields higher, basins flatter.
                const bf = r_basinFactor[r];
                const interiorBase = INTERIOR_BASE_SHIELD * (1 - bf) + INTERIOR_BASE_BASIN * bf;
                const interiorUplift = interiorBase + tectonicActivity * INTERIOR_TECTONIC;
                // Coastal depression: reduced in basins to prevent pockmarks
                // (basins have less uplift to compensate, so depression must also be less)
                const coastalDepression = COASTAL_DEPRESSION * (1 - bf * COASTAL_DEPRESSION_BASIN_REDUCE);
                const baseBias = coastalDepression * (1 - sDown) + interiorUplift * sUp;
                // Low-freq noise modulation: 80%–120% of bias
                const mod = 1.0 + INTERIOR_UPLIFT_MOD_AMP * noise.fbm(x * 2 + 19.3, y * 2 + 7.6, z * 2 + 13.1, 2);
                const bias = baseBias * mod;
                r_elevation[r] += bias;
                dl_interior[r] = bias;
            }

            // Plateau uplift boost: modest extra elevation on overriding side behind collisions
            if (isPlateauZone && tectonicActivity > 0.1) {
                const plateauBoost = PLATEAU_BOOST * tectonicActivity * (1 - sf);
                r_elevation[r] += plateauBoost;
                dl_interior[r] += plateauBoost;
            }

            // Passive margin coastal plain: suppress elevation near passive coasts
            // to create broad lowland zones (e.g. US East Coast, Brazil).
            {
                const coastPlainWidth = Math.max(6, Math.round(COASTAL_PLAIN_WIDTH_BASE * scaleFactor));
                const lcd = dist_coast_land[r];
                if (lcd < coastPlainWidth && dBdry[r] <= maxCD && !coastConvergent[r]) {
                    const t = lcd / coastPlainWidth;
                    const fade = t * t * (3 - 2 * t); // smoothstep: full at coast, zero at width
                    const suppressionStrength = PLAIN_SUPPRESSION_STRENGTH * (1 - fade);
                    if (r_elevation[r] > PLAIN_TARGET) {
                        const excess = r_elevation[r] - PLAIN_TARGET;
                        const suppression = excess * suppressionStrength;
                        r_elevation[r] -= suppression;
                        dl_coastal[r] -= suppression;
                    }
                }
            }

            // Soft floor: prevent continental interiors from dipping below sea level.
            // Near the coast (lcd < 5), allow near-zero elevations for natural shoreline
            // gradients. Further inland, enforce a minimum to prevent "great lake" artifacts
            // from compounding negative fold/noise/basin contributions.
            {
                // Interior floor
                const floorRamp = Math.min(1, lcd / (5 * scaleFactor));
                const minElev = INTERIOR_FLOOR * floorRamp;
                if (r_elevation[r] < minElev) r_elevation[r] = minElev;
            }

        } else {
            const dc = dist_coast[r];
            // Ocean floor profile: shelf width varies by margin type (active vs passive).
            // Active margins (subduction coasts): narrow shelf, steep slope.
            // Passive margins (trailing edges): wide shelf, gradual slope.
            const isActiveMarginShelf = coastConvergent[r] === 1;
            const shelfWidth = isActiveMarginShelf
                ? Math.max(2, Math.round(SHELF_NARROW_BASE * scaleFactor))
                : Math.max(4, Math.round(SHELF_WIDE_BASE * scaleFactor));
            const slopeWidth = Math.max(3, Math.round(SLOPE_WIDTH_BASE * scaleFactor));
            const totalMargin = shelfWidth + slopeWidth;

            let oceanBase;
            if (dc < shelfWidth) {
                // Continental shelf: -0.08 at coast edge, down to -0.16 at shelf break
                oceanBase = SHELF_DEPTH_START - SHELF_DEPTH_RANGE * (dc / shelfWidth);
            } else if (dc < totalMargin) {
                // Continental slope: -0.16 down to -0.35
                oceanBase = (SHELF_DEPTH_START - SHELF_DEPTH_RANGE) - SLOPE_DEPTH_RANGE * ((dc - shelfWidth) / slopeWidth);
            } else {
                oceanBase = ABYSS_BASE + noise.fbm(x * 2, y * 2, z * 2, 3) * ABYSS_NOISE_AMP;
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
                const ridgeUplift = (RIDGE_UPLIFT_NOISE * ridgeNoise + RIDGE_UPLIFT_BASE) * ridgeFade;
                r_elevation[r] += ridgeUplift;
            }

            // Oceanic fracture zones: linear depressions at transform boundaries
            const fd = fractureDist[r];
            if (fd !== Infinity && fd <= fractureHalfWidth) {
                const ft = fd / fractureHalfWidth;
                const fractureFade = 1 - ft;
                r_elevation[r] -= FRACTURE_DEPTH * fractureFade;
            }

            // Trenches at convergent boundaries
            if (btype === 1) {
                r_elevation[r] -= TRENCH_BASE_DEPTH + TRENCH_STRESS_DEPTH * stressNorm;
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
                        baEffect = -BACK_ARC_DEPTH * backArcStress[r] * s * orogenyFactor;
                    } else if (bad <= baEnd) {
                        const t = (bad - baPeak) / Math.max(1, baEnd - baPeak);
                        const s = t * t * (3 - 2 * t);
                        baEffect = -BACK_ARC_DEPTH * backArcStress[r] * (1 - s) * orogenyFactor;
                    }
                    r_elevation[r] += baEffect;
                    dl_backArc[r] = baEffect;
                }
            }

            dl_tectonic[r] = r_elevation[r] - elevBeforeOcTec;

            const oceanNoise = noise.fbm(wx, wy, wz) * noiseMag * OCEAN_NOISE_AMP;
            r_elevation[r] += oceanNoise;
            dl_noise[r] = oceanNoise;

            // Clamp ocean-plate cells below sea level after all ocean-branch processing.
            // Only intentional features after the main loop (island scatter, island arcs,
            // hotspots) may push ocean cells above 0.
            if (r_elevation[r] > OCEAN_FLOOR_CLAMP) r_elevation[r] = OCEAN_FLOOR_CLAMP;
        }
    }

    _timing.push({ stage: 'Main elevation loop (land+ocean)', ms: performance.now() - _t0 }); _t0 = performance.now();

    // Coastal roughening (uses hoisted coastBdry BFS data: dBdry, coastStressMax, etc.)
    {
        const coastRoughenDist = Math.max(8, Math.round(COAST_ROUGHEN_BASE * scaleFactor));
        const cNoise  = new SimplexNoise(seed + 77);
        const cNoise2 = new SimplexNoise(seed + 133);
        const cNoise3 = new SimplexNoise(seed + 211);

        for (let r = 0; r < numRegions; r++) {
            if (dBdry[r] > coastRoughenDist) continue;
            const x = r_xyz[3*r], y = r_xyz[3*r+1], z = r_xyz[3*r+2];
            const t = dBdry[r] / coastRoughenDist;

            const sn = Math.min(1, Math.max(coastStressMax[r], r_stress[r] / maxStress));

            const isSubductingOcean = r_isOcean[r]
                && coastConvergent[r]
                && coastSubductMax[r] > COAST_SUBDUCT_SUP_LOW;
            const subSup = isSubductingOcean
                ? Math.min(1, (coastSubductMax[r] - COAST_SUBDUCT_SUP_LOW) / COAST_SUBDUCT_SUP_RANGE)
                : 0;

            const elevBeforeCoast = r_elevation[r];
            const isPassiveCoast = !coastConvergent[r];

            // Layer 1: Coastal fractal noise
            // Passive: lower freq + amp → broad bays, gentle peninsulas
            // Active: higher freq + amp → rugged, fjord-like
            const falloff1 = (1 - t) * (1 - t);
            const stressAmp1 = 1 + sn * 5;
            const coastFreq = isPassiveCoast ? COAST_PASSIVE_FREQ : COAST_ACTIVE_FREQ;
            const coastAmp = isPassiveCoast ? COAST_PASSIVE_AMP : COAST_ACTIVE_AMP;
            let n1 = cNoise.fbm(x * coastFreq + 3.7, y * coastFreq + 7.1, z * coastFreq + 2.3, 5, 0.55);
            let coastNoise1 = n1 * coastAmp * falloff1 * stressAmp1;
            if (subSup > 0 && coastNoise1 > 0) {
                coastNoise1 *= (1 - subSup);
            }
            r_elevation[r] += coastNoise1;

            // Layer 3: Coastline-aware domain warping
            // Passive: wider influence (warp dies slower). Active: concentrated near coast.
            const warpReach = isPassiveCoast ? COAST_WARP_PASSIVE_REACH : COAST_WARP_ACTIVE_REACH;
            const falloffW = Math.max(0, 1 - t * warpReach);
            if (falloffW > 0) {
                const warpAmt = COAST_WARP_AMT * falloffW * (1 + sn * 2);
                const dwx = cNoise3.fbm(x * 3 + 11.3, y * 3 + 4.7, z * 3 + 8.2, 3, 0.6) * warpAmt;
                const dwy = cNoise3.fbm(x * 3 + 2.9,  y * 3 + 9.4, z * 3 + 1.6, 3, 0.6) * warpAmt;
                const dwz = cNoise3.fbm(x * 3 + 7.5,  y * 3 + 0.3, z * 3 + 5.9, 3, 0.6) * warpAmt;
                const origN = noise.fbm(x, y, z) * noiseMag;
                const warpN = noise.fbm(x + dwx, y + dwy, z + dwz) * noiseMag;
                let warpDelta = (warpN - origN) * falloffW;
                if (subSup > 0 && warpDelta > 0) {
                    warpDelta *= (1 - subSup);
                }
                r_elevation[r] += warpDelta;
            }

            // Clamp ocean-plate cells: coastal noise (layers 1 & 3) should roughen
            // the coastline but not create false land on ocean plates.
            // Only the intentional island scatter below may push ocean cells above 0.
            if (r_isOcean[r] && r_elevation[r] > OCEAN_FLOOR_CLAMP) {
                r_elevation[r] = OCEAN_FLOOR_CLAMP;
            }

            // Layer 2: Island scattering — peaked volcanic islands, not flat blobs.
            // The bump is shaped by ridged noise so that each island cluster has
            // a sharp central peak tapering to steep flanks.  Cells that would
            // only barely breach sea level stay submerged instead.
            if (r_isOcean[r] && dBdry[r] > 0
                && dBdry[r] <= Math.max(4, Math.round(ISLAND_DIST_BASE * scaleFactor))
                && subSup < ISLAND_SUBDUCT_MAX) {
                const islandN = cNoise2.fbm(x * ISLAND_FREQ + 5.1, y * ISLAND_FREQ + 9.3, z * ISLAND_FREQ + 2.7, 4, 0.5);
                const threshold = ISLAND_THRESHOLD_BASE - sn * ISLAND_THRESHOLD_STRESS;
                if (islandN > threshold) {
                    const excess = (islandN - threshold) / (1 - threshold);
                    const distFade = 1 - (dBdry[r] / Math.max(4, Math.round(ISLAND_DIST_BASE * scaleFactor)));
                    // Peak mask: ridged noise produces sparse tall spikes.
                    const peakN = cNoise2.ridgedFbm(x * ISLAND_FREQ * 2.5 + 31.7, y * ISLAND_FREQ * 2.5 + 17.3, z * ISLAND_FREQ * 2.5 + 8.9, 3, 0.5);
                    const peakMask = peakN * peakN; // [0, 1] — most values near 0
                    let bump = excess * excess * ISLAND_BUMP_AMP * (1 + sn * 2) * distFade * peakMask;
                    bump *= (1 - subSup / ISLAND_SUBDUCT_MAX);
                    // Only apply if the bump would push clearly above sea level.
                    // Cells with tiny bumps stay submerged — no flat fringe.
                    if (bump + r_elevation[r] > ISLAND_PEAK_FLOOR) {
                        r_elevation[r] += bump;
                    }
                }
            }

            dl_coastal[r] += r_elevation[r] - elevBeforeCoast;
        }
    }

    _timing.push({ stage: 'Coastal roughening', ms: performance.now() - _t0 }); _t0 = performance.now();

    // Island arcs — ocean-ocean convergent boundary uplift
    {
        const arcNoise = new SimplexNoise(seed + 307);
        const maxArcDist = Math.max(5, Math.round(ARC_DIST_BASE * scaleFactor));

        const arcSeeds = [];
        const arcDist = new Float32Array(numRegions);
        arcDist.fill(maxArcDist + 1);
        const arcStress = new Float32Array(numRegions);

        for (let r = 0; r < numRegions; r++) {
            if (r_boundaryType[r] === 1 && r_bothOcean[r] && r_subductFactor[r] < ARC_SUBDUCT_THRESH) {
                arcSeeds.push(r);
                arcDist[r] = 0;
                arcStress[r] = Math.min(1, r_stress[r] / maxStress);
            }
        }

        let aq = 0;
        while (aq < arcSeeds.length) {
            const r = arcSeeds[aq++];
            const nd = arcDist[r] + 1;
            if (nd > maxArcDist) continue;
            const plate = r_plate[r];
            for (let ni = adjOffset[r], niEnd = adjOffset[r + 1]; ni < niEnd; ni++) {
                const nr = adjList[ni];
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

            const peakDist = Math.max(ARC_PEAK_DIST_BASE, ARC_PEAK_DIST_BASE * scaleFactor);
            const sigma = Math.max(ARC_SIGMA_BASE_VAL, ARC_SIGMA_BASE_VAL * scaleFactor);
            const distWeight = Math.exp(-0.5 * ((d - peakDist) / sigma) ** 2);

            const n = arcNoise.ridgedFbm(x * 4, y * 4, z * 4, 4, 2.0, 0.5, 1.0);
            const threshold = ARC_THRESHOLD;
            if (n > threshold) {
                const excess = (n - threshold) / (1 - threshold);
                let uplift = excess * excess * ARC_UPLIFT_AMP * distWeight * (0.5 + arcStress[r]);
                // On ocean plates, cap uplift so arcs form islands with realistic peaks,
                // not broad elevated plateaus.  The cap allows volcanic-island-scale
                // peaks (~500–2000m) while preventing continent-sized uplift.
                if (r_isOcean[r]) {
                    const maxOceanUplift = Math.max(0, -r_elevation[r] + MAX_OCEAN_ARC_ELEV);
                    uplift = Math.min(uplift, maxOceanUplift);
                }
                r_elevation[r] += uplift;
                dl_coastal[r] += uplift;
            }
        }
    }

    _timing.push({ stage: 'Island arcs', ms: performance.now() - _t0 }); _t0 = performance.now();

    // Volcanic arcs — discrete stratovolcano edifices along subduction zones.
    // Placed at quasi-regular spacing along convergent boundaries where at least
    // one plate is oceanic — includes both ocean-continent AND ocean-ocean convergence.
    {
        const arcVolcNoise = new SimplexNoise(seed + 713);
        const VOLC_MIN_SPACING_SQ = VOLC_MIN_SPACING * VOLC_MIN_SPACING;

        // Collect candidate cells at convergent boundaries with oceanic involvement (overriding side)
        const candidates = [];
        for (let r = 0; r < numRegions; r++) {
            if (r_boundaryType[r] === 1 && r_hasOcean[r]
                && r_subductFactor[r] < VOLC_SUBDUCT_THRESH) {
                const stressLocal = Math.min(1, r_stress[r] / maxStress);
                // Score by stress + noise for selection priority
                const x = r_xyz[3 * r], y = r_xyz[3 * r + 1], z = r_xyz[3 * r + 2];
                const score = stressLocal + 0.3 * arcVolcNoise.noise3D(x * 8, y * 8, z * 8);
                candidates.push({ r, x, y, z, score, stressLocal });
            }
        }
        // Sort by score descending — highest-stress cells placed first
        candidates.sort((a, b) => b.score - a.score);

        // Greedy minimum-distance placement: skip candidates too close to an existing volcano
        const volcPositions = [];
        for (let ci = 0; ci < candidates.length; ci++) {
            const c = candidates[ci];
            let tooClose = false;
            for (let vi = 0; vi < volcPositions.length; vi++) {
                const v = volcPositions[vi];
                const dot = c.x * v.x + c.y * v.y + c.z * v.z;
                const distSq = Math.max(0, 2 * (1 - dot));
                if (distSq < VOLC_MIN_SPACING_SQ) { tooClose = true; break; }
            }
            if (tooClose) continue;

            const heightVar = VOLC_HEIGHT_VAR_BASE + VOLC_HEIGHT_VAR_RANGE * arcVolcNoise.noise3D(c.x * 10, c.y * 10, c.z * 10);
            const height = VOLC_HEIGHT_BASE * (0.5 + c.stressLocal) * heightVar;
            const sigmaVar = VOLC_SIGMA_VAR_BASE + VOLC_SIGMA_VAR_RANGE * arcVolcNoise.noise3D(c.x * 5 + 17.3, c.y * 5 + 9.1, c.z * 5 + 4.7);
            volcPositions.push({ x: c.x, y: c.y, z: c.z, height, sigma: VOLC_SIGMA_BASE * sigmaVar });
        }

        // Pre-compute invS2 per volcano (avoids redundant division in inner loop)
        for (let vi = 0; vi < volcPositions.length; vi++) {
            const v = volcPositions[vi];
            v.invS2 = -0.5 / (v.sigma * v.sigma);
        }

        // Spatial grid for fast volcano lookup — bucket by (lat, lon) cell.
        // Volcanoes affect regions within ~0.8° so a 5° grid with neighbor checks suffices.
        const VLAT_BINS = 36, VLON_BINS = 72;
        const volcGrid = new Array(VLAT_BINS * VLON_BINS);
        for (let vi = 0; vi < volcPositions.length; vi++) {
            const v = volcPositions[vi];
            const lat = Math.asin(Math.max(-1, Math.min(1, v.y)));
            const lon = Math.atan2(v.x, v.z);
            const bi = Math.max(0, Math.min(VLAT_BINS - 1, Math.floor((lat + Math.PI / 2) / Math.PI * VLAT_BINS)));
            const bj = Math.max(0, Math.min(VLON_BINS - 1, Math.floor((lon + Math.PI) / (2 * Math.PI) * VLON_BINS)));
            const bin = bi * VLON_BINS + bj;
            if (!volcGrid[bin]) volcGrid[bin] = [];
            volcGrid[bin].push(vi);
        }

        // Apply Gaussian cones — only check volcanoes in nearby grid cells
        for (let r = 0; r < numRegions; r++) {
            const rx = r_xyz[3 * r], ry = r_xyz[3 * r + 1], rz = r_xyz[3 * r + 2];
            const rLat = Math.asin(Math.max(-1, Math.min(1, ry)));
            const rLon = Math.atan2(rx, rz);
            const rbi = Math.max(0, Math.min(VLAT_BINS - 1, Math.floor((rLat + Math.PI / 2) / Math.PI * VLAT_BINS)));
            const rbj = Math.max(0, Math.min(VLON_BINS - 1, Math.floor((rLon + Math.PI) / (2 * Math.PI) * VLON_BINS)));

            let volcUplift = 0;
            // Check 3×3 neighborhood of grid cells
            for (let di = -1; di <= 1; di++) {
                const bi = rbi + di;
                if (bi < 0 || bi >= VLAT_BINS) continue;
                for (let dj = -1; dj <= 1; dj++) {
                    const bj = ((rbj + dj) % VLON_BINS + VLON_BINS) % VLON_BINS;
                    const cell = volcGrid[bi * VLON_BINS + bj];
                    if (!cell) continue;
                    for (let ci = 0; ci < cell.length; ci++) {
                        const v = volcPositions[cell[ci]];
                        const dot = rx * v.x + ry * v.y + rz * v.z;
                        if (dot < 0.9999) continue;
                        const angleSq = Math.max(0, 2 * (1 - dot));
                        const gauss = Math.exp(angleSq * v.invS2);
                        if (gauss > 0.01) volcUplift += v.height * gauss;
                    }
                }
            }
            if (volcUplift > 0.001) {
                r_elevation[r] += volcUplift;
                dl_hotspot[r] += volcUplift;
            }
        }
    }

    // Large Igneous Provinces — hotspot-driven flood basalt plateaus.
    // Spawned at continental hotspot positions backed by strong mantle upwelling.
    // Collected during hotspot generation below, applied here.
    const lipSites = [];  // populated by hotspot loop if continental + strong upwelling

    _timing.push({ stage: 'Volcanic arcs', ms: performance.now() - _t0 }); _t0 = performance.now();

    // Hotspot volcanism — mantle plumes with drift chains
    // Dual-component model: broad thermal swell + volcanic peak with
    // domain-warped shape distortion, age-dependent texture, drift
    // elongation, summit calderas, and radial rift-zone ridges.
    {
        // Hotspot constants imported from terrain-config.js

        const hsRng = makeRng(seed + 999);
        const hsNoise  = new SimplexNoise(seed + 501);
        const hsNoise2 = new SimplexNoise(seed + 502); // for domain warp
        const hsNoise3 = new SimplexNoise(seed + 503); // for rift angles

        // Build list of all dome sources
        // Each dome carries: position, strength, sigma, chainIndex (0 = active),
        // chainLength, drift direction, and tangent frame for rift ridges.
        const domes = [];

        // Tangent frame for drift elongation & rift ridges
        // tU = drift projected onto tangent plane at dome center
        // tV = cross(normal, tU) — perpendicular in tangent plane
        const buildTangentFrame = (px, py, pz, dx, dy, dz) => {
            const dd = dx*px + dy*py + dz*pz;
            let ux = dx - dd*px, uy = dy - dd*py, uz = dz - dd*pz;
            const uLen = Math.sqrt(ux*ux + uy*uy + uz*uz) || 1;
            ux /= uLen; uy /= uLen; uz /= uLen;
            const vx = py*uz - pz*uy, vy = pz*ux - px*uz, vz = px*uy - py*ux;
            return { ux, uy, uz, vx, vy, vz };
        };

        // Generate hotspot positions as random points on the unit sphere
        // (resolution-independent) then find nearest region for plate lookup.
        const hsPosRng = makeRng(seed + 1001);
        const findNearestR = (px, py, pz) => {
            let bestDot = -2, bestR = 0;
            for (let r = 0; r < numRegions; r++) {
                const dot = px * r_xyz[3*r] + py * r_xyz[3*r+1] + pz * r_xyz[3*r+2];
                if (dot > bestDot) { bestDot = dot; bestR = r; }
            }
            return bestR;
        };
        // Spawn satellite sub-cones around a parent dome for organic multi-lobed shape
        const spawnSatellites = (parent, satRng) => {
            for (let s = 0; s < DOME_SATELLITE_COUNT; s++) {
                // Random direction on tangent plane at parent position
                const angle = satRng() * 2 * Math.PI;
                const offDist = parent.sigma * DOME_SATELLITE_OFFSET * (0.5 + satRng() * 0.5);
                const offX = Math.cos(angle) * parent.ux + Math.sin(angle) * parent.vx;
                const offY = Math.cos(angle) * parent.uy + Math.sin(angle) * parent.vy;
                const offZ = Math.cos(angle) * parent.uz + Math.sin(angle) * parent.vz;
                // Step along sphere surface
                const cosA = Math.cos(offDist), sinA = Math.sin(offDist);
                let sx = parent.x * cosA + offX * sinA;
                let sy = parent.y * cosA + offY * sinA;
                let sz = parent.z * cosA + offZ * sinA;
                const sLen = Math.sqrt(sx * sx + sy * sy + sz * sz);
                sx /= sLen; sy /= sLen; sz /= sLen;
                const satFrame = buildTangentFrame(sx, sy, sz, parent.dx, parent.dy, parent.dz);
                domes.push({
                    x: sx, y: sy, z: sz,
                    strength: parent.strength * DOME_SATELLITE_STRENGTH,
                    baseStrength: parent.baseStrength * DOME_SATELLITE_STRENGTH,
                    sigma: parent.sigma * DOME_SATELLITE_SIGMA,
                    chainIndex: parent.chainIndex, chainLength: parent.chainLength,
                    dx: parent.dx, dy: parent.dy, dz: parent.dz,
                    ...satFrame,
                    riftAngles: [],  // satellites don't have rift zones
                });
            }
        };

        for (let h = 0; h < NUM_HOTSPOTS; h++) {
            const hStrength = DOME_STRENGTH * (0.4 + hsRng() * 1.2);
            const hSigma    = DOME_SIGMA * (0.4 + hsRng() * 1.2);
            const hDecay    = CHAIN_DECAY + (hsRng() - 0.5) * 0.35;
            const hLength   = Math.max(3, CHAIN_LENGTH + Math.round((hsRng() - 0.5) * 10));

            // Position on unit sphere — biased toward mantle upwelling zones.
            // Generate multiple candidates, score by upwelling strength, pick best.
            let hx, hy, hz;
            if (r_mantleNorm) {
                let bestScore = -Infinity;
                for (let c = 0; c < HOTSPOT_UPWELLING_CANDIDATES; c++) {
                    const cTheta = 2 * Math.PI * hsPosRng();
                    const cCosPhi = 2 * hsPosRng() - 1;
                    const cSinPhi = Math.sqrt(1 - cCosPhi * cCosPhi);
                    const cx = cSinPhi * Math.cos(cTheta);
                    const cy = cSinPhi * Math.sin(cTheta);
                    const cz = cCosPhi;
                    const cr = findNearestR(cx, cy, cz);
                    const score = r_mantleNorm[cr] + (hsPosRng() - 0.5) * HOTSPOT_UPWELLING_JITTER;
                    if (score > bestScore) { bestScore = score; hx = cx; hy = cy; hz = cz; }
                }
            } else {
                const theta = 2 * Math.PI * hsPosRng();
                const cosPhiVal = 2 * hsPosRng() - 1;
                const sinPhiVal = Math.sqrt(1 - cosPhiVal * cosPhiVal);
                hx = sinPhiVal * Math.cos(theta);
                hy = sinPhiVal * Math.sin(theta);
                hz = cosPhiVal;
            }
            const centerR = findNearestR(hx, hy, hz);
            const plate = r_plate[centerR];
            const pv = plateVec[plate];
            if (!pv) continue;
            const drift = plateVelocityAt(plateVec, plate, hx, hy, hz);
            const driftLen = Math.sqrt(drift[0]*drift[0] + drift[1]*drift[1] + drift[2]*drift[2]);
            if (driftLen < 1e-6) continue;
            drift[0] /= driftLen; drift[1] /= driftLen; drift[2] /= driftLen;

            const isOceanHotspot = plateIsOcean.has(plate);
            const isContinental = !isOceanHotspot;

            // Continental hotspots use plateau mode: wider, flatter, bigger caldera
            const sigmaScale = isContinental ? CONT_HOTSPOT_SIGMA_MULT : 1.0;
            const strengthScale = isContinental ? CONT_HOTSPOT_STRENGTH_MULT : 1.0;
            const oceanBoost = isOceanHotspot ? DOME_OCEAN_BOOST : 1.0;
            const effectiveSigma = hSigma * sigmaScale;
            const effectiveStrength = hStrength * strengthScale * oceanBoost;

            // Continental hotspot over strong upwelling → spawn LIP (flood basalt plateau)
            // Continental hotspot: LIP spawns at the END of the chain (oldest point),
            // representing the initial plume head impact. The active dome and trail
            // are the ongoing Yellowstone-style volcanism at a different location.
            // LIP position is computed after the chain trail is built (see below).

            // Rift angles: 2-3 evenly spaced rifts for active dome, fewer for older
            const baseRiftAngle = hsNoise3.noise3D(hx*10, hy*10, hz*10) * Math.PI;
            const riftAnglesForDome = (ci, cl) => {
                if (ci === 0) return [baseRiftAngle, baseRiftAngle + Math.PI * 0.6, baseRiftAngle - Math.PI * 0.6];
                if (ci === 1) return [baseRiftAngle, baseRiftAngle + Math.PI];
                if (ci <= Math.floor(cl * 0.4)) return [baseRiftAngle];
                return [];
            };

            // Active dome
            const frame0 = buildTangentFrame(hx, hy, hz, drift[0], drift[1], drift[2]);
            domes.push({
                x: hx, y: hy, z: hz,
                strength: effectiveStrength, baseStrength: hStrength * strengthScale,
                sigma: effectiveSigma,
                chainIndex: 0, chainLength: hLength,
                dx: drift[0], dy: drift[1], dz: drift[2],
                ...frame0,
                riftAngles: riftAnglesForDome(0, hLength),
                isContinental,
            });
            spawnSatellites(domes[domes.length - 1], hsRng);

            // Chain trail
            let perpX = drift[1] * hz - drift[2] * hy;
            let perpY = drift[2] * hx - drift[0] * hz;
            let perpZ = drift[0] * hy - drift[1] * hx;
            const perpLen = Math.sqrt(perpX*perpX + perpY*perpY + perpZ*perpZ) || 1;
            perpX /= perpLen; perpY /= perpLen; perpZ /= perpLen;

            let cx = hx, cy = hy, cz = hz;
            let str = effectiveStrength;
            let baseStr = hStrength * strengthScale;
            for (let c = 0; c < hLength; c++) {
                const ci = c + 1; // chainIndex (0 = active, 1+ = trail)
                const decayJitter = hDecay * (0.7 + hsRng() * 0.6);
                str *= decayJitter;
                baseStr *= decayJitter;
                const stepSpacing = CHAIN_SPACING * (0.3 + hsRng() * 1.4);
                // #4: age broadening — older domes get wider
                const ageBroadening = 1.0 + ci * DOME_AGE_BROADENING;
                const stepSigma = effectiveSigma * (0.5 + hsRng() * 1.0) * ageBroadening;
                const wobble = (hsRng() - 0.5) * 0.8;
                const ddx = -drift[0] + perpX * wobble;
                const ddy = -drift[1] + perpY * wobble;
                const ddz = -drift[2] + perpZ * wobble;
                const dot = ddx * cx + ddy * cy + ddz * cz;
                let tx = ddx - dot * cx, ty = ddy - dot * cy, tz = ddz - dot * cz;
                const tLen = Math.sqrt(tx*tx + ty*ty + tz*tz);
                if (tLen < 1e-6) break;
                tx /= tLen; ty /= tLen; tz /= tLen;
                const cosA = Math.cos(stepSpacing);
                const sinA = Math.sin(stepSpacing);
                cx = cx * cosA + tx * sinA;
                cy = cy * cosA + ty * sinA;
                cz = cz * cosA + tz * sinA;
                const nL = Math.sqrt(cx*cx + cy*cy + cz*cz);
                cx /= nL; cy /= nL; cz /= nL;

                const frameC = buildTangentFrame(cx, cy, cz, drift[0], drift[1], drift[2]);
                domes.push({
                    x: cx, y: cy, z: cz,
                    strength: str, baseStrength: baseStr,
                    sigma: stepSigma,
                    chainIndex: ci, chainLength: hLength,
                    dx: drift[0], dy: drift[1], dz: drift[2],
                    ...frameC,
                    riftAngles: riftAnglesForDome(ci, hLength),
                    isContinental,
                });
                // Only spawn satellites on younger islands (older ones erode to single peaks)
                if (ci <= Math.ceil(hLength * 0.4)) {
                    spawnSatellites(domes[domes.length - 1], hsRng);
                }
            }

            // Spawn LIP at the oldest end of the chain (plume head impact site).
            // LIPs form regardless of ocean/land — the plume head erupts wherever
            // it arrives. Continental LIPs are more prominent (Deccan, Siberian Traps);
            // oceanic LIPs form oceanic plateaus (Ontong Java).
            {
                const lipR = findNearestR(cx, cy, cz);
                const upwelling = r_mantleNorm ? Math.max(0, r_mantleNorm[lipR]) : 0.5;
                const landBoost = r_isOcean[lipR] ? 0.6 : 1.0;
                const baseLipStr = LIP_HEIGHT * (0.5 + hsRng()) * (0.5 + upwelling) * landBoost;
                const baseLipSigma = LIP_SIGMA * (0.7 + 0.6 * hsRng());

                // Main LIP body
                lipSites.push({ x: cx, y: cy, z: cz, sigma: baseLipSigma, height: baseLipStr });

                // Irregular lobes: smaller overlapping Gaussians at random offsets
                // Creates the irregular outline of real flood basalt provinces
                const lipFrame = buildTangentFrame(cx, cy, cz, drift[0], drift[1], drift[2]);
                for (let lb = 0; lb < LIP_LOBE_COUNT; lb++) {
                    const angle = hsRng() * 2 * Math.PI;
                    const dist = baseLipSigma * LIP_LOBE_OFFSET * (0.4 + hsRng() * 0.6);
                    const offX = Math.cos(angle) * lipFrame.ux + Math.sin(angle) * lipFrame.vx;
                    const offY = Math.cos(angle) * lipFrame.uy + Math.sin(angle) * lipFrame.vy;
                    const offZ = Math.cos(angle) * lipFrame.uz + Math.sin(angle) * lipFrame.vz;
                    const cosD = Math.cos(dist), sinD = Math.sin(dist);
                    let lx = cx * cosD + offX * sinD;
                    let ly = cy * cosD + offY * sinD;
                    let lz = cz * cosD + offZ * sinD;
                    const ll = Math.sqrt(lx * lx + ly * ly + lz * lz);
                    lx /= ll; ly /= ll; lz /= ll;
                    lipSites.push({
                        x: lx, y: ly, z: lz,
                        sigma: baseLipSigma * LIP_LOBE_SIGMA * (0.6 + hsRng() * 0.8),
                        height: baseLipStr * LIP_LOBE_STRENGTH * (0.5 + hsRng() * 0.5),
                    });
                }
            }
        }

        // Pre-compute per-dome constants
        for (let d = 0; d < domes.length; d++) {
            const dm = domes[d];
            // Peak threshold — 5.5σ (slight increase from 5 for drift elongation)
            dm.cosThreshPeak = Math.cos(dm.sigma * DOME_PEAK_THRESH_SIGMA);
            dm.invS2 = -0.5 / (dm.sigma * dm.sigma);
            // Swell uses base strength (no ocean boost) so it doesn't
            // broadly raise ocean floor — only peaks punch through.
            const swMult = dm.isContinental ? CONT_HOTSPOT_SWELL_MULT : 1.0;
            const swSigma = dm.sigma * SWELL_SIGMA_MULT * swMult;
            dm.swellSigma = swSigma;
            dm.swellStrength = dm.baseStrength * SWELL_STR_MULT;
            dm.cosThreshSwell = Math.cos(swSigma * DOME_SWELL_THRESH_SIGMA);
            dm.invS2Swell = -0.5 / (swSigma * swSigma);
            // #5: drift elongation scale factor (1/1.4 for parallel axis)
            dm.driftStretch = 1.0 / DOME_DRIFT_STRETCH;
            // #6: caldera — continental hotspots get wider, deeper calderas
            dm.hasCaldera = dm.chainIndex <= 1 && dm.strength > DOME_CALDERA_STRENGTH_MIN;
            const calSigFrac = dm.isContinental ? CONT_HOTSPOT_CALDERA_SIGMA_FRAC : DOME_CALDERA_SIGMA_FRAC;
            const calDepFrac = dm.isContinental ? CONT_HOTSPOT_CALDERA_DEPTH_FRAC : DOME_CALDERA_DEPTH_FRAC;
            dm.calderaSigma = dm.sigma * calSigFrac;
            dm.calderaDepth = dm.strength * calDepFrac;
            dm.invS2Caldera = -0.5 / (dm.calderaSigma * dm.calderaSigma);
            // Age factor for texture (0 = active = most textured, 1 = oldest = smooth)
            dm.ageFactor = dm.chainLength > 0 ? dm.chainIndex / dm.chainLength : 0;
        }

        // Spatial grid for dome lookup — swell radius can be wide (~3-5°),
        // so use 10° bins with a 1-cell neighbor search.
        const DLAT_BINS = 18, DLON_BINS = 36;
        const domeGrid = new Array(DLAT_BINS * DLON_BINS);
        for (let d = 0; d < domes.length; d++) {
            const dm = domes[d];
            const lat = Math.asin(Math.max(-1, Math.min(1, dm.y)));
            const lon = Math.atan2(dm.x, dm.z);
            const bi = Math.max(0, Math.min(DLAT_BINS - 1, Math.floor((lat + Math.PI / 2) / Math.PI * DLAT_BINS)));
            const bj = Math.max(0, Math.min(DLON_BINS - 1, Math.floor((lon + Math.PI) / (2 * Math.PI) * DLON_BINS)));
            const bin = bi * DLON_BINS + bj;
            if (!domeGrid[bin]) domeGrid[bin] = [];
            domeGrid[bin].push(d);
        }

        // Apply dome uplift — only check domes in nearby grid cells
        for (let r = 0; r < numRegions; r++) {
            const rx = r_xyz[3*r], ry = r_xyz[3*r+1], rz = r_xyz[3*r+2];
            const rLat = Math.asin(Math.max(-1, Math.min(1, ry)));
            const rLon = Math.atan2(rx, rz);
            const rbi = Math.max(0, Math.min(DLAT_BINS - 1, Math.floor((rLat + Math.PI / 2) / Math.PI * DLAT_BINS)));
            const rbj = Math.max(0, Math.min(DLON_BINS - 1, Math.floor((rLon + Math.PI) / (2 * Math.PI) * DLON_BINS)));

            // Single pass: check nearby domes, track if any swell/peak is hit
            let totalUplift = 0;
            let totalSwellUplift = 0;
            let weightedAge = 0;
            let ageWeightSum = 0;
            let nearPeak = false;
            let shapeWarp = 1.0, shapeWarpSq = 1.0;
            let hasContrib = false;

            for (let di = -1; di <= 1; di++) {
                const bi = rbi + di;
                if (bi < 0 || bi >= DLAT_BINS) continue;
                for (let dj = -1; dj <= 1; dj++) {
                    const bj = ((rbj + dj) % DLON_BINS + DLON_BINS) % DLON_BINS;
                    const cell = domeGrid[bi * DLON_BINS + bj];
                    if (!cell) continue;
                    for (let ci = 0; ci < cell.length; ci++) {
                        const dm = domes[cell[ci]];
                        const cdot = dm.x * rx + dm.y * ry + dm.z * rz;
                        if (cdot > dm.cosThreshSwell) hasContrib = true;
                        if (cdot > dm.cosThreshPeak && !nearPeak) nearPeak = true;
                    }
                }
            }
            if (!hasContrib) continue;

            // Compute shape warp only if near a peak (expensive noise)
            if (nearPeak) {
                const hsWarpScale = DOME_SHAPE_WARP_FREQ;
                const wx = hsNoise2.fbm(rx * hsWarpScale + 5.1, ry * hsWarpScale + 3.7, rz * hsWarpScale + 9.2, 2, 0.5) * DOME_SHAPE_WARP_AMP;
                const wy = hsNoise2.fbm(rx * hsWarpScale + 11.3, ry * hsWarpScale + 7.1, rz * hsWarpScale + 2.9, 2, 0.5) * DOME_SHAPE_WARP_AMP;
                const wz = hsNoise2.fbm(rx * hsWarpScale + 1.7, ry * hsWarpScale + 13.5, rz * hsWarpScale + 6.4, 2, 0.5) * DOME_SHAPE_WARP_AMP;
                shapeWarp = 1.0 + DOME_SHAPE_WARP_DETAIL_AMP * hsNoise.fbm(
                    (rx + wx) * DOME_SHAPE_WARP_DETAIL_FREQ + 3.2, (ry + wy) * DOME_SHAPE_WARP_DETAIL_FREQ + 7.8, (rz + wz) * DOME_SHAPE_WARP_DETAIL_FREQ + 1.5, 4, 0.5
                );
                shapeWarpSq = shapeWarp * shapeWarp;
            }

            for (let di = -1; di <= 1; di++) {
                const bi = rbi + di;
                if (bi < 0 || bi >= DLAT_BINS) continue;
                for (let dj = -1; dj <= 1; dj++) {
                    const bj = ((rbj + dj) % DLON_BINS + DLON_BINS) % DLON_BINS;
                    const cell = domeGrid[bi * DLON_BINS + bj];
                    if (!cell) continue;
                    for (let ci = 0; ci < cell.length; ci++) {
                        const dm = domes[cell[ci]];
                const dot = dm.x * rx + dm.y * ry + dm.z * rz;

                // --- Thermal swell (smooth, no warp) ---
                if (dot > dm.cosThreshSwell) {
                    const swAngleSq = 2 * (1 - dot);
                    totalSwellUplift += dm.swellStrength * Math.exp(swAngleSq * dm.invS2Swell);
                }

                // --- Volcanic peak (warped, textured) ---
                if (dot < dm.cosThreshPeak) continue;

                // #5: drift-direction elongation
                // Decompose angular offset into drift-parallel and drift-perpendicular
                // by projecting the tangent-plane offset vector onto the dome's frame
                const offX = rx - dot * dm.x, offY = ry - dot * dm.y, offZ = rz - dot * dm.z;
                const parComp  = offX * dm.ux + offY * dm.uy + offZ * dm.uz;
                const perpComp = offX * dm.vx + offY * dm.vy + offZ * dm.vz;
                // Stretch parallel component (makes profile elongated along drift)
                const stretchedParSq = (parComp * dm.driftStretch) * (parComp * dm.driftStretch);
                const angleSq = stretchedParSq + perpComp * perpComp;

                let gauss = Math.exp(angleSq * shapeWarpSq * dm.invS2);

                // #7: radial rift-zone ridges — boost Gaussian along rift angles
                if (dm.riftAngles.length > 0 && gauss > 0.01) {
                    const angle = Math.atan2(perpComp, parComp);
                    let maxRift = 0;
                    for (let ri = 0; ri < dm.riftAngles.length; ri++) {
                        let da = angle - dm.riftAngles[ri];
                        // Wrap to [-PI, PI]
                        da = da - Math.round(da / (2 * Math.PI)) * 2 * Math.PI;
                        const c2 = Math.cos(da);
                        const riftFactor = c2 * c2 * c2 * c2; // cos^4 for tighter ridges
                        if (riftFactor > maxRift) maxRift = riftFactor;
                    }
                    gauss *= (1.0 + DOME_RIFT_BOOST * maxRift);
                }

                const peakUplift = dm.strength * gauss;
                totalUplift += peakUplift;

                // Track weighted age for texture blending
                weightedAge += dm.ageFactor * peakUplift;
                ageWeightSum += peakUplift;

                // #6: summit caldera — subtract a narrow Gaussian at center
                if (dm.hasCaldera) {
                    const calderaGauss = Math.exp(angleSq * dm.invS2Caldera);
                    totalUplift -= dm.calderaDepth * calderaGauss;
                }
            }}}

            const combinedUplift = totalSwellUplift + totalUplift;
            if (combinedUplift > 0.001) {
                // #3: age-dependent volcanic texture
                const age = ageWeightSum > 0 ? weightedAge / ageWeightSum : 0;
                // Active: dramatic gullies (0.4-1.2); Old: smooth eroded (0.7-1.0)
                const texBase = DOME_TEXTURE_BASE_WEIGHT * hsNoise.ridgedFbm(rx * 12, ry * 12, rz * 12, 4, 2.0, 0.5, 1.0);
                const texDetail = DOME_TEXTURE_DETAIL_WEIGHT * hsNoise.ridgedFbm(rx * 30, ry * 30, rz * 30, 3, 2.0, 0.5, 1.0);
                const texRaw = texBase + texDetail;
                // Blend texture range based on age
                const texMin = DOME_TEXTURE_ACTIVE_MIN + age * DOME_TEXTURE_AGE_MIN_SHIFT;   // 0.4 (active) → 0.7 (old)
                const texMax = DOME_TEXTURE_ACTIVE_MAX - age * DOME_TEXTURE_AGE_MAX_SHIFT;   // 1.2 (active) → 1.0 (old)
                const volc = texMin + (texMax - texMin) * texRaw;

                // Apply texture only to peak component; swell is smooth
                const uplift = totalSwellUplift + Math.max(0, totalUplift) * volc;
                r_elevation[r] += uplift;
                dl_hotspot[r] = uplift;
            }
        }
    }

    // Apply LIP flood basalt plateaus (sites collected from continental hotspots above)
    if (lipSites.length > 0) {
        for (let r = 0; r < numRegions; r++) {
            const rx = r_xyz[3 * r], ry = r_xyz[3 * r + 1], rz = r_xyz[3 * r + 2];
            for (let li = 0; li < lipSites.length; li++) {
                const lip = lipSites[li];
                const d = rx * lip.x + ry * lip.y + rz * lip.z;
                const angleSq = Math.max(0, 2 * (1 - d));
                const invS2 = -0.5 / (lip.sigma * lip.sigma);
                const gauss = Math.exp(angleSq * invS2);
                if (gauss > 0.01) {
                    const contrib = lip.height * gauss;
                    r_elevation[r] += contrib;
                    dl_lip[r] += contrib;
                    dl_hotspot[r] += contrib;
                }
            }
        }
    }

    _timing.push({ stage: 'Hotspot volcanism + LIPs', ms: performance.now() - _t0 }); _t0 = performance.now();

    // Uniform land noise: two independent noise layers (additive + subtractive)
    // applied to every region on a land plate or above sea level.
    // Modulated by the terrain gradient (Quilez-style): full strength on flat
    // terrain, suppressed on steep slopes where there's already plenty of detail.
    {
        const addNoise = new SimplexNoise(seed + 500);
        const subNoise = new SimplexNoise(seed + 501);
        const freq = UNIFORM_LAND_NOISE_FREQ;
        const oct  = UNIFORM_LAND_NOISE_OCTAVES;
        const amp  = UNIFORM_LAND_NOISE_AMP * noiseMag;

        const mtnRampDist = Math.max(4, Math.round(20 * scaleFactor));
        const halfFreq = freq * 0.5;
        const halfAmp = amp * 0.5;

        for (let r = 0; r < numRegions; r++) {
            if (r_isOcean[r] && r_elevation[r] <= 0) continue;

            // Slope: average absolute elevation difference to neighbors
            const ex = r_elevation[r];
            let sum = 0, count = 0;
            for (let ni = adjOffset[r], niEnd = adjOffset[r + 1]; ni < niEnd; ni++) {
                sum += Math.abs(r_elevation[adjList[ni]] - ex);
                count++;
            }
            const slopeVal = sum / (count | 1);

            // Modulation: compute cheap factors first, skip fbm if negligible
            const gradDamp = 1.0 / (1.0 + 4.0 * slopeVal);
            const elev = ex > 0 ? ex : 0;
            const elevT = elev < 0.3 ? elev / 0.3 : 1.0;
            const elevBoost = elevT * elevT * (3.0 - 2.0 * elevT);
            const basinDamp = 1.0 - 0.6 * r_basinFactor[r];
            const dm = dist_mountain[r];
            const mtnT = dm === Infinity ? 0.0 : (dm < mtnRampDist ? 1.0 - dm / mtnRampDist : 0.0);
            const modulation = Math.max(0.10, gradDamp * elevBoost * basinDamp * (1.0 + 0.5 * mtnT * mtnT));

            const i3 = 3 * r;
            const x = r_xyz[i3], y = r_xyz[i3 + 1], z = r_xyz[i3 + 2];
            const addVal = addNoise.fbm(x * halfFreq + 55.3, y * halfFreq + 18.7, z * halfFreq + 42.1, oct) * amp;
            const subVal = subNoise.fbm(x * freq + 88.9, y * freq + 33.4, z * freq + 61.6, oct) * halfAmp;
            const uniformContrib = (addVal - subVal) * modulation;
            r_elevation[r] += uniformContrib;
            dl_uniformNoise[r] = uniformContrib;
        }
    }

    _timing.push({ stage: 'Uniform land noise', ms: performance.now() - _t0 }); _t0 = performance.now();

    // Dynamic topography: broad mantle-driven vertical deflection.
    // Upwelling pushes terrain up (~350m), downwelling pulls it down (~250m).
    if (r_mantleNorm) {
        for (let r = 0; r < numRegions; r++) {
            const mn = r_mantleNorm[r];
            const dtopo = mn > 0
                ? mn * DYNAMIC_TOPO_UPLIFT
                : mn * DYNAMIC_TOPO_SUBSIDENCE;
            r_elevation[r] += dtopo;
            dl_dynamicTopo[r] = dtopo;
        }
    }

    _timing.push({ stage: 'Dynamic topography', ms: performance.now() - _t0 }); _t0 = performance.now();

    // Compress positive elevations to soften tall peaks
    for (let r = 0; r < numRegions; r++) {
        if (r_elevation[r] > 0) {
            r_elevation[r] = Math.pow(r_elevation[r], PEAK_COMPRESS_POWER);
        }
    }

    _timing.push({ stage: 'Peak compression', ms: performance.now() - _t0 }); _t0 = performance.now();

    // Isostatic adjustment: Airy isostasy compresses elevation extremes.
    // Tall mountains sink slightly under their own weight, deep basins are buoyed.
    {
        // Isostatic adjustment
        for (let r = 0; r < numRegions; r++) {
            const e = r_elevation[r];
            r_elevation[r] = e - Math.abs(e) * e * ISOSTATIC_K;
        }
    }

    _timing.push({ stage: 'Isostatic adjustment', ms: performance.now() - _t0 }); _t0 = performance.now();

    // Hypsometric curve shaping: remap land elevations toward Earth-like distribution.
    // Lots of low-lying land, fewer mid-altitude areas, rare high peaks.
    {
        const landRegions = [];
        for (let r = 0; r < numRegions; r++) {
            if (r_elevation[r] > 0) landRegions.push(r);
        }
        const n = landRegions.length;
        if (n > 1) {
            landRegions.sort((a, b) => r_elevation[a] - r_elevation[b]);
            const minLandElev = r_elevation[landRegions[0]];
            const maxLandElev = r_elevation[landRegions[n - 1]];
            const range = maxLandElev - minLandElev;

            if (range > 0.01) {
                // Hypsometric curve shaping
                for (let i = 0; i < n; i++) {
                    const r = landRegions[i];
                    const rank = i / (n - 1); // 0 to 1 percentile

                    // Target elevation percentile from hypsometric curve
                    let targetPct;
                    if (rank < HYPS_LOW_BREAK) {
                        // Low plains: 60% of area in bottom 25% of elevation range
                        targetPct = HYPS_LOW_ELEV_FRAC * (rank / HYPS_LOW_BREAK);
                    } else if (rank < HYPS_MID_BREAK) {
                        // Moderate highlands
                        targetPct = HYPS_LOW_ELEV_FRAC + HYPS_MID_ELEV_FRAC * ((rank - HYPS_LOW_BREAK) / (HYPS_MID_BREAK - HYPS_LOW_BREAK));
                    } else {
                        // Mountain peaks: power curve for rare tall peaks
                        const t = (rank - HYPS_MID_BREAK) / (1 - HYPS_MID_BREAK);
                        targetPct = (HYPS_LOW_ELEV_FRAC + HYPS_MID_ELEV_FRAC) + (1 - HYPS_LOW_ELEV_FRAC - HYPS_MID_ELEV_FRAC) * Math.pow(t, HYPS_HIGH_POWER);
                    }

                    const targetElev = minLandElev + targetPct * range;
                    r_elevation[r] = r_elevation[r] * (1 - HYPS_BLEND) + targetElev * HYPS_BLEND;
                }
            }
        }
    }

    _timing.push({ stage: 'Hypsometric curve shaping', ms: performance.now() - _t0 }); _t0 = performance.now();

    // Fill interior seas: any below-sea-level land-plate cell that can't reach
    // the ocean through a continuous path of below-sea-level cells is an artifact.
    // BFS from ocean cells through sub-sea-level terrain; anything not reached gets raised.
    {
        const visited = new Uint8Array(numRegions);
        const queue = [];
        // Seed BFS from all ocean-plate cells
        for (let r = 0; r < numRegions; r++) {
            if (r_isOcean[r]) {
                visited[r] = 1;
                queue.push(r);
            }
        }
        // Flood through any cell at or below sea level
        let qi = 0;
        while (qi < queue.length) {
            const r = queue[qi++];
            for (let ni = adjOffset[r], niEnd = adjOffset[r + 1]; ni < niEnd; ni++) {
                const nb = adjList[ni];
                if (!visited[nb] && r_elevation[nb] <= 0) {
                    visited[nb] = 1;
                    queue.push(nb);
                }
            }
        }
        // Raise unvisited below-sea-level land-plate cells
        // Fill level imported from config
        for (let r = 0; r < numRegions; r++) {
            if (!r_isOcean[r] && !visited[r] && r_elevation[r] <= 0) {
                r_elevation[r] = FILL_LEVEL;
            }
        }
    }

    _timing.push({ stage: 'Fill interior seas', ms: performance.now() - _t0 });

    const debugLayers = { base: dl_base, tectonic: dl_tectonic, noise: dl_noise, interior: dl_interior, coastal: dl_coastal, ocean: dl_ocean, hotspot: dl_hotspot, lip: dl_lip, tecActivity: dl_tecActivity, margins: dl_margins, backArc: dl_backArc, foldRidge: dl_foldRidge, orogenicPower: dl_orogenicPower, basin: r_basinFactor, uniformNoise: dl_uniformNoise, dynamicTopo: dl_dynamicTopo, boundaryType: r_boundaryType, subductFactor: r_subductFactor, bothOcean: r_bothOcean, hasOcean: r_hasOcean };
    if (hasSuperPlates) {
        debugLayers.superPlates = new Float32Array(superPlateData.r_superPlate);
    }
    return { r_elevation, mountain_r, coastline_r, ocean_r, r_stress, debugLayers, _timing };
}
