// The Evolution page's side of the Finish step (plans/V2_FINISH_PLAN.md): the worker that finishes a moment
// (finish/finish-worker.js) — kept between finishes where asked (keep), so a fine mesh it built is built once — and the
// painting of a finished moment, its picture of heights, onto the page's textures: coloured by the palette and shaded as
// the live terrain is.

export class FinishService {
    constructor() { this.worker = null; this.jobs = new Map(); this.next = 1; }

    /**
     * Finish a moment. keep: the worker stays afterwards, with the mesh it built (a 10M-cell mesh takes ~15 s; a 640K one
     * under a second — its ~0.3 GB is not worth keeping); else it goes, its memory with it.
     * @returns {Promise<{raster: {w, h, heightM, ocean}, stats, ms}>} (rejects with an AbortError if cancelled)
     */
    finish(msg, { onStage = null, onProgress = null, keep = true } = {}) {
        const w = this.start(), id = this.next++;
        return new Promise((resolve, reject) => {
            this.jobs.set(id, { resolve, reject, onStage, onProgress, keep });
            w.postMessage({ type: 'finish', id, ...msg, delaunatorUrl: import.meta.resolve('delaunator') });
        });
    }

    /** Stop a finish under way (the worker goes, and with it the meshes it held). */
    cancel() {
        if (!this.worker) return;
        this.worker.terminate(); this.worker = null;
        for (const j of this.jobs.values()) j.reject(new DOMException('The finish was cancelled', 'AbortError'));
        this.jobs.clear();
    }

    start() {
        if (this.worker) return this.worker;
        const w = this.worker = new Worker(new URL('../finish/finish-worker.js', import.meta.url), { type: 'module' });
        w.onmessage = ({ data }) => {
            const j = this.jobs.get(data.id);
            if (!j) return;
            if (data.type === 'stage') j.onStage?.(data.stage);
            else if (data.type === 'progress') j.onProgress?.(data.share);
            else if (data.type === 'done') { this.jobs.delete(data.id); j.resolve(data); }
            else { this.jobs.delete(data.id); j.reject(new Error(data.message)); }
            if ((data.type === 'done' || data.type === 'error') && !j.keep && !this.jobs.size && this.worker === w) { w.terminate(); this.worker = null; }
        };
        w.onerror = e => {
            for (const j of this.jobs.values()) j.reject(new Error(e.message || 'the finishing worker stopped (out of memory?)'));
            this.jobs.clear(); w.terminate(); if (this.worker === w) this.worker = null;
        };
        return w;
    }
}

/**
 * A finished picture at width W (× W/2): its heights (km), its sea (1) and, with `lakes`, its lakes (finish-hydro.js Water
 * kinds). Narrower than the picture, each pixel is the mean of its block (the sea, a lake, where at least half of it is);
 * wider — an export enlarged for use downstream — heights by a clamped bicubic (Catmull–Rom, held within the four nearest
 * values: smooth, with no halos), the sea and the lakes by the weighted majority of the four nearest pixels (coasts and
 * shores that curve rather than step). `landOnly`: the land's own heights — a block's land pixels; enlarged, the sea as 0 m.
 */
