// Temperature stage: a seasonal energy-balance model on the climate grid. DOM-free.
//
//   C·∂T/∂t = S·(1 − α) − (A + B·T) + D·∇²T − γ·(u·∇)T
//
//   S       sunlight (insolation.js; any axial tilt)
//   α       albedo: a base value rising toward the poles, and snow / sea ice where it is cold (smooth ramp)
//   A + B·T heat radiated to space
//   C       heat stored per degree: small over land, a mixed-layer ocean at sea — the source of continental
//           seasons, maritime mildness and the seasonal lag. Frozen sea stores little (ice insulates it).
//   D·∇²T   heat spread by weather and ocean
//   γ·u·∇T  heat carried by the winds (mild coasts downwind of the sea, cold coasts downwind of a continent)
//
// In the tropics, evaporation from wet ground and sea steadies the seasons (a larger B for the seasonal harmonics),
// and wet ground stays mild in its rainy season (below the grid, from the rain stage's rain).
//
// Solved directly for the yearly cycle — the annual mean and the first two harmonics — so no years of spin-up:
// each harmonic is one steady problem (solver.js). What depends on temperature itself (snow and ice, the seasonal
// swing of the winds) is updated over a few outer iterations. T is the sea-level temperature; the stage reports it
// at each grid cell's reference height (its mean land height), and the core lifts it to each terrain cell.

import { LatLonGrid, coarsenField, refineField, refineForDrawing, fillAcross } from './grid.js';
import { insolationTable, dailyInsolation, declination, SOLAR_CONSTANT } from './insolation.js';
import { HelmholtzSolver } from './solver.js';
import { PARAMS } from './config.js';
import { tropicsWeight, gaussianSmooth } from './circulation.js';
import { FastNoise } from '../core/fast-noise.js';

const SECONDS_PER_YEAR = 3.156e7;
const OMEGA = 2 * Math.PI / SECONDS_PER_YEAR;
const AIR_COLUMN_HEAT_CAP = 1.0e7;          // J/m²/K — the atmosphere's heat capacity per unit area
const SEAWATER_HEAT_CAP = 1025 * 3990;      // J/m³/K
const R_PLANET = 6.371e6;
const NT = 12;                              // samples per year for what is evaluated in time (≥ 5 for 2 harmonics)
const OUTER = 4;                            // outer iterations (snow / ice, seasonal winds)
const OUTER_WARM = 2;                       // … when starting from a previous run (temperature ↔ winds rounds)
const CC_SLOPE_25 = Math.exp(17.67 * 25 / 268.5) * 17.67 * 243.5 / (268.5 * 268.5);   // de_s/dT at 25 °C (relative units)
const WET_RAIN_MM = 800;                    // yearly rain at which land is ~63 % wet (evaporation not limited by water)
const BLOCK_FLOOR = 0.5;        // the share of a face that stays open over any ridge: the weather aloft
const EXPOSURE_KM = 700;                    // km: how far upwind the sea still makes land maritime (e-folding) …
const EXPOSURE_STEPS = 4;                   // … looked at over this many grid steps
const CURRENT_ROW_DEG = 6;                  // °: the currents' warmth and cold are relative to the sea within this of latitude
const AIR_CYCLES = 6;                       // multigrid cycles for the air masses (each month)
const DRY_LAPSE = 9.8;                      // °C/km: air carried up or down warms or cools at the dry adiabatic rate
const AIR_STABLE_SUN = SOLAR_CONSTANT / 10; // W/m² daily sunlight (top of the air) below which land's air lies stable (≈ 45° in midwinter) …
const AIR_MIXED_SUN = SOLAR_CONSTANT / 5;   // … and above which convection mixes it (≈ 25° in midwinter)
const WET_MONTH_MM = 100;                   // mm/month of rain at which the ground is ~63 % wet
const WET_SUN_REF = 400;                    // W/m² of daily sunlight (top of the air) at which TEMP_WET_COOL_C applies
/** Δ/(Δ+γ): the share of the available energy a wet surface evaporates (equilibrium evaporation), relative to 25 °C. */
const evapShareRaw = (T) => { const t = Math.max(-40, Math.min(45, T)), d = 4098 * 0.6108 * Math.exp(17.27 * t / (t + 237.3)) / ((t + 237.3) ** 2); return d / (d + 0.0665); };
const EVAP_SHARE_25 = evapShareRaw(25);
const evapShare = (T) => evapShareRaw(T) / EVAP_SHARE_25;
const CLOUD_RAIN_MM = 100;                  // mm/month of rain at which land is ~63 % cloud-covered
const WEAK_SUN = SOLAR_CONSTANT / 8;        // W/m² — half the planet's mean sunlight: below it, inversions form

/**
 * The temperature stage. Options: { tiltDeg = 23.44 }.
 * Returns stage(ctx, winds, init?) → { T (K anchors × G, °C at reference height), monthly (12 × G, same), monthlySL
 * (12 × G, sea level), iceFrac (G, share of the year a cell is snow- or ice-covered), state, timing }.
 * init: a previous run's `state` (same settings) to start from — used when temperature and winds are iterated
 * together; it then needs fewer outer iterations. qflux: the ocean's heating of the sea surface (W/m², core grid).
 * rain: monthly rain (12 × G, mm/month, core grid) from the rain stage, or null — then clouds shade rainy land and
 * leave dry land in full sun.
 */
