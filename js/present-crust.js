// The present-day world's crust, in words (plans/GENERATE_REDESIGN_PLAN.md G6): what built the ground here, and when —
// the hover's Crust line on Generate (js/edit-mode.js, js/generate-next.js).

const BELT_NAME = ['', 'Andean margin', 'Laramide belt (flat slab)', 'old mountain belt', 'collision belt', 'island arc', 'rift',
    'transpression ridge', 'intraplate range'];

/** The crust under a region, in words: `pr` the worker's present-day message (its record `rec` and each region's sim cell). */
export function presentCrustLine(pr, region) {
    const rec = pr.rec, c = pr.regionCell?.[region];
    if (!rec || c === undefined) return null;
    const myr = (v) => `${Math.round(v)} Myr`;
    if (rec.type[c] === 0) {
        const age = -rec.formedAt[c];
        if (rec.volcType[c] === 1 && rec.volcKm[c] >= 1) return `ocean floor ${myr(age)} old · a hotspot volcano, last erupted ${myr(-rec.volcAt[c])} ago`;
        return `ocean floor, ${myr(age)} old`;
    }
    const t = rec.oroType[c];
    if (t) {
        const name = BELT_NAME[t] ?? 'mountain belt';
        if (rec.oroLast[c] >= 0) return `${name}, active ~${myr(-rec.oroStart[c])}`;
        return `${name}, last active ${myr(-rec.oroLast[c])} ago`;
    }
    if (rec.volcType[c] === 2) return `flood basalt, erupted ${myr(-rec.volcAt[c])} ago`;
    if (rec.type[c] === 2) return 'ancient shield (craton)';
    if (rec.type[c] === 3) return 'island-arc crust';
    return 'stable platform';
}
