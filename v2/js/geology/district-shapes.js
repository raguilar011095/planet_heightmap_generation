// District shapes (plans/V2_DEPOSITS_LOOK_PLAN.md D0): how a deposit system's permissive ground breaks into districts —
// the noise underneath every deposit, made to look the way real mineral districts are spaced rather than one round blob
// of one size:
//   · CLUSTERS OF CLUSTERS — a multiplicative cascade: a province octave × the system's own octave × a finer one, each
//     (1 + α·noise). Thresholded at the system's share, it gives a few big districts and many small ones gathered round
//     them — the fractal, lognormal spacing of real deposits (Carlson 1991; Agterberg's multifractals), not one size. The
//     finer octave also sets the grade inside a district (its rich cores);
//   · DRAWN OUT ALONG THE GRAIN — each octave's noise read with the local structure's across-coordinate ψ (km) added to
//     one of its axes, so it varies faster across the grain than along it: lenses and chains along a belt's strike (ψ the
//     distance across the belt, as the Rocks map's fold stripes read it), a shield's trend (its craton's axis), elsewhere
//     a slowly turning grain of its own. Where two grains meet their noises are blended, never their coordinates;
//   · LINEAMENTS — fault corridors as the zero lines of a noise: a set along the grain (shear zones, for the systems a
//     shear hosts) and a crosscutting set where districts gather (transverse faults across a belt);
//   · BENT AND LOBED — the position warped (two scales) before any of it is read, so outlines wander, lobe and fork —
//     lobed here, contorted there (a slow field of its own picks, regions mostly one or the other, not the middle);
//   · SMALL HERE, LARGER THERE — every system's districts at two spacings (the small and the medium end of
//     `districtScaleRange`), a slow field picking between them, crossfaded where regions meet (two noises blended, never
//     one noise's scale bent — that would swirl);
//   · REGIONS DIFFER — a slow field sets how lumpy each region is: here a few rich districts, there many poor ones;
//   · COUPLED BY ASSOCIATION — the province, the crosscutting lineaments and the lumpiness are each a system's
//     ASSOCIATION's own (porphyry, epithermal and skarn copper-gold together, MVT and SEDEX lead-zinc, oil, gas and bitumen,
//     the laterites…; a system of no association its own), shared with every other only by `coupling` (the correlation
//     between two associations' fields: 1 one field for all, 0 none) — a copper province is not a lead-zinc one.
// The slow fields — the warp and the regions' picks (on a lattice as fine as the deposits' grid), each association's
// province, lineaments and lumpiness (on a 1° lattice: they vary over 650–2200 km) — are made at the lattice's nodes and
// read between them, not at every cell. Each system's thresholds are calibrated on the sphere (a Fibonacci lattice: no
// random stream), so its share of the ground holds whatever its recipe — once for the settings (with a seed of its own:
// a noise's spread is the same whatever its seed), kept for every world after; today's settings' are kept in
// district-thresholds.js (v2/tools/calibrate-districts.mjs makes it), so no finish spends the time — other settings are
// calibrated on first use. Its own noise stream; every length in km — the same at every detail.

import { FastNoise } from '../core/fast-noise.js';
import { DISTRICT_THRESHOLDS } from './district-thresholds.js';

