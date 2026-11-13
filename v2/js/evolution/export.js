// The export of a finished moment (plans/V2_FULL_PLANET_PLAN.md step C; the developer's decisions, 2026-10-01: finished
// moments only; a 16-bit heightmap with the sea floor on a fixed −11…+9 km scale — the same shade the same height on every
// planet — and a land heightmap 0…+9 km, the sea black; rivers drawn on the colour map as on screen, and a transparent
// rivers-and-lakes layer). Since the fast follows of 2026-10 the export is the shared panel (v2/js/view/export-panel.js):
// every map as Colour and / or Data — the climate's layers too, through climate-view.js's samplers — in a projection
// (projections.js), one file or a ZIP with a README. Each map is the finished picture (finish.js finishRaster) at any
// width: its own, averaged down, or enlarged for use downstream (developer, 2026-10-17: "allow the different sizes even if
// it enlarges the pixels … some smart interpolation"): heights by a clamped bicubic, coasts, lakes and climate zones by the
// weighted majority of the nearest pixels, satellite colours blended — then painted at the full width, so the hillshade,
// the coasts and the rivers' lines stay sharp. And the geology's (geology-export.js): each of its views' maps, the rock
// types and a richness mask per resource as data, the districts as GeoJSON and CSV, a resource atlas in words. And the
// farming's (farming-view.js): each of its views as shown, and its numbers as data.

import { paintFinished, paintWindow, riverPaths, drawRivers, drawRiversWindow, rasterAt, lakeColor } from './finish-view.js';
import { finishedClimateColor, finishedClimateValue } from './climate-view.js';
import { finishedFarmingColor, finishedFarmingValue } from './farming-view.js';
import { KOPPEN_CLASSES } from '../climate/koppen.js';
import { canvasOf } from '../view/png.js';
import { cloudFields, cloudGrid, cloudPicture, cloudOver, cloudStorms } from '../view/clouds.js';
import { initExportPanel } from '../view/export-panel.js';
import { DATA_SCALES as SC, scaled, hillshade8, climateRows, classIndexMap } from '../view/export-raster.js';
import { GEOLOGY_GROUP, produceGeology, rockTypesList } from './geology-export.js';
import { FOOD_GROUP, staplesList, farmingNote } from './farming-export.js';

/** The heightmap's scale: black −11 km (below the deepest trench), white +9 km (above the highest peak), linear. */
export const HEIGHT_RANGE_M = [-11000, 9000];
/** The land heightmap's: the sea black (0), land from 0 m (1) to +9 km (65535), linear. */
export const LAND_TOP_M = 9000;
/** The widest export drawn whole: 16384 px (a picture of 134 million pixels); on a phone 4096. Wider, on a computer, a
 *  band of rows at a time (produceBand): to 65,536 px (owner, 2026-11-10). */
export const EXPORT_MAX = 16384, EXPORT_MAX_TOUCH = 4096, EXPORT_MAX_BANDS = 65536;
const KOPPEN_RGB = KOPPEN_CLASSES.map(k => k.color.map(v => Math.round(255 * v)));
/** The catalogue of a moment's maps (the panel's rows): as Colour, as Data, or both. */
export const CATALOGUE = [
    { id: 'maps', label: 'Maps', rows: [
        { id: 'color', label: 'Colour map', colour: true, tip: 'The Terrain view as shown, in your terrain colours, with rivers and lakes if Rivers &amp; lakes is on' },
        { id: 'satellite', label: 'Satellite', colour: true, seasonal: true, needs: 'satellite', tip: 'The Satellite view for the year, January or July' },
        { id: 'satelliteClouds', label: 'Satellite with clouds', colour: true, seasonal: true, needs: 'satellite', tip: 'The Satellite view with its clouds over it — one still moment of them, from the climate in the season' },
        { id: 'clouds', label: 'Clouds', colour: true, seasonal: true, needs: 'satellite', tip: 'The clouds alone, with their faint shadows, on a transparent ground — to lay over another map' },
        { id: 'koppen', label: 'Climate zones (Köppen)', colour: true, needs: 'climate', data: [{ key: 'koppenIndex', suffix: 'index', label: 'Köppen class index', scale: SC.koppenIndex, bits: 8 }], tip: 'The Köppen zones in their own colours, unshaded; as data, each class\'s index (the README lists them)' },
        { id: 'rivers', label: 'Rivers &amp; lakes', colour: true, needs: 'rivers', tip: 'The rivers and lakes alone on a transparent ground, to lay over another map' },
    ] },
    { id: 'elevation', label: 'Elevation', rows: [
        { id: 'heightmap', label: 'Heightmap with sea floor', data: [{ key: 'heightmap', suffix: '', label: 'Heightmap with sea floor', scale: { unit: 'km (sea level at 55 %)', lo: -11, hi: 9 }, bits: 16 }], tip: '16-bit greyscale, the same scale on every planet: black −11 km, white +9 km (sea level at 55 %)' },
        { id: 'landheightmap', label: 'Land heightmap', data: [{ key: 'landheightmap', suffix: '', label: 'Land heightmap', scale: { unit: 'km above sea level (the sea 0; land from 1)', lo: 0, hi: 9 }, bits: 16 }], tip: '16-bit: the sea black and land from 0 to +9 km (re-imports on the Import page, which reads white as 6 km)' },
        { id: 'landmask', label: 'Land mask', data: [{ key: 'landmask', suffix: '', label: 'Land mask', scale: SC.landmask, bits: 8 }], tip: 'Land white (lakes are land), the sea black' },
        { id: 'hillshade', label: 'Hillshade', data: [{ key: 'hillshade', suffix: '', label: 'Hillshade', scale: SC.hillshade, bits: 8 }], tip: 'The relief lit from the north-west, on its own — to lay over a flat colour map' },
    ] },
    { id: 'climate', label: 'Climate', rows: climateRows('climate') },
    GEOLOGY_GROUP,
    FOOD_GROUP,
];

