// The Food tab (plans/V2_FARMING_PLAN.md C1; Madeline James's culture series, Part 4): finished moments only, drawn per
// pixel of the finished picture over its hillshade, from the parts the finish worked out (farming/farming.js):
//   Farmland — what the land could grow: green by rain alone, teal where only water brought makes it farmable (the
//              Nile's kind of land); the techniques — flood farming, canals, terraces, raised fields — chips in the
//              legend, each on or off (not the metal ages: the Andes had terraces and canals and no iron); a soft ramp,
//              or graded classes;
//   Staple food (C2, C6b) — what a place would live on most, as an archetype: paddy grains, cool-season grains,
//              warm-season grains, roots and tubers, livestock, fish or wild foods (farming/living.js) — stronger the
//              better it feeds it; striped where a second does nearly as well; a legend chip shows one alone;
//   Way of life (C6b; plans/V2_FOOD_PLAN.md F2) — how its people would live: its food system (farming/living.js — paddy
//              farming, irrigated valleys, plough and flocks, mixed farms, hoe farming, forest gardens, highland farming,
//              grain and herds, nomadic herding, settled or mobile foragers); striped where a second does nearly as well;
//              a legend chip shows one alone; Simple shows the three lifestyles — farming, herding or gathering (gatherers
//              keep to their way unless farming or herding would feed ten times as many) — a chip each for how many each
//              could feed, alone;
//   Animals (F2) — the leading herd or draught beast of each place's farmers and herders (farming/beasts.js: eight
//              archetypes, each with its roles), striped where a second ranks nearly as well; hatched, the fly belt
//              (cattle, horses and buffalo fail there; no plough); a legend chip shows where one could be kept;
//   Origins (plans/V2_FOOD_PLAN.md F3a; farming/history.js) — the wild larder: how many crops' and beasts' wild ancestors
//              grow within reach, or one archetype's alone (a beast hatched where its habitat is but its landmass lacks it);
//              or the hearth odds: where farming would most likely begin; or the history (F3b; farming/hearths.js) — when
//              farming came (years after the first, a line each thousand) or from which hearth (each primary hearth's lands
//              in its colour), the hearths pinned and numbered in the order they began. Each landmass's luck — which beasts'
//              ancestors live on it, whether the fly does — and the hearths' dates drawn from the world's seed: Re-roll draws
//              again, Fewer gaps makes gaps rarer;
//   People (C3) — how many the land could feed, pre-industrial, with the techniques chosen, each place by its way of
//              life (farming/people.js, living.js);
//   Soil — how fertile the ground is (on flat ground), its kind in the readout: river silt, loess, black earth…;
//   Growing season — the months crops grow, by rain alone or watered.
// The readout also says when a farming place brings its harvest in (farming/calendar.js: plans/V2_FOOD_PLAN.md F1).
// As it came (F4): Staple food, Way of life, Animals and People show by default what had come to each place 10,000 years
// after the first farming (the history's arrivals: farming-store.js cameOf) — or its full spread, or the best possible
// (what the land alone would support, every crop and beast everywhere); Farmland, Soil and Growing season are the land's.
// Named (F5a): Staple food and Animals show each place's own crop and beast — the strain of its hearth, by its Earth-like
// name ("emmer-like", "zebu-like"; farming/names.js), a hue each round its archetype's colour.

import { farmClass, hasHarvests, CROP_STAPLE, STAPLE_CROP, hasMonths, MONTH_ALL_YEAR, Staple, STAPLES, STAPLE_WORDS, CROPS, SOIL_WORDS, MOD_WORDS, SoilKind } from '../farming/farming.js';
import { croppedShare } from '../farming/people.js';
import { LIFESTYLES, LIFESTYLE_WORDS, Lifestyle, GATHER, livingPeople,
    FOOD_SYSTEMS, FOOD_SYSTEM_WORDS, foragerWord, hasMeasures } from '../farming/living.js';
import { BEASTS, BEAST_WORDS, newBeasts } from '../farming/beasts.js';
import { partsAt, placeAt, groundOf, livingAt, systemAt, keepsBeasts, placesOf, waysOf, onlyOf, lifeAloneOf, beastAloneOf, slotOf, dec, decLog, peopleFromLog, historyOf, luckOf, flyAtOf, hearthsOf, cameOf, cameAt, namesOf, variantsOf, strainsOf, strainsHere, strainVote, minorOf, minorAgeOf } from './farming-store.js';
import { wiki, earthHome } from '../farming/names.js';
import { KINDS, MINOR, GROWN_FIT, arriveByte, ARRIVE_NEVER, rankStrains } from '../farming/minor.js';
import { FARMING } from '../farming/farming-config.js';
import { ARCHETYPES, fieldAt, massAt, oddsRank, cellAt, gridPlace, GRID_W, GRID_DW, beastArchetype } from '../farming/history.js';
import { placeMonth, calendarGround, calendarMonth } from '../farming/calendar.js';
import { landPixel } from './climate-view.js';
import { KOPPEN_ID } from '../climate/koppen.js';

export const FARMING_LAYERS = new Set(['farmLand', 'farmStaple', 'farmCrops', 'farmLife', 'farmAnimals', 'farmOrigins', 'farmPeople', 'farmSoil', 'farmSeason']);
export const FARMING_NAMES = { farmLand: 'Farmland', farmStaple: 'Staple food', farmCrops: 'Crops', farmLife: 'Way of life', farmAnimals: 'Animals', farmOrigins: 'Origins', farmPeople: 'People', farmSoil: 'Soil', farmSeason: 'Growing season' };
/** The techniques chosen and the looks (the legend's chips) — every view's, for as long as the page is open. `only`: the
 *  Staple food view's one food shown alone (a Staple, or 0 for all); `life` the Way of life view's lifestyle alone in Simple
 *  (a Lifestyle), `way` its food system alone (a FoodSystem), `simple` the three lifestyles instead; `beast` the Animals
 *  view's one beast alone (a Beast); `origin` the Origins view's look ('larder', 'odds', 'came' or 'from'), `wild` its one archetype alone
 *  (history.js ARCHETYPES, or -1 for all); `foodSeed` the food's seed (FOOD_SEED_MAX: every chance in its history and names; 0
 *  the planet's own) and `fewer` Fewer gaps (every view's luck); `age` what
 *  Staple food, Way of life, Animals and People show: 'k10' what had come 10,000 years after the first farming, 'full' its
 *  full spread, 'best' the best possible (AGES); `named` Staple food and Animals by each place's named crop and beast, `variant`
 *  one of them alone (a strain of the history: farming-store.js namesOf; -1 all; its rungs shown); `cropLook` the Crops view's look ('variety' or a
 *  kind: minor.js KINDS), `crop` one crop alone (an item: farming-store.js minorOf; -1 none), `real` the realism ('earth',
 *  'balanced', 'wild'), `pull` how hard neighbours' Earth likenesses pull ('free', 'regional', 'strict'). */
export const farmOptions = { flood: true, canal: true, terrace: true, raised: true, classes: false, watered: false, only: 0, life: 0, simple: false, way: 0, beast: 0, origin: 'larder', wild: -1, foodSeed: 0, fewer: false, age: 'k10', named: true, variant: -1, cropLook: 'variety', crop: -1, real: 'balanced', pull: 'regional' };
/** The Food options a link keeps, so a shared link shows the same history (F4b): the food's seed, Fewer gaps, the age, the
 *  realism and the pull — only those off their defaults (`food`, `fewer`, `foodage`, `foodreal`, `foodpull`; an older link's
 *  `foodroll` read as the food's seed). */
export const farmLinkParams = () => (farmOptions.foodSeed ? `&food=${farmOptions.foodSeed}` : '') + (farmOptions.fewer ? '&fewer=1' : '') + (farmOptions.age !== 'k10' ? `&foodage=${farmOptions.age}` : '') +
    (farmOptions.real !== 'balanced' ? `&foodreal=${farmOptions.real}` : '') + (farmOptions.pull !== 'regional' ? `&foodpull=${farmOptions.pull}` : '');
/** The food's seed (developer, 2026-11-01: "food roll and names should be just 1 food seed and not just incrementing"): every
 *  chance in the food's history — where and when farming began, each landmass's beasts, which crops grow where, every name —
 *  drawn from the planet's seed and this; 0 the planet's own draw, Re-roll a random one, any typed in the settings. */
export const FOOD_SEED_MAX = 999999;
const randomFoodSeed = () => 1 + Math.floor(Math.random() * FOOD_SEED_MAX);
/** The Food options from a page's link (URLSearchParams). */
export function farmFromLink(url) {
    const r = Number(url.get('food') ?? url.get('foodroll'));
    if (Number.isInteger(r) && r > 0 && r <= FOOD_SEED_MAX) farmOptions.foodSeed = r;
    if (url.get('fewer') === '1') farmOptions.fewer = true;
    const a = url.get('foodage');
    if (a === 'k10' || a === 'full' || a === 'best') farmOptions.age = a;
    const re = url.get('foodreal'), pu = url.get('foodpull');
    if (re === 'earth' || re === 'balanced' || re === 'wild') farmOptions.real = re;
    if (pu === 'free' || pu === 'regional' || pu === 'strict') farmOptions.pull = pu;
}
/** The views shown as it came, and the ages: years after the first farming (Infinity: all that would ever come) — the
 *  owner's, 2026-10-31: "10,000 years by default", and the full spread too. */
export const AS_CAME = new Set(['farmStaple', 'farmLife', 'farmAnimals', 'farmPeople']);
const AGES = { k10: 10000, full: Infinity };
/** What a view shows had come (farming-store.js cameOf), or null — the land's own: the best possible, a view not shown as it
 *  came, or a moment without a history. */
const cameView = (fin, layer, opt = farmOptions) => (AS_CAME.has(layer) && opt.age !== 'best' ? cameOf(fin, opt.foodSeed, opt.fewer, AGES[opt.age] ?? AGES.k10) : null);
/** The options as a key (a picture or a legend made with other options is made again). */
export const farmOptionsKey = () => Object.entries(farmOptions).map(([k, v]) => `${k}=${typeof v === 'string' ? v : +v}`).join(',');
/** The techniques alone as a key: what the farming, the ways of life, the people and the harvest months depend on — the
 *  looks (one alone, Simple, classes) only colour them, so a cache keyed on this survives a look's chip. */
const techKey = () => `${+farmOptions.flood}${+farmOptions.canal}${+farmOptions.terrace}${+farmOptions.raised}`;
/** …and with the luck (the fly's: the ways of life and the beasts depend on it). */
const waysKey = (o = farmOptions) => `${+o.flood}${+o.canal}${+o.terrace}${+o.raised}|${o.foodSeed}|${+o.fewer}`;
export const TECHNIQUE_WORDS = { flood: ['Flood farming', 'Sowing the silt a big river’s flood leaves on its plain (Egypt)'], canal: ['Canals', 'Water led off rivers and lakes onto the land beside them — farther from a bigger river (Mesopotamia)'],
    terrace: ['Terraces', 'Hillsides cut into steps: slopes farmed (the Andes, the rice terraces of Asia)'], raised: ['Raised fields', 'Waterlogged flats drained or built up (the Aztecs’ chinampas)'] };

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const shadeK = kk => 0.45 + 0.55 * (kk - 0.35) / 0.65;          // (the light, as the climate layers take it)
const css = c => `rgb(${c.map(Math.round).join(',')})`;
const SEA = [24, 34, 62], LAKE = [44, 62, 100], ICE = [232, 236, 242], NONE = [120, 120, 126];

// ── the colours: soft ramps, light where little grows (the relief reads through), deep where much does ──
const FARM_RAIN = [[0, [212, 204, 188]], [0.12, [226, 214, 160]], [0.28, [196, 208, 124]], [0.45, [124, 176, 88]], [0.65, [52, 124, 64]], [1, [22, 86, 50]]];
// (water brought: an oasis's aqua-green — brighter than the rivers' blue, so a watered valley reads as land, not water)
const FARM_WATER = [[0, [212, 204, 188]], [0.12, [204, 230, 212]], [0.28, [150, 220, 194]], [0.45, [74, 198, 168]], [0.65, [26, 166, 146]], [1, [10, 128, 118]]];
const SOIL = [[0, [226, 210, 178]], [0.25, [216, 190, 140]], [0.5, [182, 136, 88]], [0.75, [124, 84, 54]], [1, [68, 46, 36]]];
const SEASON = [[0, [214, 206, 192]], [1.5, [232, 214, 150]], [3, [206, 214, 122]], [5, [140, 188, 98]], [8, [64, 148, 86]], [12, [22, 98, 72]]];
// the staple foods (by their code, farming.js STAPLES): a hue each, earthy rather than loud (paddy grains jade, cool-season
// grains straw-gold, warm-season terracotta, roots plum, livestock sage, fish a slate blue — not the sea's navy — wild
// foods umber, tree and palm crops rose), from a pale ground where it barely feeds a place to most of its hue where it feeds it well
const STAPLE_RGB = [[226, 218, 202], [52, 152, 136], [216, 174, 70], [204, 110, 72], [132, 98, 164], [142, 158, 98], [74, 118, 186], [126, 92, 56], [196, 94, 120]];
// the lifestyles (by their code, living.js LIFESTYLES): farming green, herding ochre, gathering violet
const LIFE_RGB = [[226, 218, 202], [70, 148, 78], [206, 160, 64], [128, 92, 176]];
const STAPLE_PALE = [226, 218, 202], STAPLE_FULL = 0.9;
// the food systems (by their code, living.js FOOD_SYSTEMS): the farms in jade (paddies), teal-blue (irrigated), gold
// (plough and flocks), green (mixed), terracotta (hoe), deep forest (forest gardens), violet (highland) and sand (grain and
// herds); the herders khaki; the foragers slate (settled) and umber (mobile)
const SYSTEM_RGB = [STAPLE_PALE, [52, 152, 136], [40, 150, 190], [214, 172, 64], [96, 150, 70], [200, 96, 64], [36, 100, 64], [130, 110, 184], [226, 160, 120], [160, 150, 90], [74, 118, 186], [126, 92, 56]];
// the beasts (by their code, beasts.js BEASTS): cattle brown, small stock wheat, the horse plum, the camel sand-orange, the
// high-country beast blue, the tundra deer teal, the pig pink, the buffalo slate
// the wild larder's variety (crops 1, beasts ½ each: up to ~6 within reach) from pale through sage to deep teal; the hearth odds from
// pale through amber and rust to deep crimson
const VARIETY = [[0, [226, 218, 202]], [0.8, [226, 214, 170]], [2, [188, 200, 124]], [3.2, [112, 164, 104]], [4.4, [46, 120, 100]], [5.6, [22, 76, 82]]];
// when farming came (years after the first): deep teal at the hearths, through sage and straw to pale sand at 10,000 and
// after; the hearths' own colours (from which hearth), one each, the later the paler
const ARRIVE = [[0, [22, 74, 72]], [2000, [42, 120, 104]], [4000, [104, 162, 112]], [6000, [178, 196, 120]], [8000, [226, 210, 148]], [10000, [238, 222, 186]]];
const NEVER = [206, 204, 198];
const HEARTH_RGB = [[226, 86, 62], [52, 138, 204], [236, 178, 40], [110, 184, 76], [168, 92, 190], [36, 176, 168], [232, 118, 168], [150, 108, 60], [92, 96, 206], [196, 196, 64], [70, 158, 110], [220, 138, 88], [108, 160, 222], [178, 60, 110], [96, 198, 198]];
const hearthRGB = n => HEARTH_RGB[(n - 1) % HEARTH_RGB.length];
/** A grid field of times (Infinity where never) read at (lat, lon): bilinear over the corners that have one; Infinity where
 *  none does. */
function timeAt(G, f, lat, lon) {
    const gy = Math.min(G.h - 1.0001, Math.max(0, (90 - lat) / G.deg - 0.5)), gx = (lon + 180) / G.deg - 0.5;
    const j = Math.floor(gy), i = Math.floor(gx), ty = gy - j, tx = gx - i, a = ((i % G.w) + G.w) % G.w, b = (a + 1) % G.w, j1 = Math.min(G.h - 1, j + 1);
    let s = 0, wt = 0;
    const add = (c, k) => { const v = f[c]; if (v < Infinity && k > 0) { s += v * k; wt += k; } };
    add(j * G.w + a, (1 - tx) * (1 - ty)); add(j * G.w + b, tx * (1 - ty)); add(j1 * G.w + a, (1 - tx) * ty); add(j1 * G.w + b, tx * ty);
    return wt > 0 ? s / wt : Infinity;
}
// ── the history's grid read smoothly (history.js GRID_SIGMA: each of the 4 × 4 cells round a point a Gaussian say) ──
const GP = {}, VS = { a: -1, b: -1, sayA: 0, sayB: 0, say: 0, t: Infinity, tb: Infinity, gx: 0, gy: 0 };
const vSay = new Float64Array(64), vSt = new Float64Array(64), vSw = new Float64Array(64), vXt = new Float64Array(64), vXw = new Float64Array(64), vYt = new Float64Array(64), vYw = new Float64Array(64);
const vStamp = new Int32Array(64), vUsed = new Int32Array(16);
let stamp = 0;
/** The class with the most say round (lat, lon) on the history's grid G — each cell's class from `klass` (0…63; −1 not
 *  counted: the sea) — into VS: the winner `a` and the runner-up `b` with their says, the time of each (`time` blended over
 *  its cells by their say, Infinity skipped) and the winner's time's rate east and south (gx, gy: years a cell); false where
 *  no cell round it counts. */
