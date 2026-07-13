/**
 * Tuning ranges for every climate parameter in js/climate-config.js.
 * `high: true` marks parameters judged highest-impact for matching Earth's
 * Köppen zones — the optimizer's default subset.
 *
 * Ranges are deliberately conservative: wide enough to explore, narrow enough
 * that every value in range produces a *plausible* planet (this suite tunes
 * for Earth-likeness, but the parameters ship to the procedural generator too).
 */

import { CLIMATE_DEFAULTS } from '../../js/climate-config.js';

export const PARAM_SPACE = {
    // ── Wind ──
    WIND_ITCZ_LAND_BOOST_MAX:         { min: 0.3,  max: 2.0,  high: true },
    WIND_ITCZ_ANCHOR_FACTOR:          { min: 0.1,  max: 0.8 },
    WIND_ITCZ_CLAMP_DEG:              { min: 20,   max: 40 },
    WIND_ITCZ_LOW_DEPTH_HPA:          { min: 8,    max: 25,   high: true },
    WIND_ITCZ_LOW_WIDTH_DEG:          { min: 4,    max: 15,   high: true },
    WIND_SUBTROP_HIGH_LAT_DEG:        { min: 25,   max: 38,   high: true },
    WIND_SUBTROP_SEASONAL_SHIFT_DEG:  { min: 0,    max: 12,   high: true },
    WIND_SUBTROP_HIGH_STRENGTH_HPA:   { min: 6,    max: 20,   high: true },
    WIND_SUBTROP_HIGH_WIDTH_DEG:      { min: 5,    max: 18 },
    WIND_SUBTROP_LAND_WEAKENING:      { min: 0,    max: 0.6 },
    WIND_SUBPOLAR_LOW_DEPTH_HPA:      { min: 5,    max: 18,   high: true },
    WIND_SUBPOLAR_LOW_LAT_DEG:        { min: 50,   max: 70 },
    WIND_SUBPOLAR_LOW_WIDTH_DEG:      { min: 5,    max: 15 },
    WIND_POLAR_HIGH_STRENGTH_HPA:     { min: 3,    max: 15 },
    WIND_SUMMER_THERMAL_LOW_HPA:      { min: 5,    max: 20,   high: true },
    WIND_WINTER_THERMAL_HIGH_HPA:     { min: 7,    max: 25,   high: true },
    WIND_CONT_RANGE_KM:               { min: 1000, max: 4000, high: true },
    WIND_GEOSTROPHIC_MAX_ANGLE_DEG:   { min: 45,   max: 85 },
    WIND_FRICTION_BACK_ANGLE_DEG:     { min: 10,   max: 35 },

    // ── Temperature ──
    TEMP_PEAK_C:                      { min: 24,   max: 34,   high: true },
    TEMP_POLEWARD_RANGE_C:            { min: 35,   max: 65,   high: true },
    TEMP_POLEWARD_EXP:                { min: 1.0,  max: 2.2,  high: true },
    TEMP_TROPICAL_PLATEAU_DEG:        { min: 5,    max: 20,   high: true },
    TEMP_MOIST_LAPSE_C_PER_KM:        { min: 3.5,  max: 6.5,  high: true },
    TEMP_DRY_LAPSE_EXTRA_C_PER_KM:    { min: 2.0,  max: 5.5 },
    TEMP_OCEAN_WARMTH_DIFFUSE_KM:     { min: 400,  max: 3000 },
    TEMP_SST_CURRENT_SHIFT_C:         { min: 8,    max: 25 },
    TEMP_COASTAL_WARMTH_SHIFT_C:      { min: 8,    max: 30,   high: true },
    TEMP_SWING_SCALE:                 { min: 0.6,  max: 1.5,  high: true },
    TEMP_EXTRA_SWING_FACTOR:          { min: 0.25, max: 1.0,  high: true },
    TEMP_SWING_WINTER_SHARE:          { min: 0.4,  max: 0.75, high: true },
    TEMP_CONT_WINTER_COOL_C:          { min: 0,    max: 18,   high: true },
    TEMP_WINTER_COOL_WEST_RELIEF:     { min: 0,    max: 1.0,  high: true },
    TEMP_OCEANIC_WARMING_MAX_C:       { min: 2,    max: 10,   high: true },
    TEMP_CLOUD_MOD_STRENGTH:          { min: 0.05, max: 0.3 },
    TEMP_CLEARSKY_AMP_STRENGTH:       { min: 0.05, max: 0.3 },

    // ── Precipitation (complex model) ──
    PRECIP_OCEAN_MOISTURE_BASE:       { min: 0.2,  max: 0.7 },
    PRECIP_ADVECT_FLAT_SURVIVAL:      { min: 0.5,  max: 0.95, high: true },
    PRECIP_ADVECT_REACH_KM:           { min: 1000, max: 4000, high: true },
    PRECIP_ELEV_DEPLETION_PER_KM:     { min: 0.2,  max: 1.0,  high: true },
    PRECIP_ITCZ_WIDTH_DEG:            { min: 8,    max: 22,   high: true },
    PRECIP_ITCZ_CORE_BOOST:           { min: 1.0,  max: 2.5 },
    PRECIP_ITCZ_ADDITIVE:             { min: 0.1,  max: 0.6,  high: true },
    PRECIP_CONV_MULT_BOOST:           { min: 0.5,  max: 2.5 },
    PRECIP_CONV_ADD_FRAC:             { min: 0.1,  max: 0.8 },
    PRECIP_COLD_CURRENT_SUPPRESS:     { min: 0,    max: 0.9,  high: true },
    PRECIP_WARM_CURRENT_BOOST:        { min: 0,    max: 1.6,  high: true },  // wets warm east coasts (Florida, S. China)
    PRECIP_ORO_UPLIFT_ADD:            { min: 0.4,  max: 2.0 },
    PRECIP_ORO_SHADOW_MAX_SUPPRESS:   { min: 0.7,  max: 0.99 },
    PRECIP_RS_SHADOW_PROP_KM:         { min: 1000, max: 4000, high: true },
    PRECIP_RS_APPLY_STRENGTH_SCALE:   { min: 1.0,  max: 4.0 },
    PRECIP_RS_APPLY_MAX_SUPPRESS:     { min: 0.6,  max: 0.98, high: true },
    PRECIP_RS_APPLY_WINDWARD_ADD:     { min: 0.5,  max: 2.0 },
    PRECIP_SUBTROP_CENTER_SUMMER_DEG: { min: 25,   max: 38,   high: true },
    PRECIP_SUBTROP_CENTER_WINTER_DEG: { min: 18,   max: 30 },
    PRECIP_SUBTROP_WIDTH_SUMMER_DEG:  { min: 8,    max: 24 },
    PRECIP_SUBTROP_WIDTH_WINTER_DEG:  { min: 6,    max: 18 },
    PRECIP_SUBTROP_PEAK_SUMMER:       { min: 0.3,  max: 0.8,  high: true },
    PRECIP_SUBTROP_PEAK_WINTER:       { min: 0.1,  max: 0.5 },
    PRECIP_MONSOON_RELIEF_MAX:        { min: 0.4,  max: 1.0,  high: true },
    PRECIP_MONSOON_ADD:               { min: 0,    max: 0.6,  high: true },
    PRECIP_SUBTROP_EAST_RELIEF:       { min: 0,    max: 1.0,  high: true },
    PRECIP_MONSOON_REACH_DEG:         { min: 12,   max: 30,   high: true },
    PRECIP_POLAR_BASE_ADD:            { min: 0.03, max: 0.25 },
    PRECIP_POLAR_COASTAL_ADD:         { min: 0.05, max: 0.4 },
    PRECIP_CONT_DRYNESS:              { min: 0.3,  max: 0.8,  high: true },
    PRECIP_COAST_CUTOFF_START_KM:     { min: 1500, max: 3000, high: true },
    PRECIP_COAST_CUTOFF_END_KM:       { min: 2500, max: 4500 },
    PRECIP_MODEL_BLEND:               { min: 0.2,  max: 0.8,  high: true },
    PRECIP_CONT_CAP_FADE_START:       { min: 0.3,  max: 0.7 },
    PRECIP_CONT_CAP_MAX_REDUCTION:    { min: 0.6,  max: 0.95, high: true },
    PRECIP_SEASON_CONTRAST:           { min: 1.0,  max: 1.9,  high: true },  // floored at 1 (never compress); ceiling lowered to rein in Mediterranean over-pull

    // ── Köppen classification proxies ──
    KOPPEN_PRECIP_SCALE_MM:           { min: 600,  max: 1800, high: true },
    KOPPEN_ARIDITY_SCALE:             { min: 0.8,  max: 2.2,  high: true },
    KOPPEN_EAST_COAST_WET:            { min: 0,    max: 2.5,  high: true },
    KOPPEN_SHOULDER_FRAC:             { min: 0.6,  max: 2.4,  high: true },
    KOPPEN_DRIEST_FRAC_BASE:          { min: 0.4,  max: 0.8 },
    KOPPEN_DRIEST_FRAC_DROP:          { min: 0.15, max: 0.55, high: true },
    KOPPEN_S_SUMMER_MAX_MM:           { min: 30,   max: 80 },
    KOPPEN_S_RATIO:                   { min: 1.2,  max: 3.5,  high: true },
    KOPPEN_W_RATIO:                   { min: 1.5,  max: 6,    high: true },
    KOPPEN_AF_DRY_MIN_MM:             { min: 30,   max: 90 },

    // ── Heuristic zonal model ──
    HEUR_ZONAL_TRADE_VALUE:           { min: 0.2,  max: 0.5,  high: true },
    HEUR_ZONAL_DESERT_MIN:            { min: 0.01, max: 0.1,  high: true },
    HEUR_ZONAL_DESERT_END_DEG:        { min: 22,   max: 33,   high: true },
    HEUR_ZONAL_DRY_POLEWARD_DEG:      { min: 28,   max: 40,   high: true },
    HEUR_ZONAL_WESTERLY_PEAK:         { min: 0.35, max: 0.7 },
    HEUR_ZONAL_WESTERLY_PEAK_DEG:     { min: 45,   max: 62 },
    HEUR_ZONAL_POLAR_MIN:             { min: 0.03, max: 0.2 },
    HEUR_ITCZ_SHIFT_DAMPEN:           { min: 0.1,  max: 0.7,  high: true },
    HEUR_SEASON_SUMMER_MOD:           { min: 1.0,  max: 1.4 },
    HEUR_SEASON_WINTER_MOD:           { min: 0.6,  max: 1.0 },
    HEUR_MED_SUPPRESS_BASE:           { min: 0.05, max: 0.35 },
    HEUR_MED_WESTCOAST_BONUS:         { min: 0.1,  max: 0.4,  high: true },
    HEUR_CONT_DRYNESS:                { min: 0.4,  max: 0.85, high: true },
    HEUR_ORO_UPLIFT_MAX:              { min: 0.3,  max: 1.2 },
    HEUR_ORO_SHADOW_MAX:              { min: 0.4,  max: 0.9 },

    // ── Ocean: wind-driven surface currents ──
    OCEAN_WIND_COUPLING:              { min: 0,    max: 1,    high: true },
    OCEAN_EKMAN_DEG:                  { min: 15,   max: 60 },
    OCEAN_WIND_GAIN:                  { min: 0.5,  max: 3 },
};

