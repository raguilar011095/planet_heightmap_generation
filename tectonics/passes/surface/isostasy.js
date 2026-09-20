// Crust load → surface elevation. Airy isostasy with an elastic-plate (flexural)
// response so narrow loads stand higher than local compensation predicts and
// depress their surroundings into basins (DESIGN.md §4).
//
// Formulation: each cell's crust-plus-sediment above a reference column is a
// load. The mantle deflection under that load is the load's mantle-equivalent
// height spread by a Gaussian of width α, the flexural parameter for the given
// elastic thickness; elevation = column height − deflection. With Te = 0 the
// kernel collapses to a delta and this is exactly Airy. A Gaussian is used in
// place of the true Kelvin-function kernel: it keeps the adjacent basin, which is
// the feature that matters, and drops only the second-order forebulge.
//
// Coupling is restricted to cells of the same crust type. Continental and oceanic
// columns are separate reference states, each in local balance; averaging a
// continental thickness deficit with an oceanic "zero anomaly" across a coast is
// a frame mismatch that manifests as a spurious shelf-edge trench.
//
// Resolution: the response is under-resolved when α is smaller than about one
// cell spacing (Te = 25 km → α ≈ 59 km, which needs ~150k cells). The default
// Te = 35 km (α ≈ 76 km) is resolved at the default 80k-cell grid.

import { definePass } from '../../sim/define-pass.js';
import { radiusNeighbors } from '../../state/neighbors.js';
import { CRUST } from '../../state/crust-fields.js';
import { EARTH_RADIUS_KM } from '../../core/rotation.js';

const G = 9.81, YOUNG = 7e10, POISSON = 0.25;

// Flexural parameter α (km) for an elastic plate of thickness Te over mantle.
export function flexuralParameterKm(teKm, rhoMantle, rhoInfill = 0) {
  if (teKm <= 0) return 0;
  const D = YOUNG * (teKm * 1e3) ** 3 / (12 * (1 - POISSON * POISSON));
  return Math.pow(4 * D / ((rhoMantle - rhoInfill) * G), 0.25) / 1e3;
}

export default definePass({
  id: 'surface.isostasy',
  phase: 'surface',
  doc: `Derives surface elevation from crust thickness, type, and sediment by Airy isostasy with
        a Gaussian flexural response of width α(Te). Continental cells are measured against a
        refContinentalKm column sitting at refElevationM; oceanic cells against refOceanicKm at
        0 m, with their thermal depth added by surface.thermalSubsidence afterwards.`,
  reads: ['crust.thickness', 'crust.type', 'crust.sediment'],
  writes: ['surface.elevation'],
  params: {
    rhoMantle:          { value: 3300, range: [3200, 3400], unit: 'kg/m³', doc: 'Upper mantle density.' },
    rhoContinental:     { value: 2750, range: [2600, 2900], unit: 'kg/m³', doc: 'Mean continental crust density.' },
    rhoOceanic:         { value: 2900, range: [2800, 3000], unit: 'kg/m³', doc: 'Oceanic crust density.' },
    rhoSediment:        { value: 2400, range: [2000, 2700], unit: 'kg/m³', doc: 'Sediment density.' },
    refContinentalKm:   { value: 35,   range: [30, 40],     unit: 'km',    doc: 'Continental thickness that sits at refElevationM.' },
    refOceanicKm:       { value: 7,    range: [5, 10],      unit: 'km',    doc: 'Oceanic thickness carrying no isostatic anomaly.' },
    refElevationM:      { value: 100,  range: [-500, 1000], unit: 'm',     doc: 'Elevation of a refContinentalKm continental column.' },
    elasticThicknessKm: { value: 35,   range: [0, 80],      unit: 'km',    doc: 'Effective elastic thickness Te. 0 = pure Airy (local compensation). α(35 km) ≈ 76 km, about one cell at 80k cells.' },
    kernelCutoffSigma:  { value: 3,    range: [1, 5],       unit: 'σ',     doc: 'Truncate the flexural kernel at this many α.' },
  },
  run(world, p, ctx) {
    const n = world.cellCount;
    const thickness = ctx.read('crust.thickness'), type = ctx.read('crust.type'), sediment = ctx.read('crust.sediment');
    const elevation = ctx.write('surface.elevation');

    // Column height above reference (m) and its mantle-equivalent load (m).
    const height = new Float32Array(n), load = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      if (type[i] === CRUST.NONE) continue;
      const cont = type[i] === CRUST.CONTINENTAL;
      const h = (thickness[i] - (cont ? p.refContinentalKm : p.refOceanicKm)) * 1000;
      const s = sediment[i] * 1000;
      height[i] = h + s;
      load[i] = ((cont ? p.rhoContinental : p.rhoOceanic) * h + p.rhoSediment * s) / p.rhoMantle;
    }

    // Deflection: Airy (delta) or Gaussian-spread with σ = α.
    const alphaKm = flexuralParameterKm(p.elasticThicknessKm, p.rhoMantle);
    const w = new Float32Array(n);
    if (alphaKm <= 0) {
      w.set(load);
    } else {
      const sigma = alphaKm / EARTH_RADIUS_KM;
      const nb = radiusNeighbors(world, p.kernelCutoffSigma * sigma);
      const inv2s2 = 1 / (2 * sigma * sigma);
      for (let i = 0; i < n; i++) {
        const ti = type[i];
        let num = 0, den = 0;
        for (let k = nb.offset[i], ke = nb.offset[i + 1]; k < ke; k++) {
          const j = nb.idx[k];
          if (type[j] !== ti) continue;                       // same-type coupling only
          const d = nb.dist[k], kv = Math.exp(-d * d * inv2s2);
          num += kv * load[j]; den += kv;
        }
        w[i] = den > 0 ? num / den : load[i];
      }
    }

    for (let i = 0; i < n; i++) {
      elevation[i] = height[i] - w[i] + (type[i] === CRUST.CONTINENTAL ? p.refElevationM : 0);
    }
    ctx.diag('deflectionM', w);
    ctx.diag('flexuralAlphaKm', new Float32Array([alphaKm]));
  },
});
