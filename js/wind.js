// Wind simulation: pressure-driven seasonal wind with longitude-varying ITCZ.
// Computes pressure fields and wind vectors for summer and winter seasons.

import { CLIMATE } from './climate-config.js';
import { elevToHeightKm } from './color-map.js';
import { smoothField, percentile, seasonFactorFromTilt } from './climate-util.js';

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

// ── Periodic cubic spline interpolation ──────────────────────────────────────

function buildPeriodicSpline(xs, ys) {
    // xs: sorted longitude samples (radians), ys: ITCZ latitude values
    // Returns spline data for evaluateSpline()
    const n = xs.length;
    const period = 2 * Math.PI;

    // Build tridiagonal system for periodic natural cubic spline
    const h = new Float64Array(n);
    const alpha = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        const next = (i + 1) % n;
        h[i] = (xs[next] - xs[i] + period) % period;
        if (h[i] === 0) h[i] = period / n;
    }
    for (let i = 0; i < n; i++) {
        const prev = (i - 1 + n) % n;
        const next = (i + 1) % n;
        alpha[i] = (3 / h[i]) * (ys[next] - ys[i]) - (3 / h[prev]) * (ys[i] - ys[prev]);
    }

    // Solve with Thomas-like algorithm for periodic system
    // Simplified: use iterative relaxation (fast enough for n=72)
    const c = new Float64Array(n);
    for (let iter = 0; iter < 20; iter++) {
        for (let i = 0; i < n; i++) {
            const prev = (i - 1 + n) % n;
            const next = (i + 1) % n;
            c[i] = (alpha[i] - h[prev] * c[prev] - h[i] * c[next]) /
                   (2 * (h[prev] + h[i]));
        }
    }

    const b = new Float64Array(n);
    const d = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        const next = (i + 1) % n;
        b[i] = (ys[next] - ys[i]) / h[i] - h[i] * (c[next] + 2 * c[i]) / 3;
        d[i] = (c[next] - c[i]) / (3 * h[i]);
    }

    return { xs, ys, b, c, d, h, n, period };
}

function evaluateSpline(spline, lon) {
    const { xs, ys, b, c, d, n, period } = spline;
    // Normalize lon to [xs[0], xs[0] + period)
    let t = ((lon - xs[0]) % period + period) % period + xs[0];

    // Direct index calculation — segments are equally spaced
    const segStep = period / n;
    let seg = Math.floor((t - xs[0]) / segStep);
    if (seg < 0) seg = 0;
    else if (seg >= n) seg = n - 1;

    const dx = t - xs[seg];
    return ys[seg] + b[seg] * dx + c[seg] * dx * dx + d[seg] * dx * dx * dx;
}

// ── Smoothstep utility ───────────────────────────────────────────────────────

export function smoothstep(edge0, edge1, x) {
    if (edge0 === edge1) return x >= edge1 ? 1 : 0;
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}

// ── ITCZ computation ─────────────────────────────────────────────────────────

/**
 * Build a spatial index binning regions by latitude/longitude for fast
 * geographic sampling. Returns a function landFracAndElev(lat, lon, radius)
 * that returns { landFrac, avgElev } by scanning nearby bins.
 */
