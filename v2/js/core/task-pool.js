// A pool of workers that each run named tasks — pure functions of what they are sent — for work that splits into pieces
// which do not depend on one another (the finish's per-cell stages and its picture's rows: finish/finish-tasks.js). The
// pieces are the same code the caller would run itself, so the pooled result is the single-threaded one, bit for bit;
// where workers cannot be started (a browser without workers inside workers) there is no pool, and the caller runs the
// pieces in place. Works in the browser (module workers) and in Node (worker threads), as terrain/terrain-pool.js.

const IS_NODE = typeof window === 'undefined' && typeof process !== 'undefined' && !!process.versions?.node && typeof WorkerGlobalScope === 'undefined';

async function spawn(url) {
    if (IS_NODE) {
        const { Worker } = await import('node:worker_threads');
        const w = new Worker(url);
        w.unref();                                        // (idle workers never keep a Node process alive; a job holds them)
        return { post: (m, t) => w.postMessage(m, t), listen: fn => w.on('message', fn), onCrash: fn => w.on('error', err => fn(err.message)),
            terminate: () => w.terminate(), hold: on => (on ? w.ref() : w.unref()) };
    }
    const w = new Worker(url, { type: 'module' });
    return { post: (m, t) => w.postMessage(m, t), listen: fn => w.addEventListener('message', e => fn(e.data)),
        onCrash: fn => w.addEventListener('error', e => { e.preventDefault?.(); fn(e.message || 'a worker stopped'); }), terminate: () => w.terminate(), hold: () => {} };
}

/**
 * Let typed arrays' memory go now, not when the garbage collector next looks: every array in `things` (arrays of them,
 * and objects holding them, a few levels down) is emptied — its buffer detached (ArrayBuffer.prototype.transfer, where
 * the browser has it; elsewhere this does nothing and the collector frees them in its own time). For a piece's inputs
 * once its task is done, and its results once they are taken in: at 10M cells a picture's pieces left ~1 GB waiting to
 * be collected. Only for arrays nothing reads again.
 */
export function release(...things) {
    const walk = (v, depth) => {
        if (!v || typeof v !== 'object') return;
        if (ArrayBuffer.isView(v)) { const b = v.buffer; if (b.byteLength && typeof b.transfer === 'function' && b instanceof ArrayBuffer) { try { b.transfer(0); } catch { /* (not ours to empty) */ } } return; }
        if (depth > 3 || v instanceof ArrayBuffer) return;
        for (const x of Array.isArray(v) ? v : Object.values(v)) walk(x, depth + 1);
    };
    for (const t of things) walk(t, 0);
}

/** How many cores the machine reports. */
export async function coreCount() { return IS_NODE ? (await import('node:os')).availableParallelism() : (globalThis.navigator?.hardwareConcurrency || 4); }

export class TaskPool {
    /**
     * @param {URL|string} workerUrl  a module that calls serveTasks (below) with its tasks
     * @param {number|null} most  the most workers (null: 8) — the pool has the cores but one, up to that
     * @returns {Promise<TaskPool|null>}  null where workers cannot be started, or the machine has fewer than three
     *          cores: a pool of one worker only adds its messages to the work
     */
    static async create(workerUrl, most = null) {
        try {
            const n = Math.min(most ?? 8, (await coreCount()) - 1);
            if (n < 2) return null;
            return new TaskPool(await Promise.all(Array.from({ length: n }, () => spawn(workerUrl))));
        } catch { return null; }
    }

    constructor(workers) {
        this.workers = workers.map((w, i) => ({ w, i, out: 0 }));
        this.pending = new Map();            // job id → { resolve, reject }
        this.nextId = 1;
        this.waiting = [];                   // resolvers of callers waiting for a free worker
        this.closed = false;
        for (const s of this.workers) {
            s.w.listen(msg => { const p = this.pending.get(msg.id); if (!p) return; this.pending.delete(msg.id); if (msg.error) p.reject(new Error(`pool worker: ${msg.error}`)); else p.resolve(msg.result); });
            s.w.onCrash(m => this.fail(`a worker stopped (${m || 'out of memory?'})`));
        }
    }

    get size() { return this.workers.length; }

