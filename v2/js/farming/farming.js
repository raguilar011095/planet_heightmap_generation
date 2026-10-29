// Farming (plans/V2_FARMING_PLAN.md C1; Madeline James's culture series, Part 4 — after Ramankutty et al. 2002 and the
// FAO's agro-ecological zones): what each place of a finished moment could grow — soil × ground × growing season, with
// the water farming techniques bring. Per cell the finish works out the parts; the page puts them together with the
// techniques chosen (evolution/farming-view.js):
//   · the GROWING SEASON from the place's twelve months (FAO's length of growing period): each month warm enough and wet
//     enough — its rain, its snow's melt and the soil's water against its potential evaporation; by rain alone, and
//     watered (the warm months: water brought);
//   · the SOIL, as it would be on flat ground: what it formed from (the rocks' parent material — river silt, loess, ash…)
//     and what the climate made of it — black earth under temperate grassland, leached red earth in the hot wet tropics
//     (less where floods, ash or rising mountains renew it), acid podzol under boreal conifers;
//   · the GROUND: its slope (the plough's, or terraces'), and waterlogged flats (raised fields drain them);
//   · the WATER brought: a big river's floodplain (flood farming), canals from any river worth tapping (farther from a
//     bigger one), a fresh lake's shores.
// Pure functions of the months (growingSeason, climateSoil): the Earth check runs them on observed climate.

import { FARMING } from './farming-config.js';
import { FINISH, COVER } from '../finish/finish-config.js';
import { Rock } from '../geology/rocks.js';
import { spreadKm } from '../core/min-heap.js';
import { LatLonGrid } from '../finish/finish-grid.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const S = (r, x) => smooth(r[0], r[1], x);
const R = 6371;

/** What the soil formed from (the readout's and the Soil legend's words), in the kind byte's low four bits. */
export const SoilKind = Object.freeze({ NONE: 0, PLAIN: 1, LOESS: 2, TILL: 3, ERG: 4, VOLCANIC: 5, BASALT: 6, LIMESTONE: 7, SHALE: 8, SANDSTONE: 9,
    GRANITE: 10, SLATE: 11, GREENSTONE: 12, OPHIOLITE: 13, SALT: 14, UNKNOWN: 15 });
export const SOIL_WORDS = ['', 'river silt', 'loess', 'glacial till', 'dune sand', 'volcanic ash', 'basalt clay', 'limestone soil', 'shale clay',
    'sandy soil', 'thin granite soil', 'stony slate soil', 'greenstone soil', 'serpentine soil', 'salt crust', 'mixed soil'];
/** …and what the climate made of it, in the high four bits. */
export const SoilMod = Object.freeze({ NONE: 0, BLACK: 1, LEACHED: 2, PODZOL: 3 });
export const MOD_WORDS = ['', 'black earth', 'leached red earth', 'acid podzol'];
/** The young sediment's kinds as the rocks hand them over (geology/rocks.js youngKind). */
const YOUNG_KIND = [null, SoilKind.PLAIN, SoilKind.ERG, SoilKind.LOESS, SoilKind.TILL];
const ROCK_KIND = { [Rock.ALLUVIUM]: SoilKind.PLAIN, [Rock.SANDSTONE]: SoilKind.SANDSTONE, [Rock.SHALE]: SoilKind.SHALE, [Rock.LIMESTONE]: SoilKind.LIMESTONE,
    [Rock.SALT]: SoilKind.SALT, [Rock.BASALT]: SoilKind.BASALT, [Rock.VOLCANIC]: SoilKind.VOLCANIC, [Rock.GRANITE]: SoilKind.GRANITE, [Rock.SLATE]: SoilKind.SLATE,
    [Rock.GNEISS]: SoilKind.GRANITE, [Rock.SHIELD]: SoilKind.GRANITE, [Rock.GREENSTONE]: SoilKind.GREENSTONE, [Rock.OPHIOLITE]: SoilKind.OPHIOLITE };
/** Each kind's parent material (0…1), from the config. */
export function parentOf(kind, K = FARMING) {
    const p = K.parent;
    return [0, p.plain, p.loess, p.till, p.erg, p.volcanic, p.basalt, p.limestone, p.shale, p.sandstone, p.granite, p.slate, p.greenstone, p.ophiolite, p.salt, p.unknown][kind];
}

