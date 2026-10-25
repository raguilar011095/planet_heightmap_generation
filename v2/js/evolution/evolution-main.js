// Evolution — World Orogen's tectonic-history generator, a side page beside Generate and Import Heightmap
// (plans/V2_FULL_PLANET_PLAN.md). Build New World runs the history in a worker and shows the planet AS IT BUILDS (each
// frame drawn as it arrives, rivers and all); then the whole history is a timeline to scrub and play. Three settings
// (starting continent size, history length, where it should end) and two resolutions (plates, terrain) — "way way fewer
// settings" than the lab (developer). The drawing is the lab's: a shaded equirectangular texture on a globe (fast to
// change every frame), inside V1's page layout, sidebar and bottom sheet.

import Delaunator from 'delaunator';
import { setDelaunator } from '../../../js/sphere-mesh.js';
import { buildSimMesh, meshFromArrays } from '../core/sim-mesh.js';
import { terrainMeshAsync } from '../terrain/terrain-mesh.js';
import { terrainConfig } from '../terrain/terrain-config.js';
import { SmoothMapRaster } from '../view/map-raster.js';
import { GpuPainter } from '../view/gpu-paint.js';
import { locate } from '../core/mesh-locate.js';
import { paintRelief } from '../view/terrain-shade.js';
import { colorByPlate } from '../view/palettes.js';
import { GlobeView } from '../app/globe-view.js';
import { drawGraticule } from '../app/overlays.js';
import { runHistory } from '../app/history-runner.js';
import { TERRAIN_SCENES } from '../tectonics/scenarios/terrain-scenes.js';
import { ENDINGS } from '../tectonics/ending.js';
import { TerrainPlayer } from './terrain-player.js';
import { paintPalette, heightLutOf, PALETTES, CRUST_WORDS, settingOf } from './looks.js';
import { ClimateService, CLIMATE_LAYERS, SEASONAL_LAYERS, FINISHED_ONLY_LAYERS, ARROW_LAYERS, paintClimate, paintUnavailable, drawArrows, drawItcz, drawLegend, readoutLines, finishedClimateColor, finishedClimateLines } from './climate-view.js';
import { FinishService, paintFinished, riverPaths, drawRivers, riverAt, finishedAt, REGIME_STYLE, riverYearWords } from './finish-view.js';
import { GEOLOGY_LAYERS, finishedGeologyColor, geologyLegendHTML, geologyLines, rockAt, rockLine, recAt, hasRecord } from './geology-view.js';
import { GEO_FRAME_FIELDS } from '../tectonics/model/geology.js';
import { FARMING_LAYERS, finishedFarmingColor, farmingLegendHTML, farmingLines, farmChipClicked, farmPickChanged, farmOptions, farmOptionsKey, farmingPins } from './farming-view.js';
import { FRAME_FIELDS } from '../terrain/terrain-pool.js';
import { STAGES as FINISH_STAGES } from '../finish/finish.js';
import { initEvolutionExport } from './export.js';
import { initViewStrip, initProjectionPicker } from '../../../js/view-strip.js';
import { downloadBlob } from '../view/png.js';
import { savePlanet, planetBytes, openPlanet } from '../save/planet-file.js';
import { PackedFrame } from '../tectonics/frame-pack.js';
import { SMALL_DEVICE } from '../core/device.js';
import { seedOf, randomSeed, isWordSeed } from '../core/seed.js';
import { fileName } from '../view/export-raster.js';

setDelaunator(Delaunator);

const MESH_SEED = 12345;               // the sim mesh is the same for every planet (as the lab's); the seed shapes the world on it
const SNAPSHOT_MYR = 10;
const IS_TOUCH = matchMedia('(pointer: coarse)').matches;
const MAP_WIDTH = IS_TOUCH ? 1024 : 2048;
const SHARP_WIDTH = IS_TOUCH ? 0 : 4096;  // the sharper texture, when paused (desktop; developer: "Sharper when paused")
const SHARP_AFTER_MS = 300;               // (a scrub draws the lighter texture; the sharper one once it has settled)
// painted on the GPU (view/gpu-paint.js), where it can be: always this sharp — it costs a millisecond or two — and twice
// as sharp on a phone as the CPU's (?gpu=0: the CPU's painting, as before, for comparison)
const GPU_WIDTH = IS_TOUCH ? 2048 : 4096;
const SHADING = { exaggeration: 20, seaLevelKm: 0 };
// terrain workers: on a phone a few (each holds its own copy of the meshes: memory), elsewhere one per core but one
const WORKERS = Number(new URLSearchParams(location.search).get('workers')) || (IS_TOUCH ? 3 : null);
const SCENE = TERRAIN_SCENES.find(s => s.id === 'cycle');      // the start world, every rule on — its length and ending set here

const $ = id => document.getElementById(id);
const ui = { canvas: $('canvas'), map: $('mapCanvas'), cont: $('sCont'), len: $('sLen'), ending: $('ending'), sim: $('simCells'), terrain: $('terrainCells'),
    seed: $('seedCode'), build: $('generate'), status: $('buildStatus'), timeline: $('timeline'), play: $('playBtn'), time: $('timeSlider'),
    timeLabel: $('timeLabel'), rate: $('rate'), extend: $('extendBtn'), hover: $('hoverInfo'), panel: $('ui'), stats: $('stats'), info: $('info'),
    railBuilt: $('railBuilt'), railShown: $('railShown'), ticks: $('timeTicks'), quality: $('quality'), world: $('worldSection'), tmp: $('sTmp'), prc: $('sPrc') };

