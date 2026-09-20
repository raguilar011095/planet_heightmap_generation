// Ocean-floor depth from crust age. Half-space cooling (depth ∝ √age) below the
// flattening age, blending continuously into the plate-model asymptote beyond
// it, since √t over-predicts depth past ~80 Myr. This is what produces
// mid-ocean ridges, abyssal plains and ridge-flank asymmetry; nothing places them.

import { definePass } from '../../sim/define-pass.js';
import { CRUST } from '../../state/crust-fields.js';

export function oceanDepthM(ageMa, p) {
  if (ageMa < p.flatteningAgeMa) return p.ridgeDepthM + p.subsidenceCoef * Math.sqrt(Math.max(0, ageMa));
  const dFlat = p.ridgeDepthM + p.subsidenceCoef * Math.sqrt(p.flatteningAgeMa);
  return dFlat + (p.plateDepthM - dFlat) * (1 - Math.exp(-(ageMa - p.flatteningAgeMa) / p.plateDecayMa));
}

export default definePass({
  id: 'surface.thermalSubsidence',
  phase: 'surface',
  doc: `Lowers oceanic cells by their thermal depth: ridgeDepthM + subsidenceCoef·√age up to
        flatteningAgeMa, then an exponential approach to plateDepthM. Runs after
        surface.isostasy, which leaves oceanic cells at their crust-thickness anomaly only.
        Magmatism resets the thermal state: an oceanic cell's thermal age is the smaller of
        its crust age and its magmaAge (an active arc or hotspot swell sits on hot mantle),
        and a continental cell gains arcSupportM while magmatic, decaying over
        arcSupportDecayMa. That is what lifts a 20-30 km island arc from abyssal depth to
        about sea level, where its edifices (surface.volcanoes) break the surface.`,
  reads: ['crust.type', 'crust.ageMa', 'crust.magmaAge', 'surface.elevation'],
  writes: ['surface.elevation'],
  params: {
    ridgeDepthM:      { value: 2500, range: [2000, 3200], unit: 'm',      doc: 'Axial depth of a spreading ridge at age 0.' },
    subsidenceCoef:   { value: 350,  range: [280, 420],   unit: 'm/√Myr', doc: 'Half-space cooling coefficient (Parsons & Sclater ≈ 350).' },
    flatteningAgeMa:  { value: 75,   range: [40, 100],    unit: 'Myr',    doc: 'Age past which √t over-predicts depth; switch to the plate model.' },
    plateDepthM:      { value: 6400, range: [5500, 7000], unit: 'm',      doc: 'Asymptotic depth of old ocean floor in the plate model.' },
    plateDecayMa:     { value: 62.8, range: [30, 120],    unit: 'Myr',    doc: 'e-folding time of the approach to plateDepthM.' },
    magmaReset:       { value: 1,    range: [0, 1],       unit: '',       doc: 'How completely magmatism resets an oceanic cell\'s thermal age (1 = to its magmaAge, 0 = not at all).' },
    arcSupportM:      { value: 800,  range: [0, 3000],    unit: 'm',      doc: 'Thermal support under an active continental arc (Andes, Japan): hot mantle wedge and thin lithosphere. Enough to bring a 28 km arc terrane to within volcano height of the surface.' },
    arcSupportDecayMa:{ value: 40,   range: [10, 200],    unit: 'Myr',    doc: 'e-folding time for that support to cool away after magmatism stops.' },
  },
  run(world, p, ctx) {
    const type = ctx.read('crust.type'), ageMa = ctx.read('crust.ageMa'), magmaAge = ctx.read('crust.magmaAge');
    const elevation = ctx.write('surface.elevation');
    for (let i = 0; i < world.cellCount; i++) {
      if (type[i] === CRUST.OCEANIC) {
        const thermalAge = ageMa[i] - p.magmaReset * Math.max(0, ageMa[i] - magmaAge[i]);
        elevation[i] -= oceanDepthM(thermalAge, p);
      } else if (type[i] === CRUST.CONTINENTAL && magmaAge[i] < 5000) {
        elevation[i] += p.arcSupportM * Math.exp(-magmaAge[i] / p.arcSupportDecayMa);
      }
    }
  },
});