// ── the growing season ──
/** A season to fill (reused place after place). */
export function newSeason() { return { rain: 0, warm: 0, avail: new Float64Array(12), _pet: new Float64Array(12) }; }

/**
 * A place's growing season from its twelve months (T °C, P mm; January first): `rain` — the months that grow crops on
 * rain alone (each month's warmth × its wetness, so a half-good month counts half), `warm` — those warm enough, were
 * water brought. The snow kept until it melts and the soil's water carried into dry months, three years from bare dry
 * ground so they settle into their round (as the land's cover: finish-cover.js).
 */
export function growingSeason(T, P, out = newSeason(), K = FARMING, F = FINISH, C = COVER) {
    const pet = out._pet;
    for (let m = 0; m < 12; m++) pet[m] = Math.max(5, (F.petBaseMm + F.petPerC * T[m]) / 12);
    let swe = 0, soil = 0, rain = 0, warm = 0;
    for (let cyc = 0; cyc < 3; cyc++) for (let m = 0; m < 12; m++) {
        const p = Math.max(0, P[m]), snowfall = p * S(C.snowPhase, T[m]);
        swe += snowfall;
        const melt = Math.min(swe, C.snowMeltMmPerC * Math.max(0, T[m]));
        swe = Math.max(0, swe - melt - C.snowLossMm * S(C.snowLossWarm, T[m]));
        const liquid = p - snowfall + melt, avail = (liquid + soil) / pet[m];
        soil = Math.min(K.soilMm, Math.max(0, soil + liquid - pet[m]));
        if (cyc < 2) continue;
        const w = S(K.warmC, T[m]);
        warm += w; rain += w * S(K.wetShare, avail);
        out.avail[m] = avail;
    }
    let Py = 0, Ey = 0, si = 0;
    for (let m = 0; m < 12; m++) { Py += Math.max(0, P[m]); Ey += pet[m]; }
    for (let m = 0; m < 12; m++) si += Math.abs(Math.max(0, P[m]) - Py / 12);
    // (and the year's wetness, rain ÷ potential evaporation; and how much its rain comes in a few months — Walsh and
    // Lawler's seasonality index: 0 even, ~0.8 the Mediterranean's, past 1.2 a monsoon margin's)
    out.rain = rain; out.warm = warm; out.wetness = Py / Ey; out.seasonality = Py > 0 ? si / Py : 0;
    return out;
}

// ── the staples and their harvests (C2) ──
/**
 * What a place lives on most — its staple food, as an archetype (not any one species): four crop groups, livestock,
 * fish or wild foods — what would feed it best (not where each was first grown). Each staple's code is its place in this
 * list, and never changes (the exports' staple index, the page's per-staple arrays): a new one is appended, never put
 * between. `crop`: its crop group's key in FARMING.crops (its harvests kept per place under it: farming.crops[key]);
 * `way`: the way of life it is (farming/living.js LIFESTYLES) — livestock lives on the pasture, fish and wild foods are
 * gathered (living.js). (The keys are the code's; the words the page's.)
 */
export const STAPLES = Object.freeze([
    { key: 'none', word: 'Nothing' },
    { key: 'rice', word: 'Paddy grains', crop: 'rice', way: 'farming' },
    { key: 'wheat', word: 'Cool-season grains', crop: 'wheat', way: 'farming' },
    { key: 'maize', word: 'Warm-season grains', crop: 'maize', way: 'farming' },
    { key: 'roots', word: 'Roots & tubers', crop: 'roots', way: 'farming' },
    { key: 'herding', word: 'Livestock', way: 'herding' },
    { key: 'fish', word: 'Fish', way: 'gathering' },
    { key: 'wild', word: 'Wild foods', way: 'gathering' },
]);
export const Staple = Object.freeze(Object.fromEntries(STAPLES.map((s, code) => [s.key.toUpperCase(), code])));
export const STAPLE_WORDS = STAPLES.map(s => s.word);
/** The crop groups, in the order their harvests are worked out (cropYields' out). */
export const CROPS = STAPLES.filter(s => s.crop).map(s => s.crop);
/** Each crop group's staple (by its index in CROPS); each staple's crop group (an index in CROPS, or -1: herding, none). */
export const CROP_STAPLE = CROPS.map(k => STAPLES.findIndex(s => s.crop === k));
export const STAPLE_CROP = STAPLES.map(s => (s.crop ? CROPS.indexOf(s.crop) : -1));
/** Harvests a year kept in a byte: up to this many, finer where they are few (the byte ∝ √harvests). */
const HARVESTS_MAX = 6;
export const encHarvests = h => Math.max(0, Math.min(255, Math.round(255 * Math.sqrt(Math.max(0, h) / HARVESTS_MAX))));
export const decHarvests = b => HARVESTS_MAX * (b / 255) ** 2;
/** Whether a moment's farming kept its crops' harvests, each group's under its own name (one detailed before they were
 *  counted, or kept all in one, is detailed again). */
