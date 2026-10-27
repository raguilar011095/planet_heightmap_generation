// The Geology tab (plans/V2_GEOLOGY_PLAN.md): finished moments only, drawn per pixel of the finished picture over its
// hillshade. G1 shows the history's geological record (tectonics/step/geology.js) as Madeline James's first two maps —
// the mountain belts, active, worn and long gone, and the past shallow seas — and two views of the rock column beneath:
// the sediment on top and its make-up, and how deep erosion has cut into the basement (the grade of rock it bares).
// The records are per sim cell, read on each pixel where the finished terrain read them (the finish hands over each
// pixel's record cell: terrain/synthesize.js recCell) — so a belt lies on its mountains and a sea's edge interfingers as
// the land does; the Sediment and Erosion depth views show the cover where the Rocks view has it and the basement where
// valleys and high ground have bared it. (A moment detailed before that: the record carried smoothly, as before.)

import { CrustType, OrogenyType, VolcanicType } from '../tectonics/model/crust.js';
import { GeoFlag, decodeCoverKm, decodeExhumKm, decodeFloodMyr, decodeFloodAge, decodeArcMyr, decodeFacies } from '../tectonics/model/geology.js';
import { locate } from '../core/mesh-locate.js';
import { FastNoise } from '../core/fast-noise.js';
import { Rock, ROCK_INFO, ROCK_COUNT, EARTH_FAMILIES } from '../geology/rocks.js';
import { KOPPEN_ID } from '../climate/koppen.js';
import { GEOLOGY } from '../geology/geology-config.js';

export const GEOLOGY_LAYERS = new Set(['geoRocks', 'geoBelts', 'geoSeas', 'geoCover', 'geoWear']);
export const GEOLOGY_NAMES = { geoRocks: 'Rocks', geoBelts: 'Mountain belts', geoSeas: 'Past seas', geoCover: 'Sediment', geoWear: 'Erosion depth' };

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, t, out) => { for (let i = 0; i < 3; i++) out[i] = a[i] + (b[i] - a[i]) * t; return out; };
const shadeK = kk => 0.45 + 0.55 * (kk - 0.35) / 0.65;          // (the light, as the climate layers take it)
const css = c => `rgb(${c.map(Math.round).join(',')})`;
const SEA = [24, 34, 62], LAKE = [44, 62, 100], LAND = [216, 208, 190];

// ── the colours of each view, per sim cell ──
// Mountain belts: by how long ago the belt was last active — red while active, orange while its range still stands,
// tan as it wears down, a muted violet once long gone (Madeline's active · inactive · past), grey-violet for the belts
// of the world's prehistory; shields (cratons with no belt) a dusty rose
const BELT_STOPS = [[0, [198, 40, 40]], [10, [214, 72, 44]], [60, [232, 142, 62]], [200, [208, 174, 122]], [500, [164, 136, 172]]];
const ANCIENT = [138, 122, 156], SHIELD = [198, 172, 166];
export const ACTIVE_BELT_MYR = 10;
function beltColour(age, out) {
    if (age >= BELT_STOPS.at(-1)[0]) { for (let i = 0; i < 3; i++) out[i] = BELT_STOPS.at(-1)[1][i]; return out; }
    for (let i = 1; i < BELT_STOPS.length; i++) {
        const [t1, c1] = BELT_STOPS[i], [t0, c0] = BELT_STOPS[i - 1];
        if (age <= t1) return mix(c0, c1, (age - t0) / (t1 - t0), out);
    }
    return out;
}
// Past seas: blue where the crust has lain under shallow sea — turquoise if lately, a deeper blue long ago, fading as it
// gets older still — stronger the longer it lay there
const SEA_NOW = [64, 176, 204], SEA_OLD = [62, 104, 178], SEA_ANCIENT = [138, 150, 182];
// Sediment: the make-up of the cover's top (sand and mud, limestone, salt, coal, black mud), paler where thin; bare
// basement a slate grey
const CLASTIC = [226, 186, 112], CARB = [86, 156, 226], SALT = [240, 178, 214], COAL = [52, 46, 44], ORGANIC = [62, 84, 56], BARE = [124, 114, 128], THIN = [236, 228, 212];
// Erosion depth: the basement's grade by how deep the rock now at the surface once lay (G2 makes rocks of it)
export const WEAR_BANDS = [[0, [232, 226, 184], 'Barely worn: unaltered rock'], [5, [186, 212, 150], '5 km: slate'], [12, [114, 178, 122], '12 km: schist'],
    [20, [62, 134, 112], '20 km: gneiss'], [30, [40, 84, 96], '30 km+: the crust’s deep roots']];
