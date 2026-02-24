// Planet generation — dispatches work to a Web Worker, falls back to
// synchronous main-thread generation if module workers aren't supported.

import Delaunator from 'delaunator';
import { setDelaunator, SphereMesh } from './sphere-mesh.js';
import { computePlateColors, buildMesh } from './planet-mesh.js';
import { state } from './state.js';
import { detailFromSlider } from './detail-scale.js';

// Main thread still needs Delaunator for SphereMesh reconstruction
setDelaunator(Delaunator);

// --- Worker setup ---
let worker = null;
let workerSupported = true;
try {
    worker = new Worker(new URL('./planet-worker.js', import.meta.url), { type: 'module' });
} catch (e) {
    console.warn('[Atlas Engine] Module workers not supported, falling back to main thread:', e);
    workerSupported = false;
}

// Active callback state
let _onProgress = null;
let _onDone = null;
let _t0 = 0;

function resetUI() {
    const btn = document.getElementById('generate');
    btn.disabled = false;
    btn.textContent = 'Build New World';
    btn.classList.remove('generating', 'stale');
}

function fail(err) {
    console.error('[Atlas Engine] Generation failed:', err);
    resetUI();
    if (_onProgress) _onProgress(0, '');
}

// Reconstruct SphereMesh from transferred data
function reconstructMesh(triangles, halfedges, numRegions) {
    return new SphereMesh(triangles, halfedges, numRegions);
}

