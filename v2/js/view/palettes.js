// Cell colouring for lab layers. Every painter reads a Frame (tectonics/snapshot.js) and
// fills a 3-byte-per-cell RGB array. Base layers first, then optional overlays on top.

import { volcanoTopKm, SEAMOUNT_KM, Margin } from '../tectonics/measure.js';
import { CrustType, CrustFlag, OrogenyType, VolcanicType } from '../tectonics/model/crust.js';
import { BoundaryKind } from '../tectonics/model/world.js';

export const GAP_RGB = [8, 8, 12];            // no plate has crust here
export const OVERLAP_RGB = [255, 0, 200];     // plates overlap — drawn as a tint
const OVERLAP_MIX = [0, 0.22, 0.7];           // none · land over ocean · land over land (collision)

export const BOUNDARY_RGB = {
    [BoundaryKind.RIDGE]: [240, 60, 50],
    [BoundaryKind.TRANSFORM]: [70, 205, 95],
    [BoundaryKind.SUBDUCTING]: [120, 190, 255],
    [BoundaryKind.OVERRIDING]: [30, 90, 255],
    [BoundaryKind.COLLISION]: [255, 0, 200],
};
export const ACTIVE_FLAG_RGB = [96, 60, 210];     // flagged crust just behind the live trench edge
export const DORMANT_TRENCH_RGB = [18, 36, 120];

