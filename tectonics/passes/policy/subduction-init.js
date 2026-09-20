// Subduction initiation (DESIGN.md §5.3). In a kinematic model a trench is a
// consequence of convergence, so "mark subduction just offshore of a moving
// continent's leading edge" means: the ocean ahead of the continent, which has
// been riding on the continental plate as a passive margin, becomes its own
// plate and is given slab pull toward the continent. Roughly every other
// policy step per continental plate, preferring old ocean floor. The ocean
// a stalled continent drags behind it is not exempt: the oldest sector around
// the continent is taken when the leading one is young (the Atlantic will not
// stay passive forever), which is what keeps the floor recycling over a Gyr.

import { definePass } from '../../sim/define-pass.js';
import { CRUST } from '../../state/crust-fields.js';
import { addPlate, velocityAt, rotationForVelocity } from '../../state/plates.js';
import { EARTH_RADIUS_KM } from '../../core/rotation.js';

export default definePass({
  id: 'policy.subductionInit',
  phase: 'policy',
  schedule: 'policy',
  doc: `For each continental plate, on alternate policy steps with initProbability, splits the
        oceanic cells lying within sectorHalfAngle of one direction from its centroid off into
        a new oceanic plate moving toward the continent at newPlateSpeed. The direction is the
        best-scoring of sectorCount candidates: mean floor age plus leadingBonusMa in the
        direction of motion, so the ocean ahead of a leading edge goes first and old floor
        elsewhere goes next. The plate must carry minContinentKm2 of continental crust, the
        sector must cover minSectorKm2 with a mean floor age of minAgeMa, and a plate waits
        everyNPolicySteps between initiations.`,
  reads: ['crust.plateId', 'crust.type', 'crust.ageMa'],
  writes: ['crust.plateId'],
  params: {
    initProbability:    { value: 0.6,    range: [0, 1],       unit: '',      doc: 'Chance per eligible plate per eligible policy step.' },
    everyNPolicySteps:  { value: 2,      range: [1, 5],       unit: '',      doc: 'Policy steps a plate waits after an initiation before its next (the blog: every other step).' },
    minContinentKm2:    { value: 8e6,    range: [5e5, 3e7],   unit: 'km²',   doc: 'Continental area a plate needs to drive subduction offshore (Australia ≈ 7.7e6, India ≈ 3.3e6): a scrap cannot.' },
    sectorHalfAngleDeg: { value: 60,     range: [20, 90],     unit: '°',     doc: 'Half-angle of the leading sector, measured from the continental centroid.' },
    minSectorKm2:       { value: 3e6,    range: [5e5, 3e7],   unit: 'km²',   doc: 'Minimum area of the split-off ocean plate (the Nazca plate is 1.6e7, the Juan de Fuca 2.5e5).' },
    minAgeMa:           { value: 50,     range: [0, 150],     unit: 'Myr',   doc: 'Old floor subducts more readily: minimum mean age of the sector.' },
    newPlateSpeedCmPerYr:{ value: 3,     range: [0.5, 8],     unit: 'cm/yr', doc: 'Initial speed of the new ocean plate toward the continent.' },
    sectorCount:        { value: 8,      range: [1, 16],      unit: '',      doc: 'Candidate directions around the continental centroid; 1 = the direction of motion only.' },
    leadingBonusMa:     { value: 80,     range: [0, 300],     unit: 'Myr',   doc: 'Score bonus (in age-equivalent) for the sector in the direction of motion, fading with the cosine of the angle from it.' },
  },
  run(world, p, ctx) {
    const n = world.cellCount, xyz = world.grid.xyz;
    const plateId = ctx.write('crust.plateId'), type = ctx.read('crust.type'), ageMa = ctx.read('crust.ageMa');
    const cosSector = Math.cos(p.sectorHalfAngleDeg * Math.PI / 180);
    let created = 0;
    const plates = world.plates.slice();                     // new plates are appended; do not revisit them
    const sectorCount = Math.max(1, Math.round(p.sectorCount));
    const cellKm2 = 4 * Math.PI * EARTH_RADIUS_KM ** 2 / n, minSectorCells = p.minSectorKm2 / cellKm2;
    for (const pl of plates) {
      if (pl.dead || !pl.stats || pl.stats.contArea < 0.3 * pl.stats.area || pl.stats.contArea * cellKm2 < p.minContinentKm2) continue;
      if (pl.lastSubductionInit !== undefined && ctx.policyIndex - pl.lastSubductionInit < Math.round(p.everyNPolicySteps)) continue;
      if (ctx.randPlate(pl.id, 10) >= p.initProbability) continue;
      // Continental centroid and direction of motion there.
      let cx = 0, cy = 0, cz = 0;
      for (let i = 0; i < n; i++) if (plateId[i] === pl.id && type[i] === CRUST.CONTINENTAL) { cx += xyz[3 * i]; cy += xyz[3 * i + 1]; cz += xyz[3 * i + 2]; }
      const cl = Math.hypot(cx, cy, cz) || 1; cx /= cl; cy /= cl; cz /= cl;
      const v = velocityAt(pl, cx, cy, cz), vl = Math.hypot(...v);
      if (vl < 1e-6) continue;
      const vx = v[0] / vl, vy = v[1] / vl, vz = v[2] / vl;
      // Tangent frame at the centroid: e1 along the motion, e2 = c × e1.
      const e2x = cy * vz - cz * vy, e2y = cz * vx - cx * vz, e2z = cx * vy - cy * vx;
      // Each oceanic cell's direction from the centroid, as an angle from the motion.
      const cells = [], angles = [];
      for (let i = 0; i < n; i++) {
        if (plateId[i] !== pl.id || type[i] !== CRUST.OCEANIC) continue;
        let dx = xyz[3 * i] - cx, dy = xyz[3 * i + 1] - cy, dz = xyz[3 * i + 2] - cz;
        const dr = dx * cx + dy * cy + dz * cz; dx -= dr * cx; dy -= dr * cy; dz -= dr * cz;
        if (dx * dx + dy * dy + dz * dz < 1e-18) continue;
        cells.push(i); angles.push(Math.atan2(dx * e2x + dy * e2y + dz * e2z, dx * vx + dy * vy + dz * vz));
      }
      // Score every candidate sector; take the best one that qualifies.
      let best = null;
      for (let s = 0; s < sectorCount; s++) {
        const theta = 2 * Math.PI * s / sectorCount;
        const sector = []; let ageSum = 0;
        for (let k = 0; k < cells.length; k++) if (Math.cos(angles[k] - theta) > cosSector) { sector.push(cells[k]); ageSum += ageMa[cells[k]]; }
        if (sector.length < minSectorCells) continue;
        const meanAge = ageSum / sector.length;
        if (meanAge < p.minAgeMa) continue;
        const score = meanAge + p.leadingBonusMa * Math.cos(theta);
        if (!best || score > best.score) best = { score, sector, theta };
      }
      if (!best) continue;
      const q = addPlate(world, { parent: pl.id });
      let qx = 0, qy = 0, qz = 0;
      for (const i of best.sector) { plateId[i] = q; qx += xyz[3 * i]; qy += xyz[3 * i + 1]; qz += xyz[3 * i + 2]; }
      const ql = Math.hypot(qx, qy, qz) || 1;
      // The new plate heads back toward the continent: opposite to the sector's own direction.
      const ct = Math.cos(best.theta), st = Math.sin(best.theta);
      const dx = ct * vx + st * e2x, dy = ct * vy + st * e2y, dz = ct * vz + st * e2z;
      const rot = rotationForVelocity(qx / ql, qy / ql, qz / ql, -dx, -dy, -dz, p.newPlateSpeedCmPerYr);
      Object.assign(world.plates[q], rot);
      pl.lastSubductionInit = ctx.policyIndex;
      created++;
    }
    ctx.diag('created', new Float32Array([created]));
  },
});
