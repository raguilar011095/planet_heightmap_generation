// The Finish step (plans/V2_FINISH_PLAN.md): one moment of a history sculpted with care, on request — the surface
// domain-warped and roughened where it is high and steep (F1), the climate calculated on it, the rivers carving it for
// longer with the climate's runoff, dry basins left closed, sediment laid down, hillslopes by climate (F2), an Earth-like
// last ice age (F3), and the wind's work (F4). Runs in finish-worker.js (or Node): the terrain pool builds the surface in
// slices, everything else runs here, on a mesh of any size — 10M cells included, which only this worker holds.

import { FINISH, COVER } from './finish-config.js';
import { LatLonGrid } from './finish-grid.js';
import { closedBasins } from './finish-basins.js';
import { depositSediment, creepByClimate, dissect } from './finish-sediment.js';
import { lastIceAge } from './finish-ice.js';
import { windWork } from './finish-wind.js';
import { detailDrivers } from './finish-drivers.js';
import { hydrology, openStraits, fillSeaBasins, Water } from './finish-hydro.js';
import { landCover, coverRgb, newCover, biasTowardClimate, coverRain, coverRainScale, newVariety, placeVariety, placeGround, fineMottle, terrainLook } from './finish-cover.js';
import { KOPPEN_ID } from '../climate/koppen.js';
import { terrainMesh } from '../terrain/terrain-mesh.js';
import { terrainConfig } from '../terrain/terrain-config.js';
import { carveLadder, carveSettings } from '../terrain/synthesize.js';
import { carveTerrain, forgetMesh, meanOnCoarser, prepareCarve } from '../terrain/carve.js';
import { forgetEdgeKm } from '../core/min-heap.js';
import { planetClimate } from '../climate/climate.js';
import { CORE_DEFAULTS, cellClimate } from '../climate/core.js';
import { pageClimate } from '../evolution/climate-fields.js';
import { cellStatsCollector, STAT_KEYS } from '../climate/cell-stats.js';
import { FastNoise } from '../core/fast-noise.js';
import { locate } from '../core/mesh-locate.js';
import { classifyRocks } from '../geology/rocks.js';
import { depositFields, climateTests, climateTestArrays, DEPOSITS, METALS } from '../geology/deposits.js';

const DEPOSIT_IDS = DEPOSITS.map(d => d.id);

const R = 6371;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** The finish's erosion at F.erosionStrength (finish-config.js erosionLevels, linear between the levels): the stream power's
 *  m, and its k as a multiple of the terrain's (a river draining F.erosionPivotKm2 cuts as fast as before); the dissection's
 *  deepest cut, the soil creep's reach (km) and the crests' hardness. */
export function erosionAt(F, cfg) {
    const L = F.erosionLevels, s = Math.min(L.carveM.length - 1, Math.max(0, F.erosionStrength ?? 0)), i = Math.min(L.carveM.length - 2, Math.floor(s)), f = s - i;
    const at = a => a[i] + (a[i + 1] - a[i]) * f, m = at(L.carveM);
    return { m, kMul: F.erosionPivotKm2 ** (cfg.carveM - m), dissectKm: at(L.dissectKm), creepKm: at(L.creepKm), crestHardness: at(L.crestHardness) };
}

/** The stages, in order, with their rough share of the time (for the progress bar). */
export const STAGES = [['mesh', 0.12], ['surface', 0.18], ['climate', 0.1], ['rivers', 0.2], ['sediment', 0.06], ['hillslopes', 0.05], ['ice age', 0.08], ['wind', 0.05], ['sea', 0.02], ['water', 0.05], ['detail', 0.02], ['final climate', 0.03], ['geology', 0.03], ['deposits', 0.04], ['picture', 0.09]];

/**
 * @param {{frame: Object, simMesh: Object, seed: number, cells: number, pool: import('../terrain/terrain-pool.js').TerrainPool,
 *          onStage?: (name: string) => void, F?: Object, cfg?: Object}} o
 * @returns {Promise<{mesh: Object, z: Float32Array, ocean: Uint8Array, ms: Object, stats: Object}>}
 */
