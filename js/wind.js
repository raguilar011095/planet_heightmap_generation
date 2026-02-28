// Wind simulation: pressure-driven seasonal wind with longitude-varying ITCZ.
// Computes pressure fields and wind vectors for summer and winter seasons.

import { elevToHeightKm } from './color-map.js';

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
    const { xs, ys, b, c, d, h, n, period } = spline;
    // Normalize lon to [xs[0], xs[0] + period)
    let t = ((lon - xs[0]) % period + period) % period + xs[0];

    // Find segment
    let seg = 0;
    for (let i = 0; i < n; i++) {
        const next = (i + 1) % n;
        const lo = xs[i];
        const hi = i < n - 1 ? xs[next] : xs[0] + period;
        if (t >= lo && t < hi) { seg = i; break; }
    }

    const dx = t - xs[seg];
    return ys[seg] + b[seg] * dx + c[seg] * dx * dx + d[seg] * dx * dx * dx;
}

// ── Smoothstep utility ───────────────────────────────────────────────────────

export function smoothstep(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}

// ── ITCZ computation ─────────────────────────────────────────────────────────

/**
 * Build a spatial index binning regions by latitude/longitude for fast
 * geographic sampling. Returns a function landFracAndElev(lat, lon, radius)
 * that returns { landFrac, avgElev } by scanning nearby bins.
 */
function buildGeoIndex(r_xyz, r_elevation, r_isLand, numRegions) {
    const LAT_BINS = 36;   // 5° each
    const LON_BINS = 72;   // 5° each
    const bins = new Array(LAT_BINS * LON_BINS);
    for (let i = 0; i < bins.length; i++) bins[i] = [];

    for (let r = 0; r < numRegions; r++) {
        const y = r_xyz[3 * r + 1];
        const lat = Math.asin(Math.max(-1, Math.min(1, y)));
        const lon = Math.atan2(r_xyz[3 * r], r_xyz[3 * r + 2]);

        const latBin = Math.max(0, Math.min(LAT_BINS - 1,
            Math.floor((lat + Math.PI / 2) / Math.PI * LAT_BINS)));
        const lonBin = Math.max(0, Math.min(LON_BINS - 1,
            Math.floor((lon + Math.PI) / (2 * Math.PI) * LON_BINS)));

        bins[latBin * LON_BINS + lonBin].push(r);
    }

    /**
     * Sample land fraction and average elevation in a circular region.
     * @param {number} lat - center latitude (radians)
     * @param {number} lon - center longitude (radians)
     * @param {number} radius - great-circle radius (radians)
     */
    return function sample(lat, lon, radius) {
        const latMin = lat - radius, latMax = lat + radius;
        const bMin = Math.max(0, Math.floor((latMin + Math.PI / 2) / Math.PI * LAT_BINS));
        const bMax = Math.min(LAT_BINS - 1, Math.floor((latMax + Math.PI / 2) / Math.PI * LAT_BINS));

        // Longitude span widens near equator
        const cosLat = Math.cos(lat) || 0.01;
        const lonSpan = radius / cosLat;
        const lMin = Math.floor((lon - lonSpan + Math.PI) / (2 * Math.PI) * LON_BINS);
        const lMax = Math.floor((lon + lonSpan + Math.PI) / (2 * Math.PI) * LON_BINS);

        let landCount = 0, totalCount = 0, elevSum = 0;
        const cosRadius = Math.cos(radius);
        const sinLat0 = Math.sin(lat), cosLat0 = Math.cos(lat);

        for (let bi = bMin; bi <= bMax; bi++) {
            for (let li = lMin; li <= lMax; li++) {
                const lj = ((li % LON_BINS) + LON_BINS) % LON_BINS;
                const bin = bins[bi * LON_BINS + lj];
                for (let k = 0; k < bin.length; k++) {
                    const r = bin[k];
                    const ry = r_xyz[3 * r + 1];
                    const sinLat1 = ry;
                    const cosLat1 = Math.sqrt(1 - ry * ry) || 0.01;
                    const dlon = Math.atan2(r_xyz[3 * r], r_xyz[3 * r + 2]) - lon;
                    const cosDist = sinLat0 * sinLat1 + cosLat0 * cosLat1 * Math.cos(dlon);
                    if (cosDist >= cosRadius) {
                        totalCount++;
                        if (r_isLand[r]) landCount++;
                        elevSum += Math.max(0, r_elevation[r]);
                    }
                }
            }
        }

        if (totalCount === 0) return { landFrac: 0, avgElev: 0 };
        return { landFrac: landCount / totalCount, avgElev: elevSum / totalCount };
    };
}

