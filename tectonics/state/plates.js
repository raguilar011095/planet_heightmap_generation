// Rigid plates: an id, an Euler rotation held constant across a policy
// interval, and the sub-cell rotation accumulated while the plate has not yet
// moved a whole cell (see passes/motion/advect.js). Cells reference plates by
// id through crust.plateId; plates hold no cell lists. Policy passes attach
// per-plate statistics (policy.plateStats) and mutate rotations; plates are
// world-level state, not a registered field, so the dev guard does not cover them.

import { cmPerYrToDegPerMyr, degPerMyrToCmPerYr, poleToAxis, EARTH_RADIUS_KM } from '../core/rotation.js';

const DEG = Math.PI / 180;

export function addPlate(world, { poleLat = 90, poleLon = 0, degPerMyr = 0, bornMa = null, parent = -1 } = {}) {
  const id = world.plates.length;
  world.plates.push({ id, poleLat, poleLon, degPerMyr, pendingDeg: 0, history: [],
                      bornMa: bornMa ?? world.clock.timeMa, parent, dead: false, stats: null, collisions: new Map() });
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

// Angular velocity vector (rad/Myr) of a plate.
export function omegaOf(plate, out = [0, 0, 0]) {
  poleToAxis(plate.poleLat, plate.poleLon, out);
  const w = plate.degPerMyr * DEG;
  out[0] *= w; out[1] *= w; out[2] *= w;
  return out;
}

// Surface velocity (km/Myr, tangent) of a plate at unit-sphere point p: v = ω × p · R.
export function velocityAt(plate, x, y, z, out = [0, 0, 0]) {
  const w = omegaOf(plate);
  out[0] = (w[1] * z - w[2] * y) * EARTH_RADIUS_KM;
  out[1] = (w[2] * x - w[0] * z) * EARTH_RADIUS_KM;
  out[2] = (w[0] * y - w[1] * x) * EARTH_RADIUS_KM;
  return out;
}

// The rotation that moves point c with tangent velocity direction v̂ at speed cm/yr:
// axis = c × v̂ (so that axis × c = v̂), rate from speed. Returns { poleLat, poleLon, degPerMyr }.
export function rotationForVelocity(cx, cy, cz, vx, vy, vz, cmPerYr) {
  const d = vx * cx + vy * cy + vz * cz;                 // project v onto the tangent plane at c
  vx -= d * cx; vy -= d * cy; vz -= d * cz;
  const vl = Math.hypot(vx, vy, vz);
  if (vl < 1e-9 || cmPerYr <= 0) return { poleLat: 90, poleLon: 0, degPerMyr: 0 };
  vx /= vl; vy /= vl; vz /= vl;
  let ax = cy * vz - cz * vy, ay = cz * vx - cx * vz, az = cx * vy - cy * vx;
  const al = Math.hypot(ax, ay, az) || 1; ax /= al; ay /= al; az /= al;
  return { poleLat: Math.asin(Math.max(-1, Math.min(1, az))) / DEG, poleLon: Math.atan2(ay, ax) / DEG, degPerMyr: cmPerYrToDegPerMyr(cmPerYr) };
}

export function setOmega(world, id, wx, wy, wz) {
  const w = Math.hypot(wx, wy, wz);
  const p = world.plates[id];
  if (w < 1e-12) { p.degPerMyr = 0; return p; }
  p.poleLat = Math.asin(Math.max(-1, Math.min(1, wz / w))) / DEG;
  p.poleLon = Math.atan2(wy / w, wx / w) / DEG;
  p.degPerMyr = w / DEG;
  return p;
}
