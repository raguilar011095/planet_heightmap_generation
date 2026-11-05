// M1–M2 — the continents' inner ranges reshaped (plans/GENERATE_RANGES_PLAN.md; owner, 2026-11-05: "At this detail the
// worm like mountains really bother me … We really need to rethink the shape of those from the ground up … Take some
// inspiration from both the original take on generate, as well as evolution", and "It not just that they are thin, but
// they all look the same and have no variety").
//
// Why they were worms: every range of the continents' past (a piece docking, two cores welding, two pieces of one plate
// closing, a small terrane's welt — present/past.js, present/seams.js) was written cell by cell along its pieces' outline,
// an outline that zigzags at about the range's own width, at one width all along, with one cross-section. So each read as
// a tube winding across the land, and all of them alike.
//
// Now each is a range in its own right:
//   1. its skeleton: the outline taken as a chain and smoothed into a gentle curve — real belts bend in broad arcs and
//      the odd sharp turn, they don't meander. (The original Generate's lesson: the large structure draws the ranges, the
//      small pieces only texture them.)
//   2. its segments: overlapping and stepped en echelon, each swelling toward its middle and tapering to points at its
//      ends — the lens of the Alps, the Caucasus or the Zagros — with a gap now and then, and one segment the massif.
//   3. its style, by what made it and a roll of its own: one of Evolution's own kinds of belt (tectonics/step/orogeny.js
//      spreadBelt and terrain/profiles.js), each with its cross-section, its ridges and its rock — a high spine set back
//      from its suture with a foreland basin before it; a plateau behind a rim range; a broad fold belt of parallel ridges;
//      short basement blocks stepped across the land with basins between; a narrow straight sliver along an oblique seam;
//      a knot of short ridges, a massif.
// The ranges are still where the pieces met: the cause stays the pieces' outlines (G4b); only the shape is the range's.

import { OrogenyType, BeltSide } from '../tectonics/model/crust.js';
import { makeRng } from '../../../js/rng.js';
import { PRESENT } from './present-config.js';

const R = 6371;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const at = (xyz, c) => [xyz[3 * c], xyz[3 * c + 1], xyz[3 * c + 2]];
const kmBetween = (a, b) => R * Math.acos(Math.max(-1, Math.min(1, dot(a, b))));

/** The styles a range can take (present-config.js rangeStyles holds their numbers): the kind of belt it is written as. */
export const RangeStyle = Object.freeze({ SPINE: 'spine', PLATEAU: 'plateau', FOLDS: 'folds', BLOCKS: 'blocks', SLIVER: 'sliver', KNOTS: 'knots' });

/**
 * The chains a set of front cells makes: each connected run of them (cells within two hops of each other count as one
 * run, so a front that skips a cell is not cut) as an ordered path of cells, its longest — and of what is left once
 * that path is taken, any run longer than `minKm` again (a front shaped like a T or a ring gives two or three chains).
 * @returns {number[][]}
 */
export function frontChains(sim, cells, minKm = 300) {
    const { adjOffset, adjList, xyz } = sim, inSet = new Set(cells), out = [];
    const near = (c, f) => {        // (the set's cells within two hops of c)
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
            const nb = adjList[k];
            if (inSet.has(nb)) f(nb);
            for (let j = adjOffset[nb]; j < adjOffset[nb + 1]; j++) { const nn = adjList[j]; if (nn !== c && inSet.has(nn)) f(nn); }
        }
    };
    const kmOf = (a, b) => kmBetween(at(xyz, a), at(xyz, b));
    // the farthest cell from `from` over the set (Dijkstra on km; the sets are small), and the path to it
    const farthest = (from, alive) => {
        const d = new Map([[from, 0]]), prev = new Map(), heap = [[0, from]];
        while (heap.length) {
            let bi = 0;
            for (let i = 1; i < heap.length; i++) if (heap[i][0] < heap[bi][0]) bi = i;
            const [dc, c] = heap[bi]; heap[bi] = heap[heap.length - 1]; heap.pop();
            if (dc > d.get(c)) continue;
            near(c, (nb) => {
                if (!alive.has(nb)) return;
                const nd = dc + kmOf(c, nb);
                if (nd < (d.get(nb) ?? Infinity)) { d.set(nb, nd); prev.set(nb, c); heap.push([nd, nb]); }
            });
        }
        let best = from, bd = 0;
        for (const [c, v] of d) if (v > bd || (v === bd && c < best)) { bd = v; best = c; }
        return { far: best, km: bd, prev, reached: d };
    };
    let alive = new Set([...inSet].sort((a, b) => a - b));
    for (let guard = 0; guard < 8 && alive.size; guard++) {
        const start = Math.min(...alive);
        const a = farthest(start, alive), b = farthest(a.far, alive);
        if (b.km >= minKm || guard === 0) {
            const path = [b.far];
            while (path[path.length - 1] !== a.far) path.push(b.prev.get(path[path.length - 1]));
            if (b.km >= Math.min(minKm, 1)) out.push(path);
            // (what the path takes: its cells and their neighbours in the set)
            const taken = new Set(path);
            for (const c of path) near(c, (nb) => taken.add(nb));
            for (const c of b.reached.keys()) if (taken.has(c)) alive.delete(c);
            // (the rest of this run: next round, as its own run — anything shorter than minKm is let go)
        } else for (const c of b.reached.keys()) alive.delete(c);
        alive = new Set([...alive].sort((x, y) => x - y));
    }
    return out;
}

