// The Evolution page's climate (step D): the new climate (v2/js/climate/) for the moment shown, on request only — a
// "Calculate Climate" button, never automatic, never per frame (developer: "it takes way too long") — computed in a
// worker (climate-worker.js), kept per moment while the history is open, and drawn as layers: Köppen (per terrain
// cell), Temperature and Rain (Year / January / July), Wind (its speed and arrows) and Currents (the sea's warm and cold
// water and its surface currents) — and Generate's other Inspect layers (js/climate-layers.js: their colours and
// legends): Pressure (with the winds and the ITCZ), Upwelling, Ice, Temperature Range, Rain Shadow, Aridity, Growing
// Season, Rain Seasonality — each shaded by the relief, as the Plates tab is.

import { KOPPEN_CLASSES } from '../climate/koppen.js';
import { BIOME_WORDS } from '../finish/finish-cover.js';
import { RAMPS, rampColor, drawRampBar } from '../climate-lab/palettes.js';
import { statValue } from '../climate/cell-stats.js';
import { FastNoise } from '../core/fast-noise.js';
import { styledSatellite, SAT_SHADE } from './sat-style.js';
import { QUANTITY_COLORS, ICE_SHEET_RGB, SNOW_RGB, climateLegendHTML, classLabel } from '../../../js/climate-layers.js';

/** The land's measures beyond Köppen (cell-stats.js), per cell or per pixel of a finished moment's picture: each
 *  layer's stat key (Temperature Range's layer is tempRange, its stat tRange). */
const STAT_KEY = { tempRange: 'tRange', aridity: 'aridity', growing: 'growing', rainSeason: 'rainSeason' };
export const CLIMATE_LAYERS = new Set(['satellite', 'koppen', 'temperature', 'rain', 'wind', 'currents',
    'pressure', 'upwelling', 'ice', 'tempRange', 'rainShadow', 'aridity', 'growing', 'rainSeason']);
export const SEASONAL_LAYERS = new Set(['satellite', 'temperature', 'rain', 'wind', 'currents', 'pressure', 'upwelling', 'ice', 'rainShadow']);
/** The mountains' share of the rain in a season (climate-fields.js): the year's where the climate has no seasons of it —
 *  a planet file saved before it had them. */
const orographicOf = (C, season) => (season !== 'year' && C.orographicSeasons?.[season]) || C.orographic;
/** The layers drawn with arrows, and which: the winds or the currents. */
export const ARROW_LAYERS = { wind: 'wind', pressure: 'wind', currents: 'currents' };
/** Layers only a finished moment has (its land's cover — plans/V2_SATELLITE_PLAN.md): greyed on the live timeline. */
export const FINISHED_ONLY_LAYERS = new Set(['satellite']);
export const SEASON_WORDS = { year: 'the year', jan: 'January', jul: 'July' };

// ── the worker ──
export class ClimateService {
    constructor() { this.worker = null; this.jobs = new Map(); this.sent = new Set(); this.nextId = 1; }

    /** The climate of a frame's terrain (heights in km, the sea at 0) on a terrain mesh: a promise of the page's data.
     *  `options`: the page's Greenhouse / Precipitation (greenhouseWm2, precipScale). */
    compute(tMesh, heightKm, options = {}) {
        this.worker ??= this.start();
        const key = tMesh.numCells;
        if (!this.sent.has(key)) { this.worker.postMessage({ type: 'mesh', key, xyz: tMesh.xyz }); this.sent.add(key); }
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            this.jobs.set(id, { resolve, reject });
            this.worker.postMessage({ type: 'climate', id, key, heightKm: Float32Array.from(heightKm), options });
        });
    }

    start() {
        const w = new Worker(new URL('./climate-worker.js', import.meta.url), { type: 'module' });
        w.onmessage = ({ data }) => {
            const job = this.jobs.get(data.id);
            if (!job) return;
            this.jobs.delete(data.id);
            if (data.type === 'climate') job.resolve(data.data); else job.reject(new Error(data.message));
        };
        // a worker that dies (out of memory) answers nothing more: fail its jobs, and let the next request start a new
        // one (with the meshes sent again)
        w.onerror = e => {
            e.preventDefault?.();
            for (const job of this.jobs.values()) job.reject(new Error(e.message || 'the climate worker stopped'));
            this.jobs.clear();
            if (this.worker === w) { w.terminate(); this.worker = null; this.sent.clear(); }
        };
        return w;
    }
}

// ── where each terrain cell sits on the 1° grid (bilinear), once per terrain mesh ──
const placements = new WeakMap();
function placementOf(tMesh) {
    if (placements.has(tMesh)) return placements.get(tMesh);
    const n = tMesh.numCells, xyz = tMesh.xyz, R = 180 / Math.PI;
    const i0 = new Uint16Array(n), j0 = new Uint8Array(n), fx = new Float32Array(n), fy = new Float32Array(n), cosLat = new Float32Array(n);
    for (let c = 0; c < n; c++) {
        const x = xyz[3 * c], y = xyz[3 * c + 1], z = xyz[3 * c + 2];
        const lat = Math.asin(Math.max(-1, Math.min(1, z))) * R, lon = Math.atan2(y, x) * R;
        const gx = lon + 180 - 0.5, gy = Math.min(178.999, Math.max(0, 90 - lat - 0.5));
        const ix = Math.floor(gx);
        i0[c] = (ix + 360) % 360; fx[c] = gx - ix;
        j0[c] = Math.floor(gy); fy[c] = gy - Math.floor(gy);
        cosLat[c] = Math.cos(lat / R);
    }
    const p = { i0, j0, fx, fy, cosLat };
    placements.set(tMesh, p);
    return p;
}
/** A 360 × 180 field at terrain cell c (bilinear; longitude wraps). */
function at(field, p, c) {
    const i0 = p.i0[c], i1 = i0 === 359 ? 0 : i0 + 1, r0 = p.j0[c] * 360, r1 = r0 + 360, tx = p.fx[c], ty = p.fy[c];
    return (field[r0 + i0] * (1 - tx) + field[r0 + i1] * tx) * (1 - ty) + (field[r1 + i0] * (1 - tx) + field[r1 + i1] * tx) * ty;
}

