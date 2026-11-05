// G3 — today's mountains (plans/GENERATE_REDESIGN_PLAN.md §3.2): every convergent plate boundary builds the belt its kind
// builds in Evolution's history, written by the history's own record functions (tectonics/step/orogeny.js spreadBelt:
// the belt's geometry, its uplift and crests, its root) in one call — the convergence it has absorbed over the time it has
// been active (each boundary its own, drawn in a physical range on a stream of its own), at the rate the plates close now.
//   · ocean under continent: an Andean belt on the continent (a Laramide one far inland where a young slab goes in flat
//     under a plate driving at it);
//   · ocean under ocean: island-arc crust on the upper plate, as wide as the arc is mature, and its arc belt;
//   · continent against continent: a plateau on the upper plate, a foreland on the lower — a short front only a Ural-type
//     welt on both;
//   · a transform pressed together on land: a narrow transpression ridge;
//   · a continent pulling apart: rift shoulders, and a young narrow sea once it has opened far enough (the Red Sea).
// One world-indexed crust raster carries it all (identity rotation: a raster cell is a world cell); each belt is kept to
// its own plate's crust.

import { CrustRaster, CrustType, CrustFlag, OrogenyType, BeltSide } from '../tectonics/model/crust.js';
import { spreadBelt, beltWidthKm, beltShape } from '../tectonics/step/orogeny.js';
import { TECTONICS } from '../tectonics/config.js';
import { recentPush } from '../tectonics/step/far-field.js';
import { encodeCoverKm, encodeExhumKm, encodeUnroofKm, encodeFloodMyr, encodeFloodAge, encodeArcMyr, encodeAge, encodeFacies } from '../tectonics/model/geology.js';
import { makeRng } from '../../../js/rng.js';
import { MinHeap } from '../core/min-heap.js';
import { FastNoise } from '../core/fast-noise.js';
import { Boundary } from './plates.js';
import { PRESENT } from './present-config.js';
import { shapeRange, normalAt, maskAt, maskNoiseOf } from './ranges.js';

const R = 6371, DEG = 180 / Math.PI;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return l > 1e-15 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]; };
const at = (xyz, c) => [xyz[3 * c], xyz[3 * c + 1], xyz[3 * c + 2]];
const smooth01 = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

// a noise's value as a share of its own spread (0…1, uniform): read along a front, where along its strike it does what
// (the spread measured once, on a noise of its own: the same for every seed)
let spread = null;
function uniformOf(v) {
    if (!spread) {
        const ref = new FastNoise(0x5eed), N = 8192;
        spread = new Float32Array(N);
        for (let i = 0; i < N; i++) spread[i] = ref.noise3D(i * 0.7317 + 0.13, i * 0.3191 - 4.7, i * 0.5531 + 9.1);
        spread.sort();
    }
    let lo = 0, hi = spread.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (spread[m] < v) lo = m + 1; else hi = m; }
    return lo / spread.length;
}

/** The tectonic config the record functions run with (a copy: the present-day world never touches Evolution's). */
export function presentTectonics() {
    const config = structuredClone(TECTONICS);
    config.geology = { ...config.geology, records: false };     // (the geological record comes with the continents' past)
    return config;
}

/** A crust raster over the sim mesh, one cell a world cell: the land as drawn, the sea floor at its age. */
export function newCrust(L, land, sea) {
    const n = L.mesh.numRegions, crust = new CrustRaster(n);
    for (let c = 0; c < n; c++) crust.create(c, land[c] ? CrustType.CONTINENT : CrustType.OCEAN, land[c] ? -2000 : -sea.ageMyr[c]);
    return crust;
}

/**
 * Today's belts, written into a crust raster over the sim mesh.
 * @param {Object} L  the layout   @param {Object} W  the plates   @param {Object} B  the boundaries (on `land`)
 * @param {Uint8Array} land  the land per cell (the coast as drawn)   @param {{ageMyr}} sea  the floor's ages
 * @param {Int32Array} [terranes]  each land cell's terrane (present/warp.js, G4c): along a range, each terrane it crosses
 *   took up its own share of the convergence (the "small plates" texture the big plates' mountains)
 * @returns {{crust: CrustRaster, config: Object, fronts: Object[]}}  the raster (type, formedAt and the records); the
 *   fronts as built (for the checks and the readout)
 */
