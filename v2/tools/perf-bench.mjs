// The performance bench (plans/audits/PERFORMANCE_AUDIT_2.md): each tool's real pipeline run in Node, stage by stage, with
// its time and a fingerprint of everything it makes — so a speed-up can be shown to change nothing, to the bit.
//
//   node v2/tools/perf-bench.mjs history  [--sim 40000] [--myr 600] [--seed 12345] [--cont 30]
//   node v2/tools/perf-bench.mjs terrain  [--cells 160000] [--sim …] [--myr …] [--seed …]      one frame's live terrain, on one thread
//   node v2/tools/perf-bench.mjs finish   [--cells 640000] [--width 4096] [--sim …] [--myr …]   Add detail and its picture
//   node v2/tools/perf-bench.mjs generate [--n 204000] [--seed 42] [--width auto] [--no-finish]  Generate's worker, then its finish
//   node v2/tools/perf-bench.mjs edit     [--n 204000]                                           … then a Rebuild and a Reapply
//   node v2/tools/perf-bench.mjs import   [--n 204000] [--width auto] [--no-finish]              Import's worker on a drawn map, then its finish
//   node v2/tools/perf-bench.mjs climate  [--n 204000]                                           the climate alone, on Generate's default world
//
// Every run prints `stage  seconds  fingerprint` lines and, with --json FILE, writes them. --compare FILE checks the
// fingerprints against an earlier run's and exits 1 on any difference. The history's frames are kept in v2/out/perf/ for the
// terrain and finish runs (their fingerprint is checked when read back).

import fs from 'node:fs';
import path from 'node:path';
import v8 from 'node:v8';
import { createHash } from 'node:crypto';
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Delaunator from 'delaunator';
import { setDelaunator } from '../../js/sphere-mesh.js';

setDelaunator(Delaunator);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'v2', 'out', 'perf');
const argv = process.argv.slice(2), MODE = argv[0];
const arg = (k, d) => { const i = argv.indexOf(k); return i > 0 ? argv[i + 1] : d; };
const has = k => argv.includes(k);

// ── fingerprints: every typed array's bytes, every number and string, keys in order; timings left out ──
const SKIP = new Set(['ms', 'packMs', '_workerTotal', 'secs', 'profile', 'timing']);
function feed(h, v, seen) {
    if (v === null || v === undefined) { h.update('~'); return; }
    if (ArrayBuffer.isView(v)) { h.update(`<${v.constructor.name}:${v.length}>`); h.update(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)); return; }
    if (v instanceof ArrayBuffer) { h.update(new Uint8Array(v)); return; }
    switch (typeof v) {
        case 'number': h.update(Object.is(v, -0) ? '-0' : String(v)); h.update(';'); return;
        case 'string': h.update(JSON.stringify(v)); return;
        case 'boolean': h.update(v ? 'T' : 'F'); return;
        case 'function': return;
        case 'bigint': h.update(String(v)); return;
    }
    if (seen.has(v)) { h.update('@'); return; }
    seen.add(v);
    if (Array.isArray(v)) { h.update(`[${v.length}`); for (const x of v) feed(h, x, seen); h.update(']'); return; }
    if (v instanceof Map) { h.update('M'); for (const [k, x] of v) { feed(h, k, seen); feed(h, x, seen); } return; }
    if (v instanceof Set) { h.update('S'); for (const x of v) feed(h, x, seen); return; }
    h.update('{');
    for (const k of Object.keys(v).sort()) { if (SKIP.has(k)) continue; h.update(k); h.update(':'); feed(h, v[k], seen); }
    h.update('}');
}
export const fingerprint = v => { const h = createHash('sha256'); feed(h, v, new Set()); return h.digest('hex').slice(0, 16); };

