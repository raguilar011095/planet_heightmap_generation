import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSphereNoise } from '../core/sphere-noise.js';
import { fibonacciPoints, CellLocator } from '../core/fibonacci-sphere.js';
import { buildRadiusNeighbors } from '../core/grid-neighbors.js';

test('sphere noise is bounded, zero-mean, smooth and seed-dependent', () => {
  const a = makeSphereNoise({ seed: 1 }), b = makeSphereNoise({ seed: 2 });
  let sum = 0, maxAbs = 0, maxStep = 0, diff = 0;
  const N = 4000, xyz = fibonacciPoints(N);
  for (let i = 0; i < N; i++) {
    const x = xyz[3 * i], y = xyz[3 * i + 1], z = xyz[3 * i + 2];
    const v = a(x, y, z);
    sum += v; maxAbs = Math.max(maxAbs, Math.abs(v)); diff += Math.abs(v - b(x, y, z));
    // small step along a meridian → small change
    const lat = Math.asin(z) + 1e-3, lon = Math.atan2(y, x);
    maxStep = Math.max(maxStep, Math.abs(v - a(Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat))));
  }
  assert.ok(Math.abs(sum / N) < 0.25, `mean ${sum / N}`);   // low-frequency waves carry a small global bias
  assert.ok(maxAbs < 2.5, `max |v| ${maxAbs}`);
  assert.ok(maxStep < 0.05, `max step ${maxStep}`);
  assert.ok(diff / N > 0.2, 'seeds should differ');
});

test('radius neighbourhoods match brute force', () => {
  const n = 5000, xyz = fibonacciPoints(n), loc = new CellLocator(xyz, n);
  const radius = 0.08;
  const nb = buildRadiusNeighbors(loc, radius);
  const cosMin = Math.cos(radius);
  for (const i of [0, 1, 17, 2500, 4999, 4000, 123]) {
    const x = xyz[3 * i], y = xyz[3 * i + 1], z = xyz[3 * i + 2];
    const brute = new Set();
    for (let c = 0; c < n; c++) if (xyz[3 * c] * x + xyz[3 * c + 1] * y + xyz[3 * c + 2] * z >= cosMin) brute.add(c);
    const got = new Set(nb.idx.subarray(nb.offset[i], nb.offset[i + 1]));
    assert.deepEqual([...got].sort((a, b) => a - b), [...brute].sort((a, b) => a - b), `cell ${i}`);
    assert.ok(got.has(i), 'includes self');
  }
  // neighbourhood size is roughly the disc area in cells
  const expected = Math.PI * radius * radius / (4 * Math.PI / n);
  const mean = nb.offset[n] / n;
  assert.ok(mean > 0.7 * expected && mean < 1.3 * expected, `mean ${mean} vs ${expected}`);
});