export function rasterAt(r, W, { lakes = false, landOnly = false } = {}) {
    const H = W >> 1, h = new Float32Array(W * H), sea = new Uint8Array(W * H), wat = lakes && r.water ? new Uint8Array(W * H) : null, k = r.w / W;
    const val = i => (landOnly ? (r.ocean[i] ? 0 : Math.max(0, r.heightM[i])) : r.heightM[i]);
    if (k >= 1) {
        const K = Math.round(k);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            let s = 0, n = 0, m = 0, cnt = 0, wk = 0, wn = 0;
            for (let dy = 0; dy < K; dy++) for (let dx = 0; dx < K; dx++) {
                const i = (y * K + dy) * r.w + x * K + dx;
                if (!landOnly || !r.ocean[i]) { s += r.heightM[i]; n++; }
                m += r.ocean[i]; cnt++;
                if (wat && r.water[i]) { wk = r.water[i]; wn++; }
            }
            const p = y * W + x;
            h[p] = (n ? s / n : 0) / 1000; sea[p] = 2 * m >= cnt ? 1 : 0;
            if (wat && 2 * wn >= cnt) wat[p] = wk;
        }
        return { h, sea, wat };
    }
    // (enlarged: each output pixel's place on the picture, its four columns — round the globe — and four rows, and the
    // Catmull–Rom weights of each)
    const cx = new Int32Array(4 * W), wx = new Float32Array(4 * W), fxs = new Float32Array(W);
    const cy = new Int32Array(4 * H), wy = new Float32Array(4 * H), fys = new Float32Array(H);
    const weights = (t, out, o) => { const t2 = t * t, t3 = t2 * t; out[o] = 0.5 * (-t3 + 2 * t2 - t); out[o + 1] = 0.5 * (3 * t3 - 5 * t2 + 2); out[o + 2] = 0.5 * (-3 * t3 + 4 * t2 + t); out[o + 3] = 0.5 * (t3 - t2); };
    for (let x = 0; x < W; x++) {
        const u = (x + 0.5) * k - 0.5, x0 = Math.floor(u);
        fxs[x] = u - x0; weights(fxs[x], wx, 4 * x);
        for (let d = 0; d < 4; d++) cx[4 * x + d] = ((x0 - 1 + d) % r.w + r.w) % r.w;
    }
    for (let y = 0; y < H; y++) {
        const v = (y + 0.5) * k - 0.5, y0 = Math.floor(v);
        fys[y] = v - y0; weights(fys[y], wy, 4 * y);
        for (let d = 0; d < 4; d++) cy[4 * y + d] = Math.min(r.h - 1, Math.max(0, y0 - 1 + d)) * r.w;
    }
    const kinds = [0, 0, 0, 0];
    for (let y = 0; y < H; y++) {
        const ry = 4 * y, fy = fys[y];
        for (let x = 0; x < W; x++) {
            const rx = 4 * x, fx = fxs[x];
            let s = 0;
            for (let j = 0; j < 4; j++) {
                const row = cy[ry + j];
                s += wy[ry + j] * (wx[rx] * val(row + cx[rx]) + wx[rx + 1] * val(row + cx[rx + 1]) + wx[rx + 2] * val(row + cx[rx + 2]) + wx[rx + 3] * val(row + cx[rx + 3]));
            }
            // (held within the four nearest: no ringing at a cliff or a coast)
            const a = cy[ry + 1] + cx[rx + 1], b = cy[ry + 1] + cx[rx + 2], c = cy[ry + 2] + cx[rx + 1], d = cy[ry + 2] + cx[rx + 2];
            const va = val(a), vb = val(b), vc = val(c), vd = val(d);
            s = Math.min(Math.max(va, vb, vc, vd), Math.max(Math.min(va, vb, vc, vd), s));
            const p = y * W + x, wa = (1 - fx) * (1 - fy), wb = fx * (1 - fy), wc = (1 - fx) * fy, wd = fx * fy;
            h[p] = s / 1000;
            sea[p] = wa * r.ocean[a] + wb * r.ocean[b] + wc * r.ocean[c] + wd * r.ocean[d] >= 0.5 ? 1 : 0;
            if (wat) {
                kinds[0] = kinds[1] = kinds[2] = kinds[3] = 0;
                kinds[r.water[a]] += wa; kinds[r.water[b]] += wb; kinds[r.water[c]] += wc; kinds[r.water[d]] += wd;
                let best = 0;
                for (let q = 1; q < 4; q++) if (kinds[q] > kinds[best]) best = q;
                wat[p] = best;
            }
        }
    }
    return { h, sea, wat };
}

