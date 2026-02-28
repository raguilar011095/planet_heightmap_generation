// Köppen climate classification using the "worldbuilding pasta" band-based
// methodology.  Two-season (summer/winter) data is used as a proxy for
// warmest/coldest month values.
//
// Approach:
//   Step 1 – Temperature bands  (tropical → temperate → continental → tundra → ice cap)
//   Step 2 – Arid zones (B)     dry in both seasons → desert core + steppe fringe
//   Step 3 – Precipitation subtypes within each band (A / C / D details)
//
// IMPORTANT: The simulation labels "summer" and "winter" are NH-centric
// (NH summer = June-Aug, NH winter = Dec-Feb).  For each cell we determine
// the LOCAL warm/cold season from temperature and use that to assign the
// correct precipitation pattern (s/w/f).  Without this, Mediterranean (Cs)
// and monsoon (Cw/Dw) climates are hemisphere-flipped.

/**
 * Köppen class definitions: ID → { code, name, color [r,g,b] 0-1 }.
 */
export const KOPPEN_CLASSES = [
    { code: 'Ocean',  name: 'Ocean',                              color: [0.29, 0.44, 0.65] },  // #4a6fa5
    { code: 'Af',     name: 'Tropical rainforest',                color: [0.00, 0.00, 1.00] },  // #0000FF
    { code: 'Am',     name: 'Tropical monsoon',                   color: [0.00, 0.47, 1.00] },  // #0077FF
    { code: 'Aw',     name: 'Tropical savanna',                   color: [0.27, 0.67, 0.98] },  // #46AAFA
    { code: 'BWh',    name: 'Hot desert',                         color: [1.00, 0.00, 0.00] },  // #FF0000
    { code: 'BWk',    name: 'Cold desert',                        color: [1.00, 0.59, 0.59] },  // #FF9696
    { code: 'BSh',    name: 'Hot steppe',                         color: [0.96, 0.65, 0.00] },  // #F5A500
    { code: 'BSk',    name: 'Cold steppe',                        color: [1.00, 0.86, 0.39] },  // #FFDB63
    { code: 'Cfa',    name: 'Humid subtropical',                  color: [0.78, 1.00, 0.31] },  // #C8FF50
    { code: 'Cfb',    name: 'Oceanic',                            color: [0.39, 1.00, 0.31] },  // #64FF50
    { code: 'Cfc',    name: 'Subpolar oceanic',                   color: [0.20, 0.78, 0.00] },  // #32C800
    { code: 'Csa',    name: 'Hot-summer Mediterranean',           color: [1.00, 1.00, 0.00] },  // #FFFF00
    { code: 'Csb',    name: 'Warm-summer Mediterranean',          color: [0.78, 0.78, 0.00] },  // #C8C800
    { code: 'Csc',    name: 'Cold-summer Mediterranean',          color: [0.59, 0.59, 0.00] },  // #969600
    { code: 'Cwa',    name: 'Humid subtropical (monsoon)',         color: [0.59, 1.00, 0.59] },  // #96FF96
    { code: 'Cwb',    name: 'Subtropical highland',               color: [0.39, 0.78, 0.39] },  // #63C764
    { code: 'Cwc',    name: 'Cold subtropical highland',          color: [0.20, 0.59, 0.20] },  // #329633
    { code: 'Dfa',    name: 'Hot-summer continental',             color: [0.00, 1.00, 1.00] },  // #00FFFF
    { code: 'Dfb',    name: 'Warm-summer continental',            color: [0.22, 0.78, 1.00] },  // #37C8FF
    { code: 'Dfc',    name: 'Subarctic',                          color: [0.00, 0.49, 0.49] },  // #007D7D
    { code: 'Dfd',    name: 'Extremely cold subarctic',           color: [0.00, 0.27, 0.37] },  // #00465F
    { code: 'Dsa',    name: 'Hot-summer continental (dry summer)', color: [0.90, 0.50, 1.00] },  // #E680FF
    { code: 'Dsb',    name: 'Warm-summer continental (dry summer)', color: [0.70, 0.35, 0.85] },  // #B359D9
    { code: 'Dsc',    name: 'Subarctic (dry summer)',              color: [0.50, 0.20, 0.65] },  // #8033A6
    { code: 'Dsd',    name: 'Extremely cold subarctic (dry summer)', color: [0.35, 0.10, 0.45] },  // #591A73
    { code: 'Dwa',    name: 'Hot-summer continental (monsoon)',    color: [0.67, 0.69, 1.00] },  // #ABB1FF
    { code: 'Dwb',    name: 'Warm-summer continental (monsoon)',   color: [0.43, 0.47, 0.78] },  // #6E77C8
    { code: 'Dwc',    name: 'Subarctic (monsoon)',                color: [0.29, 0.31, 0.78] },  // #4A50C8
    { code: 'Dwd',    name: 'Extremely cold subarctic (monsoon)', color: [0.20, 0.00, 0.53] },  // #320087
    { code: 'ET',     name: 'Tundra',                             color: [0.70, 0.70, 0.70] },  // #B2B2B2
    { code: 'EF',     name: 'Ice cap',                            color: [0.41, 0.41, 0.41] },  // #686868
];

