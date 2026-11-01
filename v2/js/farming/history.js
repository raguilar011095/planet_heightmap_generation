// The domestication history's ground (plans/V2_FOOD_PLAN.md §4, F3a): a grid fixed in degrees (0.5°: the same at every
// detail) over a finished moment, each cell holding what its land is like — read off the finished picture once per moment:
//   · the WILD LARDER — each crop archetype's wild ancestor (larder.js cropWild) and each beast's (beasts.js beastWild),
//     from the cell's measures and the page climate's January and July rain (the winter half's share);
//   · LANDMASSES — land joined across seas shallower than ~120 m (the ice ages' land bridges: Beringia, Sunda), and each
//     one's LUCK, drawn per landmass, one seeded stream per mechanism (developer's "scarcity is allowed, with a toggle"):
//     which beasts' wild ancestors live on it (domesticability is luck — Hendrix & Vos 2019 — at ~70 % odds each where it
//     has habitat enough, ~96 % with Fewer gaps; less with a little habitat; ox-sized beasts only on big land: Burness et al. 2001) and whether the
//     tsetse-like fly does (on Earth only Africa's: ~35 % of landmasses with its habitat, ~15 % with Fewer gaps);
//   · HEARTH ODDS — a region's odds of starting farming (§4.2): its larder's variety within ~330 km (Vavilov), its
//     seasonality (Matranga 2024: the planet's most seasonal land — less needed where the larder is roots and trees, the
//     wet tropics' margins), how productive it is (Kavanagh: surplus, not need), hilly flanks not too cold, water near,
//     foragers within ~150 km not too rich, not poleward of ~45° — graded to the top, so the likeliest stand out (tuned on
//     Earth: tuning/farming/earth-history.mjs);
//   · what the SPREAD reads (farming/hearths.js): each crop group's fit (how well it grows, every technique on — along a
//     river through dry land, its watered strip's: fitRun) and each
//     beast's keeping (the fly's toll applied by the luck at run time), rivers and coasts, the foragers' richness, each sea
//     cell's distance from land (hops across the sea).
// Read off the picture on a fixed sampling (~1,024 pixels round the world, at every detail) and its relief over the
// neighbouring cells' heights (~165 km: a finer mesh is more rugged within a cell, not across a region), so 160K and 640K
// give the same ground. A landmass's luck is keyed by the 15° tile its centre lies in — neighbouring islands share their
// beasts, as islands near each other do — so a coast drawn a little differently draws the same; a re-roll re-draws it all.

import { BEASTS, Beast, beastWild, landMeasures } from './beasts.js';
import { measuresAt, partsOf, gatherAt } from './living.js';
import { flyBelt } from './beasts.js';
import { cropWild, npp, tempSeasons } from './larder.js';
import { CROPS, STAPLE_WORDS, CROP_STAPLE, STAPLES, farmPlace, harvestsAt, hasHarvests } from './farming.js';
import { FARMING } from './farming-config.js';
import { beastKeep } from './beasts.js';
import { paddyOf } from './living.js';
import { KOPPEN_ID } from '../climate/koppen.js';
import { LatLonGrid } from '../finish/finish-grid.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const S = (r, x) => smooth(r[0], r[1], x);

