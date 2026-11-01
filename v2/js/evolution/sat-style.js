// The Satellite view's height colours: each family of climates has its own colour by height — its lowland colour, held
// (a little darker) up to its tree line, then the mountains' dark grey-red rock with a little of the biome under it, grey
// rock higher up, and snow above its snow line — a summer and a winter version (the lines lower in winter; a savanna
// green in its wet summer and golden in its dry winter, a Mediterranean coast green in its wet winter).
//
//   · the families blend across their edges (each one's share of the land within ~RAMP_BLEND_KM), the edges warped by
//     fractal noise so they interlock rather than fade in a band; an ice sheet keeps its own sharp edge;
//   · a place takes its own season's colours by its latitude — summer in July north of the equator, in January south of
//     it — blending into the even mean of the two toward the equator (full from SEASON_FULL_DEG), so nothing flips at a
//     line; the year: the even mean;
//   · the realistic picture's fine detail (rock, mottling, the relief's texture) is kept: its brightness against its own
//     blurred self, laid over the height colours; and its snow, where the climate has snow in the season shown;
//   · the rivers and the fresh lakes green their banks (RIPARIAN: a tight ribbon, the place's own colour deepened, patchy along
//     the course) by how dry the climate and the season are (none under snow);
//   · cold dry climates (a polar desert) take the tundra's colours, not sand's;
//   · and SAT_REALISTIC_SHARE of the realistic picture itself over all, for its texture.
//
// The picture is built once per finished moment and season, at the climate picture's own size, and kept.

import { KOPPEN_CLASSES } from '../climate/koppen.js';
import { statValue } from '../climate/cell-stats.js';
import { FastNoise } from '../core/fast-noise.js';
import { SOFT_FAMILIES } from '../climate/koppen-soft.js';
import { landCover, newCover, coverRgb } from '../finish/finish-cover.js';

/**
 * The land in the colour (plans/V2_SATELLITE_LOOK_PLAN.md P1): the heights decide the colour, not only its light.
 *   · tp*: the topographic position — the height against the land's mean around it, at three sizes (km: each size against
 *     the next smaller one's mean, so each carries only features of its own size), each counted
 *     full at its depth (km) and weighted: + a hollow (a valley, a basin), − a ridge, a spur, a plateau's rim — most weight
 *     on the larger sizes, and the smallest only where the place stands tpGateKm off its surroundings (owner, zoomed out:
 *     "a bit too noisy": every plain's bump flipped the colour);
 *   · hollows richer and darker, ridges paler (linear-light tints, at full); dry country leans the most (lean*: its share,
 *     wet to dry), as water gathers in the hollows and drains off the ridges;
 *   · the sky's light: hollows a little darker, open crests a little lighter (× 1 ∓ skyLight);
 *   · highlands calmer (greyer) than lowlands, from upland*[0] to [1] km, by uplandCalm at most;
 *   · the tree and snow lines bent: a place counts as higher by *Relief × its height above its surroundings (the smallest
 *     size: valleys under the lines longer, spurs above them sooner), *Facing km on a slope facing the pole (less on one
 *     facing the equator), and a wobble of *Noise km at lineNoiseSizeKm; the snow's edge snowEdge × the family's own.
 */
export const SAT_TERRAIN = {
    tpKm: [40, 120, 350], tpDepthKm: [0.11, 0.12, 0.18], tpWeight: [0.27, 0.3, 0.48], tpGateKm: [0.025, 0.1],
    hollowTint: [0.62, 0.8, 0.6], ridgeTint: [1.3, 1.2, 1.05], leanWet: 0.5, leanDry: 1,
    skyLight: 0.3,
    uplandKm: [0.6, 3], uplandCalm: 0.35,
    treeRelief: 1.2, snowRelief: 1.4, treeFacingKm: 0.2, snowFacingKm: 0.35, aspectSlope: [8, 40],
    treeNoiseKm: 0.12, snowNoiseKm: 0.06, lineNoiseSizeKm: 70, snowEdge: 0.45,
};

/** sRGB colours. low: [at the coast, at LOW_KM] per season; tree, snow: [starts, full] km per season; rip: how much the
 *  rivers green the land (its dryness) per season. */
const LOW_KM = 1.0;
export const RAMP_FAMILIES = [
    { name: 'rainforest', codes: ['Af', 'Am'],
        summer: { low: [[36, 98, 40], [62, 108, 52]], tree: [2.6, 3.6], snow: [4.6, 5.4], rip: 0 },
        winter: { low: [[40, 98, 42], [66, 106, 54]], tree: [2.6, 3.6], snow: [4.6, 5.4], rip: 0 } },
    { name: 'savanna', codes: ['Aw', 'As'],
        summer: { low: [[112, 146, 62], [130, 136, 74]], tree: [2.2, 3.2], snow: [4.4, 5.2], rip: 0.3 },
        winter: { low: [[170, 162, 88], [158, 142, 86]], tree: [2.2, 3.2], snow: [4.4, 5.2], rip: 0.8 } },
    { name: 'desert', codes: ['BWh', 'BWk'],
        summer: { low: [[230, 204, 150], [202, 156, 104]], tree: [1.0, 2.2], snow: [4.6, 5.6], rip: 1 },
        winter: { low: [[226, 200, 148], [198, 152, 102]], tree: [1.0, 2.2], snow: [3.6, 4.6], rip: 1 } },
    { name: 'steppe', codes: ['BSh', 'BSk'],
        summer: { low: [[168, 172, 102], [162, 148, 98]], tree: [1.6, 2.6], snow: [4.0, 5.0], rip: 0.8 },
        winter: { low: [[198, 180, 130], [176, 154, 110]], tree: [1.6, 2.6], snow: [3.0, 4.0], rip: 0.6 } },
    { name: 'mediterranean', codes: ['Csa', 'Csb', 'Csc'],
        summer: { low: [[178, 162, 98], [150, 138, 92]], tree: [1.6, 2.6], snow: [3.4, 4.2], rip: 0.8 },
        winter: { low: [[116, 146, 76], [116, 124, 84]], tree: [1.6, 2.6], snow: [2.4, 3.2], rip: 0.3 } },
    { name: 'temperate', codes: ['Cfa', 'Cfb', 'Cfc', 'Cwa', 'Cwb', 'Cwc'],
        summer: { low: [[84, 140, 60], [94, 122, 68]], tree: [1.6, 2.6], snow: [3.0, 3.8], rip: 0.25 },
        winter: { low: [[118, 126, 84], [116, 114, 88]], tree: [1.6, 2.6], snow: [2.0, 2.8], rip: 0.3 } },
    { name: 'continental', codes: ['Dfa', 'Dfb', 'Dwa', 'Dwb', 'Dsa', 'Dsb'],
        summer: { low: [[86, 130, 62], [98, 112, 78]], tree: [1.4, 2.2], snow: [2.6, 3.2], rip: 0.3 },
        winter: { low: [[128, 122, 100], [130, 124, 108]], tree: [1.2, 2.0], snow: [1.4, 2.0], rip: 0 } },
    { name: 'taiga', codes: ['Dfc', 'Dfd', 'Dwc', 'Dwd', 'Dsc', 'Dsd'],
        summer: { low: [[56, 96, 62], [80, 100, 80]], tree: [1.0, 1.8], snow: [2.0, 2.6], rip: 0.15 },
        winter: { low: [[74, 92, 80], [96, 104, 96]], tree: [0.8, 1.4], snow: [1.0, 1.6], rip: 0 } },
    { name: 'tundra', codes: ['ET'],
        summer: { low: [[108, 130, 90], [132, 138, 116]], tree: [0.5, 1.2], snow: [1.2, 1.8], rip: 0.2 },
        winter: { low: [[160, 166, 150], [186, 190, 180]], tree: [0.4, 1.0], snow: [0.4, 1.0], rip: 0 } },
    { name: 'ice', codes: ['EF'],
        summer: { low: [[226, 232, 240], [238, 242, 248]], tree: [9, 9.5], snow: [9, 9.5], rip: 0 },
        winter: { low: [[232, 236, 244], [242, 245, 250]], tree: [9, 9.5], snow: [9, 9.5], rip: 0 } },
];
/** The mountains' rock: dark grey with a little red at the tree line, grey higher up; a share of the biome's colour under
 *  it; the snow. */
export const ROCK_LOW = [84, 74, 72], ROCK_HIGH = [134, 130, 128], BIOME_UNDER_ROCK = 0.25, SNOW = [244, 244, 248];
export const RAMP_BLEND_KM = 60, SEASON_FULL_DEG = 25, WARP_KM = 70, WARP_FEATURE_KM = 400;
export const DETAIL_KM = 30, DETAIL_STRENGTH = 0.85;
/** The realistic picture's share of the styled one (its texture), and the relief shading's strength on it. */
export const SAT_REALISTIC_SHARE = 0.25, SAT_SHADE = 1.15;
/** A cold dry climate looks like tundra, not sand: its share goes to the tundra's colours as its warmest month falls from
 *  COLD_DRY_C[0] to [1] (≈ the year's mean + half its range), or its year from COLD_DRY_YEAR_C[0] to [1]. */
export const COLD_DRY_C = [13, 8], COLD_DRY_YEAR_C = [1, -6];

const NF = RAMP_FAMILIES.length;
const familyOfClass = KOPPEN_CLASSES.map(k => RAMP_FAMILIES.findIndex(f => f.codes.includes(k.code)));
const fam = (n) => RAMP_FAMILIES.findIndex(f => f.name === n);
const TUNDRA = fam('tundra'), ICE = fam('ice'), DRY = new Set([fam('desert'), fam('steppe')]);

/**
 * The climates' mosaic (plans/V2_SATELLITE_LOOK_PLAN.md P2): where the climate's own shares (the finish's, koppen-soft.js)
 * hold more than one family, each pixel's lowland colour is one or another by a patchy noise — a patchwork whose pieces
 * thin out across the zone, not two colours averaged into a muddy band. The families take turns along one noise (u,
 * 0 … 1), wet to dry (MOIST_ORDER), each the stretch of it its share is: its pieces cover about its share of the ground.
 * The noise sizeKm across (octaves of it), warped by up to about warpKm at warpSizeKm (only while it is the strong layer, its
 * `blend` under a half); the ground leans it — hollows and
 * slopes facing the pole to the wetter families, ridges to the drier (lean, in the noise's standard deviations: forest
 * up the valleys into the grassland, the desert along the ridges); the pieces' edges soft over `edge` of u; and `blend`
 * of the plain average kept, so a piece carries a little of its neighbours. Shares under minShare are left out.
 */
export const SAT_MOSAIC = { sizeKm: 90, octaves: 3, warpKm: 70, warpSizeKm: 450, lean: 2, edge: 0.1, blend: 0.7, minShare: 0.05 };

/**
 * The climates' shares blended before they are drawn (owner, 2026-11-01: P2's first cut "way too sharp … it should blend
 * way way more smoothly … combined with some blending (or maybe also some like 'similarity aware blending' over longer
 * distances) and then layered onto one another"), in layers:
 *   · short: every family's share blurred over about ±shortKm — a smooth handover everywhere;
 *   · long: and over about ±longKm (a Gaussian of half that) between climates that look alike — a blur guided by each
 *     place's lowland colour, a neighbour counting by exp(−Δ² / 2 similarity²) of their colours' difference (sRGB 0…1):
 *     temperate into continental into taiga, steppe into desert, run together far; desert and rainforest keep the short
 *     handover — on a grid a quarter as fine (it is broad), laid over the short blend at `longShare`;
 *   · then the mosaic (SAT_MOSAIC) laid over the blend at 1 − its `blend`, its edges soft.
 */
export const SAT_BLEND = { shortKm: 100, longKm: 500, similarity: 0.16, longShare: 0.45 };

