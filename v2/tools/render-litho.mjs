// The same detailed moments rendered after each phase of plans/V2_LITHOLOGY_RELIEF_PLAN.md, for before/after comparisons:
// each moment's history built as the page builds it (cached in v2/out/frames/, the geological record with it), the finish
// at the detail asked for, then the page's own painting — the whole planet (Terrain and Satellite views) and the same
// places zoomed in (fine-detail.js fineWindow on a cropped source, as the page's tiles get it; Terrain, Rocks and Satellite
// views) — with what changed in the heights since another phase, and the numbers (land heights, rocks, the tiles' time).
// The places are picked once per moment, by their rocks, and kept (v2/out/litho/sites-<seed>.json). Then
// v2/out/litho/index.html shows any two phases side by side, or blinks between them.
//
//   node --max-old-space-size=16000 v2/tools/render-litho.mjs --phase L1 [--base L0] [--note "what changed"]
//        [--moments 432175:300,2024:900] [--cells 2500000] [--sim 40000] [--cont 30] [--levels 7,8] [--size 512x384]

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
import { finishPlanet, finishRaster } from '../js/finish/finish.js';
import { detailSource, cropSource, fineWindow } from '../js/finish/fine-detail.js';
import { paintFinished, paintWindow } from '../js/evolution/finish-view.js';
import { finishedGeologyColor } from '../js/evolution/geology-view.js';
import { finishedClimateColor } from '../js/evolution/climate-view.js';
import { heightLutOf } from '../js/evolution/looks.js';
import { Rock, ROCK_INFO, ROCK_COUNT } from '../js/geology/rocks.js';

setDelaunator(Delaunator);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const PHASE = arg('--phase', null), BASE = arg('--base', null), NOTE = arg('--note', '');
if (!PHASE) throw new Error('--phase NAME needed');
const MOMENTS = arg('--moments', '432175:300,2024:900').split(',').map(s => s.split(':').map(Number));
const CELLS = Number(arg('--cells', 2500000)), SIM = Number(arg('--sim', 40000)), CONT = Number(arg('--cont', 30));
const LEVELS = arg('--levels', '7,8').split(',').map(Number), [WW, WH] = arg('--size', '512x384').split('x').map(Number);
const MESH_SEED = 12345, OUT = path.join(ROOT, 'v2', 'out', 'litho'), t0 = performance.now(), secs = () => `${((performance.now() - t0) / 1000).toFixed(0)} s`;
const RASTER_W = 4096, GLOBAL_W = 2048, R = 6371;
const lut = heightLutOf('relief');

const writePng = (file, w, h, rgba) => { const p = new PNG({ width: w, height: h }); p.data = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength); fs.writeFileSync(file, PNG.sync.write(p)); };
const writeF32 = (file, a) => fs.writeFileSync(file, Buffer.from(a.buffer, a.byteOffset, a.byteLength));
const readF32 = file => { if (!fs.existsSync(file)) return null; const b = fs.readFileSync(file); return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); };
/** What changed in the heights (km) since the base: lowered blue, raised red, ±scale km full; the new heights' hillshade
 *  in grey beneath (so where it changed reads against the land). */
function diffPng(file, w, h, now, was, scale, pxKm) {
    const img = new Uint8ClampedArray(4 * w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x, d = now[i] - was[i], t = Math.max(-1, Math.min(1, d / scale));
        const ge = (now[y * w + Math.min(w - 1, x + 1)] - now[y * w + Math.max(0, x - 1)]) / (2 * pxKm), gn = (now[Math.max(0, y - 1) * w + x] - now[Math.min(h - 1, y + 1) * w + x]) / (2 * pxKm);
        const sx = -20 * ge, sy = -20 * gn, kk = 0.35 + 0.65 * Math.max(0, (sx * -0.5 + sy * 0.5 + Math.SQRT1_2) / Math.sqrt(sx * sx + sy * sy + 1)) / Math.SQRT1_2;
        const g = 150 * kk, a = Math.abs(t) ** 0.7, c = t > 0 ? [220, 60, 40] : [40, 90, 230];
        img[4 * i] = g + (c[0] - g) * a; img[4 * i + 1] = g + (c[1] - g) * a; img[4 * i + 2] = g + (c[2] - g) * a; img[4 * i + 3] = 255;
    }
    writePng(file, w, h, img);
}

