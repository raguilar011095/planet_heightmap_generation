// Heuristic precipitation model: smooth zonal patterns blended with the
// complex advection model to reduce splotchiness and strengthen deserts.
// Computes precipitation from four multiplicative factors: zonal base curve
// (distance from ITCZ), seasonal modifier, continental dryness, and
// orographic rain shadow.

import { smoothstep } from './wind.js';
import { elevToHeightKm } from './color-map.js';

const DEG = Math.PI / 180;

// ── ITCZ latitude lookup (same as precipitation.js) ─────────────────────────

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

// ── Laplacian smoothing ─────────────────────────────────────────────────────

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

// ── Zonal base curve ────────────────────────────────────────────────────────
// Returns a value in [0.03, 1.0] based on distance from the ITCZ in degrees.

function zonalBase(distDeg) {
    if (distDeg < 5) {
        // ITCZ core: 1.0
        return 1.0;
    } else if (distDeg < 10) {
        // Outer ITCZ / trades: 1.0 → 0.35 (faster falloff)
        return 1.0 - 0.65 * smoothstep(5, 10, distDeg);
    } else if (distDeg < 33) {
        // Subtropical highs (desert factory): 0.35 → 0.02
        // Very aggressive minimum — core of the desert belt.
        return 0.35 - 0.33 * smoothstep(10, 28, distDeg);
    } else if (distDeg < 55) {
        // Mid-lat westerlies recovery: 0.02 → 0.5
        return 0.02 + 0.48 * smoothstep(33, 55, distDeg);
    } else if (distDeg < 70) {
        // Subpolar: 0.5 → 0.3
        return 0.5 - 0.2 * smoothstep(55, 70, distDeg);
    } else {
        // Polar: 0.3 → 0.1
        return 0.3 - 0.2 * smoothstep(70, 90, distDeg);
    }
}

// ── Heuristic zonal wind ────────────────────────────────────────────────────
// Idealized wind direction based on latitude relative to the ITCZ.
// Returns local east/north components (positive east = blowing eastward,
// positive north = blowing poleward in NH).
//
// Zonal wind belts (Earth-like):
//   ITCZ (0-5°):        light/convergent
//   Trades (5-30°):     strong easterlies, deflected equatorward by Coriolis
//   Subtropical (25-35°): weak/variable (transition)
//   Westerlies (35-60°): west→east, deflected poleward
//   Polar easterlies (60-90°): east→west, deflected equatorward

function heuristicWind(distFromItczDeg, isNorthOfItcz) {
    // Sign for hemisphere: +1 if north of ITCZ, -1 if south
    const hemiSign = isNorthOfItcz ? 1 : -1;
    let we, wn;

    if (distFromItczDeg < 5) {
        // ITCZ: light convergent winds — slight equatorward component
        we = 0;
        wn = -hemiSign * 0.1;
    } else if (distFromItczDeg < 30) {
        // Trade winds: easterlies (blowing westward) with equatorward component
        // Strength ramps up from ITCZ edge, peaks ~15-20°, fades toward subtropics
        const tradeStrength = smoothstep(5, 15, distFromItczDeg)
            * (1 - smoothstep(25, 32, distFromItczDeg));
        we = -tradeStrength * 0.8;                 // strong westward
        wn = -hemiSign * tradeStrength * 0.3;      // equatorward (toward ITCZ)
    } else if (distFromItczDeg < 60) {
        // Westerlies: blowing eastward with poleward component
        const westStrength = smoothstep(30, 40, distFromItczDeg)
            * (1 - smoothstep(55, 65, distFromItczDeg));
        we = westStrength * 0.9;                    // strong eastward
        wn = hemiSign * westStrength * 0.25;        // poleward
    } else {
        // Polar easterlies: blowing westward with equatorward component
        const polarStrength = smoothstep(60, 70, distFromItczDeg);
        we = -polarStrength * 0.4;                  // moderate westward
        wn = -hemiSign * polarStrength * 0.15;      // equatorward
    }

    return { we, wn };
}

// ── Heuristic wind field for a full season ──────────────────────────────────
// Computes idealized zonal wind E/N arrays for all regions.

export function computeHeuristicWindField(numRegions, r_lat, r_lon, itczLookup) {
    const hWindE = new Float32Array(numRegions);
    const hWindN = new Float32Array(numRegions);

    for (let r = 0; r < numRegions; r++) {
        const lat = r_lat[r];
        const itczLat = itczLookup(r_lon[r]) * 0.3; // dampened ITCZ, same as precip
        const signedDist = lat - itczLat;
        const distDeg = Math.abs(signedDist) / DEG;
        const northOfItcz = signedDist > 0;
        const { we, wn } = heuristicWind(distDeg, northOfItcz);
        hWindE[r] = we;
        hWindN[r] = wn;
    }

    return { hWindE, hWindN };
}

