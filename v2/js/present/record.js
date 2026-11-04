// G7c — the geological record of the present-day world (plans/GENERATE_REDESIGN_PLAN.md G7b; owner, 2026-11-04:
// "implement the other layers in evolution here. The rocks and food").
//
// Evolution's history keeps a record as it goes (tectonics/step/geology.js): the sediment laid on each piece of crust
// and its make-up, how deep erosion has cut into the basement beneath, how long the piece lay under shallow sea and stood
// in a live arc, and the settings it has been in (a foreland, a shelf, an inland sea, a rift basin, a closed sea's floor,
// born in an arc). The rocks and the deposits (geology/rocks.js, deposits.js) read it off the Frame. The present-day
// world has no history run, so its record is written here in closed form, from what the world already knows:
//   · how deep each place is worn: a shield deepest (its granulite gneiss); an old belt by its age (the past replayed,
//     present/past.js: a range ~200 Myr old shows its slate, ~1500 its gneiss); today's belts by how much they have
//     raised (their cores); the platforms not at all (their cover keeps them);
//   · its cover: thick in the basins (where the swells sag), thin on the swells, gone off the shields where they show
//     and off the belts' cores, thickest at the foot of a range (a foreland), on a passive margin's coastal plain (its
//     wedge) and in a rift's valley;
//   · the cover's make-up by the latitude it lay at (as the history lays it, by a zonal palaeoclimate — here today's
//     latitude, wandered by the drift: carbonate in warm seas, salt in the arid belts' restricted seas, coal in the wet
//     belts' basins, organic-rich mud in rifts and restricted seas);
//   · its time under shallow sea (the low interiors flooded at the high stands, the shelves), in a live arc (today's
//     subduction belts by how long they have been at work; the arcs' own crust), and the settings.
// Records only: nothing else reads them but the rocks, the deposits and the food.

import { CrustType, CrustFlag, OrogenyType } from '../tectonics/model/crust.js';
import { GeoFlag } from '../tectonics/model/geology.js';
import { MinHeap } from '../core/min-heap.js';
import { FastNoise } from '../core/fast-noise.js';
import { makeRng } from '../../../js/rng.js';
import { PRESENT } from './present-config.js';

const R = 6371, DEG = 180 / Math.PI;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const LIVE_ARC = new Set([OrogenyType.ANDEAN, OrogenyType.ARC, OrogenyType.LARAMIDE]);

/**
 * Writes the record into the crust raster (model/crust.js: coverKm, coverMaxKm, coverMaxAt, coverCarb/Salt/Coal/Organic,
 * exhumKm, unroofKm, floodMyr, floodLast, arcMyr, geoFlags), at time 0 (now).
 * @param {Object} L  the layout   @param {Uint8Array} land  the land per sim cell (as drawn)
 * @param {import('../tectonics/model/crust.js').CrustRaster} crust  after the past, today's belts, the far field and the plumes
 * @param {{tier: Uint8Array}} past  present/past.js (which past event last raised each cell)
 * @param {Object} geo  the history's geology config (tectonics/config.js geology: the latitude bands, the shares)
 * @returns {Object} the record's shares, for the checks
 */
