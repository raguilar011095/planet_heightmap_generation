// F4 — wind. In the deserts (Köppen BW; a little in the steppes, BS), sand gathers in the low, flat ground: sand seas,
// their hollows filled, with dune ridges (draa) across the prevailing wind — or along it where the wind swings between
// the seasons (linear dunes) — where the mesh can show them; deflation pans hollowed in the desert plains; and loess,
// the dust of the deserts and of the ice age's outwash, laid over the land downwind.

import { FastNoise } from '../core/fast-noise.js';
import { KOPPEN_ID } from '../climate/koppen.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const R = 6371, D2R = Math.PI / 180, TAU = 2 * Math.PI;
const DESERT = new Map([[KOPPEN_ID.BWh, 1], [KOPPEN_ID.BWk, 0.8], [KOPPEN_ID.BSh, 0.1], [KOPPEN_ID.BSk, 0.05]]);

/** An asymmetric ridge of a phase (0…1): a long gentle slope to the crest, then the steep lee face; 0 … 1. */
function dune(t) {
    t -= Math.floor(t);
    const r = 0.72, v = t < r ? t / r : (1 - t) / (1 - r);
    return v * v * (3 - 2 * v);
}

/**
 * @param {Object} ctx  { mesh, z (km, changed in place), lat, lon (degrees), koppen, grid (LatLonGrid), wind:
 *                        { year: [u, v], jan: [u, v], jul: [u, v] } (1° climate-grid fields, m/s, east and north),
 *                        climGrid (the climate's grid: {w, h, step}), outwash (Uint8Array: the ice age's margins), seed,
 *                        fade (lam → 0…1: what the mesh can show), tAnnual (each cell's year, °C: where loess is kept) }
 */