/**
 * Paint a finished picture onto a texture ({width, image}: width × width/2): its heights averaged down (or enlarged,
 * rasterAt) to the texture's pixels, coloured by `lut` (looks.js heightLutOf — land by its height, the sea by its depth; a hollow
 * below sea level the ocean does not reach is land) and, for a shaded palette, hillshaded from the same light as the
 * live terrain (terrain-shade.js). `seaImage` (optional, RGBA of any width × width/2): 255 on the sea, for the glint.
 * `colorAt(out, o, x, y, wet, kk, k3, v, lake)` (optional): another colouring per pixel — a climate layer's
 * (climate-view.js finishedClimateColor) — given the pixel's light kk (0.35…1, always shaded), its palette entry k3, its
 * height v (km) and its lake kind (with `lakes`). `shaded: false` leaves the hillshade out (flat colour, the light 1 —
 * for an export to shade elsewhere).
 */
export function paintFinished(r, t, lut, { seaImage = null, seaWidth = 0, exaggeration = 20, lakes = false, colorAt = null, shaded = true } = {}) {
    const W = t.width, H = W >> 1, { h, sea, wat } = rasterAt(r, W, { lakes });
    const out = t.image.data, L = lut.rgb, { minM, stepM, zero } = lut, top = lut.n - 1;
    const pxKm = 2 * Math.PI * 6371 / W, Le = -0.5, Ln = 0.5, Lu = Math.SQRT1_2;
    for (let y = 0; y < H; y++) {
        const cl = Math.max(0.05, Math.cos(((y + 0.5) / H - 0.5) * Math.PI)), up = Math.max(0, y - 1) * W, dn = Math.min(H - 1, y + 1) * W;
        for (let x = 0; x < W; x++) {
            const i = y * W + x, v = h[i], wet = sea[i];
            let kk = 1;
            if (shaded && (lut.shaded || colorAt)) {
                const ex = wet ? exaggeration * 0.35 : exaggeration;
                const ge = (h[y * W + (x + 1) % W] - h[y * W + (x - 1 + W) % W]) / (2 * pxKm * cl), gn = (h[up + x] - h[dn + x]) / (2 * pxKm);
                const px = -ex * ge, py = -ex * gn, len = Math.sqrt(px * px + py * py + 1);
                kk = 0.35 + 0.65 * Math.max(0, (px * Le + py * Ln + Lu) / len) / Lu;
            }
            const j = Math.round((v * 1000 - minM) / stepM), k3 = 3 * (wet ? Math.max(0, Math.min(zero - 1, j)) : Math.min(top, Math.max(zero, j)));
            const o = 4 * i;
            if (colorAt) { colorAt(out, o, x, y, wet, kk, k3, v, wat ? wat[i] : 0); continue; }
            if (wat && wat[i] && !wet) {
                // (a lake: flat water — fresh in the palette's shallow-water blue, salt a greener teal, a pan pale salt)
                const lk = wat[i] === 3 ? PAN_RGB : lakeRgb(lut, wat[i]);
                out[o] = lk[0]; out[o + 1] = lk[1]; out[o + 2] = lk[2]; out[o + 3] = 255;
                continue;
            }
            out[o] = Math.min(255, L[k3] * kk); out[o + 1] = Math.min(255, L[k3 + 1] * kk); out[o + 2] = Math.min(255, L[k3 + 2] * kk); out[o + 3] = 255;
        }
    }
    if (seaImage) {
        // (the glint: the sea — and the lakes)
        const SW = seaWidth, SH = SW >> 1, f = W / SW;
        for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
            const i = Math.min(H - 1, Math.floor((y + 0.5) * f)) * W + Math.min(W - 1, Math.floor((x + 0.5) * f));
            const v = sea[i] || (wat && (wat[i] === 1 || wat[i] === 2)) ? 255 : 0, o = 4 * (y * SW + x);
            seaImage[o] = seaImage[o + 1] = seaImage[o + 2] = v; seaImage[o + 3] = 255;
        }
    }
}

