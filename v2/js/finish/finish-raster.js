// The finished planet's picture (plans/V2_FINISH_PLAN.md): an equirectangular picture of heights — w × w/2 pixels, rows
// north → south, columns from −180° east, 16-bit metres — with the sea, the lakes, and at most 4096 px wide the land's
// climate, its cover as from space, its rocks and its farming. Each pixel is blended over the mesh triangle under it, and
// depends on nothing but that triangle's cells: so the picture is drawn a pixel at a time by one function (pixelDrawer),
// here row after row (finishRaster) or on a pool of workers (finishRasterPooled: core/task-pool.js) — the same code on the
// same values, the same picture to the bit. A worker is sent the pixels that fall on one run of the mesh's cells (a mesh's
// cells are numbered along the sphere, so a run of them is a band of it) with only that run of the finish's arrays — at
// 10M cells no worker ever holds the planet.

import { FastNoise } from '../core/fast-noise.js';
import { STAT_KEYS } from '../climate/cell-stats.js';
import { fineMottle, lookPrepare, lookRows, lookGround, lookDryAt, boxStats, riparian } from './finish-cover.js';
import { COVER } from './finish-config.js';
import { encHarvests, decHarvests, hasHarvests } from '../farming/farming.js';

const R = 6371;
/** The widest climate picture a finish makes: the page's sharpest texture (finer would not be seen). */
const CLIMATE_WIDTH_MAX = 4096;
/** The farming's parts the picture carries per pixel (farming/farming.js farmCells, and the seasons). */
export const FARM_KEYS = ['soil', 'rain', 'warm', 'flood', 'canal', 'slope', 'wetland', 'pasture'];
/** The runs of cells the pixels are dealt into for the pool (more than its workers: sea and land even out, and the copies
 *  of the finish's arrays in flight stay small), and the rows to a band of the terrain's look. */
const RUNS = 64, LOOK_ROWS = 32;
/** How far from the index's first guess a run's slice of the mesh reaches, in cells: the walk to the nearest cell is 0–2
 *  cells long (core/sphere-index.js), and the triangle is read one further. A walk that leaves the slice stops the piece
 *  (walkIn), and the picture is then drawn here instead. */
const SLICE_HOPS = 5;
/** Each crop byte's harvests (farming.js decHarvests), once. */
const DEC = Float64Array.from({ length: 256 }, (_, b) => decHarvests(b));

/** What a picture holds, from what the finish made: sizes and which parts — plain values, the same on every worker. */
function rasterPlan(mesh, w, lake, climate, geology, farming) {
    const cw = climate ? Math.min(w, CLIMATE_WIDTH_MAX) : 0, sat = !!(cw && climate.sat), rock = !!(cw && geology?.rock), farm = !!(cw && farming);
    return { w, h: w >> 1, cw, ch: cw >> 1, f: cw ? w / cw : 0, lake: !!lake, stats: !!(cw && climate.stats), sat, flow: sat && !!climate.flow, young: sat && !!climate.young, rip: sat && !!climate.ripSat,
        rock, rec: rock && geology.rec ? (geology.simCells < 65536 ? 16 : 32) : 0, farm, crops: farm && hasHarvests(farming) ? Object.keys(farming.crops) : null,
        mottleSeed: climate?.mottleSeed ?? 0, ditherF: R / (1.5 * (mesh.edgeKm ?? 30)) };
}

