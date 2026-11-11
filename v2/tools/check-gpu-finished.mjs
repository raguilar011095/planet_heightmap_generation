// Does the GPU paint a finished moment as the CPU does? Opens Generate in headless Chromium, waits for its finished
// planet, then paints it both ways — view/gpu-paint.js drawFinished and finish-view.js paintFinished — in each of a set
// of looks (palettes, the hillshade off, the lakes off, the Heightmap) and compares the two pictures pixel by pixel: the
// share of pixels more than 1 and more than 2 of 255 apart in any channel, and the largest difference. Passes when no
// look has more than 0.05 % of its pixels over 2 apart (where a palette steps sharply — a coast's, a contour's — a height
// on the step's edge may fall either side of it: float32 on the GPU, float64 on the CPU). The looks with the rivers and
// the grid over the picture come first: the lines are the same strokes on a canvas either way, but Chromium moves a
// canvas that has been read back a few times to its CPU rasteriser, whose lines' edges are then a shade off the other's.
// (The page itself keeps the CPU's paint where WebGL is drawn by the processor, as in headless Chromium: the check turns
// the GPU's on. Its timings there say nothing of a graphics card's.)
//
//   node tuning/dev-server.mjs 8123 &
//   node v2/tools/check-gpu-finished.mjs [--url http://localhost:8123] [--code PLANETCODE] [--libs DIR] [--shots DIR]
//
// Needs Playwright with its Chromium (a software GPU will do: the timings then say little). --libs as check-pages-exact.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const URL_ = arg('--url', 'http://localhost:8123'), LIBS = arg('--libs', null), SHOTS = arg('--shots', null);

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const errors = [];
await context.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, route => {
    const url = route.request().url();
    if (LIBS && url.includes('cdn.jsdelivr.net/npm/delaunator')) return route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(LIBS, 'delaunator.esm.js')) });
    const three = LIBS && url.match(/cdn\.jsdelivr\.net\/npm\/three@[^/]+\/(.*)$/);
    if (three) return route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(LIBS, 'three', three[1])) });
    if (url.includes('cdn.jsdelivr.net')) return route.continue();
    return route.abort();
});
// (the page's view, handed out for the check: its script served with one more line)
await context.route(/\/js\/main\.js(\?.*)?$/, async route => {
    const res = await route.fetch();
    await route.fulfill({ response: res, body: `${await res.text()}\nglobalThis.__pv = pv;\n` });
});
const page = await context.newPage();
page.on('pageerror', e => errors.push(`page error: ${e.message}`));
page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 300)}`); });
await page.addInitScript(() => { try { for (const k of ['orogen.tutorial', 'orogen.whatsnew']) localStorage.setItem(k, 'done'); } catch { /* */ } });
await page.goto(`${URL_}/generate#${arg('--code', '00001641lx5ilk8fg5tsw3')}`);
await page.waitForFunction(() => !!globalThis.__pv, null, { timeout: 120000 });
// (the finished moment: the one the page paints)
await page.evaluate(() => { const pv = globalThis.__pv, paint = pv.paintFinished.bind(pv); pv.paintFinished = (fin, ...a) => { globalThis.__fin = fin; return paint(fin, ...a); }; });
await page.waitForFunction(() => !!globalThis.__fin, null, { timeout: 900000 });
await page.waitForTimeout(1500);

