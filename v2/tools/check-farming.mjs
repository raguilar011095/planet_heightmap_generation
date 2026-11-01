// Headless checks for the Food tab (plans/V2_FARMING_PLAN.md), phase by phase.
// C1 — farmland, soil and growing season on a finished moment: the same at two details; each part where it belongs
// (river silt and loess rich, granite poor, the wet tropics leached; mountains farmed only with terraces; deserts only
// with water brought, and then only by the rivers); the growing season by climate; quick.
// C2 — staples: the same at two details; each where its climate puts it (rice on rich wet monsoon lowland, wheat and
// barley in the cool-season climates, maize and millet in the warm summer-rain ones, roots on the leached tropics,
// herding on the steppes); a watered desert grows wheat and barley, not rice.
// C3 — people: how many the land could feed, plausible and the same at two details; quick on the page.
// C6b — staple food and lifestyle (farming/living.js): the same at two details; farming on the good farmland; gatherers
// where nothing would be farmed or herded, as many a km² as the ethnographic record's foragers, the sea's fish richer on
// cold coasts than on warm ones; little land uninhabited; herders still on the cold steppes; the land's people plausible;
// quick on the page. (The spread of crops — C4 — is on branch `farming-spread`; the real crops on branch `crops`.)
// F1 (plans/V2_FOOD_PLAN.md) — the harvest month: every farming place has one, the same at two details; the hemispheres
// mirror each other; the ever-wet tropics harvest all year; quick on the page.
// F2 — ways of life and animals (farming/living.js foodSystem, farming/beasts.js): the same at two details; the fly belt in
// the tropics' lowlands and never in deserts, and inside it no cattle, horses or buffalo and no plough; hoe farming only
// where no plough beast lives; paddy farming is paddy grains; irrigated valleys dry by rain; settled foragers by rich fish;
// each beast where its climate puts it; quick on the page.
// F3a — the history's ground (farming/history.js): the hearth odds in two bands and never poleward or in deserts, the same
// pattern at two details; each wild ancestor's range the same at two details; each landmass's luck the same at two details,
// near its odds over many re-rolls, Fewer gaps giving more; tree crops where the wet tropics are; quick.
// F3b — hearths and the spread (farming/hearths.js): the same run for the same roll, another for a re-roll; ~8 hearths, never
// more than 12, spread evenly (none near another), none poleward of 50°, sitting in high odds; 2–4 founders far apart; farming over most of the land it can grow on by 10,000
// years but not at once; much the same at two details; quick.
// Usage: node v2/tools/check-farming.mjs

import { check, section, finish, labMesh } from './lib/check-kit.mjs';
import { simulate } from '../js/tectonics/simulate.js';
import { TERRAIN_SCENES } from '../js/tectonics/scenarios/terrain-scenes.js';
import { terrainConfig } from '../js/terrain/terrain-config.js';
import { GEO_FRAME_FIELDS } from '../js/tectonics/model/geology.js';
import { TerrainPool, FRAME_FIELDS } from '../js/terrain/terrain-pool.js';
import { finishPlanet, finishRaster } from '../js/finish/finish.js';
import { landPeople } from '../js/farming/people.js';
import { gatherGround, gatherAt, livingPlace, livingPeople, partsOf, Lifestyle, LIFESTYLE_WORDS, GATHER, foodSystem, FoodSystem, FOOD_SYSTEM_WORDS, measuresAt, hasMeasures, paddyOf } from '../js/farming/living.js';
import { beastPlace, newBeasts, Beast, BEAST_WORDS, BEASTS } from '../js/farming/beasts.js';
import { historyGround, historyLuck, ARCHETYPES, oddsRank, HISTORY } from '../js/farming/history.js';
import { hearthRegions, runHearths, HEARTHS } from '../js/farming/hearths.js';
import { cameOf, cameAt, placesOf, waysOf, flyAtOf, peopleFromLog, decLog, namesOf, strainsOf, minorOf, minorAgeOf } from '../js/evolution/farming-store.js';
import { ARRIVE_NEVER as NEVER_B, arriveByte, rankStrains } from '../js/farming/minor.js';
import { FARMING } from '../js/farming/farming-config.js';
import { KOPPEN_ID } from '../js/climate/koppen.js';
import { farmPlace, farmClass, harvestsAt, SoilKind, SoilMod, Staple, STAPLES, STAPLE_WORDS, CROPS, MONTH_ALL_YEAR, hasMonths } from '../js/farming/farming.js';
import { placeMonth, calendarGround, calendarMonth } from '../js/farming/calendar.js';

const SEED = 12345, SIM = 20000, UNTIL = 400;
const mesh = labMesh(SIM), scene = TERRAIN_SCENES.find(s => s.id === 'cycle');
const mean = a => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const ALL = { flood: true, canal: true, terrace: true, raised: true }, NONE = { flood: false, canal: false, terrace: false, raised: false };

// the Evolution page's history (scene 'cycle'), its geological record kept; its last moment, finished at two details
const world = scene.build(mesh, SEED, { continentalFraction: 0.3 });
world.config.heights = terrainConfig({});
world.config.geology.records = true;
let last = null;
simulate(world, { untilMyr: UNTIL, drive: w => scene.drive(w), snapshotEveryMyr: 10, keepFrames: false, onFrame: f => { last = f; } });
const frame = Object.fromEntries([...FRAME_FIELDS, ...GEO_FRAME_FIELDS].map(k => [k, last[k]]));
frame.plates = last.plates.map(p => p && { quat: p.quat });
const pool = await TerrainPool.create(mesh);
const finishAt = cells => finishPlanet({ frame, simMesh: mesh, seed: SEED, cells, pool });
const fine = await finishAt(640000), coarse = await finishAt(160000);
pool.terminate();

/** Per land cell of a finish: its parts, its farmland by rain alone and with every technique, its Köppen class. */
function cellsOf(out) {
    const { ocean, farming: F, climate: { cell: { koppen } } } = out, list = [], e = new Float64Array(2 * CROPS.length);
    for (let c = 0; c < ocean.length; c++) {
        if (ocean[c] || !koppen[c] || koppen[c] === KOPPEN_ID.EF) continue;
        const p = { soil: F.soil[c] / 255, rain: F.rain[c] / 20, warm: F.warm[c] / 20, flood: F.flood[c] / 255, canal: F.canal[c] / 255, slope: 2 * F.slope[c], wetland: F.wetland[c] / 255 };
        harvestsAt(F.crops, c, e);
        const r = farmPlace(p, e, F.pasture[c] / 255, NONE, {}), t = farmPlace(p, e, F.pasture[c] / 255, ALL, {}), s = t;
        const lat = Math.abs(Math.asin(Math.max(-1, Math.min(1, out.mesh.xyz[3 * c + 2])))) * 180 / Math.PI;
        list.push({ c, p, kind: F.kind[c] & 15, mod: F.kind[c] >> 4, koppen: koppen[c], rain: r.rain, tech: t.tech, water: t.water, z: out.z[c], staple: s.staple, harvests: t.harvests, harvestsRain: r.harvestsRain, lat });
    }
    return list;
}
const A = cellsOf(fine), B = cellsOf(coarse);
const shareOf = (list, f) => list.filter(f).length / Math.max(1, list.length);
const good = v => farmClass(v) >= 3;

section('C1 — the same at 160K and 640K cells');
{
    const words = (a, b) => `160K ${(100 * b).toFixed(1)} % · 640K ${(100 * a).toFixed(1)} %`;
    const gT = [shareOf(A, x => good(x.tech)), shareOf(B, x => good(x.tech))], gR = [shareOf(A, x => good(x.rain)), shareOf(B, x => good(x.rain))];
    check('good or prime farmland (every technique): within 5 points', Math.abs(gT[0] - gT[1]) <= 0.05, words(...gT));
    check('…by rain alone: within 5 points', Math.abs(gR[0] - gR[1]) <= 0.05, words(...gR));
    const rich = [shareOf(A, x => x.p.soil >= 0.75), shareOf(B, x => x.p.soil >= 0.75)];
    check('rich soil: within 5 points', Math.abs(rich[0] - rich[1]) <= 0.05, words(...rich));
    const steep = [shareOf(A, x => x.p.slope >= 25), shareOf(B, x => x.p.slope >= 25)];
    check('hill and mountain ground (≥ 25 m per km): within 6 points', Math.abs(steep[0] - steep[1]) <= 0.06, words(...steep));
    const sA = mean(A.map(x => x.p.rain)), sB = mean(B.map(x => x.p.rain));
    check('the growing season by rain: its mean within half a month', Math.abs(sA - sB) <= 0.5, `160K ${sB.toFixed(2)} · 640K ${sA.toFixed(2)} months`);
    console.log(`      (640K: good or prime ${(100 * gT[0]).toFixed(0)} % of the land with every technique, ${(100 * gR[0]).toFixed(0)} % by rain; rich soil ${(100 * rich[0]).toFixed(0)} %)`);
}

