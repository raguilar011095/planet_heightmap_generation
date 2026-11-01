// Every crop beyond the staples — pulses, fruit and nuts, vegetables and herbs, spices, drinks and fibres — and the small
// animals, each its own (plans/V2_FOOD_PLAN.md §4.4–4.6, F5b; the mock-up's items.js, here on a 1° grid built from the
// history's 0.5°): farming diets have a starch core, a pulse beside it and a fringe of flavours (Mintz & Schlettwein-Gsell
// 2001), so the staples compete for a field and everything else stacks — a farming place grows dozens.
//   · KINDS — 29 kinds, each a climate niche (pulses ride with their staple's fit; the vine's season, the olive's winter
//     chill, the date's heat with water, the spices' narrow tropical niches…), each catalogue entry's own climate narrowing
//     its kind's (farming/names.js CAT);
//   · GROWN AT ALL — each world grows a crop with odds rising with how popular and how nourishing it is on Earth, as the
//     realism weighs them against chance;
//   · ITS HOME — the farmed region that suits it best and is most like its Earth home (the region's Earth likeness: its
//     nearest centre's, names.js), with a seeded nudge; sometimes a second home on another landmass; first grown some
//     centuries (pulses, gardens) to millennia (orchards, spices) after farming came there;
//   · ITS SPREAD — carried between farmers across land it would not grow on (×3 through farmed land, orchards ×5), slower
//     beyond the farmers, short sea hops; spices kept within ~900 km of home; a popular crop a little faster.
// Seeded: one stream per mechanism (grown at all, home, second home, its date) from the world's seed, the moment, the
// re-roll and the names' re-roll.

import { CAT, nearItem, sameWorld, itemClim } from './names.js';
import { Heap, mix } from './history.js';

const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** The kinds the views group crops by, and their colours. */
export const KINDS = [
    { key: 'pulse', word: 'Pulses', rgb: [176, 112, 70] },
    { key: 'orchard', word: 'Fruit & nuts', rgb: [186, 70, 84] },
    { key: 'garden', word: 'Vegetables & herbs', rgb: [64, 146, 78] },
    { key: 'spice', word: 'Spices', rgb: [204, 120, 40] },
    { key: 'stimulant', word: 'Drinks & stimulants', rgb: [124, 82, 58] },
    { key: 'fibre', word: 'Oil & fibre', rgb: [92, 126, 186] },
    { key: 'fowl', word: 'Small animals', rgb: [176, 140, 60] },
];
export const KIND = Object.fromEntries(KINDS.map((K, k) => [K.key, k]));
/** The crops' kinds of niche (names.js CAT's lists beyond the staples), each with its colour. */
export const MINOR = [
    { key: 'pulseCool', kind: 'pulse', word: 'Cool-season pulses', like: 'lentil- and pea-like', rgb: [176, 150, 70] },
    { key: 'pulseWarm', kind: 'pulse', word: 'Warm-season beans', like: 'common-bean-like', rgb: [170, 72, 60] },
    { key: 'pulseMonsoon', kind: 'pulse', word: 'Monsoon beans', like: 'soy- and mung-like', rgb: [92, 150, 80] },
    { key: 'pulseSavanna', kind: 'pulse', word: 'Savanna peas', like: 'cowpea-like', rgb: [196, 132, 150] },
    { key: 'olive', kind: 'orchard', word: 'Oil trees', like: 'olive-like', rgb: [128, 140, 64] },
    { key: 'vine', kind: 'orchard', word: 'Vines', like: 'grape-like', rgb: [128, 64, 120] },
    { key: 'date', kind: 'orchard', word: 'Oasis palms', like: 'date-like', rgb: [196, 140, 60] },
    { key: 'pome', kind: 'orchard', word: 'Chill fruit', like: 'apple- and pear-like', rgb: [200, 70, 70] },
    { key: 'nut', kind: 'orchard', word: 'Nut trees', like: 'chestnut- and walnut-like', rgb: [130, 92, 60] },
    { key: 'citrus', kind: 'orchard', word: 'Grove fruit', like: 'citrus-like', rgb: [236, 168, 40] },
    { key: 'bark', kind: 'spice', word: 'Bark spices', like: 'cinnamon-like', rgb: [190, 100, 50] },
    { key: 'berry', kind: 'spice', word: 'Pepper vines', like: 'black-pepper-like', rgb: [88, 84, 96] },
    { key: 'bud', kind: 'spice', word: 'Bud spices', like: 'clove- and nutmeg-like', rgb: [170, 60, 90] },
    { key: 'rhizome', kind: 'spice', word: 'Root spices', like: 'ginger- and turmeric-like', rgb: [230, 170, 30] },
    { key: 'seed', kind: 'spice', word: 'Seed spices', like: 'cumin- and coriander-like', rgb: [150, 120, 70] },
    { key: 'resin', kind: 'spice', word: 'Incense trees', like: 'frankincense-like', rgb: [196, 184, 140] },
    { key: 'allium', kind: 'garden', word: 'Bulbs', like: 'onion- and garlic-like', rgb: [196, 170, 200] },
    { key: 'brassica', kind: 'garden', word: 'Cole crops', like: 'cabbage-like', rgb: [96, 160, 96] },
    { key: 'gourd', kind: 'garden', word: 'Gourds', like: 'squash-like', rgb: [220, 150, 60] },
    { key: 'chili', kind: 'garden', word: 'Hot pods', like: 'chili-like', rgb: [200, 60, 50] },
    { key: 'melon', kind: 'garden', word: 'Melons', like: 'melon- and cucumber-like', rgb: [150, 196, 90] },
    { key: 'greens', kind: 'garden', word: 'Greens', like: 'leafy greens', rgb: [70, 140, 70] },
    { key: 'nightshade', kind: 'garden', word: 'Fruiting vegetables', like: 'eggplant- and tomato-like', rgb: [180, 70, 100] },
    { key: 'herbs', kind: 'garden', word: 'Herbs', like: 'thyme- and oregano-like', rgb: [110, 150, 110] },
    { key: 'rootveg', kind: 'garden', word: 'Root vegetables', like: 'carrot- and turnip-like', rgb: [220, 120, 50] },
    { key: 'brew', kind: 'stimulant', word: 'Leaf & bean drinks', like: 'tea- and coffee-like', rgb: [92, 128, 70] },
    { key: 'shade', kind: 'stimulant', word: 'Shade-tree stimulants', like: 'cacao- and kola-like', rgb: [128, 76, 52] },
    { key: 'fibre', kind: 'fibre', word: 'Oil & fibre crops', like: 'flax- and cotton-like', rgb: [96, 132, 190] },
    { key: 'fowl', kind: 'fowl', word: 'Small animals', like: 'chicken- and duck-like', rgb: [176, 140, 60] },
];
const NMIN = MINOR.length;
// (the staples' crop groups, as the history's ground keeps their fit: farming.js CROPS)
const RICE = 0, WHEAT = 1, MAIZE = 2, ROOTS = 3;

