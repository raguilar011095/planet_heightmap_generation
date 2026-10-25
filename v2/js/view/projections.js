// Map projections for the export (and, in Evolution's view, the same inverses in GLSL — projection-glsl.js): each one
// forward (longitude, latitude → x, y on the unit sphere's map) and inverse (x, y → longitude, latitude, or null outside
// the map's outline). An export is drawn from the equirectangular picture pixel by pixel through the inverse: every
// output pixel asks which longitude and latitude it shows and samples the source there — nearest for colours and classes
// (no mixing across a Köppen border), bilinear for the heights and the other numbers. The source is already turned to
// its centre longitude, so longitude 0 here is the middle of the source. DOM-free.

const PI = Math.PI, HALF = PI / 2, TWO = 2 * PI, R2 = Math.SQRT2, D = PI / 180, S3 = Math.sqrt(3);
const wrap = (l) => ((l + PI) % TWO + TWO) % TWO - PI;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// Robinson's table: latitude every 5°, X (the parallel's length) and Y (its distance from the equator).
const RX = [1, 0.9986, 0.9954, 0.99, 0.9822, 0.973, 0.96, 0.9427, 0.9216, 0.8962, 0.8679, 0.835, 0.7986, 0.7597, 0.7186, 0.6732, 0.6213, 0.5722, 0.5322];
const RY = [0, 0.062, 0.124, 0.186, 0.248, 0.31, 0.372, 0.434, 0.4958, 0.5571, 0.6176, 0.6769, 0.7346, 0.7903, 0.8435, 0.8936, 0.9394, 0.9761, 1];
function robTable(a) { const i = Math.min(17, Math.floor(a / 5)), t = a / 5 - i; return [RX[i] + (RX[i + 1] - RX[i]) * t, RY[i] + (RY[i + 1] - RY[i]) * t]; }
function robInvY(Y) { let i = 0; while (i < 17 && RY[i + 1] < Y) i++; return 5 * (i + (Y - RY[i]) / (RY[i + 1] - RY[i])); }
// Equal Earth (Šavrič, Patterson, Jenny 2018)
const EE = [1.340264, -0.081106, 0.000893, 0.003796];
const eeY = (t) => EE[0] * t + EE[1] * t ** 3 + EE[2] * t ** 7 + EE[3] * t ** 9;
const eeDy = (t) => EE[0] + 3 * EE[1] * t * t + 7 * EE[2] * t ** 6 + 9 * EE[3] * t ** 8;
const EE_TMAX = Math.asin(S3 / 2);
/** Mollweide's θ: 2θ + sin 2θ = π sin φ (Newton). */
function mollTheta(phi) {
    const k = PI * Math.sin(phi); let t = phi;
    for (let i = 0; i < 12; i++) { const f = 2 * t + Math.sin(2 * t) - k, d = 2 + 2 * Math.cos(2 * t); if (d < 1e-9) break; const dt = f / d; t -= dt; if (Math.abs(dt) < 1e-10) break; }
    return t;
}
/** The azimuthals' inverse, the centre at latitude p0: (x, y, the angular distance c) → [lon, lat]. */
function azimuthalInverse(x, y, r, c, p0) {
    const sc = Math.sin(c), cc = Math.cos(c);
    const p = Math.asin(clamp(cc * Math.sin(p0) + (r ? y * sc * Math.cos(p0) / r : 0), -1, 1));
    const l = Math.atan2(x * sc, r * cc * Math.cos(p0) - y * sc * Math.sin(p0));
    return [l, p];
}

