// The beasts (plans/V2_FOOD_PLAN.md §5.3, F2): today's "Livestock" split into eight archetypes, each with its roles —
// plough, mount, pack, milk, wool, sled — from the land alone ("best possible": the history, F3–F4, will say which of them
// came to each landmass). For each, from a place's climate and height:
//   · its WILD HOME — where its wild ancestor would live (Madeline James Part 3; food-research/domestication.md §3): small
//     stock on rugged hills, a great grazer in river-and-woodland mosaics, a steppe horse on cold semi-arid grass, a camel
//     in the deserts, a high-country beast above ~3,000 m, a tundra deer where the summers are short (Binford's effective
//     temperature), a forest pig in warm wet woods, a wallowing buffalo in tropical wetlands;
//   · where it can be KEPT — wider than its wild home (cattle from the Fertile Crescent to the Ganges);
//   · the DISEASE BELT — where a tsetse-like fly would live (food-research/food-systems.md §4.1: hot, a wet season,
//     wooded, lowland, frost-free): cattle, horses and buffalo fail there, goats, pigs and fowl hold; no plough.
// The place's leading beast is the one most at home there — its wild home first, how well it is kept second (the mock-up:
// ranked by keeping alone, one beast takes the whole map). Smooth scores throughout, in °C, mm, km and months: the same at
// every detail. Pure functions of a place's measures (`L`, below): the page reads them off a finished moment's picture,
// tuning/farming/earth-farming.mjs off Earth's observed climate.

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const S = (r, x) => smooth(r[0], r[1], x);

/** The beasts — each code its place in the list, never changed (the export's beast index). `plough`: pulls a plough;
 *  `herd`: herders keep it (a pig and a buffalo are farmers' beasts). */
export const BEASTS = Object.freeze([
    { key: 'none', word: 'No herd beast', like: '', roles: '' },
    { key: 'grazer', word: 'Great grazer', like: 'like cattle', roles: 'plough · milk · meat', plough: true, herd: true },
    { key: 'smallStock', word: 'Small stock', like: 'like sheep and goats', roles: 'milk · wool · meat', herd: true },
    { key: 'horse', word: 'Steppe horse', like: 'like the horse', roles: 'mount · milk · draught', plough: true, herd: true },
    { key: 'camel', word: 'Desert camel', like: 'like camels', roles: 'pack · mount · milk', herd: true },
    { key: 'highland', word: 'High-country beast', like: 'like yak or llama', roles: 'pack · wool · milk', herd: true },
    { key: 'deer', word: 'Tundra deer', like: 'like reindeer', roles: 'sled · milk · meat', herd: true },
    { key: 'pig', word: 'Forest pig', like: 'like pigs', roles: 'meat' },
    { key: 'buffalo', word: 'Wallowing buffalo', like: 'like water buffalo', roles: 'plough · milk', plough: true },
]);
export const Beast = Object.freeze(Object.fromEntries(BEASTS.map((b, code) => [b.key.replace(/[A-Z]/g, c => `_${c}`).toUpperCase(), code])));
export const BEAST_WORDS = BEASTS.map(b => b.word);
/** Every beast's bit (beastPlace's L.beasts: all of them come). */
export const ALL_BEASTS = (1 << BEASTS.length) - 2;

export const BEAST = {
    keepFloor: 0.15,            // a beast kept no worse than this to count as kept at a place at all
    wildShare: 0.65,            // the leading beast: its wild home this much of its rank, how well it is kept the rest
    pigShare: 0.8,              // (a pig's keeping counted at this: kept wherever it is wooded and wet, it would lead everywhere)
    pigPlough: 0.5,             // …and its rank this much less where a plough beast is kept: the draught beast leads the farm
                                // (cattle, buffalo); the pig where there is none (New Guinea's, the fly belt's)
    leadFloor: 0.12,            // no leading beast below this rank
    close: 0.9,                 // a second beast striped where its rank comes this close to the first's
    ploughKeep: [0.1, 0.3],     // a plough where a plough beast is kept this well…
    ploughFly: [0.35, 0.65],    // …and none as the fly belt's score runs from this to this
    // ── the fly belt: a tsetse-like fly's (Africa's 10°N–20°S: hot, wet-season woodland below ~2,000 m, no frost) ──
    flyWarm: [18, 20.5],        // the year's mean (°C) from this to this…
    flyHot: [32.5, 30],         // …its warmest month under this (a hot dry season kills it: the Sahel's, the Deccan's)…
    flyRain: [550, 800],        // …rain (mm a year) from this to this…
    flyWood: [0.3, 0.6],        // …wooded: its tree share (and the wetter, the more) from this to this…
    flyHigh: [1.8, 1.3],        // …below this height (km: the East African highlands' farms above ~1,500 m are free of it)…
    flyFrost: [11, 15],         // …and its coldest month (°C) above this to this: no frost, no cool season (the Highveld's none)
};

