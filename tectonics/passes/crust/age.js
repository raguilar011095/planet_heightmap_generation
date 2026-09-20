// Advances the clocks that live in crust cells.

import { definePass } from '../../sim/define-pass.js';
import { CRUST } from '../../state/crust-fields.js';

export default definePass({
  id: 'crust.age',
  phase: 'crust',
  doc: `Adds the substep length to every cell's crust age, time-since-orogeny and
        time-since-magmatism. Ages are clamped to their declared ranges.`,
  reads: ['crust.type'],
  writes: ['crust.ageMa', 'crust.orogenAge', 'crust.magmaAge'],
  params: {},
  run(world, p, ctx) {
    const type = ctx.read('crust.type');
    const ageMa = ctx.write('crust.ageMa'), orogenAge = ctx.write('crust.orogenAge'), magmaAge = ctx.write('crust.magmaAge');
    const dt = ctx.dtMyr;
    for (let i = 0; i < world.cellCount; i++) {
      if (type[i] === CRUST.NONE) continue;
      ageMa[i] = Math.min(5000, ageMa[i] + dt);
      orogenAge[i] = Math.min(5000, orogenAge[i] + dt);
      magmaAge[i] = Math.min(5000, magmaAge[i] + dt);
    }
  },
});