export const HISTORY = {
    gridDeg: 0.5,
    sampleW: 1024,              // the picture read about this many pixels round the world (at every detail)
    luckTileDeg: 15,            // a landmass's luck keyed by the tile of this many degrees its centre lies in
    shelfM: 120,                // landmasses joined across sea shallower than this (m)
    // ── luck ──
    habitatKm2: [5000, 50000],  // a wild ancestor's odds on a landmass rising with how much habitat it has there (km²)…
    habitatNiche: 0.45,         // …its niche this good or better
    beastOdds: [0.7, 0.96],     // each beast's wild ancestor there (scarce · with Fewer gaps)
    bigArea: [1.5e5, 1.2e6],    // ox-sized beasts (cattle, horse, camel, yak, buffalo) need a landmass this big (km²)
    flyOdds: [0.35, 0.15],      // the fly on a landmass with its habitat (scarce · with Fewer gaps)
    // ── hearth odds ──
    reachKm: 330,               // the larder read this far round a place (its region)
    varietyNiche: [0.12, 0.4],  // an archetype counts in a region's variety as its niche within reach (a soft maximum) runs from this to this
    variety: [0.5, 6],          // the odds rise with the variety from this to this (crops 1 each, beasts ½)…
    seasons: [0.5, 1],          // …with its seasonality's rank among the land (the more seasonal of temperature and rain)…
    prod: [250, 900],           // …with its productivity (g a m² a year)…
    relief: [0.1, 0.6],         // …with hilly flanks: the range of the mean heights of it and its neighbours (km, ~165 km across)…
    highlandT: [4, 9],          // …not too cold (mean °C — the tropics' highlands farmed to ~4 km: the Andes', Ethiopia's)…
    vegNiche: [0.3, 0.7],       // (where the larder is roots and trees — the tubers', the bananas' — within reach this good…
    vegSeasons: [0.2, 0.6],     // …the seasonality's rank need be only this: the wet tropics' margins, the yam belt's, the
                                // Llanos de Mojos', tamed their roots and trees without the seed crops' long dry season)
    rich: [0.8, 2],             // …less where foragers' own food is rich (people a km²: a coast's settled fishers — the
    richKm: 150,                // Northwest Coast's, California's, the Jomon's — hold the land within about this of them)…
    poleward: [52, 44],         // …and none poleward of this (°)
    // ── what the spread reads ──
    fit: [0.05, 0.4],           // a crop group's fit as its food (÷ its weight: its harvests' worth) runs from this to this
    stripFit: 0.6,              // where no crop group fits a cell this well on the whole, its rivers' watered strips are read pixel by pixel
    stripW: 2048,               // …about this many pixels round the world (a phone's whole picture, every other of a desktop's: the same rivers found on both)
    seaKmMax: 1000,             // the sea's distance from land worked out this far (km)
};

/** The archetypes of the history, in order: the crop groups (CROPS') then the beasts (BEASTS' codes 1…). */
export const ARCHETYPES = [...CROPS.map((k, g) => ({ key: k, word: STAPLE_WORDS[CROP_STAPLE[g]], crop: g })), ...BEASTS.slice(1).map((b, k) => ({ key: b.key, word: b.word, like: b.like, beast: k + 1 }))];
const NA = ARCHETYPES.length, NC = CROPS.length;
/** An archetype's index in ARCHETYPES for a beast. */
export const beastArchetype = b => NC + b - 1;
const BIG = new Set([Beast.GRAZER, Beast.HORSE, Beast.CAMEL, Beast.HIGHLAND, Beast.BUFFALO]);

