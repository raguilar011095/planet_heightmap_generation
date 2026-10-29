// The deposits' climate tests (v2/js/geology/deposits.js climateTests) run on observed Earth climate (Beck et al. 2023,
// 1991–2020, 1° land: tuning/climate/data/ref1deg — node tuning/climate/fetch-references.mjs, then regrid-references.mjs)
// beside where bauxite, peat, salt, enriched copper, opal and turquoise really are, and where they are not. Exported for
// check-geology.mjs.
// Usage: node tuning/geology/earth-deposits.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { climateTests, climateTestArrays } from '../../v2/js/geology/deposits.js';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'climate', 'data', 'ref1deg');

// [name, lat, lon]: the deposits' best-known districts (and places that have none)
export const PLACES = {
    baux: { has: [['Boké, Guinea', 11, -14], ['Weipa, Australia', -12.6, 141.9], ['Trombetas, Brazil', -1.5, -56.4], ['Paragominas, Brazil', -3, -47.4],
        ['Jamaica', 18.1, -77.3], ['Odisha, India', 19, 83], ['Suriname', 5, -55.5], ['West Kalimantan', 0, 110.5], ['Gove, Australia', -12.3, 136.7]],
        not: [['Sahara', 24, 10], ['Siberia', 62, 100], ['Central Europe', 50, 10], ['Gobi', 43, 105], ['Patagonia', -45, -69]] },
    peat: { has: [['West Siberian Lowland', 60, 75], ['Hudson Bay Lowlands', 54, -85], ['Central Kalimantan', -2, 113.5], ['Sumatra', -0.5, 102.5],
        ['Ireland', 53.5, -8], ['Finland', 64, 26], ['Cuvette Centrale, Congo', 0, 18], ['Scotland', 57.5, -4.5]],
        not: [['Sahara', 24, 10], ['Arabia', 22, 47], ['Atacama', -24, -69.5], ['Australian outback', -25, 133], ['Sahel', 15, 0]] },
    evap: { has: [['Sahara', 24, 10], ['Atacama', -23.5, -69.5], ['Rub al Khali', 21, 50], ['Lake Eyre', -28.5, 137.3], ['Bonneville', 40.8, -113.5],
        ['Dead Sea', 31.5, 35.5], ['Uyuni', -20.2, -67.5], ['Kara-Bogaz', 41.2, 53.5], ['Chott el Djerid', 33.7, 8.4]],
        not: [['Amazon', -3, -60], ['Congo', 0, 22], ['Ireland', 53.5, -8], ['Finland', 64, 26], ['Borneo', 1, 114]] },
    semi: { has: [['Atacama copper belt', -24, -69.5], ['Arizona', 33, -111], ['Zambian Copperbelt (dry season)', -12.8, 28.2], ['Iran, Sar Cheshmeh', 29.9, 55.9],
        ['Chuquicamata', -22.3, -68.9], ['Bingham Canyon', 40.5, -112.2]],
        not: [['Amazon', -3, -60], ['Congo', 0, 22], ['Siberia', 62, 100], ['Borneo', 1, 114]] },
    // (G7: opal and turquoise country)
    arid: { has: [['Coober Pedy, opal', -29, 134.7], ['Andamooka, opal', -30.5, 137.2], ['Lightning Ridge, opal', -29.4, 148], ['Nishapur, turquoise', 36.2, 58.8],
        ['Sinai, turquoise', 29, 33.4], ['Kingman, Arizona, turquoise', 35.2, -114], ['Querétaro, fire opal', 20.6, -100.4]],
        not: [['Amazon', -3, -60], ['Congo', 0, 22], ['Ireland', 53.5, -8], ['Siberia', 62, 100], ['Borneo', 1, 114]] },
};

/** Each test's membership (0…1) at each place — the mean of the land cells within a degree of it. */
export function earthDeposits() {
    if (!fs.existsSync(path.join(DIR, 't2m.f32'))) return null;
    const read = f => { const b = fs.readFileSync(path.join(DIR, f)); return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); };
    const T = read('t2m.f32'), P = read('precip.f32'), W = 360, H = 180, N = W * H;
    const out = climateTestArrays(N), T12 = new Float64Array(12), P12 = new Float64Array(12), land = new Uint8Array(N);
    for (let g = 0; g < N; g++) {
        let ok = true;
        for (let m = 0; m < 12; m++) { T12[m] = T[m * N + g]; P12[m] = P[m * N + g]; if (!(T12[m] === T12[m]) || !(P12[m] === P12[m])) ok = false; }
        if (!ok) continue;
        land[g] = 1;
        climateTests(T12, P12, g, out);
    }
    const at = (test, la, lo) => {
        let s = 0, k = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const y = Math.min(H - 1, Math.max(0, Math.floor(90 - la) + dy)), x = ((Math.floor(lo + 180) + dx) % W + W) % W, g = y * W + x;
            if (land[g]) { s += out[test][g] / 255; k++; }
        }
        return k ? s / k : NaN;
    };
    const res = {};
    for (const [test, { has, not }] of Object.entries(PLACES)) res[test] = { has: has.map(([n, la, lo]) => [n, at(test, la, lo)]), not: not.map(([n, la, lo]) => [n, at(test, la, lo)]) };
    return res;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const res = earthDeposits();
    if (!res) { console.log('No Earth reference climate: run node tuning/climate/fetch-references.mjs first'); process.exit(0); }
    for (const [test, { has, not }] of Object.entries(res)) {
        console.log(`── ${test} ──`);
        for (const [n, v] of has) console.log(`  has  ${n.padEnd(32)} ${v.toFixed(2)}`);
        for (const [n, v] of not) console.log(`  not  ${n.padEnd(32)} ${v.toFixed(2)}`);
    }
}
