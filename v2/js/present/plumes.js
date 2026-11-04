// G5 — plumes and the far field (plans/GENERATE_REDESIGN_PLAN.md §3.2, §3.2b):
//   · mantle plumes fixed under the moving plates: each plate carries away what its plume builds, so a track runs back
//     along the plate's own rotation — the crust now at Rot(ω, t)·plume passed over it t Myr ago — in bursts (one volcano
//     a burst, quiet spells between), each worn since it erupted: islands near the plume, seamounts downstream (Hawaii,
//     then the Emperor chain; Evolution's volcanoes.js drowns them by the floor's age);
//   · a few plume heads' flood basalts (LIPs) on the track at the age the head arrived — on land a levelled lava plateau
//     worn into mesas, at sea an oceanic plateau;
//   · the far field: today's collisions push through their continents and squeeze up an old suture they meet, far
//     inland — an intraplate range (the Tian Shan behind the Tarim block).
// Records only, in the crust raster, in Evolution's own encoding (the terrain reads them as it reads a history's).

import { CrustType, CrustFlag, OrogenyType, VolcanicType } from '../tectonics/model/crust.js';
import { spreadBelt, beltWidthKm } from '../tectonics/step/orogeny.js';
import { spreadPush, lineStrike } from '../tectonics/step/far-field.js';
import { ISLAND_EROSION_KM_PER_MYR } from '../tectonics/measure.js';
import { TERRAIN } from '../terrain/terrain-config.js';
import { makeRng } from '../../../js/rng.js';
import { MinHeap } from '../core/min-heap.js';
import { FastNoise } from '../core/fast-noise.js';
import { Boundary } from './plates.js';
import { PRESENT } from './present-config.js';

const R = 6371;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return l > 1e-15 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]; };
const at = (xyz, c) => [xyz[3 * c], xyz[3 * c + 1], xyz[3 * c + 2]];
const smooth01 = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

/** Rotate unit vector p about axis k (unit) by angle a (Rodrigues). */
function rotate(p, k, a) {
    const c = Math.cos(a), s = Math.sin(a), kd = dot(k, p);
    const kx = [k[1] * p[2] - k[2] * p[1], k[2] * p[0] - k[0] * p[2], k[0] * p[1] - k[1] * p[0]];
    return [p[0] * c + kx[0] * s + k[0] * kd * (1 - c), p[1] * c + kx[1] * s + k[1] * kd * (1 - c), p[2] * c + kx[2] * s + k[2] * kd * (1 - c)];
}

/**
 * @param {Object} L  the layout   @param {Object} W  the plates   @param {Uint8Array} land  land per sim cell (as drawn)
 * @param {import('../tectonics/model/crust.js').CrustRaster} crust
 * @returns {{plumes: Object[]}}
 */
