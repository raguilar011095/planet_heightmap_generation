/**
 * Polar lowlands: tundra (ET) or continental (D)? — issue #74. Where the climate's high-latitude lowlands come out
 * continental instead of tundra, and why. The D / ET line is the warmest month at 10 °C, so this looks at the polar
 * summers: Earth's lowlands poleward of 50° against Beck (by latitude, and by distance from the sea), named Arctic
 * stations month by month, the polar seas' summer (air over the ice, the ice itself, against OISST's sea ice), and the
 * generated planets' polar lowlands (their ET / D / EF shares by latitude) next to Earth's.
 *
 *   node tuning/climate/diag-polar.mjs [--set KEY=value,…] [--planets gen-2,gen-6,…|none] [--climate <snapshot root>]
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadEarthGrayscale } from './lib/earth-context.mjs';
import { buildEarthMesh } from './lib/earth-mesh.mjs';
import { loadReferences, truthAt01 } from './lib/ref.mjs';
import { loadGenPlanets, cellLatDeg } from './lib/gen-planets.mjs';
import { compareClasses } from './lib/compare.mjs';
import { elevToHeightKm } from '../../js/color-map.js';
import { cellLatLon } from '../../v2/js/climate/core.js';
import { KOPPEN_CLASSES } from '../../v2/js/climate/koppen.js';

// (--climate: another copy of the code to run, e.g. `git archive` of an older commit — before / after comparisons)
const argClimate = process.argv.indexOf('--climate');
const climateBase = argClimate > 0 ? pathToFileURL(path.resolve(process.argv[argClimate + 1]) + '/').href : new URL('../../', import.meta.url).href;
const { planetClimate } = await import(climateBase + 'v2/js/climate/climate.js');
const { setParams } = await import(climateBase + 'v2/js/climate/config.js');
const argSet = process.argv.indexOf('--set');
if (argSet > 0) setParams(Object.fromEntries(process.argv[argSet + 1].split(',').map(kv => { const [k, v] = kv.split('='); return [k, +v]; })));
const argPl = process.argv.indexOf('--planets');
const PLANETS = argPl > 0 ? (process.argv[argPl + 1] === 'none' ? [] : process.argv[argPl + 1].split(',')) : ['gen-2', 'gen-6', 'gen-10', 'evo-12345', 'evo-101'];
const LOW_KM = 0.5;                                   // "lowland": terrain cells below this
const f1 = (x) => (x === x ? (x >= 0 ? ' ' : '') + x.toFixed(1) : '  —'), pc = (x) => (x === x ? `${(100 * x).toFixed(0)}`.padStart(3) + ' %' : '   —');
const group = (k) => { const c = KOPPEN_CLASSES[k]?.code ?? ''; return c === 'ET' ? 'ET' : c === 'EF' ? 'EF' : c[0] === 'D' ? 'D' : c ? 'other' : ''; };

const { grid, fields: obs, koppen01, land: obsLand } = loadReferences();
const G = grid.size, gw = grid.w, gh = grid.h;

// ── Earth, as the coupled check builds it ──
const { gray, width, height } = loadEarthGrayscale();
const e = buildEarthMesh(gray, width, height, { N: 160000 });
const n = e.mesh.numRegions, elevKm = new Float32Array(n);
for (let r = 0; r < n; r++) elevKm[r] = elevToHeightKm(e.r_elevation[r]);
const lat = new Float32Array(n), lon = new Float32Array(n);
cellLatLon(e.r_xyz, 'y-up', lat, lon);
const truth = new Uint8Array(n);
for (let r = 0; r < n; r++) truth[r] = truthAt01(koppen01, lat[r], lon[r]);

const runWithHot = (input) => {
    const hot = new Float32Array(input.elevKm.length).fill(NaN);
    const res = planetClimate(input, { onCell: (r, T12) => { let m = -Infinity; for (let k = 0; k < 12; k++) if (T12[k] > m) m = T12[k]; hot[r] = m; } });
    return { res, hot };
};
const t0 = performance.now();
const { res, hot } = runWithHot({ xyz: e.r_xyz, elevKm, axes: 'y-up' });
console.log(`Earth 160K: climate in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
const sim = res.cell.koppen, T = res.stages.temperature, S = res.surface;

// ── 1. Terrain cells: lowlands poleward of 50°, by 5° band — the real and simulated classes ──
const BANDS = [[50, 55], [55, 60], [60, 65], [65, 70], [70, 75], [75, 84]];
const bandOf = (a) => BANDS.findIndex(([lo, hi]) => a >= lo && a < hi);
// The owner's rule for an Earth-like planet: land poleward of 75° (surely 80°) is polar (E) or arid (B) — on Earth, all of it
const notPolar = (latArr, classes) => [75, 80].map(t => {
    let n = 0, bad = 0;
    for (let r = 0; r < classes.length; r++) {
        if (!classes[r] || Math.abs(latArr[r]) < t) continue;
        const c = KOPPEN_CLASSES[classes[r]].code; n++;
        if (c[0] !== 'E' && c[0] !== 'B') bad++;
    }
    return `≥ ${t}°: ${n ? pc(bad / n) : '   —'}`;
}).join('   ');
function bandTable(title, latArr, elev, classes, hotArr, truthArr = null) {
    console.log(`\n${title}`);
    console.log(`  land neither polar (E) nor arid (B), all heights — ${notPolar(latArr, classes)}` + (truthArr ? `   (Beck: ${notPolar(latArr, truthArr)})` : ''));
    console.log('  band      cells    ET     D    EF  other   warmest month' + (truthArr ? '   | real: ET     D    EF   ET→D  D→ET' : ''));
    for (const hemi of [1, -1]) for (let b = 0; b < BANDS.length; b++) {
        const cnt = { ET: 0, D: 0, EF: 0, other: 0 }, tc = { ET: 0, D: 0, EF: 0, other: 0 }, others = {};
        let N = 0, hs = 0, hn = 0, etD = 0, dEt = 0;
        for (let r = 0; r < latArr.length; r++) {
            if (!classes[r] || !(elev[r] > 0) || elev[r] >= LOW_KM || Math.sign(latArr[r]) !== hemi || bandOf(Math.abs(latArr[r])) !== b) continue;
            const gS = group(classes[r]);
            if (truthArr) { const gT = group(truthArr[r]); if (!gT) continue; tc[gT]++; if (gT === 'ET' && gS === 'D') etD++; if (gT === 'D' && gS === 'ET') dEt++; }
            N++; cnt[gS]++;
            if (gS === 'other') { const code = KOPPEN_CLASSES[classes[r]].code; others[code] = (others[code] ?? 0) + 1; }
            if (hotArr[r] === hotArr[r]) { hs += hotArr[r]; hn++; }
        }
        if (N < 30) continue;
        const [lo, hi] = BANDS[b];
        let line = `  ${hemi > 0 ? 'N' : 'S'} ${lo}–${hi}°  ${String(N).padStart(6)}  ${pc(cnt.ET / N)} ${pc(cnt.D / N)} ${pc(cnt.EF / N)} ${pc(cnt.other / N)}   ${f1(hs / hn)} °C`;
        if (truthArr) line += `        | ${pc(tc.ET / N)} ${pc(tc.D / N)} ${pc(tc.EF / N)}  ${pc(etD / N)} ${pc(dEt / N)}`;
        else line += `   (other: ${Object.entries(others).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k, v]) => `${k} ${(100 * v / N).toFixed(0)}`).join(', ')})`;
        console.log(line);
    }
}
bandTable(`Earth lowlands (< ${LOW_KM} km), simulated (share of the band's land cells) — and Beck's`, lat, elevKm, sim, hot, truth);
// … and the high latitudes' Köppen against Beck, exact and near match (lib/koppen-distance.mjs), with ET's recall
// (real ET simulated ET) and precision (simulated ET really ET)
console.log('\nEarth land poleward of 55° vs Beck (Greenland and Antarctica left out):');
console.log('                              cells   exact   near    ET recall / precision');
for (const [label, sel] of [['north, all land', (r) => lat[r] >= 55], ['north, lowlands', (r) => lat[r] >= 55 && elevKm[r] < LOW_KM],
    ['north, ≥ 66.5° (Arctic)', (r) => lat[r] >= 66.5], ['south, all land', (r) => lat[r] <= -55]]) {
    const mask = new Uint8Array(n);
    for (let r = 0; r < n; r++) mask[r] = elevKm[r] > 0 && sel(r) && !(lat[r] >= 59 && lon[r] >= -75 && lon[r] <= -10) && lat[r] > -60 ? 1 : 0;
    const c = compareClasses(truth, sim, null, mask), ET = KOPPEN_CLASSES.findIndex(k => k.code === 'ET');
    let tp = 0, rt = 0, st = 0;
    for (let r = 0; r < n; r++) { if (!mask[r] || !truth[r] || !sim[r]) continue; if (truth[r] === ET) rt++; if (sim[r] === ET) st++; if (truth[r] === ET && sim[r] === ET) tp++; }
    console.log(`  ${label.padEnd(26)} ${String(c.total).padStart(6)}   ${pc(c.exact)}  ${pc(c.graded)}    ${pc(tp / rt)} / ${pc(tp / st)}`);
}

// ── 2. The 1° grid: warmest and coldest month vs Beck over polar lowlands, by distance from the sea ──
// (res.months.T — the twelve months Köppen sees — at each grid cell's reference height; Beck's t2m at its own height)
const coastKm = new Float32Array(G).fill(Infinity);
{
    const q = []; for (let c = 0; c < G; c++) if (S.landFrac[c] < 0.5) { coastKm[c] = 0; q.push(c); }
    for (let h = 0; h < q.length; h++) {
        const c = q[h], i = c % gw, j = (c - i) / gw, d = coastKm[c];
        const cl = Math.max(0.05, Math.cos(grid.lat[j] * Math.PI / 180));
        for (const [nb, km] of [[j * gw + (i + 1) % gw, 111 * cl], [j * gw + (i - 1 + gw) % gw, 111 * cl], [j > 0 ? c - gw : -1, 111], [j < gh - 1 ? c + gw : -1, 111]]) {
            if (nb < 0 || coastKm[nb] <= d + km) continue;
            coastKm[nb] = d + km; q.push(nb);
        }
    }
}
const DIST = [[0, 250], [250, 600], [600, 1200], [1200, 1e9]];
console.log(`\nEarth 1° grid, lowland land (mean height < ${LOW_KM} km), simulated − Beck, °C (area-weighted):`);
console.log('  band       dist from sea   cells   warmest month  (sim / real)    coldest month (sim / real)   months > 10 °C (sim / real)');
for (const hemi of [1, -1]) for (const [lo, hi] of [[55, 62], [62, 68], [68, 75], [75, 84]]) for (const [d0, d1] of DIST) {
    let ws = 0, sh = 0, rh = 0, sc = 0, rc = 0, s10 = 0, r10 = 0, N = 0;
    for (let j = 0; j < gh; j++) {
        const la = grid.lat[j]; if (Math.sign(la) !== hemi || Math.abs(la) < lo || Math.abs(la) >= hi) continue;
        const wgt = Math.cos(la * Math.PI / 180);
        for (let i = 0; i < gw; i++) {
            const c = j * gw + i;
            if (!obsLand[c] || !(S.landFrac[c] >= 0.5) || !(S.meanLandKm[c] < LOW_KM) || coastKm[c] < d0 || coastKm[c] >= d1) continue;
            let mxS = -Infinity, mxR = -Infinity, mnS = Infinity, mnR = Infinity, nS = 0, nR = 0;
            for (let m = 0; m < 12; m++) {
                const s = res.months.T[m * G + c], o = obs.t2m[m * G + c];
                mxS = Math.max(mxS, s); mxR = Math.max(mxR, o); mnS = Math.min(mnS, s); mnR = Math.min(mnR, o);
                if (s > 10) nS++; if (o > 10) nR++;
            }
            ws += wgt; sh += wgt * mxS; rh += wgt * mxR; sc += wgt * mnS; rc += wgt * mnR; s10 += wgt * nS; r10 += wgt * nR; N++;
        }
    }
    if (N < 5) continue;
    console.log(`  ${hemi > 0 ? 'N' : 'S'} ${lo}–${hi}°   ${String(d0).padStart(5)}–${d1 > 1e8 ? '   ' : String(d1).padStart(4)} km  ${String(N).padStart(5)}   ${f1(sh / ws - rh / ws).padStart(6)}  (${f1(sh / ws)} / ${f1(rh / ws)})     ${f1(sc / ws - rc / ws).padStart(6)}  (${f1(sc / ws)} / ${f1(rc / ws)})      ${(s10 / ws).toFixed(1)} / ${(r10 / ws).toFixed(1)}`);
}

// ── 3. Named stations (1° cell): the year, simulated vs Beck ──
const STATIONS = [
    ['Utqiaġvik (Barrow)', 71.3, -156.8, 'ET'], ['Prudhoe Bay', 70.2, -148.5, 'ET'], ['Inuvik', 68.4, -133.7, 'Dfc'], ['Cambridge Bay', 69.1, -105.1, 'ET'],
    ['Baker Lake', 64.3, -96.1, 'ET'], ['Churchill', 58.8, -94.2, 'Dfc/ET'], ['Iqaluit', 63.7, -68.5, 'ET'], ['Kuujjuaq', 58.1, -68.4, 'Dfc'],
    ['Nuuk', 64.2, -51.7, 'ET'], ['Reykjavík', 64.1, -21.9, 'Cfc'], ['Tromsø', 69.7, 18.9, 'Dfc'], ['Murmansk', 69.0, 33.1, 'Dfc'],
    ['Naryan-Mar', 67.6, 53.0, 'Dfc'], ['Vorkuta', 67.5, 64.0, 'Dfc'], ['Dikson', 73.5, 80.4, 'ET'], ['Norilsk', 69.3, 88.2, 'Dfc'],
    ['Khatanga', 72.0, 102.5, 'Dfc/ET'], ['Tiksi', 71.6, 128.9, 'ET'], ['Chokurdakh', 70.6, 147.9, 'Dfc/ET'], ['Pevek', 69.7, 170.3, 'ET'],
    ['Anadyr', 64.7, 177.5, 'Dfc/ET'], ['Yakutsk', 62.0, 129.7, 'Dfd'], ['Ushuaia', -54.8, -68.3, 'Cfc/ET'], ['S. Georgia', -54.3, -36.5, 'ET'],
];
const cellAt = (la, lo) => { const j = Math.max(0, Math.min(gh - 1, Math.floor((90 - la) / grid.step))), i = ((Math.floor((lo + 180) / grid.step)) % gw + gw) % gw; return j * gw + i; };
const nearestLand = (la, lo) => {        // the station's cell, or the nearest with Beck land and the climate's land
    let best = -1, bd = Infinity;
    for (let dj = -2; dj <= 2; dj++) for (let di = -3; di <= 3; di++) {
        const c = cellAt(la + dj * grid.step, lo + di * grid.step);
        if (!obsLand[c] || !(S.landFrac[c] >= 0.3)) continue;
        const d = dj * dj + di * di * 0.3; if (d < bd) { bd = d; best = c; }
    }
    return best;
};
console.log('\nStations (1° cell, simulated / Beck, °C; class at the cell from the 12 months — Beck\'s class beside the name):');
console.log('  station                 real class   Jan          Apr          Jun          Jul          Aug          Oct          warmest      class sim/real');
for (const [name, la, lo, cls] of STATIONS) {
    const c = nearestLand(la, lo); if (c < 0) { console.log(`  ${name.padEnd(22)} (no land cell)`); continue; }
    const cols = [0, 3, 5, 6, 7, 9].map(m => `${f1(res.months.T[m * G + c]).padStart(5)}/${f1(obs.t2m[m * G + c]).padStart(5)}`);
    let mxS = -Infinity, mxR = -Infinity; for (let m = 0; m < 12; m++) { mxS = Math.max(mxS, res.months.T[m * G + c]); mxR = Math.max(mxR, obs.t2m[m * G + c]); }
    console.log(`  ${name.padEnd(22)}  ${cls.padEnd(8)}  ${cols.join('  ')}  ${f1(mxS).padStart(5)}/${f1(mxR).padStart(5)}   h ${S.meanLandKm[c].toFixed(2)} km, land ${(100 * S.landFrac[c]).toFixed(0)} %`);
}

// ── 4. The polar seas through the summer: air over the sea, and the sea ice against OISST's ──
console.log('\nPolar seas (1° grid cells with < 50 % land): air temperature at sea level (no inversion) and sea-ice cover, simulated / observed ice');
console.log('  region            month   air °C   ice sim / obs');
const seaIce = T.seaIce;
for (const [label, lo, hi, months] of [['Arctic ≥ 75°N', 75, 90, [5, 6, 7, 8]], ['Arctic 66–75°N', 66, 75, [5, 6, 7, 8]], ['Southern ≥ 60°S', -90, -60, [11, 0, 1, 2]]]) {
    for (const m of months) {
        let ws = 0, ta = 0, is = 0, io = 0, wo = 0;
        for (let j = 0; j < gh; j++) {
            const la = grid.lat[j]; if (la < lo || la >= hi) continue;
            const wgt = Math.cos(la * Math.PI / 180);
            for (let i = 0; i < gw; i++) {
                const c = j * gw + i; if (!(S.landFrac[c] < 0.5)) continue;
                ws += wgt; ta += wgt * T.monthlySL[m * G + c]; is += wgt * seaIce[m * G + c];
                const o = obs.seaIce[m * G + c]; if (o === o) { io += wgt * o; wo += wgt; }
            }
        }
        console.log(`  ${label.padEnd(16)}  ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m]}    ${f1(ta / ws).padStart(6)}   ${pc(is / ws)} / ${pc(wo ? io / wo : NaN)}`);
    }
}

// … and the sea ice's area through the year, against OISST's (million km²)
{
    const km2 = (c) => grid.rowArea[Math.floor(c / gw)] * 510.1;          // million km² per cell
    const line = (hemi) => [2, 5, 8, 11].map(m => {
        let s = 0, o = 0;
        for (let c = 0; c < G; c++) {
            if (Math.sign(grid.lat[Math.floor(c / gw)]) !== hemi || !(S.landFrac[c] < 0.5)) continue;
            s += km2(c) * seaIce[m * G + c]; const v = obs.seaIce[m * G + c]; if (v === v) o += km2(c) * v;
        }
        return `${['Mar', 'Jun', 'Sep', 'Dec'][[2, 5, 8, 11].indexOf(m)]} ${s.toFixed(1).padStart(4)} / ${o.toFixed(1).padStart(4)}`;
    }).join('   ');
    console.log(`  sea-ice area, sim / obs (M km²):  north  ${line(1)}`);
    console.log(`                                    south  ${line(-1)}`);
}

// ── 5. The generated planets' polar lowlands ──
if (PLANETS.length) {
    const planets = await loadGenPlanets({ only: PLANETS, log: () => {} });
    for (const p of planets) {
        const { res: pr, hot: ph } = runWithHot({ xyz: p.xyz, elevKm: p.elevKm, axes: p.axes });
        bandTable(`${p.key} lowlands (< ${LOW_KM} km)`, cellLatDeg(p.xyz, p.axes, p.elevKm.length), p.elevKm, pr.cell.koppen, ph);
    }
}