/** The finish's own arrays as the pixels read them: every per-cell array from cell `base` on (here: all of them). */
function wholeSource(mesh, z, ocean, lake, lakeLevel, climate, geology, farming, P) {
    return { base: 0, len: mesh.numCells, kBase: 0, xyz: mesh.xyz, adjOffset: mesh.adjOffset, adjList: mesh.adjList, z, ocean, lake: P.lake ? lake : null, lakeLevel: P.lake ? lakeLevel : null,
        tAnnual: P.cw ? climate.tAnnual : null, pAnnual: P.cw ? climate.pAnnual : null, koppen: P.cw ? climate.koppen : null, stats: P.stats ? STAT_KEYS.map(k => climate.stats[k]) : null,
        sat: P.sat ? climate.sat : null, cover: P.sat ? climate.cover : null, flow: P.flow ? climate.flow : null, young: P.young ? climate.young : null, ripSat: P.rip ? climate.ripSat : null,
        rock: P.rock ? geology.rock : null, rec: P.rec ? geology.rec : null, farm: P.farm ? FARM_KEYS.map(k => farming[k]) : null, farmKind: P.farm ? farming.kind : null,
        crops: P.crops ? P.crops.map(k => farming.crops[k]) : null };
}
/** The cells lo … hi − 1 of a source, copied (a piece's own: sent to a worker), and the buffers to hand over. */
function sliceSource(S, lo, hi) {
    const cut = (a, per = 1) => (a ? a.slice(per * lo, per * hi) : null), kLo = S.adjOffset[lo], kHi = S.adjOffset[hi];
    const out = { base: lo, len: hi - lo, kBase: kLo, xyz: cut(S.xyz, 3), adjOffset: S.adjOffset.slice(lo, hi + 1), adjList: S.adjList.slice(kLo, kHi), z: cut(S.z), ocean: cut(S.ocean), lake: cut(S.lake), lakeLevel: cut(S.lakeLevel),
        tAnnual: cut(S.tAnnual), pAnnual: cut(S.pAnnual), koppen: cut(S.koppen), stats: S.stats ? S.stats.map(a => cut(a)) : null, sat: S.sat ? S.sat.map(a => cut(a, 3)) : null, cover: cut(S.cover), flow: cut(S.flow), young: cut(S.young),
        ripSat: S.ripSat ? S.ripSat.map(a => cut(a, 3)) : null, rock: cut(S.rock), rec: cut(S.rec), farm: S.farm ? S.farm.map(a => cut(a)) : null, farmKind: cut(S.farmKind), crops: S.crops ? S.crops.map(a => cut(a, 2)) : null };
    return { src: out, transfer: buffersOf(out) };
}
function buffersOf(o) {
    const list = [];
    for (const v of Object.values(o)) { if (ArrayBuffer.isView(v)) list.push(v.buffer); else if (Array.isArray(v)) for (const a of v) if (ArrayBuffer.isView(a)) list.push(a.buffer); }
    return list;
}

/** A picture's arrays, empty: `n` pixels of heights, sea and lakes, `m` of the climate's picture's. */
function newOut(P, n, m) {
    const cw = P.cw;
    return { heightM: new Int16Array(n), sea: new Uint8Array(n), water: new Uint8Array(n),
        kop: cw ? new Uint8Array(m) : null, tA: cw ? new Int16Array(m).fill(-32768) : null, pA: cw ? new Uint16Array(m) : null, stats: P.stats ? STAT_KEYS.map(() => new Uint8Array(m)) : null,
        sat: P.sat ? [0, 1, 2].map(() => new Uint8Array(3 * m)) : null, cov: P.sat ? new Uint8Array(m) : null, flow: P.flow ? new Float32Array(m) : null, young: P.young ? new Uint8Array(m) : null,
        rip: P.rip ? [0, 1, 2].map(() => new Uint8Array(3 * m)) : null, rock: P.rock ? new Uint8Array(m) : null, rec: P.rec ? new (P.rec === 16 ? Uint16Array : Int32Array)(m) : null,
        farm: P.farm ? FARM_KEYS.map(() => new Uint8Array(m)) : null, farmKind: P.farm ? new Uint8Array(m) : null, crops: P.crops ? P.crops.map(() => new Uint8Array(2 * m)) : null };
}
/** A piece's pixels (`pix`: where each lies in the picture; `cpix`, `m`: its climate pixels) into the whole picture's. */
function placePiece(all, piece, pix) {
    const { heightM, sea, water } = piece;
    for (let q = 0; q < pix.length; q++) { const i = pix[q]; all.heightM[i] = heightM[q]; all.sea[i] = sea[q]; all.water[i] = water[q]; }
    const { m, cpix } = piece, put = (dst, src, per) => { if (!src) return; if (per === 1) for (let j = 0; j < m; j++) dst[cpix[j]] = src[j]; else for (let j = 0; j < m; j++) { const o = per * cpix[j], s = per * j; for (let e = 0; e < per; e++) dst[o + e] = src[s + e]; } };
    for (const k of ['kop', 'tA', 'pA', 'cov', 'flow', 'young', 'rock', 'rec', 'farmKind']) put(all[k], piece[k], 1);
    for (const k of ['stats', 'farm']) if (piece[k]) piece[k].forEach((a, i) => put(all[k][i], a, 1));
    for (const k of ['sat', 'rip']) if (piece[k]) piece[k].forEach((a, i) => put(all[k][i], a, 3));
    if (piece.crops) piece.crops.forEach((a, i) => put(all.crops[i], a, 2));
}

/** Each column's longitude's and each row's latitude's cosine and sine (once per picture; the same on every worker). */
const angleTables = new Map();
function anglesOf(w) {
    let t = angleTables.get(w);
    if (t) return t;
    const h = w >> 1;
    t = { cosLon: new Float64Array(w), sinLon: new Float64Array(w), cosLat: new Float64Array(h), sinLat: new Float64Array(h) };
    for (let px = 0; px < w; px++) { const lon = ((px + 0.5) / w - 0.5) * 2 * Math.PI; t.cosLon[px] = Math.cos(lon); t.sinLon[px] = Math.sin(lon); }
    for (let py = 0; py < h; py++) { const lat = (0.5 - (py + 0.5) / h) * Math.PI; t.cosLat[py] = Math.cos(lat); t.sinLat[py] = Math.sin(lat); }
    if (angleTables.size > 4) angleTables.clear();
    angleTables.set(w, t);
    return t;
}

