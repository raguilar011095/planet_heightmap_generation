// Colouring a height field: hypsometric tints (deep sea → shelf, lowland green → brown → rock → snow) and relief
// shading, per cell of whatever mesh the heights live on, or per pixel of a picture of heights. DOM-free.
//
// The shading is one of SHADE_STYLES: combinations of the cartographers' techniques (developer, 2026-10-26: the one
// north-west light was "mostly blobby" and gave its detail to the mountains alone) — one light or four, the slope as it
// is or its root, the local relief as a texture, Imhof's aerial perspective, a low sun. Every style gives 1 on flat
// ground, ~0 facing away from the light and ~1.4 facing it, so everything painted by a shade (0.35 + 0.65 × it, or
// 0.45 + 0.55 × it) reads any style alike.

const SEA_STOPS = [[-9, [8, 16, 48]], [-6, [18, 38, 92]], [-4, [26, 60, 128]], [-2, [40, 96, 164]], [-0.5, [70, 140, 196]], [0, [118, 182, 214]]];
const LAND_STOPS = [[0, [74, 122, 70]], [0.3, [104, 144, 82]], [0.8, [158, 164, 104]], [1.6, [166, 138, 92]], [2.6, [138, 110, 86]], [3.8, [128, 118, 112]], [5, [206, 206, 210]], [7, [255, 255, 255]]];

function ramp(stops, v, out, o) {
    if (v <= stops[0][0]) { const c = stops[0][1]; out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; return; }
    for (let i = 1; i < stops.length; i++) {
        if (v > stops[i][0] && i < stops.length - 1) continue;
        const a = stops[i - 1][0], ca = stops[i - 1][1], b = stops[i][0], cb = stops[i][1], t = Math.min(1, Math.max(0, (v - a) / (b - a)));
        out[o] = ca[0] + (cb[0] - ca[0]) * t; out[o + 1] = ca[1] + (cb[1] - ca[1]) * t; out[o + 2] = ca[2] + (cb[2] - ca[2]) * t;
        return;
    }
}

/** RGB of a height (km above sea level) on the hypsometric ramp. */
export function tintOf(km, out = [0, 0, 0], o = 0) { ramp(km < 0 ? SEA_STOPS : LAND_STOPS, km, out, o); return out; }

// ── the styles ──

/**
 * Relief shading styles — each a combination of techniques, as what it adds to the plain Lambert light:
 *  lights    1: one light from the azimuth asked. 4: the USGS multidirectional hillshade (Mark 1992) — four lights 45°
 *            apart round that azimuth (90° and 45° to its left, itself, 45° to its right), each slope lit mostly by the
 *            lights it faces obliquely (a light weighs sin² of the angle between it and the slope's aspect): no face is
 *            burnt out facing the light or lost along it, and ridges that run toward the light still show.
 *  curve     'linear': the slope as it is (× the exaggeration) — gentle slopes barely shade and steep ones saturate, so
 *            the mountains take all the relief. 'sqrt': the slope's square root (its exaggerated gradient g → √g, equal at
 *            45°) — a tonal compression that brings up the lowlands' gentle slopes and holds the steep ones back.
 *  texture   the local relief model (Hesse 2010; Leland Brown's texture shading; GIMP's high pass laid over in soft
 *            light): a cell's height above the mean height within ~TEXTURE_KM, darkening valleys and lightening ridges
 *            whichever way they run — the drainage and the plains' grain, which no light alone shows — × this much
 *            (0 … ~0.5); `textureLift`: the ridges' lightening as a share of the valleys' darkening (1: the overlay's
 *            even hand; 0.5: a sunlit ridge is not snow).
 *  range     the ranges as a whole (developer, 2026-10-26, their own maps: "blur the original height map, then rescale
 *            using a hybrid logistic curve … centered around 1000 meters ish, then do another hill shading there"): the
 *            heights blurred over ~RANGE_BLUR_KM, put through a logistic rise of RANGE_RISE_KM centred at RANGE_CENTER_KM
 *            (RANGE_WIDTH_KM wide, a little linear on either end) and lit by the same light at RANGE_EXAGGERATION × the
 *            strength — a soft shading of each belt's flanks, where the rain shadows fall — × this much.
 *  aerial    Imhof's aerial perspective: the shading's contrast fades by this share from AERIAL_TOP_KM down to the sea,
 *            so the ranges stand crisp over a hazier lowland.
 *  altitude  the light's height above the horizon (°). A low sun casts long shading across gentle ground.
 *  contrast  the shading's departure from flat × this (the four lights' tones are gentler by nature; they are stretched
 *            back, as the USGS does).
 */
