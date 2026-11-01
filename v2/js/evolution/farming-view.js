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

import { farmClass, hasHarvests, CROP_STAPLE, hasMonths, MONTH_ALL_YEAR, Staple, STAPLES, STAPLE_WORDS, CROPS, SOIL_WORDS, MOD_WORDS, SoilKind } from '../farming/farming.js';
import { croppedShare } from '../farming/people.js';
import { LIFESTYLES, LIFESTYLE_WORDS, Lifestyle, GATHER, livingPeople,
    FOOD_SYSTEMS, FOOD_SYSTEM_WORDS, foragerWord, hasMeasures } from '../farming/living.js';
import { BEASTS, BEAST_WORDS, newBeasts } from '../farming/beasts.js';
import { partsAt, placeAt, groundOf, livingAt, systemAt, keepsBeasts, placesOf, waysOf, onlyOf, lifeAloneOf, beastAloneOf, slotOf, dec, decLog, peopleFromLog, historyOf, luckOf, flyAtOf, hearthsOf, cameOf, cameAt } from './farming-store.js';
import { ARCHETYPES, fieldAt, massAt, oddsRank, cellAt } from '../farming/history.js';
import { placeMonth, calendarGround, calendarMonth } from '../farming/calendar.js';
import { landPixel } from './climate-view.js';
import { KOPPEN_ID } from '../climate/koppen.js';

export const FARMING_LAYERS = new Set(['farmLand', 'farmStaple', 'farmLife', 'farmAnimals', 'farmOrigins', 'farmPeople', 'farmSoil', 'farmSeason']);
export const FARMING_NAMES = { farmLand: 'Farmland', farmStaple: 'Staple food', farmLife: 'Way of life', farmAnimals: 'Animals', farmOrigins: 'Origins', farmPeople: 'People', farmSoil: 'Soil', farmSeason: 'Growing season' };
/** The techniques chosen and the looks (the legend's chips) — every view's, for as long as the page is open. `only`: the
 *  Staple food view's one food shown alone (a Staple, or 0 for all); `life` the Way of life view's lifestyle alone in Simple
 *  (a Lifestyle), `way` its food system alone (a FoodSystem), `simple` the three lifestyles instead; `beast` the Animals
 *  view's one beast alone (a Beast); `origin` the Origins view's look ('larder', 'odds', 'came' or 'from'), `wild` its one archetype alone
 *  (history.js ARCHETYPES, or -1 for all); `roll` the luck's re-roll and `fewer` Fewer gaps (every view's luck); `age` what
 *  Staple food, Way of life, Animals and People show: 'k10' what had come 10,000 years after the first farming, 'full' its
 *  full spread, 'best' the best possible (AGES). */
export const farmOptions = { flood: true, canal: true, terrace: true, raised: true, classes: false, watered: false, only: 0, life: 0, simple: false, way: 0, beast: 0, origin: 'larder', wild: -1, roll: 0, fewer: false, age: 'k10' };
/** The views shown as it came, and the ages: years after the first farming (Infinity: all that would ever come) — the
 *  owner's, 2026-10-31: "10,000 years by default", and the full spread too. */
export const AS_CAME = new Set(['farmStaple', 'farmLife', 'farmAnimals', 'farmPeople']);
const AGES = { k10: 10000, full: Infinity };
/** What a view shows had come (farming-store.js cameOf), or null — the land's own: the best possible, a view not shown as it
 *  came, or a moment without a history. */
const cameView = (fin, layer, opt = farmOptions) => (AS_CAME.has(layer) && opt.age !== 'best' ? cameOf(fin, opt.roll, opt.fewer, AGES[opt.age] ?? AGES.k10) : null);
/** The options as a key (a picture or a legend made with other options is made again). */
export const farmOptionsKey = () => Object.entries(farmOptions).map(([k, v]) => `${k}=${typeof v === 'string' ? v : +v}`).join(',');
/** The techniques alone as a key: what the farming, the ways of life, the people and the harvest months depend on — the
 *  looks (one alone, Simple, classes) only colour them, so a cache keyed on this survives a look's chip. */
