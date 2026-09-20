// Neighbourhoods on the fixed grid, expressed in physical distance so they mean
// the same thing at every resolution. Built once per (world, radius) and cached
// by state/neighbors.js; the grid never changes so the result never goes stale.

export function buildRadiusNeighbors(locator, radiusRad) {
  const { n, xyz } = locator;
  const offset = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) {
    let c = 0;
    locator.forEachWithin(xyz[3 * i], xyz[3 * i + 1], xyz[3 * i + 2], radiusRad, () => { c++; });
    offset[i + 1] = offset[i] + c;
  }
  const idx = new Int32Array(offset[n]);
  const dist = new Float32Array(offset[n]);
  for (let i = 0; i < n; i++) {
    let p = offset[i];
    locator.forEachWithin(xyz[3 * i], xyz[3 * i + 1], xyz[3 * i + 2], radiusRad, (c, d) => {
      idx[p] = c; dist[p] = d; p++;
    });
  }
  return { offset, idx, dist, radiusRad };
}
