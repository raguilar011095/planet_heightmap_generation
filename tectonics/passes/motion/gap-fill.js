// Gap resolution for motion.advect: cells that received no crust this substep.
//
// A gap whose filled neighbours belong to two plates is spreading. Inside a
// continent the first new crust is stretched continental crust drawn
// mass-exactly from the surrounding margin (rifted margins, shelves, and the
// area-recovery that balances what collisions consume); once the margin is
// exhausted, seafloor spreading (age-0 ocean floor) takes over. A gap whose
// neighbours are all one plate is rounding dilation: it copies its nearest
// neighbour and takes its thickness from the surrounding cells. Leftovers
// with no filled neighbour at all become orphan ocean.

import { CRUST } from '../../state/crust-fields.js';
import { BOUNDARY } from '../../state/boundary-fields.js';

export function fillGaps({ world, p, next, filled, gapList, nb1, nb2, kind, CRUST_FIELDS }) {
  const { xyz } = world.grid;
  const nPlate = next['crust.plateId'], nType = next['crust.type'], nThick = next['crust.thickness'];
  const newOcean = (j, plate) => {
    nPlate[j] = plate; nType[j] = CRUST.OCEANIC;
    next['crust.thickness'][j] = p.oceanThicknessKm; next['crust.ageMa'][j] = 0;
    next['crust.terraneId'][j] = -1; next['crust.isCraton'][j] = 0;
    next['crust.orogenAge'][j] = 3000; next['crust.magmaAge'][j] = 5000; next['crust.volcano'][j] = 0; next['crust.sediment'][j] = 0;
    next['crust.posX'][j] = xyz[3 * j]; next['crust.posY'][j] = xyz[3 * j + 1]; next['crust.posZ'][j] = xyz[3 * j + 2];
  };
  let gaps = 0, orphans = 0, stretched = 0, dilated = 0, mDilateIn = 0, mDilateOut = 0;
  // Try to create a thinned continental cell at gap j from same-plate continental donors
  // in nb2 that are above marginFloorKm. Returns false if they cannot supply riftCellKm.
  const stretchInto = (j, plate) => {
    let avail = 0;
    for (let k = nb2.offset[j], ke = nb2.offset[j + 1]; k < ke; k++) { const c = nb2.idx[k]; if (filled[c] === 1 && nPlate[c] === plate && nType[c] === CRUST.CONTINENTAL) avail += Math.max(0, nThick[c] - p.marginFloorKm); }
    if (avail < p.riftCellKm) return false;
    let src = -1, srcD = Infinity, ageSum = 0, ageN = 0;
    for (let k = nb2.offset[j], ke = nb2.offset[j + 1]; k < ke; k++) {
      const c = nb2.idx[k];
      if (filled[c] !== 1 || nPlate[c] !== plate || nType[c] !== CRUST.CONTINENTAL) continue;
      const room = Math.max(0, nThick[c] - p.marginFloorKm);
      nThick[c] -= p.riftCellKm * room / avail;
      ageSum += next['crust.ageMa'][c]; ageN++;
      if (nb2.dist[k] < srcD) { srcD = nb2.dist[k]; src = c; }
    }
    nPlate[j] = plate; nType[j] = CRUST.CONTINENTAL; nThick[j] = p.riftCellKm;
    next['crust.ageMa'][j] = ageN ? ageSum / ageN : 0; next['crust.terraneId'][j] = next['crust.terraneId'][src];
    next['crust.isCraton'][j] = 0; next['crust.orogenAge'][j] = 3000; next['crust.magmaAge'][j] = 5000; next['crust.volcano'][j] = 0; next['crust.sediment'][j] = 0;
    next['crust.posX'][j] = xyz[3 * j]; next['crust.posY'][j] = xyz[3 * j + 1]; next['crust.posZ'][j] = xyz[3 * j + 2];
    return true;
  };
  for (const nb of [nb1, nb2]) {
    for (const j of gapList) {
      if (filled[j]) continue;
      let best = -1, bestD = Infinity, plates = 0, p0 = -2;
      for (let k = nb.offset[j], ke = nb.offset[j + 1]; k < ke; k++) {
        const c = nb.idx[k];
        if (filled[c] !== 1) continue;
        if (nb.dist[k] < bestD) { bestD = nb.dist[k]; best = c; }
        if (p0 === -2) { p0 = nPlate[c]; plates = 1; } else if (nPlate[c] !== p0 && plates === 1) plates = 2;
      }
      if (best < 0) continue;
      if (plates >= 2) {
        // A gap between two plates is spreading. If it opens INSIDE a continent the first
        // new crust is stretched continental crust drawn from the surrounding margin
        // (mass-exact), not seafloor: this is how rifted margins form, and it is what
        // gives continental area back after collisions consume it. Once the margin has
        // thinned to marginFloorKm the supply is gone and true seafloor spreading begins.
        if (nType[best] === CRUST.CONTINENTAL && stretchInto(j, nPlate[best])) { kind[j] = BOUNDARY.DIVERGENT; filled[j] = 2; stretched++; continue; }
        newOcean(j, nPlate[best]); kind[j] = BOUNDARY.DIVERGENT; filled[j] = 2; gaps++; continue;
      }
      // Interior hole: rounding dilation. Copy the nearest same-plate neighbour AS IT IS
      // NOW (new layout — `copy` reads old-layout sources and must not be used here), then
      // for continental crust take the thickness from the surrounding cells so mass is exact.
      for (const f of CRUST_FIELDS) next[f][j] = next[f][best];
      next['crust.posX'][j] = xyz[3 * j]; next['crust.posY'][j] = xyz[3 * j + 1]; next['crust.posZ'][j] = xyz[3 * j + 2];
      if (nType[j] === CRUST.CONTINENTAL) {
        let sum = 0, cnt = 0;
        for (let k = nb2.offset[j], ke = nb2.offset[j + 1]; k < ke; k++) { const c = nb2.idx[k]; if (c !== j && filled[c] === 1 && nPlate[c] === p0 && nType[c] === CRUST.CONTINENTAL) { sum += nThick[c]; cnt++; } }
        if (!cnt) { newOcean(j, p0); kind[j] = BOUNDARY.NONE; filled[j] = 2; gaps++; continue; }   // no continental crust to dilate from
        // Each donor gives at most half of what it has (donors can be shared between holes);
        // the hole receives exactly what was collected, so mass is exact and nothing goes negative.
        const share = sum / cnt / cnt;
        let taken = 0;
        for (let k = nb2.offset[j], ke = nb2.offset[j + 1]; k < ke; k++) {
          const c = nb2.idx[k];
          if (c !== j && filled[c] === 1 && nPlate[c] === p0 && nType[c] === CRUST.CONTINENTAL) { const g = Math.min(share, 0.5 * nThick[c]); nThick[c] -= g; taken += g; }
        }
        nThick[j] = taken; mDilateIn += taken; mDilateOut += taken;
      }
      filled[j] = 3; dilated++;
    }
  }
  for (const j of gapList) { if (filled[j]) continue; newOcean(j, -1); filled[j] = 2; orphans++; }

  return { gaps, orphans, stretched, dilated, mDilateIn, mDilateOut };
}
