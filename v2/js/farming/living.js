// Ways of life (plans/V2_FARMING_PLAN.md C6b; developer, 2026-10-29: "a 'staple food source' and then a 'primary
// lifestyle' … im thinking of like the pacific northwest where they could maintain high population density without
// farming just gathering all year round"): in the abstract — what each place would support, not where farming came —
// what its people would live on most, and how they would live:
//   · GATHERING — hunting, fishing and gathering: the sea's fish (its shelf, shallower than ~200 m, within a day's paddle
//     of the shore — the richer the colder its water and the stronger its upwelling: the Northwest Coast's, Peru's,
//     Newfoundland's — less under sea ice and on coasts with hardly a summer), fresh water's (big rivers' plains, rivers
//     and lakes), and the land's wild foods (its plants as long as its growing season; its game on grassland). People a
//     km² as the ethnographic record's foragers (Binford 2001; Kelly 2013; Tallavaara et al. 2018): ~0.01–0.5 on land
//     alone, 1–3 on the richest coasts;
//   · FARMING and HERDING — farming.js farmPlace's staple and people.js peopleAt's people;
//   · the LIFESTYLE: gathering where it would feed people well enough against the land's farming or herding — gatherers
//     keep to their way unless farming or herding would feed `hold` times as many (foragers took up farming late, or
//     never, where wild food was rich) — else farming or herding, as farmPlace chooses between them; a second way of
//     life (and a second food) where it does nearly as well: the views stripe it.
// The sea's part from the finished moment's picture (its sea depths) and its climate's 1° sea (temperature, upwelling,
// ice), once per moment on a grid fixed in degrees (the same at every detail); the rest per pixel from the farming's
// parts — nothing more is saved, so a moment detailed before reads it too.

import { STAPLES, Staple, STAPLE_CROP, CROPS, farmPlace, harvestsAt, hasHarvests } from './farming.js';
import { FARMING } from './farming-config.js';
import { peopleAt } from './people.js';
import { LatLonGrid } from '../finish/finish-grid.js';
import { KOPPEN_ID } from '../climate/koppen.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const S = (r, x) => smooth(r[0], r[1], x);

/** How a place's people would live — each code its place in the list, never changed (the export's lifestyle index). */
export const LIFESTYLES = Object.freeze([
    { key: 'none', word: 'Uninhabited' },
    { key: 'farming', word: 'Farming' },
    { key: 'herding', word: 'Herding' },
    { key: 'gathering', word: 'Gathering' },
]);
export const Lifestyle = Object.freeze(Object.fromEntries(LIFESTYLES.map((l, code) => [l.key.toUpperCase(), code])));
export const LIFESTYLE_WORDS = LIFESTYLES.map(l => l.word);
/** Each staple's way of life (a Lifestyle). */
export const STAPLE_LIFE = STAPLES.map(s => (s.way ? Lifestyle[s.way.toUpperCase()] : Lifestyle.NONE));