if (worker) {
    worker.onmessage = (e) => {
        const msg = e.data;
        switch (msg.type) {
            case 'progress':
                if (_onProgress) _onProgress(msg.pct, msg.label);
                break;

            case 'done': {
                const tMainStart = performance.now();

                const tReconStart = performance.now();
                const mesh = reconstructMesh(msg.triangles, msg.halfedges, msg.numRegions);
                const tRecon = performance.now() - tReconStart;

                const tColorsStart = performance.now();
                computePlateColors(new Set(msg.plateSeeds), new Set(msg.plateIsOcean));
                const tColors = performance.now() - tColorsStart;

                const tStateStart = performance.now();
                state.curData = {
                    mesh,
                    r_xyz: msg.r_xyz,
                    t_xyz: msg.t_xyz,
                    r_plate: msg.r_plate,
                    plateSeeds: new Set(msg.plateSeeds),
                    plateVec: msg.plateVec,
                    plateIsOcean: new Set(msg.plateIsOcean),
                    originalPlateIsOcean: new Set(msg.originalPlateIsOcean),
                    plateDensity: msg.plateDensity,
                    plateDensityLand: msg.plateDensityLand,
                    plateDensityOcean: msg.plateDensityOcean,
                    prePostElev: msg.prePostElev,
                    r_elevation: msg.r_elevation,
                    t_elevation: msg.t_elevation,
                    mountain_r: new Set(msg.mountain_r),
                    coastline_r: new Set(msg.coastline_r),
                    ocean_r: new Set(msg.ocean_r),
                    r_stress: msg.r_stress,
                    seed: msg.seed,
                    nMag: msg.nMag,
                    debugLayers: msg.debugLayers
                };
                const tState = performance.now() - tStateStart;

                const tBuildStart = performance.now();
                buildMesh();
                const tBuild = performance.now() - tBuildStart;

                const tMainTotal = performance.now() - tMainStart;
                const tTotal = performance.now() - _t0;

                // Diagnostics
                {
                    let landCount = 0, nanCount = 0;
                    const plateIsOcean = state.curData.plateIsOcean;
                    const r_plate = state.curData.r_plate;
                    const r_elevation = state.curData.r_elevation;
                    for (let r = 0; r < mesh.numRegions; r++) {
                        if (!plateIsOcean.has(r_plate[r])) landCount++;
                        if (isNaN(r_elevation[r])) nanCount++;
                    }
                    const landPct = (100 * landCount / mesh.numRegions).toFixed(1);
                    if (nanCount > 0) console.error(`[Atlas Engine] WARNING: ${nanCount} NaN elevation values detected!`);
                    if (landCount / mesh.numRegions < 0.10) console.warn(`[Atlas Engine] WARNING: Only ${landPct}% land (${landCount} regions). Ocean/land growth may have stalled.`);
                }

                const f = v => typeof v === 'number' ? v.toFixed(1) : v;

                console.log(`%c[Atlas Engine] Generation complete`, 'color:#6cf;font-weight:bold');
                if (msg._params) {
                    console.log(`  Params: N=${msg._params.N.toLocaleString()} P=${msg._params.P} jitter=${msg._params.jitter} noise=${msg._params.nMag} continents=${msg._params.numContinents} seed=${msg._params.seed}`);
                    console.log(`  Sculpting: smooth=${msg._params.smoothing} glacial=${msg._params.glacialErosion} hydraulic=${msg._params.hydraulicErosion} thermal=${msg._params.thermalErosion} ridge=${msg._params.ridgeSharpening}`);
                }
                console.log(`  Regions: ${mesh.numRegions.toLocaleString()}  Triangles: ${mesh.numTriangles.toLocaleString()}  Sides: ${mesh.numSides.toLocaleString()}`);

                // Worker pipeline stages
                if (msg._pipelineTiming) {
                    console.groupCollapsed('  %cWorker pipeline stages', 'color:#8cf');
                    console.table(msg._pipelineTiming.map(r => ({ Stage: r.stage, 'ms': f(r.ms) })));
                    console.groupEnd();
                }

                // Elevation sub-stages
                if (msg._timing) {
                    console.groupCollapsed('  %cElevation sub-stages', 'color:#fc8');
                    console.table(msg._timing.map(r => ({ Stage: r.stage, 'ms': f(r.ms) })));
                    console.groupEnd();
                }

                // Post-processing sub-stages
                if (msg._postTiming && msg._postTiming.length > 0) {
                    console.groupCollapsed('  %cPost-processing sub-stages', 'color:#8f8');
                    console.table(msg._postTiming.map(r => ({ Stage: r.stage, 'ms': f(r.ms) })));
                    console.groupEnd();
                }

                // Summary
                const tWorker = msg._workerTotal || 0;
                const tTransfer = tTotal - tWorker - tMainTotal;
                console.log(
                    `  %cSummary:%c Worker: ${f(tWorker)} ms | Transfer: ${f(tTransfer)} ms | Main thread: ${f(tMainTotal)} ms (reconstruct=${f(tRecon)}, colors=${f(tColors)}, state=${f(tState)}, buildMesh=${f(tBuild)}) | TOTAL: ${f(tTotal)} ms`,
                    'color:#ff6;font-weight:bold', ''
                );

                const ms = tTotal.toFixed(0);
                document.getElementById('stats').innerHTML =
                    `Regions: ${mesh.numRegions.toLocaleString()}<br>` +
                    `Triangles: ${mesh.numTriangles.toLocaleString()}<br>` +
                    `Generated in ${ms} ms<br>` +
                    `<span style="color:#445;font-size:10px">worker ${tWorker.toFixed(0)} · render ${tBuild.toFixed(0)}</span>`;

                if (_onProgress) _onProgress(100, 'Done');
                resetUI();
                document.getElementById('generate').dispatchEvent(new CustomEvent('generate-done'));
                if (_onDone) { _onDone(); _onDone = null; }
                break;
            }

            case 'reapplyDone': {
                const tMainStart = performance.now();
                const d = state.curData;
                d.r_elevation = msg.r_elevation;
                d.t_elevation = msg.t_elevation;
                d.debugLayers.erosionDelta = msg.erosionDelta;

                const tBuildStart = performance.now();
                buildMesh();
                const tBuild = performance.now() - tBuildStart;

                const tMainTotal = performance.now() - tMainStart;

                const f = v => typeof v === 'number' ? v.toFixed(1) : v;
                const rt = msg._reapplyTiming || {};
                console.log(`%c[Atlas Engine] Reapply complete`, 'color:#8f8;font-weight:bold');
                if (msg._postTiming && msg._postTiming.length > 0) {
                    console.groupCollapsed('  %cPost-processing sub-stages', 'color:#8f8');
                    console.table(msg._postTiming.map(r => ({ Stage: r.stage, 'ms': f(r.ms) })));
                    console.groupEnd();
                }
                console.log(
                    `  %cSummary:%c Worker: ${f(rt.workerTotal || 0)} ms (clone=${f(rt.clone || 0)}, postProcess=${f(rt.postProcessing || 0)}, triElev=${f(rt.triangleElevations || 0)}) | Main: ${f(tMainTotal)} ms (buildMesh=${f(tBuild)})`,
                    'color:#ff6;font-weight:bold', ''
                );

                if (_onProgress) _onProgress(100, 'Done');
                if (_onDone) { _onDone(); _onDone = null; }
                break;
            }

            case 'editDone': {
                const tMainStart = performance.now();
                const d = state.curData;
                d.prePostElev = msg.prePostElev;
                d.r_elevation = msg.r_elevation;
                d.t_elevation = msg.t_elevation;
                d.mountain_r = new Set(msg.mountain_r);
                d.coastline_r = new Set(msg.coastline_r);
                d.ocean_r = new Set(msg.ocean_r);
                d.r_stress = msg.r_stress;
                d.debugLayers = msg.debugLayers;

                const tColorsStart = performance.now();
                computePlateColors(d.plateSeeds, d.plateIsOcean);
                const tColors = performance.now() - tColorsStart;

                const tBuildStart = performance.now();
                buildMesh();
                const tBuild = performance.now() - tBuildStart;

                const tMainTotal = performance.now() - tMainStart;

                const f = v => typeof v === 'number' ? v.toFixed(1) : v;
                const et = msg._editTiming || {};
                console.log(`%c[Atlas Engine] Edit recompute complete`, 'color:#fc8;font-weight:bold');

                if (msg._timing) {
                    console.groupCollapsed('  %cElevation sub-stages', 'color:#fc8');
                    console.table(msg._timing.map(r => ({ Stage: r.stage, 'ms': f(r.ms) })));
                    console.groupEnd();
                }
                if (msg._postTiming && msg._postTiming.length > 0) {
                    console.groupCollapsed('  %cPost-processing sub-stages', 'color:#8f8');
                    console.table(msg._postTiming.map(r => ({ Stage: r.stage, 'ms': f(r.ms) })));
                    console.groupEnd();
                }
                console.log(
                    `  %cSummary:%c Worker: ${f(et.workerTotal || 0)} ms (elevation=${f(et.elevation || 0)}, postProcess=${f(et.postProcessing || 0)}, triElev=${f(et.triangleElevations || 0)}, retain=${f(et.retainState || 0)}) | Main: ${f(tMainTotal)} ms (colors=${f(tColors)}, buildMesh=${f(tBuild)})`,
                    'color:#ff6;font-weight:bold', ''
                );

                if (_onProgress) _onProgress(100, 'Done');
                if (_onDone) { _onDone(); _onDone = null; }
                break;
            }

            case 'error':
                fail(msg.message);
                if (_onDone) { _onDone(); _onDone = null; }
                break;
        }
    };

    worker.onerror = (e) => {
        fail(e.message || 'Worker crashed');
        if (_onDone) { _onDone(); _onDone = null; }
    };
}

