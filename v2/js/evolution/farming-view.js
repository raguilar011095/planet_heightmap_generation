// The Food tab (plans/V2_FARMING_PLAN.md C1; Madeline James's culture series, Part 4): finished moments only, drawn per
// pixel of the finished picture over its hillshade, from the parts the finish worked out (farming/farming.js):
//   Farmland — what the land could grow: green by rain alone, teal where only water brought makes it farmable (the
//              Nile's kind of land); the techniques — flood farming, canals, terraces, raised fields — chips in the
//              legend, each on or off (not the metal ages: the Andes had terraces and canals and no iron); a soft ramp,
//              or graded classes;
//   Staple food (C2, C6b) — what a place would live on most, as an archetype: paddy grains, cool-season grains,
//              warm-season grains, roots and tubers, livestock, fish or wild foods (farming/living.js) — stronger the
//              better it feeds it; striped where a second does nearly as well; a legend chip shows one alone;
//   Lifestyle (C6b) — how its people would live: farming, herding or gathering (hunting, fishing and gathering —
//              gatherers keep to their way unless farming or herding would feed ten times as many); striped where a
//              second does nearly as well; a legend chip shows how many each could feed, alone;
//   People (C3) — how many the land could feed, pre-industrial, with the techniques chosen, each place by its way of
//              life (farming/people.js, living.js);
//   Soil — how fertile the ground is (on flat ground), its kind in the readout: river silt, loess, black earth…;
//   Growing season — the months crops grow, by rain alone or watered.
// In the abstract: what the land would support, not where farming came (the spread of crops, for the next release, is
// on branch `farming-spread`) nor who lives there.

import { farmPlace, farmClass, harvestsAt, hasHarvests, Staple, STAPLES, STAPLE_WORDS, CROPS, SOIL_WORDS, MOD_WORDS, SoilKind } from '../farming/farming.js';
import { croppedShare } from '../farming/people.js';
import { LIFESTYLES, LIFESTYLE_WORDS, Lifestyle, GATHER, gatherGround, gatherAt, livingPlace, livingPeople, foodScore, lifestylePeople } from '../farming/living.js';
import { landPixel } from './climate-view.js';
import { KOPPEN_ID } from '../climate/koppen.js';

export const FARMING_LAYERS = new Set(['farmLand', 'farmStaple', 'farmLife', 'farmPeople', 'farmSoil', 'farmSeason']);
export const FARMING_NAMES = { farmLand: 'Farmland', farmStaple: 'Staple food', farmLife: 'Lifestyle', farmPeople: 'People', farmSoil: 'Soil', farmSeason: 'Growing season' };
/** The techniques chosen and the looks (the legend's chips) — every view's, for as long as the page is open. `only`: the
 *  Staple food view's one food shown alone (a Staple, or 0 for all); `life` the Lifestyle view's (a Lifestyle). */
export const farmOptions = { flood: true, canal: true, terrace: true, raised: true, classes: false, watered: false, only: 0, life: 0 };
/** The options as a key (a picture or a legend made with other options is made again). */
export const farmOptionsKey = () => Object.entries(farmOptions).map(([k, v]) => `${k}=${+v}`).join(',');
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
// foods umber), from a pale ground where it barely feeds a place to most of its hue where it feeds it well
const STAPLE_RGB = [[226, 218, 202], [52, 152, 136], [216, 174, 70], [204, 110, 72], [132, 98, 164], [142, 158, 98], [74, 118, 186], [126, 92, 56]];
// the lifestyles (by their code, living.js LIFESTYLES): farming green, herding ochre, gathering violet
const LIFE_RGB = [[226, 218, 202], [70, 148, 78], [206, 160, 64], [128, 92, 176]];
const STAPLE_PALE = [226, 218, 202], STAPLE_FULL = 0.9;
// people a km² (on a log scale): pale where few could live, through straw and amber to a deep crimson where the land
// could feed the most — the densest river plains
const PEOPLE = [[0, [216, 210, 198]], [1, [228, 220, 190]], [5, [228, 206, 154]], [20, [216, 170, 108]], [60, [186, 110, 74]], [150, [120, 50, 62]]];
const PEOPLE_LOG = PEOPLE.map(([v, c]) => [Math.log10(1 + v), c]);
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