const rows = [];
const note = (stage, ms, print) => { rows.push({ stage, ms: Math.round(ms), print }); console.log(`${stage.padEnd(34)} ${(ms / 1000).toFixed(2).padStart(8)} s  ${print ?? ''}`); };
async function timed(stage, fn, printOf = v => fingerprint(v)) {
    const t = performance.now(), r = await fn(), ms = performance.now() - t;
    note(stage, ms, printOf ? printOf(r) : '');
    return r;
}
function done() {
    const total = rows.filter(r => !r.stage.startsWith(' ')).reduce((s, r) => s + r.ms, 0);
    console.log(`${'total'.padEnd(34)} ${(total / 1000).toFixed(2).padStart(8)} s`);
    const json = arg('--json', null), cmp = arg('--compare', null);
    if (json) { fs.mkdirSync(path.dirname(path.resolve(json)), { recursive: true }); fs.writeFileSync(json, JSON.stringify({ mode: MODE, argv, rows }, null, 1)); }
    if (cmp) {
        const old = new Map(JSON.parse(fs.readFileSync(cmp, 'utf8')).rows.map(r => [r.stage, r]));
        let bad = 0;
        for (const r of rows) {
            const o = old.get(r.stage);
            if (!o) { console.log(`  (new stage: ${r.stage})`); continue; }
            if (o.print !== r.print) { bad++; console.log(`DIFFERENT  ${r.stage}: ${o.print} → ${r.print}`); }
        }
        const was = [...old.values()].filter(r => !r.stage.startsWith(' ')).reduce((s, r) => s + r.ms, 0);
        console.log(bad ? `${bad} stage(s) DIFFER from ${cmp}` : `identical to ${cmp} — ${(was / 1000).toFixed(2)} s → ${(total / 1000).toFixed(2)} s (${(was / total).toFixed(2)}×)`);
        if (bad) process.exitCode = 1;
    }
}

// ── Evolution: the history as the page builds it (scene 'cycle', no ending), every 10 Myr ──
const SIM = Number(arg('--sim', 40000)), MYR = Number(arg('--myr', 600)), SEED = Number(arg('--seed', MODE === 'generate' || MODE === 'edit' || MODE === 'climate' ? 42 : 12345)), CONT = Number(arg('--cont', 30));
const MESH_SEED = 12345;
async function history({ keepAll = true } = {}) {
    const { buildSimMesh } = await import('../js/core/sim-mesh.js');
    const { runHistory } = await import('../js/app/history-runner.js');
    const { TERRAIN_SCENES } = await import('../js/tectonics/scenarios/terrain-scenes.js');
    const { FRAME_FIELDS } = await import('../js/terrain/terrain-pool.js');
    const { GEO_FRAME_FIELDS, GEOLOGY_READS } = await import('../js/tectonics/model/geology.js');
    const KEEP = [...FRAME_FIELDS, ...GEO_FRAME_FIELDS, ...GEOLOGY_READS];       // (what the page hands Add detail: evolution-main.js)
    const simMesh = await timed('sim mesh', () => buildSimMesh(SIM, MESH_SEED), m => fingerprint([m.xyz, m.adjOffset, m.adjList]));
    const scene = TERRAIN_SCENES.find(s => s.id === 'cycle');
    const h = createHash('sha256');
    let last = null, count = 0;
    const run = await timed(`history ${MYR} Myr at ${SIM}`, () => runHistory({ list: 'terrain', scene, ending: 'none', start: { continentalFraction: CONT / 100 }, lengthMyr: MYR, keep: false, collect: false },
        simMesh, SEED, 10, () => {}, f => {
            // (every frame's every array, its plates and its event log)
            const { events, ...rest } = f;
            h.update(fingerprint(rest)); count++;
            if (keepAll || Math.abs(f.time - MYR) < 1e-6) last = { frame: Object.fromEntries(KEEP.map(k => [k, f[k]])), events };
            if (last && Math.abs(f.time - MYR) < 1e-6) { last.frame.plates = f.plates.map(p => p && { quat: p.quat }); last.frame.time = f.time; }
        }), r => `${h.copy().digest('hex').slice(0, 16)} (${count} frames, ${r.steps} steps)`);
    note(' events', 0, fingerprint(last.events));
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(frameFile(), v8.serialize(last.frame));       // (kept for the terrain and finish runs)
    return { simMesh, frame: last.frame, steps: run.steps };
}
const frameFile = () => path.join(OUT, `frame-${SEED}-${CONT}-${SIM}-${MYR}.bin`);
/** The history's last frame, from v2/out/perf/ when it is there. */
async function frameOf() {
    const { buildSimMesh } = await import('../js/core/sim-mesh.js');
    const file = frameFile();
    if (fs.existsSync(file) && !has('--fresh')) {
        const simMesh = buildSimMesh(SIM, MESH_SEED), frame = v8.deserialize(fs.readFileSync(file));
        note(' frame (kept)', 0, fingerprint(frame));
        return { simMesh, frame };
    }
    const r = await history({ keepAll: false });
    note(' frame', 0, fingerprint(r.frame));
    rows.length = 0;                                              // (the history's own rows are the `history` run's)
    return r;
}

