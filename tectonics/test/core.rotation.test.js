import { test } from 'node:test';
import assert from 'node:assert/strict';
import { axisAngle, fromPole, apply, compose, inverse, identity, poleToAxis,
         degPerMyrToCmPerYr, cmPerYrToDegPerMyr } from '../core/rotation.js';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('90° about +z maps x to y', () => {
  const m = axisAngle(0, 0, 1, Math.PI / 2);
  const out = [0, 0, 0];
  apply(m, 1, 0, 0, out);
  assert.ok(near(out[0], 0) && near(out[1], 1) && near(out[2], 0), `${out}`);
});

test('a point on the axis is fixed', () => {
  const a = poleToAxis(37, -120);
  const m = fromPole(37, -120, 55);
  const out = [0, 0, 0];
  apply(m, a[0], a[1], a[2], out);
  assert.ok(near(out[0], a[0]) && near(out[1], a[1]) && near(out[2], a[2]));
});

test('pole (90, 0) equals the +z axis', () => {
  const a = fromPole(90, 0, 33), b = axisAngle(0, 0, 1, 33 * Math.PI / 180);
  for (let i = 0; i < 9; i++) assert.ok(near(a[i], b[i]));
});

test('R · R⁻¹ is the identity', () => {
  const m = fromPole(-12, 140, 71);
  const p = compose(m, inverse(m));
  const I = identity();
  for (let i = 0; i < 9; i++) assert.ok(near(p[i], I[i]));
});

test('composition applies the right operand first', () => {
  const rz = axisAngle(0, 0, 1, Math.PI / 2);   // x → y
  const rx = axisAngle(1, 0, 0, Math.PI / 2);   // y → z
  const m = compose(rx, rz);                     // apply rz then rx: x → y → z
  const out = [0, 0, 0];
  apply(m, 1, 0, 0, out);
  assert.ok(near(out[0], 0) && near(out[1], 0) && near(out[2], 1), `${out}`);
});

test('rotation preserves length', () => {
  const m = fromPole(20, 20, 200);
  const out = [0, 0, 0];
  apply(m, 0.3, -0.4, 0.866, out);
  assert.ok(near(Math.hypot(...out), Math.hypot(0.3, -0.4, 0.866)));
});

test('speed conversions round-trip and match Earth figures', () => {
  // 5 cm/yr = 50 km/Myr = 50/6371 rad/Myr ≈ 0.4497°/Myr
  assert.ok(near(cmPerYrToDegPerMyr(5), 0.44968, 1e-4));
  assert.ok(near(degPerMyrToCmPerYr(cmPerYrToDegPerMyr(3.4)), 3.4));
});