function buildGeoIndex(r_lat, r_lon, r_sinLat, r_cosLat, r_elevation, r_isLand, numRegions) {
    const LAT_BINS = 36;   // 5° each
    const LON_BINS = 72;   // 5° each
    const numBins = LAT_BINS * LON_BINS;

    // CSR (compressed sparse row) format: count regions per bin, then prefix-sum
    // Cache bin index per region to avoid recomputing in the fill pass
    const r_bin = new Uint32Array(numRegions);
    const binCount = new Uint32Array(numBins);
    for (let r = 0; r < numRegions; r++) {
        const latBin = Math.max(0, Math.min(LAT_BINS - 1,
            Math.floor((r_lat[r] + Math.PI / 2) / Math.PI * LAT_BINS)));
        const lonBin = Math.max(0, Math.min(LON_BINS - 1,
            Math.floor((r_lon[r] + Math.PI) / (2 * Math.PI) * LON_BINS)));
        const bin = latBin * LON_BINS + lonBin;
        r_bin[r] = bin;
        binCount[bin]++;
    }

    const binOffset = new Uint32Array(numBins + 1);
    for (let i = 0; i < numBins; i++) {
        binOffset[i + 1] = binOffset[i] + binCount[i];
    }

    const indices = new Uint32Array(numRegions);
    const fillPos = new Uint32Array(numBins);
    for (let r = 0; r < numRegions; r++) {
        const bin = r_bin[r];
        indices[binOffset[bin] + fillPos[bin]] = r;
        fillPos[bin]++;
    }

    // Reusable output objects to avoid per-call allocation
    const _out = { landFrac: 0, avgElev: 0 };
    const _outLocal = { landFrac: 0, avgElev: 0 };
    const _outWide = { landFrac: 0, avgElev: 0 };

    // Cache cosRadius for commonly used radii
    const cosRadiusCache = new Map();
    function getCosRadius(radius) {
        let c = cosRadiusCache.get(radius);
        if (c === undefined) { c = Math.cos(radius); cosRadiusCache.set(radius, c); }
        return c;
    }

    function sample(lat, lon, radius) {
        const latMin = lat - radius, latMax = lat + radius;
        const bMin = Math.max(0, Math.floor((latMin + Math.PI / 2) / Math.PI * LAT_BINS));
        const bMax = Math.min(LAT_BINS - 1, Math.floor((latMax + Math.PI / 2) / Math.PI * LAT_BINS));
        const cosLat = Math.cos(lat) || 0.01;
        const lonSpan = radius / cosLat;
        const lMin = Math.floor((lon - lonSpan + Math.PI) / (2 * Math.PI) * LON_BINS);
        const lMax = Math.floor((lon + lonSpan + Math.PI) / (2 * Math.PI) * LON_BINS);

        let landCount = 0, totalCount = 0, elevSum = 0;
        const cosR = getCosRadius(radius);
        const sinLat0 = Math.sin(lat), cosLat0 = Math.cos(lat);

        for (let bi = bMin; bi <= bMax; bi++) {
            for (let li = lMin; li <= lMax; li++) {
                const lj = ((li % LON_BINS) + LON_BINS) % LON_BINS;
                const bin = bi * LON_BINS + lj;
                for (let k = binOffset[bin], end = binOffset[bin + 1]; k < end; k++) {
                    const r = indices[k];
                    const cosDist = sinLat0 * r_sinLat[r] + cosLat0 * r_cosLat[r] * Math.cos(r_lon[r] - lon);
                    if (cosDist >= cosR) {
                        totalCount++;
                        if (r_isLand[r]) landCount++;
                        if (r_elevation[r] > 0) elevSum += r_elevation[r];
                    }
                }
            }
        }

        _out.landFrac = totalCount > 0 ? landCount / totalCount : 0;
        _out.avgElev = totalCount > 0 ? elevSum / totalCount : 0;
        return _out;
    }

    /**
     * Dual-radius sample: scan bins once for the wider radius, classify each
     * region into local and wide buckets based on distance. Avoids scanning
     * overlapping bins twice when both radii share the same center.
     */
    function sampleDual(lat, lon, localRadius, wideRadius) {
        const latMax = lat + wideRadius, latMin = lat - wideRadius;
        const bMin = Math.max(0, Math.floor((latMin + Math.PI / 2) / Math.PI * LAT_BINS));
        const bMax = Math.min(LAT_BINS - 1, Math.floor((latMax + Math.PI / 2) / Math.PI * LAT_BINS));
        const cosLat = Math.cos(lat) || 0.01;
        const lonSpan = wideRadius / cosLat;
        const lMin = Math.floor((lon - lonSpan + Math.PI) / (2 * Math.PI) * LON_BINS);
        const lMax = Math.floor((lon + lonSpan + Math.PI) / (2 * Math.PI) * LON_BINS);

        let lLand = 0, lTotal = 0, lElev = 0;
        let wLand = 0, wTotal = 0, wElev = 0;
        const cosLocal = getCosRadius(localRadius);
        const cosWide = getCosRadius(wideRadius);
        const sinLat0 = Math.sin(lat), cosLat0 = Math.cos(lat);

        for (let bi = bMin; bi <= bMax; bi++) {
            for (let li = lMin; li <= lMax; li++) {
                const lj = ((li % LON_BINS) + LON_BINS) % LON_BINS;
                const bin = bi * LON_BINS + lj;
                for (let k = binOffset[bin], end = binOffset[bin + 1]; k < end; k++) {
                    const r = indices[k];
                    const cosDist = sinLat0 * r_sinLat[r] + cosLat0 * r_cosLat[r] * Math.cos(r_lon[r] - lon);
                    if (cosDist >= cosWide) {
                        wTotal++;
                        const isLand = r_isLand[r];
                        const elev = r_elevation[r] > 0 ? r_elevation[r] : 0;
                        if (isLand) wLand++;
                        wElev += elev;
                        if (cosDist >= cosLocal) {
                            lTotal++;
                            if (isLand) lLand++;
                            lElev += elev;
                        }
                    }
                }
            }
        }

        _outLocal.landFrac = lTotal > 0 ? lLand / lTotal : 0;
        _outLocal.avgElev = lTotal > 0 ? lElev / lTotal : 0;
        _outWide.landFrac = wTotal > 0 ? wLand / wTotal : 0;
        _outWide.avgElev = wTotal > 0 ? wElev / wTotal : 0;
    }

    return { sample, sampleDual, _outLocal, _outWide };
}

/**
 * Compute ITCZ latitude at sampled longitudes for a given season.
 * Uses a thermal equator search: scans latitudes from -30° to +30°,
 * computes a heating score at each, and picks the peak.
 *
 * Heating score combines:
 *   - Solar insolation (cosine of latitude offset from subsolar point)
 *   - Land thermal boost (land heats faster than ocean)
 *   - Elevation boost (plateaus heat more intensely — thinner atmosphere)
 *   - Cross-equatorial anchoring (winter-hemisphere land pulls ITCZ equatorward)
 *
 * @param {Object} geoIndex - from buildGeoIndex ({sample, sampleDual, _outLocal, _outWide})
 * @param {string} season - 'summer' (NH) or 'winter' (NH)
 * @param {number} tiltRad - axial tilt in radians
 * @param {number} [seasonFactor=1] - seasonal-contrast scale from axial tilt (1 at Earth tilt)
 * @returns {{ spline, lons: Float64Array, lats: Float64Array }}
 */
