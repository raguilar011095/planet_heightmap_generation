// The export of a finished moment (plans/V2_FULL_PLANET_PLAN.md step C; the developer's decisions, 2026-10-01: finished
// moments only; a 16-bit heightmap with the sea floor on a fixed −11…+9 km scale — the same shade the same height on every
// planet — and a land heightmap 0…+9 km, the sea black; rivers drawn on the colour map as on screen, and a transparent
// rivers-and-lakes layer). Since the fast follows of 2026-10 the export is the shared panel (v2/js/view/export-panel.js):
// every map as Colour and / or Data — the climate's layers too, through climate-view.js's samplers — in a projection
// (projections.js), one file or a ZIP with a README. Each map is the finished picture (finish.js finishRaster) at any
// width: its own, averaged down, or enlarged for use downstream (developer, 2026-10-17: "allow the different sizes even if
// it enlarges the pixels … some smart interpolation"): heights by a clamped bicubic, coasts, lakes and climate zones by the
// weighted majority of the nearest pixels, satellite colours blended — then painted at the full width, so the hillshade,
// the coasts and the rivers' lines stay sharp.

import { paintFinished, riverPaths, drawRivers, rasterAt, lakeColor } from './finish-view.js';
import { finishedClimateColor, finishedClimateValue } from './climate-view.js';
import { KOPPEN_CLASSES } from '../climate/koppen.js';
import { canvasOf } from '../view/png.js';
import { initExportPanel } from '../view/export-panel.js';
import { DATA_SCALES as SC, scaled, hillshade8, climateRows } from '../view/export-raster.js';

/** The heightmap's scale: black −11 km (below the deepest trench), white +9 km (above the highest peak), linear. */
export const HEIGHT_RANGE_M = [-11000, 9000];
/** The land heightmap's: the sea black (0), land from 0 m (1) to +9 km (65535), linear. */
export const LAND_TOP_M = 9000;
/** The widest export: 16384 px (a picture of 134 million pixels); on a phone 4096. */
export const EXPORT_MAX = 16384, EXPORT_MAX_TOUCH = 4096;
const KOPPEN_RGB = KOPPEN_CLASSES.map(k => k.color.map(v => Math.round(255 * v)));

/** The catalogue of a moment's maps (the panel's rows): as Colour, as Data, or both. */
export const CATALOGUE = [
    { id: 'maps', label: 'Maps', rows: [
        { id: 'color', label: 'Colour Map', colour: true, tip: 'The Terrain view as shown, in your Terrain Colours, with rivers and lakes if Rivers &amp; Lakes is on' },
        { id: 'satellite', label: 'Satellite', colour: true, seasonal: true, needs: 'satellite', tip: 'The Satellite view for the year, January or July' },
        { id: 'koppen', label: 'Climate zones (Köppen)', colour: true, needs: 'climate', data: [{ key: 'koppenIndex', suffix: 'index', label: 'Köppen class index', scale: SC.koppenIndex, bits: 8 }], tip: 'The Köppen zones in their own colours, unshaded; as data, each class\'s index (the README lists them)' },
        { id: 'rivers', label: 'Rivers &amp; Lakes', colour: true, needs: 'rivers', tip: 'The rivers and lakes alone on a transparent ground, to lay over another map' },
    ] },
    { id: 'elevation', label: 'Elevation', rows: [
        { id: 'heightmap', label: 'Heightmap with sea floor', data: [{ key: 'heightmap', suffix: '', label: 'Heightmap with sea floor', scale: { unit: 'km (sea level at 55 %)', lo: -11, hi: 9 }, bits: 16 }], tip: '16-bit greyscale, the same scale on every planet: black −11 km, white +9 km (sea level at 55 %)' },
        { id: 'landheightmap', label: 'Land heightmap', data: [{ key: 'landheightmap', suffix: '', label: 'Land heightmap', scale: { unit: 'km above sea level (the sea 0; land from 1)', lo: 0, hi: 9 }, bits: 16 }], tip: '16-bit: the sea black and land from 0 to +9 km (re-imports on the Import Heightmap page, which reads white as 6 km)' },
        { id: 'landmask', label: 'Land mask', data: [{ key: 'landmask', suffix: '', label: 'Land mask', scale: SC.landmask, bits: 8 }], tip: 'Land white (lakes are land), the sea black' },
        { id: 'hillshade', label: 'Hillshade', data: [{ key: 'hillshade', suffix: '', label: 'Hillshade', scale: SC.hillshade, bits: 8 }], tip: 'The relief shading as shown (the view strip\'s Shading, its strength and light), on its own — to lay over a flat colour map' },
    ] },
    { id: 'climate', label: 'Climate', rows: climateRows('climate') },
];
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


