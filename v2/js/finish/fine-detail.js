// Detail finer than the mesh (plans/V2_FINE_DETAIL_PLAN.md): the heights of a finished moment at any window of the planet,
// at any resolution — its picture of heights enlarged, plus a little of what a mesh of 7–15 km cells cannot hold, drawn
// from what the finish recorded (finish-drivers.js) and only below the mesh's own scale, octave by octave as the window's
// pixels allow (a coarser view and a finer one of the same place agree):
//   · ridges and valleys on steep ground — stripes aligned with the slope, each octave turned by the slope the coarser
//     ones left, so the finer run down into the coarser (the idea of Rune Skovbo Johansen's erosion filter, its "phacelle"
//     noise: kernels' stripes summed as phasors, the sum's phase taken, so they never wash out) — faint: strongest on wet,
//     rugged, young ranges, and coming and going from place to place, so no two ranges look alike; and by the rock
//     (plans/V2_LITHOLOGY_RELIEF_PLAN.md: the finish's rock picture, geology/rocks.js) — shale, slate and tuff cut densely
//     and finely, sandstone, limestone and granite sparsely;
//   · dunes in the sand seas, across the year's wind (or along it where the seasons' winds cross);
//   · the coast's headlands and coves — hard rock jutting out as headlands, soft rock worn back into bays.
// Plains and plateau tops get none. The rivers are the moment's own lines (drawn by the page and the exports). A window
// reads only its own pixels and a margin of a few km around them, so windows drawn apart (tiles, bands) meet.

import { DRIVER_FIELDS } from './finish-drivers.js';
import { GEOLOGY } from '../geology/geology-config.js';
import { rockHard, wetSolution } from '../geology/lithology.js';

const R = 6371, D2R = Math.PI / 180, TAU = 2 * Math.PI;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** The detail's tunables (km unless named otherwise). */
export const FINE = {
    baseSmooth: 1,              // the picture enlarged as its smoother (B-spline) self away from the sea (its Catmull–Rom at the coast, which keeps
                                // the coastline): the mesh's one-cell pits and spikes drew square blobs in the hillshade
    minPx: 6,                   // a feature is drawn once its wavelength spans this many pixels (faded in over twice that: no scratches)
    // ridges and valleys
    gullyCells: 1.7,            // the coarsest: this many of the mesh's cells (what the mesh holds is its own)…
    gullyMaxKm: 24,             // …at most this
    gullyGamma: 0.016,          // an octave's height: ± this × its wavelength, on rugged, steep, wet ground…
    gullyFullKm: 0.9,           // …where the ground is this rugged (less in proportion on hills)
    gullySpectrum: 0.6,         // the finer octaves weaker still: × (λ / 12 km) to this power
    gullyFollow: 3,             // side valleys slant downstream: the picture's slope counts this many times over the coarser octaves'
    gullyRugged: [0.12, 0.7],   // rugged (km of relief within ~20 km): none … all
    gullySlope: [0.012, 0.05],  // and steep (the finished surface's slope, km per km): none … all — a plain beside a range none
    gullyMaxShare: 0.25,        // never deeper than this share of the ground's height above the sea
    gullyDry: 0.35,             // on dry ground this share of the wet ground's
    gullyPatchKm: 110,          // the texture comes and goes over about this distance…
    gullyCalm: 0.12,            // …its calmest stretches this share of its strongest
    // …and by the rock (geology-config.js lithology.dissect: ½ as before): its depth × (dissect / ½) to this power…
    dissectPower: 0.6,
    dissectSpectrum: 0.4,       // …its finer octaves stronger on soft rock, weaker on hard: the spectrum's power less this × (dissect − ½)
    badlands: 0.5,              // …and soft rock cut where it is dry too (badlands): its dryness counts for no more than this
    // bedding (geology-config.js lithology.bedded): slopes stepped through layered rock — a tread, then a riser…
    bedStepKm: 0.12,            // …each step about this high (0.75–1.25 × it from place to place)…
    bedRiser: 0.35,             // …its riser this share of it…
    bedDipKm: 0.35,             // …through beds tilted gently: their surface wandering by this over…
    bedDipWaveKm: 90,           // …waves this long (dips of a degree or two: cuestas where the ground slopes the other way)
    bedSlope: [0.01, 0.05],     // on slopes from none … full (plateau tops and plains stay whole)
    bedWet: 0.3,                // crisp where it is dry; where it is wet (soil and creep round them) this share
    bedRainMm: [300, 1200],     // …dry … wet
    // (no strike ridges: drawn as phacelle stripes across a fold belt's strike they read as worms over every belt — the
    // first fine detail's fault, V2_FINE_DETAIL_PLAN §5; a belt's ridges and its rock bands are the mesh's: synthesize.js)
    // the rock's own landforms — knobs: crystalline rock (lithology.knobby) scoured by the last ice age's ice, or worn in the
    // cold: hummocks, streamlined along the ice's flow (the Canadian Shield's knock-and-lochan, without the lakes)…
    knobKm: 6, knobAmpKm: 0.04, knobColdC: [4, -4],
    // …karst (lithology.soluble, where it dissolves: geology/lithology.js wetSolution): its valleys fewer (the water goes
    // underground)…
    karstCalm: 0.7,
    hollowKm: 7, hollowAmpKm: 0.04,     // …and closed hollows, dolines and uvalas (drawn larger than life: real ones are
                                        // tens of metres to a km across)…
    cockpitTempC: [19, 24], cockpitRainMm: [1200, 2000],   // …packed close and deeper in the wet tropics (cockpit karst)
    // (tried and dropped, 2026-10-28: inselbergs and domes on granite and shields, the tropics' tower karst, salt domes,
    // scarps at hard rock's contacts — smooth bumps standing alone on flat ground read as bubbles, and scarps sharpened from
    // the rock picture's ~10 km pixels traced its squares as staircases)
    // dunes
    duneKm: 3.2, duneAmpKm: 0.05,
    // coasts: the coastline wandering by up to this (more on rocky coasts), on a slope of at least this
    coastWiggleKm: 2.2, coastMinSlope: 0.004,
    coastRock: 0.6,             // …and by the rock: hard rock out as headlands, soft back into bays (Dorset's coast) — its
                                // hardness from ½ counting this much beside the wander's noise
};