export function presentPlumes(L, W, land, crust, cfg = PRESENT) {
    const { sim, xyz, seed } = L, n = sim.numCells, { adjOffset, adjList } = sim;
    const rng = makeRng((seed ^ 0x9105) >>> 0), lrng = makeRng((seed ^ 0x11b5) >>> 0), brng = makeRng((seed ^ 0xb057) >>> 0);
    const cellOf = (p) => sim.index.nearest(p[2], p[0], p[1]);               // (Generate's frame → the index's z-up)
    const count = cfg.plumeCount[0] + Math.floor(rng() * (cfg.plumeCount[1] - cfg.plumeCount[0] + 1));
    const plumes = [];
    for (let tries = 0; plumes.length < count && tries < 400; tries++) {
        const z = 2 * rng() - 1, th = 2 * Math.PI * rng(), r = Math.sqrt(1 - z * z), p = [r * Math.cos(th), z, r * Math.sin(th)];
        const c = cellOf(p);
        // plumes rise more often under continents (the mantle they insulate), but not only there
        if (rng() > (land[c] ? 1 : cfg.plumeOceanWeight)) continue;
        if (plumes.some(q => R * Math.acos(Math.min(1, dot(q.p, p))) < cfg.plumeApartKm)) continue;
        plumes.push({ id: plumes.length, p, cell: c, plate: W.cellPlate[c], strength: 0.6 + 0.8 * rng() });
    }
    const lipBudget = cfg.lipCount[0] + Math.floor(lrng() * (cfg.lipCount[1] - cfg.lipCount[0] + 1));
    let lips = 0;
    for (const pl of plumes) {
        const w = W.plates[pl.plate].euler, wl = Math.hypot(w[0], w[1], w[2]);
        if (!(wl > 0)) continue;
        const k = [w[0] / wl, w[1] / wl, w[2] / wl];
        // ── the track: back along the plate's motion, while it is still on that plate ──
        let t = 0, burstEnd = 0, quietEnd = 0;
        const dt = cfg.trackStepMyr;
        while (t <= cfg.trackMyr) {
            const x = rotate(pl.p, k, wl * t), c = cellOf(x);
            if (W.cellPlate[c] !== pl.plate) break;
            // a burst (one volcano) or a quiet spell, on its own stream
            if (t >= quietEnd && t >= burstEnd) {
                const dur = cfg.burstMyr[0] + (cfg.burstMyr[1] - cfg.burstMyr[0]) * brng();
                burstEnd = t + dur; quietEnd = burstEnd + cfg.quietMyr[0] + (cfg.quietMyr[1] - cfg.quietMyr[0]) * brng();
                const mid = t + 0.5 * dur, xc = rotate(pl.p, k, wl * mid);
                const height = Math.min(cfg.trackMaxKm, cfg.trackBuildKmPerMyr * pl.strength * dur * (0.5 + 0.9 * brng()));
                stampDisc(xc, cfg.volcanoRadiusKm, (cc) => {
                    if (crust.volcKm[cc] < height || crust.volcType[cc] !== VolcanicType.TRACK) {
                        crust.volcType[cc] = VolcanicType.TRACK; crust.volcAt[cc] = -mid; crust.volcKm[cc] = height; crust.volcSource[cc] = pl.id + 1;
                        crust.volcWornKm[cc] = ISLAND_EROSION_KM_PER_MYR * Math.max(0, mid - cfg.activeMyr);
                    }
                });
            }
            // the swell the track sits on (no edifice: under a seamount's height)
            stampDisc(x, cfg.trackRibbonKm, (cc) => {
                if (crust.volcType[cc]) return;
                crust.volcType[cc] = VolcanicType.TRACK; crust.volcAt[cc] = -t; crust.volcKm[cc] = 0.3 * pl.strength; crust.volcSource[cc] = pl.id + 1;
            });
            t += dt;
        }
        // ── a plume head's flood basalt, somewhere back along the track (or under the plume, if the track is short) ──
        if (lips < lipBudget && lrng() < cfg.lipChance) {
            const age = Math.min(Math.max(cfg.lipAgeMyr[0], t * lrng()), cfg.lipAgeMyr[1]);
            const x = rotate(pl.p, k, wl * Math.min(age, t));
            const area = cfg.lipAreaKm2[0] * Math.exp(Math.log(cfg.lipAreaKm2[1] / cfg.lipAreaKm2[0]) * lrng());
            const r0 = Math.sqrt(area / Math.PI), noise = new FastNoise((seed ^ (0x1d0 + pl.id)) >>> 0);
            const lobes = [lrng(), lrng(), lrng()].map(v => 2 * Math.PI * v);
            let cells = 0;
            stampDisc(x, 1.6 * r0, (cc) => {
                const q = at(xyz, cc), d = R * Math.acos(Math.min(1, dot(q, x)));
                // a lobed, ragged outline (flows running out in a few directions)
                const tq = unit([q[0] - x[0], q[1] - x[1], q[2] - x[2]]), ref = unit([-x[2], 0, x[0]]), ang = Math.atan2(dot(tq, unit([x[1] * ref[2] - x[2] * ref[1], x[2] * ref[0] - x[0] * ref[2], x[0] * ref[1] - x[1] * ref[0]])), dot(tq, ref));
                let lobe = 0; for (const l of lobes) lobe += Math.max(0, Math.cos(ang - l)) ** 3;
                const edge = r0 * (0.75 + 0.45 * lobe + 0.25 * noise.noise3D(q[0] * 6, q[1] * 6, q[2] * 6));
                if (d > edge) return;
                crust.volcType[cc] = VolcanicType.LIP; crust.volcAt[cc] = -age; crust.volcKm[cc] = cfg.lipThicknessKm; crust.volcSource[cc] = pl.id + 1;
                crust.volcWornKm[cc] = crust.type[cc] === CrustType.OCEAN ? 0 : (TERRAIN.lipWearKmPerMyr ?? 0.004) * age;
                crust.flags[cc] |= CrustFlag.LIP;
                cells++;
            });
            if (cells) { lips++; pl.lip = { age, areaKm2: area, cells }; }
        }
        pl.trackMyr = t;
    }
    return { plumes };

    /** Every cell within r km of point x (a breadth-first walk from its nearest cell). */
    function stampDisc(x, rKm, fn) {
        const c0 = cellOf(x), seen = new Set([c0]), q = [c0], cosR = Math.cos(rKm / R);
        for (let h = 0; h < q.length; h++) {
            const c = q[h];
            if (dot(at(xyz, c), x) < cosR) continue;
            fn(c);
            for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const nb = adjList[k]; if (!seen.has(nb)) { seen.add(nb); q.push(nb); } }
        }
    }
}

