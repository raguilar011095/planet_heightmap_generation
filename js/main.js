// Generate, on the shared core (plans/SHARED_CORE_PLAN.md): the present-day world
// built by the worker (js/planet-worker.js — its plates, its past, its ground on Generate's mesh), shown at once as the
// first picture, then finished in the background by Evolution's own finish (v2/js/finish/finish.js, through its worker:
// the climate, the rivers carved by its runoff, lakes, the ice age, dunes and loess, the rocks, deposits and food, the
// Satellite view) — on Evolution's planet view and layer bar (v2/js/view/planet-view.js, layer-bar.js) and its export.
// What is Generate's own: the sliders, the planet code, the plate edits (Ctrl-click, or the edit button on a phone, then
// Rebuild), the Plates view and the Inspect list's layers (js/generate-plates.js), the build overlay, the tutorial.

import Delaunator from 'delaunator';
import { setDelaunator } from './sphere-mesh.js';
import { meshFromArrays } from '../v2/js/core/sim-mesh.js';
import { PlanetView } from '../v2/js/view/planet-view.js';
import { mountLayerBar } from '../v2/js/view/layer-bar.js';
import { FinishService } from '../v2/js/evolution/finish-view.js';
import { STAGES as FINISH_STAGES } from '../v2/js/finish/finish.js';
import { initEvolutionExport, CATALOGUE, rollRows, rollShift } from '../v2/js/evolution/export.js';
import { DATA_SCALES } from '../v2/js/view/export-raster.js';
import { heightLutOf } from '../v2/js/evolution/looks.js';
import { CLIMATE_LAYERS } from '../v2/js/evolution/climate-view.js';
import { GEOLOGY_LAYERS } from '../v2/js/evolution/geology-view.js';
import { FARMING_LAYERS } from '../v2/js/evolution/farming-view.js';
import { encodePlanetCode, decodePlanetCode } from './planet-code.js';
import { detailFromSlider, sliderFromDetail } from './detail-scale.js';
import { showBuildError, describeFailure, holdControls } from './build-error.js';
import { presentCrustLine } from './present-crust.js';
import { plateColors, platesLegendHTML, INSPECT, inspectColors, drawPlateLines, platesMap } from './generate-plates.js';
import { state } from './state.js';
import { store, sliderTooltip, detailWarning, redrawFoldedSliders, sidePanel, buildOverlay, tutorial } from './page-chrome.js';

setDelaunator(Delaunator);

const $ = (id) => document.getElementById(id);
const IS_TOUCH = state.isTouchDevice;

