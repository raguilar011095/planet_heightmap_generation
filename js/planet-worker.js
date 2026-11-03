// Web Worker — runs the pure computation pipeline off the main thread.
// Handles: generate, reapply, editRecompute commands.

import { makeRng } from './rng.js';
import { SEED_MAX } from './planet-code.js';
import { SimplexNoise } from './simplex-noise.js';
import { setDelaunator, buildSphere, generateTriangleCenters, SphereMesh, computeNeighborDist } from './sphere-mesh.js';
import { generateCoarsePlates, projectCoarsePlates } from './coarse-plates.js';
import { smoothAndReconnectPlates } from './plates.js';
import { assignElevation } from './elevation.js';
import { buildSuperPlates } from './super-plates.js';
import { warpTerrain, smoothElevation, erodeComposite, sharpenRidges, applySoilCreep, applyDetailNoise } from './terrain-post.js';
import { runNewClimate, newClimateTransfers } from './climate-new.js';
import { computeTerrainMetrics } from './terrain-metrics.js';
import { applyPlatePhysics, expandPlatePhysicsDebug } from './plate-physics.js';
import { SUPER_PLATE_PHYSICS_MULT, DETAIL_NOISE_DAMPEN_STRENGTH } from './terrain-config.js';
import { buildPresentPlates, classifyBoundaries, arrowAnchors, cellLandNow } from '../v2/js/present/plates.js';
import { presentLayout } from '../v2/js/present/layout.js';
import { presentWorld, presentTerrainMesh, presentGroundOf, presentRivers } from '../v2/js/present/world.js';
import { hillshade } from '../v2/js/view/terrain-shade.js';
import { heightKmToElev } from './color-map.js';
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

// Combined craton/basin dampen field for detail noise (1 = max dampen).
// Returns null when geological annotations aren't available (e.g. heightmap imports).
function computeDetailDampenField(debugLayers) {
    const cw = debugLayers && debugLayers.cratonWeight;
    const bw = debugLayers && debugLayers.basinWeight;
    if (!cw || !bw) return null;
    const N = cw.length;
    const r_dampen = new Float32Array(N);
    for (let r = 0; r < N; r++) {
        const a = cw[r], b = bw[r];
        r_dampen[r] = a > b ? a : b;
    }
    return r_dampen;
}

// Orogenic power as a [0, 1] amplitude multiplier for detail noise.
// debugLayers.orogenicPower is stored as raw_oroPower − 0.5 (for diverging
// colormap), so we add 0.5 and clamp to recover the [0, 1] factor.
function computeOrogenicField(debugLayers) {
    const op = debugLayers && debugLayers.orogenicPower;
    if (!op) return null;
    const N = op.length;
    const r_oro = new Float32Array(N);
    for (let r = 0; r < N; r++) {
        const v = op[r] + 0.5;
        r_oro[r] = v < 0 ? 0 : (v > 1 ? 1 : v);
    }
    return r_oro;
}