/** core/sphere-index.js walk on a slice of the mesh (cells base … base + len − 1): the same steps, the same cell — counted
 *  from the slice's first. */
function walkIn(xyz, adjOffset, adjList, base, kBase, len, cur, x, y, z) {
    let lc = cur - base;
    if (lc < 0 || lc >= len) throw new RangeError('picture: a cell outside its slice');
    let best = x * xyz[3 * lc] + y * xyz[3 * lc + 1] + z * xyz[3 * lc + 2];
    for (let improved = true; improved;) {
        improved = false;
        for (let k = adjOffset[lc] - kBase, e = adjOffset[lc + 1] - kBase; k < e; k++) {
            const nb = adjList[k] - base;
            if (nb < 0 || nb >= len) throw new RangeError('picture: a cell outside its slice');
            const d = x * xyz[3 * nb] + y * xyz[3 * nb + 1] + z * xyz[3 * nb + 2];
            if (d > best) { best = d; lc = nb; improved = true; }
        }
    }
    return lc;
}
/** core/mesh-locate.js locate, from the mesh's nearest cell `lc` (counted from the slice's first): the same arithmetic.
 *  `cells`: the triangle's cells, counted from the slice's first. */
function locateIn(xyz, adjOffset, adjList, base, kBase, len, lc, x, y, z, cells, weights) {
    const cx = xyz[3 * lc], cy = xyz[3 * lc + 1], cz = xyz[3 * lc + 2];
    const start = adjOffset[lc] - kBase, end = adjOffset[lc + 1] - kBase;
    let bestMin = -Infinity, bA = -1, bB = -1, wc = 1, wa = 0, wb = 0;
    for (let k = start; k < end; k++) {
        const a = adjList[k] - base, b = adjList[k + 1 < end ? k + 1 : start] - base;
        if (a < 0 || a >= len || b < 0 || b >= len) throw new RangeError('picture: a cell outside its slice');
        const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2], bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
        // signed volumes: (a × b)·p for c's weight, (b × c)·p for a's, (c × a)·p for b's
        const sc = (ay * bz - az * by) * x + (az * bx - ax * bz) * y + (ax * by - ay * bx) * z;
        const sa = (by * cz - bz * cy) * x + (bz * cx - bx * cz) * y + (bx * cy - by * cx) * z;
        const sb = (cy * az - cz * ay) * x + (cz * ax - cx * az) * y + (cx * ay - cy * ax) * z;
        const sum = sc + sa + sb;
        if (!(Math.abs(sum) > 1e-18)) continue;
        const nc = sc / sum, na = sa / sum, nb = sb / sum, lo = Math.min(nc, na, nb);
        if (lo > bestMin) { bestMin = lo; bA = a; bB = b; wc = nc; wa = na; wb = nb; if (lo >= 0) break; }
    }
    if (bA < 0) { cells[0] = cells[1] = cells[2] = lc; weights[0] = 1; weights[1] = weights[2] = 0; return; }
    wc = Math.max(0, wc); wa = Math.max(0, wa); wb = Math.max(0, wb);
    const s = wc + wa + wb || 1;
    cells[0] = lc; cells[1] = bA; cells[2] = bB;
    weights[0] = wc / s; weights[1] = wa / s; weights[2] = wb / s;
}

/**
 * The picture's one pixel: draw(lc, x, y, sl, i, k) — the pixel at the unit direction (x, y, sl), the mesh's nearest cell
 * to it `lc` (counted from the source's first), its heights, sea and lake written at `i` of `O`, and its climate's
 * picture at `k` (−1: none here) — true if the climate's was written (land, with a climate). `S`: the finish's arrays, or
 * a slice of them; `O`: newOut's.
 */