/** The 16-bit heightmap, the sea floor included: −11 km black … +9 km white. */
export function heightmap16(r, W, centerLon = 0) {
    const { h } = rasterAt(r, W), [lo, hi] = HEIGHT_RANGE_M, out = new Uint16Array(h.length);
    for (let i = 0; i < h.length; i++) out[i] = Math.round(65535 * Math.min(1, Math.max(0, (1000 * h[i] - lo) / (hi - lo))));
    return rollRows(out, W, W >> 1, 1, rollShift(W, centerLon));
}

/** The 16-bit land heightmap: the sea black, land 0…+9 km as 1…65535 (a lake's bed below sea level as 0 m). */
export function landHeightmap16(r, W, centerLon = 0) {
    const { h, sea } = rasterAt(r, W, { landOnly: true }), out = new Uint16Array(h.length);
    for (let i = 0; i < h.length; i++) out[i] = sea[i] ? 0 : 1 + Math.round(65534 * Math.min(1, Math.max(0, 1000 * h[i] / LAND_TOP_M)));
    return rollRows(out, W, W >> 1, 1, rollShift(W, centerLon));
}

/** The land mask: land white (lakes are land), the sea black. */
export function landMask8(r, W, centerLon = 0) {
    const { sea } = rasterAt(r, W), out = new Uint8Array(sea.length);
    for (let i = 0; i < sea.length; i++) out[i] = sea[i] ? 0 : 255;
    return rollRows(out, W, W >> 1, 1, rollShift(W, centerLon));
}

/**
 * The colour map as the Terrain view shows it: the palette's colours hillshaded, the lakes and the rivers (with Rivers &
 * Lakes), no grid. `look`: { lut, shading (the page's: exaggeration, style, azimuthDeg), exaggeration, water, riverQ,
 * byRegime, shaded (the hillshade; default on), centerLon }.
 */
export function colorMap(fin, W, look) {
    const H = W >> 1, image = new ImageData(W, H), shift = rollShift(W, look.centerLon);
    paintFinished(fin.raster, { width: W, image }, look.lut, { exaggeration: look.exaggeration, shading: look.shading, lakes: look.water, shaded: look.shaded !== false });
    const rgba = rollRows(image.data, W, H, 4, shift);
    if (!(look.water && fin.rivers)) return { kind: 'rgba', W, H, data: rgba };
    const canvas = canvasOf(W, H), ctx = canvas.getContext('2d');
    ctx.putImageData(shift ? new ImageData(rgba, W, H) : image, 0, 0);
    // (the rivers' lines are drawn for a 2048-wide picture: as thick, relative to the map, at any width)
    drawRiversRolled(ctx, W, W / 2048, shift, fin, look);
    return { kind: 'rgba', W, H, data: ctx.getImageData(0, 0, W, H).data };
}

/** The Satellite view as shown, for the year, January or July: no grid, no glint (and, as on screen, no rivers' lines). */
export function satelliteMap(fin, W, season, look) {
    const H = W >> 1, image = new ImageData(W, H);
    paintFinished(fin.raster, { width: W, image }, look.lut, { shading: { ...look.shading, exaggeration: look.exaggeration * 1.25 }, lakes: true, shaded: look.shaded !== false,
        colorAt: finishedClimateColor('satellite', season, fin.climate, W, look.lut, fin) });
    return { kind: 'rgba', W, H, data: rollRows(image.data, W, H, 4, rollShift(W, look.centerLon)) };
}

/**
 * The Köppen zones in their own colours, unshaded (a map to use, as Generate exports it): the sea in Ocean's colour, each
 * land pixel its zone — averaged down, the zone most of its block has; enlarged, the zone the nearest four by four pixels
 * weigh most by a cubic B-spline (smooth, positive weights: the zones' stair-stepped borders rounded into curves). Land the
 * climate picture marks as sea (a coast a pixel apart) takes the nearest zone.
 */
