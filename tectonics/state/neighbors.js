// Memoised physical-radius neighbourhoods for a grid world. Passes ask for a
// radius in radians (derived from a distance in km); the grid is fixed, so the
// answer is built once and reused for the whole run.

import { buildRadiusNeighbors } from '../core/grid-neighbors.js';

export function radiusNeighbors(world, radiusRad) {
  const grid = world.grid;
  if (!grid) throw new Error('radiusNeighbors: world has no grid — create it with createGridWorld');
  const key = radiusRad.toFixed(8);
  let nb = grid.neighborCache.get(key);
  if (!nb) {
    nb = buildRadiusNeighbors(grid.locator, radiusRad);
    grid.neighborCache.set(key, nb);
  }
  return nb;
}