/**
 * The baseline colour "cube" (owner, 2026-11-01: "a simple blended baseline color 'cube' colored by rain, temperature and
 * maybe slope/height that can just be another color layer that helps blend everything together"; P8): a colour for every
 * year's mean temperature (°C, `t`) and rain (mm a year, `p`, read on a log scale) — a Whittaker chart of the ground from
 * space: sand where it is hot and dry, khaki, olive, green to the rainforest's deep green where it is hot and wet, grey
 * barrens and tundra where it is cold — summer's colours (`summer`, rows by t, columns by p, sRGB), their winter the
 * same gone `dormant` where the year is cool (all of `dormantShare` at dormantC[1] °C, none at [0]); toward bare `rock`
 * with height and slope (by rockHeightKm, rockSlope m/km, at most rockMax). Laid over the climates' own colours at
 * `share` (in linear light), under the terrain and the ground's detail: no classes, so it follows the climate smoothly
 * and carries its rain and warmth inside every class. Its colours run from that stylised chart (`realism` 0) to the
 * realistic ones of the land's cover model (1 — Blue Marble's duller, darker ground: realCubeTables) — so `share` is
 * how far the whole view leans from the stylised toward the realistic.
 */
export const SAT_CUBE = {
    on: true, share: 0.6,
    t: [-15, -5, 5, 15, 25], p: [100, 300, 700, 1500, 3000],
    summer: [
        [[176, 175, 168], [150, 155, 140], [130, 140, 125], [120, 132, 120], [120, 132, 122]],     // −15 °C: polar barrens, tundra
        [[150, 148, 132], [112, 122, 96], [72, 100, 68], [58, 90, 64], [60, 92, 70]],              // −5: cold barrens, taiga
        [[172, 160, 134], [150, 150, 108], [102, 126, 72], [66, 106, 62], [56, 96, 60]],           // 5: cold desert, steppe, mixed forest
        [[206, 182, 136], [178, 166, 110], [126, 142, 72], [78, 122, 58], [52, 100, 52]],          // 15: desert, steppe, grassland, forest
        [[224, 198, 150], [198, 174, 112], [150, 150, 80], [84, 124, 52], [36, 92, 38]],           // 25: sand, savanna, rainforest
    ],
    dormant: [128, 118, 96], dormantC: [14, -2], dormantShare: 0.55,
    rock: [128, 118, 108], rockHeightKm: [1.8, 3.8], rockSlope: [40, 160], rockMax: 0.6,
    // (the realistic cube: realCubeTables)
    realism: 1, realT: [-25, -18, -11, -4, 3, 10, 17, 24, 31], realP: [30, 80, 200, 450, 900, 1600, 2800, 4500], realSwingC: [2, 22],
};
/**
 * The realistic cube (owner: "closer to the 'dull colors' that are more realistic as well as a way to nicely blend or
 * hybridize with this stylized version"): the colours the land's cover model gives (finish-cover.js — fitted to NASA's
 * Blue Marble, the realistic picture's own) for a year at each mean temperature (`realT`, °C) and rain (`realP`, mm) —
 * a smooth year, its seasons' swing `realSwingC` (°C: [the tropics', the cold's], warmest month − the year's mean) and
 * its rain a little the more in summer — its ground without snow (the snow is the climate's and the heights' own) — for
 * the year, January (winter) and July (summer); linear light, flat [t][p][rgb],
 * once (its settings: SAT_CUBE). The cube's own colours run from the stylised chart (realism 0) to these (1).
 */
let realCube = null, realCubeKey = '';
function realCubeTables(C) {
    const key = JSON.stringify([C.realT, C.realP, C.realSwingC]);
    if (realCube && realCubeKey === key) return realCube;
    const nt = C.realT.length, np = C.realP.length, out = [0, 1, 2].map(() => new Float32Array(nt * np * 3));
    const cv = newCover(), T = new Float64Array(12), P = new Float64Array(12), rgb = [0, 0, 0];
    for (let a = 0; a < nt; a++) for (let b = 0; b < np; b++) {
        const t = C.realT[a], swing = C.realSwingC[0] + (C.realSwingC[1] - C.realSwingC[0]) * sm(24, -6, t);
        for (let m = 0; m < 12; m++) { const s = -Math.cos(2 * Math.PI * m / 12); T[m] = t + swing * s; P[m] = C.realP[b] / 12 * (1 + 0.3 * s); }
        landCover(T, P, cv, undefined, undefined, 45);
        // (its ground without snow: the snow is the climate's own and the heights', never a blend's)
        cv.snow.fill(0);
        for (let v = 0; v < 3; v++) { coverRgb(cv, v, rgb, 0); const o = (a * np + b) * 3; for (let c = 0; c < 3; c++) out[v][o + c] = LIN[rgb[c]]; }
    }
    realCube = out; realCubeKey = key;
    return out;
}

/** The cube's colours in linear light, per season (0 summer, 1 winter), flat [t][p][rgb] — from SAT_CUBE, per call. */
function cubeTables(C) {
    const nt = C.t.length, np = C.p.length, out = [new Float32Array(nt * np * 3), new Float32Array(nt * np * 3)], dm = linOf(C.dormant);
    for (let a = 0; a < nt; a++) for (let b = 0; b < np; b++) {
        const s = linOf(C.summer[a][b]), d = C.dormantShare * sm(C.dormantC[0], C.dormantC[1], C.t[a]), o = (a * np + b) * 3;
        for (let c = 0; c < 3; c++) { out[0][o + c] = s[c]; out[1][o + c] = s[c] + (dm[c] - s[c]) * d; }
    }
    return out;
}
/** A cube's colour at temperature t (°C) and rain lp (the log of mm) in a season's table on axes ts (°C) × lps (logs of
 *  mm), into o. */
function cubeAt(ts, lps, T, t, lp, o) {
    const nt = ts.length, np = lps.length;
    let a = 0; while (a < nt - 2 && t > ts[a + 1]) a++;
    let b = 0; while (b < np - 2 && lp > lps[b + 1]) b++;
    const fa = Math.max(0, Math.min(1, (t - ts[a]) / (ts[a + 1] - ts[a]))), fb = Math.max(0, Math.min(1, (lp - lps[b]) / (lps[b + 1] - lps[b])));
    const i00 = (a * np + b) * 3, i01 = i00 + 3, i10 = i00 + np * 3, i11 = i10 + 3;
    for (let c = 0; c < 3; c++) o[c] = (1 - fa) * ((1 - fb) * T[i00 + c] + fb * T[i01 + c]) + fa * ((1 - fb) * T[i10 + c] + fb * T[i11 + c]);
    return o;
}
const MOIST_ORDER = ['rainforest', 'temperate', 'taiga', 'continental', 'savanna', 'mediterranean', 'tundra', 'steppe', 'desert'].map(fam);

/**
 * The ground's character (plans/V2_SATELLITE_LOOK_PLAN.md P4), from the world's own data, each part with its own switch:
 *   · rocks: bare ground — deserts, steppes, tundra, the rock above the tree line — tinted by its bedrock (the geology's
 *     rocks: dark lava fields and trap, red sandstone, pale limestone, white salt, grey shale, pink-grey granite…), by
 *     linear-light tints (geology/rocks.js's Rock order), `share` of each at full bareness;
 *   · dunes: the finish's sand seas (the detail's drivers: erg) warmer and paler (`tint`), streaked by the year's wind
 *     (wind; duneMode: dunes across the wind where the seasons' winds agree, along it where they cross) — stripes
 *     spacingKm apart, broken every lengthKm or so, ± contrast, wavering by warpKm;
 *   · bands: the fold belts' grain (fold, foldDir) as bands of rock along the strike, spacingKm apart, ± contrast, most on
 *     bare ground (`veiled` of it under plants);
 *   · cover: the plants' own patches — denser canopy and openings (glades, grass, old burns) — sizeKm across, the denser
 *     in the hollows (lean), × dark or × light at full (`edge`: how soft), `strength` of it in a forest, its strength
 *     varying by region (± regional, at regionKm) — the realistic picture under it brings the finer mottle;
 *   · ice: an ice sheet's margins (by slope, m/km, or low ground, km) bluer, streaked along its flow downhill (streaks
 *     streakKm across × along, ± streak), its outlet glaciers (the hollows at its margin) darker blue-grey.
 * Stripes narrower than four of the picture's pixels fade out rather than alias.
 */
export const SAT_GROUND = {
    rocks: { on: true, share: 0.55, tint: [[1, 1, 1], [1.06, 1.02, 0.95], [1.3, 0.92, 0.7], [0.82, 0.82, 0.84], [1.25, 1.24, 1.18], [1.6, 1.8, 2.1],
        [0.5, 0.48, 0.47], [0.66, 0.6, 0.62], [1.15, 1.02, 0.96], [0.68, 0.7, 0.76], [0.86, 0.84, 0.84], [1.05, 0.96, 0.88], [0.66, 0.74, 0.62], [0.55, 0.58, 0.47]] },
    dunes: { on: true, tint: [1.18, 1.06, 0.82], spacingKm: 45, lengthKm: 180, contrast: 0.22, warpKm: 18 },
    bands: { on: true, spacingKm: 42, contrast: 0.25, warpKm: 12, veiled: 0.45 },
    cover: { on: true, sizeKm: 75, lean: 1.2, dark: [0.84, 0.88, 0.84], light: [1.12, 1.1, 1.0], edge: 0.18, strength: 0.7, regional: 0.4, regionKm: 500 },
    ice: { on: true, blue: [0.82, 0.91, 1.0], marginSlope: [4, 25], marginKm: [1.4, 0.3], streakKm: [16, 110], streak: 0.08, outlet: [0.72, 0.82, 0.92] },
};
/** How bare each family's ground is (its open, unvegetated share — for the rocks and the bands), by the mosaic's weights. */
const BARE = new Float32Array(NF);
for (const [n, v] of [['desert', 1], ['steppe', 0.6], ['tundra', 0.45], ['mediterranean', 0.3], ['savanna', 0.2], ['continental', 0.05], ['temperate', 0.05]]) BARE[fam(n)] = v;
/** How much of each family's ground is plants with a canopy to patch (cover). */
const CANOPY = new Float32Array(NF);
for (const [n, v] of [['rainforest', 1], ['temperate', 0.9], ['continental', 0.9], ['taiga', 1], ['savanna', 0.7], ['mediterranean', 0.5], ['steppe', 0.35], ['tundra', 0.3]]) CANOPY[fam(n)] = v;
let groundNoise = null;

/**
 * The large-scale features (owner, zoomed out: "a bit too noisy … there being little long range/high scale noise/features
 * outside of climate and mountain ranges"; plans/V2_SATELLITE_LOOK_PLAN.md P6) — from the world's own data, broad, each
 * with its own switch; laid on before the terrain's own colour (P1), on a grid of ~0.35°:
 *   · provinces: the bedrock's colour (SAT_GROUND.rocks.tint) averaged over ±km — old shields, sedimentary basins,
 *     volcanic provinces as regions — `strength` of it on bare ground, `veiled` of that under plants;
 *   · basins: the land's lowland basins and high plateaus at continental size — the land's mean height over ±km against
 *     its mean over the terrain's middle size (SAT_TERRAIN.tpKm[1]), full at depthKm — basins × `basin`, plateaus × `upland`;
 *   · floods: belts along the great rivers (minQ m³/s or more) on low ground (lowKm: all at [1], none at [0]) — halfKm[0]
 *     → [1] to each side, a great river → the greatest (maxQ) — × tint at `strength`: floodplain forest and wetland;
 *   · glacial: where the ice age's glaciers scoured the land (the detail's drivers: ice, scour), over ±km — paler (× tint)
 *     and calmer (its colour `calm` toward grey) at `strength`.
 */
export const SAT_MACRO = {
    provinces: { on: true, km: 220, strength: 1.2, veiled: 0.35 },
    basins: { on: true, km: 900, depthKm: 0.45, basin: [0.8, 0.9, 0.78], upland: [1.18, 1.1, 1.0] },
    floods: { on: true, minQ: 1500, maxQ: 40000, halfKm: [22, 75], lowKm: [0.6, 0.2], tint: [0.78, 0.88, 0.76], strength: 1.2 },
    glacial: { on: true, km: 70, tint: [1.06, 1.05, 1.05], calm: 0.25, strength: 1.2 },
};
let mosaicNoise = null;
/** The mosaic's weights (mw, per family) at a place (unit sphere px, py, pz) from the smooth shares sw (summing to 1);
 *  `wet`: how much the ground gathers water (+ a hollow or a slope facing the pole, − a ridge). Off: the shares. */
