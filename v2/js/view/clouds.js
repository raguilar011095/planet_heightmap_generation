// Clouds over the planet's Satellite view (plans/V2_SATELLITE_LOOK_PLAN.md P9). Owner, 2026-11-01: "an atmosphere/cloud
// simulation … partially inspired by the climate/rain too (but still realistic looking)"; "we do not need to reinvent the
// wheel"; on by default with a toggle, drifting on the globe only, a Clouds layer and Satellite with clouds in the export;
// only on the Satellite view, from the detailed moment's own climate; "somewhere in between" a warped fbm and Perlin-Worley
// puffs; then "actual atmospheric circulation as well as … different physical layers of clouds … with different types of
// cloud coverage at different latitudes".
//
// The techniques others use on globes (Musgrave's planetclouds: fBm over a noise-distorted domain; Quilez's warp of a
// warp; latitude-belt cover; curl-noise and spiral vortices for storms; Schneider's Perlin-Worley erosion; streaks along
// a flow field — line-integral convolution), driven by the planet's own climate (its season's rain, air and sea
// temperature, sea-level pressure, winds, upwelling, sea ice), in four layers, each with its own cover and its own texture:
//   · low — stratocumulus decks over cool, upwelling seas under the subtropical highs (cellular: Worley cells), and stratus
//     over the polar seas; grey-white, a little translucent;
//   · convective — towers and clusters in the warm, wet tropics (the rain belt, the monsoons) and fair-weather cumulus over
//     warm summer land: bright puffs (fine Worley) gathered by smooth noise;
//   · frontal — the storm tracks' sheets and bands (35–70°, wetter and lower pressure, more): fbm through the warp of a
//     warp, smeared along the wind, crisp, its edges eroded, a thin veil under it, lit from the north-west;
//   · cirrus — high, thin wisps over the storm tracks and the tropical anvils, streaked long along the wind;
// and storms where the circulation has them: extratropical cyclones at the season's pressure lows in the storm belts and a
// few more along the tracks (the world's seed), tropical cyclones over warm summer seas — each a spiral turn of the field
// about its centre, cyclonic (counter-clockwise north, clockwise south), cloudier there.
// Each layer's cover becomes its cut through its own noise by that noise's measured quantiles (cover c: cloud over about
// c of the sky). Fine detail fades where finer than a pixel. The same reading twice: GLSL (CLOUD_GLSL, GLSL ES 3.0 — a
// sampler3D; WebGL 1 draws none) for the globe and the map, and JavaScript (cloudLayersAt, cloudPicture) for the export.

/** The settings: see each use. Q*: each layer's noise's quantiles at 5, 25, 50, 75 and 95 % (measured: cloudQuantiles). */
export const CLOUDS = {
    sizeKm: 5400, stretch: 1.5, warp1: 0.7, warp2: 0.6, w0: 0.7, w1: 0.25, w2: 0.05, contrast: 1.4,
    edgeLow: 0.05, edgeConv: 0.04, edgeFront: 0.07, edgeCirrus: 0.08, veil: 0.25, veilWidth: 0.1, erosion: 0.45, detail: 7, sharp: 1.2,
    opLow: 0.78, opConv: 0.97, opFront: 0.92, opCirrus: 0.38, greyLow: 0.86, greyCirrus: 0.97, light: 0.3,
    billow: 0.7, relief: 0.55, thick: 0.14, thinOp: 0.68, thinGrey: 0.82, streakLat: [0.25, 18, 38],
    lowScale: 3.2, convScale: 2.6, cirrusScale: 1.7, streakFrontKm: 260, streakCirrusKm: 700, windFull: 6,
    shadow: 0.25, shadowKm: 30,
    storms: 10, stormKm: 1100, stormTwist: 1.1, stormCover: 0.06, tropical: 3, tropicalTwist: 1.0,
    weatherScale: 0.11, weatherAmp: 0.45, streakVary: 0.45, cirrusWarp: 0.45, cirrusFine: 0.3,
    driftDegPerS: 0.25, evolve: 0.009, flowPeriod: 9, flowKm: 120, flowLat: [0.55, 1.35],
    QLow: [0.358, 0.437, 0.494, 0.553, 0.638], QConv: [0.372, 0.449, 0.503, 0.557, 0.636], QFront: [0.309, 0.442, 0.533, 0.626, 0.759], QCirrus: [0.362, 0.458, 0.525, 0.594, 0.689],
};
/** The noise texture's size (texels a side), and the most storms the shader takes. */
export const NOISE_N = 64, MAX_STORMS = 16;

const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * The clouds' fields on the climate's 1° grid (360 × 180, rows north → south) for a season, from the page's climate `C`:
 * `cover` (RGBA bytes: R low, G convective, B frontal, A cirrus — each 0 … 1) and `wind` (RGBA bytes: R its eastward, G
 * its northward wind, ± 40 m/s about 128); and offset, where the season reads the noise (CLOUD_SEASON_OFFSET).
 */
export function cloudFields(C, season = 'year') {
    const w = 360, h = 180, G = w * h, f = k => C?.[k]?.[season];
    const P = f('P'), T = f('T'), Ts = f('Tsea') ?? T, S = f('slp'), U = f('u'), V = f('v'), up = f('upwelling'), sa = f('sstAnom'), ice = f('seaIce'), sea = C?.sea;
    const L = [0, 1, 2, 3].map(() => new Float32Array(G)), wind = new Uint8Array(4 * G);
    if (P && T && S) {
        for (let j = 0; j < h; j++) {
            const lat = 90 - (j + 0.5), al = Math.abs(lat);
            let zm = 0, zn = 0;
            for (let i = 0; i < w; i++) { const v = S[j * w + i]; if (v === v) { zm += v; zn++; } }
            zm = zn ? zm / zn : 1013;
            const track = sm(28, 40, al) * (1 - sm(64, 76, al));
            for (let i = 0; i < w; i++) {
                const c = j * w + i, p = Math.max(0, P[c] || 0), wet = 1 - Math.exp(-p / 100), t = T[c], isSea = sea ? sea[c] === 1 : false;
                const warm = sm(18, 26, t), highP = sm(1014, 1024, S[c]), lowP = sm(2, -8, S[c] - zm);
                // convective: the warm wet tropics; fair-weather cumulus over warm summer land
                const conv = Math.max(0.7 * warm * sm(0.45, 0.92, wet), isSea ? 0 : 0.3 * sm(14, 24, t) * sm(0.1, 0.45, wet));
                // frontal: the storm tracks (wetter, lower pressure, more), the cool rainy country elsewhere; less under highs
                const front = Math.max(0, track * (0.15 + 0.5 * wet + 0.45 * lowP) + (1 - track) * (1 - warm) * 0.45 * wet - 0.45 * highP);
                // low decks: cool upwelling seas under the subtropical highs; polar sea stratus
                const sst = Ts?.[c] ?? t, cool = Math.max(sm(0, 0.3, up?.[c] ?? 0), sm(0, -4, sa?.[c] ?? 0));
                const deck = isSea ? cool * sm(1008, 1018, S[c]) * sm(8, 18, al) * (1 - sm(42, 55, al)) * sm(28, 18, sst) : 0;
                const polar = isSea ? 0.65 * sm(48, 62, al) * (1 - sm(0.5, 0.95, ice?.[c] ?? 0)) : 0;
                const low = Math.min(1, Math.max(deck, polar));
                // cirrus: the storm tracks' and the tropical anvils'; fewer under highs
                const cirr = Math.min(1, (0.02 + 0.4 * front + 0.4 * conv * warm) * (1 - 0.7 * highP));
                L[0][c] = low; L[1][c] = Math.min(1, conv); L[2][c] = Math.min(1, front); L[3][c] = cirr;
                const o = 4 * c;
                wind[o] = Math.round(Math.max(0, Math.min(255, 127.5 + 127.5 * (U?.[c] ?? 0) / 40))); wind[o + 1] = Math.round(Math.max(0, Math.min(255, 127.5 + 127.5 * (V?.[c] ?? 0) / 40)));
                wind[o + 3] = 255;
            }
        }
    }
    // (each smoothed — ±3°, the cirrus ±5° — so the climate's coasts and its 1° grid are not drawn in cloud)
    const tmp = new Float32Array(G), blur = (a, r) => {
        for (let pass = 0; pass < 2; pass++) {
            for (let j = 0; j < h; j++) { const cl = Math.max(0.2, Math.cos((90 - (j + 0.5)) * Math.PI / 180)), rx = Math.min(90, Math.round(r / cl)); for (let i = 0; i < w; i++) { let t = 0; for (let d = -rx; d <= rx; d++) t += a[j * w + ((i + d) % w + w) % w]; tmp[j * w + i] = t / (2 * rx + 1); } }
            for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) { let t = 0, n = 0; for (let d = -r; d <= r; d++) { const jj = j + d; if (jj < 0 || jj >= h) continue; t += tmp[jj * w + i]; n++; } a[j * w + i] = t / n; }
        }
    };
    blur(L[0], 3); blur(L[1], 3); blur(L[2], 3); blur(L[3], 5);
    const cover = new Uint8Array(4 * G);
    for (let c = 0; c < G; c++) for (let k = 0; k < 4; k++) cover[4 * c + k] = Math.round(255 * Math.max(0, Math.min(1, L[k][c])));
    return { w, h, cover, wind, offset: CLOUD_SEASON_OFFSET[season] ?? CLOUD_SEASON_OFFSET.year };
}
/** Where each season reads the noise: January and July ~1 apart in its space, the year between — past a cloud mass (its octaves differ), but only a
 *  third of a weather system (the large pattern stays alike) — so January, July and the year are related, not the same. */