/**
 * Compute ITCZ latitude at sampled longitudes for a given season.
 * @param {function} geoSample - from buildGeoIndex
 * @param {string} season - 'summer' (NH) or 'winter' (NH)
 * @param {number} tiltRad - axial tilt in radians
 * @returns {{ spline, lons: Float64Array, lats: Float64Array }}
 */
function computeITCZ(geoSample, season, tiltRad) {
    const NUM_LON = 72;
    const sampleRadius = 20 * DEG; // wide radius for smooth geographic sampling

    // +1 = NH summer, -1 = SH summer (NH winter)
    const sign = season === 'summer' ? 1 : -1;

    const lons = new Float64Array(NUM_LON);
    const rawLats = new Float64Array(NUM_LON);

    for (let i = 0; i < NUM_LON; i++) {
        const lon = -Math.PI + (i + 0.5) * (2 * Math.PI / NUM_LON);
        lons[i] = lon;

        // Sample land fraction across the 5°–20° band in the summer hemisphere
        let landSum = 0, elevSum = 0, samples = 0;
        for (let deg = 5; deg <= 20; deg += 5) {
            const lat = deg * sign * DEG;
            const { landFrac, avgElev } = geoSample(lat, lon, sampleRadius);
            landSum += landFrac;
            elevSum += avgElev;
            samples++;
        }

        const avgLand = landSum / samples;
        const avgElev = elevSum / samples;

        // Ocean default: 5°. Land pulls poleward up to +15°.
        // Need ~50% land coverage for full poleward pull.
        const landPull = Math.min(1, avgLand * 2);
        const itczDeg = 5 + landPull * 15 - elevToHeightKm(avgElev) * 1.5;
        const clampedDeg = Math.max(5, Math.min(20, itczDeg));

        rawLats[i] = clampedDeg * sign * DEG;
    }

    // Smooth the raw latitude samples (periodic moving average, 3 passes)
    // to eliminate jagged longitude-to-longitude jumps
    const lats = new Float64Array(rawLats);
    const tmp = new Float64Array(NUM_LON);
    for (let pass = 0; pass < 3; pass++) {
        for (let i = 0; i < NUM_LON; i++) {
            const p = (i - 1 + NUM_LON) % NUM_LON;
            const n = (i + 1) % NUM_LON;
            tmp[i] = 0.25 * lats[p] + 0.5 * lats[i] + 0.25 * lats[n];
        }
        lats.set(tmp);
    }

    // Re-clamp after smoothing: 5°–20° in the summer hemisphere
    const clampMin = (sign > 0 ? 5 : -20) * DEG;
    const clampMax = (sign > 0 ? 20 : -5) * DEG;
    for (let i = 0; i < NUM_LON; i++) {
        lats[i] = Math.max(clampMin, Math.min(clampMax, lats[i]));
    }

    const spline = buildPeriodicSpline(lons, lats);
    return { spline, lons, lats };
}

// ── Pressure field ───────────────────────────────────────────────────────────

/**
 * Compute pressure at a single region.
 */
