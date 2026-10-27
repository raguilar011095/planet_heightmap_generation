// Cross-sections of mountain belts, after WBP Part VIIa's range geometries. Each is a function of the distance d
// (km) from the belt's front — the trench-side coast for an Andean belt, the suture for a collision — and of the
// belt's reach W (km): where the crests, valleys and basins lie across the belt. Heights are relative (crest ≈ 1,
// basins < 0); records.js scales them by the belt's relief. Ridges within the belt (stripes.js) are placed by
// `stripeZone`: where across the belt the parallel fold-and-thrust ridges are.

import { OrogenyType, BeltSide } from '../tectonics/model/crust.js';

// (g: how far the belt has worn, 2σ² km² — the bump smoothed by a Gaussian of std σ: exactly lower and wider, its bulk
// the same, as hillslope wear spreads a ridge; 0: as built)
const bump = (x, c, s, g = 0) => {
    if (!g) { const t = (x - c) / s; return Math.exp(-t * t); }
    const w = Math.sqrt(s * s + g), t = (x - c) / w;
    return (s / w) * Math.exp(-t * t);
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
/** 1 across u ∈ [a, b], easing in and out over ±edge: a plateau. */
const plateau = (u, a, b, edge) => smooth(a - edge, a + edge, u) * (1 - smooth(b - edge, b + edge, u));

/**
 * Relative height across a belt at distance d from its front. `jitter` (a share of the width, from noise) moves the
 * belt's far edge in and out, so it does not end along a clean line. `g` (km², 2σ²): the ranges worn — each smoothed as
 * by a Gaussian of std σ (lower and wider, the same bulk); 0 as built.
 */
export function beltProfile(type, side, d, reach, jitter = 0, g = 0) {
    const W = Math.max(40, reach), u = d / W;
    const fade = 1 - smooth(0.7 + jitter, 1.05 + jitter, u);   // every belt dies away toward its far edge
    switch (type) {
        case OrogenyType.ANDEAN: {
            // coastal range · fore-arc valley · the main (volcanic) range · in a wide, mature belt a high plateau
            // behind it (the Altiplano) and an eastern cordillera over the fold-and-thrust belt · then the fall line
            const s = Math.max(18, 0.04 * W), mature = smooth(180, 450, W);
            return fade * (0.35 * bump(d, clamp(0.07 * W, 20, 60), s, g) - 0.22 * bump(d, clamp(0.17 * W, 45, 130), s, g)
                + bump(d, clamp(0.3 * W, 70, 260), Math.max(45, 0.09 * W), g) + 0.55 * mature * plateau(u, 0.33, 0.72, 0.1)
                + 0.6 * smooth(200, 350, W) * bump(d, 0.76 * W, Math.max(30, 0.06 * W), g));
        }
        case OrogenyType.LARAMIDE:
            // the old arc's batholith near the coast; a high interior (the Colorado Plateau, the Wyoming basins) with
            // blocky basement ranges across it (stripes); a front range bracketing it inland
            return fade * (0.6 * bump(d, clamp(0.1 * W, 40, 150), Math.max(30, 0.05 * W), g) + 0.55 * plateau(u, 0.15, 0.86, 0.1)
                + 0.9 * bump(d, 0.88 * W, Math.max(35, 0.05 * W), g));
        case OrogenyType.URAL:
            // one main ridge along the suture; a foreland basin on the lower plate
            return side === BeltSide.LOWER
                ? fade * (0.8 * bump(d, 0, Math.max(35, 0.2 * W), g) - 0.3 * bump(d, 0.85 * W, 0.15 * W, g))
                : fade * bump(d, 0, Math.max(40, 0.25 * W), g);
        case OrogenyType.HIMALAYAN:
            // upper plate: a range along the suture, the plateau (isostasy) with low internal ridges, a back range
            // bracketing it, a fall line; lower plate: the highest range just off the suture, fold hills, then the
            // foreland basin
            // (the plateau needs a mature collision: a belt that has reached far inland)
            return side === BeltSide.LOWER
                ? fade * (1.4 * bump(d, clamp(0.22 * W, 40, 130), Math.max(35, 0.08 * W), g) - 0.35 * bump(d, 0.86 * W, 0.12 * W, g))
                : fade * (1.0 * bump(d, clamp(0.05 * W, 20, 80), Math.max(40, 0.05 * W), g) + 0.8 * smooth(300, 800, W) * plateau(u, 0.1, 0.84, 0.1)
                    + bump(d, 0.88 * W, Math.max(40, 0.05 * W), g));
        case OrogenyType.ARC:
            return fade * bump(d, 0, Math.max(55, 0.3 * W), g);                 // a broad ridge the volcanoes stand on
        case OrogenyType.TRANSPRESSION:
            return fade * bump(d, 0, Math.max(15, 0.35 * W), g);
        case OrogenyType.RIFT: {
            // a rifted margin's great escarpment: a steep face toward the rift, a long gentle slope inland (worn: the whole
            // of it spread out about the crest by k⁻¹ and lowered by k — the escarpment's bulk the same)
            const c = clamp(0.12 * W, 25, 90), k = riftWear(c, g), e = g ? c + (d - c) * k : d;
            return fade * k * (e < c ? bump(e, c, 0.6 * c) : Math.exp(-(e - c) / (0.45 * W)));
        }
        case OrogenyType.INTRAPLATE:
            // an old weak line squeezed up far inland (the Tian Shan, the Ancestral Rockies): a basement-cored range along
            // it, its flanks thrust out over basins either side (the Tarim and Junggar, the Denver basin)
            return fade * (0.9 * bump(d, 0, Math.max(40, 0.28 * W), g) - 0.25 * bump(d, 0.8 * W, Math.max(30, 0.15 * W), g));
        default: return 0;
    }
}

/**
 * The BROAD part of a belt's cross-section (same units as beltProfile): the plateaus and a low, wide envelope of the
 * ranges, smooth enough to be carried by sim cells 121 km apart — most of the ranges themselves (fronts, main ranges,
 * back ranges) are crests (developer, 8b round 3: with most of a range in this smooth part, belts read as mounds; then
 * "too high, let's land in the middle": the envelope halfway back — the crests wear more slowly than it, so the bigger
 * their share, the higher an old belt stands). It is what the evolving uplift is built toward
 * (tectonics/step/heights.js); beltProfile − broadProfile (crestProfile) is the crest structure the terrain adds.
 */
export function broadProfile(type, side, d, reach, jitter = 0, g = 0) {
    const W = Math.max(40, reach), u = d / W;
    const fade = 1 - smooth(0.7 + jitter, 1.05 + jitter, u);
    switch (type) {
        case OrogenyType.ANDEAN: {
            const mature = smooth(180, 450, W);
            return fade * (0.575 * bump(d, clamp(0.3 * W, 70, 260), Math.max(110, 0.2 * W), g) + 0.55 * mature * plateau(u, 0.33, 0.72, 0.1)
                + 0.3 * smooth(200, 350, W) * bump(d, 0.76 * W, Math.max(100, 0.12 * W), g));
        }
        case OrogenyType.LARAMIDE:
            return fade * (0.3 * bump(d, clamp(0.1 * W, 40, 150), Math.max(100, 0.1 * W), g) + 0.55 * plateau(u, 0.15, 0.86, 0.1) + 0.45 * bump(d, 0.88 * W, Math.max(100, 0.08 * W), g));
        case OrogenyType.URAL:
            return side === BeltSide.LOWER
                ? fade * (0.5 * bump(d, 0, Math.max(100, 0.3 * W), g) - 0.25 * bump(d, 0.85 * W, Math.max(80, 0.15 * W), g))
                : fade * 0.6 * bump(d, 0, Math.max(110, 0.35 * W), g);
        case OrogenyType.HIMALAYAN:
            return side === BeltSide.LOWER
                ? fade * (0.675 * bump(d, clamp(0.22 * W, 40, 130), Math.max(110, 0.15 * W), g) - 0.3 * bump(d, 0.86 * W, Math.max(90, 0.12 * W), g))
                : fade * (0.525 * bump(d, clamp(0.05 * W, 20, 80), Math.max(110, 0.08 * W), g) + 0.8 * smooth(300, 800, W) * plateau(u, 0.1, 0.84, 0.1)
                    + 0.525 * bump(d, 0.88 * W, Math.max(110, 0.08 * W), g));
        case OrogenyType.ARC:
            return fade * 0.675 * bump(d, 0, Math.max(90, 0.35 * W), g);
        case OrogenyType.TRANSPRESSION:
            return fade * 0.525 * bump(d, 0, Math.max(70, 0.45 * W), g);
        case OrogenyType.RIFT: {
            // (worn as beltProfile's: the same spread about the crest, so their difference — the crest — spreads with them)
            const c = clamp(0.12 * W, 25, 90), k = riftWear(c, g), e = g ? c + (d - c) * k : d;
            return fade * 0.9 * k * (e < c ? bump(e, c, Math.max(70, c)) : Math.exp(-(e - c) / (0.45 * W)));
        }
        case OrogenyType.INTRAPLATE:
            return fade * (0.5 * bump(d, 0, Math.max(100, 0.3 * W), g) - 0.2 * bump(d, 0.8 * W, Math.max(80, 0.15 * W), g));
        default: return 0;
    }
}

/** The crest structure of a belt: its full cross-section less the broad part the evolving uplift carries (g: worn, as beltProfile). */
export function crestProfile(type, side, d, reach, jitter = 0, g = 0) {
    return beltProfile(type, side, d, reach, jitter, g) - broadProfile(type, side, d, reach, jitter, g);
}

/** A rift escarpment worn by g (2σ²): its face (0.6 c wide) as a worn bump is k = s / √(s² + g) of its height. */
const riftWear = (c, g) => { if (!g) return 1; const s = 0.6 * c; return s / Math.sqrt(s * s + g); };

/**
 * How far from a belt's front (km) the far side of its main range lies — the range by the plate edge (beltProfile's bump
 * nearest the front, its centre plus its width): its ridges stay the most whole (synthesize.js, cfg.ridgeBreak).
 */
export function mainRangeBackKm(type, side, reach) {
    const W = Math.max(40, reach);
    switch (type) {
        case OrogenyType.ANDEAN: return clamp(0.3 * W, 70, 260) + Math.max(45, 0.09 * W);
        case OrogenyType.LARAMIDE: return clamp(0.1 * W, 40, 150) + Math.max(30, 0.05 * W);
        case OrogenyType.URAL: return side === BeltSide.LOWER ? Math.max(35, 0.2 * W) : Math.max(40, 0.25 * W);
        case OrogenyType.HIMALAYAN: return side === BeltSide.LOWER ? clamp(0.22 * W, 40, 130) + Math.max(35, 0.08 * W) : clamp(0.05 * W, 20, 80) + Math.max(40, 0.05 * W);
        case OrogenyType.ARC: return Math.max(55, 0.3 * W);
        case OrogenyType.TRANSPRESSION: return Math.max(15, 0.35 * W);
        case OrogenyType.RIFT: return 1.6 * clamp(0.12 * W, 25, 90);
        case OrogenyType.INTRAPLATE: return Math.max(40, 0.28 * W);
        default: return 0;
    }
}

/** 1 across a belt, fading to 0 over the last part of its width (its far edge wanders by `jitter`). */
export function beltEdge(d, reach, jitter = 0) {
    return 1 - smooth(0.7 + jitter, 1 + jitter, d / Math.max(40, reach));
}

/** How strongly the belt's parallel ridges show at distance d from its front (0…1). */
export function stripeZone(type, side, d, reach, jitter = 0) {
    const W = Math.max(40, reach), u = d / W, edge = 1 - smooth(0.7 + jitter, 1 + jitter, u);
    switch (type) {
        case OrogenyType.ANDEAN: return edge * (0.35 + 0.65 * smooth(0.45, 0.65, u));                 // the sub-Andean fold-and-thrust belt
        case OrogenyType.LARAMIDE: return edge * smooth(0.12, 0.3, u);                                // the basement uplifts
        case OrogenyType.URAL: return edge * 0.8;
        case OrogenyType.HIMALAYAN: return side === BeltSide.LOWER ? edge * (0.4 + 0.6 * smooth(0.25, 0.4, u) * (1 - smooth(0.65, 0.8, u))) : edge * 0.5;
        case OrogenyType.ARC: return 0.1 * edge;
        case OrogenyType.TRANSPRESSION: return edge;
        case OrogenyType.RIFT: return 0.25 * edge;                                                    // fault blocks
        case OrogenyType.INTRAPLATE: return 0.7 * edge;                                               // basement blocks and folds
        default: return 0;
    }
}