section('C1 — each part where it belongs');
{
    const soilBy = k => mean(A.filter(x => x.kind === k).map(x => x.p.soil)), n = k => A.filter(x => x.kind === k).length;
    check('river silt and loess are rich soil (mean ≥ 0.7)', soilBy(SoilKind.PLAIN) >= 0.7 && (n(SoilKind.LOESS) < 30 || soilBy(SoilKind.LOESS) >= 0.7),
        `river silt ${soilBy(SoilKind.PLAIN).toFixed(2)} (${n(SoilKind.PLAIN)} cells) · loess ${soilBy(SoilKind.LOESS).toFixed(2)} (${n(SoilKind.LOESS)})`);
    check('…granite, gneiss and shields poor (mean ≤ 0.35)', soilBy(SoilKind.GRANITE) <= 0.35, `${soilBy(SoilKind.GRANITE).toFixed(2)} (${n(SoilKind.GRANITE)} cells)`);
    const leached = A.filter(x => x.mod === SoilMod.LEACHED), black = A.filter(x => x.mod === SoilMod.BLACK);
    check('the wet tropics\' old ground is leached: poorer than black earth (where both are)', leached.length < 30 || black.length < 30 || mean(leached.map(x => x.p.soil)) < mean(black.map(x => x.p.soil)) - 0.15,
        `leached ${mean(leached.map(x => x.p.soil)).toFixed(2)} (${leached.length} cells) · black earth ${mean(black.map(x => x.p.soil)).toFixed(2)} (${black.length})`);
    const tropic = A.filter(x => x.koppen === KOPPEN_ID.Af || x.koppen === KOPPEN_ID.Am), polar = A.filter(x => x.koppen === KOPPEN_ID.ET);
    check('the growing season: ≥ 9 months in the rainforest climates (Af, Am)', tropic.length < 30 || mean(tropic.map(x => x.p.rain)) >= 9, `${mean(tropic.map(x => x.p.rain)).toFixed(1)} months (${tropic.length} cells)`);
    check('…and ≤ 2 in the tundra (ET)', polar.length < 30 || mean(polar.map(x => x.p.rain)) <= 2, `${mean(polar.map(x => x.p.rain)).toFixed(1)} months (${polar.length} cells)`);
    const desert = A.filter(x => x.koppen === KOPPEN_ID.BWh || x.koppen === KOPPEN_ID.BWk);
    check('deserts: barren by rain alone (mean farmland ≤ 0.08)', desert.length < 30 || mean(desert.map(x => x.rain)) <= 0.08, `${mean(desert.map(x => x.rain)).toFixed(3)} (${desert.length} cells)`);
    const watered = desert.filter(x => x.water >= 0.5);
    check('…but where water is brought, farmed (mean ≥ 0.35) — and that only along the rivers (≤ 20 % of the desert)',
        desert.length < 30 || (watered.length >= 5 && mean(watered.map(x => x.tech)) >= 0.35 && watered.length / desert.length <= 0.2),
        `${mean(watered.map(x => x.tech)).toFixed(2)} over ${watered.length} watered cells (${(100 * watered.length / Math.max(1, desert.length)).toFixed(1)} % of the desert)`);
    const steep = A.filter(x => x.p.slope >= 40 && x.p.rain >= 5);
    check('steep ground with a good season: little by the plough (≤ 0.15), more with terraces', steep.length < 30 || (mean(steep.map(x => x.rain)) <= 0.15 && mean(steep.map(x => x.tech)) >= mean(steep.map(x => x.rain)) + 0.1),
        `by the plough ${mean(steep.map(x => x.rain)).toFixed(2)}, terraced ${mean(steep.map(x => x.tech)).toFixed(2)} (${steep.length} cells)`);
}

section('C2 — staples: the same at 160K and 640K cells');
{
    const share = (list, k) => shareOf(list, x => x.staple === k), all = [Staple.NONE, Staple.RICE, Staple.WHEAT, Staple.MAIZE, Staple.ROOTS, Staple.HERDING, Staple.TREES];
    const worst = Math.max(...all.map(k => Math.abs(share(A, k) - share(B, k))));
    check('each staple\'s share of the land within 5 points', worst <= 0.05, all.map(k => `${STAPLE_WORDS[k]} ${(100 * share(B, k)).toFixed(0)}/${(100 * share(A, k)).toFixed(0)} %`).join(' · '));
}

section('C2 — each staple where its climate puts it');
{
    const K = KOPPEN_ID, mostly = (list, k) => shareOf(list.filter(x => x.staple), x => x.staple === k), words = (list, k) => `${(100 * mostly(list, k)).toFixed(0)} % of ${list.filter(x => x.staple).length} cells`;
    // (the monsoon's own climates — Am, Cwa; a humid subtropical summer, Cfa, is often too short of standing water for a
    // paddy by rain: Korea's rice, the North China plain's wheat and millet)
    const monsoon = A.filter(x => [K.Am, K.Cwa].includes(x.koppen) && x.p.soil >= 0.75 && x.p.slope < 8 && x.p.rain >= 6);
    check('rice on rich, flat, wet monsoon lowland (Am, Cwa; ≥ 50 %)', monsoon.length < 30 || mostly(monsoon, Staple.RICE) >= 0.5, words(monsoon, Staple.RICE));
    const cool = A.filter(x => [K.Csa, K.Csb, K.Cfb, K.Dfb, K.Dsb].includes(x.koppen));
    check('wheat and barley in the cool-season climates (Cs, Cfb, Dfb; ≥ 50 %)', cool.length < 30 || mostly(cool, Staple.WHEAT) >= 0.5, words(cool, Staple.WHEAT));
    const warmDry = A.filter(x => [K.BSh, K.Aw].includes(x.koppen) && x.p.soil < 0.75);
    check('maize and millet in the hot summer-rain country (BSh, Aw; ≥ 40 %)', warmDry.length < 30 || mostly(warmDry, Staple.MAIZE) >= 0.4, words(warmDry, Staple.MAIZE));
    console.log(`      BSh, Aw: ${[Staple.RICE, Staple.WHEAT, Staple.MAIZE, Staple.ROOTS, Staple.HERDING, Staple.TREES].map(k => `${STAPLE_WORDS[k]} ${(100 * mostly(warmDry, k)).toFixed(0)} %`).join(' · ')}`);
    const leached = A.filter(x => x.mod === SoilMod.LEACHED);
    check('roots and tubers on the wet tropics\' leached ground (≥ 50 %)', leached.length < 30 || mostly(leached, Staple.ROOTS) >= 0.5, words(leached, Staple.ROOTS));
    const steppe = A.filter(x => x.koppen === K.BSk && x.water < 0.2);
    check('herding on the cold steppes (BSk, away from rivers; ≥ 50 %)', steppe.length < 30 || mostly(steppe, Staple.HERDING) >= 0.5, words(steppe, Staple.HERDING));
    // (the watered deserts: grain, not herds — wheat and barley where the winter is cool and dry (Egypt's, Mesopotamia's:
    // tuning/farming/earth-farming.mjs holds those), sorghum and millet where a little summer rain falls (Nubia's); never
    // rice, too thirsty for a desert river's share)
    const oasis = A.filter(x => (x.koppen === K.BWh || x.koppen === K.BWk) && x.water >= 0.5);
    const mix = list => [1, 2, 3, 4, 5].map(k => `${STAPLE_WORDS[k]} ${(100 * mostly(list, k)).toFixed(0)} %`).join(' · ');
    check('a watered desert grows grain, not herds (wheat, maize or millet ≥ 70 %)', oasis.length < 30 || mostly(oasis, Staple.WHEAT) + mostly(oasis, Staple.MAIZE) >= 0.7, `${oasis.length} cells: ${mix(oasis)}`);
    check('…and never rice (≤ 5 %)', oasis.length < 30 || mostly(oasis, Staple.RICE) <= 0.05, `${(100 * mostly(oasis, Staple.RICE)).toFixed(1)} %`);
}