// --- Synchronous fallback (imported lazily to avoid loading when worker works) ---
let _fallbackModules = null;
async function loadFallback() {
    if (_fallbackModules) return _fallbackModules;
    const [rng, simplex, sphere, plates, ocean, elev, post] = await Promise.all([
        import('./rng.js'),
        import('./simplex-noise.js'),
        import('./sphere-mesh.js'),
        import('./plates.js'),
        import('./ocean-land.js'),
        import('./elevation.js'),
        import('./terrain-post.js')
    ]);
    _fallbackModules = { rng, simplex, sphere, plates, ocean, elev, post };
    return _fallbackModules;
}

function generateFallback(overrideSeed, toggledIndices, onProgress) {
    // Dynamic import already resolved — run synchronously via rAF stages
    const m = _fallbackModules;
    const btn = document.getElementById('generate');
    const N = detailFromSlider(+document.getElementById('sN').value);
    const P = +document.getElementById('sP').value;
    const jitter = +document.getElementById('sJ').value;
    const nMag = +document.getElementById('sNs').value;
    const numContinents = +document.getElementById('sCn').value;
    const smoothing = +document.getElementById('sS').value;
    const hydraulicErosion = +document.getElementById('sHEr').value;
    const thermalErosion = +document.getElementById('sTEr').value;
    const ridgeSharpening = +document.getElementById('sRs').value;
    const glacialErosion = +document.getElementById('sGl').value;
    const progress = onProgress || (() => {});
    const ctx = {};

    const stages = [
        { pct: 0, label: 'Shaping the world\u2026', work() {
            ctx.seed = overrideSeed ?? Math.floor(Math.random() * 16777216);
            ctx.rng = m.rng.makeRng(ctx.seed);
            const { mesh, r_xyz } = m.sphere.buildSphere(N, jitter, ctx.rng);
            ctx.mesh = mesh; ctx.r_xyz = r_xyz;
            ctx.t_xyz = m.sphere.generateTriangleCenters(mesh, r_xyz);
        }},
        { pct: 15, label: 'Forming tectonic plates\u2026', work() {
            const { r_plate, plateSeeds, plateVec } = m.plates.generatePlates(ctx.mesh, ctx.r_xyz, P, ctx.seed);
            ctx.r_plate = r_plate; ctx.plateSeeds = plateSeeds; ctx.plateVec = plateVec;
        }},
        { pct: 25, label: 'Carving oceans\u2026', work() {
            const plateIsOcean = m.ocean.assignOceanLand(ctx.mesh, ctx.r_plate, ctx.plateSeeds, ctx.r_xyz, ctx.seed, numContinents);
            ctx.originalPlateIsOcean = new Set(plateIsOcean);
            if (toggledIndices.length > 0) {
                const seedArr = Array.from(ctx.plateSeeds);
                for (const i of toggledIndices) {
                    if (i < seedArr.length) {
                        const r = seedArr[i];
                        if (plateIsOcean.has(r)) plateIsOcean.delete(r);
                        else plateIsOcean.add(r);
                    }
                }
            }
            computePlateColors(ctx.plateSeeds, plateIsOcean);
            const plateDensity = {}, plateDensityLand = {}, plateDensityOcean = {};
            for (const r of ctx.plateSeeds) {
                const drng = m.rng.makeRng(r + 777);
                plateDensityOcean[r] = 3.0 + drng() * 0.5;
                plateDensityLand[r] = 2.4 + drng() * 0.5;
                plateDensity[r] = plateIsOcean.has(r) ? plateDensityOcean[r] : plateDensityLand[r];
            }
            ctx.plateIsOcean = plateIsOcean; ctx.plateDensity = plateDensity;
            ctx.plateDensityLand = plateDensityLand; ctx.plateDensityOcean = plateDensityOcean;
            ctx.noise = new m.simplex.SimplexNoise(ctx.seed);
        }},
        { pct: 35, label: 'Raising mountains\u2026', work() {
            const { r_elevation, mountain_r, coastline_r, ocean_r, r_stress, debugLayers, _timing } =
                m.elev.assignElevation(ctx.mesh, ctx.r_xyz, ctx.plateIsOcean, ctx.r_plate, ctx.plateVec, ctx.plateSeeds, ctx.noise, nMag, ctx.seed, 5, ctx.plateDensity);
            ctx.r_elevation = r_elevation; ctx.mountain_r = mountain_r; ctx.coastline_r = coastline_r;
            ctx.ocean_r = ocean_r; ctx.r_stress = r_stress; ctx.debugLayers = debugLayers;
            ctx.prePostElev = new Float32Array(r_elevation);
            const r_isOcean = new Uint8Array(ctx.mesh.numRegions);
            for (let r = 0; r < ctx.mesh.numRegions; r++) { if (r_elevation[r] <= 0) r_isOcean[r] = 1; }
            const preErosion = new Float32Array(r_elevation);
            if (smoothing > 0) m.post.smoothElevation(ctx.mesh, r_elevation, r_isOcean, Math.round(1 + smoothing * 4), 0.2 + smoothing * 0.5);
            if (glacialErosion > 0 || hydraulicErosion > 0 || thermalErosion > 0)
                m.post.erodeComposite(ctx.mesh, r_elevation, ctx.r_xyz, r_isOcean, Math.round(hydraulicErosion * 20), hydraulicErosion * 0.001, 0.5, 1.0, Math.round(thermalErosion * 10), 1.2 - thermalErosion * 0.4, thermalErosion * 0.15, Math.round(glacialErosion * 10), glacialErosion);
            if (ridgeSharpening > 0) m.post.sharpenRidges(ctx.mesh, r_elevation, r_isOcean, Math.round(1 + ridgeSharpening * 3), ridgeSharpening * 0.08);
            m.post.applySoilCreep(ctx.mesh, r_elevation, r_isOcean, 3, 0.1125);
            const dl_erosionDelta = new Float32Array(ctx.mesh.numRegions);
            for (let r = 0; r < ctx.mesh.numRegions; r++) dl_erosionDelta[r] = r_elevation[r] - preErosion[r];
            debugLayers.erosionDelta = dl_erosionDelta;
            const t_elevation = new Float32Array(ctx.mesh.numTriangles);
            for (let t = 0; t < ctx.mesh.numTriangles; t++) {
                const s0 = 3 * t;
                const a = ctx.mesh.s_begin_r(s0), b = ctx.mesh.s_begin_r(s0+1), c = ctx.mesh.s_begin_r(s0+2);
                t_elevation[t] = (r_elevation[a] + r_elevation[b] + r_elevation[c]) / 3;
            }
            ctx.t_elevation = t_elevation;
        }},
        { pct: 85, label: 'Painting the surface\u2026', work() {
            state.curData = {
                mesh: ctx.mesh, r_xyz: ctx.r_xyz, t_xyz: ctx.t_xyz,
                r_plate: ctx.r_plate, plateSeeds: ctx.plateSeeds, plateVec: ctx.plateVec,
                plateIsOcean: ctx.plateIsOcean, originalPlateIsOcean: ctx.originalPlateIsOcean,
                plateDensity: ctx.plateDensity, plateDensityLand: ctx.plateDensityLand,
                plateDensityOcean: ctx.plateDensityOcean, prePostElev: ctx.prePostElev,
                r_elevation: ctx.r_elevation, t_elevation: ctx.t_elevation,
                mountain_r: ctx.mountain_r, coastline_r: ctx.coastline_r, ocean_r: ctx.ocean_r,
                r_stress: ctx.r_stress, noise: ctx.noise, seed: ctx.seed, debugLayers: ctx.debugLayers
            };
            buildMesh();
            progress(100, 'Done');
            resetUI();
            btn.dispatchEvent(new CustomEvent('generate-done'));
        }}
    ];

    function runStage(idx) {
        if (idx >= stages.length) return;
        const s = stages[idx];
        try { progress(s.pct, s.label); } catch (e) { fail(e); return; }
        requestAnimationFrame(() => setTimeout(() => {
            try { s.work(); runStage(idx + 1); } catch (e) { fail(e); }
        }, 0));
    }
    setTimeout(() => runStage(0), 0);
}

