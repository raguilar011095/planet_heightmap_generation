// Precipitation simulation: moisture advection driven by wind, ocean warmth,
// orographic effects, ITCZ uplift, frontal convergence, and polar fronts.
// Computes per-region precipitation for summer and winter seasons.

import { smoothstep } from './wind.js';
import { computeGradients } from './wind.js';
import { elevToHeightKm } from './color-map.js';
import { computeHeuristicPrecipitation, computeHeuristicWindField } from './heuristic-precip.js';
import { smoothField, makeItczLookup, percentile } from './climate-util.js';

const DEG = Math.PI / 180;

// ── Wind convergence ─────────────────────────────────────────────────────────
// Compute per-region convergence of the wind field. Negative divergence means
// winds are piling into a region (frontal zone / ITCZ-like uplift). We measure
// this as net inward flux: for each neighbor pair, how much does the neighbor's
// wind point toward us vs. our wind point toward the neighbor?

function computeWindConvergence(mesh, r_xyz,
    r_wind3dX, r_wind3dY, r_wind3dZ) {
    const { adjOffset, adjList, numRegions } = mesh;
    const convergence = new Float32Array(numRegions);

    for (let r = 0; r < numRegions; r++) {
        // Wind at r in 3D (pre-computed)
        const wdx = r_wind3dX[r];
        const wdy = r_wind3dY[r];
        const wdz = r_wind3dZ[r];

        let conv = 0;
        let count = 0;
        const end = adjOffset[r + 1];
        for (let ni = adjOffset[r]; ni < end; ni++) {
            const nb = adjList[ni];
            // Direction from r to nb
            const dx = r_xyz[3 * nb] - r_xyz[3 * r];
            const dy = r_xyz[3 * nb + 1] - r_xyz[3 * r + 1];
            const dz = r_xyz[3 * nb + 2] - r_xyz[3 * r + 2];

            // Wind at nb in 3D (pre-computed)
            const nwdx = r_wind3dX[nb];
            const nwdy = r_wind3dY[nb];
            const nwdz = r_wind3dZ[nb];

            // Our wind points toward nb (outward flux)
            const outFlux = wdx * dx + wdy * dy + wdz * dz;
            // Neighbor wind points toward us (inward flux)
            const inFlux = -(nwdx * dx + nwdy * dy + nwdz * dz);

            // Net convergence contribution: inward minus outward
            conv += (inFlux - outFlux);
            count++;
        }

        // Normalize by neighbor count; positive = converging, negative = diverging
        convergence[r] = count > 0 ? conv / count : 0;
    }

    return convergence;
}

// ── Upwind moisture advection ────────────────────────────────────────────────
// For each land cell, accumulate moisture from upwind neighbors.
// Moisture originates at coast cells proportional to ocean warmth and
// depletes with distance and elevation gain.