const STYLE = (o) => ({ lights: 1, curve: 'linear', texture: 0, textureLift: 0.5, range: 0, aerial: 0, altitude: 45, contrast: 1, ...o });
export const SHADE_STYLES = {
    classic: STYLE({ name: 'Classic' }),
    soft: STYLE({ name: 'Soft', curve: 'sqrt' }),
    multi: STYLE({ name: 'Multidirectional', lights: 4, contrast: 2 }),
    textured: STYLE({ name: 'Textured', curve: 'sqrt', texture: 0.4 }),
    detailed: STYLE({ name: 'Detailed', lights: 4, curve: 'sqrt', texture: 0.4, contrast: 1.7 }),
    // (the developer's own process for their maps: the hillshade, a high-pass texture laid over it, and the ranges as a
    // whole beneath — in that order of strength)
    layered: STYLE({ name: 'Layered', texture: 0.35, textureLift: 0.7, range: 0.45 }),
    swiss: STYLE({ name: 'Swiss', lights: 4, curve: 'sqrt', texture: 0.3, aerial: 0.4, contrast: 1.7 }),
    dramatic: STYLE({ name: 'Dramatic', texture: 0.25, altitude: 25, contrast: 1.25 }),
};
/** The local relief model's radius (its mean height's σ, km) and the relief (km) at which the texture reaches half strength. */
export const TEXTURE_KM = 50, TEXTURE_SCALE_KM = 0.15;
/** The range shading: the blur's σ (km); the logistic's centre, width and rise (km) and the linear part's slope. */
export const RANGE_BLUR_KM = 120, RANGE_CENTER_KM = 1, RANGE_WIDTH_KM = 0.35, RANGE_RISE_KM = 2.5, RANGE_LINEAR = 0.1;
/** The range shade's slope exaggeration, × the strength chosen (a blurred belt's flanks are gentle). */
export const RANGE_EXAGGERATION = 2;
/** The height (km) above which the aerial perspective leaves the shading its full contrast. */
export const AERIAL_TOP_KM = 3;
export const DEFAULT_SHADING = { exaggeration: 20, seaLevelKm: 0, seaExaggeration: 0.35, style: 'classic', azimuthDeg: 315 };

const DEG = Math.PI / 180, R = 6371;

/**
 * A style's light: shade (flat = 1) of the exaggerated slope (px, py) — the normal's horizontal part, (−ex·∂h/∂east,
 * −ex·∂h/∂north), pointing downhill — and, with the texture, the range and the aerial perspective, of the local relief
 * d (km), the range shade r (flat = 1) and the height h (km above sea level; the sea by `wet`). The curve, the lights,
 * the contrast, the texture, the range and the haze in one closure, so the mesh and the picture shade alike.
 */
