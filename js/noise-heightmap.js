// Per-pixel 3D noise enhancement for heightmap exports.
// Applied on the CPU after GPU renders the base heightmap, before PNG encoding.
// All noise is sampled on the unit sphere to avoid equirectangular distortion.
//
// Architecture:
//   0. Compute raw amplitude factors (elevFactor, slopeFactor) per pixel.
//   1. Max-pool then Gaussian-blur both factor fields using sphere-aware
//      kernel radii (latitude-corrected) so the smoothing covers a fixed
//      physical distance (~50 km) everywhere on the globe.
//   2. Domain warp — shift the 3D sample point with low-freq noise so all
//      downstream features become organic and non-repetitive.
//   3. Multi-band FBM — four frequency tiers (very-low, low, mid, high)
//      each scaled by the SMOOTHED elevation factor.
//   4. Ridge noise — ridged multifractal on mountains, domain-warped.
//   5. Slope-dependent roughness scaled by SMOOTHED slope factor.
//   6. Gradient-aligned anisotropy — detail noise stretched along terrain
//      grain (perpendicular to slope).
//   7. Sedimentary layering — contour-following bands on flat plateaus.
//   8. Erosion carving — negative noise amplified on tall/steep terrain
//      using the SMOOTHED factors.

import { SimplexNoise } from './simplex-noise.js';
import { elevToHeightKm } from './color-map.js';

// ── Earth-scale constants ───────────────────────────────────────────
const EARTH_R = 6371;
const TWO_PI_R = 2 * Math.PI * EARTH_R;

function kmToFreq(wavelengthKm) {
    return TWO_PI_R / wavelengthKm;
}

// ── Smoothing kernel ────────────────────────────────────────────────
// Physical radius for max-pool and Gaussian blur of amplitude factors.
// This determines how far mountain-level noise amplitude "bleeds" into
// adjacent lowlands, creating smooth amplitude transitions.
const POOL_RADIUS_KM = 50;    // km — max-pool reach
const BLUR_RADIUS_KM = 50;    // km — Gaussian blur sigma (≈ radius for 3-pass box)

// ── Domain Warp ─────────────────────────────────────────────────────
const WARP_CONTINENTAL_FREQ = kmToFreq(800);
const WARP_CONTINENTAL_AMP  = 0.12;    // ≈ 760 km shift
const WARP_REGIONAL_FREQ    = kmToFreq(150);
const WARP_REGIONAL_AMP     = 0.04;    // ≈ 250 km shift

// ── Very-low-frequency continental tilt ─────────────────────────────
const VLO_FREQ    = kmToFreq(2500);
const VLO_OCTAVES = 2;
const VLO_PERSIST = 0.40;
const VLO_AMP     = 1.0;    // km — up to ±1 km continental tilt

// ── Low-frequency continental undulation ────────────────────────────
const LO_FREQ     = kmToFreq(600);
const LO_OCTAVES  = 3;
const LO_PERSIST  = 0.50;
const LO_AMP      = 1.0;    // km — up to ±1 km

// ── Mid-frequency regional detail ───────────────────────────────────
const MID_FREQ    = kmToFreq(120);
const MID_OCTAVES = 4;
const MID_PERSIST = 0.50;
const MID_AMP     = 0.65;   // km — up to ±650 m

// ── High-frequency local detail ─────────────────────────────────────
const HI_FREQ     = kmToFreq(15);
const HI_OCTAVES  = 4;
const HI_PERSIST  = 0.50;
const HI_AMP      = 0.10;   // km

// ── Ridge Noise for Mountain Spines ─────────────────────────────────
const RIDGE_FREQ     = kmToFreq(25);
const RIDGE_OCTAVES  = 5;
const RIDGE_AMP      = 0.30;   // km
const RIDGE_ELEV_MIN = 1.2;    // km
const RIDGE_ELEV_FULL = 3.0;   // km

// ── Slope-Dependent Roughness ───────────────────────────────────────
const ROUGH_FREQ    = kmToFreq(6);
const ROUGH_OCTAVES = 3;
const ROUGH_PERSIST = 0.55;
const ROUGH_AMP     = 0.08;   // km

// ── Anisotropy ──────────────────────────────────────────────────────
const ANISO_STRETCH   = 10.0;
const ANISO_SQUEEZE   = 1.0 / ANISO_STRETCH;
const ANISO_SLOPE_MIN = 0.03;

