// Headless checks for the geology (plans/V2_GEOLOGY_PLAN.md), phase by phase.
// G1 — the history's geological record (tectonics/step/geology.js): records only, so a history is the same with it or
// without; the sea's stand follows the supercontinent cycle and floods a believable share of the land at a high stand;
// carbonate is laid in warm seas; old belts and shields are worn deep; forelands fill; the record costs little.
// G2 — rocks (geology/rocks.js) on a finished moment: the land's families near Earth's, the same at two details, quick;
// each rock where its setting puts it.
// G3 — deposit systems (geology/deposits.js): copper and gold over arcs and in belts, tin scarce, epithermal gold only near
// young arcs, kimberlites only on cratons, deposits in districts rather than scattered.
// G4 — the climate and the rivers: bauxite on wet tropical ground, placers down rivers from their sources, enriched copper
// under dry skies — and the climate's tests on observed Earth beside where bauxite, peat and salt really are.
// G5 — resources by age (geology/ages.js): each age only what it can reach — copper grows with the ages, tin stays scarce,
// bronze can be made in a few places, iron is everywhere in the Iron Age, the Industrial map does not light up the planet.
// G6 — districts, stories, exports (geology/districts.js, evolution/geology-export.js): districts on land, few for the
// scarce metals, stories that read the history, landmass summaries that add up, the files well formed, all quick.
// G7 — gems: scarce, the rarest rarest, each in its setting (rubies in collision belts, amethyst on flood basalts, opal in
// dry country).
// Usage: node v2/tools/check-geology.mjs

