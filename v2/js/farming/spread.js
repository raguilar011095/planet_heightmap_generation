// The spread of crops (plans/V2_FARMING_PLAN.md C4; after Vavilov's centres of origin and Diamond's continental axes):
// where farming began and how its crops spread — over a very long time, by osmosis, not by any people's deeds. From a
// finished moment's farming picture (farming/farming.js farmPlace, per pixel), with the techniques chosen:
//   · HEARTHS — a few places where staples were first grown (as Earth's Fertile Crescent, China, Mesoamerica, the Andes,
//     New Guinea, the Sahel): the regions whose land grows the most rain-fed food (the first farmers had no works), each
//     far from the others and far apart by the way crops travel — a major desert, mountain range or open sea between
//     them, or a continent's breadth. Each domesticates the two or three staples that grow best around it — its own strains;
//   · the SPREAD — each strain outward from its hearth over a map of what a km costs: cheap along rivers, coasts and flat
//     plains; dear over hills and mountains, deserts and land the crop does not grow in (carried across); very dear over
//     open ocean (coastal waters are a highway). Each strain at home in its hearth's climates — domesticated there, it
//     grows best in them (a cool highland's roots in cool highlands, a rainforest's in the wet tropics), a little less
//     elsewhere (a bias, never a bar). Seas are crossed freely where no strain is yet — coasts and island hops cheap,
//     only an ocean's breadth never — but hard against one already there: a place grows one strain of each crop, the
//     first to reach it, unless one come later from near (not over a long sea) is much better there — at home in its
//     climate;
//   · each place then grows the one — or, where they do nearly as well, two — of the crops that reached it that do best
//     there (or herds); where none reached, its people forage.
// Archetypes, not species: a strain is its hearth's strain of a staple group, not any one crop (the real crops — Earth's,
// named — are a layer for later: branch `crops`).
// In two parts: spreadBase reads the picture and finds the hearths and their crops — the first farmers', so by rain alone
// (the techniques change only how far and where each strain spreads): the same hearths and crops whatever the techniques;
// spreadStrains spreads each strain, at home in its hearth's climates.
// spreadBase is itself two: spreadGround (the picture read, the ways) and spreadHearths — which a ROLL (the legend's
// Re-roll) takes again: the same scores as odds, not a ranking (each region's richness and a hearth's other staples
// nudged at random, every rule kept as before); roll 0 nudges nothing — the likeliest.
// Where the land's crops came from — not who carried them, nor when.

import { farmPlace, harvestsAt, hasHarvests, Staple, STAPLES, STAPLE_WORDS, CROPS, CROP_STAPLE, STAPLE_CROP } from './farming.js';
import { FARMING } from './farming-config.js';
import { LatLonGrid } from '../finish/finish-grid.js';
import { KOPPEN_ID } from '../climate/koppen.js';
import { MinHeap } from '../core/min-heap.js';
import { KOPPEN_CLASSES } from '../climate/koppen.js';

const KM_PER_DEG = 6371 * Math.PI / 180;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const S = (r, x) => smooth(r[0], r[1], x);
const RAIN = { flood: false, canal: false, terrace: false, raised: false };

