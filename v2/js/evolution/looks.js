// The Evolution page's looks: the terrain palettes to choose from, V1's land heightmap, and the words of the hover
// readout. (V1's own colours were tried on V2's terrain beside the lab's relief, 2026-09-28: the developer chose the
// relief, and asked to look at other colour options — the palettes below, beside the relief.)

import { CrustType, CrustFlag, OrogenyType, VolcanicType } from '../tectonics/model/crust.js';
import { tintOf } from '../view/terrain-shade.js';

// ── terrain palettes: colour stops by height (km from sea level; the sea and the land apart), shaded by the relief ──
// Maps. Topographic: Wikipedia's convention for topographic maps (WikiProject Maps) — pale greens, creams, tans, greys to
// near-white by 3 km; a pale bathymetry. ETOPO: after GMT's etopo1 colour table (deep violet-blue trenches to cyan
// shelves; green, cream, ochre, rose-brown, grey to 8 km). DEM: after GMT's dem2 (green, yellow, rust, red, grey, white
// by 4 km). Scientific: after matplotlib's "terrain". The others are drawn after well-known styles: Natural (muted,
// Natural Earth), Swiss (Imhof's: cool dark lowlands to warm bright heights), School Atlas (green, yellow, orange,
// brown, purple peaks), Satellite (Blue Marble-like), Grey (plain shaded relief), Antique (a parchment atlas).
// Other worlds — concept-art looks: Arid (ochre and rust land, teal seas), Frozen, Lush, Alien (violet land, emerald
// seas), Volcanic (black basalt, ember-lit heights).
export const PALETTES = {
    topographic: {
        sea: [[-5, [113, 171, 216]], [-4, [121, 178, 222]], [-3, [132, 185, 227]], [-2, [141, 193, 234]], [-1.5, [150, 201, 240]], [-1, [161, 210, 247]],
            [-0.5, [172, 219, 251]], [-0.2, [185, 227, 255]], [-0.05, [198, 236, 255]], [0, [216, 242, 254]]],
        land: [[0, [172, 208, 165]], [0.05, [148, 191, 139]], [0.1, [168, 198, 143]], [0.2, [189, 204, 150]], [0.3, [209, 215, 171]], [0.4, [225, 228, 181]],
            [0.5, [239, 235, 192]], [0.6, [232, 225, 182]], [0.7, [222, 214, 163]], [0.8, [211, 202, 157]], [0.9, [202, 185, 130]], [1, [195, 167, 107]],
            [1.2, [185, 152, 90]], [1.4, [170, 135, 83]], [1.6, [172, 154, 124]], [1.8, [186, 174, 154]], [2, [202, 195, 184]], [2.5, [224, 222, 216]], [3, [245, 244, 242]]],
    },
    natural: {
        sea: [[-7, [22, 44, 78]], [-4.5, [36, 68, 108]], [-2.5, [52, 92, 132]], [-0.8, [80, 124, 158]], [-0.1, [118, 160, 184]], [0, [138, 176, 196]]],
        land: [[0, [112, 145, 95]], [0.2, [132, 160, 104]], [0.6, [168, 172, 122]], [1.2, [190, 178, 140]], [2, [178, 160, 132]], [3, [162, 152, 142]], [4.2, [204, 202, 200]], [5.5, [242, 242, 244]]],
    },
    swiss: {
        sea: [[-7, [30, 58, 92]], [-4, [48, 86, 122]], [-2, [72, 114, 146]], [-0.5, [110, 150, 172]], [0, [150, 184, 196]]],
        land: [[0, [112, 146, 124]], [0.3, [142, 168, 128]], [0.8, [184, 190, 140]], [1.5, [214, 206, 156]], [2.5, [232, 222, 180]], [3.5, [243, 237, 212]], [5, [252, 250, 244]]],
    },
    satellite: {
        sea: [[-7, [5, 12, 34]], [-4, [8, 22, 56]], [-2, [12, 36, 82]], [-0.5, [22, 62, 112]], [-0.1, [40, 98, 138]], [0, [58, 122, 150]]],
        land: [[0, [58, 86, 46]], [0.3, [74, 96, 54]], [0.8, [108, 104, 72]], [1.6, [132, 114, 88]], [2.8, [122, 110, 98]], [4, [172, 170, 168]], [5.2, [236, 236, 240]]],
    },
    school: {
        sea: [[-7, [18, 50, 120]], [-4, [30, 80, 160]], [-2, [60, 120, 190]], [-0.2, [130, 180, 225]], [0, [170, 210, 240]]],
        land: [[0, [86, 146, 68]], [0.2, [140, 190, 100]], [0.5, [230, 222, 140]], [1, [226, 176, 92]], [2, [186, 114, 62]], [3, [140, 72, 52]], [4, [150, 112, 142]], [5.5, [242, 240, 250]]],
    },
    etopo: {
        sea: [[-11, [10, 0, 121]], [-8, [0, 14, 203]], [-6, [0, 47, 229]], [-4, [0, 81, 255]], [-2, [0, 115, 255]], [-1, [0, 132, 255]], [-0.5, [0, 141, 255]],
            [-0.2, [26, 159, 255]], [0, [141, 212, 255]]],
        land: [[0, [51, 102, 0]], [0.05, [51, 204, 102]], [0.2, [187, 228, 146]], [0.5, [255, 220, 185]], [1, [243, 202, 137]], [1.5, [230, 184, 88]], [2, [217, 166, 39]],
            [2.5, [168, 154, 31]], [3, [164, 144, 25]], [4, [159, 123, 13]], [5, [153, 102, 0]], [5.5, [162, 89, 89]], [6, [178, 118, 118]], [7, [194, 176, 176]], [8, [229, 229, 229]]],
    },
    dem: {
        sea: [[-7, [20, 40, 90]], [-3, [40, 80, 140]], [-0.5, [80, 130, 180]], [0, [120, 170, 210]]],
        land: [[0, [0, 97, 71]], [0.05, [16, 122, 47]], [0.5, [232, 215, 125]], [1.2, [161, 67, 0]], [1.8, [158, 0, 0]], [2.8, [110, 110, 110]], [4, [255, 255, 255]]],
    },
    scientific: {
        sea: [[-6, [51, 51, 153]], [-3, [26, 102, 204]], [0, [0, 153, 255]]],
        land: [[0, [0, 204, 102]], [1.5, [255, 255, 153]], [3.5, [128, 92, 84]], [6, [255, 255, 255]]],
    },
    grey: {
        sea: [[-7, [90, 100, 115]], [-2, [130, 140, 155]], [0, [170, 178, 190]]],
        land: [[0, [215, 215, 210]], [2, [200, 200, 196]], [5, [235, 235, 235]]],
    },
    arid: {
        sea: [[-7, [8, 40, 52]], [-3, [14, 70, 82]], [-0.5, [40, 120, 122]], [0, [80, 160, 150]]],
        land: [[0, [204, 170, 118]], [0.4, [196, 150, 98]], [1, [182, 118, 70]], [2, [156, 86, 52]], [3.5, [118, 64, 44]], [5, [160, 120, 100]], [6.5, [236, 222, 206]]],
    },
    frozen: {
        sea: [[-7, [10, 22, 40]], [-3, [20, 44, 70]], [-0.5, [50, 86, 110]], [0, [110, 150, 170]]],
        land: [[0, [152, 150, 128]], [0.15, [196, 202, 204]], [0.6, [222, 228, 234]], [2, [240, 244, 248]], [4, [253, 254, 255]]],
    },
    lush: {
        sea: [[-7, [6, 30, 80]], [-3, [10, 60, 120]], [-0.8, [20, 120, 160]], [-0.1, [50, 190, 190]], [0, [90, 215, 200]]],
        land: [[0, [26, 110, 50]], [0.3, [44, 140, 58]], [0.9, [70, 128, 52]], [1.8, [96, 110, 70]], [2.8, [122, 118, 106]], [4, [190, 190, 188]], [5, [250, 250, 252]]],
    },
    alien: {
        sea: [[-7, [4, 40, 40]], [-3, [6, 80, 74]], [-0.5, [20, 140, 120]], [0, [60, 190, 160]]],
        land: [[0, [96, 48, 120]], [0.3, [126, 62, 140]], [0.9, [168, 88, 150]], [1.8, [206, 128, 120]], [3, [222, 170, 130]], [4.5, [240, 220, 230]], [6, [250, 244, 255]]],
    },
    volcanic: {
        sea: [[-7, [10, 16, 20]], [-3, [18, 32, 38]], [-0.5, [34, 58, 62]], [0, [60, 86, 84]]],
        land: [[0, [46, 44, 42]], [0.5, [62, 58, 54]], [1.5, [84, 74, 66]], [2.5, [112, 80, 62]], [3.5, [150, 70, 40]], [5, [190, 90, 50]], [6.5, [230, 200, 180]]],
    },
    antique: {
        sea: [[-6, [112, 142, 140]], [-3, [136, 164, 158]], [-1, [160, 184, 172]], [-0.1, [184, 202, 184]], [0, [198, 212, 190]]],
        land: [[0, [226, 208, 166]], [0.4, [214, 192, 146]], [1, [198, 172, 124]], [2, [178, 148, 104]], [3.2, [152, 122, 86]], [4.5, [128, 102, 74]], [6, [110, 88, 66]]],
    },
};
const LUT_MIN_M = -12000, LUT_STEP_M = 10, LUT_N = 2201, ZERO = -LUT_MIN_M / LUT_STEP_M;
const luts = new Map();

