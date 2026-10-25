// The planet file (plans/V2_SAVE_LOAD_PLAN.md), checked headlessly — run it after any change to frames, detailed
// moments or the save code:
//   (a) a fresh history and a detailed moment of it (as the page builds them: the history as the worker records it, the
//       moment as finish-worker.js sends it), saved and read back — every frame, every field, every array of the
//       moment, bit for bit (−0 and NaN too) — half the frames saved as the page keeps them (PackedFrame) and half
//       plain, as Node runs them; then older files: one whose detailed moment is of an older finish version (its
//       history opens, the moment left to be detailed again), and one whose frames lack a field (it reads as zeros);
//   (b) every planet kept in v2/tools/fixtures/saves/ (one per version of the format) still opens: its history's
//       terrain is built from a frame, and every map the Export panel offers is drawn from its moment (a planet kept
//       before the rocks or the farming were added lacks their maps, and the panel does not offer them: the fresh
//       planet of (a) draws them instead).
// The file of (a) is written to v2/out/check-save.orogen (any unzip tool opens it), the older files beside it (to open
// on the page: drop them on it).
//
//   node v2/tools/check-save.mjs [--sim 10000] [--len 200] [--cells 160000] [--width 1024] [--seed 4242]
//   node v2/tools/check-save.mjs --fixture     (a) on a small planet, kept as the fixture of today's versions (5K
//                                              plates, 300 Myr, 40K cells at 512 px: ~9 MB, most of it the climate's
//                                              1° grids) — then (b). Once per version: a kept planet is never replaced

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Delaunator from 'delaunator';
import { setDelaunator } from '../../js/sphere-mesh.js';
import { buildSimMesh, meshFromArrays } from '../js/core/sim-mesh.js';
import { runHistory } from '../js/app/history-runner.js';
import { TERRAIN_SCENES } from '../js/tectonics/scenarios/terrain-scenes.js';
import { TerrainPool, FRAME_FIELDS } from '../js/terrain/terrain-pool.js';
import { terrainMesh, sampleOnto } from '../js/terrain/terrain-mesh.js';
import { terrainConfig } from '../js/terrain/terrain-config.js';
import { synthesizeTerrain } from '../js/terrain/synthesize.js';
import { finishPlanet, finishRaster } from '../js/finish/finish.js';
import { packFrame, PackedFrame } from '../js/tectonics/frame-pack.js';
import { frameArrays } from '../js/tectonics/snapshot.js';
import { savePlanet, readPlanet, openPlanet, planetBytes } from '../js/save/planet-file.js';
import { encodeTree, decodeTree, binPieces, allocArrays, arrayFiller } from '../js/save/tree-codec.js';
import { unpackCodec1 } from '../js/save/migrations.js';
import { seedOf } from '../js/core/seed.js';
import { ZipReader, ZipWriter } from '../js/save/zip-io.js';
import { FORMAT_VERSION, FRAME_VERSION, FINISH_VERSION, FRAME_CODEC } from '../js/save/versions.js';
import { CATALOGUE, produceMap, rowAvailable } from '../js/evolution/export.js';
import { GEO_FRAME_FIELDS } from '../js/tectonics/model/geology.js';
import { hasRecord } from '../js/evolution/geology-view.js';
import { heightLutOf } from '../js/evolution/looks.js';
import { riverPaths } from '../js/evolution/finish-view.js';

