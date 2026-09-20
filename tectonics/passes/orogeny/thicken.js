// Turns what happened at convergent boundaries into crustal thickening belts
// (DESIGN.md §4.1). Two mass sources:
//   - boundary.excessKm: continental crust displaced at a collision; conserved,
//     spread into a belt centred on the boundary over both plates.
//   - boundary.consumedKm × arcMagmaFraction: new crust from arc magmatism above
//     a subducting slab, added in a belt offset inland on the overriding plate.
// Craton cells never receive mass, so belts wrap around them. Oceanic cells that
// accumulate enough arc crust become continental arc terranes.

import { definePass } from '../../sim/define-pass.js';
import { CRUST } from '../../state/crust-fields.js';
import { BOUNDARY } from '../../state/boundary-fields.js';
import { EARTH_RADIUS_KM } from '../../core/rotation.js';
import { radiusNeighbors } from '../../state/neighbors.js';

export default definePass({
  id: 'orogeny.thicken',
  phase: 'orogeny',
  doc: `Redistributes displaced continental crust and arc magma from convergent boundary cells
        into Gaussian belts: collision excess symmetrically about the suture, arc crust offset
        inland on the overriding plate. Cratons receive nothing; oceanic cells thickened past
        arcContinentalKm become continental arc terranes. Resets orogenAge where crust is added.`,
  reads: ['boundary.kind', 'boundary.consumedKm', 'boundary.excessKm', 'boundary.overridingPlate',
          'crust.type', 'crust.isCraton', 'crust.plateId', 'crust.thickness'],
  writes: ['crust.thickness', 'crust.orogenAge', 'crust.type', 'crust.terraneId'],
  params: {
    ccBeltWidthKm:      { value: 300, range: [80, 900],  unit: 'km', doc: 'Full width (2σ) of the collisional thickening belt.' },
    ocBeltWidthKm:      { value: 200, range: [60, 700],  unit: 'km', doc: 'Full width (2σ) of the arc thickening belt.' },
    arcOffsetKm:        { value: 150, range: [50, 400],  unit: 'km', doc: 'Distance from the trench to the arc axis on the overriding plate.' },
    arcMagmaFraction:   { value: 0.04, range: [0, 0.5],  unit: '',   doc: 'Fraction of subducted crustal thickness returned as arc crust. Earth adds ~5 km of arc crust per continental cell per Gyr; with the floor recycling ~12× per Gyr that is ~0.04, and 0.15 turned every continent into a plateau.' },
    arcContinentalKm:   { value: 20,  range: [12, 30],   unit: 'km', doc: 'Oceanic crust thickened past this becomes a continental arc terrane.' },
    orogenResetKm:      { value: 0.2, range: [0.01, 2],  unit: 'km', doc: 'Crust added in one substep that counts as active orogeny (resets orogenAge).' },
    minBeltCells:       { value: 1.5, range: [0.5, 4],   unit: 'cells', doc: 'Belt σ is never narrower than this many cell spacings; a belt the grid cannot resolve would be a single-cell wall.' },
    maxAddKm:           { value: 12,  range: [3, 40],     unit: 'km', doc: 'Most crust any one cell may gain from one boundary cell in one substep; the belt widens until this holds.' },
    maxCellAddKm:       { value: 20,  range: [5, 60],     unit: 'km', doc: 'Most crust any one cell may gain in one substep from all boundary cells combined; the surplus spills to neighbours.' },
  },
  run(world, p, ctx) {
    const n = world.cellCount, { xyz, locator } = world.grid;
    const kind = ctx.read('boundary.kind'), consumed = ctx.read('boundary.consumedKm');
    const excess = ctx.read('boundary.excessKm'), overriding = ctx.read('boundary.overridingPlate');
    const type = ctx.write('crust.type'), isCraton = ctx.read('crust.isCraton'), plateId = ctx.read('crust.plateId');
    const thickness = ctx.write('crust.thickness'), orogenAge = ctx.write('crust.orogenAge'), terraneId = ctx.write('crust.terraneId');

    const add = new Float32Array(n);
    const ids = [], ws = [];
    const R = EARTH_RADIUS_KM;

    // Spread massKm into a Gaussian belt about centreKm from cell j over cells passing
    // filter. If nothing qualifies, widen the search (a craton-locked suture still has
    // mobile crust somewhere nearby); only as a last resort does the cell itself take it.
    // A belt cannot be narrower than the grid resolves: σ is floored at minBeltCells spacings.
    const sigmaFloorKm = p.minBeltCells * world.grid.spacingKm;
    // The belt widens until no single cell would take more than maxAddKm this substep:
    // crust that cannot be stacked spreads, which is why fast collisions make wide belts.
    function spread(j, massKm, centreKm, sigmaKm, filter) {
      sigmaKm = Math.max(sigmaKm, sigmaFloorKm);
      for (let widen = 1; widen <= 16; widen *= 2) {
        ids.length = 0; ws.length = 0;
        let total = 0, wmax = 0;
        const s = sigmaKm * widen, reach = (centreKm + 2.5 * s) / R;
        locator.forEachWithin(xyz[3 * j], xyz[3 * j + 1], xyz[3 * j + 2], reach, (c, d) => {
          if (!filter(c)) return;
          const x = (d * R - centreKm) / s, w = Math.exp(-0.5 * x * x);
          ids.push(c); ws.push(w); total += w; if (w > wmax) wmax = w;
        });
        if (total <= 0) continue;
        if (massKm * wmax / total > p.maxAddKm && widen < 16) continue;
        for (let k = 0; k < ids.length; k++) add[ids[k]] += massKm * ws[k] / total;
        return;
      }
      // Nothing eligible even far out: relax to any non-craton continental crust, then any
      // non-craton cell, and only then the boundary cell itself (never a craton).
      for (const relaxed of [c => type[c] === CRUST.CONTINENTAL && !isCraton[c], c => !isCraton[c]]) {
        if (relaxed === filter) continue;
        ids.length = 0; ws.length = 0;
        let total = 0;
        const s = sigmaKm * 16, reach = (centreKm + 2.5 * s) / R;
        locator.forEachWithin(xyz[3 * j], xyz[3 * j + 1], xyz[3 * j + 2], reach, (c, d) => {
          if (!relaxed(c)) return;
          const x = (d * R - centreKm) / s, w = Math.exp(-0.5 * x * x);
          ids.push(c); ws.push(w); total += w;
        });
        if (total > 0) { for (let k = 0; k < ids.length; k++) add[ids[k]] += massKm * ws[k] / total; fallback += massKm; return; }
      }
      add[j] += massKm; fallback += massKm;
    }
    let fallback = 0, arcAdded = 0;

    for (let j = 0; j < n; j++) {
      const k = kind[j];
      if (k === BOUNDARY.NONE || k === BOUNDARY.DIVERGENT) continue;
      const over = overriding[j];
      if (excess[j] > 0) {
        spread(j, excess[j], 0, p.ccBeltWidthKm / 2,
          c => type[c] === CRUST.CONTINENTAL && !isCraton[c]);
      }
      if (consumed[j] > 0 && p.arcMagmaFraction > 0) {
        arcAdded += consumed[j] * p.arcMagmaFraction;
        spread(j, consumed[j] * p.arcMagmaFraction, p.arcOffsetKm, p.ocBeltWidthKm / 2,
          c => plateId[c] === over && !isCraton[c]);
      }
    }

    // No cell takes more than maxCellAddKm in one substep from all boundary cells
    // together; the surplus moves to non-craton continental neighbours.
    const nbo = radiusNeighbors(world, 2.5 * world.grid.spacingRad);
    const targets = [];
    for (let i = 0; i < n; i++) {
      if (add[i] <= p.maxCellAddKm) continue;
      targets.length = 0;
      for (let k = nbo.offset[i], ke = nbo.offset[i + 1]; k < ke; k++) {
        const c = nbo.idx[k];
        if (c !== i && type[c] === CRUST.CONTINENTAL && !isCraton[c] && add[c] < p.maxCellAddKm) targets.push(c);
      }
      if (!targets.length) continue;
      const surplus = add[i] - p.maxCellAddKm;
      add[i] = p.maxCellAddKm;
      for (const c of targets) add[c] += surplus / targets.length;
    }

    for (let i = 0; i < n; i++) {
      const a = add[i];
      if (a <= 0) continue;
      thickness[i] += a;
      if (a >= p.orogenResetKm) orogenAge[i] = 0;
      if (type[i] === CRUST.OCEANIC && thickness[i] >= p.arcContinentalKm) {
        type[i] = CRUST.CONTINENTAL;
        terraneId[i] = world.counters.terrane++;
      }
    }
    ctx.diag('addedKm', add);
    ctx.diag('fallbackKm', new Float32Array([fallback]));
    ctx.diag('arcAddedKm', new Float32Array([arcAdded]));
  },
});
