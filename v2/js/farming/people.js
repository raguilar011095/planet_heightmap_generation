// People (plans/V2_FARMING_PLAN.md C3; Madeline James's culture series, Part 4): how many people the land could feed —
// its potential, pre-industrial: ~60 people a km² for each good harvest a year's worth of food (Roman Egypt's strip
// ~150–200, medieval France's farmland ~60), a few on herders' pasture. From a finished moment's farming picture
// (farming/farming.js farmPlace, per pixel), with the techniques chosen. What the land could support — not who would
// live there.

import { farmPlace, decHarvests, Staple, CROPS } from './farming.js';
import { FARMING } from './farming-config.js';
import { KOPPEN_ID } from '../climate/koppen.js';

export const PEOPLE = {
    peoplePerFood: 60,          // people a km² a good harvest a year feeds (food 1: a good grain harvest on good flat ground —
                                // Roman Egypt's strip, two harvests' worth, ~120; medieval France's farmland ~45)
    peoplePerPasture: 2,        // …and herders' pasture (full: a steppe's)
    sampleW: 1440,              // the farming picture read about this many pixels wide (0.25°) for the whole land's count
};

/** Potential people a km² at a place from farmPlace's out (pre-industrial). */
export function peopleAt(r, C = PEOPLE, K = FARMING) {
    if (r.staple === Staple.HERDING) return C.peoplePerPasture * r.score;
    const v = r.staple ? r.tech * K.farmHalf / Math.max(1e-6, 1 - r.tech) : 0;
    return C.peoplePerFood * v;
}

/**
 * The people the whole land of a finished moment's farming picture `F` (raster.farming) could feed, and its land
 * (`L`: raster.climate — its Köppen classes mark the land), with the techniques `tech`.
 * @returns {{people: number (pre-industrial), land: number (km²)}}
 */
export function landPeople(F, L, tech, C = PEOPLE, K = FARMING) {
    const kef = KOPPEN_ID.EF, p = {}, e = new Float64Array(2 * CROPS.length), r = {}, n = 2 * CROPS.length, foodOf = f => f * K.farmHalf / Math.max(1e-6, 1 - f);
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
            p.soil = F.soil[i] / 255; p.flood = F.flood[i] / 255; p.canal = F.canal[i] / 255; p.slope = 2 * F.slope[i]; p.wetland = F.wetland[i] / 255;
            if (F.crops) for (let k = 0; k < n; k++) e[k] = decHarvests(F.crops[n * i + k]); else e.fill(0);
            farmPlace(p, e, F.pasture[i] / 255, tech, r, K);
            const v = r.staple && r.staple !== Staple.HERDING ? foodOf(r.tech) : 0;
            people += a * pxKm2 * Math.max(C.peoplePerFood * v, r.staple === Staple.HERDING ? C.peoplePerPasture * r.score : 0);
        }
    }
    return { people, land };
}