export const SPREAD = {
    // ── the hearths ──
    hearthKm: 400,              // a hearth is a region — the land within this of a place (domestication took millennia, over
                                // a region's hills and valleys, not at a spot)…
    hearthFood: [0.08, 0.3],    // …how well its best staple grows there, rain-fed, one harvest at most (the first farmers
                                // had no works and sowed once a year: the wet tropics' two or three rice crops came later),
                                // a km² (the sea, the barren and the herders' land counting none) from little to a breadbasket's…
    diverse: [1.2, 2.6],        // …more so where its staples are many — their effective number (1 one alone, 2 two halves)…
    diverseBonus: 1,            // …by up to this much: variety to domesticate (Vavilov's centres of diversity: mountains and
                                // plains, wet and dry, side by side)
    hearthMin: 0.3,             // …a hearth where this likely or more
    hearths: 6,                 // at most this many (Earth: some 6–10 independent ones) — and up to hearthsMax so that every
    hearthsMax: 8,              // staple has one (below)
    apartKm: 2000,              // each at least this far from the others (Earth's nearest: Mesoamerica and the Andes ~3500,
                                // the Fertile Crescent and the Ethiopian highlands ~2500)…
    apartCost: 5000,            // …and as far apart by the way crops travel (the ways below, in km of flat land a crop
                                // grows on): 5000 km of that — or 2000 km with a major desert, mountain range or sea between
    domestic: 0.15,             // a hearth domesticates each staple that grows best (rain-fed) on this share of its farmland…
    domesticMin: 2,             // …at least this many (if no other grows best on so much of it: of those that grow there, the
                                // one fewest hearths have — variety between the hearths)…
    domesticMax: 3,             // …up to this many
    perCrop: 2,                 // every staple domesticated somewhere — at this many hearths where it can be: one more hearth
    domesticLeast: 0.04,        // with room where it grows best on this share of the farmland or more (for the first, if none
                                // has: a hearth of its own where it does, far from the others — or the hearth that suits it best)
    perCropMax: 3,              // …and from no more than this many (variety: Earth's millets and tubers several, wheat one)
    // ── the ways: what a km costs, in km of flat land the crop grows on (an additive surcharge, then river and coast) ──
    rough: [5, 40],             // hills to mountains (the ground's slope, m per km: a finished range's flanks 20–50)…
    roughCost: 4,               // …up to this much more
    desertCost: 4,              // desert, ice and bare rock (nothing grown, no herds): this much more
    unfit: [0.08, 0.3],         // land the crop grows no better than the first (its score — fully fit from the second)…
    unfitCost: 2,               // …this much more: carried across, not grown along the way
    river: 0.5,                 // along a river worth tapping (as much of the land within its reach as the first of riverShare
    riverShare: [0.05, 0.3],    // …to all from the second): this share of the cost
    coast: 0.7,                 // land on a coast: this share
    seaNear: 1,                 // the sea, where no strain is yet: coastal waters (within seaKm[0] of land) as dear as flat
    seaKm: [200, 700],          // land — boats hug the shore and hop between islands — to the open ocean this far from land…
    seaFar: 40,                 // …this dear: a sea ~1000 km across costs ~6000, ~1500 km ~20 000…
    oceanKm: 1000,              // …and the open ocean farther than this from any land never crossed (a sea over ~2000 km wide —
                                // the Atlantic's breadth — as Earth's crops never crossed it)
    seaHeld: 10,                // …but against a strain already there each km of sea counts this many times over: seed come
                                // over the sea seldom ousts fields long grown (a strain's lateness at a place, below, counts it)
    apartSea: { near: 1, km: [100, 450], far: 40 },   // between hearths (whose farmers never met): the sea as dear as this
    reach: 50000,               // a strain spreads this far at most (its cost): over a very long time, wherever it can grow
                                // that a sea not too wide divides — Neolithic farming spread ~1 km a year
    homeBias: 0.4,              // a strain grows best in its hearth's climates — domesticated there, it is at home there — and
                                // this much less in climates unlike them (a like one part of the way: the same first two letters
                                // 0.6 of it, the same first 0.3) — a bias on where it is grown and who wins a place, never a bar…
    homeShare: [0.05, 0.25],    // …each of the hearth's climates fully as it covers from the first to the second of its land
    incumbency: 3000,           // a strain's worth at a place: how much at home it is there × e^(−how much later it came than
                                // the first strain there ÷ this — its sea counted seaHeld times over): to win a place, one come
                                // 3000 later (in the ways' km of good land) must be ~2.7× better there, one come 1000 later
                                // ~1.4× — a strain at home established near can win out; one from over a long sea hardly ever
    // ── a place's crops ──
    second: 0.8,                // a second crop where it feeds this share of what the first does (a third of the farmland
                                // has one: herds beside the fields, mostly)
    // ── a re-roll: the likeliest still likeliest, close runners-up a turn ──
    rollRegion: 0.25,           // each region's richness × e^(this × a random field of unit spread, smooth over ~2×rollKm:
    rollKm: 500,                // a hearth jumps to another good region, not a few km) — ×1.3 one way or the other, typically
    rollStaple: 0.4,            // a hearth's other staples: each one's share × e^(this × a random number of unit spread), and
                                // as much in which it takes up when short of domesticMin
    gridDeg: 0.5,
    sampleW: 1440,              // the farming picture read about this many pixels wide
};

/**
 * The hearths and the spread of crops over a finished moment's farming picture `F` (raster.farming) and land `L`
 * (raster.climate: its Köppen classes mark the land), with the techniques `tech`.
 * @returns spreadStrains' map
 */
export function spreadMap(F, L, tech, C = SPREAD, K = FARMING) {
    return spreadStrains(spreadBase(F, L, tech, 0, C, K), C);
}

/**
 * The first part: the picture read onto the grid, the ways, the hearths (by rain alone) and their crops — at a roll
 * (0: the likeliest).
 * @returns {{grid: LatLonGrid, hearths: Array<{lat, lon, score, cell, crops: number[] (Staples), climate: [Köppen code,
 * share][]}>, apart: number[][] (the cheapest way's cost between hearths, Infinity past apartCost), roll, …the fields
 * spreadStrains spreads over}}
 */
export function spreadBase(F, L, tech, roll = 0, C = SPREAD, K = FARMING) {
    return spreadHearths(spreadGround(F, L, tech, C, K), roll, C);
}

/** The picture read onto the grid and the ways — what the hearths are found on, whatever the roll (kept with every base
 *  made from it: its strains' spreads, kept, serve each). */