/** Whether a moment has a row's data: its climate, Satellite, rivers, rocks, deposits or farming — a moment detailed by an
 *  older World Orogen may lack the newer ones. */
export function rowAvailable(row, fin) {
    const n = row.needs;
    return n === 'climate' ? !!fin.climate?.raster?.koppen : n === 'satellite' ? !!fin.climate?.raster?.sat : n === 'rivers' ? !!fin.rivers
        : n === 'geology' ? !!fin.raster?.geology : n === 'deposits' ? !!fin.raster?.geology?.deposits?.land
        : n === 'farming' ? !!(fin.raster?.farming?.crops && fin.climate?.raster?.koppen) : true;
}
/** The row ids whose colours climate-view.js names otherwise. */
const CLIMATE_LAYER_OF = { precip: 'rain' };

// ── the centre longitude: every map turned so that `look.centerLon` (degrees) is in the middle, as the map view is ──
/** How many columns to roll a W-wide map for a centre longitude (0 … W−1). */
export const rollShift = (W, centerLon) => ((Math.round(W * (centerLon || 0) / 360) % W) + W) % W;
/** A map's rows rolled left by `shift` columns (`ch` values a pixel): what was at the centre longitude is now mid-row. */
export function rollRows(arr, W, H, ch, shift) {
    if (!shift) return arr;
    const out = new arr.constructor(arr.length), rowLen = W * ch, s = shift * ch;
    for (let y = 0; y < H; y++) {
        const o = y * rowLen;
        out.set(arr.subarray(o + s, o + rowLen), o);
        out.set(arr.subarray(o, o + s), o + rowLen - s);
    }
    return out;
}
/** The rivers drawn onto a rolled map: once shifted left, and once more at the right edge for the lines that wrap. */
function drawRiversRolled(ctx, W, k, shift, fin, look) {
    const paths = riverPaths(fin, look.riverQ);
    for (const dx of shift ? [-shift, W - shift] : [0]) {
        ctx.save(); ctx.translate(dx, 0); ctx.scale(k, k); drawRivers(ctx, paths, look.byRegime); ctx.restore();
    }
}

// ── an export wider than the picture, with the detail finer than the mesh (detail-view.js: drawn in begin(), band by band,
// the whole planet at the export's width) — its heights, sea and lakes ──
/** The picture at width W: the detail drawn for this export where there is one, else the picture averaged or enlarged. */
function pictureAt(fin, W, opts = {}) {
    const f = fin.fine?.W === W ? fin.fine : null;
    if (!f) return rasterAt(fin.raster, W, opts);
    if (!opts.landOnly) return f;
    const h = new Float32Array(f.h.length);
    for (let i = 0; i < h.length; i++) h[i] = f.sea[i] ? 0 : Math.max(0, f.h[i]);
    return { h, sea: f.sea, wat: f.wat };
}
/** The picture painted at width W (paintFinished's palette, hillshade, lakes and colours) — the detail's where drawn. */
function paintAt(fin, W, image, lut, opts) {
    if (fin.fine?.W === W) paintWindow(fin.fine, { W, x0: 0, y0: 0, w: W, h: W >> 1 }, image.data, lut, opts);
    else paintFinished(fin.raster, { width: W, image }, lut, opts);
}