// ── Sedimentary Layering on Plateaus ────────────────────────────────
const B7_BAND_SPACING = 2.0;      // km
const B7_AMP          = 0.035;    // km
const B7_ELEV_MIN     = 0.3;      // km
const B7_FLAT_SLOPE   = 0.004;

// ── Lowland quieting mask ────────────────────────────────────────────
// Very low frequency noise (~1500 km) that suppresses noise amplitude
// in lowlands, creating vast flat plains with occasional hilly patches.
// At high elevations the mask has no effect (always 1.0).
// At low elevations it ranges from QUIET_FLOOR to 1.0.
const QUIET_FREQ    = kmToFreq(1500);   // continental-scale patches
const QUIET_OCTAVES = 2;
const QUIET_PERSIST = 0.40;
const QUIET_FLOOR   = 0.12;             // minimum amplitude in quietest lowlands
const QUIET_ELEV_FULL = 1.5;            // km — above this, mask is always 1.0

// ── Additive bias ───────────────────────────────────────────────────
const BIAS = 0.08;

// ── Erosion carving factor ──────────────────────────────────────────
const CARVE_ELEV_SCALE  = 0.25;
const CARVE_SLOPE_SCALE = 0.8;
const CARVE_MAX         = 1.8;

// ── Heightmap encoding ──────────────────────────────────────────────
function tToHeightKm(t) { return t * 6; }
function heightKmToT(h) { return h / 6; }

function smoothstep(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}

// ─────────────────────────────────────────────────────────────────────
// Sphere-aware separable max-pool.
//
// Horizontal pass uses a latitude-corrected radius so the physical
// distance pooled is constant across the globe:
//   radiusX(row) = round(targetKm / kmPerPixelX(lat))
// Vertical pass uses a constant radius:
//   radiusY = round(targetKm / kmPerPixelY)
//
// Uses O(n) sliding-window maximum (monotonic deque) per scanline.
// ─────────────────────────────────────────────────────────────────────

function maxPoolSphereAware(field, pw, ph, px0, py0, width, height, radiusKm) {
    const PI = Math.PI;
    const kmPerPixY = PI * EARTH_R / height;
    const radiusY = Math.max(1, Math.round(radiusKm / kmPerPixY));

    const tmp = new Float32Array(pw * ph);

    // Horizontal pass (latitude-corrected radius)
    for (let row = 0; row < ph; row++) {
        const imgY = py0 + (ph - 1 - row);  // GPU flip
        const lat = PI * (0.5 - imgY / height);
        const cosLat = Math.abs(Math.cos(lat)) || 0.01;
        const kmPerPixX = TWO_PI_R * cosLat / width;
        const radiusX = Math.min(Math.max(1, Math.round(radiusKm / kmPerPixX)), pw);

        slidingMax(field, row * pw, pw, radiusX, tmp, row * pw);
    }

    // Vertical pass (constant radius)
    // Process column-by-column using a temp column buffer
    const colIn  = new Float32Array(ph);
    const colOut = new Float32Array(ph);
    for (let col = 0; col < pw; col++) {
        for (let row = 0; row < ph; row++) colIn[row] = tmp[row * pw + col];
        slidingMax(colIn, 0, ph, radiusY, colOut, 0);
        for (let row = 0; row < ph; row++) field[row * pw + col] = colOut[row];
    }
}

// O(n) sliding window maximum using monotonic deque
function slidingMax(src, srcOff, len, radius, dst, dstOff) {
    // Deque stores indices; front is always the maximum in the window
    const deque = new Int32Array(len);  // circular buffer
    let dHead = 0, dTail = 0;  // deque[dHead..dTail)

    for (let i = 0; i < len; i++) {
        // Remove elements outside the window from front
        while (dHead < dTail && deque[dHead % len] < i - radius) dHead++;
        // Remove elements smaller than current from back
        while (dHead < dTail && src[srcOff + deque[(dTail - 1) % len]] <= src[srcOff + i]) dTail--;
        deque[dTail % len] = i;
        dTail++;

        // Start writing once we've filled the left side of the window
        if (i >= radius) {
            dst[dstOff + i - radius] = src[srcOff + deque[dHead % len]];
        }
    }
    // Drain remaining (right edge: window shrinks)
    for (let i = len; i < len + radius; i++) {
        while (dHead < dTail && deque[dHead % len] < i - radius) dHead++;
        dst[dstOff + i - radius] = src[srcOff + deque[dHead % len]];
    }
}