/** The moment's frame — the history as the page builds it (scene 'cycle', ending none), with its geological record; cached. */
async function momentFrame(seed, time) {
    const dir = path.join(ROOT, 'v2', 'out', 'frames'), file = path.join(dir, `frame-geo-${seed}-${CONT}-${SIM}-${time}.bin`);
    if (fs.existsSync(file)) return v8.deserialize(fs.readFileSync(file)).frame;
    let frame = null;
    const scene = TERRAIN_SCENES.find(s => s.id === 'cycle'), keys = [...FRAME_FIELDS, ...GEO_FRAME_FIELDS, ...GEOLOGY_READS];
    await runHistory({ list: 'terrain', scene, ending: 'none', start: { continentalFraction: CONT / 100 }, lengthMyr: Math.ceil((time + 10) / 10) * 10, keep: false, collect: false },
        buildSimMesh(SIM, MESH_SEED), seed, 10, () => {}, f => {
            if (Math.abs(f.time - time) < 1e-6) { frame = Object.fromEntries(keys.map(k => [k, f[k]])); frame.plates = f.plates.map(p => p && { quat: p.quat }); }
        });
    if (!frame) throw new Error(`no frame at ${time} Myr`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, v8.serialize({ frame }));
    return frame;
}

// ── the places: picked once per moment by their rocks and settings, the same for every phase ──
const SITE_KINDS = [
    ['mountains', 'A rugged range (ridges and valleys)'],
    ['shield', 'A shield in warm country'],
    ['granite', 'Granite'],
    ['bedded-dry', 'Bedded sediment in dry country'],
    ['limestone-wet', 'Limestone where it is wet'],
    ['foldbelt', 'An old fold belt'],
    ['glaciated', 'Crystalline rock under the last ice age'],
    ['basalt', 'A flood basalt'],
    ['coast', 'A rocky coast'],
];
function pickSites(fin) {
    const G = fin.raster.geology, C = fin.climate.raster, D = fin.raster.drivers, gw = G.w, gh = G.h, dk = D.w / gw;
    const pxKm = 2 * Math.PI * R / gw, bw = Math.round(WW * 2 * Math.PI * R / (256 * 2 ** LEVELS[0]) / pxKm), bh = Math.round(bw * WH / WW);
    const is = (i, ...k) => k.includes(G.rock[i]);
    const crystal = i => is(i, Rock.GRANITE, Rock.GNEISS, Rock.SHIELD, Rock.GREENSTONE, Rock.SLATE);
    const bedded = i => is(i, Rock.SANDSTONE, Rock.LIMESTONE, Rock.SHALE);
    const drv = (f, i) => { const y = Math.floor(i / gw), x = i % gw; return D[f][Math.min(D.h - 1, Math.floor(y * dk)) * D.w + Math.min(D.w - 1, Math.floor(x * dk))] / 255; };
    const T = i => C.tAnnual[i] / 100, P = i => C.pAnnual[i];
    const score = {
        mountains: i => (G.rock[i] ? drv('rugged', i) : 0),
        shield: i => (is(i, Rock.SHIELD, Rock.GREENSTONE) && T(i) > 12 ? 1 : 0),
        granite: i => (is(i, Rock.GRANITE) ? 1 : 0),
        'bedded-dry': i => (bedded(i) && P(i) < 450 ? 0.4 + drv('rugged', i) : 0),
        'limestone-wet': i => (is(i, Rock.LIMESTONE) && P(i) > 1000 ? 1 : 0),
        foldbelt: i => (G.rock[i] && (bedded(i) || is(i, Rock.SLATE)) ? drv('fold', i) : 0),
        glaciated: i => (crystal(i) ? drv('ice', i) : 0),
        basalt: i => (is(i, Rock.BASALT) ? 1 : 0),
        coast: null,
    };
    const sites = [];
    for (const [id, label] of SITE_KINDS) {
        let best = 0, bx = 0, by = 0;
        for (let cy = bh; cy < gh - bh; cy += 8) {
            const lat = 90 - (cy + 0.5) * 180 / gh;
            if (Math.abs(lat) > 66) continue;
            for (let cx = 0; cx < gw; cx += 8) {
                const lon = (cx + 0.5) * 360 / gw - 180;
                if (sites.some(s => Math.abs(s.lat - lat) < 6 && Math.abs(((s.lon - lon + 540) % 360) - 180) < 8)) continue;
                let s = 0, land = 0, sea = 0, rug = 0;
                const kinds = new Set();
                for (let y = cy - (bh >> 1); y < cy + (bh >> 1); y += 3) for (let x = cx - (bw >> 1); x < cx + (bw >> 1); x += 3) {
                    const i = y * gw + ((x % gw) + gw) % gw;
                    if (!G.rock[i]) { sea++; continue; }
                    land++; kinds.add(G.rock[i]);
                    if (score[id]) s += score[id](i); else rug += drv('rugged', i);
                }
                const n = land + sea;
                // (a coast: land and sea both, the land rugged and of several rocks; else the most of the kind, on a mostly
                // land window)
                const v = !score[id] ? (land && sea ? Math.min(land, sea) / n * (rug / land) * kinds.size : 0) : land / n > 0.55 ? s / n : 0;
                if (v > best) { best = v; bx = cx; by = cy; }
            }
        }
        if (best > 0) sites.push({ id, label, lat: +(90 - (by + 0.5) * 180 / gh).toFixed(2), lon: +((bx + 0.5) * 360 / gw - 180).toFixed(2), score: +best.toFixed(3) });
    }
    return sites;
}

