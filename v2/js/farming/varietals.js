// Real crops (plans/V2_FARMING_PLAN.md C4b): the staples historically domesticated on Earth — each in its staple group,
// with the climates it grows in (Köppen), how much of a staple it was (the great staples first: wheat, barley, rice,
// maize, sorghum, the potato, cassava, yams — then the regional ones, then the minor), and the hearth whose PACKAGE of
// crops it came in (crops domesticated together: the Fertile Crescent's wheat and barley, the Andes' potato and quinoa,
// the Sahel's sorghum, millet, rice and yams) — to name a planet's strains. This is not Earth: a hearth is no one
// Earth hearth but partly like several — every package pulls on its crops as much as it suits the hearth (its climate,
// and the hearth's staples it has crops for). Each strain its own crop — no crop names two strains — each staple group's
// crops shared out among its strains so that, together, they suit them best: a crop suiting a strain by its climate (a
// tropical root hearth cassava, taro or yams; a cool one the potato), the pull of the packages it is in, and how great
// a staple it was.
// A hearth's crops pull on each other too: crops from one Earth hearth — or from hearths near each other on Earth (the
// Yellow River and the Yangtze; the Fertile Crescent and temperate Europe) — likelier named together.
// Each crop's climates are also its niche in the spread (spread.js): it grows best in them, less elsewhere — each strain
// a blend of them and its own hearth's climates, where it was domesticated (strainNiche). (Its `kind` — which of its
// group's growing habits it has, farming-config.js — for its own harvests one day.)

import { Staple } from './farming.js';
import { KOPPEN_CLASSES } from '../climate/koppen.js';

const { RICE, WHEAT, MAIZE, ROOTS } = Staple;
const crop = (name, staple, major, climates, kind = 0) => ({ name, staple, major, climates: climates.split(' '), kind });

/** The crops, by id: name, staple group, how great a staple it was — how many it fed, how hardy and nourishing (1 one of
 *  the world's great staples, ~0.6 a region's, ~0.3 a minor one; it weighs on which crops a hearth domesticates, and on
 *  which strain wins a place in the spread), the Köppen climates it grows in (best first), kind (its group's kind in FARMING.crops: maize 0 /
 *  millet and sorghum 1; tropical roots 0 / potatoes 1). */
export const VARIETALS = {
    japonica: crop('Japonica rice', RICE, 1, 'Cfa Cwa Dwa Cfb'),
    indica: crop('Indica rice', RICE, 1, 'Aw Am Af Cwa'),
    aus: crop('Aus rice', RICE, 0.4, 'Aw Am Cwa'),
    africanRice: crop('African rice', RICE, 0.5, 'Aw BSh Am'),
    wheat: crop('Wheat', WHEAT, 1, 'Csa Csb BSk Dsa Dsb Cfb Dfa'),
    barley: crop('Barley', WHEAT, 1, 'Csa BSk Dsb Dfb Cwb'),
    einkorn: crop('Einkorn', WHEAT, 0.3, 'Csa Csb BSk Dsb'),
    rye: crop('Rye', WHEAT, 0.7, 'Dfb Dfc Cfb Dsb'),
    oats: crop('Oats', WHEAT, 0.6, 'Cfb Dfb Cfc'),
    quinoa: crop('Quinoa', WHEAT, 0.5, 'Cwb Cwc ET BSk'),
    teff: crop('Teff', WHEAT, 0.5, 'Cwb Aw Cwa'),
    buckwheat: crop('Buckwheat', WHEAT, 0.4, 'Cwb Dwb Dfb Cfb'),
    maize: crop('Maize', MAIZE, 1, 'Aw Cwa Cwb Cfa Dfa BSh', 0),
    sorghum: crop('Sorghum', MAIZE, 1, 'BSh Aw', 1),
    pearlMillet: crop('Pearl millet', MAIZE, 0.8, 'BSh BWh Aw', 1),
    foxtail: crop('Foxtail millet', MAIZE, 0.8, 'Dwa Dwb Cwa BSk', 1),
    proso: crop('Broomcorn millet', MAIZE, 0.7, 'Dwb BSk Dfb Dsb', 1),
    finger: crop('Finger millet', MAIZE, 0.6, 'Cwb Aw Cwa', 1),
    fonio: crop('Fonio', MAIZE, 0.3, 'Aw BSh', 1),
    browntop: crop('Browntop millet', MAIZE, 0.2, 'Aw BSh Cwa', 1),
    goosefoot: crop('Goosefoot', MAIZE, 0.2, 'Cfa Dfa Dfb', 1),
    potato: crop('Potato', ROOTS, 1, 'Cwb Cwc ET Cfb Dfb Csb', 1),
    cassava: crop('Cassava', ROOTS, 1, 'Af Am Aw'),
    yam: crop('Yams', ROOTS, 0.9, 'Aw Am'),
    sweetPotato: crop('Sweet potato', ROOTS, 0.9, 'Aw Am Cfa Cwa'),
    taro: crop('Taro', ROOTS, 0.8, 'Af Am Cfa'),
    banana: crop('Banana', ROOTS, 0.8, 'Af Am'),
    greaterYam: crop('Greater yam', ROOTS, 0.5, 'Af Am'),
    enset: crop('Enset', ROOTS, 0.4, 'Cwb Aw'),
    oca: crop('Oca', ROOTS, 0.3, 'Cwb Cwc ET', 1),
};

