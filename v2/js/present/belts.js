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
import { makeRng } from '../../../js/rng.js';
import { MinHeap } from '../core/min-heap.js';
import { Boundary } from './plates.js';
import { PRESENT } from './present-config.js';

const R = 6371, DEG = 180 / Math.PI;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return l > 1e-15 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]; };
const at = (xyz, c) => [xyz[3 * c], xyz[3 * c + 1], xyz[3 * c + 2]];

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
 * @returns {{crust: CrustRaster, config: Object, fronts: Object[]}}  the raster (type, formedAt and the records); the
 *   fronts as built (for the checks and the readout)
 */
export function presentBelts(L, W, B, land, sea, cfg = PRESENT, config = presentTectonics(), crust = null) {
    const { xyz, sim, seed } = L, n = L.mesh.numRegions, mesh = sim;
    const plateOf = W.cellPlate, plates = W.plates;
    if (!crust) crust = newCrust(L, land, sea);
    const plate = { crust };

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
        const andean = { cells: [], widths: [], works: [], shears: [] }, arc = { cells: [], widths: [], works: [], shears: [], slab: [] };
        const laramide = { cells: [], widths: [], works: [], shears: [] };
        for (const e of E) {
            const overA = B.over[e.i] === 0, over = overA ? e.ca : e.cb, down = overA ? e.cb : e.ca, op = plateOf[over];
            const rateKmMyr = Math.abs(e.closing), rate = rateKmMyr / 10, slabKm = rateKmMyr * T, slabAge = sea.ageMyr[down];
            const shape = beltShape(e.headOn, slabAge, config);
            // land on the upper plate within the apron's reach: an Andean margin; else an island arc at sea
            if (landNear(over, op)) {
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
                    laramide.cells.push(over); laramide.works.push(work * beltShape(e.headOn, undefined, config)); laramide.shears.push(e.shear);
                    laramide.widths.push(Math.min(config.belts.laramide.maxKm, Math.max(steep, beltWidthKm('laramide', flatKm, rate, config)) * shape));
                } else {
                    andean.cells.push(over); andean.works.push(work * beltShape(e.headOn, undefined, config)); andean.shears.push(e.shear);
                    andean.widths.push(Math.min(config.belts.andean.maxKm, steep));
                }
            } else if (slabKm > config.arcMatureConsumedKm && rate >= cfg.arcMinRateCmYr && slabAge >= cfg.arcMinSlabMyr) {
                // (an island arc rises where old, dense floor goes down fast — the Marianas, Tonga; a slow or young slab
                // leaves a submarine ridge at most)
                arc.cells.push(over); arc.slab.push(slabKm); arc.shears.push(e.shear);
                arc.works.push(slabKm * config.andeanWorkShare * beltShape(e.headOn, undefined, config));
                arc.widths.push(Math.min(config.arcBeltMaxKm, beltWidthKm('andean', slabKm * config.andeanWorkShare, rate, config) * shape));
            }
        }
        const plateSide = (p) => (c) => plateOf[c] === p;
        const overPlate = (cells) => cells.length ? plateOf[cells[0]] : -1;
        if (andean.cells.length) for (const p of new Set(andean.cells.map(c => plateOf[c]))) {
            const sel = andean.cells.map((c, j) => j).filter(j => plateOf[andean.cells[j]] === p);
            spreadBelt(plate, mesh, sel.map(j => andean.cells[j]), { type: OrogenyType.ANDEAN, time: 0, widths: sel.map(j => andean.widths[j]), works: sel.map(j => andean.works[j]), shears: sel.map(j => andean.shears[j]), widthKm: 0, workKm: 0 }, config, plateSide(p));
            stampStart(sel.map(j => andean.cells[j]), p, T);
        }
        if (laramide.cells.length) for (const p of new Set(laramide.cells.map(c => plateOf[c]))) {
            const sel = laramide.cells.map((c, j) => j).filter(j => plateOf[laramide.cells[j]] === p);
            spreadBelt(plate, mesh, sel.map(j => laramide.cells[j]), { type: OrogenyType.LARAMIDE, time: 0, widths: sel.map(j => laramide.widths[j]), works: sel.map(j => laramide.works[j]), shears: sel.map(j => laramide.shears[j]), widthKm: 0, workKm: 0 }, config, plateSide(p));
            stampStart(sel.map(j => laramide.cells[j]), p, T);
        }
        if (arc.cells.length) {
            // the arc's crust: a strip of the upper plate behind the trench, as wide as the arc is mature (a chain of islets
            // → a Philippines → an Indonesia), set back a little from the trench (the fore-arc)
            const p = overPlate(arc.cells);
            const widthKm = arc.cells.map((c, j) => Math.min(cfg.arcMaxKm, config.arcRowWidthKm * (1 + (arc.slab[j] - config.arcMatureConsumedKm) / config.arcWidenSlabKm)));
            const d = distanceFrom(arc.cells, widthKm, (c) => plateOf[c] === p && !land[c] && crust.type[c] === CrustType.OCEAN);
            const front = [];
            for (let c = 0; c < n; c++) {
                if (d.reach[c] <= 0) continue;
                if (d.km[c] < cfg.foreArcKm || d.km[c] > d.reach[c]) continue;
                // (the arc's crust no older than arcAgeMyr: an open-ocean arc keeps being built and rebuilt, and an old,
                // mature one would stand as a continuous ridge of land — Evolution's arcs are chains of islands)
                crust.type[c] = CrustType.ARC; crust.formedAt[c] = -Math.min(T, cfg.arcAgeMyr);
                if (d.km[c] < cfg.foreArcKm + mesh.edgeKm) front.push(c);
            }
            if (front.length) {
                spreadBelt(plate, mesh, front, { type: OrogenyType.ARC, time: 0, widthKm: Math.max(...arc.widths), workKm: Math.max(...arc.works) }, config, (c) => plateOf[c] === p);
                stampStart(front, p, T);
            }
        }
        fronts.push({ kind: 'subduction', T, andean: andean.cells.length, laramide: laramide.cells.length, arc: arc.cells.length });
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
                cells.push(c); works.push(W0 * beltShape(e.headOn, undefined, config)); shears.push(e.shear);
                widths.push(Math.min(config.belts[kind].maxKm, beltWidthKm(kind, W0, rate, config) * beltShape(e.headOn, undefined, config)));
            }
            if (!cells.length) continue;
            const type = lengthKm < config.sutureMinContactKm ? OrogenyType.URAL : OrogenyType.HIMALAYAN;
            spreadBelt(plate, mesh, cells, { type, time: 0, side: type === OrogenyType.URAL ? BeltSide.NONE : side, widths, works, shears, widthKm: 0, workKm: 0 }, config, (c) => plateOf[c] === p);
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
                cells.push(c); works.push(W0); shears.push(e.shear);
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
        // how far it has opened: a young sea down its middle once that is more than a cell or so wide (the Red Sea)
        const openKm = E.reduce((s, e) => s + Math.max(0, -e.closing), 0) / Math.max(1, E.length) * T;
        if (openKm > cfg.riftSeaMinKm) {
            const half = 0.5 * openKm, src = E.flatMap(e => [e.ca, e.cb]);
            const d = distanceFrom(src, src.map(() => half), (c) => land[c] && crust.type[c] !== CrustType.OCEAN);
            for (let c = 0; c < n; c++) if (d.reach[c] > 0 && d.km[c] <= d.reach[c]) {
                crust.type[c] = CrustType.OCEAN;
                crust.formedAt[c] = -T * Math.min(1, d.km[c] / Math.max(1, half));
            }
        }
        // the shoulders: from the rift's own edge cells (the new sea's coast, or the rift line), both flanks
        for (const p of [g.pa, g.pb]) {
            const cells = [];
            for (let c = 0; c < n; c++) {
                if (plateOf[c] !== p || crust.type[c] === CrustType.OCEAN) continue;
                // a land cell of this plate on the rift: beside the other plate, or beside the sea the rift opened
                let edge = false;
                for (let k = mesh.adjOffset[c]; k < mesh.adjOffset[c + 1]; k++) {
                    const nb = mesh.adjList[k];
                    if ((plateOf[nb] === (p === g.pa ? g.pb : g.pa) && land[nb]) || (land[nb] && crust.type[nb] === CrustType.OCEAN)) { edge = true; break; }
                }
                if (edge) cells.push(c);
            }
            if (!cells.length) continue;
            spreadBelt(plate, mesh, cells, { type: OrogenyType.RIFT, time: 0, widthKm: config.riftShoulderKm, workKm: config.riftShoulderWorkKm * cfg.riftShoulderShare }, config, (c) => plateOf[c] === p);
            for (const c of cells) crust.flags[c] |= CrustFlag.RIFT_MARGIN;
            stampStart(cells, p, T);
        }
        fronts.push({ kind: 'rift', T, openKm });
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
    /** km from the sources over the cells `allowed`, each reached cell carrying its source's reach. */
    function distanceFrom(sources, reaches, allowed) {
        const km = new Float64Array(n).fill(Infinity), reach = new Float32Array(n), heap = new MinHeap(1024);
        sources.forEach((c, j) => { if (reaches[j] > reach[c] || km[c] > 0) { km[c] = 0; reach[c] = Math.max(reach[c], reaches[j]); heap.push(0, c); } });
        while (heap.size) {
            const c = heap.pop(), dc = heap.lastKey;
            if (dc > km[c]) continue;
            for (let k = mesh.adjOffset[c]; k < mesh.adjOffset[c + 1]; k++) {
                const nb = mesh.adjList[k];
                if (!allowed(nb)) continue;
                const nd = dc + R * Math.acos(Math.min(1, dot(at(sim.xyz, c), at(sim.xyz, nb))));
                if (nd < km[nb] && nd <= reach[c]) { km[nb] = nd; reach[nb] = reach[c]; heap.push(nd, nb); }
            }
        }
        return { km, reach };
    }
    /** The belt just written began T Myr ago (spreadBelt opens its event at the call's time: 0). */
    function stampStart(cells, p, T) {
        // every cell the belt took (its record opened now) gets the start of the front's activity
        for (let c = 0; c < n; c++) if (plateOf[c] === p && crust.oroStart[c] === 0 && crust.oroLast[c] === 0 && crust.oroType[c] !== OrogenyType.NONE) crust.oroStart[c] = -T;
    }

    return { crust, config, fronts };
}

/** The crust raster's records into the Frame (a world-indexed raster: cell for cell). */
export function writeCrust(frame, crust) {
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
    }
}
