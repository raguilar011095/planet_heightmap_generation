// Hearths and the spread, in years (plans/V2_FOOD_PLAN.md §4.2–4.3, F3b): on the history's ground (farming/history.js) —
//   · CANDIDATE REGIONS — the hearth odds' local peaks ~300 km apart, and the hearts of the herders' beasts' wild ranges
//     (horse, camel, reindeer: tamed at the herders' fringe, not by farmers);
//   · IGNITION — each region's wild crops domesticated at dates drawn at random (exponential), at a rate set by its odds³ and
//     its larder (~45 first ignitions in 8,000 years over the planet, shared out); 2–4 FOUNDERS — the likeliest regions,
//     far apart (≥ 3,500 km) and leading with different crops — start within ~1,500 years (developer: "a couple of varied
//     and far apart croplands that start relatively early");
//   · KNOW-HOW — once farming is in a region (its own or arriving) its other wild crops and beasts follow sooner (developer:
//     "once the first is domesticated others start more quickly": ~1,200 / niche² years, beasts ~1,500); news of farming
//     outruns the crops — a region within ~700 km of a new hearth becomes a receiver ~400 years on (Larson 2014: independent
//     centres had no farming neighbours when they began);
//   · RECEIVERS, NOT RIVALS — a candidate farming reaches before its own date never starts on its own: it adopts (and still
//     tames what the arriving package lacks: secondary domestication) — so the count and spacing of hearths emerge;
//   · THE SPREAD — one search in years per archetype (Dijkstra on the 0.5° grid): ~0.55 km a year over land it grows on
//     (slower where it barely grows), ×2.5 along rivers and coasts, ×2 through farmers, slower past rich foragers (Fort's
//     √(1 − m)), short sea hops (≤ ~280 km from land), never the open ocean; beasts by where they are kept (the fly's toll on
//     its landmasses); the herders' beasts ~2,000 years after farming came near them, ~3,500 after the world's first.
// Seeded: one stream per mechanism (ignition, founders, know-how, beasts, the herders'), from the world's seed, the moment's
// time and a re-roll. Times in years after the first farming anywhere (tFirst).

import { ARCHETYPES, beastArchetype, Heap, mix } from './history.js';
import { BEASTS, Beast } from './beasts.js';
import { CROPS } from './farming.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const S = (r, x) => smooth(r[0], r[1], x);