/** A pixel's parts (into p) — from the farming picture's pixel i. */
function partsAt(F, i, p) {
    p.soil = F.soil[i] / 255; p.rain = F.rain[i] / 20; p.warm = F.warm[i] / 20; p.flood = F.flood[i] / 255; p.canal = F.canal[i] / 255;
    p.slope = 2 * F.slope[i]; p.wetland = F.wetland[i] / 255;
    return p;
}
/** A pixel's farming with the options (into r: farming.js farmPlace's — farmland, harvests, staple — given its parts p and
 *  a scratch e for its crops' harvests); nothing grown on a moment detailed before the harvests were kept. */
function placeAt(F, i, p, e, opt, r) {
    partsAt(F, i, p);
    if (!hasHarvests(F)) { r.tech = r.rain = r.harvests = r.harvestsRain = r.water = r.score = 0; r.staple = r.second = Staple.NONE; return r; }
    return farmPlace(p, harvestsAt(F.crops, i, e), F.pasture[i] / 255, opt, r);
}
/** A finished moment's sea for its gatherers (farming/living.js gatherGround: its fishing grounds), once per moment —
 *  null without the sea's climate (fish then from fresh water alone). */
const groundCache = new WeakMap();
function groundOf(fin) {
    const R = fin?.raster;
    if (!R) return null;
    if (!groundCache.has(R)) groundCache.set(R, gatherGround(R, fin.climate));
    return groundCache.get(R);
}
/** A pixel's way of life (into o: living.js livingPlace's — lifestyle, staple food, people…), from its farming (r: placeAt's,
 *  which must have run) and what gatherers could live on there (into g), at (lat, lon). */
function livingAt(F, i, lat, lon, p, r, ground, opt, g, o) {
    gatherAt(ground, lat, lon, p, F.pasture[i] / 255, g);
    return livingPlace(r, p, opt, g, o);
}
/** The people a finished moment's whole land could feed with the options, each place by its way of life (living.js),
 *  worked out once per moment and options. */
const peopleCache = new WeakMap();
function peopleOf(fin) {
    const F = fin?.raster?.farming, L = fin?.climate?.raster;
    if (!hasHarvests(F) || !L) return null;
    const key = farmOptionsKey(), kept = peopleCache.get(F);
    if (kept?.key === key) return kept.count;
    const count = livingPeople(F, L, groundOf(fin), farmOptions);
    peopleCache.set(F, { key, count });
    return count;
}
/** The stripes of a second food or way of life where it does nearly as well: a band a quarter of each period, ~1.4° of
 *  the texture's width. */
