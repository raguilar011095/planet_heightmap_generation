// Craton layout for the starting supercontinent: what each craton looks like, how big, and where.
//
// A craton is drawn as a FRAGMENT (plans/V2_START_WORLD_PLAN.md; Bleeker 2003, "a puzzle in ca. 35 pieces": the Archean
// cratons are the rifted pieces of a few earlier supercratons): a body elongated along its own structural grain, with a
// few low lobes, clipped by old rift edges — near-straight lines broken by transform-like offsets. Some come as SIBLINGS
// cut from one parent, their matching edges facing each other across the gap that opened between them, their grain
// parallel. And cratons CLUSTER: a few proto-continents (Laurentia, Baltica, Gondwana…) each hold their cores close
// together, with wider ground between the clusters — where the supercontinent's younger belts and sutures lie.
//
// A block (one craton, or a sibling pair) is drawn in its own tangent frame — azimuthal equidistant, radians, the block's
// centroid at the origin — and placed on the sphere by moving that frame. landmass.js turns the shapes into crust. The
// spacing used here already reserves room for landmass.js's edge noise, so the hard minimum gaps survive shaping.

import { PLANET_RADIUS_KM } from '../../core/sim-mesh.js';
import { angleBetween, bearingTo, capFraction, destination, randomPoint, tangentBasis } from '../../core/sphere-geom.js';

/**
 * @typedef {Object} Craton
 * @property {number} id        1-based; also its terrane id
 * @property {string} letter    A, B, C… (WBP's bookkeeping)
 * @property {number} cluster   the proto-continent it belongs to (0 = the largest)
 * @property {number[]} centre  unit vector: the outline's centroid
 * @property {number} radius    radius of a disc of the same area, radians
 * @property {number} reach     farthest the outline gets from the centre, radians
 * @property {number} inner     nearest the outline gets to the centre, radians
 * @property {number} grain     bearing of the structural grain in its block's frame (radians)
 * @property {Object} block     its block: frame {o, e, n}, scale, centroid shift, pieces
 * @property {Object} piece     its shape within the block (body, rift edges, shift)
 * @property {number[][]} outline  points along the outline (unit vectors)
 */

const TAU = 2 * Math.PI;
const OUTLINE_SAMPLES = 72;
const CORNER = 0.11;            // rounding where a rift edge meets the body or another edge (× the parent's nominal radius)
const CLUSTER_PULL = 0.8;       // a cluster grows round its own heart, but this much toward the supercontinent's (a compact whole)
const MIN_EDGE_TURN = 0.9;      // two rift edges of one craton face at least this far apart (radians, ~50°)
const STEP_WIDTH = 0.04;        // a transform offset's width along its edge (× the nominal radius): a step, not a ramp

const smoothstep = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
/** Smooth maximum: max(a, b), its corner rounded over k. */
const smax = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; };

/**
 * A piece's shape at (u, v) in its parent's unit coordinates (radius ~1): the signed distance (negative inside) into
 * out.d, and into out.rift how much the nearest edge there is a rift edge rather than the rounded body (0…1).
 */
function pieceShape(pc, u, v, out) {
    const b = pc.body, du = u - b.u0, dv = v - b.v0, t = Math.atan2(dv, du) - b.psi, ct = Math.cos(t), st = Math.sin(t);
    let lobe = 1;
    for (const l of b.lobes) lobe += l.amp * Math.cos(l.k * t + l.phase);
    const body = Math.hypot(du, dv) - b.a * b.b / Math.sqrt(b.b * b.b * ct * ct + b.a * b.a * st * st) * lobe;
    let d = body, cut = -Infinity;
    for (const c of pc.cuts) {
        const p = u * c.cs + v * c.sn, q = v * c.cs - u * c.sn;
        let at = c.d;
        for (const s of c.steps) at += s.jump * smoothstep((q - s.at) / STEP_WIDTH + 0.5);
        const e = c.flip ? at - p : p - at;
        if (e > cut) cut = e;
        d = smax(d, e, CORNER);
    }
    out.d = d;
    out.rift = cut === -Infinity ? 0 : smoothstep((cut - body) / (2 * CORNER) + 0.5);
    return out;
}