// ── settings ──
ui.ending.innerHTML = ENDINGS.map(e => `<option value="${e.id}">${e.label}</option>`).join('');
const url = new URLSearchParams(location.search);
const setIf = (el, v) => { if (v !== null && [...(el.options ?? [])].some(o => o.value === v)) el.value = v; };
if (url.get('cont')) ui.cont.value = url.get('cont');
if (url.get('len')) ui.len.value = url.get('len');
// (Greenhouse, W/m²; an older link's temp= was the same slider in °C steps of 1)
if (url.get('greenhouse')) ui.tmp.value = url.get('greenhouse'); else if (url.get('temp')) ui.tmp.value = 2 * Number(url.get('temp'));
if (url.get('rain')) ui.prc.value = url.get('rain');
// (the Farming legend's Re-roll: which likely history of its hearths and crops — 0, not in the link, the likeliest)
const linkedCrops = Number(url.get('crops'));
if (Number.isInteger(linkedCrops) && linkedCrops > 0) farmOptions.roll = linkedCrops;
// The planet's Temperature and Precipitation (as Generate's): the climate's options, for the preview climate and for Add
// detail — they change the climate only, not the history (plans/V1_NEW_CLIMATE_PLAN.md, phase 7)
const climateOptions = () => ({ greenhouseWm2: Number(ui.tmp.value), precipScale: Math.max(0, 1 + 0.5 * Number(ui.prc.value)) });
const climateKey = () => `${Number(ui.tmp.value)}|${Number(ui.prc.value)}`;
// (a phone builds on 20K plates by default: a 1200 Myr history takes ~40 s on a desktop at 20K, ~85 s at 40K, and a phone's
// cores are several times slower — plans/V2_FULL_PLANET_PLAN.md, step A)
if (IS_TOUCH) ui.sim.value = '20000';
setIf(ui.ending, url.get('end')); setIf(ui.sim, url.get('sim')); setIf(ui.terrain, url.get('terrain'));
ui.seed.value = url.get('seed') ?? String(randomSeed());
// (the seed as typed: a word as it is, a number as the world reads it — core/seed.js)
const seedShown = () => (isWordSeed(ui.seed.value) ? ui.seed.value.trim() : String(seedOf(ui.seed.value)));
// Quality: the two resolutions in one choice (plans/V2_EVOLUTION_UI_PLAN.md) — Custom shows them; a link whose pair is a
// preset shows the preset
const QUALITY = { fast: { sim: '20000', terrain: '160000' }, balanced: { sim: '40000', terrain: '160000' }, best: { sim: '80000', terrain: '640000' } };
const QUALITY_WORDS = { fast: 'Fast', balanced: 'Balanced', best: 'Best', custom: 'Custom' };
ui.quality.value = Object.keys(QUALITY).find(k => QUALITY[k].sim === ui.sim.value && QUALITY[k].terrain === ui.terrain.value) ?? 'custom';
$('customGroup').hidden = ui.quality.value !== 'custom';
ui.quality.addEventListener('change', () => {
    const q = QUALITY[ui.quality.value];
    $('customGroup').hidden = !!q;
    if (q) {
        ui.sim.value = q.sim;
        if (ui.terrain.value !== q.terrain) { ui.terrain.value = q.terrain; setTerrainDetail(); }
    }
    labels(); saveUrl();
});
ui.sim.addEventListener('change', () => { labels(); saveUrl(); });
/** The World section's values, and its one-line summary (shown while it is folded). */
function labels() {
    $('vCont').textContent = `${ui.cont.value}%`; $('vLen').textContent = `${ui.len.value} Myr`;
    const t = Number(ui.tmp.value), p = Math.round(50 * Number(ui.prc.value));
    $('vTmp').textContent = t ? `${t > 0 ? '+' : '−'}${Math.abs(t)} W/m²` : '±0 W/m²';
    $('vPrc').textContent = p ? `${p > 0 ? '+' : '−'}${Math.abs(p)}%` : '±0%';
    $('worldSummary').textContent = `Seed ${seedShown()} · ${ui.len.value} Myr · ${QUALITY_WORDS[ui.quality.value]}` +
        (t ? ` · temperature ${$('vTmp').textContent}` : '') + (p ? ` · ${$('vPrc').textContent} rain` : '');
    // (the plates' resolution is the one setting a history cannot change: it waits for a build)
    $('worldPending').hidden = !B?.simCells || B.simCells === Number(ui.sim.value);
}
for (const el of [ui.cont, ui.len, ui.seed, ui.tmp, ui.prc]) el.addEventListener('input', labels);
// (a new Temperature or Precipitation: the previews' climates are worked out again when shown; a detailed moment keeps
// its old climate — its rivers, ice and Satellite were sculpted by it — until detail is added again)
for (const el of [ui.tmp, ui.prc]) el.addEventListener('change', () => { saveUrl(); labels(); dirty = true; updateClimateUi(); });
// ── tooltips (the "?" marks): drawn over the page — V1's own sit inside the panel, which scrolls and so clips what spills
// out of it (developer: "the tooltips are hidden inside the sidebar if they appear towards the right"); to the right of
// the mark where there is room, else above it (always above on a narrow screen: the bottom sheet); a tap shows one ──
const tipEl = document.createElement('div');
tipEl.className = 'evo-tooltip'; tipEl.hidden = true;
document.body.appendChild(tipEl);
let tipFor = null;
function showTip(el) {
    tipFor = el; tipEl.textContent = el.dataset.tip; tipEl.hidden = false;
    const r = el.getBoundingClientRect(), w = tipEl.offsetWidth, h = tipEl.offsetHeight, m = 8;
    let x = r.right + m, y = r.top + r.height / 2 - h / 2;
    if (innerWidth <= 768 || x + w > innerWidth - m) {
        x = Math.max(m, Math.min(innerWidth - w - m, r.left + r.width / 2 - w / 2));
        y = r.top - h - m;
        if (y < m) y = r.bottom + m;
    }
    tipEl.style.left = `${x}px`; tipEl.style.top = `${Math.max(m, Math.min(innerHeight - h - m, y))}px`;
}
function hideTip() { tipFor = null; tipEl.hidden = true; }
document.addEventListener('pointerover', e => { const t = e.target.closest?.('.tip[data-tip]'); if (t && e.pointerType === 'mouse') showTip(t); });
document.addEventListener('pointerout', e => { if (tipFor && e.pointerType === 'mouse' && !tipFor.contains(e.relatedTarget)) hideTip(); });
document.addEventListener('click', e => {
    const t = e.target.closest?.('.tip[data-tip]');
    if (t) { e.preventDefault(); showTip(t); }                  // (a "?" inside a toggle's label does not flip it)
    else if (tipFor) hideTip();
}, true);
$('sidebarContent').addEventListener('scroll', hideTip, { passive: true });
ui.build.addEventListener('click', () => { ui.seed.value = String(randomSeed()); farmOptions.roll = 0; build(); });   // (New World: a new seed, its likeliest crops)
$('rebuildBtn').addEventListener('click', () => build());                                                         // (Settings: this seed, these settings)
// Load Planet…: a planet file saved from the Export panel (a phone's picker may not know .orogen: there it shows every file)
if (IS_TOUCH) $('loadFile').removeAttribute('accept');
$('loadBtn').addEventListener('click', () => $('loadFile').click());
$('loadFile').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) loadPlanet(f); });
// …or dropped anywhere on the page (not while the export panel or the tutorial is open over it)
{
    let depth = 0;
    const files = e => [...(e.dataTransfer?.types ?? [])].includes('Files'), covered = () => !$('exportOverlay').classList.contains('hidden') || !$('tutorialOverlay').classList.contains('hidden');
    const drop = on => { $('dropOverlay').hidden = !on; };
    addEventListener('dragenter', e => { if (!files(e) || covered()) return; e.preventDefault(); depth++; drop(true); });
    addEventListener('dragover', e => { if (!files(e) || covered()) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    addEventListener('dragleave', e => { if (files(e) && --depth <= 0) { depth = 0; drop(false); } });
    addEventListener('drop', e => {
        if (!files(e)) return;
        e.preventDefault(); depth = 0; drop(false);
        const f = e.dataTransfer.files[0];
        if (f && !covered()) loadPlanet(f);
    });
}
// (terrain detail only redraws the terrain: the history is the same at any terrain resolution)
ui.terrain.addEventListener('change', () => setTerrainDetail());
// (more: how far the history was kept going — a link rebuilds the same history, run on as far)
const saveUrl = () => history.replaceState(null, '', `?seed=${encodeURIComponent(seedShown())}&cont=${ui.cont.value}&len=${ui.len.value}&end=${ui.ending.value}&sim=${ui.sim.value}&terrain=${ui.terrain.value}` +
    (Number(ui.tmp.value) ? `&greenhouse=${ui.tmp.value}` : '') + (Number(ui.prc.value) ? `&rain=${ui.prc.value}` : '') + (B?.moreTo ? `&more=${B.moreTo}` : '') + (farmOptions.roll ? `&crops=${farmOptions.roll}` : ''));
let linkedMore = Number(url.get('more')) || 0;          // (the first build only: a new world starts at its length)
// Keep going: the history runs on in pieces this long, until stopped (a multiple of the step grid and of the snapshot
// interval — pieces of the one history, the same as a single run: tectonics/simulate.js, resume)
const GO_PIECE_MYR = 20;
// …and stops for good when the history holds this much (a frame, packed, is ~28–31 bytes a plate cell with its geological
// record, 13 % of it: ~0.11 GB per 1000 Myr at 40K) — some 12,000 Myr at 40K on a desktop, 6,500 Myr at 20K on a phone
const HISTORY_BYTES = IS_TOUCH ? 400e6 : 1.5e9, FRAME_BYTES_PER_CELL = 31;
ui.seed.addEventListener('keydown', e => { if (e.key === 'Enter') build(); });

// ── drawing ──
// The planet is painted on an equirectangular texture — the globe's, and the map's (drawn flat by the globe's renderer,
// turned to the centre longitude, under the #mapCanvas frame). The history's moments are painted on the GPU where it
// can (GPU_WIDTH); the detailed moments, and every moment without WebGL 2, on canvases — two of them on a desktop: the
// one painted while playing, and a sharper one painted when paused.
function texture(width) {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = width >> 1;
    const ctx = canvas.getContext('2d');
    return { canvas, ctx, image: ctx.createImageData(width, width >> 1), width };
}
const tex = { lo: texture(MAP_WIDTH), sharp: null };
// (V1's space around the globe — stars, atmosphere, its light, the sun glinting off the sea: developer: "I do like the
// starry background and the sunlight/reflection of V1")
const globe = new GlobeView(ui.canvas, tex.lo.canvas, { space: true });
globe.setSmooth(true);
globe.controls.autoRotateSpeed = 0.6;
const gpu = url.get('gpu') !== '0' && GpuPainter.available(globe.renderer) ? new GpuPainter(globe.renderer, GPU_WIDTH, MAP_WIDTH) : null;
console.info(`[evolution] painting ${gpu ? `on the GPU at ${GPU_WIDTH} px` : 'on the CPU'}`);
const seaMask = texture(MAP_WIDTH);     // where the sea is, for the glint (the lighter resolution is enough for a glint)
let glinting = false, glintFrom = null;
let lines = null, linesKey = null;      // the GPU's overlay: the grid and a climate layer's arrows, drawn again only when they change
const PALETTE_KEY = 'orogen.evolution.palette', EXPERIMENTAL_KEY = 'orogen.evolution.experimental';
const storedPalette = (() => { try { return localStorage.getItem(PALETTE_KEY); } catch { return null; } })();
const storedExperimental = (() => { try { return localStorage.getItem(EXPERIMENTAL_KEY) === '1'; } catch { return false; } })();
const view = { layer: 'terrain', palette: PALETTES[storedPalette] ? storedPalette : 'relief', mode: 'globe', grid: true, gridStep: 15, centerLon: 0, projection: 'equirect', projOpts: {}, season: 'year', finished: true,
    water: true, riverQ: 40, byRegime: false,                        // (rivers and lakes on finished moments: the density's threshold, m³/s; coloured by regime)
    shaded: true,                                                    // (the hillshade; off, every view flat colour)
    experimental: storedExperimental };                              // (views still being worked out, shown: the Farming tab's Cradles)
let flat = null;
/** Every cell lit as flat ground (hillshade 1): the live views' colours without the relief's shading. */
const flatShade = n => (flat?.length === n ? flat : (flat = new Float32Array(n).fill(1)));
const climate = new ClimateService();   // the climate, on request, for the moment shown (climate-view.js)
const finisher = new FinishService();   // the Finish step, on request, for the moment shown (finish-view.js)
// (one detailed moment per history — its pictures, rivers and climate: ~50 MB on a phone, ~190 MB at 2.5M on a desktop,
// ~320 MB at 10M; the one before is kept until the next is done, so a cancel loses nothing: at most two at once)
/** The bytes of the typed arrays in a finished moment (each buffer once). */
function bytesOf(x, seen = new Set(), depth = 0) {
    if (!x || typeof x !== 'object' || depth > 4) return 0;
    if (ArrayBuffer.isView(x)) { if (seen.has(x.buffer)) return 0; seen.add(x.buffer); return x.buffer.byteLength; }
    let s = 0;
    for (const v of Array.isArray(x) ? x : Object.values(x)) s += bytesOf(v, seen, depth + 1);
    return s;
}
const finishBytes = f => (f.bytes ??= bytesOf({ raster: f.raster, rivers: f.rivers, climate: f.climate }));
// (phones finish up to 640K: the finer ones need more memory than a phone's tab has)
if (IS_TOUCH) for (const o of [...$('finishCells').options]) if (Number(o.value) > 640000) o.remove();
if (IS_TOUCH) $('finishCells').value = '640000';
/** Colour heights with the palette chosen (the lab's relief, or one of looks.js's). */
const tint = (heightKm, shade, out) => (view.palette === 'relief' ? paintRelief(heightKm, shade, out, { seaLevelKm: SHADING.seaLevelKm }) : paintPalette(view.palette, heightKm, shade, out, SHADING.seaLevelKm));
let raster = null;                      // the terrain mesh's pixel table (only the one in use: tens of MB at the finest detail)
const rasterOf = mesh => (raster?.mesh === mesh ? raster : (raster = { mesh, table: new SmoothMapRaster(mesh, MAP_WIDTH) })).table;
// the sharper pixel table: built a few rows at a time the first time the view is paused (~1 s, 117 MB), one mesh at a time
let sharp = null;
function sharpTableOf(mesh) {
    if (!SHARP_WIDTH) return null;
    if (sharp?.mesh !== mesh) {
        sharp?.controller.abort();
        const job = sharp = { mesh, table: null, controller: new AbortController() };
        SmoothMapRaster.build(mesh, SHARP_WIDTH, { signal: job.controller.signal })
            .then(t => { if (sharp === job) { job.table = t; dirty = true; } }).catch(() => {});
    }
    return sharp.table;
}
let lastScrub = 0;
const simMeshes = new Map();
const simMeshOf = n => { if (!simMeshes.has(n)) simMeshes.set(n, buildSimMesh(n, MESH_SEED)); return simMeshes.get(n); };

// ── one build: the history streaming in, its terrain, the timeline ──
let B = null;                           // { controller, player, frames, simMesh, tMesh, raster, live, started, endMyr, error }
let playing = false, playTime = 0, lastTick = 0, preparing = null, painted = null, paintedT = null, paintedMesh = null, paintedSharp = false, dirty = true, cellRgb = null, simRgb = null;

/** A history's state, as build() starts one and loadPlanet() opens one (`o`: what differs). */
function newWorld(o) {
    return { controller: new AbortController(), player: null, frames: [], simMesh: null, tMesh: null, raster: null, live: true, started: performance.now(), error: null, doneText: null,
        climates: new Map(), climateJob: null, problem: null,         // (climates: frame → {tMesh, data}, while this history is open)
        run: null, going: false, wantGo: false, moreTo: 0,                 // (keep going: the history's run, kept to run on)
        finishes: new Map(), finishJob: null, finishNote: null, ...o };   // (finishes: frame → {cells, raster, secs} — the one detailed moment)
}
/** The world shown goes (its history's worker, its detail under way, its terrain's): another takes its place. */
function leaveWorld() {
    $('loadNote').hidden = true;
    if (B?.finishJob) finisher.cancel();
    B?.controller.abort();
    B?.player?.dispose();
}
/** The view emptied for a world that is starting (`len` Myr long, played as it builds) or opening. */
function clearView(len, { play, label }) {
    saveUrl(); labels();
    ui.world.open = false;                                                            // (the World section folds to its summary)
    playing = play; playTime = 0; preparing = null; painted = null; paintedT = null; paintedMesh = null; paintedSharp = false; dirty = true;
    updateClimateUi();
    setScale(len); ui.time.value = 0; rail();
    blank();                                                                          // (the old world goes at once: a new one is starting)
    ui.timeLabel.textContent = label;
    ui.play.innerHTML = play ? '&#x23F8;' : '&#x25B6;';
    ui.timeline.hidden = false;
    updateCard();
}

async function build() {
    leaveWorld();
    const seed = seedOf(ui.seed.value), cont = Number(ui.cont.value) / 100, len = Number(ui.len.value), ending = ui.ending.value;
    const simCells = Number(ui.sim.value), terrainCells = Number(ui.terrain.value);
    const b = B = newWorld({ simCells, endMyr: len, lengthMyr: len, moreTo: linkedMore, seedText: isWordSeed(ui.seed.value) ? ui.seed.value.trim() : null,
        contPct: Number(ui.cont.value), ending });                       // (the settings it was built with, for its planet file)
    linkedMore = 0;
    // (watching it build is playing it from the start, at the speed chosen — held at the newest moment built)
    clearView(len, { play: true, label: 'Starting…' });
    status(`Starting a world (seed ${seedShown()})…`, 0);
    if (IS_TOUCH) ui.panel.classList.add('collapsed');
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));            // (let the status paint first)
    if (B !== b) return;
    try {
        b.simMesh = simMeshOf(simCells);
        const meshReady = terrainMeshAsync(terrainCells);
        const run = runHistory({ list: 'terrain', scene: SCENE, ending, start: { continentalFraction: cont }, lengthMyr: len, keep: true }, b.simMesh, seed, SNAPSHOT_MYR,
            t => { if (B === b) progress(b, t); },
            frame => { if (B !== b) return; if (!b.frames.length) console.info(`[evolution] first frame simulated at ${((performance.now() - b.started) / 1000).toFixed(1)} s`); b.frames.push(frame); b.player?.addFrame(frame); if (frame.time > Number(ui.time.max)) setScale(frame.time); rail(); },
            b.controller.signal);
        b.tMesh = await meshReady;
        if (B !== b) return;
        b.seed = seed;
        useTerrain(b, b.tMesh, terrainCells);
        if (Number(ui.terrain.value) !== terrainCells) setTerrainDetail();          // (changed while the world was starting)
        simRgb = new Uint8Array(b.simMesh.numCells * 3);
        const done = await run;
        if (B !== b) return;
        b.run = done; b.simMyr = done.time; b.steps = done.steps; b.stopped = done.stopped;
        b.live = false; b.endMyr = b.frames.at(-1).time;
        setScale(b.endMyr); rail();
        b.player.finish();
        const secs = (performance.now() - b.started) / 1000, stop = ENDINGS.find(e => e.id === ending);
        console.info(`[evolution] history: ${(done.ms / 1000).toFixed(1)} s in the worker, of which packing frames ${(done.packMs / 1000).toFixed(1)} s`);
        b.doneText = `${b.endMyr.toFixed(0)} Myr of history in ${secs.toFixed(0)} s · ${done.steps} steps` + (ending === 'none' ? '' : done.stopped ? ` — ends as ${stop.phrase}` : ` — did not reach ${stop.phrase} in time`);
        if (!b.retexturing) status(b.doneText, 1);
        dirty = true;
        updateCard();
        if (b.moreTo > b.simMyr) keepGoing(b, b.moreTo);                  // (a link to a history that was kept going)
        else b.moreTo = 0;
    } catch (err) {
        if (err.name === 'AbortError' || B !== b) return;
        b.error = err;
        b.problem = `Could not build this world: ${String(err.message).split('\n')[0]}. Try a lower Quality, or reload the page.`;
        status(`Could not build this world: ${err.message}`, null);
        updateCard();
        console.error(err);
    }
}

