// The deposits of a few finished moments, rendered after each change to geology/deposits.js (or the history's record),
// for before/after comparisons: each moment's history built as the page builds it (cached in v2/out/frames/), its finish
// at the detail asked for (cached with the deposits' inputs, so a phase that changes only the deposits re-runs only them:
// --reuse-finish), then the page's own painting of the Deposits and Ages views — the whole planet — and the numbers: each
// metal's share of the land, by latitude and by setting (craton, mountain belt, basin). Each view also as a close-up of
// one region per moment (the same region every phase). v2/out/deposits/index.html shows two phases side by side —
// "today" (main's own deposits: --code b9eb7fe) against the newest.
//
//   node --max-old-space-size=16000 v2/tools/render-deposits.mjs --phase base [--note "what changed"] [--reuse-finish]
//        [--code GIT_REF] [--fresh-frames] [--moments 432175:300,2024:900,542650052:2180] [--cells 2500000] [--width 4096]

import fs from 'node:fs';
import path from 'node:path';
import v8 from 'node:v8';
import { fileURLToPath } from 'node:url';
import Delaunator from 'delaunator';
import { PNG } from 'pngjs';
import { setDelaunator } from '../../js/sphere-mesh.js';
import { buildSimMesh } from '../js/core/sim-mesh.js';
import { runHistory } from '../js/app/history-runner.js';
import { TERRAIN_SCENES } from '../js/tectonics/scenarios/terrain-scenes.js';
import { TerrainPool, FRAME_FIELDS } from '../js/terrain/terrain-pool.js';
import { GEO_FRAME_FIELDS, GEOLOGY_READS } from '../js/tectonics/model/geology.js';
import { CrustType, OrogenyType } from '../js/tectonics/model/crust.js';
import { finishPlanet, finishRaster } from '../js/finish/finish.js';
import { LatLonGrid } from '../js/finish/finish-grid.js';
import { paintFinished } from '../js/evolution/finish-view.js';
import { finishedGeologyColor } from '../js/evolution/geology-view.js';
import { heightLutOf } from '../js/evolution/looks.js';
import { depositFields as depositFieldsNow, METALS, DEPOSITS } from '../js/geology/deposits.js';
import { mixColor, depositFieldsAt } from './lib/deposits-mix.mjs';

setDelaunator(Delaunator);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const PHASE = arg('--phase', null), NOTE = arg('--note', '');
if (!PHASE) throw new Error('--phase NAME needed');
const MOMENTS = arg('--moments', '432175:300,2024:900,542650052:2180').split(',').map(s => s.split(':').map(Number));
const CELLS = Number(arg('--cells', 2500000)), SIM = Number(arg('--sim', 40000)), CONT = 30, WIDTH = Number(arg('--width', 4096));
const MESH_SEED = 12345, OUT = path.join(ROOT, 'v2', 'out', 'deposits'), t0 = performance.now(), secs = () => `${((performance.now() - t0) / 1000).toFixed(0)} s`;
const RASTER_W = 4096;
// (the deposits by this code, or by a git version's: today's look, drawn by the same painting)
const CODE = arg('--code', null), depositFields = CODE ? await depositFieldsAt(ROOT, CODE) : depositFieldsNow;
// (each moment's close-up: x, y, w, h in the 4096-wide picture)
const CLOSE = { '2024-900': [1850, 650, 1100, 800], '542650052-2180': [600, 450, 1100, 800], '432175-300': [1500, 500, 1100, 800] };
const lut = heightLutOf('relief');
const writePng = (file, w, h, rgba) => { const p = new PNG({ width: w, height: h }); p.data = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength); fs.writeFileSync(file, PNG.sync.write(p)); };

// the views: [file, label, layer, deposits pick, age, age pick]
const VIEWS = [
    ['mix', 'Copper, gold, lead-zinc, tin and nickel together', 'mix'],
    ['all', 'All metals (each place its richest)', 'geoDeposits', 'all'],
    ['iron', 'Iron', 'geoDeposits', 'm.iron'],
    ['copper', 'Copper', 'geoDeposits', 'm.copper'],
    ['gold', 'Gold', 'geoDeposits', 'm.gold'],
    ['leadZinc', 'Lead and zinc', 'geoDeposits', 'm.leadZinc'],
    ['tin', 'Tin', 'geoDeposits', 'm.tin'],
    ['coal', 'Coal', 'geoDeposits', 'm.coal'],
    ['oilGas', 'Oil and gas', 'geoDeposits', 'm.oilGas'],
    ['building', 'Building stone (Ages)', 'geoAges', 'all', 'building', 'all'],
    ['stoneAge', 'Stone Age (Ages)', 'geoAges', 'all', 'stone', 'all'],
    ['ironAge', 'Iron Age (Ages)', 'geoAges', 'all', 'iron', 'all'],
    ['industrial', 'Industrial Age (Ages)', 'geoAges', 'all', 'industrial', 'all'],
    ['rocks', 'Rocks (unchanged: for reference)', 'geoRocks'],
];