/** The body's radius along bearing `theta` (unit coordinates, from the body's centre). */
function bodyRadius(b, theta) {
    const t = theta - b.psi, ct = Math.cos(t), st = Math.sin(t);
    let lobe = 1;
    for (const l of b.lobes) lobe += l.amp * Math.cos(l.k * t + l.phase);
    return b.a * b.b / Math.sqrt(b.b * b.b * ct * ct + b.a * b.a * st * st) * lobe;
}

/**
 * A rift edge across the body at bearing `beta` (its outward normal), `depth` of the body's radius along it from the
 * centre, broken into segments by a few transform offsets (`kmPerUnit` turns their size into unit coordinates).
 */
function riftEdge(rng, cfg, body, beta, depth, kmPerUnit, flip = false) {
    const r = bodyRadius(body, beta), d = r * depth, half = Math.sqrt(Math.max(0.05, r * r - d * d));
    const steps = [], n = Math.floor(rng() * (cfg.cratonRiftSteps + 1));
    for (let i = 0; i < n; i++) {
        const [lo, hi] = cfg.cratonRiftStepKm;
        steps.push({ at: (rng() * 1.4 - 0.7) * half, jump: (rng() < 0.5 ? -1 : 1) * (lo + (hi - lo) * rng()) / kmPerUnit });
    }
    return { cs: Math.cos(beta), sn: Math.sin(beta), d, steps, flip };
}

/**
 * `count` outer rift edges for a piece, their normals at random bearings in `from`…`from + span` but kept apart (no two
 * edges on one side; and not evenly spread either, or every craton comes out a regular polygon), each `ease` shallower.
 */
function outerEdges(rng, cfg, body, count, from, span, kmPerUnit, ease = 0) {
    const out = [], bearings = [], [lo, hi] = cfg.cratonRiftDepth;
    for (let j = 0, tries = 0; j < count && tries < 40; tries++) {
        const beta = from + span * rng();
        if (bearings.some(b => Math.abs(Math.atan2(Math.sin(beta - b), Math.cos(beta - b))) < MIN_EDGE_TURN)) continue;
        bearings.push(beta); j++;
        out.push(riftEdge(rng, cfg, body, beta, Math.min(0.97, lo + ease + (hi - lo) * rng()), kmPerUnit));
    }
    return out;
}

/** How many rift edges a craton's outer outline has (some cores are nearly round, most are cut on two or three sides). */
function edgeCount(rng, cfg) {
    const [lo, hi] = cfg.cratonRiftEdges;
    return lo + Math.floor(rng() * (hi - lo + 1));
}

/** The outline of a shape (unit coordinates): its deepest point, then the first crossing along OUTLINE_SAMPLES rays from it. */
function traceOutline(pc) {
    const out = { d: 0, rift: 0 };
    let best = Infinity, cu = 0, cv = 0;
    for (let i = -24; i <= 24; i++) for (let j = -24; j <= 24; j++) {
        const u = i * 0.1 + pc.tu, v = j * 0.1 + pc.tv;
        pieceShape(pc, u - pc.tu, v - pc.tv, out);
        if (out.d < best) { best = out.d; cu = u; cv = v; }
    }
    const points = [];
    for (let s = 0; s < OUTLINE_SAMPLES; s++) {
        const a = s * TAU / OUTLINE_SAMPLES, du = Math.cos(a), dv = Math.sin(a);
        let lo = 0, hi = 0;
        for (let t = 0.03; t < 4; t += 0.03) { if (pieceShape(pc, cu + du * t - pc.tu, cv + dv * t - pc.tv, out).d > 0) { hi = t; break; } lo = t; }
        if (hi === 0) hi = 4;
        for (let it = 0; it < 14; it++) { const m = (lo + hi) / 2; if (pieceShape(pc, cu + du * m - pc.tu, cv + dv * m - pc.tv, out).d > 0) hi = m; else lo = m; }
        points.push([cu + du * lo, cv + dv * lo]);
    }
    let area = 0, gx = 0, gy = 0;
    for (let i = 0; i < points.length; i++) {
        const [x0, y0] = points[i], [x1, y1] = points[(i + 1) % points.length], w = x0 * y1 - x1 * y0;
        area += w; gx += (x0 + x1) * w; gy += (y0 + y1) * w;
    }
    area /= 2;
    const cx = gx / (6 * area), cy = gy / (6 * area);
    // compactness: the nearest the outline comes to the centroid, against the radius of a disc of the same area
    // (a disc 1, an ellipse of aspect 2.2 ~0.67, a sliver far less)
    const compact = Math.min(...points.map(([x, y]) => Math.hypot(x - cx, y - cy))) / Math.sqrt(Math.abs(area) / Math.PI);
    return { points, area, cx, cy, compact };
}