export function presentRecord(L, land, crust, past, geo, cfg = PRESENT) {
    const { sim, seed } = L, n = sim.numCells, { adjOffset, adjList, xyz } = sim;
    const kmOf = (a, b) => R * Math.acos(Math.max(-1, Math.min(1, xyz[3 * a] * xyz[3 * b] + xyz[3 * a + 1] * xyz[3 * b + 1] + xyz[3 * a + 2] * xyz[3 * b + 2])));
    const noise = new FastNoise((seed ^ 0x6e0c) >>> 0);
    const nAt = (c, km, off) => { const f = R / km; return noise.noise3D(xyz[3 * c] * f + off, xyz[3 * c + 1] * f - off, xyz[3 * c + 2] * f + 0.5 * off); };
    const isLand = (c) => land[c] && crust.type[c] !== CrustType.OCEAN;
    const live = (c) => crust.oroType[c] !== OrogenyType.NONE && crust.oroLast[c] === 0;

    // how far from the sea; from a live range's outer edge over the plain beside it (the foreland)
    const toSea = dijkstra(n, adjOffset, adjList, kmOf, (c) => !isLand(c), isLand, Infinity);
    const range = (c) => live(c) && crust.oroType[c] !== OrogenyType.RIFT && crust.oroType[c] !== OrogenyType.ARC && crust.oroType[c] !== OrogenyType.INTRAPLATE
        && crust.beltU[c] >= geo.forelandEdgeU;
    const toRange = dijkstra(n, adjOffset, adjList, kmOf, range, (c) => isLand(c) && !live(c), geo.forelandKm);
    const toRift = dijkstra(n, adjOffset, adjList, kmOf, (c) => isLand(c) && !!(crust.flags[c] & (CrustFlag.FAILED_RIFT | CrustFlag.RIFT_MARGIN)), isLand, cfg.recRiftKm * 3);
    // a coast that is a passive margin (no live range or arc at it): its shelf and coastal plain
    const active = dijkstra(n, adjOffset, adjList, kmOf, (c) => isLand(c) && live(c) && crust.oroType[c] !== OrogenyType.RIFT, isLand, cfg.recActiveCoastKm);

    const terraneHash = new Map();
    const hashOf = (t, salt) => { const k = t * 8 + salt; if (!terraneHash.has(k)) terraneHash.set(k, makeRng((seed ^ 0x5e1d) + t * 7919 + salt * 131)()); return terraneHash.get(k); };
    const warmShare = (lat) => 1 - smooth(geo.warmLat[0], geo.warmLat[1], lat);
    const aridShare = (lat) => smooth(geo.aridLat[0], geo.aridLat[1], lat) * (1 - smooth(geo.aridLat[2], geo.aridLat[3], lat));
    const wetShare = (lat) => Math.max(1 - smooth(geo.wetLat[0], geo.wetLat[1], lat), smooth(geo.wetLat[2], geo.wetLat[3], lat) * (1 - smooth(geo.wetLat[4], geo.wetLat[5], lat)));
    const stats = { land: 0, covered: 0, shield: 0, foreland: 0, shelf: 0, epeiric: 0, rift: 0, ophiolite: 0, arc: 0, accreted: 0, accretedBare: 0, belted: 0 };

    for (let c = 0; c < n; c++) {
        if (!isLand(c)) continue;
        stats.land++;
        const type = crust.type[c], oro = crust.oroType[c], u = Math.min(1, crust.beltU[c]), core = 1 - smooth(cfg.recCoreU[0], cfg.recCoreU[1], u);
        const isLive = live(c), age = oro && !isLive ? -crust.oroLast[c] : 0;
        let flags = crust.geoFlags[c];
        // (some of the pieces docked in the past came as island arcs: their crust born in one — a docked terrane's own draw)
        const accreted = type !== CrustType.CRATON && type !== CrustType.ARC && !isLive && hashOf(crust.terrane[c], 2) < cfg.recAccretedArcShare;
        // ── how deep the basement is worn ──
        let exhum = 0;
        if (type === CrustType.CRATON) exhum = cfg.recShieldExhumKm[0] + (cfg.recShieldExhumKm[1] - cfg.recShieldExhumKm[0]) * hashOf(crust.terrane[c], 1);
        else if (oro && !isLive) exhum = (cfg.recPastExhumKm[0] + (cfg.recPastExhumKm[1] - cfg.recPastExhumKm[0]) * (1 - Math.exp(-age / cfg.recExhumMyr))) * core;
        else if (isLive && oro !== OrogenyType.RIFT) exhum = Math.min(cfg.recLiveExhumMaxKm, cfg.recLiveExhumPerKm * (crust.upliftKm[c] + crust.rugged[c])) * core;
        // ── the cover: the platform's by the swell (a basin's thick, a swell's thin), varied ──
        const basin = smooth(cfg.recSwellKm[1], cfg.recSwellKm[0], crust.baseKm[c]);
        let cover = (cfg.recPlatformKm[0] + (cfg.recPlatformKm[1] - cfg.recPlatformKm[0]) * basin) * (1 + cfg.recCoverVary * nAt(c, 900, 3.1));
        // (a shield shows where it stands high or the noise bares it; elsewhere a thin platform lies over it)
        if (type === CrustType.CRATON) {
            const bare = smooth(-0.15, 0.15, nAt(c, cfg.recShieldPatchKm, 7.7) + cfg.recShieldBare - 0.6 * basin);
            cover *= cfg.recShieldCover * (1 - bare);
            if (bare > 0.5) stats.shield++;
        }
        // (a belt's core is stripped to its basement; its outer zone keeps its folded and thrust sediment)
        // (and thickened there, its sheets thrust over one another: a fold-and-thrust belt — the Zagros, the Valley and Ridge)
        if (oro && oro !== OrogenyType.RIFT) cover *= cfg.recBeltThicken * smooth(cfg.recCoreU[0], cfg.recCoreU[1], u) * (exhum > cfg.recStripKm ? 0.4 : 1);
        // (a docked arc stands bare of most cover, worn into its volcanic pile and down to its plutons in places)
        if (accreted) stats.accreted++; if (oro) stats.belted++;
        if (accreted && !oro) { stats.accretedBare++; exhum = Math.max(exhum, cfg.recAccretedExhumKm[0] + (cfg.recAccretedExhumKm[1] - cfg.recAccretedExhumKm[0]) * hashOf(crust.terrane[c], 3)); }
        // the foreland at a live range's foot
        const fd = toRange[c];
        if (fd < geo.forelandKm) {
            const f = Math.exp(-fd / (0.45 * geo.forelandKm));
            cover += cfg.recForelandKm * f;
            if (f > 0.3) { flags |= GeoFlag.FORELAND; stats.foreland++; }
        }
        // a passive margin's coastal plain and shelf wedge (the lowland near the coast, no live range at it)
        const coastal = active[c] < Infinity ? 0 : Math.exp(-toSea[c] / cfg.recShelfKm) * smooth(cfg.recShelfHighKm, 0, crust.baseKm[c] + crust.upliftKm[c]);
        cover += cfg.recShelfCoverKm * coastal;
        if (coastal > 0.35) { flags |= GeoFlag.SHELF; stats.shelf++; }
        // a rift's basin
        const rf = toRift[c] < Infinity ? Math.exp(-toRift[c] / cfg.recRiftKm) : 0;
        cover += cfg.recRiftCoverKm * rf;
        if (rf > 0.5) { flags |= GeoFlag.RIFT_BASIN; stats.rift++; }
        // (a docked arc stands bare of most cover, and an arc's own young crust of nearly all: their volcanics and plutons show)
        if (accreted && !oro) cover *= cfg.recAccretedCover;
        if (type === CrustType.ARC) cover *= cfg.recArcCover;
        // (a live arc's volcanoes stand on their own pile: no cover over the arc's band across an Andean belt)
        if (isLive && (oro === OrogenyType.ANDEAN || oro === OrogenyType.ARC)) cover *= cfg.recArcCover + (1 - cfg.recArcCover) * smooth(cfg.recArcBandU[0], cfg.recArcBandU[1], u);
        cover = Math.max(0, cover);
        // ── under shallow sea: the low interiors at the high stands (inland seas), the shelves ──
        const low = basin * smooth(cfg.recFloodFromKm, cfg.recFloodFromKm * 0.4, toSea[c] < cfg.recFloodCoastKm ? 0 : crust.upliftKm[c] + crust.rugged[c]);
        const floodMyr = cfg.recFloodMyr * Math.max(low * (0.5 + 0.5 * nAt(c, 1400, 11.3) ** 2 * 4), coastal * 0.6);
        if (low > 0.45 && floodMyr > 20) { flags |= GeoFlag.EPEIRIC; stats.epeiric++; }
        const floodLast = -(cfg.recFloodAgoMyr[0] + (cfg.recFloodAgoMyr[1] - cfg.recFloodAgoMyr[0]) * (0.5 + 0.5 * nAt(c, 2000, 5.5)));
        // ── the cover's make-up, by the latitude it lay at (today's, wandered by the drift) ──
        const lat = Math.abs(Math.asin(Math.max(-1, Math.min(1, xyz[3 * c + 2]))) * DEG + cfg.recDriftDeg * nAt(c, 3000, 17.9));
        const marine = Math.max(low, coastal), restricted = smooth(geo.restrictedKm[0], geo.restrictedKm[1], toSea[c]);
        const carb = marine * (warmShare(lat) + (1 - warmShare(lat)) * geo.coolCarbonate);
        const salt = geo.saltShare * aridShare(lat) * Math.max(restricted * low, rf);
        const coal = geo.coalShare * wetShare(lat) * Math.max(fd < geo.forelandKm ? Math.exp(-fd / geo.forelandKm) : 0, coastal * 0.6, basin * 0.4);
        const organic = geo.organicShare * Math.max(rf, restricted * low, 0.3 * coastal);
        crust.coverCarb[c] = carb; crust.coverSalt[c] = salt; crust.coverCoal[c] = coal; crust.coverOrganic[c] = organic;
        crust.coverKm[c] = cover;
        // (what lay on it at most: its cover before a belt stripped it, laid when it last sank)
        const stripped = oro && oro !== OrogenyType.RIFT ? cfg.recPlatformKm[1] * (1 - smooth(cfg.recCoreU[0], cfg.recCoreU[1], u)) : 0;
        crust.coverMaxKm[c] = cover + stripped; crust.coverMaxAt[c] = oro && !isLive ? -age : floodLast;
        crust.exhumKm[c] = exhum;
        // (since its latest belt was last active: worn this much, less what has buried it since; a live one counts from now)
        crust.unroofKm[c] = isLive ? 0 : exhum - cover;
        crust.floodMyr[c] = floodMyr; crust.floodLast[c] = floodLast;
        // ── a live arc's time, and the arcs' own crust ──
        if (isLive && LIVE_ARC.has(oro)) crust.arcMyr[c] = Math.max(crust.arcMyr[c], -crust.oroStart[c] * (1 - smooth(0.4, 0.8, u)));
        if (type === CrustType.ARC) { flags |= GeoFlag.WAS_ARC; crust.arcMyr[c] = Math.max(crust.arcMyr[c], Math.min(cfg.recArcMaxMyr, -crust.formedAt[c])); stats.arc++; }
        // (some of the pieces docked in the past came as island arcs: their crust born in one)
        else if (accreted) { flags |= GeoFlag.WAS_ARC; crust.arcMyr[c] = Math.max(crust.arcMyr[c], cfg.recAccretedArcMyr); }
        if (oro === OrogenyType.LARAMIDE && isLive) flags |= GeoFlag.SLAB_CHANGE;
        // ── a closed sea's floor caught up along a suture: ophiolite slivers ──
        if ((crust.flags[c] & CrustFlag.SUTURE) && type !== CrustType.CRATON && nAt(c, cfg.recOphioliteKm, 23.3) > 1 - 2 * cfg.recOphioliteShare) { flags |= GeoFlag.OPHIOLITE; stats.ophiolite++; }
        crust.geoFlags[c] = flags;
        if (cover > 0.05) stats.covered++;
    }
    return Object.fromEntries(Object.entries(stats).map(([k, v]) => [k, k === 'land' ? v : +(v / Math.max(1, stats.land)).toFixed(3)]));
}

/** km from the cells `isSource` marks, over the cells `canEnter` allows, out to maxKm (Infinity beyond). */
function dijkstra(n, adjOffset, adjList, kmOf, isSource, canEnter, maxKm) {
    const d = new Float64Array(n).fill(Infinity), heap = new MinHeap(4096);
    for (let c = 0; c < n; c++) if (isSource(c)) { d[c] = 0; heap.push(0, c); }
    while (heap.size) {
        const c = heap.pop(), dc = heap.lastKey;
        if (dc > d[c]) continue;
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
            const nb = adjList[k];
            if (!canEnter(nb)) continue;
            const nd = dc + kmOf(c, nb);
            if (nd < d[nb] && nd <= maxKm) { d[nb] = nd; heap.push(nd, nb); }
        }
    }
    return d;
}