export function spreadGround(F, L, tech, C = SPREAD, K = FARMING) {
    const g = new LatLonGrid(C.gridDeg), N = g.size, kef = KOPPEN_ID.EF, nC = CROPS.length;
    const area = new Float64Array(N), land = new Float64Array(N), rough = new Float64Array(N), barren = new Float64Array(N), river = new Float64Array(N);
    const rainFood = new Float64Array(N), fit = Array.from({ length: nC }, () => new Float64Array(N)), best = Array.from({ length: nC }, () => new Float64Array(N));
    const fitRain = Array.from({ length: nC }, () => new Float32Array(N)), barrenRain = new Float32Array(N), kop = new Uint8Array(N);
    const p = {}, e = new Float64Array(2 * nC), r = { scores: new Float64Array(STAPLES.length) }, r0 = { scores: new Float64Array(STAPLES.length) }, kept = hasHarvests(F);
    const stride = Math.max(1, Math.ceil(F.w / C.sampleW));
    for (let y = 0; y < F.h; y += stride) {
        const lat = 90 - (y + 0.5) / F.h * 180, a = Math.cos(lat * Math.PI / 180);
        for (let x = 0; x < F.w; x += stride) {
            const i = y * F.w + x, c = g.index(lat, (x + 0.5) / F.w * 360 - 180);
            area[c] += a;
            if (!L.koppen[i]) continue;
            land[c] += a; kop[c] = L.koppen[i];
            if (L.koppen[i] === kef) { barren[c] += a; barrenRain[c] += a; continue; }
            p.soil = F.soil[i] / 255; p.flood = F.flood[i] / 255; p.canal = F.canal[i] / 255; p.slope = 2 * F.slope[i]; p.wetland = F.wetland[i] / 255;
            if (kept) harvestsAt(F.crops, i, e); else e.fill(0);
            // (what the land grows with the techniques — where each crop could spread — and by rain alone: the first farmers')
            farmPlace(p, e, F.pasture[i] / 255, tech, r, K);
            for (let k = 0; k < nC; k++) fit[k][c] += a * r.scores[CROP_STAPLE[k]];
            if (r.staple === Staple.NONE) barren[c] += a;
            rough[c] += a * S(C.rough, p.slope);
            if (Math.max(p.flood, p.canal) >= 0.1) river[c] += a;
            farmPlace(p, e, F.pasture[i] / 255, RAIN, r0, K);
            for (let k = 0; k < nC; k++) fitRain[k][c] += a * r0.scores[CROP_STAPLE[k]];
            if (r0.staple === Staple.NONE) barrenRain[c] += a;
            if (STAPLE_CROP[r0.staple] >= 0) { rainFood[c] += a * r0.score; best[STAPLE_CROP[r0.staple]][c] += a; }
        }
    }
    // each grid cell's ground: the sea where it is mostly sea; its land's roughness, desert, river, each crop's fit
    const sea = new Uint8Array(N), fitAnyRain = new Float32Array(N);
    for (let c = 0; c < N; c++) {
        sea[c] = land[c] < 0.5 * area[c] ? 1 : 0;
        const l = Math.max(1e-9, land[c]);
        rough[c] /= l; barren[c] /= l; barrenRain[c] /= l; river[c] /= l;
        for (let k = 0; k < nC; k++) { fit[k][c] /= l; fitRain[k][c] /= l; fitAnyRain[c] = Math.max(fitAnyRain[c], fitRain[k][c]); }
    }
    const nb = neighbours(g), seaKm = seaDistance(g, sea, nb, C.oceanKm);
    // what a km costs: the land's surcharge (without the crop's fit), the factor its river and coast give; the sea's — where
    // no strain is yet, what more it counts against one already there, and between hearths
    const landExtra = new Float32Array(N), rainExtra = new Float32Array(N), landFactor = new Float32Array(N), seaCost = new Float32Array(N);
    const seaMore = new Float32Array(N), apartSea = new Float32Array(N), A = C.apartSea;
    for (let c = 0; c < N; c++) {
        if (sea[c]) {
            // (the open ocean, past oceanKm from land: never crossed — nor searched)
            seaCost[c] = seaKm[c] <= C.oceanKm ? C.seaNear + (C.seaFar - C.seaNear) * S(C.seaKm, seaKm[c]) : Infinity;
            seaMore[c] = (C.seaHeld - 1) * seaCost[c];
            apartSea[c] = seaKm[c] <= C.oceanKm ? A.near + (A.far - A.near) * S(A.km, seaKm[c]) : Infinity;
            continue;
        }
        landExtra[c] = C.roughCost * rough[c] + C.desertCost * barren[c];
        rainExtra[c] = C.roughCost * rough[c] + C.desertCost * barrenRain[c];
        let coastal = false;
        for (let k = 0; k < 8; k++) { const d = nb.at(c, k); if (d >= 0 && sea[d]) { coastal = true; break; } }
        landFactor[c] = (1 - (1 - C.river) * S(C.riverShare, river[c])) * (coastal ? C.coast : 1);
    }
    const costOf = (fitK, out = new Float32Array(N), extra = landExtra, seas = seaCost) => {
        for (let c = 0; c < N; c++) out[c] = sea[c] ? seas[c] : (1 + extra[c] + C.unfitCost * (1 - S(C.unfit, fitK[c]))) * landFactor[c];
        return out;
    };
    // (the way between hearths: as any crop travels, by rain alone, the sea as dear as of old)
    const way = costOf(fitAnyRain, new Float32Array(N), rainExtra, apartSea);

    // ── the hearths: the regions richest in rain-fed food, far apart ──
    const foodS = new Float32Array(N);
    for (let c = 0; c < N; c++) foodS[c] = area[c] > 0 ? rainFood[c] / area[c] : 0;
    const region = g.blur(foodS, C.hearthKm / Math.SQRT2), score = new Float32Array(N);
    // (and how many staples it has: a region where several grow best somewhere — hills and plains, wet and dry — likelier,
    // as Vavilov's centres of diversity were: a variety to domesticate)
    const share = best.map(b => { const o = new Float32Array(N); for (let c = 0; c < N; c++) o[c] = area[c] > 0 ? b[c] / area[c] : 0; return g.blur(o, C.hearthKm / Math.SQRT2); });
    for (let c = 0; c < N; c++) {
        if (sea[c]) continue;
        // (the effective number of its staples — the inverse Simpson index of their shares: 1 where one grows best
        // everywhere, 2 for two halves, up to 4)
        let sum = 0, sq = 0;
        for (let k = 0; k < nC; k++) { sum += share[k][c]; sq += share[k][c] * share[k][c]; }
        region[c] *= 1 + C.diverseBonus * S(C.diverse, sq > 0 ? sum * sum / sq : 1);
        score[c] = S(C.hearthFood, region[c]);
    }
    return { grid: g, F, L, stride, area, land, sea, kop, fit, fitRain, best, region, score, share, way, nb, costOf, seaMore, kept: { runs: new Map(), suits: new Map() } };
}

