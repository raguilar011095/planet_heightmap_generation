// A farmed Earth, as a finished moment's pictures (plans/V2_FOOD_PLAN.md, Earth tuning step 1): Earth's heights
// (assets/earth.png: linear, sea black, sea-level land ~23 grey, ~35 greys a km — memory: import heights) and its observed
// climate (Beck et al. 2023, 1991–2020, 1° land: tuning/climate/data/ref1deg — node tuning/climate/fetch-references.mjs,
// then regrid-references.mjs) on a 0.25° grid, put through the finish's own farming parts (finish-cover.js landCover,
// farming.js addFarmClimate and farmCells, cell-stats.js) — so the history (farming/history.js historyGround, hearths.js,
// minor.js) runs on Earth exactly as on a generated world.
//   · the climate: bilinear between the 1° land cells (the nearest within 3° on a coast the 1° grid has as sea), each month's
//     temperature moved by the lapse rate for the cell's height against its 1° cell's mean land height;
//   · the rivers: every cell drained to the sea (a priority flood: closed basins spill — the finish's own rule), each
//     cell's runoff by Fu's form of Budyko's curve (ω 2.6) on its aridity, summed downstream into m³/s;
//   · no lakes, no rocks (the soil's parent middling everywhere but where the rivers renew it), no sea for gatherers.
// Usage: import { earthWorld } — or `node tuning/farming/earth-world.mjs` to print the rivers and parts at a few places.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { PNG } from 'pngjs';
import { classifyCell } from '../../v2/js/climate/koppen.js';
import { cellStatsCollector, monthlyStats } from '../../v2/js/climate/cell-stats.js';
import { landCover, newCover } from '../../v2/js/finish/finish-cover.js';
import { newFarmClimate, addFarmClimate, farmCells } from '../../v2/js/farming/farming.js';
import { Heap } from '../../v2/js/farming/history.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KM_LAT = 111.32;

/** The reference data: this checkout's, or (in a git worktree, which has none of the downloaded data) the main checkout's. */
export function dataDir() {
    const own = path.join(HERE, '..', 'climate', 'data', 'ref1deg');
    if (fs.existsSync(path.join(own, 't2m.f32'))) return own;
    try {
        const common = execSync('git rev-parse --git-common-dir', { cwd: HERE }).toString().trim();
        const main = path.join(path.resolve(HERE, common), '..', 'tuning', 'climate', 'data', 'ref1deg');
        if (fs.existsSync(path.join(main, 't2m.f32'))) return main;
    } catch { /* (not a git checkout) */ }
    return null;
}

/** assets/earth.png's greys (2048 × 1024, rows from the north, columns from −180°). */
function earthGreys() {
    const png = PNG.sync.read(fs.readFileSync(path.join(HERE, '..', '..', 'assets', 'earth.png')));
    const { width: w, height: h, data } = png, g = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) g[i] = Math.round(0.299 * data[4 * i] + 0.587 * data[4 * i + 1] + 0.114 * data[4 * i + 2]);
    return { g, w, h };
}
/** A grey's height, km (linear: black −0.6 km, white 6.5 km — sea-level land ~23). */
const greyKm = v => -0.6 + 7.1 * v / 255;

const cache = new Map();
/**
 * Earth as a finished moment: { fin (raster R with its farming F, climate { raster K, P }, seed 0, time 0), deg, W, H, z
 * (km), ocean, q (m³/s), lat, lon (°) } on a `deg` grid. Built once per process and resolution (~15 s).
 */
