// Cradles and people (plans/V2_FARMING_PLAN.md C3; Madeline James's culture series, Part 4, after James C. Scott's
// Against the Grain and Carneiro's circumscription): where the first states could rise, and how many people the land
// could feed. From a finished moment's farming picture (farming/farming.js farmPlace, per pixel), with the techniques
// chosen:
//   · PEOPLE — the land's potential, pre-industrial: ~80 people a km² for each good harvest a year's worth of food
//     (Roman Egypt's strip ~150–200, medieval France's farmland ~60), a few on herders' pasture;
//   · CRADLES — her conditions for a first state, multiplied, over a HEARTLAND of any size (~150, 300 or 600 km across
//     its reach — the likeliest kept): a CRITICAL MASS of people fed by a TAXABLE GRAIN (rice best, then wheat and
//     barley, maize; tubers hardly — they cannot be measured, stored and taxed) — a state needs hundreds of thousands to
//     rule (polity population the main driver of state formation, Turchin et al. on Seshat; Egypt at unification
//     ~0.9 million, Butzer); NAVIGABLE WATER (a big river, or a coast) by most of that grain, to move it and rule by;
//     WALLED IN — the land beyond the heartland (out to twice its reach) desert, mountains, sea or steppe, not more
//     farmland and forest, so the farmers cannot slip away (Carneiro 1970); and, likely, HERDERS there (her nomadic
//     "twins"). The likeliest places, far apart, are the sites: numbered, and said why.
// What the land could support — not who would live there, nor what they would make of it.

import { farmPlace, decHarvests, Staple, STAPLE_WORDS, CROPS } from './farming.js';
import { FARMING } from './farming-config.js';
import { LatLonGrid } from '../finish/finish-grid.js';
import { KOPPEN_ID } from '../climate/koppen.js';

const KM_PER_DEG = 6371 * Math.PI / 180;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const S = (r, x) => smooth(r[0], r[1], x);

export const CRADLE = {
    peoplePerFood: 60,          // people a km² a good harvest a year feeds (food 1: a good grain harvest on good flat ground —
                                // Roman Egypt's strip, two harvests' worth, ~120; medieval France's farmland ~45)
    peoplePerPasture: 2,        // …and herders' pasture (full: a steppe's)
    taxable: [0, 1, 0.9, 0.75, 0.3, 0],     // how taxable each staple's food is (NONE, rice, wheat, maize, roots, herding)
    heartKm: [150, 300, 600],   // the heartland: the land within this of a place (each tried, the likeliest kept)…
    mass: [2.5e5, 2.5e6],       // …its people fed by taxable grain (potential, each staple's food × its taxability) from a
                                // big chiefdom's to a state's critical mass, on a log scale (Egypt's Nile could feed ~3–5
                                // million, ~0.9 million at unification; Uruk-period Sumer a dozen cities of tens of thousands)
    dense: [3, 12],             // …and close enough to rule: its people a km² of its land (deserts and mountains counted, the
                                // sea not) from thin to a heartland's — a vast thin land is not one
    localKm: 60,                // the place itself: the grain land this near…
    local: [0.04, 0.25],        // …its taxable food a km² (sea and barren counting nothing) from little to plenty
    spread: 0.886,              // a heartland's likelihood shared by its grain land out to its reach (a square this share of
                                // it each way — a disc's area)…
    soften: 0.25,               // …its edge softened over this share of it
    ringKm: 300,                // the land beyond the heartland, this far beyond its reach…
    barrier: { barren: 1, steep: 0.8, sea: 0.5, herd: 0.3 },   // …each kind of ground's worth as a wall: desert, ice and bare
                                // rock; mountains; the sea (boats and fish are ways out); herders' steppe (people fled to it)
    walled: [0.35, 0.8],        // walled in as the walls are this share of it (farmland and forest: ways out)
    worked: [0.6, 1],           // a heartland fed by works that need organising — water brought, terraces, raised fields —
                                // this much likelier than one fed by rain alone (from the first, all rain, to the second, all works)
    river: [0.15, 0.5],         // navigable water: the heartland's grain this share on a big river's floodplain…
    coastKm: 60,                // …or by the sea (the sea within this…
    coastSea: [0.05, 0.3],      // …this share of the land around: a coast — calmer the more enclosed: not modelled)…
    coast: [0.15, 0.5],         // …this share of it…
    coastShare: 0.7,            // …a coast counting this much of a river
    nomads: [0.03, 0.25],       // herders on this share of the land beyond, a bonus of up to…
    nomadBonus: 0.25,           // …this
    siteMin: 0.2,               // a site: a place this likely or more…
    siteKm: 800,                // …and the likeliest within this
    sites: 8,                   // at most this many
    gridDeg: 0.5,
    sampleW: 1440,              // the farming picture read about this many pixels wide (0.25°)
};

