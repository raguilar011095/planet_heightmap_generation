// Districts, landmasses and their stories (plans/V2_GEOLOGY_PLAN.md G6): the soft washes of the Deposits and Ages views
// turned into things a worldbuilder can name — each district a place (its richest point, its grade, its size), where it
// came from (read off the history's record there: "quartz veins deep in a collision belt last active 320 Myr ago, bared by
// ~9 km of wear"), and each landmass's share of every resource (the region summaries). All on the deposits' grid (each
// kept cell the richest of its terrain cells: deposits.js) — the page, the exports and the checks alike.

import { CrustType, CrustFlag, OrogenyType, VolcanicType } from '../tectonics/model/crust.js';
import { GeoFlag, decodeCoverKm, decodeExhumKm, decodeUnroofKm, decodeFacies, decodeArcMyr, decodeAge, decodeFloodAge } from '../tectonics/model/geology.js';
import { DEPOSITS, METALS } from './deposits.js';
import { GEOLOGY } from './geology-config.js';

const R = 6371, RAD = Math.PI / 180;

/** The centre of a grid cell (full-grid index g): [lat, lon] in degrees. */
export function cellLatLon(Dp, g) { const y = Math.floor(g / Dp.w), x = g % Dp.w; return [90 - (y + 0.5) * Dp.step, -180 + (x + 0.5) * Dp.step]; }
/** A grid row's cell area (km²). */
const rowKm2 = (Dp, y) => { const d = Dp.step * RAD; return R * R * d * d * Math.cos((90 - (y + 0.5) * Dp.step) * RAD); };
/** Great-circle distance (km). */
export function distKm(la1, lo1, la2, lo2) {
    const a = Math.sin(la1 * RAD) * Math.sin(la2 * RAD) + Math.cos(la1 * RAD) * Math.cos(la2 * RAD) * Math.cos((lo2 - lo1) * RAD);
    return R * Math.acos(Math.max(-1, Math.min(1, a)));
}

const keptIndexes = new WeakMap();
/** Each full-grid cell's kept index (−1 where none), kept per deposits grid. */
export function keptIndex(Dp) {
    let k = keptIndexes.get(Dp);
    if (!k) { k = new Int32Array(Dp.w * Dp.h).fill(-1); for (let j = 0; j < Dp.cells.length; j++) k[Dp.cells[j]] = j; keptIndexes.set(Dp, k); }
    return k;
}
/** The kept neighbours of kept cell j (8 of them, wrapping east–west), into `out`; returns how many. */
function neighbours(Dp, kept, j, out) {
    const g = Dp.cells[j], y = Math.floor(g / Dp.w), x = g % Dp.w;
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= Dp.h) continue;
        for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const t = kept[yy * Dp.w + (x + dx + Dp.w) % Dp.w];
            if (t >= 0) out[n++] = t;
        }
    }
    return n;
}

const landmassCache = new WeakMap();
/**
 * The landmasses: land connected on the grid (8 neighbours, wrapping east–west), largest first.
 * @returns {{of: Int32Array, list: {id: number, km2: number, lat: number, lon: number}[]}} of: each kept cell's landmass
 *   (−1 at sea, and the cells filled in toward the poles)
 */
