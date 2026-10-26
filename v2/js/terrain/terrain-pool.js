// Terrain synthesis spread over worker threads (terrain-worker.js): the terrain cells are cut into chunks, each worker
// always gets the same chunks (so it keeps their positions and sampler between frames) and computes the surface of its
// chunks from the per-frame plan — built once, by the first worker, and handed to the others over message ports. The result is exactly synthesizeTerrain's — every cell depends only on its
// position and the plan — only faster. Works in the browser (module workers) and in Node (worker threads).
// Carving (Phase 8b) needs a whole frame at once: one more worker (carve-worker.js) carves each frame the chunk workers
// have built, on a queue of its own, so the next frame's surface is built while this one is carved. Hillshading a frame
// for the page needs its whole mesh too: one more worker (shade-worker.js) does that, so the page's thread never does.

import { preparePlan, carveLadder, carveSettings, carveInputs, surfaceParts } from './synthesize.js';
import { terrainMeshAsync } from './terrain-mesh.js';

const IS_NODE = typeof window === 'undefined' && typeof process !== 'undefined' && !!process.versions?.node;
const CHUNKS_PER_WORKER = 8;          // more chunks than workers, dealt round-robin: land and sea even out between workers
// the Frame fields terrain synthesis reads (a worker is sent only these)
// (every frame field the terrain reads — records.js, volcanoes.js — including the evolved heights; plus each plate's
// rotation, below)
export const FRAME_FIELDS = ['time', 'owner', 'type', 'flags', 'terrane', 'formedAt', 'boundary', 'margin', 'mantleHeat', 'oroType', 'oroLast', 'thickKm',
    'beltU', 'beltReach', 'beltSide', 'beltShear', 'prevType', 'prevLast', 'prevU', 'prevReach', 'prevSide', 'prevShear', 'volcType', 'volcAt', 'volcKm', 'volcSource',
    'crustCells', 'crustType', 'crustBelt', 'crustReach', 'rootKm', 'upliftKm', 'baseKm', 'rugged', 'prevRugged', 'volcWornKm', 'riverIncKm', 'riverKm2', 'fzU',
    'farWork', 'farFold', 'farDir'];

async function spawn(file = './terrain-worker.js') {
    const url = new URL(file, import.meta.url);
    if (IS_NODE) {
        const { Worker } = await import('node:worker_threads');
        const w = new Worker(url);
        w.unref();                                        // (idle workers never keep a Node process alive; a job holds them)
        return { post: (m, t) => w.postMessage(m, t), listen: fn => w.on('message', fn), onCrash: fn => w.on('error', err => fn(err.message)),
            terminate: () => w.terminate(), hold: on => (on ? w.ref() : w.unref()) };
    }
    const w = new Worker(url, { type: 'module' });
    // (onCrash: the worker died without a word — out of memory, most often — so the jobs it held never answer)
    return { post: (m, t) => w.postMessage(m, t), listen: fn => w.addEventListener('message', e => fn(e.data)),
        onCrash: fn => w.addEventListener('error', e => { e.preventDefault?.(); fn(e.message || 'a worker stopped'); }), terminate: () => w.terminate(), hold: () => {} };
}

/**
 * How many workers to use by default: all cores but one (for the page), at most 8 (each holds a copy of the plan). (Not
 * more on a machine with more threads: the heights are noise arithmetic, which a core's second thread barely speeds up —
 * 15 workers on an 8-core, 16-thread desktop were slower than 8 at every terrain size, 2026-09-28.)
 */
export async function defaultPoolSize() {
    return Math.max(1, Math.min(8, (await coreCount()) - 1));
}
async function coreCount() { return IS_NODE ? (await import('node:os')).availableParallelism() : (navigator.hardwareConcurrency || 4); }

