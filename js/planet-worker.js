// Web Worker — runs the pure computation pipeline off the main thread.
// Handles: generate, reapply, editRecompute commands.

import { makeRng } from './rng.js';
import { SimplexNoise } from './simplex-noise.js';
import { setDelaunator, buildSphere, generateTriangleCenters, SphereMesh, computeNeighborDist } from './sphere-mesh.js';
import { generatePlates } from './plates.js';
import { assignOceanLand } from './ocean-land.js';
import { assignElevation } from './elevation.js';
import { smoothElevation, erodeComposite, sharpenRidges, applySoilCreep } from './terrain-post.js';
import Delaunator from 'https://cdn.jsdelivr.net/npm/delaunator@5.0.1/+esm';

setDelaunator(Delaunator);

// Retained state between commands (avoids re-sending mesh for reapply/edit)
let W = null;

function progress(pct, label) {
    self.postMessage({ type: 'progress', pct, label });
}

// Compute triangle elevations from region elevations
function computeTriangleElevations(mesh, r_elevation) {
    const t_elevation = new Float32Array(mesh.numTriangles);
    for (let t = 0; t < mesh.numTriangles; t++) {
        const s0 = 3 * t;
        const a = mesh.s_begin_r(s0), b = mesh.s_begin_r(s0 + 1), c = mesh.s_begin_r(s0 + 2);
        t_elevation[t] = (r_elevation[a] + r_elevation[b] + r_elevation[c]) / 3;
    }
    return t_elevation;
}

// Run terrain post-processing with per-step timing
function runPostProcessing(mesh, r_xyz, r_elevation, params, neighborDist) {
    const { smoothing, glacialErosion, hydraulicErosion, thermalErosion, ridgeSharpening } = params;
    const timing = [];

    const r_isOcean = new Uint8Array(mesh.numRegions);
    for (let r = 0; r < mesh.numRegions; r++) {
        if (r_elevation[r] <= 0) r_isOcean[r] = 1;
    }

    const preErosion = new Float32Array(r_elevation);

    if (smoothing > 0) {
        const smoothIters = Math.round(1 + smoothing * 4);
        const smoothStr = 0.2 + smoothing * 0.5;
        const t0 = performance.now();
        smoothElevation(mesh, r_elevation, r_isOcean, smoothIters, smoothStr);
        timing.push({ stage: `Smoothing (${smoothIters} iters, str=${smoothStr.toFixed(2)})`, ms: performance.now() - t0 });
    }

    if (glacialErosion > 0 || hydraulicErosion > 0 || thermalErosion > 0) {
        const gIters = Math.round(glacialErosion * 10);
        const hIters = Math.round(hydraulicErosion * 20);
        const hK = hydraulicErosion * 0.001;
        const tIters = Math.round(thermalErosion * 10);
        const talusSlope = 1.2 - thermalErosion * 0.4;
        const kThermal = thermalErosion * 0.15;
        const t0 = performance.now();
        erodeComposite(mesh, r_elevation, r_xyz, r_isOcean,
            hIters, hK, 0.5, 1.0,
            tIters, talusSlope, kThermal,
            gIters, glacialErosion,
            neighborDist);
        timing.push({ stage: `Erosion composite (h=${hIters}, t=${tIters}, g=${gIters})`, ms: performance.now() - t0 });
    }

    if (ridgeSharpening > 0) {
        const rsIters = Math.round(1 + ridgeSharpening * 3);
        const rsStr = ridgeSharpening * 0.08;
        const t0 = performance.now();
        sharpenRidges(mesh, r_elevation, r_isOcean, rsIters, rsStr);
        timing.push({ stage: `Ridge sharpening (${rsIters} iters)`, ms: performance.now() - t0 });
    }

    {
        const t0 = performance.now();
        applySoilCreep(mesh, r_elevation, r_isOcean, 3, 0.1125);
        timing.push({ stage: 'Soil creep (3 iters)', ms: performance.now() - t0 });
    }

    const dl_erosionDelta = new Float32Array(mesh.numRegions);
    for (let r = 0; r < mesh.numRegions; r++) {
        dl_erosionDelta[r] = r_elevation[r] - preErosion[r];
    }

    return { dl_erosionDelta, postTiming: timing };
}

