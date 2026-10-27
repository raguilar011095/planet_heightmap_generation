// F3 — the last ice age, Earth-like. The moment's climate cooled (more toward the poles) and dried, the sea ~120 m lower;
// ice where snow outlasts the summer (Ohmura's summer temperature at the equilibrium line, from the precipitation),
// flowing out past its snowline — a glacier's tongue, an ice sheet's lobes; its thickness a plastic ice sheet's
// (√ of the distance to its margin), its surface over the bed smoothed. Where ice gathered and flowed it cut troughs
// — U-shaped valleys along its paths, below the sea where it reached the sea (fjords) — scoured hollows into the bed
// under the sheets (lake districts on the shields), left moraines at its farthest reach and outwash beyond; then it
// melted, and the land it pressed down is still sunk, rebounding (Hudson Bay, the Baltic).

import { spreadKm } from '../core/min-heap.js';
import { FastNoise } from '../core/fast-noise.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const R = 6371, LAPSE = 6.5;

/** The summer temperature (°C) at the equilibrium line for a year's precipitation P (mm) — Ohmura et al. 1992. */
const elaTemp = P => (-296 + Math.sqrt(Math.max(0, 296 * 296 - 36 * (645 - P)))) / 18;

/**
 * @param {Object} ctx  { mesh, z (km, changed in place), lat, lon (degrees), warmSl (warmest month at sea level, °C),
 *                        rain (mm/year; NaN at sea), grid (LatLonGrid), cellKm2, seed }
 * @returns {{ice: Uint8Array, margin: Uint8Array, iceKm2: number, sheets: number, H: Float32Array|null, S: Float32Array|null}}
 *          (H, S: the ice's thickness and its surface, km — for the detail's lake districts and the ice's flow: finish-drivers.js)
 */
