// The Satellite view of the same detailed moments after each phase of plans/V2_SATELLITE_LOOK_PLAN.md, Today beside New:
// each moment's history and finish built as the page builds them, once, and cached (v2/out/satellite/frames, cache — the
// colours are drawn on the page, so every phase reuses the finish), then the page's own Satellite painting — the whole planet, regions at the climate picture's own
// width, and close-ups (fine-detail.js windows, as the page's tiles get them) — for the year, January and July; and the
// styled picture's cost. The places are picked once per moment, by their climates and relief, and kept
// (v2/out/satellite/sites-<moment>.json). Then v2/out/satellite/index.html shows Today and New side by side.
//
//   node --max-old-space-size=16000 v2/tools/render-satellite.mjs --phase P1 [--note "what changed"]
//        [--moments 2024:900,432175:300,542650052:2180] [--cells 2500000] [--sim 40000] [--cont 30] [--out v2/out/satellite]
//        [--open-on upland,region,year]   (the area, scale and season the page opens on)
//        [--set SAT_GROUND.cover.on=false,SAT_MOSAIC.lean=1.5,…]   (sat-style.js's settings changed for this render)
//        [--far smooth|point]   (the zoomed-out planet as the globe shows it: with mipmaps — today's globe: point)
//
// The first run, before any change, is --phase today.

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
import { finishedClimateColor } from '../js/evolution/climate-view.js';
import * as SAT from '../js/evolution/sat-style.js';
const { styledSatellite, RAMP_FAMILIES } = SAT;
import { heightLutOf } from '../js/evolution/looks.js';
import { KOPPEN_CLASSES } from '../js/climate/koppen.js';

setDelaunator(Delaunator);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const PHASE = arg('--phase', null), NOTE = arg('--note', ''), OPEN_ON = arg('--open-on', 'upland,region,year').split(','), FAR = arg('--far', 'smooth');
if (!PHASE) throw new Error('--phase NAME needed (the first: today)');
const MOMENTS = arg('--moments', '2024:900,432175:300,542650052:2180').split(',').map(s => s.split(':').map(Number));
const CELLS = Number(arg('--cells', 2500000)), SIM = Number(arg('--sim', 40000)), CONT = Number(arg('--cont', 30)), MESH_SEED = 12345, RASTER_W = 4096;
const OUT = path.resolve(ROOT, arg('--out', 'v2/out/satellite')), t0 = performance.now(), secs = () => `${((performance.now() - t0) / 1000).toFixed(0)} s`;
const SEASONS = ['year', 'jan', 'jul'], GLOBAL_W = 2048, REGION_W = 4096, RW = 640, RH = 400, CW = 512, CH = 320, CLOSE = [6, 8], R = 6371;
const lut = heightLutOf('relief');
// (--set: settings of sat-style.js changed for this render — "SAT_GROUND.cover.strength=0.5,…"; values as JSON)
const SETS = arg('--set', '') ? arg('--set', '').split(',').map(s => { const [k, v] = s.split('='); return [k.split('.'), JSON.parse(v)]; }) : [];
for (const [keys, v] of SETS) {
    let o = SAT[keys[0]];
    if (!o || typeof o !== 'object') throw new Error(`--set: no settings ${keys[0]} in sat-style.js`);
    for (const k of keys.slice(1, -1)) o = o[k];
    if (!(keys[keys.length - 1] in o)) throw new Error(`--set: no ${keys.join('.')}`);
    o[keys[keys.length - 1]] = v;
}