// Run terrain post-processing with per-step timing
function runPostProcessing(mesh, r_xyz, r_elevation, params, neighborDist, seed, r_hotspot, r_dampen, r_orogenic) {
    const { smoothing, glacialErosion, hydraulicErosion, thermalErosion, ridgeSharpening, terrainWarp } = params;
    const timing = [];

    // Terrain warp — first step, before ocean detection or smoothing
    if (terrainWarp > 0) {
        const t0 = performance.now();
        warpTerrain(mesh, r_elevation, r_xyz, seed, terrainWarp, r_hotspot);
        timing.push({ stage: `Terrain warp (strength=${terrainWarp.toFixed(2)})`, ms: performance.now() - t0 });
    }

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

    {
        const t0 = performance.now();
        applyDetailNoise(mesh, r_xyz, r_elevation, r_isOcean, seed, {
            dampenField: r_dampen ?? null,
            dampenStrength: DETAIL_NOISE_DAMPEN_STRENGTH,
            amplitudeField: r_orogenic ?? null,
        });
        timing.push({ stage: 'Detail noise L1 (0-100m bumps)', ms: performance.now() - t0 });
    }

    {
        const t0 = performance.now();
        applyDetailNoise(mesh, r_xyz, r_elevation, r_isOcean, seed, {
            amplitudeKm: 0.05,
            frequencyMult: 2.0,
            warpAmpMult: 2.0,
            bipolar: true,
            biasExponent: 0.4,
            seedOffset: 13579,
            dampenField: r_dampen ?? null,
            dampenStrength: DETAIL_NOISE_DAMPEN_STRENGTH,
            amplitudeField: r_orogenic ?? null,
        });
        timing.push({ stage: 'Detail noise L2 (±50m biased)', ms: performance.now() - t0 });
    }

    if (glacialErosion > 0 || hydraulicErosion > 0 || thermalErosion > 0) {
        const gIters = Math.round(glacialErosion * 10);
        const hIters = Math.round(hydraulicErosion * 20);
        const hK = hydraulicErosion * 0.0006;
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

function getClimateParams(data) {
    const greenhouse = data?.greenhouse ?? W?.greenhouse ?? 0;
    const precipitationOffset = data?.precipitationOffset ?? W?.precipitationOffset ?? 0;
    const landCoverage = data?.landCoverage ?? W?.landCoverage ?? 0.3;
    if (W) { W.greenhouse = greenhouse; W.precipitationOffset = precipitationOffset; W.landCoverage = landCoverage; }
    return { greenhouse, precipitationOffset, landCoverage };
}

/**
 * The planet's climate — the new climate (js/climate-new.js; plans/V1_NEW_CLIMATE_PLAN.md) — on its final elevation,
 * with the Temperature / Precipitation sliders. Its buffers go to the main thread with the result (newClimateTransfers).
 */
function climateFor(r_xyz, r_elevation, { greenhouse = 0, precipitationOffset = 0 } = {}, timing = null, pct = 80) {
    progress(pct, 'Simulating the climate\u2026');
    const t0 = performance.now();
    const climate = runNewClimate(r_xyz, r_elevation, { greenhouse, precipitationOffset });
    if (timing) timing.push({ stage: 'Climate', ms: performance.now() - t0 }, ...climate.timing.stages.map(t => ({ stage: `  climate · ${t.stage}`, ms: t.ms })));
    return climate;
}

// ── The present-day world (plans/GENERATE_REDESIGN_PLAN.md; on the page with ?next=1 until it is the default) ──
// G1: the pieces (Generate's plates) grouped into plates that move, from the UNEDITED layout and the pieces' motion on
// it — so an edit changes only the crust, never the grouping — and the boundaries classified on the crust as edited.
function presentPlatesFor({ coarse, P, plateSeeds, originalPlateIsOcean, pieceVec, seed, mesh, r_xyz }) {
    applyPlatePhysics(pieceVec, plateSeeds, originalPlateIsOcean, coarse.coarse_r_plate, coarse.coarseMesh, coarse.coarse_xyz, seed);
    // on Evolution's sim mesh (v2/js/present/layout.js), free of the render mesh's Detail
    const L = presentLayout({ seed, P, coarse, pieceOcean: originalPlateIsOcean, pieceVec });
    const plates = buildPresentPlates(L);
    // each render region's sim cell (its nearest; the sim mesh's index is in Evolution's z-up frame)
    const regionCell = new Int32Array(mesh.numRegions), index = L.sim.index;
    for (let r = 0; r < mesh.numRegions; r++) regionCell[r] = index.nearest(r_xyz[3 * r + 2], r_xyz[3 * r], r_xyz[3 * r + 1]);
    return { L, P: plates, regionCell };
}
/**
 * The present-day world's ground (v2/js/present/world.js) for the crust as edited, as Generate's raw elevations (the
 * page reads raw elevations until it reads km itself: js/color-map.js heightKmToElev). Kept on `present.world`.
 */
function presentGround(present, plateIsOcean, mesh, r_xyz, seed, knobs) {
    const pieceLand = Uint8Array.from(present.L.pieceIds, id => (plateIsOcean.has(id) ? 0 : 1));
    const w = presentWorld(present, pieceLand, mesh, r_xyz, { seed, knobs });
    present.world = w;
    return presentHeights(present, w.heightKm, mesh, r_xyz, w.ms, w.drainage, w.receivers);
}
/** Reapply (G6): the same Frame, only the ground drawn again with the sculpting knobs. */
function presentReground(present, mesh, r_xyz, seed, knobs) {
    const g = presentGroundOf(present.world.frame, present.L.sim, mesh, r_xyz, { seed, knobs });
    present.world.heightKm = g.heightKm;
    return presentHeights(present, g.heightKm, mesh, r_xyz, g.ms, g.drainage, g.receivers);
}
function presentHeights(present, heightKm, mesh, r_xyz, ms, drainage, receivers) {
    // its hillshade, as Evolution shades its terrain (v2/js/view/terrain-shade.js; flat ground 1): the page paints by it
    present.world.shade = hillshade(presentTerrainMesh(mesh, r_xyz), heightKm);
    // its rivers (G7a): the carving's own network, drawn as lines
    present.world.rivers = presentRivers(heightKm, drainage, receivers);
    const r_elevation = new Float32Array(mesh.numRegions);
    for (let r = 0; r < r_elevation.length; r++) r_elevation[r] = heightKmToElev(heightKm[r]);
    return { r_elevation, debugLayers: presentLayers(present, mesh.numRegions), timing: Object.entries(ms).map(([stage, t]) => ({ stage, ms: t })) };
}
/** The Inspect list's layers of the present-day world's past (G6b), per render region off its sim cell. */
function presentLayers(present, n) {
    const f = present.world.frame, cellOf = present.regionCell;
    const floorAge = new Float32Array(n), beltKind = new Float32Array(n), beltAge = new Float32Array(n), craton = new Float32Array(n);
    for (let r = 0; r < n; r++) {
        const c = cellOf[r];
        floorAge[r] = f.type[c] === 0 ? -f.formedAt[c] : 0;
        beltKind[r] = f.oroType[c];
        beltAge[r] = f.oroType[c] ? (f.oroLast[c] >= 0 ? 0 : -f.oroLast[c]) : 0;
        craton[r] = f.type[c] === 2 ? 1 : 0;
    }
    return { presentFloorAge: floorAge, presentBeltKind: beltKind, presentBeltAge: beltAge, presentCraton: craton };
}
const knobsOf = (d, nMag) => ({ nMag, terrainWarp: d.terrainWarp, smoothing: d.smoothing, hydraulicErosion: d.hydraulicErosion,
    thermalErosion: d.thermalErosion, ridgeSharpening: d.ridgeSharpening, glacialErosion: d.glacialErosion });
/** What the page draws of it: the plates, which plate each region rides on, the boundaries on the crust as it is now. */
function presentMessage(present, plateIsOcean) {
    const { L, P, regionCell } = present;
    const B = present.world?.B ?? classifyBoundaries(L, P, cellLandNow(L, P, Uint8Array.from(L.pieceIds, id => (plateIsOcean.has(id) ? 0 : 1))));
    if (!present.regionPlate) {
        present.regionPlate = new Int16Array(regionCell.length);
        for (let r = 0; r < regionCell.length; r++) present.regionPlate[r] = P.cellPlate[regionCell[r]];
    }
    return {
        regionPlate: present.regionPlate,
        plates: P.plates.map(p => ({ index: p.index, continental: p.continental, share: p.share, landShare: p.landShare,
            speedCmYr: p.speedCmYr, euler: p.euler, centroid: p.centroid })),
        boundaries: { count: B.count, mid: B.mid, a: B.a, b: B.b, kind: B.kind, openCmYr: B.openCmYr, slipCmYr: B.slipCmYr, over: B.over },
        arrows: present.arrows ?? (present.arrows = arrowAnchors(L, P)),
        shade: present.world?.shade ?? null,
        rivers: present.world?.rivers ?? null,
        // what the hover tells of each place's crust and its past: its sim cell, and the few records it reads there
        regionCell, rec: present.world ? (({ type, oroType, oroStart, oroLast, formedAt, volcType, volcAt, volcKm }) =>
            ({ type, oroType, oroStart, oroLast, formedAt, volcType, volcAt, volcKm }))(present.world.frame) : null,
    };
}

function handleGenerate(data) {
    const { N, P, jitter, nMag, numContinents, smoothing, hydraulicErosion, thermalErosion, ridgeSharpening, glacialErosion, terrainWarp, continentSizeVariety = 0, greenhouse = 0, precipitationOffset = 0, landCoverage = 0.3, seed: overrideSeed, toggledIndices, skipClimate } = data;
    const spread = 5;
    const timing = []; // top-level pipeline timing

    try {
        const tTotal0 = performance.now();

        progress(0, 'Shaping the world\u2026');
        const seed = overrideSeed ?? Math.floor(Math.random() * SEED_MAX);
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

        progress(10, 'Generating coarse plates\u2026');
        t0 = performance.now();
        const { coarseMesh, coarse_xyz, coarse_r_plate, coarsePlateSeeds, coarsePlateVec, coarsePlateIsOcean } =
            generateCoarsePlates(seed, P, numContinents, continentSizeVariety, landCoverage);
        timing.push({ stage: `Coarse plates (${P} plates, ${numContinents} continents)`, ms: performance.now() - t0 });

        progress(20, 'Projecting plates\u2026');
        t0 = performance.now();
        const r_plate = projectCoarsePlates(mesh, r_xyz, coarseMesh, coarse_xyz, coarse_r_plate, seed, P);
        timing.push({ stage: 'Project coarse → hi-res', ms: performance.now() - t0 });

        progress(25, 'Smoothing boundaries\u2026');
        t0 = performance.now();
        smoothAndReconnectPlates(mesh, r_plate, coarsePlateSeeds, 3);
        timing.push({ stage: 'Smooth projected plates', ms: performance.now() - t0 });

        const plateSeeds = coarsePlateSeeds;
        const plateVec = coarsePlateVec;
        const plateIsOcean = coarsePlateIsOcean;

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

        // The present-day world (?next=1): its own copy of the pieces' motion, before the physics below bends it on the
        // edited layout — its grouping is the unedited layout's
        let present = null;
        if (data.next) {
            t0 = performance.now();
            present = presentPlatesFor({ coarse: { coarseMesh, coarse_xyz, coarse_r_plate, coarsePlateSeeds }, P,
                plateSeeds, originalPlateIsOcean, pieceVec: JSON.parse(JSON.stringify(plateVec)), seed, mesh, r_xyz });
            timing.push({ stage: `Present-day plates (${present.P.M} plates from ${P} pieces)`, ms: performance.now() - t0 });
        }

        // Apply physically-motivated plate motion biasing
        t0 = performance.now();
        const { plateDebug, mantleField, velDelta } = applyPlatePhysics(
            plateVec, plateSeeds, plateIsOcean,
            coarse_r_plate, coarseMesh, coarse_xyz, seed
        );
        timing.push({ stage: 'Plate physics (drag + slab pull + ridge push + mantle flow)', ms: performance.now() - t0 });

        let superPlateData = null, r_elevation, mountain_r, coastline_r, ocean_r, r_stress, debugLayers, _timing = [];
        let prePostElev, r_dampen = null, r_orogenic = null, postTiming = [];
        if (present) {
            // the present-day world's ground: its coast, boundaries, sea floor, Frame, and Evolution's terrain + carving
            progress(35, 'Raising the ground…');
            t0 = performance.now();
            const g = presentGround(present, plateIsOcean, mesh, r_xyz, seed, knobsOf(data, nMag));
            r_elevation = g.r_elevation; debugLayers = g.debugLayers; _timing = g.timing;
            mountain_r = new Set(); coastline_r = new Set(); ocean_r = new Set(); r_stress = new Float32Array(mesh.numRegions);
            prePostElev = new Float32Array(r_elevation);
            timing.push({ stage: 'Present-day ground (coast, sea floor, Frame, terrain, carving)', ms: performance.now() - t0 });
        } else {
        // Build super plates for broad orogenic belts (skip if too few plates)
        if (P >= 8) {
            t0 = performance.now();
            superPlateData = buildSuperPlates(coarseMesh, coarse_r_plate, plateSeeds, plateVec, plateIsOcean, plateDensity, r_plate);
            timing.push({ stage: `Super plates (${superPlateData.numSuperPlates} groups from ${P} plates)`, ms: performance.now() - t0 });

            // Apply plate physics to super plates with stronger blending
            t0 = performance.now();
            const spSeeds = new Set();
            for (let i = 0; i < superPlateData.numSuperPlates; i++) spSeeds.add(i);
            applyPlatePhysics(
                superPlateData.superPlateVec, spSeeds, superPlateData.superPlateIsOcean,
                superPlateData.r_superPlate, mesh, r_xyz, seed + 7777,
                SUPER_PLATE_PHYSICS_MULT
            );
            timing.push({ stage: 'Super plate physics', ms: performance.now() - t0 });
        }

        // Expand mantle field from coarse mesh to hi-res via plate averages
        const r_mantleField = new Float32Array(mesh.numRegions);
        {
            const plateMantleSum = {}, plateMantleN = {};
            for (let r = 0; r < coarseMesh.numRegions; r++) {
                const pid = coarse_r_plate[r];
                plateMantleSum[pid] = (plateMantleSum[pid] || 0) + mantleField[r];
                plateMantleN[pid] = (plateMantleN[pid] || 0) + 1;
            }
            for (let r = 0; r < mesh.numRegions; r++) {
                const pid = r_plate[r];
                r_mantleField[r] = plateMantleN[pid] ? plateMantleSum[pid] / plateMantleN[pid] : 0;
            }
        }

        progress(35, 'Raising mountains\u2026');
        t0 = performance.now();
        ({ r_elevation, mountain_r, coastline_r, ocean_r, r_stress, debugLayers, _timing } =
            assignElevation(mesh, r_xyz, plateIsOcean, r_plate, plateVec, plateSeeds, noise, nMag, seed, spread, plateDensity, superPlateData, r_mantleField));
        timing.push({ stage: 'Elevation (collisions + stress + distance fields + assignment)', ms: performance.now() - t0 });

        prePostElev = new Float32Array(r_elevation);
        r_dampen = computeDetailDampenField(debugLayers);
        r_orogenic = computeOrogenicField(debugLayers);

        progress(60, 'Eroding terrain\u2026');
        t0 = performance.now();
        const post = runPostProcessing(mesh, r_xyz, r_elevation, { smoothing, glacialErosion, hydraulicErosion, thermalErosion, ridgeSharpening, terrainWarp }, neighborDist, seed, debugLayers.hotspot, r_dampen, r_orogenic);
        postTiming = post.postTiming;
        timing.push({ stage: 'Terrain post-processing (total)', ms: performance.now() - t0 });
        debugLayers.erosionDelta = post.dl_erosionDelta;
        }

        // Expand plate physics diagnostics to hi-res mesh
        {
            const ppd = expandPlatePhysicsDebug(
                plateDebug, mantleField, velDelta, r_plate, mesh.numRegions,
                coarse_r_plate, coarseMesh.numRegions
            );
            debugLayers.continentalDrag = ppd.dl_continentalDrag;
            debugLayers.sizeVelocity = ppd.dl_sizeVelocity;
            debugLayers.plateSpeed = ppd.dl_plateSpeed;
            debugLayers.velChange = ppd.dl_velChange;
            debugLayers.mantleFlow = ppd.dl_mantleFlow;
        }

        const climate = skipClimate ? null : climateFor(r_xyz, r_elevation, { greenhouse, precipitationOffset }, timing, 70);
        if (climate) debugLayers.koppen = climate.koppen;

        progress(skipClimate ? 75 : 90, 'Computing triangle elevations\u2026');
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
            r_elevation_final: new Float32Array(r_elevation),
            seed, nMag, noise, P,
            mountain_r: new Set(mountain_r), coastline_r: new Set(coastline_r), ocean_r: new Set(ocean_r),
            r_stress: new Float32Array(r_stress),
            greenhouse, precipitationOffset, landCoverage,
            // Retain detail-noise dampen + orogenic fields so reapply (which
            // reuses prePostElev) shapes the noise the same way as the initial
            // generate over craton/basin and orogenic regions.
            r_dampen: r_dampen ? new Float32Array(r_dampen) : null,
            r_orogenic: r_orogenic ? new Float32Array(r_orogenic) : null,
            // Retain coarse-plate data so editRecompute can rebuild super
            // plates with the same detail-independent adjacency graph.
            coarseMesh, coarse_r_plate: new Int32Array(coarse_r_plate),
            present,
        };
        timing.push({ stage: 'Clone state for retention', ms: performance.now() - t0 });

        // Compute terrain quality metrics using retained-state clones
        // (the originals will be transferred and neutered below).
        let terrainMetrics = null;
        try {
            terrainMetrics = computeTerrainMetrics({
                mesh: W.mesh,
                r_xyz: W.r_xyz,
                r_elevation: W.r_elevation_final,
                r_plate: W.r_plate,
                plateIsOcean: Array.from(W.plateIsOcean),
                r_stress: W.r_stress,
                debugLayers,
                prePostElev: W.prePostElev,
            });
        } catch (e) {
            terrainMetrics = { _error: e.message };
        }

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
            climate,
            skipClimate: !!skipClimate,
            seed, nMag,
            debugLayers,
            _timing,                          // elevation sub-stages from assignElevation
            _pipelineTiming: timing,          // top-level pipeline stages
            _postTiming: postTiming,          // post-processing sub-stages
            _workerTotal: tWorkerTotal,
            _params: { N, P, jitter, nMag, numContinents, smoothing, terrainWarp, hydraulicErosion, thermalErosion, ridgeSharpening, glacialErosion, continentSizeVariety, greenhouse, precipitationOffset, landCoverage, seed },
            terrainMetrics,
            present: present ? presentMessage(present, plateIsOcean) : null,
        };

        // Transfer arrays the worker no longer needs (cloned copies kept in W)
        const transferList = [
            r_xyz.buffer, t_xyz.buffer, r_plate.buffer,
            prePostElev.buffer, r_elevation.buffer, t_elevation.buffer,
            r_stress.buffer, ...(climate ? newClimateTransfers(climate).filter(b => b !== debugLayers.koppen?.buffer) : [])
        ];

        self.postMessage(result, transferList);

    } catch (err) {
        self.postMessage({ type: 'error', message: err.message, stack: err.stack });
    }
}