export class TerrainPool {
    /**
     * @param {Object} simMesh  the mesh the frames live on (sent to every worker once)
     * @param {number|null} size  synthesis workers (null: defaultPoolSize)
     * @param {{carvers?: number|null}} [o]  carving workers: frames carved side by side (null: two with 8 cores or more —
     *        each holds its own copy of the meshes the carving climbs, ~150 MB at 2.5M cells)
     */
    static async create(simMesh, size = null, { carvers = null } = {}) {
        const n = size ?? await defaultPoolSize();
        const workers = await Promise.all(Array.from({ length: n }, spawn));
        const arrays = { numCells: simMesh.numCells, xyz: simMesh.xyz, adjOffset: simMesh.adjOffset, adjList: simMesh.adjList };
        for (const w of workers) w.post({ type: 'sim', mesh: arrays });
        // the first worker plans each frame and hands the plan to each other worker over a port of their own
        const Channel = IS_NODE ? (await import('node:worker_threads')).MessageChannel : MessageChannel;
        for (let i = 1; i < n; i++) {
            const { port1, port2 } = new Channel();
            workers[0].post({ type: 'peer', port: port1 }, [port1]);
            workers[i].post({ type: 'planner', port: port2 }, [port2]);
        }
        const pool = new TerrainPool(workers, simMesh);
        pool.carverCount = carvers ?? ((await coreCount()) >= 8 ? 2 : 1);
        return pool;
    }

    constructor(workers, simMesh) {
        this.workers = workers;
        this.sim = simMesh;
        this.carverCount = 1;
        this.carvers = [];                   // carving workers: { worker, pending, sent, queue, load }
        this.meshes = new Map();             // terrain mesh → { chunks: [{id, from, to}], sampler: {cells, weights, key} | null }
        this.nextJob = 1;
        this.queue = Promise.resolve();      // jobs run one at a time
        this.pending = new Map();            // job id → handler
        this.broken = false;                 // a worker died: every job is failed and the pool must be replaced (onBroken)
        this.onBroken = null;
        this.closed = false;                 // terminated: its jobs failed, and any asked of it after
        workers.forEach(w => { w.listen(msg => this.pending.get(msg.jobId)?.(msg)); w.onCrash(m => this.crashed(m)); });
    }

    /** A worker died without answering: fail every job waiting on any of the pool's workers, so nothing waits forever. */
    crashed(message) {
        if (this.broken) return;
        this.broken = true;
        this.failAll(`a worker stopped (${message || 'out of memory?'})`);
        this.onBroken?.(message);
    }
    failAll(message) {
        const msg = { type: 'error', message };
        const all = [this.pending, ...this.carvers.map(c => c?.pending), this.shader?.pending];
        for (const pending of all) if (pending) for (const handler of [...pending.values()]) handler(msg);
    }
    /** (a job asked of a terminated pool fails — its workers are gone) */
    open() { if (this.closed) throw new Error('the terrain pool was closed'); }

    get size() { return this.workers.length; }

    /** Let go of what the pool keeps for a mesh (its chunks, its sampler: ~0.3 GB at 10M cells). */
    forget(tMesh) { this.meshes.delete(tMesh); }

    terminate() {
        if (!this.closed) { this.closed = true; this.failAll('the terrain pool was closed'); }
        this.meshes.clear();
        for (const w of this.workers) w.terminate();
        this.workers = [];
        for (const c of this.carvers) c?.worker.terminate();
        this.carvers = [];
        this.shader?.worker.terminate(); this.shader = null;
    }

    /**
     * synthesizeTerrain(frame, simMesh, tMesh, { cfg, seed, parts }) on the pool: same result (heightKm, parts, rec,
     * sampler, kernels, volcanoes), bit for bit. `records: false` leaves out the records (rec null): heights only, and
     * nothing of the job runs on the caller's thread.
     */
    synthesize(frame, tMesh, opts) {
        const run = this.queue.then(() => this.run(frame, tMesh, opts));
        this.queue = run.catch(() => {});
        return run;
    }

    async run(frame, tMesh, { cfg, seed = 0, parts: wantParts = false, records = true, carveInputs = false }) {
        this.open();
        const started = performance.now(), W = this.workers.length, n = tMesh.numCells;
        for (const w of this.workers) w.hold(true);
        try { return await this.runHeld(frame, tMesh, { cfg, seed, wantParts, records, carveInputs }, started, W, n); } finally { for (const w of this.workers) w.hold(false); }
    }