/**
 * The cradles of a finished moment's farming picture `F` (raster.farming) and land `L` (raster.climate: its Köppen
 * classes mark the land), with the techniques `tech`. @returns {{grid: LatLonGrid, cradle: Float32Array (0…1, on the
 * grid), mass: Float32Array (the likeliest heartland's people fed by taxable grain), reach: Uint8Array (its reach,
 * an index into heartKm), sites: Array<{lat, lon, score, staple, people, km, river, coast, sea, desert, mountains,
 * nomads}>, people: number (the whole land's, pre-industrial), land: number (km²)}}
 */
export function cradleMap(F, L, tech, C = CRADLE, K = FARMING) {
    const g = new LatLonGrid(C.gridDeg), N = g.size, kef = KOPPEN_ID.EF;
    const area = new Float64Array(N), sea = new Float64Array(N), land = new Float64Array(N), food = new Float64Array(N), rainFood = new Float64Array(N), tax = new Float64Array(N), herd = new Float64Array(N);
    const barren = new Float64Array(N), steep = new Float64Array(N), riverTax = new Float64Array(N), byStaple = Array.from({ length: 4 }, () => new Float64Array(N));
    const p = {}, e = new Float64Array(2 * CROPS.length), r = {}, n = 2 * CROPS.length, foodOf = F => F * K.farmHalf / Math.max(1e-6, 1 - F);
    // (the picture read about C.sampleW pixels wide: each sample stands for its stride × stride pixels)
    const stride = Math.max(1, Math.ceil(F.w / C.sampleW)), R = 6371, pxKm2 = (2 * Math.PI * R / F.w) * (Math.PI * R / F.h);
    let people = 0, landKm2 = 0;
    for (let y = 0; y < F.h; y += stride) {
        const lat = 90 - (y + 0.5) / F.h * 180, cl = Math.cos(lat * Math.PI / 180), a = cl * stride * stride;
        for (let x = 0; x < F.w; x += stride) {
            const i = y * F.w + x, lon = (x + 0.5) / F.w * 360 - 180, c = g.index(lat, lon);
            area[c] += a;
            if (!L.koppen[i]) { sea[c] += a; continue; }
            landKm2 += a * pxKm2; land[c] += a;
            if (L.koppen[i] === kef) { barren[c] += a; continue; }
            p.soil = F.soil[i] / 255; p.flood = F.flood[i] / 255; p.canal = F.canal[i] / 255; p.slope = 2 * F.slope[i]; p.wetland = F.wetland[i] / 255;
            if (F.crops) for (let k = 0; k < n; k++) e[k] = decHarvests(F.crops[n * i + k]); else e.fill(0);
            farmPlace(p, e, F.pasture[i] / 255, tech, r, K);
            const crop = r.staple && r.staple !== Staple.HERDING, v = crop ? foodOf(r.tech) : 0;
            people += a * pxKm2 * Math.max(C.peoplePerFood * v, r.staple === Staple.HERDING ? C.peoplePerPasture * r.score : 0);
            food[c] += a * v; rainFood[c] += a * (crop ? Math.min(v, foodOf(r.rain)) : 0);
            tax[c] += a * v * C.taxable[r.staple];
            if (crop) byStaple[r.staple - 1][c] += a * v * C.taxable[r.staple];
            if (r.staple === Staple.HERDING) herd[c] += a;
            else if (!(v > 0.1)) barren[c] += a;
            if (p.slope >= 30) steep[c] += a;
            if (p.flood >= 0.3) riverTax[c] += a * v * C.taxable[r.staple];
        }
    }
    // (each a share of the grid cell's whole area — the sea and the barren counting nothing — then read near and around: the
    // land within r km a Gaussian of σ = r/√2, the same area; the land beyond, from r to r + ringKm, the difference of two)
    const share = f => { const o = new Float32Array(N); for (let c = 0; c < N; c++) o[c] = area[c] > 0 ? f[c] / area[c] : 0; return o; };
    const within = (f, km) => g.blur(f, km / Math.SQRT2), B = C.barrier, ring = (inner, outer, ri, ro) => (ro * ro * outer - ri * ri * inner) / (ro * ro - ri * ri);
    const taxS = share(tax), landS = share(land), localTax = within(taxS, C.localKm), coastal = within(share(sea), C.coastKm);
    const coastTax = new Float32Array(N);
    for (let c = 0; c < N; c++) coastTax[c] = taxS[c] * S(C.coastSea, coastal[c]);
    const wall = new Float32Array(N), herdS = share(herd);
    for (let c = 0; c < N; c++) wall[c] = area[c] > 0 ? (B.barren * barren[c] + B.steep * steep[c] + B.sea * sea[c] + B.herd * herd[c]) / area[c] : 0;
    // (the walls and the herders within each reach — a heartland's and the ring beyond it)
    const reaches = [...new Set(C.heartKm.flatMap(km => [km, km + C.ringKm]))], wallIn = new Map(), herdIn = new Map();
    for (const km of reaches) { wallIn.set(km, within(wall, km)); herdIn.set(km, within(herdS, km)); }
    const foodS = share(food), rainS = share(rainFood), riverS = share(riverTax);
    // (a place's own likelihood — a heartland's centre — and its land's: the likeliest heartland it lies in)
    const here = new Float32Array(N), centre = new Float32Array(N), mass = new Float32Array(N), reach = new Uint8Array(N), cradle = new Float32Array(N), q = new Float32Array(N);
    for (let c = 0; c < N; c++) here[c] = S(C.local, localTax[c]);
    C.heartKm.forEach((hk, k) => {
        const heartTax = within(taxS, hk), heartLand = within(landS, hk), heartFood = within(foodS, hk), heartRain = within(rainS, hk), heartRiver = within(riverS, hk), heartCoast = within(coastTax, hk);
        const ro = hk + C.ringKm, wIn = wallIn.get(hk), wOut = wallIn.get(ro), hIn = herdIn.get(hk), hOut = herdIn.get(ro), km2 = Math.PI * hk * hk;
        q.fill(0);
        for (let c = 0; c < N; c++) {
            const t = heartTax[c];
            if (!(t > 0) || !(here[c] > 0)) continue;
            // a critical mass fed by taxable grain, close enough to rule; walled in (the land beyond mostly desert, mountains,
            // sea or steppe — not farmland and forest to slip away to); fed by works that need organising; most of its grain
            // on navigable water; herders beyond; and the place itself in its grain land
            const people = C.peoplePerFood * t * km2, size = smooth(Math.log(C.mass[0]), Math.log(C.mass[1]), Math.log(people)) * S(C.dense, people / Math.max(1, km2 * heartLand[c]));
            const walled = S(C.walled, Math.min(1, ring(wIn[c], wOut[c], hk, ro)));
            const worked = C.worked[0] + (C.worked[1] - C.worked[0]) * Math.max(0, Math.min(1, 1 - heartRain[c] / Math.max(1e-9, heartFood[c])));
            const water = Math.max(S(C.river, heartRiver[c] / t), C.coastShare * S(C.coast, heartCoast[c] / t));
            const twin = 1 + C.nomadBonus * S(C.nomads, ring(hIn[c], hOut[c], hk, ro));
            q[c] = Math.min(1, size * walled * worked * water * twin * here[c]);
            if (q[c] > centre[c]) { centre[c] = q[c]; mass[c] = people; reach[c] = k; }
        }
        // (its heartland shares it — its grain land, out to its reach, the edge softened)
        const spread = g.blur(g.maxWithin(q, C.spread * hk), C.soften * hk);
        for (let c = 0; c < N; c++) cradle[c] = Math.max(cradle[c], centre[c], spread[c] * here[c]);
    });
    // the sites: the likeliest places, each the likeliest within C.siteKm
    const sites = [];
    const order = Array.from({ length: N }, (_, c) => c).filter(c => centre[c] >= C.siteMin).sort((a, b) => centre[b] - centre[a]);
    for (const c of order) {
        const j = Math.floor(c / g.w), i = c % g.w, lat = 90 - (j + 0.5) * C.gridDeg, lon = -180 + (i + 0.5) * C.gridDeg;
        if (sites.some(s => greatKm(s.lat, s.lon, lat, lon) < C.siteKm)) continue;
        // (what it grows: the staple with the most taxable food in its heartland; its water and walls, counted there)
        const hk = C.heartKm[reach[c]], tot = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        // tot: the staples' taxable food 0–3, the heartland's taxable food 4, on a big river 5, coastal 6; beyond it: area 7,
        // sea 8, barren 9, steep 10 — and herders, below
        let herdOut = 0;
        const dj = Math.ceil((hk + C.ringKm) / (KM_PER_DEG * C.gridDeg));
        for (let jj = Math.max(0, j - dj); jj <= Math.min(g.h - 1, j + dj); jj++) {
            const la = 90 - (jj + 0.5) * C.gridDeg, di = Math.min(g.w >> 1, Math.ceil((hk + C.ringKm) / (KM_PER_DEG * C.gridDeg * Math.max(0.05, Math.cos(la * Math.PI / 180)))));
            for (let d = -di; d <= di; d++) {
                const ii = ((i + d) % g.w + g.w) % g.w, cc = jj * g.w + ii, km = greatKm(lat, lon, la, -180 + (ii + 0.5) * C.gridDeg);
                if (km <= hk) {
                    for (let s = 0; s < 4; s++) tot[s] += byStaple[s][cc];
                    tot[4] += tax[cc]; tot[5] += riverTax[cc]; tot[6] += coastTax[cc] * area[cc];
                } else if (km <= hk + C.ringKm) { tot[7] += area[cc]; tot[8] += sea[cc]; tot[9] += barren[cc]; tot[10] += steep[cc]; herdOut += herd[cc]; }
            }
        }
        const staple = 1 + tot.indexOf(Math.max(...tot.slice(0, 4))), out = Math.max(1e-9, tot[7]);
        const onRiver = S(C.river, tot[5] / Math.max(1e-9, tot[4])), byCoast = C.coastShare * S(C.coast, tot[6] / Math.max(1e-9, tot[4]));
        sites.push({ lat, lon, score: centre[c], staple, people: mass[c], km: hk, river: onRiver >= byCoast && onRiver > 0, coast: tot[6] / Math.max(1e-9, tot[4]) >= C.coast[0],
            sea: tot[8] / out, desert: tot[9] / out, mountains: tot[10] / out, nomads: herdOut / out >= C.nomads[0] });
        if (sites.length >= C.sites) break;
    }
    return { grid: g, cradle, mass, reach, sites, people, land: landKm2 };
}