// ── colour ramps, tabulated (the climate lab's: v2/js/climate-lab/palettes.js) ──
function table(ramp, lo, hi, n, toX = v => v, fromX = x => x) {
    const lut = new Uint8Array(3 * n), a = toX(lo), b = toX(hi);
    for (let i = 0; i < n; i++) { const c = rampColor(ramp, fromX(a + (b - a) * i / (n - 1))); lut[3 * i] = c[0]; lut[3 * i + 1] = c[1]; lut[3 * i + 2] = c[2]; }
    return { lut, n, a, b, toX };
}
let tables = null;
/** A colour function's table (climate-layers.js QUANTITY_COLORS: [r, g, b] in 0–1). */
function fnTable(fn, lo, hi, n, toX = v => v, fromX = x => x) {
    const lut = new Uint8Array(3 * n), a = toX(lo), b = toX(hi);
    for (let i = 0; i < n; i++) { const c = fn(fromX(a + (b - a) * i / (n - 1))); lut[3 * i] = 255 * c[0]; lut[3 * i + 1] = 255 * c[1]; lut[3 * i + 2] = 255 * c[2]; }
    return { lut, n, a, b, toX };
}
function lutOf(name) {
    const Q = QUANTITY_COLORS;
    tables ??= {
        temperature: table(RAMPS.temperature, -45, 45, 721),
        rain: table(RAMPS.rain, 0, 600, 512, v => Math.log1p(Math.max(0, v)), x => Math.expm1(x)),
        pressure: table(RAMPS.pressure, 985, 1040, 551),
        sst: table(RAMPS.oceanAnom, -7, 7, 281),
        wind: fnTable(Q.wind, 0, 16, 161),
        upwelling: fnTable(Q.upwelling, 0, 2, 201),
        seaIce: fnTable(Q.seaIce, 0, 1, 101),
        tRange: fnTable(Q.tRange, 0, 55, 221),
        rainShadow: fnTable(Q.rainShadow, 2 ** -1.5, 2 ** 1.5, 301, Math.log2, x => 2 ** x),
        aridity: fnTable(Q.aridity, 1e-3, 10, 801, Math.log10, x => 10 ** x),
        growing: fnTable(Q.growing, 0, 12, 121),
        rainSeason: fnTable(Q.rainSeason, 0, 1.6, 161),
    };
    return tables[name];
}
function put(out, c, T, v, k) {
    const x = T.toX(v), i = 3 * Math.max(0, Math.min(T.n - 1, Math.round((x - T.a) / (T.b - T.a) * (T.n - 1))));
    out[3 * c] = Math.min(255, T.lut[i] * k); out[3 * c + 1] = Math.min(255, T.lut[i + 1] * k); out[3 * c + 2] = Math.min(255, T.lut[i + 2] * k);
}
const shadeOf = (terrain, c) => 0.45 + 0.55 * terrain.shade[c];

const KOPPEN_RGB = KOPPEN_CLASSES.map(k => k.color.map(v => Math.round(255 * v)));
const ICE_RGB = [232, 238, 244];
/** The sea under the land's layers (Aridity and the like): dark, shaded by its floor. */
const SEA_DIM = [16, 22, 52], ICE_SHEET = ICE_SHEET_RGB.map(v => 255 * v), SNOW = SNOW_RGB.map(v => 255 * v);
const windSpeed = (C, season, g) => Math.hypot(g(C.u[season]), g(C.v[season]));

/** The moment's temperature at terrain cell c (°C): land from its own cell (its height and all), the sea at sea level. */
function temperatureAt(C, season, p, c, landCell) {
    if (!landCell) return at((C.Tsea ?? C.T)[season], p, c);
    const t = C.cell.tAnnual[c];
    return season === 'year' ? t : t + at(C.T[season], p, c) - at(C.T.year, p, c);
}
/** Rain at terrain cell c (mm/month). */
function rainAt(C, season, p, c, landCell) {
    if (!landCell) return at(C.P[season], p, c);
    const monthly = C.cell.pAnnual[c] / 12;
    if (season === 'year') return monthly;
    const y = at(C.P.year, p, c);
    return y > 0.01 ? monthly * at(C.P[season], p, c) / y : monthly;
}

/**
 * Colour the terrain cells for a climate layer. `terrain`: {heightKm, shade} of the frame; `relief(out)`: the terrain's
 * own colours (the palette chosen), for the land under the currents.
 */