export async function finishPlanet({ frame, simMesh, seed, cells, pool, closePool = false, onStage = () => {}, F = FINISH, cfg = terrainConfig(), debug = false, climateOptions = {}, driversWidth = cells >= 1.5e6 ? 2048 : 1024 }) {
    const ms = {}, stats = {};
    let t0 = performance.now();
    const lap = name => { const t = performance.now(); ms[name] = t - t0; t0 = t; };
    onStage('mesh');
    const mesh = terrainMesh(cells), n = mesh.numCells, cellKm2 = 4 * Math.PI * R * R / n;
    lap('mesh');

    // ── F1: the surface, domain-warped (its positions displaced before anything is read there), roughened where high ──
    onStage('surface');
    // (memory: at 10M cells every array is 40 MB or more — each let go as soon as it is done with, the warped positions
    // and the sampler with the surface, the carving's inputs and caches with the carve)
    let warped = { numCells: n, xyz: warpPositions(mesh, seed, F), edgeKm: mesh.edgeKm };
    // (the carving's inputs at the finish's erosion strength: its stream power's k, its crests' hardness)
    const E = erosionAt(F, cfg), fade = lam => smooth(cfg.minWavesPerCell, cfg.fullWavesPerCell, lam / mesh.edgeKm);
    const surfJob = pool.synthesize(frame, warped, { cfg: { ...cfg, carveK: cfg.carveK * E.kMul, carveCrestHardness: E.crestHardness }, seed, records: false, carveInputs: true, recCells: !!frame.coverKm });
    // (while the workers draw the surface, this thread builds ahead what needs only the mesh — the carving's ladder of
    // meshes, their distances and the maps between them and to the lake sites' coarser mesh, the rivers' meander: the same
    // values, ~2 s sooner at 2.5M. Up to PREP_CELLS: at 10M their memory waits for the carve, as before)
    await new Promise(r => setTimeout(r, 0));                         // (the pool hands its jobs out first)
    const ladder = carveLadder(simMesh, mesh, terrainMesh), broad = broadMesh(ladder, mesh, F);
    let meanderV = null;
    if (n <= PREP_CELLS) { prepareCarve(ladder, broad ? [[broad, mesh]] : []); meanderV = meanderValues(mesh, seed, F, fade); }
    let surf = await surfJob;
    if (closePool) pool.terminate();                                  // (its workers' memory back before the heavy stages)
    pool.forget?.(warped);
    let carveIn = surf.carveIn;
    // (for the geology: the world cell whose record each cell shows, as the surface read it, and the structure the
    // surface drew there — an old belt's bands, the far field's folds, a shield's grain: geology/rocks.js)
    const recCell = surf.recCell, cues = surf.cues;
    const z = surf.heightKm;
    surf = null; warped = null;
    roughen(mesh, z, seed, F, fade, carveIn.lip);
    lap('surface');

    // ── the climate, on this surface ──
    onStage('climate');
    // (climateOptions: the page's Greenhouse and Precipitation — greenhouseWm2, precipScale)
    let res = planetClimate({ xyz: mesh.xyz, elevKm: z, axes: 'z-up' }, climateOptions);
    const { koppen, tAnnual: tAnn, pAnnual: pAnn, lat, lon } = res.cell, G = res.grid.size;
    for (let c = 0; c < n; c++) if (pAnn[c] > F.rainMaxMm) pAnn[c] = F.rainMaxMm;     // (the climate's rare wet hotspots)
    // (the warmest month at sea level, and the winds, on the climate's grid)
    const gamma = CORE_DEFAULTS.lapseRateCPerKm, warmG = new Float32Array(G).fill(-Infinity);
    for (let g = 0; g < G; g++) {
        const href = res.surface.meanLandKm[g] === res.surface.meanLandKm[g] ? Math.max(0, res.surface.meanLandKm[g]) : 0;
        for (let m = 0; m < 12; m++) { const t = res.months.T[m * G + g] + gamma * href; if (t > warmG[g]) warmG[g] = t; }
    }
    const circ = res.stages.circulation, year = (a, m = -1) => { const o = new Float32Array(G); for (let g = 0; g < G; g++) { if (m >= 0) o[g] = a[m * G + g]; else { let s = 0; for (let k = 0; k < 12; k++) s += a[k * G + g]; o[g] = s / 12; } } return o; };
    const wind = { year: [year(circ.u), year(circ.v)], jan: [year(circ.u, 0), year(circ.v, 0)], jul: [year(circ.u, 6), year(circ.v, 6)] };
    const climGrid = { w: res.grid.w, h: res.grid.h }, warmSl = new Float32Array(n);
    for (let c = 0; c < n; c++) warmSl[c] = bilinear(climGrid, warmG, lat[c], lon[c]);
    // (the months each place's rain passes a share of its evaporation, or it freezes — the rivers' seasons)
    const wetG = new Float32Array(G), wetMonths = new Float32Array(n);
    for (let g = 0; g < G; g++) {
        let k = 0;
        for (let m = 0; m < 12; m++) { const T = res.months.T[m * G + g], P = res.months.P[m * G + g], E = Math.max(5, (F.petBaseMm + F.petPerC * T) / 12); if (T < 0 || P > F.wetShare * E) k++; }
        wetG[g] = k;
    }
    for (let c = 0; c < n; c++) wetMonths[c] = bilinear(climGrid, wetG, lat[c], lon[c]);
    // (the climate classifies only land above the sea; ground below sea level the ocean does not reach — a sunk basin, a
    // Caspian — takes the grid's year: its rain, and its temperature at sea level)
    const pG = new Float32Array(G), tG = new Float32Array(G);
    for (let g = 0; g < G; g++) {
        const href = res.surface.meanLandKm[g] === res.surface.meanLandKm[g] ? Math.max(0, res.surface.meanLandKm[g]) : 0;
        let p = 0, t = 0;
        for (let m = 0; m < 12; m++) { p += res.months.P[m * G + g]; t += res.months.T[m * G + g] / 12; }
        pG[g] = p; tG[g] = t + gamma * href;
    }
    for (let c = 0; c < n; c++) if (!(pAnn[c] === pAnn[c])) { pAnn[c] = bilinear(climGrid, pG, lat[c], lon[c]); tAnn[c] = bilinear(climGrid, tG, lat[c], lon[c]) - gamma * Math.max(0, z[c]); }
    // (each place's runoff shared over the months — rain, snow kept until it melts, less a share of each month's
    // evaporation; a share, where it is humid, through the ground, which drains back slowly — and each month's dryness)
    const monthly = runoffMonths(res.months, G, F);
    // (kept for the finished moment's own climate, at the end: the page's grid fields, and the grid's climate to finish
    // each cell again on the finished surface)
    const pageC = pageClimate(res, { cells: false }), gridClimate = { grid: res.grid, surface: res.surface, months: res.months, cell: { lat, lon } };
    res = null;                                                       // (the rest of the climate's arrays go)
    lap('climate');

    // ── the rivers: runoff (rain less evaporation) weights the drainage; dry basins stay closed; carved for longer ──
    onStage('rivers');
    const runoff = new Float32Array(n), pet = new Float32Array(n);
    let oldW = 0, sumR = 0, sumP = 0, landN = 0;
    for (let c = 0; c < n; c++) {
        if (!(pAnn[c] === pAnn[c])) continue;
        const P = Math.max(0, pAnn[c]), E0 = Math.max(F.petMinMm, F.petBaseMm + F.petPerC * tAnn[c]);
        pet[c] = E0;
        runoff[c] = P > 0 ? Math.max(0, P - P * (1 + E0 / P - (1 + (E0 / P) ** F.budykoW) ** (1 / F.budykoW))) : 0;
        if (z[c] > 0) { oldW += carveIn.rain[c]; sumR += runoff[c]; sumP += P; landN++; }
    }
    const meanR = landN ? sumR / landN : 1, meanP = landN ? sumP / landN : 1, meanW = landN ? oldW / landN : 1;
    for (let c = 0; c < n; c++) if (z[c] > 0 && pAnn[c] === pAnn[c])
        carveIn.rain[c] = meanW * Math.min(F.wetMax, Math.max(F.runoffFloor, (1 - F.rainShare) * runoff[c] / meanR + F.rainShare * Math.max(0, pAnn[c]) / meanP) ** F.wetPower);
    if (meanderV) { const micro = carveIn.micro; for (let c = 0; c < n; c++) micro[c] += F.meanderKm * meanderV[c]; }
    else meander(mesh, carveIn.micro, seed, F, fade);
    // (the tectonic surface's own hollows, where lakes may stand, read on the carving's mesh nearest tectonicHollowMeshKm
    // across: a range's troughs and a lowland's hummocks averaged away there — finish-basins.js)
    const coarse = broad ? meanOnCoarser(broad, mesh, z) : null;
    const B = closedBasins(mesh, z, runoff, pet, pAnn, cellKm2, F, coarse && { mesh: broad, z: coarse.values, nearest: coarse.nearest });
    stats.closedBasins = B.basins;
    const before = z.slice();
    // (how cold each coast is — its warmest month at sea level: fjords where it is cold, rias where not; carve.js drownValleys)
    const [warmC, coldC] = cfg.drownColdC ?? [19, 13];
    carveIn.fjord = new Float32Array(n);
    for (let c = 0; c < n; c++) carveIn.fjord[c] = smooth(warmC, coldC, warmSl[c]);
    // (the finish's own: on a rising belt's wet, steep front its rivers are held back less — from the timeline's hold to
    // F.activeHold as the drainage's water goes from the mean to twice it, and the ground from gentle to steep: the
    // rain-fed front cuts as deep as the Himalayan front's, while a plateau — flat, and mostly dry — keeps its rivers high
    // and its top whole; and a valley wider than its cell carried into the cells beside it)
    const hold = carveIn.hold.slice(), wetHold = (F.activeHold ?? cfg.carveActiveHold) / cfg.carveActiveHold, { adjOffset: aO, adjList: aL } = mesh;
    for (let c = 0; c < n; c++) {
        if (!(hold[c] > 0)) continue;
        let s = 0;
        for (let k = aO[c]; k < aO[c + 1]; k++) s += Math.abs(z[aL[k]] - z[c]);
        const steep = smooth(F.frontSlope[0], F.frontSlope[1], s / (aO[c + 1] - aO[c]) / mesh.edgeKm);
        hold[c] *= 1 - (1 - wetHold) * smooth(meanW, 2 * meanW, carveIn.rain[c]) * steep;
    }
    const settings = carveSettings({ ...cfg, carveM: E.m, carveTimeMyr: F.carveTimeMyr, carveRounds: F.carveRounds, carveValleySides: F.valleySides ?? 0 });
    const C = carveTerrain(ladder, { ...carveIn, hold, z, sink: B.sink, base: B.base }, settings);
    // (where flood basalt still caps the ground after the carving — its pile not cut through — for the satellite view)
    const basalt = new Uint8Array(n);
    for (let c = 0; c < n; c++) if (carveIn.lip[c] > 0) basalt[c] = Math.round(255 * carveIn.lip[c] * smooth(0, 0.05, C.z[c] - carveIn.lipBase[c]));
    // (and how young the mountains are: the belt's activity, 1 while the history still raises it — the satellite view's tone)
    const young = new Uint8Array(n);
    for (let c = 0; c < n; c++) young[c] = Math.round(255 * Math.max(0, Math.min(1, carveIn.hold[c])));
    carveIn = null;
    forgetMesh(mesh); forgetEdgeKm(mesh);                             // (the carve's caches for this mesh: ~0.5 GB at 10M)
    dissect(mesh, C.z, C, cellKm2, { ...F, dissectKm: E.dissectKm });
    lap('rivers');

    // ── F2: sediment, then hillslopes by climate ──
    onStage('sediment');
    // (for the geology: how deep the rivers cut here — the carving and its dissection, from the surface before — and how
    // much sediment they lay; a byte each: 20 m, and 2 m, steps)
    const geo = frame.coverKm ? { cut: new Uint8Array(n), cutStepKm: 0.02, alluv: new Uint8Array(n), alluvStepKm: 0.002 } : null;
    if (geo) for (let c = 0; c < n; c++) geo.cut[c] = Math.min(255, Math.max(0, Math.round((before[c] - C.z[c]) / geo.cutStepKm)));
    let zPre = geo ? C.z.slice() : null;
    stats.deltas = depositSediment(mesh, before, C, B.sink, cellKm2, F).deltas;
    if (geo) for (let c = 0; c < n; c++) geo.alluv[c] = Math.min(255, Math.max(0, Math.round((C.z[c] - zPre[c]) / geo.alluvStepKm)));
    zPre = null;
    lap('sediment');
    onStage('hillslopes');
    creepByClimate(mesh, C.z, pAnn, tAnn, { ...F, creepKm: E.creepKm }, C.area, basalt);
    lap('hillslopes');

    // ── F3: the last ice age ──
    onStage('ice age');
    const grid = new LatLonGrid(0.25);
    const I = lastIceAge({ mesh, z: C.z, lat, lon, warmSl, rain: pAnn, grid, cellKm2, seed }, F);
    forgetEdgeKm(mesh);
    stats.iceKm2 = I.iceKm2; stats.iceSheets = I.sheets;
    lap('ice age');

    // ── F4: the wind ──
    onStage('wind');
    const W = windWork({ mesh, z: C.z, lat, lon, koppen, grid, wind, climGrid, outwash: I.margin, seed, fade, debug }, F);
    stats.ergKm2 = W.ergKm2; stats.loessKm2 = W.loessKm2;
    lap('wind');

    // ── the sea: water below sea level that the open ocean reaches (fjords, sunk basins); hollows it cannot reach stay land ──
    onStage('sea');
    let ocean = oceanMask(mesh, C.z);
    // (an inland sea the ocean all but reaches — behind a low, short barrier — is opened into it; one left closed is a
    // remnant of the sea in a basin, for the hydrology: finish-hydro.js)
    const straits = openStraits(mesh, C.z, ocean, F);
    stats.straits = straits;
    if (straits.opened) ocean = oceanMask(mesh, C.z);
    const seaBasin = fillSeaBasins(mesh, C.z, ocean, F);
    forgetMesh(mesh); forgetEdgeKm(mesh);                             // (the carve's and the distances' caches for this mesh)
    lap('sea');

    // ── R1: rivers and lakes, by the climate ──
    onStage('water');
    const ice = new Uint8Array(n);
    for (let c = 0; c < n; c++) if (koppen[c] === KOPPEN_ID.EF) ice[c] = 1;
    const bi = new Int32Array(4), bw = new Float64Array(4), at = (f, c) => f[bi[0]] * bw[0] + f[bi[1]] * bw[1] + f[bi[2]] * bw[2] + f[bi[3]] * bw[3];
    const months = { at: (c, m0, M, share, arid) => { corners(climGrid, lat[c], lon[c], bi, bw); for (let j = 0; j < M; j++) { share[j] = at(monthly.share[m0 + j], c); arid[j] = at(monthly.arid[m0 + j], c); } } };
    // (across a flat, the rivers wander as the carving's did: the same meander, read where the water needs it)
    const wander = meanderV ? c => meanderV[c] : meanderAt(mesh, seed, F, fade);
    const Hy = hydrology({ mesh, z: C.z, ocean, runoff, pet, rain: pAnn, wetMonths, ice, glaciated: I.ice, tectonic: B.tectonic, seaBasin, fillHollows: true, lat, lon, months, wander, debug }, F);
    Object.assign(stats, { water: Hy.stats });
    // (the sea again, after the rivers' gorges)
    ocean = oceanMask(mesh, C.z);
    lap('water');

    // ── what the detail finer than the mesh is drawn from (finish-drivers.js; plans/V2_FINE_DETAIL_PLAN.md) ──
    onStage('detail');
    const drivers = detailDrivers({ mesh, z: C.z, ice: I.ice, iceH: I.H, iceS: I.S, erg: W.erg, wind, climGrid, warmSl, rain: pAnn, young, frame, simMesh, cfg, seed, width: driversWidth });
    lap('detail');

    // ── the finished moment's climate, at its detail: the grid's climate as calculated above, each cell's own (its
    // height, its relief, and sunk basins the sea does not reach as land) on the finished surface ──
    // And the land's cover from each cell's twelve months (finish-cover.js; plans/V2_SATELLITE_PLAN.md): its colour as from
    // space for the year, January and July (sRGB, 3 bytes each), and its biome (bits 0–4) with snow in January (bit 5) and
    // in July (bit 6), for the readout.
    onStage('final climate');
    const land = new Uint8Array(n);
    for (let c = 0; c < n; c++) land[c] = ocean[c] ? 0 : 1;
    const sat = [new Uint8Array(3 * n), new Uint8Array(3 * n), new Uint8Array(3 * n)], cover = new Uint8Array(n), cv = newCover();
    // (and the riverside's colour: the cover again, well watered — where it is dry enough to differ; else the cover's own)
    const ripSat = [new Uint8Array(3 * n), new Uint8Array(3 * n), new Uint8Array(3 * n)], cvWet = newCover(), PW = new Float64Array(12);
    // (the rain the cover reads: a little smoother, warped and roughened — from the climate stage's rain, its regional
    // pattern being all that is read)
    const rainTarget = coverRain(pAnn, lat, lon, c => land[c] === 1, new LatLonGrid(0.5), seed), P12c = new Float64Array(12);
    // (and its variety: tints between a few natural colours, by noise — its own stream)
    const varyNoise = new FastNoise(((seed | 0) * 0x51f3 + 0x3a9) >>> 0), vy = newVariety(), xyz = mesh.xyz;
    // (and its temperatures at its own full height — the climate takes only part of a place's height above its
    // surroundings: tree and snow lines follow all of it — its surroundings' height as the climate has it, the 1° grid's
    // mean land height)
    const relief = COVER.fullLapse ? (1 - CORE_DEFAULTS.terrainRelief) * gamma : 0, hLand = gridClimate.surface.meanLandKm, T12c = new Float64Array(12);
    // (and its measures beyond Köppen — cell-stats.js, one byte each — from the climate's own twelve months)
    const cellStats = cellStatsCollector(n, c => lat[c] * Math.PI / 180, { bytes: true });
    // (and the deposits' climate tests: bauxite, laterites, salt, peat, enriched copper — geology/deposits.js)
    const clim = geo ? climateTestArrays(n) : null;
    const cellsClimate = cellClimate(gridClimate, mesh.xyz, C.z, land, {}, (c, T12, P12) => {
        cellStats.add(c, T12, P12);
        let T = T12;
        if (relief) {
            corners(climGrid, lat[c], lon[c], bi, bw);
            let s = 0, k = 0;
            for (let j = 0; j < 4; j++) { const v = hLand[bi[j]]; if (v === v) { s += bw[j] * Math.max(0, v); k += bw[j]; } }
            const dT = k > 0 ? relief * (Math.max(0, C.z[c]) - s / k) : 0;
            for (let m = 0; m < 12; m++) T12c[m] = T12[m] - dT;
            T = T12c;
        }
        if (clim) climateTests(T, P12, c, clim);
        landCover(T, coverRainScale(P12, rainTarget[c], P12c), cv, F, COVER, lat[c]);
        placeVariety(xyz[3 * c], xyz[3 * c + 1], xyz[3 * c + 2], varyNoise, vy);
        placeGround(vy, W.erg[c], W.loess[c] / F.loessKm, basalt[c] / 255);
        for (let v = 0; v < 3; v++) coverRgb(cv, v, sat[v], 3 * c, undefined, vy);
        if (cv.wetness < COVER.ripWetness) {
            const k = COVER.ripWetness / Math.max(0.02, cv.wetness);
            for (let m = 0; m < 12; m++) PW[m] = P12c[m] * k;
            landCover(T, PW, cvWet, F, COVER, lat[c]);
            for (let v = 0; v < 3; v++) coverRgb(cvWet, v, ripSat[v], 3 * c, undefined, vy);
        } else for (let v = 0; v < 3; v++) { const S = sat[v], D = ripSat[v], o = 3 * c; D[o] = S[o]; D[o + 1] = S[o + 1]; D[o + 2] = S[o + 2]; }
        cover[c] = cv.biome | (cv.snow[1] >= 0.5 ? 32 : 0) | (cv.snow[2] >= 0.5 ? 64 : 0);
    });
    // (and toward each climate's own colours, regionally — on a coarser grid: the correction is smooth, ~100 km)
    biasTowardClimate(sat, cellsClimate.koppen, lat, lon, c => land[c] === 1 && cellsClimate.koppen[c] > 0, new LatLonGrid(0.5), seed);
    lap('final climate');

    // ── the geology (plans/V2_GEOLOGY_PLAN.md G2): what each place is made of at the surface — the history's rock column
    // (the frame's geological record), read where the terrain read it, with the cuts and the young sediment of this
    // surface (geology/rocks.js) ──
    let geology = null;
    if (geo) {
        onStage('geology');
        const G = classifyRocks({ mesh, z: C.z, ocean, frame, simMesh, seed, cfg, recCell, on: { grid, lat, lon },
            local: { ...geo, erg: W.erg, loess: W.loess, loessShare: 1 / F.loessKm, till: I.till, glaciated: I.ice, lava: basalt, q: Hy.q, cues } });
        geology = { rock: G.rock, rec: G.rec, simCells: simMesh.numCells, cues };          // (cues: for the checks; not in the picture)
        stats.rocks = Array.from(G.shares, v => +v.toFixed(4)); stats.youngBy = Array.from(G.youngBy, v => +v.toFixed(4));
        forgetEdgeKm(mesh);                                           // (the river plains' distances: their cache for this mesh)
        lap('geology');
        // the deposits (G3, G4): the history's mineral systems where they survive, the climate's and the rivers' — on a grid
        onStage('deposits');
        const Dp = depositFields({ mesh, z: C.z, ocean, frame, simMesh, seed, rock: G.rock, rec: G.rec, on: { grid, lat, lon },
            local: { glaciated: I.ice, till: I.till, lake: Hy.lake, q: Hy.q, recv: Hy.recv, order: Hy.order, biome: cover, clim, ice } });
        geology.deposits = Dp;
        stats.deposits = Object.fromEntries(DEPOSIT_IDS.map((id, k) => [id, [+Dp.shares[3 * k].toFixed(4), +Dp.shares[3 * k + 1].toFixed(4), +Dp.shares[3 * k + 2].toFixed(4)]]));
        stats.metals = Object.fromEntries(METALS.map((m, i) => [m.id, [+Dp.metalShares[3 * i].toFixed(4), +Dp.metalShares[3 * i + 1].toFixed(4), +Dp.metalShares[3 * i + 2].toFixed(4)]]));
        lap('deposits');
    }
    const flow = new Float32Array(n);
    for (let c = 0; c < n; c++) flow[c] = Math.log10(Math.max(1, Hy.area[c]));
    return { mesh, z: C.z, ocean, lake: Hy.lake, lakeLevel: Hy.lakeLevel, rivers: Hy.rivers, drivers, ms, stats, geology,
        climate: { page: pageC, cell: { koppen: cellsClimate.koppen, tAnnual: cellsClimate.tAnnual, pAnnual: cellsClimate.pAnnual, sat, cover, stats: cellStats.stats, mottleSeed: ((seed | 0) * 0x2f71 + 0x6d) >>> 0,
            flow, young, rivers: Hy.rivers, ripSat } },
        layers: debug ? { ice: I.ice, sink: B.sink, erg: W.erg, loess: W.loess, basalt, koppen, before, rain: pAnn, lat, lon, q: Hy.q, terminal: Hy.terminal } : null };
}

