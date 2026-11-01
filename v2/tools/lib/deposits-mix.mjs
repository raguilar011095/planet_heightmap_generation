// For the deposits' render tools (render-deposits.mjs, render-district-options.mjs): a picture of several metals at once —
// each place its richest of them, inked as the page inks a wash — so it shows how much they go together; and main's own
// deposits (a version from git), loaded beside the geology for a moment, to draw "today" with the same painting.

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { inkWash, washGround } from '../../js/evolution/geology-view.js';
import { DEPOSITS, METALS } from '../../js/geology/deposits.js';
import { GEOLOGY } from '../../js/geology/geology-config.js';

export const MIX = ['copper', 'gold', 'leadZinc', 'tin', 'nickel'];

/** The colour of several metals at once on a picture W wide, from deposits Dp (depositFields'). */
export function mixColor(Dp, W, ids = MIX) {
    const H = W >> 1, SYS = DEPOSITS.length, K = Dp.cells.length, p0 = GEOLOGY.deposits.grades[0], wash = {};
    const rows = Dp.rows ?? SYS + METALS.length, sys = rows - METALS.length;
    const grids = ids.map(id => { const mi = METALS.findIndex(m => m.id === id), g = new Float32Array(Dp.w * Dp.h); for (let j = 0; j < K; j++) g[Dp.cells[j]] = Dp.data[(sys + mi) * K + j] / 255; return { g, rgb: METALS[mi].rgb }; });
    return (out, o, x, y, wet, kk, k3, v, lake) => {
        washGround(out, o, wet, kk, lake);
        if (wet) return;
        const la = 90 - (y + 0.5) / H * 180, lo = (x + 0.5) / W * 360 - 180;
        const gx = (lo + 180) / Dp.step - 0.5, gy = Math.max(0, Math.min(Dp.h - 1, (90 - la) / Dp.step - 0.5)), x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
        const xa = ((x0 % Dp.w) + Dp.w) % Dp.w, xb = (xa + 1) % Dp.w, y1 = Math.min(Dp.h - 1, y0 + 1);
        let best = null, bv = 0;
        for (const G of grids) {
            const g = G.g, val = g[y0 * Dp.w + xa] * (1 - fx) * (1 - fy) + g[y0 * Dp.w + xb] * fx * (1 - fy) + g[y1 * Dp.w + xa] * (1 - fx) * fy + g[y1 * Dp.w + xb] * fx * fy;
            if (val > bv) { bv = val; best = G; }
        }
        if (best && bv >= p0) inkWash(out, o, best.rgb, bv, wet, kk, wash);
    };
}

/** depositFields as git `ref` has it (with its own config): written beside the geology, imported, removed again. */
export async function depositFieldsAt(root, ref) {
    const dir = path.join(root, 'v2', 'js', 'geology'), dep = path.join(dir, '_ref-deposits.tmp.js'), cfg = path.join(dir, '_ref-config.tmp.js');
    fs.writeFileSync(cfg, execSync(`git show ${ref}:v2/js/geology/geology-config.js`, { cwd: root }));
    fs.writeFileSync(dep, execSync(`git show ${ref}:v2/js/geology/deposits.js`, { cwd: root }).toString().replace("from './geology-config.js'", "from './_ref-config.tmp.js'"));
    try { return (await import(pathToFileURL(dep).href)).depositFields; } finally { fs.rmSync(dep); fs.rmSync(cfg); }
}