import { createHash } from 'node:crypto';
import { check, section, finish, labMesh } from './lib/check-kit.mjs';
import { simulate } from '../js/tectonics/simulate.js';
import { TERRAIN_SCENES } from '../js/tectonics/scenarios/terrain-scenes.js';
import { terrainConfig } from '../js/terrain/terrain-config.js';
import { packFrame } from '../js/tectonics/frame-pack.js';
import { CrustType, OrogenyType } from '../js/tectonics/model/crust.js';
import { spreadKm } from '../js/core/min-heap.js';
import { GEO_FRAME_FIELDS, GEOLOGY_READS, GeoFlag, decodeCoverKm, decodeExhumKm, decodeUnroofKm, decodeFacies } from '../js/tectonics/model/geology.js';
import { TerrainPool, FRAME_FIELDS } from '../js/terrain/terrain-pool.js';
import { finishPlanet, finishRaster } from '../js/finish/finish.js';
import { Rock, ROCK_INFO, ROCK_COUNT, EARTH_FAMILIES } from '../js/geology/rocks.js';
import { DEPOSITS, DEPOSIT_INDEX, METALS } from '../js/geology/deposits.js';
import { AGES, resourceField, landShares, potentialField } from '../js/geology/ages.js';
import { GEOLOGY } from '../js/geology/geology-config.js';
import { earthDeposits } from '../../tuning/geology/earth-deposits.mjs';
import { findDistricts, landmasses, landmassShares, districtStory, districtSource } from '../js/geology/districts.js';
import { districtRows, districtsGeoJson, districtsCsv, resourceAtlas, resourceMasks } from '../js/evolution/geology-export.js';
import { CrustFlag, VolcanicType } from '../js/tectonics/model/crust.js';

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
{
    // the plains at the foot of today's active belts: within 150 km of a belt's outer edge, outside the belt
    const isLand = w => last.owner[w] >= 0 && last.type[w] !== CrustType.OCEAN && last.type[w] !== CrustType.ARC;
    const live = w => ACTIVE.has(last.oroType[w]) && last.time - last.oroLast[w] <= 10;
    const dist = new Float32Array(n).fill(Infinity);
    for (let w = 0; w < n; w++) if (isLand(w) && live(w) && last.beltU[w] / 255 >= 0.8) dist[w] = 0;
    spreadKm(mesh, dist, { canEnter: (c, nb) => isLand(nb) && !live(nb), maxKm: 150 });
    const foot = new Int8Array(n);                         // 1 at a range's foot, 2 in or at a live belt, 0 elsewhere
    for (let w = 0; w < n; w++) foot[w] = live(w) ? 2 : dist[w] < 150 ? 1 : 0;
    const fore = [], rest = [], basin = [], notBasin = [], craton = [], oldBelt = [], youngBelt = [];
    for (let w = 0; w < n; w++) {
        if (last.owner[w] < 0 || last.type[w] === CrustType.OCEAN || last.type[w] === CrustType.ARC) continue;
        const cover = decodeCoverKm(last.coverKm[w]), ex = decodeExhumKm(last.exhumKm[w]);
        // (a foreland fills deep — though a range advancing over it may strip it again: its deepest fill, then)
        (last.geoFlags[w] & GeoFlag.FORELAND ? fore : rest).push(decodeCoverKm(last.coverMaxKm[w]));
        (foot[w] === 1 ? basin : foot[w] === 0 ? notBasin : []).push(cover);
        if (last.type[w] === CrustType.CRATON) craton.push(ex);
        // (a belt's unroofing since it was last active: what erosion has taken off it since it went quiet)
        if (last.oroType[w] && last.oroLast[w] >= 0) { const age = last.time - last.oroLast[w], un = decodeUnroofKm(last.unroofKm[w]); if (age > 150) oldBelt.push(un); else if (age < 20) youngBelt.push(un); }
    }
    check('forelands fill: deeper than the rest of the land ever was', fore.length > 20 && median(fore) > 1.1 * median(rest), `deepest cover, median ${median(fore).toFixed(2)} km against ${median(rest).toFixed(2)} km (${fore.length} foreland cells)`);
    check('…and the plains at the foot of the active ranges are filling', basin.length > 20 && median(basin) > 1.5 * median(notBasin), `cover, median ${median(basin).toFixed(2)} km against ${median(notBasin).toFixed(2)} km elsewhere (${basin.length} cells within 150 km of an active belt)`);
    check('shields were worn deep: a craton\'s basement once lay ≥ 10 km down', median(craton) >= 10, `median ${median(craton).toFixed(1)} km`);
    check('a belt is unroofed as it wears: ones quiet for 150 Myr have lost more since than active ones', oldBelt.length > 20 && youngBelt.length > 20 && median(oldBelt) > median(youngBelt) + 1,
        `median ${median(oldBelt).toFixed(1)} km since (quiet > 150 Myr) against ${median(youngBelt).toFixed(1)} km (active)`);
}