/** Each projection: label, a note, bounds(o) → [xmin, xmax, ymin, ymax], fwd(lon, lat, o) → [x, y] | null, inv(x, y, o) → [lon, lat] | null. */
export const P = {
    equirect: { label: 'Equirectangular', note: '2 : 1, the grid as straight lines', bounds: () => [-PI, PI, -HALF, HALF], fwd: (l, p) => [l, p], inv: (x, y) => [x, y] },
    mercator: { label: 'Mercator', note: 'conformal; the poles cut at the max latitude',
        bounds: (o) => { const m = Math.log(Math.tan(PI / 4 + (o.maxLat ?? 85) * D / 2)); return [-PI, PI, -m, m]; },
        fwd: (l, p, o) => (Math.abs(p) > (o.maxLat ?? 85) * D ? null : [l, Math.log(Math.tan(PI / 4 + p / 2))]),
        inv: (x, y) => [x, 2 * Math.atan(Math.exp(y)) - HALF] },
    robinson: { label: 'Robinson', note: 'the atlas compromise; straight parallels',
        bounds: () => [-0.8487 * PI, 0.8487 * PI, -1.3523, 1.3523],
        fwd: (l, p) => { const [X, Y] = robTable(Math.abs(p) / D); return [0.8487 * X * l, 1.3523 * Y * Math.sign(p)]; },
        inv: (x, y) => { const Y = Math.abs(y) / 1.3523; if (Y > 1) return null; const a = robInvY(Y), X = robTable(a)[0], l = x / (0.8487 * X); return Math.abs(l) > PI ? null : [l, a * D * Math.sign(y)]; } },
    equalearth: { label: 'Equal Earth', note: 'equal-area',
        bounds: () => [-2 * S3 * PI / (3 * eeDy(0)), 2 * S3 * PI / (3 * eeDy(0)), -eeY(EE_TMAX), eeY(EE_TMAX)],
        fwd: (l, p) => { const t = Math.asin(S3 / 2 * Math.sin(p)); return [2 * S3 * l * Math.cos(t) / (3 * eeDy(t)), eeY(t)]; },
        inv: (x, y) => {
            let t = y;
            for (let i = 0; i < 12; i++) { const dt = (eeY(t) - y) / eeDy(t); t -= dt; if (Math.abs(dt) < 1e-10) break; }
            if (Math.abs(t) > EE_TMAX + 1e-9) return null;
            const l = 3 * x * eeDy(t) / (2 * S3 * Math.cos(t));
            return Math.abs(l) > PI ? null : [l, Math.asin(clamp(Math.sin(t) / (S3 / 2), -1, 1))];
        } },
    mollweide: { label: 'Mollweide', note: 'equal-area, a 2 : 1 ellipse',
        bounds: () => [-2 * R2, 2 * R2, -R2, R2],
        fwd: (l, p) => { const t = mollTheta(p); return [2 * R2 / PI * l * Math.cos(t), R2 * Math.sin(t)]; },
        inv: (x, y) => {
            const s = y / R2; if (Math.abs(s) > 1) return null;
            const t = Math.asin(s), p = Math.asin(clamp((2 * t + Math.sin(2 * t)) / PI, -1, 1)), c = Math.cos(t);
            if (c < 1e-9) return Math.abs(x) < 1e-9 ? [0, p] : null;
            const l = PI * x / (2 * R2 * c); return Math.abs(l) > PI + 1e-9 ? null : [l, p];
        } },
    hammer: { label: 'Hammer', note: 'equal-area, curved parallels',
        bounds: () => [-2 * R2, 2 * R2, -R2, R2],
        fwd: (l, p) => { const d = Math.sqrt(1 + Math.cos(p) * Math.cos(l / 2)); return [2 * R2 * Math.cos(p) * Math.sin(l / 2) / d, R2 * Math.sin(p) / d]; },
        inv: (x, y) => { const z2 = 1 - (x / 4) ** 2 - (y / 2) ** 2; if (z2 < 0.5) return null; const z = Math.sqrt(z2); return [2 * Math.atan2(z * x, 2 * (2 * z2 - 1)), Math.asin(clamp(z * y, -1, 1))]; } },
    winkel: { label: 'Winkel Tripel', note: 'a balance of area, angle and distance',
        bounds: (o) => { const c1 = Math.cos((o.par ?? 50.46) * D); return [-0.5 * (PI * c1 + PI), 0.5 * (PI * c1 + PI), -HALF, HALF]; },
        fwd: (l, p, o) => {
            const c1 = Math.cos((o.par ?? 50.46) * D), a = Math.acos(clamp(Math.cos(p) * Math.cos(l / 2), -1, 1)), sc = a < 1e-9 ? 1 : Math.sin(a) / a;
            return [0.5 * (l * c1 + 2 * Math.cos(p) * Math.sin(l / 2) / sc), 0.5 * (p + Math.sin(p) / sc)];
        },
        inv: (x, y, o) => {
            const c1 = Math.cos((o.par ?? 50.46) * D); let l = 2 * x / (c1 + 1), p = y;
            for (let i = 0; i < 30; i++) {
                const f = P.winkel.fwd(l, p, o), fx = f[0] - x, fy = f[1] - y;
                if (Math.abs(fx) + Math.abs(fy) < 1e-10) break;
                const e = 1e-6, a = P.winkel.fwd(l + e, p, o), b = P.winkel.fwd(l, p + e, o);
                const j11 = (a[0] - f[0]) / e, j12 = (b[0] - f[0]) / e, j21 = (a[1] - f[1]) / e, j22 = (b[1] - f[1]) / e, det = j11 * j22 - j12 * j21;
                if (Math.abs(det) < 1e-14) return null;
                l -= (j22 * fx - j12 * fy) / det; p -= (-j21 * fx + j11 * fy) / det;
                if (Math.abs(p) > HALF + 0.2 || Math.abs(l) > PI + 0.4) return null;
            }
            if (Math.abs(l) > PI + 1e-6 || Math.abs(p) > HALF + 1e-6) return null;
            const f = P.winkel.fwd(l, p, o);
            return Math.abs(f[0] - x) + Math.abs(f[1] - y) < 1e-6 ? [clamp(l, -PI, PI), clamp(p, -HALF, HALF)] : null;
        } },
    ortho: { label: 'Orthographic', note: 'the globe from far away; one hemisphere, or two opposite ones side by side',
        bounds: (o) => ((o.hemis ?? 2) === 2 ? [-2.12, 2.12, -1.06, 1.06] : [-1.04, 1.04, -1.04, 1.04]),
        fwd: (l, p, o) => {
            const two = (o.hemis ?? 2) === 2, p0 = (o.lat0 ?? 20) * D;
            for (let h = 0; h < (two ? 2 : 1); h++) {
                const lh = wrap(l - h * PI), cosc = Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(lh);
                if (cosc < 0) continue;
                return [Math.cos(p) * Math.sin(lh) + (two ? (h ? 1.06 : -1.06) : 0), Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(lh), h];
            }
            return null;
        },
        inv: (x, y, o) => {
            const two = (o.hemis ?? 2) === 2, p0 = (o.lat0 ?? 20) * D; let h = 0;
            if (two) { h = x > 0 ? 1 : 0; x -= h ? 1.06 : -1.06; }
            const r = Math.hypot(x, y); if (r > 1) return null;
            const [l, p] = azimuthalInverse(x, y, r, Math.asin(r), p0); return [wrap(l + h * PI), p];
        } },
    vdg: { label: 'Van der Grinten', note: 'the whole world in a circle, the old atlas look',
        bounds: () => [-PI, PI, -PI, PI],
        fwd: (l, p) => {
            // (Snyder 1987, 29-6a … 29-6e)
            if (Math.abs(p) < 1e-9) return [l, 0];
            const th = Math.asin(clamp(2 * Math.abs(p) / PI, 0, 1));
            if (Math.abs(l) < 1e-9 || Math.abs(Math.abs(p) - HALF) < 1e-9) return [0, Math.sign(p) * PI * Math.tan(th / 2)];
            const A = Math.abs(PI / l - l / PI) / 2, G = Math.cos(th) / (Math.sin(th) + Math.cos(th) - 1), P = G * (2 / Math.sin(th) - 1), Q = A * A + G, P2 = P * P, A2 = A * A;
            const x = Math.sign(l) * PI * (A * (G - P2) + Math.sqrt(Math.max(0, A2 * (G - P2) ** 2 - (P2 + A2) * (G * G - P2)))) / (P2 + A2);
            const y = Math.sign(p) * PI * (P * Q - A * Math.sqrt(Math.max(0, (A2 + 1) * (P2 + A2) - Q * Q))) / (P2 + A2);
            return [x, y];
        },
        inv: (x, y) => {
            // (Snyder 1987, 29-7 … 29-16)
            const X = x / PI, Y = y / PI, X2 = X * X, Y2 = Y * Y; if (X2 + Y2 > 1) return null;
            if (Math.abs(Y) < 1e-12) return Math.abs(X) > 1 ? null : [x, 0];
            const c1 = -Math.abs(Y) * (1 + X2 + Y2), c2 = c1 - 2 * Y2 + X2, c3 = -2 * c1 + 1 + 2 * Y2 + (X2 + Y2) ** 2;
            const d = Y2 / c3 + (2 * c2 ** 3 / c3 ** 3 - 9 * c1 * c2 / (c3 * c3)) / 27, a1 = (c1 - c2 * c2 / (3 * c3)) / c3, m1 = 2 * Math.sqrt(-a1 / 3);
            const t1 = Math.acos(clamp(3 * d / (a1 * m1), -1, 1)) / 3;
            const p = PI * (-m1 * Math.cos(t1 + PI / 3) - c2 / (3 * c3)) * Math.sign(Y);
            const l = Math.abs(X) < 1e-12 ? 0 : PI * (X2 + Y2 - 1 + Math.sqrt(1 + 2 * (X2 - Y2) + (X2 + Y2) ** 2)) / (2 * X);
            return Math.abs(l) > PI + 1e-9 ? null : [l, clamp(p, -HALF, HALF)];
        } },
    azeq: { label: 'Azimuthal equidistant', note: 'true distance and bearing from the centre; polar when centred on a pole',
        bounds: (o) => { const r = (o.extent ?? 'world') === 'world' ? PI : HALF; return [-r, r, -r, r]; },
        fwd: (l, p, o) => {
            const p0 = (o.lat0 ?? 90) * D, cosc = clamp(Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(l), -1, 1), c = Math.acos(cosc);
            if ((o.extent ?? 'world') !== 'world' && c > HALF) return null;
            const k = c < 1e-9 ? 1 : c / Math.sin(c);
            return [k * Math.cos(p) * Math.sin(l), k * (Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(l))];
        },
        inv: (x, y, o) => {
            const r = Math.hypot(x, y), lim = (o.extent ?? 'world') === 'world' ? PI : HALF; if (r > lim) return null;
            return azimuthalInverse(x, y, r, r, (o.lat0 ?? 90) * D);
        } },

};

