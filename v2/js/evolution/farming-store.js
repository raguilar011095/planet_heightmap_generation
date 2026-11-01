// What each place of a finished moment is, for the Food views (developer, 2026-10-31: "Why do we recalculate everything
// again?" — every repaint worked each pixel out afresh, though a chip, a view or a zoom only changes its colours; "half
// precision is ok"): its farmland, staple food, way of life and people, and — for Way of life and Animals — its food
// system, beasts and fly belt, worked out once per moment and techniques for each land pixel of its farming picture and
// kept at half precision (16 bits: 0…1 values to 1/65535, people as log10(1 + people) to 1/16384), so the views, their
// zoomed-in tiles, the legend's shares and the data maps only read them. ~12 bytes a land pixel, 9 more once Way of life or
// Animals is opened, 2 for a chip's one-alone values (worked out the first time they are asked for; the last of each kind
// kept). The hover readout still works its one place out in full. What a view decides at a threshold is kept on the
// same side of it as worked out in full: the farmland's classes kept as classes, a beast's keeping at the floor that
// says it is kept (the fly belt leaves cattle and buffalo exactly at it).
// Land pixels only: an index of a bit per pixel and the count before each 32 (a pixel's place in the store: the count
// before its word and its set bits before it in the word).
// As it came (F4): the same worked out with only the crops and beasts that had come to each place by an age of the
// history (cameOf) — kept apart from the land's own, the last three of each kind kept (the land's own and two ages).

import { farmPlace, farmClass, harvestsAt, hasHarvests, cameHarvests, Staple, STAPLES, CROPS } from '../farming/farming.js';
import { gatherGround, gatherAt, livingPlace, foodScore, lifestylePeople, Lifestyle, foodSystem, measuresAt, hasMeasures, paddyOf } from '../farming/living.js';
import { beastPlace, newBeasts, flyBelt, beastKeepOne, BEAST, BEASTS, ALL_BEASTS } from '../farming/beasts.js';
import { KOPPEN_ID } from '../climate/koppen.js';
import { historyGround, historyLuck, flyHereAt, ARCHETYPES, beastArchetype, gridPlace, GRID_W, mix } from '../farming/history.js';
import { CAT, ANIMALS, choosePackages, chooseItem } from '../farming/names.js';
import { minorGround, minorItems, minorBuild, minorAt, arriveByte, ARRIVE_NEVER, strainSpreads, strainRanks, rankStrains } from '../farming/minor.js';
import { FARMING } from '../farming/farming-config.js';
import { landPixel } from './climate-view.js';
import { hearthRegions, runHearths } from '../farming/hearths.js';

// ── a place, worked out in full (the store's, the hover's, the harvest months') ──
/** A pixel's parts (into p) — from the farming picture's pixel i. */
export function partsAt(F, i, p) {
    p.soil = F.soil[i] / 255; p.rain = F.rain[i] / 20; p.warm = F.warm[i] / 20; p.flood = F.flood[i] / 255; p.canal = F.canal[i] / 255;
    p.slope = 2 * F.slope[i]; p.wetland = F.wetland[i] / 255;
    return p;
}
/** A pixel's farming with the options (into r: farming.js farmPlace's — farmland, harvests, staple — given its parts p and
 *  a scratch e for its crops' harvests); nothing grown on a moment detailed before the harvests were kept. With `came`
 *  (cameAt's: what had come there), only the crops that had come — the first come its staple unless a later one does far
 *  better (farming.js farmPlace) — and the herds as fully as their best come beast is kept. */
export function placeAt(F, i, p, e, opt, r, came = null) {
    partsAt(F, i, p);
    if (!hasHarvests(F)) { r.tech = r.rain = r.harvests = r.harvestsRain = r.water = r.score = 0; r.staple = r.second = Staple.NONE; return r; }
    harvestsAt(F.crops, i, e);
    if (came) cameHarvests(e, came.mask);
    return farmPlace(p, e, F.pasture[i] / 255 * (came ? came.herd : 1), opt, r, undefined, came ? came.t : null);
}
/** A finished moment's sea for its gatherers (farming/living.js gatherGround: its fishing grounds), once per moment —
 *  null without the sea's climate (fish then from fresh water alone). */
const groundCache = new WeakMap();
export function groundOf(fin) {
    const R = fin?.raster;
    if (!R) return null;
    if (!groundCache.has(R)) groundCache.set(R, gatherGround(R, fin.climate));
    return groundCache.get(R);
}
/** A pixel's way of life (into o: living.js livingPlace's — lifestyle, staple food, people…), from its farming (r: placeAt's,
 *  which must have run) and what gatherers could live on there (into g), at (lat, lon). */
export function livingAt(F, i, lat, lon, p, r, ground, opt, g, o) {
    gatherAt(ground, lat, lon, p, F.pasture[i] / 255, g);
    return livingPlace(r, p, opt, g, o);
}
/** A pixel's beasts and food system (into bp: beasts.js beastPlace's; sy: living.js foodSystem's) from its farming r and way
 *  of life lv (placeAt's and livingAt's, which must have run), its parts p and gatherers' g, at latitude lat — L a scratch
 *  for its measures (living.js measuresAt: the finished picture R's heights, the climate's picture K's year); `flyHere`
 *  whether the fly lives on its landmass (historyOf's luck: flyAt); `came` what had come there (cameAt's; null: all). */
