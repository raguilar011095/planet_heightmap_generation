import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetFields } from '../state/fields.js';
import { CRUST } from '../state/crust-fields.js';
import { buildStaticCrust } from '../app/static-crust.js';
import { flexuralParameterKm } from '../passes/surface/isostasy.js';
import { oceanDepthM } from '../passes/surface/thermal-subsidence.js';

beforeEach(() => resetFields());

function stats(world, pick) {
  let sum = 0, c = 0, min = Infinity, max = -Infinity;
  const e = world.fields['surface.elevation'];
  for (let i = 0; i < world.cellCount; i++) {
    if (!pick(i)) continue;
    sum += e[i]; c++; min = Math.min(min, e[i]); max = Math.max(max, e[i]);
  }
  return { mean: sum / c, count: c, min, max };
}

test('initial condition: exact land fraction, cratons inside it, ridges and old floor in the ocean', () => {
  const { world, scheduler } = buildStaticCrust({ n: 6000, seed: 7 });
  scheduler.step();
  const f = world.fields, ic = scheduler.getParams('policy.initialCondition');
  let land = 0, craton = 0, minAge = Infinity, maxAge = 0;
  const ids = new Set();
  for (let i = 0; i < 6000; i++) {
    if (f['crust.type'][i] === CRUST.CONTINENTAL) {
      land++;
      if (f['crust.isCraton'][i]) {
        craton++; ids.add(f['crust.terraneId'][i]);
        const t = f['crust.thickness'][i];
        assert.ok(t <= ic.cratonThicknessKm + 1e-4 && t >= ic.marginThicknessKm - 1e-4, `craton thickness ${t}`);
      }
    } else {
      assert.equal(f['crust.isCraton'][i], 0, 'no cratons at sea');
      minAge = Math.min(minAge, f['crust.ageMa'][i]); maxAge = Math.max(maxAge, f['crust.ageMa'][i]);
    }
  }
  assert.equal(land, 1500);                                 // exactly 25 % of 6000
  let maxCraton = 0; for (let i = 0; i < 6000; i++) if (f['crust.isCraton'][i]) maxCraton = Math.max(maxCraton, f['crust.thickness'][i]);
  assert.equal(maxCraton, ic.cratonThicknessKm, 'interior cratons reach full thickness');
  assert.ok(ids.size >= 6 && ids.size <= 10, `cratons placed: ${ids.size}`);
  assert.ok(craton > 0.05 * land && craton < 0.7 * land, `craton cells ${craton} of ${land}`);
  assert.ok(minAge < 10, `youngest ocean ${minAge} — no ridge?`);
  assert.equal(maxAge, 180);
  // schedule 'once': a second step must not regenerate the world.
  const t0 = f['crust.type'][0], flipped = t0 === CRUST.OCEANIC ? CRUST.CONTINENTAL : CRUST.OCEANIC;
  f['crust.type'][0] = flipped;
  scheduler.step();
  assert.equal(f['crust.type'][0], flipped);
});

test('hypsometry is Earth-like: two-level surface, ridges at ~2.5 km, no mountains yet', () => {
  const { world, scheduler } = buildStaticCrust({ n: 8000, seed: 3 });
  scheduler.step();
  const f = world.fields;
  const cont = stats(world, i => f['crust.type'][i] === CRUST.CONTINENTAL && !f['crust.isCraton'][i]);
  const crat = stats(world, i => f['crust.isCraton'][i] === 1);
  const ocean = stats(world, i => f['crust.type'][i] === CRUST.OCEANIC);
  const ridge = stats(world, i => f['crust.type'][i] === CRUST.OCEANIC && f['crust.ageMa'][i] < 3);
  assert.ok(cont.mean > -300 && cont.mean < 900, `continental mean ${cont.mean}`);
  assert.ok(crat.mean > cont.mean, 'cratons stand above ordinary continent');
  assert.ok(ocean.mean > -5800 && ocean.mean < -2800, `ocean mean ${ocean.mean}`);
  assert.ok(ocean.min > -7000, `deepest ocean ${ocean.min}`);
  assert.ok(ridge.max > -2700, `shallowest ridge cell ${ridge.max}`);          // crest ≈ -2500 m
  assert.ok(ridge.mean > -3000 && ridge.mean < -2600, `ridge mean ${ridge.mean}`);   // age < 3 Myr averages ~-2900
  assert.ok(crat.max < 2500, `max elevation ${crat.max} — nothing has collided yet`);
});