function wearColour(km, out) {
    if (km >= WEAR_BANDS.at(-1)[0]) { for (let i = 0; i < 3; i++) out[i] = WEAR_BANDS.at(-1)[1][i]; return out; }
    for (let i = 1; i < WEAR_BANDS.length; i++) if (km <= WEAR_BANDS[i][0]) return mix(WEAR_BANDS[i - 1][1], WEAR_BANDS[i][1], (km - WEAR_BANDS[i - 1][0]) / (WEAR_BANDS[i][0] - WEAR_BANDS[i - 1][0]), out);
    return out;
}

/** One sim cell's colour in a view (land only: the sea is drawn from the finished picture's own sea); `bared`: where the
 *  rocks show the basement (the Sediment view's bare ground, the Erosion depth view undimmed), false where they show cover. */
function cellColour(layer, f, w, out, fac, bared = null) {
    for (let i = 0; i < 3; i++) out[i] = LAND[i];
    if (f.owner[w] < 0 || f.type[w] === CrustType.OCEAN) return out;
    if (layer === 'geoBelts') {
        const belt = f.oroType[w];
        if (belt) {
            if (f.oroLast[w] < 0) { for (let i = 0; i < 3; i++) out[i] = ANCIENT[i]; return out; }
            return beltColour(f.time - f.oroLast[w], out);
        }
        if (f.type[w] === CrustType.CRATON) for (let i = 0; i < 3; i++) out[i] = SHIELD[i];
        return out;
    }
    if (layer === 'geoSeas') {
        const myr = decodeFloodMyr(f.floodMyr[w]), ago = decodeFloodAge(f.floodAge[w]);
        if (!f.floodAge[w]) return out;
        const tint = ago <= 60 ? mix(SEA_NOW, SEA_OLD, ago / 60, [0, 0, 0]) : mix(SEA_OLD, SEA_ANCIENT, smooth(60, 600, ago), [0, 0, 0]);
        // (fainter where the basement is bared: the sea's sediments are gone there)
        return mix(LAND, tint, (0.35 + 0.65 * smooth(0, 60, myr)) * (bared === true ? 0.45 : 1), out);
    }
    if (layer === 'geoCover') {
        const km = decodeCoverKm(f.coverKm[w]);
        if (bared === true || (bared === null && km < 0.02)) { for (let i = 0; i < 3; i++) out[i] = BARE[i]; return out; }
        decodeFacies(f.facies[w], fac);
        // (the kind that dominates — sand and mud, limestone or salt, blended only where they are close: a mix of tan and
        // blue reads as mud-grey — then darkened by the coal and the black shale in it)
        const rest = Math.max(0, 1 - fac.carb - fac.salt - fac.coal - fac.organic), a = rest ** 3, b = fac.carb ** 3, s = (1.6 * fac.salt) ** 3, sum = a + b + s || 1;
        for (let i = 0; i < 3; i++) out[i] = (a * CLASTIC[i] + b * CARB[i] + s * SALT[i]) / sum;
        mix(out, COAL, Math.min(0.8, 2 * fac.coal), out);
        mix(out, ORGANIC, Math.min(0.6, 1.2 * fac.organic), out);
        // (thin cover pale over the basement, thick cover full)
        return mix(THIN, out, 0.4 + 0.6 * smooth(0.02, 3, km), out);
    }
    // geoWear: the basement's grade; where sediment still hides it, dimmed toward the cover's tan
    wearColour(decodeExhumKm(f.exhumKm[w]), out);
    const cover = decodeCoverKm(f.coverKm[w]);
    if (bared === true) return out;
    if (bared === false) return mix(out, [200, 182, 150], 0.25 + 0.3 * smooth(0.1, 1.5, cover), out);
    return cover > 0.1 ? mix(out, [200, 182, 150], 0.55 * smooth(0.1, 1.5, cover), out) : out;
}

