// Counts connected pieces of continental crust (storage adjacency) and their
// sizes, so "the continents are breaking into hundreds of bits" is a number.
// Usage: node scripts/fragments.mjs [--app history] [--n 20000] [--seed 7] [--steps 200]

import { buildHistory } from '../app/history.js';
import { buildPrescribedMotion } from '../app/prescribed-motion.js';
import { radiusNeighbors } from '../state/neighbors.js';
import { CRUST } from '../state/crust-fields.js';

const a = Object.fromEntries(process.argv.slice(2).map((v, i, arr) => v.startsWith('--') ? [v.slice(2), arr[i + 1] === undefined || arr[i + 1].startsWith('--') ? true : arr[i + 1]] : null).filter(Boolean));
const n = Number(a.n ?? 20000), seed = Number(a.seed ?? 7), steps = Number(a.steps ?? 200);
const { world, scheduler } = (a.app === 'prescribed' ? buildPrescribedMotion : buildHistory)({ n, seed, dev: false });
scheduler.run(steps);
const type = world.fields['crust.type'], plateId = world.fields['crust.plateId'];
const nb = radiusNeighbors(world, 1.3 * world.grid.spacingRad);
const comp = new Int32Array(n).fill(-1);
const sizes = [];
for (let s = 0; s < n; s++) {
  if (type[s] !== CRUST.CONTINENTAL || comp[s] >= 0) continue;
  const id = sizes.length; let size = 0; const stack = [s]; comp[s] = id;
  while (stack.length) {
    const i = stack.pop(); size++;
    for (let k = nb.offset[i], ke = nb.offset[i + 1]; k < ke; k++) { const c = nb.idx[k]; if (type[c] === CRUST.CONTINENTAL && comp[c] < 0) { comp[c] = id; stack.push(c); } }
  }
  sizes.push(size);
}
sizes.sort((x, y) => y - x);
const cont = sizes.reduce((x, y) => x + y, 0);
const bins = [[1, 3], [4, 20], [21, 100], [101, 1000], [1001, Infinity]];
console.log(`n=${n} seed=${seed} steps=${steps}: ${sizes.length} continental pieces, ${cont} cells (${(100 * cont / n).toFixed(1)}%), plates ${world.plates.filter(p => !p.dead).length}`);
for (const [lo, hi] of bins) { const s = sizes.filter(x => x >= lo && x <= hi); console.log(`  ${String(lo).padStart(5)}-${String(hi === Infinity ? '∞' : hi).padEnd(5)} cells: ${String(s.length).padStart(4)} pieces holding ${(100 * s.reduce((x, y) => x + y, 0) / cont).toFixed(1)}% of continental crust`); }
console.log('  largest:', sizes.slice(0, 8).join(', '));