/**
 * A chain of cells as a smooth curve: its points every `stepKm` along it, then smoothed by a Gaussian of `sigmaKm` along
 * its length (the window shrinking toward the ends, so they stay put). Returns the points (unit vectors) and the length.
 */
export function smoothCurve(xyz, chain, stepKm, sigmaKm) {
    const raw = chain.map(c => at(xyz, c));
    // resample evenly along the chain
    const pts = [raw[0]];
    let carry = 0;
    for (let i = 1; i < raw.length; i++) {
        const a = raw[i - 1], b = raw[i], seg = kmBetween(a, b);
        let s = stepKm - carry;
        while (s <= seg) { const t = s / seg; pts.push(unit([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t])); s += stepKm; }
        carry = seg - (s - stepKm);
    }
    if (kmBetween(pts[pts.length - 1], raw[raw.length - 1]) > 0.3 * stepKm) pts.push(raw[raw.length - 1]);
    const n = pts.length, half = Math.ceil(3 * sigmaKm / stepKm), out = [];
    for (let i = 0; i < n; i++) {
        const w = Math.min(half, i, n - 1 - i);          // (symmetric, shrinking to the ends)
        const s = [0, 0, 0];
        let m = 0;
        for (let j = -w; j <= w; j++) { const g = Math.exp(-0.5 * (j * stepKm / sigmaKm) ** 2), p = pts[i + j]; s[0] += g * p[0]; s[1] += g * p[1]; s[2] += g * p[2]; m += g; }
        out.push(unit(s));
    }
    return { pts: out, km: (n - 1) * stepKm };
}

/** Rotate p about the unit axis k by angle a (Rodrigues). */
function rotateAbout(p, k, a) {
    const c = Math.cos(a), s = Math.sin(a), kx = cross(k, p), kd = dot(k, p);
    return [p[0] * c + kx[0] * s + k[0] * kd * (1 - c), p[1] * c + kx[1] * s + k[1] * kd * (1 - c), p[2] * c + kx[2] * s + k[2] * kd * (1 - c)];
}

/**
 * A range's segments along its curve: lengths drawn from the style's span, each overlapping the one before, turned about
 * its middle by the range's en echelon angle (the same way along the range), set off sideways a little, a gap now and then;
 * each segment's points with how far along it they lie (0…1) and the segment's own strength.
 * @returns {{pts: number[][], t: number[], strength: number, width: number}[]}
 */
export function rangeSegments(curve, style, widthKm, rng) {
    const { pts, km } = curve, step = km / Math.max(1, pts.length - 1), segs = [];
    const [l0, l1] = style.segKm, sign = rng() < 0.5 ? -1 : 1, angle = sign * (style.echelonDeg[0] + (style.echelonDeg[1] - style.echelonDeg[0]) * rng()) * Math.PI / 180;
    // (each segment bowed into an arc, all of a range's the same way — a belt's salients bulge toward its foreland — by up
    // to cfg's bow share of its length at its middle)
    const bowSign = rng() < 0.5 ? -1 : 1, bow = style.bow ?? 0;
    // a short curve: one segment, the whole of it (a knot of a range)
    let s = 0;
    const lengths = [];
    while (s < km) {
        let len = l0 + (l1 - l0) * rng();
        if (km - (s + len * (1 - style.overlap)) < 0.4 * l0) len = Math.max(len, km - s);        // (no stub at the end)
        lengths.push([s, Math.min(km, s + len)]);
        s += len * (1 - style.overlap);
        if (s + 0.4 * l0 >= km) break;
    }
    const massif = lengths.length > 1 ? Math.floor(rng() * lengths.length) : 0;
    lengths.forEach(([a, b], k) => {
        const strength = (k === massif ? style.massif : style.strength[0] + (style.strength[1] - style.strength[0]) * rng());
        const gap = k !== massif && rng() < style.gap;
        const offset = (rng() * 2 - 1) * style.offset * widthKm;
        if (gap) return;
        const i0 = Math.max(0, Math.round(a / step)), i1 = Math.min(pts.length - 1, Math.round(b / step));
        if (i1 - i0 < 1) return;
        const seg = pts.slice(i0, i1 + 1);
        const mid = seg[Math.floor(seg.length / 2)], tan = unit([seg[seg.length - 1][0] - seg[0][0], seg[seg.length - 1][1] - seg[0][1], seg[seg.length - 1][2] - seg[0][2]]);
        const nrm = unit(cross(mid, tan)), segKm = (seg.length - 1) * step, sag = bowSign * bow * segKm * (0.5 + 0.5 * rng());
        const out = seg.map((p, i) => {
            let q = rotateAbout(p, mid, angle);                                   // (en echelon: turned about its middle)
            const o = offset + sag * Math.sin(Math.PI * i / Math.max(1, seg.length - 1));
            q = unit([q[0] + nrm[0] * o / R, q[1] + nrm[1] * o / R, q[2] + nrm[2] * o / R]);
            return q;
        });
        // (polarity: which side of it is the high one — a half-graben's border fault, a tilted block's scarp; it flips from
        // segment to segment as it does across a rift's accommodation zones)
        segs.push({ pts: out, t: out.map((_, i) => (out.length > 1 ? i / (out.length - 1) : 0.5)), strength, width: widthKm * (style.segWidth[0] + (style.segWidth[1] - style.segWidth[0]) * rng()),
            polarity: rng() < 0.5 ? -1 : 1 });
    });
    return segs;
}