function hslToRgb(h, s, l) {
    const f = n => {
        const k = (n + h * 12) % 12;
        return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    };
    return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

function put(out, w, rgb) { out[3 * w] = rgb[0]; out[3 * w + 1] = rgb[1]; out[3 * w + 2] = rgb[2]; }

export const BACKGROUND_OCEAN_RGB = [22, 32, 50];

/** CSS colour string for an [r, g, b] triple — lets legends be generated from the same constants the painters use. */
export function css(rgb) { return `rgb(${Math.round(rgb[0])},${Math.round(rgb[1])},${Math.round(rgb[2])})`; }

/** Distinct hue per plate id (golden-ratio spacing). */
export function plateHue(id) { return (0.08 + id * 0.61803398875) % 1; }

/** The colour used for a plate in tables, charts and markers. */
export function plateCss(id) { return `hsl(${plateHue(id) * 360},60%,60%)`; }

/** Base layer: hue = plate, lightness = crust type (dark ocean, light continent, mid craton). */
export function colorByPlate(frame, out) {
    const lut = new Map();
    for (let w = 0; w < frame.owner.length; w++) {
        const id = frame.owner[w];
        if (id < 0) { put(out, w, GAP_RGB); continue; }
        const type = frame.type[w], key = id * 8 + type;
        let rgb = lut.get(key);
        if (!rgb && frame.plates?.[id]?.isBackground) { rgb = BACKGROUND_OCEAN_RGB; lut.set(key, rgb); }   // not a real plate: keep it neutral
        if (!rgb) {
            const h = plateHue(frame.plates?.[id]?.hue ?? id);
            rgb = type === CrustType.OCEAN ? hslToRgb(h, 0.40, 0.24)
                : type === CrustType.CRATON ? hslToRgb(h, 0.35, 0.42)
                : hslToRgb(h, 0.50, 0.62);
            lut.set(key, rgb);
        }
        put(out, w, rgb);
    }
}

export const TYPE_RGB = {
    [CrustType.OCEAN]: [28, 60, 110],
    [CrustType.CONTINENT]: [196, 178, 128],
    [CrustType.CRATON]: [128, 120, 110],
    [CrustType.ARC]: [170, 110, 90],
};

export const APRON_RGB = [52, 98, 156];       // old ocean captured into a continent's plate
export const NEW_OCEAN_RGB = [40, 120, 150];  // ocean crust formed during the history

/** Base layer: what kind of crust is at each cell, regardless of plate. */
export function colorByCrustType(frame, out) {
    for (let w = 0; w < frame.owner.length; w++) {
        if (frame.owner[w] < 0) put(out, w, GAP_RGB);
        else if (frame.type[w] !== CrustType.OCEAN) put(out, w, TYPE_RGB[frame.type[w]]);
        else if (frame.flags[w] & CrustFlag.APRON) put(out, w, APRON_RGB);
        else put(out, w, frame.formedAt[w] >= 0 ? NEW_OCEAN_RGB : TYPE_RGB[CrustType.OCEAN]);
    }
}

/** Hue for a terrane (tectonic unit) id. */
export function terraneHue(id) { return (0.03 + id * 0.381966) % 1; }
export function terraneCss(id) { return `hsl(${terraneHue(id) * 360}, 50%, 55%)`; }

const SEA_RGB = [22, 34, 58], APRON_DIM_RGB = [36, 56, 88];

/** Base layer: terranes — each craton (dark) with the accreted crust that belongs to it (light). */
export function colorByTerrane(frame, out) {
    const lut = new Map();
    for (let w = 0; w < frame.owner.length; w++) {
        if (frame.owner[w] < 0) { put(out, w, GAP_RGB); continue; }
        const t = frame.terrane[w];
        if (frame.type[w] === CrustType.OCEAN || !t) { put(out, w, frame.flags[w] & CrustFlag.APRON ? APRON_DIM_RGB : SEA_RGB); continue; }
        const key = t * 2 + (frame.type[w] === CrustType.CRATON ? 1 : 0);
        let rgb = lut.get(key);
        if (!rgb) { rgb = hslToRgb(terraneHue(t), 0.5, key & 1 ? 0.36 : 0.62); lut.set(key, rgb); }
        put(out, w, rgb);
    }
}

export const SUTURE_RGB = [232, 138, 52];

// Orogeny in WBP's style: one hue per type, black when active, fading toward the land colour with age.
export const OROGENY_RGB = {
    [OrogenyType.ANDEAN]: [214, 96, 40], [OrogenyType.LARAMIDE]: [214, 160, 40], [OrogenyType.URAL]: [110, 140, 60],
    [OrogenyType.HIMALAYAN]: [150, 40, 120], [OrogenyType.ARC]: [60, 130, 150], [OrogenyType.RIFT]: [60, 170, 170], [OrogenyType.TRANSPRESSION]: [120, 110, 225], [OrogenyType.INTRAPLATE]: [205, 125, 95],
};
/** What each orogeny type is called in the lab (every OrogenyType has one; legends and readouts use it). */
export const OROGENY_NAME = {
    [OrogenyType.ANDEAN]: 'Andean', [OrogenyType.LARAMIDE]: 'Laramide', [OrogenyType.URAL]: 'Ural', [OrogenyType.HIMALAYAN]: 'Himalayan',
    [OrogenyType.ARC]: 'island-arc', [OrogenyType.RIFT]: 'rift-shoulder', [OrogenyType.TRANSPRESSION]: 'transpression', [OrogenyType.INTRAPLATE]: 'intraplate (far-field)',
};
export const OROGENY_FADE_MYR = 300;     // a belt this old is fully faded (its record survives; terrain synthesis decides what is left)
const OROGENY_LAND_RGB = [196, 190, 176];

/** Base layer: mountain-building record — type by hue, recency by darkness (active = near black). */
export function colorByOrogeny(frame, out) {
    for (let w = 0; w < frame.owner.length; w++) {
        if (frame.owner[w] < 0) { put(out, w, GAP_RGB); continue; }
        if (frame.type[w] === CrustType.OCEAN) { put(out, w, frame.flags[w] & CrustFlag.APRON ? APRON_DIM_RGB : SEA_RGB); continue; }
        const type = frame.oroType[w];
        if (!type) { put(out, w, frame.type[w] === CrustType.CRATON ? [150, 146, 138] : OROGENY_LAND_RGB); continue; }
        const age = Math.min(1, Math.max(0, (frame.time - frame.oroLast[w]) / OROGENY_FADE_MYR)), hue = OROGENY_RGB[type] ?? [200, 200, 200];
        const active = frame.time - frame.oroLast[w] < 4;                    // being built right now
        const dark = active ? 0.15 : 0.45 + 0.55 * age;                       // toward black when fresh, toward the hue then land when old
        put(out, w, [0, 1, 2].map(i => hue[i] * dark * (1 - age * 0.5) + OROGENY_LAND_RGB[i] * age * 0.5));
    }
}

/** Base layer: crustal thickening (km above normal), a heat ramp on land. */
export function colorByThickness(frame, out, maxKm = 30) {
    for (let w = 0; w < frame.owner.length; w++) {
        if (frame.owner[w] < 0) { put(out, w, GAP_RGB); continue; }
        if (frame.type[w] === CrustType.OCEAN) { put(out, w, frame.flags[w] & CrustFlag.APRON ? APRON_DIM_RGB : SEA_RGB); continue; }
        const t = Math.min(1, frame.thickKm[w] / maxKm);
        put(out, w, t <= 0 ? OROGENY_LAND_RGB : [OROGENY_LAND_RGB[0] + (255 - OROGENY_LAND_RGB[0]) * Math.min(1, t * 2), OROGENY_LAND_RGB[1] * (1 - t) + 60 * t, OROGENY_LAND_RGB[2] * (1 - t) ** 2]);
    }
}

/** Overlay: where land was redrawn between two frames — lost (dark red) and gained (bright green). */
export function overlayRedraw(before, frame, out) {
    for (let w = 0; w < frame.owner.length; w++) {
        const was = before.owner[w] >= 0 && before.type[w] !== CrustType.OCEAN, is = frame.owner[w] >= 0 && frame.type[w] !== CrustType.OCEAN;
        if (was && !is) put(out, w, [160, 20, 30]);
        else if (is && !was) put(out, w, [90, 240, 120]);
    }
}

/** Base layer: strength — rigid cratons, ordinary accreted crust, and the weak suture belts between terranes. */
export function colorByWeakness(frame, out) {
    for (let w = 0; w < frame.owner.length; w++) {
        if (frame.owner[w] < 0) put(out, w, GAP_RGB);
        else if (frame.type[w] === CrustType.OCEAN) put(out, w, frame.flags[w] & CrustFlag.APRON ? APRON_DIM_RGB : SEA_RGB);
        else if (frame.type[w] === CrustType.CRATON) put(out, w, [92, 88, 84]);
        else if (frame.flags[w] & CrustFlag.FAILED_RIFT) put(out, w, FAILED_RIFT_RGB);
        else if (frame.flags[w] & CrustFlag.RIFT_MARGIN) put(out, w, RIFT_MARGIN_RGB);
        else put(out, w, frame.flags[w] & CrustFlag.SUTURE ? SUTURE_RGB : [176, 170, 154]);
    }
}
export const FAILED_RIFT_RGB = [255, 120, 60];      // an aulacogen: a rift arm that stopped
export const RIFT_MARGIN_RGB = [120, 200, 255];     // a coast made by rifting

// Ocean-floor age ramp in the style of published seafloor age maps: red = new → violet = old.
export const AGE_STOPS = [[0, [225, 45, 40]], [25, [245, 150, 40]], [50, [245, 225, 70]], [85, [90, 190, 95]], [125, [55, 120, 215]], [180, [110, 70, 170]]];
export const PREHISTORY_RGB = [44, 54, 72];
const LAND_RGB = [150, 142, 124], CRATON_RGB = [112, 106, 98];

export function ageColor(ageMyr) {
    if (ageMyr <= AGE_STOPS[0][0]) return AGE_STOPS[0][1];
    for (let i = 1; i < AGE_STOPS.length; i++) {
        const [a1, c1] = AGE_STOPS[i];
        if (ageMyr <= a1) {
            const [a0, c0] = AGE_STOPS[i - 1], t = (ageMyr - a0) / (a1 - a0);
            return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t];
        }
    }
    return AGE_STOPS[AGE_STOPS.length - 1][1];
}

