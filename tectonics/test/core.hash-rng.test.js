import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rand01, hashString, hash5, mix32 } from '../core/hash-rng.js';

test('rand01 is a pure function of its address', () => {
  assert.equal(rand01(7, 11, 3, 42, 0), rand01(7, 11, 3, 42, 0));
  assert.notEqual(rand01(7, 11, 3, 42, 0), rand01(7, 11, 3, 42, 1));
  assert.notEqual(rand01(7, 11, 3, 42, 0), rand01(7, 11, 4, 42, 0));
  assert.notEqual(rand01(7, 11, 3, 42, 0), rand01(8, 11, 3, 42, 0));
});

test('rand01 is roughly uniform on [0,1)', () => {
  let sum = 0, min = 1, max = 0;
  const n = 20000;
  for (let i = 0; i < n; i++) { const v = rand01(1, 2, 3, i); sum += v; min = Math.min(min, v); max = Math.max(max, v); }
  const mean = sum / n;
  assert.ok(mean > 0.48 && mean < 0.52, `mean ${mean}`);
  assert.ok(min >= 0 && max < 1);
});

test('adjacent cells are not correlated', () => {
  // Consecutive cell indices must not produce a drifting sequence.
  let same = 0;
  for (let i = 0; i < 1000; i++) if (Math.floor(rand01(9, 9, 9, i) * 2) === Math.floor(rand01(9, 9, 9, i + 1) * 2)) same++;
  assert.ok(same > 400 && same < 600, `same-bucket count ${same}`);
});

test('hashString distinguishes ids and is stable', () => {
  assert.equal(hashString('ocean.subside'), hashString('ocean.subside'));
  assert.notEqual(hashString('ocean.subside'), hashString('ocean.subsidE'));
  assert.notEqual(hash5(1, 2, 3, 4, 5), hash5(1, 2, 3, 5, 4));
  assert.equal(mix32(0) >>> 0, mix32(0));
});

test('negative integers (e.g. plateId -1) are accepted', () => {
  const v = rand01(1, 2, 3, -1, 0);
  assert.ok(v >= 0 && v < 1);
  assert.notEqual(v, rand01(1, 2, 3, 0, 0));
});