export const CLOUD_SEASON_OFFSET = { year: [0, 0, 0], jan: [0.42, -0.3, 0.25], jul: [-0.42, 0.3, -0.25] };

// ── the noise texture: tileable Perlin (gradient) and Worley (cellular) noise on an integer hash ──
function hash(x, y, z, s) {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1440670441) ^ Math.imul(s, 2654435761);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const wrap = (i, p) => ((i % p) + p) % p, lerp = (a, b, t) => a + (b - a) * t, fade = t => t * t * t * (t * (t * 6 - 15) + 10);
// (each lattice's random gradients and cell points worked out once — the same values, the hash not called per sample)
const latticeCache = new Map();
function lattice(kind, p, s) {
    const key = `${kind}|${p}|${s}`;
    let L = latticeCache.get(key);
    if (L) return L;
    L = new Float64Array(3 * p * p * p);
    for (let c = 0; c < p; c++) for (let b = 0; b < p; b++) for (let a = 0; a < p; a++) {
        const o = 3 * ((c * p + b) * p + a);
        if (kind === 'g') {
            const th = hash(a, b, c, s) * 6.283185, ph = Math.acos(2 * hash(a, b, c, s + 7) - 1);
            L[o] = Math.sin(ph) * Math.cos(th); L[o + 1] = Math.sin(ph) * Math.sin(th); L[o + 2] = Math.cos(ph);
        } else { L[o] = hash(a, b, c, s); L[o + 1] = hash(a, b, c, s + 1); L[o + 2] = hash(a, b, c, s + 2); }
    }
    latticeCache.set(key, L);
    return L;
}
function perlin(x, y, z, p, s) {
    const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z), fx = x - X, fy = y - Y, fz = z - Z, G = lattice('g', p, s);
    const g = (i, j, k, dx, dy, dz) => { const o = 3 * ((wrap(k, p) * p + wrap(j, p)) * p + wrap(i, p)); return G[o] * dx + G[o + 1] * dy + G[o + 2] * dz; };
    const u = fade(fx), v = fade(fy), w = fade(fz);
    return lerp(lerp(lerp(g(X, Y, Z, fx, fy, fz), g(X + 1, Y, Z, fx - 1, fy, fz), u), lerp(g(X, Y + 1, Z, fx, fy - 1, fz), g(X + 1, Y + 1, Z, fx - 1, fy - 1, fz), u), v),
        lerp(lerp(g(X, Y, Z + 1, fx, fy, fz - 1), g(X + 1, Y, Z + 1, fx - 1, fy, fz - 1), u), lerp(g(X, Y + 1, Z + 1, fx, fy - 1, fz - 1), g(X + 1, Y + 1, Z + 1, fx - 1, fy - 1, fz - 1), u), v), w);
}
function worley(x, y, z, c, s) {
    const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z), P = lattice('w', c, s);
    let best = 9;
    for (let k = -1; k <= 1; k++) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const cx = X + i, cy = Y + j, cz = Z + k, o = 3 * ((wrap(cz, c) * c + wrap(cy, c)) * c + wrap(cx, c));
        const d = (cx + P[o] - x) ** 2 + (cy + P[o + 1] - y) ** 2 + (cz + P[o + 2] - z) ** 2;
        if (d < best) best = d;
    }
    return Math.max(0, 1 - Math.sqrt(best));
}
let noiseTex = null;
/** The texture (built once, ~1 s): NOISE_N³ RGBA bytes, x fastest — R Perlin fbm (4 → 16 cells, stretched to 0 … 1),
 *  G B A Worley fbm at 4, 8, 16 cells a period. */
export function cloudNoiseTexture() {
    if (noiseTex) return noiseTex;
    const N = NOISE_N, out = new Uint8Array(N * N * N * 4), R = new Float32Array(N * N * N);
    const wfbm = (u, v, w, c) => 0.625 * worley(u * c, v * c, w * c, c, 11) + 0.25 * worley(u * 2 * c, v * 2 * c, w * 2 * c, 2 * c, 23) + 0.125 * worley(u * 4 * c, v * 4 * c, w * 4 * c, 4 * c, 37);
    let mn = Infinity, mx = -Infinity;
    for (let z = 0, i = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++, i++) {
        const u = (x + 0.5) / N, v = (y + 0.5) / N, w = (z + 0.5) / N;
        let pf = 0, a = 1, t = 0;
        for (let o = 0, c = 4; o < 3; o++, c *= 2, a *= 0.6) { pf += a * perlin(u * c, v * c, w * c, c, 101 + o); t += a; }
        R[i] = pf / t; if (R[i] < mn) mn = R[i]; if (R[i] > mx) mx = R[i];
        out[4 * i + 1] = Math.round(255 * wfbm(u, v, w, 4)); out[4 * i + 2] = Math.round(255 * wfbm(u, v, w, 8)); out[4 * i + 3] = Math.round(255 * wfbm(u, v, w, 16));
    }
    for (let i = 0; i < R.length; i++) out[4 * i] = Math.round(255 * (R[i] - mn) / (mx - mn));
    noiseTex = { N, data: out };
    return noiseTex;
}
/** The texture read at (x, y, z) in its periods (repeating), trilinear between texel centres as the GPU reads it — into o. */
function sample(T, x, y, z, o) {
    const N = T.N, D = T.data, gx = x * N - 0.5, gy = y * N - 0.5, gz = z * N - 0.5, X = Math.floor(gx), Y = Math.floor(gy), Z = Math.floor(gz);
    const fx = gx - X, fy = gy - Y, fz = gz - Z, x0 = wrap(X, N), x1 = wrap(X + 1, N), y0 = wrap(Y, N), y1 = wrap(Y + 1, N), z0 = wrap(Z, N), z1 = wrap(Z + 1, N);
    const i000 = 4 * ((z0 * N + y0) * N + x0), i100 = 4 * ((z0 * N + y0) * N + x1), i010 = 4 * ((z0 * N + y1) * N + x0), i110 = 4 * ((z0 * N + y1) * N + x1);
    const i001 = 4 * ((z1 * N + y0) * N + x0), i101 = 4 * ((z1 * N + y0) * N + x1), i011 = 4 * ((z1 * N + y1) * N + x0), i111 = 4 * ((z1 * N + y1) * N + x1);
    for (let c = 0; c < 4; c++) {
        const a = lerp(D[i000 + c], D[i100 + c], fx), b = lerp(D[i010 + c], D[i110 + c], fx), e = lerp(D[i001 + c], D[i101 + c], fx), f = lerp(D[i011 + c], D[i111 + c], fx);
        o[c] = lerp(lerp(a, b, fy), lerp(e, f, fy), fz) / 255;
    }
    return o;
}

