// Headless checks for the Farming tab (plans/V2_FARMING_PLAN.md), phase by phase.
// C1 — farmland, soil and growing season on a finished moment: the same at two details; each part where it belongs
// (river silt and loess rich, granite poor, the wet tropics leached; mountains farmed only with terraces; deserts only
// with water brought, and then only by the rivers); the growing season by climate; quick.
// C2 — staples: the same at two details; each where its climate puts it (rice on rich wet monsoon lowland, wheat and
// barley in the cool-season climates, maize and millet in the warm summer-rain ones, roots on the leached tropics,
// herding on the steppes); a watered desert grows wheat and barley, not rice.
// C3 — cradles and people: a few sites, each a heartland of grain on a river or a coast that could feed a state's critical
// mass, glowing across its reach; the same at two details; the land's people plausible; quick on the page.
// C4 — hearths and the spread of crops: a few hearths, far apart by the way crops travel; every staple domesticated
// somewhere, each hearth two or three; its strains spread far — over seas, never the open ocean — leaving little good crop
// land unreached and little farmland to
// foragers; each strain named after a real crop of its group that suits its hearth's climate; the hearths and their
// names the same whatever the techniques; each crop grown more in its own climates than the staple groups alone would
// have it (its niche); the same at two details; quick on the page, and again when a hearth's crop is chosen.
// Usage: node v2/tools/check-farming.mjs