/** Each kind's climate niche at a place (0…1, into out) — from its measures M: T, Tw, Tc (°C), P (mm), w (wetness: the
 *  aridity index), e (km), ws (the winter's share of the rain), sea (rain's seasonality), water (rivers' reach), coast
 *  (1 on the coast, ½ a cell in) and fit (each staple crop group's). The pulses ride with their partner staple's fit. */
function minorNiche(M, out) {
    const { T, Tw, Tc, P, w, e, ws, sea, water, coast, fit } = M, gs = 0.5 * (Tw + T);
    out[0] = sm(0.12, 0.45, fit[WHEAT]) * sm(2.4, 1.6, w);
    out[1] = sm(0.12, 0.45, Math.max(fit[MAIZE], 0.7 * fit[WHEAT] * sm(15, 19, Tw)));
    out[2] = sm(0.12, 0.45, Math.max(fit[RICE], fit[MAIZE] * sm(0.7, 1.1, w) * sm(0.4, 0.8, sea))) * sm(16, 22, Tw);
    out[3] = sm(0.12, 0.45, Math.max(fit[MAIZE], fit[ROOTS])) * sm(21, 25, T) * sm(1.7, 1.1, w);
    out[4] = sm(1, 4, Tc) * sm(14, 10, Tc) * sm(19, 22, Tw) * sm(0.42, 0.58, ws) * sm(200, 300, P) * sm(1150, 800, P);
    out[5] = sm(11, 13, gs) * sm(24, 20.5, gs) * sm(-9, -3, Tc) * sm(1.5, 1.0, w) * sm(0.15, 0.3, w + water);
    out[6] = sm(24, 28, Tw) * sm(0.3, 0.12, w) * Math.max(sm(0.1, 0.35, water), 0.7 * coast);
    out[7] = sm(9, 4, Tc) * sm(-26, -16, Tc) * sm(15, 18, Tw) * sm(0.4, 0.6, w);
    out[8] = sm(4, 8, T) * sm(19, 15, T) * sm(0.6, 0.9, w) * sm(-22, -12, Tc);
    out[9] = sm(4, 9, Tc) * sm(15, 18, T) * sm(0.75, 1.05, w) * sm(25, 22, T);
    out[10] = sm(20, 22.5, Tc) * sm(1600, 2200, P) * coast;
    out[11] = sm(21.5, 23.5, T) * sm(1800, 2400, P) * sm(0.1, 0.35, e) * sm(1.8, 1.1, e);
    out[12] = sm(22.5, 24.5, T) * sm(1700, 2300, P) * sm(0.5, 1, coast);
    out[13] = sm(20, 23, T) * sm(1200, 1600, P) * sm(0.45, 0.7, sea);
    out[14] = sm(13, 17, T) * sm(25, 21, T) * sm(0.14, 0.24, w) * sm(0.6, 0.4, w);
    out[15] = sm(0.03, 0.08, w) * sm(0.35, 0.2, w) * sm(19, 23, T) * sm(0.05, 0.3, e) * sm(0.5, 0.85, sea);
    out[16] = sm(4, 8, T) * sm(25, 20, T) * sm(0.22, 0.38, w);
    out[17] = sm(2, 6, T) * sm(21, 16, T) * sm(0.45, 0.7, w);
    out[18] = sm(16, 19, Tw) * sm(0.3, 0.5, w + water);
    out[19] = sm(18, 22, T) * sm(0.5, 0.8, w);
    out[20] = sm(20, 24, Tw) * sm(0.15, 0.3, w + water) * sm(1.6, 1.1, w);
    out[21] = sm(-2, 4, T) * sm(26, 22, T) * sm(0.35, 0.6, w);
    out[22] = sm(18, 22, T) * sm(0.6, 0.9, w);
    out[23] = sm(0.42, 0.58, ws) * sm(11, 14, T) * sm(0.22, 0.38, w);
    out[24] = sm(0, 4, T) * sm(20, 15, T) * sm(0.4, 0.6, w);
    out[25] = sm(13, 16, T) * sm(27, 23.5, T) * sm(0.75, 1.1, w) * (0.35 + 0.65 * sm(0.15, 0.8, e)) * sm(-4, 2, Tc);
    out[26] = sm(20, 23, Tc) * sm(1300, 1800, P) * sm(1.4, 0.7, e);
    out[27] = sm(2, 7, T) * sm(0.18, 0.35, w + water);
    // (small animals: wherever farmers live — each animal's own climate narrows it)
    out[28] = sm(-4, 4, T) * sm(0.12, 0.3, w + water);
}