export function systemAt(R, K, i, p, r, lv, g, lat, L, bp, sy, flyHere = 1, came = null) {
    measuresAt(R, K, i, p, lat, L);
    L.flyHere = flyHere;
    L.beasts = came ? beastBits(came.mask) : ALL_BEASTS;
    L.paddy = lv.lifestyle === Lifestyle.FARMING ? paddyOf(r) : 0;
    beastPlace(L, lv.lifestyle === Lifestyle.HERDING, bp);
    return foodSystem(r, lv, L, bp, g, sy);
}
/** Whether farmers or herders live at a place (they keep beasts; gatherers and the uninhabited none). */
export const keepsBeasts = lv => lv.lifestyle === Lifestyle.FARMING || lv.lifestyle === Lifestyle.HERDING;

// ── the history (farming/history.js): its ground once per moment, its luck once per moment, re-roll and Fewer gaps ──
const histories = new WeakMap(), lucks = new WeakMap();
/** A finished moment's history ground — null where the moment lacks what it reads (its heights, its climate's year). */
export function historyOf(fin) {
    const F = fin?.raster?.farming, K = fin?.climate?.raster;
    if (!F || !K || !hasMeasures(fin.raster, K)) return null;
    if (!histories.has(F)) histories.set(F, historyGround(fin.raster, K, F, fin.climate, groundOf(fin)));
    return histories.get(F);
}
/** Each landmass's luck on a finished moment (history.js historyLuck: its beasts, its fly) for a re-roll and Fewer gaps —
 *  from the world's seed and the moment's time (fin.seed, fin.time). */
export function luckOf(fin, roll, fewer) {
    const G = historyOf(fin);
    if (!G) return null;
    const key = `${roll}|${+fewer}`, kept = lucks.get(G);
    if (kept?.key === key) return kept.luck;
    const luck = historyLuck(G, fin.seed ?? 0, fin.time ?? 0, roll, fewer);
    lucks.set(G, { key, luck });
    return luck;
}
/** A finished moment's history run (farming/hearths.js: its hearths, the spread in years) for a re-roll and Fewer gaps —
 *  its candidate regions once per moment, the run once per luck; null without a history. */
const regionsCache = new WeakMap(), runs = new WeakMap();
export function hearthsOf(fin, roll, fewer) {
    const G = historyOf(fin), luck = G && luckOf(fin, roll, fewer);
    if (!luck) return null;
    if (!regionsCache.has(G)) regionsCache.set(G, hearthRegions(G));
    const key = `${roll}|${+fewer}`, kept = runs.get(G);
    if (kept?.key === key) return kept.run;
    const run = runHearths(G, regionsCache.get(G), luck, fin.seed ?? 0, fin.time ?? 0, roll);
    runs.set(G, { key, run });
    return run;
}
/** Whether the fly lives at a place, as a function of (lat, lon) — its landmass's luck (1 everywhere without a history). */
export function flyAtOf(fin, roll, fewer) {
    const G = historyOf(fin), luck = G && luckOf(fin, roll, fewer);
    return luck ? (lat, lon) => flyHereAt(G, luck, lat, lon) : () => 1;
}

// ── as it came (F4): what had come to each place by an age of the history ──
const NA = ARCHETYPES.length, NCROP = CROPS.length;
/** Every archetype's bit (history.js ARCHETYPES: the crop groups', then the beasts'). */
export const CAME_ALL = (1 << NA) - 1;
/** A mask's beasts as beastPlace's L.beasts (a bit per Beast). */
const beastBits = mask => ((mask >>> NCROP) << 1) & ALL_BEASTS;
/** The herders' beasts, and how well the best come one must be kept for its herds to graze a place fully (history.js's
 *  ground: G.keep, 0…1) — from none at the first to all at the second. */
const HERD_BEASTS = BEASTS.map((B, b) => b).filter(b => b && BEASTS[b].herd), HERD_KEEP = [0.1, 0.35];
const herdShare = x => { const t = Math.min(1, Math.max(0, (x - HERD_KEEP[0]) / (HERD_KEEP[1] - HERD_KEEP[0]))); return t * t * (3 - 2 * t); };
const cames = new WeakMap();
/**
 * What had come by `age` years after the first farming (Infinity: all that ever would) on a finished moment's history, for a
 * re-roll and Fewer gaps (hearthsOf's run): on each cell of its ground the archetypes come by then (`by`) and those that
 * ever come (`ever`), a bit each, and how fully its come herds could graze it (`herd`: its best come herd beast's keeping)
 * — read at a place by cameAt. Once per run and age, the last two kept; null without a history.
 */
