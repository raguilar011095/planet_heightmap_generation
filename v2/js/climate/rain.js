// Rain stage: a column-water budget on the climate grid, at each point in the year. DOM-free.
//
// The water vapour in the air column, W (mm = kg/m²), is in balance at each point in the year:
//
//   evaporation − rain − ∇·(u W) + ∇·(K ∇W) = 0
//
//  • Evaporation: from the sea by the bulk formula — faster where the water is warm (Clausius–Clapeyron) and the wind
//    strong (plus the gusts and storms the monthly means leave out), none under sea ice. From land at the same
//    potential rate, limited by the water the ground holds (Turc–Pike: water-limited where it is dry, energy-limited
//    where it is wet) — the month's rain, the snow melting and the soil's store (a small bucket through the year) — so
//    rain that falls on land is partly returned to the air (recycling), even in a dry summer after a snowy winter.
//  • Transport: the column moves with the wind above the surface friction layer (the rotational part of the wind);
//    only a layer near the ground converges into the rain belt and the lows and spreads out of the highs (the divergent
//    part) — shallow under dry air, deep where the column is moist and convecting. Weather systems mix the water
//    (eddy diffusion K), most in the storm belts.
//  • Rain: the column rains out steeply as it nears saturation — rain grows exponentially with the column's relative
//    humidity (Bretherton et al. 2004) — with a saturated column set by the air temperature (Clausius–Clapeyron).
//    Storms, growing where the poleward temperature gradient is strong, spread the humidity within the month and so
//    raise the month's rain (the mid-latitude storm belts, winter rain); so do afternoon storms over sunlit land (land
//    rains at a lower column humidity than the sea). Air over a surface colder than its latitude
//    (cold currents, upwelling, winter continents) is stable and rains less (the coastal deserts, dry winter highs).
//    Air forced up rising ground rains out too — in storms, so at the storms' wind speed — which dries the air beyond
//    the mountains (rain shadows). High ground holds a share of the column that depends on how much it heats the air
//    (a sunlit plateau's moist layer rides up with it; a cold high basin's air is like the free air's).
//  • Below the grid, on the terrain's 1° grid: windward slopes wetter and the lee drier — including whole regions
//    behind a range, looking upwind for the higher ground the air has come down from — rain moved within a few
//    hundred km rather than made.
//
// Solved as a steady problem per point in the year (the multigrid solver of solver.js, transport in flux form so water
// is conserved), with Newton steps for the steep rain-out; a second pass over the year lets snow and soil carry
// water from the wet months into the dry ones.

import { LatLonGrid, coarsenField, refineField } from './grid.js';
import { HelmholtzSolver } from './solver.js';
import { atAnchors } from './inputs.js';
import { PARAMS } from './config.js';
import { dailyInsolation, declination, SOLAR_CONSTANT } from './insolation.js';
import { gaussianSmooth } from './circulation.js';

const R_PLANET = 6.371e6;
const RHO_AIR = 1.2;                          // kg/m³ near the surface
const SECONDS_PER_MONTH = 30.44 * 86400;
const DEG = Math.PI / 180;
const R_MAX = 1.5;                            // column relative humidity beyond which rain-out grows linearly (keeps Newton bounded)
const S_MAX = 0.2;                            // largest spread of the column's relative humidity by storms
const STABLE_MAX_K = 10;                      // stability (surface below its latitude's temperature) counted up to this …
const UNSTABLE_MAX_K = 8;                     // … and instability (above it) up to this
const MELT_MM_PER_C_MONTH = 120;              // degree-day snowmelt, ≈ 4 mm per °C per day
const LATENT = 2.5e6;                         // J/kg, latent heat of vaporisation
const PT_ALPHA = 1.26;                        // Priestley–Taylor coefficient
const SURFACE_SW = 0.55;                      // share of the top-of-atmosphere sunlight reaching the ground (clouds, air)
const NET_LW = 50;                            // W/m², net longwave the ground loses
const ALBEDO_LAND = 0.15, ALBEDO_SNOW = 0.6;
const BRUNT = 0.01;                           // 1/s, buoyancy frequency of the troposphere (Eady growth rate, flow blocking)
const MAX_SHEAR = 4e-3;                       // 1/s, strongest vertical wind shear of a jet (≈ 40 m/s over 10 km)
const STABLE_RELAX_S = 86400;                 // s, time for air to take on the stability of the surface beneath it
const CONVECT_SUN_LOW = SOLAR_CONSTANT / 8;   // W/m² daily sunlight (top of the air) below which land does not convect …
const CONVECT_SUN_FULL = SOLAR_CONSTANT / 4;  // … and above which it does fully (the tropics, the summer)

/** Saturation specific humidity (kg/kg) at T (°C), 1013 hPa — Magnus formula. */
export function qSat(T) {
    const t = Math.max(-60, Math.min(50, T));
    return 0.622 * 6.112 * Math.exp(17.67 * t / (t + 243.5)) / 1013;
}

/** Evaporation from land with water `avail` and potential rate `ep` (same units) — Turc–Pike: the smaller, smoothly. */
const turcPike = (avail, ep) => avail / Math.sqrt(1 + (avail / Math.max(1e-12, ep)) ** 2);

/** The saturated column (mm) above air at T (°C): ≈ ρ q_s H with the water-vapour scale height H. */
export function saturatedColumn(T, vapourHeightKm) {
    return RHO_AIR * qSat(T) * vapourHeightKm * 1000;
}

/**
 * Mountains below the rain grid's scale, on the 1° grid (its land's mean heights), at each point in the year. The wind
 * blowing up a slope lifts the air and wrings out more rain, blowing down it less; and air that has come down from
 * higher ground on its way is dry — the rain shadow: looking upwind along the wind, the largest drop from the ground
 * there to here, each counted less with distance (e^{−d / RAIN_LEE_RECOVER_KM}) as the air takes up moisture again.
 * Air lifted from lower ground on its way has condensed more of its water: windward slopes get wetter with height, up to
 * the crest (the largest rise, weighted the same way; RAIN_RISE_PER_KM).
 * The wind is the storms' as much as the month's mean (orographic rain falls in storms): the mean wind's direction at
 * speed √(U² + (s·σL)²), σ the Eady rate, L the storms' size. factor = e^{β·clamp(w / 0.1 m/s, −2, 2) + κ·rise − λ·drop}
 * (rise and drop in km, each saturating at the vapour scale height).
 * Rain is moved, not made: the factor is normalised over all within RAIN_OROG_SPREAD_KM (sea too), weighted by the rain —
 * windward slopes take it from the lee, so whole regions behind a range are dry.
 */