function gridVote(G, klass, time, lat, lon) {
    gridPlace(G, lat, lon, GP);
    const w = G.w;
    let n = 0, tot = 0;
    stamp++;
    for (let dy = 0; dy < 4; dy++) {
        const j = GP.j0 + dy;
        if (j < 0 || j >= G.h) continue;
        const wy = GRID_W[GP.qy + dy], dwy = GRID_DW[GP.qy + dy];
        for (let dx = 0; dx < 4; dx++) {
            const c = j * w + ((GP.i0 + dx) % w + w) % w, k = klass[c];
            if (k < 0) continue;
            if (vStamp[k] !== stamp) { vStamp[k] = stamp; vUsed[n++] = k; vSay[k] = vSt[k] = vSw[k] = vXt[k] = vXw[k] = vYt[k] = vYw[k] = 0; }
            const wx = GRID_W[GP.qx + dx], s = wx * wy, t = time[c];
            vSay[k] += s; tot += s;
            if (t < Infinity) { const sx = GRID_DW[GP.qx + dx] * wy, sy = wx * dwy; vSt[k] += s * t; vSw[k] += s; vXt[k] += sx * t; vXw[k] += sx; vYt[k] += sy * t; vYw[k] += sy; }
        }
    }
    if (!n) return false;
    let a = vUsed[0], b = -1;
    for (let m = 1; m < n; m++) { const k = vUsed[m]; if (vSay[k] > vSay[a]) { b = a; a = k; } else if (b < 0 || vSay[k] > vSay[b]) b = k; }
    const sw = vSw[a];
    VS.a = a; VS.b = b; VS.sayA = vSay[a]; VS.sayB = b >= 0 ? vSay[b] : 0; VS.say = tot;
    VS.t = sw > 0 ? vSt[a] / sw : Infinity; VS.tb = b >= 0 && vSw[b] > 0 ? vSt[b] / vSw[b] : Infinity;
    VS.gx = sw > 0 ? (vXt[a] * sw - vSt[a] * vXw[a]) / (sw * sw) : 0; VS.gy = sw > 0 ? (vYt[a] * sw - vSt[a] * vYw[a]) / (sw * sw) : 0;
    return true;
}
/** Each cell's class for the history's looks, once per run: `came` 1 where farming came, 0 never; `from` its primary hearth's
 *  number (1…62), 63 a centre of its own that no hearth's farming reached first, 0 never — the sea −1. */
const klasses = new WeakMap();
function klassOf(G, run) {
    let K = klasses.get(run);
    if (K) return K;
    const N = G.w * G.h, came = new Int8Array(N), from = new Int8Array(N);
    for (let c = 0; c < N; c++) {
        if (!G.land[c]) { came[c] = from[c] = -1; continue; }
        came[c] = run.farmTime[c] < Infinity ? 1 : 0;
        const f = run.farmFrom[c], root = f >= 0 ? run.centres[run.centres[f].root] : null;
        from[c] = !root ? 0 : root.hearth ? Math.min(62, root.hearth) : 63;
    }
    K = { came, from };
    klasses.set(run, K);
    return K;
}
/** When farming came's colour (into c) for a class and time; From which hearth's. */
function cameColour(k, t, c) {
    if (k === 1 && t < Infinity) return ramp(ARRIVE, t, c);
    c[0] = NEVER[0]; c[1] = NEVER[1]; c[2] = NEVER[2];
    return c;
}
const OWN = [196, 186, 168];
function fromColour(k, t, c) {
    if (k >= 1 && k <= 62) { const h = hearthRGB(k), f = 0.9 - 0.45 * smooth(0, 10000, t < Infinity ? t : 10000); for (let s = 0; s < 3; s++) c[s] = STAPLE_PALE[s] + (h[s] - STAPLE_PALE[s]) * f; return c; }
    const n = k === 63 ? OWN : NEVER;
    c[0] = n[0]; c[1] = n[1]; c[2] = n[2];
    return c;
}
const ODDS = [[0, [226, 218, 202]], [0.12, [236, 216, 166]], [0.3, [230, 176, 102]], [0.55, [206, 112, 66]], [0.8, [156, 52, 54]], [1, [104, 24, 52]]];
const BEAST_RGB = [STAPLE_PALE, [150, 92, 62], [200, 180, 110], [130, 88, 156], [222, 156, 72], [92, 118, 176], [86, 150, 146], [214, 122, 142], [88, 88, 98]];
// people a km² (on a log scale): pale where few could live, through straw and amber to a deep crimson where the land
// could feed the most — the densest river plains
const PEOPLE = [[0, [216, 210, 198]], [1, [228, 220, 190]], [5, [228, 206, 154]], [20, [216, 170, 108]], [60, [186, 110, 74]], [150, [120, 50, 62]]];
const PEOPLE_LOG = PEOPLE.map(([v, c]) => [Math.log10(1 + v), c]);
const MONTH_WORDS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const CLASS_WORDS = ['Barren', 'Poor', 'Fair', 'Good', 'Excellent'];
const CLASS_AT = [0.05, 0.22, 0.38, 0.55, 0.78];                 // (each class's colour: the ramp at its middle)
function ramp(stops, v, out) {
    if (v <= stops[0][0]) { for (let i = 0; i < 3; i++) out[i] = stops[0][1][i]; return out; }
    for (let s = 1; s < stops.length; s++) {
        if (v > stops[s][0] && s < stops.length - 1) continue;
        const [a, ca] = stops[s - 1], [b, cb] = stops[s], t = Math.max(0, Math.min(1, (v - a) / (b - a)));
        for (let i = 0; i < 3; i++) out[i] = ca[i] + (cb[i] - ca[i]) * t;
        return out;
    }
    return out;
}
const gradient = stops => `linear-gradient(90deg, ${stops.map(([v, c]) => `${css(c)} ${(100 * (v - stops[0][0]) / (stops.at(-1)[0] - stops[0][0])).toFixed(0)}%`).join(', ')})`;

/** The people a finished moment's whole land could feed with the options, each place by its way of life (living.js),
 *  worked out once per moment and options. */
const peopleCache = new WeakMap();
function peopleOf(fin, C = null) {
    const F = fin?.raster?.farming, L = fin?.climate?.raster;
    if (!hasHarvests(F) || !L) return null;
    const key = `${techKey()}${C ? `|${C.key}` : ''}`, kept = peopleCache.get(F);
    if (kept?.key === key) return kept.count;
    const out = {}, count = livingPeople(F, L, groundOf(fin), farmOptions, undefined, undefined, undefined, C ? (lat, lon) => cameAt(C, lat, lon, out) : null);
    peopleCache.set(F, { key, count });
    return count;
}
/** A pixel's own harvest month (farming/calendar.js placeMonth: 0…11, MONTH_ALL_YEAR; -1 where nobody farms — herders and
 *  gatherers keep no harvest), from its farming r and way of life lv (placeAt's and livingAt's, which must have run). */
const harvestMonthAt = (F, i, r, lv) => (lv.lifestyle === Lifestyle.FARMING && hasMonths(F) ? placeMonth(F, i, r) : -1);
/** A finished moment's harvest months read over each neighbourhood (farming/calendar.js calendarGround), once per moment
 *  and options. */
const calendarCache = new WeakMap();
function calendarOf(fin) {
    const F = fin?.raster?.farming, K = fin?.climate?.raster;
    if (!hasMonths(F) || !K) return null;
    const key = techKey(), kept = calendarCache.get(F);
    if (kept?.key === key) return kept.ground;
    const p = {}, r = { scores: new Float64Array(STAPLES.length), foods: new Float64Array(STAPLES.length) }, e = new Float64Array(2 * CROPS.length), g = {}, lv = {}, ground0 = groundOf(fin), kef = KOPPEN_ID.EF;
    const ground = calendarGround(F.w, F.h, (x, y) => {
        const i = y * F.w + x;
        if (!K.koppen[i] || K.koppen[i] === kef) return -1;
        placeAt(F, i, p, e, farmOptions, r);
        livingAt(F, i, 90 - (y + 0.5) / F.h * 180, (x + 0.5) / F.w * 360 - 180, p, r, ground0, farmOptions, g, lv);
        return harvestMonthAt(F, i, r, lv);
    });
    calendarCache.set(F, { key, ground });
    return ground;
}
/** The fly belt's hatching: thin lines the other way from the stripes, ~0.8° apart on the texture. */
const hatch = (x, y, W) => { const P = Math.max(5, Math.round(W / 450)); return ((x - y) % P + P) % P < Math.max(1, P >> 2); };
/** An archetype's colour (history.js ARCHETYPES: a crop's its staple's, a beast's its own) at a niche's strength (0…1). */
function archetypeColour(a, v, c) {
    const A = ARCHETYPES[a], h = A.beast ? BEAST_RGB[A.beast] : STAPLE_RGB[CROP_STAPLE[A.crop]], t = STAPLE_FULL * smooth(0.1, 0.8, v);
    for (let i = 0; i < 3; i++) c[i] = STAPLE_PALE[i] + (h[i] - STAPLE_PALE[i]) * t;
    return c;
}
/** A food system's colour (into c), stronger where it feeds more (lg: log10(1 + people a km²)) — pale where few could live. */
function systemColour(sys, lg, c) {
    const t = sys ? 0.5 + 0.4 * smooth(0, 1.5, lg) : 0, h = SYSTEM_RGB[sys];
    for (let i = 0; i < 3; i++) c[i] = STAPLE_PALE[i] + (h[i] - STAPLE_PALE[i]) * t;
    return c;
}
/** A beast's colour (into c), stronger the better it is kept there (0…1). */
function beastColour(b, keep, c) {
    const t = b ? 0.3 + 0.6 * smooth(0.15, 0.8, keep) : 0, h = BEAST_RGB[b];
    for (let i = 0; i < 3; i++) c[i] = STAPLE_PALE[i] + (h[i] - STAPLE_PALE[i]) * t;
    return c;
}
/** The stripes of a second food or way of life where it does nearly as well: a band a quarter of each period, ~1.4° of
 *  the texture's width. */
const stripe = (x, y, W) => { const P = Math.max(4, Math.round(W / 256)); return (x + y) % P < Math.max(1, P >> 2); };
/** A way of life's colour (into c), stronger where it feeds more (lg: log10(1 + people a km²)) — pale where few could live. */
function lifeColour(life, lg, c) {
    const t = life ? 0.5 + 0.4 * smooth(0, 1.5, lg) : 0, h = LIFE_RGB[life];
    for (let i = 0; i < 3; i++) c[i] = STAPLE_PALE[i] + (h[i] - STAPLE_PALE[i]) * t;
    return c;
}
/** One way of life alone (into c): how many it could feed at a place, on its own scale — a log scale from its own few
 *  (LIFE_FEW: farming's 1 a km², herding's 0.1, gathering's 0.05) to the most it ever could (farming ~60, herding ~2,
 *  gathering ~3): pale where few, its hue where the most. */
const LIFE_MOST = [1, 60, 2, 3], LIFE_FEW = [1, 1, 0.1, 0.05];
function lifeAloneColour(life, people, c) {
    const f = LIFE_FEW[life], t = STAPLE_FULL * smooth(0, 1, Math.log10(1 + people / f) / Math.log10(1 + LIFE_MOST[life] / f)), h = LIFE_RGB[life];
    for (let i = 0; i < 3; i++) c[i] = STAPLE_PALE[i] + (h[i] - STAPLE_PALE[i]) * t;
    return c;
}
// ── named crops and animals (F5a) ──
const rgbHsl = ([r, g, b]) => {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (!d) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1)), h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [60 * h, s, l];
};
const hslRgb = (h, s, l) => { const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); return [255 * f(0), 255 * f(8), 255 * f(4)]; };
/** Each strain's colour (names: farming-store.js namesOf), once per names: its archetype's — a crop group's staple colour, a
 *  beast's — turned round the hue wheel by its rank among its kind's strains, the first tamed keeping its archetype's own,
 *  then ±16°, ±32°, ±48° (a little lighter and darker in turn), and past seven the same hues lighter or darker. */
const strainColourCache = new WeakMap();
function strainColours(N) {
    let out = strainColourCache.get(N);
    if (out) return out;
    out = new Array(N.strains.length);
    const rank = new Map();
    for (const s of [...N.strains].sort((x, y) => x.t0 - y.t0)) {
        const k = rank.get(s.a) ?? 0;
        rank.set(s.a, k + 1);
        const A = ARCHETYPES[s.a], base = A.beast ? BEAST_RGB[A.beast] : STAPLE_RGB[CROP_STAPLE[A.crop]], [h, sat, l] = rgbHsl(base);
        // (the hue kept within ±48° of its archetype's, so a crop still reads as its kind; past seven, lighter and darker turns)
        const j = k % 7, round = Math.floor(k / 7), step = Math.ceil(j / 2), sign = j % 2 ? 1 : -1, dl = round === 0 ? 0 : round % 2 ? 0.11 : -0.11;
        out[s.id] = hslRgb((h + sign * 16 * step + 720) % 360, Math.min(0.85, sat + (k ? 0.05 : 0)), Math.min(0.74, Math.max(0.28, l + dl + (j ? (j % 4 < 2 ? 0.04 : -0.04) : 0))));
    }
    strainColourCache.set(N, out);
    return out;
}
/** A named crop's or animal's colour (into c) at a strength (0…1): its own hue, pale where it does poorly. */
function namedColour(h, t, c) {
    for (let i = 0; i < 3; i++) c[i] = STAPLE_PALE[i] + (h[i] - STAPLE_PALE[i]) * t;
    return c;
}
/** The named view of Staple food or Animals: its strains' names, colours and each place's strain (farming-store.js
 *  variantsOf, from the places P and ways Y as shown) — null when not named, or without a history. */
function namedView(fin, layer, opt, P, Y) {
    if (!opt.named || (layer !== 'farmStaple' && layer !== 'farmAnimals') || !P) return null;
    const run = hearthsOf(fin, opt.foodSeed, opt.fewer), N = run && namesOf(fin, opt.foodSeed, opt.fewer, opt.pull, 0, opt.real);
    if (!N) return null;
    const age = opt.age === 'k10' ? AGES.k10 : opt.age === 'full' ? Infinity : null, S = strainsOf(fin, opt.foodSeed, opt.fewer, age);
    if (!S) return null;
    return { run, N, S, rgb: strainColours(N), age, V: variantsOf(fin, P, layer === 'farmAnimals' ? Y : null, S, age) };
}
/** The strain picked in a named view (farmOptions.variant) when it is of the view's kind — a crop's on Staple food, a beast's
 *  on Animals; −1 none. */
const pickedOf = (nv, layer, v = farmOptions.variant) => (nv && v >= 0 && nv.N.strains[v] && (nv.N.strains[v].a < CROPS.length) === (layer === 'farmStaple') ? v : -1);
/** Each 1° cell's crop groups (or beasts) at a named view's age, for a strain's rungs: `grank` (each group's rank there, 0 the
 *  best; −1 none) and `ids` (its varieties there, the main first; −1 none), NG groups a cell; and each strain's share of the
 *  land where it is grown at all (`grown`) — once per ranks and kind. A group come on the frontier before any variety of it
 *  (strainsOf's) ranks after the rest, by the variety that comes to hold it. */
const groupTables = new WeakMap();
function groupTable(nv, kind) {
    const R = nv.S.R, beasts = kind === 'beast';
    let per = groupTables.get(R);
    if (!per) { per = {}; groupTables.set(R, per); }
    if (per[kind]) return per[kind];
    const { SP, Gm } = nv.S, N = Gm.N, NC = CROPS.length, a0 = beasts ? NC : 0, NG = beasts ? ARCHETYPES.length - NC : NC;
    const ab = nv.age === null ? -1 : nv.age === Infinity ? ARRIVE_NEVER - 1 : arriveByte(nv.age);
    const grank = new Int8Array(N * NG).fill(-1), ids = new Int16Array(3 * N * NG).fill(-1), grown = new Float64Array(nv.N.strains.length);
    let land = 0;
    for (let c = 0; c < N; c++) {
        if (!Gm.land[c]) continue;
        land += Gm.area[c];
        const list = rankStrains(SP, Gm, c, ab, beasts, FARMING.lateYears);
        let r = 0;
        for (const G of list) {
            const o = c * NG + G.a - a0;
            grank[o] = r++;
            for (let k = 0; k < 3 && k < G.strains.length; k++) { const id = G.strains[k].id; ids[3 * o + k] = id; grown[id] += Gm.area[c]; }
        }
        for (let g = 0; g < NG; g++) {
            const o = c * NG + g, id = R.group[a0 + g][c];
            if (grank[o] >= 0 || id < 0) continue;
            grank[o] = r++; ids[3 * o] = id; grown[id] += Gm.area[c];
        }
    }
    for (let k = 0; k < grown.length; k++) grown[k] /= Math.max(1, land);
    return (per[kind] = { NG, a0, grank, ids, grown });
}
/** A picked strain's rung at a pixel (developer, 2026-11-01: a crop's "full spread/where is it primary, secondary or tertiary
 *  in rungs"): 1 the place's main crop (or beast), 2 and 3 the next groups' main varieties, 4 grown there otherwise (a lesser
 *  variety, or its group ranked lower); 0 not grown — the rung with the most say among the 1° cells round it (history.js
 *  gridPlace: a Gaussian say, every edge a rounded curve), the pixel's own main group `mainG` (its index among the kind's
 *  groups; −1 none) left out of the count. `T` groupTable's, `g` the strain's group. */
const GPu = {}, uSay = new Float64Array(5);
function rungAt(T, Gm, s, g, x, y, W, mainG) {
    gridPlace(Gm, 90 - (y + 0.5) / (W >> 1) * 180, (x + 0.5) / W * 360 - 180, GPu);
    uSay.fill(0);
    const { NG, grank, ids } = T;
    for (let dy = 0; dy < 4; dy++) {
        const j = GPu.j0 + dy;
        if (j < 0 || j >= Gm.h) continue;
        const wy = GRID_W[GPu.qy + dy];
        for (let dx = 0; dx < 4; dx++) {
            const c = j * Gm.w + ((GPu.i0 + dx) % Gm.w + Gm.w) % Gm.w;
            if (!Gm.land[c]) continue;
            const o = c * NG + g, gr = grank[o];
            let r = 0;
            if (gr >= 0) {
                const k = ids[3 * o] === s ? 0 : ids[3 * o + 1] === s || ids[3 * o + 2] === s ? 1 : -1;
                if (k > 0) r = 4;
                else if (k === 0) {
                    if (g === mainG) r = 1;
                    else { const mr = mainG >= 0 ? grank[c * NG + mainG] : -1; r = Math.min(4, 2 + gr - (mr >= 0 && mr < gr ? 1 : 0)); }
                }
            }
            uSay[r] += wy * GRID_W[GPu.qx + dx];
        }
    }
    let top = 0;
    for (let r = 1; r < 5; r++) if (uSay[r] > uSay[top]) top = r;
    return top;
}
/** A rung's colour (into c, and c2 the stripe's): the main crop full, the 2nd and 3rd paler in turn, grown otherwise striped
 *  faintly, pale where not grown — true where striped. */
