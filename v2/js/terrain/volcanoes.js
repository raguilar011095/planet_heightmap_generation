// Volcanoes on the terrain: hotspot islands and seamounts along their tracks, the chain of an island arc, and the
// stratovolcanoes along an active Andean range. Sites are placed per sim cell from the records (the sim cell is far
// bigger than a volcano) and stamped onto the terrain mesh wherever it is fine enough to show them.
// A volcano is not an oval (developer: "more ridgey and irregularly shaped"). Each has:
//   · a central edifice with an irregular outline (its own coordinates warped by smooth noise, and lobed), drawn out a
//     little along its long axis;
//   · ARMS — broad ridges running out from the summit, staying high along their length: a hotspot shield's rift zones (two or three, like Mauna Loa's or
//     El Hierro's three-armed star; they reach far down the flanks), an arc or Andean volcano's ridge along the arc;
//     flank vents (satellites) stand out along them;
//   · gullies cut into the lower flanks, wandering, deeper the longer it has eroded (the ribbed flanks of an old stratovolcano,
//     the amphitheatre valleys of Tahiti or Kauai) — faded where the terrain mesh is too coarse to show them;
//   · sometimes a flank-collapse amphitheatre open to one side (El Golfo, Mount St Helens).
// A hotspot edifice stands on the sea floor: its top is that floor plus its height, and where its footprint reaches
// higher ground (a coast beside it) it only adds what rises above that ground. An eroding volcano also spreads — wider,
// lower, rounder — as before. Every volcano draws its shape from the stream
// of the crust cell it stands on and sits where that crust is now (anchor.js), so it keeps its shape as its plate moves.

import { CrustType, CrustFlag, VolcanicType, OrogenyType } from '../tectonics/model/crust.js';
import { ISLAND_EROSION_KM_PER_MYR, SEAMOUNT_KM, seaDepthKm } from '../tectonics/measure.js';
import { kindType } from './records.js';
import { nearLists } from './near-lists.js';
import { cellRng, crustSites } from './anchor.js';
import { FastNoise } from '../core/fast-noise.js';

const R = 6371, TAU = 2 * Math.PI, MAX_ARMS = 3;
/** The noise that shapes the cones' outlines (a plan sent to another worker leaves it out, and it is made again there). */
export const volcanoNoise = seed => new FastNoise(seed * 41 + 7);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// per-volcano shape record (Float32, STRIDE per volcano)
const LOBES = 0, ARM_COUNT = 8, ARMS = 9, RIBS = 21, RIB_DEPTH = 29, COLLAPSE = 30, WOBBLE = 33, NOISE = 34, STRIDE = 36;
const SALT = { hotspot: 101, arc: 102, andean: 103 };
/** (for the checks) a volcano's shape record is VOLCANO_STRIDE floats of V.shape; slot VOLCANO_WEAR_SLOT changes as it wears */
export const VOLCANO_STRIDE = STRIDE, VOLCANO_WEAR_SLOT = RIB_DEPTH;
/** A rounded max(a, b) of non-negative heights (an 8-norm): no crease where an arm meets the edifice, and 0 stays 0. */
const smoothMax = (a, b) => { if (a <= 0 || b <= 0) return Math.max(a, b); const m = Math.max(a, b), x = a / m, y = b / m; return m * (x ** 8 + y ** 8) ** 0.125; };