function pixelDrawer(P, S, O, noise) {
    const { ditherF } = P, { base, len, kBase, xyz, adjOffset, adjList, z, ocean, lake, lakeLevel, tAnnual, pAnnual, koppen } = S;
    const { heightM, sea, water, kop, tA, pA, cov } = O, statS = S.stats, statO = O.stats, NS = statS ? statS.length : 0;
    const farmS = S.farm, farmO = O.farm, NF = farmS ? farmS.length : 0, kindS = S.farmKind, kindO = O.farmKind, cropS = S.crops, cropO = O.crops, NC = cropS ? cropS.length : 0;
    const rockS = S.rock, rockO = O.rock, recS = S.rec, recO = O.rec, satS = S.sat, satO = O.sat, ripS = S.ripSat, ripO = O.rip, coverS = S.cover, flowS = S.flow, flowO = O.flow, youngS = S.young, youngO = O.young;
    const { mottle, dither } = noise, c3 = [0, 0, 0], w3 = [0, 0, 0];
    return (lc, x, y, sl, i, k) => {
        locateIn(xyz, adjOffset, adjList, base, kBase, len, lc, x, y, sl, c3, w3);
        const a = c3[0], b = c3[1], c = c3[2], wa = w3[0], wb = w3[1], wc = w3[2];
        const v = wa * z[a] + wb * z[b] + wc * z[c];
        heightM[i] = Math.max(-32000, Math.min(32000, Math.round(v * 1000)));
        const near = wa >= wb && wa >= wc ? a : wb >= wc ? b : c;
        const isSea = sea[i] = ocean[near];
        // (a lake: under its level, where one of the pixel's cells is lake — its shore as crisp as the heights)
        if (lake) {
            if (lake[a] && wa > 0.2 && v < lakeLevel[a]) water[i] = lake[a];
            else if (lake[b] && wb > 0.2 && v < lakeLevel[b]) water[i] = lake[b];
            else if (lake[c] && wc > 0.2 && v < lakeLevel[c]) water[i] = lake[c];
        }
        if (k < 0 || isSea) return false;
        // (the pixel's land cells: not the sea's, and with a climate)
        const ua = !ocean[a] && tAnnual[a] === tAnnual[a], ub = !ocean[b] && tAnnual[b] === tAnnual[b], uc = !ocean[c] && tAnnual[c] === tAnnual[c];
        let ws = 0, t = 0, p = 0, best = -1, bw = 0;
        if (ua) { ws += wa; t += wa * tAnnual[a]; p += wa * pAnnual[a]; if (wa > bw) { bw = wa; best = a; } }
        if (ub) { ws += wb; t += wb * tAnnual[b]; p += wb * pAnnual[b]; if (wb > bw) { bw = wb; best = b; } }
        if (uc) { ws += wc; t += wc * tAnnual[c]; p += wc * pAnnual[c]; if (wc > bw) { bw = wc; best = c; } }
        if (best < 0) return false;
        // (the land's Köppen class — its weightiest land cell's — °C × 100 and mm a year: its land cells' weighted mean)
        kop[k] = koppen[best]; tA[k] = Math.round(100 * t / ws); pA[k] = Math.min(65535, Math.round(p / ws));
        // (and the land's measures beyond Köppen, cell-stats.js bytes — the weightiest land cell's)
        for (let q = 0; q < NS; q++) statO[q][k] = statS[q][best];
        if (farmS) {
            // (the farming's parts: its land cells' weighted mean — the soil's kind the weightiest's)
            for (let q = 0; q < NF; q++) {
                const F = farmS[q];
                let s = 0;
                if (ua) s += wa * F[a];
                if (ub) s += wb * F[b];
                if (uc) s += wc * F[c];
                farmO[q][k] = Math.round(s / ws);
            }
            kindO[k] = kindS[best];
            // (each crop group's harvests a year, by rain and watered: each averaged in harvests, not in its byte)
            for (let g = 0; g < NC; g++) {
                const B = cropS[g], D = cropO[g];
                for (let q = 0; q < 2; q++) {
                    let s = 0;
                    if (ua) s += wa * DEC[B[2 * a + q]];
                    if (ub) s += wb * DEC[B[2 * b + q]];
                    if (uc) s += wc * DEC[B[2 * c + q]];
                    D[2 * k + q] = encHarvests(s / ws);
                }
            }
        }
        if (rockS) {
            // (the rock: where the pixel's cells differ, the one with the largest share scaled by a noise of
            // its own about a cell across — contacts ragged within a cell, never the mesh's straight edges — and the
            // history's record cell it shows, for the Geology tab's other views)
            const r0 = rockS[best];
            let pick = best;
            if ((ua && rockS[a] !== r0) || (ub && rockS[b] !== r0) || (uc && rockS[c] !== r0)) {
                let pv = -1;
                pick = -1;
                const dx = x * ditherF, dy = y * ditherF, dz = sl * ditherF;
                if (ua) { const g = a + base, vv = wa * Math.exp(1.6 * dither.noise3D(dx + (g % 101) * 1.37, dy + (g % 89) * 2.11, dz + (g % 83) * 0.73)); if (vv > pv) { pv = vv; pick = a; } }
                if (ub) { const g = b + base, vv = wb * Math.exp(1.6 * dither.noise3D(dx + (g % 101) * 1.37, dy + (g % 89) * 2.11, dz + (g % 83) * 0.73)); if (vv > pv) { pv = vv; pick = b; } }
                if (uc) { const g = c + base, vv = wc * Math.exp(1.6 * dither.noise3D(dx + (g % 101) * 1.37, dy + (g % 89) * 2.11, dz + (g % 83) * 0.73)); if (vv > pv) { pv = vv; pick = c; } }
            }
            rockO[k] = rockS[pick];
            if (recS) recO[k] = recS[pick];
        }
        if (satS) {
            // (the land's colours from space — the year, January, July: its land cells' weighted mean — with a fine
            // mottling of the brightness, per pixel, the same in every view; its biome and snow the weightiest's)
            const mf = fineMottle(x, y, sl, mottle), o = 3 * k, oa = 3 * a, ob = 3 * b, oc = 3 * c;
            for (let vw = 0; vw < 3; vw++) {
                const Sv = satS[vw], D = satO[vw];
                let s0 = 0, s1 = 0, s2 = 0;
                if (ua) { s0 += wa * Sv[oa]; s1 += wa * Sv[oa + 1]; s2 += wa * Sv[oa + 2]; }
                if (ub) { s0 += wb * Sv[ob]; s1 += wb * Sv[ob + 1]; s2 += wb * Sv[ob + 2]; }
                if (uc) { s0 += wc * Sv[oc]; s1 += wc * Sv[oc + 1]; s2 += wc * Sv[oc + 2]; }
                D[o] = Math.min(255, Math.round(mf * s0 / ws)); D[o + 1] = Math.min(255, Math.round(mf * s1 / ws)); D[o + 2] = Math.min(255, Math.round(mf * s2 / ws));
            }
            cov[k] = coverS[best];
            if (ripS) for (let vw = 0; vw < 3; vw++) {
                const Sv = ripS[vw], D = ripO[vw];
                let s0 = 0, s1 = 0, s2 = 0;
                if (ua) { s0 += wa * Sv[oa]; s1 += wa * Sv[oa + 1]; s2 += wa * Sv[oa + 2]; }
                if (ub) { s0 += wb * Sv[ob]; s1 += wb * Sv[ob + 1]; s2 += wb * Sv[ob + 2]; }
                if (uc) { s0 += wc * Sv[oc]; s1 += wc * Sv[oc + 1]; s2 += wc * Sv[oc + 2]; }
                D[o] = Math.round(mf * s0 / ws); D[o + 1] = Math.round(mf * s1 / ws); D[o + 2] = Math.min(255, Math.round(mf * s2 / ws));
            }
            // (the flow: the land cells' log-area, the most of the three — so a valley's line stays a line)
            if (flowS) {
                let fl = 0;
                if (!ocean[a] && wa > 0.15) fl = Math.max(fl, flowS[a]);
                if (!ocean[b] && wb > 0.15) fl = Math.max(fl, flowS[b]);
                if (!ocean[c] && wc > 0.15) fl = Math.max(fl, flowS[c]);
                flowO[k] = fl;
            }
            if (youngS) {
                let yg = 0;
                if (!ocean[a]) yg += wa * youngS[a];
                if (!ocean[b]) yg += wb * youngS[b];
                if (!ocean[c]) yg += wc * youngS[c];
                youngO[k] = Math.round(yg / ws);
            }
        }
        return true;
    };
}

