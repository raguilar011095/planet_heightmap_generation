// The farming calendar (plans/V2_FOOD_PLAN.md F1): when a farming place's main harvest comes in — its leading crop's
// month (farming.months, worked out by the finish from the place's twelve months: farming.js cropYields), watered where water
// brought makes most of it, read over its neighbourhood (~150 km) as a mean on the year's wheel so a region harvests
// together; "all year" where crops are taken as each field ripens. The readout says it. (Its lean months and harvest risk
// were tried as a view and set aside, developer 2026-10-31: they come back as Food security once a place's whole mix of
// crops is known — roots in the ground, pulses stored, a second season's crop, fish and herds all fill a hungry gap.)
// Computed on the page; its smoothing on a grid fixed in degrees, the same at every detail.

import { STAPLE_CROP, CROPS, MONTH_ALL_YEAR, decMonth, hasMonths } from './farming.js';
import { LatLonGrid } from '../finish/finish-grid.js';

export const CALENDAR = {
    smoothKm: 150,              // the harvest month read over about this far: a region's farmers harvest together
    allYear: 0.5,               // "all year" where more than this share of the neighbourhood harvests the year round
    gridDeg: 0.25,
    sampleW: 1440,              // the picture read about this many pixels wide for the neighbourhood
};
/**
 * A place's own harvest month (before the neighbourhood's reading): the leading crop's — its farming's staple — by rain or,
 * where water brought makes most of the harvest, watered (0…11, MONTH_ALL_YEAR, -1 none). `F` the farming picture, `i` its
 * pixel, `r` farmPlace's out there.
 */
export function placeMonth(F, i, r) {
    const g = STAPLE_CROP[r.staple];
    if (g < 0 || !hasMonths(F)) return -1;
    const b = F.months[CROPS[g]], watered = r.water >= 0.3 && r.harvests > r.harvestsRain + 0.15;
    const m = decMonth(b[2 * i + (watered ? 1 : 0)]);
    return m >= 0 ? m : decMonth(b[2 * i + (watered ? 0 : 1)]);
}

/**
 * The neighbourhood's harvest month, once per moment and options: each farming place's own month read onto a grid fixed in
 * degrees (its direction on the year's wheel, and whether it harvests all year), blurred over CALENDAR.smoothKm. `monthAt(x,
 * y)` → the picture pixel's own month or -1 (farming there; the caller's farmPlace/livingPlace); W × H the picture.
 * @returns {{grid, cos, sin, all}} — read back by calendarMonth
 */
export function calendarGround(W, H, monthAt, C = CALENDAR) {
    const grid = new LatLonGrid(C.gridDeg), N = grid.size, sx = new Float64Array(N), sy = new Float64Array(N), sa = new Float64Array(N), n = new Float64Array(N);
    const stride = Math.max(1, Math.ceil(W / C.sampleW));
    for (let y = 0; y < H; y += stride) {
        const lat = 90 - (y + 0.5) / H * 180;
        for (let x = 0; x < W; x += stride) {
            const m = monthAt(x, y);
            if (m < 0) continue;
            const g = grid.index(lat, (x + 0.5) / W * 360 - 180);
            n[g]++;
            if (m === MONTH_ALL_YEAR) { sa[g]++; continue; }
            const a = (m + 0.5) / 12 * 2 * Math.PI;
            sx[g] += Math.cos(a); sy[g] += Math.sin(a);
        }
    }
    const cos = new Float32Array(N), sin = new Float32Array(N), all = new Float32Array(N);
    for (let g = 0; g < N; g++) { if (!n[g]) { cos[g] = sin[g] = all[g] = NaN; continue; } cos[g] = sx[g] / n[g]; sin[g] = sy[g] / n[g]; all[g] = sa[g] / n[g]; }
    const [bc, bs, ba] = grid.blurMany([cos, sin, all], C.smoothKm);
    return { grid, cos: bc, sin: bs, all: ba };
}
/** The neighbourhood's harvest month at a place (0…11, MONTH_ALL_YEAR; its own `own` where the grid has none). */
export function calendarMonth(ground, lat, lon, own, C = CALENDAR) {
    if (!ground) return own;
    const a = ground.grid.at(ground.all, lat, lon);
    if (!(a === a)) return own;
    if (a > C.allYear) return MONTH_ALL_YEAR;
    const c = ground.grid.at(ground.cos, lat, lon), s = ground.grid.at(ground.sin, lat, lon);
    if (!(c * c + s * s > 1e-6)) return own;
    return ((Math.floor(Math.atan2(s, c) / (2 * Math.PI) * 12) % 12) + 12) % 12;
}
