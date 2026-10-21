// The geological record of the history (plans/V2_GEOLOGY_PLAN.md, G1; numbers and sources: V2_GEOLOGY_RESEARCH.md).
// Madeline James's rock and ore maps begin from two maps drawn by hand — the orogenies, active, worn and long gone, and
// the past shallow seas — and from them the rock types. Evolution keeps the record as it happens instead, per piece of
// crust, riding with it on its plate:
//   · a ROCK COLUMN — sediment cover over the volcanics over the basement. Basins and shallow seas lay cover on top (its
//     make-up by the latitude it lay at then: carbonate in warm clear seas, salt in restricted seas of the arid belt, coal
//     in wet basins, organic-rich mud in restricted seas at a high stand and in young rift lakes, sand and mud elsewhere);
//     erosion (step/heights.js, every step, recordWear) strips the cover first, then the basement — how deep the basement
//     is worn is how deep the rock now at the surface once lay (its metamorphic grade, and which deposits are bared);
//   · the SEA's STAND through the history, from the mean depth of the ocean floor (young floor rides high: a dispersing
//     world floods its continents, a supercontinent's old oceans drain them) — the lowest land joined to the sea lies
//     under shallow sea, and the time each piece of crust spends there is kept;
//   · time in a live subduction belt (arcs and Andean margins: porphyry copper's home), and the settings the other records
//     do not keep (GeoFlag: born in an arc, a foreland, a young rift basin, a closed sea's floor, a slab that changed).
// Records only: the history never reads them (no random stream either), so a history is the same with them or without
// (config.geology.records; check-geology.mjs runs both and compares).

import { CrustType, CrustFlag, OrogenyType, VolcanicType } from '../model/crust.js';
import { GeoFlag } from '../model/geology.js';
import { EventKind } from '../model/world.js';
import { MinHeap, spreadKm } from '../../core/min-heap.js';
import { FastNoise } from '../../core/fast-noise.js';
import { heightsOf } from './heights.js';
import { landHeightParts } from './rivers.js';

const R = 6371, DEG = 180 / Math.PI;
const FORELAND_BELTS = new Set([OrogenyType.ANDEAN, OrogenyType.LARAMIDE, OrogenyType.URAL, OrogenyType.HIMALAYAN]);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ── the zonal palaeoclimate: what a basin or a sea at this latitude (degrees, absolute) lays down ──
const warmShare = (lat, G) => 1 - smooth(G.warmLat[0], G.warmLat[1], lat);
const aridShare = (lat, G) => smooth(G.aridLat[0], G.aridLat[1], lat) * (1 - smooth(G.aridLat[2], G.aridLat[3], lat));
const wetShare = (lat, G) => Math.max(1 - smooth(G.wetLat[0], G.wetLat[1], lat), smooth(G.wetLat[2], G.wetLat[3], lat) * (1 - smooth(G.wetLat[4], G.wetLat[5], lat)));
// (coal where the basin lay in a wet belt — or, by Madeline James's rule, anywhere within ~45° of the equator: GEOLOGY.guideRules.coalByWetBelts)
const coalBelt = (lat, G) => (G.coalByWetBelts === false ? 1 - smooth(40, 50, lat) : wetShare(lat, G));

/** Ocean floor's depth (km) at an age (Myr): half-space cooling flattening with age (Stein & Stein's GDH1). */
export const oceanDepthKm = age => (age < 20 ? 2.6 + 0.365 * Math.sqrt(Math.max(0, age)) : 5.651 - 2.473 * Math.exp(-0.0278 * age));

