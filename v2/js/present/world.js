// The present-day world, put together (plans/GENERATE_REDESIGN_PLAN.md): from Generate's layout and its plates that
// move, the crust as edited, its coast drawn, its boundaries, its sea floor's past, the Frame — and the ground: Evolution's
// terrain synthesis and carving on Generate's own render mesh, in km.

import { meshFromArrays } from '../core/sim-mesh.js';
import { preparePlan, surfaceRange, carveInputs, settleFields, carveLadder, carveSettings } from '../terrain/synthesize.js';
import { sampleOnto, terrainMesh } from '../terrain/terrain-mesh.js';
import { carveTerrain } from '../terrain/carve.js';
import { surfaceConfig } from '../finish/finish.js';
import { terrainConfig } from '../terrain/terrain-config.js';
import { buildPresentPlates, classifyBoundaries, cellLandNow } from './plates.js';
import { naturalCoast } from './coast.js';
import { seaFloorAges } from './seafloor.js';
import { presentFrame } from './frame.js';
import { presentBelts, presentTectonics, newCrust } from './belts.js';
import { presentPast } from './past.js';
import { presentPlumes, presentFarField } from './plumes.js';
import { knobOverrides, reliefShareOf } from './knobs.js';
import { addFineRelief } from './relief.js';
import { heldCells, holdToPieces } from './hold.js';
import { pieceSeams, sagSeams, frontDistance } from './seams.js';
import { bentPieces } from './warp.js';
import { cutRifts } from './rifts.js';
import { continentFits, interlockCoasts } from './fit.js';
import { presentRecord } from './record.js';
import { PRESENT, PRESENT_TERRAIN } from './present-config.js';

const tMeshes = new WeakMap();
/** Generate's render mesh as a terrain mesh (SimMesh-shaped), its positions turned into Evolution's z-up frame. */
export function presentTerrainMesh(genMesh, r_xyz) {
    let t = tMeshes.get(genMesh);
    if (t && t.numCells === genMesh.numRegions) return t;
    const n = genMesh.numRegions, xyz = new Float32Array(3 * n);
    for (let r = 0; r < n; r++) { xyz[3 * r] = r_xyz[3 * r + 2]; xyz[3 * r + 1] = r_xyz[3 * r]; xyz[3 * r + 2] = r_xyz[3 * r + 1]; }
    t = meshFromArrays({ numCells: n, xyz, adjOffset: genMesh.adjOffset, adjList: genMesh.adjList });
    tMeshes.set(genMesh, t);
    return t;
}

/**
 * Everything of the present-day world but its plates (present/plates.js, built once per layout).
 * @param {{L, P}} present  the layout and its plates   @param {Uint8Array} pieceLandNow  each piece's land as edited
 * @param {Object} genMesh  Generate's render mesh   @param {Float32Array} r_xyz  its positions (Generate's frame)
 * @param {{seed: number, terrain?: Object, knobs?: Object, regionLand?: Uint8Array, regionCell?: Int32Array,
 *   regionPlate?: Int16Array}} o  terrain: terrain-config overrides; regionLand, regionCell, regionPlate: each region's
 *   piece as edited (1: land), its sim cell and its plate
 *   — given, the ground is held to the pieces (present/hold.js)
 * @returns {{land, B, sea, frame, mask, heightKm: Float32Array, ms: Object}}  mask: what the hold read (for Reapply)
 */
