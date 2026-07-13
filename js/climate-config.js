// Climate simulation tunable parameters.
// Mirrors the terrain-config.js pattern, but exported as a MUTABLE object so
// the automated tuning suite (tuning/climate/) can sweep values in-process.
// The browser app always runs with the defaults below.
//
// Values are read at runtime inside the compute functions (never destructured
// at module scope), so setClimateParams() takes effect on the next compute.
//
// Naming: WIND_* (wind.js), TEMP_* (temperature.js), PRECIP_* (precipitation.js),
// HEUR_* (heuristic-precip.js). Units are in the name where meaningful.

export const CLIMATE_DEFAULTS = Object.freeze({
    // ── Wind: ITCZ tracking ──
    WIND_ITCZ_LAND_BOOST_MAX: 0.5817,        // max land thermal boost vs solar score
    WIND_ITCZ_ANCHOR_FACTOR: 0.3285,         // winter-hemisphere land anchoring strength
    WIND_ITCZ_CLAMP_DEG: 20.2698,              // hard clamp on ITCZ latitude excursion

    // ── Wind: pressure bands ──
    WIND_ITCZ_LOW_DEPTH_HPA: 8.3369,          // depth of equatorial (ITCZ) low
    WIND_ITCZ_LOW_WIDTH_DEG: 8.8036,           // gaussian sigma of ITCZ low
    WIND_SUBTROP_HIGH_LAT_DEG: 31.268,        // base latitude of subtropical highs
    WIND_SUBTROP_SEASONAL_SHIFT_DEG: 8.0069,   // seasonal migration of subtropical highs
    WIND_SUBTROP_HIGH_STRENGTH_HPA: 11.891,   // peak strength of subtropical highs
    WIND_SUBTROP_HIGH_WIDTH_DEG: 13.652,      // gaussian sigma of subtropical highs
    WIND_SUBTROP_LAND_WEAKENING: 0.3431,     // fractional weakening over continental land
    WIND_SUBPOLAR_LOW_DEPTH_HPA: 12.1468,      // depth of subpolar lows
    WIND_SUBPOLAR_LOW_LAT_DEG: 54.5814,        // latitude of subpolar lows
    WIND_SUBPOLAR_LOW_WIDTH_DEG: 5.217,      // gaussian sigma of subpolar lows
    WIND_POLAR_HIGH_STRENGTH_HPA: 3.6409,      // strength of polar highs

    // ── Wind: land-sea thermal contrast ──
    WIND_SUMMER_THERMAL_LOW_HPA: 15.4478,      // summer thermal low over hot interiors (monsoon driver)
    WIND_WINTER_THERMAL_HIGH_HPA: 17.6062,     // winter thermal high over cold continents (Siberian high)
    WIND_CONT_RANGE_KM: 2476.1541,             // coast distance at which continentality saturates

    // ── Wind: Coriolis / friction ──
    WIND_GEOSTROPHIC_MAX_ANGLE_DEG: 68.4344,   // max geostrophic deflection from PGF direction
    WIND_FRICTION_BACK_ANGLE_DEG: 19.8948,     // surface friction turning back toward low pressure

    // ── Temperature: base curve ──
    TEMP_PEAK_C: 27.7866,                      // sea-level temp at thermal equator plateau
    TEMP_POLEWARD_RANGE_C: 48.0373,            // total drop from tropical plateau edge to pole
    TEMP_POLEWARD_EXP: 1.593,               // exponent of cooling curve vs normalized ITCZ distance
    TEMP_TROPICAL_PLATEAU_DEG: 12.3597,        // degrees from ITCZ where temp stays at peak

    // ── Temperature: lapse rate ──
    TEMP_MOIST_LAPSE_C_PER_KM: 3.5,       // lapse rate at full moisture
    TEMP_DRY_LAPSE_EXTRA_C_PER_KM: 3.4114,   // added lapse when fully dry (dry = moist + extra)

    // ── Temperature: ocean current warmth ──
    TEMP_OCEAN_WARMTH_DIFFUSE_KM: 443.6723,   // physical reach of ocean-warmth diffusion onto land
    TEMP_SST_CURRENT_SHIFT_C: 8.8086,         // max SST shift from warm/cold currents
    TEMP_COASTAL_WARMTH_SHIFT_C: 17.9628,      // max coastal land temp shift from diffused warmth

    // ── Temperature: seasonal swing ──
    TEMP_SWING_SCALE: 1.0723,                // global multiplier on the SWING_TABLE amplitudes
    TEMP_EXTRA_SWING_FACTOR: 0.8005,         // fraction of (table − ITCZ-implied) swing applied
    TEMP_SWING_WINTER_SHARE: 0.7055,         // fraction of extra swing taken by winter (0.5 = symmetric)
    TEMP_CONT_WINTER_COOL_C: 12.6435,             // extra °C of local-winter cooling per unit continentality (0 = off)
    TEMP_WINTER_COOL_WEST_RELIEF: 0.6,        // fraction the winter cooling is reduced on maritime WEST coasts (0 = off)
    TEMP_OCEANIC_WARMING_MAX_C: 2,        // max year-round warming for oceanic mid/high-lat land

    // ── Temperature: cloud moderation ──
    TEMP_CLOUD_MOD_STRENGTH: 0.05,        // max pull toward 0 under full cloud cover
    TEMP_CLEARSKY_AMP_STRENGTH: 0.2745,     // max amplification of extremes under clear skies

    // ── Temperature: greenhouse (user Greenhouse slider g ∈ [−1,1]; all three
    // terms are exactly inert at g = 0, so the optimizer never needs them) ──
    TEMP_GH_UNIFORM_C: 10,                   // uniform warming per unit g
    TEMP_GH_GRADIENT_FRAC: 0.35,             // equator→pole range shrink at g=1 (polar amplification)
    TEMP_GH_WINTER_LIFT: 0.15,               // winter-share reduction at g=1 (winters warm faster)

    // ── Precipitation: moisture & advection ──
    PRECIP_OCEAN_MOISTURE_BASE: 0.4508,      // base moisture of ocean cells
    PRECIP_ADVECT_FLAT_SURVIVAL: 0.8901,    // moisture surviving full advection over flat land
    PRECIP_ADVECT_REACH_KM: 3961.314,         // moisture advection physical reach
    PRECIP_ELEV_DEPLETION_PER_KM: 0.9906,   // moisture depletion per km of terrain rise

    // ── Precipitation: ITCZ & convergence ──
    PRECIP_ITCZ_WIDTH_DEG: 17.6788,            // half-width of ITCZ uplift band
    PRECIP_ITCZ_CORE_BOOST: 1,          // core convection multiplier
    PRECIP_ITCZ_ADDITIVE: 0.4727,            // convective rain added regardless of advected moisture
    PRECIP_CONV_MULT_BOOST: 0.9443,          // multiplicative boost at full frontal convergence
    PRECIP_CONV_ADD_FRAC: 0.3532,            // additive boost fraction at full convergence

    // ── Precipitation: ocean-current coastal modulation ──
    PRECIP_COLD_CURRENT_SUPPRESS: 0.3606,      // cold-current coastal rain suppression strength (0 = off)
    PRECIP_WARM_CURRENT_BOOST: 0.0267,         // warm-current coastal rain boost strength (0 = off)

    // ── Precipitation: orographic & rain shadow ──
    PRECIP_ORO_UPLIFT_ADD: 1.013,           // max additive windward rain
    PRECIP_ORO_SHADOW_MAX_SUPPRESS: 0.9186, // max local foehn suppression
    PRECIP_RS_SHADOW_PROP_KM: 3363.1799,       // downwind shadow propagation distance
    PRECIP_RS_APPLY_STRENGTH_SCALE: 2.4002, // propagated shadow → suppression multiplier
    PRECIP_RS_APPLY_MAX_SUPPRESS: 0.9782,   // max suppression in propagated shadow
    PRECIP_RS_APPLY_WINDWARD_ADD: 1.7675,    // additive windward boost from propagated field

    // ── Precipitation: subtropical high / Mediterranean / monsoon ──
    PRECIP_SUBTROP_CENTER_SUMMER_DEG: 37.738, // suppression band center in local summer
    PRECIP_SUBTROP_CENTER_WINTER_DEG: 24.5392, // suppression band center in local winter
    PRECIP_SUBTROP_WIDTH_SUMMER_DEG: 8,  // suppression half-width in local summer
    PRECIP_SUBTROP_WIDTH_WINTER_DEG: 15.8227,  // suppression half-width in local winter
    PRECIP_SUBTROP_PEAK_SUMMER: 0.4777,     // peak summer suppression (Mediterranean dry summer)
    PRECIP_SUBTROP_PEAK_WINTER: 0.5,     // peak winter suppression
    PRECIP_MONSOON_RELIEF_MAX: 0.8247,       // max reduction of subtropical drying on monsoon coasts
    PRECIP_MONSOON_ADD: 0.0325,                    // summer monsoon moisture injection strength (0 = off)
    PRECIP_SUBTROP_EAST_RELIEF: 0.5,           // fraction subtropical drying is reduced on EAST coasts (0 = off)
    PRECIP_MONSOON_REACH_DEG: 25.19,            // degrees poleward of the summer ITCZ the monsoon reaches

    // ── Precipitation: polar / continental / cutoffs ──
    PRECIP_POLAR_BASE_ADD: 0.25,          // baseline polar-front precip
    PRECIP_POLAR_COASTAL_ADD: 0.203,       // coastal polar-front enhancement
    PRECIP_CONT_DRYNESS: 0.8,            // max continentality drying (complex model)
    PRECIP_COAST_CUTOFF_START_KM: 2060.0355,   // distance where hard moisture cutoff begins
    PRECIP_COAST_CUTOFF_END_KM: 3161.3364,     // distance of near-total moisture loss

    // ── Precipitation: blending & interior cap ──
    PRECIP_MODEL_BLEND: 0.3433,              // weight of complex model (1 − w on heuristic)
    PRECIP_CONT_CAP_FADE_START: 0.6231,      // continentality where interior precip cap fades in
    PRECIP_CONT_CAP_MAX_REDUCTION: 0.884,  // interior cap reduction at continentality 1
    PRECIP_SEASON_CONTRAST: 1.7754,          // wet/dry season contrast exaggeration (1 = off; never compress)

    // ── Heuristic zonal precip curve ──
    HEUR_ZONAL_TRADE_VALUE: 0.363,         // precip level entering the trades/desert belt
    HEUR_ZONAL_DESERT_MIN: 0.0715,          // desert-belt minimum precip
    HEUR_ZONAL_DESERT_END_DEG: 22,        // ITCZ-distance where desert minimum is reached
    HEUR_ZONAL_DRY_POLEWARD_DEG: 28,      // poleward edge of desert belt (recovery start)
    HEUR_ZONAL_WESTERLY_PEAK: 0.516,        // mid-latitude westerlies precip peak
    HEUR_ZONAL_WESTERLY_PEAK_DEG: 47.515,     // ITCZ-distance of the westerly peak
    HEUR_ZONAL_POLAR_MIN: 0.1381,            // polar desert precip at 90°

    // ── Köppen classification proxies ──
    // The classifier approximates monthly Köppen criteria from 2-season data;
    // these mapping heuristics are tunable (the standard thresholds like 18°C
    // tropical or the B aridity formula are NOT — those stay fixed).
    KOPPEN_PRECIP_SCALE_MM: 838.5683,         // normalized precip 1.0 → mm per half-year (seasonal/subtype tests)
    KOPPEN_ARIDITY_SCALE: 1.0079,           // multiplier on annual precip for the B aridity test only (>1 = fewer deserts)
    KOPPEN_EAST_COAST_WET: 2,            // extra aridity-precip boost on east coasts (0 = off; keeps humid subtropics out of B)
    KOPPEN_SHOULDER_FRAC: 2.4,            // months-from-peak proxy for shoulder-season temp
    KOPPEN_DRIEST_FRAC_BASE: 0.8,        // driest month ≈ base × half-year average (equal seasons)
    KOPPEN_DRIEST_FRAC_DROP: 0.15,        // reduction of that fraction at strong seasonal contrast
    KOPPEN_S_SUMMER_MAX_MM: 74.9679,           // dry-summer (s) monthly precip ceiling
    KOPPEN_S_RATIO: 1.8019,                    // s requires summer month < winter month / ratio
    KOPPEN_W_RATIO: 3.5062,                    // w requires winter month < summer month / ratio
    KOPPEN_AF_DRY_MIN_MM: 74.7163,             // Af requires driest month above this

    // ── Heuristic modifiers ──
    HEUR_ITCZ_SHIFT_DAMPEN: 0.2688,          // fraction of ITCZ displacement used (monsoon swing)
    HEUR_SEASON_SUMMER_MOD: 1.1377,          // base summer precip multiplier
    HEUR_SEASON_WINTER_MOD: 0.8506,          // base winter precip multiplier
    HEUR_MED_SUPPRESS_BASE: 0.0699,         // summer subtropical suppression, inland
    HEUR_MED_WESTCOAST_BONUS: 0.1403,       // extra suppression on west coasts (negative on east)
    HEUR_CONT_DRYNESS: 0.7586,              // max continentality drying (heuristic model)
    HEUR_ORO_UPLIFT_MAX: 0.8841,             // max windward orographic boost
    HEUR_ORO_SHADOW_MAX: 0.8685,             // max leeward orographic suppression
});

// Live values — mutated by setClimateParams(), read by the climate modules.
export const CLIMATE = { ...CLIMATE_DEFAULTS };

/** Override a subset of climate parameters (unknown keys throw). */
export function setClimateParams(overrides) {
    for (const [k, v] of Object.entries(overrides)) {
        if (!(k in CLIMATE_DEFAULTS)) throw new Error(`Unknown climate param: ${k}`);
        if (typeof v !== 'number' || !isFinite(v)) throw new Error(`Invalid value for ${k}: ${v}`);
        CLIMATE[k] = v;
    }
}

/** Restore all climate parameters to their defaults. */
export function resetClimateParams() {
    Object.assign(CLIMATE, CLIMATE_DEFAULTS);
}
