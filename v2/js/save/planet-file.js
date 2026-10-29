// The planet file (plans/V2_SAVE_LOAD_PLAN.md): an Evolution history and its detailed moment, saved to open again
// later without building either again — the history exactly as it was (the same in any browser, which a link is not),
// the moment as it was detailed. Everything else — the meshes' adjacency, each frame's terrain, the previews' climates,
// the views' caches — the page of the day builds again on opening.
//
// A ZIP (zip-io.js), each part a tree (tree-codec.js: NAME.json, and NAME.bin for its typed arrays):
//   manifest.json          the file's versions (versions.js), the world's settings, the history and the moment in brief
//   history/mesh           the plate mesh: its points and their neighbours — its cells numbered the same in every browser
//   history/events         the history's event log, once (every frame carries a copy of the log so far)
//   history/frames/NNNN    each frame: its properties, and its fields packed as frame-pack.js packs them
//   detail/moment          the detailed moment (finish-worker.js's raster, rivers and climate; its stats, time and climate)

import { ZipWriter, ZipReader } from './zip-io.js';
import { encodeTree, decodeTree, binPieces, allocArrays, arrayFiller } from './tree-codec.js';
import { FORMAT, FORMAT_VERSION, FRAME_VERSION, FINISH_VERSION, FRAME_CODEC } from './versions.js';
import { packFrame, packedBytes } from '../tectonics/frame-pack.js';
import { migrateFrame, migrateMoment, momentReadable } from './migrations.js';

/** A detailed moment's own data (not the views' caches the page hangs on it: river paths, grids, its size). */
const MOMENT_KEYS = ['cells', 'raster', 'rivers', 'climate', 'stats', 'secs', 'climateKey'];
const frameName = i => `history/frames/${String(i).padStart(4, '0')}`;

/** A frame as frame-pack.js keeps it, {meta, fields}: the page's PackedFrame as it is; a plain frame (Node) packed here. */
function packedOf(frame) {
    if (frame._packed) return { meta: Object.fromEntries(Object.keys(frame).map(k => [k, frame[k]])), fields: frame._packed };
    return packFrame(frame).packed;
}
const momentOf = fin => Object.fromEntries(MOMENT_KEYS.filter(k => k in fin).map(k => [k, fin[k]]));

/** The bytes of the typed arrays in a tree (each once). */
function arrayBytes(x, seen = new Set()) {
    if (!x || typeof x !== 'object' || seen.has(x)) return 0;
    seen.add(x);
    if (ArrayBuffer.isView(x)) return x.byteLength;
    let s = 0;
    for (const v of x instanceof Map ? x.values() : Array.isArray(x) ? x : Object.values(x)) s += arrayBytes(v, seen);
    return s;
}

/** About how many bytes a planet file holds before compression (the history's packed frames and the detailed moment). */
export function planetBytes(frames, fin) {
    let b = arrayBytes(momentOf(fin));
    for (const f of frames) b += f._packed ? packedBytes({ fields: f._packed }) : packedBytes(packFrame(f).packed);
    return b;
}

/**
 * The planet file of a history and its detailed moment.
 * `settings`: the world's ({seed, cont, len, ending, sim, terrain, greenhouse, rain, more, crops?}); `history`: {frames,
 * simMesh, simMyr, steps, stopped, snapshotMyr, omit (fields not to save: those a history opened from an older file lacked,
 * read there as zeros — so this file says it lacks them too)}; `detail`: {frame (one of the frames), fin (the page's
 * finished moment)}; `onProgress(share, text)`.
 * @returns {Promise<{blob: Blob, bytes: number}>} bytes: before compression
 */
export async function savePlanet({ settings, history, detail, onProgress = () => {} }) {
    const { frames, simMesh } = history, at = frames.indexOf(detail.frame), moment = momentOf(detail.fin), omit = new Set(history.omit ?? []);
    if (at < 0) throw new Error('the detailed moment is not one of this history’s');
    // the parts, encoded (their arrays referenced, not copied); the event log once, each frame's own copy as how much of
    // it there was, and any entry it holds otherwise (none, while the log is only ever added to)
    const packed = frames.map(packedOf), log = packed.at(-1).meta.events ?? [], logJson = log.map(e => JSON.stringify(e));
    const parts = [['history/mesh', encodeTree({ numCells: simMesh.numCells, xyz: simMesh.xyz, adjOffset: simMesh.adjOffset, adjList: simMesh.adjList })], ['history/events', encodeTree(log)]];
    packed.forEach(({ meta, fields }, i) => {
        const { events = [], ...rest } = meta, differ = [];
        for (let j = 0; j < events.length; j++) if (j >= log.length || JSON.stringify(events[j]) !== logJson[j]) differ.push([j, events[j]]);
        const kept = omit.size ? Object.fromEntries(Object.entries(fields).filter(([k]) => !omit.has(k))) : fields;
        parts.push([frameName(i), encodeTree({ meta: rest, fields: kept, events: events.length, eventsDiffer: differ })]);
    });
    parts.push(['detail/moment', encodeTree(moment)]);
    const total = parts.reduce((a, [, t]) => a + t.byteLength + t.json.length, 0);
    const manifest = {
        format: FORMAT, formatVersion: FORMAT_VERSION, frameVersion: FRAME_VERSION, finishVersion: FINISH_VERSION, frameCodec: FRAME_CODEC,
        littleEndian: true, savedAt: new Date().toISOString(),
        savedBy: typeof navigator !== 'undefined' ? navigator.userAgent : `Node ${globalThis.process?.version ?? ''}`,
        settings,
        history: { frames: frames.length, fromMyr: frames[0].time, toMyr: frames.at(-1).time, snapshotMyr: history.snapshotMyr, simMyr: history.simMyr, steps: history.steps, stopped: history.stopped ?? null, events: log.length },
        detail: { frame: at, time: detail.frame.time, cells: moment.cells, width: moment.raster?.w ?? null, climateKey: moment.climateKey ?? null, secs: moment.secs ?? null },
        bytes: total,
    };
    const zip = new ZipWriter();
    let done = 0;
    const onBytes = n => { done += n; };
    await zip.add('manifest.json', [new TextEncoder().encode(JSON.stringify(manifest, null, 2))]);
    for (let i = 0; i < parts.length; i++) {
        const [name, tree] = parts[i];
        const what = name.startsWith('history/frames/') ? `the history: moment ${i - 1} of ${frames.length}` : name === 'detail/moment' ? 'the detailed moment' : 'the history';
        onProgress(done / total, `Saving ${what}…`);
        await zip.add(`${name}.json`, [new TextEncoder().encode(tree.json)], { onBytes });
        if (tree.byteLength) {
            let last = performance.now();
            await zip.add(`${name}.bin`, binPieces(tree), { onBytes: n => {
                onBytes(n);
                if (performance.now() - last > 250) { last = performance.now(); onProgress(done / total, `Saving ${what}… ${Math.round(100 * done / total)}%`); }
            } });
        }
    }
    return { blob: zip.finish(), bytes: total };
}