export function landmasses(Dp) {
    if (landmassCache.has(Dp)) return landmassCache.get(Dp);
    const K = Dp.cells.length, kept = keptIndex(Dp), of = new Int32Array(K).fill(-1), nb = new Int32Array(8), stack = [], parts = [];
    for (let j0 = 0; j0 < K; j0++) {
        if (of[j0] >= 0 || !Dp.land[j0]) continue;
        const id = parts.length;
        let km2 = 0, sx = 0, sy = 0, sz = 0;
        of[j0] = id; stack.push(j0);
        while (stack.length) {
            const j = stack.pop(), [la, lo] = cellLatLon(Dp, Dp.cells[j]), a = rowKm2(Dp, Math.floor(Dp.cells[j] / Dp.w));
            km2 += a; sx += a * Math.cos(la * RAD) * Math.cos(lo * RAD); sy += a * Math.cos(la * RAD) * Math.sin(lo * RAD); sz += a * Math.sin(la * RAD);
            const m = neighbours(Dp, kept, j, nb);
            for (let i = 0; i < m; i++) { const t = nb[i]; if (of[t] < 0 && Dp.land[t]) { of[t] = id; stack.push(t); } }
        }
        parts.push({ id, km2, lat: Math.atan2(sz, Math.hypot(sx, sy)) / RAD, lon: Math.atan2(sy, sx) / RAD });
    }
    // (largest first: renumbered by size)
    const order = parts.map((p, i) => i).sort((a, b) => parts[b].km2 - parts[a].km2), to = new Int32Array(parts.length);
    order.forEach((i, r) => { to[i] = r; });
    for (let j = 0; j < K; j++) if (of[j] >= 0) of[j] = to[of[j]];
    const list = order.map((i, r) => ({ ...parts[i], id: r }));
    const out = { of, list };
    landmassCache.set(Dp, out);
    return out;
}

/** A landmass's name for the readout and the exports: by its size among the world's. */
export function landmassName(L, id) {
    if (id < 0) return 'offshore';
    const km2 = L.list[id].km2, ord = ['the largest', 'the second largest', 'the third largest', 'the fourth largest', 'the fifth largest'];
    const kind = km2 >= 3e6 ? 'continent' : km2 >= 150e3 ? 'landmass' : 'island';
    return id < ord.length && km2 >= 150e3 ? `${ord[id]} ${kind}` : `${kind === 'island' ? 'an' : 'a'} ${kind} of ${fmtKm2(km2)}`;
}
export const fmtKm2 = a => (a >= 1e6 ? `${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)} million km²` : `${(Math.round(a / (a >= 1e5 ? 1e4 : a >= 1e4 ? 1e3 : 100)) * (a >= 1e5 ? 1e4 : a >= 1e4 ? 1e3 : 100)).toLocaleString()} km²`);

/**
 * A field's districts: its ground connected at moderate or better (or, on a world where it has none, poor) — one district
 * a patch, a large patch split around its peaks (each at least `sepKm` from a richer one; each cell to its nearest peak
 * along the ground) — the richest (grade × size) first.
 * @param {Float32Array|Uint8Array} field per kept cell, 0…1 (or 0…255 with `bytes`)
 * @returns {{j: number, lat: number, lon: number, v: number, km2: number, score: number, landmass: number, cells: number[]}[]}
 */