/** What a finished moment's detail is drawn from: { r (the picture), d (its drivers, or null), g (its rock picture, or
 *  null: a moment without geology), c (its climate's picture: tAnnual, pAnnual — or null), seed, cellKm (the mesh's spacing) }. */
export function detailSource(fin, seed) {
    const r = fin.raster, cells = fin.cells ?? 2.5e6;
    return { r, d: r.drivers ?? null, g: r.geology?.rock ? r.geology : null, c: fin.climate?.raster?.tAnnual ? fin.climate.raster : null, seed, cellKm: 24200 / Math.sqrt(cells) };
}

/** How many pixels a window reads past its edges: its coasts' reach, and the octaves' slopes a pixel each. */
const marginPx = pxKm => Math.min(64, Math.ceil(3 * FINE.coastWiggleKm / pxKm) + 8);

/**
 * What one window needs of a source — the picture's and the drivers' pixels under it and its margin — small enough to
 * send to a worker with each window (the whole picture of a 10M moment is ~160 MB).
 */
export function cropSource(src, win) {
    const { W, x0, y0, w, h } = win, M = marginPx(TAU * R / W);
    const sub = (g, fields, k) => {
        const gx0 = Math.floor((x0 - M) * k) - 3, gx1 = Math.ceil((x0 + w + M) * k) + 3, gy0 = Math.max(0, Math.floor((y0 - M) * k) - 3), gy1 = Math.min(g.h - 1, Math.ceil((y0 + h + M) * k) + 3);
        const cw = Math.min(g.w, gx1 - gx0 + 1), ch = gy1 - gy0 + 1, ox = ((gx0 % g.w) + g.w) % g.w, out = { fw: g.w, fh: g.h, x0: ox, y0: gy0, w: cw, h: ch };
        for (const key of fields) {
            const a = g[key];
            if (!a) continue;
            const b = new a.constructor(cw * ch);
            for (let y = 0; y < ch; y++) { const row = (gy0 + y) * g.w; for (let x = 0; x < cw; x++) b[y * cw + x] = a[row + (ox + x) % g.w]; }
            out[key] = b;
        }
        return out;
    };
    return { r: sub(src.r, ['heightM', 'ocean', 'water'], src.r.w / W), d: src.d ? sub(src.d, DRIVER_FIELDS, src.d.w / W) : null,
        g: src.g ? sub(src.g, ['rock'], src.g.w / W) : null, c: src.c ? sub(src.c, ['tAnnual', 'pAnnual'], src.c.w / W) : null, seed: src.seed, cellKm: src.cellKm };
}

/**
 * The rocks under each pixel of a window's extended rows and columns (the finish's rock picture, `src.g`) and their
 * climate (`src.c`, the same grid): each rock's properties (geology-config.js lithology; a soluble rock's hardness by its
 * climate) read eased-bilinear over the picture's land pixels — a contact soft over one of its pixels (~10 km), never its
 * squares — at every pixel with land among its four (the sea's beside the coast too; `land`: the land's share of the four);
 * elsewhere the neutral values (dissect ½). Arrays of ew × eh.
 */
function rockProps(src, W, X0, Y0, ew, eh, latR, G = GEOLOGY) {
    const g = src.g, c = src.c, GW = g.fw ?? g.w, GH = g.fh ?? g.h, gx0 = g.x0 ?? 0, gy0 = g.y0 ?? 0, gw = g.w, gh = g.h, N = ew * eh, L = G.lithology;
    // (the climate's picture: the same grid as the rocks' — finishRaster makes both — so the same pixels)
    const climate = c && (c.fw ?? c.w) === GW && (c.x0 ?? 0) === gx0 && (c.y0 ?? 0) === gy0 && c.w === gw && c.h === gh ? c : null;
    const out = { land: new Float32Array(N), hard: new Float32Array(N), dissect: new Float32Array(N).fill(0.5), bedded: new Float32Array(N), knobby: new Float32Array(N),
        soluble: new Float32Array(N), T: new Float32Array(N).fill(10), P: new Float32Array(N).fill(600) };
    const xA = new Int32Array(ew), xB = new Int32Array(ew), fx = new Float32Array(ew), rA = new Int32Array(eh), rB = new Int32Array(eh), fy = new Float32Array(eh);
    const colOf = a => Math.min(gw - 1, ((a - gx0) % GW + GW) % GW), rowOf = y => Math.min(gh - 1, Math.max(0, Math.max(0, Math.min(GH - 1, y)) - gy0)) * gw;
    for (let i = 0; i < ew; i++) {
        const u = ((((X0 + i + 0.5) / W) % 1 + 1) % 1) * GW - 0.5, xf = Math.floor(u), a0 = (xf + GW) % GW, t = u - xf;
        fx[i] = t * t * (3 - 2 * t); xA[i] = colOf(a0); xB[i] = colOf((a0 + 1) % GW);
    }
    for (let j = 0; j < eh; j++) {
        const v = (90 - latR[j] / D2R) / 180 * GH - 0.5, ya = Math.max(0, Math.min(GH - 1, Math.floor(v))), yb = Math.min(GH - 1, ya + 1), t = Math.max(0, Math.min(1, v - ya));
        fy[j] = t * t * (3 - 2 * t); rA[j] = rowOf(ya); rB[j] = rowOf(yb);
    }
    const idx = [0, 0, 0, 0], wt = [0, 0, 0, 0];
    for (let j = 0; j < eh; j++) for (let i = 0; i < ew; i++) {
        const p = j * ew + i;
        idx[0] = rA[j] + xA[i]; idx[1] = rA[j] + xB[i]; idx[2] = rB[j] + xA[i]; idx[3] = rB[j] + xB[i];
        if (!g.rock[idx[0]] && !g.rock[idx[1]] && !g.rock[idx[2]] && !g.rock[idx[3]]) continue;
        wt[0] = (1 - fx[i]) * (1 - fy[j]); wt[1] = fx[i] * (1 - fy[j]); wt[2] = (1 - fx[i]) * fy[j]; wt[3] = fx[i] * fy[j];
        // (the climate first: a soluble rock's hardness needs it)
        let ws = 0, T = 0, Pm = 0;
        if (climate) for (let q = 0; q < 4; q++) { const t = climate.tAnnual[idx[q]]; if (t === -32768) continue; ws += wt[q]; T += wt[q] * t / 100; Pm += wt[q] * climate.pAnnual[idx[q]]; }
        if (ws > 0) { T /= ws; Pm /= ws; out.T[p] = T; out.P[p] = Pm; } else { T = out.T[p]; Pm = out.P[p]; }
        let wl = 0, hard = 0, dis = 0, bed = 0, knob = 0, sol = 0;
        for (let q = 0; q < 4; q++) {
            const k = g.rock[idx[q]];
            if (!k) continue;
            const w = wt[q];
            wl += w; hard += w * rockHard(k, T, Pm, G); dis += w * L.dissect[k]; bed += w * L.bedded[k]; knob += w * L.knobby[k]; sol += w * L.soluble[k];
        }
        if (!(wl > 0)) continue;
        out.land[p] = wl; out.hard[p] = hard / wl; out.dissect[p] = dis / wl; out.bedded[p] = bed / wl; out.knobby[p] = knob / wl; out.soluble[p] = sol / wl;
    }
    return out;
}