export const HEARTHS = {
    regionKm: 300,              // candidates: the hearth odds' local peaks this far apart…
    regionOdds: 0.15,           // …at least this (against the planet's best)
    beastHeart: 0.5,            // the herders' beasts' own regions: their wild range's heart (a niche this good, a peak ~330 km
    beastRegionKm: 330,         // round), away from the farmers' candidates
    nicheKm: 165,               // a region's larder read this far round its centre…
    ownKm: 110,                 // …and its own land this far
    worldRate: 15 / 8000,       // first ignitions a year over the planet (shared by odds³ × larder): ~8 hearths, at most 12
    knowRate: 1 / 1200,         // once farming is in a region: each other wild crop tamed at this rate × niche²…
    beastRate: 1 / 1500,        // …each beast at this…
    knowYears: 200,             // …from this long after (the crops) …
    beastYears: 300,            // …and this (the beasts)
    directRate: 1 / 2500,       // the herders' beasts at this × niche²: from directYears after farming came near…
    directYears: 2000,
    worldYears: 3500,           // …and anywhere from this long after the world's first farming
    founders: [2, 4],           // 2–4 founders, one more for each foundersKm2 of land…
    foundersKm2: 4e7,
    foundersKm: 3500,           // …this far apart…
    founderFirst: [100, 1500],  // …their first crop between these years
    founderNiche: 0.16,         // (founders take up more of their larder: from this niche, at least founderPace's pace)
    founderPace: 0.45,
    tame: 0.25,                 // a region tames a wild crop with a niche this good or better (a beast 0.35)
    tameBeast: 0.35,
    maxHearths: 12,             // at most this many hearths begin on their own (developer, 2026-10-31: "cap it at like 12 and skew it
                                // closer to like 8 on average and spread them out") — later candidates wait for farming to come…
    hearthsAim: 8,              // …about this many on average, spread over the world "evenly, weighted by likelihood" (developer):
    hearthSpread: 0.6,          // none begins within this share of the even spacing — √(the farmable land ÷ hearthsAim) — of one
                                // already begun: likelier places ignite sooner and claim their room, the rest of the world's
                                // farmable land is left to others
    contactKm: 700,             // news of a new hearth: regions this near become receivers…
    contactYears: 400,          // …this long after
    speed: 0.4,                 // km a year over land a crop grows on (with rivers, coasts and farmers ~1 km a year: Fort 2026)…
    beastSpeed: 1.6,            // …a beast is kept on (developer, 2026-11-01: "animals also spread more" — with herders and farmers alike)
    fitSpeed: [0.08, 0.45],     // (the speed as its fit there runs from this to this: 3 % of it where it barely grows)
    riverCoast: 3,              // × along coasts (the beasts' 1.8)…
    river: 4,                   // …and along a river's way — a big river's plain, or a river's strip through dry land (developer,
                                // 2026-11-01: along rivers in deserts "super quick": the valley the only way on, carried by boat;
                                // the Danube's first farmers ~4 km a year); a smaller stream's land the coasts' 2.5
    through: 2,                 // × through farmers (the beasts' 1.4)
    richSlow: [0.25, 1.4],      // slower past foragers as rich as this to this (people a km²): √(1 − 0.8 × …)
    seaSpeed: 6,                // km a year across the sea…
    seaHopKm: 280,              // …within this of land…
    laneSpeed: 15,              // …and along the coast by boat, within laneKm of it (developer, 2026-11-01: "growth along ocean
    laneKm: 120,                // coasts can be further" — the Mediterranean's first farmers, the Austronesians: coasts the fast way)
    farmFit: 0.25,              // farming has come to a place when a crop that fits it this well has
    likeT: 6, likeW: 1.6,       // a crop's strain spreads slower where the climate is unlike its hearth's — e^(−(ΔT / likeT)² − (ln(W / W₀) /
    likeFloor: 0.05,            // likeW)²), down to likeFloor of its pace, at sea the coast's (developer, 2026-11-01: cool-season grains "shut out" — a
                                // tropical yam hearth's roots crossed into temperate Europe ahead of the Fertile Crescent's wheat
                                // and, first come, led there; Earth's packages crossed climates slowly: Diamond's east–west axis)
    adoptKm: 700,               // a region whose crop or beast had already come near adopts it rather than taming its own: likelier
                                // the nearer it came, e^(−(km / this)²) (developer, 2026-11-01: "we generally dont need multiple
                                // variants of the same crop species" — a rice tamed in every rice-growing region gave ~18 a world)…
    adoptBeastKm: 2000,         // …a beast from much farther (developer: animals "should have less types of domestication per animal
                                // group": Earth's from one to three centres each — cattle, buffalo two — then spread far)…
    adoptBeastMass: 0.75,       // …and, once tamed anywhere on its landmass, a region there adopts it at least this often
    capYears: 80000,            // the search stops this long after the first farming
};
// (the herders' beasts; and the fly's toll on each beast's keeping — beasts.js beastKeep's last factor)
const DIRECTED = new Set([Beast.HORSE, Beast.CAMEL, Beast.DEER]);
const FLY_TOLL = BEASTS.map((_, b) => ({ [Beast.GRAZER]: 0.85, [Beast.SMALL_STOCK]: 0.3, [Beast.HORSE]: 0.95, [Beast.BUFFALO]: 0.85 })[b] ?? 0);
const NC = CROPS.length, NA = ARCHETYPES.length, NB = BEASTS.length;
const kmLat = deg => 111.32 * deg;
const gcKm = (la1, lo1, la2, lo2) => {
    const r = Math.PI / 180, a = Math.sin((la2 - la1) * r / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin((lo2 - lo1) * r / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
};

/** Each cell within a window round (j, i): `rows` rows each way, as many columns as the same distance allows. */
function eachNear(G, c, rows, f) {
    const { w, h, deg } = G, j = (c / w) | 0, i = c - j * w;
    for (let dj = -rows; dj <= rows; dj++) {
        const jj = j + dj;
        if (jj < 0 || jj >= h) continue;
        const span = Math.min(w >> 1, Math.round(rows / Math.max(0.2, Math.cos((90 - (jj + 0.5) * deg) * Math.PI / 180))));
        for (let di = -span; di <= span; di++) if (f(jj * w + (i + di + w) % w, dj, di) === false) return;
    }
}

/**
 * The candidate regions of a history's ground `G` (once per moment): [{ r, cell, lat, lon, score, beastOnly, mass, niche
 * (by archetype) }] and regionOf (each cell's region, -1 none).
 */
export function hearthRegions(G, Hh = HEARTHS) {
    const { w, h, deg, land, odds, niche } = G, N = w * h, rows = Math.max(1, Math.round(Hh.regionKm / kmLat(deg)));
    const cand = [], beastOnly = new Set();
    for (let c = 0; c < N; c++) {
        if (!land[c] || !(odds[c] >= Hh.regionOdds)) continue;
        let top = true;
        eachNear(G, c, rows, q => { if (q !== c && (odds[q] > odds[c] || (odds[q] === odds[c] && q < c))) { top = false; return false; } });
        if (top) cand.push(c);
    }
    // (the herders' beasts' own regions: their wild range's heart, away from the farmers' candidates)
    const bRows = Math.max(1, Math.round(Hh.beastRegionKm / kmLat(deg))), near = Math.max(1, Math.round(rows * 0.6));
    for (const b of DIRECTED) {
        const f = niche[beastArchetype(b)];
        for (let c = 0; c < N; c++) {
            if (!land[c] || f[c] < Hh.beastHeart) continue;
            let top = true;
            eachNear(G, c, bRows, q => { if (q !== c && (f[q] > f[c] || (f[q] === f[c] && q < c))) { top = false; return false; } });
            if (!top) continue;
            let close = false;
            eachNear(G, c, near, q => { if (cand.includes(q)) { close = true; return false; } });
            if (!close && !cand.includes(c)) { cand.push(c); beastOnly.add(c); }
        }
    }
    const regionOf = new Int32Array(N).fill(-1), nRows = Math.max(1, Math.round(Hh.nicheKm / kmLat(deg))), oRows = Math.max(1, Math.round(Hh.ownKm / kmLat(deg)));
    const regions = cand.map((c, r) => ({ r, cell: c, lat: 90 - (Math.floor(c / w) + 0.5) * deg, lon: -180 + (c % w + 0.5) * deg, score: beastOnly.has(c) ? 0 : odds[c], beastOnly: beastOnly.has(c), mass: G.mass[c], niche: new Float32Array(NA) }));
    for (const R of regions) {
        const best = new Float32Array(NA), mean = new Float32Array(NA);
        let k = 0;
        eachNear(G, R.cell, nRows, q => {
            if (!land[q]) return;
            k++;
            for (let a = 0; a < NA; a++) { const v = niche[a][q]; if (v > best[a]) best[a] = v; mean[a] += v; }
        });
        // (a crop's at its best there — a few hills will do; a beast's over the region — a herd needs its range)
        for (let a = 0; a < NA; a++) R.niche[a] = a < NC ? 0.7 * best[a] + 0.3 * mean[a] / Math.max(1, k) : 0.3 * best[a] + 0.7 * mean[a] / Math.max(1, k);
        eachNear(G, R.cell, oRows, q => { if (land[q] && regionOf[q] < 0) regionOf[q] = R.r; });
    }
    return { regions, regionOf };
}

/**
 * The history, once per moment, re-roll and Fewer gaps: on the ground `G` with its regions (`H`: hearthRegions'), each
 * landmass's luck (history.js historyLuck's), from the world's `seed`, the moment's `time` and the re-roll `roll`.
 * @returns {{ tFirst, centres: [{ id, cell, lat, lon, t0, founder, primary, root (its primary hearth's id), hearth (1… for the
 *   primary), items: [{ a, t }] }], hearths (the primary centres), strains: [{ a, centre, t0 }],
 *   best: Float64Array[] (each archetype's arrival, years), lab: Int16Array[] (its strain there), farmTime (when farming came),
 *   farmFrom (from which centre), beastTime, events }} — times in years after tFirst; Infinity where never.
 */
export function runHearths(G, H, luck, seed, time, roll = 0, Hh = HEARTHS) {
    const { w, h, deg, land } = G, N = w * h, { regions, regionOf } = H, NR = regions.length;
    const base = mix(seed | 0, Math.round((time ?? 0) * 1000), roll | 0, 0x4ea7);
    // (a uniform draw in (0, 1) for a mechanism's stream and a region — its centre's cell, the same at every detail)
    const draw = (stream, key) => (mix(base, stream, key) + 0.5) / 4294967296;
    const has = (m, b) => m >= 0 && luck.has[m * NB + b] === 1, flyAt = v => (G.mass[v] >= 0 ? luck.fly[G.mass[v]] : 0) * G.flyCould[v];
    const best = Array.from({ length: NA }, () => new Float64Array(N).fill(Infinity)), lab = Array.from({ length: NA }, () => new Int16Array(N).fill(-1));
    const done = Array.from({ length: NA }, () => new Uint8Array(N)), farmTime = new Float64Array(N).fill(Infinity), farmFrom = new Int16Array(N).fill(-1), beastTime = new Float64Array(N).fill(Infinity);
    const strains = [], heap = new Heap(1 << 18), domT = Array.from({ length: NA }, () => new Float64Array(NR).fill(Infinity));
    const regFarm = new Float64Array(NR).fill(Infinity), regBeast = new Float64Array(NR).fill(Infinity), regCentre = new Int32Array(NR).fill(-1), centres = [], primaries = [];
    const bestCrop = R => { let m = 0; for (let a = 0; a < NC; a++) if (R.niche[a] > m) m = R.niche[a]; return m; };
    let rawSum = 0;
    const raw = regions.map(R => { const b = bestCrop(R); const v = !R.beastOnly && b >= Hh.tame ? R.score ** 3 * b : 0; rawSum += v; return v; });
    const lam = (a, R) => (rawSum > 0 ? raw[R.r] / rawSum * Hh.worldRate : 0) * (R.niche[a] / Math.max(1e-6, bestCrop(R))) ** 2;
    const STEP = 0, DOM = 1, enc = (type, a, idx) => (type << 24) | (a << 18) | idx;
    // ── founders: the likeliest regions, nudged at random, far apart, leading with different crops where they can ──
    let landKm2 = 0;
    for (const m of G.masses) landKm2 += m.area;
    const nF = Math.max(Hh.founders[0], Math.min(Hh.founders[1], Math.round(landKm2 / Hh.foundersKm2) + 1));
    // (the hearths' spacing: a share of the even spacing their aim would have over the land crops fit)
    let farmKm2 = 0;
    const FIT = G.fitRun ?? G.fit;
    for (let c = 0; c < N; c++) if (land[c]) { let f = 0; for (let q = 0; q < NC; q++) if (G.fit[q][c] > f) f = G.fit[q][c]; if (f >= Hh.farmFit) farmKm2 += G.area[c]; }
    const hearthKm = Hh.hearthSpread * Math.sqrt(farmKm2 / Hh.hearthsAim);
    const leadOf = R => { let b = 0; for (let a = 1; a < NC; a++) if (R.niche[a] > R.niche[b]) b = a; return b; };
    const cands = regions.filter(R => raw[R.r] > 0).map(R => ({ R, v: Math.log(raw[R.r]) + 0.8 * -Math.log(-Math.log(draw(700, R.cell))), lead: leadOf(R) })).sort((p, q) => q.v - p.v);
    const founders = [];
    for (const varied of [true, false]) for (const c of cands) {
        if (founders.length >= nF || founders.includes(c)) continue;
        if (founders.some(f => gcKm(f.R.lat, f.R.lon, c.R.lat, c.R.lon) < Hh.foundersKm)) continue;
        if (varied && founders.some(f => f.lead === c.lead)) continue;
        founders.push(c);
    }
    const isFounder = new Uint8Array(NR);
    for (const f of founders) isFounder[f.R.r] = 1;
    // ── the independent dates (crops only: beasts wait for farming); a founder's first crop early ──
    for (const R of regions) for (let a = 0; a < NC; a++) {
        if (R.niche[a] < Hh.tame || !(lam(a, R) > 0)) continue;
        const t = -Math.log(draw(1 + a, R.cell)) / lam(a, R);
        domT[a][R.r] = t; heap.push(t, enc(DOM, a, R.r));
    }
    for (const f of founders) {
        const t = Hh.founderFirst[0] + (Hh.founderFirst[1] - Hh.founderFirst[0]) * draw(710, f.R.cell);
        if (t < domT[f.lead][f.R.r]) { domT[f.lead][f.R.r] = t; heap.push(t, enc(DOM, f.lead, f.R.r)); }
    }
    const date = (a, R, t) => { if (t < domT[a][R.r]) { domT[a][R.r] = t; heap.push(t, enc(DOM, a, R.r)); } };
    // (farming in a region: its other wild crops and beasts follow — sooner the better they grow there)
    const farmingCame = (R, t) => {
        if (regFarm[R.r] <= t) return;
        regFarm[R.r] = t;
        const F = isFounder[R.r];
        for (let a = 0; a < NC; a++) {
            if (R.niche[a] < (F ? Hh.founderNiche : Hh.tame)) continue;
            date(a, R, t + Hh.knowYears + -Math.log(draw(50 + a, R.cell)) / (Hh.knowRate * Math.max(R.niche[a], F ? Hh.founderPace : 0) ** 2));
        }
        for (let b = 1; b < NB; b++) {
            const a = beastArchetype(b);
            if (DIRECTED.has(b) || R.niche[a] < Hh.tameBeast || !has(R.mass, b)) continue;
            date(a, R, t + Hh.beastYears + -Math.log(draw(100 + a, R.cell)) / (Hh.beastRate * R.niche[a] ** 2));
        }
    };
    // (beasts near: the herders' own follow, later)
    const directed = (R, t, years, stream) => {
        for (const b of DIRECTED) {
            const a = beastArchetype(b);
            if (R.niche[a] < Hh.tameBeast || !has(R.mass, b)) continue;
            date(a, R, t + years + -Math.log(draw(stream + a, R.cell)) / (Hh.directRate * R.niche[a] ** 2));
        }
    };
    const beastsCame = (R, t) => { if (regBeast[R.r] <= t) return; regBeast[R.r] = t; directed(R, t, Hh.directYears, 100); };
    // ── the spread's speed into a cell (km a year) ──
    const speed = (a, v, t) => {
        if (!land[v]) { const k = G.seaKm[v]; return k <= Hh.laneKm ? Hh.laneSpeed : k < Hh.seaHopKm ? Hh.seaSpeed : 0; }
        const crop = a < NC, b = crop ? 0 : a - NC + 1;
        const f = crop ? FIT[a][v] : G.keep[b][v] * (1 - FLY_TOLL[b] * flyAt(v));
        let s = (crop ? Hh.speed : Hh.beastSpeed) * (0.03 + 0.97 * S(Hh.fitSpeed, f));
        if (f > 0.3 && (G.river[v] || G.coast[v])) s *= crop ? (G.riverWay?.[v] ? Hh.river : Hh.riverCoast) : 1.8;
        s *= Math.sqrt(Math.max(0.05, 1 - 0.8 * S(Hh.richSlow, G.richness[v])));
        if (farmTime[v] <= t) s *= crop ? Hh.through : 1.4;
        return s;
    };
    // (how near archetype a had come to a region by t: the nearest cell it had reached within ~2.5 × adoptKm, km)
    const tamedOn = Array.from({ length: NA }, () => new Set());              // (each archetype's landmasses it was tamed on)
    const nearRows = Math.max(1, Math.ceil(2.5 * Hh.adoptKm / kmLat(deg))), nearRowsB = Math.max(1, Math.ceil(2.5 * Hh.adoptBeastKm / kmLat(deg)));
    const nearestCome = (a, R, t) => {
        let dn = Infinity;
        const f = best[a];
        eachNear(G, R.cell, a < NC ? nearRows : nearRowsB, q => {
            if (!(f[q] <= t)) return;
            const d = gcKm(R.lat, R.lon, 90 - (Math.floor(q / w) + 0.5) * deg, -180 + (q % w + 0.5) * deg);
            if (d < dn) dn = d;
        });
        return dn;
    };
    const fitAt = (a, v) => (a < NC ? FIT[a][v] : G.keep[a - NC + 1][v] * (1 - FLY_TOLL[a - NC + 1] * flyAt(v)));
    const kmY = kmLat(deg), kmX = new Float64Array(h);
    for (let j = 0; j < h; j++) kmX[j] = kmY * Math.max(0.02, Math.cos((90 - (j + 0.5) * deg) * Math.PI / 180));
    let tFirst = Infinity, events = 0;
    while (heap.n) {
        const pay = heap.pop(), t = heap.top;
        if (t - (tFirst < Infinity ? tFirst : t) > Hh.capYears) break;
        events++;
        const type = pay >>> 24, a = (pay >>> 18) & 63, idx = pay & 0x3ffff;
        if (type === DOM) {
            const R = regions[idx];
            if (domT[a][idx] !== t) continue;                       // (stale: re-dated)
            if (done[a][R.cell] && best[a][R.cell] <= t) continue;   // (it came already: adopted, not tamed)
            if (a >= NC && !has(R.mass, a - NC + 1)) continue;
            // (come near already: adopted, likelier the nearer — a hearth's first crop excepted)
            if (regCentre[idx] >= 0 || regFarm[idx] <= t) {
                const dn = nearestCome(a, R, t), p = Math.max(dn < Infinity ? Math.exp(-((dn / (a < NC ? Hh.adoptKm : Hh.adoptBeastKm)) ** 2)) : 0, a >= NC && tamedOn[a].has(R.mass) ? Hh.adoptBeastMass : 0);
                if (p > 0 && draw(900 + a, R.cell) < p) continue;
            }
            // (a hearth of its own: not past the planet's cap, nor near one begun — it waits for farming, its date cleared so
            // the know-how can date it again when farming comes)
            if (a < NC && regFarm[idx] > t && (primaries.length >= Hh.maxHearths || primaries.some(C => gcKm(C.lat, C.lon, R.lat, R.lon) < hearthKm))) { domT[a][idx] = Infinity; continue; }
            if (regCentre[idx] < 0) {
                regCentre[idx] = centres.length;
                centres.push({ id: centres.length, region: idx, cell: R.cell, lat: R.lat, lon: R.lon, t0: t, primary: a < NC && regFarm[idx] > t, founder: !!isFounder[idx], items: [] });
                if (centres.at(-1).primary) primaries.push(centres.at(-1));
            }
            const C = centres[regCentre[idx]];
            C.items.push({ a, t });
            const s = strains.length;
            strains.push({ a, centre: C.id, t0: t, hT: G.clim.T[R.cell], hW: Math.max(0.02, G.clim.W[R.cell]) });
            tamedOn[a].add(R.mass);
            if (a < NC) {
                const fresh = regFarm[idx] > t;
                if (tFirst === Infinity) { tFirst = t; for (const R2 of regions) directed(R2, t, Hh.worldYears, 200); }
                farmingCame(R, t);
                if (fresh) for (const R2 of regions) if (R2 !== R && !R2.beastOnly && regFarm[R2.r] > t + Hh.contactYears && gcKm(R.lat, R.lon, R2.lat, R2.lon) < Hh.contactKm) farmingCame(R2, t + Hh.contactYears);
            } else beastsCame(R, t);
            if (t < best[a][R.cell]) { best[a][R.cell] = t; lab[a][R.cell] = s; heap.push(t, enc(STEP, a, R.cell)); }
            continue;
        }
        const v = idx;
        if (done[a][v] || t > best[a][v]) continue;
        done[a][v] = 1;
        if (land[v]) {
            const f = fitAt(a, v);
            if (a < NC && f >= Hh.farmFit && t < farmTime[v]) { farmTime[v] = t; farmFrom[v] = strains[lab[a][v]].centre; }
            if (a >= NC && f >= Hh.farmFit && t < beastTime[v]) beastTime[v] = t;
            const r = regionOf[v];
            if (r >= 0) { if (a < NC && f >= Hh.farmFit) farmingCame(regions[r], t); if (a >= NC) beastsCame(regions[r], t); }
        }
        const j = (v / w) | 0, i = v - j * w, s = lab[a][v], hT = a < NC ? strains[s].hT : 0, hW = a < NC ? strains[s].hW : 1;
        for (let dj = -1; dj <= 1; dj++) {
            const jj = j + dj;
            if (jj < 0 || jj >= h) continue;
            const kx = Math.min(kmX[j], kmX[jj]);
            for (let di = -1; di <= 1; di++) {
                if (!dj && !di) continue;
                const m = jj * w + (i + di + w) % w;
                if (done[a][m]) continue;
                let sp = speed(a, m, t);
                if (!(sp > 0)) continue;
                // (a crop: slower into a climate unlike its strain's hearth's)
                if (a < NC && G.clim.W[m] > 0) { const dT = (G.clim.T[m] - hT) / Hh.likeT, dW = Math.log(G.clim.W[m] / hW) / Hh.likeW; sp *= Hh.likeFloor + (1 - Hh.likeFloor) * Math.exp(-(dT * dT + dW * dW)); }
                const nt = t + Math.hypot(di * kx, dj * kmY) / sp;
                if (nt < best[a][m]) { best[a][m] = nt; lab[a][m] = s; heap.push(nt, enc(STEP, a, m)); }
            }
        }
    }
    // (the centres numbered in the order they began; every time after the first farming)
    centres.sort((x, y) => x.t0 - y.t0);
    const renum = new Int16Array(centres.length);
    centres.forEach((C, k) => { renum[C.id] = k; C.id = k; C.t0 -= tFirst; C.items.sort((x, y) => x.t - y.t); for (const it of C.items) it.t -= tFirst; });
    for (const s of strains) { s.centre = renum[s.centre]; s.t0 -= tFirst; }
    for (let v = 0; v < N; v++) { if (farmFrom[v] >= 0) farmFrom[v] = renum[farmFrom[v]]; farmTime[v] -= tFirst; beastTime[v] -= tFirst; }
    for (const f of best) for (let v = 0; v < N; v++) f[v] -= tFirst;
    // (each centre's root: the primary hearth its farming came from — itself, or the root of whatever reached its land first;
    // the primary hearths numbered 1… in the order they began)
    let hearth = 0;
    for (const C of centres) {
        const from = farmFrom[C.cell];
        C.root = C.primary || from < 0 || from >= C.id ? C.id : centres[from].root;
        if (C.primary) C.hearth = ++hearth;
    }
    const hearths = centres.filter(C => C.primary);
    return { tFirst, centres, hearths, strains, best, lab, farmTime, farmFrom, beastTime, events };
}