export function presentWorld(present, pieceLandNow, genMesh, r_xyz, o) {
    const { L, P } = present, ms = {}, clock = () => performance.now();
    let t0 = clock();
    const crustLand = cellLandNow(L, P, pieceLandNow);
    const land = naturalCoast(L, crustLand, P.cellPlate);
    ms.coast = clock() - t0; t0 = clock();
    const B = classifyBoundaries(L, P, land, undefined, crustLand);
    ms.boundaries = clock() - t0; t0 = clock();
    const sea = seaFloorAges(L, P, B, land);
    ms.seaFloor = clock() - t0; t0 = clock();
    // the continents' past first (G4: old orogenies replayed), then today's belts over it
    const config = presentTectonics(), crust = newCrust(L, land, sea);
    // (M4: the past is the layout's as first built — `o.unedited`: its plates and its pieces' land before any edit. An edit
    // changes today's world, its coasts, plates and belts, not the history: a piece sunk takes its past under with it, a
    // piece raised is young land with none of its own, and the rest of the planet keeps the past it had — so a Ctrl-click
    // reshapes the place clicked, as on the old page, not every range on the planet. A planet code's edits read the same.)
    const base = o.unedited && o.unedited.P !== P ? o.unedited : null;
    if (base && !base.land) {
        base.crustLand = cellLandNow(L, base.P, base.pieceLand);
        base.land = naturalCoast(L, base.crustLand, base.P.cellPlate);
        base.B = classifyBoundaries(L, base.P, base.land, undefined, base.crustLand);
    }
    const pastP = base?.P ?? P, pastB = base?.B ?? B, pastLand = base?.land ?? land, pastCrustLand = base?.crustLand ?? crustLand;
    // (G3b: the inner seams — where two land pieces of one plate meet — replayed with the past, or sagged)
    // (G4c: the pieces' outlines bent — by today's plates' drag and a slow warp — and the smaller terranes within them)
    const bent = bentPieces(L, pastP, pastB, pastLand, pastCrustLand);
    // (G5b: the continents that fit across their ocean, and the rotation that closes it — today's coasts', and the past's)
    const fits = continentFits(L, P, land), pastFits = base ? (base.fits ??= continentFits(L, pastP, pastLand)) : fits;
    const seams = pieceSeams(L, pastP, pastLand, pastCrustLand, PRESENT, bent.wp);
    const past = presentPast(L, pastLand, crust, config, PRESENT, seams.events, { ...bent, fits: pastFits });
    past.bent = bent;
    sagSeams(L, pastLand, crust, seams.sags);
    if (base) drownPast(crust, newCrust(L, land, sea), land, pastLand);
    past.seams = { closing: seams.events.length, parting: seams.sags.length, count: seams.count };
    past.sagCells = seams.sags.flatMap(s => s.cells);         // (the parting seams: old failed rifts — the record's rift basins)
    ms.past = clock() - t0; t0 = clock();
    const belts = presentBelts(L, P, B, land, sea, undefined, config, crust, bent.sub);
    belts.past = past;
    ms.belts = clock() - t0; t0 = clock();
    // G5: today's collisions squeezing up old sutures far inland; the plumes' tracks and flood basalts
    belts.far = presentFarField(L, P, B, land, crust, config, PRESENT, belts.pushes);
    belts.plumes = presentPlumes(L, P, land, crust);
    // (G7c: the geological record, in closed form — what the rocks, the deposits and the food read)
    belts.record = presentRecord(L, land, crust, past, config.geology);
    ms.plumes = clock() - t0; t0 = clock();
    const frame = presentFrame(L, P, B, land, sea, belts.crust);
    ms.frame = clock() - t0; t0 = clock();
    // (G2c: the ground held to the pieces on Generate's mesh — each region by its own piece, as edited)
    const mask = o.regionLand ? { regionLand: o.regionLand, regionCell: o.regionCell, regionPlate: o.regionPlate ?? null, ...heldCells(frame, L.sim, crustLand, PRESENT, belts.shelfSea), rift: belts.rift,
        fit: fits.pairs.some(p => p.ok) ? { pairs: fits.pairs.map(p => ({ R: p.R, Rinv: p.Rinv, Rh: p.Rh, Rhinv: p.Rhinv, massA: p.massA, massB: p.massB })), side: fits.side, mass: fits.mass } : null, seed: o.seed } : null;
    belts.fits = fits;
    // (G3b: the grain — how far each place lies from a closing front, today's or the past's)
    const frontKm = frontDistance(L, B, land, past.events);
    const G = presentGroundOf(frame, L.sim, genMesh, r_xyz, { ...o, mask, frontKm });
    Object.assign(ms, G.ms);
    return { land, B, sea, belts, frame, mask, frontKm, heightKm: G.heightKm, drainage: G.drainage, receivers: G.receivers, order: G.order, lava: G.lava, young: G.young, cut: G.cut, surface: G.surface, ms };
}

/** M4: where land of the past is sea now (a piece sunk by an edit), the crust as the sea floor it became — every record
 *  of the past there dropped (`fresh`: the crust as today's land and sea floor alone would have it). */