// ── a hash of a lattice point; phacelle noise (stripes of one wavelength summed as phasors over a jittered lattice) and a
// smooth noise on the same lattice. Each lattice point sits in the middle half of its cell and reaches KR cells, so every
// point within reach of p is in the 27 cells about p's: both are smooth everywhere (visiting only the 8 corners about p,
// they jumped at the cells' faces — dashes along the parallels and meridians; the simplex noise's kernels overran its
// simplices the same way) ──
function hash3(x, y, z, s) {
    let h = Math.imul(x, 0x8da6b343) ^ Math.imul(y, 0xd8163841) ^ Math.imul(z, 0xcb1ab31f) ^ s;
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
    return (h ^ (h >>> 15)) >>> 0;
}
const mixHash = h => { h = Math.imul(h ^ (h >>> 16), 0x7feb352d); h = Math.imul(h ^ (h >>> 15), 0x846ca68b); return (h ^ (h >>> 16)) >>> 0; };
/**
 * The phase (−π … π) at point p (km) of stripes of wavelength lam (km) running across the unit direction a — crests where
 * the phase is 0, troughs at ±π — each lattice point's stripe its own phase, summed as phasors (so the stripes stay whole
 * where kernels disagree).
 */
const TRIG = 4096, TRIG_K = TRIG / TAU, COS_T = new Float32Array(TRIG), SIN_T = new Float32Array(TRIG);
for (let i = 0; i < TRIG; i++) { COS_T[i] = Math.cos(i / TRIG_K); SIN_T[i] = Math.sin(i / TRIG_K); }
const KR = 1.25, KR2 = KR * KR;
/** The nearest a lattice point of the cell offset o (−1, 0, 1) from p's can lie from p along one axis (f p's coordinate, c that cell's). */
const near = (o, f, c) => (o < 0 ? f - c - 0.75 : o > 0 ? c + 0.25 - f : 0);
function phacelle(px, py, pz, ax, ay, az, lam, s) {
    const inv = 1 / lam, fx = px * inv, fy = py * inv, fz = pz * inv;
    const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
    let re = 0, im = 0;
    for (let oz = -1; oz <= 1; oz++) {
        const cz = iz + oz, ez = near(oz, fz, cz), ez2 = ez * ez;
        for (let oy = -1; oy <= 1; oy++) {
            const cy = iy + oy, ey = near(oy, fy, cy), eyz = ey * ey + ez2;
            if (eyz >= KR2) continue;
            for (let ox = -1; ox <= 1; ox++) {
                const cx = ix + ox, ex = near(ox, fx, cx);
                if (ex * ex + eyz >= KR2) continue;
                const h = hash3(cx, cy, cz, s), h2 = mixHash(h);
                const dx = fx - cx - 0.25 - 0.5 * (h & 1023) / 1023, dy = fy - cy - 0.25 - 0.5 * ((h >>> 10) & 1023) / 1023, dz = fz - cz - 0.25 - 0.5 * ((h >>> 20) & 1023) / 1023;
                const r2 = dx * dx + dy * dy + dz * dz;
                if (r2 >= KR2) continue;
                const w = (1 - r2 / KR2) ** 2, t = ((TRIG * (dx * ax + dy * ay + dz * az)) | 0) + (h2 >>> 20);
                re += w * COS_T[t & (TRIG - 1)]; im += w * SIN_T[t & (TRIG - 1)];
            }
        }
    }
    return Math.atan2(im, re);
}
/**
 * The tallest of the bumps about p (lattice units: one site a cell, each placed, sized and raised by its hash) — each 1
 * at its centre … 0 at its rim, (1 − r^a)^b across (r: the distance over its radius, rMin…rMax of a cell, ≤ 0.45: every
 * site in reach is in the 27 cells about p's); a site stands where its draw is under `density`, fading in as the density
 * passes it — so a field of them thins out smoothly. 0 where none reaches. (The max of continuous bumps: no seams.)
 */
function bumps(fx, fy, fz, s, density, rMin, rMax, a, b) {
    const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
    let best = 0;
    for (let oz = -1; oz <= 1; oz++) for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const cx = ix + ox, cy = iy + oy, cz = iz + oz, h = hash3(cx, cy, cz, s), h2 = mixHash(h), u = (h2 & 1023) / 1023;
        if (u >= density) continue;
        const size = rMin + (rMax - rMin) * ((h2 >>> 10) & 1023) / 1023;
        const dx = fx - cx - 0.25 - 0.5 * (h & 1023) / 1023, dy = fy - cy - 0.25 - 0.5 * ((h >>> 10) & 1023) / 1023, dz = fz - cz - 0.25 - 0.5 * ((h >>> 20) & 1023) / 1023;
        const r2 = (dx * dx + dy * dy + dz * dz) / (size * size);
        if (r2 >= 1) continue;
        const v = smooth(u, u + 0.15, density) * (0.6 + 0.8 * ((h2 >>> 20) & 1023) / 1023) * (1 - r2 ** (0.5 * a)) ** b;
        if (v > best) best = v;
    }
    return best;
}
/** Bed k's top (in steps; bed k from its top to bed k + 1's): k jittered by ± 0.3 — beds 0.4–1.6 steps thick, the same
 *  everywhere for a seed. */
