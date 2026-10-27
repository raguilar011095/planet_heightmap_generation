// Headless checks for the geology (plans/V2_GEOLOGY_PLAN.md), phase by phase.
// G1 — the history's geological record (tectonics/step/geology.js): records only, so a history is the same with it or
// without; the sea's stand follows the supercontinent cycle and floods a believable share of the land at a high stand;
// carbonate is laid in warm seas; old belts and shields are worn deep; forelands fill; the record costs little; the start
// world's platform sediment lies in its lowlands, its old ranges worn by their age.
// G2 — rocks (geology/rocks.js) on a finished moment: the land's families near Earth's, the same at two details, quick;
// each rock where its setting puts it; the structure the terrain drew followed — an old belt's rock banded with its
// ridges, the far field's folds baring older rock on their crests, a shield's greenstone on its grain — the heights
// untouched by it.
// Usage: node v2/tools/check-geology.mjs

import { createHash } from 'node:crypto';
import { check, section, finish, labMesh } from './lib/check-kit.mjs';
import { simulate } from '../js/tectonics/simulate.js';
import { TERRAIN_SCENES } from '../js/tectonics/scenarios/terrain-scenes.js';
import { terrainConfig } from '../js/terrain/terrain-config.js';
import { packFrame } from '../js/tectonics/frame-pack.js';
import { CrustType, OrogenyType } from '../js/tectonics/model/crust.js';
import { spreadKm } from '../js/core/min-heap.js';
import { GEO_FRAME_FIELDS, GeoFlag, decodeCoverKm, decodeExhumKm, decodeUnroofKm, decodeFacies, decodeAge } from '../js/tectonics/model/geology.js';
import { TerrainPool, FRAME_FIELDS } from '../js/terrain/terrain-pool.js';
import { terrainMesh } from '../js/terrain/terrain-mesh.js';
import { finishPlanet } from '../js/finish/finish.js';
import { Rock, ROCK_INFO, ROCK_COUNT, EARTH_FAMILIES } from '../js/geology/rocks.js';

const SEED = 12345, SIM = 20000, UNTIL = 400;
const ACTIVE = new Set([OrogenyType.ANDEAN, OrogenyType.LARAMIDE, OrogenyType.URAL, OrogenyType.HIMALAYAN]);
const mesh = labMesh(SIM), n = mesh.numCells, scene = TERRAIN_SCENES.find(s => s.id === 'cycle');
const median = a => { const s = Float64Array.from(a).sort(); return s.length ? s[s.length >> 1] : NaN; };

/** The Evolution page's history (scene 'cycle'), with the geological record kept or not: each frame's fingerprint of
 *  everything but the record, its packed size and the record's share of it, and the frames every 50 Myr. */
function run(records) {
    const world = scene.build(mesh, SEED, { continentalFraction: 0.3 });
    world.config.heights = terrainConfig({});
    world.config.geology.records = records;
    const prints = [], kept = [];
    let bytes = 0, geoBytes = 0;
    const t0 = performance.now();
    simulate(world, { untilMyr: UNTIL, drive: w => scene.drive(w), snapshotEveryMyr: 10, keepFrames: false, onFrame: f => {
        const h = createHash('md5');
        for (const [k, v] of Object.entries(f)) if (ArrayBuffer.isView(v) && !GEO_FRAME_FIELDS.includes(k)) { h.update(k); h.update(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)); }
        h.update(JSON.stringify(f.events.map(e => [e.time, e.kind])));
        prints.push(h.digest('hex'));
        const { packed } = packFrame(f);
        for (const [k, v] of Object.entries(packed.fields)) {
            const b = (v.bits?.byteLength ?? 0) + (v.values?.byteLength ?? 0) + (v.steps?.byteLength ?? 0) + (v.far?.byteLength ?? 0);
            bytes += b; if (GEO_FRAME_FIELDS.includes(k)) geoBytes += b;
        }
        if (Math.round(f.time) % 50 === 0) kept.push(f);
    } });
    return { prints, kept, ms: performance.now() - t0, geoShare: geoBytes / bytes };
}

section('G1 — records only: the same history with the geological record or without');
const off = run(false), on = run(true);
check('every frame of the history is the same, record or not (the tectonics never read it)', on.prints.length === off.prints.length && on.prints.every((p, i) => p === off.prints[i]),
    `${on.prints.length} frames, ${on.prints.filter((p, i) => p !== off.prints[i]).length} differ`);