function orographicRain(ctx, core, g, ratio, uA, vA, shareCoarse, eadyK, Pout, K, tA) {
    const P_ = PARAMS;
    const h = core.h, w = core.w, G = core.size, dRad = core.step * DEG, stepKm = core.step * 111.2;
    const hLand = ctx.surface.meanLandKm, land = ctx.surface.landFrac;
    // the ground the air meets: over land its own height (an island's mountains are not diluted by the sea around them
    // in its 1° cell), over the sea 0
    const hc = (x) => { const v = hLand[x]; return land[x] >= 0.25 && v === v ? Math.max(0, v) : 0; };
    // islands: the sea share around each 1° cell (3 × 3)
    const seaAround = new Float64Array(G);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        let s = 0, n = 0;
        for (let dj = -1; dj <= 1; dj++) { const jj = j + dj; if (jj < 0 || jj >= h) continue; for (let di = -1; di <= 1; di++) { s += 1 - land[jj * w + (i + di + w) % w]; n++; } }
        seaAround[j * w + i] = s / n;
    }
    const recoverKm = P_.RAIN_LEE_RECOVER_KM, beta = P_.RAIN_SLOPE_FACTOR, lambda = P_.RAIN_LEE_PER_KM, Dv = P_.RAIN_VAPOUR_HEIGHT_KM;
    const kappa = P_.RAIN_RISE_PER_KM;
    const nSteps = Math.max(1, Math.min(16, Math.ceil(2.5 * recoverKm / stepKm)));
    const decay = Float64Array.from({ length: nSteps + 1 }, (_, s) => Math.exp(-s * stepKm / recoverKm));
    const Lmix = P_.RAIN_EDDY_LENGTH_KM * 1000;
    const f = new Float64Array(G), A = new Float64Array(G), B = new Float64Array(G), rowA = new Float64Array(G), rowB = new Float64Array(G);
    const pre = new Float64Array(Math.max(w, h) + 1), preB = new Float64Array(Math.max(w, h) + 1);
    const nr = Math.max(1, Math.round(P_.RAIN_OROG_SPREAD_KM / stepKm));
    for (let k = 0; k < K; k++) {
        const off = k * G;
        for (let j = 0; j < h; j++) {
            const cl = Math.max(0.02, Math.cos(core.lat[j] * DEG)), dx = 2 * dRad * R_PLANET * cl, dy = 2 * dRad * R_PLANET;
            const jb = Math.floor(j / ratio), sU = P_.RAIN_OROG_STORM * eadyK[k][jb] / 86400 * Lmix;
            for (let i = 0; i < w; i++) {
                const c = j * w + i;
                f[c] = 1;
                if (!(land[c] > 0)) continue;
                const ce = j * w + (i + 1) % w, cw = j * w + (i - 1 + w) % w;
                const cn = j > 0 ? c - w : c, cs = j < h - 1 ? c + w : c;
                const share = shareCoarse[jb * g.w + Math.floor(i / ratio)] || 0.7;
                const u = uA[off + c] / share, v = vA[off + c] / share, sp = Math.hypot(u, v);
                if (!(sp > 0.1)) { const tw = tA[off + c]; let warm = (tw - 12) / 12; warm = warm <= 0 ? 0 : warm >= 1 ? 1 : warm * warm * (3 - 2 * warm); f[c] = 1 + P_.RAIN_ISLAND_BOOST * seaAround[c] * warm; continue; }
                const boost = Math.hypot(sp, sU) / sp;
                const wUp = boost * (u * (hc(ce) - hc(cw)) * 1000 / dx + v * (hc(cn) - hc(cs)) * 1000 / (cn === c || cs === c ? dy / 2 : dy));
                // the rain shadow and the lift: march upwind in 1° steps (east–west stretched by 1/cos latitude) for the
                // largest drop from higher ground and the largest rise from lower ground on the way, each counted less
                // with distance
                let drop = 0, rise = 0;
                if (lambda > 0 || kappa > 0) {
                    const h0 = hc(c), du = -u / sp, dv = -v / sp;
                    let y = j + 0.5, x = i + 0.5;
                    for (let s = 1; s <= nSteps; s++) {
                        const cls = Math.max(0.05, Math.cos((90 - y * core.step) * DEG));
                        y -= dv; x += du / cls;
                        if (y < 0 || y >= h) break;
                        const d = (hc(Math.floor(y) * w + ((Math.floor(x) % w) + w) % w) - h0) * decay[s];
                        if (d > drop) drop = d;
                        if (-d > rise) rise = -d;
                    }
                }
                // Air lifted higher on its way has condensed more of its water, so windward slopes get wetter with
                // height, up to the crest: × e^{κ·D(1 − e^{−rise/D})}. A drop and a rise count less once they exceed the
                // moist layer (the air has little left to lose or to give) — D, the vapour scale height.
                f[c] = Math.exp(beta * Math.max(-2, Math.min(2, wUp / 0.1)) + kappa * Dv * (1 - Math.exp(-rise / Dv)) - lambda * Dv * (1 - Math.exp(-drop / Dv)));
                // islands draw in the sea's moist air (sea breezes converging over the land heated by day): wetter than
                // the ocean around them, most in warm air
                const tw = tA[off + c]; let warm = (tw - 12) / 12; warm = warm <= 0 ? 0 : warm >= 1 ? 1 : warm * warm * (3 - 2 * warm);
                f[c] *= 1 + P_.RAIN_ISLAND_BOOST * seaAround[c] * warm;
            }
        }
        // normalise over the land around, weighted by its rain: box sums by prefix sums — along each row (its width in
        // cells growing toward the poles, so the box keeps its size in km), then down the columns
        for (let c = 0; c < G; c++) { const q = Math.max(0, Pout[off + c]); A[c] = q * f[c]; B[c] = q; }
        for (let j = 0; j < h; j++) {
            const nc = Math.min(w >> 1, Math.max(1, Math.round(nr / Math.max(0.05, Math.cos(core.lat[j] * DEG)))));
            pre[0] = 0; preB[0] = 0;
            for (let i = 0; i < w; i++) { pre[i + 1] = pre[i] + A[j * w + i]; preB[i + 1] = preB[i] + B[j * w + i]; }
            const sumRange = (P, a, b) => a < 0 ? P[w] - P[a + w] + P[b + 1] : b >= w ? P[w] - P[a] + P[b + 1 - w] : P[b + 1] - P[a];
            for (let i = 0; i < w; i++) {
                const a = i - nc, b = i + nc;
                if (2 * nc + 1 >= w) { rowA[j * w + i] = pre[w]; rowB[j * w + i] = preB[w]; }
                else { rowA[j * w + i] = sumRange(pre, a, b); rowB[j * w + i] = sumRange(preB, a, b); }
            }
        }
        for (let i = 0; i < w; i++) {
            pre[0] = 0; preB[0] = 0;
            for (let j = 0; j < h; j++) { pre[j + 1] = pre[j] + rowA[j * w + i]; preB[j + 1] = preB[j] + rowB[j * w + i]; }
            for (let j = 0; j < h; j++) {
                const c = j * w + i;
                const a = Math.max(0, j - nr), b = Math.min(h - 1, j + nr);
                const sb = preB[b + 1] - preB[a];
                if (sb > 0) Pout[off + c] *= f[c] * sb / (pre[b + 1] - pre[a]);
            }
        }
    }
}

