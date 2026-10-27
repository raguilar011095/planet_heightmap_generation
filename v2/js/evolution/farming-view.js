// The Farming tab (plans/V2_FARMING_PLAN.md C1; Madeline James's culture series, Part 4): finished moments only, drawn per
// pixel of the finished picture over its hillshade, from the parts the finish worked out (farming/farming.js):
//   Farmland — what the land could grow: green by rain alone, teal where only water brought makes it farmable (the
//              Nile's kind of land); the techniques — flood farming, canals, terraces, raised fields — chips in the
//              legend, each on or off (not the metal ages: the Andes had terraces and canals and no iron); a soft ramp,
//              or graded classes;
//   Staples (C2) — what a place would grow most: rice, wheat and barley, maize and millet, roots and tubers, or herding
//              — what grows best there with the techniques chosen (not where each was first grown: that is Crop
//              spread's), stronger the better it grows; a legend chip shows one alone;
//   Crop spread (C4) — what each place grows of what reached it (farming/spread.js): the hearths where farming began,
//              numbered pins, and each one's strains spread out from them — a crop's colour, a shade for each strain, a
//              second crop striped; a legend chip shows one crop's strains alone, another colours by hearth; each strain
//              named after a real crop (farming/varietals.js: Earth's crops domesticated together, by climate), each
//              name a choice in the legend's list of hearths;
//   People (C3) — how many the land could feed, pre-industrial, with the techniques chosen (farming/people.js);
//   Soil — how fertile the ground is (on flat ground), its kind in the readout: river silt, loess, black earth…;
//   Growing season — the months crops grow, by rain alone or watered.
// What the land could grow — not who would live there.

import { farmPlace, farmClass, decHarvests, Staple, STAPLE_WORDS, CROPS, TECHNIQUES, SOIL_WORDS, MOD_WORDS, SoilKind } from '../farming/farming.js';
import { landPeople, peopleAt } from '../farming/people.js';
import { spreadGround, spreadHearths, spreadStrains, spreadPlace, strainAt, hearthWords } from '../farming/spread.js';
import { VARIETALS, HOME, cropsFor, likeOf } from '../farming/varietals.js';
import { landPixel } from './climate-view.js';
import { KOPPEN_ID } from '../climate/koppen.js';

export const FARMING_LAYERS = new Set(['farmLand', 'farmStaple', 'farmSpread', 'farmPeople', 'farmSoil', 'farmSeason']);
export const FARMING_NAMES = { farmLand: 'Farmland', farmStaple: 'Staples', farmSpread: 'Crop spread', farmPeople: 'People', farmSoil: 'Soil', farmSeason: 'Growing season' };
/** The techniques chosen and the looks (the legend's chips) — every view's, for as long as the page is open. `only`: the
 *  Staples view's one staple shown alone (a Staple, or 0 for all); `spreadOnly` the Crop spread view's; `byHearth`: Crop
 *  spread coloured by the hearth each place's crops came from; `realCrops`: its strains named after real crops (`picks`:
 *  a count of the crops chosen in its legend, so a legend made before is made again); `roll`: which likely history its
 *  hearths and crops are (the legend's Re-roll, a random one, kept in the link: 0 the likeliest). */
export const farmOptions = { flood: true, canal: true, terrace: true, raised: true, classes: false, watered: false, only: 0, spreadOnly: 0, byHearth: false, realCrops: true, picks: 0, roll: 0 };
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
// the staples: a hue each, earthy rather than loud (rice jade, wheat straw-gold, maize terracotta, roots plum, herding
// sage), from a pale ground where it barely grows to most of its hue where it grows well
const STAPLE_RGB = [[226, 218, 202], [52, 152, 136], [216, 174, 70], [204, 110, 72], [132, 98, 164], [142, 158, 98]];
const STAPLE_PALE = [226, 218, 202], STAPLE_FULL = 0.9;
// people a km² (on a log scale): pale where few could live, through straw and amber to a deep crimson where the land
// could feed the most — the densest river plains
const PEOPLE = [[0, [216, 210, 198]], [1, [228, 220, 190]], [5, [228, 206, 154]], [20, [216, 170, 108]], [60, [186, 110, 74]], [150, [120, 50, 62]]];
const PEOPLE_LOG = PEOPLE.map(([v, c]) => [Math.log10(1 + v), c]);
// the hearths: a colour each — their pins, the Crop spread view by hearth, and one crop's strains alone
const HEARTH_RGB = [[204, 68, 58], [54, 112, 206], [224, 168, 34], [50, 150, 82], [150, 84, 186], [26, 164, 176], [214, 108, 160], [128, 124, 58]];
// …and in the Crop spread view's crop colours, each strain of a crop a shade of it (by its hearth's place among the
// crop's: lighter or darker)
const STRAIN_SHADE = [0, -0.35, 0.4, -0.55, 0.65, -0.18, 0.2, -0.7], STRAIN_STRENGTH = 0.85;
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
    if (!F.crops) { r.tech = r.rain = r.harvests = r.harvestsRain = r.water = r.score = 0; r.staple = r.second = Staple.NONE; return r; }
    const n = 2 * CROPS.length;
    for (let k = 0; k < n; k++) e[k] = decHarvests(F.crops[n * i + k]);
    return farmPlace(p, e, F.pasture[i] / 255, opt, r);
}
/** The people a finished moment's whole land could feed with the options (farming/people.js), worked out once per moment
 *  and options. */