export function paintClimate(layer, season, C, terrain, tMesh, out, relief) {
    const p = placementOf(tMesh), n = tMesh.numCells, h = terrain.heightKm;
    if (layer === 'koppen') {
        for (let c = 0; c < n; c++) {
            const k = shadeOf(terrain, c);
            let rgb = KOPPEN_RGB[h[c] > 0 ? C.cell.koppen[c] : 0];
            if (h[c] <= 0) { const ice = Math.min(1, Math.max(0, at(C.ice, p, c))); if (ice > 0.02) rgb = rgb.map((v, ch) => v + (ICE_RGB[ch] - v) * ice); }
            out[3 * c] = Math.min(255, rgb[0] * k); out[3 * c + 1] = Math.min(255, rgb[1] * k); out[3 * c + 2] = Math.min(255, rgb[2] * k);
        }
    } else if (layer === 'temperature') {
        const T = lutOf('temperature');
        for (let c = 0; c < n; c++) put(out, c, T, temperatureAt(C, season, p, c, h[c] > 0), shadeOf(terrain, c));
    } else if (layer === 'rain') {
        const T = lutOf('rain');
        for (let c = 0; c < n; c++) put(out, c, T, rainAt(C, season, p, c, h[c] > 0), shadeOf(terrain, c));
    } else if (layer === 'pressure') {
        const T = lutOf('pressure');
        for (let c = 0; c < n; c++) put(out, c, T, at(C.slp[season], p, c), shadeOf(terrain, c));
    } else if (layer === 'wind') {
        const T = lutOf('wind');
        for (let c = 0; c < n; c++) put(out, c, T, windSpeed(C, season, f => at(f, p, c)), shadeOf(terrain, c));
    } else if (layer === 'upwelling') {
        // the sea: where cold water rises; the land: its own colours, greyed and dimmed
        relief(out);
        const T = lutOf('upwelling');
        for (let c = 0; c < n; c++) { if (h[c] <= 0) put(out, c, T, at(C.upwelling[season], p, c), shadeOf(terrain, c)); else greyCell(out, c, 0.55, 0.75); }
    } else if (layer === 'ice') {
        // the sea's ice in its season; on land, the ice sheets over the land's own colours
        relief(out);
        const T = lutOf('seaIce');
        for (let c = 0; c < n; c++) {
            if (h[c] <= 0) { put(out, c, T, at(C.seaIce[season], p, c), shadeOf(terrain, c)); continue; }
            greyCell(out, c, 0.4, 0.85);
            const f = Math.max(0, Math.min(1, at(C.iceSheet, p, c))), k = shadeOf(terrain, c), sn = C.snow ? Math.max(0, Math.min(1, at(C.snow[season], p, c))) : 0;
            if (sn > 0) for (let ch = 0; ch < 3; ch++) out[3 * c + ch] += (Math.min(255, SNOW[ch] * k) - out[3 * c + ch]) * sn;
            if (f > 0) for (let ch = 0; ch < 3; ch++) out[3 * c + ch] += (Math.min(255, ICE_SHEET[ch] * k) - out[3 * c + ch]) * f;
        }
    } else if (STAT_KEY[layer] || layer === 'rainShadow') {
        // the land's own measures; the sea dark
        const key = STAT_KEY[layer] ?? layer, T = lutOf(key), st = C.cell.stats?.[key];
        for (let c = 0; c < n; c++) {
            const k = shadeOf(terrain, c);
            if (h[c] <= 0) { out[3 * c] = SEA_DIM[0] * k; out[3 * c + 1] = SEA_DIM[1] * k; out[3 * c + 2] = SEA_DIM[2] * k; continue; }
            const v = layer === 'rainShadow' ? at(orographicOf(C, season), p, c) : st ? statValue(st, key, c) : NaN;
            if (v === v) put(out, c, T, v, k);
            else { out[3 * c] = out[3 * c + 1] = out[3 * c + 2] = 105 * k; }
        }
    } else if (layer === 'currents') {
        // the sea: warm and cold water; the land: its own colours, greyed and dimmed
        relief(out);
        const T = lutOf('sst');
        for (let c = 0; c < n; c++) {
            if (h[c] <= 0) { put(out, c, T, at(C.sstAnom[season], p, c), shadeOf(terrain, c)); continue; }
            greyCell(out, c, 0.55, 0.75);
        }
    }
}

/** A climate layer on a moment with no climate: the terrain, greyed and dimmed. */
export function paintUnavailable(out, n) { for (let c = 0; c < n; c++) greyCell(out, c, 0.8, 0.55); }
function greyCell(out, c, grey, dim) {
    const r = out[3 * c], g = out[3 * c + 1], b = out[3 * c + 2], l = 0.3 * r + 0.59 * g + 0.11 * b;
    out[3 * c] = (r + (l - r) * grey) * dim; out[3 * c + 1] = (g + (l - g) * grey) * dim; out[3 * c + 2] = (b + (l - b) * grey) * dim;
}

// ── arrows: the winds or the currents, drawn on the equirectangular texture ──
/**
 * @param {CanvasRenderingContext2D} ctx  the texture's context, already scaled to the lighter texture's size
 * @param {number} width  that size (the texture is width × width/2)
 */
