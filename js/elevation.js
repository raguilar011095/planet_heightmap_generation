// Elevation pipeline — 12 explicit stages.
//
// Stage 1: Tectonic state              (computeTectonicState)
// Stage 2: Spatial fields              (computeSpatialFields)
// Stage 3: Terrain classification      (classifyTerrain)
// Stage 4: Skeleton                    (buildSkeleton)        [first renderable intermediate]
// Stage 5: Tectonic-band noise         (applyTectonicBandNoise)
// Stage 6: Elevation-gated detail      (applyDetailTexture)
// Stage 7: Coastal detail              (applyCoastalDetail)
// Stage 8: Discrete edifices           (applyEdifices)
// Stage 9: Uniform background noise    (applyUniformLandNoise)
// Stage 10: Dynamic topography         (applyDynamicTopography)
// Stage 11: Final shaping              (applyFinalShaping)
// Stage 12: Topology fixup             (fixupTopology)

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
    STRESS_DIR_SMOOTH_KM, STRESS_DIR_SELF_WEIGHT,
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
    FOLD_FREQ_MULT_SCALE,
    PHASOR_NUM_KERNELS, PHASOR_WAVELENGTH_KM, PHASOR_BANDWIDTH_KM,
    PHASOR_ORIENTATION_JITTER, PHASOR_AMPLITUDE, PHASOR_BIAS,
    PHASOR_STRESS_THRESHOLD, PHASOR_ELEV_THRESHOLD,
    PHASOR_ELEV_RAMP_RANGE, PHASOR_FOLDBELT_FLOOR,
    PHASOR_SF_KERNEL_MAX, PHASOR_SF_GATE_FULL, PHASOR_SF_GATE_ZERO,
    PHASOR_DIRECTION_PERP, PHASOR_DIRECTION_SMOOTHING_KM,
    PHASOR_WARP_FREQ, PHASOR_WARP_AMPLITUDE, PHASOR_WARP_OCTAVES,
    RIFT_HALF_WIDTH_BASE, RIFT_FLOOR_MULT,
    RIFT_SHOULDER_INNER_MULT, RIFT_SHOULDER_OUTER_MULT,
    RIFT_AXIS_DEPTH, RIFT_AXIS_VOLCANIC_AMP,
    RIFT_FLOOR_DEPTH, RIFT_FLOOR_TAPER, RIFT_FLOOR_VOLCANIC_AMP,
    RIFT_SHOULDER_UPLIFT, RIFT_FADEOUT_RESIDUAL,
    RIFT_SHOULDER_HEIGHT_VAR_BASE, RIFT_SHOULDER_HEIGHT_VAR_SCALE, RIFT_SHOULDER_HEIGHT_VAR_FREQ,
    RIFT_FLOOR_VAR_MIN, RIFT_SHOULDER_VAR_MIN, RIFT_WIDTH_VAR_FREQ,
    RIFT_WIDTH_ASYM_MIN, RIFT_WIDTH_ASYM_FREQ,
    BASIN_FREQ, BASIN_FACTOR_BIAS, BASIN_FACTOR_SCALE,
    FORELAND_STRESS_THRESH, FORELAND_WIDTH_FRAC, FORELAND_BASIN_DEPTH, FORELAND_PEAK_POS,
    FORELAND_BASIN_DEEPENING_BASE, FORELAND_BASIN_DEEPENING_SCALE,
    BACK_ARC_START_BASE, BACK_ARC_PEAK_BASE, BACK_ARC_END_BASE,
    BACK_ARC_DEPTH, BACK_ARC_SUBDUCT_THRESH,
    WARP_SCALE, OROGENIC_FREQ,
    NOISE_ACTIVITY_SCALE, NOISE_BASE_SCALE, NOISE_ACTIVITY_CONTRIB,
    PLATEAU_SUPPRESS_MIN, PLATEAU_SUPPRESS_SCALE,
    BASIN_AMP_SUPPRESS, CRATON_AMP_SUPPRESS,
    RIDGED_NOISE_AMP, CONTINENTAL_FREQ_MULT,
    DETAIL_NOISE_FREQ_MULT, DETAIL_NOISE_AMP,
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
    ARC_BASE_AMP, ARC_PEAK_AMP, ARC_SUBDUCT_THRESH,
    ARC_BASE_FREQ, ARC_PEAK_FREQ,
    ARC_MACRO_FREQ, ARC_MACRO_THRESH, ARC_MACRO_STRESS_WEIGHT,
    ARC_MAX_ORIGINS, ARC_ORIGIN_MIN_SPACING,
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

// ─────────────────────────────────────────────────────────────────────────
//  Preserved low-level helpers (used internally by stages 1-2)
// ─────────────────────────────────────────────────────────────────────────

