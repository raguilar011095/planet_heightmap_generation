// The present-day world's Geology and Food tabs on Generate (plans/GENERATE_REDESIGN_PLAN.md G7e, G7f; ?next=1): Evolution's
// own views (v2/js/evolution/geology-view.js, farming-view.js) on the layers the worker works out on Generate's mesh
// (v2/js/present/layers.js). Those views read a finished moment's pictures — equirectangular rasters — so each region
// here reads them at its own latitude and longitude: the same colours, legends and readouts Evolution shows, and the
// export's rows (js/export-generate.js) drawn the same way.

import { finishedGeologyColor, geologyLegendHTML, depositLines, ageLines, districtLines, geologyLines, rockAt, recAt, rockLine } from '../v2/js/evolution/geology-view.js';
import { finishedFarmingColor, finishedFarmingValue, farmingLegendHTML, farmingLines, farmChipClicked } from '../v2/js/evolution/farming-view.js';
import { produceGeology, maskField } from '../v2/js/evolution/geology-export.js';
import { ROCK_INFO, Rock } from '../v2/js/geology/rocks.js';
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
/** The record as the stories read it (layers.js storyFrame: the Frame's fields they read, on Evolution's clock), or null. */
const storyOf = (data) => data?.climate?.presentLayers?.story ?? null;

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
 * `p`: the Deposits view's and the Ages view's picks (the views': `pick`).
 */
export function presentLayerColorFn(id, data, p = pick) {
    if (!isPresentLayer(id)) return null;
    const fin = presentFin(data);
    if (!fin) return null;
    const W = fin.raster.w, H = W >> 1, out = new Uint8Array(4), { u, v } = regionUV(data), elev = data.r_elevation;
    const colorAt = GEO.has(id) ? finishedGeologyColor(id, W, fin, p.deposit, p.age, p.ageRes) : finishedFarmingColor(id, fin, W);
    return (r) => {
        const x = Math.min(W - 1, Math.max(0, u[r] * W - 0.5)), y = Math.min(H - 1, Math.max(0, v[r] * H - 0.5));
        colorAt(out, 0, x, y, !(elev[r] > 0), 1, 1, elevToHeightKm(elev[r]), 0);
        return [out[0] / 255, out[1] / 255, out[2] / 255];
    };
}

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

/**
 * The hover's lines at a region for the layer shown — Evolution's readout (evolution-main.js): the rock and where it came
 * from, the deposits or the age's resources, the district here and its story, and the record (its sea, cover, wear and
 * past). HTML with the readout's .hi-label.
 */
export function presentReadoutLines(id, data, r) {
    const fin = presentFin(data);
    if (!fin || !isPresentLayer(id)) return [];
    const { u, v } = regionUV(data), sea = !(data.r_elevation[r] > 0), lines = [], f = storyOf(data), ur = u[r], vr = v[r];
    if (!GEO.has(id)) return farmingLines(fin, ur, vr, sea, id);
    const w = !sea && f ? recAt(fin, ur, vr) : -1;
    if (!sea) {
        const k = rockAt(fin, ur, vr);
        const line = w >= 0 ? rockLine(k, f, w) : k > 0 ? `<span class="hi-label">Rock</span> <b>${ROCK_INFO[k].name}</b>` : null;
        if (line) lines.push(line);
    }
    if (id === 'geoDeposits') lines.push(...depositLines(fin, ur, vr, sea, pick.deposit));
    if (id === 'geoAges') lines.push(...ageLines(fin, pick.age, ur, vr, sea));
    if (id !== 'geoRocks' && !sea && f) lines.push(...districtLines(fin, f, id, pick.deposit, pick.age, pick.ageRes, ur, vr));
    if (w >= 0) lines.push(...geologyLines(f, w));
    return lines;
}

// ── the export (js/export-generate.js): Evolution's Geology and Food rows (geology-export.js GEOLOGY_GROUP,
// farming-export.js FOOD_GROUP), each region's value read as its view reads it ──

/** Whether the planet can give a row that needs `needs` ('geology', 'deposits', 'farming'): the present-day world's. */
export const presentRowNeeds = (needs) => needs === 'geology' || needs === 'deposits' || needs === 'farming';

/** A Geology or Food row's colours per region: its view as shown — the Deposits as picked, each age's map whole. */
export function presentExportColorFn(row, data) {
    if (row.geology) return presentLayerColorFn(row.geology, data, { deposit: pick.deposit, age: row.age ?? 'bronze', ageRes: 'all' });
    return presentLayerColorFn(row.id, data);
}

/**
 * A Geology or Food data file's value per region, r → 0…1 on its scale (null: not a map — or no layers): the rock type's
 * index, a richness mask (Evolution's maskField, smooth between the deposits' grid cells; the sea none but oil and gas on
 * the shelf), or a Food quantity (finishedFarmingValue). `scaled`: the panel's scaling onto the file's range.
 */
export function presentExportValueFn(file, data, scaled) {
    const fin = presentFin(data);
    if (!fin) return null;
    const { u, v } = regionUV(data), elev = data.r_elevation, key = file.key, land = (r) => elev[r] > 0;
    if (key === 'rockIndex') return (r) => (land(r) ? (rockAt(fin, u[r], v[r]) || Rock.ALLUVIUM) : 0) / 255;
    if (FOOD_KEYS.has(key)) {
        const W = fin.raster.w, H = W >> 1, at = finishedFarmingValue(key, fin, W);
        return (r) => (land(r) ? scaled(at(Math.min(W - 1, Math.max(0, u[r] * W - 0.5)), Math.min(H - 1, Math.max(0, v[r] * H - 0.5))), file.scale) : 0);
    }
    if (!(key.startsWith('m.') || key.includes('.'))) return null;
    const Dp = fin.raster.geology.deposits, { field, offshore } = maskField(fin, key), full = new Float32Array(Dp.w * Dp.h);
    for (let j = 0; j < Dp.cells.length; j++) full[Dp.cells[j]] = field[j];
    return (r) => {
        if (!offshore && !land(r)) return 0;
        // (as geology-export.js maskMap: bilinear between the grid's cells, wrapping east–west)
        const gx = u[r] * 360 / Dp.step - 0.5, x0 = Math.floor(gx), fx = gx - x0, a0 = (x0 + Dp.w) % Dp.w, a1 = (x0 + 1 + Dp.w) % Dp.w;
        const gy = Math.max(0, Math.min(Dp.h - 1, v[r] * 180 / Dp.step - 0.5)), y0 = Math.floor(gy), fy = gy - y0, r0 = y0 * Dp.w, r1 = Math.min(Dp.h - 1, y0 + 1) * Dp.w;
        const a = full[r0 + a0] + (full[r0 + a1] - full[r0 + a0]) * fx, b = full[r1 + a0] + (full[r1 + a1] - full[r1 + a0]) * fx;
        return Math.min(1, Math.max(0, a + (b - a) * fy));
    };
}
const FOOD_KEYS = new Set(['farmTech', 'farmRain', 'staple', 'lifestyle', 'people', 'soil', 'seasonRain', 'seasonWatered']);

/** A Geology file that is not a map (the districts as GeoJSON and CSV, the resource atlas): Evolution's, with the story
 *  record and the planet code for its seed. */
export function presentExportFile(job, data, code) {
    const fin = presentFin(data);
    return fin ? produceGeology(fin, fin.raster.w, { frame: storyOf(data), seed: code, atlas: { title: code ? `planet code ${code}` : 'a generated planet', page: 'Generate' } }, job) : null;
}