export function koppenIndexMap(fin, W, centerLon = 0) {
    const r = fin.raster, R = fin.climate.raster, H = W >> 1, { sea } = rasterAt(r, W), out = new Uint8Array(W * H);
    const s = R.w / W, K = Math.max(1, Math.round(s)), votes = new Float32Array(KOPPEN_RGB.length), bx = [0, 0, 0, 0], by = [0, 0, 0, 0];
    const bspline = (t, w) => { const t2 = t * t, t3 = t2 * t, u = 1 - t; w[0] = u * u * u / 6; w[1] = (3 * t3 - 6 * t2 + 4) / 6; w[2] = (-3 * t3 + 3 * t2 + 3 * t + 1) / 6; w[3] = t3 / 6; };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const p = y * W + x;
        let z = 0;
        if (!sea[p]) {
            votes.fill(0);
            if (s >= 1) {
                for (let dy = 0; dy < K; dy++) for (let dx = 0; dx < K; dx++) votes[R.koppen[Math.min(R.h - 1, y * K + dy) * R.w + Math.min(R.w - 1, x * K + dx)]]++;
            } else {
                const u = (x + 0.5) * s - 0.5, v = (y + 0.5) * s - 0.5, x0 = Math.floor(u), y0 = Math.floor(v);
                bspline(u - x0, bx); bspline(v - y0, by);
                for (let j = 0; j < 4; j++) {
                    const row = Math.min(R.h - 1, Math.max(0, y0 - 1 + j)) * R.w;
                    for (let i = 0; i < 4; i++) votes[R.koppen[row + ((x0 - 1 + i) % R.w + R.w) % R.w]] += bx[i] * by[j];
                }
            }
            for (let c = 1; c < votes.length; c++) if (votes[c] > votes[z]) z = c;
            if (!z) z = nearestZone(R, Math.min(R.w - 1, Math.floor((x + 0.5) * s)), Math.min(R.h - 1, Math.floor((y + 0.5) * s)));
        }
        out[p] = z;
    }
    return rollRows(out, W, H, 1, rollShift(W, centerLon));
}
/** The Köppen zones in their colours (the sea in Ocean's colour), from the index map. */
export function koppenMap(fin, W, centerLon = 0) {
    const idx = koppenIndexMap(fin, W, centerLon), H = W >> 1, rgba = new Uint8ClampedArray(4 * W * H);
    for (let p = 0; p < W * H; p++) { const c = KOPPEN_RGB[idx[p]], o = 4 * p; rgba[o] = c[0]; rgba[o + 1] = c[1]; rgba[o + 2] = c[2]; rgba[o + 3] = 255; }
    return { kind: 'rgba', W, H, data: rgba };
}
/** The nearest land zone to a climate-picture pixel (a ring at a time, up to 3 pixels out), or 0. */
function nearestZone(R, cx, cy) {
    for (let d = 1; d <= 3; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
        const yy = cy + dy;
        if (yy < 0 || yy >= R.h) continue;
        const z = R.koppen[yy * R.w + ((cx + dx) % R.w + R.w) % R.w];
        if (z) return z;
    }
    return 0;
}

/**
 * The rivers and lakes alone, on a transparent ground — to lay over another map: the lakes in the Terrain view's colours,
 * the rivers drawn as the Terrain view draws them (the density and the colouring chosen there).
 */
export function riversMap(fin, W, look) {
    const H = W >> 1, { wat, sea } = rasterAt(fin.raster, W, { lakes: true }), image = new ImageData(W, H), d = image.data, shift = rollShift(W, look.centerLon);
    if (wat) for (let p = 0; p < W * H; p++) {
        if (!wat[p] || sea[p]) continue;
        const c = lakeColor(look.lut, wat[p]), o = 4 * p;
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
    }
    const canvas = canvasOf(W, H), ctx = canvas.getContext('2d');
    ctx.putImageData(shift ? new ImageData(rollRows(d, W, H, 4, shift), W, H) : image, 0, 0);
    if (fin.rivers) drawRiversRolled(ctx, W, W / 2048, shift, fin, look);
    return { kind: 'rgba', W, H, data: ctx.getImageData(0, 0, W, H).data, alpha: true };
}


/** A climate layer as shown (climate-view.js finishedClimateColor), shaded or flat, the lakes as the Terrain view has them. */
export function climateMap(fin, W, layer, season, look) {
    const H = W >> 1, image = new ImageData(W, H);
    paintFinished(fin.raster, { width: W, image }, look.lut, { exaggeration: look.exaggeration, shading: look.shading, lakes: look.water, shaded: look.shaded !== false,
        colorAt: finishedClimateColor(layer, season, fin.climate, W, look.lut, fin) });
    return { kind: 'rgba', W, H, data: rollRows(image.data, W, H, 4, rollShift(W, look.centerLon)) };
}
/** A climate quantity as numbers (climate-view.js finishedClimateValue), 16-bit on its scale. */
export function valueMap(fin, W, key, season, scale, centerLon = 0) {
    const H = W >> 1, { sea } = rasterAt(fin.raster, W), at = finishedClimateValue(key, season, fin.climate, W), out = new Uint16Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const p = y * W + x; out[p] = Math.round(65535 * scaled(at(x, y, !!sea[p]), scale)); }
    return { kind: 'gray16', W, H, data: rollRows(out, W, H, 1, rollShift(W, centerLon)) };
}
/** The relief shading of the moment's heights as shown, 8-bit (`shading`: the look's {exaggeration, style, azimuthDeg}). */
export function hillshadeMap(fin, W, shading, centerLon = 0) {
    const H = W >> 1, { h, sea } = rasterAt(fin.raster, W);
    return { kind: 'gray8', W, H, data: rollRows(hillshade8(h, W, H, shading, sea), W, H, 1, rollShift(W, centerLon)) };
}

