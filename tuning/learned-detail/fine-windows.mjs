// Phase 0 of plans/TERRAIN_DIFFUSION_EXPLORATION.md: today's detail finer than the mesh (finish/fine-detail.js fineWindow)
// drawn for windows of a moment saved by make-moment.mjs, for the Python side to compare with the learned detail —
// each window's heights (km, Float32), sea and lakes, and the same window with no detail (the picture enlarged: the base).
//
//   node tuning/learned-detail/fine-windows.mjs <outDir> <windows.json>
//   windows.json: [{ "name": "range", "W": 16384, "x0": 1000, "y0": 300, "w": 1024, "h": 1024 }, …]  (W: the planet's width
//   the window is a window of; x0, y0, w, h in its pixels — as detail-view.js's windows are)

import fs from 'node:fs';
import path from 'node:path';
import { readPlanet } from '../../v2/js/save/planet-file.js';
import { detailSource, fineWindow } from '../../v2/js/finish/fine-detail.js';

const OUT = process.argv[2], windows = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const bytes = fs.readFileSync(path.join(OUT, 'moment.orogen'));
const planet = await readPlanet(new Blob([bytes]));
const fin = planet.detail.moment, seed = planet.manifest.settings.seed;
console.log(`moment: ${fin.raster.w} px, drivers ${fin.raster.drivers ? 'yes' : 'no'}, seed ${seed}`);
const src = detailSource(fin, seed), base = { ...src, d: null };
for (const win of windows) {
    const t0 = performance.now();
    const fine = fineWindow(src, win), plain = fineWindow(base, win);
    const dir = path.join(OUT, 'windows', win.name);
    fs.mkdirSync(dir, { recursive: true });
    const put = (name, a) => fs.writeFileSync(path.join(dir, name), Buffer.from(a.buffer, a.byteOffset, a.byteLength));
    put('fine_h.f32', fine.h); put('fine_sea.u8', fine.sea); put('fine_wat.u8', fine.wat);
    put('base_h.f32', plain.h); put('base_sea.u8', plain.sea);
    fs.writeFileSync(path.join(dir, 'window.json'), JSON.stringify(win));
    console.log(`${win.name}: ${win.w}×${win.h} at W ${win.W} (${(2 * Math.PI * 6371 / win.W).toFixed(2)} km/px) in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
}
process.exit(0);