const RUNG_T = [0, 0.92, 0.56, 0.3];
function rungColour(h, r, c, c2) {
    if (r === 4) { namedColour(h, 0, c); namedColour(h, 0.42, c2); return true; }
    namedColour(h, RUNG_T[r] ?? 0, c);
    return false;
}
/** Each strain's share of the land (by area) as its places' crop or beast — kept per named view's store. */
const variantTallies = new WeakMap();
function variantTally(fin, nv) {
    let T = variantTallies.get(nv.V);
    if (T) return T;
    const F = fin.raster.farming, K = fin.climate.raster, kef = KOPPEN_ID.EF, n = nv.N.strains.length, crop = new Float64Array(n), beast = new Float64Array(n);
    let land = 0, q = 0;
    for (let y = 0; y < F.h; y++) {
        const a = Math.cos((90 - (y + 0.5) / F.h * 180) * Math.PI / 180);
        for (let x = 0, i = y * F.w; x < F.w; x++, i++) {
            if (!K.koppen[i]) continue;
            land += a;
            if (K.koppen[i] === kef) continue;
            const sc = nv.V.crop[q], sb = nv.V.beast[q];
            if (sc >= 0) crop[sc] += a;
            if (sb >= 0) beast[sb] += a;
            q++;
        }
    }
    for (let s = 0; s < n; s++) { crop[s] /= Math.max(1e-9, land); beast[s] /= Math.max(1e-9, land); }
    T = { crop, beast };
    variantTallies.set(nv.V, T);
    return T;
}
/** A strain's words: where it was first tamed and when, its Earth likeness. */
function strainTitle(nv, s) {
    const S = nv.N.strains[s], C = nv.run.centres[S.centre], it = S.item, where = `${Math.abs(C.lat).toFixed(0)}°${C.lat >= 0 ? 'N' : 'S'} ${Math.abs(C.lon).toFixed(0)}°${C.lon >= 0 ? 'E' : 'W'}`;
    const when = S.t0 < 50 ? 'the first farming' : `~${(Math.round(S.t0 / 100) * 100).toLocaleString()} years after the first farming`;
    return `${ARCHETYPES[S.a].word}${it ? ` like ${it.n} (on Earth from ${earthHome(it)})` : ''} — first tamed at ${where}${C.hearth ? ` (hearth ${C.hearth})` : ''}, ${when}`;
}
/** A strain's legend chip (its colour, name and the share of the land it is grown on; a click picks it — its Wikipedia link
 *  then in the pick row: a link on every chip made the list one a line). */
function variantChip(nv, s, share) {
    const S = nv.N.strains[s], on = farmOptions.variant === s;
    return `<span class="evo-farm-var"><button type="button" class="evo-farm-chip evo-farm-staple${on ? ' on' : ''}" data-farm-variant="${s}" aria-pressed="${on}" title="${on ? 'Show them all again' : `${strainTitle(nv, s)} — grown on ${pct(share)} of the land: show where, and where it is the main one`}"><i style="background:${css(nv.rgb[s])}"></i>${S.label} <em>${pct(share)}</em></button></span>`;
}
/** The legend's pick row (developer, 2026-11-01: clicking the chips "moves around so its so hard to quickly toggle"): ‹ and ›
 *  step through the chips listed, in their order, × shows them all again — always in the same place — and a fixed few
 *  lines saying what is shown, so the legend keeps its height whatever is picked (it hangs from the bottom of the screen:
 *  any change of height moved every chip). `key` the option stepped ('variant', 'crop'), `ids` the chips' order. */
function pickRow(key, ids, cur, text, { title = '', lines = 2 } = {}) {
    const btn = (d, w, t, off) => `<button type="button" class="evo-farm-chip evo-farm-step" data-farm-step="${key}" data-step="${d}" data-ids="${ids.join(',')}" title="${t}" aria-label="${t}"${off ? ' disabled' : ''}>${w}</button>`;
    return `<div class="evo-farm-pick">${btn(-1, '‹', 'The one before', !ids.length)}${btn(1, '›', 'The next one', !ids.length)}${btn(0, '×', 'Show them all again', cur < 0)}` +
        `<span class="evo-farm-picked${lines === 3 ? ' three' : ''}" title="${title}">${text}</span></div>`;
}
/** A picked strain's name in the pick row: its colour, its name and its Wikipedia link. */
const pickedName = (nv, s) => { const S = nv.N.strains[s]; return `<i class="evo-farm-sw" style="background:${css(nv.rgb[s])}"></i><b>${S.label}</b>${S.item ? ` <a class="evo-farm-wiki" href="${wiki(S.item)}" target="_blank" rel="noopener" title="${S.item.n} on Wikipedia">↗</a>` : ''}`; };
/** A picked strain's key: its rungs' colours (the main crop or beast, the 2nd, the 3rd, grown otherwise) — or, none picked,
 *  `none` — in a box of one height. */
function rungKey(nv, pick, words, none) {
    if (pick < 0) return `<div class="evo-farm-key">${none}</div>`;
    const h = nv.rgb[pick], c = [0, 0, 0], c2 = [0, 0, 0], sw = (r, w) => {
        const st = rungColour(h, r, c, c2);
        const bg = st ? `repeating-linear-gradient(135deg, ${css(c2)} 0 3px, ${css(c)} 3px 7px)` : css(c);
        return `<span><i style="background:${bg}"></i>${w}</span>`;
    };
    return `<div class="evo-farm-key"><div class="evo-koppen">${[1, 2, 3, 4].map(r => sw(r, words[r - 1])).join('')}</div></div>`;
}
/** A staple's colour (into c) at a strength (0…1): pale where it barely grows, its hue where it grows well. */
function stapleColour(st, score, c) {
    const t = STAPLE_FULL * smooth(0.04, 0.8, score) ** 0.8, h = STAPLE_RGB[st];
    for (let i = 0; i < 3; i++) c[i] = STAPLE_PALE[i] + (h[i] - STAPLE_PALE[i]) * t;
    return c;
}
/** The farmland's colour (into c) from its value with the techniques (v) and by rain alone (vr): green by rain, toward
 *  teal as more of it comes from water brought; or, with `classes`, its class's (`cls`: farming-store.js placesOf's — its
 *  class, 8 where water brought makes half of it). */
function farmColour(v, vr, classes, cls, c, tmp) {
    if (classes) {
        ramp(FARM_RAIN, CLASS_AT[cls & 7], c);
        if (cls & 8) ramp(FARM_WATER, CLASS_AT[cls & 7], c);
        return c;
    }
    const share = v > 0.02 ? Math.max(0, Math.min(1, (v - vr) / v)) : 0;
    ramp(FARM_RAIN, v, c);
    if (share > 0) { ramp(FARM_WATER, v, tmp); for (let i = 0; i < 3; i++) c[i] += (tmp[i] - c[i]) * smooth(0, 0.8, share); }
    return c;
}

// ── the crops beyond the staples and the small animals (F5b: farming/minor.js) ──
/** The crops as the options say (re-roll, Fewer gaps, realism, likeness pull, names' re-roll), and the age they are read at
 *  (years after the first farming; Infinity the full spread; null the best possible). */
const minorNow = (fin, opt = farmOptions) => minorOf(fin, opt.foodSeed, opt.fewer, opt.real, opt.pull, 0);
const cropAge = (opt = farmOptions) => (opt.age === 'best' ? null : opt.age === 'full' ? Infinity : AGES.k10);
const CROP_LOOK_WORDS = { variety: 'Variety', ...Object.fromEntries(KINDS.map(K => [K.key, K.word])) };
/** Each crop's colour, once per catalogue: its kind of niche's (minor.js MINOR) turned round the hue wheel by its place in
 *  that kind (±14° steps, then lighter or darker). */
const itemColourCache = new WeakMap();
function itemColours(items) {
    let out = itemColourCache.get(items);
    if (out) return out;
    out = new Array(items.length);
    const rank = new Map();
    for (const I of items) {
        const k = rank.get(I.m) ?? 0;
        rank.set(I.m, k + 1);
        const [h, s, l] = rgbHsl(MINOR[I.m].rgb), j = k % 7, step = Math.ceil(j / 2), sign = j % 2 ? 1 : -1, dl = Math.floor(k / 7) % 2 ? 0.1 : Math.floor(k / 7) ? -0.1 : 0;
        out[I.id] = hslRgb((h + sign * 14 * step + 720) % 360, Math.min(0.85, s + 0.05), Math.min(0.72, Math.max(0.3, l + dl)));
    }
    itemColourCache.set(items, out);
    return out;
}
const GPm = {}, mSay = new Float64Array(512), mStamp = new Int32Array(512), mUsed = new Int32Array(16), MV = { a: -1, b: -1, sayA: 0, sayB: 0, say: 0 };
let mStampN = 0;
/** A byte field's mean over the land cells round (lat, lon) on the crops' 1° ground, each a Gaussian say (history.js
 *  gridPlace) — NaN where none is land. */
function readLand(Gm, f, lat, lon) {
    gridPlace(Gm, lat, lon, GPm);
    let s = 0, wt = 0;
    for (let dy = 0; dy < 4; dy++) {
        const j = GPm.j0 + dy;
        if (j < 0 || j >= Gm.h) continue;
        const wy = GRID_W[GPm.qy + dy];
        for (let dx = 0; dx < 4; dx++) { const c = j * Gm.w + ((GPm.i0 + dx) % Gm.w + Gm.w) % Gm.w; if (!Gm.land[c]) continue; const w = wy * GRID_W[GPm.qx + dx]; s += w * f[c]; wt += w; }
    }
    return wt > 0 ? s / wt : NaN;
}
/** Two fields read as readLand reads one, in one pass (the same weights): into RL2 [first, second] — NaN where none is land. */
const RL2 = [0, 0];
function readLand2(Gm, f, g, lat, lon) {
    gridPlace(Gm, lat, lon, GPm);
    let s = 0, s2 = 0, wt = 0;
    for (let dy = 0; dy < 4; dy++) {
        const j = GPm.j0 + dy;
        if (j < 0 || j >= Gm.h) continue;
        const wy = GRID_W[GPm.qy + dy];
        for (let dx = 0; dx < 4; dx++) { const c = j * Gm.w + ((GPm.i0 + dx) % Gm.w + Gm.w) % Gm.w; if (!Gm.land[c]) continue; const w = wy * GRID_W[GPm.qx + dx]; s += w * f[c]; s2 += w * g[c]; wt += w; }
    }
    RL2[0] = wt > 0 ? s / wt : NaN; RL2[1] = wt > 0 ? s2 / wt : NaN;
    return RL2;
}
/** The class with the most say round (lat, lon) among the crops' land cells (`arr`: −1 none counts as a class of its own)
 *  — into MV: a, b (the runner-up) and their says; false where none is land. */
function voteLand(Gm, arr, lat, lon) {
    gridPlace(Gm, lat, lon, GPm);
    let n = 0, tot = 0;
    mStampN++;
    for (let dy = 0; dy < 4; dy++) {
        const j = GPm.j0 + dy;
        if (j < 0 || j >= Gm.h) continue;
        const wy = GRID_W[GPm.qy + dy];
        for (let dx = 0; dx < 4; dx++) {
            const c = j * Gm.w + ((GPm.i0 + dx) % Gm.w + Gm.w) % Gm.w;
            if (!Gm.land[c]) continue;
            const k = arr[c] + 1;
            if (k >= 512) continue;
            if (mStamp[k] !== mStampN) { mStamp[k] = mStampN; mSay[k] = 0; mUsed[n++] = k; }
            const w = wy * GRID_W[GPm.qx + dx];
            mSay[k] += w; tot += w;
        }
    }
    if (!n) return false;
    let a = mUsed[0], b = -1;
    for (let m = 1; m < n; m++) { const k = mUsed[m]; if (mSay[k] > mSay[a]) { b = a; a = k; } else if (b < 0 || mSay[k] > mSay[b]) b = k; }
    MV.a = a - 1; MV.b = b < 0 ? -2 : b - 1; MV.sayA = mSay[a]; MV.sayB = b < 0 ? 0 : mSay[b]; MV.say = tot;
    return true;
}
/** A crop's "had come" by an age on each 1° cell (1, else 0: come, on land farming had reached) — kept per crop and age. */
const comeCache = new WeakMap();
function comeOf(MN, id, age) {
    let m = comeCache.get(MN);
    if (!m) { m = new Map(); comeCache.set(MN, m); }
    const key = `${id}|${age}`;
    if (m.has(key)) return m.get(key);
    const B = MN.built[id], out = new Uint8Array(MN.Gm.N), ab = age === null ? 254 : age === Infinity ? ARRIVE_NEVER - 1 : arriveByte(age);
    for (let c = 0; c < out.length; c++) if (MN.Gm.land[c] && (age === null || (B.arrive && B.arrive[c] <= ab && MN.farm[c] <= age && MN.farm[c] < Infinity))) out[c] = 1;
    if (m.size > 12) m.clear();
    m.set(key, out);
    return out;
}
/** A count look's top: the count most farming places stay under (its 95th percentile, at least 3) — kept per age's counts. */
const topCache = new WeakMap();
function countTop(arr) {
    if (topCache.has(arr)) return topCache.get(arr);
    const v = [];
    for (let c = 0; c < arr.length; c++) if (arr[c]) v.push(arr[c]);
    v.sort((x, y) => x - y);
    const top = Math.max(3, v.length ? v[Math.floor(0.95 * (v.length - 1))] : 3);
    topCache.set(arr, top);
    return top;
}
/** A count look's ramp: pale through its kind's colour to darker; Variety's greens. */
const countRamp = (look, top) => {
    if (look === 'variety') return [[0, [226, 218, 202]], [0.12 * top, [222, 214, 168]], [0.3 * top, [176, 196, 120]], [0.5 * top, [96, 156, 104]], [0.75 * top, [40, 110, 96]], [top, [18, 70, 76]]];
    const K = KINDS.find(k => k.key === look), h = K?.rgb ?? [120, 120, 120], mixc = (a, t) => a.map((v, i) => v + (h[i] - v) * t);
    return [[0, [226, 218, 202]], [0.25 * top, mixc([226, 218, 202], 0.45)], [0.6 * top, h], [top, h.map(v => v * 0.55)]];
};
/** A Food view's colours (returned: { c, c2, hd }) at a land pixel i of the farming picture, (x, y) on a picture W wide:
 *  the view's colours before the light — c its own, c2 a second's (striped where it does nearly as well; else c) and hd the
 *  fly belt's darkening of its hatching (1 none) — the ice pale. The stripes and hatching are the drawn picture's
 *  (finishedFarmingColor); Origins, read between the history's cells at (x, y), hatches here. */
