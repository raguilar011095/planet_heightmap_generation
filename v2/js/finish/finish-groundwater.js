// The ground's water (issue #87): soils, groundwater, springs, oases and wetlands — the finish's `groundwater` stage, only
// when finishPlanet is asked for it (`groundwater`). It reads the finished moment and adds layers; nothing else the finish
// computes is changed. Sources, parameters and what is missing: plans/V2_GROUNDWATER_RESEARCH.md.
//   · soils: each rock's texture, weathering and nutrients as Songs of the Eons has them (SongsOfFOSS, MIT:
//     libsote/rock-qualities.lua, soils/gen-parent-material.lua), the young sediment by what laid it (sand seas, loess,
//     the ice age's till, river plains); the soil's conductivity from its texture (Cosby et al. 1984), its infiltration and
//     the water it holds by SotE's weights (hydrology/calculate-waterflow.lua);
//   · recharge: the share of the runoff that goes underground — by the rock's permeability (Gleeson et al. 2011 classes),
//     the soil's infiltration (SotE), the slope and frozen ground — and part of what rivers lose through their beds in
//     dry country (finish-hydro.js: bedLossMPerYear);
//   · the water table at equilibrium (Fan, Li & Miguez-Macho 2013): Darcy flow between cells, the transmissivity falling
//     with depth below the soil (e-folding f = 120 m / (1 + 150 s), f ≥ 5 m, less in frozen ground), held at sea level on
//     the coast and at the lakes' level; drained by the streams finer than the mesh (their spacing by the rock's valley
//     density, geology-config.js lithology.dissect: Dupuit between parallel drains), by evaporation where it is shallow
//     in dry country, by seepage where it reaches the surface (reset to the surface, as Fan's);
//   · from it: depth, the share of each cell within 0.25, 1 and 3 m (a hillslope between its streams), springs, oases,
//     wetlands by kind (freshwater marsh, wet meadow, peat, mangrove, salt marsh, floodplain).

import { GEOLOGY } from '../geology/geology-config.js';

const SEC_PER_YEAR = 3.156e7;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const sig = x => 1 / (1 + Math.exp(-4 * x));

/** Wetland kinds (groundWetType, low 3 bits; bit 6: on the coast; bit 7: with trees — a swamp forest). */
export const WET = Object.freeze({ NONE: 0, MARSH: 1, MEADOW: 2, PEAT: 3, MANGROVE: 4, SALT: 5, FLOODPLAIN: 6, COAST: 64, FOREST: 128 });
/** Springs: on a slope or at a change of rock; karst; in dry country. */
export const SPRING = Object.freeze({ NONE: 0, CONTACT: 1, KARST: 2, DRY: 3 });
/** Oases: groundwater at the surface; a river across the desert; wells reach it; a salt flat. */
export const OASIS = Object.freeze({ NONE: 0, SPRING: 1, RIVER: 2, WELLS: 3, SALT_FLAT: 4 });

