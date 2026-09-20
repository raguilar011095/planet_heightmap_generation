// The Scheduler owns the pass list, validates the dependency graph, and runs
// steps. It is the only thing that calls a pass's run(). See ARCHITECTURE.md.
//
//   dev: true   → declared-access guard, range/NaN checks on written fields,
//                 declared invariants. Field-granularity only; never per element.
//   dev: false  → the unguarded hot path. Same results, no checks.

import { getField, findRangeViolation } from '../state/fields.js';
import { getInvariant } from './invariants.js';
import { rand01 } from '../core/hash-rng.js';

const PLATE_NS = 0x5bd1e995;

export class Scheduler {
  constructor(world, { dev = true, dtMyr = 5, startMa = -1000, phases = null, substepsPerPolicy = 10 } = {}) {
    this.world = world;
    this.dev = dev;
    this.dtMyr = dtMyr;
    this.substepsPerPolicy = substepsPerPolicy;
    this.phases = phases;
    this.passes = [];                 // registration order (then stable phase sort)
    this.byId = new Map();
    this.enabled = new Map();
    this.soloId = null;
    this.paramValues = new Map();     // id → { name: value }
    this.provided = new Set();        // fields supplied by initial conditions
    this.validated = false;
    this.lastTimings = [];
    world.clock.timeMa = startMa;
    world.clock.stepIndex = 0;
  }

  // Declare that a field is filled by the initial condition rather than a pass.
  provide(...fieldNames) {
    for (const f of fieldNames) { getField(f); this.provided.add(f); }
    this.validated = false;
    return this;
  }

  register(pass) {
    if (this.byId.has(pass.id)) throw new Error(`Scheduler: pass "${pass.id}" registered twice`);
    for (const f of pass.reads) getField(f);
    for (const f of pass.writes) getField(f);
    if (this.phases && !this.phases.includes(pass.phase)) {
      throw new Error(`Scheduler: pass "${pass.id}" has phase "${pass.phase}" not in [${this.phases}]`);
    }
    for (const inv of pass.invariants) getInvariant(inv);
    this.passes.push(pass);
    this.byId.set(pass.id, pass);
    this.enabled.set(pass.id, true);
    const values = {};
    for (const [k, p] of Object.entries(pass.params)) values[k] = p.value;
    this.paramValues.set(pass.id, values);
    this.validated = false;
    return this;
  }

  // Every read must be written by some pass or provided by the initial
  // condition. A read of a field only written *later* in the step is legal
  // (it reads last step's value — that is what state is), so ordering is not
  // checked; existence is.
  validate() {
    if (this.phases) {
      const idx = new Map(this.phases.map((p, i) => [p, i]));
      this.passes = this.passes.map((p, i) => [p, i])
        .sort((a, b) => (idx.get(a[0].phase) - idx.get(b[0].phase)) || (a[1] - b[1]))
        .map(x => x[0]);
    }
    const written = new Set(this.provided);
    for (const p of this.passes) for (const f of p.writes) written.add(f);
    for (const p of this.passes) {
      for (const f of p.reads) {
        if (!written.has(f)) {
          throw new Error(`Scheduler: pass "${p.id}" reads "${f}" but no pass writes it and it is not provided() by the initial condition`);
        }
      }
    }
    this.validated = true;
    return this;
  }

  enable(id) { this._get(id); this.enabled.set(id, true); return this; }
  disable(id) { this._get(id); this.enabled.set(id, false); return this; }
  solo(id) { if (id != null) this._get(id); this.soloId = id ?? null; return this; }
  isActive(id) { return this.soloId ? id === this.soloId : this.enabled.get(id) === true; }
  isPolicyStep(stepIndex = this.world.clock.stepIndex) { return stepIndex % this.substepsPerPolicy === 0; }

  _due(pass) {
    const step = this.world.clock.stepIndex;
    if (pass.schedule === 'once') return step === 0;
    if (pass.schedule === 'policy') return this.isPolicyStep(step);
    return true;
  }

