// The planet file's versions (plans/V2_SAVE_LOAD_PLAN.md). A file records each; a page reads every older one it can.
//
// ADDING data needs no bump: a new frame field, a new array in a detailed moment — the generic codec (tree-codec.js) saves
// it, and an older file simply lacks it (the feature that needs it is off there, or the moment can be detailed again).
// CHANGING THE MEANING of saved data does: an enum's numbering, a byte scale, a layout, the order of rows — bump the
// version it belongs to and teach the loader the old meaning (or let it drop that part of an old file and say so).

export const FORMAT = 'orogen-evolution';
/** The file's own layout: its entries and the manifest. */
export const FORMAT_VERSION = 1;
/** What a history frame's fields mean (tectonics/snapshot.js captureFrame). */
export const FRAME_VERSION = 1;
/** What a detailed moment's arrays mean (finish/finish.js, finish-worker.js: raster, rivers, climate). */
export const FINISH_VERSION = 1;
/**
 * How a frame's fields are packed in the file: 1 is frame-pack.js's form of 2026-10 ({type, length, bg?, bits?, values}
 * or {type, length, first, steps, far}). Should frame-pack.js change its form, the loader keeps reading this one.
 */
export const FRAME_CODEC = 1;