/**
 * A world's storms for a season, from its circulation (`C`, the page's climate) and its seed: each [x, y, z, s, size] —
 * its centre on the unit sphere (SphereGeometry's frame), s its strength signed by hemisphere (cyclonic), size × stormKm
 * (a tropical cyclone's under 0.6). Extratropical: the season's pressure lows in the storm belts (35–68°: the lowest
 * against their latitude's mean, apart), then more along the storm tracks (where it is wet and low) from the seed;
 * tropical: over seas of 27 °C and more at 8–24°, from the seed.
 */
export function cloudStorms(seed = 0, C = null, season = 'year', K = CLOUDS) {
    const out = [], s0 = (seed | 0) ^ 0x5bd1e995, w = 360, h = 180, S = C?.slp?.[season], P = C?.P?.[season], Ts = C?.Tsea?.[season] ?? C?.T?.[season], sea = C?.sea;
    const at = (lat, lon) => { const d = Math.PI / 180; return [-Math.cos(lon * d + Math.PI) * Math.cos(lat * d), Math.sin(lat * d), Math.sin(lon * d + Math.PI) * Math.cos(lat * d)]; };
    const far = (lat, lon, deg) => out.every(s => { const p = at(lat, lon); return Math.acos(Math.min(1, p[0] * s[0] + p[1] * s[1] + p[2] * s[2])) * 180 / Math.PI > deg; });
    if (S) {
        // (the lows: local minima against the row's mean, deepest first)
        const zm = new Float32Array(h);
        for (let j = 0; j < h; j++) { let t = 0; for (let i = 0; i < w; i++) t += S[j * w + i]; zm[j] = t / w; }
        const lows = [];
        for (let j = 0; j < h; j++) {
            const lat = 90 - (j + 0.5), al = Math.abs(lat);
            if (al < 35 || al > 68) continue;
            for (let i = 0; i < w; i += 2) {
                const v = S[j * w + i] - zm[j];
                if (v > -2) continue;
                let min = true;
                for (let dj = -5; dj <= 5 && min; dj++) for (let di = -8; di <= 8; di++) { const jj = j + dj; if (jj < 0 || jj >= h) continue; if (S[jj * w + ((i + di) % w + w) % w] - zm[jj] < v) { min = false; break; } }
                if (min) lows.push([v, lat, i + 0.5 - 180]);
            }
        }
        lows.sort((a, b) => a[0] - b[0]);
        for (const [v, lat, lon] of lows) {
            if (out.length >= Math.ceil(K.storms / 2)) break;
            if (!far(lat, lon, 18)) continue;
            out.push([...at(lat, lon), Math.sign(lat) * Math.min(1, 0.5 + 0.06 * -v), 1.1 + 0.4 * hash(out.length, 3, 7, s0)]);
        }
    }
    // (more along the tracks, where wet and low — from the seed)
    for (let k = 0; out.length < K.storms && k < 400; k++) {
        const north = hash(k, 1, 2, s0) < 0.5, lat = (36 + 30 * hash(k, 3, 5, s0)) * (north ? 1 : -1), lon = hash(k, 7, 9, s0) * 360 - 180;
        if (P) { const c = Math.min(h - 1, Math.floor(90 - lat)) * w + Math.min(w - 1, Math.floor(lon + 180)); if (hash(k, 21, 23, s0) > 0.25 + 0.75 * (1 - Math.exp(-(P[c] || 0) / 60))) continue; }
        if (!far(lat, lon, 16)) continue;
        out.push([...at(lat, lon), (north ? 1 : -1) * (0.35 + 0.55 * hash(k, 11, 13, s0) ** 1.5), 0.6 + 0.7 * hash(k, 17, 19, s0)]);
    }
    // (tropical cyclones over warm seas)
    let tc = 0;
    for (let k = 0; tc < K.tropical && k < 600 && Ts; k++) {
        const north = hash(k, 31, 2, s0) < 0.5, lat = (8 + 16 * hash(k, 33, 5, s0)) * (north ? 1 : -1), lon = hash(k, 37, 9, s0) * 360 - 180;
        const c = Math.min(h - 1, Math.floor(90 - lat)) * w + Math.min(w - 1, Math.floor(lon + 180));
        if (!(sea ? sea[c] === 1 : true) || !(Ts[c] >= 27) || !far(lat, lon, 12) || out.length >= MAX_STORMS) continue;
        out.push([...at(lat, lon), (north ? 1 : -1) * (0.8 + 0.2 * hash(k, 41, 13, s0)), 0.32 + 0.12 * hash(k, 43, 19, s0)]);
        tc++;
    }
    return out.slice(0, MAX_STORMS);
}