export function shaderOf({ style = 'classic', azimuthDeg = 315, seaExaggeration = 0.35 } = {}) {
    const S = SHADE_STYLES[style] ?? SHADE_STYLES.classic;
    const alt = S.altitude * DEG, Lu = Math.sin(alt), cl = Math.cos(alt);
    const azs = S.lights === 4 ? [-90, -45, 0, 45].map(d => (azimuthDeg + d) * DEG) : [azimuthDeg * DEG];
    const Le = azs.map(a => cl * Math.sin(a)), Ln = azs.map(a => cl * Math.cos(a));
    const bright = (Math.SQRT2 - 1) * Lu / (1 - Lu);       // (the lit side held to the 45° light's range, 1 … 1.41, at any altitude)
    const ca = azs.map(Math.cos), sa = azs.map(Math.sin);
    const sqrt = S.curve === 'sqrt', multi = S.lights === 4, { contrast, texture, textureLift, range, aerial } = S;
    const light = (px, py) => {
        let m2 = px * px + py * py;
        if (sqrt && m2 > 1e-20) { const m = Math.sqrt(m2), k = Math.sqrt(m) / m; px *= k; py *= k; m2 = m; }
        const inv = 1 / Math.sqrt(m2 + 1);
        let s;
        if (!multi) s = Math.max(0, (px * Le[0] + py * Ln[0] + Lu) * inv);
        else if (m2 < 1e-12) s = Lu;
        else {
            // (a light's weight sin²(aspect − azimuth) = ((px·cos az − py·sin az) / |p|)²; the |p| cancels in the normalising)
            let sw = 0, acc = 0;
            for (let i = 0; i < 4; i++) { const w = (px * ca[i] - py * sa[i]) ** 2; sw += w; acc += w * Math.max(0, px * Le[i] + py * Ln[i] + Lu); }
            s = acc / sw * inv;
        }
        s /= Lu;
        if (s > 1) s = 1 + (s - 1) * bright;
        return contrast === 1 ? s : Math.max(0, 1 + (s - 1) * contrast);
    };
    // (the range's own light: the main one, plain — the belt's flanks, not the four lights' even tones)
    const rangeLight = (px, py) => { const inv = 1 / Math.sqrt(px * px + py * py + 1); return Math.max(0, (px * Le[0] + py * Ln[0] + Lu) * inv) / Lu; };
    const textured = (s, d, wet) => { const t = texture * (wet ? seaExaggeration : 1) * d / (Math.abs(d) + TEXTURE_SCALE_KM); return s * (1 + (t > 0 ? textureLift * t : t)); };
    const hazed = (s, h, wet) => 1 + (s - 1) * (1 - aerial * (1 - (wet ? 0 : Math.min(1, Math.max(0, h / AERIAL_TOP_KM)))));
    return {
        style: S, light, rangeLight, texture: texture > 0, range: range > 0, aerial: aerial > 0,
        /** The shade of a slope at a place: its relief d (km above the local mean, with the texture), height h (km above sea level) and range shade r. */
        shade(px, py, d, h, wet, r = 1) {
            let s = light(px, py);
            if (texture) s = textured(s, d, wet);
            if (range) s *= 1 + range * (r - 1);
            if (aerial) s = hazed(s, h, wet);
            return s;
        },
    };
}

/**
 * Hillshade per cell: 0 (facing away from the light) … ~1.4 (facing it); 1 on flat ground. Slopes are exaggerated
 * so relief reads at planet scale; the sea floor's by `seaExaggeration` of it. `style` one of SHADE_STYLES, lit from
 * `azimuthDeg` (clockwise from north; 315 = north-west).
 * @returns {Float32Array}
 */
