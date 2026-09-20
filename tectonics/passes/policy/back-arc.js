// Back-arc detachment (Japan, Scotia, the Marianas): ocean has been subducting
// under a margin for a while and the overriding plate is not advancing, so the
// slab rolls back and a rift opens behind the arc, parallel to the trench. The
// strip between rift and trench becomes its own plate carrying the arc — an
// island chain that keeps its terrane identity — and moves oceanward; the gap
// behind it stretches then spreads into a back-arc basin (motion/gap-fill.js).

import { definePass } from '../../sim/define-pass.js';
import { CRUST } from '../../state/crust-fields.js';
import { addPlate, velocityAt, rotationForVelocity } from '../../state/plates.js';
import { EARTH_RADIUS_KM } from '../../core/rotation.js';

export default definePass({
  id: 'policy.backArc',
  phase: 'policy',
  schedule: 'policy',
  doc: `For each plate overriding a subducting ocean along a front of at least minFrontKm that has
        persisted maturePolicySteps, with probability detachProbability (lower the faster the plate
        advances toward its trench): the plate's non-craton cells within stripWidthKm of the front
        become a new arc plate moving oceanward at rollbackSpeed relative to the parent. A back-arc
        basin then opens behind the arc by the ordinary rift mechanism.`,
  reads: ['crust.plateId', 'crust.type', 'crust.isCraton'],
  writes: ['crust.plateId'],
  params: {
    minFrontKm:           { value: 1200, range: [300, 5000], unit: 'km',    doc: 'Trench front length needed.' },
    maturePolicySteps:    { value: 2,    range: [1, 8],      unit: '',      doc: 'Consecutive policy steps the front must have existed (2 = 100 Myr).' },
    detachProbability:    { value: 0.35, range: [0, 1],      unit: '',      doc: 'Chance per mature front per policy step when the overriding plate is not advancing.' },
    stripWidthKm:         { value: 280,  range: [100, 600],  unit: 'km',    doc: 'Width of the detached arc strip, measured from the trench.' },
    rollbackSpeedCmPerYr: { value: 2,    range: [0.5, 6],    unit: 'cm/yr', doc: 'Oceanward speed of the arc plate relative to its parent.' },
    refractoryPolicySteps:{ value: 4,    range: [0, 12],     unit: '',      doc: 'A plate that just shed an arc cannot do so again for this long.' },
    minStripKm2:          { value: 1e6,  range: [1e5, 1e7],  unit: 'km²',   doc: 'Smallest strip that becomes a plate (Japan\'s arc is about 1e6 km²).' },
  },
  run(world, p, ctx) {
    const n = world.cellCount, { xyz, locator, spacingKm } = world.grid;
    const plateId = ctx.write('crust.plateId'), type = ctx.read('crust.type'), isCraton = ctx.read('crust.isCraton');
    const minFrontCells = p.minFrontKm / spacingKm;
    let detached = 0;
    const plates = world.plates.slice();
    for (const pl of plates) {
      if (pl.dead || !pl.stats) continue;
      const s = pl.stats;
      // Maturity bookkeeping per subducting neighbour.
      pl.fronts ??= new Map();
      const live = new Set();
      for (const [q, cells] of s.overridingWith) {
        if (cells < minFrontCells) continue;
        live.add(q); pl.fronts.set(q, (pl.fronts.get(q) ?? 0) + 1);
      }
      for (const q of [...pl.fronts.keys()]) if (!live.has(q)) pl.fronts.delete(q);
      if (pl.lastDetach !== undefined && ctx.policyIndex - pl.lastDetach < p.refractoryPolicySteps) continue;
      for (const [q, steps] of pl.fronts) {
        if (steps < p.maturePolicySteps) continue;
        // Front cells facing plate q, their mean position and outward normal (toward q).
        const front = s.overridingCells.filter(i => true);
        let fx = 0, fy = 0, fz = 0;
        for (const i of front) { fx += xyz[3 * i]; fy += xyz[3 * i + 1]; fz += xyz[3 * i + 2]; }
        const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
        const [cx, cy, cz] = s.centroid;
        let ox = fx - cx, oy = fy - cy, oz = fz - cz;                       // continent centroid → front
        const od = ox * fx + oy * fy + oz * fz; ox -= od * fx; oy -= od * fy; oz -= od * fz;
        const ol = Math.hypot(ox, oy, oz) || 1; ox /= ol; oy /= ol; oz /= ol;
        // Advancing plates (moving toward their trench) keep their arc; rollback needs a slow one.
        const v = velocityAt(pl, fx, fy, fz), adv = (v[0] * ox + v[1] * oy + v[2] * oz) * 0.1;   // cm/yr toward the trench
        const prob = p.detachProbability * Math.max(0, 1 - adv / 3);
        if (ctx.randPlate(pl.id, 50 + q) >= prob) continue;
        // The strip: this plate's non-craton cells within stripWidthKm of any front cell.
        const strip = new Set();
        const r = p.stripWidthKm / EARTH_RADIUS_KM;
        for (const i of front) locator.forEachWithin(xyz[3 * i], xyz[3 * i + 1], xyz[3 * i + 2], r, (c) => { if (plateId[c] === pl.id && !isCraton[c]) strip.add(c); });
        if (strip.size * 4 * Math.PI * EARTH_RADIUS_KM ** 2 / n < p.minStripKm2) continue;
        const a = addPlate(world, { parent: pl.id });
        let ax = 0, ay = 0, az = 0;
        for (const c of strip) { plateId[c] = a; ax += xyz[3 * c]; ay += xyz[3 * c + 1]; az += xyz[3 * c + 2]; }
        const al = Math.hypot(ax, ay, az) || 1; ax /= al; ay /= al; az /= al;
        const va = velocityAt(pl, ax, ay, az), k = p.rollbackSpeedCmPerYr * 10;
        const nx = va[0] + k * ox, ny = va[1] + k * oy, nz = va[2] + k * oz;
        Object.assign(world.plates[a], rotationForVelocity(ax, ay, az, nx, ny, nz, Math.hypot(nx, ny, nz) * 0.1));
        world.plates[a].lastRift = ctx.policyIndex; world.plates[a].isArc = true;
        pl.lastDetach = ctx.policyIndex; pl.fronts.delete(q);
        detached++;
        break;
      }
    }
    ctx.diag('detached', new Float32Array([detached]));
  },
});