export const CLOUD_GLSL = `
#if __VERSION__ >= 300
uniform highp sampler3D uCloudNoise; uniform sampler2D uCloudCover, uCloudWind;
uniform float uCloudScale, uCloudStretch, uCloudWarp1, uCloudWarp2, uCloudW0, uCloudW1, uCloudW2, uCloudContrast;
uniform float uCloudEdge[4], uCloudQ[20], uCloudVeil, uCloudVeilWidth, uCloudErosion, uCloudDetail, uCloudSharp;
uniform float uCloudLowScale, uCloudConvScale, uCloudCirrusScale, uCloudStreakFront, uCloudStreakCirrus, uCloudWindFull;
uniform float uCloudTime, uCloudDrift, uCloudEvolve, uCloudFlowPeriod, uCloudFlowKm, uCloudStormKm, uCloudStormTwist, uCloudStormCover, uCloudTropicalTwist;
uniform vec2 uCloudFlowLat; uniform vec3 uCloudStreakLat, uCloudSeason; uniform float uCloudCirrusWarp, uCloudCirrusFine; uniform float uCloudWeatherScale, uCloudWeatherAmp, uCloudStreakVary; uniform float uCloudBillow, uCloudRelief, uCloudThick, uCloudThinOp, uCloudThinGrey;
/** The drift's turn rate at a latitude (radians): west in the trades, east in the westerlies, the speed on the ground
 *  from the profile (gentle in the tropics, strongest ~52°, reaching far north), the turn that speed over the latitude's circle. */
float cloudDriftRate(float lat) {
    float d = degrees(lat), v = -0.55 * exp(-(d / 20.0) * (d / 20.0)) + 0.95 * exp(-((abs(d) - 52.0) / 22.0) * ((abs(d) - 52.0) / 22.0));
    return v / max(cos(lat), 0.2);
}
uniform vec4 uCloudStorm[${MAX_STORMS}]; uniform float uCloudStormSize[${MAX_STORMS}]; uniform int uCloudStorms;
const mat3 cloudM3 = mat3(0.00, 0.80, 0.60, -0.80, 0.36, -0.48, -0.60, -0.48, 0.64);
vec4 cloudN(vec3 p) { return texture(uCloudNoise, p); }
float cloudR(vec3 p) { return texture(uCloudNoise, p).r; }
vec3 cloudV3(vec3 a, vec3 o) { return vec3(cloudR(a + o), cloudR(a.yzx + o.yzx), cloudR(a.zxy + o.zxy)) - 0.5; }
/** A layer's cut through its noise for cover c, by the noise's quantiles (5, 25, 50, 75, 95 %): cloud over about c. */
float cloudCut(int k, float c) {
    float u = clamp(1.0 - c, 0.05, 0.95);
    float a = uCloudQ[5 * k], b = uCloudQ[5 * k + 1], m = uCloudQ[5 * k + 2], d = uCloudQ[5 * k + 3], e = uCloudQ[5 * k + 4];
    return u < 0.25 ? mix(a, b, (u - 0.05) / 0.2) : u < 0.5 ? mix(b, m, (u - 0.25) / 0.25) : u < 0.75 ? mix(m, d, (u - 0.5) / 0.25) : mix(d, e, (u - 0.75) / 0.2);
}
float cloudStep(float n, float cut, float e) { float t = clamp((n - (cut - e)) / (2.0 * e), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
/** The unit sphere's point for texture coordinates (u east from −180°, v up from the south pole), as SphereGeometry. */
vec3 cloudPoint(vec2 uv) {
    float phi = uv.x * 6.283185307, th = 3.141592654 * (1.0 - uv.y);
    return vec3(-cos(phi) * sin(th), cos(th), sin(phi) * sin(th));
}
/** The four layers' raw noise (low, convective, frontal, cirrus) at q0 (the noise's space) at time tm — the warps moving
 *  through the noise each its own way, so the shapes evolve; Wq the wind's way in the noise's space (× its strength). */
vec4 cloudRaw(vec3 q0, vec3 r, vec3 Wq, float ss, float px, float tm, vec4 need, float fast, out vec3 wOut) {
    float sc = uCloudScale, N = float(textureSize(uCloudNoise, 0).x), ev = tm * uCloudEvolve;
    vec3 w = q0 + uCloudWarp2 * r + ev * vec3(0.15, -0.1, 0.3);
    wOut = w;
    // (only the layers with cover here — the rest are clear; a shadow's pass, fast, without the wind's smear)
    float nF = 0.0, nL = 0.0, nC = 0.0, nR = 0.0;
    if (need.z > 0.5) {
        vec3 sf = Wq * (uCloudStreakFront / 6371.0) * 0.5;
        float n = uCloudW0 * (fast > 0.5 ? cloudR(w * 0.5) : 0.25 * cloudR(w * 0.5 - sf) + 0.5 * cloudR(w * 0.5) + 0.25 * cloudR(w * 0.5 + sf));
        vec3 a1 = cloudM3 * w * 1.03; n += uCloudW1 * cloudR(a1 + vec3(0.4, 0.0, 0.0));
        vec3 a2 = cloudM3 * w * 2.07; float f2 = clamp(px * sc * N * 2.07 - 0.5, 0.0, 1.0);
        n += uCloudW2 * mix(cloudR(a2.yzx + vec3(0.7, 0.0, 0.0)), 0.5, f2);
        float ws = uCloudW0 + uCloudW1 + uCloudW2; nF = 0.5 + (n - 0.5 * ws) / ws * uCloudContrast;
    }
    if (need.x > 0.5) {
    vec3 ql = q0 * uCloudLowScale + 0.3 * r;
    float fl = clamp(px * sc * N * uCloudLowScale * 0.5 - 0.5, 0.0, 1.0);
    nL = 0.6 * mix(cloudN(ql * 0.5 + vec3(0.21, 0.0, 0.0)).b, 0.48, fl) + 0.4 * cloudR(q0 * 0.7 + vec3(0.5, 0.13, 0.0) + 0.5 * ev * vec3(0.3, 0.0, 0.4));
    }
    if (need.y > 0.5) {
    vec3 qc = q0 * uCloudConvScale + 0.5 * r;
    float fc = clamp(px * sc * N * uCloudConvScale * 0.5 - 0.5, 0.0, 1.0);
    nC = 0.55 * mix(cloudN(qc * 0.5 + vec3(0.0, 0.37, 0.0) + 1.5 * ev * vec3(0.0, 0.3, 0.2)).a, 0.48, fc) + 0.45 * cloudR(q0 * 0.9 + vec3(0.0, 0.0, 0.61) + ev * vec3(-0.3, 0.2, 0.0));
    }
    if (need.w > 0.5) {
    vec3 qr = (q0 + uCloudCirrusWarp * r) * uCloudCirrusScale + vec3(0.77, 0.0, 0.33) + ev * vec3(0.2, 0.3, -0.2), sr = Wq * uCloudCirrusScale * (uCloudStreakCirrus / 6371.0) * 0.25;
    // (three taps along the wind, half again as far apart as five were: the same streaks' length)
    for (int k = -1; k <= 1; k++) nR += (1.0 - uCloudCirrusFine) * cloudR(qr + float(k) * 1.6 * sr) + uCloudCirrusFine * cloudR(qr * 2.3 + vec3(0.13, 0.57, 0.0) + float(k) * 1.6 * sr * 2.3);
    nR = 0.5 + (nR / 3.0 - 0.5) * (1.0 + 0.8 * ss);
    }
    return vec4(nL, nC, nF, nR);
}
/** The four layers' densities (low, convective, frontal, cirrus) at p (the unit sphere, y north), uv its texture
 *  coordinates; px a screen pixel on the unit sphere; veil: the frontal layer's thin cloud. Over time the shapes evolve
 *  and flow along the climate's wind (a flow map: two phases, half a period apart, cross-faded). */
vec4 cloudLayers(vec3 p, vec2 uv, float px, float fast, out float veil, out vec2 look) {
    vec4 cv = texture(uCloudCover, vec2(uv.x, 1.0 - uv.y)), wd = texture(uCloudWind, vec2(uv.x, 1.0 - uv.y));
    vec3 east = normalize(vec3(p.z + 1e-6, 0.0, -p.x)), north = cross(p, east);
    vec2 uvw = (wd.rg - 0.5) * 80.0;
    float speed = length(uvw);
    vec3 W = speed > 1e-3 ? (uvw.x * east + uvw.y * north) / speed : east, Lt = normalize(north - east);
    float lat = asin(clamp(p.y, -1.0, 1.0));
    // (smeared along the wind: the jets' streets toward the mid-latitudes, broken cells — not ribbons — in the trades)
    float ss = smoothstep(0.5, uCloudWindFull, speed) * mix(uCloudStreakLat.x, 1.0, smoothstep(uCloudStreakLat.y, uCloudStreakLat.z, abs(degrees(lat))));
    float flowLat = mix(uCloudFlowLat.x, uCloudFlowLat.y, smoothstep(10.0, 45.0, abs(degrees(lat))));
    // (the storms: the point turned about each centre, more the nearer — Rodrigues' rotation — and cloudier there)
    for (int i = 0; i < ${MAX_STORMS}; i++) {
        if (i >= uCloudStorms) break;
        // (each storm where the drift has carried it — cloudStormsAt, on the CPU once a frame)
        vec3 C = uCloudStorm[i].xyz; float dt = dot(C, p);
        if (dt < 0.9) continue;
        float r = acos(min(1.0, dt)) / (uCloudStormKm * uCloudStormSize[i] / 6371.0);
        if (r > 3.0) continue;
        float g = exp(-r * r), th = uCloudStormTwist * uCloudStorm[i].w * g * (uCloudStormSize[i] < 0.6 ? uCloudTropicalTwist : 1.0), co = cos(th), si = sin(th);
        p = p * co + cross(C, p) * si + C * dt * (1.0 - co);
        float boost = uCloudStormCover * abs(uCloudStorm[i].w) * g;
        if (uCloudStormSize[i] < 0.6) cv.g = min(1.0, cv.g + 3.0 * boost); else cv.b = min(1.0, cv.b + boost);
        cv.a = min(1.0, cv.a + 0.5 * boost); ss *= 1.0 - g;
    }
    float sc = uCloudScale;
    vec3 q0 = vec3(p.x, p.y * uCloudStretch, p.z) * sc + uCloudSeason;
    // (the weather: whole regions cloudier or clearer, and streakier or not — the noise far larger, slowly evolving)
    vec3 qw = q0 * uCloudWeatherScale + uCloudTime * uCloudEvolve * vec3(0.12, 0.05, -0.08);
    float wk = clamp((cloudR(qw + vec3(0.57, 0.11, 0.39)) - 0.5) * 2.5, -1.0, 1.0), wk2 = clamp((cloudR(qw * 1.7 + vec3(0.31, 0.83, 0.07)) - 0.5) * 2.5, -1.0, 1.0);
    cv = clamp(cv * (1.0 + uCloudWeatherAmp * wk), 0.0, 1.0);
    ss *= 1.0 - uCloudStreakVary * smoothstep(0.4, -0.4, wk2);
    // (the layers with cover here — none: clear sky, nothing more to work out; a shadow's pass without the cirrus)
    vec4 need = step(vec4(0.01), cv) * vec4(1.0, 1.0, 1.0, 1.0 - fast);
    veil = 0.0; look = vec2(1.0, 0.0);
    if (need.x + need.y + need.z + need.w < 0.5) return vec4(0.0);
    vec3 Wn = vec3(W.x, W.y * uCloudStretch, W.z) * sc, Wq = Wn * ss;
    // (the flow: each phase's pattern carried along the wind, restarting every period, the two cross-faded)
    float ph = uCloudTime / uCloudFlowPeriod, fa = fract(ph), fb = fract(ph + 0.5), wa = 1.0 - abs(2.0 * fa - 1.0), wb = 1.0 - wa;
    // (the flow's way and distance a period: the climate's wind, and the drift east or west by latitude — reset each
    // period like the wind's, so it never shears the clouds into threads as a turn by latitude did)
    // (the warp of a warp, once — both phases flow through it)
    float ev0 = uCloudTime * uCloudEvolve;
    vec3 wq = cloudV3(q0 * 0.5 + ev0 * vec3(0.6, 0.2, -0.3), vec3(0.11, 0.53, 0.77));
    vec3 wr = cloudV3(q0 * 0.5 + uCloudWarp1 * wq + ev0 * vec3(-0.4, 0.5, 0.25), vec3(0.29, 0.91, 0.37));
    vec3 L = Wn * speed * flowLat * (uCloudFlowKm / 6371.0) + vec3(east.x, east.y * uCloudStretch, east.z) * sc * (uCloudDrift * cloudDriftRate(lat) * cos(lat) * uCloudFlowPeriod), wA = vec3(0.0), wB = vec3(0.0);
    vec4 nA = vec4(0.0), nB = vec4(0.0);
    if (wa > 0.001) nA = cloudRaw(q0 - L * (fa - 0.5), wr, Wq, ss, px, uCloudTime, need, fast, wA);
    if (wb > 0.001) nB = cloudRaw(q0 - L * (fb - 0.5), wr, Wq, ss, px, uCloudTime, need, fast, wB);
    vec4 med = vec4(uCloudQ[2], uCloudQ[7], uCloudQ[12], uCloudQ[17]);
    vec4 n = med + (wa * nA + wb * nB - med) / sqrt(wa * wa + wb * wb);
    vec3 w = wa > wb ? wA : wB;
    // (each layer cut by its cover; the frontal one crisp, a veil under it, its edges eroded)
    float cut = cloudCut(2, cv.b), dF = need.z * cloudStep(n.z, cut, uCloudEdge[2]);
    float tv = clamp((n.z - (cut - uCloudVeilWidth)) / uCloudVeilWidth, 0.0, 1.0);
    veil = fast > 0.5 ? 0.0 : uCloudVeil * tv * tv * step(0.02, cv.b);
    float cutC = cloudCut(1, cv.g), dC = need.y * cloudStep(n.y, cutC, uCloudEdge[1]);
    vec4 dens = vec4(need.x * cloudStep(n.x, cloudCut(0, cv.r), uCloudEdge[0]), dC, pow(dF, uCloudSharp), need.w * cloudStep(n.w, cloudCut(3, cv.a), uCloudEdge[3]));
    // (a shadow's pass: done — its billows are too faint to matter)
    if (fast > 0.5 || dF + dC <= 0.0) return dens;
    // (the billows: the cellular detail — cauliflower edges where it is low, its relief lit from the north-west)
    float N = float(textureSize(uCloudNoise, 0).x), D = uCloudDetail * 0.5;
    float fe = clamp(px * sc * N * D - 0.5, 0.0, 1.0);
    vec4 e = cloudN(w * D), e2 = cloudN((w + normalize(vec3(Lt.x, Lt.y * uCloudStretch, Lt.z)) * (0.25 / (16.0 * D))) * D);
    float B = mix(e.g * 0.625 + e.b * 0.25 + e.a * 0.125, 0.45, fe), B2 = mix(e2.g * 0.625 + e2.b * 0.25 + e2.a * 0.125, 0.45, fe);
    if (dF > 0.0 && dF < 1.0) {
        float k = mix(B, 1.0 - B, uCloudBillow) * uCloudErosion * (1.0 - dF);
        dF = clamp((dF - k) / (1.0 - k + 1e-6), 0.0, 1.0);
    }
    dF = pow(dF, uCloudSharp);
    // (how thick: past its cut — thin edges, dense cores; and the relief's light)
    look = vec2(1.0 + uCloudRelief * (B - B2) * 6.0 * (1.0 - fe), max(smoothstep(cut, cut + uCloudThick, n.z) * step(0.001, dF), smoothstep(cutC, cutC + uCloudThick, n.y) * step(0.001, dC)));
    dens.z = dF;
    return dens;
}
/** A small step from p toward the light (the page's: from the north-west) on the sphere. */
vec3 cloudTowardLight(vec3 p, float stepL) {
    vec3 e = normalize(vec3(p.z + 1e-6, 0.0, -p.x)), n = cross(p, e);
    return normalize(p + stepL * normalize(n - e));
}
/** The clouds' colour and alpha at p (uv its texture coordinates, px a pixel): the layers over one another — low, then
 *  the convective and frontal (their thin edges greyer and more see-through, their cores denser and whiter, their billows
 *  lit — lit 0, a phone: not), then the cirrus. */
vec4 cloudColour(vec3 p, vec2 uv, float px, vec4 op, vec2 grey, float light, float lit) {
    float veil; vec2 look; vec4 d = cloudLayers(p, uv, px, 0.0, veil, look);
    float th = look.y, aL = op.x * d.x, aC = op.y * d.y * (uCloudThinOp + (1.0 - uCloudThinOp) * th), aF = min(1.0, op.z * d.z * (uCloudThinOp + (1.0 - uCloudThinOp) * th) + veil * (1.0 - d.z)), aR = op.w * d.w;
    if (aL + aC + aF + aR <= 0.0) return vec4(0.0);
    float aM = max(aC, aF), gM = (uCloudThinGrey + (1.0 - uCloudThinGrey) * th) * (lit > 0.5 ? clamp(look.x, 1.0 - light, 1.0 + 0.5 * light) : 1.0);
    float pr = grey.x * aL, A = aL;
    pr = gM * aM + pr * (1.0 - aM); A = aM + A * (1.0 - aM);
    pr = grey.y * aR + pr * (1.0 - aR); A = aR + A * (1.0 - aR);
    float g = pr / max(A, 1e-4);
    return vec4(g, g, min(1.0, g * 1.02), A);
}
/** How much a cloud shades the ground at p (its layers but the cirrus). */
float cloudShade(vec3 p, vec2 uv, float px) { float v; vec2 l; vec4 d = cloudLayers(p, uv, px, 1.0, v, l); return max(max(d.y, d.z), 0.7 * d.x); }
#endif
`;