// ── the page: the map's frame beside the globe's canvas, the canvas the window's, the bar over it ──
if (!$('mapCanvas')) { const m = document.createElement('canvas'); m.id = 'mapCanvas'; m.hidden = true; $('canvas').after(m); }
Object.assign($('canvas').style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh' });
mountLayerBar({ comes: 'Comes a few seconds after the planet',
    platesTip: 'The plates in their colours, each piece a shade of its own, the boundaries by kind and the motion as arrows — Ctrl-click (⌘-click on a Mac) a piece to raise or sink it, in any view' });
// (the Inspect list: the world's past, per region)
const inspectEl = $('debugLayer');

const pv = new PlanetView({ isTouch: IS_TOUCH, gpu: new URLSearchParams(location.search).get('gpu') !== '0', paletteKey: 'orogen.generate.palette',
    onChange: viewChanged, alive: (fin) => fin === world?.fin,
    extraLines: (ctx, W, view) => drawPlateLines(ctx, W, view, world, { pending, hovered: hoveredPiece }),
    extraLinesKey: (view) => `${world?.version ?? 0}|${view.layer === 'plates'}|${[...pending].join(',')}|${hoveredPiece}`,
    infoText: (mode) => (IS_TOUCH ? 'Drag to rotate · Pinch to zoom · Use edit button to reshape' : `Drag to ${mode === 'map' ? 'move the map' : 'rotate'} · Scroll to zoom · Ctrl-click (⌘-click on a Mac) to reshape continents`) });
const view = pv.view;
if (IS_TOUCH) $('info').textContent = 'Drag to rotate · Pinch to zoom · Use edit button to reshape';
console.info(`[generate] painting ${pv.gpu ? `on the GPU at ${pv.GPU_WIDTH} px` : 'on the CPU'}`);

let world = null;            // the planet shown: its mesh, first picture, plates and edits, and its finished moment once done
let dirty = true, version = 0;
const pending = new Set();   // the pieces whose edit waits for Rebuild
let hoveredPiece = -1;
const finisher = new FinishService();

function viewChanged(what) {
    dirty = true;
    if (what === 'layer' && !view.layer.startsWith('inspect:') && inspectEl) inspectEl.value = '';
    updateChip();
}

// ── the worker: the present-day world, its first picture, the finish's job ──
let worker = null, onDone = null;
function startWorker() {
    worker = new Worker(new URL('./planet-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data: msg }) => {
        if (msg.type === 'progress') { onProgress(msg.pct, msg.label); return; }
        if (msg.type === 'error') { failed(msg.message); return; }
        if (msg.type === 'done' || msg.type === 'reapplyDone' || msg.type === 'editDone') received(msg);
    };
    worker.onerror = (e) => { failed(e.message || 'Worker crashed'); worker.terminate(); startWorker(); };
}
startWorker();

/** The sliders, as the worker reads them. */
function sliders() {
    const v = (id) => +$(id).value;
    return { N: detailFromSlider(v('sN')), P: v('sP'), jitter: v('sJ'), nMag: v('sNs'), numContinents: v('sCn'), terrainWarp: v('sTw'), smoothing: v('sS'),
        hydraulicErosion: v('sHEr'), thermalErosion: v('sTEr'), ridgeSharpening: v('sRs'), glacialErosion: v('sGl'), continentSizeVariety: v('sCsv'),
        greenhouse: v('sTmp'), precipitationOffset: v('sPrc'), landCoverage: v('sLc') };
}
/** The climate's options for the finish (as Evolution's, and as Generate's climate read its sliders). */
const climateOptions = () => ({ greenhouseWm2: +$('sTmp').value, precipScale: Math.max(0, 1 + 0.5 * +$('sPrc').value) });

let building = null;         // what the worker is doing: 'generate', 'reapply', 'edit'
function generate(seed, toggledIndices = []) {
    building = 'generate'; finisher.cancel();
    showBuildOverlay();
    $('generate').disabled = true; $('generate').textContent = 'Building…'; $('generate').classList.add('generating');
    worker.postMessage({ cmd: 'generate', ...sliders(), seed, toggledIndices, next: true, shared: true });
}
function failed(message) {
    console.error('[generate] build failed:', message);
    building = null; overlay.active = false; holdControls(false);
    resetBuildButton();
    showBuildError(describeFailure(message), message);
}
function resetBuildButton() { const b = $('generate'); b.disabled = false; b.classList.remove('generating', 'stale', 'regen'); b.textContent = 'Build New World'; }

/** A world from the worker: its first picture shown, its finish started. */
function received(msg) {
    const sh = msg.shared;
    if (!sh) { failed('the worker sent no present-day world'); return; }
    const old = world;
    const kind = msg.type, w = {
        version: ++version, seed: msg.seed ?? old?.seed, tMesh: meshFromArrays(sh.mesh), meshArrays: sh.mesh, heightKm: sh.heightKm, shade: sh.shade,
        story: sh.story, regionCell: sh.regionCell, finishJob: sh.finish, fin: null, finishing: null, problem: null,
        present: msg.present ?? old?.present, inspect: msg.debugLayers ?? old?.inspect,
        // (the pieces and their land as edited, and as first built — the planet code's toggles are the difference)
        r_plate: msg.r_plate ?? old.r_plate, plateSeeds: msg.plateSeeds ?? old.plateSeeds,
        plateIsOcean: msg.plateIsOcean ? new Set(msg.plateIsOcean) : old.plateIsOcean, originalPlateIsOcean: msg.originalPlateIsOcean ? new Set(msg.originalPlateIsOcean) : old.originalPlateIsOcean,
        n: sh.mesh.numCells,
    };
    if (kind === 'editDone' && old) { w.seed = old.seed; w.plateIsOcean = old.plateIsOcean; w.originalPlateIsOcean = old.originalPlateIsOcean; }
    world = w; building = null; dirty = true;
    if (pv.gpu) pv.gpu.setMesh(w.tMesh);
    resetBuildButton();
    hideBuildOverlay();
    if (kind === 'done') { snapshotSliders(); clearPending(); }
    updatePlanetCode(kind === 'editDone');
    reapplyBtn.classList.remove('spinning');
    stats(msg);
    $('generate').dispatchEvent(new CustomEvent('generate-done'));
    finish(w);
}

// ── the finish (Evolution's: finish/finish-worker.js) in the background: the rest of the world's layers ──
/** The picture's width for a mesh this fine: about four pixels a cell across, 2048 … 8192 (a phone 2048). */
const finishWidth = (n) => (IS_TOUCH ? 2048 : Math.min(8192, Math.max(2048, 2 ** Math.round(Math.log2(4 * Math.sqrt(n))))));
async function finish(w) {
    if (!w.finishJob) return;
    finisher.cancel();
    const started = performance.now(), job = w.finishJob, shares = new Map(FINISH_STAGES);
    w.fin = null; w.problem = null; w.finishing = { stage: 'starting', share: 0 }; updateChip();
    let before = 0;
    const onStage = (s) => { if (world !== w) return; before = 0; for (const [k, v] of FINISH_STAGES) { if (k === s) break; before += v; } w.finishing = { stage: s, share: before }; updateChip(); };
    const onProgress = (p) => { if (world !== w || !w.finishing) return; w.finishing.share = before + p * (shares.get('picture') ?? 0.1); updateChip(); };
    try {
        const res = await finisher.finish({ ...job, mesh: w.meshArrays, cells: w.n, width: finishWidth(w.n), climateOptions: climateOptions() }, { onStage, onProgress, keep: false });
        if (world !== w) return;
        w.fin = { cells: w.n, raster: res.raster, rivers: res.rivers, climate: res.climate, stats: res.stats };
        w.climateKey = `${$('sTmp').value}|${$('sPrc').value}`;
        console.info(`[generate] finished in ${((performance.now() - started) / 1000).toFixed(1)} s`, Object.fromEntries(Object.entries(res.ms).map(([k, v]) => [k, +(v / 1000).toFixed(2)])));
    } catch (err) {
        if (err.name === 'AbortError' || world !== w) return;
        w.problem = /allocation failed|out of memory/i.test(String(err.message)) ? 'Not enough memory to finish this planet — try a lower Detail' : `Could not finish this planet: ${String(err.message).split('\n')[0]}`;
        console.error(err);
    } finally {
        if (world === w) { w.finishing = null; dirty = true; updateChip(); }
    }
}

/** The chip over the planet: the finish under way (on the layers it brings), or what went wrong. */
function updateChip() {
    const chip = $('climateChip'), w = world, needs = CLIMATE_LAYERS.has(view.layer) || GEOLOGY_LAYERS.has(view.layer) || FARMING_LAYERS.has(view.layer);
    let text = null, act = null;
    if (w?.finishing && needs) text = `Working out the climate, rivers, rocks and food… ${Math.round(100 * Math.min(1, w.finishing.share))} %`;
    else if (w?.problem && needs) { text = w.problem; act = 'Try again'; }
    chip.hidden = !text;
    if (text) { $('climateChipText').textContent = text; $('climateChipBtn').hidden = !act; $('climateChipBtn').textContent = act ?? ''; }
    // (the layers that come with the finish: locked until it is done)
    const fin = w?.fin;
    for (const id of ['satellite', 'geology', 'farming']) document.querySelector(`#mapTabs [data-layer="${id}"]`)?.classList.toggle('locked', !fin);
}
$('climateChipBtn').addEventListener('click', () => { if (world?.problem) finish(world); });

// ── drawing ──
/** The page's own layers per cell: the plates, an Inspect layer. */
function pageCells(layer, out, shade) {
    const w = world;
    if (layer === 'plates') {
        const rgb = plateColors(w);
        for (let r = 0; r < w.n; r++) { const k = 0.45 + 0.55 * shade[r]; for (let c = 0; c < 3; c++) out[3 * r + c] = Math.min(255, rgb[3 * r + c] * k); }
        return true;
    }
    if (layer.startsWith('inspect:')) return inspectColors(layer.slice(8), w, out, shade);
    return false;
}
function paint() {
    const w = world, fin = pv.shows(w.fin);
    pv.syncClouds(fin, w.seed);
    if (fin) pv.paintFinished(fin, false, w.version);
    else pv.paintLive({ T: { heightKm: w.heightKm, shade: w.shade }, tMesh: w.tMesh, cells: pageCells });
    // the page's own layers' legends
    const legend = $('climateLegend');
    if (view.layer === 'plates') { legend.innerHTML = platesLegendHTML(); legend.dataset.key = 'plates'; }
    else if (view.layer.startsWith('inspect:')) { const L = INSPECT[view.layer.slice(8)]; legend.innerHTML = L ? `<div class="evo-legend-head">${L.name}</div><div class="evo-koppen">${L.legend}</div>` : ''; legend.dataset.key = view.layer; }
    pv.syncLegendCard(!!fin);
}
function tick(now) {
    requestAnimationFrame(tick);
    if (world && dirty) { dirty = false; paint(); }
    pv.updatePatch(now, world ? pv.shows(world.fin) : null, world?.fin, world?.seed);
    pv.render();
}
requestAnimationFrame(tick);

// ── the hover, and the plate edits: Ctrl-click (⌘-click) a piece, or tap it in edit mode, then Rebuild ──
const regionAt = (e) => { const p = world ? pv.placeUnder(e) : null; return p ? { p, r: pv.cellUnder(world.tMesh, p) } : null; };
const editing = (e) => e.ctrlKey || e.metaKey || (IS_TOUCH && state.editMode);
function readout(e) {
    const at = regionAt(e);
    if (!at) { pv.hover(null); setHovered(-1); return; }
    const { p, r } = at, w = world, piece = w.r_plate[r], isOcean = w.plateIsOcean.has(piece), isPending = pending.has(piece);
    setHovered(editing(e) ? piece : -1);
    const dot = `<span style="color:${isOcean ? '#4af' : '#6b3'}">●</span>`, action = IS_TOUCH ? 'Tap' : 'Ctrl-click', head = [];
    head.push(isPending ? `${dot} <b>${isOcean ? 'Ocean' : 'Land'} → ${isOcean ? 'Land' : 'Ocean'}</b> <span style="color:#fa0">(pending)</span> · ${action} to undo`
        : `${dot} <b>${isOcean ? 'Ocean' : 'Land'}</b> plate · ${action} to ${isOcean ? 'raise land' : 'flood'}`);
    const pr = w.present, pl = pr?.plates[pr.regionPlate[r]];
    if (pl) {
        // (its speed here: the plate's rotation at this place, in Generate's frame)
        const e3 = pl.euler, xyz = w.tMesh.xyz, px = xyz[3 * r + 1], py = xyz[3 * r + 2], pz = xyz[3 * r];
        const cm = Math.hypot(e3[1] * pz - e3[2] * py, e3[2] * px - e3[0] * pz, e3[0] * py - e3[1] * px) * 6371 / 10;
        head.push(`<span class="hi-label">Plate</span> ${pl.index + 1} of ${pr.plates.length} (${pl.continental ? 'carries a continent' : 'ocean'}) · ${cm.toFixed(1)} cm/yr`);
        const crust = presentCrustLine(pr, r);
        if (crust) head.push(`<span class="hi-label">Crust</span> ${crust}`);
    }
    pv.hover(pv.readoutLines({ p, fin: pv.shows(w.fin), heightKm: w.heightKm[r], head, story: w.story, rec: w.regionCell[r] }));
}
function setHovered(piece) { if (piece !== hoveredPiece) { hoveredPiece = piece; dirty = true; } }
pv.onPointer(readout);
for (const el of [pv.ui.canvas, pv.ui.map]) {
    let down = null;
    el.addEventListener('pointerdown', (e) => {
        // (Ctrl-click, or Cmd-click on a Mac — where Firefox reports a Ctrl-click as a right-click; issue #19)
        const edit = ((e.ctrlKey || e.metaKey) && (e.button === 0 || e.button === 2)) || (e.button === 0 && IS_TOUCH && state.editMode);
        const at = edit && !building ? regionAt(e) : null;
        down = at ? { x: e.clientX, y: e.clientY, piece: world.r_plate[at.r] } : null;
    });
    el.addEventListener('pointerup', (e) => {
        if (!down) return;
        const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) >= 6, piece = down.piece;
        down = null;
        if (moved) return;
        if (pending.has(piece)) pending.delete(piece); else pending.add(piece);
        pendingChanged();
        readout(e);
    });
    el.addEventListener('contextmenu', (e) => { if (e.ctrlKey || e.metaKey) e.preventDefault(); });
}
addEventListener('keyup', (e) => { if ((e.key === 'Control' || e.key === 'Meta') && hoveredPiece >= 0) setHovered(-1); });
const rebuildFab = $('rebuildFab');
function pendingChanged() {
    dirty = true;
    rebuildFab.querySelector('span').textContent = `Rebuild (${pending.size})`;
    rebuildFab.style.display = pending.size ? '' : 'none';
}
function clearPending() { pending.clear(); pendingChanged(); }
addEventListener('keydown', (e) => { if (e.key === 'Escape' && pending.size) clearPending(); });
rebuildFab.addEventListener('click', () => {
    if (!pending.size || !world || building) return;
    for (const id of pending) { if (world.plateIsOcean.has(id)) world.plateIsOcean.delete(id); else world.plateIsOcean.add(id); }
    clearPending();
    building = 'edit'; finisher.cancel();
    $('generate').disabled = true; $('generate').textContent = 'Building…'; $('generate').classList.add('generating');
    pv.hover(['⏳ Rebuilding…']);
    worker.postMessage({ cmd: 'editRecompute', plateIsOcean: [...world.plateIsOcean], ...sliders() });
});
$('editToggle')?.addEventListener('click', () => { state.editMode = !state.editMode; $('editToggle').classList.toggle('active', state.editMode); if (!state.editMode) setHovered(-1); });

// ── the sliders: their values, the stale build button, Reapply, the climate ──
const sliderIds = ['sN', 'sP', 'sCn', 'sJ', 'sNs', 'sCsv', 'sLc'], PLATE_SLIDERS = ['sP', 'sCn', 'sCsv', 'sLc'], SCULPT = ['sTw', 'sS', 'sGl', 'sHEr', 'sTEr', 'sRs'];
let lastGenValues = {};
function snapshotSliders() { for (const id of sliderIds) lastGenValues[id] = $(id).value; }
function checkStale() {
    const btn = $('generate');
    if (btn.classList.contains('generating')) return;
    const plateChanged = PLATE_SLIDERS.some((id) => $(id).value !== lastGenValues[id]);
    const detailChanged = ['sN', 'sJ', 'sNs'].some((id) => $(id).value !== lastGenValues[id]);
    btn.classList.remove('stale', 'regen');
    if (plateChanged) { btn.classList.add('regen'); btn.textContent = 'Regenerate'; }
    else if (detailChanged) { btn.classList.add('stale'); btn.textContent = 'Rebuild'; }
    else btn.textContent = 'Build New World';
}
const reapplyBtn = $('reapplyBtn');
for (const s of ['sN', 'sP', 'sCn', 'sJ', 'sNs', 'sCsv', 'sLc', ...SCULPT, 'sTmp', 'sPrc']) {
    const slider = $(s), v = s.replace('s', 'v');
    sliderTooltip(slider);
    slider.addEventListener('input', (e) => {
        const val = +e.target.value;
        if (s === 'sN') { const d = detailFromSlider(val); $(v).textContent = d.toLocaleString(); detailWarning(d, IS_TOUCH); }
        else if (s === 'sTmp') $(v).textContent = `${val > 0 ? '+' : val === 0 ? '±' : '−'}${Math.abs(val)} W/m²`;
        else if (s === 'sPrc') { const pct = Math.round(val * 50); $(v).textContent = `${pct > 0 ? '+' : pct === 0 ? '±' : ''}${pct}%`; }
        else if (s === 'sLc') $(v).textContent = `${Math.round(val * 100)}%`;
        else $(v).textContent = e.target.value;
        if (SCULPT.includes(s)) { reapplyBtn.disabled = false; reapplyBtn.classList.add('ready'); }
        else if (s !== 'sTmp' && s !== 'sPrc') checkStale();
    });
    // (the climate: the finish again, with the ground it has — on release, not every step of a drag)
    if (s === 'sTmp' || s === 'sPrc') slider.addEventListener('change', () => { if (world) { updatePlanetCode(false); finish(world); } });
}
redrawFoldedSliders();
reapplyBtn.addEventListener('click', () => {
    if (reapplyBtn.disabled || !world || building) return;
    reapplyBtn.disabled = true; reapplyBtn.classList.remove('ready'); reapplyBtn.classList.add('spinning');
    building = 'reapply'; finisher.cancel();
    worker.postMessage({ cmd: 'reapply', ...sliders() });
});

// ── the build overlay ──
const overlay = buildOverlay();
const onProgress = (pct, label) => overlay.progress(pct, label), showBuildOverlay = () => overlay.show(), hideBuildOverlay = () => overlay.hide();

// ── Build New World, the planet code ──
const genBtn = $('generate'), seedInput = $('seedCode'), copyBtn = $('copyBtn'), loadBtn = $('loadBtn'), seedError = $('seedError');
let currentCode = '';
genBtn.addEventListener('click', () => {
    reapplyBtn.disabled = true; reapplyBtn.classList.remove('ready');
    panel.collapse();                                                // (a phone: the sheet down, the planet in view)
    // (Rebuild: the same seed and edits, only the resolution and noise; the plate sliders: a fresh world)
    const plateChanged = PLATE_SLIDERS.some((id) => $(id).value !== lastGenValues[id]);
    const rebuild = genBtn.classList.contains('stale') && world && !plateChanged;
    generate(rebuild ? world.seed : undefined, rebuild ? toggledIndices() : []);
});
/** The pieces edited, as indices into the layout's list (the planet code's toggles). */
function toggledIndices() {
    const w = world;
    if (!w) return [];
    const out = [];
    w.plateSeeds.forEach((r, i) => { if (w.originalPlateIsOcean.has(r) !== w.plateIsOcean.has(r)) out.push(i); });
    return out;
}
function updatePlanetCode(flash) {
    if (!world) return;
    const v = (id) => +$(id).value;
    currentCode = encodePlanetCode(world.seed, detailFromSlider(v('sN')), v('sJ'), v('sP'), v('sCn'), v('sNs'), v('sTw'), v('sS'), v('sGl'), v('sHEr'), v('sTEr'), v('sRs'), 0.75, v('sCsv'), v('sTmp'), v('sPrc'), v('sLc'), toggledIndices());
    seedInput.value = currentCode;
    loadBtn.classList.toggle('ready', false);
    history.replaceState(null, '', `${location.search}#${currentCode}`);
    if (flash) { seedInput.classList.add('flash'); seedInput.addEventListener('animationend', () => seedInput.classList.remove('flash'), { once: true }); }
}
copyBtn.addEventListener('click', () => {
    if (!seedInput.value) return;
    navigator.clipboard.writeText(seedInput.value).then(() => { copyBtn.textContent = '✓'; setTimeout(() => { copyBtn.textContent = '⎘'; }, 1200); });
});
seedInput.addEventListener('input', () => { const val = seedInput.value.trim().toLowerCase(); loadBtn.classList.toggle('ready', val.length > 0 && val !== currentCode); seedError.classList.remove('visible'); });
function setSlidersFrom(params) {
    const map = { sN: sliderFromDetail(params.N), sJ: params.jitter, sP: params.P, sCn: params.numContinents, sNs: params.roughness, sCsv: params.continentSizeVariety, sLc: params.landCoverage,
        sTw: params.terrainWarp, sS: params.smoothing, sGl: params.glacialErosion, sHEr: params.hydraulicErosion, sTEr: params.thermalErosion, sRs: params.ridgeSharpening, sTmp: params.greenhouse, sPrc: params.precipitationOffset };
    for (const [id, val] of Object.entries(map)) { const el = $(id); el.value = val; el.dispatchEvent(new Event('input')); }
}
function applyCode(code) {
    const params = decodePlanetCode(code);
    if (!params) {
        seedInput.style.borderColor = '#c44'; seedError.classList.add('visible');
        setTimeout(() => { seedInput.style.borderColor = ''; }, 1500);
        return;
    }
    seedError.classList.remove('visible');
    setSlidersFrom(params);
    reapplyBtn.disabled = true; reapplyBtn.classList.remove('ready');
    clearPending();
    generate(params.seed, params.toggledIndices);
}
loadBtn.addEventListener('click', () => applyCode(seedInput.value));
seedInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyCode(seedInput.value); });

