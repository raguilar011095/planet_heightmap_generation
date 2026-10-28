// The projections' inverses in GLSL (the same ten as projections.js), for Evolution's map view: the map is a full-screen
// quad whose fragment shader asks, for each pixel, which longitude and latitude it shows, and samples the planet's
// equirectangular texture there. `projectionUniforms(id, opts)` gives the uniforms the shader reads; `PROJECTION_GLSL`
// is the function `bool projInverse(vec2 xy, out vec2 lonLat)` (xy in the projection's map space, lonLat in radians).

import { P } from './projections.js';

const IDS = ['equirect', 'mercator', 'robinson', 'equalearth', 'mollweide', 'hammer', 'winkel', 'ortho', 'azeq', 'vdg'];
export const PROJECTION_INDEX = Object.fromEntries(IDS.map((id, i) => [id, i]));

/** The uniforms for a projection and its options (degrees in, radians out): { uProj, uBounds, uOpt }. */
export function projectionUniforms(id = 'equirect', opts = {}) {
    const b = P[id].bounds(opts), D = Math.PI / 180;
    return {
        uProj: PROJECTION_INDEX[id] ?? 0,
        uBounds: [b[0], b[1], b[2], b[3]],
        // (Mercator's max latitude; Winkel's cos(standard parallel); the azimuthals' centre latitude; flags)
        uOpt: [(opts.maxLat ?? 85) * D, Math.cos((opts.par ?? 50.46) * D), (opts.lat0 ?? (id === 'azeq' ? 90 : 20)) * D,
            ((opts.hemis ?? 2) === 2 ? 2 : 1) + ((opts.extent ?? 'world') === 'world' ? 10 : 0) + 0],
    };
}