/** The moment's frame — the history as the page builds it (scene 'cycle', ending none), with its geological record; cached. */
async function momentFrame(seed, time) {
    const dir = path.join(OUT, 'frames'), file = path.join(dir, `frame-${seed}-${CONT}-${SIM}-${time}.bin`);
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
/** What a cached finish holds — bumped when the finish's output for the Satellite view changes (2: the climates' soft
 *  shares, their months-above-10 °C line at 3½), so an older one is finished again. */
const FINISH_CACHE = 2;
/** The moment finished as the page's worker finishes it, at CELLS; cached. */
async function momentFinish(seed, time) {
    const file = path.join(OUT, 'cache', `${seed}-${time}-${CELLS}.bin`);
    if (fs.existsSync(file)) { const c = v8.deserialize(fs.readFileSync(file)); if (c.v === FINISH_CACHE && c.fin?.climate?.raster?.families) return c.fin; }
    const frame = await momentFrame(seed, time), simMesh = buildSimMesh(SIM, MESH_SEED), pool = await TerrainPool.create(simMesh);
    const out = await finishPlanet({ frame, simMesh, seed, cells: CELLS, pool, closePool: true, driversWidth: 2048 });
    const raster = finishRaster(out.mesh, out.z, out.ocean, RASTER_W, null, out.lake, out.lakeLevel, out.climate.cell, out.geology);
    const climate = { ...out.climate.page, raster: raster.climate };
    delete raster.climate;
    raster.drivers = out.drivers;
    const fin = { cells: CELLS, raster, rivers: out.rivers, climate, stats: out.stats };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, v8.serialize({ fin, v: FINISH_CACHE }));
    return fin;
}

const writePng = (file, w, h, rgba) => { const p = new PNG({ width: w, height: h }); p.data = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength); fs.writeFileSync(file, PNG.sync.write(p)); };

// ── the places: picked once per moment by their climates and relief, the same for every phase ──
const SITE_KINDS = [
    ['range', 'A snowy mountain range'],
    ['meeting', 'Where several climates meet'],
    ['upland', 'Plateaus, basins and escarpments'],
    ['dry', 'Dry country with relief'],
    ['green', 'Green hills'],
];
const familyOf = KOPPEN_CLASSES.map(k => RAMP_FAMILIES.findIndex(f => f.codes.includes(k.code)));
const FAM = n => RAMP_FAMILIES.findIndex(f => f.name === n);
function pickSites(fin) {
    const C = fin.climate.raster, w = C.w, h = C.h, hm = fin.raster.heightM, f = fin.raster.w / w;
    const bw = Math.round(RW * w / REGION_W), bh = Math.round(RH * w / REGION_W);
    const hKm = i => { const y = (i / w) | 0, x = i % w; return Math.max(0, hm[y * f * fin.raster.w + x * f] / 1000); };
    const sites = [];
    for (const [id, label] of SITE_KINDS) {
        let best = 0, bx = 0, by = 0;
        for (let cy = bh; cy < h - bh; cy += 16) {
            const lat = 90 - (cy + 0.5) * 180 / h;
            if (Math.abs(lat) > 68) continue;
            for (let cx = 0; cx < w; cx += 16) {
                const lon = (cx + 0.5) * 360 / w - 180;
                if (sites.some(s => Math.abs(s.lat - lat) < 14 && Math.abs(((s.lon - lon + 540) % 360) - 180) < 20)) continue;
                let land = 0, n = 0, s1 = 0, s2 = 0, high = 0, mid = 0, dry = 0, green = 0;
                const fams = new Float64Array(RAMP_FAMILIES.length);
                for (let y = cy - (bh >> 1); y < cy + (bh >> 1); y += 4) for (let x = cx - (bw >> 1); x < cx + (bw >> 1); x += 4) {
                    const i = y * w + ((x % w) + w) % w; n++;
                    const k = C.koppen[i]; if (!k) continue;
                    land++;
                    const hk = hKm(i), g = familyOf[k];
                    s1 += hk; s2 += hk * hk;
                    if (hk > 2.8) high++;
                    if (hk > 0.5 && hk < 2.5) mid++;
                    if (g >= 0) fams[g]++;
                    if (g === FAM('desert') || g === FAM('steppe')) dry++;
                    if (g === FAM('temperate') || g === FAM('rainforest') || g === FAM('continental')) green++;
                }
                if (land / n < 0.6) continue;
                const m = s1 / land, sd = Math.sqrt(Math.max(0, s2 / land - m * m));
                let ent = 0; for (const c of fams) if (c > 0) { const p = c / land; ent -= p * Math.log(p); }
                const v = id === 'range' ? high / land * sd
                    : id === 'meeting' ? ent
                    : id === 'upland' ? mid / land * sd * (1 - high / land)
                    : id === 'dry' ? dry / land * sd
                    : green / land * sd;
                if (v > best) { best = v; bx = cx; by = cy; }
            }
        }
        if (best > 0) sites.push({ id, label, lat: +(90 - (by + 0.5) * 180 / h).toFixed(2), lon: +((bx + 0.5) * 360 / w - 180).toFixed(2), score: +best.toFixed(3) });
    }
    return sites;
}