function greatKm(la1, lo1, la2, lo2) {
    const d = Math.PI / 180, x = Math.sin((la2 - la1) * d / 2) ** 2 + Math.cos(la1 * d) * Math.cos(la2 * d) * Math.sin((lo2 - lo1) * d / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(x)));
}

/** A site in words: what it grows, its water, what walls it in, its herders, its heartland's people. */
export function siteWords(s) {
    const walls = [['the sea', s.sea], ['desert', s.desert], ['mountains', s.mountains]].filter(([, v]) => v >= 0.2).sort((a, b) => b[1] - a[1]).map(([w]) => w);
    const water = s.river ? 'on a great river' : s.coast ? 'on a coast' : 'inland';
    return `${STAPLE_WORDS[s.staple]} ${water}${walls.length ? `, walled in by ${walls.join(' and ')}` : ''}${s.nomads ? '; herders near' : ''}` +
        ` — ${peopleWords(s.people)} could live on its grain within ${s.km} km`;
}

/** The site (its index in map.sites) whose heartland holds a place — the nearest for its reach — or -1. */
export function siteAt(map, lat, lon) {
    let best = -1, near = 1;
    map.sites.forEach((s, k) => { const d = greatKm(s.lat, s.lon, lat, lon) / s.km; if (d <= near) { near = d; best = k; } });
    return best;
}

/** A head count in words: "2.4 million", "350 thousand". */
export function peopleWords(n) {
    return n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)} million` : `${Math.max(10, Math.round(n / 1e4) * 10)} thousand`;
}

/** Potential people a km² at a place from farmPlace's out (pre-industrial). */
export function peopleAt(r, C = CRADLE, K = FARMING) {
    if (r.staple === Staple.HERDING) return C.peoplePerPasture * r.score;
    const v = r.staple ? r.tech * K.farmHalf / Math.max(1e-6, 1 - r.tech) : 0;
    return C.peoplePerFood * v;
}
