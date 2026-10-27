// The page's side of the detail finer than the mesh (plans/V2_FINE_DETAIL_PLAN.md; finish/fine-detail.js): workers that
// draw windows of a detailed moment — tiles of the view where it is zoomed in past the picture's own pixels (DetailTiles,
// below: drawn as the view moves, nearest its middle first, and kept, so panning back costs nothing; TileLayers lays them
// over the planet, each sent to the GPU once), and the exports enlarged past it, band by band. Each window carries only
// what it needs of the moment (cropSource: the picture's and the drivers' pixels under it), so no worker holds a copy of it.

import { detailSource, cropSource } from '../finish/fine-detail.js';

/** A tile's side (px). Level L draws the planet TILE · 2^L pixels wide: 2^L tiles across, 2^(L−1) down. */
export const TILE = 256;
/** A tile as laid on the GPU (px): with a pixel of its neighbours' all round, so the blend across its edge reads theirs.
 *  It is painted from a window two pixels wider all round (the hillshade's neighbours at its edges). */
export const SLOT = TILE + 2;

export class DetailService {
    /** @param {number} n  how many workers draw at once */
    constructor(n) { this.n = Math.max(1, n); this.workers = []; this.idle = []; this.queue = []; this.jobs = new Map(); this.next = 1; this.sources = new WeakMap(); }

    /** Whether a detailed moment can be drawn finer: one made before the drivers were (a planet file from before) cannot. */
    static can(fin) { return !!fin?.raster?.drivers; }

    /** The moment's source, once per moment. */
    source(fin, seed) {
        let s = this.sources.get(fin);
        if (!s) this.sources.set(fin, s = detailSource(fin, seed));
        return s;
    }

    /**
     * One window drawn by a worker: a promise of fineWindow's result. A job aborted before it starts is never sent; the
     * waiting job sent first is the one whose `ticket.order` is lowest (the caller may change it while it waits), else the
     * first asked for.
     */
    run(src, win, signal, ticket = null) {
        return new Promise((resolve, reject) => {
            const job = { id: this.next++, win, src, resolve, reject, signal, ticket };
            this.queue.push(job);
            this.pump();
        });
    }

    pump() {
        while (this.queue.length) {
            let at = 0;
            for (let i = 1; i < this.queue.length; i++) if ((this.queue[i].ticket?.order ?? Infinity) < (this.queue[at].ticket?.order ?? Infinity)) at = i;
            const job = this.queue[at];
            if (job.signal?.aborted) { this.queue.splice(at, 1); job.reject(new DOMException('The detail was cancelled', 'AbortError')); continue; }
            let w = this.idle.pop();
            if (!w && this.workers.length < this.n) w = this.spawn();
            if (!w) return;
            this.queue.splice(at, 1);
            this.jobs.set(job.id, { job, w });
            w.postMessage({ type: 'window', id: job.id, src: cropSource(job.src, job.win), win: job.win });
        }
    }

    spawn() {
        const w = new Worker(new URL('./detail-worker.js', import.meta.url), { type: 'module' });
        w.onmessage = ({ data }) => {
            const j = this.jobs.get(data.id);
            this.jobs.delete(data.id);
            this.idle.push(w);
            if (j) { if (data.type === 'done') j.job.resolve(data.out); else j.job.reject(new Error(data.message)); }
            this.pump();
        };
        w.onerror = e => {
            for (const [id, j] of this.jobs) if (j.w === w) { this.jobs.delete(id); j.job.reject(new Error(e.message || 'the detail worker stopped')); }
            this.workers = this.workers.filter(x => x !== w); w.terminate();
            this.pump();
        };
        this.workers.push(w);
        return w;
    }

    /**
     * A window ({W, x0, y0, w, h}: W the width of the planet it is a window of) drawn in bands of rows across the
     * workers, put together: { h, sea, wat }.
     */
    async window(fin, seed, win, signal = null, onBand = null) {
        // (bands of at most ~1.5 million pixels — a worker's band holds ~60 bytes a pixel — and at least one per worker)
        const src = this.source(fin, seed), parts = Math.max(Math.min(this.n, Math.floor(win.h / 64)), Math.ceil(win.w * win.h / 1.5e6), 1), rows = Math.max(16, Math.ceil(win.h / parts)), bands = [];
        for (let y = 0; y < win.h; y += rows) bands.push({ y, win: { W: win.W, x0: win.x0, y0: win.y0 + y, w: win.w, h: Math.min(rows, win.h - y) } });
        const out = { h: new Float32Array(win.w * win.h), sea: new Uint8Array(win.w * win.h), wat: new Uint8Array(win.w * win.h) };
        let done = 0;
        await Promise.all(bands.map(b => this.run(src, b.win, signal).then(o => {
            const at = b.y * win.w;
            out.h.set(o.h, at); out.sea.set(o.sea, at); out.wat.set(o.wat, at);
            onBand?.(++done / bands.length);
        })));
        return out;
    }

