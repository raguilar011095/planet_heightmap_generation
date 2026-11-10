// Generate's ground drawn on worker threads (core/task-pool.js): the present-day world's surface — every cell sampled on
// the sim mesh, its height and the carving's inputs read from the plan (world.js drawSurface) — in runs of cells side by
// side. Each cell depends on its position and the plan alone, so the pooled surface is the one drawn in place, to the bit
// (as Evolution's terrain pool, terrain/terrain-pool.js, draws a frame's). The sampling warp's tables (terrain-mesh.js
// warpField: a noise tabulated over a cube map, ~1 s to fill) are filled a face at a time on the workers too, once per
// seed and warp, and handed to every worker — else each would fill its own.

import { TaskPool } from '../core/task-pool.js';
import { drawSurface } from './world.js';
import { planToData, planFromData, carveInputs } from '../terrain/synthesize.js';
import { warpField, warpFieldPlan, installWarpField, cubeFace } from '../terrain/terrain-mesh.js';
import { meshFromArrays } from '../core/sim-mesh.js';

/** Below this many cells the pool is not worth handing the plan out (nor starting: js/planet-worker.js). */
export const GROUND_POOL_FROM_CELLS = 80000;

/** A pool for the ground's tasks (null where workers cannot be started: the ground is then drawn in place). */
export function groundTaskPool(size = null) {
    return TaskPool.create(new URL('./ground-pool-worker.js', import.meta.url), size);
}

/** The two warp fields a surface reads — the sampler's and, with the sim mesh's cell warp, the surface's — on every
 *  worker and here: their tables filled on the pool unless this thread has them. */
async function shareWarp(pool, seed, cfg, simEdgeKm) {
    const plans = [warpFieldPlan(seed, cfg, 0), warpFieldPlan(seed, cfg, simEdgeKm)], sig = plans.map(p => p.key).join('&');
    if (pool.groundWarp === sig) return;
    // (the tables: the warp's own — both fields' first — and the cell warp's)
    const specs = [plans[0].tables[0], ...(plans[1].tables.length > 1 ? [plans[1].tables[1]] : [])], size = t => (t.N + 1) * (t.N + 1) * 3;
    let values;
    if (plans.every(p => p.have)) { const W = warpField(seed, cfg, simEdgeKm); values = [W.T, ...(W.cell ? [W.cell.T] : [])]; }
    else {
        values = specs.map(t => new Float32Array(6 * size(t)));
        await pool.run('warpFace', 6 * specs.length, i => ({ part: { spec: specs[(i / 6) | 0], face: i % 6 } }), (T, i) => values[(i / 6) | 0].set(T, (i % 6) * size(specs[(i / 6) | 0])));
        plans.forEach(p => installWarpField(p, values.slice(0, p.tables.length)));
    }
    await pool.share('groundWarp', { plans: plans.map(p => ({ key: p.key, tables: p.tables, cellAmp: p.cellAmp })), values });
    pool.groundWarp = sig;
}

/** world.js drawSurface on `pool`: the same surface. Without a pool, for a small mesh, or if a run fails: drawn here. */
export async function drawSurfacePooled(pool, job) {
    const { plan, cfg, seed, sim, edgeKm, xyz, carve, alt, rec } = job, n = xyz.length / 3;
    if (!pool || pool.closed || n < GROUND_POOL_FROM_CELLS) return drawSurface(job);
    try {
        // (the sim mesh once per mesh, the warp's tables once per seed and warp; the plan for this surface)
        if (pool.groundSim !== sim) { await pool.share('groundSim', { numCells: sim.numCells, xyz: sim.xyz, adjOffset: sim.adjOffset, adjList: sim.adjList }); pool.groundSim = sim; }
        await shareWarp(pool, seed, cfg, sim.edgeKm);
        await pool.share('ground', { plan: planToData(plan), cfg, seed, edgeKm, carve, alt, rec });
        const runs = pool.size * 4, from = i => Math.floor(i * n / runs);
        const out = { cells: new Int32Array(3 * n), weights: new Float32Array(3 * n), heightKm: new Float32Array(n), carveIn: carve ? carveInputs(n) : null, recCell: rec ? new Int32Array(n) : null, cues: rec ? new Int8Array(3 * n) : null };
        if (alt) out.carveIn.kAlt = new Float32Array(n);
        await pool.run('surfaceRun', runs, i => { const part = xyz.slice(3 * from(i), 3 * from(i + 1)); return { part: { xyz: part }, transfer: [part.buffer] }; }, (r, i) => {
            const c0 = from(i);
            out.cells.set(r.cells, 3 * c0); out.weights.set(r.weights, 3 * c0); out.heightKm.set(r.heightKm, c0);
            if (out.carveIn) for (const k of Object.keys(out.carveIn)) out.carveIn[k].set(r.carveIn[k], c0);
            if (out.recCell) { out.recCell.set(r.recCell, c0); out.cues.set(r.cues, 3 * c0); }
        });
        await pool.forget('ground');
        return out;
    } catch (err) {
        console.warn('[generate] the ground was drawn in place:', String(err?.message ?? err).split('\n')[0]);
        return drawSurface(job);
    }
}

// ── a worker's side ──
let simOf = null, sim = null, planOf = null, plan = null, warpOf = null;
function surfaceRun({ xyz }, common) {
    if (simOf !== common.groundSim) { simOf = common.groundSim; sim = meshFromArrays(simOf); planOf = null; }
    if (warpOf !== common.groundWarp) { warpOf = common.groundWarp; warpOf.plans.forEach(p => installWarpField(p, warpOf.values.slice(0, p.tables.length))); }
    const g = common.ground;
    if (planOf !== g) { planOf = g; plan = planFromData(g.plan, sim, g.seed); }
    const d = drawSurface({ plan, cfg: g.cfg, seed: g.seed, sim, edgeKm: g.edgeKm, xyz, carve: g.carve, alt: g.alt, rec: g.rec });
    return { result: d, transfer: [d.cells, d.weights, d.heightKm, ...(d.carveIn ? Object.values(d.carveIn) : []), ...(d.recCell ? [d.recCell, d.cues] : [])].map(a => a.buffer) };
}
function warpFace({ spec, face }) {
    const T = cubeFace(spec, face);
    return { result: T, transfer: [T.buffer] };
}
export const GROUND_TASKS = { surfaceRun, warpFace };
