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
import { growingSeason, climateSoil, newSeason, seasonYield, cropYields, cropWork, pastureOf, farmPlace, farmClass, Staple, STAPLE_WORDS, STAPLE_CROP, CROPS, MONTH_ALL_YEAR } from '../../v2/js/farming/farming.js';
import { landCover, newCover } from '../../v2/js/finish/finish-cover.js';
import { peopleAt } from '../../v2/js/farming/people.js';
import { gatherAt, livingPlace, foodSystem, paddyOf, FoodSystem, FOOD_SYSTEM_WORDS, Lifestyle } from '../../v2/js/farming/living.js';
import { beastPlace, newBeasts, landMeasures, Beast, BEAST_WORDS } from '../../v2/js/farming/beasts.js';
import { monthlyStats } from '../../v2/js/climate/cell-stats.js';
import { classifyCell } from '../../v2/js/climate/koppen.js';
import { cropWild } from '../../v2/js/farming/larder.js';

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
    [Staple.ROOTS]: [['Congo', 0, 22], ['Amazon', -3, -60], ['Titicaca (potatoes)', -16, -69.5, '', [Staple.HERDING, Staple.WHEAT]], ['New Guinea highlands', -6, 145, '', [Staple.TREES]]],
    [Staple.HERDING]: [['Mongolia', 47, 103], ['Kazakh steppe', 48, 68], ['Patagonia', -45, -69], ['Tibet', 33, 88], ['Horn of Africa', 8, 46], ['North Siberia (reindeer)', 70, 100]],
    [Staple.NONE]: [['Sahara', 24, 10], ['Rub al Khali', 21, 50], ['Taklamakan', 39, 83]],
    // (F3: tree and palm crops — bananas by Lake Victoria, sago in lowland New Guinea, date palms in the watered oases)
    [Staple.TREES]: [['Buganda (bananas)', 0.3, 32.5, '', [Staple.ROOTS, Staple.MAIZE]], ['Sepik (sago; with raised fields, maize too)', -4, 142.5, 'm', [Staple.ROOTS, Staple.MAIZE]], ['Basra (dates)', 30.5, 47.8, 'w', [Staple.WHEAT, Staple.RICE]],
        ['Tafilalt (dates)', 31.3, -4.3, 'w', [Staple.WHEAT]], ['Kharga oasis (dates)', 25.4, 30.5, 'w', [Staple.WHEAT]]],
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
const LIFE = ['uninhabited', 'farming', 'herding', 'gathering'];
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

// (F1) each place's harvest month — its leading crop's, by rain or (on watered ground) watered — as farmers there bring it in
// (0 January … 11 December; MONTH_ALL_YEAR where it is taken as each field ripens): the winter grains of the Northern
// Hemisphere's breadbaskets in summer, of the watered deserts and the Punjab in spring, the Southern Hemisphere's at its own
// summer's start; the monsoon's rice and the Sahel's millet as its rains end; the ever-wet tropics' roots all year
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const HARVEST_PLACES = [
    // [name, lat, lon, ground, the months accepted: the real harvest a month either side, (a known miss: why)]
    ['Ukraine (wheat; Jul–Aug)', 49, 32, '', [5, 6, 7, 8]], ['Paris Basin (wheat; Jul–Aug)', 48.5, 2.5, '', [5, 6, 7, 8]], ['England (wheat; Aug)', 52, -1, '', [6, 7, 8]],
    ['Iowa (maize; Sep–Oct)', 42, -93.5, '', [7, 8, 9, 10]], ['Punjab (watered wheat; Apr)', 31, 74, 'w', [2, 3, 4]], ['Nile, Egypt (watered wheat; Apr–May)', 26.5, 31.5, 'w', [2, 3, 4, 5]],
    ['Mesopotamia (watered wheat; Apr–May)', 32.5, 44.5, 'w', [2, 3, 4, 5]], ['Bengal (rice; aus Aug, aman Nov–Dec)', 24, 89, 'r', [6, 7, 8, 9, 10, 11, 0]], ['Kyushu (rice; Oct)', 33, 131, 'v', [8, 9, 10]],
    ['Java (rice; all year, main Feb–Apr)', -7.3, 110.5, 'v', [MONTH_ALL_YEAR, 0, 1, 2, 3, 4]], ['Sahel, Niger (millet; Sep–Oct)', 13, 2, '', [7, 8, 9, 10]],
    ['Mexico valley (maize Oct–Nov; wheat Aug)', 19.5, -99, 'v', [6, 7, 8, 9, 10, 11]], ['Perth wheatbelt (wheat; Oct–Dec)', -31.5, 117, '', [8, 9, 10, 11, 0]], ['Congo (roots; all year)', 0, 22, '', [MONTH_ALL_YEAR]],
    ['Ethiopian highlands (meher harvest Oct–Dec)', 9, 38.7, '', [8, 9, 10, 11, 0], 'two rainy seasons: the model sows at the short belg rains (Mar), so it reaps in Jun; farmers sow the main crop at the kiremt rains (Jun–Jul)'],
];