    fail(message) {
        this.closed = true;
        for (const p of [...this.pending.values()]) p.reject(new Error(message));
        this.pending.clear();
        for (const r of this.waiting.splice(0)) r(null);
    }

    terminate() {
        if (!this.closed) this.fail('the pool was closed');
        for (const s of this.workers) s.w.terminate();
        this.workers = [];
    }

    /** Give every worker `value` under `key`, once (copied to each): what all the pieces of a job read. A task finds it as common[key]. */
    async share(key, value) {
        await Promise.all(this.workers.map(s => this.send(s, { type: 'share', key, value })));
    }
    /** Let the workers' shared values go (all of them, or one key's). */
    async forget(key = null) {
        if (this.closed) return;
        await Promise.all(this.workers.map(s => this.send(s, { type: 'forget', key })));
    }

    send(slot, msg, transfer = []) {
        if (this.closed) return Promise.reject(new Error('the pool was closed'));
        const id = this.nextId++;
        // (a worker with a message out is held: in Node an idle one would let the process end)
        if (slot.out++ === 0) slot.w.hold(true);
        const settle = () => { if (--slot.out === 0) slot.w.hold(false); };
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve: v => { settle(); resolve(v); }, reject: e => { settle(); reject(e); } });
            slot.w.post({ ...msg, id }, transfer);
        });
    }

    /**
     * Run `task` on each of `count` pieces: `makePart(i)` → { part, transfer? } is asked for a piece only when a worker
     * is free to take it (so the pieces' copies of their inputs are never all in memory at once); `onResult(result, i)`
     * is given each piece's result as it arrives, in any order. Resolves when all are done; rejects on the first failure.
     */
    async run(task, count, makePart, onResult) {
        if (this.closed) throw new Error('the pool was closed');
        let next = 0, failed = null;
        const dispatch = (slot, i) => { const { part, transfer = [] } = makePart(i); return this.send(slot, { type: 'task', task, part }, transfer); };
        // (each worker has two pieces at a time — the one it is on and the next — and is handed another before a result is
        // taken in here: it never waits on this thread, which hands out and takes in for all of them)
        const lane = async slot => {
            const flying = [];                   // [index, promise], oldest first
            const feed = () => { while (flying.length < 2 && !failed && next < count) { const i = next++; flying.push([i, dispatch(slot, i)]); } };
            try { feed(); } catch (err) { failed ??= err; }
            while (flying.length) {
                const [i, sent] = flying.shift();
                let result;
                try { result = await sent; } catch (err) { failed ??= err; for (const [, p] of flying) p.catch(() => {}); return; }
                try { feed(); onResult(result, i); } catch (err) { failed ??= err; }
            }
        };
        await Promise.all(this.workers.map(lane));
        if (failed) throw failed;
    }
}

/**
 * A pool worker's side: `tasks` — name → (part, common) → result, or { result, transfer } — served over the worker's
 * messages. Call it once, from the worker's module. A task's `part` is let go (release) once its result is sent: a task
 * must not keep its part's arrays for later (what it hands back in its result is the caller's by then).
 */
export async function serveTasks(tasks) {
    const common = {};
    let post;
    const handle = async msg => {
        try {
            if (msg.type === 'share') { common[msg.key] = msg.value; post({ id: msg.id, result: true }); return; }
            if (msg.type === 'forget') { if (msg.key === null) for (const k of Object.keys(common)) delete common[k]; else delete common[msg.key]; post({ id: msg.id, result: true }); return; }
            const out = await tasks[msg.task](msg.part, common);
            if (out && out.transfer) post({ id: msg.id, result: out.result }, out.transfer); else post({ id: msg.id, result: out });
            release(msg.part);
        } catch (err) { post({ id: msg.id, error: err?.stack ?? String(err) }); }
    };
    if (typeof self === 'undefined' || typeof self.postMessage !== 'function') {            // a Node worker thread
        const { parentPort } = await import('node:worker_threads');
        post = (m, t) => parentPort.postMessage(m, t);
        parentPort.on('message', handle);
    } else {
        post = (m, t) => self.postMessage(m, t);
        self.onmessage = e => handle(e.data);
    }
}