export function hillshade(mesh, heightKm, { exaggeration = 20, seaLevelKm = 0, seaExaggeration = 0.35, style = 'classic', azimuthDeg = 315 } = {}) {
    const { xyz, adjOffset, adjList, numCells } = mesh, out = new Float32Array(numCells);
    const sh = shaderOf({ style, azimuthDeg, seaExaggeration });
    const d = sh.texture ? localRelief(mesh, heightKm) : null;
    const rg = sh.range ? rangeGrid(meshMeanGrid(mesh, heightKm, seaLevelKm), sh.rangeLight, exaggeration * RANGE_EXAGGERATION) : null, uv = rg ? meshUv(mesh) : null;
    for (let c = 0; c < numCells; c++) {
        const x = xyz[3 * c], y = xyz[3 * c + 1], z = xyz[3 * c + 2];
        let ex = -y, ey = x;
        const el = Math.hypot(ex, ey) || 1; ex /= el; ey /= el;
        const nx = -z * ey, ny = z * ex, nz = x * ey - y * ex;                       // north = p × east
        let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0;
        const h = heightKm[c];
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
            const nb = adjList[k], dx = (xyz[3 * nb] - x) * R, dy = (xyz[3 * nb + 1] - y) * R, dz = (xyz[3 * nb + 2] - z) * R;
            const u = dx * ex + dy * ey, v = dx * nx + dy * ny + dz * nz, dh = heightKm[nb] - h;
            a11 += u * u; a12 += u * v; a22 += v * v; b1 += u * dh; b2 += v * dh;
        }
        const det = a11 * a22 - a12 * a12;
        let ge = 0, gn = 0;
        if (Math.abs(det) > 1e-12) { ge = (a22 * b1 - a12 * b2) / det; gn = (a11 * b2 - a12 * b1) / det; }
        const wet = h < seaLevelKm, ex2 = wet ? exaggeration * seaExaggeration : exaggeration;
        const r = rg ? sampleGrid(rg, uv[2 * c] * rg.width - 0.5, uv[2 * c + 1] * rg.height - 0.5) : 1;
        out[c] = sh.shade(-ex2 * ge, -ex2 * gn, d ? d[c] : 0, h - seaLevelKm, wet, r);
    }
    return out;
}

/**
 * The local relief per cell (km): the height above the mean height within ~TEXTURE_KM — the mean by iterated
 * neighbour averaging, a diffusion whose reach grows with the root of its passes, so the passes are (TEXTURE_KM / edge)²
 * (at 160K cells one pass, at 640K four, at 2.5M sixteen): the same radius in km at every detail.
 */
export function localRelief(mesh, heightKm, radiusKm = TEXTURE_KM) {
    const { adjOffset, adjList, numCells } = mesh, edgeKm = Math.PI * R / Math.sqrt(numCells);
    const passes = Math.min(24, Math.max(1, Math.round((radiusKm / edgeKm) ** 2)));
    let a = Float32Array.from(heightKm), b = new Float32Array(numCells);
    for (let p = 0; p < passes; p++) {
        for (let c = 0; c < numCells; c++) {
            let s = a[c], n = 1;
            for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { s += a[adjList[k]]; n++; }
            b[c] = s / n;
        }
        [a, b] = [b, a];
    }
    for (let c = 0; c < numCells; c++) a[c] = heightKm[c] - a[c];
    return a;
}

// ── lat-lon grids: the wide blurs (the range's, the picture's texture) on a small grid, whatever the mesh or the picture ──

/**
 * A grid's two box blurs each way (≈ a Gaussian of σ `sigmaPx`): round the globe in x, the radius widened by the
 * latitude; clamped in y. `a` is blurred in place (`b`: scratch of the same size).
 */
export function blurGrid(a, W, H, sigmaPx, b = new Float32Array(W * H)) {
    const r = Math.max(1, Math.round(sigmaPx * 1.22));
    for (let pass = 0; pass < 2; pass++) {
        for (let y = 0; y < H; y++) {
            const cl = Math.max(0.15, Math.cos(((y + 0.5) / H - 0.5) * Math.PI)), rx = Math.min(W >> 2, Math.round(r / cl)), o = y * W, n = 2 * rx + 1;
            let s = 0;
            for (let d = -rx; d <= rx; d++) s += a[o + ((d + W) % W)];
            for (let x = 0; x < W; x++) {
                b[o + x] = s / n;
                s += a[o + ((x + rx + 1) % W)] - a[o + ((x - rx + W) % W)];
            }
        }
        for (let x = 0; x < W; x++) {
            let s = 0;
            for (let d = -r; d <= r; d++) s += b[Math.min(H - 1, Math.max(0, d)) * W + x];
            for (let y = 0; y < H; y++) {
                a[y * W + x] = s / (2 * r + 1);
                s += b[Math.min(H - 1, y + r + 1) * W + x] - b[Math.max(0, y - r) * W + x];
            }
        }
    }
    return a;
}

