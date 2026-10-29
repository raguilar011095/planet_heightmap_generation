// The land's cover, as a satellite sees it (plans/V2_SATELLITE_PLAN.md S1): from a place's twelve months of temperature
// (°C) and rain (mm), what grows there and how it looks in January, in July and through the year — and its colour, as
// cloud-free satellite mosaics (NASA's Blue Marble) show Earth's ground.
//
//   the cover: vegetation V (all of it), trees (≤ V), grass and shrub (V − trees), bare ground (1 − V); the trees'
//   needle-leaved share, the broad-leaved ones' evergreen share — continuous, from S-curves (COVER), so biomes blend;
//   per view (VIEWS: the year, January, July): grass green or dormant (golden with drought, brown with cold), deciduous
//   trees in leaf or bare, snow on the ground (the year: the months' mean green, and the snow that lies most of the year);
//   a biome's name, for the readout.
// Pure functions of the months: the finish calls them per cell, a check on Earth's observed climate per grid cell.

import { FINISH, COVER } from './finish-config.js';
import { KOPPEN_CLASSES } from '../climate/koppen.js';
import { FastNoise } from '../core/fast-noise.js';

/** The views, in the order the finish hands them over. */
export const VIEWS = ['year', 'jan', 'jul'];
export const Biome = Object.freeze({ NONE: 0, ICE: 1, POLAR_DESERT: 2, TUNDRA: 3, BOREAL: 4, CONIFER: 5, DECIDUOUS: 6, EVERGREEN: 7, RAINFOREST: 8,
    DRY_FOREST: 9, SAVANNA: 10, MEDITERRANEAN: 11, WOODLAND: 12, GRASSLAND: 13, STEPPE: 14, SEMI_DESERT: 15, DESERT: 16 });
export const BIOME_WORDS = ['', 'Ice and snow', 'Polar desert', 'Tundra', 'Boreal forest', 'Conifer forest', 'Deciduous forest', 'Evergreen forest',
    'Tropical rainforest', 'Tropical dry forest', 'Savanna', 'Mediterranean scrub', 'Woodland', 'Grassland', 'Steppe', 'Semi-desert', 'Desert'];

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const S = (r, x) => smooth(r[0], r[1], x);

/** A cover to fill (reused cell after cell). */
export function newCover() {
    return { V: 0, tree: 0, grass: 0, needle: 0, larch: 0, evergreen: 0, wetness: 0, tAnn: 0, warmest: 0, coldest: 0, biome: 0,
        green: new Float64Array(3), leaf: new Float64Array(3), cold: new Float64Array(3), snow: new Float64Array(3),
        _pet: new Float64Array(12), _g: new Float64Array(12), _l: new Float64Array(12), _c: new Float64Array(12), _s: new Float64Array(12) };
}

/** The cover of a place with these twelve months (T °C, P mm; January first) at latitude `lat` (°) — into `cv`. */
export function landCover(T, P, cv, F = FINISH, K = COVER, lat = 0) {
    const pet = cv._pet, g = cv._g, l = cv._l, c = cv._c, s = cv._s;
    let Pyr = 0, Eyr = 0, Tw = -Infinity, Tc = Infinity, tA = 0;
    for (let m = 0; m < 12; m++) {
        pet[m] = Math.max(5, (F.petBaseMm + F.petPerC * T[m]) / 12);
        Pyr += Math.max(0, P[m]); Eyr += pet[m]; tA += T[m] / 12;
        if (T[m] > Tw) Tw = T[m];
        if (T[m] < Tc) Tc = T[m];
    }
    // the snow and the soil's water through the year — three years from bare dry ground, so they settle into their round
    let swe = 0, soil = 0, grow = 0, dryWarm = 0, snowYr = 0;
    for (let cyc = 0; cyc < 3; cyc++) for (let m = 0; m < 12; m++) {
        const p = Math.max(0, P[m]), snowfall = p * S(K.snowPhase, T[m]), start = swe;
        swe += snowfall;
        const melt = Math.min(swe, K.snowMeltMmPerC * Math.max(0, T[m]));
        swe = Math.max(0, swe - melt - K.snowLossMm * S(K.snowLossWarm, T[m]));
        const liquid = p - snowfall + melt, avail = (liquid + soil) / pet[m];
        soil = Math.min(K.soilMm, Math.max(0, soil + liquid - pet[m]));
        if (cyc < 2) continue;
        snowYr += snowfall;
        const warm = S(K.growWarm, T[m]), wetG = S(K.grassWet, avail), wetT = S(K.treeWetMonth, avail);
        g[m] = warm * wetG;
        l[m] = S(K.leafWarm, T[m]) * wetT;
        // (dormant: from cold or from drought — cold's share of the browning)
        const cd = 1 - warm, dd = 1 - wetG;
        c[m] = cd + dd > 1e-6 ? cd / (cd + dd) : 0;
        s[m] = S(K.snowCoverMm, 0.5 * (start + swe));
        grow += l[m]; dryWarm += warm * (1 - wetT);
    }
    // (ice caps: where even the warmest month freezes, the snow never goes, however little falls — and ice sheets where the
    // year is cold enough for one to have grown: the climate, on bare bedrock, has no ice sheet's own cold)
    const polar = K.iceSheetPolarC * smooth(K.iceSheetPolarLat[0], K.iceSheetPolarLat[1], Math.abs(lat));
    const iceCap = Math.max(smooth(1, -1, Tw), smooth(K.iceSheetTw[0] + polar, K.iceSheetTw[1] + polar, Tw) * smooth(K.iceSheetSnowMm[0], K.iceSheetSnowMm[1], snowYr));
    if (iceCap > 0) for (let m = 0; m < 12; m++) s[m] = Math.max(s[m], iceCap);
    // what grows
    const wet = Pyr / Eyr, V = S(K.vegWet, wet) * S(K.vegWarm, Tw);
    const tree = Math.min(V, S(K.treeWet, wet) * S(K.treeWarm, Tw) * S(K.treeSeason, grow));
    cv.V = V; cv.tree = tree; cv.grass = V - tree;
    cv.needle = Math.max(S(K.needleCold, Tc), S(K.needleCool, Tw));
    cv.larch = S(K.larchCold, Tc);
    cv.evergreen = S(K.evergreenWarm, Tc) * (1 - 0.8 * S(K.evergreenDry, dryWarm));
    cv.wetness = wet; cv.tAnn = tA; cv.warmest = Tw; cv.coldest = Tc;
    // how it looks: the year (the months' mean; the snow that lies most of the year), January, July (a month's look part
    // the month before's)
    const lag = K.lag, at = (a, m) => (1 - lag) * a[m] + lag * a[(m + 11) % 12];
    let gm = 0, lm = 0, cm = 0, sm = 0, smin = 1;
    for (let m = 0; m < 12; m++) { gm += g[m] / 12; lm += l[m] / 12; cm += c[m] / 12; sm += s[m] / 12; if (s[m] < smin) smin = s[m]; }
    cv.green[0] = gm; cv.green[1] = at(g, 0); cv.green[2] = at(g, 6);
    cv.leaf[0] = lm; cv.leaf[1] = at(l, 0); cv.leaf[2] = at(l, 6);
    cv.cold[0] = cm; cv.cold[1] = at(c, 0); cv.cold[2] = at(c, 6);
    cv.snow[0] = Math.max(smin, S(K.snowYear, sm)); cv.snow[1] = s[0]; cv.snow[2] = s[6];
    // its name
    let wm = 0; for (let m = 1; m < 12; m++) if (T[m] > T[wm]) wm = m;
    let cmn = 0; for (let m = 1; m < 12; m++) if (T[m] < T[cmn]) cmn = m;
    const summerDry = P[wm] < 30 && P[cmn] > 3 * Math.max(1, P[wm]);
    cv.biome = smin >= 0.5 ? Biome.ICE
        : V < 0.12 ? (Tw < 10 ? Biome.POLAR_DESERT : Biome.DESERT)
        : Tw < 10 ? Biome.TUNDRA
        : V < 0.35 ? Biome.SEMI_DESERT
        : tree >= 0.5 ? (cv.needle >= 0.5 ? (Tc < -8 ? Biome.BOREAL : Biome.CONIFER)
            : Tc >= 16 ? (cv.evergreen >= 0.5 ? Biome.RAINFOREST : Biome.DRY_FOREST)
            : cv.evergreen >= 0.5 ? Biome.EVERGREEN : Biome.DECIDUOUS)
        : tree >= 0.15 ? (Tc >= 15 ? Biome.SAVANNA : summerDry ? Biome.MEDITERRANEAN : Biome.WOODLAND)
        : Tc >= 10 ? Biome.GRASSLAND : Biome.STEPPE;
    return cv;
}