/**
 * Paint a window of the planet (fine-detail.js fineWindow: its heights, sea and lakes, `win` {W, x0, y0, w, h} — W the
 * full width it is a window of) onto an RGBA image `out` (w × h), as paintFinished paints the whole planet: the palette,
 * the hillshade from the same light, the lakes, `colorAt` (a climate layer's or the Satellite's colours, asked for at
 * the window's place on a W-wide planet).
 */
export function paintWindow(fw, win, out, lut, { exaggeration = 20, lakes = false, colorAt = null, shaded = true } = {}) {
    const { W, x0, y0, w, h } = win, HE = W >> 1, { h: hh, sea, wat } = fw, L = lut.rgb, { minM, stepM, zero } = lut, top = lut.n - 1;
    const pxKm = 2 * Math.PI * 6371 / W, Le = -0.5, Ln = 0.5, Lu = Math.SQRT1_2;
    for (let y = 0; y < h; y++) {
        const Y = Math.min(HE - 1, Math.max(0, y0 + y)), cl = Math.max(0.05, Math.cos(((Y + 0.5) / HE - 0.5) * Math.PI)), up = Math.max(0, y - 1) * w, dn = Math.min(h - 1, y + 1) * w;
        for (let x = 0; x < w; x++) {
            const i = y * w + x, v = hh[i], wet = sea[i];
            let kk = 1;
            if (shaded && (lut.shaded || colorAt)) {
                const ex = wet ? exaggeration * 0.35 : exaggeration;
                const ge = (hh[y * w + Math.min(w - 1, x + 1)] - hh[y * w + Math.max(0, x - 1)]) / ((x > 0 && x < w - 1 ? 2 : 1) * pxKm * cl), gn = (hh[up + x] - hh[dn + x]) / ((y > 0 && y < h - 1 ? 2 : 1) * pxKm);
                const px = -ex * ge, py = -ex * gn, len = Math.sqrt(px * px + py * py + 1);
                kk = 0.35 + 0.65 * Math.max(0, (px * Le + py * Ln + Lu) / len) / Lu;
            }
            const j = Math.round((v * 1000 - minM) / stepM), k3 = 3 * (wet ? Math.max(0, Math.min(zero - 1, j)) : Math.min(top, Math.max(zero, j)));
            const o = 4 * i;
            if (colorAt) { colorAt(out, o, ((x0 + x) % W + W) % W, Y, wet, kk, k3, v, lakes && wat ? wat[i] : 0); continue; }
            if (lakes && wat && wat[i] && !wet) {
                const lk = wat[i] === 3 ? PAN_RGB : lakeRgb(lut, wat[i]);
                out[o] = lk[0]; out[o + 1] = lk[1]; out[o + 2] = lk[2]; out[o + 3] = 255;
                continue;
            }
            out[o] = Math.min(255, L[k3] * kk); out[o + 1] = Math.min(255, L[k3 + 1] * kk); out[o + 2] = Math.min(255, L[k3 + 2] * kk); out[o + 3] = 255;
        }
    }
}

// ── lakes and rivers (plans/V2_FINISH_PLAN.md R2): cartographic — lakes flat water, rivers blue lines tapering with their
// discharge, seasonal ones dashed, those dry most of the year dotted; or coloured by their regime ──
const PAN_RGB = [226, 220, 204];
const lakeCache = new Map();
/** A lake's colour as the Terrain view draws it (fresh, salt, a pan) in a palette — for the exports' rivers-and-lakes layer. */
export const lakeColor = (lut, kind) => (kind === 3 ? PAN_RGB : lakeRgb(lut, kind));
/** A lake's colour in a palette: its water at ~150 m deep (fresh), turned toward teal (salt). */
function lakeRgb(lut, kind) {
    const key = `${lut.minM}|${lut.rgb[0]}|${lut.rgb[3 * (lut.zero - 15)]}|${kind}`;
    if (!lakeCache.has(key)) {
        const j = 3 * Math.max(0, lut.zero - 15), c = [lut.rgb[j], lut.rgb[j + 1], lut.rgb[j + 2]];
        // (a palette whose sea is not blue — Grey, Heightmap — still gets water-coloured lakes)
        const blue = c[2] > c[0] + 20 ? c : [70, 130, 200];
        lakeCache.set(key, kind === 2 ? [blue[0] * 0.6 + 40, blue[1] * 0.75 + 55, blue[2] * 0.7 + 25] : blue);
    }
    return lakeCache.get(key);
}