/** The 1° ground for the crops beyond the staples, from the history's (0.5°: history.js historyGround, with its cells'
 *  climate) — once per moment: { w, h, deg, N, land, mass, coast, coastNear, river, seaKm, area (km²), clim (each cell's
 *  land's mean), fit (each staple crop group's), niche (each kind's) }. */
export function minorGround(G) {
    const w = 360, h = 180, deg = 1, N = w * h, f = Math.max(1, Math.round(deg / G.deg));
    const land = new Uint8Array(N), mass = new Int32Array(N).fill(-1), coast = new Uint8Array(N), river = new Uint8Array(N), seaKm = new Float32Array(N).fill(Infinity), area = new Float64Array(N);
    const f32 = () => new Float32Array(N), keys = ['T', 'Tw', 'Tc', 'P', 'W', 'E', 'ws', 'sea', 'water'], clim = Object.fromEntries(keys.map(k => [k, f32()]));
    const NCROP = G.fit.length, fit = G.fit.map(() => f32()), keep = G.keep.map(() => f32()), cnt = new Float32Array(N);
    for (let j = 0; j < G.h; j++) for (let i = 0; i < G.w; i++) {
        const q = j * G.w + i, c = Math.min(h - 1, Math.floor(j / f)) * w + Math.min(w - 1, Math.floor(i / f));
        if (!G.land[q]) { if (G.seaKm[q] < seaKm[c]) seaKm[c] = G.seaKm[q]; continue; }
        land[c] = 1; area[c] += G.area[q]; seaKm[c] = 0;
        if (mass[c] < 0) mass[c] = G.mass[q];
        if (G.coast[q]) coast[c] = 1;
        if (G.river[q]) river[c] = 1;
        if (!(G.clim.W[q] > 0)) continue;                        // (ice: no climate kept)
        cnt[c]++;
        for (const k of keys) clim[k][c] += G.clim[k][q];
        for (let g = 0; g < NCROP; g++) fit[g][c] += G.fit[g][q];
        for (let b = 1; b < keep.length; b++) keep[b][c] += G.keep[b][q];
    }
    for (let c = 0; c < N; c++) {
        if (!cnt[c]) continue;
        for (const k of keys) clim[k][c] /= cnt[c];
        for (let g = 0; g < NCROP; g++) fit[g][c] /= cnt[c];
        for (let b = 1; b < keep.length; b++) keep[b][c] /= cnt[c];
    }
    // (the coast's reach: its own cells 1, a cell inland ½)
    const coastNear = new Float32Array(N);
    for (let c = 0; c < N; c++) {
        if (!land[c]) continue;
        if (coast[c]) { coastNear[c] = 1; continue; }
        const j = (c / w) | 0, i = c - j * w;
        for (let dj = -1; dj <= 1 && !coastNear[c]; dj++) { const jj = j + dj; if (jj < 0 || jj >= h) continue; for (let di = -1; di <= 1; di++) if (coast[jj * w + (i + di + w) % w]) { coastNear[c] = 0.5; break; } }
    }
    const niche = MINOR.map(() => f32()), out = new Float64Array(NMIN), M = { fit: new Float64Array(NCROP) };
    for (let c = 0; c < N; c++) {
        if (!cnt[c]) continue;
        M.T = clim.T[c]; M.Tw = clim.Tw[c]; M.Tc = clim.Tc[c]; M.P = clim.P[c]; M.w = clim.W[c]; M.e = clim.E[c]; M.ws = clim.ws[c]; M.sea = clim.sea[c]; M.water = clim.water[c]; M.coast = coastNear[c];
        for (let g = 0; g < NCROP; g++) M.fit[g] = fit[g][c];
        minorNiche(M, out);
        for (let m = 0; m < NMIN; m++) niche[m][c] = out[m];
    }
    return { w, h, deg, N, land, mass, coast, coastNear, river, seaKm, area, clim, fit, keep, niche, cnt };
}

/** The catalogue's crops beyond the staples (and the small animals), each with its fit per 1° cell (a byte: its kind's
 *  niche, narrowed by its own climate where it gives one) — once per moment. */
