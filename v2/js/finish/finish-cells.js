// The finished moment's climate, cell by cell (finish.js, the "final climate" stage): the grid's climate as calculated
// on the uncarved surface, each cell's own on the finished one — its height, its relief — and from each land cell's twelve
// months its measures beyond Köppen, the land's cover as from space (the year, January, July; and well watered: the
// riverside's), its biome and snow, the deposits' climate tests and the farming's seasons. Every cell depends on its own
// values alone, so the cells are worked through here in one run (climateCells) or in runs on a pool of workers
// (finalClimate: core/task-pool.js) — the same code on the same values, the same result to the bit.

import { COVER } from './finish-config.js';
import { landCover, coverRgb, newCover, coverRainScale, newVariety, placeVariety, placeGround } from './finish-cover.js';
import { CORE_DEFAULTS, cellClimate } from '../climate/core.js';
import { cellStatsCollector, STAT_KEYS } from '../climate/cell-stats.js';
import { FastNoise } from '../core/fast-noise.js';
import { softFamilies } from '../climate/koppen-soft.js';
import { climateTests, climateTestArrays } from '../geology/deposits.js';
import { newFarmClimate, addFarmClimate } from '../farming/farming.js';

/** The four grid points around (lat, lon) and their bilinear weights. */
export function corners(g, lat, lon, bi, bw) {
    const { w, h } = g, step = 180 / h;
    const x = (lon + 180) / step - 0.5, y = Math.max(0, Math.min(h - 1, (90 - lat) / step - 0.5));
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const i0 = ((x0 % w) + w) % w, i1 = i0 + 1 === w ? 0 : i0 + 1, j1 = y0 + 1 < h ? y0 + 1 : y0;
    bi[0] = y0 * w + i0; bi[1] = y0 * w + i1; bi[2] = j1 * w + i0; bi[3] = j1 * w + i1;
    bw[0] = (1 - fx) * (1 - fy); bw[1] = fx * (1 - fy); bw[2] = (1 - fx) * fy; bw[3] = fx * fy;
}

/**
 * A run of cells' climate and what follows from it.
 * @param {{grid, surface, months, F, seed: number, tests: boolean}} g  the grid's climate (computeClimate's grid — its
 *   step, w, h, size — surface and months), the finish's config, the planet's seed, and whether the deposits' climate
 *   tests are wanted
 * @param {{xyz, z, land, lat, lon, rainTarget, erg, loess, basalt, rock}} a  the cells' own (rock: null without the geology)
 * @param {(c: number, T12: Float64Array, P12: Float64Array) => void} onFamily  shown each land cell's months, as the
 *   climate has them (for the climate's shares: climate/koppen-soft.js)
 * @returns {{koppen, tAnnual, pAnnual, sat, ripSat, cover, stats, clim, farmC, called: number}}  called: the land cells
 *   that had a climate
 */
