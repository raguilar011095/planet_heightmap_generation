// G7d — Evolution's Geology and Food layers on Generate's own mesh (plans/GENERATE_REDESIGN_PLAN.md G7b; owner,
// 2026-11-04: "implement the other layers in evolution here. The rocks and food").
//
// Evolution works them out in its finish (finish/finish.js), on its own mesh, from its own surface, rivers, ice age and
// wind. Generate has its ground already: its heights, its rivers (the carve's drainage), its climate (each region's
// twelve months), and the present-day Frame with its geological record (present/record.js). So the same steps run here,
// on that ground:
//   · during the climate, per land region, from its twelve months: its land cover (finish-cover.js landCover — the
//     biome the deposits read), what the farming needs of the climate (its growing season, what the climate makes of the
//     soil: farming.js addFarmClimate) and the deposits' climate tests (bauxite, laterite, salt, peat);
//   · after it: the rocks (geology/rocks.js classifyRocks — the rivers' plains from the drainage), the deposits
//     (geology/deposits.js depositFields — placers down the carve's rivers), the farming's parts (farming.js farmCells);
//   · and Evolution's picture of them (finish.js finishRaster), the equirectangular rasters its Geology and Food views
//     read, so the page shows them with Evolution's own colours, legends and readouts.

import { classifyRocks } from '../geology/rocks.js';
import { depositFields, climateTestArrays, climateTests } from '../geology/deposits.js';
import { newFarmClimate, addFarmClimate, farmCells } from '../farming/farming.js';
import { landCover, newCover } from '../finish/finish-cover.js';
import { FINISH, COVER } from '../finish/finish-config.js';
import { finishRaster } from '../finish/finish.js';
import { LatLonGrid } from '../finish/finish-grid.js';
import { terrainConfig } from '../terrain/terrain-config.js';
import { PRESENT } from './present-config.js';
import { CUT_STEP_KM } from './world.js';

const DEG = 180 / Math.PI;

/**
 * What the layers gather from the climate, per region (call `onCell` for each land region with its twelve months).
 * @param {number} n  regions   @param {Float32Array} xyz  their positions (z-up: the terrain mesh's)
 */
export function layerClimate(n, xyz) {
    const farm = newFarmClimate(n), clim = climateTestArrays(n), biome = new Uint8Array(n), cv = newCover();
    const tAnnual = new Float32Array(n).fill(NaN), pAnnual = new Float32Array(n).fill(NaN);
    return {
        farm, clim, biome, tAnnual, pAnnual,
        onCell(r, T12, P12) {
            const lat = Math.asin(Math.max(-1, Math.min(1, xyz[3 * r + 2]))) * DEG;
            landCover(T12, P12, cv, FINISH, COVER, lat);
            addFarmClimate(farm, r, T12, P12, cv);
            climateTests(T12, P12, r, clim);
            biome[r] = cv.biome | (cv.snow[1] >= 0.5 ? 32 : 0) | (cv.snow[2] >= 0.5 ? 64 : 0);
            let t = 0, p = 0;
            for (let m = 0; m < 12; m++) { t += T12[m]; p += P12[m]; }
            tAnnual[r] = t / 12; pAnnual[r] = p;
        },
    };
}

/** The raster's width for a mesh this fine: about two pixels a cell across, 1024 … 2048. */
export const layerRasterWidth = (n) => Math.max(1024, Math.min(2048, 1 << Math.round(Math.log2(2.3 * Math.sqrt(n)))));

/**
 * The layers, once the climate has run.
 * @param {Object} o  { tMesh (Generate's mesh as a terrain mesh: z-up, indexed), heightKm, frame, sim, seed, drainage
 *   (km², rain-weighted), receivers + order (the carve's), lava + young (0…255: the carve's lava cap, a rising range),
 *   cut (how deep the carve's rivers cut, × CUT_STEP_KM), koppen (per region), lc (layerClimate's), width }
 * @returns {{raster: Object, deposits: Object, shares: Object, ms: Object}}  raster: finishRaster's (geology, farming,
 *   climate pictures); deposits: the deposits' grid (geology/deposits.js)
 */
export function presentLayers({ tMesh, heightKm, frame, sim, seed, drainage, receivers = null, order = null, lava = null, young = null, cut = null, koppen, lc, width = 0 }, cfg = PRESENT) {
    const ms = {}, clock = () => performance.now();
    let t0 = clock();
    const n = heightKm.length, ocean = new Uint8Array(n), lat = new Float32Array(n), lon = new Float32Array(n), { xyz } = tMesh;
    for (let c = 0; c < n; c++) {
        ocean[c] = heightKm[c] > 0 ? 0 : 1;
        lat[c] = Math.asin(Math.max(-1, Math.min(1, xyz[3 * c + 2]))) * DEG; lon[c] = Math.atan2(xyz[3 * c + 1], xyz[3 * c]) * DEG;
    }
    // (each river's discharge from its drainage: the rocks' river plains, the deposits' placers, the farming's water)
    const q = drainage ? Float32Array.from(drainage, a => a * cfg.riverQPerKm2) : null;
    const grid = new LatLonGrid(0.25), on = { grid, lat, lon };
    const Rk = classifyRocks({ mesh: tMesh, z: heightKm, ocean, frame, simMesh: sim, seed, cfg: terrainConfig(), on, local: { q, lava, cut, cutStepKm: CUT_STEP_KM, column: true } });
    ms.rocks = clock() - t0; t0 = clock();
    const Dp = depositFields({ mesh: tMesh, z: heightKm, ocean, frame, simMesh: sim, seed, rock: Rk.rock, rec: Rk.rec, on,
        local: { q, recv: receivers, order, biome: lc.biome, clim: lc.clim, colS: Rk.colS, colT: Rk.colT, colArch: Rk.colArch } });
    ms.deposits = clock() - t0; t0 = clock();
    const farm = farmCells({ mesh: tMesh, z: heightKm, ocean, q, lat, lon, rock: Rk.rock, youngKind: Rk.youngKind, young, climate: lc.farm });
    const farming = { ...farm, rain: lc.farm.rain, warm: lc.farm.warm, pasture: lc.farm.pasture, crops: lc.farm.crops };
    ms.farming = clock() - t0; t0 = clock();
    const geology = { rock: Rk.rock, rec: Rk.rec, simCells: sim.numCells, deposits: Dp };
    const raster = finishRaster(tMesh, heightKm, ocean, width || layerRasterWidth(n), null, null, null,
        { koppen, tAnnual: lc.tAnnual, pAnnual: lc.pAnnual }, geology, farming);
    ms.raster = clock() - t0;
    return { raster, deposits: Dp, shares: { rocks: Rk.shares }, ms };
}