/**
 * stage(ctx, winds, temperature) → { P (K × G, mm/month, at the anchor months), W (K × G, mm of column water),
 * E (K × G, mm/month evaporation), r (K × G, column relative humidity), eady (K arrays of per-row storm growth, 1/day),
 * balance (global rain / evaporation per anchor), cycles, newton, ms }.
 * winds: { u, v } (12 × G, m/s, near the surface) and optionally surfaceShare, surfaceShareLand (near-surface wind as a share of the
 * wind above the friction layer; default: observed-like, 0.75 over the sea and 0.45 over land). temperature:
 * { monthly (surface air at the reference height), monthlySL (sea level: the sea surface), seaIce } (12 × G).
 */
export function columnWaterRain() {
    return (ctx, winds, temperature, init = null) => {
        const t0 = performance.now();
        const P_ = PARAMS;
        // (the page's Precipitation: the planet's water cycle faster or slower — its evaporation, from sea and land, scaled;
        // where the extra water falls, and how far inland it is carried, is the budget's own doing)
        const evapScale = Math.max(0, ctx.options?.precipScale ?? 1);
        const core = ctx.grid;
        const ratio = Math.max(1, Math.round(P_.RAIN_GRID_DEG / core.step));
        const g = ratio > 1 ? new LatLonGrid(core.step * ratio) : core;
        const G = g.size, w = g.w, h = g.h;
        const co = (f) => coarsenField(core, g, ratio, f);
        const land = co(ctx.surface.landFrac);
        const hgt = co(ctx.surface.meanKm.map(x => Math.max(0, x)));
        const cosLat = Float64Array.from(g.lat, l => Math.cos(l * DEG));
        const dRad = g.step * DEG;
        const K = ctx.anchorMonths.length;
        const tau = P_.RAIN_TIMESCALE_H * 3600, a = P_.RAIN_RH_STEEPNESS, b = a / 2, Hv = P_.RAIN_VAPOUR_HEIGHT_KM * 1000;
        const Lmix = P_.RAIN_EDDY_LENGTH_KM * 1000;

        // the inputs at the anchor months
        const uA = atAnchors(winds.u, core.size, ctx.anchorMonths), vA = atAnchors(winds.v, core.size, ctx.anchorMonths);
        const tA = atAnchors(temperature.monthly, core.size, ctx.anchorMonths);
        const sA = atAnchors(temperature.monthlySL, core.size, ctx.anchorMonths);
        const iA = temperature.seaIce ? atAnchors(temperature.seaIce, core.size, ctx.anchorMonths) : null;
        const pA = winds.slp ? atAnchors(winds.slp, core.size, ctx.anchorMonths) : null;      // (the circulation stage's pressure)
        const share = new Float64Array(G);
        for (let c = 0; c < G; c++) share[c] = winds.surfaceShareLand != null ? winds.surfaceShare + (winds.surfaceShareLand - winds.surfaceShare) * land[c]
            : winds.surfaceShare ?? 0.75 - 0.3 * land[c];

        const solver = new HelmholtzSolver(g, 0, 0, { conservative: true });
        // Rising ground blocks the water. The solve is for the sea-level-equivalent column W* (the column over ground
        // at height h holds W = β·W*, β = e^{−h/H}); what crosses a face between two cells — carried or mixed — is the
        // part of the column above the higher of the two, β_face = min β. So water piles up (and rains) windward of
        // mountains, and only a share gets over them. H per point in the year below (terrainShare).
        const Ht = P_.RAIN_TERRAIN_HEIGHT_KM * 1000;
        const poisson = new HelmholtzSolver(g, 1, 1);
        const carrier = new HelmholtzSolver(g, 0, 0);                 // air-mass properties carried by the surface wind
        const zero = new Float64Array(G);
        poisson.setOperator(new Float64Array(G).fill(1e-4), zero, null, null, 0);

        const chi = new Float64Array(G);
        /** The divergent part ∇χ of a wind field, from ∇²χ = ∇·u (a slightly damped Poisson solve on the sphere). */
        function divergentPart(u, v) {
            const dv = new Float64Array(G), chiI = new Float64Array(G);
            let mean = 0, aw = 0;
            for (let j = 0; j < h; j++) {
                const cj = cosLat[j], cn = j > 0 ? cosLat[j - 1] : 0, cs = j < h - 1 ? cosLat[j + 1] : 0;
                for (let i = 0; i < w; i++) {
                    const c = j * w + i, ce = j * w + (i + 1) % w, cw = j * w + (i - 1 + w) % w;
                    const vN = j > 0 ? 0.5 * (v[c] + v[c - w]) * 0.5 * (cj + cn) : 0, vS = j < h - 1 ? 0.5 * (v[c] + v[c + w]) * 0.5 * (cj + cs) : 0;
                    const d = 0.5 * (u[ce] - u[cw]) / (cj * dRad) + (vN - vS) / (cj * dRad);          // R·∇·u
                    dv[c] = d; mean += d * cj; aw += cj;
                }
            }
            mean /= aw;
            for (let c = 0; c < G; c++) dv[c] = -(dv[c] - mean) * R_PLANET;                      // −R²∇·u
            poisson.solve(dv, zero, chi, chiI, { maxCycles: P_.RAIN_POISSON_CYCLES, tol: 1e-4 });     // χ starts from the last point's
            const ud = new Float64Array(G), vd = new Float64Array(G);
            for (let j = 0; j < h; j++) {
                const cj = Math.max(0.02, cosLat[j]);
                for (let i = 0; i < w; i++) {
                    const c = j * w + i, ce = j * w + (i + 1) % w, cw = j * w + (i - 1 + w) % w;
                    const cn = j > 0 ? c - w : c, cs = j < h - 1 ? c + w : c;
                    ud[c] = (chi[ce] - chi[cw]) / (2 * dRad * cj * R_PLANET);
                    vd[c] = (chi[cn] - chi[cs]) / ((cn === c || cs === c ? 1 : 2) * dRad * R_PLANET);
                }
            }
            return { ud, vd };
        }

        // ── Per point in the year: the moisture wind, mixing, storm and stability factors, lift, evaporation ──
        const prep = [], eadyOut = [];
        for (let k = 0; k < K; k++) {
            const sl = (arr) => arr.subarray(k * core.size, (k + 1) * core.size);
            const u = co(sl(uA)), v = co(sl(vA)), Tair = co(sl(tA)), Tsl = co(sl(sA));
            const ice = iA ? co(sl(iA)) : null;
            const p = { gu: new Float64Array(G), gv: new Float64Array(G), ur: new Float64Array(G), vr: new Float64Array(G), ud: null, vd: null,
                Krow: new Float64Array(h), rate: new Float64Array(G),
                lift: new Float64Array(G), Ws: new Float64Array(G), eSea: new Float64Array(G), eLand: new Float64Array(G),
                snow: new Float64Array(G), Tair: new Float64Array(G) };

            // The wind that carries the water: the rotational part of the wind above the friction layer moves the whole
            // column; the divergent part moves only the water of the layer that converges or spreads (setWind below).
            const { ud, vd } = divergentPart(u, v);
            p.ud = ud; p.vd = vd;
            for (let c = 0; c < G; c++) {
                p.ur[c] = P_.RAIN_WIND_ROT * (u[c] - ud[c]) / share[c];
                p.vr[c] = P_.RAIN_WIND_ROT * (v[c] - vd[c]) / share[c];
                p.gu[c] = p.ur[c] + P_.RAIN_WIND_DIV_DRY * ud[c];
                p.gv[c] = p.vr[c] + P_.RAIN_WIND_DIV_DRY * vd[c];
            }

            // Storms grow at the Eady rate of the zonal-mean temperature gradient (below). Within a month they spread the column's relative humidity about its mean — by
            // s = RAIN_STORM_RH × σ (per day), saturating at S_MAX — and rain grows exponentially with humidity, so the
            // month's rain is boosted by e^{(a·s)²/2} (the mean of e^{a·r} over a normal spread). The same storms mix
            // the moisture (K = K_min + σ·L²) and gust over the sea (speed σ·L).
            const Tz = new Float64Array(h), Tzs = new Float64Array(h), eady = new Float64Array(h);
            for (let j = 0; j < h; j++) { let t = 0; for (let i = 0; i < w; i++) t += Tsl[j * w + i]; Tz[j] = t / w; }
            const sm = Math.max(1, Math.round(8 / g.step));                          // baroclinic zones are broad (≈ ±8°)
            for (let j = 0; j < h; j++) { let t = 0, n = 0; for (let d = -sm; d <= sm; d++) { const jj = j + d; if (jj >= 0 && jj < h) { t += Tz[jj]; n++; } } Tzs[j] = t / n; }
            for (let j = 0; j < h; j++) {
                const jn = Math.max(0, j - 1), js = Math.min(h - 1, j + 1);
                const grad = Math.abs(Tzs[jn] - Tzs[js]) / ((js - jn) * dRad * R_PLANET);
                // σ = 0.31·(f/N)·Λ with the thermal-wind shear Λ = g·|∂T/∂y|/(f·T), capped at a realistic jet shear —
                // so storms fade toward the equator, where the thermal wind no longer holds
                const f = 2 * 7.292e-5 * Math.abs(Math.sin(g.lat[j] * DEG));
                const shear = Math.min(MAX_SHEAR, 9.81 * grad / (Math.max(1e-9, f) * (Tzs[j] + 273.15)));
                eady[j] = 0.31 * f / BRUNT * shear;                                                         // 1/s
                p.Krow[j] = (P_.RAIN_EDDY_DIFF + eady[j] * Lmix * Lmix) / (R_PLANET * R_PLANET);
            }
            eadyOut.push(Float32Array.from(eady, x => x * 86400));

            // Stability: how much colder the surface is than the air above it — set by its region's surface within
            // RAIN_STABLE_REF_KM (the air mass's scale), not by its latitude's mean: measured against a latitude that is
            // mostly sea, every winter continent counted as stable and lost its winter rain (cold deserts at 40–60° on
            // planets whose mid-latitudes are mostly ocean). It belongs to the air mass — air off a cold sea stays stable
            // over the coast — so it is carried by the surface wind and relaxes to the local value within about a day:
            // σ·S + u·∇S = σ·S_local.
            const Sloc = new Float64Array(G), Sair = new Float64Array(G), SairI = new Float64Array(G);
            // Air sinking under a high (pressure above its latitude's mean: the eastern-ocean highs in summer) is dry and
            // capped by an inversion — counted as RAIN_HIGH_K_PER_HPA more stability per hPa, and carried onshore
            // with the rest, so the coasts downwind of a summer high get dry summers (Mediterranean climates)
            const slp = pA ? co(sl(pA)) : null, slpRow = new Float64Array(h);
            if (slp) for (let j = 0; j < h; j++) { let s2 = 0; for (let i = 0; i < w; i++) s2 += slp[j * w + i]; slpRow[j] = s2 / w; }
            // (the subtropical highs only: the descent fades from 5° to 15° poleward of each hemisphere's high — beyond it,
            // summer highs over cool seas are shallow and storms bring the rain)
            const mIdx = ((Math.round(ctx.anchorMonths[k]) % 12) + 12) % 12, belt = winds.belts?.[mIdx];
            const hiN = belt ? belt.hiN : 32, hiS = belt ? belt.hiS : -32;
            const descent = (lat) => Math.min(1, Math.max(0, lat >= 0 ? (hiN + 15 - lat) / 10 : (lat - hiS + 15) / 10));
            const Tref = Float64Array.from(Tsl);
            gaussianSmooth(g, Tref, new Float64Array(G), P_.RAIN_STABLE_REF_KM);
            for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
                const c = j * w + i, high = slp ? P_.RAIN_HIGH_K_PER_HPA * descent(g.lat[j]) * Math.max(0, slp[c] - slpRow[j]) : 0;
                // (instability only off the sea — a warm current, a warm sea under colder air — carried onshore by the
                // wind; land's own heat, a desert's summer, does not make its air rain)
                let sv = Tref[c] - Tsl[c] + high;
                if (sv < 0) sv *= 1 - land[c];
                Sloc[c] = Math.min(STABLE_MAX_K, Math.max(-UNSTABLE_MAX_K, sv)) / STABLE_RELAX_S; Sair[c] = Sloc[c] * STABLE_RELAX_S;
            }
            carrier.setOperator(new Float64Array(G).fill(1 / STABLE_RELAX_S), zero, u, v, 1);
            carrier.solve(Sloc, zero, Sair, SairI, { maxCycles: P_.RAIN_CARRIER_CYCLES, tol: 1e-3 });

            const delta = declination(ctx.anchorMonths[k] + 0.5, ctx.options.tiltDeg ?? 23.44);
            const sun = Float64Array.from(g.lat, l => dailyInsolation(l * DEG, delta));
            // land convection's share of full strength by the day's sunlight: none under a winter sun, full in the
            // tropics and the summer (CONVECT_SUN_LOW … CONVECT_SUN_FULL of daily sunlight at the top of the air)
            p.sunConv = Float64Array.from(sun, q => { const x = Math.min(1, Math.max(0, (q - CONVECT_SUN_LOW) / (CONVECT_SUN_FULL - CONVECT_SUN_LOW))); return x * x * (3 - 2 * x); });
            // Tropical disturbances: where the low-level winds turn cyclonically (westerlies on the equator's side of a
            // trough, easterlies on the pole's — a monsoon trough), lows and waves form and run along it (the monsoon
            // depressions that bring the Ganges plain much of its rain, the African easterly waves, the Australian monsoon's
            // lows), spreading the column's humidity within the month as the storms of the mid-latitudes do — by
            // RAIN_TROPICAL_RH × the cyclonic vorticity (per day), smoothed over RAIN_TROPICAL_KM, within the tropics
            // (fading out from 25° to 40°, where the storms above take over).
            const trop = new Float64Array(G);
            if (P_.RAIN_TROPICAL_RH > 0) {
                for (let j = 1; j < h - 1; j++) {
                    const sgn = g.lat[j] >= 0 ? 1 : -1, cj = Math.max(0.05, cosLat[j]), dx = 2 * dRad * R_PLANET * cj, dy = 2 * dRad * R_PLANET;
                    for (let i = 0; i < w; i++) {
                        const c = j * w + i, ce = j * w + (i + 1) % w, cw = j * w + (i - 1 + w) % w;
                        const zeta = (v[ce] - v[cw]) / dx - (u[c - w] * cosLat[j - 1] - u[c + w] * cosLat[j + 1]) / (dy * cj);
                        trop[c] = Math.max(0, sgn * zeta);
                    }
                }
                gaussianSmooth(g, trop, new Float64Array(G), P_.RAIN_TROPICAL_KM);
                for (let j = 0; j < h; j++) {
                    const x = Math.min(1, Math.max(0, (Math.abs(g.lat[j]) - 25) / 15)), fade = 1 - x * x * (3 - 2 * x);
                    for (let i = 0; i < w; i++) {
                        const c = j * w + i, xt = P_.RAIN_TROPICAL_RH * trop[c] * 86400 * fade;
                        trop[c] = S_MAX * (1 - Math.exp(-xt / S_MAX));
                    }
                }
            }
            for (let j = 0; j < h; j++) {
                const x = P_.RAIN_STORM_RH * eady[j] * 86400, sd = S_MAX * (1 - Math.exp(-x / S_MAX));
                const gust2 = P_.OCEAN_GUST_MS ** 2 + (eady[j] * Lmix) ** 2;
                const cj = Math.max(0.02, cosLat[j]), dx = 2 * dRad * R_PLANET * cj, dy = 2 * dRad * R_PLANET;
                for (let i = 0; i < w; i++) {
                    const c = j * w + i, ce = j * w + (i + 1) % w, cw = j * w + (i - 1 + w) % w;
                    const cn = j > 0 ? c - w : c, cs = j < h - 1 ? c + w : c;
                    // stable air (surface colder than its latitude): humidity effectively lowered by κ per K
                    // … and unstable air (off a sea warmer than its latitude: a warm current, a warm sea under colder
                    // air, carried onshore by the wind) convects and rains more — humidity effectively raised by
                    // RAIN_INSTABILITY per K
                    const stable = Sair[c] >= 0 ? Math.exp(-a * P_.RAIN_STABILITY * Sair[c]) : Math.exp(-a * P_.RAIN_INSTABILITY * Sair[c]);
                    // Land convection: sunlit ground heats the air near it by day, and afternoon storms spread the
                    // column's humidity within the month (as the storms of the mid-latitudes do) — over land rain picks up
                    // at a lower column humidity than over the sea: × e^{(a·s)²/2}, s = RAIN_LAND_CONVECTION × the sun's
                    // share (none under a winter sun). A desert's air is too dry for it to matter much.
                    const sc = a * P_.RAIN_LAND_CONVECTION * land[c] * p.sunConv[j];
                    // (the storms' and the tropical disturbances' spreads add as variances)
                    const storm = Math.exp(0.5 * a * a * (sd * sd + trop[c] * trop[c]));
                    p.rate[c] = storm * stable * Math.exp(0.5 * sc * sc);
                    // Lift where the wind blows up rising ground (1/s per unit of column water: upslope speed over the
                    // vapour scale height, times the share that rains out). Orographic rain falls in storms, so the wind
                    // is taken at the storms' speed as well as the mean's — the mean wind's direction, √(U² + (s·σL)²).
                    // Only the air above the blocked layer goes over the mountain — a share Fr = U/(N·H) of it when the
                    // Froude number is below 1; the rest flows around.
                    const dhdx = (hgt[ce] - hgt[cw]) * 1000 / dx, dhdy = (hgt[cn] - hgt[cs]) * 1000 / dy;
                    const speed0 = Math.hypot(p.gu[c], p.gv[c]), speed = Math.hypot(speed0, P_.RAIN_OROG_STORM * eady[j] * Lmix);
                    const H = Math.max(hgt[ce], hgt[cw], hgt[cn], hgt[cs], hgt[c]) * 1000;
                    const over = H > 0 ? Math.min(1, speed / (BRUNT * H)) : 1;
                    const boost = speed0 > 0.1 ? speed / speed0 : 0;
                    p.lift[c] = stable * over * P_.RAIN_OROGRAPHIC * boost * Math.max(0, p.gu[c] * dhdx + p.gv[c] * dhdy) / Hv;
                    // saturated column (mm) and evaporation (kg m⁻² s⁻¹): the sea's, and the land's potential rate
                    // the column's temperature follows the surface only in part — the troposphere above a hot or frozen
                    // surface stays nearer its latitude's temperature — and that sets how much water it holds
                    p.Ws[c] = saturatedColumn(Tair[c] + (1 - P_.RAIN_COLUMN_LOCAL) * (Tzs[j] - Tsl[c]), P_.RAIN_VAPOUR_HEIGHT_KM);
                    p.snow[c] = Math.min(1, Math.max(0, (2 - Tair[c]) / 4));            // share of the rain falling as snow
                    p.Tair[c] = Tair[c];
                    const bulk = RHO_AIR * P_.RAIN_EVAP_COEFF * Math.sqrt(u[c] * u[c] + v[c] * v[c] + gust2) * (1 - P_.RAIN_SURFACE_RH);
                    p.eSea[c] = evapScale * (1 - land[c]) * bulk * qSat(Tsl[c]) * (ice ? 1 - Math.min(1, ice[c]) : 1);
                    // Land's potential evaporation is limited by the energy it gets (Priestley–Taylor): the sunlight
                    // reaching the ground minus its net longwave loss, times Δ/(Δ + γ) (Clausius–Clapeyron slope Δ,
                    // psychrometric constant γ) — little in cold or dark months, most in the sunny tropics.
                    const alb = ALBEDO_LAND + (ALBEDO_SNOW - ALBEDO_LAND) * p.snow[c];
                    const rn = Math.max(0, SURFACE_SW * (1 - alb) * sun[j] - NET_LW);
                    const tc = Math.max(-40, Math.min(45, Tair[c])), es = 6.112 * Math.exp(17.67 * tc / (tc + 243.5));
                    const slope = es * 17.67 * 243.5 / ((tc + 243.5) ** 2);
                    p.eLand[c] = evapScale * PT_ALPHA * slope / (slope + 0.66) * rn / LATENT;   // kg m⁻² s⁻¹ per unit land area
                }
            }
            // The column's share over high ground: the moist boundary layer rides up with ground that heats the air
            // above it — a sunlit plateau in summer (RAIN_TERRAIN_HEIGHT_KM, from the water observed over the Tibetan
            // Plateau in the monsoon) — but over ground no warmer than its latitude (winter, cold high basins) the
            // water falls off with height like the free air's (the vapour scale height): smooth between, over
            // RAIN_TERRAIN_HEAT_K of warmth.
            p.beta = new Float64Array(G); p.faces = { e: new Float64Array(G), n: new Float64Array(G) };
            for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
                const c = j * w + i;
                let x = P_.RAIN_TERRAIN_HEAT_K > 0 ? (Tsl[c] - Tzs[j]) / P_.RAIN_TERRAIN_HEAT_K : 1;
                x = x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
                p.beta[c] = Math.exp(-hgt[c] * 1000 / (Hv + (Ht - Hv) * x));
            }
            for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
                const c = j * w + i, ce = j * w + (i + 1) % w, cn = j > 0 ? c - w : c;
                p.faces.e[c] = Math.min(p.beta[c], p.beta[ce]);
                p.faces.n[c] = Math.min(p.beta[c], p.beta[cn]);
            }
            if (globalThis.RAIN_DEBUG) p.Sair = Float64Array.from(Sair);
            prep.push(p);
        }

        /**
         * The divergent part of the moisture wind by how deep the converging layer is: shallow where the air is dry
         * (heat lows under dry air aloft, the trade-wind layer), deep where the column is moist and convecting (the rain
         * belt, monsoons, rainforests) — from RAIN_WIND_DIV_DRY to RAIN_WIND_DIV_MOIST of the near-surface wind as the
         * column's relative humidity rises from RAIN_DEEP_R0 to RAIN_DEEP_R1.
         */
        function setWind(p, Wv) {
            const d0 = P_.RAIN_WIND_DIV_DRY, d1 = P_.RAIN_WIND_DIV_MOIST;
            for (let c = 0; c < G; c++) {
                const x = Math.min(1, Math.max(0, (Wv[c] / p.Ws[c] - P_.RAIN_DEEP_R0) / (P_.RAIN_DEEP_R1 - P_.RAIN_DEEP_R0))), s = x * x * (3 - 2 * x);
                const d = d0 + (d1 - d0) * s;
                p.gu[c] = p.ur[c] + d * p.ud[c];
                p.gv[c] = p.vr[c] + d * p.vd[c];
            }
        }

        const prof = { prep: performance.now() - t0, pass1: 0, ground: 0, pass2: 0, output: 0, newton1: 0, newton2: 0 };
        let tq = performance.now();
        // ── The budget at one point in the year ──
        const sigma = new Float64Array(G), src = new Float64Array(G), srcI = new Float64Array(G), Wi = new Float64Array(G);
        const Wold = new Float64Array(G);
        let cycles = 0, newton = 0;
        /**
         * Newton steps on the budget at anchor k, from the column water in Wv (updated in place). ground: the snow melting
         * and the soil water stored at this point in the year (kg m⁻² s⁻¹, per unit land area), or null (pass 1: the
         * land evaporates only the month's rain). Returns { P, E, balance }.
         */
        function solveAnchor(k, Wv, ground) {
            const p = prep[k], Ws = p.Ws, rate = p.rate, lift = p.lift, beta = p.beta, faces = p.faces;
            // Rain-out rate and its slope in W. In the air: (Ws/τ)·rate·e^{a(r−1)}, continued linearly beyond R_MAX. Over
            // rising ground: the lifted water λ·W, of which less condenses the drier the air (it must first be lifted
            // to its condensation level): × e^{(a/2)(r−1)}.
            const rainOf = (c, Wc) => {
                const r = Wc / Ws[c];
                const e = r < R_MAX ? Math.exp(a * (r - 1)) : Math.exp(a * (R_MAX - 1)) * (1 + a * (r - R_MAX));
                const eo = r < R_MAX ? Math.exp(b * (r - 1)) : Math.exp(b * (R_MAX - 1)) * (1 + b * (r - R_MAX));
                return Ws[c] / tau * rate[c] * e + lift[c] * Wc * eo;
            };
            const slopeOf = (c, Wc) => {
                const r = Math.min(R_MAX, Wc / Ws[c]);
                return a / tau * rate[c] * Math.exp(a * (r - 1)) + lift[c] * Math.exp(b * (r - 1)) * (1 + b * r);
            };
            solver.setRowDiffusion(p.Krow, p.Krow);
            const P = new Float64Array(G), E = new Float64Array(G);
            for (let c = 0; c < G; c++) P[c] = rainOf(c, Wv[c]);
            // Newton steps. Where the air starts too dry the tangent is nearly flat and a full step would overshoot
            // enormously, so a step may raise the relative humidity by at most 2/a (rain × e² at most); steps down need
            // no limit (from above, Newton on a convex law never undershoots).
            const up = 2 / a;
            let sp = 0, se = 0;
            const Wstar = new Float64Array(G);
            for (let it = 0; it < P_.RAIN_NEWTON; it++) {
                for (let c = 0; c < G; c++) {
                    // land evaporation (Turc–Pike) from the water the ground holds: the month's rain (not its snow), the
                    // snow melting and the soil's store
                    const f = land[c];
                    let el = 0;
                    if (f > 0) {
                        const avail = ground ? P[c] * (1 - p.snow[c]) + ground.melt[c] + ground.soil[c] : P[c], ep = p.eLand[c];
                        el = f * turcPike(avail, ep);
                    }
                    E[c] = p.eSea[c] + el;
                    const W0 = Wv[c], s = slopeOf(c, W0);
                    sigma[c] = s * beta[c];                             // rain in terms of W* (W = β·W*)
                    src[c] = E[c] + s * W0 - rainOf(c, W0);
                    Wold[c] = W0;
                    Wstar[c] = W0 / beta[c];
                }
                setWind(p, Wv);
                solver.setOperator(sigma, zero, p.gu, p.gv, 1, faces);
                const res = solver.solve(src, srcI, Wstar, Wi, { maxCycles: P_.RAIN_CYCLES, tol: 1e-4 });
                cycles += res.cycles; newton++;
                let change = 0, wsum = 0; sp = 0; se = 0;
                for (let j = 0; j < h; j++) {
                    const cl = cosLat[j];
                    for (let i = 0; i < w; i++) {
                        const c = j * w + i;
                        let wn = Wstar[c] * beta[c];
                        if (!(wn > 0)) wn = 0;
                        if (wn > Wold[c] + up * Ws[c]) wn = Wold[c] + up * Ws[c];
                        Wv[c] = wn;
                        P[c] = rainOf(c, wn);
                        change += Math.abs(wn - Wold[c]) * cl; wsum += wn * cl; sp += P[c] * cl; se += E[c] * cl;
                    }
                }
                if (change < P_.RAIN_TOL * wsum && Math.abs(sp / se - 1) < 10 * P_.RAIN_TOL) break;
            }
            return { P, E, balance: sp / se };
        }

        // ── Pass 1 through the year (each point starting from the one before), then pass 2 with the soil's store ──
        // (a previous result — an earlier round of the coupled climate — gives every point a warm start)
        const warm = init && init.step === g.step && init.Wk?.length === K ? init.Wk : null;
        const Wk = [];
        let Wv = new Float64Array(G);
        for (let c = 0; c < G; c++) Wv[c] = 0.7 * prep[0].Ws[c];
        let results = [];
        for (let k = 0; k < K; k++) {
            if (warm) Wv = Float64Array.from(warm[k]);
            if (k > 0 || warm) for (let c = 0; c < G; c++) Wv[c] = Math.min(Wv[c], 1.2 * prep[k].Ws[c]);
            results.push(solveAnchor(k, Wv, null));
            Wk.push(Float64Array.from(Wv));
        }
        // The ground through the year (from pass 1's rain, two turns for a steady cycle): snow piles up below freezing
        // and melts above it (degree-day melt); the soil holds up to RAIN_SOIL_MM and gives water to evaporation.
        prof.pass1 = performance.now() - tq; prof.newton1 = newton; tq = performance.now();
        if (P_.RAIN_SOIL_MM > 0) {
            const dtM = 12 / K, SEC = SECONDS_PER_MONTH, Smax = P_.RAIN_SOIL_MM;
            const ground = Array.from({ length: K }, () => ({ melt: new Float64Array(G), soil: new Float64Array(G) }));
            for (let c = 0; c < G; c++) {
                if (!(land[c] > 0)) continue;
                let snow = 0, S = 0.5 * Smax;
                for (let turn = 0; turn < 2; turn++) for (let k = 0; k < K; k++) {
                    const p = prep[k], Pm = results[k].P[c] * SEC, Ep = p.eLand[c] * SEC, T = p.Tair[c];
                    snow += Pm * p.snow[c] * dtM;
                    const melt = T > 0 ? Math.min(snow, MELT_MM_PER_C_MONTH * T * dtM) : 0;
                    snow -= melt;
                    const input = Pm * (1 - p.snow[c]) + melt / dtM;                       // mm/month
                    if (turn === 1) { ground[k].melt[c] = melt / dtM / SEC; ground[k].soil[c] = S / dtM / SEC; }
                    const et = turcPike(input + S / dtM, Ep);
                    S = Math.min(Smax, Math.max(0, S + (input - et) * dtM));
                }
            }
            prof.ground = performance.now() - tq; tq = performance.now();
            results = Wk.map((Wa, k) => solveAnchor(k, Wa, ground[k]));
            prof.pass2 = performance.now() - tq; prof.newton2 = newton - prof.newton1; tq = performance.now();
        }

        const Pout = new Float32Array(K * core.size), Wout = new Float32Array(K * core.size);
        const Eout = new Float32Array(K * core.size), Rout = new Float32Array(K * core.size);
        const tmp = new Float64Array(G);
        for (let k = 0; k < K; k++) {
            const off = k * core.size, { P, E } = results[k];
            for (let c = 0; c < G; c++) tmp[c] = P[c] * SECONDS_PER_MONTH;
            refineField(g, core, ratio, tmp, Pout, off);
            for (let c = 0; c < G; c++) tmp[c] = E[c] * SECONDS_PER_MONTH;
            refineField(g, core, ratio, tmp, Eout, off);
            refineField(g, core, ratio, Wk[k], Wout, off);
            for (let c = 0; c < G; c++) tmp[c] = Wk[k][c] / prep[k].Ws[c];
            refineField(g, core, ratio, tmp, Rout, off);
        }
        // the mountains' share of the rain: the year's rain with them over the year's without (1: none; > 1 the windward
        // slopes, < 1 the rain shadows) — for display (the Rain Shadow layer); and each anchor's own (orographicK), for
        // its seasons
        const before = new Float64Array(core.size), beforeK = new Float32Array(Pout.length);
        for (let k = 0; k < K; k++) for (let c = 0; c < core.size; c++) before[c] += beforeK[k * core.size + c] = Math.max(0, Pout[k * core.size + c]);
        if (P_.RAIN_SLOPE_FACTOR > 0 || P_.RAIN_LEE_PER_KM > 0 || P_.RAIN_ISLAND_BOOST > 0) orographicRain(ctx, core, g, ratio, uA, vA, share, eadyOut, Pout, K, tA);
        for (let i = 0; i < Pout.length; i++) if (!(Pout[i] > 0)) Pout[i] = 0;
        const orographic = new Float32Array(core.size), orographicK = new Float32Array(Pout.length);
        for (let c = 0; c < core.size; c++) {
            let after = 0;
            for (let k = 0; k < K; k++) after += Pout[k * core.size + c];
            orographic[c] = before[c] > 0 ? after / before[c] : 1;
        }
        for (let i = 0; i < Pout.length; i++) orographicK[i] = beforeK[i] > 0 ? Pout[i] / beforeK[i] : 1;
        // The polar front (after Worldbuilding Pasta): each hemisphere's frontal storm band, RAIN_FRONT_POS of the way from
        // its subtropical high to its subpolar low that month (≈ 40°–50°, moving with the seasons), brings land a baseline of
        // RAIN_FRONT_MM a month at its centre (Gaussian ±RAIN_FRONT_DEG) — the fronts' own lift as they sweep inland, which
        // the monthly mean budget leaves out — faded under pressure above the latitude's mean (e-folding RAIN_FRONT_HIGH_HPA:
        // the highs) and in rain shadows (× the mountains' share of that anchor's rain, at most 1: the shadow of its own
        // winds).
        if (P_.RAIN_FRONT_MM > 0 && winds.belts && winds.slp) {
            const cw = core.w, ch = core.h, lf = ctx.surface.landFrac, sg = P_.RAIN_FRONT_DEG;
            for (let k = 0; k < K; k++) {
                const m = ((Math.round(ctx.anchorMonths[k]) % 12) + 12) % 12, b = winds.belts[m], sl = winds.slp.subarray(m * core.size, (m + 1) * core.size);
                const fN = b.hiN + P_.RAIN_FRONT_POS * (b.loN - b.hiN), fS = b.hiS + P_.RAIN_FRONT_POS * (b.loS - b.hiS);
                for (let j = 0; j < ch; j++) {
                    const la = core.lat[j], wf = Math.exp(-(((la - fN) / sg) ** 2)) + Math.exp(-(((la - fS) / sg) ** 2));
                    if (wf < 1e-3) continue;
                    let row = 0;
                    for (let i = 0; i < cw; i++) row += sl[j * cw + i] / cw;
                    for (let i = 0; i < cw; i++) {
                        const c = j * cw + i;
                        if (!(lf[c] > 0)) continue;
                        Pout[k * core.size + c] += lf[c] * P_.RAIN_FRONT_MM * wf * Math.exp(-Math.max(0, sl[c] - row) / P_.RAIN_FRONT_HIGH_HPA) * Math.min(1, orographicK[k * core.size + c]);
                    }
                }
            }
        }
        const out = { P: Pout, W: Wout, E: Eout, r: Rout, orographic, orographicK, eady: eadyOut, balance: results.map(r => r.balance), cycles, newton,
            state: { step: g.step, Wk }, profile: prof, ms: performance.now() - t0, source: 'column water' };
        if (globalThis.RAIN_DEBUG) out.debug = { g, prep, Wk, results, land, hgt };
        return out;
    };
}