// ─────────────────────────────────────────────────────────────────────
// Sphere-aware separable box blur (3 passes ≈ Gaussian).
// Same latitude-corrected horizontal radius as max-pool.
// ─────────────────────────────────────────────────────────────────────

function gaussianBlurSphereAware(field, pw, ph, px0, py0, width, height, radiusKm, passes) {
    const PI = Math.PI;
    const kmPerPixY = PI * EARTH_R / height;
    const radiusY = Math.max(1, Math.round(radiusKm / kmPerPixY));

    const tmp = new Float32Array(pw * ph);

    for (let pass = 0; pass < passes; pass++) {
        const src = (pass % 2 === 0) ? field : tmp;
        const dst = (pass % 2 === 0) ? tmp : field;

        // Horizontal pass
        for (let row = 0; row < ph; row++) {
            const imgY = py0 + (ph - 1 - row);
            const lat = PI * (0.5 - imgY / height);
            const cosLat = Math.abs(Math.cos(lat)) || 0.01;
            const kmPerPixX = TWO_PI_R * cosLat / width;
            const radiusX = Math.min(Math.max(1, Math.round(radiusKm / kmPerPixX)), pw);
            boxBlurRow(src, row * pw, pw, radiusX, dst, row * pw);
        }

        // Vertical pass (use dst from horizontal as source)
        const colIn  = new Float32Array(ph);
        const colOut = new Float32Array(ph);
        const vSrc = dst;
        const vDst = src;  // ping-pong back
        for (let col = 0; col < pw; col++) {
            for (let row = 0; row < ph; row++) colIn[row] = vSrc[row * pw + col];
            boxBlurRow(colIn, 0, ph, radiusY, colOut, 0);
            for (let row = 0; row < ph; row++) vDst[row * pw + col] = colOut[row];
        }

        // After H+V, result is in vDst = src (if pass even, that's `field`)
        // Copy to field if needed so next pass reads from field
        if (vDst !== field) {
            field.set(vDst);
        }
    }
}

// O(n) box blur (running sum) for a single row/column
function boxBlurRow(src, srcOff, len, radius, dst, dstOff) {
    const diam = 2 * radius + 1;
    let sum = 0;

    // Seed: sum the initial window (clamped at left edge)
    for (let i = -radius; i <= radius; i++) {
        sum += src[srcOff + Math.max(0, Math.min(len - 1, i))];
    }
    dst[dstOff] = sum / diam;

    for (let i = 1; i < len; i++) {
        // Add new right element, remove old left element
        const addIdx = Math.min(len - 1, i + radius);
        const remIdx = Math.max(0, i - radius - 1);
        sum += src[srcOff + addIdx] - src[srcOff + remIdx];
        dst[dstOff + i] = sum / diam;
    }
}

// ── Main export ─────────────────────────────────────────────────────