export const GATHER = {
    // ── the sea's fish ──
    shelfM: 200,                // the shelf: sea shallower than this (m) — where fish and shellfish are within reach
    reachKm: 40,                // the sea's food within about this of the shore (a Gaussian's spread: a day's paddle out and back)
    warmShelf: 0.3,             // a warm, clear tropical shelf's richness (reefs, lagoons) against a cold or upwelling one's (1)…
    coldSea: [24, 12],          // …richer as the sea's year runs from this warm to this cold (°C: cold water is rich in nutrients)…
    upwell: [0.1, 1],           // …or as its upwelling runs from this to this (m/day: Peru's, California's, Namibia's coasts)…
    seaIceLoss: 0.9,            // …less under sea ice (its year's share × this)
    fishRich: [0.02, 0.25],     // a coast's fishing from the sea's richness within reach (the shelf's share × its richness, spread
                                // over reachKm): little from the first, the most from the second…
    fishPeople: 2.5,            // …feeding up to this many a km² (the Northwest Coast's 1–3: Kroeber 1939; Ames & Maschner 1999)…
    fishSummer: [1, 4],         // …as the land has a summer (its months warm enough to grow: the Arctic's coasts fed few)
    freshPeople: 0.5,           // fresh water's fish — a big river's plain, a river's or a lake's shore (the farming's flood and
                                // canal reach) — up to this many a km² more
    // ── the land's wild foods ──
    wildSeason: [0.5, 9],       // the land's plants as its growing season (months by rain) runs from this to this…
    wildPeople: 0.3,            // …feeding up to this many a km² (foragers on land alone: ~0.01–0.5)
    gamePeople: 0.08,           // and grassland game, by the pasture (farming.js pastureOf): up to this many more
    // ── which way of life ──
    hold: 10,                   // gatherers keep to their way unless farming or herding would feed this many times as many
    close: 0.9,                 // a second way of life — or food — striped where it does this well against the first (at 0.8
                                // the land's runner-up crop or herds came that close on ~40 % of it: a mottle, not a map)
    minPeople: 0.005,           // fewer than this a km² could live there: uninhabited (ice, the driest deserts)
    gridDeg: 0.25,
    sampleW: 1440,              // the picture's sea read about this many pixels wide
};

/**
 * The sea's part, once per finished moment: each grid cell's fishing — the shelf's share of the sea around it × the sea's
 * richness, spread over GATHER.reachKm (land cells near a rich shelf high; inland none) — from the picture `R`
 * (raster: heightM, ocean, w, h) and the moment's climate `C` (the 1° grid: Tsea, upwelling, seaIce — each {year…}).
 * @returns {{grid: LatLonGrid, fish: Float32Array}} or null without the sea's climate
 */
export function gatherGround(R, C, G = GATHER) {
    if (!R?.heightM || !C?.Tsea || !C.upwelling) return null;
    const g = new LatLonGrid(G.gridDeg), N = g.size, area = new Float64Array(N), shelf = new Float64Array(N);
    const stride = Math.max(1, Math.ceil(R.w / G.sampleW)), shelfM = -G.shelfM;
    for (let y = 0; y < R.h; y += stride) {
        const lat = 90 - (y + 0.5) / R.h * 180;
        for (let x = 0; x < R.w; x += stride) {
            const i = y * R.w + x, c = g.index(lat, (x + 0.5) / R.w * 360 - 180);
            area[c]++;
            if (R.ocean[i] && R.heightM[i] > shelfM) shelf[c]++;
        }
    }
    // (the sea's richness at each grid cell: its 1° climate's — 360 × 180, rows north → south from 90°, columns from −180°)
    const T = C.Tsea.year, U = C.upwelling.year, I = C.seaIce?.year, rich = new Float32Array(N);
    for (let j = 0; j < g.h; j++) {
        const lat = 90 - (j + 0.5) * g.step, cj = Math.min(179, Math.max(0, Math.floor(90 - lat)));
        for (let i = 0; i < g.w; i++) {
            const c = j * g.w + i;
            if (!area[c] || !shelf[c]) continue;
            const k = cj * 360 + Math.min(359, Math.max(0, Math.floor((i + 0.5) * g.step)));
            const r = (G.warmShelf + (1 - G.warmShelf) * Math.max(S(G.coldSea, T[k]), S(G.upwell, U[k]))) * (1 - G.seaIceLoss * (I ? I[k] : 0));
            rich[c] = (shelf[c] / area[c]) * r;
        }
    }
    return { grid: g, fish: g.blur(rich, G.reachKm) };
}

/**
 * What gatherers could live on at a pixel (into out: fish, wild, people — a km²) from the moment's sea (`ground`:
 * gatherGround's, or null: no sea's fish), the place's lat and lon, its farming parts `p` (rain and warm: months; flood,
 * canal: 0…1) and pasture (0…1).
 */