/**
 * Keep going: the finished history runs on, a piece at a time, in the worker that ran it (it kept its world), until
 * stopped — or, from a link, until `until` Myr. The pieces make one history: the same as had it been run that long.
 */
async function keepGoing(b, until = Infinity) {
    if (B !== b || !b.run?.more || b.going) return;
    b.going = true; b.wantGo = true; b.live = true;
    b.goFrom ??= b.simMyr; b.goUntil = until; b.goStarted = performance.now();      // (from: where the history first ended)
    updateCard();
    if (until === Infinity) { playTime = builtTo(); ui.time.value = playTime; setPlaying(true); dirty = true; }   // (watch it go on)
    progress(b, b.simMyr);
    let failed = null;
    try {
        while (b.wantGo && B === b && b.simMyr < until - 1e-9) {
            if (b.frames.length * FRAME_BYTES_PER_CELL * b.simMesh.numCells >= HISTORY_BYTES) { b.full = true; break; }
            const to = Math.min(until, b.simMyr + GO_PIECE_MYR);
            if (to > Number(ui.time.max)) { setScale(to); rail(); }
            const r = await b.run.more(to);
            if (B !== b) return;
            b.simMyr = r.time; b.steps = r.steps; b.moreTo = r.time;
            saveUrl();
        }
    } catch (err) {
        if (err.name === 'AbortError' || B !== b) return;
        failed = err; b.run = null;                                             // (its worker is gone)
        console.error(err);
    }
    if (B !== b) return;
    b.going = false; b.wantGo = false; b.live = false; b.endMyr = builtTo();
    setScale(b.endMyr); rail();
    b.player?.finish();
    b.goSecs = (b.goSecs ?? 0) + (performance.now() - b.goStarted) / 1000;
    if (b.full) { b.run.close(); b.run = null; }                             // (its world goes too)
    b.doneText = failed ? `Could not extend the history: ${String(failed.message).split('\n')[0]} — ${b.endMyr.toFixed(0)} Myr of history`
        : `${b.endMyr.toFixed(0)} Myr of history · ${b.steps} steps — extended from ${b.goFrom.toFixed(0)} Myr (${b.goSecs.toFixed(0)} s)` +
            (b.full ? ' — as long a history as this device can hold' : '');
    if (!b.retexturing) status(b.doneText, failed ? null : 1);
    if (failed) { b.problem = `Could not extend the history: ${String(failed.message).split('\n')[0]}`; updateCard(); }
    updateCard(); dirty = true;
}

// ── Extend history, on a history opened from a file: the simulation that made it is not in the file, so it is run again
// here from its seed — out of sight, each moment checked against the file's to the bit — and, where every one matches
// (this browser's arithmetic, this version's rules), it runs on from where the file ended. Where one differs (another
// browser, or an earlier World Orogen, built it), the history stays as it is, to view, and says so ──
/** The bytes of two typed arrays (or both absent) the same. */
function sameBytes(a, b) {
    if (!a || !b) return !a && !b;
    if (a.byteLength !== b.byteLength) return false;
    const x = new Uint8Array(a.buffer, a.byteOffset, a.byteLength), y = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
    return true;
}
/** Two frames (PackedFrames) the same: every field as packed, to the bit, and every property. */
function sameFrame(a, b) {
    const pa = a._packed, pb = b._packed, ka = Object.keys(pa), ma = Object.keys(a);
    if (ka.length !== Object.keys(pb).length || ma.length !== Object.keys(b).length) return false;
    for (const k of ka) {
        const x = pa[k], y = pb[k];
        if (!y || x.type !== y.type || x.length !== y.length || !Object.is(x.bg, y.bg) || x.first !== y.first) return false;
        if (!sameBytes(x.bits, y.bits) || !sameBytes(x.values, y.values) || !sameBytes(x.steps, y.steps) || !sameBytes(x.far, y.far)) return false;
    }
    return ma.every(k => JSON.stringify(a[k]) === JSON.stringify(b[k]));
}
async function replayHistory(b) {
    if (B !== b || b.run || b.replay) return;
    const ctl = new AbortController(), job = b.replay = { ctl, share: 0, started: performance.now() };
    b.controller.signal.addEventListener('abort', () => ctl.abort(), { once: true });          // (the world closed: the replay goes too)
    updateCard();
    let differs = null;
    const total = b.simMyr, onTime = t => {
        if (B !== b) return;
        if (b.replay !== job) { progress(b, t); return; }                                       // (run on: extending)
        job.share = Math.min(1, t / total);
        status(`Running the history again here, so that it can be extended… ${t.toFixed(0)} of ${total.toFixed(0)} Myr · ${((performance.now() - job.started) / 1000).toFixed(0)} s`, job.share);
        updateCard();
    };
    const onFrame = (frame, i) => {
        if (B !== b) return;
        if (i < b.frames.length) { if (!differs && !sameFrame(frame, b.frames[i])) { differs = b.frames[i]; ctl.abort(); } return; }
        // (past the file's end: the history running on — as build()'s)
        b.frames.push(frame); b.player?.addFrame(frame); if (frame.time > Number(ui.time.max)) setScale(frame.time); rail();
    };
    let run = null;
    try {
        run = await runHistory({ list: 'terrain', scene: SCENE, ending: b.ending, start: { continentalFraction: b.contPct / 100 }, lengthMyr: b.lengthMyr, keep: true, collect: false },
            b.simMesh, b.seed, SNAPSHOT_MYR, onTime, onFrame, ctl.signal);
        // (a history kept going before it was saved: run on as far, in the same pieces)
        let { time, steps } = run;
        while (time < b.simMyr - 1e-9 && !differs) ({ time, steps } = await run.more(Math.min(b.simMyr, time + GO_PIECE_MYR)));
        if (differs || steps !== b.steps || Math.abs(time - b.simMyr) > 1e-6) { differs ??= b.frames.at(-1); throw new Error('the history came out otherwise'); }
        if (B !== b) { run.close(); return; }
        console.info(`[evolution] history run again to ${time.toFixed(0)} Myr in ${((performance.now() - job.started) / 1000).toFixed(1)} s: every moment the same as the file's`);
        b.replay = null; b.run = run; b.stopped = run.stopped;
        keepGoing(b);
    } catch (err) {
        run?.close();
        if (B !== b) return;
        b.replay = null;
        if (differs) {
            b.noReplay = true;
            b.doneText = `Run again in this browser, this history comes out otherwise from ${differs.time.toFixed(0)} Myr — another browser, or an earlier World Orogen, built it — so it is here to view, not to extend. Build This World builds it again here, to extend it.`;
            console.info(`[evolution] history run again: it differs from the file's at ${differs.time.toFixed(0)} Myr`);
        } else if (err.name !== 'AbortError') { b.doneText = `Could not run the history again: ${String(err.message).split('\n')[0]}`; console.error(err); }
        status(b.doneText, differs ? null : 1);
        updateCard();
    }
}

/** Draw a build's frames on a terrain mesh: a player of its own (the frames so far handed over; the rest arrive as they come). */
function useTerrain(b, tMesh, cells) {
    const old = b.player;
    b.tMesh = tMesh; b.terrainCells = cells;             // (the setting: a mesh has about that many cells)
    if (gpu) gpu.setMesh(tMesh); else b.raster = rasterOf(tMesh);       // (the GPU's triangles, or the CPU's pixel table)
    b.player = new TerrainPlayer({ simMesh: b.simMesh, tMesh, cfg: terrainConfig(), seed: b.seed, shading: SHADING, workers: WORKERS, onBuilt: () => { dirty = true; } });
    for (const f of b.frames) b.player.addFrame(f);
    old?.dispose();
    cellRgb = new Uint8Array(tMesh.numCells * 3);
    preparing = null; dirty = true;
}

/** Terrain Detail changed: the same history, its terrain built again at the new resolution (the old one shown until then). */
async function setTerrainDetail() {
    saveUrl();
    const b = B, cells = Number(ui.terrain.value);
    if (!b?.player || b.error) return;                          // (no world yet, or still starting: build() reads the setting)
    if (b.terrainCells === cells) {                              // (back to the detail shown: nothing to build)
        if (b.retexturing) { b.retexturing = null; if (b.doneText) status(b.doneText, 1); }
        return;
    }
    b.retexturing = cells; b.retextureAt = performance.now();
    status(`Building the terrain at ${ui.terrain.selectedOptions[0].textContent.split(' ·')[0]}…`, null);
    try {
        const tMesh = await terrainMeshAsync(cells);
        if (B !== b || b.retexturing !== cells) return;
        useTerrain(b, tMesh, cells);
    } catch (err) {
        if (B === b) {
            b.retexturing = null;
            b.problem = `Could not build the terrain at this detail: ${String(err.message).split('\n')[0]}. Try a lower Terrain Detail.`;
            status(`Could not build the terrain: ${err.message}`, null);
            updateCard();
        }
        console.error(err);
    }
}