/** The land's numbers: heights, and the rocks' shares. */
function landStats(out) {
    const { z, ocean } = out, land = [];
    for (let c = 0; c < z.length; c++) if (!ocean[c] && z[c] > 0) land.push(z[c]);
    land.sort((a, b) => a - b);
    const q = p => +land[Math.min(land.length - 1, Math.floor(p * land.length))].toFixed(3);
    let below400 = 0;
    for (const v of land) if (v < 0.4) below400++;
    const rocks = out.stats.rocks ? Object.fromEntries(out.stats.rocks.map((v, k) => [ROCK_INFO[k].name, v]).filter(([, v]) => v > 0)) : null;
    return { landBelow400m: +(below400 / land.length).toFixed(4), landP50: q(0.5), landP90: q(0.9), landP99: q(0.99), rocks, water: out.stats.water ? { lakes: out.stats.water.lakes, outletShare: out.stats.water.outletShare } : null };
}

const phaseDir = path.join(OUT, PHASE);
fs.mkdirSync(phaseDir, { recursive: true });
const summary = { phase: PHASE, base: BASE, note: NOTE, at: new Date().toISOString(), moments: {} };
const simMesh = buildSimMesh(SIM, MESH_SEED);
for (const [seed, time] of MOMENTS) {
    const key = `${seed}-${time}`, dir = path.join(phaseDir, key), baseDir = BASE ? path.join(OUT, BASE, key) : null;
    fs.mkdirSync(dir, { recursive: true });
    // (--reuse-finish: the moment finished by the last run, kept — for phases that change only how it is drawn)
    const cacheFile = path.join(OUT, 'cache', `${key}-${CELLS}.bin`);
    let fin, S;
    if (process.argv.includes('--reuse-finish') && fs.existsSync(cacheFile)) {
        ({ fin, S } = v8.deserialize(fs.readFileSync(cacheFile)));
        S.windows = {};
        console.log(`${key}: the finish kept from the last run (${secs()})`);
    } else {
        const frame = await momentFrame(seed, time);
        console.log(`${key}: frame (${secs()})`);
        const pool = await TerrainPool.create(simMesh);
        const out = await finishPlanet({ frame, simMesh, seed, cells: CELLS, pool, closePool: true, driversWidth: 2048 });
        const raster = finishRaster(out.mesh, out.z, out.ocean, RASTER_W, null, out.lake, out.lakeLevel, out.climate.cell, out.geology);
        const climate = { ...out.climate.page, raster: raster.climate };
        delete raster.climate;
        raster.drivers = out.drivers;
        fin = { cells: CELLS, raster, rivers: out.rivers, climate, stats: out.stats };
        S = { ms: Object.fromEntries(Object.entries(out.ms).map(([k, v]) => [k, Math.round(v)])), ...landStats(out), windows: {} };
        fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
        fs.writeFileSync(cacheFile, v8.serialize({ fin, S }));
        console.log(`${key}: finished (${secs()})`);
    }
    const { raster, climate } = fin;
    // ── the whole planet ──
    {
        const H = GLOBAL_W >> 1, image = { data: new Uint8ClampedArray(4 * GLOBAL_W * H) };
        paintFinished(raster, { width: GLOBAL_W, image }, lut, { lakes: true, exaggeration: 20 });
        writePng(path.join(dir, 'global-terrain.png'), GLOBAL_W, H, image.data);
        paintFinished(raster, { width: GLOBAL_W, image }, lut, { lakes: true, exaggeration: 25, colorAt: finishedClimateColor('satellite', 'year', climate, GLOBAL_W, lut, fin) });
        writePng(path.join(dir, 'global-satellite.png'), GLOBAL_W, H, image.data);
        paintFinished(raster, { width: GLOBAL_W, image }, lut, { lakes: true, exaggeration: 20, colorAt: finishedGeologyColor('geoRocks', GLOBAL_W, fin) });
        writePng(path.join(dir, 'global-rocks.png'), GLOBAL_W, H, image.data);
        // (the heights at that width, km: each pixel the mean of the picture's 2 × 2)
        const hk = new Float32Array(GLOBAL_W * H), k = RASTER_W / GLOBAL_W;
        for (let y = 0; y < H; y++) for (let x = 0; x < GLOBAL_W; x++) {
            let s = 0;
            for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) s += raster.heightM[(y * k + dy) * RASTER_W + x * k + dx];
            hk[y * GLOBAL_W + x] = s / (k * k) / 1000;
        }
        writeF32(path.join(dir, 'global-heights.f32'), hk);
        const was = baseDir ? readF32(path.join(baseDir, 'global-heights.f32')) : null;
        if (was) diffPng(path.join(dir, 'global-diff.png'), GLOBAL_W, H, hk, was, 0.3, 2 * Math.PI * R / GLOBAL_W);
    }
    // ── the places, zoomed in ──
    const sitesFile = path.join(OUT, `sites-${key}.json`);
    let sites;
    if (fs.existsSync(sitesFile)) sites = JSON.parse(fs.readFileSync(sitesFile, 'utf8'));
    else { sites = pickSites(fin); fs.writeFileSync(sitesFile, JSON.stringify(sites, null, 2)); }
    const src = detailSource(fin, seed);
    for (const site of sites) for (const L of LEVELS) {
        const W = 256 * 2 ** L, HE = W >> 1, pxKm = 2 * Math.PI * R / W;
        const x0 = ((Math.round((site.lon + 180) / 360 * W - WW / 2) % W) + W) % W, y0 = Math.max(0, Math.min(HE - WH, Math.round((90 - site.lat) / 180 * HE - WH / 2)));
        const win = { W, x0, y0, w: WW, h: WH }, name = `${site.id}-L${L}`;
        const ta = performance.now(), fw = fineWindow(cropSource(src, win), win), ms = performance.now() - ta;
        S.windows[name] = +ms.toFixed(1);
        const img = new Uint8ClampedArray(4 * WW * WH);
        paintWindow(fw, win, img, lut, { exaggeration: 20, lakes: true });
        writePng(path.join(dir, `${name}-terrain.png`), WW, WH, img);
        paintWindow(fw, win, img, lut, { exaggeration: 20, lakes: true, colorAt: finishedGeologyColor('geoRocks', W, fin) });
        writePng(path.join(dir, `${name}-rocks.png`), WW, WH, img);
        paintWindow(fw, win, img, lut, { exaggeration: 25, lakes: true, colorAt: finishedClimateColor('satellite', 'year', climate, W, lut, fin) });
        writePng(path.join(dir, `${name}-satellite.png`), WW, WH, img);
        writeF32(path.join(dir, `${name}-heights.f32`), fw.h);
        const was = baseDir ? readF32(path.join(baseDir, `${name}-heights.f32`)) : null;
        if (was && was.length === fw.h.length) diffPng(path.join(dir, `${name}-diff.png`), WW, WH, fw.h, was, 0.1, pxKm);
    }
    summary.moments[key] = S;
    console.log(`${key}: ${sites.length} places drawn (${secs()}) · land below 400 m ${(100 * S.landBelow400m).toFixed(1)} % · windows ${Object.values(S.windows).reduce((a, b) => a + b, 0).toFixed(0)} ms`);
}
fs.writeFileSync(path.join(phaseDir, 'summary.json'), JSON.stringify(summary, null, 2));

