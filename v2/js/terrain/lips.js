// Flood basalts on land (developer, 8b round 6: LIPs were "just really flat boring ground … not just plateaus that
// ground down"). A province is a stack of flat lava flows — the "trap" of the Deccan and Siberian Traps is Old Norse
// for a stair step. Hard, it lasts (the Drakensberg basalt still stands ~1.4 km thick after 180 Myr, with 0.5–1 km of
// it gone), but it is cut up as it wears, as every old province shows:
//   · the cap goes first where it is weakest (a mesa noise of its own, read in the crust's frame) and from the
//     province's edge inward — an escarpment retreating (the Western Ghats, the Drakensberg) — leaving flat-topped
//     mesas (Ethiopia's ambas), then buttes, then scattered remnants (synthesize.js, from the wear the history recorded);
//   · rivers cut canyons into it with steep walls — a hard cap (Putorana's, 800–1000 m deep; the Blue Nile gorge);
//   · wherever it is cut into it is stepped, flow on flow: flat treads, steep risers (carve.js terraceBasalt, after the
//     rivers — so canyon walls and escarpments are stairs, and the unbroken plateau top is not);
//   · its feeder dykes radiate from the plume's centre far beyond the lavas (the Mackenzie swarm: 2300 km) and show as a
//     faint radial grain wherever erosion has bared them (dykeAt).

import { CrustType, VolcanicType } from '../tectonics/model/crust.js';

const R = 6371;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * The pieces of the provinces on land this frame — one per plume head and plate (a rifted province is two) — each with
 * its centre and a tangent basis there IN ITS PLATE'S FRAME (so the dykes ride with the crust), its radius (of a disc
 * of the same area), and how long ago it erupted. Listed in a fixed order: every worker finds the same.
 */
export function lipPieces(frame, simMesh, A) {
    const { xyz, numCells } = simMesh, m = A.mats, groups = new Map(), cellKm2 = 4 * Math.PI * R * R / numCells;
    for (let w = 0; w < numCells; w++) {
        const o = frame.owner[w];
        if (o < 0 || frame.type[w] === CrustType.OCEAN || frame.volcType[w] !== VolcanicType.LIP) continue;
        const key = frame.volcSource[w] * 4096 + o;
        let g = groups.get(key);
        if (!g) groups.set(key, g = { key, src: frame.volcSource[w], owner: o, x: 0, y: 0, z: 0, n: 0, at: 0 });
        const b = 9 * o, X = xyz[3 * w], Y = xyz[3 * w + 1], Z = xyz[3 * w + 2];
        g.x += m[b] * X + m[b + 3] * Y + m[b + 6] * Z; g.y += m[b + 1] * X + m[b + 4] * Y + m[b + 7] * Z; g.z += m[b + 2] * X + m[b + 5] * Y + m[b + 8] * Z;
        g.n++; g.at += frame.volcAt[w];
    }
    const list = [...groups.values()].filter(g => g.n >= 3).sort((a, b) => a.key - b.key);
    const count = list.length, c = new Float64Array(3 * count), e1 = new Float64Array(3 * count), e2 = new Float64Array(3 * count);
    const rKm = new Float64Array(count), age = new Float64Array(count), owner = new Int32Array(count), salt = new Float64Array(count);
    list.forEach((g, i) => {
        const l = Math.hypot(g.x, g.y, g.z), cx = g.x / l, cy = g.y / l, cz = g.z / l;
        const [rx, ry, rz] = Math.abs(cz) < 0.9 ? [0, 0, 1] : [1, 0, 0];
        let ax = ry * cz - rz * cy, ay = rz * cx - rx * cz, az = rx * cy - ry * cx;
        const al = Math.hypot(ax, ay, az); ax /= al; ay /= al; az /= al;
        c.set([cx, cy, cz], 3 * i); e1.set([ax, ay, az], 3 * i); e2.set([cy * az - cz * ay, cz * ax - cx * az, cx * ay - cy * ax], 3 * i);
        rKm[i] = Math.sqrt(g.n * cellKm2 / Math.PI); age[i] = Math.max(0, frame.time - g.at / g.n); owner[i] = g.owner; salt[i] = (g.src * 7.31) % 97;
    });
    return { count, c, e1, e2, rKm, age, owner, salt };
}

/**
 * The radiating dyke swarm at a point (x, y, z) of plate `owner`'s crust (plate frame): simplex noise read around each
 * piece's centre — fast with the angle, slow with the distance — so its highs and lows run out along the rays, fanning
 * apart as they go (dykeAcrossKm apart at the province's edge). Not a perfect star (developer: "too straight and
 * perfect … not perfectly going out in every direction"): each ray wavers sideways by about dykeWanderKm as it runs,
 * and the swarm comes in fans — a slow noise around the centre leaves some directions with none (the Mackenzie swarm
 * fans through ~100°). Out to dykeReach times the province's radius; bared over the first ~20 Myr as erosion strips
 * what the dykes cut through. Faded where the mesh cannot show it. km, about ± dykeKm (the caller fades it in across
 * the lava's edge).
 */
