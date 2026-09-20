// A pass with no simulation semantics at all. It exists so the harness can be
// validated end to end — registered, toggled, inspected, diffed, unit-tested —
// before any tectonics is written.

import { definePass } from '../../sim/define-pass.js';

export function constantFill({ field, value, range = [-1e9, 1e9], unit = '' }) {
  return definePass({
    id: `debug.constantFill.${field.replace('.', '_')}`,
    phase: 'debug',
    doc: `Fills ${field} with a constant. Harness smoke test; carries no tectonic meaning.`,
    reads: [],
    writes: [field],
    params: {
      value: { value, range, unit, doc: `Constant written into every cell of ${field}.` },
    },
    run(world, p, ctx) {
      ctx.write(field).fill(p.value);
    },
  });
}