setDelaunator(Delaunator);
// (the maps are painted into ImageData, and the rivers' lines traced into Path2D, which Node lacks: the lines counted)
globalThis.Path2D ??= class { constructor() { this.segments = 0; } moveTo() {} lineTo() { this.segments++; } };
globalThis.ImageData ??= class { constructor(a, b, c) { if (typeof a === 'number') { this.width = a; this.height = b; this.data = new Uint8ClampedArray(4 * a * b); } else { this.data = a; this.width = b; this.height = c ?? a.length / 4 / b; } } };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURES = path.join(ROOT, 'v2', 'tools', 'fixtures', 'saves'), OUT = path.join(ROOT, 'v2', 'out');
const FIXTURE = process.argv.includes('--fixture');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? Number(process.argv[i + 1]) : d; };
const SIM = arg('--sim', FIXTURE ? 5000 : 10000), LEN = arg('--len', FIXTURE ? 300 : 200), CELLS = arg('--cells', FIXTURE ? 40000 : 160000), W = arg('--width', FIXTURE ? 512 : 1024), SEED = arg('--seed', 4242);
const keptName = `format${FORMAT_VERSION}-frame${FRAME_VERSION}-finish${FINISH_VERSION}-codec${FRAME_CODEC}.orogen`;
if (FIXTURE && fs.existsSync(path.join(FIXTURES, keptName))) {
    console.log(`${keptName} is kept already, and a kept planet is never replaced (a new one comes with a new version: v2/js/save/versions.js)`);
    process.exit(1);
}
const t0 = performance.now(), secs = () => `${((performance.now() - t0) / 1000).toFixed(1)} s`;
let failures = 0;
const check = (ok, what) => { if (!ok) { failures++; console.log(`  ✗ ${what}`); } return ok; };
const mb = n => (n / 2 ** 20).toFixed(1);

/** The first difference between two trees, or null: typed arrays by their bytes, numbers as Object.is (−0, NaN). */
function differ(a, b, at = '') {
    if (ArrayBuffer.isView(a) || ArrayBuffer.isView(b)) {
        if (!ArrayBuffer.isView(a) || !ArrayBuffer.isView(b) || a.constructor !== b.constructor || a.length !== b.length) return `${at}: ${a?.constructor?.name}(${a?.length}) vs ${b?.constructor?.name}(${b?.length})`;
        const x = new Uint8Array(a.buffer, a.byteOffset, a.byteLength), y = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
        for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return `${at}: byte ${i} differs`;
        return null;
    }
    if (typeof a === 'number' || typeof b === 'number') return Object.is(a, b) ? null : `${at}: ${a} vs ${b}`;
    if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return a === b ? null : `${at}: ${String(a)} vs ${String(b)}`;
    if (a instanceof Map || b instanceof Map) {
        if (!(a instanceof Map && b instanceof Map) || a.size !== b.size) return `${at}: Map sizes`;
        for (const [k, v] of a) { const d = differ(v, b.get(k), `${at}.get(${k})`); if (d) return d; }
        return null;
    }
    if (Array.isArray(a) !== Array.isArray(b)) return `${at}: array vs object`;
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length || ka.some(k => !Object.prototype.hasOwnProperty.call(b, k))) return `${at}: keys ${ka.sort().join(',')} vs ${kb.sort().join(',')}`;
    for (const k of ka) { const d = differ(a[k], b[k], `${at}.${k}`); if (d) return d; }
    return null;
}

/** A planet file with its manifest edited and its entries otherwise as they were (an "older" file, made by hand). */
async function rewritten(blob, edit) {
    const zip = await ZipReader.open(blob), out = new ZipWriter();
    for (const name of zip.entries.keys()) {
        if (name === 'manifest.json') { const m = await zip.json(name); edit(m); await out.add(name, [new TextEncoder().encode(JSON.stringify(m, null, 2))]); }
        else await out.add(name, zip.pieces(name));
    }
    return out.finish();
}
const write = (file, blob) => blob.arrayBuffer().then(b => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, Buffer.from(b)); });