    terminate() { for (const w of this.workers) w.terminate(); this.workers = []; this.idle = []; for (const { job } of this.jobs.values()) job.reject(new DOMException('stopped', 'AbortError')); this.jobs.clear(); }
}

/**
 * The view's detail as tiles. The tiles a view wants (`want`) are drawn by the service's workers — nearest the view's
 * middle first (as it moves, the waiting ones are put in order again), those it no longer wants dropped before they
 * start — and kept, the least recently wanted dropped past `keep` (TileLayers lays them over the planet).
 */
export class DetailTiles {
    /** @param {DetailService} service  @param {{keep?: number, most?: number, maxLevel?: number, maxSpan?: number}} [o]  tiles kept; most in a
     *  view; the finest level; most across or down (TileLayers' layers on this GPU) */
    constructor(service, { keep = 200, most = 150, maxLevel = 9, maxSpan = 31 } = {}) {
        this.service = service; this.keep = keep; this.most = most; this.maxLevel = maxLevel; this.maxSpan = maxSpan;
        this.tiles = new Map(); this.fin = null; this.seed = 0; this.range = null; this.clock = 0;
        this.onTile = null;                                   // (called as each tile is drawn)
    }

    /** Forget every tile (another moment). */
    reset(fin = null, seed = 0) {
        for (const t of this.tiles.values()) t.ctl?.abort();
        this.tiles.clear(); this.fin = fin; this.seed = seed; this.range = null;
    }

    /**
     * The tiles a view wants, asked for where not drawn: `places` its sampled points as [lon, lat] (degrees; null off the
     * planet), `screenPx` its height in device pixels, `textureW` the picture shown's width. Returns the range
     * { L, tx0, tx1, ty0, ty1 } (tx may run past the planet's edge: wrapped), or null where the picture's own pixels are
     * fine enough.
     */
    want(fin, seed, places, screenPx, textureW) {
        if (fin !== this.fin) this.reset(fin, seed);
        const g = this.range = tileRange(places, screenPx, textureW, this.most, this.maxLevel, this.maxSpan), wanted = new Set();
        const list = [];
        if (g) for (let ty = g.ty0; ty <= g.ty1; ty++) for (let tx = g.tx0; tx <= g.tx1; tx++) {
            const key = keyOf(g.L, tx, ty), t = this.tiles.get(key), d = (tx + 0.5 - g.cx) ** 2 + (ty + 0.5 - g.cy) ** 2;
            wanted.add(key);
            if (t) { t.used = ++this.clock; if (t.ticket) t.ticket.order = d; }
            else list.push({ tx, ty, d });
        }
        for (const [key, t] of this.tiles) if (!t.data && !wanted.has(key)) { t.ctl.abort(); this.tiles.delete(key); }
        if (!g) return null;
        list.sort((a, b) => a.d - b.d);
        for (const { tx, ty, d } of list) this.request(g.L, tx, ty, d);
        this.trim();
        return g;
    }

    request(L, tx, ty, order = 0) {
        const n = 1 << L, x = ((tx % n) + n) % n, key = keyOf(L, x, ty);
        // (two pixels more all round: the slot's pixel of its neighbours', and the hillshade's neighbours beyond that)
        const t = { key, L, tx: x, ty, win: { W: TILE * n, x0: x * TILE - 2, y0: ty * TILE - 2, w: TILE + 4, h: TILE + 4 }, data: null, ctl: new AbortController(), ticket: { order }, used: ++this.clock, canvas: null, look: -1 };
        this.tiles.set(key, t);
        this.service.run(this.service.source(this.fin, this.seed), t.win, t.ctl.signal, t.ticket).then(data => {
            if (this.tiles.get(key) !== t) return;
            t.data = data; t.ctl = null; t.ticket = null;
            this.onTile?.(t);
        }).catch(err => { if (this.tiles.get(key) === t) this.tiles.delete(key); if (err.name !== 'AbortError') console.error(err); });
    }

    /** A tile, drawn or being drawn, or undefined. */
    tile(L, tx, ty) { return L < 0 ? undefined : this.tiles.get(keyOf(L, tx, ty)); }

    /** The drawn tile under a place (u west → east, v north → south, 0…1) at the view's level, and the pixel's index in its data. */
    at(u, v) {
        const g = this.range;
        if (!g) return null;
        const W = TILE << g.L, X = Math.floor((((u % 1) + 1) % 1) * W), Y = Math.floor(v * (W >> 1)), t = this.tile(g.L, Math.floor(X / TILE), Math.floor(Y / TILE));
        if (!t?.data) return null;
        return { t, i: (Y - t.win.y0) * t.win.w + (X - t.win.x0) };
    }