const peopleCache = new WeakMap();
function peopleOf(fin) {
    const F = fin?.raster?.farming, L = fin?.climate?.raster;
    if (!F?.crops || !L) return null;
    const key = farmOptionsKey(), kept = peopleCache.get(F);
    if (kept?.key === key) return kept.count;
    const count = landPeople(F, L, farmOptions);
    peopleCache.set(F, { key, count });
    return count;
}
/** A finished moment's hearths and the spread of its crops (farming/spread.js) with the techniques chosen, at the roll
 *  (the legend's Re-roll), and each strain's crop (as chosen in the legend; with Real crops off, the staple groups alone) —
 *  the picture read once per moment and techniques, the hearths again at each roll, the strains' spread again when a
 *  crop is chosen (the looks change none). */
const spreadCache = new WeakMap();
export function spreadOf(fin) {
    const F = fin?.raster?.farming, L = fin?.climate?.raster;
    if (!F?.crops || !L) return null;
    const key = TECHNIQUES.map(k => +farmOptions[k]).join(''), roll = farmOptions.roll;
    let kept = spreadCache.get(F);
    if (kept?.key !== key) spreadCache.set(F, kept = { key, ground: spreadGround(F, L, farmOptions) });
    if (kept.base?.roll !== roll) { kept.base = spreadHearths(kept.ground, roll); kept.nameKey = null; }
    const names = farmOptions.realCrops ? kept.base.hearths.map((h, k) => Object.fromEntries(h.crops.map(st => [st, strainCrop(fin, kept.base, k, st)]))) : null;
    const nameKey = JSON.stringify(names);
    if (kept.nameKey !== nameKey) { kept.map = spreadStrains(kept.base, names); kept.nameKey = nameKey; }
    return kept.map;
}
/** Numbered pins on a texture W wide (its 2d context), as thick at any width: `fill`, `ring` and `ink` colours by index. */
function drawPins(ctx, W, points, fill, ring, ink) {
    const H = W / 2, r = Math.max(6, W / 340);
    ctx.save();
    ctx.font = `bold ${Math.round(1.2 * r)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    points.forEach((s, k) => {
        const x = (s.lon + 180) / 360 * W, y = (90 - s.lat) / 180 * H;
        for (const dx of [0, -W, W]) {
            if (x + dx < -2 * r || x + dx > W + 2 * r) continue;
            ctx.beginPath(); ctx.arc(x + dx, y, r, 0, 2 * Math.PI);
            ctx.fillStyle = fill(k); ctx.fill();
            ctx.lineWidth = Math.max(1.5, r / 4); ctx.strokeStyle = ring(k); ctx.stroke();
            ctx.fillStyle = ink(k); ctx.fillText(String(k + 1), x + dx, y + r * 0.06);
        }
    });
    ctx.restore();
}
/** The hearths drawn on a texture W wide: numbered pins in their colours (the export's; the page draws them over the
 *  planet: farmingPins). */
export function drawHearths(ctx, W, fin) {
    const map = spreadOf(fin);
    if (map) drawPins(ctx, W, map.hearths, k => css(hearthRGB(k)), () => 'rgba(255, 252, 244, 0.95)', () => '#fff');
}
const hearthRGB = k => HEARTH_RGB[k % HEARTH_RGB.length];
/** The crops chosen in the legend for strains, per farming picture ('hearth:staple' → a varietals.js crop id: all gone at a
 *  re-roll or Reset); and the picture whose legend is shown (its chips'). */
let picks = new WeakMap();
let legendFarming = null;
/** The crop a strain is named after (a varietals.js id): the one chosen, or the hearth's own. */
function strainCrop(fin, map, k, st) {
    return picks.get(fin.raster.farming)?.get(`${k}:${st}`) ?? map.hearths[k]?.names?.[st];
}
/** A strain's name: its real crop's (with Real crops on), else its staple's. */
function strainName(fin, map, k, st) {
    const id = farmOptions.realCrops && k >= 0 ? strainCrop(fin, map, k, st) : null;
    return id ? VARIETALS[id].name : STAPLE_WORDS[st];
}
/** A strain's colour (into c) in the Crop spread view's crop colours: its staple's, a shade for its hearth's place among
 *  that staple's (the lightness the strain's alone: not paler where it grows less well, as on Staples). */
function strainColour(map, st, from, c) {
    stapleColour(st, STRAIN_STRENGTH, c);
    if (from < 0) return c;
    let j = 0;
    for (let h = 0; h < from; h++) if (map.hearths[h].crops.includes(st)) j++;
    const s = STRAIN_SHADE[j % STRAIN_SHADE.length];
    for (let i = 0; i < 3; i++) c[i] = s > 0 ? c[i] + (255 - c[i]) * s : c[i] * (1 + s);
    return c;
}
/** A hearth's colour (into c) at a strength: pale where its crop barely grows. */
function hearthColour(from, score, c) {
    const t = 0.35 + 0.55 * smooth(0.04, 0.8, score), h = hearthRGB(from);
    for (let i = 0; i < 3; i++) c[i] = STAPLE_PALE[i] + (h[i] - STAPLE_PALE[i]) * t;
    return c;
}
/** The Crop spread view's stripes (a second crop; hatched, farmland no crop reached): a band a quarter of each period,
 *  ~1.4° of the texture's width. */
const stripe = (x, y, W) => { const P = Math.max(4, Math.round(W / 256)); return (x + y) % P < Math.max(1, P >> 2); };
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
    const p = {}, r = { scores: new Float64Array(6), foods: new Float64Array(6) }, c = [0, 0, 0], tmp = [0, 0, 0], opt = { ...farmOptions }, kef = KOPPEN_ID.EF, e = new Float64Array(2 * CROPS.length);
    const spread = layer === 'farmSpread' ? spreadOf(fin) : null, sp = {}, H = W >> 1;
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
            // (Staples: one alone — how well it grows everywhere — or each place's and how well it grows; Farmland: green
            // by rain, toward aqua as more of it comes from water brought)
            if (layer === 'farmStaple') { if (opt.only) stapleColour(opt.only, r.scores[opt.only], c); else stapleColour(r.staple, r.score, c); }
            else if (layer === 'farmPeople') ramp(PEOPLE_LOG, Math.log10(1 + peopleAt(r)), c);
            else if (layer === 'farmSpread' && spread) {
                const lat = 90 - (y + 0.5) / H * 180, lon = (x + 0.5) / W * 360 - 180;
                if (opt.spreadOnly) {
                    // (one crop alone: each hearth's strain in the hearth's colour, paler where it grows less well; hatched
                    // where it would grow well but never came)
                    const st = opt.spreadOnly, from = strainAt(spread, st, lat, lon), niche = from >= 0 ? spread.niche(from, st) : null, sc = r.scores[st] * (niche ? niche[K.koppen[i]] : 1);
                    if (from >= 0 && sc >= 0.04) hearthColour(from, sc, c);
                    else { for (let ch = 0; ch < 3; ch++) c[ch] = STAPLE_PALE[ch]; if (sc >= 0.25 && stripe(x, y, W)) c.fill(156); }
                } else {
                    // (each place's crop — a second one striped — in its crop's colour, a shade for its strain; or its hearth's)
                    spreadPlace(spread, lat, lon, r.foods, K.koppen[i], sp);
                    const two = sp.second && stripe(x, y, W), st = two ? sp.second : sp.main, from = two ? sp.secondFrom : sp.mainFrom;
                    if (!sp.main) { for (let ch = 0; ch < 3; ch++) c[ch] = STAPLE_PALE[ch]; if (sp.missed && stripe(x, y, W)) c.fill(156); }
                    else if (opt.byHearth && from >= 0) { const niche = spread.niche(from, st); hearthColour(from, r.scores[st] * (niche ? niche[K.koppen[i]] : 1), c); }
                    else strainColour(spread, st, opt.byHearth ? -1 : from, c);
                }
            } else farmColour(r.tech, r.rain, opt.classes, c, tmp);
        }
        out[o] = Math.min(255, c[0] * k); out[o + 1] = Math.min(255, c[1] * k); out[o + 2] = Math.min(255, c[2] * k); out[o + 3] = 255;
    };
}

/** A farming quantity as a number at a pixel of a picture `W` wide, for the export's data maps (export.js) — NaN off the
 *  land: `farmTech` and `farmRain` farmland (0…1, the Farmland view's ramp) with the techniques chosen and by rain alone,
 *  `people` a km² (as the People view), `soil` its fertility (0…1), `seasonRain` and `seasonWatered` the growing season
 *  (months), `staple` the staple grown most (a Staple; 0 nothing) — the ice farms nothing. */
export function finishedFarmingValue(key, fin, W) {
    const F = fin?.raster?.farming, K = fin?.climate?.raster, kef = KOPPEN_ID.EF;
    if (!F || !K) return () => NaN;
    const p = {}, r = { scores: new Float64Array(6), foods: new Float64Array(6) }, e = new Float64Array(2 * CROPS.length);
    return (x, y) => {
        const i = landPixel(K, W, x, y);
        if (i < 0) return NaN;
        if (K.koppen[i] === kef) return 0;
        if (key === 'soil') return partsAt(F, i, p).soil;
        if (key === 'seasonRain' || key === 'seasonWatered') { partsAt(F, i, p); return key === 'seasonRain' ? p.rain : p.warm; }
        placeAt(F, i, p, e, farmOptions, r);
        return key === 'farmTech' ? r.tech : key === 'farmRain' ? r.rain : key === 'people' ? peopleAt(r) : key === 'staple' ? r.staple : NaN;
    };
}

/** The numbered pins a farming view shows (the Crop spread view's hearths), for the page to draw over the planet:
 *  [{lat, lon, label, fill, ring, ink}] — none on the other views. */
export function farmingPins(layer, fin) {
    const map = layer === 'farmSpread' ? spreadOf(fin) : null;
    if (!map) return [];
    return map.hearths.map((h, k) => ({ lat: h.lat, lon: h.lon, label: String(k + 1), fill: css(hearthRGB(k)), ring: 'rgba(255, 252, 244, 0.95)', ink: '#fff' }));
}

// ── the legend ──
/** Each class's share of the land (by area), by rain alone and with the techniques chosen; the soil's and the season's
 *  bands — kept per finished moment and options. */
const tallies = new WeakMap();
function tally(fin) {
    const F = fin.raster.farming, K = fin.climate.raster, key = farmOptionsKey();
    const kept = tallies.get(F);
    if (kept?.key === key) return kept;
    const rain = new Float64Array(5), tech = new Float64Array(5), soil = new Float64Array(5), season = new Float64Array(5), staple = new Float64Array(6), p = {}, r = {}, kef = KOPPEN_ID.EF;
    const e = new Float64Array(2 * CROPS.length);
    let land = 0;
    for (let y = 0; y < F.h; y++) {
        const a = Math.cos(((y + 0.5) / F.h - 0.5) * Math.PI);
        for (let x = 0, i = y * F.w; x < F.w; x++, i++) {
            if (!K.koppen[i] || K.koppen[i] === kef) { if (K.koppen[i]) { land += a; staple[0] += a; } continue; }
            land += a;
            placeAt(F, i, p, e, farmOptions, r);
            rain[farmClass(r.rain)] += a; tech[farmClass(r.tech)] += a;
            soil[p.soil >= 0.75 ? 4 : p.soil >= 0.5 ? 3 : p.soil >= 0.3 ? 2 : p.soil >= 0.12 ? 1 : 0] += a;
            const s = farmOptions.watered ? p.warm : p.rain;
            season[s >= 8 ? 4 : s >= 5 ? 3 : s >= 3 ? 2 : s >= 1 ? 1 : 0] += a;
            staple[r.staple] += a;
        }
    }
    for (const t of [rain, tech, soil, season, staple]) for (let k = 0; k < t.length; k++) t[k] /= Math.max(1e-9, land);
    const out = { key, rain, tech, soil, season, staple };
    tallies.set(F, out);
    return out;
}

/** The Crop spread view's shares of the land (by area, every other pixel): each staple's as the main crop, each hearth's
 *  crops', each hearth's strain of each staple's, the foragers' — kept per finished moment and techniques. */
const spreadTallies = new WeakMap();
function spreadTally(fin, map) {
    const F = fin.raster.farming, K = fin.climate.raster, kept = spreadTallies.get(F);
    if (kept?.map === map) return kept;
    const n = map.hearths.length, staple = new Float64Array(6), hearth = new Float64Array(n), strain = Array.from({ length: n }, () => new Float64Array(6));
    const p = {}, r = { foods: new Float64Array(6) }, e = new Float64Array(2 * CROPS.length), sp = {}, kef = KOPPEN_ID.EF;
    let land = 0, forage = 0;
    for (let y = 0; y < F.h; y += 2) {
        const lat = 90 - (y + 0.5) / F.h * 180, a = Math.cos(lat * Math.PI / 180);
        for (let x = 0; x < F.w; x += 2) {
            const i = y * F.w + x;
            if (!K.koppen[i]) continue;
            land += a;
            if (K.koppen[i] === kef) continue;
            placeAt(F, i, p, e, farmOptions, r);
            spreadPlace(map, lat, (x + 0.5) / F.w * 360 - 180, r.foods, K.koppen[i], sp);
            staple[sp.main] += a;
            if (sp.mainFrom >= 0) { hearth[sp.mainFrom] += a; strain[sp.mainFrom][sp.main] += a; }
            if (!sp.main && sp.missed) forage += a;
        }
    }
    const k = 1 / Math.max(1e-9, land);
    for (const t of [staple, hearth, ...strain]) for (let j = 0; j < t.length; j++) t[j] *= k;
    const out = { map, staple, hearth, strain, forage: forage * k };
    spreadTallies.set(F, out);
    return out;
}

const chip = (key, label, title, on) => `<button type="button" class="evo-farm-chip${on ? ' on' : ''}" data-farm="${key}" title="${title}" aria-pressed="${on}">${label}</button>`;
const bar = (stops, label) => `<div class="evo-farm-bar"><i style="background:${gradient(stops)}"></i><span>${label}</span></div>`;
const pct = v => `${Math.round(100 * v)}%`;

export function farmingLegendHTML(layer, fin) {
    const head = t => `<div class="evo-legend-head">${t}</div>`, note = t => `<div class="evo-legend-note">${t}</div>`;
    if (!fin?.raster?.farming) return head('Farming — add detail again to see it (this moment was detailed before farming was added)');
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
        if (!fin.raster.farming.crops) return head('Staples — add detail again to see them (this moment was detailed before the staples were added)');
        // (each staple a chip with its colour and its share of the land: a click shows it alone, again shows them all)
        const only = farmOptions.only, staple = k => `<button type="button" class="evo-farm-chip evo-farm-staple${only === k ? ' on' : ''}" data-farm-only="${k}" aria-pressed="${only === k}" ` +
            `title="${only === k ? 'Show every staple again' : `Show where ${STAPLE_WORDS[k].toLowerCase()} would grow, and how well — alone`}"><i style="background:${css(STAPLE_RGB[k])}"></i>${STAPLE_WORDS[k]} <em>${pct(T.staple[k])}</em></button>`;
        return head(only ? `Staples — ${STAPLE_WORDS[only].toLowerCase()} alone: where it would grow, and how well` : 'Staples — what each place would grow most') +
            `<div class="evo-farm-chips">${[Staple.RICE, Staple.WHEAT, Staple.MAIZE, Staple.ROOTS, Staple.HERDING].map(staple).join('')}</div>` +
            `<div class="evo-farm-chips">${chips}</div>` + bar([[0, STAPLE_PALE], [1, [150, 150, 150]]], 'paler where it grows less well') +
            note('What grows best here with these techniques — not where each was first grown, which was culture’s. Rice feeds the most on rich, level, wet ground; ' +
                'wheat and barley take the cool season; maize, millet and sorghum the warm and the dry; roots the leached tropics and cold highlands; herds the rest');
    }
    if (layer === 'farmSpread') {
        const map = spreadOf(fin);
        if (!map) return head('Crop spread — add detail again to see it (this moment was detailed before the harvests were counted)');
        const S2 = spreadTally(fin, map), only = farmOptions.spreadOnly;
        // (each crop a chip with its colour and its share of the land: a click shows its strains alone, again them all)
        const crop = k => `<button type="button" class="evo-farm-chip evo-farm-staple${only === k ? ' on' : ''}" data-farm-spread="${k}" aria-pressed="${only === k}" ` +
            `title="${only === k ? 'Show every crop again' : `Show ${STAPLE_WORDS[k].toLowerCase()} alone: each hearth’s strain of it, and where it would grow but never came`}"><i style="background:${css(STAPLE_RGB[k])}"></i>${STAPLE_WORDS[k]} <em>${pct(S2.staple[k])}</em></button>`;
        const by = only ? '' : chip('byHearth', 'By hearth', 'Colour each place by the hearth its crops came from, not by the crop', farmOptions.byHearth);
        const real = chip('realCrops', 'Real crops', 'Each hearth’s strains real crops domesticated on Earth — those grown together there, in a climate like its, crops from one part of the world likelier together — each spreading and grown best in its own climates (the potato cool, cassava wet and tropical) and its hearth’s; choose them in the list below. Off: the staple groups alone', farmOptions.realCrops);
        legendFarming = fin.raster.farming;
        // (a re-roll: another likely history — where farming began, what each hearth domesticated, which real crops)
        const reroll = '<button type="button" class="evo-farm-chip" data-farm-roll title="Another likely history: where farming began, what each hearth domesticated and which real crops — ' +
            'the same rules, the likeliest still likeliest, close runners-up a turn (kept in the page’s link)">Re-roll</button>';
        const chosen = picks.get(legendFarming)?.size || farmOptions.roll ? `<button type="button" class="evo-farm-chip" data-farm-reset title="The likeliest history, each hearth’s crops as first chosen">Reset crops</button>` : '';
        const pin = k => `<b style="background:${css(hearthRGB(k))};border-color:#fff;color:#fff">${k + 1}</b>`;
        // (each strain's crop a choice: its group's crops, the likeliest for the hearth first, each with its Earth home —
        // and the hearth whose strain it names, if another's: chosen, the two swap)
        const pick = (h, k, st) => {
            const cur = strainCrop(fin, map, k, st), whose = new Map();
            map.hearths.forEach((o, j) => { if (j !== k && o.crops.includes(st)) whose.set(strainCrop(fin, map, j, st), j); });
            return `<select class="evo-farm-pick" data-farm-pick="${k}:${st}" title="Hearth ${k + 1}’s ${STAPLE_WORDS[st].toLowerCase()} — choose the crop (one taken by another hearth swaps with it)">` +
                cropsFor(st, h).map(id => `<option value="${id}"${id === cur ? ' selected' : ''}>${VARIETALS[id].name}${HOME[id] ? ` · ${HOME[id].name}` : ''}` +
                    `${whose.has(id) ? ` — hearth ${whose.get(id) + 1}’s` : ''}</option>`).join('') + '</select>';
        };
        // (and the Earth hearths it is like: its crops' homes where their climate is like its — partly, if several)
        const likeWords = ps => (ps.length === 1 ? `like ${ps[0].name}` : `partly like ${ps.slice(0, -1).map(p => p.name).join(', ')} and ${ps.at(-1).name}`);
        const crops = (h, k) => {
            if (!farmOptions.realCrops) return only ? STAPLE_WORDS[only] : hearthWords(h);
            const like = likeOf(h, h.crops.map(st => strainCrop(fin, map, k, st)));
            return (only ? [only] : h.crops).map(st => pick(h, k, st)).join(' ') + (like.length && !only ? ` <em>${likeWords(like.slice(0, 3))}</em>` : '');
        };
        const list = map.hearths.map((h, k) => (only && !h.crops.includes(only) ? '' : `<div class="evo-hearth">${pin(k)}<span>${crops(h, k)} — ` +
            (only ? `the main crop on ${pct(S2.strain[k][only])} of the land` : `its crops the main ones on ${pct(S2.hearth[k])} of the land`) + '</span></div>')).join('');
        return head(only ? `Crop spread — ${STAPLE_WORDS[only].toLowerCase()} alone: each hearth’s strain, where it spread` : 'Crop spread — where each place’s crops came from') +
            `<div class="evo-farm-chips">${[Staple.RICE, Staple.WHEAT, Staple.MAIZE, Staple.ROOTS].map(crop).join('')}${by}</div><div class="evo-farm-chips">${chips}</div>` +
            `<div class="evo-farm-chips">${real}${reroll}${chosen}</div>` + list +
            (only ? note('Hatched: where it would grow well but no strain of it ever came — paler where it grows less well')
                : note((farmOptions.byHearth ? 'Each hearth its colour (its pin’s), paler where its crop grows less well' : 'Each crop its colour, each hearth’s strain a shade of it') +
                    `; striped where a second crop does nearly as well; herds where no crop that came does as well (${pct(S2.staple[Staple.HERDING])} of the land)` +
                    (S2.forage >= 0.005 ? `. Hatched: farmland no crop that grows there ever reached — foragers’ (${pct(S2.forage)})` : ''))) +
            (farmOptions.realCrops ? note('Each hearth’s crops: those of Earth hearths with climates and staples like its, the great staples first, crops domesticated together — or near each other on Earth — likelier together; each crop once. ' +
                'Each spreads and is grown best in its own climates, blended toward its hearth’s (domesticated there, it is at home there); a better-suited crop come from near can win a place from the first to reach it, never one from over a long sea. Choose another in the list') : '') +
            note('Farming began at a few hearths far apart — a major desert, mountain range or sea between them, or a continent’s breadth — each domesticating the staples that grew best around it. ' +
                'Over thousands of years each strain spread wherever it grows: fast along rivers, coasts and plains, slowly over hills, deserts, mountains and land it does not suit, ' +
                'over seas where none grew yet but never an ocean’s breadth; a place grows one strain of each crop — the first to reach it — and the one or two of those that do best there');
    }
    if (layer === 'farmPeople') {
        const count = peopleOf(fin);
        if (!count) return head('People — add detail again to see them (this moment was detailed before the harvests were counted)');
        const millions = v => (v >= 1e9 ? `${(v / 1e9).toFixed(1)} billion` : `${Math.round(v / 1e6).toLocaleString()} million`);
        return head('People — how many the land could feed, pre-industrial, with these techniques') + `<div class="evo-farm-chips">${chips}</div>` +
            bar(PEOPLE_LOG, '1 · 5 · 20 · 60 · 150+ a km²') +
            note(`The whole land could feed about ${millions(count.people)} — ${Math.round(count.people / Math.max(1, count.land))} a km² on average; its richest river plains well over 100. ` +
                'What it could support, not how many would live there');
    }
    // Farmland
    const any = farmOptions.flood || farmOptions.canal;
    const look = chip('classes', 'Classes', 'Graded classes — barren, poor, fair, good, excellent — instead of the soft ramp', farmOptions.classes);
    const classes = [4, 3, 2, 1].map(k => sw(ramp(FARM_RAIN, CLASS_AT[k], c).slice(), CLASS_WORDS[k], T.tech[k])).join('');
    const scale = farmOptions.classes ? `<div class="evo-koppen">${classes}${any ? `<span><i style="background:${css(ramp(FARM_WATER, 0.55, c))}"></i>teal: with water brought</span>` : ''}</div>`
        : bar(FARM_RAIN, 'by rain: little → much') + (any ? bar(FARM_WATER, 'only with water brought') : '');
    const good = t => t[3] + t[4];
    if (!fin.raster.farming.crops) return head('Farmland — add detail again to see it (this moment was detailed before the harvests were counted)');
    return head('Farmland — what the land could grow') + `<div class="evo-farm-chips">${chips}${look}</div>` + scale +
        note(`Good: one sure harvest a year · excellent: two or three, off renewed ground (${pct(T.tech[4])} of the land). Good or excellent: ${pct(good(T.tech))} with these techniques, ` +
            `${pct(good(T.rain))} by rain alone. Harvests × soil × ground — what the land could grow, not who would live there`);
}

/** A click on a legend chip: its option flipped; true if it was one. */
export function farmChipClicked(target) {
    if (target.closest?.('[data-farm-reset]')) { picks = new WeakMap(); farmOptions.roll = 0; farmOptions.picks++; return true; }
    // (a re-roll: another roll, at random as a seed is — its hearths may differ, so the crops chosen go)
    if (target.closest?.('[data-farm-roll]')) { picks = new WeakMap(); farmOptions.roll = 1 + Math.floor(Math.random() * 999999); farmOptions.picks++; return true; }
    const crop = target.closest?.('[data-farm-spread]');
    if (crop) { const k = Number(crop.dataset.farmSpread); farmOptions.spreadOnly = farmOptions.spreadOnly === k ? 0 : k; return true; }
    const one = target.closest?.('[data-farm-only]');
    if (one) { const k = Number(one.dataset.farmOnly); farmOptions.only = farmOptions.only === k ? 0 : k; return true; }
    const b = target.closest?.('[data-farm]');
    if (!b) return false;
    farmOptions[b.dataset.farm] = !farmOptions[b.dataset.farm];
    return true;
}
/** A crop chosen for a strain in the legend's list: kept (for the picture whose legend it is) — a crop another strain
 *  had swapping with it, so that no crop names two; true if it was one. */
export function farmPickChanged(target) {
    const at = target.dataset?.farmPick, map = legendFarming && spreadCache.get(legendFarming)?.base;
    if (!at || !map) return false;
    const [k, st] = at.split(':').map(Number), id = target.value;
    if (VARIETALS[id]?.staple !== st || !map.hearths[k]) return false;
    if (!picks.has(legendFarming)) picks.set(legendFarming, new Map());
    const own = picks.get(legendFarming), fin = { raster: { farming: legendFarming } }, was = strainCrop(fin, map, k, st);
    const other = map.hearths.findIndex((h, j) => j !== k && h.crops.includes(st) && strainCrop(fin, map, j, st) === id);
    own.set(at, id);
    if (other >= 0 && was) own.set(`${other}:${st}`, was);
    farmOptions.picks++;
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
    const p = {}, opt = farmOptions, r = placeAt(F, i, p, new Float64Array(2 * CROPS.length), opt, { foods: new Float64Array(6) }), lines = [];
    if (!F.crops) return [L('Farmland', 'add detail again to see it')];
    const cls = farmClass(r.tech), clsRain = farmClass(r.rain);
    // (the harvests a year: whole ones in words, a part one as "about"; the second crop of a rotation counted in them)
    const hw = h => (h < 0.15 ? 'no sure harvest' : h < 0.75 ? 'a poor harvest' : h < 1.35 ? 'one harvest a year' : h < 1.75 ? 'one and a half harvests a year' : `about ${Math.round(h)} harvests a year`);
    lines.push(L('Farmland', `<b>${CLASS_WORDS[cls]}</b> · ${hw(r.harvests)}${cls !== clsRain ? ` · by rain alone ${CLASS_WORDS[clsRain].toLowerCase()}` : ''}`));
    lines.push(L('Staple', r.staple ? `<b>${STAPLE_WORDS[r.staple]}</b>${r.second ? ` · then ${STAPLE_WORDS[r.second].toLowerCase()}` : ''}` : 'nothing grown'));
    const ppl = peopleAt(r);
    lines.push(L('People', ppl < 0.5 ? 'too few to count' : `could feed ~${ppl < 10 ? ppl.toFixed(1) : Math.round(ppl)} a km²`));
    if (layer === 'farmSpread') {
        const map = spreadOf(fin);
        if (map) {
            const sp = spreadPlace(map, 90 - v * 180, u * 360 - 180, r.foods, K.koppen[i], {});
            // (each crop's strain: its hearth, and how far it came — along the way it took; two from one hearth said once)
            const strain = (st, h) => {
                if (h < 0) return '';
                const km = map.km[st - 1][sp.cell];
                return ` — hearth ${h + 1}’s${km >= 300 ? `, come ~${(Math.round(km / 100) * 100).toLocaleString()} km` : ''}`;
            };
            // (with Real crops, each strain's crop, its staple after it)
            const named = (st, h) => (farmOptions.realCrops && h >= 0 && st !== Staple.HERDING ? `${strainName(fin, map, h, st)} (${STAPLE_WORDS[st].toLowerCase()})` : STAPLE_WORDS[st]);
            const second = sp.second ? (sp.secondFrom >= 0 && farmOptions.realCrops ? named(sp.second, sp.secondFrom) : STAPLE_WORDS[sp.second].toLowerCase()) : '', main = `<b>${named(sp.main, sp.mainFrom)}</b>`;
            const crops = !sp.main ? (sp.missed ? 'none — foragers: no crop that grows here ever reached it' : 'nothing grown')
                : !sp.second ? `${main}${strain(sp.main, sp.mainFrom)}`
                : sp.secondFrom === sp.mainFrom ? `${main} and ${second}${strain(sp.main, sp.mainFrom)}`
                : sp.mainFrom < 0 ? `${main} · and ${second}${strain(sp.second, sp.secondFrom)}`
                : `${main}${strain(sp.main, sp.mainFrom)} · and ${sp.secondFrom < 0 ? 'herds' : `${second}${strain(sp.second, sp.secondFrom)}`}`;
            lines.unshift(L('Crops', crops));
            if (sp.missed) lines.splice(1, 0, L('Never came', `${STAPLE_WORDS[sp.missed]} would feed more here — no strain of it ever reached it`));
        }
    }
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