  setParam(id, name, value) {
    const pass = this._get(id);
    const spec = pass.params[name];
    if (!spec) throw new Error(`Scheduler: pass "${id}" has no param "${name}"`);
    if (spec.range) value = Math.min(spec.range[1], Math.max(spec.range[0], value));
    this.paramValues.get(id)[name] = value;
    return this;
  }
  getParams(id) { this._get(id); return { ...this.paramValues.get(id) }; }

  listPasses() {
    return this.passes.map(p => ({ id: p.id, phase: p.phase, schedule: p.schedule, enabled: this.isActive(p.id) }));
  }

  step() {
    if (!this.validated) this.validate();
    const world = this.world;
    const timings = [];
    for (const pass of this.passes) {
      if (!this.isActive(pass.id) || !this._due(pass)) continue;
      const ctx = this._context(pass);
      const t0 = performance.now();
      pass.run(world, this.paramValues.get(pass.id), ctx);
      timings.push({ id: pass.id, ms: performance.now() - t0 });
      if (this.dev) this._checkAfter(pass);
    }
    this.lastTimings = timings;
    world.clock.stepIndex++;
    world.clock.timeMa += this.dtMyr;
    return this;
  }

  run(n) { for (let i = 0; i < n; i++) this.step(); return this; }

  // Run the named passes now, ignoring schedule and enabled state, without
  // advancing the clock. For refreshing derived fields after a run.
  refresh(...ids) {
    if (!this.validated) this.validate();
    for (const id of ids) {
      const pass = this._get(id);
      pass.run(this.world, this.paramValues.get(id), this._context(pass));
      if (this.dev) this._checkAfter(pass);
    }
    return this;
  }

  _get(id) {
    const p = this.byId.get(id);
    if (!p) throw new Error(`Scheduler: unknown pass "${id}"`);
    return p;
  }

  _context(pass) {
    const world = this.world;
    const { seed } = world;
    const { stepIndex, timeMa } = world.clock;
    const base = {
      passId: pass.id, passHash: pass.hash, step: stepIndex, timeMa, dtMyr: this.dtMyr,
      cellCount: world.cellCount, isPolicyStep: this.isPolicyStep(stepIndex),
      rand: (cell, k = 0) => rand01(seed, pass.hash, stepIndex, cell, k),
      randPlate: (plateId, k = 0) => rand01(seed, pass.hash ^ PLATE_NS, stepIndex, plateId, k),
      diag: (name, arr) => { world.diag[`${pass.id}.${name}`] = arr; },
    };
    if (!this.dev) {
      base.read = name => world.fields[name];
      base.write = name => world.fields[name];
      return base;
    }
    const reads = new Set(pass.reads), writes = new Set(pass.writes);
    base.read = name => {
      if (!reads.has(name) && !writes.has(name)) {
        throw new Error(`Pass "${pass.id}" read undeclared field "${name}" — add it to reads`);
      }
      return world.fields[name];
    };
    base.write = name => {
      if (!writes.has(name)) throw new Error(`Pass "${pass.id}" wrote undeclared field "${name}" — add it to writes`);
      return world.fields[name];
    };
    return base;
  }

  _checkAfter(pass) {
    const world = this.world;
    for (const f of pass.writes) {
      const spec = getField(f);
      const bad = findRangeViolation(spec, world.fields[f]);
      if (bad) {
        const r = spec.range ? ` outside [${spec.range}]` : '';
        throw new Error(`Pass "${pass.id}" left "${f}"${r} at cell ${bad.index}: ${bad.value} (step ${world.clock.stepIndex})`);
      }
    }
    for (const name of pass.invariants) {
      const msg = getInvariant(name).check(world, { passId: pass.id, step: world.clock.stepIndex });
      if (msg) throw new Error(`Invariant "${name}" failed after pass "${pass.id}" at step ${world.clock.stepIndex}: ${msg}`);
    }
  }
}
