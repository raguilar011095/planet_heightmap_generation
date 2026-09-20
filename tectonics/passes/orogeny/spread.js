// Lower-crustal flow. Two mass-conserving mechanisms: crust above a threshold
// spreads into its same-plate neighbours (what turns a welt into a plateau —
// Tibet is crust flow), and no two neighbours may differ by more than the
// steepest sustainable gradient. The second matters because an elastic plate
// really would hold an isolated 80 km wide, 15 km thick column 10 km high; on
// Earth such columns collapse before that happens.

import { definePass } from '../../sim/define-pass.js';
import { CRUST } from '../../state/crust-fields.js';

export default definePass({
  id: 'orogeny.spread',
  phase: 'orogeny',
  doc: `Mass-conserving lower-crustal flow between continental cells in contact, regardless of
        plate: crust above flowThresholdKm spreads at spreadRate per substep, and no two
        neighbours may differ by more than the steepest sustainable gradient. Cratons only
        receive up to cratonMaxKm. Produces plateaus and keeps collision zones from becoming
        single-cell towers.`,
  reads: ['crust.type', 'crust.isCraton', 'crust.thickness'],
  writes: ['crust.thickness'],
  params: {
    flowThresholdKm: { value: 55,  range: [45, 90],  unit: 'km',  doc: 'Crust above this thickness flows.' },
    spreadRate:      { value: 0.4, range: [0, 0.8],  unit: '',    doc: 'Fraction of the excess above threshold moved to neighbours per substep.' },
    reachCells:      { value: 1.6, range: [1, 3],    unit: 'cells', doc: 'Neighbourhood radius for flow.' },
    maxGradientKmPer100Km: { value: 20, range: [5, 60], unit: 'km/100km', doc: 'Steepest sustainable crustal thickness gradient (Himalayan front ≈ 23). Steeper pairs exchange crust until they comply.' },
    gradientRounds:  { value: 4,   range: [1, 8],    unit: '',    doc: 'Relaxation sweeps per substep.' },
    cratonMaxKm:     { value: 58,  range: [40, 70],  unit: 'km',  doc: 'Cratons receive crust through the gradient limiter only up to this thickness (thrust sheets on a shield margin), never through belts.' },
  },
  run(world, p, ctx) {
    const n = world.cellCount, { xyz, locator, spacingRad } = world.grid;
    const type = ctx.read('crust.type'), isCraton = ctx.read('crust.isCraton');
    const thickness = ctx.write('crust.thickness');
    const delta = new Float32Array(n);
    const maxStep = p.maxGradientKmPer100Km * world.grid.spacingKm / 100;
    // Pairwise flux from thicker to thinner, divided by a nominal neighbour count so a
    // cell fed by several neighbours in one sweep can never overshoot them (stability).
    for (let round = 0; round < Math.max(1, Math.round(p.gradientRounds)); round++) {
      delta.fill(0);
      for (let i = 0; i < n; i++) {
        if (type[i] !== CRUST.CONTINENTAL) continue;
        locator.forEachWithin(xyz[3 * i], xyz[3 * i + 1], xyz[3 * i + 2], p.reachCells * spacingRad, (c, d) => {
          // Any two continental cells in contact may exchange: within a plate this is
          // crustal flow, across plates it is a suture zone. Plate labels do not matter.
          if (c <= i || type[c] !== CRUST.CONTINENTAL) return;
          const hi = thickness[i] > thickness[c] ? i : c, lo = hi === i ? c : i;
          const diff = thickness[hi] - thickness[lo];
          if (diff <= 0) return;
          if (isCraton[lo] && thickness[lo] >= p.cratonMaxKm) return;  // craton margins take a bounded thrust load
          const flow = p.spreadRate * Math.min(Math.max(0, thickness[hi] - p.flowThresholdKm), diff);   // plateau flow
          const limit = maxStep * (d / spacingRad);
          const slump = Math.max(0, diff - limit);                                                      // gradient limit
          // Flow shares the cell among ~12 pair-updates; the slump term may move faster
          // (≤ 6 neighbours each giving (diff−limit)/6 cannot lift a cell past any of them).
          const move = flow / 12 + slump / 6;
          delta[hi] -= move; delta[lo] += move;
        });
      }
      for (let i = 0; i < n; i++) thickness[i] += delta[i];
    }
  },
});
