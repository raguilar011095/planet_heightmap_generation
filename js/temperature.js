// Temperature simulation: computes per-region surface temperature for summer
// and winter seasons based on ITCZ position, continentality, moisture-dependent
// elevation lapse rate (dry adiabatic 9.3 C/km to moist adiabatic 4.5 C/km),
// ocean current warmth, and precipitation/cloud cover moderation.
// Returns normalized 0-1 values mapped to a fixed -45 to +45 C range.

import { CLIMATE } from './climate-config.js';
import { smoothstep } from './wind.js';
import { elevToHeightKm } from './color-map.js';
import { smoothField, makeItczLookup } from './climate-util.js';

const DEG = Math.PI / 180;

// ── BFS through land cells only ─────────────────────────────────────────────

function bfsLandDist(mesh, r_isLand, seeds) {
    const { adjOffset, adjList, numRegions } = mesh;
    const dist = new Int32Array(numRegions).fill(-1);
    const queue = new Int32Array(numRegions);
    let qLen = 0, head = 0;
    for (const r of seeds) {
        if (r_isLand[r]) {
            dist[r] = 0;
            queue[qLen++] = r;
        }
    }
    while (head < qLen) {
        const r = queue[head++];
        const d1 = dist[r] + 1;
        const end = adjOffset[r + 1];
        for (let i = adjOffset[r]; i < end; i++) {
            const nb = adjList[i];
            if (r_isLand[nb] && dist[nb] === -1) {
                dist[nb] = d1;
                queue[qLen++] = nb;
            }
        }
    }
    return dist;
}

// ── Array-based landmass flood-fill ─────────────────────────────────────────

function landComponentLabels(mesh, r_isLand) {
    const N = mesh.numRegions;
    const { adjOffset, adjList } = mesh;
    const r_label = new Int32Array(N).fill(-1);
    let nextId = 0;
    const queue = new Int32Array(N);
    const compSizes = [];

    for (let r = 0; r < N; r++) {
        if (!r_isLand[r] || r_label[r] >= 0) continue;
        const id = nextId++;
        compSizes.push(0);
        r_label[r] = id;
        let qLen = 1, head = 0;
        queue[0] = r;
        while (head < qLen) {
            const cur = queue[head++];
            compSizes[id]++;
            const end = adjOffset[cur + 1];
            for (let i = adjOffset[cur]; i < end; i++) {
                const nb = adjList[i];
                if (r_isLand[nb] && r_label[nb] === -1) {
                    r_label[nb] = id;
                    queue[qLen++] = nb;
                }
            }
        }
    }
    return { r_label, compSizes, numComponents: nextId };
}

// ── Temperature swing lookup table ──────────────────────────────────────────
// Full annual swing (Twarm - Tcold) midpoints from the guide, in °C.
// Rows = latitude bands, columns = zones (HO, OC, SC, CO, HC).

const SWING_TABLE = [
    // 0-19°    20-29°   30-39°   40-49°   50-59°   60-69°   70-90°
    [  3,  7.5, 13.5, 16.5, 19.5],  // 0-19°
    [  6, 10.5, 18,   24,   31  ],  // 20-29°
    [7.5, 15,   24,   31.5, 38.5],  // 30-39°
    [  9, 16.5, 28.5, 37.5, 46.5],  // 40-49°
    [  9, 19.5, 31.5, 42,   52.5],  // 50-59°
    [  9, 21,   36,   45,   57  ],  // 60-69°
    [  9, 22.5, 37.5, 48,   60  ],  // 70-90°
];

// Latitude midpoints for each row (used for interpolation)
const LAT_MIDS = [9.5, 24.5, 34.5, 44.5, 54.5, 64.5, 80];

/**
 * Look up half-swing amplitude (°C) from zone and latitude via bilinear interpolation.
 * @param {number} latDeg - absolute latitude in degrees
 * @param {number} zoneVal - zone value 0.0 (Hyperoceanic) to 1.0 (Hypercontinental)
 * @returns {number} half-swing in °C (apply as ± from annual mean)
 */
function lookupSwingAmplitude(latDeg, zoneVal) {
    // Latitude interpolation
    let li = 0;
    for (let i = 0; i < LAT_MIDS.length - 1; i++) {
        if (latDeg >= LAT_MIDS[i]) li = i;
    }
    const li2 = Math.min(li + 1, LAT_MIDS.length - 1);
    const latT = li === li2 ? 0
        : Math.max(0, Math.min(1, (latDeg - LAT_MIDS[li]) / (LAT_MIDS[li2] - LAT_MIDS[li])));

    // Zone interpolation (0.0 → col 0, 0.25 → col 1, ..., 1.0 → col 4)
    const zIdx = Math.max(0, Math.min(4, zoneVal * 4));
    const zi = Math.min(Math.floor(zIdx), 3);
    const zi2 = zi + 1;
    const zoneT = zIdx - zi;

    // Bilinear: interpolate across zone at both latitude rows, then across latitude
    const v00 = SWING_TABLE[li][zi],  v01 = SWING_TABLE[li][zi2];
    const v10 = SWING_TABLE[li2][zi], v11 = SWING_TABLE[li2][zi2];
    const vLo = v00 + (v01 - v00) * zoneT;
    const vHi = v10 + (v11 - v10) * zoneT;
    const fullSwing = vLo + (vHi - vLo) * latT;

    return fullSwing * CLIMATE.TEMP_SWING_SCALE / 2; // half-swing (amplitude)
}