function computeITCZ(geoIndex, season, tiltRad, seasonFactor = 1) {
    const { sample: geoSample, sampleDual, _outLocal, _outWide } = geoIndex;
    const NUM_LON = 72;
    // Two sampling radii: local (5°) for precise land detection, wide (30°) for continental scale
    const localRadius = 5 * DEG;
    const wideRadius = 30 * DEG;

    // +1 = NH summer, -1 = SH summer (NH winter)
    const sign = season === 'summer' ? 1 : -1;

    // Subsolar latitude: where the sun is directly overhead this season
    // Full tilt in summer hemisphere (e.g. +23.5° for NH summer)
    const subsolarLat = sign * tiltRad;

    // Excursion clamp scales with tilt: pinned at 0°, roams wide at 45°.
    const effClampDeg = CLIMATE.WIND_ITCZ_CLAMP_DEG * seasonFactor;
    // Scan must cover the clamp; ±30 (the Earth-tuned range) until the clamp
    // itself needs more.
    const SCAN_MAX = Math.max(30, effClampDeg + 5);
    const SCAN_MIN = -SCAN_MAX;
    const SCAN_STEP = 2.5;
    const numScans = Math.round((SCAN_MAX - SCAN_MIN) / SCAN_STEP) + 1;

    // Pre-compute scan latitudes and their trig values (reused across all longitudes)
    const scanLats = new Float64Array(numScans);
    const scanLatDegs = new Float64Array(numScans);
    const scanSolarScores = new Float64Array(numScans);
    for (let si = 0; si < numScans; si++) {
        const latDeg = SCAN_MIN + si * SCAN_STEP;
        scanLatDegs[si] = latDeg;
        scanLats[si] = latDeg * DEG;
        const dSolar = (scanLats[si] - subsolarLat) * RAD;
        scanSolarScores[si] = Math.exp(-0.5 * (dSolar / 25) ** 2);
    }

    // Pre-compute poleward latitudes for each scan step
    const polewardLats = new Float64Array(numScans);
    for (let si = 0; si < numScans; si++) {
        polewardLats[si] = scanLats[si] + sign * 15 * DEG;
    }

    const lons = new Float64Array(NUM_LON);
    const rawLats = new Float64Array(NUM_LON);

    for (let i = 0; i < NUM_LON; i++) {
        const lon = -Math.PI + (i + 0.5) * (2 * Math.PI / NUM_LON);
        lons[i] = lon;

        let bestScore = -Infinity;
        let bestLat = sign * 5 * DEG; // fallback

        for (let si = 0; si < numScans; si++) {
            const latDeg = scanLatDegs[si];
            const lat = scanLats[si];
            sampleDual(lat, lon, localRadius, wideRadius);
            const local = _outLocal, wide = _outWide;

            // (a) Solar insolation: pre-computed Gaussian falloff from subsolar point
            const solarScore = scanSolarScores[si];

            // (b) Land thermal boost: uses multi-scale sampling.
            // Only truly continental-scale landmasses pull the ITCZ significantly.
            // Islands, thin peninsulas, and coastlines near ocean register low at
            // the wide (30°) radius and get suppressed by the steep ramp.
            const localLand = local.landFrac;
            const wideLand = wide.landFrac;

            // Also sample poleward of this latitude: a massive continent extending
            // poleward (like Asia beyond 20°N) creates an enormous heat reservoir
            // that pulls the ITCZ toward it even if the scan point itself is at
            // the continent's edge. Sample 15° poleward in the summer hemisphere.
            const poleward = geoSample(polewardLats[si], lon, wideRadius);  // single-radius, reuses _out
            // Combined land signal: max of local-wide and poleward-wide.
            // Poleward land contributes at 70% strength (heat diffuses equatorward).
            const effectiveWideLand = Math.max(wideLand, poleward.landFrac * 0.7);

            // Wide-scale land must exceed ~20% before any real pull kicks in.
            const continentalScale = smoothstep(0.20, 0.45, effectiveWideLand);
            // Square it so moderate land fractions still contribute little.
            const scaledLand = continentalScale * continentalScale;
            // Local land gate: require >25% local land fraction to activate.
            // At 5° radius (~560 km), ocean near thin islands stays well below this.
            const landGate = smoothstep(0.25, 0.55, localLand);
            // Strong max boost so massive continents pull ITCZ toward 25-30°
            const landBoost = landGate * scaledLand * CLIMATE.WIND_ITCZ_LAND_BOOST_MAX;

            // (c) Elevation boost: high plateaus heat more intensely
            // (thinner atmosphere, stronger surface insolation).
            // Also scaled by continental size — isolated volcanic peaks don't pull ITCZ.
            const elevKm = elevToHeightKm(Math.max(0, wide.avgElev));
            const elevBoost = Math.min(0.30, elevKm * 0.12) * scaledLand;

            // (d) Cross-equatorial anchoring: if this latitude is in the
            // winter hemisphere but there's significant land, it anchors
            // the ITCZ closer to the equator (resists poleward migration).
            const isWinterHemi = (sign > 0 && latDeg < 0) || (sign < 0 && latDeg > 0);
            const anchorBoost = isWinterHemi ? landBoost * CLIMATE.WIND_ITCZ_ANCHOR_FACTOR : 0;

            // (e) Ocean baseline: slight poleward bias in summer hemisphere
            // even over open ocean (~6-8° from equator on average).
            const isSummerHemi = !isWinterHemi;
            const oceanBias = isSummerHemi && localLand < 0.1
                ? 0.08 * Math.exp(-0.5 * ((Math.abs(latDeg) - 7) / 5) ** 2)
                : 0;

            const score = solarScore + landBoost + elevBoost + anchorBoost + oceanBias;

            if (score > bestScore) {
                bestScore = score;
                bestLat = lat;
            }
        }

        rawLats[i] = bestLat;
    }

    // Pull extreme outliers toward the zonal mean before longitude smoothing.
    // The ITCZ is a planetary-scale feature — individual longitude columns
    // shouldn't deviate too far from the overall trend.
    const lats = new Float64Array(rawLats);
    const tmp = new Float64Array(NUM_LON);
    // Wide periodic moving average (kernel = 5 neighbors) for heavy smoothing,
    // then narrow (kernel = 3) for fine cleanup. More passes = smoother ITCZ.
    // Wide kernel: weights [0.1, 0.2, 0.4, 0.2, 0.1] over 5 neighbors
    for (let pass = 0; pass < 4; pass++) {
        for (let i = 0; i < NUM_LON; i++) {
            const p2 = (i - 2 + NUM_LON) % NUM_LON;
            const p1 = (i - 1 + NUM_LON) % NUM_LON;
            const n1 = (i + 1) % NUM_LON;
            const n2 = (i + 2) % NUM_LON;
            tmp[i] = 0.1 * lats[p2] + 0.2 * lats[p1] + 0.4 * lats[i] + 0.2 * lats[n1] + 0.1 * lats[n2];
        }
        lats.set(tmp);
    }
    // Narrow cleanup passes
    for (let pass = 0; pass < 3; pass++) {
        for (let i = 0; i < NUM_LON; i++) {
            const p = (i - 1 + NUM_LON) % NUM_LON;
            const n = (i + 1) % NUM_LON;
            tmp[i] = 0.25 * lats[p] + 0.5 * lats[i] + 0.25 * lats[n];
        }
        lats.set(tmp);
    }

    // Clamp ITCZ migration (scaled by tilt; ±~20° at Earth tilt)
    for (let i = 0; i < NUM_LON; i++) {
        lats[i] = Math.max(-effClampDeg * DEG, Math.min(effClampDeg * DEG, lats[i]));
    }

    const spline = buildPeriodicSpline(lons, lats);
    return { spline, lons, lats };
}