/**
 * A block: one craton, or a pair of siblings cut from one parent and drifted apart. `targets` are the radii (radians) the
 * pieces should have (a disc of the same area); `opening` the gap (radians) the siblings' facing edges leave between them.
 */
function makeBlock(rng, cfg, targets, opening) {
    const R = Math.sqrt(targets.reduce((s, r) => s + r * r, 0)), kmPerUnit = R * PLANET_RADIUS_KM;
    // the parent body: elongated along its grain (a big core less so: its long axis stays within reach of the largest
    // cratons' size), with a few low lobes — a raggedness of its own
    const longest = cfg.cratonMaxDiameterKm * 1.15 / (2 * kmPerUnit);
    const aspect = Math.min(1 + (cfg.cratonMaxAspect - 1) * rng() ** 1.5, Math.max(1, longest * longest));
    const ragged = 0.4 + 0.6 * rng(), psi = rng() * Math.PI;
    const body = { u0: 0, v0: 0, a: Math.sqrt(aspect), b: 1 / Math.sqrt(aspect), psi,
        lobes: [1, 2, 3].map(k => ({ k, amp: ragged * rng() * cfg.cratonLobes / Math.sqrt(k), phase: rng() * TAU })) };
    // the rift edges; drawn again, fewer and shallower, while a piece comes out a sliver (or a sibling a crumb)
    const pieces = targets.map(() => ({ body, cuts: [], tu: 0, tv: 0, sibling: targets.length > 1 }));
    let traced, beta = 0;
    for (let tries = 0; ; tries++) {
        const ease = 0.07 * tries, fewer = tries >> 1, count = more => Math.max(0, edgeCount(rng, cfg) - more - fewer);
        if (pieces.length === 1) pieces[0].cuts = outerEdges(rng, cfg, body, count(0), 0, TAU, kmPerUnit, ease);
        else {
            // split across the long axis (two compact pieces, not two slivers), a little off the middle
            beta = psi + (rng() - 0.5) * 1.0;
            const split = riftEdge(rng, cfg, body, beta, (rng() - 0.5) * 0.4 / (1 + tries), kmPerUnit);
            pieces[0].cuts = [split, ...outerEdges(rng, cfg, body, count(1), beta + Math.PI / 2, Math.PI, kmPerUnit, ease)];
            pieces[1].cuts = [{ ...split, flip: true }, ...outerEdges(rng, cfg, body, count(1), beta - Math.PI / 2, Math.PI, kmPerUnit, ease)];
        }
        traced = pieces.map(traceOutline);
        const total = traced.reduce((s, t) => s + t.area, 0);
        if (tries >= 6 || traced.every(t => t.compact >= cfg.cratonMinCompact && t.area >= 0.25 * total)) break;
    }
    // scale the block so its pieces cover the area asked of them (the cuts took some of the body away)
    const scale = Math.sqrt(targets.reduce((s, r) => s + Math.PI * r * r, 0) / traced.reduce((s, t) => s + t.area, 0));
    if (pieces.length > 1) {
        // the second sibling drifts away from the first across the rift that split them, with some slip along it
        const slip = (rng() - 0.5) * 0.6;
        for (let g = opening / scale; ; g *= 1.1) {
            pieces[1].tu = g * Math.cos(beta) - slip * Math.sin(beta);
            pieces[1].tv = g * Math.sin(beta) + slip * Math.cos(beta);
            traced[1] = traceOutline(pieces[1]);
            if (planarGap(traced[0].points, traced[1].points) * scale >= opening * 1.05) break;
        }
    }
    // centre the block on its pieces' centroid, so that placing the frame places the block
    const total = traced.reduce((s, t) => s + t.area, 0);
    const cx = traced.reduce((s, t) => s + t.cx * t.area, 0) / total, cy = traced.reduce((s, t) => s + t.cy * t.area, 0) / total;
    const block = { scale, cx, cy, pieces, frame: null };
    pieces.forEach((pc, i) => {
        const t = traced[i];
        pc.local = t.points.map(([x, y]) => [(x - cx) * scale, (y - cy) * scale]);
        pc.centre2 = [(t.cx - cx) * scale, (t.cy - cy) * scale];
        pc.radius = Math.sqrt(t.area / Math.PI) * scale;
        const r = pc.local.map(([x, y]) => Math.hypot(x - pc.centre2[0], y - pc.centre2[1]));
        pc.reach = Math.max(...r); pc.inner = Math.min(...r);
    });
    block.reach = Math.max(...pieces.map(pc => Math.hypot(...pc.centre2) + pc.reach));
    block.inner = Math.min(...pieces.map(pc => Math.max(0, pc.inner - Math.hypot(...pc.centre2))));
    return block;
}