/** How a river is drawn at discharge q (m³/s) above the density's threshold q0 — a flow map (the lab's Drainage layer:
 *  developer, "much thinner and closer to the flow mapmode"): hairlines whose strength grows with the log of the discharge,
 *  the great rivers only a little wider. Its strength class 0…4 (alpha) and width (px of a 2048-wide texture). */
const riverStrength = (q, q0) => Math.max(0, Math.min(4, Math.round(4 * Math.log10(q / q0) / 2.5)));
const STRENGTH_ALPHA = [0.35, 0.5, 0.65, 0.8, 0.92], STRENGTH_WIDTH = [0.45, 0.55, 0.65, 0.8, 1.0];
/** A river point's regime (finish-hydro.js Regime), from its twelve monthly flows: 0 permanent, 1 permanent with a flood
 *  season, 2 seasonal (dry some months), 3 dry most of the year. */
const regimeAt = (R, i) => R.regime[i];
/** How each regime is drawn: its strength and dashes, and its colour when the rivers are coloured by regime (else all the
 *  rivers' blue). */
const RIVER_RGB = 'rgb(30, 90, 210)';
export const REGIME_STYLE = [
    { alpha: 1, dash: null, rgb: RIVER_RGB, name: 'Permanent' },
    { alpha: 1, dash: null, rgb: 'rgb(190, 50, 180)', name: 'Yearly flood season' },
    { alpha: 0.85, dash: [3.5, 1.5], rgb: 'rgb(0, 200, 225)', name: 'Seasonal' },
    { alpha: 0.7, dash: [1.1, 1.6], rgb: 'rgb(185, 105, 30)', name: 'Dry most of the year' },
];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** A river point's year in words: "permanent · floods Aug–Oct · fed from far upstream". */
export function riverYearWords(rv) {
    const w = [['permanent'], ['permanent', `floods ${MONTHS[rv.floodFrom]}${rv.floodTo !== rv.floodFrom ? `–${MONTHS[rv.floodTo]}` : ''}`], ['seasonal — dry some months'], ['dry most of the year']][rv.regime];
    if (rv.farFed) w.push('fed from far upstream');
    return w.join(' · ');
}

/**
 * The rivers of a finished moment as paths to draw (on a texture 2048 px wide; the caller scales for a sharper one):
 * every reach carrying at least q0 m³/s, split where it crosses the map's edge, smoothed (Chaikin, twice), its segments
 * gathered into one path per width and regime — a few dozen strokes for the whole planet. Cached per moment and q0.
 */
export function riverPaths(fin, q0) {
    fin.paths ??= new Map();
    if (fin.paths.has(q0)) return fin.paths.get(q0);
    const S = riverSegments(fin, q0), list = S.buckets.map(b => ({ ...b, path: new Path2D() }));
    for (let i = 0; i < S.count; i++) {
        const p = list[S.bucket[i]].path, o = 4 * i;
        if (!S.joined[i]) p.moveTo(S.xy[o], S.xy[o + 1]);
        p.lineTo(S.xy[o + 2], S.xy[o + 3]);
    }
    const sorted = S.order.map(b => list[b]);
    fin.paths.set(q0, sorted);
    return sorted;
}

/**
 * The rivers of a finished moment as segments, as riverPaths draws them: on a texture 2048 px wide, in the order drawn —
 * each with its bucket (a width and a regime: one stroke each), its bucket's segment before it, whether it carries on
 * from that one, and how far along its line it starts (where its dashes stand). Cached per moment and q0.
 */