export const hasHarvests = F => !!F?.crops && !ArrayBuffer.isView(F.crops);
/** A place's harvests (into e: CROPS' order, by rain and watered — cropYields' out) from the bytes kept per group (`crops`:
 *  {group: two bytes a place}), at place i; a group the moment has none of (detailed before it was added) grows nothing. */
export function harvestsAt(crops, i, e) {
    for (let g = 0; g < CROPS.length; g++) {
        const b = crops[CROPS[g]];
        e[2 * g] = b ? decHarvests(b[2 * i]) : 0; e[2 * g + 1] = b ? decHarvests(b[2 * i + 1]) : 0;
    }
    return e;
}

/** A crop kind's growth each month (0…1: its share of a month at its best) — warm past its base, linearly to its optimum
 *  (growing degree-days), not too hot, and wet enough (its water `avail` ÷ potential evaporation, plus `brought` mm a
 *  month) but, unless it is a paddy's, not drowned (a monsoon's deluge waterlogs the dry-land crops) — into rate; and into
 *  pause, the months too cold to grow that only send a winter crop to sleep (dormant: above K.dormantKillC — asleep, it
 *  needs no water) rather than ending it. */
function kindRates(c, T, therm, avail, pet, brought, rate, pause, K) {
    for (let m = 0; m < 12; m++) {
        if (!(therm[m] > 0)) { rate[m] = 0; pause[m] = c.dormant && T[m] < c.base + 4 && T[m] > K.dormantKillC ? 1 : 0; continue; }
        // (water brought tops a month up to what the crop wants, no further: nobody irrigates in the monsoon)
        const a0 = avail[m], a = brought > 0 && a0 < c.wet[1] ? Math.min(a0 + brought / pet[m], c.wet[1]) : a0;
        // (drowned by the month's water beyond what it evaporates, in mm: a monsoon's hundreds, not a cool winter's or a
        // thaw's few tens — whose small evaporation makes the ratio large though little stands in the fields)
        rate[m] = therm[m] * S(c.wet, a) * (c.paddy ? 1 : smooth(c.soggy[1], c.soggy[0], (a - 1) * pet[m]));
        pause[m] = c.dormant && rate[m] < K.harvestBreak && T[m] < c.base + 4 && T[m] > K.dormantKillC ? 1 : 0;
    }
}
/** A crop kind's warmth each month (warm past its base to its optimum, × not too hot) into therm — and whether the
 *  year's warmth could ripen it at all (a run can grow no more than the warmth allows: none at all, no harvest). */
function kindWarmth(c, T, therm, K) {
    let sum = 0;
    for (let m = 0; m < 12; m++) {
        const warm = Math.max(0, Math.min(1, (T[m] - c.base) / (c.opt - c.base)));
        therm[m] = warm > 0 ? warm * smooth(c.hot[1], c.hot[0], T[m]) : 0;
        sum += therm[m];
    }
    return sum > (1 - K.harvestRamp) * c.cycle;
}

/** The harvests a run of `L` months (growing fully) gives a crop that takes `cycle` of them to ripen: a staircase — the
 *  first at a cycle, each next a cycle and a turnaround (reaping, threshing, ploughing, sowing) later — each step eased in
 *  over the last K.harvestRamp of it (a crop cut short still yields, less). */
function harvestSteps(L, cycle, K, max = K.maxHarvests) {
    let h = 0;
    for (let j = 1; j <= max; j++) {
        const at = j * cycle + (j - 1) * K.harvestTurn, s = smooth(at - K.harvestRamp * cycle, at, L);
        if (!(s > 0)) break;
        h += s;
    }
    return h;
}

/** The harvests a crop kind takes in a year: its runs of growing months — a month growing less than K.harvestBreak ends a
 *  run (what was sown dies in a dry or a cold gap) unless it only sleeps through it — each its staircase, and no more a
 *  year than the kind's `max` (wheat and barley one: they flower on the lengthening days after a winter's chill, once a
 *  year). `free` (12, or null): the months it may use (a second crop's: those the first leaves). */