export function gatherAt(ground, lat, lon, p, pasture, out = {}, G = GATHER) {
    const sea = ground ? ground.grid.at(ground.fish, lat, lon) : 0;
    out.fish = G.fishPeople * S(G.fishRich, sea === sea ? sea : 0) * S(G.fishSummer, p.warm) + G.freshPeople * Math.max(p.flood, 0.5 * p.canal) * S(G.fishSummer, p.warm);
    out.wild = G.wildPeople * S(G.wildSeason, p.rain) + G.gamePeople * pasture;
    out.people = out.fish + out.wild;
    return out;
}

/**
 * A place's way of life (into out) from farmPlace's out `r` (with foods), its parts `p`, the techniques `tech` and what
 * gatherers could live on there (`g`: gatherAt's): lifestyle and second (a Lifestyle: the second where it does
 * GATHER.close as well, else NONE), staple and second (a Staple, likewise — the farming's crops and herds by their food,
 * as farmPlace weighs them; gathering's fish and wild foods by the people each feeds), people a km² (its way of life's),
 * landPeople (what farming or herding would feed: peopleAt's), and score (0…1: how well its staple feeds it there).
 */
export function livingPlace(r, p, tech, g, out = {}, G = GATHER, K = FARMING) {
    const land = r.staple ? peopleAt(r, p, tech, undefined, K) : 0, held = G.hold * g.people;
    const landLife = STAPLE_LIFE[r.staple], gFood = g.fish >= g.wild ? Staple.FISH : Staple.WILD, gOther = gFood === Staple.FISH ? Staple.WILD : Staple.FISH;
    const gv = Math.max(g.fish, g.wild), go = Math.min(g.fish, g.wild);
    // (the land's runner-up — a crop or the herds — where farmPlace weighs it nearly as well as its staple)
    const landSecond = r.second && r.foods && r.foods[r.second] >= G.close * r.foods[r.staple] ? r.second : Staple.NONE;
    out.landPeople = land;
    if (held > land && g.people >= G.minPeople) {
        out.lifestyle = Lifestyle.GATHERING; out.staple = gFood; out.people = g.people;
        out.score = gatherScore(gv, gFood === Staple.FISH ? G.fishPeople : G.wildPeople + G.gamePeople);
        const landClose = land >= G.close * held;
        out.second = go >= G.close * gv && go > 0 ? gOther : landClose ? r.staple : Staple.NONE;
        out.secondLife = landClose ? landLife : Lifestyle.NONE;
    } else if (r.staple && land >= G.minPeople) {
        out.lifestyle = landLife; out.staple = r.staple; out.people = land; out.score = r.score;
        const gatherClose = held >= G.close * land && g.people >= G.minPeople;
        out.second = landSecond || (gatherClose ? gFood : Staple.NONE);
        out.secondLife = gatherClose ? Lifestyle.GATHERING : landSecond ? STAPLE_LIFE[landSecond] : Lifestyle.NONE;
        if (out.secondLife === out.lifestyle) out.secondLife = Lifestyle.NONE;
    } else {
        out.lifestyle = Lifestyle.NONE; out.staple = Staple.NONE; out.people = 0; out.score = 0; out.second = Staple.NONE; out.secondLife = Lifestyle.NONE;
    }
    return out;
}

/** Each food's score alone at a place (0…1: how well it would feed it, were it the staple) — the crops' and the herds' as
 *  farmPlace scores them, fish and wild foods as the people they feed against the most they could. */
export function foodScore(st, r, g, G = GATHER) {
    if (st === Staple.FISH) return gatherScore(g.fish, G.fishPeople);
    if (st === Staple.WILD) return gatherScore(g.wild, G.wildPeople + G.gamePeople);
    return r.scores ? r.scores[st] : 0;
}
/** A gathered food's score (0…1) from the people it feeds against the most it could — on a square root: most coasts'
 *  fish feed a tenth or a fifth of the richest's, and should still show. */