const bedLevel = (k, seed) => k + 0.6 * (hash3(k, 17, 3, seed * 7 + 5) / 4294967296 - 0.5);
/** How hard bed k is, 0.25…1: its riser's share (a cliff-former's full, a soft bed's faint, ~0.6 on the whole). */
const bedHard = (k, seed) => 0.25 + 0.75 * (hash3(k, 41, 9, seed * 7 + 6) / 4294967296) ** 0.7;
/** Smooth noise at p (lattice units: one feature a cell), about −1 … 1: each lattice point's random slope, faded out by its kernel. */
function smoothNoise(fx, fy, fz, s) {
    const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
    let v = 0;
    for (let oz = -1; oz <= 1; oz++) {
        const cz = iz + oz, ez = near(oz, fz, cz), ez2 = ez * ez;
        for (let oy = -1; oy <= 1; oy++) {
            const cy = iy + oy, ey = near(oy, fy, cy), eyz = ey * ey + ez2;
            if (eyz >= KR2) continue;
            for (let ox = -1; ox <= 1; ox++) {
                const cx = ix + ox, ex = near(ox, fx, cx);
                if (ex * ex + eyz >= KR2) continue;
                const h = hash3(cx, cy, cz, s), h2 = mixHash(h);
                const dx = fx - cx - 0.25 - 0.5 * (h & 1023) / 1023, dy = fy - cy - 0.25 - 0.5 * ((h >>> 10) & 1023) / 1023, dz = fz - cz - 0.25 - 0.5 * ((h >>> 20) & 1023) / 1023;
                const r2 = dx * dx + dy * dy + dz * dz;
                if (r2 >= KR2) continue;
                const w = (1 - r2 / KR2) ** 2;
                v += w * (((h2 & 255) - 127.5) * dx + (((h2 >>> 8) & 255) - 127.5) * dy + (((h2 >>> 16) & 255) - 127.5) * dz);
            }
        }
    }
    return v * NOISE_K;
}
const NOISE_K = 1 / 100;     // (scales smoothNoise to about the simplex noise's spread: σ ≈ 0.42)

/**
 * The detailed window: W the full width it is a window of (px; the planet W × W/2), its columns x0 … x0 + w − 1 (wrapping)
 * and rows y0 … y0 + h − 1. Returns { h: Float32Array (km), sea: Uint8Array, wat: Uint8Array (finish-hydro.js Water kinds) }
 * — for the painter.
 */