    /**
     * Carve a frame's surface (synthesize's result, built with carveInputs: true) on the carving worker — carve.js's
     * carveTerrain over the sim mesh and the terrain meshes up to tMesh. Queued apart from the surfaces. The surface's
     * carving inputs (built.carveIn) go to the worker: here they are left empty.
     * @returns {Promise<{z: Float32Array, area: Float32Array, ms: number}>}
     */
    carve(tMesh, built, cfg) {
        // (the carving worker with the fewest frames waiting — each frame's carving is its own, whichever worker does it).
        // A second one only for the finest terrain: on an 8-core desktop it carried 2.5M cells 12 % faster, but slowed
        // 640K (the synthesis workers want those cores), 2026-09-28.
        const K = tMesh.numCells >= 1.5e6 ? this.carverCount : 1;
        let i = 0;
        for (let j = 0; j < K; j++) if ((this.carvers[j]?.load ?? 0) < (this.carvers[i]?.load ?? 0)) i = j;
        const slot = this.carvers[i] ??= { worker: null, pending: new Map(), sent: new Set(), queue: Promise.resolve(), load: 0 };
        slot.load++;
        const run = slot.queue.then(() => this.runCarve(slot, tMesh, built, cfg)).finally(() => { slot.load--; });
        slot.queue = run.catch(() => {});
        return run;
    }

    async runCarve(slot, tMesh, built, cfg) {
        this.open();
        if (!slot.worker) {
            slot.worker = await spawn('./carve-worker.js');
            slot.worker.listen(msg => slot.pending.get(msg.jobId)?.(msg));
            slot.worker.onCrash(m => this.crashed(m));
        }
        const { worker, pending, sent } = slot;
        const sizes = carveLadder(this.sim, tMesh, n => n).slice(1, -1);            // (the terrain meshes between)
        const ladder = [this.sim, ...(await Promise.all(sizes.map(n => terrainMeshAsync(n)))), tMesh];
        for (const m of ladder) if (!sent.has(m.numCells)) {                      // (each mesh sent once, copied)
            worker.post({ type: 'mesh', mesh: { numCells: m.numCells, xyz: m.xyz, adjOffset: m.adjOffset, adjList: m.adjList } });
            sent.add(m.numCells);
        }
        const jobId = this.nextJob++, fields = { ...built.carveIn, z: built.heightKm };
        worker.hold(true);
        try {
            return await new Promise((resolve, reject) => {
                pending.set(jobId, msg => {
                    pending.delete(jobId);
                    if (msg.type === 'error') reject(new Error(`carve worker: ${msg.message}`)); else resolve({ z: msg.z, area: msg.area, ms: msg.ms });
                });
                // (the carving's inputs are handed over, not copied — only the carving reads them; the heights are copied)
                worker.post({ type: 'carve', jobId, ladder: ladder.map(m => m.numCells), fields, settings: carveSettings(cfg) }, Object.values(built.carveIn).map(a => a.buffer));
            });
        } finally { worker.hold(false); }
    }

    /**
     * view/terrain-shade.js's hillshade(tMesh, heightKm, opts) on the shading worker: the same shading, bit for bit, off
     * the caller's thread (heightKm is copied). Queued apart from the surfaces and the carving.
     * @returns {Promise<Float32Array>}
     */
    shade(tMesh, heightKm, opts) {
        const run = (this.shadeQueue ?? Promise.resolve()).then(() => this.runShade(tMesh, heightKm, opts));
        this.shadeQueue = run.catch(() => {});
        return run;
    }

    async runShade(tMesh, heightKm, opts) {
        this.open();
        if (!this.shader) {
            const worker = await spawn('./shade-worker.js'), pending = new Map();
            worker.listen(msg => pending.get(msg.jobId)?.(msg));
            worker.onCrash(m => this.crashed(m));
            this.shader = { worker, pending, sent: new Set() };
        }
        const { worker, pending, sent } = this.shader;
        if (!sent.has(tMesh.numCells)) {                                           // (each mesh sent once, copied)
            worker.post({ type: 'mesh', mesh: { numCells: tMesh.numCells, xyz: tMesh.xyz, adjOffset: tMesh.adjOffset, adjList: tMesh.adjList } });
            sent.add(tMesh.numCells);
        }
        const jobId = this.nextJob++;
        worker.hold(true);
        try {
            return await new Promise((resolve, reject) => {
                pending.set(jobId, msg => {
                    pending.delete(jobId);
                    if (msg.type === 'error') reject(new Error(`shade worker: ${msg.message}`)); else resolve(msg.shade);
                });
                worker.post({ type: 'shade', jobId, numCells: tMesh.numCells, heightKm, opts });
            });
        } finally { worker.hold(false); }
    }