// ── G2: rocks on a finished moment ──
section('G2 — rocks: a finished moment’s land, by family, against Earth’s (GLiM)');
const frameOf = f => { const o = Object.fromEntries([...FRAME_FIELDS, ...GEO_FRAME_FIELDS, ...GEOLOGY_READS].map(k => [k, f[k]])); o.plates = f.plates.map(p => p && { quat: p.quat }); return o; };
const momentFrame = frameOf(last), pool = await TerrainPool.create(mesh);
const finishAt = async cells => finishPlanet({ frame: momentFrame, simMesh: mesh, seed: SEED, cells, pool });
const families = sh => { const fam = {}; for (let k = 1; k < ROCK_COUNT; k++) fam[ROCK_INFO[k].family] = (fam[ROCK_INFO[k].family] ?? 0) + sh[k]; return fam; };
const famWords = fam => Object.keys(EARTH_FAMILIES).map(k => `${k} ${(100 * (fam[k] ?? 0)).toFixed(0)}%`).join(' · ');
const fine = await finishAt(640000), coarse = await finishAt(160000);
pool.terminate();
{
    const fam = families(fine.stats.rocks), sed = (fam.loose ?? 0) + (fam.sedimentary ?? 0);
    check('sediment and sedimentary rock ~60–80 % of the land (Earth 70 %)', sed >= 0.6 && sed <= 0.8, famWords(fam));
    check('…metamorphic 8–22 % (Earth 15 %), plutonic and volcanic 3–13 % each (Earth ~8 %)', fam.metamorphic >= 0.08 && fam.metamorphic <= 0.22 && fam.plutonic >= 0.03 && fam.plutonic <= 0.13 && fam.volcanic >= 0.03 && fam.volcanic <= 0.13, famWords(fam));
    check('river plains and deltas about their share of the land', Math.abs(fine.stats.youngBy[0] - 0.13) <= 0.04, `${(100 * fine.stats.youngBy[0]).toFixed(1)} % (plainsShare 13 %)`);
    const c = families(coarse.stats.rocks), worst = Math.max(...Object.keys(EARTH_FAMILIES).map(k => Math.abs((c[k] ?? 0) - (fam[k] ?? 0))));
    check('the same at 160K and 640K cells: each family within 5 points', worst <= 0.05, `160K: ${famWords(c)} · 640K: ${famWords(fam)}`);
    // (the rocks read the finished surface — its relief, its rivers' plains, a warp for their contacts: ~6–7 %)
    check('…and quickly: the rocks a few % of the finish', fine.ms.geology <= 0.08 * Object.values(fine.ms).reduce((a, b) => a + b, 0), `${(fine.ms.geology / 1000).toFixed(2)} s of ${(Object.values(fine.ms).reduce((a, b) => a + b, 0) / 1000).toFixed(1)} s`);
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

section('G3 — deposit systems');
const Dp = fine.geology.deposits, K = Dp.cells.length, [P0, P1] = GEOLOGY.deposits.grades;
const gridOf = id => { const k = DEPOSIT_INDEX[id], v = new Float32Array(Dp.w * Dp.h); for (let j = 0; j < K; j++) v[Dp.cells[j]] = Dp.data[k * K + j] / 255; return v; };
const centre = g => { const y = Math.floor(g / Dp.w), x = g % Dp.w, la = (90 - (y + 0.5) * Dp.step) * Math.PI / 180, lo = (-180 + (x + 0.5) * Dp.step) * Math.PI / 180; return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)]; };
const simAt = g => { const p = centre(g); return mesh.index.nearest(p[0], p[1], p[2]); };
const landShare = id => { const k = DEPOSIT_INDEX[id]; return Dp.shares[3 * k] + Dp.shares[3 * k + 1] + Dp.shares[3 * k + 2]; };
/** The grid cells where a system is at least `min`, and the share of them for which `ok(g)` holds. */
const where = (id, min, ok) => { const v = gridOf(id); let n0 = 0, n1 = 0; for (const g of Dp.cells) if (v[g] >= min) { n0++; if (ok(g)) n1++; } return [n1, n0]; };
/** Within km of a sim cell where `test(w)` holds (km over the sim mesh). */
const near = (test, km) => { const d = new Float32Array(n).fill(Infinity); for (let w = 0; w < n; w++) if (test(w)) d[w] = 0; spreadKm(mesh, d, { maxKm: km }); return d; };
{
    const cu = landShare('porphyry'), sn = landShare('tin');
    check('tin far scarcer than copper (tin ≤ ⅓ of porphyry copper\'s ground)', sn <= cu / 3 && cu > 0.01, `tin ${(100 * sn).toFixed(2)} % of the land, porphyry copper ${(100 * cu).toFixed(2)} %`);
    const time = last.time, youngArc = near(w => last.owner[w] >= 0 && last.type[w] !== CrustType.OCEAN && (last.type[w] === CrustType.ARC || ((last.oroType[w] === OrogenyType.ANDEAN || last.oroType[w] === OrogenyType.ARC || last.oroType[w] === OrogenyType.LARAMIDE) && time - last.oroLast[w] < 40)), 250);
    const [e1, e0] = where('epithermal', P1, g => youngArc[simAt(g)] < 250);
    check('epithermal gold only near young arcs (≥ 85 % of it within 250 km of an arc live in the last 40 Myr)', e0 > 0 && e1 / e0 >= 0.85, `${e1} of ${e0} grid cells`);
    const arcsBelts = near(w => last.owner[w] >= 0 && last.type[w] !== CrustType.OCEAN && (last.oroType[w] > 0 || last.arcMyr[w] > 0 || last.type[w] === CrustType.ARC || (last.geoFlags[w] & (GeoFlag.WAS_ARC | GeoFlag.OPHIOLITE))), 250);
    const [p1, p0] = where('porphyry', P0, g => arcsBelts[simAt(g)] < 250), [o1, o0] = where('orogenicGold', P0, g => arcsBelts[simAt(g)] < 250);
    check('porphyry copper and orogenic gold along arcs and belts (≥ 90 % within 250 km of one)', p0 > 0 && o0 > 0 && p1 / p0 >= 0.9 && o1 / o0 >= 0.9, `porphyry ${p1} of ${p0}, orogenic gold ${o1} of ${o0} grid cells`);
    const cratons = near(w => last.owner[w] >= 0 && last.type[w] === CrustType.CRATON, 150);
    const [k1, k0] = where('kimberlite', P0, g => cratons[simAt(g)] < 150);
    check('kimberlites only on cratons (≥ 95 % within 150 km of one), and few', k0 === 0 || (k1 / k0 >= 0.95 && landShare('kimberlite') < 0.02), `${k1} of ${k0} grid cells · ${(100 * landShare('kimberlite')).toFixed(2)} % of the land`);
    // districts: the system's ground in patches of 3 grid cells or more (a district, however small), not lone specks
    const clumped = id => {
        const v = gridOf(id), seen = new Uint8Array(v.length), W = Dp.w;
        let inBig = 0, all = 0;
        for (const g0 of Dp.cells) {
            if (v[g0] < P0 || seen[g0]) continue;
            const stack = [g0], patch = []; seen[g0] = 1;
            while (stack.length) { const g = stack.pop(); patch.push(g); const y = Math.floor(g / W), x = g % W; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const yy = y + dy; if (yy < 0 || yy >= Dp.h) continue; const h = yy * W + (x + dx + W) % W; if (!seen[h] && v[h] >= P0) { seen[h] = 1; stack.push(h); } } }
            all += patch.length; if (patch.length >= 3) inBig += patch.length;
        }
        return all ? inBig / all : 1;
    };
    const cl = ['porphyry', 'orogenicGold', 'mvt', 'oil', 'coal'].map(id => [id, clumped(id)]);
    check('deposits come in districts: ≥ 60 % of each system\'s ground in patches of 3+ grid cells, not lone specks', cl.every(([, x]) => x >= 0.6), cl.map(([id, x]) => `${id} ${Math.round(100 * x)} %`).join(' · '));
    // the metals, all their sources together: iron the commonest ore by far (the Iron Age's was a question of fuel), gold
    // and tin scarce (developer, 2026-10-20)
    const M = id => { const i = METALS.findIndex(m => m.id === id); return [Dp.metalShares[3 * i] + Dp.metalShares[3 * i + 1] + Dp.metalShares[3 * i + 2], Dp.metalShares[3 * i + 1] + Dp.metalShares[3 * i + 2]]; };
    const [fe, feM] = M('iron'), [cuAll, cuM] = M('copper'), [au, auM] = M('gold'), [snAll, snM] = M('tin');
    check('iron the commonest metal by far (≥ 3 × copper’s ground), gold and tin scarce (each ≤ 2 % of the land moderate or rich)', fe >= 3 * cuAll && auM <= 0.02 && snM <= 0.02,
        `iron ${(100 * fe).toFixed(1)} % (${(100 * feM).toFixed(1)} % moderate+) · copper ${(100 * cuAll).toFixed(1)} % (${(100 * cuM).toFixed(1)}) · gold ${(100 * au).toFixed(1)} % (${(100 * auM).toFixed(1)}) · tin ${(100 * snAll).toFixed(1)} % (${(100 * snM).toFixed(1)})`);
    // (~30 systems, the metals, placers down the rivers: ~7–8 % of a finish, measured 2026-10-20 — 10 % allows for a busy machine)
    check('…and the stage is quick: the deposits under a tenth of the finish', fine.ms.deposits <= 0.1 * Object.values(fine.ms).reduce((a, b) => a + b, 0), `${(fine.ms.deposits / 1000).toFixed(2)} s`);
}

