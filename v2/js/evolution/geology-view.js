// The Geology tab (plans/V2_GEOLOGY_PLAN.md): finished moments only, drawn per pixel of the finished picture over its
// hillshade — its Rocks, Deposits and Ages. The history's geological record (tectonics/step/geology.js: its mountain
// belts, past shallow seas, sediment and erosion depth) is not a view of its own (developer, 2026-10-27: "i dont think
// we need belts, seas, sediment, and erosion depth in geology tab"): the rocks and deposits are made from it, and the
// readout says it under the pointer, read where the finished terrain read it (terrain/synthesize.js recCell).

import { CrustType, OrogenyType, VolcanicType } from '../tectonics/model/crust.js';
import { GeoFlag, decodeCoverKm, decodeExhumKm, decodeFloodMyr, decodeFloodAge, decodeArcMyr, decodeFacies } from '../tectonics/model/geology.js';
import { FastNoise } from '../core/fast-noise.js';
import { Rock, ROCK_INFO, ROCK_COUNT, EARTH_FAMILIES } from '../geology/rocks.js';
import { KOPPEN_ID } from '../climate/koppen.js';
import { GEOLOGY } from '../geology/geology-config.js';
import { DEPOSITS, METALS } from '../geology/deposits.js';
import { AGES, resourceField, landShares, potentialField } from '../geology/ages.js';
import { findDistricts, landmasses, landmassName, landmassShares, districtStory, districtSource, keptIndex, cellLatLon, fmtKm2, BELT_KIND } from '../geology/districts.js';

export const GEOLOGY_LAYERS = new Set(['geoRocks', 'geoDeposits', 'geoAges']);
export const GEOLOGY_NAMES = { geoRocks: 'Rocks', geoDeposits: 'Deposits', geoAges: 'Ages' };

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const shadeK = kk => 0.45 + 0.55 * (kk - 0.35) / 0.65;          // (the light, as the climate layers take it)
const css = c => `rgb(${c.map(Math.round).join(',')})`;
const SEA = [24, 34, 62], LAKE = [44, 62, 100];

// (a belt is still rising for this long after it was last active: the readout's words)
export const ACTIVE_BELT_MYR = 10;