/** Earth's hearths and the crops domesticated in each (each group's first its usual one), with their climates and
 *  where on Earth they lay, roughly (lat, lon) — not assigned to the planet's hearths, but each pulling on their crops as
 *  much as it is like them. */
export const PACKAGES = [
    { name: 'the Fertile Crescent', crops: ['wheat', 'barley', 'einkorn'], climates: 'Csa Csb BSk BSh Dsa', at: [36, 40] },
    { name: 'the Yellow River', crops: ['foxtail', 'proso'], climates: 'Dwa Dwb BSk Cwa', at: [35, 110] },
    { name: 'the Yangtze', crops: ['japonica', 'buckwheat'], climates: 'Cfa Cwa Cwb', at: [30, 115] },
    { name: 'the Ganges', crops: ['indica', 'aus', 'browntop'], climates: 'Aw Cwa BSh Am', at: [25, 85] },
    { name: 'Mesoamerica', crops: ['maize', 'sweetPotato'], climates: 'Aw Cwb BSh Cwa', at: [18, -97] },
    { name: 'the Andes', crops: ['potato', 'quinoa', 'oca'], climates: 'Cwb Cwc ET BSk', at: [-13, -72] },
    { name: 'Amazonia', crops: ['cassava', 'sweetPotato'], climates: 'Af Am Aw', at: [-8, -63] },
    { name: 'New Guinea', crops: ['taro', 'banana', 'greaterYam'], climates: 'Af Am Cfb', at: [-6, 145] },
    { name: 'the Sahel and West Africa', crops: ['sorghum', 'pearlMillet', 'africanRice', 'yam', 'fonio'], climates: 'BSh Aw BWh Am', at: [12, 2] },
    { name: 'the Ethiopian highlands', crops: ['teff', 'finger', 'enset'], climates: 'Cwb Aw Cwa', at: [9, 39] },
    { name: 'eastern North America', crops: ['goosefoot'], climates: 'Cfa Dfa Dfb', at: [37, -87] },
    // (rye and oats: weeds of the first wheat fields, made crops of their own where it was too cold and wet for wheat)
    { name: 'temperate Europe', crops: ['rye', 'oats'], climates: 'Cfb Dfb Dfc Cfc', at: [50, 10] },
].map(p => ({ ...p, climates: p.climates.split(' ') }));

/** Each crop's home: the first package it is in. */
export const HOME = Object.fromEntries(Object.keys(VARIETALS).map(id => [id, PACKAGES.find(p => p.crops.includes(id))]));

export const NAMING = {
    covered: 0.7,               // a package suits a hearth by its climate × (1 − this + this × the share of the hearth's staples
                                // it has a crop for)
    inPackage: 0.6,             // a crop suits a strain by its climate, + this × how well the packages it is in suit the
                                // hearth (the best of them; a tenth more where it is the package's usual one; × 0.3 + 0.7 ×
                                // how great a staple it was: a package's minor crops pull little)…
    major: 1.2,                 // …+ this × how great a staple it was (the great staples first)
    affinity: 0.75,             // a staple's pull on a hearth's second (spread.js): this × how well the packages that have it
                                // and the hearth's first suit the hearth
    likeMin: 0.5,               // a hearth said to be like the Earth homes of its crops whose climate suits it this well
    together: 0.6,              // two crops of one hearth suit it this much more where they came from one Earth hearth…
    nearKm: [1500, 6000],       // …less as their homes lay farther apart, none from this far (the Yellow River and the
                                // Yangtze ~all of it; the Fertile Crescent and temperate Europe, or the Ganges and the
                                // Yangtze, ~3/4; Mesoamerica and the Andes, or the Sahel and Ethiopia, ~2/5; New Guinea
                                // and anywhere none) — crops domesticated together, or near, likelier named together
};