section('G4 — the climate and the rivers');
{
    const { mesh: fm, ocean, climate: { cell: cc } } = fine, gidx = new Int32Array(fm.numCells);
    for (let c = 0; c < fm.numCells; c++) { const x = fm.xyz[3 * c], y = fm.xyz[3 * c + 1], z = fm.xyz[3 * c + 2], la = Math.asin(z) * 180 / Math.PI, lo = Math.atan2(y, x) * 180 / Math.PI; gidx[c] = Math.min(Dp.h - 1, Math.floor((90 - la) / Dp.step)) * Dp.w + Math.min(Dp.w - 1, Math.floor((lo + 180) / Dp.step)); }
    const baux = gridOf('bauxite');
    let b0 = 0, b1 = 0;
    for (let c = 0; c < fm.numCells; c++) if (!ocean[c] && baux[gidx[c]] >= P1) { b0++; if (cc.tAnnual[c] > 19 && cc.pAnnual[c] > 900) b1++; }
    check('bauxite on hot, wet ground (≥ 80 % of its moderate and rich cells: > 19 °C a year, > 900 mm)', b0 > 0 && b1 / b0 >= 0.8, `${b1} of ${b0} cells`);
    // placers: down rivers (a river in the grid cell) from a source (gold within ~150 km upstream: in reach on the grid)
    const pg = gridOf('placerGold'), src = ['orogenicGold', 'epithermal', 'greenstoneGold', 'porphyry', 'reef'].map(gridOf), river = new Uint8Array(Dp.w * Dp.h);
    const q = fine.water?.q ?? null;
    const R6 = Math.ceil(150 / (111 * Dp.step));
    let r0 = 0, r1 = 0;
    for (const g of Dp.cells) {
        if (pg[g] < P0) continue;
        r0++;
        const y = Math.floor(g / Dp.w), x = g % Dp.w;
        let found = false;
        for (let dy = -R6; dy <= R6 && !found; dy++) for (let dx = -R6; dx <= R6 && !found; dx++) { const yy = y + dy; if (yy < 0 || yy >= Dp.h) continue; const h = yy * Dp.w + (x + dx + Dp.w) % Dp.w; if (src.some(v => v[h] >= P0)) found = true; }
        if (found) r1++;
    }
    check('placer gold lies down rivers from gold sources (≥ 90 % of it, any grade, within ~150 km of one)', r0 > 0 && r1 / r0 >= 0.9, `${r1} of ${r0} grid cells`);
    // enriched copper: more of the porphyry ground enriched where it is dry than where it is wet
    const por = gridOf('porphyry'), sup = gridOf('supergene');
    const t = { dry: [0, 0], wet: [0, 0] };
    for (let c = 0; c < fm.numCells; c++) { if (ocean[c] || por[gidx[c]] < P0) continue; const k = cc.pAnnual[c] < 800 ? 'dry' : cc.pAnnual[c] > 1600 ? 'wet' : null; if (!k) continue; t[k][0]++; if (sup[gidx[c]] >= P0) t[k][1]++; }
    const sd = t.dry[0] ? t.dry[1] / t.dry[0] : 0, sw = t.wet[0] ? t.wet[1] / t.wet[0] : 0;
    check('copper enriched under dry skies, not wet ones (enriched share of the porphyry ground: dry > 2 × wet)', t.dry[0] > 0 && sd > 2 * sw, `dry ${Math.round(100 * sd)} % (${t.dry[0]} cells) · wet ${Math.round(100 * sw)} % (${t.wet[0]} cells)`);
    // the climate's tests on observed Earth
    const E = earthDeposits();
    if (!E) check('the climate tests on observed Earth (no reference climate here: node tuning/climate/fetch-references.mjs)', true, 'skipped');
    else for (const [test, words, need] of [['baux', 'bauxite', 0.8], ['peat', 'peat', 0.8], ['evap', 'salt', 0.8], ['semi', 'enriched copper', 0.66], ['arid', 'opal and turquoise', 0.8]]) {
        const ok = E[test].has.filter(([, v]) => v >= 0.4).length, bad = E[test].not.filter(([, v]) => v > 0.15);
        check(`on observed Earth, ${words}'s climate where it really is (≥ ${Math.round(100 * need)} % of its districts) and not where it is not`, ok / E[test].has.length >= need && !bad.length,
            `${ok} of ${E[test].has.length} districts${bad.length ? ` · wrongly at ${bad.map(([nm]) => nm).join(', ')}` : ''}`);
    }
}

