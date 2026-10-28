// The Farming tab's climate part (v2/js/farming/farming.js growingSeason and climateSoil, through the land's cover:
// finish-cover.js landCover) on Earth's observed climate (Beck et al. 2023, 1991–2020, 1° land: tuning/climate/data/ref1deg
// — node tuning/climate/fetch-references.mjs, then regrid-references.mjs), at the places it should hold and should not:
// the breadbaskets' long rain-fed seasons, the Nile's and Mesopotamia's that only water brought makes, the short ones of
// the cold; black earth on the steppes and prairies, leached ground in the wet tropics, podzol in the taiga.
// Usage: node tuning/farming/earth-farming.mjs   (exits 1 if a place is off)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { growingSeason, climateSoil, newSeason, seasonYield, cropYields, cropWork, pastureOf, farmPlace, farmClass, Staple, STAPLE_WORDS, CROPS } from '../../v2/js/farming/farming.js';
import { landCover, newCover } from '../../v2/js/finish/finish-cover.js';
import { peopleAt } from '../../v2/js/farming/people.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** The reference data: this checkout's, or (in a git worktree, which has none of the downloaded data) the main checkout's. */
function dataDir() {
    const own = path.join(HERE, '..', 'climate', 'data', 'ref1deg');
    if (fs.existsSync(path.join(own, 't2m.f32'))) return own;
    try {
        const common = execSync('git rev-parse --git-common-dir', { cwd: HERE }).toString().trim();
        const main = path.join(path.resolve(HERE, common), '..', 'tuning', 'climate', 'data', 'ref1deg');
        if (fs.existsSync(path.join(main, 't2m.f32'))) return main;
    } catch { /* (not a git checkout) */ }
    return null;
}

