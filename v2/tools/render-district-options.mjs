// Options for the districts' shapes (plans/V2_DEPOSITS_LOOK_PLAN.md D0), to pick from by eye: the same places of the
// same moments (render-deposits.mjs's cached finishes) with the district noise varied along each of its scales — three
// levels each, D0's own in the middle — and a few combinations, beside today's look. → v2/out/deposits/options/index.html
//
//   node --max-old-space-size=16000 v2/tools/render-district-options.mjs [--moments 2024-900,542650052-2180] [--views copper,gold,leadZinc]

import fs from 'node:fs';
import path from 'node:path';
import v8 from 'node:v8';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';
import Delaunator from 'delaunator';
import { PNG } from 'pngjs';
import { setDelaunator } from '../../js/sphere-mesh.js';
import { buildSimMesh } from '../js/core/sim-mesh.js';
import { LatLonGrid } from '../js/finish/finish-grid.js';
import { paintFinished } from '../js/evolution/finish-view.js';
import { finishedGeologyColor, inkWash, washGround } from '../js/evolution/geology-view.js';
import { heightLutOf } from '../js/evolution/looks.js';
import { depositFields, DEPOSITS, METALS } from '../js/geology/deposits.js';
import { GEOLOGY } from '../js/geology/geology-config.js';

setDelaunator(Delaunator);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const MOMENTS = arg('--moments', '2024-900,542650052-2180').split(',');
const VIEWS = arg('--views', 'mix,copper,gold,leadZinc').split(',');
const OUT = path.join(ROOT, 'v2', 'out', 'deposits'), DIR = path.join(OUT, 'options'), W = 4096, t0 = performance.now();
const secs = () => `${((performance.now() - t0) / 1000).toFixed(0)} s`;
// (the places shown: x, y, w, h in the 4096-wide picture)
const CROPS = { '2024-900': [1850, 650, 1100, 800], '542650052-2180': [600, 450, 1100, 800], '432175-300': [1500, 500, 1100, 800] };
const VIEW_NAMES = { mix: 'Copper, gold, lead-zinc, tin, nickel together', copper: 'Copper (arc and belt deposits)', gold: 'Gold (shear zones)', leadZinc: 'Lead and zinc (basins)', iron: 'Iron', oilGas: 'Oil and gas', coal: 'Coal', all: 'All metals', tin: 'Tin' };
const lut = heightLutOf('relief');