function handleReapply(data) {
    if (!W) { self.postMessage({ type: 'error', message: 'No retained state for reapply' }); return; }

    const skipClimate = !!data.skipClimate;
    const { greenhouse, precipitationOffset, landCoverage } = getClimateParams(data);

    try {
        const tTotal0 = performance.now();

        progress(0, 'Reapplying terrain\u2026');

        let t0 = performance.now();
        let r_elevation = new Float32Array(W.prePostElev);
        const tClone = performance.now() - t0;

        progress(20, 'Eroding terrain\u2026');
        t0 = performance.now();
        // the present-day world: the same Frame, its ground drawn again with the sculpting knobs (G6); else the old passes
        let dl_erosionDelta = null, postTiming = [];
        if (W.present) r_elevation = presentReground(W.present, W.mesh, W.r_xyz, W.seed, knobsOf(data, W.nMag)).r_elevation;
        else ({ dl_erosionDelta, postTiming } = runPostProcessing(W.mesh, W.r_xyz, r_elevation, data, W.neighborDist, W.seed, undefined, W.r_dampen, W.r_orogenic));
        const tPost = performance.now() - t0;

        // Update retained final elevation for deferred climate
        W.r_elevation_final = new Float32Array(r_elevation);

        t0 = performance.now();
        const climate = skipClimate ? null : climateFor(W.r_xyz, r_elevation, { greenhouse, precipitationOffset }, null, 60);
        const tClimate = performance.now() - t0;

        progress(skipClimate ? 70 : 90, 'Computing triangle elevations\u2026');
        t0 = performance.now();
        const t_elevation = computeTriangleElevations(W.mesh, r_elevation);
        const tTriElev = performance.now() - t0;

        const tWorkerTotal = performance.now() - tTotal0;

        const result = {
            type: 'reapplyDone',
            skipClimate,
            r_elevation,
            t_elevation,
            erosionDelta: dl_erosionDelta,
            climate,
            present: W.present ? presentMessage(W.present, W.plateIsOcean) : null,
            _reapplyTiming: {
                clone: tClone,
                postProcessing: tPost,
                climate: tClimate,
                triangleElevations: tTriElev,
                workerTotal: tWorkerTotal
            },
            _postTiming: postTiming
        };

        self.postMessage(result, [r_elevation.buffer, t_elevation.buffer, ...(dl_erosionDelta ? [dl_erosionDelta.buffer] : []), ...(climate ? newClimateTransfers(climate) : [])]);

    } catch (err) {
        self.postMessage({ type: 'error', message: err.message, stack: err.stack });
    }
}