/** The mesh's positions displaced by a smooth noise field (km-sized waves, three octaves): a domain warp of everything read there. */
function warpPositions(mesh, seed, F) {
    const { xyz, numCells: n } = mesh, out = new Float32Array(3 * n), noise = new FastNoise((seed | 0) * 53 + 11), f = R / F.warpScaleKm, a = F.warpKm / R;
    for (let c = 0; c < n; c++) {
        const x = xyz[3 * c], y = xyz[3 * c + 1], w = xyz[3 * c + 2];
        const dx = noise.fbm(x * f + 1.3, y * f + 7.1, w * f + 4.2, 3, 0.5), dy = noise.fbm(x * f + 9.4, y * f + 2.6, w * f + 6.8, 3, 0.5), dz = noise.fbm(x * f + 5.7, y * f + 8.3, w * f + 0.9, 3, 0.5);
        let px = x + 1.6 * a * dx, py = y + 1.6 * a * dy, pz = w + 1.6 * a * dz;
        const l = Math.hypot(px, py, pz); px /= l; py /= l; pz /= l;
        out[3 * c] = px; out[3 * c + 1] = py; out[3 * c + 2] = pz;
    }
    return out;
}

/** The rivers' fine routing relief (added to the carve's micro-relief, which shapes the routing only): octaves from
 *  F.meanderFromKm down to what the mesh can show — channels wander instead of running straight down smooth slopes. */