/**
 * A place's measures, for the beasts and the ways of life (into L, from its months' summary):
 *   T, Tw, Tc   the year's mean, its warmest and coldest month (°C)     P      rain (mm a year)
 *   arid        UNEP's aridity index (rain ÷ potential evaporation)      seas   Walsh and Lawler's rain seasonality
 *   elev        height (km, the sea's level 0)                          tree   its trees' share of the ground (0…1)
 *   hill        how rugged (0…1)                                         lat    latitude (°)
 *   flood, wetland, canal    the farming's parts (0…1): a big river's plain, waterlogged flats, water led off rivers
 *   koppen      its Köppen class (climate/koppen.js KOPPEN_ID)
 *   paddy       how much of its farming is paddy fields (0…1: wetland a buffalo wallows in — set by the caller, from the
 *               farming; 0 where unknown)
 *   flyHere     whether the fly lives on its landmass at all (0…1; 1 where unknown: wherever it could live — on Earth only
 *               Africa's, a matter of where the fly evolved, not of the climate)
 * and its effective temperature `et` (Bailey 1960; Binford 2001: (18W − 10C) ÷ (W − C + 8), °C — 18 the tropics, 10 the
 * tree line; foragers store food below ~15, hunt more than they gather below ~12.75) — set here.
 */
export function landMeasures(L) {
    L.et = (18 * L.Tw - 10 * L.Tc) / Math.max(1, L.Tw - L.Tc + 8);
    return L;
}

/** Where the fly belt could be at a place (0…1: its climate, not whether the fly lives on its landmass). */
export function flyBelt(L, B = BEAST) {
    return S(B.flyWarm, L.T) * S(B.flyHot, L.Tw) * S(B.flyRain, L.P) * S(B.flyWood, L.tree + 0.4 * smooth(0.5, 0.9, L.arid)) * S(B.flyHigh, L.elev) * S(B.flyFrost, L.Tc);
}

/** Too wet for a grazing beast (0…1 against its limits [a, b] of the aridity w): only where it is also warm — the humid
 *  tropics' forests and their diseases; a cold wet coast keeps cattle and sheep well (Ireland's, Norway's). */
const tooWet = (a, b, w, T) => 1 - (1 - smooth(a, b, w)) * smooth(14, 20, T);
/** Reindeer country: short summers (the effective temperature, Binford's) and hard winters, where lichen lies under snow. */
const tundra = (L, a, b) => smooth(a, b, L.et) * smooth(-3, -10, L.Tc);

/** One beast's wild home at a place (0…1), with its fly belt `fly`. */
export function beastWildOne(L, fly, b) {
    const w = L.arid, T = L.T, e = Math.max(0, L.elev);
    switch (b) {
        case Beast.GRAZER: return smooth(0.3, 0.5, w) * tooWet(1.45, 1.0, w, T) * smooth(4, 9, T) * smooth(29, 25, T) * (1 - 0.5 * L.tree) * (1 - 0.5 * L.hill) * smooth(2.5, 1.2, e) * (1 - 0.9 * fly);
        case Beast.SMALL_STOCK: return smooth(0.25, 0.8, e) * smooth(2.9, 2.2, e) * smooth(0.12, 0.28, w) * tooWet(1.3, 0.85, w, T) * (0.4 + 0.6 * L.hill);
        case Beast.HORSE: return smooth(0.15, 0.25, w) * smooth(0.7, 0.5, w) * smooth(-6, -1, T) * smooth(14, 10, T);
        case Beast.CAMEL: return smooth(330, 190, L.P) * smooth(10, 40, L.P) * smooth(-4, 2, T);
        case Beast.HIGHLAND: return smooth(2.7, 3.3, e) * smooth(12, 6, T);
        case Beast.DEER: return tundra(L, 11.3, 10.6) * smooth(42, 52, Math.abs(L.lat));
        case Beast.PIG: return smooth(0.75, 1.15, w) * smooth(9, 14, T) * L.tree;
        case Beast.BUFFALO: {
            const wet = Math.max(L.wetland, 0.8 * L.flood, L.paddy ?? 0), river = Math.max(L.flood, 0.6 * L.canal);
            return smooth(14, 19, T) * Math.max(wet, river) * smooth(0.5, 0.9, w) * smooth(1.5, 0.6, e) * (1 - 0.9 * fly);
        }
    }
    return 0;
}
/** Each beast's wild home at a place (into `out`, by code: 0…1), with its fly belt `fly`. */
export function beastWild(L, fly, out) {
    out[0] = 0;
    for (let b = 1; b < BEASTS.length; b++) out[b] = beastWildOne(L, fly, b);
    return out;
}