// ── the scales, each three levels (D0's in the middle), and the combinations ──
const each = (S, fn) => { for (const r of Object.values(S.recipes)) fn(r); };
const stretch = f => S => each(S, r => { r.stretch = 1 + (r.stretch - 1) * f; });
const alpha = f => S => each(S, r => { r.alpha = Math.min(0.95, r.alpha * f); });
const lines = f => S => each(S, r => { r.cross *= f; r.shear = Math.min(0.95, r.shear * f); });
const set = o => S => Object.assign(S, o);
const all = (...fns) => S => fns.forEach(f => f(S));
const AXES = [
    ['size', 'Size variety', 'how different the districts are in size: clusters of clusters', [
        ['even', 'Even', alpha(0.5)], ['d0', 'Varied (default)', null], ['lumpy', 'Very lumpy', all(alpha(1.3), set({ character: 0.7 }))]]],
    ['grain', 'Along the grain', 'how far districts are drawn out along a belt or a shield', [
        ['round', 'Round', stretch(0)], ['d0', 'Lenses (default)', null], ['chains', 'Long chains', stretch(2.2)]]],
    ['lines', 'Fault lines', 'how much districts keep to fault corridors', [
        ['off', 'Off', lines(0)], ['d0', 'Soft (default)', null], ['strong', 'Strong', lines(1.8)]]],
    ['warp', 'Bent outlines', 'how much outlines wander, lobe and fork', [
        ['smooth', 'Smooth', set({ warpAmpKm: [0, 0] })], ['d0', 'Lobed (default)', null], ['contorted', 'Contorted', set({ warpAmpKm: [260, 90] })]]],
    ['scale', 'District size', 'every district spacing × this', [
        ['small', 'Small (× 0.6)', set({ districtScale: 0.6 })], ['d0', 'Medium (default)', null], ['large', 'Large (× 1.7)', set({ districtScale: 1.7 })]]],
    ['coupling', 'Coupling between deposits', 'how much different kinds of deposit share their provinces, fault lines and lumpiness (systems of one association — copper-gold, lead-zinc, oil-gas… — always share theirs)', [
        ['independent', 'Independent (0)', set({ coupling: 0 })], ['d0', 'By association (default, 0.2)', null], ['shared', 'One field for all (1, as D0 first was)', set({ coupling: 1 })]]],
    ['breakup', 'Inner breakup', 'how much a district\'s outline breaks into pieces', [
        ['whole', 'Whole', set({ innerOutline: 0 })], ['d0', 'Some (default)', null], ['fragmented', 'Fragmented', set({ innerOutline: 0.8 })]]],
];
const PRESETS = [
    ['bold', 'Bold', 'large, long chains, strong fault lines, whole', all(set({ districtScale: 1.7, innerOutline: 0 }), stretch(2.2), lines(1.8))],
    ['structural', 'Structural', 'long chains, strong fault lines, smooth outlines, even sizes', all(stretch(2.2), lines(1.8), set({ warpAmpKm: [0, 0] }), alpha(0.5))],
    ['organic', 'Organic', 'round, contorted, very lumpy, whole', all(stretch(0), set({ warpAmpKm: [260, 90], innerOutline: 0, character: 0.7 }), alpha(1.3))],
    ['fine', 'Fine-grained', 'small, very lumpy, fragmented', all(set({ districtScale: 0.6, innerOutline: 0.8, character: 0.7 }), alpha(1.3))],
];
const VARIANTS = [['d0', null], ...AXES.flatMap(([, , , lv]) => lv.filter(([id]) => id !== 'd0')).map(([id, , fn]) => [id, fn]), ...PRESETS.map(([id, , , fn]) => [id, fn])];

// (several metals at once — each place its richest of them — so it shows how much they go together)
const MIX = ['copper', 'gold', 'leadZinc', 'tin', 'nickel'];
function mixColor(Dp, W) {
    const H = W >> 1, SYS = DEPOSITS.length, K = Dp.cells.length, p0 = GEOLOGY.deposits.grades[0], wash = {};
    const grids = MIX.map(id => { const mi = METALS.findIndex(m => m.id === id), g = new Float32Array(Dp.w * Dp.h); for (let j = 0; j < K; j++) g[Dp.cells[j]] = Dp.data[(SYS + mi) * K + j] / 255; return { g, rgb: METALS[mi].rgb }; });
    return (out, o, x, y, wet, kk, k3, v, lake) => {
        washGround(out, o, wet, kk, lake);
        if (wet) return;
        const la = 90 - (y + 0.5) / H * 180, lo = (x + 0.5) / W * 360 - 180;
        const gx = (lo + 180) / Dp.step - 0.5, gy = Math.max(0, Math.min(Dp.h - 1, (90 - la) / Dp.step - 0.5)), x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
        const xa = ((x0 % Dp.w) + Dp.w) % Dp.w, xb = (xa + 1) % Dp.w, y1 = Math.min(Dp.h - 1, y0 + 1);
        let best = null, bv = 0;
        for (const G of grids) {
            const g = G.g, val = g[y0 * Dp.w + xa] * (1 - fx) * (1 - fy) + g[y0 * Dp.w + xb] * fx * (1 - fy) + g[y1 * Dp.w + xa] * (1 - fx) * fy + g[y1 * Dp.w + xb] * fx * fy;
            if (val > bv) { bv = val; best = G; }
        }
        if (best && bv >= p0) inkWash(out, o, best.rgb, bv, wet, kk, wash);
    };
}
const writePng = (file, w, h, rgba) => { const p = new PNG({ width: w, height: h }); p.data = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength); fs.writeFileSync(file, PNG.sync.write(p)); };
const crop = (src, sw, [x0, y0, w, h]) => { const o = new Uint8ClampedArray(4 * w * h); for (let y = 0; y < h; y++) o.set(src.subarray(4 * ((y0 + y) * sw + x0), 4 * ((y0 + y) * sw + x0 + w)), 4 * y * w); return o; };