function regionPressure(lat, lon, itczSpline, season, landFrac, elevation, noiseFn, px, py, pz) {
    const itczLat = evaluateSpline(itczSpline, lon);
    const latDeg = lat * RAD;
    const seasonSign = season === 'summer' ? 1 : -1;

    let p = 1013; // baseline hPa

    // (a) ITCZ low — follows thermal equator
    const dItcz = (lat - itczLat) * RAD; // degrees from ITCZ
    p -= 15 * Math.exp(-0.5 * (dItcz / 8) ** 2);

    // (b) Subtropical highs — shift with season, weaker over hot land
    const shiftDeg = seasonSign * 5;
    const nhSubHigh = 30 + shiftDeg;
    const shSubHigh = -(30 - shiftDeg);
    const highIntensity = 12 * (1 - 0.3 * landFrac);
    p += highIntensity * Math.exp(-0.5 * ((latDeg - nhSubHigh) / 10) ** 2);
    p += highIntensity * Math.exp(-0.5 * ((latDeg - shSubHigh) / 10) ** 2);

    // (c) Subpolar lows
    p -= 10 * Math.exp(-0.5 * ((latDeg - 60) / 10) ** 2);
    p -= 10 * Math.exp(-0.5 * ((latDeg + 60) / 10) ** 2);

    // (d) Polar highs
    p += 8 * Math.exp(-0.5 * ((latDeg - 85) / 8) ** 2);
    p += 8 * Math.exp(-0.5 * ((latDeg + 85) / 8) ** 2);

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
            p -= 10 * latFactor * continentalScale;
        } else {
            // Thermal high over cold continent (stronger — Siberian/Canadian highs)
            p += 14 * latFactor * continentalScale;
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

// ── Laplacian smoothing ──────────────────────────────────────────────────────

function smoothPressure(mesh, r_pressure, passes) {
    const { adjOffset, adjList, numRegions } = mesh;
    const tmp = new Float32Array(numRegions);

    for (let pass = 0; pass < passes; pass++) {
        for (let r = 0; r < numRegions; r++) {
            let sum = r_pressure[r];
            let count = 1;
            const end = adjOffset[r + 1];
            for (let ni = adjOffset[r]; ni < end; ni++) {
                sum += r_pressure[adjList[ni]];
                count++;
            }
            tmp[r] = sum / count;
        }
        r_pressure.set(tmp);
    }
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
    r_windE, r_windN, r_windSpeed, numRegions) {
    const sin5 = Math.sin(5 * DEG);

    for (let r = 0; r < numRegions; r++) {
        // PGF: from high to low = negative gradient
        const pgfE = -r_gradE[r];
        const pgfN = -r_gradN[r];

        const sinLat = r_sinLat[r];
        const absSinLat = Math.abs(sinLat);

        // Geostrophic deflection: 0° at equator → 70° at ≥5° latitude
        const geoAngle = 70 * DEG * smoothstep(0, sin5, absSinLat);

        // Surface friction turns wind 20° back toward low pressure
        const frictionAngle = 20 * DEG;

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
 * @returns {object} pressure and wind arrays for both seasons
 */
export function computeWind(mesh, r_xyz, r_elevation, plateIsOcean, r_plate, noise, axialTilt = 23.5) {
    const numRegions = mesh.numRegions;
    const avgEdgeKm = (Math.PI * 6371) / Math.sqrt(numRegions);
    const tiltRad = axialTilt * DEG;
    const timing = [];

    // ── Step 0: Precompute per-region properties ──

    let t0 = performance.now();

    const r_lat = new Float32Array(numRegions);
    const r_lon = new Float32Array(numRegions);
    const r_sinLat = new Float32Array(numRegions);
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
    const geoSample = buildGeoIndex(r_xyz, r_elevation, r_isLand, numRegions);
    const itczSummer = computeITCZ(geoSample, 'summer', tiltRad);
    const itczWinter = computeITCZ(geoSample, 'winter', tiltRad);
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
    const CONT_RANGE_KM = 2000; // distance at which cont reaches ~1.0
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
    smoothPressure(mesh, r_continentality, contSmoothPasses);

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
    smoothPressure(mesh, r_plateContinentality, contSmoothPasses);
    timing.push({ stage: 'Wind: continentality BFS', ms: performance.now() - t0 });

    // Shared gradient scratch arrays
    const r_gradE = new Float32Array(numRegions);
    const r_gradN = new Float32Array(numRegions);

    for (const { name, itcz } of seasons) {
        // Step 2: Pressure field
        t0 = performance.now();
        const r_pressure = new Float32Array(numRegions);

        for (let r = 0; r < numRegions; r++) {
            r_pressure[r] = regionPressure(
                r_lat[r], r_lon[r], itcz.spline, name,
                r_continentality[r], r_elevation[r], noise,
                r_xyz[3 * r], r_xyz[3 * r + 1], r_xyz[3 * r + 2]
            );
        }

        // Smooth pressure field ~75 km (scale-invariant)
        const pressSmoothPasses = Math.max(1, Math.round(75 / avgEdgeKm));
        smoothPressure(mesh, r_pressure, pressSmoothPasses);
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
            r_windE, r_windN, r_windSpeed, numRegions);

        // Step 5: Normalize wind speed to 0-1
        const speeds = new Float32Array(r_windSpeed);
        speeds.sort();
        const p95idx = Math.floor(numRegions * 0.95);
        const maxSpeed = speeds[p95idx] || 1;
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