function mosaicWeights(sw, mw, on, px, py, pz, wet) {
    const M = SAT_MOSAIC;
    let nc = 0, ct = 0;
    if (on) for (const g of MOIST_ORDER) if (sw[g] > M.minShare) { nc++; ct += sw[g]; }
    if (nc < 2) { for (let g = 0; g < NF; g++) mw[g] = sw[g]; return; }
    mosaicNoise ??= new FastNoise(6173);
    // (warped where it is a strong layer; a faint one — the blend's texture — needs no warp)
    const f0 = 6371 / M.sizeKm;
    let qx = px, qy = py, qz = pz;
    if (M.warpKm > 0 && M.blend < 0.5) {
        const fw = 6371 / M.warpSizeKm, wk = M.warpKm / 6371 / 0.3;
        qx += wk * mosaicNoise.noise3D(fw * px + 3.1, fw * py - 7.7, fw * pz + 1.3); qy += wk * mosaicNoise.noise3D(fw * px - 5.9, fw * py + 2.4, fw * pz - 8.2); qz += wk * mosaicNoise.noise3D(fw * px + 9.6, fw * py + 6.1, fw * pz - 3.3);
    }
    const n = mosaicNoise.fbm(f0 * qx, f0 * qy, f0 * qz, M.octaves, 0.5) / 0.3;
    const u = 1 / (1 + Math.exp(-1.702 * (n - M.lean * Math.max(-1.5, Math.min(1.5, wet)))));
    mw.fill(0);
    let cum = 0, k = 0, msum = 0;
    for (const g of MOIST_ORDER) {
        if (!(sw[g] > M.minShare)) continue;
        const lo = cum, hi = cum + sw[g] / ct;
        const a = k === 0 ? 1 : sm(lo - M.edge, lo + M.edge, u), b = k === nc - 1 ? 1 : 1 - sm(hi - M.edge, hi + M.edge, u);
        mw[g] = a * b; msum += mw[g]; cum = hi; k++;
    }
    for (let g = 0; g < NF; g++) mw[g] = (1 - M.blend) * (msum > 0 ? mw[g] / msum : sw[g]) + M.blend * sw[g];
}

