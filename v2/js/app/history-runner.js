// A scene's history, run in a worker when the page has workers (history-worker.js) — the page never freezes, and
// `onProgress(timeMyr)` reports each frame as it arrives — or right here where it has none (Node: the check scripts).

import { simulate } from '../tectonics/simulate.js';
import { terrainConfig } from '../terrain/terrain-config.js';
import { PackedFrame } from '../tectonics/frame-pack.js';
import { historyEnding } from '../tectonics/ending.js';
import { SMALL_DEVICE } from '../core/device.js';

/**
 * @param {{list: string, scene: Object, heights?: Object, ending?: string, start?: Object, lengthMyr?: number, keep?: boolean}} which   the
 *        scene, the name of its list in history-worker.js, overrides of the height constants the history evolves its
 *        heights with (terrain-config.js), the stage it should end in (tectonics/ending.js: it then runs on past its length
 *        until it is), start-world tunables for a scene that takes them, and a length other than the scene's; keep: the
 *        history can be run on afterwards — the result then has `more(untilMyr)` (a promise: runs it on to untilMyr, a
 *        multiple of the step grid, its frames through onFrame as before — the same history as one long run) and
 *        `close()` (lets its worker go); collect: false — the frames go to onFrame only (the result's `frames` stays
 *        empty: a history run again to check it against one kept elsewhere)
 * @param {(frame, index: number) => void} [onFrame]   each frame as it arrives (the Evolution page shows the planet as it builds)
 * @param {AbortSignal} [signal]   aborts the run (its worker is stopped; the promise rejects with an AbortError)
 * @returns {Promise<{frames: Object[], steps: number, stopped: boolean, complete: boolean}>}  stopped: it reached its
 *          ending; complete: it ran as far as a history may (so a longer run would not find more)
 */
export function runHistory({ list, scene, heights = {}, ending = 'none', start = {}, lengthMyr = null, keep = false, collect = true }, simMesh, seed, snapshotEveryMyr, onProgress = () => {}, onFrame = null, signal = null) {
    if (typeof Worker === 'undefined') {
        const world = scene.build(simMesh, seed, start);
        world.config.heights = terrainConfig(heights);
        const { untilMyr, stopAt } = historyEnding(lengthMyr ?? scene.maxMyr, ending, world.config);
        let n = 0;
        const each = onFrame ? f => onFrame(f, n++) : null;
        const r = simulate(world, { untilMyr, stopAt, drive: w => scene.drive(w), snapshotEveryMyr, onFrame: each });
        const out = { ...r, complete: !r.stopped && ending !== 'none', time: world.time };
        if (keep) {
            out.more = to => { const m = simulate(world, { untilMyr: to, resume: true, drive: w => scene.drive(w), snapshotEveryMyr, onFrame: each }); out.frames.push(...m.frames); return Promise.resolve({ steps: m.steps, time: world.time }); };
            out.close = () => {};
        }
        return Promise.resolve(out);
    }
    return new Promise((resolve, reject) => {
        const worker = new Worker(new URL('./history-worker.js', import.meta.url), { type: 'module' }), frames = [];
        let count = 0;
        let moreJob = null, dead = null;             // (a run-on under way: its promise's resolve / reject; the worker's end)
        const fail = err => { dead = err; worker.terminate(); if (moreJob) { moreJob.reject(err); moreJob = null; } else reject(err); };
        worker.onmessage = ({ data }) => {
            if (data.type === 'frame') { const frame = new PackedFrame(data.frame); if (collect) frames.push(frame); onProgress(frame.time); onFrame?.(frame, count++); }
            else if (data.type === 'done') {
                const out = { frames, steps: data.steps, stopped: data.stopped, complete: !data.stopped && ending !== 'none', time: data.time, ms: data.ms, packMs: data.packMs };
                if (!keep) worker.terminate();
                else {
                    out.more = untilMyr => dead ? Promise.reject(dead) : new Promise((res, rej) => { moreJob = { resolve: res, reject: rej }; worker.postMessage({ type: 'more', untilMyr }); });
                    out.close = () => worker.terminate();
                }
                resolve(out);
            } else if (data.type === 'more-done') { const job = moreJob; moreJob = null; job?.resolve({ steps: data.steps, time: data.time, ms: data.ms }); }
            else fail(new Error(`history worker: ${data.message}`));
        };
        worker.onerror = e => fail(new Error(`history worker: ${e.message}`));
        signal?.addEventListener('abort', () => fail(new DOMException('The history was stopped', 'AbortError')), { once: true });
        worker.postMessage({ list, sceneId: scene.id, seed, snapshotEveryMyr, heights, ending, start, lengthMyr, small: SMALL_DEVICE,
            mesh: { numCells: simMesh.numCells, xyz: simMesh.xyz, adjOffset: simMesh.adjOffset, adjList: simMesh.adjList } });
    });
}