function riverSegments(fin, q0) {
    fin.segments ??= new Map();
    if (fin.segments.has(q0)) return fin.segments.get(q0);
    const R = fin.rivers, W = 2048, H = 1024, keys = new Map(), buckets = [], xy = [], bucket = [], prev = [], joined = [], along = [], starts = [...R.start, R.lat.length];
    let maxLen = 0;
    const add = (str, reg, x0, y0, x1, y1) => {
        const key = `${str}|${reg}`;
        let b = keys.get(key);
        if (b === undefined) { keys.set(key, b = buckets.length); buckets.push({ strength: str, regime: reg, last: null, run: 0, at: -1 }); }
        const B = buckets[b], on = !!B.last && B.last[0] === x0 && B.last[1] === y0, len = Math.hypot(x1 - x0, y1 - y0);
        if (!on) B.run = 0;
        xy.push(x0, y0, x1, y1); bucket.push(b); prev.push(B.at); joined.push(on ? 1 : 0); along.push(B.run);
        B.run += len; B.last = [x1, y1]; B.at = bucket.length - 1; maxLen = Math.max(maxLen, len);
    };
    for (let r = 0; r < starts.length - 1; r++) {
        // (a reach below the threshold ends its line — a river that dries out is not bridged to where it flows again —
        // and a reach is split where it crosses the map's edge)
        const parts = [[]];
        for (let i = starts[r]; i < starts[r + 1]; i++) {
            if (!(R.q[i] >= q0)) { if (parts[parts.length - 1].length) parts.push([]); continue; }
            const p = [(R.lon[i] + 180) / 360 * W, (90 - R.lat[i]) / 180 * H, R.q[i], regimeAt(R, i)], cur = parts[parts.length - 1];
            if (cur.length && Math.abs(p[0] - cur[cur.length - 1][0]) > W / 2) parts.push([]);
            parts[parts.length - 1].push(p);
        }
        for (let pts of parts) {
            if (pts.length < 2) continue;
            for (let it = 0; it < 2; it++) {
                const nx = [pts[0]];
                // (the regime is not blended: each new point keeps its nearer point's)
                for (let i = 0; i < pts.length - 1; i++) {
                    const a = pts[i], b = pts[i + 1];
                    nx.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1], 0.75 * a[2] + 0.25 * b[2], a[3]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1], 0.25 * a[2] + 0.75 * b[2], b[3]]);
                }
                nx.push(pts[pts.length - 1]); pts = nx;
            }
            for (let i = 0; i < pts.length - 1; i++) {
                const a = pts[i], b = pts[i + 1];
                add(riverStrength(a[2], q0), a[3], a[0], a[1], b[0], b[1]);
            }
        }
    }
    const S = { count: bucket.length, xy: Float32Array.from(xy), bucket: Uint16Array.from(bucket), prev: Int32Array.from(prev), joined: Uint8Array.from(joined), along: Float32Array.from(along), maxLen,
        buckets: buckets.map(({ strength, regime }) => ({ strength, regime })), order: buckets.map((b, i) => i).sort((a, b) => buckets[a].strength - buckets[b].strength), grid: null };
    fin.segments.set(q0, S);
    return S;
}

/** A river bucket's stroke on a context: the rivers' blue or its regime's colour, `widthScale` times as thick. Its dashes, or null. */
function riverStyle(ctx, b, byRegime, widthScale) {
    const st = REGIME_STYLE[b.regime];
    // (coloured by regime, the colour tells it: not faded as well)
    ctx.strokeStyle = byRegime ? st.rgb : RIVER_RGB;
    ctx.globalAlpha = (byRegime ? 1 : st.alpha) * STRENGTH_ALPHA[b.strength]; ctx.lineWidth = STRENGTH_WIDTH[b.strength] * widthScale; ctx.setLineDash(st.dash ? st.dash.map(v => v * widthScale) : []);
    return st.dash;
}

/** Draw a moment's rivers on a texture's context (scaled by the caller to a 2048-wide texture's coordinates), in the rivers'
 *  blue or coloured by regime — `widthScale` times as thick (a context scaled far: the patch of finer detail's, as thin). */