export function presentBelts(L, W, B, land, sea, cfg = PRESENT, config = presentTectonics(), crust = null, terranes = null) {
    const { xyz, sim, seed } = L, n = L.mesh.numRegions, mesh = sim;
    const plateOf = W.cellPlate, plates = W.plates;
    if (!crust) crust = newCrust(L, land, sea);
    const plate = { crust };
    // (G3e: the young seas between a stretched continent's blocks that lie on their shelves — present/hold.js holds them
    // shallow, as it holds a land piece's drowned edge)
    const shelfSea = new Uint8Array(n);
    // (G3f: a rift valley's line — how deep and how wide its graben, per sim cell — and km from the sea, once)
    const riftDepth = new Float32Array(n), riftHalf = new Float32Array(n);
    // (M2: and where its smooth line passes the cell — a point on it and its normal there, in the sim mesh's frame — so the
    // valley follows the line itself, not the cells it was written on)
    const riftPt = new Float32Array(3 * n), riftNrm = new Float32Array(3 * n);
    let seaKm = null;
    let sundaFronts = 0;                    // (G3e: at most sundaMax stretched continents a planet — an Indonesia, not many)
    // (G3d: along a front's strike — a noise of the fronts' own, read as a share of its spread)
    const strikeNoise = new FastNoise((seed ^ 0xa7c5) >>> 0);
    const strike = (c, waveKm, off) => { const f = R / waveKm, p = at(xyz, c); return uniformOf(strikeNoise.noise3D(p[0] * f + off, p[1] * f - 0.7 * off, p[2] * f + 0.3 * off)); };
    // (G4c: a terrane's share of the convergence on a range across it — the Andes' segments — its own draw)
    const segOf = (c) => {
        if (!terranes || terranes[c] < 0 || !(cfg.segmentVary > 0)) return 1;
        return 1 - cfg.segmentVary * makeRng((seed ^ 0x5e63) + terranes[c] * 7919)();
    };
    const landKm = new Map();
    /** km from plate p's own land, over its cells (as far as arcFarKm): an arc near it trails from its continent */
    const landKmOf = (p) => {
        if (!landKm.has(p)) {
            const src = [];
            for (let c = 0; c < n; c++) if (plateOf[c] === p && land[c]) src.push(c);
            landKm.set(p, distanceFrom(src, src.map(() => cfg.arcFarKm), (c) => plateOf[c] === p).km);
        }
        return landKm.get(p);
    };

    // every boundary edge, its two sides, its motion: grouped into fronts by (kind, the two plates)
    const groups = new Map();
    for (let i = 0; i < B.count; i++) {
        const k = B.kind[i];
        if (k === Boundary.RIDGE || k === Boundary.INACTIVE) continue;
        if (k === Boundary.TRANSFORM && !(B.openCmYr[i] < 0 && (B.landA[i] || B.landB[i]))) continue;   // only pressed together, on land
        const key = `${k}:${Math.min(B.a[i], B.b[i])}:${Math.max(B.a[i], B.b[i])}`;
        if (!groups.has(key)) groups.set(key, { kind: k, pa: Math.min(B.a[i], B.b[i]), pb: Math.max(B.a[i], B.b[i]), edges: [] });
        groups.get(key).edges.push(i);
    }
    // a front's time active, drawn in its kind's range — each front its own draw on its own stream, in a fixed order
    const timeOf = (g, range) => {
        const r = makeRng((seed ^ 0xbe17) + g.kind * 7919 + g.pa * 131 + g.pb * 17);
        return range[0] + (range[1] - range[0]) * r();
    };
    const fronts = [];
    // (G4d: each front's push on its plates, for the far field — present/plumes.js presentFarField; tectonics/step/far-field.js
    // feedFarField's: a collision with the shortening it absorbs, a subduction coast with a share of its belt's work by how
    // fast it converges, a flat slab with its belt's)
    const pushes = [];
    const pushOf = (p, cells, works, frontKm) => {
        const m = new Map();
        cells.forEach((c, i) => { if (works[i] > 0) m.set(c, Math.max(m.get(c) ?? 0, works[i])); });
        if (m.size) pushes.push({ plate: p, cells: m, frontKm });
    };
    // (rifts first, so a young sea opened inland is there before the belts that might reach it)
    const order = [...groups.values()].sort((a, b) => (a.kind === Boundary.RIFT ? 0 : 1) - (b.kind === Boundary.RIFT ? 0 : 1) || a.kind - b.kind || a.pa - b.pa || a.pb - b.pb);
    for (const g of order) {
        // each edge's motion: closing rate (km/Myr), head-on share, obliquity, both sides
        const E = g.edges.map(i => {
            const ca = B.cellA[i], cb = B.cellB[i], pa = at(xyz, ca), pb = at(xyz, cb), m = unit([pa[0] + pb[0], pa[1] + pb[1], pa[2] + pb[2]]);
            const d = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]], dm = dot(d, m), nrm = unit([d[0] - dm * m[0], d[1] - dm * m[1], d[2] - dm * m[2]]);
            const va = cross(plates[B.a[i]].euler, m), vb = cross(plates[B.b[i]].euler, m);
            const rel = [(va[0] - vb[0]) * R, (va[1] - vb[1]) * R, (va[2] - vb[2]) * R];          // side a against side b, km/Myr
            const closing = dot(rel, nrm), speed = Math.hypot(rel[0], rel[1], rel[2]);
            const along = dot(rel, cross(m, nrm));
            return { i, ca, cb, closing, headOn: speed > 1e-9 ? Math.max(0, closing) / speed : 0, shear: Math.atan2(along, Math.max(1e-9, Math.abs(closing))) * DEG };
        });
        switch (g.kind) {
            case Boundary.SUBDUCTION: subduction(g, E); break;
            case Boundary.COLLISION: collision(g, E); break;
            case Boundary.TRANSFORM: transpression(g, E); break;
            case Boundary.RIFT: rift(g, E); break;
        }
    }

    function subduction(g, E) {
        const T = timeOf(g, cfg.andeanMyr);
        // which side rides over: per edge (B.over); the sources are the upper plate's cells at the trench
        const andean = { cells: [], widths: [], works: [], shears: [], rates: [] }, arc = { cells: [], widths: [], works: [], shears: [], slab: [], down: [] };
        const laramide = { cells: [], widths: [], works: [], shears: [] }, split = { cells: [], works: [], widths: [], taper: [] };
        // the margin's style (G3c; Uyeda & Kanamori 1979's two end members): an upper plate driving at its trench over a
        // young slab is squeezed into an Andes; one holding back or pulling away over an old, sinking slab has the arc
        // split off its edge and a sea open behind it (Japan and the Japan Sea, the Kurils, the Philippines, Indonesia's
        // arcs) — by the front's mean drive and slab age, on a draw of its own
        // (G3d: and along a long front each stretch its own: the chance as the front's, where along it by a noise)
        const splitChance = marginSplits(g, E), sr = makeRng((seed ^ 0xbac6) + g.pa * 131 + g.pb * 17), splitOff = 1000 * sr();
        for (const e of E) {
            const overA = B.over[e.i] === 0, over = overA ? e.ca : e.cb, down = overA ? e.cb : e.ca, op = plateOf[over];
            const rateKmMyr = Math.abs(e.closing), rate = rateKmMyr / 10, slabKm = rateKmMyr * T, slabAge = sea.ageMyr[down];
            const shape = beltShape(e.headOn, slabAge, config);
            // land on the upper plate within the apron's reach: an Andean margin; else an island arc at sea
            const splitHere = splitChance > 0 ? splitChance - strike(over, cfg.backArcSegKm, splitOff) : -1;
            if (landNear(over, op) && splitHere > 0) {
                if (!land[over] || !plates[op].continental) continue;
                split.cells.push(over); split.taper.push(smooth01(splitHere / cfg.arcFadeShare)); split.works.push(slabKm * config.andeanWorkShare * beltShape(e.headOn, undefined, config));
                split.widths.push(Math.min(config.arcBeltMaxKm, beltWidthKm('andean', slabKm * config.andeanWorkShare, rate, config) * shape));
            } else if (landNear(over, op)) {
                // a young slab going in under a plate that drives at it goes in flat: the belt runs far inland (Laramide)
                const vo = cross(plates[op].euler, at(xyz, over)), toward = -dot(vo, normalTo(over, down)) * R / 10;
                // the margin's coupling: an upper plate driving at its trench is squeezed (the Andes); one moving away
                // stretches over a rolling-back slab (Japan, the Aegean) — its arc stands, its belt little
                const coupling = cfg.rollbackShare + (1 - cfg.rollbackShare) * Math.min(1, Math.max(0, (toward - cfg.couplingCmYr[0]) / (cfg.couplingCmYr[1] - cfg.couplingCmYr[0])));
                const work = slabKm * config.andeanWorkShare * coupling;
                const flat = slabAge < config.flatSlabMaxAgeMyr && toward > config.flatSlabAdvanceCmYr;
                const steep = beltWidthKm('andean', work, rate, config) * shape;
                if (flat) {
                    const flatKm = toward * 10 * Math.min(T, cfg.flatSlabMyr);
                    laramide.cells.push(over); laramide.works.push(work * segOf(over) * beltShape(e.headOn, undefined, config)); laramide.shears.push(e.shear);
                    laramide.widths.push(Math.min(config.belts.laramide.maxKm, Math.max(steep, beltWidthKm('laramide', flatKm, rate, config)) * shape));
                } else {
                    andean.cells.push(over); andean.works.push(work * segOf(over) * beltShape(e.headOn, undefined, config)); andean.shears.push(e.shear); andean.rates.push(rate);
                    andean.widths.push(Math.min(config.belts.andean.maxKm, steep));
                }
            } else if (slabKm > config.arcMatureConsumedKm && rate >= cfg.arcMinRateCmYr && slabAge >= cfg.arcMinSlabMyr) {
                // (an island arc rises where old, dense floor goes down fast — the Marianas, Tonga; a slow or young slab
                // leaves a submarine ridge at most)
                arc.cells.push(over); arc.slab.push(slabKm); arc.shears.push(e.shear); arc.down.push(down);
                arc.works.push(slabKm * config.andeanWorkShare * beltShape(e.headOn, undefined, config));
                arc.widths.push(Math.min(config.arcBeltMaxKm, beltWidthKm('andean', slabKm * config.andeanWorkShare, rate, config) * shape));
            }
        }
        const plateSide = (p) => (c) => plateOf[c] === p;
        const overPlate = (cells) => cells.length ? plateOf[cells[0]] : -1;
        if (andean.cells.length) for (const p of new Set(andean.cells.map(c => plateOf[c]))) {
            const sel = andean.cells.map((c, j) => j).filter(j => plateOf[andean.cells[j]] === p);
            spreadBelt(plate, mesh, sel.map(j => andean.cells[j]), { type: OrogenyType.ANDEAN, time: 0, widths: sel.map(j => andean.widths[j]), works: sel.map(j => andean.works[j]), shears: sel.map(j => andean.shears[j]), widthKm: 0, workKm: 0 }, config, plateSide(p));
            // (only a strongly coupled, fast margin pushes far: the Sierras Pampeanas)
            pushOf(p, sel.map(j => andean.cells[j]), sel.map(j => andean.works[j] * config.farAndeanShare * Math.min(1, (andean.rates[j] / config.farAndeanRateCmYr) ** 2)), sel.length * mesh.edgeKm);
            stampStart(sel.map(j => andean.cells[j]), p, T);
        }
        if (laramide.cells.length) for (const p of new Set(laramide.cells.map(c => plateOf[c]))) {
            const sel = laramide.cells.map((c, j) => j).filter(j => plateOf[laramide.cells[j]] === p);
            spreadBelt(plate, mesh, sel.map(j => laramide.cells[j]), { type: OrogenyType.LARAMIDE, time: 0, widths: sel.map(j => laramide.widths[j]), works: sel.map(j => laramide.works[j]), shears: sel.map(j => laramide.shears[j]), widthKm: 0, workKm: 0 }, config, plateSide(p));
            pushOf(p, sel.map(j => laramide.cells[j]), sel.map(j => laramide.works[j] * config.farFlatShare), sel.length * mesh.edgeKm);
            stampStart(sel.map(j => laramide.cells[j]), p, T);
        }
        let arcKept = 0, arcCollided = 0, sundaCells = 0, sundaDeep = 0, fragmentCells = 0;
        const sundaSea = [];
        if (arc.cells.length) {
            // the arc's crust: a strip of the upper plate behind the trench, as wide as the arc is mature (a chain of islets
            // → a Philippines → an Indonesia), set back a little from the trench (the fore-arc)
            const p = overPlate(arc.cells);
            // (each arc its own age, on its own draw: a young one a submerged ridge its volcanoes break, an old one long
            // islands — the Marianas beside the Philippines, Java)
            const arcAge = cfg.arcAgeMyr[0] + (cfg.arcAgeMyr[1] - cfg.arcAgeMyr[0]) * makeRng((seed ^ 0xa7c1) + g.pa * 131 + g.pb * 17)();
            // G3d (owner, 2026-11-04: the ocean arcs "too uniform and everywhere … less likely on ocean to ocean … or on an
            // ocean plate right by land on the same major plate, that is good as it looks like a trailing/edge arc"):
            // an arc stands along only part of its trench — most likely near its own plate's continent (the Aleutians
            // off Alaska, the Antilles and the Scotia arc trailing from theirs), seldom out in the open ocean (the
            // Marianas) — and where it stands it varies along its strike: wider and narrower, nearer the trench and
            // farther back, mature in its middle and young toward its ends (a submerged ridge its volcanoes break)
            const near = landKmOf(p), r = makeRng((seed ^ 0xa7c3) + g.pa * 131 + g.pb * 17), off = [1000 * r(), 1000 * r(), 1000 * r()];
            // G3e: and where a continent rides the diving plate toward the trench, the arc has met it (Timor and the Banda
            // arc before Australia, Taiwan, New Guinea's north coast): there it always stands, mature, broad and raised
            const keep = [];
            for (let j = 0; j < arc.cells.length; j++) {
                const c = arc.cells[j], dn = arc.down[j];
                const t = smooth01((cfg.arcFarKm - near[c]) / (cfg.arcFarKm - cfg.arcNearKm));
                const chance = cfg.arcFarChance + (cfg.arcNearChance - cfg.arcFarChance) * t;
                const collide = plateOf[dn] !== p && plates[plateOf[dn]].continental ? smooth01((cfg.arcCollideKm - landKmOf(plateOf[dn])[dn]) / (cfg.arcCollideKm - cfg.arcCollideFullKm)) : 0;
                const here = Math.max(chance - strike(c, cfg.arcSegKm, off[0]), collide * cfg.arcFadeShare);
                if (here <= 0) continue;
                const grow = smooth01(here / cfg.arcFadeShare), wide = strike(c, cfg.arcVaryKm, off[1]), back = strike(c, cfg.arcVaryKm, off[2]);
                const setback = cfg.arcSetbackKm[0] + (cfg.arcSetbackKm[1] - cfg.arcSetbackKm[0]) * back;
                const width = Math.min(cfg.arcMaxKm, config.arcRowWidthKm * (1 + (arc.slab[j] - config.arcMatureConsumedKm) / config.arcWidenSlabKm))
                    * (cfg.arcWidthVary[0] + (cfg.arcWidthVary[1] - cfg.arcWidthVary[0]) * wide) * (0.4 + 0.6 * grow) * (1 + cfg.arcCollideWiden * collide);
                const age = Math.min(T, Math.max(arcAge, cfg.arcAgeMyr[1] * collide)) * (cfg.arcYoungShare + (1 - cfg.arcYoungShare) * grow);
                keep.push({ c, j, setback, reach: setback + width, grow, age, collide });
                if (collide > 0.5) arcCollided++;
            }
            arcKept = keep.length;
            if (keep.length) {
                const d = distanceFrom(keep.map(k => k.c), keep.map(k => k.reach), (c) => plateOf[c] === p && !land[c] && crust.type[c] === CrustType.OCEAN);
                const front = [], fw = [], fk = [];
                for (let c = 0; c < n; c++) {
                    if (d.reach[c] <= 0 || d.km[c] > d.reach[c]) continue;
                    const k = keep[d.src[c]];
                    if (d.km[c] < k.setback) continue;
                    // (the arc's crust no older than its age: an open-ocean arc keeps being built and rebuilt, and an old,
                    // mature one would stand as a continuous ridge of land — Evolution's arcs are chains of islands)
                    crust.type[c] = CrustType.ARC; crust.formedAt[c] = -k.age;
                    if (d.km[c] < k.setback + mesh.edgeKm) { front.push(c); fw.push(arc.widths[k.j] * (0.5 + 0.5 * k.grow) * (1 + cfg.arcCollideWiden * k.collide)); fk.push(arc.works[k.j] * k.grow * (1 + cfg.arcCollideWork * k.collide)); }
                }
                if (front.length) {
                    spreadBelt(plate, mesh, front, { type: OrogenyType.ARC, time: 0, widths: fw, works: fk, widthKm: 0, workKm: 0 }, config, (c) => plateOf[c] === p);
                    stampStart(front, p, T);
                }
            }
        }
        if (split.cells.length) {
            // the continent's edge split off as an island arc (arc crust: chains of islands, a mature arc long ones — a
            // Japan, a Java) and the sea opened behind it (young ocean floor: a back-arc basin), never through a craton;
            // (G3d) the sea narrowing toward the stretch's ends, where the arc joins its continent again (Kamchatka, Sakhalin)
            const p = overPlate(split.cells), r = makeRng((seed ^ 0xbac5) + g.pa * 131 + g.pb * 17);
            const arcKm = cfg.backArcArcKm[0] + (cfg.backArcArcKm[1] - cfg.backArcArcKm[0]) * r();
            let seaKm = cfg.backArcSeaKm[0] + (cfg.backArcSeaKm[1] - cfg.backArcSeaKm[0]) * r();
            const seaAge = cfg.backArcAgeMyr[0] + (cfg.backArcAgeMyr[1] - cfg.backArcAgeMyr[0]) * r();
            const islandAge = cfg.backArcIslandMyr[0] + (cfg.backArcIslandMyr[1] - cfg.backArcIslandMyr[0]) * r();
            // G3e (owner, 2026-11-04: "lets figure out a way for indonesia"): the back-arc's two ways — spread open into
            // one sea floored by new ocean crust (the Japan Sea), or the continent behind the arc stretched and broken
            // into blocks with young seas between them (Sundaland and eastern Indonesia: Borneo, Sulawesi, the Java and
            // Banda seas; the Aegean). Seas a few hundred km across lie on the blocks' shelves — shallow (the Java Sea);
            // wider ones open deep basins (the Banda, Celebes and Sulu seas). Each split its own draw.
            const rs = makeRng((seed ^ 0x5d0a) + g.pa * 131 + g.pb * 17), sunda = rs() < cfg.sundaChance && sundaFronts < cfg.sundaMax;
            if (sunda) sundaFronts++;
            if (sunda) seaKm = cfg.sundaShelfKm[0] + (cfg.sundaShelfKm[1] - cfg.sundaShelfKm[0]) * rs();
            const fragOff = 1000 * rs(), blockOff = 1000 * rs();
            const d = distanceFrom(split.cells, split.taper.map(t => arcKm + seaKm * t), (c) => plateOf[c] === p && land[c] && crust.type[c] !== CrustType.CRATON);
            const front = [];
            for (let c = 0; c < n; c++) {
                if (d.reach[c] <= 0 || d.km[c] > d.reach[c]) continue;
                if (d.km[c] <= arcKm || d.reach[c] - arcKm < 2 * mesh.edgeKm) {
                    // (behind a stretched continent the arc is a chain of long islands, straits between them — Sumatra,
                    // Java, Bali, Lombok — where a noise along it is low: the shelf sea behind opens to the ocean through them)
                    if (sunda && strike(c, cfg.sundaArcIslandKm, blockOff + 71.3) < cfg.sundaStraitShare) {
                        crust.type[c] = CrustType.OCEAN; crust.formedAt[c] = -seaAge; shelfSea[c] = 1; sundaSea.push(c); sundaCells++;
                        continue;
                    }
                    crust.type[c] = CrustType.ARC; crust.formedAt[c] = -Math.min(T, islandAge);
                    if (d.km[c] < mesh.edgeKm) front.push(c);
                } else if (sunda) {
                    // (the stretched continent: a block stands where a noise of blocks about sundaBlockKm is high, the
                    // rest is young sea — and toward the zone's far edge more and more of it stands, back to the mainland)
                    const edge = smooth01((d.reach[c] - d.km[c]) / cfg.sundaFadeKm);
                    const k = 0.7 * strike(c, cfg.sundaBlockKm, blockOff) + 0.3 * strike(c, cfg.sundaBlockKm / 2.3, blockOff + 37.1);
                    if (k < (1 - cfg.sundaKeepShare) * edge) {
                        crust.type[c] = CrustType.OCEAN; crust.formedAt[c] = -seaAge * (0.4 + 0.6 * k);
                        shelfSea[c] = 1; sundaSea.push(c); sundaCells++;
                    }
                } else if (d.km[c] - arcKm > 1.5 * mesh.edgeKm && d.reach[c] - d.km[c] > 1.5 * mesh.edgeKm && strike(c, cfg.fragmentKm, fragOff) > 1 - cfg.fragmentShare) {
                    // (a sliver of the continent left behind in the opening sea: a microcontinent — Corsica and Sardinia,
                    // the Lord Howe Rise's islands, the slivers of eastern Indonesia)
                    fragmentCells++;
                } else {
                    // (the sea opens from the arc's back: youngest at its spreading axis, mid-basin)
                    const w = d.reach[c] - arcKm;
                    crust.type[c] = CrustType.OCEAN; crust.formedAt[c] = -seaAge * Math.min(1, 2 * Math.abs((d.km[c] - arcKm) / w - 0.5) + 0.2);
                }
            }
            if (front.length) {
                spreadBelt(plate, mesh, front, { type: OrogenyType.ARC, time: 0, widthKm: Math.max(...split.widths), workKm: Math.max(...split.works) }, config, (c) => plateOf[c] === p && crust.type[c] === CrustType.ARC);
                stampStart(front, p, T);
            }
            if (sundaSea.length) {
                // (the stretched continent's seas are shelf seas — but where one lies farther than sundaDeepKm from every
                // block, a deep basin opened: the Banda, Celebes and Sulu seas)
                const dk = distanceFrom(sundaSea.filter(c => { for (let k = mesh.adjOffset[c]; k < mesh.adjOffset[c + 1]; k++) if (crust.type[mesh.adjList[k]] !== CrustType.OCEAN) return true; return false; }),
                    sundaSea.map(() => 4 * cfg.sundaDeepKm), (c) => shelfSea[c] === 1);
                for (const c of sundaSea) if (!(dk.km[c] <= cfg.sundaDeepKm)) { shelfSea[c] = 0; sundaDeep++; }
            }
        }
        fronts.push({ kind: 'subduction', T, andean: andean.cells.length, laramide: laramide.cells.length, arc: arcKept, arcTrench: arc.cells.length, split: split.cells.length,
            collided: arcCollided, sunda: sundaCells, sundaDeep, fragments: fragmentCells });
    }

    /** The chance a subduction front along a continent splits off an island arc rather than squeezing an Andes. */
    function marginSplits(g, E) {
        let drive = 0, age = 0, m = 0;
        for (const e of E) {
            const overA = B.over[e.i] === 0, over = overA ? e.ca : e.cb, down = overA ? e.cb : e.ca, op = plateOf[over];
            if (!land[over] || !plates[op].continental) continue;
            const vo = cross(plates[op].euler, at(xyz, over));
            drive += -dot(vo, normalTo(over, down)) * R / 10; age += sea.ageMyr[down]; m++;
        }
        if (m < cfg.backArcMinCells) return 0;
        drive /= m; age /= m;
        return Math.min(cfg.backArcMaxChance, Math.max(0, cfg.backArcBase + cfg.backArcAgeGain * (age - 60) / 100 - cfg.backArcDriveGain * drive));
    }

    function collision(g, E) {
        const T = timeOf(g, cfg.collisionMyr);
        // the upper plate: the one with more land (Asia over India) — its side gets the plateau, the other the foreland
        const landOf = (p) => plates[p].landShare * plates[p].cellCount;
        const upper = landOf(g.pa) >= landOf(g.pb) ? g.pa : g.pb, lower = upper === g.pa ? g.pb : g.pa;
        const lengthKm = E.length * mesh.edgeKm;
        const sides = [[upper, BeltSide.UPPER], [lower, BeltSide.LOWER]];
        for (const [p, side] of sides) {
            const cells = [], widths = [], works = [], shears = [];
            for (const e of E) {
                const c = plateOf[e.ca] === p ? e.ca : e.cb;
                if (!land[c]) continue;
                const rate = Math.abs(e.closing) / 10, W0 = Math.abs(e.closing) * T;
                const kind = lengthKm < config.sutureMinContactKm ? 'ural' : side === BeltSide.UPPER ? 'himalayan' : 'foreland';
                cells.push(c); works.push(W0 * segOf(c) * beltShape(e.headOn, undefined, config)); shears.push(e.shear);
                widths.push(Math.min(config.belts[kind].maxKm, beltWidthKm(kind, W0, rate, config) * beltShape(e.headOn, undefined, config)));
            }
            if (!cells.length) continue;
            const type = lengthKm < config.sutureMinContactKm ? OrogenyType.URAL : OrogenyType.HIMALAYAN;
            spreadBelt(plate, mesh, cells, { type, time: 0, side: type === OrogenyType.URAL ? BeltSide.NONE : side, widths, works, shears, widthKm: 0, workKm: 0 }, config, (c) => plateOf[c] === p);
            pushOf(p, cells, works.map(w => w * config.farCollisionShare), lengthKm);
            stampStart(cells, p, T);
            for (const c of cells) crust.flags[c] |= CrustFlag.SUTURE;
        }
        fronts.push({ kind: 'collision', T, cells: E.length });
    }

    function transpression(g, E) {
        const T = timeOf(g, cfg.transpressionMyr);
        for (const p of [g.pa, g.pb]) {
            const cells = [], widths = [], works = [], shears = [];
            for (const e of E) {
                const c = plateOf[e.ca] === p ? e.ca : e.cb;
                if (!land[c]) continue;
                const W0 = Math.abs(e.closing) * T;
                cells.push(c); works.push(W0 * segOf(c)); shears.push(e.shear);
                widths.push(Math.min(config.belts.transpression.maxKm, beltWidthKm('transpression', W0, Math.abs(e.closing) / 10, config)));
            }
            if (!cells.length) continue;
            spreadBelt(plate, mesh, cells, { type: OrogenyType.TRANSPRESSION, time: 0, widths, works, shears, widthKm: 0, workKm: 0 }, config, (c) => plateOf[c] === p);
            stampStart(cells, p, T);
        }
        fronts.push({ kind: 'transpression', T, cells: E.length });
    }

    function rift(g, E) {
        const T = timeOf(g, cfg.riftMyr);
        // how far it has opened (km)
        const openKm = E.reduce((s, e) => s + Math.max(0, -e.closing), 0) / Math.max(1, E.length) * T;
        // G3f (owner, 2026-11-04: rifts "too uniform", and "strange that they open up to like ocean in the middle of
        // continents, they should look more like the african rift valley for this tool, and particularly strong ones can
        // pull away closer to the coasts"): inland a rift is a valley between raised shoulders on a broad dome (East
        // Africa); only a strong one, where it nears a coast, has pulled apart into a young sea — widest at the coast,
        // narrowing inland into the valley (the Red Sea and the Gulf of Aden, the Gulf of California). Each its own way
        // along its length.
        const r = makeRng((seed ^ 0x41f7) + g.pa * 131 + g.pb * 17), off = [1000 * r(), 1000 * r(), 1000 * r(), 1000 * r()];
        const inland = seaKmOf();
        let seaCells = 0;
        if (openKm > cfg.riftSeaMinKm) {
            const reachKm = cfg.riftSeaCoastKm * Math.min(cfg.riftSeaReachMax, openKm / cfg.riftSeaMinKm);
            const src = [], reaches = [];
            for (const e of E) for (const c of [e.ca, e.cb]) {
                const t = smooth01((reachKm - inland[c]) / reachKm);
                if (t > 0) { src.push(c); reaches.push(0.5 * openKm * t); }
            }
            const d = distanceFrom(src, reaches, (c) => land[c] && crust.type[c] !== CrustType.OCEAN);
            for (let c = 0; c < n; c++) if (d.reach[c] > 0 && d.km[c] <= d.reach[c]) {
                crust.type[c] = CrustType.OCEAN; seaCells++;
                crust.formedAt[c] = -T * Math.min(1, d.km[c] / Math.max(1, d.reach[c]));
            }
        }
        // the valley: a graben along the rift — M1–M2 (present/ranges.js; owner, 2026-11-05: the worms were its valley and
        // shoulders tracing the plates' zigzag edge): its line the plates' edge smoothed into a curve, in segments stepped en
        // echelon (the rift's basins, an accommodation zone between each two), each deepest and widest toward its middle,
        // broken now and then (present/rifts.js cuts it)
        const open = (c) => land[c] === 1 && crust.type[c] !== CrustType.OCEAN && (plateOf[c] === g.pa || plateOf[c] === g.pb);
        const edge = [...new Set(E.flatMap(e => [e.ca, e.cb]).filter(open))].sort((a, b) => a - b);
        const shaped = edge.length >= 2 ? shapeRange(mesh, { kind: 'rift', front: edge, work: 1, age: T + g.pa * 0.01 + g.pb * 0.0001, style: 'rift', asBuilt: true }, { source: open, reach: open }, config.riftShoulderKm, seed)
            : { front: [], works: [], widths: [] };
        // (and as deep as the plates open there: a rift dies out toward its slow end — the pole the plates turn about — into a
        // broad sag, as East Africa's does into the Okavango; each line cell read off its nearest edge)
        const openAt = (c) => {
            const p = at(mesh.xyz, c);
            let best = 0, bd = -2;
            for (const e of E) { const d = dot(p, at(mesh.xyz, e.ca)); if (d > bd) { bd = d; best = -e.closing; } }
            return smooth01((best - cfg.riftOpenMin) / (cfg.riftOpenFull - cfg.riftOpenMin));
        };
        const line = [], lineAt = new Map();
        const M = cfg.rangeMask, mNoise = M ? maskNoiseOf(seed) : null;
        shaped.front.forEach((c, i) => {
            // (the valley broken by the range mask's noise too — where it is low, no basin: a chain of basins of their own
            // lengths, not one groove; the basins themselves as deep as their plates open)
            if (M && maskAt(mNoise, at(mesh.xyz, c), R / M.waveKm, R / M.warpWaveKm, M.warpKm / R, M.octaves) < -cfg.riftBreak) return;
            const fo = openAt(c), k = Math.min(1, shaped.works[i]) * fo;
            if (!(k > cfg.riftLineMin)) return;
            const wk = Math.min(1, shaped.widths[i] / config.riftShoulderKm);
            const depth = cfg.riftValleyKm[0] + (cfg.riftValleyKm[1] - cfg.riftValleyKm[0]) * k;
            if (depth > riftDepth[c]) {
                riftDepth[c] = depth; riftHalf[c] = cfg.riftHalfKm[0] + (cfg.riftHalfKm[1] - cfg.riftHalfKm[0]) * wk;
                const e = shaped.at.get(c), nrm = normalAt(e);
                for (let j = 0; j < 3; j++) { riftPt[3 * c + j] = e.pt[j]; riftNrm[3 * c + j] = nrm[j]; }
            }
            line.push(c); lineAt.set(c, { k, wk });
        });
        // the dome the rift sits on (the East African plateau: the mantle swelling under it), its own height along the rift
        if (line.length) {
            const d = distanceFrom(line, line.map(() => 3 * cfg.riftDomeWidthKm), (c) => land[c] && crust.type[c] !== CrustType.OCEAN);
            for (let c = 0; c < n; c++) {
                if (!(d.reach[c] > 0) || d.km[c] > d.reach[c]) continue;
                const s = line[d.src[c]], a = cfg.riftDomeKm * (0.5 + strike(s, cfg.riftVaryKm, off[3]));
                crust.baseKm[c] += a * Math.exp(-((d.km[c] / cfg.riftDomeWidthKm) ** 2));
            }
        }
        // the valley's floor is thinned crust: what the old ranges there left (their root, their uplift, their crests) is
        // mostly gone — the graben drops between its shoulders
        const isLine = new Uint8Array(n);
        for (const c of line) {
            isLine[c] = 1;
            crust.rootKm[c] *= cfg.riftThinShare; crust.upliftKm[c] *= cfg.riftThinShare;
            crust.rugged[c] *= cfg.riftThinShare; crust.prevRugged[c] *= cfg.riftThinShare;
        }
        // the shoulders: from beside the valley's line (and the new sea's coast), both flanks — never on the line (they rise
        // beside it), as high and as wide as the valley's segment there; each segment a half-graben, its border fault's
        // shoulder high and the other side's low, the high side flipping from segment to segment
        const src = new Map();
        const add = (c, wk, k) => { const was = src.get(c); if (!was || wk > was.wk) src.set(c, { wk, k: Math.max(k, was?.k ?? 0) }); else was.k = Math.max(was.k, k); };
        for (const c of line) {
            const { k, wk } = lineAt.get(c), e = shaped.at.get(c), nrm = normalAt(e);
            for (let j = mesh.adjOffset[c]; j < mesh.adjOffset[c + 1]; j++) {
                const nb = mesh.adjList[j];
                if (!open(nb) || isLine[nb]) continue;
                const high = Math.sign(dot(at(mesh.xyz, nb), nrm)) === e.seg.polarity;      // (the segments are in the sim mesh's frame)
                add(nb, wk * (high ? 1.1 : 0.6), (0.4 + 0.6 * k) * (high ? cfg.riftBorderHigh : cfg.riftBorderLow));
            }
        }
        for (const e of E) for (const c of [e.ca, e.cb]) {
            if (!open(c) || isLine[c]) continue;
            for (let j = mesh.adjOffset[c]; j < mesh.adjOffset[c + 1]; j++) { const nb = mesh.adjList[j]; if (land[nb] && crust.type[nb] === CrustType.OCEAN) { add(c, 0.8, 0.8); break; } }
        }
        const cells = [...src.keys()].sort((a, b) => a - b);
        if (cells.length) {
            // (the shoulders not masked: they are the rift's own relief, varied enough by its basins and their flipping sides)
            const work = config.riftShoulderWorkKm * cfg.riftShoulderShare;
            spreadBelt(plate, mesh, cells, { type: OrogenyType.RIFT, time: 0, widths: cells.map(c => config.riftShoulderKm * (0.5 + 0.6 * src.get(c).wk)),
                works: cells.map(() => work), amps: cells.map(c => src.get(c).k), widthKm: 0, workKm: 0 }, config, (c) => open(c) && !isLine[c]);
            for (const c of cells) crust.flags[c] |= CrustFlag.RIFT_MARGIN;
            for (const p of [g.pa, g.pb]) stampStart(cells.filter(c => plateOf[c] === p), p, T);
        }
        fronts.push({ kind: 'rift', T, openKm, seaCells, valley: line.length });
    }

    /** km from the sea over the land (as drawn, before any rift opened a sea), once. */
    function seaKmOf() {
        if (seaKm) return seaKm;
        seaKm = new Float64Array(n).fill(Infinity);
        const heap = new MinHeap(4096);
        for (let c = 0; c < n; c++) if (!land[c]) { seaKm[c] = 0; heap.push(0, c); }
        while (heap.size) {
            const c = heap.pop(), dc = heap.lastKey;
            if (dc > seaKm[c]) continue;
            for (let k = mesh.adjOffset[c]; k < mesh.adjOffset[c + 1]; k++) {
                const nb = mesh.adjList[k], nd = dc + R * Math.acos(Math.min(1, dot(at(sim.xyz, c), at(sim.xyz, nb))));
                if (nd < seaKm[nb]) { seaKm[nb] = nd; heap.push(nd, nb); }
            }
        }
        return seaKm;
    }

    /** Is there land of plate `p` within the apron's reach of cell c (a trench this close to a coast is the coast's)? */
    function landNear(c, p) {
        if (land[c]) return true;
        const lim = cfg.andeanCoastKm;
        const seen = new Set([c]); let ring = [c];
        for (let hop = 0; hop * mesh.edgeKm <= lim && ring.length; hop++) {
            const next = [];
            for (const x of ring) for (let k = mesh.adjOffset[x]; k < mesh.adjOffset[x + 1]; k++) {
                const nb = mesh.adjList[k];
                if (seen.has(nb) || plateOf[nb] !== p) continue;
                if (land[nb]) return true;
                seen.add(nb); next.push(nb);
            }
            ring = next;
        }
        return false;
    }
    function normalTo(a, b) {
        const pa = at(xyz, a), pb = at(xyz, b), d = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]], dm = dot(d, pa);
        return unit([d[0] - dm * pa[0], d[1] - dm * pa[1], d[2] - dm * pa[2]]);
    }
    /** km from the sources over the cells `allowed`, each reached cell carrying its source's reach (and which source: src). */
    function distanceFrom(sources, reaches, allowed) {
        const km = new Float64Array(n).fill(Infinity), reach = new Float32Array(n), src = new Int32Array(n).fill(-1), heap = new MinHeap(1024);
        sources.forEach((c, j) => { if (reaches[j] > reach[c] || km[c] > 0) { km[c] = 0; if (reaches[j] > reach[c]) { reach[c] = reaches[j]; src[c] = j; } heap.push(0, c); } });
        while (heap.size) {
            const c = heap.pop(), dc = heap.lastKey;
            if (dc > km[c]) continue;
            for (let k = mesh.adjOffset[c]; k < mesh.adjOffset[c + 1]; k++) {
                const nb = mesh.adjList[k];
                if (!allowed(nb)) continue;
                const nd = dc + R * Math.acos(Math.min(1, dot(at(sim.xyz, c), at(sim.xyz, nb))));
                if (nd < km[nb] && nd <= reach[c]) { km[nb] = nd; reach[nb] = reach[c]; src[nb] = src[c]; heap.push(nd, nb); }
            }
        }
        return { km, reach, src };
    }
    /** The belt just written began T Myr ago (spreadBelt opens its event at the call's time: 0). */
    function stampStart(cells, p, T) {
        // every cell the belt took (its record opened now) gets the start of the front's activity
        for (let c = 0; c < n; c++) if (plateOf[c] === p && crust.oroStart[c] === 0 && crust.oroLast[c] === 0 && crust.oroType[c] !== OrogenyType.NONE) crust.oroStart[c] = -T;
    }

    return { crust, config, fronts, shelfSea, pushes, rift: riftField() };

    /** The rift valleys as the ground reads them: per sim cell, km from the nearest valley line — signed, across the line
     *  where it passes its nearest line cell (M2: so the valley, read between the cells, follows the smooth line itself) —
     *  and its depth and half-width. */
    function riftField() {
        const src = []; for (let c = 0; c < n; c++) if (riftDepth[c] > 0) src.push(c);
        if (!src.length) return null;
        const d = distanceFrom(src, src.map(c => 3 * riftHalf[c] + 2 * mesh.edgeKm), (c) => land[c] === 1);
        const km = new Float32Array(n).fill(1e4), depth = new Float32Array(n), half = new Float32Array(n);
        for (let c = 0; c < n; c++) {
            if (!(d.reach[c] > 0) || d.km[c] > d.reach[c]) continue;
            const s = src[d.src[c]], o = 3 * s, p = at(mesh.xyz, c), q = [riftPt[o], riftPt[o + 1], riftPt[o + 2]], nv = [riftNrm[o], riftNrm[o + 1], riftNrm[o + 2]];
            const dv = [p[0] - q[0], p[1] - q[1], p[2] - q[2]], across = R * dot(dv, nv), along = R * Math.abs(dot(dv, cross(nv, q)));
            // (across the line where its cell stands; past a line cell's own stretch of it, along it too — a gap stays a gap)
            const beyond = Math.max(0, along - 0.7 * mesh.edgeKm);
            km[c] = Math.sign(across || 1) * Math.hypot(across, beyond);
            depth[c] = riftDepth[s]; half[c] = riftHalf[s];
        }
        return { km, depth, half, lines: src.length, signed: true };
    }
}

