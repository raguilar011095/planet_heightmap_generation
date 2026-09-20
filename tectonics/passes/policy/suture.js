// Suturing: two plates in sustained continental collision become one. The
// blog kills a trench when a continent arrives; here, once the collision has
// persisted for sutureAfterPolicySteps, the smaller continental plate is
// relabelled into the larger, which also stops the endless interpenetration a
// purely kinematic collision would otherwise produce.

import { definePass } from '../../sim/define-pass.js';

export default definePass({
  id: 'policy.suture',
  phase: 'policy',
  schedule: 'policy',
  doc: `Tracks, per plate pair, how many consecutive policy steps their CC collision front has been
        at least minFrontKm long; after sutureAfterPolicySteps the plate with less continental
        crust is merged into the other.`,
  reads: ['crust.plateId'],
  writes: ['crust.plateId'],
  params: {
    minFrontKm:             { value: 800,    range: [100, 4000], unit: 'km', doc: 'Length of colliding front (in cells of spacing) needed for a step to count — a real collision, not a corner contact.' },
    sutureAfterPolicySteps: { value: 3,      range: [1, 8],     unit: '', doc: 'Consecutive colliding policy steps (150 Myr) before merging.' },
  },
  run(world, p, ctx) {
    const n = world.cellCount, plateId = ctx.write('crust.plateId');
    const minCells = p.minFrontKm / world.grid.spacingKm;
    const merges = [];
    for (const pl of world.plates) {
      if (pl.dead || !pl.stats) continue;
      const active = new Set();
      for (const [q, count] of pl.stats.collisionWith) {
        if (count < minCells) continue;
        active.add(q);
        pl.collisions.set(q, (pl.collisions.get(q) ?? 0) + 1);
      }
      for (const q of [...pl.collisions.keys()]) if (!active.has(q)) pl.collisions.delete(q);
      for (const [q, steps] of pl.collisions) {
        const other = world.plates[q];
        if (steps >= p.sutureAfterPolicySteps && other && !other.dead && pl.id < q) merges.push([pl.id, q]);
      }
    }
    let merged = 0;
    for (const [a, b] of merges) {
      const A = world.plates[a], B = world.plates[b];
      if (A.dead || B.dead) continue;
      const [keep, drop] = A.stats.contArea >= B.stats.contArea ? [A, B] : [B, A];
      for (let i = 0; i < n; i++) if (plateId[i] === drop.id) plateId[i] = keep.id;
      drop.dead = true; drop.stats.area = 0;
      keep.collisions.delete(drop.id);
      merged++;
    }
    ctx.diag('merged', new Float32Array([merged]));
  },
});
