// Pictures of the farmed Earth (tuning/farming/earth-world.mjs) for a look: its rivers, the water they bring, and what the
// history makes of it (earth-history.mjs writes those). PNGs into v2/out/earth-food/ (not committed).
// Usage: node tuning/farming/render-earth.mjs rivers|water [south north west east]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { earthWorld } from './earth-world.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const OUT = path.join(HERE, '..', '..', 'v2', 'out', 'earth-food');

/** A PNG of a box (°) of a grid field: `px(lat, lon)` → [r, g, b], `scale` pixels a degree. */
export function renderBox(file, [s, n, w, e], scale, px) {
    const W = Math.round((e - w) * scale), H = Math.round((n - s) * scale), png = new PNG({ width: W, height: H });
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const [r, g, b] = px(n - (y + 0.5) / scale, w + (x + 0.5) / scale), o = 4 * (y * W + x);
        png.data[o] = r; png.data[o + 1] = g; png.data[o + 2] = b; png.data[o + 3] = 255;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, PNG.sync.write(png));
    return file;
}
/** The Earth world's land: grey by height, the sea dark blue (into the pixel's colour). */
export function earthBase(E, la, lo) {
    const c = Math.min(E.H - 1, Math.max(0, Math.floor((90 - la) / E.deg))) * E.W + ((Math.floor((lo + 180) / E.deg) % E.W) + E.W) % E.W;
    if (E.ocean[c]) return [c, [22, 32, 64]];
    const v = 70 + 140 * Math.min(1, E.z[c] / 3);
    return [c, [v, v, v]];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const [mode = 'rivers', ...box] = process.argv.slice(2), E = earthWorld(), F = E.fin.raster.farming;
    const b = box.length === 4 ? box.map(Number) : [-60, 80, -180, 180], scale = Math.min(24, 1440 / (b[3] - b[2]));
    const file = renderBox(path.join(OUT, `${mode}-${b.join('_')}.png`), b, scale, (la, lo) => {
        const [c, col] = earthBase(E, la, lo);
        if (E.ocean[c]) return col;
        if (mode === 'water') { const f = F.flood[c] / 255, k = F.canal[c] / 255; return [col[0] * (1 - Math.max(f, k)), col[1] * (1 - k) + 255 * k * (1 - f) + 200 * f, col[2] * (1 - f) + 255 * f]; }
        const lq = Math.log10(Math.max(1, E.q[c]));
        if (lq < 1.5) return col;
        const t = Math.min(1, (lq - 1.5) / 3);
        return [40 * (1 - t), 140 + 80 * t, 255];
    });
    console.log(file);
}