// ── (a) the codec alone: the awkward values ──
{
    const shared = new Float32Array([1, -0, NaN, Infinity]);
    const tree = { n: [0, -0, NaN, Infinity, -Infinity, 1.5e-300], u: [undefined, null], o: { $a: 3 }, m: new Map([['k', new Int16Array([-2, 7])]]),
        s: new Set([1, 'two']), twice: [shared, shared], empty: new Uint8Array(0), odd: new Uint8Array([1, 2, 3]), f64: new Float64Array([Math.PI]), str: 'ünïcødé', missing: undefined };
    const e = encodeTree(tree), arrays = allocArrays(e.specs), fill = arrayFiller(e.specs, arrays);
    for (const p of binPieces(e)) for (let o = 0; o < p.length; o += 5) fill.push(p.subarray(o, o + 5));     // (pieces cut anywhere)
    fill.done();
    const back = decodeTree(JSON.parse(e.json), arrays), d = differ(tree, back);
    check(!d, `the codec's awkward values come back (${d})`);
    check(back.twice[0] === back.twice[1], 'an array met twice comes back as one');
    let threw = false; try { encodeTree({ bad: new Date() }); } catch { threw = true; }
    check(threw, 'a class instance stops the save');
}
console.log(`codec ✓ (${secs()})`);

// ── (a) a history, as the page's worker records it ──
const simMesh = buildSimMesh(SIM, 12345), scene = TERRAIN_SCENES.find(s => s.id === 'cycle');
const run = await runHistory({ list: 'terrain', scene, ending: 'none', start: { continentalFraction: 0.3 }, lengthMyr: LEN, keep: false }, simMesh, SEED, 10);
// (half the frames as the page keeps them: packed, as the worker sends them)
const frames = run.frames.map((f, i) => (i % 2 ? new PackedFrame(structuredClone(packFrame(f).packed)) : f));
console.log(`history: ${frames.length} frames to ${frames.at(-1).time} Myr at ${SIM} plates, ${run.steps} steps (${secs()})`);
// (the file's codec is frame-pack.js's of today: were it to pack otherwise, FRAME_CODEC must be bumped — versions.js)
{
    const plain = run.frames.at(-1), { fields } = packFrame(plain).packed;
    let d = null;
    for (const k of Object.keys(fields)) d ??= differ(unpackCodec1(fields[k]), plain[k], k);
    check(!d, `frame-pack.js still packs as codec ${FRAME_CODEC} — else bump FRAME_CODEC and read codec ${FRAME_CODEC} in migrations.js (${d})`);
    const today = Object.keys(frameArrays(1)).filter(k => !(k in fields));
    check(!today.length, `every per-cell field is in a saved frame (${today})`);
}

// ── (a) a detailed moment of it, as finish-worker.js sends it ──
const moment = frames[Math.floor(frames.length / 2)];
const slim = Object.fromEntries([...FRAME_FIELDS, ...GEO_FRAME_FIELDS].map(k => [k, moment[k]]));
slim.plates = moment.plates.map(p => p && { quat: p.quat });
const pool = await TerrainPool.create(simMesh);
const out = await finishPlanet({ frame: slim, simMesh, seed: SEED, cells: CELLS, pool, closePool: true });
const raster = finishRaster(out.mesh, out.z, out.ocean, W, null, out.lake, out.lakeLevel, out.climate.cell, out.geology, out.farming);
const climate = { ...out.climate.page, raster: raster.climate };
delete raster.climate;
const fin = structuredClone({ cells: CELLS, raster, rivers: out.rivers, climate, stats: out.stats, secs: 12.5, climateKey: '0|0' });
fin.paths = new Map([['a cache', 1]]);                      // (a view's cache: never saved)
console.log(`detailed moment: ${moment.time} Myr at ${CELLS} cells, ${W} px (${secs()})`);

// ── (a) saved, and read back ──
const settings = { seed: SEED, cont: 30, len: LEN, ending: 'none', sim: SIM, terrain: 160000, greenhouse: 0, rain: 0, more: 0 };
const history = { frames, simMesh, simMyr: run.time, steps: run.steps, stopped: run.stopped, snapshotMyr: 10 };
let t = performance.now();
const { blob, bytes } = await savePlanet({ settings, history, detail: { frame: moment, fin } });
const saveMs = performance.now() - t;
const file = FIXTURE ? path.join(FIXTURES, keptName) : path.join(OUT, 'check-save.orogen');
await write(file, blob);
console.log(`saved: ${mb(bytes)} MB → ${mb(blob.size)} MB file in ${(saveMs / 1000).toFixed(1)} s (estimate before saving ${mb(planetBytes(frames, fin))} MB) → ${path.relative(ROOT, file)}`);
t = performance.now();
const back = await readPlanet(new Blob([fs.readFileSync(file)]));
console.log(`read back in ${((performance.now() - t) / 1000).toFixed(1)} s`);