const noiseOf = P => ({ mottle: P.sat ? new FastNoise(P.mottleSeed) : null, dither: P.rock ? new FastNoise(0x6e0c) : null });

/** The picture, from its arrays (newOut of all of it, drawn and with the terrain's look), as the page reads it. */
function pictureOf(P, O, climate, geology) {
    const { w, h, cw, ch } = P;
    return { w, h, heightM: O.heightM, ocean: O.sea, water: O.water,
        geology: O.rock ? { w: cw, h: ch, rock: O.rock, rec: O.rec, deposits: geology.deposits ?? null } : null,
        farming: O.farm ? { w: cw, h: ch, ...Object.fromEntries(FARM_KEYS.map((k, i) => [k, O.farm[i]])), kind: O.farmKind, ...(O.crops ? { crops: Object.fromEntries(P.crops.map((k, i) => [k, O.crops[i]])) } : {}) } : null,
        climate: cw ? { w: cw, h: ch, koppen: O.kop, tAnnual: O.tA, pAnnual: O.pA, ...(O.stats ? { stats: Object.fromEntries(STAT_KEYS.map((k, i) => [k, O.stats[i]])) } : {}), ...(climate.families ? { families: climate.families } : {}),
            ...(O.sat ? { sat: { year: O.sat[0], jan: O.sat[1], jul: O.sat[2] }, cover: O.cov } : {}) } : null };
}
/** The satellite picture's fields as finish-cover.js terrainLook reads them. */
const lookFields = (P, O, climate, noise) => ({ w: P.cw, h: P.ch, sat: { year: O.sat[0], jan: O.sat[1], jul: O.sat[2] }, cover: O.cov, tAnnual: O.tA, pAnnual: O.pA, koppen: O.kop, flow: O.flow, young: O.young, noise: noise.mottle,
    rivers: climate.rivers, water: P.lake ? O.water : null, ripSat: O.rip ? { year: O.rip[0], jan: O.rip[1], jul: O.rip[2] } : null });