/** The projections offered, in order. */
export const PROJECTIONS = ['equirect', 'mercator', 'robinson', 'equalearth', 'mollweide', 'hammer', 'winkel', 'ortho', 'azeq', 'vdg'].map(id => ({ id, label: P[id].label, note: P[id].note }));
/** Each projection's own options (the centre longitude is shared by all): select or range. */
export const PROJECTION_OPTIONS = {
    mercator: [{ id: 'maxLat', label: 'Max latitude', type: 'select', values: [[85, '85°'], [80, '80°'], [75, '75°'], [70, '70°']], def: 85 }],
    winkel: [{ id: 'par', label: 'Standard parallel', type: 'select', values: [[50.46, '50.5° (Winkel’s)'], [40, '40°'], [60, '60°']], def: 50.46 }],
    ortho: [{ id: 'lat0', label: 'Centre latitude', type: 'range', min: -90, max: 90, def: 20 }, { id: 'hemis', label: 'Hemispheres', type: 'select', values: [[2, 'two, opposite'], [1, 'one']], def: 2 }],
    azeq: [{ id: 'lat0', label: 'Centre latitude', type: 'range', min: -90, max: 90, def: 90 }, { id: 'extent', label: 'Extent', type: 'select', values: [['world', 'the whole world'], ['hemi', 'a hemisphere']], def: 'world' }],
};