// Ordering constraints the optimizer must maintain: [lowerKey, upperKey, minGap]
export const ORDER_CONSTRAINTS = [
    ['HEUR_ZONAL_DESERT_END_DEG', 'HEUR_ZONAL_DRY_POLEWARD_DEG', 2],
    ['HEUR_ZONAL_DRY_POLEWARD_DEG', 'HEUR_ZONAL_WESTERLY_PEAK_DEG', 5],
    ['PRECIP_COAST_CUTOFF_START_KM', 'PRECIP_COAST_CUTOFF_END_KM', 300],
    ['PRECIP_SUBTROP_CENTER_WINTER_DEG', 'PRECIP_SUBTROP_CENTER_SUMMER_DEG', 0],
];

// Sanity: every space key must exist in the config, and defaults must lie in range.
for (const [k, s] of Object.entries(PARAM_SPACE)) {
    if (!(k in CLIMATE_DEFAULTS)) throw new Error(`param-space key not in climate-config: ${k}`);
    const d = CLIMATE_DEFAULTS[k];
    if (d < s.min || d > s.max) throw new Error(`default of ${k} (${d}) outside [${s.min}, ${s.max}]`);
}
for (const k of Object.keys(CLIMATE_DEFAULTS)) {
    if (!(k in PARAM_SPACE)) throw new Error(`climate-config key missing from param-space: ${k}`);
}

export const HIGH_IMPACT_KEYS = Object.keys(PARAM_SPACE).filter(k => PARAM_SPACE[k].high);

/** Clamp + enforce ordering constraints on a params object (mutates + returns it). */
export function repairParams(params) {
    for (const [k, v] of Object.entries(params)) {
        const s = PARAM_SPACE[k];
        if (!s) continue;
        params[k] = Math.min(s.max, Math.max(s.min, v));
    }
    for (const [lo, hi, gap] of ORDER_CONSTRAINTS) {
        const vLo = params[lo] ?? CLIMATE_DEFAULTS[lo];
        const vHi = params[hi] ?? CLIMATE_DEFAULTS[hi];
        if (vHi < vLo + gap) {
            const mid = (vLo + vHi) / 2;
            if (lo in params) params[lo] = Math.max(PARAM_SPACE[lo].min, mid - gap / 2);
            if (hi in params) params[hi] = Math.min(PARAM_SPACE[hi].max, mid + gap / 2);
        }
    }
    return params;
}