// ── a planet file opened (plans/V2_SAVE_LOAD_PLAN.md): its history and its detailed moment as they were saved — the
// plates exactly so, in any browser — their terrain, previews and pictures drawn again here, with today's code. The
// history is to view, not to extend: the simulation that made it is not in the file (Build This World builds it again) ──
const mb = n => (n / 2 ** 20).toFixed(0);
// (a phone holds a detailed moment of its own size — ~60 MB at 2048 px — not a desktop's 4096 or 8192 px ones)
const DETAIL_BYTES = IS_TOUCH ? 150e6 : Infinity;
async function loadPlanet(file) {
    const name = file.name || 'the planet file';
    const refuse = why => { const text = `Could not open ${name}: ${why}`; status(text, null); $('loadNote').textContent = text; $('loadNote').hidden = false; };
    let planet;
    try { planet = await openPlanet(file); } catch (err) { refuse(String(err.message).split('\n')[0]); console.error(err); return; }
    const m = planet.manifest, s = m.settings;
    if (planet.historyBytes > HISTORY_BYTES) { refuse(`its history (${mb(planet.historyBytes)} MB) is longer than this device can hold — open it on a desktop`); return; }
    const withDetail = planet.detailBytes > 0 && planet.detailBytes <= DETAIL_BYTES;
    // (the terrain drawn while scrubbing: as it was, but at most a phone's finest)
    const terrainCells = IS_TOUCH ? Math.min(640000, s.terrain) : s.terrain;
    leaveWorld();
    const b = B = newWorld({ simCells: s.sim, endMyr: m.history.toMyr, lengthMyr: s.len, live: false, loading: true, opened: name,
        seed: s.seed, seedText: s.seedText ?? null, contPct: s.cont, ending: s.ending, moreTo: s.more || 0, simMyr: m.history.simMyr, steps: m.history.steps, stopped: m.history.stopped });
    // its settings, and the link to them (the same history again, built here)
    ui.seed.value = s.seedText ?? String(s.seed); ui.cont.value = s.cont; ui.len.value = s.len; setIf(ui.ending, s.ending); setIf(ui.sim, String(s.sim));
    setIf(ui.terrain, String(terrainCells)); ui.tmp.value = s.greenhouse; ui.prc.value = s.rain;
    farmOptions.roll = Number.isInteger(s.crops) && s.crops > 0 ? s.crops : 0;         // (its crops as re-rolled when saved; else the likeliest)
    ui.quality.value = Object.keys(QUALITY).find(k => QUALITY[k].sim === ui.sim.value && QUALITY[k].terrain === ui.terrain.value) ?? 'custom';
    $('customGroup').hidden = ui.quality.value !== 'custom';
    clearView(m.history.toMyr, { play: false, label: 'Opening…' });
    status(`Opening ${name}…`, 0);
    if (IS_TOUCH) ui.panel.classList.add('collapsed');
    try {
        const { mesh, frames, detail, detailNote } = await planet.read({ detail: withDetail, onProgress: (share, text) => { if (B === b) status(text, share); } });
        if (B !== b) return;
        // (a file saved without the mesh's neighbours: the same mesh's, found again here)
        const near = mesh.adjOffset ? mesh : simMeshOf(mesh.numCells);
        b.simMesh = meshFromArrays({ numCells: mesh.numCells, xyz: mesh.xyz, adjOffset: near.adjOffset, adjList: near.adjList });
        b.frames = frames.map(f => new PackedFrame(f));
        const shown = b.frames[m.detail?.frame ?? 0] ?? b.frames[0];
        if (detail) { b.finishes.set(b.frames[detail.frame], detail.moment); b.finishOk = true; b.finishNote = `Opened from ${name}`; }
        // (a moment left in the file — too old to read, or more than a phone can show: this moment, ready to be detailed again)
        else if (m.detail) {
            b.loadFrame = shown;
            b.loadNote = detailNote ? `${detailNote} — add detail to see it again.` : `${name} holds this moment in detail, but at ${mb(planet.detailBytes)} MB it is more than a phone can show — add detail to see it at this device’s size.`;
        }
        status(`Building the terrain at ${ui.terrain.selectedOptions[0]?.textContent.split(' ·')[0] ?? terrainCells}…`, null);
        const tMesh = await terrainMeshAsync(terrainCells);
        if (B !== b) return;
        b.loading = false;
        useTerrain(b, tMesh, terrainCells);
        simRgb = new Uint8Array(b.simMesh.numCells * 3);
        setScale(b.endMyr);
        playTime = shown.time; ui.time.value = playTime; rail();
        b.player.finish();
        view.finished = true;
        const secs = (performance.now() - b.started) / 1000;
        b.doneText = `Opened ${name} in ${secs.toFixed(0)} s — ${b.endMyr.toFixed(0)} Myr of history · ${b.steps} steps` + (detail ? `, detailed at ${shown.time.toFixed(0)} Myr` : '');
        console.info(`[evolution] opened ${name}: ${b.frames.length} frames, ${mb(planet.historyBytes)} MB of history + ${detail ? mb(planet.detailBytes) : 0} MB of detail in ${secs.toFixed(1)} s`);
        status(b.doneText, 1);
        saveUrl(); labels(); updateCard(); dirty = true;
    } catch (err) {
        if (B !== b) return;
        b.loading = false; b.error = err;
        b.problem = `Could not open ${name}: ${String(err.message).split('\n')[0]}`;
        status(b.problem, null);
        updateCard();
        console.error(err);
    }
}

/** A plain sea, while a new world starts. */
function blank() {
    const px = new Uint8Array(3), t = tex.lo;
    tint(new Float32Array([-4]), new Float32Array([0.8]), px);
    glint(false);
    t.ctx.fillStyle = `rgb(${px[0]},${px[1]},${px[2]})`;
    t.ctx.fillRect(0, 0, t.width, t.width >> 1);
    show(t);
}

/** The glint on (the sea mask painted with each frame: the canvas's, or the GPU's) or off — off, too, with the hillshade. */
function glint(on, from = seaMask.canvas) {
    const want = on && view.shaded ? from : null;
    if (want === glintFrom) return;
    glintFrom = want; glinting = !!want;
    globe.setSeaMask(want);
}

/** Put a painted texture (a canvas's, or the GPU's) on the globe and the map. */
function show(t) {
    globe.setSource(t.isTexture ? t : t.canvas);
    globe.textureChanged();
}

/** The map view (or the globe): the texture flat, turned so that the centre longitude is in the middle. */
const showMap = () => globe.setMap(view.mode === 'map' ? ui.map : null, view.centerLon, view.projection, view.projOpts);

function progress(b, t) {
    if (b.retexturing) return;
    if (b.going) {
        const secs = (performance.now() - b.goStarted) / 1000, linked = b.goUntil !== Infinity;
        status(linked ? `Running on to ${b.goUntil} Myr, as in the link… ${t.toFixed(0)} Myr · ${secs.toFixed(0)} s` : `Extending the history… ${t.toFixed(0)} Myr · ${secs.toFixed(0)} s (from ${b.goFrom.toFixed(0)} Myr)`,
            linked ? Math.min(1, (t - b.goFrom) / Math.max(1, b.goUntil - b.goFrom)) : null);
        return;
    }
    const target = b.lengthMyr, secs = (performance.now() - b.started) / 1000;
    status(t <= target ? `Simulating the history… ${t.toFixed(0)} of ${target} Myr · ${secs.toFixed(0)} s` : `Running on until it ends as asked… ${t.toFixed(0)} Myr · ${secs.toFixed(0)} s`, Math.min(1, t / target));
}
function status(text, share) {
    ui.status.hidden = false;
    ui.status.innerHTML = `${text}${share === null ? '' : `<div class="bar"><i style="width:${(100 * share).toFixed(1)}%"></i></div>`}`;
}

// ── the timeline's scale: the whole history from the start (not only what is built), what is built so far, the moment shown ──
/** The scale runs to `max` Myr (the history's length — or further, when it runs on to reach its ending), with a few labels. */
function setScale(max) {
    ui.time.max = max;
    const step = [100, 200, 250, 300, 500, 1000, 2000, 2500, 5000].find(s => max / s <= 6) ?? 10000, marks = [];
    for (let t = 0; t < max - step * 0.6; t += step) marks.push(t);
    marks.push(max);
    ui.ticks.innerHTML = marks.map(t => `<span style="left:${(100 * t / max).toFixed(2)}%">${t}</span>`).join('');
}
/** The rail: built so far (faint), up to the moment shown (bright). */
function rail() {
    const max = Number(ui.time.max) || 1, built = B?.frames.length ? B.frames.at(-1).time : 0, shown = painted ? painted.time : Number(ui.time.value);
    ui.railBuilt.style.width = `${(100 * Math.min(1, built / max)).toFixed(2)}%`;
    ui.railShown.style.width = `${(100 * Math.min(1, shown / max)).toFixed(2)}%`;
}
/** Latest time the history has reached (a scrub may not go past it while it is still building). */
const builtTo = () => (B?.frames.length ? B.frames.at(-1).time : 0);

/** The recorded frame nearest to time t. */
function frameAt(t) {
    const f = B.frames;
    let lo = 0, hi = f.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (f[mid].time < t) lo = mid + 1; else hi = mid; }
    return lo > 0 && Math.abs(f[lo - 1].time - t) <= Math.abs(f[lo].time - t) ? f[lo - 1] : f[lo];
}

function paint(frame, sharpTable = null, sharp = !!sharpTable) {
    const T = B.player.terrainOf(frame), out = cellRgb;
    // (a finished moment: its picture instead of the live terrain, on the height layers — and its own climate, at its
    // detail, on the climate layers)
    const fin = finishedShown(frame);
    if (fin) { paintFinishedFrame(frame, fin, T, sharp); return; }
    const shade = view.shaded ? T.shade : flatShade(B.tMesh.numCells);
    // (the terrain and the heightmap are coloured per pixel from the heights — their coasts crisp; the other layers per cell)
    let byHeight = null;
    if (view.layer === 'plates') {
        // the plates, carried from the sim cells onto the terrain and shaded by it
        colorByPlate(frame, simRgb);
        const { cells: sc, weights: sw } = T.sampler;
        for (let t = 0; t < B.tMesh.numCells; t++) {
            const k = 0.45 + 0.55 * shade[t];
            for (let ch = 0; ch < 3; ch++) out[3 * t + ch] = Math.min(255, k * (sw[3 * t] * simRgb[3 * sc[3 * t] + ch] + sw[3 * t + 1] * simRgb[3 * sc[3 * t + 1] + ch] + sw[3 * t + 2] * simRgb[3 * sc[3 * t + 2] + ch]));
        }
    } else if (view.layer === 'heightmap') byHeight = heightLutOf('heightmap');
    else if (CLIMATE_LAYERS.has(view.layer)) {
        // the climate of this moment, if it has been calculated; else the terrain greyed (and the chip offers it)
        const C = FINISHED_ONLY_LAYERS.has(view.layer) ? null : climateOf(frame);
        if (C) paintClimate(view.layer, view.season, C, { heightKm: T.heightKm, shade }, B.tMesh, out, o => tint(T.heightKm, shade, o));
        else { tint(T.heightKm, shade, out); paintUnavailable(out, B.tMesh.numCells); }
    } else if (GEOLOGY_LAYERS.has(view.layer) || FARMING_LAYERS.has(view.layer)) { tint(T.heightKm, shade, out); paintUnavailable(out, B.tMesh.numCells); }   // (comes with detail)
    else byHeight = heightLutOf(view.palette);
    const C = CLIMATE_LAYERS.has(view.layer) && !FINISHED_ONLY_LAYERS.has(view.layer) ? climateOf(frame) : null;
    // the sun glints off the sea on the Terrain view (V1's water shows there only)
    if (gpu) {
        // (on the GPU: the cells' heights or colours sent, the picture drawn there — its sea and its lines with it)
        glint(view.layer === 'terrain', gpu.seaTexture);
        gpu.setMesh(B.tMesh);
        layLines(C);
        if (byHeight) gpu.drawHeights(T.heightKm, shade, byHeight, SHADING.seaLevelKm, glinting);
        else gpu.drawCells(out, T.heightKm, SHADING.seaLevelKm, glinting);
        show(gpu.texture);
    } else {
        glint(view.layer === 'terrain');
        if (glinting) {
            B.raster.paintSea(T.heightKm, seaMask.image.data, SHADING.seaLevelKm);
            seaMask.ctx.putImageData(seaMask.image, 0, 0);
            globe.seaMaskChanged();
        }
        const table = sharpTable ?? B.raster, t = sharpTable ? (tex.sharp ??= texture(SHARP_WIDTH)) : tex.lo;
        if (byHeight) table.paintHeights(T.heightKm, shade, byHeight, t.image.data, SHADING.seaLevelKm);
        else table.paint(out, t.image.data);
        t.ctx.putImageData(t.image, 0, 0);
        drawLines(t, C);
        show(t);
    }
    if (!B.firstDrawn) { B.firstDrawn = true; console.info(`[evolution] first frame drawn at ${((performance.now() - B.started) / 1000).toFixed(1)} s`); }
    painted = frame; paintedT = T; paintedMesh = B.tMesh; paintedSharp = sharp;
    const legend = $('climateLegend'), legendKey = C ? `${view.layer}|${view.season}|${frame.time}|${B.terrainCells}` : '';
    if (legend.dataset.key !== legendKey) {
        if (C) { drawLegend(legend, view.layer, view.season, C, T); legend.insertAdjacentHTML('afterbegin', '<div class="evo-legend-head">Preview climate — Add detail for this moment’s own</div>'); }
        else legend.innerHTML = '';
        legend.dataset.key = legendKey;
    }
    updateClimateUi();
    if (B.retexturing && B.retexturing === B.terrainCells) {
        console.info(`[evolution] terrain at ${B.retexturing} cells drawn in ${((performance.now() - B.retextureAt) / 1000).toFixed(1)} s`);
        B.retexturing = null; if (B.doneText) status(B.doneText, 1);
    }
    ui.timeLabel.textContent = `${frame.time.toFixed(0)} Myr`;
    rail();
    stats(T, frame);
}

