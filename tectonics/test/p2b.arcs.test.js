import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetFields } from '../state/fields.js';
import { CRUST } from '../state/crust-fields.js';
import { buildHistory, SURFACE_PASSES } from '../app/history.js';
import { plateSpeedCmPerYr } from '../state/plates.js';

beforeEach(() => resetFields());

const alive = w => w.plates.filter(p => !p.dead);

test('back-arc detachment: a mature trench front sheds an arc plate that carries the margin oceanward', () => {
  const { world, scheduler } = buildHistory({ n: 8000, seed: 7, params: {
    'policy.backArc': { detachProbability: 1, minFrontKm: 300, maturePolicySteps: 1, refractoryPolicySteps: 0 },
  } });
  // Run until an arc plate exists and still holds cells (a strip below the microplate size is
  // captured back by crust.coalescePlates, which is the intended fate of a sliver).
  let detached = 0, arc = null, cells = 0, cont = 0;
  const f = world.fields;
  for (let s = 0; s < 100 && !arc; s++) {
    scheduler.step(); detached += world.diag['policy.backArc.detached']?.[0] ?? 0;
    for (const p of alive(world).filter(p => p.isArc)) {
      cells = 0; cont = 0;
      for (let i = 0; i < 8000; i++) if (f['crust.plateId'][i] === p.id) { cells++; if (f['crust.type'][i] === CRUST.CONTINENTAL) cont++; }
      if (cells > 0) { arc = p; break; }
    }
  }
  assert.ok(detached >= 1, 'a front matured and detached');
  assert.ok(arc, 'an arc plate is alive and holds cells');
  assert.ok(cont > 0, 'the arc carries the detached margin crust, not just ocean');
  const s = plateSpeedCmPerYr(arc);
  assert.ok(s > 0 && s <= 10.1, `arc plate speed ${s}`);
});

test('coalescePlates: a stray fragment is captured by its host, a plate-sized fragment becomes a microplate', () => {
  const { world, scheduler } = buildHistory({ n: 6000, seed: 4 });
  scheduler.disable('motion.advect').step().enable('motion.advect');
  const f = world.fields, pid = f['crust.plateId'], { xyz, locator } = world.grid;
  // An ocean plate, and the cell of it farthest from the continental plate (0): deep interior.
  const ocean = alive(world).find(p => p.id !== 0 && p.stats.area > 600);
  let best = -1, bestD = -1;
  for (let i = 0; i < 6000; i += 7) {
    if (pid[i] !== ocean.id) continue;
    let d = Infinity;
    for (let j = 0; j < 6000; j += 5) if (pid[j] === 0) { const dd = (xyz[3 * i] - xyz[3 * j]) ** 2 + (xyz[3 * i + 1] - xyz[3 * j + 1]) ** 2 + (xyz[3 * i + 2] - xyz[3 * j + 2]) ** 2; if (dd < d) d = dd; }
    if (d > bestD) { bestD = d; best = i; }
  }
  // Speckle: a few cells of plate 0 painted into the ocean plate's interior.
  const small = []; locator.forEachWithin(xyz[3 * best], xyz[3 * best + 1], xyz[3 * best + 2], 1.6 * world.grid.spacingRad, c => { if (pid[c] === ocean.id) small.push(c); });
  for (const c of small) pid[c] = 0;
  const before = world.plates.length;
  scheduler.refresh('crust.coalescePlates');
  for (const c of small) assert.equal(pid[c], ocean.id, 'speckle captured by the host plate');
  assert.equal(world.plates.length, before, 'no plate spawned for speckle');
  // A disc well above spawnRadiusKm (1200 km ≈ 0.19 rad) of plate 0 inside the ocean plate.
  const big = []; locator.forEachWithin(xyz[3 * best], xyz[3 * best + 1], xyz[3 * best + 2], 0.3, c => { if (pid[c] === ocean.id) big.push(c); });
  for (const c of big) pid[c] = 0;
  scheduler.refresh('crust.coalescePlates');
  assert.equal(world.plates.length, before + 1, 'a plate-sized fragment became a microplate');
  const q = world.plates.length - 1;
  for (const c of big) assert.equal(pid[c], q);
  assert.equal(world.diag['crust.coalescePlates.spawned'][0], 1);
});

test('island arcs: after a Gyr, volcanic cells stand above sea level on thin crust', () => {
  const { world, scheduler } = buildHistory({ n: 8000, seed: 4, dev: false });
  scheduler.run(200);
  scheduler.refresh(...SURFACE_PASSES);
  const f = world.fields;
  let volcanic = 0, islands = 0, activeArcCells = 0;
  for (let i = 0; i < 8000; i++) {
    if (f['crust.volcano'][i] > 0) volcanic++;
    if (f['crust.magmaAge'][i] < 10 && f['crust.type'][i] === CRUST.OCEANIC) activeArcCells++;
    if (f['surface.elevation'][i] > 0 && f['crust.volcano'][i] > 0 && f['crust.thickness'][i] < 33) islands++;
  }
  assert.ok(volcanic >= 20, `volcanic cells ${volcanic}`);
  assert.ok(activeArcCells >= 1, `active intra-oceanic arc cells ${activeArcCells}`);
  assert.ok(islands >= 3, `emergent volcanic islands on thin crust ${islands}`);
});