    trim() {
        if (this.tiles.size <= this.keep) return;
        const drawn = [...this.tiles.values()].filter(t => t.data).sort((a, b) => a.used - b.used);
        for (const t of drawn) { if (this.tiles.size <= this.keep) break; this.tiles.delete(t.key); }
    }
}

const keyOf = (L, tx, ty) => { const n = 1 << L; return `${L}/${((tx % n) + n) % n}/${ty}`; };

/**
 * The view's tiles laid over the planet: the globe's patch (globe-view.js putPatchTile), two layers of slots — the view's
 * level's, and under it another level's (the level before, or the one that covers more), standing in until the view's
 * own tiles come. A layer's slot holds the tiles whose column and row are its own modulo the layer's columns and rows, so
 * a pan lays only the tiles it brings, in the slots of those it leaves. Each tile is painted once per look (`paint`: a
 * SLOT-px canvas) and sent to the GPU once — nearest the view's middle first, as many as a frame's budget allows.
 */
export class TileLayers {
    /** @param {import('../app/globe-view.js').GlobeView} globe  @param {number} maxSpan  the most slots a layer may have across or down */
    constructor(globe, maxSpan) {
        this.globe = globe; this.maxSpan = maxSpan;
        this.layers = [0, 1].map(() => ({ L: -1, cols: 0, rows: 0, slots: null, count: 0, view: null }));
        this.look = -1; this.shown = false;
    }

    /** The patch off (its tiles kept: shown again at once). */
    hide() {
        if (!this.shown) return;
        this.globe.showPatchLayer(0, null); this.globe.showPatchLayer(1, null);
        this.shown = false;
    }

    /** Every tile laid forgotten (another moment). */
    clear() { this.hide(); this.empty(0); this.empty(1); }

    /** Layer k's slots emptied. */
    empty(k) {
        const A = this.layers[k];
        if (A.slots) { A.slots.fill(NaN); this.globe.emptyPatchLayer(k); }
        A.count = 0;
    }

    /**
     * Each frame: the view's tiles (`tiles`: their range and those drawn) laid — those drawn and not yet laid, as `paint`
     * paints them for `look` (another look: every tile painted again, the planet's own shown until it is), until `budgetMs`
     * is spent.
     */
    lay(tiles, look, paint, budgetMs) {
        const g = tiles.range;
        if (!g) { this.hide(); return; }
        const n = 1 << g.L, nx = g.tx1 - g.tx0 + 1, ny = g.ty1 - g.ty0 + 1;
        if (look !== this.look) { this.look = look; this.empty(0); this.empty(1); }
        let A = this.layers[0];
        if (A.L !== g.L || nx > A.cols || ny > A.rows) {
            // (another level, or more tiles than the layer holds: the layer under goes on top if it holds the view's level;
            // else the view's tiles begin again in whichever covers less of the view — the other stays under until they come)
            const B = this.layers[1], fits = B.L === g.L && nx <= B.cols && ny <= B.rows;
            if (fits || this.cover(A, g) >= this.cover(B, g)) this.swap();
            if (!fits) this.start(g.L, nx, ny);
            A = this.layers[0];
        }
        // (the range's columns as near the layer's last as they can be: past the date line they run on, each tile keeping its slot)
        const tx0 = g.tx0 + (A.view ? Math.round((A.view.tx0 - g.tx0) / n) * n : 0), shift = tx0 - g.tx0;
        A.view = { n, tx0, ty0: g.ty0, nx, ny };
        this.globe.showPatchLayer(0, A.view);
        this.globe.showPatchLayer(1, this.layers[1].count ? this.layers[1].view : null);
        this.shown = true;
        // the tiles drawn and not yet laid, nearest the view's middle first
        const todo = [];
        for (let ty = g.ty0; ty <= g.ty1; ty++) for (let tx = tx0; tx < tx0 + nx; tx++) {
            const s = (ty % A.rows) * A.cols + (((tx % A.cols) + A.cols) % A.cols), key = tx * 1e5 + ty;
            if (A.slots[s] === key) continue;
            const t = tiles.tile(g.L, ((tx % n) + n) % n, ty);
            if (t?.data) todo.push({ t, tx, ty, s, key, d: (tx + 0.5 - g.cx - shift) ** 2 + (ty + 0.5 - g.cy) ** 2 });
        }
        if (!todo.length) return;
        todo.sort((a, b) => a.d - b.d);
        const t0 = performance.now();
        for (const j of todo) {
            this.globe.putPatchTile(0, j.s % A.cols, Math.floor(j.s / A.cols), j.tx, j.ty, paint(j.t));
            if (!(A.slots[j.s] === A.slots[j.s])) A.count++;              // (NaN: the slot was empty)
            A.slots[j.s] = j.key;
            if (performance.now() - t0 > budgetMs) break;
        }
    }