section('G5 — resources by age');
{
    const grades = GEOLOGY.deposits.grades, age = id => AGES.find(a => a.id === id);
    const share = (ageId, resId) => landShares(Dp, resourceField(Dp, age(ageId).resources.find(r => r.id === resId)), grades);
    const any = s => s[0] + s[1] + s[2], modPlus = s => s[1] + s[2], pc = x => `${(100 * x).toFixed(1)} %`;
    const cu = ['copper', 'bronze', 'iron', 'industrial'].map(a => any(share(a, 'copper')));
    check('copper grows with the ages: Copper ≤ Bronze ≤ Iron ≤ Industrial Age (its ground)', cu[0] <= cu[1] && cu[1] <= cu[2] && cu[2] <= cu[3] && cu[3] > 0.01, cu.map(pc).join(' ≤ '));
    const tin = share('bronze', 'tin');
    check('tin scarce in the Bronze Age: ≤ 1 % of the land moderate or rich', modPlus(tin) <= 0.01, `${pc(any(tin))} of the land, ${pc(modPlus(tin))} moderate or rich`);
    const bronze = landShares(Dp, potentialField(Dp, age('bronze')), grades);
    check('bronze can be made in a few places only: its potential on ≤ 5 % of the land', any(bronze) <= 0.05, `${pc(any(bronze))} (${pc(modPlus(bronze))} moderate or rich)`);
    const fe = share('iron', 'iron');
    check('iron everywhere in the Iron Age: on ≥ 10 % of the land', any(fe) >= 0.1, `${pc(any(fe))} (${pc(modPlus(fe))} moderate or rich)`);
    // (the Industrial Age's metals together, moderate or better, weighed by the land)
    const ind = age('industrial').resources.filter(r => r.id !== 'coal' && r.id !== 'oilGas').map(r => resourceField(Dp, r));
    let lit = 0, all = 0;
    for (let j = 0; j < Dp.cells.length; j++) { const L = Dp.land[j]; if (!L) continue; all += L; if (ind.some(f => f[j] >= grades[1])) lit += L; }
    check('the Industrial map does not light up the planet: ≤ 35 % of the land has a metal moderate or rich', lit / all <= 0.35, pc(lit / all));
}