/**
 * The far field (G4d; owner, 2026-11-04: "more long range impacts from the major plates on interiors"): each of today's
 * fronts pushes through its plate — a collision with the shortening it absorbs, a fast, strongly coupled subduction coast
 * and a flat slab with a share of their belts' work (present/belts.js pushes) — spread as Evolution's history spreads it
 * (tectonics/step/far-field.js spreadPush: a craton passes it on, a weak line soaks it up, fading over farReachKm), and
 * recorded: the grain and the lithosphere's folds the terrain draws across the interiors, along the fronts. And where the
 * push lands square on an old weak line far inland — a past suture, a terrane's seam, not in a craton, long quiet — the
 * line is squeezed up again: an intraplate range (the Tian Shan behind the Tarim block, the Ancestral Rockies), the
 * strongest few a planet, each along its own length (records only: an INTRAPLATE belt, no root of its own).
 */
export function presentFarField(L, W, B, land, crust, config, cfg = PRESENT, pushes = []) {
    const { sim, seed } = L, n = sim.numCells, { adjOffset, adjList } = sim;
    const ranges = [];
    const conf = { ...config, farReachKm: cfg.farPushReachKm };
    const world = { config: conf, mesh: sim };
    // the strongest push reaching each cell, how far it came and from which front cell
    const inc = new Float32Array(n), dist = new Float32Array(n).fill(Infinity), from = new Int32Array(n).fill(-1);
    const masks = new Map();
    const maskOf = (p) => { if (!masks.has(p)) { const m = new Uint8Array(n); for (let c = 0; c < n; c++) if (W.cellPlate[c] === p) m[c] = 1; masks.set(p, m); } return masks.get(p); };
    for (const push of pushes) {
        const proxy = { mask: maskOf(push.plate), type: crust.type, flags: crust.flags, farWork: crust.farWork, farDist: crust.farDist, farFold: crust.farFold, farAt: crust.farAt, farDx: crust.farDx, farDy: crust.farDy, farDz: crust.farDz };
        const r = spreadPush(world, { crust: proxy }, push.cells, push.frontKm, 0);
        for (let i = 0; i < r.cells.length; i++) {
            const c = r.cells[i];
            if (r.inc[i] > inc[c]) { inc[c] = r.inc[i]; dist[c] = r.dist[i]; from[c] = r.from[i]; }
        }
    }
    // the old weak lines it stirs: how hard it meets each, square-on, from farNearKm of its front on
    const take = new Float32Array(n), cand = new Uint8Array(n);
    for (let c = 0; c < n; c++) {
        if (!land[c] || !(inc[c] > 0) || !(crust.flags[c] & CrustFlag.SUTURE) || crust.type[c] === CrustType.CRATON) continue;
        if (crust.oroType[c] && crust.oroLast[c] > -cfg.farQuietMyr) continue;     // (a live belt is no weak line)
        const far = smooth01((dist[c] - conf.farNearKm) / conf.farNearKm);
        if (!(far > 0)) continue;
        let square = 1;
        const s = from[c], t = s >= 0 && s !== c ? lineStrike(crust, sim, c) : null;
        if (t) {
            const p = at(sim.xyz, c), q = at(sim.xyz, s), k = dot(p, q), a = [k * p[0] - q[0], k * p[1] - q[1], k * p[2] - q[2]], l = Math.hypot(...a) || 1;
            const along = (a[0] * t[0] + a[1] * t[1] + a[2] * t[2]) / l;
            square = 1 - along * along;
        }
        take[c] = inc[c] * square * far;
        if (take[c] >= cfg.farMinPushKm) cand[c] = 1;
    }
    const seen = new Uint8Array(n), pieces = [];
    for (let s = 0; s < n; s++) {
        if (!cand[s] || seen[s]) continue;
        const comp = [s]; seen[s] = 1;
        for (let q = 0; q < comp.length; q++) for (let k = adjOffset[comp[q]]; k < adjOffset[comp[q] + 1]; k++) { const nb = adjList[k]; if (cand[nb] && !seen[nb]) { seen[nb] = 1; comp.push(nb); } }
        if (comp.length < cfg.farMinCells) continue;
        pieces.push({ comp, score: comp.reduce((a, c) => a + take[c], 0) });
    }
    pieces.sort((a, b) => b.score - a.score || a.comp[0] - b.comp[0]);
    const noise = new FastNoise((seed ^ 0xfa2f) >>> 0);
    for (const p of pieces.slice(0, cfg.farRanges)) {
        // (each along its own length: rising and falling, pinched out here and there)
        const off = 7.3 * (p.comp[0] % 997);
        const works = p.comp.map(c => {
            const pt = at(L.xyz, c), f = 6371 / cfg.farVaryKm, v = Math.min(1, Math.max(0, 0.5 + 0.8 * noise.noise3D(pt[0] * f + off, pt[1] * f - off, pt[2] * f)));
            return cfg.farWorkKm * Math.tanh(take[c] / cfg.farPushRefKm) * (v < 0.15 ? 0 : 0.35 + 1.1 * (v - 0.15) / 0.85);
        });
        const widths = works.map(w => Math.min(config.belts.ural.maxKm, beltWidthKm('ural', Math.max(1, w), 3, config)));
        spreadBelt({ crust }, sim, p.comp, { type: OrogenyType.INTRAPLATE, time: 0, widths, works, widthKm: 0, workKm: 0, noRoot: true }, config, (c) => land[c]);
        for (let c = 0; c < n; c++) if (crust.oroType[c] === OrogenyType.INTRAPLATE && crust.oroLast[c] === 0 && crust.oroStart[c] === 0) crust.oroStart[c] = -cfg.farActiveMyr;
        let d = 0; for (const c of p.comp) d += dist[c];
        ranges.push({ cells: p.comp.length, distKm: Math.round(d / p.comp.length), push: Math.round(p.score / p.comp.length) });
    }
    let pushed = 0, landN = 0; for (let c = 0; c < n; c++) if (land[c]) { landN++; if (crust.farWork[c] > 20) pushed++; }
    return { ranges, pushes: pushes.length, pushedShare: landN ? pushed / landN : 0 };
}
