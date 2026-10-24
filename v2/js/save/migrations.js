// A planet file saved by an older World Orogen, read today (plans/V2_SAVE_LOAD_PLAN.md; versions.js says when each
// version changes). Three things can be older in a file:
//   its frame codec    how a frame's fields were packed: today's frame-pack.js reads codec 1 as it is; should it pack
//                      otherwise one day (FRAME_CODEC 2), codec 1 is unpacked here by the frozen copy below and packed again
//   its frame version  what a frame's fields mean: each bump of FRAME_VERSION comes with a step below, from the version
//                      before (the history is the file — it must always load)
//   its finish version what a detailed moment's arrays mean: a bump comes with a step below — or, where one is not worth
//                      writing, without: the old moment is then left in the file and its history loads with a note, the
//                      moment ready to be detailed again
// And a field newer than the file (one today's frames carry that its frames do not) reads as zeros: that feature off.

import { FRAME_VERSION, FINISH_VERSION, FRAME_CODEC } from './versions.js';
import { packFrame } from '../tectonics/frame-pack.js';
import { frameArrays } from '../tectonics/snapshot.js';

const CTORS = { Int8Array, Uint8Array, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array };

/**
 * Codec 1's unpack, frozen as frame-pack.js had it in 2026-10 ({type, length, first, steps, far}: cell ids in order, the
 * steps between them; {type, length, bg?, bits?, values}: the cells that differ from the background, or the whole field).
 * Never change it: files of codec 1 are read with it once frame-pack.js packs otherwise.
 */
export function unpackCodec1(f) {
    if (f.steps) {
        const out = new Int32Array(f.length), { steps, far } = f;
        out[0] = f.first;
        for (let i = 1, j = 0; i < f.length; i++) out[i] = out[i - 1] + 1 + (steps[i - 1] < 255 ? steps[i - 1] : far[j++]);
        return out;
    }
    if (!f.bits) return f.values;
    const out = new CTORS[f.type](f.length), { bits, values } = f;
    if (f.bg) out.fill(f.bg);
    for (let i = 0, j = 0; i < f.length; i++) if (bits[i >> 3] & (1 << (i & 7))) out[i] = values[j++];
    return out;
}
const UNPACK = { 1: unpackCodec1 };

/**
 * The steps from each older frame version to the next: FRAME_STEPS[v](frame) takes a frame of version v (its fields
 * unpacked: {time, plates, …, owner: Int16Array, …}) and returns it as version v + 1 means it. None yet.
 */
const FRAME_STEPS = {};
/**
 * The steps from each older finish version to the next: FINISH_STEPS[v](moment) takes a detailed moment of version v and
 * returns it as v + 1 means it (or null: it cannot be). A version with no step: its moments are detailed again. None yet.
 */
const FINISH_STEPS = {};

/** Whether a detailed moment of this finish version can be read today (else it is left in the file). */
export const momentReadable = v => { for (let k = v; k < FINISH_VERSION; k++) if (!FINISH_STEPS[k]) return false; return true; };

/** Today's per-cell fields and their types (frameArrays: captureFrame's). */
let schema = null;
const fieldTypes = () => (schema ??= Object.entries(frameArrays(1)).map(([k, v]) => [k, v.constructor.name]));

/**
 * A frame read from a file ({meta, fields}, packed by `manifest.frameCodec`, meaning `manifest.frameVersion`), as today's
 * PackedFrame reads it — `numCells` the plate mesh's. A field today's frames carry and this one lacks is all zeros.
 */
export function migrateFrame(frame, manifest, numCells) {
    let { meta, fields } = frame;
    if (manifest.frameCodec !== FRAME_CODEC || manifest.frameVersion !== FRAME_VERSION) {
        const unpack = UNPACK[manifest.frameCodec];
        if (!unpack) throw new Error(`this planet's history is packed in a way this World Orogen cannot read (codec ${manifest.frameCodec})`);
        let plain = { ...meta };
        for (const [k, f] of Object.entries(fields)) plain[k] = unpack(f);
        for (let v = manifest.frameVersion; v < FRAME_VERSION; v++) {
            if (!FRAME_STEPS[v]) throw new Error(`this planet's history was saved by an older World Orogen that this one cannot read (frame version ${v})`);
            plain = FRAME_STEPS[v](plain);
        }
        ({ meta, fields } = packFrame(plain).packed);
    }
    // (zeros, packed: every cell the background — one bitmap of none, shared)
    let none = null;
    for (const [k, type] of fieldTypes()) {
        if (fields[k]) continue;
        if (fields === frame.fields) fields = { ...fields };
        fields[k] = { type, length: numCells, bg: 0, bits: (none ??= new Uint8Array((numCells + 7) >> 3)), values: new CTORS[type](0) };
    }
    return { meta, fields };
}

/**
 * A detailed moment read from a file of finish version `v`, as today reads it: {moment} — or {moment: null, note} when it
 * cannot be (the history is shown without it, ready to be detailed again).
 */
export function migrateMoment(moment, v) {
    for (let k = v; k < FINISH_VERSION && moment; k++) moment = FINISH_STEPS[k] ? FINISH_STEPS[k](moment) : null;
    return moment ? { moment } : { moment: null, note: 'Its detailed moment was made by an older World Orogen, whose detail this one draws differently' };
}