// ── Pressure field ───────────────────────────────────────────────────────────

/**
 * Compute pressure at a single region.
 */
function regionPressure(lat, lon, itczSpline, season, landFrac, elevation, noiseFn, px, py, pz, eff) {
    const itczLat = evaluateSpline(itczSpline, lon);
    const latDeg = lat * RAD;
    const seasonSign = season === 'summer' ? 1 : -1;

    let p = 1013; // baseline hPa

    // (a) ITCZ low — follows thermal equator
    const dItcz = (lat - itczLat) * RAD; // degrees from ITCZ
    p -= CLIMATE.WIND_ITCZ_LOW_DEPTH_HPA * Math.exp(-0.5 * (dItcz / CLIMATE.WIND_ITCZ_LOW_WIDTH_DEG) ** 2);

    // (b) Subtropical highs — shift with season, weaker over hot land
    const shiftDeg = seasonSign * eff.subtropShiftDeg;
    const nhSubHigh = eff.subtropHighLatDeg + shiftDeg;
    const shSubHigh = -(eff.subtropHighLatDeg - shiftDeg);
    const highIntensity = CLIMATE.WIND_SUBTROP_HIGH_STRENGTH_HPA * (1 - CLIMATE.WIND_SUBTROP_LAND_WEAKENING * landFrac);
    p += highIntensity * Math.exp(-0.5 * ((latDeg - nhSubHigh) / CLIMATE.WIND_SUBTROP_HIGH_WIDTH_DEG) ** 2);
    p += highIntensity * Math.exp(-0.5 * ((latDeg - shSubHigh) / CLIMATE.WIND_SUBTROP_HIGH_WIDTH_DEG) ** 2);

    // (c) Subpolar lows
    p -= CLIMATE.WIND_SUBPOLAR_LOW_DEPTH_HPA * Math.exp(-0.5 * ((latDeg - eff.subpolarLowLatDeg) / CLIMATE.WIND_SUBPOLAR_LOW_WIDTH_DEG) ** 2);
    p -= CLIMATE.WIND_SUBPOLAR_LOW_DEPTH_HPA * Math.exp(-0.5 * ((latDeg + eff.subpolarLowLatDeg) / CLIMATE.WIND_SUBPOLAR_LOW_WIDTH_DEG) ** 2);

    // (d) Polar highs
    p += CLIMATE.WIND_POLAR_HIGH_STRENGTH_HPA * Math.exp(-0.5 * ((latDeg - 85) / 8) ** 2);
    p += CLIMATE.WIND_POLAR_HIGH_STRENGTH_HPA * Math.exp(-0.5 * ((latDeg + 85) / 8) ** 2);

    // (e) Land/sea thermal modifier
    // landFrac here is actually continentality (0 at coast → ~1 deep interior).
    // Only continental-scale landmasses produce meaningful thermal pressure:
    // small islands (continentality < 0.2) → 0, ramps to full at 0.5+.
    const continentalScale = smoothstep(0.2, 0.5, landFrac);
    if (continentalScale > 0.001) {
        // Continental thermal effect profile:
        // 0 at 0-15°, rises to ~0.75 at 30°, plateau ~1.0 at 45-60°, falls to ~0.5 at 75°, 0 at 90°
        const absLatDeg = Math.abs(lat) * RAD;
        const latFactor = absLatDeg < 15 ? 0
            : absLatDeg < 30 ? 0.75 * smoothstep(15, 30, absLatDeg)
            : absLatDeg < 45 ? 0.75 + 0.25 * smoothstep(30, 45, absLatDeg)
            : absLatDeg < 60 ? 1
            : absLatDeg < 90 ? smoothstep(90, 60, absLatDeg)
            : 0;
        const isSummerHemisphere = (seasonSign > 0 && lat > 0) || (seasonSign < 0 && lat < 0);
        if (isSummerHemisphere) {
            // Thermal low over hot continent
            p -= eff.thermalLowHpa * latFactor * continentalScale;
        } else {
            // Thermal high over cold continent (stronger — Siberian/Canadian highs)
            p += eff.thermalHighHpa * latFactor * continentalScale;
        }
    }

    // (f) Elevation (barometric) — mild effect; real weather maps use
    // sea-level-reduced pressure so elevation doesn't dominate zonal bands
    p -= 3 * elevToHeightKm(Math.max(0, elevation));

    // (g) Noise perturbation
    if (noiseFn) {
        p += noiseFn.fbm(px * 2, py * 2, pz * 2, 3) * 2;
    }

    return p;
}