const anyRecord = f => GEO_FRAME_FIELDS.some(k => f[k].some(v => v !== 0));
check('…and the record is kept only when asked for', on.kept.slice(1).every(anyRecord) && off.kept.every(f => !anyRecord(f)), 'records on: written · off: all zero');
check('it costs little: the history at most ~15 % slower', on.ms <= 1.15 * off.ms + 500, `${(off.ms / 1000).toFixed(1)} s without, ${(on.ms / 1000).toFixed(1)} s with`);
check('a frame grows by at most a sixth (packed)', on.geoShare <= 1 / 6, `the record is ${(100 * on.geoShare).toFixed(1)} % of the packed frames`);

section('G1 — the sea\'s stand and the shallow seas');
const seas = on.kept.filter(f => f.geoSea).map(f => ({ t: f.time, stand: f.geoSea.stand, share: f.geoSea.share }));
const shares = seas.map(s => s.share), lo = Math.min(...shares), hi = Math.max(...shares);
check('the sea rises and falls with the cycle: the flooded share swings by 12 points or more', hi - lo >= 0.12,
    seas.map(s => `${s.t}: ${(100 * s.share).toFixed(0)}%`).join(' · '));
check('…at its highest flooding 20–40 % of the land (Earth\'s Cretaceous: ~35 % of today\'s land)', hi >= 0.2 && hi <= 0.4, `highest ${(100 * hi).toFixed(0)}%, lowest ${(100 * lo).toFixed(0)}%`);
check('…and lowest under the supercontinent the history starts from (old ocean floor rides low)', seas[0].stand < Math.max(...seas.map(s => s.stand)) - 0.3, `stand at ${seas[0].t} Myr ${seas[0].stand.toFixed(2)}, highest ${Math.max(...seas.map(s => s.stand)).toFixed(2)}`);

section('G1 — the start world\'s past');
{
    // its platform sediment in its lowlands (heights.js seedBaseRelief's swells: uplands along its seams), its old ranges
    // worn by their age (start-world.js oldRanges: inner seams the oldest)
    const f0 = on.kept[0], covered = [], bare = [], byAge = new Map();
    for (let w = 0; w < n; w++) {
        if (f0.owner[w] < 0 || f0.type[w] === CrustType.OCEAN || f0.type[w] === CrustType.ARC) continue;
        (decodeCoverKm(f0.coverKm[w]) > 0.2 ? covered : bare).push(f0.baseKm[w]);
        if (f0.oroType[w] && f0.oroLast[w] < 0) { const a = Math.round(-f0.oroLast[w]); if (!byAge.has(a)) byAge.set(a, []); byAge.get(a).push(decodeExhumKm(f0.exhumKm[w])); }
    }
    const share = covered.length / (covered.length + bare.length);
    check('the start world\'s platform sediment lies in its lowlands: the swells under it lower than where it is bare, over 35–65 % of its land',
        share >= 0.35 && share <= 0.65 && median(covered) < 0.5 * median(bare), `${(100 * share).toFixed(0)} % covered; the swells under it ${median(covered).toFixed(2)} km, bare ${median(bare).toFixed(2)} km (medians)`);
    const ages = [...byAge.keys()].filter(a => byAge.get(a).length >= 30).sort((a, b) => a - b), deep = ages.map(a => median(byAge.get(a)));
    check('…and its old ranges worn by their age: the older, the deeper', ages.length >= 2 && deep.every((d, i) => i === 0 || d > deep[i - 1]),
        ages.map((a, i) => `${a} Myr: ${deep[i].toFixed(1)} km`).join(' · '));
}

section('G1 — what the seas and basins laid down');
const last = on.kept.at(-1), fac = {};
{
    // carbonate-topped cover laid under a sea flooding now: where is it (its latitude now is its latitude when laid)
    let warm = 0, all = 0;
    for (let w = 0; w < n; w++) {
        if (last.owner[w] < 0 || last.type[w] === CrustType.OCEAN || last.floodAge[w] !== 1) continue;
        decodeFacies(last.facies[w], fac);
        if (fac.carb < 0.5) continue;
        all++;
        if (Math.abs(Math.asin(mesh.xyz[3 * w + 2])) * 180 / Math.PI <= 35) warm++;
    }
    check('limestone is laid in warm seas: ≥ 80 % of the carbonate under today\'s shallow seas lies within 35° of the equator', all > 20 && warm / all >= 0.8, `${warm} of ${all} cells`);
}
/**
 * The belts' record at a history's end, into `into`: the cover at the foot of the active belts (within 150 km of a belt's
 * outer edge, outside the belt) and elsewhere; the unroofing of the mountain belts quiet for 150 Myr and of the active
 * ones (a rift's shoulders are left out: an escarpment retreating at its own pace, not a range worn down).
 */