/** The hearths on a ground (spreadGround) at a roll: the regions richest in rain-fed food, far apart, and their crops —
 *  at roll 0 the likeliest; at another the same scores as odds (SPREAD rollRegion, rollStaple, rollCrop). */
export function spreadHearths(ground, roll = 0, C = SPREAD) {
    const { grid: g, F, L, stride, land, sea, kop, fit, fitRain, best, region, score, share, way, nb, costOf, seaMore } = ground;
    const N = g.size, nC = CROPS.length;
    // (the roll's nudges: each region's richness by a smooth random field — the order the hearths are found in, and where
    // a staple's own is; the true richness still decides which may be one — a hearth's other staples, each real crop's pull)
    let rank = region, nudge = null;
    if (roll) {
        const field = new Float32Array(N);
        for (let c = 0; c < N; c++) field[c] = rand01(roll, ROLL_REGION, c) - 0.5;
        const smoothField = g.blur(field, C.rollKm);
        let sq = 0;
        for (let c = 0; c < N; c++) sq += smoothField[c] * smoothField[c];
        const sd = Math.sqrt(sq / N) || 1;
        rank = new Float32Array(N);
        for (let c = 0; c < N; c++) rank[c] = region[c] * Math.exp(C.rollRegion * smoothField[c] / sd);
        nudge = (c, k) => normal(roll, ROLL_STAPLE, c * 8 + k);
    }
    const hearths = [], ways = [];
    // (far enough from every hearth so far — in km, and by the way crops travel)
    const apartFrom = c => {
        const { lat, lon } = cellLatLon(g, c);
        return !hearths.some(h => greatKm(h.lat, h.lon, lat, lon) < C.apartKm) && !ways.some(w => w[c] < C.apartCost);
    };
    // (a hearth at c: its staples those that grow best, rain-fed, on enough of its region's farmland — each one's share of
    // it, how well each grows there on the whole, and its climates' shares of its land, kept)
    const found = c => {
        const tot = new Float64Array(nC), fitW = new Float64Array(nC), kw = new Float64Array(KOPPEN_CLASSES.length);
        let landW = 0;
        forWithin(g, c, C.hearthKm, cc => {
            landW += land[cc]; kw[kop[cc]] += land[cc];
            for (let k = 0; k < nC; k++) { tot[k] += best[k][cc]; fitW[k] += fitRain[k][cc] * land[cc]; }
        });
        const sum = Math.max(1e-9, tot.reduce((a, v) => a + v, 0)), shares = [...tot].map(v => v / sum), fits = [...fitW].map(v => v / Math.max(1e-9, landW));
        let ranked = [...shares.keys()].sort((a, b) => shares[b] - shares[a] || fits[b] - fits[a]), odds = shares;
        if (nudge) {
            // (rolled: its leading staple kept, the others by their shares nudged)
            odds = shares.map((s, k) => (k === ranked[0] ? s : s * Math.exp(C.rollStaple * nudge(c, k))));
            ranked = [ranked[0], ...ranked.slice(1).sort((a, b) => odds[b] - odds[a] || fits[b] - fits[a])];
        }
        const crops = ranked.filter((k, j) => j === 0 || odds[k] >= C.domestic).slice(0, C.domesticMax);
        const climate = [...kw].map((v, j) => [KOPPEN_CLASSES[j].code, v / Math.max(1e-9, landW)]).filter(([code, s]) => s > 0.01 && code !== 'Ocean');
        const h = { ...cellLatLon(g, c), score: score[c], cell: c, crops: crops.map(k => CROP_STAPLE[k]), shares, fits, climate };
        hearths.push(h);
        const w = new Float64Array(N);
        flow(g, nb, way, [c], [0], C.apartCost, w, null, null, null);
        ways.push(w);
        return h;
    };
    const order = [];
    for (let c = 0; c < N; c++) if (score[c] >= C.hearthMin) order.push(c);
    order.sort((a, b) => rank[b] - rank[a]);
    for (const c of order) {
        if (hearths.length >= C.hearths) break;
        if (apartFrom(c)) found(c);
    }
    const count = k => hearths.reduce((a, h) => a + (h.crops.includes(CROP_STAPLE[k]) ? 1 : 0), 0);
    // (a hearth short of domesticMin staples: of those that grow there — best on some of its farmland, or well there on
    // the whole — the one fewest hearths have yet, the more it grows on the likelier: variety between the hearths; or, if
    // none grows so, the one that grows there best)
    const topUp = h => {
        while (h.crops.length < C.domesticMin) {
            let pick = -1, pv = Infinity;
            for (let k = 0; k < nC; k++) {
                if (h.crops.includes(CROP_STAPLE[k]) || !(h.shares[k] >= C.domesticLeast || h.fits[k] >= C.unfit[1])) continue;
                const v = count(k) - h.shares[k] - 0.5 * h.fits[k] - (nudge ? C.rollStaple * nudge(h.cell, 4 + k) : 0);
                if (v < pv) { pv = v; pick = k; }
            }
            if (pick < 0) for (let k = 0; k < nC; k++) {
                if (h.crops.includes(CROP_STAPLE[k]) || !(h.shares[k] > 0 || h.fits[k] >= C.unfit[0])) continue;
                if (pick < 0 || h.shares[k] > h.shares[pick] || (h.shares[k] === h.shares[pick] && h.fits[k] > h.fits[pick])) pick = k;
            }
            if (pick < 0) break;
            h.crops.push(CROP_STAPLE[pick]);
        }
    };
    for (const h of hearths) topUp(h);
    const add = (h, k) => {
        // (a hearth full already gives up its least staple — one other hearths have too)
        if (h.crops.length >= C.domesticMax) {
            const drop = [...h.crops].sort((a, b) => h.shares[STAPLE_CROP[a]] - h.shares[STAPLE_CROP[b]]).find(st => count(STAPLE_CROP[st]) > 1);
            if (drop) h.crops.splice(h.crops.indexOf(drop), 1);
        }
        h.crops.push(CROP_STAPLE[k]);
    };
    // (and none from more than perCropMax: dropped where it grows best on the least of the farmland — never a hearth's
    // leading staple — and, where the hearth needs another to keep domesticMin, swapped for one fewer hearths have that
    // grows there too: the hearths domesticating different things)
    // (every staple from a hearth at least — from two where one more grows it best on enough of its farmland)
    for (let k = 0; k < nC; k++) {
        const have = hearths.filter(h => h.crops.includes(CROP_STAPLE[k]) && h.shares[k] < Math.max(...h.shares)).sort((a, b) => a.shares[k] - b.shares[k]);
        for (const h of have) { if (count(k) <= C.perCropMax) break; h.crops.splice(h.crops.indexOf(CROP_STAPLE[k]), 1); topUp(h); }
    }
    for (let pass = 1; pass <= C.perCrop && hearths.length; pass++) for (let k = 0; k < nC; k++) {
        if (count(k) >= pass) continue;
        // (a hearth with room where it grows best on some of the farmland)
        const room = hearths.filter(h => !h.crops.includes(CROP_STAPLE[k]) && h.crops.length < C.domesticMax && h.shares[k] >= C.domesticLeast).sort((a, b) => b.shares[k] - a.shares[k]);
        if (room.length) { room[0].crops.push(CROP_STAPLE[k]); continue; }
        if (pass > 1) continue;
        // (or a hearth of its own: the region it grows best on the most of, far from the others)
        let at = -1, atV = 0;
        for (let c = 0; c < N; c++) {
            const v = share[k][c] * rank[c];
            if (!sea[c] && share[k][c] >= C.domesticLeast && score[c] >= 0.5 * C.hearthMin && v > atV && apartFrom(c)) { at = c; atV = v; }
        }
        if (hearths.length >= C.hearthsMax) at = -1;
        if (at >= 0) { const h = found(at); if (!h.crops.includes(CROP_STAPLE[k])) add(h, k); topUp(h); continue; }
        // (or the hearth whose region suits it best)
        const by = hearths.filter(h => !h.crops.includes(CROP_STAPLE[k])), h = by.sort((a, b) => b.shares[k] - a.shares[k] || b.fits[k] - a.fits[k])[0];
        if (h && (h.shares[k] > 0 || h.fits[k] >= C.unfit[0])) add(h, k);
    }
    const apart = hearths.map((_, a) => hearths.map((h, b) => (a === b ? 0 : ways[a][h.cell])));
    return { grid: g, hearths, apart, roll, F, L, stride, land, fit, nb, costOf, seaMore, kept: ground.kept };
}

