// Headless acceptance checks for Phase 3 (the generated start world).
// Usage: node v2/tools/check-phase3.mjs      — runs every guarantee across many seeds and settings.

import { check, section, finish, labMesh, checkLabPhaseLoads, LAB_MESH_SEED } from './lib/check-kit.mjs';
import { TECTONICS } from '../js/tectonics/config.js';
import { buildStartWorld } from '../js/tectonics/init/start-world.js';
import { measureStartWorld } from '../js/tectonics/init/measure-start.js';
import { buildNudgeScene, NUDGE_MAX_MYR } from '../js/tectonics/scenarios/start-world-nudge.js';
import { simulate } from '../js/tectonics/simulate.js';
import { frameTallies } from '../js/tectonics/measure.js';
import { createPhase } from '../js/app/phases/phase3-start-world.js';
import { CrustType } from '../js/tectonics/model/crust.js';
import { BoundaryKind } from '../js/tectonics/model/world.js';

const range = (list, f) => `${Math.min(...list.map(f)).toFixed(f.digits ?? 0)}–${Math.max(...list.map(f)).toFixed(f.digits ?? 0)}`;

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12345, 777777];
const mesh = labMesh();      // one mesh for all worlds, as in the lab: the seed only drives the layout

section('defaults, many seeds');
const t0 = performance.now();
const runs = SEEDS.map(seed => { const { world, start } = buildStartWorld(mesh, seed); return { seed, start, m: measureStartWorld(world, start) }; });
console.log(`${runs.length} start worlds generated + measured in ${(performance.now() - t0).toFixed(0)} ms; attempts per seed: ${runs.map(r => r.start.attempts).join(' ')}`);
const all = (test) => runs.filter(r => !test(r)).map(r => r.seed);
const report = (name, test, detail) => { const bad = all(test); check(name, bad.length === 0, detail + (bad.length ? ` — FAILING SEEDS: ${bad.join(', ')}` : '')); };
const C = TECTONICS;

report('craton count', r => r.m.cratons.length === C.cratonCount && r.m.cratons.every(k => k.areaKm2 > 0), `${C.cratonCount} cratons in every world`);
report('space between cratons', r => r.m.minGapKm >= C.cratonMinGapKm, `smallest gap per world ${range(runs, r => r.m.minGapKm)} km (required ≥ ${C.cratonMinGapKm})`);
report('space between cratons and the sea', r => r.m.minCoastKm >= C.cratonMinCoastKm, `smallest distance per world ${range(runs, r => r.m.minCoastKm)} km (required ≥ ${C.cratonMinCoastKm})`);
report('variety of craton size', r => r.m.cratonSizeRatio >= 2 && r.m.cratons.every(k => k.diameterKm > 650 && k.diameterKm < 4400),
    `largest ÷ smallest diameter ${range(runs, Object.assign(r => r.m.cratonSizeRatio, { digits: 1 }))}×; diameters ${range(runs, r => Math.min(...r.m.cratons.map(k => k.diameterKm)))} to ${range(runs, r => Math.max(...r.m.cratons.map(k => k.diameterKm)))} km`);
report('variety of terrane size', r => r.m.terraneSizeRatio >= 1.8, `largest ÷ smallest terrane area ${range(runs, Object.assign(r => r.m.terraneSizeRatio, { digits: 1 }))}×`);
// (S1 of plans/V2_START_WORLD_PLAN.md: cratons are fragments in clusters, not lobed blobs sprinkled evenly — the lobed
// blobs measured 0.25–0.44 here)
report('cratons are compact fragments, no slivers', r => r.m.cratonCompactMin >= 0.4,
    `least compact craton per world ${range(runs, Object.assign(r => r.m.cratonCompactMin, { digits: 2 }))} (nearest outside ÷ radius of a disc of its area; ≥ 0.4)`);
report('cratons cluster into proto-continents', r => r.m.clusterContrast && r.m.clusterContrast.ratio >= 1.5,
    `gap between clusters ÷ gap between cluster-mates ${range(runs, Object.assign(r => r.m.clusterContrast?.ratio ?? 0, { digits: 1 }))}× (median ${range(runs, r => r.m.clusterContrast?.interKm ?? 0)} vs ${range(runs, r => r.m.clusterContrast?.intraKm ?? 0)} km; ≥ 1.5×)`);