export function climateCells(g, a, onFamily) {
    const { F, seed } = g, { xyz, z, lat, lon, rainTarget, erg, loess, basalt, rock } = a, n = lat.length;
    const sat = [new Uint8Array(3 * n), new Uint8Array(3 * n), new Uint8Array(3 * n)], cover = new Uint8Array(n), cv = newCover();
    // (and the riverside's colour: the cover again, well watered — where it is dry enough to differ; else the cover's own)
    const ripSat = [new Uint8Array(3 * n), new Uint8Array(3 * n), new Uint8Array(3 * n)], cvWet = newCover(), PW = new Float64Array(12), P12c = new Float64Array(12);
    // (and its variety: tints between a few natural colours, by noise — its own stream)
    const varyNoise = new FastNoise(((seed | 0) * 0x51f3 + 0x3a9) >>> 0), vy = newVariety();
    // (and its temperatures at its own full height — the climate takes only part of a place's height above its
    // surroundings: tree and snow lines follow all of it — its surroundings' height as the climate has it, the 1° grid's
    // mean land height)
    const gamma = CORE_DEFAULTS.lapseRateCPerKm, relief = COVER.fullLapse ? (1 - CORE_DEFAULTS.terrainRelief) * gamma : 0, hLand = g.surface.meanLandKm, T12c = new Float64Array(12);
    const climGrid = { w: g.grid.w, h: g.grid.h }, bi = new Int32Array(4), bw = new Float64Array(4);
    // (and its measures beyond Köppen — cell-stats.js, one byte each — from the climate's own twelve months)
    const cellStats = cellStatsCollector(n, c => lat[c] * Math.PI / 180, { bytes: true });
    // (and the deposits' climate tests: bauxite, laterites, salt, peat, enriched copper — geology/deposits.js)
    const clim = g.tests ? climateTestArrays(n) : null;
    // (and the farming's parts the months decide — its growing season, what the climate makes of the soil — from the
    // months and the cover as the land's cover reads them: farming/farming.js)
    const farmC = newFarmClimate(n);
    let called = 0;
    const cells = cellClimate({ grid: g.grid, surface: g.surface, months: g.months, cell: { lat, lon } }, xyz, z, a.land, {}, (c, T12, P12) => {
        called++;
        cellStats.add(c, T12, P12);
        onFamily(c, T12, P12);
        let T = T12;
        if (relief) {
            corners(climGrid, lat[c], lon[c], bi, bw);
            let s = 0, k = 0;
            for (let j = 0; j < 4; j++) { const v = hLand[bi[j]]; if (v === v) { s += bw[j] * Math.max(0, v); k += bw[j]; } }
            const dT = k > 0 ? relief * (Math.max(0, z[c]) - s / k) : 0;
            for (let m = 0; m < 12; m++) T12c[m] = T12[m] - dT;
            T = T12c;
        }
        if (clim) climateTests(T, P12, c, clim);
        landCover(T, coverRainScale(P12, rainTarget[c], P12c), cv, F, COVER, lat[c]);
        addFarmClimate(farmC, c, T, P12c, cv);
        placeVariety(xyz[3 * c], xyz[3 * c + 1], xyz[3 * c + 2], varyNoise, vy);
        placeGround(vy, erg[c], loess[c] / F.loessKm, basalt[c] / 255, COVER, rock ? rock[c] : 0);
        for (let v = 0; v < 3; v++) coverRgb(cv, v, sat[v], 3 * c, undefined, vy);
        if (cv.wetness < COVER.ripWetness) {
            const k = COVER.ripWetness / Math.max(0.02, cv.wetness);
            for (let m = 0; m < 12; m++) PW[m] = P12c[m] * k;
            landCover(T, PW, cvWet, F, COVER, lat[c]);
            for (let v = 0; v < 3; v++) coverRgb(cvWet, v, ripSat[v], 3 * c, undefined, vy);
        } else for (let v = 0; v < 3; v++) { const S = sat[v], D = ripSat[v], o = 3 * c; D[o] = S[o]; D[o + 1] = S[o + 1]; D[o + 2] = S[o + 2]; }
        cover[c] = cv.biome | (cv.snow[1] >= 0.5 ? 32 : 0) | (cv.snow[2] >= 0.5 ? 64 : 0);
    });
    return { koppen: cells.koppen, tAnnual: cells.tAnnual, pAnnual: cells.pAnnual, sat, ripSat, cover, stats: cellStats.stats, clim, farmC, called };
}

/** The farming's per-cell parts of the climate (farming.js newFarmClimate's arrays, without its working values). */
const FARM_PARTS = ['rain', 'warm', 'black', 'leach', 'podzol', 'wet', 'pasture'];
/** Below this many cells the pool is not worth its messages. */
const POOL_FROM_CELLS = 60000;

/**
 * climateCells for all of a planet's cells — on `pool` (finish-tasks.js) in runs of cells where there is one, the same
 * result to the bit — with the climate's shares gathered into `famGrid` (koppen-soft.js softFamilyGrid, fresh): each
 * grid cell's first few land places, in the cells' order, wherever they were worked out.
 */
