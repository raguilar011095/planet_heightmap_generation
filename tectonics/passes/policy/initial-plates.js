// P1 stand-in for the plate policy: partition the initial world into plateCount
// Voronoi plates around farthest-point seeds and give each a seeded random
// Euler rotation in the observed speed band. P2 replaces the rotations with the
// rule-based policy; the partition survives as its starting point.

import { definePass } from '../../sim/define-pass.js';
import { addPlate } from '../../state/plates.js';
import { cmPerYrToDegPerMyr } from '../../core/rotation.js';
import { radiusNeighbors } from '../../state/neighbors.js';

export default definePass({
  id: 'policy.initialPlates',
  phase: 'init',
  schedule: 'once',
  doc: `Partitions all cells into plateCount Voronoi plates around farthest-point seeds, keeps each
        craton whole on the plate holding most of it, and assigns each plate a random pole and a
        speed uniform in [speedMin, speedMax] cm/yr with random sense. Prescribed motion for P1;
        P2 supplies the policy.`,
  reads: ['crust.terraneId', 'crust.isCraton'],
  writes: ['crust.plateId'],
  params: {
    plateCount:      { value: 8, range: [1, 24], unit: '',      doc: 'Number of plates.' },
    speedMinCmPerYr: { value: 1, range: [0, 10], unit: 'cm/yr', doc: 'Slowest plate.' },
    speedMaxCmPerYr: { value: 5, range: [0, 12], unit: 'cm/yr', doc: 'Fastest plate (relative convergence can reach twice this).' },
    smoothRounds:    { value: 3, range: [0, 8],  unit: '',      doc: 'Majority-vote smoothing sweeps over the partition after cratons are made whole.' },
  },
  run(world, p, ctx) {
    const n = world.cellCount, xyz = world.grid.xyz;
    const plateId = ctx.write('crust.plateId');
    const count = Math.max(1, Math.round(p.plateCount));

    // Farthest-point seeds.
    const seeds = [Math.floor(ctx.rand(0) * n)];
    const minD = new Float32Array(n).fill(Infinity);
    const update = (s) => {
      const sx = xyz[3 * s], sy = xyz[3 * s + 1], sz = xyz[3 * s + 2];
      for (let i = 0; i < n; i++) {
        const d = 1 - (xyz[3 * i] * sx + xyz[3 * i + 1] * sy + xyz[3 * i + 2] * sz);
        if (d < minD[i]) minD[i] = d;
      }
    };
    update(seeds[0]);
    while (seeds.length < count) {
      let best = -1, bd = -1;
      for (let i = 0; i < n; i++) if (minD[i] > bd) { bd = minD[i]; best = i; }
      seeds.push(best); update(best);
    }

    // Voronoi assignment and plate objects.
    for (let k = 0; k < count; k++) {
      addPlate(world, {
        poleLat: Math.asin(ctx.randPlate(k, 0) * 2 - 1) * 180 / Math.PI,
        poleLon: ctx.randPlate(k, 1) * 360 - 180,
        degPerMyr: (ctx.randPlate(k, 3) < 0.5 ? -1 : 1) *
          cmPerYrToDegPerMyr(p.speedMinCmPerYr + ctx.randPlate(k, 2) * (p.speedMaxCmPerYr - p.speedMinCmPerYr)),
      });
    }
    for (let i = 0; i < n; i++) {
      let best = 0, bd = -2;
      for (let k = 0; k < count; k++) {
        const s = seeds[k];
        const d = xyz[3 * i] * xyz[3 * s] + xyz[3 * i + 1] * xyz[3 * s + 1] + xyz[3 * i + 2] * xyz[3 * s + 2];
        if (d > bd) { bd = d; best = k; }
      }
      plateId[i] = best;
    }

    // Plate boundaries go around cratons, never through them: each craton joins the
    // plate that holds most of it.
    const terraneId = ctx.read('crust.terraneId'), isCraton = ctx.read('crust.isCraton');
    const votes = new Map();
    for (let i = 0; i < n; i++) {
      if (!isCraton[i]) continue;
      const v = votes.get(terraneId[i]) ?? new Int32Array(count);
      v[plateId[i]]++; votes.set(terraneId[i], v);
    }
    const winner = new Map();
    for (const [t, v] of votes) { let b = 0; for (let k = 1; k < count; k++) if (v[k] > v[b]) b = k; winner.set(t, b); }
    for (let i = 0; i < n; i++) if (isCraton[i]) plateId[i] = winner.get(terraneId[i]);

    // Majority smoothing: a cell surrounded by another plate joins it. Removes the
    // one-cell slivers the craton reassignment leaves, which would otherwise be
    // convergent on every side and collect an entire collision's excess.
    const nb = radiusNeighbors(world, 1.3 * world.grid.spacingRad);
    const tally = new Int32Array(count), out = new Int32Array(n);
    for (let round = 0; round < Math.round(p.smoothRounds); round++) {
      for (let i = 0; i < n; i++) {
        out[i] = plateId[i];
        if (isCraton[i]) continue;
        tally.fill(0);
        for (let k = nb.offset[i], ke = nb.offset[i + 1]; k < ke; k++) tally[plateId[nb.idx[k]]]++;
        let best = plateId[i];
        for (let k = 0; k < count; k++) if (tally[k] > tally[best]) best = k;
        out[i] = best;
      }
      plateId.set(out);
    }
  },
});