// ── the picture of a view: per sim cell, carried onto a lat-lon grid smoothly, kept per moment and view ──
const pictures = new Map();
const GRID_W = 1024;
function pictureOf(layer, frame, simMesh) {
    const key = layer;
    let byFrame = pictures.get(frame);
    if (!byFrame) { byFrame = new Map(); pictures.set(frame, byFrame); if (pictures.size > 4) pictures.delete(pictures.keys().next().value); }
    if (byFrame.has(key)) return byFrame.get(key);
    const n = simMesh.numCells, rgb = new Uint8Array(3 * n), c = [0, 0, 0], fac = {};
    for (let w = 0; w < n; w++) { cellColour(layer, frame, w, c, fac); rgb[3 * w] = c[0]; rgb[3 * w + 1] = c[1]; rgb[3 * w + 2] = c[2]; }
    const W = GRID_W, H = W >> 1, grid = new Uint8Array(3 * W * H), C3 = [0, 0, 0], W3 = [0, 0, 0];
    for (let y = 0; y < H; y++) {
        const lat = Math.PI / 2 - (y + 0.5) / H * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
        for (let x = 0; x < W; x++) {
            const lon = (x + 0.5) / W * 2 * Math.PI - Math.PI;
            locate(simMesh, cl * Math.cos(lon), cl * Math.sin(lon), sl, C3, W3);
            const o = 3 * (y * W + x);
            for (let ch = 0; ch < 3; ch++) grid[o + ch] = W3[0] * rgb[3 * C3[0] + ch] + W3[1] * rgb[3 * C3[1] + ch] + W3[2] * rgb[3 * C3[2] + ch];
        }
    }
    const pic = { W, H, grid };
    byFrame.set(key, pic);
    return pic;
}

// ── Rocks (G2): each pixel's kind of rock, from the finish (geology/rocks.js) — the sea floor a shelf's sediment or the deep
// sea's, the ice caps a pale veil over the rock beneath ──
const SHELF = [52, 78, 112], DEEP = [22, 32, 60], ICE = [236, 240, 246];
// ── the rocks' picture (on the climate's: finish.js finishRaster) read at any width ──
const contactNoise = new FastNoise(0x7e0c);
/** The rock picture's pixel under a place (gx, gy: in its pixels): of its four nearest land pixels, one of the kind
 *  their bilinear weights favour — so a contact runs smoothly between its pixels' centres instead of stepping round their
 *  squares (as a category map is enlarged) — read through a small fractal warp (waves ~1.6 and ~0.6 of its pixels, by up
 *  to ~0.45 of one, wrapping east–west), so it wanders as a contact does; land only, so the finer coast's land takes its
 *  nearest land's rock, not a rim of young sediment (none of the four: the nearest land round it) — or −1, none. */
const vote = new Float64Array(ROCK_COUNT), quad = new Int32Array(4), quadW = new Float64Array(4);
function rockPixelAt(G, gx, gy) {
    const th = 2 * Math.PI * gx / G.w, r1 = 0.6 * G.w / (2 * Math.PI), r2 = 1.7 * G.w / (2 * Math.PI), ct = Math.cos(th), st = Math.sin(th), n = contactNoise;
    const u = gx + 0.35 * n.noise3D(r1 * ct, r1 * st, 0.6 * gy + 3.7) + 0.12 * n.noise3D(r2 * ct + 9.1, r2 * st, 1.7 * gy);
    const v = gy + 0.35 * n.noise3D(r1 * ct + 5.2, r1 * st, 0.6 * gy + 1.3) + 0.12 * n.noise3D(r2 * ct, r2 * st + 6.4, 1.7 * gy + 2.9);
    const fx = u - 0.5, fy = Math.min(G.h - 1, Math.max(0, v - 0.5)), x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0;
    for (let k = 0; k < 4; k++) {
        const j = Math.min(G.h - 1, y0 + (k >> 1)) * G.w + (((x0 + (k & 1)) % G.w) + G.w) % G.w;
        quad[k] = j; quadW[k] = ((k & 1) ? ax : 1 - ax) * ((k >> 1) ? ay : 1 - ay);
        vote[G.rock[j]] += quadW[k];
    }
    let kind = 0, top = -1;
    for (let k = 0; k < 4; k++) { const r = G.rock[quad[k]]; if (r && vote[r] > top) { top = vote[r]; kind = r; } }
    for (let k = 0; k < 4; k++) vote[G.rock[quad[k]]] = 0;
    if (kind) {
        // (the pixel shown: the heaviest of the winning kind's — its record cell for the record views, its ice)
        let won = -1, wonW = -1;
        for (let k = 0; k < 4; k++) if (G.rock[quad[k]] === kind && quadW[k] > wonW) { wonW = quadW[k]; won = quad[k]; }
        return won;
    }
    const cx = Math.floor(u), cy = Math.min(G.h - 1, Math.max(0, Math.floor(v)));
    let best = -1, bd = Infinity;
    for (let dy = -1; dy <= 1; dy++) {
        const yy = cy + dy;
        if (yy < 0 || yy >= G.h) continue;
        for (let dx = -1; dx <= 1; dx++) {
            const j = yy * G.w + (((cx + dx) % G.w) + G.w) % G.w;
            if (!G.rock[j]) continue;
            const du = cx + dx + 0.5 - u, dv = yy + 0.5 - v, d = du * du + dv * dv;
            if (d < bd) { bd = d; best = j; }
        }
    }
    return best;
}
/**
 * The rock picture's pixel shown at pixel (x, y) of a picture W wide: at its own width or narrower, the pixel under it
 * (as ever: 0 where it has sea); wider — zoomed in past it, or an export enlarged — rockPixelAt's: contacts wandering
 * below its pixels, the finer coast's land its nearest land's rock (−1: none near).
 */