// linear light ↔ sRGB, by tables
const LIN = Float32Array.from({ length: 256 }, (_, v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
const SRGB_N = 4096, SRGB = Float32Array.from({ length: SRGB_N + 1 }, (_, k) => { const l = k / SRGB_N, c = l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055; return 255 * c; });
export const toLin = (v) => LIN[v | 0];
export const toSrgb = (l) => SRGB[Math.max(0, Math.min(SRGB_N, Math.round(l * SRGB_N)))];
const linOf = (rgb) => rgb.map(v => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
const sm = (a, b, x) => { if (a === b) return x < a ? 0 : 1; const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };   // (a step where the ends meet)

// each family's two seasons as tables in linear light, every STEP_KM up to TOP_KM: [family][0 summer, 1 winter] — the
// whole colour (TABLE: Generate and Import's), and apart, for Evolution: the lowland colour by height (BIOME), the rock's
// share (RT) and its own colour (ROCKP), and the snow's share (SNOWS, its edge SAT_TERRAIN.snowEdge × the family's own) —
// so the lines follow the height and the climate's smooth shares while the climates' mosaic (P2) decides only the
// lowland colour (owner: "height generated snow/ice should track the mountaintops closely")
const STEP_KM = 0.025, TOP_KM = 7, NS = Math.round(TOP_KM / STEP_KM) + 1;
const TABLE = new Float32Array(NF * 2 * NS * 3), RIP = new Float32Array(NF * 2);
const BIOME = new Float32Array(NF * 2 * NS * 3), ROCKP = new Float32Array(NF * 2 * NS * 3), RT = new Float32Array(NF * 2 * NS), SNOWS = new Float32Array(NF * 2 * NS);
{
    const rL = linOf(ROCK_LOW), rH = linOf(ROCK_HIGH), sn = linOf(SNOW);
    RAMP_FAMILIES.forEach((f, g) => [f.summer, f.winter].forEach((P, q) => {
        RIP[g * 2 + q] = P.rip;
        const c0 = linOf(P.low[0]), c1 = linOf(P.low[1]);
        const mid = 0.5 * (P.snow[0] + P.snow[1]), half = 0.5 * (P.snow[1] - P.snow[0]) * SAT_TERRAIN.snowEdge;
        for (let s = 0; s < NS; s++) {
            const km = s * STEP_KM, o = ((g * 2 + q) * NS + s) * 3;
            const tl = sm(0, LOW_KM, km), dark = 1 - 0.12 * sm(LOW_KM, P.tree[0], km);
            const rt = sm(P.tree[0], P.tree[1], km), rh = sm(P.tree[0], P.snow[0], km), st = sm(P.snow[0], P.snow[1], km);
            SNOWS[(g * 2 + q) * NS + s] = sm(mid - half, mid + half, km);
            RT[(g * 2 + q) * NS + s] = rt;
            for (let c = 0; c < 3; c++) {
                const base = (c0[c] + (c1[c] - c0[c]) * tl) * dark, pure = rL[c] + (rH[c] - rL[c]) * rh;
                const rock = pure * (1 - BIOME_UNDER_ROCK) + base * BIOME_UNDER_ROCK;
                const v = base + (rock - base) * rt;
                BIOME[o + c] = base; ROCKP[o + c] = pure;
                TABLE[o + c] = v + (sn[c] - v) * st;
            }
        }
    }));
}

/** How much of its summer a place at `latDeg` is in, for the view `season` ('year', 'jan', 'jul'): 0.5 at the equator and
 *  in the year's view, to 1 (summer) or 0 (winter) from SEASON_FULL_DEG — smooth, flat through the equator. */
export function summerShare(latDeg, season) {
    if (season === 'year') return 0.5;
    const x = Math.min(1, Math.abs(latDeg) / SEASON_FULL_DEG), s = Math.sign(latDeg) * x * x * (3 - 2 * x);
    return 0.5 + 0.5 * (season === 'jul' ? s : -s);
}

// ── value noise, 2-D, wrapping east–west: fractal (fbm) ──
function hash(i, j) { let h = (i * 374761393 + j * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y, period) {
    const i0 = Math.floor(x), j0 = Math.floor(y), fx = x - i0, fy = y - j0, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const a = ((i0 % period) + period) % period, b = (a + 1) % period;
    const v00 = hash(a, j0), v10 = hash(b, j0), v01 = hash(a, j0 + 1), v11 = hash(b, j0 + 1);
    return v00 + (v10 - v00) * ux + (v01 - v00) * uy + (v00 - v10 - v01 + v11) * ux * uy;
}
function fbm(x, y, period, oct = 4) { let s = 0, a = 0.5, t = 0; for (let o = 0; o < oct; o++, a *= 0.5) { const k = 2 ** o; s += a * vnoise(x * k, y * k, period * k); t += a; } return s / t; }

/** Box-blur a w × h field in place (rows wrap; columns clamp), radius r cells, `passes` times. */
function boxBlur(a, w, h, r, passes = 2) {
    if (r < 1) return;
    if (r >= w) { boxBlurWide(a, w, h, r, passes); return; }
    const tmp = new Float32Array(w), R = r + 1, ring = new Float32Array(R * w), S = new Float64Array(w);
    for (let p = 0; p < passes; p++) {
        for (let y = 0; y < h; y++) {
            const o = y * w; let s = 0;
            for (let d = -r; d <= r; d++) s += a[o + ((d % w) + w) % w];
            for (let x = 0; x < w; x++) {
                tmp[x] = s / (2 * r + 1);
                let inn = x + r + 1; if (inn >= w) inn -= w;
                let out = x - r; if (out < 0) out += w;
                s += a[o + inn] - a[o + out];
            }
            for (let x = 0; x < w; x++) a[o + x] = tmp[x];
        }
        // (the columns' running sums side by side, a row at a time — memory in order — each row's values kept in a ring
        // until the window leaves them: the same sums, in the same order, as column by column)
        S.fill(0);
        let n = 0;
        for (let d = 0; d <= r && d < h; d++) { const o = d * w; for (let x = 0; x < w; x++) S[x] += a[o + x]; n++; }
        for (let y = 0; y < h; y++) {
            const o = y * w, add = y + r + 1, rem = y - r, ra = add * w, rr = (((rem % R) + R) % R) * w, rs = (y % R) * w, n0 = n;
            for (let x = 0; x < w; x++) {
                const s = S[x];
                let t = s;
                if (add < h) t += a[ra + x];
                if (rem >= 0) t -= ring[rr + x];
                S[x] = t;
                ring[rs + x] = a[o + x];
                a[o + x] = s / n0;
            }
            if (add < h) n++;
            if (rem >= 0) n--;
        }
    }
}
/** boxBlur for a radius as wide as the rows (the rows' sums wrap more than once): as it was written first. */
function boxBlurWide(a, w, h, r, passes) {
    const tmp = new Float32Array(Math.max(w, h));
    for (let p = 0; p < passes; p++) {
        for (let y = 0; y < h; y++) {
            const o = y * w; let s = 0;
            for (let d = -r; d <= r; d++) s += a[o + ((d % w) + w) % w];
            for (let x = 0; x < w; x++) { tmp[x] = s / (2 * r + 1); s += a[o + (x + r + 1) % w] - a[o + ((x - r) % w + w) % w]; }
            for (let x = 0; x < w; x++) a[o + x] = tmp[x];
        }
        for (let x = 0; x < w; x++) {
            let s = 0, n = 0;
            for (let d = 0; d <= r && d < h; d++) { s += a[d * w + x]; n++; }
            for (let y = 0; y < h; y++) {
                tmp[y] = s / n;
                const add = y + r + 1, rem = y - r;
                if (add < h) { s += a[add * w + x]; n++; }
                if (rem >= 0) { s -= a[rem * w + x]; n--; }
            }
            for (let y = 0; y < h; y++) a[y * w + x] = tmp[y];
        }
    }
}

/** Each family's lowland colour as the long blend compares them (its coast colour, summer and winter evened; sRGB 0…1). */
const BLEND_REF = RAMP_FAMILIES.map(f => [0, 1, 2].map(c => (f.summer.low[0][c] + f.winter.low[0][c]) / 510));
/**
 * The shares on their grid (gw × gh, family g's at share[g · gw · gh + cell]) blended in place by SAT_BLEND: every family
 * over ±shortKm, then the similarity-guided long blend laid over it (see SAT_BLEND); each cell's shares summing to 1
 * where it has any (the ice sheets' family left out, as everywhere in the shares).
 */
function blendShares(share, gw, gh) {
    const B = SAT_BLEND, N = gw * gh, pxKm = 2 * Math.PI * 6371 / gw;
    const norm = (a, n) => { for (let c = 0; c < n; c++) { let t = 0; for (let g = 0; g < NF; g++) t += a[g * n + c]; if (t > 1e-6) for (let g = 0; g < NF; g++) a[g * n + c] /= t; } };
    if (B.shortKm > 0) for (let g = 0; g < NF; g++) if (g !== ICE) latBlur(share.subarray(g * N, (g + 1) * N), gw, gh, B.shortKm, pxKm, 2);
    norm(share, N);
    if (!(B.longShare > 0 && B.longKm > 0)) return;
    // (the long blend on a grid q times coarser: its cells' shares, and the lowland colour they stand for)
    const q = 4, cw = Math.max(4, (gw / q) | 0), ch = Math.max(2, (gh / q) | 0), M = cw * ch, cpx = 2 * Math.PI * 6371 / cw;
    const cs = new Float32Array(NF * M), guide = new Float32Array(3 * M), has = new Uint8Array(M);
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
        const c = Math.min(ch - 1, (y * ch / gh) | 0) * cw + Math.min(cw - 1, (x * cw / gw) | 0), i = y * gw + x;
        for (let g = 0; g < NF; g++) cs[g * M + c] += share[g * N + i];
    }
    norm(cs, M);
    for (let c = 0; c < M; c++) {
        let t = 0;
        for (let g = 0; g < NF; g++) { const s = cs[g * M + c]; if (!(s > 0)) continue; t += s; for (let k = 0; k < 3; k++) guide[3 * c + k] += s * BLEND_REF[g][k]; }
        has[c] = t > 1e-6 ? 1 : 0;
    }
    // (rows, then columns: a Gaussian of half longKm, each neighbour by how alike its colour is to the cell's own)
    const k2 = 1 / (2 * B.similarity * B.similarity), pass = (src, dst, rows) => {
        const lines = rows ? ch : cw, len = rows ? cw : ch, acc = new Float64Array(NF);
        for (let l = 0; l < lines; l++) {
            const cl = rows ? Math.max(0.15, Math.cos((0.5 - (l + 0.5) / ch) * Math.PI)) : 1, sig = (B.longKm / 2) / (cpx * cl), r = Math.min(len >> 2, Math.max(1, Math.ceil(2 * sig)));
            for (let p = 0; p < len; p++) {
                const c = rows ? l * cw + p : p * cw + l;
                if (!has[c]) continue;
                acc.fill(0);
                let wsum = 0;
                for (let d = -r; d <= r; d++) {
                    let pp = p + d;
                    if (rows) pp = ((pp % len) + len) % len; else if (pp < 0 || pp >= len) continue;
                    const c2 = rows ? l * cw + pp : pp * cw + l;
                    if (!has[c2]) continue;
                    const dr = guide[3 * c2] - guide[3 * c], dg = guide[3 * c2 + 1] - guide[3 * c + 1], db = guide[3 * c2 + 2] - guide[3 * c + 2];
                    const wt = Math.exp(-(d * d) / (2 * sig * sig) - (dr * dr + dg * dg + db * db) * k2);
                    wsum += wt;
                    for (let g = 0; g < NF; g++) acc[g] += wt * src[g * M + c2];
                }
                for (let g = 0; g < NF; g++) dst[g * M + c] = acc[g] / wsum;
            }
        }
    };
    const tmp = new Float32Array(NF * M), long = new Float32Array(NF * M);
    pass(cs, tmp, true); pass(tmp, long, false);
    // (laid over the short blend: read back at each cell of the fine grid, bilinear over the coarse cells with land)
    const L = B.longShare, sv = new Float64Array(NF), cc = new Int32Array(4), ww = new Float64Array(4);
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
        const i = y * gw + x;
        let t0 = 0;
        for (let g = 0; g < NF; g++) t0 += share[g * N + i];
        if (!(t0 > 1e-6)) continue;
        const X = (x + 0.5) * cw / gw - 0.5, Yc = Math.max(0, Math.min(ch - 1, (y + 0.5) * ch / gh - 0.5)), x0 = Math.floor(X), y0 = Math.floor(Yc), fx = X - x0, fy = Yc - y0;
        const i0 = ((x0 % cw) + cw) % cw, i1 = i0 + 1 === cw ? 0 : i0 + 1, r0 = y0 * cw, r1 = Math.min(ch - 1, y0 + 1) * cw;
        cc[0] = r0 + i0; cc[1] = r0 + i1; cc[2] = r1 + i0; cc[3] = r1 + i1; ww[0] = (1 - fx) * (1 - fy); ww[1] = fx * (1 - fy); ww[2] = (1 - fx) * fy; ww[3] = fx * fy;
        sv.fill(0);
        let wt = 0;
        for (let j = 0; j < 4; j++) { if (!has[cc[j]]) continue; wt += ww[j]; for (let g = 0; g < NF; g++) sv[g] += ww[j] * long[g * M + cc[j]]; }
        if (!(wt > 1e-6)) continue;
        for (let g = 0; g < NF; g++) share[g * N + i] = (1 - L) * share[g * N + i] + L * sv[g] / wt;
    }
}

/** How cold a dry place is for its colours (0 … 1: then the tundra's, not sand's) — COLD_DRY_*. */
function coldDryAt(R, i, tr) {
    const tA = R.tAnnual[i] / 100, range = tr ? statValue(tr, 'tRange', i) : NaN, warmest = tA + (range === range ? range / 2 : 8);
    return sm(0, 1, Math.max((COLD_DRY_C[0] - warmest) / (COLD_DRY_C[0] - COLD_DRY_C[1]), (COLD_DRY_YEAR_C[0] - tA) / (COLD_DRY_YEAR_C[0] - COLD_DRY_YEAR_C[1])));
}

/**
 * Each family's share of the land around every pixel, on a grid ≤ 1024 wide, cached per climate picture: the climate's
 * own shares where the finish worked them out (R.families, climate/koppen-soft.js — P2: transitions by the climate's
 * gradients; `fuzzy`), else each pixel's class counted and blurred over RAMP_BLEND_KM (moments detailed before P2).
 */
const shareCache = new WeakMap();
function sharesOf(R) {
    let S = shareCache.get(R);
    if (S) return S;
    const tr = R.stats?.tRange;
    if (R.families) {
        // (the finish's grid of shares, its families by name; a dry share as cold as the tundra's given to it; the ice
        // sheets' share left out — an ice sheet keeps its own edge)
        const F = R.families, gw = F.w, gh = F.h, N = gw * gh, f = R.w / gw, share = new Float32Array(NF * N);
        const map = SOFT_FAMILIES.map(n => fam(n));
        for (let k = 0; k < F.n; k++) { const g = map[k]; if (g < 0 || g === ICE) continue; for (let c = 0; c < N; c++) share[g * N + c] += F.data[k * N + c] / 255; }
        const coldSum = new Float32Array(N), landN = new Float32Array(N);
        for (let y = 0; y < R.h; y++) for (let x = 0; x < R.w; x++) {
            const i = y * R.w + x; if (!R.koppen[i]) continue;
            const c = Math.min(gh - 1, (y / f) | 0) * gw + Math.min(gw - 1, (x / f) | 0);
            coldSum[c] += coldDryAt(R, i, tr); landN[c]++;
        }
        for (let c = 0; c < N; c++) {
            if (!(landN[c] > 0)) continue;
            const cold = coldSum[c] / landN[c];
            if (!(cold > 0)) continue;
            for (const g of DRY) { const v = share[g * N + c] * cold; share[g * N + c] -= v; share[TUNDRA * N + c] += v; }
        }
        blendShares(share, gw, gh);
        S = { f, gw, gh, N, share, pxKm: 2 * Math.PI * 6371 / gw, fuzzy: true };
        shareCache.set(R, S);
        return S;
    }
    const f = Math.max(1, Math.round(R.w / 1024)), gw = Math.ceil(R.w / f), gh = Math.ceil(R.h / f), N = gw * gh;
    const share = new Float32Array(NF * N);
    for (let y = 0; y < R.h; y++) for (let x = 0; x < R.w; x++) {
        const i = y * R.w + x, k = R.koppen[i]; if (!k) continue;
        const g = familyOfClass[k]; if (g < 0 || g === ICE) continue;
        const c = ((y / f) | 0) * gw + ((x / f) | 0);
        const cold = DRY.has(g) ? coldDryAt(R, i, tr) : 0;
        share[g * N + c] += 1 - cold;
        if (cold > 0) share[TUNDRA * N + c] += cold;
    }
    const pxKm = 2 * Math.PI * 6371 / gw, r = Math.max(1, Math.round(RAMP_BLEND_KM / pxKm / 2));
    for (let g = 0; g < NF; g++) if (g !== ICE) boxBlur(share.subarray(g * N, (g + 1) * N), gw, gh, r);
    S = { f, gw, gh, N, share, pxKm, fuzzy: false };
    shareCache.set(R, S);
    return S;
}

/**
 * The green banks (owner, 2026-11-01: the old glow "a little too heavy handed and samey … can be tightened up … should
 * probably extend to around freshwater lakes too"): how much of each pixel of the climate picture is riverside or a fresh
 * lake's shore, 0…1, cached per picture. Each river carrying RIPARIAN.minQ m³/s or more is a soft ribbon (a bell, all at its
 * middle, none at its reach) RIPARIAN.halfKm[0] → [1] km to each side, small → great river, its strength RIPARIAN.strength[0] →
 * [1]; wider on low ground (× 1 + RIPARIAN.lowWiden under RIPARIAN.lowKm: floodplains, deltas); a ribbon narrower than a pixel
 * stamped fainter. A fresh lake (the finished picture's `water` 1) a shore RIPARIAN.lakeKm wide. The colour is laid on in the
 * styling, patchy along the course.
 */
export const RIPARIAN = { minQ: 15, halfKm: [3.5, 9], strength: [0.5, 1], lowWiden: 0.6, lowKm: [0.6, 0.15], lakeKm: 7, lakeStrength: 0.75,
    // (the green: the place's own colour × tint^share — darker and greener, its own hue deepened, not one green for all —
    // patchy along the course: × 1 ± patch per standard deviation of a noise at patchKm, within patchClamp)
    tint: [0.34, 0.58, 0.28], patchKm: 55, patch: 0.4, patchClamp: [0.2, 1.15] };
const ripCache = new WeakMap();
function riversideOf(R, rivers, water, heightM, hw) {
    if (!rivers && !water) return null;
    let M = ripCache.get(R);
    if (M) return M;
    const w = R.w, h = R.h, f = Math.max(1, Math.round(hw / w)), pxKm = 2 * Math.PI * 6371 / w, m = new Float32Array(w * h);
    // (a segment's ribbon: pixels x east (wrapping), y south; distances in km, east–west shrunk by the latitude)
    const stamp = (ax, ay, bx, by, halfKm, v) => {
        const cl = Math.max(0.05, Math.cos((0.5 - (0.5 * (ay + by) + 0.5) / h) * Math.PI)), kx = pxKm * cl, ky = pxKm;
        const reach = halfKm + 0.6 * pxKm, cover = v * Math.min(1, (2 * halfKm + 0.3 * pxKm) / pxKm);
        const x0 = Math.floor(Math.min(ax, bx) - reach / kx), x1 = Math.ceil(Math.max(ax, bx) + reach / kx);
        const y0 = Math.max(0, Math.floor(Math.min(ay, by) - reach / ky)), y1 = Math.min(h - 1, Math.ceil(Math.max(ay, by) + reach / ky));
        const dx = (bx - ax) * kx, dy = (by - ay) * ky, L2 = dx * dx + dy * dy;
        for (let y = y0; y <= y1; y++) for (let xx = x0; xx <= x1; xx++) {
            const x = ((xx % w) + w) % w, c = y * w + x;
            if (!R.koppen[c]) continue;
            const px = (xx + 0.5 - ax) * kx, py = (y + 0.5 - ay) * ky, t = L2 > 0 ? Math.max(0, Math.min(1, (px * dx + py * dy) / L2)) : 0;
            const ex = px - t * dx, ey = py - t * dy, a = cover * sm(reach, 0, Math.sqrt(ex * ex + ey * ey));
            if (a > m[c]) m[c] = a;
        }
    };
    if (rivers) {
        const { start, lat, lon, q } = rivers, starts = [...start, lat.length], lq0 = Math.log10(RIPARIAN.minQ);
        for (let s = 0; s < starts.length - 1; s++) for (let i = starts[s]; i < starts[s + 1] - 1; i++) {
            if (!(q[i] >= RIPARIAN.minQ)) continue;
            const x0 = (lon[i] + 180) / 360 * w - 0.5, y0 = (90 - lat[i]) / 180 * h - 0.5, x1 = (lon[i + 1] + 180) / 360 * w - 0.5, y1 = (90 - lat[i + 1]) / 180 * h - 0.5;
            if (Math.abs(x1 - x0) > w / 2) continue;
            const mx = ((Math.round(0.5 * (x0 + x1)) % w) + w) % w, my = Math.max(0, Math.min(h - 1, Math.round(0.5 * (y0 + y1))));
            const hm = heightM ? heightM[my * f * hw + mx * f] / 1000 : 0, big = sm(lq0, lq0 + 2.5, Math.log10(q[i]));
            const half = (RIPARIAN.halfKm[0] + (RIPARIAN.halfKm[1] - RIPARIAN.halfKm[0]) * big) * (1 + RIPARIAN.lowWiden * sm(RIPARIAN.lowKm[0], RIPARIAN.lowKm[1], hm));
            stamp(x0, y0, x1, y1, half, RIPARIAN.strength[0] + (RIPARIAN.strength[1] - RIPARIAN.strength[0]) * big);
        }
    }
    if (water) {
        // (a fresh lake's shore: from each of its pixels on its edge)
        const isLake = (x, y) => water[y * f * hw + (((x % w) + w) % w) * f] === 1;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            if (!isLake(x, y)) continue;
            if (isLake(x + 1, y) && isLake(x - 1, y) && (y === 0 || isLake(x, y - 1)) && (y === h - 1 || isLake(x, y + 1))) continue;
            stamp(x, y, x, y, RIPARIAN.lakeKm, RIPARIAN.lakeStrength);
        }
    }
    ripCache.set(R, m);
    return m;
}

/** Box-blur a w × h field in place, `passes` times, over about ±km (each pass ±km/2): rows wrap, each by its own width
 *  (wider toward the poles, at most a quarter of the way round); columns clamp. `px`: a pixel's km at the equator. */
function latBlur(a, w, h, km, px, passes = 2) {
    if (w < 4) { latBlurPlain(a, w, h, km, px, passes); return; }
    const tmp = new Float32Array(w), ry = Math.max(1, Math.round(km / px / 2)), R = ry + 1, ring = new Float32Array(Math.min(R, h + 1) * w), S = new Float64Array(w);
    for (let p = 0; p < passes; p++) {
        for (let y = 0; y < h; y++) {
            const cl = Math.max(0.05, Math.cos((0.5 - (y + 0.5) / h) * Math.PI)), r = Math.min(w >> 2, Math.max(1, Math.round(km / (px * cl) / 2))), o = y * w;
            let s = 0;
            for (let d = -r; d <= r; d++) s += a[o + ((d % w) + w) % w];
            for (let x = 0; x < w; x++) {
                tmp[x] = s / (2 * r + 1);
                let inn = x + r + 1; if (inn >= w) inn -= w;
                let out = x - r; if (out < 0) out += w;
                s += a[o + inn] - a[o + out];
            }
            for (let x = 0; x < w; x++) a[o + x] = tmp[x];
        }
        // (the columns a row at a time, as boxBlur's: the same sums, in the same order — each row's values kept in a ring
        // until the window leaves them)
        const RR = Math.min(R, h + 1);
        S.fill(0);
        let n = 0;
        for (let d = 0; d <= ry && d < h; d++) { const o = d * w; for (let x = 0; x < w; x++) S[x] += a[o + x]; n++; }
        for (let y = 0; y < h; y++) {
            const o = y * w, add = y + ry + 1, rem = y - ry, ra = add * w, rr = rem >= 0 ? (rem % RR) * w : 0, rs = (y % RR) * w, n0 = n;
            for (let x = 0; x < w; x++) {
                const s = S[x];
                let t = s;
                if (add < h) t += a[ra + x];
                if (rem >= 0) t -= ring[rr + x];
                S[x] = t;
                ring[rs + x] = a[o + x];
                a[o + x] = s / n0;
            }
            if (add < h) n++;
            if (rem >= 0) n--;
        }
    }
}
/** latBlur as it was written first (rows wrapping by modulo, columns one by one) — for a grid narrower than 4. */
function latBlurPlain(a, w, h, km, px, passes) {
    const tmp = new Float32Array(Math.max(w, h)), ry = Math.max(1, Math.round(km / px / 2));
    for (let p = 0; p < passes; p++) {
        for (let y = 0; y < h; y++) {
            const cl = Math.max(0.05, Math.cos((0.5 - (y + 0.5) / h) * Math.PI)), r = Math.min(w >> 2, Math.max(1, Math.round(km / (px * cl) / 2))), o = y * w;
            let s = 0;
            for (let d = -r; d <= r; d++) s += a[o + ((d % w) + w) % w];
            for (let x = 0; x < w; x++) { tmp[x] = s / (2 * r + 1); s += a[o + (x + r + 1) % w] - a[o + ((x - r) % w + w) % w]; }
            for (let x = 0; x < w; x++) a[o + x] = tmp[x];
        }
        for (let x = 0; x < w; x++) {
            let s = 0, n = 0;
            for (let d = 0; d <= ry && d < h; d++) { s += a[d * w + x]; n++; }
            for (let y = 0; y < h; y++) {
                tmp[y] = s / n;
                const add = y + ry + 1, rem = y - ry;
                if (add < h) { s += a[add * w + x]; n++; }
                if (rem >= 0) { s -= a[rem * w + x]; n--; }
            }
            for (let y = 0; y < h; y++) a[y * w + x] = tmp[y];
        }
    }
}

/** The land's mean height (km) around each place at the sizes of SAT_TERRAIN.tpKm: each worked out on a grid as coarse
 *  as its size allows (the climate picture's pixels in squares of a power of two), over the land only, then all three
 *  laid on the finest of those grids (so a pixel reads them with one set of weights); cached per climate picture. */
const meanCache = new WeakMap();
function landMeans(R, heightM, hw) {
    let M = meanCache.get(R);
    if (M) return M;
    const w = R.w, h = R.h, f = Math.max(1, Math.round(hw / w)), pxKm = 2 * Math.PI * 6371 / w;
    const grids = SAT_TERRAIN.tpKm.map(km => {
        let fac = 1;
        while (fac * 2 * pxKm * 1.5 <= km && w % (fac * 2) === 0 && h % (fac * 2) === 0) fac *= 2;
        const gw = w / fac, gh = h / fac, S = new Float32Array(gw * gh), N = new Float32Array(gw * gh);
        for (let y = 0; y < h; y++) {
            const row = ((y / fac) | 0) * gw, hy = y * f * hw;
            for (let x = 0; x < w; x++) {
                if (!R.koppen[y * w + x]) continue;
                const m = heightM[hy + x * f], g = row + ((x / fac) | 0);
                S[g] += m > 0 ? m / 1000 : 0; N[g]++;
            }
        }
        latBlur(S, gw, gh, km, pxKm * fac); latBlur(N, gw, gh, km, pxKm * fac);
        for (let g = 0; g < S.length; g++) S[g] = N[g] > 1e-4 ? S[g] / N[g] : NaN;
        return { fac, gw, gh, m: S };
    });
    // (the coarser grids read at the finest grid's points; NaN where the finest has no land around)
    const G0 = grids[0];
    M = { fac: G0.fac, gw: G0.gw, gh: G0.gh, m: grids.map((G, q) => {
        if (q === 0) return G.m;
        const out = new Float32Array(G0.gw * G0.gh);
        for (let j = 0; j < G0.gh; j++) for (let i = 0; i < G0.gw; i++) {
            const g = j * G0.gw + i;
            out[g] = G0.m[g] === G0.m[g] ? bilinearNaN(G, (i + 0.5) * G0.fac, (j + 0.5) * G0.fac) : NaN;
        }
        return out;
    }) };
    meanCache.set(R, M);
    return M;
}
/** Grid G (landMeans' kind: fac, gw, gh, m) at a point of the climate picture (pixel units): bilinear over its corners
 *  that hold a value; NaN with none. */
function bilinearNaN(G, px, py) {
    const X = px / G.fac - 0.5, Y = Math.max(0, Math.min(G.gh - 1, py / G.fac - 0.5)), gw = G.gw, m = G.m;
    const x0 = Math.floor(X), y0 = Math.floor(Y), fx = X - x0, fy = Y - y0;
    const i0 = ((x0 % gw) + gw) % gw, i1 = i0 + 1 === gw ? 0 : i0 + 1, r0 = y0 * gw, r1 = Math.min(G.gh - 1, y0 + 1) * gw;
    let s = 0, k = 0, v, q;
    v = m[r0 + i0]; if (v === v) { q = (1 - fx) * (1 - fy); s += v * q; k += q; }
    v = m[r0 + i1]; if (v === v) { q = fx * (1 - fy); s += v * q; k += q; }
    v = m[r1 + i0]; if (v === v) { q = (1 - fx) * fy; s += v * q; k += q; }
    v = m[r1 + i1]; if (v === v) { q = fx * fy; s += v * q; k += q; }
    return k > 1e-9 ? s / k : NaN;
}
let lineNoise = null, ripNoise = null;


/**
 * The large-scale features' fields (SAT_MACRO) on a grid ≤ 1024 wide, cached per climate picture: the provinces' mean
 * bedrock tint (its logs, per channel), the land's mean height over SAT_MACRO.basins.km (NaN where there is none), the
 * floods' belts (0 … 1) and the glacial ground (0 … 1).
 */
const macroCache = new WeakMap();
function macroOf(R, heightM, hw, rivers, ground) {
    let M = macroCache.get(R);
    if (M) return M;
    const A = SAT_MACRO, w = R.w, h = R.h, f = Math.max(1, Math.round(hw / w)), gw = Math.min(1024, w), gh = gw >> 1, N = gw * gh, fac = w / gw, pxKm = 2 * Math.PI * 6371 / gw;
    const rockPx = ground?.geology?.w === w ? ground.geology.rock : null, drv = ground?.drivers ?? null, LNR = SAT_GROUND.rocks.tint.map(t => t.map(Math.log));
    const pr = new Float32Array(N), pg = new Float32Array(N), pb = new Float32Array(N), land = new Float32Array(N), hs = new Float32Array(N), gl = new Float32Array(N);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!R.koppen[i]) continue;
        const g = Math.min(gh - 1, (y / fac) | 0) * gw + Math.min(gw - 1, (x / fac) | 0), hm = heightM[y * f * hw + x * f];
        land[g]++; hs[g] += hm > 0 ? hm / 1000 : 0;
        if (rockPx && rockPx[i]) { const t = LNR[rockPx[i]]; pr[g] += t[0]; pg[g] += t[1]; pb[g] += t[2]; }
        if (drv) { const d = Math.min(drv.h - 1, ((y + 0.5) * drv.h / h) | 0) * drv.w + Math.min(drv.w - 1, ((x + 0.5) * drv.w / w) | 0); if (drv.ice[d]) gl[g] += (drv.ice[d] / 255) * (0.5 + 0.5 * drv.scour[d] / 255); }
    }
    // (each a land-weighted mean over its size: the sums and the land blurred alike, then divided)
    const mean = (sum, km) => { const s = sum.slice(), n = land.slice(); latBlur(s, gw, gh, km, pxKm); latBlur(n, gw, gh, km, pxKm); for (let g = 0; g < N; g++) s[g] = n[g] > 1e-3 ? s[g] / n[g] : NaN; return s; };
    const prov = [pr, pg, pb].map(a => mean(a, A.provinces.km)), height = mean(hs, A.basins.km), glac = mean(gl, A.glacial.km);
    // (the floods' belts: each great river's reach stamped as a soft band on low ground)
    const flood = new Float32Array(N), F = A.floods;
    if (rivers) {
        const { start, lat, lon, q } = rivers, starts = [...start, lat.length], lq0 = Math.log(F.minQ), lq1 = Math.log(F.maxQ);
        for (let s = 0; s < starts.length - 1; s++) for (let i = starts[s]; i < starts[s + 1] - 1; i++) {
            if (!(q[i] >= F.minQ)) continue;
            const ax = (lon[i] + 180) / 360 * gw - 0.5, ay = (90 - lat[i]) / 180 * gh - 0.5, bx = (lon[i + 1] + 180) / 360 * gw - 0.5, by = (90 - lat[i + 1]) / 180 * gh - 0.5;
            if (Math.abs(bx - ax) > gw / 2) continue;
            const mx = (((0.5 * (lon[i] + lon[i + 1]) + 180) / 360 * w) | 0) % w, my = Math.max(0, Math.min(h - 1, ((90 - 0.5 * (lat[i] + lat[i + 1])) / 180 * h) | 0));
            const hm = heightM[my * f * hw + mx * f] / 1000, low = sm(F.lowKm[0], F.lowKm[1], hm);
            if (!(low > 0.01)) continue;
            const big = sm(lq0, lq1, Math.log(q[i])), half = F.halfKm[0] + (F.halfKm[1] - F.halfKm[0]) * big, v = low * (0.5 + 0.5 * big);
            const cl = Math.max(0.05, Math.cos((0.5 - (0.5 * (ay + by) + 0.5) / gh) * Math.PI)), kx = pxKm * cl, ky = pxKm;
            const x0 = Math.floor(Math.min(ax, bx) - half / kx), x1 = Math.ceil(Math.max(ax, bx) + half / kx), y0 = Math.max(0, Math.floor(Math.min(ay, by) - half / ky)), y1 = Math.min(gh - 1, Math.ceil(Math.max(ay, by) + half / ky));
            const dx = (bx - ax) * kx, dy = (by - ay) * ky, L2 = dx * dx + dy * dy;
            for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
                const c = yy * gw + ((xx % gw) + gw) % gw, px = (xx + 0.5 - ax) * kx, py = (yy + 0.5 - ay) * ky, t = L2 > 0 ? Math.max(0, Math.min(1, (px * dx + py * dy) / L2)) : 0;
                const ex = px - t * dx, ey = py - t * dy, a = v * sm(half, 0, Math.sqrt(ex * ex + ey * ey));
                if (a > flood[c]) flood[c] = a;
            }
        }
        boxBlur(flood, gw, gh, 1, 1);
    }
    M = { gw, gh, fac, prov, height, flood, glac };
    macroCache.set(R, M);
    return M;
}
const MC = new Int32Array(4), MW = new Float64Array(4);
/** The macro fields at pixel (x, y) of the climate picture — bilinear over the grid's cells with land around — into o. */
function macroAt(M, x, y, o) {
    const X = (x + 0.5) / M.fac - 0.5, Y = Math.max(0, Math.min(M.gh - 1, (y + 0.5) / M.fac - 0.5)), gw = M.gw;
    const x0 = Math.floor(X), y0 = Math.floor(Y), fx = X - x0, fy = Y - y0, i0 = ((x0 % gw) + gw) % gw, i1 = i0 + 1 === gw ? 0 : i0 + 1, r0 = y0 * gw, r1 = Math.min(M.gh - 1, y0 + 1) * gw;
    const c = MC, wt = MW, H = M.height;
    c[0] = r0 + i0; c[1] = r0 + i1; c[2] = r1 + i0; c[3] = r1 + i1; wt[0] = (1 - fx) * (1 - fy); wt[1] = fx * (1 - fy); wt[2] = (1 - fx) * fy; wt[3] = fx * fy;
    let k = 0;
    o.pr = o.pg = o.pb = o.height = o.flood = o.glac = 0;
    for (let j = 0; j < 4; j++) {
        const v = H[c[j]];
        if (v !== v) continue;
        const q = wt[j];
        k += q; o.height += q * v; o.pr += q * M.prov[0][c[j]]; o.pg += q * M.prov[1][c[j]]; o.pb += q * M.prov[2][c[j]]; o.flood += q * M.flood[c[j]]; o.glac += q * M.glac[c[j]];
    }
    if (!(k > 1e-9)) { o.height = NaN; return o; }
    o.height /= k; o.pr /= k; o.pg /= k; o.pb /= k; o.flood /= k; o.glac /= k;
    if (!(o.pr === o.pr)) o.pr = o.pg = o.pb = 0;
    if (!(o.glac === o.glac)) o.glac = 0;
    return o;
}