import { check, section, finish, labMesh } from './lib/check-kit.mjs';
import { simulate } from '../js/tectonics/simulate.js';
import { TERRAIN_SCENES } from '../js/tectonics/scenarios/terrain-scenes.js';
import { terrainConfig } from '../js/terrain/terrain-config.js';
import { GEO_FRAME_FIELDS } from '../js/tectonics/model/geology.js';
import { TerrainPool, FRAME_FIELDS } from '../js/terrain/terrain-pool.js';
import { finishPlanet, finishRaster } from '../js/finish/finish.js';
import { cradleMap, siteWords } from '../js/farming/cradles.js';
import { spreadMap, spreadBase, spreadGround, spreadHearths, spreadStrains, spreadPlace, hearthWords, SPREAD } from '../js/farming/spread.js';
import { VARIETALS, NAMING, climateFit, likeOf, nearness, strainNiche } from '../js/farming/varietals.js';
import { KOPPEN_ID, KOPPEN_CLASSES } from '../js/climate/koppen.js';
import { farmPlace, farmClass, decHarvests, SoilKind, SoilMod, Staple, STAPLE_WORDS, CROPS } from '../js/farming/farming.js';

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
    const { ocean, farming: F, climate: { cell: { koppen } } } = out, list = [], e = new Float64Array(2 * CROPS.length), n = 2 * CROPS.length;
    for (let c = 0; c < ocean.length; c++) {
        if (ocean[c] || !koppen[c] || koppen[c] === KOPPEN_ID.EF) continue;
        const p = { soil: F.soil[c] / 255, rain: F.rain[c] / 20, warm: F.warm[c] / 20, flood: F.flood[c] / 255, canal: F.canal[c] / 255, slope: 2 * F.slope[c], wetland: F.wetland[c] / 255 };
        for (let k = 0; k < n; k++) e[k] = decHarvests(F.crops[n * c + k]);
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

// (the page's way for C3 and C4: the finished picture, then the cradles and the spread on it — at both details)
const pic = out => finishRaster(out.mesh, out.z, out.ocean, 2048, null, out.lake, out.lakeLevel, out.climate.cell, out.geology, out.farming);
const pf = pic(fine), pc = pic(coarse);

section('C3 — cradles and people');
{
    const t0 = performance.now(), fineMap = cradleMap(pf.farming, pf.climate, ALL), ms = performance.now() - t0;
    const coarseMap = cradleMap(pc.farming, pc.climate, ALL);
    const words = m => m.sites.map((s, k) => `${k + 1}. ${s.lat.toFixed(0)}°, ${s.lon.toFixed(0)}° ${s.score.toFixed(2)} — ${siteWords(s)}`).join('\n         ');
    console.log(`      640K: ${fineMap.sites.length} sites; the land could feed ${(fineMap.people / 1e6).toFixed(0)} million (${(fineMap.people / fineMap.land).toFixed(1)} a km²)\n         ${words(fineMap)}`);
    console.log(`      160K: ${coarseMap.sites.length} sites\n         ${words(coarseMap)}`);
    check('a few cradles: 2–10 sites', fineMap.sites.length >= 2 && fineMap.sites.length <= 10, `${fineMap.sites.length}`);
    check('…each a grain staple (rice, wheat or maize)', fineMap.sites.every(s => s.staple >= Staple.RICE && s.staple <= Staple.MAIZE), fineMap.sites.map(s => STAPLE_WORDS[s.staple]).join(', '));
    check('…each on a river or a coast', fineMap.sites.every(s => s.river || s.coast), '');
    check('…each a heartland that could feed a state’s critical mass (≥ 250 thousand on its grain)', fineMap.sites.every(s => s.people >= 2.5e5),
        fineMap.sites.map(s => `${(s.people / 1e6).toFixed(1)} M within ${s.km} km`).join(', '));
    // (the top site's heartland glows across its reach, not at a speck: its land within its reach as likely as half it)
    const s0 = fineMap.sites[0], g = fineMap.grid;
    let lit = 0;
    if (s0) for (let c = 0; c < g.size; c++) {
        const la = 90 - (Math.floor(c / g.w) + 0.5) * g.step, lo = -180 + (c % g.w + 0.5) * g.step, d = Math.PI / 180;
        const km = 6371 * Math.acos(Math.min(1, Math.sin(la * d) * Math.sin(s0.lat * d) + Math.cos(la * d) * Math.cos(s0.lat * d) * Math.cos((lo - s0.lon) * d)));
        if (km <= s0.km && fineMap.cradle[c] >= 0.5 * s0.score) lit += (111 * g.step) ** 2 * Math.cos(la * d);
    }
    check('…glowing across its heartland, not a speck (≥ 20,000 km² of it as likely as half the top site)', !s0 || lit >= 20000, `${Math.round(lit).toLocaleString()} km²`);
    const near = (a, b) => b.some(s => Math.hypot(s.lat - a.lat, (s.lon - a.lon) * Math.cos(a.lat * Math.PI / 180)) * 111 < 700);
    const top = fineMap.sites.slice(0, 3), found = top.filter(s => near(s, coarseMap.sites)).length;
    check('the same at 160K: the 640K\'s top three within 700 km of a 160K site (≥ 2 of 3)', top.length < 3 || found >= 2, `${found} of ${top.length}`);
    const ppl = fineMap.people / fineMap.land, pplC = coarseMap.people / coarseMap.land;
    check('the land could feed 10–40 people a km² on average (pre-industrial Earth\'s potential ~20–30), the same at 160K (within 15 %)', ppl >= 10 && ppl <= 40 && Math.abs(ppl - pplC) <= 0.15 * ppl, `640K ${ppl.toFixed(1)} · 160K ${pplC.toFixed(1)}`);
    check('…worked out quickly on the page (≤ 1.5 s)', ms <= 1500, `${ms.toFixed(0)} ms`);
}

section('C4 — hearths and the spread of crops');
{
    const t0 = performance.now(), fineMap = spreadMap(pf.farming, pf.climate, ALL), ms = performance.now() - t0;
    const coarseMap = spreadMap(pc.farming, pc.climate, ALL), H = fineMap.hearths, d = Math.PI / 180;
    const km = (a, b) => 6371 * Math.acos(Math.min(1, Math.sin(a.lat * d) * Math.sin(b.lat * d) + Math.cos(a.lat * d) * Math.cos(b.lat * d) * Math.cos((a.lon - b.lon) * d)));
    const words = m => m.hearths.map((h, k) => `${k + 1}. ${h.lat.toFixed(0)}°, ${h.lon.toFixed(0)}° — ${hearthWords(h)}: ${h.crops.map(st => VARIETALS[h.names[st]].name).join(', ')} (like ${likeOf(h, Object.values(h.names)).map(p => p.name).join(' + ') || '—'})`).join('\n         ');
    console.log(`      640K: ${H.length} hearths\n         ${words(fineMap)}`);
    console.log(`      160K: ${coarseMap.hearths.length} hearths\n         ${words(coarseMap)}`);
    check('a few hearths: 3–8', H.length >= 3 && H.length <= SPREAD.hearthsMax, `${H.length}`);
    let near = Infinity, cheap = Infinity;
    H.forEach((a, i) => H.forEach((b, j) => { if (i !== j) { near = Math.min(near, km(a, b)); cheap = Math.min(cheap, fineMap.apart[i][j]); } }));
    check(`…far apart: ≥ ${SPREAD.apartKm} km, and ≥ ${SPREAD.apartCost} by the way crops travel (a major barrier or a continent’s breadth between)`, near >= SPREAD.apartKm && cheap >= SPREAD.apartCost,
        `nearest ${Math.round(near)} km, cheapest way ${cheap === Infinity ? 'past the reach' : Math.round(cheap)}`);
    check('…each domesticating two or three staples', H.every(h => h.crops.length >= SPREAD.domesticMin && h.crops.length <= SPREAD.domesticMax), H.map(h => h.crops.length).join(' '));
    const from = [Staple.RICE, Staple.WHEAT, Staple.MAIZE, Staple.ROOTS].map(st => H.filter(h => h.crops.includes(st)).length);
    check('every staple domesticated somewhere (rice, wheat and barley, maize and millet, roots and tubers)', from.every(n => n >= 1), from.join(' · '));
    // (real crops: each strain a crop of its own group; most in a climate like their hearth's — a preference, so most, not all)
    const strains = H.flatMap(h => h.crops.map(st => ({ h, st, id: h.names?.[st] })));
    check('each strain named after a real crop of its own staple group', strains.every(s => VARIETALS[s.id]?.staple === s.st), strains.map(s => s.id).join(' '));
    check('…no crop naming two strains', new Set(strains.map(s => s.id)).size === strains.length, '');
    const great = strains.filter(s => VARIETALS[s.id]?.major >= 0.7).length;
    check('…mostly the great staples (≥ 60 % of them wheat, barley, rice, maize, sorghum, millets, potato, cassava, yams…)', great >= 0.6 * strains.length, `${great} of ${strains.length}`);
    const suited = strains.filter(s => VARIETALS[s.id] && climateFit(VARIETALS[s.id].climates, s.h.climate) >= 0.4).length;
    check('…most (≥ 75 %) in a climate like their hearth’s', suited >= 0.75 * strains.length, `${suited} of ${strains.length}`);
    const bare = spreadMap(pf.farming, pf.climate, NONE);
    const same = bare.hearths.length === H.length && bare.hearths.every((h, k) => h.cell === H[k].cell && h.crops.join() === H[k].crops.join() && h.crops.every(st => h.names[st] === H[k].names[st]));
    check('the hearths, their staples and names the same whatever the techniques (the first farmers had none)', same, same ? '' : bare.hearths.map(h => `${h.lat.toFixed(0)}°, ${h.lon.toFixed(0)}°`).join(' · '));
    // (each hearth's strains spread far from it — the farthest a continent's breadth; over the sea, its coasts and narrows, not open ocean)
    const g = fineMap.grid, far = H.map(() => 0), F = pf.farming, landMask = new Float32Array(g.size);
    // (the open ocean: no land within oceanKm — never crossed; and the good land for each crop — it grows well there — that
    // no strain of it reached)
    for (let y = 0; y < F.h; y += 2) for (let x = 0; x < F.w; x += 2) if (pf.climate.koppen[y * F.w + x]) landMask[g.index(90 - (y + 0.5) / F.h * 180, (x + 0.5) / F.w * 360 - 180)] = 1;
    const nearLand = g.maxWithin(landMask, SPREAD.oceanKm), gb = spreadBase(pf.farming, pf.climate, ALL);
    // (the window is a box of latitude and longitude: near a pole it misses land across it — there, the great-circle
    // distance to the nearest land settles it)
    const lands = [], unit = c => { const la = (90 - (Math.floor(c / g.w) + 0.5) * g.step) * d, lo = ((c % g.w + 0.5) * g.step - 180) * d; return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)]; };
    for (let c = 0; c < g.size; c++) if (landMask[c]) lands.push(unit(c));
    const cosOcean = Math.cos(SPREAD.oceanKm / 6371), across = new Map();
    const landNear = c => {
        if (nearLand[c] > 0) return true;
        if (!across.has(c)) { const [x, y, z] = unit(c); across.set(c, lands.some(p => p[0] * x + p[1] * y + p[2] * z >= cosOcean)); }
        return across.get(c);
    };
    let open = 0, good = 0, unreached = 0;
    for (let k = 0; k < CROPS.length; k++) for (let c = 0; c < g.size; c++) {
        const o = fineMap.owner[k][c], a = Math.cos((90 - (Math.floor(c / g.w) + 0.5) * g.step) * d);
        if (gb.land[c] > 0 && gb.fit[k][c] >= 0.3) { good += a; if (o < 0) unreached += a; }
        if (o < 0) continue;
        far[o] = Math.max(far[o], fineMap.km[k][c]);
        if (!landNear(c)) open += a;
    }
    check('…each hearth’s strains spread far (≥ 1500 km from it)', far.every(v => v >= 1500), far.map(v => `${Math.round(v)} km`).join(' · '));
    check('…over seas but never the open ocean (nothing reached past ~1000 km from land)', open === 0, across.size ? `(${across.size} places near a pole measured across it)` : '');
    check('…leaving little good crop land unreached (≤ 10 % of where each crop grows well)', unreached <= 0.1 * good, `${(100 * unreached / Math.max(1e-9, good)).toFixed(1)} %`);
    // (each place's crops: a second where one does nearly as well — a minority; little farmland no crop reached; each crop
    // in its own climates — its niche where it is the main crop, against the staple groups' spread named the same)
    // (a crop chosen: its strain spread again, the others kept)
    const base = spreadBase(pf.farming, pf.climate, ALL), again = spreadStrains(base, base.hearths.map(h => h.names)), chosen = base.hearths.map(h => ({ ...h.names }));
    const hk = chosen.findIndex(n => n[Staple.MAIZE]);
    if (hk >= 0) chosen[hk][Staple.MAIZE] = chosen[hk][Staple.MAIZE] === 'maize' ? 'sorghum' : 'maize';
    const t1 = performance.now();
    spreadStrains(base, chosen);
    const msAgain = performance.now() - t1;
    const plain = spreadStrains(base, null), op = {}, nicheAt = (m, st, j, code) => m.niche(j, st)?.[code] ?? again.niche(j, st)?.[code] ?? 1;
    let crop = 0, two = 0, forage = 0, inNiche = 0, inNichePlain = 0, named = 0, namedPlain = 0;
    const p = {}, e = new Float64Array(2 * CROPS.length), r = { foods: new Float64Array(6) }, o = {}, n = 2 * CROPS.length;
    for (let y = 0; y < F.h; y += 4) for (let x = 0; x < F.w; x += 4) {
        const i = y * F.w + x;
        if (!pf.climate.koppen[i] || pf.climate.koppen[i] === KOPPEN_ID.EF) continue;
        const lat = 90 - (y + 0.5) / F.h * 180, a = Math.cos(lat * d);
        Object.assign(p, { soil: F.soil[i] / 255, flood: F.flood[i] / 255, canal: F.canal[i] / 255, slope: 2 * F.slope[i], wetland: F.wetland[i] / 255 });
        for (let k = 0; k < n; k++) e[k] = decHarvests(F.crops[n * i + k]);
        farmPlace(p, e, F.pasture[i] / 255, ALL, r);
        spreadPlace(fineMap, lat, (x + 0.5) / F.w * 360 - 180, r.foods, pf.climate.koppen[i], o);
        if (o.main) { crop += a; if (o.second) two += a; } else if (o.missed) forage += a;
        if (o.mainFrom >= 0) { inNiche += a * nicheAt(fineMap, o.main, o.mainFrom, pf.climate.koppen[i]); named += a; }
        spreadPlace(plain, lat, (x + 0.5) / F.w * 360 - 180, r.foods, pf.climate.koppen[i], op);
        if (op.mainFrom >= 0) { inNichePlain += a * nicheAt(plain, op.main, op.mainFrom, pf.climate.koppen[i]); namedPlain += a; }
    }
    const niche = inNiche / Math.max(1e-9, named), nichePlain = inNichePlain / Math.max(1e-9, namedPlain);
    check('each strain grown in its own climates (its crop’s, blended toward its hearth’s): its niche where it is the main crop ≥ 0.6, and above the staple groups’ spread', niche >= 0.6 && niche > nichePlain + 0.02,
        `${nichePlain.toFixed(2)} → ${niche.toFixed(2)}`);
    check('one crop a place, two on a minority (≤ 45 %)', two <= 0.45 * crop, `${(100 * two / crop).toFixed(0)} %`);
    check('little farmland left to foragers (≤ 15 % of the land grown on or not)', forage <= 0.15 * (crop + forage), `${(100 * forage / (crop + forage)).toFixed(1)} %`);
    const matched = H.slice(0, 3).filter(h => coarseMap.hearths.some(c => km(h, c) < 1000)).length;
    check('the same at 160K: the 640K\'s first three hearths within 1000 km of a 160K one (≥ 2 of 3)', H.length < 3 || matched >= 2, `${matched} of ${Math.min(3, H.length)}`);
    check('…worked out quickly on the page (≤ 1.5 s), and again for a crop chosen (≤ 0.3 s)', ms <= 1500 && msAgain <= 300, `${ms.toFixed(0)} ms · ${msAgain.toFixed(0)} ms`);
}