function kindHarvests(rate, pause, c, free, K) {
    const brk = K.harvestBreak, max = c.max ?? K.maxHarvests;
    let start = -1;
    for (let m = 0; m < 12; m++) if ((free && !free[m]) || (rate[m] < brk && !pause[m])) { start = m; break; }
    // (no gap: the year one run, round and round — the wet tropics, the paddies of a river delta)
    if (start < 0) { let L = 0; for (let m = 0; m < 12; m++) L += rate[m]; return harvestSteps(L, c.cycle, K, max); }
    let h = 0, L = 0;
    for (let i = 1; i <= 12; i++) {
        const m = (start + i) % 12;
        if ((free && !free[m]) || (rate[m] < brk && !pause[m])) { if (L > 0) h += harvestSteps(L, c.cycle, K, max); L = 0; } else L += rate[m];
    }
    return Math.min(h, max);
}

/** Working arrays for cropYields (one per worker: reused place after place). */
export function cropWork(K = FARMING) {
    const kinds = [];
    CROPS.forEach((name, g) => { for (const c of K.crops[name].kinds) kinds.push({ g, c }); });
    return { kinds, rate: kinds.map(() => new Float64Array(12)), pause: kinds.map(() => new Uint8Array(12)), therm: kinds.map(() => new Float64Array(12)),
        can: new Uint8Array(kinds.length), h: new Float64Array(kinds.length), free: new Uint8Array(12) };
}

/**
 * Each crop group's harvests a year at a place — by rain alone and watered (K.waterSupplyMm brought each month) — counted
 * in harvests of its own crop: its best kind's (× its share), and a second crop of another group's in the months it leaves
 * (relay cropping: rice and then winter wheat on the Yangtze, wheat and then millet on the Nile), at what that one feeds
 * against it. From the place's twelve months' temperatures (°C) and the season growingSeason just worked out there. Into
 * out: [rice by rain, rice watered, wheat…, maize…, roots…]. The rain-fed harvests discounted where the rains are
 * unreliable — a dry climate's, and one whose rain comes in a few months (the Mediterranean's, a monsoon's margins): the
 * drier and the more seasonal, the more often a year's rains fail.
 */
export function cropYields(T, season, out = new Float64Array(8), K = FARMING, work = cropWork(K)) {
    const A = season.avail, E = season._pet, { kinds, rate, pause, therm, can, h, free } = work;
    const reliable = S(K.rainReliable, season.wetness) * (1 - K.seasonRisk * S(K.riskSeason, season.seasonality) * S(K.riskWet, season.wetness));
    // (each kind's warmth through the year, once: a kind the year is too cold or too hot to ripen takes no harvest, by rain
    // or watered — its water not worked out)
    // (and whether water brought would change it: not where the rain already gives it all it wants in every month it
    // could grow — the watered year is then the rain-fed one)
    for (let i = 0; i < kinds.length; i++) {
        can[i] = kindWarmth(kinds[i].c, T, therm[i], K) ? 1 : 0;
        let thirsty = 0;
        if (can[i]) for (let m = 0; m < 12; m++) if (therm[i][m] > 0 && A[m] < kinds[i].c.wet[1]) { thirsty = 1; break; }
        if (!thirsty) can[i] |= 2;
    }
    for (let w = 0; w < 2; w++) {
        const brought = w ? K.waterSupplyMm : 0;
        for (let i = 0; i < kinds.length; i++) {
            if (!can[i]) { h[i] = 0; rate[i].fill(0); continue; }
            if (w && can[i] & 2) continue;                    // (as by rain: its months, its harvests, already worked out)
            kindRates(kinds[i].c, T, therm[i], A, E, brought, rate[i], pause[i], K);
            h[i] = kinds[i].c.share * kindHarvests(rate[i], pause[i], kinds[i].c, null, K);
        }
        for (let g = 0; g < CROPS.length; g++) {
            let lead = -1;
            for (let i = 0; i < kinds.length; i++) if (kinds[i].g === g && (lead < 0 || h[i] > h[lead])) lead = i;
            let e = h[lead];
            if (e > 0.05) {
                // (the second crop: the best other group's, in the months the first does not grow in)
                let any = 0;
                for (let m = 0; m < 12; m++) { free[m] = rate[lead][m] < K.relayAt ? 1 : 0; any += free[m]; }
                let relay = 0;
                if (any) for (let i = 0; i < kinds.length; i++) {
                    if (kinds[i].g === g || !(h[i] > 0.05)) continue;
                    const r = kinds[i].c.share * kindHarvests(rate[i], pause[i], kinds[i].c, free, K) * K.crops[CROPS[kinds[i].g]].weight / K.crops[CROPS[g]].weight;
                    if (r > relay) relay = r;
                }
                // (the second crop is the lesser: a rotation is named for its main food — where the other crop would feed
                // more, it is that one's rotation, counted under it)
                e += Math.min(relay, e);
            }
            if (w) out[2 * g + 1] = Math.max(e, out[2 * g]); else out[2 * g] = e * reliable;
        }
    }
    return out;
}

