// Rigid plates: an id, an Euler rotation held constant across a policy
// interval, and the sub-cell rotation accumulated while the plate has not yet
// moved a whole cell (see passes/motion/advect.js). Cells reference plates by
// id through crust.plateId; plates hold no cell lists.

import { cmPerYrToDegPerMyr, degPerMyrToCmPerYr } from '../core/rotation.js';

export function addPlate(world, { poleLat = 90, poleLon = 0, degPerMyr = 0 } = {}) {
  const id = world.plates.length;
  world.plates.push({ id, poleLat, poleLon, degPerMyr, pendingDeg: 0, history: [] });
  return id;
}

export function setRotation(world, id, { poleLat, poleLon, degPerMyr, cmPerYr }) {
  const p = world.plates[id];
  if (!p) throw new Error(`setRotation: no plate ${id}`);
  if (poleLat !== undefined) p.poleLat = poleLat;
  if (poleLon !== undefined) p.poleLon = poleLon;
  if (cmPerYr !== undefined) p.degPerMyr = cmPerYrToDegPerMyr(cmPerYr);
  else if (degPerMyr !== undefined) p.degPerMyr = degPerMyr;
  return p;
}

export function plateSpeedCmPerYr(plate) { return degPerMyrToCmPerYr(Math.abs(plate.degPerMyr)); }

// Records the rotation that was just applied, GPlates .rot style (absolute frame).
export function recordRotation(plate, fromMa, toMa, angleDeg) {
  plate.history.push({ fromMa, toMa, poleLat: plate.poleLat, poleLon: plate.poleLon, angleDeg });
}