/** Each place's climate part (the mean of the land cells within a degree of it), or null without the data. */
// (F2) each place's food system and leading beast, best possible (no history yet: every beast wherever it could be kept),
// on its ground as above, its height (km) and how rugged it is (0…1) given — the 1° climate has no heights — and the fly:
// Earth's lives in Africa alone (its landmass's luck; the climate says where in Africa)
const FS = FoodSystem, BE = Beast;
export const SYSTEM_PLACES = [
    // [name, lat, lon, ground, km, rugged, the food systems accepted]
    ['Bengal', 24, 89, 'r', 0.01, 0, [FS.PADDY]], ['Yangtze plain', 30.5, 115, 'r', 0.02, 0, [FS.PADDY]], ['Java', -7.3, 110.5, 'v', 0.1, 0.3, [FS.PADDY]], ['Mekong delta', 10.5, 105.5, 'r', 0, 0, [FS.PADDY]],
    ['Nile, Egypt', 26.5, 31.5, 'w', 0.08, 0, [FS.IRRIGATED]], ['Mesopotamia', 32.5, 44.5, 'w', 0.03, 0, [FS.IRRIGATED]], ['Indus, Sindh', 26, 68.5, 'w', 0.05, 0, [FS.IRRIGATED]],
    ['Anatolia', 39, 33, '', 1.0, 0.5, [FS.PLOUGH_FLOCKS, FS.GRAIN_HERDS]], ['Andalusia', 37.5, -5, '', 0.2, 0.3, [FS.PLOUGH_FLOCKS]], ['Thessaly', 39.5, 22.3, '', 0.1, 0.3, [FS.PLOUGH_FLOCKS]],
    ['Aleppo', 36.2, 37.2, '', 0.4, 0.2, [FS.PLOUGH_FLOCKS, FS.GRAIN_HERDS]],
    ['Paris Basin', 48.5, 2.5, '', 0.1, 0.1, [FS.MIXED]], ['England', 52, -1, '', 0.1, 0.2, [FS.MIXED]], ['Central Germany', 51, 10, '', 0.3, 0.4, [FS.MIXED]], ['Iowa', 42, -93.5, '', 0.3, 0, [FS.MIXED]],
    ['Ukraine', 49, 32, '', 0.15, 0, [FS.MIXED, FS.PLOUGH_FLOCKS]],
    ['Nigeria, Middle Belt', 9, 8, '', 0.4, 0.2, [FS.HOE]], ['Central African Rep.', 6, 20, '', 0.5, 0.1, [FS.HOE, FS.FOREST]], ['Zambia', -13, 28, '', 1.2, 0.1, [FS.HOE]],
    ['Congo', 0, 22, '', 0.4, 0.1, [FS.FOREST]], ['Amazon', -3, -60, '', 0.05, 0, [FS.FOREST]], ['Borneo', 1, 114, '', 0.1, 0.3, [FS.FOREST, FS.PADDY]],
    ['Cusco, Andes', -13.5, -72, '', 3.4, 0.8, [FS.HIGHLAND]], ['Ethiopian highlands', 9, 38.7, '', 2.4, 0.6, [FS.HIGHLAND]], ['Mexico valley', 19.5, -99, 'v', 2.24, 0.3, [FS.HIGHLAND]],
    ['New Guinea highlands', -6, 145, '', 1.8, 0.8, [FS.HIGHLAND]],
    ['Sahel, Niger', 13, 2, '', 0.25, 0, [FS.GRAIN_HERDS]], ['Kordofan', 13, 30, '', 0.6, 0, [FS.GRAIN_HERDS, FS.NOMADIC]], ['Deccan', 17, 76, '', 0.5, 0.2, [FS.GRAIN_HERDS, FS.PLOUGH_FLOCKS]],
    ['Mongolia', 47, 103, '', 1.5, 0.3, [FS.NOMADIC]], ['Kazakh steppe', 48, 68, '', 0.3, 0, [FS.NOMADIC]], ['Horn of Africa', 8, 46, '', 0.6, 0.1, [FS.NOMADIC]], ['Tibet', 33, 88, '', 4.8, 0.5, [FS.NOMADIC]],
    ['Patagonia', -45, -69, '', 0.5, 0.2, [FS.NOMADIC]],
    ['Nunavut', 65, -95, '', 0.2, 0.1, [FS.MOBILE, FS.NOMADIC]], ['Central Australia', -24, 133, '', 0.6, 0.1, [FS.MOBILE, FS.NOMADIC]],
];
export const BEAST_PLACES = [
    // [name, lat, lon, ground, km, rugged, the leading beasts accepted]
    ['Paris Basin', 48.5, 2.5, '', 0.1, 0.1, [BE.GRAZER]], ['Ukraine', 49, 32, '', 0.15, 0, [BE.GRAZER, BE.HORSE]], ['Iowa', 42, -93.5, '', 0.3, 0, [BE.GRAZER]], ['Pampas', -34.5, -61, '', 0.05, 0, [BE.GRAZER]],
    ['Punjab', 31, 74, 'w', 0.2, 0, [BE.GRAZER, BE.BUFFALO]],
    ['Anatolia', 39, 33, '', 1.0, 0.5, [BE.SMALL_STOCK, BE.GRAZER]], ['Zagros', 34, 47, '', 1.5, 0.8, [BE.SMALL_STOCK]], ['High Atlas', 31.5, -7, '', 1.5, 0.8, [BE.SMALL_STOCK]],
    ['Kazakh steppe', 48, 68, '', 0.3, 0, [BE.HORSE, BE.SMALL_STOCK]], ['Mongolia', 47, 103, '', 1.5, 0.3, [BE.HORSE, BE.SMALL_STOCK]],
    ['Najd, Arabia', 25, 45, '', 0.7, 0.1, [BE.CAMEL]], ['Somalia', 8, 46, '', 0.6, 0.1, [BE.CAMEL]], ['Gobi', 43, 105, '', 1.2, 0.2, [BE.CAMEL, BE.HORSE]], ['Aïr, Niger', 17, 8, '', 0.5, 0.3, [BE.CAMEL]],
    ['Tibet', 33, 88, '', 4.8, 0.5, [BE.HIGHLAND]], ['Altiplano', -17, -68, '', 3.9, 0.4, [BE.HIGHLAND]],
    ['North Siberia', 70, 100, '', 0.1, 0.1, [BE.DEER]], ['Lapland', 68, 25, '', 0.3, 0.2, [BE.DEER]],
    ['Congo', 0, 22, '', 0.4, 0.1, [BE.PIG, BE.SMALL_STOCK]], ['New Guinea highlands', -6, 145, '', 1.8, 0.8, [BE.PIG]],
    ['Bengal', 24, 89, 'r', 0.01, 0, [BE.BUFFALO]], ['Yangtze plain', 30.5, 115, 'r', 0.02, 0, [BE.BUFFALO]], ['Mekong delta', 10.5, 105.5, 'r', 0, 0, [BE.BUFFALO]], ['Java', -7.3, 110.5, 'v', 0.1, 0.3, [BE.BUFFALO]],
];
// [name, lat, lon, km, in the fly belt (true) or out of it]
// (F3) each place's wild ancestors: the archetypes whose wild niche should be ≥ 0.3 there — Earth's homes of wild wheat and
// barley, rice, millet, sorghum, teosinte, the potato, yams, bananas — and ≤ 0.15 where they are not (index in CROPS: rice 0,
// wheat 1, maize 2, roots 3, trees 4); [name, lat, lon, ground, km, relief (km), at home, not at home]
export const LARDER_PLACES = [
    ['Zagros foothills (wild wheat, barley)', 35, 45.5, '', 0.9, 1.2, [1], [0, 4]], ['Upper Jordan (wild wheat, barley)', 33, 35.6, '', 0.3, 0.9, [1], [0, 4]], ['SE Anatolia (wild einkorn)', 37.5, 39, '', 0.7, 1.0, [1], [0, 4]],
    ['Ganges plain (wild rice)', 25, 85, 'r', 0.06, 0.1, [0], [1]], ['Pearl River (wild rice)', 23, 113, 'r', 0.05, 0.4, [0], [1]],
    ['Yellow River loess (wild millet)', 35, 110, '', 0.9, 0.8, [2], [4]], ['Sudan savanna (wild sorghum)', 11.5, 25, '', 0.6, 0.3, [2], [1]], ['Balsas valley (teosinte)', 18.3, -100.5, '', 0.8, 1.5, [2], [1]],
    ['Altiplano (wild potato)', -15.5, -70, '', 3.9, 1.0, [3], [0, 4]], ['Yam belt, Togo (wild yams)', 8, 1, '', 0.2, 0.3, [3], [1]],
    ['New Guinea lowlands (wild bananas, sago)', -5, 141, '', 0.1, 0.3, [4], [1]],
    ['Paris Basin', 48.5, 2.5, '', 0.1, 0.2, [], [0, 1, 4]], ['Congo', 0, 22, '', 0.4, 0.2, [], [1]], ['Mongolia', 47, 103, '', 1.5, 0.8, [], [0, 3, 4]],
];
export const FLY_PLACES = [['Nigeria, Middle Belt', 9, 8, 0.4, true], ['Central African Rep.', 6, 20, 0.5, true], ['Zambia', -13, 28, 1.2, true], ['Congo', 0, 22, 0.4, true],
    ['Ethiopian highlands', 9, 38.7, 2.4, false], ['Sahel, Niger', 14.5, 2, 0.25, false], ['Kenya highlands', -1, 37, 1.8, false], ['Highveld', -26.5, 28, 1.6, false], ['Karoo', -32, 22, 1.0, false]];
