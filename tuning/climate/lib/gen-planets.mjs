/**
 * Generated planets for the climate checks — the worlds the app actually makes, not Earth. A tune that only watches
 * Earth can dry these out (it did once: Earth-fit rain knobs that left generated continents mostly desert), so the
 * tune and planets-dry.mjs score their land's arid share and rain as a guardrail.
 *
 *   GEN_PLANETS — the set: Generate's default sliders on a few seeds (and one single-continent world), Evolution
 *                 worlds, and the synthetic test planets. Terrain is cached in tuning/results/climate/cache/.
 *   loadGenPlanets({ only }) → [{ key, label, xyz, elevKm, axes }]
 *   dryness(res, elevKm) → { aridShare, desertShare, rainMm, landCells } over ice-free land (EF left out)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Delaunator from 'delaunator';
import { setDelaunator, buildSphere, computeNeighborDist } from '../../../js/sphere-mesh.js';
import { makeRng } from '../../../js/rng.js';
import { SimplexNoise } from '../../../js/simplex-noise.js';
import { generateCoarsePlates, projectCoarsePlates } from '../../../js/coarse-plates.js';
import { smoothAndReconnectPlates } from '../../../js/plates.js';
import { assignElevation } from '../../../js/elevation.js';
import { buildSuperPlates } from '../../../js/super-plates.js';
import { warpTerrain, smoothElevation, erodeComposite, sharpenRidges, applySoilCreep, applyDetailNoise } from '../../../js/terrain-post.js';
import { applyPlatePhysics } from '../../../js/plate-physics.js';
import { SUPER_PLATE_PHYSICS_MULT, DETAIL_NOISE_DAMPEN_STRENGTH } from '../../../js/terrain-config.js';
import { elevToHeightKm } from '../../../js/color-map.js';
import { TEST_PLANETS, buildTestPlanet } from '../../../v2/js/climate/test-planets.js';
import { KOPPEN_CLASSES } from '../../../v2/js/climate/koppen.js';

setDelaunator(Delaunator);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(__dirname, '..', '..', 'results', 'climate', 'cache');

// Generate's slider defaults (generate.html); N = detailFromSlider(600) ≈ 204K, here 160K as the Earth checks use
const V1_DEFAULTS = { N: 160000, jitter: 0.75, P: 80, numContinents: 4, nMag: 0.40, continentSizeVariety: 0.35, landCoverage: 0.3,
    terrainWarp: 0.75, smoothing: 0.10, glacialErosion: 0.50, hydraulicErosion: 0.50, thermalErosion: 0.10, ridgeSharpening: 0.50 };

// Earth-like: default sliders, the seeds whose land is most like Earth's in amount and |latitude| placement
// (planets-dry.mjs --screen 16: seeds 2, 6, 10); not Earth-like: the least (12, half its land within 20° of the
// equator) and the sliders' far ends — one continent, much land, little land.
export const EARTHLIKE = 'Generate, Earth-like', UNEARTHLY = 'Generate, not Earth-like', EVOLUTION = 'Evolution', TEST = 'Test planets';
export const GEN_PLANETS = [
    { key: 'gen-2', group: EARTHLIKE, label: 'seed 2', kind: 'v1', seed: 2 },
    { key: 'gen-6', group: EARTHLIKE, label: 'seed 6', kind: 'v1', seed: 6 },
    { key: 'gen-10', group: EARTHLIKE, label: 'seed 10', kind: 'v1', seed: 10 },
    { key: 'gen-12', group: UNEARTHLY, label: 'seed 12 (tropical land)', kind: 'v1', seed: 12 },
    { key: 'gen-1c', group: UNEARTHLY, label: 'seed 4, one continent', kind: 'v1', seed: 4, sliders: { numContinents: 1 } },
    { key: 'gen-land', group: UNEARTHLY, label: 'seed 5, land coverage 0.6', kind: 'v1', seed: 5, sliders: { landCoverage: 0.6 } },
    { key: 'gen-sea', group: UNEARTHLY, label: 'seed 3, land coverage 0.1', kind: 'v1', seed: 3, sliders: { landCoverage: 0.1 } },
    { key: 'evo-12345', group: EVOLUTION, label: 'seed 12345', kind: 'evolution', seed: 12345, ending: 'none' },
    { key: 'evo-101', group: EVOLUTION, label: 'seed 101', kind: 'evolution', seed: 101, ending: 'none' },
    { key: 'evo-202', group: EVOLUTION, label: 'seed 202', kind: 'evolution', seed: 202, ending: 'none' },
    { key: 'evo-super', group: EVOLUTION, label: 'seed 12345, supercontinent ending', kind: 'evolution', seed: 12345, ending: 'supercontinent' },
    ...Object.keys(TEST_PLANETS).filter(k => k !== 'mountains').map(k => ({ key: `test-${k}`, group: TEST, label: TEST_PLANETS[k].label, kind: 'test', test: k })),
];

/** Generate's terrain, as js/planet-worker.js handleGenerate builds it (climate left out): V1 elevation per region. */
function v1Elevation(seed, s) {
    const rng = makeRng(seed);
    const { mesh, r_xyz } = buildSphere(s.N, s.jitter, rng);
    const neighborDist = computeNeighborDist(mesh, r_xyz);
    const { coarseMesh, coarse_xyz, coarse_r_plate, coarsePlateSeeds, coarsePlateVec, coarsePlateIsOcean } =
        generateCoarsePlates(seed, s.P, s.numContinents, s.continentSizeVariety, s.landCoverage);
    const r_plate = projectCoarsePlates(mesh, r_xyz, coarseMesh, coarse_xyz, coarse_r_plate, seed, s.P);
    smoothAndReconnectPlates(mesh, r_plate, coarsePlateSeeds, 3);
    const plateSeeds = coarsePlateSeeds, plateVec = coarsePlateVec, plateIsOcean = coarsePlateIsOcean;
    const plateDensity = {};
    for (const r of plateSeeds) {
        const drng = makeRng(r + 777);
        const ocean = 3.0 + drng() * 0.5, land = 2.4 + drng() * 0.5;
        plateDensity[r] = plateIsOcean.has(r) ? ocean : land;
    }
    const noise = new SimplexNoise(seed);
    const { mantleField } = applyPlatePhysics(plateVec, plateSeeds, plateIsOcean, coarse_r_plate, coarseMesh, coarse_xyz, seed);
    let superPlateData = null;
    if (s.P >= 8) {
        superPlateData = buildSuperPlates(coarseMesh, coarse_r_plate, plateSeeds, plateVec, plateIsOcean, plateDensity, r_plate);
        const spSeeds = new Set(); for (let i = 0; i < superPlateData.numSuperPlates; i++) spSeeds.add(i);
        applyPlatePhysics(superPlateData.superPlateVec, spSeeds, superPlateData.superPlateIsOcean, superPlateData.r_superPlate, mesh, r_xyz, seed + 7777, SUPER_PLATE_PHYSICS_MULT);
    }
    const r_mantleField = new Float32Array(mesh.numRegions);
    {
        const sum = {}, cnt = {};
        for (let r = 0; r < coarseMesh.numRegions; r++) { const pid = coarse_r_plate[r]; sum[pid] = (sum[pid] || 0) + mantleField[r]; cnt[pid] = (cnt[pid] || 0) + 1; }
        for (let r = 0; r < mesh.numRegions; r++) { const pid = r_plate[r]; r_mantleField[r] = cnt[pid] ? sum[pid] / cnt[pid] : 0; }
    }
    const { r_elevation, debugLayers } = assignElevation(mesh, r_xyz, plateIsOcean, r_plate, plateVec, plateSeeds, noise, s.nMag, seed, 5, plateDensity, superPlateData, r_mantleField);

    // post-processing (runPostProcessing)
    if (s.terrainWarp > 0) warpTerrain(mesh, r_elevation, r_xyz, seed, s.terrainWarp, debugLayers.hotspot);
    const r_isOcean = new Uint8Array(mesh.numRegions);
    for (let r = 0; r < mesh.numRegions; r++) if (r_elevation[r] <= 0) r_isOcean[r] = 1;
    if (s.smoothing > 0) smoothElevation(mesh, r_elevation, r_isOcean, Math.round(1 + s.smoothing * 4), 0.2 + s.smoothing * 0.5);
    let r_dampen = null, r_orogenic = null;
    if (debugLayers.cratonWeight && debugLayers.basinWeight) {
        r_dampen = new Float32Array(mesh.numRegions);
        for (let r = 0; r < mesh.numRegions; r++) r_dampen[r] = Math.max(debugLayers.cratonWeight[r], debugLayers.basinWeight[r]);
    }
    if (debugLayers.orogenicPower) {
        r_orogenic = new Float32Array(mesh.numRegions);
        for (let r = 0; r < mesh.numRegions; r++) r_orogenic[r] = Math.max(0, Math.min(1, debugLayers.orogenicPower[r] + 0.5));
    }
    applyDetailNoise(mesh, r_xyz, r_elevation, r_isOcean, seed, { dampenField: r_dampen, dampenStrength: DETAIL_NOISE_DAMPEN_STRENGTH, amplitudeField: r_orogenic });
    applyDetailNoise(mesh, r_xyz, r_elevation, r_isOcean, seed, { amplitudeKm: 0.05, frequencyMult: 2.0, warpAmpMult: 2.0, bipolar: true, biasExponent: 0.4,
        seedOffset: 13579, dampenField: r_dampen, dampenStrength: DETAIL_NOISE_DAMPEN_STRENGTH, amplitudeField: r_orogenic });
    if (s.glacialErosion > 0 || s.hydraulicErosion > 0 || s.thermalErosion > 0)
        erodeComposite(mesh, r_elevation, r_xyz, r_isOcean, Math.round(s.hydraulicErosion * 20), s.hydraulicErosion * 0.0006, 0.5, 1.0,
            Math.round(s.thermalErosion * 10), 1.2 - s.thermalErosion * 0.4, s.thermalErosion * 0.15, Math.round(s.glacialErosion * 10), s.glacialErosion, neighborDist);
    if (s.ridgeSharpening > 0) sharpenRidges(mesh, r_elevation, r_isOcean, Math.round(1 + s.ridgeSharpening * 3), s.ridgeSharpening * 0.08);
    applySoilCreep(mesh, r_elevation, r_isOcean, 3, 0.1125);
    return { r_xyz, r_elevation };
}