section('G6 — districts, stories, exports');
{
    const metalRow = id => { const i = METALS.findIndex(m => m.id === id), f = new Float32Array(K); for (let j = 0; j < K; j++) f[j] = Dp.data[(DEPOSITS.length + i) * K + j] / 255; return f; };
    const L = landmasses(Dp), t0 = performance.now();
    const ds = Object.fromEntries(METALS.filter(m => m.id !== 'wood').map(m => [m.id, findDistricts(Dp, metalRow(m.id))]));
    const findMs = performance.now() - t0;
    let on = 0, all = 0;
    for (const [id, list] of Object.entries(ds)) if (id !== 'oilGas') for (const d of list) { all++; if (d.landmass >= 0) on++; }
    check('districts lie on land (≥ 95 % of every metal\'s, oil and gas aside, on a landmass)', all > 0 && on / all >= 0.95, `${on} of ${all}`);
    const n = id => ds[id].length;
    check('the scarce metals have few districts: tin fewer than copper, gold fewer than iron', n('tin') < n('copper') && n('gold') < n('iron'), `tin ${n('tin')} · copper ${n('copper')} · gold ${n('gold')} · iron ${n('iron')}`);
    // stories: read off the record under each district (its finish cells' record cells), not the kind's generic words
    const recOf = Array.from({ length: K }, () => []), kept = new Int32Array(Dp.w * Dp.h).fill(-1);
    for (let j = 0; j < K; j++) kept[Dp.cells[j]] = j;
    {
        const { mesh: fm } = fine, rec = fine.geology.rec;
        for (let c = 0; c < fm.numCells; c++) {
            const la = Math.asin(fm.xyz[3 * c + 2]) * 180 / Math.PI, lo = Math.atan2(fm.xyz[3 * c + 1], fm.xyz[3 * c]) * 180 / Math.PI;
            const j = kept[Math.min(Dp.h - 1, Math.floor((90 - la) / Dp.step)) * Dp.w + Math.min(Dp.w - 1, Math.floor((lo + 180) / Dp.step))];
            if (j >= 0 && recOf[j].length < 3) recOf[j].push(rec[c]);
        }
    }
    let told = 0, tales = 0;
    for (const id of ['copper', 'gold']) for (const d of ds[id].slice(0, 12)) {
        const src = districtSource(Dp, METALS.find(m => m.id === id).sources, d.j);
        if (!src || !['porphyry', 'orogenicGold', 'epithermal', 'vms'].includes(src.id)) continue;
        const words = DEPOSITS.find(x => x.id === src.id).words, story = districtStory(src.id, last, [d.j, ...d.cells.slice(0, 15)].flatMap(j => recOf[j]));
        tales++; if (story.toLowerCase() !== words.toLowerCase()) told++;
    }
    check('stories read the history: ≥ 70 % of the richest arc and belt districts tell of their own arc or belt', tales > 0 && told / tales >= 0.7, `${told} of ${tales}`);
    const sums = landmassShares(Dp, ['iron', 'copper', 'gold', 'tin'].map(metalRow));
    const over = sums.filter(x => { for (let f = 0; f < 4; f++) if (x.by[3 * f] + x.by[3 * f + 1] + x.by[3 * f + 2] > x.km2 * 1.0001) return true; return false; }).length;
    check('the landmasses\' summaries add up (no resource over its landmass\'s land), largest first', over === 0 && L.list.every((l, i) => !i || l.km2 <= L.list[i - 1].km2),
        `${L.list.length} landmasses, the largest ${(L.list[0]?.km2 / 1e6).toFixed(1)} million km²`);
    // the files, from the picture the page has
    const raster = finishRaster(fine.mesh, fine.z, fine.ocean, 1024, null, fine.lake, fine.lakeLevel, fine.climate.cell, fine.geology), F = { raster };
    const t1 = performance.now(), rows = districtRows(F, last), atlas = resourceAtlas(F, last, { seed: SEED }), fileMs = performance.now() - t1;
    const gj = JSON.parse(districtsGeoJson(rows)), csv = districtsCsv(rows).trim().split('\n');
    check('the exports well formed: GeoJSON a point per district, CSV a row each, the atlas a section per landmass',
        gj.features.length === rows.length && csv.length === rows.length + 1 && gj.features.every(x => x.geometry.coordinates.length === 2) && /## The world's richest/.test(atlas) && /## The largest/.test(atlas),
        `${rows.length} districts · atlas ${atlas.length.toLocaleString()} characters`);
    const masks = await resourceMasks(F, 512);
    check('…and a greyscale mask per metal, fuel and gem', masks.length === METALS.length + AGES.find(a => a.id === 'gems').resources.length, `${masks.length} masks`);
    check('…all quick: every metal\'s districts, every row with its story, and the atlas under a second', findMs + fileMs < 1000, `districts ${findMs.toFixed(0)} ms · rows and atlas ${fileMs.toFixed(0)} ms`);
}