/** The pasture a place offers (0…1), from its land cover (finish-cover.js): its vegetation (warm enough to grow), as much
 *  as the year's rain grows — a steppe's, not a semi-desert's thin scrub — less under forest. */
export const pastureOf = (cv, K = FARMING) => Math.min(S(K.herdGrass, cv.V), S(K.herdWet, cv.wetness)) * (1 - K.herdTrees * cv.tree);

/** The yield a season of `months` (growing fully) allows, 0…1: a crop from ~2 months, full at ~5, a second crop's
 *  bonus toward a year-round season (the Earth check's measure of the rain-fed season; farmland itself counts harvests). */
export function seasonYield(months, K = FARMING) {
    return (1 - K.doubleBonus) * S(K.seasonMonths, months) + K.doubleBonus * S(K.doubleMonths, months);
}

/**
 * What the climate makes of a soil, from the land's cover there (finish-cover.js landCover: its trees and their
 * needle-leaved share, its wetness — the year's rain ÷ potential evaporation — its mean, warmest and coldest month):
 * black earth (0…1), leaching (0…1, before any renewal), podzol (0…1).
 */
export function climateSoil(cv, out = {}, K = FARMING) {
    out.black = S(K.blackWet, cv.wetness) * S(K.blackWetMax, cv.wetness) * S(K.blackWarmest, cv.warmest) * S(K.blackColdest, cv.coldest);
    out.leach = S(K.leachWet, cv.wetness) * S(K.leachWarm, cv.tAnn);
    out.podzol = cv.tree * S(K.podzolNeedle, cv.needle) * S(K.podzolColdest, cv.coldest) * S(K.podzolWarmest, cv.warmest);
    return out;
}

/** Per-cell bytes the final climate fills (one place at a time): the seasons (months × 20), black earth, leaching,
 *  podzol and the climate's waterlogging (× 255); each crop group's harvests a year by rain and watered (`crops`: under
 *  each group's name, two bytes a cell, encHarvests — a group added later is a name more) and the pasture (× 255). */
export function newFarmClimate(n, K = FARMING) {
    return { rain: new Uint8Array(n), warm: new Uint8Array(n), black: new Uint8Array(n), leach: new Uint8Array(n), podzol: new Uint8Array(n), wet: new Uint8Array(n),
        crops: Object.fromEntries(CROPS.map(k => [k, new Uint8Array(2 * n)])), pasture: new Uint8Array(n), _s: newSeason(), _c: {}, _y: new Float64Array(2 * CROPS.length), _w: cropWork(K) };
}
const byte = v => Math.max(0, Math.min(255, Math.round(255 * v)));
/** One land cell's climate parts (its months as the land's cover read them, and that cover). */
export function addFarmClimate(fc, c, T, P, cv, K = FARMING) {
    growingSeason(T, P, fc._s, K);
    fc.rain[c] = Math.min(255, Math.round(20 * fc._s.rain)); fc.warm[c] = Math.min(255, Math.round(20 * fc._s.warm));
    climateSoil(cv, fc._c, K);
    fc.black[c] = byte(fc._c.black); fc.leach[c] = byte(fc._c.leach); fc.podzol[c] = byte(fc._c.podzol);
    fc.wet[c] = byte(S(K.wetlandWet, cv.wetness));
    const y = cropYields(T, fc._s, fc._y, K, fc._w);
    for (let g = 0; g < CROPS.length; g++) { const b = fc.crops[CROPS[g]]; b[2 * c] = encHarvests(y[2 * g]); b[2 * c + 1] = encHarvests(y[2 * g + 1]); }
    fc.pasture[c] = byte(pastureOf(cv, K));
}

