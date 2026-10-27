// Detail finer than the mesh (plans/V2_FINE_DETAIL_PLAN.md): the heights of a finished moment at any window of the planet,
// at any resolution — its picture of heights enlarged, plus a little of what a mesh of 7–15 km cells cannot hold, drawn
// from what the finish recorded (finish-drivers.js) and only below the mesh's own scale, octave by octave as the window's
// pixels allow (a coarser view and a finer one of the same place agree):
//   · ridges and valleys on steep ground — stripes aligned with the slope, each octave turned by the slope the coarser
//     ones left, so the finer run down into the coarser (the idea of Rune Skovbo Johansen's erosion filter, its "phacelle"
//     noise: kernels' stripes summed as phasors, the sum's phase taken, so they never wash out) — faint: strongest on wet,
//     rugged, young ranges, and coming and going from place to place, so no two ranges look alike;
//   · dunes in the sand seas, across the year's wind (or along it where the seasons' winds cross);
//   · the coast's headlands and coves.
// Plains and plateau tops get none. The rivers are the moment's own lines (drawn by the page and the exports). A window
// reads only its own pixels and a margin of a few km around them, so windows drawn apart (tiles, bands) meet.

import { DRIVER_FIELDS } from './finish-drivers.js';

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
    // dunes
    duneKm: 3.2, duneAmpKm: 0.05,
    // coasts: the coastline wandering by up to this (more on rocky coasts), on a slope of at least this
    coastWiggleKm: 2.2, coastMinSlope: 0.004,
};

/** What a finished moment's detail is drawn from: { r (the picture), d (its drivers, or null), seed, cellKm (the mesh's spacing) }. */
export function detailSource(fin, seed) {
    const r = fin.raster, cells = fin.cells ?? 2.5e6;
    return { r, d: r.drivers ?? null, seed, cellKm: 24200 / Math.sqrt(cells) };
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
    return { r: sub(src.r, ['heightM', 'ocean', 'water'], src.r.w / W), d: src.d ? sub(src.d, DRIVER_FIELDS, src.d.w / W) : null, seed: src.seed, cellKm: src.cellKm };
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
    for (let j = 0; j < eh; j++) for (let i = 0; i < ew; i++) {
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
        amp[p] = m * Math.min(1, rug / FINE.gullyFullKm) * (FINE.gullyDry + (1 - FINE.gullyDry) * val(d.wet)) * (0.85 + 0.3 * val(d.young)) * patchy;
    }
    const lam0 = Math.min(FINE.gullyMaxKm, FINE.gullyCells * src.cellKm), side = new Float32Array(N).fill(1);
    let oct = 0;
    for (let lam = lam0; fade(lam) > 0 && oct < 7; lam /= 2, oct++) {
        // (the coarsest octaves subdued: the big valleys are the mesh's own)
        const f = fade(lam) * smooth(1.02 * lam0, 0.45 * lam0, lam), A = FINE.gullyGamma * lam * (lam / 12) ** FINE.gullySpectrum * f, s = seed * 31 + oct * 7919;
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
            const a = A * amp[p], b = FINE.gullyMaxShare * Math.max(1e-4, hb[p]);
            D[p] += gate * (a * b / Math.hypot(a, b)) * prof;
        }
        gradient(D, dE, dN);
        if (signal?.aborted) return null;
    }

    lap('ridges');
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
    // active ones) ──
    const reach = 3 * FINE.coastWiggleKm;
    for (let j = 0; j < eh; j++) for (let i = 0; i < ew; i++) {
        const p = j * ew + i, dist = coastKm[p];
        if (Math.abs(dist) >= reach) continue;
        at(j, i);
        const L = FINE.coastWiggleKm * (0.35 + 0.65 * smooth(0.08, 0.6, 2 * val(d.rugged))) * (1 - 0.5 * val(d.active)), fL = fade(2 * L);
        if (!(fL > 0) || Math.abs(dist) >= 3 * L) continue;
        place(j, i);
        const sc = 1 / (3 * L), n = smoothNoise(P[0] * sc, P[1] * sc, P[2] * sc, seed * 5 + 13) + 0.5 * smoothNoise(P[0] * sc * 2.1, P[1] * sc * 2.1, P[2] * sc * 2.1, seed * 5 + 14);
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
