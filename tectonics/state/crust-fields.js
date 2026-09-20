// Cell state for the crust, per DESIGN.md §1.2. Elevation is derived from these
// and is declared by the pass that derives it, not here.

import { defineField, hasField } from './fields.js';

export const CRUST = Object.freeze({ NONE: 0, OCEANIC: 1, CONTINENTAL: 2 });

export function defineCrustFields() {
  if (hasField('crust.plateId')) return;   // idempotent

  defineField('crust.plateId', { type: Int32Array, unit: '', range: [-1, 1e6], initial: -1,
    doc: 'Rigid plate this cell currently rides on. -1 = unassigned.' });

  defineField('crust.terraneId', { type: Int32Array, unit: '', range: [-1, 1e6], initial: -1,
    doc: 'Provenance grouping (craton, arc, fragment…). Survives accretion, unlike plateId.' });

  defineField('crust.type', { type: Uint8Array, unit: '', range: [0, 2],
    doc: 'CRUST.NONE (transient during scatter), CRUST.OCEANIC or CRUST.CONTINENTAL.' });

  defineField('crust.thickness', { type: Float32Array, unit: 'km', range: [0, 160],
    doc: 'Crustal column thickness. The conserved mass quantity: cell area is fixed, so mass = thickness × area.' });

  defineField('crust.ageMa', { type: Float32Array, unit: 'Myr', range: [0, 5000],
    doc: 'Time since formation (oceanic) or since the last thermal reset (continental).' });

  defineField('crust.isCraton', { type: Uint8Array, unit: '', range: [0, 1],
    doc: 'The blog\'s "rarely broken or deformed" flag. Craton cells never thicken; excess mass routes around them.' });

  defineField('crust.orogenAge', { type: Float32Array, unit: 'Myr', range: [0, 5000],
    doc: 'Time since the last significant thickening event. Drives the erosion state of a belt.' });

  defineField('crust.magmaAge', { type: Float32Array, unit: 'Myr', range: [0, 5000], initial: 5000,
    doc: 'Time since this cell last received arc or hotspot magma. Young = an active volcanic arc or hotspot: thermally supported, with edifices. 5000 = never.' });

  defineField('crust.volcano', { type: Float32Array, unit: '', range: [0, 1], initial: 0,
    doc: 'Sub-grid volcanic edifice size, 0-1, assigned when a cell first turns magmatic and carried with the crust. Rendered as extra height by surface.volcanoes.' });

  defineField('crust.sediment', { type: Float32Array, unit: 'km', range: [0, 30],
    doc: 'Deposited material: passive-margin wedges and foreland fill.' });

  // The crust in a cell is a particle with an exact position; the cell is only where it
  // is stored. Rotating the exact position each substep means transport accumulates no
  // rounding error, whatever the lattice does (see passes/motion/advect.js).
  for (const [axis, doc] of [['X', 'x'], ['Y', 'y'], ['Z', 'z']]) {
    defineField(`crust.pos${axis}`, { type: Float32Array, unit: '', range: [-1.001, 1.001],
      doc: `Unit-sphere ${doc} of the exact position of this cell's crust particle (within ~1 spacing of the cell centre).` });
  }
}