function beltRecord(last, into) {
    const isLand = w => last.owner[w] >= 0 && last.type[w] !== CrustType.OCEAN && last.type[w] !== CrustType.ARC;
    // (a foreland fills deep — though a range advancing over it may strip it again: its deepest fill, then; of the cover
    // laid in the history: the start world's platform sediment is no foreland's)
    for (let w = 0; w < n; w++) if (isLand(w) && decodeAge(last.coverMaxAge[w]) < last.time) (last.geoFlags[w] & GeoFlag.FORELAND ? into.fore : into.rest).push(decodeCoverKm(last.coverMaxKm[w]));
    const live = w => ACTIVE.has(last.oroType[w]) && last.time - last.oroLast[w] <= 10;
    const dist = new Float32Array(n).fill(Infinity);
    for (let w = 0; w < n; w++) if (isLand(w) && live(w) && last.beltU[w] / 255 >= 0.8) dist[w] = 0;
    spreadKm(mesh, dist, { canEnter: (c, nb) => isLand(nb) && !live(nb), maxKm: 150 });
    for (let w = 0; w < n; w++) {
        if (!isLand(w)) continue;
        if (!live(w)) (dist[w] < 150 ? into.basin : into.notBasin).push(decodeCoverKm(last.coverKm[w]));
        // (a belt's unroofing since it was last active: what erosion has taken off it since it went quiet)
        if (last.oroType[w] && last.oroType[w] !== OrogenyType.RIFT && last.oroLast[w] >= 0) {
            const age = last.time - last.oroLast[w], un = decodeUnroofKm(last.unroofKm[w]);
            if (age > 150) into.oldBelt.push(un); else if (age < 20) into.youngBelt.push(un);
        }
    }
    return into;
}
{
    const craton = [];
    for (let w = 0; w < n; w++) if (last.owner[w] >= 0 && last.type[w] === CrustType.CRATON) craton.push(decodeExhumKm(last.exhumKm[w]));
    // (the belts' record over three histories: one world's active belts at its end may be few — seed 12345's were 34
    // cells' foot after the start world was rebuilt as an assembly)
    const { basin, notBasin, oldBelt, youngBelt, fore, rest } = beltRecord(last, { basin: [], notBasin: [], oldBelt: [], youngBelt: [], fore: [], rest: [] });
    for (const seed of [777, 2024]) {
        const world = scene.build(mesh, seed, { continentalFraction: 0.3 });
        world.config.heights = terrainConfig({});
        world.config.geology.records = true;
        let end = null;
        simulate(world, { untilMyr: UNTIL, drive: w => scene.drive(w), snapshotEveryMyr: 10, keepFrames: false, onFrame: f => { end = f; } });
        beltRecord(end, { basin, notBasin, oldBelt, youngBelt, fore, rest });
    }
    check('forelands fill: deeper than the rest of the land ever was (the cover laid in three histories)', fore.length > 60 && median(fore) > 1.1 * median(rest), `deepest cover, median ${median(fore).toFixed(2)} km against ${median(rest).toFixed(2)} km (${fore.length} foreland cells)`);
    check('…and the plains at the foot of the active ranges are filling (three histories)', basin.length > 60 && median(basin) > 1.5 * median(notBasin), `cover, median ${median(basin).toFixed(2)} km against ${median(notBasin).toFixed(2)} km elsewhere (${basin.length} cells within 150 km of an active belt)`);
    check('shields were worn deep: a craton\'s basement once lay ≥ 10 km down', median(craton) >= 10, `median ${median(craton).toFixed(1)} km`);
    check('a mountain belt is unroofed as it wears: ones quiet for 150 Myr have lost more since than active ones (three histories)', oldBelt.length > 60 && youngBelt.length > 60 && median(oldBelt) > median(youngBelt) + 1,
        `median ${median(oldBelt).toFixed(1)} km since (quiet > 150 Myr, ${oldBelt.length} cells) against ${median(youngBelt).toFixed(1)} km (active)`);
}