function handleEditRecompute(data) {
    if (!W) { self.postMessage({ type: 'error', message: 'No retained state for editRecompute' }); return; }

    const skipClimate = !!data.skipClimate;
    const { greenhouse, precipitationOffset, landCoverage } = getClimateParams(data);

    try {
        const tTotal0 = performance.now();

        progress(0, 'Rebuilding elevation\u2026');

        // Update retained plate state
        W.plateIsOcean = new Set(data.plateIsOcean);
        W.plateDensity = Object.assign({}, data.plateDensity);

        const { mesh, r_xyz, plateIsOcean, r_plate, plateVec, plateSeeds, noise, seed } = W;
        const nMag = data.nMag;
        const spread = 5;

        let t0 = performance.now(), tElev, tPost = 0;
        let r_elevation, mountain_r, coastline_r, ocean_r, r_stress, debugLayers, _timing = [], prePostElev, postTiming = [];
        if (W.present) {
            // the present-day world: the same plates (the unedited layout's), the crust as edited, the ground again
            const g = presentGround(W.present, plateIsOcean, mesh, r_xyz, seed, knobsOf(data, nMag));
            r_elevation = g.r_elevation; debugLayers = g.debugLayers; _timing = g.timing;
            mountain_r = new Set(); coastline_r = new Set(); ocean_r = new Set(); r_stress = new Float32Array(mesh.numRegions);
            prePostElev = new Float32Array(r_elevation);
            tElev = performance.now() - t0;
        } else {
        // Rebuild super plates from updated plate ocean/density state
        // (uses retained coarse-plate data for detail-stable adjacency graph)
        let superPlateData = null;
        if ((W.P || 0) >= 8) {
            superPlateData = buildSuperPlates(W.coarseMesh, W.coarse_r_plate, plateSeeds, plateVec, plateIsOcean, W.plateDensity, r_plate);
        }

        ({ r_elevation, mountain_r, coastline_r, ocean_r, r_stress, debugLayers, _timing } =
            assignElevation(mesh, r_xyz, plateIsOcean, r_plate, plateVec, plateSeeds, noise, nMag, seed, spread, W.plateDensity, superPlateData));
        tElev = performance.now() - t0;

        prePostElev = new Float32Array(r_elevation);
        const r_dampen = computeDetailDampenField(debugLayers);
        const r_orogenic = computeOrogenicField(debugLayers);
        W.r_dampen = r_dampen ? new Float32Array(r_dampen) : null;
        W.r_orogenic = r_orogenic ? new Float32Array(r_orogenic) : null;

        progress(50, 'Eroding terrain\u2026');
        t0 = performance.now();
        const post = runPostProcessing(mesh, r_xyz, r_elevation, data, W.neighborDist, W.seed, debugLayers.hotspot, r_dampen, r_orogenic);
        postTiming = post.postTiming;
        tPost = performance.now() - t0;
        debugLayers.erosionDelta = post.dl_erosionDelta;
        }

        // Update retained final elevation for deferred climate
        W.r_elevation_final = new Float32Array(r_elevation);

        t0 = performance.now();
        const climate = skipClimate ? null : climateFor(r_xyz, r_elevation, { greenhouse, precipitationOffset }, null, 65);
        if (climate) debugLayers.koppen = climate.koppen;
        const tClimate = performance.now() - t0;

        progress(skipClimate ? 75 : 90, 'Computing triangle elevations\u2026');
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
            skipClimate,
            prePostElev,
            r_elevation,
            t_elevation,
            mountain_r: Array.from(mountain_r),
            coastline_r: Array.from(coastline_r),
            ocean_r: Array.from(ocean_r),
            r_stress,
            climate,
            debugLayers,
            present: W.present ? presentMessage(W.present, W.plateIsOcean) : null,
            _editTiming: {
                elevation: tElev,
                postProcessing: tPost,
                climate: tClimate,
                triangleElevations: tTriElev,
                retainState: tRetain,
                workerTotal: tWorkerTotal
            },
            _timing,        // elevation sub-stages
            _postTiming: postTiming
        };

        self.postMessage(result, [
            prePostElev.buffer, r_elevation.buffer, t_elevation.buffer, r_stress.buffer,
            ...(climate ? newClimateTransfers(climate).filter(b => b !== debugLayers.koppen?.buffer) : [])
        ]);

    } catch (err) {
        self.postMessage({ type: 'error', message: err.message, stack: err.stack });
    }
}