export function cameOf(fin, roll, fewer, age) {
    const G = historyOf(fin), run = G && hearthsOf(fin, roll, fewer);
    if (!run) return null;
    const key = `${roll}|${+fewer}|${age}`, list = cames.get(run) ?? [];
    const kept = list.find(C => C.key === key);
    if (kept) return kept;
    const N = G.w * G.h, by = new Uint16Array(N), ever = new Uint16Array(N), herd = new Float32Array(N);
    for (let c = 0; c < N; c++) {
        let m = 0, e = 0, h = 0;
        for (let a = 0; a < NA; a++) { const t = run.best[a][c]; if (t < Infinity) { e |= 1 << a; if (t <= age) m |= 1 << a; } }
        for (const b of HERD_BEASTS) if ((m >> beastArchetype(b)) & 1) h = Math.max(h, herdShare(G.keep[b][c]));
        by[c] = m; ever[c] = e; herd[c] = h;
    }
    const C = { key, G, best: run.best, age, by, ever, herd };
    list.unshift(C);
    if (list.length > 2) list.pop();
    cames.set(run, list);
    return C;
}
/** What had come to a place (lat, lon) (into out: { mask, herd }) from cameOf's C — read smoothly over the history's cells
 *  as When farming came is (history.js gridPlace: the 4 × 4 round it, a Gaussian say each): an archetype come where the
 *  cells it ever reaches have it by the age on their say's mean — every one, none, or between by their times — and how
 *  fully its herds could graze it (the land cells' say). */
const GPc = {}, cw = new Float64Array(16), cc = new Int32Array(16);
export function cameAt(C, lat, lon, out = {}) {
    const G = C.G, w = G.w;
    gridPlace(G, lat, lon, GPc);
    let n = 0, any = 0, some = 0, sure = -1, herd = 0, hw = 0;
    for (let dy = 0; dy < 4; dy++) {
        const j = GPc.j0 + dy;
        if (j < 0 || j >= G.h) continue;
        const wy = GRID_W[GPc.qy + dy];
        for (let dx = 0; dx < 4; dx++) {
            const c = j * w + ((GPc.i0 + dx) % w + w) % w, s = wy * GRID_W[GPc.qx + dx], e = C.ever[c], b = C.by[c];
            cc[n] = c; cw[n++] = s;
            any |= e; some |= b & e; sure &= b | ~e;
            if (G.land[c]) { herd += s * C.herd[c]; hw += s; }
        }
    }
    sure &= any;
    let mask = sure, open = some & ~sure;
    for (let k = 0; open; k++, open >>>= 1) {
        if (!(open & 1)) continue;
        const f = C.best[k], bit = 1 << k;
        let st = 0, sw = 0;
        for (let m = 0; m < n; m++) if (C.ever[cc[m]] & bit) { st += cw[m] * f[cc[m]]; sw += cw[m]; }
        if (st <= C.age * sw) mask |= bit;
    }
    out.mask = mask;
    out.herd = hw > 0 ? herd / hw : 0;
    // (each crop group's arrival there, years — its come cells' times on their say — for the staple: the first come leads)
    const t = out.t ??= new Float64Array(NCROP);
    for (let g = 0; g < NCROP; g++) {
        t[g] = Infinity;
        if (!((mask >> g) & 1)) continue;
        const f = C.best[g], bit = 1 << g;
        let st = 0, sw = 0;
        for (let m = 0; m < n; m++) if (C.ever[cc[m]] & bit) { st += cw[m] * f[cc[m]]; sw += cw[m]; }
        if (sw > 0) t[g] = st / sw;
    }
    return out;
}

// ── names (F5a): each place crops or beasts were first tamed is "like" one of Earth's regions; each strain named ──
const namesCache = new WeakMap();
/**
 * A finished moment's names for its history's strains (farming/names.js), for a re-roll and Fewer gaps — once per run:
 * { sites: each centre's { lat, lon, mass, t, h: its climate — mean °C, wetness (the aridity index), height km, the winter's
 * share of its rain — pkg, pkg2: its Earth likeness and runner-up (names.js KEYS) }, strains: the run's, each with its
 * `label` ("emmer-like") and catalogue `item` }. Its own seeded stream (the world's seed, the moment, the re-roll and the
 * names' own re-roll `nameRoll`); the likenesses pulled together as `pull` says (names.js PULL), the names weighed by the
 * realism `real` (REAL_NAMES). The last two kept per run; null without a history.
 */
