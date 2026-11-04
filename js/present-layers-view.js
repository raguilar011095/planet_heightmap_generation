// The present-day world's Geology and Food tabs on Generate (plans/GENERATE_REDESIGN_PLAN.md G7e; ?next=1): Evolution's
// own views (v2/js/evolution/geology-view.js, farming-view.js) on the layers the worker works out on Generate's mesh
// (v2/js/present/layers.js). Those views read a finished moment's pictures — equirectangular rasters — so each region
// here reads them at its own latitude and longitude: the same colours, legends and readouts Evolution shows.

import { finishedGeologyColor, geologyLegendHTML, depositLines, ageLines, rockAt } from '../v2/js/evolution/geology-view.js';
import { finishedFarmingColor, farmingLegendHTML, farmingLines, farmChipClicked, farmOptionsKey } from '../v2/js/evolution/farming-view.js';
import { ROCK_INFO } from '../v2/js/geology/rocks.js';
import { regionLatLon } from './climate-layers.js';
import { elevToHeightKm } from './color-map.js';

/** The layers, by tab: the Geology tab's (Rocks, Deposits, Ages) and the Food tab's. */
export const GEOLOGY_TABS = [['geoRocks', 'Rocks'], ['geoDeposits', 'Deposits'], ['geoAges', 'Ages']];
export const FOOD_TABS = [['farmLand', 'Farmland'], ['farmStaple', 'Staple food'], ['farmLife', 'Lifestyle'], ['farmPeople', 'People'], ['farmSoil', 'Soil'], ['farmSeason', 'Growing season']];
const GEO = new Set(GEOLOGY_TABS.map(([id]) => id)), FOOD = new Set(FOOD_TABS.map(([id]) => id));
export const isGeologyLayer = (id) => GEO.has(id);
export const isFoodLayer = (id) => FOOD.has(id);
/** Whether a layer is one of these (and so needs the climate: the layers come with it). */
export const isPresentLayer = (id) => GEO.has(id) || FOOD.has(id);

// the Deposits view's pick and the Ages view's (Evolution's defaults: every system; the Bronze Age, every resource)
export const pick = { deposit: 'all', age: 'bronze', ageRes: 'all' };

/** The finished moment as Evolution's views read it, from the planet's data (null: no layers yet — no climate). */
export function presentFin(data) {
    const L = data?.climate?.presentLayers, g = data?.climate?.grid;
    if (!L?.raster) return null;
    if (data._fin?.src === L) return data._fin.fin;
    // (its pictures; its climate's picture, and the 1° grid's sea for the gatherers' fish)
    const fin = { raster: L.raster, climate: { raster: L.raster.climate, Tsea: g?.Tsea, upwelling: g?.upwelling, seaIce: g?.seaIce } };
    data._fin = { src: L, fin };
    return fin;
}

/** Each region's place on the pictures (u west → east, v north → south: 0…1), once per mesh. */
function regionUV(data) {
    if (data._uv && data._uv.n === data.r_xyz.length) return data._uv;
    const { lat, lon } = regionLatLon(data), n = lat.length, u = new Float32Array(n), v = new Float32Array(n);
    for (let r = 0; r < n; r++) { u[r] = (lon[r] + 180) / 360; v[r] = (90 - lat[r]) / 180; }
    return (data._uv = { n: data.r_xyz.length, u, v });
}

/**
 * The colour of a Geology or Food layer at each region, r → [r, g, b] in 0–1 — or null when the layer is not one of
 * them or the planet has no layers yet. Read from Evolution's colours unshaded (the page shades the terrain itself).
 */
export function presentLayerColorFn(id, data) {
    if (!isPresentLayer(id)) return null;
    const fin = presentFin(data);
    if (!fin) return null;
    const W = fin.raster.w, H = W >> 1, out = new Uint8Array(4), { u, v } = regionUV(data), elev = data.r_elevation;
    const colorAt = GEO.has(id) ? finishedGeologyColor(id, W, fin, pick.deposit, pick.age, pick.ageRes) : finishedFarmingColor(id, fin, W);
    return (r) => {
        const x = Math.min(W - 1, Math.max(0, u[r] * W - 0.5)), y = Math.min(H - 1, Math.max(0, v[r] * H - 0.5));
        colorAt(out, 0, x, y, !(elev[r] > 0), 1, 1, elevToHeightKm(elev[r]), 0);
        return [out[0] / 255, out[1] / 255, out[2] / 255];
    };
}
/** A key for what the colours depend on besides the layer (the picks, the farming's techniques): recolour on change. */
export const presentLayerKey = (id) => (GEO.has(id) ? `${pick.deposit}|${pick.age}|${pick.ageRes}` : FOOD.has(id) ? farmOptionsKey() : '');

/** The legend's HTML (Evolution's, with its chips: the farming's techniques and staples, the Ages' resources). */
export function presentLegendHTML(id, data) {
    const fin = presentFin(data);
    if (!fin) return '<div class="legend-note">Working out the rocks and the land&hellip;</div>';
    const html = GEO.has(id) ? geologyLegendHTML(id, fin, pick.deposit, pick.age, pick.ageRes) : farmingLegendHTML(id, fin);
    return `<div class="present-layer-legend">${html}</div>`;
}
/**
 * A click in the legend: the farming's chips (Evolution's farmChipClicked) or an Ages chip (its resource alone, again:
 * all). @returns {boolean} whether it changed what is shown
 */
export function presentLegendClicked(target) {
    if (farmChipClicked(target)) return true;
    const chip = target.closest?.('[data-age-res]');
    if (chip) { const id = chip.dataset.ageRes; pick.ageRes = pick.ageRes === id ? 'all' : id; return true; }
    return false;
}

/** The hover's lines at a region for the layer shown (Evolution's readouts; HTML with the readout's .hi-label). */
export function presentReadoutLines(id, data, r) {
    const fin = presentFin(data);
    if (!fin || !isPresentLayer(id)) return [];
    const { u, v } = regionUV(data), sea = !(data.r_elevation[r] > 0), lines = [];
    if (GEO.has(id)) {
        if (!sea) { const k = rockAt(fin, u[r], v[r]); if (k > 0) lines.push(`<span class="hi-label">Rock</span> ${ROCK_INFO[k].name}${ROCK_INFO[k].words ? ` — ${ROCK_INFO[k].words}` : ''}`); }
        if (id === 'geoDeposits') lines.push(...depositLines(fin, u[r], v[r], sea, pick.deposit));
        if (id === 'geoAges') lines.push(...ageLines(fin, pick.age, u[r], v[r], sea));
    } else lines.push(...farmingLines(fin, u[r], v[r], sea, id));
    return lines;
}
