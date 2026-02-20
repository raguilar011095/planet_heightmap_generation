// Planet generation — orchestrates the full geology pipeline.

import { makeRng } from './rng.js';
import { SimplexNoise } from './simplex-noise.js';
import { buildSphere, generateTriangleCenters } from './sphere-mesh.js';
import { generatePlates } from './plates.js';
import { assignOceanLand } from './ocean-land.js';
import { assignElevation } from './elevation.js';
import { computePlateColors, buildMesh } from './planet-mesh.js';
import { state } from './state.js';

export function generate() {
    const t0 = performance.now();
    const seed = Math.random() * 99999;
    const rng  = makeRng(seed);

    const N     = +document.getElementById('sN').value;
    const P     = +document.getElementById('sP').value;
    const jitter= +document.getElementById('sJ').value;
    const nMag  = +document.getElementById('sNs').value;
    const spread = 5;

    // 1. Build sphere mesh
    const t1 = performance.now();
    const { mesh, r_xyz } = buildSphere(N, jitter, rng);
    const tMesh = performance.now() - t1;

    // 2. Triangle centres
    const t_xyz = generateTriangleCenters(mesh, r_xyz);

    // 3. Plates
    const t2 = performance.now();
    const { r_plate, plateSeeds, plateVec } = generatePlates(mesh, r_xyz, P, seed);
    const tPlates = performance.now() - t2;

    // 4. Ocean / land
    const numContinents = +document.getElementById('sCn').value;
    const plateIsOcean = assignOceanLand(mesh, r_plate, plateSeeds, r_xyz, seed, numContinents);

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
    const { r_elevation, mountain_r, coastline_r, ocean_r, r_stress, debugLayers } =
        assignElevation(mesh, r_xyz, plateIsOcean, r_plate, plateVec, plateSeeds, noise, nMag, seed, spread, plateDensity);
    const tElev = performance.now() - t3;

    // 7. Triangle elevations
    const t_elevation = new Float32Array(mesh.numTriangles);
    for (let t = 0; t < mesh.numTriangles; t++) {
        const s0 = 3 * t;
        const a = mesh.s_begin_r(s0), b = mesh.s_begin_r(s0+1), c = mesh.s_begin_r(s0+2);
        t_elevation[t] = (r_elevation[a] + r_elevation[b] + r_elevation[c]) / 3;
    }

    state.curData = { mesh, r_xyz, t_xyz, r_plate, plateSeeds, plateVec, plateIsOcean,
                      plateDensity, plateDensityLand, plateDensityOcean,
                      r_elevation, t_elevation, mountain_r, coastline_r, ocean_r,
                      r_stress, noise, seed, debugLayers };

    const t4 = performance.now();
    buildMesh();
    const tBuild = performance.now() - t4;

    const ms = (performance.now() - t0).toFixed(0);
    document.getElementById('stats').innerHTML =
        `Regions: ${mesh.numRegions.toLocaleString()}<br>` +
        `Triangles: ${mesh.numTriangles.toLocaleString()}<br>` +
        `Plates: ${P}<br>Generated in ${ms} ms<br>` +
        `<span style="color:#445;font-size:10px">mesh ${tMesh.toFixed(0)} · plates ${tPlates.toFixed(0)} · elev ${tElev.toFixed(0)} · render ${tBuild.toFixed(0)}</span>`;
}