// ── the Inspect list: the world's past, per region ──
inspectEl?.addEventListener('change', () => { if (inspectEl.value) pv.setLayer(`inspect:${inspectEl.value}`); else pv.setLayer('terrain'); });

// ── the export: Evolution's panel and maps, from the finished world ──
const code = () => currentCode || (world ? String(world.seed) : '');
// (and Generate's own row, the Plates: their colours, or each one's number — at the export's width and centre)
const PLATES_ROW = { id: 'plates', label: 'Plates', colour: true, data: [{ key: 'plateId', suffix: 'id', label: 'Plate number', scale: DATA_SCALES.plateId, bits: 8 }], tip: 'The plates in their colours, the boundaries by kind (the Plates view without its arrows); as data, each plate’s number' };
const CATALOGUE_WITH_PLATES = CATALOGUE.map((g) => (g.id === 'geology' ? { ...g, rows: [PLATES_ROW, ...g.rows] } : g));
function producePlates(rctx, job) {
    if (job.row.id !== 'plates' || !world) return null;
    const W = rctx.W, H = W >> 1, shift = rollShift(W, rctx.look.centerLon), colour = job.variant === 'colour';
    return { kind: colour ? 'rgba' : 'gray8', W, H, data: rollRows(platesMap(world, W, colour ? 'rgba' : 'id'), W, H, colour ? 4 : 1, shift) };
}
const exportPanel = initEvolutionExport({
    moment: () => (world?.fin ? { frame: world.story, fin: world.fin, seed: code(), cloudSeed: world.seed } : null),
    look: () => ({ lut: heightLutOf(view.palette), exaggeration: pv.SHADING.exaggeration, water: view.water, riverQ: view.riverQ, byRegime: view.byRegime, deposit: view.deposit }),
    centerLon: () => view.centerLon, projection: () => (view.mode === 'map' ? { id: view.projection, opts: view.projOpts } : null), isTouch: IS_TOUCH,
    fine: (fin, _seed, W, onProgress) => pv.detail.window(fin, world.seed, { W, x0: 0, y0: 0, w: W, h: W >> 1 }, null, onProgress),
    page: 'generate', titleNote: () => '', catalogue: CATALOGUE_WITH_PLATES, produceOwn: producePlates,
    names: (ctx, opts) => { const c = Math.round(opts.centerLon || 0); return { start: ['orogen', ctx.seed], end: [c ? `c${Math.abs(c)}${c > 0 ? 'E' : 'W'}` : null] }; },
    about: (ctx) => ({ page: 'Generate', planet: `planet code ${ctx.seed}`, link: `https://orogen.studio/generate#${ctx.seed}` }) });