async function terrain() {
    const { simMesh, frame } = await frameOf();
    const { terrainMesh, sampleOnto } = await import('../js/terrain/terrain-mesh.js');
    const { synthesizeTerrain, hypsometry } = await import('../js/terrain/synthesize.js');
    const { terrainConfig } = await import('../js/terrain/terrain-config.js');
    const { hillshade } = await import('../js/view/terrain-shade.js');
    const cells = Number(arg('--cells', 160000)), cfg = terrainConfig();
    const tm = await timed(`terrain mesh ${cells}`, () => terrainMesh(cells), m => fingerprint([m.xyz, m.adjOffset, m.adjList]));
    const S = await timed('sampling (once per mesh)', () => sampleOnto(simMesh, tm, cfg, SEED));
    const T = await timed('surface + carving', () => synthesizeTerrain(frame, simMesh, tm, { seed: SEED, sampler: S, parts: true, carve: true }));
    for (const [k, v] of Object.entries(T.ms ?? {})) note(`   ${k}`, v, '');
    await timed('hillshade', () => hillshade(tm, T.heightKm, { exaggeration: 20, seaLevelKm: 0 }));
    await timed('hypsometry', () => hypsometry(T.heightKm, 0));
}

/** finishPlanet's result and its picture, as finish-worker.js makes them. */
async function finishOf(job, width, stageNote = true) {
    // (on a checkout from before the task pool — this file copied into it, to make a baseline — everything runs in place)
    const { finishPlanet, finishRaster, finishRasterPooled = (_pool, ...a) => finishRaster(...a) } = await import('../js/finish/finish.js');
    const { finishTaskPool = null } = await import('../js/finish/finish-tasks.js').catch(() => ({}));
    // (the finish's task pool, as finish-worker.js starts it — `--serial`: none, everything in place; `--workers N`)
    const tasks = has('--serial') || !finishTaskPool ? null : () => finishTaskPool(has('--workers') ? Number(arg('--workers')) : null);
    const t0 = performance.now();
    const out = await finishPlanet({ ...job, tasks });
    const all = performance.now() - t0;
    if (stageNote) for (const [k, v] of Object.entries(out.ms)) note(`   ${k}`, v, '');
    note('finish (all stages)', all, fingerprint({ z: out.z, ocean: out.ocean, lake: out.lake, lakeLevel: out.lakeLevel, rivers: out.rivers, drivers: out.drivers, stats: out.stats, geology: out.geology, farming: out.farming, climate: out.climate }));
    // (each part's own print, so a difference says where)
    for (const [k, v] of Object.entries({ z: out.z, rivers: out.rivers, drivers: out.drivers, stats: out.stats, geology: out.geology, farming: out.farming, 'climate.page': out.climate.page, 'climate.cell': out.climate.cell })) note(`   = ${k}`, 0, fingerprint(v));
    const raster = await timed(`picture ${width}`, () => finishRasterPooled(out.tasks, out.mesh, out.z, out.ocean, width, null, out.lake, out.lakeLevel, out.climate.cell, out.geology, out.farming));
    if (out.tasks) { const { pictureMs } = await import('../js/finish/finish-raster.js'); for (const [k, v] of Object.entries(pictureMs)) note(`   ${k}`, v, ''); }
    for (const [k, v] of Object.entries({ heightM: raster.heightM, water: raster.water, geology: raster.geology, farming: raster.farming, climate: raster.climate })) note(`   = picture.${k}`, 0, fingerprint(v));
    out.tasks?.terminate();
    // (--keep FILE: the finished planet kept, for timing the picture alone)
    if (has('--keep')) fs.writeFileSync(arg('--keep'), v8.serialize({ mesh: { numCells: out.mesh.numCells, xyz: out.mesh.xyz, adjOffset: out.mesh.adjOffset, adjList: out.mesh.adjList }, edgeKm: out.mesh.edgeKm,
        z: out.z, ocean: out.ocean, lake: out.lake, lakeLevel: out.lakeLevel, cell: out.climate.cell, geology: out.geology, farming: out.farming }));
    return { out, raster };
}

