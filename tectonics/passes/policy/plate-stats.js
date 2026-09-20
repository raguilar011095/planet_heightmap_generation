// Per-plate bookkeeping the policy reasons with: area, continental fraction,
// centroid, and boundary summaries — where the plate is subducting (slab pull
// direction), where it is spreading (ridge push direction), and whom it is
// colliding with. Attached to world.plates[*].stats; nothing else reads cells.

import { definePass } from '../../sim/define-pass.js';
import { CRUST } from '../../state/crust-fields.js';
import { BOUNDARY } from '../../state/boundary-fields.js';
import { radiusNeighbors } from '../../state/neighbors.js';

export default definePass({
  id: 'policy.plateStats',
  phase: 'policy',
  schedule: 'policy',
  doc: `Summarises each plate for the policy: area, continental area, centroid, boundary cell
        count, and direction sums for slab pull (its oceanic cells being subducted under a
        neighbour, plus a weaker "potential" term where its ocean meets another plate's
        continent) and ridge push (its divergent or young boundary cells), plus collision
        partners. Written to world.plates[*].stats.`,
  reads: ['crust.plateId', 'crust.type', 'crust.ageMa', 'boundary.kind', 'boundary.overridingPlate'],
  writes: [],
  params: {
    potentialSlabWeight: { value: 0.4, range: [0, 1], unit: '', doc: 'Slab-pull weight for an oceanic cell facing another plate\'s continent before convergence has begun.' },
    youngRidgeAgeMa:     { value: 20,  range: [5, 60], unit: 'Myr', doc: 'Boundary cells younger than this count as ridge for ridge push.' },
  },
  run(world, p, ctx) {
    const n = world.cellCount, { xyz, spacingRad } = world.grid;
    const plateId = ctx.read('crust.plateId'), type = ctx.read('crust.type'), ageMa = ctx.read('crust.ageMa');
    const kind = ctx.read('boundary.kind'), overriding = ctx.read('boundary.overridingPlate');
    const nb = radiusNeighbors(world, 1.3 * spacingRad);
    for (const pl of world.plates) {
      pl.stats = { area: 0, contArea: 0, cx: 0, cy: 0, cz: 0, slab: [0, 0, 0], ridge: [0, 0, 0],
                   boundaryCells: 0, subductingCells: 0, collisionCells: 0, collisionWith: new Map(), neighbors: new Map(), isOceanic: true, centroid: [0, 0, 1] };
    }
    const qs = new Int32Array(16), qc = new Int32Array(16);
    for (let i = 0; i < n; i++) {
      const P = plateId[i];
      if (P < 0) continue;
      const s = world.plates[P].stats;
      const x = xyz[3 * i], y = xyz[3 * i + 1], z = xyz[3 * i + 2];
      s.area++; if (type[i] === CRUST.CONTINENTAL) s.contArea++;
      s.cx += x; s.cy += y; s.cz += z;
      let nx = 0, ny = 0, nz = 0, nq = 0, subducting = false, collision = kind[i] === BOUNDARY.CC, diverging = kind[i] === BOUNDARY.DIVERGENT, facesContinent = false;
      for (let k = nb.offset[i], ke = nb.offset[i + 1]; k < ke; k++) {
        const j = nb.idx[k], Q = plateId[j];
        if (Q === P || Q < 0) continue;
        nx += xyz[3 * j] - x; ny += xyz[3 * j + 1] - y; nz += xyz[3 * j + 2] - z;
        let t = 0; for (; t < nq; t++) if (qs[t] === Q) { qc[t]++; break; }
        if (t === nq && nq < 16) { qs[nq] = Q; qc[nq] = 1; nq++; }
        const kj = kind[j];
        if ((kj === BOUNDARY.OC || kj === BOUNDARY.OO) && overriding[j] === Q && type[i] === CRUST.OCEANIC) subducting = true;
        if (kj === BOUNDARY.CC) collision = true;
        if (kj === BOUNDARY.DIVERGENT) diverging = true;
        if (type[j] === CRUST.CONTINENTAL && type[i] === CRUST.OCEANIC) facesContinent = true;
      }
      if (!nq) continue;
      s.boundaryCells++;
      const d = nx * x + ny * y + nz * z; nx -= d * x; ny -= d * y; nz -= d * z;     // tangent
      const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      let best = 0; for (let t = 1; t < nq; t++) if (qc[t] > qc[best]) best = t;
      const Q = qs[best];
      s.neighbors.set(Q, (s.neighbors.get(Q) ?? 0) + 1);
      if (subducting) {
        const w = 0.5 + 0.5 * Math.min(1, ageMa[i] / 100);
        s.slab[0] += w * nx; s.slab[1] += w * ny; s.slab[2] += w * nz; s.subductingCells++;
      } else if (facesContinent) {
        s.slab[0] += p.potentialSlabWeight * nx; s.slab[1] += p.potentialSlabWeight * ny; s.slab[2] += p.potentialSlabWeight * nz;
      }
      if (diverging || ageMa[i] < p.youngRidgeAgeMa) { s.ridge[0] -= nx; s.ridge[1] -= ny; s.ridge[2] -= nz; }
      if (collision) { s.collisionCells++; s.collisionWith.set(Q, (s.collisionWith.get(Q) ?? 0) + 1); }
    }
    for (const pl of world.plates) {
      const s = pl.stats;
      if (s.area === 0) { pl.dead = true; continue; }
      const l = Math.hypot(s.cx, s.cy, s.cz) || 1;
      s.centroid = [s.cx / l, s.cy / l, s.cz / l];
      s.isOceanic = s.contArea < 0.3 * s.area;
    }
  },
});