/** Lay `km` of sediment on crust cell c, of the make-up given (shares; the rest sand and mud), at sim time `time`. */
export function deposit(crust, c, km, carb, salt, coal, organic, time, G) {
    if (!(km > 0)) return;
    // (the make-up kept is the top's: a new layer counts as much as its thickness against faciesMixKm)
    const w = km / (km + G.faciesMixKm);
    crust.coverCarb[c] += (carb - crust.coverCarb[c]) * w;
    crust.coverSalt[c] += (salt - crust.coverSalt[c]) * w;
    crust.coverCoal[c] += (coal - crust.coverCoal[c]) * w;
    crust.coverOrganic[c] += (organic - crust.coverOrganic[c]) * w;
    const cover = crust.coverKm[c] + km;
    crust.coverKm[c] = cover;
    if (cover > crust.coverMaxKm[c]) { crust.coverMaxKm[c] = cover; crust.coverMaxAt[c] = time; }
    crust.unroofKm[c] -= km;                          // (what lies beneath is buried that much deeper)
}

/**
 * The wear of one step at land cell c (step/heights.js, every step): `wornKm` of rock taken off the top — the cover
 * first, then the basement (not while a flood basalt's lavas still cover it: they wear on their own clock, volcWornKm) —
 * or, where the land is sunk `basinKm` below its plain (a foreland basin under a range's load), the range's waste laid in
 * it: a foreland keeps filling while it keeps sinking (the Ganges plain, ~5 km in 20 Myr), coal in it where the belt it
 * lies in is wet. At |latitude| `lat` (degrees).
 */
export function recordWear(crust, c, wornKm, basinKm, lat, time, dt, G) {
    if (wornKm > 0) {
        const fromCover = Math.min(crust.coverKm[c], wornKm), rest = wornKm - fromCover;
        crust.coverKm[c] -= fromCover;
        if (rest > 0 && !(crust.volcType[c] === VolcanicType.LIP && crust.volcKm[c] > crust.volcWornKm[c])) crust.exhumKm[c] += rest;
        crust.unroofKm[c] += wornKm;
    }
    if (basinKm > G.forelandDepthKm[0]) {
        crust.geoFlags[c] |= GeoFlag.FORELAND;
        deposit(crust, c, G.forelandRateKmPerMyr * dt * smooth(G.forelandDepthKm[0], G.forelandDepthKm[1], basinKm), 0, 0, G.coalShare * coalBelt(lat, G), 0, time, G);
    }
    // (a belt still active: its deposits form at their depths below today's surface — the unroofing counts from now)
    if (crust.oroType[c] !== OrogenyType.NONE && time - crust.oroLast[c] <= dt + 1e-9) crust.unroofKm[c] = 0;
}

/**
 * A belt thickened land cell c by `thickenedKm` (step/orogeny.js): its sediment thickens with the crust — sheets of it
 * thrust over one another, a fold-and-thrust belt (the Zagros, the Appalachians' Valley and Ridge) — and buries what lies
 * beneath that much deeper.
 */
export function thickenCover(crust, c, thickenedKm, time, G) {
    const cover = crust.coverKm[c];
    if (!(cover > 0)) return;
    const add = cover * thickenedKm / G.crustKm;
    crust.coverKm[c] = cover + add;
    if (cover + add > crust.coverMaxKm[c]) { crust.coverMaxKm[c] = cover + add; crust.coverMaxAt[c] = time; }
    crust.unroofKm[c] -= add;
}

/**
 * The start world's past (once, when the history starts, like heights.js seedBaseRelief): its ancient crust already worn
 * deep — a shield more than the mobile belts about it, each craton by its own amount — and over half of it under platform
 * sediment laid in old sags (the make-up by the latitude it starts at). From a noise field and a hash of its own: no
 * random stream is touched.
 */