export function drawArrows(ctx, width, layer, season, C) {
    const H = width / 2, px = width / 360;              // pixels per degree
    const wind = ARROW_LAYERS[layer] === 'wind';
    const U = wind ? C.u[season] : C.currentU[season], V = wind ? C.v[season] : C.currentV[season];
    const only = wind ? null : C.sea;
    // (arrow length: the field's strong speeds — its 95th percentile — make a full-length arrow)
    const speeds = [];
    for (let c = 0; c < U.length; c += 7) if (!only || only[c]) speeds.push(Math.hypot(U[c], V[c]));
    speeds.sort((a, b) => a - b);
    const strong = speeds[Math.floor(0.95 * (speeds.length - 1))] || 1;
    const step = wind ? 7.5 : 6, full = step * px * 0.9;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = wind ? 'rgba(255,255,255,0.8)' : 'rgba(235,245,255,0.85)';
    // (over the Wind layer's pale calms, each arrow outlined)
    if (layer === 'wind') { ctx.shadowColor = 'rgba(10,10,30,0.85)'; ctx.shadowBlur = Math.max(1.5, width / 1200); }
    ctx.lineWidth = Math.max(1, width / 1600);
    ctx.beginPath();
    for (let lat = 90 - step / 2; lat > -90; lat -= step) {
        const cl = Math.cos(lat * Math.PI / 180), lonStep = step / Math.max(0.2, cl);     // (about as dense near the poles)
        for (let lon = -180 + lonStep / 2; lon < 180; lon += lonStep) {
            const i = Math.min(359, Math.floor(lon + 180)), j = Math.min(179, Math.floor(90 - lat)), c = j * 360 + i;
            if (only && !only[c]) continue;
            const u = U[c], v = V[c], s = Math.hypot(u, v);
            if (!(s > strong * 0.04)) continue;
            const len = full * Math.min(1, s / strong);
            // (east–west stretched by 1/cos(latitude) on the texture, so the arrow comes out true on the globe)
            const dx = u / s * len / Math.max(0.2, cl), dy = -v / s * len;
            const x0 = (lon + 180) * px - dx / 2, y0 = (90 - lat) / 180 * H - dy / 2, x1 = x0 + dx, y1 = y0 + dy;
            ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
            const a = Math.atan2(dy, dx), hl = Math.min(len * 0.4, 5 * width / 2048);
            ctx.moveTo(x1, y1); ctx.lineTo(x1 - hl * Math.cos(a - 0.45), y1 - hl * Math.sin(a - 0.45));
            ctx.moveTo(x1, y1); ctx.lineTo(x1 - hl * Math.cos(a + 0.45), y1 - hl * Math.sin(a + 0.45));
        }
    }
    ctx.stroke();
    ctx.restore();
}

/** The ITCZ (the Pressure layer's): its latitude per 1° of longitude in the season shown, a green line. */
export function drawItcz(ctx, width, season, C) {
    const L = C.itcz?.[season];
    if (!L) return;
    const px = width / 360, H = width / 2, n = L.length;
    ctx.save();
    ctx.strokeStyle = 'rgba(60,230,120,0.9)'; ctx.lineWidth = Math.max(1.5, width / 900); ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
        const x = (i % n + 0.5) * (360 / n) * px + (i === n ? 360 * px : 0), y = (90 - L[i % n]) / 180 * H;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
}

// ── the legend ──
/** The legend of a climate layer. A finished moment's Köppen classes are counted on its climate picture (C.raster). */
export function drawLegend(el, layer, season, C, terrain) {
    const ramp = { temperature: RAMPS.temperature, rain: RAMPS.rain, pressure: RAMPS.pressure, currents: RAMPS.oceanAnom }[layer];
    if (layer === 'satellite') { el.innerHTML = `<div class="evo-legend-note">As from space, cloud-free — ${SEASON_WORDS[season]}: each climate's colours climbing with the land to rock and snow, rivers greening dry country, snow and ice from the climate</div>`; return; }
    if (layer === 'koppen') {
        // the classes on this planet's land, the largest first (on a picture: each pixel by its area, cos latitude)
        const count = new Float64Array(KOPPEN_CLASSES.length);
        let land = 0;
        if (C.raster) {
            const R = C.raster;
            for (let y = 0; y < R.h; y++) {
                const a = Math.cos(((y + 0.5) / R.h - 0.5) * Math.PI);
                for (let x = 0, i = y * R.w; x < R.w; x++, i++) if (R.koppen[i]) { count[R.koppen[i]] += a; land += a; }
            }
        } else {
            const k = C.cell.koppen, h = terrain.heightKm;
            for (let c = 0; c < k.length; c++) if (h[c] > 0) { count[k[c]]++; land++; }
        }
        const rows = [...count.keys()].filter(i => i > 0 && count[i] / land >= 0.005).sort((a, b) => count[b] - count[a]);
        el.innerHTML = `<div class="evo-koppen">${rows.map(i => {
            const K = KOPPEN_CLASSES[i], [r, g, b] = KOPPEN_RGB[i];
            return `<span title="${K.name}"><i style="background:rgb(${r},${g},${b})"></i>${K.code} <em>${Math.round(100 * count[i] / land)}%</em></span>`;
        }).join('')}</div>`;
        return;
    }
    // (Generate's Inspect layers: its legends)
    if (!ramp) { el.innerHTML = climateLegendHTML(layer, season); return; }
    const note = { temperature: `°C, ${SEASON_WORDS[season]}`, rain: `mm per month, ${SEASON_WORDS[season]}`, pressure: `sea-level pressure, hPa, ${SEASON_WORDS[season]} · arrows: the wind · green line: the ITCZ`,
        currents: 'the sea against its latitude’s average, °C · arrows: surface currents' }[layer];
    el.innerHTML = `<canvas width="560" height="44"></canvas><div class="evo-legend-note">${note}</div>`;
    drawRampBar(el.querySelector('canvas'), ramp);
}

// ── a finished moment's climate (its own, at its detail — climate-fields.js, with a picture of the land's climate:
// raster {w, h, koppen, tAnnual (°C × 100, the sea −32768), pAnnual (mm)}) — drawn per pixel of the finished picture ──
/** Where a texture W wide samples the 1° grid (bilinear; longitude wraps): per column and per row. */
function gridSampler(W) {
    const H = W >> 1, i0 = new Uint16Array(W), fx = new Float32Array(W), j0 = new Uint8Array(H), fy = new Float32Array(H);
    for (let x = 0; x < W; x++) { const g = (x + 0.5) / W * 360 - 0.5, i = Math.floor(g); i0[x] = (i + 360) % 360; fx[x] = g - i; }
    for (let y = 0; y < H; y++) { const g = Math.min(178.999, Math.max(0, (y + 0.5) / H * 180 - 0.5)); j0[y] = Math.floor(g); fy[y] = g - j0[y]; }
    return (field, x, y) => {
        const a = i0[x], b = a === 359 ? 0 : a + 1, r0 = j0[y] * 360, r1 = r0 + 360, tx = fx[x], ty = fy[y];
        return (field[r0 + a] * (1 - tx) + field[r0 + b] * tx) * (1 - ty) + (field[r1 + a] * (1 - tx) + field[r1 + b] * tx) * ty;
    };
}
/** The climate picture's pixel for texture pixel (x, y) of a texture W wide — on land, the nearest land pixel (a coast
 *  the two pictures draw a pixel apart) — or −1. */