// ── colour: reference colours (sRGB) of each kind of ground as cloud-free satellite mosaics show it, mixed by the cover's
// shares in linear light (as a sensor adds up what is in its pixel) ──
export const COVER_RGB = {
    // (fitted to NASA's Blue Marble, July, over Earth's land with its observed climate — earth-cover check, S1)
    needle: [32, 42, 20],       // boreal and mountain conifers: dark olive, all year
    evergreen: [31, 44, 14],    // broad-leaved evergreen: the rainforest's deep green
    leafOn: [46, 64, 26],       // broad-leaved deciduous, in leaf
    leafOff: [99, 89, 74],      // …leafless: grey-brown twigs and the litter beneath
    grass: [92, 106, 54],       // grass and shrub, green
    tundra: [108, 105, 79],     // …where summers are short: low shrub, sedge and moss
    dry: [125, 107, 72],        // …dormant in a dry season: dun
    cold: [125, 113, 88],       // …dormant in winter: brown
    soilCold: [122, 115, 103],  // bare ground where it is cold: grey-brown
    soilWarm: [157, 121, 86],   // …warm
    desert: [188, 159, 119],    // …the hot deserts' sand and gravel
    laterite: [152, 92, 62],    // …the red earth of the wet tropics (mostly under the forest)
    snow: [235, 238, 240],
};
const toLin = v => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
// (linear light → sRGB 0…255 by the 255 thresholds where the rounded value steps up: a binary search, no powers)
const STEP = Float64Array.from({ length: 255 }, (_, k) => { const c = (k + 0.5) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
const toSrgb = v => { let lo = 0, hi = 255; while (lo < hi) { const mid = (lo + hi) >> 1; if (v >= STEP[mid]) lo = mid + 1; else hi = mid; } return lo; };
let LIN = null;
/** The reference colours in linear light, flat: key k's channel ch at 3k + ch. */
const linear = () => (LIN ??= Float64Array.from(Object.values(COVER_RGB).flatMap(v => v.map(toLin))));

const KEYS = Object.keys(COVER_RGB);
/** How much of each reference colour (COVER_RGB's order) a cover shows in view v (0 the year, 1 January, 2 July): into w. */
export function coverWeights(cv, v, w = new Float64Array(KEYS.length), K = COVER) {
    w.fill(0);
    const tree = cv.tree, grass = cv.grass, bare = 1 - cv.V;
    const warmSoil = smooth(0, 20, cv.tAnn), hotDry = (1 - smooth(0.06, 0.3, cv.wetness)) * smooth(5, 18, cv.tAnn), red = smooth(0.8, 1.6, cv.wetness) * smooth(16, 22, cv.tAnn);
    const lush = smooth(8, 16, cv.warmest), needle = cv.needle, ever = cv.evergreen, leaf = cv.leaf[v], green = cv.green[v], cold = cv.cold[v];
    // snow: white on open ground; a canopy hides it (needle-leaved and evergreen fully, leafless half)
    const canopy = tree * (needle * (1 - 0.5 * cv.larch * (1 - leaf)) + (1 - needle) * (ever + (1 - ever) * (0.5 + 0.5 * leaf)));
    const snow = cv.snow[v] * (1 - K.snowUnderTrees * canopy), open = 1 - snow;
    // trees: needle-leaved, broad-leaved evergreen, deciduous in leaf or bare
    w[I.needle] += open * tree * needle;
    w[I.evergreen] += open * tree * (1 - needle) * ever;
    w[I.leafOn] += open * tree * (1 - needle) * (1 - ever) * leaf;
    w[I.leafOff] += open * tree * (1 - needle) * (1 - ever) * (1 - leaf);
    // grass and shrub: green (lush or tundra), or dormant (golden with drought, brown with cold)
    w[I.grass] += open * grass * green * lush;
    w[I.tundra] += open * grass * green * (1 - lush);
    w[I.dry] += open * grass * (1 - green) * (1 - cold);
    w[I.cold] += open * grass * (1 - green) * cold;
    // bare ground: cold to warm, the hot deserts', the wet tropics' red
    const b = open * bare;
    w[I.soilCold] += b * (1 - red) * (1 - hotDry) * (1 - warmSoil);
    w[I.soilWarm] += b * (1 - red) * (1 - hotDry) * warmSoil;
    w[I.desert] += b * (1 - red) * hotDry;
    w[I.laterite] += b * red;
    w[I.snow] += snow;
    return w;
}
const I = Object.fromEntries(KEYS.map((k, i) => [k, i]));

/** The colour (sRGB 0…255, into out[o…o+2]) of a cover in view v (0 the year, 1 January, 2 July) — tinted by the
 *  place's variety `vy` (placeVariety; none: as the reference colours). */
let W = null;
export function coverRgb(cv, v, out, o = 0, K = COVER, vy = null) {
    const L = linear(), w = coverWeights(cv, v, W ??= new Float64Array(KEYS.length), K);
    let r = 0, g = 0, b = 0;
    for (let k = 0, j = 0; k < KEYS.length; k++, j += 3) {
        const x = w[k];
        if (!x) continue;
        const t = vy ? vy[GROUP[k]] : NO_TINT;
        r += x * L[j] * t[0]; g += x * L[j + 1] * t[1]; b += x * L[j + 2] * t[2];
    }
    out[o] = toSrgb(r); out[o + 1] = toSrgb(g); out[o + 2] = toSrgb(b);
    return out;
}

// ── variety: each kind of ground tinted by noise between a few natural colours (COVER.vary*) ──
const NO_TINT = [1, 1, 1];
/** Each reference colour's kind, for its tint: bare ground, grass and shrub, broad-leaved trees, needle-leaved; snow none. */
const GROUP = KEYS.map(k => ({ soilCold: 'soil', soilWarm: 'soil', desert: 'soil', laterite: 'soil', grass: 'grass', tundra: 'grass', dry: 'grass', cold: 'grass',
    needle: 'needle', evergreen: 'tree', leafOn: 'tree', leafOff: 'tree' })[k] ?? 'none');
/** A place's tints to fill (reused). */
export function newVariety() { return { soil: [1, 1, 1], grass: [1, 1, 1], tree: [1, 1, 1], needle: [1, 1, 1], none: NO_TINT }; }
/**
 * The tints at a place (x, y, z on the unit sphere) from `noise` (FastNoise): provinces (K.varyKm[0]), patches
 * (K.varyKm[1]) and the vegetation's own (K.varyKm[2]) — each domain-warped (by K.varyWarp of its size) and
 * standardized; a tint grows evenly from none, at the noise's mean, to all at K.varyStrength standard deviations (no
 * threshold: broad gradients, not spots). Into `vy` (newVariety).
 */
export function placeVariety(x, y, z, noise, vy, K = COVER) {
    const R = 6371, s = 1 / (0.28 * K.varyStrength), wk = K.varyWarp;
    // (one warp for all: a low noise field displacing where every field is read)
    const fw = R / K.varyKm[0], wx = x + wk * noise.fbm(fw * x + 31.4, fw * y, fw * z, 2, 0.5) * K.varyKm[0] / R, wy = y + wk * noise.fbm(fw * x, fw * y + 27.1, fw * z, 2, 0.5) * K.varyKm[0] / R, wz = z + wk * noise.fbm(fw * x, fw * y, fw * z + 19.9, 2, 0.5) * K.varyKm[0] / R;
    const f1 = R / K.varyKm[0], f2 = R / K.varyKm[1], f3 = R / K.varyKm[2];
    // (provinces broad — two octaves, so whole regions lean one way; patches and the vegetation's own finer — three)
    const a = s * noise.fbm(f1 * wx, f1 * wy, f1 * wz, 2, 0.5) / 0.93, b = s * noise.fbm(f2 * wx + 5.3, f2 * wy - 2.1, f2 * wz + 7.7, 3, 0.5);
    const c = s * noise.fbm(f3 * wx - 3.3, f3 * wy + 8.1, f3 * wz - 1.7, 3, 0.5), d = s * noise.fbm(f3 * wx + 9.2, f3 * wy + 4.4, f3 * wz - 6.6, 3, 0.5);
    const sh = t => Math.max(0, Math.min(1, t)), L = logTints(K);
    tint(vy.soil, L.red, sh(a), L.pale, sh(-a), L.dark, sh(b), L.grey, sh(-b));
    tint(vy.grass, L.lush, sh(c), L.olive, sh(-c), L.khaki, 0.7 * sh(a), L.none, 0);
    tint(vy.tree, L.deep, sh(d), L.treeOlive, sh(-d), L.none, 0, L.none, 0);
    tint(vy.needle, L.deep, sh(d), L.treeOlive, sh(-d), L.blue, sh(b), L.none, 0);
    return vy;
}
/** out = Π tint^share, per channel (four tints, given as logs: one exponential a channel). */
function tint(out, l1, s1, l2, s2, l3, s3, l4, s4) {
    for (let ch = 0; ch < 3; ch++) out[ch] = Math.exp(l1[ch] * s1 + l2[ch] * s2 + l3[ch] * s3 + l4[ch] * s4);
}
/** The tints' logs (per settings object, once). */
const LOGS = new WeakMap();
function logTints(K) {
    if (!LOGS.has(K)) {
        const ln = t => t.map(Math.log), S = K.varySoil, G = K.varyGrass, T = K.varyTree;
        LOGS.set(K, { red: ln(S.red), pale: ln(S.pale), dark: ln(S.dark), grey: ln(S.grey), lush: ln(G.lush), olive: ln(G.olive), khaki: ln(G.khaki),
            deep: ln(T.deep), treeOlive: ln(T.olive), blue: ln(T.blue), none: [0, 0, 0] });
    }
    return LOGS.get(K);
}

/** The fine mottling of the picture's brightness at a place (unit sphere): a factor around 1 (K.varyFineKm, varyBright). */
export function fineMottle(x, y, z, noise, K = COVER) {
    const f = 6371 / K.varyFineKm;
    return 1 + K.varyBright * Math.max(-1.5, Math.min(1.5, noise.fbm(f * x + 2.7, f * y - 9.1, f * z + 4.3, 2, 0.5) / 0.3));
}

// ── each climate's own colour (developer: "it might need to bias a bit more towards the average color for a given season
// for a climate"): Blue Marble's mean over Earth's land of each Köppen class (Beck et al. 1°, interior cells, mixed in
// linear light) in its local winter (January in the north, July in the south), its local summer, and through the year
// (all twelve months) — the satellite S1 Earth check ──
export const CLIMATE_RGB = {
    Af: { winter: [24, 38, 12], summer: [25, 40, 13], year: [25, 40, 13] },  // 370 cells
    Am: { winter: [33, 43, 15], summer: [32, 45, 14], year: [33, 45, 15] },  // 282 cells
    Aw: { winter: [67, 60, 33], summer: [53, 61, 27], year: [63, 62, 32] },  // 1255 cells
    BWh: { winter: [163, 133, 94], summer: [170, 140, 104], year: [167, 137, 99] },  // 1710 cells
    BWk: { winter: [144, 131, 108], summer: [138, 121, 93], year: [138, 123, 96] },  // 525 cells
    BSh: { winter: [105, 85, 53], summer: [107, 93, 60], year: [108, 90, 58] },  // 681 cells
    BSk: { winter: [155, 149, 139], summer: [112, 97, 67], year: [124, 112, 91] },  // 780 cells
    Cfa: { winter: [64, 58, 32], summer: [54, 62, 27], year: [60, 60, 30] },  // 481 cells
    Cfb: { winter: [52, 54, 32], summer: [53, 58, 28], year: [51, 56, 29] },  // 165 cells
    Cfc: { winter: [52, 54, 32], summer: [53, 58, 28], year: [51, 56, 29] },  // (as Cfb: too rare on Earth)
    Csa: { winter: [87, 80, 62], summer: [112, 97, 69], year: [99, 87, 64] },  // 89 cells
    Csb: { winter: [71, 67, 50], summer: [67, 63, 35], year: [67, 63, 40] },  // 55 cells
    Csc: { winter: [71, 67, 50], summer: [67, 63, 35], year: [67, 63, 40] },  // (as Csb: too rare on Earth)
    Cwa: { winter: [63, 59, 33], summer: [63, 68, 34], year: [66, 65, 36] },  // 336 cells
    Cwb: { winter: [71, 59, 36], summer: [59, 61, 31], year: [67, 60, 34] },  // 113 cells
    Cwc: { winter: [71, 59, 36], summer: [59, 61, 31], year: [67, 60, 34] },  // (as Cwb: too rare on Earth)
    Dfa: { winter: [146, 141, 133], summer: [58, 65, 32], year: [98, 94, 78] },  // 242 cells
    Dfb: { winter: [172, 175, 176], summer: [45, 54, 24], year: [115, 117, 111] },  // 1215 cells
    Dfc: { winter: [187, 195, 200], summer: [46, 52, 30], year: [157, 161, 161] },  // 2389 cells
    Dfd: { winter: [200, 206, 211], summer: [37, 49, 18], year: [163, 166, 167] },  // 22 cells
    Dsa: { winter: [148, 139, 122], summer: [128, 109, 74], year: [128, 113, 85] },  // 23 cells
    Dsb: { winter: [162, 160, 153], summer: [96, 85, 55], year: [119, 112, 95] },  // 95 cells
    Dsc: { winter: [205, 212, 217], summer: [51, 56, 34], year: [173, 177, 178] },  // 221 cells
    Dsd: { winter: [200, 206, 211], summer: [37, 49, 18], year: [163, 166, 167] },  // (as Dfd: too rare on Earth)
    Dwa: { winter: [126, 114, 100], summer: [64, 69, 37], year: [97, 88, 68] },  // 81 cells
    Dwb: { winter: [155, 150, 145], summer: [50, 59, 27], year: [107, 103, 92] },  // 170 cells
    Dwc: { winter: [166, 168, 169], summer: [51, 57, 32], year: [136, 136, 133] },  // 362 cells
    Dwd: { winter: [217, 222, 227], summer: [48, 55, 27], year: [184, 187, 187] },  // 51 cells
    ET: { winter: [176, 175, 171], summer: [122, 118, 105], year: [158, 156, 150] },  // 721 cells
    EF: { winter: [237, 240, 242], summer: [237, 240, 242], year: [237, 240, 242] },  // 5716 cells
};

/**
 * A climate's colour made livelier (developer, on Blue Marble's own: "everything looks a bit too dry/not green" — V1's
 * satellite greens are the look): a green (hue between yellow-green and blue-green) turned `share` of the way toward
 * `hue`, its saturation × `sat` and brightness × `value` — golds, browns, greys and snow left as they are. sRGB in, out.
 */
export function livelier(rgb, G) {
    const r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (!(d > 1e-6)) return rgb;
    let h = mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
    if (h < 0) h += 360;
    // (a green, and a coloured one: greys and snow have no green to bring out)
    const green = smooth(G.from[0], G.from[1], h) * (1 - smooth(G.to[0], G.to[1], h)) * smooth(0.1, 0.25, d / mx);
    if (!(green > 0)) return rgb;
    const H = h + (G.hue - h) * G.share * green, S = Math.min(1, (d / mx) * (1 + (G.sat - 1) * green)), V = Math.min(1, mx * (1 + (G.value - 1) * green));
    const c = V * S, x = c * (1 - Math.abs(((H / 60) % 2) - 1)), m = V - c, i = Math.floor(H / 60) % 6;
    const [R, Gg, B] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][i];
    return [Math.round(255 * (R + m)), Math.round(255 * (Gg + m)), Math.round(255 * (B + m))];
}

/**
 * Pull each view's colours (`sat`: the year, January, July — sRGB per cell, rewritten) toward their climates' own: each
 * Köppen class's mean colour on this planet (in linear light; January the local winter north of the equator and the local
 * summer south of it, blended over ±8°) moved K.climateBias of the way to its CLIMATE_RGB, made livelier (K.climateGreen)
 * — as a ratio per class, season
 * and channel (an exposure and white balance: an offset, set by a climate's bright grass and soil, drove its dark forest
 * to black), applied to every cell of it, so the cover's own detail within a climate stays; the ratios (their logs)
 * blurred over K.climateBiasKm (on `grid`, finish-grid.js). The pull is strongest deep inside a climate and fades to none
 * at its edge with another, where the cover's own colours, which change smoothly, carry the transition (developer: the
 * pull alone was "surfacing a lot of bands … relying more on the real color … when transitioning between climate zones,
 * but relying more on the base color … the further from another climate we are") — that depth roughened by noise, and
 * the corrections warped, so the transitions meander (`seed`: their noise).
 */
export function biasTowardClimate(sat, koppen, lat, lon, use, grid, seed = 0, K = COVER) {
    const n = koppen.length, w = K.climateBias, NC = KOPPEN_CLASSES.length;
    if (!(w > 0)) return;
    const LUT = Float64Array.from({ length: 256 }, (_, v) => toLin(v));
    const north = c => Math.min(1, Math.max(0, (lat[c] + 8) / 16));
    // the planet's mean per class: [class][season: 0 year, 1 winter, 2 summer][r, g, b, weight]
    const M = new Float64Array(NC * 3 * 4), add = (k, s, v, c, wt) => { const o = (k * 3 + s) * 4; for (let ch = 0; ch < 3; ch++) M[o + ch] += wt * LUT[sat[v][3 * c + ch]]; M[o + 3] += wt; };
    for (let c = 0; c < n; c++) {
        if (!use(c)) continue;
        const k = koppen[c], nn = north(c);
        add(k, 0, 0, c, 1); add(k, 1, 1, c, nn); add(k, 2, 2, c, nn); add(k, 1, 2, c, 1 - nn); add(k, 2, 1, c, 1 - nn);
    }
    // its ratio toward the climate's own colour (as a log; within bounds, so no climate is driven to black or white)
    const O = new Float64Array(NC * 3 * 3), lo = Math.log(K.climateRatio[0]), hi = Math.log(K.climateRatio[1]);
    KOPPEN_CLASSES.forEach((cls, k) => {
        const A = CLIMATE_RGB[cls.code];
        if (!A) return;
        [A.year, A.winter, A.summer].map(c => livelier(c, K.climateGreen)).forEach((rgb, s) => {
            const o = (k * 3 + s) * 4;
            if (M[o + 3] > 0) for (let ch = 0; ch < 3; ch++) O[(k * 3 + s) * 3 + ch] = Math.max(lo, Math.min(hi, Math.log(Math.max(1e-4, toLin(rgb[ch])) / Math.max(1e-4, M[o + ch] / M[o + 3]))));
        });
    });
    // each cell's log-ratio for each view (nine fields: view × channel) gathered onto the grid in one pass, blurred, and
    // applied with one bilinear lookup per cell
    const G = grid.size, sums = Array.from({ length: 9 }, () => new Float64Array(G)), count = new Float64Array(G), at = new Int32Array(n).fill(-1);
    const off = new Float64Array(9);
    const offsets = c => {
        const k = koppen[c], nn = north(c);
        for (let ch = 0; ch < 3; ch++) {
            const oy = O[(k * 3) * 3 + ch], ow = O[(k * 3 + 1) * 3 + ch], os = O[(k * 3 + 2) * 3 + ch];
            off[ch] = oy; off[3 + ch] = nn * ow + (1 - nn) * os; off[6 + ch] = nn * os + (1 - nn) * ow;
        }
    };
    for (let c = 0; c < n; c++) {
        if (!use(c)) continue;
        const g = at[c] = grid.index(lat[c], lon[c]);
        offsets(c);
        for (let f = 0; f < 9; f++) sums[f][g] += off[f];
        count[g]++;
    }
    const fields = sums.map(S => { const m = new Float32Array(S.length); for (let g = 0; g < S.length; g++) m[g] = count[g] ? S[g] / count[g] : NaN; return grid.blur(m, K.climateBiasKm); });
    const { w: gw, h: gh, step } = grid;
    // how deep inside its climate each place is: the grid's main class per grid cell, the distance (km) to the nearest
    // grid cell of another (chamfer: rows narrower toward the poles; the sea passed over, never a climate of its own),
    // roughened by noise; the pull from none at the edge to all at K.climateDepthKm[1]
    const counts = new Uint16Array(G * NC), main = new Uint8Array(G);
    for (let c = 0; c < n; c++) if (at[c] >= 0) { const o = at[c] * NC + koppen[c]; if (counts[o] < 65535) counts[o]++; }
    for (let g = 0; g < G; g++) { let best = 0, bk = 0; for (let k = 1; k < NC; k++) if (counts[g * NC + k] > best) { best = counts[g * NC + k]; bk = k; } main[g] = bk; }
    const dist = new Float64Array(G).fill(Infinity), kmY = 6371 * Math.PI / 180 * step, kmX = new Float64Array(gh);
    for (let j = 0; j < gh; j++) kmX[j] = kmY * Math.max(0.02, Math.cos((90 - (j + 0.5) * step) * Math.PI / 180));
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
        const g = j * gw + i, k = main[g];
        if (!k) continue;
        for (let dj = -1; dj <= 1 && dist[g]; dj++) for (let di = -1; di <= 1; di++) {
            const jj = j + dj; if (jj < 0 || jj >= gh) continue;
            const kk = main[jj * gw + (i + di + gw) % gw];
            if (kk && kk !== k) { dist[g] = 0; break; }
        }
    }
    for (let round = 0; round < 2; round++) {
        for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {                  // from the north-west
            const g = j * gw + i, dx = kmX[j], dd = Math.hypot(dx, kmY);
            let d = dist[g];
            d = Math.min(d, dist[j * gw + (i + gw - 1) % gw] + dx);
            if (j > 0) { const r = (j - 1) * gw; d = Math.min(d, dist[r + i] + kmY, dist[r + (i + gw - 1) % gw] + dd, dist[r + (i + 1) % gw] + dd); }
            dist[g] = d;
        }
        for (let j = gh - 1; j >= 0; j--) for (let i = gw - 1; i >= 0; i--) {         // from the south-east
            const g = j * gw + i, dx = kmX[j], dd = Math.hypot(dx, kmY);
            let d = dist[g];
            d = Math.min(d, dist[j * gw + (i + 1) % gw] + dx);
            if (j < gh - 1) { const r = (j + 1) * gw; d = Math.min(d, dist[r + i] + kmY, dist[r + (i + gw - 1) % gw] + dd, dist[r + (i + 1) % gw] + dd); }
            dist[g] = d;
        }
    }
    const noise = new FastNoise(((seed | 0) * 0x2c1b + 0x5a7) >>> 0), f = 6371 / K.climateNoiseKm, deg = 180 / Math.PI;
    const unit = (g, out) => { const la = (90 - (((g / gw) | 0) + 0.5) * step) / deg, lo = ((g % gw) + 0.5) * step / deg - Math.PI; out[0] = Math.cos(la) * Math.cos(lo); out[1] = Math.cos(la) * Math.sin(lo); out[2] = Math.sin(la); return out; };
    const u = [0, 0, 0], depth = new Float32Array(G).fill(NaN);
    for (let g = 0; g < G; g++) {
        if (!main[g]) continue;
        unit(g, u);
        const d = dist[g] + K.climateDepthNoiseKm * noise.fbm(f * u[0], f * u[1], f * u[2], 3, 0.5);
        depth[g] = smooth(K.climateDepthKm[0], K.climateDepthKm[1], d);
    }
    fields.push(grid.blur(depth, K.climateBiasKm / 2));
    // the corrections and their depth warped: each grid cell takes them from a place displaced by noise (up to about
    // K.climateWarpKm), so their transitions meander
    const warped = fields.map(() => new Float32Array(G)), wdeg = K.climateWarpKm / (6371 * Math.PI / 180);
    for (let g = 0; g < G; g++) {
        unit(g, u);
        const la = 90 - (((g / gw) | 0) + 0.5) * step, lo = ((g % gw) + 0.5) * step - 180;
        const dla = wdeg * noise.fbm(f * u[0] + 17.3, f * u[1] - 4.1, f * u[2] + 9.7, 3, 0.5), dlo = wdeg * noise.fbm(f * u[0] - 8.6, f * u[1] + 13.2, f * u[2] - 2.9, 3, 0.5) / Math.max(0.2, Math.cos(la / deg));
        for (let q = 0; q < fields.length; q++) warped[q][g] = grid.at(fields[q], Math.max(-89.9, Math.min(89.9, la + dla)), ((lo + dlo + 540) % 360) - 180);
    }
    const DEPTH = warped[9];
    for (let c = 0; c < n; c++) {
        if (at[c] < 0) continue;
        const x = (lon[c] + 180) / step - 0.5, y = Math.max(0, Math.min(gh - 1, (90 - lat[c]) / step - 0.5));
        const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
        const i0 = ((x0 % gw) + gw) % gw, i1 = i0 + 1 === gw ? 0 : i0 + 1, j1 = y0 + 1 < gh ? y0 + 1 : y0;
        const a = y0 * gw + i0, b = y0 * gw + i1, cc = j1 * gw + i0, d = j1 * gw + i1, wa = (1 - fx) * (1 - fy), wb = fx * (1 - fy), wc = (1 - fx) * fy, wd = fx * fy;
        // (how deep inside its climate: the pull's share here)
        let dep = 0, dk = 0;
        if (DEPTH[a] === DEPTH[a]) { dep += DEPTH[a] * wa; dk += wa; }
        if (DEPTH[b] === DEPTH[b]) { dep += DEPTH[b] * wb; dk += wb; }
        if (DEPTH[cc] === DEPTH[cc]) { dep += DEPTH[cc] * wc; dk += wc; }
        if (DEPTH[d] === DEPTH[d]) { dep += DEPTH[d] * wd; dk += wd; }
        const wHere = w * (dk > 1e-9 ? dep / dk : 1);
        if (!(wHere > 0.001)) continue;
        for (let f = 0; f < 9; f++) {
            const F = warped[f];
            let s = 0, k = 0;
            if (F[a] === F[a]) { s += F[a] * wa; k += wa; }
            if (F[b] === F[b]) { s += F[b] * wb; k += wb; }
            if (F[cc] === F[cc]) { s += F[cc] * wc; k += wc; }
            if (F[d] === F[d]) { s += F[d] * wd; k += wd; }
            if (!(k > 1e-9)) continue;
            const S = sat[(f / 3) | 0], o = 3 * c + (f % 3);
            S[o] = toSrgb(LUT[S[o]] * Math.exp(wHere * s / k));
        }
    }
}

