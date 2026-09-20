// P1 run configuration: the static world of P0 partitioned into plates with
// seeded random rotations, moving and colliding. Headless.

import { createGridWorld } from '../state/world.js';
import { defineCrustFields } from '../state/crust-fields.js';
import { defineSurfaceFields } from '../state/surface-fields.js';
import { defineBoundaryFields } from '../state/boundary-fields.js';
import { Scheduler } from '../sim/scheduler.js';
import '../sim/invariants-crust.js';
import initialCondition from '../passes/policy/initial-condition.js';
import initialPlates from '../passes/policy/initial-plates.js';
import advect from '../passes/motion/advect.js';
import thicken from '../passes/orogeny/thicken.js';
import spread from '../passes/orogeny/spread.js';
import delaminate from '../passes/orogeny/delaminate.js';
import age from '../passes/crust/age.js';
import isostasy from '../passes/surface/isostasy.js';
import thermalSubsidence from '../passes/surface/thermal-subsidence.js';

export const PHASES = ['init', 'motion', 'orogeny', 'crust', 'surface'];
export const SURFACE_PASSES = ['surface.isostasy', 'surface.thermalSubsidence'];

export function buildPrescribedMotion({ n = 20000, seed = 1, dev = true, dtMyr = 5, params = {} } = {}) {
  defineCrustFields(); defineSurfaceFields(); defineBoundaryFields();
  const world = createGridWorld(n, { seed });
  const scheduler = new Scheduler(world, { dev, phases: PHASES, dtMyr, startMa: -1000, substepsPerPolicy: 10 });
  scheduler.register(initialCondition).register(initialPlates)
    .register(advect).register(thicken).register(spread).register(delaminate).register(age)
    .register(isostasy).register(thermalSubsidence);
  for (const [id, kv] of Object.entries(params)) for (const [k, v] of Object.entries(kv)) scheduler.setParam(id, k, v);
  return { world, scheduler };
}