/** The unit sphere's point for texture coordinates (u, v), as cloudPoint — into o. */
export function cloudPoint(u, v, o = [0, 0, 0]) {
    const phi = u * 2 * Math.PI, th = Math.PI * (1 - v);
    o[0] = -Math.cos(phi) * Math.sin(th); o[1] = Math.cos(th); o[2] = Math.sin(phi) * Math.sin(th);
    return o;
}
/** The storms (cloudStorms') where the drift has carried them at time t (s): each turned about the axis at its own
 *  latitude's rate — east for a positive rate. Into a new list. */
export function cloudStormsAt(S, t, K = CLOUDS) {
    return S.map(([x, y, z, s, sz]) => { const a = -t * driftRadPerS(K) * cloudDriftRate(Math.asin(Math.max(-1, Math.min(1, y)))), c = Math.cos(a), n = Math.sin(a); return [c * x - n * z, y, n * x + c * z, s, sz]; });
}
/** The drift's turn rate at a latitude (radians), as the GLSL's cloudDriftRate. */
export function cloudDriftRate(lat) {
    const d = lat * 180 / Math.PI, v = -0.55 * Math.exp(-((d / 20) ** 2)) + 0.95 * Math.exp(-(((Math.abs(d) - 52) / 22) ** 2));
    return v / Math.max(Math.cos(lat), 0.2);
}
/** The noise's scale on the unit sphere, and the drift in radians a second. */
export const scaleOf = (K = CLOUDS) => 2 * 6371 / K.sizeKm;
export const driftRadPerS = (K = CLOUDS) => K.driftDegPerS * Math.PI / 180;
/** The settings as the shader's uniforms' values: the edges, and the quantiles flat (low, convective, frontal, cirrus). */
export const cloudEdges = (K = CLOUDS) => [K.edgeLow, K.edgeConv, K.edgeFront, K.edgeCirrus];
export const cloudQuantileList = (K = CLOUDS) => [...K.QLow, ...K.QConv, ...K.QFront, ...K.QCirrus];

