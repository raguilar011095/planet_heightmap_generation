// G7c — the geological record of the present-day world (plans/GENERATE_REDESIGN_PLAN.md G7b; owner, 2026-11-04:
// "implement the other layers in evolution here. The rocks and food"; 2026-11-05: the deposits "doesnt look like evolution
// or have similar distribution" → plans/GENERATE_DEPOSITS_PLAN.md).
//
// Evolution's history keeps a record as it goes (tectonics/step/geology.js): the sediment laid on each piece of crust
// and its make-up, how deep erosion has cut into the basement beneath, how long the piece lay under shallow sea and stood
// in a live arc, and the settings it has been in (a foreland, a shelf, an inland sea, a rift basin, a closed sea's floor,
// born in an arc). The rocks and the deposits (geology/rocks.js, deposits.js) read it off the Frame. The present-day
// world has no history run, so its record is written here in closed form — the history's own steps, in its order:
//   · the start (seedGeology): the old crust already worn deep — a shield by its own amount, the mobile belts about it
//     less — and a platform's cover in its sags;
//   · the belts since: an old belt worn deeper the longer ago it rose (the past replayed, present/past.js: a range
//     ~300 Myr old to schist, ~1500 to gneiss), today's by how much they stand; their cores stripped to the basement;
//   · the basins: a foreland in front of every belt that had one — today's and the past's (the history flags each place
//     a foreland once lay, as its belts came and went) — a rift basin along each margin an ocean opened (a passive
//     coast), each failed arm and each old parting seam, the shelf wedge of a passive margin, the inland seas of the low
//     interiors at the high stands;
//   · the cover's make-up: each setting lays its own (carbonate in warm clear seas, salt in the arid belt's restricted
//     seas and rifts, coal in the wet belts' forelands and coastal plains, organic-rich mud in restricted seas, rift lakes
//     and shelves at a high stand), the youngest on top — as the history keeps it (step/geology.js deposit: the top's
//     make-up, about its last faciesMixKm) — at the latitude it lay at (today's, wandered by the drift);
//   · a live arc's time, and the arcs docked in the past: their time in an arc and when it ended.
// Records only: nothing else reads them but the rocks, the deposits and the food (and the finish's relief by its rocks).

import { CrustType, CrustFlag, OrogenyType, VolcanicType } from '../tectonics/model/crust.js';
import { GeoFlag } from '../tectonics/model/geology.js';
import { MinHeap } from '../core/min-heap.js';
import { FastNoise } from '../core/fast-noise.js';
import { makeRng } from '../../../js/rng.js';
import { PRESENT } from './present-config.js';

const R = 6371, DEG = 180 / Math.PI;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const LIVE_ARC = new Set([OrogenyType.ANDEAN, OrogenyType.ARC, OrogenyType.LARAMIDE]);
const COLLIDES = new Set([OrogenyType.URAL, OrogenyType.HIMALAYAN, OrogenyType.TRANSPRESSION]);
// (the belts with a foreland in front: step/geology.js FORELAND_BELTS — an intraplate range too, the Tarim at the Tian Shan's feet)
const FORELAND_BELTS = new Set([OrogenyType.ANDEAN, OrogenyType.LARAMIDE, OrogenyType.URAL, OrogenyType.HIMALAYAN, OrogenyType.INTRAPLATE]);

/**
 * Writes the record into the crust raster (model/crust.js: coverKm, coverMaxKm, coverMaxAt, coverCarb/Salt/Coal/Organic,
 * exhumKm, unroofKm, floodMyr, floodLast, arcMyr, geoFlags), at time 0 (now).
 * @param {Object} L  the layout   @param {Uint8Array} land  the land per sim cell (as drawn)
 * @param {import('../tectonics/model/crust.js').CrustRaster} crust  after the past, today's belts, the far field and the plumes
 * @param {{tier: Uint8Array, terraneAge: Map<number, number>, sagCells: number[]}} past  present/past.js (each terrane's
 *   age; the parting seams' cells — world.js)
 * @param {Object} geo  the history's geology config (tectonics/config.js geology: the latitude bands, the shares, the rates)
 * @returns {Object} the record's shares, for the checks — and `arcBornAgo` (per cell: how long ago a docked arc's crust
 *   was born, 0 elsewhere; the Frame on the history's clock reads it: layers.js historyFrame)
 */