// (the roll's random numbers — a stream each, so that adding one re-rolls none of the others: a hash of the roll, the
// stream and the place or choice, the same at any detail; 3 was the real crops' names — kept for them, on branch `crops`)
const ROLL_REGION = 1, ROLL_STAPLE = 2;
function rand01(roll, stream, id) {
    let h = Math.imul(roll, 0x9e3779b1) ^ Math.imul(stream + 1, 0x85ebca77) ^ Math.imul(id + 1, 0xc2b2ae3d);
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d); h = Math.imul(h ^ (h >>> 15), 0x846ca68b); h ^= h >>> 16;
    return ((h >>> 0) + 0.5) / 4294967296;
}
/** A standard normal number for (roll, stream, id) (Box–Muller). */
function normal(roll, stream, id) {
    return Math.sqrt(-2 * Math.log(rand01(roll, stream, 2 * id))) * Math.cos(2 * Math.PI * rand01(roll, stream, 2 * id + 1));
}

/**
 * The second part: each strain spread from its hearth, at home in its hearth's climates, the first strain of a crop to
 * reach a place keeping it. @returns {{grid, hearths, apart (spreadBase's), owner: Int8Array[] (per crop group, CROPS'
 * order: the hearth whose strain grows in each grid cell, or -1), km: Float32Array[] (the km it came), strains:
 * Array<{hearth, staple, key, niche (per Köppen class: how much at home it is there — homeNiche), suit (per grid cell:
 * its land's mean niche)}>, niche: (hearth, staple) → its strain's niche, or null if the hearth has none of it}}
 */