function handleGenerate(data) {
    const { N, P, jitter, nMag, numContinents, smoothing, hydraulicErosion, thermalErosion, ridgeSharpening, glacialErosion, seed: overrideSeed, toggledIndices } = data;
    const spread = 5;
    const timing = []; // top-level pipeline timing

    try {
        const tTotal0 = performance.now();

        progress(0, 'Shaping the world\u2026');
        const seed = overrideSeed ?? Math.floor(Math.random() * 16777216);
        const rng = makeRng(seed);

        let t0 = performance.now();
        const { mesh, r_xyz } = buildSphere(N, jitter, rng);
        timing.push({ stage: 'Sphere mesh (Fibonacci + Delaunay + pole)', ms: performance.now() - t0 });

        t0 = performance.now();
        const neighborDist = computeNeighborDist(mesh, r_xyz);
        timing.push({ stage: 'Neighbor distances', ms: performance.now() - t0 });

        t0 = performance.now();
        const t_xyz = generateTriangleCenters(mesh, r_xyz);
        timing.push({ stage: 'Triangle centers', ms: performance.now() - t0 });

        progress(15, 'Forming tectonic plates\u2026');
        t0 = performance.now();
        const { r_plate, plateSeeds, plateVec } = generatePlates(mesh, r_xyz, P, seed);
        timing.push({ stage: `Plates (${P} plates)`, ms: performance.now() - t0 });

        progress(25, 'Carving oceans\u2026');
        t0 = performance.now();
        const plateIsOcean = assignOceanLand(mesh, r_plate, plateSeeds, r_xyz, seed, numContinents);
        timing.push({ stage: `Ocean/land (${numContinents} continents)`, ms: performance.now() - t0 });

        const originalPlateIsOcean = new Set(plateIsOcean);

        if (toggledIndices && toggledIndices.length > 0) {
            const seedArr = Array.from(plateSeeds);
            for (const i of toggledIndices) {
                if (i < seedArr.length) {
                    const r = seedArr[i];
                    if (plateIsOcean.has(r)) plateIsOcean.delete(r);
                    else plateIsOcean.add(r);
                }
            }
        }

        const plateDensity = {};
        const plateDensityLand = {};
        const plateDensityOcean = {};
        for (const r of plateSeeds) {
            const drng = makeRng(r + 777);
            plateDensityOcean[r] = 3.0 + drng() * 0.5;
            plateDensityLand[r] = 2.4 + drng() * 0.5;
            plateDensity[r] = plateIsOcean.has(r) ? plateDensityOcean[r] : plateDensityLand[r];
        }

        const noise = new SimplexNoise(seed);

        progress(35, 'Raising mountains\u2026');
        t0 = performance.now();
        const { r_elevation, mountain_r, coastline_r, ocean_r, r_stress, debugLayers, _timing } =
            assignElevation(mesh, r_xyz, plateIsOcean, r_plate, plateVec, plateSeeds, noise, nMag, seed, spread, plateDensity);
        timing.push({ stage: 'Elevation (collisions + stress + distance fields + assignment)', ms: performance.now() - t0 });

        const prePostElev = new Float32Array(r_elevation);

        progress(60, 'Eroding terrain\u2026');
        t0 = performance.now();
        const { dl_erosionDelta, postTiming } = runPostProcessing(mesh, r_xyz, r_elevation, { smoothing, glacialErosion, hydraulicErosion, thermalErosion, ridgeSharpening }, neighborDist);
        timing.push({ stage: 'Terrain post-processing (total)', ms: performance.now() - t0 });
        debugLayers.erosionDelta = dl_erosionDelta;

        progress(80, 'Computing triangle elevations\u2026');
        t0 = performance.now();
        const t_elevation = computeTriangleElevations(mesh, r_elevation);
        timing.push({ stage: 'Triangle elevations', ms: performance.now() - t0 });

        t0 = performance.now();
        // Retain state for reapply/edit (clone what we'll transfer)
        W = {
            mesh, r_xyz: new Float32Array(r_xyz), t_xyz: new Float32Array(t_xyz),
            neighborDist,
            r_plate: new Int32Array(r_plate), plateSeeds: new Set(plateSeeds), plateVec,
            plateIsOcean: new Set(plateIsOcean), originalPlateIsOcean: new Set(originalPlateIsOcean),
            plateDensity: Object.assign({}, plateDensity),
            plateDensityLand: Object.assign({}, plateDensityLand),
            plateDensityOcean: Object.assign({}, plateDensityOcean),
            prePostElev: new Float32Array(prePostElev),
            seed, nMag, noise,
            mountain_r: new Set(mountain_r), coastline_r: new Set(coastline_r), ocean_r: new Set(ocean_r),
            r_stress: new Float32Array(r_stress)
        };
        timing.push({ stage: 'Clone state for retention', ms: performance.now() - t0 });

        const tWorkerTotal = performance.now() - tTotal0;

        // Build result — typed arrays we no longer need are transferred (zero-copy).
        // mesh.triangles/halfedges are NOT transferred because W.mesh retains them.
        const result = {
            type: 'done',
            triangles: mesh.triangles,
            halfedges: mesh.halfedges,
            numRegions: mesh.numRegions,
            r_xyz, t_xyz, r_plate,
            plateSeeds: Array.from(plateSeeds),
            plateVec,
            plateIsOcean: Array.from(plateIsOcean),
            originalPlateIsOcean: Array.from(originalPlateIsOcean),
            plateDensity, plateDensityLand, plateDensityOcean,
            prePostElev,
            r_elevation, t_elevation,
            mountain_r: Array.from(mountain_r),
            coastline_r: Array.from(coastline_r),
            ocean_r: Array.from(ocean_r),
            r_stress,
            seed, nMag,
            debugLayers,
            _timing,                          // elevation sub-stages from assignElevation
            _pipelineTiming: timing,          // top-level pipeline stages
            _postTiming: postTiming,          // post-processing sub-stages
            _workerTotal: tWorkerTotal,
            _params: { N, P, jitter, nMag, numContinents, smoothing, hydraulicErosion, thermalErosion, ridgeSharpening, glacialErosion, seed }
        };

        // Transfer arrays the worker no longer needs (cloned copies kept in W)
        const transferList = [
            r_xyz.buffer, t_xyz.buffer, r_plate.buffer,
            prePostElev.buffer, r_elevation.buffer, t_elevation.buffer,
            r_stress.buffer
        ];

        self.postMessage(result, transferList);

    } catch (err) {
        self.postMessage({ type: 'error', message: err.message, stack: err.stack });
    }
}

