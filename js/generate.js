// Planet generation — orchestrates the full geology pipeline.

import { makeRng } from './rng.js';
import { SimplexNoise } from './simplex-noise.js';
import { buildSphere, generateTriangleCenters } from './sphere-mesh.js';
import { generatePlates } from './plates.js';
import { assignOceanLand } from './ocean-land.js';
import { assignElevation } from './elevation.js';
import { computePlateColors, buildMesh } from './planet-mesh.js';
import { state } from './state.js';

export function generate(overrideSeed, toggledIndices = []) {
    const btn = document.getElementById('generate');
    btn.disabled = true;
    btn.textContent = 'Building\u2026';
    btn.classList.add('generating');

    // Capture slider values before deferring so they're consistent
    const N     = +document.getElementById('sN').value;
    const P     = +document.getElementById('sP').value;
    const jitter= +document.getElementById('sJ').value;
    const nMag  = +document.getElementById('sNs').value;
    const numContinents = +document.getElementById('sCn').value;
    const spread = 5;

    // Defer heavy work so the browser can repaint the button state
    setTimeout(() => {
      try {
        const t0 = performance.now();
        const seed = overrideSeed ?? Math.floor(Math.random() * 16777216);
        const rng  = makeRng(seed);

        // 1. Build sphere mesh
        const t1 = performance.now();
        const { mesh, r_xyz } = buildSphere(N, jitter, rng);
        const tMesh = performance.now() - t1;

        // 2. Triangle centres
        const tTri0 = performance.now();
        const t_xyz = generateTriangleCenters(mesh, r_xyz);
        const tTriCenters = performance.now() - tTri0;

        // 3. Plates
        const t2 = performance.now();
        const { r_plate, plateSeeds, plateVec } = generatePlates(mesh, r_xyz, P, seed);
        const tPlates = performance.now() - t2;

        // 4. Ocean / land
        const tOcean0 = performance.now();
        const plateIsOcean = assignOceanLand(mesh, r_plate, plateSeeds, r_xyz, seed, numContinents);
        const tOcean = performance.now() - tOcean0;

        // Snapshot original ocean/land assignment before any toggles
        const originalPlateIsOcean = new Set(plateIsOcean);

        // 4a. Apply plate toggles from a loaded planet code
        if (toggledIndices.length > 0) {
            const seedArr = Array.from(plateSeeds);
            for (const i of toggledIndices) {
                if (i < seedArr.length) {
                    const r = seedArr[i];
                    if (plateIsOcean.has(r)) plateIsOcean.delete(r);
                    else plateIsOcean.add(r);
                }
            }
        }

        computePlateColors(plateSeeds, plateIsOcean);

        // 4b. Plate densities — pre-compute both land and ocean values per plate
        // so toggling land/sea in edit mode uses the correct density range.
        const plateDensity = {};
        const plateDensityLand = {};
        const plateDensityOcean = {};
        for (const r of plateSeeds) {
            const drng = makeRng(r + 777);
            plateDensityOcean[r] = 3.0 + drng() * 0.5;
            plateDensityLand[r] = 2.4 + drng() * 0.5;
            plateDensity[r] = plateIsOcean.has(r) ? plateDensityOcean[r] : plateDensityLand[r];
        }

        // 5. Noise generator
        const noise = new SimplexNoise(seed);

        // 6. Elevation
        const t3 = performance.now();
        const { r_elevation, mountain_r, coastline_r, ocean_r, r_stress, debugLayers, _timing } =
            assignElevation(mesh, r_xyz, plateIsOcean, r_plate, plateVec, plateSeeds, noise, nMag, seed, spread, plateDensity);
        const tElev = performance.now() - t3;

        // 7. Triangle elevations
        const tTriElev0 = performance.now();
        const t_elevation = new Float32Array(mesh.numTriangles);
        for (let t = 0; t < mesh.numTriangles; t++) {
            const s0 = 3 * t;
            const a = mesh.s_begin_r(s0), b = mesh.s_begin_r(s0+1), c = mesh.s_begin_r(s0+2);
            t_elevation[t] = (r_elevation[a] + r_elevation[b] + r_elevation[c]) / 3;
        }
        const tTriElev = performance.now() - tTriElev0;

        state.curData = { mesh, r_xyz, t_xyz, r_plate, plateSeeds, plateVec, plateIsOcean,
                          originalPlateIsOcean,
                          plateDensity, plateDensityLand, plateDensityOcean,
                          r_elevation, t_elevation, mountain_r, coastline_r, ocean_r,
                          r_stress, noise, seed, debugLayers };

        const t4 = performance.now();
        buildMesh();
        const tBuild = performance.now() - t4;

        const tTotal = performance.now() - t0;

        // ---- Diagnostics ----
        {
            let landCount = 0, nanCount = 0;
            for (let r = 0; r < mesh.numRegions; r++) {
                if (!plateIsOcean.has(r_plate[r])) landCount++;
                if (isNaN(r_elevation[r])) nanCount++;
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
            `  Parameters: detail=${N}  plates=${P}  continents=${numContinents}  jitter=${jitter}  roughness=${nMag}  seed=${seed}`
        );
        console.log(
            `  Regions: ${mesh.numRegions.toLocaleString()}  Triangles: ${mesh.numTriangles.toLocaleString()}  Sides: ${mesh.numSides.toLocaleString()}`
        );

        const pipelineRows = [
            { stage: 'Sphere mesh',      ms: tMesh },
            { stage: 'Triangle centers', ms: tTriCenters },
            { stage: 'Plates',           ms: tPlates },
            { stage: 'Ocean/land',       ms: tOcean },
            { stage: 'Elevation (total)', ms: tElev },
            { stage: 'Triangle elevs',   ms: tTriElev },
            { stage: 'Render (buildMesh)', ms: tBuild },
        ];
        console.log('  Pipeline breakdown:');
        console.table(pipelineRows.map(r => ({ Stage: r.stage, 'ms': f(r.ms), '%': f(r.ms / tTotal * 100) + '%' })));

        if (_timing) {
            console.log('  Elevation sub-stages:');
            console.table(_timing.map(r => ({ Stage: r.stage, 'ms': f(r.ms), '%': f(r.ms / tElev * 100) + '%' })));
        }

        console.log(`  TOTAL: ${f(tTotal)} ms`);

        const ms = tTotal.toFixed(0);
        document.getElementById('stats').innerHTML =
            `Regions: ${mesh.numRegions.toLocaleString()}<br>` +
            `Triangles: ${mesh.numTriangles.toLocaleString()}<br>` +
            `Plates: ${P}<br>Generated in ${ms} ms<br>` +
            `<span style="color:#445;font-size:10px">mesh ${tMesh.toFixed(0)} · plates ${tPlates.toFixed(0)} · elev ${tElev.toFixed(0)} · render ${tBuild.toFixed(0)}</span>`;

        btn.disabled = false;
        btn.textContent = 'Build New World';
        btn.classList.remove('generating', 'stale');
        btn.dispatchEvent(new CustomEvent('generate-done'));
      } catch (err) {
        console.error('[World Buildr] Generation failed:', err);
        btn.disabled = false;
        btn.textContent = 'Build New World';
        btn.classList.remove('generating');
      }
    }, 16);
}