const REAL_NAMES = { earth: { pop: 1.6, nut: 0.8, noise: 0.25, site: 0.2 }, balanced: { pop: 1, nut: 0.5, noise: 0.35, site: 0.3 }, wild: { pop: 0.12, nut: 0.08, noise: 1.2, site: 0.9 } };
export function namesOf(fin, roll, fewer, pull = 'regional', nameRoll = 0, real = 'balanced') {
    const G = historyOf(fin), run = G && hearthsOf(fin, roll, fewer);
    if (!run) return null;
    const nkey = `${pull}|${nameRoll}|${real}`, list = namesCache.get(run) ?? [], kept = list.find(N => N.key === nkey);
    if (kept) return kept;
    const RW = REAL_NAMES[real] ?? REAL_NAMES.balanced;
    const R = fin.raster, F = R.farming, K = fin.climate.raster, Pm = fin.climate.P, p = {}, L = {};
    const sites = run.centres.map(C => {
        const i = landPixel(K, K.w, Math.floor((C.lon + 180) / 360 * K.w), Math.floor((90 - C.lat) / 180 * K.h));
        if (i >= 0) { partsAt(F, i, p); measuresAt(R, K, i, p, C.lat, L); } else { L.T = 15; L.arid = 0.7; L.elev = 0.3; }
        const q = Math.min(179, Math.max(0, Math.floor(90 - C.lat))) * 360 + ((Math.floor(C.lon + 180) % 360) + 360) % 360;
        const jan = Pm?.jan?.[q] ?? 0, jul = Pm?.jul?.[q] ?? 0, ws = (jan + jul) > 0 ? (C.lat >= 0 ? jan : jul) / (jan + jul) : 0.3;
        return { lat: C.lat, lon: C.lon, mass: G.mass[C.cell], t: C.t0, h: { T: L.T, W: L.arid, E: L.elev, ws } };
    });
    const seed = mix(fin.seed | 0, Math.round((fin.time ?? 0) * 1000), roll | 0, 0x4e41, nameRoll | 0), h01 = (s, stream, id) => (mix(s, stream, id) + 0.5) / 4294967296;
    const { pkg, second } = choosePackages(sites, pull, seed, h01, RW.site);
    sites.forEach((s, k) => { s.pkg = pkg[k]; s.pkg2 = second[k]; });
    // (each strain named, the earliest tamed first: the first takes the best-fitting name, each once where it can be)
    const used = new Map(), usedFor = a => { if (!used.has(a)) used.set(a, new Map()); return used.get(a); };
    const strains = run.strains.map((s, id) => ({ a: s.a, centre: s.centre, t0: s.t0, id, label: '', item: null }));
    for (const s of [...strains].sort((x, y) => x.t0 - y.t0)) {
        const site = sites[s.centre], list = s.a < NCROP ? CAT.staple[s.a] : ANIMALS[s.a - NCROP + 1];
        if (!site || !list?.length) { s.label = ARCHETYPES[s.a].word.toLowerCase(); continue; }
        const r = chooseItem(list, site.h, site.pkg, site.pkg2, usedFor(s.a), pull, seed, h01, 1 + s.id, RW);
        s.label = r.label; s.item = r.item;
    }
    const N = { key: nkey, sites, strains, seed };
    list.unshift(N);
    if (list.length > 2) list.pop();
    namesCache.set(run, list);
    return N;
}

// ── the crops beyond the staples, and the small animals (F5b: farming/minor.js) ──
const minorGrounds = new WeakMap(), minorItemsCache = new WeakMap(), farm1Cache = new WeakMap(), minorBuilt = new WeakMap(), minorAges = new WeakMap();
/**
 * A finished moment's crops beyond the staples, for a re-roll, Fewer gaps, the realism (`real`), the likeness pull (`pull`)
 * and the names' re-roll — { Gm (the 1° ground), items (the catalogue's, each with its fit), built (per item: grown at all,
 * its homes, each cell's arrival), farm (each 1° cell's farming's arrival), names (namesOf's), run } — the ground and fits
 * once per moment, the rest once per run and settings (the last two kept); null without a history.
 */
export function minorOf(fin, roll, fewer, real = 'balanced', pull = 'regional', nameRoll = 0) {
    const G = historyOf(fin), run = G && hearthsOf(fin, roll, fewer), N = run && namesOf(fin, roll, fewer, pull, nameRoll, real);
    if (!N) return null;
    if (!minorGrounds.has(G)) minorGrounds.set(G, minorGround(G));
    const Gm = minorGrounds.get(G);
    if (!minorItemsCache.has(Gm)) minorItemsCache.set(Gm, minorItems(Gm));
    const items = minorItemsCache.get(Gm), key = `${real}|${pull}|${nameRoll}`, list = minorBuilt.get(run) ?? [], kept = list.find(M => M.key === key);
    if (kept) return kept;
    // (each 1° cell's farming: its 0.5° cells' first)
    let farm = farm1Cache.get(run);
    if (!farm) {
        farm = new Float64Array(Gm.N).fill(Infinity);
        const f = Math.round(Gm.deg / G.deg);
        for (let j = 0; j < G.h; j++) for (let i = 0; i < G.w; i++) { const t = run.farmTime[j * G.w + i], c = Math.floor(j / f) * Gm.w + Math.floor(i / f); if (t < farm[c]) farm[c] = t; }
        farm1Cache.set(run, farm);
    }
    // (the sites: every candidate region farming reached, its land within a 1° cell round it, its Earth likeness its nearest
    // centre's — on its own landmass where it can be)
    const gc = (la1, lo1, la2, lo2) => { const r = Math.PI / 180, a = Math.sin((la2 - la1) * r / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin((lo2 - lo1) * r / 2) ** 2; return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a))); };
    const sites = [], f = Math.round(Gm.deg / G.deg);
    for (const R of regionsCache.get(G).regions) {
        const t = run.farmTime[R.cell];
        if (R.beastOnly || !(t < Infinity)) continue;
        const j = Math.floor(Math.floor(R.cell / G.w) / f), i = Math.floor((R.cell % G.w) / f), cells = [];
        for (let dj = -1; dj <= 1; dj++) { const jj = j + dj; if (jj < 0 || jj >= Gm.h) continue; for (let di = -1; di <= 1; di++) { const c = jj * Gm.w + (i + di + Gm.w) % Gm.w; if (Gm.land[c]) cells.push(c); } }
        let near = null, nd = Infinity;
        N.sites.forEach(S => { const d = gc(R.lat, R.lon, S.lat, S.lon) + (S.mass === R.mass ? 0 : 3000); if (d < nd) { nd = d; near = S; } });
        if (near && cells.length) sites.push({ cells, mass: R.mass, pkg: near.pkg, pkg2: near.pkg2, t, lat: R.lat, lon: R.lon });
    }
    const built = minorBuild(Gm, items, { farm, sites, seed: mix(N.seed, 0x6d69) }, { real, pull });
    const M = { key, Gm, items, built, farm, names: N, run, sites };
    list.unshift(M);
    if (list.length > 2) list.pop();
    minorBuilt.set(run, list);
    return M;
}
/** What each 1° cell grows at an age (years after the first farming; Infinity: the full spread; null: the best possible) —
 *  minor.js minorAt's, the staple crop groups grown there counted into the variety; the last three ages kept. */
