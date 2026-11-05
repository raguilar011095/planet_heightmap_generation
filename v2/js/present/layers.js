// The present-day world's record as the page's stories read it (plans/GENERATE_REDESIGN_PLAN.md G7f): the readout's rock
// and record lines and the districts' stories (evolution/geology-view.js, geology/districts.js) read a Frame; the page has
// none (it stays in the worker), only this slim copy of it. Its Geology and Food are Evolution's finish's own
// (plans/SHARED_CORE_PLAN.md U1, U3).

import { PRESENT } from './present-config.js';

/** The record's fields the district stories and the readout's rock and record lines read (geology/districts.js,
 *  evolution/geology-view.js rockLine, geologyLines) — and those that are times. */
const STORY_FIELDS = ['owner', 'type', 'flags', 'geoFlags', 'oroType', 'prevType', 'volcType', 'arcMyr', 'coverKm', 'coverMaxAge', 'coverMaxKm',
    'exhumKm', 'unroofKm', 'facies', 'floodAge', 'floodMyr', 'thickKm'];
const STORY_TIMES = ['oroLast', 'prevLast', 'volcAt'];
/**
 * The Frame as the stories read it, slim: the page has no Frame (it stays in the worker), only this (~1 MB). On
 * Evolution's clock: the present-day world's past runs up to now at 0, Evolution's history from its start at 0 and a
 * belt older than the start "from before the history" — so the history here starts with the oldest past, the cores'
 * (coreAgeMyr), and now is that many Myr into it.
 */
export function storyFrame(frame, cfg = PRESENT) {
    const T = cfg.coreAgeMyr[1], f = { time: T };
    for (const k of STORY_FIELDS) f[k] = frame[k].slice();
    for (const k of STORY_TIMES) f[k] = Float32Array.from(frame[k], t => t + T);
    return f;
}