function advectMoisture(mesh, r_xyz, r_heightKm, r_isLand,
    r_windE, r_windN,
    r_wind3dX, r_wind3dY, r_wind3dZ,
    r_oceanWarmth, r_coastDistLand, maxHops, avgEdgeKm) {
    const { adjOffset, adjList, numRegions } = mesh;

    const moisture = new Float32Array(numRegions);

    // Initialize coastal land cells with moisture from adjacent ocean warmth
    for (let r = 0; r < numRegions; r++) {
        if (!r_isLand[r]) continue;
        if (r_coastDistLand[r] !== 0) continue; // not a coast cell

        // Check for onshore wind: wind points inland (away from ocean)
        // Get average ocean warmth from ocean neighbors
        let warmthSum = 0;
        let oceanCount = 0;
        let oceanDirX = 0, oceanDirY = 0, oceanDirZ = 0;
        const end = adjOffset[r + 1];
        for (let ni = adjOffset[r]; ni < end; ni++) {
            const nb = adjList[ni];
            if (!r_isLand[nb]) {
                oceanCount++;
                if (r_oceanWarmth) warmthSum += r_oceanWarmth[nb];
                oceanDirX += r_xyz[3 * nb] - r_xyz[3 * r];
                oceanDirY += r_xyz[3 * nb + 1] - r_xyz[3 * r + 1];
                oceanDirZ += r_xyz[3 * nb + 2] - r_xyz[3 * r + 2];
            }
        }
        if (oceanCount === 0) continue;

        const avgWarmth = warmthSum / oceanCount;

        // Wind direction in 3D (pre-computed)
        const wdx = r_wind3dX[r];
        const wdy = r_wind3dY[r];
        const wdz = r_wind3dZ[r];

        // Onshore = wind blows FROM ocean toward land = wind dot (ocean→region) < 0
        // i.e. wind direction points away from ocean = wind dot oceanDir < 0
        const windDotOcean = wdx * oceanDirX + wdy * oceanDirY + wdz * oceanDirZ;

        // Onshore wind: wind blows away from ocean direction (into land)
        const onshore = windDotOcean < 0 ? 1.0 : 0.25; // baseline even for offshore (sea breeze/evaporation)

        // Base moisture: warm currents provide more, cold currents less
        // avgWarmth ranges ~ [-1, 1]; warm > 0 boosts, cold < 0 reduces
        const warmthFactor = 0.5 + 0.5 * Math.max(-0.8, Math.min(1, avgWarmth));
        moisture[r] = onshore * warmthFactor;
    }

    // Also seed ocean cells near coast with their warmth (for orographic effects
    // where mountains are right at the coast)
    for (let r = 0; r < numRegions; r++) {
        if (r_isLand[r]) continue;
        // Give ocean cells a base moisture proportional to warmth (for polar/ITCZ effects)
        const warmth = r_oceanWarmth ? r_oceanWarmth[r] : 0;
        moisture[r] = 0.4 + 0.35 * Math.max(0, warmth);
    }

    // Base friction: ~78% moisture survives the full maxHops
    // distance over flat terrain. Per-hop retention = 0.78^(1/maxHops).
    const depletionBase = 1 - Math.pow(0.78, 1 / maxHops);

    // Iterative downwind propagation (ping-pong double-buffering)
    let src = moisture;
    let dst = new Float32Array(numRegions);
    for (let iter = 0; iter < maxHops; iter++) {
        dst.set(src);

        for (let r = 0; r < numRegions; r++) {
            if (!r_isLand[r]) continue;

            const we = r_windE[r], wn = r_windN[r];
            const speed = Math.sqrt(we * we + wn * wn);
            if (speed < 0.001) continue;

            // Wind direction in 3D (pre-computed)
            const wdx = r_wind3dX[r];
            const wdy = r_wind3dY[r];
            const wdz = r_wind3dZ[r];

            // Find upwind neighbors (those where wind at neighbor points toward us)
            // Track weighted-average upwind elevation for gradient-based depletion
            let upwindMoisture = 0;
            let upwindWeight = 0;
            let upwindHeightSum = 0;
            const heightHere = r_heightKm[r];
            const end = adjOffset[r + 1];
            for (let ni = adjOffset[r]; ni < end; ni++) {
                const nb = adjList[ni];
                // Direction from nb to r
                const dx = r_xyz[3 * r] - r_xyz[3 * nb];
                const dy = r_xyz[3 * r + 1] - r_xyz[3 * nb + 1];
                const dz = r_xyz[3 * r + 2] - r_xyz[3 * nb + 2];

                // Wind at nb in 3D (pre-computed)
                const nwdx = r_wind3dX[nb];
                const nwdy = r_wind3dY[nb];
                const nwdz = r_wind3dZ[nb];

                // Alignment: how much does wind at nb point toward r?
                const dot = nwdx * dx + nwdy * dy + nwdz * dz;
                if (dot > 0) {
                    const w = dot; // weight by alignment
                    upwindMoisture += src[nb] * w;
                    upwindHeightSum += r_heightKm[nb] * w;
                    upwindWeight += w;
                }
            }

            if (upwindWeight > 0) {
                const incoming = upwindMoisture / upwindWeight;
                const upwindHeight = upwindHeightSum / upwindWeight;

                // Depletion depends on physical height GAIN (km) from upwind.
                // All rates scale with maxHops so behavior is resolution-
                // invariant: the same physical distance yields the same
                // total depletion regardless of cell count.
                const heightGain = Math.max(0, heightHere - upwindHeight);

                // Height gain per hop (km) shrinks at higher resolution.
                // Multiply by maxHops to get total rise over the advection
                // distance. A ~1 km total rise dumps significant moisture,
                // ~2 km near-total.
                const normalizedGain = heightGain * maxHops;
                const elevDepletion = Math.min(0.8, normalizedGain * 0.55);
                const depletion = depletionBase + elevDepletion;

                const carried = incoming * Math.max(0, 1 - depletion);
                dst[r] = Math.max(dst[r], carried);
            }
        }

        // Swap buffers (O(1) pointer swap instead of full array copy)
        const swap = src;
        src = dst;
        dst = swap;
    }

    return src;
}

