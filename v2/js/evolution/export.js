// The export of a finished moment (plans/V2_FULL_PLANET_PLAN.md step C; the developer's decisions, 2026-10-01: finished
// moments only; a 16-bit heightmap with the sea floor on a fixed −11…+9 km scale — the same shade the same height on every
// planet — and a land heightmap 0…+9 km, the sea black; rivers drawn on the colour map as on screen, and a transparent
// rivers-and-lakes layer; Export All as one ZIP). The climate's maps too — the Satellite view for the year, January and
// July, and the Köppen zones — as Generate exports them. Each map is the finished picture (finish.js finishRaster) at any
// width: its own, averaged down, or enlarged for use downstream (developer, 2026-10-17: "allow the different sizes even if
// it enlarges the pixels … some smart interpolation"): heights by a clamped bicubic, coasts, lakes and climate zones by the
// weighted majority of the nearest pixels, satellite colours blended — then painted at the full width, so the hillshade,
// the coasts and the rivers' lines stay sharp. And the geology's (geology-export.js): the rocks, the deposits and each
// age's map, a mask per resource, the districts as GeoJSON and CSV, a resource atlas in words.

import { paintFinished, riverPaths, drawRivers, rasterAt, lakeColor } from './finish-view.js';
import { finishedClimateColor } from './climate-view.js';
import { KOPPEN_CLASSES } from '../climate/koppen.js';
import { encodeGrayPng, encodeRgbPng, canvasOf, canvasPng } from '../view/png.js';
import { zipFiles } from '../view/zip.js';
import { geologyMap, resourceMasks, districtRows, districtsGeoJson, districtsCsv, resourceAtlas, textBlob } from './geology-export.js';
import { AGES } from '../geology/ages.js';

export const EXPORT_TYPES = [
    { id: 'color', label: 'Colour Map (as shown)' },
    { id: 'satellite-year', label: 'Satellite (the year)', needs: 'satellite' },
    { id: 'satellite-jan', label: 'Satellite (January)', needs: 'satellite' },
    { id: 'satellite-jul', label: 'Satellite (July)', needs: 'satellite' },
    { id: 'koppen', label: 'Climate Zones (Köppen)', needs: 'climate' },
    { id: 'heightmap', label: 'Heightmap with Sea Floor (16-bit)' },
    { id: 'landheightmap', label: 'Land Heightmap (16-bit)' },
    { id: 'landmask', label: 'Land Mask' },
    { id: 'rivers', label: 'Rivers & Lakes (transparent)' },
    { id: 'rocks', label: 'Rocks', needs: 'geology' },
    { id: 'deposits', label: 'Deposits (as shown)', needs: 'deposits' },
    ...AGES.map(a => ({ id: `age-${a.id}`, label: `${a.name} map`, needs: 'deposits' })),
    { id: 'masks', label: 'Resource masks (greyscale, ZIP)', needs: 'deposits', ext: 'zip' },
    { id: 'districts-geojson', label: 'Districts (GeoJSON)', needs: 'deposits', ext: 'geojson' },
    { id: 'districts-csv', label: 'Districts (CSV)', needs: 'deposits', ext: 'csv' },
    { id: 'atlas', label: 'Resource atlas (text)', needs: 'deposits', ext: 'md' },
];
/** What Export All puts in its ZIP: every kind of map once (the Satellite view for the year). */
export const EXPORT_ALL = ['color', 'satellite-year', 'koppen', 'heightmap', 'landheightmap', 'landmask', 'rivers', 'rocks', 'deposits', ...AGES.map(a => `age-${a.id}`), 'masks', 'districts-geojson', 'districts-csv', 'atlas'];
/** A type's file extension. */
export const exportExt = type => EXPORT_TYPES.find(t => t.id === type)?.ext ?? 'png';
/** The heightmap's scale: black −11 km (below the deepest trench), white +9 km (above the highest peak), linear. */
export const HEIGHT_RANGE_M = [-11000, 9000];
/** The land heightmap's: the sea black (0), land from 0 m (1) to +9 km (65535), linear. */
export const LAND_TOP_M = 9000;
/** The widest export: 16384 px (a picture of 134 million pixels); on a phone 4096. */
export const EXPORT_MAX = 16384, EXPORT_MAX_TOUCH = 4096;
const KOPPEN_RGB = KOPPEN_CLASSES.map(k => k.color.map(v => Math.round(255 * v)));

/** The maps a finished moment can give: the climate's only where it has its climate (and Satellite its colours), the
 *  geology's where it has its rocks and deposits. */