export function minorItems(Gm) {
    const items = [];
    MINOR.forEach((Mk, m) => (CAT[Mk.key] || []).forEach(it => {
        // (its own climate narrows its kind's niche — a small animal's the most: guinea pigs in cool highlands, stingless bees in the tropics)
        const c0 = itemClim(it), own = it.T != null || it.W != null || it.E != null || Mk.kind === 'fowl', floor = Mk.kind === 'fowl' ? 0.12 : 0.4, fit8 = new Uint8Array(Gm.N), fm = Gm.niche[m], C = Gm.clim;
        for (let c = 0; c < Gm.N; c++) {
            const f = fm[c];
            if (!(f > 0.04)) continue;
            let a = 1;
            if (own) { const dT = (C.T[c] - c0.T) / 6, dW = Math.log(Math.max(0.03, C.W[c]) / Math.max(0.03, c0.W)) / 0.6, dE = (C.E[c] - c0.E) / 1.4; a = floor + (1 - floor) * Math.exp(-0.5 * (dT * dT + dW * dW + dE * dE)); }
            fit8[c] = Math.min(255, Math.round(255 * f * a));
        }
        items.push({ id: items.length, m, kind: Mk.kind, k: KIND[Mk.kind], it, name: it.n, label: `${it.n}-like`, pop: it.pop ?? 0.5, nut: it.nut ?? 0.5, fit8 });
    }));
    return items;
}

/** Realism: how much popularity, nourishment and Earth's geography decide which crops a world grows and where, against
 *  chance (Earth-like · Balanced · Anything goes). */
export const REAL = {
    earth: { pop: 1.6, nut: 0.8, coh: 1.8, noise: 0.3, twice: 0.25, exist: 1.7 },
    balanced: { pop: 1.0, nut: 0.5, coh: 1.1, noise: 0.6, twice: 0.45, exist: 2.0 },
    wild: { pop: 0.12, nut: 0.08, coh: 0.25, noise: 1.4, twice: 0.65, exist: 2.0 },
};
// (first grown this long after farming came to its home — years: at least, and a mean wait — and how fast each kind
// travels, km a year)
const DELAY = { pulse: [300, 900], garden: [500, 1200], orchard: [2000, 1500], spice: [1800, 1800], stimulant: [1800, 1800], fibre: [800, 1500], fowl: [300, 900] };
const SPEED = { pulse: 0.6, garden: 1.0, orchard: 0.7, spice: 0.3, stimulant: 0.4, fibre: 0.8, fowl: 1.0 };
// (the reach: a crop's speed falls off with the distance from its home, e^(−km / (reach × (0.5 + its popularity)))) — the
// pulses and fruit far, the gardens and drinks regional; spices also capped at 900 km. And the crowding: each kind of niche
// (minor.js MINOR) holds at most this many crops at a place, the first come; a later one does not move into a full place)
export const REACH = { pulse: 3000, garden: 2000, orchard: 3000, spice: 900, stimulant: 1600, fibre: 2500, fowl: 2200 };
export const SLOTS = { pulse: 4, garden: 6, orchard: 4, spice: 2, stimulant: 3, fibre: 4, fowl: 5 };
const PEN = { free: 0, regional: 0.35, strict: 2 };
/** The fit (a byte) a crop must have at a place for a region to be its home; and to count it grown at a place. */
export const HOME_FIT = 80, GROWN_FIT = 70;
/** A crop's arrival kept in a byte: hundreds of years to 20,000, then thousands; 255 never. */
export const ARRIVE_NEVER = 255;
export const arriveByte = t => (!(t < Infinity) ? ARRIVE_NEVER : t <= 20000 ? Math.max(0, Math.round(t / 100)) : Math.min(254, 200 + Math.round((t - 20000) / 1000)));
const kmLat = 111.32;

/** One spread over the 1° ground from sources [{ cell, t }] — speed(cell, t) km a year — no farther than capKm from its
 *  source: each cell's arrival (years; Infinity never). */
function spreadFrom(Gm, sources, speed, capKm = Infinity) {
    const { w, h, N } = Gm, best = new Float64Array(N).fill(Infinity), done = new Uint8Array(N), km = capKm < Infinity ? new Float32Array(N) : null, heap = new Heap(1 << 14);
    // (each step's length, km, by row and direction: worked out once per ground)
    const steps = Gm.steps ??= (() => { const st = new Float64Array(h * 9); for (let j = 0; j < h; j++) for (let dj = -1; dj <= 1; dj++) { const jj = Math.min(h - 1, Math.max(0, j + dj)), kx = kmLat * Math.max(0.02, Math.cos((90 - (Math.min(j, jj) + 0.5 + (dj ? 0.5 : 0)) * Gm.deg) * Math.PI / 180)); for (let di = -1; di <= 1; di++) st[j * 9 + (dj + 1) * 3 + di + 1] = Math.hypot(di * kx, dj * kmLat); } return st; })();
    for (const s of sources) if (s.t < best[s.cell]) { best[s.cell] = s.t; heap.push(s.t, s.cell); }
    while (heap.n) {
        const v = heap.pop(), t = heap.top;
        if (done[v] || t > best[v]) continue;
        done[v] = 1;
        const j = (v / w) | 0, i = v - j * w;
        for (let dj = -1; dj <= 1; dj++) {
            const jj = j + dj;
            if (jj < 0 || jj >= h) continue;
            const row = j * 9 + (dj + 1) * 3 + 1;
            for (let di = -1; di <= 1; di++) {
                if (!dj && !di) continue;
                const m = jj * w + (i + di + w) % w;
                if (done[m]) continue;
                const d = steps[row + di];
                if (km && km[v] + d > capKm) continue;
                const sp = speed(m, t);
                if (!(sp > 0)) continue;
                const nt = t + d / sp;
                if (nt < best[m]) { best[m] = nt; if (km) km[m] = km[v] + d; heap.push(nt, m); }
            }
        }
    }
    return best;
}

