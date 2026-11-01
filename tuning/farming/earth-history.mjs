// The domestication history on Earth (plans/V2_FOOD_PLAN.md, Earth tuning): the farmed Earth (earth-world.mjs: its heights,
// its observed climate, its rivers) put through the history's own code — farming/history.js historyGround (the wild larder,
// the hearth odds) and hearths.js (the candidate regions, the hearths, the spread) — with Earth's own luck (its beasts'
// wild ancestors where they lived: all of them in Afro-Eurasia, only the llama's in the Americas, none in Australia, New
// Guinea or Madagascar; the fly in Africa alone), scored against where farming really began (Larson et al. 2014, Purugganan
// & Fuller 2009, Fuller 2011 and later: SW Asia, the Yangtze and the Yellow River, Mesoamerica, the Andes and SW Amazonia,
// New Guinea, eastern North America, the Sahel and Sudan, Ethiopia, India) and where it did not (rich foragers' coasts,
// the wet tropics' cores, the temperate lands farming came to).
// Each continent is read on its own (memory: Earth is not gospel — a rule must transfer to any Earth-like world).
// Usage: node tuning/farming/earth-history.mjs [--runs N] [--png]   (the odds and N re-rolls of the hearths, default 40)

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { earthWorld } from './earth-world.mjs';
import { renderBox, earthBase, OUT } from './render-earth.mjs';
import { historyGround, ARCHETYPES, oddsRank, HISTORY } from '../../v2/js/farming/history.js';
import { gatherGround } from '../../v2/js/farming/living.js';
import { hearthRegions, runHearths, HEARTHS } from '../../v2/js/farming/hearths.js';
import { BEASTS, Beast } from '../../v2/js/farming/beasts.js';
import { CROPS } from '../../v2/js/farming/farming.js';