const _a = [0, 0, 0, 0], _b = [0, 0, 0, 0], M = [0.00, 0.80, 0.60, -0.80, 0.36, -0.48, -0.60, -0.48, 0.64];
const rot = (x, y, z, s, o) => { o[0] = (M[0] * x + M[3] * y + M[6] * z) * s; o[1] = (M[1] * x + M[4] * y + M[7] * z) * s; o[2] = (M[2] * x + M[5] * y + M[8] * z) * s; return o; };
const _q = [0, 0, 0], _r = [0, 0, 0], _m = [0, 0, 0];
const v3 = (T, ax, ay, az, o1, o2, o3, o) => { o[0] = sample(T, ax + o1, ay + o2, az + o3, _a)[0] - 0.5; o[1] = sample(T, ay + o2, az + o3, ax + o1, _a)[0] - 0.5; o[2] = sample(T, az + o3, ax + o1, ay + o2, _a)[0] - 0.5; return o; };
const R = (T, x, y, z) => sample(T, x, y, z, _a)[0];
function cut(Q, c) {
    const u = Math.max(0.05, Math.min(0.95, 1 - c));
    return u < 0.25 ? lerp(Q[0], Q[1], (u - 0.05) / 0.2) : u < 0.5 ? lerp(Q[1], Q[2], (u - 0.25) / 0.25) : u < 0.75 ? lerp(Q[2], Q[3], (u - 0.5) / 0.25) : lerp(Q[3], Q[4], (u - 0.75) / 0.2);
}
const step = (n, c, e) => sm(c - e, c + e, n);
/** A field (cloudFields') read at texture coordinates (u, v): its four covers and its wind (m/s) — into cv, wd. */
function fieldAt(F, u, v, cv, wd) {
    const gx = u * F.w - 0.5, gy = (1 - v) * F.h - 0.5, x0 = Math.floor(gx), y0 = Math.max(0, Math.min(F.h - 2, Math.floor(gy))), fx = gx - x0, fy = Math.max(0, Math.min(1, gy - y0));
    const i0 = ((x0 % F.w) + F.w) % F.w, i1 = (i0 + 1) % F.w, a = 4 * (y0 * F.w + i0), b = 4 * (y0 * F.w + i1), c = 4 * ((y0 + 1) * F.w + i0), d = 4 * ((y0 + 1) * F.w + i1);
    const bl = (A, k) => ((A[a + k] * (1 - fx) + A[b + k] * fx) * (1 - fy) + (A[c + k] * (1 - fx) + A[d + k] * fx) * fy) / 255;
    for (let k = 0; k < 4; k++) cv[k] = bl(F.cover, k);
    wd[0] = (bl(F.wind, 0) - 0.5) * 80; wd[1] = (bl(F.wind, 1) - 0.5) * 80;
}
/** The four layers' raw noise at (qx0, qy0, qz0) in the noise's space at time tm, as the GLSL's cloudRaw — into o
 *  [low, convective, frontal, cirrus] and w (the frontal field's warped point, for its erosion). */
/** The warp of a warp at (qx0, qy0, qz0), time tm — into r (shared by the flow's two phases). */
function cloudWarp(T, qx0, qy0, qz0, tm, K, r) {
    const ev = tm * K.evolve, q = v3(T, qx0 * 0.5 + ev * 0.6, qy0 * 0.5 + ev * 0.2, qz0 * 0.5 - ev * 0.3, 0.11, 0.53, 0.77, _q);
    return v3(T, qx0 * 0.5 + K.warp1 * q[0] - ev * 0.4, qy0 * 0.5 + K.warp1 * q[1] + ev * 0.5, qz0 * 0.5 + K.warp1 * q[2] + ev * 0.25, 0.29, 0.91, 0.37, r);
}
function cloudRaw(T, qx0, qy0, qz0, Wqx, Wqy, Wqz, ss, px, tm, K, o, w, need = ALL, fast = false, r = cloudWarp(T, qx0, qy0, qz0, tm, K, _r)) {
    const sc = scaleOf(K), N = T.N, ev = tm * K.evolve;
    const wx = qx0 + K.warp2 * r[0] + ev * 0.15, wy = qy0 + K.warp2 * r[1] - ev * 0.1, wz = qz0 + K.warp2 * r[2] + ev * 0.3, fk = K.streakFrontKm / 6371 * 0.5;
    w[0] = wx; w[1] = wy; w[2] = wz;
    o[0] = o[1] = o[2] = o[3] = 0;
    // (only the layers with cover here — the rest are clear; a shadow's pass, fast, without the wind's smear)
    if (need[2]) {
        let n = K.w0 * (fast ? R(T, wx * 0.5, wy * 0.5, wz * 0.5) : 0.25 * R(T, wx * 0.5 - Wqx * fk, wy * 0.5 - Wqy * fk, wz * 0.5 - Wqz * fk) + 0.5 * R(T, wx * 0.5, wy * 0.5, wz * 0.5) + 0.25 * R(T, wx * 0.5 + Wqx * fk, wy * 0.5 + Wqy * fk, wz * 0.5 + Wqz * fk));
        rot(wx, wy, wz, 1.03, _m); n += K.w1 * R(T, _m[0] + 0.4, _m[1], _m[2]);
        rot(wx, wy, wz, 2.07, _m); const f2 = Math.max(0, Math.min(1, px * sc * N * 2.07 - 0.5));
        n += K.w2 * ((1 - f2) * R(T, _m[1] + 0.7, _m[2], _m[0]) + f2 * 0.5);
        const ws = K.w0 + K.w1 + K.w2;
        o[2] = 0.5 + (n - 0.5 * ws) / ws * K.contrast;
    }
    if (need[0]) {
    const lx = qx0 * K.lowScale + 0.3 * r[0], ly = qy0 * K.lowScale + 0.3 * r[1], lz = qz0 * K.lowScale + 0.3 * r[2], fl = Math.max(0, Math.min(1, px * sc * N * K.lowScale * 0.5 - 0.5));
    o[0] = 0.6 * ((1 - fl) * sample(T, lx * 0.5 + 0.21, ly * 0.5, lz * 0.5, _b)[2] + fl * 0.48) + 0.4 * R(T, qx0 * 0.7 + 0.5 + 0.15 * ev, qy0 * 0.7 + 0.13, qz0 * 0.7 + 0.2 * ev);
    }
    if (need[1]) {
    const cx = qx0 * K.convScale + 0.5 * r[0], cy = qy0 * K.convScale + 0.5 * r[1], cz = qz0 * K.convScale + 0.5 * r[2], fc = Math.max(0, Math.min(1, px * sc * N * K.convScale * 0.5 - 0.5));
    o[1] = 0.55 * ((1 - fc) * sample(T, cx * 0.5, cy * 0.5 + 0.37 + 0.45 * ev, cz * 0.5 + 0.3 * ev, _b)[3] + fc * 0.48) + 0.45 * R(T, qx0 * 0.9 - 0.3 * ev, qy0 * 0.9 + 0.2 * ev, qz0 * 0.9 + 0.61);
    }
    if (need[3]) {
    const rx = (qx0 + K.cirrusWarp * r[0]) * K.cirrusScale + 0.77 + 0.2 * ev, ry = (qy0 + K.cirrusWarp * r[1]) * K.cirrusScale + 0.3 * ev, rz = (qz0 + K.cirrusWarp * r[2]) * K.cirrusScale + 0.33 - 0.2 * ev, rk = K.cirrusScale * K.streakCirrusKm / 6371 * 0.25;
    // (three taps along the wind, 1.6 times as far apart as five were: the same streaks' length)
    let nR = 0;
    for (let k = -1; k <= 1; k++) { const kk = 1.6 * k * rk; nR += (1 - K.cirrusFine) * R(T, rx + kk * Wqx, ry + kk * Wqy, rz + kk * Wqz) + K.cirrusFine * R(T, rx * 2.3 + 0.13 + kk * Wqx * 2.3, ry * 2.3 + 0.57 + kk * Wqy * 2.3, rz * 2.3 + kk * Wqz * 2.3); }
    o[3] = 0.5 + (nR / 3 - 0.5) * (1 + 0.8 * ss);
    }
    return o;
}
const ALL = [1, 1, 1, 1], _need = [0, 0, 0, 0], _cv = [0, 0, 0, 0], _wd = [0, 0], _nA = [0, 0, 0, 0], _nB = [0, 0, 0, 0], _wA = [0, 0, 0], _wB = [0, 0, 0];
/**
 * The four layers' densities at unit-sphere point (x, y, z) — texture coordinates (u, v), a pixel px (on the unit sphere),
 * the fields F (cloudFields'), the storms S (cloudStorms'), time t (s; an export: 0) — as the GLSL: into o [low,
 * convective, frontal, cirrus, veil, the billows' light (≈ 1), thickness (0 … 1)]; `fast`: a shadow's pass (no cirrus,
 * veil, billows or wind smear).
 */
