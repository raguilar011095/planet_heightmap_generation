// Headless acceptance checks for Phase 6a (rifting).
// Usage: node v2/tools/check-phase6.mjs

import { check, section, finish, labMesh, checkLabPhaseLoads, LAB_MESH_SEED, isLand, landCount, countWhere } from './lib/check-kit.mjs';
import { PLANET_RADIUS_KM } from '../js/core/sim-mesh.js';
import { RIFT_SCENES } from '../js/tectonics/scenarios/rift-scenes.js';
import { simulate } from '../js/tectonics/simulate.js';
import { updatePlateMotion } from '../js/tectonics/step/torque-balance.js';
import { frameTallies } from '../js/tectonics/measure.js';
import { CrustType, CrustFlag, OrogenyType } from '../js/tectonics/model/crust.js';
import { BoundaryKind, EventKind } from '../js/tectonics/model/world.js';
import { findRift, chooseJunction } from '../js/tectonics/ops/rift.js';
import { pullAxisOf } from '../js/tectonics/step/rifting.js';

const SEED = 12345, SNAPSHOT_MYR = 2;
const mesh = labMesh(), { numCells, xyz } = mesh;
const flagged = (f, flag) => countWhere(numCells, w => f.owner[w] >= 0 && (f.flags[w] & flag));
const continental = f => f.plates.filter(p => p.alive && !p.isBackground);

function run(id, overrides = {}, untilMyr = null, prepare = null) {
    const scene = RIFT_SCENES.find(s => s.id === id), world = scene.build(mesh, SEED);
    Object.assign(world.config, overrides);
    prepare?.(world);
    const { frames, steps } = simulate(world, { untilMyr: untilMyr ?? scene.maxMyr, drive: updatePlateMotion, snapshotEveryMyr: SNAPSHOT_MYR });
    return { scene, world, frames, steps, events: world.events, at: t => frames.find(f => Math.abs(f.time - t) < 1e-6) };
}

section('the rift path');
{
    // on the start world's supercontinent, from many junctions: never through a craton, mostly along the sutures
    const world = RIFT_SCENES.find(s => s.id === 'breakup').build(mesh, SEED), plate = world.plates[0];
    for (const p of world.plates) p.refreshExtent(xyz);
    let paths = 0, cratonCells = 0, weakCells = 0, cells = 0, tortuosity = 0;
    // (most junctions give no rift: too near a coast for arms 135° apart, or they would cut off under riftMinPieceShare of the land)
    for (let i = 0; i < 120 && paths < 8; i++) {
        const j = chooseJunction(world, plate, world.rng), rift = j >= 0 ? findRift(world, plate, j, pullAxisOf(plate, mesh)) : null;
        if (!rift) continue;
        paths++;
        for (const c of rift.path) { cells++; if (plate.crust.type[c] === CrustType.CRATON) cratonCells++; if (plate.crust.flags[c] & CrustFlag.SUTURE) weakCells++; }
        const a = rift.path[0], b = rift.path.at(-1);
        const chord = Math.acos(Math.min(1, xyz[3 * a] * xyz[3 * b] + xyz[3 * a + 1] * xyz[3 * b + 1] + xyz[3 * a + 2] * xyz[3 * b + 2])) * PLANET_RADIUS_KM;
        tortuosity = Math.max(tortuosity, rift.path.length * mesh.edgeKm / chord);
    }
    check('rifts never cut a craton', paths >= 6 && cratonCells === 0, `${paths} rifts found from random junctions, ${cratonCells} craton cells on them`);
    // (a preference, not a rule: over a long history about half of the rift length follows old weak lines — Phase 13, developer;
    // since the crust's grain bends rifts — "way too straight … rectangle continents" — it competes with the sutures: ≥ 15 %.
    // Since the start world is assembled (plans/V2_START_WORLD_PLAN.md S2) its weak seams are the major and inner ones only,
    // 4–6 % of the land where the honeycomb of terrane borders was 7–10 %, so rifts from RANDOM junctions find fewer: 19 → 13 %;
    // ≥ 12 %)
    check('rifts follow the old sutures a good part of the way', weakCells / cells >= 0.12, `${(100 * weakCells / cells).toFixed(0)} % of rift cells lie on a suture`);
    check('rifts zig-zag but do not meander', tortuosity <= world.config.riftTortuosityMax + 0.05, `longest path ÷ end-to-end distance: ${tortuosity.toFixed(2)} (cap ${world.config.riftTortuosityMax})`);
}