$('exportBtn').addEventListener('click', () => {
    if (world?.fin) { exportPanel.open(); return; }
    // (the maps come from the finished world: a few seconds after the planet)
    pv.hover([world?.finishing ? `The maps are ready once the planet is finished — ${Math.round(100 * world.finishing.share)} %` : 'The maps are ready once the planet is finished']);
    setTimeout(() => pv.hover(null), 2500);
});

// ── stats ──
function stats(msg) {
    const w = world;
    $('stats').innerHTML = `Regions: ${w.n.toLocaleString()}<br>Plates: ${w.present?.plates.length ?? '–'} moving, ${w.plateSeeds.length} pieces` +
        (msg._workerTotal ? `<br>First picture in ${(msg._workerTotal / 1000).toFixed(1)} s` : '');
}

// ── the side panel: collapse on a desktop, a bottom sheet on a phone (as before) ──
const panel = sidePanel();
// (a phone's refresh button: two taps for a new world)
(function refreshFab() {
    const btn = $('refreshFab');
    if (!btn) return;
    let armed = false, timer = 0;
    const disarm = () => { armed = false; btn.classList.remove('armed'); clearTimeout(timer); };
    btn.addEventListener('click', () => {
        if (!armed) { armed = true; btn.classList.add('armed'); timer = setTimeout(disarm, 3000); return; }
        disarm();
        panel.collapse();
        generate(undefined, []);
    });
})();