// ── Main entry point ─────────────────────────────────────────────────────────

/**
 * Compute heuristic precipitation for both seasons.
 * Returns raw (un-normalized) Float32Arrays.
 *
 * @param {SphereMesh} mesh
 * @param {Float32Array} r_xyz
 * @param {Float32Array} r_elevation
 * @param {object} windResult - output from computeWind()
 * @param {Float32Array} r_elevGradE - pre-computed east elevation gradient
 * @param {Float32Array} r_elevGradN - pre-computed north elevation gradient
 * @param {Int32Array} r_coastDistLand - BFS hop distance from coast through land
 * @returns {{ r_precip_summer, r_precip_winter }}
 */
export function computeHeuristicPrecipitation(mesh, r_xyz, r_elevation, windResult, r_elevGradE, r_elevGradN, r_coastDistLand) {
    const numRegions = mesh.numRegions;
    const { r_lat, r_lon, r_isLand, r_continentality } = windResult;

    const avgEdgeKm = (Math.PI * 6371) / Math.sqrt(numRegions);

    const result = {};

    const seasons = [
        { name: 'summer', shift: 5 },
        { name: 'winter', shift: -5 }
    ];

    for (const { name } of seasons) {
        const isSummer = name === 'summer';

        const itczLookup = makeItczLookup(windResult.itczLons,
            isSummer ? windResult.itczLatsSummer : windResult.itczLatsWinter);

        const precip = new Float32Array(numRegions);

        for (let r = 0; r < numRegions; r++) {
            const lat = r_lat[r];
            const lon = r_lon[r];

            // ── A. Zonal base curve (distance from ITCZ) ──
            // Dampen ITCZ shift: use only 30% of the complex model's ITCZ
            // displacement so the zonal bands stay close to the geographic
            // equator. The full ITCZ swing (up to 15-20°) would drag the
            // subtropical desert belt too far, drying the true equator and
            // wetting the mid-latitudes in the shifted season.
            const itczLat = itczLookup(lon) * 0.3;
            const signedDist = lat - itczLat;
            const distFromItczDeg = Math.abs(signedDist) / DEG;
            const isNorthOfItcz = signedDist > 0;
            const zonal = zonalBase(distFromItczDeg);

            // ── B. Seasonal modifier ──
            const inSummerHemi = isSummer ? (lat >= 0) : (lat < 0);
            const seasonMod = inSummerHemi ? 1.1 : 0.9;

            // ── C. Continental dryness ──
            let contMod = 1.0;
            const cont = (r_isLand[r] && r_continentality) ? r_continentality[r] : 0;
            if (cont > 0) {
                contMod = 1.0 - cont * cont * 0.65;
            }

            // ── D. Orographic rain shadow (using heuristic zonal wind) ──
            let oroMod = 1.0;
            if (r_isLand[r] && r_elevation[r] > 0) {
                const { we, wn } = heuristicWind(distFromItczDeg, isNorthOfItcz);
                // Wind dot elevation gradient: positive = windward, negative = leeward
                const windDotGrad = we * r_elevGradE[r] + wn * r_elevGradN[r];

                if (windDotGrad > 0) {
                    // Windward: up to +60% boost
                    const uplift = Math.min(1, windDotGrad * 15);
                    oroMod = 1.0 + uplift * 0.6;
                } else {
                    // Leeward: up to -70% suppression, scaled by mountain height
                    const heightKm = elevToHeightKm(Math.max(0, r_elevation[r]));
                    const heightScale = Math.min(1, heightKm / 3); // 3km+ = full shadow
                    const shadow = Math.min(1, -windDotGrad * 18);
                    oroMod = Math.max(0.3, 1.0 - shadow * 0.7 * heightScale);
                }
            }

            // ── E. Hard distance-from-coast cutoff ──
            // Fixed 2000-3000km cutoff regardless of latitude.
            let distMod = 1.0;
            if (r_isLand[r] && r_coastDistLand[r] > 0) {
                const distKm = r_coastDistLand[r] * avgEdgeKm;
                if (distKm > 2000) {
                    distMod = Math.max(0.03, 1 - smoothstep(2000, 3000, distKm));
                }
            }

            // ── Final ──
            precip[r] = Math.max(0.05, zonal * seasonMod * contMod * oroMod * distMod);
        }

        // Light smoothing ~100km
        const smoothPasses = Math.max(1, Math.round(100 / avgEdgeKm));
        smoothField(mesh, precip, smoothPasses);

        result[`r_precip_${name}`] = precip;
    }

    return result;
}