function landPixel(R, W, x, y) {
    const s = R.w / W, cx = Math.min(R.w - 1, Math.floor((x + 0.5) * s)), cy = Math.min(R.h - 1, Math.floor((y + 0.5) * s)), i = cy * R.w + cx;
    if (R.koppen[i]) return i;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const yy = cy + dy;
        if (yy < 0 || yy >= R.h) continue;
        const j = yy * R.w + (cx + dx + R.w) % R.w;
        if (R.koppen[j]) return j;
    }
    return -1;
}
/** Enlarged — a texture wider than the climate picture: the land colour (3 per pixel in S) blended from the four nearest
 *  land pixels by their bilinear weights, into out — false where none of them is land. */
function landBlend(R, S, W, x, y, out) {
    const s = R.w / W, u = (x + 0.5) * s - 0.5, v = (y + 0.5) * s - 0.5, x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0;
    let ws = 0;
    out[0] = out[1] = out[2] = 0;
    for (let j = 0; j < 2; j++) {
        const yy = Math.min(R.h - 1, Math.max(0, y0 + j));
        for (let i = 0; i < 2; i++) {
            const p = yy * R.w + ((x0 + i) % R.w + R.w) % R.w;
            if (!R.koppen[p]) continue;
            const w = (i ? fx : 1 - fx) * (j ? fy : 1 - fy);
            out[0] += w * S[3 * p]; out[1] += w * S[3 * p + 1]; out[2] += w * S[3 * p + 2]; ws += w;
        }
    }
    if (!(ws > 0)) return false;
    out[0] /= ws; out[1] /= ws; out[2] /= ws;
    return true;
}
/** The live layers' shading (0.45 + 0.55 × the light) from the finished picture's light kk (0.35…1). */
const shadeK = kk => 0.45 + 0.55 * (kk - 0.35) / 0.65;

/**
 * A climate layer's colouring per pixel of a finished picture, for finish-view.js paintFinished (a texture W wide):
 * the land from the moment's own climate picture, the sea and the seasons from its grid — shaded by the finished relief,
 * as the live layers by theirs. `lut`: the terrain's palette (the land under the currents).
 */
export function finishedClimateColor(layer, season, C, W, lut, fin = null) {
    if (layer === 'satellite') return satelliteColor(season, C, W, fin);
    const key = STAT_KEY[layer] ?? layer;
    const R = C.raster, g = gridSampler(W), T = lutOf({ currents: 'sst', ice: 'seaIce' }[layer] ?? key), st = R.stats?.[key];
    const px = [0, 0, 0];
    const putPx = (out, o, kk, v) => {
        const x = T.toX(v), i = 3 * Math.max(0, Math.min(T.n - 1, Math.round((x - T.a) / (T.b - T.a) * (T.n - 1)))), k = shadeK(kk);
        out[o] = Math.min(255, T.lut[i] * k); out[o + 1] = Math.min(255, T.lut[i + 1] * k); out[o + 2] = Math.min(255, T.lut[i + 2] * k); out[o + 3] = 255;
    };
    const rgbPx = (out, o, kk, rgb) => { const k = shadeK(kk); out[o] = Math.min(255, rgb[0] * k); out[o + 1] = Math.min(255, rgb[1] * k); out[o + 2] = Math.min(255, rgb[2] * k); out[o + 3] = 255; };
    return (out, o, x, y, wet, kk, k3) => {
        const i = wet ? -1 : landPixel(R, W, x, y);
        if (layer === 'koppen') {
            let rgb = KOPPEN_RGB[i >= 0 ? R.koppen[i] : 0];
            if (i < 0) { const ice = Math.min(1, Math.max(0, g(C.ice, x, y))); if (ice > 0.02) { for (let ch = 0; ch < 3; ch++) px[ch] = rgb[ch] + (ICE_RGB[ch] - rgb[ch]) * ice; rgb = px; } }
            rgbPx(out, o, kk, rgb);
        } else if (layer === 'temperature') {
            if (i < 0) { putPx(out, o, kk, g((C.Tsea ?? C.T)[season], x, y)); return; }
            putPx(out, o, kk, R.tAnnual[i] / 100 + (season === 'year' ? 0 : g(C.T[season], x, y) - g(C.T.year, x, y)));
        } else if (layer === 'rain') {
            const p = g(C.P[season], x, y);
            if (i < 0) { putPx(out, o, kk, p); return; }
            const monthly = R.pAnnual[i] / 12, yr = season === 'year' ? 0 : g(C.P.year, x, y);
            putPx(out, o, kk, season === 'year' || !(yr > 0.01) ? monthly : monthly * p / yr);
        } else if (layer === 'pressure') putPx(out, o, kk, g(C.slp[season], x, y));
        else if (layer === 'wind') putPx(out, o, kk, windSpeed(C, season, f => g(f, x, y)));
        else if (layer === 'currents' || layer === 'upwelling') {
            if (wet) { putPx(out, o, kk, g((layer === 'currents' ? C.sstAnom : C.upwelling)[season], x, y)); return; }
            greyLand(out, o, kk, k3, 0.55, 0.75);
        } else if (layer === 'ice') {
            if (wet) { putPx(out, o, kk, g(C.seaIce[season], x, y)); return; }
            greyLand(out, o, kk, k3, 0.4, 0.85);
            const f = Math.max(0, Math.min(1, g(C.iceSheet, x, y))), k = shadeK(kk), sn = C.snow ? Math.max(0, Math.min(1, g(C.snow[season], x, y))) : 0;
            if (sn > 0) for (let ch = 0; ch < 3; ch++) out[o + ch] += (Math.min(255, SNOW[ch] * k) - out[o + ch]) * sn;
            if (f > 0) for (let ch = 0; ch < 3; ch++) out[o + ch] += (Math.min(255, ICE_SHEET[ch] * k) - out[o + ch]) * f;
        } else {
            // (the land's own measures; the sea dark)
            if (i < 0) { const k = shadeK(kk); out[o] = SEA_DIM[0] * k; out[o + 1] = SEA_DIM[1] * k; out[o + 2] = SEA_DIM[2] * k; out[o + 3] = 255; return; }
            const v = layer === 'rainShadow' ? g(orographicOf(C, season), x, y) : st ? statValue(st, key, i) : NaN;
            if (v === v) putPx(out, o, kk, v); else rgbPx(out, o, kk, [105, 105, 105]);
        }
    };
    /** The land under a sea's layer: its own colours, greyed and dimmed. */
    function greyLand(out, o, kk, k3, grey, dim) {
        const L = lut.rgb, r = L[k3] * kk, gg = L[k3 + 1] * kk, b = L[k3 + 2] * kk, l = 0.3 * r + 0.59 * gg + 0.11 * b;
        out[o] = (r + (l - r) * grey) * dim; out[o + 1] = (gg + (l - gg) * grey) * dim; out[o + 2] = (b + (l - b) * grey) * dim; out[o + 3] = 255;
    }
}

