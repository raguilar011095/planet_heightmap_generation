// A continental cell with no continental neighbour is not a continent; if it
// is thin it is a seamount or a scrap and reverts to oceanic crust (keeping its
// thickness, so it still stands up from the floor). Keeps hotspot tracks, arc
// remnants and stray converted margin cells from reading as a hundred
// micro-continents.

import { definePass } from '../../sim/define-pass.js';
import { CRUST } from '../../state/crust-fields.js';
import { radiusNeighbors } from '../../state/neighbors.js';

export default definePass({
  id: 'crust.consolidate',
  phase: 'crust',
  doc: `Reverts isolated continental cells (no continental neighbour within reachCells) thinner
        than keepKm to oceanic type, keeping their thickness. Isolated thick cells (real
        islands) stay continental.`,
  reads: ['crust.type', 'crust.thickness'],
  writes: ['crust.type', 'crust.terraneId', 'crust.isCraton'],
  params: {
    keepKm:     { value: 32,  range: [20, 45], unit: 'km',    doc: 'Isolated continental cells at least this thick remain continental islands.' },
    reachCells: { value: 1.3, range: [1, 2.5], unit: 'cells', doc: 'Neighbourhood radius for "isolated".' },
  },
  run(world, p, ctx) {
    const n = world.cellCount;
    const type = ctx.write('crust.type'), thickness = ctx.read('crust.thickness');
    const terraneId = ctx.write('crust.terraneId'), isCraton = ctx.write('crust.isCraton');
    const nb = radiusNeighbors(world, p.reachCells * world.grid.spacingRad);
    let reverted = 0;
    for (let i = 0; i < n; i++) {
      if (type[i] !== CRUST.CONTINENTAL || thickness[i] >= p.keepKm) continue;
      let alone = true;
      for (let k = nb.offset[i], ke = nb.offset[i + 1]; k < ke && alone; k++) { const c = nb.idx[k]; if (c !== i && type[c] === CRUST.CONTINENTAL) alone = false; }
      if (alone) { type[i] = CRUST.OCEANIC; terraneId[i] = -1; isCraton[i] = 0; reverted++; }
    }
    ctx.diag('reverted', new Float32Array([reverted]));
  },
});
