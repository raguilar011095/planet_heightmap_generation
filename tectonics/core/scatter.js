// Forward scatter of grid cells under per-plate rigid rotations.
//
// Every cell on a moving plate is rotated and lands on the nearest grid cell.
// The result is a source→destination map plus, for each destination, the list
// of sources that landed there (CSR). Zero sources is a gap (divergence), two
// or more is an overlap (convergence or, within one plate, rounding noise that
// the caller re-pairs with a nearby gap). See DESIGN.md §3.

import { apply } from './rotation.js';

// matrices[plateId] is a Float64Array(9) or null for a plate that does not move this step.
// pos{X,Y,Z} are the exact particle positions; r{x,y,z} receive the rotated ones.
export function scatterCells(posX, posY, posZ, n, locator, plateId, matrices, rx, ry, rz) {
  const dest = new Int32Array(n);
  const fit = new Float32Array(n);          // dot(rotated position, destination centre): 1 = exact
  const count = new Int32Array(n + 1);
  const { xyz } = locator;
  const tmp = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const pid = plateId[i];
    const m = pid >= 0 ? matrices[pid] : null;
    const x = posX[i], y = posY[i], z = posZ[i];
    if (m) apply(m, x, y, z, tmp); else { tmp[0] = x; tmp[1] = y; tmp[2] = z; }
    rx[i] = tmp[0]; ry[i] = tmp[1]; rz[i] = tmp[2];
    const j = locator.nearest(tmp[0], tmp[1], tmp[2]);
    fit[i] = tmp[0] * xyz[3 * j] + tmp[1] * xyz[3 * j + 1] + tmp[2] * xyz[3 * j + 2];
    dest[i] = j;
    count[j + 1]++;
  }
  for (let j = 0; j < n; j++) count[j + 1] += count[j];
  const srcList = new Int32Array(n);
  const fill = count.slice(0, n);
  for (let i = 0; i < n; i++) srcList[fill[dest[i]]++] = i;
  return { dest, fit, srcOffset: count, srcList };
}