export async function finalClimate(pool, g, a, famGrid) {
    const { lat, lon, land } = a, n = lat.length, famBuf = new Float64Array(10);
    const inPlace = () => climateCells(g, a, (c, T12, P12) => { const q = famGrid.wants(lat[c], lon[c]); if (q >= 0) famGrid.add(q, softFamilies(T12, P12, famBuf)); });
    if (!pool || pool.closed || n < POOL_FROM_CELLS) return inPlace();
    try {
        // (the places the shares are wanted from: each grid cell's first `perCell` land cells, as famGrid.wants would say
        // cell after cell — settled here first, so the runs need not be worked through in order)
        const want = new Uint8Array(n), taken = new Uint8Array(famGrid.size);
        let landCells = 0;
        for (let c = 0; c < n; c++) {
            if (!land[c]) continue;
            landCells++;
            const q = famGrid.index(lat[c], lon[c]);
            if (taken[q] < famGrid.perCell) { taken[q]++; want[c] = 1; }
        }
        await pool.share('climateCells', { grid: { step: g.grid.step, w: g.grid.w, h: g.grid.h, size: g.grid.size }, surface: { meanLandKm: g.surface.meanLandKm }, months: { T: g.months.T, P: g.months.P }, F: g.F, seed: g.seed, tests: g.tests });
        const runs = Math.min(n, pool.size * 6), from = i => Math.floor(i * n / runs);
        const out = { koppen: new Uint8Array(n), tAnnual: new Float32Array(n), pAnnual: new Float32Array(n), sat: [0, 1, 2].map(() => new Uint8Array(3 * n)), ripSat: [0, 1, 2].map(() => new Uint8Array(3 * n)), cover: new Uint8Array(n),
            stats: Object.fromEntries(STAT_KEYS.map(k => [k, new Uint8Array(n)])), clim: g.tests ? climateTestArrays(n) : null, farmC: newFarmClimate(n), called: 0 };
        const fam = new Array(runs);
        await pool.run('climateCells', runs, i => {
            const c0 = from(i), c1 = from(i + 1), cut = (v, per = 1) => (v ? v.slice(per * c0, per * c1) : null);
            const part = { xyz: cut(a.xyz, 3), z: cut(a.z), land: cut(land), lat: cut(lat), lon: cut(lon), rainTarget: cut(a.rainTarget), erg: cut(a.erg), loess: cut(a.loess), basalt: cut(a.basalt), rock: cut(a.rock), want: cut(want) };
            return { part, transfer: Object.values(part).filter(v => v).map(v => v.buffer) };
        }, (r, i) => {
            const c0 = from(i);
            out.koppen.set(r.koppen, c0); out.tAnnual.set(r.tAnnual, c0); out.pAnnual.set(r.pAnnual, c0); out.cover.set(r.cover, c0);
            for (let v = 0; v < 3; v++) { out.sat[v].set(r.sat[v], 3 * c0); out.ripSat[v].set(r.ripSat[v], 3 * c0); }
            for (const k of STAT_KEYS) out.stats[k].set(r.stats[k], c0);
            if (out.clim) for (const k of Object.keys(out.clim)) out.clim[k].set(r.clim[k], c0);
            for (const k of FARM_PARTS) out.farmC[k].set(r.farm[k], c0);
            for (const k of Object.keys(out.farmC.crops)) out.farmC.crops[k].set(r.farm.crops[k], 2 * c0);
            fam[i] = r.fam; out.called += r.called;
        });
        // (every land cell must have had a climate for the wanted places to be the ones famGrid.wants would have chosen)
        if (out.called !== landCells) throw new Error('a land cell without a climate');
        for (let i = 0; i < runs; i++) {
            const { cells, shares } = fam[i], c0 = from(i);
            for (let j = 0; j < cells.length; j++) { const c = c0 + cells[j]; famGrid.add(famGrid.index(lat[c], lon[c]), shares.subarray(10 * j, 10 * j + 10)); }
        }
        await pool.forget('climateCells');
        return out;
    } catch (err) {
        if (err?.name === 'AbortError') throw err;
        console.warn('[finish] the final climate ran in place:', String(err?.message ?? err).split('\n')[0]);
        return inPlace();
    }
}

/** A worker's part of finalClimate: a run of cells, and the shares of those of them that are wanted. */
export function climateCellsTask(part, common) {
    const want = part.want, buf = new Float64Array(10);
    let wanted = 0;
    for (let c = 0; c < want.length; c++) wanted += want[c];
    const cells = new Int32Array(wanted), shares = new Float64Array(10 * wanted);
    let k = 0;
    const r = climateCells(common.climateCells, part, (c, T12, P12) => { if (want[c]) { softFamilies(T12, P12, buf); cells[k] = c; shares.set(buf, 10 * k++); } });
    const farm = { ...Object.fromEntries(FARM_PARTS.map(key => [key, r.farmC[key]])), crops: r.farmC.crops };
    const result = { koppen: r.koppen, tAnnual: r.tAnnual, pAnnual: r.pAnnual, sat: r.sat, ripSat: r.ripSat, cover: r.cover, stats: r.stats, clim: r.clim, farm, fam: { cells: cells.subarray(0, k), shares: shares.subarray(0, 10 * k) }, called: r.called };
    const transfer = [r.koppen, r.tAnnual, r.pAnnual, ...r.sat, ...r.ripSat, r.cover, ...Object.values(r.stats), ...(r.clim ? Object.values(r.clim) : []), ...FARM_PARTS.map(key => farm[key]), ...Object.values(farm.crops), cells, shares].map(v => v.buffer);
    return { result, transfer };
}
