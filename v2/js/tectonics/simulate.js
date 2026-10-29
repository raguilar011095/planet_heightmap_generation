// The stepping loop:   move plates → resolve crust → classify boundaries → events → set the plates' motion.
// Motion comes from a `drive(world)` callback so the same loop serves prescribed test scenes and the
// force model (step/torque-balance.js `updatePlateMotion`). `drive` always sees a freshly resolved
// world, including at time 0, and `world.lastDt` tells it how long the last step was.

import { advancePlates } from './step/kinematics.js';
import { fastestSpeed } from './step/torque-balance.js';
import { resolve } from './step/resolve.js';
import { classifyBoundaries } from './step/boundaries.js';
import { trackCollisions } from './step/collision.js';
import { growWings, buildArcs } from './step/wings.js';
import { collapseArcs } from './ops/collapse-arc.js';
import { tidyPlates, fillPinholes } from './ops/tidy-plates.js';
import { closeRemnantSeas } from './step/remnant-seas.js';
import { matureArcs } from './step/arc-maturation.js';
import { riftContinents, searchJunctions } from './step/rifting.js';
import { initiateSubduction, founderWithinPlates } from './step/subduction-init.js';
import { retireBackground, splitOceanPlates, captureMicroplates } from './step/ocean-plates.js';
import { CrustRaster } from './model/crust.js';
import { updateHotspots, insulateAtStart } from './step/hotspots.js';
import { trackCycle } from './step/supercontinent.js';
import { openBackArcs, steerBackArcStrips } from './step/backarc.js';
import { growMarginIsles } from './step/margin-isles.js';
import { captureFrame } from './snapshot.js';
import { evolveHeights, seedBaseRelief } from './step/heights.js';
import { evolveFarField } from './step/far-field.js';
import { evolveRivers } from './step/rivers.js';
import { seedGeology, evolveGeology } from './step/geology.js';
import { CM_PER_YR_TO_RAD_PER_MYR } from './config.js';

/**
 * @param {import('./model/world.js').TectonicWorld} world
 * @param {Object} opts
 * @param {number} opts.untilMyr
 * @param {(world) => void} opts.drive          sets plate.omega for the coming step
 * @param {number} [opts.snapshotEveryMyr]      defaults to world.config.snapshotEveryMyr; a multiple of config.stepGridMyr, so
 *                                              that recording a history more or less often never changes it
 * @param {boolean} [opts.events]               run the event rules (collisions, belts, sutures, terranes, wings, arcs); false = kinematics and crust only
 * @param {(frame) => void} [opts.onFrame]      called with each frame as it is recorded (a worker streams them out; the
 *                                              history itself does not depend on it)
 * @param {(world) => boolean} [opts.stopAt]    asked after each snapshot: true ends the history there (a chosen ending,
 *                                              tectonics/ending.js) — it never changes the history up to that point
 * @param {boolean} [opts.resume]               the world is where an earlier call left it (after its last step): run on
 *                                              from there exactly as one long call would have — no setting up again, and no
 *                                              frame of the moment it starts from (the earlier call recorded it). With
 *                                              untilMyr on the step grid (stepGridMyr), a history run on in pieces is the
 *                                              one history run in one go, to the bit (the Evolution page's "Keep going")
 * @param {boolean} [opts.keepFrames]           false: the frames go only to onFrame and are not kept (a worker that streams
 *                                              them out would otherwise hold the whole history twice — ~2 MB a frame at 20K)
 * @param {(name: string, world) => void} [opts.onStage]   diagnostics: called after each stage of a step that ran, with its
 *                                              name (tools/trace-coasts.mjs: which stage changed the crust how); it must
 *                                              not change the world — the history never depends on it
 * @returns {{frames: import('./snapshot.js').Frame[], steps: number, stepLog: Object[], stopped: boolean}}
 *          frames[0] is the world as handed in (time 0 for a new world — a world can also be run on from
 *          where an earlier call stopped); then one frame per snapshot interval; the last is exactly untilMyr,
 *          or the snapshot where stopAt said stop (stopped: true). Empty with keepFrames false
 */
export function simulate(world, opts) {
    const run = stepsOf(world, opts);
    for (let r = run.next(); ; r = run.next(searchJunctions(world, r.value))) if (r.done) return r.value;
}

/**
 * simulate, with each rift's search over its junctions handed to `helpers` (app/helper-pool.js: workers side by side) —
 * the junctions' answers come back in order, so it is the same history. @returns {Promise} simulate's result
 */
export async function simulateAsync(world, opts, helpers) {
    const run = stepsOf(world, opts);
    for (let r = run.next(); ; r = run.next(await helpers.searchJunctions(world, r.value))) if (r.done) return r.value;
}