/** Base layer: age of ocean crust; pre-history ocean slate, land grey. */
export function colorByCrustAge(frame, out) {
    for (let w = 0; w < frame.owner.length; w++) {
        if (frame.owner[w] < 0) put(out, w, GAP_RGB);
        else if (frame.type[w] === CrustType.CRATON) put(out, w, CRATON_RGB);
        else if (frame.type[w] !== CrustType.OCEAN) put(out, w, LAND_RGB);
        else if (frame.formedAt[w] < 0) put(out, w, PREHISTORY_RGB);
        else put(out, w, ageColor(frame.time - frame.formedAt[w]));
    }
}

// Volcanism (Phase 7a): a plume track by the age of its last eruption — white-hot over the plume, through orange
// and red to a dark maroon — and a plume head's flood basalt (LIP) in violet, brighter where it is thicker.
export const TRACK_STOPS = [[0, [255, 245, 190]], [8, [255, 190, 70]], [30, [240, 110, 40]], [70, [190, 45, 45]], [130, [110, 25, 55]]];
export const LIP_RGB = [170, 90, 230];
export function trackColor(ageMyr) {
    if (ageMyr <= 0) return TRACK_STOPS[0][1];
    for (let i = 1; i < TRACK_STOPS.length; i++) {
        const [a1, c1] = TRACK_STOPS[i];
        if (ageMyr <= a1) { const [a0, c0] = TRACK_STOPS[i - 1], t = (ageMyr - a0) / (a1 - a0); return [0, 1, 2].map(k => c0[k] + (c1[k] - c0[k]) * t); }
    }
    return TRACK_STOPS[TRACK_STOPS.length - 1][1];
}