section('C2 — harvests: one sure one a year makes good land; two or three, off renewed ground, excellent');
{
    const K = KOPPEN_ID, excellent = A.filter(x => farmClass(x.tech) === 4), share = excellent.length / A.length;
    // (Earth: ~12 % of cropland is cropped more than once a year — 1–2 % of the land; with every technique, a generator's
    // world a little more)
    check('excellent land is rare: 0.5–8 % of the land with every technique', share >= 0.005 && share <= 0.08, `${(100 * share).toFixed(1)} %`);
    check('…on renewed ground (soil ≥ 0.6) — ≥ 85 % of it', excellent.length < 30 || shareOf(excellent, x => x.p.soil >= 0.6) >= 0.85, `${(100 * shareOf(excellent, x => x.p.soil >= 0.6)).toFixed(0)} % of ${excellent.length} cells`);
    check('…and warm the year through (≥ 9 months warm enough) — ≥ 85 %', excellent.length < 30 || shareOf(excellent, x => x.p.warm >= 9) >= 0.85, `${(100 * shareOf(excellent, x => x.p.warm >= 9)).toFixed(0)} %`);
    const med = A.filter(x => (x.koppen === K.Csa || x.koppen === K.Csb) && x.p.slope < 12);
    check('the Mediterranean\'s lowlands farm by rain (mostly good or fair) and hardly ever excellent (≤ 4 %: its wettest edges on river silt, a summer crop after the winter wheat)',
        med.length < 30 || (shareOf(med, x => farmClass(x.rain) === 2 || farmClass(x.rain) === 3) >= 0.6 && shareOf(med, x => farmClass(x.rain) === 4) <= 0.04),
        `${med.length} cells: by rain ${[4, 3, 2, 1, 0].map(k => `${['barren', 'poor', 'fair', 'good', 'excellent'][k]} ${(100 * shareOf(med, x => farmClass(x.rain) === k)).toFixed(0)} %`).join(' · ')}`);
    const temperate = A.filter(x => (x.koppen === K.Cfb || x.koppen === K.Dfa || x.koppen === K.Dfb) && x.p.slope < 12 && x.p.soil >= 0.6);
    check('temperate plains on good soil: one harvest — good, seldom excellent (≤ 5 %)', temperate.length < 30 || (shareOf(temperate, x => farmClass(x.tech) === 3) >= 0.5 && shareOf(temperate, x => farmClass(x.tech) === 4) <= 0.05),
        `${temperate.length} cells: good ${(100 * shareOf(temperate, x => farmClass(x.tech) === 3)).toFixed(0)} %, excellent ${(100 * shareOf(temperate, x => farmClass(x.tech) === 4)).toFixed(0)} %`);
}

// (the page's way for C3 and C4: the finished picture, then the people and the spread on it — at both details)
const pic = out => finishRaster(out.mesh, out.z, out.ocean, 2048, null, out.lake, out.lakeLevel, out.climate.cell, out.geology, out.farming);
const pf = pic(fine), pc = pic(coarse);

section('C3 — people');
{
    const t0 = performance.now(), fineCount = landPeople(pf.farming, pf.climate, ALL), ms = performance.now() - t0;
    const coarseCount = landPeople(pc.farming, pc.climate, ALL);
    console.log(`      640K: the land could feed ${(fineCount.people / 1e6).toFixed(0)} million (${(fineCount.people / fineCount.land).toFixed(1)} a km²)`);
    const ppl = fineCount.people / fineCount.land, pplC = coarseCount.people / coarseCount.land;
    check('the land could feed 10–40 people a km² on average (pre-industrial Earth\'s potential ~20–30), the same at 160K (within 15 %)', ppl >= 10 && ppl <= 40 && Math.abs(ppl - pplC) <= 0.15 * ppl, `640K ${ppl.toFixed(1)} · 160K ${pplC.toFixed(1)}`);
    check('…worked out quickly on the page (≤ 1.5 s)', ms <= 1500, `${ms.toFixed(0)} ms`);
}

section('C6b — staple food and lifestyle');
{
    // (each pixel of a picture's land: its farming, what gatherers could live on, its way of life — and its Köppen class,
    // its farmland class, the sea's temperature off its coast)
    const lives = pic => {
        const F = pic.farming, L = pic.climate, out = [], t0 = performance.now(), ground = gatherGround(pic, pic === pf ? fine.climate.page : coarse.climate.page), ms = performance.now() - t0;
        const p = {}, e = new Float64Array(2 * CROPS.length), r = { scores: new Float64Array(STAPLES.length), foods: new Float64Array(STAPLES.length) }, g = {}, o = {};
        for (let y = 0; y < F.h; y += 2) for (let x = 0; x < F.w; x += 2) {
            const i = y * F.w + x;
            if (!L.koppen[i] || L.koppen[i] === KOPPEN_ID.EF) continue;
            const lat = 90 - (y + 0.5) / F.h * 180, lon = (x + 0.5) / F.w * 360 - 180;
            partsOf(F, i, p);
            farmPlace(p, harvestsAt(F.crops, i, e), F.pasture[i] / 255, ALL, r);
            gatherAt(ground, lat, lon, p, F.pasture[i] / 255, g);
            livingPlace(r, p, ALL, g, o);
            out.push({ a: Math.cos(lat * Math.PI / 180), koppen: L.koppen[i], cls: farmClass(r.tech), land: r.staple, life: o.lifestyle, staple: o.staple, people: o.people, gather: g.people, fish: g.fish, water: Math.max(p.flood, p.canal) });
        }
        return { list: out, ground, ms };
    };
    const lf = lives(pf), lc = lives(pc), area = (list, f) => list.reduce((s, x) => s + (f(x) ? x.a : 0), 0), share = (list, f, of = () => true) => area(list, x => of(x) && f(x)) / Math.max(1e-9, area(list, of));
    const lifeShares = list => [Lifestyle.NONE, Lifestyle.FARMING, Lifestyle.HERDING, Lifestyle.GATHERING].map(k => share(list, x => x.life === k));
    const sf = lifeShares(lf.list), sc = lifeShares(lc.list), worst = Math.max(...sf.map((v, k) => Math.abs(v - sc[k])));
    console.log(`      640K: ${LIFESTYLE_WORDS.map((w, k) => `${w} ${(100 * sf[k]).toFixed(1)} %`).join(' · ')}`);
    check('each way of life\'s share of the land the same at 160K and 640K (within 5 points)', worst <= 0.05, LIFESTYLE_WORDS.map((w, k) => `${w} ${(100 * sc[k]).toFixed(0)}/${(100 * sf[k]).toFixed(0)} %`).join(' · '));
    const foodF = [...STAPLES.keys()].map(k => share(lf.list, x => x.staple === k)), foodC = [...STAPLES.keys()].map(k => share(lc.list, x => x.staple === k));
    check('…and each staple food\'s (within 5 points)', Math.max(...foodF.map((v, k) => Math.abs(v - foodC[k]))) <= 0.05, STAPLE_WORDS.map((w, k) => `${w} ${(100 * foodC[k]).toFixed(0)}/${(100 * foodF[k]).toFixed(0)} %`).join(' · '));
    const good = share(lf.list, x => x.life === Lifestyle.FARMING, x => x.cls >= 3);
    check('the good and excellent farmland farmed (≥ 95 %)', good >= 0.95, `${(100 * good).toFixed(1)} %`);
    const bare = share(lf.list, x => x.life === Lifestyle.GATHERING, x => !x.land && x.gather >= GATHER.minPeople);
    check('where nothing would be farmed or herded but something lives: gatherers (all of it)', bare >= 0.999, `${(100 * bare).toFixed(1)} %`);
    const gath = lf.list.filter(x => x.life === Lifestyle.GATHERING).map(x => x.people).sort((a, b) => a - b), q = f => gath.length ? gath[Math.floor(f * (gath.length - 1))] : NaN;
    check('gatherers as many a km² as the record\'s foragers: the median 0.02–0.5, the most ≤ 3', gath.length >= 50 && q(0.5) >= 0.02 && q(0.5) <= 0.5 && gath[gath.length - 1] <= 3,
        `median ${q(0.5).toFixed(2)} · 90 % ${q(0.9).toFixed(2)} · most ${gath.at(-1)?.toFixed(2)} (${gath.length} px)`);
    // (the sea's fish off cold coasts against warm ones: the coast's land within ~60 km of a shelf, by its climate class — the
    // polar and boreal coasts, Cfb/Cfc/Csb's cool ones, against the tropical rainforest's and savanna's)
    const coastFish = cs => { const c = lf.list.filter(x => cs.includes(x.koppen) && x.fish > 0.05); return { n: c.length, m: mean(c.map(x => x.fish)) }; };
    const cold = coastFish([KOPPEN_ID.Cfb, KOPPEN_ID.Cfc, KOPPEN_ID.Csb, KOPPEN_ID.Dfb, KOPPEN_ID.Dfc]), warm = coastFish([KOPPEN_ID.Af, KOPPEN_ID.Am, KOPPEN_ID.Aw]);
    check('the sea feeds more off cool coasts than off tropical ones (their coasts\' fish ≥ 1.3×)', cold.n < 30 || warm.n < 30 || cold.m >= 1.3 * warm.m,
        `cool ${cold.m.toFixed(2)} a km² (${cold.n} px) · tropical ${warm.m.toFixed(2)} (${warm.n} px)`);
    const none = share(lf.list, x => x.life === Lifestyle.NONE);
    check('little ice-free land uninhabited (≤ 5 %)', none <= 0.05, `${(100 * none).toFixed(1)} %`);
    const steppe = share(lf.list, x => x.life === Lifestyle.HERDING, x => x.koppen === KOPPEN_ID.BSk && x.water < 0.05 && x.land === Staple.HERDING);
    check('herders still on most of the cold steppes they would graze (BSk, away from rivers: ≥ 50 %)', steppe >= 0.5, `${(100 * steppe).toFixed(0)} %`);
    const t0 = performance.now(), count = livingPeople(pf.farming, pf.climate, lf.ground, ALL), ms = performance.now() - t0, ppl = count.people / count.land;
    check('the land could feed 10–40 people a km² on average, gatherers counted', ppl >= 10 && ppl <= 40, `${ppl.toFixed(1)} a km² · by way of life ${count.byLife.map(v => `${(v / 1e6).toFixed(1)} M`).join(' / ')}`);
    check('…its sea read quickly on the page (≤ 300 ms), the land\'s people likewise (≤ 1.5 s)', lf.ms <= 300 && ms <= 1500, `${lf.ms.toFixed(0)} ms · ${ms.toFixed(0)} ms`);
}