check(back.manifest.history.frames === frames.length && back.frames.length === frames.length, 'every frame is in the file');
check(!differ(back.mesh, { numCells: simMesh.numCells, xyz: simMesh.xyz, adjOffset: simMesh.adjOffset, adjList: simMesh.adjList }), 'the plate mesh comes back, its neighbours too');
const metaOf = f => (f._packed ? Object.fromEntries(Object.keys(f).map(k => [k, f[k]])) : packFrame(f).packed.meta);
let frameDiff = null;
for (let i = 0; i < frames.length && !frameDiff; i++) {
    const a = frames[i], b = new PackedFrame(back.frames[i]);
    frameDiff = differ(metaOf(a), back.frames[i].meta, `frame ${i} meta`);
    for (const k of Object.keys(back.frames[i].fields)) if (!frameDiff) frameDiff = differ(a[k], b[k], `frame ${i}.${k}`);
    if (!frameDiff && Object.keys(back.frames[i].fields).length !== Object.keys(a._packed ?? packFrame(a).packed.fields).length) frameDiff = `frame ${i}: fields missing`;
}
check(!frameDiff, `every frame comes back bit for bit (${frameDiff})`);
check(back.detail?.frame === frames.indexOf(moment), 'the detailed moment is the same frame');
const { paths, ...own } = fin, momentDiff = differ(own, back.detail.moment, 'moment');
check(!momentDiff, `the detailed moment comes back bit for bit (${momentDiff})`);
check(!('paths' in back.detail.moment), 'the views\' caches are not saved');
check(!!back.detail.moment.raster.geology?.rock && !!back.detail.moment.raster.farming?.crops, 'the rocks and the farming come back with it');
// (the Geology and Farming maps the Export panel offers, drawn from the moment read back — the Crop spread colour map's
// pins need a canvas: its spread is worked out by its data's neighbours instead)
{
    const look0 = { lut: heightLutOf('relief'), exaggeration: 20, water: false, riverQ: 40, byRegime: false, shaded: true, centerLon: 0 };
    let drawn = 0;
    for (const group of CATALOGUE.filter(g => g.id === 'geology' || g.id === 'farming')) for (const row of group.rows) {
        if (!check(rowAvailable(row, back.detail.moment, moment), `the read-back moment offers ${row.id}`)) continue;
        const jobs = [...(row.colour && row.id !== 'farmSpread' ? [{ variant: 'colour' }] : []), ...(row.data ?? []).map(file => ({ variant: 'data', file }))];
        for (const job of jobs) {
            let r = null, e = null;
            try { r = produceMap(back.detail.moment, 256, look0, { ...job, row, season: 'year' }, { frame: moment, simMesh }); } catch (x) { e = x.message; }
            const data = r?.data, varied = data && data.some(v => v !== data[0]);
            check(data && data.length >= 256 * 128 && varied, `${row.id} ${job.variant}${job.file ? ` ${job.file.key}` : ''} is drawn (${e ?? (data ? 'one colour' : 'nothing')})`);
            drawn++;
        }
    }
    console.log(`the rocks' and the farming's ${drawn} maps drawn from the moment read back (${secs()})`);
}
check(back.manifest.detail.time === moment.time && back.manifest.settings.seed === SEED, 'the manifest says what it holds');
// (a word for a seed, 2026-10: the setting added — no version bump — while the kept planets, without it, open as before)
{
    const worded = await savePlanet({ settings: { ...settings, seed: seedOf('Pangaea'), seedText: 'Pangaea' }, history, detail: { frame: moment, fin } });
    const w = await readPlanet(worded.blob);
    check(w.manifest.settings.seedText === 'Pangaea' && w.manifest.settings.seed === seedOf('Pangaea'), 'a word seed is saved with its word');
}
// (opened first — what it holds measured — then the history read without its moment: a phone's, for a desktop's detail)
const opened = await openPlanet(new Blob([fs.readFileSync(file)]));
check(opened.historyBytes > 0 && opened.detailBytes > 0 && opened.historyBytes + opened.detailBytes < bytes + 2 ** 20, `what it holds is measured before reading (${mb(opened.historyBytes)} + ${mb(opened.detailBytes)} MB)`);
const historyOnly = await opened.read({ detail: false });
check(historyOnly.detail === null && historyOnly.frames.length === frames.length, 'the history reads without its detailed moment');
{
    const corrupt = fs.readFileSync(file);
    corrupt[corrupt.length >> 1] ^= 0x40;
    let caught = null;
    try { await readPlanet(new Blob([corrupt])); } catch (err) { caught = err.message; }
    check(/damaged/.test(caught ?? ''), `a damaged file is refused (${caught})`);
    let newer = null;
    try { await readPlanet(await rewritten(blob, m => { m.frameVersion = FRAME_VERSION + 1; })); } catch (err) { newer = err.message; }
    check(/newer World Orogen/.test(newer ?? ''), `a newer file is refused, saying why (${newer})`);
}