/**
 * The widths offered: from 1024 px, doubling, up to `maxW` — its own width and those under it averaged down (a whole
 * fraction of it), those above it enlarged.
 * @returns {{w: number, enlarged: boolean}[]}
 */
export function exportWidths(r, maxW = EXPORT_MAX) {
    const out = [];
    for (let w = Math.min(1024, r.w); w <= Math.max(maxW, r.w); w *= 2) out.push({ w, enlarged: w > r.w });
    return out;
}


// (each pixel's value from the picture's — the whole planet's, or a band's)
function height16(h) {
    const [lo, hi] = HEIGHT_RANGE_M, out = new Uint16Array(h.length);
    for (let i = 0; i < h.length; i++) out[i] = Math.round(65535 * Math.min(1, Math.max(0, (1000 * h[i] - lo) / (hi - lo))));
    return out;
}
function landHeight16({ h, sea }) {
    const out = new Uint16Array(h.length);
    for (let i = 0; i < h.length; i++) out[i] = sea[i] ? 0 : 1 + Math.round(65534 * Math.min(1, Math.max(0, 1000 * h[i] / LAND_TOP_M)));
    return out;
}
function mask8(sea) {
    const out = new Uint8Array(sea.length);
    for (let i = 0; i < sea.length; i++) out[i] = sea[i] ? 0 : 255;
    return out;
}
function koppenRgba(idx) {
    const rgba = new Uint8ClampedArray(4 * idx.length);
    for (let p = 0; p < idx.length; p++) { const c = KOPPEN_RGB[idx[p]], o = 4 * p; rgba[o] = c[0]; rgba[o + 1] = c[1]; rgba[o + 2] = c[2]; rgba[o + 3] = 255; }
    return rgba;
}
function lakesRgba(d, wat, sea, lut) {
    if (wat) for (let p = 0; p < sea.length; p++) {
        if (!wat[p] || sea[p]) continue;
        const c = lakeColor(lut, wat[p]), o = 4 * p;
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
    }
    return d;
}

/** The 16-bit heightmap, the sea floor included: −11 km black … +9 km white. */
export function heightmap16(fin, W, centerLon = 0) {
    return rollRows(height16(pictureAt(fin, W).h), W, W >> 1, 1, rollShift(W, centerLon));
}

/** The 16-bit land heightmap: the sea black, land 0…+9 km as 1…65535 (a lake's bed below sea level as 0 m). */
export function landHeightmap16(fin, W, centerLon = 0) {
    return rollRows(landHeight16(pictureAt(fin, W, { landOnly: true })), W, W >> 1, 1, rollShift(W, centerLon));
}

/** The land mask: land white (lakes are land), the sea black. */
export function landMask8(fin, W, centerLon = 0) {
    return rollRows(mask8(pictureAt(fin, W).sea), W, W >> 1, 1, rollShift(W, centerLon));
}

/**
 * The colour map as the Terrain view shows it: the palette's colours hillshaded, the lakes and the rivers (with Rivers &
 * Lakes), no grid. `look`: { lut, exaggeration, water, riverQ, byRegime, shaded (the hillshade; default on), centerLon }.
 */
export function colorMap(fin, W, look) {
    const H = W >> 1, image = new ImageData(W, H), shift = rollShift(W, look.centerLon);
    paintAt(fin, W, image, look.lut, { exaggeration: look.exaggeration, lakes: look.water, shaded: look.shaded !== false });
    const rgba = rollRows(image.data, W, H, 4, shift);
    if (!(look.water && fin.rivers)) return { kind: 'rgba', W, H, data: rgba };
    const canvas = canvasOf(W, H), ctx = canvas.getContext('2d');
    ctx.putImageData(shift ? new ImageData(rgba, W, H) : image, 0, 0);
    // (the rivers' lines are drawn for a 2048-wide picture: as thick, relative to the map, at any width)
    drawRiversRolled(ctx, W, W / 2048, shift, fin, look);
    return { kind: 'rgba', W, H, data: ctx.getImageData(0, 0, W, H).data };
}