/**
 * A planet file opened: its manifest read and checked, and the bytes its history and its detailed moment hold (before
 * compression) — so a page can refuse what it cannot hold before reading any of it. `read({detail, onProgress})` then
 * reads it, an older file's parts as today reads them (migrations.js): {mesh: {numCells, xyz, adjOffset, adjList}, frames:
 * [{meta, fields}] (as frame-pack.js packs them — the page's `new PackedFrame(f)`), detail: {frame (its index), moment}
 * or null (none in the file, `detail: false`, or one too old to read: `detailNote` says so), lacking: the fields today's
 * frames carry that the file's lack (read as zeros: migrations.js)}. `onProgress(share, text)`.
 * Throws, saying why, on a file it cannot read.
 */
export async function openPlanet(blob) {
    const zip = await ZipReader.open(blob);
    if (!zip.has('manifest.json')) throw new Error('not a planet file (it has no manifest)');
    const manifest = await zip.json('manifest.json');
    if (manifest.format !== FORMAT) throw new Error('not an Evolution planet file');
    if (manifest.formatVersion > FORMAT_VERSION || manifest.frameVersion > FRAME_VERSION || manifest.finishVersion > FINISH_VERSION || manifest.frameCodec > FRAME_CODEC) {
        throw new Error('this planet was saved by a newer World Orogen — reload the page to update it, then open the file again');
    }
    if (manifest.littleEndian === false) throw new Error('this planet file was written in a byte order this device does not use');
    let historyBytes = 0, detailBytes = 0;
    for (const e of zip.entries.values()) { if (e.name.startsWith('history/')) historyBytes += e.size; else if (e.name.startsWith('detail/')) detailBytes += e.size; }
    // (a moment too old to read today is left in the file: its history opens, ready to be detailed again)
    const hasDetail = !!manifest.detail && zip.has('detail/moment.json'), readable = hasDetail && momentReadable(manifest.finishVersion);
    async function read({ detail: wantDetail = true, onProgress = () => {} } = {}) {
        const withDetail = wantDetail && readable, total = historyBytes + (withDetail ? detailBytes : 0) || 1;
        let done = 0;
        const part = async (name, what) => {
            const json = await zip.json(`${name}.json`), arrays = allocArrays(json.a);
            done += zip.entries.get(`${name}.json`).size;
            if (json.a.length) {
                const fill = arrayFiller(json.a, arrays);
                let last = 0;
                for await (const p of zip.pieces(`${name}.bin`)) {
                    fill.push(p); done += p.length;
                    if (performance.now() - last > 250) { last = performance.now(); onProgress(done / total, `Opening ${what}… ${Math.round(100 * done / total)}%`); }
                }
                fill.done();
            }
            return decodeTree(json, arrays);
        };
        onProgress(0, 'Opening the history…');
        const mesh = await part('history/mesh', 'the history'), log = await part('history/events', 'the history'), frames = [], lacking = new Set();
        for (let i = 0; i < manifest.history.frames; i++) {
            const f = await part(frameName(i), 'the history');
            const events = log.slice(0, f.events);
            for (const [j, e] of f.eventsDiffer ?? []) events[j] = e;
            frames.push(migrateFrame({ meta: { ...f.meta, events }, fields: f.fields }, manifest, mesh.numCells, lacking));
        }
        let detail = null, detailNote = hasDetail && !readable ? migrateMoment(null, manifest.finishVersion).note : null;
        if (withDetail) {
            const m = migrateMoment(await part('detail/moment', 'the detailed moment'), manifest.finishVersion);
            if (m.moment) detail = { frame: manifest.detail.frame, moment: m.moment }; else detailNote = m.note;
        }
        return { mesh, frames, detail, detailNote, lacking: [...lacking] };
    }
    return { manifest, historyBytes, detailBytes: readable ? detailBytes : 0, read };
}

/** A planet file read back whole (openPlanet, then read): {manifest, mesh, frames, detail}. */
export async function readPlanet(blob, opts) {
    const planet = await openPlanet(blob);
    return { manifest: planet.manifest, ...(await planet.read(opts)) };
}