/**
 * Which crops this world grew, where each was first grown and when each place got it — the crops of each kind of niche
 * spreading together, crowding one another (SLOTS a place; REACH) — on the 1° ground `Gm` with its items; ctx { farm (each cell's farming's arrival, years), sites [{ cells, mass, pkg, pkg2, t }] (the farmed regions,
 * each with its Earth likeness), seed }; opts { real, pull }. Returns, per item, { exists, noland (nowhere farmed suits
 * it), homes [{ cell, site, t }], arrive (Uint8Array: arriveByte; null where never grown) }.
 */
export function minorBuild(Gm, items, ctx, opts) {
    const { farm, sites, seed } = ctx, R = REAL[opts.real] ?? REAL.balanced, pen = PEN[opts.pull] ?? PEN.regional;
    const h01 = (s, i) => (mix(seed, s, i) + 0.5) / 4294967296, gum = (s, i) => -Math.log(-Math.log(h01(s, i)));
    const { land, river, coast, seaKm } = Gm;
    const outs = items.map(I => {
        const out = { exists: false, noland: false, homes: [], arrive: null };
        const cands = [];
        sites.forEach((S, si) => {
            let f = 0, at = -1;
            for (const c of S.cells) if (I.fit8[c] > f) { f = I.fit8[c]; at = c; }
            if (f < HOME_FIT) return;
            cands.push({ S, si, at, sc: Math.log(f / 255) + R.coh * (nearItem(I.it, S.pkg, S.pkg2) - (sameWorld(I.it, S.pkg) ? 0 : pen)) + R.noise * gum(47, I.id * 512 + si) });
        });
        if (!cands.length) { out.noland = true; return out; }
        // (grown at all: likelier the more popular and nourishing it is on Earth, as the realism weighs them)
        const ex = 1 / (1 + Math.exp(-(R.exist + R.pop * (I.pop - 0.5) * 3 + R.nut * (I.nut - 0.5) * 2)));
        if (!(h01(43, I.id) < ex)) return out;
        out.exists = true;
        cands.sort((a, b) => b.sc - a.sc);
        const picks = [cands[0]], twin = cands.find(c => c.S.mass !== cands[0].S.mass && c.sc > cands[0].sc - 0.9);
        if (twin && h01(53, I.id) < R.twice) picks.push(twin);
        const [d0, dm] = DELAY[I.kind];
        out.homes = picks.map((c, j) => ({ cell: c.at, site: c.si, t: c.S.t + d0 + -Math.log(h01(59, I.id * 4 + j)) * dm }));
        return out;
    });
    // (the spread: each kind of niche's crops together — carried between farmers across land they would not grow on, all but
    // the spices; a popular crop a little faster and farther; slower the farther from home; where a crop grows, the first
    // SLOTS of its kind to come hold the place and the rest stop there)
    const { N, w, h } = Gm, steps = Gm.steps ??= (() => { const st = new Float64Array(h * 9); for (let j = 0; j < h; j++) for (let dj = -1; dj <= 1; dj++) { const jj = Math.min(h - 1, Math.max(0, j + dj)), kx = kmLat * Math.max(0.02, Math.cos((90 - (Math.min(j, jj) + 0.5 + (dj ? 0.5 : 0)) * Gm.deg) * Math.PI / 180)); for (let di = -1; di <= 1; di++) st[j * 9 + (dj + 1) * 3 + di + 1] = Math.hypot(di * kx, dj * kmLat); } return st; })();
    for (let m = 0; m < MINOR.length; m++) {
        const list = items.filter(I => I.m === m && outs[I.id].exists);
        if (!list.length) continue;
        const kind = MINOR[m].kind, spice = kind === 'spice', slots = SLOTS[kind];
        const best = list.map(() => new Float32Array(N).fill(Infinity)), kms = list.map(() => new Float32Array(N)), held = new Uint8Array(N), heap = new Heap(1 << 14);
        const base = list.map(I => SPEED[kind] * (1 + 0.6 * Math.min(1, R.pop) * (I.pop - 0.5))), reach = list.map(I => REACH[kind] * (0.5 + I.pop));
        const arrive = list.map(() => new Uint8Array(N).fill(ARRIVE_NEVER));
        list.forEach((I, k) => { for (const hm of outs[I.id].homes) { const t0 = Math.fround(hm.t); if (t0 < best[k][hm.cell]) { best[k][hm.cell] = t0; heap.push(t0, k * N + hm.cell); } } });
        while (heap.n) {
            const pay = heap.pop(), t = heap.top, k = (pay / N) | 0, v = pay - k * N;
            if (t > best[k][v]) continue;
            const f8 = list[k].fit8;
            if (land[v] && f8[v] >= GROWN_FIT) {
                if (held[v] >= slots) continue;                 // (full: it does not move in)
                held[v]++; arrive[k][v] = arriveByte(t);
            }
            const j = (v / w) | 0, i = v - j * w, fric = Math.exp(-kms[k][v] / reach[k]), bk = best[k], kk = kms[k];
            for (let dj = -1; dj <= 1; dj++) {
                const jj = j + dj;
                if (jj < 0 || jj >= h) continue;
                const row = j * 9 + (dj + 1) * 3 + 1;
                for (let di = -1; di <= 1; di++) {
                    if (!dj && !di) continue;
                    const q = jj * w + (i + di + w) % w, d = steps[row + di];
                    if (spice && kk[v] + d > 900) continue;
                    let x;
                    if (!land[q]) x = seaKm[q] < 280 ? 5 : 0;
                    else {
                        const f = f8[q] / 255, farmed = farm[q] <= t;
                        if (farmed && !spice) { x = base[k] * (kind === 'orchard' ? 5 : 3) * (0.35 + 0.65 * sm(0.15, 0.55, f)); if (river[q] || coast[q]) x *= 2; }
                        else if (f < 0.15) x = farm[q] === Infinity ? 0 : (kind === 'pulse' && farmed ? 0.05 : 0.02);
                        else { x = base[k] * sm(0.15, 0.55, f) * (farmed ? 3 : kind === 'pulse' ? 0.8 : 0.12); if (river[q] || coast[q]) x *= 2; }
                    }
                    if (!(x > 0)) continue;
                    const nt = Math.fround(t + d / (x * fric));
                    if (nt < bk[q]) { bk[q] = nt; kk[q] = kk[v] + d; heap.push(nt, k * N + q); }
                }
            }
        }
        list.forEach((I, k) => { outs[I.id].arrive = arrive[k]; });
    }
    return outs;
}

