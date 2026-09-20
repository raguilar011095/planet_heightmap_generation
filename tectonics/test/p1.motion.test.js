import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetFields } from '../state/fields.js';
import { CRUST } from '../state/crust-fields.js';
import { BOUNDARY } from '../state/boundary-fields.js';
import { buildPrescribedMotion, SURFACE_PASSES } from '../app/prescribed-motion.js';
import { setRotation } from '../state/plates.js';
import { fromPole, apply } from '../core/rotation.js';

beforeEach(() => resetFields());

// Run the initial condition with motion held, so rotations can be prescribed before anything moves.
function initHeld(opts) {
  const built = buildPrescribedMotion(opts);
  built.scheduler.disable('motion.advect').step().enable('motion.advect');
  return built;
}
function contStats(world) {
  const t = world.fields['crust.type'], th = world.fields['crust.thickness'], cr = world.fields['crust.isCraton'];
  let mass = 0, cells = 0, cratons = 0, cx = 0, cy = 0, cz = 0, maxT = 0;
  const xyz = world.grid.xyz;
  for (let i = 0; i < world.cellCount; i++) {
    if (t[i] !== CRUST.CONTINENTAL) continue;
    mass += th[i]; cells++; cratons += cr[i]; maxT = Math.max(maxT, th[i]);
    cx += xyz[3 * i]; cy += xyz[3 * i + 1]; cz += xyz[3 * i + 2];
  }
  const l = Math.hypot(cx, cy, cz) || 1;
  return { mass, cells, cratons, maxT, centroid: [cx / l, cy / l, cz / l] };
}
const angleDeg = (a, b) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * 180 / Math.PI;

test('single plate: a rigid 90° rotation preserves cells, cratons and mass, and creates no boundaries', () => {
  const { world, scheduler } = initHeld({ n: 8000, seed: 5, params: { 'policy.initialPlates': { plateCount: 1 } } });
  const before = contStats(world);
  setRotation(world, 0, { poleLat: 90, poleLon: 0, degPerMyr: 2 });     // 10° per 5 Myr substep
  scheduler.run(9);                                                       // 90°
  const after = contStats(world);
  assert.ok(Math.abs(after.cells - before.cells) <= 0.01 * before.cells, `cells ${before.cells} → ${after.cells}`);
  assert.ok(Math.abs(after.cratons - before.cratons) <= 0.02 * before.cratons, `cratons ${before.cratons} → ${after.cratons}`);
  assert.ok(Math.abs(after.mass - before.mass) <= 1e-3 * before.mass, `mass ${before.mass} → ${after.mass}`);
  const expected = apply(fromPole(90, 0, 90), ...before.centroid, [0, 0, 0]);
  assert.ok(angleDeg(expected, after.centroid) < 5, `centroid off by ${angleDeg(expected, after.centroid)}°`);
  const kind = world.fields['boundary.kind'];
  let boundaries = 0; for (const k of kind) if (k !== BOUNDARY.NONE) boundaries++;
  assert.ok(boundaries <= 0.005 * world.cellCount, `${boundaries} spurious boundary cells on a single plate`);
  const [relocated, shortened, gaps, orphans] = world.diag['motion.advect.counts'];
  assert.equal(orphans, 0);
  assert.ok(shortened <= 0.001 * world.cellCount && gaps <= 0.005 * world.cellCount, `shortened ${shortened} gaps ${gaps} relocated ${relocated}`);
});

test('two plates: divergence makes young ocean, convergence makes mountains, mass is conserved', () => {
  const { world, scheduler } = initHeld({ n: 10000, seed: 2, params: { 'policy.initialPlates': { plateCount: 2 } } });
  const before = contStats(world);
  setRotation(world, 0, { poleLat: 90, poleLon: 0, degPerMyr: 0.3 });
  setRotation(world, 1, { poleLat: 90, poleLon: 0, degPerMyr: -0.3 });   // opposite sense: converge on one side, diverge on the other; ~6.5 cm/yr relative
  let delaminated = 0;
  for (let s = 0; s < 20; s++) { scheduler.step(); delaminated += world.diag['orogeny.delaminate.toMantleKm'][0]; }   // 100 Myr
  const f = world.fields;
  let divergent = 0, convergent = 0, young = 0;
  for (let i = 0; i < world.cellCount; i++) {
    if (f['boundary.kind'][i] === BOUNDARY.DIVERGENT) divergent++;
    if (f['boundary.kind'][i] >= BOUNDARY.OC) convergent++;
    if (f['crust.type'][i] === CRUST.OCEANIC && f['crust.ageMa'][i] < 10) young++;
  }
  assert.ok(divergent > 20, `divergent cells this substep: ${divergent}`);
  assert.ok(convergent > 20, `convergent cells this substep: ${convergent}`);
  assert.ok(young >= 0.9 * divergent, `young ocean floor ${young} vs ${divergent} created this substep`);   // a few new cells may already have been converted by margin outflow
  const after = contStats(world);
  assert.ok(after.maxT > 45, `thickest crust ${after.maxT} km — no mountains`);
  assert.ok(after.mass + delaminated >= before.mass * 0.999 && after.mass <= before.mass * 1.15, `mass ${before.mass} → ${after.mass} (+${delaminated} delaminated)`);
  scheduler.refresh(...SURFACE_PASSES);
  let maxE = -Infinity; for (const e of f['surface.elevation']) maxE = Math.max(maxE, e);
  assert.ok(maxE > 2500, `highest point ${maxE} m`);
});

test('slow plates move at the correct average rate through accumulated rotation', () => {
  const { world, scheduler } = initHeld({ n: 6000, seed: 9, params: { 'policy.initialPlates': { plateCount: 1 } } });
  const before = contStats(world);
  setRotation(world, 0, { poleLat: 90, poleLon: 0, cmPerYr: 0.5 });      // ≈ 0.225° per substep, well under a cell
  scheduler.run(80);                                                      // 400 Myr → 18°
  const after = contStats(world);
  const expected = apply(fromPole(90, 0, 18), ...before.centroid, [0, 0, 0]);
  assert.ok(angleDeg(expected, after.centroid) < 3, `centroid off by ${angleDeg(expected, after.centroid)}° from the expected 18° rotation`);
  assert.ok(world.plates[0].history.length >= 6 && world.plates[0].history.length <= 12, `moved ${world.plates[0].history.length} times`);
});

test('eight random plates for 200 Myr: fields stay in range and the mass invariant holds', () => {
  const { world, scheduler } = buildPrescribedMotion({ n: 8000, seed: 3 });
  scheduler.run(40);                                                      // dev mode: range + invariant checks every step
  const s = contStats(world);
  assert.ok(s.maxT > 40 && s.maxT < 120, `max thickness ${s.maxT}`);
  assert.ok(s.cells > 0.15 * world.cellCount && s.cells < 0.4 * world.cellCount, `continental cells ${s.cells}`);
});