export function rockPixel(G, W) {
    const s = G.w / W;
    if (s >= 1) return (x, y) => Math.min(G.h - 1, Math.floor((y + 0.5) * s)) * G.w + Math.min(G.w - 1, Math.floor((x + 0.5) * s));
    return (x, y) => rockPixelAt(G, (x + 0.5) * s, (y + 0.5) * s);
}

function rocksColor(fin, W) {
    const G = fin.raster.geology, K = fin.climate?.raster, kef = KOPPEN_ID.EF, pixel = rockPixel(G, W);
    return (out, o, x, y, wet, kk, k3, v, lake) => {
        const k = shadeK(kk);
        if (wet) { const c = v > -0.25 ? SHELF : DEEP; out[o] = c[0] * k; out[o + 1] = c[1] * k; out[o + 2] = c[2] * k; out[o + 3] = 255; return; }
        if (lake === 1 || lake === 2) { out[o] = LAKE[0] * k; out[o + 1] = LAKE[1] * k; out[o + 2] = LAKE[2] * k; out[o + 3] = 255; return; }
        const i = pixel(x, y);
        const rgb = ROCK_INFO[(i >= 0 && G.rock[i]) || Rock.ALLUVIUM].rgb, ice = i >= 0 && K && K.koppen[i] === kef ? 0.72 : 0;
        for (let ch = 0; ch < 3; ch++) out[o + ch] = Math.min(255, (rgb[ch] + (ICE[ch] - rgb[ch]) * ice) * k);
        out[o + 3] = 255;
    };
}

// ── the record views on a finish that hands over each pixel's record cell: per sim cell, the view's colour twice — where
// the rocks there are cover (or young sediment, or a flood basalt's cap on it), and where they are basement — picked per
// pixel by its rock ──
const BASEMENT = new Set([Rock.VOLCANIC, Rock.GRANITE, Rock.SLATE, Rock.GNEISS, Rock.SHIELD, Rock.GREENSTONE, Rock.OPHIOLITE]);
const colourSets = new Map();
function colourSet(layer, frame) {
    let byFrame = colourSets.get(frame);
    if (!byFrame) { byFrame = new Map(); colourSets.set(frame, byFrame); if (colourSets.size > 4) colourSets.delete(colourSets.keys().next().value); }
    if (byFrame.has(layer)) return byFrame.get(layer);
    const n = frame.owner.length, cover = new Uint8Array(3 * n), bare = new Uint8Array(3 * n), c = [0, 0, 0], fac = {};
    const twice = layer !== 'geoBelts';
    for (let w = 0; w < n; w++) {
        cellColour(layer, frame, w, c, fac, twice ? false : null); cover[3 * w] = c[0]; cover[3 * w + 1] = c[1]; cover[3 * w + 2] = c[2];
        if (twice) cellColour(layer, frame, w, c, fac, true);
        bare[3 * w] = c[0]; bare[3 * w + 1] = c[1]; bare[3 * w + 2] = c[2];
    }
    const set = { cover, bare };
    byFrame.set(layer, set);
    return set;
}
function recordColor(layer, frame, fin, W) {
    const G = fin.raster.geology, { cover, bare } = colourSet(layer, frame), pixel = rockPixel(G, W);
    return (out, o, x, y, wet, kk, k3, v, lake) => {
        const k = shadeK(kk);
        if (wet || lake === 1 || lake === 2) { const c = wet ? SEA : LAKE; out[o] = c[0] * k; out[o + 1] = c[1] * k; out[o + 2] = c[2] * k; out[o + 3] = 255; return; }
        const i = pixel(x, y);
        if (i < 0) { out[o] = LAND[0] * k; out[o + 1] = LAND[1] * k; out[o + 2] = LAND[2] * k; out[o + 3] = 255; return; }
        const rgb = BASEMENT.has(G.rock[i]) ? bare : cover, j = 3 * G.rec[i];
        out[o] = Math.min(255, rgb[j] * k); out[o + 1] = Math.min(255, rgb[j + 1] * k); out[o + 2] = Math.min(255, rgb[j + 2] * k); out[o + 3] = 255;
    };
}