function farmPixelColour(layer, fin, W) {
    const F = fin?.raster?.farming, K = fin?.climate?.raster;
    const c = [0, 0, 0], tmp = [0, 0, 0], p = {}, opt = { ...farmOptions }, key = techKey(), kef = KOPPEN_ID.EF, H = W >> 1;
    const C = cameView(fin, layer, opt), flyAt = flyAtOf(fin, opt.foodSeed, opt.fewer), wk = waysKey(opt);
    const Y = layer === 'farmAnimals' || (layer === 'farmLife' && !opt.simple) ? waysOf(fin, opt, wk, flyAt, C, key) : null;
    const P = layer === 'farmSoil' || layer === 'farmSeason' || layer === 'farmOrigins' ? null : placesOf(fin, opt, key, C), ix = P?.index;
    // (Origins: the history's ground and each landmass's luck)
    const G = layer === 'farmOrigins' ? historyOf(fin) : null, luck = G ? luckOf(fin, opt.foodSeed, opt.fewer) : null;
    const run = G && (opt.origin === 'came' || opt.origin === 'from') ? hearthsOf(fin, opt.foodSeed, opt.fewer) : null;
    // (Crops: the crops beyond the staples at the age shown; one alone where chosen — where it had come, and where it would
    // grow but had not)
    const MN = layer === 'farmCrops' ? minorNow(fin, opt) : null, cAge = cropAge(opt), MA = MN ? minorAgeOf(MN, cAge) : null;
    const one = MN && opt.crop >= 0 && MN.items[opt.crop] ? MN.items[opt.crop] : null, oneCome = one ? comeOf(MN, one.id, cAge) : null;
    const look = opt.cropLook, lead = MA ? (look === 'pulse' ? MA.leadPulse : look === 'spice' ? MA.leadSpice : null) : null;
    const counts = MA && !one && !lead ? (look === 'variety' ? MA.variety : MA.count[KINDS.findIndex(K => K.key === look)] ?? MA.variety) : null;
    const cRamp = counts ? countRamp(KINDS.some(K => K.key === look) ? look : 'variety', countTop(counts)) : null, iRGB = MN ? itemColours(MN.items) : null;
    const cellsPx1 = MN ? 360 / (W * MN.Gm.deg) : 1, soft1 = Math.min(1, 1.2 * cellsPx1);
    // (the history's grid cells a drawn pixel spans, and the edge's easing: over about a drawn pixel)
    const cellsPerPx = G ? 360 / (W * G.deg) : 1, edgeSoft = Math.min(1, 1.2 * cellsPerPx);
    // (a chip's one alone: its values, worked out the first time)
    const A = layer === 'farmStaple' && opt.only ? onlyOf(fin, opt, key, opt.only, C)
        : layer === 'farmLife' && !Y && opt.life ? lifeAloneOf(fin, opt, key, opt.life, C)
            : layer === 'farmAnimals' && Y && opt.beast ? beastAloneOf(fin, opt, wk, opt.beast, flyAt, C) : null;
    const pale = () => { c[0] = STAPLE_PALE[0]; c[1] = STAPLE_PALE[1]; c[2] = STAPLE_PALE[2]; };
    const c2 = [0, 0, 0], px = { c, c2, hd: 1 };
    // (named: each place's strain of its staple's crop or its leading beast, and its colour; one alone where chosen)
    const nv = A ? null : namedView(fin, layer, opt, P, Y), alone = pickedOf(nv, layer, opt.variant), kindT = alone >= 0 ? groupTable(nv, layer === 'farmAnimals' ? 'beast' : 'crop') : null;
    const aloneG = alone >= 0 ? nv.N.strains[alone].a - kindT.a0 : -1;
    return (i, x, y) => {
        let two = false;
        px.hd = 1; px.rung = -1;
        if (K.koppen[i] === kef) { c[0] = ICE[0]; c[1] = ICE[1]; c[2] = ICE[2]; }
        else if (layer === 'farmSoil') ramp(SOIL, partsAt(F, i, p).soil, c);
        else if (layer === 'farmSeason') { partsAt(F, i, p); ramp(SEASON, opt.watered ? p.warm : p.rain, c); }
        else if (layer === 'farmCrops') {
            if (!MA) pale();
            else {
                const lat = 90 - (y + 0.5) / H * 180, lon = (x + 0.5) / W * 360 - 180, Gm = MN.Gm;
                if (one) {
                    // (one crop: its colour as it grows well, where it had come; hatched where it would grow but had not)
                    const [f, cm] = readLand2(Gm, one.fit8, oneCome, lat, lon);
                    if (!(f >= GROWN_FIT)) pale();
                    else if (cm >= 0.5) namedColour(iRGB[one.id], 0.35 + 0.55 * smooth(GROWN_FIT, 200, f), c);
                    else { pale(); if (hatch(x, y, W)) { c[0] *= 0.8; c[1] *= 0.8; c[2] *= 0.8; } }
                } else if (lead) {
                    // (the leading pulse or spice, by its own colour; eased into the next over about a drawn pixel)
                    // (no crop land round it: pale, with no easing — the vote's last place is another's)
                    const voted = voteLand(Gm, lead, lat, lon);
                    if (!voted || MV.a < 0) pale(); else namedColour(iRGB[MV.a], 0.85, c);
                    if (voted && MV.b >= -1 && MV.say > 0) {
                        const m = 0.5 + 0.5 * smooth(0, MV.say * soft1, MV.sayA - MV.sayB);
                        if (m < 1) { if (MV.b < 0) { tmp[0] = STAPLE_PALE[0]; tmp[1] = STAPLE_PALE[1]; tmp[2] = STAPLE_PALE[2]; } else namedColour(iRGB[MV.b], 0.85, tmp); for (let s = 0; s < 3; s++) c[s] = c[s] * m + tmp[s] * (1 - m); }
                    }
                } else { const v = readLand(Gm, counts, lat, lon); if (v === v) ramp(cRamp, v, c); else pale(); }
            }
        } else if (layer === 'farmOrigins') {
            // (the history's ground, read between its cells: the hearth odds; one archetype's wild home — a beast's only where
            // its landmass has it, hatched where its habitat is but it does not; or the larder's variety)
            if (!G) pale();
            else {
                const lat = 90 - (y + 0.5) / H * 180, lon = (x + 0.5) / W * 360 - 180;
                if ((opt.origin === 'came' || opt.origin === 'from') && run) {
                    // (read smoothly: the class with the most say round it — farming came or never; or whose hearth — its time
                    // blended over its cells, eased into the next class over about a drawn pixel; When farming came's lines each
                    // thousand where the time is within about half a drawn pixel of one — from its rate, ~1 px wide at any zoom)
                    const came = opt.origin === 'came', K = klassOf(G, run), col = came ? cameColour : fromColour;
                    if (!gridVote(G, came ? K.came : K.from, run.farmTime, lat, lon)) col(0, Infinity, c);
                    else {
                        col(VS.a, VS.t, c);
                        if (VS.b >= 0) {
                            const m = 0.5 + 0.5 * smooth(0, VS.say * edgeSoft, VS.sayA - VS.sayB);
                            if (m < 1) { col(VS.b, VS.tb, tmp); for (let s = 0; s < 3; s++) c[s] = c[s] * m + tmp[s] * (1 - m); }
                        }
                        if (came && VS.a === 1 && VS.t < Infinity) {
                            const k = Math.round(VS.t / 1000), perPx = Math.hypot(VS.gx, VS.gy) * cellsPerPx;
                            if (k >= 1 && perPx > 0) { const ink = 1 - smooth(0.35, 0.85, Math.abs(VS.t - 1000 * k) / perPx); if (ink > 0) { const d = 1 - 0.22 * ink; c[0] *= d; c[1] *= d; c[2] *= d; } }
                        }
                    }
                } else if (opt.origin === 'odds') ramp(ODDS, fieldAt(G, G.odds, lat, lon), c);
                else if (opt.wild >= 0) {
                    const A = ARCHETYPES[opt.wild], v = fieldAt(G, G.niche[opt.wild], lat, lon), m = A.beast ? massAt(G, lat, lon) : 0;
                    const lives = !A.beast || (m >= 0 && luck?.has[m * BEASTS.length + A.beast]);
                    archetypeColour(opt.wild, lives ? v : 0, c);
                    if (!lives && v >= 0.3 && hatch(x, y, W)) { c[0] *= 0.72; c[1] *= 0.72; c[2] *= 0.72; }
                } else ramp(VARIETY, fieldAt(G, G.variety, lat, lon), c);
            }
        } else {
            const q = slotOf(ix, i);
            // (Staple food: one alone — how well it would feed each place — or each place's and how well, a second striped;
            // Way of life: its food system, a second striped, or one alone; Simple: its lifestyle, or how many one alone could
            // feed; Animals: farmers' and herders' leading beast, a second striped — or where one could be kept — the fly belt
            // hatched; People: a km²; Farmland: green by rain, toward aqua as more of it comes from water brought)
            if (layer === 'farmStaple') {
                if (A) stapleColour(opt.only, dec(A[q]), c);
                else {
                    const st = P.staple[q], nd = st >> 4, s = nv ? nv.V.crop[q] : -1;
                    if (alone >= 0) {
                        // (one crop picked: its rung here — the main crop, the 2nd, the 3rd, grown otherwise, or not)
                        let r = s === alone ? 1 : rungAt(kindT, nv.S.Gm, alone, aloneG, x, y, W, STAPLE_CROP[st & 15]);
                        if (r === 1 && s !== alone) r = 4;
                        px.rung = r; two = rungColour(nv.rgb[alone], r, c, c2);
                    } else {
                        // (the main crop; striped where a second does nearly as well — by its own variety where it is a crop)
                        if (s >= 0) namedColour(nv.rgb[s], STAPLE_FULL * smooth(0.04, 0.8, dec(P.score[q])) ** 0.8, c); else stapleColour(st & 15, dec(P.score[q]), c);
                        if (nd) {
                            const g2 = STAPLE_CROP[nd], s2 = nv && g2 >= 0 ? strainVote(nv.S.Gm, nv.S.R.group[g2], 90 - (y + 0.5) / H * 180, (x + 0.5) / W * 360 - 180) : -1;
                            if (s2 >= 0) namedColour(nv.rgb[s2], STAPLE_FULL * smooth(0.04, 0.8, dec(P.score2[q])) ** 0.8, c2); else stapleColour(nd, dec(P.score2[q]), c2);
                            two = true;
                        }
                    }
                }
            } else if (layer === 'farmLife' && !Y) {
                if (A) lifeAloneColour(opt.life, peopleFromLog(decLog(A[q])), c);
                else { const l = P.life[q], nd = l >> 4, lg = decLog(P.people[q]); lifeColour(l & 15, lg, c); if (nd) { lifeColour(nd, lg, c2); two = true; } }
            } else if (layer === 'farmLife') {
                const w = Y.way[q], s1 = w & 15, s2 = w >> 4, lg = decLog(P.people[q]);
                if (opt.way) { systemColour(s1 === opt.way ? opt.way : 0, lg, c); if (s1 !== opt.way && s2 === opt.way) { systemColour(opt.way, lg, c2); two = true; } }
                else { systemColour(s1, lg, c); if (s2) { systemColour(s2, lg, c2); two = true; } }
            } else if (layer === 'farmAnimals') {
                if (!Y) pale();
                else {
                    const b = Y.beast[q], b1 = b & 15, b2 = b >> 4;
                    if (A) { const kp = dec(A[q]); beastColour(kp >= 0.15 ? opt.beast : 0, kp, c); }
                    else if (!(Y.flags[q] & 1)) { pale(); if (alone >= 0) px.rung = 0; }
                    else {
                        const s = nv ? nv.V.beast[q] : -1, t = 0.3 + 0.6 * smooth(0.15, 0.8, dec(Y.keep1[q]));
                        if (alone >= 0) {
                            let r = s === alone ? 1 : rungAt(kindT, nv.S.Gm, alone, aloneG, x, y, W, b1 ? b1 - 1 : -1);
                            if (r === 1 && s !== alone) r = 4;
                            px.rung = r; two = rungColour(nv.rgb[alone], r, c, c2);
                        } else {
                            if (s >= 0) namedColour(nv.rgb[s], t, c); else beastColour(b1, dec(Y.keep1[q]), c);
                            if (b2) {
                                const s2 = nv ? strainVote(nv.S.Gm, nv.S.R.group[beastArchetype(b2)], 90 - (y + 0.5) / H * 180, (x + 0.5) / W * 360 - 180) : -1;
                                if (s2 >= 0) namedColour(nv.rgb[s2], 0.3 + 0.6 * smooth(0.15, 0.8, dec(Y.keep2[q])), c2); else beastColour(b2, dec(Y.keep2[q]), c2);
                                two = true;
                            }
                        }
                    }
                    const fly = dec(Y.fly[q]);
                    if (fly > 0.3) px.hd = 1 - 0.42 * smooth(0.3, 0.7, fly);
                }
            } else if (layer === 'farmPeople') ramp(PEOPLE_LOG, decLog(P.people[q]), c);
            else farmColour(dec(P.tech[q]), dec(P.rain[q]), opt.classes, P.cls[q], c, tmp);
        }
        if (!two) { c2[0] = c[0]; c2[1] = c[1]; c2[2] = c[2]; }
        return px;
    };
}
/** A Food view zoomed in, drawn round its picture's pixels rather than as blocks (developer, 2026-10-31: the Food views
 *  looked "low res", Way of life "crazy blocky"): each pixel's say at a drawn point falls off as a Gaussian `sigma` picture
 *  pixels wide — a step of one pixel voted round, a lone speck voted away, a patch of two or more kept; the edge between
 *  two colours eased over about one drawn pixel (`soft`: the share of the whole say eased, per picture pixel a drawn one
 *  spans). */
export const VOTE = { sigma: 0.6, soft: 1.2 };
/** A Food view's colours before the light at every land pixel of the farming picture (farmPixelColour's: `pri` its own and
 *  `sec` the stripe's, 3 bytes a pixel each; `hd` the fly's darkening, 255 none), worked out once per view and its options —
 *  the last kept. Not Origins (drawn per pixel). */
const buffers = new WeakMap();
function farmColourBuffer(layer, fin) {
    const F = fin.raster.farming, K = fin.climate.raster, key = `${layer}|${farmOptionsKey()}`, kept = buffers.get(F);
    if (kept?.key === key) return kept.buf;
    const pix = farmPixelColour(layer, fin, F.w), n = F.w * F.h, buf = { pri: new Uint8ClampedArray(3 * n), sec: new Uint8ClampedArray(3 * n), hd: new Uint8ClampedArray(n), rungs: null };
    // (and a picked crop's or beast's share of the land at each rung: farmPixelColour's px.rung)
    const rungs = new Float64Array(5);
    let land = 0;
    for (let y = 0; y < F.h; y++) for (let x = 0, i = y * F.w, a = Math.cos((90 - (y + 0.5) / F.h * 180) * Math.PI / 180); x < F.w; x++, i++) {
        if (!K.koppen[i]) continue;
        const { c, c2, hd, rung } = pix(i, x, y);
        land += a;
        if (rung >= 0) rungs[rung] += a;
        buf.pri[3 * i] = c[0]; buf.pri[3 * i + 1] = c[1]; buf.pri[3 * i + 2] = c[2];
        buf.sec[3 * i] = c2[0]; buf.sec[3 * i + 1] = c2[1]; buf.sec[3 * i + 2] = c2[2];
        buf.hd[i] = Math.round(255 * hd);
    }
    if (rungs.some(v => v > 0)) buf.rungs = rungs.map(v => v / Math.max(1e-9, land));
    buffers.set(F, { key, buf });
    return buf;
}
/** The vote's scratch (one painter at a time): up to sixteen groups of the pixels round a point — their say, weighted colour
 *  and first colour — the Gaussian's weights along x and y, and the colour voted. */
const NEAR = 48 * 48, gw = new Float64Array(16), gr = new Float64Array(16), gg = new Float64Array(16), gb = new Float64Array(16);
const cr = new Float64Array(16), cg = new Float64Array(16), cb = new Float64Array(16), wx = new Float64Array(4), wy = new Float64Array(4), voted = [0, 0, 0];
/** The colour voted at (fx, fy) on the farming picture (its pixels' centres at whole numbers; x wraps) from the 4 × 4 land
 *  pixels of `buf` round it — darkened by the fly's hatching (`hdA`) where `h` — into `voted`; false where none is land. Each
 *  pixel's say is the Gaussian's at its distance (s2i: 1 / 2σ²); shades of one class (within NEAR of a group's first) count
 *  together and are blended; the group with the most say is drawn, eased into the next where their says are within `soft`
 *  of the whole. */
function voteAt(K, Fw, Fh, buf, hdA, h, fx, fy, s2i, soft) {
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    for (let d = 0; d < 4; d++) { const ex = d - 1 - tx, ey = d - 1 - ty; wx[d] = Math.exp(-ex * ex * s2i); wy[d] = Math.exp(-ey * ey * s2i); }
    let n = 0, wt = 0;
    for (let dy = 0; dy < 4; dy++) {
        const yy = y0 + dy - 1;
        if (yy < 0 || yy >= Fh) continue;
        for (let dx = 0; dx < 4; dx++) {
            const q = yy * Fw + ((x0 + dx - 1) % Fw + Fw) % Fw, w = wy[dy] * wx[dx];
            if (!K.koppen[q]) continue;
            const f = h ? hdA[q] / 255 : 1, qr = buf[3 * q] * f, qg = buf[3 * q + 1] * f, qb = buf[3 * q + 2] * f;
            let k = 0;
            for (; k < n; k++) { const er = cr[k] - qr, eg = cg[k] - qg, eb = cb[k] - qb; if (er * er + eg * eg + eb * eb <= NEAR) break; }
            if (k === n) { cr[n] = qr; cg[n] = qg; cb[n] = qb; gw[n] = gr[n] = gg[n] = gb[n] = 0; n++; }
            gw[k] += w; gr[k] += w * qr; gg[k] += w * qg; gb[k] += w * qb; wt += w;
        }
    }
    if (!(wt > 0)) return false;
    let a = 0, s2 = -1;
    for (let k = 1; k < n; k++) if (gw[k] > gw[a]) { s2 = a; a = k; } else if (s2 < 0 || gw[k] > gw[s2]) s2 = k;
    let r = gr[a] / gw[a], g = gg[a] / gw[a], b = gb[a] / gw[a];
    if (s2 >= 0) {
        const m = 0.5 + 0.5 * smooth(0, wt * soft, gw[a] - gw[s2]), ws = gw[s2];
        r = r * m + gr[s2] / ws * (1 - m); g = g * m + gg[s2] / ws * (1 - m); b = b * m + gb[s2] / ws * (1 - m);
    }
    voted[0] = r; voted[1] = g; voted[2] = b;
    return true;
}
/** paintFinished's colorAt for a farming view, on a texture `W` wide (finish-view.js): the view's colours (farmColourBuffer's),
 *  lit by the finished relief; the sea dark, lakes water, ice pale — each place read from what the store keeps
 *  (farming-store.js: worked out once per moment and techniques), so a chip, a view or a zoomed-in tile only recolours. Past
 *  the farming picture's own pixels — the detail tiles zoomed in, a big export — voted at each drawn point (VOTE), so a
 *  boundary follows a smooth curve between the pixels, not blocks; at its own size or smaller each pixel as it is (voting
 *  there too cost ~0.3 s a view at 4096 px — 60–90 % of the land's pixels sit by another colour). The stripes and the fly's hatching are the drawn picture's own (a point on a stripe takes the pixels' second
 *  colours), so they stay fine lines at any zoom. Origins, a field read between the history's cells, is worked out at each
 *  drawn pixel. */
export function finishedFarmingColor(layer, fin, W) {
    const F = fin?.raster?.farming, K = fin?.climate?.raster;
    if (!F || !K) return (out, o, x, y, wet, kk) => { const k = shadeK(kk); const c = wet ? SEA : NONE; out[o] = c[0] * k; out[o + 1] = c[1] * k; out[o + 2] = c[2] * k; out[o + 3] = 255; };
    if (layer === 'farmOrigins' || layer === 'farmCrops') {
        const pix = farmPixelColour(layer, fin, W);
        return (out, o, x, y, wet, kk, k3, v, lake) => {
            const k = shadeK(kk);
            if (wet || lake === 1 || lake === 2) { const s = wet ? SEA : LAKE; out[o] = s[0] * k; out[o + 1] = s[1] * k; out[o + 2] = s[2] * k; out[o + 3] = 255; return; }
            const i = landPixel(K, W, x, y);
            if (i < 0) { out[o] = NONE[0] * k; out[o + 1] = NONE[1] * k; out[o + 2] = NONE[2] * k; out[o + 3] = 255; return; }
            const c = pix(i, x, y).c;
            out[o] = Math.min(255, c[0] * k); out[o + 1] = Math.min(255, c[1] * k); out[o + 2] = Math.min(255, c[2] * k); out[o + 3] = 255;
        };
    }
    const B = farmColourBuffer(layer, fin), Fw = F.w, Fh = F.h, mag = W > Fw, sc = Fw / W, hatched = layer === 'farmAnimals';
    const s2i = 1 / (2 * VOTE.sigma * VOTE.sigma), soft = Math.min(1, VOTE.soft * sc);
    return (out, o, x, y, wet, kk, k3, v, lake) => {
        const k = shadeK(kk);
        if (wet || lake === 1 || lake === 2) { const s = wet ? SEA : LAKE; out[o] = s[0] * k; out[o + 1] = s[1] * k; out[o + 2] = s[2] * k; out[o + 3] = 255; return; }
        // (this pixel's pattern: on a stripe, the second colours; on the fly's hatching, darkened)
        const st = stripe(x, y, W), h = hatched && hatch(x, y, W);
        let r, g, b;
        if (mag && voteAt(K, Fw, Fh, st ? B.sec : B.pri, B.hd, h, (x + 0.5) * sc - 0.5, Math.min(Fh - 1, Math.max(0, (y + 0.5) * sc - 0.5)), s2i, soft)) { r = voted[0]; g = voted[1]; b = voted[2]; }
        else {
            const i = landPixel(K, W, x, y);
            if (i < 0) { out[o] = NONE[0] * k; out[o + 1] = NONE[1] * k; out[o + 2] = NONE[2] * k; out[o + 3] = 255; return; }
            const buf = st ? B.sec : B.pri, f = h ? B.hd[i] / 255 : 1;
            r = buf[3 * i] * f; g = buf[3 * i + 1] * f; b = buf[3 * i + 2] * f;
        }
        out[o] = Math.min(255, r * k); out[o + 1] = Math.min(255, g * k); out[o + 2] = Math.min(255, b * k); out[o + 3] = 255;
    };
}