/**
 * The rain the cover reads, a little smoother than the climate's own (developer: "a little noise and warping and smoothing
 * on things like precipitation so its a bit less splotchy (to an extent)"): each place's year of rain (`rain`, mm, per
 * cell) gathered onto `grid` (in logs), blurred over K.coverRainKm, its pattern warped by up to about K.coverRainWarpKm
 * and roughened by a little noise (× e^{±K.coverRainNoise}), both at K.coverRainNoiseKm. Per cell, the year's rain the
 * cover should read there; landCover's months are scaled toward it by K.coverRainShare (coverRainScale). The climate tabs
 * keep the climate's own rain.
 */
export function coverRain(rain, lat, lon, use, grid, seed = 0, K = COVER) {
    const n = rain.length, G = grid.size, sum = new Float64Array(G), cnt = new Float64Array(G);
    for (let c = 0; c < n; c++) { if (!use(c) || !(rain[c] >= 0)) continue; const g = grid.index(lat[c], lon[c]); sum[g] += Math.log1p(rain[c]); cnt[g]++; }
    const mean = new Float32Array(sum.length);
    for (let g = 0; g < sum.length; g++) mean[g] = cnt[g] ? sum[g] / cnt[g] : NaN;
    const field = grid.blur(mean, K.coverRainKm);
    const { w: gw, step } = grid, noise = new FastNoise(((seed | 0) * 0x3d2f + 0x11d) >>> 0), f = 6371 / K.coverRainNoiseKm, deg = 180 / Math.PI;
    const wdeg = K.coverRainWarpKm / (6371 * Math.PI / 180), warped = new Float32Array(G);
    for (let g = 0; g < G; g++) {
        const la = 90 - (((g / gw) | 0) + 0.5) * step, lo = ((g % gw) + 0.5) * step - 180, cl = Math.cos(la / deg);
        const x = f * cl * Math.cos(lo / deg), y = f * cl * Math.sin(lo / deg), z = f * Math.sin(la / deg);
        const dla = wdeg * noise.fbm(x + 3.1, y - 7.7, z + 1.9, 3, 0.5), dlo = wdeg * noise.fbm(x - 5.3, y + 2.2, z - 8.4, 3, 0.5) / Math.max(0.2, cl);
        const v = grid.at(field, Math.max(-89.9, Math.min(89.9, la + dla)), ((lo + dlo + 540) % 360) - 180);
        warped[g] = v === v ? v + K.coverRainNoise * noise.fbm(x, y, z, 3, 0.5) : NaN;
    }
    const out = new Float32Array(n).fill(NaN);
    for (let c = 0; c < n; c++) if (use(c)) { const v = grid.at(warped, lat[c], lon[c]); if (v === v) out[c] = Math.expm1(v); }
    return out;
}