section('a plume splits a continent');
{
    const r = run('plume'), rift = r.events.find(e => e.kind === EventKind.RIFT);
    check('the plume forces a rift at 20 Myr', !!rift && Math.abs(rift.time - 20) < 1e-6 && rift.data.cause === 'plume', rift ? rift.text : 'no rift');
    if (rift) {
        const before = r.at(18), after = r.at(22), last = r.frames.at(-1);
        check('land is conserved through the split', Math.abs(landCount(after) - landCount(before)) < 0.01 * landCount(before), `${landCount(before)} → ${landCount(after)} land cells (the world view jitters by a few cells as plates move)`);
        check('two plates where there was one', continental(before).length === 1 && continental(after).length === 2, `${continental(before).length} → ${continental(after).length} continental plates`);
        // stretching makes relief too: the flanks the rift left standing carry a RIFT orogeny record, so the
        // terrain stage need not work out later where a rift once ran (East African Rift, the Ghats)
        let shoulder = 0, shoulderWork = 0;
        for (let w = 0; w < numCells; w++) if (after.owner[w] >= 0 && after.oroType[w] === OrogenyType.RIFT) { shoulder++; shoulderWork += after.oroWork[w]; }
        check('the rift leaves uplifted shoulders on both sides', shoulder > 60 && shoulderWork > 0, `${shoulder} cells carry a rift-shoulder record, mean work ${(shoulderWork / Math.max(1, shoulder)).toFixed(0)} km`);
        // …but the arm that failed does not: an aulacogen sagged and filled with sediment, it was never lifted
        let armCells = 0, armWithOrogeny = 0;
        for (let w = 0; w < numCells; w++) { if (after.owner[w] < 0 || !(after.flags[w] & CrustFlag.FAILED_RIFT)) continue; armCells++; if (after.oroType[w] === OrogenyType.RIFT) armWithOrogeny++; }
        check('the failed arm gets no shoulders: it is a trough, not a range', armCells > 3 && armWithOrogeny === 0, `${armCells} failed-arm cells, ${armWithOrogeny} of them carrying a rift-shoulder record`);
        check('a failed arm and two rifted margins are recorded', flagged(after, CrustFlag.FAILED_RIFT) >= 3 && flagged(after, CrustFlag.RIFT_MARGIN) > 40, `${flagged(after, CrustFlag.FAILED_RIFT)} failed-arm cells, ${flagged(after, CrustFlag.RIFT_MARGIN)} rift-margin cells`);
        const f80 = r.at(80), ridge = countWhere(numCells, w => f80.boundary[w] === BoundaryKind.RIDGE);
        const fresh = countWhere(numCells, w => f80.owner[w] >= 0 && !f80.plates[f80.owner[w]].isBackground && f80.type[w] === CrustType.OCEAN && f80.formedAt[w] > 20);
        check('a ridge opens between the halves and they drift apart', ridge > 20 && fresh > 100 && !r.events.some(e => e.kind === EventKind.SUTURE), `${ridge} ridge cells and ${fresh} cells of new ocean on the plates at 80 Myr; sutures: ${r.events.filter(e => e.kind === EventKind.SUTURE).length}`);
        const speeds = continental(last).map(p => p.speedCmYr);
        check('each half moves under its own trench', speeds.length === 2 && speeds.every(v => v > 0.5), `${speeds.map(v => v.toFixed(2)).join(' / ')} cm/yr at ${last.time} Myr`);
        check('no gaps', r.frames.every(f => frameTallies(f).gaps === 0), 'every frame');
    }
    const scheduledOnly = run('plume', { plumeRatePerMyr: 0, riftRatePerMyr: 0 }, 60);
    const noPlume = run('plume', { plumeRatePerMyr: 0, riftRatePerMyr: 0 }, 60, world => { world.plumes.length = 0; });
    check('no plume and no chance → no rift; a scheduled plume alone → one', scheduledOnly.events.filter(e => e.kind === EventKind.RIFT).length === 1 && noPlume.events.filter(e => e.kind === EventKind.RIFT).length === 0 && continental(noPlume.frames.at(-1)).length === 1,
        `scheduled plume alone: ${scheduledOnly.events.filter(e => e.kind === EventKind.RIFT).length} rift; no plume: ${noPlume.events.filter(e => e.kind === EventKind.RIFT).length}`);
}