export function windWork(ctx, F) {
    const { mesh, z, lat, lon, koppen, grid, fade } = ctx, n = mesh.numCells, { adjOffset, adjList, edgeKm, xyz } = mesh;
    const noise = new FastNoise((ctx.seed | 0) * 131 + 17);
    const windAt = (field, la, lo) => sampleClimGrid(ctx.climGrid, field, la, lo);
    // ── deserts, flat ground, and ground lower than its surroundings (where sand gathers) ──
    const desert = new Float32Array(n), slope = new Float32Array(n);
    for (let c = 0; c < n; c++) {
        if (!(z[c] > 0)) continue;
        desert[c] = DESERT.get(koppen[c]) ?? 0;
        if (!desert[c]) continue;
        let m = 0;
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) m = Math.max(m, Math.abs(z[adjList[k]] - z[c]));
        slope[c] = m / edgeKm;
    }
    const around = grid.blur(grid.average(lat, lon, z, c => z[c] > 0), 80);
    const ergRaw = new Float32Array(n);
    for (let c = 0; c < n; c++) {
        if (!desert[c]) continue;
        const low = grid.at(around, lat[c], lon[c]) - z[c];
        ergRaw[c] = desert[c] * smooth(1.5 * F.ergSlope, 0.5 * F.ergSlope, slope[c]) * smooth(0.2 * F.ergBelowKm, 1.5 * F.ergBelowKm, low);
    }
    // (a sand sea is one sea, not a speckle: its extent smoothed over ~40 km)
    const ergG = grid.blur(grid.average(lat, lon, ergRaw, c => z[c] > 0), 40), fillG = grid.blur(grid.average(lat, lon, z, c => z[c] > 0), 30);
    // (where the sand seas and the loess are: for the satellite view's ground, and the debug layers)
    const erg = new Float32Array(n), loessOut = new Float32Array(n);
    // ── sand seas: hollows filled, dune ridges across (or along) the wind ──
    const lam = F.duneKm, show = fade(lam), warpF = R / (3 * lam);
    let ergKm2 = 0;
    const cellKm2 = 4 * Math.PI * R * R / n;
    for (let c = 0; c < n; c++) {
        if (!desert[c]) continue;
        // (a sand sea's inside is sand throughout; its edge fades out over the blur)
        const e = smooth(0.08, 0.4, grid.at(ergG, lat[c], lon[c])) * (desert[c] > 0.5 ? 1 : desert[c]);
        if (!(e > 0.02)) continue;
        ergKm2 += e * cellKm2;
        if (erg) erg[c] = e;
        const zs = grid.at(fillG, lat[c], lon[c]);
        if (zs > z[c]) z[c] += e * F.ergFill * (zs - z[c]);
        if (!(show > 0)) continue;
        // the wind: its mean direction, and how much it swings between the seasons (linear dunes where it does)
        let ue = windAt(ctx.wind.year[0], lat[c], lon[c]), vn = windAt(ctx.wind.year[1], lat[c], lon[c]);
        const l = Math.hypot(ue, vn) || 1; ue /= l; vn /= l;
        const uj = windAt(ctx.wind.jan[0], lat[c], lon[c]), vj = windAt(ctx.wind.jan[1], lat[c], lon[c]), uy = windAt(ctx.wind.jul[0], lat[c], lon[c]), vy = windAt(ctx.wind.jul[1], lat[c], lon[c]);
        const cosSwing = (uj * uy + vj * vy) / ((Math.hypot(uj, vj) * Math.hypot(uy, vy)) || 1), linear = smooth(0.5, -0.5, cosSwing);
        // local plane coordinates (km): east, north
        const xe = R * lon[c] * D2R * Math.cos(lat[c] * D2R), yn = R * lat[c] * D2R;
        const w = 0.35 * lam * noise.fbm(xyz[3 * c] * warpF, xyz[3 * c + 1] * warpF, xyz[3 * c + 2] * warpF, 2, 0.5);
        const along = xe * ue + yn * vn + w, across = -xe * vn + yn * ue + w;
        const transverse = dune(along / lam);
        const seif = dune(across / (0.6 * lam)) * (0.6 + 0.4 * smooth(-0.3, 0.3, noise.noise3D(xyz[3 * c] * warpF * 2 + 5.1, xyz[3 * c + 1] * warpF * 2, xyz[3 * c + 2] * warpF * 2)));
        z[c] += show * e * F.duneAmpKm * ((1 - linear) * transverse + linear * seif);
    }
    // ── deflation pans in the desert plains outside the sand seas ──
    const pf = R / F.panScaleKm, panShow = fade(F.panScaleKm);
    if (panShow > 0) for (let c = 0; c < n; c++) {
        if (!(desert[c] > 0.5) || slope[c] > 3 * F.ergSlope) continue;
        const v = noise.noise3D(xyz[3 * c] * pf + 11.7, xyz[3 * c + 1] * pf + 3.1, xyz[3 * c + 2] * pf + 7.9) - 0.35;
        if (v > 0) z[c] = Math.max(Math.min(z[c], 0.003), z[c] - panShow * F.panKm * Math.min(1, v / 0.5));
    }
    // ── loess: dust from the deserts and the outwash, carried downwind (on the grid), laid on gentle land beyond — the
    // silt mostly the outwash's and the cold deserts' (a hot desert's dust is mostly sand), kept where it is not tropical ──
    const bare = new Float32Array(desert.length), hotShare = F.loessHotShare ?? 1;
    for (let c = 0; c < desert.length; c++) bare[c] = Math.max(desert[c] > 0.5 ? (koppen[c] === KOPPEN_ID.BWh ? hotShare : 1) : 0, ctx.outwash?.[c] ? 1 : 0);
    const src = grid.average(lat, lon, bare, c => z[c] > 0);
    const loess = new Float32Array(grid.size), steps = 12, stepKm = F.loessReachKm / 6;
    for (let j = 0; j < grid.h; j++) {
        const la = 90 - (j + 0.5) * grid.step;
        for (let i = 0; i < grid.w; i++) {
            const lo = -180 + (i + 0.5) * grid.step;
            let ue = windAt(ctx.wind.year[0], la, lo), vn = windAt(ctx.wind.year[1], la, lo);
            const l = Math.hypot(ue, vn); if (!(l > 0.3)) continue;
            ue /= l; vn /= l;
            let s = 0;
            for (let k = 1; k <= steps; k++) {
                const d = k * stepKm, pla = la - vn * d / 111.2, plo = lo - ue * d / (111.2 * Math.max(0.1, Math.cos(la * D2R)));
                const v = grid.at(src, Math.max(-89.9, Math.min(89.9, pla)), ((plo + 540) % 360) - 180);
                if (v === v) s += v * Math.exp(-d / F.loessReachKm) * stepKm / F.loessReachKm;
            }
            loess[j * grid.w + i] = s;
        }
    }
    const loessG = grid.blur(loess, 60);
    let loessKm2 = 0;
    for (let c = 0; c < n; c++) {
        if (!(z[c] > 0) || desert[c] > 0.5) continue;
        const L = grid.at(loessG, lat[c], lon[c]);
        if (!(L > 0.02)) continue;
        let m = 0;
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) m = Math.max(m, Math.abs(z[adjList[k]] - z[c]));
        const kept = ctx.tAnnual && F.loessWarmC ? smooth(F.loessWarmC[0], F.loessWarmC[1], ctx.tAnnual[c]) : 1;
        const t = F.loessKm * Math.min(1, L / 0.35) * smooth(0.06, 0.01, m / edgeKm) * kept;
        if (t > 0) { z[c] += t; loessKm2 += cellKm2 * t / F.loessKm; if (loessOut) loessOut[c] = t; }
    }
    return { ergKm2, loessKm2, erg, loess: loessOut };
}

/** A field on the climate's 1° grid (rows north → south, columns from −179.5° east) at a latitude, longitude. */
function sampleClimGrid(g, field, lat, lon) {
    const { w, h } = g, step = 180 / h;
    const x = (lon + 180) / step - 0.5, y = Math.max(0, Math.min(h - 1, (90 - lat) / step - 0.5));
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const i0 = ((x0 % w) + w) % w, i1 = i0 + 1 === w ? 0 : i0 + 1, j1 = y0 + 1 < h ? y0 + 1 : y0;
    return (1 - fx) * (1 - fy) * field[y0 * w + i0] + fx * (1 - fy) * field[y0 * w + i1] + (1 - fx) * fy * field[j1 * w + i0] + fx * fy * field[j1 * w + i1];
}
export { sampleClimGrid };
