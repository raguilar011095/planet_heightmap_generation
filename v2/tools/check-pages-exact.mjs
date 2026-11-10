// Do two copies of the site make the same world in a real browser? Opens a page of each (Generate, Import or Evolution) in
// headless Chromium, taps every message its workers send back — the first picture, the history's frames, the finished
// moment — fingerprints what they carry (every typed array's bytes) and times them; then prints both, side by side. For
// proving a speed-up exact in the page itself (workers inside workers, transfers and all), not only in Node.
//
//   node tuning/dev-server.mjs 8123 &                       (this checkout)
//   node <other checkout>/tuning/dev-server.mjs 8124 &      (the one to compare with: e.g. `git archive main | tar -x -C DIR`)
//   node v2/tools/check-pages-exact.mjs generate|import|evolution [--a http://localhost:8124] [--b http://localhost:8123]
//        [--query "seed=7&cont=30&len=300&sim=20000&terrain=160000"] [--detail 640000] [--phone] [--libs DIR]
//
// Needs Playwright with its Chromium. The pages load three.js and Delaunator from jsDelivr: with --libs DIR (holding
// three/ — the npm package — and delaunator.esm.js, a bundle of delaunator) they are served from there instead, for a
// machine that cannot reach the CDN.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const { chromium, devices } = createRequire(import.meta.url)('playwright');       // (the machine's own Playwright, wherever it is installed)

const argv = process.argv.slice(2), PAGE = argv[0];
const arg = (k, d) => { const i = argv.indexOf(k); return i > 0 ? argv[i + 1] : d; };
const A = arg('--a', 'http://localhost:8124'), B = arg('--b', 'http://localhost:8123'), LIBS = arg('--libs', null), PHONE = argv.includes('--phone');
if (!['generate', 'import', 'evolution'].includes(PAGE)) { console.error('usage: node v2/tools/check-pages-exact.mjs generate|import|evolution [--a URL] [--b URL] [--query Q] [--detail N] [--phone] [--libs DIR]'); process.exit(2); }

// (in the page, before its scripts: every worker's messages back tapped — fingerprinted at once, before the page hands
// their arrays on — with when they came)
const TAP = () => {
    const mix = (h, x) => Math.imul(h ^ x, 16777619) >>> 0;
    const feed = (st, v, seen) => {
        if (v === null || v === undefined) return;
        if (ArrayBuffer.isView(v)) { const u = new Uint8Array(v.buffer, v.byteOffset, v.byteLength); let a = st.a, b = st.b; for (let i = 0; i < u.length; i++) { a = Math.imul(a ^ u[i], 16777619); b = (Math.imul(b, 31) + u[i]) | 0; } st.a = a >>> 0; st.b = b >>> 0; st.n += u.length; return; }
        if (typeof v === 'number') { const s = String(v); for (let i = 0; i < s.length; i++) st.a = mix(st.a, s.charCodeAt(i)); return; }
        if (typeof v === 'string') { for (let i = 0; i < v.length; i++) st.a = mix(st.a, v.charCodeAt(i)); return; }
        if (typeof v !== 'object' || seen.has(v)) return;
        seen.add(v);
        if (Array.isArray(v)) { for (const x of v) feed(st, x, seen); return; }
        for (const k of Object.keys(v).sort()) { if (k === 'ms' || k === 'packMs' || k === '_workerTotal' || k === 'secs') continue; for (let i = 0; i < k.length; i++) st.a = mix(st.a, k.charCodeAt(i)); feed(st, v[k], seen); }
    };
    const print = v => { const st = { a: 2166136261, b: 7, n: 0 }; feed(st, v, new Set()); return `${st.a.toString(16).padStart(8, '0')}${st.b.toString(16).padStart(8, '0')}:${st.n}`; };
    const taps = window.__taps = [], Orig = window.Worker;
    window.Worker = class extends Orig {
        constructor(url, opts) {
            super(url, opts);
            const name = String(url).split('/').pop().split('?')[0];
            this.addEventListener('message', e => {
                const d = e.data, type = d?.type ?? '';
                if (type === 'progress' || type === 'stage' || type === 'tile' || !d) return;
                taps.push({ worker: name, type, at: Math.round(performance.now()), print: print(d), ms: d.ms && typeof d.ms === 'object' ? Object.fromEntries(Object.entries(d.ms).map(([k, x]) => [k, Math.round(x)])) : null, time: d.frame?.time ?? null, total: typeof d._workerTotal === 'number' ? Math.round(d._workerTotal) : null });
            });
        }
    };
};