/** A place's months (P, mm) scaled toward the year of rain the cover should read there (coverRain), into `out`. */
export function coverRainScale(P, target, out, K = COVER) {
    let s = 0;
    for (let m = 0; m < 12; m++) s += Math.max(0, P[m]);
    const k = s > 0 && target > 0 ? (target / s) ** K.coverRainShare : 1;
    for (let m = 0; m < 12; m++) out[m] = P[m] * k;
    return out;
}

/** The bare ground's tint toward the finish's own sand seas, loess and flood basalt at a place (shares 0…1), and the rock
 *  under it (geology/rocks.js Rock, or 0: none), into vy. */
export function placeGround(vy, sand, loess, basalt, K = COVER, rock = 0) {
    if (rock > 0) { const t = K.rockTint[rock], s = K.rockTintShare; for (let ch = 0; ch < 3; ch++) vy.soil[ch] *= t[ch] ** s; }
    if (!(sand > 0 || loess > 0 || basalt > 0)) return vy;
    for (let ch = 0; ch < 3; ch++) vy.soil[ch] *= K.sandTint[ch] ** sand * K.loessTint[ch] ** loess * K.basaltTint[ch] ** basalt;
    return vy;
}

/**
 * The terrain on the satellite picture (S2): per land pixel of the climate's picture (finish.js finishRaster: C — its
 * sat views, cover, tAnnual, pAnnual, flow (log10 km² drained, per pixel), noise — and the finished heights, `heightM`
 * w wide), from the heights there: rock and scree where the ground is rugged or steep (most where it is dry or cold;
 * less in a snowy month); in dry country the slopes facing the pole greener and those facing the equator barer, the
 * valleys greener and the ridges barer; and over everything the flow texture, by the area drained. In place.
 */
