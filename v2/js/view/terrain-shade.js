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
 *  texture   the local relief model (Hesse 2010; Leland Brown's texture shading): a cell's height above the mean height
 *            within ~TEXTURE_KM, darkening valleys (and lightening ridges, half as much: a sunlit ridge is not snow) whichever
 *            way they run — the drainage and the plains' grain, which no light alone shows — × this much (0 … ~0.5).
 *  contrast  the shading's departure from flat × this (the four lights' tones are gentler by nature; they are stretched
 *            back, as the USGS does).
 *  aerial    Imhof's aerial perspective: the shading's contrast fades by this share from AERIAL_TOP_KM down to the sea,
 *            so the ranges stand crisp over a hazier lowland.
 *  altitude  the light's height above the horizon (°). A low sun casts long shading across gentle ground.
 */
export const SHADE_STYLES = {
    classic: { name: 'Classic', lights: 1, curve: 'linear', texture: 0, aerial: 0, altitude: 45, contrast: 1 },
    soft: { name: 'Soft', lights: 1, curve: 'sqrt', texture: 0, aerial: 0, altitude: 45, contrast: 1 },
    multi: { name: 'Multidirectional', lights: 4, curve: 'linear', texture: 0, aerial: 0, altitude: 45, contrast: 2 },
    textured: { name: 'Textured', lights: 1, curve: 'sqrt', texture: 0.4, aerial: 0, altitude: 45, contrast: 1 },
    detailed: { name: 'Detailed', lights: 4, curve: 'sqrt', texture: 0.4, aerial: 0, altitude: 45, contrast: 1.7 },
    swiss: { name: 'Swiss', lights: 4, curve: 'sqrt', texture: 0.3, aerial: 0.4, altitude: 45, contrast: 1.7 },
    dramatic: { name: 'Dramatic', lights: 1, curve: 'linear', texture: 0.25, aerial: 0, altitude: 25, contrast: 1.25 },
};
/** The local relief model's radius (its mean height's σ, km) and the relief (km) at which the texture reaches half strength. */
export const TEXTURE_KM = 50, TEXTURE_SCALE_KM = 0.15;
/** The height (km) above which the aerial perspective leaves the shading its full contrast. */
export const AERIAL_TOP_KM = 3;
export const DEFAULT_SHADING = { exaggeration: 20, seaLevelKm: 0, seaExaggeration: 0.35, style: 'classic', azimuthDeg: 315 };

const DEG = Math.PI / 180, R = 6371;

/**
 * A style's light: shade (flat = 1) of the exaggerated slope (px, py) — the normal's horizontal part, (−ex·∂h/∂east,
 * −ex·∂h/∂north), pointing downhill — and, with the texture and the aerial perspective, of the local relief d (km) and
 * the height h (km above sea level; the sea by `wet`). The curve, the lights, the contrast, the texture and the haze in
 * one closure, so the mesh and the picture shade alike.
 */