async function run(base) {
    const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    const context = await browser.newContext(PHONE ? { ...devices['Pixel 7'] } : { viewport: { width: 1400, height: 900 } });
    const errors = [];
    await context.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, route => {
        const url = route.request().url();
        if (LIBS && url.includes('cdn.jsdelivr.net/npm/delaunator')) return route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(LIBS, 'delaunator.esm.js')) });
        const three = LIBS && url.match(/cdn\.jsdelivr\.net\/npm\/three@[^/]+\/(.*)$/);
        if (three) return route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(LIBS, 'three', three[1])) });
        if (url.includes('cdn.jsdelivr.net')) return route.continue();
        return route.abort();                                         // (fonts, analytics: not what is compared)
    });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(`page error: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 300)}`); });
    await page.addInitScript(TAP);
    await page.addInitScript(() => { try { for (const k of ['orogen.tutorial', 'orogen.whatsnew']) localStorage.setItem(k, 'done'); } catch { /* */ } });
    const taps = () => page.evaluate(() => window.__taps.slice());
    const until = async (test, what, secs = 900) => {
        const t0 = Date.now();
        for (;;) { const all = await taps(); const hit = all.find(test); if (hit) return hit; if (errors.some(e => e.startsWith('page error'))) throw new Error(errors.join('\n')); if (Date.now() - t0 > secs * 1000) throw new Error(`timed out waiting for ${what}\n${JSON.stringify(all.slice(-5))}\n${errors.join('\n')}`); await page.waitForTimeout(250); }
    };
    if (PAGE === 'generate') {
        await page.goto(`${base}/generate${arg('--query', '') ? `?${arg('--query')}` : ''}#${arg('--code', '00001641lx5ilk8fg5tsw3')}`);
        await until(t => t.worker === 'planet-worker.js' && t.type === 'done', 'the first picture');
        await until(t => t.worker === 'finish-worker.js' && t.type === 'done', 'the finish');
        if (argv.includes('--reapply')) {
            // (the same world's ground again — Reapply — with the workers that drew the first, and its finish)
            const before = (await taps()).length;
            await page.evaluate(() => { const b = document.getElementById('reapplyBtn'); b.disabled = false; b.click(); });
            await until(t => t.worker === 'planet-worker.js' && t.type === 'reapplyDone', 'the reapplied ground');
            for (;;) { const all = await taps(); if (all.slice(before).some(t => t.worker === 'finish-worker.js' && t.type === 'done')) break; await page.waitForTimeout(250); }
        }
    } else if (PAGE === 'import') {
        await page.goto(`${base}/import${arg('--query', '') ? `?${arg('--query')}` : ''}`);
        await until(t => t.worker === 'planet-worker.js' && t.type === 'done', 'the first picture');
        await until(t => t.worker === 'finish-worker.js' && t.type === 'done', 'the finish');
    } else {
        await page.goto(`${base}/evolution?${arg('--query', 'seed=7&cont=30&len=300&end=none&sim=20000&terrain=160000')}`);
        await until(t => t.worker === 'history-worker.js' && t.type === 'done', 'the history');
        // (Add detail at the detail asked for, at the history's end)
        await page.waitForTimeout(1500);
        await page.evaluate(detail => { const s = document.getElementById('finishCells'); s.value = String(detail); s.dispatchEvent(new Event('change', { bubbles: true })); }, Number(arg('--detail', 640000)));
        await page.waitForFunction(() => !document.getElementById('cardAction').disabled, null, { timeout: 120000 });
        await page.evaluate(() => document.getElementById('cardAction').click());
        await until(t => t.worker === 'finish-worker.js' && t.type === 'done', 'the finish');
    }
    const all = await taps();
    await browser.close();
    return { taps: all, errors };
}

const [ra, rb] = [await run(A), await run(B)];
// (a message's name: its worker, its kind, a frame's time — and which of its kind it is, for a page that builds twice)
for (const r of [ra, rb]) { const seen = new Map(); for (const t of r.taps) { const k = `${t.worker} ${t.type}${t.time !== null ? ` ${t.time}` : ''}`, n = (seen.get(k) ?? 0) + 1; seen.set(k, n); t.key = n > 1 ? `${k} (${n})` : k; } }
const key = t => t.key;
const mb = new Map(rb.taps.map(t => [key(t), t]));
let differ = 0;
console.log(`${'message'.padEnd(44)} ${'a: at ms'.padStart(9)} ${'b: at ms'.padStart(9)}  same?`);
for (const t of ra.taps) {
    const u = mb.get(key(t));
    if (t.worker === 'history-worker.js' && t.type === 'frame' && u && u.print === t.print) continue;      // (frames that agree: not listed)
    const same = u ? u.print === t.print : false;
    if (!same) differ++;
    console.log(`${key(t).padEnd(44)} ${String(t.at).padStart(9)} ${String(u?.at ?? '—').padStart(9)}  ${same ? 'the same' : `DIFFERENT (${t.print} / ${u?.print ?? 'missing'})`}`);
}
const frames = ra.taps.filter(t => t.type === 'frame').length;
if (frames) console.log(`(${frames} history frames in a; ${rb.taps.filter(t => t.type === 'frame').length} in b)`);
for (const [name, r] of [['a', ra], ['b', rb]]) {
    const fin = r.taps.find(t => t.worker === 'finish-worker.js' && t.type === 'done');
    for (const t of r.taps) if (t.total !== null) console.log(`${name}: ${t.worker} ${t.type} took ${t.total} ms in its worker`);
    if (fin?.ms) console.log(`${name}: finish stages (ms) ${Object.entries(fin.ms).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
    for (const e of r.errors) console.log(`${name}: ${e}`);
}
console.log(differ ? `${differ} message(s) DIFFER` : 'every message the same');
process.exit(differ ? 1 : 0);