// (today's deposits, as main has them — for the several-metals picture, which render-deposits' base does not draw: main's
// deposits.js and its config, written beside the geology for a moment and removed again)
const GEO_DIR = path.join(ROOT, 'v2', 'js', 'geology'), BASE_REF = arg('--base-ref', 'b9eb7fe');
const tmpDep = path.join(GEO_DIR, '_base-deposits.tmp.js'), tmpCfg = path.join(GEO_DIR, '_base-config.tmp.js');
fs.writeFileSync(tmpCfg, execSync(`git show ${BASE_REF}:v2/js/geology/geology-config.js`, { cwd: ROOT }));
fs.writeFileSync(tmpDep, execSync(`git show ${BASE_REF}:v2/js/geology/deposits.js`, { cwd: ROOT }).toString().replace("from './geology-config.js'", "from './_base-config.tmp.js'"));
let baseDepositFields;
try { ({ depositFields: baseDepositFields } = await import(pathToFileURL(tmpDep).href)); } finally { fs.rmSync(tmpDep); fs.rmSync(tmpCfg); }

const simMesh = buildSimMesh(40000, 12345);
for (const key of MOMENTS) {
    const [seed, time] = key.split('-').map(Number), box = CROPS[key] ?? [1500, 500, 1100, 800], dir = path.join(DIR, key);
    fs.mkdirSync(dir, { recursive: true });
    const { frame } = v8.deserialize(fs.readFileSync(path.join(ROOT, 'v2', 'out', 'frames', `frame-geo-${seed}-30-40000-${time}.bin`)));
    const { fin, depIn } = v8.deserialize(fs.readFileSync(path.join(OUT, 'cache', `${key}-2500000.bin`)));
    // (today's look, from render-deposits' base phase)
    for (const v of VIEWS) {
        const f = path.join(OUT, 'base', key, `${v}.png`);
        if (fs.existsSync(f)) { const p = PNG.sync.read(fs.readFileSync(f)); writePng(path.join(dir, `base-${v}.png`), box[2], box[3], crop(new Uint8ClampedArray(p.data.buffer, p.data.byteOffset, p.data.length), p.width, box)); }
    }
    const H = W >> 1, image = { data: new Uint8ClampedArray(4 * W * H) };
    if (VIEWS.includes('mix')) {
        const Dp = baseDepositFields({ ...depIn, frame, simMesh, on: { grid: new LatLonGrid(depIn.on.gridStep), lat: depIn.on.lat, lon: depIn.on.lon } });
        paintFinished(fin.raster, { width: W, image }, lut, { lakes: true, exaggeration: 20, colorAt: mixColor(Dp, W) });
        writePng(path.join(dir, 'base-mix.png'), box[2], box[3], crop(image.data, W, box));
    }
    for (const [id, fn] of VARIANTS) {
        const S = structuredClone(GEOLOGY.deposits.shapes);
        if (fn) fn(S);
        const G = { ...GEOLOGY, deposits: { ...GEOLOGY.deposits, shapes: S } };
        fin.raster.geology.deposits = depositFields({ ...depIn, frame, simMesh, on: { grid: new LatLonGrid(depIn.on.gridStep), lat: depIn.on.lat, lon: depIn.on.lon } }, G);
        for (const v of VIEWS) {
            const colorAt = v === 'mix' ? mixColor(fin.raster.geology.deposits, W) : finishedGeologyColor('geoDeposits', W, fin, v === 'all' ? 'all' : 'm.' + v);
            paintFinished(fin.raster, { width: W, image }, lut, { lakes: true, exaggeration: 20, colorAt });
            writePng(path.join(dir, `${id}-${v}.png`), box[2], box[3], crop(image.data, W, box));
        }
        console.log(`${key} ${id} (${secs()})`);
    }
}

