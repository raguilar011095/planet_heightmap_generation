// Rifting (DESIGN.md §5.5). At policy steps a continental plate may split along
// a great circle through a chosen centre — a recent LIP if one lies under it,
// else a random continental cell — with a random strike. The two sides get
// divergent velocities; ridge push and persistence keep them going. Some rifts
// fail: the crust is thinned along the line (an aulacogen) and nothing splits.

import { definePass } from '../../sim/define-pass.js';
import { CRUST } from '../../state/crust-fields.js';
import { addPlate, velocityAt, rotationForVelocity } from '../../state/plates.js';
import { EARTH_RADIUS_KM } from '../../core/rotation.js';

export default definePass({
  id: 'policy.rift',
  phase: 'policy',
  schedule: 'policy',
  doc: `Each policy step, a continental plate rifts with riftProbability (×largeBoost when it
        holds more than largeFraction of all cells, ×lipBoost when a LIP younger than lipMemoryMa
        lies under it). The rift is a great circle through the LIP or a random continental cell
        with a random strike. With failFraction, or if either side would be smaller than
        minPieceFraction, the rift fails and thins the crust by thinKm in a thinBandKm band
        instead. Otherwise the smaller side becomes a new plate and both sides receive
        riftSpeed away from the line.`,
  reads: ['crust.plateId', 'crust.type', 'crust.thickness'],
  writes: ['crust.plateId', 'crust.thickness'],
  params: {
    riftProbability:  { value: 0.12,  range: [0, 1],     unit: '',      doc: 'Base chance per continental plate per policy step.' },
    largeFraction:    { value: 0.08,  range: [0.02, 0.3],unit: '',      doc: 'A plate with more continental cells than this fraction of all cells is "large".' },
    largeBoost:       { value: 2,     range: [1, 5],     unit: '',      doc: 'Probability multiplier for large plates.' },
    lipBoost:         { value: 4,     range: [1, 10],    unit: '',      doc: 'Probability multiplier when a recent LIP underlies the plate.' },
    lipMemoryMa:      { value: 100,   range: [20, 300],  unit: 'Myr',   doc: 'How long a LIP keeps promoting rifting.' },
    failFraction:     { value: 0.35,  range: [0, 1],     unit: '',      doc: 'Fraction of rifts that fail.' },
    minPieceFraction: { value: 0.004, range: [0.001, 0.05], unit: '',   doc: 'Smallest continental piece a rift may produce, as a fraction of all cells.' },
    riftSpeedCmPerYr: { value: 1.5,   range: [0.3, 5],   unit: 'cm/yr', doc: 'Divergent speed given to each side.' },
    thinKm:           { value: 5,     range: [0, 15],    unit: 'km',    doc: 'Crustal thinning at the axis of a failed rift.' },
    thinBandKm:       { value: 120,   range: [40, 400],  unit: 'km',    doc: 'Half-width of the failed-rift thinning band.' },
  },
  run(world, p, ctx) {
    const n = world.cellCount, xyz = world.grid.xyz, locator = world.grid.locator;
    const plateId = ctx.write('crust.plateId'), type = ctx.read('crust.type'), thickness = ctx.write('crust.thickness');
    const minPiece = p.minPieceFraction * n;
    let splits = 0, failed = 0;
    const plates = world.plates.slice();
    for (const pl of plates) {
      if (pl.dead || !pl.stats || pl.stats.contArea < 2 * minPiece) continue;
      const lip = world.mantle.lips.find(l => ctx.timeMa - l.timeMa < p.lipMemoryMa && plateId[locator.nearest(l.x, l.y, l.z)] === pl.id);
      let prob = p.riftProbability;
      if (pl.stats.contArea > p.largeFraction * n) prob *= p.largeBoost;
      if (lip) prob *= p.lipBoost;
      if (ctx.randPlate(pl.id, 20) >= prob) continue;
      // Centre and strike.
      const cont = []; for (let i = 0; i < n; i++) if (plateId[i] === pl.id && type[i] === CRUST.CONTINENTAL) cont.push(i);
      // Centre: the LIP, else a random continental cell pulled halfway toward the plate's
      // continental centroid (rifts driven by plumes under a supercontinent are interior ones).
      let cx, cy, cz;
      if (lip) { cx = lip.x; cy = lip.y; cz = lip.z; }
      else {
        const i = cont[Math.floor(ctx.randPlate(pl.id, 21) * cont.length)];
        let gx = 0, gy = 0, gz = 0; for (const c of cont) { gx += xyz[3 * c]; gy += xyz[3 * c + 1]; gz += xyz[3 * c + 2]; }
        cx = xyz[3 * i] + gx / cont.length; cy = xyz[3 * i + 1] + gy / cont.length; cz = xyz[3 * i + 2] + gz / cont.length;
        const cl = Math.hypot(cx, cy, cz) || 1; cx /= cl; cy /= cl; cz /= cl;
      }
      // Strike: try a few azimuths so the line does not merely clip a corner.
      let mx = 0, my = 0, mz = 0, pos = 0, neg = 0;
      for (let attempt = 0; attempt < 4; attempt++) {
        const r1 = ctx.randPlate(pl.id, 22 + 3 * attempt) * 2 - 1, r2 = ctx.randPlate(pl.id, 23 + 3 * attempt) * 2 - 1, r3 = ctx.randPlate(pl.id, 24 + 3 * attempt) * 2 - 1;
        const d = r1 * cx + r2 * cy + r3 * cz;
        let tx = r1 - d * cx, ty = r2 - d * cy, tz = r3 - d * cz; const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
        mx = cy * tz - cz * ty; my = cz * tx - cx * tz; mz = cx * ty - cy * tx; const ml = Math.hypot(mx, my, mz) || 1; mx /= ml; my /= ml; mz /= ml;
        pos = 0; neg = 0;
        for (const i of cont) { if (xyz[3 * i] * mx + xyz[3 * i + 1] * my + xyz[3 * i + 2] * mz > 0) pos++; else neg++; }
        if (Math.min(pos, neg) >= minPiece) break;
      }
      if (ctx.randPlate(pl.id, 40) < p.failFraction || Math.min(pos, neg) < minPiece) {
        const band = p.thinBandKm / EARTH_RADIUS_KM;
        for (const i of cont) {
          const s = Math.abs(xyz[3 * i] * mx + xyz[3 * i + 1] * my + xyz[3 * i + 2] * mz);
          if (s < band) thickness[i] = Math.max(15, thickness[i] - p.thinKm * (1 - s / band));
        }
        world.mantle.failedRifts.push({ x: cx, y: cy, z: cz, mx, my, mz, timeMa: ctx.timeMa, plate: pl.id });
        failed++;
        continue;
      }
      // Split: the smaller side becomes a new plate (all its cells, oceanic included).
      const sign = pos < neg ? 1 : -1;
      const q = addPlate(world, { parent: pl.id });
      let qx = 0, qy = 0, qz = 0, px = 0, py = 0, pz = 0;
      for (let i = 0; i < n; i++) {
        if (plateId[i] !== pl.id) continue;
        if (sign * (xyz[3 * i] * mx + xyz[3 * i + 1] * my + xyz[3 * i + 2] * mz) > 0) { plateId[i] = q; qx += xyz[3 * i]; qy += xyz[3 * i + 1]; qz += xyz[3 * i + 2]; }
        else { px += xyz[3 * i]; py += xyz[3 * i + 1]; pz += xyz[3 * i + 2]; }
      }
      const assign = (id, sx, sy, sz, side) => {
        const l = Math.hypot(sx, sy, sz) || 1; sx /= l; sy /= l; sz /= l;
        const v = velocityAt(world.plates[id], sx, sy, sz);                 // km/Myr
        const dm = mx * sx + my * sy + mz * sz;
        let ax = side * (mx - dm * sx), ay = side * (my - dm * sy), az = side * (mz - dm * sz);
        const al = Math.hypot(ax, ay, az) || 1; ax /= al; ay /= al; az /= al;
        const k = p.riftSpeedCmPerYr * 10;                                   // cm/yr → km/Myr
        const nx = 0.5 * v[0] + k * ax, ny = 0.5 * v[1] + k * ay, nz = 0.5 * v[2] + k * az;
        const speed = Math.hypot(nx, ny, nz) * 0.1;
        Object.assign(world.plates[id], rotationForVelocity(sx, sy, sz, nx, ny, nz, speed));
      };
      assign(q, qx, qy, qz, sign);
      assign(pl.id, px, py, pz, -sign);
      splits++;
    }
    ctx.diag('events', new Float32Array([splits, failed]));
  },
});