export function minorAgeOf(M, age) {
    const list = minorAges.get(M) ?? [], key = String(age), kept = list.find(A => A.key === key);
    if (kept) return kept;
    const { Gm, run } = M;
    // (the staples grown in each 1° cell: each crop group that fits it — and, as it came, had reached it)
    const staples = new Uint8Array(Gm.N), NCROP = Gm.fit.length, f = 2, w0 = Gm.w * f;
    for (let c = 0; c < Gm.N; c++) {
        if (!Gm.land[c]) continue;
        const j = (c / Gm.w) | 0, i = c - j * Gm.w;
        let n = 0;
        for (let g = 0; g < NCROP; g++) {
            if (Gm.fit[g][c] < 0.25) continue;
            if (age !== null) {
                let t = Infinity;
                for (let dj = 0; dj < f; dj++) for (let di = 0; di < f; di++) { const v = run.best[g][(j * f + dj) * w0 + i * f + di]; if (v < t) t = v; }
                if (!(t <= age)) continue;
            }
            n++;
        }
        staples[c] = n;
    }
    const A = minorAt(Gm, M.items, M.built, M.farm, age === null ? -1 : age === Infinity ? ARRIVE_NEVER - 1 : arriveByte(age), age === null ? Infinity : age, staples);
    A.key = key;
    list.unshift(A);
    if (list.length > 3) list.pop();
    minorAges.set(M, list);
    return A;
}
// ── the strains spreading by themselves, ranked at each place (minor.js strainSpreads, strainRanks) ──
const spreadsCache = new WeakMap(), ranksCache = new WeakMap();
/** Each 1° cell's farming's arrival (its 0.5° cells' first) — once per run. */
function farmOf1(G, run, Gm) {
    let farm = farm1Cache.get(run);
    if (farm) return farm;
    farm = new Float64Array(Gm.N).fill(Infinity);
    const f = Math.round(Gm.deg / G.deg);
    for (let j = 0; j < G.h; j++) for (let i = 0; i < G.w; i++) { const t = run.farmTime[j * G.w + i], c = Math.floor(j / f) * Gm.w + Math.floor(i / f); if (t < farm[c]) farm[c] = t; }
    farm1Cache.set(run, farm);
    return farm;
}
/** A finished moment's strains, each spread by itself (once per run), and their ranks at an age (years; Infinity all that
 *  came; null the best possible: every strain wherever it grows) — { SP, Gm, R } or null without a history. The last three
 *  ages kept. */
export function strainsOf(fin, roll, fewer, age) {
    const G = historyOf(fin), run = G && hearthsOf(fin, roll, fewer);
    if (!run) return null;
    if (!minorGrounds.has(G)) minorGrounds.set(G, minorGround(G));
    const Gm = minorGrounds.get(G);
    let SP = spreadsCache.get(run);
    if (!SP) { SP = strainSpreads(Gm, run, farmOf1(G, run, Gm), G, NCROP); spreadsCache.set(run, SP); }
    const key = String(age), list = ranksCache.get(SP) ?? [];
    let R = list.find(x => x.key === key);
    if (!R) {
        R = strainRanks(SP, Gm, age === null ? -1 : age === Infinity ? ARRIVE_NEVER - 1 : arriveByte(age), FARMING.lateYears, NA);
        R.key = key;
        list.unshift(R);
        if (list.length > 3) list.pop();
        ranksCache.set(SP, list);
    }
    return { SP, Gm, R, run };
}
/** The strains ranked at the 1° cell under (lat, lon): crops and beasts (minor.js rankStrains). */
export function strainsHere(S, lat, lon, age) {
    const Gm = S.Gm, c = Math.min(Gm.h - 1, Math.max(0, Math.floor((90 - lat) / Gm.deg))) * Gm.w + ((Math.floor((lon + 180) / Gm.deg) % Gm.w) + Gm.w) % Gm.w;
    if (!Gm.land[c]) return { crops: [], beasts: [] };
    const ab = age === null ? -1 : age === Infinity ? ARRIVE_NEVER - 1 : arriveByte(age);
    return { crops: rankStrains(S.SP, Gm, c, ab, false, FARMING.lateYears), beasts: rankStrains(S.SP, Gm, c, ab, true, FARMING.lateYears) };
}
/** The strain with the most say round (lat, lon) in a ranks map `arr` (an Int16Array per 1° cell: a strain or −1), each land
 *  cell a Gaussian say (history.js gridPlace) — −1 where none leads. */
