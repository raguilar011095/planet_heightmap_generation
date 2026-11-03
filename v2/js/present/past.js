// G4 — the continents' past, replayed (plans/GENERATE_REDESIGN_PLAN.md §3.2b; owner, 2026-11-02: "interesting mountain
// ranges inside of continents, and … simulate old orogenies").
//
// Each continent is put together by a short sequence of past collisions over a world ~2000 Myr old — replayed as events,
// not drawn as static seams, and not a physics run: every event is a real collision with a time, a front, a convergence
// and a duration, written by the history's own record function (tectonics/step/orogeny.js spreadBelt), oldest first, so
// a younger belt overprints an older one into its prev* layer exactly as in Evolution's history; between events the land
// wears down (uplift, crests and root, each on its own clock), so an ancient orogen is a low, grainy range, a middle-aged
// one still stands (the Urals) and a young one is high.
//   1. Terranes, not pieces: each landmass's craton cores (elongated, with a straight rifted edge or two, kept clear of
//      the coast), and around them accreted terranes in rings, younger outward — their seams wandering through a noise of
//      their own, never along the piece grid.
//   2. The events: cores welding where their growth fronts meet (a major suture: a collision belt, a plateau if young),
//      ring by ring the terranes docking (Ural-type welts), each at its age.
//   3. Swells along the seams (the worn highlands round an old range), lowlands between, the cratons calm.
// Today's belts (present/belts.js) then overprint all of it.

import { CrustType, CrustFlag, OrogenyType, BeltSide } from '../tectonics/model/crust.js';
import { spreadBelt, beltWidthKm } from '../tectonics/step/orogeny.js';
import { makeRng } from '../../../js/rng.js';
import { MinHeap } from '../core/min-heap.js';
import { FastNoise } from '../core/fast-noise.js';
import { PRESENT } from './present-config.js';

const R = 6371;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const at = (xyz, c) => [xyz[3 * c], xyz[3 * c + 1], xyz[3 * c + 2]];

/**
 * Replay the continents' past into the crust raster (before today's belts are written over it).
 * @param {Object} L  the layout   @param {Uint8Array} land  the land per sim cell (the coast as drawn)
 * @param {import('../tectonics/model/crust.js').CrustRaster} crust   @param {Object} config  the tectonic config
 * @returns {{events: Object[], terrane: Int32Array, seamKm: Float32Array, cores: number}}
 */
