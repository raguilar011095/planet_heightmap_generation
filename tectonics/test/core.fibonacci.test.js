import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fibonacciPoints, CellLocator, meanSpacingRad, cellAreaSr } from '../core/fibonacci-sphere.js';
import { rand01 } from '../core/hash-rng.js';

function bruteNearest(xyz, n, x, y, z) {
  let best = -1, bd = -2;
  for (let c = 0; c < n; c++) {
    const d = xyz[3 * c] * x + xyz[3 * c + 1] * y + xyz[3 * c + 2] * z;
    if (d > bd) { bd = d; best = c; }
  }
  return { best, bd };
}

test('points are unit length and well spread', () => {
  const n = 3000, xyz = fibonacciPoints(n);
  for (let i = 0; i < n; i++) {
    const l = Math.hypot(xyz[3 * i], xyz[3 * i + 1], xyz[3 * i + 2]);
    assert.ok(Math.abs(l - 1) < 1e-6);
  }
  // Nearest-neighbour distance should be close to the nominal spacing, never tiny.
  const s = meanSpacingRad(n);
  const loc = new CellLocator(xyz, n);
  let minD = Infinity;
  for (let i = 0; i < 200; i++) {
    const x = xyz[3 * i], y = xyz[3 * i + 1], z = xyz[3 * i + 2];
    // Nearest *other* cell: brute force over a sample
    let bd = -2;
    for (let c = 0; c < n; c++) if (c !== i) bd = Math.max(bd, xyz[3 * c] * x + xyz[3 * c + 1] * y + xyz[3 * c + 2] * z);
    minD = Math.min(minD, Math.acos(Math.min(1, bd)));
  }
  assert.ok(minD > 0.4 * s && minD < 1.5 * s, `min spacing ${minD} vs nominal ${s}`);
  assert.ok(loc.nearest(1, 0, 0) >= 0);
  assert.ok(Math.abs(cellAreaSr(n) * n - 4 * Math.PI) < 1e-9);
});

test('every cell locates itself', () => {
  for (const n of [50, 500, 5000, 20000]) {
    const xyz = fibonacciPoints(n), loc = new CellLocator(xyz, n);
    for (let i = 0; i < n; i++) {
      assert.equal(loc.nearest(xyz[3 * i], xyz[3 * i + 1], xyz[3 * i + 2]), i, `n=${n} cell ${i}`);
    }
  }
});

test('locator matches brute force for random points, including near the poles', () => {
  const n = 8000, xyz = fibonacciPoints(n), loc = new CellLocator(xyz, n);
  for (let t = 0; t < 3000; t++) {
    let x, y, z;
    if (t % 3 === 0) {           // bias a third of samples toward the poles
      const lat = (Math.PI / 2 - rand01(1, 1, 1, t) * 0.05) * (t % 2 ? 1 : -1);
      const lon = rand01(1, 1, 2, t) * 2 * Math.PI;
      x = Math.cos(lat) * Math.cos(lon); y = Math.cos(lat) * Math.sin(lon); z = Math.sin(lat);
    } else {
      x = rand01(2, 1, 1, t) * 2 - 1; y = rand01(2, 1, 2, t) * 2 - 1; z = rand01(2, 1, 3, t) * 2 - 1;
      const l = Math.hypot(x, y, z) || 1; x /= l; y /= l; z /= l;
    }
    const got = loc.nearest(x, y, z);
    const { best, bd } = bruteNearest(xyz, n, x, y, z);
    const gotDot = xyz[3 * got] * x + xyz[3 * got + 1] * y + xyz[3 * got + 2] * z;
    assert.ok(got === best || Math.abs(gotDot - bd) < 1e-6, `sample ${t}: got ${got} (${gotDot}) vs ${best} (${bd})`);
  }
});