/**
 * A finished moment's climate as numbers, pixel by pixel — for the export's data layers (v2/js/evolution/export.js):
 * `(x, y, wet) → value` (NaN where the layer has none: a land quantity at sea, a sea quantity on land), sampled as
 * finishedClimateColor samples the same layer. `key`: a DATA_SCALES key (export-raster.js), or koppenIndex.
 */
export function finishedClimateValue(key, season, C, W) {
    const R = C.raster, g = gridSampler(W), st = R.stats, land = (x, y) => landPixel(R, W, x, y), s = season;
    switch (key) {
        case 'koppenIndex': return (x, y, wet) => { if (wet) return 0; const i = land(x, y); return i >= 0 ? R.koppen[i] : 0; };
        case 'temperature': return (x, y, wet) => {
            if (wet) return g((C.Tsea ?? C.T)[s], x, y);
            const i = land(x, y); return i >= 0 ? R.tAnnual[i] / 100 + (s === 'year' ? 0 : g(C.T[s], x, y) - g(C.T.year, x, y)) : g(C.T[s], x, y);
        };
        case 'precip': return (x, y, wet) => {
            const p = g(C.P[s], x, y); if (wet) return p;
            const i = land(x, y); if (i < 0) return p;
            const monthly = R.pAnnual[i] / 12, yr = s === 'year' ? 0 : g(C.P.year, x, y);
            return s === 'year' || !(yr > 0.01) ? monthly : monthly * p / yr;
        };
        case 'pressure': return (x, y) => g(C.slp[s], x, y);
        case 'windSpeed': return (x, y) => windSpeed(C, s, f => g(f, x, y));
        case 'windU': return (x, y) => g(C.u[s], x, y);
        case 'windV': return (x, y) => g(C.v[s], x, y);
        case 'sstAnom': return (x, y, wet) => (wet ? g(C.sstAnom[s], x, y) : NaN);
        case 'currentU': return (x, y, wet) => (wet ? g(C.currentU[s], x, y) : NaN);
        case 'currentV': return (x, y, wet) => (wet ? g(C.currentV[s], x, y) : NaN);
        case 'upwelling': return (x, y, wet) => (wet ? g(C.upwelling[s], x, y) : NaN);
        case 'seaIce': return (x, y, wet) => (wet ? g(C.seaIce[s], x, y) : 0);
        case 'snow': return (x, y, wet) => (wet || !C.snow ? 0 : g(C.snow[s], x, y));
        case 'iceSheet': return (x, y, wet) => (wet ? 0 : g(C.iceSheet, x, y));
        case 'rainShadow': { const og = orographicOf(C, s); return (x, y, wet) => (wet ? NaN : g(og, x, y)); }
        case 'tempRange': case 'aridity': case 'growing': case 'rainSeason': {
            const sk = STAT_KEY[key];
            return (x, y, wet) => { if (wet || !st?.[sk]) return NaN; const i = land(x, y); return i >= 0 ? statValue(st[sk], sk, i) : NaN; };
        }
    }
    throw new Error(`no such climate value: ${key}`);
}