export function presentRecord(L, land, crust, past, geo, cfg = PRESENT) {
    const { sim, seed } = L, n = sim.numCells, { adjOffset, adjList, xyz } = sim;
    const kmOf = (a, b) => R * Math.acos(Math.max(-1, Math.min(1, xyz[3 * a] * xyz[3 * b] + xyz[3 * a + 1] * xyz[3 * b + 1] + xyz[3 * a + 2] * xyz[3 * b + 2])));
    const noise = new FastNoise((seed ^ 0x6e0c) >>> 0);
    const nAt = (c, km, off) => { const f = R / km; return noise.noise3D(xyz[3 * c] * f + off, xyz[3 * c + 1] * f - off, xyz[3 * c + 2] * f + 0.5 * off); };
    const isLand = (c) => land[c] && crust.type[c] !== CrustType.OCEAN;
    const live = (c) => crust.oroType[c] !== OrogenyType.NONE && crust.oroLast[c] === 0;
    const isCoast = (c) => { if (!isLand(c)) return false; for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) if (!isLand(adjList[k])) return true; return false; };

    // ── distances over the land ──
    const toSea = dijkstra(n, adjOffset, adjList, kmOf, (c) => !isLand(c), isLand, Infinity);
    // (from high ground: sand and mud reach this far into a sea, so no carbonate there — step/geology.js supply; the high
    // ground then: today's ranges for the shelves now, and as much for the old inland seas — ranges stood, wore away and
    // rose elsewhere — so half its weight there)
    const supply = dijkstra(n, adjOffset, adjList, kmOf, (c) => isLand(c) && crust.baseKm[c] + crust.upliftKm[c] + 0.5 * crust.rugged[c] >= geo.supplyHighKm, () => true, 4 * geo.supplyKm);
    // the older arcs inland of today's: an Andean margin's arc sweeps across the plate over the tens of Myr (the Sierra
    // Nevada's batholiths behind the Cascades, the Andes' Jurassic and Cretaceous belts) — its dead arcs behind it, the
    // further in the longer dead, in stretches (not every margin's arc wandered)
    const liveArc = (c) => live(c) && LIVE_ARC.has(crust.oroType[c]);
    const arcBehind = dijkstra(n, adjOffset, adjList, kmOf, (c) => isLand(c) && liveArc(c), (c) => isLand(c) && !liveArc(c), cfg.recOldArcKm);
    // the forelands: from each foreland belt's outer edge outward over the plain, never back into the belt — today's (its
    // basin still filling) and the past's (filled when it stood, worn since); the source's last activity carried
    // (an old belt's foreland may lie over an older belt's — or a younger one's, which has since thickened and stripped it:
    // only a live belt's own interior is never its foreland)
    const foreFrom = new Float32Array(n);
    const edgeOf = (c) => (FORELAND_BELTS.has(crust.oroType[c]) && crust.beltU[c] >= geo.forelandEdgeU ? -crust.oroLast[c]
        : FORELAND_BELTS.has(crust.prevType[c]) && crust.prevU[c] >= geo.forelandEdgeU ? -crust.prevLast[c] : -1);
    const toFore = dijkstra(n, adjOffset, adjList, kmOf, (c) => isLand(c) && edgeOf(c) >= 0,
        (c) => isLand(c) && !(live(c) && FORELAND_BELTS.has(crust.oroType[c]) && crust.beltU[c] < geo.forelandEdgeU), geo.forelandKm, edgeOf, foreFrom);
    // a coast with a live range or arc at it is no passive margin
    const active = dijkstra(n, adjOffset, adjList, kmOf, (c) => isLand(c) && live(c) && crust.oroType[c] !== OrogenyType.RIFT, isLand, cfg.recActiveCoastKm);
    // the rifts: today's valleys and failed arms (their crust flagged), the old parting seams (present/seams.js: failed rifts
    // of the past) — and every passive margin, where an ocean opened (its rift basins before the sea came in)
    const parted = new Uint8Array(n);
    for (const c of past.sagCells ?? []) parted[c] = 1;
    const toRift = dijkstra(n, adjOffset, adjList, kmOf, (c) => isLand(c) && (parted[c] || !!(crust.flags[c] & (CrustFlag.FAILED_RIFT | CrustFlag.RIFT_MARGIN))), isLand, cfg.recRiftKm * 3);
    const toMargin = dijkstra(n, adjOffset, adjList, kmOf, (c) => isCoast(c) && active[c] === Infinity, isLand, cfg.recMarginKm * 3);

    const terraneHash = new Map();
    const hashOf = (t, salt) => { const k = t * 8 + salt; if (!terraneHash.has(k)) terraneHash.set(k, makeRng((seed ^ 0x5e1d) + t * 7919 + salt * 131)()); return terraneHash.get(k); };
    const warmShare = (lat) => 1 - smooth(geo.warmLat[0], geo.warmLat[1], lat);
    const aridShare = (lat) => smooth(geo.aridLat[0], geo.aridLat[1], lat) * (1 - smooth(geo.aridLat[2], geo.aridLat[3], lat));
    const wetShare = (lat) => Math.max(1 - smooth(geo.wetLat[0], geo.wetLat[1], lat), smooth(geo.wetLat[2], geo.wetLat[3], lat) * (1 - smooth(geo.wetLat[4], geo.wetLat[5], lat)));
    const coalBelt = (lat) => (geo.coalByWetBelts === false ? 1 - smooth(40, 50, lat) : wetShare(lat));
    const stats = { land: 0, covered: 0, shield: 0, foreland: 0, shelf: 0, epeiric: 0, rift: 0, ophiolite: 0, arc: 0, accreted: 0, accretedBare: 0, belted: 0, oldArc: 0 };
    const arcBornAgo = new Float32Array(n);
    // (the cover's make-up as the layers go on: step/geology.js deposit — the top's, about its last faciesMixKm)
    const mix = { km: 0, carb: 0, salt: 0, coal: 0, organic: 0 };
    const lay = (km, carb, salt, coal, organic) => {
        if (!(km > 0)) return;
        const sum = carb + salt + coal + organic, f = sum > 1 ? 1 / sum : 1, w = km / (km + geo.faciesMixKm);
        mix.carb += (carb * f - mix.carb) * w; mix.salt += (salt * f - mix.salt) * w; mix.coal += (coal * f - mix.coal) * w; mix.organic += (organic * f - mix.organic) * w;
        mix.km += km;
    };
    const stand = cfg.recSeaStand;

    for (let c = 0; c < n; c++) {
        if (!isLand(c)) continue;
        stats.land++;
        const type = crust.type[c], oro = crust.oroType[c], u = Math.min(1, crust.beltU[c]), core = 1 - smooth(cfg.recCoreU[0], cfg.recCoreU[1], u);
        const isLive = live(c), age = oro && !isLive ? -crust.oroLast[c] : 0;
        const wobble = 1 + 0.25 * nAt(c, 500, 9.3);
        let flags = crust.geoFlags[c];
        // (some of the pieces docked in the past came as island arcs: their crust born in one — a docked terrane's own draw)
        const accreted = type !== CrustType.CRATON && type !== CrustType.ARC && !isLive && hashOf(crust.terrane[c], 2) < cfg.recAccretedArcShare;
        // ── how deep the basement is worn: the start world's wear (a shield by its own amount, the mobile belts about it
        // less: step/geology.js seedGeology), a docked arc's since it docked, an arc's own young crust none; then each belt's
        // since it rose, at its core most — an old one the longer ago, a live one by how much it stands ──
        let exhum = 0, since = 0;
        if (type === CrustType.CRATON) exhum = (cfg.recShieldExhumKm[0] + (cfg.recShieldExhumKm[1] - cfg.recShieldExhumKm[0]) * hashOf(crust.terrane[c], 1)) * wobble;
        else if (accreted) exhum = cfg.recAccretedExhumKm[0] + (cfg.recAccretedExhumKm[1] - cfg.recAccretedExhumKm[0]) * hashOf(crust.terrane[c], 3);
        else if (type !== CrustType.ARC) exhum = (geo.beltExhumKm[0] + (geo.beltExhumKm[1] - geo.beltExhumKm[0]) * hashOf(crust.terrane[c], 1)) * wobble;
        if (oro && !isLive) since = (cfg.recPastExhumKm[0] + (cfg.recPastExhumKm[1] - cfg.recPastExhumKm[0]) * (1 - Math.exp(-age / cfg.recExhumMyr))) * (cfg.recBeltOuterWear + (1 - cfg.recBeltOuterWear) * core) * wobble;
        else if (isLive && oro !== OrogenyType.RIFT) since = Math.min(cfg.recLiveExhumMaxKm, cfg.recLiveExhumPerKm * (crust.upliftKm[c] + crust.rugged[c])) * core;
        // (an older arc behind a live one: dead this long, worn this deep since — its volcanics near, its batholiths further in)
        const behind = arcBehind[c] > 0 && arcBehind[c] < Infinity ? (1 - smooth(0.6 * cfg.recOldArcKm, cfg.recOldArcKm, arcBehind[c])) * smooth(-0.15, 0.15, nAt(c, 700, 41.9) + cfg.recOldArcShare - 0.5) : 0;
        const arcEnd = cfg.recOldArcMyrPerKm * arcBehind[c];
        // (a docked arc not in a belt since stands bare: its volcanic pile worn to its plutons in places — no more)
        if (accreted && !oro) since = 0;
        // (and the land that stood above the sea through the history, worn the more the higher it stood — its cover first)
        else if (type !== CrustType.ARC) exhum += cfg.recUplandWearKm * (1 - smooth(cfg.recSwellKm[1], cfg.recSwellKm[0], crust.baseKm[c])) * wobble;
        exhum = Math.min(cfg.recExhumMaxKm, exhum + since);

        // ── the cover, layer by layer, oldest first ──
        mix.km = 0; mix.carb = 0; mix.salt = 0; mix.coal = 0; mix.organic = 0;
        // (the latitude each lay at: today's, wandered by the drift — the older, the further)
        const latNow = Math.abs(Math.asin(Math.max(-1, Math.min(1, xyz[3 * c + 2]))) * DEG);
        const latAt = (driftDeg, off) => Math.min(90, Math.abs(latNow + driftDeg * nAt(c, 3000, off)));
        // the platform: thick in the basins (where the swells sag), thin on the swells — laid in the start world's sags and
        // the inland seas since (its make-up the old seas', at a latitude far from today's)
        // (seedGeology: a noise ~1500 km leaning to the lowlands — most of the lowlands under it and little of the uplands)
        const basin = smooth(cfg.recSwellKm[1], cfg.recSwellKm[0], crust.baseKm[c]);
        const sag = smooth(-0.1, 0.5, 1.6 * noise.fbm(xyz[3 * c] * R / geo.platformNoiseKm + 3.7, xyz[3 * c + 1] * R / geo.platformNoiseKm + 0.4, xyz[3 * c + 2] * R / geo.platformNoiseKm + 6.2, 3, 0.5)
            + geo.platformLowGain * (basin - geo.platformLowMid));
        let platform = cfg.recPlatformKm[1] * sag * (1 + cfg.recCoverVary * nAt(c, 900, 3.1));
        if (type === CrustType.CRATON) {
            // (a shield shows where it stands high or the noise bares it; elsewhere a thin platform lies over it)
            const bare = smooth(-0.15, 0.15, nAt(c, cfg.recShieldPatchKm, 7.7) + cfg.recShieldBare - 0.6 * basin);
            platform *= cfg.recShieldCover * (1 - bare);
            if (bare > 0.5) stats.shield++;
        }
        if (accreted && !oro) platform *= cfg.recAccretedCover;
        if (type === CrustType.ARC) platform *= cfg.recArcCover;
        platform = Math.max(0, platform);
        { const lat = latAt(cfg.recOldDriftDeg, 13.7); lay(platform, 0.7 * warmShare(lat), 0.15 * aridShare(lat), 0.03 * wetShare(lat), 0.03); }
        let cover = platform;
        // a rift's basin: along a passive margin (the ocean's opening; its fill under the shelf that followed), a failed arm,
        // an old parting seam, today's valley — sand and mud off its shoulders; salt in the arid belt, else a lake's black
        // mud; coal where it is wet
        const rfIn = toRift[c] < Infinity ? Math.exp(-toRift[c] / cfg.recRiftKm) : 0;
        const rfMargin = toMargin[c] < Infinity ? Math.exp(-toMargin[c] / cfg.recMarginKm) * smooth(-0.2, 0.2, nAt(c, cfg.recMarginPatchKm, 31.7) + cfg.recMarginShare - 0.5) : 0;
        const rf = Math.max(rfIn, rfMargin) * (type === CrustType.ARC || accreted ? 0.2 : 1);
        if (rf > 0.02) {
            const lat = latAt(cfg.recDriftDeg, 19.3), arid = aridShare(lat);
            lay(cfg.recRiftCoverKm * rf, 0, geo.saltShare * arid, geo.coalShare * 0.5 * coalBelt(lat), geo.organicShare * (1 - arid));
            cover += cfg.recRiftCoverKm * rf;
            if (rf > 0.5) { flags |= GeoFlag.RIFT_BASIN; stats.rift++; }
        }
        // a past belt's foreland, filled while it stood and worn since — the range's waste, coal in it where it lay wet
        const fd = toFore[c], fAge = foreFrom[c];
        const fs = fd < geo.forelandKm ? 1 - smooth(0, geo.forelandKm, fd) : 0;
        if (fs > 0.3) { flags |= GeoFlag.FORELAND; stats.foreland++; }
        if (fs > 0 && fAge > 0) {
            const km = cfg.recForelandKm * fs * Math.exp(-fAge / cfg.recForelandWearMyr), lat = latAt(cfg.recDriftDeg, 23.9);
            lay(km, 0, 0, geo.coalShare * coalBelt(lat), 0); cover += km;
        }
        // a belt thickened its cover — sheets thrust over one another (step/geology.js thickenCover) — and stripped its
        // core to the basement
        if (oro && oro !== OrogenyType.RIFT) cover *= (1 + cfg.recBeltThicken * smooth(cfg.recCoreU[0], cfg.recCoreU[1], u)) * (1 - core);
        // under shallow sea: the low interiors at the high stands (inland seas), the shelves
        const low = basin * smooth(cfg.recFloodFromKm, cfg.recFloodFromKm * 0.4, toSea[c] < cfg.recFloodCoastKm ? 0 : crust.upliftKm[c] + crust.rugged[c]);
        const coastal = active[c] < Infinity ? 0 : Math.exp(-toSea[c] / cfg.recShelfKm) * smooth(cfg.recShelfHighKm, 0, crust.baseKm[c] + crust.upliftKm[c]);
        const flood = low * (0.5 + 0.5 * nAt(c, 1400, 11.3) ** 2 * 4);
        const floodMyr = cfg.recFloodMyr * Math.max(flood, coastal * 0.6);
        const sup = Math.exp(-supply[c] / geo.supplyKm), restricted = smooth(geo.restrictedKm[0], geo.restrictedKm[1], toSea[c]);
        if (low > 0.45 && floodMyr > 20) {
            // an inland sea's layers — carbonate in warm water far from the sand and mud of high ground; salt and black mud
            // where it lay far inside the land (restricted), the mud most at a high stand
            const lat = latAt(cfg.recDriftDeg, 17.9), warm = warmShare(lat), km = geo.epeiricRateKmPerMyr * floodMyr;
            lay(km, (warm + geo.coolCarbonate * (1 - warm)) * (1 - 0.5 * sup), geo.saltShare * aridShare(lat) * restricted,
                0, geo.organicShare * restricted * (0.4 + 0.6 * cfg.recSeaStandHigh) * (geo.organicCool + (1 - geo.organicCool) * warm));
            cover += km;
            flags |= GeoFlag.EPEIRIC; stats.epeiric++;
        }
        // a passive margin's coastal plain and shelf wedge, still sinking (carbonate where warm and clear, black mud at a
        // high stand) — its coastal swamps' coal behind it
        if (coastal > 0.02) {
            const lat = latAt(0.5 * cfg.recDriftDeg, 27.1), warm = warmShare(lat), km = cfg.recShelfCoverKm * coastal;
            const shelfStand = Math.min(1, Math.max(0, stand + 0.8 * nAt(c, 1800, 51.3)));
            lay(km, (warm + geo.coolCarbonate * (1 - warm)) * (1 - sup), 0, coastal < 0.5 ? geo.coalShare * coalBelt(lat) * cfg.recParalicCoal : 0,
                geo.organicShare * geo.organicShelf * shelfStand * (geo.organicCool + (1 - geo.organicCool) * warm));
            cover += km;
            if (coastal > 0.35) { flags |= GeoFlag.SHELF; stats.shelf++; }
        }
        // a live range's foreland, filling now as fast as it sinks (the Ganges plain), coal in it where it is wet
        if (fs > 0 && fAge === 0) {
            const lat = latAt(0, 0), km = cfg.recForelandKm * fs;
            lay(km, 0, 0, geo.coalShare * coalBelt(lat), 0); cover += km;
        }
        // (a live arc's volcanoes stand on their own pile: no cover over the arc's band across an Andean belt)
        if (isLive && (oro === OrogenyType.ANDEAN || oro === OrogenyType.ARC)) cover *= cfg.recArcCover + (1 - cfg.recArcCover) * smooth(cfg.recArcBandU[0], cfg.recArcBandU[1], u);
        // what has worn off it since it last sank — the cover first (step/geology.js recordWear): the land above the sea
        // wears the faster the higher it stands; a basin still sinking keeps all
        const floodLast = -(cfg.recFloodAgoMyr[0] + (cfg.recFloodAgoMyr[1] - cfg.recFloodAgoMyr[0]) * (0.5 + 0.5 * nAt(c, 2000, 5.5)) ** 2);
        const sinking = Math.max(fAge === 0 ? fs : 0, coastal, isLive && oro === OrogenyType.RIFT ? 1 : 0);
        const exposedMyr = (1 - sinking) * (low > 0.45 && floodMyr > 20 ? -floodLast : Math.max(-floodLast, cfg.recCoverExposedMyr));
        const coverWorn = Math.min(cover, cfg.recCoverWearKmPerMyr * exposedMyr * (cfg.recCoverWearLow + (1 - cfg.recCoverWearLow) * (1 - basin)));
        cover -= coverWorn;
        crust.coverCarb[c] = mix.carb; crust.coverSalt[c] = mix.salt; crust.coverCoal[c] = mix.coal; crust.coverOrganic[c] = mix.organic;
        crust.coverKm[c] = cover;
        // (what lay on it at most, and when: a belt's cover before it was stripped, when the belt rose; a basin still
        // sinking — a live foreland, a shelf, a young rift — now; a platform when it was last under the sea, or deeper once,
        // under cover since worn away (seedGeology: half as much again))
        const stripped = oro && oro !== OrogenyType.RIFT ? cfg.recPlatformKm[1] * core : 0;
        crust.coverMaxKm[c] = Math.max(cover + stripped, cover + coverWorn, cover + 0.5 * platform * (1 - sinking));
        crust.coverMaxAt[c] = stripped > 0.5 ? (isLive ? crust.oroStart[c] : -age) : sinking > 0.5 ? 0 : floodLast * (1 - sinking);
        crust.exhumKm[c] = exhum;
        // (since its latest belt was last active: worn this much, less what has buried it since; a live one counts from now;
        // with no belt, since the start — seedGeology: all of it)
        crust.unroofKm[c] = isLive ? 0 : (oro ? since : exhum) - cover;
        crust.floodMyr[c] = floodMyr; crust.floodLast[c] = floodLast;
        // ── a live arc's time, and the arcs' own crust ──
        if (isLive && LIVE_ARC.has(oro)) {
            crust.arcMyr[c] = Math.max(crust.arcMyr[c], -crust.oroStart[c] * (1 - smooth(0.4, 0.8, u)));
            // (its slab flattened or steepened while it stood: porphyry copper's favourite moment — some arcs, each its own draw)
            if (oro === OrogenyType.LARAMIDE || hashOf(crust.terrane[c], 5) < cfg.recSlabChangeShare) flags |= GeoFlag.SLAB_CHANGE;
        }
        if (type === CrustType.ARC) { flags |= GeoFlag.WAS_ARC; crust.arcMyr[c] = Math.max(crust.arcMyr[c], Math.min(cfg.recArcMaxMyr, -crust.formedAt[c])); stats.arc++; }
        // (some of the pieces docked in the past came as island arcs: their crust born in one, each its own time in the arc,
        // which ended as it docked)
        else if (accreted) {
            const arcMyr = cfg.recAccretedArcMyr[0] + (cfg.recAccretedArcMyr[1] - cfg.recAccretedArcMyr[0]) * hashOf(crust.terrane[c], 4);
            flags |= GeoFlag.WAS_ARC; crust.arcMyr[c] = Math.max(crust.arcMyr[c], arcMyr);
            arcBornAgo[c] = (past.terraneAge?.get(crust.terrane[c]) ?? cfg.youngestRingMyr) + arcMyr;
        }
        if (behind > 0.5 && type === CrustType.CONTINENT && !isLive && !(flags & GeoFlag.WAS_ARC)) {
            const arcMyr = cfg.recAccretedArcMyr[0] + (cfg.recAccretedArcMyr[1] - cfg.recAccretedArcMyr[0]) * 0.5 * (1 + nAt(c, 1500, 47.3));
            flags |= GeoFlag.WAS_ARC; crust.arcMyr[c] = Math.max(crust.arcMyr[c], arcMyr);
            arcBornAgo[c] = arcEnd + arcMyr; stats.oldArc++;
            // (its own pile and plutons, worn since it died: no older wear shows through them)
            if (!oro) { crust.unroofKm[c] = cfg.recOldArcWearKmPerMyr * arcEnd - cover; crust.exhumKm[c] = Math.min(exhum, Math.max(0, cfg.recOldArcWearKmPerMyr * arcEnd)); crust.coverKm[c] = cover *= cfg.recAccretedCover; }
        }
        if (accreted) stats.accreted++; if (accreted && !oro) stats.accretedBare++; if (oro) stats.belted++;
        // ── a collision belt's folded shelves: the margins of the sea it closed, their carbonate banks caught up in it (the
        // Appalachians', the Alps' — marble and skarn where its granites rose) ──
        if (oro && COLLIDES.has(oro) && nAt(c, 1100, 57.1) > cfg.recBeltShelfAbove) flags |= GeoFlag.SHELF;
        // ── a closed sea's floor caught up along a suture: ophiolite slivers ──
        if ((crust.flags[c] & CrustFlag.SUTURE) && type !== CrustType.CRATON && nAt(c, cfg.recOphioliteKm, 23.3) > cfg.recOphioliteAbove) { flags |= GeoFlag.OPHIOLITE; stats.ophiolite++; }
        crust.geoFlags[c] = flags;
        if (cover > 0.05) stats.covered++;
    }
    // ── the old flood basalts: a long history's plume heads (Evolution's keeps every one), long since worn to their feeders
    // and their great magma chambers — nickel, copper and platinum at a craton's edge (Noril'sk, Sudbury, the Bushveld) ──
    const oldLip = oldFloodBasalts(sim, crust, isLand, toSea, seed, cfg, kmOf);
    stats.oldLip = oldLip.cells;
    const out = Object.fromEntries(Object.entries(stats).map(([k, v]) => [k, k === 'land' ? v : +(v / Math.max(1, stats.land)).toFixed(3)]));
    Object.defineProperty(out, 'arcBornAgo', { value: arcBornAgo, enumerable: false });
    Object.defineProperty(out, 'oldLip', { value: oldLip, enumerable: false });
    return out;
}