/** The moment's frame — the history as the page builds it (scene 'cycle', ending none), with its geological record; cached. */
async function momentFrame(seed, time, simMesh) {
    const dir = path.join(ROOT, 'v2', 'out', 'frames'), file = path.join(dir, `frame-geo-${seed}-${CONT}-${SIM}-${time}.bin`);
    if (fs.existsSync(file) && !process.argv.includes('--fresh-frames')) return v8.deserialize(fs.readFileSync(file)).frame;
    let frame = null;
    const scene = TERRAIN_SCENES.find(s => s.id === 'cycle'), keys = [...FRAME_FIELDS, ...GEO_FRAME_FIELDS, ...GEOLOGY_READS];
    await runHistory({ list: 'terrain', scene, ending: 'none', start: { continentalFraction: CONT / 100 }, lengthMyr: Math.ceil((time + 10) / 10) * 10, keep: false, collect: false },
        simMesh, seed, 10, () => {}, f => {
            if (Math.abs(f.time - time) < 1e-6) { frame = Object.fromEntries(keys.map(k => [k, f[k]])); frame.plates = f.plates.map(p => p && { quat: p.quat }); }
        });
    if (!frame) throw new Error(`no frame at ${time} Myr`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, v8.serialize({ frame }));
    return frame;
}

/** The numbers: each metal's share of the land at poor or better and at moderate or better — over all the land, by |latitude|
 *  band, and by setting (the record cell's: craton without a belt, a mountain belt, other crust). */
const BANDS = [0, 15, 30, 45, 60, 90];
function numbers(depIn, Dp) {
    const { z, ocean, frame, rec, on: { lat, lon } } = depIn, n = z.length, K = Dp.cells.length, SYS = DEPOSITS.length, [p0, p1] = [0.15, 0.4];
    const slot = new Map();
    for (let j = 0; j < K; j++) slot.set(Dp.cells[j], j);
    const grid = new LatLonGrid(Dp.step), setOf = c => {
        const w = rec[c];
        if (frame.owner[w] < 0) return 'other';
        if (frame.oroType[w] !== OrogenyType.NONE) return 'belt';
        return frame.type[w] === CrustType.CRATON ? 'craton' : 'other';
    };
    const out = {}, land = { all: 0, band: new Float64Array(5), set: { craton: 0, belt: 0, other: 0 } };
    const acc = METALS.map(() => ({ poor: 0, mod: 0, band: new Float64Array(5), set: { craton: 0, belt: 0, other: 0 } }));
    for (let c = 0; c < n; c++) {
        if (ocean[c]) continue;
        const j = slot.get(grid.index(lat[c], lon[c]));
        const b = BANDS.findIndex((v, i) => Math.abs(lat[c]) < BANDS[i + 1]), s = setOf(c);
        land.all++; land.band[b]++; land.set[s]++;
        if (j === undefined) continue;
        METALS.forEach((m, mi) => {
            const v = Dp.data[(SYS + mi) * K + j] / 255;
            if (v < p0) return;
            const a = acc[mi];
            a.poor++; if (v >= p1) a.mod++;
            a.band[b]++; a.set[s]++;
        });
    }
    METALS.forEach((m, mi) => {
        const a = acc[mi], pct = (x, d) => +(100 * x / Math.max(1, d)).toFixed(1);
        out[m.id] = { land: pct(a.poor, land.all), moderate: pct(a.mod, land.all), byLat: Array.from(a.band, (x, i) => pct(x, land.band[i])),
            craton: pct(a.set.craton, land.set.craton), belt: pct(a.set.belt, land.set.belt), other: pct(a.set.other, land.set.other) };
    });
    out._land = { cells: land.all, byLat: Array.from(land.band, x => +(100 * x / land.all).toFixed(1)), craton: +(100 * land.set.craton / land.all).toFixed(1), belt: +(100 * land.set.belt / land.all).toFixed(1) };
    return out;
}

