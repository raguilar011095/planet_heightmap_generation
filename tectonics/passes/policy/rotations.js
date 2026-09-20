// The rotation policy — the blog's rules of thumb for choosing each plate's
// Euler rotation every 50 Myr, as code (DESIGN.md §5.2):
//   direction: toward its trenches, away from its ridges, with persistence and a
//              little wobble;
//   speed:     a base rate, faster with more subducting margin, slower with more
//              continental area, sharply slower once in continental collision,
//              clamped to the observed 1–10 cm/yr band;
//   frame:     most of the net rotation of the whole lithosphere is removed.

import { definePass } from '../../sim/define-pass.js';
import { velocityAt, rotationForVelocity, omegaOf, setOmega, plateSpeedCmPerYr } from '../../state/plates.js';

function tangent(cx, cy, cz, vx, vy, vz) {
  const d = vx * cx + vy * cy + vz * cz;
  return [vx - d * cx, vy - d * cy, vz - d * cz];
}
function unit(v) { const l = Math.hypot(v[0], v[1], v[2]); return l > 1e-12 ? [v[0] / l, v[1] / l, v[2] / l] : [0, 0, 0]; }

export default definePass({
  id: 'policy.rotations',
  phase: 'policy',
  schedule: 'policy',
  doc: `Chooses every plate's Euler rotation for the next policy interval from its stats: the
        desired velocity at the centroid blends the previous velocity (persistence), the slab
        pull and ridge push directions, and random wobble; speed = base + slabGain·subducting
        fraction − contDrag·continental fraction, times collisionFactor when colliding, clamped
        to [minSpeed, maxSpeed]. Then netRotationDamping of the area-weighted mean angular
        velocity is removed from every plate.`,
  reads: [],
  writes: [],
  params: {
    baseSpeedCmPerYr:   { value: 3.5,  range: [0.5, 8],   unit: 'cm/yr', doc: 'Speed of a plate with no slab and no continent. Earth\'s mean plate speed is ~4-5 cm/yr; spreading must keep the floor young.' },
    slabGain:           { value: 6,    range: [0, 12],    unit: 'cm/yr', doc: 'Added speed per unit subducting-boundary fraction.' },
    contDrag:           { value: 1.5,  range: [0, 4],     unit: 'cm/yr', doc: 'Speed removed per unit continental-area fraction.' },
    minSpeedCmPerYr:    { value: 1.5,  range: [0, 3],     unit: 'cm/yr', doc: 'Slowest a plate is allowed to move (re-applied after the net-rotation correction).' },
    maxSpeedCmPerYr:    { value: 10,   range: [3, 15],    unit: 'cm/yr', doc: 'Fastest a plate is allowed to move.' },
    collisionFactor:    { value: 0.3,  range: [0.05, 1],  unit: '',      doc: 'Speed multiplier once a plate is in continental collision.' },
    collisionFraction:  { value: 0.05, range: [0, 0.5],   unit: '',      doc: 'Fraction of boundary cells in CC collision that counts as "in collision".' },
    persistence:        { value: 0.75, range: [0, 0.95],  unit: '',      doc: 'Weight of the previous velocity direction.' },
    ridgeWeight:        { value: 0.5,  range: [0, 2],     unit: '',      doc: 'Ridge push relative to slab pull.' },
    wobble:             { value: 0.15, range: [0, 0.6],   unit: '',      doc: 'Random tangent component added to the direction.' },
    netRotationDamping: { value: 0.8,  range: [0, 1],     unit: '',      doc: 'Fraction of the lithosphere\'s net rotation removed each policy step.' },
  },
  run(world, p, ctx) {
    const speeds = [];
    let wx = 0, wy = 0, wz = 0, areaSum = 0;
    for (const pl of world.plates) {
      if (pl.dead || !pl.stats || pl.stats.area === 0) continue;
      const s = pl.stats, [cx, cy, cz] = s.centroid, nbc = Math.max(1, s.boundaryCells);
      const force = tangent(cx, cy, cz, s.slab[0] + p.ridgeWeight * s.ridge[0], s.slab[1] + p.ridgeWeight * s.ridge[1], s.slab[2] + p.ridgeWeight * s.ridge[2]);
      const fmag = Math.hypot(...force) / nbc;                   // per boundary cell, 0..~1
      const f = unit(force);
      const prev = unit(tangent(cx, cy, cz, ...velocityAt(pl, cx, cy, cz)));
      const r1 = ctx.randPlate(pl.id, 0) * 2 - 1, r2 = ctx.randPlate(pl.id, 1) * 2 - 1, r3 = ctx.randPlate(pl.id, 2) * 2 - 1;
      const rnd = unit(tangent(cx, cy, cz, r1, r2, r3));
      const fw = (1 - p.persistence) * Math.min(1, fmag / 0.3);   // weak force fields steer less
      let dir = [
        p.persistence * prev[0] + fw * f[0] + p.wobble * rnd[0],
        p.persistence * prev[1] + fw * f[1] + p.wobble * rnd[1],
        p.persistence * prev[2] + fw * f[2] + p.wobble * rnd[2],
      ];
      if (Math.hypot(...dir) < 1e-6) dir = rnd;
      const subFrac = s.subductingCells / nbc, contFrac = s.contArea / s.area;
      let speed = p.baseSpeedCmPerYr + p.slabGain * subFrac - p.contDrag * contFrac;
      speed = Math.max(p.minSpeedCmPerYr, Math.min(p.maxSpeedCmPerYr, speed));
      if (s.collisionCells > p.collisionFraction * nbc) speed *= p.collisionFactor;
      const rot = rotationForVelocity(cx, cy, cz, dir[0], dir[1], dir[2], speed);
      pl.poleLat = rot.poleLat; pl.poleLon = rot.poleLon; pl.degPerMyr = rot.degPerMyr;
      const w = omegaOf(pl);
      wx += s.area * w[0]; wy += s.area * w[1]; wz += s.area * w[2]; areaSum += s.area;
      speeds.push(speed);
    }
    if (areaSum > 0 && p.netRotationDamping > 0) {
      wx /= areaSum; wy /= areaSum; wz /= areaSum;
      for (const pl of world.plates) {
        if (pl.dead || !pl.stats || pl.stats.area === 0) continue;
        const w = omegaOf(pl);
        setOmega(world, pl.id, w[0] - p.netRotationDamping * wx, w[1] - p.netRotationDamping * wy, w[2] - p.netRotationDamping * wz);
        // The frame change can push a plate outside the band; the band is a rule, so re-clamp.
        const s = plateSpeedCmPerYr(pl);
        const target = Math.max(p.minSpeedCmPerYr, Math.min(p.maxSpeedCmPerYr, s));
        if (s > 1e-9 && Math.abs(target - s) > 1e-9) pl.degPerMyr *= target / s;
      }
    }
    ctx.diag('speedsCmPerYr', new Float32Array(speeds));
  },
});