// ── (a) older files, made by hand: an older detailed moment; frames without a field today's frames carry ──
if (!FIXTURE) {
    const older = await rewritten(blob, m => { m.finishVersion = FINISH_VERSION - 1; });
    await write(path.join(OUT, 'check-save-old-detail.orogen'), older);
    const o = await readPlanet(older);
    check(o.detail === null && /older World Orogen/.test(o.detailNote ?? '') && o.frames.length === frames.length, `an older detailed moment is left in the file, its history opened, with a note (${o.detailNote})`);
    // (the margins — a field the history gained in October 2026 — and the mantle's heat, gone from every frame)
    const gone = ['margin', 'mantleHeat'];
    const without = frames.map(f => { const p = f._packed ? { meta: metaOf(f), fields: { ...f._packed } } : packFrame(f).packed; for (const k of gone) delete p.fields[k]; return new PackedFrame(p); });
    const lacking = (await savePlanet({ settings, history: { ...history, frames: without }, detail: { frame: without[frames.indexOf(moment)], fin } })).blob;
    await write(path.join(OUT, 'check-save-no-margin.orogen'), lacking);
    const l = await readPlanet(lacking), lf = new PackedFrame(l.frames[3]);
    check(gone.every(k => lf[k]?.length === simMesh.numCells && lf[k].every(v => v === 0)), 'a field the file lacks reads as zeros');
    check(!differ(lf.owner, frames[3].owner), '…and the fields it has are as saved');
    // (a history saved before the rock record was kept: its fields read as zeros, and it is known to lack it — so its
    // moments are detailed without rocks, not with rocks from an empty record: geology-view.js hasRecord)
    const bare = frames.map(f => { const p = f._packed ? { meta: metaOf(f), fields: { ...f._packed } } : packFrame(f).packed; for (const k of GEO_FRAME_FIELDS) delete p.fields[k]; p.meta = { ...p.meta }; delete p.meta.geoSea; return new PackedFrame(p); });
    const noRecord = await readPlanet((await savePlanet({ settings, history: { ...history, frames: bare }, detail: { frame: bare[frames.indexOf(moment)], fin } })).blob);
    const nf = new PackedFrame(noRecord.frames[3]);
    check(nf.coverKm?.length === simMesh.numCells && !hasRecord(nf) && hasRecord(frames[3]), 'a history saved before the rock record reads without it (its fields zeros)');
    console.log(`older files ✓ → v2/out/check-save-old-detail.orogen, check-save-no-margin.orogen (${secs()})`);
}