/** The Satellite view as shown, for the year, January or July: no grid, no glint (and, as on screen, no rivers' lines). */
export function satelliteMap(fin, W, season, look, clouds = false) {
    const H = W >> 1, image = new ImageData(W, H);
    paintAt(fin, W, image, look.lut, { exaggeration: look.exaggeration * 1.25, lakes: true, shaded: look.shaded !== false,
        colorAt: finishedClimateColor('satellite', season, fin.climate, W, look.lut, fin) });
    // (with clouds: theirs — view/clouds.js, one still moment — laid over)
    if (clouds) cloudOver(cloudsOf(fin, season, W, look), image.data, W);
    return { kind: 'rgba', W, H, data: rollRows(image.data, W, H, 4, rollShift(W, look.centerLon)) };
}
/** The clouds of a moment for a season (view/clouds.js cloudGrid: at most 2048 wide, one still moment, the storms the
 *  world's own — its numeric seed), kept per moment so both cloud rows draw them once. */
const cloudGrids = new WeakMap();
function cloudsOf(fin, season, W, look) {
    let byKey = cloudGrids.get(fin.climate);
    if (!byKey) cloudGrids.set(fin.climate, byKey = new Map());
    const key = `${season}|${Math.min(W, 2048)}|${look.cloudSeed ?? 0}`;
    if (!byKey.has(key)) byKey.set(key, cloudGrid(cloudFields(fin.climate, season), cloudStorms(look.cloudSeed ?? 0, fin.climate, season), W));
    return byKey.get(key);
}
/** The clouds alone (view/clouds.js: one still moment, their faint shadows too), on a transparent ground. */
export function cloudsMap(fin, W, season, look) {
    const H = W >> 1, d = cloudPicture(cloudsOf(fin, season, W, look), W);
    return { kind: 'rgba', W, H, data: rollRows(d, W, H, 4, rollShift(W, look.centerLon)), alpha: true };
}

/**
 * The Köppen zones in their own colours, unshaded (a map to use, as Generate exports it): the sea in Ocean's colour, each
 * land pixel its zone — averaged down, the zone most of its block has; enlarged, the zone the nearest four by four pixels
 * weigh most by a cubic B-spline (smooth, positive weights: the zones' stair-stepped borders rounded into curves). Land the
 * climate picture marks as sea (a coast a pixel apart) takes the nearest zone.
 */
export function koppenIndexMap(fin, W, centerLon = 0) {
    const R = fin.climate.raster, { sea } = pictureAt(fin, W);
    return rollRows(classIndexMap(R, R.koppen, KOPPEN_RGB.length, W, sea), W, W >> 1, 1, rollShift(W, centerLon));
}
/** The Köppen zones in their colours (the sea in Ocean's colour), from the index map. */
export function koppenMap(fin, W, centerLon = 0) {
    return { kind: 'rgba', W, H: W >> 1, data: koppenRgba(koppenIndexMap(fin, W, centerLon)) };
}

/**
 * The rivers and lakes alone, on a transparent ground — to lay over another map: the lakes in the Terrain view's colours,
 * the rivers drawn as the Terrain view draws them (the density and the colouring chosen there).
 */
export function riversMap(fin, W, look) {
    const H = W >> 1, { wat, sea } = pictureAt(fin, W, { lakes: true }), image = new ImageData(W, H), d = lakesRgba(image.data, wat, sea, look.lut), shift = rollShift(W, look.centerLon);
    const canvas = canvasOf(W, H), ctx = canvas.getContext('2d');
    ctx.putImageData(shift ? new ImageData(rollRows(d, W, H, 4, shift), W, H) : image, 0, 0);
    if (fin.rivers) drawRiversRolled(ctx, W, W / 2048, shift, fin, look);
    return { kind: 'rgba', W, H, data: ctx.getImageData(0, 0, W, H).data, alpha: true };
}