export function seedGeology(world) {
    const G = world.config.geology;
    if (!G?.records) return;
    const { xyz } = world.mesh, noise = new FastNoise((world.seed ^ 0x6e01) >>> 0), F = R / G.platformNoiseKm;
    const ancientAt = -world.config.initialLandAgeMyr / 4;
    for (const plate of world.plates) {
        if (!plate.alive) continue;
        const k = plate.crust, m = plate.mat;
        for (let c = 0; c < k.mask.length; c++) {
            if (!k.mask[c] || (k.type[c] !== CrustType.CONTINENT && k.type[c] !== CrustType.CRATON)) continue;
            const x = xyz[3 * c], y = xyz[3 * c + 1], z = xyz[3 * c + 2];
            const wx = m[0] * x + m[1] * y + m[2] * z, wy = m[3] * x + m[4] * y + m[5] * z, wz = m[6] * x + m[7] * y + m[8] * z;
            const range = k.type[c] === CrustType.CRATON ? G.cratonExhumKm : G.beltExhumKm;
            const h = hash01(world.seed, k.terrane[c]), wobble = 1 + 0.25 * noise.noise3D(wx * F * 3 + 5.1, wy * F * 3 + 1.7, wz * F * 3 + 9.3);
            k.exhumKm[c] = (range[0] + (range[1] - range[0]) * h) * wobble;
            k.unroofKm[c] = k.exhumKm[c];                 // (its old belts' deposits were bared by all of it)
            const sag = smooth(-0.1, 0.5, 1.6 * noise.fbm(wx * F + 3.7, wy * F + 0.4, wz * F + 6.2, 3, 0.5));
            if (sag <= 0) continue;
            const lat = Math.abs(Math.asin(Math.max(-1, Math.min(1, wz)))) * DEG;
            deposit(k, c, G.platformCoverKm * sag, 0.7 * warmShare(lat, G), 0.15 * aridShare(lat, G), 0.03 * wetShare(lat, G), 0.03, ancientAt, G);
            k.coverMaxKm[c] = 1.5 * k.coverKm[c];         // (buried deeper once, under cover since worn away)
            k.unroofKm[c] = k.exhumKm[c];
        }
    }
}