/**
 * The finished planet as an equirectangular picture of heights: w × w/2 pixels (rows north → south, columns from −180°
 * east), 16-bit metres, and the ocean (1) — for the page to paint and shade, and to export. Heights blended over the
 * mesh triangle under each pixel; `onRow` reports progress.
 * With the climate (the finish's climate.cell): its picture, at most as wide as the page's sharpest texture — every f-th
 * pixel of the heights' — the land's Köppen class, °C × 100 and mm a year (the sea −32768 °C, 0 mm), its measures beyond
 * Köppen, its colours from space (the year, January, July) with its biome and snow, the rocks and the history's record
 * cell each shows, and the farming's parts.
 */
export function finishRaster(mesh, z, ocean, w, onRow = null, lake = null, lakeLevel = null, climate = null, geology = null, farming = null) {
    const P = rasterPlan(mesh, w, lake, climate, geology, farming), S = wholeSource(mesh, z, ocean, lake, lakeLevel, climate, geology, farming, P), { h, cw, ch, f } = P;
    const O = newOut(P, w * h, cw * ch), noise = noiseOf(P), draw = pixelDrawer(P, S, O, noise), index = mesh.index, { cosLon, sinLon, cosLat, sinLat } = anglesOf(w);
    for (let py = 0; py < h; py++) {
        const cl = cosLat[py], sl = sinLat[py], row = py * w, crow = cw && py % f === 0 ? (py / f) * cw : -1;
        for (let px = 0; px < w; px++) {
            const x = cl * cosLon[px], y = cl * sinLon[px];
            draw(index.nearest(x, y, sl), x, y, sl, row + px, crow >= 0 && px % f === 0 ? crow + px / f : -1);
        }
        if (onRow && (py & 63) === 0) onRow(py / h);
    }
    // (the terrain on the satellite picture: rock where steep, slopes and valleys in dry country — from the heights)
    if (P.sat) { const C = lookFields(P, O, climate, noise); lookRows(lookPrepare(C, O.heightM, w), C, 0, ch); }
    return pictureOf(P, O, climate, geology);
}

/**
 * finishRaster on a pool of workers (core/task-pool.js, serving finish-tasks.js): the same picture, to the bit — its
 * pixels dealt out by the run of mesh cells they fall on, each run drawn by a worker from its own slice of the finish's
 * arrays; then the terrain's look in bands of rows. Where there is no pool, or a piece fails, the picture is drawn here.
 */
