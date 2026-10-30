// People (plans/V2_FARMING_PLAN.md C3; Madeline James's culture series, Part 4): how many people the land could feed —
// its potential, pre-industrial: ~60 people a km² for each good harvest a year's worth of food (Roman Egypt's strip
// ~150–200, medieval France's farmland ~60), a few on herders' pasture — on the share of the land cropped at once: poor
// ground is rested in long fallows (a rainforest's shifting cultivation crops a field two or three years in ten to
// twenty). From a finished moment's farming picture (farming/farming.js farmPlace, per pixel), with the techniques
// chosen. What the land could support — not who would live there.

import { farmPlace, harvestsAt, hasHarvests, Staple, CROPS } from './farming.js';
import { FARMING } from './farming-config.js';
import { KOPPEN_ID } from '../climate/koppen.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const S = (r, x) => smooth(r[0], r[1], x);

export const PEOPLE = {
    peoplePerFood: 60,          // people a km² a good harvest a year feeds (food 1: a good grain harvest on good flat ground —
                                // Roman Egypt's strip, two harvests' worth, ~120; medieval France's farmland ~45)
    peoplePerPasture: 2,        // …and herders' pasture (full: a steppe's)
    // the land cropped at once (Ruthenberg's cultivation intensity R: the years cropped ÷ the years cropped and fallow): a
    // field farmed every year on ground this fertile and more (farming.js's soil: on flat ground, after leaching)…
    fallowSoil: [0.3, 0.65],
    fallowMin: 0.15,            // …on poorer, rested down to this share of the land at once: forest fallow, R ~10–25 % (the
                                // Amazon's, the Congo's, Borneo's shifting cultivation; Allan's critical densities)…
    fallowWarm: [9.5, 11.5],    // …longest where it is warm the year round (its months warm enough to grow: no winter slows
                                // the soil's exhaustion — leaching, decay, weeds)…
    fallowCool: 0.5,            // …a winter's land this much of it (manure and rotation: an outfield, a heath rested). A big
                                // river's flood renews the ground with its silt (flood farming): cropped every year — a
                                // canal's clear water does not
    sampleW: 1440,              // the farming picture read about this many pixels wide (0.25°) for the whole land's count
};

/** The share of a place's land cropped at once (0…1), from its parts `p` (soil, warm, flood: farmPlace's) with the
 *  techniques `tech` (flood farming's silt renewing it). */
export function croppedShare(p, tech, C = PEOPLE) {
    const need = (1 - S(C.fallowSoil, p.soil)) * (C.fallowCool + (1 - C.fallowCool) * S(C.fallowWarm, p.warm));
    const R = 1 - (1 - C.fallowMin) * need;
    return R + (1 - R) * (tech.flood ? p.flood : 0);
}

/** Potential people a km² at a place from farmPlace's out `r` and its parts `p` (pre-industrial), with the techniques
 *  `tech`: its staple's food on the share of the land cropped at once, or its herders. */
export function peopleAt(r, p, tech, C = PEOPLE, K = FARMING) {
    if (r.staple === Staple.HERDING) return C.peoplePerPasture * r.score;
    const v = r.staple ? r.tech * K.farmHalf / Math.max(1e-6, 1 - r.tech) : 0;
    return C.peoplePerFood * v * croppedShare(p, tech, C);
}

/**
 * The people the whole land of a finished moment's farming picture `F` (raster.farming) could feed, and its land
 * (`L`: raster.climate — its Köppen classes mark the land), with the techniques `tech`.
 * @returns {{people: number (pre-industrial), land: number (km²)}}
 */
export function landPeople(F, L, tech, C = PEOPLE, K = FARMING) {
    const kef = KOPPEN_ID.EF, p = {}, e = new Float64Array(2 * CROPS.length), r = {}, kept = hasHarvests(F);
    // (the picture read about C.sampleW pixels wide: each sample stands for its stride × stride pixels)
    const stride = Math.max(1, Math.ceil(F.w / C.sampleW)), R = 6371, pxKm2 = (2 * Math.PI * R / F.w) * (Math.PI * R / F.h);
    let people = 0, land = 0;
    for (let y = 0; y < F.h; y += stride) {
        const lat = 90 - (y + 0.5) / F.h * 180, a = Math.cos(lat * Math.PI / 180) * stride * stride;
        for (let x = 0; x < F.w; x += stride) {
            const i = y * F.w + x;
            if (!L.koppen[i]) continue;
            land += a * pxKm2;
            if (L.koppen[i] === kef) continue;
            p.soil = F.soil[i] / 255; p.warm = F.warm[i] / 20; p.flood = F.flood[i] / 255; p.canal = F.canal[i] / 255; p.slope = 2 * F.slope[i]; p.wetland = F.wetland[i] / 255;
            if (kept) harvestsAt(F.crops, i, e); else e.fill(0);
            farmPlace(p, e, F.pasture[i] / 255, tech, r, K);
            people += a * pxKm2 * peopleAt(r, p, tech, C, K);
        }
    }
    return { people, land };
}