const R = 6371, RAD = Math.PI / 180;
// (the most a noise3D gives, either way — 0.968 at most over 30 million places; a little more for safety: at() skips a
// system's finer noises where even their most could not lift it past its threshold, exactly as if it had read them)
const NOISE_MAX = 1.05, SAFE = 1 + 1e-9;
const CALIBRATION_SEED = 0x5eed, CALIBRATION_GRID = 1;
/** Thresholds by settings (the systems and the shapes' config): calibrated once, kept. */
const calibrated = new Map();
/** The settings' key: a hash of the shapes' config and the systems' spacings, shares, recipes and associations. */
export function calibrationKey(systems, S) {
    const text = JSON.stringify([S, systems.map(d => [d.L, d.share, d.recipe, d.assoc ?? null])]);
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return `${(h >>> 0).toString(16)}-${text.length}`;
}
/** Each system's thresholds [t0, t1, tr] for these settings, calibrated afresh. */
export function calibrateDistricts(systems, S) {
    return new DistrictShapes(CALIBRATION_SEED, systems, S, CALIBRATION_GRID, true).sys.map(s => [s.t0, s.t1, s.tr]);
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Nodes every `step`° of latitude and longitude (the poles' rows included), each node's `per` values made by `fill` the
 *  first time it is read; `corners` gives a place's four nodes and their bilinear weights. */
class Lattice {
    constructor(step, per, fill) {
        this.step = step; this.w = Math.round(360 / step); this.h = Math.round(180 / step) + 1; this.per = per; this.fill = fill;
        this.slot = new Int32Array(this.w * this.h).fill(-1); this.data = new Float32Array(per * 1024); this.used = 0;
    }
    node(j, i) {
        const k = j * this.w + i;
        let s = this.slot[k];
        if (s < 0) {
            s = this.slot[k] = this.used++;
            if ((s + 1) * this.per > this.data.length) { const d = new Float32Array(2 * this.data.length); d.set(this.data); this.data = d; }
            const la = (90 - j * this.step) * RAD, lo = (-180 + i * this.step) * RAD, cl = Math.cos(la);
            this.fill(cl * Math.cos(lo), cl * Math.sin(lo), Math.sin(la), this.data, s * this.per, s);
        }
        return s;
    }
    corners(lat, lon, slots, wts) {
        const fy = (90 - lat) / this.step, j = Math.min(this.h - 2, Math.max(0, Math.floor(fy))), ty = Math.min(1, Math.max(0, fy - j));
        const fx = (lon + 180) / this.step, i0f = Math.floor(fx), tx = fx - i0f, i0 = ((i0f % this.w) + this.w) % this.w, i1 = (i0 + 1) % this.w;
        slots[0] = this.node(j, i0); slots[1] = this.node(j, i1); slots[2] = this.node(j + 1, i0); slots[3] = this.node(j + 1, i1);
        wts[0] = (1 - tx) * (1 - ty); wts[1] = tx * (1 - ty); wts[2] = (1 - tx) * ty; wts[3] = tx * ty;
    }
}

export class DistrictShapes {
    /**
     * @param {number} seed
     * @param {{L: number, share: number, recipe: Object, assoc: string}[]} systems  each system's district spacing (km), its
     *   share of its permissive ground, its recipe ({stretch, alpha, prov, cross, shear}: deposits.shapes.recipes) and its
     *   association (null: its own)
     * @param {Object} S  GEOLOGY.deposits.shapes
     * @param {number} gridDeg  the deposits' grid (°): the warp's lattice as fine
     * @param {boolean} calibrating  (this is the calibration's own: its thresholds made here)
     */
    constructor(seed, systems, S, gridDeg = 0.25, calibrating = false) {
        const n = this.nz = new FastNoise(((seed | 0) * 0x2f3b + 0x91) >>> 0);
        this.S = S;
        const warpF = S.warpKm.map(k => R / k), warpA = S.warpAmpKm.map(k => k / R), warpB = (S.warpAmpMaxKm ?? S.warpAmpKm).map(k => k / R);
        const V = R / S.varyKm, e = S.varyEdge, bgF = R / S.grainBgKm;
        this.provF = R / S.provinceKm; this.charF = R / S.characterKm; this.crossF = R / S.crossKm;
        // (the associations: each its own province, lineaments and lumpiness, coupled to the rest by S.coupling)
        const assocs = new Map();
        const assocOf = (d, i) => { const key = d.assoc ?? `own${i}`; if (!assocs.has(key)) assocs.set(key, assocs.size); return assocs.get(key); };
        const rho = Math.min(1, Math.max(0, S.coupling ?? 1));
        const kg = this.kg = Math.sqrt(rho), ka = this.ka = Math.sqrt(1 - rho);
        const [lo, hi] = (S.districtScaleRange ?? [1, 1]).map(k => k * (S.districtScale ?? 1));
        this.sys = systems.map((d, i) => {
            const r = d.recipe, fA = R / (d.L * lo), fB = R / (d.L * hi);
            return { fA, fB, fiA: fA * S.octaveRatio, fiB: fB * S.octaveRatio, c: Math.sqrt(Math.max(0, r.stretch * r.stretch - 1)), alpha: r.alpha, prov: r.prov, cross: r.cross,
                shear: r.shear, shearFA: fA / S.shearSpacing, shearFB: fB / S.shearSpacing, shearC: Math.sqrt(S.shearStretch * S.shearStretch - 1), off: 17.31 * (i + 1), share: d.share,
                t0: 0, t1: 0, tr: 1, inner: 0, as: assocOf(d, i),
                // (the most its province, lineaments and shear zones could make of it: at()'s bound)
                kMax: (1 + r.prov * (kg + ka) * NOISE_MAX) * (r.cross ? 1 + r.cross : 1) * (r.shear ? 1 + 1.2 * r.shear : 1) * SAFE, shMax: r.shear ? 1 + 1.2 * r.shear : 1 };
        });
        const nA = this.nA = assocs.size;
        this.aOff = Float64Array.from({ length: nA }, (_, a) => 101.7 * (a + 1));
        /** The warp at a place: lobed or contorted by its region, at two scales — its displacement into out[o…o+2]. */
        const warp = (x, y, z, out, o) => {
            const tw = smooth(-e, e, n.noise3D(x * V + 4.4, y * V + 8.3, z * V + 1.2)), [f1, f2] = warpF;
            const a1 = warpA[0] + (warpB[0] - warpA[0]) * tw, a2 = warpA[1] + (warpB[1] - warpA[1]) * tw;
            out[o] = a1 * n.noise3D(x * f1 + 3.1, y * f1 + 7.7, z * f1 + 1.9) + a2 * n.noise3D(x * f2 + 9.4, y * f2 + 2.2, z * f2 + 5.6);
            out[o + 1] = a1 * n.noise3D(x * f1 + 4.8, y * f1 + 0.3, z * f1 + 8.1) + a2 * n.noise3D(x * f2 + 1.3, y * f2 + 6.5, z * f2 + 3.4);
            out[o + 2] = a1 * n.noise3D(x * f1 + 6.6, y * f1 + 5.2, z * f1 + 4.4) + a2 * n.noise3D(x * f2 + 8.8, y * f2 + 4.1, z * f2 + 7.3);
        };
        // the fine lattice: the warp, the region's pick between the small and the medium spacing, the background grain's ψ
        this.fine = new Lattice(gridDeg, 5, (x, y, z, d, o) => {
            warp(x, y, z, d, o);
            d[o + 3] = smooth(-e, e, n.noise3D(x * V + 6.2, y * V + 0.8, z * V + 9.7));
            d[o + 4] = S.grainBgAmpKm * n.noise3D(x * bgF + 7.1, y * bgF + 3.9, z * bgF + 6.3);
        });
        // the coarse lattice: the node's warped position and the fields every association shares as far as `coupling` says
        // — how lumpy a region is, the province octave, the crosscutting lineaments' noise; each association's own, × √(1 −
        // coupling), made beside them when first asked (assocNode)
        const wp = new Float64Array(3);
        this.coarse = new Lattice(Math.max(1, gridDeg), 6, (x, y, z, d, o) => {
            warp(x, y, z, wp, 0);
            const wx = x + wp[0], wy = y + wp[1], wz = z + wp[2];
            d[o] = wx; d[o + 1] = wy; d[o + 2] = wz;
            d[o + 3] = kg > 0 ? kg * n.noise3D(wx * this.charF + 2.7, wy * this.charF + 9.9, wz * this.charF + 0.4) : 0;
            d[o + 4] = kg > 0 ? kg * n.noise3D(wx * this.provF + 3.3, wy * this.provF - 1.7, wz * this.provF + 0.7) : 0;
            d[o + 5] = kg > 0 ? kg * n.noise3D(wx * this.crossF + 5.5, wy * this.crossF + 0.9, wz * this.crossF + 2.6) : 0;
        });
        this.aData = new Float32Array(3 * nA * 1024); this.aDone = new Uint8Array(nA * 1024);
        // (the cell in hand: its corners on both lattices, its warped position, its pick of spacing (weights cos and sin
        // of a quarter turn — the blend's spread the same as either's), its grains — up to three [ψ km, weight] — and its
        // associations' fields, each read when first asked)
        this.fs = new Int32Array(4); this.fw = new Float64Array(4); this.cs = new Int32Array(4); this.cw = new Float64Array(4);
        this.wx = 0; this.wy = 0; this.wz = 0; this.wA = 1; this.wB = 0; this.bound = NOISE_MAX;
        this.psi = new Float64Array(3); this.w = new Float64Array(3); this.ng = 0; this.norm = 1;
        this.aPv = new Float64Array(nA); this.aCr = new Float64Array(nA); this.aLump = new Float64Array(nA); this.stamp = 0;
        this.atCr = new Int32Array(nA).fill(-1); this.atLump = new Int32Array(nA).fill(-1);
        // (the thresholds: the settings' own, calibrated once)
        if (calibrating) { this.calibrate(); return; }
        const key = calibrationKey(systems, S);
        let T = calibrated.get(key);
        if (!T) calibrated.set(key, T = DISTRICT_THRESHOLDS.key === key ? DISTRICT_THRESHOLDS.thresholds : calibrateDistricts(systems, S));
        this.sys.forEach((s, k) => { [s.t0, s.t1, s.tr] = T[k]; });
    }

    /** The cell at unit position (x, y, z), at latitude and longitude (°); its grains: a belt's across-distance psiB (km)
     *  by weight wB, a shield's psiC by wC; the rest a grain of its own. */
    cell(x, y, z, lat, lon, psiB = 0, wB = 0, psiC = 0, wC = 0) {
        this.x = x; this.y = y; this.z = z; this.lat = lat; this.lon = lon; this.pB = psiB; this.wB0 = wB; this.pC = psiC; this.wC0 = wC;
        this.ready = false; this.stamp++;
    }
    /** The cell's shared parts, made the first time a system there asks (most cells have none). */
    prepare() {
        this.ready = true;
        const { x, y, z, pB: psiB, wB0: wB, pC: psiC, wC0: wC } = this, F = this.fine, d = F.data, s = this.fs, q = this.fw;
        F.corners(this.lat, this.lon, s, q);
        let dx = 0, dy = 0, dz = 0, ts = 0, bg = 0;
        for (let k = 0; k < 4; k++) { const o = 5 * s[k], u = q[k]; dx += u * d[o]; dy += u * d[o + 1]; dz += u * d[o + 2]; ts += u * d[o + 3]; bg += u * d[o + 4]; }
        this.wx = x + dx; this.wy = y + dy; this.wz = z + dz;
        this.wA = Math.cos(0.5 * Math.PI * ts); this.wB = Math.sin(0.5 * Math.PI * ts);
        this.coarse.corners(this.lat, this.lon, this.cs, this.cw);
        // (the grains: a belt's, a shield's, and the rest a slowly turning one of its own)
        let g = 0;
        const wBg = Math.max(0, 1 - wB - wC);
        if (wB > 0.02) { this.psi[g] = psiB; this.w[g++] = wB; }
        if (wC > 0.02) { this.psi[g] = psiC; this.w[g++] = wC; }
        if (wBg > 0.02 || g === 0) { this.psi[g] = bg; this.w[g] = g === 0 ? 1 : wBg; g++; }
        let s2 = 0, s1 = 0;
        for (let j = 0; j < g; j++) { s2 += this.w[j] * this.w[j]; s1 += this.w[j]; }
        this.ng = g; this.norm = 1 / Math.sqrt(s2);
        // (the most scaled() can give here)
        this.bound = (this.wB < 0.03 || this.wA < 0.03 ? 1 : this.wA + this.wB) * (g === 1 ? 1 : s1 * this.norm) * NOISE_MAX;
    }

    /** Association a's three fields at coarse node slot s (its lumpiness, province and lineaments' noise: the shared part
     *  and its own), made when first asked. @returns {number} their offset in aData */
    assocNode(s, a) {
        const k = s * this.nA + a, o = 3 * k;
        if (k >= this.aDone.length) {
            const done = new Uint8Array(2 * Math.max(k + 1, this.aDone.length)); done.set(this.aDone); this.aDone = done;
            const data = new Float32Array(3 * done.length); data.set(this.aData); this.aData = data;
        }
        if (this.aDone[k]) return o;
        this.aDone[k] = 1;
        const C = this.coarse.data, c = 6 * s, wx = C[c], wy = C[c + 1], wz = C[c + 2], n = this.nz, ka = this.ka, ao = this.aOff[a], D = this.aData;
        let lump = C[c + 3], pv = C[c + 4], cr = C[c + 5];
        if (ka > 0) {
            lump += ka * n.noise3D(wx * this.charF + ao, wy * this.charF + 2 * ao, wz * this.charF + 3 * ao);
            pv += ka * n.noise3D(wx * this.provF + 1.3 * ao, wy * this.provF + 0.7 * ao, wz * this.provF + 2.1 * ao);
            cr += ka * n.noise3D(wx * this.crossF + 0.6 * ao, wy * this.crossF + 1.9 * ao, wz * this.crossF + 1.1 * ao);
        }
        D[o] = lump; D[o + 1] = pv; D[o + 2] = cr;
        return o;
    }
    /** Association a's fields at the cell, between its coarse nodes, read once a cell: its lumpiness (the cascade's α ×
     *  1 ± character × it), its province and its lineaments' noise (their band made when first asked: crOf). */
    assocAt(a) {
        this.atLump[a] = this.stamp;
        let l = 0, p = 0, c = 0;
        for (let k = 0; k < 4; k++) { const o = this.assocNode(this.cs[k], a), u = this.cw[k], D = this.aData; l += u * D[o]; p += u * D[o + 1]; c += u * D[o + 2]; }
        this.aLump[a] = 1 + this.S.character * l; this.aPv[a] = p; this.aCr[a] = c;
    }
    lumpOf(a) { if (this.atLump[a] !== this.stamp) this.assocAt(a); return this.aLump[a]; }
    pvOf(a) { if (this.atLump[a] !== this.stamp) this.assocAt(a); return this.aPv[a]; }
    crOf(a) {
        if (this.atLump[a] !== this.stamp) this.assocAt(a);
        if (this.atCr[a] !== this.stamp) {
            // (the crosscutting lineaments: a band about the zero line of a noise, bent with the rest)
            const cw = this.S.crossWidth;
            this.atCr[a] = this.stamp; this.aCr[a] = smooth(1 - cw, 1 - 0.25 * cw, 1 - Math.abs(this.aCr[a]));
        }
        return this.aCr[a];
    }

    /** The cell's warped position (for a spot of its own). */
    warped() { if (!this.ready) this.prepare(); return this; }

    /** Noise at frequency f (per radian), drawn out c-fold faster across the cell's grains, blended where several. */
    grained(f, c, off) {
        const n = this.nz, X = this.wx * f + off, Y = this.wy * f + 2 * off, Z = this.wz * f + 3 * off;
        if (this.ng === 1) return n.noise3D(X, Y, Z + this.psi[0] / R * f * c);
        let s = 0;
        for (let j = 0; j < this.ng; j++) s += this.w[j] * n.noise3D(X + 1.7 * j, Y, Z + this.psi[j] / R * f * c);
        return s * this.norm;
    }

    /** grained() at the cell's spacing: the small one's, the medium one's, or a crossfade of the two (their own noises). */
    scaled(fA, fB, c, off) {
        if (this.wB < 0.03) return this.grained(fA, c, off);
        if (this.wA < 0.03) return this.grained(fB, c, off + 7.7);
        return this.wA * this.grained(fA, c, off) + this.wB * this.grained(fB, c, off + 7.7);
    }

    /** System k's cascade at the cell: its intensity (around 1; thresholded by the calibration); this.inner the finer
     *  octave's noise (the grade inside a district). */
    value(k) {
        if (!this.ready) this.prepare();
        const s = this.sys[k], as = s.as;
        const a = Math.min(0.92, s.alpha * this.lumpOf(as)), ni = this.scaled(s.fiA, s.fiB, s.c, s.off + 5.3);
        let m = (1 + s.prov * this.pvOf(as)) * (1 + a * this.scaled(s.fA, s.fB, s.c, s.off)) * (1 + this.S.innerOutline * a * ni);
        this.inner = ni;
        if (s.cross) m *= 1 + s.cross * this.crOf(as);
        if (s.shear) m *= this.shearOf(s);
        return m;
    }
    /** Shear zones: lines along the grain, the system's districts held to them — its factor at the cell. */
    shearOf(s) {
        const l = 1 - Math.abs(this.scaled(s.shearFA, s.shearFB, s.shearC, s.off + 41.9)), w = this.S.shearWidth;
        return 1 - s.shear + s.shear * 2.2 * smooth(1 - w, 1 - 0.25 * w, l);
    }

    /** System k's districts at the cell, 0…1: soft-edged, mostly middling inside, the richest cores full (the cores where
     *  the finer octave is high too). */
    at(k) {
        // (value()'s, its factors read one by one — the coarse first — and none read once even the most the rest could
        // give (|noise| ≤ NOISE_MAX) leaves it at or under its threshold: the same as value(), multiplied in its order)
        if (!this.ready) this.prepare();
        const s = this.sys[k], as = s.as, t0 = s.t0, B = this.bound, iO = this.S.innerOutline;
        // (the province and the lineaments first — read between the coarse nodes, no noise of the cell's own)
        const a = Math.min(0.92, s.alpha * this.lumpOf(as)), iMax = 1 + iO * a * B, shMax = s.shMax;
        const fP = 1 + s.prov * this.aPv[as], fC = s.cross ? 1 + s.cross * this.crOf(as) : 1;
        if (Math.abs(fP) * (1 + a * B) * fC * shMax * iMax * SAFE <= t0) return 0;
        const fO = 1 + a * this.scaled(s.fA, s.fB, s.c, s.off);
        if (Math.abs(fP * fO) * fC * shMax * iMax * SAFE <= t0) return 0;
        const fS = s.shear ? this.shearOf(s) : 1;
        if (Math.abs(fP * fO) * fC * fS * iMax * SAFE <= t0) return 0;
        const ni = this.scaled(s.fiA, s.fiB, s.c, s.off + 5.3);
        let m = fP * fO * (1 + iO * a * ni);
        if (s.cross) m *= fC;
        if (s.shear) m *= fS;
        this.inner = ni;
        if (!(m > t0)) return 0;
        const core = smooth(s.t1, s.tr, m * (1 + this.S.innerGrade * ni));
        return smooth(t0, s.t1, m) * (0.45 + 0.55 * core * core);
    }

    /** Each system's thresholds: its values over the sphere (a Fibonacci lattice, as a cell sees it with no grain of its
     *  own), the edge between the quantiles that leave 1.35 × and 0.75 × its share above, the rich core its top ~15 %. */
    calibrate() {
        const N = this.S.calibrationPoints, vals = this.sys.map(() => new Float32Array(N)), inner = this.sys.map(() => new Float32Array(N)), ga = Math.PI * (3 - Math.sqrt(5));
        for (let i = 0; i < N; i++) {
            const z = 1 - 2 * (i + 0.5) / N, r = Math.sqrt(1 - z * z), th = ga * i, x = r * Math.cos(th), y = r * Math.sin(th);
            this.cell(x, y, z, Math.asin(z) / RAD, Math.atan2(y, x) / RAD);
            for (let k = 0; k < this.sys.length; k++) { vals[k][i] = this.value(k); inner[k][i] = vals[k][i] * (1 + this.S.innerGrade * this.inner); }
        }
        const q = (a, p) => a[Math.max(0, Math.min(N - 1, Math.round(p * (N - 1))))];
        this.sys.forEach((s, k) => {
            const a = vals[k].sort(), b = inner[k].sort(), sh = Math.min(0.9, Math.max(0.005, s.share));
            s.t0 = q(a, 1 - Math.min(0.97, 1.35 * sh)); s.t1 = q(a, 1 - 0.75 * sh); s.tr = Math.max(s.t1 + 1e-6, q(b, 1 - 0.15 * sh));
        });
    }
}