const GPs = {}, MAX_STRAINS = 2048, sSay = new Float64Array(MAX_STRAINS), sStamp = new Int32Array(MAX_STRAINS), sUsed = new Int32Array(16);
let sStampN = 0;
export function strainVote(Gm, arr, lat, lon) {
    gridPlace(Gm, lat, lon, GPs);
    const w = Gm.w;
    let n = 0;
    sStampN++;
    for (let dy = 0; dy < 4; dy++) {
        const j = GPs.j0 + dy;
        if (j < 0 || j >= Gm.h) continue;
        const wy = GRID_W[GPs.qy + dy];
        for (let dx = 0; dx < 4; dx++) {
            const c = j * w + ((GPs.i0 + dx) % w + w) % w, s = arr[c];
            if (s < 0 || s >= MAX_STRAINS || !Gm.land[c]) continue;
            if (sStamp[s] !== sStampN) { sStamp[s] = sStampN; sSay[s] = 0; sUsed[n++] = s; }
            sSay[s] += wy * GRID_W[GPs.qx + dx];
        }
    }
    let top = -1;
    for (let m = 0; m < n; m++) if (top < 0 || sSay[sUsed[m]] > sSay[top]) top = sUsed[m];
    return top;
}
/**
 * Each land pixel's named crop and animal (F5a), in the store's order: `crop` the leading strain of its staple's crop group
 * and `beast` that of its farmers' or herders' leading beast, with the most say round it (strainVote over the ranks; −1
 * none) — from the places `P` and ways `Y` (placesOf's, waysOf's: as shown) and the strains' ranks at the age (strainsOf's
 * `S`). The last three kept.
 */
export function variantsOf(fin, P, Y, S, age) {
    const E = entry(fin), G = historyOf(fin);
    if (!G || !S) return null;
    const key = `${P.key}|${Y?.key ?? '-'}|${age}`;
    return kept3(E.variants, key, () => {
        const F = fin.raster.farming, K = fin.climate.raster, kef = KOPPEN_ID.EF, N = E.index.count, crop = new Int16Array(N).fill(-1), beast = new Int16Array(N).fill(-1);
        let k = 0;
        for (let y = 0; y < F.h; y++) {
            const lat = 90 - (y + 0.5) / F.h * 180;
            for (let x = 0, i = y * F.w; x < F.w; x++, i++) {
                if (!K.koppen[i] || K.koppen[i] === kef) continue;
                const lon = (x + 0.5) / F.w * 360 - 180, g = STAPLE_CROP_OF[P.staple[k] & 15];
                if (g >= 0) crop[k] = strainVote(S.Gm, S.R.group[g], lat, lon);
                const b = Y && Y.flags[k] & 1 ? Y.beast[k] & 15 : 0;
                if (b) beast[k] = strainVote(S.Gm, S.R.group[beastArchetype(b)], lat, lon);
                k++;
            }
        }
        return { key, crop, beast };
    });
}
const STAPLE_CROP_OF = STAPLES.map(s => (s.crop ? CROPS.indexOf(s.crop) : -1));

// ── half precision ──
const Q16 = 65535, LOG16 = 16384;
const enc = v => Math.round(Math.max(0, Math.min(1, v)) * Q16);
const encLog = people => Math.min(65535, Math.round(Math.log10(1 + Math.max(0, people)) * LOG16));
/** A 0…1 value kept on its side of a threshold `t` (read back, it is ≥ t exactly when it was). */
const encAt = (v, t) => { const q = enc(v), f = Math.ceil(t * Q16); return v >= t ? Math.max(q, f) : Math.min(q, f - 1); };
/** A kept 0…1 value. */
export const dec = q => q / Q16;
/** A kept people number as log10(1 + people a km²). */
export const decLog = q => q / LOG16;
/** People a km² from log10(1 + people). */
export const peopleFromLog = l => 10 ** l - 1;