// ── the Satellite layer (plans/V2_SATELLITE_PLAN.md): the land's own colours from space (the finish's, per view: the
// year, January, July — finish-cover.js), the sea by its depth (Blue Marble's: near black in the deep, lighter over the
// shelves, turquoise over warm shallows), sea ice in its season, lakes as water and salt pans white ──
// (the shallowest water no brighter than a broad shelf's: the finished coasts' shelves are narrow, and a bright last
// step drew every coast a cyan outline)
const SEA_DEPTH = [[-6, [4, 10, 34]], [-4, [6, 15, 46]], [-2, [9, 26, 66]], [-0.6, [14, 40, 88]], [-0.15, [22, 62, 112]], [0, [30, 80, 128]]];
const SHALLOW_WARM = [40, 118, 138], SEA_ICE = [214, 223, 230];
const SAT_LAKE = [[0, 0, 0], [20, 38, 64], [52, 96, 100], [222, 218, 205]], LAKE_ICE = [208, 216, 224];
function seaDepthRgb(km, out) {
    const d = SEA_DEPTH;
    let i = 0;
    while (i < d.length - 2 && km > d[i + 1][0]) i++;
    const t = Math.max(0, Math.min(1, (km - d[i][0]) / (d[i + 1][0] - d[i][0])));
    for (let ch = 0; ch < 3; ch++) out[ch] = d[i][1][ch] + (d[i + 1][1][ch] - d[i][1][ch]) * t;
    return out;
}
// The sea ice as from space: a sharp, ragged edge, not the 1° grid's fraction smoothed into a fog — the fraction against
// a threshold moved by fractal noise (the pack's edge over ~SEA_ICE_EDGE_KM; loose floes, ~SEA_ICE_FLOE_KM, where the
// cover is partial), the edge itself about a pixel wide.
const SEA_ICE_EDGE_KM = 160, SEA_ICE_FLOE_KM = 30, SEA_ICE_NOISE = 0.42, iceNoise = new FastNoise(7919);
function seaIceAt(c, x, y, W) {
    if (!(c > 0.04)) return 0;
    if (c > 0.96) return 1;
    const H = W >> 1, lat = (0.5 - (y + 0.5) / H) * Math.PI, lon = ((x + 0.5) / W - 0.5) * 2 * Math.PI, cl = Math.cos(lat);
    const px = cl * Math.cos(lon), py = cl * Math.sin(lon), pz = Math.sin(lat), fE = 6371 / SEA_ICE_EDGE_KM, fF = 6371 / SEA_ICE_FLOE_KM;
    const n = 0.7 * iceNoise.fbm(fE * px, fE * py, fE * pz, 3, 0.5) + 0.3 * iceNoise.noise3D(fF * px + 5.1, fF * py - 2.7, fF * pz + 8.3);
    const t = c + SEA_ICE_NOISE * n, e = Math.max(0, Math.min(1, (t - 0.47) / 0.06));
    return e * e * (3 - 2 * e);
}
function satelliteColor(season, C, W, fin = null) {
    const R = C.raster, g = gridSampler(W), rgb = [0, 0, 0], ice = C.seaIce?.[season] ?? C.ice;
    // (the land: the climates' colours by height with the realistic picture's texture — sat-style.js — where the finished
    // heights are at hand; else the realistic picture itself)
    const styled = !!fin?.raster?.heightM;
    const S = styled ? styledSatellite(R, season, fin.raster.heightM, fin.raster.w, fin.rivers) : R.sat[season];
    const shadeAmp = styled ? SAT_SHADE : 1, enlarged = R.w < W, blend = [0, 0, 0];
    return (out, o, x, y, wet, kk, k3, v, lake) => {
        // (the land's relief shading deeper than the other layers': the mountains stand out, as on a satellite image)
        const k = wet ? shadeK(kk) : 1 + shadeAmp * (0.37 + 0.68 * (kk - 0.35) / 0.65 - 1);      // (0.28–1.08: "the hillshading is too strong")
        if (wet) {
            // (the sea: a gentler light on its floor's relief; shallow warm water turquoise; its ice in its season)
            seaDepthRgb(v, rgb);
            const warmShallow = 0.7 * Math.max(0, Math.min(1, (g((C.Tsea ?? C.T)[season], x, y) - 20) / 6)) * Math.max(0, Math.min(1, (v + 0.12) / 0.1));
            const fi = seaIceAt(g(ice, x, y), x, y, W);
            const ks = 0.8 + 0.2 * k;
            for (let ch = 0; ch < 3; ch++) {
                let c = rgb[ch] + (SHALLOW_WARM[ch] - rgb[ch]) * warmShallow;
                c += (SEA_ICE[ch] - c) * fi;
                out[o + ch] = Math.min(255, c * ks);
            }
            out[o + 3] = 255;
            return;
        }
        const i = landPixel(R, W, x, y);
        if (lake) {
            // (a lake: open water, or frozen in a cold month — in the year's view, where it is frozen most of the year)
            const L = SAT_LAKE[lake];
            let t = i >= 0 ? R.tAnnual[i] / 100 : 0, f = 0;
            if (i >= 0 && lake !== 3) {
                if (season !== 'year') t += g(C.T[season], x, y) - g(C.T.year, x, y);
                f = season === 'year' ? Math.max(0, Math.min(1, (-2 - t) / 8)) : Math.max(0, Math.min(1, (-1 - t) / 5));
            }
            for (let ch = 0; ch < 3; ch++) out[o + ch] = L[ch] + (LAKE_ICE[ch] - L[ch]) * f;
            out[o + 3] = 255;
            return;
        }
        if (i < 0) { out[o] = out[o + 1] = out[o + 2] = 90; out[o + 3] = 255; return; }
        // (enlarged: blended from the nearest land pixels, not blocks of one colour)
        if (enlarged && landBlend(R, S, W, x, y, blend)) { out[o] = Math.min(255, blend[0] * k); out[o + 1] = Math.min(255, blend[1] * k); out[o + 2] = Math.min(255, blend[2] * k); out[o + 3] = 255; return; }
        out[o] = Math.min(255, S[3 * i] * k); out[o + 1] = Math.min(255, S[3 * i + 1] * k); out[o + 2] = Math.min(255, S[3 * i + 2] * k); out[o + 3] = 255;
    };
}