/** 0…1 from the seed and a terrane id (a craton keeps its own character). */
function hash01(seed, id) {
    let h = (seed ^ Math.imul(id + 0x9e37, 0x85ebca6b)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d); h = Math.imul(h ^ (h >>> 15), 0x846ca68b); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

/**
 * Every config.geology.everyMyr: the sea's stand and the shallow seas, the basins and what they lay down, the arcs.
 * @returns {number} 0 (it never changes crust)
 */
export function evolveGeology(world, dt) {
    const G = world.config.geology;
    if (!G?.records) return 0;
    world.geoClock = (world.geoClock ?? 0) + dt;
    if (world.geoClock < G.everyMyr - 1e-9) return 0;
    const span = world.geoClock;
    world.geoClock = 0;
    const { mesh, plates, owner, ownerCell, time } = world, { adjOffset, adjList, xyz, numCells: n, edgeKm } = mesh, H = heightsOf(world.config);
    const s = scratchFor(n), { land, height, coast, kind, supply, fore, inBelt, flooded } = s;

    // ── the land (as the rivers see it), and the ocean floor's mean depth ──
    let depthSum = 0, oceanCells = 0, landCells = 0;
    const hp = [0, 0];
    for (let w = 0; w < n; w++) {
        land[w] = 0;
        const o = owner[w];
        if (o < 0) continue;
        const crust = plates[o].crust, c = ownerCell[w];
        if (crust.type[c] === CrustType.OCEAN) { depthSum += oceanDepthKm(time - crust.formedAt[c]); oceanCells++; continue; }
        if (crust.type[c] === CrustType.ARC) continue;            // (island arcs: islands at sea, not a continent's shallow sea)
        landHeightParts(crust, c, H, time, hp);
        land[w] = 1; height[w] = hp[0] + hp[1]; landCells++;
    }
    const meanDepth = oceanCells ? depthSum / oceanCells : G.oceanDepthOldKm;
    const stand = smooth(G.oceanDepthOldKm, G.oceanDepthYoungKm, meanDepth);
    const share = G.floodShareMin + (G.floodShareMax - G.floodShareMin) * stand;

    // ── distances: from the open sea over the land (its coast's kind carried in: a shelf's width), from high ground ──
    const PASSIVE = 0, ACTIVE = 1, OTHER = 2, shelfOf = [G.shelfKm.passive, G.shelfKm.active, G.shelfKm.other];
    for (let w = 0; w < n; w++) {
        coast[w] = Infinity; kind[w] = OTHER;
        if (!land[w]) continue;
        let shore = false, trench = false, rifted = false;
        for (let k = adjOffset[w]; k < adjOffset[w + 1]; k++) {
            const nb = adjList[k];
            if (!land[nb]) shore = true;
            const o = owner[nb];
            if (o >= 0) { const f = plates[o].crust.flags[ownerCell[nb]]; if (f & CrustFlag.TRENCH) trench = true; if (land[nb] && (f & CrustFlag.RIFT_MARGIN)) rifted = true; }
        }
        if (!shore) continue;
        if (plates[owner[w]].crust.flags[ownerCell[w]] & CrustFlag.RIFT_MARGIN) rifted = true;
        coast[w] = 0.5 * edgeKm;
        kind[w] = trench ? ACTIVE : rifted ? PASSIVE : OTHER;
    }
    spreadKm(mesh, coast, { canEnter: (c, nb) => land[nb] === 1, onReach: (c, nb) => { kind[nb] = kind[c]; }, maxKm: 4 * G.restrictedKm[1] });
    for (let w = 0; w < n; w++) supply[w] = land[w] && height[w] >= G.supplyHighKm ? 0 : Infinity;
    spreadKm(mesh, supply, { maxKm: 4 * G.supplyKm });
    // the forelands: the plains in front of the active belts (beyond a collision's thrust front, behind an Andean arc),
    // out to forelandKm — from each belt's outer edge outward, never back into the belt
    for (let w = 0; w < n; w++) {
        fore[w] = Infinity; inBelt[w] = 0;
        if (!land[w]) continue;
        const crust = plates[owner[w]].crust, c = ownerCell[w];
        if (!FORELAND_BELTS.has(crust.oroType[c]) || time - crust.oroLast[c] > span + 1e-9) continue;
        if (crust.beltU[c] >= G.forelandEdgeU) fore[w] = 0; else inBelt[w] = 1;
    }
    spreadKm(mesh, fore, { canEnter: (c, nb) => land[nb] === 1 && !inBelt[nb], maxKm: G.forelandKm });

    // ── the shallow seas: the shelves, then the lowest land joined to the sea, up to the stand's share of the rest ──
    const heap = s.heap;
    heap.size = 0;
    let shelfCells = 0;
    // (a shelf is the low edge of a continent: where a range meets the sea there is none)
    for (let w = 0; w < n; w++) { flooded[w] = 0; if (land[w] && coast[w] <= shelfOf[kind[w]] && height[w] <= G.shelfMaxKm) { flooded[w] = 1; shelfCells++; } }
    for (let w = 0; w < n; w++) {
        if (land[w] && !flooded[w]) continue;
        for (let k = adjOffset[w]; k < adjOffset[w + 1]; k++) { const nb = adjList[k]; if (land[nb] && !flooded[nb]) heap.push(height[nb], nb); }
    }
    const target = Math.round(share * (landCells - shelfCells));
    let inland = 0;
    while (heap.size && inland < target) {
        const c = heap.pop(), level = heap.lastKey;
        if (flooded[c]) continue;
        flooded[c] = 2; inland++;
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const nb = adjList[k]; if (land[nb] && !flooded[nb]) heap.push(Math.max(level, height[nb]), nb); }
    }
    world.geoSea = { time, meanDepthKm: meanDepth, stand, share: landCells ? (shelfCells + inland) / landCells : 0 };

    // ── the slabs that flattened or steepened since last time: their arcs' moment of change ──
    const changed = new Set();
    for (let i = world.geoEventsSeen ?? 0; i < world.events.length; i++) {
        const e = world.events[i];
        if ((e.kind === EventKind.SLAB_FLAT || e.kind === EventKind.SLAB_STEEP) && e.data) changed.add(e.data.plate);
    }
    world.geoEventsSeen = world.events.length;

    // ── each plate's crust, where it is now: what its place lays on it ──
    const { index } = mesh;
    for (const plate of plates) {
        if (!plate.alive || plate.isBackground || plate.crust.count === 0) continue;
        const k = plate.crust, m = plate.mat, slab = changed.has(plate.id);
        for (let c = 0; c < k.mask.length; c++) {
            if (!k.mask[c]) continue;
            const type = k.type[c];
            if (type === CrustType.OCEAN) continue;
            // (a live subduction belt — an island arc, an Andean margin, a flat slab's inland belt)
            const o = k.oroType[c];
            if ((o === OrogenyType.ANDEAN || o === OrogenyType.LARAMIDE || o === OrogenyType.ARC) && time - k.oroLast[c] <= span + 1e-9) {
                k.arcMyr[c] += span;
                if (slab) k.geoFlags[c] |= GeoFlag.SLAB_CHANGE;
            }
            if (type === CrustType.ARC) { k.geoFlags[c] |= GeoFlag.WAS_ARC; continue; }
            const x = xyz[3 * c], y = xyz[3 * c + 1], z = xyz[3 * c + 2];
            const wz = m[6] * x + m[7] * y + m[8] * z, w = index.nearest(m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, wz);
            const lat = Math.abs(Math.asin(Math.max(-1, Math.min(1, wz)))) * DEG;
            // (in front of an active belt: its foreland basin, filling with the range's waste as fast as it sinks — the
            // Ganges plain ~5 km in 20 Myr — fastest at the range's foot; coal in it where it is wet)
            const fs = fore[w] < G.forelandKm ? 1 - smooth(0, G.forelandKm, fore[w]) : 0;
            if (fs > 0.3) k.geoFlags[c] |= GeoFlag.FORELAND;
            if (flooded[w]) {
                // under shallow sea: a shelf's wedge or an inland sea's layers — carbonate in warm water far from the sand
                // and mud of high ground; salt and black mud where the sea lies far inside the land (restricted) — the mud
                // most at a high stand, when the seas were widest and warmest
                const shelf = flooded[w] === 1, sup = Math.exp(-supply[w] / G.supplyKm), restricted = shelf ? 0 : smooth(G.restrictedKm[0], G.restrictedKm[1], coast[w]);
                const warm = warmShare(lat, G), carb = (warm + G.coolCarbonate * (1 - warm)) * (1 - sup);
                const salt = G.saltShare * aridShare(lat, G) * restricted, organic = G.organicShare * restricted * stand * warm;
                const sum = carb + salt + organic, f = sum > 1 ? 1 / sum : 1;
                deposit(k, c, Math.max(shelf ? G.shelfRateKmPerMyr : G.epeiricRateKmPerMyr, G.forelandRateKmPerMyr * fs) * span, carb * f, salt * f, 0, organic * f, time, G);
                k.floodMyr[c] += span; k.floodLast[c] = time;
                k.geoFlags[c] |= shelf ? GeoFlag.SHELF : GeoFlag.EPEIRIC;
            } else if (fs > 0) {
                deposit(k, c, G.forelandRateKmPerMyr * span * fs, 0, 0, G.coalShare * coalBelt(lat, G), 0, time, G);
            } else if ((k.flags[c] & (CrustFlag.FAILED_RIFT | CrustFlag.RIFT_MARGIN)) && time - k.riftAt[c] < G.riftBasinMyr) {
                // a young rift basin on land: sand and mud off its shoulders; in the arid belt salt, else a lake's black mud;
                // coal where it is wet
                const arid = aridShare(lat, G);
                deposit(k, c, G.riftRateKmPerMyr * span, 0, G.saltShare * arid, G.coalShare * 0.5 * coalBelt(lat, G), G.organicShare * (1 - arid), time, G);
                k.geoFlags[c] |= GeoFlag.RIFT_BASIN;
            }
        }
    }
    return 0;
}

let scratch = null;
function scratchFor(n) {
    if (scratch?.n === n) return scratch;
    scratch = { n, land: new Uint8Array(n), height: new Float32Array(n), coast: new Float32Array(n), kind: new Uint8Array(n), supply: new Float32Array(n),
        fore: new Float32Array(n), inBelt: new Uint8Array(n), flooded: new Uint8Array(n), heap: new MinHeap(1 << 14) };
    return scratch;
}
