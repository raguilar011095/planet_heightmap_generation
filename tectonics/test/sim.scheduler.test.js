import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { defineField, resetFields } from '../state/fields.js';
import { createWorld } from '../state/world.js';
import { definePass } from '../sim/define-pass.js';
import { defineInvariant, resetInvariants } from '../sim/invariants.js';
import { Scheduler } from '../sim/scheduler.js';
import { constantFill } from '../passes/debug/constant-fill.js';

beforeEach(() => { resetFields(); resetInvariants(); });

function fields() {
  defineField('t.a', { type: Float32Array, range: [0, 100], unit: 'km', doc: 'test field a' });
  defineField('t.b', { type: Float32Array, range: [0, 100], unit: 'km', doc: 'test field b' });
  defineField('t.c', { type: Float32Array, doc: 'unbounded test field c' });
}

test('definePass rejects malformed passes', () => {
  const ok = { id: 'x.y', phase: 'p', doc: 'a perfectly adequate description', run() {} };
  assert.throws(() => definePass({ ...ok, id: 'nodot' }), /group\.name/);
  assert.throws(() => definePass({ ...ok, doc: 'short' }), /doc is required/);
  assert.throws(() => definePass({ ...ok, run: 1 }), /run\(/);
  assert.throws(() => definePass({ ...ok, reads: ['t.a', 't.a'] }), /duplicate/);
  assert.throws(() => definePass({ ...ok, params: { k: { value: 1, doc: 'no range' } } }), /range/);
  assert.throws(() => definePass({ ...ok, params: { k: { value: 5, range: [0, 1], doc: 'out of range' } } }), /range/);
  assert.throws(() => definePass({ ...ok, params: { k: { value: 1, range: [0, 2] } } }), /needs a doc/);
  const p = definePass({ ...ok, params: { k: { value: 1, range: [0, 2], doc: 'fine' }, f: { value: true, doc: 'flag' } } });
  assert.ok(Object.isFrozen(p) && p.hash > 0);
});

test('end to end: register, run, toggle, param, diag, timing', () => {
  fields();
  const w = createWorld({ cellCount: 16 });
  const s = new Scheduler(w, { dtMyr: 5, startMa: -100 });
  const fill = constantFill({ field: 't.a', value: 35, range: [0, 100], unit: 'km' });
  s.register(fill).run(1);
  assert.equal(w.fields['t.a'][7], 35);
  assert.equal(w.clock.stepIndex, 1);
  assert.equal(w.clock.timeMa, -95);
  assert.equal(s.lastTimings.length, 1);
  assert.equal(s.lastTimings[0].id, fill.id);

  s.setParam(fill.id, 'value', 500);            // clamped to range
  s.run(1);
  assert.equal(w.fields['t.a'][0], 100);

  s.disable(fill.id);
  w.fields['t.a'].fill(1);
  s.run(1);
  assert.equal(w.fields['t.a'][0], 1);
  assert.deepEqual(s.listPasses(), [{ id: fill.id, phase: 'debug', enabled: false }]);
  assert.throws(() => s.setParam(fill.id, 'nope', 1), /no param/);
  assert.throws(() => s.enable('ghost.pass'), /unknown pass/);
});

test('validate: reads must be written by a pass or provided', () => {
  fields();
  const w = createWorld({ cellCount: 4 });
  const reader = definePass({ id: 't.reader', phase: 'p', doc: 'reads t.a and writes t.b',
    reads: ['t.a'], writes: ['t.b'], run(world, p, ctx) { ctx.write('t.b').set(ctx.read('t.a')); } });
  assert.throws(() => new Scheduler(w).register(reader).step(), /reads "t\.a" but no pass writes it/);
  new Scheduler(w).provide('t.a').register(reader).step();                      // provided
  new Scheduler(w).register(constantFill({ field: 't.a', value: 1 })).register(reader).step(); // written
  assert.throws(() => new Scheduler(w).register(definePass({ id: 't.bad', phase: 'p',
    doc: 'declares a field that does not exist', reads: ['t.missing'], run() {} })), /Unknown field/);
});

test('dev guard: undeclared access throws naming pass and field', () => {
  fields();
  const w = createWorld({ cellCount: 4 });
  const sneaky = definePass({ id: 't.sneaky', phase: 'p', doc: 'touches a field it did not declare',
    writes: ['t.a'], run(world, p, ctx) { ctx.write('t.a'); ctx.read('t.b'); } });
  assert.throws(() => new Scheduler(w).provide('t.b').register(sneaky).step(), /"t\.sneaky" read undeclared field "t\.b"/);
  const sneakyW = definePass({ id: 't.sneakyw', phase: 'p', doc: 'writes a field it did not declare',
    reads: ['t.a'], run(world, p, ctx) { ctx.write('t.b'); } });
  assert.throws(() => new Scheduler(w).provide('t.a').register(sneakyW).step(), /wrote undeclared field "t\.b"/);
  // Production mode: no guard, no throw.
  new Scheduler(w, { dev: false }).provide('t.b').register(sneaky).step();
});

test('dev checks: range and NaN violations name the pass, field and cell', () => {
  fields();
  const w = createWorld({ cellCount: 4 });
  const bad = definePass({ id: 't.bad', phase: 'p', doc: 'writes an out-of-range value at cell 2',
    writes: ['t.a'], run(world, p, ctx) { ctx.write('t.a')[2] = 250; } });
  assert.throws(() => new Scheduler(w).register(bad).step(), /"t\.bad" left "t\.a" outside \[0,100\] at cell 2: 250/);
  const nan = definePass({ id: 't.nan', phase: 'p', doc: 'writes NaN into an unbounded field',
    writes: ['t.c'], run(world, p, ctx) { ctx.write('t.c')[1] = NaN; } });
  assert.throws(() => new Scheduler(w).register(nan).step(), /"t\.nan" left "t\.c" at cell 1: NaN/);
});

test('invariants run after the pass and report failures', () => {
  fields();
  defineInvariant('sumIsTen', (world) => {
    let s = 0; for (const v of world.fields['t.a']) s += v;
    return s === 10 ? null : `sum is ${s}`;
  }, 'sum of t.a must be 10');
  const w = createWorld({ cellCount: 4 });
  const p = definePass({ id: 't.inv', phase: 'p', doc: 'fills t.a so the invariant can judge it',
    writes: ['t.a'], invariants: ['sumIsTen'], params: { v: { value: 2.5, range: [0, 10], doc: 'value' } },
    run(world, p, ctx) { ctx.write('t.a').fill(p.v); } });
  const s = new Scheduler(w).register(p);
  s.step();                                                    // 4 × 2.5 = 10, passes
  s.setParam('t.inv', 'v', 3);
  assert.throws(() => s.step(), /Invariant "sumIsTen" failed after pass "t\.inv" at step 1: sum is 12/);
  assert.throws(() => definePass({ id: 't.x', phase: 'p', doc: 'declares an unknown invariant name',
    invariants: ['ghost'], run() {} }) && new Scheduler(w).register(definePass({ id: 't.x', phase: 'p',
    doc: 'declares an unknown invariant name', invariants: ['ghost'], run() {} })), /Unknown invariant/);
});

test('addressed RNG: disabling one pass does not change another\'s random numbers', () => {
  fields();
  const mk = () => {
    const w = createWorld({ cellCount: 64, seed: 123 });
    const a = definePass({ id: 't.a', phase: 'p', doc: 'random fill of t.a, draws a state-dependent number of times',
      writes: ['t.a'], run(world, p, ctx) { const x = ctx.write('t.a'); for (let i = 0; i < 64; i++) x[i] = ctx.rand(i) * 100; } });
    const b = definePass({ id: 't.b', phase: 'p', doc: 'random fill of t.b, independent of t.a',
      writes: ['t.b'], run(world, p, ctx) { const x = ctx.write('t.b'); for (let i = 0; i < 64; i++) x[i] = ctx.rand(i, 1) * 100; } });
    return { w, s: new Scheduler(w).register(a).register(b) };
  };
  const full = mk(); full.s.run(3);
  const part = mk(); part.s.disable('t.a'); part.s.run(3);
  assert.deepEqual([...full.w.fields['t.b']], [...part.w.fields['t.b']]);
  assert.notDeepEqual([...full.w.fields['t.a']], [...full.w.fields['t.b']]);   // passes differ from each other
  // and per-plate draws live in their own namespace
  const s = full.s; const ctx = s._context(s.byId.get('t.a'));
  assert.notEqual(ctx.rand(5), ctx.randPlate(5));
});

test('solo runs only the soloed pass; phases order passes', () => {
  fields();
  const w = createWorld({ cellCount: 4 });
  const s = new Scheduler(w, { phases: ['late', 'early'] });
  const first = constantFill({ field: 't.a', value: 1 });
  const second = definePass({ id: 't.second', phase: 'early', doc: 'copies t.a into t.b; must run before the fill by phase order',
    reads: ['t.a'], writes: ['t.b'], run(world, p, ctx) { ctx.write('t.b').set(ctx.read('t.a')); } });
  assert.throws(() => s.register(first), /phase "debug" not in/);
  const s2 = new Scheduler(w, { phases: ['debug', 'early'] }).register(second).register(first);
  s2.step();
  assert.deepEqual(s2.listPasses().map(p => p.id), [first.id, 't.second']);   // sorted by phase, not registration
  assert.equal(w.fields['t.b'][0], 1);
  s2.solo('t.second');
  w.fields['t.a'].fill(7);
  s2.step();
  assert.equal(w.fields['t.a'][0], 7);       // fill did not run
  assert.equal(w.fields['t.b'][0], 7);       // copy did
  s2.solo(null);
  s2.step();
  assert.equal(w.fields['t.a'][0], 1);
});