// how alike two Köppen climates are: the same 1, the same first two letters (Cw…) 0.6, the same first letter 0.3
const like = (a, b) => (a === b ? 1 : a[0] === b[0] ? (a[1] === b[1] ? 0.6 : 0.3) : 0);

/** How well a list of climates fits a hearth's (`climate`: [code, share] pairs, shares summing to 1): 0…1. */
export function climateFit(climates, climate) {
    let s = 0;
    for (const [code, share] of climate) { let m = 0; for (const c of climates) m = Math.max(m, like(code, c)); s += share * m; }
    return s;
}

/** A crop's niche: how well it grows in each Köppen class (by KOPPEN_CLASSES' index) — from `floor` outside its
 *  climates to 1 in them (a like class part of the way). */
const niches = new Map();
export function nicheOf(id, floor) {
    const key = `${id}|${floor}`;
    if (!niches.has(key)) niches.set(key, Float32Array.from(KOPPEN_CLASSES, k => { let m = 0; for (const c of VARIETALS[id].climates) m = Math.max(m, like(k.code, c)); return floor + (1 - floor) * m; }));
    return niches.get(key);
}

/** A strain's niche: its crop's (nicheOf) blended toward its hearth's climates (`climate`: [code, share] pairs) by
 *  `attune` — domesticated there, it is at home there: a class as much the hearth's as it is like one of them, each as
 *  its share of the hearth's land runs from `shares[0]` to `shares[1]`. */
export function strainNiche(id, climate, floor, attune, shares) {
    const own = nicheOf(id, 0), out = new Float32Array(own.length);
    KOPPEN_CLASSES.forEach((k, j) => {
        let m = 0;
        for (const [code, share] of climate) m = Math.max(m, like(k.code, code) * smooth(shares, share));
        out[j] = floor + (1 - floor) * ((1 - attune) * own[j] + attune * m);
    });
    return out;
}

/** How near two crops' Earth homes were (0…1): 1 from one hearth; less as their packages lay farther apart. */
export function nearness(a, b, N = NAMING) {
    let best = 0;
    for (const p of PACKAGES) if (p.crops.includes(a)) for (const q of PACKAGES) if (q.crops.includes(b)) best = Math.max(best, p === q ? 1 : 1 - smooth(N.nearKm, greatKm(p.at, q.at)));
    return best;
}
const smooth = (r, x) => { const t = Math.min(1, Math.max(0, (x - r[0]) / (r[1] - r[0]))); return t * t * (3 - 2 * t); };
function greatKm([la1, lo1], [la2, lo2]) {
    const d = Math.PI / 180, x = Math.sin((la2 - la1) * d / 2) ** 2 + Math.cos(la1 * d) * Math.cos(la2 * d) * Math.sin((lo2 - lo1) * d / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(x)));
}

/** How well a package suits a hearth with these staples (Staples) and climate. */
function packageFit(p, staples, climate, N = NAMING) {
    const covered = staples.length ? staples.filter(st => p.crops.some(id => VARIETALS[id].staple === st)).length / staples.length : 0;
    return climateFit(p.climates, climate) * (1 - N.covered + N.covered * covered);
}

/** A staple's pull on a hearth with these staples and climate (0…1): how well the packages that have both it and the
 *  hearth's staples suit the hearth — crops domesticated together likelier to come from one hearth. */
export function affinity(staple, staples, climate) {
    let best = 0;
    for (const p of PACKAGES) if (p.crops.some(id => VARIETALS[id].staple === staple)) best = Math.max(best, packageFit(p, staples, climate));
    return best;
}

/** How well a crop suits a hearth's strain: its climate, the pull of the packages it is in (as each suits the hearth),
 *  how great a staple it was. */