/** A lens along a segment (0…1 at t): its width × tipWidth…1, its work × 0…1, its height × tipAmp…1, all fullest at the
 *  middle. (Its height is what shows: a belt's relief barely depends on its work — tectonics/step/heights.js — so a range
 *  rises and falls along its length by spreadBelt's amps.) */
const lensWidth = (t, style) => style.tipWidth + (1 - style.tipWidth) * Math.sin(Math.PI * t) ** style.lensPow;
const lensWork = (t, style) => Math.sin(Math.PI * t) ** style.workPow;
const lensAmp = (t, style) => style.tipAmp + (1 - style.tipAmp) * Math.sin(Math.PI * t) ** style.ampPow;

/**
 * The sources a range's segments give spreadBelt: the sim cells along each segment, each with its width and work (a
 * cell on two segments keeps the wider). Only cells `ok` allows.
 */
export function rasterize(sim, segs, style, workKm, ok, amp = 1) {
    const { xyz } = sim, best = new Map();
    for (const seg of segs) {
        const n = seg.pts.length;
        for (let i = 0; i < n; i++) {
            const p = seg.pts[i], c = sim.index.nearest(p[0], p[1], p[2]);
            if (!ok(c)) continue;
            const t = seg.t[i], w = seg.width * lensWidth(t, style), k = workKm * lensWork(t, style), a = amp * seg.strength * lensAmp(t, style);
            const was = best.get(c);
            if (!was || w > was.w) best.set(c, { w, k: Math.max(k, was?.k ?? 0), a: Math.max(a, was?.a ?? 0), pt: p, seg, i });
            else { was.k = Math.max(was.k, k); was.a = Math.max(was.a, a); }
        }
    }
    const front = [...best.keys()].sort((a, b) => a - b);
    return { front, widths: front.map(c => best.get(c).w), works: front.map(c => best.get(c).k), amps: front.map(c => best.get(c).a), at: best, xyz };
}

/** The left normal (unit, tangent to the sphere) of the segment a raster source lies on, at its point. */
export function normalAt(e) {
    const s = e.seg, i = e.i, a = s.pts[Math.max(0, i - 1)], b = s.pts[Math.min(s.pts.length - 1, i + 1)];
    return unit(cross(e.pt, unit([b[0] - a[0], b[1] - a[1], b[2] - a[2]])));
}

/**
 * Which side of a range each cell near it lies on (+1 left, −1 right, facing along it; 0 unreached): the side of the
 * nearest point of its segments, carried out from its sources over the cells `ok` allows, to `reachKm`.
 */
export function sidesOf(sim, raster, ok, reachKm) {
    const { adjOffset, adjList, xyz } = sim, n = sim.numCells, side = new Int8Array(n), from = new Map(), q = [];
    for (const c of raster.front) {
        const e = raster.at.get(c);
        from.set(c, { pt: e.pt, nrm: normalAt(e), d: 0 }); q.push(c); side[c] = 0;
    }
    for (let h = 0; h < q.length; h++) {
        const c = q[h], f = from.get(c);
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
            const nb = adjList[k];
            if (from.has(nb) || !ok(nb)) continue;
            const p = at(xyz, nb), d = kmBetween(p, f.pt);
            if (d > reachKm) continue;
            from.set(nb, f); q.push(nb);
            side[nb] = dot(p, f.nrm) >= 0 ? 1 : -1;
        }
    }
    return side;
}