check('some cratons come as sibling pairs', runs.filter(r => r.m.siblingPairs > 0).length >= runs.length / 2,
    `sibling pairs per world: ${runs.map(r => r.m.siblingPairs).join(' ')}`);
// (S2: the old ranges follow the assembly — a few long seams — not a noise-masked honeycomb ringing every craton. The
// honeycomb, on 8 seeds: 35–40 % of the land within 500 km of one, as much raised ground (5–6 %). Neither a count of
// connected pieces nor the longest one tells them apart: a honeycomb's segments, where they join, count as one long belt
// — its longest ran 2900–7400 km — so they are only reported)
report('old ranges follow a few long seams, not every craton', r => r.m.oldRanges.nearShare <= 0.33,
    `${range(runs, r => 100 * r.m.oldRanges.nearShare)} % of the land within 500 km of an old range (≤ 33 %; ${range(runs, r => 100 * r.m.oldRanges.raisedShare)} % raised); the longest ${range(runs, r => r.m.oldRanges.longestKm)} km`);
report('continental fraction', r => Math.abs(r.m.continentalFraction - C.continentalFraction) < 0.015, `${range(runs, Object.assign(r => r.m.continentalFraction * 100, { digits: 1 }))} % of the surface (target ${(C.continentalFraction * 100).toFixed(0)} %)`);
report('craton share', r => r.m.cratonShare < C.cratonShare + 0.04 && r.m.cratonShare > C.cratonShare * C.cratonMinAreaScale * 0.8,
    `${range(runs, r => r.m.cratonShare * 100)} % of continental crust (asked ${(C.cratonShare * 100).toFixed(0)} %; craton size factor used: ${range(runs, Object.assign(r => r.start.cratonAreaScale, { digits: 2 }))})`);
report('one landmass, no inland seas', r => r.m.strayLandCells === 0 && r.m.enclosedSeaCells === 0, 'no stray land cells, no enclosed sea cells');
report('not more than half-way round', r => r.m.longestAxisDeg <= 172, `longest axis ${range(runs, r => r.m.longestAxisDeg)}°`);
report('ocean apron', r => r.m.minApronKm >= C.apronKm - mesh.edgeKm, `narrowest apron per world ${range(runs, r => r.m.minApronKm)} km (target ${C.apronKm}, cell size ${mesh.edgeKm.toFixed(0)})`);
report('trench line is smoother than the coast', r => r.m.rimCells < 0.95 * r.m.coastCells, `rim ÷ coast length ${range(runs, Object.assign(r => r.m.rimCells / r.m.coastCells, { digits: 2 }))}`);
report('rim trench', r => r.m.trenchOffRim === 0 && Math.abs(r.m.trenchCoverage - C.rimTrenchCoverage) < 0.08, `on ${range(runs, r => r.m.trenchCoverage * 100)} % of the rim (target ${C.rimTrenchCoverage * 100} %), never off the rim`);
{
    const sutures = runs.map(r => r.m.sutureShare * 100);
    check('suture belts exist', sutures.every(s => s > 3 && s < 30), `${Math.min(...sutures).toFixed(0)}–${Math.max(...sutures).toFixed(0)} % of the land is suture belt`);
    const centres = runs.map(r => r.start.centre);
    let closest = Infinity;
    for (let i = 0; i < centres.length; i++) for (let j = i + 1; j < centres.length; j++)
        closest = Math.min(closest, Math.acos(centres[i][0] * centres[j][0] + centres[i][1] * centres[j][1] + centres[i][2] * centres[j][2]) * 180 / Math.PI);
    check('seeds give different worlds', closest > 1, `closest pair of supercontinent centres is ${closest.toFixed(0)}° apart`);
}