/** The styled picture of a finished moment for a season: sRGB bytes per pixel of its climate picture R (land), cached.
 *  `heightM` (m): the finished heights, `hw` wide (a whole multiple of R's width); `rivers`: the finished rivers;
 *  `water`: the finished picture's lakes; `ground`: the finished picture (its drivers and geology). Whatever of it
 *  prepareSatellite has already drawn is kept; the rest is drawn now. */
export function styledSatellite(R, season, heightM, hw, rivers, water = null, ground = null) {
    const J = styledJob(R, season, heightM, hw, rivers, water, ground);
    while (!J.done) J.step(Infinity);
    return J.out;
}

/**
 * Draw some of a season's styled picture ahead of time (owner, 2026-11-01: the Satellite view drawn "in the background
 * right after Add detail"), for about `budgetMs` — its shared fields first (each a step: the climates' shares, the
 * banks, the land's means, the large-scale features, the season's own set-up), then its rows. True once it is drawn.
 * The same picture as styledSatellite's, to the byte: the same steps, only spread over time.
 */
export function prepareSatellite(R, season, heightM, hw, rivers, water = null, ground = null, budgetMs = 10) {
    const J = styledJob(R, season, heightM, hw, rivers, water, ground);
    if (!J.done) J.step(budgetMs);
    return J.done;
}
/** Is a season's styled picture drawn? */
export function satelliteReady(R, season) { return !!styledJobs.get(R)?.get(season)?.done; }