export function lastIceAge(ctx, F) {
    const { mesh, z, lat, warmSl, grid, cellKm2 } = ctx, n = mesh.numCells, { adjOffset, adjList, edgeKm, xyz } = mesh;
    // rain where the climate gave none (the sea, bare at the ice age on the shelves): the land's, blurred
    const rainG = grid.blur(grid.average(lat, ctx.lon, ctx.rain, c => ctx.rain[c] === ctx.rain[c]), 150);
    // ── the ice age's summer and snow, and where snow outlasts summer ──
    const tS = new Float32Array(n), snow = new Float32Array(n), acc = new Uint8Array(n);
    for (let c = 0; c < n; c++) {
        const a = Math.abs(lat[c]) / 90, cold = F.iceColdEqC + (F.iceColdPoleC - F.iceColdEqC) * a ** 1.5;
        const P = (ctx.rain[c] === ctx.rain[c] ? ctx.rain[c] : grid.at(rainG, lat[c], ctx.lon[c])) * (1 - F.iceDrier * a);
        tS[c] = warmSl[c] - cold - LAPSE * Math.max(0, z[c]);
        snow[c] = P;
        if (z[c] > -F.iceSeaDropKm && P > 80 && tS[c] < elaTemp(P)) acc[c] = 1;
    }
    // ── snowfields, and how far past its snowline each one's ice flows (by its size) ──
    const comp = new Int32Array(n).fill(-1), sizes = [];
    for (let s = 0; s < n; s++) {
        if (!acc[s] || comp[s] >= 0) continue;
        const id = sizes.length, q = [s]; comp[s] = id;
        for (let i = 0; i < q.length; i++) for (let k = adjOffset[q[i]]; k < adjOffset[q[i] + 1]; k++) { const nb = adjList[k]; if (acc[nb] && comp[nb] < 0) { comp[nb] = id; q.push(nb); } }
        sizes.push(q.length * cellKm2);
    }
    const reach = Float32Array.from(sizes, a => F.iceMarginC[0] + (F.iceMarginC[1] - F.iceMarginC[0]) * smooth(Math.log(F.iceSheetKm2[0]), Math.log(F.iceSheetKm2[1]), Math.log(a)));
    // ice spreads from its snowfields while the summer is not too warm for it (grounded on the shelf, not the deep sea)
    const ice = new Uint8Array(n), allow = new Float32Array(n).fill(-Infinity), q = [];
    for (let c = 0; c < n; c++) if (acc[c]) { ice[c] = 1; allow[c] = reach[comp[c]]; q.push(c); }
    for (let i = 0; i < q.length; i++) {
        const c = q[i];
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
            const nb = adjList[k];
            if (ice[nb] || z[nb] < -F.iceGroundedKm || tS[nb] > elaTemp(snow[nb]) + allow[c]) continue;
            ice[nb] = 1; allow[nb] = allow[c]; q.push(nb);
        }
    }
    let iceCells = 0;
    for (let c = 0; c < n; c++) iceCells += ice[c];
    if (!iceCells) return { ice, margin: new Uint8Array(n), iceKm2: 0, sheets: 0, H: null, S: null };
    // ── thickness from the distance to the margin; the surface over the bed smoothed ──
    const toEdge = new Float32Array(n).fill(Infinity);
    for (let c = 0; c < n; c++) if (ice[c]) for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) if (!ice[adjList[k]]) { toEdge[c] = 0.5 * edgeKm; break; }
    spreadKm(mesh, toEdge, { canEnter: (a, b) => ice[b] === 1 });
    const bedG = grid.blur(grid.average(lat, ctx.lon, z, c => ice[c] === 1), 60), H = new Float32Array(n), S = new Float32Array(n);
    for (let c = 0; c < n; c++) {
        if (!ice[c]) continue;
        H[c] = Math.min(F.iceMaxKm, Math.sqrt(F.iceNyeKm * toEdge[c]));
        const bed = grid.at(bedG, lat[c], ctx.lon[c]);
        S[c] = Math.max(z[c] + 0.05, (bed === bed ? Math.max(bed, -F.iceSeaDropKm) : z[c]) + H[c]);
    }
    // ── the ice's flow, steered by the bed (the land's valleys) with a little of its surface's pull; its flux, the
    // snowfield area upstream ──
    const route = new Float32Array(n), iceList = [];
    for (let c = 0; c < n; c++) if (ice[c]) { route[c] = z[c] + F.iceSteer * (S[c] - z[c]); iceList.push(c); }
    iceList.sort((a, b) => route[b] - route[a]);
    const down = new Int32Array(n).fill(-1), flux = new Float32Array(n);
    for (const c of iceList) {
        flux[c] += acc[c] ? cellKm2 : 0.15 * cellKm2;
        let best = -1, low = route[c];
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const nb = adjList[k]; if (ice[nb] && route[nb] < low) { low = route[nb]; best = nb; } }
        down[c] = best;
        if (best >= 0) flux[best] += flux[c];
    }
    // ── troughs: along the ice's paths, deeper and wider with its flux, U-shaped across (a coarse cell holding more
    // than a trough drops by the share of it the trough takes) ──
    const cut = new Float32Array(n), [f1, f2] = F.troughFluxKm2, lf1 = Math.log(f1), lf2 = Math.log(f2);
    for (const c of iceList) {
        if (flux[c] < f1) continue;
        // (sliding fast near the margin, frozen to the bed deep inside a sheet)
        const s = smooth(lf1, lf2, Math.log(flux[c])), wet = smooth(0.1, 0.6, S[c] - z[c]) * smooth(F.iceCutsWithinKm[0], F.iceCutsWithinKm[1], toEdge[c]);
        if (!(wet > 0)) continue;
        const depth = F.troughKm * (0.25 + 0.75 * s) * wet, half = F.troughWidthKm[0] + (F.troughWidthKm[1] - F.troughWidthKm[0]) * s;
        const own = depth * Math.min(1, 2 * half / edgeKm);
        if (own > cut[c]) cut[c] = own;
        if (half > 0.5 * edgeKm) {                                   // (a trough wider than a cell reaches its neighbours)
            const x = xyz[3 * c], y = xyz[3 * c + 1], w = xyz[3 * c + 2];
            for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
                const nb = adjList[k], r = R * Math.hypot(xyz[3 * nb] - x, xyz[3 * nb + 1] - y, xyz[3 * nb + 2] - w), u = r / half;
                if (u >= 1) continue;
                const d = depth * (1 - u ** 4);                        // (flat floor, steep walls)
                if (d > cut[nb]) cut[nb] = d;
            }
        }
    }
    // ── scour under the sheets: hollows in the bed where the ice was thick (where the mesh can show them) ──
    const noise = new FastNoise((ctx.seed | 0) * 97 + 31), sf = R / F.scourScaleKm, show = smooth(2, 3.2, F.scourScaleKm / edgeKm);
    // ── then the ice melts: troughs and hollows cut, moraines and outwash at its farthest reach, the land still sunk ──
    const load = new Float32Array(n);
    for (let c = 0; c < n; c++) {
        if (!ice[c]) continue;
        let d = cut[c];
        if (show > 0) {
            const v = noise.fbm(xyz[3 * c] * sf, xyz[3 * c + 1] * sf, xyz[3 * c + 2] * sf, 2, 0.5) * 1.6 - 0.15;
            if (v > 0) d += F.scourKm * show * smooth(0.4, 1.4, H[c]) * Math.min(1, v / 0.6);
        }
        z[c] -= d;
        load[c] = 0.3 * H[c];                                         // (ρ_ice / ρ_mantle × thickness)
    }
    // moraines on the first land past the ice, outwash plains a little beyond
    const margin = new Uint8Array(n), past = new Float32Array(n).fill(Infinity);
    for (let c = 0; c < n; c++) {
        if (ice[c] || !(z[c] > 0)) continue;
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) if (ice[adjList[k]]) { margin[c] = 1; past[c] = 0; break; }
    }
    spreadKm(mesh, past, { canEnter: (a, b) => !ice[b] && z[b] > 0, maxKm: 60 });
    for (let c = 0; c < n; c++) {
        if (!(past[c] < 60)) continue;
        const ridge = F.moraineKm * Math.exp(-((past[c] / Math.max(6, edgeKm)) ** 2)), plain = 0.4 * F.moraineKm * (1 - past[c] / 60);
        z[c] += Math.max(ridge, plain);
    }
    // the rebound still to come: the ice's weight, spread by the lithosphere
    const loadG = grid.blur(grid.average(lat, ctx.lon, load), F.reboundKm);
    for (let c = 0; c < n; c++) { const L = grid.at(loadG, lat[c], ctx.lon[c]); if (L > 0) z[c] -= F.reboundLeft * L; }
    let sheets = 0;
    for (const a of sizes) if (a >= F.iceSheetKm2[1] * 0.3) sheets++;
    return { ice, margin, iceKm2: iceCells * cellKm2, sheets, H, S };
}