/** The finish builds ahead, while its surface is drawn, only up to this many cells (memory: see finishPlanet). */
const PREP_CELLS = 3e6;

/** The carving's mesh nearest F.tectonicHollowMeshKm across, where the lake sites are read — null for the finished mesh itself. */
function broadMesh(ladder, mesh, F) {
    if (!(F.tectonicHollowMeshKm > 0)) return null;
    let bm = ladder[0];
    for (const m of ladder) if (Math.abs(Math.log(m.edgeKm / F.tectonicHollowMeshKm)) < Math.abs(Math.log(bm.edgeKm / F.tectonicHollowMeshKm))) bm = m;
    return bm === mesh ? null : bm;
}

/** The rivers' meander at every cell (meanderAt's values, kept exactly), or null if the mesh shows none. */
function meanderValues(mesh, seed, F, fade) {
    const at = meanderAt(mesh, seed, F, fade);
    if (!at) return null;
    const v = new Float64Array(mesh.numCells);
    for (let c = 0; c < v.length; c++) v[c] = at(c);
    return v;
}

function meander(mesh, micro, seed, F, fade) {
    const at = meanderAt(mesh, seed, F, fade);
    if (!at) return;
    for (let c = 0; c < mesh.numCells; c++) micro[c] += F.meanderKm * at(c);
}