const techKey = () => `${+farmOptions.flood}${+farmOptions.canal}${+farmOptions.terrace}${+farmOptions.raised}`;
/** …and with the luck (the fly's: the ways of life and the beasts depend on it). */
const waysKey = (o = farmOptions) => `${+o.flood}${+o.canal}${+o.terrace}${+o.raised}|${o.roll}|${+o.fewer}`;
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
/** A hash-dithered nudge (degrees, ±0.3 of a cell) so the hearths' borders on the grid fray rather than step. */
const nudge = (x, y, k) => { let h = Math.imul(x * 73856093 ^ y * 19349663 ^ k * 83492791, 0x9e3779b1); h ^= h >>> 15; return ((h >>> 0) / 4294967296 - 0.5) * 0.6; };
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

/** A Food view's colours (returned: { c, c2, hd }) at a land pixel i of the farming picture, (x, y) on a picture W wide:
 *  the view's colours before the light — c its own, c2 a second's (striped where it does nearly as well; else c) and hd the
 *  fly belt's darkening of its hatching (1 none) — the ice pale. The stripes and hatching are the drawn picture's
 *  (finishedFarmingColor); Origins, read between the history's cells at (x, y), hatches here. */
function farmPixelColour(layer, fin, W) {
    const F = fin?.raster?.farming, K = fin?.climate?.raster;
    const c = [0, 0, 0], tmp = [0, 0, 0], p = {}, opt = { ...farmOptions }, key = techKey(), kef = KOPPEN_ID.EF, H = W >> 1;
    const C = cameView(fin, layer, opt), flyAt = flyAtOf(fin, opt.roll, opt.fewer), wk = waysKey(opt);
    const Y = layer === 'farmAnimals' || (layer === 'farmLife' && !opt.simple) ? waysOf(fin, opt, wk, flyAt, C, key) : null;
    const P = layer === 'farmSoil' || layer === 'farmSeason' || layer === 'farmOrigins' ? null : placesOf(fin, opt, key, C), ix = P?.index;
    // (Origins: the history's ground and each landmass's luck)
    const G = layer === 'farmOrigins' ? historyOf(fin) : null, luck = G ? luckOf(fin, opt.roll, opt.fewer) : null;
    const run = G && (opt.origin === 'came' || opt.origin === 'from') ? hearthsOf(fin, opt.roll, opt.fewer) : null;
    // (a chip's one alone: its values, worked out the first time)
    const A = layer === 'farmStaple' && opt.only ? onlyOf(fin, opt, key, opt.only, C)
        : layer === 'farmLife' && !Y && opt.life ? lifeAloneOf(fin, opt, key, opt.life, C)
            : layer === 'farmAnimals' && Y && opt.beast ? beastAloneOf(fin, opt, wk, opt.beast, flyAt, C) : null;
    const pale = () => { c[0] = STAPLE_PALE[0]; c[1] = STAPLE_PALE[1]; c[2] = STAPLE_PALE[2]; };
    const c2 = [0, 0, 0], px = { c, c2, hd: 1 };
    return (i, x, y) => {
        let two = false;
        px.hd = 1;
        if (K.koppen[i] === kef) { c[0] = ICE[0]; c[1] = ICE[1]; c[2] = ICE[2]; }
        else if (layer === 'farmSoil') ramp(SOIL, partsAt(F, i, p).soil, c);
        else if (layer === 'farmSeason') { partsAt(F, i, p); ramp(SEASON, opt.watered ? p.warm : p.rain, c); }
        else if (layer === 'farmOrigins') {
            // (the history's ground, read between its cells: the hearth odds; one archetype's wild home — a beast's only where
            // its landmass has it, hatched where its habitat is but it does not; or the larder's variety)
            if (!G) pale();
            else {
                const lat = 90 - (y + 0.5) / H * 180, lon = (x + 0.5) / W * 360 - 180;
                if (opt.origin === 'came' && run) {
                    // (years after the first farming, a line each thousand: where the band differs a texel east or south)
                    const t = timeAt(G, run.farmTime, lat, lon);
                    if (!(t < Infinity)) { c[0] = NEVER[0]; c[1] = NEVER[1]; c[2] = NEVER[2]; }
                    else {
                        ramp(ARRIVE, t, c);
                        const step = 360 / W, te = timeAt(G, run.farmTime, lat, lon + step), ts = timeAt(G, run.farmTime, lat - step, lon), band = Math.floor(t / 1000);
                        if ((te < Infinity && Math.floor(te / 1000) !== band) || (ts < Infinity && Math.floor(ts / 1000) !== band)) { c[0] *= 0.78; c[1] *= 0.78; c[2] *= 0.78; }
                    }
                } else if (opt.origin === 'from' && run) {
                    // (each primary hearth's lands in its colour, paler the later its farming came; a centre of its own, or never, pale)
                    const q = cellAt(G, lat + nudge(x, y, 1) * G.deg, lon + nudge(x, y, 2) * G.deg), from = run.farmFrom[q];
                    const root = from >= 0 ? run.centres[run.centres[from].root] : null;
                    if (!root?.hearth) { const n = root ? [196, 186, 168] : NEVER; c[0] = n[0]; c[1] = n[1]; c[2] = n[2]; }
                    else { const h = hearthRGB(root.hearth), k = 0.9 - 0.45 * smooth(0, 10000, run.farmTime[q]); for (let s = 0; s < 3; s++) c[s] = STAPLE_PALE[s] + (h[s] - STAPLE_PALE[s]) * k; }
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
                else { const st = P.staple[q], nd = st >> 4; stapleColour(st & 15, dec(P.score[q]), c); if (nd) { stapleColour(nd, dec(P.score2[q]), c2); two = true; } }
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
                    else if (!(Y.flags[q] & 1)) pale();
                    else { beastColour(b1, dec(Y.keep1[q]), c); if (b2) { beastColour(b2, dec(Y.keep2[q]), c2); two = true; } }
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
    const pix = farmPixelColour(layer, fin, F.w), n = F.w * F.h, buf = { pri: new Uint8ClampedArray(3 * n), sec: new Uint8ClampedArray(3 * n), hd: new Uint8ClampedArray(n) };
    for (let y = 0; y < F.h; y++) for (let x = 0, i = y * F.w; x < F.w; x++, i++) {
        if (!K.koppen[i]) continue;
        const { c, c2, hd } = pix(i, x, y);
        buf.pri[3 * i] = c[0]; buf.pri[3 * i + 1] = c[1]; buf.pri[3 * i + 2] = c[2];
        buf.sec[3 * i] = c2[0]; buf.sec[3 * i + 1] = c2[1]; buf.sec[3 * i + 2] = c2[2];
        buf.hd[i] = Math.round(255 * hd);
    }
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
    if (layer === 'farmOrigins') {
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
 *  odds (0…1), `farmCame` the years after the first farming that it came (65,535 never) — the ice farms nothing; each read
 *  from the store as the views are (people, staple, lifestyle, food system and beast as it came, with the age chosen). */
export function finishedFarmingValue(key, fin, W) {
    const F = fin?.raster?.farming, K = fin?.climate?.raster, kef = KOPPEN_ID.EF;
    if (!F || !K) return () => NaN;
    const p = {}, opt = { ...farmOptions }, tk = techKey(), parts = key === 'soil' || key === 'seasonRain' || key === 'seasonWatered', sys = key === 'foodSystem' || key === 'beast' || key === 'flyBelt';
    const hist = key === 'larderVariety' || key === 'hearthOdds' || key === 'farmCame', G = hist ? historyOf(fin) : null, H = W >> 1;
    if (key === 'farmCame') { const run = G && hearthsOf(fin, farmOptions.roll, farmOptions.fewer); return run ? (x, y) => { if (landPixel(K, W, x, y) < 0) return NaN; const t = timeAt(G, run.farmTime, 90 - (y + 0.5) / H * 180, (x + 0.5) / W * 360 - 180); return t < Infinity ? t : 65535; } : () => NaN; }
    if (hist) return G ? (x, y) => (landPixel(K, W, x, y) < 0 ? NaN : fieldAt(G, key === 'hearthOdds' ? G.odds : G.variety, 90 - (y + 0.5) / H * 180, (x + 0.5) / W * 360 - 180)) : () => NaN;
    const C = key === 'farmTech' || key === 'farmRain' ? null : cameView(fin, 'farmStaple', opt);
    const Y = sys ? waysOf(fin, opt, waysKey(opt), flyAtOf(fin, opt.roll, opt.fewer), C, tk) : null, P = parts ? null : placesOf(fin, opt, tk, C), ix = P?.index;
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
    const system = new Float64Array(FOOD_SYSTEMS.length), beast = new Float64Array(BEASTS.length), kef = KOPPEN_ID.EF, Y = waysOf(fin, farmOptions, waysKey(), flyAtOf(fin, farmOptions.roll, farmOptions.fewer), C, techKey());
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
const pct = v => `${Math.round(100 * v)}%`;

export function farmingLegendHTML(layer, fin) {
    const head = t => `<div class="evo-legend-head">${t}</div>`, note = t => `<div class="evo-legend-note">${t}</div>`;
    if (!fin?.raster?.farming) return head('Food — add detail again to see it (this moment was detailed before these views were added)');
    // (as it came: what the view shows — the age chips, its words for the head and the note; none without a history)
    const C = cameView(fin, layer), canCame = AS_CAME.has(layer) && !!historyOf(fin), ageOn = canCame ? farmOptions.age : 'best';
    const ageChip = (k, label, title) => `<button type="button" class="evo-farm-chip${ageOn === k ? ' on' : ''}" data-farm-age="${k}" aria-pressed="${ageOn === k}" title="${title}">${label}</button>`;
    const ages = canCame ? `<div class="evo-farm-chips">${ageChip('k10', '10,000 years', 'What had come to each place 10,000 years after the first farming anywhere: only the crops and beasts that had reached it (Origins shows when and from where)')}${ageChip('full', 'Full spread', 'Everything that would ever come to each place — the crops and beasts that could reach it, in time')}${ageChip('best', 'Best possible', 'What the land alone would support, as if every crop and beast had come everywhere')}</div>` : '';
    const when = C ? (farmOptions.age === 'full' ? ', once everything had come' : ', 10,000 years after farming began') : '';
    const cameNote = C ? note(`As it came: only the crops and beasts that had reached each place${farmOptions.age === 'full' ? ' in the end' : ' by 10,000 years after the first farming'} — farming spreads from its hearths ~1 km a year, a beast's ancestor lives on some landmasses and not others (Origins shows when and from where). Where no crop had come, people herd or gather; where no plough beast had, they farm by hand`) : '';
    // (a view of the ways: its store made first — the places' filled in the same pass)
    if ((layer === 'farmAnimals' || (layer === 'farmLife' && !farmOptions.simple)) && hasMeasures(fin.raster, fin.climate.raster)) waysOf(fin, farmOptions, waysKey(), flyAtOf(fin, farmOptions.roll, farmOptions.fewer), C, techKey());
    const T = tally(fin, C), sw = (c, label, share) => `<span><i style="background:${css(c)}"></i>${label} <em>${pct(share)}</em></span>`, c = [0, 0, 0];
    if (layer === 'farmSoil') return head('Soil — how fertile the ground is (on flat ground)') + bar(SOIL, 'poor → rich') +
        `<div class="evo-koppen">${['Barren', 'Poor', 'Middling', 'Good', 'Rich'].map((w, k) => sw(ramp(SOIL, [0.05, 0.2, 0.4, 0.62, 0.88][k], c).slice(), w, T.soil[k])).reverse().join('')}</div>` +
        note('River silt and loess richest, then volcanic ash, basalt, limestone and shale; sand, granite and old shields poor. Black earth under temperate grassland; leached in the hot wet tropics where nothing renews the ground; acid under boreal conifers');
    if (layer === 'farmSeason') return head(`Growing season — the months crops grow${farmOptions.watered ? ', watered' : ', by rain alone'}`) + bar(SEASON, '0 → 12 months') +
        `<div class="evo-farm-chips">${chip('watered', 'Watered', 'The months warm enough, were water brought — what irrigation could make of the season', farmOptions.watered)}</div>` +
        `<div class="evo-koppen">${['None', '1–3 months', '3–5', '5–8', '8+'].map((w, k) => sw(ramp(SEASON, [0, 2, 4, 6.5, 10][k], c).slice(), w, T.season[k])).reverse().join('')}</div>` +
        note('A month grows crops where it is warm enough (over ~5 °C, fully from 15) and wet enough — its rain, melt and the soil’s water past half what it could evaporate (the FAO’s growing period)');
    const chips = Object.entries(TECHNIQUE_WORDS).map(([k, [label, title]]) => chip(k, label, title, farmOptions[k])).join('');
    if (layer === 'farmStaple') {
        if (!hasHarvests(fin.raster.farming)) return head('Staple food — add detail again to see it (this moment was detailed before the harvests were counted)');
        // (each food a chip with its colour and its share of the land: a click shows it alone, again shows them all)
        const only = farmOptions.only, food = k => `<button type="button" class="evo-farm-chip evo-farm-staple${only === k ? ' on' : ''}" data-farm-only="${k}" aria-pressed="${only === k}" ` +
            `title="${only === k ? 'Show every food again' : `Show where ${STAPLE_WORDS[k].toLowerCase()} would feed people, and how well — alone`}"><i style="background:${css(STAPLE_RGB[k])}"></i>${STAPLE_WORDS[k]} <em>${pct(T.staple[k])}</em></button>`;
        return head(only ? `Staple food — ${STAPLE_WORDS[only].toLowerCase()} alone: where it would feed people, and how well${when}` : `Staple food — what each place would live on most${when}`) +
            `<div class="evo-farm-chips">${STAPLES.map((_, k) => k).filter(k => k !== Staple.NONE).map(food).join('')}</div>` + ages +
            `<div class="evo-farm-chips">${chips}</div>` + bar([[0, STAPLE_PALE], [1, [150, 150, 150]]], `paler where it feeds less well${only ? '' : '; striped where a second does nearly as well'}`) +
            note('What would feed each place best with these techniques — archetypes, not any one crop. Paddy grains feed the most on rich, level, wet ground; cool-season grains take ' +
                'the winters and the cool summers; warm-season grains the hot and the dry; roots the leached tropics and cold highlands; livestock the dry grass; ' +
                'tree and palm crops the ever-wet tropics and the hot oases; fish the coasts of cold, upwelling seas and the big rivers; wild foods the land no farmer or herder would hold') + cameNote;
    }
    const luckChips = `${chip('fewer', 'Fewer gaps', 'Make each landmass likelier to have each beast\'s wild ancestor, and the fly rarer', farmOptions.fewer)}<button type="button" class="evo-farm-chip" data-farm-roll title="Draw each landmass's luck again — which beasts' wild ancestors live on it, whether the fly does">Re-roll</button>`;
    if (layer === 'farmOrigins') {
        const G = historyOf(fin);
        if (!G) return head('Origins — add detail again to see them (this moment was detailed before these views were added)');
        const luck = luckOf(fin, farmOptions.roll, farmOptions.fewer), odds = farmOptions.origin === 'odds', one = farmOptions.wild;
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
                const h = hearthRGB(C.hearth), crops = C.items.slice(0, 3).map(it => `${ARCHETYPES[it.a].word.toLowerCase()} (${yrs(it.t)})`).join(', ');
                return `<span><i style="background:${css(h)}"></i><b>${C.hearth}${C.founder ? ' ★' : ''}</b> ${place2(C)}: ${crops}${came ? '' : ` <em>${pct(share[C.hearth] / Math.max(1e-9, landA))}</em>`}</span>`;
            }).join('');
            return head(came ? 'Origins — when farming came: years after the first farming anywhere' : 'Origins — from which hearth each place\'s farming came') + looks +
                (came ? bar(ARRIVE, '0 → 10,000+ years; a line each thousand') : '') + `<div class="evo-koppen evo-hearths">${list}</div>` + `<div class="evo-farm-chips">${luckChips}</div>` +
                note(`${run.hearths.length} hearths began farming on their own (★ the founders: early, far apart, leading with different crops); every other place adopted it as it spread — ~1 km a year, faster along rivers and coasts and through farmers, slower past rich foragers, across short seas — and tamed what grew wild there. Within 10,000 years it reached ${pct(reached / Math.max(1e-9, farmable))} of the land it could grow on${came ? '' : '; paler, the later it came'}`) + landmasses;
        }
        if (odds) return head('Origins — hearth odds: where farming would most likely begin') + looks + bar(ODDS, 'low → high') + `<div class="evo-farm-chips">${luckChips}</div>` +
            note('Higher where many crops\' and beasts\' wild ancestors grow within ~330 km, the seasons are strong (a dry or cold season to store food through), the land is productive, hills meet plains, water is near and the foragers\' own food is not too rich; none poleward of ~45°. Earth\'s centres — the Fertile Crescent, the Yellow and Yangtze rivers, Mesoamerica, the Andes, New Guinea, the Sahel and Ethiopia — sat in such places') + landmasses;
        const arch = k => { const A = ARCHETYPES[k], rgb = A.beast ? BEAST_RGB[A.beast] : STAPLE_RGB[CROP_STAPLE[A.crop]];
            return `<button type="button" class="evo-farm-chip evo-farm-staple${one === k ? ' on' : ''}" data-farm-wild="${k}" aria-pressed="${one === k}" title="${one === k ? 'Show the whole larder again' : `Show where wild ${A.word.toLowerCase()}${A.like ? ` (${A.like})` : ''} grow — alone`}"><i style="background:${css(rgb)}"></i>${A.word}</button>`; };
        return head(one >= 0 ? `Origins — wild ${ARCHETYPES[one].word.toLowerCase()}: where its wild ancestor grows${ARCHETYPES[one].beast ? ' (hatched: its habitat, but none lives on that landmass)' : ''}` : 'Origins — the wild larder: how many crops\' and beasts\' wild ancestors grow within reach') + looks +
            `<div class="evo-farm-chips">${ARCHETYPES.map((_, k) => arch(k)).join('')}</div>` + (one >= 0 ? bar([[0, STAPLE_PALE], [1, [150, 150, 150]]], 'paler where it grows less well') : bar(VARIETY, '0 → 6: crops 1 each, beasts ½')) +
            `<div class="evo-farm-chips">${luckChips}</div>` +
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
            `<div class="evo-farm-chips">${FOOD_SYSTEMS.map((_, k) => k).filter(k => k && Y.system[k] >= 0.0005).map(way).join('')}</div>` + ages +
            `<div class="evo-farm-chips">${simple}${chips}</div>` +
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
        return head(one ? `${BEAST_WORDS[one]} (${BEASTS[one].like}: ${BEASTS[one].roles}) — where it could be kept, and how well${when}` : `Animals — farmers’ and herders’ leading beast${when}`) +
            `<div class="evo-farm-chips">${BEASTS.map((_, k) => k).filter(k => k).map(beast).join('')}</div>` + ages +
            `<div class="evo-koppen">${fly}</div><div class="evo-farm-chips">${luckChips}</div>` +
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
            `<div class="evo-farm-chips">${[Lifestyle.FARMING, Lifestyle.HERDING, Lifestyle.GATHERING].map(way).join('')}</div>` + ages +
            `<div class="evo-farm-chips">${T.meas ? chip('simple', 'Simple', 'Back to each place’s food system: paddies, plough and flocks, hoe farming, nomadic herding, settled foragers…', farmOptions.simple) : ''}${chips}</div>` +
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
        return head(`People — how many the land could feed, pre-industrial, with these techniques${when}`) + ages + `<div class="evo-farm-chips">${chips}</div>` +
            bar(PEOPLE_LOG, '1 · 5 · 20 · 60 · 150+ a km²') +
            note(`The whole land could feed about ${millions(count.people)} — ${Math.round(count.people / Math.max(1, count.land))} a km² on average (${by}); its richest river plains well over 100. ` +
                'Each place by its way of life (the Lifestyle view): poor ground farmed in long fallows — a rainforest’s fields cropped a year or two in ten, so it feeds a few a km² — ' +
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
    return head('Farmland — what the land could grow') + `<div class="evo-farm-chips">${chips}${look}</div>` + scale +
        note(`Good: one sure harvest a year · excellent: two or three, off renewed ground (${pct(T.tech[4])} of the land). Good or excellent: ${pct(good(T.tech))} with these techniques, ` +
            `${pct(good(T.rain))} by rain alone. Harvests × soil × ground — what the land could grow, not who would live there`);
}

/** A click on a legend chip: its option flipped; true if it was one. */
/** The Origins view's history run, with the options shown (farming-store.js hearthsOf) — null without a history. */
const farmingOrigins = fin => hearthsOf(fin, farmOptions.roll, farmOptions.fewer);
const farmingOptionsOrigin = () => farmOptions.origin;
/** The pins over the planet (evolution-main placePins): the primary hearths, numbered in the order they began — on the
 *  Origins view; [] on the others. */
export function farmingPins(layer, fin) {
    if (layer !== 'farmOrigins' || !fin?.raster?.farming) return [];
    const run = farmingOrigins(fin);
    return run ? run.hearths.map(C => ({ lat: C.lat, lon: C.lon, label: String(C.hearth), fill: css(hearthRGB(C.hearth)), ring: C.founder ? '#f5d76e' : 'rgba(255, 252, 244, 0.95)', ink: '#fff' })) : [];
}
export function farmChipClicked(target) {
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
    if (target.closest?.('[data-farm-roll]')) { farmOptions.roll++; return true; }
    const age = target.closest?.('[data-farm-age]');
    if (age) { farmOptions.age = age.dataset.farmAge; return true; }
    const beast = target.closest?.('[data-farm-beast]');
    if (beast) { const k = Number(beast.dataset.farmBeast); farmOptions.beast = farmOptions.beast === k ? 0 : k; return true; }
    const b = target.closest?.('[data-farm]');
    if (!b) return false;
    farmOptions[b.dataset.farm] = !farmOptions[b.dataset.farm];
    return true;
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
    // (its pixel's place — its centre, as the views read it: farming-store.js — and, on a view shown as it came, what had come)
    const plat = 90 - (((i / F.w) | 0) + 0.5) / F.h * 180, plon = ((i % F.w) + 0.5) / F.w * 360 - 180;
    const Cv = cameView(fin, layer), came = Cv ? cameAt(Cv, plat, plon, {}) : null;
    const p = {}, opt = farmOptions, r = placeAt(F, i, p, new Float64Array(2 * CROPS.length), opt, { scores: new Float64Array(STAPLES.length), foods: new Float64Array(STAPLES.length) }, came), lines = [];
    if (!hasHarvests(F)) return [L('Farmland', 'add detail again to see it')];
    const g0 = {}, lv = livingAt(F, i, plat, plon, p, r, groundOf(fin), opt, g0, {});
    // (its way of life — its food system and why, a second where it does nearly as well — its beasts, and its staple food)
    const R = fin.raster;
    if (hasMeasures(R, K)) {
        const M = {}, bp = newBeasts(), sy = systemAt(R, K, i, p, r, lv, g0, plat, M, bp, {}, flyAtOf(fin, opt.roll, opt.fewer)(plat, plon), came);
        const life = lv.lifestyle ? ` (${LIFESTYLE_WORDS[lv.lifestyle].toLowerCase()}${lv.lifestyle === Lifestyle.GATHERING ? `, ${foragerWord(M, g0)}` : ''})` : '';
        lines.push(L('Way of life', sy.system ? `<b>${FOOD_SYSTEM_WORDS[sy.system]}</b>${life} — ${FOOD_SYSTEMS[sy.system].why}${sy.second ? ` · and ${FOOD_SYSTEM_WORDS[sy.second].toLowerCase()}` : ''}` : 'uninhabited'));
        const flyWords = bp.fly >= 0.5 ? ' · in the fly belt: no cattle, horses or buffalo, no plough' : bp.fly >= 0.25 ? ' · on the fly belt’s edge' : '';
        if (keepsBeasts(lv)) lines.push(L('Animals', bp.beast ? `<b>${BEAST_WORDS[bp.beast]}</b> (${BEASTS[bp.beast].like}: ${BEASTS[bp.beast].roles})${bp.second ? ` · then ${BEAST_WORDS[bp.second].toLowerCase()}` : ''}${flyWords}` : `none kept well${flyWords}`));
    }
    // (Origins: the wild larder here, the hearth odds, the landmass and its luck)
    const G = layer === 'farmOrigins' ? historyOf(fin) : null;
    if (G) {
        const luck = luckOf(fin, opt.roll, opt.fewer), m = massAt(G, plat, plon), NB = BEASTS.length;
        const wild = ARCHETYPES.map((A, k) => [A, fieldAt(G, G.niche[k], plat, plon)]).filter(([, v]) => v >= 0.3).sort((a, b) => b[1] - a[1])
            .map(([A]) => (A.beast ? `${A.like.replace(/^like /, '')}${m >= 0 && luck.has[m * NB + A.beast] ? '' : ' (none on this landmass)'}` : A.word.toLowerCase()));
        lines.unshift(L('Wild larder', wild.length ? wild.join(', ') : 'nothing to tame or sow'));
        const rank = oddsRank(G, fieldAt(G, G.odds, plat, plon));
        // (the history: when farming came, from which hearth; a hearth near)
        const run = hearthsOf(fin, opt.roll, opt.fewer);
        if (run) {
            const q = cellAt(G, plat, plon), t = run.farmTime[q], from = run.farmFrom[q], root = from >= 0 ? run.centres[run.centres[from].root] : null;
            lines.unshift(L('Farming came', t < Infinity ? `${t < 50 ? 'first, here' : `~${(Math.round(t / 100) * 100).toLocaleString()} years after the first`}${root?.hearth ? ` · from hearth ${root.hearth}` : ''}` : 'never: nothing fit to farm reached it'));
            let near = null, nd = 400;
            for (const C of run.hearths) { const r = Math.PI / 180, d = 2 * 6371 * Math.asin(Math.sqrt(Math.sin((C.lat - plat) * r / 2) ** 2 + Math.cos(C.lat * r) * Math.cos(plat * r) * Math.sin((C.lon - plon) * r / 2) ** 2)); if (d < nd) { nd = d; near = C; } }
            if (near) lines.unshift(L(`Hearth ${near.hearth}`, `${near.founder ? 'a founder · ' : ''}${near.t0 < 50 ? 'the first farming' : `began ~${(Math.round(near.t0 / 100) * 100).toLocaleString()} years after the first`} · tamed ${near.items.map(it => `${ARCHETYPES[it.a].word.toLowerCase()}${it.t - near.t0 >= 50 ? ` (+${(Math.round((it.t - near.t0) / 100) * 100).toLocaleString()})` : ''}`).join(', ')}`));
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
    if (lv.staple) lines.push(L('Staple food', `<b>${STAPLE_WORDS[lv.staple]}</b>${lv.second ? ` · then ${STAPLE_WORDS[lv.second].toLowerCase()}` : ''}`));
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