// ── seeded draws: one stream per mechanism ──
/** A seeded 32-bit hash of integers (one stream per mechanism: its first numbers). */
export function mix(...xs) {
    let h = 0x9e3779b9;
    for (const x of xs) { h = Math.imul(h ^ (x | 0), 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; }
    return h >>> 0;
}
const u01 = (...xs) => mix(...xs) / 4294967296;
const STREAM = { fly: 0xf1e, beast: 0xbea0 };

/** A binary heap of (key, value) — keys Float64, values Int32: the least key first (the spread's and the sea's searches). */
export class Heap {
    constructor(cap = 1 << 16) { this.k = new Float64Array(cap); this.v = new Int32Array(cap); this.n = 0; this.top = 0; }
    push(key, val) {
        if (this.n === this.k.length) { const k = new Float64Array(2 * this.n), v = new Int32Array(2 * this.n); k.set(this.k); v.set(this.v); this.k = k; this.v = v; }
        let i = this.n++;
        while (i > 0) { const p = (i - 1) >> 1; if (this.k[p] <= key) break; this.k[i] = this.k[p]; this.v[i] = this.v[p]; i = p; }
        this.k[i] = key; this.v[i] = val;
    }
    /** The least: its value (its key in this.top). */
    pop() {
        const K = this.k, V = this.v, val = V[0];
        this.top = K[0];
        const lk = K[--this.n], lv = V[this.n];
        let i = 0;
        for (;;) { let c = 2 * i + 1; if (c >= this.n) break; if (c + 1 < this.n && K[c + 1] < K[c]) c++; if (K[c] >= lk) break; K[i] = K[c]; V[i] = V[c]; i = c; }
        K[i] = lk; V[i] = lv;
        return val;
    }
}
/** The grid's cell at (lat, lon). */
export const cellAt = (G, lat, lon) => {
    const j = Math.min(G.h - 1, Math.max(0, Math.floor((90 - lat) / G.deg))), i = ((Math.floor((lon + 180) / G.deg) % G.w) + G.w) % G.w;
    return j * G.w + i;
};
/** The history's grid read smoothly (developer, 2026-10-31: "When farming came and From which hearth are still blocky" —
 *  bilinear between 0.5° cells steps and kinks at their edges): each of the 4 × 4 cells round a point has a Gaussian say,
 *  GRID_SIGMA cells wide — a lone cell's own patch voted away, every edge a rounded curve. */
export const GRID_SIGMA = 0.7;
const GAUSS_STEPS = 256, GAUSS = (() => {
    const w = new Float64Array(4 * (GAUSS_STEPS + 1)), dw = new Float64Array(4 * (GAUSS_STEPS + 1)), s2i = 1 / (2 * GRID_SIGMA * GRID_SIGMA);
    for (let q = 0; q <= GAUSS_STEPS; q++) for (let d = 0; d < 4; d++) {
        const e = d - 1 - q / GAUSS_STEPS, v = Math.exp(-e * e * s2i);
        w[4 * q + d] = v; dw[4 * q + d] = 2 * s2i * e * v;      // (its rate as the point moves a cell on: toward the cell, more)
    }
    return { w, dw };
})();
/** A point's place among the grid's cells for gridSay: its first cell (i0, j0 — one before the cell it is past) and the
 *  table rows of its Gaussian weights along x and y (into P). */
export function gridPlace(G, lat, lon, P) {
    const gy = Math.min(G.h - 1, Math.max(0, (90 - lat) / G.deg - 0.5)), gx = (lon + 180) / G.deg - 0.5, i = Math.floor(gx), j = Math.floor(gy);
    P.i0 = i - 1; P.j0 = j - 1;
    P.qx = 4 * Math.round((gx - i) * GAUSS_STEPS); P.qy = 4 * Math.round((gy - j) * GAUSS_STEPS);
    return P;
}
/** The weights (GRID_SIGMA's Gaussian) and their rates along x and y for gridPlace's rows. */
export const GRID_W = GAUSS.w, GRID_DW = GAUSS.dw;
/** A grid field read at (lat, lon), bilinear between cell centres (a wrap in longitude). */
export function fieldAt(G, f, lat, lon) {
    const gy = Math.min(G.h - 1.0001, Math.max(0, (90 - lat) / G.deg - 0.5)), gx = (lon + 180) / G.deg - 0.5;
    const j = Math.floor(gy), i = Math.floor(gx), ty = gy - j, tx = gx - i, a = ((i % G.w) + G.w) % G.w, b = (a + 1) % G.w, j1 = Math.min(G.h - 1, j + 1);
    return (f[j * G.w + a] * (1 - tx) + f[j * G.w + b] * tx) * (1 - ty) + (f[j1 * G.w + a] * (1 - tx) + f[j1 * G.w + b] * tx) * ty;
}
/** A page-climate field (1°, 360 × 180, rows from the north, columns from −180°) at (lat, lon), bilinear. */
function climateAt(f, lat, lon) {
    const gx = lon + 180 - 0.5, gy = Math.min(178.999, Math.max(0, 90 - lat - 0.5)), i = Math.floor(gx), j = Math.floor(gy), tx = gx - i, ty = gy - j;
    const a = (i + 360) % 360, b = (a + 1) % 360, r0 = j * 360, r1 = r0 + 360;
    return (f[r0 + a] * (1 - tx) + f[r0 + b] * tx) * (1 - ty) + (f[r1 + a] * (1 - tx) + f[r1 + b] * tx) * ty;
}
/**
 * A finished moment's history ground, once per moment: from its picture `R` (heightM: its heights), its climate's picture
 * `K` (koppen, tAnnual, pAnnual, stats, cover), its farming picture `F`, its page climate `C` (P: {year, jan, jul} on the 1°
 * grid) and its sea for gatherers (`ground`: living.js gatherGround's, or null).
 */
export function historyGround(R, K, F, C, ground, H = HISTORY) {
    const deg = H.gridDeg, w = Math.round(360 / deg), h = w >> 1, N = w * h, kef = KOPPEN_ID.EF;
    const f64 = () => new Float64Array(N);
    const n = f64(), nAll = f64(), nSea = f64(), nShallow = f64(), area = f64(), T = f64(), Tw = f64(), Tc = f64(), P = f64(), arid = f64(), seas = f64(), elev = f64(), tree = f64(), hill = f64(),
        wetland = f64(), flood = f64(), canal = f64(), dry = f64(), fly = f64(), rich = f64(), hSum = f64();
    const p = {}, L = {}, g = {}, RE = 6371, sh = -H.shelfM, st = Math.max(1, Math.round(K.w / H.sampleW));
    // (the spread's: each crop group's fit and each beast's keeping, summed per cell)
    const fitSum = CROPS.map(() => f64()), keepSum = BEASTS.map(() => f64()), harvests = hasHarvests(F), e = new Float64Array(2 * CROPS.length), kNow = new Float64Array(BEASTS.length);
    const r = { scores: new Float64Array(STAPLES.length), foods: new Float64Array(STAPLES.length) }, ALL = { flood: true, canal: true, terrace: true, raised: true }, weight = CROPS.map(k => FARMING.crops[k].weight);
    for (let y = (st >> 1); y < K.h; y += st) {
        const lat = 90 - (y + 0.5) / K.h * 180, j = Math.min(h - 1, Math.floor((90 - lat) / deg)), pxKm2 = (2 * Math.PI * RE / K.w) * (Math.PI * RE / K.h) * Math.cos(lat * Math.PI / 180);
        const hy = Math.min(R.h - 1, Math.floor((y + 0.5) * R.h / K.h));
        for (let x = (st >> 1); x < K.w; x += st) {
            const i = y * K.w + x, c = j * w + Math.min(w - 1, Math.floor((x + 0.5) / K.w * 360 / deg)), kp = K.koppen[i];
            const hm = R.heightM[hy * R.w + Math.min(R.w - 1, Math.floor((x + 0.5) * R.w / K.w))];
            if (!kp) { nSea[c]++; if (hm > sh) nShallow[c]++; continue; }
            nAll[c]++; area[c] += pxKm2 * st * st; hSum[c] += Math.max(0, hm);
            if (kp === kef) continue;
            partsOf(F, i, p); measuresAt(R, K, i, p, lat, L);
            n[c]++; T[c] += L.T; Tw[c] += L.Tw; Tc[c] += L.Tc; P[c] += L.P; arid[c] += L.arid; seas[c] += L.seas; elev[c] += L.elev; tree[c] += L.tree; hill[c] += L.hill;
            wetland[c] += p.wetland; if (p.flood > flood[c]) flood[c] = p.flood; if (p.canal > canal[c]) canal[c] = p.canal;
            dry[c] += Math.max(0, p.warm - p.rain); fly[c] += flyBelt(L);
            rich[c] += gatherAt(ground, lat, (x + 0.5) / K.w * 360 - 180, p, F.pasture[i] / 255, g).people;
            if (harvests) {
                farmPlace(p, harvestsAt(F.crops, i, e), F.pasture[i] / 255, ALL, r);
                for (let q = 0; q < CROPS.length; q++) fitSum[q][c] += S(H.fit, r.foods[CROP_STAPLE[q]] / weight[q]);
                L.paddy = paddyOf(r);
            } else L.paddy = 0;
            beastKeep(L, 0, kNow);
            for (let b = 1; b < BEASTS.length; b++) keepSum[b][c] += kNow[b];
        }
    }
    // ── each cell's measures, its wild larder ──
    const niche = Array.from({ length: NA }, () => new Float32Array(N)), land = new Uint8Array(N), flyCould = new Float32Array(N), richF = new Float32Array(N);
    const tSeas = new Float32Array(N), pSeas = new Float32Array(N), prodF = new Float32Array(N), hillF = new Float32Array(N), water = new Float32Array(N), latF = new Float32Array(N);
    // (the relief: the range of the land's mean heights over each cell and its neighbours, km)
    const relief = new Float32Array(N);
    for (let c = 0; c < N; c++) {
        if (!nAll[c]) continue;
        const j = (c / w) | 0, i = c - j * w;
        let lo = Infinity, hi = -Infinity;
        for (let dj = -1; dj <= 1; dj++) { const jj = j + dj; if (jj < 0 || jj >= h) continue; for (let di = -1; di <= 1; di++) { const q = jj * w + (i + di + w) % w; if (!nAll[q]) continue; const m = hSum[q] / nAll[q]; if (m < lo) lo = m; if (m > hi) hi = m; } }
        relief[c] = (hi - lo) / 1000;
    }
    const M = {}, cw = new Float64Array(NC), bw = new Float64Array(BEASTS.length), Pc = C?.P;
    // (each cell's climate kept, for the crops beyond the staples — farming/minor.js: mean °C, the warm and cold month's, rain
    // mm, wetness (the aridity index), height km, the winter's share of the rain, its seasonality, the water rivers bring)
    const f32 = () => new Float32Array(N), clim = { T: f32(), Tw: f32(), Tc: f32(), P: f32(), W: f32(), E: f32(), ws: f32(), sea: f32(), water: f32() };
    for (let c = 0; c < N; c++) {
        if (!nAll[c]) continue;
        land[c] = 1;
        if (!n[c]) continue;
        const k = n[c], lat = 90 - (Math.floor(c / w) + 0.5) * deg, lon = -180 + (c % w + 0.5) * deg;
        M.T = T[c] / k; M.Tw = Tw[c] / k; M.Tc = Tc[c] / k; M.P = P[c] / k; M.arid = arid[c] / k; M.seas = seas[c] / k; M.elev = elev[c] / k; M.tree = tree[c] / k; M.hill = hill[c] / k;
        M.wetland = wetland[c] / k; M.flood = flood[c]; M.canal = canal[c]; M.dry = dry[c] / k; M.lat = lat; M.paddy = 0; M.relief = relief[c];
        // (the winter half's share of the rain, and the wettest month's: the page climate's January and July)
        const pj = Pc ? climateAt(Pc.jan, lat, lon) : 1, pl = Pc ? climateAt(Pc.jul, lat, lon) : 1, py = Pc ? climateAt(Pc.year, lat, lon) : 1;
        M.ws = pj + pl > 0 ? (lat >= 0 ? pj : pl) / (pj + pl) : 0.5;
        M.maxP = M.P / 12 * (py > 0 ? Math.max(pj, pl) / py : 1);
        landMeasures(M);
        clim.T[c] = M.T; clim.Tw[c] = M.Tw; clim.Tc[c] = M.Tc; clim.P[c] = M.P; clim.W[c] = M.arid; clim.E[c] = M.elev; clim.ws[c] = M.ws; clim.sea[c] = M.seas; clim.water[c] = Math.max(M.flood, M.canal);
        const fc = flyCould[c] = fly[c] / k;
        cropWild(M, cw);
        beastWild(M, fc, bw);
        for (let a = 0; a < NC; a++) niche[a][c] = cw[a];
        for (let b = 1; b < BEASTS.length; b++) niche[beastArchetype(b)][c] = bw[b];
        // (the hearth odds' parts)
        tSeas[c] = tempSeasons(M.Tw, M.Tc); pSeas[c] = M.seas;
        prodF[c] = S(H.prod, npp(M.T, M.P));
        hillF[c] = 0.5 + 0.5 * S(H.relief, M.relief) * S(H.highlandT, M.T);
        water[c] = 0.55 + 0.45 * Math.max(M.flood, M.canal, nSea[c] ? 0.6 : 0);
        latF[c] = S(H.poleward, Math.abs(lat));
    }
    // ── what the spread reads: fit, keeping, rivers, coasts, the foragers, the sea's distance from land ──
    const fit = CROPS.map(() => new Float32Array(N)), keep = BEASTS.map(() => new Float32Array(N)), river = new Uint8Array(N), coast = new Uint8Array(N), richness = new Float32Array(N);
    for (let c = 0; c < N; c++) {
        if (!n[c]) continue;
        for (let q = 0; q < CROPS.length; q++) fit[q][c] = fitSum[q][c] / n[c];
        for (let b = 1; b < BEASTS.length; b++) keep[b][c] = keepSum[b][c] / n[c];
        river[c] = Math.max(flood[c], canal[c]) >= 0.3 ? 1 : 0; richness[c] = rich[c] / n[c];
    }
    // ── the rivers' strips through dry land (developer, 2026-11-01: rivers "not spreading crops down them fast enough …
    // especially along rivers in deserts"): the sampling reads a pixel every ~40 km and a cell's fit is its mean — a valley a
    // few km wide through a desert is missed or drowned in it. So where no crop fits a cell well on the whole, every watered
    // pixel of the picture (flood or canal water ≥ 0.3) is read: the crops' fit along its strip gives the spread its way
    // through (fitRun: the better of the cell's and the strip's), and the cell is a river's. And every cell a big river's plain
    // crosses (flood water ≥ 0.3 on any of its pixels), or such a strip, is a river's way (riverWay: the spread runs fastest
    // along it — the canals' reach of every stream, ~70 % of the land, is not). The pixels read as finely on any picture
    // (stripW round the world): a sharper picture finds no rivers a coarser one misses ──
    const fitRun = fit.map(f => Float32Array.from(f)), riverWay = new Uint8Array(N);
    for (let c = 0; c < N; c++) if (n[c] && flood[c] >= 0.3) riverWay[c] = 1;
    if (harvests) {
        const low = new Uint8Array(N), fw = CROPS.map(() => new Float64Array(N)), nw = new Float64Array(N), wmax = new Float32Array(N), W8 = Math.round(0.3 * 255);
        for (let c = 0; c < N; c++) if (n[c]) { let m = 0; for (let q = 0; q < NC; q++) if (fit[q][c] > m) m = fit[q][c]; low[c] = m < H.stripFit ? 1 : 0; }
        const ss = Math.max(1, Math.round(K.w / H.stripW));
        for (let y = ss >> 1; y < K.h; y += ss) {
            const lat = 90 - (y + 0.5) / K.h * 180, j = Math.min(h - 1, Math.floor((90 - lat) / deg)), row = y * K.w;
            for (let x = ss >> 1; x < K.w; x += ss) {
                const i = row + x;
                if (F.flood[i] < W8 && F.canal[i] < W8) continue;
                const kp = K.koppen[i], c = j * w + Math.min(w - 1, Math.floor((x + 0.5) / K.w * 360 / deg));
                if (!kp || kp === kef) continue;
                if (F.flood[i] >= W8) riverWay[c] = 1;
                if (!low[c]) continue;
                partsOf(F, i, p);
                farmPlace(p, harvestsAt(F.crops, i, e), F.pasture[i] / 255, ALL, r);
                for (let q = 0; q < NC; q++) fw[q][c] += S(H.fit, r.foods[CROP_STAPLE[q]] / weight[q]);
                nw[c]++;
                const wv = Math.max(p.flood, p.canal);
                if (wv > wmax[c]) wmax[c] = wv;
            }
        }
        for (let c = 0; c < N; c++) {
            if (!nw[c]) continue;
            for (let q = 0; q < NC; q++) fitRun[q][c] = Math.max(fit[q][c], fw[q][c] / nw[c]);
            river[c] = 1; riverWay[c] = 1;
            if (wmax[c] > clim.water[c]) clim.water[c] = wmax[c];
        }
    }
    const seaKm = new Float32Array(N).fill(Infinity), queue = [];
    for (let c = 0; c < N; c++) if (land[c]) seaKm[c] = 0;
    for (let c = 0; c < N; c++) {
        if (!land[c]) continue;
        const j = (c / w) | 0, i = c - j * w;
        for (let dj = -1; dj <= 1 && !coast[c]; dj++) { const jj = j + dj; if (jj < 0 || jj >= h) continue; for (let di = -1; di <= 1; di++) if (!land[jj * w + (i + di + w) % w]) { coast[c] = 1; break; } }
        if (coast[c]) queue.push(c);
    }
    // (the sea's distance from land, km: the shortest path out from the coasts — to seaKmMax)
    const heap = new Heap();
    for (const c of queue) heap.push(0, c);
    while (heap.n) {
        const c = heap.pop();
        if (heap.top > seaKm[c]) continue;
        const j = (c / w) | 0, i = c - j * w;
        for (let dj = -1; dj <= 1; dj++) {
            const jj = j + dj;
            if (jj < 0 || jj >= h) continue;
            const kmX = 111.32 * deg * Math.max(0.02, Math.cos((90 - (jj + 0.5) * deg) * Math.PI / 180)), kmY = 111.32 * deg;
            for (let di = -1; di <= 1; di++) {
                const q = jj * w + (i + di + w) % w;
                if (land[q]) continue;
                const d = seaKm[c] + Math.hypot(di * kmX, dj * kmY);
                if (d < seaKm[q] && d <= H.seaKmMax) { seaKm[q] = d; heap.push(d, q); }
            }
        }
    }
    // (the coastal sea's climate — its shore's: each sea cell within ~2 cells of land the mean of its neighbours' — so a crop
    // carried along the coast by boat meets the climate of the coast it follows: hearths.js's likeness)
    for (let pass = 0; pass < 3; pass++) {
        const add = [];
        for (let c = 0; c < N; c++) {
            if (land[c] || clim.W[c] > 0) continue;
            const j = (c / w) | 0, i = c - j * w;
            let t = 0, wv = 0, k = 0;
            for (let dj = -1; dj <= 1; dj++) { const jj = j + dj; if (jj < 0 || jj >= h) continue; for (let di = -1; di <= 1; di++) { const q = jj * w + (i + di + w) % w; if (clim.W[q] > 0) { t += clim.T[q]; wv += clim.W[q]; k++; } } }
            if (k) add.push(c, t / k, wv / k);
        }
        for (let a = 0; a < add.length; a += 3) { clim.T[add[a]] = add[a + 1]; clim.W[add[a]] = add[a + 2]; }
    }
    // ── landmasses: land joined across shallow sea ──
    const mass = new Int32Array(N).fill(-1), masses = [], stack = [];
    const bridge = c => !nAll[c] && nSea[c] > 0 && nShallow[c] >= 0.5 * nSea[c];
    for (let c0 = 0; c0 < N; c0++) {
        if (!land[c0] || mass[c0] >= 0) continue;
        const id = masses.length, m = { id, area: 0, x: 0, y: 0, z: 0, fly: 0, habitat: new Float64Array(BEASTS.length) };
        mass[c0] = id; stack.push(c0);
        while (stack.length) {
            const c = stack.pop(), j = (c / w) | 0, i = c - j * w;
            if (land[c]) {
                const a = area[c], la = (90 - (j + 0.5) * deg) * Math.PI / 180, lo = (-180 + (i + 0.5) * deg) * Math.PI / 180;
                m.area += a; m.x += a * Math.cos(la) * Math.cos(lo); m.y += a * Math.cos(la) * Math.sin(lo); m.z += a * Math.sin(la);
                if (flyCould[c] >= 0.5) m.fly += a;
                for (let b = 1; b < BEASTS.length; b++) if (niche[beastArchetype(b)][c] >= H.habitatNiche) m.habitat[b] += a;
            }
            for (let dj = -1; dj <= 1; dj++) {
                const jj = j + dj;
                if (jj < 0 || jj >= h) continue;
                for (let di = -1; di <= 1; di++) {
                    const q = jj * w + (i + di + w) % w;
                    if (mass[q] >= 0 || !(land[q] || bridge(q))) continue;
                    mass[q] = id; stack.push(q);
                }
            }
        }
        const r = Math.hypot(m.x, m.y, m.z) || 1;
        m.lat = Math.asin(m.z / r) * 180 / Math.PI; m.lon = Math.atan2(m.y, m.x) * 180 / Math.PI;
        masses.push(m);
    }
    // ── hearth odds: variety within reach, seasonality's rank, productivity, hills, water, foragers, latitude ──
    // (each archetype within reach: a soft maximum — the power mean (p = 4) of its niche over the land within ~reach/2, a
    // Gaussian on a grid in km — so a strong wild range near counts, fading smoothly, not in a window's rectangles)
    const grid = new LatLonGrid(deg), variety = new Float32Array(N), used = ARCHETYPES.map((A, a) => a).filter(a => ARCHETYPES[a].beast !== Beast.DEER);
    const p4 = used.map(a => { const f = new Float32Array(N); for (let c = 0; c < N; c++) f[c] = n[c] ? niche[a][c] ** 4 : NaN; return f; });
    // (and the foragers' richness within ~richKm — the same soft maximum)
    const r4 = new Float32Array(N);
    for (let c = 0; c < N; c++) r4[c] = n[c] ? (rich[c] / n[c]) ** 4 : NaN;
    const [richSoft] = grid.blurMany([r4], H.richKm / 2);
    for (let c = 0; c < N; c++) if (n[c]) { const v = richSoft[c]; richF[c] = 1 - 0.6 * S(H.rich, v > 0 ? v ** 0.25 : 0); }
    const soft = grid.blurMany(p4, H.reachKm / 2);
    used.forEach((a, k) => {
        const wt = ARCHETYPES[a].crop !== undefined ? 1 : 0.5, f = soft[k];
        for (let c = 0; c < N; c++) if (land[c]) { const v = f[c]; if (v > 0) variety[c] += wt * S(H.varietyNiche, v ** 0.25); }
    });
    const rank = arr => {
        const idx = []; for (let c = 0; c < N; c++) if (n[c]) idx.push(c);
        idx.sort((x, y) => arr[x] - arr[y]);
        const out = new Float32Array(N); idx.forEach((c, k) => { out[c] = k / Math.max(1, idx.length - 1); });
        return out;
    };
    const rT = rank(tSeas), rP = rank(pSeas), odds = new Float32Array(N), seasF = new Float32Array(N), seasR = new Float32Array(N);
    // (the roots' and trees' larder within reach: their soft maxima)
    const vegK = used.map((a, k) => (ARCHETYPES[a].key === 'roots' || ARCHETYPES[a].key === 'trees' ? k : -1)).filter(k => k >= 0), veg = new Float32Array(N);
    for (let c = 0; c < N; c++) { let v = 0; for (const k of vegK) { const x = soft[k][c]; if (x > 0) v = Math.max(v, x ** 0.25); } veg[c] = S(H.vegNiche, v); }
    let top = 0;
    for (let c = 0; c < N; c++) {
        if (!n[c]) continue;
        seasR[c] = Math.max(rT[c], rP[c]); seasF[c] = Math.max(S(H.seasons, seasR[c]), veg[c] * S(H.vegSeasons, seasR[c]));
        odds[c] = (0.3 + 0.7 * S(H.variety, variety[c])) * seasF[c] * prodF[c] * hillF[c] * water[c] * richF[c] * latF[c];
        if (odds[c] > top) top = odds[c];
    }
    const sorted = [];
    for (let c = 0; c < N; c++) if (n[c]) { odds[c] /= Math.max(1e-9, top); sorted.push(odds[c]); }
    sorted.sort((x, y) => x - y);
    // (the cells round the land given its neighbours' values — a coast read between cells does not fade toward the sea)
    for (const f of [variety, odds, ...niche]) spread(f, n, w, h);
    // (and the odds' parts, for the tools' look: tuning/farming/earth-history.mjs)
    const parts = { seasons: seasF, seasRank: seasR, tRank: rT, pRank: rP, prod: prodF, hill: hillF, water, rich: richF, lat: latF };
    return { deg, w, h, land, area: Float32Array.from(area), niche, variety, odds, oddsSorted: Float32Array.from(sorted), flyCould, mass, masses, fit, fitRun, keep, river, riverWay, coast, richness, seaKm, clim, parts };
}

/** Each cell without land of its own (weight n 0) next to one with: the mean of its neighbours' (in place). */
function spread(f, n, w, h) {
    const add = [];
    for (let c = 0; c < w * h; c++) {
        if (n[c]) continue;
        const j = (c / w) | 0, i = c - j * w;
        let s = 0, k = 0;
        for (let dj = -1; dj <= 1; dj++) { const jj = j + dj; if (jj < 0 || jj >= h) continue; for (let di = -1; di <= 1; di++) { const q = jj * w + (i + di + w) % w; if (n[q]) { s += f[q]; k++; } } }
        if (k) add.push(c, s / k);
    }
    for (let a = 0; a < add.length; a += 2) f[add[a]] = add[a + 1];
}
/** The landmass at (lat, lon): its cell's, or a neighbouring cell's on a coast the grid sampled no land in (−1: none). */
export function massAt(G, lat, lon) {
    const c = cellAt(G, lat, lon);
    if (G.mass[c] >= 0 && G.land[c]) return G.mass[c];
    const j = (c / G.w) | 0, i = c - j * G.w;
    for (let dj = -1; dj <= 1; dj++) { const jj = j + dj; if (jj < 0 || jj >= G.h) continue; for (let di = -1; di <= 1; di++) { const q = jj * G.w + (i + di + G.w) % G.w; if (G.land[q] && G.mass[q] >= 0) return G.mass[q]; } }
    return G.mass[c];
}
/** The share of the land whose hearth odds are lower than `v` (0…1). */
export function oddsRank(G, v) {
    const s = G.oddsSorted;
    let lo = 0, hi = s.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (s[m] < v) lo = m + 1; else hi = m; }
    return lo / Math.max(1, s.length);
}