// ── Pressure gradient on mesh ────────────────────────────────────────────────

export function computeGradients(mesh, r_xyz, r_pressure,
    r_eastX, r_eastY, r_eastZ, r_northX, r_northY, r_northZ,
    r_gradE, r_gradN) {
    const { adjOffset, adjList, numRegions } = mesh;

    for (let r = 0; r < numRegions; r++) {
        const px = r_xyz[3 * r], py = r_xyz[3 * r + 1], pz = r_xyz[3 * r + 2];
        const ex = r_eastX[r], ey = r_eastY[r], ez = r_eastZ[r];
        const nx = r_northX[r], ny = r_northY[r], nz = r_northZ[r];
        const pHere = r_pressure[r];

        let sumEP = 0, sumEE = 0, sumNP = 0, sumNN = 0;
        const end = adjOffset[r + 1];

        for (let ni = adjOffset[r]; ni < end; ni++) {
            const nb = adjList[ni];
            const dx = r_xyz[3 * nb] - px;
            const dy = r_xyz[3 * nb + 1] - py;
            const dz = r_xyz[3 * nb + 2] - pz;

            const de = dx * ex + dy * ey + dz * ez;
            const dn = dx * nx + dy * ny + dz * nz;
            const dp = r_pressure[nb] - pHere;

            sumEP += de * dp;
            sumEE += de * de;
            sumNP += dn * dp;
            sumNN += dn * dn;
        }

        r_gradE[r] = sumEE > 1e-12 ? sumEP / sumEE : 0;
        r_gradN[r] = sumNN > 1e-12 ? sumNP / sumNN : 0;
    }
}

// ── Pressure gradient → wind ─────────────────────────────────────────────────

function pressureToWind(r_gradE, r_gradN, r_sinLat,
    r_windE, r_windN, r_windSpeed, numRegions, geoMaxAngleDeg) {
    const sin5 = Math.sin(5 * DEG);

    for (let r = 0; r < numRegions; r++) {
        // PGF: from high to low = negative gradient
        const pgfE = -r_gradE[r];
        const pgfN = -r_gradN[r];

        const sinLat = r_sinLat[r];
        const absSinLat = Math.abs(sinLat);

        // Geostrophic deflection: 0° at equator → 70° at ≥5° latitude
        const geoAngle = geoMaxAngleDeg * DEG * smoothstep(0, sin5, absSinLat);

        // Surface friction turns wind 20° back toward low pressure
        const frictionAngle = CLIMATE.WIND_FRICTION_BACK_ANGLE_DEG * DEG;

        // Net rotation: NH = clockwise (negative), SH = counterclockwise (positive)
        // The rotation matrix [cosθ,-sinθ; sinθ,cosθ] is counterclockwise for +θ,
        // so NH right-deflection needs negative angle, SH left-deflection needs positive.
        const sign = sinLat >= 0 ? -1 : 1;
        const totalAngle = sign * (geoAngle - frictionAngle);

        const cosA = Math.cos(totalAngle);
        const sinA = Math.sin(totalAngle);

        // Rotate PGF vector and apply friction speed reduction
        const we = (pgfE * cosA - pgfN * sinA) * 0.6;
        const wn = (pgfE * sinA + pgfN * cosA) * 0.6;

        r_windE[r] = we;
        r_windN[r] = wn;
        r_windSpeed[r] = Math.sqrt(we * we + wn * wn);
    }
}

// ── Main entry point ─────────────────────────────────────────────────────────

/**
 * Compute seasonal pressure fields and wind vectors.
 *
 * @param {SphereMesh} mesh
 * @param {Float32Array} r_xyz - per-region 3D positions (3 * numRegions)
 * @param {Float32Array} r_elevation - per-region elevation
 * @param {Set} plateIsOcean - ocean plate seed set
 * @param {Int32Array} r_plate - per-region plate ID
 * @param {SimplexNoise} noise - seeded noise instance
 * @param {number} [axialTilt=23.5] - axial tilt in degrees
 * @param {number} [rotationRate=1] - rotation rate multiplier; scales circulation-band latitudes and geostrophic deflection here, and is also threaded to ocean.js
 * @returns {object} pressure and wind arrays for both seasons
 */