const phaseDir = path.join(OUT, PHASE);
fs.mkdirSync(phaseDir, { recursive: true });
const summary = { phase: PHASE, note: NOTE, far: FAR, set: arg('--set', ''), at: new Date().toISOString(), moments: {} };
for (const [seed, time] of MOMENTS) {
    const key = `${seed}-${time}`, dir = path.join(phaseDir, key);
    fs.mkdirSync(dir, { recursive: true });
    const fin = await momentFinish(seed, time);
    const { raster, climate } = fin, S = { styledMs: {} };
    console.log(`${key}: the finish (${secs()})`);
    // (the styled picture's cost, per season — as the page pays it the first time the view is shown)
    for (const s of SEASONS) { const ta = performance.now(); styledSatellite(climate.raster, s, raster.heightM, raster.w, fin.rivers, raster.water, raster); S.styledMs[s] = Math.round(performance.now() - ta); }
    console.log(`${key}: styled ${JSON.stringify(S.styledMs)} ms (${secs()})`);
    const sitesFile = path.join(OUT, `sites-${key}.json`);
    let sites;
    if (fs.existsSync(sitesFile)) sites = JSON.parse(fs.readFileSync(sitesFile, 'utf8'));
    else { sites = pickSites(fin); fs.writeFileSync(sitesFile, JSON.stringify(sites, null, 2)); }
    for (const s of SEASONS) {
        // ── the whole planet ──
        {
            const H = GLOBAL_W >> 1, image = { data: new Uint8ClampedArray(4 * GLOBAL_W * H) };
            paintFinished(raster, { width: GLOBAL_W, image }, lut, { lakes: true, exaggeration: 25, colorAt: finishedClimateColor('satellite', s, climate, GLOBAL_W, lut, fin) });
            writePng(path.join(dir, `planet-${s}.png`), GLOBAL_W, H, image.data);
        }
        // ── the regions: the planet at the climate picture's own width, cropped ──
        {
            const H = REGION_W >> 1, image = { data: new Uint8ClampedArray(4 * REGION_W * H) };
            paintFinished(raster, { width: REGION_W, image }, lut, { lakes: true, exaggeration: 25, colorAt: finishedClimateColor('satellite', s, climate, REGION_W, lut, fin) });
            const crop = new Uint8ClampedArray(4 * RW * RH);
            for (const site of sites) {
                const x0 = Math.round((site.lon + 180) / 360 * REGION_W - RW / 2), y0 = Math.max(0, Math.min(H - RH, Math.round((90 - site.lat) / 180 * H - RH / 2)));
                for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) {
                    const si = 4 * ((y0 + y) * REGION_W + (((x0 + x) % REGION_W) + REGION_W) % REGION_W), di = 4 * (y * RW + x);
                    crop[di] = image.data[si]; crop[di + 1] = image.data[si + 1]; crop[di + 2] = image.data[si + 2]; crop[di + 3] = 255;
                }
                writePng(path.join(dir, `${site.id}-region-${s}.png`), RW, RH, crop);
            }
            // ── the planet zoomed out, as the globe shows its 4096-wide texture at a quarter of that: --far point (no
            // mipmaps: each pixel bilinear at its centre — the 2 × 2 texels there) or smooth (mipmaps: the mean of all 4 × 4) ──
            const FW = REGION_W >> 2, FH = FW >> 1, far = new Uint8ClampedArray(4 * FW * FH), k = FAR === 'smooth' ? [0, 4] : [1, 3];
            for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
                const o = 4 * (y * FW + x);
                for (let c = 0; c < 3; c++) {
                    let sum = 0, n = 0;
                    for (let dy = k[0]; dy < k[1]; dy++) for (let dx = k[0]; dx < k[1]; dx++) { sum += image.data[4 * ((4 * y + dy) * REGION_W + 4 * x + dx) + c]; n++; }
                    far[o + c] = Math.round(sum / n);
                }
                far[o + 3] = 255;
            }
            writePng(path.join(dir, `planet-far-${s}.png`), FW, FH, far);
        }
    }
    // ── the close-ups (the year and January), as the page's tiles ──
    const src = detailSource(fin, seed);
    for (const site of sites) for (const L of CLOSE) {
        const W = 256 * 2 ** L, HE = W >> 1;
        const x0 = ((Math.round((site.lon + 180) / 360 * W - CW / 2) % W) + W) % W, y0 = Math.max(0, Math.min(HE - CH, Math.round((90 - site.lat) / 180 * HE - CH / 2)));
        const win = { W, x0, y0, w: CW, h: CH }, fw = fineWindow(cropSource(src, win), win), img = new Uint8ClampedArray(4 * CW * CH);
        for (const s of ['year', 'jan']) {
            paintWindow(fw, win, img, lut, { exaggeration: 25, lakes: true, colorAt: finishedClimateColor('satellite', s, climate, W, lut, fin) });
            writePng(path.join(dir, `${site.id}-L${L}-${s}.png`), CW, CH, img);
        }
    }
    summary.moments[key] = S;
    console.log(`${key}: ${sites.length} places drawn (${secs()})`);
}
fs.writeFileSync(path.join(phaseDir, 'summary.json'), JSON.stringify(summary, null, 2));