/** Smallest distance between two planar outlines (the facing edges of two siblings, in their parent's unit coordinates). */
function planarGap(A, B) {
    let best = Infinity;
    for (const [ax, ay] of A) for (const [bx, by] of B) { const d = Math.hypot(ax - bx, ay - by); if (d < best) best = d; }
    return best;
}

/** The point at frame coordinates (u, v): azimuthal equidistant about frame.o. */
function fromFrame(f, u, v) {
    const rho = Math.hypot(u, v);
    if (rho < 1e-12) return f.o.slice();
    const s = Math.sin(rho) / rho, c = Math.cos(rho);
    return [f.o[0] * c + (f.e[0] * u + f.n[0] * v) * s, f.o[1] * c + (f.e[1] * u + f.n[1] * v) * s, f.o[2] * c + (f.e[2] * u + f.n[2] * v) * s];
}

/** A frame at `o`, turned by `turn` radians. */
function frameAt(o, turn) {
    const [e0, n0] = tangentBasis(o), c = Math.cos(turn), s = Math.sin(turn);
    return { o, e: [e0[0] * c + n0[0] * s, e0[1] * c + n0[1] * s, e0[2] * c + n0[2] * s], n: [n0[0] * c - e0[0] * s, n0[1] * c - e0[1] * s, n0[2] * c - e0[2] * s] };
}

/** The block's pieces as placed by frame `f`: centre and outline on the sphere. */
function placed(block, f) {
    return block.pieces.map(pc => ({ pc, block, centre: fromFrame(f, ...pc.centre2), outline: pc.local.map(([u, v]) => fromFrame(f, u, v)), reach: pc.reach, inner: pc.inner, radius: pc.radius }));
}

const scratch = { d: 0, rift: 0 };
/**
 * A craton's edge at a point: the signed distance to its outline (radians, negative inside), into out.d; how much that
 * edge is a rift edge (0…1) into out.rift; and the point's coordinates along and across the craton's grain (radians, in its
 * block's frame) into out.along / out.across — for edge noise that follows the grain.
 */
export function cratonEdge(k, x, y, z, out) {
    const { frame: f, scale, cx, cy } = k.block, pc = k.piece;
    const co = x * f.o[0] + y * f.o[1] + z * f.o[2], pe = x * f.e[0] + y * f.e[1] + z * f.e[2], pn = x * f.n[0] + y * f.n[1] + z * f.n[2];
    const s = Math.hypot(pe, pn), rho = Math.atan2(s, co), u = s > 1e-12 ? rho * pe / s : 0, v = s > 1e-12 ? rho * pn / s : 0;
    pieceShape(pc, u / scale + cx - pc.tu, v / scale + cy - pc.tv, out);
    out.d *= scale;
    const g = pc.body.psi, cg = Math.cos(g), sg = Math.sin(g);
    out.along = u * cg + v * sg; out.across = v * cg - u * sg;
    return out;
}

/** Signed angular distance from a point to the craton's outline; negative inside. */
export function cratonSignedDistance(k, x, y, z) { return cratonEdge(k, x, y, z, scratch).d; }

/** Angular radii with a guaranteed spread of sizes, scaled so the cratons cover cratonShare × continentalFraction × areaScale of the sphere. */
function cratonRadii(rng, cfg, areaScale = 1) {
    const n = cfg.cratonCount, target = cfg.cratonShare * cfg.continentalFraction * areaScale;
    for (let ratio = cfg.cratonSizeRatio; ; ratio *= 0.93) {
        // a ladder from 1 to `ratio`, bent so that most cores are small and a few are big (real cratons are
        // not evenly graded), and jittered: always some big cores and some small (developer: not honeycombed)
        const shape = Array.from({ length: n }, (_, i) => Math.pow(ratio, n > 1 ? Math.pow(i / (n - 1), cfg.cratonSizeSkew) : 0) * (0.9 + 0.2 * rng()));
        let lo = 0, hi = 1;
        for (let it = 0; it < 40; it++) {
            const k = (lo + hi) / 2;
            const covered = shape.reduce((sum, s) => sum + capFraction(Math.min(Math.PI, s * k)), 0);
            if (covered < target) lo = k; else hi = k;
        }
        const radii = shape.map(s => s * lo);
        const largestKm = 2 * Math.max(...radii) * PLANET_RADIUS_KM;
        if (largestKm <= cfg.cratonMaxDiameterKm || ratio < 1.3) return radii;
    }
}