/** A climate layer as shown (climate-view.js finishedClimateColor), shaded or flat, the lakes as the Terrain view has them. */
export function climateMap(fin, W, layer, season, look) {
    const H = W >> 1, image = new ImageData(W, H);
    paintAt(fin, W, image, look.lut, { exaggeration: look.exaggeration, lakes: look.water, shaded: look.shaded !== false,
        colorAt: finishedClimateColor(layer, season, fin.climate, W, look.lut, fin) });
    return { kind: 'rgba', W, H, data: rollRows(image.data, W, H, 4, rollShift(W, look.centerLon)) };
}
/** A Food view as shown (farming-view.js), shaded or flat, lakes as water. */
export function farmingMap(fin, W, layer, look) {
    const H = W >> 1, image = new ImageData(W, H);
    paintAt(fin, W, image, look.lut, { exaggeration: look.exaggeration, lakes: true, shaded: look.shaded !== false, colorAt: finishedFarmingColor(layer, fin, W) });
    return { kind: 'rgba', W, H, data: rollRows(image.data, W, H, 4, rollShift(W, look.centerLon)) };
}
/** A Food quantity as numbers (8-bit for the staple food's and the lifestyle's indices, else 16-bit), on its scale. */
export function farmingValueMap(fin, W, file, centerLon = 0) {
    const H = W >> 1, { sea } = pictureAt(fin, W), out = file.bits === 8 ? new Uint8Array(W * H) : new Uint16Array(W * H), top = file.bits === 8 ? 255 : 65535;
    const at = finishedFarmingValue(file.key, fin, W);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const p = y * W + x; out[p] = sea[p] ? 0 : Math.round(top * scaled(at(x, y), file.scale)); }
    return { kind: file.bits === 8 ? 'gray8' : 'gray16', W, H, data: rollRows(out, W, H, 1, rollShift(W, centerLon)) };
}
/** A climate quantity as numbers (climate-view.js finishedClimateValue), 16-bit on its scale. */
export function valueMap(fin, W, key, season, scale, centerLon = 0) {
    const H = W >> 1, { sea } = pictureAt(fin, W), at = finishedClimateValue(key, season, fin.climate, W), out = new Uint16Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const p = y * W + x; out[p] = Math.round(65535 * scaled(at(x, y, !!sea[p]), scale)); }
    return { kind: 'gray16', W, H, data: rollRows(out, W, H, 1, rollShift(W, centerLon)) };
}
/** The hillshade of the moment's heights, 8-bit. */
export function hillshadeMap(fin, W, exaggeration, centerLon = 0) {
    const H = W >> 1, { h } = pictureAt(fin, W);
    return { kind: 'gray8', W, H, data: rollRows(hillshade8(h, W, H, exaggeration), W, H, 1, rollShift(W, centerLon)) };
}

/**
 * One map of a finished moment, W wide, as the panel asks for it: `job` {row (a CATALOGUE row), variant ('colour' or
 * 'data'), file (one of the row's data files), season}; `lk` the look ({lut, exaggeration, water, riverQ, byRegime,
 * shaded, centerLon} — and for the geology's rows the Deposits view's pick, the moment's frame and the seed:
 * geology-export.js). (v2/tools/check-save.mjs draws every one from each saved planet it keeps.)
 */
export function produceMap(fin, W, lk, job) {
    const s = job.season || 'year', id = job.row.id, c = lk.centerLon;
    if (job.row.geology) {
        const g = produceGeology(fin, W, lk, job, { pictureAt, paintAt });
        return g.kind === 'file' ? g : { ...g, data: rollRows(g.data, g.W, g.H, g.kind === 'rgba' ? 4 : 1, rollShift(g.W, c)) };
    }
    if (job.variant === 'colour') {
        if (id === 'color') return colorMap(fin, W, lk);
        if (job.row.needs === 'farming') return farmingMap(fin, W, id, lk);
        if (id === 'satellite') return satelliteMap(fin, W, s, lk);
        if (id === 'satelliteClouds') return satelliteMap(fin, W, s, lk, true);
        if (id === 'clouds') return cloudsMap(fin, W, s, lk);
        if (id === 'koppen') return koppenMap(fin, W, c);
        if (id === 'rivers') return riversMap(fin, W, lk);
        return climateMap(fin, W, CLIMATE_LAYER_OF[id] || id, s, lk);
    }
    const key = job.file.key, H = W >> 1;
    if (key === 'heightmap') return { kind: 'gray16', W, H, data: heightmap16(fin, W, c) };
    if (key === 'landheightmap') return { kind: 'gray16', W, H, data: landHeightmap16(fin, W, c) };
    if (key === 'landmask') return { kind: 'gray8', W, H, data: landMask8(fin, W, c) };
    if (key === 'hillshade') return hillshadeMap(fin, W, lk.exaggeration, c);
    if (key === 'koppenIndex') return { kind: 'gray8', W, H, data: koppenIndexMap(fin, W, c) };
    if (job.row.needs === 'farming') return farmingValueMap(fin, W, job.file, c);
    return valueMap(fin, W, key, s, job.file.scale, c);
}

// ── an export wider than EXPORT_MAX, on a computer (owner, 2026-11-10: "65536, and yes we can offer to split tiles"):
// drawn a band of rows at a time — the detail finer than the mesh for those rows and a row either side (the hillshade's
// neighbours, so bands meet as one picture), then each map's rows as produceMap draws the whole, row for row — and each
// band's rows written to the files as they come (export-panel.js), so no picture of the whole planet is ever held ──