function drownPast(crust, fresh, land, pastLand) {
    const n = crust.numCells, keys = Object.keys(crust).filter(k => ArrayBuffer.isView(crust[k]) && crust[k].length === n);
    for (let c = 0; c < n; c++) if (pastLand[c] && !land[c]) for (const k of keys) crust[k][c] = fresh[k][c];
}

/** The layout as first built, for the past (presentWorld's `o.unedited`): its plates (present/plates.js on the pieces'
 *  land before any edit) and each piece's land then. */
export function uneditedLayout(L, originalOcean) {
    const L0 = { ...L, pieceOcean: originalOcean };
    return { P: buildPresentPlates(L0), pieceLand: Uint8Array.from(L.pieceIds, id => (originalOcean.has(id) ? 0 : 1)) };
}

/**
 * Only the ground — Evolution's synthesis and carving of a Frame on Generate's mesh, with the sculpting knobs (G6,
 * present/knobs.js) — so Reapply keeps the Frame and redraws just this.
 * @param {{seed: number, knobs?: Object, terrain?: Object, relief?: number, mask?: Object}} o  mask: hold the ground
 *   to the pieces (presentWorld's `mask`)
 */
export function presentGroundOf(frame, sim, genMesh, r_xyz, o) {
    const ms = {}, clock = () => performance.now();
    let t0 = clock();
    const tMesh = presentTerrainMesh(genMesh, r_xyz);
    ms.terrainMesh = clock() - t0; t0 = clock();
    const cfg = terrainConfig(presentTerrainOverrides(o));
    const T = presentSynthesize(frame, sim, tMesh, cfg, o.seed, o.relief ?? reliefShareOf(o.knobs ?? {}), o.mask ?? null, o.frontKm ?? null, o.finish ?? null);
    ms.terrain = clock() - t0;
    Object.assign(ms, Object.fromEntries(Object.entries(T.ms).map(([k, v]) => [`  ${k}`, v])));
    return { heightKm: T.heightKm, drainage: T.drainage ?? null, receivers: T.receivers ?? null, order: T.order ?? null, lava: T.lava ?? null, young: T.young ?? null, cut: T.cut ?? null, surface: T.surface ?? null, ms };
}
/** The terrain config's overrides the present-day ground is drawn with (its own, the sculpting knobs', any given) — the
 *  finish's too (finish-worker.js `terrain`). */
export const presentTerrainOverrides = (o = {}) => ({ ...PRESENT_TERRAIN, ...knobOverrides(o.knobs ?? {}), ...(o.terrain ?? {}) });

/** The step of the rivers' cut (km a step, a byte: Evolution's finish.js geo.cutStepKm). */
export const CUT_STEP_KM = 0.02;

/**
 * Evolution's terrain synthesis and carving (terrain/synthesize.js synthesizeTerrain, step for step — the same surface
 * when `relief` is 0), with the fine relief (present/relief.js, G6d) laid down between the two, so the rivers carve it.
 * `finish` (the finish's config, finish-config.js FINISH with the knobs': knobs.js finishOverrides): the uncarved ground
 * kept too, as `surface` — what Evolution's finish starts from instead of its own (finish.js finishPlanet's `surface`;
 * plans/SHARED_CORE_PLAN.md U1): its heights, the carving's inputs at the finish's erosion strength, and each cell's
 * record and structure for the rocks. The ground carved here is the first picture; the finish carves the same surface
 * again, by the climate's runoff.
 */