/**
 * Water brought from the rivers and lakes: within reach of a river of discharge over q[0] (its reach `km`: [min, at
 * q[1]… , max], × (q / q[1])^0.4) on ground no higher above it than hand[1] (km, fading from hand[0]), and of a fresh
 * lake's shore (`lakeKm`). 0…1 per cell — each cell by how much of it lies within reach (a reach narrower than the mesh's
 * cells shows as part of a cell, so it looks alike at every detail).
 */
function waterReach(mesh, z, ocean, flow, qr, km, hand, lake = null, lakeLevel = null, lakeKm = 0, fresh = 1) {
    const n = mesh.numCells, dist = new Float32Array(n).fill(Infinity), base = new Float32Array(n), reach = new Float32Array(n), out = new Uint8Array(n);
    const [qMin, qRef] = qr, [kMin, kRef, kMax] = km;
    for (let c = 0; c < n; c++) {
        if (ocean[c]) continue;
        if (flow[c] >= qMin) { dist[c] = 0; base[c] = z[c]; reach[c] = Math.min(kMax, Math.max(kMin, kRef * (flow[c] / qRef) ** 0.4)) * S([qMin, qMin * 1.5], flow[c]); }
        else if (lake && lakeKm > 0 && lake[c] === fresh) { dist[c] = 0; base[c] = lakeLevel[c]; reach[c] = lakeKm; }
    }
    spreadKm(mesh, dist, { maxKm: kMax + mesh.edgeKm, canEnter: (a, b) => !ocean[b] && z[b] - base[a] < hand[1], onReach: (a, b) => { base[b] = base[a]; reach[b] = reach[a]; } });
    const cellKm = mesh.edgeKm;
    for (let c = 0; c < n; c++) {
        if (!(dist[c] <= reach[c] + 0.5 * cellKm)) continue;
        const part = dist[c] === 0 ? Math.min(1, 2 * reach[c] / cellKm) : Math.max(0, Math.min(1, (reach[c] - dist[c]) / cellKm + 0.5));
        out[c] = byte(smooth(hand[1], hand[0], z[c] - base[c]) * part);
    }
    return out;
}

/**
 * Each cell's slope, m per km: the surface smoothed to about K.slopeKm (as far as the mesh's cells are finer), its
 * gradient against the neighbours (the root mean square of the drops, × √2: a plane's steepest) — raised on cells
 * coarser than K.slopeFullKm, which see the same ground gentler.
 */
function slopes(mesh, z, ocean, K) {
    const { adjOffset, adjList, xyz, numCells: n } = mesh, zs = Float32Array.from(z), out = new Uint8Array(n);
    const passes = Math.max(0, Math.round(K.slopeKm / mesh.edgeKm)), coarse = Math.max(1, mesh.edgeKm / K.slopeFullKm) ** 0.7;
    for (let pass = 0; pass < passes; pass++) {
        const was = zs.slice();
        for (let c = 0; c < n; c++) {
            if (ocean[c]) continue;
            let s = was[c], k = 1;
            for (let j = adjOffset[c]; j < adjOffset[c + 1]; j++) { const d = adjList[j]; if (!ocean[d]) { s += 0.5 * was[d]; k += 0.5; } }
            zs[c] = s / k;
        }
    }
    for (let c = 0; c < n; c++) {
        if (ocean[c]) continue;
        let s2 = 0, k = 0;
        const x = xyz[3 * c], y = xyz[3 * c + 1], w = xyz[3 * c + 2];
        for (let j = adjOffset[c]; j < adjOffset[c + 1]; j++) {
            const d = adjList[j];
            if (ocean[d]) continue;
            const km = R * Math.acos(Math.min(1, x * xyz[3 * d] + y * xyz[3 * d + 1] + w * xyz[3 * d + 2]));
            if (!(km > 0)) continue;
            const g = 1000 * (zs[d] - zs[c]) / km;
            s2 += g * g; k++;
        }
        out[c] = k ? Math.min(255, Math.round(coarse * Math.SQRT2 * Math.sqrt(s2 / k) / 2)) : 0;
    }
    return out;
}