export function buildVolcanoes(frame, rec, simMesh, cfg, seed, anchor, edgeKm) {
    const { xyz, numCells } = simMesh, time = frame.time, { cell, mats } = anchor;
    const homes = [], pos = [], height = [], radius = [], rounded = [], axis = [], aspect = [], shape = [], reach = [], ribFade = [], crust = [], plate = [], base = [];
    const between = (rng, [lo, hi]) => lo + (hi - lo) * rng();

    // one volcano at world position (x, y, z), long axis `e` (a unit tangent there), shape drawn from `rng`
    const place = (w, rc, rng, x, y, z, e, h, r, f, kind, floorKm, armsFrom) => {
        const a = 1 + cfg.coneElongation[kind] * rng(), sa = Math.sqrt(a), s = new Float32Array(STRIDE);
        for (let i = 0; i < 3; i++) { s[LOBES + i] = cfg.coneLobes * rng(); s[LOBES + 3 + i] = rng() * TAU; }
        s[LOBES + 6] = cfg.coneLobesFine * rng(); s[LOBES + 7] = rng() * TAU;
        // the arms: a shield's rift zones spread round it (a star, irregularly); an arc volcano's run along the arc
        const [lo, hi] = armsFrom ?? cfg.coneArms[kind], count = Math.min(MAX_ARMS, lo + Math.floor(rng() * (hi - lo + 1)));
        const start = rng() * TAU;
        s[ARM_COUNT] = count;
        for (let i = 0; i < count; i++) {
            const angle = kind === 'hotspot' ? start + TAU * i / count + (rng() * 2 - 1) * 0.5 : (i % 2) * Math.PI + (rng() * 2 - 1) * 0.35;
            s[ARMS + 4 * i] = angle; s[ARMS + 4 * i + 1] = between(rng, cfg.coneArmLength[kind]);
            s[ARMS + 4 * i + 2] = between(rng, cfg.coneArmWidth); s[ARMS + 4 * i + 3] = between(rng, cfg.coneArmHeight);
        }
        // the gullies: about N round the volcano, irregularly spaced, bending a little down the flank
        const N = Math.round(between(rng, cfg.coneRibCount));
        s[RIBS] = N; s[RIBS + 1] = rng() * TAU; s[RIBS + 2] = 0.6 + 0.8 * rng(); s[RIBS + 3] = rng() * TAU;
        s[RIBS + 4] = 0.4 + 0.6 * rng(); s[RIBS + 5] = rng() * TAU; s[RIBS + 6] = 0.5 + rng(); s[RIBS + 7] = rng() * TAU;
        s[RIB_DEPTH] = cfg.coneRibs.young + (cfg.coneRibs.worn - cfg.coneRibs.young) * f;
        if (rng() < cfg.coneCollapse[kind]) { s[COLLAPSE] = rng() * TAU; s[COLLAPSE + 1] = 0.35 + 0.35 * rng(); s[COLLAPSE + 2] = between(rng, cfg.coneCollapseDepth); }
        s[WOBBLE] = rng() * TAU; s[NOISE] = rng() * 200; s[NOISE + 1] = rng() * 200;
        let far = 1 + s[LOBES] + s[LOBES + 1] + s[LOBES + 2] + s[LOBES + 6] + cfg.coneWarp;
        for (let i = 0; i < count; i++) far = Math.max(far, s[ARMS + 4 * i + 1] + 2.5 * s[ARMS + 4 * i + 2] + cfg.coneWarp);
        homes.push(w); crust.push(rc); plate.push(anchor.owner[w]); base.push(floorKm); pos.push(x, y, z); height.push(h); radius.push(r); rounded.push(f); axis.push(e[0], e[1], e[2]); aspect.push(a);
        for (let i = 0; i < STRIDE; i++) shape.push(s[i]);
        reach.push(r * sa * far);
        ribFade.push(smooth(cfg.minWavesPerCell, cfg.fullWavesPerCell, TAU * 0.6 * r / N / edgeKm));
        return { s, sa };
    };

    // a volcano on the crust of world cell w: where that crust is now (anchor.home, plus jitter drawn in the plate's
    // frame), its long axis along `along` (a world tangent: the strike) turned a little, or any way (in the plate's frame)
    // (floorKm: the height of the sea floor a hotspot edifice stands on, or NaN — it stands on whatever is under it)
    const add = (w, rc, rng, jitterKm, h, r, ageMyr, along, kind, worn = false, floorKm = NaN) => {
        const f = 1 - Math.exp(-Math.max(0, ageMyr) * (worn ? 1 : rec.erosion[w]) / cfg.coneSpreadMyr);
        h *= 1 - cfg.coneSettle * f; r *= 1 + cfg.coneSpread * f;
        const o = anchor.owner[w], b = 9 * Math.max(0, o), M = o >= 0 ? mats : IDENTITY, mb = o >= 0 ? b : 0;
        const toWorld = (v) => [M[mb] * v[0] + M[mb + 1] * v[1] + M[mb + 2] * v[2], M[mb + 3] * v[0] + M[mb + 4] * v[1] + M[mb + 5] * v[2], M[mb + 6] * v[0] + M[mb + 7] * v[1] + M[mb + 8] * v[2]];
        const j = jitterKm / R;
        const local = unit([xyz[3 * rc] + (rng() * 2 - 1) * j, xyz[3 * rc + 1] + (rng() * 2 - 1) * j, xyz[3 * rc + 2] + (rng() * 2 - 1) * j]);
        const c = unit(toWorld(local));
        let e;
        if (along) {
            e = tangent(c, along);
            const turn = (rng() * 2 - 1) * 0.35;
            e = rotateAbout(c, e, turn);
        } else {
            const e1 = tangent(local, Math.abs(local[2]) < 0.9 ? [-local[1], local[0], 0] : [1, 0, 0]), e2 = cross(local, e1), phi = rng() * TAU;
            e = unit(toWorld([Math.cos(phi) * e1[0] + Math.sin(phi) * e2[0], Math.cos(phi) * e1[1] + Math.sin(phi) * e2[1], Math.cos(phi) * e1[2] + Math.sin(phi) * e2[2]]));
        }
        const { s, sa } = place(w, rc, rng, c[0], c[1], c[2], e, h, r, f, kind, floorKm);
        // flank vents, smaller: out along an arm (a rift zone's cones), or on the long axis
        if (rng() < cfg.coneSatellites[kind]) {
            const count = rng() < 0.4 ? 2 : 1, q = cross(c, e);
            for (let i = 0; i < count; i++) {
                const arms = s[ARM_COUNT];
                let ang, along2;
                if (arms > 0) { const k = Math.floor(rng() * arms); ang = s[ARMS + 4 * k]; along2 = (0.45 + 0.4 * rng()) * s[ARMS + 4 * k + 1]; }
                else { ang = rng() < 0.5 ? 0 : Math.PI; along2 = 0.45 + 0.4 * rng(); }
                const da = Math.cos(ang) * along2 * r * sa / R, db = Math.sin(ang) * along2 * r / sa / R;
                const sc = unit([c[0] + da * e[0] + db * q[0], c[1] + da * e[1] + db * q[1], c[2] + da * e[2] + db * q[2]]);
                const outward = tangent(sc, [da * e[0] + db * q[0], da * e[1] + db * q[1], da * e[2] + db * q[2]]);
                place(w, rc, rng, sc[0], sc[1], sc[2], outward, h * (0.4 + 0.3 * rng()), r * (0.45 + 0.2 * rng()), f, kind, floorKm, [0, 1]);
            }
        }
    };
    // the strike of the belt at a sim cell (the direction its ridges run), or null
    const strikeAt = w => {
        const ax = rec.across[3 * w], ay = rec.across[3 * w + 1], az = rec.across[3 * w + 2];
        if (!(ax || ay || az)) return null;
        const x = xyz[3 * w], y = xyz[3 * w + 1], z = xyz[3 * w + 2];
        return [y * az - z * ay, z * ax - x * az, x * ay - y * ax];
    };
    // per CRUST cell (anchor.js crustSites): a moving plate keeps the same volcanoes frame after frame — none lost where
    // the world grid skips a crust cell, none doubled where it lands on one twice
    crustSites(anchor, simMesh, w => frame.owner[w] >= 0, (w, rc) => {
        const type = frame.type[w];
        // a hotspot track at sea: the edifice, worn down since it last erupted (the floor under it deepens by itself)
        if (frame.volcType[w] === VolcanicType.TRACK && type === CrustType.OCEAN && frame.volcKm[w] >= SEAMOUNT_KM) {
            // (worn down step by step through the history, at the latitudes it passed: tectonics/step/heights.js)
            const h = frame.volcKm[w] - frame.volcWornKm[w], floor = -seaDepthKm(Math.max(0, time - frame.formedAt[w]));
            if (h >= 0.4) add(w, rc, cellRng(seed, rc, SALT.hotspot), 25, h, 25 + 25 * Math.sqrt(h), frame.volcWornKm[w] / ISLAND_EROSION_KM_PER_MYR, null, 'hotspot', true, floor);
        }
        // an island arc: a chain of cones on the arc ridge — small, close islands when young, bigger ones when mature
        // (its belt reads ARC, or ANDEAN where the arc itself overrides the trench: either way an arc's volcanic front)
        const onArc = type === CrustType.ARC && !(frame.flags[w] & CrustFlag.MARGIN_ISLE);
        if (onArc && (frame.oroType[w] === OrogenyType.ARC || frame.oroType[w] === OrogenyType.ANDEAN) && rec.quietMyr[w] < cfg.arcActiveMyr && rec.dKm[w] <= cfg.arcFrontKm) {
            const rng = cellRng(seed, rc, SALT.arc), m = Math.min(1, Math.max(0, (time - frame.formedAt[w]) / cfg.arcMatureMyr));
            // (on a broad arc plateau, only along its front: a narrow chain keeps its volcanoes all along — records.js arcWide)
            const front = cfg.arcVolcanoFarKm > 0 && rec.arcWide ? 1 - rec.arcWide[w] * (1 - smooth(cfg.arcVolcanoFarKm, cfg.arcVolcanoNearKm, rec.frontKm[w])) : 1;
            if (rng() < cfg.arcConeShare * front) {
                const h = (cfg.coneKm.young + (cfg.coneKm.mature - cfg.coneKm.young) * m) * (0.75 + 0.5 * rng());
                const r = (cfg.coneRadiusKm.young + (cfg.coneRadiusKm.mature - cfg.coneRadiusKm.young) * m) * (0.85 + 0.3 * rng());
                add(w, rc, rng, 45, h, r, 10 + 40 * m * rng(), strikeAt(w), 'arc');      // (a mature arc's older volcanoes have spread)
            }
        }
        // stratovolcanoes along the main range of an active Andean belt (none over a flat slab: Laramide belts are
        // their own kind, and silent)
        if (!onArc && rec.kind[w] && kindType(rec.kind[w]) === OrogenyType.ANDEAN && rec.quietMyr[w] < cfg.coneActiveMyr) {
            const W = Math.max(40, rec.reach[w]), centre = Math.max(70, Math.min(260, 0.3 * W)), rng = cellRng(seed, rc, SALT.andean);
            if (Math.abs(rec.dKm[w] - centre) < Math.max(35, 0.07 * W) + 40 && rng() < cfg.andeanConeShare)
                add(w, rc, rng, 35, cfg.coneKm.andean * (0.75 + 0.5 * rng()), cfg.coneRadiusKm.andean * (0.85 + 0.3 * rng()), 20 * rng(), strikeAt(w), 'andean');
        }
    });
    const near = nearLists(simMesh, homes, pos, i => reach[i]);
    return { count: homes.length, pos: Float32Array.from(pos), height: Float32Array.from(height), radius: Float32Array.from(radius), rounded: Float32Array.from(rounded),
        axis: Float32Array.from(axis), aspect: Float32Array.from(aspect), shape: Float32Array.from(shape), reach: Float32Array.from(reach),
        ribFade: Float32Array.from(ribFade), base: Float32Array.from(base), crust: Int32Array.from(crust), plate: Int16Array.from(plate), warp: cfg.coneWarp, noise: volcanoNoise(seed), near };
}