/** The lines over a picture (on texture t, as thick on the sharper texture as on the other): a climate layer's, then the grid. */
function drawLines(t, C) {
    if (C) climateOverlays(t, C);
    if (view.grid) { const k = t.width / MAP_WIDTH; t.ctx.save(); t.ctx.scale(k, k); drawGraticule(t.ctx, MAP_WIDTH, MAP_WIDTH >> 1, view.gridStep); t.ctx.restore(); }
}

/** The GPU's overlay for the picture painted next: the lines drawn on a transparent canvas — again only when they change (a
 *  4096-pixel canvas is 32 MB to send) — or none. */
function layLines(C) {
    const arrows = C && (ARROW_LAYERS[view.layer] || view.layer === 'pressure') ? C : null;
    if (!view.grid && !arrows) { gpu.setOverlay(null); return; }
    const key = [view.grid && view.gridStep, arrows, arrows && view.layer, arrows && view.season];
    const changed = !linesKey || key.some((v, i) => v !== linesKey[i]);
    if (changed) {
        if (!lines) { const canvas = document.createElement('canvas'); canvas.width = GPU_WIDTH; canvas.height = GPU_WIDTH >> 1; lines = { canvas, ctx: canvas.getContext('2d'), width: GPU_WIDTH }; }
        lines.ctx.clearRect(0, 0, GPU_WIDTH, GPU_WIDTH >> 1);
        drawLines(lines, arrows);
        linesKey = key;
    }
    gpu.setOverlay(lines.canvas, changed);
}

/** A climate layer's lines over its colours (on texture t): the winds' or the currents' arrows, and the ITCZ. */
function climateOverlays(t, C) {
    if (!ARROW_LAYERS[view.layer] && view.layer !== 'pressure') return;
    const k = t.width / MAP_WIDTH;
    t.ctx.save(); t.ctx.scale(k, k);
    if (view.layer === 'pressure') drawItcz(t.ctx, MAP_WIDTH, view.season, C);
    if (ARROW_LAYERS[view.layer]) drawArrows(t.ctx, MAP_WIDTH, view.layer, view.season, C);
    t.ctx.restore();
}

/** The legend's key for a finished moment's view (a legend made for another is made again). */
const finishedLegendKey = (frame, fin, farm) => `finished|${view.layer}|${view.season}|${frame.time}|${fin.cells}${farm ? `|${farmOptionsKey()}` : ''}`;

/** The finished moment shown for a frame on the layer shown, if any: on the height layers, and on the climate layers
 *  (a finish brings the moment's own climate) — or null. */
function finishedShown(frame) {
    if (!view.finished || !B || !(view.layer === 'terrain' || view.layer === 'heightmap' || CLIMATE_LAYERS.has(view.layer) || GEOLOGY_LAYERS.has(view.layer) || FARMING_LAYERS.has(view.layer))) return null;
    const fin = B.finishes.get(frame);
    return fin && (!CLIMATE_LAYERS.has(view.layer) || fin.climate) && (!FINISHED_ONLY_LAYERS.has(view.layer) || fin.climate?.raster?.sat) ? fin : null;
}

/** A finished moment: its picture, coloured and shaded as the live terrain is — or its climate, per pixel. */
function paintFinishedFrame(frame, fin, T, sharp) {
    const t = sharp ? (tex.sharp ??= texture(SHARP_WIDTH)) : tex.lo;
    const lut = heightLutOf(view.layer === 'heightmap' ? 'heightmap' : view.palette), water = view.water && (view.layer === 'terrain' || view.layer === 'satellite');
    const C = CLIMATE_LAYERS.has(view.layer) ? fin.climate : null, geo = GEOLOGY_LAYERS.has(view.layer), farm = FARMING_LAYERS.has(view.layer);
    glint(view.layer === 'terrain' || view.layer === 'satellite');
    // (the satellite view shows the lakes always — they are its ground — the rivers with Rivers & Lakes; the geology and
    // farming views their lakes too, as water)
    paintFinished(fin.raster, t, lut, { seaImage: glinting ? seaMask.image.data : null, seaWidth: MAP_WIDTH, exaggeration: SHADING.exaggeration * (view.layer === 'satellite' ? 1.25 : 1), lakes: water || view.layer === 'satellite' || geo || farm,
        shaded: view.shaded, colorAt: geo ? finishedGeologyColor(view.layer, frame, B.simMesh, t.width, fin) : farm ? finishedFarmingColor(view.layer, fin, t.width) : C ? finishedClimateColor(view.layer, view.season, C, t.width, lut, fin) : null });
    if (glinting) { seaMask.ctx.putImageData(seaMask.image, 0, 0); globe.seaMaskChanged(); }
    t.ctx.putImageData(t.image, 0, 0);
    // (the rivers, on the Terrain view: drawn at a 2048-wide texture's scale — as thick on the sharper one)
    // (the rivers' lines on the Terrain view — and on Farmland, the water its canals and floods come from; from space they
    // are ground, not lines — the Satellite view draws none)
    if (view.water && (view.layer === 'terrain' || view.layer === 'farmLand' || view.layer === 'farmCradle') && fin.rivers) { const k = t.width / MAP_WIDTH * (MAP_WIDTH / 2048); t.ctx.save(); t.ctx.scale(k, k); drawRivers(t.ctx, riverPaths(fin, view.riverQ), view.byRegime && view.layer === 'terrain'); t.ctx.restore(); }
    // (the Cradles view's sites and the Crop spread view's hearths: numbered pins over the planet — placePins)
    drawLines(t, C);
    show(t);
    painted = frame; paintedT = T; paintedMesh = B.tMesh; paintedSharp = sharp;
    const legend = $('climateLegend'), legendKey = C || geo || farm ? finishedLegendKey(frame, fin, farm) : '';
    if (legend.dataset.key !== legendKey) {
        if (geo) legend.innerHTML = geologyLegendHTML(view.layer, frame, fin);
        else if (farm) legend.innerHTML = farmingLegendHTML(view.layer, fin);
        else if (C) drawLegend(legend, view.layer, view.season, C, null);
        else legend.innerHTML = '';
        legend.dataset.key = legendKey;
    }
    updateClimateUi();
    ui.timeLabel.textContent = `${frame.time.toFixed(0)} Myr`;
    rail();
    stats(T, frame);
}

// ── the Finish step: on request, for the moment shown — kept per moment while the history is open ──
const CANCEL_GRACE_MS = 600;
async function finishMoment(again = null) {
    const b = B, frame = again ?? painted;
    if (!b?.simMesh || !frame) return;
    // (the button cancels a finish under way — but not in its first moments: it turns into Cancel where Add detail was,
    // so a double click would otherwise start a finish and stop it at once)
    if (b.finishJob) { if (performance.now() - b.finishJob.startedAt >= CANCEL_GRACE_MS) finisher.cancel(); return; }
    setPlaying(false);
    const cells = Number($('finishCells').value), width = IS_TOUCH ? 2048 : cells >= 5e6 ? 8192 : 4096;
    const started = performance.now(), done = new Map(FINISH_STAGES);
    b.finishNote = null; b.finishOk = false;
    b.finishJob = { frame, cells, stage: 'starting', share: 0, startedAt: performance.now() };
    updateClimateUi();
    // (the terrain's fields, and the geological record for the rocks: geology/rocks.js)
    // (the rock record with it — unless the history was saved before it was kept: a planet file's older frames read it
    // as zeros, no record, so the moment is detailed without its rocks — geology-view.js hasRecord)
    const slim = Object.fromEntries([...FRAME_FIELDS, ...(hasRecord(frame) ? GEO_FRAME_FIELDS : [])].map(k => [k, frame[k]]));
    slim.plates = frame.plates.map(p => p && { quat: p.quat });
    // (progress: the stages' shares so far, and the picture's own)
    let before = 0;
    const onStage = s => { if (!b.finishJob) return; before = 0; for (const [k, v] of FINISH_STAGES) { if (k === s) break; before += v; } b.finishJob.stage = s; b.finishJob.share = before; updateClimateUi(); };
    const onProgress = p => { if (b.finishJob) { b.finishJob.share = before + p * (done.get('picture') ?? 0.1); updateClimateUi(); } };
    try {
        const { simMesh } = b;
        const key = climateKey();
        // (a small device: the finish's own surface workers few, the terrain's workers let go while it runs — every worker
        // holds its copies of the meshes, and a phone closes a tab at well under 2 GB — and the finishing worker let go after
        // unless its mesh takes long to build again)
        if (SMALL_DEVICE) b.player?.rest();
        const res = await finisher.finish({ frame: slim, simMesh: { numCells: simMesh.numCells, xyz: simMesh.xyz, adjOffset: simMesh.adjOffset, adjList: simMesh.adjList }, seed: b.seed, cells, width, climateOptions: climateOptions(), poolSize: SMALL_DEVICE ? 3 : null },
            { onStage, onProgress, keep: !SMALL_DEVICE && cells >= 2.5e6 });
        if (B !== b) return;
        const secs = (performance.now() - started) / 1000;
        // (one detailed moment: this one replaces the one before, now that it is done)
        b.finishes.clear();
        b.finishes.set(frame, { cells, raster: res.raster, rivers: res.rivers, climate: res.climate, stats: res.stats, secs, climateKey: key });
        b.finishOk = true;
        b.finishNote = `Detail added in ${secs.toFixed(0)} s` + (again ? ' (after running short of memory: the moment kept in detail before was let go to make room)' : '');
        console.info(`[evolution] finish of ${frame.time.toFixed(0)} Myr at ${cells} cells: ${secs.toFixed(1)} s, ${(finishBytes(b.finishes.get(frame)) / 2 ** 20).toFixed(0)} MB kept`, Object.fromEntries(Object.entries(res.ms).map(([k, v]) => [k, +(v / 1000).toFixed(1)])), res.stats);
        view.finished = true;
        if (view.layer === 'plates') setLayer('terrain');
    } catch (err) {
        // (out of memory — every worker of a page shares one browser process: the finishing worker is let go, its memory
        // with it, and the finer details are named as the likely cause)
        const oom = /allocation failed|out of memory/i.test(String(err.message));
        if (oom) finisher.cancel();
        // (once: the moment kept in detail let go — it holds memory — and the finish tried again in a fresh worker, the old
        // one's memory gone with it)
        if (oom && !again && B === b) {
            b.finishes.clear(); b.finishJob = null; dirty = true;
            console.warn('[evolution] out of memory finishing: the detailed moment kept and the old worker let go, trying again');
            setTimeout(() => finishMoment(frame), 300);
            return;
        }
        if (B === b) b.finishNote = err.name === 'AbortError' ? 'Adding detail cancelled'
            : oom ? 'Not enough memory for this detail — try a coarser one, or close other tabs (other World Orogen tabs can share this one’s memory)' : `Could not add detail: ${String(err.message).split('\n')[0]}`;
        if (err.name !== 'AbortError') console.error(err);
    } finally {
        b.player?.wake();
        if (B === b && b.finishJob?.frame === frame) { b.finishJob = null; dirty = true; updateClimateUi(); }
    }
}