/** Smallest angular distance between two placed outlines (0 if they overlap), sampling only when the discs alone cannot tell. */
function outlineGap(a, b) {
    const d = angleBetween(a.centre, b.centre);
    if (d >= a.reach + b.reach) return d - a.reach - b.reach;                         // even the longest reaches cannot meet
    if (d <= a.inner + b.inner) return 0;                                            // even the shortest radii overlap
    let best = -2;
    for (const p of a.outline) for (const q of b.outline) { const t = p[0] * q[0] + p[1] * q[1] + p[2] * q[2]; if (t > best) best = t; }
    const gap = Math.acos(Math.min(1, best));
    // a point of one outline can sit between two samples of the other: allow for half a sample spacing
    return Math.max(0, gap - Math.max(a.reach, b.reach) * Math.PI / OUTLINE_SAMPLES);
}

/**
 * Pack the cratons into one supercontinent of a few clusters. Every pair of outlines is at least
 * (cratonMinGapKm + 2 × cratonEdgeNoiseKm) apart — measured between the outlines themselves, so angular cores interlock.
 * Within a cluster the gap is close to that; between clusters it is clusterApart × that.
 * `stretch` (1 → 0) makes the supercontinent rounder and tighter; the caller lowers it when a layout will not fit.
 * `areaScale` (≤ 1) shrinks every craton's area by that factor — the spacing stays, the cores give way.
 * @returns {{cratons: Craton[], centre: number[], elongation: number, clusters: number}}
 */