export function cloudLayersAt(x, y, z, u, v, px, F, S, t = 0, K = CLOUDS, o = [0, 0, 0, 0, 0, 1, 0], fast = false) {
    const T = cloudNoiseTexture(), cv = _cv;
    fieldAt(F, u, v, cv, _wd);
    let ex = z + 1e-6, ez = -x; const el = Math.hypot(ex, ez); ex /= el; ez /= el;
    const nx = y * ez, ny = z * ex - x * ez, nz = -y * ex, speed = Math.hypot(_wd[0], _wd[1]);
    let Wx = ex, Wy = 0, Wz = ez;
    if (speed > 1e-3) { Wx = (_wd[0] * ex + _wd[1] * nx) / speed; Wy = (_wd[1] * ny) / speed; Wz = (_wd[0] * ez + _wd[1] * nz) / speed; }
    const lat = Math.asin(Math.max(-1, Math.min(1, y)));
    let ss = sm(0.5, K.windFull, speed) * lerp(K.streakLat[0], 1, sm(K.streakLat[1], K.streakLat[2], Math.abs(lat * 180 / Math.PI)));
    let Lx = nx - ex, Ly = ny, Lz = nz - ez; { const l = Math.hypot(Lx, Ly, Lz); Lx /= l; Ly /= l; Lz /= l; }
    const flowLat = lerp(K.flowLat[0], K.flowLat[1], sm(10, 45, Math.abs(lat * 180 / Math.PI)));
    let px0 = x, py0 = y, pz0 = z;
    for (const [cx0, cy, cz0, s, sz] of S) {
        const ac = -t * driftRadPerS(K) * cloudDriftRate(Math.asin(Math.max(-1, Math.min(1, cy)))), cx = Math.cos(ac) * cx0 - Math.sin(ac) * cz0, cz = Math.sin(ac) * cx0 + Math.cos(ac) * cz0;
        const dt = cx * px0 + cy * py0 + cz * pz0;
        if (dt < 0.9) continue;
        const r = Math.acos(Math.min(1, dt)) / (K.stormKm * sz / 6371);
        if (r > 3) continue;
        const g = Math.exp(-r * r), th = K.stormTwist * s * g * (sz < 0.6 ? K.tropicalTwist : 1), co = Math.cos(th), si = Math.sin(th);
        const kx = cy * pz0 - cz * py0, ky = cz * px0 - cx * pz0, kz = cx * py0 - cy * px0;
        const qx = px0 * co + kx * si + cx * dt * (1 - co), qy = py0 * co + ky * si + cy * dt * (1 - co), qz = pz0 * co + kz * si + cz * dt * (1 - co);
        px0 = qx; py0 = qy; pz0 = qz;
        const boost = K.stormCover * Math.abs(s) * g;
        if (sz < 0.6) cv[1] = Math.min(1, cv[1] + 3 * boost); else cv[2] = Math.min(1, cv[2] + boost);
        cv[3] = Math.min(1, cv[3] + 0.5 * boost); ss *= 1 - g;
    }
    const so = F.offset ?? [0, 0, 0], sc = scaleOf(K), qx0 = px0 * sc + so[0], qy0 = py0 * K.stretch * sc + so[1], qz0 = pz0 * sc + so[2];
    // (the weather: whole regions cloudier or clearer, and streakier or not)
    { const e = t * K.evolve, wxq = qx0 * K.weatherScale + 0.12 * e, wyq = qy0 * K.weatherScale + 0.05 * e, wzq = qz0 * K.weatherScale - 0.08 * e;
      const wk = Math.max(-1, Math.min(1, (R(T, wxq + 0.57, wyq + 0.11, wzq + 0.39) - 0.5) * 2.5)), wk2 = Math.max(-1, Math.min(1, (R(T, wxq * 1.7 + 0.31, wyq * 1.7 + 0.83, wzq * 1.7 + 0.07) - 0.5) * 2.5));
      for (let k = 0; k < 4; k++) cv[k] = Math.max(0, Math.min(1, cv[k] * (1 + K.weatherAmp * wk)));
      ss *= 1 - K.streakVary * sm(0.4, -0.4, wk2); }
    // (the layers with cover here — none: clear sky, nothing more to work out)
    const need = _need;
    for (let k = 0; k < 4; k++) need[k] = cv[k] >= 0.01 ? 1 : 0;
    if (fast) need[3] = 0;
    o[0] = o[1] = o[2] = o[3] = o[4] = 0; o[5] = 1; o[6] = 0;
    if (!(need[0] || need[1] || need[2] || need[3])) return o;
    const Wnx = Wx * sc, Wny = Wy * K.stretch * sc, Wnz = Wz * sc;
    // (the flow: two phases half a period apart, each carried along the wind and restarting, cross-faded)
    const ph = t / K.flowPeriod, fa = ph - Math.floor(ph), fb0 = ph + 0.5, fb = fb0 - Math.floor(fb0), wa = 1 - Math.abs(2 * fa - 1), wb = 1 - wa;
    const Lk = speed * flowLat * K.flowKm / 6371, Dk = driftRadPerS(K) * cloudDriftRate(lat) * Math.cos(lat) * K.flowPeriod;
    const LX = Wnx * Lk + ex * sc * Dk, LY = Wny * Lk, LZ = Wnz * Lk + ez * sc * Dk;
    const wr = cloudWarp(T, qx0, qy0, qz0, t, K, _r);
    if (wa > 0.001) cloudRaw(T, qx0 - LX * (fa - 0.5), qy0 - LY * (fa - 0.5), qz0 - LZ * (fa - 0.5), Wnx * ss, Wny * ss, Wnz * ss, ss, px, t, K, _nA, _wA, need, fast, wr); else _nA.fill(0);
    if (wb > 0.001) cloudRaw(T, qx0 - LX * (fb - 0.5), qy0 - LY * (fb - 0.5), qz0 - LZ * (fb - 0.5), Wnx * ss, Wny * ss, Wnz * ss, ss, px, t, K, _nB, _wB, need, fast, wr); else _nB.fill(0);
    const norm = Math.sqrt(wa * wa + wb * wb), med = [K.QLow[2], K.QConv[2], K.QFront[2], K.QCirrus[2]], n = [0, 0, 0, 0];
    for (let k = 0; k < 4; k++) n[k] = med[k] + (wa * _nA[k] + wb * _nB[k] - med[k]) / norm;
    const w = wa > wb ? _wA : _wB;
    const cF = cut(K.QFront, cv[2]);
    let dF = need[2] * step(n[2], cF, K.edgeFront);
    const tv = Math.max(0, Math.min(1, (n[2] - (cF - K.veilWidth)) / K.veilWidth));
    o[4] = !fast && cv[2] >= 0.02 ? K.veil * tv * tv : 0;
    const cC = cut(K.QConv, cv[1]);
    o[0] = need[0] * step(n[0], cut(K.QLow, cv[0]), K.edgeLow);
    o[1] = need[1] * step(n[1], cC, K.edgeConv);
    o[2] = Math.pow(dF, K.sharp);
    o[3] = need[3] * step(n[3], cut(K.QCirrus, cv[3]), K.edgeCirrus);
    // (a shadow's pass: done — its billows are too faint to matter; no frontal or convective cloud: no billows to draw)
    if (fast || dF + o[1] <= 0) return o;
    // (the billows: cauliflower edges where the cellular detail is low; its relief lit from the north-west)
    const D = K.detail * 0.5, fe = Math.max(0, Math.min(1, px * sc * T.N * D - 0.5));
    sample(T, w[0] * D, w[1] * D, w[2] * D, _b);
    const B = (1 - fe) * (_b[1] * 0.625 + _b[2] * 0.25 + _b[3] * 0.125) + fe * 0.45;
    { const lqx = Lx, lqy = Ly * K.stretch, lqz = Lz, l = Math.hypot(lqx, lqy, lqz), st = 0.25 / (16 * D) / l; sample(T, (w[0] + lqx * st) * D, (w[1] + lqy * st) * D, (w[2] + lqz * st) * D, _b); }
    const B2 = (1 - fe) * (_b[1] * 0.625 + _b[2] * 0.25 + _b[3] * 0.125) + fe * 0.45;
    if (dF > 0 && dF < 1) {
        const k = lerp(B, 1 - B, K.billow) * K.erosion * (1 - dF);
        dF = Math.max(0, Math.min(1, (dF - k) / (1 - k + 1e-6)));
    }
    o[2] = Math.pow(dF, K.sharp);
    o[5] = 1 + K.relief * (B - B2) * 6 * (1 - fe);
    o[6] = Math.max(o[2] > 0.001 ? sm(cF, cF + K.thick, n[2]) : 0, o[1] > 0.001 ? sm(cC, cC + K.thick, n[1]) : 0);
    return o;
}