section('G7 — gems');
{
    const modPlus = id => { const k = DEPOSIT_INDEX[id]; return Dp.shares[3 * k + 1] + Dp.shares[3 * k + 2]; }, pc = x => `${(100 * x).toFixed(2)} %`;
    const gems = DEPOSITS.filter(d => d.group === 'gem').map(d => d.id), heavy = gems.filter(id => modPlus(id) > (id === 'garnet' ? 0.05 : 0.015));
    check('gems scarce: each on ≤ 1.5 % of the land moderate or rich (garnet, the commonest, ≤ 5 %)', heavy.length === 0, gems.map(id => `${id} ${pc(landShare(id))}`).join(' · '));
    check('the rarest rarest: emerald ≤ ⅓ of the pegmatite gems\' ground, lapis ≤ ⅓ of ruby and sapphire\'s', landShare('emerald') <= landShare('pegmatite') / 3 && landShare('lapis') <= landShare('corundum') / 3,
        `emerald ${pc(landShare('emerald'))} · pegmatite ${pc(landShare('pegmatite'))} · lapis ${pc(landShare('lapis'))} · ruby and sapphire ${pc(landShare('corundum'))}`);
    const COLL = new Set([OrogenyType.URAL, OrogenyType.HIMALAYAN, OrogenyType.TRANSPRESSION]);
    const belts = near(w => last.owner[w] >= 0 && last.type[w] !== CrustType.OCEAN && (COLL.has(last.oroType[w]) || COLL.has(last.prevType[w]) || !!(last.flags[w] & CrustFlag.SUTURE) || (last.oroType[w] > 0 && last.oroLast[w] < 0)), 250);
    const [c1, c0] = where('corundum', P0, g => belts[simAt(g)] < 250);
    check('rubies and sapphires in collision belts, live or old (≥ 85 % within 250 km of one)', c0 === 0 || c1 / c0 >= 0.85, `${c1} of ${c0} grid cells`);
    const lips = near(w => last.owner[w] >= 0 && last.volcType[w] === VolcanicType.LIP, 150);
    const [a1, a0] = where('amethyst', P0, g => lips[simAt(g)] < 150);
    check('amethyst geodes on flood basalts (≥ 85 % within 150 km of one)', a0 === 0 || a1 / a0 >= 0.85, `${a1} of ${a0} grid cells`);
    const { mesh: fm, ocean, climate: { cell: cc } } = fine, op = gridOf('opal');
    let o0 = 0, o1 = 0;
    for (let c = 0; c < fm.numCells; c++) {
        if (ocean[c]) continue;
        const la = Math.asin(fm.xyz[3 * c + 2]) * 180 / Math.PI, lo = Math.atan2(fm.xyz[3 * c + 1], fm.xyz[3 * c]) * 180 / Math.PI;
        if (op[Math.min(Dp.h - 1, Math.floor((90 - la) / Dp.step)) * Dp.w + Math.min(Dp.w - 1, Math.floor((lo + 180) / Dp.step))] < P1) continue;
        o0++; if (cc.pAnnual[c] < 800) o1++;
    }
    check('opal in dry country (≥ 80 % of its moderate and rich cells under 800 mm a year)', o0 === 0 || o1 / o0 >= 0.8, `${o1} of ${o0} cells`);
}

finish('Geology');
