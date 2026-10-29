// Headless checks for the Farming tab (plans/V2_FARMING_PLAN.md), phase by phase.
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
// Usage: node v2/tools/check-farming.mjs

import { check, section, finish, labMesh } from './lib/check-kit.mjs';
import { simulate } from '../js/tectonics/simulate.js';
import { TERRAIN_SCENES } from '../js/tectonics/scenarios/terrain-scenes.js';
import { terrainConfig } from '../js/terrain/terrain-config.js';
import { GEO_FRAME_FIELDS } from '../js/tectonics/model/geology.js';
import { TerrainPool, FRAME_FIELDS } from '../js/terrain/terrain-pool.js';
import { finishPlanet, finishRaster } from '../js/finish/finish.js';
import { landPeople } from '../js/farming/people.js';
import { gatherGround, gatherAt, livingPlace, livingPeople, partsOf, Lifestyle, LIFESTYLE_WORDS, GATHER } from '../js/farming/living.js';
import { KOPPEN_ID } from '../js/climate/koppen.js';
import { farmPlace, farmClass, harvestsAt, SoilKind, SoilMod, Staple, STAPLES, STAPLE_WORDS, CROPS } from '../js/farming/farming.js';

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
    const share = (list, k) => shareOf(list, x => x.staple === k), all = [Staple.NONE, Staple.RICE, Staple.WHEAT, Staple.MAIZE, Staple.ROOTS, Staple.HERDING];
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

section('C1 — quick');
{
    const total = Object.values(fine.ms).reduce((a, b) => a + b, 0);
    check('the farming stage ≤ 4 % of the finish', fine.ms.farming <= 0.04 * total, `${(fine.ms.farming / 1000).toFixed(2)} s of ${(total / 1000).toFixed(1)} s`);
}

finish('Farming');