const manifest = { moments: MOMENTS, views: VIEWS.map(v => [v, VIEW_NAMES[v] ?? v]), axes: AXES.map(([id, name, words, lv]) => [id, name, words, lv.map(([l, label]) => [l, label])]),
    presets: PRESETS.map(([id, name, words]) => [id, name, words]) };
fs.writeFileSync(path.join(DIR, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>District shape options</title>
<style>
:root{--bg:#14161a;--panel:#1d2026;--text:#e6e3dc;--muted:#9a978f;--accent:#e2a24a}
body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 system-ui,sans-serif}
header{padding:12px 16px;background:var(--panel);position:sticky;top:0;z-index:2;display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center}
header h1{font-size:15px;margin:0 8px 0 0}
label{display:flex;gap:6px;align-items:center;color:var(--muted)}
select{background:#2a2e36;color:var(--text);border:1px solid #3a3f49;border-radius:6px;padding:6px 8px;font:inherit;min-height:32px}
main{padding:12px 16px 40px}
h2{font-size:15px;margin:22px 0 2px}
p.w{color:var(--muted);margin:0 0 8px}
.row{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.row.four{grid-template-columns:repeat(4,1fr)}
figure{margin:0;cursor:zoom-in}
figure img{width:100%;height:auto;display:block;border-radius:4px;background:#000}
figure.mid figcaption{color:var(--accent)}
figcaption{color:var(--muted);margin:4px 0 0}
#big{position:fixed;inset:0;background:rgba(0,0,0,.92);display:none;align-items:center;justify-content:center;z-index:5;cursor:zoom-out;flex-direction:column}
#big img{max-width:96vw;max-height:88vh}
#big div{color:var(--text);margin-top:8px}
@media (max-width:760px){.row,.row.four{grid-template-columns:1fr}}
</style></head><body>
<header><h1>District shapes — options</h1>
<label>Moment <select id="m"></select></label>
<label>Deposit <select id="v"></select></label></header>
<main id="main"></main>
<div id="big"><img alt=""><div></div></div>
<script>
const M=${JSON.stringify(manifest)};
const $=id=>document.getElementById(id), opt=(sel,items)=>{sel.innerHTML=items.map(([v,t])=>'<option value="'+v+'">'+t+'</option>').join('')};
opt($('m'),M.moments.map(k=>[k,'seed '+k.replace('-',' at ')+' Myr'])); opt($('v'),M.views);
const fig=(id,label,mid)=>'<figure'+(mid?' class="mid"':'')+' data-id="'+id+'" data-label="'+label+'"><img loading="lazy" src="'+$('m').value+'/'+id+'-'+$('v').value+'.png" alt="'+label+'"><figcaption>'+label+'</figcaption></figure>';
function show(){
  let h='<h2>Today</h2><p class="w">as on main, for reference</p><div class="row">'+fig('base','Today')+fig('d0','The default',true)+'</div>';
  for(const [id,name,words,lv] of M.axes) h+='<h2>'+name+'</h2><p class="w">'+words+'</p><div class="row">'+lv.map(([l,label])=>fig(l,label,l==='d0')).join('')+'</div>';
  h+='<h2>Combinations</h2><p class="w">several scales at once</p><div class="row four">'+M.presets.map(([id,name,words])=>fig(id,name+' — '+words)).join('')+'</div>';
  $('main').innerHTML=h;
  for(const f of document.querySelectorAll('figure')) f.onclick=()=>{$('big').querySelector('img').src=f.querySelector('img').src;$('big').querySelector('div').textContent=f.dataset.label;$('big').style.display='flex';};
}
$('big').onclick=()=>{$('big').style.display='none';};
$('m').onchange=show; $('v').onchange=show; show();
</script></body></html>`);
console.log(`→ v2/out/deposits/options/index.html (${secs()})`);
