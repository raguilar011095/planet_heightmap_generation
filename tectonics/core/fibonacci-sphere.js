// The simulation's fixed cell grid: a Fibonacci sphere with no jitter.
//
// It is built once and never re-tessellated, so a cell's index is its stable
// identity for the whole run (ARCHITECTURE.md §3.1). Point formula adapted
// from Red Blob Games via v1's js/sphere-mesh.js.

export function fibonacciPoints(n) {
  const xyz = new Float32Array(3 * n);
  const dlong = Math.PI * (3 - Math.sqrt(5));
  const dz = 2 / n;
  for (let k = 0, lng = 0, z = 1 - dz / 2; k < n; k++, z -= dz, lng += dlong) {
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    xyz[3 * k] = r * Math.cos(lng);
    xyz[3 * k + 1] = r * Math.sin(lng);
    xyz[3 * k + 2] = z;
  }
  return xyz;
}

// Mean centre-to-centre spacing. √(4π/n) ≈ 3.545/√n; v1 uses 3.6 and so do we.
export function meanSpacingRad(n) { return 3.6 / Math.sqrt(n); }
export function meanSpacingKm(n, radiusKm = 6371) { return meanSpacingRad(n) * radiusKm; }
export function cellAreaSr(n) { return 4 * Math.PI / n; }

// Nearest-cell lookup by lat/lon bucketing. O(1) average; exact (verified
// against brute force in tests). Needed by scatter advection every substep,
// so it must stay allocation-free on the query path.
export class CellLocator {
  constructor(xyz, n) {
    this.xyz = xyz;
    this.n = n;
    const b = 2 * meanSpacingRad(n);                 // bucket size ≈ two spacings
    this.latBands = Math.max(2, Math.ceil(Math.PI / b));
    this.lonBands = Math.max(4, Math.ceil(2 * Math.PI / b));
    this.bandLat = Math.PI / this.latBands;
    this.bandLon = 2 * Math.PI / this.lonBands;

    const nb = this.latBands * this.lonBands;
    const bucketOf = new Int32Array(n);
    const start = new Int32Array(nb + 1);
    for (let i = 0; i < n; i++) {
      const bkt = this._latBand(Math.asin(xyz[3 * i + 2])) * this.lonBands
                + this._lonBand(Math.atan2(xyz[3 * i + 1], xyz[3 * i]));
      bucketOf[i] = bkt;
      start[bkt + 1]++;
    }
    for (let k = 0; k < nb; k++) start[k + 1] += start[k];
    const cells = new Int32Array(n);
    const fill = start.slice(0, nb);
    for (let i = 0; i < n; i++) cells[fill[bucketOf[i]]++] = i;
    this.start = start;
    this.cells = cells;
  }

  _latBand(lat) {
    return Math.min(this.latBands - 1, Math.max(0, Math.floor((lat + Math.PI / 2) / this.bandLat)));
  }
  _lonBand(lon) {
    let j = Math.floor((lon + Math.PI) / this.bandLon);
    if (j >= this.lonBands) j -= this.lonBands;
    if (j < 0) j += this.lonBands;
    return j;
  }

  nearest(x, y, z) {
    const len = Math.sqrt(x * x + y * y + z * z) || 1;
    const lat = Math.asin(Math.max(-1, Math.min(1, z / len)));
    const lon = Math.atan2(y, x);
    const bi = this._latBand(lat), bj = this._lonBand(lon);
    // The true nearest lies within ~0.6 bucket of arc. Longitude buckets narrow
    // toward the poles, so widen the reach by 1/cos at the more polar of the
    // candidate latitudes; near the pole this degenerates to the whole band.
    const polarLat = Math.min(Math.PI / 2, Math.abs(lat) + this.bandLat);
    const cosLat = Math.max(1e-9, Math.cos(polarLat));
    const half = Math.floor(this.lonBands / 2);
    const reach = Math.min(half, Math.ceil(0.6 / cosLat) + 1);
    const whole = 2 * reach + 1 >= this.lonBands;

    const { xyz, cells, start, lonBands } = this;
    let best = -1, bestDot = -2;
    for (let di = -1; di <= 1; di++) {
      const i = bi + di;
      if (i < 0 || i >= this.latBands) continue;
      const jFrom = whole ? 0 : -reach, jTo = whole ? lonBands - 1 : reach;
      for (let dj = jFrom; dj <= jTo; dj++) {
        let j = whole ? dj : bj + dj;
        if (j < 0) j += lonBands; else if (j >= lonBands) j -= lonBands;
        const bkt = i * lonBands + j;
        for (let p = start[bkt], pe = start[bkt + 1]; p < pe; p++) {
          const c = cells[p];
          const d = xyz[3 * c] * x + xyz[3 * c + 1] * y + xyz[3 * c + 2] * z;
          if (d > bestDot) { bestDot = d; best = c; }
        }
      }
    }
    if (best !== -1) return best;
    // Only reachable for degenerate tiny grids; brute force rather than fail.
    for (let c = 0; c < this.n; c++) {
      const d = xyz[3 * c] * x + xyz[3 * c + 1] * y + xyz[3 * c + 2] * z;
      if (d > bestDot) { bestDot = d; best = c; }
    }
    return best;
  }
}