// ── Zone-based temperature continentality ───────────────────────────────────
// Follows the geographic guide: discrete zones (Hyperoceanic → Oceanic →
// Subcontinental → Continental → Hypercontinental) based on latitude,
// continent size, west-coast shave, and island size.  Used ONLY for
// temperature seasonal swing; the existing BFS-based r_continentality
// remains for precipitation and pressure.

const ZONE_HO = 0.0;    // Hyperoceanic
const ZONE_OC = 0.25;   // Oceanic
const ZONE_SC = 0.5;    // Subcontinental
const ZONE_CO = 0.75;   // Continental
const ZONE_HC = 1.0;    // Hypercontinental

function computeTempContinentality(
    mesh, r_xyz, r_isLand, r_lat, r_lon,
    r_eastX, r_eastY, r_eastZ, r_northX, r_northY, r_northZ,
    r_ocean_warmth_summer,
    r_coastDistLand,
    avgEdgeKm
) {
    const { adjOffset, adjList, numRegions } = mesh;
    const zone = new Float32Array(numRegions);
    // Mark ocean cells as -1 so the viz layer can distinguish them
    for (let r = 0; r < numRegions; r++) {
        if (!r_isLand[r]) zone[r] = -1;
    }

    // ── Stage A: Baseline zones ─────────────────────────────────────────────

    // A1. Flood-fill connected landmasses
    const { r_label, compSizes, numComponents } = landComponentLabels(mesh, r_isLand);

    // A2. Per-component statistics, split by hemisphere.
    // The guide measures landmass area poleward of certain latitudes,
    // so a continent spanning the equator counts its north and south
    // halves independently.
    const cellAreaKm2 = avgEdgeKm * avgEdgeKm;
    // [0] = north hemisphere, [1] = south hemisphere
    const bandArea_35_70_N = new Float32Array(numComponents);
    const bandArea_35_70_S = new Float32Array(numComponents);
    const bandArea_above35_N = new Float32Array(numComponents);
    const bandArea_above35_S = new Float32Array(numComponents);

    // For E-W width: bin longitudes into 72 bins (5° each) per component
    // per hemisphere in the 35-70° band.
    const LON_BINS = 72;
    const lonBinsN = new Uint8Array(numComponents * LON_BINS);
    const lonBinsS = new Uint8Array(numComponents * LON_BINS);

    for (let r = 0; r < numRegions; r++) {
        if (!r_isLand[r]) continue;
        const id = r_label[r];
        const latDeg = r_lat[r] / DEG;
        const absLatDeg = Math.abs(latDeg);
        const isNorth = latDeg >= 0;
        if (absLatDeg >= 35 && absLatDeg <= 70) {
            if (isNorth) {
                bandArea_35_70_N[id]++;
            } else {
                bandArea_35_70_S[id]++;
            }
            const lonNorm = (r_lon[r] + Math.PI) / (2 * Math.PI);
            const bin = Math.min(LON_BINS - 1, Math.floor(lonNorm * LON_BINS));
            if (isNorth) lonBinsN[id * LON_BINS + bin] = 1;
            else lonBinsS[id * LON_BINS + bin] = 1;
        }
        if (absLatDeg >= 35) {
            if (isNorth) bandArea_above35_N[id]++;
            else bandArea_above35_S[id]++;
        }
    }

    // Compute E-W width per component per hemisphere
    function computeEWWidth(lonBinArr) {
        const widths = new Float32Array(numComponents);
        const cosLat52 = Math.cos(52.5 * DEG);
        for (let id = 0; id < numComponents; id++) {
            let occupied = 0;
            for (let b = 0; b < LON_BINS; b++) {
                if (lonBinArr[id * LON_BINS + b]) occupied++;
            }
            if (occupied < 2) continue;
            let maxGap = 0, gap = 0;
            for (let i = 0; i < LON_BINS * 2; i++) {
                if (!lonBinArr[id * LON_BINS + (i % LON_BINS)]) {
                    gap++;
                    if (gap > maxGap) maxGap = gap;
                } else {
                    gap = 0;
                }
            }
            maxGap = Math.min(maxGap, LON_BINS);
            const spanBins = LON_BINS - maxGap;
            const spanRad = spanBins * (2 * Math.PI / LON_BINS);
            widths[id] = spanRad * cosLat52 * 6371;
        }
        return widths;
    }
    const ewWidthKmN = computeEWWidth(lonBinsN);
    const ewWidthKmS = computeEWWidth(lonBinsS);

    // Convert cell counts to km²
    for (let id = 0; id < numComponents; id++) {
        bandArea_35_70_N[id] *= cellAreaKm2;
        bandArea_35_70_S[id] *= cellAreaKm2;
        bandArea_above35_N[id] *= cellAreaKm2;
        bandArea_above35_S[id] *= cellAreaKm2;
    }

    // A3-A8. Assign baseline zones
    for (let r = 0; r < numRegions; r++) {
        if (!r_isLand[r]) continue;
        const latDeg = r_lat[r] / DEG;
        const absLatDeg = Math.abs(latDeg);
        const id = r_label[r];
        const isNorth = latDeg >= 0;

        // Pick the hemisphere-appropriate stats
        const band35_70 = isNorth ? bandArea_35_70_N[id] : bandArea_35_70_S[id];
        const above35 = isNorth ? bandArea_above35_N[id] : bandArea_above35_S[id];
        const ewWidth = isNorth ? ewWidthKmN[id] : ewWidthKmS[id];

        // Default: Oceanic
        zone[r] = ZONE_OC;

        // Hyperoceanic: tropics 0-10°
        if (absLatDeg <= 10) {
            zone[r] = ZONE_HO;
            continue;
        }

        // Subcontinental: 35°+ on landmasses with enough area and width
        if (absLatDeg >= 35 &&
            band35_70 > 4_500_000 &&
            ewWidth > 2000) {
            zone[r] = ZONE_SC;
        }

        // Continental: 40°+, over subcontinental, very large landmass
        if (zone[r] >= ZONE_SC && absLatDeg >= 40 &&
            above35 > 10_000_000) {
            zone[r] = ZONE_CO;
        }

        // Hypercontinental: 50°+, over continental
        if (zone[r] >= ZONE_CO && absLatDeg >= 50) {
            zone[r] = ZONE_HC;
        }
    }

    // A4-A5. Warm-current coast extension: Hyperoceanic up to 23.5° near warm currents
    if (r_ocean_warmth_summer) {
        const warmCoastSeeds = [];
        for (let r = 0; r < numRegions; r++) {
            if (!r_isLand[r]) continue;
            const absLatDeg = Math.abs(r_lat[r]) / DEG;
            if (absLatDeg > 23.5 || zone[r] === ZONE_HO) continue;

            // Check if any ocean neighbor has warm current
            const end = adjOffset[r + 1];
            for (let i = adjOffset[r]; i < end; i++) {
                const nb = adjList[i];
                if (!r_isLand[nb] && r_ocean_warmth_summer[nb] > 0.3) {
                    warmCoastSeeds.push(r);
                    break;
                }
            }
        }

        // BFS ~150km inland from warm coast seeds
        const maxHops = Math.max(1, Math.round(150 / avgEdgeKm));
        const warmDist = bfsLandDist(mesh, r_isLand, warmCoastSeeds);
        for (let r = 0; r < numRegions; r++) {
            if (warmDist[r] >= 0 && warmDist[r] <= maxHops) {
                const absLatDeg = Math.abs(r_lat[r]) / DEG;
                if (absLatDeg <= 23.5) {
                    zone[r] = ZONE_HO;
                }
            }
        }
    }

    // Count zone distribution after Stage A
    const zoneCountsA = { HO: 0, OC: 0, SC: 0, CO: 0, HC: 0 };
    for (let r = 0; r < numRegions; r++) {
        if (!r_isLand[r]) continue;
        if (zone[r] <= 0.05) zoneCountsA.HO++;
        else if (zone[r] <= 0.3) zoneCountsA.OC++;
        else if (zone[r] <= 0.55) zoneCountsA.SC++;
        else if (zone[r] <= 0.8) zoneCountsA.CO++;
        else zoneCountsA.HC++;
    }
    console.log(`[tempCont] After Stage A: HO=${zoneCountsA.HO} OC=${zoneCountsA.OC} SC=${zoneCountsA.SC} CO=${zoneCountsA.CO} HC=${zoneCountsA.HC}`);
    console.log(`[tempCont] Component stats: ${numComponents} landmasses, avgEdgeKm=${avgEdgeKm.toFixed(1)}`);
    for (let id = 0; id < numComponents; id++) {
        const areaKm2 = compSizes[id] * cellAreaKm2;
        if (areaKm2 > 1_000_000) {
            console.log(`[tempCont]   Landmass ${id}: ${(areaKm2/1e6).toFixed(1)}M km² | N: band35-70=${(bandArea_35_70_N[id]/1e6).toFixed(1)}M, >35=${(bandArea_above35_N[id]/1e6).toFixed(1)}M, EW=${ewWidthKmN[id].toFixed(0)}km | S: band35-70=${(bandArea_35_70_S[id]/1e6).toFixed(1)}M, >35=${(bandArea_above35_S[id]/1e6).toFixed(1)}M, EW=${ewWidthKmS[id].toFixed(0)}km`);
        }
    }

    // ── Stage A2: Subcontinental refinements ───────────────────────────────
    // The guide lists several conditions that erase or push back the
    // subcontinental zone.  We apply them as post-processing on zone >= SC.

    // (a) Per-latitude E-W width check: subcontinental must be >= 2000km
    //     wide at each latitude band, not just globally.  Reuse the
    //     per-component per-hemisphere lon-bin infrastructure at finer
    //     resolution (1° bins).
    {
        const SC_LON_BINS = 720;
        const SC_LAT_BAND = 2;
        const SC_NUM_LAT = Math.ceil(90 / SC_LAT_BAND); // 18 bands per hemisphere
        // Build per-component per-hemisphere per-lat-band lon occupancy
        // Index: [id * SC_NUM_LAT * SC_LON_BINS + latIdx * SC_LON_BINS + lonBin]
        const scLonBinsN = new Uint8Array(numComponents * SC_NUM_LAT * SC_LON_BINS);
        const scLonBinsS = new Uint8Array(numComponents * SC_NUM_LAT * SC_LON_BINS);

        for (let r = 0; r < numRegions; r++) {
            if (!r_isLand[r]) continue;
            const latDeg = r_lat[r] / DEG;
            const absLatDeg = Math.abs(latDeg);
            if (absLatDeg < 35) continue;
            const id = r_label[r];
            const latIdx = Math.min(SC_NUM_LAT - 1, Math.floor(absLatDeg / SC_LAT_BAND));
            const lonNorm = (r_lon[r] + Math.PI) / (2 * Math.PI);
            const lonBin = Math.min(SC_LON_BINS - 1, Math.floor(lonNorm * SC_LON_BINS));
            if (latDeg >= 0) {
                scLonBinsN[id * SC_NUM_LAT * SC_LON_BINS + latIdx * SC_LON_BINS + lonBin] = 1;
            } else {
                scLonBinsS[id * SC_NUM_LAT * SC_LON_BINS + latIdx * SC_LON_BINS + lonBin] = 1;
            }
        }

        // Compute per-lat-band E-W width
        const scBinRad = 2 * Math.PI / SC_LON_BINS;
        for (let r = 0; r < numRegions; r++) {
            if (zone[r] < ZONE_SC) continue; // only refine SC+
            const latDeg = r_lat[r] / DEG;
            const absLatDeg = Math.abs(latDeg);
            const id = r_label[r];
            const latIdx = Math.min(SC_NUM_LAT - 1, Math.floor(absLatDeg / SC_LAT_BAND));
            const bins = latDeg >= 0 ? scLonBinsN : scLonBinsS;
            const base = id * SC_NUM_LAT * SC_LON_BINS + latIdx * SC_LON_BINS;

            // Find largest gap to get span
            let occupied = 0;
            for (let b = 0; b < SC_LON_BINS; b++) {
                if (bins[base + b]) occupied++;
            }
            if (occupied < 2) {
                zone[r] = Math.min(zone[r], ZONE_OC);
                continue;
            }
            let maxGap = 0, gap = 0;
            for (let i = 0; i < SC_LON_BINS * 2; i++) {
                if (!bins[base + (i % SC_LON_BINS)]) {
                    gap++;
                    if (gap > maxGap) maxGap = gap;
                } else {
                    gap = 0;
                }
            }
            maxGap = Math.min(maxGap, SC_LON_BINS);
            const spanKm = (SC_LON_BINS - maxGap) * scBinRad * Math.cos(r_lat[r]) * 6371;
            if (spanKm < 2000) {
                zone[r] = Math.min(zone[r], ZONE_OC);
            }
        }
    }

    // (b) North/south coast shave: erase 175km of subcontinental+
    //     from north- and south-facing coasts in the mid-latitudes.
    //     For each cell, scan poleward and equatorward through latitude
    //     bands until hitting an empty band (ocean).  Use the same
    //     per-component lon-bin grid from (a) to check occupancy.
    //     We reuse scLonBinsN/S from the block above — but they were
    //     scoped.  Rebuild a simpler per-component lat-band occupancy.
    {
        const NS_LAT_BAND = 1; // 1° bands for fine resolution
        const NS_NUM_LAT = Math.ceil(90 / NS_LAT_BAND); // 90 bands per hemisphere
        const NS_LON_BINS = 360; // 1° lon bins

        // Per-component per-hemisphere: is there land at [latBand][lonBin]?
        const nsOccN = new Uint8Array(numComponents * NS_NUM_LAT * NS_LON_BINS);
        const nsOccS = new Uint8Array(numComponents * NS_NUM_LAT * NS_LON_BINS);

        for (let r = 0; r < numRegions; r++) {
            if (!r_isLand[r]) continue;
            const latDeg = r_lat[r] / DEG;
            const absLatDeg = Math.abs(latDeg);
            const id = r_label[r];
            const latIdx = Math.min(NS_NUM_LAT - 1, Math.floor(absLatDeg / NS_LAT_BAND));
            const lonNorm = (r_lon[r] + Math.PI) / (2 * Math.PI);
            const lonBin = Math.min(NS_LON_BINS - 1, Math.floor(lonNorm * NS_LON_BINS));
            if (latDeg >= 0) {
                nsOccN[id * NS_NUM_LAT * NS_LON_BINS + latIdx * NS_LON_BINS + lonBin] = 1;
            } else {
                nsOccS[id * NS_NUM_LAT * NS_LON_BINS + latIdx * NS_LON_BINS + lonBin] = 1;
            }
        }

        const nsShaveKm = 250;
        const latBandKm = NS_LAT_BAND * DEG * 6371; // km per lat band

        for (let r = 0; r < numRegions; r++) {
            if (zone[r] < ZONE_SC) continue;
            const latDeg = r_lat[r] / DEG;
            const absLatDeg = Math.abs(latDeg);
            if (absLatDeg < 35 || absLatDeg > 70) continue;

            const id = r_label[r];
            const latIdx = Math.min(NS_NUM_LAT - 1, Math.floor(absLatDeg / NS_LAT_BAND));
            const bins = latDeg >= 0 ? nsOccN : nsOccS;
            const lonNorm = (r_lon[r] + Math.PI) / (2 * Math.PI);
            const lonBin = Math.min(NS_LON_BINS - 1, Math.floor(lonNorm * NS_LON_BINS));

            // Scan equatorward (decreasing absLat): shave near the
            // equatorward coast at all latitudes in the band.
            // West-biased spread (-3 to +2) catches diagonal coasts.
            let equatorBands = 0;
            for (let li = latIdx - 1; li >= 0; li--) {
                const rowBase = id * NS_NUM_LAT * NS_LON_BINS + li * NS_LON_BINS;
                let hasOcean = false;
                for (let d = -3; d <= 2; d++) {
                    const lb = (lonBin + d + NS_LON_BINS) % NS_LON_BINS;
                    if (!bins[rowBase + lb]) { hasOcean = true; break; }
                }
                if (hasOcean) break;
                equatorBands++;
            }
            const equatorKm = equatorBands * latBandKm;

            // Scan poleward (increasing absLat): only shave below 60°
            // where actual N/S coasts exist.  Above 60° the guide says
            // to shave the equatorward side, not the poleward side.
            let polewardKm = 9999;
            if (absLatDeg < 60) {
                let polewardBands = 0;
                for (let li = latIdx + 1; li < NS_NUM_LAT; li++) {
                    const rowBase = id * NS_NUM_LAT * NS_LON_BINS + li * NS_LON_BINS;
                    let hasOcean = false;
                    for (let d = -3; d <= 2; d++) {
                        const lb = (lonBin + d + NS_LON_BINS) % NS_LON_BINS;
                        if (!bins[rowBase + lb]) { hasOcean = true; break; }
                    }
                    if (hasOcean) break;
                    polewardBands++;
                }
                polewardKm = polewardBands * latBandKm;
            }

            if (equatorKm < nsShaveKm || polewardKm < nsShaveKm) {
                zone[r] = Math.min(zone[r], ZONE_OC);
            }
        }
    }

    // ── Stage B: West coast shave (30-65° latitude) ─────────────────────────
    // For each land cell, scan westward from its longitude bin until hitting
    // an empty (ocean) bin at its latitude band.  The number of bins crossed
    // is the distance from the nearest west coast.  This handles irregular
    // coastlines naturally — bays and indentations create their own local
    // west coasts.

    const LAT_BAND_DEG = 5;
    const NUM_LAT_BANDS = Math.ceil(180 / LAT_BAND_DEG);

    // Fine-resolution lon bins for the shave (1° each = 360 bins)
    const SHAVE_LON_BINS = 720;
    const bandLonBins = new Uint8Array(numComponents * NUM_LAT_BANDS * SHAVE_LON_BINS);
    for (let r = 0; r < numRegions; r++) {
        if (!r_isLand[r]) continue;
        const absLatDeg = Math.abs(r_lat[r]) / DEG;
        if (absLatDeg < 30 || absLatDeg > 65) continue;
        const id = r_label[r];
        const latBand = Math.min(NUM_LAT_BANDS - 1, Math.floor(absLatDeg / LAT_BAND_DEG));
        const lonNorm = (r_lon[r] + Math.PI) / (2 * Math.PI);
        const lonBin = Math.min(SHAVE_LON_BINS - 1, Math.floor(lonNorm * SHAVE_LON_BINS));
        bandLonBins[id * NUM_LAT_BANDS * SHAVE_LON_BINS + latBand * SHAVE_LON_BINS + lonBin] = 1;
    }

    const shaveBinWidthRad = 2 * Math.PI / SHAVE_LON_BINS;

    for (let r = 0; r < numRegions; r++) {
        if (!r_isLand[r]) continue;
        const absLatDeg = Math.abs(r_lat[r]) / DEG;
        if (absLatDeg < 30 || absLatDeg > 65) continue;

        const id = r_label[r];
        const latBand = Math.min(NUM_LAT_BANDS - 1, Math.floor(absLatDeg / LAT_BAND_DEG));
        const base = id * NUM_LAT_BANDS * SHAVE_LON_BINS + latBand * SHAVE_LON_BINS;

        const lonNorm = (r_lon[r] + Math.PI) / (2 * Math.PI);
        const cellBin = Math.min(SHAVE_LON_BINS - 1, Math.floor(lonNorm * SHAVE_LON_BINS));

        // Walk westward (decreasing bin, wrapping) until hitting an empty bin
        let binsFromWest = 0;
        for (let step = 1; step < SHAVE_LON_BINS; step++) {
            const checkBin = (cellBin - step + SHAVE_LON_BINS) % SHAVE_LON_BINS;
            if (!bandLonBins[base + checkBin]) break; // hit ocean
            binsFromWest = step;
        }

        const distKm = binsFromWest * shaveBinWidthRad * Math.cos(r_lat[r]) * 6371;

        if (distKm < 400) {
            zone[r] = Math.min(zone[r], ZONE_OC);
        } else if (distKm < 2000) {
            zone[r] = Math.min(zone[r], ZONE_SC);
        } else if (distKm < 4000) {
            zone[r] = Math.min(zone[r], ZONE_CO);
        }
    }

    console.log(`[tempCont] Stage B (west shave) applied`);

    // ── Stage C: Small island override ──────────────────────────────────────

    for (let r = 0; r < numRegions; r++) {
        if (!r_isLand[r]) continue;
        const id = r_label[r];
        const areaKm2 = compSizes[id] * cellAreaKm2;
        if (areaKm2 < 50_000) {
            zone[r] = ZONE_HO;
        } else if (areaKm2 < 500_000) {
            zone[r] = Math.min(zone[r], ZONE_OC);
        }
    }

    // ── Stage D: East coast adjustment (Hypercontinental near east coast) ───

    // Identify east-coast land seeds
    const eastCoastSeeds = [];
    for (let r = 0; r < numRegions; r++) {
        if (!r_isLand[r]) continue;
        let oceanDirX = 0, oceanDirY = 0, oceanDirZ = 0;
        let hasOceanNb = false;
        const end = adjOffset[r + 1];
        for (let i = adjOffset[r]; i < end; i++) {
            const nb = adjList[i];
            if (!r_isLand[nb]) {
                hasOceanNb = true;
                oceanDirX += r_xyz[3 * nb] - r_xyz[3 * r];
                oceanDirY += r_xyz[3 * nb + 1] - r_xyz[3 * r + 1];
                oceanDirZ += r_xyz[3 * nb + 2] - r_xyz[3 * r + 2];
            }
        }
        if (!hasOceanNb) continue;
        const dotE = oceanDirX * r_eastX[r] + oceanDirY * r_eastY[r] + oceanDirZ * r_eastZ[r];
        const mag = Math.sqrt(oceanDirX*oceanDirX + oceanDirY*oceanDirY + oceanDirZ*oceanDirZ);
        const normDotE = mag > 1e-10 ? dotE / mag : 0;
        if (normDotE > 0.2) {
            eastCoastSeeds.push(r);
        }
    }

    const r_eastDist = bfsLandDist(mesh, r_isLand, eastCoastSeeds);

    // For hypercontinental cells near east coast: check ocean warmth to decide threshold
    for (let r = 0; r < numRegions; r++) {
        if (zone[r] < ZONE_HC || r_eastDist[r] < 0) continue;
        const distKm = r_eastDist[r] * avgEdgeKm;

        // Determine nearby ocean warmth: check ocean neighbors within a few hops
        let maxWarmth = 0;
        if (r_ocean_warmth_summer) {
            const end = adjOffset[r + 1];
            for (let i = adjOffset[r]; i < end; i++) {
                const nb = adjList[i];
                if (!r_isLand[nb]) {
                    maxWarmth = Math.max(maxWarmth, r_ocean_warmth_summer[nb]);
                }
            }
        }

        const threshold = maxWarmth > 0.3 ? 650 : 150;
        if (distKm < threshold) {
            zone[r] = ZONE_CO; // downgrade to Continental
        }
    }

    // ── Remove small zone patches ──────────────────────────────────────────
    // Small isolated pockets of lower zones (from N/S shave, width check,
    // etc.) create noisy artifacts.  Flood-fill each contiguous patch of
    // land cells with the same zone level; if a patch is smaller than a
    // minimum area, promote it to the most common neighbor zone.
    {
        const minPatchKm2 = 500_000; // ~500K km² minimum
        const minPatchCells = Math.max(5, Math.round(minPatchKm2 / cellAreaKm2));
        const patchLabel = new Int32Array(numRegions).fill(-1);
        const patchSizes = [];
        const patchZone = [];
        let nextPatch = 0;
        const pQueue = new Int32Array(numRegions);

        for (let r = 0; r < numRegions; r++) {
            if (!r_isLand[r] || patchLabel[r] >= 0) continue;
            const pid = nextPatch++;
            const z = zone[r];
            // Quantize to nearest zone step for comparison
            const zQ = Math.round(z * 4) / 4;
            patchZone.push(zQ);
            patchLabel[r] = pid;
            let qLen = 1, head = 0;
            pQueue[0] = r;
            let size = 0;
            while (head < qLen) {
                const cur = pQueue[head++];
                size++;
                const end = adjOffset[cur + 1];
                for (let i = adjOffset[cur]; i < end; i++) {
                    const nb = adjList[i];
                    if (!r_isLand[nb] || patchLabel[nb] >= 0) continue;
                    const nbQ = Math.round(zone[nb] * 4) / 4;
                    if (nbQ === zQ) {
                        patchLabel[nb] = pid;
                        pQueue[qLen++] = nb;
                    }
                }
            }
            patchSizes.push(size);
        }

        // For small patches, find the most common neighbor zone and promote
        for (let pid = 0; pid < nextPatch; pid++) {
            if (patchSizes[pid] >= minPatchCells) continue;
            // This is a small patch — find neighbor zones
            let bestZone = patchZone[pid];
            const neighborZoneCounts = {};
            // Scan all cells of this patch to find neighboring zones
            for (let r = 0; r < numRegions; r++) {
                if (patchLabel[r] !== pid) continue;
                const end = adjOffset[r + 1];
                for (let i = adjOffset[r]; i < end; i++) {
                    const nb = adjList[i];
                    if (!r_isLand[nb] || patchLabel[nb] === pid) continue;
                    const nbZ = Math.round(zone[nb] * 4) / 4;
                    neighborZoneCounts[nbZ] = (neighborZoneCounts[nbZ] || 0) + 1;
                }
            }
            // Pick the most common neighbor zone
            let maxCount = 0;
            for (const [z, count] of Object.entries(neighborZoneCounts)) {
                if (count > maxCount) {
                    maxCount = count;
                    bestZone = parseFloat(z);
                }
            }
            // Promote all cells in this patch
            for (let r = 0; r < numRegions; r++) {
                if (patchLabel[r] === pid) zone[r] = bestZone;
            }
        }
    }

    // ── Stage E: Gap prevention + minimum zone width ────────────────────────
    // Ensure no neighbor pair differs by more than one zone step (0.25).
    // Run enough passes that each zone gets at least ~100km of buffer
    // before the next zone appears (scale-invariant pass count).
    {
        const bufferPasses = Math.max(3, Math.round(100 / avgEdgeKm));
        for (let pass = 0; pass < bufferPasses; pass++) {
            for (let r = 0; r < numRegions; r++) {
                if (!r_isLand[r]) continue;
                const end = adjOffset[r + 1];
                for (let i = adjOffset[r]; i < end; i++) {
                    const nb = adjList[i];
                    if (!r_isLand[nb]) continue;
                    if (zone[r] - zone[nb] > 0.3) {
                        zone[r] = zone[nb] + 0.25;
                    }
                }
            }
        }
    }

    // Light smoothing for natural transitions (land only).
    // Temporarily set ocean to 0 for smoothing so it acts as a gentle
    // oceanic pull on coastal cells, then restore -1 for the viz layer.
    // Smooth ~200km to blend zone boundaries into natural gradients.
    // Set ocean to 0 during smoothing so it pulls coastal cells toward
    // oceanic values, then restore -1 for the viz layer.
    const contSmoothPasses = Math.max(2, Math.round(200 / avgEdgeKm));
    for (let r = 0; r < numRegions; r++) {
        if (!r_isLand[r]) zone[r] = 0;
    }
    smoothField(mesh, zone, contSmoothPasses);
    for (let r = 0; r < numRegions; r++) {
        if (!r_isLand[r]) {
            zone[r] = -1;
        } else {
            zone[r] = Math.max(0, Math.min(1, zone[r]));
        }
    }

    return zone;
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
            if (r_plateContinentality && r_plateContinentality[r] >= 0.95) continue;

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
export function computeTemperature(mesh, r_xyz, r_elevation, windResult, oceanResult, precipResult, temperatureOffset = 0, userClimate = {}) {
    const { greenhouse = 0, winterSeverity = 1, maritimeInfluence = 1, mountainChill = 1, seasonFactor = 1 } = userClimate;
    const numRegions = mesh.numRegions;
    const timing = [];

    const { r_lat, r_lon, r_isLand, r_continentality, r_plateContinentality, r_westness } = windResult;

    // Minimal smoothing: 1 pass just to blend cell-to-cell noise
    const smoothPasses = 1;

    const T_MIN = -45;
    const T_MAX = 45;
    const T_RANGE = T_MAX - T_MIN;

    const result = {};

    // Pre-compute constants shared across seasons
    const avgEdgeKm = (Math.PI * 6371) / Math.sqrt(numRegions);
    const oceanWarmthPasses = Math.max(4, Math.round(CLIMATE.TEMP_OCEAN_WARMTH_DIFFUSE_KM * maritimeInfluence / avgEdgeKm));
    const plateCont = r_plateContinentality || r_continentality;
    // Winter interior cooling is a seasonal-contrast effect: it must vanish on
    // a seasonless (0-tilt) world along with the swing itself.
    const effContWinterCool = CLIMATE.TEMP_CONT_WINTER_COOL_C * winterSeverity * seasonFactor;
    const effCoastalShiftC = CLIMATE.TEMP_COASTAL_WARMTH_SHIFT_C * maritimeInfluence;
    const effMoistLapse = CLIMATE.TEMP_MOIST_LAPSE_C_PER_KM * mountainChill;
    const effDryLapseExtra = CLIMATE.TEMP_DRY_LAPSE_EXTRA_C_PER_KM * mountainChill;
    // Greenhouse: thicker atmosphere warms uniformly, flattens the equator→pole
    // gradient (polar amplification), and softens winters slightly.
    const effPolewardRange = CLIMATE.TEMP_POLEWARD_RANGE_C * (1 - CLIMATE.TEMP_GH_GRADIENT_FRAC * greenhouse);
    const ghUniformC = CLIMATE.TEMP_GH_UNIFORM_C * greenhouse;
    const effWinterShare = CLIMATE.TEMP_SWING_WINTER_SHARE * (1 - CLIMATE.TEMP_GH_WINTER_LIFT * Math.max(0, greenhouse));

    // Compute zone-based temperature continentality (Stages A-E)
    const tCont0 = performance.now();
    const { r_eastX, r_eastY, r_eastZ, r_northX, r_northY, r_northZ,
            r_coastDistLand } = windResult;
    const r_tempCont = computeTempContinentality(
        mesh, r_xyz, r_isLand, r_lat, r_lon,
        r_eastX, r_eastY, r_eastZ, r_northX, r_northY, r_northZ,
        oceanResult.r_ocean_warmth_summer,
        r_coastDistLand,
        avgEdgeKm
    );
    timing.push({ stage: 'Temp: continentality zones', ms: performance.now() - tCont0 });

    // Both ITCZ lookups needed for estimating ITCZ seasonal contribution
    const itczLookupSummer = makeItczLookup(windResult.itczLons, windResult.itczLatsSummer);
    const itczLookupWinter = makeItczLookup(windResult.itczLons, windResult.itczLatsWinter);

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
        const coastalWarmth = diffuseOceanWarmth(mesh, r_oceanWarmth, r_isLand, plateCont, oceanWarmthPasses);

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
            const tropicalHW = CLIMATE.TEMP_TROPICAL_PLATEAU_DEG;  // flat plateau half-width (degrees)
            const maxDist = 90 - tropicalHW;

            // Actual ITCZ curve
            const itczLat = itczLookup(lon);
            const distItcz = Math.abs(lat - itczLat) / DEG;
            const tItcz = Math.max(0, distItcz - tropicalHW) / maxDist;
            const T_itcz = CLIMATE.TEMP_PEAK_C - effPolewardRange * Math.pow(tItcz, CLIMATE.TEMP_POLEWARD_EXP);

            // Flat reference curve (ITCZ at 5° in summer hemisphere)
            const flatItczLat = (name === 'summer' ? 5 : -5) * DEG * seasonFactor;
            const distFlat = Math.abs(lat - flatItczLat) / DEG;
            const tFlat = Math.max(0, distFlat - tropicalHW) / maxDist;
            const T_flat = CLIMATE.TEMP_PEAK_C - effPolewardRange * Math.pow(tFlat, CLIMATE.TEMP_POLEWARD_EXP);

            // Blend: ITCZ curve dominates tropics, flat curve dominates poles
            const absLatDeg = Math.abs(lat) / DEG;
            const blend = smoothstep(45, 90, absLatDeg);
            let T = T_itcz * (1 - blend) + T_flat * blend;

            // ── 2. Elevation lapse rate ──
            // Moisture-dependent: dry air cools at ~9.8 C/km (dry adiabatic),
            // saturated air at ~5 C/km (moist adiabatic) due to latent heat
            // release. Use precipitation as a moisture proxy to interpolate.
            const moisture = r_precip ? r_precip[r] : 0.5;
            const lapse = effMoistLapse + effDryLapseExtra * (1 - moisture); // 4.5 C/km (wet) to 9.3 C/km (dry)
            if (isLand && elev > 0) {
                T -= lapse * elevToHeightKm(elev);
            }

            // ── 5. Ocean current temperature influence ──
            if (!isLand && r_oceanWarmth && r_oceanSpeed) {
                // Direct ocean effect: warm/cold currents shift SST
                const warmth = r_oceanWarmth[r];
                const speed = r_oceanSpeed[r];
                T += warmth * Math.min(1, speed * 2) * CLIMATE.TEMP_SST_CURRENT_SHIFT_C;
            } else if (isLand) {
                // Coastal land: diffused ocean warmth fades with plate-based
                // continentality so the effect reaches further inland and
                // crosses continental shelves naturally
                const cw = coastalWarmth[r];
                if (Math.abs(cw) > 0.001) {
                    T += cw * (1 - smoothstep(0, 0.95, pCont)) * effCoastalShiftC;
                }
            }

            // ── 6. Precipitation / cloud cover moderation ──
            if (r_precip) {
                const p = r_precip[r];
                if (p > 0.5) {
                    // High precip → clouds → moderate toward latitude baseline
                    const mod = smoothstep(0.5, 1.0, p) * CLIMATE.TEMP_CLOUD_MOD_STRENGTH;
                    // Pull toward 0 (moderate extremes)
                    T *= (1 - mod);
                } else if (p < 0.3) {
                    // Low precip → clear skies → amplify extremes
                    const amp = smoothstep(0.3, 0.0, p) * CLIMATE.TEMP_CLEARSKY_AMP_STRENGTH;
                    T *= (1 + amp);
                }
            }

            // ── 7. Zone-based seasonal moderation ──
            // Continentality affects temperature in two ways:
            //   1. Seasonal swing: continental → bigger swing, oceanic → smaller
            //   2. Mean temperature offset: ocean thermal inertia warms oceanic
            //      zones relative to continental ones at the same latitude.
            //      This isn't symmetric — winters cool more than summers warm
            //      as you move continental (land loses heat faster than it gains).
            //
            // The swing is split 40% summer / 60% winter for continental zones
            // (winters drop more), and the oceanic warming offset moderates
            // temperatures year-round for low-continentality cells.
            {
                const distAnn = Math.abs(lat) / DEG;

                const tc = isLand ? r_tempCont[r] : 0;
                const tableAmplitude = lookupSwingAmplitude(distAnn, tc) * seasonFactor;

                // Estimate ITCZ seasonal contribution
                const sumItczLat = itczLookupSummer(lon);
                const winItczLat = itczLookupWinter(lon);
                const distSummer = Math.abs(lat - sumItczLat) / DEG;
                const distWinter = Math.abs(lat - winItczLat) / DEG;
                const tS = Math.max(0, distSummer - tropicalHW) / maxDist;
                const tW = Math.max(0, distWinter - tropicalHW) / maxDist;
                const T_summer = CLIMATE.TEMP_PEAK_C - effPolewardRange * Math.pow(tS, CLIMATE.TEMP_POLEWARD_EXP);
                const T_winter = CLIMATE.TEMP_PEAK_C - effPolewardRange * Math.pow(tW, CLIMATE.TEMP_POLEWARD_EXP);
                const itczAmplitude = Math.abs(T_summer - T_winter) / 2;

                const extraAmplitude = Math.max(0, tableAmplitude - itczAmplitude) * CLIMATE.TEMP_EXTRA_SWING_FACTOR;

                const isLocalSummer = (name === 'summer') ? (lat >= 0) : (lat < 0);
                // Asymmetric split: continental winters deviate further below
                // the annual mean than summers rise above it (radiative cooling
                // under winter highs). TEMP_SWING_WINTER_SHARE = 0.5 → symmetric;
                // 0.6 → winter gets 60% of the total extra swing.
                const wShare = effWinterShare;
                T += isLocalSummer
                    ? extraAmplitude * 2 * (1 - wShare)
                    : -extraAmplitude * 2 * wShare;

                // Targeted continental winter cooling: interiors radiate heat away
                // in the cold season, deepening winters (coldest month below 0 °C
                // → D climates) WITHOUT warming summers — so it fixes the
                // continental-D deficit that a global swing multiplier can't reach
                // without side effects. Scales with isotropic continentality, which
                // is near-zero on narrow landmasses, so it leaves the Southern
                // Hemisphere (no large interiors) untouched. Default 0 → no-op.
                //
                // West-coast relief: maritime WEST coasts in the westerly belt
                // (onshore ocean air + warm currents) stay oceanic (Cfb) with mild
                // winters, so the cooling is scaled down there — this is what keeps
                // Western Europe / Pacific NW from tipping into continental D while
                // interiors and east coasts still do. Default relief 0 → no-op.
                if (isLand && !isLocalSummer) {
                    const westRelief = r_westness
                        ? 1 - Math.max(0, r_westness[r]) * CLIMATE.TEMP_WINTER_COOL_WEST_RELIEF
                        : 1;
                    T -= cont * effContWinterCool * westRelief;
                }

                // Oceanic warming offset: ocean thermal inertia keeps oceanic
                // zones warmer than their latitude alone suggests.  Strongest
                // at mid-high latitudes, zero in tropics.
                if (isLand) {
                    const oceanicFrac = Math.max(0, 1 - tc * 2); // 1 at HO, 0.5 at OC, 0 at SC+
                    const latFactor = smoothstep(15, 50, distAnn);
                    const warmingOffset = oceanicFrac * latFactor * CLIMATE.TEMP_OCEANIC_WARMING_MAX_C; // up to 5°C warmer
                    T += warmingOffset;
                }
            }

            T += temperatureOffset + ghUniformC;
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
    result.r_tempContinentality = r_tempCont;
    return result;
}