// ── the named strains of the staples and the beasts, each spreading by itself, ranked at each place ──
/** A byte of arriveByte back to years (Infinity: never). */
export const byteYears = b => (b >= ARRIVE_NEVER ? Infinity : b <= 200 ? b * 100 : 20000 + (b - 200) * 1000);
/** How well a strain does away from home (0.55 … 1): a strain is at home in a climate like its hearth's (the mock-up's
 *  homeMatch — mean °C within ~7, wetness within a factor ~2). */
export const homeMatch = (hT, hW, T, W) => { const dT = (T - hT) / 7, dW = Math.log(Math.max(0.02, W) / Math.max(0.02, hW)) / 0.7; return 0.55 + 0.45 * Math.exp(-(dT * dT + dW * dW)); };
/** The fit a strain must have at a place to grow there at all (its group's fit × its home match). */
export const STRAIN_GROWS = 0.25;
// (reachKm: the speed falls off with the distance from home, e^(−km / reachKm) — pre-state peoples carried their crops
// and beasts far, but not everywhere (developer, 2026-10-31: "things shouldnt spread everywhere that easily"))
export const STRAIN = { speed: 0.4, beastSpeed: 1.0, fitSpeed: [0.08, 0.45], riverCoast: 2.5, beastRiverCoast: 1.8, through: 2, beastThrough: 1.4, seaSpeed: 6, seaHopKm: 280, reachKm: 8000 };
/**
 * The strains of the history's run (hearths.js: an archetype tamed at a centre), spread over the 1° ground `Gm` — each
 * group's (archetype's) together, crowding one another (developer, 2026-10-31: "if some crops (particularly those in a
 * similar like grouping) are all crowding out a space they wont move in"): a strain moves as fast as the hearths' spread
 * where it grows well (its group's fit — or its beast's keeping — × how like its home's the climate is), along rivers and
 * coasts and through farmers (`farm`) faster, across short seas, slower the farther from home (STRAIN.reachKm); where its group grows (fit ≥ STRAIN_GROWS) the first of
 * the group's strains hold the place — up to VARIETIES of them (developer: "there can also be like, more varieties of each
 * like of the crops too, not always just one"), a later one moving in while there is room — and one that comes to a full
 * place stops there, unless it does better there than the best (its fit × e^(−arrival / lateYears): "it wont take over as
 * primary unless it is TRUELY a much better crop"), when it takes the weakest's place and moves on. Where the group cannot grow
 * its strains pass through. Different groups do not crowd one another: wheat and roots both, wherever both grow.
 * Returns { NCROP, strains: [{ id, a, c1 (its home cell), hT, hW (its home's climate) }], per (by archetype: hold, holdT —
 * each cell's holders, up to VARIETIES, and when each came, as arriveByte's bytes; −1 none) }.
 */