/** paintFinished's colorAt for a geology view, on a texture `W` wide (finish-view.js): the view's colours, lit by the
 *  finished relief; the sea dark, lakes a darker blue. */
export function finishedGeologyColor(layer, frame, simMesh, W, fin = null) {
    if (layer === 'geoRocks') return fin?.raster?.geology ? rocksColor(fin, W) : (out, o, x, y, wet, kk) => { const k = shadeK(kk); out[o] = 90 * k; out[o + 1] = 90 * k; out[o + 2] = 96 * k; out[o + 3] = 255; };
    if (fin?.raster?.geology?.rec) return recordColor(layer, frame, fin, W);
    const { W: GW, H: GH, grid } = pictureOf(layer, frame, simMesh), sx = GW / W;
    return (out, o, x, y, wet, kk, k3, v, lake) => {
        const k = shadeK(kk);
        if (wet || lake === 1 || lake === 2) { const s = wet ? SEA : LAKE; out[o] = s[0] * k; out[o + 1] = s[1] * k; out[o + 2] = s[2] * k; out[o + 3] = 255; return; }
        // (bilinear on the grid, wrapping east–west)
        const gx = (x + 0.5) * sx - 0.5, gy = Math.min(GH - 1, Math.max(0, (y + 0.5) * sx - 0.5));
        const x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0, y1 = Math.min(GH - 1, y0 + 1);
        const xa = (x0 + GW) % GW, xb = (x0 + 1) % GW;
        const a = 3 * (y0 * GW + xa), b = 3 * (y0 * GW + xb), c = 3 * (y1 * GW + xa), d = 3 * (y1 * GW + xb);
        for (let ch = 0; ch < 3; ch++) {
            const top = grid[a + ch] + (grid[b + ch] - grid[a + ch]) * fx, bot = grid[c + ch] + (grid[d + ch] - grid[c + ch]) * fx;
            out[o + ch] = Math.min(255, (top + (bot - top) * fy) * k);
        }
        out[o + 3] = 255;
    };
}

