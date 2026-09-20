import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { defineField, getField, listFields, resetFields, findRangeViolation } from '../state/fields.js';
import { createWorld, snapshotWorld, restoreWorld } from '../state/world.js';
import { defineCrustFields, CRUST } from '../state/crust-fields.js';

beforeEach(() => resetFields());

test('defineField validates its inputs', () => {
  assert.throws(() => defineField('bad', { type: Float32Array, doc: 'needs a dotted name' }), /collection\.field/);
  assert.throws(() => defineField('a.b', { type: Array, doc: 'plain arrays are not fields' }), /typed-array/);
  assert.throws(() => defineField('a.b', { type: Float32Array, doc: 'x' }), /doc is required/);
  assert.throws(() => defineField('a.b', { type: Float32Array, doc: 'range backwards', range: [1, 0] }), /range/);
  defineField('a.b', { type: Float32Array, unit: 'km', range: [0, 1], doc: 'a valid field' });
  assert.throws(() => defineField('a.b', { type: Float32Array, doc: 'defined twice' }), /already defined/);
  assert.equal(getField('a.b').unit, 'km');
  assert.throws(() => getField('a.nope'), /Unknown field/);
});

test('findRangeViolation catches NaN and out-of-range', () => {
  const f = defineField('t.x', { type: Float32Array, range: [0, 10], doc: 'range test field' });
  assert.equal(findRangeViolation(f, new Float32Array([1, 2, 3])), null);
  assert.deepEqual(findRangeViolation(f, new Float32Array([1, NaN, 3])), { index: 1, value: NaN });
  assert.deepEqual(findRangeViolation(f, new Float32Array([1, 2, 11])), { index: 2, value: 11 });
  const g = defineField('t.y', { type: Float32Array, doc: 'unbounded field still rejects NaN' });
  assert.deepEqual(findRangeViolation(g, new Float32Array([NaN])), { index: 0, value: NaN });
  const h = defineField('t.z', { type: Uint8Array, range: [0, 2], doc: 'int field range' });
  assert.deepEqual(findRangeViolation(h, new Uint8Array([0, 3])), { index: 1, value: 3 });
});

test('createWorld allocates every registered field with its initial value', () => {
  defineCrustFields();
  defineCrustFields();                         // idempotent
  const w = createWorld({ cellCount: 10, seed: 5 });
  assert.equal(listFields().length, 11);
  assert.equal(w.fields['crust.plateId'][3], -1);
  assert.equal(w.fields['crust.thickness'].length, 10);
  assert.equal(w.fields['crust.type'][0], CRUST.NONE);
  assert.equal(w.seed, 5);
});

test('snapshot and restore round-trip', () => {
  defineCrustFields();
  const w = createWorld({ cellCount: 4 });
  w.fields['crust.thickness'].set([1, 2, 3, 4]);
  w.clock.stepIndex = 7;
  const snap = snapshotWorld(w);
  w.fields['crust.thickness'].fill(0);
  w.clock.stepIndex = 0;
  restoreWorld(w, snap);
  assert.deepEqual([...w.fields['crust.thickness']], [1, 2, 3, 4]);
  assert.equal(w.clock.stepIndex, 7);
  // snapshot is a copy, not a view
  snap.fields['crust.thickness'][0] = 99;
  assert.equal(w.fields['crust.thickness'][0], 1);
});