async function finish() {
    const { simMesh, frame } = await frameOf();
    const { TerrainPool } = await import('../js/terrain/terrain-pool.js');
    const { driverWidth } = await import('../js/finish/finish-drivers.js');
    const cells = Number(arg('--cells', 640000)), width = Number(arg('--width', cells >= 5e6 ? 8192 : 4096));
    const pool = await timed('terrain pool', () => TerrainPool.create(simMesh, has('--pool') ? Number(arg('--pool')) : null), null);
    await finishOf({ frame, simMesh, seed: SEED, cells, pool, closePool: true, climateOptions: { greenhouseWm2: 0, precipScale: 1 }, driversWidth: driverWidth(width) }, width);
}

// ── Generate and Import: js/planet-worker.js itself, its messages caught ──
async function planetWorker() {
    // (the worker imports Delaunator from the CDN: here, the package)
    register(`data:text/javascript,${encodeURIComponent(`export async function resolve(s, c, n) { return s.startsWith('https://cdn.jsdelivr.net/npm/delaunator') ? n('delaunator', c) : n(s, c); }`)}`, pathToFileURL(ROOT + '/'));
    const inbox = [];
    globalThis.self = { postMessage: m => inbox.push(m), onmessage: null };
    await import('../../js/planet-worker.js');
    return async (stage, data) => {
        inbox.length = 0;
        const t = performance.now();
        await globalThis.self.onmessage({ data });
        const ms = performance.now() - t, msg = inbox.find(m => m.type !== 'progress');
        if (!msg || msg.type === 'error') throw new Error(`planet worker: ${msg?.message ?? 'no reply'}\n${msg?.stack ?? ''}`);
        note(stage, ms, fingerprint(msg));
        return msg;
    };
}
const SLIDERS = { P: 80, jitter: 0.75, nMag: 0.4, numContinents: 6, terrainWarp: 0.75, smoothing: 0.1, hydraulicErosion: 0.5, thermalErosion: 0.1, ridgeSharpening: 0.5, glacialErosion: 0.5,
    continentSizeVariety: 0.35, greenhouse: 0, precipitationOffset: 0, landCoverage: 0.4 };