/**
 * Each landmass's luck: { fly (1 where the fly lives on it), has (its beasts: has[m × 9 + b] = 1) } — from the world's
 * `seed`, the moment's `time` (Myr), a re-roll `roll` and `fewer` (Fewer gaps: each beast likelier, the fly rarer).
 */
export function historyLuck(G, seed, time, roll = 0, fewer = false, H = HISTORY) {
    const base = mix(seed | 0, Math.round((time ?? 0) * 1000), roll | 0), NB = BEASTS.length;
    const fly = new Uint8Array(G.masses.length), has = new Uint8Array(G.masses.length * NB);
    for (const m of G.masses) {
        const kLat = Math.floor(m.lat / H.luckTileDeg), kLon = Math.floor(m.lon / H.luckTileDeg);
        fly[m.id] = u01(base, STREAM.fly, kLat, kLon) < H.flyOdds[fewer ? 1 : 0] * S(H.habitatKm2, m.fly) ? 1 : 0;
        for (let b = 1; b < NB; b++) {
            const odds = H.beastOdds[fewer ? 1 : 0] * S(H.habitatKm2, m.habitat[b]) * (BIG.has(b) ? S(H.bigArea, m.area) : 1);
            if (!(odds > 0)) continue;
            has[m.id * NB + b] = u01(base, STREAM.beast + b, kLat, kLon) < odds ? 1 : 0;
        }
    }
    return { fly, has };
}
/** Whether the fly lives at (lat, lon): its landmass's luck (1 where unknown: off the grid's land). */
export function flyHereAt(G, luck, lat, lon) {
    const m = massAt(G, lat, lon);
    return m >= 0 ? luck.fly[m] : 1;
}
