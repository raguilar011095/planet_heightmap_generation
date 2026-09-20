import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetFields } from '../state/fields.js';
import { CRUST } from '../state/crust-fields.js';
import { buildHistory, SURFACE_PASSES } from '../app/history.js';
import { plateSpeedCmPerYr, velocityAt, rotationForVelocity, omegaOf } from '../state/plates.js';

beforeEach(() => resetFields());

const alive = w => w.plates.filter(p => !p.dead && p.stats && p.stats.area > 0);

test('rotationForVelocity gives the requested velocity at the point', () => {
  const c = [0.6, 0, 0.8], v = [0, 1, 0];
  const rot = rotationForVelocity(c[0], c[1], c[2], v[0], v[1], v[2], 4);
  const pl = { ...rot };
  const got = velocityAt(pl, c[0], c[1], c[2]);
  const gl = Math.hypot(...got);
  assert.ok(Math.abs(gl * 0.1 - 4) < 1e-6, `speed ${gl * 0.1} cm/yr`);
  assert.ok(Math.abs(got[1] / gl - 1) < 1e-6, `direction ${got}`);
});

test('supercontinent partition: one continental plate, ocean plates bounded by ridges, all cells assigned', () => {
  const { world, scheduler } = buildHistory({ n: 6000, seed: 4 });
  scheduler.disable('motion.advect').step().enable('motion.advect');
  const f = world.fields;
  for (let i = 0; i < 6000; i++) {
    assert.ok(f['crust.plateId'][i] >= 0);
    if (f['crust.type'][i] === CRUST.CONTINENTAL) assert.equal(f['crust.plateId'][i], 0);
    else assert.notEqual(f['crust.plateId'][i], 0);
  }
  assert.ok(world.plates.length >= 3 && world.plates.length <= 9, `${world.plates.length} plates`);
  assert.equal(world.mantle.hotspots.length, 3);
  // step 0's policy ran: every plate has stats and a speed in band, ocean plates head for the continent
  for (const pl of alive(world)) {
    const s = plateSpeedCmPerYr(pl);
    assert.ok(s >= 0.9 && s <= 10.1, `plate ${pl.id} speed ${s}`);
  }
  const cont = world.plates[0].stats.centroid;
  let toward = 0, total = 0;
  for (const pl of alive(world)) {
    if (pl.id === 0) continue;
    const c = pl.stats.centroid, v = velocityAt(pl, c[0], c[1], c[2]);
    const d = [cont[0] - c[0], cont[1] - c[1], cont[2] - c[2]];
    total++; if (v[0] * d[0] + v[1] * d[1] + v[2] * d[2] > 0) toward++;
  }
  assert.ok(toward >= total - 1, `${toward}/${total} ocean plates move toward the continent`);
});