// ── the land index ──
const popcount = x => { x -= (x >>> 1) & 0x55555555; x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); x = (x + (x >>> 4)) & 0x0f0f0f0f; return Math.imul(x, 0x01010101) >>> 24; };
function landIndex(F, K) {
    const n = F.w * F.h, words = (n + 31) >>> 5, mask = new Int32Array(words), start = new Int32Array(words), kef = KOPPEN_ID.EF;
    let count = 0;
    for (let w = 0; w < words; w++) {
        start[w] = count;
        let m = 0;
        for (let b = 0; b < 32; b++) { const i = (w << 5) + b; if (i < n && K.koppen[i] && K.koppen[i] !== kef) { m |= 1 << b; count++; } }
        mask[w] = m;
    }
    return { mask, start, count };
}
/** A land pixel's place in the store (−1: not land, or under ice). */
export function slotOf(ix, i) {
    const w = i >>> 5, b = i & 31, m = ix.mask[w];
    if (!((m >>> b) & 1)) return -1;
    return ix.start[w] + (b ? popcount(m << (32 - b)) : 0);
}

// ── the stores ──
const stores = new WeakMap();
function entry(fin) {
    const F = fin.raster.farming;
    let E = stores.get(F);
    if (!E) { E = { index: landIndex(F, fin.climate.raster), places: [], ways: [], variants: [], only: null, life: null, beast: null }; stores.set(F, E); }
    return E;
}
/** A store's key: the options' (`key`) and, as it came, the age's (cameOf's C). */
const keyOf = (key, C) => (C ? `${key}|came ${C.key}` : key);
/** One of a moment's kept stores of a kind — the last three: the land's own and the two ages, so the age chips switch
 *  without working the land out again (~2 s a store at 4,096 px; ~20 bytes a land pixel each) — or made. */
function kept3(list, key, make) {
    const k = list.findIndex(v => v.key === key);
    if (k >= 0) { const v = list[k]; list.splice(k, 1); list.unshift(v); return v; }
    const v = make();
    if (v) { list.unshift(v); if (list.length > 3) list.pop(); }
    return v;
}
/** Every land pixel of a finished moment's farming picture in order, worked out with the options `opt` — each(k, i, lat,
 *  lon) with the store's place k, after its farming (r), parts (p) and, with `living`, way of life (lv) and gatherers' (g);
 *  with `C` (cameOf's) only what had come there (into s.c: cameAt's; null without). */
function eachPlace(fin, opt, living, each, s, C = null) {
    const F = fin.raster.farming, K = fin.climate.raster, kef = KOPPEN_ID.EF, ground = living ? groundOf(fin) : null;
    let k = 0;
    s.c = C ? {} : null;
    for (let y = 0; y < F.h; y++) {
        const lat = 90 - (y + 0.5) / F.h * 180;
        for (let x = 0, i = y * F.w; x < F.w; x++, i++) {
            if (!K.koppen[i] || K.koppen[i] === kef) continue;
            const lon = (x + 0.5) / F.w * 360 - 180;
            if (C) cameAt(C, lat, lon, s.c);
            placeAt(F, i, s.p, s.e, opt, s.r, s.c);
            if (living) livingAt(F, i, lat, lon, s.p, s.r, ground, opt, s.g, s.lv);
            each(k++, i, lat, lon);
        }
    }
}
const scratch = () => ({ p: {}, e: new Float64Array(2 * CROPS.length), r: { scores: new Float64Array(STAPLES.length), foods: new Float64Array(STAPLES.length) }, g: {}, lv: {} });

/**
 * A finished moment's places with the techniques `opt` (`key`: the techniques as a key), once per moment and techniques:
 * { index, tech, rain (farmland with the techniques and by rain alone), cls (its class with the techniques | 8 where water
 * brought makes half of it or more | its class by rain alone << 4), staple (its staple food | the second's << 4),
 * score, score2 (how well each feeds it), life (its lifestyle | the second's << 4), people (log10(1 + a km²)) } — with `C`
 * (cameOf's), as it came.
 */
export function placesOf(fin, opt, key, C = null) {
    const E = entry(fin);
    return kept3(E.places, keyOf(key, C), () => makePlaces(fin, opt, keyOf(key, C), C, E));
}
function makePlaces(fin, opt, key, C, E) {
    const P = newPlaces(key, E), s = scratch();
    eachPlace(fin, opt, true, k => putPlace(P, k, s), s, C);
    return P;
}
const newPlaces = (key, E) => {
    const N = E.index.count;
    return { key, index: E.index, tech: new Uint16Array(N), rain: new Uint16Array(N), cls: new Uint8Array(N), staple: new Uint8Array(N), score: new Uint16Array(N), score2: new Uint16Array(N),
        life: new Uint8Array(N), people: new Uint16Array(N) };
};
/** A place's farming and way of life (eachPlace's scratch s) into the places store P at k. */
function putPlace(P, k, s) {
    const { r, g, lv } = s;
    P.tech[k] = enc(r.tech); P.rain[k] = enc(r.rain);
    const share = r.tech > 0.02 ? Math.max(0, Math.min(1, (r.tech - r.rain) / r.tech)) : 0;
    P.cls[k] = farmClass(r.tech) | (share >= 0.5 ? 8 : 0) | (farmClass(r.rain) << 4);
    P.staple[k] = lv.staple | (lv.second << 4); P.score[k] = enc(lv.score); P.score2[k] = lv.second ? enc(foodScore(lv.second, r, g)) : 0;
    P.life[k] = lv.lifestyle | (lv.secondLife << 4); P.people[k] = encLog(lv.people);
}
/**
 * A finished moment's food systems and beasts with the techniques `opt`, once per moment and techniques — null where the
 * moment lacks what they read: { way (its food system | the second's << 4), beast (its leading beast | the second's << 4),
 * flags (1: its farmers or herders keep beasts; 2: the fly belt ≥ 0.5), fly, keep1, keep2 (how well its first and second
 * beasts are kept) }; `flyAt` whether the fly lives at (lat, lon) (flyAtOf's); with `C` (cameOf's), as it came. With
 * `placesKey` (placesOf's key) the places store is filled in the same pass where it is not kept — one pass, not two.
 */