/** How well each beast can be kept at a place (into `out`, by code: 0…1), with its fly belt `fly`. Farmers keep their
 *  beasts on the water they bring too (fodder by the canals: the Nile's oxen) — the dry limits read the wetter of the
 *  rain and the water. */
export function beastKeep(L, fly, out) {
    out[0] = 0;
    for (let b = 1; b < BEASTS.length; b++) out[b] = beastKeepOne(L, fly, b);
    return out;
}
/** How well one beast can be kept at a place (0…1), with its fly belt `fly` (beastKeep's, one beast). */
export function beastKeepOne(L, fly, b) {
    const w = L.arid, T = L.T, e = Math.max(0, L.elev);
    switch (b) {
        case Beast.GRAZER: return smooth(0.12, 0.3, Math.max(w, 0.5 * Math.max(L.flood, L.canal))) * tooWet(2.4, 1.5, w, T) * smooth(-8, -2, T) * (1 - 0.85 * fly);
        case Beast.SMALL_STOCK: return smooth(0.05, 0.18, Math.max(w, 0.5 * Math.max(L.flood, L.canal))) * tooWet(2.6, 1.7, w, T) * smooth(-10, -3, T) * (1 - 0.3 * fly);
        case Beast.HORSE: return smooth(0.08, 0.2, Math.max(w, 0.5 * Math.max(L.flood, L.canal))) * tooWet(1.3, 0.75, w, T) * smooth(22, 16, T) * smooth(-12, -5, T) * (1 - 0.95 * fly);
        case Beast.CAMEL: return smooth(0.45, 0.2, w) * smooth(-8, -2, T);
        case Beast.HIGHLAND: return smooth(2.2, 2.9, e) * smooth(16, 10, T);
        case Beast.DEER: return tundra(L, 11.8, 11.0);
        case Beast.PIG: return smooth(0.5, 0.9, w) * smooth(3, 9, T) * 0.85;
        case Beast.BUFFALO: return smooth(12, 17, T) * Math.max(L.flood, L.wetland, L.paddy ?? 0, smooth(1.0, 1.6, w)) * smooth(2.2, 1.4, e) * (1 - 0.85 * fly);
    }
    return 0;
}

/** A scratch for beastPlace (reused place after place). */
export function newBeasts() { return { wild: new Float64Array(BEASTS.length), keep: new Float64Array(BEASTS.length), rank: new Float64Array(BEASTS.length) }; }

/**
 * A place's beasts (into o: newBeasts()'s, filled — beast and second: a Beast, the second where its rank comes BEAST.close
 * to the first's, else NONE; score (0…1: how well the leading one is kept); plough (0…1: a plough beast kept, out of the
 * fly belt); flyCould (where it could be: flyBelt's) and fly (the fly belt's score: flyCould where the fly lives — L.flyHere);
 * keep and rank each beast's, wild each kept one's (0 for the rest: it ranks only those kept)) from its measures `L`
 * (landMeasures'd) — and, where `L.beasts` is given (a bit per Beast), only the beasts that had come (F4: the views as it
 * came; the others kept nowhere: no plough where no plough beast came).
 * `herders`: herders' beasts only (no pig, no buffalo).
 */
export function beastPlace(L, herders, o, B = BEAST) {
    const could = o.flyCould = flyBelt(L, B), fly = o.fly = could * (L.flyHere ?? 1), keep = beastKeep(L, fly, o.keep), wild = o.wild, rank = o.rank;
    if (L.beasts !== undefined && L.beasts !== ALL_BEASTS) for (let b = 1; b < BEASTS.length; b++) if (!((L.beasts >> b) & 1)) keep[b] = 0;
    let best = Beast.NONE, bv = B.leadFloor, second = Beast.NONE, sv = 0, plough = 0;
    for (let b = 1; b < BEASTS.length; b++) if (BEASTS[b].plough) plough = Math.max(plough, S(B.ploughKeep, keep[b]));
    o.plough = plough * (1 - S(B.ploughFly, fly));
    for (let b = 1; b < BEASTS.length; b++) {
        rank[b] = 0; wild[b] = 0;
        if (keep[b] < B.keepFloor || (herders && !BEASTS[b].herd)) continue;
        wild[b] = beastWildOne(L, fly, b);
        rank[b] = b === Beast.PIG ? (B.wildShare * wild[b] + (1 - B.wildShare) * keep[b] * B.pigShare) * (1 - B.pigPlough * o.plough) : B.wildShare * wild[b] + (1 - B.wildShare) * keep[b];
        if (rank[b] > bv) { second = best; sv = bv; best = b; bv = rank[b]; } else if (rank[b] > sv) { second = b; sv = rank[b]; }
    }
    o.beast = best; o.score = best ? keep[best] : 0;
    o.second = best && second && sv >= B.close * bv ? second : Beast.NONE;
    return o;
}