export function spreadStrains(base, C = SPREAD) {
    const { grid: g, hearths, F, L, stride, land, fit, nb, costOf, seaMore } = base, N = g.size, nC = CROPS.length;
    const strains = [], homes = hearths.map(h => homeNiche(h.climate, C));
    hearths.forEach((h, j) => h.crops.forEach(st => strains.push({ hearth: j, staple: st, key: `${h.cell}`, niche: homes[j], suit: null })));
    // (each hearth's climates over the grid: its strains' niche, averaged over each cell's land — read from the picture's
    // climates; kept with the ground for the hearths in use, as each strain's spread is — by its hearth's place, whatever
    // the roll: a re-roll spreads only the strains it moved again)
    const kept = base.kept ?? (base.kept = { runs: new Map(), suits: new Map() }), suits = kept.suits, runsWas = kept.runs, runsNow = new Map();
    const own = [...new Map(strains.filter(s => !suits.has(s.key)).map(s => [s.key, s])).values()], fresh = own.map(() => new Float32Array(N));
    if (own.length) for (let y = 0; y < F.h; y += stride) {
        const lat = 90 - (y + 0.5) / F.h * 180, a = Math.cos(lat * Math.PI / 180);
        for (let x = 0; x < F.w; x += stride) {
            const i = y * F.w + x, code = L.koppen[i];
            if (!code) continue;
            const c = g.index(lat, (x + 0.5) / F.w * 360 - 180);
            for (let q = 0; q < own.length; q++) fresh[q][c] += a * own[q].niche[code];
        }
    }
    own.forEach((s, q) => { for (let c = 0; c < N; c++) fresh[q][c] = land[c] > 0 ? fresh[q][c] / land[c] : 1 - C.homeBias; suits.set(s.key, fresh[q]); });
    for (const s of strains) s.suit = suits.get(s.key);
    kept.suits = new Map(strains.map(s => [s.key, s.suit]));
    // ── the spread: each strain outward from its hearth, as its crop grows — over the sea freely where none is yet. A place
    // keeps the first strain of a crop to reach it (counting its sea seaHeld times over: against fields already grown) —
    // unless one come later is so much more at home there as to make up for how much later it came: a strain at home
    // established near can win out; one from over a long sea hardly ever ──
    const owner = [], km = [], fitS = new Float32Array(N), field = new Float32Array(N), d = new Float64Array(N);
    for (let k = 0; k < nC; k++) {
        const o = new Int8Array(N).fill(-1), first = new Float32Array(N).fill(Infinity), bk = new Float32Array(N), runs = [];
        for (const s of strains) {
            if (s.staple !== CROP_STAPLE[k]) continue;
            const key = `${hearths[s.hearth].cell}:${s.staple}`;
            let run = runsWas.get(key);
            if (!run) {
                // (its cost to each place, its sea counted seaHeld times over — Infinity where it never came — and the km it came)
                for (let c = 0; c < N; c++) fitS[c] = fit[k][c] * s.suit[c];
                const m = new Float32Array(N), held = new Float32Array(N);
                flow(g, nb, costOf(fitS, field), [hearths[s.hearth].cell], [s.hearth], C.reach, d, null, m, seaMore, held);
                for (let c = 0; c < N; c++) held[c] = d[c] < Infinity ? held[c] + d[c] : Infinity;
                run = { held, m };
            }
            runsNow.set(key, run);
            for (let c = 0; c < N; c++) if (run.held[c] < first[c]) first[c] = run.held[c];
            runs.push({ s, ...run });
        }
        for (let c = 0; c < N; c++) {
            if (!(first[c] < Infinity)) continue;
            let bv = -1;
            for (const { s, held, m } of runs) {
                if (!(held[c] < Infinity)) continue;
                const v = s.suit[c] * Math.exp(-(held[c] - first[c]) / C.incumbency);
                if (v > bv) { bv = v; o[c] = s.hearth; bk[c] = m[c]; }
            }
        }
        owner.push(o); km.push(bk);
    }
    kept.runs = runsNow;
    return { grid: g, hearths, apart: base.apart, owner, km, strains, niche: (j, st) => (hearths[j]?.crops.includes(st) ? homes[j] : null) };
}