export function strainSpreads(Gm, run, farm, G, NCROP, lateYears) {
    const f = Math.round(Gm.deg / G.deg), C = Gm.clim, N = Gm.N, w = Gm.w, h = Gm.h;
    const steps = Gm.steps ??= (() => { const st = new Float64Array(h * 9); for (let j = 0; j < h; j++) for (let dj = -1; dj <= 1; dj++) { const jj = Math.min(h - 1, Math.max(0, j + dj)), kx = kmLat * Math.max(0.02, Math.cos((90 - (Math.min(j, jj) + 0.5 + (dj ? 0.5 : 0)) * Gm.deg) * Math.PI / 180)); for (let di = -1; di <= 1; di++) st[j * 9 + (dj + 1) * 3 + di + 1] = Math.hypot(di * kx, dj * kmLat); } return st; })();
    const strains = run.strains.map((s, id) => {
        const Cn = run.centres[s.centre], j = Math.floor(Math.floor(Cn.cell / G.w) / f), i = Math.floor((Cn.cell % G.w) / f), c1 = j * w + i;
        return { id, a: s.a, c1, hT: C.T[c1], hW: C.W[c1], t0: s.t0 };
    });
    const per = [], byA = new Map();
    for (const S of strains) { if (!byA.has(S.a)) byA.set(S.a, []); byA.get(S.a).push(S); }
    for (const [a, list] of byA) {
        const crop = a < NCROP, fitA = crop ? Gm.fit[a] : Gm.keep[a - NCROP + 1], thr = crop ? STRAIN.through : STRAIN.beastThrough, K = list.length;
        // (each strain's speed into each cell — all but the farmers' boost — and its fit there, worked out once)
        const base = [], fitS = [];
        for (const S of list) {
            const b = new Float32Array(N), fs = new Float32Array(N);
            for (let v = 0; v < N; v++) {
                if (!Gm.land[v]) { b[v] = Gm.seaKm[v] < STRAIN.seaHopKm ? STRAIN.seaSpeed : 0; continue; }
                // (it moves as its group does — the hearths' spread, by the group's fit — so its varieties go where it goes;
                // its home's climate decides only which leads and holds a place)
                fs[v] = fitA[v] * homeMatch(S.hT, S.hW, C.T[v], C.W[v]);
                let x = (crop ? STRAIN.speed : STRAIN.beastSpeed) * (0.03 + 0.97 * sm(STRAIN.fitSpeed[0], STRAIN.fitSpeed[1], fitA[v]));
                if (fitA[v] > 0.3 && (Gm.river[v] || Gm.coast[v])) x *= crop ? STRAIN.riverCoast : STRAIN.beastRiverCoast;
                b[v] = x;
            }
            base.push(b); fitS.push(fs);
        }
        const best = list.map(() => new Float32Array(N).fill(Infinity)), kms = list.map(() => new Float32Array(N));
        // (each cell's holders: up to VARIETIES strains, when each came, and how well each does there)
        const hold = Array.from({ length: VARIETIES }, () => new Int16Array(N).fill(-1)), holdT = Array.from({ length: VARIETIES }, () => new Float32Array(N).fill(Infinity)), holdS = Array.from({ length: VARIETIES }, () => new Float32Array(N));
        const heap = new Heap(1 << 14);
        // (times kept in 32 bits: the queue's keys rounded alike, or a step reads as stale and the spread dies)
        list.forEach((S, k) => { const t0 = Math.fround(S.t0); best[k][S.c1] = t0; heap.push(t0, k * N + S.c1); });
        while (heap.n) {
            const pay = heap.pop(), t = heap.top, k = (pay / N) | 0, v = pay - k * N;
            if (t > best[k][v]) continue;
            const S = list[k];
            // (where the group grows: a place for it while there is room; full, it stops — unless it does better than the best
            // there, when it takes the weakest's place)
            if (Gm.land[v] && fitA[v] >= STRAIN_GROWS) {
                const sc = fitS[k][v] * Math.exp(-Math.min(t, 1e6) / lateYears);
                let free = -1, weak = 0, top = -Infinity;
                for (let r = 0; r < VARIETIES; r++) {
                    if (hold[r][v] < 0) { if (free < 0) free = r; continue; }
                    if (holdS[r][v] > top) top = holdS[r][v];
                    if (holdS[r][v] < holdS[weak][v] || hold[weak][v] < 0) weak = r;
                }
                const at = free >= 0 ? free : sc > top ? weak : -1;
                if (at < 0) continue;
                hold[at][v] = S.id; holdT[at][v] = t; holdS[at][v] = sc;
            }
            const j = (v / w) | 0, i = v - j * w, bk = base[k], bestK = best[k], kmK = kms[k], fric = Math.exp(-kmK[v] / STRAIN.reachKm);
            for (let dj = -1; dj <= 1; dj++) {
                const jj = j + dj;
                if (jj < 0 || jj >= h) continue;
                const row = j * 9 + (dj + 1) * 3 + 1;
                for (let di = -1; di <= 1; di++) {
                    if (!dj && !di) continue;
                    const m = jj * w + (i + di + w) % w, b = bk[m];
                    if (!(b > 0)) continue;
                    const d = steps[row + di], nt = Math.fround(t + d / ((farm[m] <= t && Gm.land[m] ? b * thr : b) * fric));
                    if (nt < bestK[m]) { bestK[m] = nt; kmK[m] = kmK[v] + d; heap.push(nt, k * N + m); }
                }
            }
        }
        const bytes = arr => { const o = new Uint8Array(N); for (let c = 0; c < N; c++) o[c] = arriveByte(arr[c]); return o; };
        per[a] = { hold, holdT: holdT.map(bytes) };
    }
    return { NCROP, strains, per };
}
/** A strain's fit at a 1° cell: its group's fit (or its beast's keeping) × its home match. */
export const strainFit = (Gm, S, NCROP, c) => (S.a < NCROP ? Gm.fit[S.a][c] : Gm.keep[S.a - NCROP + 1][c]) * homeMatch(S.hT, S.hW, Gm.clim.T[c], Gm.clim.W[c]);
/** At most this many strains of one group at a place: its main variety, then a second and a third. */
export const VARIETIES = 3;
/**
 * The crop groups (or beasts) at a 1° cell at an age (a byte; ARRIVE_NEVER − 1 all that ever came; −1 the same, for the best
 * possible), ranked, each with its strains: its holder then (strainSpreads: the first to come, or the one that took it
 * over by then) and its other varieties that had come (at most VARIETIES in all) — every group that grows there and had
 * come (developer, 2026-10-31: "if somewhere can grow wheat and root, they should always have both"); the groups ranked by
 * their holder's fit × e^(−arrival / lateYears). Returns [{ a, score, strains: [{ id, score, fit, t }] }], crops and beasts
 * apart (`beasts`).
 */