const IDENTITY = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
const unit = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** `v` made tangent to the sphere at unit point p, normalised (any tangent if v is radial). */
function tangent(p, v) {
    const d = v[0] * p[0] + v[1] * p[1] + v[2] * p[2];
    const t = [v[0] - d * p[0], v[1] - d * p[1], v[2] - d * p[2]];
    return Math.hypot(t[0], t[1], t[2]) > 1e-9 ? unit(t) : tangent(p, Math.abs(p[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]);
}
/** Tangent `e` at p turned by `angle` about p (counter-clockwise seen from outside). */
function rotateAbout(p, e, angle) {
    const q = cross(p, e), c = Math.cos(angle), s = Math.sin(angle);
    return [e[0] * c + q[0] * s, e[1] * c + q[1] * s, e[2] * c + q[2] * s];
}

/**
 * How much the volcanoes raise terrain point p (nearest sim cell c0) whose ground stands at `groundKm`: the most any
 * one adds — its height there above what it stands on, or for a hotspot edifice, what its top rises above the ground.
 */
export function coneAt(V, c0, px, py, pz, groundKm = 0) {
    const { offset, items } = V.near, { pos, height, radius, rounded, axis, aspect, shape, reach, ribFade, warp, noise, base } = V;
    let best = 0;
    for (let j = offset[c0]; j < offset[c0 + 1]; j++) {
        const k = items[j], cx = pos[3 * k], cy = pos[3 * k + 1], cz = pos[3 * k + 2], dx = px - cx, dy = py - cy, dz = pz - cz;
        const d2 = dx * dx + dy * dy + dz * dz, rk = reach[k] / R;
        if (d2 >= rk * rk) continue;
        // position in the volcano's own frame (long axis e, short axis q = c × e), in radii, stretched to an ellipse of the same area
        const ex = axis[3 * k], ey = axis[3 * k + 1], ez = axis[3 * k + 2];
        const qx = cy * ez - cz * ey, qy = cz * ex - cx * ez, qz = cx * ey - cy * ex;
        const sa = Math.sqrt(aspect[k]), a0 = (dx * ex + dy * ey + dz * ez) * R / (radius[k] * sa), b0 = (dx * qx + dy * qy + dz * qz) * R * sa / radius[k];
        // an irregular shape: the volcano's own coordinates warped by smooth noise about a radius across
        const S = STRIDE * k, o1 = shape[S + NOISE], o2 = shape[S + NOISE + 1];
        const a = a0 + warp * noise.noise3D(a0 * 0.9 + o1, b0 * 0.9 + o2, 1.7), b = b0 + warp * noise.noise3D(a0 * 0.9 + o2, b0 * 0.9 + o1, 5.3);
        const f = rounded[k], rho = Math.hypot(a, b), th = Math.atan2(b, a);
        // the central edifice: a lobed, ragged outline; concave flanks when young, a rounded shield once eroded
        const outline = 1 + shape[S] * Math.cos(th - shape[S + 3]) + shape[S + 1] * Math.cos(2 * th - shape[S + 4])
            + shape[S + 2] * Math.cos(3 * th - shape[S + 5]) + shape[S + 6] * Math.cos(5 * th - shape[S + 7]);
        const rr = rho / outline;
        let h = rr < 1 ? (1 - f) * (1 - rr) ** 1.7 + f * (1 - rr * rr) ** 2 : 0;
        // the arms: broad ridges out from the summit, staying high, then narrowing and falling to their tips
        const arms = shape[S + ARM_COUNT];
        for (let i = 0; i < arms; i++) {
            const A = S + ARMS + 4 * i, ang = shape[A], len = shape[A + 1];
            const ca = Math.cos(ang), sn = Math.sin(ang), along = a * ca + b * sn;
            if (along >= len) continue;
            // (behind the summit the ridge fades out smoothly: no seam across the volcano)
            const w0 = shape[A + 2] * (1 + 0.5 * f), back = along < 0 ? Math.exp(-((along / (0.6 * w0)) ** 2)) : 1;
            if (back < 0.01) continue;
            const across = b * ca - a * sn, t = Math.max(0, along) / len;
            const width = w0 * (1 - 0.45 * t) * (1 + 0.25 * Math.sin(4 * Math.max(0, along) + shape[S + WOBBLE] + 2 * i));
            const ha = back * shape[A + 3] * (1 - 0.3 * f) * (1 - t) ** 0.8 * Math.exp(-((across / width) ** 2));
            h = smoothMax(h, ha);
        }
        if (h <= 0) continue;
        // gullies in the lower flanks (not near the summit), irregularly spaced, wandering down the flank
        const depth = shape[S + RIB_DEPTH] * ribFade[k];
        if (depth > 0 && rho > 0.25) {
            const phase = shape[S + RIBS] * th + shape[S + RIBS + 1] + shape[S + RIBS + 2] * Math.sin(2 * th + shape[S + RIBS + 3])
                + shape[S + RIBS + 4] * Math.sin(3 * th + shape[S + RIBS + 5]) + shape[S + RIBS + 6] * rho * Math.sin(th + shape[S + RIBS + 7])
                + 1.5 * noise.noise3D(a * 1.4 + o2, b * 1.4 + o1, 9.1);
            const g = 0.5 + 0.5 * Math.cos(phase);
            h *= 1 - depth * smooth(0.25, 0.7, rho) * g * g;
        }
        // a flank collapse: an amphitheatre bitten out of one side
        const cut = shape[S + COLLAPSE + 2];
        if (cut > 0) {
            let dth = th - shape[S + COLLAPSE];
            dth -= TAU * Math.round(dth / TAU);
            const hw = shape[S + COLLAPSE + 1];
            if (Math.abs(dth) < hw) h *= 1 - cut * (1 - (dth / hw) ** 2) * smooth(0.05, 0.45, rho);
        }
        h *= height[k];
        if (!Number.isNaN(base[k])) h = Math.max(0, base[k] + h - groundKm);
        if (h > best) best = h;
    }
    return best;
}