/** Each climate picture's jobs, by season: a picture drawn a step at a time (the rows a band at a time). */
const styledJobs = new WeakMap();
function styledJob(R, season, heightM, hw, rivers, water, ground) {
    let byS = styledJobs.get(R);
    if (!byS) styledJobs.set(R, byS = new Map());
    let J = byS.get(season);
    if (J) return J;
    let stage = 0, run = null, y = 0, D = null;
    const stages = [
        () => sharesOf(R),
        () => riversideOf(R, rivers, water, heightM, hw),
        () => landMeans(R, heightM, hw),
        () => macroOf(R, heightM, hw, rivers, ground),
        // (the realistic picture's detail: its brightness, and it and the land blurred — each a step of its own)
        () => { D = detailOf(R, season); },
        () => blurDetail(R, D.Yb),
        () => blurDetail(R, D.L),
        () => { run = styledSetup(R, season, heightM, hw, rivers, water, ground, D); D = null; },
    ];
    J = {
        done: false, out: null,
        step(budgetMs) {
            const t0 = performance.now();
            while (!J.done) {
                if (stage < stages.length) stages[stage++]();
                else {
                    // (rows a few at a time, until the time is up)
                    const to = Math.min(run.h, y + 8);
                    run.rows(y, to); y = to;
                    if (y >= run.h) { J.out = run.out; J.done = true; run = null; break; }
                }
                if (performance.now() - t0 >= budgetMs) break;
            }
            return J.done;
        },
    };
    byS.set(season, J);
    return J;
}

/** The realistic picture's brightness over the land (Y, and Yb to blur), and the land (L, to blur) — for a season. */
function detailOf(R, season) {
    const w = R.w, h = R.h, S = R.sat[season], Y = new Float32Array(w * h), Yb = new Float32Array(w * h), L = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) if (R.koppen[i]) { const o = 3 * i; Y[i] = 0.2126 * LIN[S[o]] + 0.7152 * LIN[S[o + 1]] + 0.0722 * LIN[S[o + 2]]; Yb[i] = Y[i]; L[i] = 1; }
    return { Y, Yb, L };
}
/** One of detailOf's fields blurred over ±DETAIL_KM, in place. */
function blurDetail(R, a) { boxBlur(a, R.w, R.h, Math.max(1, Math.round(DETAIL_KM / (2 * Math.PI * 6371 / R.w) / 2))); }

/** The styled picture's set-up for a season (its tables, fields and the realistic picture's detail) and its rows:
 *  rows(from, to) draws those rows into `out`. */