function handleComputeClimate(data) {
    if (!W) { self.postMessage({ type: 'error', message: 'No retained state for computeClimate' }); return; }
    const { greenhouse, precipitationOffset } = getClimateParams(data);
    try {
        const t0 = performance.now();
        const climate = climateFor(W.r_xyz, W.r_elevation_final, { greenhouse, precipitationOffset }, null, 10);
        progress(95, 'Done');
        self.postMessage({ type: 'climateDone', climate, _climateTiming: { climate: climate.timing.climate, workerTotal: performance.now() - t0 } },
            newClimateTransfers(climate));
    } catch (err) {
        self.postMessage({ type: 'error', message: err.message, stack: err.stack });
    }
}

// ─── Heightmap import ───────────────────────────────────────────────

/** Bilinear interpolation with equirectangular wrapping. */
function sampleBilinear(pixels, imgW, imgH, px, py) {
    // Clamp vertically, wrap horizontally
    py = Math.max(0, Math.min(py, imgH - 1));
    const x0 = Math.floor(px), y0 = Math.floor(py);
    const x1 = (x0 + 1) % imgW;     // horizontal wrap
    const y1 = Math.min(y0 + 1, imgH - 1); // vertical clamp
    const fx = px - x0, fy = py - y0;
    const v00 = pixels[y0 * imgW + ((x0 % imgW) + imgW) % imgW];
    const v10 = pixels[y0 * imgW + x1];
    const v01 = pixels[y1 * imgW + ((x0 % imgW) + imgW) % imgW];
    const v11 = pixels[y1 * imgW + x1];
    return (v00 * (1 - fx) * (1 - fy) +
            v10 * fx * (1 - fy) +
            v01 * (1 - fx) * fy +
            v11 * fx * fy);
}