section('F1 — the harvest month');
{
    // (each farming pixel of a picture: its own month, its neighbourhood's, its lean months and risk)
    const cal = (pic, page) => {
        const F = pic.farming, K = pic.climate, g0 = gatherGround(pic, page), p = {}, e = new Float64Array(2 * CROPS.length), r = { scores: new Float64Array(STAPLES.length), foods: new Float64Array(STAPLES.length) }, g = {}, o = {};
        const at = (x, y) => {
            const i = y * F.w + x;
            if (!K.koppen[i] || K.koppen[i] === KOPPEN_ID.EF) return null;
            const lat = 90 - (y + 0.5) / F.h * 180, lon = (x + 0.5) / F.w * 360 - 180;
            partsOf(F, i, p); farmPlace(p, harvestsAt(F.crops, i, e), F.pasture[i] / 255, ALL, r); gatherAt(g0, lat, lon, p, F.pasture[i] / 255, g); livingPlace(r, p, ALL, g, o);
            if (o.lifestyle !== Lifestyle.FARMING) return null;
            const m = placeMonth(F, i, r);
            return { i, lat, lon, m, staple: r.staple, koppen: K.koppen[i] };
        };
        const t0 = performance.now(), ground = calendarGround(F.w, F.h, (x, y) => at(x, y)?.m ?? -1), ms = performance.now() - t0, list = [];
        for (let y = 0; y < F.h; y += 2) for (let x = 0; x < F.w; x += 2) { const v = at(x, y); if (!v) continue; v.month = v.m >= 0 ? calendarMonth(ground, v.lat, v.lon, v.m) : -1; v.a = Math.cos(v.lat * Math.PI / 180); list.push(v); }
        return { list, ms };
    };
    check('the moment keeps its harvest months (both details)', hasMonths(pf.farming) && hasMonths(pc.farming), '');
    const cf = cal(pf, fine.climate.page), cc = cal(pc, coarse.climate.page), lf = cf.list.filter(v => v.month >= 0);
    const area = (l, f) => l.reduce((s, v) => s + (f(v) ? v.a : 0), 0), share = (l, f, of = () => true) => area(l, v => of(v) && f(v)) / Math.max(1e-9, area(l, of));
    check('every farming place has a harvest month (≥ 97 %)', share(cf.list, v => v.month >= 0) >= 0.97, `${(100 * share(cf.list, v => v.month >= 0)).toFixed(1)} % of ${cf.list.length} px`);
    const byI = new Map(cc.list.map(v => [v.i, v.month])), circ = (a, b) => (a === MONTH_ALL_YEAR || b === MONTH_ALL_YEAR ? (a === b ? 0 : 6) : Math.min(Math.abs(a - b), 12 - Math.abs(a - b)));
    const both = lf.filter(v => byI.has(v.i) && byI.get(v.i) >= 0), agree = share(both, v => circ(v.month, byI.get(v.i)) <= 1);
    check('the same at 160K and 640K: within a month on ≥ 75 % of the land farmed at both', agree >= 0.75, `${(100 * agree).toFixed(0)} % of ${both.length} px`);
    const wheatN = lf.filter(v => v.staple === Staple.WHEAT && v.lat >= 30 && v.lat <= 55), wheatS = lf.filter(v => v.staple === Staple.WHEAT && v.lat <= -30 && v.lat >= -55);
    const summerN = share(wheatN, v => v.month >= 4 && v.month <= 8), summerS = share(wheatS, v => v.month >= 10 || (v.month >= 0 && v.month <= 2));
    check('the hemispheres mirror each other: mid-latitude cool-season grains reaped May–Sep in the north, Nov–Mar in the south (≥ 60 % each)',
        (wheatN.length < 30 || summerN >= 0.6) && (wheatS.length < 30 || summerS >= 0.6), `north ${(100 * summerN).toFixed(0)} % (${wheatN.length} px) · south ${(100 * summerS).toFixed(0)} % (${wheatS.length} px)`);
    const wet = lf.filter(v => v.koppen === KOPPEN_ID.Af), allYear = share(wet, v => v.month === MONTH_ALL_YEAR);
    check('the ever-wet tropics (Af) harvest all year (≥ 50 %)', wet.length < 30 || allYear >= 0.5, `${(100 * allYear).toFixed(0)} % (${wet.length} px)`);
    check('…the neighbourhood read quickly on the page (≤ 1.5 s)', cf.ms <= 1500, `${cf.ms.toFixed(0)} ms`);
}