export const PROJECTION_GLSL = /* glsl */`
uniform int uProj;
uniform vec4 uBounds;        // xmin, xmax, ymin, ymax
uniform vec4 uOpt;           // Mercator max latitude (rad); cos(Winkel's parallel); azimuthal centre latitude (rad); flags (hemispheres + 10 × whole-world extent)
const float PI = 3.14159265358979;
const float HALF = 1.57079632679490;
const float R2 = 1.41421356237310;
const float S3 = 1.73205080756888;
const float RAD = 0.01745329251994;
float wrapLon(float l) { return mod(l + PI, 2.0 * PI) - PI; }
// Robinson's table (every 5° of latitude): the parallel's length and its distance from the equator
const float RX[19] = float[19](1.0, 0.9986, 0.9954, 0.99, 0.9822, 0.973, 0.96, 0.9427, 0.9216, 0.8962, 0.8679, 0.835, 0.7986, 0.7597, 0.7186, 0.6732, 0.6213, 0.5722, 0.5322);
const float RY[19] = float[19](0.0, 0.062, 0.124, 0.186, 0.248, 0.31, 0.372, 0.434, 0.4958, 0.5571, 0.6176, 0.6769, 0.7346, 0.7903, 0.8435, 0.8936, 0.9394, 0.9761, 1.0);
// Mollweide's θ for a latitude: 2θ + sin 2θ = π sin φ
float mollTheta(float phi) {
    float k = PI * sin(phi), t = phi;
    for (int i = 0; i < 8; i++) { float d = 2.0 + 2.0 * cos(2.0 * t); if (d < 1e-6) break; t -= (2.0 * t + sin(2.0 * t) - k) / d; }
    return t;
}
vec2 winkelFwd(vec2 lp, float c1) {
    float a = acos(clamp(cos(lp.y) * cos(lp.x * 0.5), -1.0, 1.0)), sc = a < 1e-6 ? 1.0 : sin(a) / a;
    return vec2(0.5 * (lp.x * c1 + 2.0 * cos(lp.y) * sin(lp.x * 0.5) / sc), 0.5 * (lp.y + sin(lp.y) / sc));
}
vec2 azInverse(vec2 xy, float r, float c, float p0) {
    float sc = sin(c), cc = cos(c);
    float p = asin(clamp(cc * sin(p0) + (r > 0.0 ? xy.y * sc * cos(p0) / r : 0.0), -1.0, 1.0));
    float l = atan(xy.x * sc, r * cc * cos(p0) - xy.y * sc * sin(p0));
    return vec2(l, p);
}
/** The inverse: map-space xy → (longitude, latitude) in radians; false outside the map. */
bool projInverse(vec2 xy, out vec2 ll) {
    float x = xy.x, y = xy.y;
    if (uProj == 0) { ll = vec2(x, y); return abs(x) <= PI && abs(y) <= HALF; }
    if (uProj == 1) { ll = vec2(x, 2.0 * atan(exp(y)) - HALF); return abs(x) <= PI; }
    if (uProj == 2) {
        float Y = abs(y) / 1.3523; if (Y > 1.0) return false;
        int i = 0; for (int k = 0; k < 17; k++) { if (RY[k + 1] < Y) i = k + 1; else break; }
        float a = 5.0 * (float(i) + (Y - RY[i]) / (RY[i + 1] - RY[i]));
        int j = int(min(17.0, floor(a / 5.0))); float t = a / 5.0 - float(j), X = RX[j] + (RX[j + 1] - RX[j]) * t;
        float l = x / (0.8487 * X); if (abs(l) > PI) return false;
        ll = vec2(l, a * RAD * sign(y)); return true;
    }
    if (uProj == 3) {
        float t = y;
        for (int i = 0; i < 8; i++) { float t2 = t * t; float f = 1.340264 * t - 0.081106 * t * t2 + 0.000893 * t * t2 * t2 * t2 + 0.003796 * t * t2 * t2 * t2 * t2 - y; float d = 1.340264 - 0.243318 * t2 + 0.006251 * t2 * t2 * t2 + 0.034164 * t2 * t2 * t2 * t2; t -= f / d; }
        if (abs(t) > 1.0471976) return false;
        float t2 = t * t, d = 1.340264 - 0.243318 * t2 + 0.006251 * t2 * t2 * t2 + 0.034164 * t2 * t2 * t2 * t2;
        float l = 3.0 * x * d / (2.0 * S3 * cos(t)); if (abs(l) > PI) return false;
        ll = vec2(l, asin(clamp(sin(t) / (S3 * 0.5), -1.0, 1.0))); return true;
    }
    if (uProj == 4) {
        float s = y / R2; if (abs(s) > 1.0) return false;
        float t = asin(s), p = asin(clamp((2.0 * t + sin(2.0 * t)) / PI, -1.0, 1.0)), c = cos(t);
        if (c < 1e-6) return false;
        float l = PI * x / (2.0 * R2 * c); if (abs(l) > PI) return false;
        ll = vec2(l, p); return true;
    }
    if (uProj == 5) {
        float z2 = 1.0 - (x * 0.25) * (x * 0.25) - (y * 0.5) * (y * 0.5); if (z2 < 0.5) return false;
        float z = sqrt(z2); ll = vec2(2.0 * atan(z * x, 2.0 * (2.0 * z2 - 1.0)), asin(clamp(z * y, -1.0, 1.0))); return true;
    }
    if (uProj == 6) {
        float c1 = uOpt.y; vec2 lp = vec2(2.0 * x / (c1 + 1.0), y);
        for (int i = 0; i < 12; i++) {
            vec2 f = winkelFwd(lp, c1) - xy; if (abs(f.x) + abs(f.y) < 1e-7) break;
            float e = 1e-4; vec2 a = (winkelFwd(lp + vec2(e, 0.0), c1) - f - xy) / e, b = (winkelFwd(lp + vec2(0.0, e), c1) - f - xy) / e;
            float det = a.x * b.y - b.x * a.y; if (abs(det) < 1e-12) return false;
            lp -= vec2(b.y * f.x - b.x * f.y, -a.y * f.x + a.x * f.y) / det;
            if (abs(lp.y) > HALF + 0.2 || abs(lp.x) > PI + 0.4) return false;
        }
        if (abs(lp.x) > PI + 1e-4 || abs(lp.y) > HALF + 1e-4) return false;
        vec2 f = winkelFwd(lp, c1) - xy; if (abs(f.x) + abs(f.y) > 1e-3) return false;
        ll = clamp(lp, vec2(-PI, -HALF), vec2(PI, HALF)); return true;
    }
    if (uProj == 7) {
        bool two = mod(uOpt.w, 10.0) >= 2.0; float h = 0.0;
        if (two) { h = x > 0.0 ? 1.0 : 0.0; x -= h > 0.0 ? 1.06 : -1.06; }
        float r = length(vec2(x, y)); if (r > 1.0) return false;
        vec2 lp = azInverse(vec2(x, y), r, asin(min(1.0, r)), uOpt.z); ll = vec2(wrapLon(lp.x + h * PI), lp.y); return true;
    }
    if (uProj == 8) {
        float lim = mod(uOpt.w, 100.0) >= 10.0 ? PI : HALF, r = length(xy); if (r > lim) return false;
        ll = azInverse(xy, r, r, uOpt.z); return true;
    }
    if (uProj == 9) {
        // Van der Grinten (Snyder 29-7 … 29-16): the world in a circle
        float X = x / PI, Y = y / PI, X2 = X * X, Y2 = Y * Y; if (X2 + Y2 > 1.0) return false;
        if (abs(Y) < 1e-6) { if (abs(X) > 1.0) return false; ll = vec2(x, 0.0); return true; }
        float c1 = -abs(Y) * (1.0 + X2 + Y2), c2 = c1 - 2.0 * Y2 + X2, c3 = -2.0 * c1 + 1.0 + 2.0 * Y2 + (X2 + Y2) * (X2 + Y2);
        float d = Y2 / c3 + (2.0 * c2 * c2 * c2 / (c3 * c3 * c3) - 9.0 * c1 * c2 / (c3 * c3)) / 27.0, a1 = (c1 - c2 * c2 / (3.0 * c3)) / c3, m1 = 2.0 * sqrt(-a1 / 3.0);
        float t1 = acos(clamp(3.0 * d / (a1 * m1), -1.0, 1.0)) / 3.0;
        float p = PI * (-m1 * cos(t1 + PI / 3.0) - c2 / (3.0 * c3)) * sign(Y);
        float l = abs(X) < 1e-6 ? 0.0 : PI * (X2 + Y2 - 1.0 + sqrt(1.0 + 2.0 * (X2 - Y2) + (X2 + Y2) * (X2 + Y2))) / (2.0 * X);
        if (abs(l) > PI) return false;
        ll = vec2(l, clamp(p, -HALF, HALF)); return true;
    }
    return false;
}
`;