export function terrainLook(C, heightM, w, K = COVER) {
    const { w: cw, h: ch, sat, cover, tAnnual, pAnnual, koppen, flow, young, noise, rivers, water, ripSat } = C, f = w / cw, pxKm = 2 * Math.PI * 6371 / cw;
    const lnTone = K.mtnToneTint.map(Math.log);
    // (heights at the picture's pixels, km; the land's surroundings' mean and spread over K.valleyKm)
    const hC = new Float32Array(cw * ch), land = new Uint8Array(cw * ch);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { const i = y * cw + x; hC[i] = heightM[y * f * w + x * f] / 1000; land[i] = koppen[i] ? 1 : 0; }
    const { mean, std } = boxStats(hC, land, cw, ch, pxKm, K.valleyKm);
    // (the rivers' green ribbons and the lakes' fringes: how much of each pixel is riverside, 0…1)
    // (only where it is dry enough for the green to show — most rivers run through green country)
    const dryAt = i => { const T = tAnnual[i] / 100; return 1 - smooth(0.25, 1, pAnnual[i] / Math.max(60, 300 + 55 * T)); };
    const rip = rivers || water ? riparian(rivers, water, w, hC, land, cw, ch, pxKm, K, noise, dryAt) : null;
    const rg = 6371 / K.ripGrainKm, ripViews = ripSat ? [ripSat.year, ripSat.jan, ripSat.jul] : null;
    const LUT = Float64Array.from({ length: 256 }, (_, v) => toLin(v)), rW = K.rockWarm.map(toLin), rC = K.rockCold.map(toLin);
    const lnG = K.greenerTint.map(Math.log), lnB = K.barerTint.map(Math.log), lnF = K.flowTint.map(Math.log), views = [sat.year, sat.jan, sat.jul];
    const fLo = Math.log10(K.flowAreaKm2[0]), fHi = Math.log10(K.flowAreaKm2[1]), fg = 6371 / K.flowGrainKm, mul = [0, 0, 0], mulR = [0, 0, 0], rk = [0, 0, 0];
    // (the mountain texture: its octaves down to two pixels; the light as the page's — from the north-west, 45° up)
    let mOct = 0;
    for (let lam = K.mtnTextureKm; lam >= 2 * pxKm && mOct < 4; lam /= 2) mOct++;
    mOct = Math.max(1, mOct);
    const mf = 6371 / K.mtnTextureKm, dU = 0.25 * (K.mtnTextureKm / 2 ** (mOct - 1)) / 6371, Le = -0.5, Ln = 0.5, Lu = Math.SQRT1_2;
    const ridged = (x, y, z) => { let s = 0, a = 1, t = 0, f = mf; for (let o = 0; o < mOct; o++, a *= 0.5, f *= 2) { const v = 1 - Math.abs(noise.noise3D(f * x + 11.3, f * y - 7.1, f * z + 3.9)); s += a * v * v; t += a; } return s / t; };
    // (each column's longitude's cosine and sine, once; and per pixel the mountains' tone and the flow texture on snow
    // worked out once for the three views, as they need them)
    const cosL = new Float64Array(cw), sinL = new Float64Array(cw), toneE = [0, 0, 0], toneS = [0, 0, 0], flowS = [0, 0, 0];
    for (let x = 0; x < cw; x++) { const lon = ((x + 0.5) / cw - 0.5) * 2 * Math.PI; cosL[x] = Math.cos(lon); sinL[x] = Math.sin(lon); }
    for (let y = 0; y < ch; y++) {
        const lat = (0.5 - (y + 0.5) / ch) * Math.PI, cl = Math.max(0.05, Math.cos(lat)), sl = Math.sin(lat), pole = lat >= 0 ? 1 : -1;
        const up = Math.max(0, y - 1) * cw, dn = Math.min(ch - 1, y + 1) * cw, row = y * cw;
        for (let x = 0; x < cw; x++) {
            const i = row + x;
            if (!land[i]) continue;
            // the slope (m per km) and the way it faces
            const ge = (hC[row + (x + 1 === cw ? 0 : x + 1)] - hC[row + (x === 0 ? cw - 1 : x - 1)]) / (2 * pxKm * cl), gn = (hC[up + x] - hC[dn + x]) / (2 * pxKm);
            const slope = 1000 * Math.sqrt(ge * ge + gn * gn);
            // the place's dryness and cold (its year: rain against the potential evaporation the rivers use)
            const T = tAnnual[i] / 100, wet = pAnnual[i] / Math.max(60, 300 + 55 * T);
            const dry = 1 - smooth(0.25, 1, wet), cold = smooth(3, -6, T);
            const rugged = Math.max(smooth(K.rockRelief[0], K.rockRelief[1], std[i]), smooth(K.rockSlope[0], K.rockSlope[1], slope));
            const rock = K.rockMax * rugged * (K.rockExposure + (1 - K.rockExposure) * Math.max(dry, cold));
            // facing the pole (+1) or the equator (−1), on a slope; below (+) or above (−) the surroundings
            const facing = slope > 1e-3 ? (-gn * pole * 1000 / slope) * smooth(K.aspectSlope[0], K.aspectSlope[1], slope) : 0;
            const valley = Math.max(-1, Math.min(1, (mean[i] - hC[i]) / K.valleyKmPerFull));
            const lean = dry * (K.aspectShare * facing + K.valleyShare * valley), tint = lean >= 0 ? lnG : lnB, a = Math.abs(lean);
            // the flow texture: its opacity by the area drained, grained
            let fo = 0;
            if (flow) {
                fo = K.flowOpacity * smooth(fLo, fHi, flow[i]);
                if (fo > 0 && noise) fo *= Math.max(0, 1 + K.flowGrain * noise.fbm(fg * cl * cosL[x] - 4.1, fg * cl * sinL[x] + 6.3, fg * sl + 2.2, 2, 0.5) / 0.3);
            }
            // the mountains' texture: how mountainous (rugged, or high), a ridged micro-relief there lit as the page's relief,
            // its crests barer
            const M = Math.max(smooth(K.mtnRelief[0], K.mtnRelief[1], std[i]), K.mtnHigh * smooth(K.mtnHeightKm[0], K.mtnHeightKm[1], hC[i]));
            let dShade = 1, crest = 0;
            if (M > 0.01 && noise) {
                const px = cl * cosL[x], py = cl * sinL[x], pz = sl;
                // (east and north at this place, on the unit sphere)
                const ex = -sinL[x], ey = cosL[x], nx = -sl * cosL[x], ny = -sl * sinL[x], nz = cl;
                const r0 = ridged(px, py, pz), rE = ridged(px + dU * ex, py + dU * ey, pz), rN = ridged(px + dU * nx, py + dU * ny, pz + dU * nz);
                const amp = K.mtnReliefKm * M, gE = amp * (rE - r0) / (dU * 6371), gN = amp * (rN - r0) / (dU * 6371);
                const sx = -K.mtnExaggeration * gE, sy = -K.mtnExaggeration * gN, len = Math.sqrt(sx * sx + sy * sy + 1);
                dShade = Math.max(0.55, Math.min(1.35, (sx * Le + sy * Ln + Lu) / len / Lu));
                crest = K.mtnCrestRock * M * smooth(0.45, 0.85, r0);
            }
            // the mountains' tone: young and high ranges dark brown, old worn ones a little
            const yg = young ? young[i] / 255 : 1;
            const tone = K.mtnTone * M * (K.mtnToneOld + (1 - K.mtnToneOld) * yg) * (0.5 + 0.5 * smooth(K.mtnToneHeightKm[0], K.mtnToneHeightKm[1], hC[i]));
            // (the ground's own tints first — slopes, valleys, the flow texture; then the river green over them; then the
            // mountains' light, tone and rock over all: "mountain texture should probably layer on top of rivers")
            for (let c = 0; c < 3; c++) { mul[c] = Math.exp(a * tint[c] + fo * lnF[c]); mulR[c] = Math.exp(a * tint[c]); rk[c] = rC[c] + (rW[c] - rC[c]) * smooth(-2, 12, T); }
            // (the riverside's opacity, grained)
            let rp = rip && ripViews ? rip[i] * dry * K.ripMax : 0;
            if (rp > 0 && noise) rp *= Math.max(0, 1 + K.ripGrain * noise.fbm(rg * cl * cosL[x] + 8.8, rg * cl * sinL[x] - 3.3, rg * sl + 6.1, 2, 0.5) / 0.3);
            const cv = cover[i], ice = (cv & 31) === 1;
            let snowDone = false;
            for (let c = 0; c < 3; c++) toneE[c] = Math.exp(tone * lnTone[c]);
            for (let v = 0; v < 3; v++) {
                const S = views[v], o = 3 * i, snowy = ice || (v === 1 && cv & 32) || (v === 2 && cv & 64);
                // (the riverside: the climate's own cover, well watered — its season and warmth its own)
                const g = snowy ? 0 : Math.min(1, rp), RV = ripViews ? ripViews[v] : null;
                const r = Math.min(0.95, (rock + crest * (1 - rock)) * (snowy ? K.rockUnderSnow : 1));
                if (snowy && !snowDone) { for (let c = 0; c < 3; c++) { flowS[c] = Math.exp(-0.5 * fo * lnF[c]); toneS[c] = Math.exp(tone / 3 * lnTone[c]); } snowDone = true; }
                for (let c = 0; c < 3; c++) {
                    // (the flow texture half as strong on snow, the mountains' tone a third)
                    let L = LUT[S[o + c]] * (snowy ? mul[c] * flowS[c] : mul[c]);
                    // (the riverside over the flow texture: its green not darkened by it)
                    if (g > 0) L += (LUT[RV[o + c]] * mulR[c] - L) * g;
                    L *= dShade * (snowy ? toneS[c] : toneE[c]);
                    L += (rk[c] * dShade - L) * r;
                    S[o + c] = toSrgb(L);
                }
            }
        }
    }
}
/** The mean and standard deviation of `v` over the land around each pixel (two box passes, each radius `km`; rows by
 *  their own width), in one go. */
