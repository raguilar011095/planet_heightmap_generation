// Volcanic edifices are sub-grid: a stratovolcano is 30 km wide and 2-3 km
// high, a cell is 70-250 km. What the grid carries is whether a cell grew one
// (crust.volcano, assigned when the cell turned magmatic and transported with
// the crust) and how long ago its magma stopped (crust.magmaAge). This pass
// turns that into height, so an active arc reads as a string of islands and
// an old hotspot track as a chain of sinking seamounts.

import { definePass } from '../../sim/define-pass.js';
import { CRUST } from '../../state/crust-fields.js';

export default definePass({
  id: 'surface.volcanoes',
  phase: 'surface',
  doc: `Adds edificeHeightM × crust.volcano to the elevation of each volcanic cell: in full while
        magmaAge < activeMa, then decaying with e-folding edificeLifeMa as the extinct cone
        erodes. Runs after surface.thermalSubsidence.`,
  reads: ['crust.type', 'crust.volcano', 'crust.magmaAge', 'surface.elevation'],
  writes: ['surface.elevation'],
  params: {
    edificeHeightM: { value: 2500, range: [500, 5000], unit: 'm',   doc: 'Height of the largest edifice (crust.volcano = 1). Earth arc volcanoes rise 2-4 km above their base.' },
    activeMa:       { value: 10,   range: [1, 50],     unit: 'Myr', doc: 'An edifice keeps its full height this long after its last magma.' },
    edificeLifeMa:  { value: 60,   range: [10, 300],   unit: 'Myr', doc: 'e-folding time for an extinct edifice to erode away (Emperor seamounts are guyots by ~60 Myr).' },
  },
  run(world, p, ctx) {
    const type = ctx.read('crust.type'), volcano = ctx.read('crust.volcano'), magmaAge = ctx.read('crust.magmaAge');
    const elevation = ctx.write('surface.elevation');
    for (let i = 0; i < world.cellCount; i++) {
      if (type[i] === CRUST.NONE || volcano[i] <= 0) continue;
      const extinct = Math.max(0, magmaAge[i] - p.activeMa);
      elevation[i] += p.edificeHeightM * volcano[i] * Math.exp(-extinct / p.edificeLifeMa);
    }
  },
});
