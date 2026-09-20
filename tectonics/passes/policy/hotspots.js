// Mantle plumes (DESIGN.md §5.6). Hotspots are fixed in the mantle frame; the
// crust drifting over one receives volcanic thickness every substep, leaving a
// track that records absolute plate motion. Oceanic crust thickened past
// islandKm becomes a continental-type island terrane (Iceland-style). On policy
// steps a hotspot may surface as a LIP: a broad thick basalt pile that also
// promotes rifting (policy.rift reads world.mantle.lips).

import { definePass } from '../../sim/define-pass.js';
import { CRUST } from '../../state/crust-fields.js';
import { EARTH_RADIUS_KM } from '../../core/rotation.js';

export default definePass({
  id: 'policy.hotspots',
  phase: 'policy',
  doc: `Adds addKm of crust per substep to cells within radiusKm of each fixed-frame hotspot
        (falling off with distance); oceanic cells past islandKm become continental island
        terranes. On policy steps each hotspot surfaces as a LIP with lipProbability, adding
        lipKm within lipRadiusKm and recording the event for policy.rift.`,
  reads: ['crust.type'],
  writes: ['crust.thickness', 'crust.type', 'crust.terraneId', 'crust.orogenAge', 'crust.magmaAge', 'crust.volcano'],
  params: {
    addKm:          { value: 6,    range: [0, 15],    unit: 'km',  doc: 'Crust added at the hotspot centre per substep.' },
    radiusKm:       { value: 120,  range: [50, 400],  unit: 'km',  doc: 'Hotspot volcanism radius.' },
    islandKm:       { value: 28,   range: [12, 40],   unit: 'km',  doc: 'Oceanic crust thicker than this becomes an island terrane; below it the track is a chain of submerged seamounts (only the biggest edifices emerge, as on Earth).' },
    lipProbability: { value: 0.03, range: [0, 0.5],   unit: '',    doc: 'Chance per hotspot per policy step of a large igneous province.' },
    lipRadiusKm:    { value: 700,  range: [200, 1500],unit: 'km',  doc: 'LIP radius.' },
    lipKm:          { value: 8,    range: [2, 20],    unit: 'km',  doc: 'Crust added at a LIP centre.' },
    edificeFraction:{ value: 0.6,  range: [0, 1],     unit: '',    doc: 'Chance that a cell turning magmatic grows a volcanic edifice (crust.volcano); the rest of the track is a low swell.' },
    edificeResetMa: { value: 30,   range: [5, 200],   unit: 'Myr', doc: 'A cell whose last magmatism is older than this is "new" again and rolls a fresh edifice.' },
  },
  run(world, p, ctx) {
    const { xyz, locator } = world.grid;
    const type = ctx.write('crust.type'), thickness = ctx.write('crust.thickness');
    const terraneId = ctx.write('crust.terraneId'), orogenAge = ctx.write('crust.orogenAge');
    const magmaAge = ctx.write('crust.magmaAge'), volcano = ctx.write('crust.volcano');
    let added = 0;
    const deposit = (hx, hy, hz, radiusKm, km) => {
      locator.forEachWithin(hx, hy, hz, radiusKm / EARTH_RADIUS_KM, (c, d) => {
        if (type[c] === CRUST.NONE) return;
        const a = km * (1 - d * EARTH_RADIUS_KM / radiusKm);
        thickness[c] += a; added += a;
        // A cell turning magmatic grows an edifice whose size is fixed once and rides with the crust.
        if (magmaAge[c] > p.edificeResetMa) volcano[c] = ctx.rand(c, 7) < p.edificeFraction ? 0.3 + 0.7 * ctx.rand(c, 8) : 0;
        magmaAge[c] = 0;
        if (type[c] === CRUST.OCEANIC && thickness[c] >= p.islandKm) { type[c] = CRUST.CONTINENTAL; terraneId[c] = world.counters.terrane++; orogenAge[c] = 0; }
      });
    };
    world.mantle.hotspots.forEach((h, k) => {
      deposit(h[0], h[1], h[2], p.radiusKm, p.addKm);
      if (ctx.isPolicyStep && ctx.rand(k, 30) < p.lipProbability) {
        deposit(h[0], h[1], h[2], p.lipRadiusKm, p.lipKm);
        world.mantle.lips.push({ x: h[0], y: h[1], z: h[2], timeMa: ctx.timeMa });
      }
    });
    ctx.diag('addedKm', new Float32Array([added]));
  },
});