export function exportTypes(fin) {
    const R = fin.climate?.raster, G = fin.raster.geology;
    const has = { climate: !!R?.koppen, satellite: !!R?.sat, geology: !!G?.rock, deposits: !!G?.deposits?.land };
    return EXPORT_TYPES.filter(t => !t.needs || has[t.needs]);
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

/** A file's name: the planet's seed, the moment and the map — `orogen-evolution-12345-760Myr-heightmap.png`. */
export function exportFileName(seed, timeMyr, type, ext = 'png') {
    return `orogen-evolution-${seed}-${Math.round(timeMyr)}Myr${type ? `-${type}` : ''}.${ext}`;
}

/** The 16-bit heightmap, the sea floor included: −11 km black … +9 km white. */
export function heightmap16(r, W) {
    const { h } = rasterAt(r, W), [lo, hi] = HEIGHT_RANGE_M, out = new Uint16Array(h.length);
    for (let i = 0; i < h.length; i++) out[i] = Math.round(65535 * Math.min(1, Math.max(0, (1000 * h[i] - lo) / (hi - lo))));
    return out;
}

/** The 16-bit land heightmap: the sea black, land 0…+9 km as 1…65535 (a lake's bed below sea level as 0 m). */
export function landHeightmap16(r, W) {
    const { h, sea } = rasterAt(r, W, { landOnly: true }), out = new Uint16Array(h.length);
    for (let i = 0; i < h.length; i++) out[i] = sea[i] ? 0 : 1 + Math.round(65534 * Math.min(1, Math.max(0, 1000 * h[i] / LAND_TOP_M)));
    return out;
}

/** The land mask: land white (lakes are land), the sea black. */
export function landMask8(r, W) {
    const { sea } = rasterAt(r, W), out = new Uint8Array(sea.length);
    for (let i = 0; i < sea.length; i++) out[i] = sea[i] ? 0 : 255;
    return out;
}

/**
 * The colour map as the Terrain view shows it: the palette's colours hillshaded, the lakes and the rivers (with Rivers &
 * Lakes), no grid. `look`: { lut, exaggeration, water, riverQ, byRegime }.
 */
export async function colorMap(fin, W, look) {
    const H = W >> 1, image = new ImageData(W, H);
    paintFinished(fin.raster, { width: W, image }, look.lut, { exaggeration: look.exaggeration, lakes: look.water });
    if (!(look.water && fin.rivers)) return encodeRgbPng(W, H, image.data);
    const canvas = canvasOf(W, H), ctx = canvas.getContext('2d');
    ctx.putImageData(image, 0, 0);
    // (the rivers' lines are drawn for a 2048-wide picture: as thick, relative to the map, at any width)
    const k = W / 2048;
    ctx.save(); ctx.scale(k, k); drawRivers(ctx, riverPaths(fin, look.riverQ), look.byRegime); ctx.restore();
    return canvasPng(canvas);
}

/** The Satellite view as shown, for the year, January or July: no grid, no glint (and, as on screen, no rivers' lines). */
export async function satelliteMap(fin, W, season, look) {
    const H = W >> 1, image = new ImageData(W, H);
    paintFinished(fin.raster, { width: W, image }, look.lut, { exaggeration: look.exaggeration * 1.25, lakes: true,
        colorAt: finishedClimateColor('satellite', season, fin.climate, W, look.lut, fin) });
    return encodeRgbPng(W, H, image.data);
}

/**
 * The Köppen zones in their own colours, unshaded (a map to use, as Generate exports it): the sea in Ocean's colour, each
 * land pixel its zone — averaged down, the zone most of its block has; enlarged, the zone the nearest four by four pixels
 * weigh most by a cubic B-spline (smooth, positive weights: the zones' stair-stepped borders rounded into curves). Land the
 * climate picture marks as sea (a coast a pixel apart) takes the nearest zone.
 */
export async function koppenMap(fin, W) {
    const r = fin.raster, R = fin.climate.raster, H = W >> 1, { sea } = rasterAt(r, W), rgba = new Uint8ClampedArray(4 * W * H);
    const s = R.w / W, K = Math.max(1, Math.round(s)), votes = new Float32Array(KOPPEN_RGB.length), bx = [0, 0, 0, 0], by = [0, 0, 0, 0];
    const bspline = (t, w) => { const t2 = t * t, t3 = t2 * t, u = 1 - t; w[0] = u * u * u / 6; w[1] = (3 * t3 - 6 * t2 + 4) / 6; w[2] = (-3 * t3 + 3 * t2 + 3 * t + 1) / 6; w[3] = t3 / 6; };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const p = y * W + x, o = 4 * p;
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
        const c = KOPPEN_RGB[z];
        rgba[o] = c[0]; rgba[o + 1] = c[1]; rgba[o + 2] = c[2]; rgba[o + 3] = 255;
    }
    return encodeRgbPng(W, H, rgba);
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
export async function riversMap(fin, W, look) {
    const H = W >> 1, { wat, sea } = rasterAt(fin.raster, W, { lakes: true }), image = new ImageData(W, H), d = image.data;
    if (wat) for (let p = 0; p < W * H; p++) {
        if (!wat[p] || sea[p]) continue;
        const c = lakeColor(look.lut, wat[p]), o = 4 * p;
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
    }
    const canvas = canvasOf(W, H), ctx = canvas.getContext('2d');
    ctx.putImageData(image, 0, 0);
    if (fin.rivers) { const k = W / 2048; ctx.save(); ctx.scale(k, k); drawRivers(ctx, riverPaths(fin, look.riverQ), look.byRegime); ctx.restore(); }
    return canvasPng(canvas);
}

const tick = () => new Promise(res => setTimeout(res, 0));          // (the progress shows before the work)

/**
 * One map of a finished moment as a PNG (or the geology's files: the masks a ZIP, the districts GeoJSON or CSV, the atlas
 * text). `look` carries the view's choices — and for the geology the moment's record (`frame`) and the seed.
 * `onProgress(share, label)`.
 * @returns {Promise<Blob>}
 */
export async function exportMap(type, fin, W, look, onProgress = () => {}) {
    const r = fin.raster, H = W >> 1;
    onProgress(0.05, W > r.w ? `Drawing (enlarged from ${r.w} px)…` : 'Drawing…');
    await tick();
    if (type === 'color') return colorMap(fin, W, look);
    if (type === 'rocks') return geologyMap(fin, W, 'geoRocks', look);
    if (type === 'deposits') return geologyMap(fin, W, 'geoDeposits', look, { pick: look.deposit ?? 'all' });
    if (type.startsWith('age-')) return geologyMap(fin, W, 'geoAges', look, { age: type.slice(4), agePick: 'all' });
    if (type === 'masks') return zipFiles(await resourceMasks(fin, W, onProgress));
    if (type === 'districts-geojson') return textBlob(districtsGeoJson(districtRows(fin, look.frame)), 'application/geo+json');
    if (type === 'districts-csv') return textBlob(districtsCsv(districtRows(fin, look.frame)), 'text/csv');
    if (type === 'atlas') return textBlob(resourceAtlas(fin, look.frame, { seed: look.seed }), 'text/markdown');
    if (type.startsWith('satellite-')) return satelliteMap(fin, W, type.slice(10), look);
    if (type === 'koppen') return koppenMap(fin, W);
    if (type === 'rivers') return riversMap(fin, W, look);
    const data = type === 'heightmap' ? heightmap16(r, W) : type === 'landheightmap' ? landHeightmap16(r, W) : type === 'landmask' ? landMask8(r, W) : null;
    if (!data) throw new Error(`no such map: ${type}`);
    onProgress(0.5, 'Encoding PNG…');
    await tick();
    return encodeGrayPng(W, H, data, type === 'landmask' ? 8 : 16);
}

/**
 * Export All: every kind of map the moment has (EXPORT_ALL), at width W, in one ZIP — `names(type)` each file's name.
 * @returns {Promise<Blob>}
 */
export async function exportAll(fin, W, look, names, onProgress = () => {}) {
    const have = new Set(exportTypes(fin).map(t => t.id)), types = EXPORT_ALL.filter(t => have.has(t)), files = [];
    for (let i = 0; i < types.length; i++) {
        const label = EXPORT_TYPES.find(t => t.id === types[i]).label, progress = p => onProgress((i + 0.9 * p) / (types.length + 1), `${label} (${i + 1} of ${types.length})…`);
        // (the masks in a folder of their own)
        if (types[i] === 'masks') { for (const f of await resourceMasks(fin, W, progress)) files.push({ name: `masks/${f.name}`, blob: f.blob }); continue; }
        files.push({ name: names(types[i]), blob: await exportMap(types[i], fin, W, look, progress) });
        await tick();
    }
    onProgress(types.length / (types.length + 1), 'Packing the ZIP…');
    await tick();
    return zipFiles(files);
}