/** The rivers' wander at cell c (about −1 … 1): its octaves from F.meanderFromKm down to what the mesh shows; null if none. */
function meanderAt(mesh, seed, F, fade) {
    const { xyz } = mesh, noise = new FastNoise((seed | 0) * 37 + 29), oct = [];
    for (let lam = F.meanderFromKm, a = 1; lam > 1 && oct.length < 5; lam /= 2, a *= 0.6) { const s = a * fade(lam); if (s > 0.02) oct.push([R / lam, s]); }
    if (!oct.length) return null;
    return c => {
        let v = 0;
        for (let o = 0; o < oct.length; o++) { const [f, s] = oct[o]; v += s * noise.noise3D(xyz[3 * c] * f + 7.7 * o, xyz[3 * c + 1] * f + 2.2, xyz[3 * c + 2] * f + 4.4 * o); }
        return v;
    };
}

/** Fine relief on high ground (craggier the higher), octaves from F.craggyFromKm down to what the mesh can show — none on
 *  the lava of a flood basalt (`lava`: its share per cell), whose flows lie flat (developer, 2026-10-27). */
function roughen(mesh, z, seed, F, fade, lava = null) {
    const { xyz, numCells: n } = mesh, noise = new FastNoise((seed | 0) * 71 + 3), oct = [];
    for (let lam = F.craggyFromKm, a = 1; lam > 1 && oct.length < 5; lam /= 2, a *= 0.55) { const s = a * fade(lam); if (s > 0.02) oct.push([R / lam, s]); }
    if (!oct.length) return;
    for (let c = 0; c < n; c++) {
        if (!(z[c] > 0.3)) continue;
        let v = 0;
        for (let o = 0; o < oct.length; o++) { const [f, s] = oct[o]; v += s * noise.noise3D(xyz[3 * c] * f + 3.3 * o, xyz[3 * c + 1] * f + 1.7, xyz[3 * c + 2] * f + 5.9 * o); }
        z[c] += F.craggyKm * smooth(0.3, 3, z[c]) * v * (lava ? 1 - Math.min(1, lava[c]) : 1);
    }
}