export function computeWind(mesh, r_xyz, r_elevation, plateIsOcean, r_plate, noise, axialTilt = 23.5, rotationRate = 1) {
    const numRegions = mesh.numRegions;
    const avgEdgeKm = (Math.PI * 6371) / Math.sqrt(numRegions);
    const tiltRad = axialTilt * DEG;
    const seasonFactor = seasonFactorFromTilt(axialTilt);
    // Seasonal-contrast quantities scale with tilt (×1 at Earth tilt, 0 at 0°):
    // band migration, monsoon thermal low, and the winter continental high are
    // all consequences of the seasonal insolation swing.
    // Fast rotators: stronger Coriolis turning and equator-compressed bands
    // (Hadley width shrinks with spin); slow rotators widen the tropical cell.
    // Math.pow(1, x) === 1, so ρ = 1 is exact without a guard; the deflection
    // map subtracts, so it does need one.
    const bandScale = Math.pow(rotationRate, -1 / 3);
    const effWind = {
        subtropShiftDeg: CLIMATE.WIND_SUBTROP_SEASONAL_SHIFT_DEG * seasonFactor,
        thermalLowHpa: CLIMATE.WIND_SUMMER_THERMAL_LOW_HPA * seasonFactor,
        thermalHighHpa: CLIMATE.WIND_WINTER_THERMAL_HIGH_HPA * seasonFactor,
        subtropHighLatDeg: Math.min(42, Math.max(22, CLIMATE.WIND_SUBTROP_HIGH_LAT_DEG * bandScale)),
        subpolarLowLatDeg: Math.min(72, Math.max(44, CLIMATE.WIND_SUBPOLAR_LOW_LAT_DEG * bandScale)),
        geoMaxAngleDeg: rotationRate === 1
            ? CLIMATE.WIND_GEOSTROPHIC_MAX_ANGLE_DEG
            : 90 - (90 - CLIMATE.WIND_GEOSTROPHIC_MAX_ANGLE_DEG) * Math.pow(rotationRate, -0.8),
    };
    const timing = [];

    // ── Step 0: Precompute per-region properties ──

    let t0 = performance.now();

    const r_lat = new Float32Array(numRegions);
    const r_lon = new Float32Array(numRegions);
    const r_sinLat = new Float32Array(numRegions);
    const r_cosLat = new Float32Array(numRegions);
    const r_isLand = new Uint8Array(numRegions);

    // Tangent frame arrays
    const r_eastX = new Float32Array(numRegions);
    const r_eastY = new Float32Array(numRegions);
    const r_eastZ = new Float32Array(numRegions);
    const r_northX = new Float32Array(numRegions);
    const r_northY = new Float32Array(numRegions);
    const r_northZ = new Float32Array(numRegions);

    for (let r = 0; r < numRegions; r++) {
        const x = r_xyz[3 * r], y = r_xyz[3 * r + 1], z = r_xyz[3 * r + 2];

        // Y-up convention (matches map projection)
        r_lat[r] = Math.asin(Math.max(-1, Math.min(1, y)));
        r_lon[r] = Math.atan2(x, z);
        r_sinLat[r] = y;
        r_cosLat[r] = Math.sqrt(1 - y * y) || 0.01;
        r_isLand[r] = r_elevation[r] > 0 ? 1 : 0;

        // East = normalize(Ŷ × P) = normalize(z, 0, -x)
        let ex = z, ey = 0, ez = -x;
        let elen = Math.sqrt(ex * ex + ez * ez);
        if (elen < 1e-10) { ex = 1; ez = 0; elen = 1; } // pole fallback
        ex /= elen; ez /= elen;

        // North = P × East
        let nx = y * ez - z * ey;
        let ny = z * ex - x * ez;
        let nz = x * ey - y * ex;
        const nlen = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        nx /= nlen; ny /= nlen; nz /= nlen;

        r_eastX[r] = ex; r_eastY[r] = ey; r_eastZ[r] = ez;
        r_northX[r] = nx; r_northY[r] = ny; r_northZ[r] = nz;
    }

    timing.push({ stage: 'Wind: precompute lat/lon/tangent', ms: performance.now() - t0 });

    // ── Step 1: Build geographic index + compute ITCZ ──

    t0 = performance.now();
    const geoIndex = buildGeoIndex(r_lat, r_lon, r_sinLat, r_cosLat, r_elevation, r_isLand, numRegions);
    const itczSummer = computeITCZ(geoIndex, 'summer', tiltRad, seasonFactor);
    const itczWinter = computeITCZ(geoIndex, 'winter', tiltRad, seasonFactor);
    timing.push({ stage: 'Wind: ITCZ computation', ms: performance.now() - t0 });

    // ── Step 2–5: Compute pressure & wind for each season ──

    const seasons = [
        { name: 'summer', itcz: itczSummer },
        { name: 'winter', itcz: itczWinter }
    ];

    const result = {};

    // Precompute continentality via BFS coast distance.
    // Laplacian smoothing of binary r_isLand converges too fast — interior
    // cells hit 0.95+ within a few hundred km. Instead, compute actual
    // hop distance from coast through land, convert to km, and map with
    // smoothstep for a wide, tunable gradient.
    //   0 km (coast):  cont ≈ 0.0
    //   500 km:        cont ≈ 0.16
    //   1000 km:       cont ≈ 0.50
    //   1500 km:       cont ≈ 0.84
    //   2000 km+:      cont ≈ 1.0
    // Ocean cells near coast get a small value (~0.05–0.15) via a few
    // smoothing passes, giving a natural land/sea thermal gradient.
    t0 = performance.now();
    const { adjOffset, adjList } = mesh;

    // Find the main ocean: largest connected component of non-land cells.
    // Inland seas / small lakes don't count as "ocean" for continentality.
    const r_oceanLabel = new Int32Array(numRegions);
    r_oceanLabel.fill(-1);
    let mainOceanLabel = -1, mainOceanSize = 0;
    let nextLabel = 0;
    for (let r = 0; r < numRegions; r++) {
        if (r_isLand[r] || r_oceanLabel[r] >= 0) continue;
        const label = nextLabel++;
        let size = 0;
        const floodQueue = [r];
        r_oceanLabel[r] = label;
        let fHead = 0;
        while (fHead < floodQueue.length) {
            const cur = floodQueue[fHead++];
            size++;
            const end = adjOffset[cur + 1];
            for (let ni = adjOffset[cur]; ni < end; ni++) {
                const nb = adjList[ni];
                if (!r_isLand[nb] && r_oceanLabel[nb] === -1) {
                    r_oceanLabel[nb] = label;
                    floodQueue.push(nb);
                }
            }
        }
        if (size > mainOceanSize) {
            mainOceanSize = size;
            mainOceanLabel = label;
        }
    }

    // BFS coast distance through land, seeded only from main-ocean coastline
    const r_coastDist = new Int32Array(numRegions);
    r_coastDist.fill(-1);
    const bfsQueue = [];
    for (let r = 0; r < numRegions; r++) {
        if (!r_isLand[r]) continue;
        const end = adjOffset[r + 1];
        for (let ni = adjOffset[r]; ni < end; ni++) {
            const nb = adjList[ni];
            if (!r_isLand[nb] && r_oceanLabel[nb] === mainOceanLabel) {
                r_coastDist[r] = 0;
                bfsQueue.push(r);
                break;
            }
        }
    }
    let head = 0;
    while (head < bfsQueue.length) {
        const r = bfsQueue[head++];
        const d = r_coastDist[r] + 1;
        const end = adjOffset[r + 1];
        for (let ni = adjOffset[r]; ni < end; ni++) {
            const nb = adjList[ni];
            if (r_isLand[nb] && r_coastDist[nb] === -1) {
                r_coastDist[nb] = d;
                bfsQueue.push(nb);
            }
        }
    }

    // Map BFS distance to continentality [0, 1]
    const CONT_RANGE_KM = CLIMATE.WIND_CONT_RANGE_KM; // distance at which cont reaches ~1.0
    const r_continentality = new Float32Array(numRegions);
    for (let r = 0; r < numRegions; r++) {
        if (r_isLand[r] && r_coastDist[r] >= 0) {
            const distKm = r_coastDist[r] * avgEdgeKm;
            r_continentality[r] = smoothstep(0, CONT_RANGE_KM, distKm);
        }
        // Ocean cells stay at 0; a few smooth passes below will bleed
        // small values onto nearshore ocean for thermal gradient.
    }
    // Light smoothing (~100 km) to soften BFS stepping artifacts and
    // bleed a small thermal signal onto nearshore ocean cells.
    const contSmoothPasses = Math.max(1, Math.round(100 / avgEdgeKm));
    smoothField(mesh, r_continentality, contSmoothPasses);

    // ── West/east coast field (r_westness ∈ [−1, +1]) ──
    // +1 near a WEST coast (ocean lies to the west, e.g. Europe, US Pacific NW),
    // −1 near an EAST coast (ocean to the east, e.g. E. China, US SE), ~0 deep
    // interior. Two land-BFS passes from west- and east-facing coast seeds; the
    // signed normalized difference penetrates inland smoothly. This is the
    // primitive Earth's subtropical asymmetry needs — dry subsidence over west
    // coasts, moist onshore flow over east coasts — that latitude alone can't see.
    const r_westness = new Float32Array(numRegions);
    {
        const distWest = new Int32Array(numRegions).fill(-1);
        const distEast = new Int32Array(numRegions).fill(-1);
        const qW = [], qE = [];
        for (let r = 0; r < numRegions; r++) {
            if (!r_isLand[r] || r_coastDist[r] !== 0) continue; // coastal land only
            // Mean direction to adjacent main-ocean cells, projected on east tangent.
            const lon = r_lon[r];
            const eX = Math.cos(lon), eZ = -Math.sin(lon); // east tangent (pole axis = Y)
            let ox = 0, oy = 0, oz = 0, on = 0;
            const end = adjOffset[r + 1];
            for (let ni = adjOffset[r]; ni < end; ni++) {
                const nb = adjList[ni];
                if (!r_isLand[nb] && r_oceanLabel[nb] === mainOceanLabel) {
                    ox += r_xyz[3 * nb] - r_xyz[3 * r];
                    oz += r_xyz[3 * nb + 2] - r_xyz[3 * r + 2];
                    on++;
                }
            }
            if (on === 0) continue;
            const oceanDotEast = ox * eX + oz * eZ;
            if (oceanDotEast < 0) { distWest[r] = 0; qW.push(r); } // ocean to west → west coast
            else { distEast[r] = 0; qE.push(r); }                  // ocean to east → east coast
        }
        const bfsLand = (dist, q) => {
            let head = 0;
            while (head < q.length) {
                const r = q[head++];
                const d = dist[r] + 1;
                const end = adjOffset[r + 1];
                for (let ni = adjOffset[r]; ni < end; ni++) {
                    const nb = adjList[ni];
                    if (r_isLand[nb] && dist[nb] === -1) { dist[nb] = d; q.push(nb); }
                }
            }
        };
        bfsLand(distWest, qW);
        bfsLand(distEast, qE);
        for (let r = 0; r < numRegions; r++) {
            if (!r_isLand[r]) continue;
            const dw = distWest[r], de = distEast[r];
            if (dw < 0 && de < 0) continue;
            if (dw < 0) { r_westness[r] = -1; continue; } // only east coast reachable
            if (de < 0) { r_westness[r] = 1; continue; }  // only west coast reachable
            r_westness[r] = (de - dw) / (de + dw + 1e-6);
        }
        const wnSmooth = Math.max(1, Math.round(150 / avgEdgeKm));
        smoothField(mesh, r_westness, wnSmooth);
    }

    // Plate-based continentality: uses plate type (continental vs oceanic)
    // instead of actual land/ocean. Same BFS approach for wide gradient.
    const r_plateContinentality = new Float32Array(numRegions);
    // BFS through continental-plate cells
    const r_plateDist = new Int32Array(numRegions);
    r_plateDist.fill(-1);
    const plateBfsQueue = [];
    for (let r = 0; r < numRegions; r++) {
        if (plateIsOcean.has(r_plate[r])) continue; // skip oceanic plate cells
        const end = adjOffset[r + 1];
        for (let ni = adjOffset[r]; ni < end; ni++) {
            if (plateIsOcean.has(r_plate[adjList[ni]])) {
                r_plateDist[r] = 0;
                plateBfsQueue.push(r);
                break;
            }
        }
    }
    head = 0;
    while (head < plateBfsQueue.length) {
        const r = plateBfsQueue[head++];
        const d = r_plateDist[r] + 1;
        const end = adjOffset[r + 1];
        for (let ni = adjOffset[r]; ni < end; ni++) {
            const nb = adjList[ni];
            if (!plateIsOcean.has(r_plate[nb]) && r_plateDist[nb] === -1) {
                r_plateDist[nb] = d;
                plateBfsQueue.push(nb);
            }
        }
    }
    for (let r = 0; r < numRegions; r++) {
        if (!plateIsOcean.has(r_plate[r]) && r_plateDist[r] >= 0) {
            const distKm = r_plateDist[r] * avgEdgeKm;
            r_plateContinentality[r] = smoothstep(0, CONT_RANGE_KM, distKm);
        }
    }
    smoothField(mesh, r_plateContinentality, contSmoothPasses);
    timing.push({ stage: 'Wind: continentality BFS', ms: performance.now() - t0 });

    // Shared gradient scratch arrays
    const r_gradE = new Float32Array(numRegions);
    const r_gradN = new Float32Array(numRegions);

    // Smooth pressure field ~75 km (scale-invariant) — constant across seasons
    const pressSmoothPasses = Math.max(1, Math.round(75 / avgEdgeKm));

    for (const { name, itcz } of seasons) {
        // Step 2: Pressure field
        t0 = performance.now();
        const r_pressure = new Float32Array(numRegions);

        for (let r = 0; r < numRegions; r++) {
            r_pressure[r] = regionPressure(
                r_lat[r], r_lon[r], itcz.spline, name,
                r_continentality[r], r_elevation[r], noise,
                r_xyz[3 * r], r_xyz[3 * r + 1], r_xyz[3 * r + 2], effWind
            );
        }
        smoothField(mesh, r_pressure, pressSmoothPasses);
        timing.push({ stage: `Wind: pressure field (${name})`, ms: performance.now() - t0 });

        // Step 3: Gradient
        t0 = performance.now();
        r_gradE.fill(0);
        r_gradN.fill(0);
        computeGradients(mesh, r_xyz, r_pressure,
            r_eastX, r_eastY, r_eastZ, r_northX, r_northY, r_northZ,
            r_gradE, r_gradN);
        timing.push({ stage: `Wind: gradient (${name})`, ms: performance.now() - t0 });

        // Step 4: Wind
        t0 = performance.now();
        const r_windE = new Float32Array(numRegions);
        const r_windN = new Float32Array(numRegions);
        const r_windSpeed = new Float32Array(numRegions);
        pressureToWind(r_gradE, r_gradN, r_sinLat,
            r_windE, r_windN, r_windSpeed, numRegions, effWind.geoMaxAngleDeg);

        // Step 5: Normalize wind speed to 0-1
        const maxSpeed = percentile(r_windSpeed, 0.95);
        for (let r = 0; r < numRegions; r++) {
            r_windSpeed[r] = Math.min(1, r_windSpeed[r] / maxSpeed);
        }
        timing.push({ stage: `Wind: pressure→wind (${name})`, ms: performance.now() - t0 });

        // Store pressure as deviation from 1013 for visualization (blue=low, red=high)
        const r_pressureDev = new Float32Array(numRegions);
        for (let r = 0; r < numRegions; r++) {
            r_pressureDev[r] = r_pressure[r] - 1013;
        }

        const S = name === 'summer' ? 'Summer' : 'Winter';
        result[`r_pressure_${name}`] = r_pressureDev;
        result[`r_wind_east_${name}`] = r_windE;
        result[`r_wind_north_${name}`] = r_windN;
        result[`r_wind_speed_${name}`] = r_windSpeed;
    }

    // Pre-evaluate ITCZ splines at 360 longitude points for visualization
    const ITCZ_SAMPLES = 360;
    const itczLons = new Float32Array(ITCZ_SAMPLES);
    const itczLatsSummer = new Float32Array(ITCZ_SAMPLES);
    const itczLatsWinter = new Float32Array(ITCZ_SAMPLES);
    for (let i = 0; i < ITCZ_SAMPLES; i++) {
        const lon = -Math.PI + (i + 0.5) * (2 * Math.PI / ITCZ_SAMPLES);
        itczLons[i] = lon;
        itczLatsSummer[i] = evaluateSpline(itczSummer.spline, lon);
        itczLatsWinter[i] = evaluateSpline(itczWinter.spline, lon);
    }
    result.itczLons = itczLons;
    result.itczLatsSummer = itczLatsSummer;
    result.itczLatsWinter = itczLatsWinter;

    // Expose precomputed geographic data for downstream modules (ocean.js)
    result.r_lat = r_lat;
    result.r_lon = r_lon;
    result.r_sinLat = r_sinLat;
    result.r_isLand = r_isLand;
    result.r_continentality = r_continentality;
    result.r_coastDistLand = r_coastDist;
    result.r_westness = r_westness;
    result.r_plateContinentality = r_plateContinentality;
    result.r_eastX = r_eastX;
    result.r_eastY = r_eastY;
    result.r_eastZ = r_eastZ;
    result.r_northX = r_northX;
    result.r_northY = r_northY;
    result.r_northZ = r_northZ;

    result._windTiming = timing;
    return result;
}