export function findDistricts(Dp, field, { sepKm = 200, bytes = false } = {}) {
    const K = Dp.cells.length, kept = keptIndex(Dp), [p0, p1] = GEOLOGY.deposits.grades, k = bytes ? 1 / 255 : 1, nb = new Int32Array(8);
    let min = p1;
    { let any = false; for (let j = 0; j < K && !any; j++) if (field[j] * k >= p1) any = true; if (!any) min = p0; }
    const comp = new Int32Array(K).fill(-1), owner = new Int32Array(K).fill(-1), L = landmasses(Dp), out = [];
    for (let j0 = 0; j0 < K; j0++) {
        if (comp[j0] >= 0 || field[j0] * k < min) continue;
        // the patch
        const patch = [j0];
        comp[j0] = j0;
        for (let i = 0; i < patch.length; i++) {
            const m = neighbours(Dp, kept, patch[i], nb);
            for (let q = 0; q < m; q++) { const t = nb[q]; if (comp[t] < 0 && field[t] * k >= min) { comp[t] = j0; patch.push(t); } }
        }
        // its peaks: local highs, richest first, each at least sepKm from a richer one
        const highs = patch.filter(j => { const m = neighbours(Dp, kept, j, nb); for (let q = 0; q < m; q++) if (comp[nb[q]] === j0 && field[nb[q]] > field[j]) return false; return true; })
            .sort((a, b) => field[b] - field[a]);
        const peaks = [];
        for (const j of highs) {
            const [la, lo] = cellLatLon(Dp, Dp.cells[j]);
            if (peaks.every(p => distKm(p.lat, p.lon, la, lo) >= sepKm)) peaks.push({ j, lat: la, lon: lo });
        }
        // each cell to its nearest peak along the patch (a breadth-first spread from all of them at once)
        const queue = peaks.map((p, i) => { owner[p.j] = i; return p.j; });
        for (let i = 0; i < queue.length; i++) {
            const j = queue[i], m = neighbours(Dp, kept, j, nb);
            for (let q = 0; q < m; q++) { const t = nb[q]; if (comp[t] === j0 && owner[t] < 0) { owner[t] = owner[j]; queue.push(t); } }
        }
        const parts = peaks.map(p => ({ j: p.j, lat: p.lat, lon: p.lon, v: field[p.j] * k, km2: 0, score: 0, landmass: -1, cells: [] }));
        for (const j of patch) {
            const d = parts[owner[j]], a = rowKm2(Dp, Math.floor(Dp.cells[j] / Dp.w));
            d.km2 += a; d.score += a * field[j] * k; d.cells.push(j);
            if (d.landmass < 0 && L.of[j] >= 0) d.landmass = L.of[j];
        }
        for (const d of parts) { if (L.of[d.j] >= 0) d.landmass = L.of[d.j]; out.push(d); }
        for (const j of patch) owner[j] = -1;
    }
    return out.sort((a, b) => b.score - a.score);
}

/**
 * The region summaries: each landmass's land poor / moderate / rich in each field (km²), and its area.
 * @param {Float32Array[]} fields per kept cell (0…1)
 * @returns {{km2: number, by: Float64Array}[]} by: 3 × fields.length
 */
export function landmassShares(Dp, fields) {
    const L = landmasses(Dp), [p0, p1, p2] = GEOLOGY.deposits.grades, out = L.list.map(l => ({ km2: l.km2, by: new Float64Array(3 * fields.length) }));
    for (let j = 0; j < Dp.cells.length; j++) {
        const id = L.of[j];
        if (id < 0) continue;
        const a = rowKm2(Dp, Math.floor(Dp.cells[j] / Dp.w)), by = out[id].by;
        for (let f = 0; f < fields.length; f++) { const v = fields[f][j]; if (v >= p2) by[3 * f + 2] += a; else if (v >= p1) by[3 * f + 1] += a; else if (v >= p0) by[3 * f] += a; }
    }
    return out;
}

// ── the atlas's symbols: an element's symbol, or a gem's or a stone's short name ──
export const SYMBOL = {
    iron: 'Fe', copper: 'Cu', gold: 'Au', silver: 'Ag', tin: 'Sn', leadZinc: 'Pb', leadSilver: 'Pb', arsenic: 'As', aluminium: 'Al', nickel: 'Ni',
    platinum: 'Pt', diamonds: '◆', salt: 'Na', coal: 'C', oilGas: 'Oil', peat: 'Pe', bitumen: 'Bt', flint: 'Fl', obsidian: 'Ob', jade: 'Jd', agate: 'Agt',
    porphyry: 'Cu', epithermal: 'Au', orogenicGold: 'Au', vms: 'Cu', skarn: 'Cu', mvt: 'Pb', sedex: 'Pb', iocg: 'Fe', magmatic: 'Ni', layered: 'Pt',
    nativeCopper: 'Cu', kimberlite: '◆', greenstoneGold: 'Au', bif: 'Fe', reef: 'Au', oil: 'Oil', gas: 'Gas', bauxite: 'Al', niLaterite: 'Ni',
    ironLaterite: 'Fe', supergene: 'Cu', gossan: 'Au', placerGold: 'Au', placerTin: 'Sn', placerDiamond: '◆', ironstone: 'Fe', bogIron: 'Fe',
    pegmatite: 'Aq', emerald: 'Em', corundum: 'Ru', lapis: 'La', basaltGems: 'Sa', amethyst: 'Am', opal: 'Op', turquoise: 'Tq', garnet: 'Gt', gemPlacer: 'Ru',
    rubySapphire: 'Ru',
};