export const ISLAND_RGB = [250, 240, 200];

/**
 * Base layer: volcanism. A plume track is drawn as what it is — separate volcanoes on a faint swell, not a line of
 * land: the swell (where the plume passed between bursts) as a faint age-tinted sea; a volcano by the age of its
 * last eruption (white-hot → orange → red → dark); one whose summit still breaks the sea surface as a pale island.
 * LIPs violet, brighter where thicker. Land and sea muted underneath.
 */
export function colorByVolcanism(frame, out) {
    for (let w = 0; w < frame.owner.length; w++) {
        if (frame.owner[w] < 0) { put(out, w, GAP_RGB); continue; }
        const vt = frame.volcType[w], ocean = frame.type[w] === CrustType.OCEAN;
        const base = ocean ? SEA_RGB : frame.type[w] === CrustType.CRATON ? [96, 92, 86] : [124, 118, 106];
        if (vt === VolcanicType.LIP) { const k = 0.55 + 0.45 * Math.min(1, frame.volcKm[w] / 2.5); put(out, w, LIP_RGB.map(v => v * k)); continue; }
        if (vt !== 1) { put(out, w, base); continue; }
        const age = trackColor(frame.time - frame.volcAt[w]);
        if (frame.volcKm[w] < SEAMOUNT_KM) { put(out, w, base.map((v, i) => v + (age[i] - v) * 0.22)); continue; }      // the swell
        const top = volcanoTopKm(frame, w);
        put(out, w, ocean && top > 0 ? ISLAND_RGB.map((v, i) => v * 0.75 + age[i] * 0.25) : age);                          // an island, or a volcano/seamount
    }
}

/** Base layer: the mantle's memory of the continents that sat on it — cool blue to hot orange; land outlined lighter. */
export function colorByMantleHeat(frame, out) {
    for (let w = 0; w < frame.owner.length; w++) {
        const t = frame.mantleHeat[w] / 255, land = frame.owner[w] >= 0 && frame.type[w] !== CrustType.OCEAN;
        const rgb = [30 + 225 * t, 40 + 110 * t * (1 - t) * 4 * 0.6, 90 * (1 - t) + 20];
        put(out, w, land ? rgb.map(v => v * 0.7 + 60) : rgb);
    }
}