/** The size of a map `W` wide in a projection: its height follows the outline's shape (equirectangular: W / 2). */
export function projectionSize(id, W, opts = {}) {
    const [x0, x1, y0, y1] = P[id].bounds(opts);
    return { w: W, h: Math.max(1, Math.round(W * (y1 - y0) / (x1 - x0))) };
}

/**
 * A layer ({ kind: 'rgba' | 'gray16' | 'gray8', W, H, data }, equirectangular, its centre longitude in the middle) drawn
 * in a projection: every output pixel inverse-projected and the source sampled there — nearest for colours and 8-bit
 * classes, bilinear for 16-bit numbers; outside the outline clear (colour) or 0 (greys). The inverse is worked on a grid
 * of nodes 8 px apart and interpolated between them (the inverses are smooth), exactly again where a cell crosses the
 * outline or a seam. Returns a new layer (`alpha` set on a colour layer).
 */
export function projectLayer(layer, id, opts = {}) {
    if (id === 'equirect') return layer;
    const pr = P[id], [x0, x1, y0, y1] = pr.bounds(opts), { W: SW, H: SH, kind, data: src } = layer, { w: W, h: H } = projectionSize(id, SW, opts);
    const ch = kind === 'rgba' ? 4 : 1, out = kind === 'rgba' ? new Uint8ClampedArray(W * H * 4) : kind === 'gray16' ? new Uint16Array(W * H) : new Uint8Array(W * H);
    const bilinear = kind === 'gray16';
    const xOf = (i) => x0 + (i + 0.5) / W * (x1 - x0), yOf = (j) => y1 - (j + 0.5) / H * (y1 - y0);
    // the nodes
    const STEP = 8, NX = Math.ceil(W / STEP) + 1, NY = Math.ceil(H / STEP) + 1, nl = new Float64Array(NX * NY), np = new Float64Array(NX * NY), ok = new Uint8Array(NX * NY);
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
        const r = pr.inv(x0 + Math.min(W, i * STEP) / W * (x1 - x0), y1 - Math.min(H, j * STEP) / H * (y1 - y0), opts), k = j * NX + i;
        if (r) { nl[k] = r[0]; np[k] = r[1]; ok[k] = 1; }
    }
    const sample = (lon, lat, o) => {
        const sx = (lon / TWO + 0.5) * SW - 0.5, sy = (0.5 - lat / PI) * SH - 0.5;
        if (!bilinear) {
            const ix = ((Math.round(sx) % SW) + SW) % SW, iy = clamp(Math.round(sy), 0, SH - 1), s = (iy * SW + ix) * ch;
            if (ch === 4) { out[o] = src[s]; out[o + 1] = src[s + 1]; out[o + 2] = src[s + 2]; out[o + 3] = 255; } else out[o] = src[s];
            return;
        }
        const fx0 = Math.floor(sx), fy0 = Math.floor(sy), tx = sx - fx0, ty = sy - fy0;
        const ax = ((fx0 % SW) + SW) % SW, bx = (ax + 1) % SW, ay = clamp(fy0, 0, SH - 1), by = clamp(fy0 + 1, 0, SH - 1);
        out[o] = Math.round((src[ay * SW + ax] * (1 - tx) + src[ay * SW + bx] * tx) * (1 - ty) + (src[by * SW + ax] * (1 - tx) + src[by * SW + bx] * tx) * ty);
    };
    for (let j = 0; j < H; j++) {
        const nj = Math.floor(j / STEP), fy = (j + 0.5) / STEP - nj, y = yOf(j);
        for (let i = 0; i < W; i++) {
            const ni = Math.floor(i / STEP), k = nj * NX + ni, o = (j * W + i) * ch;
            let lon, lat;
            const a = ok[k] && ok[k + 1] && ok[k + NX] && ok[k + NX + 1];
            if (a && Math.abs(nl[k] - nl[k + 1]) < 1 && Math.abs(nl[k] - nl[k + NX]) < 1 && Math.abs(nl[k] - nl[k + NX + 1]) < 1) {
                const fx = (i + 0.5) / STEP - ni;
                lon = (nl[k] * (1 - fx) + nl[k + 1] * fx) * (1 - fy) + (nl[k + NX] * (1 - fx) + nl[k + NX + 1] * fx) * fy;
                lat = (np[k] * (1 - fx) + np[k + 1] * fx) * (1 - fy) + (np[k + NX] * (1 - fx) + np[k + NX + 1] * fx) * fy;
            } else {
                const r = pr.inv(xOf(i), y, opts);
                if (!r) continue;                                        // (outside: clear / 0, as allocated)
                lon = r[0]; lat = r[1];
            }
            sample(wrap(lon), clamp(lat, -HALF, HALF), o);
        }
    }
    return { kind, W, H, data: out, alpha: kind === 'rgba' };
}

/** Graticule and outline paths in a projection's map space (for a preview or a legend): [[x, y], …] per line. */
export function graticulePaths(id, opts = {}, stepDeg = 30) {
    const pr = P[id], out = [], step = stepDeg * D;
    const line = (pts) => { let cur = []; let prev = null; for (const q of pts) { const f = pr.fwd(q[0], q[1], opts); if (!f || (prev && (f[2] !== prev[2] || Math.hypot(f[0] - prev[0], f[1] - prev[1]) > 1))) { if (cur.length > 1) out.push(cur); cur = []; } if (f) cur.push([f[0], f[1]]); prev = f; } if (cur.length > 1) out.push(cur); };
    for (let l = -PI; l <= PI + 1e-9; l += step) { const pts = []; for (let p = -HALF; p <= HALF + 1e-9; p += D) pts.push([Math.min(PI, l), Math.min(HALF, p)]); line(pts); }
    for (let p = -HALF + step; p < HALF - 1e-9; p += step) { const pts = []; for (let l = -PI; l <= PI + 1e-9; l += D / 2) pts.push([Math.min(PI, l), p]); line(pts); }
    return out;
}
