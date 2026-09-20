// A plate is one connected piece of lithosphere. Transport on a grid leaves
// speckle behind it: a duplicate particle relocated into a gap inside another
// plate, a hole filled with a neighbour's plate id, a detached strip that was
// two pieces. Each stray fragment then moves with a plate it is not attached
// to, cutting fake boundaries through its host (and fake trenches, and fake
// arcs). This pass gives every small fragment that is not its plate's main
// body to the plate it touches most — the same thing that happens to a real
// sliver caught between plates: it is captured. A fragment too large to be
// speckle (a plate genuinely cut in two) becomes a plate of its own, keeping
// its parent's motion until the policy takes over. A whole plate smaller
// than a microplate is captured too: nothing that small moves on its own.

import { definePass } from '../../sim/define-pass.js';
import { radiusNeighbors } from '../../state/neighbors.js';
import { addPlate, omegaOf, setOmega } from '../../state/plates.js';
import { EARTH_RADIUS_KM } from '../../core/rotation.js';

export default definePass({
  id: 'crust.coalescePlates',
  phase: 'crust',
  doc: `Labels the connected components of crust.plateId (adjacency within reachCells). Every
        component except the largest one of each plate is reassigned: below spawnRadiusKm (as
        an equivalent disc) to the neighbouring plate with the most contact along its rim,
        above it to a new plate with the parent's rotation. A plate whose largest component is
        below captureRadiusKm is captured whole. The crust itself is untouched: only who
        carries it.`,
  reads: ['crust.plateId'],
  writes: ['crust.plateId'],
  params: {
    reachCells:      { value: 1.3, range: [1, 2.5],     unit: 'cells', doc: 'Adjacency radius for connectivity.' },
    captureRadiusKm: { value: 400,  range: [100, 2000], unit: 'km',   doc: 'A whole plate smaller than a disc of this radius (0.5e6 km², about the Juan de Fuca plate) is captured by its neighbour.' },
    spawnRadiusKm:   { value: 1200, range: [300, 4000], unit: 'km',   doc: 'A disconnected fragment larger than a disc of this radius (4.5e6 km², a Scotia-to-Philippine-Sea sized piece) becomes a microplate; smaller fragments are captured.' },
  },
  run(world, p, ctx) {
    const n = world.cellCount, plateId = ctx.write('crust.plateId');
    const nb = radiusNeighbors(world, p.reachCells * world.grid.spacingRad);
    const comp = new Int32Array(n).fill(-1), compSize = [], compPlate = [];
    const stack = [];
    for (let i = 0; i < n; i++) {
      if (comp[i] >= 0 || plateId[i] < 0) continue;
      const id = compSize.length; compSize.push(0); compPlate.push(plateId[i]);
      comp[i] = id; stack.push(i);
      while (stack.length) {
        const c = stack.pop(); compSize[id]++;
        for (let k = nb.offset[c], ke = nb.offset[c + 1]; k < ke; k++) { const j = nb.idx[k]; if (comp[j] < 0 && plateId[j] === plateId[c]) { comp[j] = id; stack.push(j); } }
      }
    }
    const discCells = (rKm) => Math.PI * rKm * rKm / (4 * Math.PI * EARTH_RADIUS_KM ** 2) * n;
    const captureCells = discCells(p.captureRadiusKm), spawnCells = discCells(p.spawnRadiusKm);
    const main = new Map();                                   // plate → its largest component
    for (let id = 0; id < compSize.length; id++) { const P = compPlate[id]; if (!main.has(P) || compSize[main.get(P)] < compSize[id]) main.set(P, id); }
    for (const [P, id] of main) if (compSize[id] < captureCells) main.delete(P);   // too small to be a plate: every piece is a fragment
    // Contact counts of each stray component with each foreign plate, then reassign.
    const contact = new Map();
    for (let i = 0; i < n; i++) {
      const id = comp[i]; if (id < 0 || main.get(compPlate[id]) === id) continue;
      let m = contact.get(id); if (!m) { m = new Map(); contact.set(id, m); }
      for (let k = nb.offset[i], ke = nb.offset[i + 1]; k < ke; k++) { const Q = plateId[nb.idx[k]]; if (Q >= 0 && Q !== compPlate[id]) m.set(Q, (m.get(Q) ?? 0) + 1); }
    }
    const target = new Map();
    let reassigned = 0, spawned = 0;
    for (const [id, m] of contact) {
      if (compSize[id] >= spawnCells) {
        const parent = world.plates[compPlate[id]], q = addPlate(world, { parent: parent.id });
        const w = omegaOf(parent); setOmega(world, q, w[0], w[1], w[2]);
        world.plates[q].lastRift = parent.lastRift;
        target.set(id, q); spawned++;
        continue;
      }
      let best = -1, bc = 0; for (const [Q, c] of m) if (c > bc) { bc = c; best = Q; } if (best >= 0) target.set(id, best);
    }
    for (let i = 0; i < n; i++) { const t = target.get(comp[i]); if (t !== undefined) { plateId[i] = t; reassigned++; } }
    ctx.diag('reassigned', new Float32Array([reassigned]));
    ctx.diag('spawned', new Float32Array([spawned]));
    ctx.diag('components', new Float32Array([compSize.length]));
  },
});