// The history's steps, as a generator: it yields each rift's request for its junctions' searches (step/rifting.js).
const SLOW_ROTATION_MYR = 20;        // (a plate's averaged rotation: in the step loop)

function* stepsOf(world, { untilMyr, drive, snapshotEveryMyr = world.config.snapshotEveryMyr, events = true, onFrame = null, stopAt = null, resume = false, keepFrames = true, onStage = null }) {
    const frames = [], stepLog = [];
    const record = frame => { if (keepFrames) frames.push(frame); onFrame?.(frame); };
    const stage = onStage ? name => onStage(name, world) : null;
    if (!resume) {
        for (const p of world.plates) p.refreshExtent(world.mesh.xyz);
        resolve(world);
        if (events && tidyPlates(world)) resolve(world);         // a scene may hand a plate cells that are not joined to it: settle that before anything moves
        classifyBoundaries(world, 0);
        if (world.time === 0 && !world.baseSeeded) { seedBaseRelief(world); world.baseSeeded = true; }   // (records only)
        if (world.time === 0 && !world.geologySeeded) { seedGeology(world); world.geologySeeded = true; }   // (records only)
        if (events && !world.hotspotsReady) insulateAtStart(world);   // (the first frame shows the start's mantle heat; step 1 sets it again)
        if (events) trackCycle(world);                            // (is the start a supercontinent? — then the mantle already flows out from under it)
        drive(world);
        steerBackArcStrips(world);
        record(captureFrame(world));
    }

    // Steps never cross a multiple of stepGridMyr (and end exactly at untilMyr); snapshots are taken on that grid.
    // The steps a history takes therefore depend on the world alone — never on how often it is recorded.
    const grid = world.config.stepGridMyr;
    let nextSnapshot = Math.min(world.time + snapshotEveryMyr, untilMyr);
    while (world.time < untilMyr - 1e-9) {
        const nextGrid = (Math.floor(world.time / grid + 1e-9) + 1) * grid;
        const dt = Math.min(chooseStep(world), nextGrid - world.time, untilMyr - world.time);
        const cellsMoved = closingRate(world) * dt / world.mesh.edgeRad;
        advancePlates(world, dt);
        world.lastDt = dt;
        const tally = resolve(world);
        stage?.('resolve');
        classifyBoundaries(world, dt);
        // (the slow rules every config.slowRulesEveryMyr, with the time since they last ran)
        world.slowMyr += dt;
        const slowDt = world.slowMyr, slow = slowDt >= world.config.slowRulesEveryMyr - 1e-9;
        if (slow) world.slowMyr = 0;
        if (events) {
            // The event stages, in order. The world view (owner / ownerCell) was built by the resolve above; a stage that
            // adds, removes or rewrites a plate's cells marks it reshaped, and later stages skip reshaped plates or read
            // the plate's own raster (README: "Rules for event stages and ops"). Each returns how much it changed.
            let changed = 0;
            updateHotspots(world, dt);                 // plumes, LIPs, tracks — first, on the fresh view: stamps records only, queues plume rifts
            trackCycle(world);                         // the supercontinent cycle: count the landmasses, move the mantle's up- and downwelling
            changed += trackCollisions(world, dt) ? 1 : 0;   // collision records, belts, sutures, docking, arc scraping (merges plates)
            stage?.('collisions');
            changed += growWings(world, dt);           // trench wings capture passive ocean
            stage?.('wings');
            if (slow) { changed += buildArcs(world); stage?.('arcs'); }                  // island arcs behind mature ocean trenches (cell types only)
            if (slow) { changed += collapseArcs(world); stage?.('arc collapse'); }       // an arc near its own coast lands on it
            if (slow) { changed += growMarginIsles(world, slowDt); stage?.('margin isles'); }  // fore-arc islands rise and join the coast (cell types only)
            changed += yield* riftContinents(world, dt);   // plume and tension rifts (splits plates)
            stage?.('rifts');
            changed += openBackArcs(world, dt);        // rolling-back trenches split off strips; finished strips rejoin
            stage?.('back-arcs');
            changed += initiateSubduction(world, dt);  // passive margins founder (may carve an ocean plate)
            stage?.('subduction init');
            if (slow) { changed += founderWithinPlates(world, slowDt); stage?.('margins founder'); }  // …and margins inside a plate: its old ocean breaks away as a plate
            if (slow) { changed += retireBackground(world) + splitOceanPlates(world, slowDt); stage?.('ocean plates'); }  // the pre-history ocean becomes plates; big ocean plates split
            changed += captureMicroplates(world);       // a small ocean plate is captured by its neighbour
            stage?.('microplates');
            if (slow) { changed += closeRemnantSeas(world, slowDt); stage?.('remnant seas'); }  // seas sealed inside a plate close from their shores
            if (slow) { changed += matureArcs(world, slowDt); stage?.('arc maturation'); }  // arcs welded onto a continent become continent (cell types only)
            changed += tidyPlates(world);              // fragments join a neighbour; ocean scraps go to the passive ocean
            stage?.('tidy');
            if (changed) {                              // crust changed: the world view must be rebuilt before anything reads it
                for (const p of world.plates) if (p.dirty) p.refreshExtent(world.mesh.xyz);
                resolve(world);
                stage?.('resolve again');
                if (fillPinholes(world)) { for (const p of world.plates) if (p.dirty) p.refreshExtent(world.mesh.xyz); resolve(world); stage?.('pinholes'); }
                classifyBoundaries(world, 0);
            }
        }
        if (slow) evolveHeights(world, slowDt);  // heights wear down and spread (records only: nothing below reads them)
        evolveRivers(world, dt);                            // rivers drain the land and cut into it (records only too; on a clock of their own)
        evolveGeology(world, dt);                           // the geological record: the sea's stand, shallow seas, basins, arcs (records only; its own clock)
        evolveFarField(world, dt);                          // fronts' pushes felt far inland (records only; on a clock of its own)
        drive(world);
        steerBackArcStrips(world);                          // a back-arc strip follows its retreating trench, whatever drives the rest
        // (each plate's rotation averaged over ~SLOW_ROTATION_MYR: the spreading poles fracture zones are measured about —
        // records only, tectonics/model/segments.js; the rotation itself wobbles a degree or two from step to step)
        for (const p of world.plates) {
            if (!p.alive) continue;
            const k = p.omegaSlow ? 1 - Math.exp(-dt / SLOW_ROTATION_MYR) : 1;
            p.omegaSlow ??= p.omega.slice();
            for (let i = 0; i < 3; i++) p.omegaSlow[i] += (p.omega[i] - p.omegaSlow[i]) * k;
        }
        // (a plate that has gone — merged, captured, emptied — keeps its place in the list, its id, but not its rasters: the
        // gone plates share one empty raster, as a merge gives the plate it ends a fresh one. A history makes ~100 plates
        // and keeps ~10, each ~110 bytes a cell: at 20K the history held ~200 MB of empty rasters, and a phone ran out)
        for (const p of world.plates) if (!p.alive && p.crust.count === 0 && p.crust !== world.goneCrust) p.crust = world.goneCrust ??= new CrustRaster(world.mesh.numCells);
        stepLog.push({ time: world.time, dt, cellsMoved, ...tally });
        if (world.time >= nextSnapshot - 1e-9) {
            record(captureFrame(world));
            nextSnapshot = Math.min(nextSnapshot + snapshotEveryMyr, untilMyr);
            if (stopAt?.(world)) return { frames, steps: world.step, stepLog, stopped: true };
        }
    }
    return { frames, steps: world.step, stepLog, stopped: false };
}