/** Per month (12 fields each, on the climate grid): the share of a year's runoff that comes in that month, and how dry the
 *  month is (0 where rain meets its potential evaporation, or the ground is frozen; 1 without rain). Each month's water —
 *  rain, and snow kept until it melts — less a share of its potential evaporation; a share of that (more where it is
 *  humid) seeps into the ground, which drains back into the rivers slowly (baseflowMonths: a dry season's flow dwindles
 *  month by month). Three years, from dry ground: the store and the snow settle to their yearly round. */
function runoffMonths(months, G, F) {
    const out = Array.from({ length: 12 }, () => new Float32Array(G)), arid = Array.from({ length: 12 }, () => new Float32Array(G));
    const liquid = new Float64Array(12), flow = new Float64Array(12);
    const drain = 1 - Math.exp(-1 / F.baseflowMonths);
    for (let g = 0; g < G; g++) {
        let Pyr = 0, Eyr = 0;
        for (let m = 0; m < 12; m++) { const T = months.T[m * G + g]; Pyr += Math.max(0, months.P[m * G + g]); Eyr += Math.max(5, (F.petBaseMm + F.petPerC * T) / 12); }
        const base = F.baseflowShare * smooth(0.2, 1, Pyr / Eyr);
        let snow = 0, store = 0, sf = 0, sl = 0;
        for (let cyc = 0; cyc < 3; cyc++) for (let m = 0; m < 12; m++) {
            const T = months.T[m * G + g], P = Math.max(0, months.P[m * G + g]), E = Math.max(5, (F.petBaseMm + F.petPerC * T) / 12);
            let liq;
            if (T < 0) { snow += P; liq = 0; } else { const melt = Math.min(snow, F.snowMeltMmPerC * T); snow -= melt; liq = P + melt; }
            const quick = Math.max(0, liq - F.monthEvapShare * E), d = store * drain;
            store += base * quick - d;
            if (cyc === 2) { flow[m] = (1 - base) * quick + d; liquid[m] = liq; sf += flow[m]; sl += liq; }
        }
        for (let m = 0; m < 12; m++) {
            out[m][g] = sf > 0 ? flow[m] / sf : sl > 0 ? liquid[m] / sl : 1 / 12;
            const T = months.T[m * G + g], E = Math.max(5, (F.petBaseMm + F.petPerC * T) / 12);
            arid[m][g] = T < 0 ? 0 : smooth(0, 1, (E - Math.max(0, months.P[m * G + g])) / E);
        }
    }
    return { share: out, arid };
}

/** The four grid points around (lat, lon) and their bilinear weights (as bilinear). */
function corners(g, lat, lon, bi, bw) {
    const { w, h } = g, step = 180 / h;
    const x = (lon + 180) / step - 0.5, y = Math.max(0, Math.min(h - 1, (90 - lat) / step - 0.5));
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const i0 = ((x0 % w) + w) % w, i1 = i0 + 1 === w ? 0 : i0 + 1, j1 = y0 + 1 < h ? y0 + 1 : y0;
    bi[0] = y0 * w + i0; bi[1] = y0 * w + i1; bi[2] = j1 * w + i0; bi[3] = j1 * w + i1;
    bw[0] = (1 - fx) * (1 - fy); bw[1] = fx * (1 - fy); bw[2] = (1 - fx) * fy; bw[3] = fx * fy;
}

