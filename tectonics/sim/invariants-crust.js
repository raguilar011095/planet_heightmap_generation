// Domain invariants for the crust simulation. Registered on import.

import { defineInvariant } from './invariants.js';

// motion.advect publishes continental mass before and after (including excess
// awaiting redistribution and anything it had to drop). They must agree.
defineInvariant('continentalMassConserved', (world, info) => {
  const before = world.diag[`${info.passId}.massBeforeKm`]?.[0];
  const after = world.diag[`${info.passId}.massAfterKm`]?.[0];
  if (before === undefined || after === undefined) return `pass ${info.passId} did not publish mass diagnostics`;
  const tol = 1e-4 * Math.max(1, before);
  return Math.abs(after - before) <= tol ? null : `continental mass ${before.toFixed(1)} → ${after.toFixed(1)} km·cell`;
}, 'Continental crust mass (Σ thickness over continental cells) is unchanged by advection, up to excess awaiting redistribution.');