// Lookup table: KOPPEN_CLASSES code → ID (built once at import time)
const CODE_TO_ID = {};
KOPPEN_CLASSES.forEach((c, i) => { CODE_TO_ID[c.code] = i; });

/**
 * Classify each region into a Köppen climate type using the worldbuilding-
 * pasta band-based methodology.
 *
 * @param {object}       mesh         - SphereMesh
 * @param {Float32Array}  r_elevation  - per-region elevation (<=0 = ocean)
 * @param {object}        tempResult   - { r_temperature_summer, r_temperature_winter } (0-1 → -45..+45 C)
 * @param {object}        precipResult - { r_precip_summer, r_precip_winter } (0-1 p95-normalized)
 * @returns {Uint8Array}  r_koppen     - per-region class ID (index into KOPPEN_CLASSES)
 */
export function classifyKoppen(mesh, r_elevation, tempResult, precipResult) {
    const n = mesh.numRegions;
    const r_koppen = new Uint8Array(n);

    const tSummer = tempResult.r_temperature_summer;
    const tWinter = tempResult.r_temperature_winter;
    const pSummer = precipResult.r_precip_summer;
    const pWinter = precipResult.r_precip_winter;

    for (let r = 0; r < n; r++) {
        // ── Ocean ──
        if (r_elevation[r] <= 0) {
            r_koppen[r] = 0;
            continue;
        }

        // ── Convert normalised values to physical units ──
        // Ts/Tw are NH summer/winter proxies — NOT necessarily local warm/cold
        const Ts = -45 + Math.max(0, Math.min(1, tSummer[r])) * 90;
        const Tw = -45 + Math.max(0, Math.min(1, tWinter[r])) * 90;
        const Thot  = Math.max(Ts, Tw);   // warmest month proxy (°C)
        const Tcold = Math.min(Ts, Tw);    // coldest month proxy (°C)
        const Tann  = (Ts + Tw) / 2;

        // "Shoulder-month" temperature: approximate the temp 2 months before
        // peak summer.  With only 2 seasons we interpolate 2/6 of the way from
        // peak toward cold.  Used for the humid-continental / subarctic split
        // and for the tempLetter 'b' criterion (4+ months >= 10°C).
        const Tshoulder = Thot - (Thot - Tcold) * (2 / 6);

        // ── Hemisphere-aware local seasons ──
        // Determine which simulation season is this cell's LOCAL warm season.
        // NH cells: sim summer = local summer.  SH cells: sim winter = local summer.
        const localSummerIsSim = Ts >= Tw;

        // Precipitation: each season value ∈ [0,1] represents ~6 months.
        // Scale to approximate mm for that half-year.
        const Ps = Math.max(0, pSummer[r]) * 1000;   // NH summer half-year mm
        const Pw = Math.max(0, pWinter[r]) * 1000;    // NH winter half-year mm
        const Pann = Ps + Pw;                          // annual mm

        // Local summer/winter precipitation (hemisphere-corrected)
        const PsummerLocal = localSummerIsSim ? Ps : Pw;
        const PwinterLocal = localSummerIsSim ? Pw : Ps;
        const PsMonthLocal = PsummerLocal / 6;   // avg monthly precip in local summer
        const PwMonthLocal = PwinterLocal / 6;    // avg monthly precip in local winter
        const Pdry = Math.min(PsMonthLocal, PwMonthLocal);

        // ================================================================
        //  STEP 1 – TEMPERATURE BANDS
        // ================================================================
        // Band codes: 'A' tropical, 'C' temperate, 'D' continental,
        //             'ET' tundra, 'EF' ice cap
        // Sub-bands for temperate: 'hotSummer' (>=22°C) vs 'coolSummer'
        // Sub-bands for continental: 'humidCont' (Tshoulder>=10) vs 'subarctic'

        let band;
        let tempSubBand = '';    // 'hotSummer'|'coolSummer' for C; 'humidCont'|'subarctic' for D

        if (Thot < 0) {
            // Ice cap: warmest month < 0°C
            band = 'EF';
        } else if (Thot < 10) {
            // Tundra: warmest month 0-10°C
            band = 'ET';
        } else if (Tcold >= 18) {
            // Tropical: coldest month >= 18°C
            band = 'A';
        } else if (Tcold >= 0) {
            // Temperate: coldest month 0-18°C AND warmest >= 10°C
            band = 'C';
            tempSubBand = Thot >= 22 ? 'hotSummer' : 'coolSummer';
        } else {
            // Continental: coldest month < 0°C AND warmest >= 10°C
            band = 'D';
            tempSubBand = Tshoulder >= 10 ? 'humidCont' : 'subarctic';
        }

        // ── Short-circuit polar types ──
        if (band === 'EF') { r_koppen[r] = CODE_TO_ID['EF']; continue; }
        if (band === 'ET') { r_koppen[r] = CODE_TO_ID['ET']; continue; }

        // ================================================================
        //  STEP 2 – ARID ZONES (B)
        // ================================================================
        // The blog approach: areas "dry in both seasons" become desert by
        // default, with steppe as a transition on the edges.
        //
        // We use the standard Köppen aridity threshold (which encodes the
        // idea of evapotranspiration exceeding precipitation) to decide B,
        // then split desert vs steppe.
        //
        // h/k is determined by mean annual temperature (standard Köppen):
        //   Tann >= 18°C → hot (h)
        //   Tann <  18°C → cold (k)
        //
        // summerFrac uses LOCAL warm-season precipitation (hemisphere-corrected)
        // because the threshold encodes evapotranspiration which peaks in
        // the warm season regardless of hemisphere.

        let Pthresh;
        const summerFrac = Pann > 0 ? PsummerLocal / Pann : 0.5;
        if (summerFrac >= 0.7) {
            Pthresh = 20 * Tann + 280;
        } else if (summerFrac <= 0.3) {
            Pthresh = 20 * Tann;
        } else {
            Pthresh = 20 * Tann + 140;
        }
        Pthresh = Math.max(0, Pthresh);

        if (Pann < Pthresh) {
            const isHot = Tann >= 18;  // standard Köppen: h if mean annual temp >= 18°C
            if (Pann < Pthresh * 0.5) {
                // Desert
                r_koppen[r] = isHot ? CODE_TO_ID['BWh'] : CODE_TO_ID['BWk'];
            } else {
                // Steppe (transition fringe)
                r_koppen[r] = isHot ? CODE_TO_ID['BSh'] : CODE_TO_ID['BSk'];
            }
            continue;
        }

        // ================================================================
        //  STEP 3 – PRECIPITATION SUBTYPES WITHIN EACH BAND
        // ================================================================

        // ── Determine s / w / f precipitation pattern ──
        // All comparisons use LOCAL summer/winter so the pattern is correct
        // in both hemispheres.
        // Our "monthly" values are 6-month averages, not individual months —
        // this smooths the driest/wettest month contrast, so thresholds are
        // relaxed vs. standard Köppen (which uses actual monthly extremes).
        // s  = dry local summer:  summer month < 50mm AND < 1/2 winter month
        // w  = dry local winter:  winter month < 1/10 summer month
        // f  = no dry season
        let precipPattern;
        const localSummerDrier = PsummerLocal < PwinterLocal;
        if (localSummerDrier && PsMonthLocal < 50 && PsMonthLocal < PwMonthLocal / 2) {
            precipPattern = 's';
        } else if (!localSummerDrier && PwMonthLocal < PsMonthLocal / 10) {
            precipPattern = 'w';
        } else {
            precipPattern = 'f';
        }

        // ── Determine temperature sub-letter (a / b / c / d) ──
        // a: warmest month >= 22°C
        // b: warmest < 22°C but 4+ months >= 10°C  (proxy: Tshoulder >= 10°C)
        // c: fewer than 4 months >= 10°C, coldest >= −38°C
        // d: coldest < −38°C  (extreme continental, only for D)
        let tempLetter;
        if (Thot >= 22) {
            tempLetter = 'a';
        } else if (Tshoulder >= 10) {
            tempLetter = 'b';
        } else if (Tcold >= -38) {
            tempLetter = 'c';
        } else {
            tempLetter = 'd';
        }

        // ── Band A: Tropical ──
        if (band === 'A') {
            // Blog approach:
            //   very wet both seasons       → Af (tropical rainforest)
            //   wet both seasons             → Am (tropical monsoon)
            //   wet one season, dry other    → Aw (tropical savanna)
            //
            // Translated with thresholds:
            //   Af: driest month >= 60 mm
            //   Am: Pann >= 25*(100 - Pdry)  (i.e. enough total rain to sustain forest
            //       despite a short dry spell)
            //   Aw: everything else
            if (Pdry >= 60) {
                r_koppen[r] = CODE_TO_ID['Af'];
            } else if (Pann >= 25 * (100 - Pdry)) {
                r_koppen[r] = CODE_TO_ID['Am'];
            } else {
                r_koppen[r] = CODE_TO_ID['Aw'];
            }
            continue;
        }

        // ── Band C: Temperate ──
        if (band === 'C') {
            // Blog approach:
            //   dry local summer → Mediterranean (Cs)
            //   remaining hot-summer → humid subtropical (Cfa / Cwa)
            //   remaining cool-summer → oceanic (Cfb / Cwb / Cfc / Cwc)
            const code = 'C' + precipPattern + tempLetter;
            const id = CODE_TO_ID[code];
            if (id !== undefined) {
                r_koppen[r] = id;
            } else {
                r_koppen[r] = CODE_TO_ID['Cfb'];
            }
            continue;
        }

        // ── Band D: Continental ──
        if (band === 'D') {
            // Blog approach:
            //   humid continental (Tshoulder >= 10°C) = Dfa/Dfb/Dsa/Dsb/Dwa/Dwb
            //   subarctic (Tshoulder < 10°C) = Dfc/Dfd/Dsc/Dsd/Dwc/Dwd
            //
            // Ds zones appear near Mediterranean regions; Dw zones appear
            // near regions with strong monsoon effect (far ITCZ excursion).
            const code = 'D' + precipPattern + tempLetter;
            const id = CODE_TO_ID[code];
            if (id !== undefined) {
                r_koppen[r] = id;
            } else {
                const fallback = 'Df' + tempLetter;
                r_koppen[r] = CODE_TO_ID[fallback] || CODE_TO_ID['Dfc'];
            }
            continue;
        }
    }

    return r_koppen;
}