function bilinear(g, field, lat, lon) {
    const { w, h } = g, step = 180 / h;
    const x = (lon + 180) / step - 0.5, y = Math.max(0, Math.min(h - 1, (90 - lat) / step - 0.5));
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const i0 = ((x0 % w) + w) % w, i1 = i0 + 1 === w ? 0 : i0 + 1, j1 = y0 + 1 < h ? y0 + 1 : y0;
    return (1 - fx) * (1 - fy) * field[y0 * w + i0] + fx * (1 - fy) * field[y0 * w + i1] + (1 - fx) * fy * field[j1 * w + i0] + fx * fy * field[j1 * w + i1];
}

/** 1 where the open ocean reaches (from the deep sea, through ground below sea level). */
export function oceanMask(mesh, z, seaSeedKm2 = FINISH.seaSeedKm2, deepKm = FINISH.seaDeepKm) {
    // (sea: a body below sea level that holds deep water and is big enough — a small pit on a continent is a basin, not a
    // sea: developer, "tiny bits of 'sea' surrounded by continent … where rivers end … should NOT be a valid end"; then,
    // "lets reduce what we consider a valid end sea": the size is the whole body's, not only its deep water's)
    const { adjOffset, adjList, numCells: n } = mesh, ocean = new Uint8Array(n), seen = new Uint8Array(n), cellKm2 = 4 * Math.PI * R * R / n;
    for (let s = 0; s < n; s++) {
        if (!(z[s] < 0) || seen[s]) continue;
        const cells = [s];
        seen[s] = 1;
        let deep = z[s] < -deepKm;
        for (let i = 0; i < cells.length; i++) for (let k = adjOffset[cells[i]]; k < adjOffset[cells[i] + 1]; k++) {
            const nb = adjList[k];
            if (z[nb] < 0 && !seen[nb]) { seen[nb] = 1; cells.push(nb); if (z[nb] < -deepKm) deep = true; }
        }
        if (deep && cells.length * cellKm2 >= seaSeedKm2) for (const c of cells) ocean[c] = 1;
    }
    return ocean;
}

/**
 * The finished planet as an equirectangular picture of heights: w × w/2 pixels (rows north → south, columns from −180°
 * east), 16-bit metres, and the ocean (1) — for the page to paint and shade, and to export. Heights blended over the
 * mesh triangle under each pixel; `onRow` reports progress.
 */
