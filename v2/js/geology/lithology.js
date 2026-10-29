// What each rock does to the land (plans/V2_LITHOLOGY_RELIEF_PLAN.md): its properties (geology-config.js `lithology`, by
// rocks.js Rock), with the ones the climate turns — limestone hard where it is dry (a cliff-former) and soft where it is
// wet (it dissolves). Read by the finish (the carve and hillslopes, finish.js) and the fine detail (fine-detail.js).

import { GEOLOGY } from './geology-config.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** How much of a soluble rock's ground dissolves at a place: 0 (dry or frozen) … 1 (wet), by its rain (mm a year) and
 *  temperature (°C). */
export function wetSolution(tC, pMm, G = GEOLOGY) {
    const L = G.lithology;
    return smooth(L.solubleRainMm[0], L.solubleRainMm[1], pMm) * smooth(L.solubleTempC[0], L.solubleTempC[1], tC);
}

/** A rock's hardness (0…1) at a place: its own, a soluble rock's turned toward solubleHard where it is wet. */
export function rockHard(rock, tC, pMm, G = GEOLOGY) {
    const L = G.lithology, h = L.hard[rock], s = L.soluble[rock];
    return s ? h + (L.solubleHard - h) * s * wetSolution(tC, pMm, G) : h;
}