const stripe = (x, y, W) => { const P = Math.max(4, Math.round(W / 256)); return (x + y) % P < Math.max(1, P >> 2); };
/** A way of life's colour (into c), stronger where it feeds more (a km², on a log scale) — pale where few could live. */
function lifeColour(life, people, c) {
    const t = life ? 0.5 + 0.4 * smooth(0, 1.5, Math.log10(1 + people)) : 0, h = LIFE_RGB[life];
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
 *  teal as more of it comes from water brought; or the class's. */
function farmColour(v, vr, classes, c, tmp) {
    const share = v > 0.02 ? Math.max(0, Math.min(1, (v - vr) / v)) : 0;
    const x = classes ? CLASS_AT[farmClass(v)] : v;
    ramp(FARM_RAIN, x, c);
    if (share > 0) { ramp(FARM_WATER, x, tmp); for (let i = 0; i < 3; i++) c[i] += (tmp[i] - c[i]) * (classes ? (share >= 0.5 ? 1 : 0) : smooth(0, 0.8, share)); }
    return c;
}

/** paintFinished's colorAt for a farming view, on a texture `W` wide (finish-view.js): the view's colours, lit by the
 *  finished relief; the sea dark, lakes water, ice pale. */
export function finishedFarmingColor(layer, fin, W) {
    const F = fin?.raster?.farming, K = fin?.climate?.raster;
    if (!F || !K) return (out, o, x, y, wet, kk) => { const k = shadeK(kk); const c = wet ? SEA : NONE; out[o] = c[0] * k; out[o + 1] = c[1] * k; out[o + 2] = c[2] * k; out[o + 3] = 255; };
    const p = {}, r = { scores: new Float64Array(STAPLES.length), foods: new Float64Array(STAPLES.length) }, c = [0, 0, 0], tmp = [0, 0, 0], opt = { ...farmOptions }, kef = KOPPEN_ID.EF, e = new Float64Array(2 * CROPS.length);
    const living = layer === 'farmStaple' || layer === 'farmLife' || layer === 'farmPeople', ground = living ? groundOf(fin) : null, g = {}, lv = {}, H = W >> 1;
    return (out, o, x, y, wet, kk, k3, v, lake) => {
        const k = shadeK(kk);
        if (wet || lake === 1 || lake === 2) { const s = wet ? SEA : LAKE; out[o] = s[0] * k; out[o + 1] = s[1] * k; out[o + 2] = s[2] * k; out[o + 3] = 255; return; }
        const i = landPixel(K, W, x, y);
        if (i < 0) { out[o] = NONE[0] * k; out[o + 1] = NONE[1] * k; out[o + 2] = NONE[2] * k; out[o + 3] = 255; return; }
        if (K.koppen[i] === kef) { out[o] = ICE[0] * k; out[o + 1] = ICE[1] * k; out[o + 2] = ICE[2] * k; out[o + 3] = 255; return; }
        if (layer === 'farmSoil') ramp(SOIL, partsAt(F, i, p).soil, c);
        else if (layer === 'farmSeason') { partsAt(F, i, p); ramp(SEASON, opt.watered ? p.warm : p.rain, c); }
        else {
            placeAt(F, i, p, e, opt, r);
            if (living) livingAt(F, i, 90 - (y + 0.5) / H * 180, (x + 0.5) / W * 360 - 180, p, r, ground, opt, g, lv);
            // (Staple food: one alone — how well it would feed each place — or each place's and how well, a second striped;
            // Lifestyle: one alone — how many it could feed — or each place's, a second striped; Farmland: green by rain,
            // toward aqua as more of it comes from water brought)
            if (layer === 'farmStaple') {
                if (opt.only) stapleColour(opt.only, foodScore(opt.only, r, g), c);
                else if (lv.second && stripe(x, y, W)) stapleColour(lv.second, foodScore(lv.second, r, g), c);
                else stapleColour(lv.staple, lv.score, c);
            } else if (layer === 'farmLife') {
                if (opt.life) lifeAloneColour(opt.life, lifestylePeople(opt.life, r, p, opt, g), c);
                else if (lv.secondLife && stripe(x, y, W)) lifeColour(lv.secondLife, lv.people, c);
                else lifeColour(lv.lifestyle, lv.people, c);
            } else if (layer === 'farmPeople') ramp(PEOPLE_LOG, Math.log10(1 + lv.people), c);
            else farmColour(r.tech, r.rain, opt.classes, c, tmp);
        }
        out[o] = Math.min(255, c[0] * k); out[o + 1] = Math.min(255, c[1] * k); out[o + 2] = Math.min(255, c[2] * k); out[o + 3] = 255;
    };
}

/** A farming quantity as a number at a pixel of a picture `W` wide, for the export's data maps (export.js) — NaN off the
 *  land: `farmTech` and `farmRain` farmland (0…1, the Farmland view's ramp) with the techniques chosen and by rain alone,
 *  `people` a km² (as the People view), `soil` its fertility (0…1), `seasonRain` and `seasonWatered` the growing season
 *  (months), `staple` the staple food (a Staple; 0 nothing), `lifestyle` the way of life (a Lifestyle; 0 uninhabited) —
 *  the ice farms nothing. */
export function finishedFarmingValue(key, fin, W) {
    const F = fin?.raster?.farming, K = fin?.climate?.raster, kef = KOPPEN_ID.EF;
    if (!F || !K) return () => NaN;
    const p = {}, r = { scores: new Float64Array(STAPLES.length), foods: new Float64Array(STAPLES.length) }, e = new Float64Array(2 * CROPS.length);
    const living = key === 'people' || key === 'staple' || key === 'lifestyle', ground = living ? groundOf(fin) : null, g = {}, lv = {}, H = W >> 1;
    return (x, y) => {
        const i = landPixel(K, W, x, y);
        if (i < 0) return NaN;
        if (K.koppen[i] === kef) return 0;
        if (key === 'soil') return partsAt(F, i, p).soil;
        if (key === 'seasonRain' || key === 'seasonWatered') { partsAt(F, i, p); return key === 'seasonRain' ? p.rain : p.warm; }
        placeAt(F, i, p, e, farmOptions, r);
        if (living) livingAt(F, i, 90 - (y + 0.5) / H * 180, (x + 0.5) / W * 360 - 180, p, r, ground, farmOptions, g, lv);
        return key === 'farmTech' ? r.tech : key === 'farmRain' ? r.rain : key === 'people' ? lv.people : key === 'staple' ? lv.staple : key === 'lifestyle' ? lv.lifestyle : NaN;
    };
}

// ── the legend ──
/** Each class's share of the land (by area), by rain alone and with the techniques chosen; the soil's and the season's
 *  bands; each staple food's and each way of life's — kept per finished moment and options. */
const tallies = new WeakMap();
function tally(fin) {
    const F = fin.raster.farming, K = fin.climate.raster, key = farmOptionsKey();
    const kept = tallies.get(F);
    if (kept?.key === key) return kept;
    const rain = new Float64Array(5), tech = new Float64Array(5), soil = new Float64Array(5), season = new Float64Array(5), staple = new Float64Array(STAPLES.length), life = new Float64Array(LIFESTYLES.length);
    const p = {}, r = { scores: new Float64Array(STAPLES.length), foods: new Float64Array(STAPLES.length) }, kef = KOPPEN_ID.EF, e = new Float64Array(2 * CROPS.length), ground = groundOf(fin), g = {}, lv = {};
    let land = 0;
    for (let y = 0; y < F.h; y++) {
        const lat = 90 - (y + 0.5) / F.h * 180, a = Math.cos(lat * Math.PI / 180);
        for (let x = 0, i = y * F.w; x < F.w; x++, i++) {
            if (!K.koppen[i] || K.koppen[i] === kef) { if (K.koppen[i]) { land += a; staple[0] += a; life[0] += a; } continue; }
            land += a;
            placeAt(F, i, p, e, farmOptions, r);
            rain[farmClass(r.rain)] += a; tech[farmClass(r.tech)] += a;
            soil[p.soil >= 0.75 ? 4 : p.soil >= 0.5 ? 3 : p.soil >= 0.3 ? 2 : p.soil >= 0.12 ? 1 : 0] += a;
            const s = farmOptions.watered ? p.warm : p.rain;
            season[s >= 8 ? 4 : s >= 5 ? 3 : s >= 3 ? 2 : s >= 1 ? 1 : 0] += a;
            livingAt(F, i, lat, (x + 0.5) / F.w * 360 - 180, p, r, ground, farmOptions, g, lv);
            staple[lv.staple] += a; life[lv.lifestyle] += a;
        }
    }
    for (const t of [rain, tech, soil, season, staple, life]) for (let k = 0; k < t.length; k++) t[k] /= Math.max(1e-9, land);
    const out = { key, rain, tech, soil, season, staple, life };
    tallies.set(F, out);
    return out;
}

const chip = (key, label, title, on) => `<button type="button" class="evo-farm-chip${on ? ' on' : ''}" data-farm="${key}" title="${title}" aria-pressed="${on}">${label}</button>`;
const bar = (stops, label) => `<div class="evo-farm-bar"><i style="background:${gradient(stops)}"></i><span>${label}</span></div>`;
const pct = v => `${Math.round(100 * v)}%`;

export function farmingLegendHTML(layer, fin) {
    const head = t => `<div class="evo-legend-head">${t}</div>`, note = t => `<div class="evo-legend-note">${t}</div>`;
    if (!fin?.raster?.farming) return head('Food — add detail again to see it (this moment was detailed before these views were added)');
    const T = tally(fin), sw = (c, label, share) => `<span><i style="background:${css(c)}"></i>${label} <em>${pct(share)}</em></span>`, c = [0, 0, 0];
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
        return head(only ? `Staple food — ${STAPLE_WORDS[only].toLowerCase()} alone: where it would feed people, and how well` : 'Staple food — what each place would live on most') +
            `<div class="evo-farm-chips">${STAPLES.map((_, k) => k).filter(k => k !== Staple.NONE).map(food).join('')}</div>` +
            `<div class="evo-farm-chips">${chips}</div>` + bar([[0, STAPLE_PALE], [1, [150, 150, 150]]], `paler where it feeds less well${only ? '' : '; striped where a second does nearly as well'}`) +
            note('What would feed each place best with these techniques — archetypes, not any one crop. Paddy grains feed the most on rich, level, wet ground; cool-season grains take ' +
                'the winters and the cool summers; warm-season grains the hot and the dry; roots the leached tropics and cold highlands; livestock the dry grass; ' +
                'fish the coasts of cold, upwelling seas and the big rivers; wild foods the land no farmer or herder would hold');
    }
    if (layer === 'farmLife') {
        if (!hasHarvests(fin.raster.farming)) return head('Lifestyle — add detail again to see it (this moment was detailed before the harvests were counted)');
        // (each way of life a chip with its colour and its share of the land: a click shows how many it could feed, alone)
        const one = farmOptions.life, way = k => `<button type="button" class="evo-farm-chip evo-farm-staple${one === k ? ' on' : ''}" data-farm-life="${k}" aria-pressed="${one === k}" ` +
            `title="${one === k ? 'Show every way of life again' : `Show how many ${LIFESTYLE_WORDS[k].toLowerCase()} could feed — alone`}"><i style="background:${css(LIFE_RGB[k])}"></i>${LIFESTYLE_WORDS[k]} <em>${pct(T.life[k])}</em></button>`;
        return head(one ? `Lifestyle — ${LIFESTYLE_WORDS[one].toLowerCase()} alone: how many it could feed` : 'Lifestyle — how each place’s people would live') +
            `<div class="evo-farm-chips">${[Lifestyle.FARMING, Lifestyle.HERDING, Lifestyle.GATHERING].map(way).join('')}</div>` +
            `<div class="evo-farm-chips">${chips}</div>` +
            bar([[0, STAPLE_PALE], [1, [150, 150, 150]]], one ? 'paler where it feeds fewer' : 'paler where few could live; striped where a second does nearly as well') +
            note(`Gathering is hunting, fishing and gathering: the coasts of cold, upwelling seas, big rivers and lakes, and the land’s own plants and game. Gatherers keep to their way unless farming or herding would feed ${GATHER.hold} times as many — ` +
                'so rich coasts can stay theirs, as the Pacific Northwest’s did; farming where crops feed most, herding where only grass grows well') +
            (T.life[0] >= 0.005 ? note(`Uninhabited: ${pct(T.life[0])} of the land — ice, and land too barren for anyone to live on`) : '');
    }
    if (layer === 'farmPeople') {
        const count = peopleOf(fin);
        if (!count) return head('People — add detail again to see them (this moment was detailed before the harvests were counted)');
        const millions = v => (v >= 1e9 ? `${(v / 1e9).toFixed(1)} billion` : v >= 1e6 ? `${Math.round(v / 1e6).toLocaleString()} million` : `${Math.round(v / 1e3).toLocaleString()} thousand`);
        const by = [Lifestyle.FARMING, Lifestyle.HERDING, Lifestyle.GATHERING].filter(k => count.byLife[k] > 0).map(k => `${LIFESTYLE_WORDS[k].toLowerCase()} ${millions(count.byLife[k])}`).join(', ');
        return head('People — how many the land could feed, pre-industrial, with these techniques') + `<div class="evo-farm-chips">${chips}</div>` +
            bar(PEOPLE_LOG, '1 · 5 · 20 · 60 · 150+ a km²') +
            note(`The whole land could feed about ${millions(count.people)} — ${Math.round(count.people / Math.max(1, count.land))} a km² on average (${by}); its richest river plains well over 100. ` +
                'Each place by its way of life (the Lifestyle view): poor ground farmed in long fallows — a rainforest’s fields cropped a year or two in ten, so it feeds a few a km² — ' +
                'herders a km² or two, gatherers a tenth to a few. What it could support, not how many would live there');
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
export function farmChipClicked(target) {
    const one = target.closest?.('[data-farm-only]');
    if (one) { const k = Number(one.dataset.farmOnly); farmOptions.only = farmOptions.only === k ? 0 : k; return true; }
    const life = target.closest?.('[data-farm-life]');
    if (life) { const k = Number(life.dataset.farmLife); farmOptions.life = farmOptions.life === k ? 0 : k; return true; }
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
    const p = {}, opt = farmOptions, r = placeAt(F, i, p, new Float64Array(2 * CROPS.length), opt, { scores: new Float64Array(STAPLES.length), foods: new Float64Array(STAPLES.length) }), lines = [];
    if (!hasHarvests(F)) return [L('Farmland', 'add detail again to see it')];
    const lv = livingAt(F, i, 90 - v * 180, u * 360 - 180, p, r, groundOf(fin), opt, {}, {});
    // (its way of life and its staple food — a second where it does nearly as well)
    lines.push(L('Lifestyle', lv.lifestyle ? `<b>${LIFESTYLE_WORDS[lv.lifestyle]}</b>${lv.secondLife ? ` · and ${LIFESTYLE_WORDS[lv.secondLife].toLowerCase()}` : ''}` : 'uninhabited'));
    if (lv.staple) lines.push(L('Staple food', `<b>${STAPLE_WORDS[lv.staple]}</b>${lv.second ? ` · then ${STAPLE_WORDS[lv.second].toLowerCase()}` : ''}`));
    // (how many it could feed; on poor ground, how long its fields rest — a year cropped in so many, shifting
    // cultivation's; gatherers' land, what farming or herding would have fed instead)
    const n = v => (v < 10 ? v.toFixed(v < 1 ? 2 : 1) : String(Math.round(v)));
    const every = Math.round(1 / croppedShare(p, opt)), rested = lv.lifestyle === Lifestyle.FARMING && every >= 2 ? ` · a field cropped ~1 year in ${every}` : '';
    const instead = lv.lifestyle === Lifestyle.GATHERING && lv.landPeople >= 0.05 ? ` · ${r.staple === Staple.HERDING ? 'herding' : 'farming'} ~${n(lv.landPeople)} — not ${GATHER.hold}× as many` : '';
    lines.push(L('People', lv.people < 0.005 ? 'too few to count' : `could feed ~${n(lv.people)} a km²${rested}${instead}`));
    const cls = farmClass(r.tech), clsRain = farmClass(r.rain);
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