export function fineWindow(src, { W, x0, y0, w, h }, signal = null) {
    const { r, d } = src, HE = W >> 1, pxKm = TAU * R / W, M = marginPx(pxKm);
    // (the picture: whole, or a crop of it — cropSource: fw × fh the whole, x0, y0 where the crop starts)
    const RW = r.fw ?? r.w, RH = r.fh ?? r.h, rx0 = r.x0 ?? 0, ry0 = r.y0 ?? 0;
    const colR = c => Math.min(r.w - 1, ((c - rx0) % RW + RW) % RW), rowR = y => Math.min(r.h - 1, Math.max(0, Math.min(RH - 1, Math.max(0, y)) - ry0));
    const ew = w + 2 * M, eh = h + 2 * M, N = ew * eh, X0 = x0 - M, Y0 = y0 - M, ms = {};
    let t0 = performance.now();
    const lap = name => { const t = performance.now(); ms[name] = t - t0; t0 = t; };
    // ── geometry: each extended row's latitude, each column's longitude ──
    const latR = new Float64Array(eh), cosLa = new Float64Array(eh), sinLa = new Float64Array(eh), cosLo = new Float64Array(ew), sinLo = new Float64Array(ew);
    for (let j = 0; j < eh; j++) { const Y = Math.min(HE - 1, Math.max(0, Y0 + j)); latR[j] = (90 - (Y + 0.5) * 180 / HE) * D2R; cosLa[j] = Math.cos(latR[j]); sinLa[j] = Math.sin(latR[j]); }
    for (let i = 0; i < ew; i++) { const lo = ((X0 + i + 0.5) * 360 / W - 180) * D2R; cosLo[i] = Math.cos(lo); sinLo[i] = Math.sin(lo); }
    // ── the picture enlarged: heights by a Catmull–Rom, rows then columns — smooth everywhere (clamped to its pixels' range
    // it creased where the clamp switched: ticks in the hillshade; a monotone cubic drew the pixels' grid); the sea and the
    // lakes by the weighted majority of four. And the same smoother (a cubic B-spline: its slope smooth too), what the
    // detail is steered by — the Catmull–Rom's slope turns at each of the picture's pixels, and stripes steered by it creased
    // there ──
    const hb = new Float32Array(N), hs = new Float32Array(N), seaB = new Uint8Array(N), watB = new Uint8Array(N), k = RW / W;
    {
        const cx = new Int32Array(4 * ew), fxs = new Float32Array(ew), cy = new Int32Array(4 * eh), fys = new Float32Array(eh), H4 = r.heightM;
        for (let i = 0; i < ew; i++) { const u = (X0 + i + 0.5) * k - 0.5, xi = Math.floor(u); fxs[i] = u - xi; for (let q = 0; q < 4; q++) cx[4 * i + q] = colR(((xi - 1 + q) % RW + RW) % RW); }
        for (let j = 0; j < eh; j++) { const v = (Math.min(HE - 1, Math.max(0, Y0 + j)) + 0.5) * k - 0.5, yi = Math.floor(v); fys[j] = v - yi; for (let q = 0; q < 4; q++) cy[4 * j + q] = rowR(yi - 1 + q) * r.w; }
        const kinds = [0, 0, 0, 0];
        for (let j = 0; j < eh; j++) for (let i = 0; i < ew; i++) {
            const c0 = cx[4 * i], c1 = cx[4 * i + 1], c2 = cx[4 * i + 2], c3 = cx[4 * i + 3], fx = fxs[i], fy = fys[j];
            const r0 = cy[4 * j], r1 = cy[4 * j + 1], r2 = cy[4 * j + 2], r3 = cy[4 * j + 3];
            const s = cr(cr(H4[r0 + c0], H4[r0 + c1], H4[r0 + c2], H4[r0 + c3], fx), cr(H4[r1 + c0], H4[r1 + c1], H4[r1 + c2], H4[r1 + c3], fx),
                cr(H4[r2 + c0], H4[r2 + c1], H4[r2 + c2], H4[r2 + c3], fx), cr(H4[r3 + c0], H4[r3 + c1], H4[r3 + c2], H4[r3 + c3], fx), fy);
            const a = r1 + c1, b = r1 + c2, c = r2 + c1, e = r2 + c2;
            const p = j * ew + i, wa = (1 - fx) * (1 - fy), wb = fx * (1 - fy), wc = (1 - fx) * fy, wd = fx * fy;
            hs[p] = bs(bs(H4[r0 + c0], H4[r0 + c1], H4[r0 + c2], H4[r0 + c3], fx), bs(H4[r1 + c0], H4[r1 + c1], H4[r1 + c2], H4[r1 + c3], fx),
                bs(H4[r2 + c0], H4[r2 + c1], H4[r2 + c2], H4[r2 + c3], fx), bs(H4[r3 + c0], H4[r3 + c1], H4[r3 + c2], H4[r3 + c3], fx), fy) / 1000;
            const O = r.ocean, so = bs(bs(O[r0 + c0], O[r0 + c1], O[r0 + c2], O[r0 + c3], fx), bs(O[r1 + c0], O[r1 + c1], O[r1 + c2], O[r1 + c3], fx),
                bs(O[r2 + c0], O[r2 + c1], O[r2 + c2], O[r2 + c3], fx), bs(O[r3 + c0], O[r3 + c1], O[r3 + c2], O[r3 + c3], fx), fy);
            const sm = FINE.baseSmooth * (1 - smooth(0, 0.25, so));
            hb[p] = ((1 - sm) * s / 1000) + sm * hs[p];
            seaB[p] = wa * r.ocean[a] + wb * r.ocean[b] + wc * r.ocean[c] + wd * r.ocean[e] >= 0.5 ? 1 : 0;
            if (r.water) {
                kinds[0] = kinds[1] = kinds[2] = kinds[3] = 0;
                kinds[r.water[a]] += wa; kinds[r.water[b]] += wb; kinds[r.water[c]] += wc; kinds[r.water[e]] += wd;
                let best = 0; for (let q = 1; q < 4; q++) if (kinds[q] > kinds[best]) best = q;
                watB[p] = best;
            }
        }
    }
    const out = { h: new Float32Array(w * h), sea: new Uint8Array(w * h), wat: new Uint8Array(w * h), ms };
    const crop = (src2, dst) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) dst[j * w + i] = src2[(j + M) * ew + i + M]; };
    if (!d || k >= 1) { crop(hb, out.h); crop(seaB, out.sea); crop(watB, out.wat); return out; }

    lap('base');
    // ── the drivers, read at a pixel when wanted: bilinear, eased across each pixel so it has no kinks (`at` sets the pixel,
    // `val` reads a field there); a direction by its unit vectors where its field is set (`dirAt`: into DIR, east and north) ──
    const DW = d.fw ?? d.w, DH = d.fh ?? d.h, dx0 = d.x0 ?? 0, dy0 = d.y0 ?? 0, dw = d.w, dh = d.h;
    const COS = new Float32Array(256), SIN = new Float32Array(256);
    for (let a = 0; a < 256; a++) { COS[a] = Math.cos(a * TAU / 256); SIN[a] = Math.sin(a * TAU / 256); }
    const xA = new Int32Array(ew), xB = new Int32Array(ew), fxD = new Float32Array(ew), rAr = new Int32Array(eh), rBr = new Int32Array(eh), fyD = new Float32Array(eh);
    for (let i = 0; i < ew; i++) { const u = ((((X0 + i + 0.5) / W) % 1 + 1) % 1) * DW - 0.5, xf = Math.floor(u), a0 = (xf + DW) % DW; fxD[i] = u - xf; xA[i] = Math.min(dw - 1, ((a0 - dx0) % DW + DW) % DW); xB[i] = Math.min(dw - 1, (((a0 + 1) % DW - dx0) % DW + DW) % DW); }
    for (let j = 0; j < eh; j++) {
        const v = (90 - latR[j] / D2R) / 180 * DH - 0.5, yA = Math.max(0, Math.min(DH - 1, Math.floor(v))), yB = Math.min(DH - 1, yA + 1);
        fyD[j] = Math.max(0, Math.min(1, v - yA)); rAr[j] = Math.min(dh - 1, Math.max(0, yA - dy0)) * dw; rBr[j] = Math.min(dh - 1, Math.max(0, yB - dy0)) * dw;
    }
    let pa = 0, pb = 0, pc = 0, pe = 0, wa = 0, wb = 0, wc = 0, we = 0;
    for (let i = 0; i < ew; i++) fxD[i] = fxD[i] * fxD[i] * (3 - 2 * fxD[i]);
    for (let j = 0; j < eh; j++) fyD[j] = fyD[j] * fyD[j] * (3 - 2 * fyD[j]);
    const at = (j, i) => { const fx = fxD[i], fy = fyD[j]; pa = rAr[j] + xA[i]; pb = rAr[j] + xB[i]; pc = rBr[j] + xA[i]; pe = rBr[j] + xB[i]; wa = (1 - fx) * (1 - fy) / 255; wb = fx * (1 - fy) / 255; wc = (1 - fx) * fy / 255; we = fx * fy / 255; };
    const val = f => wa * f[pa] + wb * f[pb] + wc * f[pc] + we * f[pe];
    const DIR = [0, 0];
    const dirAt = (f, has) => {
        DIR[0] = (has[pa] ? wa * COS[f[pa]] : 0) + (has[pb] ? wb * COS[f[pb]] : 0) + (has[pc] ? wc * COS[f[pc]] : 0) + (has[pe] ? we * COS[f[pe]] : 0);
        DIR[1] = (has[pa] ? wa * SIN[f[pa]] : 0) + (has[pb] ? wb * SIN[f[pb]] : 0) + (has[pc] ? wc * SIN[f[pc]] : 0) + (has[pe] ? we * SIN[f[pe]] : 0);
        const l = Math.hypot(DIR[0], DIR[1]);
        if (l > 1e-6) { DIR[0] /= l; DIR[1] /= l; }
        return l;
    };
    // (a pixel's place, km from the planet's centre, and a direction there — east and north components — in space)
    const P = [0, 0, 0], A3 = [0, 0, 0];
    const place = (j, i) => { P[0] = R * cosLa[j] * cosLo[i]; P[1] = R * cosLa[j] * sinLo[i]; P[2] = R * sinLa[j]; };
    const toSpace = (j, i, ue, un) => { A3[0] = -ue * sinLo[i] - un * sinLa[j] * cosLo[i]; A3[1] = ue * cosLo[i] - un * sinLa[j] * sinLo[i]; A3[2] = un * cosLa[j]; };

    // ── the picture's slope (km per km, east and north) and how far from its coast (km; + on land, − at sea) ──
    const gE = new Float32Array(N), gN = new Float32Array(N);
    gradient(hs, gE, gN);
    function gradient(f, oe, on) {
        for (let j = 0; j < eh; j++) {
            const ky = 1 / (2 * pxKm), kx = 1 / (2 * pxKm * Math.max(0.05, cosLa[j])), up = Math.max(0, j - 1) * ew, dn = Math.min(eh - 1, j + 1) * ew;
            for (let i = 0; i < ew; i++) { const p = j * ew + i; oe[p] = (f[j * ew + Math.min(ew - 1, i + 1)] - f[j * ew + Math.max(0, i - 1)]) * kx; on[p] = (f[up + i] - f[dn + i]) * ky; }
        }
    }
    const coastKm = chamfer(seaB, ew, eh, pxKm, cosLa);
    const D = new Float32Array(N), seed = src.seed | 0, fade = lam => smooth(FINE.minPx, 2 * FINE.minPx, lam / pxKm);
    if (signal?.aborted) return null;

    lap('slope');
    // ── ridges and valleys, octave by octave, each turned by the slope the coarser ones left ──
    const amp = new Float32Array(N), dE = new Float32Array(N), dN = new Float32Array(N), ps = 1 / FINE.gullyPatchKm;
    const lam0 = Math.min(FINE.gullyMaxKm, FINE.gullyCells * src.cellKm), octaveF = lam => fade(lam) * smooth(1.02 * lam0, 0.45 * lam0, lam);
    // (none of the octaves drawn at this zoom — all of them wider than the mesh holds or too fine for the pixels: the
    // weights are not needed)
    let drawn = false;
    for (let lam = lam0, o = 0; fade(lam) > 0 && o < 7; lam /= 2, o++) if (octaveF(lam) > 0.02) { drawn = true; break; }
    // (the rocks, where any of their features is drawn at this zoom: the ridges' octaves, steps on the gentlest slopes
    // they are drawn on, the rock's own landforms)
    const bedOn = fade(0.75 * FINE.bedStepKm / FINE.bedSlope[0]) > 0;
    const knF = fade(FINE.knobKm), hoF = fade(0.6 * FINE.hollowKm), formsOn = knF > 0.05 || hoF > 0, coastOn = fade(0.7 * FINE.coastWiggleKm) > 0;
    const lith = src.g?.rock && (drawn || bedOn || formsOn || coastOn) ? rockProps(src, W, X0, Y0, ew, eh, latR) : null;
    // (how much of each pixel's rock dissolves: karst — its valleys fewer)
    const karst = lith ? new Float32Array(N) : null;
    if (lith) for (let p = 0; p < N; p++) if (lith.soluble[p] > 0) karst[p] = lith.soluble[p] * wetSolution(lith.T[p], lith.P[p]);
    // (each pixel's spectrum by its rock: the finer octaves × (λ / 12 km) to this — 0 where the rock is neutral)
    const spec = lith ? new Float32Array(N) : null;
    if (drawn) for (let j = 0; j < eh; j++) for (let i = 0; i < ew; i++) {
        const p = j * ew + i;
        if (seaB[p] || !(hb[p] > 0)) continue;
        const slope = Math.hypot(gE[p], gN[p]);
        if (slope < FINE.gullySlope[0]) continue;
        at(j, i);
        const rug = 2 * val(d.rugged), m = smooth(FINE.gullyRugged[0], FINE.gullyRugged[1], rug) * smooth(FINE.gullySlope[0], FINE.gullySlope[1], slope);
        if (m <= 0) continue;
        // (coming and going from place to place: some stretches of a range deeply dissected, others smoother)
        place(j, i);
        const v = smoothNoise(P[0] * ps, P[1] * ps, P[2] * ps, seed * 5 + 11) + 0.5 * smoothNoise(P[0] * ps * 2.3, P[1] * ps * 2.3, P[2] * ps * 2.3, seed * 5 + 12);
        const patchy = FINE.gullyCalm + (1 - FINE.gullyCalm) * smooth(-0.35, 0.35, v);
        if (!lith) { amp[p] = m * Math.min(1, rug / FINE.gullyFullKm) * (FINE.gullyDry + (1 - FINE.gullyDry) * val(d.wet)) * (0.85 + 0.3 * val(d.young)) * patchy; continue; }
        // (by the rock: soft rock cut densely — where it is dry too, a badland's — hard rock sparsely)
        const dis = lith.dissect[p], wet = Math.max(val(d.wet), FINE.badlands * smooth(0.6, 0.9, dis));
        amp[p] = m * Math.min(1, rug / FINE.gullyFullKm) * (FINE.gullyDry + (1 - FINE.gullyDry) * wet) * (0.85 + 0.3 * val(d.young)) * patchy * (dis / 0.5) ** FINE.dissectPower * (1 - FINE.karstCalm * karst[p]);
        spec[p] = FINE.dissectSpectrum * (0.5 - dis);
    }
    const side = new Float32Array(N).fill(1);
    let oct = 0;
    for (let lam = lam0; drawn && fade(lam) > 0 && oct < 7; lam /= 2, oct++) {
        // (the coarsest octaves subdued: the big valleys are the mesh's own)
        const f = octaveF(lam), A = FINE.gullyGamma * lam * (lam / 12) ** FINE.gullySpectrum * f, s = seed * 31 + oct * 7919, lnL = Math.log(lam / 12);
        if (!(f > 0.02)) continue;
        for (let j = 0; j < eh; j++) for (let i = 0; i < ew; i++) {
            const p = j * ew + i;
            if (!(amp[p] > 0)) continue;
            // (finer valleys line the coarser ones' sides: none on their crests and floors, which stay whole — so they
            // branch off the bigger valleys rather than combing the slope)
            const gate = smooth(0.15, 0.6, side[p]);
            if (gate <= 0) { side[p] = 0; continue; }
            // (the way down: the picture's slope, weighted so side valleys slant downstream, and the coarser octaves')
            const ge = FINE.gullyFollow * gE[p] + dE[p], gn = FINE.gullyFollow * gN[p] + dN[p], gl = Math.hypot(ge, gn);
            if (!(gl > 1e-6)) continue;
            place(j, i); toSpace(j, i, -gn / gl, ge / gl);
            const ph = phacelle(P[0], P[1], P[2], A3[0], A3[1], A3[2], lam, s);
            // (how high across the valley, its floor −1 … its crest 1: the floor narrower than the crest, but not creased —
            // a V's sharp floor drew a hairline in the hillshade at every valley)
            const prof = 2 * (0.5 * (1 + Math.cos(ph))) ** 0.75 - 1;
            side[p] = Math.abs(Math.sin(ph));
            // (never deeper than a share of the ground's height: a soft minimum, which has no kink)
            const a = A * amp[p] * (spec && spec[p] ? Math.exp(spec[p] * lnL) : 1), b = FINE.gullyMaxShare * Math.max(1e-4, hb[p]);
            D[p] += gate * (a * b / Math.hypot(a, b)) * prof;
        }
        gradient(D, dE, dN);
        if (signal?.aborted) return null;
    }

    lap('ridges');
    // ── the rock's structure: layered rock stepped where the ground slopes through it — each place's height measured
    // from the beds' gently tilted surface, through a stair of treads and risers rounded at foot and rim (benches, the
    // rims of mesas, stepped canyon walls; cuestas where the beds dip against the slope) — crisp where it is dry ──
    // (a lowering never deeper than a share of the ground's height: a soft minimum)
    const shareCap = (v, p) => { if (!(v < 0)) return v; const b = FINE.gullyMaxShare * Math.max(1e-4, hb[p]); return -(-v * b / Math.hypot(v, b)); };
    const [rLo, rHi] = FINE.bedRainMm;
    if (lith && bedOn) {
        const dipF = 1 / FINE.bedDipWaveKm, riser = FINE.bedRiser, centre = 0.5 * (1 - riser) * 0.6;
        for (let j = 0; j < eh; j++) for (let i = 0; i < ew; i++) {
            const p = j * ew + i;
            if (seaB[p] || !(lith.land[p] > 0) || !(hb[p] > 0)) continue;
            const bed = lith.bedded[p];
            if (bed > 0.02) {
                const slope = Math.hypot(gE[p] + dE[p], gN[p] + dN[p]), gate = smooth(FINE.bedSlope[0], FINE.bedSlope[1], slope);
                if (gate > 0) {
                    place(j, i);
                    const n1 = smoothNoise(P[0] * dipF, P[1] * dipF, P[2] * dipF, seed * 5 + 21), n2 = smoothNoise(P[0] * dipF * 2.3, P[1] * dipF * 2.3, P[2] * dipF * 2.3, seed * 5 + 22);
                    const t = FINE.bedStepKm * (1 + 0.25 * Math.max(-1, Math.min(1, 2.4 * n2))), fS = fade(t / slope);
                    if (fS > 0) {
                        // (the beds: each its own thickness, 0.6–1.4 of a step, and its own hardness — a cliff-former's riser
                        // full, a soft bed's faint — the tread's foot at each bed's top, then its riser up to the next;
                        // continuous across every bed's top, where the stair meets the slope)
                        const phi = (hb[p] + D[p] - FINE.bedDipKm * (n1 + 0.5 * n2)) / t;
                        let k = Math.floor(phi), lo = bedLevel(k, seed);
                        if (phi < lo) lo = bedLevel(--k, seed);
                        let hi = bedLevel(k + 1, seed);
                        if (phi >= hi) { lo = hi; hi = bedLevel(++k + 1, seed); }
                        const span = hi - lo, f = (phi - lo) / span, u = Math.max(0, Math.min(1, (f - (1 - riser)) / riser));
                        const crisp = FINE.bedWet + (1 - FINE.bedWet) * (1 - smooth(rLo, rHi, lith.P[p]));
                        D[p] += bed * crisp * gate * fS * shareCap(t * (span * bedHard(k, seed) * (u * u * (3 - 2 * u) - f) + centre), p);
                    }
                }
            }
        }
    }
    // ── the rock's own landforms, each from its rock and its climate: ice-scoured knobs on crystalline rock; karst's
    // closed hollows, packed close in the wet tropics ──
    if (lith && formsOn) {
        const [kC0, kC1] = FINE.knobColdC, [cT0, cT1] = FINE.cockpitTempC, [cR0, cR1] = FINE.cockpitRainMm, fK = 1 / FINE.knobKm, fH = 1 / FINE.hollowKm;
        for (let j = 0; j < eh; j++) for (let i = 0; i < ew; i++) {
            const p = j * ew + i;
            if (seaB[p] || !(lith.land[p] > 0) || !(hb[p] > 0)) continue;
            const T = lith.T[p], knob = lith.knobby[p], K = karst[p];
            // knobs: under the last ice age's ice, or worn in the cold — hummocks, streamlined along the ice's flow
            if (knF > 0.05 && knob > 0.05) {
                at(j, i);
                const ice = val(d.ice), w = knob * Math.max(ice, 0.6 * smooth(kC0, kC1, T)) * (1 - smooth(0.4, 1, 2 * val(d.rugged)));
                if (w > 0.005) {
                    place(j, i);
                    let v = smoothNoise(P[0] * fK, P[1] * fK, P[2] * fK, seed * 5 + 42) + 0.5 * smoothNoise(P[0] * fK * 2.2, P[1] * fK * 2.2, P[2] * fK * 2.2, seed * 5 + 43);
                    const s = smooth(0.05, 0.3, ice);
                    if (s > 0 && dirAt(d.iceDir, d.ice) > 1e-3) {
                        // (streamlined under the ice: ridges along its flow — the phase across it)
                        toSpace(j, i, -DIR[1], DIR[0]);
                        v *= 1 - s + s * (0.6 + 0.4 * Math.cos(phacelle(P[0], P[1], P[2], A3[0], A3[1], A3[2], 1.5 * FINE.knobKm, seed * 13 + 71)));
                    }
                    D[p] += shareCap(knF * FINE.knobAmpKm * w * v, p);
                }
            }
            // karst: closed hollows — in the wet tropics packed close and deeper (cockpits)
            if (hoF > 0 && K > 0.005) {
                const trop = smooth(cT0, cT1, T) * smooth(cR0, cR1, lith.P[p]);
                place(j, i);
                D[p] += shareCap(-hoF * FINE.hollowAmpKm * (1 + trop) * bumps(P[0] * fH, P[1] * fH, P[2] * fH, seed * 5 + 44, 0.7 * K * (1 + 0.3 * trop), 0.2, 0.42, 2, 2), p);
            }
        }
    }

    lap('rock');
    // ── dunes ──
    {
        const lam = FINE.duneKm, f = fade(lam);
        if (f > 0) for (let j = 0; j < eh; j++) for (let i = 0; i < ew; i++) {
            const p = j * ew + i;
            if (seaB[p]) continue;
            at(j, i);
            const e = smooth(0.3, 0.8, val(d.erg));
            if (e <= 0 || !(dirAt(d.wind, d.erg) > 1e-3)) continue;
            const m = val(d.duneMode), ue = DIR[0], un = DIR[1];
            place(j, i);
            let v = 0;
            // (across the wind: a gentle windward slope, a steep lee face; along it where the seasons' winds cross)
            if (m < 0.7) {
                toSpace(j, i, ue, un);
                const t = (phacelle(P[0], P[1], P[2], A3[0], A3[1], A3[2], lam, seed * 13 + 51) / TAU + 1) % 1, q = t < 0.75 ? t / 0.75 : (1 - t) / 0.25;
                v += (1 - smooth(0.3, 0.7, m)) * (2 * q * q * (3 - 2 * q) - 1);
            }
            if (m > 0.3) {
                toSpace(j, i, -un, ue);
                const ph = phacelle(P[0], P[1], P[2], A3[0], A3[1], A3[2], 0.8 * lam, seed * 13 + 52);
                v += smooth(0.3, 0.7, m) * (1 - 2 * Math.abs(ph) / Math.PI);
            }
            D[p] += f * FINE.duneAmpKm * e * v;
        }
    }

    lap('dunes');
    // ── the coast's headlands and coves: the coastline wandering by up to coastWiggleKm (more on rocky coasts, less on
    // active ones) — and by the rock: hard rock out as headlands, soft back into bays (its hardness read from the land
    // beside the coast, fading to none out at sea) ──
    const reach = 3 * FINE.coastWiggleKm;
    for (let j = 0; j < eh; j++) for (let i = 0; i < ew; i++) {
        const p = j * ew + i, dist = coastKm[p];
        if (Math.abs(dist) >= reach) continue;
        at(j, i);
        const L = FINE.coastWiggleKm * (0.35 + 0.65 * smooth(0.08, 0.6, 2 * val(d.rugged))) * (1 - 0.5 * val(d.active)), fL = fade(2 * L);
        if (!(fL > 0) || Math.abs(dist) >= 3 * L) continue;
        place(j, i);
        const sc = 1 / (3 * L), rock = lith ? 2 * FINE.coastRock * (lith.hard[p] - 0.5) * smooth(0, 0.5, lith.land[p]) : 0;
        const n = smoothNoise(P[0] * sc, P[1] * sc, P[2] * sc, seed * 5 + 13) + 0.5 * smoothNoise(P[0] * sc * 2.1, P[1] * sc * 2.1, P[2] * sc * 2.1, seed * 5 + 14) + rock;
        D[p] += fL * Math.max(FINE.coastMinSlope, Math.hypot(gE[p], gN[p])) * L * n * (1 - smooth(0, 3 * L, Math.abs(dist)));
    }

    lap('coasts');
    // ── the heights; the sea where they are below it at or near the picture's sea (no new inland seas: land stays land) ──
    const hf = new Float32Array(N), sea = new Uint8Array(N);
    for (let p = 0; p < N; p++) {
        const v = hb[p] + D[p];
        if (v < 0 && coastKm[p] < reach) { hf[p] = v; sea[p] = 1; } else hf[p] = v < 0 ? 0.001 : v;
    }
    crop(hf, out.h); crop(sea, out.sea); crop(watB, out.wat);
    lap('sea');
    return out;
}