// ── the legend: what each colour means, with each kind's share of the land where it is a kind ──
export function geologyLegendHTML(layer, frame, fin = null) {
    const sw = (c, label, pct = null) => `<span><i style="background:${css(c)}"></i>${label}${pct !== null ? ` <em>${pct}%</em>` : ''}</span>`;
    const head = t => `<div class="evo-legend-head">${t}</div>`;
    if (layer === 'geoRocks') return rocksLegendHTML(fin, sw, head, frame);
    if (!hasRecord(frame)) return head(`${GEOLOGY_NAMES[layer]} — ${NO_RECORD}`);
    let land = 0;
    const count = {};
    const tally = k => { count[k] = (count[k] ?? 0) + 1; };
    const n = frame.owner.length;
    for (let w = 0; w < n; w++) {
        if (frame.owner[w] < 0 || frame.type[w] === CrustType.OCEAN || frame.type[w] === CrustType.ARC) continue;
        land++;
        if (layer === 'geoBelts') {
            const belt = frame.oroType[w], age = frame.time - frame.oroLast[w];
            tally(!belt ? (frame.type[w] === CrustType.CRATON ? 'shield' : 'none') : frame.oroLast[w] < 0 ? 'ancient' : age <= ACTIVE_BELT_MYR ? 'active' : age <= 200 ? 'worn' : 'gone');
        } else if (layer === 'geoSeas') {
            const ago = decodeFloodAge(frame.floodAge[w]);
            tally(!frame.floodAge[w] ? 'never' : ago <= 60 ? 'lately' : ago <= 300 ? 'earlier' : 'long');
        } else if (layer === 'geoCover') {
            const km = decodeCoverKm(frame.coverKm[w]);
            tally(km < 0.1 ? 'bare' : km < 1 ? 'thin' : km < 4 ? 'mid' : 'thick');
        } else {
            const km = decodeExhumKm(frame.exhumKm[w]), b = WEAR_BANDS.findLastIndex(([at]) => km >= at);
            tally(`w${b}`);
        }
    }
    const pct = k => Math.round(100 * (count[k] ?? 0) / Math.max(1, land));
    const rows = (items, note) => `<div class="evo-koppen">${items.join('')}</div>${note ? `<div class="evo-legend-note">${note}</div>` : ''}`;
    const c = [0, 0, 0];
    if (layer === 'geoBelts') return head('Mountain belts — when each was last active') + rows([
        sw(BELT_STOPS[0][1], 'Active', pct('active')), sw(beltColour(60, c).slice(), 'Worn (< 200 Myr)', pct('worn')), sw(beltColour(400, c).slice(), 'Long gone', pct('gone')),
        sw(ANCIENT, 'Before the history', pct('ancient')), sw(SHIELD, 'Shield', pct('shield')), sw(LAND, 'No belt', pct('none'))],
        'Red while a belt is active, orange while its range stands, tan as it wears down, violet once worn flat — Madeline James’s orogenies map');
    if (layer === 'geoSeas') {
        const s = frame.geoSea, stand = s ? ` · in the record the sea stands ${s.stand < 0.33 ? 'low' : s.stand < 0.67 ? 'middling' : 'high'} now, over ${Math.round(100 * s.share)}% of the land (it lays the rocks; the map's coasts stay put)` : '';
        return head('Past shallow seas — where the continents lay under the sea') + rows([
            sw(SEA_NOW, 'Lately (≤ 60 Myr ago)', pct('lately')), sw(SEA_OLD, 'Earlier (≤ 300 Myr)', pct('earlier')), sw(SEA_ANCIENT, 'Long ago', pct('long')), sw(LAND, 'Never', pct('never'))],
            `Deeper the longer it lay there. The sea rises when the ocean floor is young (a world breaking apart) and falls under a supercontinent${stand}`);
    }
    if (layer === 'geoCover') return head('Sediment — the cover on the basement, by its top') + rows([
        sw(CLASTIC, 'Sand and mud'), sw(CARB, 'Limestone'), sw(SALT, 'Salt'), sw(COAL, 'Coal'), sw(ORGANIC, 'Black shale'), sw(BARE, 'Bare basement', pct('bare'))],
        `Paler where thin: under 1 km ${pct('thin')}% · 1–4 km ${pct('mid')}% · over 4 km ${pct('thick')}% of the land`);
    return head('Erosion depth — how deep the basement now at the surface once lay') + rows(WEAR_BANDS.map(([, col, label], i) => sw(col, label, pct(`w${i}`))),
        'Dimmed where sediment still covers it. Old mountain belts are worn deepest; shields were worn deep before the history began');
}

/** Whether a frame carries the history's rock record: a planet file saved before it was kept reads its fields as zeros
 *  (save/migrations.js), its frames without the sea's stand (snapshot.js geoSea: null or the stand on every newer one). */
export const hasRecord = frame => frame?.geoSea !== undefined;
const NO_RECORD = 'this planet was saved before World Orogen kept the history’s rock record — Build This World (in World) builds it again here, with it';

