// Prints where a field's extremes are and what their neighbourhoods look like,
// plus a coarse hypsometry. The fastest way to find out *which cell* a bad
// number came from. Usage: node scripts/extremes.mjs [--n 80000] [--seed 3] [--field surface.elevation]

import { buildStaticCrust } from '../app/static-crust.js';
import { buildPrescribedMotion, SURFACE_PASSES } from '../app/prescribed-motion.js';
import { buildHistory } from '../app/history.js';

function build(a, opts) {
  const app = a.app ?? 'static';
  if (a.nodev) opts = { ...opts, dev: false };
  if (app === 'static') return buildStaticCrust(opts);
  if (app === 'prescribed') return buildPrescribedMotion(opts);
  if (app === 'history') return buildHistory(opts);
  throw new Error(`unknown --app ${app}`);
}

const a = Object.fromEntries(process.argv.slice(2).map((v, i, arr) => v.startsWith('--') ? [v.slice(2), arr[i + 1] === undefined || arr[i + 1].startsWith('--') ? true : arr[i + 1]] : null).filter(Boolean));
const n = Number(a.n ?? 80000), seed = Number(a.seed ?? 3), field = a.field ?? 'surface.elevation';
const steps = Number(a.steps ?? 1);
const { world, scheduler } = build(a, { n, seed });
scheduler.run(steps);
if ((a.app ?? 'static') !== 'static') scheduler.refresh(...SURFACE_PASSES);
const f = world.fields, v = f[field] ?? world.diag[field], e = f['surface.elevation'];
const { locator, xyz, spacingKm } = world.grid;

let iMax = 0, iMin = 0;
for (let i = 0; i < n; i++) { if (v[i] > v[iMax]) iMax = i; if (v[i] < v[iMin]) iMin = i; }
const describe = i => `t${f['crust.type'][i]} ${f['crust.thickness'][i].toFixed(1)}km ${f['crust.ageMa'][i].toFixed(0)}Ma${f['crust.isCraton'][i] ? ' craton' : ''} → ${e[i].toFixed(0)}m`;
for (const [label, i] of [['MAX', iMax], ['MIN', iMin]]) {
  console.log(`${label} ${field}[${i}] = ${v[i].toFixed(1)}   ${describe(i)}`);
  const nb = [];
  locator.forEachWithin(xyz[3 * i], xyz[3 * i + 1], xyz[3 * i + 2], 1.3 * world.grid.spacingRad, (c) => { if (c !== i) nb.push(describe(c)); });
  console.log('   ' + nb.join('\n   '));
}
const bins = [-8000, -6000, -4000, -2500, -1000, -200, 0, 200, 500, 1000, 2000, 4000, 9000];
const counts = new Array(bins.length - 1).fill(0);
let cont = 0, emergent = 0;
for (let i = 0; i < n; i++) {
  if (f['crust.type'][i] === 2) cont++;
  if (e[i] > 0) emergent++;
  for (let b = 0; b < counts.length; b++) if (e[i] >= bins[b] && e[i] < bins[b + 1]) { counts[b]++; break; }
}
console.log(`\nn=${n} seed=${seed} spacing=${spacingKm.toFixed(0)}km  continental ${(100 * cont / n).toFixed(1)}%  emergent ${(100 * emergent / n).toFixed(1)}%`);
console.log('hypsometry:');
for (let b = 0; b < counts.length; b++) console.log(`  ${String(bins[b]).padStart(6)} … ${String(bins[b + 1]).padStart(5)} m  ${'#'.repeat(Math.round(200 * counts[b] / n))} ${(100 * counts[b] / n).toFixed(1)}%`);