section('F2 — ways of life and animals');
{
    // (each land pixel of a picture: its way of life, its food system, its beasts, its measures)
    const ways = (pic, page, step = 2) => {
        const F = pic.farming, K = pic.climate, ground = gatherGround(pic, page), p = {}, e = new Float64Array(2 * CROPS.length), r = { scores: new Float64Array(STAPLES.length), foods: new Float64Array(STAPLES.length) };
        const g = {}, lv = {}, L = {}, bp = newBeasts(), sy = {}, out = [];
        let ms = 0;
        for (let y = 0; y < F.h; y += step) for (let x = 0; x < F.w; x += step) {
            const i = y * F.w + x;
            if (!K.koppen[i] || K.koppen[i] === KOPPEN_ID.EF) continue;
            const lat = 90 - (y + 0.5) / F.h * 180, lon = (x + 0.5) / F.w * 360 - 180;
            partsOf(F, i, p); farmPlace(p, harvestsAt(F.crops, i, e), F.pasture[i] / 255, ALL, r); gatherAt(ground, lat, lon, p, F.pasture[i] / 255, g); livingPlace(r, p, ALL, g, lv);
            const t0 = performance.now();
            measuresAt(pic, K, i, p, lat, L); L.paddy = lv.lifestyle === Lifestyle.FARMING ? paddyOf(r) : 0;
            beastPlace(L, lv.lifestyle === Lifestyle.HERDING, bp); foodSystem(r, lv, L, bp, g, sy);
            ms += performance.now() - t0;
            const keeps = lv.lifestyle === Lifestyle.FARMING || lv.lifestyle === Lifestyle.HERDING;
            out.push({ i, a: Math.cos(lat * Math.PI / 180), lat, koppen: K.koppen[i], life: lv.lifestyle, staple: r.staple, paddy: L.paddy, sys: sy.system, beast: keeps ? bp.beast : 0, fly: bp.fly, plough: bp.plough,
                elev: L.elev, T: L.T, P: L.P, arid: L.arid, et: L.et, fish: g.fish });
        }
        return { list: out, ms };
    };
    check('the moment has what the ways of life and the beasts read (its heights, its climate\'s year)', hasMeasures(pf, pf.climate) && hasMeasures(pc, pc.climate), '');
    const wf = ways(pf, fine.climate.page), wc = ways(pc, coarse.climate.page), lf = wf.list;
    const area = (l, f) => l.reduce((s, v) => s + (f(v) ? v.a : 0), 0), share = (l, f, of = () => true) => area(l, v => of(v) && f(v)) / Math.max(1e-9, area(l, of));
    const shares = (l, key, n) => Array.from({ length: n }, (_, k) => share(l, v => v[key] === k));
    const sf = shares(lf, 'sys', FOOD_SYSTEM_WORDS.length), sc = shares(wc.list, 'sys', FOOD_SYSTEM_WORDS.length);
    console.log(`      640K: ${FOOD_SYSTEM_WORDS.map((w, k) => `${w} ${(100 * sf[k]).toFixed(1)} %`).join(' · ')}`);
    check('each way of life\'s share of the land the same at 160K and 640K (within 5 points)', Math.max(...sf.map((v, k) => Math.abs(v - sc[k]))) <= 0.05, FOOD_SYSTEM_WORDS.map((w, k) => `${w} ${(100 * sc[k]).toFixed(0)}/${(100 * sf[k]).toFixed(0)} %`).join(' · '));
    const bf = shares(lf, 'beast', BEAST_WORDS.length), bc = shares(wc.list, 'beast', BEAST_WORDS.length);
    console.log(`      640K: ${BEAST_WORDS.map((w, k) => `${w} ${(100 * bf[k]).toFixed(1)} %`).join(' · ')}`);
    check('…and each leading beast\'s (within 5 points)', Math.max(...bf.map((v, k) => Math.abs(v - bc[k]))) <= 0.05, BEAST_WORDS.map((w, k) => `${w} ${(100 * bc[k]).toFixed(0)}/${(100 * bf[k]).toFixed(0)} %`).join(' · '));
    // (the fly belt: the tropics' lowlands, never the deserts — and inside it no cattle, horses or buffalo, no plough)
    const belt = lf.filter(v => v.fly >= 0.5), desert = [KOPPEN_ID.BWh, KOPPEN_ID.BWk];
    const tropic = share(belt, v => Math.abs(v.lat) <= 30), high = share(belt, v => v.elev > 1.8), dry = share(belt, v => desert.includes(v.koppen));
    check('the fly belt in the tropics (≥ 97 % within 30°), not on high ground (> 1.8 km: ≤ 1 %), never in the deserts (≤ 1 %)', belt.length >= 30 && tropic >= 0.97 && high <= 0.01 && dry <= 0.01,
        `${(100 * share(lf, v => v.fly >= 0.5)).toFixed(0)} % of the land · ${(100 * tropic).toFixed(1)} % tropical · ${(100 * high).toFixed(1)} % high · ${(100 * dry).toFixed(1)} % desert`);
    const big = [Beast.GRAZER, Beast.HORSE, Beast.BUFFALO], farmed = v => v.life === Lifestyle.FARMING;
    const noBig = share(belt, v => !big.includes(v.beast), v => v.beast > 0), byHand = share(belt, v => v.plough < 0.2, farmed);
    check('in the fly belt no cattle, horses or buffalo lead (≥ 98 %) and nobody ploughs (≥ 95 % of its farms)', noBig >= 0.98 && byHand >= 0.95, `${(100 * noBig).toFixed(1)} % · ${(100 * byHand).toFixed(1)} %`);
    const hoeOut = share(lf, v => v.sys === FoodSystem.HOE, v => farmed(v) && v.fly < 0.2);
    check('hoe farming only where no plough beast lives (out of the fly belt: ≤ 5 % of the farms)', hoeOut <= 0.05, `${(100 * hoeOut).toFixed(1)} %`);
    // (each food system where it belongs)
    const paddy = share(lf, v => v.paddy >= 0.5, v => v.sys === FoodSystem.PADDY), irr = share(lf, v => v.arid < 0.5, v => v.sys === FoodSystem.IRRIGATED);
    check('paddy farming where paddy grains lead or come close (≥ 95 %); irrigated valleys dry by rain (aridity < 0.5: ≥ 90 %)', paddy >= 0.95 && irr >= 0.9, `${(100 * paddy).toFixed(1)} % · ${(100 * irr).toFixed(1)} %`);
    const margin = share(lf, v => v.P >= 200 && v.P <= 900, v => v.sys === FoodSystem.GRAIN_HERDS), mixedWet = share(lf, v => v.arid >= 0.6, v => v.sys === FoodSystem.MIXED);
    check('grain and herds on the dry margin (200–900 mm: ≥ 90 %); mixed farms on humid land (aridity ≥ 0.6: ≥ 90 %)', margin >= 0.9 && mixedWet >= 0.9, `${(100 * margin).toFixed(1)} % · ${(100 * mixedWet).toFixed(1)} %`);
    const fishOf = s => { const l = lf.filter(v => v.sys === s); return { n: l.length, m: mean(l.map(v => v.fish)) }; }, set = fishOf(FoodSystem.SETTLED), mob = fishOf(FoodSystem.MOBILE);
    check('settled foragers by rich fish (their fish ≥ 3× mobile foragers\')', set.n < 20 || set.m >= 3 * mob.m, `settled ${set.m.toFixed(2)} a km² (${set.n} px) · mobile ${mob.m.toFixed(2)} (${mob.n} px)`);
    // (each beast where its climate puts it)
    const of = b => v => v.beast === b, dryK = [KOPPEN_ID.BWh, KOPPEN_ID.BWk, KOPPEN_ID.BSh, KOPPEN_ID.BSk];
    const camel = share(lf, v => dryK.includes(v.koppen), of(Beast.CAMEL)), deer = share(lf, v => v.et < 11.5, of(Beast.DEER)), hi = share(lf, v => v.elev >= 2.5, of(Beast.HIGHLAND)), buf = share(lf, v => v.T >= 14, of(Beast.BUFFALO));
    check('camels in the dry lands (B: ≥ 85 %), reindeer where summers are short (ET < 11.5: ≥ 90 %), the high-country beast high (≥ 2.5 km: ≥ 90 %), buffalo where it is warm (≥ 14 °C: ≥ 95 %)',
        camel >= 0.85 && deer >= 0.9 && hi >= 0.9 && buf >= 0.95, `${(100 * camel).toFixed(0)} % · ${(100 * deer).toFixed(0)} % · ${(100 * hi).toFixed(0)} % · ${(100 * buf).toFixed(0)} %`);
    const t0 = performance.now(), whole = ways(pf, fine.climate.page, 1), ms = performance.now() - t0;
    check('…quick on the page: the whole picture\'s ways of life and beasts ≤ 1.5 s', whole.ms <= 1500, `${whole.ms.toFixed(0)} ms of ${ms.toFixed(0)} ms for ${whole.list.length} px`);
}