/** A farming quantity as a number at a pixel of a picture `W` wide, for the export's data maps (export.js) — NaN off the
 *  land: `farmTech` and `farmRain` farmland (0…1, the Farmland view's ramp) with the techniques chosen and by rain alone,
 *  `people` a km² (as the People view), `soil` its fertility (0…1), `seasonRain` and `seasonWatered` the growing season
 *  (months), `staple` the staple food (a Staple; 0 nothing), `lifestyle` the way of life (a Lifestyle; 0 uninhabited),
 *  `foodSystem` its food system (a FoodSystem; 0 uninhabited), `beast` the leading beast of its farmers or herders (a Beast;
 *  0 none), `flyBelt` the fly belt (0…1), `larderVariety` the wild larder's variety (crops 1, beasts ½), `hearthOdds` the hearth
 *  odds (0…1), `farmCame` the years after the first farming that it came (CAME_NEVER never) — the ice farms nothing; each read
 *  from the store as the views are (people, staple, lifestyle, food system and beast as it came, with the age chosen). */
/** "When farming came"'s never, as data: above every arrival (the history stops 80,000 years after the first farming), the
 *  top of its export's scale (export.js FARM_SCALES.came). */
export const CAME_NEVER = 131070;
export function finishedFarmingValue(key, fin, W) {
    const F = fin?.raster?.farming, K = fin?.climate?.raster, kef = KOPPEN_ID.EF;
    if (!F || !K) return () => NaN;
    const p = {}, opt = { ...farmOptions }, tk = techKey(), parts = key === 'soil' || key === 'seasonRain' || key === 'seasonWatered', sys = key === 'foodSystem' || key === 'beast' || key === 'flyBelt';
    const hist = key === 'larderVariety' || key === 'hearthOdds' || key === 'farmCame', G = hist ? historyOf(fin) : null, H = W >> 1, G0 = key === 'cropVariety' ? historyOf(fin) : null;
    if (key === 'cropVariety') {
        // (how many crops a place grows, as the Crops view's Variety reads it)
        const MN = G0 && minorNow(fin, opt), A = MN && minorAgeOf(MN, cropAge(opt));
        return A ? (x, y) => (landPixel(K, W, x, y) < 0 ? NaN : readLand(MN.Gm, A.variety, 90 - (y + 0.5) / H * 180, (x + 0.5) / W * 360 - 180) || 0) : () => NaN;
    }
    if (key === 'farmCame') {
        // (as the view reads it: where farming came has the most say, its time; else never)
        const run = G && hearthsOf(fin, farmOptions.foodSeed, farmOptions.fewer), Kc = run && klassOf(G, run).came;
        return run ? (x, y) => { if (landPixel(K, W, x, y) < 0) return NaN; const lat = 90 - (y + 0.5) / H * 180, lon = (x + 0.5) / W * 360 - 180; if (!gridVote(G, Kc, run.farmTime, lat, lon)) { const t = timeAt(G, run.farmTime, lat, lon); return t < Infinity ? t : CAME_NEVER; } return VS.a === 1 && VS.t < Infinity ? VS.t : CAME_NEVER; } : () => NaN;
    }
    if (hist) return G ? (x, y) => (landPixel(K, W, x, y) < 0 ? NaN : fieldAt(G, key === 'hearthOdds' ? G.odds : G.variety, 90 - (y + 0.5) / H * 180, (x + 0.5) / W * 360 - 180)) : () => NaN;
    const C = key === 'farmTech' || key === 'farmRain' ? null : cameView(fin, 'farmStaple', opt);
    const Y = sys ? waysOf(fin, opt, waysKey(opt), flyAtOf(fin, opt.foodSeed, opt.fewer), C, tk) : null, P = parts ? null : placesOf(fin, opt, tk, C), ix = P?.index;
    if (sys && !Y) return () => NaN;
    return (x, y) => {
        const i = landPixel(K, W, x, y);
        if (i < 0) return NaN;
        if (K.koppen[i] === kef) return 0;
        if (key === 'soil') return partsAt(F, i, p).soil;
        if (key === 'seasonRain' || key === 'seasonWatered') { partsAt(F, i, p); return key === 'seasonRain' ? p.rain : p.warm; }
        const q = slotOf(ix, i);
        switch (key) {
            case 'farmTech': return dec(P.tech[q]);
            case 'farmRain': return dec(P.rain[q]);
            case 'people': return peopleFromLog(decLog(P.people[q]));
            case 'staple': return P.staple[q] & 15;
            case 'lifestyle': return P.life[q] & 15;
            case 'foodSystem': return Y.way[q] & 15;
            case 'beast': return Y.flags[q] & 1 ? Y.beast[q] & 15 : 0;
            case 'flyBelt': return dec(Y.fly[q]);
        }
        return NaN;
    };
}

// ── the legend ──
/** Each class's share of the land (by area), by rain alone and with the techniques chosen; the soil's and the season's
 *  bands; each staple food's and each lifestyle's — kept per finished moment, techniques and the season's look (the
 *  places read from the store, in its order). */
const tallies = new WeakMap();
function tally(fin, C = null) {
    const F = fin.raster.farming, K = fin.climate.raster, key = `${techKey()}${+farmOptions.watered}${C ? `|${C.key}` : ''}`;
    const kept = tallies.get(F);
    if (kept?.key === key) return kept;
    const rain = new Float64Array(5), tech = new Float64Array(5), soil = new Float64Array(5), season = new Float64Array(5), staple = new Float64Array(STAPLES.length), life = new Float64Array(LIFESTYLES.length);
    const P = placesOf(fin, farmOptions, techKey(), C), p = {}, kef = KOPPEN_ID.EF;
    let land = 0, q = 0;
    for (let y = 0; y < F.h; y++) {
        const lat = 90 - (y + 0.5) / F.h * 180, a = Math.cos(lat * Math.PI / 180);
        for (let x = 0, i = y * F.w; x < F.w; x++, i++) {
            if (!K.koppen[i] || K.koppen[i] === kef) { if (K.koppen[i]) { land += a; staple[0] += a; life[0] += a; } continue; }
            land += a;
            partsAt(F, i, p);
            rain[P.cls[q] >> 4] += a; tech[P.cls[q] & 7] += a;
            soil[p.soil >= 0.75 ? 4 : p.soil >= 0.5 ? 3 : p.soil >= 0.3 ? 2 : p.soil >= 0.12 ? 1 : 0] += a;
            const s = farmOptions.watered ? p.warm : p.rain;
            season[s >= 8 ? 4 : s >= 5 ? 3 : s >= 3 ? 2 : s >= 1 ? 1 : 0] += a;
            staple[P.staple[q] & 15] += a; life[P.life[q] & 15] += a;
            q++;
        }
    }
    for (const t of [rain, tech, soil, season, staple, life]) for (let k = 0; k < t.length; k++) t[k] /= Math.max(1e-9, land);
    const R = fin.raster, out = { key, rain, tech, soil, season, staple, life, meas: hasMeasures(R, K) };
    tallies.set(F, out);
    return out;
}
/** Each food system's and each leading beast's share of the land, and the fly belt's — kept per finished moment and
 *  techniques; worked out only for the views that show them (Way of life, Animals). */
const waysTallies = new WeakMap();
function waysTally(fin, C = null) {
    const F = fin.raster.farming, K = fin.climate.raster, key = `${waysKey()}${C ? `|${C.key}` : ''}`, kept = waysTallies.get(F);
    if (kept?.key === key) return kept;
    const system = new Float64Array(FOOD_SYSTEMS.length), beast = new Float64Array(BEASTS.length), kef = KOPPEN_ID.EF, Y = waysOf(fin, farmOptions, waysKey(), flyAtOf(fin, farmOptions.foodSeed, farmOptions.fewer), C, techKey());
    let land = 0, fly = 0, q = 0;
    for (let y = 0; y < F.h; y++) {
        const lat = 90 - (y + 0.5) / F.h * 180, a = Math.cos(lat * Math.PI / 180);
        for (let x = 0, i = y * F.w; x < F.w; x++, i++) {
            if (!K.koppen[i]) continue;
            land += a;
            if (K.koppen[i] === kef) { system[0] += a; beast[0] += a; continue; }
            system[Y.way[q] & 15] += a; beast[Y.flags[q] & 1 ? Y.beast[q] & 15 : 0] += a;
            if (Y.flags[q] & 2) fly += a;
            q++;
        }
    }
    for (const t of [system, beast]) for (let k = 0; k < t.length; k++) t[k] /= Math.max(1e-9, land);
    const out = { key, system, beast, fly: fly / Math.max(1e-9, land) };
    waysTallies.set(F, out);
    return out;
}

const chip = (key, label, title, on) => `<button type="button" class="evo-farm-chip${on ? ' on' : ''}" data-farm="${key}" title="${title}" aria-pressed="${on}">${label}</button>`;
const bar = (stops, label) => `<div class="evo-farm-bar"><i style="background:${gradient(stops)}"></i><span>${label}</span></div>`;
const pct = v => (v > 0 && v < 0.005 ? '<1%' : `${Math.round(100 * v)}%`);

// ── the Food tab's settings (developer, 2026-11-01: "make it more obvious what the settings are and what they mean, also make
// it easy to reroll (not just the names but EVERYTHING … with food)"): one block atop every view's legend, the same in each —
// Re-roll, drawing all the food's chance again (where and when farming began, each landmass's beasts and fly, which crops the
// world grows and where, every name; never the planet), and a line saying what is set; opened, each setting with what it does,
// dimmed where this view does not use it. Opened or closed stays as it was (the page's, not the link's) ──
let settingsOpen = false;
const SET_USE = {
    age: ['farmStaple', 'farmLife', 'farmAnimals', 'farmPeople', 'farmCrops'],
    tools: ['farmLand', 'farmStaple', 'farmLife', 'farmAnimals', 'farmPeople'],
    fewer: ['farmLife', 'farmAnimals', 'farmPeople', 'farmOrigins'],
    real: ['farmStaple', 'farmAnimals', 'farmCrops', 'farmOrigins'],
    pull: ['farmStaple', 'farmAnimals', 'farmCrops', 'farmOrigins'],
    named: ['farmStaple', 'farmAnimals'],
    roll: ['farmStaple', 'farmLife', 'farmAnimals', 'farmPeople', 'farmCrops', 'farmOrigins'],
};
const AGE_WORDS = { k10: '10,000 years', full: 'Full spread', best: 'Best possible' }, REAL_WORDS = { earth: 'Earth-like', balanced: 'Balanced', wild: 'Anything goes' };
const PULL_WORDS = { free: 'Mix freely', regional: 'Regional', strict: 'Keep worlds apart' };
function foodSettings(layer, fin) {
    const hist = !!historyOf(fin), used = key => SET_USE[key].includes(layer) && (hist || key === 'tools');
    const opt = (key, v, w, t) => `<button type="button" class="evo-farm-chip${farmOptions[key] === v ? ' on' : ''}" data-farm-${key}="${v}" aria-pressed="${farmOptions[key] === v}" title="${t}">${w}</button>`;
    const row = (key, name, what, body) => `<div class="evo-farm-row${used(key) ? '' : ' dim'}"><div class="evo-farm-rowhead"><b>${name}</b> — ${what}${used(key) ? '' : ' <em>(not used in this view)</em>'}</div><div class="evo-farm-chips">${body}</div></div>`;
    const nTools = Object.keys(TECHNIQUE_WORDS).filter(k => farmOptions[k]).length;
    const sum = [used('age') ? AGE_WORDS[farmOptions.age] : '', used('tools') ? (nTools === 4 ? 'all farming tools' : nTools ? `${nTools} of 4 farming tools` : 'rain alone') : '',
        used('fewer') ? (farmOptions.fewer ? 'fewer gaps' : 'Earth-like gaps') : '', used('real') ? `${REAL_WORDS[farmOptions.real]} crops` : '', used('pull') ? `${PULL_WORDS[farmOptions.pull]} likenesses` : '',
        used('named') ? (farmOptions.named ? 'by name' : 'by kind') : '', used('roll') ? (farmOptions.foodSeed ? `food seed ${farmOptions.foodSeed}` : 'the planet\'s own food seed') : ''].filter(Boolean).join(' · ');
    const body = row('roll', 'Food seed', 'every chance in the food\'s history — where and when farming began, each landmass\'s beasts, which crops grow where, every name — drawn from it and the planet\'s seed; Re-roll draws a new one, or type one in to come back to a draw',
        `<input class="evo-farm-find evo-farm-seed" type="number" min="0" max="${FOOD_SEED_MAX}" step="1" inputmode="numeric" data-farm-seed value="${farmOptions.foodSeed}" aria-label="Food seed" title="0: the planet's own draw">`) +
        row('age', 'When', 'how far the crops and animals had travelled from where each was first tamed',
        opt('age', 'k10', AGE_WORDS.k10, 'What had reached each place 10,000 years after the first farming anywhere') + opt('age', 'full', AGE_WORDS.full, 'Everything that would ever reach each place, in time') +
        opt('age', 'best', AGE_WORDS.best, 'What the land alone would support, as if every crop and animal had reached everywhere')) +
        row('tools', 'Farming tools', 'what farmers know how to do: sow a big river\'s flood silt, lead canals off rivers, terrace hillsides, raise beds in wet ground — all off, the land by rain alone',
            Object.entries(TECHNIQUE_WORDS).map(([k, [label, title]]) => chip(k, label, title, farmOptions[k])).join('')) +
        row('fewer', 'Animals to tame', 'as on Earth, some landmasses have no wild beast fit to tame, and a tsetse-like fly keeps cattle and horses from some tropics; Fewer gaps makes both rarer',
            chip('fewer', 'Fewer gaps', 'Each landmass likelier to have each beast\'s wild ancestor, and the fly rarer', farmOptions.fewer)) +
        row('real', 'Which crops', 'how much Earth\'s popular, nourishing crops win out over chance — in which crops this world grows, and which Earth crops its own are like',
            opt('real', 'earth', REAL_WORDS.earth, 'Popular, nourishing crops, near their Earth homes\' likenesses: few surprises') + opt('real', 'balanced', REAL_WORDS.balanced, 'Popularity and chance both count') + opt('real', 'wild', REAL_WORDS.wild, 'Chance decides which crops a world grows and where')) +
        row('pull', 'Earth likenesses', 'each hearth is like one of Earth\'s farming regions, which names its crops and animals: neighbouring hearths like neighbouring regions, any mix, or never the Old and New World side by side',
            opt('pull', 'free', PULL_WORDS.free, 'Neighbouring hearths may be like any of Earth\'s regions') + opt('pull', 'regional', PULL_WORDS.regional, 'Neighbouring hearths lean toward Earth regions near one another') +
            opt('pull', 'strict', PULL_WORDS.strict, 'Neighbouring hearths keep to one side of Earth\'s oceans')) +
        row('named', 'Names', 'each place\'s own crop and animal by its Earth-like name, or by its kind (grains, roots, cattle-like…)',
            chip('named', 'Named', 'Each place\'s own crop or animal, by name — off: the kinds', farmOptions.named));
    const reroll = used('roll') ? `<button type="button" class="evo-farm-chip evo-farm-reroll" data-farm-reroll title="Draw all the food's chance again: where and when farming began, which beasts each landmass has and whether the fly does, which crops this world grows and where, and every name — the planet stays the same">⟳ Re-roll</button>` : '';
    return `<div class="evo-farm-set${settingsOpen ? ' open' : ''}"><div class="evo-farm-sethead">${reroll}<button type="button" class="evo-farm-setsum" data-farm-settoggle aria-expanded="${settingsOpen}" title="What each setting means">` +
        `<span>Settings: ${sum || 'none for this view'}</span><i aria-hidden="true">▸</i></button></div><div class="evo-farm-setbody">${body}</div></div>`;
}

