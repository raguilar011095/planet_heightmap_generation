// Temperature simulation: computes per-region surface temperature for summer
// and winter seasons based on ITCZ position, continentality, elevation lapse
// rate, ocean current warmth, and precipitation/cloud cover moderation.
// Returns normalized 0-1 values mapped to a fixed -45 to +45 C range.

import { smoothstep } from './wind.js';
import { elevToHeightKm } from './color-map.js';

const DEG = Math.PI / 180;

// ── ITCZ latitude lookup (same pattern as precipitation.js) ─────────────────

function makeItczLookup(itczLons, itczLats) {
    const n = itczLons.length;
    const step = (2 * Math.PI) / n;
    const lonStart = -Math.PI + step * 0.5;

    return function (lon) {
        let fi = (lon - lonStart) / step;
        fi = ((fi % n) + n) % n;
        const i0 = Math.floor(fi);
        const i1 = (i0 + 1) % n;
        const frac = fi - i0;
        return itczLats[i0] * (1 - frac) + itczLats[i1] * frac;
    };
}

// ── Laplacian smoothing (same pattern as precipitation.js) ──────────────────

function smoothField(mesh, field, passes) {
    const { adjOffset, adjList, numRegions } = mesh;
    const tmp = new Float32Array(numRegions);

    for (let pass = 0; pass < passes; pass++) {
        for (let r = 0; r < numRegions; r++) {
            let sum = field[r];
            let count = 1;
            const end = adjOffset[r + 1];
            for (let ni = adjOffset[r]; ni < end; ni++) {
                sum += field[adjList[ni]];
                count++;
            }
            tmp[r] = sum / count;
        }
        field.set(tmp);
    }
}

// ── Diffuse ocean warmth onto nearby coastal land ───────────────────────────
// Uses plate-based continentality so that warmth spreads freely across
// shallow continental-shelf ocean and penetrates further inland. Ocean cells
// on continental plates (shallow seas) inherit warmth from nearby oceanic-
// plate cells first, then the warmth diffuses onto land.

function diffuseOceanWarmth(mesh, r_oceanWarmth, r_isLand, r_plateContinentality, passes) {
    const { adjOffset, adjList, numRegions } = mesh;
    const coastal = new Float32Array(numRegions);

    // Seed: all ocean cells contribute their warmth directly.
    // Continental-shelf ocean cells may have weak/no current warmth;
    // they'll pick up values from nearby oceanic-plate neighbors via diffusion.
    for (let r = 0; r < numRegions; r++) {
        if (!r_isLand[r]) {
            coastal[r] = r_oceanWarmth ? r_oceanWarmth[r] : 0;
        }
    }

    const tmp = new Float32Array(numRegions);
    for (let pass = 0; pass < passes; pass++) {
        tmp.set(coastal);
        for (let r = 0; r < numRegions; r++) {
            // Skip deep-interior continental cells (plate-based)
            if (r_plateContinentality && r_plateContinentality[r] >= 0.8) continue;

            // Ocean cells also participate in diffusion so continental-shelf
            // cells inherit warmth from nearby open-ocean neighbors
            let sum = coastal[r];
            let count = 1;
            const end = adjOffset[r + 1];
            for (let ni = adjOffset[r]; ni < end; ni++) {
                sum += coastal[adjList[ni]];
                count++;
            }
            tmp[r] = sum / count;
        }
        coastal.set(tmp);
    }

    return coastal;
}

// ── Main entry point ────────────────────────────────────────────────────────

/**
 * Compute seasonal temperature fields.
 *
 * @param {SphereMesh} mesh
 * @param {Float32Array} r_xyz - per-region 3D positions
 * @param {Float32Array} r_elevation - per-region elevation
 * @param {object} windResult - output from computeWind()
 * @param {object} oceanResult - output from computeOceanCurrents()
 * @param {object} precipResult - output from computePrecipitation()
 * @returns {{ r_temperature_summer, r_temperature_winter, _tempTiming }}
 */
