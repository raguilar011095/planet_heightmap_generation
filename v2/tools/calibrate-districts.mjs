// The deposits' district thresholds for today's settings (geology/district-shapes.js), calibrated once and kept in
// v2/js/geology/district-thresholds.js — so no finish spends the time calibrating them. Run it after changing
// geology-config.js's deposits.district or deposits.shapes (check-geology.mjs says when the kept table is out of date;
// until then a finish calibrates them itself — the same values, slower).
//
//   node v2/tools/calibrate-districts.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { calibrationKey, calibrateDistricts } from '../js/geology/district-shapes.js';
import { districtSystems, DEPOSITS } from '../js/geology/deposits.js';
import { GEOLOGY } from '../js/geology/geology-config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const systems = districtSystems(GEOLOGY), S = GEOLOGY.deposits.shapes, t0 = performance.now();
const T = calibrateDistricts(systems, S), key = calibrationKey(systems, S);
const rows = T.map((t, k) => `        [${t.join(', ')}],   // ${DEPOSITS[k].id}`).join('\n');
fs.writeFileSync(path.join(ROOT, 'v2', 'js', 'geology', 'district-thresholds.js'),
`// The deposits' district thresholds [edge from, edge to, rich core] for today's settings — made by
// v2/tools/calibrate-districts.mjs from geology-config.js (deposits.district, deposits.shapes); district-shapes.js uses them
// while the settings' key matches, and calibrates afresh when it does not. Do not edit by hand.
export const DISTRICT_THRESHOLDS = {
    key: '${key}',
    thresholds: [
${rows}
    ],
};
`);
console.log(`calibrated ${T.length} systems in ${(performance.now() - t0).toFixed(0)} ms → v2/js/geology/district-thresholds.js (key ${key})`);