/**
 * The farming parts of each land cell, once the rocks are known.
 * @param {Object} o  { mesh, z (km), ocean, q (each cell's discharge, m³/s), lat + lon (°), lake + lakeLevel (finish-hydro.js), rock +
 *                     youngKind (geology/rocks.js; null without the rocks), young (a rising range, 0…255), climate (the
 *                     parts newFarmClimate's bytes hold) }
 * @returns {{soil, flood, canal, slope, wetland, kind}} Uint8 per cell — soil 0…255 (on flat ground); flood and canal
 *          the water each technique brings (0…255); slope (m per km ÷ 2); wetland (waterlogged, 0…255); kind (the soil's
 *          kind | the climate's mark << 4)
 */
export function farmCells({ mesh, z, ocean, q, lat, lon, lake = null, lakeLevel = null, rock = null, youngKind = null, young = null, climate }, K = FARMING) {
    const n = mesh.numCells, soil = new Uint8Array(n), kind = new Uint8Array(n), wetland = new Uint8Array(n), fc = climate;
    const slope = slopes(mesh, z, ocean, K);
    const flood = waterReach(mesh, z, ocean, q, K.floodQ, K.floodKm, K.floodHandKm);
    const canal = waterReach(mesh, z, ocean, q, K.canalQ, K.canalKm, K.canalHandKm, lake, lakeLevel, K.lakeKm);
    const renew = K.leachRenew, base = new Float32Array(n), YOUNG = new Set([SoilKind.PLAIN, SoilKind.LOESS, SoilKind.TILL, SoilKind.ERG]);
    // what each formed from, and how much of it leaching leaves (less where floods, ash or a rising range renew it)
    for (let c = 0; c < n; c++) {
        if (ocean[c]) continue;
        let k = SoilKind.UNKNOWN;
        if (rock) { k = ROCK_KIND[rock[c]] ?? SoilKind.UNKNOWN; if (rock[c] === Rock.ALLUVIUM && youngKind?.[c]) k = YOUNG_KIND[youngKind[c]]; }
        const spared = k === SoilKind.PLAIN ? renew.plain : k === SoilKind.VOLCANIC ? renew.volcanic : k === SoilKind.BASALT ? renew.basalt : 0;
        const leach = (fc.leach[c] / 255) * (1 - Math.max(spared, young ? renew.young * young[c] / 255 : 0));
        base[c] = parentOf(k, K) * (1 - K.leachLoss * leach);
        const black = fc.black[c] / 255, podzol = fc.podzol[c] / 255;
        const mod = leach >= 0.45 ? SoilMod.LEACHED : black >= 0.5 ? SoilMod.BLACK : podzol >= 0.5 ? SoilMod.PODZOL : SoilMod.NONE;
        kind[c] = k | (mod << 4);
    }
    // (the bedrock's soils read regionally — a world map's soils follow the rocks over tens of km, not their every contact:
    // the rock map's patchwork, read cell by cell, drew a leopard's spots; the young sediment's plains and loess stay crisp)
    const grid = new LatLonGrid(0.5), isBed = c => !ocean[c] && !YOUNG.has(kind[c] & 15);
    const region = grid.blur(grid.average(lat, lon, base, isBed), K.soilRegionKm);
    for (let c = 0; c < n; c++) {
        if (ocean[c]) continue;
        let b = base[c];
        if (!YOUNG.has(kind[c] & 15)) { const r = grid.at(region, lat[c], lon[c]); if (r === r) b = r + K.soilLocal * (b - r); }
        // what the climate made of it besides: black earth, podzol
        soil[c] = byte(Math.min(1, b * (1 + K.blackBonus * fc.black[c] / 255) * (1 - K.podzolLoss * fc.podzol[c] / 255)));
        // waterlogged: flat ground where the year is wet, more so on a river's plain
        wetland[c] = byte(S(K.wetlandFlat, 2 * slope[c]) * (fc.wet[c] / 255) * (0.5 + 0.5 * flood[c] / 255));
    }
    return { soil, flood, canal, slope, wetland, kind };
}

// ── putting the parts together (the page, per pixel, with the techniques chosen) ──
/** The techniques (each on or off): flood farming, canals, terraces, raised fields. */
export const TECHNIQUES = ['flood', 'canal', 'terrace', 'raised'];

/** Farmland (0…1) from the food a place grows (v: harvests × what the crop feeds × soil × ground — one good harvest of a
 *  grain on good flat ground ≈ 0.8): a soft saturating scale, so two or three harvests a year stand out from one. */
