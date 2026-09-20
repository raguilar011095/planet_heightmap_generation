// Finite rotations on the unit sphere — the GPlates model.
//
// A rotation is an axis and an angle, stored as a 3x3 row-major matrix in a
// Float64Array(9). Pole convention matches GPlates .rot files: pole latitude
// and longitude in degrees, angle in degrees, positive = counter-clockwise
// looking down the pole onto the sphere (right-hand rule about the axis).
//
// None of the functions taking an `out` may be called with `out` aliasing an
// input matrix.

const DEG = Math.PI / 180;
export const EARTH_RADIUS_KM = 6371;

export function poleToAxis(latDeg, lonDeg, out = [0, 0, 0]) {
  const lat = latDeg * DEG, lon = lonDeg * DEG, c = Math.cos(lat);
  out[0] = c * Math.cos(lon); out[1] = c * Math.sin(lon); out[2] = Math.sin(lat);
  return out;
}

export function identity(out = new Float64Array(9)) {
  out.fill(0); out[0] = out[4] = out[8] = 1;
  return out;
}

// Rodrigues' rotation formula. The axis must be unit length.
export function axisAngle(ax, ay, az, angleRad, out = new Float64Array(9)) {
  const c = Math.cos(angleRad), s = Math.sin(angleRad), t = 1 - c;
  out[0] = t * ax * ax + c;      out[1] = t * ax * ay - s * az; out[2] = t * ax * az + s * ay;
  out[3] = t * ax * ay + s * az; out[4] = t * ay * ay + c;      out[5] = t * ay * az - s * ax;
  out[6] = t * ax * az - s * ay; out[7] = t * ay * az + s * ax; out[8] = t * az * az + c;
  return out;
}

// A .rot line as a matrix: (poleLat, poleLon, angle) in degrees.
export function fromPole(latDeg, lonDeg, angleDeg, out) {
  const a = poleToAxis(latDeg, lonDeg);
  return axisAngle(a[0], a[1], a[2], angleDeg * DEG, out);
}

export function apply(m, x, y, z, out, off = 0) {
  out[off]     = m[0] * x + m[1] * y + m[2] * z;
  out[off + 1] = m[3] * x + m[4] * y + m[5] * z;
  out[off + 2] = m[6] * x + m[7] * y + m[8] * z;
  return out;
}

export function applyToArray(m, xyz, out = new Float32Array(xyz.length)) {
  for (let i = 0; i < xyz.length; i += 3) apply(m, xyz[i], xyz[i + 1], xyz[i + 2], out, i);
  return out;
}

// out = a · b — apply b first, then a.
export function compose(a, b, out = new Float64Array(9)) {
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out[3 * r + c] = a[3 * r] * b[c] + a[3 * r + 1] * b[3 + c] + a[3 * r + 2] * b[6 + c];
    }
  }
  return out;
}

// Rotation matrices are orthonormal, so the inverse is the transpose.
export function inverse(m, out = new Float64Array(9)) {
  out[0] = m[0]; out[1] = m[3]; out[2] = m[6];
  out[3] = m[1]; out[4] = m[4]; out[5] = m[7];
  out[6] = m[2]; out[7] = m[5]; out[8] = m[8];
  return out;
}

// Surface speed at the point where it is largest (90° from the pole).
// 1 km/Myr = 0.1 cm/yr.
export function degPerMyrToCmPerYr(degPerMyr, radiusKm = EARTH_RADIUS_KM) {
  return degPerMyr * DEG * radiusKm * 0.1;
}
export function cmPerYrToDegPerMyr(cmPerYr, radiusKm = EARTH_RADIUS_KM) {
  return cmPerYr / (DEG * radiusKm * 0.1);
}