export function waysOf(fin, opt, key, flyAt = () => 1, C = null, placesKey = null) {
    const E = entry(fin), R = fin.raster, K = fin.climate.raster;
    if (!hasMeasures(R, K)) return null;
    return kept3(E.ways, keyOf(key, C), () => makeWays(fin, opt, keyOf(key, C), flyAt, C, E, placesKey === null ? null : keyOf(placesKey, C)));
}
function makeWays(fin, opt, key, flyAt, C, E, pkey) {
    const R = fin.raster, K = fin.climate.raster;
    const N = E.index.count, Y = { key, way: new Uint8Array(N), beast: new Uint8Array(N), flags: new Uint8Array(N), fly: new Uint16Array(N), keep1: new Uint16Array(N), keep2: new Uint16Array(N) };
    const s = scratch(), { p, r, g, lv } = s, L = {}, bp = newBeasts(), sy = {};
    const P = pkey !== null && !E.places.some(v => v.key === pkey) ? newPlaces(pkey, E) : null;
    eachPlace(fin, opt, true, (k, i, lat, lon) => {
        if (P) putPlace(P, k, s);
        systemAt(R, K, i, p, r, lv, g, lat, L, bp, sy, flyAt(lat, lon), s.c);
        Y.way[k] = sy.system | (sy.second << 4); Y.beast[k] = bp.beast | (bp.second << 4);
        Y.flags[k] = (keepsBeasts(lv) ? 1 : 0) | (bp.fly >= 0.5 ? 2 : 0);
        Y.fly[k] = enc(bp.fly); Y.keep1[k] = enc(bp.score); Y.keep2[k] = bp.second ? enc(bp.keep[bp.second]) : 0;
    }, s, C);
    if (P) kept3(E.places, pkey, () => P);
    return Y;
}
/** One staple food's score at each place (0…1, kept), for its chip alone — the last asked for kept; with `C` (cameOf's),
 *  where it had come. */
export function onlyOf(fin, opt, key, st, C = null) {
    const E = entry(fin);
    key = keyOf(key, C);
    if (E.only?.key === key && E.only.st === st) return E.only.v;
    const v = new Uint16Array(E.index.count), s = scratch();
    eachPlace(fin, opt, true, k => { v[k] = enc(foodScore(st, s.r, s.g)); }, s, C);
    E.only = { key, st, v };
    return v;
}
/** One way of life's people at each place (log10(1 + a km²), kept), for its chip alone — the last asked for kept; with `C`
 *  (cameOf's), with what had come. */
export function lifeAloneOf(fin, opt, key, life, C = null) {
    const E = entry(fin);
    key = keyOf(key, C);
    if (E.life?.key === key && E.life.life === life) return E.life.v;
    const v = new Uint16Array(E.index.count), s = scratch();
    eachPlace(fin, opt, true, k => { v[k] = encLog(lifestylePeople(life, s.r, s.p, opt, s.g)); }, s, C);
    E.life = { key, life, v };
    return v;
}
/** How well one beast can be kept at each place (0…1, kept), for its chip alone — the last asked for kept; null where the
 *  moment lacks what the beasts read; with `C` (cameOf's), only where it had come. */
export function beastAloneOf(fin, opt, key, b, flyAt = () => 1, C = null) {
    const E = entry(fin);
    key = keyOf(key, C);
    if (E.beast?.key === key && E.beast.b === b) return E.beast.v;
    const R = fin.raster, K = fin.climate.raster;
    if (!hasMeasures(R, K)) return null;
    const v = new Uint16Array(E.index.count), s = scratch(), L = {};
    eachPlace(fin, opt, true, (k, i, lat, lon) => {
        measuresAt(R, K, i, s.p, lat, L);
        L.paddy = s.lv.lifestyle === Lifestyle.FARMING ? paddyOf(s.r) : 0;
        v[k] = C && !((s.c.mask >> beastArchetype(b)) & 1) ? 0 : encAt(beastKeepOne(L, flyBelt(L) * flyAt(lat, lon), b), BEAST.keepFloor);
    }, s, C);
    E.beast = { key, b, v };
    return v;
}
