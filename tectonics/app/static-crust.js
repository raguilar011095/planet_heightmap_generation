// P0 run configuration: a static world (no motion) with crust state derived into
// elevation. Headless; used by tests, scripts/render-field.mjs and, later, the UI.

import { createGridWorld } from '../state/world.js';
import { defineCrustFields } from '../state/crust-fields.js';
import { defineSurfaceFields } from '../state/surface-fields.js';
import { Scheduler } from '../sim/scheduler.js';
import initialCondition from '../passes/policy/initial-condition.js';
import isostasy from '../passes/surface/isostasy.js';
import thermalSubsidence from '../passes/surface/thermal-subsidence.js';

export const PHASES = ['init', 'surface'];

// params: { 'pass.id': { paramName: value } } overrides, clamped to each param's range.
export function buildStaticCrust({ n = 20000, seed = 1, dev = true, params = {} } = {}) {
  defineCrustFields();
  defineSurfaceFields();
  const world = createGridWorld(n, { seed });
  const scheduler = new Scheduler(world, { dev, phases: PHASES, dtMyr: 5, startMa: -1000 });
  scheduler.register(initialCondition).register(isostasy).register(thermalSubsidence);
  for (const [id, kv] of Object.entries(params)) {
    for (const [k, v] of Object.entries(kv)) scheduler.setParam(id, k, v);
  }
  return { world, scheduler };
}