section('slider ranges');
{   // The spacing promises hold at both ends of every slider the lab offers (read from the lab module, so the two cannot drift apart).
    const sliders = createPhase(mesh, LAB_MESH_SEED).params.filter(p => !p.options);
    const settings = sliders.flatMap(p => [{ [p.id]: p.min }, { [p.id]: p.max }]);
    for (const end of ['min', 'max']) settings.push(Object.fromEntries(sliders.filter(p => /^cratonMin/.test(p.id)).map(p => [p.id, p[end]])));
    const bad = [];
    let worstGap = Infinity, worstCoast = Infinity;
    for (const o of settings) for (const seed of [3, 8]) {
        try {
            const { world, start } = buildStartWorld(mesh, seed, o), cfg = world.config, m = measureStartWorld(world, start);
            worstGap = Math.min(worstGap, m.minGapKm - cfg.cratonMinGapKm); worstCoast = Math.min(worstCoast, m.minCoastKm - cfg.cratonMinCoastKm);
            if (m.minGapKm < cfg.cratonMinGapKm || m.minCoastKm < cfg.cratonMinCoastKm || m.strayLandCells || m.enclosedSeaCells || m.cratons.length !== cfg.cratonCount) bad.push(JSON.stringify(o) + ' seed ' + seed);
        } catch (e) { bad.push(JSON.stringify(o) + ' seed ' + seed + ': ' + e.message); }
    }
    check('guarantees hold across the slider ranges', bad.length === 0,
        bad.length ? bad.join(' | ') : `${settings.length} settings × 2 seeds: tightest margin over the required gap +${worstGap.toFixed(0)} km, over the required coast distance +${worstCoast.toFixed(0)} km`);
}

{   // sliders that compete: the continental fraction is honoured and craton size gives way
    const settings = [
        { cratonMinGapKm: 900 }, { cratonMinCoastKm: 900 }, { cratonMinGapKm: 900, cratonMinCoastKm: 900 }, { continentalFraction: 0.2 },
        { continentalFraction: 0.2, cratonMinGapKm: 800, cratonMinCoastKm: 700 }, { continentalFraction: 0.24, cratonCount: 12, cratonMinGapKm: 700 }, { cratonShare: 0.4, cratonMinGapKm: 800 },
    ];
    const rows = [], bad = [];
    for (const o of settings) for (const seed of [3, 8, 11]) {
        let built;
        try { built = buildStartWorld(mesh, seed, o); } catch (err) { bad.push(`${JSON.stringify(o)} seed ${seed}: ${err.message}`); continue; }
        const { world, start } = built, cfg = world.config, m = measureStartWorld(world, start);
        const off = m.continentalFraction - cfg.continentalFraction;
        rows.push({ off, scale: start.cratonAreaScale });
        if (Math.abs(off) > 0.01 || m.minGapKm < cfg.cratonMinGapKm || m.minCoastKm < cfg.cratonMinCoastKm) bad.push(`${JSON.stringify(o)} seed ${seed}: land ${(m.continentalFraction * 100).toFixed(1)} % vs ${cfg.continentalFraction * 100} %, gap ${m.minGapKm.toFixed(0)}, coast ${m.minCoastKm.toFixed(0)}, size factor ${start.cratonAreaScale.toFixed(2)}`);
    }
    const worst = Math.max(...rows.map(r => Math.abs(r.off))) * 100, shrunk = rows.filter(r => r.scale < 1).length;
    check('competing sliders: land fraction holds, cratons give way', bad.length === 0,
        bad.length ? bad.join(' | ') : `${rows.length} demanding worlds: land within ${worst.toFixed(2)} points of the request in every one, spacing minimums all met; cratons had to shrink in ${shrunk} of them (smallest size factor ${Math.min(...rows.map(r => r.scale)).toFixed(2)})`);
}

