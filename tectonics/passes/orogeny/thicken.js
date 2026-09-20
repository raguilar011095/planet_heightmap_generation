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
  writes: ['crust.thickness', 'crust.orogenAge', 'crust.type', 'crust.terraneId', 'crust.magmaAge', 'crust.volcano'],
  params: {
    ccBeltWidthKm:      { value: 300, range: [80, 900],  unit: 'km', doc: 'Full width (2σ) of the collisional thickening belt.' },
    ocBeltWidthKm:      { value: 200, range: [60, 700],  unit: 'km', doc: 'Full width (2σ) of the arc thickening belt.' },
    arcOffsetKm:        { value: 150, range: [50, 400],  unit: 'km', doc: 'Distance from the trench to the arc axis on the overriding plate.' },
    arcMagmaFraction:   { value: 0.02, range: [0, 0.5],  unit: '',   doc: 'Fraction of subducted crustal thickness returned as arc crust at a continental margin. Earth adds ~5 km of arc crust per continental cell per Gyr net of subduction erosion; 0.04 lifted the mean continental thickness past 45 km once the floor recycled properly, and 0.15 turned every continent into a plateau.' },
    arcMagmaFractionOO: { value: 0.08, range: [0, 0.5],  unit: '',   doc: 'Arc fraction at ocean-ocean subduction. Higher than the continental value because intra-oceanic arcs must build from ~7 km to arcContinentalKm before they read as islands (the Izu-Bonin-Mariana chain reached ~20 km in ~50 Myr). Together with the OC value this sets gross arc production; Earth\'s is ~3e9 km³ per Gyr, most of it later recycled.' },
    ooBeltWidthKm:      { value: 120, range: [60, 400],  unit: 'km', doc: 'Full width (2σ) of an intra-oceanic arc: narrower than a continental arc so the chain reads as a string of islands.' },
    arcContinentalKm:   { value: 28,  range: [12, 40],   unit: 'km', doc: 'Oceanic crust thickened past this becomes a continental arc terrane; thinner arcs stay as oceanic ridges.' },
    orogenResetKm:      { value: 0.2, range: [0.01, 2],  unit: 'km', doc: 'Crust added in one substep that counts as active orogeny (resets orogenAge).' },
    minBeltCells:       { value: 1.5, range: [0.5, 4],   unit: 'cells', doc: 'Belt σ is never narrower than this many cell spacings; a belt the grid cannot resolve would be a single-cell wall.' },
    maxAddKm:           { value: 12,  range: [3, 40],     unit: 'km', doc: 'Most crust any one cell may gain from one boundary cell in one substep; the belt widens until this holds.' },
    maxCellAddKm:       { value: 20,  range: [5, 60],     unit: 'km', doc: 'Most crust any one cell may gain in one substep from all boundary cells combined; the surplus spills to neighbours.' },
    magmaResetKm:       { value: 0.05, range: [0.005, 1], unit: 'km', doc: 'Arc crust added in one substep that counts the cell as an active volcanic arc (resets magmaAge).' },
    edificeFraction:    { value: 0.6, range: [0, 1],      unit: '',   doc: 'Chance that a cell turning magmatic grows a volcanic edifice (crust.volcano); the rest of the arc is a ridge without a big cone.' },
    edificeResetMa:     { value: 30,  range: [5, 200],    unit: 'Myr', doc: 'A cell whose last magmatism is older than this is "new" again and rolls a fresh edifice.' },
  },
  run(world, p, ctx) {
    const n = world.cellCount, { xyz, locator } = world.grid;
    const kind = ctx.read('boundary.kind'), consumed = ctx.read('boundary.consumedKm');
    const excess = ctx.read('boundary.excessKm'), overriding = ctx.read('boundary.overridingPlate');
    const type = ctx.write('crust.type'), isCraton = ctx.read('crust.isCraton'), plateId = ctx.read('crust.plateId');
    const thickness = ctx.write('crust.thickness'), orogenAge = ctx.write('crust.orogenAge'), terraneId = ctx.write('crust.terraneId');
    const magmaAge = ctx.write('crust.magmaAge'), volcano = ctx.write('crust.volcano');

    const add = new Float32Array(n), arcAdd = new Float32Array(n);   // arcAdd: the magmatic part of add
    const ids = [], ws = [];
    const R = EARTH_RADIUS_KM;

    // Spread massKm into a Gaussian belt about centreKm from cell j over cells passing
    // filter. If nothing qualifies, widen the search (a craton-locked suture still has
    // mobile crust somewhere nearby); only as a last resort does the cell itself take it.
    // A belt cannot be narrower than the grid resolves: σ is floored at minCells spacings
    // (minBeltCells for continental belts; 1 cell for intra-oceanic arcs, which should be
    // narrow island chains rather than smeared ridges).
    // The belt widens until no single cell would take more than maxAddKm this substep:
    // crust that cannot be stacked spreads, which is why fast collisions make wide belts.
    function spread(j, massKm, centreKm, sigmaKm, filter, minCells, magmatic = false) {
      sigmaKm = Math.max(sigmaKm, minCells * world.grid.spacingKm);
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
        for (let k = 0; k < ids.length; k++) { add[ids[k]] += massKm * ws[k] / total; if (magmatic) arcAdd[ids[k]] += massKm * ws[k] / total; }
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
    let fallback = 0, arcAdded = 0, dropped = 0;

    for (let j = 0; j < n; j++) {
      const k = kind[j];
      if (k === BOUNDARY.NONE || k === BOUNDARY.DIVERGENT) continue;
      const over = overriding[j];
      if (excess[j] > 0) {
        spread(j, excess[j], 0, p.ccBeltWidthKm / 2,
          c => type[c] === CRUST.CONTINENTAL && !isCraton[c], p.minBeltCells);
      }
      if (consumed[j] > 0) {
        // Intra-oceanic arcs build new crust fast and narrow (Earth: ~25-30 km of arc crust in
        // ~100 Myr); continental arcs add little to an already thick margin.
        const oo = k === BOUNDARY.OO, frac = oo ? p.arcMagmaFractionOO : p.arcMagmaFraction;
        if (frac > 0) {
          arcAdded += consumed[j] * frac;
          spread(j, consumed[j] * frac, p.arcOffsetKm, (oo ? p.ooBeltWidthKm : p.ocBeltWidthKm) / 2,
            c => plateId[c] === over && !isCraton[c], oo ? 1 : p.minBeltCells, true);
        }
      }
    }

    // No cell takes more than maxCellAddKm in one substep from all boundary cells
    // together; the surplus moves to non-craton neighbours on the same plate (continental
    // ones first, since a collisional belt should not leak onto the ocean floor; an
    // intra-oceanic arc has only oceanic neighbours). With nowhere to go, the magmatic part
    // is dropped (the trench is over-supplied; the melt stays in the mantle) and collisional
    // crust, which is conserved, stays on the cell.
    const nbo = radiusNeighbors(world, 2.5 * world.grid.spacingRad);
    const targets = [];
    for (let i = 0; i < n; i++) {
      if (add[i] <= p.maxCellAddKm) continue;
      for (const anyType of [false, true]) {
        targets.length = 0;
        for (let k = nbo.offset[i], ke = nbo.offset[i + 1]; k < ke; k++) {
          const c = nbo.idx[k];
          if (c !== i && !isCraton[c] && plateId[c] === plateId[i] && (anyType || type[c] === CRUST.CONTINENTAL) && add[c] < p.maxCellAddKm) targets.push(c);
        }
        if (targets.length) break;
      }
      const surplus = add[i] - p.maxCellAddKm, magmaPart = Math.min(surplus, arcAdd[i]);
      if (!targets.length) { add[i] -= magmaPart; arcAdd[i] -= magmaPart; dropped += magmaPart; arcAdded -= magmaPart; continue; }
      add[i] = p.maxCellAddKm; arcAdd[i] -= magmaPart;
      for (const c of targets) { add[c] += surplus / targets.length; arcAdd[c] += magmaPart / targets.length; }
    }

    for (let i = 0; i < n; i++) {
      const a = add[i];
      if (a <= 0) continue;
      thickness[i] += a;
      if (a >= p.orogenResetKm) orogenAge[i] = 0;
      if (arcAdd[i] >= p.magmaResetKm) {
        // A cell turning magmatic grows an edifice whose size is fixed once and rides with the crust.
        if (magmaAge[i] > p.edificeResetMa) volcano[i] = ctx.rand(i, 7) < p.edificeFraction ? 0.3 + 0.7 * ctx.rand(i, 8) : 0;
        magmaAge[i] = 0;
      }
      if (type[i] === CRUST.OCEANIC && thickness[i] >= p.arcContinentalKm) {
        type[i] = CRUST.CONTINENTAL;
        terraneId[i] = world.counters.terrane++;
      }
    }
    ctx.diag('addedKm', add);
    ctx.diag('fallbackKm', new Float32Array([fallback]));
    ctx.diag('arcAddedKm', new Float32Array([arcAdded]));
    ctx.diag('droppedKm', new Float32Array([dropped]));
  },
});