export function dykeAt(L, owner, x, y, z, noise, fade, cfg) {
    let v = 0;
    for (let i = 0; i < L.count; i++) {
        if (L.owner[i] !== owner) continue;
        const cx = L.c[3 * i], cy = L.c[3 * i + 1], cz = L.c[3 * i + 2], dot = x * cx + y * cy + z * cz, Rp = L.rKm[i];
        const rKm = Math.acos(Math.min(1, Math.max(-1, dot))) * R;
        if (rKm >= cfg.dykeReach * Rp) continue;
        const env = smooth(0.15 * Rp, 0.45 * Rp, rKm) * (1 - smooth(0.55 * cfg.dykeReach * Rp, cfg.dykeReach * Rp, rKm)) * smooth(0, 20, L.age[i]);
        if (env <= 0) continue;
        const tx = x - dot * cx, ty = y - dot * cy, tz = z - dot * cz, s = L.salt[i];
        const a0 = Math.atan2(tx * L.e2[3 * i] + ty * L.e2[3 * i + 1] + tz * L.e2[3 * i + 2], tx * L.e1[3 * i] + ty * L.e1[3 * i + 1] + tz * L.e1[3 * i + 2]);
        const c0 = Math.cos(a0), s0 = Math.sin(a0);
        // (fans: a slow noise around the centre — a handful of lobes — leaves some directions bare)
        const fan = smooth(-0.55, 0.05, noise.noise3D(1.3 * c0 + 3.3 * s, 1.3 * s0 + 1.1 * s, 4.4 + 0.9 * s));
        if (fan <= 0) continue;
        // (each ray wavers: its angle shifted by a noise of the angle and the distance, dykeWanderKm sideways)
        const a = a0 + cfg.dykeWanderKm / Math.max(rKm, 1) * 1.6 * noise.noise3D(4 * c0 + 7.7 * s, 4 * s0 + 2.9 * s, rKm / 350 + 1.3 * s);
        const wave = cfg.dykeAcrossKm / Rp, ca = Math.cos(a), sa = Math.sin(a);
        let n = 0, amp = 1, norm = 0;
        for (let o = 0, f = 1; o < 2; o++, f *= 2) {
            norm += amp;
            const show = fade(1.5 * wave * rKm / f);                // (the dykes' spacing here, against the mesh)
            if (show > 0) n += amp * show * noise.noise3D(ca * f / wave + 5.3 * s + 1.7 * o, sa * f / wave + 2.1 * s, rKm * f / cfg.dykeAlongKm + 0.7 * s);
            amp *= 0.5;
        }
        v += cfg.dykeKm * env * fan * 1.4 * n / norm;
    }
    return v;
}

/**
 * The plume under a young province (developer, 2026-10-27: Ethiopia): the head that erupted it lifts the land around it
 * — a broad dome, lipSwellKm high at its centre, falling off over lipSwellReach times the province's radius, subsiding
 * as the head cools (e-folding over lipSwellTauMyr: the Ethiopian plateau's 2–3 km, the Deccan's long gone) — and builds
 * a few broad shield volcanoes on the lavas near its centre (Simien, Choke, Guna: lipShieldKm high, lipShieldRadiusKm
 * across, the bigger provinces more of them), worn down over lipShieldTauMyr. At a point (x, y, z) of plate `owner`'s
 * crust (plate frame), km, into out: { dome, shield }.
 */
export function lipPlumeAt(L, owner, x, y, z, cfg, out) {
    out.dome = 0; out.shield = 0;
    for (let i = 0; i < L.count; i++) {
        if (L.owner[i] !== owner) continue;
        const cx = L.c[3 * i], cy = L.c[3 * i + 1], cz = L.c[3 * i + 2], dot = x * cx + y * cy + z * cz, Rp = L.rKm[i], age = L.age[i];
        const rKm = Math.acos(Math.min(1, Math.max(-1, dot))) * R;
        if (cfg.lipSwellKm > 0) {
            const reach = cfg.lipSwellReach * Rp;
            if (rKm < 3 * reach) out.dome += cfg.lipSwellKm * Math.exp(-age / cfg.lipSwellTauMyr) * Math.exp(-((rKm / reach) ** 2));
        }
        // (the shields: on a province big enough, near its centre, each placed by the province's own numbers)
        if (cfg.lipShieldKm > 0 && Rp >= cfg.lipShieldMinRadiusKm && rKm < 0.8 * Rp) {
            const H0 = cfg.lipShieldKm * Math.exp(-age / cfg.lipShieldTauMyr);
            if (H0 < 0.01) continue;
            const count = 1 + Math.floor(Math.min(2, (Rp - cfg.lipShieldMinRadiusKm) / 400 + hash(L.salt[i], 9.1) * 1.2));
            for (let k = 0; k < count; k++) {
                const ang = 2 * Math.PI * hash(L.salt[i], 1.3 + 2.7 * k), dist = Rp * (0.12 + 0.33 * hash(L.salt[i], 4.9 + 1.9 * k)) / R;
                const ca = Math.cos(ang), sa = Math.sin(ang), cd = Math.cos(dist), sd = Math.sin(dist);
                const sx = cd * cx + sd * (ca * L.e1[3 * i] + sa * L.e2[3 * i]), sy = cd * cy + sd * (ca * L.e1[3 * i + 1] + sa * L.e2[3 * i + 1]), sz = cd * cz + sd * (ca * L.e1[3 * i + 2] + sa * L.e2[3 * i + 2]);
                const rs = cfg.lipShieldRadiusKm * (0.7 + 0.6 * hash(L.salt[i], 7.7 + 3.1 * k));
                const d = Math.acos(Math.min(1, Math.max(-1, x * sx + y * sy + z * sz))) * R;
                if (d >= rs) continue;
                const u = 1 - (d / rs) ** 2;
                out.shield += H0 * (0.6 + 0.4 * hash(L.salt[i], 2.2 + 5.3 * k)) * u * u;
            }
        }
    }
    return out;
}

/** A number in [0, 1) from a province's salt and a key: the same for every worker. */
const hash = (s, k) => { const v = Math.sin(s * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