export function earthWorld({ deg = 0.25 } = {}) {
    if (cache.has(deg)) return cache.get(deg);
    const dir = dataDir();
    if (!dir) return null;
    const read = f => { const b = fs.readFileSync(path.join(dir, f)); return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); };
    const T1 = read('t2m.f32'), P1 = read('precip.f32'), PA = read('precipAll.f32'), W1 = 360, H1 = 180, N1 = W1 * H1;
    const W = Math.round(360 / deg), H = W >> 1, N = W * H;
    const lat = new Float32Array(N), lon = new Float32Array(N);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { lat[j * W + i] = 90 - (j + 0.5) * deg; lon[j * W + i] = -180 + (i + 0.5) * deg; }

    // ── the heights: the land's pixels' mean, the cell land where half its pixels are; the sea shallow near the land ──
    const E = earthGreys(), z = new Float32Array(N), ocean = new Uint8Array(N);
    for (let c = 0; c < N; c++) {
        const px = (lon[c] + 180) / 360 * E.w - 0.5, py = Math.min(E.h - 1.001, Math.max(0, (90 - lat[c]) / 180 * E.h - 0.5));
        const x0 = Math.floor(px), y0 = Math.floor(py), fx = px - x0, fy = py - y0;
        let wl = 0, hs = 0;
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
            const v = E.g[(y0 + dy) * E.w + ((x0 + dx) % E.w + E.w) % E.w], wt = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy);
            if (v > 0) { wl += wt; hs += wt * Math.max(0.005, greyKm(v)); }
        }
        if (wl >= 0.5) z[c] = hs / wl; else ocean[c] = 1;
    }
    const nb = (c, f) => {
        const j = (c / W) | 0, i = c - j * W;
        for (let dj = -1; dj <= 1; dj++) { const jj = j + dj; if (jj < 0 || jj >= H) continue; for (let di = -1; di <= 1; di++) if (dj || di) f(jj * W + (i + di + W) % W, di, dj); }
    };
    {
        // (the sea's depth is not in the picture: within ~2 cells of land shelf, −60 m — the ice ages' bridges, history.js
        // HISTORY.shelfM — else the deep sea)
        const near = new Uint8Array(N);
        for (let c = 0; c < N; c++) if (!ocean[c]) nb(c, q => { if (ocean[q]) near[q] = 1; });
        for (let pass = 0; pass < 1; pass++) { const was = near.slice(); for (let c = 0; c < N; c++) if (was[c]) nb(c, q => { if (ocean[q]) near[q] = 1; }); }
        for (let c = 0; c < N; c++) if (ocean[c]) z[c] = near[c] ? -0.06 : -3;
    }

    // ── the climate: each land cell's twelve months ──
    const ok1 = new Uint8Array(N1), hSum = new Float64Array(N1), hN = new Float64Array(N1);
    for (let g = 0; g < N1; g++) { let ok = 1; for (let m = 0; m < 12; m++) if (!(T1[m * N1 + g] === T1[m * N1 + g]) || !(P1[m * N1 + g] === P1[m * N1 + g])) ok = 0; ok1[g] = ok; }
    for (let c = 0; c < N; c++) if (!ocean[c]) { const g = Math.min(H1 - 1, Math.floor(90 - lat[c])) * W1 + Math.min(W1 - 1, Math.floor(lon[c] + 180)); hSum[g] += z[c]; hN[g]++; }
    const hBar = new Float32Array(N1).fill(NaN);
    for (let g = 0; g < N1; g++) if (hN[g]) hBar[g] = hSum[g] / hN[g];
    const T12 = new Float64Array(12), P12 = new Float64Array(12), cv = newCover(), fc = newFarmClimate(N);
    const koppen = new Uint8Array(N), tAnnual = new Int16Array(N).fill(-32768), pAnnual = new Uint16Array(N), cover = new Uint8Array(N);
    const stats = cellStatsCollector(N, c => lat[c] * Math.PI / 180, { bytes: true }), ms = {}, runoff = new Float32Array(N);
    const cw = [], cg = [];
    for (let c = 0; c < N; c++) {
        if (ocean[c]) continue;
        // (the 1° land cells about it, bilinear — or the nearest within 3°)
        const gx = lon[c] + 180 - 0.5, gy = Math.min(H1 - 1.001, Math.max(0, 90 - lat[c] - 0.5)), i0 = Math.floor(gx), j0 = Math.floor(gy), tx = gx - i0, ty = gy - j0;
        cw.length = 0; cg.length = 0;
        for (let dj = 0; dj < 2; dj++) for (let di = 0; di < 2; di++) {
            const g = (j0 + dj) * W1 + ((i0 + di) % W1 + W1) % W1, wt = (di ? tx : 1 - tx) * (dj ? ty : 1 - ty);
            if (ok1[g] && wt > 0) { cw.push(wt); cg.push(g); }
        }
        if (!cg.length) {
            const jc = Math.min(H1 - 1, Math.floor(90 - lat[c])), ic = Math.min(W1 - 1, Math.floor(lon[c] + 180));
            let bd = Infinity, bg = -1;
            for (let dj = -3; dj <= 3; dj++) { const jj = jc + dj; if (jj < 0 || jj >= H1) continue; for (let di = -3; di <= 3; di++) { const g = jj * W1 + ((ic + di) % W1 + W1) % W1, d = di * di + dj * dj; if (ok1[g] && d < bd) { bd = d; bg = g; } } }
            if (bg < 0) { ocean[c] = 1; z[c] = -0.06; continue; }       // (a speck the climate has no land near: sea)
            cw.push(1); cg.push(bg);
        }
        let ws = 0, hb = 0, hbw = 0;
        for (let k = 0; k < cg.length; k++) { ws += cw[k]; if (hBar[cg[k]] === hBar[cg[k]]) { hb += cw[k] * hBar[cg[k]]; hbw += cw[k]; } }
        const dT = hbw > 0 ? -6.5 * (z[c] - hb / hbw) : 0;
        let tA = 0, pA = 0;
        for (let m = 0; m < 12; m++) {
            let t = 0, p = 0;
            for (let k = 0; k < cg.length; k++) { t += cw[k] * T1[m * N1 + cg[k]]; p += cw[k] * P1[m * N1 + cg[k]]; }
            T12[m] = t / ws + dT; P12[m] = Math.max(0, p / ws);
            tA += T12[m]; pA += P12[m];
        }
        koppen[c] = classifyCell(T12, P12, 0, 1);
        tAnnual[c] = Math.round(100 * tA / 12); pAnnual[c] = Math.min(65535, Math.round(pA));
        stats.add(c, T12, P12);
        landCover(T12, P12, cv, undefined, undefined, lat[c]);
        cover[c] = cv.biome | (cv.snow[1] >= 0.5 ? 32 : 0) | (cv.snow[2] >= 0.5 ? 64 : 0);
        addFarmClimate(fc, c, T12, P12, cv);
        // (the runoff, mm a year: Fu's curve, E/P = 1 + φ − (1 + φ^ω)^(1/ω), φ = PET/P)
        monthlyStats(T12, P12, lat[c] * Math.PI / 180, ms);
        const phi = ms.aridity > 0 ? 1 / ms.aridity : 1e3, om = 2.6;
        runoff[c] = pA * Math.max(0, Math.min(1, -(phi - (1 + phi ** om) ** (1 / om))));
    }

    // ── the rivers: a priority flood from the coasts (every cell drains to the sea), the runoff summed downstream ──
    const q = new Float32Array(N);
    {
        // (the picture's greys step ~28 m: its plains are flat for hundreds of km, and a flood across a flat runs straight
        // for its outlet — the Euphrates joined the Tigris in the north. So the flood follows the heights with a little of
        // their regional mean, ~150 km, added — a plain tilts away from the ranges about it, and its river keeps to its
        // axis)
        const zb = Float32Array.from(z, (v, c) => (ocean[c] ? 0 : v)), PASSES = Math.round(150 / (KM_LAT * deg) / 2);
        for (let pass = 0; pass < PASSES; pass++) {
            const was = zb.slice();
            for (let c = 0; c < N; c++) { if (ocean[c]) continue; let s = was[c], k = 1; nb(c, x => { if (!ocean[x]) { s += was[x]; k++; } }); zb[c] = s / k; }
        }
        const zr = Float32Array.from(z, (v, c) => v + 0.1 * zb[c]);
        const recv = new Int32Array(N).fill(-1), seen = new Uint8Array(N), order = new Int32Array(N), fill = Float32Array.from(zr), heap = new Heap(1 << 16);
        let no = 0;
        for (let c = 0; c < N; c++) {
            if (ocean[c]) continue;
            let coast = false;
            nb(c, x => { if (ocean[x]) coast = true; });
            if (coast) { seen[c] = 1; heap.push(zr[c], c); }
        }
        while (heap.n) {
            const c = heap.pop(), fz = fill[c];
            order[no++] = c;
            nb(c, x => {
                if (ocean[x] || seen[x]) return;
                seen[x] = 1; recv[x] = c; fill[x] = Math.max(zr[x], fz + 1e-6);
                heap.push(fill[x], x);
            });
        }
        const flow = new Float64Array(N);
        for (let c = 0; c < N; c++) if (!ocean[c]) flow[c] = runoff[c] / 1000 * (KM_LAT * deg) ** 2 * Math.cos(lat[c] * Math.PI / 180) * 1e6 / 3.156e7;
        for (let k = no - 1; k >= 0; k--) { const c = order[k]; if (recv[c] >= 0) flow[recv[c]] += flow[c]; }
        for (let c = 0; c < N; c++) q[c] = flow[c];
    }

    // ── the farming's parts (farming.js farmCells) on the grid as a mesh: each cell's eight neighbours ──
    const adjOffset = new Int32Array(N + 1), adj = [], xyz = new Float32Array(3 * N);
    for (let c = 0; c < N; c++) {
        const la = lat[c] * Math.PI / 180, lo = lon[c] * Math.PI / 180;
        xyz[3 * c] = Math.cos(la) * Math.cos(lo); xyz[3 * c + 1] = Math.cos(la) * Math.sin(lo); xyz[3 * c + 2] = Math.sin(la);
        nb(c, x => adj.push(x));
        adjOffset[c + 1] = adj.length;
    }
    const mesh = { numCells: N, adjOffset, adjList: Int32Array.from(adj), xyz, edgeKm: KM_LAT * deg * 0.85 };
    const farm = farmCells({ mesh, z, ocean, q, lat, lon, climate: fc });

    // ── the pictures, as the finish's raster makes them (finish.js finishRaster), one pixel a cell ──
    const heightM = new Int16Array(N);
    for (let c = 0; c < N; c++) heightM[c] = Math.max(-32000, Math.min(32000, Math.round(z[c] * 1000)));
    const F = { w: W, h: H, soil: farm.soil, rain: fc.rain, warm: fc.warm, flood: farm.flood, canal: farm.canal, slope: farm.slope, wetland: farm.wetland, pasture: fc.pasture,
        kind: farm.kind, crops: fc.crops, months: fc.months };
    for (let c = 0; c < N; c++) if (ocean[c]) koppen[c] = 0;
    const K = { w: W, h: H, koppen, tAnnual, pAnnual, stats: stats.stats, cover };
    const R = { w: W, h: H, heightM, ocean, water: new Uint8Array(N), farming: F };
    // (the page climate's rain on the 1° grid, mm a month: the year's mean, January's and July's — the land's observed, the
    // sea's GPCP)
    const P = { year: new Float32Array(N1), jan: new Float32Array(N1), jul: new Float32Array(N1) };
    for (let g = 0; g < N1; g++) {
        const at = m => { const v = P1[m * N1 + g]; return v === v ? v : (PA[m * N1 + g] === PA[m * N1 + g] ? PA[m * N1 + g] : 0); };
        let y = 0;
        for (let m = 0; m < 12; m++) y += at(m);
        P.year[g] = y / 12; P.jan[g] = at(0); P.jul[g] = at(6);
    }
    // (the sea for gatherers — living.js gatherGround: its year's temperature (NOAA OISST), sea ice, and coastal upwelling
    // from the observed winds (NCEP): the Ekman transport offshore, τ / (ρ f), welling up over a ~50 km zone — m a day)
    const SST = read('sst.f32'), ICE = read('seaIce.f32'), U = read('u10.f32'), V = read('v10.f32');
    const Tsea = new Float32Array(N1).fill(NaN), seaIce = new Float32Array(N1), upwelling = new Float32Array(N1);
    const land1 = new Uint8Array(N1);
    for (let c = 0; c < N; c++) if (!ocean[c]) land1[Math.min(H1 - 1, Math.floor(90 - lat[c])) * W1 + Math.min(W1 - 1, Math.floor(lon[c] + 180))] = 1;
    for (let g = 0; g < N1; g++) {
        let t = 0, k = 0, ic = 0;
        for (let m = 0; m < 12; m++) { const v = SST[m * N1 + g]; if (v === v) { t += v; k++; } const s = ICE[m * N1 + g]; if (s === s) ic += s / 12; }
        if (k) Tsea[g] = t / k;
        seaIce[g] = ic;
        if (land1[g]) continue;
        // (offshore: away from the land among its eight neighbours)
        const j = (g / W1) | 0, i = g - j * W1;
        let nx = 0, ny = 0;
        for (let dj = -1; dj <= 1; dj++) { const jj = j + dj; if (jj < 0 || jj >= H1) continue; for (let di = -1; di <= 1; di++) if ((di || dj) && land1[jj * W1 + (i + di + W1) % W1]) { const r = Math.hypot(di, dj); nx -= di / r; ny += dj / r; } }
        const nl = Math.hypot(nx, ny);
        if (!(nl > 0)) continue;
        nx /= nl; ny /= nl;
        const la = 89.5 - j, f = 2 * 7.292e-5 * Math.sin(Math.max(5, Math.abs(la)) * Math.PI / 180) * Math.sign(la || 1);
        let wsum = 0;
        for (let m = 0; m < 12; m++) {
            const u = U[m * N1 + g], v = V[m * N1 + g];
            if (!(u === u) || !(v === v)) continue;
            const sp = Math.hypot(u, v), tx = 1.2 * 1.3e-3 * sp * u, ty = 1.2 * 1.3e-3 * sp * v;
            const Mx = ty / (1025 * f), My = -tx / (1025 * f);          // (the Ekman transport: right of the wind in the north)
            wsum += Math.max(0, Mx * nx + My * ny) / 50000 * 86400;
        }
        upwelling[g] = wsum / 12;
    }
    for (let g = 0; g < N1; g++) if (!(Tsea[g] === Tsea[g])) Tsea[g] = 30 - 30 * Math.abs(89.5 - Math.floor(g / W1)) / 90;
    const out = { fin: { raster: R, climate: { raster: K, P, Tsea: { year: Tsea }, upwelling: { year: upwelling }, seaIce: { year: seaIce } }, seed: 0, time: 0 }, deg, W, H, z, ocean, q, lat, lon, mesh };
    cache.set(deg, out);
    return out;
}
/** A cell of the world's grid at (lat, lon). */
export const worldCell = (E, la, lo) => Math.min(E.H - 1, Math.max(0, Math.floor((90 - la) / E.deg))) * E.W + ((Math.floor((lo + 180) / E.deg) % E.W) + E.W) % E.W;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const t0 = performance.now(), E = earthWorld();
    if (!E) { console.log('No Earth reference climate: run node tuning/climate/fetch-references.mjs first'); process.exit(0); }
    console.log(`Earth at ${E.deg}° in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
    const F = E.fin.raster.farming;
    // (the biggest discharge within ~1° of a place, and its parts there)
    for (const [n, la, lo, want] of [['Nile, Egypt', 26.5, 31.5, 2800], ['Nile delta', 30.8, 31, 2800], ['Mesopotamia', 32.5, 44.5, 1500], ['Indus, Sindh', 26, 68.5, 3000], ['Ganges, Bengal', 24, 89, 12000],
        ['Yangtze plain', 30.5, 115, 25000], ['Yellow River', 35, 113, 1500], ['Mississippi', 33, -91, 16000], ['Amazon', -3, -60, 150000], ['Congo', 0, 22, 30000], ['Niger, inland delta', 15, -4, 1500],
        ['Volga', 48, 46, 8000], ['Danube', 45, 25, 6000], ['Rhine', 51.5, 6.5, 2300]]) {
        const c0 = worldCell(E, la, lo);
        let bq = 0, bc = c0;
        for (let dj = -4; dj <= 4; dj++) for (let di = -4; di <= 4; di++) { const c = worldCell(E, la + dj * E.deg, lo + di * E.deg); if (E.q[c] > bq) { bq = E.q[c]; bc = c; } }
        console.log(`  ${n.padEnd(22)} q ${bq.toFixed(0).padStart(7)} m³/s (real ~${want}) · at the place: flood ${(F.flood[c0] / 255).toFixed(2)} canal ${(F.canal[c0] / 255).toFixed(2)} soil ${(F.soil[c0] / 255).toFixed(2)} rain ${(F.rain[c0] / 20).toFixed(1)} warm ${(F.warm[c0] / 20).toFixed(1)} mo · ${E.ocean[c0] ? 'SEA' : `${E.z[c0].toFixed(2)} km`}`);
        void bc;
    }
}