// ── the page: every phase rendered so far, any two side by side ──
const phases = fs.readdirSync(OUT).filter(d => fs.existsSync(path.join(OUT, d, 'summary.json'))).map(d => JSON.parse(fs.readFileSync(path.join(OUT, d, 'summary.json'), 'utf8')));
phases.sort((a, b) => a.at.localeCompare(b.at));
const allSites = Object.fromEntries(MOMENTS.map(([s, t]) => { const f = path.join(OUT, `sites-${s}-${t}.json`); return [`${s}-${t}`, fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : []]; }));
const manifest = { phases: phases.map(p => ({ phase: p.phase, base: p.base, note: p.note, at: p.at, moments: p.moments })), sites: allSites, levels: LEVELS };
fs.writeFileSync(path.join(OUT, 'index.html'), page(manifest));
console.log(`→ v2/out/litho/${PHASE}/ and v2/out/litho/index.html (${secs()})`);

/** The comparison page: pick a moment, a place (or the whole planet), a zoom and a view, and two phases — side by side, or
 *  blinking between them; "Height change" shows what moved since the phase each was rendered against (blue lower, red
 *  higher). */
function page(manifest) {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Lithology phases</title>
<style>
:root{--bg:#14161a;--panel:#1d2026;--text:#e6e3dc;--muted:#9a978f;--accent:#e2a24a}
body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 system-ui,sans-serif}
header{padding:12px 16px;background:var(--panel);position:sticky;top:0;z-index:2;display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center}
header h1{font-size:15px;margin:0 8px 0 0}
label{display:flex;gap:6px;align-items:center;color:var(--muted)}
select,button{background:#2a2e36;color:var(--text);border:1px solid #3a3f49;border-radius:6px;padding:6px 8px;font:inherit;min-height:32px}
button.on{border-color:var(--accent);color:var(--accent)}
main{padding:12px 16px}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.pair.blink,.pair.one{grid-template-columns:1fr}
figure{margin:0}
figure img{width:100%;height:auto;display:block;image-rendering:auto;border-radius:4px;background:#000}
figcaption{color:var(--muted);margin:4px 0 0}
.notes{margin:14px 0 0;color:var(--muted);max-width:1100px}
.notes b{color:var(--text)}
table{border-collapse:collapse;margin-top:10px;font-size:13px}
td,th{padding:3px 10px;border-bottom:1px solid #2c3038;text-align:right}
th:first-child,td:first-child{text-align:left}
@media (max-width:760px){.pair{grid-template-columns:1fr}}
</style></head><body>
<header><h1>Rocks shape the land — phases</h1>
<label>Moment <select id="m"></select></label>
<label>Place <select id="s"></select></label>
<label>Zoom <select id="z"></select></label>
<label>View <select id="v"><option value="terrain">Terrain</option><option value="rocks">Rocks</option><option value="satellite">Satellite</option><option value="diff">Height change</option></select></label>
<label>A <select id="a"></select></label>
<label>B <select id="b"></select></label>
<button id="blink">Blink</button>
</header>
<main><div class="pair" id="pair"><figure><img id="ia" alt=""><figcaption id="ca"></figcaption></figure><figure><img id="ib" alt=""><figcaption id="cb"></figcaption></figure></div>
<div class="notes" id="notes"></div></main>
<script>
const M=${JSON.stringify(manifest)};
const $=id=>document.getElementById(id), opt=(sel,items)=>{sel.innerHTML=items.map(([v,t])=>'<option value="'+v+'">'+t+'</option>').join('')};
const moments=Object.keys(M.sites);
opt($('m'),moments.map(k=>[k,'seed '+k.replace('-',' at ')+' Myr']));
opt($('z'),[['global','Whole planet'],...M.levels.map(l=>['L'+l,'L'+l+' ('+(40075/(256*2**l)).toFixed(2)+' km/px)'])]);
const ph=M.phases.map(p=>[p.phase,p.phase+(p.note?' — '+p.note:'')]);
opt($('a'),ph); opt($('b'),ph);
$('a').selectedIndex=Math.max(0,ph.length-2); $('b').selectedIndex=ph.length-1;
function sites(){opt($('s'),[['','—'],...M.sites[$('m').value].map(s=>[s.id,s.label+' ('+s.lat+'°, '+s.lon+'°)'])]);}
function src(p){const m=$('m').value,z=$('z').value,v=$('v').value,s=$('s').value;
  if(z==='global'||!s) return p+'/'+m+'/global-'+(v==='diff'?'diff':v)+'.png';
  return p+'/'+m+'/'+s+'-'+z+'-'+v+'.png';}
let blink=null,flip=false;
function show(){const a=$('a').value,b=$('b').value;
  $('ia').src=src(a); $('ib').src=src(b);
  const pa=M.phases.find(p=>p.phase===a), pb=M.phases.find(p=>p.phase===b);
  $('ca').textContent=a+($('v').value==='diff'&&pa.base?' (vs '+pa.base+')':''); $('cb').textContent=b+($('v').value==='diff'&&pb.base?' (vs '+pb.base+')':'');
  $('pair').className='pair'+(blink?' blink':'');
  $('ib').parentElement.style.display=blink?'none':'';
  notes();}
function notes(){const m=$('m').value;
  let h='<table><tr><th>Phase</th><th>What changed</th><th>Land below 400 m</th><th>Median land</th><th>Windows (ms)</th></tr>';
  for(const p of M.phases){const s=p.moments[m]; if(!s) continue;
    const w=Object.values(s.windows||{}).reduce((a,b)=>a+b,0);
    h+='<tr><td>'+p.phase+'</td><td style="text-align:left">'+(p.note||'')+'</td><td>'+(100*s.landBelow400m).toFixed(1)+' %</td><td>'+Math.round(1000*s.landP50)+' m</td><td>'+w.toFixed(0)+'</td></tr>';}
  $('notes').innerHTML=h+'</table>';}
$('blink').onclick=()=>{if(blink){clearInterval(blink);blink=null;$('blink').classList.remove('on');show();return;}
  $('blink').classList.add('on');show();blink=setInterval(()=>{flip=!flip;$('ia').src=src(flip?$('b').value:$('a').value);$('ca').textContent=flip?$('b').value:$('a').value;},800);};
for(const id of ['m','z','v','a','b','s']) $(id).onchange=()=>{if(id==='m')sites();show();};
sites(); show();
</script></body></html>`;
}