// how alike two Köppen climates are: the same 1, the same first two letters (Cw…) 0.6, the same first letter 0.3
const like = (a, b) => (a === b ? 1 : a[0] === b[0] ? (a[1] === b[1] ? 0.6 : 0.3) : 0);
/** A hearth's strains' niche: how much at home they are in each Köppen class (by KOPPEN_CLASSES' index), from
 *  1 − homeBias to 1 — fully in the hearth's climates (`climate`: [code, share] pairs; each fully as it covers from
 *  homeShare[0] to homeShare[1] of its land), part of the way in climates like them. */
function homeNiche(climate, C = SPREAD) {
    return Float32Array.from(KOPPEN_CLASSES, k => {
        let m = 0;
        for (const [code, share] of climate) m = Math.max(m, like(k.code, code) * smooth(C.homeShare[0], C.homeShare[1], share));
        return 1 - C.homeBias * (1 - m);
    });
}

/** A grid cell's centre (degrees). */
function cellLatLon(g, c) {
    const j = Math.floor(c / g.w), i = c - j * g.w;
    return { lat: 90 - (j + 0.5) * g.step, lon: -180 + (i + 0.5) * g.step };
}

function greatKm(la1, lo1, la2, lo2) {
    const d = Math.PI / 180, x = Math.sin((la2 - la1) * d / 2) ** 2 + Math.cos(la1 * d) * Math.cos(la2 * d) * Math.sin((lo2 - lo1) * d / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(x)));
}

/** Each grid cell within km of cell c (great circle), to fn. */
function forWithin(g, c, km, fn) {
    const { lat, lon } = cellLatLon(g, c), j = Math.floor(c / g.w), i = c - j * g.w, dj = Math.ceil(km / (KM_PER_DEG * g.step));
    for (let jj = Math.max(0, j - dj); jj <= Math.min(g.h - 1, j + dj); jj++) {
        const la = 90 - (jj + 0.5) * g.step, di = Math.min(g.w >> 1, Math.ceil(km / (KM_PER_DEG * g.step * Math.max(0.05, Math.cos(la * Math.PI / 180)))));
        for (let d = -di; d <= di; d++) {
            const ii = ((i + d) % g.w + g.w) % g.w;
            if (greatKm(lat, lon, la, -180 + (ii + 0.5) * g.step) <= km) fn(jj * g.w + ii);
        }
    }
}

/** The grid's eight neighbours (longitude wraps; none past the poles) and the km to each — at(c, k): the k-th
 *  neighbour of c or -1, kmAt(c, k) its distance; and per row the km east–west (ew), north–south (ns) and diagonally to
 *  the row above (up) and below (down), for the search. */
function neighbours(g) {
    const { w, h, step } = g, ns = KM_PER_DEG * step, ew = new Float64Array(h), up = new Float64Array(h), down = new Float64Array(h);
    for (let j = 0; j < h; j++) ew[j] = ns * Math.cos((90 - (j + 0.5) * step) * Math.PI / 180);
    for (let j = 0; j < h; j++) {
        if (j > 0) up[j] = Math.hypot(ns, 0.5 * (ew[j] + ew[j - 1]));
        if (j < h - 1) down[j] = Math.hypot(ns, 0.5 * (ew[j] + ew[j + 1]));
    }
    const DJ = [0, 0, -1, 1, -1, -1, 1, 1], DI = [-1, 1, 0, 0, -1, 1, -1, 1];
    return {
        w, h, ns, ew, up, down,
        at(c, k) {
            const j = Math.floor(c / w) + DJ[k];
            if (j < 0 || j >= h) return -1;
            const i = c % w + DI[k];
            return j * w + (i < 0 ? i + w : i >= w ? i - w : i);
        },
        kmAt(c, k) {
            const j = Math.floor(c / w);
            if (!DJ[k]) return ew[j];
            if (!DI[k]) return ns;
            const e = 0.5 * (ew[j] + ew[j + DJ[k]]);
            return Math.sqrt(ns * ns + e * e);
        },
    };
}

/** Each sea cell's km from land, to maxKm (land 0; farther Infinity). */
function seaDistance(g, sea, nb, maxKm) {
    const N = g.size, d = new Float64Array(N).fill(Infinity), heap = new MinHeap(1 << 16);
    for (let c = 0; c < N; c++) if (!sea[c]) { d[c] = 0; heap.push(0, c); }
    while (heap.size) {
        const c = heap.pop(), dc = heap.lastKey;
        if (dc > d[c]) continue;
        for (let k = 0; k < 8; k++) {
            const n = nb.at(c, k);
            if (n < 0 || !sea[n]) continue;
            const v = dc + nb.kmAt(c, k);
            if (v < d[n] && v <= maxKm) { d[n] = v; heap.push(v, n); }
        }
    }
    return d;
}

/**
 * Dijkstra over the grid from `sources` (cells; each carrying its label from `labels`): each step's cost its km × the
 * mean of the two cells' cost a km, to `budget`. Into dist (Infinity where it never came), and, if given, owner (the
 * label that came first), kmOut (the km it came), moreOut (a second cost a km, `more`, summed along the way it came).
 */