export function presentPast(L, land, crust, config, cfg = PRESENT) {
    const { sim, xyz, seed } = L, n = sim.numCells, { adjOffset, adjList } = sim;
    const kmOf = (a, b) => R * Math.acos(Math.max(-1, Math.min(1, dot(at(sim.xyz, a), at(sim.xyz, b)))));
    const noise = new FastNoise((seed ^ 0x9a57) >>> 0);
    const nAt = (c, waveKm, off = 0) => { const f = R / waveKm, p = at(xyz, c); return noise.noise3D(p[0] * f + off, p[1] * f - off, p[2] * f + 0.5 * off); };
    const cellKm2 = 4 * Math.PI * R * R / n;

    // distance to the sea (km), over the land
    const toSea = dijkstra(sim, (c) => !land[c], () => true, kmOf);
    // the landmasses
    const mass = new Int32Array(n).fill(-1), masses = [];
    for (let s = 0; s < n; s++) {
        if (!land[s] || mass[s] >= 0) continue;
        const cells = [s]; mass[s] = masses.length;
        for (let q = 0; q < cells.length; q++) for (let k = adjOffset[cells[q]]; k < adjOffset[cells[q] + 1]; k++) { const nb = adjList[k]; if (land[nb] && mass[nb] < 0) { mass[nb] = masses.length; cells.push(nb); } }
        masses.push(cells);
    }

    const terrane = new Int32Array(n), coreOf = new Int32Array(n).fill(-1), ringOf = new Int32Array(n).fill(-1);
    const events = [];
    let nextTerrane = 1, coreCount = 0;
    const seamMajor = new Uint8Array(n), seamRing = new Uint8Array(n);

    masses.forEach((cells, mi) => {
        const areaKm2 = cells.length * cellKm2;
        const rng = makeRng((seed ^ 0x7a57) + mi * 7919);
        if (areaKm2 < cfg.pastMinAreaKm2) {
            // a microcontinent or an island: one young terrane, no history of its own
            const id = nextTerrane++;
            for (const c of cells) terrane[c] = id;
            return;
        }
        // ── 1. craton cores: as many as its size calls for, farthest apart in its interior ──
        const k = Math.max(1, Math.min(cfg.maxCores, Math.round(areaKm2 / cfg.coreAreaKm2)));
        const centres = [];
        for (let i = 0; i < k; i++) {
            let best = -1, bs = -1;
            for (const c of cells) {
                if (toSea[c] < cfg.cratonCoastKm) continue;
                let s = toSea[c];
                for (const o of centres) s = Math.min(s, 0.6 * kmOf(c, o));
                s *= 0.85 + 0.3 * rng();                         // (not always the very deepest interior)
                if (s > bs) { bs = s; best = c; }
            }
            if (best < 0) break;
            centres.push(best);
        }
        if (!centres.length) centres.push(cells.reduce((a, c) => (toSea[c] > toSea[a] ? c : a), cells[0]));
        // each core's shape: an ellipse (aspect 1.2–2.1, its long axis random) cut by a straight rifted edge or two,
        // its size its share of ~cratonShare of the continent; its edge wandering ±cratonEdgeKm
        const weights = centres.map(() => 0.6 + rng()), wsum = weights.reduce((a, b) => a + b, 0);
        const cores = centres.map((c, i) => {
            const p = at(xyz, c), areaCore = cfg.cratonShare * areaKm2 * weights[i] / wsum;
            const aspect = 1.2 + 0.9 * rng(), r = Math.sqrt(areaCore / (Math.PI * aspect));
            // a tangent basis at the centre, turned by a random angle
            const e1 = tangent(p), e2 = crossV(p, e1), th = 2 * Math.PI * rng();
            const ax = [e1[0] * Math.cos(th) + e2[0] * Math.sin(th), e1[1] * Math.cos(th) + e2[1] * Math.sin(th), e1[2] * Math.cos(th) + e2[2] * Math.sin(th)];
            const ay = crossV(p, ax);
            const cuts = [];
            for (let j = 0, m = 1 + Math.floor(rng() * 2); j < m; j++) { const a = 2 * Math.PI * rng(); cuts.push({ dir: [Math.cos(a), Math.sin(a)], at: (0.55 + 0.3 * rng()) * r }); }
            return { centre: c, p, ax, ay, a: r * Math.sqrt(aspect), b: r / Math.sqrt(aspect), cuts, age: cfg.coreAgeMyr[0] + (cfg.coreAgeMyr[1] - cfg.coreAgeMyr[0]) * rng() };
        });
        for (const c of cells) {
            if (toSea[c] < cfg.cratonCoastKm) continue;
            const q = at(xyz, c);
            for (let i = 0; i < cores.length; i++) {
                const K = cores[i], d = [q[0] - K.p[0], q[1] - K.p[1], q[2] - K.p[2]];
                const x = dot(d, K.ax) * R, y = dot(d, K.ay) * R;
                if (dot(q, K.p) < 0) continue;
                let sd = Math.hypot(x / K.a, y / K.b) - 1;            // < 0 inside the ellipse
                for (const cut of K.cuts) sd = Math.max(sd, (x * cut.dir[0] + y * cut.dir[1] - cut.at) / K.b);
                sd += cfg.cratonEdgeKm / K.b * nAt(c, 700, 11 * i);
                if (sd < 0) { crust.type[c] = CrustType.CRATON; coreOf[c] = i; break; }
            }
        }
        // (a core that came out empty — too near the coast everywhere — still seeds its growth at its centre)
        cores.forEach((K, i) => { if (coreOf[K.centre] < 0) coreOf[K.centre] = i; });

        // ── 2. growth: every cell's core (the nearest, through a noise so the seams wander), and how far out from it ──
        const inMass = (c) => mass[c] === mi;
        const lab = new Int32Array(n).fill(-1), dist = new Float64Array(n).fill(Infinity), heap = new MinHeap(1024);
        for (const c of cells) if (coreOf[c] >= 0) { lab[c] = coreOf[c]; dist[c] = 0; heap.push(0, c); }
        while (heap.size) {
            const c = heap.pop(), dc = heap.lastKey;
            if (dc > dist[c]) continue;
            for (let j = adjOffset[c]; j < adjOffset[c + 1]; j++) {
                const nb = adjList[j];
                if (!inMass(nb)) continue;
                const nd = dc + kmOf(c, nb) * (1 + cfg.seamWander * (1 + nAt(nb, cfg.seamWanderKm, 3.3)));
                if (nd < dist[nb]) { dist[nb] = nd; lab[nb] = lab[c]; heap.push(nd, nb); }
            }
        }
        // rings: younger outward, each its own terrane; the craton itself the first
        const ringKm = cfg.ringKm[0] + (cfg.ringKm[1] - cfg.ringKm[0]) * rng();
        const ringStep = cfg.ringStepMyr[0] + (cfg.ringStepMyr[1] - cfg.ringStepMyr[0]) * rng();
        const ids = new Map();
        for (const c of cells) {
            const i = Math.max(0, lab[c]);
            const ring = crust.type[c] === CrustType.CRATON ? 0 : 1 + Math.floor(Math.max(0, dist[c] + cfg.ringWanderKm * nAt(c, 900, 7.7)) / ringKm);
            const key = i * 64 + ring;
            if (!ids.has(key)) ids.set(key, nextTerrane++);
            terrane[c] = ids.get(key); coreOf[c] = i; ringOf[c] = ring;
        }
        coreCount += cores.length;
        // ── the events ──
        // (a) each ring docking onto what was there, at its age: a Ural-type welt along its inner seam
        const maxRing = Math.max(...cells.map(c => ringOf[c]));
        for (let ring = 1; ring <= maxRing; ring++) for (let i = 0; i < cores.length; i++) {
            const age = Math.max(cfg.youngestRingMyr, cores[i].age - ring * ringStep * (0.85 + 0.3 * rng()));
            // a ring docked along the margin that was active then — one side of the core, not all round it (a closed
            // oval of mountains round every craton is the "ring" look the owner disliked in Evolution): only the arc of
            // its seam within ±ringArcDeg/2 of a bearing drawn for it
            const K = cores[i], bearing = 2 * Math.PI * rng(), halfArc = cfg.ringArcDeg * Math.PI / 360;
            const front = [];
            for (const c of cells) {
                // (a seam that runs near today's coast raised no welt there: a passive margin rifted across the old
                // belts, its rim worn and buried under the coastal plain — the welts stand inland)
                if (ringOf[c] !== ring || coreOf[c] !== i || toSea[c] < cfg.pastCoastKm) continue;
                const q = at(xyz, c), d = [q[0] - K.p[0], q[1] - K.p[1], q[2] - K.p[2]];
                let off = Math.atan2(dot(d, K.ay), dot(d, K.ax)) - bearing;
                off = Math.atan2(Math.sin(off), Math.cos(off));
                if (Math.abs(off) > halfArc) continue;
                for (let j = adjOffset[c]; j < adjOffset[c + 1]; j++) { const nb = adjList[j]; if (inMass(nb) && coreOf[nb] === i && ringOf[nb] === ring - 1) { front.push(c); break; } }
            }
            if (front.length < 2) continue;
            for (const c of front) seamRing[c] = 1;
            const work = cfg.ringWorkKm[0] + (cfg.ringWorkKm[1] - cfg.ringWorkKm[0]) * rng();
            events.push({ age, kind: 'ring', type: OrogenyType.URAL, side: BeltSide.NONE, front, work, allow: inMass, strength: 1 });
        }
        // (b) cores welding where their growth fronts meet: the major sutures — the last pair to meet the youngest
        const pairs = new Map();
        for (const c of cells) for (let j = adjOffset[c]; j < adjOffset[c + 1]; j++) {
            const nb = adjList[j];
            if (!inMass(nb) || coreOf[nb] === coreOf[c] || nb < c) continue;
            const key = Math.min(coreOf[c], coreOf[nb]) * 64 + Math.max(coreOf[c], coreOf[nb]);
            if (!pairs.has(key)) pairs.set(key, []);
            pairs.get(key).push(c, nb);
        }
        const pairList = [...pairs.entries()].sort((a, b) => a[0] - b[0]);
        pairList.forEach(([key, seam], j) => {
            const last = j === pairList.length - 1;
            const age = last ? cfg.lastWeldMyr[0] + (cfg.lastWeldMyr[1] - cfg.lastWeldMyr[0]) * rng() : cfg.weldMyr[0] + (cfg.weldMyr[1] - cfg.weldMyr[0]) * rng();
            const work = cfg.weldWorkKm[0] + (cfg.weldWorkKm[1] - cfg.weldWorkKm[0]) * rng();
            for (const c of seam) seamMajor[c] = 1;
            const i0 = Math.floor(key / 64), i1 = key % 64;
            // a young weld of two big blocks raised a plateau on one side (the larger core's) and a foreland on the other
            const plateau = age < cfg.plateauBelowMyr;
            const big = weights[i0] >= weights[i1] ? i0 : i1;
            for (const side of [i0, i1]) {
                const front = [...new Set(seam.filter(c => coreOf[c] === side && toSea[c] >= cfg.pastCoastKm))];
                if (front.length < 2) continue;
                events.push({ age, kind: 'weld', type: plateau ? OrogenyType.HIMALAYAN : OrogenyType.URAL,
                    side: plateau ? (side === big ? BeltSide.UPPER : BeltSide.LOWER) : BeltSide.NONE,
                    front, work, allow: (c) => inMass(c) && coreOf[c] === side, strength: last ? 1 : cfg.innerWeldShare });
            }
        });
    });

    // ── replay, oldest first, the land wearing down between events ──
    events.sort((a, b) => b.age - a.age || a.front[0] - b.front[0]);
    let clock = -Infinity;
    for (const ev of events) {
        const t = -ev.age;
        if (clock > -Infinity) wear(t - clock);
        clock = t;
        for (const c of ev.front) crust.flags[c] |= CrustFlag.SUTURE;
        const kind = ev.type === OrogenyType.HIMALAYAN ? (ev.side === BeltSide.LOWER ? 'foreland' : 'himalayan') : 'ural';
        const work = ev.work * ev.strength;
        const width = Math.min(config.belts[kind].maxKm, beltWidthKm(kind, work, cfg.pastRateCmYr, config));
        spreadBelt({ crust }, sim, ev.front, { type: ev.type, time: t, side: ev.side, widthKm: width, workKm: work }, config, ev.allow);
        // (the event lasted a while: it began this long before its end)
        for (const c of ev.front) if (crust.oroLast[c] === t && crust.oroStart[c] === t) crust.oroStart[c] = t - cfg.pastEventMyr;
    }
    if (clock > -Infinity) wear(0 - clock);

    // ── 3. swells: uplands along the seams (the worn highlands round an old range), lowlands between; cratons calm ──
    const toMajor = dijkstra(sim, (c) => seamMajor[c], (c) => land[c], kmOf), toRing = dijkstra(sim, (c) => seamRing[c], (c) => land[c], kmOf);
    const seamKm = new Float32Array(n);
    for (let c = 0; c < n; c++) {
        if (!land[c]) continue;
        seamKm[c] = Math.min(toMajor[c], toRing[c]);
        const g = (d, s) => (d < Infinity ? Math.exp(-0.5 * (d / s) ** 2) : 0);
        let b = cfg.swellMajorKm * g(toMajor[c], cfg.swellMajorWidthKm) + cfg.swellRingKm * g(toRing[c], cfg.swellRingWidthKm);
        b += cfg.swellNoiseKm * nAt(c, 2200, 21.1) + cfg.swellFloorKm;
        if (crust.type[c] === CrustType.CRATON) b *= 0.5;
        // (and the swells sink toward the coast, under the coastal plain)
        b *= Math.min(1, Math.max(0, (toSea[c] - 0.3 * cfg.pastCoastKm) / cfg.pastCoastKm));
        crust.baseKm[c] = Math.max(0, b);
        crust.terrane[c] = terrane[c];
    }
    return { events, terrane, seamKm, cores: coreCount };

    /** Δt Myr of wear on every record the past laid down (each on its own clock: the belt's uplift, its crests, its root). */
    function wear(dt) {
        if (!(dt > 0)) return;
        const ku = Math.exp(-dt / cfg.wearUpliftMyr), kr = Math.exp(-dt / cfg.wearCrestMyr), kt = Math.exp(-dt / cfg.wearRootMyr);
        for (let c = 0; c < n; c++) {
            if (!crust.oroType[c] && !crust.prevType[c]) continue;
            crust.upliftKm[c] *= ku; crust.rugged[c] *= kr; crust.prevRugged[c] *= kr; crust.rootKm[c] *= kt;
        }
    }
}

/** km from the cells `isSource` marks, over the cells `canEnter` allows. */
function dijkstra(mesh, isSource, canEnter, kmOf) {
    const n = mesh.numCells, { adjOffset, adjList } = mesh, d = new Float64Array(n).fill(Infinity), heap = new MinHeap(4096);
    for (let c = 0; c < n; c++) if (isSource(c)) { d[c] = 0; heap.push(0, c); }
    while (heap.size) {
        const c = heap.pop(), dc = heap.lastKey;
        if (dc > d[c]) continue;
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
            const nb = adjList[k];
            if (!canEnter(nb)) continue;
            const nd = dc + kmOf(c, nb);
            if (nd < d[nb]) { d[nb] = nd; heap.push(nd, nb); }
        }
    }
    return d;
}
function tangent(p) {
    const ref = Math.abs(p[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const t = crossV(ref, p), l = Math.hypot(t[0], t[1], t[2]);
    return [t[0] / l, t[1] / l, t[2] / l];
}
function crossV(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