/** A few old flood basalts on the land (records only: the Frame on the history's clock carries them — layers.js
 *  historyFrame — where no younger volcanism stands): each a lobed province, this long ago, worn this much. */
function oldFloodBasalts(sim, crust, isLand, toSea, seed, cfg, kmOf) {
    const n = sim.numCells, { xyz } = sim, rng = makeRng((seed ^ 0x01d1) >>> 0), noise = new FastNoise((seed ^ 0x01d2) >>> 0);
    const age = new Float32Array(n), worn = new Float32Array(n);
    const inland = [];
    for (let c = 0; c < n; c++) if (isLand(c) && toSea[c] > cfg.recOldLipCoastKm && crust.volcType[c] === VolcanicType.NONE) inland.push(c);
    const count = inland.length ? Math.round(cfg.recOldLipCount[0] + (cfg.recOldLipCount[1] - cfg.recOldLipCount[0]) * rng()) : 0;
    let cells = 0;
    for (let i = 0; i < count; i++) {
        const c0 = inland[Math.floor(rng() * inland.length)], a = cfg.recOldLipAgeMyr[0] + (cfg.recOldLipAgeMyr[1] - cfg.recOldLipAgeMyr[0]) * rng();
        const r0 = Math.sqrt(cfg.recOldLipAreaKm2[0] * Math.exp(Math.log(cfg.recOldLipAreaKm2[1] / cfg.recOldLipAreaKm2[0]) * rng()) / Math.PI);
        const w = Math.min(1, cfg.recOldLipWornShare[0] + (cfg.recOldLipWornShare[1] - cfg.recOldLipWornShare[0]) * rng()), off = 10 * rng();
        for (let c = 0; c < n; c++) {
            if (!isLand(c) || crust.volcType[c] !== VolcanicType.NONE || age[c] > 0) continue;
            const d = kmOf(c, c0);
            if (d > 1.6 * r0) continue;
            const f = R / (0.6 * r0);
            if (d > r0 * (0.8 + 0.45 * noise.noise3D(xyz[3 * c] * f + off, xyz[3 * c + 1] * f, xyz[3 * c + 2] * f - off))) continue;
            age[c] = a; worn[c] = w; cells++;
        }
    }
    return { age, worn, cells, provinces: count };
}

/** km from the cells `isSource` marks, over the cells `canEnter` allows, out to maxKm (Infinity beyond); with `carry`, each
 *  cell's nearest source's value of it into `into`. */
function dijkstra(n, adjOffset, adjList, kmOf, isSource, canEnter, maxKm, carry = null, into = null) {
    const d = new Float64Array(n).fill(Infinity), heap = new MinHeap(4096);
    for (let c = 0; c < n; c++) if (isSource(c)) { d[c] = 0; heap.push(0, c); if (carry) into[c] = carry(c); }
    while (heap.size) {
        const c = heap.pop(), dc = heap.lastKey;
        if (dc > d[c]) continue;
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
            const nb = adjList[k];
            if (!canEnter(nb)) continue;
            const nd = dc + kmOf(c, nb);
            if (nd < d[nb] && nd <= maxKm) { d[nb] = nd; heap.push(nd, nb); if (carry) into[nb] = into[c]; }
        }
    }
    return d;
}