/** A grid {width, height, data} sampled bilinearly at (u, v) in its own pixels (u round the globe, v clamped). */
export function sampleGrid(g, u, v) {
    const { width: W, height: H, data: m } = g;
    v = Math.min(H - 1, Math.max(0, v));
    const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0, xa = ((x0 % W) + W) % W, x1 = (xa + 1) % W, y1 = Math.min(H - 1, y0 + 1);
    return (m[y0 * W + xa] * (1 - fx) + m[y0 * W + x1] * fx) * (1 - fy) + (m[y1 * W + xa] * (1 - fx) + m[y1 * W + x1] * fx) * fy;
}

/** Each cell's place on the equirectangular map (u east from −180°, v south from the north pole, 0…1), once per mesh. */
const meshUvs = new WeakMap();
function meshUv(mesh) {
    let uv = meshUvs.get(mesh);
    if (uv) return uv;
    const { xyz, numCells } = mesh;
    uv = new Float32Array(2 * numCells);
    for (let c = 0; c < numCells; c++) {
        uv[2 * c] = (Math.atan2(xyz[3 * c + 1], xyz[3 * c]) + Math.PI) / (2 * Math.PI);
        uv[2 * c + 1] = (Math.PI / 2 - Math.asin(Math.max(-1, Math.min(1, xyz[3 * c + 2])))) / Math.PI;
    }
    meshUvs.set(mesh, uv);
    return uv;
}

/**
 * The mean height within ~RANGE_BLUR_KM round each point of a mesh, as a 0.5° lat-lon grid (km above sea level): the
 * cells binned (their heights summed and counted), both blurred alike and divided — a normalised convolution, so bins
 * with no cell (a coarse mesh, the poles' narrow bins) take their neighbours' mean.
 */
export function meshMeanGrid(mesh, heightKm, seaLevelKm = 0, W = 720) {
    const { numCells } = mesh, H = W >> 1, sum = new Float32Array(W * H), cnt = new Float32Array(W * H), uv = meshUv(mesh);
    for (let c = 0; c < numCells; c++) {
        const gx = Math.min(W - 1, Math.floor(uv[2 * c] * W)), gy = Math.min(H - 1, Math.floor(uv[2 * c + 1] * H));
        sum[gy * W + gx] += heightKm[c] - seaLevelKm; cnt[gy * W + gx]++;
    }
    const sigmaPx = RANGE_BLUR_KM / (2 * Math.PI * R / W), scratch = new Float32Array(W * H);
    blurGrid(sum, W, H, sigmaPx, scratch); blurGrid(cnt, W, H, sigmaPx, scratch);
    for (let i = 0; i < sum.length; i++) sum[i] = cnt[i] > 1e-9 ? sum[i] / cnt[i] : 0;
    return { width: W, height: H, data: sum };
}

/**
 * The range shade on a grid of mean heights (km above sea level; the texture's or meshMeanGrid's): each texel's mean put
 * through the logistic (RANGE_RISE_KM over RANGE_WIDTH_KM about RANGE_CENTER_KM, plus RANGE_LINEAR of the height), its
 * gradient by central differences, lit (flat = 1) by `light(px, py)` at `exaggeration`.
 */
export function rangeGrid(mean, light, exaggeration = 20) {
    const { width: W, height: H, data: m } = mean, f = new Float32Array(W * H), out = new Float32Array(W * H);
    for (let i = 0; i < f.length; i++) f[i] = RANGE_RISE_KM / (1 + Math.exp(-(m[i] - RANGE_CENTER_KM) / RANGE_WIDTH_KM)) + RANGE_LINEAR * m[i];
    const pxKm = 2 * Math.PI * R / W;
    for (let y = 0; y < H; y++) {
        const cl = Math.max(0.05, Math.cos(((y + 0.5) / H - 0.5) * Math.PI)), up = Math.max(0, y - 1) * W, dn = Math.min(H - 1, y + 1) * W, row = y * W;
        for (let x = 0; x < W; x++) {
            const ge = (f[row + (x + 1) % W] - f[row + (x - 1 + W) % W]) / (2 * pxKm * cl), gn = (f[up + x] - f[dn + x]) / (2 * pxKm);
            out[row + x] = light(-exaggeration * ge, -exaggeration * gn);
        }
    }
    return { width: W, height: H, data: out };
}