/**
 * Convert grayscale 0–255 to internal elevation.
 * 0 → -0.5 (ocean floor)
 * 1–255 → inverse of 6·t² so grayscale maps linearly to km.
 * Simple sqrt inversion: t = sqrt((v-1) / 254).
 */
function grayscaleToElevation(v) {
    if (v < 1) return -0.5; // ocean (black pixels; catches interpolated fractional values too)
    return Math.sqrt((v - 1) / 254);
}

/**
 * Sample an equirectangular grayscale heightmap onto sphere mesh regions.
 * Returns r_elevation (Float32Array).
 */
function sampleHeightmap(mesh, r_xyz, imageData, imgW, imgH) {
    const r_elevation = new Float32Array(mesh.numRegions);
    for (let r = 0; r < mesh.numRegions; r++) {
        const x = r_xyz[3 * r], y = r_xyz[3 * r + 1], z = r_xyz[3 * r + 2];
        const lat = Math.asin(Math.max(-1, Math.min(1, y)));
        const lon = Math.atan2(x, z);
        // Map lat/lon → pixel coords (equirectangular)
        const px = (lon / Math.PI + 1) * 0.5 * imgW; // 0..W
        const py = (0.5 - lat / Math.PI) * imgH;     // 0..H
        const gray = sampleBilinear(imageData, imgW, imgH, px, py);
        r_elevation[r] = grayscaleToElevation(gray);
    }
    return r_elevation;
}