/** The rows of a band W wide: about 16 million pixels (256 at 65,536), a power of two (a 16,384-px tile holds whole bands). */
export const bandRows = W => Math.max(16, Math.min(1024, 2 ** Math.floor(Math.log2(2 ** 24 / W))));

/**
 * A band of a W-wide planet: rows y0 … y0 + n − 1, with the detail finer than the mesh drawn for them and a row either
 * side (`fw` {h, sea, wat}: the planet's rows from `from` on). `fine(fin, seed, win)`: the page's drawing of a window
 * (detail-view.js DetailService.window — fine-detail.js fineWindow's, which windows drawn apart agree with).
 */
export async function drawBand(fine, fin, seed, W, y0, n) {
    const from = Math.max(0, y0 - 1), to = Math.min(W >> 1, y0 + n + 1);
    return { W, y0, n, from, fw: await fine(fin, seed, { W, x0: 0, y0: from, w: W, h: to - from }) };
}
/** A band's own rows of its picture, as pictureAt gives the planet's (`landOnly`: the sea and lakes' beds at 0). */
function bandPicture(B, { landOnly = false } = {}) {
    const { W, y0, n, from, fw } = B, a = (y0 - from) * W, b = a + n * W, f = { h: fw.h.subarray(a, b), sea: fw.sea.subarray(a, b), wat: fw.wat.subarray(a, b) };
    if (!landOnly) return f;
    const h = new Float32Array(n * W);
    for (let i = 0; i < h.length; i++) h[i] = f.sea[i] ? 0 : Math.max(0, f.h[i]);
    return { h, sea: f.sea, wat: f.wat };
}
let paintScratch = null;
/** A band painted as paintAt paints the planet: over its rows and a row either side (the hillshade's), its own kept. */
function bandPaint(B, image, lut, opts) {
    const { W, y0, n, from, fw } = B, rows = fw.h.length / W, len = 4 * W * rows;
    if (!(paintScratch?.length >= len)) paintScratch = new Uint8ClampedArray(len);
    const all = paintScratch.subarray(0, len);
    paintWindow(fw, { W, x0: 0, y0: from, w: W, h: rows }, all, lut, opts);
    image.data.set(all.subarray(4 * W * (y0 - from), 4 * W * (y0 - from + n)));
}
/** The rivers' lines over a band's colours, as colorMap draws them over the planet (as thick, relative to the map, as on a
 *  2048-wide one): on canvases at most 8192 wide (a browser's canvas has its limits), each over its columns. */
function riversOverBand(rgba, B, fin, look) {
    const { W, y0, n } = B, CW = 8192;
    for (let x0 = 0; x0 < W; x0 += CW) {
        const w = Math.min(CW, W - x0), canvas = canvasOf(w, n), ctx = canvas.getContext('2d'), img = new ImageData(w, n);
        for (let j = 0; j < n; j++) img.data.set(rgba.subarray(4 * (j * W + x0), 4 * (j * W + x0 + w)), 4 * j * w);
        ctx.putImageData(img, 0, 0);
        drawRiversWindow(ctx, fin, look.riverQ, look.byRegime, W, x0, y0, w, n);
        const back = ctx.getImageData(0, 0, w, n).data;
        for (let j = 0; j < n; j++) rgba.set(back.subarray(4 * j * w, 4 * (j + 1) * w), 4 * (j * W + x0));
    }
}

/**
 * A band's rows of one map (`B` from drawBand), as produceMap draws the whole planet's: {kind, W, H (the band's rows),
 * data, alpha?}, centred on lk.centerLon. `memo`: the run's colours and samplers, each made once (a Map). Not for a
 * row's files that are not maps (the districts, the atlas: produceMap gives those, whatever the width).
 */