// ── (b) every planet kept: it opens, its history's terrain is built, every map is drawn from its moment ──
const kept = fs.existsSync(FIXTURES) ? fs.readdirSync(FIXTURES).filter(f => f.endsWith('.orogen')).sort() : [];
check(kept.length > 0, `a planet is kept in ${path.relative(ROOT, FIXTURES)} (node v2/tools/check-save.mjs --fixture)`);
check(kept.includes(keptName), `today's versions have a planet kept: ${keptName} (node v2/tools/check-save.mjs --fixture)`);
const look = { lut: heightLutOf('relief'), exaggeration: 20, water: false, riverQ: 40, byRegime: false, shaded: true, centerLon: 0 };
for (const name of kept) {
    const p = await readPlanet(new Blob([fs.readFileSync(path.join(FIXTURES, name))]));
    const mesh = meshFromArrays(p.mesh), fs2 = p.frames.map(f => new PackedFrame(f)), f = fs2[p.detail?.frame ?? fs2.length - 1];
    // the history: every frame reads (as frame-pack.js reads, and as codec 1 was written), and a frame's terrain is built
    let codecDiff = null;
    for (const [i, fr] of p.frames.entries()) for (const k of Object.keys(fr.fields)) if (!codecDiff && p.manifest.frameCodec === 1) codecDiff = differ(fs2[i][k], unpackCodec1(fr.fields[k]), `frame ${i}.${k}`);
    check(!codecDiff, `${name}: its frames read as they were written (${codecDiff})`);
    const tMesh = terrainMesh(40000), cfg = terrainConfig(), sampler = sampleOnto(mesh, tMesh, cfg, p.manifest.settings.seed);
    let T = null, err = null;
    try { T = synthesizeTerrain(f, mesh, tMesh, { cfg, seed: p.manifest.settings.seed, sampler, carve: true }); } catch (e) { err = e.message; }
    const land = T ? T.heightKm.reduce((a, h) => a + (h > 0), 0) / tMesh.numCells : 0;
    check(T?.heightKm.length === tMesh.numCells && land > 0.05 && land < 0.8, `${name}: the terrain of ${f.time} Myr is built (${err ?? `${(100 * land).toFixed(0)} % land`})`);
    // the detailed moment: every map the Export panel offers (the colour map without its rivers' lines, and the rivers'
    // own map, need a canvas: their paths are found instead)
    if (!check(!!p.detail, `${name}: its detailed moment opens (${p.detailNote})`)) continue;
    const m = p.detail.moment;
    let maps = 0;
    for (const group of CATALOGUE) for (const row of group.rows) {
        const seasons = row.seasonal ? ['year', 'jan', 'jul'] : ['year'];
        // (a planet kept before the rocks or the farming has no such maps: the panel does not offer them)
        const newer = row.needs === 'geology' || row.needs === 'record' || row.needs === 'farming';
        if (newer && !rowAvailable(row, m, f)) continue;
        if (!check(rowAvailable(row, m, f), `${name}: ${row.id}'s data is there`)) continue;
        const jobs = [...(row.colour && row.id !== 'rivers' && row.id !== 'farmSpread' ? [{ variant: 'colour' }] : []), ...(row.data ?? []).map(file => ({ variant: 'data', file }))];
        for (const job of jobs) for (const season of seasons) {
            let r = null, e = null;
            try { r = produceMap(m, 256, look, { ...job, row, season }, { frame: f, simMesh: mesh }); } catch (x) { e = x.message; }
            const data = r?.data, varied = data && data.some(v => v !== data[0]);
            check(data && data.length >= 256 * 128 && varied, `${name}: ${row.id} ${job.variant}${job.file ? ` ${job.file.key}` : ''} ${season} is drawn (${e ?? (data ? 'one colour' : 'nothing')})`);
            maps++;
        }
    }
    const lines = [...riverPaths(m, 40)].reduce((a, b) => a + (b.path?.segments ?? 0), 0);
    check(lines > 0, `${name}: its rivers are traced (${lines} lines)`);
    console.log(`kept ${name}: ${p.frames.length} frames, ${f.time} Myr's terrain and ${maps} maps drawn ✓ (${secs()})`);
}

console.log(failures ? `\n${failures} check(s) failed (${secs()})` : `\nall checks pass (${secs()})`);
process.exit(failures ? 1 : 0);