export function finishRaster(mesh, z, ocean, w, onRow = null, lake = null, lakeLevel = null, climate = null, geology = null) {
    const h = w >> 1, heightM = new Int16Array(w * h), sea = new Uint8Array(w * h), water = new Uint8Array(w * h), c3 = [0, 0, 0], w3 = [0, 0, 0];
    // (the climate's picture: at most as wide as the page's sharpest texture — every f-th pixel of the heights' — the
    // land's Köppen class (its weightiest land cell's), °C × 100 and mm a year (its land cells' weighted mean); the sea
    // −32768 °C, 0 mm. With the land's cover: its colours from space (the year, January, July: its land cells' weighted
    // mean) and its biome and snow (the weightiest's))
    const cw = climate ? Math.min(w, CLIMATE_WIDTH_MAX) : 0, ch = cw >> 1, f = cw ? w / cw : 0;
    const kop = cw ? new Uint8Array(cw * ch) : null, tA = cw ? new Int16Array(cw * ch).fill(-32768) : null, pA = cw ? new Uint16Array(cw * ch) : null;
    const sat = cw && climate.sat ? climate.sat.map(() => new Uint8Array(3 * cw * ch)) : null, cov = sat ? new Uint8Array(cw * ch) : null, s3 = [0, 0, 0];
    const mottle = sat ? new FastNoise(climate.mottleSeed ?? 0) : null, flowPx = sat && climate.flow ? new Float32Array(cw * ch) : null;
    const youngPx = sat && climate.young ? new Uint8Array(cw * ch) : null;
    const ripPx = sat && climate.ripSat ? climate.ripSat.map(() => new Uint8Array(3 * cw * ch)) : null;
    // (and the land's measures beyond Köppen, cell-stats.js bytes — the weightiest land cell's)
    const statPx = cw && climate.stats ? Object.fromEntries(STAT_KEYS.map(k => [k, new Uint8Array(cw * ch)])) : null;
    // (and the geology's rocks, on the climate's picture — its weightiest land cell's, as the Köppen class — and the
    // history's record cell each shows, for the Geology tab's other views)
    const rockPx = cw && geology?.rock ? new Uint8Array(cw * ch) : null, recPx = rockPx && geology.rec ? new (geology.simCells < 65536 ? Uint16Array : Int32Array)(cw * ch) : null, dither = rockPx ? new FastNoise(0x6e0c) : null, ditherF = R / (1.5 * (mesh.edgeKm ?? 30));
    // (each column's longitude's cosine and sine, once)
    const cosLon = new Float64Array(w), sinLon = new Float64Array(w);
    for (let px = 0; px < w; px++) { const lon = ((px + 0.5) / w - 0.5) * 2 * Math.PI; cosLon[px] = Math.cos(lon); sinLon[px] = Math.sin(lon); }
    for (let py = 0; py < h; py++) {
        const lat = (0.5 - (py + 0.5) / h) * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
        for (let px = 0; px < w; px++) {
            locate(mesh, cl * cosLon[px], cl * sinLon[px], sl, c3, w3);
            const i = py * w + px, v = w3[0] * z[c3[0]] + w3[1] * z[c3[1]] + w3[2] * z[c3[2]];
            heightM[i] = Math.max(-32000, Math.min(32000, Math.round(v * 1000)));
            const near = w3[0] >= w3[1] && w3[0] >= w3[2] ? c3[0] : w3[1] >= w3[2] ? c3[1] : c3[2];
            sea[i] = ocean[near];
            // (a lake: under its level, where one of the pixel's cells is lake — its shore as crisp as the heights)
            if (lake) for (let j = 0; j < 3; j++) { const c = c3[j]; if (lake[c] && w3[j] > 0.2 && v < lakeLevel[c]) { water[i] = lake[c]; break; } }
            if (cw && !sea[i] && px % f === 0 && py % f === 0) {
                let ws = 0, t = 0, p = 0, best = -1, bw = 0;
                for (let j = 0; j < 3; j++) {
                    const c = c3[j];
                    if (ocean[c] || !(climate.tAnnual[c] === climate.tAnnual[c])) continue;
                    ws += w3[j]; t += w3[j] * climate.tAnnual[c]; p += w3[j] * climate.pAnnual[c];
                    if (w3[j] > bw) { bw = w3[j]; best = c; }
                }
                if (best >= 0) {
                    const k = (py / f) * cw + px / f;
                    kop[k] = climate.koppen[best]; tA[k] = Math.round(100 * t / ws); pA[k] = Math.min(65535, Math.round(p / ws));
                    if (statPx) for (const key of STAT_KEYS) statPx[key][k] = climate.stats[key][best];
                    if (rockPx) {
                        // (the rock: where the pixel's cells differ, the one with the largest share scaled by a noise of
                        // its own about a cell across — contacts ragged within a cell, never the mesh's straight edges)
                        let pick = best, pv = -1;
                        const r0 = geology.rock[best];
                        for (let j = 0; j < 3; j++) {
                            const c = c3[j];
                            if (ocean[c] || !(climate.tAnnual[c] === climate.tAnnual[c]) || geology.rock[c] === r0) continue;
                            pick = -1;
                            break;
                        }
                        if (pick < 0) for (let j = 0; j < 3; j++) {
                            const c = c3[j];
                            if (ocean[c] || !(climate.tAnnual[c] === climate.tAnnual[c])) continue;
                            const x = cl * cosLon[px] * ditherF + (c % 101) * 1.37, y = cl * sinLon[px] * ditherF + (c % 89) * 2.11, zz = sl * ditherF + (c % 83) * 0.73;
                            const v = w3[j] * Math.exp(1.6 * dither.noise3D(x, y, zz));
                            if (v > pv) { pv = v; pick = c; }
                        }
                        rockPx[k] = geology.rock[pick];
                        if (recPx) recPx[k] = geology.rec[pick];
                    }
                    if (sat) {
                        // (a fine mottling of the brightness, per pixel — the same in every view)
                        const mf = fineMottle(cl * cosLon[px], cl * sinLon[px], sl, mottle);
                        for (let v = 0; v < 3; v++) {
                            const S = climate.sat[v];
                            s3[0] = s3[1] = s3[2] = 0;
                            for (let j = 0; j < 3; j++) {
                                const c = c3[j];
                                if (ocean[c] || !(climate.tAnnual[c] === climate.tAnnual[c])) continue;
                                s3[0] += w3[j] * S[3 * c]; s3[1] += w3[j] * S[3 * c + 1]; s3[2] += w3[j] * S[3 * c + 2];
                            }
                            const o = 3 * k, D = sat[v];
                            D[o] = Math.min(255, Math.round(mf * s3[0] / ws)); D[o + 1] = Math.min(255, Math.round(mf * s3[1] / ws)); D[o + 2] = Math.min(255, Math.round(mf * s3[2] / ws));
                        }
                        cov[k] = climate.cover[best];
                        if (ripPx) for (let v = 0; v < 3; v++) {
                            const S = climate.ripSat[v];
                            s3[0] = s3[1] = s3[2] = 0;
                            for (let j = 0; j < 3; j++) { const c = c3[j]; if (ocean[c] || !(climate.tAnnual[c] === climate.tAnnual[c])) continue; s3[0] += w3[j] * S[3 * c]; s3[1] += w3[j] * S[3 * c + 1]; s3[2] += w3[j] * S[3 * c + 2]; }
                            const o = 3 * k, D = ripPx[v];
                            D[o] = Math.round(mf * s3[0] / ws); D[o + 1] = Math.round(mf * s3[1] / ws); D[o + 2] = Math.min(255, Math.round(mf * s3[2] / ws));
                        }
                        // (the flow: the land cells' log-area, the most of the three — so a valley's line stays a line)
                        if (flowPx) { let fl = 0; for (let j = 0; j < 3; j++) { const c = c3[j]; if (!ocean[c] && w3[j] > 0.15) fl = Math.max(fl, climate.flow[c]); } flowPx[k] = fl; }
                        if (youngPx) { let yg = 0; for (let j = 0; j < 3; j++) { const c = c3[j]; if (!ocean[c]) yg += w3[j] * climate.young[c]; } youngPx[k] = Math.round(yg / ws); }
                    }
                }
            }
        }
        if (onRow && (py & 63) === 0) onRow(py / h);
    }
    // (the terrain on the satellite picture: rock where steep, slopes and valleys in dry country — from the heights)
    if (sat) terrainLook({ w: cw, h: ch, sat: { year: sat[0], jan: sat[1], jul: sat[2] }, cover: cov, tAnnual: tA, pAnnual: pA, koppen: kop, flow: flowPx, young: youngPx, noise: mottle, rivers: climate.rivers, water: lake ? water : null, ripSat: ripPx ? { year: ripPx[0], jan: ripPx[1], jul: ripPx[2] } : null }, heightM, w);
    return { w, h, heightM, ocean: sea, water, geology: rockPx ? { w: cw, h: ch, rock: rockPx, rec: recPx, deposits: geology.deposits ?? null } : null, climate: cw ? { w: cw, h: ch, koppen: kop, tAnnual: tA, pAnnual: pA, ...(statPx ? { stats: statPx } : {}), ...(sat ? { sat: { year: sat[0], jan: sat[1], jul: sat[2] }, cover: cov } : {}) } : null };
}

/** The widest climate picture a finish makes: the page's sharpest texture (finer would not be seen). */
const CLIMATE_WIDTH_MAX = 4096;