const gcKm = (la1, lo1, la2, lo2) => {
    const r = Math.PI / 180, a = Math.sin((la2 - la1) * r / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin((lo2 - lo1) * r / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
};
// [name, lat, lon, continent, what was first farmed there, about when (years ago)]
export const CENTRES = [
    ['Fertile Crescent', 36.5, 40, 'SW Asia', 'wheat, barley, lentils; sheep, goats, cattle, pigs', 11500],
    ['Yangtze', 30, 113, 'E Asia', 'rice', 9000],
    ['Yellow River', 35.5, 111, 'E Asia', 'foxtail and broomcorn millet; pigs', 9500],
    ['Balsas, Mexico', 18.3, -100, 'N America', 'maize, squash, beans', 9000],
    ['Eastern N America', 37, -87, 'N America', 'squash, sumpweed, goosefoot, sunflower', 5000],
    ['Central Andes', -13.5, -72, 'S America', 'potato, quinoa; llama, alpaca', 8000],
    ['SW Amazonia', -12, -65, 'S America', 'manioc, squash, peanut', 9000],
    ['New Guinea highlands', -5.8, 144.3, 'Oceania', 'taro, bananas, yams', 8000],
    ['West African Sahel', 15, -2, 'Africa', 'pearl millet, African rice', 4500],
    ['Sudan (sorghum)', 14, 33, 'Africa', 'sorghum', 5000],
    ['Ethiopian highlands', 9, 38.5, 'Africa', 'teff, finger millet, enset', 5000],
    ['West African yam belt', 7.5, 2, 'Africa', 'yams, oil palm', 4000],
    ['Ganges', 25.5, 83, 'S Asia', 'rice, mung bean', 7000],
    ['South India', 15, 77, 'S Asia', 'mung bean, horsegram, millets', 4500],
];
// [name, lat, lon, continent, why not a hearth] — farmed later, by farming that came, or never before modern times
export const NOT_CENTRES = [
    ['Paris Basin', 48.5, 2.5, 'Europe', 'farming came (~7,000 years ago)'], ['Ukraine', 49, 32, 'Europe', 'farming came'], ['Po Valley', 45, 10, 'Europe', 'farming came'],
    ['California', 37, -120.5, 'N America', 'rich foragers (acorns, salmon)'], ['Pacific Northwest', 47.5, -122.5, 'N America', 'rich foragers (salmon)'], ['Iowa', 42, -93.5, 'N America', 'farming came'],
    ['Pampas', -34.5, -61, 'S America', 'foragers'], ['Central Amazon', -3, -60, 'S America', 'farming came'], ['Murray–Darling', -34.5, 144, 'Oceania', 'foragers (no farming before 1788)'],
    ['Congo basin', 0, 22, 'Africa', 'farming came (Bantu)'], ['Zambia', -13, 28, 'Africa', 'farming came (Bantu)'], ['Highveld', -26.5, 28, 'Africa', 'farming came'],
    ['Japan (Kanto)', 36, 139.5, 'E Asia', 'rich foragers (Jomon); rice came'], ['Thailand', 15, 101, 'SE Asia', 'farming came'], ['Kazakh steppe', 50, 68, 'C Asia', 'herders came'],
];

/** Each landmass's luck as Earth had it: Afro-Eurasia (and its shelf's islands) every beast's wild ancestor, the Americas
 *  only the llama's (the high-country beast), Australia, New Guinea, Madagascar and the Pacific none; the fly only in
 *  Africa (its flyCould masked to Africa's in the ground). */
export function earthLuck(G) {
    const NB = BEASTS.length, fly = new Uint8Array(G.masses.length), has = new Uint8Array(G.masses.length * NB);
    for (const m of G.masses) {
        const americas = m.lon < -30 && m.lon > -170, sahul = (m.lon > 129 && m.lat < 0) || (m.lat < -9 && m.lon > 112) || m.lon <= -170 || m.lon > 160, madagascar = m.lat < -12 && m.lon > 40 && m.lon < 55;
        if (americas) { has[m.id * NB + Beast.HIGHLAND] = 1; continue; }
        if (sahul || madagascar) continue;
        fly[m.id] = 1;
        for (let b = 1; b < NB; b++) has[m.id * NB + b] = 1;
    }
    return { fly, has };
}
const inAfrica = (la, lo) => la > -36 && la < 36 && lo > -18 && lo < 52 && !(la > 12 && lo > 42) && !(la > 30 && lo > 32);

/** The farmed Earth's history ground (history.js historyGround on earth-world.mjs's pictures), the fly kept to Africa. */
export function earthGround(H = HISTORY) {
    const E = earthWorld();
    if (!E) return null;
    const { raster: R, climate } = E.fin, G = historyGround(R, climate.raster, R.farming, climate, gatherGround(R, climate), H);
    for (let c = 0; c < G.w * G.h; c++) { const la = 90 - (Math.floor(c / G.w) + 0.5) * G.deg, lo = -180 + (c % G.w + 0.5) * G.deg; if (!inAfrica(la, lo)) G.flyCould[c] = 0; }
    return { E, G };
}

/** The best of a field within `km` of (lat, lon) on the ground, and where. */
function bestNear(G, f, la, lo, km) {
    let best = -Infinity, at = -1;
    const rows = Math.ceil(km / (111.32 * G.deg));
    const j0 = Math.floor((90 - la) / G.deg), i0 = Math.floor((lo + 180) / G.deg);
    for (let dj = -rows; dj <= rows; dj++) {
        const j = j0 + dj;
        if (j < 0 || j >= G.h) continue;
        const span = Math.ceil(rows / Math.max(0.2, Math.cos((90 - (j + 0.5) * G.deg) * Math.PI / 180)));
        for (let di = -span; di <= span; di++) {
            const c = j * G.w + ((i0 + di) % G.w + G.w) % G.w;
            if (!G.land[c]) continue;
            if (gcKm(la, lo, 90 - (j + 0.5) * G.deg, -180 + (c % G.w + 0.5) * G.deg) > km) continue;
            if (f[c] > best) { best = f[c]; at = c; }
        }
    }
    return { v: best, at };
}

/** The hearth odds against Earth's centres: each centre's and non-centre's percentile among the land, and the AUC (a
 *  centre's land against all other farmable land). */
export function scoreOdds(G, km = 250) {
    const centres = CENTRES.map(([n, la, lo, cont]) => ({ n, la, lo, cont, rank: oddsRank(G, bestNear(G, G.odds, la, lo, km).v) }));
    const not = NOT_CENTRES.map(([n, la, lo, cont, why]) => ({ n, la, lo, cont, why, rank: oddsRank(G, bestNear(G, G.odds, la, lo, km).v) }));
    // (the AUC: a cell near a centre against one far from all, both with farmable odds)
    const near = [], far = [];
    for (let c = 0; c < G.w * G.h; c++) {
        if (!G.land[c] || !(G.odds[c] > 0)) continue;
        const la = 90 - (Math.floor(c / G.w) + 0.5) * G.deg, lo = -180 + (c % G.w + 0.5) * G.deg;
        let d = Infinity;
        for (const [, cla, clo] of CENTRES) d = Math.min(d, gcKm(la, lo, cla, clo));
        if (d <= km) near.push(G.odds[c]); else if (d > 2 * km) far.push(G.odds[c]);
    }
    far.sort((a, b) => a - b);
    let s = 0;
    for (const v of near) { let lo = 0, hi = far.length; while (lo < hi) { const m = (lo + hi) >> 1; if (far[m] < v) lo = m + 1; else hi = m; } s += lo; }
    // (the top tail: the land in the top 5 % of the odds — its share within 500 km of a centre, and the centres with some of
    // it within 300 km)
    const cells = [];
    for (let c = 0; c < G.w * G.h; c++) if (G.land[c] && G.odds[c] > 0) cells.push(c);
    cells.sort((a, b) => G.odds[b] - G.odds[a]);
    const topN = Math.round(0.05 * cells.length), hitC = new Set();
    let inC = 0;
    for (let k = 0; k < topN; k++) {
        const c = cells[k], la = 90 - (Math.floor(c / G.w) + 0.5) * G.deg, lo = -180 + (c % G.w + 0.5) * G.deg;
        let d = Infinity;
        CENTRES.forEach(([, cla, clo], i) => { const x = gcKm(la, lo, cla, clo); if (x < d) d = x; if (x <= 300) hitC.add(i); });
        if (d <= 500) inC++;
    }
    return { centres, not, auc: s / Math.max(1, near.length * far.length), topIn: inC / Math.max(1, topN), topHit: hitC.size / CENTRES.length };
}

/** A field's AUC: a cell within `km` of a centre against one beyond 2 × km of every centre (both land with farmable odds). */
export function aucOf(G, f, km = 250) {
    const near = [], far = [];
    for (let c = 0; c < G.w * G.h; c++) {
        if (!G.land[c] || !(G.odds[c] > 0) || !(f[c] === f[c])) continue;
        const la = 90 - (Math.floor(c / G.w) + 0.5) * G.deg, lo = -180 + (c % G.w + 0.5) * G.deg;
        let d = Infinity;
        for (const [, cla, clo] of CENTRES) d = Math.min(d, gcKm(la, lo, cla, clo));
        if (d <= km) near.push(f[c]); else if (d > 2 * km) far.push(f[c]);
    }
    far.sort((a, b) => a - b);
    let s = 0;
    for (const v of near) {
        let lo = 0, hi = far.length; while (lo < hi) { const m = (lo + hi) >> 1; if (far[m] < v) lo = m + 1; else hi = m; }
        let lo2 = lo, hi2 = far.length; while (lo2 < hi2) { const m = (lo2 + hi2) >> 1; if (far[m] <= v) lo2 = m + 1; else hi2 = m; }
        s += lo + 0.5 * (lo2 - lo);
    }
    return s / Math.max(1, near.length * far.length);
}

/** `runs` re-rolls of the hearths on Earth's luck: per centre the share of runs with a primary hearth within `km`, and the
 *  hearths far from every centre. */
export function scoreHearths(G, runs = 40, km = 700) {
    const H = hearthRegions(G), luck = earthLuck(G), hit = CENTRES.map(() => 0), firstHit = CENTRES.map(() => 0), stray = new Map();
    let n = 0, nStray = 0, nAll = 0, nBelt = 0, nFound = 0, foundBelt = 0;
    const dists = [];
    const runsOut = [];
    for (let roll = 0; roll < runs; roll++) {
        const run = runHearths(G, H, luck, 0, 0, roll), prim = run.centres.filter(C => C.primary);
        n++; nAll += prim.length;
        const got = new Set();
        for (const C of prim) {
            let bi = -1, bd = Infinity;
            CENTRES.forEach(([, la, lo], k) => { const d = gcKm(C.lat, C.lon, la, lo); if (d < bd) { bd = d; bi = k; } });
            dists.push(bd);
            if (bd <= 1200) nBelt++;
            if (C.founder) { nFound++; if (bd <= 1200) foundBelt++; }
            if (bd <= km) got.add(bi);
            else { nStray++; const key = `${Math.round(C.lat / 5) * 5},${Math.round(C.lon / 5) * 5}`; stray.set(key, (stray.get(key) ?? 0) + 1); }
        }
        for (const k of got) hit[k]++;
        const first = prim.reduce((a, C) => (C.t0 < a.t0 ? C : a), prim[0]);
        if (first) { let bi = -1, bd = Infinity; CENTRES.forEach(([, la, lo], k) => { const d = gcKm(first.lat, first.lon, la, lo); if (d < bd) { bd = d; bi = k; } }); if (bd <= km) firstHit[bi]++; }
        runsOut.push(prim.map(C => ({ lat: C.lat, lon: C.lon, t0: C.t0, founder: C.founder })));
    }
    dists.sort((a, b) => a - b);
    return { regions: H.regions, hit: hit.map(x => x / n), firstHit: firstHit.map(x => x / n), perRun: nAll / n, strayPerRun: nStray / n, stray: [...stray].sort((a, b) => b[1] - a[1]), runs: runsOut,
        belt: nBelt / Math.max(1, nAll), founderBelt: foundBelt / Math.max(1, nFound), medianKm: dists[dists.length >> 1] ?? NaN, centresHit: hit.reduce((a, x) => a + x / n, 0) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2), runs = args.includes('--runs') ? +args[args.indexOf('--runs') + 1] : 40;
    // (--set key=a,b … : HISTORY's or HEARTHS' parameters for a trial)
    const H = { ...HISTORY };
    for (let k = args.indexOf('--set') + 1; k > 0 && k < args.length && !args[k].startsWith('--'); k++) {
        const [key, v] = args[k].split('='), val = v.includes(',') ? v.split(',').map(Number) : Number(v);
        if (key in HISTORY) H[key] = val; else if (key in HEARTHS) HEARTHS[key] = val; else throw new Error(`no parameter ${key}`);
    }
    const t0 = performance.now(), EG = earthGround(H);
    if (!EG) { console.log('No Earth reference climate: run node tuning/climate/fetch-references.mjs first'); process.exit(0); }
    const { E, G } = EG;
    console.log(`Earth's history ground in ${((performance.now() - t0) / 1000).toFixed(1)} s · ${G.masses.length} landmasses`);
    const O = scoreOdds(G), pc = r => `${(100 * r).toFixed(0).padStart(3)} %`;
    console.log('── the hearth odds: each centre\'s best within 250 km, its rank among the land (100 % the best) ──');
    for (const x of O.centres) console.log(`  ${x.rank >= 0.9 ? 'ok  ' : x.rank >= 0.75 ? 'fair' : 'LOW '} ${x.n.padEnd(24)} ${x.cont.padEnd(10)} ${pc(x.rank)}`);
    console.log('── and where farming came, or never began: ──');
    for (const x of O.not) console.log(`  ${x.rank < 0.75 ? 'ok  ' : x.rank < 0.9 ? 'fair' : 'HIGH'} ${x.n.padEnd(24)} ${x.cont.padEnd(10)} ${pc(x.rank)} · ${x.why}`);
    console.log(`  AUC (a centre's land against land far from every centre): ${O.auc.toFixed(3)} · the top 5 % of the land: ${pc(O.topIn)} within 500 km of a centre, ${pc(O.topHit)} of the centres with some within 300 km`);
    if (args.includes('--factors')) {
        // (each factor alone: its AUC — a centre's land against land far from every centre, both farmable)
        const F = E.fin.raster.farming, soil = new Float32Array(G.w * G.h), sk = new Float32Array(G.w * G.h);
        for (let c = 0; c < E.W * E.H; c++) { if (E.ocean[c]) continue; const g = Math.floor(Math.floor(c / E.W) * E.deg / G.deg) * G.w + Math.floor((c % E.W) * E.deg / G.deg); soil[g] += F.soil[c] / 255; sk[g]++; }
        for (let g = 0; g < soil.length; g++) soil[g] = sk[g] ? soil[g] / sk[g] : 0;
        const fs = { odds: G.odds, variety: G.variety, ...G.parts, richness: G.richness, soil, elev: G.clim.E, T: G.clim.T, P: G.clim.P, W: G.clim.W, sea: G.clim.sea, Tw: G.clim.Tw, Tc: G.clim.Tc };
        CROPS.forEach((k, a) => { fs[`niche ${k}`] = G.niche[a]; });
        for (const [k, f] of Object.entries(fs)) console.log(`  ${k.padEnd(14)} AUC ${aucOf(G, f).toFixed(3)}`);
    }
    if (args.includes('--parts')) {
        // (each place's odds' parts at its best cell within 250 km)
        console.log('── the odds' + "'" + ' parts at each place (its best cell within 250 km) ──');
        console.log(`  ${'place'.padEnd(24)} odds  vari  seas  sRnk  tRnk  pRnk  prod  hill  water rich  lat   fish  elev  ${CROPS.join(' ')}`);
        for (const [n, la, lo] of [...CENTRES, ['—', 0, 0], ...NOT_CENTRES]) {
            if (n === '—') { console.log('  ' + '—'.repeat(60)); continue; }
            const { at } = bestNear(G, G.odds, la, lo, 250);
            if (at < 0) { console.log(`  ${n.padEnd(24)} no land`); continue; }
            const P = G.parts, f = v => v.toFixed(2).padStart(5);
            console.log(`  ${n.padEnd(24)}${f(G.odds[at])} ${f(G.variety[at])} ${f(P.seasons[at])} ${f(P.seasRank[at])} ${f(P.tRank[at])} ${f(P.pRank[at])} ${f(P.prod[at])} ${f(P.hill[at])} ${f(P.water[at])} ${f(P.rich[at])} ${f(P.lat[at])} ${f(G.richness[at])} ${f(G.clim.E[at])}  ${CROPS.map((k, a) => G.niche[a][at].toFixed(2)).join(' ')}`);
        }
    }
    // (the candidate regions, the likeliest first)
    const t1 = performance.now(), S = scoreHearths(G, runs);
    const regs = S.regions.filter(R => !R.beastOnly).sort((a, b) => b.score - a.score);
    console.log(`── the ${regs.length} candidate regions (odds' peaks), the top 25 — the nearest centre ──`);
    for (const R of regs.slice(0, 25)) {
        let bn = '', bd = Infinity;
        for (const [n, la, lo] of CENTRES) { const d = gcKm(R.lat, R.lon, la, lo); if (d < bd) { bd = d; bn = n; } }
        const top = [...R.niche].map((v, a) => [v, a]).filter(([v, a]) => a < CROPS.length && v > 0.2).sort((x, y) => y[0] - x[0]).map(([v, a]) => `${ARCHETYPES[a].key} ${v.toFixed(2)}`).join(', ');
        console.log(`  ${R.score.toFixed(2)} ${`${R.lat.toFixed(1)}, ${R.lon.toFixed(1)}`.padEnd(14)} ${bd < 700 ? bn.padEnd(22) : `(${bn}, ${bd.toFixed(0)} km)`.padEnd(22)} ${top}`);
    }
    console.log(`── ${runs} re-rolls on Earth's luck (${((performance.now() - t1) / 1000).toFixed(1)} s): ${S.perRun.toFixed(1)} hearths a run, ${S.strayPerRun.toFixed(1)} of them > 700 km from every centre ──`);
    console.log(`  within 1,200 km of a centre: ${pc(S.belt)} of the hearths, ${pc(S.founderBelt)} of the founders · median distance ${S.medianKm.toFixed(0)} km · centres with a hearth within 700 km: ${S.centresHit.toFixed(1)} a run`);
    CENTRES.forEach(([n, , , cont], k) => console.log(`  ${n.padEnd(24)} ${cont.padEnd(10)} a hearth within 700 km in ${pc(S.hit[k])} of runs · the first in ${pc(S.firstHit[k])}`));
    console.log(`  strays (5° box: runs): ${S.stray.slice(0, 12).map(([k, v]) => `${k}: ${v}`).join(' · ')}`);
    if (args.includes('--png')) {
        // (the odds, the centres ringed white, the non-centres ringed red, each run's hearths dotted)
        const dots = new Map();
        for (const r of S.runs) for (const C of r) { const k = `${Math.round(C.lat * 2)},${Math.round(C.lon * 2)}`; dots.set(k, (dots.get(k) ?? 0) + 1); }
        const ring = (la, lo, list, r) => list.some(([, a, b]) => { const d = Math.hypot(la - a, (lo - b) * Math.cos(a * Math.PI / 180)); return d > r - 0.35 && d < r + 0.35; });
        const file = renderBox(path.join(OUT, 'hearth-odds.png'), [-50, 70, -180, 180], 4, (la, lo) => {
            const [c, col] = earthBase(E, la, lo);
            if (ring(la, lo, CENTRES, 3)) return [255, 255, 255];
            if (ring(la, lo, NOT_CENTRES, 3)) return [255, 70, 70];
            const k = `${Math.round(la * 2)},${Math.round(lo * 2)}`;
            if (dots.has(k)) { const t = Math.min(1, dots.get(k) / (0.3 * runs)); return [255, 220 - 120 * t, 0]; }
            if (E.ocean[c]) return col;
            const gc = Math.min(G.h - 1, Math.floor((90 - la) / G.deg)) * G.w + Math.floor((lo + 180) / G.deg) % G.w, v = G.odds[gc] > 0 ? oddsRank(G, G.odds[gc]) : 0;
            const t = Math.max(0, (v - 0.5) / 0.5);
            return [col[0] * (1 - t) + 40 * t, col[1] * (1 - t) + 170 * t, col[2] * (1 - t) + 90 * t];
        });
        console.log(file);
    }
}