export function applyNoiseHeightmap(floatPixels, pw, ph, px0, py0, width, height, seed) {
    const numSeed = typeof seed === 'number' ? seed : hashSeed(String(seed));

    const snWarp  = new SimplexNoise(numSeed + 1);
    const snQuiet = new SimplexNoise(numSeed + 9);   // lowland quieting mask
    const snVlo   = new SimplexNoise(numSeed + 8);
    const snLo    = new SimplexNoise(numSeed + 2);
    const snMid   = new SimplexNoise(numSeed + 3);
    const snHi    = new SimplexNoise(numSeed + 4);
    const snRidge = new SimplexNoise(numSeed + 5);
    const snRough = new SimplexNoise(numSeed + 6);
    const snB7    = new SimplexNoise(numSeed + 7);

    const PI = Math.PI;
    const TWO_PI = 2 * PI;
    const kmPerPixY = PI * EARTH_R / height;

    // ════════════════════════════════════════════════════════════════
    // Pass 0: Decode heights
    // ════════════════════════════════════════════════════════════════
    const hKm = new Float32Array(pw * ph);
    for (let i = 0; i < pw * ph; i++) {
        hKm[i] = tToHeightKm(floatPixels[i * 4]);
    }

    // ════════════════════════════════════════════════════════════════
    // Pass 1: Compute raw amplitude factors per pixel
    // ════════════════════════════════════════════════════════════════
    const rawElevFactor  = new Float32Array(pw * ph);
    const rawSlopeFactor = new Float32Array(pw * ph);

    for (let row = 0; row < ph; row++) {
        const imgY = py0 + (ph - 1 - row);
        const lat = PI * (0.5 - imgY / height);
        const cosLat = Math.cos(lat);
        const kmPerPixX = TWO_PI_R / width * cosLat;
        const invKmX = 1.0 / (kmPerPixX || 0.001);

        for (let col = 0; col < pw; col++) {
            const idx = row * pw + col;
            const h = hKm[idx];
            if (h <= 0) continue;

            // Elevation factor: lowlands ~15%, peaks 100%
            rawElevFactor[idx] = 0.15 + 0.85 * smoothstep(0, 4.0, h);

            // Slope
            const left  = col > 0      ? hKm[idx - 1]  : h;
            const right = col < pw - 1 ? hKm[idx + 1]  : h;
            const up    = row > 0      ? hKm[idx - pw]  : h;
            const down  = row < ph - 1 ? hKm[idx + pw]  : h;
            const dhDx = (right - left) * 0.5 * invKmX;
            const dhDy = (down - up)    * 0.5 / kmPerPixY;
            const slope = Math.sqrt(dhDx * dhDx + dhDy * dhDy);

            // Slope factor: gentle → 0, steep → 1
            rawSlopeFactor[idx] = smoothstep(0.08, 0.5, slope);
        }
    }

    // ════════════════════════════════════════════════════════════════
    // Pass 2: Max-pool then Gaussian-blur both factor fields
    //         (sphere-aware: latitude-corrected horizontal radii)
    // ════════════════════════════════════════════════════════════════
    const smoothElevFactor  = new Float32Array(rawElevFactor);
    const smoothSlopeFactor = new Float32Array(rawSlopeFactor);

    maxPoolSphereAware(smoothElevFactor,  pw, ph, px0, py0, width, height, POOL_RADIUS_KM);
    maxPoolSphereAware(smoothSlopeFactor, pw, ph, px0, py0, width, height, POOL_RADIUS_KM);

    gaussianBlurSphereAware(smoothElevFactor,  pw, ph, px0, py0, width, height, BLUR_RADIUS_KM, 3);
    gaussianBlurSphereAware(smoothSlopeFactor, pw, ph, px0, py0, width, height, BLUR_RADIUS_KM, 3);

    // ════════════════════════════════════════════════════════════════
    // Pass 3: Compute and apply noise using smoothed factors
    // ════════════════════════════════════════════════════════════════
    for (let row = 0; row < ph; row++) {
        const imgY = py0 + (ph - 1 - row);
        const lat = PI * (0.5 - imgY / height);
        const cosLat = Math.cos(lat);
        const sinLat = Math.sin(lat);
        const kmPerPixX = TWO_PI_R / width * cosLat;
        const invKmX = 1.0 / (kmPerPixX || 0.001);

        for (let col = 0; col < pw; col++) {
            const idx = row * pw + col;
            const h = hKm[idx];
            if (h <= 0) continue;

            // Read smoothed amplitude factors
            const elevF  = smoothElevFactor[idx];
            const slopeF = smoothSlopeFactor[idx];

            const imgX = px0 + col;
            const lon = TWO_PI * (imgX / width - 0.5);
            const sx = cosLat * Math.sin(lon);
            const sy = sinLat;
            const sz = cosLat * Math.cos(lon);

            // ── Raw slope & gradient (still needed for anisotropy direction) ──
            const left  = col > 0      ? hKm[idx - 1]  : h;
            const right = col < pw - 1 ? hKm[idx + 1]  : h;
            const up    = row > 0      ? hKm[idx - pw]  : h;
            const down  = row < ph - 1 ? hKm[idx + pw]  : h;
            const dhDx = (right - left) * 0.5 * invKmX;
            const dhDy = (down - up)    * 0.5 / kmPerPixY;
            const slope = Math.sqrt(dhDx * dhDx + dhDy * dhDy);

            // ── Domain warp ─────────────────────────────────────────
            const wcf = WARP_CONTINENTAL_FREQ;
            const wx1 = snWarp.noise3D(sx * wcf,       sy * wcf,       sz * wcf)       * WARP_CONTINENTAL_AMP;
            const wy1 = snWarp.noise3D(sx * wcf + 100, sy * wcf + 100, sz * wcf + 100) * WARP_CONTINENTAL_AMP;
            const wz1 = snWarp.noise3D(sx * wcf + 200, sy * wcf + 200, sz * wcf + 200) * WARP_CONTINENTAL_AMP;

            const wrf = WARP_REGIONAL_FREQ;
            const wx2 = snWarp.noise3D(sx * wrf + 300, sy * wrf + 300, sz * wrf + 300) * WARP_REGIONAL_AMP;
            const wy2 = snWarp.noise3D(sx * wrf + 400, sy * wrf + 400, sz * wrf + 400) * WARP_REGIONAL_AMP;
            const wz2 = snWarp.noise3D(sx * wrf + 500, sy * wrf + 500, sz * wrf + 500) * WARP_REGIONAL_AMP;

            const wx = sx + wx1 + wx2;
            const wy = sy + wy1 + wy2;
            const wz = sz + wz1 + wz2;

            // ── Sphere tangent basis (for anisotropy direction) ─────
            const cosLon = Math.cos(lon);
            const sinLon = Math.sin(lon);
            const ex =  cosLon, ey = 0,      ez = -sinLon;
            const nx = -sinLat * sinLon, ny = cosLat, nz = -sinLat * cosLon;

            const gradLen = slope || 1e-6;
            const gx = dhDx / gradLen;
            const gy = -dhDy / gradLen;

            const along_x = gx * ex + gy * nx;
            const along_y = gx * ey + gy * ny;
            const along_z = gx * ez + gy * nz;
            const perp_x  = -gy * ex + gx * nx;
            const perp_y  = -gy * ey + gx * ny;
            const perp_z  = -gy * ez + gx * nz;

            // Anisotropy blend uses the SMOOTHED slope factor (not raw slope)
            // so directional stretching also spreads smoothly into surroundings
            const anisoBlend = smoothstep(0, 0.5, slopeF);

            function anisoCoords(freq) {
                if (anisoBlend < 0.01) {
                    return [wx * freq, wy * freq, wz * freq];
                }
                const ix = wx * freq, iy = wy * freq, iz = wz * freq;
                const sqz = 1.0 + (ANISO_SQUEEZE - 1.0) * anisoBlend;
                const str = 1.0 + (ANISO_STRETCH - 1.0) * anisoBlend;
                const ax = (along_x * sqz + perp_x * str) * freq;
                const ay = (along_y * sqz + perp_y * str) * freq;
                const az = (along_z * sqz + perp_z * str) * freq;
                const b = anisoBlend;
                return [ix * (1 - b) + ax * b, iy * (1 - b) + ay * b, iz * (1 - b) + az * b];
            }

            // ── Lowland quieting mask ────────────────────────────────
            // Very low frequency 3D noise that creates continental-scale
            // patches of "quiet" lowlands (flat plains) vs "active"
            // lowlands (rolling hills).  Fades to 1.0 at high elevations
            // so mountains are always fully detailed.
            let quietMask = 1.0;
            {
                const quietRaw = fbm(snQuiet,
                    wx * QUIET_FREQ, wy * QUIET_FREQ, wz * QUIET_FREQ,
                    QUIET_OCTAVES, QUIET_PERSIST);
                // Map [-1,1] → [QUIET_FLOOR, 1.0]
                const quietVal = QUIET_FLOOR + (1.0 - QUIET_FLOOR) * (quietRaw * 0.5 + 0.5);
                // Blend toward 1.0 as elevation rises — no suppression on mountains
                const elevBypass = smoothstep(0, QUIET_ELEV_FULL, h);
                quietMask = quietVal + (1.0 - quietVal) * elevBypass;
            }

            // ── Noise layers (all scaled by smoothed factors) ───────

            // Very-low-frequency: isotropic, no bias
            const vloVal = fbm(snVlo, wx * VLO_FREQ, wy * VLO_FREQ, wz * VLO_FREQ,
                              VLO_OCTAVES, VLO_PERSIST);
            const deltaVlo = vloVal * VLO_AMP * (0.5 + 0.5 * elevF);

            // Low-frequency: isotropic, mild bias
            const loVal = fbm(snLo, wx * LO_FREQ, wy * LO_FREQ, wz * LO_FREQ,
                             LO_OCTAVES, LO_PERSIST);
            const deltaLo = (loVal + BIAS * 0.3) * LO_AMP * (0.5 + 0.5 * elevF);

            // Mid-frequency: anisotropic
            const [mx, my, mz] = anisoCoords(MID_FREQ);
            const midVal = fbm(snMid, mx, my, mz, MID_OCTAVES, MID_PERSIST);
            const deltaMid = (midVal + BIAS) * elevF * MID_AMP;

            // High-frequency: anisotropic
            const [hx, hy, hz] = anisoCoords(HI_FREQ);
            const hiVal = fbm(snHi, hx, hy, hz, HI_OCTAVES, HI_PERSIST);
            const deltaHi = (hiVal + BIAS) * elevF * HI_AMP;

            // Ridge noise (mountains): uses smoothed elevF for blend
            let deltaRidge = 0;
            {
                const ridgeBlend = smoothstep(0, 1, (elevF - 0.5) / 0.5);
                if (ridgeBlend > 0.01) {
                    const [rx, ry, rz] = anisoCoords(RIDGE_FREQ);
                    const ridgeVal = snRidge.ridgedFbm(rx, ry, rz,
                        RIDGE_OCTAVES, 2.0, 0.5, 1.0);
                    const centered = ridgeVal - 0.42;
                    deltaRidge = centered * ridgeBlend * RIDGE_AMP;
                }
            }

            // Slope-dependent roughness: uses smoothed slopeF
            const [rrx, rry, rrz] = anisoCoords(ROUGH_FREQ);
            const roughVal = fbm(snRough, rrx, rry, rrz, ROUGH_OCTAVES, ROUGH_PERSIST);
            const deltaRough = roughVal * slopeF * ROUGH_AMP;

            // Sedimentary layering (flat plateaus): uses raw slope for flatness
            let deltaB7 = 0;
            if (h > B7_ELEV_MIN && slope < B7_FLAT_SLOPE * 5) {
                const flatness = 1 - smoothstep(B7_FLAT_SLOPE, B7_FLAT_SLOPE * 5, slope);
                const elevBlend = smoothstep(B7_ELEV_MIN, B7_ELEV_MIN + 0.5, h);
                const perturbation = snB7.noise3D(wx * 200, wy * 200, wz * 200) * 0.15;
                const bandCoord = (h + perturbation) / B7_BAND_SPACING;
                const layerVal = Math.sin(bandCoord * TWO_PI);
                const ampVar = 0.7 + 0.3 * (snB7.noise3D(wx * 50, wy * 50, wz * 50) * 0.5 + 0.5);
                deltaB7 = layerVal * 0.5 * flatness * flatness * elevBlend * B7_AMP * ampVar;
            }

            // ── Combine all layers, apply quieting mask ─────────────
            let totalDelta = (deltaVlo + deltaLo + deltaMid + deltaHi + deltaRidge + deltaRough + deltaB7) * quietMask;

            // ── Erosion carving: uses smoothed factors ──────────────
            // Amplifies negative noise where smoothed elevation and slope
            // are high — carves deep valleys across whole mountain regions,
            // not just at individual steep pixels.
            if (totalDelta < 0) {
                const carveFromElev  = Math.min(elevF * 4.0 * CARVE_ELEV_SCALE, 1.0);
                const carveFromSlope = Math.min(slopeF * CARVE_SLOPE_SCALE, 0.8);
                const carveFactor = 1.0 + carveFromElev + carveFromSlope;
                totalDelta *= Math.min(carveFactor, CARVE_MAX);
            }

            const newH = Math.max(0.001, h + totalDelta);
            floatPixels[idx * 4] = Math.max(0, Math.min(1, heightKmToT(newH)));
        }
    }

}

// ── Helpers ─────────────────────────────────────────────────────────

function fbm(sn, x, y, z, octaves, persistence) {
    let sum = 0, max = 0, amp = 1;
    for (let o = 0; o < octaves; o++) {
        const f = 1 << o;
        sum += amp * sn.noise3D(x * f, y * f, z * f);
        max += amp;
        amp *= persistence;
    }
    return sum / max;
}

function hashSeed(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
}