export async function finishRasterPooled(pool, mesh, z, ocean, w, onRow = null, lake = null, lakeLevel = null, climate = null, geology = null, farming = null) {
    if (!pool || pool.closed) return finishRaster(mesh, z, ocean, w, onRow, lake, lakeLevel, climate, geology, farming);
    try {
        const P = rasterPlan(mesh, w, lake, climate, geology, farming), S = wholeSource(mesh, z, ocean, lake, lakeLevel, climate, geology, farming, P);
        const { h, cw, ch } = P, total = w * h, O = newOut(P, total, cw * ch), { cosLon, sinLon, cosLat, sinLat } = anglesOf(w), index = mesh.index, { adjOffset, adjList } = mesh, n = mesh.numCells;
        const ms = pictureMs, lap = k => { const t = performance.now(); ms[k] = (ms[k] ?? 0) + t - ms.t; ms.t = t; };
        for (const k of Object.keys(ms)) delete ms[k];
        ms.t = performance.now();
        await pool.share('picture', P);
        // (each pixel's first guess of its cell — core/sphere-index.js start — and the pixels in the order of their runs)
        let guess = new Int32Array(total);
        const count = new Int32Array(RUNS + 1), runOf = g => Math.min(RUNS - 1, Math.floor(g * RUNS / n));
        for (let py = 0, i = 0; py < h; py++) {
            const cl = cosLat[py], sl = sinLat[py];
            for (let px = 0; px < w; px++, i++) count[runOf(guess[i] = index.start(cl * cosLon[px], cl * sinLon[px], sl)) + 1]++;
        }
        for (let r = 0; r < RUNS; r++) count[r + 1] += count[r];
        const order = new Int32Array(total), at = count.slice(0, RUNS);
        for (let i = 0; i < total; i++) order[at[runOf(guess[i])]++] = i;
        const runs = [];
        for (let r = 0; r < RUNS; r++) if (count[r + 1] > count[r]) runs.push(r);
        lap('deal');
        let done = 0;
        const G = guess;
        guess = null;
        await pool.run('picturePiece', runs.length, j => {
            // (the run's pixels and their guesses, and the cells within SLICE_HOPS of them)
            const from = count[runs[j]], to = count[runs[j] + 1], pix = order.slice(from, to), g = new Int32Array(to - from);
            let lo = n, hi = -1;
            for (let q = 0; q < g.length; q++) { const c = g[q] = G[pix[q]]; if (c < lo) lo = c; if (c > hi) hi = c; }
            let fromLo = lo, toLo = hi + 1, fromHi = 0, toHi = 0;                  // (the cells whose neighbours are still to be read: two runs)
            for (let hop = 0; hop < SLICE_HOPS; hop++) {
                let nlo = lo, nhi = hi;
                for (let k = adjOffset[fromLo], e = adjOffset[toLo]; k < e; k++) { const c = adjList[k]; if (c < nlo) nlo = c; if (c > nhi) nhi = c; }
                for (let k = adjOffset[fromHi], e = adjOffset[toHi]; k < e; k++) { const c = adjList[k]; if (c < nlo) nlo = c; if (c > nhi) nhi = c; }
                fromLo = nlo; toLo = lo; fromHi = hi + 1; toHi = nhi + 1;
                lo = nlo; hi = nhi;
            }
            const { src, transfer } = sliceSource(S, lo, hi + 1);
            return { part: { pix, guess: g, src }, transfer: [pix.buffer, g.buffer, ...transfer] };
        }, (piece, j) => { placePiece(O, piece, order.subarray(count[runs[j]], count[runs[j] + 1])); onRow?.(0.8 * ++done / runs.length); });
        lap('pieces');
        if (P.sat) {
            const noise = noiseOf(P), C = lookFields(P, O, climate, noise), L = await lookPreparePooled(pool, P, C, O.heightM);
            lap('look: whole picture');
            const bands = Math.ceil(ch / LOOK_ROWS), rows = (a, y0, y1, per = 1) => (a ? a.slice(per * y0 * cw, per * y1 * cw) : null);
            done = 0;
            await pool.run('lookBand', bands, b => {
                const y0 = b * LOOK_ROWS, y1 = Math.min(ch, y0 + LOOK_ROWS), h0 = Math.max(0, y0 - 1), h1 = Math.min(ch, y1 + 1);
                const part = { y0, y1, L: { cw, ch, pxKm: L.pxKm, hC: rows(L.hC, h0, h1), land: rows(L.land, y0, y1), mean: rows(L.mean, y0, y1), std: rows(L.std, y0, y1), rip: rows(L.rip, y0, y1), yOff: y0, hOff: h0 },
                    sat: O.sat.map(a => rows(a, y0, y1, 3)), rip: O.rip ? O.rip.map(a => rows(a, y0, y1, 3)) : null, cover: rows(O.cov, y0, y1), tAnnual: rows(O.tA, y0, y1), pAnnual: rows(O.pA, y0, y1), flow: rows(O.flow, y0, y1), young: rows(O.young, y0, y1) };
                return { part, transfer: [...buffersOf(part.L), ...buffersOf(part)] };
            }, (res, b) => { res.forEach((a, v) => O.sat[v].set(a, 3 * b * LOOK_ROWS * cw)); onRow?.(0.8 + 0.2 * ++done / bands); });
        }
        lap('look: rows');
        await pool.forget('picture');
        return pictureOf(P, O, climate, geology);
    } catch (err) {
        if (err?.name === 'AbortError') throw err;
        return finishRaster(mesh, z, ocean, w, onRow, lake, lakeLevel, climate, geology, farming);
    }
}

/**
 * finish-cover.js lookPrepare with its two long parts side by side on the pool: the land's surroundings (boxStats) on one
 * worker, the rivers' ribbons dealt out by reach to the others — a pixel's riverside is the most of what covers it, so
 * the reaches may be stamped in any order and joined by each pixel's most — and the lakes' fringes here meanwhile.
 */
