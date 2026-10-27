// Headless acceptance checks for Phase 7c (the crust budget: erosive margins, underthrusting, arc recycling).
// Usage: node v2/tools/check-phase7c.mjs

import { check, section, finish, labMesh, checkLabPhaseLoads, LAB_MESH_SEED, isLand, countWhere, nearestFrame } from './lib/check-kit.mjs';
import { simulate } from '../js/tectonics/simulate.js';
import { BUDGET_SCENES } from '../js/tectonics/scenarios/budget-scenes.js';
import { frameTallies, Margin } from '../js/tectonics/measure.js';
import { CrustType, CrustFlag } from '../js/tectonics/model/crust.js';
import { EventKind } from '../js/tectonics/model/world.js';

const SEED = 12345, SNAPSHOT_MYR = 2;
const mesh = labMesh(), { numCells, cellAreaKm2 } = mesh;
const Mkm2 = cells => cells * cellAreaKm2 / 1e6;

function run(id, overrides = {}, untilMyr = null) {
    const scene = BUDGET_SCENES.find(s => s.id === id), world = scene.build(mesh, SEED);
    Object.assign(world.config, overrides);
    const started = performance.now();
    const { frames } = simulate(world, { untilMyr: untilMyr ?? scene.maxMyr, drive: w => scene.drive(w), snapshotEveryMyr: SNAPSHOT_MYR });
    return { world, frames, last: frames.at(-1), seconds: (performance.now() - started) / 1000, events: world.events, budget: world.budget };
}
const land = f => countWhere(numCells, w => isLand(f, w));
// (craton crust counted on the plates themselves: the world grid's count moves by a few cells with where the plates sit —
// 126…131 for the same 128 cells of craton — and two runs that differ end with their plates in slightly different places)
const cratons = world => world.plates.reduce((n, p) => n + (p.alive ? countWhere(numCells, c => p.crust.mask[c] && p.crust.type[c] === CrustType.CRATON) : 0), 0);

section('erosive and accretionary margins');
{
    const r = run('erosion'), off = run('erosion', { marginErosiveShare: 0 });
    let erosive = 0, accretionary = 0;
    for (const f of r.frames) for (let w = 0; w < numCells; w++) if ((f.margin[w] & Margin.TYPE) === Margin.ACTIVE) { if (f.margin[w] & Margin.EROSIVE) erosive++; else accretionary++; }
    const share = erosive / Math.max(1, erosive + accretionary);
    check('one active coast has both kinds of stretch: erosive and accretionary', share >= 0.2 && share <= 0.8, `${(100 * share).toFixed(0)} % of active-coast cell-frames erosive`);
    check('an erosive coast retreats: its land turns to fore-arc sea', r.budget.erodedCells * cellAreaKm2 >= 1e5, `${Mkm2(r.budget.erodedCells).toFixed(2)} Mkm² of coast eaten in ${r.last.time} Myr`);
    check('…and never a craton', cratons(r.world) >= cratons(off.world), `${cratons(r.world)} craton cells at the end, ${cratons(off.world)} with every margin accretionary`);
    // (a fore-arc island keeps its flag after it has grown into the mainland)
    const isles = countWhere(numCells, w => r.last.owner[w] >= 0 && (r.last.flags[w] & CrustFlag.MARGIN_ISLE));
    check('the accretionary stretches still build islands', isles > 0, `${isles} cells of fore-arc island, standing or grown into the coast`);
    check('with every margin accretionary, nothing is eaten and more land is left', off.budget.erodedCells === 0 && land(off.last) > land(r.last),
        `erosion off: ${land(off.last)} land cells at the end; on: ${land(r.last)}`);
    check('no gaps', r.frames.every(f => frameTallies(f).gaps === 0), 'every frame');
}

