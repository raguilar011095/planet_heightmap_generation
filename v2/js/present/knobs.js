// G6 — Generate's sculpting knobs on the present-day world (plans/GENERATE_REDESIGN_PLAN.md §3.6): each slider scales the
// Evolution terrain tunables that do what its name says, around Evolution's own defaults — at Generate's default slider
// positions the terrain is drawn exactly as Evolution draws its own (every factor 1). Reapply re-runs only the synthesis
// and the carving with them: the Frame is kept.

import { TERRAIN } from '../terrain/terrain-config.js';
import { PRESENT } from './present-config.js';
import { FINISH } from '../finish/finish-config.js';

// Generate's defaults (js/planet-code.js SLIDERS): where every factor is 1
const DEFAULTS = { nMag: 0.4, terrainWarp: 0.75, smoothing: 0.1, hydraulicErosion: 0.5, thermalErosion: 0.1, ridgeSharpening: 0.5, glacialErosion: 0.5 };

/**
 * terrain-config overrides for the sliders' values.
 * @param {{nMag?, terrainWarp?, smoothing?, hydraulicErosion?, thermalErosion?, ridgeSharpening?, glacialErosion?}} s
 */
export function knobOverrides(s = {}) {
    const k = (key) => (s[key] ?? DEFAULTS[key]) / DEFAULTS[key];
    const T = TERRAIN, o = {};
    // Roughness: hills, the coast's bays and its fine detail
    const rough = k('nMag');
    o.hillsKm = T.hillsKm * rough;
    o.coastNoiseKm = T.coastNoiseKm * Math.sqrt(rough);
    o.coastDetailKm = T.coastDetailKm * Math.sqrt(rough);
    // Terrain Warp: how far the sim's records are read off-place — the organic wander of coasts and belts
    const warp = k('terrainWarp');
    o.warpKm = T.warpKm * warp;
    o.cellWarp = T.cellWarp * Math.min(1.6, warp);
    // Ridge Sharpening: the parallel ridges, the ridge noise and the crests' ruggedness
    const ridge = k('ridgeSharpening');
    o.stripeShare = T.stripeShare * ridge;
    o.ridgeNoiseShare = T.ridgeNoiseShare * ridge;
    o.crestRugged = Math.min(1, T.crestRugged * Math.sqrt(ridge));
    // Smoothing: wear — crests spread wider and lower (the same bulk)
    const smooth = (s.smoothing ?? DEFAULTS.smoothing);
    o.crestBaseKm = T.crestBaseKm * (1 + 3 * Math.max(0, smooth - DEFAULTS.smoothing));
    // Hydraulic Erosion: how long the rivers have worked on the surface
    o.carveTimeMyr = T.carveTimeMyr * k('hydraulicErosion');
    // Thermal Erosion: the valley sides' critical slope (more: gentler, talus-softened slopes)
    o.carveHillSlope = T.carveHillSlope / Math.max(0.25, Math.sqrt(k('thermalErosion')));
    // Glacial Erosion: how far fjords reach up their valleys (the ice age itself comes with Add detail)
    o.drownKm = T.drownKm * k('glacialErosion');
    return o;
}

/**
 * The finish's config overrides for the sliders (finish-config.js FINISH: Evolution's finish, which carves Generate's
 * ground again by the climate's runoff — plans/SHARED_CORE_PLAN.md U1): Hydraulic Erosion is how long its rivers work too.
 */
export function finishOverrides(s = {}) {
    return { carveTimeMyr: FINISH.carveTimeMyr * (s.hydraulicErosion ?? DEFAULTS.hydraulicErosion) / DEFAULTS.hydraulicErosion };
}
/** The finish's config for the sliders. */
export const finishConfigOf = (s = {}) => ({ ...FINISH, ...finishOverrides(s) });

/** The fine relief's strength (present/relief.js, G6d) for the Roughness slider: PRESENT.reliefShare at its default. */
export function reliefShareOf(s = {}) {
    return PRESENT.reliefShare * (s.nMag ?? DEFAULTS.nMag) / DEFAULTS.nMag;
}