export function produceBand(fin, W, lk, job, B, memo = new Map()) {
    const r = bandUnturned(fin, W, lk, job, B, memo);
    return { ...r, data: rollRows(r.data, W, B.n, r.kind === 'rgba' ? 4 : 1, rollShift(W, lk.centerLon)) };
}
function bandUnturned(fin, W, lk, job, B, memo) {
    const s = job.season || 'year', id = job.row.id, { y0, n } = B, pic = bandPicture(B), R = fin.climate?.raster;
    const once = (k, make) => { if (!memo.has(k)) memo.set(k, make()); return memo.get(k); };
    if (job.row.geology) return produceGeology(fin, W, lk, job, { rows: { y0, n }, pictureAt: (_f, _W, o) => bandPicture(B, o), paintAt: (_f, _W, image, lut, o) => bandPaint(B, image, lut, o) });
    const map = (kind, data, alpha = false) => ({ kind, W, H: n, data, ...(alpha ? { alpha } : {}) });
    const paint = (lakes, colorAt, exaggeration = lk.exaggeration) => {
        const image = { data: new Uint8ClampedArray(4 * W * n) };
        bandPaint(B, image, lk.lut, { exaggeration, lakes, shaded: lk.shaded !== false, colorAt });
        return image.data;
    };
    if (job.variant === 'colour') {
        if (id === 'color') {
            const d = paint(lk.water, null);
            if (lk.water && fin.rivers) riversOverBand(d, B, fin, lk);
            return map('rgba', d);
        }
        if (job.row.needs === 'farming') return map('rgba', paint(true, once(`farm|${id}`, () => finishedFarmingColor(id, fin, W))));
        if (id === 'satellite' || id === 'satelliteClouds') {
            const d = paint(true, once(`sat|${s}`, () => finishedClimateColor('satellite', s, fin.climate, W, lk.lut, fin)), lk.exaggeration * 1.25);
            if (id === 'satelliteClouds') cloudOver(cloudsOf(fin, s, W, lk), d, W, undefined, y0, n);
            return map('rgba', d);
        }
        if (id === 'clouds') return map('rgba', cloudPicture(cloudsOf(fin, s, W, lk), W, undefined, y0, n), true);
        if (id === 'koppen') return map('rgba', koppenRgba(classIndexMap(R, R.koppen, KOPPEN_RGB.length, W, pic.sea, y0, n)));
        if (id === 'rivers') {
            const d = lakesRgba(new Uint8ClampedArray(4 * W * n), pic.wat, pic.sea, lk.lut);
            if (fin.rivers) riversOverBand(d, B, fin, lk);
            return map('rgba', d, true);
        }
        return map('rgba', paint(lk.water, once(`clim|${id}|${s}`, () => finishedClimateColor(CLIMATE_LAYER_OF[id] || id, s, fin.climate, W, lk.lut, fin))));
    }
    const key = job.file.key;
    if (key === 'heightmap') return map('gray16', height16(pic.h));
    if (key === 'landheightmap') return map('gray16', landHeight16(bandPicture(B, { landOnly: true })));
    if (key === 'landmask') return map('gray8', mask8(pic.sea));
    if (key === 'hillshade') return map('gray8', hillshade8(B.fw.h, W, W >> 1, lk.exaggeration, { y0, n, from: B.from }));
    if (key === 'koppenIndex') return map('gray8', classIndexMap(R, R.koppen, KOPPEN_RGB.length, W, pic.sea, y0, n));
    const file = job.file, sea = pic.sea;
    if (job.row.needs === 'farming') {
        const at = once(`farmv|${key}`, () => finishedFarmingValue(key, fin, W)), eight = file.bits === 8, top = eight ? 255 : 65535, out = eight ? new Uint8Array(W * n) : new Uint16Array(W * n);
        for (let j = 0; j < n; j++) for (let x = 0; x < W; x++) { const p = j * W + x; out[p] = sea[p] ? 0 : Math.round(top * scaled(at(x, y0 + j), file.scale)); }
        return map(eight ? 'gray8' : 'gray16', out);
    }
    const at = once(`climv|${key}|${s}`, () => finishedClimateValue(key, s, fin.climate, W)), out = new Uint16Array(W * n);
    for (let j = 0; j < n; j++) for (let x = 0; x < W; x++) { const p = j * W + x; out[p] = Math.round(65535 * scaled(at(x, y0 + j, !!sea[p]), file.scale)); }
    return map('gray16', out);
}

/**
 * Wire the export panel on a page that shows finished moments — Evolution's, and Generate's (plans/SHARED_CORE_PLAN.md U3).
 * `moment()`: the moment the dialog opens for ({ frame, fin, seed }) or null; `look()`: the Terrain view's look ({ lut,
 * exaggeration, water, riverQ, byRegime }, and the geology's: { deposit (the Deposits view's pick) }); `centerLon()`: the map
 * view's; `planetFile`: the page's planet file ({ status, save }: export-panel.js), offered beside the maps. A page other
 * than Evolution names its files and its README its own way: `page` (the adapter's), `names(ctx, opts)`, `about(ctx,
 * opts)` (its page and planet words: the size and Food notes are added) and `titleNote(ctx)`.
 */