    async runHeld(frame, tMesh, { cfg, seed, wantParts, records, carveInputs: wantCarve }, started, W, n) {
        let mesh = this.meshes.get(tMesh);
        if (!mesh) {                              // first time on this mesh: deal out its chunks, and each worker's positions
            const count = W * CHUNKS_PER_WORKER, chunks = [];
            for (let i = 0; i < count; i++) chunks.push({ id: `${n}:${i}`, from: Math.floor(i * n / count), to: Math.floor((i + 1) * n / count) });
            this.workers.forEach((w, wi) => {
                const mine = chunks.filter((_, i) => i % W === wi).map(c => ({ id: c.id, xyz: tMesh.xyz.slice(3 * c.from, 3 * c.to) }));
                w.post({ type: 'chunks', chunks: mine }, mine.map(c => c.xyz.buffer));
            });
            this.meshes.set(tMesh, mesh = { chunks, sampler: null });
        }
        const samplerKey = `${seed}|${cfg.warpKm}|${cfg.warpScale}`;
        const reuseSampler = mesh.sampler?.key === samplerKey;
        const sampler = reuseSampler ? mesh.sampler : { cells: new Int32Array(3 * n), weights: new Float32Array(3 * n), key: samplerKey };
        const heightKm = new Float32Array(n);
        const parts = wantParts ? surfaceParts(n) : null;
        const carveIn = wantCarve ? carveInputs(n) : null;
        const byId = new Map(mesh.chunks.map(c => [c.id, c]));
        const jobId = this.nextJob++, slim = Object.fromEntries(FRAME_FIELDS.map(k => [k, frame[k]]));      // (to the planner only)
        slim.plates = frame.plates.map(p => p && { quat: p.quat });           // (the plates' rotations: detail is anchored to the crust)

        let counts = null;
        const finished = new Promise((resolve, reject) => {
            let done = 0;
            this.pending.set(jobId, msg => {
                if (msg.type === 'error') { this.pending.delete(jobId); reject(new Error(`terrain worker: ${msg.message}`)); return; }
                if (msg.type === 'done') { counts ??= msg; if (++done === W) { this.pending.delete(jobId); resolve(); } return; }
                const c = byId.get(msg.id);
                heightKm.set(msg.heightKm, c.from);
                if (parts) for (const k of Object.keys(parts)) parts[k].set(msg.parts[k], c.from);
                if (carveIn) for (const k of Object.keys(carveIn)) carveIn[k].set(msg.carve[k], c.from);
                if (msg.cells) { sampler.cells.set(msg.cells, 3 * c.from); sampler.weights.set(msg.weights, 3 * c.from); }
            });
        });
        this.workers.forEach((w, wi) => w.post({ type: 'job', jobId, frame: wi === 0 ? slim : null, cfg, seed, edgeKm: tMesh.edgeKm, parts: wantParts, carve: wantCarve, samplerKey,
            chunkIds: mesh.chunks.filter((_, i) => i % W === wi).map(c => c.id) }));
        // meanwhile, the plan here too: the caller reads the records (ridge directions, belt kinds) as well as the heights
        // (unless it asked for heights only — a frame built ahead, in the background, keeps the page's thread free)
        const t0 = performance.now(), plan = records ? preparePlan(frame, this.sim, cfg, seed, tMesh.edgeKm) : null, planMs = performance.now() - t0;
        await finished;
        mesh.sampler = sampler;
        return { heightKm, parts, carveIn, rec: plan?.rec ?? null, sampler, ms: { records: planMs, pooled: performance.now() - started, workers: W },
            kernels: counts.kernels, volcanoes: counts.volcanoes };
    }
}