// ── the page ──
const phases = fs.readdirSync(OUT).filter(d => fs.existsSync(path.join(OUT, d, 'summary.json'))).map(d => JSON.parse(fs.readFileSync(path.join(OUT, d, 'summary.json'), 'utf8')));
phases.sort((a, b) => (a.phase === 'today' ? -1 : b.phase === 'today' ? 1 : a.at.localeCompare(b.at)));
const allSites = Object.fromEntries(MOMENTS.map(([s, t]) => { const f = path.join(OUT, `sites-${s}-${t}.json`); return [`${s}-${t}`, fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : []]; }));
fs.writeFileSync(path.join(OUT, 'index.html'), page({ phases: phases.map(p => ({ phase: p.phase, note: p.note, at: p.at, moments: p.moments })), sites: allSites, close: CLOSE, openOn: OPEN_ON }));
console.log(`→ ${path.relative(ROOT, OUT)}/index.html (${secs()})`);

/** The comparison page (plain, as the owner asked of these: the changed view first, close in, Today and New in words). */
function page(M) {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Satellite look</title>
<style>
:root{--bg:#14161a;--panel:#1d2026;--text:#e6e3dc;--muted:#9a978f;--accent:#e2a24a}
body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 system-ui,sans-serif}
header{padding:12px 16px;background:var(--panel);position:sticky;top:0;z-index:2;display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center}
header h1{font-size:15px;margin:0 8px 0 0}
label{display:flex;gap:6px;align-items:center;color:var(--muted)}
select{background:#2a2e36;color:var(--text);border:1px solid #3a3f49;border-radius:6px;padding:6px 8px;font:inherit;min-height:36px}
main{padding:12px 16px}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:10px}
figure{margin:0}
figure img{width:100%;height:auto;display:block;border-radius:4px;background:#000}
figcaption{color:var(--text);margin:4px 0 0;font-weight:600}
details{margin-top:14px;color:var(--muted)}
summary{cursor:pointer}
.notes{max-width:1100px}
table{border-collapse:collapse;margin-top:10px;font-size:13px}
td,th{padding:3px 10px;border-bottom:1px solid #2c3038;text-align:right}
th:first-child,td:first-child{text-align:left}
@media (max-width:760px){.pair{grid-template-columns:1fr}}
</style></head><body>
<header><h1>Satellite look</h1>
<label>World <select id="m"></select></label>
<label>Area <select id="s"></select></label>
<label>Scale <select id="z"></select></label>
<label>Season <select id="v"><option value="year">The year</option><option value="jan">January</option><option value="jul">July</option></select></label>
</header>
<main><div class="pair"><figure><img id="ia" alt=""><figcaption id="ca"></figcaption></figure><figure><img id="ib" alt=""><figcaption id="cb"></figcaption></figure></div>
<details><summary>Compare other versions, and the cost</summary>
<p><label>Left <select id="a"></select></label></p><p><label>Right <select id="b"></select></label></p>
<div class="notes" id="notes"></div></details></main>
<script>
const M=${JSON.stringify(M)};
const $=id=>document.getElementById(id), opt=(sel,items)=>{sel.innerHTML=items.map(([v,t])=>'<option value="'+v+'">'+t+'</option>').join('')};
const worlds=Object.keys(M.sites);
opt($('m'),worlds.map((k,i)=>[k,'World '+(i+1)]));
const word=p=>p==='today'?'Today':p===M.phases[M.phases.length-1].phase?'New ('+p+')':p;
const ph=M.phases.map(p=>[p.phase,word(p.phase)+(p.note?' — '+p.note:'')]);
opt($('a'),ph); opt($('b'),ph);
$('a').value='today'; $('b').selectedIndex=ph.length-1;
function scales(){const area=$('s').value; opt($('z'),area==='planet'?[['far','Zoomed out (as the globe shows it)'],['planet','Whole planet']]:[['region','Region (~10 km a pixel)'],...M.close.map(l=>['L'+l,'Close up ('+(40075/(256*2**l)).toFixed(1)+' km a pixel)'])]);}
function areas(){opt($('s'),[...M.sites[$('m').value].map(s=>[s.id,s.label]),['planet','Whole planet']]); scales();}
function src(p){const m=$('m').value,z=$('z').value,s=$('s').value,v=$('v').value;
  if(s==='planet') return p+'/'+m+'/planet-'+(z==='far'?'far-':'')+v+'.png';
  if(z==='region') return p+'/'+m+'/'+s+'-region-'+v+'.png';
  return p+'/'+m+'/'+s+'-'+z+'-'+(v==='jul'?'year':v)+'.png';}
function show(){$('ia').src=src($('a').value); $('ib').src=src($('b').value);
  $('ca').textContent=word($('a').value); $('cb').textContent=word($('b').value)+($('z').value.startsWith('L')&&$('v').value==='jul'?' (close-ups: the year)':'');
  let h='<table><tr><th>Version</th><th>What changed</th><th>Styling the picture (ms: year / Jan / Jul)</th></tr>';
  for(const p of M.phases){const s=p.moments[$('m').value]; if(!s) continue; const t=s.styledMs||{};
    h+='<tr><td>'+word(p.phase)+'</td><td style="text-align:left">'+(p.note||'')+'</td><td>'+[t.year,t.jan,t.jul].join(' / ')+'</td></tr>';}
  $('notes').innerHTML=h+'</table>';}
for(const [im,cap] of [['ia','ca'],['ib','cb']]) $(im).onerror=()=>{$(cap).textContent+=' — not drawn for this version';};
for(const id of ['m','s','z','v','a','b']) $(id).onchange=()=>{if(id==='m')areas(); if(id==='s')scales(); show();};
areas(); const [oa,oz,ov]=M.openOn||[]; if(oa&&[...$('s').options].some(o=>o.value===oa)){$('s').value=oa; scales();} if(oz&&[...$('z').options].some(o=>o.value===oz)) $('z').value=oz; if(ov) $('v').value=ov; show();
</script></body></html>`;
}