const phaseDir = path.join(OUT, PHASE);
fs.mkdirSync(phaseDir, { recursive: true });
const summary = { phase: PHASE, note: NOTE, at: new Date().toISOString(), moments: {} };
const simMesh = buildSimMesh(SIM, MESH_SEED);
for (const [seed, time] of MOMENTS) {
    const key = `${seed}-${time}`, dir = path.join(phaseDir, key), cacheFile = path.join(OUT, 'cache', `${key}-${CELLS}.bin`);
    fs.mkdirSync(dir, { recursive: true });
    let fin, depIn, frame = await momentFrame(seed, time, simMesh);
    const tA = performance.now();
    if (process.argv.includes('--reuse-finish') && fs.existsSync(cacheFile)) {
        ({ fin, depIn } = v8.deserialize(fs.readFileSync(cacheFile)));
        console.log(`${key}: the finish kept from the last run (${secs()})`);
    } else {
        const pool = await TerrainPool.create(simMesh);
        let held = null;
        const out = await finishPlanet({ frame, simMesh, seed, cells: CELLS, pool, closePool: true, driversWidth: 2048, inspect: (what, o) => { if (what === 'deposits') held = o; } });
        const raster = finishRaster(out.mesh, out.z, out.ocean, RASTER_W, null, out.lake, out.lakeLevel, out.climate.cell, out.geology);
        const climate = { ...out.climate.page, raster: raster.climate };
        delete raster.climate;
        fin = { cells: CELLS, raster, climate, stats: out.stats };
        // (the deposits' inputs, all but the frame and the meshes — small stand-ins for those)
        const { mesh, frame: _f, simMesh: _s, on, ...rest } = held;
        depIn = { ...rest, mesh: { numCells: mesh.numCells, xyz: mesh.xyz, edgeKm: mesh.edgeKm }, on: { gridStep: on.grid.step, lat: on.lat, lon: on.lon } };
        fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
        fs.writeFileSync(cacheFile, v8.serialize({ fin, depIn }));
        console.log(`${key}: finished (${secs()})`);
    }
    // ── the deposits again, by today's code ──
    const tD = performance.now();
    const Dp = depositFields({ ...depIn, frame, simMesh, on: { grid: new LatLonGrid(depIn.on.gridStep), lat: depIn.on.lat, lon: depIn.on.lon } });
    const depMs = performance.now() - tD;
    fin.raster.geology.deposits = Dp;
    const S = { depositsMs: Math.round(depMs), metals: numbers({ ...depIn, frame }, Dp) };
    // ── the whole planet, each view ──
    const H = WIDTH >> 1, image = { data: new Uint8ClampedArray(4 * WIDTH * H) };
    const box = CLOSE[key] ?? [1500, 500, 1100, 800];
    for (const [file, , layer, pick = 'all', age = 'bronze', agePick = 'all'] of VIEWS) {
        const colorAt = layer === 'mix' ? mixColor(Dp, WIDTH) : finishedGeologyColor(layer, WIDTH, fin, pick, age, agePick);
        paintFinished(fin.raster, { width: WIDTH, image }, lut, { lakes: true, exaggeration: 20, colorAt });
        writePng(path.join(dir, `${file}.png`), WIDTH, H, image.data);
        const c = new Uint8ClampedArray(4 * box[2] * box[3]);
        for (let y = 0; y < box[3]; y++) c.set(image.data.subarray(4 * ((box[1] + y) * WIDTH + box[0]), 4 * ((box[1] + y) * WIDTH + box[0] + box[2])), 4 * y * box[2]);
        writePng(path.join(dir, `${file}-close.png`), box[2], box[3], c);
    }
    summary.moments[key] = S;
    console.log(`${key}: deposits ${S.depositsMs} ms, drawn (${secs()})`);
    console.log('  metal       land%  mod%   by |lat| 0-15,15-30,30-45,45-60,60+   craton belt other');
    for (const [id, m] of Object.entries(S.metals)) if (id !== '_land') console.log(`  ${id.padEnd(10)} ${String(m.land).padStart(5)} ${String(m.moderate).padStart(5)}   ${m.byLat.map(v => String(v).padStart(5)).join(' ')}    ${String(m.craton).padStart(5)} ${String(m.belt).padStart(5)} ${String(m.other).padStart(5)}`);
    console.log(`  land: by |lat| ${S.metals._land.byLat.join(' / ')} %; craton ${S.metals._land.craton} %, belt ${S.metals._land.belt} %`);
}
fs.writeFileSync(path.join(phaseDir, 'summary.json'), JSON.stringify(summary, null, 2));

// ── the page: every phase rendered so far, any two side by side ──
const phases = fs.readdirSync(OUT).filter(d => fs.existsSync(path.join(OUT, d, 'summary.json'))).map(d => JSON.parse(fs.readFileSync(path.join(OUT, d, 'summary.json'), 'utf8')));
phases.sort((a, b) => a.at.localeCompare(b.at));
const manifest = { phases: phases.map(p => ({ phase: p.phase, note: p.note, at: p.at, moments: p.moments })), views: VIEWS.map(([f, l]) => [f, l]), metals: METALS.map(m => [m.id, m.name]) };
fs.writeFileSync(path.join(OUT, 'index.html'), page(manifest));
console.log(`→ v2/out/deposits/${PHASE}/ and v2/out/deposits/index.html (${secs()})`);