export function energyBalanceTemperature({ tiltDeg = 23.44 } = {}) {
    return (ctx, winds, init = null, qflux = null, rain = null, ocean = null) => {
        const t0 = performance.now();
        const P = { ...PARAMS };
        // (the pages' Greenhouse: a radiative forcing, W/m² — the planet's heat to space lowered (or raised) as more (or
        // less) greenhouse gas would; ≈ 0.5 °C per W/m² before the snow, ice and seas answer. They amplify a cooling far
        // more than a warming — on Earth −10 W/m² cools the planet ≈ 8 °C, +10 warms it ≈ 6 °C — and past −20 W/m² the
        // ice runs away: sea ice on a quarter of the sea at −20, nearly all of it at −28, a snowball at −30)
        P.TEMP_OLR_A -= ctx.options?.greenhouseWm2 ?? 0;
        const core = ctx.grid;
        const ratio = Math.round(P.TEMP_GRID_DEG / core.step);
        const g = ratio > 1 ? new LatLonGrid(core.step * ratio) : core;
        const G = g.size, w = g.w, h = g.h;

        // Surface and winds on the energy-balance grid
        const landFrac = coarsen(core, g, ratio, ctx.surface.landFrac);
        const landKm = coarsen(core, g, ratio, ctx.surface.meanLandKm.map(v => (v === v ? Math.max(0, v) : 0)));
        const uM = new Float64Array(12 * G), vM = new Float64Array(12 * G);
        if (winds) for (let m = 0; m < 12; m++) {
            uM.set(coarsen(core, g, ratio, winds.u.subarray(m * core.size, (m + 1) * core.size)), m * G);
            vM.set(coarsen(core, g, ratio, winds.v.subarray(m * core.size, (m + 1) * core.size)), m * G);
        }
        const uBar = new Float64Array(G), vBar = new Float64Array(G);
        for (let m = 0; m < 12; m++) for (let c = 0; c < G; c++) { uBar[c] += uM[m * G + c] / 12; vBar[c] += vM[m * G + c] / 12; }
        // winds at the NT sample times (linear between mid-month values)
        const uT = new Float64Array(NT * G), vT = new Float64Array(NT * G);
        for (let k = 0; k < NT; k++) {
            const pos = 12 * k / NT - 0.5, m0 = Math.floor(pos), f = pos - m0, a = ((m0 % 12) + 12) % 12, b = (a + 1) % 12;
            for (let c = 0; c < G; c++) {
                uT[k * G + c] = (1 - f) * uM[a * G + c] + f * uM[b * G + c] - uBar[c];
                vT[k * G + c] = (1 - f) * vM[a * G + c] + f * vM[b * G + c] - vBar[c];
            }
        }

        // Clouds over land (with the rain stage's rain): cloudiness 1 − e^{−P/P₀} makes rainy land brighter and dry land
        // darker than the land's average — the average stays in the base albedo — so deserts get the full summer sun
        // and monsoon, rainforest and boreal summers are shaded. Per sample time, relative to the land's mean. In the
        // rainy tropics (tropicsWeight about that month's belts) the extra brightness is × (1 − TEMP_CLOUD_LW_CANCEL):
        // deep convective clouds trap about as much heat as they reflect (Kiehl 1994) — at full strength the rainforests
        // of Sumatra, Borneo and the Amazon came out cold and the energy balance spread it over the seas around them.
        let cloudT = null;
        if (rain && P.TEMP_CLOUD_ALBEDO > 0) {
            cloudT = new Float64Array(NT * G);
            const Pm = new Float64Array(12 * G);
            for (let m = 0; m < 12; m++) Pm.set(coarsen(core, g, ratio, rain.subarray(m * core.size, (m + 1) * core.size)), m * G);
            for (let k = 0; k < NT; k++) {
                const pos = 12 * k / NT - 0.5, m0 = Math.floor(pos), f = pos - m0, a = ((m0 % 12) + 12) % 12, b = (a + 1) % 12;
                let sum = 0, wsum = 0;
                for (let j = 0; j < h; j++) {
                    const cw = Math.cos(g.lat[j] * Math.PI / 180);
                    for (let i = 0; i < w; i++) {
                        const c = j * w + i, p = (1 - f) * Pm[a * G + c] + f * Pm[b * G + c];
                        const cf = 1 - Math.exp(-Math.max(0, p) / CLOUD_RAIN_MM);
                        cloudT[k * G + c] = cf; sum += cf * landFrac[c] * cw; wsum += landFrac[c] * cw;
                    }
                }
                const meanCf = wsum > 0 ? sum / wsum : 0, bt = winds?.belts?.[a];
                for (let j = 0; j < h; j++) {
                    const keep = bt ? 1 - P.TEMP_CLOUD_LW_CANCEL * tropicsWeight(g.lat[j], bt.itcz, bt.hiN, bt.hiS) : 1;
                    for (let i = 0; i < w; i++) {
                        const c = j * w + i, d = cloudT[k * G + c] - meanCf;
                        cloudT[k * G + c] = P.TEMP_CLOUD_ALBEDO * (d > 0 ? d * keep : d);
                    }
                }
            }
        }

        // Sunlight and base albedo per row
        const Q = insolationTable(g.lat, tiltDeg, NT);
        const albBase = new Float64Array(h);
        for (let j = 0; j < h; j++) { const x = Math.sin(g.lat[j] * Math.PI / 180); albBase[j] = P.TEMP_ALBEDO + P.TEMP_ALBEDO_LAT * (1.5 * x * x - 0.5); }
        // (and the surface's own variety about that: smooth fractal noise by geographic position, a fixed size in km — an
        // input like the rest, which the heat's spread and the snow and ice then work through)
        const albVary = new Float64Array(G);
        if (P.TEMP_ALBEDO_VARY > 0) {
            const nz = new FastNoise(((ctx.options?.seed ?? 1) * 0x2c1b + 0x51) >>> 0), s = 6371 / P.TEMP_ALBEDO_VARY_KM;
            for (let j = 0; j < h; j++) {
                const la = g.lat[j] * Math.PI / 180, cl = Math.cos(la), z = Math.sin(la) * s;
                for (let i = 0; i < w; i++) {
                    const lo = g.lon[i] * Math.PI / 180;
                    albVary[j * w + i] = P.TEMP_ALBEDO_VARY * Math.max(-1, Math.min(1, 2 * nz.fbm(cl * Math.cos(lo) * s, cl * Math.sin(lo) * s, z, 4, 0.5)));
                }
            }
        }
        const gamma = P.TEMP_WIND_CARRY * AIR_COLUMN_HEAT_CAP;
        const Cl = P.TEMP_LAND_HEAT_CAP, Co = SEAWATER_HEAT_CAP * P.TEMP_OCEAN_MIX_M;
        // Large-scale height effect per cell (the core applies the standard rate below the grid): sunlit plateaus
        // cool gently with height, ground snowy most of the year like an ice sheet — blended by the snow's duration.
        const lapseEff = new Float64Array(G).fill(P.TEMP_PLATEAU_LAPSE);
        // An ice sheet's surface stands at least TEMP_ICE_DOME_KM high, whatever the ground under it (Antarctica's and
        // Greenland's domes are 2–3 km of ice): its own height keeps it cold — the snow, the inversion and the reported
        // temperature see that surface. (On bare low polar land a sheet melted back every summer without it.)
        const surfKm = new Float64Array(G);
        // An ice sheet forms only where snow survives the summer: from snow lasting ~70 % of the year to all of it
        const perennial = new Float64Array(G);
        const iceSheet = (share) => { const f = P.TEMP_ICE_FORM ?? [0.7, 1], x = (share - f[0]) / (f[1] - f[0]); return x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x); };
        // …and a sheet once there is kept while its snow lasts TEMP_ICE_KEEP of the year (an ice sheet outlives the summers
        // that could not grow it: by the growing ramp alone, a sheet snowy ~85 % of the year counted as half a sheet, warmed
        // round by round and was gone)
        const keepSheet = (share) => { const x = (share - P.TEMP_ICE_KEEP[0]) / (P.TEMP_ICE_KEEP[1] - P.TEMP_ICE_KEEP[0]); return x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x); };
        const iceRamp = (T) => {
            const x = (P.TEMP_ICE_WARM_C - T) / (P.TEMP_ICE_WARM_C - P.TEMP_ICE_COLD_C);
            return x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
        };

        // Harmonics of sea-level temperature: T(t) = c0 + 2·Re(c1·e^{iθ}) + 2·Re(c2·e^{2iθ}), θ = 2π·t/12
        const c0 = new Float64Array(G), c1r = new Float64Array(G), c1i = new Float64Array(G), c2r = new Float64Array(G), c2i = new Float64Array(G);
        for (let j = 0; j < h; j++) {
            let q = 0; for (let k = 0; k < NT; k++) q += Q[k * h + j] / NT;
            const t = Math.max(-40, Math.min(35, (q * (1 - albBase[j]) - P.TEMP_OLR_A) / P.TEMP_OLR_B));
            for (let i = 0; i < w; i++) c0[j * w + i] = t;
        }
        const snowYear = new Float64Array(G), snowYearPrev = new Float64Array(G);   // share of the year the land is snowy
        const warm = !!(init && init.step === g.step && init.c0.length === G);
        if (warm) {
            c0.set(init.c0); c1r.set(init.c1r); c1i.set(init.c1i); c2r.set(init.c2r); c2i.set(init.c2i); snowYear.set(init.snowYear);
            if (init.perennial) perennial.set(init.perennial); else for (let c = 0; c < G; c++) perennial[c] = iceSheet(snowYear[c]);
        } else if (P.TEMP_ICE_START_C > -Infinity) {
            // An ice sheet keeps itself cold — its whiteness, its height — so cold land can carry one through summers that
            // bare ground there would not survive: two steady states. Started from bare ground the snow-and-ice rounds
            // never find the icy one (polar land snowy ~60 % of the year stays bare, under the sheet's 70 %); so a fresh
            // start begins with ice on land the first guess (by latitude alone) makes colder than TEMP_ICE_START_C, and
            // the rounds keep the sheets that hold themselves (developer: the poles "frequently not icey … feels super wrong")
            for (let c = 0; c < G; c++) if (landFrac[c] > 0 && c0[c] < P.TEMP_ICE_START_C) { snowYear[c] = 1; perennial[c] = 1; }
        }
        const outer = warm ? OUTER_WARM : OUTER;
        // heat the ocean's currents bring to (or take from) the sea's surface layer, W/m² (ocean.js)
        const qEbm = qflux ? coarsen(core, g, ratio, qflux) : null;
        // … or, when the ocean has seasons (ocean.js: the monsoon seas' currents, the month's upwelling), each month's:
        // at each sample time t = 12k/NT months, between the mid-month values either side
        let qAt = null;
        if (ocean?.monthly?.qflux) {
            const qm = [];
            for (let m = 0; m < 12; m++) qm.push(coarsen(core, g, ratio, ocean.monthly.qflux.subarray(m * core.size, (m + 1) * core.size)));
            qAt = new Float64Array(NT * G);
            for (let k = 0; k < NT; k++) {
                const pos = 12 * k / NT - 0.5, m0 = Math.floor(pos), fm = pos - m0, ma = ((m0 % 12) + 12) % 12, mb = (ma + 1) % 12;
                for (let c = 0; c < G; c++) qAt[k * G + c] = (1 - fm) * qm[ma][c] + fm * qm[mb][c];
            }
        }

        const solver = new HelmholtzSolver(g, P.TEMP_DIFFUSIVITY, P.TEMP_DIFFUSIVITY_EW);
        // Mountains block the air near the ground, and the heat it carries and mixes, between the lowlands on either
        // side (the Himalaya keeps Tibet's cold out of India; the Sierra and Cascades keep the Pacific's air out of the
        // Great Basin; the Andes part Chile from Argentina). Each face between two cells is open by
        // e^{−(ridge above the lower side)/TEMP_BLOCK_KM}, the ridge taken strip by strip on the terrain's 1° grid (its
        // crest from one cell's centre to the next), so a range narrower than the grid still counts.
        const faces = P.TEMP_BLOCK_KM > 0 ? ridgeFaces(ctx, core, g, ratio, landKm, P.TEMP_BLOCK_KM) : null;
        const dRad = g.step * Math.PI / 180;
        const Tk = new Float64Array(G), iceYear = new Float64Array(G), seaIceYear = new Float64Array(G);
        // The sea ice drawn and handed on, month by month: a degree-day budget through the year — the ice thickens by
        // TEMP_SEA_ICE_GROW per °C·day below freezing (slower as it thickens) and thins by TEMP_SEA_ICE_MELT per °C·day
        // above, and covers the sea as its thickness reaches TEMP_SEA_ICE_H0. So it lingers after the thaw (the summer
        // pack where winters are long and summers cool), and follows the currents through the sea's temperature. (The
        // energy balance's own sea ice stays each month's cold alone — iceRamp: the summer pack would chill the sea
        // around it and creep the winter edge out.) 0 = off: each month's cold alone.
        const thickOn = P.TEMP_SEA_ICE_GROW > 0;
        const iceHm = new Float64Array(12 * G);
        const thickCycle = (out, n, phase) => {             // (n months from January: n = 12, phase 0.5 — mid-month)
            const dt = 365 / n, hMax = 6 * P.TEMP_SEA_ICE_H0, st = P.TEMP_SEA_ICE_STEFAN_M;
            // the sea's temperature through the year, averaged over the sea within TEMP_SEA_ICE_SPREAD_KM (a warm current's
            // water spreads well out from its coast, and the ice drifts)
            const Tn = new Float64Array(n * G), wS = new Float64Array(G), tmpS = new Float64Array(G), sp = P.TEMP_SEA_ICE_SPREAD_KM;
            for (let c = 0; c < G; c++) wS[c] = 1 - landFrac[c];
            if (sp > 0) gaussianSmooth(g, wS, tmpS, sp);
            for (let k = 0; k < n; k++) {
                const th = 2 * Math.PI * (k + phase) / n, f = Tn.subarray(k * G, (k + 1) * G);
                for (let c = 0; c < G; c++) f[c] = (1 - landFrac[c]) * (c0[c] + 2 * (c1r[c] * Math.cos(th) - c1i[c] * Math.sin(th)) + 2 * (c2r[c] * Math.cos(2 * th) - c2i[c] * Math.sin(2 * th)));
                if (sp > 0) { gaussianSmooth(g, f, tmpS, sp); for (let c = 0; c < G; c++) f[c] = wS[c] > 1e-3 ? f[c] / wS[c] : 0; }
                else for (let c = 0; c < G; c++) f[c] = landFrac[c] < 1 ? f[c] / (1 - landFrac[c]) : 0;
            }
            for (let c = 0; c < G; c++) {
                if (landFrac[c] >= 1) continue;
                let hh = 0;
                for (let pass = 0; pass < 3; pass++) for (let k = 0; k < n; k++) {
                    const T = Tn[k * G + c];
                    // (growth slows as the ice thickens — it insulates the water below, Stefan's law: thickness grows
                    // as the square root of the winter's frost, so a marginal sea's first-year ice stays thin enough to
                    // melt back in summer)
                    const grow = st > 0 ? P.TEMP_SEA_ICE_GROW * Math.min(1, st / Math.max(hh, 1e-3)) : P.TEMP_SEA_ICE_GROW;
                    hh = Math.min(hMax, Math.max(0, hh + dt * (T < 0 ? -grow * T : -P.TEMP_SEA_ICE_MELT * T)));
                    if (pass === 2) { const x = Math.min(1, hh / P.TEMP_SEA_ICE_H0); out[k * G + c] = x * x * (3 - 2 * x); }
                }
                // The summer pack only pulls back from the winter's edge: no month has more ice than the place's winter
                // (the colder of January and July). (The sea's cold lags the sun by months, so a marginal sea's ice grew
                // into the spring and lingered into the summer — wider in July than in January, past the winter's edge.)
                const wm = Tn[c] <= Tn[6 * G + c] ? 0 : 6, x = (P.TEMP_ICE_WARM_C - Tn[wm * G + c]) / (P.TEMP_ICE_WARM_C - P.TEMP_ICE_COLD_C);
                const cap = Math.max(out[wm * G + c], x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
                for (let k = 0; k < n; k++) if (out[k * G + c] > cap) out[k * G + c] = cap;
            }
        };
        const F0 = new Float64Array(G), F1r = new Float64Array(G), F1i = new Float64Array(G), F2r = new Float64Array(G), F2i = new Float64Array(G);
        const sr = new Float64Array(G).fill(P.TEMP_OLR_B), si = new Float64Array(G), zero = new Float64Array(G);
        const srSeason = new Float64Array(G);
        const beltYear = { itcz: 0, hiN: 30, hiS: -30 };           // the year's mean belts (from the winds, if derived)
        if (winds?.belts) { beltYear.hiN = 0; beltYear.hiS = 0; for (const b of winds.belts) { beltYear.itcz += b.itcz / 12; beltYear.hiN += b.hiN / 12; beltYear.hiS += b.hiS / 12; } }
        // land's wetness (0–1) from the rain stage's yearly rain, when there is one
        let landWet = null;
        if (rain) {
            landWet = new Float64Array(G);
            for (let m = 0; m < 12; m++) { const pm = coarsen(core, g, ratio, rain.subarray(m * core.size, (m + 1) * core.size)); for (let c = 0; c < G; c++) landWet[c] += pm[c]; }
            for (let c = 0; c < G; c++) landWet[c] = 1 - Math.exp(-Math.max(0, landWet[c]) / WET_RAIN_MM);
        }
        const C = new Float64Array(G);
        const stats = [];
        const prof = { setup: performance.now() - t0, forcing: 0, operator: 0, solve: 0, output: 0 };
        let tp;
        for (let it = 0; it < outer; it++) {
            tp = performance.now();
            F0.fill(0); F1r.fill(0); F1i.fill(0); F2r.fill(0); F2i.fill(0); iceYear.fill(0); seaIceYear.fill(0);
            snowYearPrev.set(snowYear); snowYear.fill(0);
            for (let c = 0; c < G; c++) {
                perennial[c] = Math.max(iceSheet(snowYearPrev[c]), perennial[c] * keepSheet(snowYearPrev[c]));
                lapseEff[c] = P.TEMP_PLATEAU_LAPSE + (P.TEMP_ICE_LAPSE - P.TEMP_PLATEAU_LAPSE) * perennial[c];
                surfKm[c] = Math.max(landKm[c], P.TEMP_ICE_DOME_KM * perennial[c]);
            }
            for (let k = 0; k < NT; k++) {
                const th = 2 * Math.PI * k / NT, co = Math.cos(th), sn = Math.sin(th), co2 = Math.cos(2 * th), sn2 = Math.sin(2 * th);
                for (let c = 0; c < G; c++) Tk[c] = c0[c] + 2 * (c1r[c] * co - c1i[c] * sn) + 2 * (c2r[c] * co2 - c2i[c] * sn2);
                for (let j = 0; j < h; j++) {
                    const q = Q[k * h + j], ab = albBase[j];
                    const sx = 1 / (R_PLANET * Math.cos(g.lat[j] * Math.PI / 180) * dRad), sy = 1 / (R_PLANET * dRad);
                    for (let i = 0; i < w; i++) {
                        const c = j * w + i, T = Tk[c], f = landFrac[c];
                        const sL = iceRamp(T - lapseEff[c] * surfKm[c]), sO = iceRamp(T);
                        // snow on land: patchy seasonal snow reflects little; snow that survives the summer — an ice
                        // sheet — like sea ice, and all year: a sheet stays white through its summer melt (by the month's
                        // own snow alone, a sheet went dark the first month above freezing and melted away)
                        const albSnow = P.TEMP_ALBEDO_SNOW + (P.TEMP_ALBEDO_ICE - P.TEMP_ALBEDO_SNOW) * perennial[c];
                        const sLa = Math.max(sL, perennial[c]);
                        const abc = ab + albVary[c];
                        let alb = abc + f * sLa * (albSnow - abc) + (1 - f) * sO * (P.TEMP_ALBEDO_ICE - abc);
                        if (cloudT) alb += f * (1 - sLa) * cloudT[k * G + c];          // clouds over snow-free land
                        snowYear[c] += sL / NT;
                        let gF = q * (1 - alb);
                        if (winds && gamma) {                   // the seasonal part of the winds' heat carrying
                            const du = uT[k * G + c], dv = vT[k * G + c];
                            const Tw = Tk[j * w + (i === 0 ? w - 1 : i - 1)], Te = Tk[j * w + (i === w - 1 ? 0 : i + 1)];
                            const gx = du > 0 ? (T - Tw) : (Te - T);
                            let gy = 0;
                            if (dv > 0 && j < h - 1) gy = T - Tk[c + w];
                            else if (dv < 0 && j > 0) gy = Tk[c - w] - T;
                            gF -= gamma * (du * gx * sx + dv * gy * sy);
                        }
                        if (qAt) gF += qAt[k * G + c] * (1 - f);
                        F0[c] += gF; F1r[c] += gF * co; F1i[c] -= gF * sn; F2r[c] += gF * co2; F2i[c] -= gF * sn2;
                        iceYear[c] += (f * sL + (1 - f) * sO) / NT;
                        seaIceYear[c] += sO / NT;
                    }
                }
            }
            for (let c = 0; c < G; c++) {
                F0[c] = F0[c] / NT - P.TEMP_OLR_A + (qEbm && !qAt ? qEbm[c] * (1 - landFrac[c]) : 0); F1r[c] /= NT; F1i[c] /= NT; F2r[c] /= NT; F2i[c] /= NT;
                const Cs = Co * (1 - seaIceYear[c]) + Cl * seaIceYear[c];            // frozen sea stores little heat
                C[c] = landFrac[c] * Cl + (1 - landFrac[c]) * Cs;
            }
            // Evaporation steadies the tropics' seasons: there a wet surface puts extra heating into evaporation, and
            // the even temperature aloft (the Hadley circulation's) lets it act locally — ≈ TEMP_EVAP_DAMPING
            // W m⁻² K⁻¹ at 25 °C, following the Clausius–Clapeyron slope, over the sea and over land as wet as its
            // yearly rain keeps it. Tropics only (tropicsWeight, from the year's belts): poleward, weather systems
            // mix the air and the energy balance's own seasons stand.
            if (P.TEMP_EVAP_DAMPING > 0) for (let j = 0; j < h; j++) {
                const wt = tropicsWeight(g.lat[j], beltYear.itcz, beltYear.hiN, beltYear.hiS);
                for (let i = 0; i < w; i++) {
                    const c = j * w + i;
                    if (wt === 0) { srSeason[c] = P.TEMP_OLR_B; continue; }
                    const t = Math.max(-40, Math.min(40, c0[c])), es = Math.exp(17.67 * t / (t + 243.5));
                    const cc = es * 17.67 * 243.5 / ((t + 243.5) ** 2) / CC_SLOPE_25;
                    const wet = (1 - landFrac[c]) * (1 - seaIceYear[c]) + landFrac[c] * (landWet ? landWet[c] : 0.5);
                    srSeason[c] = P.TEMP_OLR_B + P.TEMP_EVAP_DAMPING * wt * cc * wet;
                }
            } else srSeason.fill(P.TEMP_OLR_B);
            const relax = it === 0 && !warm ? 1 : 0.8;
            const tol = it === outer - 1 ? 1e-4 : 1e-3;
            prof.forcing += performance.now() - tp;
            const solveWith = (srArr, sigmaI, fr, fi, xr, xi) => {
                let ta = performance.now();
                solver.setOperator(srArr, sigmaI, winds ? uBar : null, winds ? vBar : null, gamma, faces);
                prof.operator += performance.now() - ta; ta = performance.now();
                const r = solveRelaxed(solver, fr, fi, xr, xi, relax, tol);
                prof.solve += performance.now() - ta;
                return r;
            };
            // annual mean, then the first and second harmonics of the year
            const n0 = solveWith(sr, zero, F0, zero, c0, null);
            for (let c = 0; c < G; c++) si[c] = OMEGA * C[c];
            const n1 = solveWith(srSeason, si, F1r, F1i, c1r, c1i);
            for (let c = 0; c < G; c++) si[c] = 2 * OMEGA * C[c];
            const n2 = solveWith(srSeason, si, F2r, F2i, c2r, c2i);
            stats.push({ it, cycles: [n0.cycles, n1.cycles, n2.cycles] });
        }
        tp = performance.now();

        // Land's own seasons, below the energy balance's scale. Its diffusion stands for the weather systems' poleward
        // heat transport — right for the planet, but over a continent of a few thousand km it ties the land to the sea
        // beside it (D·k² ≫ B), and Australia, southern Africa or the Great Basin lose most of their seasons while
        // Siberia keeps its own. Each column's own response to the season's forcing, with only a local exchange with its
        // surroundings (TEMP_LOCAL_K: the winds over ~1000 km) — F/(B + K + iωC) — is added back over land where it
        // departs from its region's (a Gaussian of TEMP_LOCAL_KM): an interior surrounded by land gains nothing, one
        // among seas gains the seasons of its size. Land the wind brings sea air to keeps the sea's mildness: the gain
        // is × (1 − the sea share upwind, along the year's mean wind, weighted e^{−d/EXPOSURE_KM}) — the UK and the
        // west coasts stay maritime, Australia's interior (the trades cross Queensland first) does not.
        // The air upwind of each land cell, along the year's mean wind (EXPOSURE_STEPS grid steps, each weighted
        // e^{−d/EXPOSURE_KM}): upwind(j, i, visit) calls visit(cell, weight) and returns how surely the wind brings it
        // (only a near-still mean wind brings it less surely); `inland` is 1 − that × the sea share upwind.
        const stepKmE = g.step * 111.2;
        const upwind = (j, i, visit) => {
            const c = j * w + i, sp = Math.hypot(uBar[c], vBar[c]);
            if (!winds || !(sp > 0.3)) return 0;
            const du = -uBar[c] / sp, dv = -vBar[c] / sp;
            let y = j + 0.5, x = i + 0.5;
            for (let k = 1; k <= EXPOSURE_STEPS; k++) {
                const cls = Math.max(0.1, Math.cos((90 - y * g.step) * Math.PI / 180));
                y -= dv; x += du / cls;
                if (y < 0 || y >= h) break;
                visit(Math.floor(y) * w + ((Math.floor(x) % w) + w) % w, Math.exp(-k * stepKmE / EXPOSURE_KM));
            }
            return Math.min(1, sp / 1);
        };
        const inland = new Float64Array(G).fill(1);
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
            const c = j * w + i; if (!(landFrac[c] > 0)) continue;
            let s = 0, ws = 0;
            const calm = upwind(j, i, (q, wk) => { s += wk * (1 - landFrac[q]); ws += wk; });
            if (ws > 0) inland[c] = 1 - calm * s / ws;
        }

        // The sea's own warmth below the energy balance's scale (which would spread it over thousands of km): a current
        // keeps TEMP_CURRENT_MEMORY of the temperature of the latitudes its water comes from (the ocean stage's
        // `carried`: poleward currents warm, equatorward ones cold). (Upwelling stays in the energy balance's ocean heat:
        // added here too, the equatorial cold tongue bent the trade winds and the Peru coast's the South American rain.)
        // The winds carry it onto the land downwind: TEMP_COAST_CARRY × the sea's anomaly along the land's upwind path
        // (mild Norway and north-west Europe; cool California, Peru and Namibia coasts). With it the rain stage sees
        // warm and cold seas: more evaporation and unstable air off warm ones, stable air off cold ones.
        if (ocean?.carried && P.TEMP_CURRENT_MEMORY > 0) {
            // (the whole anomaly, not only where it departs from its region: the eastern half of a gyre is cold as a
            // whole. But each latitude's sea keeps its mean — warm and cold relative to their latitude: the broad slow
            // equatorward half of a gyre covers more sea than its narrow poleward current, so the anomaly's own mean
            // would cool the subtropical seas ≈ 1 K and take the tropics' land rain to the sea. The mean is taken over
            // ±CURRENT_ROW_DEG of latitude, so a narrow sea between continents keeps its anomaly.)
            const seaAnom = new Float64Array(G);
            const carriedE = coarsen(core, g, ratio, ocean.carried);
            const rowSum = new Float64Array(h), rowArea = new Float64Array(h);
            for (let j = 0; j < h; j++) {
                for (let i = 0; i < w; i++) {
                    const c = j * w + i, s = (1 - landFrac[c]) * (1 - seaIceYear[c]);
                    if (!(s > 0)) continue;
                    seaAnom[c] = P.TEMP_CURRENT_MEMORY * carriedE[c];
                    rowSum[j] += s * seaAnom[c]; rowArea[j] += s;
                }
            }
            const band = Math.max(0, Math.round(CURRENT_ROW_DEG / g.step));
            for (let j = 0; j < h; j++) {
                let sum = 0, area = 0;
                for (let k = Math.max(0, j - band); k <= Math.min(h - 1, j + band); k++) { sum += rowSum[k]; area += rowArea[k]; }
                const mean = area > 0 ? sum / area : 0;
                for (let i = 0; i < w; i++) { const c = j * w + i; if (seaAnom[c]) seaAnom[c] -= mean; }
            }
            for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
                const c = j * w + i, f = landFrac[c];
                let carried = 0;
                if (f > 0 && P.TEMP_COAST_CARRY > 0) {
                    let s = 0, ws2 = 0;
                    const calm = upwind(j, i, (q, wk) => { s += wk * (1 - landFrac[q]) * seaAnom[q]; ws2 += wk; });
                    if (ws2 > 0) carried = P.TEMP_COAST_CARRY * calm * s / ws2;
                }
                c0[c] += (1 - f) * (1 - seaIceYear[c]) * seaAnom[c] + f * carried;
            }
        }

        if (P.TEMP_LOCAL_K > 0) {
            const ar = new Float64Array(G), ai = new Float64Array(G), sr2 = new Float64Array(G), si2 = new Float64Array(G), tmpS = new Float64Array(G);
            // (not over ice sheets: the ice holds their summers near freezing)
            const addLocal = (n, fr, fi, xr, xi) => {
                for (let c = 0; c < G; c++) {
                    const re = srSeason[c] + P.TEMP_LOCAL_K, im = n * OMEGA * C[c], d = re * re + im * im;
                    ar[c] = (fr[c] * re + fi[c] * im) / d; ai[c] = (fi[c] * re - fr[c] * im) / d;       // F / (re + i·im)
                }
                sr2.set(ar); si2.set(ai);
                gaussianSmooth(g, sr2, tmpS, P.TEMP_LOCAL_KM); gaussianSmooth(g, si2, tmpS, P.TEMP_LOCAL_KM);
                for (let c = 0; c < G; c++) {
                    const f = landFrac[c] * inland[c] * (1 - perennial[c]);
                    if (f > 0) { xr[c] += f * (ar[c] - sr2[c]); xi[c] += f * (ai[c] - si2[c]); }
                }
            };
            addLocal(1, F1r, F1i, c1r, c1i);
            addLocal(2, F2r, F2i, c2r, c2i);
        }

        // Air masses: continentality along the wind. The energy balance spreads heat alike in every direction, but a
        // month's weather is the air the wind brought: maritime air keeps its mildness far inland in winter (Europe)
        // and the continent's cold reaches the east coasts on the offshore winter wind (north-east China, New England).
        // Air over each cell takes on the temperature of the surface beneath it within a time τ — over the sea (and
        // frozen sea as land) TEMP_AIR_SEA_DAYS; over sunlit land, where convection mixes the air, TEMP_AIR_SUN_DAYS;
        // over land under a weak sun, where the air lies stable on colder ground, TEMP_AIR_DARK_DAYS — and is carried by
        // the month's wind meanwhile (σ·A + u·∇A = σ·θ, σ = 1/τ; ridges block it fully). It carries its potential
        // temperature — air coming down from a plateau warms as it sinks, air rising onto one cools. The
        // land's air is A; the sea's surface stays its own. Calm air goes nowhere, so a still interior keeps its own
        // temperature; islands and coasts downwind of the sea take the sea's air.
        const airSolver = winds && P.TEMP_AIR_DARK_DAYS > 0 ? new HelmholtzSolver(g, 0, 0) : null;
        // (the low air itself, not the weather aloft: a range blocks it fully — Pacific air stays out of the Great Plains)
        const airFaces = airSolver && P.TEMP_BLOCK_KM > 0 ? ridgeFaces(ctx, core, g, ratio, landKm, P.TEMP_BLOCK_KM, 0) : null;
        const airCache = new Map(), airA = new Float64Array(G), airAi = new Float64Array(G), airRhs = new Float64Array(G);
        const airSig = new Float64Array(G), airU = new Float64Array(G), airV = new Float64Array(G), airTheta = new Float64Array(G);
        const airMass = (t, T) => {
            let A = airCache.get(t);
            if (!A) {
                const delta = declination(t, tiltDeg);
                const pos = t - 0.5, m0 = Math.floor(pos), fm = pos - m0, ma = ((m0 % 12) + 12) % 12, mb = (ma + 1) % 12;
                const day = 86400, sSea = 1 / (P.TEMP_AIR_SEA_DAYS * day);
                for (let j = 0; j < h; j++) {
                    // stable where the ground loses more heat than the sun gives it (winter poleward of ≈ 45°): below
                    // AIR_STABLE_SUN of daily sunlight, mixed above AIR_MIXED_SUN
                    const q = dailyInsolation(g.lat[j] * Math.PI / 180, delta);
                    let x = (AIR_MIXED_SUN - q) / (AIR_MIXED_SUN - AIR_STABLE_SUN); x = x <= 0 ? 0 : x >= 1 ? 1 : x;
                    const dark = x * x * (3 - 2 * x), sLand = 1 / ((P.TEMP_AIR_SUN_DAYS + (P.TEMP_AIR_DARK_DAYS - P.TEMP_AIR_SUN_DAYS) * dark) * day);
                    for (let i = 0; i < w; i++) {
                        const c = j * w + i, f = landFrac[c], ice = iceRamp(T[c]);
                        airSig[c] = f * sLand + (1 - f) * ((1 - ice) * sSea + ice * sLand);
                        airTheta[c] = T[c] + (DRY_LAPSE - lapseEff[c]) * f * landKm[c];
                        airRhs[c] = airSig[c] * airTheta[c];
                        airU[c] = (1 - fm) * uM[ma * G + c] + fm * uM[mb * G + c]; airV[c] = (1 - fm) * vM[ma * G + c] + fm * vM[mb * G + c];
                    }
                }
                airA.set(airTheta); airAi.fill(0);
                airSolver.setOperator(airSig, zero, airU, airV, 1, airFaces);
                airSolver.solve(airRhs, zero, airA, airAi, { maxCycles: AIR_CYCLES, tol: 1e-4 });
                A = new Float64Array(G);
                for (let c = 0; c < G; c++) A[c] = airA[c] - (DRY_LAPSE - lapseEff[c]) * landFrac[c] * landKm[c];
                airCache.set(t, A);
            }
            for (let c = 0; c < G; c++) if (landFrac[c] > 0) T[c] += landFrac[c] * (A[c] - T[c]);
        };

        // Surface air temperature at time t (months), on the energy-balance grid: the harmonics, the air masses, and —
        // near snowy or icy ground under a weak sun — the winter inversion, the air by the ground colder than the air
        // above it.
        const tmp = new Float64Array(G);
        const surfaceAt = (t, withInversion) => {
            const th = 2 * Math.PI * t / 12, co = Math.cos(th), sn = Math.sin(th), co2 = Math.cos(2 * th), sn2 = Math.sin(2 * th);
            const delta = declination(t, tiltDeg);
            const pos = t - 0.5, m0 = Math.floor(pos), fm = pos - m0, ma = ((m0 % 12) + 12) % 12, mb = (ma + 1) % 12;
            const U0sq = P.TEMP_INVERSION_WIND * P.TEMP_INVERSION_WIND;
            for (let c = 0; c < G; c++) tmp[c] = c0[c] + 2 * (c1r[c] * co - c1i[c] * sn) + 2 * (c2r[c] * co2 - c2i[c] * sn2);
            if (airSolver) airMass(t, tmp);
            for (let j = 0; j < h; j++) {
                const q = dailyInsolation(g.lat[j] * Math.PI / 180, delta);
                let x = 1 - q / WEAK_SUN; x = x <= 0 ? 0 : x >= 1 ? 1 : x;
                const dark = x * x * (3 - 2 * x);
                // Polar summers held back, by the ground like the inversion: near the poles the summer's heat goes into
                // melting snow and ice (and the sea under the pack) rather than warming the air by the ground, while nothing
                // holds the winter up — so above the yearly mean that air keeps only (1 − TEMP_POLAR_SUMMER_DAMP) of its
                // rise, fully from TEMP_POLAR_FULL_DEG, none equatorward of TEMP_POLAR_FROM_DEG (smooth between). Below the
                // yearly mean it is left alone. (In the air the circulation reads, it moved the summer's storm tracks and
                // cost Europe's climate.)
                let px = withInversion && P.TEMP_POLAR_SUMMER_DAMP > 0 ? (Math.abs(g.lat[j]) - P.TEMP_POLAR_FROM_DEG) / (P.TEMP_POLAR_FULL_DEG - P.TEMP_POLAR_FROM_DEG) : 0;
                px = px <= 0 ? 0 : px >= 1 ? 1 : px * px * (3 - 2 * px);
                const keep = 1 - P.TEMP_POLAR_SUMMER_DAMP * px;
                if (px > 0) for (let i = 0; i < w; i++) { const c = j * w + i; if (tmp[c] > c0[c]) tmp[c] = c0[c] + (tmp[c] - c0[c]) * keep; }
                for (let i = 0; i < w; i++) {
                    const c = j * w + i;
                    let T = tmp[c];
                    if (withInversion && dark > 0) {
                        const f = landFrac[c], snow = f * iceRamp(T - lapseEff[c] * surfKm[c]) + (1 - f) * iceRamp(T);
                        let calm = 1;
                        if (winds) {
                            const u = (1 - fm) * uM[ma * G + c] + fm * uM[mb * G + c], v = (1 - fm) * vM[ma * G + c] + fm * vM[mb * G + c];
                            calm = 1 / (1 + (u * u + v * v) / U0sq);          // wind mixes the inversion away
                        }
                        T -= P.TEMP_INVERSION_C * snow * dark * calm;
                    }
                    tmp[c] = T;
                }
            }
            return tmp;
        };
        // Back to the core grid: monthly sea-level temperature (no inversion: used for the sea surface), and the
        // surface air temperature at each grid cell's reference height
        const href = ctx.surface.meanLandKm;
        const domeG = new Float64Array(G);
        for (let c = 0; c < G; c++) { const p = perennial[c] = Math.max(iceSheet(snowYear[c]), perennial[c] * keepSheet(snowYear[c])); lapseEff[c] = P.TEMP_PLATEAU_LAPSE + (P.TEMP_ICE_LAPSE - P.TEMP_PLATEAU_LAPSE) * p; domeG[c] = P.TEMP_ICE_DOME_KM * p; }
        const lapseCore = new Float32Array(core.size), domeCore = new Float32Array(core.size);
        refine(g, core, ratio, lapseEff, lapseCore, 0);
        refine(g, core, ratio, domeG, domeCore, 0);
        const heightCorrect = (out, offset) => {
            for (let c = 0; c < core.size; c++) { const hr = Math.max(href[c] === href[c] ? Math.max(0, href[c]) : 0, domeCore[c]); out[offset + c] -= lapseCore[c] * hr; }
        };
        const monthlySL = new Float32Array(12 * core.size), monthly = new Float32Array(12 * core.size);
        const inversion = new Float32Array(12 * core.size);
        for (let m = 0; m < 12; m++) {
            const sl = surfaceAt(m + 0.5, false);
            refine(g, core, ratio, sl, monthlySL, m * core.size);
            const air = surfaceAt(m + 0.5, true);                     // (surfaceAt's buffer is shared: sl is done with)
            refine(g, core, ratio, air, monthly, m * core.size);
            // (the inversion alone: a layer by the ground — the circulation reads the air above it)
            for (let c = 0, o = m * core.size; c < core.size; c++) inversion[o + c] = monthly[o + c] - monthlySL[o + c];
            heightCorrect(monthly, m * core.size);
        }
        const K = ctx.anchorMonths.length, T = new Float32Array(K * core.size);
        ctx.anchorMonths.forEach((a, k) => { refine(g, core, ratio, surfaceAt(a + 0.5, true), T, k * core.size); heightCorrect(T, k * core.size); });
        // Continentality below the energy-balance grid: the sea's seasons are a fraction of the land's, so a 1° cell's
        // swing about its yearly mean scales with the land around it (within ~1.5°) against the land share the coarse
        // grid saw — coasts milder, interiors harsher, at the scale of single coastlines.
        if (P.TEMP_SEA_SWING < 1 && ratio > 1) {
            const lfCoarse = new Float32Array(core.size), lf = ctx.surface.landFrac, cw = core.w, ch = core.h;
            refine(g, core, ratio, landFrac, lfCoarse, 0);
            const a = P.TEMP_SEA_SWING, Kn = ctx.anchorMonths.length;
            for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
                const c = j * cw + i;
                if (!(lf[c] > 0)) continue;
                let s = 0, n = 0;
                for (let dj = -1; dj <= 1; dj++) { const jj = j + dj; if (jj < 0 || jj >= ch) continue; for (let di = -1; di <= 1; di++) { s += lf[jj * cw + (i + di + cw) % cw]; n++; } }
                const k = Math.max(0.6, Math.min(1.6, (a + (1 - a) * s / n) / (a + (1 - a) * lfCoarse[c])));
                let mean = 0; for (let m = 0; m < 12; m++) mean += monthly[m * core.size + c] / 12;
                for (let m = 0; m < 12; m++) { const q = m * core.size + c; monthly[q] = mean + (monthly[q] - mean) * k; }
                for (let q = 0; q < Kn; q++) { const x = q * core.size + c; T[x] = mean + (T[x] - mean) * k; }
            }
        }
        // Wet tropical ground stays mild. In the tropics the air aloft is nearly the same temperature everywhere (the
        // Coriolis force is weak, so the Hadley circulation evens it out) and the air by the ground follows its own
        // surface — which the energy balance, spreading any local heating over thousands of km, can't see. Rain keeps
        // the ground wet (1 − e^{−P/P₀}) and a wet surface spends the sun's heat on evaporation rather than warming
        // (Δ/(Δ+γ), the equilibrium evaporative share, larger in warm air): the rainy season stays mild and the dry
        // season before the rains is the hottest, as in the real monsoon lands. Full strength from the ITCZ to halfway
        // to each subtropical high, fading out at the high (the circulation's belts, month by month); poleward the
        // energy balance's own seasons stand.
        if (rain && P.TEMP_WET_COOL_C > 0) {
            const lf = ctx.surface.landFrac, N = core.size, cw = core.w, ch = core.h;
            const sunAt = new Float64Array(ch), belts = winds?.belts;
            const adjust = (out, off, t) => {
                const delta = declination(t, tiltDeg);
                const pos = t - 0.5, m0 = Math.floor(pos), f = pos - m0, a = ((m0 % 12) + 12) % 12, b = (a + 1) % 12;
                const bl = (key, def) => belts ? (1 - f) * belts[a][key] + f * belts[b][key] : def;
                const itcz = bl('itcz', 0), hiN = bl('hiN', 30), hiS = bl('hiS', -30);
                for (let j = 0; j < ch; j++) sunAt[j] = tropicsWeight(core.lat[j], itcz, hiN, hiS) * dailyInsolation(core.lat[j] * Math.PI / 180, delta) / WET_SUN_REF;
                for (let c = 0; c < N; c++) {
                    const s = sunAt[(c / cw) | 0];
                    if (!(lf[c] > 0) || s === 0) continue;
                    const p = (1 - f) * rain[a * N + c] + f * rain[b * N + c], wet = 1 - Math.exp(-Math.max(0, p) / WET_MONTH_MM);
                    out[off + c] -= P.TEMP_WET_COOL_C * lf[c] * s * evapShare(out[off + c]) * wet;
                }
            };
            for (let m = 0; m < 12; m++) adjust(monthly, m * N, m + 0.5);
            ctx.anchorMonths.forEach((a, k) => adjust(T, k * N, a + 0.5));
        }
        const iceCore = new Float32Array(core.size);
        refine(g, core, ratio, iceYear, iceCore, 0);
        prof.output = performance.now() - tp;
        // The sea ice by month (the rain stage reads it) and what only the pages draw — worked out when first asked for:
        // the coupled rounds before the last never are. (From this call's own fields alone — the next call copies its
        // start from `state`, it does not write into it — so the same whenever it is asked.)
        let seaIce = null, drawn = null;
        const seaIceOf = () => {
            if (seaIce) return seaIce;
            seaIce = new Float32Array(12 * core.size);
            const iceTmp = new Float64Array(G);
            if (thickOn) thickCycle(iceHm, 12, 0.5);
            for (let m = 0; m < 12; m++) {
                const sl = surfaceAt(m + 0.5, false);
                for (let c = 0; c < G; c++) iceTmp[c] = landFrac[c] < 0.5 ? Math.max(iceRamp(sl[c]), iceHm[m * G + c]) : 0;       // sea ice, by month
                refine(g, core, ratio, iceTmp, seaIce, m * core.size);
            }
            return seaIce;
        };
        // (for the pages' drawing only — grid.js refineForDrawing — the sea's own air temperature and its ice: the energy
        // balance's mostly-land cells carry the land's temperature and no sea ice, and refined linearly that drew every
        // coast's sea with the coarse cells' straight edges (a rim of open water along icy coasts). Here the sea's
        // temperature is carried across its coasts from the sea, its ice follows from it, and both are refined smoothly.
        // And the ice sheets likewise, carried from the land.)
        const drawnOf = () => {
            if (drawn) return drawn;
            seaIceOf();
            const seaSL = new Float32Array(12 * core.size), seaIceOpen = new Float32Array(12 * core.size), slSea = new Float64Array(G), airSea = new Float64Array(G), iceAll = new Float64Array(G);
            const seaCoarse = new Uint8Array(G), landCoarse = new Uint8Array(G);
            for (let c = 0; c < G; c++) { seaCoarse[c] = landFrac[c] < 0.5 ? 1 : 0; landCoarse[c] = landFrac[c] >= 0.5 ? 1 : 0; }
            const iceHmAll = new Float64Array(G);
            for (let m = 0; m < 12; m++) {
                const sl = surfaceAt(m + 0.5, false);
                slSea.set(sl); fillAcross(g, slSea, seaCoarse);
                iceHmAll.set(iceHm.subarray(m * G, (m + 1) * G)); fillAcross(g, iceHmAll, seaCoarse);
                for (let c = 0; c < G; c++) iceAll[c] = Math.max(iceRamp(slSea[c]), iceHmAll[c]);
                refineForDrawing(g, core, ratio, iceAll, seaIceOpen, m * core.size, null, 0, 1);
                airSea.set(surfaceAt(m + 0.5, true));
                refineForDrawing(g, core, ratio, airSea, seaSL, m * core.size, seaCoarse);
            }
            const domeDraw = new Float32Array(core.size);
            refineForDrawing(g, core, ratio, domeG, domeDraw, 0, landCoarse, 0, Infinity);   // (from the land; an island far out, its own)
            return (drawn = { seaSL, seaIceOpen, domeDraw });
        };
        const state = { step: g.step, c0, c1r, c1i, c2r, c2i, snowYear, perennial };
        const out = { T, monthly, monthlySL, iceFrac: iceCore, domeKm: domeCore, inversion, state, solverStats: stats, profile: prof, ms: performance.now() - t0, source: 'energy balance' };
        return Object.defineProperties(out, {
            seaIce: { get: seaIceOf, enumerable: true },
            seaIceOpen: { get: () => drawnOf().seaIceOpen, enumerable: true },
            seaSL: { get: () => drawnOf().seaSL, enumerable: true },
            domeDraw: { get: () => drawnOf().domeDraw, enumerable: true },
        });
    };
}