async function lookPreparePooled(pool, P, C, heightM) {
    const G = lookGround(C, heightM, P.w), { cw, ch, pxKm, hC, land } = G, R = C.rivers, parts = [{ kind: 'stats' }];
    const rip = R || C.water ? new Float32Array(cw * ch) : null;
    let wet = null, mean = null, std = null;
    if (R && R.lat.length) {
        // (where it is too wet for a riverside to show: lookDryAt's test, once per land pixel)
        const dryAt = lookDryAt(C);
        wet = new Uint8Array(cw * ch);
        for (let i = 0; i < wet.length; i++) if (land[i] && dryAt(i) < 0.02) wet[i] = 1;
        // (the reaches in runs of about as many points each)
        const reaches = R.start.length, points = R.lat.length, pieces = Math.max(1, Math.min(pool.size, reaches)), endOf = r => (r + 1 < reaches ? R.start[r + 1] : points);
        for (let k = 0, r = 0; k < pieces && r < reaches; k++) {
            const r0 = r, target = (k + 1) * points / pieces;
            while (r < reaches && (k === pieces - 1 || endOf(r) <= target || r === r0)) r++;
            parts.push({ kind: 'rivers', r0, r1: r });
        }
    }
    const run = pool.run('lookPiece', parts.length, j => {
        const part = parts[j], own = { kind: part.kind, cw, ch, pxKm, hC: hC.slice(), land: land.slice() };
        if (part.kind === 'rivers') {
            const p0 = R.start[part.r0], p1 = part.r1 < R.start.length ? R.start[part.r1] : R.lat.length, start = R.start.slice(part.r0, part.r1);
            for (let i = 0; i < start.length; i++) start[i] -= p0;
            Object.assign(own, { wet: wet.slice(), mottleSeed: P.mottleSeed, R: { start, lat: R.lat.slice(p0, p1), lon: R.lon.slice(p0, p1), q: R.q.slice(p0, p1) } });
        }
        return { part: own, transfer: [...buffersOf(own), ...(own.R ? buffersOf(own.R) : [])] };
    }, (res, j) => {
        if (parts[j].kind === 'stats') { mean = res.mean; std = res.std; return; }
        for (let i = 0; i < rip.length; i++) if (res[i] > rip[i]) rip[i] = res[i];
    });
    run.catch(() => {});                                              // (awaited below: a failure is not left unhandled meanwhile)
    // (the lakes' fringes here, while the workers stamp the rivers)
    if (C.water) riparian(null, C.water, P.w, hC, land, cw, ch, pxKm, COVER, null, null, rip);
    await run;
    return { ...G, mean, std, rip, yOff: 0, hOff: 0 };
}
/** A worker's part of lookPreparePooled. */
export function lookPieceTask(part) {
    const { cw, ch, pxKm, hC, land } = part;
    if (part.kind === 'stats') { const { mean, std } = boxStats(hC, land, cw, ch, pxKm, COVER.valleyKm); return { result: { mean, std }, transfer: [mean.buffer, std.buffer] }; }
    const wet = part.wet, out = riparian(part.R, null, 0, hC, land, cw, ch, pxKm, COVER, new FastNoise(part.mottleSeed), i => (wet[i] ? 0 : 1));
    return { result: out, transfer: [out.buffer] };
}

/** How long the last pooled picture's parts took (ms): for the bench. */
export const pictureMs = {};

const pieceNoise = { of: null, noise: null };
/** A worker's part of finishRasterPooled: a run's pixels (`pix`: where each lies in the picture; `guess`: the index's
 *  first guess of its cell) from the run's slice of the finish's arrays — each pixel's values in the pixels' order, the
 *  climate's picture's as the `m` that have any, in `cpix`' places. */
export function picturePieceTask({ pix, guess, src }, common) {
    const P = common.picture, { w, cw, f } = P, { cosLon, sinLon, cosLat, sinLat } = anglesOf(w), { base, len, kBase, xyz, adjOffset, adjList } = src;
    if (pieceNoise.of !== P) { pieceNoise.of = P; pieceNoise.noise = noiseOf(P); }       // (the picture's noises: once per picture)
    let cap = 0;
    if (cw) for (let q = 0; q < pix.length; q++) { const i = pix[q], py = (i / w) | 0; if (py % f === 0 && (i - py * w) % f === 0) cap++; }
    const O = newOut(P, pix.length, cap), cpix = new Int32Array(cap), draw = pixelDrawer(P, src, O, pieceNoise.noise);
    let m = 0;
    for (let q = 0; q < pix.length; q++) {
        const i = pix[q], py = (i / w) | 0, px = i - py * w, cl = cosLat[py], sl = sinLat[py], x = cl * cosLon[px], y = cl * sinLon[px];
        const lc = walkIn(xyz, adjOffset, adjList, base, kBase, len, guess[q], x, y, sl);
        if (draw(lc, x, y, sl, q, cw && py % f === 0 && px % f === 0 ? m : -1)) cpix[m++] = (py / f) * cw + px / f;
    }
    // (a climate pixel drawn at m but turned down — the sea, or no land cell — left its heights' own values there alone)
    O.m = m; O.cpix = cpix;
    return { result: O, transfer: buffersOf(O) };
}
/** …and a band of the terrain's look on the satellite picture: its three views' rows, done. */
export function lookBandTask({ y0, y1, L, sat, rip, cover, tAnnual, pAnnual, flow, young }, common) {
    const P = common.picture, noise = new FastNoise(P.mottleSeed);
    lookRows(L, { sat: { year: sat[0], jan: sat[1], jul: sat[2] }, cover, tAnnual, pAnnual, flow, young, noise, ripSat: rip ? { year: rip[0], jan: rip[1], jul: rip[2] } : null }, y0, y1);
    return { result: sat, transfer: sat.map(a => a.buffer) };
}