export function farmingLegendHTML(layer, fin) {
    const note = t => `<div class="evo-legend-note">${t}</div>`;
    // (each view's head, the settings under it — not Soil's or Growing season's, which none change)
    const head = t => `<div class="evo-legend-head">${t}</div>${layer === 'farmSoil' || layer === 'farmSeason' || !fin?.raster?.farming ? '' : foodSettings(layer, fin)}`;
    if (!fin?.raster?.farming) return head('Food — add detail again to see it (this moment was detailed before these views were added)');
    // (as it came: what the view shows — the age chips, its words for the head and the note; none without a history)
    const C = cameView(fin, layer), canCame = AS_CAME.has(layer) && !!historyOf(fin), ageOn = canCame ? farmOptions.age : 'best';
    const when = C ? (farmOptions.age === 'full' ? ', once everything had come' : ', 10,000 years after farming began') : '';
    const cameNote = C ? note(`As it came: only the crops and beasts that had reached each place${farmOptions.age === 'full' ? ' in the end' : ' by 10,000 years after the first farming'} — farming spreads from its hearths ~1 km a year, a beast's ancestor lives on some landmasses and not others (Origins shows when and from where). Where no crop had come, people herd or gather; where no plough beast had, they farm by hand`) : '';
    // (a view of the ways: its store made first — the places' filled in the same pass)
    if ((layer === 'farmAnimals' || (layer === 'farmLife' && !farmOptions.simple)) && hasMeasures(fin.raster, fin.climate.raster)) waysOf(fin, farmOptions, waysKey(), flyAtOf(fin, farmOptions.foodSeed, farmOptions.fewer), C, techKey());
    const T = tally(fin, C), sw = (c, label, share) => `<span><i style="background:${css(c)}"></i>${label} <em>${pct(share)}</em></span>`, c = [0, 0, 0];
    if (layer === 'farmSoil') return head('Soil — how fertile the ground is (on flat ground)') + bar(SOIL, 'poor → rich') +
        `<div class="evo-koppen">${['Barren', 'Poor', 'Middling', 'Good', 'Rich'].map((w, k) => sw(ramp(SOIL, [0.05, 0.2, 0.4, 0.62, 0.88][k], c).slice(), w, T.soil[k])).reverse().join('')}</div>` +
        note('River silt and loess richest, then volcanic ash, basalt, limestone and shale; sand, granite and old shields poor. Black earth under temperate grassland; leached in the hot wet tropics where nothing renews the ground; acid under boreal conifers');
    if (layer === 'farmSeason') return head(`Growing season — the months crops grow${farmOptions.watered ? ', watered' : ', by rain alone'}`) + bar(SEASON, '0 → 12 months') +
        `<div class="evo-farm-chips">${chip('watered', 'Watered', 'The months warm enough, were water brought — what irrigation could make of the season', farmOptions.watered)}</div>` +
        `<div class="evo-koppen">${['None', '1–3 months', '3–5', '5–8', '8+'].map((w, k) => sw(ramp(SEASON, [0, 2, 4, 6.5, 10][k], c).slice(), w, T.season[k])).reverse().join('')}</div>` +
        note('A month grows crops where it is warm enough (over ~5 °C, fully from 15) and wet enough — its rain, melt and the soil’s water past half what it could evaporate (the FAO’s growing period)');
    if (layer === 'farmStaple') {
        if (!hasHarvests(fin.raster.farming)) return head('Staple food — add detail again to see it (this moment was detailed before the harvests were counted)');
        // (each food a chip with its colour and its share of the land: a click shows it alone, again shows them all)
        const only = farmOptions.only, food = k => `<button type="button" class="evo-farm-chip evo-farm-staple${only === k ? ' on' : ''}" data-farm-only="${k}" aria-pressed="${only === k}" ` +
            `title="${only === k ? 'Show every food again' : `Show where ${STAPLE_WORDS[k].toLowerCase()} would feed people, and how well — alone`}"><i style="background:${css(STAPLE_RGB[k])}"></i>${STAPLE_WORDS[k]} <em>${pct(T.staple[k])}</em></button>`;
        // (named: each crop group's named crops under it — those on ≥ 0.2 % of the land, the most first — with Wikipedia links)
        const nv = only ? null : namedView(fin, layer, farmOptions, placesOf(fin, farmOptions, techKey(), C), null);
        if (nv) {
            // (each crop group's named crops under it, by where each is grown at all — the most first, the order the same
            // whichever is picked; the foods that are not crops as a key)
            const GT = groupTable(nv, 'crop'), VT = variantTally(fin, nv), pick = pickedOf(nv, layer), order = [];
            const list = st => {
                const g = STAPLE_CROP[st], vs = nv.N.strains.filter(S => S.a === g && (GT.grown[S.id] >= 0.002 || VT.crop[S.id] >= 0.002)).sort((x, y) => GT.grown[y.id] - GT.grown[x.id] || x.id - y.id).slice(0, 10);
                order.push(...vs.map(S => S.id));
                return `<div class="evo-farm-group"><span class="evo-farm-groupname" title="The main crop on ${pct(T.staple[st])} of the land; each of its crops by the land it is grown on"><i style="background:${css(STAPLE_RGB[st])}"></i>${STAPLE_WORDS[st]} <em>· main on ${pct(T.staple[st])}</em></span>${vs.map(S => variantChip(nv, S.id, GT.grown[S.id])).join('')}</div>`;
            };
            const crops = STAPLES.map((_, k) => k).filter(k => STAPLE_CROP[k] >= 0 && (T.staple[k] >= 0.002 || nv.N.strains.some(S => S.a === STAPLE_CROP[k] && GT.grown[S.id] >= 0.002))).map(list).join('');
            const rest = STAPLES.map((_, k) => k).filter(k => k !== Staple.NONE && STAPLE_CROP[k] < 0 && T.staple[k] >= 0.001);
            const RS = pick >= 0 ? farmColourBuffer(layer, fin).rungs : null, P = v => pct(RS?.[v] ?? 0);
            const text = pick >= 0 ? `${pickedName(nv, pick)} — the main crop on ${P(1)} of the land, the 2nd on ${P(2)}, the 3rd on ${P(3)}; grown otherwise on ${P(4)}`
                : 'Pick a crop: where it is the main crop, the 2nd or the 3rd';
            return head(`Staple food — each place's main crop, by name${when}`) + pickRow('variant', order, pick, text, { title: pick >= 0 ? strainTitle(nv, pick) : '' }) +
                crops + `<div class="evo-koppen">${rest.map(k => sw(STAPLE_RGB[k], STAPLE_WORDS[k], T.staple[k])).join('')}</div>` +
                rungKey(nv, pick, ['main crop', '2nd', '3rd', 'grown otherwise'], bar([[0, STAPLE_PALE], [1, [150, 150, 150]]], 'paler where it feeds less well; striped where a second does nearly as well')) +
                note('Each crop group\'s strains: the one each hearth first tamed, named for the Earth crop it is most like — by its hearth\'s climate and what its neighbours\' hearths are like. Every one spreads wherever it can grow, barring distance — best where the climate is like its home\'s. A place grows every crop group that grows there and had come, each by its own variety; its main crop is the first come, unless a later one does far better. ↗ opens the crop on Wikipedia. Likenesses, not claims: a different world') + cameNote;
        }
        return head(only ? `Staple food — ${STAPLE_WORDS[only].toLowerCase()} alone: where it would feed people, and how well${when}` : `Staple food — what each place would live on most${when}`) +
            `<div class="evo-farm-chips">${STAPLES.map((_, k) => k).filter(k => k !== Staple.NONE).map(food).join('')}</div>` + bar([[0, STAPLE_PALE], [1, [150, 150, 150]]], `paler where it feeds less well${only ? '' : '; striped where a second does nearly as well'}`) +
            note('What would feed each place best with these techniques — archetypes, not any one crop. Paddy grains feed the most on rich, level, wet ground; cool-season grains take ' +
                'the winters and the cool summers; warm-season grains the hot and the dry; roots the leached tropics and cold highlands; livestock the dry grass; ' +
                'tree and palm crops the ever-wet tropics and the hot oases; fish the coasts of cold, upwelling seas and the big rivers; wild foods the land no farmer or herder would hold') + cameNote;
    }
    if (layer === 'farmCrops') {
        const MN = historyOf(fin) && hasHarvests(fin.raster.farming) ? minorNow(fin) : null;
        if (!MN) return head('Crops — add detail again to see them (this moment was detailed before these views were added)');
        const age = cropAge(), MA = minorAgeOf(MN, age), cols = itemColours(MN.items), look = farmOptions.cropLook;
        const whenC = age === null ? ' — wherever it would grow' : age === Infinity ? ', once everything had come' : ', 10,000 years after farming began';
        const looks = `<div class="evo-farm-chips">${Object.entries(CROP_LOOK_WORDS).map(([k, w]) => `<button type="button" class="evo-farm-chip${look === k && farmOptions.crop < 0 ? ' on' : ''}" data-farm-croplook="${k}" aria-pressed="${look === k}">${w}</button>`).join('')}</div>`;
        const cropChip = (I, share) => `<span class="evo-farm-var"><button type="button" class="evo-farm-chip evo-farm-staple${farmOptions.crop === I.id ? ' on' : ''}" data-farm-crop="${I.id}" aria-pressed="${farmOptions.crop === I.id}" title="${MINOR[I.m].word}: like ${I.it.n} (on Earth from ${earthHome(I.it)}) — show it alone"><i style="background:${css(cols[I.id])}"></i>${I.label} <em>${pct(share)}</em></button></span>`;
        const grown = MN.items.filter(I => MN.built[I.id].exists);
        // (the finder: every crop in the catalogue — one this world does not grow says why)
        const finder = `<div class="evo-farm-chips"><input class="evo-farm-find" type="search" list="farmCropList" data-farm-find placeholder="Find any crop or animal (${grown.length} of ${MN.items.length} grown)…" aria-label="Find a crop or animal"><datalist id="farmCropList">${MN.items.map(I => `<option value="${I.label}">${MN.built[I.id].exists ? '' : 'not grown here'}</option>`).join('')}</datalist></div>`;
        const note2 = 'Each crop beyond the staples is its own: whether this world grows it (likelier the more popular and nourishing it is on Earth, as the realism weighs it), its home — the farmed region that suits it best and is most like its Earth home — and its own spread, carried between farmers — herbs and seed and root spices as gardens are, the tree and vine spices (pepper, cloves, cinnamon) kept near home; orchards come millennia after farming. Likenesses, not claims: a different world';
        const pickC = farmOptions.crop >= 0 && MN.items[farmOptions.crop] ? farmOptions.crop : -1;
        let info = 'Pick a crop or animal below — or find one by name — to see where it is grown', infoTitle = '';
        if (pickC >= 0 && !MN.built[pickC].exists) {
            // (a crop this world does not grow: why, and where it could)
            const I = MN.items[pickC], B = MN.built[I.id];
            info = `<i class="evo-farm-sw" style="background:${css(cols[I.id])}"></i><b>${I.label}</b> <a class="evo-farm-wiki" href="${wiki(I.it)}" target="_blank" rel="noopener" title="${I.it.n} on Wikipedia">↗</a> — not grown on this world: ${B.noland ? `no farmed land has what it needs — ${MINOR[I.m].needs}` : 'left out by chance (Which crops in the settings: Earth-like grows more of Earth’s favourites; or Re-roll)'} · hatched where it could grow`;
            infoTitle = `${MINOR[I.m].word}, like ${I.it.n} (on Earth from ${earthHome(I.it)})`;
        } else if (pickC >= 0) {
            // (one crop's card: its kind, its likeness and Earth home, where and when first grown, its share — popularity and
            // nourishment in its title)
            const I = MN.items[pickC], B = MN.built[I.id], dots = v => '●●●●●'.slice(0, Math.max(1, Math.round(v * 5))) + '○○○○○'.slice(0, 5 - Math.max(1, Math.round(v * 5)));
            const homes = B.homes.map(h => { const S = MN.sites[h.site]; return `${Math.abs(S.lat).toFixed(0)}°${S.lat >= 0 ? 'N' : 'S'} ${Math.abs(S.lon).toFixed(0)}°${S.lon >= 0 ? 'E' : 'W'}, ~${(Math.round(h.t / 100) * 100).toLocaleString()} years after the first farming`; }).join('; and ');
            info = `<i class="evo-farm-sw" style="background:${css(cols[I.id])}"></i><b>${I.label}</b> <a class="evo-farm-wiki" href="${wiki(I.it)}" target="_blank" rel="noopener" title="${I.it.n} on Wikipedia">↗</a> — ${MINOR[I.m].word.toLowerCase()}, like ${I.it.n} (on Earth from ${earthHome(I.it)}) · on ${pct(MA.share[I.id])} of the land · first grown at ${homes} (◆) · paler where it grows less well, hatched where it would grow but had not come`;
            infoTitle = `Popular ${dots(I.pop)} · nourishing ${dots(I.nut)}`;
        }
        const kIdx = KINDS.findIndex(K => K.key === look), stat = arr => { let s = 0, n = 0, mx = 0; for (let c = 0; c < arr.length; c++) if (MN.Gm.land[c] && (age === null || MN.farm[c] <= age) && MN.farm[c] < Infinity) { s += arr[c]; n++; if (arr[c] > mx) mx = arr[c]; } return { mean: s / Math.max(1, n), max: mx }; };
        const listed = [], top = list => list.map(I => [I, MA.share[I.id]]).filter(([, v]) => v > 0.001).sort((a, b) => b[1] - a[1] || a[0].id - b[0].id).slice(0, 18).map(([I, v]) => { listed.push(I.id); return cropChip(I, v); }).join('');
        let body;
        if (look === 'variety') {
            const S = stat(MA.variety), kinds = KINDS.map((K, k) => `${K.word.toLowerCase()} ${stat(MA.count[k]).mean.toFixed(1)}`).join(', ');
            body = bar(countRamp('variety', countTop(MA.variety)), `0 → ${countTop(MA.variety)}+ crops a place`) + note(`A farming place grows ~${Math.round(S.mean)} crops (up to ${S.max}), the staples too: on average ${kinds}`) + `<div class="evo-farm-chips">${top(grown)}</div>`;
        } else {
            const list = grown.filter(I => I.kind === look), S = stat(MA.count[kIdx]);
            body = (look === 'pulse' || look === 'spice' ? note(`Each place by its leading ${look === 'pulse' ? 'pulse' : 'spice or herb'} — the best-suited that had come`) : bar(countRamp(look, countTop(MA.count[kIdx])), `0 → ${countTop(MA.count[kIdx])}+ a place`)) +
                note(`${KINDS[kIdx].word}: ~${S.mean.toFixed(1)} a farming place, up to ${S.max}; ${list.length} grown on this world`) + `<div class="evo-farm-chips">${top(list)}</div>`;
        }
        return head(`Crops — ${CROP_LOOK_WORDS[look] ?? 'Variety'}${whenC}`) + looks + pickRow('crop', listed, pickC, info, { title: infoTitle, lines: 3 }) + body + finder + note(note2);
    }
    if (layer === 'farmOrigins') {
        const G = historyOf(fin);
        if (!G) return head('Origins — add detail again to see them (this moment was detailed before these views were added)');
        const luck = luckOf(fin, farmOptions.foodSeed, farmOptions.fewer), odds = farmOptions.origin === 'odds', one = farmOptions.wild;
        const look = (k, label, title) => `<button type="button" class="evo-farm-chip${farmOptions.origin === k ? ' on' : ''}" data-farm-origin="${k}" aria-pressed="${farmOptions.origin === k}" title="${title}">${label}</button>`;
        const looks = `<div class="evo-farm-chips">${look('larder', 'Wild larder', 'Where the crops\' and beasts\' wild ancestors grow — how many within reach, or one alone')}${look('odds', 'Hearth odds', 'Where farming would most likely begin')}${look('came', 'When farming came', 'Years after the first farming anywhere, a line each thousand — the hearths numbered in the order they began')}${look('from', 'From which hearth', 'Each hearth\'s lands in its colour: where its farming spread first')}</div>`;
        // (each landmass over half a million km²: its beasts and the fly, by its luck)
        const NB = BEASTS.length, place = m => `${Math.abs(m.lat).toFixed(0)}°${m.lat >= 0 ? 'N' : 'S'} ${Math.abs(m.lon).toFixed(0)}°${m.lon >= 0 ? 'E' : 'W'}`;
        const masses = G.masses.filter(m => m.area >= 5e5).sort((a, b) => b.area - a.area).slice(0, 5).map(m => {
            const beasts = BEASTS.map((B, b) => (b && luck.has[m.id * NB + b] ? B.like.replace(/^like /, '') : null)).filter(Boolean);
            return `<b>${(m.area / 1e6).toFixed(m.area >= 1e7 ? 0 : 1)} M km² at ${place(m)}</b>: ${beasts.length ? beasts.join(', ') : 'no beast to tame'}${luck.fly[m.id] ? '; the fly' : ''}`;
        });
        const landmasses = note(`Each landmass's luck — which beasts' wild ancestors live on it (each ~${farmOptions.fewer ? 96 : 70} % where it has their habitat), whether the fly does: ${masses.join(' · ')}`);
        const run = farmingOrigins(fin), place2 = C => `${Math.abs(C.lat).toFixed(0)}°${C.lat >= 0 ? 'N' : 'S'} ${Math.abs(C.lon).toFixed(0)}°${C.lon >= 0 ? 'E' : 'W'}`;
        if (run && (farmingOptionsOrigin() === 'came' || farmingOptionsOrigin() === 'from')) {
            const came = farmingOptionsOrigin() === 'came', yrs = t => (t < 50 ? 'first' : `+${(Math.round(t / 100) * 100).toLocaleString()}`);
            // (each hearth: its number in its colour (★ a founder), where, what it tamed first — and its lands' share)
            const share = new Float64Array(run.hearths.length + 1);
            let landA = 0, reached = 0, farmable = 0;
            for (let c = 0; c < G.w * G.h; c++) {
                if (!G.land[c]) continue;
                const a = G.area[c], from = run.farmFrom[c];
                landA += a;
                if (Math.max(...G.fit.map(f => f[c])) >= 0.25) { farmable += a; if (run.farmTime[c] <= 10000) reached += a; }
                if (from >= 0) { const root = run.centres[run.centres[from].root]; share[root.hearth ?? 0] += a; }
            }
            const list = run.hearths.slice(0, 20).map(C => {
                const h = hearthRGB(C.hearth), crops = C.items.slice(0, 3).map(it => `${strainName(fin, C.id, it.a)} (${yrs(it.t)})`).join(', ');
                return `<span><i style="background:${css(h)}"></i><b>${C.hearth}${C.founder ? ' ★' : ''}</b> ${place2(C)}: ${crops}${came ? '' : ` <em>${pct(share[C.hearth] / Math.max(1e-9, landA))}</em>`}</span>`;
            }).join('');
            return head(came ? 'Origins — when farming came: years after the first farming anywhere' : 'Origins — from which hearth each place\'s farming came') + looks +
                (came ? bar(ARRIVE, '0 → 10,000+ years; a line each thousand') : '') + `<div class="evo-koppen evo-hearths">${list}</div>` +
                note(`${run.hearths.length} hearths began farming on their own (★ the founders: early, far apart, leading with different crops); every other place adopted it as it spread — ~1 km a year, faster along rivers and coasts and through farmers, slower past rich foragers, across short seas — and tamed what grew wild there. Within 10,000 years it reached ${pct(reached / Math.max(1e-9, farmable))} of the land it could grow on${came ? '' : '; paler, the later it came'}`) + landmasses;
        }
        if (odds) return head('Origins — hearth odds: where farming would most likely begin') + looks + bar(ODDS, 'low → high') +
            note('Higher where many crops\' and beasts\' wild ancestors grow within ~330 km, the seasons are strong (a dry or cold season to store food through), the land is productive, hills meet plains, water is near and the foragers\' own food is not too rich; none poleward of ~45°. Earth\'s centres — the Fertile Crescent, the Yellow and Yangtze rivers, Mesoamerica, the Andes, New Guinea, the Sahel and Ethiopia — sat in such places') + landmasses;
        const arch = k => { const A = ARCHETYPES[k], rgb = A.beast ? BEAST_RGB[A.beast] : STAPLE_RGB[CROP_STAPLE[A.crop]];
            return `<button type="button" class="evo-farm-chip evo-farm-staple${one === k ? ' on' : ''}" data-farm-wild="${k}" aria-pressed="${one === k}" title="${one === k ? 'Show the whole larder again' : `Show where wild ${A.word.toLowerCase()}${A.like ? ` (${A.like})` : ''} grow — alone`}"><i style="background:${css(rgb)}"></i>${A.word}</button>`; };
        return head(one >= 0 ? `Origins — wild ${ARCHETYPES[one].word.toLowerCase()}: where its wild ancestor grows${ARCHETYPES[one].beast ? ' (hatched: its habitat, but none lives on that landmass)' : ''}` : 'Origins — the wild larder: how many crops\' and beasts\' wild ancestors grow within reach') + looks +
            `<div class="evo-farm-chips">${ARCHETYPES.map((_, k) => arch(k)).join('')}</div>` + (one >= 0 ? bar([[0, STAPLE_PALE], [1, [150, 150, 150]]], 'paler where it grows less well') : bar(VARIETY, '0 → 6: crops 1 each, beasts ½')) +
            note('The wild ancestors\' homes, not where the crops later grow: cool-season grains on winter-rain hills, paddy grains in hot seasonal wetlands, warm-season grains on summer rain and in dry tropical hills, roots on the forest\'s edge and in cold tropical highlands, tree crops in the ever-wet tropics and by desert oases') + landmasses;
    }
    if (layer === 'farmLife' && !farmOptions.simple && T.meas) {
        if (!hasHarvests(fin.raster.farming)) return head('Way of life — add detail again to see it (this moment was detailed before the harvests were counted)');
        const Y = waysTally(fin, C);
        // (each food system a chip with its colour and its share of the land: a click shows it alone; Simple, the three lifestyles)
        const one = farmOptions.way, way = k => `<button type="button" class="evo-farm-chip evo-farm-staple${one === k ? ' on' : ''}" data-farm-way="${k}" aria-pressed="${one === k}" ` +
            `title="${one === k ? 'Show every way of life again' : `${FOOD_SYSTEMS[k].why[0].toUpperCase()}${FOOD_SYSTEMS[k].why.slice(1)} — show it alone`}"><i style="background:${css(SYSTEM_RGB[k])}"></i>${FOOD_SYSTEM_WORDS[k]} <em>${pct(Y.system[k])}</em></button>`;
        const simple = chip('simple', 'Simple', 'Farming, herding or gathering only — and how many each could feed, alone', false);
        return head(one ? `Way of life — ${FOOD_SYSTEM_WORDS[one].toLowerCase()} alone (striped where it is a close second)${when}` : `Way of life — how each place’s people would live${when}`) +
            `<div class="evo-farm-chips">${FOOD_SYSTEMS.map((_, k) => k).filter(k => k && Y.system[k] >= 0.0005).map(way).join('')}</div>` +
            `<div class="evo-farm-chips">${simple}</div>` +
            bar([[0, STAPLE_PALE], [1, [150, 150, 150]]], 'paler where few could live; striped where a second does nearly as well') +
            note('Farming where crops feed most: paddies where paddy grains lead; irrigated valleys where only water brought makes farmland; plough and flocks on dry summers and dry margins, mixed farms on humid land; ' +
                'hoe farming where no plough beast lives (the fly belt: see Animals); forest gardens in the wet tropics; highland farming on the tropics’ highlands; grain and herds on the dry margin. ' +
                `Nomadic herding where grass is better grazed than farmed. Foragers settle by rich fish where food must be stored for the winter, and keep to their way unless farming or herding would feed ${GATHER.hold} times as many`) + cameNote +
            (Y.system[0] >= 0.005 ? note(`Uninhabited: ${pct(Y.system[0])} of the land — ice, and land too barren for anyone to live on`) : '');
    }
    if (layer === 'farmAnimals') {
        if (!hasHarvests(fin.raster.farming) || !T.meas) return head('Animals — add detail again to see them (this moment was detailed before these views were added)');
        const Y = waysTally(fin, C);
        // (each beast a chip with its colour and its share of the land: a click shows where it could be kept, alone)
        const one = farmOptions.beast, beast = k => `<button type="button" class="evo-farm-chip evo-farm-staple${one === k ? ' on' : ''}" data-farm-beast="${k}" aria-pressed="${one === k}" ` +
            `title="${one === k ? 'Show the leading beasts again' : `${BEASTS[k].like}: ${BEASTS[k].roles} — show where it could be kept`}"><i style="background:${css(BEAST_RGB[k])}"></i>${BEAST_WORDS[k]} <em>${pct(Y.beast[k])}</em></button>`;
        const fly = `<span><i style="background:repeating-linear-gradient(135deg, rgba(0,0,0,0.42) 0 2px, transparent 2px 6px), ${css(STAPLE_PALE)}"></i>fly belt <em>${pct(Y.fly)}</em></span>`;
        const nv = one ? null : namedView(fin, layer, farmOptions, placesOf(fin, farmOptions, techKey(), C), waysOf(fin, farmOptions, waysKey(), flyAtOf(fin, farmOptions.foodSeed, farmOptions.fewer), C, techKey()));
        if (nv) {
            const GT = groupTable(nv, 'beast'), VT = variantTally(fin, nv), pick = pickedOf(nv, layer), order = [];
            const list = b => {
                const a = beastArchetype(b), vs = nv.N.strains.filter(S => S.a === a && (GT.grown[S.id] >= 0.002 || VT.beast[S.id] >= 0.002)).sort((x, y) => GT.grown[y.id] - GT.grown[x.id] || x.id - y.id).slice(0, 10);
                order.push(...vs.map(S => S.id));
                return `<div class="evo-farm-group"><span class="evo-farm-groupname" title="${BEASTS[b].like}: ${BEASTS[b].roles} — leading on ${pct(Y.beast[b])} of the land; each of its strains by the land it is kept on"><i style="background:${css(BEAST_RGB[b])}"></i>${BEAST_WORDS[b]} <em>· leads on ${pct(Y.beast[b])}</em></span>${vs.map(S => variantChip(nv, S.id, GT.grown[S.id])).join('')}</div>`;
            };
            const groups = BEASTS.map((_, k) => k).filter(k => k && (Y.beast[k] >= 0.002 || nv.N.strains.some(S => S.a === beastArchetype(k) && GT.grown[S.id] >= 0.002))).map(list).join('');
            const RS = pick >= 0 ? farmColourBuffer(layer, fin).rungs : null, P = v => pct(RS?.[v] ?? 0);
            const text = pick >= 0 ? `${pickedName(nv, pick)} — the leading beast on ${P(1)} of the land, the 2nd on ${P(2)}, the 3rd on ${P(3)}; kept otherwise on ${P(4)}`
                : 'Pick an animal: where it is the leading beast, the 2nd or the 3rd';
            return head(`Animals — each place's leading beast, by name${when}`) + pickRow('variant', order, pick, text, { title: pick >= 0 ? strainTitle(nv, pick) : '' }) +
                groups + `<div class="evo-koppen">${fly}</div>` +
                rungKey(nv, pick, ['leading beast', '2nd', '3rd', 'kept otherwise'], bar([[0, STAPLE_PALE], [1, [150, 150, 150]]], 'paler where it is kept less well; striped where a second ranks nearly as well')) +
                note('Each beast\'s strains: the one each hearth first tamed, named for the Earth animal it is most like — by its hearth\'s climate and what its neighbours\' hearths are like — and spread from there, wherever it can be kept, barring distance. ↗ opens the animal on Wikipedia. Hatched: the fly belt, where cattle, horses and buffalo fail') + cameNote;
        }
        return head(one ? `${BEAST_WORDS[one]} (${BEASTS[one].like}: ${BEASTS[one].roles}) — where it could be kept, and how well${when}` : `Animals — farmers’ and herders’ leading beast${when}`) +
            `<div class="evo-farm-chips">${BEASTS.map((_, k) => k).filter(k => k).map(beast).join('')}</div>` +
            `<div class="evo-koppen">${fly}</div>` +
            bar([[0, STAPLE_PALE], [1, [150, 150, 150]]], one ? 'paler where it is kept less well' : 'paler where it is kept less well; striped where a second ranks nearly as well') +
            note('Each place’s beast most at home there — its wild ancestor’s home first, how well it is kept second: cattle-like grazers on open lowland, sheep and goats on rugged hills, the horse on cold steppe, camels in the deserts, ' +
                'yak- or llama-like beasts above ~3,000 m, reindeer where the summers are short and the winters hard, pigs in warm wet woods where no plough beast is, buffalo in the paddies and wetlands. ' +
                'Hatched: where a tsetse-like fly lives — hot, wet-season woodland below ~1,500 m, on the landmasses it is on (luck: on Earth, Africa alone) — and cattle, horses and buffalo fail; no plough, so its farmers work the land by hand') + cameNote;
    }
    if (layer === 'farmLife') {
        if (!hasHarvests(fin.raster.farming)) return head('Lifestyle — add detail again to see it (this moment was detailed before the harvests were counted)');
        // (each way of life a chip with its colour and its share of the land: a click shows how many it could feed, alone)
        const one = farmOptions.life, way = k => `<button type="button" class="evo-farm-chip evo-farm-staple${one === k ? ' on' : ''}" data-farm-life="${k}" aria-pressed="${one === k}" ` +
            `title="${one === k ? 'Show every way of life again' : `Show how many ${LIFESTYLE_WORDS[k].toLowerCase()} could feed — alone`}"><i style="background:${css(LIFE_RGB[k])}"></i>${LIFESTYLE_WORDS[k]} <em>${pct(T.life[k])}</em></button>`;
        return head(one ? `Way of life — ${LIFESTYLE_WORDS[one].toLowerCase()} alone: how many it could feed${when}` : `Way of life — farming, herding or gathering${when}`) +
            `<div class="evo-farm-chips">${[Lifestyle.FARMING, Lifestyle.HERDING, Lifestyle.GATHERING].map(way).join('')}</div>` +
            (T.meas ? `<div class="evo-farm-chips">${chip('simple', 'Simple', 'Back to each place’s food system: paddies, plough and flocks, hoe farming, nomadic herding, settled foragers…', farmOptions.simple)}</div>` : '') +
            bar([[0, STAPLE_PALE], [1, [150, 150, 150]]], one ? 'paler where it feeds fewer' : 'paler where few could live; striped where a second does nearly as well') +
            note(`Gathering is hunting, fishing and gathering: the coasts of cold, upwelling seas, big rivers and lakes, and the land’s own plants and game. Gatherers keep to their way unless farming or herding would feed ${GATHER.hold} times as many — ` +
                'so rich coasts can stay theirs, as the Pacific Northwest’s did; farming where crops feed most, herding where only grass grows well') + cameNote +
            (T.life[0] >= 0.005 ? note(`Uninhabited: ${pct(T.life[0])} of the land — ice, and land too barren for anyone to live on`) : '');
    }
    if (layer === 'farmPeople') {
        const count = peopleOf(fin, C);
        if (!count) return head('People — add detail again to see them (this moment was detailed before the harvests were counted)');
        const millions = v => (v >= 1e9 ? `${(v / 1e9).toFixed(1)} billion` : v >= 1e6 ? `${Math.round(v / 1e6).toLocaleString()} million` : `${Math.round(v / 1e3).toLocaleString()} thousand`);
        const by = [Lifestyle.FARMING, Lifestyle.HERDING, Lifestyle.GATHERING].filter(k => count.byLife[k] > 0).map(k => `${LIFESTYLE_WORDS[k].toLowerCase()} ${millions(count.byLife[k])}`).join(', ');
        return head(`People — how many the land could feed, pre-industrial, with these techniques${when}`) +
            bar(PEOPLE_LOG, '1 · 5 · 20 · 60 · 150+ a km²') +
            note(`The whole land could feed about ${millions(count.people)} — ${Math.round(count.people / Math.max(1, count.land))} a km² on average (${by}); its richest river plains well over 100. ` +
                'Each place by its way of life (the Way of life view): poor ground farmed in long fallows — a rainforest’s fields cropped a year or two in ten, so it feeds a few a km² — ' +
                'herders a km² or two, gatherers a tenth to a few. What it could support, not how many would live there') + cameNote;
    }
    // Farmland
    const any = farmOptions.flood || farmOptions.canal;
    const look = chip('classes', 'Classes', 'Graded classes — barren, poor, fair, good, excellent — instead of the soft ramp', farmOptions.classes);
    const classes = [4, 3, 2, 1].map(k => sw(ramp(FARM_RAIN, CLASS_AT[k], c).slice(), CLASS_WORDS[k], T.tech[k])).join('');
    const scale = farmOptions.classes ? `<div class="evo-koppen">${classes}${any ? `<span><i style="background:${css(ramp(FARM_WATER, 0.55, c))}"></i>teal: with water brought</span>` : ''}</div>`
        : bar(FARM_RAIN, 'by rain: little → much') + (any ? bar(FARM_WATER, 'only with water brought') : '');
    const good = t => t[3] + t[4];
    if (!hasHarvests(fin.raster.farming)) return head('Farmland — add detail again to see it (this moment was detailed before the harvests were counted)');
    return head('Farmland — what the land could grow') + `<div class="evo-farm-chips">${look}</div>` + scale +
        note(`Good: one sure harvest a year · excellent: two or three, off renewed ground (${pct(T.tech[4])} of the land). Good or excellent: ${pct(good(T.tech))} with these techniques, ` +
            `${pct(good(T.rain))} by rain alone. Harvests × soil × ground — what the land could grow, not who would live there`);
}