function styledSetup(R, season, heightM, hw, rivers, water, ground, D) {
    // (the ground's character's data — the detail's drivers and the rocks, where the moment has them — and its tints)
    const G = SAT_GROUND, drv = ground?.drivers ?? null, rockPx = ground?.geology?.w === R.w ? ground.geology.rock : null, TAU = 2 * Math.PI;
    const LN_ROCK = G.rocks.tint.map(t => t.map(Math.log)), LN_DUNE = G.dunes.tint.map(Math.log), LN_DARK = G.cover.dark.map(Math.log), LN_LIGHT = G.cover.light.map(Math.log);
    const LN_ICE_BLUE = G.ice.blue.map(Math.log), LN_OUTLET = G.ice.outlet.map(Math.log);
    groundNoise ??= new FastNoise(6197);
    // (the large-scale features' fields and tints — P6)
    const MAC = macroOf(R, heightM, hw, rivers, ground), mo = {}, A0 = SAT_MACRO;
    // (the baseline colour cube's tables — P8)
    const CU = SAT_CUBE, CT = cubeTables(CU), RC = CU.realism > 0 ? realCubeTables(CU) : null, cs = [0, 0, 0], cw = [0, 0, 0], ry = [0, 0, 0], rw = [0, 0, 0], ROCK_CUBE = linOf(CU.rock), LP = CU.p.map(Math.log), LRP = CU.realP.map(Math.log);
    const LN_BASIN = A0.basins.basin.map(Math.log), LN_UPLAND = A0.basins.upland.map(Math.log), LN_FLOOD = A0.floods.tint.map(Math.log), LN_GLAC = A0.glacial.tint.map(Math.log);
    const w = R.w, h = R.h, f = Math.max(1, Math.round(hw / w)), S = R.sat[season], sh = sharesOf(R), rip = riversideOf(R, rivers, water, heightM, hw);
    const K = SAT_TERRAIN, MS = landMeans(R, heightM, hw), pxKm = 2 * Math.PI * 6371 / w, fN = 6371 / K.lineNoiseSizeKm;
    const LN_HOLLOW = K.hollowTint.map(Math.log), LN_RIDGE = K.ridgeTint.map(Math.log);
    lineNoise ??= new FastNoise(6151); ripNoise ??= new FastNoise(6163);
    const LN_RIP = RIPARIAN.tint.map(Math.log), fP = 6371 / RIPARIAN.patchKm;
    const cosL = new Float64Array(w), sinL = new Float64Array(w);
    for (let x = 0; x < w; x++) { const lon = ((x + 0.5) / w - 0.5) * 2 * Math.PI; cosL[x] = Math.cos(lon); sinL[x] = Math.sin(lon); }
    const hAt = (x, y) => Math.max(0, heightM[y * f * hw + x * f]);
    // (the realistic picture's detail: its brightness against its blurred self, over the land — detailOf, blurDetail)
    const { Y, Yb, L } = D;
    const out = new Uint8Array(3 * w * h), col = [0, 0, 0], N = sh.N, period = Math.max(4, Math.round(2 * Math.PI * 6371 / WARP_FEATURE_KM));
    const sw = new Float64Array(NF), mw = new Float64Array(NF);
    const warpCells = WARP_KM / sh.pxKm;
    const rows = (from, to) => { for (let y = from; y < to; y++) {
        const latDeg = 90 - 180 * (y + 0.5) / h, ss = summerShare(latDeg, season), ws = 1 - ss, v = (y + 0.5) / h * period / 2;
        const lat = latDeg * Math.PI / 180, cl = Math.max(0.05, Math.cos(lat)), sl = Math.sin(lat), pole = lat >= 0 ? 1 : -1, yU = Math.max(0, y - 1), yD = Math.min(h - 1, y + 1);
        for (let x = 0; x < w; x++) {
            const i = y * w + x, k = R.koppen[i]; if (!k) continue;
            const hm = heightM[y * f * hw + x * f], hKm = hm > 0 ? hm / 1000 : 0;
            const own = familyOfClass[k];
            // (the land in the colour: the place against its surroundings — + a hollow, − a ridge — the way its slope
            // faces, and the lines bent by them and a wobble)
            let tp = 0, rel = 0, mean120 = NaN;
            {
                // (the three means at this pixel: one set of bilinear weights over the corners with land around)
                const X = (x + 0.5) / MS.fac - 0.5, Yg = Math.max(0, Math.min(MS.gh - 1, (y + 0.5) / MS.fac - 0.5)), gw = MS.gw, m0 = MS.m[0];
                const x0 = Math.floor(X), y0 = Math.floor(Yg), fx = X - x0, fy = Yg - y0;
                const i0 = ((x0 % gw) + gw) % gw, i1 = i0 + 1 === gw ? 0 : i0 + 1, r0 = y0 * gw, r1 = Math.min(MS.gh - 1, y0 + 1) * gw;
                const c0 = r0 + i0, c1 = r0 + i1, c2 = r1 + i0, c3 = r1 + i1;
                const q0 = m0[c0] === m0[c0] ? (1 - fx) * (1 - fy) : 0, q1 = m0[c1] === m0[c1] ? fx * (1 - fy) : 0, q2 = m0[c2] === m0[c2] ? (1 - fx) * fy : 0, q3 = m0[c3] === m0[c3] ? fx * fy : 0, qk = q0 + q1 + q2 + q3;
                let below = hKm;
                if (qk > 1e-9) for (let q = 0; q < 3; q++) {
                    const m = MS.m[q], mean = ((q0 ? q0 * m[c0] : 0) + (q1 ? q1 * m[c1] : 0) + (q2 ? q2 * m[c2] : 0) + (q3 ? q3 * m[c3] : 0)) / qk;
                    if (mean !== mean) continue;
                    // (each size against the next smaller one's mean, the smallest against the place itself — so each carries
                    // only the features of its own size; and the smallest only where the ground has real relief: a plain's
                    // bumps do not each flip the colour)
                    const d = mean - below, gate = q === 0 ? sm(K.tpGateKm[0], K.tpGateKm[1], Math.abs(d)) : 1;
                    below = mean;
                    tp += gate * K.tpWeight[q] * Math.max(-2, Math.min(2, d / K.tpDepthKm[q]));
                    if (q === 1) mean120 = mean;
                    if (q === 0) rel = hKm - mean;
                }
            }
            const hollow = Math.tanh(tp);
            const ge = (hAt(x + 1 === w ? 0 : x + 1, y) - hAt(x === 0 ? w - 1 : x - 1, y)) / (2 * pxKm * cl), gn = (hAt(x, yU) - hAt(x, yD)) / (2 * pxKm);
            const slope = Math.sqrt(ge * ge + gn * gn), facing = slope > 1e-3 ? (-gn * pole / slope) * sm(K.aspectSlope[0], K.aspectSlope[1], slope) : 0;
            const nz = hKm > 0.35 ? Math.max(-2, Math.min(2, lineNoise.fbm(fN * cl * cosL[x], fN * cl * sinL[x], fN * sl, 2, 0.5) / 0.3)) : 0;
            const sT = Math.max(0, Math.min(NS - 1, Math.round((hKm + K.treeRelief * rel + K.treeFacingKm * facing + K.treeNoiseKm * nz) / STEP_KM)));
            const sS = Math.max(0, Math.min(NS - 1, Math.round((hKm + K.snowRelief * rel + K.snowFacingKm * facing + K.snowNoiseKm * nz) / STEP_KM)));
            // the climates here: their smooth shares (sw — the lines, the snow, the dryness follow these) and the mosaic's
            // weights (mw — the lowland colour: P2)
            sw.fill(0);
            let tot = 0;
            if (own === ICE) { sw[ICE] = 1; tot = 1; }
            else {
                // (the shares at this pixel — before P2, where the noise moves it: the climates' edges interlock)
                let gx = (x + 0.5) / sh.f, gy = (y + 0.5) / sh.f;
                if (!sh.fuzzy) { const u = (x + 0.5) / w * period; gx += warpCells * 2 * (fbm(u, v, period) - 0.5); gy += warpCells * 2 * (fbm(u + 17.3, v + 9.1, period) - 0.5); }
                const X = gx - 0.5, Yc = Math.max(0, Math.min(sh.gh - 1.001, gy - 0.5)), x0 = Math.floor(X), y0 = Math.floor(Yc), fx = X - x0, fy = Yc - y0;
                const c00 = y0 * sh.gw + ((x0 % sh.gw) + sh.gw) % sh.gw, c10 = y0 * sh.gw + ((x0 + 1) % sh.gw + sh.gw) % sh.gw, c01 = c00 + sh.gw, c11 = c10 + sh.gw;
                for (let g = 0; g < NF; g++) {
                    if (g === ICE) continue;
                    const o = g * N, wt = (1 - fx) * (1 - fy) * sh.share[o + c00] + fx * (1 - fy) * sh.share[o + c10] + (1 - fx) * fy * sh.share[o + c01] + fx * fy * sh.share[o + c11];
                    if (wt > 1e-4) { sw[g] = wt; tot += wt; }
                }
                if (tot < 1e-4) { sw[Math.max(0, own)] = 1; tot = 1; }
            }
            for (let g = 0; g < NF; g++) sw[g] /= tot;
            mosaicWeights(sw, mw, sh.fuzzy && own !== ICE, cl * cosL[x], cl * sinL[x], sl, hollow + 0.5 * facing);
            col[0] = col[1] = col[2] = 0;
            let dry = 0, snowSh = 0, rt = 0, rk0 = 0, rk1 = 0, rk2 = 0;
            for (let g = 0; g < NF; g++) {
                const s = sw[g], m = mw[g];
                if (!(s > 0) && !(m > 0)) continue;
                const a = ((g * 2) * NS + sT) * 3, b = a + NS * 3, ta = (g * 2) * NS + sT, sa = (g * 2) * NS + sS;
                if (m > 0) { col[0] += m * (ss * BIOME[a] + ws * BIOME[b]); col[1] += m * (ss * BIOME[a + 1] + ws * BIOME[b + 1]); col[2] += m * (ss * BIOME[a + 2] + ws * BIOME[b + 2]); }
                if (s > 0) {
                    rt += s * (ss * RT[ta] + ws * RT[ta + NS]);
                    rk0 += s * (ss * ROCKP[a] + ws * ROCKP[b]); rk1 += s * (ss * ROCKP[a + 1] + ws * ROCKP[b + 1]); rk2 += s * (ss * ROCKP[a + 2] + ws * ROCKP[b + 2]);
                    snowSh += s * (ss * SNOWS[sa] + ws * SNOWS[sa + NS]);
                    dry += s * (ss * RIP[g * 2] + ws * RIP[g * 2 + 1]);
                }
            }
            // (the rock above the tree line: its own colour with a little of the lowland's under it — by the smooth shares,
            // so it follows the height, never the mosaic's patches)
            if (rt > 0) {
                const ru = rt * (1 - BIOME_UNDER_ROCK);
                col[0] += (rk0 - col[0]) * ru; col[1] += (rk1 - col[1]) * ru; col[2] += (rk2 - col[2]) * ru;
            }
            // (the baseline colour cube — P8: the year's warmth and rain, toward rock with height and slope, in the season;
            // laid over the climates' own colours, under the terrain's and the ground's detail; not on an ice sheet)
            if (CU.on && CU.share > 0 && own !== ICE) {
                const t = R.tAnnual[i] / 100, p = Math.log(Math.max(1, R.pAnnual[i]));
                // (the stylised chart only where it shows: not when the realistic colours replace it)
                const full = RC && CU.realism >= 1;
                if (!full) { cubeAt(CU.t, LP, CT[0], t, p, cs); cubeAt(CU.t, LP, CT[1], t, p, cw); }
                // (the realistic cube: the year's own table, or the season's summer and winter by the latitude)
                if (RC) {
                    if (season === 'year') { cubeAt(CU.realT, LRP, RC[0], t, p, ry); rw[0] = ry[0]; rw[1] = ry[1]; rw[2] = ry[2]; }
                    else { cubeAt(CU.realT, LRP, RC[2], t, p, ry); cubeAt(CU.realT, LRP, RC[1], t, p, rw); }
                }
                const z = CU.rockMax * Math.max(sm(CU.rockHeightKm[0], CU.rockHeightKm[1], hKm), sm(CU.rockSlope[0], CU.rockSlope[1], slope)), yr = season === 'year';
                for (let c = 0; c < 3; c++) {
                    let vv;
                    if (full) vv = yr ? ry[c] : ss * ry[c] + ws * rw[c];
                    else { vv = ss * cs[c] + ws * cw[c]; if (RC) vv += ((yr ? ry[c] : ss * ry[c] + ws * rw[c]) - vv) * CU.realism; }
                    vv += (ROCK_CUBE[c] - vv) * z;
                    col[c] += (vv - col[c]) * CU.share;
                }
            }
            // (how bare the ground is, and how much of it has a canopy — by the mosaic's weights and the rock's share)
            let bare = 0, canopy = 0;
            for (let g = 0; g < NF; g++) if (mw[g] > 0) { bare += mw[g] * BARE[g]; canopy += mw[g] * CANOPY[g]; }
            bare += rt * (1 - bare); canopy *= 1 - rt;
            // (the large-scale features — P6: the bedrock's provinces, basins and plateaus, the great rivers' floodplains, the
            // ice age's scoured ground)
            if (own !== ICE && MAC) {
                const m = macroAt(MAC, x, y, mo), A = SAT_MACRO;
                if (A.provinces.on) { const a = A.provinces.strength * (A.provinces.veiled + (1 - A.provinces.veiled) * bare); col[0] *= Math.exp(a * m.pr); col[1] *= Math.exp(a * m.pg); col[2] *= Math.exp(a * m.pb); }
                if (A.basins.on && m.height === m.height && mean120 === mean120) {
                    const b = Math.tanh((m.height - mean120) / A.basins.depthKm), LT = b >= 0 ? LN_BASIN : LN_UPLAND, ab = Math.abs(b);
                    for (let c = 0; c < 3; c++) col[c] *= Math.exp(ab * LT[c]);
                }
                if (A.floods.on && m.flood > 0.005) { const a = A.floods.strength * m.flood; for (let c = 0; c < 3; c++) col[c] *= Math.exp(a * LN_FLOOD[c]); }
                if (A.glacial.on && m.glac > 0.005) {
                    const a = A.glacial.strength * Math.min(1, m.glac);
                    for (let c = 0; c < 3; c++) col[c] *= Math.exp(a * LN_GLAC[c]);
                    const lum = 0.2126 * col[0] + 0.7152 * col[1] + 0.0722 * col[2], k = A.glacial.calm * a;
                    for (let c = 0; c < 3; c++) col[c] = lum + (col[c] - lum) * (1 - k);
                }
            }
            // (the ground's character — P4: its bedrock, sand seas, fold bands and the plants' patches)
            if (own !== ICE) {
                const px = cl * cosL[x], py = cl * sinL[x];
                // (km east and north of the meridian and the equator, for the stripes — locally flat)
                const Xk = ((x + 0.5) / w - 0.5) * 2 * Math.PI * 6371 * cl, Yk = lat * 6371, dI = drv ? Math.min(drv.h - 1, ((y + 0.5) * drv.h / h) | 0) * drv.w + Math.min(drv.w - 1, ((x + 0.5) * drv.w / w) | 0) : -1;
                if (G.rocks.on && rockPx && bare > 0) { const r = rockPx[i], a = G.rocks.share * bare; if (r) for (let c = 0; c < 3; c++) col[c] *= Math.exp(a * LN_ROCK[r][c]); }
                if (G.dunes.on && dI >= 0 && drv.erg[dI]) {
                    const erg = drv.erg[dI] / 255, th = drv.wind[dI] * TAU / 256, mode = drv.duneMode[dI] / 255, phi = th + mode * Math.PI / 2, D = G.dunes;
                    const along = -Xk * Math.sin(phi) + Yk * Math.cos(phi), across = Xk * Math.cos(phi) + Yk * Math.sin(phi);
                    const wob = D.warpKm * groundNoise.noise3D(along / D.lengthKm, across / (3 * D.spacingKm), 1.7) / 0.3, run = 0.6 + 0.4 * groundNoise.noise3D(along / D.lengthKm + 5.1, across / D.spacingKm, 4.2) / 0.3;
                    const st = Math.sin(TAU * (across + wob) / D.spacingKm) * Math.max(0, run) * sm(2, 4, D.spacingKm / pxKm);
                    for (let c = 0; c < 3; c++) col[c] *= Math.exp(erg * LN_DUNE[c]) * (1 + D.contrast * erg * st);
                }
                if (G.bands.on && dI >= 0 && drv.fold[dI]) {
                    const fold = drv.fold[dI] / 255, th = drv.foldDir[dI] * TAU / 256, B = G.bands;
                    const across = Xk * Math.cos(th) + Yk * Math.sin(th), along = -Xk * Math.sin(th) + Yk * Math.cos(th);
                    const wob = B.warpKm * groundNoise.noise3D(along / (4 * B.spacingKm) + 9.3, across / (2 * B.spacingKm), 2.9) / 0.3;
                    const st = Math.sin(TAU * (across + wob) / B.spacingKm) * sm(2, 4, B.spacingKm / pxKm), a = B.contrast * fold * (B.veiled + (1 - B.veiled) * bare) * st;
                    col[0] *= 1 + a; col[1] *= 1 + 0.85 * a; col[2] *= 1 + 0.7 * a;
                }
                if (G.cover.on && canopy > 0.02) {
                    const Cv = G.cover, f1 = 6371 / Cv.sizeKm, fr = 6371 / Cv.regionKm;
                    const n = groundNoise.fbm(f1 * px + 21.7, f1 * py - 13.1, f1 * sl + 6.6, 2, 0.5) / 0.3 - Cv.lean * hollow;
                    const open = sm(-Cv.edge, Cv.edge, n * 0.3), reg = Math.max(0, 1 + Cv.regional * groundNoise.noise3D(fr * px - 4.4, fr * py + 8.8, fr * sl - 2.2) / 0.3);
                    const a = Cv.strength * canopy * reg;
                    for (let c = 0; c < 3; c++) col[c] *= Math.exp(a * ((1 - open) * LN_DARK[c] + open * LN_LIGHT[c]));
                }
            }
            // (hollows richer and darker, ridges paler — dry country the most — and highlands calmer; not an ice sheet)
            if (own !== ICE) {
                const lean = hollow * (K.leanWet + (K.leanDry - K.leanWet) * dry), LT = lean >= 0 ? LN_HOLLOW : LN_RIDGE, la = Math.abs(lean);
                for (let c = 0; c < 3; c++) col[c] *= Math.exp(la * LT[c]);
                const up = K.uplandCalm * sm(K.uplandKm[0], K.uplandKm[1], hKm), lum = 0.2126 * col[0] + 0.7152 * col[1] + 0.0722 * col[2];
                for (let c = 0; c < 3; c++) col[c] = lum + (col[c] - lum) * (1 - up);
            }
            // (the snow, its line bent by the ground; then the sky's light: hollows a little darker, crests lighter)
            const sky = 1 - K.skyLight * hollow;
            for (let c = 0; c < 3; c++) col[c] = (col[c] + (SNOW_LIN[c] - col[c]) * snowSh) * sky;
            // (the snow: only where the climate has snow or ice in the season shown — the year's view: in its winter)
            const cv = R.cover ? R.cover[i] : 0, snowy = (cv & 31) === 1 || (season === 'jan' ? cv & 32 : season === 'jul' ? cv & 64 : cv & 96);
            // (the rivers' green banks, by the place's dryness; none under snow)
            let rp = rip && !snowy ? rip[i] * dry : 0;
            if (rp > 0) {
                // (patchy along the course: oases and green reaches, not one even ribbon)
                rp *= Math.max(RIPARIAN.patchClamp[0], Math.min(RIPARIAN.patchClamp[1], 1 + RIPARIAN.patch * ripNoise.fbm(fP * cl * cosL[x], fP * cl * sinL[x], fP * sl, 2, 0.5) / 0.3));
                for (let c = 0; c < 3; c++) col[c] *= Math.exp(rp * LN_RIP[c]);
            }
            // (the realistic picture's detail, as brightness)
            const yb = L[i] > 0 ? Yb[i] / L[i] : Y[i], rd = Math.max(0.5, Math.min(1.7, (Y[i] + 0.01) / (yb + 0.01))) ** DETAIL_STRENGTH, ratio = rd + (1 - rd) * Math.min(1, 1.5 * rp);   // (the banks' own green, not the picture's dark channel)
            const o = 3 * i, r0 = S[o], g0 = S[o + 1], b0 = S[o + 2], mn = Math.min(r0, g0, b0), mx = Math.max(r0, g0, b0);
            const white = snowy ? sm(170, 220, mn) * (1 - sm(0, 40, mx - mn)) : 0;
            // (an ice sheet: its margins bluer, streaked along its flow downhill, its outlet glaciers darker — P4)
            let iceA = 0, iceS = 1, iceO = 0;
            if (own === ICE && G.ice.on) {
                const I = G.ice;
                iceA = Math.max(sm(I.marginSlope[0], I.marginSlope[1], slope), sm(I.marginKm[0], I.marginKm[1], hKm));
                if (slope > 0.5) {
                    // (along the flow: downhill, the slope's own direction; the streaks long that way)
                    const ux = -ge / slope, uy = -gn / slope, Xk = ((x + 0.5) / w - 0.5) * 2 * Math.PI * 6371 * cl, Yk = lat * 6371;
                    const along = Xk * ux + Yk * uy, across = -Xk * uy + Yk * ux;
                    iceS = 1 + I.streak * iceA * groundNoise.fbm(along / I.streakKm[1] + 3.3, across / I.streakKm[0] - 7.1, 5.5, 2, 0.5) / 0.3;
                }
                iceO = iceA * Math.max(0, hollow);
            }
            for (let c = 0; c < 3; c++) {
                let Lc = col[c] * ratio;
                Lc += (LIN[S[o + c]] - Lc) * Math.max(white, SAT_REALISTIC_SHARE);
                if (iceA > 0) Lc *= Math.exp(iceA * LN_ICE_BLUE[c] + iceO * LN_OUTLET[c]) * iceS;
                out[o + c] = Math.round(Math.min(255, toSrgb(Math.min(1, Lc))));
            }
        }
    } };
    return { out, h, rows };
}