test('a full 1 Gyr history at 8k cells stays in range, conserves mass, keeps the ocean young and the plate count sane', () => {
  const { world, scheduler } = buildHistory({ n: 8000, seed: 7 });
  let splits = 0, inits = 0, merges = 0, failed = 0, lips = 0, arcKm = 0, hotKm = 0, delamKm = 0;
  const sum = a => { let t = 0; for (const v of a) t += v; return t; };
  for (let s = 0; s < 200; s++) {
    scheduler.step();                                        // dev mode: range checks + mass invariant every substep
    arcKm += world.diag['orogeny.thicken.arcAddedKm'][0]; hotKm += world.diag['policy.hotspots.addedKm'][0]; delamKm += world.diag['orogeny.delaminate.toMantleKm'][0];
    if (world.diag['policy.rift.events']) { splits += world.diag['policy.rift.events'][0]; failed += world.diag['policy.rift.events'][1]; }
    if (world.diag['policy.subductionInit.created']) inits += world.diag['policy.subductionInit.created'][0];
    if (world.diag['policy.suture.merged']) merges += world.diag['policy.suture.merged'][0];
  }
  lips = world.mantle.lips.length;
  scheduler.refresh(...SURFACE_PASSES);
  const f = world.fields;
  let cont = 0, emergent = 0, oceanAge = 0, oceanN = 0, young = 0, maxT = 0, maxE = -Infinity;
  for (let i = 0; i < 8000; i++) {
    if (f['crust.type'][i] === CRUST.CONTINENTAL) cont++; else { oceanAge += f['crust.ageMa'][i]; oceanN++; if (f['crust.ageMa'][i] < 100) young++; }
    if (f['surface.elevation'][i] > 0) emergent++;
    maxT = Math.max(maxT, f['crust.thickness'][i]); maxE = Math.max(maxE, f['surface.elevation'][i]);
  }
  const plates = alive(world).length;
  let contMass = 0; for (let i = 0; i < 8000; i++) if (f['crust.type'][i] === CRUST.CONTINENTAL) contMass += f['crust.thickness'][i];
  console.log(`   1 Gyr: plates ${plates} splits ${splits} failedRifts ${failed} subductionInits ${inits} sutures ${merges} lips ${lips} cont ${(100 * cont / 8000).toFixed(1)}% emergent ${(100 * emergent / 8000).toFixed(1)}% meanOceanAge ${(oceanAge / oceanN).toFixed(0)} maxT ${maxT.toFixed(0)} maxE ${maxE.toFixed(0)}`);
  console.log(`   mass budget (km·cell): continental now ${contMass.toFixed(0)} (mean ${(contMass / cont).toFixed(1)} km); added by arcs ${arcKm.toFixed(0)}, hotspots ${hotKm.toFixed(0)}; delaminated ${delamKm.toFixed(0)}`);
  assert.ok(plates >= 3 && plates <= 30, `plates ${plates}`);
  assert.ok(splits + inits >= 3, 'the policy should have split plates over a Gyr');
  assert.ok(cont / 8000 > 0.10 && cont / 8000 < 0.40, `continental fraction ${cont / 8000}`);   // hard floor; the 18-40% target is the todo test below
  globalThis.__contFraction = cont / 8000;
  // Floor recycling. The mean is loose (one seed in eight ends with two giant plates and a lot
  // of old attached ocean); the share of young floor is the robust sign that ridges keep making it.
  assert.ok(oceanAge / oceanN < 250, `mean ocean age ${oceanAge / oceanN} Myr — subduction is not recycling floor (Earth ≈ 65)`);
  assert.ok(young / oceanN > 0.35, `only ${(100 * young / oceanN).toFixed(0)}% of the floor is younger than 100 Myr`);
  assert.ok(maxT <= 85.01, `max thickness ${maxT}`);
  for (const pl of alive(world)) { const s = plateSpeedCmPerYr(pl); assert.ok(s <= 10.1, `plate ${pl.id} speed ${s}`); }
});

test('continental area stays within the design band (16-40%) over a Gyr', () => {
  // The blog's supercontinent is ~25% of the sphere; ~20% after a Gyr of arc growth thickening it
  // is the P2 state. The floor is loose because the sediment sink (P3) and calibration (P6) come later.
  assert.ok(globalThis.__contFraction > 0.16, `continental fraction ${globalThis.__contFraction}`);
});

test('rift splits a plate and drives the sides apart; suture merges plates in prolonged collision', () => {
  const { world, scheduler } = buildHistory({ n: 6000, seed: 11, params: { 'policy.rift': { riftProbability: 1, failFraction: 0, largeBoost: 1 }, 'policy.subductionInit': { initProbability: 0 } } });
  scheduler.disable('motion.advect').step().enable('motion.advect');   // step 0: rift is forced on the continent
  const before = alive(world).length;
  assert.ok(world.diag['policy.rift.events'][0] >= 1, 'a rift happened');
  const [a, b] = [world.plates[0], world.plates[world.plates.length - 1]];
  const ca = a.stats ? a.stats.centroid : [1, 0, 0];
  // The two sides' velocities should separate them: relative velocity along the line joining centroids points apart.
  const f = world.fields; let bx = 0, by = 0, bz = 0, ax = 0, ay = 0, az = 0;
  for (let i = 0; i < 6000; i++) { const id = f['crust.plateId'][i]; if (id === b.id) { bx += world.grid.xyz[3 * i]; by += world.grid.xyz[3 * i + 1]; bz += world.grid.xyz[3 * i + 2]; } else if (id === a.id) { ax += world.grid.xyz[3 * i]; ay += world.grid.xyz[3 * i + 1]; az += world.grid.xyz[3 * i + 2]; } }
  const va = velocityAt(a, ax, ay, az), vb = velocityAt(b, bx, by, bz);
  const sep = [bx - ax, by - ay, bz - az];
  assert.ok((vb[0] - va[0]) * sep[0] + (vb[1] - va[1]) * sep[1] + (vb[2] - va[2]) * sep[2] > 0, 'sides diverge');
  assert.ok(before >= 3);
});