/** A change in the legend's crop finder: the crop typed (its name, with or without "-like") shown alone; true if it was the
 *  finder. */
let finderFin = null;
export function farmInputChanged(target, fin = finderFin) {
    if (target?.matches?.('[data-farm-seed]')) {
        const k = Math.round(Number(target.value));
        if (!Number.isFinite(k) || k < 0 || k > FOOD_SEED_MAX || k === farmOptions.foodSeed) return false;
        farmOptions.foodSeed = k; farmOptions.variant = -1; farmOptions.crop = -1;
        return true;
    }
    if (!target?.matches?.('[data-farm-find]')) return false;
    const MN = fin && minorNow(fin), q = target.value.trim().toLowerCase().replace(/-like.*$/, '');
    if (!MN || !q) return false;
    // (any crop of the catalogue — the grown first where names start alike)
    const I = MN.items.find(x => x.name.toLowerCase() === q) ?? MN.items.find(x => MN.built[x.id].exists && x.name.toLowerCase().startsWith(q)) ?? MN.items.find(x => x.name.toLowerCase().startsWith(q));
    if (!I) return false;
    farmOptions.crop = I.id;
    return true;
}
/** A click on a legend chip: its option flipped; true if it was one. */
/** The Origins view's history run, with the options shown (farming-store.js hearthsOf) — null without a history. */
const farmingOrigins = fin => hearthsOf(fin, farmOptions.foodSeed, farmOptions.fewer);
const farmingOptionsOrigin = () => farmOptions.origin;
/** The pins over the planet (evolution-main placePins): the primary hearths, numbered in the order they began — on the
 *  Origins view; [] on the others. */