// ── Rocks (G2): each pixel's kind of rock, from the finish (geology/rocks.js) — the sea floor a shelf's sediment or the deep
// sea's, the ice caps a pale veil over the rock beneath. `at` (an export's, narrower than the rocks' picture): each
// pixel's rock and ice (1) given, W × W/2 ──
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
        // (the pixel shown: the heaviest of the winning kind's — its record cell for the readout, its ice)
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
 * (as ever: 0 where it has sea); wider — zoomed in past it (the fine detail's tiles), or an export enlarged —
 * rockPixelAt's: contacts wandering below its pixels, the finer coast's land its nearest land's rock (−1: none near).
 */
export function rockPixel(G, W) {
    const s = G.w / W;
    if (s >= 1) return (x, y) => Math.min(G.h - 1, Math.floor((y + 0.5) * s)) * G.w + Math.min(G.w - 1, Math.floor((x + 0.5) * s));
    return (x, y) => rockPixelAt(G, (x + 0.5) * s, (y + 0.5) * s);
}
export function rocksColor(fin, W, at = null) {
    const G = fin.raster.geology, K = fin.climate?.raster, kef = KOPPEN_ID.EF, pixel = at ? null : rockPixel(G, W);
    return (out, o, x, y, wet, kk, k3, v, lake) => {
        const k = shadeK(kk);
        if (wet) { const c = v > -0.25 ? SHELF : DEEP; out[o] = c[0] * k; out[o + 1] = c[1] * k; out[o + 2] = c[2] * k; out[o + 3] = 255; return; }
        if (lake === 1 || lake === 2) { out[o] = LAKE[0] * k; out[o + 1] = LAKE[1] * k; out[o + 2] = LAKE[2] * k; out[o + 3] = 255; return; }
        let rock, ice;
        if (at) { const p = y * W + x; rock = at.rock[p]; ice = at.ice?.[p] ? 0.72 : 0; }
        else { const i = pixel(x, y); rock = i >= 0 ? G.rock[i] : 0; ice = i >= 0 && K && K.koppen[i] === kef ? 0.72 : 0; }
        const rgb = ROCK_INFO[rock || Rock.ALLUVIUM].rgb;
        for (let ch = 0; ch < 3; ch++) out[o + ch] = Math.min(255, (rgb[ch] + (ICE[ch] - rgb[ch]) * ice) * k);
        out[o + 3] = 255;
    };
}

// ── the washes' ground (Deposits, Ages): plain pale paper with a gentle relief — no rock colours under it, the light's
// swing kept small — and the sea dark. A wash's colour is inked on it at a set contrast, more the richer the ground: held
// at least t from the ground, mostly in lightness (a strong hue counts for some), a pale colour darkened on the paper and
// a dark one lightened at sea, its hue kept (developer, 2026-10-22: "the contrast broadly needs to be higher guaranteed
// across the board") ──
const PAPER = [222, 217, 204], INK_KAPPA = 0.3, INK_FLOOR = 0.5;
const paperK = kk => 0.84 + 0.16 * (kk - 0.35) / 0.65;
/** A wash's strength at richness v: how far toward its colour (a), and its least contrast with the ground (t, of 255). */
export function inkOf(v, out = {}) {
    const s = smooth(GEOLOGY.deposits.grades[0], 0.75, v);
    out.a = 0.6 + 0.4 * s; out.t = 50 + 40 * s;
    return out;
}
/** The contrast of a colour with a ground (a, b: RGB, 0…255) as ink() holds it: the lightness difference, with κ of the
 *  difference in hue. */
export function inkContrast(a, b) {
    const d0 = a[0] - b[0], d1 = a[1] - b[1], d2 = a[2] - b[2], dY = 0.299 * d0 + 0.587 * d1 + 0.114 * d2, o1 = d0 - d1, o2 = 0.5 * (d0 + d1) - d2;
    return { dY, all: Math.sqrt(dY * dY + INK_KAPPA * INK_KAPPA * (o1 * o1 + o2 * o2)) };
}
/** Ink colour c (shaded by s) over the ground at out[o…o+2]: a of the way to it, then moved in lightness — away from the
 *  ground — until it is at least t from it (and its lightness at least half that). */
export function ink(out, o, c, s, a, t) {
    const b0 = out[o], b1 = out[o + 1], b2 = out[o + 2], lim = 0.299 * b0 + 0.587 * b1 + 0.114 * b2 >= 110 ? 0 : 255;
    let r = b0 + a * (c[0] * s - b0), g = b1 + a * (c[1] * s - b1), b = b2 + a * (c[2] * s - b2);
    // (a channel run into black or white stops there, and the others take its share: up to twice more)
    for (let pass = 0; pass < 3; pass++) {
        const d0 = r - b0, d1 = g - b1, d2 = b - b2, dY = 0.299 * d0 + 0.587 * d1 + 0.114 * d2, o1 = d0 - d1, o2 = 0.5 * (d0 + d1) - d2;
        const need = Math.max(INK_FLOOR * t, Math.sqrt(Math.max(0, t * t - INK_KAPPA * INK_KAPPA * (o1 * o1 + o2 * o2))));
        if (Math.abs(dY) >= need) break;
        const free = (r !== lim ? 0.299 : 0) + (g !== lim ? 0.587 : 0) + (b !== lim ? 0.114 : 0);
        if (!free) break;
        const u = ((lim ? need : -need) - dY) / free;
        if (r !== lim) r = Math.max(0, Math.min(255, r + u));
        if (g !== lim) g = Math.max(0, Math.min(255, g + u));
        if (b !== lim) b = Math.max(0, Math.min(255, b + u));
    }
    out[o] = r; out[o + 1] = g; out[o + 2] = b;
}
/** A colour as the washes ink it on flat paper at richness v (the legends' swatches). */
const inkRgb = (c, v) => { const o = [...PAPER], k = inkOf(v); ink(o, 0, c, 1, k.a, k.t); return o; };
/** Ink a wash of colour c at richness v over its ground at out[o…o+2] — the paper, shaded as it is by the light kk, or the
 *  sea (`wet`). `w`: scratch for inkOf. */
export function inkWash(out, o, c, v, wet, kk, w = {}) { inkOf(v, w); ink(out, o, c, wet ? 1 : paperK(kk), w.a, w.t); }
/** The washes' ground at a pixel: the paper, gently shaded — or the sea, a lake. */
export function washGround(out, o, wet, kk, lake) {
    if (wet || lake === 1 || lake === 2) { const c = wet ? SEA : LAKE, k = shadeK(kk); out[o] = c[0] * k; out[o + 1] = c[1] * k; out[o + 2] = c[2] * k; }
    else { const k = paperK(kk); out[o] = PAPER[0] * k; out[o + 1] = PAPER[1] * k; out[o + 2] = PAPER[2] * k; }
    out[o + 3] = 255;
}

// ── Deposits (G3, G4): on the finish's grid (geology/deposits.js) — by metal (each metal all its sources together: what
// the land yields), or by the kind of deposit (how it formed) — as a wash on the paper: faint where poor, solid where
// moderate, full where rich (grade by intensity, never by hue); "All": each place its richest metal (a tie to the
// scarcer), the fuels left out ──
const GRADE_WORDS = ['Poor', 'Moderate', 'Rich'];
const DEP_ALL = 'all', SYS = DEPOSITS.length, METAL_PICK = 'm.';
const ALL_METALS = METALS.map((m, i) => (m.group === 'metal' ? i : -1)).filter(i => i >= 0);
/** A pick's row in the finish's grid and what it is: a metal (METAL_PICK + id) or a system (its id). */
function pickOf(pick) {
    if (pick.startsWith(METAL_PICK)) { const i = METALS.findIndex(m => m.id === pick.slice(METAL_PICK.length)); return i < 0 ? null : { row: SYS + i, item: METALS[i], metal: i }; }
    const k = DEPOSITS.findIndex(d => d.id === pick);
    return k < 0 ? null : { row: k, item: DEPOSITS[k], metal: -1 };
}
const depositGrids = new WeakMap();
/** The full grid of a pick's richness (0…1) — for "All" the richest metal per cell and its richness — kept per finish. */
function depositGrid(fin, pick) {
    const Dp = fin.raster.geology.deposits;
    let byPick = depositGrids.get(fin);
    if (!byPick) depositGrids.set(fin, byPick = new Map());
    if (byPick.has(pick)) return byPick.get(pick);
    const K = Dp.cells.length, v = new Float32Array(Dp.w * Dp.h), sys = pick === DEP_ALL ? new Int16Array(Dp.w * Dp.h).fill(-1) : null;
    let rgb = [0, 0, 0];
    if (sys) {
        // (scarcity: a metal's share of the land at moderate or better — the scarcer wins a tie of grades)
        const share = METALS.map((m, i) => Dp.metalShares[3 * i + 1] + Dp.metalShares[3 * i + 2]), [p0, p1, p2] = GEOLOGY.deposits.grades;
        const grade = x => (x >= p2 ? 3 : x >= p1 ? 2 : x >= p0 ? 1 : 0);
        for (let j = 0; j < K; j++) {
            let best = -1, bg = 0, bv = 0;
            for (const i of ALL_METALS) {
                const x = Dp.data[(SYS + i) * K + j] / 255, g = grade(x);
                if (g > bg || (g === bg && g > 0 && share[i] < share[best])) { best = i; bg = g; bv = x; }
            }
            if (best >= 0) { v[Dp.cells[j]] = bv; sys[Dp.cells[j]] = best; }
        }
    } else {
        const p = pickOf(pick);
        if (p) { for (let j = 0; j < K; j++) v[Dp.cells[j]] = Dp.data[p.row * K + j] / 255; rgb = p.item.rgb; }
    }
    const grid = { w: Dp.w, h: Dp.h, step: Dp.step, v, sys, rgb };
    byPick.set(pick, grid);
    return grid;
}
/** A grid's richness at a place (bilinear over cell centres), and its colour — for "All" the four cells' metals' colours,
 *  each by its weight and richness (soft where metals meet, never the grid's squares); out.k the strongest of them. */
function depositAt(grid, la, lo, out) {
    const x = (lo + 180) / grid.step - 0.5, y = Math.max(0, Math.min(grid.h - 1, (90 - la) / grid.step - 0.5)), x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const xa = ((x0 % grid.w) + grid.w) % grid.w, xb = (xa + 1) % grid.w, y1 = Math.min(grid.h - 1, y0 + 1), V = grid.v;
    const i0 = y0 * grid.w + xa, i1 = y0 * grid.w + xb, i2 = y1 * grid.w + xa, i3 = y1 * grid.w + xb, w0 = (1 - fx) * (1 - fy), w1 = fx * (1 - fy), w2 = (1 - fx) * fy, w3 = fx * fy;
    out.v = V[i0] * w0 + V[i1] * w1 + V[i2] * w2 + V[i3] * w3;
    if (!grid.sys) { out.k = 0; out.rgb[0] = grid.rgb[0]; out.rgb[1] = grid.rgb[1]; out.rgb[2] = grid.rgb[2]; return out; }
    let r = 0, g = 0, b = 0, sw = 0, best = -1, bw = 0;
    for (const [i, w] of [[i0, w0], [i1, w1], [i2, w2], [i3, w3]]) {
        const k = grid.sys[i], q = w * V[i];
        if (k < 0 || !(q > 0)) continue;
        const c = METALS[k].rgb;
        r += q * c[0]; g += q * c[1]; b += q * c[2]; sw += q;
        if (q > bw) { bw = q; best = k; }
    }
    out.k = best;
    if (sw > 0) { out.rgb[0] = r / sw; out.rgb[1] = g / sw; out.rgb[2] = b / sw; }
    return out;
}
function depositsColor(fin, W, pick) {
    const H = W >> 1, grid = depositGrid(fin, pick), at = { v: 0, k: -1, rgb: [0, 0, 0] }, [p0] = GEOLOGY.deposits.grades, wash = {};
    const offshore = ['oil', 'gas', METAL_PICK + 'oilGas'].includes(pick);
    return (out, o, x, y, wet, kk, k3, v, lake) => {
        washGround(out, o, wet, kk, lake);
        if (wet && !offshore) return;                                 // (at sea, oil and gas only: the shelf's)
        depositAt(grid, 90 - (y + 0.5) / H * 180, (x + 0.5) / W * 360 - 180, at);
        if (at.v < p0 || at.k < 0) return;
        inkWash(out, o, at.rgb, at.v, wet, kk, wash);
    };
}
/** The metals under a place [u, v] of a finished moment, richest first, each with the kinds of deposit it comes from
 *  there: the readout's lines (at sea, only the shelf's oil and gas, if any) — the kind of deposit picked first, if one is. */
export function depositLines(fin, u, v, sea = false, pick = DEP_ALL) {
    const Dp = fin?.raster?.geology?.deposits;
    if (!Dp?.metalShares) return [];
    const la = 90 - v * 180, lo = u * 360 - 180, at = { v: 0, k: -1, rgb: [0, 0, 0] }, [p0, p1, p2] = GEOLOGY.deposits.grades, found = [];
    const sysAt = new Float32Array(SYS);
    for (let k = 0; k < SYS; k++) sysAt[k] = depositAt(depositGrid(fin, DEPOSITS[k].id), la, lo, at).v;
    METALS.forEach((m, i) => {
        if (sea && m.id !== 'oilGas') return;
        const x = depositAt(depositGrid(fin, METAL_PICK + m.id), la, lo, at).v;
        if (x < p0) return;
        // (its sources here: those that give it at least a poor grade, richest first)
        const from = m.sources.map(([id, w]) => [id, w * sysAt[DEPOSITS.findIndex(d => d.id === id)]]).filter(([, y]) => y >= p0).sort((a, b) => b[1] - a[1]);
        found.push([i, x, from.slice(0, 3).map(([id]) => DEPOSITS.find(d => d.id === id).name.toLowerCase()).filter(nm => nm !== m.name.toLowerCase())]);
    });
    const dots = x => (x >= p2 ? '●●●' : x >= p1 ? '●●○' : '●○○'), kind = pick !== DEP_ALL && !pick.startsWith(METAL_PICK) ? pickOf(pick) : null;
    // (the kind of deposit picked, first: a gem or a stone is no metal)
    const picked = kind && !sea ? sysAt[kind.row] : 0, head = picked >= p0 ? [`<span class="hi-label">${kind.item.name}</span> <span style="color:${css(kind.item.rgb)}">${dots(picked)}</span> — ${kind.item.yields}`] : [];
    if (!found.length) return sea ? [] : [...head, '<span class="hi-label">Deposits</span> no metals to speak of'];
    found.sort((a, b) => b[1] - a[1]);
    return [...head, ...found.slice(0, 5).map(([i, x, from], n) => `<span class="hi-label">${n ? '' : 'Deposits'}</span> ${METALS[i].name} <span style="color:rgb(${METALS[i].rgb.join(',')})">${dots(x)}</span>${from.length ? ` — ${from.join(', ')}` : ''}`)];
}
function depositsLegendHTML(fin, pick, sw, head) {
    const Dp = fin?.raster?.geology?.deposits;
    if (!Dp?.metalShares) return head('Deposits — add detail again to see them (this moment was detailed before the deposits were added)');
    const pct = x => (x >= 0.0995 ? Math.round(100 * x) : x >= 0.0005 ? (100 * x).toFixed(1) : '0');
    if (pick === DEP_ALL) {
        const rows = ALL_METALS.map(i => [i, Dp.metalShares[3 * i + 1] + Dp.metalShares[3 * i + 2]]).filter(([, x]) => x >= 0.0005).sort((a, b) => b[1] - a[1]);
        return head('Deposits — metals and minerals, each place its richest') + `<div class="evo-koppen">${rows.map(([i, x]) => sw(inkRgb(METALS[i].rgb, 1), METALS[i].name, pct(x))).join('')}</div>` +
            '<div class="evo-legend-note">% of the land moderate or rich. Faint where poor, solid where moderate, full where rich; a tie goes to the scarcer. Pick one metal above to see it alone — or a fuel, or a kind of deposit</div>';
    }
    const p = pickOf(pick);
    if (!p) return '';
    const d = p.item, sh = p.metal >= 0 ? Dp.metalShares : Dp.shares, at3 = p.metal >= 0 ? 3 * p.metal : 3 * p.row;
    // (each grade's swatch at the middle of its range, as the wash inks it)
    const [p0, p1, p2] = GEOLOGY.deposits.grades, mids = [(p0 + p1) / 2, (p1 + p2) / 2, (p2 + 1) / 2];
    const from = p.metal >= 0 ? ` From: ${d.sources.map(([id]) => DEPOSITS.find(s => s.id === id).name.toLowerCase()).join(', ')}.` : '';
    return head(p.metal >= 0 ? d.name : `${d.name} — ${d.yields}`) + `<div class="evo-koppen">${mids.map((v, g) => sw(inkRgb(d.rgb, v), GRADE_WORDS[g], pct(sh[at3 + g]))).join('')}</div>` +
        `<div class="evo-legend-note">${d.words[0].toUpperCase()}${d.words.slice(1)}.${from} % of the land</div>`;
}

// ── Ages (G5): each technological age's resources — what its people could reach (geology/ages.js) — over the rocks muted:
// "All" is each place's richest resource (a tie to the scarcer), a second one there at moderate or better as fine stripes
// of its colour (developer, 2026-10-19: "A for sure, but we should be cognisant of overlap"); a resource alone; or the
// age's potential (bronze, ironworking). The legend's entries are the switch: tap one to see it alone ──
const ageGrids = new WeakMap();
const ageOf = id => AGES.find(a => a.id === id) ?? AGES[2];
/** An age's fields on the finish's grid (per kept cell), with each resource's land shares — kept per finish and age. */
function ageData(fin, ageId) {
    const Dp = fin.raster.geology.deposits;
    let byAge = ageGrids.get(fin);
    if (!byAge) ageGrids.set(fin, byAge = new Map());
    if (byAge.has(ageId)) return byAge.get(ageId);
    const age = ageOf(ageId), grades = GEOLOGY.deposits.grades;
    const fields = age.resources.map(r => resourceField(Dp, r)), potential = potentialField(Dp, age);
    const data = { age, fields, potential, shares: fields.map(f => landShares(Dp, f, grades)), potentialShares: potential ? landShares(Dp, potential, grades) : null, grids: new Map() };
    byAge.set(ageId, data);
    return data;
}
/** The full grid of a pick in an age: its value per grid cell — for "All" the richest resource's, and the second one's at
 *  moderate or better (its stripes) — and the colours. */
function ageGrid(fin, ageId, pick) {
    const A = ageData(fin, ageId), key = pick;
    if (A.grids.has(key)) return A.grids.get(key);
    const Dp = fin.raster.geology.deposits, size = Dp.w * Dp.h, [p0, p1, p2] = GEOLOGY.deposits.grades;
    const g = { w: Dp.w, h: Dp.h, step: Dp.step, v: new Float32Array(size), k: null, v2: null, k2: null, rgb: [0, 0, 0], offshore: false };
    if (pick === DEP_ALL) {
        g.k = new Int16Array(size).fill(-1); g.v2 = new Float32Array(size); g.k2 = new Int16Array(size).fill(-1);
        const scarce = A.shares.map(s => s[1] + s[2]), grade = x => (x >= p2 ? 3 : x >= p1 ? 2 : x >= p0 ? 1 : 0);
        for (let j = 0; j < Dp.cells.length; j++) {
            // (the winner: the higher grade, a tie to the scarcer; the second: the richest other at moderate or better)
            let b = -1, bg = 0, bv = 0, s = -1, sv = 0;
            A.fields.forEach((f, i) => {
                const x = f[j], gr = grade(x);
                if (gr > bg || (gr === bg && gr > 0 && scarce[i] < scarce[b])) { b = i; bg = gr; bv = x; }
            });
            A.fields.forEach((f, i) => { if (i !== b && f[j] >= p1 && f[j] > sv) { s = i; sv = f[j]; } });
            const c = Dp.cells[j];
            if (b >= 0) { g.v[c] = bv; g.k[c] = b; }
            if (s >= 0 && s !== b) { g.v2[c] = sv; g.k2[c] = s; }
        }
    } else {
        const isPot = pick === 'potential', i = A.age.resources.findIndex(r => r.id === pick);
        const f = isPot ? A.potential : A.fields[i];
        if (f) for (let j = 0; j < Dp.cells.length; j++) g.v[Dp.cells[j]] = f[j];
        g.rgb = isPot ? A.age.potential.rgb : A.age.resources[i]?.rgb ?? [0, 0, 0];
        g.offshore = !isPot && !!A.age.resources[i]?.offshore;
    }
    A.grids.set(key, g);
    return g;
}
/** A grid at a place: its value (bilinear) and colour — for "All" the four cells' resources' colours by weight and value —
 *  and the stripes' value and colour. */
function ageAt(g, res, la, lo, out) {
    const x = (lo + 180) / g.step - 0.5, y = Math.max(0, Math.min(g.h - 1, (90 - la) / g.step - 0.5)), x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const xa = ((x0 % g.w) + g.w) % g.w, xb = (xa + 1) % g.w, y1 = Math.min(g.h - 1, y0 + 1);
    const I = [y0 * g.w + xa, y0 * g.w + xb, y1 * g.w + xa, y1 * g.w + xb], Wt = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
    let v = 0, v2 = 0;
    for (let q = 0; q < 4; q++) { v += Wt[q] * g.v[I[q]]; if (g.v2) v2 += Wt[q] * g.v2[I[q]]; }
    out.v = v; out.v2 = v2; out.k = -1;
    if (!g.k) { out.k = 0; for (let ch = 0; ch < 3; ch++) out.rgb[ch] = g.rgb[ch]; return out; }
    const blend = (K, V, rgb) => {
        let r = 0, gg = 0, b = 0, sw = 0, best = -1, bw = 0;
        for (let q = 0; q < 4; q++) {
            const k = K[I[q]], w = Wt[q] * V[I[q]];
            if (k < 0 || !(w > 0)) continue;
            const c = res[k].rgb;
            r += w * c[0]; gg += w * c[1]; b += w * c[2]; sw += w;
            if (w > bw) { bw = w; best = k; }
        }
        if (sw > 0) { rgb[0] = r / sw; rgb[1] = gg / sw; rgb[2] = b / sw; }
        return best;
    };
    out.k = blend(g.k, g.v, out.rgb);
    if (v2 > 0) out.k2 = blend(g.k2, g.v2, out.rgb2);
    return out;
}
function agesColor(fin, W, ageId, pick) {
    const H = W >> 1, g = ageGrid(fin, ageId, pick), res = ageOf(ageId).resources, wash = {};
    const at = { v: 0, k: -1, rgb: [0, 0, 0], v2: 0, k2: -1, rgb2: [0, 0, 0] }, [p0, p1] = GEOLOGY.deposits.grades;
    return (out, o, x, y, wet, kk, k3, v, lake) => {
        washGround(out, o, wet, kk, lake);
        if (wet && !g.offshore) return;
        ageAt(g, res, 90 - (y + 0.5) / H * 180, (x + 0.5) / W * 360 - 180, at);
        if (at.v < p0 || at.k < 0) return;
        // (a second resource at moderate or better: thin diagonal stripes of its colour across the first)
        const stripe = at.v2 >= p1 && ((x + y) & 7) < 2;
        inkWash(out, o, stripe ? at.rgb2 : at.rgb, stripe ? at.v2 : at.v, wet, kk, wash);
    };
}
const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
/** An age's resources under a place [u, v], richest first; its potential there; and in the Bronze Age, if there is no tin
 *  here, where the nearest is. */
export function ageLines(fin, ageId, u, v, sea = false) {
    const Dp = fin?.raster?.geology?.deposits;
    if (!Dp?.land) return [];
    const A = ageData(fin, ageId), la = 90 - v * 180, lo = u * 360 - 180, at = { v: 0, k: -1, rgb: [0, 0, 0], v2: 0, k2: -1, rgb2: [0, 0, 0] }, [p0, p1, p2] = GEOLOGY.deposits.grades;
    const dots = x => (x >= p2 ? '●●●' : x >= p1 ? '●●○' : '●○○'), found = [];
    A.age.resources.forEach((r, i) => {
        if (sea && !r.offshore) return;
        const x = ageAt(ageGrid(fin, ageId, r.id), A.age.resources, la, lo, at).v;
        if (x >= p0) found.push([r, x]);
    });
    found.sort((a, b) => b[1] - a[1]);
    const lines = found.slice(0, 5).map(([r, x], n) => `<span class="hi-label">${n ? '' : A.age.name}</span> ${r.name} <span style="color:rgb(${r.rgb.join(',')})">${dots(x)}</span>`);
    if (!found.length && !sea) lines.push(`<span class="hi-label">${A.age.name}</span> nothing to work here`);
    if (A.potential && !sea) {
        const x = ageAt(ageGrid(fin, ageId, 'potential'), A.age.resources, la, lo, at).v;
        lines.push(`<span class="hi-label">Potential</span> ${A.age.potential.name}: ${x >= p2 ? 'rich' : x >= p1 ? 'moderate' : x >= p0 ? 'poor' : 'none'}`);
    }
    // (the Bronze Age's scarce metal: how far to the nearest tin, moderate or better if there is any, else poor)
    const tinAt = A.age.resources.findIndex(r => r.id === 'tin');
    if (ageId === 'bronze' && tinAt >= 0 && !sea && !found.some(([r]) => r.id === 'tin')) {
        const f = A.fields[tinAt], toRad = Math.PI / 180;
        let best = null;
        for (const min of [p1, p0]) {
            for (let j = 0; j < f.length; j++) {
                if (f[j] < min || !Dp.land[j]) continue;
                const c = Dp.cells[j], y = Math.floor(c / Dp.w), x = c % Dp.w, tla = 90 - (y + 0.5) * Dp.step, tlo = -180 + (x + 0.5) * Dp.step;
                const d = 6371 * Math.acos(Math.max(-1, Math.min(1, Math.sin(la * toRad) * Math.sin(tla * toRad) + Math.cos(la * toRad) * Math.cos(tla * toRad) * Math.cos((tlo - lo) * toRad))));
                if (!best || d < best.d) best = { d, tla, tlo, v: f[j] };
            }
            if (best) break;
        }
        if (best) {
            const y = Math.sin((best.tlo - lo) * toRad) * Math.cos(best.tla * toRad), x = Math.cos(la * toRad) * Math.sin(best.tla * toRad) - Math.sin(la * toRad) * Math.cos(best.tla * toRad) * Math.cos((best.tlo - lo) * toRad);
            const dir = COMPASS[Math.round(((Math.atan2(y, x) / toRad + 360) % 360) / 45) % 8];
            lines.push(`<span class="hi-label">Nearest tin</span> ${(Math.round(best.d / 100) * 100).toLocaleString()} km ${dir}, ${best.v >= p2 ? 'rich' : best.v >= p1 ? 'moderate' : 'poor'}`);
        } else lines.push('<span class="hi-label">Nearest tin</span> none on this world — bronze from arsenic, or not at all');
    }
    return lines;
}
function agesLegendHTML(fin, ageId, pick) {
    const Dp = fin?.raster?.geology?.deposits;
    if (!Dp?.land) return '<div class="evo-legend-head">Ages — add detail again to see them (this moment was detailed before the ages were added)</div>';
    const A = ageData(fin, ageId), pct = x => (x >= 0.0995 ? Math.round(100 * x) : x >= 0.0005 ? (100 * x).toFixed(1) : '0');
    const chip = (id, rgb, label, share, on) => `<span data-age-res="${id}" class="${on ? 'on' : ''}" role="button" tabindex="0"><i style="background:${css(inkRgb(rgb, 1))}"></i>${label} <em>${pct(share)}%</em></span>`;
    const rows = A.age.resources.map((r, i) => chip(r.id, r.rgb, r.name, A.shares[i][1] + A.shares[i][2], pick === r.id));
    if (A.potential) rows.push(chip('potential', A.age.potential.rgb, `${A.age.potential.name} potential`, A.potentialShares[1] + A.potentialShares[2], pick === 'potential'));
    const what = pick === DEP_ALL ? 'each place its richest; stripes: a second at moderate or better' : pick === 'potential' ? A.age.potential.words : 'faint where poor, solid where moderate, full where rich';
    return `<div class="evo-legend-head">${A.age.name} — ${A.age.words}</div><div class="evo-koppen evo-age-chips">${rows.join('')}</div>` +
        `<div class="evo-legend-note">% of the land moderate or rich · ${what}. Tap one to see it alone${pick !== DEP_ALL ? ', again for all' : ''}</div>`;
}

// ── Districts (G6): each wash's places — a district a patch of moderate or better ground (split around its peaks where
// large: geology/districts.js) — with where it came from, and each landmass's share of every resource: the readout names
// the district under the pointer and its story (no marks on the map — developer, 2026-10-22: "i dont really like the
// labels") ──
// (the ever-present kinds have no districts: wood, building stone)
const NO_DISTRICTS = new Set(['wood', 'clay', 'stoneLimestone', 'stoneSandstone', 'stoneGranite', 'stoneMarble', 'stoneSlate']);
const subjectCache = new WeakMap();
/**
 * What a view shows, as subjects that have districts: each its id, name, colour, field (per kept grid cell, 0…1
 * — or the deposits' bytes) and sources. Deposits: the metals (All), a metal, or a kind of deposit; Ages: the age's
 * resources (All) or one of them.
 */
export function subjectsOf(fin, layer, pick = DEP_ALL, age = 'bronze', agePick = DEP_ALL) {
    const Dp = fin?.raster?.geology?.deposits;
    if (!Dp?.land) return [];
    let byKey = subjectCache.get(fin);
    if (!byKey) subjectCache.set(fin, byKey = new Map());
    const key = layer === 'geoAges' ? `a|${age}|${agePick}` : `d|${pick}`;
    if (byKey.has(key)) return byKey.get(key);
    const K = Dp.cells.length, row = r => Dp.data.subarray(r * K, (r + 1) * K);
    let out = [];
    if (layer === 'geoAges') {
        const A = ageData(fin, age);
        if (A.age.id !== 'building') {
            out = A.age.resources.map((r, i) => ({ id: r.id, name: r.name, rgb: r.rgb, field: A.fields[i], bytes: false, from: r.from }))
                .filter(s => agePick === DEP_ALL ? s.id !== 'wood' : s.id === agePick);
        }
    } else if (pick === DEP_ALL) {
        out = ALL_METALS.map(i => { const m = METALS[i]; return { id: m.id, name: m.name, rgb: m.rgb, field: row(SYS + i), bytes: true, from: m.sources }; });
    } else {
        const p = pickOf(pick);
        if (p && !NO_DISTRICTS.has(p.item.id)) out = [{ id: p.item.id, name: p.item.name, rgb: p.item.rgb, field: row(p.row), bytes: true, from: p.metal >= 0 ? p.item.sources : [[p.item.id, 1]] }];
    }
    byKey.set(key, out);
    return out;
}
const districtCache = new WeakMap();
/** A subject's districts, richest first, and which district each kept grid cell belongs to (−1: none) — kept per finish. */
export function districtsOf(fin, s) {
    let bySubject = districtCache.get(fin);
    if (!bySubject) districtCache.set(fin, bySubject = new Map());
    const key = s.field;
    if (bySubject.has(key)) return bySubject.get(key);
    const Dp = fin.raster.geology.deposits, list = findDistricts(Dp, s.field, { bytes: s.bytes }), of = new Int32Array(Dp.cells.length).fill(-1);
    list.forEach((d, i) => { for (const j of d.cells) of[j] = i; });
    const out = { list, of };
    bySubject.set(key, out);
    return out;
}
/** The history's cells under a district (its peak first, then a few more of its grid cells): where its story is read. */
function districtRecs(fin, d) {
    const G = fin.raster.geology, Dp = G.deposits, out = [];
    if (!G.rec) return out;
    for (const j of [d.j, ...d.cells.slice(0, 15)]) {
        const [la, lo] = cellLatLon(Dp, Dp.cells[j]), y = Math.min(G.h - 1, Math.floor((90 - la) / 180 * G.h)), x = Math.min(G.w - 1, Math.floor((lo + 180) / 360 * G.w));
        out.push(G.rec[y * G.w + x]);
    }
    return out;
}
/** A district's kind of deposit and story (cached on it). */
export function districtTale(fin, frame, s, d) {
    if (d.tale) return d.tale;
    const src = districtSource(fin.raster.geology.deposits, s.from, d.j), kind = src && DEPOSITS.find(x => x.id === src.id);
    d.tale = { kind: kind?.name ?? '', story: src ? districtStory(src.id, frame, districtRecs(fin, d)) : '' };
    return d.tale;
}
const grade = v => { const [p0, p1, p2] = GEOLOGY.deposits.grades; return v >= p2 ? 'rich' : v >= p1 ? 'moderate' : v >= p0 ? 'poor' : 'none'; };
const DOTS = { rich: '●●●', moderate: '●●○', poor: '●○○' };
/** A district's rank in words: the first ten by name, the rest one of many. */
export const rankWords = (n, of) => (n > 10 ? `one of ${of.toLocaleString()}` : `${n === 1 ? 'the richest' : `the ${n}${n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'} richest`} of ${of}`);
export const gradeOf = v => grade(v);

/** The district under a place [u, v] of a view, and the landmass's summary: the readout's lines. */
export function districtLines(fin, frame, layer, pick, age, agePick, u, v) {
    const Dp = fin?.raster?.geology?.deposits;
    if (!Dp?.land) return [];
    const subs = subjectsOf(fin, layer, pick, age, agePick), kept = keptIndex(Dp), lines = [];
    const la = 90 - v * 180, lo = u * 360 - 180, gy = Math.max(0, Math.min(Dp.h - 1, Math.floor((90 - la) / Dp.step))), gx = Math.min(Dp.w - 1, Math.floor((lo + 180) / Dp.step));
    // (the district here: of the subject the view shows here — in All, the one painted here — in this grid cell or next to it)
    let found = null;
    if (subs.length) {
        const painted = layer === 'geoAges' ? (agePick === DEP_ALL ? ageGrid(fin, age, DEP_ALL).k : null) : pick === DEP_ALL ? depositGrid(fin, DEP_ALL).sys : null;
        for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
            const yy = gy + dy;
            if (yy < 0 || yy >= Dp.h) continue;
            const g = yy * Dp.w + (gx + dx + Dp.w) % Dp.w, j = kept[g];
            if (j < 0) continue;
            let s = subs[0];
            if (painted) {
                const k = painted[g];
                if (k < 0) continue;
                s = layer === 'geoAges' ? subs.find(x => x.id === ageOf(age).resources[k].id) : subs.find(x => x.id === METALS[k].id);
                if (!s) continue;
            }
            const D = districtsOf(fin, s), i = D.of[j];
            if (i >= 0) { found = { s, d: D.list[i], n: i + 1, of: D.list.length }; break; }
        }
    }
    if (found) {
        const { s, d, n, of } = found, t = districtTale(fin, frame, s, d), gr = grade(d.v);
        lines.push(`<span class="hi-label">District</span> ${s.name} <span style="color:${css(s.rgb)}">${DOTS[gr]}</span> — ${t.kind && t.kind !== s.name ? `${t.kind.toLowerCase()}, ` : ''}~${fmtKm2(d.km2)}, ${rankWords(n, of)}`);
        if (t.story) lines.push(`<span class="hi-label">Origin</span> ${t.story}`);
    }
    // (the landmass here: its share of each of the view's resources, moderate or better — and what it lacks)
    const L = landmasses(Dp), g0 = gy * Dp.w + gx, j0 = kept[g0], id = j0 >= 0 ? L.of[j0] : -1;
    if (id >= 0) {
        const items = layer === 'geoAges' ? ageOf(age).resources.map((r, i) => ({ name: r.name, field: ageData(fin, age).fields[i] }))
            : METALS.map((m, i) => ({ name: m.name, field: Dp.data.subarray((SYS + i) * K0(Dp), (SYS + i + 1) * K0(Dp)), bytes: true })).filter(x => x.name !== 'Wood');
        const sums = landmassSummary(fin, layer === 'geoAges' ? `a|${age}` : 'd', items)[id], pct = x => (x >= 0.0995 ? Math.round(100 * x) : x >= 0.0005 ? (100 * x).toFixed(1) : '0');
        const has = items.map((it, f) => [it.name, (sums.by[3 * f + 1] + sums.by[3 * f + 2]) / sums.km2]).filter(([, x]) => x >= 0.0005).sort((a, b) => b[1] - a[1]);
        const lacks = items.filter((it, f) => !(sums.by[3 * f] + sums.by[3 * f + 1] + sums.by[3 * f + 2] > 0)).map(it => it.name.toLowerCase());
        lines.push(`<span class="hi-label">Landmass</span> ${landmassName(L, id)}${L.list[id].km2 >= 150e3 ? `, ${fmtKm2(L.list[id].km2)}` : ''} — ${has.length ? has.slice(0, 5).map(([nm, x]) => `${nm.toLowerCase()} ${pct(x)}%`).join(', ') : 'nothing moderate or rich'}${lacks.length && lacks.length <= 4 ? `; no ${lacks.join(', no ')}` : ''}`);
    }
    return lines;
}
const K0 = Dp => Dp.cells.length;
const summaryCache = new WeakMap();
/** Each landmass's land poor / moderate / rich in each item (landmassShares), kept per finish and key. */
function landmassSummary(fin, key, items) {
    let byKey = summaryCache.get(fin);
    if (!byKey) summaryCache.set(fin, byKey = new Map());
    if (byKey.has(key)) return byKey.get(key);
    const Dp = fin.raster.geology.deposits;
    const fields = items.map(it => (it.bytes ? Float32Array.from(it.field, x => x / 255) : it.field)), out = landmassShares(Dp, fields);
    byKey.set(key, out);
    return out;
}

/** paintFinished's colorAt for a geology view, on a texture `W` wide (finish-view.js): the view's colours, lit by the
 *  finished relief; the sea dark, lakes a darker blue. `pick`: the Deposits view's system (or "all"); `age`, `agePick`:
 *  the Ages view's age and resource. A moment detailed before its rocks or deposits: grey. */
export function finishedGeologyColor(layer, W, fin = null, pick = DEP_ALL, age = 'bronze', agePick = DEP_ALL) {
    const G = fin?.raster?.geology;
    if (layer === 'geoRocks' && G) return rocksColor(fin, W);
    if (layer === 'geoAges' && G?.deposits?.land) return agesColor(fin, W, age, agePick);
    if (layer === 'geoDeposits' && G?.deposits) return depositsColor(fin, W, pick);
    return (out, o, x, y, wet, kk) => { const k = shadeK(kk); out[o] = 90 * k; out[o + 1] = 90 * k; out[o + 2] = 96 * k; out[o + 3] = 255; };
}

// ── the legend: what each colour means, with each kind's share of the land where it is a kind ──
export function geologyLegendHTML(layer, fin = null, pick = DEP_ALL, age = 'bronze', agePick = DEP_ALL) {
    const sw = (c, label, pct = null) => `<span><i style="background:${css(c)}"></i>${label}${pct !== null ? ` <em>${pct}%</em>` : ''}</span>`;
    const head = t => `<div class="evo-legend-head">${t}</div>`;
    if (layer === 'geoRocks') return rocksLegendHTML(fin, sw, head);
    if (layer === 'geoDeposits') return depositsLegendHTML(fin, pick, sw, head);
    if (layer === 'geoAges') return agesLegendHTML(fin, age, agePick);
    return '';
}

/** The Rocks legend: each kind's share of the land (its pixels, by area), and the families beside Earth's. */
function rocksLegendHTML(fin, sw, head) {
    const G = fin?.raster?.geology;
    if (!G) return head('Rocks — add detail again to see them (this moment was detailed before the rocks were added)');
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