/** The crust raster's records into the Frame (a world-indexed raster: cell for cell). */
export function writeCrust(frame, crust, foldMyr = TECTONICS.farFoldMyr) {
    const n = frame.owner.length;
    for (let c = 0; c < n; c++) {
        frame.type[c] = crust.type[c];
        frame.formedAt[c] = crust.formedAt[c];
        frame.flags[c] |= crust.flags[c];
        frame.terrane[c] = crust.terrane[c];
        frame.oroType[c] = crust.oroType[c]; frame.oroWork[c] = crust.oroWork[c]; frame.oroStart[c] = crust.oroStart[c]; frame.oroLast[c] = crust.oroLast[c];
        frame.thickKm[c] = crust.thickKm[c];
        frame.beltU[c] = Math.round(255 * Math.min(1, crust.beltU[c])); frame.beltReach[c] = Math.min(65535, Math.round(crust.beltReach[c]));
        frame.beltSide[c] = crust.beltSide[c]; frame.beltShear[c] = crust.beltShear[c];
        frame.prevType[c] = crust.prevType[c]; frame.prevLast[c] = crust.prevLast[c];
        frame.prevU[c] = Math.round(255 * Math.min(1, crust.prevU[c])); frame.prevReach[c] = Math.min(65535, Math.round(crust.prevReach[c]));
        frame.prevSide[c] = crust.prevSide[c]; frame.prevShear[c] = crust.prevShear[c];
        frame.rootKm[c] = crust.rootKm[c]; frame.upliftKm[c] = crust.upliftKm[c]; frame.baseKm[c] = crust.baseKm[c];
        frame.rugged[c] = crust.rugged[c]; frame.prevRugged[c] = crust.prevRugged[c]; frame.volcWornKm[c] = crust.volcWornKm[c];
        frame.volcType[c] = crust.volcType[c]; frame.volcAt[c] = crust.volcAt[c]; frame.volcKm[c] = crust.volcKm[c]; frame.volcSource[c] = crust.volcSource[c];
        // (G4d: the far field — the push the crust took, now: its grain, its folds, its axis — as tectonics/snapshot.js writes it)
        frame.farWork[c] = crust.farWork[c]; frame.farDist[c] = Math.min(65535, Math.round(crust.farDist[c]));
        frame.farFold[c] = recentPush(crust.farFold[c], crust.farAt[c], 0, foldMyr);
        frame.farDir[3 * c] = crust.farDx[c]; frame.farDir[3 * c + 1] = crust.farDy[c]; frame.farDir[3 * c + 2] = crust.farDz[c];
        // (G7c: the geological record — present/record.js — packed as tectonics/snapshot.js packs it, at time 0)
        if (crust.type[c] !== CrustType.OCEAN) {
            frame.geoFlags[c] = crust.geoFlags[c]; frame.arcMyr[c] = encodeArcMyr(crust.arcMyr[c]);
            frame.coverKm[c] = encodeCoverKm(crust.coverKm[c]); frame.coverMaxKm[c] = encodeCoverKm(crust.coverMaxKm[c]);
            frame.coverMaxAge[c] = crust.coverMaxKm[c] > 0 ? encodeAge(-crust.coverMaxAt[c]) : 0;
            frame.facies[c] = crust.coverKm[c] > 0 ? encodeFacies(crust.coverCarb[c], crust.coverSalt[c], crust.coverCoal[c], crust.coverOrganic[c]) : 0;
            frame.exhumKm[c] = encodeExhumKm(crust.exhumKm[c]); frame.unroofKm[c] = encodeUnroofKm(crust.unroofKm[c]);
            frame.floodMyr[c] = encodeFloodMyr(crust.floodMyr[c]); frame.floodAge[c] = encodeFloodAge(crust.floodLast[c], 0, crust.floodMyr[c] > 0);
        }
    }
}