// ── the context card (plans/V2_EVOLUTION_UI_PLAN.md; developer, 2026-10-13: the page was "too sparse and confusing. It
// isn't intuitive what a user should be doing"): one card that says what is on screen and the one thing to do next —
// Add detail, Cancel, Export — its button mirrored on the timeline, beside the moment chosen. One moment of a history is
// kept in detail; the timeline's moments are previews — the card says when adding detail replaces the one kept (the
// button says what it does, not what it costs: developer, "the 'replace' wording on the timeline is a bit confusing") ──
const cellsWords = n => (n >= 1e6 ? `${n / 1e6}M` : `${n / 1e3}K`);
/** The history's one detailed moment, as [frame, finished], or null. */
const detailedOf = b => (b?.finishes.size ? b.finishes.entries().next().value : null);
const showIf = (el, on) => { el.hidden = !on; return on; };
/** The card, the timeline's button and badge, the Extend history button, the sheet's line and the Satellite tab's lock. */
function updateCard() {
    const b = B, frame = painted, job = b?.finishJob, det = detailedOf(b), detFrame = det?.[0], fin = det?.[1];
    const isDet = !!frame && frame === detFrame, cells = Number($('finishCells').value);
    const t = frame ? frame.time.toFixed(0) : '', dt = detFrame?.time.toFixed(0), pct = job ? (100 * Math.min(1, job.share)).toFixed(0) : 0;
    // the one thing to do next: the card's button and the timeline's
    let main = 'Add detail', short = main, title = 'Sculpt the moment shown again, in detail: its rivers, lakes and glaciers, its own climate and the Satellite view (seconds to a minute)';
    if (job) { main = short = `Cancel · ${pct}%`; title = `Adding detail to ${job.frame.time.toFixed(0)} Myr (${job.stage}) — click to cancel`; }
    else if (isDet) { main = short = 'Export'; title = 'Save this detailed moment as map files: heightmaps (the sea floor too), a land mask and the colour map'; }
    else if (detFrame) title = `Add detail to ${t} Myr — it replaces the detailed ${dt} Myr once it is done (one moment is kept in detail)`;
    for (const [btn, label] of [[$('cardAction'), main], [$('timelineAction'), short]]) {
        btn.disabled = !frame || !b?.simMesh;
        btn.textContent = label; btn.title = title;
        btn.classList.toggle('busy', !!job);
    }
    $('finishBar').hidden = $('cardBar').hidden = !job;
    if (job) for (const bar of [$('finishBar'), $('cardBar')]) bar.firstElementChild.style.width = `${(100 * Math.min(1, job.share)).toFixed(1)}%`;
    // what is on screen: the moment, a preview or detailed
    const badge = !frame ? null : isDet ? `Detailed · ${cellsWords(fin.cells)}` : 'Preview';
    for (const el of [$('cardBadge'), $('momentBadge')]) {
        if (showIf(el, !!badge)) { el.textContent = badge; el.classList.toggle('detailed', isDet); }
    }
    $('cardTitle').textContent = frame ? `${t} Myr` : b?.loading ? 'Opening…' : 'Starting…';
    const computing = !!b?.live && !b.going;
    $('cardText').textContent = !frame ? (b?.loading ? 'Opening a planet file…' : b?.problem ? '' : 'A new world is starting…')
        : job ? `Adding detail to ${job.frame.time.toFixed(0)} Myr: ${job.stage}…`
        : isDet ? 'This moment, sculpted in detail. Look around — Satellite and Climate show it at its detail — then export it as map files.'
        : playing ? (computing ? 'Computing the history — scrub through any of it as it fills in. Pause on a moment you like, then add detail.' : 'Pause on a moment you like, then add detail.')
        : 'This is a preview. Add detail sculpts it again, finely: rivers and lakes, glaciers, its own climate and the Satellite view — ready to export.';
    showIf($('detailGroup'), !!frame && !job);
    showIf($('waterGroup'), isDet && !job);
    const again = $('cardAgain'), stale = isDet && fin.climateKey !== climateKey();
    if (showIf(again, isDet && !job && (fin.cells !== cells || stale))) again.textContent = stale ? 'Add detail again with the new climate' : `Add detail again at ${cellsWords(cells)}`;
    if (showIf($('cardDetailed'), !!detFrame && !isDet)) {
        $('cardDetailed').innerHTML = (job ? `Replaces the detailed ${dt} Myr once it is done.` : `Replaces the detailed ${dt} Myr — one moment is kept in detail.`) +
            ` <a href="#" data-t="${detFrame.time}">Go to ${dt} Myr</a>`;
    }
    const note = b?.problem ? b.problem
        : stale && !job ? 'Detailed with the Temperature and Precipitation as they were — its rivers, ice and Satellite view too.'
        : b?.finishNote && (isDet || !b.finishOk) ? b.finishNote
        : b?.loadNote && frame === b.loadFrame && !job ? b.loadNote : null;
    if (showIf($('cardNote'), !!note)) $('cardNote').textContent = note;
    // Extend history: once the history has reached its end — Stop while it runs on, Stopping… until its piece is done
    const ext = ui.extend, replay = b?.replay, canReplay = !!b?.opened && !b.run && !b.noReplay && !b.loading && !b.error;
    if (showIf(ext, !!b?.run?.more || canReplay)) {
        if (!b.run) {
            // (a history opened from a file: run again first — Stop while it is)
            ext.disabled = false;
            ext.classList.toggle('on', !!replay);
            ext.textContent = replay ? `Stop · ${Math.round(100 * replay.share)}%` : 'Extend history';
            ext.title = replay ? 'Stop running the history again (you can start it again later)'
                : 'Run the history on from where it ended — first run again here from its seed, out of sight, as long as it took to build (a planet file holds the history, not the simulation that made it)';
        } else {
            ext.disabled = b.going && !b.wantGo;
            ext.classList.toggle('on', b.going);
            ext.textContent = !b.going ? 'Extend history' : b.wantGo ? 'Stop extending' : 'Stopping…';
            ext.title = !b.going ? 'Run the history on from where it ended, for as long as you like' : b.wantGo ? 'Stop the history here (you can extend it again later)' : 'Stopping once this piece of history is done';
        }
    }
    // (the collapsed bottom sheet: the moment and what is going on, in a line)
    $('sheetLine').textContent = b?.problem && !frame ? b.problem : !frame ? (b?.loading ? 'Opening a planet…' : 'Starting a world…') : `${t} Myr · ${badge}` + (job ? ` · adding detail ${pct}%` : computing ? ' · computing the history…' : b?.going ? ' · extending the history…' : replay ? ' · running the history again…' : '');
    // Satellite comes with detail: its tab locked on previews
    const satOk = !!(frame && b?.finishes.get(frame)?.climate?.raster?.sat), geoOk = !!(frame && b?.finishes.get(frame));
    document.querySelector('#mapTabs [data-layer="satellite"]').classList.toggle('locked', !satOk);
    $('mobileViewSwitch').querySelector('option[value="satellite"]').textContent = satOk ? 'Satellite' : 'Satellite 🔒';
    document.querySelector('#mapTabs [data-layer="geology"]').classList.toggle('locked', !geoOk);
    $('mobileGeology').label = geoOk ? 'Geology' : 'Geology 🔒';
    document.querySelector('#mapTabs [data-layer="farming"]').classList.toggle('locked', !geoOk);
    $('mobileFarming').label = geoOk ? 'Farming' : 'Farming 🔒';
    const legend = $('regimeLegend');
    legend.hidden = !(view.byRegime && view.water && view.layer === 'terrain' && isDet);
    if (!legend.childElementCount) legend.innerHTML = REGIME_STYLE.map(s => `<span><i style="background:${s.rgb}"></i>${s.name}</span>`).join('');
    $('legendCard').hidden = !$('climateLegend').innerHTML.trim() && legend.hidden;
}
/** The card's and the timeline's button: Cancel while adding detail; Export on the detailed moment; else Add detail. */
function mainAction() {
    const b = B, frame = painted;
    if (!b || !frame) return;
    if (!b.finishJob && b.finishes.get(frame)) exportPanel.open();
    else finishMoment();
}

// ── the export (plans/V2_FULL_PLANET_PLAN.md C): the finished moment shown, as map files — V1's dialog ──
// (the panel: every map as colour and as data, in a projection — v2/js/view/export-panel.js, export.js)
// …and beside the maps the planet file (plans/V2_SAVE_LOAD_PLAN.md): the history and its detailed moment, to open again
// later without building them again
const planetFile = {
    status: ({ fin }) => (B.live || B.going
        ? { ok: false, note: 'Once the history has finished building, it can be saved here with this detailed moment' }
        : { ok: true, note: `The ${B.endMyr.toFixed(0)} Myr history and this detailed moment, to open again later · about ${Math.round(planetBytes(B.frames, fin) / 2 ** 20)} MB before compression` }),
    save: async ({ frame, fin }, progress) => {
        const b = B;
        if (b.finishes.get(frame) !== fin) throw new Error('this moment is no longer the detailed one');
        const [greenhouse, rain] = fin.climateKey.split('|').map(Number);
        const { blob } = await savePlanet({
            settings: { seed: b.seed, ...(b.seedText ? { seedText: b.seedText } : {}), cont: b.contPct, len: b.lengthMyr, ending: b.ending, sim: b.simCells, terrain: b.terrainCells, greenhouse, rain, more: b.moreTo || 0,
                ...(farmOptions.roll ? { crops: farmOptions.roll } : {}) },             // (the Farming legend's re-roll, as the link has it)
            history: { frames: b.frames, simMesh: b.simMesh, simMyr: b.simMyr, steps: b.steps, stopped: b.stopped ?? null, snapshotMyr: SNAPSHOT_MYR },
            detail: { frame, fin }, onProgress: progress });
        return { blob, name: fileName(['orogen', b.seedText ?? b.seed, `${Math.round(frame.time)}Myr`], 'orogen') };
    },
};
const exportPanel = initEvolutionExport({
    moment: () => { const frame = painted, fin = frame && B?.finishes.get(frame); if (!fin) return null; setPlaying(false); return { frame, fin, seed: B.seedText ?? B.seed }; },
    look: () => ({ lut: heightLutOf(view.palette), exaggeration: SHADING.exaggeration, water: view.water, riverQ: view.riverQ, byRegime: view.byRegime }),
    centerLon: () => view.centerLon, projection: () => (view.mode === 'map' ? { id: view.projection, opts: view.projOpts } : null), isTouch: IS_TOUCH,
    simMesh: () => B?.simMesh, planetFile });

// ── the climate (step D): calculated on request for the moment shown, kept per moment while the history is open ──
const climateOf = frame => { const e = B?.climates.get(frame); return e && e.tMesh === B.tMesh && e.key === climateKey() ? e.data : null; };
// Preview climates are kept while the history is open, within a memory budget: each holds the 1° grid's fields
// (≈ 9.5 MB) and ≈ 13 bytes per terrain cell. Any made for other settings or another terrain mesh go at once, then the
// oldest — so scrubbing through many moments on the Climate tab no longer fills a phone's memory.
const CLIMATE_BUDGET = IS_TOUCH ? 120e6 : 600e6;
function keepClimate(b, frame, entry) {
    for (const [f, e] of b.climates) if (e.tMesh !== entry.tMesh || e.key !== entry.key) b.climates.delete(f);
    b.climates.delete(frame);
    b.climates.set(frame, entry);
    const each = 9.5e6 + 13 * entry.tMesh.numCells;
    while (b.climates.size > 1 && b.climates.size * each > CLIMATE_BUDGET) b.climates.delete(b.climates.keys().next().value);
}

async function calculateClimate() {
    const b = B, frame = painted, T = paintedT;
    if (!b?.tMesh || !frame || paintedMesh !== b.tMesh || b.climateJob || climateOf(frame)) return;
    setPlaying(false);                                  // (it is this moment you are looking at)
    const tMesh = b.tMesh, started = performance.now(), key = climateKey();
    b.climateJob = { frame };
    updateClimateUi();
    try {
        const data = await climate.compute(tMesh, T.heightKm, climateOptions());
        if (B !== b) return;
        keepClimate(b, frame, { tMesh, data, key });
        if (b.problem?.startsWith('Could not work out the climate')) b.problem = null;
        const secs = (performance.now() - started) / 1000;
        console.info(`[evolution] climate for ${frame.time.toFixed(0)} Myr: ${(data.ms / 1000).toFixed(2)} s in the worker, ${secs.toFixed(2)} s in all`);
        if (!CLIMATE_LAYERS.has(view.layer)) setLayer('koppen');
    } catch (err) {
        if (B === b) b.problem = `Could not work out the climate for ${frame.time.toFixed(0)} Myr: ${String(err.message).split('\n')[0]}`;
        console.error(err);
    } finally {
        if (B === b) { b.climateJob = null; dirty = true; updateClimateUi(); }
    }
}