/**
 * The same shading per pixel of an equirectangular picture of heights `h` (km, W × W/2; `sea`: 1 on the sea): a
 * function (x, y) → shade, the gradient by central differences (east stretched by the latitude), the local relief and
 * the range from the picture blurred at ≤ 2048 px wide (their radii in pixels from TEXTURE_KM and RANGE_BLUR_KM, so they
 * are the same at every width and cost the same). `exaggeration`, `style`, `azimuthDeg`, `seaExaggeration` as hillshade's.
 */
export function pictureShader(h, sea, W, { exaggeration = 20, seaExaggeration = 0.35, style = 'classic', azimuthDeg = 315 } = {}) {
    const H = W >> 1, sh = shaderOf({ style, azimuthDeg, seaExaggeration }), pxKm = 2 * Math.PI * R / W;
    const tex = sh.texture ? pictureMean(h, W, H, TEXTURE_KM) : null;
    const rg = sh.range ? rangeGrid(pictureMean(h, W, H, RANGE_BLUR_KM), sh.rangeLight, exaggeration * RANGE_EXAGGERATION) : null, rk = rg ? rg.width / W : 1;
    return (x, y) => {
        const i = y * W + x, wet = sea[i], ex = wet ? exaggeration * seaExaggeration : exaggeration;
        const cl = Math.max(0.05, Math.cos(((y + 0.5) / H - 0.5) * Math.PI)), up = Math.max(0, y - 1) * W, dn = Math.min(H - 1, y + 1) * W;
        const ge = (h[y * W + (x + 1) % W] - h[y * W + (x - 1 + W) % W]) / (2 * pxKm * cl), gn = (h[up + x] - h[dn + x]) / (2 * pxKm);
        const r = rg ? sampleGrid(rg, (x + 0.5) * rk - 0.5, (y + 0.5) * rk - 0.5) : 1;
        return sh.shade(-ex * ge, -ex * gn, tex ? h[i] - tex.at(x, y) : 0, h[i], wet, r);
    };
}

/**
 * The mean height within ~radiusKm of each point of a picture, as a coarser grid (≤ 2048 px wide: a block mean of the
 * heights, then blurGrid) with at(x, y): the mean sampled bilinearly in the picture's own pixels.
 */
export function pictureMean(h, W, H, radiusKm = TEXTURE_KM) {
    const TW = Math.min(W, 2048), TH = TW >> 1, k = W / TW;
    const a = new Float32Array(TW * TH);
    if (k === 1) a.set(h);
    else {
        for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
            let s = 0;
            for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) s += h[(y * k + dy) * W + x * k + dx];
            a[y * TW + x] = s / (k * k);
        }
    }
    blurGrid(a, TW, TH, radiusKm / (2 * Math.PI * R / TW));
    const g = { width: TW, height: TH, data: a };
    g.at = (x, y) => sampleGrid(g, (x + 0.5) / k - 0.5, (y + 0.5) / k - 0.5);
    return g;
}

/** Tinted, shaded colours per cell into `out` (3 bytes per cell). `mode`: 'terrain' | 'shade' (grey) | 'tint' (no shading). */
export function paintRelief(heightKm, shade, out, { seaLevelKm = 0, mode = 'terrain' } = {}) {
    const rgb = [0, 0, 0];
    for (let c = 0; c < heightKm.length; c++) {
        const s = shade ? shade[c] : 1;
        if (mode === 'shade') { const g = Math.min(255, 150 * s); out[3 * c] = out[3 * c + 1] = out[3 * c + 2] = g; continue; }
        tintOf(heightKm[c] - seaLevelKm, rgb);
        const k = mode === 'tint' ? 1 : 0.35 + 0.65 * s;
        out[3 * c] = Math.min(255, rgb[0] * k); out[3 * c + 1] = Math.min(255, rgb[1] * k); out[3 * c + 2] = Math.min(255, rgb[2] * k);
    }
}