/**
 * Open share of each face of the energy-balance grid (faces.e: with the east neighbour, faces.n: with the north one):
 * e^{−(ridge − lower side)/H}, averaged over the 1° strips across the face; the ridge of a strip is the highest 1° mean
 * height from one cell's centre to the next, the sides the two cells' mean land heights.
 */
function ridgeFaces(ctx, core, g, ratio, landKm, hKm, floor = BLOCK_FLOOR) {
    const w = g.w, h = g.h, G = g.size, cw1 = core.w, r2 = ratio >> 1, h1 = ctx.surface.meanKm;
    const hAt = (jj, ii) => { const v = h1[jj * cw1 + ((ii % cw1) + cw1) % cw1]; return v > 0 ? v : 0; };
    const faces = { e: new Float64Array(G).fill(1), n: new Float64Array(G).fill(1) };
    if (ratio < 2) return faces;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const c = j * w + i, ce = j * w + (i + 1) % w;
        let se = 0, sn = 0;
        const lowE = Math.min(landKm[c], landKm[ce]);
        for (let s = 0; s < ratio; s++) {
            let me = 0; for (let ii = i * ratio + r2; ii <= (i + 1) * ratio + r2; ii++) me = Math.max(me, hAt(j * ratio + s, ii));
            se += floor + (1 - floor) * Math.exp(-Math.max(0, me - lowE) / hKm);
            if (j > 0) {
                let mn = 0; for (let jj = (j - 1) * ratio + r2; jj <= j * ratio + r2; jj++) mn = Math.max(mn, hAt(jj, i * ratio + s));
                sn += floor + (1 - floor) * Math.exp(-Math.max(0, mn - Math.min(landKm[c], landKm[c - w])) / hKm);
            }
        }
        faces.e[c] = se / ratio;
        if (j > 0) faces.n[c] = sn / ratio;
    }
    return faces;
}

function solveRelaxed(solver, fr, fi, xr, xi, relax, tol) {
    const n = fr.length;
    const nr = new Float64Array(xr), ni = xi ? new Float64Array(xi) : new Float64Array(n);
    const res = solver.solve(fr, fi, nr, ni, { tol, maxCycles: 30 });
    for (let c = 0; c < n; c++) {
        xr[c] += relax * (nr[c] - xr[c]);
        if (xi) xi[c] += relax * (ni[c] - xi[c]);
    }
    return res;
}

// Grid transfers (shared with the circulation stage)
const coarsen = (core, g, ratio, src) => coarsenField(core, g, ratio, src);
const refine = (g, core, ratio, src, out, offset) => refineField(g, core, ratio, src, out, offset);