// ── toning: most of these come from flat print maps, pale or vivid, and on the globe (the relief's lit slopes brighten
// a colour up to ×1.26) they read too bright (developer). Each palette's sea and land are toned toward the relief's
// brightness and saturation — measured over the depths and heights most of a planet has, in linear light — part of the
// way (TONE_STRENGTH), and only ever darker and calmer, so each keeps its own character; the relief itself is untouched.
const TONE_STRENGTH = 0.75;
const TONE_SEA = [[-5.5, 1], [-5, 1], [-4.5, 1], [-4, 1], [-3.5, 1], [-3, 1], [-2, 1], [-1, 0.5], [-0.5, 0.5], [-0.2, 0.5]];
const TONE_LAND = [[0.05, 1], [0.15, 1], [0.3, 1], [0.5, 1], [0.8, 1], [1.2, 1], [1.8, 1], [2.5, 1], [3.5, 0.5], [5, 0.5]];
const toLinear = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const toByte = v => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(0, v), 1 / 2.4) - 0.055);
const lumOf = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const chromaOf = c => { const l = lumOf(c); return Math.hypot(c[0] - l, c[1] - l, c[2] - l); };
/** Mean brightness and saturation (linear light) of a colour-at-height function over weighted sample heights. */
function toneStats(colourAt, samples) {
    let L = 0, C = 0, W = 0;
    for (const [km, w] of samples) { const c = colourAt(km).map(toLinear); L += w * lumOf(c); C += w * chromaOf(c); W += w; }
    return { L: L / W, C: C / W };
}
/** How much to darken (exposure) and calm (saturation) one side of a palette, toward the relief's. */
function toneFor(stops, samples) {
    const ref = toneStats(km => tintOf(km, [0, 0, 0]), samples), own = toneStats(km => { const o = [0, 0, 0]; stopsAt(stops, km, o, 0); return o; }, samples);
    const exposure = Math.min(1, Math.pow(ref.L / own.L, TONE_STRENGTH));
    const saturation = Math.min(1, Math.pow(ref.C / (exposure * own.C), TONE_STRENGTH));
    return { exposure, saturation };
}
// (saturation is calmed in OKLab, whose hues hold as chroma falls — in plain RGB a vivid blue greyed drifts to violet)
function toOklab([r, g, b]) {
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
function fromOklab([L, A, B]) {
    const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3, m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3, s = (L - 0.0894841775 * A - 1.2914855480 * B) ** 3;
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
}
function tone(rgb, o, { exposure, saturation }) {
    const [L, A, B] = toOklab([toLinear(rgb[o]), toLinear(rgb[o + 1]), toLinear(rgb[o + 2])].map(v => v * exposure));
    const c = fromOklab([L, saturation * A, saturation * B]);
    for (let ch = 0; ch < 3; ch++) rgb[o + ch] = Math.min(255, Math.max(0, toByte(c[ch])));
}
function stopsAt(stops, km, out, o) {
    if (km <= stops[0][0]) { out[o] = stops[0][1][0]; out[o + 1] = stops[0][1][1]; out[o + 2] = stops[0][1][2]; return; }
    for (let i = 1; i < stops.length; i++) {
        if (km > stops[i][0] && i < stops.length - 1) continue;
        const [a, ca] = stops[i - 1], [b, cb] = stops[i], t = Math.min(1, Math.max(0, (km - a) / (b - a)));
        for (let ch = 0; ch < 3; ch++) out[o + ch] = ca[ch] + (cb[ch] - ca[ch]) * t;
        return;
    }
}
function lutOf(id) {
    if (!luts.has(id)) {
        const P = PALETTES[id], L = new Float32Array(3 * LUT_N);
        const sea = toneFor(P.sea, TONE_SEA), land = toneFor(P.land, TONE_LAND);
        for (let i = 0; i < LUT_N; i++) {
            const km = (LUT_MIN_M + i * LUT_STEP_M) / 1000;
            stopsAt(i < ZERO ? P.sea : P.land, km, L, 3 * i);
            tone(L, 3 * i, i < ZERO ? sea : land);
        }
        luts.set(id, L);
    }
    return luts.get(id);
}
/** How each palette is toned (for tuning): {id: {sea: {exposure, saturation}, land: {…}}}. */
export const paletteTones = () => Object.fromEntries(Object.entries(PALETTES).map(([id, P]) => [id, { sea: toneFor(P.sea, TONE_SEA), land: toneFor(P.land, TONE_LAND) }]));

/**
 * A palette as a height table for SmoothMapRaster.paintHeights (colours every 10 m, −12 … +10 km): 'relief' (the lab's,
 * terrain-shade.js's tintOf), one of PALETTES, or 'heightmap' (V1's: the sea black, the land grey from 0 to 6 km, unshaded).
 */
const heightLuts = new Map();
export function heightLutOf(id) {
    if (!heightLuts.has(id)) {
        let rgb;
        if (id === 'relief' || id === 'heightmap') {
            rgb = new Float32Array(3 * LUT_N);
            const c = [0, 0, 0];
            for (let i = 0; i < LUT_N; i++) {
                const km = (LUT_MIN_M + i * LUT_STEP_M) / 1000;
                if (id === 'relief') tintOf(km, c); else { const g = km <= 0 ? 0 : Math.round(255 * Math.min(1, km / 6)); c[0] = c[1] = c[2] = g; }
                rgb[3 * i] = c[0]; rgb[3 * i + 1] = c[1]; rgb[3 * i + 2] = c[2];
            }
        } else rgb = lutOf(id);
        heightLuts.set(id, { rgb, minM: LUT_MIN_M, stepM: LUT_STEP_M, n: LUT_N, zero: ZERO, shaded: id !== 'heightmap' });
    }
    return heightLuts.get(id);
}

/** A palette's colours by height, shaded by the relief as the lab's relief is (terrain-shade.js's paintRelief). */
export function paintPalette(id, heightKm, shade, out, seaLevelKm = 0) {
    const L = lutOf(id);
    for (let c = 0; c < heightKm.length; c++) {
        const m = (heightKm[c] - seaLevelKm) * 1000;
        // (the coast exact: a cell just under sea level is sea, one just over it land)
        const j = Math.round((m - LUT_MIN_M) / LUT_STEP_M), i = 3 * (m < 0 ? Math.max(0, Math.min(ZERO - 1, j)) : Math.min(LUT_N - 1, Math.max(ZERO, j)));
        const k = 0.35 + 0.65 * (shade ? shade[c] : 1);
        out[3 * c] = Math.min(255, L[i] * k); out[3 * c + 1] = Math.min(255, L[i + 1] * k); out[3 * c + 2] = Math.min(255, L[i + 2] * k);
    }
}

/** V1's Heightmap view: the sea black, the land grey from 0 to 6 km (unshaded). */
export function paintLandHeightmap(heightKm, out, seaLevelKm = 0) {
    for (let c = 0; c < heightKm.length; c++) {
        const h = heightKm[c] - seaLevelKm, g = h <= 0 ? 0 : Math.round(255 * Math.min(1, h / 6));
        out[3 * c] = out[3 * c + 1] = out[3 * c + 2] = g;
    }
}

// ── the hover readout ──
export const CRUST_WORDS = {
    [CrustType.OCEAN]: 'Oceanic crust',
    [CrustType.CONTINENT]: 'Continental crust',
    [CrustType.CRATON]: 'Craton',
    [CrustType.ARC]: 'Island-arc crust',
};
const BELT_WORDS = {
    [OrogenyType.ANDEAN]: 'Andean range',
    [OrogenyType.LARAMIDE]: 'Flat-slab range',
    [OrogenyType.URAL]: 'Collision belt',
    [OrogenyType.HIMALAYAN]: 'Great collision belt',
    [OrogenyType.ARC]: 'Volcanic arc',
    [OrogenyType.RIFT]: 'Rift shoulder',
    [OrogenyType.TRANSPRESSION]: 'Transform ridge',
    [OrogenyType.INTRAPLATE]: 'Intraplate range',
};
const ACTIVE_MYR = 15;           // a belt last built on within this long is active (a snapshot is 10 Myr)

/** What a sim cell of a frame stands on, in a few words: its mountain belt (active or how long ago), or its mark. */
export function settingOf(frame, w) {
    const belt = frame.oroType?.[w];
    if (belt && BELT_WORDS[belt]) {
        const ago = frame.time - frame.oroLast[w];
        return `${BELT_WORDS[belt]} · ${ago <= ACTIVE_MYR ? 'active' : `last active ${Math.round(ago).toLocaleString()} Myr ago`}`;
    }
    const flags = frame.flags?.[w] ?? 0;
    if (frame.volcType?.[w] === VolcanicType.LIP || flags & CrustFlag.LIP) return 'Flood basalt';
    if (frame.volcType?.[w] === VolcanicType.TRACK) return 'Hotspot track';
    if (flags & CrustFlag.FAILED_RIFT) return 'Failed rift';
    if (flags & CrustFlag.SUTURE) return 'Old suture';
    if (flags & CrustFlag.TRENCH) return 'Trench edge';
    return null;
}