export const GROUNDWATER = {
    // per rock, in rocks.js Rock's order: sea, young sediment, sandstone, shale, limestone, salt, basalt, andesite &
    // rhyolite, granite, slate & schist, gneiss, shield, greenstone, ophiolite
    // permeability, log10 m² (Gleeson et al. 2011: unconsolidated −13 (coarse −10.9, fine −14), siliciclastic coarse −12.5,
    // fine −16.5, carbonate −11.8, crystalline −14.1, volcanic −12.5; evaporites tight) — limestone here undissolved…
    logK: [-13, -12.5, -12.5, -16.5, -13.2, -18, -12.5, -13.5, -14.1, -14.5, -14.1, -14.3, -14.5, -14.5],
    karstLogK: 2.2,             // …and this much more where it dissolves (wet and not frozen: geology-config.js solubleRainMm, solubleTempC)
    specificYield: [0.1, 0.2, 0.12, 0.02, 0.03, 0.01, 0.05, 0.05, 0.01, 0.01, 0.01, 0.01, 0.01, 0.02],
    // SotE's parent material (rock-qualities.lua): sand, silt, clay %, mass conversion, weathering rate, mineral nutrients —
    // mudstone for shale, basic volcanics for basalt, mixed volcanics for andesite, acid plutonics for granite, gneiss and
    // shield, slate for slate & schist, basic plutonics for greenstone and ophiolite; salt has none in SotE
    sote: [[34, 33, 33, 100, 1, 0], [30, 45, 25, 100, 1, 60], [75, 15, 10, 100, 0.7, 40], [20, 10, 70, 100, 1, 60],
        [45, 30, 25, 25, 1, 40], [30, 40, 30, 25, 1, 10], [10, 45, 45, 100, 1, 150], [20, 45, 35, 100, 0.9, 110],
        [70, 10, 20, 100, 0.5, 80], [40, 5, 55, 100, 0.7, 75], [70, 10, 20, 100, 0.5, 80], [70, 10, 20, 100, 0.5, 80],
        [25, 0, 75, 100, 0.8, 150], [25, 0, 75, 100, 0.8, 150]],
    // young sediment by what laid it: texture and log10 permeability
    erg: [90, 5, 5, -11], loess: [15, 70, 15, -13], till: [40, 40, 20, -13], floodplain: [20, 50, 30, -13], floodplainM3s: 100,
    soilRefM: 1.2,              // the soil's depth on flat ground, 1000 mm a year, temperate (SotE's weathering, scaled)
    soilMaxM: 3, soilMinM: 0.1, youngSoilM: 2, soilSlope: 0.05,
    rootM: 1.5,                 // the soil's water counted to this depth (SotE's capacity weights × awcScale mm per m)
    awcScale: 200,
    // recharge's share of the runoff: (minShare + span × permeability) × (soilBase + (1 − soilBase) × infiltration) × slope × frost
    permRange: [-16.5, -11.5], minShare: 0.1, span: 0.8, soilBase: 0.4, slopeHalf: 0.1, frostCut: 0.5,
    bedRecharge: 0.6,           // what a dry river's bed loses goes this much underground (the rest evaporates)
    // the water table (Fan et al. 2013): f = efoldM / (1 + efoldSlope × s), at least efoldMinM; frozen ground (the coldest
    // month: fT, Fan's eq. S8')…
    efoldM: 120, efoldSlope: 150, efoldMinM: 5,
    // …the streams finer than the mesh: at most this sparse by the rock's dissect (0.25 … 0.9: km of stream per km²), less on
    // flat ground and on the ice age's young ground; denser where the ground must shed more water than it can carry (seepage
    // cuts channels — Fan's self-limiting drainage: the spacing at which the water table's mound rises streamMound of the
    // streams' depth), but never denser than flat ground allows (2 km apart on the flat, 150 m on slopes; × spacingGlaciated
    // on the ice age's young ground); they cut to a depth by the local relief
    densityBase: 0.3, densityPow: 1.3, densityFlat: [0.0005, 0.01], densityFlatMin: 0.25, densityGlaciated: 0.5,
    streamMound: 0.75, spacingFlatM: 2000, spacingSteepM: 150, spacingGlaciated: 1,
    incisionMinM: 2, incisionRelief: 0.25, incisionMaxM: 150,
    extinctionM: 3,             // evaporation from the water table: full at the surface, none below this
    evapMaxMm: 2500,
    shallowM: [0.25, 1, 3],     // the depths the shares are counted for (0.25 m: Fan's wetland)
    // solver: the surface as a stiff drain (seepage), the head relaxed between rounds once the drains begin to switch
    // (tDamp: each round's transmissivity the geometric mean of the last round's and the new one — without it a few dry
    // cells see-saw between their soil's transmissivity and their rock's, their water table by up to ~140 m a round, and the
    // rounds never settle; with it they settle, the wetlands, recharge and balance unchanged to the third figure)
    outerMax: 80, cgHeadM: 0.01, cgMax: 3000, settleM: 0.05, settleShare: 2e-4, surfacePerS: 1e-5, relax: 1, tDamp: 0.5, log: false, leak: 1e-3, drainSoftM: 1, baseM3s: 1, baseWet: 0.65,
    // the slope and relief the ground reads, as a mesh of slopeRefKm would show them (null: the mesh's own). The slope
    // between cell centres falls as the cells grow — the valleys and hillsides average out — about as (spacing)^−slopeExp
    // (measured: median 4.1 m/km at 61 km, 14.2 at 7.7 km; the exponent 0.55 on steep ground to 0.8 on flat), and the relief
    // between neighbours rises as (spacing)^(1 − slopeExp). At 7.68 km (a 10M mesh) a 10M planet is unchanged, and the
    // coarser meshes read the ground as it would show
    slopeRefKm: 7.68, slopeExp: 0.6, reliefScale: true,
    // springs, oases, wetlands
    springSlope: 0.004, springContrast: 1.5, karstShare: 0.5, karstOut: 1.5, riverMinM3s: 8,
    aridIndex: 0.2,             // P / PET under this: dry country (oases)
    wellM: 30,                  // a well reaches the water this deep under a valley floor
    oasisMm: 20,                // an oasis: groundwater coming out, at least this much a year over the cell, more than half from afar
    riverOasisM3s: 20,
    // (a big river's plain: its fall to the next cell down, m per m — not the valley's sides)
    floodM3s: 50, floodSlope: [0.001, 0.0002], floodWidthKm: 6, floodFlat: 0.0002, floodMaxShare: 0.8,
    // (the coast's fringe: coastShare of a low cell (mean height from coastHighM down to coastLowM) beside a shallow sea (its
    // mean depth from coastSeaM[0] up to coastSeaM[1]; coastSteep of it beside a deep one)…
    coastShare: 0.12, coastHighM: 150, coastLowM: 10, coastSeaM: [-100, -10], coastSteep: 0.3, coastTypeM: 10,
    estuaryM3s: [100, 10000], estuaryShare: 0.3,     // (…and at a river's mouth: mud for mangroves and salt marshes, more the bigger the river)
    lakeShare: 0.15, lakeSlope: 0.003,
    mangroveColdC: 16, peatWarmC: 6, peatWet: 0.8, meadowWet: [0.3, 0.8],
};

/**
 * @param {Object} a  mesh, z (km), ocean, lake (Water kinds), lakeLevel (km), q (m³/s), recv, runoff/pet/rain (mm a year,
 *   the grid's), tAnnual/pAnnual (the cells'), tCold/tWarm (°C, the cells' months), rock, loess (km), erg, till, glaciated,
 *   ice (EF), cellKm2, loessKm
 * @returns {{layers: Object, stats: Object}}
 */