export function initEvolutionExport({ moment, look, centerLon, projection = null, isTouch, planetFile = null, fine = null, page = 'evolution', names = null, about = null, titleNote = null,
    catalogue = CATALOGUE, produceOwn = null, produceOwnBand = null }) {
    // (a page's own rows — Generate's Plates: `catalogue` holds them, `produceOwn(rctx, job)` draws them, else null; and
    // `produceOwnBand(rctx, job, band)` a band's rows of them, wider than EXPORT_MAX)
    // (`fine(fin, seed, W, onProgress, win)`: the page's drawing of the detail finer than the mesh — the whole planet W
    // wide, or a window of it: wider than EXPORT_MAX, on a computer, the maps are drawn a band at a time over it)
    const sizeNote = (ctx, opts) => (opts.width > ctx.fin.raster.w ? (ctx.fin.raster.drivers ? `drawn from the ${ctx.fin.raster.w} px the moment was detailed at, with the detail finer than its mesh added` : `enlarged from the ${ctx.fin.raster.w} px the moment was detailed at`) : opts.width < ctx.fin.raster.w ? `averaged down from ${ctx.fin.raster.w} px` : 'the width the moment was detailed at');
    const adapter = {
        page,
        options: { hillshade: true },
        planetFile,
        koppenClasses: KOPPEN_CLASSES,
        readmeLists: files => [...rockTypesList(files), ...staplesList(files)],
        widths: (ctx) => exportWidths(ctx.fin.raster, isTouch ? EXPORT_MAX_TOUCH : fine && ctx.fin.raster.drivers ? EXPORT_MAX_BANDS : EXPORT_MAX).map(({ w, enlarged }) => ({ w, selected: w === ctx.fin.raster.w, label: `${w}${enlarged ? ` · enlarged ×${w / ctx.fin.raster.w}` : w === ctx.fin.raster.w ? ' · as detailed' : ''}` })),
        available: (row, ctx) => rowAvailable(row, ctx.fin),
        titleNote: titleNote ?? ((ctx) => `· ${ctx.frame.time.toFixed(0)} Myr`),
        begin: async (W, opts, ctx, progress) => {
            let fin = ctx.fin;
            // (wider than the picture: drawn with the detail finer than the mesh — fine(), detail-view.js — not merely
            // enlarged; in bands, a band's at a time: bands.draw)
            if (fine && W > fin.raster.w && fin.raster.drivers && !opts.bands) {
                const data = await fine(fin, ctx.seed, W, p => progress?.(0, `Adding the detail finer than the mesh… ${Math.round(100 * p)} %`));
                fin = { ...fin, fine: { W, ...data } };
            }
            return { W, look: { ...look(), shaded: opts.hillshade, centerLon: opts.centerLon, frame: ctx.frame, seed: ctx.seed, cloudSeed: ctx.cloudSeed ?? 0 }, fin, memo: new Map() };
        },
        // (wider than EXPORT_MAX: a band of rows at a time — export-panel.js runBands)
        bands: fine ? {
            rows: bandRows,
            draw: (rctx, y0, n) => drawBand((f, s, win) => fine(f, s, win.W, null, win), rctx.fin, rctx.look.seed, rctx.W, y0, n),
            produce: (rctx, job, band) => (produceOwnBand && produceOwnBand(rctx, job, band)) || produceBand(rctx.fin, rctx.W, rctx.look, job, band, rctx.memo),
        } : null,
        end: async () => {},
        names: names ?? ((ctx, opts) => { const c = Math.round(opts.centerLon || 0); return { start: ['orogen-evolution', ctx.seed, `${Math.round(ctx.frame.time)}Myr`], end: [c ? `c${Math.abs(c)}${c > 0 ? 'E' : 'W'}` : null] }; }),
        about: (ctx, opts) => ({ ...(about ? about(ctx, opts) : { page: 'Evolution', planet: `seed ${ctx.seed}, the moment at ${Math.round(ctx.frame.time)} Myr`, link: location.href }),
            sizeNote: sizeNote(ctx, opts), notes: ctx.fin.raster?.farming ? [farmingNote()] : [] }),
        produce: async (rctx, job) => (produceOwn && await produceOwn(rctx, job)) || produceMap(rctx.fin, rctx.W, rctx.look, job),
    };
    return initExportPanel({ host: document.getElementById('exportCard'), overlay: document.getElementById('exportOverlay'), catalogue, adapter, onOpen: moment, getCenterLon: centerLon, getProjection: projection });
}