// ── the tutorial, What's New and the survey (as before) ──
tutorial({ key: 'atlas-engine-tutorial-seen', firstDone: genBtn, isTouch: IS_TOUCH,
    touchStep2: '<strong>Drag</strong> to rotate the globe. <strong>Pinch</strong> to zoom in and out. Tap the <strong>edit button</strong> (pencil icon) then <strong>tap</strong> plates to mark them for reshaping &mdash; select multiple, then hit <strong>Rebuild</strong> to apply all at once. Tap again to undo a pending selection.' });
(function whatsNew() {
    const VERSION = '5', LS_KEY = 'wo-whatsnew-seen', overlay = $('whatsNewOverlay'), card = $('whatsNewCard');
    if (!overlay || !card) return;
    const steps = card.querySelectorAll('.whatsnew-step'), dots = card.querySelectorAll('.dot');
    let current = 0;
    const show = (i) => { current = i; steps.forEach((s, k) => s.classList.toggle('active', k === i)); dots.forEach((d, k) => d.classList.toggle('active', k === i)); $('whatsNewBack').disabled = i === 0; $('whatsNewNext').textContent = i === steps.length - 1 ? 'Got It' : 'Next'; card.scrollTop = 0; };
    const close = () => { overlay.classList.add('hidden'); store.set(LS_KEY, VERSION); };
    $('whatsNewNext').addEventListener('click', () => (current < steps.length - 1 ? show(current + 1) : close()));
    $('whatsNewBack').addEventListener('click', () => { if (current > 0) show(current - 1); });
    $('whatsNewClose').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && !overlay.classList.contains('hidden')) close(); });
    overlay.classList.add('hidden');
    if (store.get('atlas-engine-tutorial-seen') && store.get(LS_KEY) !== VERSION) genBtn.addEventListener('generate-done', () => { show(0); setTimeout(() => overlay.classList.remove('hidden'), 600); }, { once: true });
})();
(function survey() {
    const LS = 'wo-usage', LS_DISMISSED = 'wo-survey-dismissed';
    if (store.get(LS_DISMISSED)) return;
    const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36); };
    let data; try { data = JSON.parse(store.get(LS)) || {}; } catch { data = {}; }
    const now = new Date(), hourKey = hash(`${now.getFullYear()}-${now.getMonth()}-${now.getDate()}T${now.getHours()}`), dayKey = hash(`${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`);
    const hours = (data.h || 0) + (hourKey !== data.lh ? 1 : 0), days = (data.d || 0) + (dayKey !== data.ld ? 1 : 0);
    store.set(LS, JSON.stringify({ h: hours, d: days, lh: hourKey, ld: dayKey }));
    const overlay = $('surveyOverlay');
    if (hours < 3 || days < 2 || !overlay) return;
    const dismiss = () => { overlay.classList.add('hidden'); store.set(LS_DISMISSED, '1'); };
    genBtn.addEventListener('generate-done', () => setTimeout(() => overlay.classList.remove('hidden'), 1000), { once: true });
    for (const id of ['surveyClose', 'surveyDismiss', 'surveyLink']) $(id)?.addEventListener('click', dismiss);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) dismiss(); });
})();
// (the info line nudged once, after the first planet)
genBtn.addEventListener('generate-done', () => { const el = $('info'); el.classList.add('nudge'); el.addEventListener('animationend', () => el.classList.remove('nudge'), { once: true }); }, { once: true });

// ── go: the planet in the link, or a new one ──
const hashParams = location.hash.length > 1 ? decodePlanetCode(location.hash.slice(1).trim()) : null;
if (hashParams) { setSlidersFrom(hashParams); generate(hashParams.seed, hashParams.toggledIndices); }
else generate(undefined, []);