section('the nudge: smooth offshore trench, one clean wake');
const LEADING_COS = Math.cos(50 * Math.PI / 180);      // "leading" = within ±50° of the heading, seen from the plate's centre
/** cos of the angle between the heading and the direction from the plate's centre to position index `i` of `xyz`. */
function headingCos(xyz, i, centre, heading) {
    const p = [xyz[3 * i], xyz[3 * i + 1], xyz[3 * i + 2]], k = p[0] * centre[0] + p[1] * centre[1] + p[2] * centre[2];
    const t = [p[0] - k * centre[0], p[1] - k * centre[1], p[2] - k * centre[2]], length = Math.hypot(t[0], t[1], t[2]) || 1;
    return (t[0] * heading[0] + t[1] * heading[1] + t[2] * heading[2]) / length;
}
function nudge(seed, overrides) {
    const scene = buildNudgeScene(mesh, seed, overrides), continent = scene.world.plates[scene.start.continentId];
    const landBefore = Uint8Array.from(continent.crust.mask, (m, c) => (m && continent.crust.type[c] !== CrustType.OCEAN ? 1 : 0));
    const { frames } = simulate(scene.world, { untilMyr: NUDGE_MAX_MYR, drive: scene.drive, snapshotEveryMyr: 10, events: false });
    let landChanged = 0, ahead = 0, behind = 0;
    const { xyz, numCells } = mesh, h = scene.heading, mid = scene.start.centre;
    for (let c = 0; c < numCells; c++) {
        const isLand = continent.crust.mask[c] && continent.crust.type[c] !== CrustType.OCEAN ? 1 : 0;
        if (isLand !== landBefore[c]) landChanged++;
        if (!continent.crust.mask[c] || continent.crust.formedAt[c] < 0) continue;
        // New crust, in the plate's own frame (= its starting position). "Ahead" is the leading rim proper; the
        // flanks slide past the old ocean and do shed slivers — that is a transform margin, not a wake.
        const along = headingCos(xyz, c, mid, h);
        if (along > LEADING_COS) ahead++; else if (along < 0) behind++;
    }
    const last = frames.at(-1);
    let trenchOnLand = 0, trenchOnApron = 0;
    for (let w = 0; w < numCells; w++) if (last.boundary[w] === BoundaryKind.OVERRIDING) { if (last.type[w] === CrustType.OCEAN) trenchOnApron++; else trenchOnLand++; }
    // new crust sitting ON a trench, summed over every recorded frame — the artifact to rule out
    // (world cells judged against the starting centre: the plate moves < 11° in the run)
    let newCrustAtTrench = 0, trenchCellFrames = 0, leadingNew = 0, leadingTrench = 0;
    for (const fr of frames) for (let w = 0; w < numCells; w++) {
        if (fr.boundary[w] !== BoundaryKind.OVERRIDING) continue;
        const isNew = fr.type[w] === CrustType.OCEAN && fr.formedAt[w] >= 0, leading = headingCos(xyz, w, mid, h) > LEADING_COS;
        trenchCellFrames++; if (isNew) newCrustAtTrench++;
        if (leading) { leadingTrench++; if (isNew) leadingNew++; }
    }
    return { frames, landChanged, ahead, behind, trenchOnLand, trenchOnApron, newCrustAtTrench, trenchCellFrames, leadingNew, leadingTrench, gaps: Math.max(...frames.map(f => frameTallies(f).gaps)) };
}
for (const seed of [2, 12345]) {
    const withApron = nudge(seed, {}), coastHugging = nudge(seed, { apronKm: 0, apronSmoothKm: 0 });
    check(`nudge, seed ${seed}: crust rules hold`, withApron.gaps === 0 && withApron.landChanged === 0, `${withApron.gaps} gap cells, ${withApron.landChanged} land cells changed`);
    check(`nudge, seed ${seed}: the trench is offshore`, withApron.trenchOnApron > 40 && withApron.trenchOnLand <= 0.05 * withApron.trenchOnApron,
        `overriding-edge cells at ${NUDGE_MAX_MYR} Myr: ${withApron.trenchOnApron} on apron ocean, ${withApron.trenchOnLand} on land`);
    check(`nudge, seed ${seed}: the leading trench is made of old crust`, withApron.leadingTrench > 100 && withApron.leadingNew <= 0.06 * withApron.leadingTrench,   // a hook in an irregular coast is locally a trailing edge and sheds a little wake
        `leading-rim trench cells made of newly formed crust: ${withApron.leadingNew} of ${withApron.leadingTrench} cell-frames`);
    check(`nudge, seed ${seed}: a smooth rim sheds far less new crust than a coast-hugging plate`, withApron.newCrustAtTrench <= 0.9 * coastHugging.newCrustAtTrench && withApron.newCrustAtTrench <= 0.12 * withApron.trenchCellFrames,
        `new-crust trench cells over the whole rim (flanks included): ${withApron.newCrustAtTrench} of ${withApron.trenchCellFrames} vs ${coastHugging.newCrustAtTrench} of ${coastHugging.trenchCellFrames} coast-hugging`);
    check(`nudge, seed ${seed}: new crust trails the plate`, withApron.behind > 200 && withApron.ahead <= 0.05 * withApron.behind,
        `new-ocean cells in the trailing wake: ${withApron.behind}; within ±50° of the heading: ${withApron.ahead} (flank slivers where the rim slides past old ocean; coast-hugging plate: ${coastHugging.ahead})`);
}

section('lab');
await checkLabPhaseLoads('../../js/app/phases/phase3-start-world.js', mesh, LAB_MESH_SEED, [{}, { cratonCount: 12, coastReliefKm: 0 }]);

finish('Phase 3');