export function presentSynthesize(frame, sim, tMesh, cfg, seed, relief, mask = null, frontKm = null, finish = null) {
    const ms = {}, clock = () => performance.now();
    let t0 = clock();
    const plan = preparePlan(frame, sim, cfg, seed, tMesh.edgeKm);
    ms.records = clock() - t0; t0 = clock();
    const S = sampleOnto(sim, tMesh, cfg, seed);
    ms.sample = clock() - t0; t0 = clock();
    const n = tMesh.numCells, heightKm = new Float32Array(n);
    const carveIn = cfg.carveTimeMyr > 0 || finish ? carveInputs(n) : null;
    // (for the finish: the erodibility at its strength beside this one's — the rest of the carving's inputs are the same —
    // and the record each cell shows)
    const alt = finish ? surfaceConfig(finish, cfg) : null, recCell = finish ? new Int32Array(n) : null, cues = finish ? new Int8Array(3 * n) : null;
    if (alt) carveIn.kAlt = new Float32Array(n);
    surfaceRange(plan, alt ? { ...cfg, carveAlt: alt } : cfg, seed, tMesh.edgeKm, tMesh.xyz, S.cells, S.weights, 0, n, heightKm, null, carveIn, recCell, cues);
    ms.surface = clock() - t0; t0 = clock();
    addFineRelief(heightKm, tMesh.xyz, tMesh.edgeKm, seed, cfg, relief, frontKm ? { frontKm, cells: S.cells, weights: S.weights } : null);
    // (G3f: the rift valleys cut, then the ground held to the pieces)
    if (mask?.rift) cutRifts(heightKm, mask.rift, S);
    // (G5b: the coasts of the continents that fit, made to interlock)
    if (mask?.fit) mask.fitShelf = interlockCoasts(heightKm, mask, tMesh);
    if (mask) holdToPieces(heightKm, mask, tMesh, S);
    ms.relief = clock() - t0;
    let surface = null;
    if (finish) {
        const { kAlt, ...inputs } = carveIn, own = {};
        for (const [key, a] of Object.entries(inputs)) own[key] = key === 'k' ? kAlt : a.slice();
        surface = { heightKm: heightKm.slice(), carveIn: own, recCell, cues };
        delete carveIn.kAlt;
    }
    if (!carveIn || !(cfg.carveTimeMyr > 0)) return { heightKm, ms, surface };
    t0 = clock();
    const C = carveTerrain(carveLadder(sim, tMesh, terrainMesh), { ...carveIn, z: heightKm }, carveSettings(cfg), settleFields(frame, sim, tMesh, cfg, seed));
    ms.carve = clock() - t0;
    // (G7c, as the finish keeps them: where flood basalt still caps the ground after the carving — its pile not cut
    // through: the rocks' basalt — how young the mountains are, 1 while a belt still rises: the food's renewed soils —
    // and how deep the rivers cut, from the surface before the carving, in CUT_STEP_KM steps: the rocks' cover stripped
    // where a region is cut deep, the deposits bared — finish.js's geo.cut)
    const lava = new Uint8Array(n), young = new Uint8Array(n), cut = new Uint8Array(n);
    for (let c = 0; c < n; c++) {
        if (carveIn.lip[c] > 0) { const t = Math.min(1, Math.max(0, (C.z[c] - carveIn.lipBase[c]) / 0.05)); lava[c] = Math.round(255 * carveIn.lip[c] * t * t * (3 - 2 * t)); }
        young[c] = Math.round(255 * Math.max(0, Math.min(1, carveIn.hold[c])));
        cut[c] = Math.min(255, Math.max(0, Math.round((heightKm[c] - C.z[c]) / CUT_STEP_KM)));
    }
    return { heightKm: C.z, drainage: C.area, receivers: C.recv, order: C.order, lava, young, cut, ms, surface };
}

/**
 * The rivers to draw (G7a): every land cell draining at least `minKm2` (rain-weighted, km² — the same rivers at every
 * Detail), a reach from it to the cell it drains into (or the sea cell it pours into); its size 0…1 by log of its area.
 */
export function presentRivers(heightKm, drainage, receivers, minKm2 = 60000, fullKm2 = 3e6) {
    if (!drainage || !receivers) return { count: 0, from: new Int32Array(0), to: new Int32Array(0), size: new Float32Array(0) };
    const from = [], to = [], size = [], lg = Math.log(fullKm2 / minKm2);
    for (let c = 0; c < heightKm.length; c++) {
        if (heightKm[c] <= 0 || drainage[c] < minKm2) continue;
        const r = receivers[c], d = r >= 0 ? r : -1 - r;
        from.push(c); to.push(d); size.push(Math.min(1, Math.log(drainage[c] / minKm2) / lg));
    }
    return { count: from.length, from: Int32Array.from(from), to: Int32Array.from(to), size: Float32Array.from(size) };
}
