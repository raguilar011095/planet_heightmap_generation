// Planet generation — orchestrates the full geology pipeline.

import { makeRng } from './rng.js';
import { SimplexNoise } from './simplex-noise.js';
import { buildSphere, generateTriangleCenters } from './sphere-mesh.js';
import { generatePlates } from './plates.js';
import { assignOceanLand } from './ocean-land.js';
import { assignElevation } from './elevation.js';
import { computePlateColors, buildMesh } from './planet-mesh.js';
import { state } from './state.js';
import { detailFromSlider } from './detail-scale.js';

export function generate(overrideSeed, toggledIndices = [], onProgress) {
    const btn = document.getElementById('generate');
    btn.disabled = true;
    btn.textContent = 'Building\u2026';
    btn.classList.add('generating');

    // Capture slider values before deferring so they're consistent
    const N     = detailFromSlider(+document.getElementById('sN').value);
    const P     = +document.getElementById('sP').value;
    const jitter= +document.getElementById('sJ').value;
    const nMag  = +document.getElementById('sNs').value;
    const numContinents = +document.getElementById('sCn').value;
    const spread = 5;

    // Shared context passed between stages
    const ctx = {};
    const progress = onProgress || (() => {});

    // Each stage: { pct, label, work }
    // The runner sets progress THEN yields a frame for the browser to paint,
    // THEN executes the work. This guarantees the label and bar are visible
    // before the heavy synchronous computation blocks the main thread.
    const stages = [
        { pct: 0,  label: 'Shaping the world\u2026', work() {
            ctx.t0 = performance.now();
            ctx.seed = overrideSeed ?? Math.floor(Math.random() * 16777216);
            ctx.rng  = makeRng(ctx.seed);

            const t1 = performance.now();
            const { mesh, r_xyz } = buildSphere(N, jitter, ctx.rng);
            ctx.tMesh = performance.now() - t1;
            ctx.mesh = mesh;
            ctx.r_xyz = r_xyz;

            const tTri0 = performance.now();
            ctx.t_xyz = generateTriangleCenters(mesh, r_xyz);
            ctx.tTriCenters = performance.now() - tTri0;
        }},
        { pct: 15, label: 'Forming tectonic plates\u2026', work() {
            const t2 = performance.now();
            const { r_plate, plateSeeds, plateVec } = generatePlates(ctx.mesh, ctx.r_xyz, P, ctx.seed);
            ctx.tPlates = performance.now() - t2;
            ctx.r_plate = r_plate;
            ctx.plateSeeds = plateSeeds;
            ctx.plateVec = plateVec;
        }},
        { pct: 25, label: 'Carving oceans\u2026', work() {
            const tOcean0 = performance.now();
            const plateIsOcean = assignOceanLand(ctx.mesh, ctx.r_plate, ctx.plateSeeds, ctx.r_xyz, ctx.seed, numContinents);
            ctx.tOcean = performance.now() - tOcean0;

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

            const plateDensity = {};
            const plateDensityLand = {};
            const plateDensityOcean = {};
            for (const r of ctx.plateSeeds) {
                const drng = makeRng(r + 777);
                plateDensityOcean[r] = 3.0 + drng() * 0.5;
                plateDensityLand[r] = 2.4 + drng() * 0.5;
                plateDensity[r] = plateIsOcean.has(r) ? plateDensityOcean[r] : plateDensityLand[r];
            }

            ctx.plateIsOcean = plateIsOcean;
            ctx.plateDensity = plateDensity;
            ctx.plateDensityLand = plateDensityLand;
            ctx.plateDensityOcean = plateDensityOcean;
            ctx.noise = new SimplexNoise(ctx.seed);
        }},
        { pct: 35, label: 'Raising mountains\u2026', work() {
            const t3 = performance.now();
            const { r_elevation, mountain_r, coastline_r, ocean_r, r_stress, debugLayers, _timing } =
                assignElevation(ctx.mesh, ctx.r_xyz, ctx.plateIsOcean, ctx.r_plate, ctx.plateVec, ctx.plateSeeds, ctx.noise, nMag, ctx.seed, spread, ctx.plateDensity);
            ctx.tElev = performance.now() - t3;
            ctx.r_elevation = r_elevation;
            ctx.mountain_r = mountain_r;
            ctx.coastline_r = coastline_r;
            ctx.ocean_r = ocean_r;
            ctx.r_stress = r_stress;
            ctx.debugLayers = debugLayers;
            ctx._timing = _timing;

            const tTriElev0 = performance.now();
            const t_elevation = new Float32Array(ctx.mesh.numTriangles);
            for (let t = 0; t < ctx.mesh.numTriangles; t++) {
                const s0 = 3 * t;
                const a = ctx.mesh.s_begin_r(s0), b = ctx.mesh.s_begin_r(s0+1), c = ctx.mesh.s_begin_r(s0+2);
                t_elevation[t] = (r_elevation[a] + r_elevation[b] + r_elevation[c]) / 3;
            }
            ctx.tTriElev = performance.now() - tTriElev0;
            ctx.t_elevation = t_elevation;
        }},
        { pct: 85, label: 'Painting the surface\u2026', work() {
            state.curData = { mesh: ctx.mesh, r_xyz: ctx.r_xyz, t_xyz: ctx.t_xyz,
                              r_plate: ctx.r_plate, plateSeeds: ctx.plateSeeds, plateVec: ctx.plateVec,
                              plateIsOcean: ctx.plateIsOcean, originalPlateIsOcean: ctx.originalPlateIsOcean,
                              plateDensity: ctx.plateDensity, plateDensityLand: ctx.plateDensityLand,
                              plateDensityOcean: ctx.plateDensityOcean,
                              r_elevation: ctx.r_elevation, t_elevation: ctx.t_elevation,
                              mountain_r: ctx.mountain_r, coastline_r: ctx.coastline_r, ocean_r: ctx.ocean_r,
                              r_stress: ctx.r_stress, noise: ctx.noise, seed: ctx.seed, debugLayers: ctx.debugLayers };

            const t4 = performance.now();
            buildMesh();
            const tBuild = performance.now() - t4;
            ctx.tBuild = tBuild;

            const tTotal = performance.now() - ctx.t0;

            // ---- Diagnostics ----
            {
                const mesh = ctx.mesh;
                let landCount = 0, nanCount = 0;
                for (let r = 0; r < mesh.numRegions; r++) {
                    if (!ctx.plateIsOcean.has(ctx.r_plate[r])) landCount++;
                    if (isNaN(ctx.r_elevation[r])) nanCount++;
                }
                const landPct = (100 * landCount / mesh.numRegions).toFixed(1);
                if (nanCount > 0) console.error(`[World Buildr] WARNING: ${nanCount} NaN elevation values detected!`);
                if (landCount / mesh.numRegions < 0.10) console.warn(`[World Buildr] WARNING: Only ${landPct}% land (${landCount} regions). Ocean/land growth may have stalled.`);
            }

            // ---- Console timing report ----
            const f = v => v.toFixed(1);
            console.log(
                `%c[World Buildr] Generation complete`,
                'color:#6cf;font-weight:bold'
            );
            console.log(
                `  Parameters: detail=${N}  plates=${P}  continents=${numContinents}  jitter=${jitter}  roughness=${nMag}  seed=${ctx.seed}`
            );
            console.log(
                `  Regions: ${ctx.mesh.numRegions.toLocaleString()}  Triangles: ${ctx.mesh.numTriangles.toLocaleString()}  Sides: ${ctx.mesh.numSides.toLocaleString()}`
            );

            const pipelineRows = [
                { stage: 'Sphere mesh',      ms: ctx.tMesh },
                { stage: 'Triangle centers', ms: ctx.tTriCenters },
                { stage: 'Plates',           ms: ctx.tPlates },
                { stage: 'Ocean/land',       ms: ctx.tOcean },
                { stage: 'Elevation (total)', ms: ctx.tElev },
                { stage: 'Triangle elevs',   ms: ctx.tTriElev },
                { stage: 'Render (buildMesh)', ms: tBuild },
            ];
            console.log('  Pipeline breakdown:');
            console.table(pipelineRows.map(r => ({ Stage: r.stage, 'ms': f(r.ms), '%': f(r.ms / tTotal * 100) + '%' })));

            if (ctx._timing) {
                console.log('  Elevation sub-stages:');
                console.table(ctx._timing.map(r => ({ Stage: r.stage, 'ms': f(r.ms), '%': f(r.ms / ctx.tElev * 100) + '%' })));
            }

            console.log(`  TOTAL: ${f(tTotal)} ms`);

            const ms = tTotal.toFixed(0);
            document.getElementById('stats').innerHTML =
                `Regions: ${ctx.mesh.numRegions.toLocaleString()}<br>` +
                `Triangles: ${ctx.mesh.numTriangles.toLocaleString()}<br>` +
                `Plates: ${P}<br>Generated in ${ms} ms<br>` +
                `<span style="color:#445;font-size:10px">mesh ${ctx.tMesh.toFixed(0)} · plates ${ctx.tPlates.toFixed(0)} · elev ${ctx.tElev.toFixed(0)} · render ${tBuild.toFixed(0)}</span>`;

            progress(100, 'Done');

            btn.disabled = false;
            btn.textContent = 'Build New World';
            btn.classList.remove('generating', 'stale');
            btn.dispatchEvent(new CustomEvent('generate-done'));
        }}
    ];

    function fail(err) {
        console.error('[World Buildr] Generation failed:', err);
        btn.disabled = false;
        btn.textContent = 'Build New World';
        btn.classList.remove('generating');
        progress(0, '');
    }

    // Runner: set progress → rAF (browser commits paint) → setTimeout (paint
    // flushes) → execute work → advance to next stage.
    function runStage(idx) {
        if (idx >= stages.length) return;
        const s = stages[idx];
        try { progress(s.pct, s.label); } catch (e) { return fail(e); }
        requestAnimationFrame(() => {
            setTimeout(() => {
                try {
                    s.work();
                    runStage(idx + 1);
                } catch (e) { fail(e); }
            }, 0);
        });
    }

    // Kick off — initial setTimeout lets the browser paint the button state
    setTimeout(() => runStage(0), 0);
}