const gatherScore = (v, most) => Math.sqrt(Math.min(1, Math.max(0, v) / most));

/** Each way of life's people alone at a place (a km²): farming's (its best crop's, were it farmed), herding's, gathering's. */
export function lifestylePeople(life, r, p, tech, g, K = FARMING) {
    if (life === Lifestyle.GATHERING) return g.people;
    if (!r.foods) return 0;
    // (the best of the land's food sources of that way of life, as if it were the staple)
    let best = Staple.NONE;
    for (let st = 1; st < STAPLES.length; st++) if (STAPLE_LIFE[st] === life && (STAPLE_CROP[st] >= 0 || st === Staple.HERDING) && (!best || r.foods[st] > r.foods[best])) best = st;
    if (!best || !(r.foods[best] > 0)) return 0;
    if (best === r.staple) return peopleAt(r, p, tech, undefined, K);
    // (another than the place's staple: its food on the farmland scale — farmPlace's tech value — and that one's people)
    const alt = { staple: best, tech: life === Lifestyle.HERDING ? 0 : r.foods[best] / (r.foods[best] + K.farmHalf), score: life === Lifestyle.HERDING ? r.scores[best] : 0 };
    return peopleAt(alt, p, tech, undefined, K);
}

/**
 * The people the whole land of a finished moment could feed, each place by its way of life (people.js landPeople's,
 * gatherers counted too) — from its farming picture `F`, land `L` (raster.climate) and sea (`ground`: gatherGround's),
 * with the techniques `tech`. @returns {{people, land (km²), byLife: number[] (people, by Lifestyle)}}
 */
export function livingPeople(F, L, ground, tech, G = GATHER, K = FARMING, P = PEOPLE_SAMPLE) {
    const p = {}, e = new Float64Array(2 * CROPS.length), r = { scores: new Float64Array(STAPLES.length), foods: new Float64Array(STAPLES.length) }, g = {}, o = {};
    const stride = Math.max(1, Math.ceil(F.w / P)), R = 6371, pxKm2 = (2 * Math.PI * R / F.w) * (Math.PI * R / F.h), byLife = new Float64Array(LIFESTYLES.length);
    let people = 0, land = 0;
    const kept = hasHarvests(F);
    for (let y = 0; y < F.h; y += stride) {
        const lat = 90 - (y + 0.5) / F.h * 180, a = Math.cos(lat * Math.PI / 180) * stride * stride * pxKm2;
        for (let x = 0; x < F.w; x += stride) {
            const i = y * F.w + x;
            if (!L.koppen[i]) continue;
            land += a;
            if (L.koppen[i] === KOPPEN_ID.EF) continue;
            partsOf(F, i, p);
            if (kept) harvestsAt(F.crops, i, e); else e.fill(0);
            farmPlace(p, e, F.pasture[i] / 255, tech, r, K);
            gatherAt(ground, lat, (x + 0.5) / F.w * 360 - 180, p, F.pasture[i] / 255, g, G);
            livingPlace(r, p, tech, g, o, G, K);
            people += a * o.people; byLife[o.lifestyle] += a * o.people;
        }
    }
    return { people, land, byLife: [...byLife] };
}
/** A farming picture's parts at pixel i (into p): soil, the season's months (by rain, warm), the water reach, slope,
 *  waterlogging — as the page reads them. */
export function partsOf(F, i, p) {
    p.soil = F.soil[i] / 255; p.rain = F.rain[i] / 20; p.warm = F.warm[i] / 20; p.flood = F.flood[i] / 255; p.canal = F.canal[i] / 255;
    p.slope = 2 * F.slope[i]; p.wetland = F.wetland[i] / 255;
    return p;
}
const PEOPLE_SAMPLE = 1440;     // (the whole land's count read about this many pixels wide, as people.js landPeople's)