/** Each layer's raw noise at random places (no wind, no storms, time 0): its quantiles at 5, 25, 50, 75, 95 % — for
 *  CLOUDS.Q* (low, convective, frontal, cirrus). */
export function cloudQuantiles(n = 20000, K = CLOUDS) {
    const T = cloudNoiseTexture(), raw = [[], [], [], []], p = [0, 0, 0], o = [0, 0, 0, 0], w = [0, 0, 0], sc = scaleOf(K);
    for (let i = 0; i < n; i++) {
        const u = Math.random(), v = Math.acos(2 * Math.random() - 1) / Math.PI;
        cloudPoint(u, 1 - v, p);
        cloudRaw(T, p[0] * sc, p[1] * K.stretch * sc, p[2] * sc, 0, 0, 0, 0, 0, 0, K, o, w);
        for (let k = 0; k < 4; k++) raw[k].push(o[k]);
    }
    return raw.map(a => { a.sort((x, y) => x - y); return [0.05, 0.25, 0.5, 0.75, 0.95].map(q => +a[Math.floor(q * (a.length - 1))].toFixed(3)); });
}

/** A small step from (x, y, z) toward the light (the page's: from the north-west) on the sphere, as cloudTowardLight. */
function towardLight(x, y, z, stepL, o) {
    let ex = z + 1e-6, ez = -x; const el = Math.hypot(ex, ez); ex /= el; ez /= el;
    const nx = y * ez, ny = z * ex - x * ez, nz = -y * ex;                 // (north = p × east)
    let lx = nx - ex, ly = ny, lz = nz - ez; const ll = Math.hypot(lx, ly, lz); lx /= ll; ly /= ll; lz /= ll;
    const px = x + stepL * lx, py = y + stepL * ly, pz = z + stepL * lz, l = Math.hypot(px, py, pz);
    o[0] = px / l; o[1] = py / l; o[2] = pz / l;
    return o;
}

/**
 * The clouds as a grid at most `maxW` wide (rows north → south, columns from −180°): per pixel [alpha, grey, shadow] —
 * the layers lit and composited; the shadow each place gets from the cloud a step toward the light (shadowKm, the local
 * north-west), read from the grid itself rather than worked out again — from the fields (cloudFields') and the storms
 * (cloudStorms') at one still moment.
 */
export function cloudGrid(F, storms, W, K = CLOUDS, maxW = 2048) {
    const w = Math.min(W, maxW), h = w >> 1, px = 2 * Math.PI / w, small = new Float32Array(3 * w * h), p = [0, 0, 0], q = [0, 0, 0], o = [0, 0, 0, 0, 0, 1, 0];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const u = (x + 0.5) / w, v = 1 - (y + 0.5) / h, i = 3 * (y * w + x);
        cloudPoint(u, v, p);
        cloudLayersAt(p[0], p[1], p[2], u, v, px, F, storms, 0, K, o);
        const dL = o[0], dC = o[1], dF = o[2], dR = o[3], veil = o[4], th = o[6], thin = K.thinOp + (1 - K.thinOp) * th;
        const aL = K.opLow * dL, aC = K.opConv * dC * thin, aF = Math.min(1, K.opFront * dF * thin + veil * (1 - dF)), aR = K.opCirrus * dR;
        const aM = Math.max(aC, aF), gM = (K.thinGrey + (1 - K.thinGrey) * th) * Math.max(1 - K.light, Math.min(1 + 0.5 * K.light, o[5]));
        let pr = K.greyLow * aL, A = aL;
        pr = gM * aM + pr * (1 - aM); A = aM + A * (1 - aM);
        pr = K.greyCirrus * aR + pr * (1 - aR); A = aR + A * (1 - aR);
        small[i] = A; small[i + 1] = A > 0 ? pr / A : 1; small[i + 2] = Math.max(o[1], o[2], 0.7 * o[0]);
    }
    const shade = new Float32Array(w * h), st = K.shadowKm / 6371;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        cloudPoint((x + 0.5) / w, 1 - (y + 0.5) / h, p);
        towardLight(p[0], p[1], p[2], st, q);
        const su = ((Math.atan2(q[2], -q[0]) / (2 * Math.PI)) % 1 + 1) % 1, sv = 1 - Math.acos(Math.max(-1, Math.min(1, q[1]))) / Math.PI;
        const gx = su * w - 0.5, gy = Math.max(0, Math.min(h - 1, (1 - sv) * h - 0.5)), x0 = Math.floor(gx), y0 = Math.floor(gy), tx = gx - x0, ty = gy - y0;
        const a0 = ((x0 % w) + w) % w, a1 = (a0 + 1) % w, b1 = Math.min(h - 1, y0 + 1);
        shade[y * w + x] = (small[3 * (y0 * w + a0) + 2] * (1 - tx) + small[3 * (y0 * w + a1) + 2] * tx) * (1 - ty) + (small[3 * (b1 * w + a0) + 2] * (1 - tx) + small[3 * (b1 * w + a1) + 2] * tx) * ty;
    }
    for (let i = 0; i < w * h; i++) small[3 * i + 2] = shade[i];
    return { w, h, small };
}
/** The cloud grid at pixel (x, y) of a W-wide picture: [premultiplied grey, alpha] (bilinear where the grid is smaller),
 *  the shadow folded in — into o. */
function gridAt(G, W, x, y, K, o) {
    const { w, h, small } = G, k = w / W;
    const fx = (x + 0.5) * k - 0.5, fy = Math.max(0, Math.min(h - 1, (y + 0.5) * k - 0.5)), x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const a0 = ((x0 % w) + w) % w, a1 = (a0 + 1) % w, b1 = Math.min(h - 1, y0 + 1);
    const at = n => (small[3 * (y0 * w + a0) + n] * (1 - tx) + small[3 * (y0 * w + a1) + n] * tx) * (1 - ty) + (small[3 * (b1 * w + a0) + n] * (1 - tx) + small[3 * (b1 * w + a1) + n] * tx) * ty;
    const ac = at(0), as = K.shadow * at(2) * (1 - ac);
    o[0] = at(1) * ac; o[1] = ac + as;
    return o;
}
/** The clouds alone on a transparent picture W × W/2: RGBA bytes (the shadow faint and dark). */
export function cloudPicture(G, W, K = CLOUDS) {
    const H = W >> 1, out = new Uint8Array(4 * W * H), o = [0, 0];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        gridAt(G, W, x, y, K, o);
        const A = o[1], gg = A > 0 ? Math.round(255 * o[0] / A) : 0, oo = 4 * (y * W + x);
        out[oo] = gg; out[oo + 1] = gg; out[oo + 2] = Math.min(255, Math.round(gg * 1.02)); out[oo + 3] = Math.round(255 * A);
    }
    return out;
}
/** The clouds laid over an RGBA picture W × W/2 in place — no picture of the clouds' own the picture's size. */
export function cloudOver(G, data, W, K = CLOUDS) {
    const H = W >> 1, o = [0, 0];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        gridAt(G, W, x, y, K, o);
        if (!(o[1] > 0)) continue;
        const A = o[1], gg = 255 * o[0] / A, d = 4 * (y * W + x);
        // (as the picture's own over: its byte colours, rounded as cloudPicture's bytes would be)
        const g8 = Math.round(gg), b8 = Math.min(255, Math.round(g8 * 1.02)), a8 = Math.round(255 * A) / 255;
        data[d] = Math.round(data[d] * (1 - a8) + g8 * a8); data[d + 1] = Math.round(data[d + 1] * (1 - a8) + g8 * a8); data[d + 2] = Math.round(data[d + 2] * (1 - a8) + b8 * a8);
    }
}