function boxStats(v, land, w, h, pxKm, km) {
    const s1 = new Float64Array(w * h), s2 = new Float64Array(w * h), n = new Float64Array(w * h);
    for (let i = 0; i < w * h; i++) if (land[i]) { const x = Math.max(0, v[i]); s1[i] = x; s2[i] = x * x; n[i] = 1; }
    const ry = Math.max(1, Math.round(km / pxKm)), L = Math.max(w, h), t1 = new Float64Array(L), t2 = new Float64Array(L), tn = new Float64Array(L);
    const R = ry + 1, r1 = new Float64Array(R * w), r2 = new Float64Array(R * w), rn = new Float64Array(R * w), A = new Float64Array(w), B = new Float64Array(w), C = new Float64Array(w);
    for (let pass = 0; pass < 2; pass++) {
        for (let y = 0; y < h; y++) {
            const cl = Math.max(0.05, Math.cos((0.5 - (y + 0.5) / h) * Math.PI)), r = Math.min(w >> 2, Math.max(1, Math.round(km / (pxKm * cl)))), o = y * w;
            let a = 0, b = 0, c = 0;
            for (let d = -r; d <= r; d++) { const j = o + (d < 0 ? d + w : d); a += s1[j]; b += s2[j]; c += n[j]; }
            for (let x = 0; x < w; x++) {
                t1[x] = a; t2[x] = b; tn[x] = c;
                let out = x - r; if (out < 0) out += w;
                let inn = x + r + 1; if (inn >= w) inn -= w;
                a += s1[o + inn] - s1[o + out]; b += s2[o + inn] - s2[o + out]; c += n[o + inn] - n[o + out];
            }
            for (let x = 0; x < w; x++) { s1[o + x] = t1[x]; s2[o + x] = t2[x]; n[o + x] = tn[x]; }
        }
        // (the columns' running sums side by side, a row at a time — memory in order — each row's values as they were kept
        // in a ring until the window leaves them: the same sums, in the same order, as column by column)
        A.fill(0); B.fill(0); C.fill(0);
        for (let d = 0; d <= ry && d < h; d++) { const o = d * w; for (let x = 0; x < w; x++) { A[x] += s1[o + x]; B[x] += s2[o + x]; C[x] += n[o + x]; } }
        for (let y = 0; y < h; y++) {
            const o = y * w, add = y + ry + 1, drop = y - ry, ra = add * w, rd = (drop % R) * w, rs = (y % R) * w;
            for (let x = 0; x < w; x++) {
                const a = A[x], b = B[x], c = C[x];
                if (add < h) { A[x] += s1[ra + x]; B[x] += s2[ra + x]; C[x] += n[ra + x]; }
                if (drop >= 0) { A[x] -= r1[rd + x]; B[x] -= r2[rd + x]; C[x] -= rn[rd + x]; }
                r1[rs + x] = s1[o + x]; r2[rs + x] = s2[o + x]; rn[rs + x] = n[o + x];
                s1[o + x] = a; s2[o + x] = b; n[o + x] = c;
            }
        }
    }
    const mean = new Float32Array(w * h), std = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) if (n[i] > 0) { const m = s1[i] / n[i]; mean[i] = m; std[i] = Math.sqrt(Math.max(0, s2[i] / n[i] - m * m)); }
    return { mean, std };
}

