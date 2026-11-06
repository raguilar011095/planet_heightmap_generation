// Phase 0 of plans/TERRAIN_DIFFUSION_EXPLORATION.md: an Evolution history and a detailed moment of it, built headlessly as
// v2/tools/check-save.mjs builds them, and written out for the learned-detail experiment — the moment as a planet file
// (.orogen, for fine-windows.mjs to draw the procedural detail from) and its pictures as raw arrays for the Python side:
//   heightM.i16  W × W/2 Int16 metres        ocean.u8, water.u8  the same grid        climate.json + T/P grids (360 × 180)
//   rivers.json  the rivers' polylines (start, lat, lon, q, season)                   meta.json   sizes and settings
//
//   node tuning/learned-detail/make-moment.mjs <outDir> [--sim 10000] [--len 300] [--cells 640000] [--width 2048] [--seed 4242]

import fs from 'node:fs';
import path from 'node:path';
import Delaunator from 'delaunator';
import { setDelaunator } from '../../js/sphere-mesh.js';
import { buildSimMesh } from '../../v2/js/core/sim-mesh.js';
import { runHistory } from '../../v2/js/app/history-runner.js';
import { TERRAIN_SCENES } from '../../v2/js/tectonics/scenarios/terrain-scenes.js';
import { TerrainPool, FRAME_FIELDS } from '../../v2/js/terrain/terrain-pool.js';
import { finishPlanet, finishRaster } from '../../v2/js/finish/finish.js';
import { GEO_FRAME_FIELDS, GEOLOGY_READS } from '../../v2/js/tectonics/model/geology.js';
import { savePlanet } from '../../v2/js/save/planet-file.js';

setDelaunator(Delaunator);
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? Number(process.argv[i + 1]) : d; };
const OUT = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'v2/out/learned-detail';
const SIM = arg('--sim', 10000), LEN = arg('--len', 300), CELLS = arg('--cells', 640000), W = arg('--width', 2048), SEED = arg('--seed', 4242);
fs.mkdirSync(OUT, { recursive: true });
const t0 = performance.now(), secs = () => `${((performance.now() - t0) / 1000).toFixed(1)} s`;

const simMesh = buildSimMesh(SIM, 12345), scene = TERRAIN_SCENES.find(s => s.id === 'cycle');
const run = await runHistory({ list: 'terrain', scene, ending: 'none', start: { continentalFraction: 0.3 }, lengthMyr: LEN, keep: false }, simMesh, SEED, 10);
console.log(`history: ${run.frames.length} frames to ${run.frames.at(-1).time} Myr (${secs()})`);
const moment = run.frames.at(-1);
const slim = Object.fromEntries([...FRAME_FIELDS, ...GEO_FRAME_FIELDS, ...GEOLOGY_READS].map(k => [k, moment[k]]));
slim.plates = moment.plates.map(p => p && { quat: p.quat });
const pool = await TerrainPool.create(simMesh);
const out = await finishPlanet({ frame: slim, simMesh, seed: SEED, cells: CELLS, pool, closePool: true, driversWidth: 2048, onStage: s => process.stdout.write(`  ${s}…\n`) });
const raster = finishRaster(out.mesh, out.z, out.ocean, W, null, out.lake, out.lakeLevel, out.climate.cell, out.geology, out.farming);
const climate = { ...out.climate.page, raster: raster.climate };
delete raster.climate;
raster.drivers = out.drivers;
const fin = { cells: CELLS, raster, rivers: out.rivers, climate, stats: out.stats, secs: 0, climateKey: '0|0' };
console.log(`detailed moment at ${CELLS} cells, ${W} px (${secs()})`);

// the planet file
const settings = { seed: SEED, cont: 30, len: LEN, ending: 'none', sim: SIM, terrain: 160000, greenhouse: 0, rain: 0, more: 0 };
const history = { frames: run.frames, simMesh, simMyr: run.time, steps: run.steps, stopped: run.stopped, snapshotMyr: 10 };
const { blob, bytes } = await savePlanet({ settings, history, detail: { frame: moment, fin } });
fs.writeFileSync(path.join(OUT, 'moment.orogen'), Buffer.from(await blob.arrayBuffer()));

// the pictures, raw
const w = raster.w, h = raster.h;
fs.writeFileSync(path.join(OUT, 'heightM.i16'), Buffer.from(raster.heightM.buffer, raster.heightM.byteOffset, raster.heightM.byteLength));
fs.writeFileSync(path.join(OUT, 'ocean.u8'), Buffer.from(raster.ocean.buffer, raster.ocean.byteOffset, raster.ocean.byteLength));
fs.writeFileSync(path.join(OUT, 'water.u8'), Buffer.from(raster.water.buffer, raster.water.byteOffset, raster.water.byteLength));
const pc = out.climate.page, G = pc.grid;
for (const [name, a] of [['T_year', pc.T.year], ['T_jan', pc.T.jan], ['T_jul', pc.T.jul], ['P_year', pc.P.year], ['P_jan', pc.P.jan], ['P_jul', pc.P.jul]])
    fs.writeFileSync(path.join(OUT, `${name}.f32`), Buffer.from(a.buffer, a.byteOffset, a.byteLength));
const R = out.rivers;
fs.writeFileSync(path.join(OUT, 'rivers.json'), JSON.stringify({ start: Array.from(R.start), lat: Array.from(R.lat), lon: Array.from(R.lon), q: Array.from(R.q), season: Array.from(R.season) }));
fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify({ w, h, grid: G, sim: SIM, len: LEN, cells: CELLS, seed: SEED, time: moment.time, landShare: out.stats?.landShare ?? null }, null, 2));
console.log(`written to ${OUT}: ${w}×${h} picture, ${R.start.length - 1} river reaches, planet file ${(bytes / 2 ** 20).toFixed(1)} MB (${secs()})`);
process.exit(0);
