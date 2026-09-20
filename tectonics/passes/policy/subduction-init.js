// Subduction initiation (DESIGN.md §5.3). In a kinematic model a trench is a
// consequence of convergence, so "mark subduction just offshore of a moving
// continent's leading edge" means: the ocean ahead of the continent, which has
// been riding on the continental plate as a passive margin, becomes its own
// plate and is given slab pull toward the continent. Roughly every other
// policy step per continental plate, preferring old ocean floor.

import { definePass } from '../../sim/define-pass.js';
import { CRUST } from '../../state/crust-fields.js';
import { addPlate, velocityAt, rotationForVelocity } from '../../state/plates.js';

export default definePass({
  id: 'policy.subductionInit',
  phase: 'policy',
  schedule: 'policy',
  doc: `For each continental plate, on alternate policy steps with initProbability, splits the
        oceanic cells lying within sectorHalfAngle of its direction of motion off into a new
        oceanic plate moving toward the continent at newPlateSpeed — the ocean ahead of a
        leading edge starts subducting. Requires at least minOceanFraction of all cells and a
        mean floor age of minAgeMa.`,
  reads: ['crust.plateId', 'crust.type', 'crust.ageMa'],
  writes: ['crust.plateId'],
  params: {
    initProbability:    { value: 0.6,    range: [0, 1],       unit: '',      doc: 'Chance per eligible plate per eligible policy step.' },
    everyNPolicySteps:  { value: 2,      range: [1, 5],       unit: '',      doc: 'A plate is eligible every N policy steps (the blog: every other step).' },
    sectorHalfAngleDeg: { value: 60,     range: [20, 90],     unit: '°',     doc: 'Half-angle of the leading sector, measured from the continental centroid.' },
    minOceanFraction:   { value: 0.0004, range: [0, 0.01],    unit: '',      doc: 'Minimum size of the split-off ocean plate as a fraction of all cells.' },
    minAgeMa:           { value: 50,     range: [0, 150],     unit: 'Myr',   doc: 'Old floor subducts more readily: minimum mean age of the sector.' },
    newPlateSpeedCmPerYr:{ value: 3,     range: [0.5, 8],     unit: 'cm/yr', doc: 'Initial speed of the new ocean plate toward the continent.' },
  },
  run(world, p, ctx) {
    const n = world.cellCount, xyz = world.grid.xyz;
    const plateId = ctx.write('crust.plateId'), type = ctx.read('crust.type'), ageMa = ctx.read('crust.ageMa');
    const cosSector = Math.cos(p.sectorHalfAngleDeg * Math.PI / 180);
    let created = 0;
    const plates = world.plates.slice();                     // new plates are appended; do not revisit them
    for (const pl of plates) {
      if (pl.dead || !pl.stats || pl.stats.contArea < 0.3 * pl.stats.area) continue;
      if ((ctx.policyIndex + pl.id) % Math.round(p.everyNPolicySteps) !== 0) continue;
      if (ctx.randPlate(pl.id, 10) >= p.initProbability) continue;
      // Continental centroid and direction of motion there.
      let cx = 0, cy = 0, cz = 0;
      for (let i = 0; i < n; i++) if (plateId[i] === pl.id && type[i] === CRUST.CONTINENTAL) { cx += xyz[3 * i]; cy += xyz[3 * i + 1]; cz += xyz[3 * i + 2]; }
      const cl = Math.hypot(cx, cy, cz) || 1; cx /= cl; cy /= cl; cz /= cl;
      const v = velocityAt(pl, cx, cy, cz), vl = Math.hypot(...v);
      if (vl < 1e-6) continue;
      const vx = v[0] / vl, vy = v[1] / vl, vz = v[2] / vl;
      // Oceanic cells of this plate in the leading sector.
      const sector = []; let ageSum = 0;
      for (let i = 0; i < n; i++) {
        if (plateId[i] !== pl.id || type[i] !== CRUST.OCEANIC) continue;
        let dx = xyz[3 * i] - cx, dy = xyz[3 * i + 1] - cy, dz = xyz[3 * i + 2] - cz;
        const dr = dx * cx + dy * cy + dz * cz; dx -= dr * cx; dy -= dr * cy; dz -= dr * cz;
        const dl = Math.hypot(dx, dy, dz); if (dl < 1e-9) continue;
        if ((dx * vx + dy * vy + dz * vz) / dl > cosSector) { sector.push(i); ageSum += ageMa[i]; }
      }
      if (sector.length < p.minOceanFraction * n || ageSum / sector.length < p.minAgeMa) continue;
      const q = addPlate(world, { parent: pl.id });
      let qx = 0, qy = 0, qz = 0;
      for (const i of sector) { plateId[i] = q; qx += xyz[3 * i]; qy += xyz[3 * i + 1]; qz += xyz[3 * i + 2]; }
      const ql = Math.hypot(qx, qy, qz) || 1;
      const rot = rotationForVelocity(qx / ql, qy / ql, qz / ql, -vx, -vy, -vz, p.newPlateSpeedCmPerYr);
      Object.assign(world.plates[q], rot);
      created++;
    }
    ctx.diag('created', new Float32Array([created]));
  },
});