export function placeCratons(rng, cfg, stretch = 1, areaScale = 1) {
    const radii = cratonRadii(rng, cfg, areaScale);
    const reserve = (cfg.cratonMinGapKm + 2 * cfg.cratonEdgeNoiseKm) / PLANET_RADIUS_KM;

    // ── blocks: single cratons and sibling pairs, in a random order (Fisher–Yates: a sort with a random comparator
    // consumes an engine-dependent number of random draws, which would make the same seed differ between browsers) ──
    const order = radii.map((r, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const blocks = [];
    for (let i = 0; i < order.length; i++) {
        const pair = i + 1 < order.length && rng() < cfg.cratonSiblingChance;
        const targets = pair ? [radii[order[i]], radii[order[++i]]] : [radii[order[i]]];
        blocks.push(makeBlock(rng, cfg, targets, reserve * (1 + 0.25 * rng())));
    }
    const size = b => b.pieces.reduce((s, pc) => s + pc.radius * pc.radius, 0);

    // ── clusters: a few proto-continents of unequal size; the biggest block is the heart of the first ──
    const [perLo, perHi] = cfg.clusterBlocks;
    const K = Math.max(1, Math.min(blocks.length, Math.min(6, Math.round(blocks.length / (perLo + (perHi - perLo) * rng())))));
    const weights = Array.from({ length: K }, (_, k) => (0.6 + 0.8 * rng()) / Math.pow(k + 1, 0.6));
    const counts = new Array(K).fill(1);
    for (let left = blocks.length - K; left > 0; left--) {
        let pick = 0, worst = -Infinity;
        const sum = weights.reduce((s, w) => s + w, 0), total = counts.reduce((s, c) => s + c, 0);
        for (let k = 0; k < K; k++) { const deficit = weights[k] / sum * (total + 1) - counts[k]; if (deficit > worst) { worst = deficit; pick = k; } }
        counts[pick]++;
    }
    const heart = blocks.reduce((a, b) => (size(b) > size(a) ? b : a));
    const rest = blocks.filter(b => b !== heart);
    for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
    const clusters = [];
    for (let k = 0, at = 0; k < K; k++) {
        const members = k === 0 ? [heart, ...rest.slice(0, counts[0] - 1)] : rest.slice(at, at + counts[k]);
        at += k === 0 ? counts[0] - 1 : counts[k];
        members.sort((a, b) => size(b) - size(a));            // each cluster grows from its biggest core
        clusters.push(members);
    }

    // Start near the equator. A supercontinent is ~150° across, so centred any higher it drapes over
    // a pole and is unreadable on the flat map; the history carries the pieces wherever they go anyway.
    let centre = randomPoint(rng);
    while (Math.abs(centre[2]) > Math.sin(cfg.startMaxLatitudeDeg * Math.PI / 180)) centre = randomPoint(rng);
    const axis = rng() * Math.PI, elongation = rng() * cfg.clusterElongation * stretch;   // 0 = round, →1 = stretched along `axis`
    const [apartLo, apartHi] = cfg.clusterApart;
    const all = [];                                           // every placed piece: {pc, block, cluster, centre, outline, reach, inner}
    const clusterCentre = k => {
        const s = [0, 0, 0];
        for (const p of all) if (p.cluster === k) { const w = p.radius * p.radius; s[0] += p.centre[0] * w; s[1] += p.centre[1] * w; s[2] += p.centre[2] * w; }
        const l = Math.hypot(...s) || 1;
        return [s[0] / l, s[1] / l, s[2] / l];
    };
    const settle = (block, k, f) => { block.frame = f; for (const p of placed(block, f)) all.push(Object.assign(p, { cluster: k })); };

    for (let k = 0; k < K; k++) {
        for (const block of clusters[k]) {
            if (!all.length) { settle(block, k, frameAt(centre, rng() * TAU)); continue; }
            const own = all.filter(p => p.cluster === k), founding = own.length === 0, home = founding ? centre : clusterCentre(k);
            let best = null, bestScore = Infinity;
            // other clusters keep clusterApart × reserve away; if no spot honours that, it eases toward the hard minimum
            for (let relax = 0; relax < 4 && !best; relax++) {
                const apart = Math.max(1, apartLo - relax * (apartLo - 1) / 3);
                for (let tries = 0; tries < 400 && (tries < 80 || !best); tries++) {
                    const pool = founding ? all : own, anchor = pool[(rng() * pool.length) | 0];
                    const gap = founding ? reserve * (apartLo + (apartHi - apartLo) * rng()) * (relax ? apart / apartLo : 1)
                        : reserve * (1 + rng() * cfg.clusterGapVariety * stretch);
                    const bearing = rng() * TAU, turn = rng() * TAU;
                    // walk out from the anchor along the bearing until the block's outlines clear it
                    const near = anchor.inner + block.inner + gap, far = anchor.reach + block.reach + gap;
                    const steps = Math.max(1, Math.ceil((far - near) / (0.25 * gap)));
                    let candidate = null, p = null;
                    for (let i = 0; i <= steps; i++) {
                        p = destination(anchor.centre, bearing, near + (far - near) * i / steps);
                        candidate = placed(block, frameAt(p, turn));
                        if (i === steps || candidate.every(c => outlineGap(anchor, c) >= gap)) break;
                    }
                    const clear = candidate.every(c => all.every(o => (o === anchor ? outlineGap(o, c) >= gap * 0.999
                        : outlineGap(o, c) >= reserve * (o.cluster === k ? 1 : apart))));
                    if (!clear) continue;
                    // compact around the cluster's heart, the clusters compact around the supercontinent's — cheaper along
                    // its long axis
                    const across = Math.abs(Math.sin(bearingTo(centre, p) - axis));
                    const spread = angleBetween(p, centre) * (1 + 1.6 * elongation * across);
                    const score = (founding ? spread : angleBetween(p, home) + CLUSTER_PULL * spread) + rng() * cfg.clusterLooseness * stretch;
                    if (score < bestScore) { bestScore = score; best = frameAt(p, turn); }
                }
            }
            if (!best) return null;                               // could not fit — caller retries
            settle(block, k, best);
        }
    }
    const cratons = all.map((p, i) => ({
        id: i + 1, letter: String.fromCharCode(65 + i), cluster: p.cluster, centre: p.centre, radius: p.radius, reach: p.reach, inner: p.inner,
        grain: p.pc.body.psi, block: p.block, piece: p.pc, outline: p.outline,
    }));
    return { cratons, centre, elongation, clusters: K };
}