/** The Calculate button, the moments with a climate, the season choice, and the chip over the planet. */
// (every climate layer but Satellite, which comes with a finish: the main five as tabs, the rest under More)
const CLIMATE_SUB = new Set([...CLIMATE_LAYERS].filter(l => !FINISHED_ONLY_LAYERS.has(l)));
function updateClimateUi() {
    const b = B, frame = painted, have = frame ? climateOf(frame) : null, job = b?.climateJob;
    const fin = frame && b ? b.finishes.get(frame) : null;
    // (the Climate tab works the climate out by itself — about a second — for the moment paused on; a finished moment brings
    // its own. Once per moment and terrain detail: a failure is not retried in a loop)
    if (b && CLIMATE_SUB.has(view.layer) && frame && !playing && !have && !fin?.climate && !job && !b.finishJob && paintedMesh === b.tMesh) {
        const key = `${frame.time}|${b.terrainCells}|${climateKey()}`;
        if (!(b.autoClimate ??= new Set()).has(key)) { b.autoClimate.add(key); setTimeout(() => calculateClimate(), 0); }
    }
    const chip = $('climateChip'), shown = frame ? finishedShown(frame) : null, t = frame ? frame.time.toFixed(0) : '';
    let text = null, act = null;
    if (frame && (view.layer === 'satellite' || GEOLOGY_LAYERS.has(view.layer) || FARMING_LAYERS.has(view.layer)) && !shown) {
        const fjob = b.finishJob, what = view.layer === 'satellite' ? 'Satellite view comes' : GEOLOGY_LAYERS.has(view.layer) ? 'Geology views come' : 'Farming views come';
        text = fjob ? `Adding detail to ${fjob.frame.time.toFixed(0)} Myr…` : `The ${what} with detail — add detail to ${t} Myr to see ${view.layer === 'satellite' ? 'it' : 'them'}`;
        act = fjob ? null : 'Add detail';
    } else if (frame && CLIMATE_SUB.has(view.layer) && !shown && !have) {
        text = job ? `Working out the climate of ${job.frame.time.toFixed(0)} Myr…` : playing ? 'Pause on a moment to see its climate' : `No climate for ${t} Myr`;
        act = job || playing ? null : 'Calculate';
    }
    chip.hidden = !text;
    if (text) { $('climateChipText').textContent = text; $('climateChipBtn').hidden = !act; $('climateChipBtn').textContent = act ?? ''; }
    updateCard();
}

function stats(T, frame) {
    if (!$('statsDetails').open) return;
    const h = T.hyps, km = v => `${Math.round(v * 1000).toLocaleString()} m`;
    ui.stats.innerHTML = `<div>${frame.time.toFixed(0)} Myr</div><div>Land: ${(100 * h.landShare).toFixed(1)} % of the planet</div>` +
        `<div>Below 400 m: ${(100 * h.below400).toFixed(0)} % of the land</div><div>Median land: ${km(h.landKm[2])} · 90 % below ${km(h.landKm[4])}</div>` +
        `<div>Plates: ${frame.plates.filter(p => p.alive && !p.isBackground).length}</div>`;
}

function tick(now) {
    requestAnimationFrame(tick);
    const dt = Math.min(0.1, (now - lastTick) / 1000);
    lastTick = now;
    if (B?.player && B.frames.length) {
        // wall-clock playback at the speed chosen; a frame still being built holds the clock, and so does the newest
        // moment built while the history is still arriving (it goes on as the next arrive)
        if (playing && B.player.isReady(frameAt(playTime))) {
            playTime += dt * Number(ui.rate.value);
            const end = builtTo();
            if (playTime >= end) { playTime = end; if (!B.live) setPlaying(false); }
            ui.time.value = playTime;
        }
        const frame = frameAt(Number(ui.time.value));
        // (paused and settled: the sharper texture — on the CPU once its table is built; on the GPU every moment is that
        // sharp, but a detailed moment's picture is painted on a canvas still)
        const settled = !playing && now - lastScrub > SHARP_AFTER_MS;
        const sharpTable = settled && !gpu ? sharpTableOf(B.tMesh) : null, sharp = gpu ? settled && SHARP_WIDTH > 0 : !!sharpTable;
        if (B.player.isReady(frame)) { if (frame !== painted || dirty || sharp !== paintedSharp) { paint(frame, sharpTable, sharp); dirty = false; } }
        else if (!preparing && !(B.drawFailed?.frame === frame && now < B.drawFailed.retryAt)) {
            const b = B;
            const p = preparing = b.player.prepare(frame)
                .then(() => { if (b.drawFailed?.frame === frame) { b.drawFailed = null; b.problem = null; updateCard(); } })
                .catch(err => {
                    console.error(err);
                    if (B !== b) return;
                    const tries = (b.drawFailed?.frame === frame ? b.drawFailed.tries : 0) + 1;
                    b.drawFailed = { frame, tries, retryAt: performance.now() + (tries >= 3 ? Infinity : 2000 * tries) };
                    b.problem = `Could not draw ${frame.time.toFixed(0)} Myr: ${String(err.message).split('\n')[0]}` +
                        (tries >= 3 ? '. Try a lower Terrain Detail, or reload the page.' : ' — trying again…');
                    updateCard();
                })
                .finally(() => { if (preparing === p) preparing = null; dirty = true; });
        }
    }
    globe.controls.autoRotate = $('chkRotate').checked && view.mode === 'globe';
    globe.resize();
    if (globe.renderIfNeeded()) placePins();                // (the globe, or the map: the same renderer draws both)
}
requestAnimationFrame(tick);

// ── the numbered pins (the Crop spread view's hearths, the Cradles view's sites): drawn over the planet, not on its
// texture, so that they stay round and sharp on the globe and on the map at any projection and zoom — placed again each
// time the planet is drawn again ──
const pinBox = $('mapPins');
let pinsKey = '', pinsShown = [];
function placePins() {
    const fin = painted && B ? finishedShown(painted) : null;
    const list = fin && (view.layer === 'farmSpread' || view.layer === 'farmCradle') ? farmingPins(view.layer, fin) : [];
    const key = list.map(p => `${p.label}:${p.lat}:${p.lon}:${p.fill}`).join('|');
    if (key !== pinsKey) {
        pinsKey = key; pinsShown = list;
        pinBox.innerHTML = list.map(p => `<b class="evo-pin" style="background:${p.fill};border-color:${p.ring};color:${p.ink}">${p.label}</b>`).join('');
    }
    pinsShown.forEach((p, k) => {
        const at = globe.screenAt(p.lat, p.lon), el = pinBox.children[k];
        el.hidden = !at;
        if (at) el.style.transform = `translate(${at.x.toFixed(1)}px, ${at.y.toFixed(1)}px)`;
    });
}

// ── the timeline ──
function setPlaying(on) {
    playing = on;
    ui.play.innerHTML = on ? '&#x23F8;' : '&#x25B6;';
    if (on && !B.live && playTime >= builtTo()) playTime = 0;                      // (at the end: from the start again)
    updateClimateUi();
}
ui.play.addEventListener('click', () => { if (B?.frames.length) setPlaying(!playing); });
ui.time.addEventListener('input', () => {
    // (not past what is built: the rest of the scale is the history still to come)
    if (Number(ui.time.value) > builtTo()) ui.time.value = builtTo();
    playTime = Number(ui.time.value); dirty = true; lastScrub = performance.now(); rail();
});
// Extend history / Stop (a stop lets the piece under way finish: the worker is in the middle of it)
ui.extend.addEventListener('click', () => {
    const b = B;
    if (b?.replay) { b.replay.ctl.abort(); return; }
    if (b?.opened && !b.run) { replayHistory(b); return; }
    if (!b?.run?.more) return;
    if (!b.going) keepGoing(b);
    else { b.wantGo = false; b.goUntil = Infinity; updateCard(); }
});
addEventListener('keydown', e => {
    if (e.target.closest('input, select, textarea') || !$('exportOverlay').classList.contains('hidden') || !$('tutorialOverlay').classList.contains('hidden')) return;
    if (e.code === 'Space') { e.preventDefault(); ui.play.click(); }
});

// ── view options (V1's) ──
let climateLayer = 'koppen';            // (the Climate tab opens on the climate map last shown)
let geologyLayer = 'geoRocks';          // (…and the Geology tab on its view last shown)
let farmingLayer = 'farmLand';          // (…and the Farming tab on its)
function setLayer(layer) {
    if (layer === 'climate') layer = climateLayer;
    if (layer === 'geology') layer = geologyLayer;
    if (layer === 'farming') layer = farmingLayer;
    if (CLIMATE_SUB.has(layer)) climateLayer = layer;
    const geo = GEOLOGY_LAYERS.has(layer), farm = FARMING_LAYERS.has(layer);
    if (geo) geologyLayer = layer;
    if (farm) farmingLayer = layer;
    view.layer = layer; dirty = true;
    for (const b of document.querySelectorAll('#mapTabs .map-tab')) b.classList.toggle('active', b.dataset.layer === layer || (b.dataset.layer === 'climate' && CLIMATE_SUB.has(layer)) || (b.dataset.layer === 'geology' && geo) || (b.dataset.layer === 'farming' && farm));
    for (const b of document.querySelectorAll('#climateTabs .map-tab, #geologyTabs .map-tab, #farmingTabs .map-tab')) b.classList.toggle('active', b.dataset.layer === layer);
    const more = $('climateMore'), inMore = !!more.querySelector(`option[value="${layer}"]`);
    more.value = inMore ? layer : ''; more.classList.toggle('active', inMore);
    $('mobileViewSwitch').value = layer;
    $('subBar').hidden = !CLIMATE_SUB.has(layer) && !SEASONAL_LAYERS.has(layer) && !geo && !farm;
    $('climateTabs').hidden = $('climateMore').hidden = !CLIMATE_SUB.has(layer);
    $('geologyTabs').hidden = !geo;
    $('farmingTabs').hidden = !farm;
    $('season').hidden = !SEASONAL_LAYERS.has(layer);
    updateClimateUi();
}
for (const b of document.querySelectorAll('#mapTabs .map-tab, #climateTabs .map-tab, #geologyTabs .map-tab, #farmingTabs .map-tab')) b.addEventListener('click', () => setLayer(b.dataset.layer));
// (the Farming legend's chips: a technique on or off, the classes or the ramp, the season watered or not — at once)
$('climateLegend').addEventListener('click', e => { if (farmChipClicked(e.target)) { dirty = true; saveUrl(); } });
// (…and a hearth's crop chosen in the Crop spread legend: its strain spreads as that crop does)
$('climateLegend').addEventListener('change', e => { if (farmPickChanged(e.target)) dirty = true; });
$('mobileViewSwitch').addEventListener('change', e => setLayer(e.target.value));
$('climateMore').addEventListener('change', e => { if (e.target.value) setLayer(e.target.value); });
$('cardAction').addEventListener('click', mainAction);
$('timelineAction').addEventListener('click', mainAction);
$('cardAgain').addEventListener('click', () => finishMoment());
$('finishCells').addEventListener('change', () => updateCard());
$('chkWater').addEventListener('change', e => { view.water = e.target.checked; dirty = true; updateCard(); });
$('riverDensity').addEventListener('change', e => { view.riverQ = Number(e.target.value); dirty = true; });
$('chkRegime').addEventListener('change', e => { view.byRegime = e.target.checked; dirty = true; updateCard(); });
$('cardDetailed').addEventListener('click', e => {
    const a = e.target.closest('a[data-t]');
    if (!a || !B?.frames.length) return;
    e.preventDefault(); setPlaying(false);
    playTime = Number(a.dataset.t); ui.time.value = playTime; dirty = true; rail();
});
$('climateChipBtn').addEventListener('click', () => (FINISHED_ONLY_LAYERS.has(view.layer) || GEOLOGY_LAYERS.has(view.layer) || FARMING_LAYERS.has(view.layer) ? finishMoment() : calculateClimate()));
$('season').addEventListener('change', e => { view.season = e.target.value; dirty = true; });
$('chkShade').addEventListener('change', e => { view.shaded = e.target.checked; dirty = true; });
$('palette').value = view.palette;
$('palette').addEventListener('change', e => {
    view.palette = e.target.value; dirty = true;
    try { localStorage.setItem(PALETTE_KEY, view.palette); } catch { /* (remembered only where the browser allows) */ }
});
$('viewMode').addEventListener('change', e => {
    view.mode = e.target.value;
    ui.map.hidden = view.mode !== 'map';                    // (the map's frame: the map is drawn under it, and it takes the pointer)
    ui.hover.style.display = 'none';
    if (!IS_TOUCH) ui.info.textContent = `Drag to ${view.mode === 'map' ? 'move the map' : 'turn the planet'} · scroll to zoom · hover for details`;
    showMap();
});
// the map view's projection (projections.js), with its own options; remembered, the same on the three pages
initProjectionPicker((id, opts) => { view.projection = id; view.projOpts = opts; showMap(); });
$('sMapCenterLon').addEventListener('input', e => {
    view.centerLon = Number(e.target.value);
    $('vMapCenterLon').textContent = `${view.centerLon}°`;
    showMap();
});
$('chkGrid').checked = view.grid;
$('chkGrid').addEventListener('change', e => { view.grid = e.target.checked; dirty = true; $('gridSpacingGroup').hidden = !view.grid; });
$('gridSpacing').addEventListener('change', e => { view.gridStep = Number(e.target.value); dirty = true; });
// (the experimental views: their tabs and layer-list entries shown or hidden — and left, if one was showing)
function showExperimental() {
    for (const el of document.querySelectorAll('[data-experimental]')) { el.hidden = !view.experimental; if (el.tagName === 'OPTION') el.disabled = !view.experimental; }
    if (view.experimental) return;
    if (farmingLayer === 'farmCradle') farmingLayer = 'farmLand';
    if (view.layer === 'farmCradle') setLayer('farmLand');
}
$('chkExperimental').checked = view.experimental;
$('chkExperimental').addEventListener('change', e => {
    view.experimental = e.target.checked;
    try { localStorage.setItem(EXPERIMENTAL_KEY, view.experimental ? '1' : '0'); } catch { /* (remembered only where the browser allows) */ }
    showExperimental();
});
showExperimental();
$('statsDetails').addEventListener('toggle', () => { dirty = true; });
// the view strip under the layer bar (Globe | Map and what applies to it; on a phone, in the bottom sheet)
initViewStrip();