// ── G2: rocks on a finished moment ──
section('G2 — rocks: a finished moment’s land, by family, against Earth’s (GLiM)');
const frameOf = f => { const o = Object.fromEntries([...FRAME_FIELDS, ...GEO_FRAME_FIELDS].map(k => [k, f[k]])); o.plates = f.plates.map(p => p && { quat: p.quat }); return o; };
const momentFrame = frameOf(last), pool = await TerrainPool.create(mesh);
const finishAt = async cells => finishPlanet({ frame: momentFrame, simMesh: mesh, seed: SEED, cells, pool });
const families = sh => { const fam = {}; for (let k = 1; k < ROCK_COUNT; k++) fam[ROCK_INFO[k].family] = (fam[ROCK_INFO[k].family] ?? 0) + sh[k]; return fam; };
const famWords = fam => Object.keys(EARTH_FAMILIES).map(k => `${k} ${(100 * (fam[k] ?? 0)).toFixed(0)}%`).join(' · ');
const fine = await finishAt(640000), coarse = await finishAt(160000);
// (the structure the rocks follow, handed over by the surface: the same surface with it or without)
const md5 = a => createHash('md5').update(new Uint8Array(a.buffer, a.byteOffset, a.byteLength)).digest('hex');
const plain = await pool.synthesize(momentFrame, terrainMesh(160000), { cfg: terrainConfig(), seed: SEED, records: false, carveInputs: true });
const cued = await pool.synthesize(momentFrame, terrainMesh(160000), { cfg: terrainConfig(), seed: SEED, records: false, carveInputs: true, recCells: true });
const sameSurface = md5(plain.heightKm) === md5(cued.heightKm) && md5(plain.carveIn.k) === md5(cued.carveIn.k);
pool.terminate();
{
    const fam = families(fine.stats.rocks), sed = (fam.loose ?? 0) + (fam.sedimentary ?? 0);
    check('sediment and sedimentary rock ~60–80 % of the land (Earth 70 %)', sed >= 0.6 && sed <= 0.8, famWords(fam));
    check('…metamorphic 8–22 % (Earth 15 %), plutonic and volcanic 3–13 % each (Earth ~8 %)', fam.metamorphic >= 0.08 && fam.metamorphic <= 0.22 && fam.plutonic >= 0.03 && fam.plutonic <= 0.13 && fam.volcanic >= 0.03 && fam.volcanic <= 0.13, famWords(fam));
    check('river plains and deltas about their share of the land', Math.abs(fine.stats.youngBy[0] - 0.13) <= 0.04, `${(100 * fine.stats.youngBy[0]).toFixed(1)} % (plainsShare 13 %)`);
    const c = families(coarse.stats.rocks), worst = Math.max(...Object.keys(EARTH_FAMILIES).map(k => Math.abs((c[k] ?? 0) - (fam[k] ?? 0))));
    check('the same at 160K and 640K cells: each family within 5 points', worst <= 0.05, `160K: ${famWords(c)} · 640K: ${famWords(fam)}`);
    // (the rocks read the finished surface — its relief, its rivers' plains, a warp for their contacts: ~6–7 %)
    check('…and quickly: the geology stage a few % of the finish', fine.ms.geology <= 0.08 * Object.values(fine.ms).reduce((a, b) => a + b, 0), `${(fine.ms.geology / 1000).toFixed(2)} s of ${(Object.values(fine.ms).reduce((a, b) => a + b, 0) / 1000).toFixed(1)} s`);
}
section('G2 — each rock where its setting puts it');
{
    // each finish cell's rock against the sim cell whose record it shows (as the terrain read it): shields on cratons, arc
    // volcanics on arcs, limestone where carbonate was laid (there or next to it: the record is read smoothly)
    const { mesh: fm, geology: { rock, rec }, ocean } = fine, count = {};
    const tally = (k, ok) => { const t = count[k] ??= [0, 0]; t[0]++; if (ok) t[1]++; };
    for (let c = 0; c < fm.numCells; c += 3) {
        if (ocean[c]) continue;
        const r = rock[c], w = rec ? rec[c] : mesh.index.nearest(fm.xyz[3 * c], fm.xyz[3 * c + 1], fm.xyz[3 * c + 2]);
        if (r === Rock.SHIELD || r === Rock.GREENSTONE) tally('shield', last.type[w] === CrustType.CRATON || last.type[mesh.adjList[mesh.adjOffset[w]]] === CrustType.CRATON);
        if (r === Rock.VOLCANIC) tally('volcanic', last.arcMyr[w] > 0 || last.type[w] === CrustType.ARC || (last.geoFlags[w] & GeoFlag.WAS_ARC) || ACTIVE.has(last.oroType[w]));
        if (r === Rock.LIMESTONE) {
            let carb = 0;
            for (let k = mesh.adjOffset[w] - 1; k < mesh.adjOffset[w + 1]; k++) { decodeFacies(last.facies[k < mesh.adjOffset[w] ? w : mesh.adjList[k]], fac); carb = Math.max(carb, fac.carb); }
            tally('limestone', carb > 0.1);
        }
    }
    const share = k => (count[k] ? count[k][1] / count[k][0] : 1), words = k => `${count[k]?.[1] ?? 0} of ${count[k]?.[0] ?? 0}`;
    check('shields’ granite-gneiss and greenstone lie on cratons (≥ 85 %)', share('shield') >= 0.85, words('shield'));
    check('andesite and rhyolite lie on arcs, live or old (≥ 85 %)', share('volcanic') >= 0.85, words('volcanic'));
    check('limestone lies where carbonate was laid (≥ 85 %)', share('limestone') >= 0.85, words('limestone'));
}
section('G2 — the rocks follow the structure the terrain drew');
{
    // each finish cell's rock against the structure the surface drew there (terrain/synthesize.js surfaceRange's cue)
    const { mesh: fm, geology: { rock, cues }, ocean } = fine;
    const BASE = new Set([Rock.VOLCANIC, Rock.GRANITE, Rock.SLATE, Rock.GNEISS, Rock.SHIELD, Rock.GREENSTONE, Rock.OPHIOLITE]);
    const hard = [0, 0], soft = [0, 0], crest = [0, 0], trough = [0, 0], green = [], dome = [];
    for (let c = 0; c < fm.numCells; c++) {
        if (ocean[c]) continue;
        const r = rock[c], band = cues[3 * c] / 127, fold = cues[3 * c + 1] / 127, grain = cues[3 * c + 2];
        const resistant = r === Rock.SANDSTONE || r === Rock.GNEISS ? 1 : 0;
        if (band > 0.3) { hard[0]++; hard[1] += resistant; } else if (band < -0.3) { soft[0]++; soft[1] += resistant; }
        if (r !== Rock.ALLUVIUM && r !== Rock.BASALT) { const b = BASE.has(r) ? 1 : 0; if (fold > 0.3) { crest[0]++; crest[1] += b; } else if (fold < -0.3) { trough[0]++; trough[1] += b; } }
        if (grain > 0) { if (r === Rock.GREENSTONE) green.push(grain); else if (r === Rock.SHIELD) dome.push(grain); }
    }
    const of = t => (t[0] ? t[1] / t[0] : 0), pc = t => `${(100 * of(t)).toFixed(0)} % of ${t[0]}`;
    check('an old belt\'s rock banded with its ridges: resistant rock (sandstone, gneiss) ≥ 1.3 × as common on its hard bands as in its soft troughs',
        hard[0] >= 100 && soft[0] >= 100 && of(hard) >= 1.3 * of(soft), `on the ridges ${pc(hard)} · in the troughs ${pc(soft)}`);
    check('the far field\'s folds: their crests bare older rock — the basement ≥ 1.15 × as often as in their troughs',
        crest[0] >= 200 && trough[0] >= 200 && of(crest) >= 1.15 * of(trough), `basement on the crests ${pc(crest)} · in the troughs ${pc(trough)}`);
    check('a shield\'s greenstone on its grain\'s ridges, between its granite-gneiss domes', green.length >= 30 && median(green) >= median(dome) + 15,
        `the grain where greenstone ${median(green)} (${green.length} cells) · granite-gneiss ${median(dome)} (${dome.length})`);
    check('…the heights untouched by it: the surface the same with it handed over or not', sameSurface, '');
}

finish('Geology');