export function shaderOf({ style = 'classic', azimuthDeg = 315, seaExaggeration = 0.35 } = {}) {
    const S = SHADE_STYLES[style] ?? SHADE_STYLES.classic;
    const alt = S.altitude * DEG, Lu = Math.sin(alt), cl = Math.cos(alt);
    const azs = S.lights === 4 ? [-90, -45, 0, 45].map(d => (azimuthDeg + d) * DEG) : [azimuthDeg * DEG];
    const Le = azs.map(a => cl * Math.sin(a)), Ln = azs.map(a => cl * Math.cos(a));
    const bright = (Math.SQRT2 - 1) * Lu / (1 - Lu);       // (the lit side held to the 45° light's range, 1 … 1.41, at any altitude)
    const ca = azs.map(Math.cos), sa = azs.map(Math.sin);
    const sqrt = S.curve === 'sqrt', multi = S.lights === 4, { contrast, texture, aerial } = S;
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
    const textured = (s, d, wet) => { const t = texture * (wet ? seaExaggeration : 1) * d / (Math.abs(d) + TEXTURE_SCALE_KM); return s * (1 + (t > 0 ? 0.5 * t : t)); };
    const hazed = (s, h, wet) => 1 + (s - 1) * (1 - aerial * (1 - (wet ? 0 : Math.min(1, Math.max(0, h / AERIAL_TOP_KM)))));
    return {
        style: S, light, texture: texture > 0, aerial: aerial > 0,
        /** The shade of a slope at a place: its relief d (km above the local mean, with the texture) and height h (km above sea level). */
        shade(px, py, d, h, wet) {
            let s = light(px, py);
            if (texture) s = textured(s, d, wet);
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
        out[c] = sh.shade(-ex2 * ge, -ex2 * gn, d ? d[c] : 0, h - seaLevelKm, wet);
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

/**
 * The same shading per pixel of an equirectangular picture of heights `h` (km, W × W/2; `sea`: 1 on the sea): a
 * function (x, y) → shade, the gradient by central differences (east stretched by the latitude), the local relief from
 * the picture blurred at ≤ 2048 px wide (its radius in pixels from TEXTURE_KM, so the texture is the same at every width
 * and costs the same). `exaggeration`, `style`, `azimuthDeg`, `seaExaggeration` as hillshade's.
 */
export function pictureShader(h, sea, W, { exaggeration = 20, seaExaggeration = 0.35, style = 'classic', azimuthDeg = 315 } = {}) {
    const H = W >> 1, sh = shaderOf({ style, azimuthDeg, seaExaggeration }), pxKm = 2 * Math.PI * R / W;
    const tex = sh.texture ? pictureMean(h, W, H) : null;
    return (x, y) => {
        const i = y * W + x, wet = sea[i], ex = wet ? exaggeration * seaExaggeration : exaggeration;
        const cl = Math.max(0.05, Math.cos(((y + 0.5) / H - 0.5) * Math.PI)), up = Math.max(0, y - 1) * W, dn = Math.min(H - 1, y + 1) * W;
        const ge = (h[y * W + (x + 1) % W] - h[y * W + (x - 1 + W) % W]) / (2 * pxKm * cl), gn = (h[up + x] - h[dn + x]) / (2 * pxKm);
        return sh.shade(-ex * ge, -ex * gn, tex ? h[i] - tex.at(x, y) : 0, h[i], wet);
    };
}

/**
 * The mean height within ~TEXTURE_KM of each point of a picture, as a coarser picture (≤ 2048 px wide: a block mean of
 * the heights, then two box blurs each way — round the globe in x, its radius widened by the latitude; clamped in y)
 * sampled bilinearly by at(x, y) in the picture's own pixels.
 */
export function pictureMean(h, W, H, radiusKm = TEXTURE_KM) {
    const TW = Math.min(W, 2048), TH = TW >> 1, k = W / TW;
    let a = new Float32Array(TW * TH), b = new Float32Array(TW * TH);
    if (k === 1) a.set(h);
    else {
        for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
            let s = 0;
            for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) s += h[(y * k + dy) * W + x * k + dx];
            a[y * TW + x] = s / (k * k);
        }
    }
    // (two box blurs of radius r ≈ σ·√1.5 are near a Gaussian of σ)
    const sigmaPx = radiusKm / (2 * Math.PI * R / TW), r = Math.max(1, Math.round(sigmaPx * 1.22));
    for (let pass = 0; pass < 2; pass++) {
        for (let y = 0; y < TH; y++) {                                           // x, round the globe, wider toward the poles
            const cl = Math.max(0.15, Math.cos(((y + 0.5) / TH - 0.5) * Math.PI)), rx = Math.min(TW >> 2, Math.round(r / cl)), o = y * TW, n = 2 * rx + 1;
            let s = 0;
            for (let d = -rx; d <= rx; d++) s += a[o + ((d + TW) % TW)];
            for (let x = 0; x < TW; x++) {
                b[o + x] = s / n;
                s += a[o + ((x + rx + 1) % TW)] - a[o + ((x - rx + TW) % TW)];
            }
        }
        for (let x = 0; x < TW; x++) {                                           // y, clamped at the poles
            let s = 0;
            for (let d = -r; d <= r; d++) s += b[Math.min(TH - 1, Math.max(0, d)) * TW + x];
            for (let y = 0; y < TH; y++) {
                a[y * TW + x] = s / (2 * r + 1);
                s += b[Math.min(TH - 1, y + r + 1) * TW + x] - b[Math.max(0, y - r) * TW + x];
            }
        }
    }
    const m = a;
    return {
        width: TW, height: TH, data: m,
        at(x, y) {
            const u = (x + 0.5) / k - 0.5, v = Math.min(TH - 1, Math.max(0, (y + 0.5) / k - 0.5));
            const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0, x1 = (x0 + 1 + TW) % TW, xa = (x0 + TW) % TW, y1 = Math.min(TH - 1, y0 + 1);
            return (m[y0 * TW + xa] * (1 - fx) + m[y0 * TW + x1] * fx) * (1 - fy) + (m[y1 * TW + xa] * (1 - fx) + m[y1 * TW + x1] * fx) * fy;
        },
    };
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