export function farmingPins(layer, fin) {
    if (layer === 'farmCrops' && fin?.raster?.farming && farmOptions.crop >= 0) {
        const MN = minorNow(fin), B = MN?.built[farmOptions.crop];
        return B?.exists ? B.homes.map(h => { const S = MN.sites[h.site]; return { lat: S.lat, lon: S.lon, label: '◆', fill: css(itemColours(MN.items)[farmOptions.crop]), ring: 'rgba(255, 252, 244, 0.95)', ink: '#fff' }; }) : [];
    }
    if (layer !== 'farmOrigins' || !fin?.raster?.farming) return [];
    const run = farmingOrigins(fin);
    return run ? run.hearths.map(C => ({ lat: C.lat, lon: C.lon, label: String(C.hearth), fill: css(hearthRGB(C.hearth)), ring: C.founder ? '#f5d76e' : 'rgba(255, 252, 244, 0.95)', ink: '#fff' })) : [];
}
export function farmChipClicked(target) {
    const set = target.closest?.('[data-farm-settoggle]');
    if (set) { settingsOpen = !settingsOpen; set.closest('.evo-farm-set')?.classList.toggle('open', settingsOpen); set.setAttribute('aria-expanded', String(settingsOpen)); return false; }
    if (target.closest?.('[data-farm-reroll]')) { let k; do k = randomFoodSeed(); while (k === farmOptions.foodSeed); farmOptions.foodSeed = k; farmOptions.variant = -1; farmOptions.crop = -1; return true; }
    const one = target.closest?.('[data-farm-only]');
    if (one) { const k = Number(one.dataset.farmOnly); farmOptions.only = farmOptions.only === k ? 0 : k; return true; }
    const life = target.closest?.('[data-farm-life]');
    if (life) { const k = Number(life.dataset.farmLife); farmOptions.life = farmOptions.life === k ? 0 : k; return true; }
    const way = target.closest?.('[data-farm-way]');
    if (way) { const k = Number(way.dataset.farmWay); farmOptions.way = farmOptions.way === k ? 0 : k; return true; }
    const origin = target.closest?.('[data-farm-origin]');
    if (origin) { farmOptions.origin = origin.dataset.farmOrigin; return true; }
    const wild = target.closest?.('[data-farm-wild]');
    if (wild) { const k = Number(wild.dataset.farmWild); farmOptions.wild = farmOptions.wild === k ? -1 : k; return true; }
    const look = target.closest?.('[data-farm-croplook]');
    if (look) { farmOptions.cropLook = look.dataset.farmCroplook; farmOptions.crop = -1; return true; }
    const crop = target.closest?.('[data-farm-crop]');
    if (crop) { const k = Number(crop.dataset.farmCrop); farmOptions.crop = farmOptions.crop === k ? -1 : k; return true; }
    const real = target.closest?.('[data-farm-real]');
    if (real) { farmOptions.real = real.dataset.farmReal; farmOptions.variant = -1; return true; }
    const pull = target.closest?.('[data-farm-pull]');
    if (pull) { farmOptions.pull = pull.dataset.farmPull; farmOptions.variant = -1; return true; }
    // (the pick row's ‹ › ×: the one before or after the picked in the chips' order — from either end where none is — or none)
    const step = target.closest?.('[data-farm-step]');
    if (step) {
        if (step.disabled) return false;
        const key = step.dataset.farmStep, d = Number(step.dataset.step), ids = step.dataset.ids ? step.dataset.ids.split(',').map(Number) : [];
        if (!d) { farmOptions[key] = -1; return true; }
        if (!ids.length) return false;
        const k = ids.indexOf(farmOptions[key]);
        farmOptions[key] = ids[k < 0 ? (d > 0 ? 0 : ids.length - 1) : (k + d + ids.length) % ids.length];
        return true;
    }
    const variant = target.closest?.('[data-farm-variant]');
    if (variant) { const k = Number(variant.dataset.farmVariant); farmOptions.variant = farmOptions.variant === k ? -1 : k; return true; }
    const age = target.closest?.('[data-farm-age]');
    if (age) { farmOptions.age = age.dataset.farmAge; return true; }
    const beast = target.closest?.('[data-farm-beast]');
    if (beast) { const k = Number(beast.dataset.farmBeast); farmOptions.beast = farmOptions.beast === k ? 0 : k; return true; }
    const b = target.closest?.('[data-farm]');
    if (!b) return false;
    farmOptions[b.dataset.farm] = !farmOptions[b.dataset.farm];
    // (Fewer gaps draws another history: its strains are others — the picked one goes, as on a re-roll)
    if (b.dataset.farm === 'fewer') farmOptions.variant = -1;
    return true;
}
// ── names in words (F5a) ──
/** The names as the options say (the realism, the likeness pull, the names' re-roll). */
const namesNow = fin => namesOf(fin, farmOptions.foodSeed, farmOptions.fewer, farmOptions.pull, 0, farmOptions.real);
/** A centre's strain of archetype `a`, by name — or the archetype's word (no history names). */
function strainName(fin, centre, a) {
    const N = namesNow(fin), S = N?.strains.find(s => s.centre === centre && s.a === a);
    return S?.label || ARCHETYPES[a].word.toLowerCase();
}
/** The age a view's names read the history at (Infinity: all that ever came). */
const namesAge = layer => (!AS_CAME.has(layer) || farmOptions.age === 'full' ? Infinity : farmOptions.age === 'best' ? null : AGES.k10);
/** The name of the leading strain of archetype `a` at (lat, lon), as the views read it — '' where none had come. */
function hereName(fin, a, lat, lon, layer) {
    if (!farmOptions.named) return '';
    const N = namesNow(fin), S = N && strainsOf(fin, farmOptions.foodSeed, farmOptions.fewer, namesAge(layer));
    if (!S) return '';
    const s = strainVote(S.Gm, S.R.group[a], lat, lon);
    return s >= 0 ? N.strains[s].label : '';
}
/** Every crop group that grows here and beast kept here that had come, ranked (the main first), each by its leading
 *  strain's name and its other varieties in brackets ("emmer-like (main; also einkorn-like)"). */
function hereNames(fin, lat, lon, layer, cropA = -1, beastA = -1) {
    const N = namesNow(fin), S = N && strainsOf(fin, farmOptions.foodSeed, farmOptions.fewer, namesAge(layer));
    if (!S) return null;
    const H = strainsHere(S, lat, lon, namesAge(layer)), name = x => N.strains[x.id].label;
    // (the place's staple's group and its leading beast first: its main crop and beast, as Staple food and Animals show)
    // (where its 1° cell's ranks lack it — kept too poorly there on the whole — its own strain read from the group's map)
    const first = (list, a) => { if (a < 0) return; const k = list.findIndex(G => G.a === a); if (k > 0) list.unshift(...list.splice(k, 1)); else if (k < 0) { const id = strainVote(S.Gm, S.R.group[a], lat, lon); if (id >= 0) list.unshift({ a, score: 0, strains: [{ id }] }); } };
    first(H.crops, cropA); first(H.beasts, beastA);
    const word = (G, r) => { const more = G.strains.slice(1).map(name); return `${name(G.strains[0])}${r === 0 || more.length ? ` (${[r === 0 ? 'main' : '', more.length ? `also ${more.join(', ')}` : ''].filter(Boolean).join('; ')})` : ''}`; };
    return { crops: H.crops.map(word), beasts: H.beasts.map(word), nCrops: H.crops.length, nBeasts: H.beasts.length };
}
// ── the readout ──
const SOIL_GRADE = s => (s >= 0.75 ? 'rich' : s >= 0.5 ? 'good' : s >= 0.3 ? 'middling' : s >= 0.12 ? 'poor' : 'barren');
const GROUND = (slope, wet, opt) => (wet >= 0.35 ? `waterlogged${opt.raised ? ' — raised fields drain it' : ''}`
    : slope < 5 ? 'flat' : slope < 12 ? 'rolling' : slope < 30 ? `hilly${opt.terrace ? ' — terraced' : ''}` : slope < 75 ? `steep${opt.terrace ? ' — terraced' : ''}` : 'too steep to farm');
/** The hover readout's farming lines at (u, v) of the map (0…1); `sea`: the picture is sea there. */
export function farmingLines(fin, u, v, sea, layer = null) {
    const F = fin?.raster?.farming, K = fin?.climate?.raster;
    if (!F || !K || sea) return [];
    const x = Math.min(F.w - 1, Math.floor(u * F.w)), i = landPixel(K, F.w, x, Math.min(F.h - 1, Math.floor(v * F.h)));
    if (i < 0) return [];
    const L = (label, text) => `<span class="hi-label">${label}</span> ${text}`;
    if (K.koppen[i] === KOPPEN_ID.EF) return [L('Farmland', 'none — under ice')];
    let beastMain = -1;
    // (its pixel's place — its centre, as the views read it: farming-store.js — and, on a view shown as it came, what had come)
    const plat = 90 - (((i / F.w) | 0) + 0.5) / F.h * 180, plon = ((i % F.w) + 0.5) / F.w * 360 - 180;
    const Cv = cameView(fin, layer), came = Cv ? cameAt(Cv, plat, plon, {}) : null;
    const p = {}, opt = farmOptions, r = placeAt(F, i, p, new Float64Array(2 * CROPS.length), opt, { scores: new Float64Array(STAPLES.length), foods: new Float64Array(STAPLES.length) }, came), lines = [];
    if (!hasHarvests(F)) return [L('Farmland', 'add detail again to see it')];
    const g0 = {}, lv = livingAt(F, i, plat, plon, p, r, groundOf(fin), opt, g0, {});
    // (its way of life — its food system and why, a second where it does nearly as well — its beasts, and its staple food)
    const R = fin.raster;
    if (hasMeasures(R, K)) {
        const M = {}, bp = newBeasts(), sy = systemAt(R, K, i, p, r, lv, g0, plat, M, bp, {}, flyAtOf(fin, opt.foodSeed, opt.fewer)(plat, plon), came);
        const life = lv.lifestyle ? ` (${LIFESTYLE_WORDS[lv.lifestyle].toLowerCase()}${lv.lifestyle === Lifestyle.GATHERING ? `, ${foragerWord(M, g0)}` : ''})` : '';
        lines.push(L('Way of life', sy.system ? `<b>${FOOD_SYSTEM_WORDS[sy.system]}</b>${life} — ${FOOD_SYSTEMS[sy.system].why}${sy.second ? ` · and ${FOOD_SYSTEM_WORDS[sy.second].toLowerCase()}` : ''}` : 'uninhabited'));
        const flyWords = bp.fly >= 0.5 ? ' · in the fly belt: no cattle, horses or buffalo, no plough' : bp.fly >= 0.25 ? ' · on the fly belt’s edge' : '';
        const bName = bp.beast ? hereName(fin, beastArchetype(bp.beast), plat, plon, layer) : '';
        if (bp.beast && keepsBeasts(lv)) beastMain = beastArchetype(bp.beast);
        if (keepsBeasts(lv)) lines.push(L('Animals', bp.beast ? `<b>${BEAST_WORDS[bp.beast]}</b>${bName ? ` — <b>${bName}</b>` : ''} (${BEASTS[bp.beast].like}: ${BEASTS[bp.beast].roles})${bp.second ? ` · then ${BEAST_WORDS[bp.second].toLowerCase()}` : ''}${flyWords}` : `none kept well${flyWords}`));
    }
    // (Crops: every crop beyond the staples grown here, by kind)
    if (layer === 'farmCrops') {
        const MN = minorNow(fin), age = cropAge();
        if (MN) {
            finderFin = fin;
            const Gm = MN.Gm, c1 = Math.min(Gm.h - 1, Math.floor((90 - plat) / Gm.deg)) * Gm.w + ((Math.floor((plon + 180) / Gm.deg) % Gm.w) + Gm.w) % Gm.w, ab = age === null ? 254 : age === Infinity ? ARRIVE_NEVER - 1 : arriveByte(age);
            const farmed = age === null || (MN.farm[c1] <= age && MN.farm[c1] < Infinity);
            const by = KINDS.map(K => MN.items.filter(I => I.kind === K.key && MN.built[I.id].exists && I.fit8[c1] >= GROWN_FIT && (age === null || MN.built[I.id].arrive[c1] <= ab)).sort((a, b) => b.fit8[c1] - a.fit8[c1]).map(I => I.label));
            const n = by.reduce((s, l) => s + l.length, 0);
            const rows = farmed ? KINDS.map((K, k) => (by[k].length ? L(K.word, by[k].slice(0, 12).join(', ') + (by[k].length > 12 ? ` and ${by[k].length - 12} more` : '')) : null)).filter(Boolean) : [];
            lines.unshift(...(farmed ? [L('Crops', `<b>${n}</b> beyond the staples${age === null ? ' could grow here' : ' grown here'}`), ...rows] : [L('Crops', 'farming had not come')]));
        }
    }
    // (Origins: the wild larder here, the hearth odds, the landmass and its luck)
    const G = layer === 'farmOrigins' ? historyOf(fin) : null;
    if (G) {
        const luck = luckOf(fin, opt.foodSeed, opt.fewer), m = massAt(G, plat, plon), NB = BEASTS.length;
        const wild = ARCHETYPES.map((A, k) => [A, fieldAt(G, G.niche[k], plat, plon)]).filter(([, v]) => v >= 0.3).sort((a, b) => b[1] - a[1])
            .map(([A]) => (A.beast ? `${A.like.replace(/^like /, '')}${m >= 0 && luck.has[m * NB + A.beast] ? '' : ' (none on this landmass)'}` : A.word.toLowerCase()));
        lines.unshift(L('Wild larder', wild.length ? wild.join(', ') : 'nothing to tame or sow'));
        const rank = oddsRank(G, fieldAt(G, G.odds, plat, plon));
        // (the history: when farming came, from which hearth; a hearth near)
        const run = hearthsOf(fin, opt.foodSeed, opt.fewer);
        if (run) {
            const q = cellAt(G, plat, plon), t = run.farmTime[q], from = run.farmFrom[q], root = from >= 0 ? run.centres[run.centres[from].root] : null;
            lines.unshift(L('Farming came', t < Infinity ? `${t < 50 ? 'first, here' : `~${(Math.round(t / 100) * 100).toLocaleString()} years after the first`}${root?.hearth ? ` · from hearth ${root.hearth}` : ''}` : 'never: nothing fit to farm reached it'));
            let near = null, nd = 400;
            for (const C of run.hearths) { const r = Math.PI / 180, d = 2 * 6371 * Math.asin(Math.sqrt(Math.sin((C.lat - plat) * r / 2) ** 2 + Math.cos(C.lat * r) * Math.cos(plat * r) * Math.sin((C.lon - plon) * r / 2) ** 2)); if (d < nd) { nd = d; near = C; } }
            if (near) lines.unshift(L(`Hearth ${near.hearth}`, `${near.founder ? 'a founder · ' : ''}${near.t0 < 50 ? 'the first farming' : `began ~${(Math.round(near.t0 / 100) * 100).toLocaleString()} years after the first`} · tamed ${near.items.map(it => `${strainName(fin, near.id, it.a)}${it.t - near.t0 >= 50 ? ` (+${(Math.round((it.t - near.t0) / 100) * 100).toLocaleString()})` : ''}`).join(', ')}`));
        }
        lines.splice(1 + (run ? 1 : 0), 0, L('Hearth odds', rank >= 0.9 ? `<b>high</b> — the top ${Math.max(1, Math.round(100 * (1 - rank)))} % of the land` : rank >= 0.6 ? 'middling' : 'low'));
        if (m >= 0) {
            const M2 = G.masses[m], beasts = BEASTS.map((B, b) => (b && luck.has[m * NB + b] ? B.like.replace(/^like /, '') : null)).filter(Boolean);
            lines.splice(2, 0, L('Landmass', `${M2.area >= 1e6 ? `${(M2.area / 1e6).toFixed(1)} M` : `${Math.round(M2.area / 1e3)} thousand`} km² · its beasts: ${beasts.length ? beasts.join(', ') : 'none to tame'}${luck.fly[m] ? ' · the fly' : ''}`));
        }
    }
    // (as it came: what would grow or be kept well here but had not come — or that everything had)
    if (came) {
        const G = Cv.G, missing = ARCHETYPES.map((A, k) => [A, k]).filter(([A, k]) => !((came.mask >> k) & 1) && fieldAt(G, A.beast ? G.keep[A.beast] : G.fit[A.crop], plat, plon) >= 0.25)
            .map(([A]) => (A.beast ? A.like.replace(/^like /, '') : A.word.toLowerCase()));
        const full = opt.age === 'full';
        lines.unshift(L('As it came', missing.length ? `${full ? 'never came' : 'not yet come by 10,000 years'}: ${missing.join(', ')}` : `everything that grows or is kept well here ${full ? 'came in the end' : 'had come by 10,000 years'}`));
    }
    if (!hasMeasures(R, K)) lines.push(L('Lifestyle', lv.lifestyle ? `<b>${LIFESTYLE_WORDS[lv.lifestyle]}</b>${lv.secondLife ? ` · and ${LIFESTYLE_WORDS[lv.secondLife].toLowerCase()}` : ''}` : 'uninhabited'));
    const sName = lv.staple && STAPLE_CROP[lv.staple] >= 0 ? hereName(fin, STAPLE_CROP[lv.staple], plat, plon, layer) : '';
    if (lv.staple) lines.push(L('Staple food', `<b>${STAPLE_WORDS[lv.staple]}</b>${sName ? ` — <b>${sName}</b>` : ''}${lv.second ? ` · then ${STAPLE_WORDS[lv.second].toLowerCase()}` : ''}`));
    // (named: every crop and beast that grows or is kept well here and had come, by name)
    const here = farmOptions.named ? hereNames(fin, plat, plon, layer, lv.staple ? STAPLE_CROP[lv.staple] : -1, beastMain) : null;
    if (here?.crops.length) lines.push(L('Core crops', here.crops.join(' · ')));
    if (here?.beasts.length) lines.push(L('Beasts here', here.beasts.join(' · ')));
    // (how many it could feed; on poor ground, how long its fields rest — a year cropped in so many, shifting
    // cultivation's; gatherers' land, what farming or herding would have fed instead)
    const n = v => (v < 10 ? v.toFixed(v < 1 ? 2 : 1) : String(Math.round(v)));
    const every = Math.round(1 / croppedShare(p, opt)), rested = lv.lifestyle === Lifestyle.FARMING && every >= 2 ? ` · a field cropped ~1 year in ${every}` : '';
    const instead = lv.lifestyle === Lifestyle.GATHERING && lv.landPeople >= 0.05 ? ` · ${r.staple === Staple.HERDING ? 'herding' : 'farming'} ~${n(lv.landPeople)} — not ${GATHER.hold}× as many` : '';
    lines.push(L('People', lv.people < 0.005 ? 'too few to count' : `could feed ~${n(lv.people)} a km²${rested}${instead}`));
    const cls = farmClass(r.tech), clsRain = farmClass(r.rain);
    // (when it brings its harvest in: its neighbourhood's month — a farming place's)
    const own = harvestMonthAt(F, i, r, lv);
    if (own >= 0) { const m = calendarMonth(calendarOf(fin), 90 - v * 180, u * 360 - 180, own); lines.push(L('Harvest', m === MONTH_ALL_YEAR ? 'all year round, as each field ripens' : `in ${MONTH_WORDS[m]}`)); }
    // (the harvests a year: whole ones in words, a part one as "about"; the second crop of a rotation counted in them)
    const hw = h => (h < 0.15 ? 'no sure harvest' : h < 0.75 ? 'a poor harvest' : h < 1.35 ? 'one harvest a year' : h < 1.75 ? 'one and a half harvests a year' : `about ${Math.round(h)} harvests a year`);
    lines.push(L('Farmland', `<b>${CLASS_WORDS[cls]}</b> · ${hw(r.harvests)}${cls !== clsRain ? ` · by rain alone ${CLASS_WORDS[clsRain].toLowerCase()}` : ''}`));
    if (r.water >= 0.05 && (opt.flood || opt.canal)) {
        const how = opt.flood && p.flood >= p.canal * 0.8 && p.flood >= 0.05 ? 'a big river’s floodplain' : 'canals from a river or lake';
        lines.push(L('Water', `${how}${r.water < 0.5 ? ' (its edge)' : ''}`));
    }
    const kind = F.kind[i] & 15, mod = F.kind[i] >> 4;
    lines.push(L('Soil', `${kind && kind !== SoilKind.UNKNOWN ? SOIL_WORDS[kind] : 'soil'}${mod ? ` · ${MOD_WORDS[mod]}` : ''} — ${SOIL_GRADE(p.soil)}`));
    const m = s => `${Math.round(s)} month${Math.round(s) === 1 ? '' : 's'}`;
    lines.push(L('Season', `${m(p.rain)} by rain${p.warm - p.rain >= 0.5 ? ` · ${m(p.warm)} watered` : ''}`));
    lines.push(L('Ground', GROUND(p.slope, p.wetland, opt)));
    return lines;
}