const finishWidth = n => Math.min(8192, Math.max(2048, 2 ** Math.round(Math.log2(4 * Math.sqrt(n)))));
/** The page's finish of a worker's world (js/main.js finish). */
async function finishShared(sh, n) {
    const { meshFromArrays } = await import('../js/core/sim-mesh.js');
    const { terrainConfig } = await import('../js/terrain/terrain-config.js');
    const { FINISH } = await import('../js/finish/finish-config.js');
    const { driverWidth } = await import('../js/finish/finish-drivers.js');
    const width = arg('--width', 'auto') === 'auto' ? finishWidth(n) : Number(arg('--width')), job = sh.finish;
    const sim = meshFromArrays(job.simMesh), mesh = meshFromArrays(sh.mesh);
    return finishOf({ frame: job.frame, simMesh: sim, seed: job.seed, cells: n, pool: null, climateOptions: { greenhouseWm2: 0, precipScale: 1 }, driversWidth: driverWidth(width),
        mesh, surface: () => job.surface, ...(job.terrain ? { cfg: terrainConfig(job.terrain) } : {}), ...(job.finish ? { F: { ...FINISH, ...job.finish } } : {}) }, width);
}
async function generate() {
    const send = await planetWorker(), N = Number(arg('--n', 204000));
    const msg = await send(`generate ${N}`, { cmd: 'generate', ...SLIDERS, N, seed: SEED, toggledIndices: [], next: true, shared: true });
    if (MODE === 'edit') {
        // (a Rebuild after two pieces are raised or sunk, then a Reapply with other sculpting knobs)
        const ocean = new Set(msg.plateIsOcean), seeds = msg.plateSeeds;
        for (const i of [3, 11]) { const r = seeds[i % seeds.length]; if (ocean.has(r)) ocean.delete(r); else ocean.add(r); }
        await send('rebuild (two pieces edited)', { cmd: 'editRecompute', plateIsOcean: [...ocean], ...SLIDERS, N });
        await send('reapply (other knobs)', { cmd: 'reapply', ...SLIDERS, N, terrainWarp: 0.4, smoothing: 0.3, ridgeSharpening: 0.2 });
        return;
    }
    if (!has('--no-finish')) await finishShared(msg.shared, msg.shared.mesh.numCells);
}
/** A drawn map with no file behind it: continents of smooth noise, 2048 × 1024 greys (the sea black). */
async function drawnMap(w = 2048) {
    const { FastNoise } = await import('../js/core/fast-noise.js');
    const h = w >> 1, g = new Float32Array(w * h), noise = new FastNoise(777);
    for (let y = 0; y < h; y++) {
        const lat = (0.5 - (y + 0.5) / h) * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
        for (let x = 0; x < w; x++) {
            const lon = ((x + 0.5) / w - 0.5) * 2 * Math.PI, px = cl * Math.sin(lon), py = sl, pz = cl * Math.cos(lon);
            const c = noise.fbm(px * 1.4 + 3.1, py * 1.4 + 1.7, pz * 1.4 + 9.2, 5, 0.55), r = Math.abs(noise.fbm(px * 5 + 11, py * 5 + 4, pz * 5 + 7, 4, 0.5));
            const land = c - 0.08;
            g[y * w + x] = land <= 0 ? 0 : Math.min(255, 1 + 254 * Math.min(1, land * 1.6 + 0.9 * land * (1 - r) ** 3));
        }
    }
    return { grayscale: g, imageWidth: w, imageHeight: h };
}
async function importMap() {
    const send = await planetWorker(), N = Number(arg('--n', 204000));
    const map = await drawnMap();
    const msg = await send(`import ${N}`, { cmd: 'importHeightmap', ...SLIDERS, N, seed: 42, ...map });
    if (!has('--no-finish')) await finishShared(msg.shared, msg.shared.mesh.numCells);
}
async function climate() {
    const send = await planetWorker(), N = Number(arg('--n', 204000));
    const msg = await send(`generate ${N}`, { cmd: 'generate', ...SLIDERS, N, seed: SEED, toggledIndices: [], next: true, shared: true });
    rows.length = 0;
    const { planetClimate } = await import('../js/climate/climate.js');
    const sh = msg.shared;
    const cpu0 = process.cpuUsage();
    const res = await timed('climate (planetClimate)', () => planetClimate({ xyz: sh.mesh.xyz, elevKm: sh.heightKm, axes: 'z-up' }, { greenhouseWm2: 0, precipScale: 1 }), r => fingerprint({ cell: r.cell, months: r.months, surface: r.surface, stages: r.stages }));
    { const c = process.cpuUsage(cpu0); note('   (cpu: this process, all threads)', (c.user + c.system) / 1000, ''); }
    for (const t of res.timing ?? []) note(`   ${t.stage}`, t.ms, '');
    for (const [k, v] of Object.entries(res.stages)) note(`   = ${k}`, 0, fingerprint(v));
}

const modes = { history: () => history(), terrain, finish, generate, edit: generate, import: importMap, climate };
if (!modes[MODE]) { console.error('usage: node v2/tools/perf-bench.mjs history|terrain|finish|generate|edit|import|climate [options] [--json FILE] [--compare FILE]'); process.exit(2); }
await modes[MODE]();
done();
process.exit(process.exitCode ?? 0);