// [name, lat, lon], and what should hold there
export const PLACES = {
    breadbasket: { test: v => v.rain >= 4, words: 'a long rain-fed season (≥ 4 months)', at: [['Ukraine', 49, 32], ['Iowa', 42, -93.5], ['Paris Basin', 48.5, 2.5],
        ['Pampas', -34.5, -61], ['Bengal', 24, 89], ['Java', -7.3, 110.5], ['Po Valley', 45, 10], ['Yangtze plain', 30.5, 115]] },
    watered: { test: v => v.rain <= 1.5 && v.warm >= 9, words: 'barren by rain, ≥ 9 months watered (the irrigated river valleys)', at: [['Nile, Egypt', 26.5, 31.5], ['Mesopotamia', 32.5, 44.5],
        ['Indus, Sindh', 26, 68.5], ['Imperial Valley', 32.8, -115.5], ['Arizona (Hohokam)', 33.5, -112]] },
    // (coastal Peru's irrigated valleys, the Moche's, lie in a desert strip narrower than the 1° grid: not checked)
    cold: { test: v => v.warm <= 2.5, words: 'too cold for crops (≤ 2.5 warm months)', at: [['North Siberia', 70, 100], ['Greenland coast', 64, -51], ['Tibet', 33, 88], ['Nunavut', 65, -95]] },
    highland: { test: v => v.rain >= 3, words: 'highlands farmed (≥ 3 months by rain)', at: [['Cusco, Andes', -13.5, -72], ['Ethiopian highlands', 9, 38.7], ['Mexico valley', 19.5, -99]] },
    black: { test: v => v.black >= 0.5, words: 'black earth (≥ 0.5)', at: [['Ukraine', 49, 32], ['Kansas', 38.5, -98.5], ['Pampas', -34.5, -61], ['Kazakh steppe', 52, 70], ['Manchuria', 46, 126]] },
    notBlack: { test: v => v.black <= 0.2, words: 'no black earth (≤ 0.2)', at: [['Amazon', -3, -60], ['Sahara', 24, 10], ['Finland', 64, 26], ['Sahel savanna', 12, 0]] },
    leached: { test: v => v.leach >= 0.6, words: 'leached (≥ 0.6)', at: [['Amazon', -3, -60], ['Congo', 0, 22], ['Borneo', 1, 114], ['Guinea coast', 6, -9]] },
    notLeached: { test: v => v.leach <= 0.2, words: 'not leached (≤ 0.2)', at: [['Ukraine', 49, 32], ['Sahara', 24, 10], ['Paris Basin', 48.5, 2.5], ['Punjab', 31, 74]] },
    podzol: { test: v => v.podzol >= 0.5, words: 'podzol (≥ 0.5)', at: [['Finland', 64, 26], ['Siberian taiga', 60, 100], ['Quebec', 50, -72], ['Arkhangelsk', 63, 42]] },
};
// (C2) each place's staple — what grows best there, every technique on — on its ground: river silt watered ('w'),
// river silt by rain ('r'), volcanic ('v'), sand ('s': the Sahel's, the wheatbelt's), else middling; and any other staple that is as fair an answer there
// (both grow well; which one people grew was culture's — not modelled)
export const STAPLE_PLACES = {
    [Staple.RICE]: [['Bengal', 24, 89, 'r'], ['Yangtze plain', 30.5, 115, 'r'], ['Java', -7.3, 110.5, 'v'], ['Mekong delta', 10.5, 105.5, 'r'], ['Guangdong', 23, 113, 'r'], ['Kyushu', 33, 131, 'v']],
    [Staple.WHEAT]: [['Paris Basin', 48.5, 2.5], ['Ukraine', 49, 32], ['Anatolia', 39, 33], ['England', 52, -1], ['Nile, Egypt', 26.5, 31.5, 'w'], ['Mesopotamia', 32.5, 44.5, 'w'],
        ['Indus, Sindh', 26, 68.5, 'w', [Staple.MAIZE]], ['Punjab', 31, 74, 'w', [Staple.MAIZE]]],
    [Staple.MAIZE]: [['Iowa', 42, -93.5], ['Mexico valley', 19.5, -99, 'v', [Staple.WHEAT, Staple.ROOTS]], ['Sahel (millet)', 13, 2], ['Highveld', -26.5, 28], ['Deccan (sorghum)', 17, 76]],
    [Staple.ROOTS]: [['Congo', 0, 22], ['Amazon', -3, -60], ['Titicaca (potatoes)', -16, -69.5, '', [Staple.HERDING, Staple.WHEAT]], ['New Guinea highlands', -6, 145]],
    [Staple.HERDING]: [['Mongolia', 47, 103], ['Kazakh steppe', 48, 68], ['Patagonia', -45, -69], ['Tibet', 33, 88], ['Horn of Africa', 8, 46], ['North Siberia (reindeer)', 70, 100]],
    [Staple.NONE]: [['Sahara', 24, 10], ['Rub al Khali', 21, 50], ['Taklamakan', 39, 83]],
};
// (C2) each place's farmland class (every technique on, on its ground as above): excellent where two or three harvests
// a year come off renewed ground (the great river plains and deltas, volcanic Java); good where one solid one does (the
// breadbaskets — the Mediterranean's wetter cores among them); fair to poor on the dry and seasonal margins
const BARREN = 0, POOR = 1, FAIR = 2, GOOD = 3, EXCELLENT = 4;
export const FARMLAND_PLACES = [
    ['Nile, Egypt', 26.5, 31.5, 'w', [EXCELLENT]], ['Mesopotamia', 32.5, 44.5, 'w', [EXCELLENT]], ['Bengal', 24, 89, 'r', [EXCELLENT]], ['Yangtze plain', 30.5, 115, 'r', [EXCELLENT]],
    ['Java', -7.3, 110.5, 'v', [EXCELLENT]], ['Mekong delta', 10.5, 105.5, 'r', [EXCELLENT]], ['Guangdong (watered)', 23, 113, 'w', [EXCELLENT]],
    ['Paris Basin', 48.5, 2.5, '', [GOOD]], ['Iowa', 42, -93.5, '', [GOOD]], ['Ukraine', 49, 32, '', [GOOD]], ['England', 52, -1, '', [GOOD]], ['Po Valley', 45, 10, 'r', [GOOD, EXCELLENT]],
    ['Sicily', 37.5, 14, '', [GOOD]], ['Andalusia', 37.5, -5, '', [GOOD]], ['Tuscany', 43.5, 11, '', [GOOD]], ['Galilee (a 1° block half the Jordan’s desert)', 32.8, 35.5, '', [POOR, FAIR, GOOD]], ['Morocco Atlantic', 33, -7, '', [FAIR, GOOD]],
    ['Perth wheatbelt', -31.5, 117, 's', [POOR, FAIR]], ['Aleppo (dry margin)', 36.2, 37, '', [POOR, FAIR]], ['Sahel (Niger)', 13, 2, 's', [POOR, FAIR]],
    ['Sahara', 24, 10, '', [BARREN]], ['North Siberia', 70, 100, '', [BARREN, POOR]],
];
const CLASS_WORDS = ['barren', 'poor', 'fair', 'good', 'excellent'];
// (C3) how many people a km² the land could feed, pre-industrial (every technique on, on its ground as above) — the river
// plains watered or renewed densest (Roman Egypt's valley ~150–200; Bengal, Jiangnan and Java before modern fertiliser
// 150–300); the breadbaskets' one good harvest a year next (France ~1700 ~35 a km² overall, its good farmland ~50–60);
// the rainforests on leached ground thin — shifting cultivation, a field cropped two or three years in ten to twenty
// (Ruthenberg's cultivation intensity ~10–25 %; Allan's critical densities): pre-Columbian Amazonia ~1–2 a km² overall,
// the Congo basin and Borneo's interior a few to ~10; the dry margins and the steppe thinner still (the Sahel's millet
// farmers and herders ~1–10 before the 20th century). Bengal here by rain alone — its floods not counted
export const PEOPLE_PLACES = [
    ['Nile, Egypt', 26.5, 31.5, 'w', [100, 400]], ['Bengal', 24, 89, 'r', [60, 400]], ['Yangtze plain', 30.5, 115, 'r', [80, 400]], ['Java', -7.3, 110.5, 'v', [80, 400]],
    ['Paris Basin', 48.5, 2.5, '', [25, 90]], ['England', 52, -1, '', [20, 90]], ['Ukraine', 49, 32, '', [20, 90]], ['Iowa', 42, -93.5, '', [20, 90]],
    ['Amazon', -3, -60, '', [1, 15]], ['Congo', 0, 22, '', [1, 15]], ['Borneo', 1, 114, '', [1, 15]], ['Guinea coast', 6, -9, '', [1, 20]],
    ['New Guinea highlands', -6, 145, '', [5, 100]], ['Sahel (Niger)', 13, 2, 's', [1, 25]], ['Mongolia', 47, 103, '', [0.3, 5]],
];