/**
 * How much of each pixel of the climate's picture (cw × ch, pxKm at the equator) is riverside (S3): each river (finish-
 * hydro.js rivers: reaches of points with discharge q) carrying K.ripMinM3s or more, smoothed (Chaikin, twice), stamped
 * as a ribbon K.ripWidthKm × √(q / 1000) wide (within K.ripWidthMaxKm), wider on low ground (K.ripLowKm: floodplains,
 * deltas), its edge soft over a pixel — a ribbon narrower than a pixel stamped fainter; and a fringe K.ripLakeKm wide
 * around the lakes (`water`: the finished picture's, w wide). The most of what covers a pixel.
 */
function riparian(R, water, w, hC, land, cw, ch, pxKm, K, noise = null, dryAt = null) {
    const out = new Float32Array(cw * ch);
    const stamp = (ax, ay, bx, by, widthKm, weight) => {
        // (pixels: x east, y south; distances in km — east-west shrunk by the latitude; a bell: all at the middle, none
        // K.ripSpread half-widths out)
        const yMid = 0.5 * (ay + by), cl = Math.max(0.05, Math.cos((0.5 - (yMid + 0.5) / ch) * Math.PI)), kx = pxKm * cl, ky = pxKm;
        const hw = 0.5 * widthKm, reach = K.ripSpread * hw + 0.75 * pxKm, cover = weight * Math.min(1, (widthKm + 0.3 * pxKm) / pxKm);
        const x0 = Math.floor(Math.min(ax, bx) - reach / kx), x1 = Math.ceil(Math.max(ax, bx) + reach / kx), y0 = Math.max(0, Math.floor(Math.min(ay, by) - reach / ky)), y1 = Math.min(ch - 1, Math.ceil(Math.max(ay, by) + reach / ky));
        const dx = (bx - ax) * kx, dy = (by - ay) * ky, L2 = dx * dx + dy * dy;
        for (let y = y0; y <= y1; y++) for (let xx = x0; xx <= x1; xx++) {
            const x = ((xx % cw) + cw) % cw, i = y * cw + x;
            if (!land[i]) continue;
            const px = (xx + 0.5 - ax) * kx, py = (y + 0.5 - ay) * ky, t = L2 > 0 ? Math.max(0, Math.min(1, (px * dx + py * dy) / L2)) : 0;
            const d = Math.hypot(px - t * dx, py - t * dy), v = cover * smooth(reach, 0, d);
            if (v > out[i]) out[i] = v;
        }
    };
    // (a point displaced by the meander noise: up to about K.ripWarpKm, in waves K.ripWarpWaveKm long — pixels)
    const wf = 6371 / K.ripWarpWaveKm;
    const warp = p => {
        if (!noise) return p;
        const lat = (0.5 - (p[1] + 0.5) / ch) * Math.PI, lon = ((p[0] + 0.5) / cw - 0.5) * 2 * Math.PI, cl = Math.max(0.05, Math.cos(lat));
        const x = wf * cl * Math.cos(lon), y = wf * cl * Math.sin(lon), z = wf * Math.sin(lat);
        const de = K.ripWarpKm * noise.fbm(x + 13.1, y - 5.2, z + 2.4, 2, 0.5) / 0.3, dn = K.ripWarpKm * noise.fbm(x - 6.9, y + 11.7, z - 4.8, 2, 0.5) / 0.3;
        return [p[0] + de / (pxKm * cl), p[1] - dn / pxKm, p[2]];
    };
    if (R) {
        const starts = [...R.start, R.lat.length];
        for (let r = 0; r < starts.length - 1; r++) {
            // (a reach as runs carrying enough water, split at the map's edge; smoothed)
            const runs = [[]];
            for (let i = starts[r]; i < starts[r + 1]; i++) {
                if (!(R.q[i] >= K.ripMinM3s)) { if (runs[runs.length - 1].length) runs.push([]); continue; }
                const p = [(R.lon[i] + 180) / 360 * cw - 0.5, (90 - R.lat[i]) / 180 * ch - 0.5, R.q[i]], cur = runs[runs.length - 1];
                if (cur.length && Math.abs(p[0] - cur[cur.length - 1][0]) > cw / 2) runs.push([]);
                runs[runs.length - 1].push(p);
            }
            for (let pts of runs) {
                if (pts.length < 2) continue;
                for (let it = 0; it < 2; it++) {
                    const nx = [pts[0]];
                    for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; nx.push(a.map((v, k) => 0.75 * v + 0.25 * b[k]), a.map((v, k) => 0.25 * v + 0.75 * b[k])); }
                    nx.push(pts[pts.length - 1]); pts = nx;
                }
                // the original course (fainter) and the meandering copy, blended — the most of them
                const wavy = pts.map(warp);
                for (const [line, weight] of [[pts, K.ripOriginal], [wavy, 1]]) for (let i = 0; i < line.length - 1; i++) {
                    const a = line[i], b = line[i + 1], q = 0.5 * (a[2] + b[2]);
                    if (Math.abs(a[0] - b[0]) > cw / 2) continue;
                    const mx = ((Math.round(0.5 * (a[0] + b[0])) % cw) + cw) % cw, my = Math.max(0, Math.min(ch - 1, Math.round(0.5 * (a[1] + b[1]))));
                    if (dryAt && land[my * cw + mx] && dryAt(my * cw + mx) < 0.02) continue;
                    const low = 1 + K.ripWiden * smooth(K.ripLowKm[0], K.ripLowKm[1], hC[my * cw + mx]);
                    const strength = 0.33 + 0.67 * smooth(Math.log(K.ripStrengthM3s[0]), Math.log(K.ripStrengthM3s[1]), Math.log(q));
                    stamp(a[0], a[1], b[0], b[1], Math.min(K.ripWidthMaxKm, Math.max(K.ripWidthMinKm, K.ripWidthKm * Math.sqrt(q / 1000))) * low, weight * strength);
                }
            }
        }
    }
    // (the lakes' fringes: land pixels within K.ripLakeKm of a lake's)
    if (water) {
        const f = w / cw, r = Math.max(1, Math.round(K.ripLakeKm / pxKm));
        const lakePx = new Uint8Array(cw * ch);
        for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { const v = water[y * f * w + x * f]; if (v === 1 || v === 2) lakePx[y * cw + x] = 1; }
        for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
            if (!lakePx[y * cw + x]) continue;
            for (let dy = -r; dy <= r; dy++) {
                const yy = y + dy;
                if (yy < 0 || yy >= ch) continue;
                for (let dx = -r; dx <= r; dx++) {
                    const i = yy * cw + ((x + dx) % cw + cw) % cw;
                    if (!land[i] || lakePx[i]) continue;
                    const v = 0.7 * (1 - Math.hypot(dx, dy) / (r + 1));
                    if (v > out[i]) out[i] = v;
                }
            }
        }
    }
    return out;
}