section('F3a — the wild larder, landmasses and hearth odds');
{
    const ground = (pic, page) => { const t0 = performance.now(), G = historyGround(pic, pic.climate, pic.farming, page, gatherGround(pic, page)); return { G, ms: performance.now() - t0 }; };
    const gf = ground(pf, fine.climate.page), gc = ground(pc, coarse.climate.page), G = gf.G, N = G.w * G.h;
    check('the history\'s ground worked out quickly (≤ 1 s)', gf.ms <= 1000 && gc.ms <= 1000, `${gf.ms.toFixed(0)} ms · ${gc.ms.toFixed(0)} ms`);
    // (the hearth odds: where the top tenth of the land lies — by latitude, out of the deserts — and the pattern's agreement)
    const cells = []; for (let c = 0; c < N; c++) if (G.land[c] && G.odds[c] > 0) cells.push(c);
    const top = G.oddsSorted[Math.floor(0.9 * G.oddsSorted.length)], latOf = c => Math.abs(90 - (Math.floor(c / G.w) + 0.5) * G.deg), tops = cells.filter(c => G.odds[c] >= top);
    const share = f => tops.filter(f).length / Math.max(1, tops.length);
    const pole = share(c => latOf(c) > 45), low = share(c => latOf(c) >= 5 && latOf(c) <= 25), mid = share(c => latOf(c) > 25 && latOf(c) <= 45);
    check('hearth odds: the top tenth of the land none poleward of 45° (≤ 5 %), in two bands — 5–25° (≥ 30 %) and 25–45° (≥ 15 %)', pole <= 0.05 && low >= 0.3 && mid >= 0.15,
        `${(100 * pole).toFixed(1)} % · ${(100 * low).toFixed(0)} % · ${(100 * mid).toFixed(0)} % of ${tops.length} cells`);
    const both = cells.filter(c => gc.G.land[c]), rk = f => { const o = both.slice().sort((x, y) => f[x] - f[y]), r = new Float64Array(N); o.forEach((c, k) => { r[c] = k; }); return r; };
    const ra = rk(G.odds), rb = rk(gc.G.odds); let d2 = 0; for (const c of both) d2 += (ra[c] - rb[c]) ** 2;
    const rho = 1 - 6 * d2 / (both.length * (both.length ** 2 - 1));
    check('…the same pattern at 160K and 640K (rank correlation ≥ 0.9)', rho >= 0.9, rho.toFixed(3));
    // (each wild ancestor's range: its share of the land at the two details)
    const wildShare = (GG, a) => { let s = 0, m = 0; for (let c = 0; c < N; c++) if (GG.land[c]) { m++; if (GG.niche[a][c] >= 0.3) s++; } return s / Math.max(1, m); };
    const ws = ARCHETYPES.map((_, a) => [wildShare(G, a), wildShare(gc.G, a)]);
    check('each wild ancestor\'s range the same at 160K and 640K (within 2 points)', Math.max(...ws.map(([x, y]) => Math.abs(x - y))) <= 0.02, ARCHETYPES.map((A, a) => `${A.word} ${(100 * ws[a][1]).toFixed(1)}/${(100 * ws[a][0]).toFixed(1)} %`).join(' · '));
    // (each landmass's luck: the same at both details for the big ones; near its odds over many rolls; Fewer gaps more)
    const NB = BEASTS.length, big = GG => GG.masses.filter(m => m.area >= 1e6).sort((a, b) => b.area - a.area);
    let same = 0, all = 0;
    for (let roll = 0; roll < 10; roll++) {
        const lf = historyLuck(G, SEED, UNTIL, roll, false), lc = historyLuck(gc.G, SEED, UNTIL, roll, false), bf = big(G), bc = big(gc.G);
        for (let k = 0; k < Math.min(bf.length, bc.length); k++) { all++; let eq = lf.fly[bf[k].id] === lc.fly[bc[k].id]; for (let b = 1; b < NB; b++) eq &&= lf.has[bf[k].id * NB + b] === lc.has[bc[k].id * NB + b]; if (eq) same++; }
    }
    check('each big landmass\'s luck (over 1 M km²: its beasts, the fly) the same at 160K and 640K (≥ 90 % of draws)', all && same / all >= 0.9, `${same} of ${all}`);
    let had = 0, could = 0, hadF = 0, flies = 0, flyCould = 0;
    for (let roll = 0; roll < 40; roll++) {
        const L = historyLuck(G, SEED, UNTIL, roll, false), Lf = historyLuck(G, SEED, UNTIL, roll, true);
        for (const m of G.masses) {
            if (m.fly >= 50000) { flyCould++; flies += L.fly[m.id]; }
            for (const b of [Beast.SMALL_STOCK, Beast.PIG, Beast.DEER]) if (m.habitat[b] >= 50000) { could++; had += L.has[m.id * NB + b]; hadF += Lf.has[m.id * NB + b]; }
        }
    }
    check('luck near its odds over 40 rolls: small beasts on ~70 % of the landmasses with habitat enough (55–85 %), ~96 % with Fewer gaps (≥ 88 %); the fly on ~35 % (20–50 %)',
        could > 0 && had / could >= 0.55 && had / could <= 0.85 && hadF / could >= 0.88 && (flyCould === 0 || (flies / flyCould >= 0.2 && flies / flyCould <= 0.5)),
        `${(100 * had / could).toFixed(0)} % · ${(100 * hadF / could).toFixed(0)} % of ${could} · fly ${(100 * flies / Math.max(1, flyCould)).toFixed(0)} % of ${flyCould}`);
    // (tree crops: where the wet tropics are)
    const trees = A.filter(x => x.staple === Staple.TREES);
    const inWet = trees.filter(x => [KOPPEN_ID.Af, KOPPEN_ID.Am, KOPPEN_ID.BWh].includes(x.koppen)).length / Math.max(1, trees.length);
    check('tree and palm crops in the ever-wet and monsoon tropics or watered deserts (Af, Am, BWh: ≥ 70 % of their cells)', trees.length < 30 || inWet >= 0.7, `${(100 * inWet).toFixed(0)} % of ${trees.length} cells`);
}