/** A cubic B-spline near p1 (t = 0) … p2 (t = 1), p0 and p3 beside them: smoother than the pixels (it does not pass
 *  through them), its slope smooth too. */
function bs(p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t2 * t, u = 1 - t;
    return (u * u * u * p0 + (3 * t3 - 6 * t2 + 4) * p1 + (-3 * t3 + 3 * t2 + 3 * t + 1) * p2 + t3 * p3) / 6;
}
/** A Catmull–Rom between p1 (t = 0) and p2 (t = 1), p0 and p3 beside them. */
function cr(p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * ((-t3 + 2 * t2 - t) * p0 + (3 * t3 - 5 * t2 + 2) * p1 + (-3 * t3 + 4 * t2 + t) * p2 + (t3 - t2) * p3);
}

/** The distance (km) from each pixel to the nearest pixel of the other kind (sea ↔ land): + on land, − at sea — a chamfer
 *  distance, each row's east–west step its own (the pixels narrow toward the poles). */
function chamfer(sea, w, h, pxKm, cosLa) {
    const N = w * h, d = new Float32Array(N).fill(1e9);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const p = j * w + i, s = sea[p];
        if ((i > 0 && sea[p - 1] !== s) || (i < w - 1 && sea[p + 1] !== s) || (j > 0 && sea[p - w] !== s) || (j < h - 1 && sea[p + w] !== s)) d[p] = 0.5 * pxKm;
    }
    const pass = (j0, j1, dj, i0, i1, di) => {
        for (let j = j0; j !== j1; j += dj) {
            const ax = pxKm * Math.max(0.05, cosLa[j]), ay = pxKm, ad = Math.hypot(ax, ay), jj = j - dj;
            for (let i = i0; i !== i1; i += di) {
                const p = j * w + i, ii = i - di;
                let v = d[p];
                if (ii >= 0 && ii < w && d[j * w + ii] + ax < v) v = d[j * w + ii] + ax;
                if (jj >= 0 && jj < h) {
                    if (d[jj * w + i] + ay < v) v = d[jj * w + i] + ay;
                    if (ii >= 0 && ii < w && d[jj * w + ii] + ad < v) v = d[jj * w + ii] + ad;
                    const ib = i + di;
                    if (ib >= 0 && ib < w && d[jj * w + ib] + ad < v) v = d[jj * w + ib] + ad;
                }
                d[p] = v;
            }
        }
    };
    pass(0, h, 1, 0, w, 1);
    pass(h - 1, -1, -1, w - 1, -1, -1);
    for (let p = 0; p < N; p++) if (sea[p]) d[p] = -d[p];
    return d;
}

export { DRIVER_FIELDS };
