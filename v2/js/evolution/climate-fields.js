// What the Evolution page draws of a moment's climate (v2/js/climate/), reduced from the climate's result — shared by the
// climate worker (the live terrain's climate) and the finishing worker (a finished moment's, at its own detail):
//   per terrain cell  koppen (Köppen id, v2/js/climate/koppen.js), tAnnual (°C), pAnnual (mm/year) — land only;
//   on the 1° grid (360 × 180, rows north → south, columns west → east from −179.5°), each for the year and for
//   January and July: T (°C at sea level), Tsea (the sea's own, carried across its coasts — for drawing the sea), P
//   (mm/month), slp (hPa), u and v (wind, m/s), currentU and currentV (surface currents, m/s — seasonal in the
//   tropics, ocean.js), sstAnom (sea temperature minus its latitude's sea average, °C),
//   seaIce (sea-ice fraction), upwelling (m/day); and sea (1 = sea), ice (the year's sea ice), orographic (the year's
//   rain with the mountains over it without them) and orographicSeasons (January's and July's: {jan, jul}), iceSheet
//   (0–1: the ice sheets' domes), snow (0–1, on land: year, January, July), itcz (per 1° of longitude, the ITCZ's
//   latitude — year, January, July).

import { CORE_DEFAULTS } from '../climate/core.js';
import { PARAMS } from '../climate/config.js';
import { interpolationMatrix } from '../climate/seasons.js';

/** Year (the mean of the twelve months), January (month 0) and July (month 6) of a 12 × G field. */
function seasons(all, G) {
    const year = new Float32Array(G);
    for (let m = 0; m < 12; m++) for (let c = 0; c < G; c++) year[c] += all[m * G + c] / 12;
    return { year, jan: all.slice(0, G), jul: all.slice(6 * G, 7 * G) };
}

/**
 * January's and July's share of the rain the mountains move (orographicK: each anchor's rain with them over without),
 * between the anchors as the months are (seasons.js), in log space so that it stays a ratio. A climate without
 * anchors' shares gives the year's.
 */
function orographicSeasons(rain, anchorMonths, year, G) {
    const K = anchorMonths?.length ?? 0, oK = rain.orographicK;
    if (!oK || !K || oK.length !== K * G) return { jan: year.slice(), jul: year.slice() };
    const M = interpolationMatrix(K, anchorMonths[0], 0), lg = new Float64Array(K);
    const jan = new Float32Array(G), jul = new Float32Array(G);
    for (let c = 0; c < G; c++) {
        for (let k = 0; k < K; k++) lg[k] = Math.log(Math.max(1e-3, oK[k * G + c]));
        let a = 0, b = 0;
        for (let k = 0; k < K; k++) { a += M[k] * lg[k]; b += M[6 * K + k] * lg[k]; }
        jan[c] = Math.exp(a); jul[c] = Math.exp(b);
    }
    return { jan, jul };
}