// ── Main entry point ─────────────────────────────────────────────────────────

/**
 * Compute seasonal precipitation fields.
 *
 * @param {SphereMesh} mesh
 * @param {Float32Array} r_xyz - per-region 3D positions
 * @param {Float32Array} r_elevation - per-region elevation
 * @param {object} windResult - output from computeWind()
 * @param {object} oceanResult - output from computeOceanCurrents()
 * @returns {{ r_precip_summer, r_precip_winter }} normalized 0–1 arrays
 */
export function computePrecipitation(mesh, r_xyz, r_elevation, windResult, oceanResult) {
    console.log('[precipitation.js] computePrecipitation called, numRegions:', mesh.numRegions);
    const numRegions = mesh.numRegions;
    const timing = [];

    const { r_lat, r_lon, r_isLand, r_continentality,
        r_eastX, r_eastY, r_eastZ,
        r_northX, r_northY, r_northZ } = windResult;

    // Scale-dependent hop count: ~2000 km reach.
    // Average edge length ≈ π / sqrt(numRegions) radians ≈ (π * 6371) / sqrt(N) km
    // hops ≈ 2000 / edgeLengthKm
    const avgEdgeKm = (Math.PI * 6371) / Math.sqrt(numRegions);
    const avgEdgeRad = Math.PI / Math.sqrt(numRegions);
    const maxHops = Math.max(8, Math.min(20, Math.round(2000 / avgEdgeKm)));

    // Coast distance through land — reuse BFS already computed by wind.js
    const r_coastDistLand = windResult.r_coastDistLand;

    // Elevation gradient for orographic detection (shared)
    let t0 = performance.now();
    const r_elevGradE = new Float32Array(numRegions);
    const r_elevGradN = new Float32Array(numRegions);
    computeGradients(mesh, r_xyz, r_elevation,
        r_eastX, r_eastY, r_eastZ, r_northX, r_northY, r_northZ,
        r_elevGradE, r_elevGradN);
    timing.push({ stage: 'Precip: elevation gradients', ms: performance.now() - t0 });

    // Pre-compute height in km for advection and mechanisms (elevation is constant across seasons)
    const r_heightKm = new Float32Array(numRegions);
    for (let r = 0; r < numRegions; r++) {
        r_heightKm[r] = elevToHeightKm(Math.max(0, r_elevation[r]));
    }

    const result = {};

    const seasons = [
        { name: 'summer', shift: 5 },
        { name: 'winter', shift: -5 }
    ];

    for (const { name, shift } of seasons) {
        t0 = performance.now();

        const r_windE_raw = windResult[`r_wind_east_${name}`];
        const r_windN_raw = windResult[`r_wind_north_${name}`];
        const r_windSpeed = windResult[`r_wind_speed_${name}`];
        const r_pressure = windResult[`r_pressure_${name}`];
        const r_oceanWarmth = oceanResult[`r_ocean_warmth_${name}`];

        const itczLookup = makeItczLookup(windResult.itczLons,
            name === 'summer' ? windResult.itczLatsSummer : windResult.itczLatsWinter);

        // ── Blend complex wind with heuristic zonal wind (50-50) ──
        // Smooths out noisy pressure-derived wind patterns, strengthens
        // zonal consistency for advection and orographic effects.
        const { hWindE, hWindN } = computeHeuristicWindField(
            numRegions, r_lat, r_lon, itczLookup);
        const r_windE = new Float32Array(numRegions);
        const r_windN = new Float32Array(numRegions);
        for (let r = 0; r < numRegions; r++) {
            r_windE[r] = 0.5 * r_windE_raw[r] + 0.5 * hWindE[r];
            r_windN[r] = 0.5 * r_windN_raw[r] + 0.5 * hWindN[r];
        }

        // Pre-compute 3D wind vectors for convergence and advection
        const r_wind3dX = new Float32Array(numRegions);
        const r_wind3dY = new Float32Array(numRegions);
        const r_wind3dZ = new Float32Array(numRegions);
        for (let r = 0; r < numRegions; r++) {
            const we = r_windE[r], wn = r_windN[r];
            r_wind3dX[r] = we * r_eastX[r] + wn * r_northX[r];
            r_wind3dY[r] = we * r_eastY[r] + wn * r_northY[r];
            r_wind3dZ[r] = we * r_eastZ[r] + wn * r_northZ[r];
        }

        // ── Step 1a: Wind convergence field ──
        // Compute raw convergence then smooth heavily — real fronts are
        // messy, mobile bands, not sharp lines. The smoothing spreads the
        // signal over a wide area representing the zone where frontal
        // weather systems wander over a season.
        const r_convergence = computeWindConvergence(mesh, r_xyz,
            r_wind3dX, r_wind3dY, r_wind3dZ);
        // Smooth ~400 km worth of hops so frontal zones are broad bands
        const convSmoothPasses = Math.max(3, Math.round(400 / avgEdgeKm));
        smoothField(mesh, r_convergence, convSmoothPasses);

        // ── Step 1b: Moisture advection from coasts ──
        const moisture = advectMoisture(mesh, r_xyz, r_heightKm, r_isLand,
            r_windE, r_windN,
            r_wind3dX, r_wind3dY, r_wind3dZ,
            r_oceanWarmth, r_coastDistLand, maxHops, avgEdgeKm);

        const tAdvect = performance.now() - t0;

        // ── Step 2: Apply precipitation mechanisms ──
        t0 = performance.now();
        const precip = new Float32Array(numRegions);

        for (let r = 0; r < numRegions; r++) {
            const lat = r_lat[r];
            const lon = r_lon[r];
            const absLatDeg = Math.abs(lat) / DEG;
            const elev = r_elevation[r];
            const isLand = r_isLand[r];

            let p = moisture[r];

            // (a) ITCZ uplift: boost moisture within ±15° of ITCZ
            const itczLat = itczLookup(lon);
            const distFromItcz = Math.abs(lat - itczLat) / DEG;
            const cont = (isLand && r_continentality) ? r_continentality[r] : 0;
            if (distFromItcz < 15) {
                const itczStrength = smoothstep(15, 0, distFromItcz);
                // Core ITCZ (within 5°): strong uplift and convective rain
                const coreBoost = distFromItcz < 5 ? 1.5 : 1.0;
                p = p * (1 + itczStrength * coreBoost) + itczStrength * 0.3;
            }

            // (b) Frontal precipitation: actual wind convergence
            // Where winds collide (convergence > 0) air is forced upward,
            // creating turbulence and wringing out whatever moisture is present.
            // This naturally finds frontal zones, ITCZ-like convergence,
            // and any other place where air masses meet.
            const conv = r_convergence[r];
            if (conv > 0) {
                // Scale convergence: gentle convergence gives mild boost,
                // strong convergence (opposing air masses) gives large boost.
                // Only amplifies existing moisture — dry converging air
                // doesn't produce rain.
                // Raw convergence ∝ avgEdgeRad (neighbor displacements shrink
                // at higher resolution), so normalize to make scale-invariant.
                const convStrength = Math.min(1, (conv / avgEdgeRad) * 0.055);
                p = p * (1 + convStrength * 1.2) + convStrength * moisture[r] * 0.4;
            }

            // (c) Orographic effects (land only)
            // The advection step already handles gradient-based moisture loss
            // per hop. This step adds the *local* precipitation boost on windward
            // slopes (forced uplift squeezes out extra rain at that cell) and a
            // moderate leeward shadow for any remaining moisture.
            if (isLand && elev > 0) {
                const we = r_windE[r], wn = r_windN[r];
                // Windward uplift: wind dot elevation gradient
                // Positive = wind blows upslope (windward), negative = downslope (leeward)
                const windDotGrad = we * r_elevGradE[r] + wn * r_elevGradN[r];

                if (windDotGrad > 0) {
                    // Windward: orographic enhancement — the steeper the slope
                    // the wind is pushing up, the more rain wrung out.
                    // gradient strength matters more than absolute height.
                    const uplift = Math.min(1, windDotGrad * 15);
                    p += uplift * 0.6;
                } else {
                    // Leeward: rain shadow. The advection step already depleted
                    // moisture crossing the ridge; this is the *extra* suppression
                    // from descending/warming air (foehn drying) on the lee side.
                    const shadow = Math.min(1, -windDotGrad * 18);
                    p *= Math.max(0.05, 1 - shadow * 0.85);
                }
            }

            // (d) Pressure-driven suppression/enhancement (hybrid)
            // Start with a gentle latitude-band expectation for subtropical
            // highs, then let the actual pressure field shift it — so the
            // effect tracks real geography without being too aggressive.
            const pDev = r_pressure[r]; // deviation from 1013 hPa

            // Seasonal subtropical suppression: the subtropical high shifts
            // poleward in local summer (creating Mediterranean dry summers)
            // and retreats equatorward in local winter (allowing westerly rain).
            const inLocalSummer = (name === 'summer') ? (lat >= 0) : (lat < 0);
            const subtropCenter = inLocalSummer ? 30 : 24;
            const subtropWidth  = inLocalSummer ? 16 : 12;
            let   subtropPeak   = inLocalSummer ? 0.50 : 0.30;

            // East-coast monsoon relief: reduce summer drying where
            // poleward winds bring tropical moisture onshore. On Earth
            // this produces humid subtropical (Cfa) on east coasts
            // while west coasts keep Mediterranean (Cs) dry summers.
            if (isLand && inLocalSummer) {
                const polewardWind = lat >= 0 ? r_windN[r] : -r_windN[r];
                if (polewardWind > 0) {
                    const coastDist = r_coastDistLand[r] >= 0 ? r_coastDistLand[r] : maxHops;
                    const coastProximity = 1 - smoothstep(0, maxHops * 0.4, coastDist);
                    const monsoonRelief = smoothstep(0, 0.15, polewardWind) * coastProximity;
                    subtropPeak *= (1 - monsoonRelief * 0.7);
                }
            }

            const subtropDist = Math.abs(absLatDeg - subtropCenter);
            const latBandSuppression = subtropDist < subtropWidth
                ? smoothstep(subtropWidth, 0, subtropDist) * subtropPeak : 0;

            // Pressure modifier: high pressure adds suppression, low reduces it
            // Kept gentle — pressure nudges the baseline, doesn't overwhelm it.
            let pressureMod = 0;
            if (pDev > 0) {
                pressureMod = smoothstep(0, 12, pDev) * 0.25; // extra suppression
            } else {
                pressureMod = -smoothstep(0, 15, -pDev) * 0.2; // relief / enhancement
            }

            const totalSuppression = Math.max(0, latBandSuppression + pressureMod);
            if (totalSuppression > 0) {
                p *= Math.max(0.05, 1 - totalSuppression);
            } else {
                // Net enhancement from low pressure outside subtropical belt
                p *= (1 - totalSuppression); // totalSuppression is negative here
            }

            // (e) Polar front: diffuse precipitation at high latitudes
            // The polar front is broad and pushes moisture deep inland —
            // the blog cites ~2000 km downwind, ~1500 km crosswind from
            // any coast, including coasts with offshore winds.
            // It always brings *some* precipitation from its own cyclonic
            // activity, even deep inland, plus a stronger coastal component.
            if (absLatDeg > 40) {
                const polarStrength = smoothstep(40, 70, absLatDeg);
                const coastDist = r_coastDistLand[r] < 0 ? maxHops : r_coastDistLand[r];
                const inlandFade = 1 - smoothstep(0, maxHops, coastDist);
                // Base: always present regardless of coast distance
                const polarBase = polarStrength * 0.10;
                // Coastal enhancement: fades inland
                const polarCoastal = polarStrength * 0.20 * inlandFade;
                // Mostly enhances existing moisture, but adds some regardless
                p += polarBase + polarCoastal;
                p *= (1 + polarStrength * 0.15); // gentle multiplicative boost
            }

            // (f) Continental interior dryness
            // Now that continentality is BFS-based (0 at coast, 0.5 at ~1000km,
            // 1.0 at ~2000km), we can use it directly. Squared curve keeps
            // near-coast areas gentle while ramping for deep interiors.
            if (isLand && cont > 0) {
                const dryness = cont * cont * 0.55;
                p *= Math.max(0.03, 1 - dryness);
            }

            // (g) Lee cyclogenesis: localized wet zone on leeward side of high mountains
            // when ocean is nearby downwind (~200 km)
            const heightKm = r_heightKm[r];
            if (isLand && heightKm > 1.5) {
                const we = r_windE[r], wn = r_windN[r];
                const windDotGrad = we * r_elevGradE[r] + wn * r_elevGradN[r];
                // ~200 km in hops (scale-invariant)
                const leeCoastHops = Math.max(2, Math.round(200 / avgEdgeKm));
                if (windDotGrad < -0.01 && r_coastDistLand[r] >= 0 && r_coastDistLand[r] < leeCoastHops) {
                    p += 0.15 * Math.min(1, heightKm / 5);
                }
            }

            // Ocean cells: precipitation over ocean (for visual completeness)
            if (!isLand) {
                // ITCZ and frontal zones already contribute above.
                // Add baseline ocean precipitation, suppressed under high pressure
                const highPressureFade = pDev > 0 ? smoothstep(0, 12, pDev) : 0;
                const oceanBase = 0.15 * (1 - highPressureFade);
                p = Math.max(p, oceanBase);
            }

            // (h) Hard distance-from-coast moisture cutoff
            // Beyond ~2000 km from any coast, moisture drops off steeply.
            // By 3000 km almost nothing remains.
            if (isLand && r_coastDistLand[r] > 0) {
                const distKm = r_coastDistLand[r] * avgEdgeKm;
                if (distKm > 2000) {
                    const fade = 1 - smoothstep(2000, 3000, distKm);
                    p *= Math.max(0.03, fade);
                }
            }

            precip[r] = Math.max(0, p);
        }

        const tMechanisms = performance.now() - t0;

        // ── Step 3: Smooth (normalization deferred to blending step) ──
        t0 = performance.now();
        // Light smoothing ~100 km to blend cell-to-cell noise
        const precipSmoothPasses = Math.max(1, Math.round(100 / avgEdgeKm));
        smoothField(mesh, precip, precipSmoothPasses);
        const tSmooth = performance.now() - t0;

        timing.push({ stage: `Precip: advection (${name})`, ms: tAdvect });
        timing.push({ stage: `Precip: mechanisms (${name})`, ms: tMechanisms });
        timing.push({ stage: `Precip: smooth (${name})`, ms: tSmooth });

        result[`r_precip_${name}`] = precip;
    }

    // ── Step 4: Blend with heuristic model and normalize ──
    t0 = performance.now();
    const heuristic = computeHeuristicPrecipitation(mesh, r_xyz, r_elevation, windResult, r_elevGradE, r_elevGradN, r_coastDistLand);

    for (const seasonName of ['summer', 'winter']) {
        const complex = result[`r_precip_${seasonName}`];
        const heur = heuristic[`r_precip_${seasonName}`];
        const blended = new Float32Array(numRegions);
        for (let r = 0; r < numRegions; r++) {
            blended[r] = 0.5 * complex[r] + 0.5 * heur[r];
        }

        // 95th-percentile normalization on blended result
        const maxPrecip = percentile(blended, 0.95);
        for (let r = 0; r < numRegions; r++) {
            blended[r] = Math.min(1, blended[r] / maxPrecip);
        }

        // Continental interior cap: interior regions can't exceed steppe-level
        // precipitation.  At cont=1.0, cap is 0.20 per season (≈ 200mm
        // half-year → 400mm annual — solidly in steppe territory).  Fades in
        // from cont 0.5 so the transition is gradual.  Other factors (desert
        // factory, rain shadows, distance cutoff) can still push lower.
        const r_continentality = windResult.r_continentality;
        if (r_continentality) {
            for (let r = 0; r < numRegions; r++) {
                if (r_isLand[r] && r_continentality[r] > 0.5) {
                    const t = smoothstep(0.5, 1.0, r_continentality[r]);
                    const cap = 1.0 - t * 0.80;  // 1.0 at cont=0.5, 0.20 at cont=1.0
                    blended[r] = Math.min(blended[r], cap);
                }
            }
        }

        result[`r_precip_${seasonName}`] = blended;
    }
    timing.push({ stage: 'Precip: heuristic blend+normalize', ms: performance.now() - t0 });

    result._precipTiming = timing;
    return result;
}