const readF32 = (file) => { const b = fs.readFileSync(file); return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
const writeF32 = (file, a) => { fs.mkdirSync(CACHE, { recursive: true }); fs.writeFileSync(file, Buffer.from(a.buffer, a.byteOffset, a.byteLength)); };

async function loadPlanet(p, log) {
    if (p.kind === 'test') {
        const t = buildTestPlanet(p.test, 40000, buildSphere, makeRng(7));
        return { xyz: t.xyz, elevKm: t.elevKm, axes: t.axes };
    }
    if (p.kind === 'v1') {
        const s = { ...V1_DEFAULTS, ...p.sliders };
        const tag = Object.entries(p.sliders ?? {}).map(([k, v]) => `${k}${v}`).join('-');
        const file = path.join(CACHE, `v1-${p.seed}${tag ? '-' + tag : ''}-${s.N}.f32`);
        let elevKm;
        if (fs.existsSync(file)) elevKm = readF32(file);
        else {
            log(`  building ${p.label} (cached after)…`);
            const { r_elevation } = v1Elevation(p.seed, s);
            elevKm = new Float32Array(r_elevation.length);
            for (let r = 0; r < elevKm.length; r++) elevKm[r] = elevToHeightKm(r_elevation[r]);
            writeF32(file, elevKm);
        }
        const { r_xyz } = buildSphere(s.N, s.jitter, makeRng(p.seed));      // the same mesh: buildSphere is the RNG's first use
        return { xyz: r_xyz, elevKm, axes: 'y-up' };
    }
    // Evolution: the same cache name as diag-dry.mjs
    const N = 160000, file = path.join(CACHE, `evolution-here-${p.seed}-${p.ending}-${N}.f32`);
    const { terrainMesh } = await import('../../../v2/js/terrain/terrain-mesh.js');
    const tm = terrainMesh(N);
    let elevKm;
    if (fs.existsSync(file)) elevKm = readF32(file);
    else {
        log(`  building ${p.label} — about a minute, cached after…`);
        const { evolutionWorld } = await import('../../../v2/js/climate-lab/evolution-world.js');
        elevKm = Float32Array.from(evolutionWorld({ seed: p.seed, ending: p.ending, cells: N }).heightKm);
        writeF32(file, elevKm);
    }
    return { xyz: tm.xyz, elevKm, axes: 'z-up' };
}

/** The set's terrain (built once, then cached). `only`: keys to keep. */
export async function loadGenPlanets({ only = null, log = console.log } = {}) {
    const out = [];
    for (const p of GEN_PLANETS) {
        if (only && !only.includes(p.key)) continue;
        out.push({ key: p.key, label: p.label, ...(await loadPlanet(p, log)) });
    }
    return out;
}

/** Latitude of each cell (degrees) for either frame. */
export function cellLatDeg(xyz, axes, n) {
    const lat = new Float32Array(n), o = axes === 'z-up' ? 2 : 1;
    for (let r = 0; r < n; r++) lat[r] = Math.asin(Math.max(-1, Math.min(1, xyz[3 * r + o]))) * 180 / Math.PI;
    return lat;
}

export const ABS_LAT_BANDS = [0, 10, 20, 30, 40, 50, 60, 70, 90];
/** Land fraction of the planet and where the land lies: its share in each |latitude| band (hemispheres folded —
 *  the climate's belts are symmetric, so a mirrored Earth is as Earth-like as Earth). Cells are about equal in area. */
export function landStats(xyz, elevKm, axes) {
    const n = elevKm.length, lat = cellLatDeg(xyz, axes, n), B = ABS_LAT_BANDS.length - 1, share = new Float64Array(B);
    let land = 0, north = 0;
    for (let r = 0; r < n; r++) {
        if (!(elevKm[r] > 0)) continue;
        land++; if (lat[r] > 0) north++;
        const a = Math.abs(lat[r]); let b = 0; while (b < B - 1 && a >= ABS_LAT_BANDS[b + 1]) b++;
        share[b]++;
    }
    for (let b = 0; b < B; b++) share[b] /= land;
    return { landFrac: land / n, northShare: north / land, share };
}
/** How unlike Earth's a planet's land is: half the summed difference of the band shares (0 = Earth's placement, 1 =
 *  none in common), plus the land-fraction difference. */
export function placementDistance(s, earth) {
    let tv = 0; for (let b = 0; b < s.share.length; b++) tv += Math.abs(s.share[b] - earth.share[b]) / 2;
    return { tv, landDiff: s.landFrac - earth.landFrac, score: tv + Math.abs(s.landFrac - earth.landFrac) };
}

/** Generate's terrain at a given detail (for screening seeds), in km. */
export function v1HeightKm(seed, sliders = {}) {
    const s = { ...V1_DEFAULTS, ...sliders };
    const { r_xyz, r_elevation } = v1Elevation(seed, s);
    const elevKm = new Float32Array(r_elevation.length);
    for (let r = 0; r < elevKm.length; r++) elevKm[r] = elevToHeightKm(r_elevation[r]);
    return { xyz: r_xyz, elevKm, axes: 'y-up' };
}

const EF = KOPPEN_CLASSES.findIndex(k => k && k.code === 'EF');
/** Arid (B) and desert (BW) share of the ice-free land, and its mean rain (mm/yr), from planetClimate's result. */
export function dryness(res) {
    const { koppen, pAnnual } = res.cell;
    let n = 0, b = 0, bw = 0, p = 0;
    for (let r = 0; r < koppen.length; r++) {
        const k = koppen[r]; if (!k || k === EF) continue;
        const code = KOPPEN_CLASSES[k].code;
        n++; p += pAnnual[r];
        if (code[0] === 'B') { b++; if (code[1] === 'W') bw++; }
    }
    return { aridShare: b / n, desertShare: bw / n, rainMm: p / n, landCells: n };
}
