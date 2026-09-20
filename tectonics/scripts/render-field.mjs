// Headless equirectangular render of any registered field to PNG, so a phase's
// "debug view" exists before there is a UI. No dependencies: PNG is written with
// node:zlib. Usage:
//   node scripts/render-field.mjs [--app static|prescribed] [--n 20000] [--seed 1] [--field surface.elevation]
//        [--map elevation|gray|categorical] [--width 1024] [--steps 1]
//        [--param pass.id:name=value ...] [--out /path/file.png]

import fs from 'node:fs';
import zlib from 'node:zlib';
import { buildStaticCrust } from '../app/static-crust.js';
import { buildPrescribedMotion, SURFACE_PASSES } from '../app/prescribed-motion.js';

function build(a, opts) {
  const app = a.app ?? 'static';
  if (a.nodev) opts = { ...opts, dev: false };
  if (app === 'static') return buildStaticCrust(opts);
  if (app === 'prescribed') return buildPrescribedMotion(opts);
  throw new Error(`unknown --app ${app}`);
}

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]?.startsWith('--') || arr[i + 1] === undefined ? true : arr[i + 1]]);
  return acc;
}, []));
const multi = (key) => process.argv.flatMap((a, i, arr) => a === `--${key}` ? [arr[i + 1]] : []);

const n = Number(args.n ?? 20000), seed = Number(args.seed ?? 1);
const field = args.field ?? 'surface.elevation';
const width = Number(args.width ?? 1024), height = width >> 1;
const steps = Number(args.steps ?? 1);
const out = args.out ?? `/tmp/${field.replace('.', '_')}-s${seed}-n${n}.png`;

const params = {};
for (const spec of multi('param')) {
  const m = /^([^:]+):([^=]+)=(.+)$/.exec(spec);
  if (!m) throw new Error(`bad --param "${spec}", want pass.id:name=value`);
  (params[m[1]] ??= {})[m[2]] = Number(m[3]);
}

const t0 = performance.now();
const { world, scheduler } = build(args, { n, seed, params });
scheduler.run(steps);
if ((args.app ?? 'static') !== 'static') scheduler.refresh(...SURFACE_PASSES);
const arr = world.fields[field] ?? world.diag[field];
if (!arr) throw new Error(`no field or diag "${field}"; fields: ${Object.keys(world.fields)}; diag: ${Object.keys(world.diag)}`);
const map = args.map ?? (field === 'surface.elevation' ? 'elevation' : field.endsWith('Id') || field.endsWith('type') ? 'categorical' : 'gray');

let lo = Infinity, hi = -Infinity;
for (const v of arr) { if (v < lo) lo = v; if (v > hi) hi = v; }

function lerp(a, b, t) { return a + (b - a) * t; }
function ramp(stops, v) {
  if (v <= stops[0][0]) return stops[0].slice(1);
  for (let i = 1; i < stops.length; i++) {
    if (v <= stops[i][0]) {
      const t = (v - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]);
      return [0, 1, 2].map(k => lerp(stops[i - 1][k + 1], stops[i][k + 1], t));
    }
  }
  return stops[stops.length - 1].slice(1);
}
const ELEV = [[-7000, 6, 14, 50], [-5000, 12, 30, 90], [-3500, 28, 62, 135], [-2400, 55, 105, 175], [-1200, 85, 140, 195],
              [-200, 130, 185, 215], [-1, 165, 205, 225], [0, 70, 125, 65], [400, 115, 155, 75], [1200, 175, 155, 95],
              [2500, 205, 195, 165], [4500, 250, 250, 250]];
function color(v) {
  if (map === 'elevation') return ramp(ELEV, v);
  if (map === 'categorical') {
    if (v < 0) return [40, 40, 40];
    const h = ((v * 0.618033988749895) % 1) * 6, s = 0.7, l = 0.55;
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h % 2) - 1)), m = l - c / 2;
    const [r, g, b] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
  }
  const t = hi > lo ? (v - lo) / (hi - lo) : 0;
  return [t * 255, t * 255, t * 255];
}

const rgb = new Uint8Array(width * height * 3);
const loc = world.grid.locator;
for (let py = 0; py < height; py++) {
  const lat = Math.PI / 2 - (py + 0.5) / height * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
  for (let px = 0; px < width; px++) {
    const lon = (px + 0.5) / width * 2 * Math.PI - Math.PI;
    const c = loc.nearest(cl * Math.cos(lon), cl * Math.sin(lon), sl);
    const [r, g, b] = color(arr[c]);
    const o = (py * width + px) * 3;
    rgb[o] = r; rgb[o + 1] = g; rgb[o + 2] = b;
  }
}

// --- minimal PNG encoder (RGB8, no filter) ---
const CRC = new Int32Array(256).map((_, k) => { let c = k; for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
function crc32(buf) { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii'), len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
const raw = Buffer.alloc((width * 3 + 1) * height);
for (let y = 0; y < height; y++) { raw[y * (width * 3 + 1)] = 0; raw.set(rgb.subarray(y * width * 3, (y + 1) * width * 3), y * (width * 3 + 1) + 1); }
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
fs.writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));

const ms = (performance.now() - t0).toFixed(0);
console.log(`${out}  field=${field} map=${map} range=[${lo.toFixed(1)}, ${hi.toFixed(1)}] n=${n} seed=${seed} total=${ms}ms`);
if (args.timing) for (const t of scheduler.lastTimings) console.log(`   ${t.id.padEnd(28)} ${t.ms.toFixed(1)} ms`);