// ── the same colours per region of a mesh (Generate and Import's Satellite view: no realistic picture, no rivers) ──
// The families' shares on a fixed lat-lon grid (~39 km cells, blurred and noise-warped as above), sampled back at each
// region — the same blend at every detail; a gentle fractal mottling of brightness for texture; the climate's snow and
// ice sheets; the sea ice sharp and ragged, like Evolution's.
const REGION_GRID_W = 1024;
let regionNoise = null;
/**
 * @param {{n: number, xyz: Float32Array, lat: Float32Array, lon: Float32Array, elevKm: (r: number) => number,
 *          koppen: Uint8Array, tAnnual: ArrayLike<number>, tRange: ArrayLike<number>, season: 'year'|'jan'|'jul',
 *          snowAt: (r: number) => number, iceSheetAt: (r: number) => number, FastNoise: Function}} p
 *   lat/lon in degrees; koppen 0 at sea; tAnnual / tRange per region (°C; NaN at sea); snowAt: the season's snow on land 0–1.
 * @returns {Float32Array} sRGB 0–1 per land region (3 n; the sea left 0)
 */
export function satelliteRegionColors(p) {
    const { n, xyz, lat, lon, elevKm, koppen, tAnnual, tRange, season, snowAt, iceSheetAt } = p;
    regionNoise ??= new p.FastNoise(4243);
    const gw = REGION_GRID_W, gh = gw / 2, N = gw * gh, share = new Float32Array(NF * N), cellOf = new Int32Array(n);
    for (let r = 0; r < n; r++) {
        const k = koppen[r]; cellOf[r] = -1; if (!k) continue;
        const g = familyOfClass[k]; if (g < 0 || g === ICE) continue;
        const x = Math.min(gw - 1, Math.floor((lon[r] + 180) / 360 * gw)), y = Math.min(gh - 1, Math.floor((90 - lat[r]) / 180 * gh)), c = y * gw + x;
        cellOf[r] = c;
        let cold = 0;
        if (DRY.has(g)) {
            const tA = tAnnual[r], range = tRange[r], warmest = tA + (range === range ? range / 2 : 8);
            if (tA === tA) cold = sm(0, 1, Math.max((COLD_DRY_C[0] - warmest) / (COLD_DRY_C[0] - COLD_DRY_C[1]), (COLD_DRY_YEAR_C[0] - tA) / (COLD_DRY_YEAR_C[0] - COLD_DRY_YEAR_C[1])));
        }
        share[g * N + c] += 1 - cold;
        if (cold > 0) share[TUNDRA * N + c] += cold;
    }
    const pxKm = 2 * Math.PI * 6371 / gw, rB = Math.max(1, Math.round(RAMP_BLEND_KM / pxKm / 2));
    for (let g = 0; g < NF; g++) if (g !== ICE) boxBlur(share.subarray(g * N, (g + 1) * N), gw, gh, rB);
    const out = new Float32Array(3 * n), col = [0, 0, 0], period = Math.max(4, Math.round(2 * Math.PI * 6371 / WARP_FEATURE_KM)), warpCells = WARP_KM / pxKm;
    const fM1 = 6371 / 300, fM2 = 6371 / 60;
    for (let r = 0; r < n; r++) {
        const k = koppen[r]; if (!k) continue;
        const own = familyOfClass[k], h = elevKm(r), s = Math.min(NS - 1, Math.round((h > 0 ? h : 0) / STEP_KM));
        const ss = summerShare(lat[r], season), ws = 1 - ss;
        col[0] = col[1] = col[2] = 0;
        let tot = 0;
        const add = (g, wt) => {
            const a = ((g * 2) * NS + s) * 3, b = a + NS * 3;
            col[0] += wt * (ss * TABLE[a] + ws * TABLE[b]); col[1] += wt * (ss * TABLE[a + 1] + ws * TABLE[b + 1]); col[2] += wt * (ss * TABLE[a + 2] + ws * TABLE[b + 2]);
        };
        if (own === ICE) { add(ICE, 1); tot = 1; }
        else {
            const u = (lon[r] + 180) / 360 * period, v = (90 - lat[r]) / 180 * period / 2;
            const X = (lon[r] + 180) / 360 * gw - 0.5 + warpCells * 2 * (fbm(u, v, period) - 0.5);
            const Yc = Math.max(0, Math.min(gh - 1.001, (90 - lat[r]) / 180 * gh - 0.5 + warpCells * 2 * (fbm(u + 17.3, v + 9.1, period) - 0.5)));
            const x0 = Math.floor(X), y0 = Math.floor(Yc), fx = X - x0, fy = Yc - y0;
            const c00 = y0 * gw + ((x0 % gw) + gw) % gw, c10 = y0 * gw + ((x0 + 1) % gw + gw) % gw, c01 = c00 + gw, c11 = c10 + gw;
            for (let g = 0; g < NF; g++) {
                if (g === ICE) continue;
                const o = g * N, wt = (1 - fx) * (1 - fy) * share[o + c00] + fx * (1 - fy) * share[o + c10] + (1 - fx) * fy * share[o + c01] + fx * fy * share[o + c11];
                if (wt > 1e-6) { add(g, wt); tot += wt; }
            }
            if (tot < 1e-6) { add(Math.max(0, own), 1); tot = 1; }
        }
        // (texture: a gentle fractal mottling of brightness)
        const px = xyz[3 * r], py = xyz[3 * r + 1], pz = xyz[3 * r + 2];
        const mot = 1 + 0.06 * regionNoise.fbm(fM1 * px, fM1 * py, fM1 * pz, 3, 0.5) + 0.04 * regionNoise.noise3D(fM2 * px + 3.3, fM2 * py - 1.7, fM2 * pz + 5.9);
        // (the climate's snow in the season, and the ice sheets)
        const white = Math.max(sm(0.3, 0.85, snowAt(r)), sm(0.2, 0.6, iceSheetAt(r)));
        const sn = [SNOW_LIN[0], SNOW_LIN[1], SNOW_LIN[2]];
        for (let c = 0; c < 3; c++) {
            let L = col[c] / tot * mot;
            L += (sn[c] - L) * white;
            out[3 * r + c] = toSrgb(Math.min(1, Math.max(0, L))) / 255;
        }
    }
    return out;
}
const SNOW_LIN = linOf(SNOW);

/** The sea ice as Evolution draws it, per region: a sharp, noise-ragged edge on the ice fraction `c` (0–1) at unit-sphere
 *  point (x, y, z). */
export function seaIceRegion(c, x, y, z, FastNoise) {
    if (!(c > 0.04)) return 0;
    if (c > 0.96) return 1;
    regionNoise ??= new FastNoise(4243);
    const fE = 6371 / 160, fF = 6371 / 30;
    const n = 0.7 * regionNoise.fbm(fE * x, fE * y, fE * z, 3, 0.5) + 0.3 * regionNoise.noise3D(fF * x + 5.1, fF * y - 2.7, fF * z + 8.3);
    return sm(0.47, 0.53, c + 0.42 * n);
}