/** The Rocks legend: each kind's share of the land (its pixels, by area), and the families beside Earth's. */
function rocksLegendHTML(fin, sw, head, frame) {
    const G = fin?.raster?.geology;
    if (!G) return head(hasRecord(frame) ? 'Rocks — add detail again to see them (this moment was detailed before the rocks were added)' : `Rocks — ${NO_RECORD}`);
    const area = new Float64Array(ROCK_COUNT);
    let land = 0;
    for (let y = 0; y < G.h; y++) {
        const a = Math.cos(((y + 0.5) / G.h - 0.5) * Math.PI);
        for (let x = 0, i = y * G.w; x < G.w; x++, i++) if (G.rock[i]) { area[G.rock[i]] += a; land += a; }
    }
    const pct = k => Math.round(100 * area[k] / Math.max(1e-9, land)), fam = {};
    for (let k = 1; k < ROCK_COUNT; k++) fam[ROCK_INFO[k].family] = (fam[ROCK_INFO[k].family] ?? 0) + area[k] / Math.max(1e-9, land);
    const rows = [];
    for (let k = 1; k < ROCK_COUNT; k++) if (area[k] / land >= 0.004) rows.push(sw(ROCK_INFO[k].rgb, ROCK_INFO[k].name, pct(k)));
    const f = k => Math.round(100 * (fam[k] ?? 0)), e = k => Math.round(100 * EARTH_FAMILIES[k]);
    return head('Rocks — what the land is made of at the surface') + `<div class="evo-koppen">${rows.join('')}</div>` +
        `<div class="evo-legend-note">Sediment ${f('loose') + f('sedimentary')}% · metamorphic ${f('metamorphic')}% · plutonic ${f('plutonic')}% · volcanic ${f('volcanic')}% of the land ` +
        `(Earth: ${e('loose') + e('sedimentary')} · ${e('metamorphic')} · ${e('plutonic')} · ${e('volcanic')}). Pale veil: under ice</div>`;
}

// ── the readout: the record under the pointer ──
const BELT_KIND = { [OrogenyType.ANDEAN]: 'an Andean range', [OrogenyType.LARAMIDE]: 'a flat-slab range', [OrogenyType.URAL]: 'a collision belt', [OrogenyType.HIMALAYAN]: 'a great collision belt',
    [OrogenyType.ARC]: 'a volcanic arc', [OrogenyType.RIFT]: 'rift shoulders', [OrogenyType.TRANSPRESSION]: 'a transform ridge',
    [OrogenyType.INTRAPLATE]: 'an intraplate range' };
const FLAG_WORDS = [[GeoFlag.WAS_ARC, 'born in an island arc'], [GeoFlag.OPHIOLITE, 'old sea floor thrust up'], [GeoFlag.FORELAND, 'a foreland basin'], [GeoFlag.RIFT_BASIN, 'a rift basin'],
    [GeoFlag.SLAB_CHANGE, 'its slab once turned']];
/** The history's cell whose record a place [u, v] of a finished moment shows (as its terrain read it, and as the views
 *  draw it: rockPixelAt), or −1 if unknown. */
export function recAt(fin, u, v) {
    const G = fin?.raster?.geology;
    if (!G?.rec) return -1;
    const i = rockPixelAt(G, u * G.w, v * G.h);
    return i >= 0 ? G.rec[i] : -1;
}

/** The kind of rock at a place [u (west → east), v (north → south)] of a finished moment (0 the sea), or −1 without rocks
 *  — as the Rocks view draws it (rockPixelAt). */
export function rockAt(fin, u, v) {
    const G = fin?.raster?.geology;
    if (!G) return -1;
    const i = rockPixelAt(G, u * G.w, v * G.h);
    return i >= 0 ? G.rock[i] : 0;
}