export function rankStrains(SP, Gm, c, ageByte, beasts, lateYears) {
    const ab = ageByte < 0 ? ARRIVE_NEVER - 1 : ageByte, out = [];
    const item = (id, b) => { const S = SP.strains[id], fit = strainFit(Gm, S, SP.NCROP, c), t = byteYears(b); return { id, score: fit * Math.exp(-Math.min(t, 1e6) / lateYears), fit, t }; };
    for (let a = beasts ? SP.NCROP : 0; a < (beasts ? SP.per.length : SP.NCROP); a++) {
        const P = SP.per[a];
        if (!P) continue;
        const list = [];
        for (let r = 0; r < VARIETIES; r++) { const id = P.hold[r][c], b = P.holdT[r][c]; if (id >= 0 && b <= ab) list.push(item(id, b)); }
        if (!list.length) continue;
        list.sort((x, y) => y.score - x.score);
        out.push({ a, score: list[0].score, strains: list });
    }
    return out.sort((x, y) => y.score - x.score);
}
/**
 * The ranks at an age on every 1° cell: `crop` and `beast` (Int16Array × 3: the leading strain of the first, second and
 * third group there; −1 none), and `group` (each archetype's leading strain there: Int16Array per archetype) — once per
 * spreads and age.
 */
export function strainRanks(SP, Gm, ageByte, lateYears, NA) {
    const N = Gm.N, mk = () => [0, 1, 2].map(() => new Int16Array(N).fill(-1)), crop = mk(), beast = mk(), group = Array.from({ length: NA }, () => new Int16Array(N).fill(-1));
    for (let c = 0; c < N; c++) {
        if (!Gm.land[c]) continue;
        for (const [list, out] of [[rankStrains(SP, Gm, c, ageByte, false, lateYears), crop], [rankStrains(SP, Gm, c, ageByte, true, lateYears), beast]]) {
            for (let r = 0; r < 3 && r < list.length; r++) out[r][c] = list[r].strains[0].id;
            for (const G of list) group[G.a][c] = G.strains[0].id;
        }
    }
    return { crop, beast, group };
}

/**
 * What the farmed places grow at an age (a byte of arriveByte; ARRIVE_NEVER: all that ever came; -1 the best possible:
 * every crop this world grows, wherever it fits) — per 1° cell: each kind's count of crops grown (fit ≥ GROWN_FIT and come,
 * on land farming had reached), the leading pulse and spice (the best-fitting come; -1 none), and each crop's share of the
 * land (by area); `staples` (a count per cell of the staple crop groups grown) adds to the variety.
 */
export function minorAt(Gm, items, built, farm, ageByte, ageYears, staples = null) {
    const N = Gm.N, NK = KINDS.length, count = Array.from({ length: NK }, () => new Uint8Array(N)), variety = new Uint8Array(N);
    const leadPulse = new Int16Array(N).fill(-1), leadSpice = new Int16Array(N).fill(-1), share = new Float64Array(items.length), best = ageByte < 0;
    let landArea = 0;
    const live = items.filter(I => built[I.id].exists);
    for (let c = 0; c < N; c++) {
        if (!Gm.land[c]) continue;
        landArea += Gm.area[c];
        if (!best && !(farm[c] <= ageYears && farm[c] < Infinity)) continue;
        let pf = 0, sf = 0, n = 0;
        for (const I of live) {
            const f = I.fit8[c];
            if (f < GROWN_FIT || (!best && built[I.id].arrive[c] > ageByte)) continue;
            count[I.k][c] = Math.min(255, count[I.k][c] + 1); n++;
            share[I.id] += Gm.area[c];
            if (I.kind === 'pulse' && f > pf) { pf = f; leadPulse[c] = I.id; }
            if (I.kind === 'spice' && f > sf) { sf = f; leadSpice[c] = I.id; }
        }
        variety[c] = Math.min(255, n + (staples ? staples[c] : 0));
    }
    for (let k = 0; k < share.length; k++) share[k] /= Math.max(1, landArea);
    return { count, variety, leadPulse, leadSpice, share };
}