export function groundwater(a, P = GROUNDWATER) {
    const t0 = performance.now();
    const { mesh, z, ocean, lake, lakeLevel, q, recv, runoff, pet, rain, tAnnual, pAnnual, tCold, tWarm, rock, loess, erg, till,
        glaciated, ice, cellKm2, loessKm, lat, budykoW } = a;
    const { adjOffset, adjList, numCells: n } = mesh;
    const A = cellKm2 * 1e6, Lm = Math.sqrt(2 * A / Math.sqrt(3)), gfac = 1 / Math.sqrt(3), toMs = mm => mm / 1000 / SEC_PER_YEAR;
    // (the slope and the relief as at slopeRefKm, whatever the mesh: see GROUNDWATER)
    const sScale = P.slopeRefKm ? Math.pow(Lm / 1000 / P.slopeRefKm, P.slopeExp) : 1;
    const rScale = P.slopeRefKm && P.reliefScale ? Math.pow(P.slopeRefKm / (Lm / 1000), 1 - P.slopeExp) : 1;
    const dissect = GEOLOGY.lithology.dissect, sol = GEOLOGY.lithology;
    const UNKNOWN = 1, FIXED = 2;                                  // (0: no flow — the ice caps)
    const kind = new Uint8Array(n), hfix = new Float32Array(n), zm = new Float32Array(n);
    for (let c = 0; c < n; c++) {
        zm[c] = 1000 * z[c];
        if (ocean[c]) { kind[c] = FIXED; hfix[c] = 0; }
        else if (ice[c]) kind[c] = 0;
        else if (lake[c] === 1 || lake[c] === 2) { kind[c] = FIXED; hfix[c] = 1000 * lakeLevel[c]; }
        else if (lake[c] === 3) { kind[c] = FIXED; hfix[c] = zm[c] - 0.5; }
        else kind[c] = UNKNOWN;
    }

    // (the runoff the recharge reads: the finish's (rain less a potential evaporation of 300 + 55 mm per °C, at least 60 mm), but
    // with Thornthwaite's potential evaporation where it is higher — the cold climates, where the finish's leaves near all the rain
    // to run off (the polar rivers too big) — on twelve months drawn between the coldest and the warmest, the day's
    // length by latitude (the longest day at the warmest month); Budyko's curve as the finish's (finish-config.js budykoW))
    const coldRunoff = c => {
        const P = Math.max(0, rain[c]), mid = (tWarm[c] + tCold[c]) / 2, amp = (tWarm[c] - tCold[c]) / 2;
        if (!(P > 0) || !(amp === amp)) return Math.max(0, runoff[c]);
        const phi = Math.min(1.5, Math.abs(lat[c]) * Math.PI / 180);
        let I = 0;
        for (let m = 0; m < 12; m++) { const t = mid + amp * Math.cos(2 * Math.PI * m / 12); if (t > 0) I += Math.pow(t / 5, 1.514); }
        if (!(I > 0)) return Math.max(0, runoff[c]);
        const ex = 6.75e-7 * I * I * I - 7.71e-5 * I * I + 1.792e-2 * I + 0.49239;
        let E = 0;
        for (let m = 0; m < 12; m++) {
            const t = mid + amp * Math.cos(2 * Math.PI * m / 12);
            if (t <= 0) continue;
            const dec = 0.409 * Math.cos(2 * Math.PI * m / 12), x = -Math.tan(phi) * Math.tan(dec);
            const day = x <= -1 ? 24 : x >= 1 ? 0 : 24 / Math.PI * Math.acos(x);
            E += (t >= 26.5 ? -415.85 + 32.24 * t - 0.43 * t * t : 16 * Math.pow(10 * t / I, ex)) * day / 12;
        }
        E = Math.max(E, pet[c]);
        return Math.max(0, P - P * (1 + E / P - Math.pow(1 + Math.pow(E / P, budykoW), 1 / budykoW)));
    };

    // ── the ground: slope, relief, rock, soil ──
    const slope = new Float32Array(n), relief = new Float32Array(n), logK = new Float32Array(n), Sy = new Float32Array(n);
    const sand = new Uint8Array(n), clay = new Uint8Array(n), soilD = new Float32Array(n), awc = new Float32Array(n);
    const Ks = new Float32Array(n), K0f = new Float32Array(n), fEff = new Float32Array(n), Ls2 = new Float32Array(n);
    const LsMin2 = new Float32Array(n), LsMax2 = new Float32Array(n), roC = new Float32Array(n);
    const hd = new Float32Array(n), Rm3 = new Float32Array(n), rechMm = new Float32Array(n), Emax = new Float32Array(n);
    const karst = new Float32Array(n), frost = new Float32Array(n), arid = new Float32Array(n);
    for (let c = 0; c < n; c++) {
        if (kind[c] !== UNKNOWN) continue;
        let s2 = 0, k0 = 0, lo = zm[c], hi = zm[c];
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
            const j = adjList[k], dz = (ocean[j] ? 0 : zm[j]) - zm[c];
            s2 += (dz / Lm) ** 2; k0++;
            if (!ocean[j]) { lo = Math.min(lo, zm[j]); hi = Math.max(hi, zm[j]); }
        }
        const s = sScale * Math.sqrt(2 * s2 / Math.max(1, k0));
        slope[c] = s; relief[c] = rScale * (hi - lo) / 2;
        const r = rock ? rock[c] : 1, T = tAnnual[c], Pc = Math.max(0, pAnnual[c]), cold = tCold[c], warm = tWarm[c];
        // (texture: SotE's parent material; the young sediment by what laid it)
        let [sa, si, cl, mass, rate, nutr] = P.sote[r], lk = P.logK[r];
        if (r === 1) {
            const wErg = erg ? Math.min(1, erg[c]) : 0, wLoess = loess ? Math.min(1, loess[c] / loessKm) : 0;
            const wTill = till && till[c] > 40 ? 1 : 0, wPlain = q[c] >= P.floodplainM3s ? 1 : 0;
            const pick = wErg >= 0.5 ? P.erg : wLoess >= 0.3 ? P.loess : wPlain ? P.floodplain : wTill ? P.till : null;
            if (pick) { [sa, si, cl, lk] = pick; }
        }
        if (r === 4) {                                            // (limestone dissolves where it is wet and not frozen: karst)
            const kf = smooth(sol.solubleRainMm[0], sol.solubleRainMm[1], Pc) * smooth(sol.solubleTempC[0], sol.solubleTempC[1], T);
            karst[c] = kf; lk += P.karstLogK * kf;
        }
        // (and weathered by the climate: hot and wet to clay, dry to sand — this module's, not SotE's)
        const toClay = 15 * smooth(1200, 2500, Pc) * smooth(15, 24, T), toSand = 10 * smooth(0.3, 0.1, pet[c] > 0 ? rain[c] / pet[c] : 1);
        cl += toClay; sa += toSand; const sum = sa + si + cl; sa *= 100 / sum; si *= 100 / sum; cl *= 100 / sum;
        sand[c] = Math.round(sa); clay[c] = Math.round(cl);
        // (depth: SotE's weathering — base, ice wedging, water, life — × the rock's mass conversion and rate, thinned by slope)
        const wedge = cold < 0 && warm > 0 ? (3 + Math.min(-cold, warm)) / 15 : 0, Pm = Pc / 6;
        const W = (1 + wedge + 0.3 + Pm / 100 + 1 + Pm / 200) * (mass / 100) * rate;
        let D = P.soilRefM * W / 4.8 / (1 + s / P.soilSlope);
        if (glaciated && glaciated[c] && r >= 8) D *= 0.5;          // (scoured crystalline ground: thin soils)
        if (r === 1) D = Math.max(D, P.youngSoilM);
        D = Math.min(P.soilMaxM, Math.max(P.soilMinM, D));
        soilD[c] = D;
        Ks[c] = 7.06e-6 * Math.pow(10, -0.6 + 0.0126 * sa - 0.0064 * cl);     // (Cosby et al. 1984, inch/h → m/s)
        const inf = (0.9 * sa + 0.75 * si + 0.1 * cl) / 100;                   // (SotE's infiltration)
        awc[c] = P.awcScale * (0.25 * sa + 0.75 * si + 1.0 * cl) / 100 * Math.min(D, P.rootM);
        // (frozen ground: permafrost by the year's mean; Fan's drainage depth by the coldest month)
        const pf = smooth(-1, -8, T); frost[c] = pf;
        const fT = cold > -5 ? 1 : cold > -14 ? Math.min(1, 1.5 + 0.1 * cold) : Math.max(0.05, 0.17 + 0.005 * cold);
        const f = Math.max(P.efoldMinM, P.efoldM / (1 + P.efoldSlope * s)) * fT;
        fEff[c] = f;
        logK[c] = lk; Sy[c] = P.specificYield[r];
        K0f[c] = Math.pow(10, lk) * 1e7 * f;
        // (the streams finer than the mesh: the sparsest and the densest spacing, and their depth)
        let dd = P.densityBase * Math.pow(10, P.densityPow * dissect[r]);
        dd *= P.densityFlatMin + (1 - P.densityFlatMin) * smooth(P.densityFlat[0], P.densityFlat[1], s);
        if (glaciated && glaciated[c]) dd *= P.densityGlaciated;
        const sMin = Math.exp(Math.log(P.spacingFlatM) + (Math.log(P.spacingSteepM) - Math.log(P.spacingFlatM)) * smooth(P.densityFlat[0], P.densityFlat[1], s))
            * (glaciated && glaciated[c] ? P.spacingGlaciated : 1);
        LsMax2[c] = Math.max(sMin, 1000 / dd) ** 2; LsMin2[c] = sMin * sMin; Ls2[c] = LsMax2[c];
        hd[c] = zm[c] - Math.min(P.incisionMaxM, P.incisionMinM + P.incisionRelief * relief[c]);
        // (recharge: the runoff's share that goes underground, and a dry river's bed)
        const perm = smooth(P.permRange[0], P.permRange[1], lk);
        const share = (P.minShare + P.span * perm) * (P.soilBase + (1 - P.soilBase) * inf) / (1 + s / P.slopeHalf) * (1 - P.frostCut * pf);
        roC[c] = Math.min(Math.max(0, runoff[c]), coldRunoff(c));
        let rm = share * roC[c];
        const ar = pet[c] > 0 ? smooth(0, 1, (pet[c] - Math.max(0, rain[c])) / pet[c]) : 0;
        arid[c] = pet[c] > 0 ? Math.max(0, rain[c]) / pet[c] : 9;
        if (ar > 0 && q[c] > 0 && recv[c] >= 0) {
            const loss = 20 * ar * 5 * Math.sqrt(q[c]) * Lm / SEC_PER_YEAR;              // (m³/s: finish-hydro.js)
            rm += P.bedRecharge * loss * SEC_PER_YEAR / A * 1000;
        }
        rechMm[c] = rm; Rm3[c] = toMs(rm) * A;
        Emax[c] = toMs(Math.min(P.evapMaxMm, Math.max(0, pet[c] - Math.max(0, rain[c])))) * A / P.extinctionM;   // (per m of rise)
    }

    // ── the water table: Picard iterations on the transmissivity and the active drains, PCG on each linear system ──
    const T = new Float32Array(n), h = new Float64Array(n), idx = new Int32Array(n).fill(-1);
    const gE = new Float32Array(adjList.length), Cs = P.surfacePerS * A;
    const trans = (c, hc) => {
        const d = Math.max(0, zm[c] - hc), d0 = soilD[c];
        return Math.max(1e-8, d < d0 ? Ks[c] * (d0 - d) + K0f[c] : K0f[c] * Math.exp(-(d - d0) / fEff[c]));
    };
    // (the hillslopes' own: the soil and the weathered rock under the slope, whatever the cell's mean head — the water reaches
    // the streams finer than the mesh through them, not through the rock deep under the cell's mean surface)
    const Th = new Float32Array(n);
    // (where nothing holds it up, the water table sinks toward its valley's base downstream (Fan: sea level and the valley
    // floors rule it): the sea, a lake, a salt pan, a stream that runs (q ≥ baseM3s) or ground wet enough to shed its water
    // where it falls (P / PET ≥ baseWet) — the rounds start there, and a whisper pulls toward it)
    const base = new Float32Array(n).fill(NaN), isBase = c => kind[c] === FIXED || (kind[c] === UNKNOWN && (q[c] >= P.baseM3s || arid[c] >= P.baseWet));
    const levelOf = c => kind[c] === FIXED ? hfix[c] : hd[c], path = [];
    for (let c0 = 0; c0 < n; c0++) {
        if (kind[c0] !== UNKNOWN || base[c0] === base[c0]) continue;
        let x = c0, b = NaN;
        path.length = 0;
        for (let step = 0; step < 1e6; step++) {
            if (base[x] === base[x]) { b = base[x]; break; }
            if (isBase(x)) { b = levelOf(x); break; }
            if (kind[x] !== UNKNOWN) { b = levelOf(x); break; }
            path.push(x);
            const r = recv[x], nx = r >= 0 ? r : -1 - r;
            if (nx === x || nx < 0 || nx >= n) { b = hd[x]; break; }
            x = nx;
        }
        if (!(b === b)) b = hd[c0];
        for (let i = path.length - 1; i >= 0; i--) { const p = path[i]; b = Math.min(hd[p], b); base[p] = b; }
        if (kind[x] === UNKNOWN && !(base[x] === base[x])) base[x] = hd[x];
    }
    let nu = 0;
    for (let c = 0; c < n; c++) if (kind[c] === UNKNOWN) { h[c] = Math.min(zm[c], base[c]); T[c] = trans(c, h[c]); Th[c] = Ks[c] * soilD[c] + K0f[c]; idx[c] = nu++; }
    const list = new Int32Array(nu), diag = new Float64Array(nu), b = new Float64Array(nu), x = new Float64Array(nu);
    const r_ = new Float64Array(nu), p_ = new Float64Array(nu), z_ = new Float64Array(nu), Ap = new Float64Array(nu);
    for (let c = 0; c < n; c++) if (idx[c] >= 0) list[idx[c]] = c;
    let outer = 0, cgTotal = 0, lastChanges = -1, lastMoved = 0, lastFar = 0, settled = false;
    for (; outer < P.outerMax; outer++) {
        // (transmissivity, damped after the first round: the geometric mean of the old and the new)
        for (let u = 0; u < nu; u++) { const c = list[u], t = trans(c, h[c]); T[c] = outer ? Math.pow(T[c], P.tDamp) * Math.pow(t, 1 - P.tDamp) : t; }
        // (the streams' spacing: as dense as the water to shed asks, within what the ground allows)
        for (let u = 0; u < nu; u++) {
            const c = list[u], Ra = Rm3[c] / A;
            const need = Ra > 0 ? 12 * P.streamMound * (zm[c] - hd[c]) * Th[c] / Ra : Infinity;
            Ls2[c] = Math.min(LsMax2[c], Math.max(LsMin2[c], need));
        }
        for (let u = 0; u < nu; u++) {
            const c = list[u], Ti = T[c];
            let d = 0, bb = Rm3[c];
            for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
                const j = adjList[k];
                if (!kind[j]) { gE[k] = 0; continue; }
                const Tj = kind[j] === UNKNOWN ? T[j] : Ti, g = gfac * 2 * Ti * Tj / (Ti + Tj);
                gE[k] = g; d += g;
                if (kind[j] === FIXED) bb += g * hfix[j];
            }
            // (the streams below, the air where it is shallow, the surface where it would rise above: by the old head)
            // (the streams and the air switch on gradually — over drainSoftM about their levels — or the rounds see-saw)
            const cd = 12 * Th[c] / Ls2[c] * A, on = sig((h[c] - hd[c]) / P.drainSoftM);
            d += on * cd; bb += on * cd * hd[c];
            const zx = zm[c] - P.extinctionM;
            if (Emax[c] > 0) { const e = sig((h[c] - zx) / P.drainSoftM) * Emax[c]; d += e; bb += e * zx; }
            if (h[c] >= zm[c]) { d += Cs; bb += Cs * zm[c]; }
            // (a whisper toward the streams, always: a cell walled in by ice, its streams dry, is never left without an outlet)
            const eps = 1e-9 * d + P.leak * cd; d += eps; bb += eps * base[c];
            diag[u] = d; b[u] = bb; x[u] = h[c];
        }
        cgTotal += pcg(nu);
        let changes = 0, moved = 0, worst = -1, worstFrom = 0, worstX = 0, far = 0;
        const w = outer < 4 ? 1 : P.relax;
        for (let u = 0; u < nu; u++) {
            // (at or above the surface: held there — it seeps; else a damped step)
            const c = list[u], ho = h[c], hn = x[u] >= zm[c] ? zm[c] : ho + w * (x[u] - ho), zx = zm[c] - P.extinctionM;
            if (Math.abs(sig((hn - hd[c]) / P.drainSoftM) - sig((ho - hd[c]) / P.drainSoftM)) > 0.25) changes++;
            if (Emax[c] > 0 && Math.abs(sig((hn - zx) / P.drainSoftM) - sig((ho - zx) / P.drainSoftM)) > 0.25) changes++;
            if ((hn >= zm[c]) !== (ho >= zm[c])) changes++;
            if (Math.abs(hn - ho) > P.settleM) far++;
            if (Math.abs(hn - ho) > moved) { moved = Math.abs(hn - ho); worst = c; worstFrom = ho; worstX = x[u]; }
            h[c] = hn;
        }
        lastChanges = changes; lastMoved = moved;
        if (P.log) console.error(`water table: pass ${outer + 1}, switches ${changes}, cells moved more than ${P.settleM} m ${far}, largest move ${moved.toFixed(2)} m, ${cgTotal} iterations`
            + (P.log > 1 && worst >= 0 ? ` — cell ${worst}: z ${zm[worst].toFixed(1)}, streams ${hd[worst].toFixed(1)}, from ${worstFrom.toFixed(1)} to ${h[worst].toFixed(1)} (x ${worstX.toFixed(1)}), T ${T[worst].toExponential(2)}, Ls ${Math.sqrt(Ls2[worst]).toFixed(0)} m, R ${(Rm3[worst] / A * SEC_PER_YEAR * 1000).toFixed(0)} mm, neighbours ${adjOffset[worst + 1] - adjOffset[worst]}, ${Array.from(adjList.slice(adjOffset[worst], adjOffset[worst + 1]), j => kind[j]).join('')}` : ''));
        lastFar = far;
        if (changes <= P.settleShare * nu && far <= P.settleShare * nu) { outer++; settled = true; break; }
    }
    const capped = new Uint8Array(n);
    for (let u = 0; u < nu; u++) { const c = list[u]; if (h[c] >= zm[c]) capped[c] = 1; }

    // ── what leaves the water table: to the streams, by evaporation, at the surface ──
    const wtd = new Float32Array(n).fill(NaN), outMm = new Float32Array(n), seepMm = new Float32Array(n), etMm = new Float32Array(n);
    const tau = new Float32Array(n), sat = [new Uint8Array(n), new Uint8Array(n), new Uint8Array(n)], drainM3 = new Float32Array(n);
    const drainOnly = new Float32Array(n);
    const NX = 32;
    for (let c = 0; c < n; c++) {
        if (kind[c] !== UNKNOWN) continue;
        const hc = Math.min(h[c], zm[c]), Ti = Th[c], D = hc > hd[c] ? 12 * Ti / Ls2[c] * A * (hc - hd[c]) : 0;
        const zx = zm[c] - P.extinctionM, E = Emax[c] > 0 && hc > zx ? Emax[c] * (hc - zx) : 0;
        const S = capped[c] ? Math.max(0, seepAt(c)) : 0;
        drainM3[c] = D + S + E; drainOnly[c] = D;
        wtd[c] = zm[c] - hc;
        outMm[c] = (D + S + E) / A * SEC_PER_YEAR * 1000; seepMm[c] = S / A * SEC_PER_YEAR * 1000; etMm[c] = E / A * SEC_PER_YEAR * 1000;
        tau[c] = Sy[c] * Ls2[c] / (Math.PI * Math.PI * Ti) / SEC_PER_YEAR;             // (years: a hillslope between streams)
        // (the shares within 0.25, 1 and 3 m: a hillslope from the stream (its bed at hd) up to the divide, the surface rising
        // straight, the water table a Dupuit parabola whose mean is the cell's head — or flat under the beds when they lose)
        const ds = zm[c] - hd[c], rise = hc > hd[c] ? 1.5 * (hc - hd[c]) : 0;
        const cnt = [0, 0, 0];
        for (let i = 0; i < NX; i++) {
            const xi = (i + 0.5) / NX, surf = hd[c] + 2 * ds * xi, wt = rise > 0 ? hd[c] + rise * (2 * xi - xi * xi) : hc;
            const d = Math.max(0, surf - wt);
            for (let k = 0; k < 3; k++) if (d <= P.shallowM[k]) cnt[k]++;
        }
        for (let k = 0; k < 3; k++) sat[k][c] = Math.round(255 * cnt[k] / NX);
    }

    // (the balance: what comes in — recharge — against what leaves: streams, seepage, air, the sea and the lakes)
    let inflowM3 = 0, outflowM3 = 0;
    for (let c = 0; c < n; c++) {
        if (kind[c] !== UNKNOWN) continue;
        inflowM3 += Rm3[c]; outflowM3 += drainM3[c];
        if (capped[c]) continue;
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const j = adjList[k]; if (kind[j] === FIXED) outflowM3 += gE[k] * (h[c] - hfix[j]); }
    }

    // (the rivers' discharge with the cold climates' evaporation corrected, for the floodplains — the finish's own carries their
    // excess runoff: each river keeps the share of the finish's discharge that the corrected runoff upstream makes of the finish's)
    const qCold = new Float32Array(n);
    {
        const accW = new Float32Array(n), accC = new Float32Array(n), indeg = new Int32Array(n), queue = new Int32Array(n);
        for (let c = 0; c < n; c++) {
            if (ocean[c]) continue;
            accW[c] = Math.max(0, runoff[c]); accC[c] = kind[c] === UNKNOWN ? roC[c] : accW[c];
            if (recv[c] >= 0) indeg[recv[c]]++;
        }
        let head = 0, tail = 0;
        for (let c = 0; c < n; c++) if (!ocean[c] && indeg[c] === 0) queue[tail++] = c;
        while (head < tail) {
            const c = queue[head++], r = recv[c];
            if (r < 0 || ocean[r]) continue;
            accW[r] += accW[c]; accC[r] += accC[c];
            if (--indeg[r] === 0) queue[tail++] = r;
        }
        for (let c = 0; c < n; c++) qCold[c] = accW[c] > 0 ? q[c] * Math.min(1, accC[c] / accW[c]) : q[c];
    }

    // ── springs, oases, wetlands ──
    const spring = new Uint8Array(n), oasis = new Uint8Array(n), wetFrac = new Uint8Array(n), wetType = new Uint8Array(n);
    const wetGW = new Uint8Array(n), wetFlood = new Uint8Array(n), wetCoast = new Uint8Array(n);   // (each source's share)
    const counts = { springs: [0, 0, 0, 0], oases: [0, 0, 0, 0, 0], wetKm2: {}, wetCells: {} };
    const wetNames = ['', 'marsh', 'meadow', 'peat', 'mangrove', 'saltMarsh', 'floodplain'];
    // (a karst spring: the karst's water comes out at its edge — beside other rock, water or a river — where more comes out
    // than at any karst neighbour: few big springs, not a karst massif dotted with them)
    const isKarst = c => rock && rock[c] === 4 && karst[c] >= P.karstShare;
    // (on a hillside the water table seeps out all over a wet, hilly country: a spring is where more comes out than nearby)
    const seepPeak = c => { for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) if (seepMm[adjList[k]] > seepMm[c]) return false; return true; };
    const karstOutlet = c => {
        let edge = q[c] >= P.riverMinM3s;
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
            const j = adjList[k];
            if (kind[j] !== UNKNOWN || !isKarst(j)) edge = true;
            else if (drainM3[j] > drainM3[c]) return false;
        }
        return edge;
    };
    for (let c = 0; c < n; c++) {
        if (kind[c] !== UNKNOWN && !(lake[c] === 3)) continue;
        if (lake[c] === 3) { if (arid[c] < P.aridIndex) { oasis[c] = OASIS.SALT_FLAT; counts.oases[4]++; } continue; }
        const rin = Rm3[c], out = drainM3[c], inflow = out - rin, s = slope[c];
        const S = seepMm[c], dry = arid[c] < P.aridIndex;
        // (springs: where water from upslope comes out — on a slope of the land (not the drop to the sea) or below more
        // permeable rock, not on frozen ground (water running over permafrost); karst; in dry country, water from afar)
        let contrast = false, s2 = 0, kl = 0;
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
            const j = adjList[k];
            if (ocean[j]) continue;
            s2 += ((zm[j] - zm[c]) / Lm) ** 2; kl++;
            if (kind[j] === UNKNOWN && zm[j] > zm[c] && logK[j] >= logK[c] + P.springContrast && h[j] > h[c]) contrast = true;
        }
        const sLand = sScale * Math.sqrt(2 * s2 / Math.max(1, kl));
        if (dry && inflow > rin && outMm[c] >= P.oasisMm && q[c] < P.riverOasisM3s) spring[c] = SPRING.DRY;   // (an oasis's spring)
        else if (isKarst(c) && drainOnly[c] > P.karstOut * rin && karstOutlet(c)) spring[c] = SPRING.KARST;
        else if (S > 0 && inflow > 0 && frost[c] < 0.5 && (contrast || (sLand > P.springSlope && seepPeak(c)))) spring[c] = SPRING.CONTACT;
        if (spring[c]) counts.springs[spring[c]]++;
        // (oases: dry country with water — at the surface or feeding its streams, a river, or a well's depth under the valley floor)
        if (dry) {
            const hc = Math.min(h[c], zm[c]), valleyWtd = Math.max(0, hd[c] - hc);
            if (q[c] >= P.riverOasisM3s) oasis[c] = OASIS.RIVER;
            else if (inflow > rin && outMm[c] >= P.oasisMm) oasis[c] = OASIS.SPRING;     // (a discharge zone: water from afar)
            else if (valleyWtd <= P.wellM) oasis[c] = OASIS.WELLS;
            if (oasis[c]) counts.oases[oasis[c]]++;
        }
        // (wetlands: the water table within 0.25 m beyond the strip along every stream (wet whatever the water table does: a
        // channel's banks); a big river's plain on flat ground; a flat coast; a lake's skirt)
        const strip = Math.min(1, P.shallowM[0] / (2 * Math.max(0.01, zm[c] - hd[c])));
        const wGW = Math.max(0, sat[0][c] / 255 - strip);
        let wFlood = 0, wCoast = 0, wLake = 0, coastal = false, lakeside = false;
        const fall = recv[c] >= 0 && !ocean[recv[c]] ? Math.max(0, zm[c] - zm[recv[c]]) / Lm : s;
        if (qCold[c] >= P.floodM3s && fall < P.floodSlope[0]) {
            const wKm = Math.min(30, Math.max(0.3, P.floodWidthKm * Math.sqrt(qCold[c] / 1000) * (fall < P.floodFlat ? 2 : 1)));
            wFlood = Math.min(P.floodMaxShare, wKm * (Lm / 1000) / cellKm2) * smooth(P.floodSlope[0], P.floodSlope[1], fall);
        }
        let seaZ = 0, seaN = 0;
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const j = adjList[k]; if (ocean[j]) { coastal = true; seaZ += zm[j]; seaN++; } else if (lake[j] === 1) lakeside = true; }
        // (a fringe of the cell, not the cell: low shores beside a shallow sea, more at a river's mouth — the cell's mean
        // height and slope at 7–8 km say little about its shore, the sea beside it says more)
        if (coastal) {
            const low = smooth(P.coastHighM, P.coastLowM, zm[c]), shallow = smooth(P.coastSeaM[0], P.coastSeaM[1], seaZ / seaN);
            wCoast = low * (P.coastShare * (P.coastSteep + (1 - P.coastSteep) * shallow)
                + (q[c] >= P.estuaryM3s[0] ? P.estuaryShare * smooth(Math.log(P.estuaryM3s[0]), Math.log(P.estuaryM3s[1]), Math.log(q[c])) : 0));
        }
        if (lakeside && s < P.lakeSlope) wLake = P.lakeShare;
        const w = 1 - (1 - wGW) * (1 - wFlood) * (1 - wCoast) * (1 - wLake);
        wetGW[c] = Math.round(255 * wGW); wetFlood[c] = Math.round(255 * wFlood); wetCoast[c] = Math.round(255 * wCoast);
        wetFrac[c] = Math.round(255 * Math.min(0.95, w));
        if (w < 0.01) continue;
        const wet = arid[c], T = tAnnual[c];
        // (the coast's fringe is a share of its own — mangrove or salt marsh — beside whatever the rest of the cell is)
        const tc = tCold[c] >= P.mangroveColdC ? WET.MANGROVE : WET.SALT, wIn = Math.max(0, w - wCoast);
        if (wCoast > 0) {
            const nm = tc === WET.MANGROVE ? 'mangrove' : 'saltMarshCoast';
            counts.wetKm2[nm] = (counts.wetKm2[nm] ?? 0) + wCoast * cellKm2;
        }
        let t;
        if (wCoast > 0 && (zm[c] < P.coastTypeM || wCoast >= wIn)) t = tc;
        else if (wet < 0.3 && (etMm[c] > 0 || S > 0)) t = WET.SALT;                     // (dry country: inland salt marsh)
        else if (wFlood >= Math.max(wGW, wLake)) t = WET.FLOODPLAIN;
        else if (T < P.peatWarmC && wet >= P.peatWet) t = WET.PEAT;
        else if (wet >= P.meadowWet[0] && wet < P.meadowWet[1]) t = WET.MEADOW;
        else t = WET.MARSH;
        const trees = t !== WET.MANGROVE && t !== WET.SALT && tWarm[c] >= 10 && wet >= 0.8 && T > -2;
        const seaside = (t === WET.SALT || t === WET.MANGROVE) && wCoast > 0;
        wetType[c] = t | (trees ? WET.FOREST : 0) | (seaside ? WET.COAST : 0);
        // (the inland part counted under the kind the cell would have without its coast)
        const tIn = seaside ? (wet < 0.3 && (etMm[c] > 0 || S > 0) ? WET.SALT : wFlood >= Math.max(wGW, wLake) ? WET.FLOODPLAIN : T < P.peatWarmC && wet >= P.peatWet ? WET.PEAT
            : wet >= P.meadowWet[0] && wet < P.meadowWet[1] ? WET.MEADOW : WET.MARSH) : t;
        const name = tIn === WET.SALT ? 'saltMarshInland' : wetNames[tIn];
        if (wIn > 0) counts.wetKm2[name] = (counts.wetKm2[name] ?? 0) + wIn * cellKm2;
        if (w >= 0.2) { const nc = seaside ? (t === WET.MANGROVE ? 'mangrove' : 'saltMarshCoast') : name; counts.wetCells[nc] = (counts.wetCells[nc] ?? 0) + 1; }
    }

    // ── the stats: shares of the ice-free land, the solver ──
    let landN = 0, sumR = 0, sh = [0, 0, 0], wetSum = 0, capN = 0;
    for (let c = 0; c < n; c++) {
        if (kind[c] !== UNKNOWN) continue;
        landN++; sumR += rechMm[c]; wetSum += wetFrac[c] / 255; if (capped[c]) capN++;
        for (let k = 0; k < 3; k++) sh[k] += sat[k][c] / 255;
    }
    for (const k in counts.wetKm2) counts.wetKm2[k] = Math.round(counts.wetKm2[k]);
    const stats = {
        landCells: landN, meanRechargeMm: +(sumR / Math.max(1, landN)).toFixed(1),
        shallowShare: sh.map(v => +(v / Math.max(1, landN)).toFixed(4)), wetShare: +(wetSum / Math.max(1, landN)).toFixed(4),
        surfaceShare: +(capN / Math.max(1, landN)).toFixed(4), ...counts,
        balance: { rechargeKm3: +(inflowM3 * SEC_PER_YEAR / 1e9).toFixed(0), outKm3: +(outflowM3 * SEC_PER_YEAR / 1e9).toFixed(0) },
        solver: { outer, settled, cells: nu, cgIterations: cgTotal, lastChanges, lastMoving: lastFar, lastMaxMoveM: +lastMoved.toFixed(2) }, ms: Math.round(performance.now() - t0),
    };
    const layers = {
        groundWtd: wtd, groundRecharge: rechMm, groundGwOut: outMm, groundSeep: seepMm, groundGwEt: etMm, groundTau: tau,
        groundSat025: sat[0], groundSat1: sat[1], groundSat3: sat[2], groundLogK: logK, groundSoilSand: sand, groundSoilClay: clay,
        groundSoilDepth: soilD, groundSoilAwc: awc, groundSpring: spring, groundOasis: oasis, groundWetFrac: wetFrac, groundWetType: wetType, groundWetGW: wetGW, groundWetFlood: wetFlood, groundWetCoast: wetCoast,
        groundTCold: tCold, groundTWarm: tWarm,
    };
    return { layers, stats };

    // (a capped cell's balance at the surface: what flows in and is recharged, less what the streams and the air take)
    function seepAt(c) {
        const Ti = T[c], zc = zm[c];
        let s = Rm3[c];
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
            const j = adjList[k];
            if (!kind[j]) continue;
            const Tj = kind[j] === UNKNOWN ? T[j] : Ti, g = gfac * 2 * Ti * Tj / (Ti + Tj);
            s += g * ((kind[j] === UNKNOWN ? h[j] : hfix[j]) - zc);
        }
        if (zc > hd[c]) s -= 12 * Th[c] / Ls2[c] * A * (zc - hd[c]);
        if (Emax[c] > 0) s -= Emax[c] * P.extinctionM;
        return s;
    }
    // (preconditioned conjugate gradients on the cells not held at the surface: diag − neighbours' conductances)
    function pcg(m) {
        const mul = (v, out) => {
            for (let u = 0; u < m; u++) {
                const c = list[u];
                let s = diag[u] * v[u];
                for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const j = idx[adjList[k]]; if (j >= 0) s -= gE[k] * v[j]; }
                out[u] = s;
            }
        };
        mul(x, Ap);
        let rz = 0;
        for (let u = 0; u < m; u++) { r_[u] = b[u] - Ap[u]; z_[u] = r_[u] / diag[u]; p_[u] = z_[u]; rz += r_[u] * z_[u]; }
        // (until no cell's Jacobi correction exceeds cgHeadM: a head error in metres, whatever the cell's conductances)
        const settled = () => { for (let u = 0; u < m; u++) if (Math.abs(z_[u]) > P.cgHeadM) return false; return true; };
        let it = 0;
        for (; it < P.cgMax && !(it % 10 === 0 && settled()); it++) {
            mul(p_, Ap);
            let pAp = 0;
            for (let u = 0; u < m; u++) pAp += p_[u] * Ap[u];
            const alpha = rz / pAp;
            let rz2 = 0;
            for (let u = 0; u < m; u++) { x[u] += alpha * p_[u]; r_[u] -= alpha * Ap[u]; z_[u] = r_[u] / diag[u]; rz2 += r_[u] * z_[u]; }
            const beta = rz2 / rz; rz = rz2;
            for (let u = 0; u < m; u++) p_[u] = z_[u] + beta * p_[u];
        }
        return it;
    }
}