// ── the stories: how each kind of deposit came to be where it is, from the history's record at the district ──
export const BELT_KIND = { [OrogenyType.ANDEAN]: 'an Andean range', [OrogenyType.LARAMIDE]: 'a flat-slab range', [OrogenyType.URAL]: 'a collision belt', [OrogenyType.HIMALAYAN]: 'a great collision belt',
    [OrogenyType.ARC]: 'a volcanic arc', [OrogenyType.RIFT]: 'rift shoulders', [OrogenyType.TRANSPRESSION]: 'a transform ridge' };
const ARCS = new Set([OrogenyType.ANDEAN, OrogenyType.ARC, OrogenyType.LARAMIDE]);
const COLLISIONS = new Set([OrogenyType.URAL, OrogenyType.HIMALAYAN, OrogenyType.TRANSPRESSION]);
const myr = v => `${Math.round(v).toLocaleString()} Myr`;
const ago = v => (v <= 5 ? 'in the last few Myr' : `${myr(v)} ago`);
/** A belt in words — its kind and when it was last active (`prev`: the belt it overprinted). */
function beltWords(f, w, prev = false) {
    const type = prev ? f.prevType[w] : f.oroType[w], last = prev ? f.prevLast[w] : f.oroLast[w];
    if (!type) return null;
    const kind = BELT_KIND[type];
    if (last < 0) return `${kind} from before the history`;
    const age = f.time - last;
    return age <= 10 ? `${kind} still rising` : `${kind} last active ${myr(age)} ago`;
}
/** The arc a cell's ores came from, in words. */
function arcWords(f, w) {
    if (ARCS.has(f.oroType[w])) return beltWords(f, w);
    if (f.type[w] === CrustType.ARC) return 'an island arc';
    if (f.geoFlags[w] & GeoFlag.WAS_ARC) return 'an island arc that has since docked';
    const a = decodeArcMyr(f.arcMyr[w]);
    return a > 0 ? `an arc that stood here for ${myr(a)}` : 'an old volcanic arc';
}
/** The collision belt a cell lies in, in words (its own, or the one it overprinted, or the suture). */
function collisionWords(f, w) {
    if (COLLISIONS.has(f.oroType[w])) return beltWords(f, w);
    if (COLLISIONS.has(f.prevType[w])) return beltWords(f, w, true);
    if (f.flags[w] & CrustFlag.SUTURE) return 'an old suture, where a sea closed';
    return beltWords(f, w) ?? 'the old crust\'s mobile belts';
}
/** How it was bared: as its belt rises, or by the wear since the belt went quiet (unroofKm) — or, on the old crust, its whole wear. */
const worn = (f, w) => {
    if (f.oroType[w] && f.oroLast[w] >= 0 && f.time - f.oroLast[w] <= 10) return ', bared as the range rises';
    const e = f.oroType[w] && f.oroLast[w] >= 0 ? Math.max(0, decodeUnroofKm(f.unroofKm[w])) : decodeExhumKm(f.exhumKm[w]);
    return e >= 1 ? `, bared by ~${Math.round(e)} km of wear since` : '';
};
/** Where a basin's cover was laid. */
function basinWords(f, w) {
    const geo = f.geoFlags[w];
    return geo & GeoFlag.FORELAND ? 'a foreland basin' : geo & GeoFlag.RIFT_BASIN || f.flags[w] & CrustFlag.FAILED_RIFT ? 'a rift basin' : f.flags[w] & CrustFlag.RIFT_MARGIN ? 'a young passive margin' : geo & (GeoFlag.EPEIRIC | GeoFlag.SHELF) ? 'a shallow sea' : 'the old platform';
}