function handleReapply(data) {
    if (!W) { self.postMessage({ type: 'error', message: 'No retained state for reapply' }); return; }

    try {
        const tTotal0 = performance.now();

        progress(0, 'Reapplying terrain\u2026');

        let t0 = performance.now();
        const r_elevation = new Float32Array(W.prePostElev);
        const tClone = performance.now() - t0;

        progress(20, 'Eroding terrain\u2026');
        t0 = performance.now();
        const { dl_erosionDelta, postTiming } = runPostProcessing(W.mesh, W.r_xyz, r_elevation, data, W.neighborDist);
        const tPost = performance.now() - t0;

        progress(80, 'Computing triangle elevations\u2026');
        t0 = performance.now();
        const t_elevation = computeTriangleElevations(W.mesh, r_elevation);
        const tTriElev = performance.now() - t0;

        const tWorkerTotal = performance.now() - tTotal0;

        const result = {
            type: 'reapplyDone',
            r_elevation,
            t_elevation,
            erosionDelta: dl_erosionDelta,
            _reapplyTiming: {
                clone: tClone,
                postProcessing: tPost,
                triangleElevations: tTriElev,
                workerTotal: tWorkerTotal
            },
            _postTiming: postTiming
        };

        self.postMessage(result, [r_elevation.buffer, t_elevation.buffer, dl_erosionDelta.buffer]);

    } catch (err) {
        self.postMessage({ type: 'error', message: err.message, stack: err.stack });
    }
}

function handleEditRecompute(data) {
    if (!W) { self.postMessage({ type: 'error', message: 'No retained state for editRecompute' }); return; }

    try {
        const tTotal0 = performance.now();

        progress(0, 'Rebuilding elevation\u2026');

        // Update retained plate state
        W.plateIsOcean = new Set(data.plateIsOcean);
        W.plateDensity = Object.assign({}, data.plateDensity);

        const { mesh, r_xyz, plateIsOcean, r_plate, plateVec, plateSeeds, noise, seed } = W;
        const nMag = data.nMag;
        const spread = 5;

        let t0 = performance.now();
        const { r_elevation, mountain_r, coastline_r, ocean_r, r_stress, debugLayers, _timing } =
            assignElevation(mesh, r_xyz, plateIsOcean, r_plate, plateVec, plateSeeds, noise, nMag, seed, spread, W.plateDensity);
        const tElev = performance.now() - t0;

        const prePostElev = new Float32Array(r_elevation);

        progress(50, 'Eroding terrain\u2026');
        t0 = performance.now();
        const { dl_erosionDelta, postTiming } = runPostProcessing(mesh, r_xyz, r_elevation, data, W.neighborDist);
        const tPost = performance.now() - t0;
        debugLayers.erosionDelta = dl_erosionDelta;

        progress(80, 'Computing triangle elevations\u2026');
        t0 = performance.now();
        const t_elevation = computeTriangleElevations(mesh, r_elevation);
        const tTriElev = performance.now() - t0;

        // Update retained state
        t0 = performance.now();
        W.prePostElev = new Float32Array(prePostElev);
        W.mountain_r = new Set(mountain_r);
        W.coastline_r = new Set(coastline_r);
        W.ocean_r = new Set(ocean_r);
        W.r_stress = new Float32Array(r_stress);
        const tRetain = performance.now() - t0;

        const tWorkerTotal = performance.now() - tTotal0;

        const result = {
            type: 'editDone',
            prePostElev,
            r_elevation,
            t_elevation,
            mountain_r: Array.from(mountain_r),
            coastline_r: Array.from(coastline_r),
            ocean_r: Array.from(ocean_r),
            r_stress,
            debugLayers,
            _editTiming: {
                elevation: tElev,
                postProcessing: tPost,
                triangleElevations: tTriElev,
                retainState: tRetain,
                workerTotal: tWorkerTotal
            },
            _timing,        // elevation sub-stages
            _postTiming: postTiming
        };

        self.postMessage(result, [
            prePostElev.buffer, r_elevation.buffer, t_elevation.buffer, r_stress.buffer
        ]);

    } catch (err) {
        self.postMessage({ type: 'error', message: err.message, stack: err.stack });
    }
}

self.onmessage = (e) => {
    const { cmd } = e.data;
    switch (cmd) {
        case 'generate': handleGenerate(e.data); break;
        case 'reapply': handleReapply(e.data); break;
        case 'editRecompute': handleEditRecompute(e.data); break;
        default: self.postMessage({ type: 'error', message: `Unknown command: ${cmd}` });
    }
};
