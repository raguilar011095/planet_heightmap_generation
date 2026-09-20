// Derived surface state. Elevation is computed from crust state every step by
// the surface passes; it is stored as a field so it is inspectable, snapshotted
// and range-checked like everything else, but it is never the primary state.

import { defineField, hasField } from './fields.js';

export function defineSurfaceFields() {
  if (hasField('surface.elevation')) return;   // idempotent
  defineField('surface.elevation', { type: Float32Array, unit: 'm', range: [-12000, 12000],
    doc: 'Surface elevation relative to sea level, derived from crust thickness, density, sediment, flexure and ocean-floor age.' });
}