export function drawRivers(ctx, paths, byRegime = false, widthScale = 1) {
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const b of paths) { riverStyle(ctx, b, byRegime, widthScale); ctx.stroke(b.path); }
    ctx.restore();
}

/**
 * A moment's rivers drawn as drawRivers draws them, on a window of a sharper picture: `W` px wide, the canvas's pixel
 * (0, 0) its pixel (x0, y0), w × h of them. Only the segments near the window are drawn (a grid of them, built once per
 * moment and q0) — so a tile of the zoomed-in view costs its own rivers, not the planet's — each line begun where its
 * dashes begin, a little before the window (so they stand where the whole line's do): windows side by side meet as one
 * picture would.
 */
export function drawRiversWindow(ctx, fin, q0, byRegime, W, x0, y0, w, h, widthScale = 1) {
    const S = riverSegments(fin, q0), k = W / 2048, G = S.grid ??= segmentGrid(S);
    // (how far past the window a segment's middle may lie and still touch it: half the longest segment, half the widest
    // line, a pixel's anti-aliasing — in the 2048-wide texture's px)
    const m = S.maxLen / 2 + 0.5 * STRENGTH_WIDTH[STRENGTH_WIDTH.length - 1] * widthScale + 2 / k;
    const ya = Math.max(0, Math.floor((y0 / k - m) / G.C)), yb = Math.min(G.GH - 1, Math.floor(((y0 + h) / k + m) / G.C));
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const turn of [-1, 0, 1]) {                                      // (a window across the date line: the rivers either side)
        const xa = Math.max(0, Math.floor((x0 / k - turn * 2048 - m) / G.C)), xb = Math.min(G.GW - 1, Math.floor(((x0 + w) / k - turn * 2048 + m) / G.C));
        if (xa > xb || ya > yb) continue;
        let n = 0;
        for (let gy = ya; gy <= yb; gy++) n += G.count[gy * G.GW + xb + 1] - G.count[gy * G.GW + xa];
        if (!n) continue;
        const near = new Int32Array(n);
        n = 0;
        for (let gy = ya; gy <= yb; gy++) for (let j = G.count[gy * G.GW + xa]; j < G.count[gy * G.GW + xb + 1]; j++) near[n++] = G.items[j];
        near.sort();
        ctx.setTransform(k, 0, 0, k, turn * W - x0, -y0);
        for (const b of S.order) {
            const dash = riverStyle(ctx, S.buckets[b], byRegime, widthScale), period = dash ? (dash[0] + dash[1]) * widthScale : 0;
            let last = -1, any = false;
            ctx.beginPath();
            for (const i of near) {
                if (S.bucket[i] !== b) continue;
                const o = 4 * i;
                if (!(S.joined[i] && S.prev[i] === last)) {
                    // (a line begun here, where the whole line carries on from the segment before: dashed, from where its
                    // dashes last began — back along the line — so they fall where the whole line's do)
                    let back = period ? S.along[i] % period : 0, j = i, from = null;
                    while (back > 0 && S.joined[j]) {
                        const p = S.prev[j], q = 4 * p, len = Math.hypot(S.xy[q + 2] - S.xy[q], S.xy[q + 3] - S.xy[q + 1]);
                        j = p;
                        if (len >= back) { const f = back / len; from = [S.xy[q + 2] + f * (S.xy[q] - S.xy[q + 2]), S.xy[q + 3] + f * (S.xy[q + 1] - S.xy[q + 3])]; break; }
                        back -= len;
                    }
                    if (j !== i && !from) from = [S.xy[4 * j], S.xy[4 * j + 1]];   // (the line's own start)
                    if (from) {
                        ctx.moveTo(from[0], from[1]);
                        const chain = [];
                        for (let q = S.prev[i]; ; q = S.prev[q]) { chain.push(q); if (q === j) break; }
                        for (let c = chain.length - 1; c >= 0; c--) ctx.lineTo(S.xy[4 * chain[c] + 2], S.xy[4 * chain[c] + 3]);
                    } else ctx.moveTo(S.xy[o], S.xy[o + 1]);
                }
                ctx.lineTo(S.xy[o + 2], S.xy[o + 3]);
                last = i; any = true;
            }
            if (any) ctx.stroke();
        }
    }
    ctx.restore();
}