/** The hover readout's climate lines on a finished moment, at (u, v) of the map (0…1); `sea`: the picture is sea there.
 *  On the Satellite layer, the ground first: its biome, and its snow in the season shown. */
export function finishedClimateLines(C, u, v, sea, layer = null, season = 'year') {
    const R = C.raster, lines = [], W = R.w, x = Math.min(W - 1, Math.floor(u * W)), y = Math.min(R.h - 1, Math.floor(v * R.h));
    const i = sea ? -1 : landPixel(R, W, x, y), g = gridSampler(W);
    if (i >= 0 && layer === 'satellite' && R.cover) {
        const cv = R.cover[i], snow = (cv & 31) !== 1 && (season === 'jan' ? cv & 32 : season === 'jul' ? cv & 64 : 0);
        lines.push(`<span class="hi-label">Ground</span> ${BIOME_WORDS[cv & 31] || 'Land'}${snow ? ' · under snow' : ''}`);
    }
    if (i >= 0) {
        const K = KOPPEN_CLASSES[R.koppen[i]], [r, gg, b] = KOPPEN_RGB[R.koppen[i]];
        lines.push(`<span class="hi-label">Clima</span> <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:rgb(${r},${gg},${b});vertical-align:middle;margin-right:4px"></span>${K.code} — ${K.name}`);
        lines.push(`<span class="hi-label">Temp</span> ${(R.tAnnual[i] / 100).toFixed(1)} °C a year`);
        lines.push(`<span class="hi-label">Rain</span> ${R.pAnnual[i].toLocaleString()} mm a year`);
    } else lines.push(`<span class="hi-label">Sea</span> ${g((C.Tsea ?? C.T).year, x, y).toFixed(1)} °C a year${g(C.ice, x, y) > 0.5 ? ' · sea ice' : ''}`);
    const line = layerLine(layer, season, C, f => g(f, x, y), i >= 0, key => (R.stats?.[key] && i >= 0 ? statValue(R.stats[key], key, i) : NaN));
    if (line) lines.unshift(line);
    return lines;
}

/** The hover readout's line for the layer shown, where it is not already in the lines (the Inspect layers'). */
function layerLine(layer, season, C, g, land, stat) {
    const fmt = (v, d = 0) => (v === v ? v.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
    const sn = SEASONAL_LAYERS.has(layer) && season !== 'year' ? ` in ${SEASON_WORDS[season]}` : '';
    const L = (label, text) => `<span class="hi-label">${label}</span> ${text}`;
    switch (layer) {
        case 'pressure': return L('Pressure', `${fmt(g(C.slp[season]))} hPa${sn}`);
        case 'wind': return L('Wind', `${fmt(windSpeed(C, season, g), 1)} m/s${sn}`);
        case 'upwelling': return land ? null : L('Upwelling', `${fmt(Math.max(0, g(C.upwelling[season])), 2)} m/day${sn}`);
        case 'ice': return land ? (g(C.iceSheet) > 0.05 ? L('Ice', 'an ice sheet') : C.snow && g(C.snow[season]) > 0.05 ? L('Snow', `${fmt(100 * Math.min(1, g(C.snow[season])))} %${sn}`) : null) : L('Sea ice', `${fmt(100 * Math.max(0, Math.min(1, g(C.seaIce[season]))))} %${sn}`);
        case 'rainShadow': {
            if (!land) return null;
            const r = g(orographicOf(C, season));
            return L('Mountains', `${r >= 1 ? `${fmt(100 * (r - 1))} % more rain` : `${fmt(100 * (1 - r))} % less rain`}${sn}`);
        }
        case 'tempRange': return land ? L('Range', `${fmt(stat('tRange'), 1)} °C warmest − coldest month`) : null;
        case 'aridity': { const v = stat('aridity'); return land && v === v ? L('Aridity', `${classLabel('aridity', v)} (${fmt(v, 2)})`) : null; }
        case 'growing': { const v = stat('growing'); return land && v === v ? L('Growing', `${fmt(v)} month${Math.round(v) === 1 ? '' : 's'} above 10 °C`) : null; }
        case 'rainSeason': { const v = stat('rainSeason'); return land && v === v ? L('Rain', `${classLabel('rainSeason', v)} (${fmt(v, 2)})`) : null; }
    }
    return null;
}

// ── the hover readout's climate lines, for terrain cell t ──
export function readoutLines(C, terrain, tMesh, t, layer = null, season = 'year') {
    const p = placementOf(tMesh), lines = [], land = terrain.heightKm[t] > 0;
    const line = layerLine(layer, season, C, f => at(f, p, t), land, key => (C.cell.stats?.[key] ? statValue(C.cell.stats[key], key, t) : NaN));
    if (line) lines.push(line);
    if (land) {
        const K = KOPPEN_CLASSES[C.cell.koppen[t]], [r, g, b] = KOPPEN_RGB[C.cell.koppen[t]];
        lines.push(`<span class="hi-label">Clima</span> <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:rgb(${r},${g},${b});vertical-align:middle;margin-right:4px"></span>${K.code} — ${K.name}`);
        lines.push(`<span class="hi-label">Temp</span> ${C.cell.tAnnual[t].toFixed(1)} °C a year`);
        lines.push(`<span class="hi-label">Rain</span> ${Math.round(C.cell.pAnnual[t]).toLocaleString()} mm a year`);
    } else {
        lines.push(`<span class="hi-label">Sea</span> ${at((C.Tsea ?? C.T).year, p, t).toFixed(1)} °C a year${at(C.ice, p, t) > 0.5 ? ' · sea ice' : ''}`);
    }
    return lines;
}