// each kind: how well a record cell fits its setting (to choose the cell the story reads), and the story
const fac = { carb: 0, salt: 0, coal: 0, organic: 0 };
const isArc = (f, w) => ARCS.has(f.oroType[w]) || f.type[w] === CrustType.ARC || (f.geoFlags[w] & GeoFlag.WAS_ARC) || f.arcMyr[w] > 0;
const isColl = (f, w) => COLLISIONS.has(f.oroType[w]) || COLLISIONS.has(f.prevType[w]) || !!(f.flags[w] & CrustFlag.SUTURE);
const isCraton = (f, w) => f.type[w] === CrustType.CRATON;
const isLip = (f, w) => f.volcType[w] === VolcanicType.LIP;
const hasCover = (f, w) => decodeCoverKm(f.coverMaxKm[w]) > 0.5;
const STORIES = {
    porphyry: [isArc, (f, w) => { const un = Math.max(0, decodeUnroofKm(f.unroofKm[w])), live = ARCS.has(f.oroType[w]) && f.time - f.oroLast[w] <= 10;
        return `formed 1–4 km beneath ${arcWords(f, w)}, ${live ? 'bared as the range rises' : un >= 0.5 ? `bared by ~${Math.round(un)} km of erosion since` : 'its top just bared'}`; }],
    epithermal: [isArc, (f, w) => `hot springs over ${arcWords(f, w)} — young ore, gone once erosion takes its first kilometre`],
    orogenicGold: [isColl, (f, w) => `quartz veins deep in ${collisionWords(f, w)}${worn(f, w)}`],
    vms: [(f, w) => isArc(f, w) || !!(f.geoFlags[w] & GeoFlag.OPHIOLITE), (f, w) => `sea-floor vents of ${f.geoFlags[w] & GeoFlag.OPHIOLITE ? 'old sea floor, thrust up where a sea closed' : f.type[w] === CrustType.ARC ? 'an island arc' : 'an island arc that has since docked onto land'}`],
    skarn: [(f, w) => !!f.oroType[w], (f, w) => `where the granites of ${beltWords(f, w) ?? 'an old belt'} were pushed into limestone`],
    mvt: [(f, w) => !!(f.geoFlags[w] & GeoFlag.FORELAND), (f, w) => `brines driven through the limestone of ${basinWords(f, w)} by a rising range`],
    sedex: [(f, w) => !!(f.geoFlags[w] & GeoFlag.RIFT_BASIN || f.flags[w] & (CrustFlag.FAILED_RIFT | CrustFlag.RIFT_MARGIN)), (f, w) => `hot vents on the muddy floor of ${basinWords(f, w)}, under ${decodeCoverKm(f.coverMaxKm[w]).toFixed(1)} km of its mud`],
    tin: [isColl, (f, w) => `granites of melted sediment, far inboard of ${COLLISIONS.has(f.oroType[w]) || ARCS.has(f.oroType[w]) ? beltWords(f, w) : collisionWords(f, w)}${worn(f, w)}`],
    iocg: [isCraton, (f, w) => `a craton's edge, reworked by ${beltWords(f, w) ?? beltWords(f, w, true) ?? 'a plume'}`],
    magmatic: [isLip, (f, w) => `the feeders of a flood basalt erupted ${ago(f.time - f.volcAt[w])}, where it crossed a craton's edge`],
    layered: [isCraton, (f, w) => (isLip(f, w) ? `a great magma chamber under a flood basalt erupted ${ago(f.time - f.volcAt[w])}, bared as its lavas wore away` : 'a great magma chamber in the craton, older than the history, bared by its long wear')],
    nativeCopper: [isLip, (f, w) => `flood basalt that filled a rift ${ago(f.time - f.volcAt[w])} — copper ready to hammer`],
    kimberlite: [isCraton, () => 'pipes from 150 km down under an ancient craton — some cratons are rich, most barren'],
    greenstoneGold: [isCraton, () => 'the ancient greenstone belts of a shield, from before the history began'],
    bif: [isCraton, () => 'an ancient ocean\'s iron, laid on the shield before the history began'],
    reef: [isCraton, () => 'the world\'s one great fossil gold placer, on its oldest shield'],
    oil: [hasCover, (f, w) => petroleum(f, w, 'organic mud', 'in the oil window')],
    gas: [hasCover, (f, w) => { decodeFacies(f.facies[w], fac); return petroleum(f, w, fac.coal > fac.organic ? 'coal' : 'organic mud', 'past the oil window into gas'); }],
    bitumen: [hasCover, (f, w) => { const off = Math.max(0, decodeCoverKm(f.coverMaxKm[w]) - decodeCoverKm(f.coverKm[w])); return `an oil basin lifted and opened — ~${off.toFixed(1)} km of its roof worn away: seeps, tar and oil shale`; }],
    bauxite: [null, () => 'rock weathered for millions of years on hot, wet, gentle ground'],
    niLaterite: [null, () => 'old sea floor and greenstone weathered in the warm, wet tropics'],
    ironLaterite: [null, () => 'the red iron crust of warm, long-weathered ground'],
    supergene: [isArc, (f, w) => `copper ore of ${arcWords(f, w)}, weathered rich under a long dry season`],
    gossan: [null, () => 'the rusty cap of a weathered sulfide body — gold and silver at the surface'],
    placerGold: [null, () => 'gold carried down the rivers from the veins upstream'],
    placerTin: [null, () => 'tin stone washed down from the tin granites upstream'],
    placerDiamond: [null, () => 'diamonds carried far down the rivers from the pipes'],
    salt: [null, (f, w) => { decodeFacies(f.facies[w], fac); return fac.salt > 0.1 ? `old salt beds of a dry, restricted sea${f.floodAge[w] && decodeFloodAge(f.floodAge[w]) > 5 ? ` (the sea last here ${myr(decodeFloodAge(f.floodAge[w]))} ago)` : ''}, bared in a dry land` : 'salt lakes, pans and flats of the dry country'; }],
    ironstone: [hasCover, (f, w) => { decodeFacies(f.facies[w], fac); return fac.coal > 0.03 ? 'the clay ironstone of coal measures' : `iron oolites of a warm shallow sea${f.floodAge[w] && decodeFloodAge(f.floodAge[w]) > 5 ? `, last there ${myr(decodeFloodAge(f.floodAge[w]))} ago` : ''}`; }],
    bogIron: [null, () => 'iron settled in wet, sandy lowlands — the first iron'],
    coal: [hasCover, (f, w) => `swamps of ${basinWords(f, w)} that lay in a wet belt — coal measures in its ${decodeCoverKm(f.coverMaxKm[w]).toFixed(1)} km of fill, bared by erosion`],
    peat: [null, () => 'wet, flat, badly drained ground with a warm wet season'],
    wood: [null, () => 'the forest'],
    flint: [null, () => 'nodules in chalk and limestone, and in the river gravels below them'],
    obsidian: [isArc, (f, w) => `volcanic glass of ${arcWords(f, w)}`],
    jade: [(f, w) => !!(f.geoFlags[w] & GeoFlag.OPHIOLITE) || !!(f.flags[w] & CrustFlag.SUTURE), () => 'serpentinite and mélange of old sea floor, thrust up where a sea closed'],
    agate: [isLip, (f, w) => (isLip(f, w) ? `silica in the cavities of a flood basalt erupted ${ago(f.time - f.volcAt[w])}` : 'silica in the cavities of old lavas')],
    pegmatite: [isColl, (f, w) => `the last melts of granites deep in ${collisionWords(f, w)}${worn(f, w)}`],
    emerald: [(f, w) => isColl(f, w) || !!f.oroType[w], (f, w) => { decodeFacies(f.facies[w], fac); return fac.organic > 0.04 && f.oroType[w] ? `hot brines through the black shale of ${beltWords(f, w)}` : `pegmatites cutting old sea floor in ${collisionWords(f, w)}`; }],
    corundum: [isColl, (f, w) => `the limestone of ${f.flags[w] & CrustFlag.RIFT_MARGIN ? 'a passive margin' : 'a shallow sea'}, baked to marble deep in ${collisionWords(f, w)}${worn(f, w)}`],
    lapis: [isColl, (f, w) => `marble where a granite of ${collisionWords(f, w)} touched it`],
    basaltGems: [(f, w) => f.volcType[w] === VolcanicType.TRACK, (f, w) => `carried up from the mantle by a hotspot's lavas, ${ago(f.time - f.volcAt[w])}`],
    amethyst: [isLip, (f, w) => `crystal-lined cavities of a flood basalt erupted ${ago(f.time - f.volcAt[w])}`],
    opal: [null, () => 'silica from ground weathered deep, set in the sandstone of dry country'],
    turquoise: [null, () => 'copper ore weathered under a desert sky'],
    garnet: [(f, w) => !!f.oroType[w] || !!f.prevType[w], (f, w) => `grown in the schist and gneiss of ${beltWords(f, w) ?? beltWords(f, w, true) ?? 'the old crust'}`],
    gemPlacer: [null, () => 'rubies, sapphires and garnets washed down from their sources into a river\'s gravels'],
};
function petroleum(f, w, source, window) {
    decodeFacies(f.facies[w], fac);
    const geo = f.geoFlags[w], trap = f.oroType[w] || geo & GeoFlag.FORELAND ? 'in the folds of a range' : fac.salt > 0.08 ? 'under salt' : geo & GeoFlag.RIFT_BASIN || f.flags[w] & CrustFlag.FAILED_RIFT ? 'in its tilted blocks' : 'in its own layers';
    const deepest = decodeAge(f.coverMaxAge[w]);
    return `${source} buried ${decodeCoverKm(f.coverMaxKm[w]).toFixed(1)} km deep in ${basinWords(f, w)}${deepest > 5 ? ` (deepest ${myr(deepest)} ago)` : ''} — cooked ${window}, trapped ${trap}`;
}