test('Airy limit (Te = 0) reproduces the analytic elevation exactly', () => {
  const { world, scheduler } = buildStaticCrust({ n: 3000, seed: 1, params: { 'surface.isostasy': { elasticThicknessKm: 0 } } });
  scheduler.step();
  const p = scheduler.getParams('surface.isostasy');
  const f = world.fields;
  for (let i = 0; i < 3000; i++) {
    if (f['crust.type'][i] !== CRUST.CONTINENTAL) continue;
    const expected = (f['crust.thickness'][i] - p.refContinentalKm) * 1000 * (1 - p.rhoContinental / p.rhoMantle) + p.refElevationM;
    assert.ok(Math.abs(f['surface.elevation'][i] - expected) < 0.5, `cell ${i}: ${f['surface.elevation'][i]} vs ${expected}`);
  }
  assert.equal(flexuralParameterKm(0, 3300), 0);
  const a25 = flexuralParameterKm(25, 3300);
  assert.ok(a25 > 50 && a25 < 70, `α(Te=25) = ${a25} km`);            // textbook ≈ 60 km
});

test('flexure: a narrow load stands higher than Airy and depresses its surroundings into a basin', () => {
  const n = 40000;
  const { world, scheduler } = buildStaticCrust({ n, seed: 1, params: { 'surface.isostasy': { elasticThicknessKm: 0 } } });
  scheduler.step();                                        // init runs once here
  const f = world.fields, p = scheduler.getParams('surface.isostasy');
  // Synthetic: uniform 35 km continent everywhere, a Himalayan-scale patch (50 km)
  // of radius 2α around (1,0,0). Te = 60 km → α ≈ 114 km ≈ one cell spacing at 40k.
  const TE = 60, alphaKm = flexuralParameterKm(TE, p.rhoMantle), sigma = alphaKm / 6371;
  f['crust.type'].fill(CRUST.CONTINENTAL); f['crust.thickness'].fill(35); f['crust.sediment'].fill(0);
  const i0 = world.grid.locator.nearest(1, 0, 0);
  world.grid.locator.forEachWithin(1, 0, 0, 2 * sigma, (c) => { f['crust.thickness'][c] = 50; });
  scheduler.step();
  const airyPeak = f['surface.elevation'][i0];
  assert.ok(Math.abs(airyPeak - (15000 * (1 - p.rhoContinental / p.rhoMantle) + p.refElevationM)) < 1, `airy ${airyPeak}`);

  scheduler.setParam('surface.isostasy', 'elasticThicknessKm', TE);
  scheduler.step();
  const flexPeak = f['surface.elevation'][i0];
  assert.ok(flexPeak > airyPeak * 1.2, `flexed peak ${flexPeak} should clearly exceed Airy ${airyPeak}`);
  assert.ok(flexPeak < 12000, `flexed peak ${flexPeak} is implausible`);
  let basinMin = Infinity, farMaxDev = 0;
  world.grid.locator.forEachWithin(1, 0, 0, 8 * sigma, (c, d) => {
    const dev = f['surface.elevation'][c] - p.refElevationM;
    if (d > 2.2 * sigma && d < 4 * sigma) basinMin = Math.min(basinMin, dev);   // just outside the load
    if (d > 5.5 * sigma) farMaxDev = Math.max(farMaxDev, Math.abs(dev));
  });
  assert.ok(basinMin < -50, `expected a basin next to the load, min deviation ${basinMin} m`);
  assert.ok(farMaxDev < 1, `far field should be undisturbed, max |dev| ${farMaxDev} m`);
});

test('ocean depth curve is continuous and monotone', () => {
  const p = { ridgeDepthM: 2500, subsidenceCoef: 350, flatteningAgeMa: 75, plateDepthM: 6400, plateDecayMa: 62.8 };
  let prev = -Infinity;
  for (let t = 0; t <= 300; t += 0.5) {
    const d = oceanDepthM(t, p);
    assert.ok(d >= prev, `depth decreased at ${t}`);
    if (t >= 5) assert.ok(d - prev < 50, `jump of ${d - prev} m at ${t} Myr`);   // √t is legitimately steep near 0
    prev = d;
  }
  assert.equal(oceanDepthM(0, p), 2500);
  assert.ok(Math.abs(oceanDepthM(75, p) - (2500 + 350 * Math.sqrt(75))) < 1e-9);
  assert.ok(oceanDepthM(300, p) > 6200 && oceanDepthM(300, p) < 6400);
});