section('the start world breaks up');
{
    const r = run('breakup'), rifts = r.events.filter(e => e.kind === EventKind.RIFT), cfg = r.world.config;
    check('the old supercontinent rifts early — within ~60 Myr for this seed', rifts.length >= 1 && rifts[0].time <= 60, rifts.length ? `first rift at ${rifts[0].time.toFixed(0)} Myr; ${rifts.length} rifts in all` : 'no rift');
    if (rifts.length) {
        const t0 = Math.ceil(rifts[0].time / SNAPSHOT_MYR) * SNAPSHOT_MYR, after = r.at(t0);
        const pieces = continental(after), bigger = Math.max(...pieces.map(p => p.landCells)), total = pieces.reduce((s, p) => s + p.landCells, 0);
        check('the first rift crosses the supercontinent into two comparable pieces, named by their cratons', pieces.length === 2 && bigger / total < 0.85 && pieces.every(p => /^[A-Z]+$/.test(p.name)),
            `${pieces.map(p => `${p.name} (${p.landCells} land cells)`).join(' and ')}`);
        // a craton is never divided between plates, at any time
        let dividedCratons = 0;
        for (const f of r.frames) {
            const holder = new Map();
            for (let w = 0; w < numCells; w++) { if (f.owner[w] < 0 || f.type[w] !== CrustType.CRATON) continue; const prev = holder.get(f.terrane[w]); if (prev !== undefined && prev !== f.owner[w]) dividedCratons++; holder.set(f.terrane[w], f.owner[w]); }
        }
        check('cratons are never divided between plates', dividedCratons === 0, `${dividedCratons} craton cell-frames found on a second plate`);
        // land only grows: island arcs add ~15 % over 300 Myr and fore-arc islands (7b) ~13 % more; that none is lost is check-invariants' job
        check('land is conserved across the whole history (arcs and fore-arc islands add some, under a third)', Math.abs(landCount(r.frames.at(-1)) - landCount(r.frames[0])) < 0.35 * landCount(r.frames[0]), `${landCount(r.frames[0])} → ${landCount(r.frames.at(-1))} land cells over 300 Myr (island arcs and fore-arc islands add up)`);
        const replay = run('breakup');
        check('the same seed replays the same history', replay.events.length === r.events.length && replay.events.every((e, i) => e.text === r.events[i].text) && replay.frames.at(-1).owner.every((o, w) => o === r.frames.at(-1).owner[w]), `${r.events.length} events and the final world, identical`);
    }
    // Land cannot subduct, so a collision that never welds is a piece ploughing on into another plate for
    // ever (developer: "pieces are colliding all the way through another plate when it should definitely be
    // merging"). Every pair held in contact welds — by shortening, by stalling, or simply by time.
    // (since Phase 11 a pair waits for the sea between it to close — or, ringing a big sea, stays apart — at most
    // sutureLockMaxMyr; then it welds whatever is left)
    const grinding = [...r.world.collisions.values()].filter(rec => !rec.sutured && rec.contactMyr > Math.max(cfg.sutureContactMyr, cfg.sutureLockMaxMyr) + 3 * cfg.maxStepMyr);
    check('no collision grinds on for ever: contact always ends in a weld', grinding.length === 0,
        grinding.length ? grinding.map(rec => `${r.world.plates[rec.lower].name} into ${r.world.plates[rec.upper].name}: ${rec.contactMyr.toFixed(0)} Myr in contact, ${rec.shorteningKm.toFixed(0)} km of shortening, front ${rec.frontKm.toFixed(0)} km`).join(' | `')
            : `nothing in contact longer than ${cfg.sutureLockMaxMyr} Myr is still unwelded`);
    const plates = Math.max(...r.frames.map(f => continental(f).length));
    check('the plate count stays sane; no gaps; it runs fast', plates <= cfg.reserved.maxPlates && r.frames.every(f => frameTallies(f).gaps === 0) && r.steps < 600, `at most ${plates} continental plates at once; ${r.steps} steps`);
}

section('lab');
await checkLabPhaseLoads('../../js/app/phases/phase6-rifting.js', mesh, LAB_MESH_SEED, RIFT_SCENES.map(s => ({ scene: s.id })));

finish('Phase 6a');