const inAfrica = (la, lo) => la > -36 && la < 36 && lo > -18 && lo < 52 && !(la > 12 && lo > 42);

export function earthFarming() {
    const dir = dataDir();
    if (!dir) return null;
    const read = f => { const b = fs.readFileSync(path.join(dir, f)); return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); };
    const T = read('t2m.f32'), P = read('precip.f32'), W = 360, H = 180, N = W * H;
    const T12 = new Float64Array(12), P12 = new Float64Array(12), s = newSeason(), cv = newCover(), cs = {}, y = new Float64Array(2 * CROPS.length), work = cropWork(), ms = {};
    const field = { rain: new Float32Array(N).fill(NaN), warm: new Float32Array(N).fill(NaN), black: new Float32Array(N), leach: new Float32Array(N), podzol: new Float32Array(N), pasture: new Float32Array(N),
        T: new Float32Array(N), P: new Float32Array(N), tRange: new Float32Array(N), arid: new Float32Array(N), seas: new Float32Array(N), tree: new Float32Array(N), ws: new Float32Array(N), maxP: new Float32Array(N) };
    // (F2: each cell's Köppen class — the nearest of the 3 × 3 kept, a class is not averaged)
    const koppen = new Uint8Array(N);
    for (let k = 0; k < y.length; k++) field[`y${k}`] = new Float32Array(N);
    // (each cell's harvest months, by group, by rain and watered — kept apart from the fields averaged: a month is not averaged)
    const months = new Int8Array(N * y.length).fill(-1), mo = new Int8Array(y.length);
    for (let g = 0; g < N; g++) {
        let ok = true;
        for (let m = 0; m < 12; m++) { T12[m] = T[m * N + g]; P12[m] = P[m * N + g]; if (!(T12[m] === T12[m]) || !(P12[m] === P12[m])) ok = false; }
        if (!ok) continue;
        growingSeason(T12, P12, s);
        landCover(T12, P12, cv, undefined, undefined, 89.5 - Math.floor(g / W));
        climateSoil(cv, cs);
        field.rain[g] = s.rain; field.warm[g] = s.warm; field.black[g] = cs.black; field.leach[g] = cs.leach; field.podzol[g] = cs.podzol;
        cropYields(T12, s, y, undefined, work, mo);
        for (let k = 0; k < y.length; k++) { field[`y${k}`][g] = y[k]; months[g * y.length + k] = mo[k]; }
        field.pasture[g] = pastureOf(cv);
        monthlyStats(T12, P12, (89.5 - Math.floor(g / W)) * Math.PI / 180, ms);
        field.T[g] = T12.reduce((a, b) => a + b, 0) / 12; field.P[g] = P12.reduce((a, b) => a + Math.max(0, b), 0); field.tRange[g] = ms.tRange; field.arid[g] = ms.aridity; field.seas[g] = ms.rainSeason; field.tree[g] = cv.tree;
        // (F3: the winter half's share of the rain — October to March in the north — and the wettest month's)
        { const north = Math.floor(g / W) < 90; let win = 0, yr = 0, mx = 0; for (let m = 0; m < 12; m++) { const pm = Math.max(0, P12[m]); yr += pm; if ((m >= 9 || m <= 2) === north) win += pm; if (pm > mx) mx = pm; } field.ws[g] = yr > 0 ? win / yr : 0.5; field.maxP[g] = mx; }
        koppen[g] = classifyCell(T, P, g, N);
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
        // (and a marsh ('m'): waterlogged flats — the Sepik's sago swamps)
        const p = { soil, rain: v.rain, warm: v.warm, flood: ground === 'w' ? 1 : 0, canal: ground === 'w' ? 1 : 0, slope: 0, wetland: ground === 'm' ? 0.8 : 0 };
        return { ...farmPlace(p, Array.from({ length: 2 * CROPS.length }, (_, k) => v[`y${k}`]), v.pasture, ALL, { scores: new Float64Array(STAPLE_WORDS.length), foods: new Float64Array(STAPLE_WORDS.length) }), v, p };
    };
    const staple = Object.fromEntries(Object.entries(STAPLE_PLACES).map(([k, list]) => [k, list.map(([n, la, lo, g, alt]) => [n, stapleAt(la, lo, g), alt ?? []])]));
    const farmland = FARMLAND_PLACES.map(([n, la, lo, g, ok]) => [n, stapleAt(la, lo, g), ok]);
    const people = PEOPLE_PLACES.map(([n, la, lo, g, range]) => { const r = stapleAt(la, lo, g); return [n, r && peopleAt(r, r.p, ALL), range, r]; });
    // (F1: the leading crop's month at the place's own cell — watered where water brought makes most of its harvest)
    const harvest = HARVEST_PLACES.map(([n, la, lo, ground, ok, known]) => {
        const r = stapleAt(la, lo, ground);
        if (!r) return [n, null, ok, known];
        const grp = STAPLE_CROP[r.staple] >= 0 ? STAPLE_CROP[r.staple] : STAPLE_CROP[r.second] ?? -1, gc = Math.min(H - 1, Math.max(0, Math.floor(90 - la))) * W + ((Math.floor(lo + 180) % W) + W) % W;
        if (grp < 0) return [n, { r, month: -1 }, ok, known];
        const watered = r.water >= 0.3 && r.harvests > r.harvestsRain + 0.15, m = months[gc * y.length + 2 * grp + (watered ? 1 : 0)];
        return [n, { r, month: m >= 0 ? m : months[gc * y.length + 2 * grp + (watered ? 0 : 1)], watered }, ok, known];
    });
    // (F2: a place's measures, beasts and food system — from its 3 × 3 cells' mean climate, its own cell's class)
    const ownCell = (la, lo) => Math.min(H - 1, Math.max(0, Math.floor(90 - la))) * W + ((Math.floor(lo + 180) % W) + W) % W;
    const measures = (la, lo, km, rugged, v, p) => landMeasures({ T: v.T, Tw: v.T + v.tRange / 2, Tc: v.T - v.tRange / 2, P: v.P, arid: v.arid, seas: v.seas, elev: km, tree: v.tree, hill: rugged, lat: la,
        flood: p.flood, wetland: p.wetland, canal: p.canal, koppen: koppen[ownCell(la, lo)], flyHere: inAfrica(la, lo) ? 1 : 0 });
    const lifeAt = (la, lo, ground, km, rugged) => {
        const r = stapleAt(la, lo, ground);
        if (!r) return null;
        // (a river's plain by rain: its floods, not its canals — for the buffalo's wallows)
        if (ground === 'r') { r.p.flood = 0.6; r.p.wetland = 0.3; }
        const L = measures(la, lo, km, rugged, r.v, r.p), g = gatherAt(null, la, lo, r.p, r.v.pasture, {}), lv = livingPlace(r, r.p, ALL, g, {});
        L.paddy = lv.lifestyle === Lifestyle.FARMING ? paddyOf(r) : 0;
        const bp = beastPlace(L, lv.lifestyle === Lifestyle.HERDING, newBeasts()), sy = foodSystem(r, lv, L, bp, g, {});
        return { r, L, lv, bp, sy };
    };
    const systems = SYSTEM_PLACES.map(([n, la, lo, ground, km, rugged, ok]) => [n, lifeAt(la, lo, ground, km, rugged), ok]);
    const beasts = BEAST_PLACES.map(([n, la, lo, ground, km, rugged, ok]) => [n, lifeAt(la, lo, ground, km, rugged), ok]);
    const fly = FLY_PLACES.map(([n, la, lo, km, inside]) => [n, lifeAt(la, lo, '', km, 0.2), inside]);
    // (F3: each place's wild larder, from its 3 × 3 cells' climate and its own height and relief)
    const larder = LARDER_PLACES.map(([n, la, lo, ground, km, relief, home, not]) => {
        const r = stapleAt(la, lo, ground);
        if (!r) return [n, null, home, not];
        if (ground === 'r') { r.p.flood = 0.6; r.p.wetland = 0.3; }
        const M = measures(la, lo, km, 0, r.v, r.p);
        M.ws = r.v.ws; M.maxP = r.v.maxP; M.dry = Math.max(0, r.v.warm - r.v.rain); M.relief = relief;
        return [n, cropWild(M, new Float64Array(CROPS.length)), home, not];
    });
    return { places: Object.fromEntries(Object.entries(PLACES).map(([k, { at: list }]) => [k, list.map(([n, la, lo]) => [n, at(la, lo)])])), staple, farmland, people, harvest, systems, beasts, fly, larder, seasonShare: crop / land };
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
    console.log('── harvest month (F1): the leading crop’s, by rain or watered ──');
    const mw = m => (m === MONTH_ALL_YEAR ? 'all year' : m >= 0 ? MONTHS[m] : 'none');
    for (const [n, h, ok, known] of res.harvest) {
        const good = h && ok.includes(h.month);
        if (!known) { all++; if (!good) bad++; }
        console.log(`  ${good ? 'ok  ' : known ? 'KNOWN' : 'OFF '} ${n.padEnd(44)} ${h ? `${mw(h.month)} · ${STAPLE_WORDS[h.r.staple]}${h.watered ? ', watered' : ''}` : 'no land'} · want ${ok.map(mw).join(' or ')}${known && !good ? ` — known: ${known}` : ''}`);
    }
    console.log('── food systems (F2), best possible ──');
    const why = h => `${STAPLE_WORDS[h.r.staple]} · plough ${h.bp.plough.toFixed(2)} · fly ${h.bp.fly.toFixed(2)} · ET ${h.L.et.toFixed(1)} · arid ${h.L.arid.toFixed(2)} · Tc ${h.L.Tc.toFixed(0)}`;
    for (const [n, h, ok] of res.systems) {
        all++;
        const good = h && ok.includes(h.sy.system);
        if (!good) bad++;
        console.log(`  ${good ? 'ok  ' : 'OFF '} ${n.padEnd(24)} ${h ? `${FOOD_SYSTEM_WORDS[h.sy.system]}${h.sy.second ? ` (and ${FOOD_SYSTEM_WORDS[h.sy.second].toLowerCase()})` : ''} · ${why(h)}` : 'no land'} · want ${ok.map(k => FOOD_SYSTEM_WORDS[k]).join(' or ')}`);
    }
    console.log('── leading beast (F2), best possible ──');
    for (const [n, h, ok] of res.beasts) {
        all++;
        const good = h && ok.includes(h.bp.beast);
        if (!good) bad++;
        const top = h ? [...h.bp.rank].map((v, b) => [v, b]).filter(([v]) => v > 0).sort((a, b) => b[0] - a[0]).slice(0, 3).map(([v, b]) => `${BEAST_WORDS[b]} ${v.toFixed(2)}`).join(', ') : '';
        console.log(`  ${good ? 'ok  ' : 'OFF '} ${n.padEnd(24)} ${h ? `${BEAST_WORDS[h.bp.beast]} (${top}) · ${LIFE[h.lv.lifestyle]}` : 'no land'} · want ${ok.map(k => BEAST_WORDS[k]).join(' or ')}`);
    }
    console.log('── the fly belt (F2): in Africa\'s hot wet-season woodland, not on its highlands or dry margins ──');
    for (const [n, h, inside] of res.fly) {
        all++;
        const good = h && (inside ? h.bp.fly >= 0.5 : h.bp.fly <= 0.3);
        if (!good) bad++;
        console.log(`  ${good ? 'ok  ' : 'OFF '} ${n.padEnd(24)} ${h ? `fly ${h.bp.fly.toFixed(2)} · T ${h.L.T.toFixed(1)} · warmest ${h.L.Tw.toFixed(1)} · coldest ${h.L.Tc.toFixed(1)} · ${h.L.P.toFixed(0)} mm · trees ${h.L.tree.toFixed(2)}` : 'no land'} · want ${inside ? '≥ 0.5' : '≤ 0.3'}`);
    }
    console.log('── the wild larder (F3): where each crop archetype\'s wild ancestor grows ──');
    for (const [n, w, home, not] of res.larder) {
        all++;
        const good = w && home.every(a => w[a] >= 0.3) && not.every(a => w[a] <= 0.15);
        if (!good) bad++;
        console.log(`  ${good ? 'ok  ' : 'OFF '} ${n.padEnd(42)} ${w ? CROPS.map((c, a) => `${c} ${w[a].toFixed(2)}`).join(' · ') : 'no land'} · want ${home.map(a => CROPS[a]).join(', ') || '—'} ≥ 0.3, ${not.map(a => CROPS[a]).join(', ')} ≤ 0.15`);
    }
    console.log(`\nThe land's rain-fed season, as a crop's yield: ${(100 * res.seasonShare).toFixed(0)} % of the land's (Earth's suitable land ~30–40 %)`);
    console.log(`${all - bad} of ${all} places as they should be`);
    process.exitCode = bad ? 1 : 0;
}