/**
 * The far field (step/far-field.js): how much push distant fronts have sent through each place — dark blue for none,
 * through violet and orange to pale yellow at ~1000 km of shortening-equivalent (a log scale) — and, with `recent`, how
 * much of it lately (what folds the lithosphere now). Cratons a shade darker; weak lines (sutures, failed rifts, rift
 * margins) with an orange cast — where the push is taken up.
 */
export function colorByFarField(frame, out, recent = false) {
    const field = recent ? frame.farFold : frame.farWork, weak = CrustFlag.SUTURE | CrustFlag.FAILED_RIFT | CrustFlag.RIFT_MARGIN;
    for (let w = 0; w < frame.owner.length; w++) {
        if (frame.owner[w] < 0 || frame.type[w] === CrustType.OCEAN) { put(out, w, [24, 34, 60]); continue; }
        const v = Math.min(1, Math.log10(1 + (field?.[w] ?? 0)) / 3);
        let rgb = [45 + 210 * v, 40 + 200 * v * v, 110 + 40 * v - 90 * v * v];
        if (frame.type[w] === CrustType.CRATON) rgb = rgb.map(x => x * 0.7);
        if (frame.flags[w] & weak) rgb = [rgb[0] * 0.6 + 100, rgb[1] * 0.6 + 40, rgb[2] * 0.5];
        put(out, w, rgb);
    }
}

// Margins (Phase 7b): each coast by what its plate does out to sea — brighter where it leads, darker where it trails.
export const MARGIN_RGB = { [Margin.ACTIVE]: [235, 95, 55], [Margin.PASSIVE]: [80, 195, 125], [Margin.TRANSFORM]: [235, 205, 75], [Margin.COLLISION]: [205, 75, 205] };

export const EROSIVE_RGB = [175, 60, 200];     // an active coast whose trench eats it (Phase 7c)

/** Base layer: coasts by margin type (active / passive / transform / collision), shaded by leading / trailing. */
export function colorByMargin(frame, out) {
    for (let w = 0; w < frame.owner.length; w++) {
        if (frame.owner[w] < 0) { put(out, w, GAP_RGB); continue; }
        const m = frame.margin[w];
        if (!m) { put(out, w, frame.type[w] === CrustType.OCEAN ? SEA_RGB : frame.type[w] === CrustType.CRATON ? [96, 92, 86] : [132, 126, 112]); continue; }
        const k = m & Margin.LEADING ? 1.15 : m & Margin.TRAILING ? 0.6 : 0.85, rgb = m & Margin.EROSIVE ? EROSIVE_RGB : MARGIN_RGB[m & Margin.TYPE] ?? [200, 200, 200];
        put(out, w, rgb.map(v => Math.min(255, v * k)));
    }
}

/** Overlay: magenta tint where plates overlap (faint = land over ocean, strong = collision). */
export function overlayOverlaps(frame, out) {
    for (let w = 0; w < frame.owner.length; w++) {
        const k = OVERLAP_MIX[frame.overlap[w]];
        if (!k) continue;
        for (let i = 0; i < 3; i++) out[3 * w + i] += (OVERLAP_RGB[i] - out[3 * w + i]) * k;
    }
}

/** Overlay: active boundary cells by kind, plus the persistent trench flags behind them (live or dormant). */
export function overlayBoundaries(frame, out) {
    for (let w = 0; w < frame.owner.length; w++) {
        const kind = frame.boundary[w];
        if (kind !== BoundaryKind.NONE) put(out, w, BOUNDARY_RGB[kind]);
        else if (frame.trench[w] === 1) put(out, w, ACTIVE_FLAG_RGB);
        else if (frame.trench[w] === 2) put(out, w, DORMANT_TRENCH_RGB);
    }
}
