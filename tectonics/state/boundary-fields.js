// Per-substep boundary state written by motion.advect and consumed by the
// orogeny passes. Transient: rewritten every substep.

import { defineField, hasField } from './fields.js';

export const BOUNDARY = Object.freeze({ NONE: 0, DIVERGENT: 1, OC: 2, CC: 3, OO: 4 });

export function defineBoundaryFields() {
  if (hasField('boundary.kind')) return;
  defineField('boundary.kind', { type: Uint8Array, unit: '', range: [0, 4],
    doc: 'What happened at this cell this substep: NONE, DIVERGENT (gap filled with new ocean floor), OC (ocean subducted under continent), CC (continent met continent), OO (ocean subducted under ocean).' });
  defineField('boundary.consumedKm', { type: Float32Array, unit: 'km', range: [0, 500],
    doc: 'Crustal thickness of the sources that subducted into this cell this substep. Drives arc magmatism; the mass itself leaves the system.' });
  defineField('boundary.excessKm', { type: Float32Array, unit: 'km', range: [0, 1000],
    doc: 'Continental crust that arrived at this cell but could not stay (the cell kept its dominant source). Redistributed into a belt by orogeny.thicken; conserved.' });
  defineField('boundary.overridingPlate', { type: Int32Array, unit: '', range: [-1, 1e6], initial: -1,
    doc: 'Plate that kept this cell at a convergent boundary; the belt is built on its side.' });
}