section('a continent slides under another (underthrusting)');
{
    const r = run('india'), off = run('india', { underthrustShare: 0 });
    const sutureOf = x => x.events.find(e => e.kind === EventKind.SUTURE);
    const suture = sutureOf(r);
    check('India reaches Asia and they weld', !!suture, suture ? suture.text.slice(0, 120) : 'no suture');
    check('as they converge, India’s land in the overlap slides under Asia', r.budget.underthrustCells >= 5, `${r.budget.underthrustCells} cells (${Mkm2(r.budget.underthrustCells).toFixed(2)} Mkm²) consumed`);
    const maxThick = f => { let m = 0; for (let w = 0; w < numCells; w++) if (isLand(f, w)) m = Math.max(m, f.thickKm[w]); return m; };
    check('Asia’s crust above it thickens — a plateau to come', maxThick(r.last) >= 20, `thickest crust ${maxThick(r.last).toFixed(1)} km above normal (without underthrusting: ${maxThick(off.last).toFixed(1)})`);
    if (suture) {
        const before = nearestFrame(r.frames, suture.time - 10), after = nearestFrame(r.frames, suture.time + 4);
        check('the collision makes no land', land(after) <= land(before) + 0.01 * land(before), `${land(before)} land cells 10 Myr before the weld, ${land(after)} just after`);
    }
    check('with underthrusting off, nothing is consumed', off.budget.underthrustCells === 0, `${off.budget.underthrustCells} cells`);
}

section('small arcs go down, big arcs accrete');
{
    const r = run('arcs'), off = run('arcs', { arcAccreteMinKm2: 0 });
    const recycled = r.events.filter(e => e.kind === EventKind.ARC_RECYCLED);
    check('small arc pieces reaching a continent go down with their slab', r.budget.recycledCells > 0, `${Mkm2(r.budget.recycledCells).toFixed(2)} Mkm² of arc recycled; ${recycled.length} pieces worth naming`);
    const docked = r.events.filter(e => e.kind === EventKind.DOCK && e.data.arc);
    check('every arc that docks whole is big enough to keep', docked.every(e => e.data.areaMkm2 * 1e6 >= r.world.config.arcAccreteMinKm2), `${docked.length} arc dockings: ${docked.map(e => `${(e.data.areaMkm2 * 1000).toFixed(0)}k km²`).join(', ') || 'none'}`);
    check('with recycling off, every scrap accretes', off.budget.recycledCells === 0 && !off.events.some(e => e.kind === EventKind.ARC_RECYCLED), `recycling off: ${off.budget.recycledCells} cells recycled`);
}

section('the budget over 1000 Myr');
{
    const r = run('history', {}, 1000), at = t => land(nearestFrame(r.frames, t));
    const start = at(0), t300 = at(300), end = at(1000);
    check('continents grow (developer: growth, not a steady state)…', end >= 1.05 * start, `land ${(100 * start / numCells).toFixed(1)} % of the planet at the start, ${(100 * t300 / numCells).toFixed(1)} % at 300 Myr, ${(100 * end / numCells).toFixed(1)} % at 1000 Myr`);
    check('…but not without bound: after the first assembly, land changes little', end <= 1.4 * start && Math.abs(end / t300 - 1) <= 0.15,
        `× ${(end / start).toFixed(2)} over 1000 Myr; × ${(end / t300).toFixed(2)} from 300 to 1000 Myr`);
    const b = r.budget;
    check('all three sinks are at work in a whole history', b.erodedCells > 0 && b.underthrustCells > 0 && b.recycledCells > 0,
        `eroded ${Mkm2(b.erodedCells).toFixed(1)}, underthrust ${Mkm2(b.underthrustCells).toFixed(1)}, arcs recycled ${Mkm2(b.recycledCells).toFixed(1)} Mkm²`);
    check('no gaps; 1000 Myr within two minutes', r.frames.every(f => frameTallies(f).gaps === 0) && r.seconds < 120, `${r.seconds.toFixed(0)} s`);
}

section('lab');
await checkLabPhaseLoads('../../js/app/phases/phase7c-budget.js', mesh, LAB_MESH_SEED, BUDGET_SCENES.filter(s => s.id !== 'history').map(s => ({ scene: s.id })));

finish('Phase 7c');