/**
 * One map of a finished moment, W wide, as the panel asks for it: `job` {row (a CATALOGUE row), variant ('colour' or
 * 'data'), file (one of the row's data files), season}; `lk` the look ({lut, shading, exaggeration, water, riverQ,
 * byRegime, shaded, centerLon}). (v2/tools/check-save.mjs draws every one from each saved planet it keeps.)
 */
export function produceMap(fin, W, lk, job) {
    const s = job.season || 'year', id = job.row.id, c = lk.centerLon;
    if (job.variant === 'colour') {
        if (id === 'color') return colorMap(fin, W, lk);
        if (id === 'satellite') return satelliteMap(fin, W, s, lk);
        if (id === 'koppen') return koppenMap(fin, W, c);
        if (id === 'rivers') return riversMap(fin, W, lk);
        return climateMap(fin, W, CLIMATE_LAYER_OF[id] || id, s, lk);
    }
    const key = job.file.key, H = W >> 1;
    if (key === 'heightmap') return { kind: 'gray16', W, H, data: heightmap16(fin.raster, W, c) };
    if (key === 'landheightmap') return { kind: 'gray16', W, H, data: landHeightmap16(fin.raster, W, c) };
    if (key === 'landmask') return { kind: 'gray8', W, H, data: landMask8(fin.raster, W, c) };
    if (key === 'hillshade') return hillshadeMap(fin, W, lk.shading ?? { exaggeration: lk.exaggeration }, c);
    if (key === 'koppenIndex') return { kind: 'gray8', W, H, data: koppenIndexMap(fin, W, c) };
    return valueMap(fin, W, key, s, job.file.scale, c);
}

/**
 * Wire the export panel on the Evolution page. `moment()`: the moment the dialog opens for ({ frame, fin, seed }) or null;
 * `look()`: the Terrain view's look ({ lut, shading, exaggeration, water, riverQ, byRegime }); `centerLon()`: the map view's;
 * `planetFile`: the page's planet file ({ status, save }: export-panel.js), offered beside the maps.
 */
export function initEvolutionExport({ moment, look, centerLon, projection = null, isTouch, planetFile = null }) {
    const adapter = {
        page: 'evolution',
        options: { hillshade: true },
        planetFile,
        koppenClasses: KOPPEN_CLASSES,
        widths: (ctx) => exportWidths(ctx.fin.raster, isTouch ? EXPORT_MAX_TOUCH : EXPORT_MAX).map(({ w, enlarged }) => ({ w, selected: w === ctx.fin.raster.w, label: `${w}${enlarged ? ` · enlarged ×${w / ctx.fin.raster.w}` : w === ctx.fin.raster.w ? ' · as detailed' : ''}` })),
        available: (row, ctx) => (row.needs === 'climate' ? !!ctx.fin.climate?.raster?.koppen : row.needs === 'satellite' ? !!ctx.fin.climate?.raster?.sat : row.needs === 'rivers' ? !!ctx.fin.rivers : true),
        titleNote: (ctx) => `· ${ctx.frame.time.toFixed(0)} Myr`,
        begin: async (W, opts, ctx) => ({ W, look: { ...look(), shaded: opts.hillshade, centerLon: opts.centerLon }, fin: ctx.fin }),
        end: async () => {},
        names: (ctx, opts) => { const c = Math.round(opts.centerLon || 0); return { start: ['orogen-evolution', ctx.seed, `${Math.round(ctx.frame.time)}Myr`], end: [c ? `c${Math.abs(c)}${c > 0 ? 'E' : 'W'}` : null] }; },
        about: (ctx, opts) => ({ page: 'Evolution', planet: `seed ${ctx.seed}, the moment at ${Math.round(ctx.frame.time)} Myr`, link: location.href,
            sizeNote: opts.width > ctx.fin.raster.w ? `enlarged from the ${ctx.fin.raster.w} px the moment was detailed at` : opts.width < ctx.fin.raster.w ? `averaged down from ${ctx.fin.raster.w} px` : 'the width the moment was detailed at' }),
        produce: async (rctx, job) => produceMap(rctx.fin, rctx.W, rctx.look, job),
    };
    return initExportPanel({ host: document.getElementById('exportCard'), overlay: document.getElementById('exportOverlay'), catalogue: CATALOGUE, adapter, onOpen: moment, getCenterLon: centerLon, getProjection: projection });
}