export function computeTemperature(mesh, r_xyz, r_elevation, windResult, oceanResult, precipResult) {
    const numRegions = mesh.numRegions;
    const timing = [];

    const { r_lat, r_lon, r_isLand, r_continentality, r_plateContinentality } = windResult;

    // Minimal smoothing: 1 pass just to blend cell-to-cell noise
    const smoothPasses = 1;

    const T_MIN = -45;
    const T_MAX = 45;
    const T_RANGE = T_MAX - T_MIN;

    const result = {};

    const seasons = ['summer', 'winter'];

    for (const name of seasons) {
        const t0 = performance.now();

        const r_oceanWarmth = oceanResult[`r_ocean_warmth_${name}`];
        const r_oceanSpeed = oceanResult[`r_ocean_speed_${name}`];
        const r_precip = precipResult[`r_precip_${name}`];

        const itczLookup = makeItczLookup(windResult.itczLons,
            name === 'summer' ? windResult.itczLatsSummer : windResult.itczLatsWinter);

        // Pre-compute diffused ocean warmth for coastal land influence
        // Use plate-based continentality for diffusion so warmth crosses
        // continental shelves and reaches further inland
        const plateCont = r_plateContinentality || r_continentality;
        const coastalWarmth = diffuseOceanWarmth(mesh, r_oceanWarmth, r_isLand, plateCont, 8);

        const temp = new Float32Array(numRegions);

        for (let r = 0; r < numRegions; r++) {
            const lat = r_lat[r];
            const lon = r_lon[r];
            const latDeg = lat / DEG;
            const isLand = r_isLand[r];
            const elev = r_elevation[r];
            const cont = r_continentality ? r_continentality[r] : 0;
            const pCont = r_plateContinentality ? r_plateContinentality[r] : cont;

            // ── 1. Base temperature from thermal equator (ITCZ) ──
            // Two curves blended by absolute latitude:
            //  - T_itcz: based on distance from the actual (land-warped) ITCZ
            //  - T_flat: based on distance from a fixed ITCZ at ±5° (ocean default)
            // Near the tropics the real ITCZ matters; at high latitudes the
            // ITCZ position is irrelevant and a stable zonal baseline takes over.
            const tropicalHW = 11;  // flat plateau half-width (degrees)
            const maxDist = 90 - tropicalHW;

            // Actual ITCZ curve
            const itczLat = itczLookup(lon);
            const distItcz = Math.abs(lat - itczLat) / DEG;
            const tItcz = Math.max(0, distItcz - tropicalHW) / maxDist;
            const T_itcz = 27 - 55 * Math.pow(tItcz, 1.5);

            // Flat reference curve (ITCZ at 5° in summer hemisphere)
            const flatItczLat = (name === 'summer' ? 5 : -5) * DEG;
            const distFlat = Math.abs(lat - flatItczLat) / DEG;
            const tFlat = Math.max(0, distFlat - tropicalHW) / maxDist;
            const T_flat = 27 - 55 * Math.pow(tFlat, 1.5);

            // Blend: ITCZ curve dominates tropics, flat curve dominates poles
            const absLatDeg = Math.abs(lat) / DEG;
            const blend = smoothstep(45, 90, absLatDeg);
            let T = T_itcz * (1 - blend) + T_flat * blend;

            // ── 2. Elevation lapse rate ──
            // 6.5 C/km standard environmental lapse rate, using the
            // shared nonlinear elevation-to-physical-height mapping.
            if (isLand && elev > 0) {
                T -= 6.5 * elevToHeightKm(elev);
            }

            // ── 5. Ocean current temperature influence ──
            if (!isLand && r_oceanWarmth && r_oceanSpeed) {
                // Direct ocean effect: warm/cold currents shift SST
                const warmth = r_oceanWarmth[r];
                const speed = r_oceanSpeed[r];
                T += warmth * Math.min(1, speed * 2) * 10;
            } else if (isLand) {
                // Coastal land: diffused ocean warmth fades with plate-based
                // continentality so the effect reaches further inland and
                // crosses continental shelves naturally
                const cw = coastalWarmth[r];
                if (Math.abs(cw) > 0.001) {
                    T += cw * (1 - smoothstep(0, 0.8, pCont)) * 12;
                }
            }

            // ── 6. Precipitation / cloud cover moderation ──
            if (r_precip) {
                const p = r_precip[r];
                if (p > 0.5) {
                    // High precip → clouds → moderate toward latitude baseline
                    const mod = smoothstep(0.5, 1.0, p) * 0.15;
                    // Pull toward 0 (moderate extremes)
                    T *= (1 - mod);
                } else if (p < 0.3) {
                    // Low precip → clear skies → amplify extremes
                    const amp = smoothstep(0.3, 0.0, p) * 0.15;
                    T *= (1 + amp);
                }
            }

            // ── 7. Maritime / continental moderation ──
            // Ocean has high thermal inertia: coasts and small islands have
            // smaller seasonal temperature swings (moderate climate), while
            // continental interiors get more extreme summers and winters.
            // Compute an annual-mean baseline (ITCZ at equator, no seasonal
            // shift) and scale the seasonal deviation by continentality.
            {
                const distAnn = Math.abs(lat) / DEG; // distance from equator
                const tAnn = Math.max(0, distAnn - tropicalHW) / maxDist;
                const T_annual = 27 - 55 * Math.pow(tAnn, 1.5);
                // Apply same elevation lapse to annual baseline
                const T_ann_adj = isLand && elev > 0
                    ? T_annual - 6.5 * elevToHeightKm(elev)
                    : T_annual;
                const deviation = T - T_ann_adj;
                // Maritime factor: islands (cont≈0) → 0.35, coast (≈0.3) → 0.6,
                // moderate inland (≈0.6) → 0.9, deep interior (≈1) → 1.2
                const maritimeFactor = 0.35 + cont * 0.85;
                T = T_ann_adj + deviation * maritimeFactor;
            }

            temp[r] = T;
        }

        const tCompute = performance.now() - t0;

        // ── 7. Laplacian smoothing ──
        const tSmooth0 = performance.now();
        smoothField(mesh, temp, smoothPasses);
        const tSmooth = performance.now() - tSmooth0;

        // ── 8. Normalize to 0-1 using fixed range ──
        const tNorm0 = performance.now();
        for (let r = 0; r < numRegions; r++) {
            temp[r] = Math.max(0, Math.min(1, (temp[r] - T_MIN) / T_RANGE));
        }
        const tNorm = performance.now() - tNorm0;

        timing.push({ stage: `Temp: compute (${name})`, ms: tCompute });
        timing.push({ stage: `Temp: smooth (${name})`, ms: tSmooth });
        timing.push({ stage: `Temp: normalize (${name})`, ms: tNorm });

        result[`r_temperature_${name}`] = temp;
    }

    result._tempTiming = timing;
    return result;
}