function flow(g, nb, costKm, sources, labels, budget, dist, owner, kmOut, more = null, moreOut = null) {
    dist.fill(Infinity);
    const heap = new MinHeap(1 << 16), { w, h, ns, ew, up, down } = nb;
    sources.forEach((c, s) => { dist[c] = 0; if (owner) owner[c] = labels[s]; if (kmOut) kmOut[c] = 0; if (moreOut) moreOut[c] = 0; heap.push(0, c); });
    let c = 0, dc = 0, half = 0;
    const relax = (n, step) => {
        const v = dc + step * (half + 0.5 * costKm[n]);
        if (!(v < dist[n]) || v > budget) return;
        dist[n] = v;
        if (owner) owner[n] = owner[c];
        if (kmOut) kmOut[n] = kmOut[c] + step;
        if (moreOut) moreOut[n] = moreOut[c] + step * 0.5 * (more[c] + more[n]);
        heap.push(v, n);
    };
    while (heap.size) {
        c = heap.pop(); dc = heap.lastKey;
        if (dc > dist[c]) continue;
        half = 0.5 * costKm[c];
        // (the eight neighbours: east and west round the globe, the rows above and below but not past the poles)
        const j = (c / w) | 0, i = c - j * w, west = i ? c - 1 : c + w - 1, east = i < w - 1 ? c + 1 : c - w + 1;
        relax(west, ew[j]); relax(east, ew[j]);
        if (j > 0) { relax(c - w, ns); relax(west - w, up[j]); relax(east - w, up[j]); }
        if (j < h - 1) { relax(c + w, ns); relax(west + w, down[j]); relax(east + w, down[j]); }
    }
    return dist;
}

/**
 * A place's crops (into out) from what each staple feeds there (`foods`, farmPlace's out.foods with the same
 * techniques), its Köppen class `code`, and the strains that reached it — each crop as well as its strain, at home in
 * its hearth's climates, grows in that climate: main and second (Staples — a second where it feeds nearly as much), each one's hearth (an index into
 * map.hearths, or -1: herding), and `missed` — a crop that would feed more than the main one but never reached it
 * (Staple.NONE if none). main NONE with missed set: foragers — nothing that grows here reached it.
 */
export function spreadPlace(map, lat, lon, foods, code, out = {}, C = SPREAD, K = FARMING) {
    const from = out._from ??= new Int8Array(CROPS.length);
    let m = Staple.NONE, mv = K.stapleMin, s = Staple.NONE, sv = 0, miss = Staple.NONE, missV = K.stapleMin;
    const consider = (st, v) => { if (v > mv) { s = m; sv = mv; m = st; mv = v; } else if (v > sv) { s = st; sv = v; } };
    for (let k = 0; k < CROPS.length; k++) {
        const st = CROP_STAPLE[k];
        from[k] = strainAt(map, st, lat, lon);
        const niche = from[k] >= 0 ? map.niche(from[k], st) : null, v = foods[st] * (niche ? niche[code] : 1);
        if (from[k] >= 0) consider(st, v);
        else if (v > missV) { miss = st; missV = v; }
    }
    consider(Staple.HERDING, foods[Staple.HERDING]);
    out.main = m; out.mainFrom = STAPLE_CROP[m] >= 0 ? from[STAPLE_CROP[m]] : -1;
    out.second = m && s && sv >= C.second * mv ? s : Staple.NONE;
    out.secondFrom = STAPLE_CROP[out.second] >= 0 ? from[STAPLE_CROP[out.second]] : -1;
    out.missed = missV > mv ? miss : Staple.NONE;
    out.cell = map.grid.index(lat, lon);
    return out;
}

/** The hearth whose strain of a staple (a crop group's) grows at a place, or -1 if none reached it — the four grid cells
 *  around it voting by their nearness (so a strain's edge runs smooth across the grid's cells, not in steps). */
export function strainAt(map, staple, lat, lon) {
    const { w, h, step } = map.grid, own = map.owner[STAPLE_CROP[staple]];
    const x = (lon + 180) / step - 0.5, y = Math.max(0, Math.min(h - 1, (90 - lat) / step - 0.5));
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const i0 = ((x0 % w) + w) % w, i1 = i0 + 1 === w ? 0 : i0 + 1, j1 = y0 + 1 < h ? y0 + 1 : y0;
    const a = own[y0 * w + i0], b = own[y0 * w + i1], c = own[j1 * w + i0], d = own[j1 * w + i1];
    if (a === b && a === c && a === d) return a;
    const wa = (1 - fx) * (1 - fy), wb = fx * (1 - fy), wc = (1 - fx) * fy, wd = fx * fy;
    const vote = o => (a === o ? wa : 0) + (b === o ? wb : 0) + (c === o ? wc : 0) + (d === o ? wd : 0);
    let best = a, bw = vote(a);
    for (const o of [b, c, d]) { const v = vote(o); if (v > bw) { bw = v; best = o; } }
    return best;
}

/** A hearth in words: its staples. */
export function hearthWords(h) {
    const w = h.crops.map(s => STAPLE_WORDS[s].toLowerCase());
    const list = w.length > 1 ? `${w.slice(0, -1).join(', ')} and ${w.at(-1)}` : w[0];
    return list.charAt(0).toUpperCase() + list.slice(1);
}