/** The style a range takes: by its kind (and, for a weld, how young), a roll on the kind's weights. */
export function styleFor(ev, rng, cfg = PRESENT) {
    const w = ev.kind === 'weld' ? (ev.age < cfg.plateauBelowMyr ? cfg.rangeStyleWeights.weldYoung : cfg.rangeStyleWeights.weld)
        : cfg.rangeStyleWeights[ev.kind] ?? cfg.rangeStyleWeights.ring;
    const keys = Object.keys(w).sort(), total = keys.reduce((s, k) => s + w[k], 0);
    let r = rng() * total;
    for (const k of keys) { r -= w[k]; if (r <= 0) return k; }
    return keys[keys.length - 1];
}

/**
 * A past event reshaped into its range: the parts to write (each a spreadBelt call: its sources, widths and works, its
 * kind of belt, its side and the cells it may reach). The event's own front is kept as `outline` (the weak line the far
 * field finds); `front` becomes the range's sources.
 * @param {Object} sim  the sim mesh   @param {Object} ev  a past event (present/past.js)
 * @param {{source: Function, reach: Function}} ok  a cell may take a source (land of the event's landmass, away from the
 *   coast); the belt may reach a cell   @param {number} widthKm  the range's width (its kind's, from its work)
 * @param {number} seed
 */
export function shapeRange(sim, ev, ok, widthKm, seed, cfg = PRESENT) {
    const rng = makeRng((seed ^ 0x7a6e) + ev.front[0] * 131 + ev.front.length * 7 + Math.round(ev.age));      // (its own draw)
    const styleKey = ev.style ?? styleFor(ev, rng, cfg), style = cfg.rangeStyles[styleKey];
    // (a range's width and work: its kind's × its style's — or, for today's belts, as their fronts built them: ev.asBuilt)
    const width = ev.asBuilt ? widthKm : widthKm * (style.width[0] + (style.width[1] - style.width[0]) * rng());
    const work = ev.asBuilt ? ev.work : ev.work * (style.work[0] + (style.work[1] - style.work[0]) * rng());
    const amp = style.amp[0] + (style.amp[1] - style.amp[0]) * rng();
    const segs = [];
    for (const chain of frontChains(sim, ev.front, cfg.rangeMinKm)) {
        let len = 0;
        for (let i = 1; i < chain.length; i++) len += kmBetween(at(sim.xyz, chain[i - 1]), at(sim.xyz, chain[i]));
        const curve = smoothCurve(sim.xyz, chain, cfg.rangeStepKm, Math.max(cfg.rangeSmoothKm, style.smooth * width, cfg.rangeSmoothShare * len));
        // (a curve too short to hold a range is none: a short front drawn anyway reads as a crater — its ridges, which follow
        // its outline, ring a point; a knot needs its segment's length at least)
        if (curve.km < (styleKey === RangeStyle.KNOTS ? 0.8 * style.segKm[0] : cfg.rangeMinKm)) continue;
        segs.push(...rangeSegments(curve, style, width, rng));
    }
    const raster = rasterize(sim, segs, style, work, ok.source, amp);
    const parts = [];
    if (raster.front.length >= 2) {
        if (style.sides) {
            // two sides of one suture, each its own kind of belt (the spine set back from the suture on the side thrust
            // over; a plateau behind its rim range): which is which, the event's (a weld: the bigger core's side over) or a roll
            const side = sidesOf(sim, raster, ok.reach, 1.2 * width * style.segWidth[1]);
            const upLeft = ev.upper ? (ev.upper(side) >= 0) : rng() < 0.5;
            // (each source to its own side of the curve — the side its cell lies on — so neither side writes the other's
            // sources: a cell on both would take both sides' thickening, a root twice as deep down the range's axis)
            const own = raster.front.map(c => (dot(at(sim.xyz, c), normalAt(raster.at.get(c))) >= 0 ? 1 : -1));
            style.sides.forEach(([type, beltSide, share], j) => {
                if (!share) return;
                const want = (j === 0) === upLeft ? 1 : -1, idx = [];
                raster.front.forEach((c, i) => { if (own[i] === want) idx.push(i); });
                if (idx.length < 2) return;
                parts.push({ type, side: beltSide, front: idx.map(i => raster.front[i]), widths: idx.map(i => raster.widths[i] * share), works: idx.map(i => raster.works[i]),
                    amps: idx.map(i => raster.amps[i]), shear: ev.shear ?? 0, allow: (c) => ok.reach(c) && side[c] !== -want });
            });
        } else parts.push({ type: style.type, side: BeltSide.NONE, front: raster.front, widths: raster.widths, works: raster.works, amps: raster.amps, shear: ev.shear ?? 0, allow: ok.reach });
    }
    return { style: styleKey, parts, segments: segs.length, front: raster.front, works: raster.works, widths: raster.widths, amps: raster.amps, at: raster.at };
}
