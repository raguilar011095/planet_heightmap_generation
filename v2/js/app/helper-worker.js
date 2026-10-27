// A helper of the history's worker (app/helper-pool.js): work that splits into pieces that do not depend on one another,
// done side by side — a rift's search from each of its junctions (tectonics/ops/rift-path.js findRift), the start world's
// layout attempts (tectonics/init/start-world.js evaluateAttempt). The same code as in place, on the same inputs: the
// same answers. A web worker, or a Node worker thread (the checks).
//
// Messages in:  {type: 'mesh', mesh} once · {type: 'rift', jobId, seed, config, crust: {mask, type, flags, terrane, count},
//               ctx: {cells, exterior, fromCoast}, junctions, pull, needCratonsBothSides} · {type: 'layout', jobId, seed,
//               cfg, attempt}
// Messages out: {jobId, results} (a rift: each junction's rift or null, in order) · {jobId, tried: [{areaScale, excess}],
//               fit: {areaScale, land} | null} (a layout attempt) · {jobId, error}

import { meshFromArrays } from '../core/sim-mesh.js';
import { findRift, grainOf } from '../tectonics/ops/rift-path.js';
import { evaluateAttempt } from '../tectonics/init/start-world.js';

const IS_NODE = typeof self === 'undefined';
let post = null, mesh = null;
const worlds = new Map();                 // seed → the little a rift's search reads of a world (its grain is cached on it)

function handle(msg) {
    if (msg.type === 'mesh') { mesh = meshFromArrays(msg.mesh); worlds.clear(); return; }
    try {
        if (msg.type === 'rift') {
            const { seed, config, crust, ctx, junctions, pull, needCratonsBothSides } = msg;
            let world = worlds.get(seed);
            if (!world) worlds.set(seed, world = { mesh, seed, config });
            world.config = config;                                   // (as the world's stood when it asked: a looser shape, perhaps)
            const full = { ...ctx, grain: grainOf(world) }, plate = { crust };
            post({ jobId: msg.jobId, results: junctions.map(j => (j < 0 ? null : findRift(world, plate, j, pull, needCratonsBothSides, full))) });
        } else if (msg.type === 'layout') {
            const { tried, fit } = evaluateAttempt(mesh, msg.seed, msg.cfg, msg.attempt);
            const land = fit?.land;
            post({ jobId: msg.jobId, tried: tried.map(c => ({ areaScale: c.areaScale, excess: c.excess })), fit: fit ? { areaScale: fit.areaScale, land } : null },
                land ? [land.type.buffer, land.terrane.buffer, land.suture.buffer, land.owner.buffer, land.pair.buffer] : []);
        }
    } catch (err) {
        post({ jobId: msg.jobId, error: err?.stack ?? String(err) });
    }
}

if (IS_NODE) {
    const { parentPort } = await import('node:worker_threads');
    post = (m, t) => parentPort.postMessage(m, t);
    parentPort.on('message', handle);
} else {
    post = (m, t) => self.postMessage(m, t);
    self.onmessage = e => handle(e.data);
}