function page(manifest) {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Deposits: today and new</title>
<style>
:root{--bg:#14161a;--panel:#1d2026;--text:#e6e3dc;--muted:#a5a29a;--accent:#e2a24a}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,sans-serif}
header{padding:12px 16px;background:var(--panel);position:sticky;top:0;z-index:2}
header h1{font-size:17px;margin:0 0 8px}
.ctl{display:flex;flex-wrap:wrap;gap:10px 18px;align-items:center}
label{display:flex;gap:6px;align-items:center;color:var(--muted)}
select{background:#2a2e36;color:var(--text);border:1px solid #3a3f49;border-radius:6px;padding:6px 8px;font:inherit;min-height:34px;max-width:100%}
main{padding:12px 16px 40px}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}
figure{margin:0}
figure h2{font-size:16px;margin:0 0 6px}
figure img{width:100%;height:auto;display:block;border-radius:4px;background:#000}
p.hint{color:var(--muted);margin:10px 0 0;max-width:1100px}
details{margin-top:18px;color:var(--muted)}
details .ctl{margin-top:8px}
table{border-collapse:collapse;margin-top:14px;font-size:13px}
td,th{padding:3px 8px;border-bottom:1px solid #2c3038;text-align:right}
th:first-child,td:first-child{text-align:left}
@media (max-width:760px){.pair{grid-template-columns:1fr}}
</style></head><body>
<header><h1>Deposits — today (left) and new (right)</h1>
<div class="ctl">
<label>World <select id="m"></select></label>
<label>Show <select id="v"></select></label>
<label>Area <select id="z"><option value="close">Close-up of one region</option><option value="global">Whole planet</option></select></label>
</div></header>
<main>
<div class="pair"><figure><h2 id="ca"></h2><img id="ia" alt=""></figure><figure><h2 id="cb"></h2><img id="ib" alt=""></figure></div>
<p class="hint">The same world and region on both sides; only the deposits changed. Colours are metals, faint where poor, solid where moderate, full where rich. Right-click an image and open it in a new tab to see it at full size.</p>
<details><summary>Compare other versions, and the numbers</summary>
<div class="ctl"><label>Left <select id="a"></select></label><label>Right <select id="b"></select></label></div>
<div id="notes"></div></details>
</main>
<script>
const M=${JSON.stringify(manifest)};
const $=id=>document.getElementById(id), opt=(sel,items)=>{sel.innerHTML=items.map(([v,t])=>'<option value="'+v+'">'+t+'</option>').join('')};
const moments=[...new Set(M.phases.flatMap(p=>Object.keys(p.moments)))];
opt($('m'),moments.map(k=>{const [s,t]=k.split('-');return [k,'Seed '+s+', '+t+' million years'];}));
opt($('v'),M.views);
const ph=M.phases.map(p=>[p.phase,p.phase+(p.note?' — '+p.note:'')]);
opt($('a'),ph); opt($('b'),ph);
const today=M.phases.findIndex(p=>p.phase==='base'); $('a').selectedIndex=Math.max(0,today); $('b').selectedIndex=ph.length-1;
const name=p=>p==='base'?'Today':(p===M.phases[M.phases.length-1].phase?'New ('+p+')':p);
const src=p=>p+'/'+$('m').value+'/'+$('v').value+($('z').value==='close'?'-close':'')+'.png';
function show(){$('ia').src=src($('a').value); $('ib').src=src($('b').value); $('ca').textContent=name($('a').value); $('cb').textContent=name($('b').value); notes();}
function notes(){const m=$('m').value, v=$('v').value, id=M.metals.find(([i])=>i===v)?v:null;
  let h='<table><tr><th>Version</th><th>Metal</th><th>Land %</th><th>Moderate+ %</th><th>|lat| 0–15</th><th>15–30</th><th>30–45</th><th>45–60</th><th>60+</th><th>Craton</th><th>Belt</th><th>Other</th></tr>';
  for(const p of M.phases){const s=p.moments[m]; if(!s) continue;
    for(const [mid,nm] of M.metals){ if(id&&mid!==id) continue; const x=s.metals[mid]; if(!x) continue;
      h+='<tr><td>'+name(p.phase)+'</td><td>'+nm+'</td><td>'+x.land+'</td><td>'+x.moderate+'</td>'+x.byLat.map(v=>'<td>'+v+'</td>').join('')+'<td>'+x.craton+'</td><td>'+x.belt+'</td><td>'+x.other+'</td></tr>';}}
  $('notes').innerHTML=h+'</table>';}
for(const id of ['m','v','z','a','b']) $(id).onchange=show;
show();
</script></body></html>`;
}