    /** The two layers swapped: the view's level's goes under. */
    swap() { this.layers.reverse(); this.globe.swapPatchLayers(); }

    /** Layer 0 begun again for level L, its slots empty — made larger if it must hold more than nx × ny. */
    start(L, nx, ny) {
        const A = this.layers[0];
        const cols = Math.max(A.cols, Math.min(this.maxSpan, nx + 1)), rows = Math.max(A.rows, Math.min(this.maxSpan, ny + 1));
        if (cols !== A.cols || rows !== A.rows) { this.globe.sizePatchLayer(0, cols, rows, SLOT); A.cols = cols; A.rows = rows; A.slots = new Float64Array(cols * rows).fill(NaN); }
        else this.empty(0);
        A.L = L; A.count = 0; A.view = null;
    }

    /** The share of a view's range (tileRange's) that a layer's tiles laid cover. */
    cover(A, g) {
        if (A.L < 0 || !A.count) return 0;
        const ng = 1 << g.L, u0 = g.tx0 / ng, u1 = (g.tx1 + 1) / ng, v0 = 2 * g.ty0 / ng, v1 = 2 * (g.ty1 + 1) / ng, na = 1 << A.L;
        let s = 0;
        for (const key of A.slots) {
            if (!(key === key)) continue;
            const tx = Math.floor(key / 1e5), ty = key - tx * 1e5;
            let a0 = tx / na, a1 = (tx + 1) / na;
            const turn = Math.round((u0 + u1) / 2 - (a0 + a1) / 2);
            a0 += turn; a1 += turn;
            s += Math.max(0, Math.min(a1, u1) - Math.max(a0, u0)) * Math.max(0, Math.min(2 * (ty + 1) / na, v1) - Math.max(2 * ty / na, v0));
        }
        return s / ((u1 - u0) * (v1 - v0));
    }
}

/**
 * The tiles a view wants: the level whose pixels are about the screen's (a little finer), its tiles over the view and a
 * margin — at a coarser level if that would be more than `most`, or more than `maxSpan` across or down — or null where the
 * view is not zoomed in past the picture's own pixels (or the planet's edge, or a pole, is in view).
 */
export function tileRange(places, screenPx, textureW, most, maxLevel, maxSpan = Infinity) {
    const pts = places.filter(Boolean);
    if (pts.length < places.length * 0.9) return null;               // (the planet's edge in view: zoomed out)
    const c = pts[Math.floor(pts.length / 2)][0];
    let lo0 = Infinity, lo1 = -Infinity, la0 = Infinity, la1 = -Infinity;
    for (const [lon, lat] of pts) {
        const l = lon - Math.round((lon - c) / 360) * 360;
        lo0 = Math.min(lo0, l); lo1 = Math.max(lo1, l); la0 = Math.min(la0, lat); la1 = Math.max(la1, lat);
    }
    const latSpan = la1 - la0, lonSpan = lo1 - lo0;
    if (!(latSpan > 0) || lonSpan > 120 || la1 > 85 || la0 < -85) return null;
    const need = 360 * screenPx / latSpan, minL = Math.round(Math.log2(textureW / TILE)) + 1;     // (the planet's width the screen shows)
    if (need < 1.6 * textureW) return null;
    const mLat = 0.12 * latSpan, mLon = 0.12 * lonSpan;
    for (let L = Math.max(minL, Math.min(maxLevel, Math.ceil(Math.log2(need / TILE) - 0.25))); L >= minL; L--) {
        const n = 1 << L, rows = n >> 1;
        const tx0 = Math.floor((lo0 - mLon + 180) / 360 * n), tx1 = Math.floor((lo1 + mLon + 180) / 360 * n);
        const ty0 = Math.max(0, Math.floor((90 - la1 - mLat) / 180 * rows)), ty1 = Math.min(rows - 1, Math.floor((90 - la0 + mLat) / 180 * rows));
        const count = (tx1 - tx0 + 1) * (ty1 - ty0 + 1);
        if (count <= most && tx1 - tx0 < maxSpan && ty1 - ty0 < maxSpan) return { L, tx0, tx1, ty0, ty1, cx: ((lo0 + lo1) / 2 + 180) / 360 * n, cy: (90 - (la0 + la1) / 2) / 180 * rows };
        if (L === minL) return null;
    }
    return null;
}
