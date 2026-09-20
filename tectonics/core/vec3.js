// Minimal 3-vector helpers. Hot loops should inline the arithmetic instead of
// calling these; they exist for setup code, tests and readability.

export function dot(ax, ay, az, bx, by, bz) { return ax * bx + ay * by + az * bz; }

export function length(x, y, z) { return Math.sqrt(x * x + y * y + z * z); }

// Normalises the vector stored at v[off..off+2] in place.
export function normalize3(v, off = 0) {
  const x = v[off], y = v[off + 1], z = v[off + 2];
  const l = Math.sqrt(x * x + y * y + z * z) || 1;
  v[off] = x / l; v[off + 1] = y / l; v[off + 2] = z / l;
  return v;
}

export function cross(ax, ay, az, bx, by, bz, out = [0, 0, 0], off = 0) {
  out[off]     = ay * bz - az * by;
  out[off + 1] = az * bx - ax * bz;
  out[off + 2] = ax * by - ay * bx;
  return out;
}

// Angle between two unit vectors; robust near 0 and π where acos(dot) is not.
export function angleBetweenUnit(ax, ay, az, bx, by, bz) {
  const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
  return Math.atan2(Math.sqrt(cx * cx + cy * cy + cz * cz), ax * bx + ay * by + az * bz);
}

// Geographic convention shared with v1: lat = asin(z), lon = atan2(y, x). Radians.
export function latOf(z) { return Math.asin(Math.max(-1, Math.min(1, z))); }
export function lonOf(x, y) { return Math.atan2(y, x); }
export function fromLatLon(lat, lon, out = [0, 0, 0], off = 0) {
  const c = Math.cos(lat);
  out[off] = c * Math.cos(lon); out[off + 1] = c * Math.sin(lon); out[off + 2] = Math.sin(lat);
  return out;
}