/** Each place's climate part (the mean of the land cells within a degree of it), or null without the data. */
export function earthFarming() {
    const dir = dataDir();
    if (!dir) return null;
    const read = f => { const b = fs.readFileSync(path.join(dir, f)); return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); };
    const T = read('t2m.f32'), P = read('precip.f32'), W = 360, H = 180, N = W * H;
    const T12 = new Float64Array(12), P12 = new Float64Array(12), s = newSeason(), cv = newCover(), cs = {}, y = new Float64Array(2 * CROPS.length), work = cropWork();
    const field = { rain: new Float32Array(N).fill(NaN), warm: new Float32Array(N).fill(NaN), black: new Float32Array(N), leach: new Float32Array(N), podzol: new Float32Array(N), pasture: new Float32Array(N) };
    for (let k = 0; k < y.length; k++) field[`y${k}`] = new Float32Array(N);
    for (let g = 0; g < N; g++) {
        let ok = true;
        for (let m = 0; m < 12; m++) { T12[m] = T[m * N + g]; P12[m] = P[m * N + g]; if (!(T12[m] === T12[m]) || !(P12[m] === P12[m])) ok = false; }
        if (!ok) continue;
        growingSeason(T12, P12, s);
        landCover(T12, P12, cv, undefined, undefined, 89.5 - Math.floor(g / W));
        climateSoil(cv, cs);
        field.rain[g] = s.rain; field.warm[g] = s.warm; field.black[g] = cs.black; field.leach[g] = cs.leach; field.podzol[g] = cs.podzol;
        cropYields(T12, s, y, undefined, work);
        for (let k = 0; k < y.length; k++) field[`y${k}`][g] = y[k];
        field.pasture[g] = pastureOf(cv);
    }
    const at = (la, lo) => {
        const v = Object.fromEntries(Object.keys(field).map(k => [k, 0]));
        let k = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const y = Math.min(H - 1, Math.max(0, Math.floor(90 - la) + dy)), x = ((Math.floor(lo + 180) + dx) % W + W) % W, g = y * W + x;
            if (field.rain[g] === field.rain[g]) { for (const key in v) v[key] += field[key][g]; k++; }
        }
        if (!k) return null;
        for (const key in v) v[key] /= k;
        return v;
    };
    // (and the land's share whose rain-fed season would grow a crop — Ramankutty et al.'s suitable land is ~30–40 % of
    // the ice-free land; cropland ~12 %)
    let land = 0, crop = 0;
    for (let g = 0; g < N; g++) if (field.rain[g] === field.rain[g]) { const a = Math.cos((89.5 - Math.floor(g / W)) * Math.PI / 180); land += a; crop += a * seasonYield(field.rain[g]); }
    // (C2: each staple place's staple, on middling ground — or river silt, watered — with every technique on)
    const ALL = { flood: true, canal: true, terrace: true, raised: true };
    const stapleAt = (la, lo, ground) => {
        const v = at(la, lo);
        if (!v) return null;
        // (the soil as farmCells makes it: the parent material, leaching less where floods or ash renew the ground)
        const silt = ground === 'w' || ground === 'r', parent = silt ? 1 : ground === 'v' ? 0.9 : ground === 's' ? 0.4 : 0.7, renew = silt ? 0.85 : ground === 'v' ? 0.8 : 0;
        const soil = Math.min(1, parent * (1 - 0.6 * v.leach * (1 - renew)) * (1 + 0.3 * v.black) * (1 - 0.4 * v.podzol));
        const p = { soil, rain: v.rain, warm: v.warm, flood: ground === 'w' ? 1 : 0, canal: ground === 'w' ? 1 : 0, slope: 0, wetland: 0 };
        return { ...farmPlace(p, Array.from({ length: 2 * CROPS.length }, (_, k) => v[`y${k}`]), v.pasture, ALL), v, p };
    };
    const staple = Object.fromEntries(Object.entries(STAPLE_PLACES).map(([k, list]) => [k, list.map(([n, la, lo, g, alt]) => [n, stapleAt(la, lo, g), alt ?? []])]));
    const farmland = FARMLAND_PLACES.map(([n, la, lo, g, ok]) => [n, stapleAt(la, lo, g), ok]);
    const people = PEOPLE_PLACES.map(([n, la, lo, g, range]) => { const r = stapleAt(la, lo, g); return [n, r && peopleAt(r, r.p, ALL), range, r]; });
    return { places: Object.fromEntries(Object.entries(PLACES).map(([k, { at: list }]) => [k, list.map(([n, la, lo]) => [n, at(la, lo)])])), staple, farmland, people, seasonShare: crop / land };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const res = earthFarming();
    if (!res) { console.log('No Earth reference climate: run node tuning/climate/fetch-references.mjs first'); process.exit(0); }
    let bad = 0, all = 0;
    for (const [k, list] of Object.entries(res.places)) {
        console.log(`── ${PLACES[k].words} ──`);
        for (const [n, v] of list) {
            all++;
            const ok = v && PLACES[k].test(v);
            if (!ok) bad++;
            console.log(`  ${ok ? 'ok  ' : 'OFF '} ${n.padEnd(24)} ${v ? `rain ${v.rain.toFixed(1)} · warm ${v.warm.toFixed(1)} mo · black ${v.black.toFixed(2)} · leach ${v.leach.toFixed(2)} · podzol ${v.podzol.toFixed(2)}` : 'no land'}`);
        }
    }
    for (const [k, list] of Object.entries(res.staple)) {
        console.log(`── staple: ${STAPLE_WORDS[k]} ──`);
        for (const [n, r, alt] of list) {
            all++;
            const ok = r && (r.staple === Number(k) || alt.includes(r.staple));
            if (!ok) bad++;
            const ys = r ? CROPS.map((c, i) => `${c} ${r.v[`y${2 * i}`].toFixed(2)}/${r.v[`y${2 * i + 1}`].toFixed(2)}`).join(' ') : '';
            console.log(`  ${ok ? 'ok  ' : 'OFF '} ${n.padEnd(24)} ${r ? `${STAPLE_WORDS[r.staple]} (${r.score.toFixed(2)}; then ${STAPLE_WORDS[r.second]}) · ${ys} · pasture ${r.v.pasture.toFixed(2)}` : 'no land'}`);
        }
    }
    console.log('── farmland: good against excellent (harvests a year) ──');
    for (const [n, r, ok] of res.farmland) {
        all++;
        const cls = r ? farmClass(r.tech) : -1, good = ok.includes(cls);
        if (!good) bad++;
        console.log(`  ${good ? 'ok  ' : 'OFF '} ${n.padEnd(24)} ${r ? `${CLASS_WORDS[cls]} (${r.tech.toFixed(2)}; by rain ${CLASS_WORDS[farmClass(r.rain)]}) · ${r.harvests.toFixed(1)} harvests of ${STAPLE_WORDS[r.staple === Staple.HERDING ? r.second : r.staple].toLowerCase()} · seasonality ${r.v.seasonality?.toFixed?.(2) ?? '–'}` : 'no land'} · want ${ok.map(c => CLASS_WORDS[c]).join(' or ')}`);
    }
    console.log('── people a km² the land could feed, pre-industrial ──');
    for (const [n, ppl, [lo, hi], r] of res.people) {
        all++;
        const good = ppl >= lo && ppl <= hi;
        if (!good) bad++;
        console.log(`  ${good ? 'ok  ' : 'OFF '} ${n.padEnd(24)} ${r ? `${ppl.toFixed(1)} a km² · ${STAPLE_WORDS[r.staple]}, ${r.harvests.toFixed(1)} harvests · soil ${r.p.soil.toFixed(2)} · leach ${r.v.leach.toFixed(2)}` : 'no land'} · want ${lo}–${hi}`);
    }
    console.log(`\nThe land's rain-fed season, as a crop's yield: ${(100 * res.seasonShare).toFixed(0)} % of the land's (Earth's suitable land ~30–40 %)`);
    console.log(`${all - bad} of ${all} places as they should be`);
    process.exitCode = bad ? 1 : 0;
}