/** A rock's line for the readout: its kind and where it came from, read off the history's record (frame cell w). */
export function rockLine(rock, f, w) {
    if (!(rock > 0)) return null;
    const name = `<b>${ROCK_INFO[rock].name}</b>`, myr = v => `${Math.round(v).toLocaleString()} Myr`;
    const belt = f.oroType[w], age = belt ? f.time - f.oroLast[w] : Infinity, kind = BELT_KIND[belt];
    const beltWords = !belt ? null : f.oroLast[w] < 0 ? `${kind} from before the history` : age <= ACTIVE_BELT_MYR ? `${kind} still rising` : `${kind} last active ${myr(age)} ago`;
    const ex = decodeExhumKm(f.exhumKm[w]), worn = ex >= 1 ? `, worn ~${Math.round(ex)} km down` : '', geo = f.geoFlags[w];
    let why = '';
    switch (rock) {
        case Rock.ALLUVIUM: why = 'young sediment — a river’s plain or delta, dunes, loess, or the last ice age’s moraines'; break;
        case Rock.SANDSTONE: case Rock.SHALE: case Rock.LIMESTONE: case Rock.SALT: {
            const where = geo & GeoFlag.FORELAND ? 'in front of a rising range' : geo & GeoFlag.RIFT_BASIN ? 'in a rift basin' : geo & (GeoFlag.EPEIRIC | GeoFlag.SHELF) ? 'under a shallow sea' : 'on the old platform';
            const ago = decodeFloodAge(f.floodAge[w]);
            why = `laid ${where}${rock !== Rock.SANDSTONE && f.floodAge[w] && ago > 5 ? ` (last ${myr(ago)} ago)` : ''}, ${decodeCoverKm(f.coverKm[w]).toFixed(1)} km of cover`;
            if (belt && age <= 200) why += ` — folded in ${kind}`;
            break;
        }
        case Rock.BASALT: why = f.volcType[w] === VolcanicType.LIP ? 'a flood basalt — a large igneous province, a mantle plume’s head' : f.volcType[w] === VolcanicType.TRACK ? 'a hotspot’s volcano' : f.type[w] === CrustType.ARC ? 'an island arc’s lavas' : beltWords ? `lavas of ${beltWords}` : 'lavas'; break;
        case Rock.VOLCANIC: {
            // (felsic as the crust under the arc thickens — guideRules.arcRockByCrust; else her rule: a shallow slab's arc
            // andesite, a steep one's rhyolite)
            const felsic = GEOLOGY.guideRules.arcRockByCrust ? f.thickKm[w] > 25 && f.type[w] !== CrustType.ARC : belt !== OrogenyType.LARAMIDE && !(f.geoFlags[w] & GeoFlag.SLAB_CHANGE);
            why = `${felsic ? 'rhyolite and tuff' : 'andesite'} — the lavas and ash of ${beltWords ?? 'an old arc'}`;
            break;
        }
        case Rock.GRANITE: why = `the roots of ${beltWords ?? 'the old crust'}, bared by erosion${worn}`; break;
        case Rock.SLATE: case Rock.GNEISS: why = beltWords ? `${beltWords}${worn}` : `the old crust’s mobile belts${worn}`; break;
        case Rock.SHIELD: why = `an ancient shield’s granite-gneiss domes${worn}`; break;
        case Rock.GREENSTONE: why = 'a greenstone belt — ancient lavas between a shield’s domes (gold, nickel, iron)'; break;
        case Rock.OPHIOLITE: why = geo & GeoFlag.OPHIOLITE ? 'old sea floor, thrust up where a sea closed' : 'slivers of old sea floor along a suture'; break;
    }
    return `<span class="hi-label">Rock</span> ${name} · ${why}`;
}

export function geologyLines(f, w) {
    if (f.owner[w] < 0 || f.type[w] === CrustType.OCEAN) return [];
    // (the belt itself is the Setting line above, settingOf in looks.js — only a prehistoric one is said here)
    const lines = [], label = t => `<span class="hi-label">${t}</span> `, myr = v => `${Math.round(v).toLocaleString()} Myr`;
    if (f.oroType[w] && f.oroLast[w] < 0) lines.push(label('Belt') + `${BELT_KIND[f.oroType[w]]} from before the history`);
    const ago = decodeFloodAge(f.floodAge[w]);
    if (f.floodAge[w]) lines.push(label('Sea') + `under shallow sea for ${myr(decodeFloodMyr(f.floodMyr[w]))}, ${ago <= 5 ? 'now' : `last ${myr(ago)} ago`}`);
    const cover = decodeCoverKm(f.coverKm[w]);
    if (cover >= 0.02) {
        const fac = decodeFacies(f.facies[w]), parts = [['limestone', fac.carb], ['salt', fac.salt], ['coal', fac.coal], ['black shale', fac.organic]].filter(([, v]) => v >= 0.1);
        lines.push(label('Cover') + `${cover < 1 ? `${Math.round(cover * 1000)} m` : `${cover.toFixed(1)} km`} of sediment` + (parts.length ? ` (${parts.map(([k, v]) => `${k} ${Math.round(100 * v)}%`).join(', ')})` : ''));
    }
    const ex = decodeExhumKm(f.exhumKm[w]);
    if (f.type[w] !== CrustType.ARC) lines.push(label('Worn') + `${ex < 1 ? 'barely' : `~${Math.round(ex)} km deep`}${cover >= 0.1 ? ' (under its cover)' : ''}`);
    const arc = decodeArcMyr(f.arcMyr[w]), flags = FLAG_WORDS.filter(([b]) => f.geoFlags[w] & b).map(([, t]) => t);
    if (arc > 0) flags.unshift(`${myr(arc)} in a live arc`);
    if (flags.length) lines.push(label('Past') + flags.join(' · '));
    return lines;
}