/** The segments by where their middles lie: cells C px square of the 2048-wide texture, each cell's in the order drawn. */
function segmentGrid(S) {
    const C = 2, GW = 2048 / C, GH = 1024 / C, count = new Int32Array(GW * GH + 1), cell = new Int32Array(S.count);
    for (let i = 0; i < S.count; i++) {
        const o = 4 * i, gx = Math.min(GW - 1, Math.max(0, Math.floor((S.xy[o] + S.xy[o + 2]) / (2 * C)))), gy = Math.min(GH - 1, Math.max(0, Math.floor((S.xy[o + 1] + S.xy[o + 3]) / (2 * C))));
        count[(cell[i] = gy * GW + gx) + 1]++;
    }
    for (let c = 0; c < GW * GH; c++) count[c + 1] += count[c];
    const items = new Int32Array(S.count), at = count.slice(0, GW * GH);
    for (let i = 0; i < S.count; i++) items[at[cell[i]]++] = i;
    return { C, GW, GH, count, items };
}

/**
 * The river nearest a point of the map (u west → east, v north → south, 0…1), within `px` pixels of a 2048-wide texture,
 * among those drawn (q ≥ q0): {q, regime, floodFrom, floodTo, farFed} or null. A grid of the rivers' points, built once per moment and q0.
 */
export function riverAt(fin, q0, u, v, px = 3) {
    fin.grids ??= new Map();
    let g = fin.grids.get(q0);
    const W = 2048, H = 1024, C = 8, GW = W / C, GH = H / C;
    if (!g) {
        const R = fin.rivers, count = new Int32Array(GW * GH + 1);
        const cellOf = i => Math.min(GH - 1, Math.floor((90 - R.lat[i]) / 180 * H / C)) * GW + Math.min(GW - 1, Math.floor((R.lon[i] + 180) / 360 * W / C));
        for (let i = 0; i < R.q.length; i++) if (R.q[i] >= q0) count[cellOf(i) + 1]++;
        for (let k = 0; k < GW * GH; k++) count[k + 1] += count[k];
        const items = new Int32Array(count[GW * GH]), at = count.slice(0, GW * GH);
        for (let i = 0; i < R.q.length; i++) if (R.q[i] >= q0) items[at[cellOf(i)]++] = i;
        fin.grids.set(q0, g = { count, items });
    }
    const R = fin.rivers, x = u * W, y = v * H, cx = Math.floor(x / C), cy = Math.floor(y / C);
    let best = -1, bd = px * px;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const gy = cy + dy, gx = ((cx + dx) % GW + GW) % GW;
        if (gy < 0 || gy >= GH) continue;
        const k = gy * GW + gx;
        for (let j = g.count[k]; j < g.count[k + 1]; j++) {
            const i = g.items[j];
            let ddx = Math.abs((R.lon[i] + 180) / 360 * W - x); if (ddx > W / 2) ddx = W - ddx;
            const d2 = ddx * ddx + ((90 - R.lat[i]) / 180 * H - y) ** 2;
            if (d2 < bd) { bd = d2; best = i; }
        }
    }
    return best < 0 ? null : { q: R.q[best], regime: R.regime[best], floodFrom: R.floodFrom[best], floodTo: R.floodTo[best], farFed: R.farFed[best] };
}

/** The finished picture's height (m) and lake kind at a point of the map (u, v as riverAt). */
export function finishedAt(fin, u, v) {
    const r = fin.raster, i = Math.min(r.h - 1, Math.floor(v * r.h)) * r.w + Math.min(r.w - 1, Math.floor(u * r.w));
    return { heightM: r.heightM[i], ocean: r.ocean[i], water: r.water?.[i] ?? 0 };
}
