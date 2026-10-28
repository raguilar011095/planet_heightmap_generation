// The new climate (v2/js/climate/) for Generate and Import — plans/V1_NEW_CLIMATE_PLAN.md. DOM-free: runs in the
// planet worker. One call: the planet's mesh positions and elevations, and the Temperature / Precipitation sliders, in;
// what the pages draw out:
//
//   koppen   per region (Uint8, the same 31 classes as js/koppen.js) — the Climate tab, Satellite, exports
//   cells    per land region (Float32; NaN at sea): t (°C) and p (mm/month) for the year, January and July; tRange
//            (warmest − coldest month, °C), aridity (P / PET, UNEP), growing (months above 10 °C), rainSeason (Walsh's
//            seasonality index) — each from the region's own twelve months, at its own height
//   grid     the 1° climate (360 × 180, rows north → south, columns from −179.5°), for the sea and the vectors: T (°C at
//            sea level; Tsea: the sea's own, carried across its coasts, for drawing the sea), P, slp (hPa), u / v (wind, m/s), currentU / currentV (m/s), sstAnom (°C), seaIce (0–1) — each
//            {year, jan, jul}; upwelling {year, jan, jul} (m/day); orographic (the mountains' share of the year's
//            rain) and orographicSeasons ({jan, jul}: of January's and July's);
//            iceSheet (0–1); snow (0–1, on land, {year, jan, jul}); sea (1 = sea); itcz {jan, jul, year} (latitude per 1° of longitude)
//
// The grid is sampled per region by the pages (js/climate-layers.js) only for the layer shown, so the worker hands over
// a few MB of grid instead of a dozen arrays per region.

import { planetClimate } from '../v2/js/climate/climate.js';
import { pageClimate } from '../v2/js/evolution/climate-fields.js';
import { cellStatsCollector } from '../v2/js/climate/cell-stats.js';
import { elevToHeightKm } from './color-map.js';

/**
 * Run the new climate on a V1 planet.
 * @param {Float32Array} r_xyz       unit-sphere positions, Y-up (as V1's meshes)
 * @param {Float32Array} r_elevation V1's elevation (≤ 0 sea)
 * @param {{greenhouse?: number, precipitationOffset?: number}} sliders  Greenhouse, W/m² of forcing (−30…30); −1…1 (±50 % rain)
 */
export function runNewClimate(r_xyz, r_elevation, { greenhouse = 0, precipitationOffset = 0 } = {}) {
    const t0 = performance.now();
    const n = r_elevation.length;
    const elevKm = new Float32Array(n), land = new Uint8Array(n);
    for (let r = 0; r < n; r++) { elevKm[r] = elevToHeightKm(r_elevation[r]); land[r] = r_elevation[r] > 0 ? 1 : 0; }

    // per land region, from its twelve months
    const nan = () => new Float32Array(n).fill(NaN);
    const t = { year: nan(), jan: nan(), jul: nan() }, p = { year: nan(), jan: nan(), jul: nan() };
    const collector = cellStatsCollector(n, r => Math.asin(Math.max(-1, Math.min(1, r_xyz[3 * r + 1]))));
    const cells = { t, p, ...collector.stats };
    const onCell = (r, T12, P12) => {
        let tSum = 0, pSum = 0;
        for (let m = 0; m < 12; m++) { tSum += T12[m]; pSum += P12[m]; }
        t.year[r] = tSum / 12; t.jan[r] = T12[0]; t.jul[r] = T12[6];
        p.year[r] = pSum / 12; p.jan[r] = P12[0]; p.jul[r] = P12[6];
        collector.add(r, T12, P12);
    };

    const res = planetClimate({ xyz: r_xyz, elevKm, land, axes: 'y-up' },
        { greenhouseWm2: greenhouse, precipScale: Math.max(0, 1 + 0.5 * precipitationOffset), onCell });
    const tClimate = performance.now() - t0;

    // the grid, as Evolution's views have it
    const pc = pageClimate(res, { cells: false });
    const grid = {
        w: res.grid.w, h: res.grid.h, step: res.grid.step,
        T: pc.T, Tsea: pc.Tsea, P: pc.P, slp: pc.slp, u: pc.u, v: pc.v, currentU: pc.currentU, currentV: pc.currentV, sstAnom: pc.sstAnom, seaIce: pc.seaIce,
        upwelling: pc.upwelling, orographic: pc.orographic, orographicSeasons: pc.orographicSeasons, iceSheet: pc.iceSheet, snow: pc.snow, sea: pc.sea, itcz: pc.itcz,
    };
    return { koppen: res.cell.koppen, cells, grid, timing: { climate: tClimate, total: performance.now() - t0, stages: res.timing } };
}

/** The buffers of runNewClimate's result, for postMessage's transfer list. */
export function newClimateTransfers(C) {
    const list = [C.koppen.buffer, C.cells.tRange.buffer, C.cells.aridity.buffer, C.cells.growing.buffer, C.cells.rainSeason.buffer,
        C.grid.orographic.buffer, C.grid.orographicSeasons.jan.buffer, C.grid.orographicSeasons.jul.buffer, C.grid.iceSheet.buffer, C.grid.sea.buffer];
    for (const f of [C.cells.t, C.cells.p, C.grid.T, C.grid.Tsea, C.grid.P, C.grid.slp, C.grid.u, C.grid.v, C.grid.currentU, C.grid.currentV, C.grid.sstAnom, C.grid.seaIce, C.grid.upwelling, C.grid.snow, C.grid.itcz])
        list.push(f.year.buffer, f.jan.buffer, f.jul.buffer);
    return [...new Set(list)];
}