/**
 * BFS flood fill to derive synthetic plates from elevation.
 * Creates one "plate" per connected land mass and one per connected ocean basin.
 */
function deriveSyntheticPlates(mesh, r_elevation) {
    const N = mesh.numRegions;
    const r_plate = new Int32Array(N).fill(-1);
    const plateSeeds = new Set();
    const plateIsOcean = new Set();
    const plateVec = {};
    const { adjOffset, adjList } = mesh;

    let plateId = 0;
    for (let r = 0; r < N; r++) {
        if (r_plate[r] >= 0) continue;
        const isOcean = r_elevation[r] <= 0;
        // BFS from this region
        r_plate[r] = r; // use r as the plate seed
        plateSeeds.add(r);
        plateVec[r] = [0, 0, 0]; // zero velocity
        if (isOcean) plateIsOcean.add(r);
        const queue = [r];
        let head = 0;
        while (head < queue.length) {
            const cur = queue[head++];
            const end = adjOffset[cur + 1];
            for (let ni = adjOffset[cur]; ni < end; ni++) {
                const nb = adjList[ni];
                if (r_plate[nb] >= 0) continue;
                const nbOcean = r_elevation[nb] <= 0;
                if (nbOcean === isOcean) {
                    r_plate[nb] = r;
                    queue.push(nb);
                }
            }
        }
        plateId++;
    }

    return { r_plate, plateSeeds, plateIsOcean, plateVec };
}

