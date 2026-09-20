// Over-thickened crustal roots become dense (eclogite) and founder into the
// mantle. Crust above maxThicknessKm leaves the system; the amount is reported
// so the mass books stay honest. Runs on every cell every substep, after flow.

import { definePass } from '../../sim/define-pass.js';
import { CRUST } from '../../state/crust-fields.js';

export default definePass({
  id: 'orogeny.delaminate',
  phase: 'orogeny',
  doc: `Removes continental crust above maxThicknessKm (Tibet peaks near 75 km; nothing on Earth
        exceeds ~80) as delaminated root, and reports the removed mass in toMantleKm.`,
  reads: ['crust.type'],
  writes: ['crust.thickness'],
  params: {
    maxThicknessKm: { value: 85, range: [60, 110], unit: 'km', doc: 'Crust thicker than this delaminates into the mantle.' },
  },
  run(world, p, ctx) {
    const type = ctx.read('crust.type'), thickness = ctx.write('crust.thickness');
    let lost = 0;
    for (let i = 0; i < world.cellCount; i++) {
      if (type[i] === CRUST.CONTINENTAL && thickness[i] > p.maxThicknessKm) { lost += thickness[i] - p.maxThicknessKm; thickness[i] = p.maxThicknessKm; }
    }
    ctx.diag('toMantleKm', new Float32Array([lost]));
  },
});