export function plateVelocityAt(plateVec, plateId, x, y, z) {
    const pv = plateVec[plateId];
    const px = pv.pole[0], py = pv.pole[1], pz = pv.pole[2];
    const omega = pv.omega;
    return [
        omega * (py * z - pz * y),
        omega * (pz * x - px * z),
        omega * (px * y - py * x)
    ];
}

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

            const sdx = r_stressDir[3*r], sdy = r_stressDir[3*r+1], sdz = r_stressDir[3*r+2];
            const hasDir = (sdx !== 0 || sdy !== 0 || sdz !== 0);

            for (let ni = adjOffset[r], niEnd = adjOffset[r + 1]; ni < niEnd; ni++) {
                const nb = adjList[ni];
                if (r_plate[nb] !== plate) continue;

                let propagated = basePropagate;

                if (hasDir) {
                    const tdx = r_xyz[3*nb] - r_xyz[3*r];
                    const tdy = r_xyz[3*nb+1] - r_xyz[3*r+1];
                    const tdz = r_xyz[3*nb+2] - r_xyz[3*r+2];
                    const tLen = Math.sqrt(tdx*tdx + tdy*tdy + tdz*tdz) || 1e-10;
                    const alignment = (sdx * tdx + sdy * tdy + sdz * tdz) / tLen;
                    const dirFactor = Math.max(STRESS_DIR_FACTOR_MIN, STRESS_DIR_FACTOR_BASE + STRESS_DIR_FACTOR_SCALE * alignment);
                    propagated *= dirFactor;
                }

                if (propagated > r_stress[nb]) {
                    r_stress[nb] = propagated;
                    r_subductFactor[nb] = sf;
                    nextFrontier.push(nb);

                    if (hasDir) {
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

    const stressDirAvgEdgeKm = (Math.PI * 6371) / Math.sqrt(mesh.numRegions);
    const stressDirPasses = Math.max(1, Math.round(STRESS_DIR_SMOOTH_KM / stressDirAvgEdgeKm));
    for (let pass = 0; pass < stressDirPasses; pass++) {
        for (let r = 0; r < mesh.numRegions; r++) {
            if (r_stress[r] < STRESS_PROPAGATE_MIN) continue;
            const plate = r_plate[r];
            if (plateOcean[plate]) continue;
            let ax = 0, ay = 0, az = 0, totalW = 0;
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

// ─────────────────────────────────────────────────────────────────────────
//  Stage 1: Tectonic state
//  Collisions × (small + super), blending, stress propagation, mantle
//  modulation, plate-interior seeding, percentile normalization.
// ─────────────────────────────────────────────────────────────────────────
function computeTectonicState(mesh, r_xyz, plateIsOcean, r_plate, plateVec, plateSeeds, plateDensity, noise, superPlateData, r_mantleField, spread) {
    const { numRegions } = mesh;

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

    const smallCol = findCollisions(mesh, r_xyz, plateIsOcean, r_plate, plateVec, plateDensity, noise);
    const hasSuperPlates = superPlateData != null;
    let superCol = null;
    if (hasSuperPlates) {
        superCol = findCollisions(mesh, r_xyz, superPlateData.superPlateIsOcean,
            superPlateData.r_superPlate, superPlateData.superPlateVec,
            superPlateData.superPlateDensity, noise);
    }

    let mountain_r, coastline_r, ocean_r, r_stress, r_stressDir, r_subductFactor, r_boundaryType, r_bothOcean, r_hasOcean;

    if (!hasSuperPlates) {
        ({ mountain_r, coastline_r, ocean_r, r_stress, r_stressDir, r_subductFactor, r_boundaryType, r_bothOcean, r_hasOcean } = smallCol);
    } else {
        // Super plates dictate the base shape. Distance-field seed sets and
        // boundary topology come from super plates only — small plates do
        // not introduce extra mountain/coastline/ocean seeds, and their
        // boundary types do not trigger rifts/ridges/fracture-zones inside
        // a coherent super-plate block.
        //
        // Stress, stress direction, and subduction factor are still blended
        // (95% super + 5% small) so the small-plate signal contributes a
        // subtle texture/intensity modulation, but only WITHIN zones already
        // defined by super plates.
        mountain_r  = new Set(superCol.mountain_r);
        ocean_r     = new Set(superCol.ocean_r);
        coastline_r = new Set();
        for (const r of superCol.coastline_r) {
            if (!mountain_r.has(r)) coastline_r.add(r);
        }

        r_boundaryType = new Int8Array(superCol.r_boundaryType);
        r_bothOcean    = new Uint8Array(superCol.r_bothOcean);
        r_hasOcean     = new Uint8Array(superCol.r_hasOcean);

        // Plain weighted sum — no proximity ramp. Both small and super
        // contribute according to the PLATE_BLEND_T-derived weights at
        // every cell, so mountain ranges stay consistently visible
        // regardless of which layer drives them.
        r_stress = new Float32Array(numRegions);
        for (let r = 0; r < numRegions; r++) {
            r_stress[r] = SMALL_W * smallCol.r_stress[r] + SUPER_W * superCol.r_stress[r];
        }

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
    }

    // Stress propagation
    const scaleFactor = Math.sqrt(numRegions / COLLISION_DT_REF_REGIONS);
    const baseDecay = STRESS_DECAY_BASE + spread * STRESS_DECAY_SPREAD_FACTOR;
    const decayFactor = Math.pow(baseDecay, 1 / scaleFactor);
    const subductBaseDecay = baseDecay * STRESS_SUBDUCT_DECAY_MULT;
    const subductDecayFactor = Math.pow(subductBaseDecay, 1 / scaleFactor);
    const numPasses = Math.max(1, Math.round(spread * STRESS_PASSES_PER_SPREAD * scaleFactor));

    if (!hasSuperPlates) {
        propagateStress(mesh, r_stress, r_stressDir, r_subductFactor, r_plate, r_xyz, plateIsOcean, decayFactor, subductDecayFactor, numPasses);
    } else {
        const smallStress = new Float32Array(smallCol.r_stress);
        const smallDir = new Float32Array(smallCol.r_stressDir);
        const smallSubduct = new Float32Array(smallCol.r_subductFactor);
        propagateStress(mesh, smallStress, smallDir, smallSubduct, r_plate, r_xyz, plateIsOcean, decayFactor, subductDecayFactor, numPasses);

        const superStress = new Float32Array(superCol.r_stress);
        const superDir = new Float32Array(superCol.r_stressDir);
        const superSubduct = new Float32Array(superCol.r_subductFactor);
        propagateStress(mesh, superStress, superDir, superSubduct, superPlateData.r_superPlate, r_xyz, superPlateData.superPlateIsOcean, decayFactor, subductDecayFactor, numPasses);

        for (let r = 0; r < numRegions; r++) {
            r_stress[r] = SMALL_W * smallStress[r] + SUPER_W * superStress[r];
        }
        for (let r = 0; r < numRegions; r++) {
            const wS = SMALL_W * smallStress[r], wP = SUPER_W * superStress[r];
            const total = wS + wP;
            if (total > 1e-6) {
                r_subductFactor[r] = (wS * smallSubduct[r] + wP * superSubduct[r]) / total;
            }
        }
    }

    // Mantle stress modulation
    if (r_mantleNorm) {
        for (let r = 0; r < numRegions; r++) {
            if (r_stress[r] < 1e-6) continue;
            const mult = 1.0 + MANTLE_STRESS_BOOST * Math.max(-0.5, r_mantleNorm[r]);
            r_stress[r] *= mult;
        }
    }

    // Plate-interior seeds
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

    // 95th-percentile maxStress
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

    return {
        mountain_r, coastline_r, ocean_r, stress_mountain_r,
        r_stress, r_stressDir, r_subductFactor, r_boundaryType,
        r_bothOcean, r_hasOcean, r_mantleNorm,
        maxStress, scaleFactor
    };
}

// ─────────────────────────────────────────────────────────────────────────
//  Stage 2: Spatial fields
//  All distance fields and BFS bands. Read-only output for stages 3+.
// ─────────────────────────────────────────────────────────────────────────
function computeSpatialFields(mesh, r_xyz, r_plate, plateIsOcean, tect, seed, superPlateData) {
    const { numRegions, adjOffset, adjList } = mesh;
    const { stress_mountain_r, coastline_r, ocean_r, r_boundaryType, r_bothOcean, r_hasOcean, r_subductFactor, r_stress, maxStress, scaleFactor } = tect;
    // Rift BFS uses super-plate IDs when available so expansion doesn't
    // stop at internal small-plate boundaries inside the same super plate.
    // r_boundaryType comes from super plates, so the seeds and the
    // expansion membership must agree on the same partition.
    const r_riftPlate = superPlateData ? superPlateData.r_superPlate : r_plate;

    const r_isOcean = new Uint8Array(numRegions);
    for (let r = 0; r < numRegions; r++) {
        if (plateIsOcean.has(r_plate[r])) r_isOcean[r] = 1;
    }

    // Three primary distance fields
    const stop_r = new Set([...stress_mountain_r, ...coastline_r, ...ocean_r]);
    const dist_mountain  = assignDistanceField(mesh, stress_mountain_r, ocean_r,     seed + 1);
    const dist_ocean     = assignDistanceField(mesh, ocean_r,           coastline_r, seed + 2);
    const dist_coastline = assignDistanceField(mesh, coastline_r,       stop_r,      seed + 3);

    // dist_coast: ocean cells, distance to coast
    const coastSeeds = new Set();
    for (let r = 0; r < numRegions; r++) {
        if (!r_isOcean[r]) {
            for (let ni = adjOffset[r], niEnd = adjOffset[r + 1]; ni < niEnd; ni++) {
                if (r_isOcean[adjList[ni]]) { coastSeeds.add(adjList[ni]); break; }
            }
        }
    }
    const dist_coast = assignDistanceField(mesh, coastSeeds, new Set(), seed + 4);

    // dist_coast_land: land cells, distance to coast through land
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

    // Coast boundary BFS — propagates worst-case boundary attributes
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

    // Rift BFS (continental divergent)
    const riftHalfWidth = Math.max(2, Math.round(RIFT_HALF_WIDTH_BASE * scaleFactor));
    const riftDist = new Float32Array(numRegions).fill(Infinity);
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
            const plate = r_riftPlate[r];
            for (let ni = adjOffset[r], niEnd = adjOffset[r + 1]; ni < niEnd; ni++) {
                const nr = adjList[ni];
                if (nd < riftDist[nr] && r_riftPlate[nr] === plate && !r_isOcean[nr]) {
                    riftDist[nr] = nd;
                    riftSeeds.push(nr);
                }
            }
        }
    }

    // Mid-ocean ridge BFS (oceanic divergent)
    const ridgeHalfWidth = Math.max(2, Math.round(RIDGE_HW_BASE * scaleFactor));
    const ridgeDist = new Float32Array(numRegions).fill(Infinity);
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

    // Fracture zone BFS (oceanic transform)
    const fractureHalfWidth = Math.max(2, Math.round(FRACTURE_HALF_WIDTH_BASE * scaleFactor));
    const fractureDist = new Float32Array(numRegions).fill(Infinity);
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

    // Back-arc basin BFS (overriding side of oceanic-converging fronts)
    const baStart = Math.max(1, Math.round(BACK_ARC_START_BASE * scaleFactor));
    const baPeak  = Math.max(2, Math.round(BACK_ARC_PEAK_BASE * scaleFactor));
    const baEnd   = Math.max(3, Math.round(BACK_ARC_END_BASE * scaleFactor));
    const backArcDist = new Float32Array(numRegions).fill(Infinity);
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

    return {
        r_isOcean,
        dist_mountain, dist_ocean, dist_coastline, dist_coast, dist_coast_land,
        dBdry, coastStressMax, coastSubductMax, coastConvergent, maxCD,
        riftDist, riftHalfWidth,
        ridgeDist, ridgeHalfWidth,
        fractureDist, fractureHalfWidth,
        backArcDist, backArcStress, baStart, baPeak, baEnd,
        interiorBand:    Math.max(4, Math.round(INTERIOR_BAND_BASE * scaleFactor)),
        tectonicReach:   Math.max(6, Math.round(TECTONIC_REACH_BASE * scaleFactor)),
        plateauStart:    Math.max(2, Math.round(PLATEAU_START_BASE * scaleFactor)),
        ridgeSigmaBase:  Math.max(2, Math.round(RIDGE_SIGMA_BASE_CFG * scaleFactor)),
        ridgePeakShift:  Math.max(1, Math.round(RIDGE_PEAK_SHIFT_BASE * scaleFactor)),
        ridgeExtent:     Math.max(4, Math.round(RIDGE_EXTENT_BASE * scaleFactor)),
    };
}

// ─────────────────────────────────────────────────────────────────────────
//  Stage 3: Terrain classification
//  Single-source-of-truth archetype weights and per-cell noise amplitude.
//  Replaces the inline isFoldBelt/isCraton/isBasin/isPlateauZone math
//  scattered across the original main loop.
// ─────────────────────────────────────────────────────────────────────────
function classifyTerrain(mesh, r_xyz, tect, sf, seed) {
    const { numRegions } = mesh;
    const { r_subductFactor, r_stress, maxStress } = tect;
    const { r_isOcean, dist_mountain, tectonicReach, plateauStart } = sf;

    // Basin/shield factor (low-freq personality field, land only)
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

    const r_tectonicActivity = new Float32Array(numRegions);
    const r_t_foldBelt = new Float32Array(numRegions);
    const r_t_craton   = new Float32Array(numRegions);
    const r_t_basin    = new Float32Array(numRegions);
    const r_t_plateau  = new Uint8Array(numRegions);  // boolean (matches v1 isPlateauZone)
    const r_noiseAmp   = new Float32Array(numRegions);

    for (let r = 0; r < numRegions; r++) {
        const sf_r = r_subductFactor[r];
        const stressNorm = Math.min(1, r_stress[r] / maxStress);
        const dMtn = dist_mountain[r];

        // Tectonic activity (subduction-side reach is shorter)
        const effReach = sf_r > 0.5
            ? tectonicReach * (SUBDUCTING_REACH_MIN + SUBDUCTING_REACH_RANGE * (1 - sf_r))
            : tectonicReach;
        const rawProximity = (dMtn === Infinity || dMtn >= effReach) ? 0 : (1 - dMtn / effReach);
        const tecActivity = Math.max(stressNorm, rawProximity * rawProximity * rawProximity);
        r_tectonicActivity[r] = tecActivity;

        if (r_isOcean[r]) continue;

        const basin = r_basinFactor[r];
        r_t_foldBelt[r] = Math.min(1, stressNorm * FOLD_BELT_MULT);
        r_t_craton[r]   = Math.max(0, 1 - tecActivity * CRATON_TECTONIC_MULT) * (1 - basin);
        r_t_basin[r]    = basin * Math.max(0, 1 - tecActivity * BASIN_TECTONIC_MULT);
        const isPlateauZone = sf_r < 0.45 && dMtn !== Infinity && dMtn > plateauStart;
        r_t_plateau[r] = isPlateauZone ? 1 : 0;

        // Single per-cell noise amplitude (replaces scattered modulators)
        const noiseActivity = Math.min(1, stressNorm * NOISE_ACTIVITY_SCALE);
        const plateauSuppress = isPlateauZone
            ? Math.max(PLATEAU_SUPPRESS_MIN, 1 - tecActivity * PLATEAU_SUPPRESS_SCALE)
            : 1.0;
        const basinAmpSuppress  = 1.0 - r_t_basin[r]  * BASIN_AMP_SUPPRESS;
        const cratonAmpSuppress = 1.0 - r_t_craton[r] * CRATON_AMP_SUPPRESS;
        r_noiseAmp[r] = (NOISE_BASE_SCALE + NOISE_ACTIVITY_CONTRIB * noiseActivity)
                      * plateauSuppress * basinAmpSuppress * cratonAmpSuppress;
    }

    return { r_basinFactor, r_tectonicActivity, r_t_foldBelt, r_t_craton, r_t_basin, r_t_plateau, r_noiseAmp };
}

// ─────────────────────────────────────────────────────────────────────────
//  Stage 4: Skeleton
//  Geological feature shapes. Includes feature-bound structural noise
//  (stress heightVar, ridge along-strike, fold ridges, MOR ridged uplift,
//  rift volcanic, abyss mottling, interior mod) but NO uniform surface
//  texture noise. Surface texture is added in stage 5.
// ─────────────────────────────────────────────────────────────────────────
function buildSkeleton(mesh, r_xyz, plateIsOcean, r_plate, plateVec, plateSeeds, tect, sf, tt, noise, noiseMag, seed, debugLayers) {
    const { numRegions } = mesh;
    const r_elevation = new Float32Array(numRegions);
    const dl_base       = debugLayers.base;
    const dl_tectonic   = debugLayers.tectonic;
    const dl_interior   = debugLayers.interior;
    const dl_ocean      = debugLayers.ocean;
    const dl_coastal    = debugLayers.coastal;
    const dl_margins    = debugLayers.margins;
    const dl_backArc    = debugLayers.backArc;
    const dl_orogenicPower = debugLayers.orogenicPower;

    const { r_subductFactor, r_stress, r_boundaryType, r_hasOcean, r_bothOcean, maxStress, scaleFactor } = tect;
    const { r_isOcean, dist_mountain, dist_ocean, dist_coastline, dist_coast, dist_coast_land,
            dBdry, coastConvergent, maxCD,
            riftDist, riftHalfWidth, ridgeDist, ridgeHalfWidth,
            fractureDist, fractureHalfWidth,
            backArcDist, backArcStress, baStart, baPeak, baEnd,
            interiorBand, tectonicReach, plateauStart,
            ridgeSigmaBase, ridgePeakShift, ridgeExtent } = sf;
    const { r_basinFactor, r_tectonicActivity, r_t_plateau } = tt;

    // Per-plate Gaussian base height
    const plateBaseHeight = {};
    {
        const rng = makeRng(seed + 777);
        for (const pid of plateSeeds) {
            if (!plateIsOcean.has(pid)) {
                const u1 = rng(), u2 = rng();
                const normal = Math.sqrt(-2 * Math.log(u1 || 1e-10)) * Math.cos(2 * Math.PI * u2);
                plateBaseHeight[pid] = PLATE_BASE_HEIGHT_MEAN + normal * PLATE_BASE_HEIGHT_STDDEV;
            }
        }
    }

    const foldNoise = new SimplexNoise(seed + 557);
    const riftNoise = new SimplexNoise(seed + 419);

    const eps = 1e-3;
    const warpScale = WARP_SCALE;
    const warpOctaves = numRegions > 200000 ? 2 : 3;

    for (let r = 0; r < numRegions; r++) {
        const isOceanPlate = r_isOcean[r];
        const sf_r = r_subductFactor[r];
        const stressNorm = Math.min(1, r_stress[r] / maxStress);
        const btype = r_boundaryType[r];
        const x = r_xyz[3*r], y = r_xyz[3*r+1], z = r_xyz[3*r+2];

        // Distance-ratio base
        const sfAsym = sf_r;
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

        // Domain-warped coordinates (re-used by feature noise below; stage 5 recomputes)
        const wx = x + warpScale * noise.fbm(x + 5.3, y + 1.7, z + 3.1, warpOctaves);
        const wy = y + warpScale * noise.fbm(x + 8.1, y + 2.9, z + 7.3, warpOctaves);
        const wz = z + warpScale * noise.fbm(x + 1.4, y + 6.2, z + 4.8, warpOctaves);

        // Orogenic power (used by stress uplift formula)
        const rawOro = noise.noise3D(x * OROGENIC_FREQ + 33.7, y * OROGENIC_FREQ + 11.2, z * OROGENIC_FREQ + 22.9);
        const shaped = rawOro >= 0 ? Math.sqrt(rawOro) : -Math.sqrt(-rawOro);
        const orogenicPower = Math.max(0, Math.min(1, 0.5 + 0.5 * shaped));
        dl_orogenicPower[r] = orogenicPower - 0.5;

        if (!isOceanPlate) {
            // ───── LAND ─────
            const pid = r_plate[r];
            if (plateBaseHeight[pid] !== undefined) {
                r_elevation[r] += plateBaseHeight[pid];
            }
            const elevBefore = r_elevation[r];

            if (sf_r > 0.5 && r_elevation[r] > 0) {
                const suppression = (sf_r - 0.5) * 2;
                r_elevation[r] *= 1 - suppression * SUBDUCTING_SUPPRESSION;
            }

            // Stress uplift / depression with along-strike heightVar (structural)
            if (stressNorm > 0.01) {
                const stressMag = stressNorm * stressNorm * STRESS_MAG_SCALE * orogenicPower;
                const uplift  = stressMag * (1 - sf_r);
                const depress = stressMag * STRESS_DEPRESS_FRAC * sf_r;
                const heightVar = STRESS_HEIGHT_VAR_BASE + STRESS_HEIGHT_VAR_SCALE * noise.fbm(x * 8 + 13.7, y * 8 + 9.2, z * 8 + 4.5, 3);
                r_elevation[r] += (uplift - depress) * heightVar;
            }

            // Foreland basin
            {
                const dMtn = dist_mountain[r];
                if (dMtn !== Infinity && stressNorm < FORELAND_STRESS_THRESH && sf_r < BACK_ARC_SUBDUCT_THRESH) {
                    const forelandWidth = Math.max(2, Math.round(interiorBand * FORELAND_WIDTH_FRAC));
                    if (dMtn < forelandWidth) {
                        const t = dMtn / forelandWidth;
                        const peakPos = FORELAND_PEAK_POS;
                        let profile;
                        if (t < peakPos) {
                            const s = t / peakPos;
                            profile = s * s * (3 - 2 * s);
                        } else {
                            const s = (t - peakPos) / (1 - peakPos);
                            profile = 1 - s * s * (3 - 2 * s);
                        }
                        const stressFade = 1 - Math.min(1, stressNorm / FORELAND_STRESS_THRESH);
                        const basinDeepening = FORELAND_BASIN_DEEPENING_BASE + FORELAND_BASIN_DEEPENING_SCALE * r_basinFactor[r];
                        r_elevation[r] -= FORELAND_BASIN_DEPTH * profile * stressFade * basinDeepening;
                    }
                }
            }

            // Rift valley graben
            {
                const rd = riftDist[r];
                if (rd !== Infinity) {
                    // Width modulation along rift length — same noise for both
                    // walls so the band as a whole pinches/bulges together.
                    const widthRaw = riftNoise.fbm(
                        x * RIFT_WIDTH_VAR_FREQ + 91.3,
                        y * RIFT_WIDTH_VAR_FREQ + 17.6,
                        z * RIFT_WIDTH_VAR_FREQ + 64.2, 2);
                    const widthNorm = Math.max(0, Math.min(1, 0.5 + widthRaw));
                    // Floor biases toward narrow: widthNorm² makes most
                    // cells sample low values, so the typical valley is
                    // axis-only with occasional wider sections.
                    const floorScale = RIFT_FLOOR_VAR_MIN + (1 - RIFT_FLOOR_VAR_MIN) * widthNorm * widthNorm;
                    const shoulderScale = RIFT_SHOULDER_VAR_MIN + (1 - RIFT_SHOULDER_VAR_MIN) * widthNorm;

                    // Per-side width asymmetry — sample noise offset by plate
                    // ID so cells on opposite walls of the rift get
                    // independent width factors. Within one plate, neighbors
                    // sample similar values so the asymmetry varies smoothly
                    // along rift length.
                    const plateOffset = (r_plate[r] * 0.6180339887) % 1 * 100;
                    const asymRaw = riftNoise.fbm(
                        x * RIFT_WIDTH_ASYM_FREQ + plateOffset,
                        y * RIFT_WIDTH_ASYM_FREQ + plateOffset * 1.7,
                        z * RIFT_WIDTH_ASYM_FREQ + plateOffset * 0.3, 2);
                    const asymNorm = Math.max(0, Math.min(1, 0.5 + asymRaw));
                    const widthAsym = RIFT_WIDTH_ASYM_MIN + (1 - RIFT_WIDTH_ASYM_MIN) * asymNorm;

                    // Floor zone: rd in [0, floorEnd]. Shoulders extend BEYOND
                    // the valley edge — inner/outer offsets stack on top of
                    // floorEnd so shoulder extent is from the valley wall,
                    // not from rift center.
                    const floorEnd = RIFT_FLOOR_MULT * scaleFactor * floorScale * widthAsym;
                    const shoulderEnd = floorEnd + RIFT_SHOULDER_INNER_MULT * scaleFactor * shoulderScale * widthAsym;
                    const localHalfWidth = floorEnd + RIFT_SHOULDER_OUTER_MULT * scaleFactor * shoulderScale * widthAsym;

                    if (rd <= localHalfWidth + 0.5) {
                        const shoulderHeightNoise = RIFT_SHOULDER_HEIGHT_VAR_BASE
                            + RIFT_SHOULDER_HEIGHT_VAR_SCALE * foldNoise.fbm(
                                x * RIFT_SHOULDER_HEIGHT_VAR_FREQ + 41.7,
                                y * RIFT_SHOULDER_HEIGHT_VAR_FREQ + 53.1,
                                z * RIFT_SHOULDER_HEIGHT_VAR_FREQ + 27.4, 2);
                        let riftEffect = 0;
                        if (rd <= 0.5) {
                            riftEffect = RIFT_AXIS_DEPTH;
                            riftEffect += riftNoise.ridgedFbm(x * 8, y * 8, z * 8, 3) * RIFT_AXIS_VOLCANIC_AMP;
                        } else if (rd <= floorEnd) {
                            const t = floorEnd > 0 ? rd / floorEnd : 1;
                            riftEffect = RIFT_FLOOR_DEPTH * (1 - t * RIFT_FLOOR_TAPER);
                            riftEffect += riftNoise.ridgedFbm(x * 8, y * 8, z * 8, 3) * RIFT_FLOOR_VOLCANIC_AMP * (1 - t);
                        } else if (rd <= shoulderEnd) {
                            riftEffect = RIFT_SHOULDER_UPLIFT * shoulderHeightNoise;
                        } else if (localHalfWidth > shoulderEnd) {
                            const t = (rd - shoulderEnd) / (localHalfWidth - shoulderEnd);
                            const fadeT = Math.min(1, Math.max(0, t));
                            const fade = fadeT * fadeT * (3 - 2 * fadeT);
                            riftEffect = RIFT_SHOULDER_UPLIFT * (1 - fade) * RIFT_FADEOUT_RESIDUAL * shoulderHeightNoise;
                        }
                        r_elevation[r] += riftEffect;
                    }
                }
            }

            // Back-arc basin (continent side)
            {
                const bad = backArcDist[r];
                if (bad !== Infinity && bad >= baStart) {
                    const dMtn = dist_mountain[r];
                    const orogenyFactor = (dMtn !== Infinity && dMtn < bad) ? Math.max(0, dMtn / bad) : 1.0;
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

            // Convergent ridgeline (with structural width + along-strike noise)
            {
                const dMtnRidge = dist_mountain[r];
                if (dMtnRidge !== Infinity && dMtnRidge < ridgeExtent && stressNorm > 0.01) {
                    const sfAsymmetry = Math.abs(sf_r - 0.5) * 2;
                    const signedDist = sf_r > 0.5 ? dMtnRidge : -dMtnRidge;
                    const peakPos = -sfAsymmetry * ridgePeakShift;
                    const dFromPeak = signedDist - peakPos;
                    const stressWidthMod = RIDGE_STRESS_WIDTH_BASE + RIDGE_STRESS_WIDTH_SCALE * stressNorm;
                    const widthNoise = 1.0 + RIDGE_WIDTH_NOISE_AMP * foldNoise.fbm(x * 3 + 44.1, y * 3 + 22.7, z * 3 + 11.3, 2);
                    const localRidgeSigma = ridgeSigmaBase * stressWidthMod * widthNoise;
                    const sigma = dFromPeak > 0
                        ? localRidgeSigma * (1 - sfAsymmetry * RIDGE_ASYM_SUBDUCT_NARROW)
                        : localRidgeSigma * (1 + sfAsymmetry * RIDGE_ASYM_OVERRIDE_WIDEN);
                    const safeSigma = Math.max(0.5, sigma);
                    const gauss = Math.exp(-0.5 * (dFromPeak / safeSigma) ** 2);
                    const ridgeHeightNoise = RIDGE_HEIGHT_VAR_BASE + RIDGE_HEIGHT_VAR_SCALE * foldNoise.fbm(x * RIDGE_HEIGHT_VAR_FREQ + 17.3, y * RIDGE_HEIGHT_VAR_FREQ + 31.7, z * RIDGE_HEIGHT_VAR_FREQ + 8.9, 2);
                    r_elevation[r] += gauss * stressNorm * RIDGE_STRENGTH * ridgeHeightNoise;
                }
            }

            dl_tectonic[r] = r_elevation[r] - elevBefore;

            const tectonicActivity = r_tectonicActivity[r];
            const dMtnFold = dist_mountain[r];

            // Continental interior uplift
            const lcd = dist_coast_land[r];
            if (lcd < Infinity) {
                let mountainBoost = 0;
                if (dMtnFold !== Infinity && sf_r < BACK_ARC_SUBDUCT_THRESH && dMtnFold < lcd) {
                    const proximity = Math.max(0, 1 - dMtnFold / Math.max(1, tectonicReach));
                    mountainBoost = proximity * interiorBand * MOUNTAIN_BOOST_FRAC;
                }
                const effectiveLcd = lcd + mountainBoost;

                const tDown = Math.min(effectiveLcd / interiorBand, 1);
                const sDown = tDown * tDown * (3 - 2 * tDown);
                const tUp = Math.min(effectiveLcd / (interiorBand * INTERIOR_UPLIFT_RAMP_FRAC), 1);
                const sUp = tUp * tUp * (3 - 2 * tUp);
                const bf = r_basinFactor[r];
                const interiorBase = INTERIOR_BASE_SHIELD * (1 - bf) + INTERIOR_BASE_BASIN * bf;
                const interiorUplift = interiorBase + tectonicActivity * INTERIOR_TECTONIC;
                const coastalDepression = COASTAL_DEPRESSION * (1 - bf * COASTAL_DEPRESSION_BASIN_REDUCE);
                const baseBias = coastalDepression * (1 - sDown) + interiorUplift * sUp;
                const mod = 1.0 + INTERIOR_UPLIFT_MOD_AMP * noise.fbm(x * 2 + 19.3, y * 2 + 7.6, z * 2 + 13.1, 2);
                const bias = baseBias * mod;
                r_elevation[r] += bias;
                dl_interior[r] = bias;
            }

            // Plateau uplift boost
            if (r_t_plateau[r] && tectonicActivity > 0.1) {
                const plateauBoost = PLATEAU_BOOST * tectonicActivity * (1 - sf_r);
                r_elevation[r] += plateauBoost;
                dl_interior[r] += plateauBoost;
            }

            // Passive margin coastal plain suppression
            {
                const coastPlainWidth = Math.max(6, Math.round(COASTAL_PLAIN_WIDTH_BASE * scaleFactor));
                if (lcd < coastPlainWidth && dBdry[r] <= maxCD && !coastConvergent[r]) {
                    const t = lcd / coastPlainWidth;
                    const fade = t * t * (3 - 2 * t);
                    const suppressionStrength = PLAIN_SUPPRESSION_STRENGTH * (1 - fade);
                    if (r_elevation[r] > PLAIN_TARGET) {
                        const excess = r_elevation[r] - PLAIN_TARGET;
                        const suppression = excess * suppressionStrength;
                        r_elevation[r] -= suppression;
                        dl_coastal[r] -= suppression;
                    }
                }
            }

            // Soft interior floor — skipped inside the rift graben (axis +
            // floor) so the valley depression survives. Shoulders and the
            // fadeout band remain subject to the floor since they're meant
            // to sit above plateau level anyway. Uses the BASE floor extent
            // (not width-modulated) so even pinched sections still expose
            // their depression — width modulation only narrows the shoulders.
            {
                const rd = riftDist[r];
                const inRiftFloor = rd !== Infinity &&
                    rd <= RIFT_FLOOR_MULT * scaleFactor + 0.5;
                if (!inRiftFloor) {
                    const floorRamp = Math.min(1, lcd / (5 * scaleFactor));
                    const minElev = INTERIOR_FLOOR * floorRamp;
                    if (r_elevation[r] < minElev) r_elevation[r] = minElev;
                }
            }
        } else {
            // ───── OCEAN ─────
            const dc = dist_coast[r];
            const isActiveMarginShelf = coastConvergent[r] === 1;
            const shelfWidth = isActiveMarginShelf
                ? Math.max(2, Math.round(SHELF_NARROW_BASE * scaleFactor))
                : Math.max(4, Math.round(SHELF_WIDE_BASE * scaleFactor));
            const slopeWidth = Math.max(3, Math.round(SLOPE_WIDTH_BASE * scaleFactor));
            const totalMargin = shelfWidth + slopeWidth;

            let oceanBase;
            if (dc < shelfWidth) {
                oceanBase = SHELF_DEPTH_START - SHELF_DEPTH_RANGE * (dc / shelfWidth);
            } else if (dc < totalMargin) {
                oceanBase = (SHELF_DEPTH_START - SHELF_DEPTH_RANGE) - SLOPE_DEPTH_RANGE * ((dc - shelfWidth) / slopeWidth);
            } else {
                oceanBase = ABYSS_BASE + noise.fbm(x * 2, y * 2, z * 2, 3) * ABYSS_NOISE_AMP;
            }

            r_elevation[r] = Math.min(r_elevation[r], oceanBase);
            dl_ocean[r] = r_elevation[r];

            const isActiveMargin = coastConvergent[r] === 1;
            dl_margins[r] = isActiveMargin ? 0.8 : 0.2;
            if (ridgeDist[r] !== Infinity && ridgeDist[r] <= ridgeHalfWidth) dl_margins[r] = 1.0;
            if (fractureDist[r] !== Infinity && fractureDist[r] <= fractureHalfWidth) dl_margins[r] = -0.5;

            const elevBeforeOcTec = r_elevation[r];

            // Mid-ocean ridge with ridged uplift
            const rd = ridgeDist[r];
            if (rd !== Infinity && rd <= ridgeHalfWidth) {
                const t = rd / ridgeHalfWidth;
                const ridgeFade = (1 - t) * (1 - t);
                const ridgeNoise = noise.ridgedFbm(x * 3, y * 3, z * 3, 4);
                const ridgeUplift = (RIDGE_UPLIFT_NOISE * ridgeNoise + RIDGE_UPLIFT_BASE) * ridgeFade;
                r_elevation[r] += ridgeUplift;
            }

            // Fracture zone depression
            const fd = fractureDist[r];
            if (fd !== Infinity && fd <= fractureHalfWidth) {
                const ft = fd / fractureHalfWidth;
                const fractureFade = 1 - ft;
                r_elevation[r] -= FRACTURE_DEPTH * fractureFade;
            }

            // Trench
            if (btype === 1) {
                r_elevation[r] -= TRENCH_BASE_DEPTH + TRENCH_STRESS_DEPTH * stressNorm;
            }

            // Back-arc basin (ocean side)
            {
                const bad = backArcDist[r];
                if (bad !== Infinity && bad >= baStart) {
                    const dMtn = dist_mountain[r];
                    const orogenyFactor = (dMtn !== Infinity && dMtn < bad) ? Math.max(0, dMtn / bad) : 1.0;
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

            // Ocean clamp (will be re-clamped after stage 5)
            if (r_elevation[r] > OCEAN_FLOOR_CLAMP) r_elevation[r] = OCEAN_FLOOR_CLAMP;
        }
    }

    return r_elevation;
}

// ─────────────────────────────────────────────────────────────────────────
//  Stage 5: Tectonic-band noise
//  Single consolidated pass replacing the scattered main+detail+fine+
//  ridged+ocean noise sites in the original. One per-cell amplitude
//  (r_noiseAmp from classifier), three frequency bands plus ridged blend
//  on land, single fbm on ocean.
// ─────────────────────────────────────────────────────────────────────────
function applyTectonicBandNoise(mesh, r_xyz, r_elevation, sf, tt, noise, noiseMag, debugLayers) {
    const { numRegions } = mesh;
    const { r_isOcean } = sf;
    const { r_t_foldBelt, r_noiseAmp } = tt;
    const dl_noise = debugLayers.noise;
    const warpScale = WARP_SCALE;
    const warpOctaves = numRegions > 200000 ? 2 : 3;

    for (let r = 0; r < numRegions; r++) {
        const x = r_xyz[3*r], y = r_xyz[3*r+1], z = r_xyz[3*r+2];
        const wx = x + warpScale * noise.fbm(x + 5.3, y + 1.7, z + 3.1, warpOctaves);
        const wy = y + warpScale * noise.fbm(x + 8.1, y + 2.9, z + 7.3, warpOctaves);
        const wz = z + warpScale * noise.fbm(x + 1.4, y + 6.2, z + 4.8, warpOctaves);

        if (r_isOcean[r]) {
            // Single uniform ocean texture
            const ocf = CONTINENTAL_FREQ_MULT;
            const oceanNoise = noise.fbm(wx * ocf, wy * ocf, wz * ocf) * noiseMag * OCEAN_NOISE_AMP;
            r_elevation[r] += oceanNoise;
            dl_noise[r] = oceanNoise;
            // Re-clamp ocean cells back below sea level, BUT preserve real
            // islands. Island arcs / volcanoes / hotspots ran in stage 6 and
            // may have pushed ocean cells well above sea level. Cells above
            // ISLAND_PEAK_FLOOR are intentional islands; only clamp the tiny
            // noise-driven blips below that threshold.
            if (r_elevation[r] > OCEAN_FLOOR_CLAMP && r_elevation[r] < ISLAND_PEAK_FLOOR) {
                r_elevation[r] = OCEAN_FLOOR_CLAMP;
            }
            continue;
        }

        const foldBelt = r_t_foldBelt[r];
        const foldFreqMult = 1.0 + foldBelt * FOLD_FREQ_MULT_SCALE;
        const continentalFreq = foldFreqMult * CONTINENTAL_FREQ_MULT;
        const noiseScale = r_noiseAmp[r];

        const continental = noise.fbm(wx * continentalFreq, wy * continentalFreq, wz * continentalFreq) * noiseMag;
        const ridged      = noise.ridgedFbm(wx * continentalFreq, wy * continentalFreq, wz * continentalFreq) * noiseMag * RIDGED_NOISE_AMP;
        const continentalMixed = continental * (1 - foldBelt) + ridged * foldBelt;

        const regional = noise.fbm(
            wx * DETAIL_NOISE_FREQ_MULT * foldFreqMult + 22.1,
            wy * DETAIL_NOISE_FREQ_MULT * foldFreqMult + 6.8,
            wz * DETAIL_NOISE_FREQ_MULT * foldFreqMult + 15.4,
            4, 0.5
        ) * noiseMag * DETAIL_NOISE_AMP;

        const local = noise.fbm(
            wx * FINE_NOISE_FREQ_MULT + 41.7,
            wy * FINE_NOISE_FREQ_MULT + 13.2,
            wz * FINE_NOISE_FREQ_MULT + 27.9,
            3, 0.5
        ) * noiseMag * FINE_NOISE_AMP;

        const total = (continentalMixed + regional) * noiseScale + local * Math.sqrt(noiseScale);
        r_elevation[r] += total;
        dl_noise[r] = total;
    }
}

// ─────────────────────────────────────────────────────────────────────────
//  Stage 6: Elevation-gated detail
//  Mountain dissection + summit peaks. Replaces the dissection/summit
//  blocks inside the original main loop.
// ─────────────────────────────────────────────────────────────────────────
function applyDetailTexture(mesh, r_xyz, r_elevation, tect, sf, noise, noiseMag, debugLayers) {
    const { numRegions } = mesh;
    const { r_stress, maxStress } = tect;
    const { r_isOcean } = sf;
    const dl_noise = debugLayers.noise;
    const warpScale = WARP_SCALE;
    const warpOctaves = numRegions > 200000 ? 2 : 3;

    for (let r = 0; r < numRegions; r++) {
        if (r_isOcean[r]) continue;
        const currentElev = r_elevation[r];
        if (currentElev <= DISSECT_THRESHOLD_CFG) continue;

        const x = r_xyz[3*r], y = r_xyz[3*r+1], z = r_xyz[3*r+2];
        const wx = x + warpScale * noise.fbm(x + 5.3, y + 1.7, z + 3.1, warpOctaves);
        const wy = y + warpScale * noise.fbm(x + 8.1, y + 2.9, z + 7.3, warpOctaves);
        const wz = z + warpScale * noise.fbm(x + 1.4, y + 6.2, z + 4.8, warpOctaves);

        const stressNorm = Math.min(1, r_stress[r] / maxStress);
        const elevExcess = currentElev - DISSECT_THRESHOLD_CFG;

        // Mountain dissection (was 16 in v1, now 32 = 2× — already fine in v1)
        const dissectVal = noise.fbm(wx * 32 + 71.3, wy * 32 + 44.8, wz * 32 + 29.1, 3, 0.5);
        const elevDrive = Math.min(1, Math.sqrt(elevExcess) * DISSECT_ELEV_SCALE);
        const dissectAmp = Math.sqrt(elevExcess) * Math.max(elevDrive, stressNorm) * noiseMag * DISSECT_AMP;
        const dissectContrib = dissectVal * dissectAmp;
        r_elevation[r] += dissectContrib;
        dl_noise[r] = (dl_noise[r] || 0) + dissectContrib;

        // Summit peaks (sparse, requires elev > SUMMIT_THRESHOLD and some stress)
        const elevAfterDissect = r_elevation[r];
        if (elevAfterDissect > SUMMIT_THRESHOLD_CFG && stressNorm > SUMMIT_STRESS_MIN) {
            const excess = elevAfterDissect - SUMMIT_THRESHOLD_CFG;
            const peakNoise = noise.ridgedFbm(wx * 36 + 91.3, wy * 36 + 55.7, wz * 36 + 38.2, 3, 0.5);
            const spike = Math.max(0, peakNoise - SUMMIT_SPIKE_OFFSET);
            const peakContrib = spike * excess * Math.max(stressNorm, SUMMIT_STRESS_FLOOR) * 1.0;
            r_elevation[r] += peakContrib;
            dl_noise[r] += peakContrib;
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────
//  Stage: Phasor ridges (shaped, directional)
//
//  Sums Gabor-like wavelet kernels (envelope × complex exponential) seeded
//  in stressed land regions. Each kernel inherits the local stress
//  direction (with bounded random jitter); the wavelet's phase advances
//  along that direction, which puts ridges *perpendicular* to it —
//  parallel to orogen strike.
//
//  Output: 1 − |sin(arg(Σ kernels))| → sharp linear ridges. Coherence
//  (|Σ| / Σ|·|) gates contribution where competing kernels cancel out
//  (e.g. transition zones), so we don't get noise where no clear
//  direction dominates.
//
//  Geological intuition: replaces the v1 sin-based "fold ridges." Real
//  fold-and-thrust belts run perpendicular to compression; phasor noise
//  driven by the propagated stress field gives that for free, with
//  organic curvature from kernel jitter and orientation interference.
//
//  Wavelength and bandwidth are in km; kernel count is global, so the
//  result is scale-invariant in physical units (independent of mesh
//  resolution per CLAUDE.md guidance).
// ─────────────────────────────────────────────────────────────────────────
function applyPhasorRidges(mesh, r_xyz, r_elevation, tect, sf, tt, noiseMag, seed, debugLayers) {
    const { numRegions, adjOffset, adjList } = mesh;
    const { r_stress, r_stressDir, r_subductFactor, maxStress } = tect;
    const { r_isOcean } = sf;
    const { r_t_foldBelt } = tt;
    const dl_phasor = debugLayers.phasorRidge;
    // Orogenic power was computed in stage 4 (skeleton) and stored centered
    // on 0 in debugLayers.orogenicPower (range [-0.5, +0.5] for diverging
    // colormap). Add 0.5 to recover the [0, 1] orogenic-power factor used
    // by the stress uplift formula — phasor uses the same factor so it
    // varies in concert with the existing orogeny pattern.
    const dl_oroPower = debugLayers.orogenicPower;

    // Convert physical km to unit-sphere angular units (R = 6371 km)
    const wavelengthRad = PHASOR_WAVELENGTH_KM / 6371;
    const bandwidthRad = PHASOR_BANDWIDTH_KM / 6371;
    const frequency = 1 / wavelengthRad;
    const invBw2 = -0.5 / (bandwidthRad * bandwidthRad);
    // 3-sigma cutoff in chord-length squared (≈ angle² for small angles)
    const envelopeCutoffSq = 9 * bandwidthRad * bandwidthRad;
    // exp(-0.5 * envelopeCutoffSq / bandwidthRad²) ≈ exp(-4.5) ≈ 0.011

    const rng = makeRng(seed + 1313);

    // ── Pre-smooth stress direction over the active stressed region ──
    // Smoothing pass count is derived from a target physical radius
    // (PHASOR_DIRECTION_SMOOTHING_KM) divided by avg edge length, so the
    // smoothing covers the same physical distance regardless of detail.
    // Without this, the same constant pass count produced very different
    // physical radii at different mesh resolutions, making mountains
    // visibly less coherent at high detail.
    const avgEdgeKm = (Math.PI * 6371) / Math.sqrt(numRegions);
    const smoothingPasses = Math.max(2, Math.round(PHASOR_DIRECTION_SMOOTHING_KM / avgEdgeKm));

    const stressActiveFloor = PHASOR_STRESS_THRESHOLD * maxStress;
    let curDir = new Float32Array(r_stressDir);
    if (smoothingPasses > 0) {
        let nextDir = new Float32Array(numRegions * 3);
        for (let pass = 0; pass < smoothingPasses; pass++) {
            // Carry forward all values; active cells will be overwritten below.
            nextDir.set(curDir);
            for (let r = 0; r < numRegions; r++) {
                if (r_stress[r] < stressActiveFloor) continue;
                const w0 = r_stress[r];
                let ax = curDir[3*r] * w0;
                let ay = curDir[3*r+1] * w0;
                let az = curDir[3*r+2] * w0;
                for (let ni = adjOffset[r], niEnd = adjOffset[r+1]; ni < niEnd; ni++) {
                    const nb = adjList[ni];
                    if (r_stress[nb] < stressActiveFloor) continue;
                    const w = r_stress[nb];
                    ax += curDir[3*nb] * w;
                    ay += curDir[3*nb+1] * w;
                    az += curDir[3*nb+2] * w;
                }
                const len = Math.sqrt(ax*ax + ay*ay + az*az);
                if (len > 1e-6) {
                    nextDir[3*r] = ax / len;
                    nextDir[3*r+1] = ay / len;
                    nextDir[3*r+2] = az / len;
                }
            }
            const tmp = curDir; curDir = nextDir; nextDir = tmp;
        }
    }
    const r_stressDirSmoothed = curDir;

    // Collect candidate land cells with sufficient stress, a clear stress
    // direction, AND on the overriding side (sf below threshold). Real
    // fold-and-thrust belts form on the overriding plate, not the subducting
    // one — biasing kernel placement to (1 - sf) reflects that.
    const candidates = [];
    const stressFloor = PHASOR_STRESS_THRESHOLD;
    for (let r = 0; r < numRegions; r++) {
        if (r_isOcean[r]) continue;
        if (r_stress[r] / maxStress < stressFloor) continue;
        if (r_subductFactor[r] > PHASOR_SF_KERNEL_MAX) continue;
        const sdx = r_stressDirSmoothed[3*r], sdy = r_stressDirSmoothed[3*r+1], sdz = r_stressDirSmoothed[3*r+2];
        const sdLen2 = sdx*sdx + sdy*sdy + sdz*sdz;
        if (sdLen2 < 0.25) continue;
        candidates.push(r);
    }

    if (candidates.length === 0) return;

    // Fisher-Yates shuffle to pick first N without replacement
    for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = candidates[i];
        candidates[i] = candidates[j];
        candidates[j] = tmp;
    }

    const numKernels = Math.min(PHASOR_NUM_KERNELS, candidates.length);
    const kernels = new Array(numKernels);

    for (let ki = 0; ki < numKernels; ki++) {
        const r = candidates[ki];
        const px = r_xyz[3*r], py = r_xyz[3*r+1], pz = r_xyz[3*r+2];

        // Project (smoothed) stress direction to tangent plane at kernel position.
        let dx = r_stressDirSmoothed[3*r], dy = r_stressDirSmoothed[3*r+1], dz = r_stressDirSmoothed[3*r+2];
        const radial = dx*px + dy*py + dz*pz;
        dx -= radial * px; dy -= radial * py; dz -= radial * pz;
        let dLen = Math.sqrt(dx*dx + dy*dy + dz*dz);
        if (dLen < 1e-6) continue;
        dx /= dLen; dy /= dLen; dz /= dLen;

        // Optionally rotate 90° in tangent plane: d' = position × d.
        // The stress direction points from the boundary toward the plate
        // interior. In phasor noise, ridges form perpendicular to d_k —
        // mathematically they should be parallel to the boundary using
        // raw stressDir, but observed visual is 90° off, so this flag
        // rotates so stripes line up parallel to the orogen strike.
        if (PHASOR_DIRECTION_PERP) {
            const rx = py * dz - pz * dy;
            const ry = pz * dx - px * dz;
            const rz = px * dy - py * dx;
            dx = rx; dy = ry; dz = rz;
            // already unit (cross of two unit vectors with 90° between them)
        }

        // Orientation jitter (Rodrigues around p; since d ⊥ p, d' = d·cos + (p×d)·sin)
        const jitter = (rng() - 0.5) * 2 * PHASOR_ORIENTATION_JITTER;
        const cosJ = Math.cos(jitter), sinJ = Math.sin(jitter);
        const cx = py * dz - pz * dy;
        const cy = pz * dx - px * dz;
        const cz = px * dy - py * dx;
        const ndx = dx * cosJ + cx * sinJ;
        const ndy = dy * cosJ + cy * sinJ;
        const ndz = dz * cosJ + cz * sinJ;

        kernels[ki] = {
            x: px, y: py, z: pz,
            dx: ndx, dy: ndy, dz: ndz,
            phase: rng() * 2 * Math.PI,
            stressNorm: Math.min(1, r_stress[r] / maxStress),
        };
    }
    // Trim any holes from skipped kernels
    const liveKernels = kernels.filter(k => k);

    // Spatial grid for fast lookup (lat × lon binning, like volcanos).
    // Bandwidth ~110 km → angular ~0.017 rad → covers ~1° lat. With 36×72
    // bins (5° each), a ±1 cell neighbor search comfortably contains all
    // contributing kernels.
    const PLAT_BINS = 36, PLON_BINS = 72;
    const grid = new Array(PLAT_BINS * PLON_BINS);
    for (let ki = 0; ki < liveKernels.length; ki++) {
        const k = liveKernels[ki];
        const lat = Math.asin(Math.max(-1, Math.min(1, k.y)));
        const lon = Math.atan2(k.x, k.z);
        const bi = Math.max(0, Math.min(PLAT_BINS - 1, Math.floor((lat + Math.PI / 2) / Math.PI * PLAT_BINS)));
        const bj = Math.max(0, Math.min(PLON_BINS - 1, Math.floor((lon + Math.PI) / (2 * Math.PI) * PLON_BINS)));
        const bin = bi * PLON_BINS + bj;
        if (!grid[bin]) grid[bin] = [];
        grid[bin].push(ki);
    }
    // Search radius in bins: bandwidth × 3 in radians vs bin size in radians
    const binLatRad = Math.PI / PLAT_BINS;
    const searchBins = Math.max(1, Math.ceil(3 * bandwidthRad / binLatRad));

    // Phasor is a structural shaped-noise feature, not surface texture —
    // amplitude is decoupled from the noiseMag slider so cranking phasor
    // strength doesn't require also cranking the global noise slider.
    const baseAmp = PHASOR_AMPLITUDE;
    const warpNoise = new SimplexNoise(seed + 1717);

    for (let r = 0; r < numRegions; r++) {
        if (r_isOcean[r]) continue;
        const elev = r_elevation[r];
        if (elev < PHASOR_ELEV_THRESHOLD) continue;

        const px = r_xyz[3*r], py = r_xyz[3*r+1], pz = r_xyz[3*r+2];

        // Phase-space domain warp: high-freq multi-octave fbm displacement
        // applied to position before computing dot(p, d_k). All kernels at
        // this cell see the same warped position, so the level sets of
        // their summed phase curve consistently — phasor stripes meander
        // organically instead of tracing perfect small-circles.
        const wf = PHASOR_WARP_FREQ;
        const wa = PHASOR_WARP_AMPLITUDE;
        const woct = PHASOR_WARP_OCTAVES;
        const warpX = warpNoise.fbm(px * wf + 17.3, py * wf + 28.4, pz * wf + 9.1, woct, 0.5) * wa;
        const warpY = warpNoise.fbm(px * wf + 5.2, py * wf + 33.6, pz * wf + 22.8, woct, 0.5) * wa;
        const warpZ = warpNoise.fbm(px * wf + 11.7, py * wf + 6.9, pz * wf + 41.5, woct, 0.5) * wa;
        const wpx = px + warpX;
        const wpy = py + warpY;
        const wpz = pz + warpZ;

        const lat = Math.asin(Math.max(-1, Math.min(1, py)));
        const lon = Math.atan2(px, pz);
        const rbi = Math.max(0, Math.min(PLAT_BINS - 1, Math.floor((lat + Math.PI / 2) / Math.PI * PLAT_BINS)));
        const rbj = Math.max(0, Math.min(PLON_BINS - 1, Math.floor((lon + Math.PI) / (2 * Math.PI) * PLON_BINS)));

        let phasorRe = 0, phasorIm = 0;
        let envelopeSum = 0;

        for (let di = -searchBins; di <= searchBins; di++) {
            const bi = rbi + di;
            if (bi < 0 || bi >= PLAT_BINS) continue;
            for (let dj = -searchBins; dj <= searchBins; dj++) {
                const bj = ((rbj + dj) % PLON_BINS + PLON_BINS) % PLON_BINS;
                const cell = grid[bi * PLON_BINS + bj];
                if (!cell) continue;
                for (let ci = 0; ci < cell.length; ci++) {
                    const k = liveKernels[cell[ci]];
                    // Chord-length² between p and kernel position (≈ angle² for small angles)
                    const ddx = px - k.x, ddy = py - k.y, ddz = pz - k.z;
                    const chordSq = ddx*ddx + ddy*ddy + ddz*ddz;
                    if (chordSq > envelopeCutoffSq) continue;
                    const envelope = Math.exp(chordSq * invBw2);
                    if (envelope < 0.01) continue;

                    // Phase coordinate: dot(warped p, d_k). Position is
                    // domain-warped so stripes meander organically; envelope
                    // still uses true position so kernel placement isn't
                    // displaced.
                    const phaseCoord = wpx * k.dx + wpy * k.dy + wpz * k.dz;
                    const phase = 2 * Math.PI * frequency * phaseCoord + k.phase;
                    phasorRe += envelope * Math.cos(phase);
                    phasorIm += envelope * Math.sin(phase);
                    envelopeSum += envelope;
                }
            }
        }

        if (envelopeSum < 0.02) continue;

        // Sawtooth profile: phase / (2π) gives [-0.5, +0.5] symmetric.
        // PHASOR_BIAS shifts the range upward so contribution is mostly
        // positive (tall peaks, mild troughs) — looks like asymmetric
        // thrust faulting rather than equal-magnitude up/down ridges.
        const totalPhase = Math.atan2(phasorIm, phasorRe);
        const ridgeCentered = totalPhase / (2 * Math.PI) + PHASOR_BIAS;

        // Elevation gate: ramp from 0 at threshold to 1 over PHASOR_ELEV_RAMP_RANGE
        const elevGate = Math.min(1, (elev - PHASOR_ELEV_THRESHOLD) / PHASOR_ELEV_RAMP_RANGE);

        // Fold-belt modulation: contribution scales directly with foldBelt
        // weight (with a floor so non-fold-belt cells still receive a small
        // share of the phasor signal). At foldBelt=1 the cell gets the full
        // amplitude; at foldBelt=0 it gets PHASOR_FOLDBELT_FLOOR of it.
        const fb = r_t_foldBelt[r] || 0;
        const foldBeltMul = PHASOR_FOLDBELT_FLOOR + (1 - PHASOR_FOLDBELT_FLOOR) * fb;

        // Orogenic-power modulation — squared so the gate is more selective.
        // High-oroPow cells get full effect, low-oroPow cells get strongly
        // muted (oroPow=0.5 → factor 0.25, oroPow=0.7 → 0.49, oroPow=1.0 → 1.0).
        const oroRaw = (dl_oroPower[r] || 0) + 0.5;
        const oroPow = oroRaw * oroRaw;

        // Subduction asymmetry: full strength up to PHASOR_SF_GATE_FULL, then
        // smoothstep down to zero at PHASOR_SF_GATE_ZERO. With FULL=0.55 and
        // ZERO=0.92, both sides of a C-C boundary (sf≈0.5) get full strength,
        // overriding side of an O-C boundary gets full strength, and the
        // subducting side fades out.
        let sfGate;
        const sfR = r_subductFactor[r];
        if (sfR <= PHASOR_SF_GATE_FULL) {
            sfGate = 1;
        } else if (sfR >= PHASOR_SF_GATE_ZERO) {
            sfGate = 0;
        } else {
            const t = (sfR - PHASOR_SF_GATE_FULL) / (PHASOR_SF_GATE_ZERO - PHASOR_SF_GATE_FULL);
            sfGate = 1 - t * t * (3 - 2 * t);
        }

        const contrib = ridgeCentered * baseAmp * elevGate * foldBeltMul * sfGate * oroPow;
        r_elevation[r] += contrib;
        dl_phasor[r] = contrib;
    }

    // Diagnostic: confirm phasor is actually doing something.
    let nonzero = 0, sumAbs = 0, maxAbs = 0;
    for (let r = 0; r < numRegions; r++) {
        const v = dl_phasor[r];
        if (v !== 0) { nonzero++; const a = Math.abs(v); sumAbs += a; if (a > maxAbs) maxAbs = a; }
    }
    console.log(`[phasor] kernels=${liveKernels.length} cells_affected=${nonzero} max=${maxAbs.toFixed(4)} mean=${nonzero>0?(sumAbs/nonzero).toFixed(4):0}`);
}

// ─────────────────────────────────────────────────────────────────────────
//  Stage 7: Coastal detail
//  Coastal fractal noise, domain-warp delta, island scattering. Lifted
//  faithfully from original; uses spatial fields struct.
// ─────────────────────────────────────────────────────────────────────────
function applyCoastalDetail(mesh, r_xyz, r_elevation, tect, sf, noise, noiseMag, seed, debugLayers) {
    const { numRegions } = mesh;
    const { r_stress, maxStress, scaleFactor } = tect;
    const { r_isOcean, dBdry, coastStressMax, coastSubductMax, coastConvergent } = sf;
    const dl_coastal = debugLayers.coastal;

    const coastRoughenDist = Math.max(8, Math.round(COAST_ROUGHEN_BASE * scaleFactor));
    const cNoise  = new SimplexNoise(seed + 77);
    const cNoise2 = new SimplexNoise(seed + 133);
    const cNoise3 = new SimplexNoise(seed + 211);
    const islandMaxDist = Math.max(4, Math.round(ISLAND_DIST_BASE * scaleFactor));

    for (let r = 0; r < numRegions; r++) {
        if (dBdry[r] > coastRoughenDist) continue;
        const x = r_xyz[3*r], y = r_xyz[3*r+1], z = r_xyz[3*r+2];
        const t = dBdry[r] / coastRoughenDist;

        const sn = Math.min(1, Math.max(coastStressMax[r], r_stress[r] / maxStress));

        const isSubductingOcean = r_isOcean[r] && coastConvergent[r] && coastSubductMax[r] > COAST_SUBDUCT_SUP_LOW;
        const subSup = isSubductingOcean
            ? Math.min(1, (coastSubductMax[r] - COAST_SUBDUCT_SUP_LOW) / COAST_SUBDUCT_SUP_RANGE)
            : 0;

        const elevBeforeCoast = r_elevation[r];
        const isPassiveCoast = !coastConvergent[r];

        // Coastal fractal noise
        const falloff1 = (1 - t) * (1 - t);
        const stressAmp1 = 1 + sn * 5;
        const coastFreq = isPassiveCoast ? COAST_PASSIVE_FREQ : COAST_ACTIVE_FREQ;
        const coastAmp  = isPassiveCoast ? COAST_PASSIVE_AMP  : COAST_ACTIVE_AMP;
        let n1 = cNoise.fbm(x * coastFreq + 3.7, y * coastFreq + 7.1, z * coastFreq + 2.3, 5, 0.55);
        let coastNoise1 = n1 * coastAmp * falloff1 * stressAmp1;
        if (subSup > 0 && coastNoise1 > 0) coastNoise1 *= (1 - subSup);
        r_elevation[r] += coastNoise1;

        // Coastline-aware domain warp
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
            if (subSup > 0 && warpDelta > 0) warpDelta *= (1 - subSup);
            r_elevation[r] += warpDelta;
        }

        // Re-clamp ocean cells but preserve real islands (stage 6 edifices).
        if (r_isOcean[r] && r_elevation[r] > OCEAN_FLOOR_CLAMP && r_elevation[r] < ISLAND_PEAK_FLOOR) {
            r_elevation[r] = OCEAN_FLOOR_CLAMP;
        }

        // Island scattering
        if (r_isOcean[r] && dBdry[r] > 0 && dBdry[r] <= islandMaxDist && subSup < ISLAND_SUBDUCT_MAX) {
            const islandN = cNoise2.fbm(x * ISLAND_FREQ + 5.1, y * ISLAND_FREQ + 9.3, z * ISLAND_FREQ + 2.7, 4, 0.5);
            const threshold = ISLAND_THRESHOLD_BASE - sn * ISLAND_THRESHOLD_STRESS;
            if (islandN > threshold) {
                const excess = (islandN - threshold) / (1 - threshold);
                const distFade = 1 - (dBdry[r] / islandMaxDist);
                const peakN = cNoise2.ridgedFbm(x * ISLAND_FREQ * 2.5 + 31.7, y * ISLAND_FREQ * 2.5 + 17.3, z * ISLAND_FREQ * 2.5 + 8.9, 3, 0.5);
                const peakMask = peakN * peakN;
                let bump = excess * excess * ISLAND_BUMP_AMP * (1 + sn * 2) * distFade * peakMask;
                bump *= (1 - subSup / ISLAND_SUBDUCT_MAX);
                if (bump + r_elevation[r] > ISLAND_PEAK_FLOOR) {
                    r_elevation[r] += bump;
                }
            }
        }

        dl_coastal[r] += r_elevation[r] - elevBeforeCoast;
    }
}

// ─────────────────────────────────────────────────────────────────────────
//  Stage 8: Discrete edifices
//  Island arcs + volcanic arcs + hotspot domes/chains + LIPs.
//  Each is its own helper; this orchestrator just calls them in order.
// ─────────────────────────────────────────────────────────────────────────
function applyIslandArcs(mesh, r_xyz, r_elevation, tect, sf, r_plate, seed, debugLayers) {
    const { numRegions, adjOffset, adjList } = mesh;
    const { r_boundaryType, r_subductFactor, r_stress, r_bothOcean, maxStress, scaleFactor } = tect;
    const { r_isOcean } = sf;
    const dl_coastal = debugLayers.coastal;

    const arcNoise = new SimplexNoise(seed + 307);
    const arcMacroNoise = new SimplexNoise(seed + 911);
    const maxArcDist = Math.max(5, Math.round(ARC_DIST_BASE * scaleFactor));

    const arcSeeds = [];
    const arcDist = new Float32Array(numRegions);
    arcDist.fill(maxArcDist + 1);
    const arcStress = new Float32Array(numRegions);

    // Step 1: collect candidates that pass the MACRO gate (low-freq noise +
    // stress weighting decides which stretches of OO convergent boundary
    // are eligible to host arcs at all).
    const arcCandidates = [];
    let macroAccepted = 0, macroRejected = 0;
    for (let r = 0; r < numRegions; r++) {
        if (r_boundaryType[r] === 1 && r_bothOcean[r] && r_subductFactor[r] < ARC_SUBDUCT_THRESH) {
            const stressNorm = Math.min(1, r_stress[r] / maxStress);
            const x = r_xyz[3*r], y = r_xyz[3*r+1], z = r_xyz[3*r+2];
            const macroVal = arcMacroNoise.fbm(x * ARC_MACRO_FREQ, y * ARC_MACRO_FREQ, z * ARC_MACRO_FREQ, 3, 0.5);
            const score = macroVal + stressNorm * ARC_MACRO_STRESS_WEIGHT;
            if (score < ARC_MACRO_THRESH) {
                macroRejected++;
                continue;
            }
            arcCandidates.push({ r, x, y, z, stressNorm, score });
            macroAccepted++;
        }
    }

    // Step 2: hard-cap arc origins. Sort candidates by score descending,
    // greedily pick up to ARC_MAX_ORIGINS that are pairwise separated by
    // at least ARC_ORIGIN_MIN_SPACING chord distance. Only these become
    // BFS seeds — drastically limits the per-planet number of arc systems
    // regardless of mesh resolution.
    arcCandidates.sort((a, b) => b.score - a.score);
    const minSpacingSq = ARC_ORIGIN_MIN_SPACING * ARC_ORIGIN_MIN_SPACING;
    const arcOrigins = [];
    for (let ci = 0; ci < arcCandidates.length && arcOrigins.length < ARC_MAX_ORIGINS; ci++) {
        const c = arcCandidates[ci];
        let tooClose = false;
        for (let oi = 0; oi < arcOrigins.length; oi++) {
            const o = arcOrigins[oi];
            const dx = c.x - o.x, dy = c.y - o.y, dz = c.z - o.z;
            if (dx*dx + dy*dy + dz*dz < minSpacingSq) { tooClose = true; break; }
        }
        if (tooClose) continue;
        arcOrigins.push(c);
    }
    for (const o of arcOrigins) {
        arcSeeds.push(o.r);
        arcDist[o.r] = 0;
        arcStress[o.r] = o.stressNorm;
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

    let arcCellsBumped = 0, arcUpliftSum = 0, arcMaxFinal = 0;
    for (let r = 0; r < numRegions; r++) {
        const d = arcDist[r];
        if (d < 1 || d > maxArcDist) continue;
        const x = r_xyz[3*r], y = r_xyz[3*r+1], z = r_xyz[3*r+2];

        const peakDist = Math.max(ARC_PEAK_DIST_BASE, ARC_PEAK_DIST_BASE * scaleFactor);
        const sigma = Math.max(ARC_SIGMA_BASE_VAL, ARC_SIGMA_BASE_VAL * scaleFactor);
        const distWeight = Math.exp(-0.5 * ((d - peakDist) / sigma) ** 2);

        // Base ridged-fbm gates which cells qualify as part of an island
        // arc patch. 2 octaves so qualifying patches are smooth and
        // consolidate into a few large clusters per active boundary
        // rather than scattering into many small islands at high detail.
        const n = arcNoise.ridgedFbm(x * ARC_BASE_FREQ, y * ARC_BASE_FREQ, z * ARC_BASE_FREQ, 2, 2.0, 0.5, 1.0);
        if (n > ARC_THRESHOLD) {
            const excess = (n - ARC_THRESHOLD) / (1 - ARC_THRESHOLD);
            // Sharp peak mask: ridgedFbm² produces sparse spikes near 1
            // with most values near 0.
            const peakN = arcNoise.ridgedFbm(x * ARC_PEAK_FREQ + 13.7, y * ARC_PEAK_FREQ + 27.1, z * ARC_PEAK_FREQ + 5.3, 3, 2.0, 0.5, 1.0);
            const peakMask = peakN * peakN;

            // Two-component additive uplift:
            //   base lift — linear in excess, no peak mask, ensures qualifying
            //               cells reliably break sea level
            //   peak spike — peakMask-gated, stacks stratovolcano-tall summits
            const stressFactor = 0.5 + arcStress[r];
            const baseLift  = excess   * ARC_BASE_AMP * distWeight * stressFactor;
            const peakSpike = peakMask * ARC_PEAK_AMP * distWeight * stressFactor;
            let uplift = baseLift + peakSpike;
            if (r_isOcean[r]) {
                const maxOceanUplift = Math.max(0, -r_elevation[r] + MAX_OCEAN_ARC_ELEV);
                uplift = Math.min(uplift, maxOceanUplift);
            }
            r_elevation[r] += uplift;
            dl_coastal[r] += uplift;

            arcCellsBumped++;
            arcUpliftSum += uplift;
            if (r_elevation[r] > arcMaxFinal) arcMaxFinal = r_elevation[r];
        }
    }
    console.log(`[islandArcs] macro_accepted=${macroAccepted}/${macroAccepted + macroRejected} origins_kept=${arcOrigins.length}/${ARC_MAX_ORIGINS} cells_bumped=${arcCellsBumped} mean_uplift=${arcCellsBumped>0?(arcUpliftSum/arcCellsBumped).toFixed(3):0} max_final_elev=${arcMaxFinal.toFixed(3)}`);
}

function applyVolcanicArcs(mesh, r_xyz, r_elevation, tect, seed, debugLayers) {
    const { numRegions } = mesh;
    const { r_boundaryType, r_subductFactor, r_stress, r_hasOcean, maxStress } = tect;
    const dl_hotspot = debugLayers.hotspot;

    const arcVolcNoise = new SimplexNoise(seed + 713);
    const VOLC_MIN_SPACING_SQ = VOLC_MIN_SPACING * VOLC_MIN_SPACING;

    const candidates = [];
    for (let r = 0; r < numRegions; r++) {
        if (r_boundaryType[r] === 1 && r_hasOcean[r] && r_subductFactor[r] < VOLC_SUBDUCT_THRESH) {
            const stressLocal = Math.min(1, r_stress[r] / maxStress);
            const x = r_xyz[3 * r], y = r_xyz[3 * r + 1], z = r_xyz[3 * r + 2];
            const score = stressLocal + 0.3 * arcVolcNoise.noise3D(x * 8, y * 8, z * 8);
            candidates.push({ r, x, y, z, score, stressLocal });
        }
    }
    candidates.sort((a, b) => b.score - a.score);

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

    for (let vi = 0; vi < volcPositions.length; vi++) {
        const v = volcPositions[vi];
        v.invS2 = -0.5 / (v.sigma * v.sigma);
    }

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

    for (let r = 0; r < numRegions; r++) {
        const rx = r_xyz[3 * r], ry = r_xyz[3 * r + 1], rz = r_xyz[3 * r + 2];
        const rLat = Math.asin(Math.max(-1, Math.min(1, ry)));
        const rLon = Math.atan2(rx, rz);
        const rbi = Math.max(0, Math.min(VLAT_BINS - 1, Math.floor((rLat + Math.PI / 2) / Math.PI * VLAT_BINS)));
        const rbj = Math.max(0, Math.min(VLON_BINS - 1, Math.floor((rLon + Math.PI) / (2 * Math.PI) * VLON_BINS)));

        let volcUplift = 0;
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

function applyHotspotsAndLIPs(mesh, r_xyz, r_elevation, tect, sf, plateVec, r_plate, plateIsOcean, seed, debugLayers) {
    const { numRegions } = mesh;
    const { r_mantleNorm } = tect;
    const { r_isOcean } = sf;
    const dl_hotspot = debugLayers.hotspot;
    const dl_lip = debugLayers.lip;

    const hsRng = makeRng(seed + 999);
    const hsNoise  = new SimplexNoise(seed + 501);
    const hsNoise2 = new SimplexNoise(seed + 502);
    const hsNoise3 = new SimplexNoise(seed + 503);

    const domes = [];
    const lipSites = [];

    const buildTangentFrame = (px, py, pz, dx, dy, dz) => {
        const dd = dx*px + dy*py + dz*pz;
        let ux = dx - dd*px, uy = dy - dd*py, uz = dz - dd*pz;
        const uLen = Math.sqrt(ux*ux + uy*uy + uz*uz) || 1;
        ux /= uLen; uy /= uLen; uz /= uLen;
        const vx = py*uz - pz*uy, vy = pz*ux - px*uz, vz = px*uy - py*ux;
        return { ux, uy, uz, vx, vy, vz };
    };

    const hsPosRng = makeRng(seed + 1001);
    const findNearestR = (px, py, pz) => {
        let bestDot = -2, bestR = 0;
        for (let r = 0; r < numRegions; r++) {
            const dot = px * r_xyz[3*r] + py * r_xyz[3*r+1] + pz * r_xyz[3*r+2];
            if (dot > bestDot) { bestDot = dot; bestR = r; }
        }
        return bestR;
    };

    const spawnSatellites = (parent, satRng) => {
        for (let s = 0; s < DOME_SATELLITE_COUNT; s++) {
            const angle = satRng() * 2 * Math.PI;
            const offDist = parent.sigma * DOME_SATELLITE_OFFSET * (0.5 + satRng() * 0.5);
            const offX = Math.cos(angle) * parent.ux + Math.sin(angle) * parent.vx;
            const offY = Math.cos(angle) * parent.uy + Math.sin(angle) * parent.vy;
            const offZ = Math.cos(angle) * parent.uz + Math.sin(angle) * parent.vz;
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
                riftAngles: [],
            });
        }
    };

    for (let h = 0; h < NUM_HOTSPOTS; h++) {
        const hStrength = DOME_STRENGTH * (0.4 + hsRng() * 1.2);
        const hSigma    = DOME_SIGMA * (0.4 + hsRng() * 1.2);
        const hDecay    = CHAIN_DECAY + (hsRng() - 0.5) * 0.35;
        const hLength   = Math.max(3, CHAIN_LENGTH + Math.round((hsRng() - 0.5) * 10));

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

        const sigmaScale = isContinental ? CONT_HOTSPOT_SIGMA_MULT : 1.0;
        const strengthScale = isContinental ? CONT_HOTSPOT_STRENGTH_MULT : 1.0;
        const oceanBoost = isOceanHotspot ? DOME_OCEAN_BOOST : 1.0;
        const effectiveSigma = hSigma * sigmaScale;
        const effectiveStrength = hStrength * strengthScale * oceanBoost;

        const baseRiftAngle = hsNoise3.noise3D(hx*10, hy*10, hz*10) * Math.PI;
        const riftAnglesForDome = (ci, cl) => {
            if (ci === 0) return [baseRiftAngle, baseRiftAngle + Math.PI * 0.6, baseRiftAngle - Math.PI * 0.6];
            if (ci === 1) return [baseRiftAngle, baseRiftAngle + Math.PI];
            if (ci <= Math.floor(cl * 0.4)) return [baseRiftAngle];
            return [];
        };

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

        let perpX = drift[1] * hz - drift[2] * hy;
        let perpY = drift[2] * hx - drift[0] * hz;
        let perpZ = drift[0] * hy - drift[1] * hx;
        const perpLen = Math.sqrt(perpX*perpX + perpY*perpY + perpZ*perpZ) || 1;
        perpX /= perpLen; perpY /= perpLen; perpZ /= perpLen;

        let cx = hx, cy = hy, cz = hz;
        let str = effectiveStrength;
        let baseStr = hStrength * strengthScale;
        for (let c = 0; c < hLength; c++) {
            const ci = c + 1;
            const decayJitter = hDecay * (0.7 + hsRng() * 0.6);
            str *= decayJitter;
            baseStr *= decayJitter;
            const stepSpacing = CHAIN_SPACING * (0.3 + hsRng() * 1.4);
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
            if (ci <= Math.ceil(hLength * 0.4)) {
                spawnSatellites(domes[domes.length - 1], hsRng);
            }
        }

        // LIP at chain tail (oldest end)
        {
            const lipR = findNearestR(cx, cy, cz);
            const upwelling = r_mantleNorm ? Math.max(0, r_mantleNorm[lipR]) : 0.5;
            const landBoost = r_isOcean[lipR] ? 0.6 : 1.0;
            const baseLipStr = LIP_HEIGHT * (0.5 + hsRng()) * (0.5 + upwelling) * landBoost;
            const baseLipSigma = LIP_SIGMA * (0.7 + 0.6 * hsRng());

            const lipFrame = buildTangentFrame(cx, cy, cz, drift[0], drift[1], drift[2]);
            const lipAspect = 1.5 + hsRng() * 1.5;
            lipSites.push({
                x: cx, y: cy, z: cz,
                sigma: baseLipSigma, height: baseLipStr,
                ux: lipFrame.ux, uy: lipFrame.uy, uz: lipFrame.uz,
                vx: lipFrame.vx, vy: lipFrame.vy, vz: lipFrame.vz,
                aspect: lipAspect,
            });

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
                const lobeAngle = hsRng() * Math.PI;
                const ca = Math.cos(lobeAngle), sa = Math.sin(lobeAngle);
                lipSites.push({
                    x: lx, y: ly, z: lz,
                    sigma: baseLipSigma * LIP_LOBE_SIGMA * (0.6 + hsRng() * 0.8),
                    height: baseLipStr * LIP_LOBE_STRENGTH * (0.5 + hsRng() * 0.5),
                    ux: ca * lipFrame.ux + sa * lipFrame.vx,
                    uy: ca * lipFrame.uy + sa * lipFrame.vy,
                    uz: ca * lipFrame.uz + sa * lipFrame.vz,
                    vx: -sa * lipFrame.ux + ca * lipFrame.vx,
                    vy: -sa * lipFrame.uy + ca * lipFrame.vy,
                    vz: -sa * lipFrame.uz + ca * lipFrame.vz,
                    aspect: 1.2 + hsRng() * 1.3,
                });
            }
        }
    }

    // Pre-compute per-dome constants
    for (let d = 0; d < domes.length; d++) {
        const dm = domes[d];
        dm.cosThreshPeak = Math.cos(dm.sigma * DOME_PEAK_THRESH_SIGMA);
        dm.invS2 = -0.5 / (dm.sigma * dm.sigma);
        const swMult = dm.isContinental ? CONT_HOTSPOT_SWELL_MULT : 1.0;
        const swSigma = dm.sigma * SWELL_SIGMA_MULT * swMult;
        dm.swellSigma = swSigma;
        dm.swellStrength = dm.baseStrength * SWELL_STR_MULT;
        dm.cosThreshSwell = Math.cos(swSigma * DOME_SWELL_THRESH_SIGMA);
        dm.invS2Swell = -0.5 / (swSigma * swSigma);
        dm.driftStretch = 1.0 / DOME_DRIFT_STRETCH;
        dm.hasCaldera = dm.chainIndex <= 1 && dm.strength > DOME_CALDERA_STRENGTH_MIN;
        const calSigFrac = dm.isContinental ? CONT_HOTSPOT_CALDERA_SIGMA_FRAC : DOME_CALDERA_SIGMA_FRAC;
        const calDepFrac = dm.isContinental ? CONT_HOTSPOT_CALDERA_DEPTH_FRAC : DOME_CALDERA_DEPTH_FRAC;
        dm.calderaSigma = dm.sigma * calSigFrac;
        dm.calderaDepth = dm.strength * calDepFrac;
        dm.invS2Caldera = -0.5 / (dm.calderaSigma * dm.calderaSigma);
        dm.ageFactor = dm.chainLength > 0 ? dm.chainIndex / dm.chainLength : 0;
    }

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

    for (let r = 0; r < numRegions; r++) {
        const rx = r_xyz[3*r], ry = r_xyz[3*r+1], rz = r_xyz[3*r+2];
        const rLat = Math.asin(Math.max(-1, Math.min(1, ry)));
        const rLon = Math.atan2(rx, rz);
        const rbi = Math.max(0, Math.min(DLAT_BINS - 1, Math.floor((rLat + Math.PI / 2) / Math.PI * DLAT_BINS)));
        const rbj = Math.max(0, Math.min(DLON_BINS - 1, Math.floor((rLon + Math.PI) / (2 * Math.PI) * DLON_BINS)));

        let totalUplift = 0;
        let totalSwellUplift = 0;
        let weightedAge = 0;
        let ageWeightSum = 0;
        let nearPeak = false;
        let shapeWarpSq = 1.0;
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

        if (nearPeak) {
            const hsWarpScale = DOME_SHAPE_WARP_FREQ;
            const wx = hsNoise2.fbm(rx * hsWarpScale + 5.1, ry * hsWarpScale + 3.7, rz * hsWarpScale + 9.2, 2, 0.5) * DOME_SHAPE_WARP_AMP;
            const wy = hsNoise2.fbm(rx * hsWarpScale + 11.3, ry * hsWarpScale + 7.1, rz * hsWarpScale + 2.9, 2, 0.5) * DOME_SHAPE_WARP_AMP;
            const wz = hsNoise2.fbm(rx * hsWarpScale + 1.7, ry * hsWarpScale + 13.5, rz * hsWarpScale + 6.4, 2, 0.5) * DOME_SHAPE_WARP_AMP;
            const shapeWarp = 1.0 + DOME_SHAPE_WARP_DETAIL_AMP * hsNoise.fbm(
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

                    if (dot > dm.cosThreshSwell) {
                        const swAngleSq = 2 * (1 - dot);
                        totalSwellUplift += dm.swellStrength * Math.exp(swAngleSq * dm.invS2Swell);
                    }

                    if (dot < dm.cosThreshPeak) continue;

                    const offX = rx - dot * dm.x, offY = ry - dot * dm.y, offZ = rz - dot * dm.z;
                    const parComp  = offX * dm.ux + offY * dm.uy + offZ * dm.uz;
                    const perpComp = offX * dm.vx + offY * dm.vy + offZ * dm.vz;
                    const stretchedParSq = (parComp * dm.driftStretch) * (parComp * dm.driftStretch);
                    const angleSq = stretchedParSq + perpComp * perpComp;

                    let gauss = Math.exp(angleSq * shapeWarpSq * dm.invS2);

                    if (dm.riftAngles.length > 0 && gauss > 0.01) {
                        const angle = Math.atan2(perpComp, parComp);
                        let maxRift = 0;
                        for (let ri = 0; ri < dm.riftAngles.length; ri++) {
                            let da = angle - dm.riftAngles[ri];
                            da = da - Math.round(da / (2 * Math.PI)) * 2 * Math.PI;
                            const c2 = Math.cos(da);
                            const riftFactor = c2 * c2 * c2 * c2;
                            if (riftFactor > maxRift) maxRift = riftFactor;
                        }
                        gauss *= (1.0 + DOME_RIFT_BOOST * maxRift);
                    }

                    const peakUplift = dm.strength * gauss;
                    totalUplift += peakUplift;

                    weightedAge += dm.ageFactor * peakUplift;
                    ageWeightSum += peakUplift;

                    if (dm.hasCaldera) {
                        const calderaGauss = Math.exp(angleSq * dm.invS2Caldera);
                        totalUplift -= dm.calderaDepth * calderaGauss;
                    }
                }
            }
        }

        const combinedUplift = totalSwellUplift + totalUplift;
        if (combinedUplift > 0.001) {
            const age = ageWeightSum > 0 ? weightedAge / ageWeightSum : 0;
            const texBase   = DOME_TEXTURE_BASE_WEIGHT   * hsNoise.ridgedFbm(rx * 12, ry * 12, rz * 12, 4, 2.0, 0.5, 1.0);
            const texDetail = DOME_TEXTURE_DETAIL_WEIGHT * hsNoise.ridgedFbm(rx * 30, ry * 30, rz * 30, 3, 2.0, 0.5, 1.0);
            const texRaw = texBase + texDetail;
            const texMin = DOME_TEXTURE_ACTIVE_MIN + age * DOME_TEXTURE_AGE_MIN_SHIFT;
            const texMax = DOME_TEXTURE_ACTIVE_MAX - age * DOME_TEXTURE_AGE_MAX_SHIFT;
            const volc = texMin + (texMax - texMin) * texRaw;

            const uplift = totalSwellUplift + Math.max(0, totalUplift) * volc;
            r_elevation[r] += uplift;
            dl_hotspot[r] = uplift;
        }
    }

    // LIPs
    if (lipSites.length > 0) {
        const lipWarpNoise = new SimplexNoise(seed + 7771);
        const lipWarpAmp = 0.08;
        for (let r = 0; r < numRegions; r++) {
            const rx = r_xyz[3 * r], ry = r_xyz[3 * r + 1], rz = r_xyz[3 * r + 2];
            const wx = rx + lipWarpNoise.noise3D(rx * 6, ry * 6, rz * 6) * lipWarpAmp;
            const wy = ry + lipWarpNoise.noise3D(rx * 6 + 40, ry * 6 + 40, rz * 6 + 40) * lipWarpAmp;
            const wz = rz + lipWarpNoise.noise3D(rx * 6 + 80, ry * 6 + 80, rz * 6 + 80) * lipWarpAmp;
            const wl = Math.sqrt(wx * wx + wy * wy + wz * wz);
            const wrx = wx / wl, wry = wy / wl, wrz = wz / wl;

            for (let li = 0; li < lipSites.length; li++) {
                const lip = lipSites[li];
                const dot = wrx * lip.x + wry * lip.y + wrz * lip.z;
                if (dot < 0.9) continue;

                const dx = wrx - lip.x * dot;
                const dy = wry - lip.y * dot;
                const dz = wrz - lip.z * dot;
                const du = dx * lip.ux + dy * lip.uy + dz * lip.uz;
                const dv = dx * lip.vx + dy * lip.vy + dz * lip.vz;
                const aspect = lip.aspect || 1.0;
                const ellipDist = (du * du) / (aspect * aspect) + dv * dv;

                const invS2 = -0.5 / (lip.sigma * lip.sigma);
                const gauss = Math.exp(ellipDist * invS2);
                if (gauss > 0.01) {
                    const contrib = lip.height * gauss;
                    r_elevation[r] += contrib;
                    dl_lip[r] += contrib;
                    dl_hotspot[r] += contrib;
                }
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────
//  Stage 9: Uniform background land noise
// ─────────────────────────────────────────────────────────────────────────
function applyUniformLandNoise(mesh, r_xyz, r_elevation, sf, tt, noiseMag, seed, debugLayers) {
    const { numRegions, adjOffset, adjList } = mesh;
    const { r_isOcean, dist_mountain } = sf;
    const { r_basinFactor } = tt;
    const dl_uniformNoise = debugLayers.uniformNoise;
    const scaleFactor = Math.sqrt(numRegions / COLLISION_DT_REF_REGIONS);

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

        const ex = r_elevation[r];
        let sum = 0, count = 0;
        for (let ni = adjOffset[r], niEnd = adjOffset[r + 1]; ni < niEnd; ni++) {
            sum += Math.abs(r_elevation[adjList[ni]] - ex);
            count++;
        }
        const slopeVal = sum / (count | 1);

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

// ─────────────────────────────────────────────────────────────────────────
//  Stage 10: Dynamic topography
// ─────────────────────────────────────────────────────────────────────────
function applyDynamicTopography(r_elevation, r_mantleNorm, debugLayers) {
    if (!r_mantleNorm) return;
    const dl_dynamicTopo = debugLayers.dynamicTopo;
    for (let r = 0; r < r_elevation.length; r++) {
        const mn = r_mantleNorm[r];
        const dtopo = mn > 0 ? mn * DYNAMIC_TOPO_UPLIFT : mn * DYNAMIC_TOPO_SUBSIDENCE;
        r_elevation[r] += dtopo;
        dl_dynamicTopo[r] = dtopo;
    }
}

// ─────────────────────────────────────────────────────────────────────────
//  Stage 11: Final shaping
//  Peak compression + isostatic + hypsometric remap. The three composed
//  passes from the original; preserved separately for now since their
//  composition was tuned together — collapsing into a single curve
//  is a follow-up task.
// ─────────────────────────────────────────────────────────────────────────
function applyFinalShaping(r_elevation) {
    const numRegions = r_elevation.length;

    // Peak compression
    for (let r = 0; r < numRegions; r++) {
        if (r_elevation[r] > 0) {
            r_elevation[r] = Math.pow(r_elevation[r], PEAK_COMPRESS_POWER);
        }
    }

    // Isostatic adjustment
    for (let r = 0; r < numRegions; r++) {
        const e = r_elevation[r];
        r_elevation[r] = e - Math.abs(e) * e * ISOSTATIC_K;
    }

    // Hypsometric curve shaping
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
            for (let i = 0; i < n; i++) {
                const r = landRegions[i];
                const rank = i / (n - 1);

                let targetPct;
                if (rank < HYPS_LOW_BREAK) {
                    targetPct = HYPS_LOW_ELEV_FRAC * (rank / HYPS_LOW_BREAK);
                } else if (rank < HYPS_MID_BREAK) {
                    targetPct = HYPS_LOW_ELEV_FRAC + HYPS_MID_ELEV_FRAC * ((rank - HYPS_LOW_BREAK) / (HYPS_MID_BREAK - HYPS_LOW_BREAK));
                } else {
                    const t = (rank - HYPS_MID_BREAK) / (1 - HYPS_MID_BREAK);
                    targetPct = (HYPS_LOW_ELEV_FRAC + HYPS_MID_ELEV_FRAC) + (1 - HYPS_LOW_ELEV_FRAC - HYPS_MID_ELEV_FRAC) * Math.pow(t, HYPS_HIGH_POWER);
                }

                const targetElev = minLandElev + targetPct * range;
                r_elevation[r] = r_elevation[r] * (1 - HYPS_BLEND) + targetElev * HYPS_BLEND;
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────
//  Stage 12: Topology fixup
//  Fill interior seas (BFS connectivity check; raise stranded sub-sea-level
//  land cells).
// ─────────────────────────────────────────────────────────────────────────
function fixupTopology(mesh, r_elevation, r_isOcean) {
    const { numRegions, adjOffset, adjList } = mesh;
    const visited = new Uint8Array(numRegions);
    const queue = [];
    for (let r = 0; r < numRegions; r++) {
        if (r_isOcean[r]) {
            visited[r] = 1;
            queue.push(r);
        }
    }
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
    for (let r = 0; r < numRegions; r++) {
        if (!r_isOcean[r] && !visited[r] && r_elevation[r] <= 0) {
            r_elevation[r] = FILL_LEVEL;
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────
//  Main orchestrator
// ─────────────────────────────────────────────────────────────────────────
export function assignElevation(mesh, r_xyz, plateIsOcean, r_plate, plateVec, plateSeeds, noise, noiseMag, seed, spread, plateDensity, superPlateData, r_mantleField) {
    const { numRegions } = mesh;
    const _timing = [];
    let _t0 = performance.now();

    // Allocate debug layers up front so each stage can write into them
    const debugLayers = {
        base:           new Float32Array(numRegions),
        tectonic:       new Float32Array(numRegions),
        noise:          new Float32Array(numRegions),
        interior:       new Float32Array(numRegions),
        coastal:        new Float32Array(numRegions),
        ocean:          new Float32Array(numRegions),
        hotspot:        new Float32Array(numRegions),
        lip:            new Float32Array(numRegions),
        tecActivity:    new Float32Array(numRegions),
        margins:        new Float32Array(numRegions),
        backArc:        new Float32Array(numRegions),
        phasorRidge:    new Float32Array(numRegions),
        orogenicPower:  new Float32Array(numRegions),
        uniformNoise:   new Float32Array(numRegions),
        dynamicTopo:    new Float32Array(numRegions),
    };

    // Stage 1
    const tect = computeTectonicState(mesh, r_xyz, plateIsOcean, r_plate, plateVec, plateSeeds, plateDensity, noise, superPlateData, r_mantleField, spread);
    _timing.push({ stage: '1. Tectonic state', ms: performance.now() - _t0 }); _t0 = performance.now();

    // Stage 2
    const sf = computeSpatialFields(mesh, r_xyz, r_plate, plateIsOcean, tect, seed, superPlateData);
    _timing.push({ stage: '2. Spatial fields', ms: performance.now() - _t0 }); _t0 = performance.now();

    // Stage 3
    const tt = classifyTerrain(mesh, r_xyz, tect, sf, seed);
    debugLayers.basin = tt.r_basinFactor;
    debugLayers.tecActivity = tt.r_tectonicActivity;
    debugLayers.noiseAmp = tt.r_noiseAmp;
    debugLayers.foldBeltWeight = tt.r_t_foldBelt;
    debugLayers.cratonWeight = tt.r_t_craton;
    debugLayers.basinWeight = tt.r_t_basin;
    _timing.push({ stage: '3. Terrain classification', ms: performance.now() - _t0 }); _t0 = performance.now();

    // Stage 4 — skeleton (first renderable intermediate; pure tectonic forms)
    const r_elevation = buildSkeleton(mesh, r_xyz, plateIsOcean, r_plate, plateVec, plateSeeds, tect, sf, tt, noise, noiseMag, seed, debugLayers);
    debugLayers.skeleton = new Float32Array(r_elevation);  // snapshot
    _timing.push({ stage: '4. Skeleton', ms: performance.now() - _t0 }); _t0 = performance.now();

    // Stage 5 — phasor ridges (shaped, directional; replaces v1 fold ridges)
    applyPhasorRidges(mesh, r_xyz, r_elevation, tect, sf, tt, noiseMag, seed, debugLayers);
    _timing.push({ stage: '5. Phasor ridges', ms: performance.now() - _t0 }); _t0 = performance.now();

    // Stage 6 — discrete edifices (shaped: arcs, stratovolcanoes, hotspots, LIPs).
    // Runs BEFORE textured noise so edifice shapes get textured by it.
    applyIslandArcs(mesh, r_xyz, r_elevation, tect, sf, r_plate, seed, debugLayers);
    applyVolcanicArcs(mesh, r_xyz, r_elevation, tect, seed, debugLayers);
    applyHotspotsAndLIPs(mesh, r_xyz, r_elevation, tect, sf, plateVec, r_plate, plateIsOcean, seed, debugLayers);
    _timing.push({ stage: '6. Edifices', ms: performance.now() - _t0 }); _t0 = performance.now();

    // Stage 7 — tectonic-band textured noise (was 5)
    applyTectonicBandNoise(mesh, r_xyz, r_elevation, sf, tt, noise, noiseMag, debugLayers);
    _timing.push({ stage: '7. Tectonic-band noise', ms: performance.now() - _t0 }); _t0 = performance.now();

    // Stage 8 — elevation-gated detail (was 6)
    applyDetailTexture(mesh, r_xyz, r_elevation, tect, sf, noise, noiseMag, debugLayers);
    _timing.push({ stage: '8. Detail texture', ms: performance.now() - _t0 }); _t0 = performance.now();

    // Stage 9 — coastal detail (was 7)
    applyCoastalDetail(mesh, r_xyz, r_elevation, tect, sf, noise, noiseMag, seed, debugLayers);
    _timing.push({ stage: '9. Coastal detail', ms: performance.now() - _t0 }); _t0 = performance.now();

    // Stage 10 — uniform background land noise
    applyUniformLandNoise(mesh, r_xyz, r_elevation, sf, tt, noiseMag, seed, debugLayers);
    _timing.push({ stage: '10. Uniform land noise', ms: performance.now() - _t0 }); _t0 = performance.now();

    // Stage 11 — mantle vertical deflection
    applyDynamicTopography(r_elevation, tect.r_mantleNorm, debugLayers);
    _timing.push({ stage: '11. Dynamic topography', ms: performance.now() - _t0 }); _t0 = performance.now();

    // Stage 12 — peak compress + isostatic + hypsometric
    applyFinalShaping(r_elevation);
    _timing.push({ stage: '12. Final shaping', ms: performance.now() - _t0 }); _t0 = performance.now();

    // Stage 13 — fill interior seas
    fixupTopology(mesh, r_elevation, sf.r_isOcean);
    _timing.push({ stage: '13. Topology fixup', ms: performance.now() - _t0 });

    if (superPlateData) {
        debugLayers.superPlates = new Float32Array(superPlateData.r_superPlate);
    }

    return {
        r_elevation,
        mountain_r:  tect.mountain_r,
        coastline_r: tect.coastline_r,
        ocean_r:     tect.ocean_r,
        r_stress:    tect.r_stress,
        debugLayers,
        _timing
    };
}