function handleImportHeightmap(data) {
    const { N, jitter, grayscale, imageWidth, imageHeight, smoothing, hydraulicErosion, thermalErosion, ridgeSharpening, glacialErosion, terrainWarp, greenhouse = 0, precipitationOffset = 0, landCoverage = 0.3, seed: overrideSeed, skipClimate } = data;
    const timing = [];

    try {
        const tTotal0 = performance.now();

        progress(0, 'Building sphere mesh\u2026');
        const seed = overrideSeed ?? Math.floor(Math.random() * SEED_MAX);
        const rng = makeRng(seed);

        let t0 = performance.now();
        const { mesh, r_xyz } = buildSphere(N, jitter, rng);
        timing.push({ stage: 'Sphere mesh', ms: performance.now() - t0 });

        t0 = performance.now();
        const neighborDist = computeNeighborDist(mesh, r_xyz);
        timing.push({ stage: 'Neighbor distances', ms: performance.now() - t0 });

        t0 = performance.now();
        const t_xyz = generateTriangleCenters(mesh, r_xyz);
        timing.push({ stage: 'Triangle centers', ms: performance.now() - t0 });

        progress(20, 'Sampling heightmap\u2026');
        t0 = performance.now();
        const r_elevation = sampleHeightmap(mesh, r_xyz, grayscale, imageWidth, imageHeight);
        timing.push({ stage: 'Sample heightmap', ms: performance.now() - t0 });

        const prePostElev = new Float32Array(r_elevation);

        progress(35, 'Processing terrain\u2026');
        t0 = performance.now();
        const { dl_erosionDelta, postTiming } = runPostProcessing(mesh, r_xyz, r_elevation, { smoothing, glacialErosion, hydraulicErosion, thermalErosion, ridgeSharpening, terrainWarp }, neighborDist, seed);
        timing.push({ stage: 'Terrain post-processing', ms: performance.now() - t0 });

        progress(50, 'Deriving plates\u2026');
        t0 = performance.now();
        const { r_plate, plateSeeds, plateIsOcean, plateVec } = deriveSyntheticPlates(mesh, r_elevation);
        timing.push({ stage: 'Synthetic plates', ms: performance.now() - t0 });

        // Classify regions
        const mountain_r = new Set();
        const coastline_r = new Set();
        const ocean_r = new Set();
        for (let r = 0; r < mesh.numRegions; r++) {
            if (r_elevation[r] <= 0) {
                ocean_r.add(r);
            } else if (r_elevation[r] > 0.5) {
                mountain_r.add(r);
            }
            // Coastline: land cell adjacent to ocean
            if (r_elevation[r] > 0) {
                const end = mesh.adjOffset[r + 1];
                for (let ni = mesh.adjOffset[r]; ni < end; ni++) {
                    if (r_elevation[mesh.adjList[ni]] <= 0) {
                        coastline_r.add(r);
                        break;
                    }
                }
            }
        }

        const r_stress = new Float32Array(mesh.numRegions); // no stress for imports
        const debugLayers = { erosionDelta: dl_erosionDelta };
        const nMag = 0;

        const climate = skipClimate ? null : climateFor(r_xyz, r_elevation, { greenhouse, precipitationOffset }, timing, 75);
        if (climate) debugLayers.koppen = climate.koppen;

        progress(skipClimate ? 75 : 92, 'Computing triangle elevations\u2026');
        t0 = performance.now();
        const t_elevation = computeTriangleElevations(mesh, r_elevation);
        timing.push({ stage: 'Triangle elevations', ms: performance.now() - t0 });

        // Retain state for reapply
        t0 = performance.now();
        W = {
            mesh, r_xyz: new Float32Array(r_xyz), t_xyz: new Float32Array(t_xyz),
            neighborDist,
            r_plate: new Int32Array(r_plate), plateSeeds: new Set(plateSeeds), plateVec,
            plateIsOcean: new Set(plateIsOcean), originalPlateIsOcean: new Set(plateIsOcean),
            plateDensity: {}, plateDensityLand: {}, plateDensityOcean: {},
            prePostElev: new Float32Array(prePostElev),
            r_elevation_final: new Float32Array(r_elevation),
            seed, nMag, noise: new SimplexNoise(seed),
            mountain_r: new Set(mountain_r), coastline_r: new Set(coastline_r), ocean_r: new Set(ocean_r),
            r_stress: new Float32Array(r_stress),
        };
        timing.push({ stage: 'Clone state for retention', ms: performance.now() - t0 });

        const tWorkerTotal = performance.now() - tTotal0;

        // Build result — same shape as handleGenerate's 'done' message
        const result = {
            type: 'done',
            triangles: mesh.triangles,
            halfedges: mesh.halfedges,
            numRegions: mesh.numRegions,
            r_xyz, t_xyz, r_plate,
            plateSeeds: Array.from(plateSeeds),
            plateVec,
            plateIsOcean: Array.from(plateIsOcean),
            originalPlateIsOcean: Array.from(plateIsOcean),
            plateDensity: {}, plateDensityLand: {}, plateDensityOcean: {},
            prePostElev,
            r_elevation, t_elevation,
            mountain_r: Array.from(mountain_r),
            coastline_r: Array.from(coastline_r),
            ocean_r: Array.from(ocean_r),
            r_stress,
            climate,
            skipClimate: !!skipClimate,
            seed, nMag,
            debugLayers,
            _timing: [],
            _pipelineTiming: timing,
            _postTiming: postTiming,
            _workerTotal: tWorkerTotal,
            _params: { N, P: 0, jitter, nMag, numContinents: 0, smoothing, terrainWarp, hydraulicErosion, thermalErosion, ridgeSharpening, glacialErosion, seed }
        };

        const transferList = [
            r_xyz.buffer, t_xyz.buffer, r_plate.buffer,
            prePostElev.buffer, r_elevation.buffer, t_elevation.buffer,
            r_stress.buffer, ...(climate ? newClimateTransfers(climate).filter(b => b !== debugLayers.koppen?.buffer) : [])
        ];

        self.postMessage(result, transferList);

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
        case 'computeClimate': handleComputeClimate(e.data); break;
        case 'importHeightmap': handleImportHeightmap(e.data); break;
        default: self.postMessage({ type: 'error', message: `Unknown command: ${cmd}` });
    }
};