// --- Public API ---

export function generate(overrideSeed, toggledIndices = [], onProgress) {
    const btn = document.getElementById('generate');
    btn.disabled = true;
    btn.textContent = 'Building\u2026';
    btn.classList.add('generating');

    _onProgress = onProgress || (() => {});
    _t0 = performance.now();

    if (!worker) {
        // Fallback: load modules then run synchronously
        loadFallback().then(() => generateFallback(overrideSeed, toggledIndices, onProgress));
        return;
    }

    const N = detailFromSlider(+document.getElementById('sN').value);
    const P = +document.getElementById('sP').value;
    const jitter = +document.getElementById('sJ').value;
    const nMag = +document.getElementById('sNs').value;
    const numContinents = +document.getElementById('sCn').value;
    const smoothing = +document.getElementById('sS').value;
    const hydraulicErosion = +document.getElementById('sHEr').value;
    const thermalErosion = +document.getElementById('sTEr').value;
    const ridgeSharpening = +document.getElementById('sRs').value;
    const glacialErosion = +document.getElementById('sGl').value;

    worker.postMessage({
        cmd: 'generate',
        N, P, jitter, nMag, numContinents,
        smoothing, hydraulicErosion, thermalErosion, ridgeSharpening, glacialErosion,
        seed: overrideSeed,
        toggledIndices
    });
}