/**
 * A district's story: how its kind of deposit came to be there, read off the record of whichever of its cells (`ws`, the
 * history's cells under it, the richest first) best fits the kind's setting — or the kind's own words.
 */
export function districtStory(sysId, f, ws) {
    const d = DEPOSITS.find(x => x.id === sysId), s = STORIES[sysId], cap = t => t[0].toUpperCase() + t.slice(1);
    if (!d) return '';
    if (!s || !f || !ws?.length) return cap(d.words);
    const [fits, tell] = s, valid = ws.filter(x => x >= 0 && x < f.owner.length && f.owner[x] >= 0);
    const w = fits ? valid.find(x => fits(f, x)) : valid[0];
    return cap(w === undefined ? d.words : tell(f, w));
}

/**
 * The kind of deposit behind a district of a resource: of its sources (system ids with weights and cut-offs: a metal's
 * or an age's), the one giving most at the district's peak.
 */
export function districtSource(Dp, from, j) {
    const K = Dp.cells.length;
    let best = null, bv = 0;
    for (const [id, w = 1, cut = 0] of from) {
        if (id.startsWith('m:')) {
            const m = METALS.find(x => x.id === id.slice(2));
            const s = m && districtSource(Dp, m.sources, j);
            if (s && s.v * w > bv) { best = s.id; bv = s.v * w; }
            continue;
        }
        const k = DEPOSITS.findIndex(x => x.id === id);
        if (k < 0) continue;
        const x = Dp.data[k * K + j] / 255, v = w * (x > cut ? (x - cut) / (1 - cut) : 0);
        if (v > bv) { best = id; bv = v; }
    }
    return best ? { id: best, v: bv } : null;
}