/**
 * The fastest rate (rad/Myr) at which any two plates could be closing: the two fastest plates' speeds added — each the
 * fastest point of its own cap, not its |ω| (a speck of a plate can spin at any rate while nothing on it moves far; its
 * |ω| shrank every step of a history to the floor).
 */
function closingRate(world) {
    let first = 0, second = 0;
    for (const p of world.plates) {
        if (!p.alive) continue;
        const rate = p.crust.count ? fastestSpeed(p.omega, p, p.toWorld(p.capCenter[0], p.capCenter[1], p.capCenter[2], [0, 0, 0])) : 0;
        if (rate > first) { second = first; first = rate; } else if (rate > second) second = rate;
    }
    return first + second;
}

// Adaptive step: two plates closing head-on may together cover at most `maxCellsPerStep` cells, so
// convergence and divergence are always resolved about a cell at a time — at any resolution (a finer mesh takes
// more, shorter steps). The floor is the step two plates at the oceanic speed limit would need, so it scales with
// the mesh too; it only matters if something runs faster than the limits allow.
export function chooseStep(world) {
    const { maxStepMyr, maxCellsPerStep, maxSpeedOceanic } = world.config, rate = closingRate(world);
    const floor = maxCellsPerStep * world.mesh.edgeRad / (2 * maxSpeedOceanic * CM_PER_YR_TO_RAD_PER_MYR);
    if (rate < 1e-12) return maxStepMyr;
    return Math.max(floor, Math.min(maxStepMyr, maxCellsPerStep * world.mesh.edgeRad / rate));
}
