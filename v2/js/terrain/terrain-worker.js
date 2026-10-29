// A terrain worker (terrain-pool.js runs several): it holds the sim mesh and the positions of the terrain cells it is
// responsible for, and computes the surface of its chunks from the per-frame plan. One worker (the first) is sent each
// frame, builds its plan and hands it to the others over message ports of their own (the page's thread never carries
// it); the others wait for it. Every terrain cell depends only on its position and the plan, so the pooled result is
// exactly the single-threaded one. Runs as a browser module worker or a Node worker thread.

import { preparePlan, planToData, planFromData, surfaceRange, carveInputs, surfaceParts } from './synthesize.js';
import { sampleRange } from './terrain-mesh.js';
import { meshFromArrays } from '../core/sim-mesh.js';

// chunks: chunk id → { xyz, cells, weights, samplerKey }; peers: the ports this worker hands plans on; jobs / plans: a
// job and its plan, whichever arrives first waiting for the other
const state = { sim: null, chunks: new Map(), peers: [], jobs: new Map(), plans: new Map() };
const IS_NODE = typeof self === 'undefined';
let post;
if (IS_NODE) {                                             // Node worker thread
    const { parentPort } = await import('node:worker_threads');
    post = (msg, transfer) => parentPort.postMessage(msg, transfer);
    parentPort.on('message', handle);
} else {
    post = (msg, transfer) => self.postMessage(msg, transfer);
    self.onmessage = e => handle(e.data);
}

function handle(msg) {
    try {
        if (msg.type === 'sim') state.sim = meshFromArrays(msg.mesh);
        else if (msg.type === 'chunks') for (const c of msg.chunks) state.chunks.set(c.id, { xyz: c.xyz, cells: null, weights: null, samplerKey: null });
        else if (msg.type === 'peer') state.peers.push(msg.port);
        else if (msg.type === 'planner') listen(msg.port, got => { state.plans.set(got.jobId, got); ready(got.jobId); });
        else if (msg.type === 'job' && msg.frame) {
            // the planner: build the plan, hand it on, then do this worker's chunks
            let plan;
            try { plan = preparePlan(msg.frame, state.sim, msg.cfg, msg.seed, msg.edgeKm); } catch (err) { for (const p of state.peers) p.postMessage({ jobId: msg.jobId, failed: true }); throw err; }
            const data = planToData(plan);
            for (const p of state.peers) p.postMessage({ jobId: msg.jobId, plan: data });
            runJob(msg, plan);
        } else if (msg.type === 'job') { state.jobs.set(msg.jobId, msg); ready(msg.jobId); }
    } catch (err) {
        post({ type: 'error', jobId: msg.jobId, message: err.stack ?? String(err) });
    }
}

function listen(port, fn) {
    if (IS_NODE) port.on('message', fn); else port.onmessage = e => fn(e.data);
}

/** A job whose plan comes from the planner: run once both are here (a failed plan drops the job: the planner reports it). */
function ready(jobId) {
    const job = state.jobs.get(jobId), got = state.plans.get(jobId);
    if (!got || (!job && !got.failed)) return;
    state.plans.delete(jobId); state.jobs.delete(jobId);
    if (got.failed) return;
    try { runJob(job, planFromData(got.plan, state.sim, job.seed)); } catch (err) { post({ type: 'error', jobId, message: err.stack ?? String(err) }); }
}

function runJob({ jobId, cfg, seed, edgeKm, parts: wantParts, carve: wantCarve, recCells: wantRec, samplerKey, chunkIds }, plan) {
    for (const id of chunkIds) {
        const chunk = state.chunks.get(id), k = chunk.xyz.length / 3;
        // the sampler (warp + point location) depends on the mesh, the seed and the warp settings only: kept between frames
        let fresh = false;
        if (chunk.samplerKey !== samplerKey) {
            chunk.cells = new Int32Array(3 * k); chunk.weights = new Float32Array(3 * k);
            sampleRange(state.sim, chunk.xyz, cfg, seed, 0, k, chunk.cells, chunk.weights);
            chunk.samplerKey = samplerKey; fresh = true;
        }
        const heightKm = new Float32Array(k);
        const parts = wantParts ? surfaceParts(k) : null;
        const carve = wantCarve ? carveInputs(k) : null, rec = wantRec ? new Int32Array(k) : null, cue = wantRec ? new Int8Array(3 * k) : null;
        surfaceRange(plan, cfg, seed, edgeKm, chunk.xyz, chunk.cells, chunk.weights, 0, k, heightKm, parts, carve, rec, cue);
        const out = { type: 'chunk', jobId, id, heightKm, parts, carve, rec, cue, cells: fresh ? chunk.cells.slice() : null, weights: fresh ? chunk.weights.slice() : null };
        const transfer = [heightKm.buffer, ...(parts ? Object.values(parts).map(a => a.buffer) : []), ...(carve ? Object.values(carve).map(a => a.buffer) : []), ...(rec ? [rec.buffer, cue.buffer] : []), ...(fresh ? [out.cells.buffer, out.weights.buffer] : [])];
        post(out, transfer);
    }
    post({ type: 'done', jobId, kernels: plan.Ks[0].count + plan.Ks[1].count, volcanoes: plan.V.count });
}