// ── hover readout (V1's): the crust and plate, height, position, crust age and setting under the pointer ──
/** Where the pointer is on the texture, as fractions [u (west → east), v (north → south)] — or null, off the planet. */
function placeUnder(e) {
    if (view.mode === 'map') return globe.mapUvAt(e.clientX, e.clientY);
    const uv = globe.uvAt(e.clientX, e.clientY);
    return uv ? [uv.x, 1 - uv.y] : null;
}
/** The terrain cell that weighs most at a place [u, v] (the mesh triangle it falls in: the one a pixel there blends). */
const C3 = [0, 0, 0], W3 = [0, 0, 0];
function cellUnder(mesh, [u, v]) {
    const lon = u * 2 * Math.PI - Math.PI, lat = Math.PI / 2 - v * Math.PI;
    locate(mesh, Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat), C3, W3);
    return C3[W3[0] >= W3[1] && W3[0] >= W3[2] ? 0 : W3[1] >= W3[2] ? 1 : 2];
}
function readout(e) {
    const p = painted && paintedMesh ? placeUnder(e) : null;
    if (!p) { ui.hover.style.display = 'none'; return; }
    const t = cellUnder(paintedMesh, p), h = paintedT.heightKm[t] - SHADING.seaLevelKm;
    // (the sim cell that weighs most in this terrain cell: its crust, plate and history)
    const { cells, weights } = paintedT.sampler;
    let w = cells[3 * t];
    if (weights[3 * t + 1] > weights[3 * t] && weights[3 * t + 1] >= weights[3 * t + 2]) w = cells[3 * t + 1];
    else if (weights[3 * t + 2] > weights[3 * t] && weights[3 * t + 2] > weights[3 * t + 1]) w = cells[3 * t + 2];
    const f = painted, lat = 90 - p[1] * 180, lon = p[0] * 360 - 180, lines = [];
    // (a finished moment shown: its own heights, its lakes and rivers, its own climate)
    const fin = finishedShown(f), at = fin ? finishedAt(fin, p[0], p[1]) : null;
    const plate = f.owner[w], type = f.type[w], oceanic = type === 0;
    if (plate >= 0) lines.push(`<span style="color:${oceanic ? '#4af' : '#6b3'}">●</span> <b>${CRUST_WORDS[type] ?? 'Crust'}</b> · plate ${plate}`);
    lines.push(`<span class="hi-label">Elev</span> ${Math.round(at ? at.heightM : h * 1000).toLocaleString()} m`);
    if (at && view.water && (view.layer === 'terrain' || view.layer === 'satellite')) {
        if (at.water && !at.ocean) lines.push(`<span style="color:#5ae">●</span> <b>${['', 'Fresh lake', 'Salt lake', 'Salt pan'][at.water]}</b>`);
        const rv = fin.rivers && !at.ocean ? riverAt(fin, view.riverQ, p[0], p[1]) : null;
        if (rv) lines.push(`<span style="color:${view.byRegime ? REGIME_STYLE[rv.regime].rgb : '#37c'}">●</span> <b>River</b> · ${Math.round(rv.q).toLocaleString()} m³/s · ${riverYearWords(rv)}`);
    }
    lines.push(`<span class="hi-label">Coord</span> ${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'}`);
    if (plate >= 0) lines.push(`<span class="hi-label">Age</span> ${Math.max(0, Math.round(f.time - f.formedAt[w])).toLocaleString()} Myr`);
    const setting = plate >= 0 ? settingOf(f, w) : null;
    if (setting) lines.push(`<span class="hi-label">Setting</span> ${setting}`);
    // the geology views: the record under the pointer (its belt, its seas, its cover, its wear)
    if (fin && GEOLOGY_LAYERS.has(view.layer)) {
        // (the record where the terrain read it, if the finish handed that over: the cell the pixel shows)
        const rw = !at.ocean ? recAt(fin, p[0], p[1]) : -1, wr = rw >= 0 ? rw : w;
        const rl = !at.ocean ? rockLine(rockAt(fin, p[0], p[1]), f, wr) : null;
        if (rl) lines.push(rl);
        lines.push(...geologyLines(f, wr));
        ui.hover.innerHTML = lines.join('<br>'); ui.hover.style.display = 'block';
        return;
    }
    // the farming views: what the land could grow there, and why (its water, soil, season and ground)
    if (fin && FARMING_LAYERS.has(view.layer)) {
        lines.unshift(...farmingLines(fin, p[0], p[1], !!at.ocean, view.layer));
        ui.hover.innerHTML = lines.join('<br>'); ui.hover.style.display = 'block';
        return;
    }
    // the climate, where this moment has one: its Köppen class, temperature and rain
    const C = climateOf(f);
    if (fin?.climate) lines.push(...finishedClimateLines(fin.climate, p[0], p[1], !!at.ocean, view.layer, view.season));
    else if (C && paintedMesh === B.tMesh) lines.push(...readoutLines(C, paintedT, B.tMesh, t, view.layer, view.season));
    ui.hover.innerHTML = lines.join('<br>');
    ui.hover.style.display = 'block';
}
for (const el of [ui.canvas, ui.map]) {
    // (a mouse: as it moves; a finger: a tap shows it, a drag turns the globe and hides it)
    let down = null;
    el.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
    el.addEventListener('pointermove', e => {
        if (e.pointerType === 'mouse') { if (!e.buttons) readout(e); else ui.hover.style.display = 'none'; }
        else if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 8) { down = null; ui.hover.style.display = 'none'; }
    });
    el.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse' && down) readout(e); down = null; });
    el.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') ui.hover.style.display = 'none'; });
}

// ── the side panel: collapse on desktop, a draggable bottom sheet on phones (as V1's) ──
$('sidebarToggle').addEventListener('click', () => { ui.panel.classList.toggle('collapsed'); updateClimateUi(); });
(function bottomSheet() {
    const handle = $('sheetHandle'), mobile = () => matchMedia('(max-width: 768px)').matches;
    let startY = 0, startOffset = 0, dragging = false, moved = false, lastY = 0, lastT = 0, velocity = 0;
    const collapsedOffset = () => ui.panel.offsetHeight - 60;
    handle.addEventListener('pointerdown', e => {
        if (!mobile()) return;
        e.preventDefault(); handle.setPointerCapture(e.pointerId);
        dragging = true; moved = false; startY = lastY = e.clientY; lastT = performance.now(); velocity = 0;
        startOffset = ui.panel.classList.contains('collapsed') ? collapsedOffset() : 0;
        ui.panel.classList.add('dragging'); ui.panel.style.transition = 'none';
    });
    handle.addEventListener('pointermove', e => {
        if (!dragging) return;
        const now = performance.now();
        velocity = (e.clientY - lastY) / Math.max(1, now - lastT); lastY = e.clientY; lastT = now;
        if (Math.abs(e.clientY - startY) > 4) moved = true;
        const y = Math.max(0, Math.min(collapsedOffset(), startOffset + e.clientY - startY));
        ui.panel.style.transform = `translateY(${y}px)`;
    });
    const end = () => {
        if (!dragging) return;
        dragging = false;
        ui.panel.classList.remove('dragging'); ui.panel.style.transition = ''; ui.panel.style.transform = '';
        if (!moved) { ui.panel.classList.toggle('collapsed'); return; }
        const y = startOffset + lastY - startY, collapse = velocity > 0.4 || (velocity > -0.4 && y > collapsedOffset() / 2);
        ui.panel.classList.toggle('collapsed', collapse);
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
    if (mobile()) ui.panel.classList.add('collapsed');
})();

// ── the tutorial (V1's, js/main.js): over a history already building, on the first visit; the "?" opens it again ──
(function tutorial() {
    const overlay = $('tutorialOverlay'), steps = overlay.querySelectorAll('.tutorial-step'), dots = overlay.querySelectorAll('.dot');
    const KEY = 'orogen.evolution.tutorial-seen';
    let current = 0;
    const show = i => {
        current = i;
        steps.forEach((s, k) => s.classList.toggle('active', k === i));
        dots.forEach((d, k) => d.classList.toggle('active', k === i));
        $('tutorialBack').disabled = i === 0;
        $('tutorialNext').textContent = i === steps.length - 1 ? 'Get Started' : 'Next';
        $('tutorialCard').scrollTop = 0;     // (a card taller than the screen scrolls: each step from its top)
    };
    const open = () => { show(0); overlay.classList.remove('hidden'); };
    const close = () => { overlay.classList.add('hidden'); try { localStorage.setItem(KEY, '1'); } catch { /* (remembered only where the browser allows) */ } };
    $('tutorialNext').addEventListener('click', () => (current < steps.length - 1 ? show(current + 1) : close()));
    $('tutorialBack').addEventListener('click', () => { if (current > 0) show(current - 1); });
    $('tutorialClose').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    addEventListener('keydown', e => { if (e.key === 'Escape' && !overlay.classList.contains('hidden')) close(); });
    $('helpBtn').addEventListener('click', open);
    // (a finger taps where a mouse hovers)
    if (IS_TOUCH) {
        for (const el of overlay.querySelectorAll('[data-touch]')) el.textContent = el.dataset.touch;
        for (const s of overlay.querySelectorAll('.tutorial-step p')) s.innerHTML = s.innerHTML.replace('<strong>scroll</strong> to zoom', '<strong>pinch</strong> to zoom');
        ui.info.textContent = '';
    }
    const seen = (() => { try { return localStorage.getItem(KEY); } catch { return '1'; } })();
    if (!seen) open();
})();

labels();
build();
