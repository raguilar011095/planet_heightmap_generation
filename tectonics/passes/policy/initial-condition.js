// The seed-generated starting world (DESIGN.md §5.1): one supercontinent covering
// `landFraction` of the sphere, cratons packed inside it, and an ocean whose age
// ramps away from a few seed ridges kept clear of the continent. Runs once.
// Plates and initial trenches are P2's job; this pass leaves plateId at -1.

import { definePass } from '../../sim/define-pass.js';
import { CRUST } from '../../state/crust-fields.js';
import { makeSphereNoise } from '../../core/sphere-noise.js';
import { EARTH_RADIUS_KM } from '../../core/rotation.js';

const DEG = Math.PI / 180;

function randomUnit(r1, r2, out = [0, 0, 0]) {
  const u = r1 * 2 - 1, th = r2 * 2 * Math.PI, s = Math.sqrt(1 - u * u);
  out[0] = s * Math.cos(th); out[1] = s * Math.sin(th); out[2] = u;
  return out;
}
function angle(ax, ay, az, bx, by, bz) {
  return Math.acos(Math.max(-1, Math.min(1, ax * bx + ay * by + az * bz)));
}

export default definePass({
  id: 'policy.initialCondition',
  phase: 'init',
  schedule: 'once',
  doc: `Seed-generated starting world: a single supercontinent of exactly landFraction of the
        cells (ranked by noise-warped distance from a random centre), cratonCount cratons
        stamped inside it at cratonThicknessKm, ordinary continental crust elsewhere on land,
        and oceanic crust whose age grows with distance from ridgeCount great-circle ridges
        placed beyond the continental edge. The blog's supercontinent-plus-cratons opening
        position, rolled from the seed instead of drawn.`,
  writes: ['crust.type', 'crust.thickness', 'crust.ageMa', 'crust.isCraton',
           'crust.terraneId', 'crust.orogenAge', 'crust.sediment'],
  params: {
    landFraction:          { value: 0.25, range: [0.10, 0.45], unit: '',    doc: 'Fraction of the sphere that is continental. Above ~0.4 continents cannot manoeuvre; above 0.5 tectonics locks up.' },
    coastNoiseAmp:         { value: 0.30, range: [0, 0.8],     unit: 'rad', doc: 'Amplitude of the angular warp applied to the supercontinent outline.' },
    cratonCount:           { value: 10,   range: [4, 16],      unit: '',    doc: 'Number of cratons to place inside the supercontinent (the blog uses 8-12).' },
    cratonRadiusDeg:       { value: 8,    range: [4, 20],      unit: '°',   doc: 'Nominal angular semi-minor radius of a craton before elongation and outline noise.' },
    cratonAspectMax:       { value: 1.9,  range: [1, 3],       unit: '',    doc: 'Cratons are elongated along a random axis by an aspect ratio in [1, this].' },
    cratonThicknessKm:     { value: 39,   range: [35, 50],     unit: 'km',  doc: 'Crustal thickness of craton cells (~770 m at the default reference).' },
    continentThicknessKm:  { value: 37.5, range: [28, 42],     unit: 'km',  doc: 'Crustal thickness of non-craton continental interior before noise (~500 m).' },
    continentNoiseKm:      { value: 1.5,  range: [0, 6],       unit: 'km',  doc: 'Thickness noise amplitude on non-craton continental crust.' },
    marginTaperRad:        { value: 0.05, range: [0, 0.12],    unit: 'rad', doc: 'Continental thickness tapers to marginThicknessKm over this distance from the coast (0.05 rad ≈ 320 km): a passive-margin shelf and slope. Cratons taper too.' },
    marginThicknessKm:     { value: 24,   range: [15, 35],     unit: 'km',  doc: 'Crustal thickness at the outer edge of the continental margin.' },
    oceanThicknessKm:      { value: 7,    range: [5, 10],      unit: 'km',  doc: 'Crustal thickness of oceanic cells.' },
    ridgeCount:            { value: 2,    range: [1, 6],       unit: '',    doc: 'Seed spreading ridges (great circles). The first encircles the far ocean; the rest cross it.' },
    ridgeMinOffsetDeg:     { value: 8,    range: [0, 30],      unit: '°',   doc: 'Extra ridges tilt at least this far from the encircling ridge, so they are distinct rather than braided.' },
    ridgeMaxOffsetDeg:     { value: 18,   range: [0, 45],      unit: '°',   doc: 'Extra ridges tilt at most this far; small values keep ridges far from the continent so margin ocean is old.' },
    halfSpreadCmPerYr:     { value: 3,    range: [1, 8],       unit: 'cm/yr', doc: 'Half spreading rate used to convert distance-from-ridge into crust age.' },
    maxOceanAgeMa:         { value: 180,  range: [60, 300],    unit: 'Myr', doc: 'Oldest ocean floor in the initial condition; older floor would have subducted.' },
  },
  run(world, p, ctx) {
    const n = world.cellCount, xyz = world.grid.xyz;
    const type = ctx.write('crust.type'), thickness = ctx.write('crust.thickness');
    const ageMa = ctx.write('crust.ageMa'), isCraton = ctx.write('crust.isCraton');
    const terraneId = ctx.write('crust.terraneId'), orogenAge = ctx.write('crust.orogenAge');
    const sediment = ctx.write('crust.sediment');
    const seed = (world.seed ^ ctx.passHash) >>> 0;
    const coastNoise = makeSphereNoise({ seed, tag: 1, baseFreq: 2.5, octaves: 5 });
    const thickNoise = makeSphereNoise({ seed, tag: 2, baseFreq: 6, octaves: 3 });

    // 1. Supercontinent: rank cells by warped angular distance from a random centre.
    const c = randomUnit(ctx.rand(0), ctx.rand(1));
    const score = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = xyz[3 * i], y = xyz[3 * i + 1], z = xyz[3 * i + 2];
      score[i] = angle(c[0], c[1], c[2], x, y, z) + p.coastNoiseAmp * coastNoise(x, y, z);
    }
    const order = new Int32Array(n);
    for (let i = 0; i < n; i++) order[i] = i;
    order.sort((a, b) => score[a] - score[b]);
    const landCells = Math.round(p.landFraction * n);
    for (let k = 0; k < n; k++) type[order[k]] = k < landCells ? CRUST.CONTINENTAL : CRUST.OCEANIC;

    // 2. Cratons: rejection-sample centres from the continental interior, well separated.
    const count = Math.round(p.cratonCount);
    const radius = p.cratonRadiusDeg * DEG, minSep = 2.2 * radius;
    const centres = [];
    const cratonNoise = makeSphereNoise({ seed, tag: 3, baseFreq: 3, octaves: 3 });
    for (let t = 0, id = 2; centres.length < count && t < count * 60; t++, id += 3) {
      const i = order[Math.floor(ctx.rand(id) * landCells * 0.7)];
      const x = xyz[3 * i], y = xyz[3 * i + 1], z = xyz[3 * i + 2];
      if (!centres.every(q => angle(q[0], q[1], q[2], x, y, z) > minSep)) continue;
      // Elongation axis: a random tangent direction at the centre.
      const v = randomUnit(ctx.rand(id + 1), ctx.rand(id + 2));
      const d = v[0] * x + v[1] * y + v[2] * z;
      let ux = v[0] - d * x, uy = v[1] - d * y, uz = v[2] - d * z;
      const ul = Math.hypot(ux, uy, uz) || 1;
      centres.push([x, y, z, ux / ul, uy / ul, uz / ul, 1 + ctx.rand(id + 1, 1) * (p.cratonAspectMax - 1)]);
    }

    // 3. Stamp continental crust: interior thickness tapering to a thinned passive
    //    margin at the coast, then cratons (elongated, noise-warped) on top. The
    //    taper uses real distance to the nearest oceanic cell, not rank/score
    //    distance, which is not spatially uniform where the outline noise is steep.
    const loc = world.grid.locator;
    for (let k = 0; k < landCells; k++) {
      const i = order[k];
      const x = xyz[3 * i], y = xyz[3 * i + 1], z = xyz[3 * i + 2];
      let dOcean = p.marginTaperRad;
      if (p.marginTaperRad > 0) {
        loc.forEachWithin(x, y, z, p.marginTaperRad, (c, d) => { if (type[c] === CRUST.OCEANIC && d < dOcean) dOcean = d; });
      }
      const inland = p.marginTaperRad > 0 ? Math.min(1, dOcean / p.marginTaperRad) : 1;
      const interior = p.continentThicknessKm + p.continentNoiseKm * thickNoise(x, y, z);
      thickness[i] = p.marginThicknessKm + (interior - p.marginThicknessKm) * inland;
      isCraton[i] = 0; terraneId[i] = -1; ageMa[i] = 1000; orogenAge[i] = 3000; sediment[i] = 0;
      for (let q = 0; q < centres.length; q++) {
        const [cx, cy, cz, ux, uy, uz, aspect] = centres[q];
        // Distance in the tangent plane at the craton centre, stretched along its axis.
        const dc = x * cx + y * cy + z * cz;
        const vx = x - dc * cx, vy = y - dc * cy, vz = z - dc * cz;
        const along = vx * ux + vy * uy + vz * uz;
        const across = Math.sqrt(Math.max(0, vx * vx + vy * vy + vz * vz - along * along));
        const dEff = Math.hypot(along / aspect, across);
        const r = radius * (1 + 0.35 * cratonNoise(x + q, y - q, z));
        if (dEff < Math.sin(Math.min(Math.PI / 2, r))) {
          isCraton[i] = 1; terraneId[i] = q; ageMa[i] = 2500;
          thickness[i] = p.marginThicknessKm + (p.cratonThicknessKm - p.marginThicknessKm) * inland;
          break;
        }
      }
    }

    // 4. Ocean: great-circle ridges beyond the continental edge; age from distance.
    const ridges = [];
    for (let r = 0, id = 1000; r < Math.round(p.ridgeCount); r++, id += 3) {
      const v = randomUnit(ctx.rand(id), ctx.rand(id + 1));
      const dotc = v[0] * c[0] + v[1] * c[1] + v[2] * c[2];
      let tx = v[0] - dotc * c[0], ty = v[1] - dotc * c[1], tz = v[2] - dotc * c[2];
      const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      const phi = r === 0 ? 0 : (p.ridgeMinOffsetDeg + ctx.rand(id + 2) * Math.max(0, p.ridgeMaxOffsetDeg - p.ridgeMinOffsetDeg)) * DEG;
      ridges.push([c[0] * Math.cos(phi) + tx * Math.sin(phi), c[1] * Math.cos(phi) + ty * Math.sin(phi), c[2] * Math.cos(phi) + tz * Math.sin(phi)]);
    }
    const kmPerMyr = p.halfSpreadCmPerYr * 10;          // 1 cm/yr = 10 km/Myr
    for (let k = landCells; k < n; k++) {
      const i = order[k];
      const x = xyz[3 * i], y = xyz[3 * i + 1], z = xyz[3 * i + 2];
      let dist = Infinity;
      for (const rn of ridges) dist = Math.min(dist, Math.asin(Math.abs(rn[0] * x + rn[1] * y + rn[2] * z)));
      thickness[i] = p.oceanThicknessKm;
      ageMa[i] = Math.min(p.maxOceanAgeMa, dist * EARTH_RADIUS_KM / kmPerMyr);
      isCraton[i] = 0; terraneId[i] = -1; orogenAge[i] = 3000; sediment[i] = 0;
    }
    ctx.diag('supercontinentScore', score);
  },
});