export function cropFit(id, h, N = NAMING) {
    const v = VARIETALS[id];
    let pull = 0;
    for (const p of PACKAGES) {
        const at = p.crops.indexOf(id);
        if (at < 0) continue;
        const usual = p.crops.findIndex(c => VARIETALS[c].staple === v.staple) === at;
        pull = Math.max(pull, packageFit(p, h.crops, h.climate, N) * (usual ? 1.1 : 1));
    }
    return climateFit(v.climates, h.climate) + N.inPackage * (0.3 + 0.7 * v.major) * pull + N.major * v.major;
}

/** The Earth hearths a hearth is like: the homes of its crops (`ids`) — each crop's package with the climate most like
 *  the hearth's — whose climate is like enough its, the likest first. */
export function likeOf(h, ids, N = NAMING) {
    const like = new Map();
    for (const id of ids) {
        let best = null, bv = N.likeMin;
        for (const p of PACKAGES) if (p.crops.includes(id)) { const v = climateFit(p.climates, h.climate); if (v >= bv) { bv = v; best = p; } }
        if (best) like.set(best, Math.max(like.get(best) ?? 0, bv));
    }
    return [...like].sort((a, b) => b[1] - a[1]).map(([p]) => p);
}

/** The crops of a staple group, the likeliest for a hearth first. */
export function cropsFor(staple, h) {
    return Object.keys(VARIETALS).filter(id => VARIETALS[id].staple === staple).sort((a, b) => cropFit(b, h) - cropFit(a, h));
}

/**
 * Names for the hearths' strains (into each hearth: `names`, {staple: crop id}): each staple group's crops shared out
 * among its strains, one each, as together they suit them best (were there ever more strains than crops, the rest each
 * the crop that suits it best) — then each group again in turn, each crop suiting a strain the more as it came from near
 * the crops the others named at its hearth (`together`), until none changes. `nudge(h, id)`, if given: added to each
 * crop's suit for a hearth (a re-roll's).
 */
export function nameHearths(hearths, N = NAMING, nudge = null) {
    for (const h of hearths) h.names = {};
    const groups = [RICE, WHEAT, MAIZE, ROOTS].map(st => {
        const strains = hearths.filter(h => h.crops.includes(st)), ids = Object.keys(VARIETALS).filter(id => VARIETALS[id].staple === st);
        return { st, strains, ids, fit: strains.map(h => ids.map(id => cropFit(id, h, N) + (nudge ? nudge(h, id) : 0))) };
    });
    for (const G of groups) shareOut(G, G.fit);
    // (each sharing again with the pull of the hearths' other crops: the sum of suits and pulls only grows, so it settles)
    for (let round = 0; round < 6 && N.together > 0; round++) {
        let changed = false;
        for (const G of groups) {
            const fit = G.strains.map((h, i) => G.ids.map((id, j) => {
                let pull = 0;
                for (const st of h.crops) if (st !== G.st && h.names[st]) pull += nearness(id, h.names[st], N);
                return G.fit[i][j] + N.together * pull;
            }));
            if (shareOut(G, fit)) changed = true;
        }
        if (!changed) break;
    }
    return hearths;
}

/** A staple group's crops shared out among its strains by `fit` (per strain, per crop), into each hearth's names — the
 *  best one-each sharing; true if any name changed. */
function shareOut({ st, strains, ids }, fit) {
    const n = Math.min(strains.length, ids.length), best = new Array(n).fill(-1), cur = new Array(n), used = new Uint8Array(ids.length);
    // (the best one-each sharing: a search over the strains in turn, cut short where even the best crops left could not
    // beat the best found — a handful of strains and a dozen crops, at once)
    const top = fit.map(row => Math.max(...row)), rest = new Array(n + 1).fill(0);
    for (let i = n - 1; i >= 0; i--) rest[i] = rest[i + 1] + top[i];
    let bestV = -Infinity;
    const search = (i, v) => {
        if (i === n) { if (v > bestV) { bestV = v; best.splice(0, n, ...cur); } return; }
        if (v + rest[i] <= bestV) return;
        const order = ids.map((_, j) => j).filter(j => !used[j]).sort((a, b) => fit[i][b] - fit[i][a]);
        for (const j of order) { used[j] = 1; cur[i] = j; search(i + 1, v + fit[i][j]); used[j] = 0; }
    };
    search(0, 0);
    let changed = false;
    strains.forEach((h, i) => { const id = ids[i < n ? best[i] : fit[i].indexOf(Math.max(...fit[i]))]; if (h.names[st] !== id) changed = true; h.names[st] = id; });
    return changed;
}