section('F3b — hearths and the spread');
{
    const ground = (pic, page) => historyGround(pic, pic.climate, pic.farming, page, gatherGround(pic, page));
    const Gf = ground(pf, fine.climate.page), Gc = ground(pc, coarse.climate.page);
    const gc = (la1, lo1, la2, lo2) => { const r = Math.PI / 180; return 2 * 6371 * Math.asin(Math.sqrt(Math.sin((la2 - la1) * r / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin((lo2 - lo1) * r / 2) ** 2)); };
    const t0 = performance.now();
    const Hf = hearthRegions(Gf), run0 = runHearths(Gf, Hf, historyLuck(Gf, SEED, UNTIL, 0), SEED, UNTIL, 0), ms = performance.now() - t0;
    check('the hearths and the spread worked out quickly (≤ 1.5 s)', ms <= 1500, `${ms.toFixed(0)} ms · ${run0.events} events`);
    const sig = run => run.hearths.map(C => `${C.cell}:${C.t0.toFixed(3)}`).join('|');
    const again = runHearths(Gf, Hf, historyLuck(Gf, SEED, UNTIL, 0), SEED, UNTIL, 0), other = runHearths(Gf, Hf, historyLuck(Gf, SEED, UNTIL, 1), SEED, UNTIL, 1);
    check('the same run for the same roll; another for a re-roll', sig(again) === sig(run0) && sig(other) !== sig(run0), `${run0.hearths.length} · ${other.hearths.length} hearths`);
    const farmable = [];
    for (let c = 0; c < Gf.w * Gf.h; c++) if (Gf.land[c] && Math.max(...Gf.fit.map(q => q[c])) >= 0.25) farmable.push(c);
    const counts = [], countsC = [], poles = [], ranks = [], reach10 = [], reach1 = [], founderOk = [], nearest = [], ce = [], Hc = hearthRegions(Gc);
    let farmKm2 = 0;
    for (const c of farmable) farmKm2 += Gf.area[c];
    for (let roll = 0; roll < 8; roll++) {
        const run = roll ? runHearths(Gf, Hf, historyLuck(Gf, SEED, UNTIL, roll), SEED, UNTIL, roll) : run0;
        counts.push(run.hearths.length);
        countsC.push(runHearths(Gc, Hc, historyLuck(Gc, SEED, UNTIL, roll), SEED, UNTIL, roll).hearths.length);
        for (const C of run.hearths) { poles.push(Math.abs(C.lat) > 50 ? 1 : 0); ranks.push(oddsRank(Gf, Gf.odds[C.cell])); }
        // (how evenly: each hearth's nearest, and the Clark–Evans ratio — their mean against a random scatter's over the land crops fit)
        const nn = run.hearths.map(C => Math.min(...run.hearths.filter(D => D !== C).map(D => gc(C.lat, C.lon, D.lat, D.lon))));
        nearest.push(...nn); ce.push(mean(nn) / (0.5 / Math.sqrt(run.hearths.length / farmKm2)));
        const reach = k => farmable.filter(c => run.farmTime[c] <= k).length / farmable.length;
        reach10.push(reach(10000)); reach1.push(reach(1000));
        const F = run.centres.filter(C => C.founder);
        founderOk.push(F.length >= 2 && F.length <= 4 && F.every((p, i) => F.every((q, j) => i === j || gc(p.lat, p.lon, q.lat, q.lon) >= 3500)));
    }
    const med = l => l.slice().sort((x, y) => x - y)[l.length >> 1];
    check('~8 hearths (the mean of 8 rolls 6–10), never more than 12, none poleward of 50° (≤ 2 %), sitting in high odds (their median rank ≥ 0.8)', mean(counts) >= 6 && mean(counts) <= 10 && Math.max(...counts) <= 12 && mean(poles) <= 0.02 && med(ranks) >= 0.8,
        `${counts.join(',')} · poleward ${(100 * mean(poles)).toFixed(1)} % · odds rank ${med(ranks).toFixed(2)}`);
    check('spread evenly over the world: none within 1,500 km of another, Clark–Evans ratio ≥ 1.5 (a random scatter 1)', Math.min(...nearest) >= 1500 && mean(ce) >= 1.5,
        `nearest ${Math.min(...nearest).toFixed(0)} km (median ${med(nearest).toFixed(0)}) · ratio ${mean(ce).toFixed(2)}`);
    check('2–4 founders, each ≥ 3,500 km from the others (every roll)', founderOk.every(Boolean), founderOk.map(v => (v ? 'ok' : 'NO')).join(' '));
    check('farming over most of the land it can grow on by 10,000 years (median ≥ 85 %), not at once (by 1,000: ≤ 60 %)', med(reach10) >= 0.85 && med(reach1) <= 0.6,
        `10,000: ${reach10.map(v => (100 * v).toFixed(0)).join(',')} % · 1,000: ${reach1.map(v => (100 * v).toFixed(0)).join(',')} %`);
    check('much the same number of hearths at 160K and 640K (medians within 4)', Math.abs(med(counts) - med(countsC)) <= 4, `640K ${med(counts)} · 160K ${med(countsC)}`);
    // (rivers through dry land carry farming — developer, 2026-11-01: "rivers that are not spreading crops down them fast enough
    // … especially along rivers in deserts": the dry cells a river's watered strip crosses (a crop fits the strip, better than the
    // cell on the whole) farmed
    // by the full spread, and sooner than the old way — the cell's mean fit, the coasts' speed along every river)
    const strips = [];
    for (let c = 0; c < Gf.w * Gf.h; c++) if (Gf.land[c] && Gf.fitRun.some((f, q) => f[c] >= HEARTHS.farmFit && f[c] > Gf.fit[q][c] + 0.05)) strips.push(c);
    const Gold = historyGround(pf, pf.climate, pf.farming, fine.climate.page, gatherGround(pf, fine.climate.page), { ...HISTORY, stripFit: 0 });
    const runOld = runHearths(Gold, hearthRegions(Gold), historyLuck(Gold, SEED, UNTIL, 0), SEED, UNTIL, 0, { ...HEARTHS, river: HEARTHS.riverCoast });
    const farmedOf = run => strips.filter(c => run.farmTime[c] < Infinity).length / Math.max(1, strips.length), medT = run => med(strips.map(c => run.farmTime[c]).filter(Number.isFinite));
    check('rivers through dry land carry farming: the dry cells a river\'s strip crosses farmed (≥ 90 %), sooner than by their mean fit alone', farmedOf(run0) >= 0.9 && farmedOf(run0) >= farmedOf(runOld) && !(medT(run0) > medT(runOld)),
        `${strips.length} cells · farmed ${(100 * farmedOf(run0)).toFixed(0)} % (by their mean fit ${(100 * farmedOf(runOld)).toFixed(0)} %) · median arrival ${Math.round(medT(run0))} years (was ${Math.round(medT(runOld))})`);
}

section('F4a — as it came');
{
    // (the views' store on a picture, as the page makes it: the land's own, its full spread and 10,000 years — the default; the
    // history worked out first, so what had come is timed alone)
    const OPT = { flood: true, canal: true, terrace: true, raised: true }, TK = '1111', WK = '1111|0|0';
    const finOf = (pic, out) => ({ raster: pic, climate: { ...out.climate.page, raster: pic.climate }, seed: SEED, time: UNTIL });
    const views = (pic, out) => {
        const fin = finOf(pic, out), flyAt = flyAtOf(fin, 0, false), warm = cameOf(fin, 0, false, 5000), t0 = performance.now(), C10 = cameOf(fin, 0, false, 10000), Cf = cameOf(fin, 0, false, Infinity), tc = performance.now() - t0;
        const v = {};
        for (const [k, C] of [['best', null], ['full', Cf], ['k10', C10]]) {
            const t1 = performance.now(), Y = waysOf(fin, OPT, WK, flyAt, C, TK), P = placesOf(fin, OPT, TK, C);
            v[k] = { P, Y, ms: performance.now() - t1 };
        }
        // (each land place in the store's order: what had come there by 10,000 years)
        const F = pic.farming, K = pic.climate, masks = [], c = {};
        for (let y = 0; y < F.h; y++) for (let x = 0, i = y * F.w; x < F.w; x++, i++) {
            if (!K.koppen[i] || K.koppen[i] === KOPPEN_ID.EF) continue;
            masks.push(cameAt(C10, 90 - (y + 0.5) / F.h * 180, (x + 0.5) / F.w * 360 - 180, c).mask);
        }
        return { ...v, masks, tc };
    };
    const Vf = views(pf, fine), Vc = views(pc, coarse), n = Vf.best.P.people.length, people = (o, k) => peopleFromLog(decLog(o.P.people[k]));
    check('what had come worked out quickly (both ages ≤ 100 ms), its stores no slower than the land\'s own (≤ 1.3×)', Vf.tc <= 100 && Vf.k10.ms <= 1.3 * Vf.best.ms + 50,
        `${Vf.tc.toFixed(0)} ms · stores ${Vf.k10.ms.toFixed(0)} ms (the land's own ${Vf.best.ms.toFixed(0)} ms)`);
    let more = 0, more10 = 0;
    for (let k = 0; k < n; k++) { if (people(Vf.full, k) > people(Vf.best, k) * 1.01 + 1e-3) more++; if (people(Vf.k10, k) > people(Vf.full, k) * 1.01 + 1e-3) more10++; }
    check('as it came never feeds many more than the land\'s own, nor 10,000 years more than the full spread (≤ 1 % of places: another staple)', more <= 0.01 * n && more10 <= 0.01 * n,
        `full > best at ${(100 * more / n).toFixed(2)} % · 10k > full at ${(100 * more10 / n).toFixed(2)} %`);
    // (where no crop had come, no crop staple; where no plough beast had, no plough; no leading beast that had not come)
    const NCROP = CROPS.length, cropBits = (1 << NCROP) - 1, beastBit = b => 1 << (NCROP + b - 1), plough = beastBit(Beast.GRAZER) | beastBit(Beast.HORSE) | beastBit(Beast.BUFFALO);
    const CROP_ST = new Set([Staple.RICE, Staple.WHEAT, Staple.MAIZE, Staple.ROOTS, Staple.TREES].filter(v => v !== undefined));
    const PLOUGHED = new Set([FoodSystem.PLOUGH_FLOCKS, FoodSystem.MIXED, FoodSystem.PADDY]);
    let noCrop = 0, noCropBad = 0, noPlough = 0, noPloughBad = 0, beastBad = 0, kept = 0;
    for (let k = 0; k < n; k++) {
        const m = Vf.masks[k], P = Vf.k10.P, Y = Vf.k10.Y;
        if (!(m & cropBits)) { noCrop++; if (CROP_ST.has(P.staple[k] & 15)) noCropBad++; }
        if ((P.life[k] & 15) === Lifestyle.FARMING && !(m & plough)) { noPlough++; if (PLOUGHED.has(Y.way[k] & 15)) noPloughBad++; }
        const b = Y.beast[k] & 15;
        if (Y.flags[k] & 1 && b) { kept++; if (!(m & beastBit(b))) beastBad++; }
    }
    check('where no crop had come, no crop is the staple (≥ 99.9 %)', noCropBad <= 0.001 * Math.max(1, noCrop), `${noCrop} places without a crop · ${noCropBad} with one as staple`);
    check('where no plough beast had come, no farmers plough (no plough & flocks, mixed farms or paddies: ≥ 99 %)', noPloughBad <= 0.01 * Math.max(1, noPlough), `${noPlough} farming places without · ${noPloughBad} ploughing`);
    check('no leading beast that had not come', beastBad === 0, `${kept} places with a leading beast · ${beastBad} not come`);
    // (as it came differs from the land's own — the beasts at least — and looks much the same at 160K and 640K)
    const shares = V => { const N = V.Y.way.length, sys = new Float64Array(16), be = new Float64Array(16), life = new Float64Array(4); for (let k = 0; k < N; k++) { sys[V.Y.way[k] & 15]++; be[V.Y.flags[k] & 1 ? V.Y.beast[k] & 15 : 0]++; life[V.P.life[k] & 15]++; } return { sys: [...sys].map(v => v / N), be: [...be].map(v => v / N), life: [...life].map(v => v / N) }; };
    const Sb = shares(Vf.best), S10 = shares(Vf.k10), S10c = shares(Vc.k10), gap = (a, b) => Math.max(...a.map((v, k) => Math.abs(v - b[k])));
    check('as it came differs from the land\'s own (a leading beast\'s share by ≥ 2 points)', gap(S10.be, Sb.be) >= 0.02, `largest beast gap ${(100 * gap(S10.be, Sb.be)).toFixed(1)} points`);
    check('as it came, much the same at 160K and 640K (each way of life, food system and leading beast within 5 points)', gap(S10.life, S10c.life) <= 0.05 && gap(S10.sys, S10c.sys) <= 0.05 && gap(S10.be, S10c.be) <= 0.05,
        `lifestyle ${(100 * gap(S10.life, S10c.life)).toFixed(1)} · system ${(100 * gap(S10.sys, S10c.sys)).toFixed(1)} · beast ${(100 * gap(S10.be, S10c.be)).toFixed(1)} points`);
}

section('F5 — named strains, their ranks, the crops beyond the staples');
{
    const finOf = (pic, out) => ({ raster: pic, climate: { ...out.climate.page, raster: pic.climate }, seed: SEED, time: UNTIL });
    const run = (pic, out) => {
        const fin = finOf(pic, out), t0 = performance.now(), N = namesOf(fin, 0, false), t1 = performance.now(), S = strainsOf(fin, 0, false, 10000), t2 = performance.now(), M = minorOf(fin, 0, false), A = minorAgeOf(M, 10000), t3 = performance.now();
        return { fin, N, S, M, A, ms: { names: t1 - t0, strains: t2 - t1, minor: t3 - t2 } };
    };
    const Rf = run(pf, fine), Rc = run(pc, coarse);
    check('every strain named; the names, the strains\' spreads and the crops built quickly (strains ≤ 2.5 s, crops ≤ 2 s)', Rf.N.strains.every(x => x.label) && Rf.ms.strains <= 2500 && Rf.ms.minor <= 2000,
        `${Rf.N.strains.length} strains · names ${Rf.ms.names.toFixed(0)} ms (with the history) · strains ${Rf.ms.strains.toFixed(0)} ms · crops ${Rf.ms.minor.toFixed(0)} ms`);
    // (the ranks: the main crop is the first come among those that grow, unless a later one does far better — e^(Δt / lateYears))
    const { SP, Gm, R } = Rf.S, ab = arriveByte(10000);
    let cells = 0, bad = 0, seconds = 0, same = 0, groupCells = 0, mixed = 0;
    for (let c = 0; c < Gm.N; c++) {
        const m = R.crop[0][c];
        if (m < 0) continue;
        cells++;
        if (R.crop[1][c] >= 0) seconds++;
        // (the ranks: different groups)
        const ga = [0, 1, 2].map(r => (R.crop[r][c] >= 0 ? SP.strains[R.crop[r][c]].a : -1 - r));
        if (ga[0] === ga[1] || ga[0] === ga[2] || ga[1] === ga[2]) same++;
        // (each group there: at most three varieties, its main the best of them — the first come unless one far better)
        for (const Gr of rankStrains(SP, Gm, c, ab, false, FARMING.lateYears)) {
            groupCells++;
            if (Gr.strains.length > 1) mixed++;
            if (Gr.strains.length > 3 || Gr.strains.some(x => x.score > Gr.strains[0].score * 1.0001)) bad++;
        }
    }
    check('each crop group at a place: at most three varieties, its main the best of them (the first come, or one far better)', bad === 0, `${groupCells} group-places · ${bad} not so`);
    check('the main, 2nd and 3rd crops different groups; most places with a crop grow a second group (≥ 50 %)', same === 0 && seconds >= 0.5 * cells, `${same} cells with a group twice · ${(100 * seconds / Math.max(1, cells)).toFixed(0)} % with a second`);
    check('more than one variety of a group at most places it grows (≥ 50 %)', mixed >= 0.5 * groupCells, `${(100 * mixed / Math.max(1, groupCells)).toFixed(0)} % mixed`);
    // (the crops beyond the staples: many grown, a farming place growing dozens, much the same at two details)
    const varietyMean = X => { let s = 0, n = 0; for (let c = 0; c < X.M.Gm.N; c++) if (X.M.Gm.land[c] && X.M.farm[c] <= 10000) { s += X.A.variety[c]; n++; } return s / Math.max(1, n); };
    const grown = Rf.M.built.filter(b => b.exists).length, vf = varietyMean(Rf), vc = varietyMean(Rc);
    check('most of the catalogue grown on a world (≥ 60 %), a farming place growing dozens of crops (mean 15–90)', grown >= 0.6 * Rf.M.items.length && vf >= 15 && vf <= 90, `${grown} of ${Rf.M.items.length} grown · ${vf.toFixed(1)} crops a farming place`);
    check('the crops much the same at 160K and 640K (a place\'s mean variety within 15 %)', Math.abs(vf - vc) <= 0.15 * Math.max(vf, vc), `640K ${vf.toFixed(1)} · 160K ${vc.toFixed(1)}`);
    // (the tree, vine and resin spices stay near home: none farther than ~900 km — the first home's cell's distance, along the
    // grid, bounded; the seed and root spices and the herbs travel as gardens do — minor.js MINOR's move)
    let far = 0;
    const gcKm = (c1, c2) => { const la1 = 90 - ((c1 / Gm.w | 0) + 0.5), lo1 = c1 % Gm.w - 179.5, la2 = 90 - ((c2 / Gm.w | 0) + 0.5), lo2 = c2 % Gm.w - 179.5, r = Math.PI / 180; return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(Math.sin((la2 - la1) * r / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin((lo2 - lo1) * r / 2) ** 2))); };
    for (const I of Rf.M.items) {
        const B = Rf.M.built[I.id];
        if (I.move !== 'spice' || !B.exists) continue;
        for (let c = 0; c < Gm.N; c++) if (B.arrive[c] < NEVER_B && Math.min(...B.homes.map(h => gcKm(h.cell, c))) > 1100) { far++; break; }
    }
    check('the tree, vine and resin spices stay near their homes (none past ~1,100 km)', far === 0, `${far} spices farther`);
    // (and each kind of niche's crops on a share of the farmed land in keeping with how they travel: the tree spices few, the
    // garden spices and herbs, the pulses and the vegetables many — no kind of niche all on one place, nor everywhere)
    const shareOf = (X, I) => X.A.share[I.id];
    const med = (arr) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : 0; };
    const byMove = mv => med(Rf.M.items.filter(I => Rf.M.built[I.id].exists && I.move === mv).map(I => shareOf(Rf, I)));
    const tree = byMove('spice'), garden = byMove('garden'), widest = Math.max(...Rf.M.items.filter(I => Rf.M.built[I.id].exists).map(I => shareOf(Rf, I)));
    check('the crops\' reach in keeping with how they travel: the garden crops (herbs and seed spices among them) median ≥ 3 × the tree spices\', none on over 40 % of the land at 10,000 years', garden >= 3 * tree && widest <= 0.4,
        `garden ${(100 * garden).toFixed(1)} % · tree spices ${(100 * tree).toFixed(1)} % · the widest ${(100 * widest).toFixed(0)} %`);
}

section('C1 — quick');
{
    const total = Object.values(fine.ms).reduce((a, b) => a + b, 0);
    check('the farming stage ≤ 4 % of the finish', fine.ms.farming <= 0.04 * total, `${(fine.ms.farming / 1000).toFixed(2)} s of ${(total / 1000).toFixed(1)} s`);
}

finish('Farming');