export const farmIndex = (v, K = FARMING) => v / (v + K.farmHalf);

/**
 * A place's farming, with the techniques `tech` ({flood, canal, terrace, raised}) — from its parts `p` (soil 0…1, flood
 * and canal 0…1, slope m per km, wetland 0…1), each crop group's harvests `e` (by rain and watered, as cropYields) and its
 * pasture (0…1). Each crop's food: its harvests with the water the techniques bring — past the first, only as many as
 * the soil can feed (river silt and ash two or three a year; leached ground one) — × what it asks of the soil (tubers
 * little, rice much) × the ground (rice: level fields — paddies, or terraces; standing in water, a waterlogged flat suits
 * it) × how many it feeds. Into out:
 *   tech, rain — farmland (0…1) with the techniques and by rain alone: the best crop's food, on farmIndex;
 *   harvests, harvestsRain — that crop's harvests a year (its own crop's, a second one's counted in them); water (0…1);
 *   staple (Staple: the best crop, or herding by the pasture where that does better), score (0…1: how well it grows
 *   there), second; and, given out.scores (one a staple: STAPLES.length), each staple's score — given out.foods (as
 *   many), each one's food (herding's as the staple is chosen by: its pasture × K.herdWeight).
 */
export function farmPlace(p, e, pasture, tech, out = {}, K = FARMING) {
    const slopeRain = 1 - K.slopeMaxLoss * S(K.slopeLoss, p.slope);
    const ground = tech.terrace ? Math.max(slopeRain, 1 - K.slopeMaxLoss * S(K.terraceLoss, p.slope)) : slopeRain;
    const wetRain = 1 - K.wetlandLoss * p.wetland, wetTech = tech.raised ? 1 : wetRain;
    const water = Math.max(tech.flood ? p.flood : 0, tech.canal ? p.canal : 0), more = S(K.multiSoil, p.soil), scores = out.scores, foods = out.foods;
    const eff = h => Math.min(1, h) + more * Math.max(0, h - 1);
    let best = Staple.NONE, bv = K.stapleMin, bw = 1, bh = 0, second = Staple.NONE, sv = K.stapleMin, rv = 0, rh = 0;
    for (let g = 0; g < CROPS.length; g++) {
        const c = K.crops[CROPS[g]], er = e[2 * g], ew = e[2 * g + 1], soilF = 1 - c.soil + c.soil * p.soil, st = CROP_STAPLE[g];
        // (a paddy crop stands in water: a waterlogged flat costs it nothing)
        const ht = eff(er + water * Math.max(0, ew - er)), hr = eff(er), paddy = c.kinds[0].paddy;
        const v = ht * soilF * ground ** c.level * (paddy ? 1 : wetTech) * c.weight;
        const vr = hr * soilF * slopeRain ** c.level * (paddy ? 1 : wetRain) * c.weight;
        if (scores) scores[st] = Math.min(1, v / c.weight);
        if (foods) foods[st] = v;
        if (v > bv) { second = best; sv = bv; best = st; bv = v; bw = c.weight; bh = ht; } else if (v > sv) { second = st; sv = v; }
        if (vr > rv) { rv = vr; rh = hr; }
    }
    out.tech = best ? farmIndex(bv, K) : 0; out.rain = farmIndex(rv, K); out.harvests = bh; out.harvestsRain = rh; out.water = water;
    // (herds graze what is not under the plough: the watered strip is farmed)
    const herd = pasture * (1 - K.herdWatered * water);
    if (scores) scores[Staple.HERDING] = herd;
    if (foods) foods[Staple.HERDING] = herd * K.herdWeight;
    if (herd * K.herdWeight > bv) { second = best; best = Staple.HERDING; bv = herd * K.herdWeight; bw = K.herdWeight; } else if (herd * K.herdWeight > sv) second = Staple.HERDING;
    out.staple = best; out.score = best ? Math.min(1, bv / bw) : 0; out.second = second;
    return out;
}

/** The class of a farmland value (farmIndex): 0 barren, 1 poor, 2 fair, 3 good, 4 excellent — from K.classesV, in food. */
export function farmClass(F, K = FARMING) {
    const c = K.classesV;
    return F >= farmIndex(c[3], K) ? 4 : F >= farmIndex(c[2], K) ? 3 : F >= farmIndex(c[1], K) ? 2 : F >= farmIndex(c[0], K) ? 1 : 0;
}
