// Writing PNG files as their rows come, in a few workers (png-stream-worker.js): the files of an export drawn in bands
// (export-panel.js). Each file is opened on its first rows (their kind its header's), sent a band's columns at a time (a
// tile's, or all of them), and no more than `budget` bytes of rows wait at once — so the page holds a band or two of an
// export, never its planet.

export class PngPool {
    constructor(n = 4, budget = 768 * 2 ** 20) {
        this.workers = Array.from({ length: n }, () => {
            const w = new Worker(new URL('./png-stream-worker.js', import.meta.url), { type: 'module' });
            w.onmessage = ({ data }) => this.answer(data);
            w.onerror = e => this.fail(new Error(e.message || 'a PNG worker stopped'));
            return w;
        });
        this.calls = new Map(); this.seq = 0; this.ids = 0; this.next = 0;
        this.budget = budget; this.waiting = 0; this.wakers = []; this.error = null;
    }

    answer({ t, seq, bytes, message }) {
        const c = this.calls.get(seq);
        if (!c) return;
        this.calls.delete(seq);
        if (c.size) { this.waiting -= c.size; this.wake(); }
        if (t === 'error') { const e = new Error(message); this.error ??= e; c.reject(e); } else c.resolve(bytes);
    }
    fail(e) { this.error ??= e; for (const c of this.calls.values()) c.reject(e); this.calls.clear(); this.waiting = 0; this.wake(); }
    wake() { const w = this.wakers; this.wakers = []; for (const f of w) f(); }
    send(worker, msg, transfer = [], size = 0) {
        const seq = ++this.seq, p = new Promise((resolve, reject) => this.calls.set(seq, { resolve, reject, size }));
        worker.postMessage({ ...msg, seq }, transfer);
        return p;
    }

    /**
     * A PNG `width` × `height` written to `handle` (a FileSystemFileHandle): { rows(data, kind, n, x0, srcWidth), close()
     * → its bytes, abort() }. A failure shows at the next rows() or at close().
     */
    file(handle, width, height) {
        const pool = this, worker = this.workers[this.next++ % this.workers.length], id = ++this.ids;
        const soft = p => { p.catch(() => {}); return p; };
        let opened = false, closing = null;
        return {
            /** `n` rows of a band's map (`data`, `srcWidth` pixels a row, as `kind`: 'gray16', 'gray8', 'rgb' or 'rgba' —
             *  RGBA bytes for the last two), its columns x0 … x0 + width − 1 the file's. */
            async rows(data, kind, n, x0 = 0, srcWidth = width) {
                if (pool.error) throw pool.error;
                if (!opened) { opened = true; soft(pool.send(worker, { t: 'open', id, handle, width, height, kind })); }
                const ch = kind === 'gray16' || kind === 'gray8' ? 1 : 4, Arr = kind === 'gray16' ? Uint16Array : Uint8Array;
                const src = data instanceof Arr ? data : new Arr(data.buffer, data.byteOffset, data.length), out = new Arr(n * width * ch);
                for (let y = 0; y < n; y++) out.set(src.subarray(ch * (y * srcWidth + x0), ch * (y * srcWidth + x0 + width)), ch * y * width);
                // (no more than the budget waiting to be written: the page draws on while the workers catch up)
                while (pool.waiting > 0 && pool.waiting + out.byteLength > pool.budget && !pool.error) await new Promise(r => pool.wakers.push(r));
                if (pool.error) throw pool.error;
                pool.waiting += out.byteLength;
                soft(pool.send(worker, { t: 'rows', id, buf: out.buffer, n }, [out.buffer], out.byteLength));
            },
            close() { return (closing ??= pool.send(worker, { t: 'close', id })); },
            abort() { return soft(pool.send(worker, { t: 'abort', id })); },
        };
    }

    terminate() { for (const w of this.workers) w.terminate(); this.fail(new Error('stopped')); }
}