export function reapplyViaWorker(onDone) {
    if (!worker || !state.curData) return;

    _onProgress = (pct, label) => {
        // Progress updates during reapply (used by build overlay if shown)
    };
    _onDone = onDone || null;
    _t0 = performance.now();

    worker.postMessage({
        cmd: 'reapply',
        smoothing: +document.getElementById('sS').value,
        glacialErosion: +document.getElementById('sGl').value,
        hydraulicErosion: +document.getElementById('sHEr').value,
        thermalErosion: +document.getElementById('sTEr').value,
        ridgeSharpening: +document.getElementById('sRs').value
    });
}

export function editRecomputeViaWorker(onDone) {
    if (!worker || !state.curData) return;

    const d = state.curData;
    _onProgress = () => {};
    _onDone = onDone || null;
    _t0 = performance.now();

    worker.postMessage({
        cmd: 'editRecompute',
        plateIsOcean: Array.from(d.plateIsOcean),
        plateDensity: d.plateDensity,
        nMag: +document.getElementById('sNs').value,
        smoothing: +document.getElementById('sS').value,
        glacialErosion: +document.getElementById('sGl').value,
        hydraulicErosion: +document.getElementById('sHEr').value,
        thermalErosion: +document.getElementById('sTEr').value,
        ridgeSharpening: +document.getElementById('sRs').value
    });
}
