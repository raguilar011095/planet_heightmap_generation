// P2 run configuration: the full automated plate history. The blog's opening
// position (one continental plate, ocean plates bounded by ridges, subduction
// implied all round), then the policy every 50 Myr and the kinematics every
// 5 Myr for as long as you run it.

import { createGridWorld } from '../state/world.js';
import { defineCrustFields } from '../state/crust-fields.js';
import { defineSurfaceFields } from '../state/surface-fields.js';
import { defineBoundaryFields } from '../state/boundary-fields.js';
import { Scheduler } from '../sim/scheduler.js';
import '../sim/invariants-crust.js';
import initialCondition from '../passes/policy/initial-condition.js';
import initialPlates from '../passes/policy/initial-plates.js';
import plateStats from '../passes/policy/plate-stats.js';
import rotations from '../passes/policy/rotations.js';
import subductionInit from '../passes/policy/subduction-init.js';
import rift from '../passes/policy/rift.js';
import suture from '../passes/policy/suture.js';
import hotspots from '../passes/policy/hotspots.js';
import advect from '../passes/motion/advect.js';
import thicken from '../passes/orogeny/thicken.js';
import spread from '../passes/orogeny/spread.js';
import delaminate from '../passes/orogeny/delaminate.js';
import age from '../passes/crust/age.js';
import isostasy from '../passes/surface/isostasy.js';
import thermalSubsidence from '../passes/surface/thermal-subsidence.js';

export const PHASES = ['init', 'policy', 'motion', 'orogeny', 'crust', 'surface'];
export const SURFACE_PASSES = ['surface.isostasy', 'surface.thermalSubsidence'];

export function buildHistory({ n = 20000, seed = 1, dev = true, dtMyr = 5, startMa = -1000, params = {} } = {}) {
  defineCrustFields(); defineSurfaceFields(); defineBoundaryFields();
  const world = createGridWorld(n, { seed });
  const scheduler = new Scheduler(world, { dev, phases: PHASES, dtMyr, startMa, substepsPerPolicy: 10 });
  scheduler.register(initialCondition).register(initialPlates)
    .register(plateStats).register(rotations).register(subductionInit).register(rift).register(suture).register(hotspots)
    .register(advect).register(thicken).register(spread).register(delaminate).register(age)
    .register(isostasy).register(thermalSubsidence);
  scheduler.setParam('policy.initialPlates', 'supercontinent', true);
  for (const [id, kv] of Object.entries(params)) for (const [k, v] of Object.entries(kv)) scheduler.setParam(id, k, v);
  return { world, scheduler };
}