section('C4d — re-rolls: other likely histories, the same rules');
{
    // (the legend's Re-roll: the same scores as odds — each roll's hearths, staples and crops kept to every rule of C4;
    // roll 0 the likeliest, today's; the likeliest hearths still often there; each roll the same every time, at any detail)
    const ground = spreadGround(pf.farming, pf.climate, ALL), b0 = spreadHearths(ground, 0), d = Math.PI / 180, ROLLS = 10;
    const km = (a, b) => 6371 * Math.acos(Math.min(1, Math.sin(a.lat * d) * Math.sin(b.lat * d) + Math.cos(a.lat * d) * Math.cos(b.lat * d) * Math.cos((a.lon - b.lon) * d)));
    const sig = b => JSON.stringify(b.hearths.map(h => [h.cell, h.crops, h.names]));
    check('roll 0 the likeliest: its hearths and crops those without a roll', sig(b0) === sig(spreadBase(pf.farming, pf.climate, ALL)), '');
    spreadStrains(b0, b0.hearths.map(h => h.names));
    const broke = [], seen = [];
    let differ = 0, kept = 0, great = 0, suited = 0, all = 0, ms = 0;
    for (let roll = 1; roll <= ROLLS; roll++) {
        const t = performance.now(), b = spreadHearths(ground, roll);
        spreadStrains(b, b.hearths.map(h => h.names));
        ms = Math.max(ms, performance.now() - t);
        const H = b.hearths, strains = H.flatMap(h => h.crops.map(st => ({ h, st, id: h.names[st] })));
        let near = Infinity, cheap = Infinity;
        H.forEach((a, i) => H.forEach((c, j) => { if (i !== j) { near = Math.min(near, km(a, c)); cheap = Math.min(cheap, b.apart[i][j]); } }));
        const from = [Staple.RICE, Staple.WHEAT, Staple.MAIZE, Staple.ROOTS].map(st => H.filter(h => h.crops.includes(st)).length);
        const rules = { 'a few': H.length >= 3 && H.length <= SPREAD.hearthsMax, apart: near >= SPREAD.apartKm && cheap >= SPREAD.apartCost,
            'two or three': H.every(h => h.crops.length >= SPREAD.domesticMin && h.crops.length <= SPREAD.domesticMax), 'every staple': from.every(n => n >= 1),
            'own group': strains.every(s => VARIETALS[s.id]?.staple === s.st), 'each once': new Set(strains.map(s => s.id)).size === strains.length };
        for (const [k, ok] of Object.entries(rules)) if (!ok) broke.push(`roll ${roll}: ${k}`);
        all += strains.length;
        great += strains.filter(s => VARIETALS[s.id]?.major >= 0.7).length;
        suited += strains.filter(s => VARIETALS[s.id] && climateFit(VARIETALS[s.id].climates, s.h.climate) >= 0.4).length;
        if (sig(b) !== sig(b0)) differ++;
        if (H.some(h => km(h, b0.hearths[0]) < SPREAD.apartKm)) kept++;
        seen.push(sig(b));
    }
    check(`each of ${ROLLS} rolls keeps every rule: 3–8 hearths far apart, each two or three staples, every staple domesticated, each strain a crop of its group, each crop once`,
        !broke.length, broke.slice(0, 4).join(' · '));
    check('…mostly the great staples (≥ 60 %), most in a climate like their hearth’s (≥ 75 %)', great >= 0.6 * all && suited >= 0.75 * all,
        `${(100 * great / all).toFixed(0)} % · ${(100 * suited / all).toFixed(0)} %`);
    check('…each another history: every roll differs from roll 0, and from each other', differ === ROLLS && new Set(seen).size === ROLLS, `${differ} of ${ROLLS}`);
    // (near: within apartKm — closer, two hearths could not both be; over a broad rich plain a hearth's place is a toss-up)
    check(`…the likeliest still likeliest: roll 0’s first hearth (the richest region) near one of most rolls’ (within ${SPREAD.apartKm} km, ≥ 70 %)`, kept >= 0.7 * ROLLS, `${kept} of ${ROLLS}`);
    check('…each roll the same every time', sig(spreadHearths(ground, 3)) === seen[2] && sig(spreadBase(pf.farming, pf.climate, ALL, 3)) === seen[2], '');
    const fine3 = spreadHearths(ground, 3).hearths, coarse3 = spreadBase(pc.farming, pc.climate, ALL, 3).hearths;
    const matched = fine3.slice(0, 3).filter(h => coarse3.some(c => km(h, c) < 1000)).length;
    check('…the same at 160K: roll 3’s first three hearths within 1000 km of a 160K one (≥ 2 of 3)', matched >= 2, `${matched} of ${Math.min(3, fine3.length)}`);
    check('…a re-roll quick on the page (≤ 1 s: its hearths, and the strains it moved or renamed spread again)', ms <= 1000, `${ms.toFixed(0)} ms at most`);
    // (over the rolls: a hearth's crops from one part of the world — their Earth homes near — more than they would be by
    // each crop's own suit alone; and each strain at home around its hearth — its niche over the hearth's land)
    const kopIndex = Object.fromEntries(KOPPEN_CLASSES.map((k, j) => [k.code, j]));
    const pairNear = () => {
        let s = 0, n = 0;
        for (let roll = 0; roll <= ROLLS; roll++) for (const h of spreadHearths(ground, roll).hearths) {
            const ids = h.crops.map(st => h.names[st]);
            for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { s += nearness(ids[i], ids[j]); n++; }
        }
        return s / Math.max(1, n);
    };
    const was = NAMING.together, withPull = pairNear();
    NAMING.together = 0;
    const alone = pairNear();
    NAMING.together = was;
    check('a hearth’s crops from one part of the world: their Earth homes’ nearness ≥ 0.35, and ≥ 1.5× their crops’ own suits alone', withPull >= 0.35 && withPull >= 1.5 * alone,
        `${alone.toFixed(2)} → ${withPull.toFixed(2)}`);
    let homeLeast = Infinity, homeMean = 0, nStrain = 0;
    for (let roll = 0; roll <= ROLLS; roll++) for (const h of spreadHearths(ground, roll).hearths) for (const st of h.crops) {
        const ni = strainNiche(h.names[st], h.climate, SPREAD.nicheFloor, SPREAD.attune, SPREAD.attuneShare);
        let at = 0;
        for (const [code, share] of h.climate) at += share * ni[kopIndex[code]];
        homeLeast = Math.min(homeLeast, at); homeMean += at; nStrain++;
    }
    check('each strain at home around its hearth: its niche over the hearth’s land ≥ 0.4 (its crop’s alone as low as 0.25), ≥ 0.8 on average', homeLeast >= 0.4 && homeMean / nStrain >= 0.8,
        `least ${homeLeast.toFixed(2)} · mean ${(homeMean / nStrain).toFixed(2)}`);
}

section('C1 — quick');
{
    const total = Object.values(fine.ms).reduce((a, b) => a + b, 0);
    check('the farming stage ≤ 4 % of the finish', fine.ms.farming <= 0.04 * total, `${(fine.ms.farming / 1000).toFixed(2)} s of ${(total / 1000).toFixed(1)} s`);
}

finish('Farming');
