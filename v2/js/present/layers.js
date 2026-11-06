// The present-day world's record as the page's stories read it (plans/GENERATE_REDESIGN_PLAN.md G7f): the readout's rock
// and record lines and the districts' stories (evolution/geology-view.js, geology/districts.js) read a Frame; the page has
// none (it stays in the worker), only this slim copy of it. Its Geology and Food are Evolution's finish's own
// (plans/SHARED_CORE_PLAN.md U1, U3), from the Frame on the history's clock (historyFrame).

import { CrustType, VolcanicType } from '../tectonics/model/crust.js';
import { GEO_FRAME_FIELDS, GEOLOGY_READS } from '../tectonics/model/geology.js';
import { FRAME_FIELDS } from '../terrain/terrain-pool.js';
import { PRESENT } from './present-config.js';

/** The Frame's fields that are times (sim Myr), shifted onto the history's clock. */
const TIMES = ['formedAt', 'oroStart', 'oroLast', 'prevLast', 'volcAt'];
/** The record's fields the district stories and the readout's rock and record lines read (geology/districts.js,
 *  evolution/geology-view.js rockLine, geologyLines) — and those that are times. */
const STORY_FIELDS = ['owner', 'type', 'flags', 'geoFlags', 'oroType', 'prevType', 'volcType', 'arcMyr', 'coverKm', 'coverMaxAge', 'coverMaxKm',
    'exhumKm', 'unroofKm', 'facies', 'floodAge', 'floodMyr', 'thickKm', 'volcKm', 'volcWornKm'];
const STORY_TIMES = ['oroLast', 'prevLast', 'volcAt'];

/**
 * The present-day world's Frame on Evolution's clock, as the finish's geology reads it (owner, 2026-11-05: the deposits
 * "doesnt look like evolution"; plans/GENERATE_DEPOSITS_PLAN.md). The present-day world's past runs up to now at 0;
 * Evolution's history from its start at 0, a belt older than the start "from before the history", and a deposit's age
 * read against the history's length (geology/deposits.js: how long since a belt or an arc, at most the history's own) —
 * so the history here starts with the oldest past, the cores' (coreAgeMyr), and now is that many Myr into it. A docked
 * arc's crust was born when its arc began (present/record.js arcBornAgo). Times differ only by the shift elsewhere, so
 * the terrain reads it alike; a shallow copy, the shifted fields new.
 * @param {Object} frame  the present-day world's (present/frame.js, at time 0)
 * @param {{arcBornAgo?: Float32Array}} [record]  present/record.js's
 */
export function historyFrame(frame, record = null, cfg = PRESENT) {
    const T = cfg.coreAgeMyr[1], f = { ...frame, time: T };
    for (const k of TIMES) if (frame[k]) f[k] = Float32Array.from(frame[k], t => t + T);
    const born = record?.arcBornAgo;
    if (born) for (let c = 0; c < born.length; c++) if (born[c] > 0 && frame.type[c] !== CrustType.OCEAN) f.formedAt[c] = T - born[c];
    // (the old flood basalts, worn to their feeders: present/record.js oldLip — where no younger volcanism stands)
    const lip = record?.oldLip;
    if (lip?.cells) {
        for (const k of ['volcType', 'volcKm', 'volcWornKm']) f[k] = frame[k].slice();
        for (let c = 0; c < lip.age.length; c++) {
            if (!(lip.age[c] > 0) || frame.volcType[c] !== VolcanicType.NONE) continue;
            f.volcType[c] = VolcanicType.LIP; f.volcAt[c] = T - lip.age[c]; f.volcKm[c] = cfg.lipThicknessKm; f.volcWornKm[c] = cfg.lipThicknessKm * lip.worn[c];
        }
    }
    return f;
}

/**
 * The finish's Frame (js/planet-worker.js sends it to Evolution's finish, check-present.mjs finishes with it): the Frame on
 * the history's clock, only the fields the terrain and the geology read, its time and its plates' rotations. Not copied.
 */
export function finishFrame(frame, record = null, cfg = PRESENT) {
    const h = historyFrame(frame, record, cfg);
    const f = Object.fromEntries([...FRAME_FIELDS, ...GEO_FRAME_FIELDS, ...GEOLOGY_READS].filter(k => ArrayBuffer.isView(h[k])).map(k => [k, h[k]]));
    f.time = h.time;
    f.plates = h.plates.map(p => p && { quat: p.quat });
    return f;
}

/**
 * The Frame as the stories read it, slim: the page has no Frame (it stays in the worker), only this (~1 MB) — of the
 * Frame on the history's clock (historyFrame: give it that, or the present-day world's Frame and its record).
 */
export function storyFrame(frame, record = null, cfg = PRESENT) {
    const h = frame.time === cfg.coreAgeMyr[1] ? frame : historyFrame(frame, record, cfg), f = { time: h.time };
    for (const k of [...STORY_FIELDS, ...STORY_TIMES]) f[k] = h[k].slice();
    return f;
}