/** The page's climate from planetClimate's result (`cells`: false — the grid's fields only). */
export function pageClimate(res, { cells = true } = {}) {
    const { grid, months, surface, stages, cell } = res, G = grid.size, w = grid.w, h = grid.h;
    // (temperature at sea level, as the climate itself reduces it: the grid's is at its land's mean height)
    const gamma = CORE_DEFAULTS.lapseRateCPerKm, Tsl = new Float32Array(12 * G);
    for (let c = 0; c < G; c++) {
        const href = surface.meanLandKm[c] === surface.meanLandKm[c] ? Math.max(0, surface.meanLandKm[c]) : 0;
        for (let m = 0; m < 12; m++) Tsl[m * G + c] = months.T[m * G + c] + gamma * href;
    }
    const T = seasons(Tsl, G), P = seasons(months.P, G);
    const circ = stages.circulation, ocean = stages.ocean, temp = stages.temperature;
    const slp = seasons(circ.slp, G), u = seasons(circ.u, G), v = seasons(circ.v, G);
    // (the sea: where the 1° cell is mostly sea)
    const sea = new Uint8Array(G);
    for (let c = 0; c < G; c++) sea[c] = surface.landFrac[c] < 0.5 ? 1 : 0;
    // The sea's own fields come drawn already — carried across the coasts from the sea, refined smoothly (grid.js
    // refineForDrawing): its temperature (Tsea), its ice, currents and upwelling; and the ice sheets from the land.
    // (Older results without them fall back to the fields the physics uses.)
    const Tsea = temp.seaSL ? seasons(temp.seaSL, G) : T;
    // the sea's warm and cold currents: its temperature against the average of the sea at its latitude, each season
    const anomOf = (Tf) => {
        const a = new Float32Array(G);
        for (let j = 0; j < h; j++) {
            let s = 0, k = 0;
            for (let i = 0; i < w; i++) { const c = j * w + i; if (sea[c] && Tf[c] === Tf[c]) { s += Tf[c]; k++; } }
            const mean = k ? s / k : 0;
            for (let i = 0; i < w; i++) { const c = j * w + i; a[c] = temp.seaSL || sea[c] ? Tf[c] - mean : 0; }
        }
        return a;
    };
    const sstAnom = { year: anomOf(Tsea.year), jan: anomOf(Tsea.jan), jul: anomOf(Tsea.jul) };
    // (the year's currents in every season where the ocean has none: an older climate, or seasons turned off)
    const currentU = ocean.monthly ? seasons(ocean.monthly.u, G) : { year: Float32Array.from(ocean.u), jan: Float32Array.from(ocean.u), jul: Float32Array.from(ocean.u) };
    const currentV = ocean.monthly ? seasons(ocean.monthly.v, G) : { year: Float32Array.from(ocean.v), jan: Float32Array.from(ocean.v), jul: Float32Array.from(ocean.v) };
    const seaIce = seasons(temp.seaIceOpen ?? temp.seaIce, G), ice = seaIce.year;
    const upwelling = ocean.monthly?.upwelling ? seasons(ocean.monthly.upwelling, G)
        : { year: Float32Array.from(ocean.upwelling), jan: Float32Array.from(ocean.upwelling), jul: Float32Array.from(ocean.upwelling) };
    const orographic = Float32Array.from(stages.rain.orographic ?? new Float32Array(G).fill(1));
    const orographicSeasonal = orographicSeasons(stages.rain, res.anchorMonths, orographic, G);
    const iceSheet = new Float32Array(G), domeKm = PARAMS.TEMP_ICE_DOME_KM || 1, dome = temp.domeDraw ?? temp.domeKm;
    if (dome) for (let c = 0; c < G; c++) iceSheet[c] = Math.max(0, Math.min(1, dome[c] / domeKm));
    // snow on the land in its season: each month's temperature at the land's height through the climate's own snow ramp
    // (TEMP_ICE_WARM_C … TEMP_ICE_COLD_C), so the white runs from an ice sheet over the snowy land to the sea ice in winter
    const snowAll = new Float32Array(12 * G), w0 = PARAMS.TEMP_ICE_WARM_C, w1 = PARAMS.TEMP_ICE_COLD_C;
    for (let i = 0; i < 12 * G; i++) { const x = (w0 - months.T[i]) / (w0 - w1); snowAll[i] = x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x); }
    const snow = seasons(snowAll, G);
    const itcz = seasons(circ.itczLat, w);
    return {
        grid: { w, h },
        ...(cells ? { cell: { koppen: cell.koppen, tAnnual: cell.tAnnual, pAnnual: cell.pAnnual } } : {}),
        T, Tsea, P, slp, u, v,
        currentU, currentV, sea, sstAnom, ice, seaIce,
        upwelling, orographic, orographicSeasons: orographicSeasonal, iceSheet, snow, itcz,
    };
}

/** The buffers of the page's climate to hand over (its cells' and its raster's too, where it has them). */
export function climateTransfers(out) {
    const list = [out.sea.buffer, out.ice.buffer, out.orographic.buffer, out.iceSheet.buffer];
    if (out.orographicSeasons) list.push(out.orographicSeasons.jan.buffer, out.orographicSeasons.jul.buffer);
    if (out.cell) list.push(out.cell.koppen.buffer, out.cell.tAnnual.buffer, out.cell.pAnnual.buffer);
    if (out.cell?.stats) for (const a of Object.values(out.cell.stats)) list.push(a.buffer);
    if (out.raster?.stats) for (const a of Object.values(out.raster.stats)) list.push(a.buffer);
    if (out.raster) list.push(out.raster.koppen.buffer, out.raster.tAnnual.buffer, out.raster.pAnnual.buffer);
    if (out.raster?.sat) list.push(out.raster.sat.year.buffer, out.raster.sat.jan.buffer, out.raster.sat.jul.buffer, out.raster.cover.buffer);
    for (const f of [out.T, out.Tsea, out.P, out.slp, out.u, out.v, out.seaIce, out.currentU, out.currentV, out.sstAnom, out.upwelling, out.snow, out.itcz]) list.push(f.year.buffer, f.jan.buffer, f.jul.buffer);
    return [...new Set(list)];
}