// (no lines: the grid off, and the rivers' threshold above any river — the lakes still drawn)
const BARE = { grid: false, riverQ: 1e15 };
const LOOKS = [
    { name: 'with rivers and the grid', set: {} },
    { name: 'with rivers by regime', set: { byRegime: true, grid: false } },
    { name: 'Terrain (the palette chosen)', set: { ...BARE } },
    { name: 'Terrain, no hillshade', set: { ...BARE, shaded: false } },
    { name: 'Terrain, no lakes', set: { ...BARE, water: false } },
    { name: 'Heightmap', set: { ...BARE, layer: 'heightmap' } },
    ...['relief', 'topographic', 'natural', 'swiss', 'grey'].map(p => ({ name: `Terrain, palette ${p}`, set: { ...BARE, palette: p } })),
].filter((l, i) => !arg('--only', null) || arg('--only').split(',').map(Number).includes(i));
const results = await page.evaluate(async looks => {
    const pv = globalThis.__pv, fin = globalThis.__fin, gpu = pv.gpu, out = [];
    if (!gpu) return { none: true };
    pv.finishedOnGpu = true;
    const W = gpu.width, H = W >> 1, was = { ...pv.view };
    const palettes = [...document.getElementById('palette').options].map(o => o.value);
    for (const look of looks) {
        if (look.set.palette && !palettes.includes(look.set.palette)) continue;
        Object.assign(pv.view, was, look.set);
        // the GPU's (painted twice: the first sends the picture and the lines; the second is a switch's cost)
        pv.paintFinished(fin, true, 'check');
        let t0 = performance.now();
        pv.paintFinished(fin, true, 'check');
        const g = gpu.read(), gpuMs = performance.now() - t0;
        // the CPU's, on the sharper canvas
        pv.gpu = null;
        t0 = performance.now();
        pv.paintFinished(fin, true, 'check');
        const cpuMs = performance.now() - t0, c = pv.tex.sharp.ctx.getImageData(0, 0, W, H).data;
        pv.gpu = gpu;
        let over1 = 0, over2 = 0, max = 0;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const a = 4 * ((H - 1 - y) * W + x), b = 4 * (y * W + x);
            const d = Math.max(Math.abs(g[a] - c[b]), Math.abs(g[a + 1] - c[b + 1]), Math.abs(g[a + 2] - c[b + 2]));
            if (d > 1) over1++; if (d > 2) over2++; if (d > max) max = d;
        }
        let shots = null;
        if (look.dump) {
            const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
            const cx = cv.getContext('2d'), im = cx.createImageData(W, H);
            for (let y = 0; y < H; y++) im.data.set(g.subarray(4 * (H - 1 - y) * W, 4 * (H - y) * W), 4 * y * W);
            cx.putImageData(im, 0, 0);
            shots = [cv.toDataURL('image/png'), pv.tex.sharp.canvas.toDataURL('image/png')];
        }
        out.push({ name: look.name, lines: !!look.lines, over1: over1 / (W * H), over2: over2 / (W * H), max, gpuMs, cpuMs, W, shots });
    }
    Object.assign(pv.view, was);
    pv.paintFinished(fin, true, 'check');
    return { out };
}, LOOKS.map(l => ({ ...l, dump: !!SHOTS })));
if (SHOTS) {
    fs.mkdirSync(SHOTS, { recursive: true });
    results.out?.forEach((r, i) => r.shots?.forEach((url, k) => fs.writeFileSync(path.join(SHOTS, `look${i}-${k ? 'cpu' : 'gpu'}.png`), Buffer.from(url.split(',')[1], 'base64'))));
}
if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, 'gpu-finished.png') }); }
await browser.close();
for (const e of errors) console.log(e);
if (results.none) { console.log('the page paints on the CPU here (no WebGL 2): nothing to compare'); process.exit(1); }
let bad = 0;
console.log(`${'look'.padEnd(34)} ${'> 1 apart'.padStart(10)} ${'> 2 apart'.padStart(10)} ${'largest'.padStart(8)} ${'GPU ms'.padStart(8)} ${'CPU ms'.padStart(8)}`);
for (const r of results.out) {
    if (r.over2 > 0.0005) { bad++; r.name += '  ✗'; }
    console.log(`${r.name.padEnd(34)} ${(100 * r.over1).toFixed(3).padStart(8)} % ${(100 * r.over2).toFixed(3).padStart(8)} % ${String(r.max).padStart(8)} ${r.gpuMs.toFixed(0).padStart(8)} ${r.cpuMs.toFixed(0).padStart(8)}`);
}
console.log(bad || errors.some(e => e.startsWith('page error')) ? `${bad} look(s) differ by more than allowed` : `the GPU's picture is the CPU's, within 2 of 255 (${results.out[0]?.W} px wide)`);
process.exit(bad || errors.some(e => e.startsWith('page error')) ? 1 : 0);
