// The World: one struct-of-arrays store over a fixed cell grid, plus the
// simulation clock and a diagnostics bag. Allocation is generic over the
// field registry, so snapshot/restore/clone are generic too.

import { listFields, getField } from './fields.js';
import { fibonacciPoints, CellLocator, meanSpacingRad, meanSpacingKm, cellAreaSr } from '../core/fibonacci-sphere.js';

export function createWorld({ cellCount, xyz = null, seed = 1, fields = listFields() }) {
  if (!(cellCount > 0)) throw new Error('createWorld: cellCount must be positive');
  const store = Object.create(null);
  for (const spec of fields) {
    const arr = new spec.type(cellCount);
    if (spec.initial !== 0) arr.fill(spec.initial);
    store[spec.name] = arr;
  }
  return {
    cellCount,
    xyz,
    seed: seed >>> 0,
    fields: store,
    diag: Object.create(null),        // "passId.name" → array, written via ctx.diag
    clock: { stepIndex: 0, timeMa: 0 },
    plates: [],                        // see state/plates.js
    counters: { terrane: 0 },          // next free ids for non-cell objects
  };
}

// A World on the fixed Fibonacci cell grid, with the geometry the passes need.
export function createGridWorld(n, { seed = 1, fields } = {}) {
  const xyz = fibonacciPoints(n);
  const world = createWorld({ cellCount: n, xyz, seed, fields });
  world.grid = {
    n, xyz,
    locator: new CellLocator(xyz, n),
    spacingRad: meanSpacingRad(n),
    spacingKm: meanSpacingKm(n),
    areaSr: cellAreaSr(n),
    neighborCache: new Map(),
  };
  return world;
}

export function getArray(world, name) {
  const arr = world.fields[name];
  if (!arr) { getField(name); throw new Error(`Field "${name}" is defined but not allocated in this world`); }
  return arr;
}

export function snapshotWorld(world) {
  const fields = Object.create(null);
  for (const name in world.fields) fields[name] = world.fields[name].slice();
  return { clock: { ...world.clock }, fields };
}

export function restoreWorld(world, snap) {
  for (const name in snap.fields) {
    const dst = world.fields[name];
    if (!dst) throw new Error(`restoreWorld: world has no field "${name}"`);
    dst.set(snap.fields[name]);
  }
  world.clock = { ...snap.clock };
}
