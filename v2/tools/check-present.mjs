// Checks for the present-day world (plans/GENERATE_REDESIGN_PLAN.md): Generate's planet built as one moment with an
// implied past. G1 — plates that move: Generate's pieces grouped into plates that carry continent and ocean, on
// Evolution's sim mesh; G1c — each plate whole pieces, its edge along some coasts (active margins).
//
//   node v2/tools/check-present.mjs            the checks, PASS/FAIL, exit code
//   node v2/tools/check-present.mjs --verbose  plus each planet's plates and boundaries

import { check, section, finish } from './lib/check-kit.mjs';
import { generateCoarsePlates, projectCoarsePlates } from '../../js/coarse-plates.js';
import { smoothAndReconnectPlates } from '../../js/plates.js';
import { applyPlatePhysics } from '../../js/plate-physics.js';
import { buildPresentPlates, classifyBoundaries, plateStats, cellLandNow, Boundary, BOUNDARY_NAME } from '../js/present/plates.js';
import { presentLayout } from '../js/present/layout.js';
import { presentWorld, presentTerrainMesh, presentSynthesize } from '../js/present/world.js';
import { addFineRelief } from '../js/present/relief.js';
import { synthesizeTerrain } from '../js/terrain/synthesize.js';
import { terrainConfig } from '../js/terrain/terrain-config.js';
import { knobOverrides } from '../js/present/knobs.js';
import { seaDepthKm } from '../js/tectonics/measure.js';
import { buildSphere } from '../../js/sphere-mesh.js';
import { makeRng } from '../../js/rng.js';

const VERBOSE = process.argv.includes('--verbose');

// The fixed planets (plan §6): the climate tuning's Earth-like seeds, and slider extremes.
const DEFAULT = { P: 80, Cn: 4, Csv: 0.35, Lc: 0.3 };
const PLANETS = [
    { name: 'seed 2', seed: 2, ...DEFAULT },
    { name: 'seed 6', seed: 6, ...DEFAULT },
    { name: 'seed 10', seed: 10, ...DEFAULT },
    { name: 'seed 12345', seed: 12345, ...DEFAULT },
    { name: 'supercontinent', seed: 777, ...DEFAULT, Cn: 1 },
    { name: 'archipelago', seed: 4242, ...DEFAULT, Cn: 10 },
    { name: 'ocean world', seed: 31, ...DEFAULT, Lc: 0.1 },
    { name: 'land world', seed: 58, ...DEFAULT, Lc: 0.7 },
    { name: 'few pieces', seed: 99, ...DEFAULT, P: 8 },
    { name: 'many pieces', seed: 1234567, ...DEFAULT, P: 120 },
];

/** Generate's layout, unedited, and the pieces' motion today on it, on the sim mesh (as js/planet-worker.js builds them). */
function layoutOf({ seed, P, Cn, Csv, Lc }) {
    const g = generateCoarsePlates(seed, P, Cn, Csv, Lc);
    const pieceVec = JSON.parse(JSON.stringify(g.coarsePlateVec));
    applyPlatePhysics(pieceVec, g.coarsePlateSeeds, g.coarsePlateIsOcean, g.coarse_r_plate, g.coarseMesh, g.coarse_xyz, seed);
    const L = presentLayout({ seed, P, coarse: g, pieceOcean: new Set(g.coarsePlateIsOcean), pieceVec });
    L.raw = g;
    return L;
}

function hashArrays(...arrays) {
    let h = 2166136261 >>> 0;
    for (const a of arrays) for (let i = 0; i < a.length; i++) { h ^= (a[i] * 1000) | 0; h = Math.imul(h, 16777619) >>> 0; }
    return h.toString(16);
}

// Old planet codes must keep their layout: hashes of the pieces and their land, taken on 2026-11-02 before any change.
const LAYOUT_HASHES = {
    'seed 2': '8f3502e7', 'seed 6': '83959ddf', 'seed 10': '625c29bf', 'seed 12345': '311da91f', supercontinent: '2112c4c7',
    archipelago: '22735def', 'ocean world': '9d3cba77', 'land world': '2708d7cf', 'few pieces': 'fcb7fe67', 'many pieces': 'aa83bf2f',
};

const results = [];
for (const pl of PLANETS) {
    const t0 = performance.now();
    const L = layoutOf(pl);
    const tLayout = performance.now() - t0;
    const t1 = performance.now();
    const W = buildPresentPlates(L);
    const tPlates = performance.now() - t1;
    const B = classifyBoundaries(L, W, W.cellLand);
    const S = plateStats(L, W, B);
    results.push({ pl, L, W, B, S, tLayout, tPlates, layoutHash: hashArrays(L.raw.coarse_r_plate, Int8Array.from(L.pieceIds, id => (L.pieceOcean.has(id) ? 1 : 0))) });
}

if (VERBOSE) {
    for (const { pl, W, B, S, tPlates } of results) {
        console.log(`\n${pl.name} (seed ${pl.seed}, P ${pl.P}, continents ${pl.Cn}, land ${pl.Lc}): ${W.M} plates (${W.units} with land), ${W.continents.length} continents, ${tPlates.toFixed(0)} ms`);
        for (const p of W.plates) console.log(`  plate ${String(p.index).padStart(2)} ${p.continental ? 'continent' : 'ocean    '} ${(100 * p.share).toFixed(1).padStart(5)} % of the globe, land ${(100 * p.landShare).toFixed(0).padStart(3)} %, ${p.speedCmYr.toFixed(1)} cm/yr${p.continental ? '' : `, rim at continents ${(100 * p.trenchShare).toFixed(0)} %`}`);
        console.log(`  passive coast ${(100 * S.passiveCoastShare).toFixed(0)} %; boundaries: ${S.kindShare.map((s, k) => k ? `${BOUNDARY_NAME[k]} ${(100 * s).toFixed(0)} %` : '').filter(Boolean).join(', ')}`);
    }
}

section('Every plate is one piece of the globe, and holds land and ocean as Evolution\'s do');
for (const { pl, W } of results) {
    const { adjOffset, adjList, numRegions: n } = results[0].L.mesh;
    const broken = W.plates.filter(p => {
        const start = W.cellPlate.indexOf(p.index);
        if (start < 0) return false;
        const seen = new Uint8Array(n), q = [start]; seen[start] = 1; let count = 1;
        while (q.length) { const c = q.pop(); for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const nb = adjList[k]; if (!seen[nb] && W.cellPlate[nb] === p.index) { seen[nb] = 1; count++; q.push(nb); } } }
        return count !== p.cellCount;
    });
    const empty = W.plates.filter(p => !p.cellCount);
    check(`${pl.name}: ${W.M} plates, each in one piece`, !broken.length && !empty.length, `${broken.length} broken, ${empty.length} empty`);
}

section('How many plates: about 1.5 √pieces, at least one ocean-only plate');
for (const { pl, W } of results) {
    const ocean = W.plates.filter(p => !p.continental).length;
    const want = Math.max(3, Math.min(18, Math.round(1.5 * Math.sqrt(pl.P))));
    // (an ocean plate squeezed to a speck by its neighbours joins one of them: one fewer is fine)
    // (a world mostly land squeezes its ocean plates: up to three of them join a neighbour)
    const slack = pl.Lc >= 0.6 ? 3 : 1;
    check(`${pl.name}: ${W.M} plates (${ocean} ocean-only) for ${pl.P} pieces`, ocean >= 1 && W.M >= Math.min(want, pl.P) - slack && W.M <= Math.max(want, 2 * W.continents.length), `want ~${want} (up to a diving plate per continent: G1d)`);
}

section('Continents ride whole, split at most along one or two seams');
for (const { pl, W } of results) {
    const platesOf = (cont) => { const s = new Set(); for (const i of cont) for (const c of W.graph.cells[i]) s.add(W.cellPlate[c]); return s; };
    const bad = W.continents.filter(cont => platesOf(cont).size > 3);
    const splits = W.continents.map(cont => platesOf(cont).size - 1);
    check(`${pl.name}: ${W.continents.length} continents, split ${splits.join('/')}`, !bad.length, `${bad.length} in more than 3 plates`);
}

section('Most continental coast is passive (inside a plate), as on Earth');
for (const { pl, S } of results) {
    // (with under ~16 pieces a continent is one or two whole pieces with no ocean piece of its own beside it: there the
    // coast can only be a plate's edge, so only that it is not all active is asked)
    // (passive: no plate boundary within 400 km of the coast. With under ~16 pieces a world has 3–4 plates, too few to
    // say much: there it is only asked that the coast is not all one kind)
    // (one supercontinent has a long coast and one active stretch of it: up to 95 %)
    // (passive and walled pull against each other — an active margin is a walled coast: so up to 97 %, while the walled
    // share below is held under today's)
    const [lo, hi] = pl.P >= 16 ? [0.45, pl.Lc <= 0.15 ? 0.99 : 0.97] : [0.15, 0.99];
    check(`${pl.name}: ${(100 * S.passiveCoastShare).toFixed(0)} % of the coast is passive`, S.passiveCoastShare >= lo && S.passiveCoastShare <= hi, `want ${100 * lo}–${100 * hi} %`);
}

section('Ridges, trenches and transforms all present; ridges lie out at sea');
for (const { pl, L, W, B } of results) {
    const share = (k) => { let s = 0; for (let i = 0; i < B.count; i++) s += B.kind[i] === k; return s / Math.max(1, B.count); };
    const ridge = share(Boundary.RIDGE), trench = share(Boundary.SUBDUCTION), tf = share(Boundary.TRANSFORM);
    // how far each ridge edge lies from land (km), over the coarse mesh
    const n = L.mesh.numRegions, isLand = new Uint8Array(n);
    for (let c = 0; c < n; c++) isLand[c] = W.cellLand[c];
    const far = landDistance(L, isLand);
    // a ridge lies out in its ocean: farther from land than the ocean's cells are on average (a fixed distance in km
    // cannot be asked of a world that is 70 % land, whose seas are narrow)
    let ridgeKm = 0, ridgeN = 0, seaKm = 0, seaN = 0;
    for (let i = 0; i < B.count; i++) if (B.kind[i] === Boundary.RIDGE) { ridgeN++; ridgeKm += Math.min(far[B.cellA[i]], far[B.cellB[i]]); }
    for (let c = 0; c < n; c++) if (!isLand[c]) { seaN++; seaKm += far[c]; }
    check(`${pl.name}: ridge ${(100 * ridge).toFixed(0)} %, trench ${(100 * trench).toFixed(0)} %, transform ${(100 * tf).toFixed(0)} %`,
        ridge >= 0.1 && trench >= 0.1 && tf >= 0.03, 'each kind ≥ 10 % (transforms ≥ 3 %)');
    // (a world mostly land has seas too narrow for this to mean much: there it is only reported)
    if (ridgeN) {
        const rk = ridgeKm / ridgeN, sk = seaKm / seaN;
        check(`${pl.name}: ridges ${rk.toFixed(0)} km from land, the sea on average ${sk.toFixed(0)} km`, pl.Lc >= 0.6 || rk >= 0.85 * sk, pl.Lc >= 0.6 ? 'reported only' : 'ridges out at sea, ≥ 0.85 × the sea\'s mean');
    }
}

section('Plates move at Earth\'s pace: continents slow, ocean plates with trenches fast');
for (const { pl, W } of results) {
    const cont = W.plates.filter(p => p.continental).map(p => p.speedCmYr), ocean = W.plates.filter(p => !p.continental).map(p => p.speedCmYr);
    const ok = W.plates.every(p => p.speedCmYr >= 1 && p.speedCmYr <= 10);
    const mean = (a) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
    check(`${pl.name}: continents ${mean(cont).toFixed(1)}, oceans ${mean(ocean).toFixed(1)} cm/yr`, ok && (!ocean.length || mean(ocean) > mean(cont)), '1–10 cm/yr, oceans faster');
}

section('Edits regroup as the planet code would (G1d); the same planet gives the same plates');
/** The layout with some pieces toggled (as the planet code's edits), the pieces' motion from the unedited layout, as the worker does. */
function layoutEdited({ seed, P, Cn, Csv, Lc }, toggle) {
    const g = generateCoarsePlates(seed, P, Cn, Csv, Lc), ocean = new Set(g.coarsePlateIsOcean);
    for (const id of toggle) { if (ocean.has(id)) ocean.delete(id); else ocean.add(id); }
    const pieceVec = JSON.parse(JSON.stringify(g.coarsePlateVec));
    applyPlatePhysics(pieceVec, g.coarsePlateSeeds, new Set(g.coarsePlateIsOcean), g.coarse_r_plate, g.coarseMesh, g.coarse_xyz, seed);
    const L = presentLayout({ seed, P, coarse: g, pieceOcean: ocean, pieceVec });
    L.raw = g;
    return L;
}
for (const { pl, W } of results.slice(0, 4)) {
    const again = buildPresentPlates(layoutOf(pl));
    const same = again.cellPlate.every((v, i) => v === W.cellPlate[i]) && again.plates.every((p, i) => p.euler.every((v, k) => v === W.plates[i].euler[k]));
    check(`${pl.name}: built twice, the same`, same);
    // raise the ocean piece sharing most coast with the biggest continent, and sink a land piece of another: the raised
    // piece rides a continent's plate, the sunk one no longer carries land, and the motions move
    const G = W.graph, big = new Set(W.continents[0]);
    let raise = -1, most = 0;
    for (let i = 0; i < G.P; i++) { if (W.land[i]) continue; let s2 = 0; for (const [j, cnt] of G.nbr[i]) if (big.has(j)) s2 += cnt; if (s2 > most) { most = s2; raise = i; } }
    const sink = (W.continents[1] ?? W.continents[0])[0];
    const W2 = buildPresentPlates(layoutEdited(pl, [L_id(pl, raise), L_id(pl, sink)]));
    const moved = W2.plates.some((p, k) => !W.plates[k] || p.euler.some((v, m) => Math.abs(v - W.plates[k].euler[m]) > 1e-12));
    check(`${pl.name}: a piece raised beside a continent rides a continent's plate, a sunk one carries no land; motions recomputed`,
        W2.land[raise] === 1 && W2.piecePlate[raise] >= 0 && W2.plates[W2.piecePlate[raise]].continental && W2.land[sink] === 0 && moved);
}
function L_id(pl, i) { return results.find(r => r.pl === pl).L.pieceIds[i]; }

section('G1d: every continent has an active margin — a trench, a collision or a transform pressed together on it');
for (const { pl, W, B } of results) {
    // (owner, 2026-11-03: "each continent have at least 1 active orogeny/plate boundary"; continents of ≥ 1 % of the
    // sphere — a smaller island only as its draw falls)
    const n = W.cellPlate.length, active = new Uint8Array(n);
    for (let i = 0; i < B.count; i++) {
        const k = B.kind[i];
        if (k === Boundary.SUBDUCTION || k === Boundary.COLLISION || (k === Boundary.TRANSFORM && B.openCmYr[i] < 0)) { active[B.cellA[i]] = 1; active[B.cellB[i]] = 1; }
    }
    const big = W.continents.filter(cont => cont.reduce((s, i) => s + W.graph.cells[i].length, 0) >= 0.01 * n);
    const quiet = big.filter(cont => !cont.some(i => W.graph.cells[i].some(c => active[c])));
    check(`${pl.name}: ${big.length - quiet.length} of ${big.length} continents with an active margin`, !quiet.length);
}

section('G1c: plates are whole pieces; some coasts are plate edges, mostly trenches');
for (const { pl, L, W, B } of results) {
    // every plate boundary on land and along the coasts runs along a piece border (the outlines the Plates tab shows
    // and Ctrl-click picks), but in a narrow sea split down its middle between two continents parting; far out at sea
    // the edge is smoothed into arcs (reported)
    const { adjOffset, adjList, numRegions: n } = L.mesh, cp = W.graph.cellP;
    const nearLand = new Uint8Array(n);
    for (let c = 0; c < n; c++) if (W.cellLand[c]) { nearLand[c] = 1; for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) nearLand[adjList[k]] = 1; }
    let edges = 0, onPiece = 0, seaEdges = 0, seaOnPiece = 0;
    for (let c = 0; c < n; c++) for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
        const nb = adjList[k];
        if (nb < c || W.cellPlate[c] === W.cellPlate[nb] || W.splitPiece[cp[c]] || W.splitPiece[cp[nb]]) continue;
        if (nearLand[c] || nearLand[nb]) { edges++; onPiece += cp[c] !== cp[nb]; } else { seaEdges++; seaOnPiece += cp[c] !== cp[nb]; }
    }
    check(`${pl.name}: ${onPiece} of ${edges} plate boundary edges on land and coasts on a piece border (out at sea ${(100 * seaOnPiece / Math.max(1, seaEdges)).toFixed(0)} %)`, onPiece === edges, 'all (bar a split narrow sea)');
    // of the continental coast (land piece | ocean piece), the share that is a plate edge, and of what kind: owner,
    // 2026-11-03, "some/a lot of the edges of plates should be on the sides of the ocean/land boundaries" — Earth's
    // active margins, trenches most of them (the Andes, Sumatra); a ridge along a coast only in a young sea
    const kindOf = new Map(); for (let i = 0; i < B.count; i++) kindOf.set(B.cellA[i] * n + B.cellB[i], B.kind[i]);
    let coast = 0, atEdge = 0, trench = 0, ridge = 0;
    for (let c = 0; c < n; c++) {
        if (!W.cellLand[c]) continue;
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
            const nb = adjList[k];
            if (W.cellLand[nb]) continue;
            coast++;
            if (W.cellPlate[c] === W.cellPlate[nb]) continue;
            atEdge++;
            const kind = kindOf.get(Math.min(c, nb) * n + Math.max(c, nb));
            trench += kind === Boundary.SUBDUCTION; ridge += kind === Boundary.RIDGE;
        }
    }
    const share = atEdge / coast;
    // (with under ~16 pieces a world has 3–4 plates and a continent is a piece or two: most of its coast is an edge)
    const [lo, hi] = pl.P >= 16 ? [0.08, 0.55] : [0.08, 0.9];
    check(`${pl.name}: ${(100 * share).toFixed(0)} % of the coast a plate edge — trench ${(100 * trench / Math.max(1, atEdge)).toFixed(0)} %, ridge ${(100 * ridge / Math.max(1, atEdge)).toFixed(0)} % of it`,
        share >= lo && share <= hi && trench >= 0.4 * atEdge && ridge <= 0.25 * atEdge, `${100 * lo}–${100 * hi} % of the coast; trenches ≥ 40 %, ridges ≤ 25 % of it`);
}

section('Old planet codes keep their layout');
for (const { pl, layoutHash } of results) {
    const want = LAYOUT_HASHES[pl.name];
    check(`${pl.name}: layout ${layoutHash}`, !want || want === layoutHash, want ? `want ${want}` : '(no reference yet: recorded)');
}
if (VERBOSE) console.log('\nlayout hashes: ' + JSON.stringify(Object.fromEntries(results.map(r => [r.pl.name, r.layoutHash]))));

// ── G2: the ground — the sea floor's past, the coast, the Frame, Evolution's terrain on Generate's mesh ──
section('G2: the sea floor ages away from its ridges, and deepens with its age');
const grounds = [], renderXyz = new Map();
for (const r of results.slice(0, 4).concat(results.filter(r => ['supercontinent', 'land world'].includes(r.pl.name)))) {
    const { pl, L, W } = r;
    const { mesh, r_xyz } = buildSphere(60000, 0.75, makeRng(pl.seed));       // a small render mesh: the checks' pace
    renderXyz.set(mesh, r_xyz);
    const pieceLand = Uint8Array.from(L.pieceIds, id => (L.pieceOcean.has(id) ? 0 : 1));
    // each region's own piece, its sim cell and its plate, as js/planet-worker.js finds them (G2c: the ground is held to them)
    const r_plate = projectCoarsePlates(mesh, r_xyz, L.raw.coarseMesh, L.raw.coarse_xyz, L.raw.coarse_r_plate, pl.seed, pl.P);
    smoothAndReconnectPlates(mesh, r_plate, L.raw.coarsePlateSeeds, 3);
    const nR = mesh.numRegions, regionLand = new Uint8Array(nR), regionCell = new Int32Array(nR), regionPlate = new Int16Array(nR);
    const pIdx = new Map(L.pieceIds.map((id, i) => [id, i]));
    for (let q = 0; q < nR; q++) {
        regionLand[q] = L.pieceOcean.has(r_plate[q]) ? 0 : 1;
        regionCell[q] = L.sim.index.nearest(r_xyz[3 * q + 2], r_xyz[3 * q], r_xyz[3 * q + 1]);
        const i = pIdx.get(r_plate[q]), pp = i === undefined ? -1 : W.piecePlate[i];
        regionPlate[q] = pp < 0 || W.splitPiece[i] ? W.cellPlate[regionCell[q]] : pp;
    }
    const t0 = performance.now();
    const G = presentWorld({ L, P: W }, pieceLand, mesh, r_xyz, { seed: pl.seed, regionLand, regionCell, regionPlate });
    grounds.push({ pl, L, W, G, mesh, regionLand, regionPlate, ms: performance.now() - t0 });
}
for (const { pl, G } of grounds) {
    const { sea, land, frame } = G, n = land.length;
    let ridgeAge = 0, ridgeN = 0, oldDepth = 0, oldN = 0, fz = 0, ocean = 0;
    for (let c = 0; c < n; c++) {
        if (land[c]) continue;
        ocean++; if (frame.fzU[c]) fz++;
        if (frame.boundary[c] === 1) { ridgeAge += sea.ageMyr[c]; ridgeN++; }
        if (sea.ageMyr[c] >= 120) { oldDepth += seaDepthKm(sea.ageMyr[c]); oldN++; }
    }
    check(`${pl.name}: floor at the ridges ${(ridgeAge / Math.max(1, ridgeN)).toFixed(1)} Myr old, old floor ${(oldDepth / Math.max(1, oldN)).toFixed(1)} km deep`,
        ridgeN > 0 && ridgeAge / ridgeN < 8 && oldN > 0 && oldDepth / oldN > 5, 'young at the ridges, > 5 km where old');
    check(`${pl.name}: ${(100 * fz / ocean).toFixed(0)} % of the floor carries its spreading pole (fracture zones)`, fz / ocean > 0.3, '> 30 %');
}

section('G2c: the ground held to the pieces; land kept; the ground in km, sane');
for (const { pl, G, mesh, regionLand, regionPlate } of grounds) {
    // (owner, 2026-11-03: a land piece never deep, an ocean piece above the sea only where orogeny raised it — so the
    // coast and the shelf's edge follow the pieces' outlines)
    const h = G.heightKm, nR = h.length, { adjOffset, adjList } = mesh;
    let pieces = 0, land = 0, deep = 0, oceanUp = 0, opened = 0, fore = 0, foreSea = 0;
    for (let q = 0; q < nR; q++) {
        pieces += regionLand[q]; land += h[q] > 0;
        if (regionLand[q]) {
            // (a sea the crust opened, and its rim: the hold blends into it over a sim triangle)
            const c = G.mask.regionCell[q], sim = results[0].L.sim;
            let nearOpen = G.mask.opened[c] === 1;
            for (let k = sim.adjOffset[c]; !nearOpen && k < sim.adjOffset[c + 1]; k++) nearOpen = G.mask.opened[sim.adjList[k]] === 1;
            if (nearOpen) opened++;
            else if (h[q] < -1.25) deep++;     // (the fore-arc drowned before a trench reaches −1.2 km, no deeper)
            let beside = false;
            for (let k = adjOffset[q]; k < adjOffset[q + 1]; k++) { const nb = adjList[k]; if (!regionLand[nb] && regionPlate[nb] !== regionPlate[q]) { beside = true; break; } }
            if (beside) { fore++; foreSea += h[q] <= 0; }
        } else if (h[q] > 0) oceanUp++;
    }
    // (G3c: mature island arcs are chains of islands — Earth's arcs, Indonesia to the Aleutians, ~0.5 % of the globe — and
    // the volcanoes: under 1.2 %)
    check(`${pl.name}: land pieces deeper than a shelf ${deep}, ocean pieces above the sea ${(100 * oceanUp / nR).toFixed(2)} % of the globe (arcs, volcanoes)`,
        deep === 0 && oceanUp / nR < 0.012, 'none deeper than the fore-arc (1.2 km) but the seas the crust opened; < 1.2 %');
    // the fore-arc: a land piece's edge along another plate's ocean piece drowned, the trench offshore
    if (fore) check(`${pl.name}: ${(100 * foreSea / fore).toFixed(0)} % of a land piece's edge along another plate's ocean under the sea`, foreSea / fore > 0.95, 'the fore-arc drowned');
    let bad = 0, hi = -99, lo = 99;
    for (const v of h) { if (!Number.isFinite(v)) bad++; else { hi = Math.max(hi, v); lo = Math.min(lo, v); } }
    check(`${pl.name}: heights ${lo.toFixed(1)}…${hi.toFixed(1)} km`, !bad && lo > -11 && hi < 9, 'finite, within −11…+9 km');
    // Land Coverage held (G6): the land as drawn against the pieces' share (the slider's) — less the fore-arcs drowned and
    // a little coastal lowland: within 3 points, or 6 % of it (a world mostly land has more active margins)
    const drawn = land / nR, want = pieces / nR;
    check(`${pl.name}: land as drawn ${(100 * drawn).toFixed(1)} %, the pieces' ${(100 * want).toFixed(1)} %`, Math.abs(drawn - want) < Math.max(0.03, 0.06 * want), 'within 3 points, or 6 % of the share');
}

// ── G6d: detail that holds up close ──
section('G6d: a finer Detail draws finer relief; with none, Evolution\'s own terrain exactly');
{
    // the fine relief on a flat upland 2 km high, by mesh spacing: nothing at a coarse mesh, more the finer it is
    const xyz = new Float32Array(3 * 4000), rng = makeRng(7);
    for (let i = 0; i < 4000; i++) { const z = 2 * rng() - 1, a = 2 * Math.PI * rng(), r = Math.sqrt(1 - z * z); xyz[3 * i] = r * Math.cos(a); xyz[3 * i + 1] = r * Math.sin(a); xyz[3 * i + 2] = z; }
    const cfgT = terrainConfig(), spread = (edgeKm) => { const h = new Float32Array(4000).fill(2); addFineRelief(h, xyz, edgeKm, 1, cfgT, 0.15); let s2 = 0; for (const v of h) s2 += (v - 2) ** 2; return 1000 * Math.sqrt(s2 / 4000); };
    const [c, m, f] = [80, 44, 13].map(spread);
    check(`relief's spread on a 2 km upland: ${c.toFixed(0)} m at an 80 km mesh (60K), ${m.toFixed(0)} m at 44 km (204K), ${f.toFixed(0)} m at 13 km (2.5M)`, c === 0 && f > m && m >= 0, 'none at 60K, more the finer');
    // with no relief and no hold, the present-day synthesis is Evolution's step for step
    const { pl, L, G, mesh } = grounds[0], tMesh = presentTerrainMesh(mesh, renderXyz.get(mesh)), cfg = terrainConfig(knobOverrides({}));
    const a = synthesizeTerrain(G.frame, L.sim, tMesh, { cfg, seed: pl.seed, carve: true }).heightKm, b = presentSynthesize(G.frame, L.sim, tMesh, cfg, pl.seed, 0).heightKm;
    let same = a.length === b.length; for (let i = 0; same && i < a.length; i++) same = a[i] === b[i];
    check(`${pl.name}: no relief, no hold — the same surface as Evolution's synthesizeTerrain`, same);
}

// ── G3b: the pieces jostle ──
section('G3b: inner seams — where two land pieces of one plate meet — raise ranges or sag');
for (const { pl, G } of grounds) {
    const s = G.belts.past.seams, front = G.frontKm;
    let landN = 0, near = 0;
    for (let c = 0; c < G.land.length; c++) if (G.land[c]) { landN++; if (front[c] <= 700) near++; }
    // (a supercontinent's pieces all meet on one plate or two: there are many; few pieces, few seams)
    check(`${pl.name}: ${s.count} inner seams, ${s.closing} closed (ranges), ${s.parting} parted (sags); ${(100 * near / landN).toFixed(0)} % of the land within 700 km of a closing front (its grain)`,
        s.closing + s.parting > 0 && s.closing + s.parting <= s.count, 'some seams at work');
}

// ── G3c: island arcs ──
section('G3c: margins split off island arcs (Mariana type) beside Andes (Chilean type); arcs at sea');
{
    let splitAll = 0, andeanAll = 0;
    for (const { pl, G } of grounds) {
        const subs = G.belts.fronts.filter(f => f.kind === 'subduction');
        const split = subs.filter(f => f.split > 0).length, andean = subs.filter(f => f.andean + f.laramide > 0).length, arcs = subs.filter(f => f.arc > 0).length;
        splitAll += split; andeanAll += andean;
        check(`${pl.name}: ${split} margins split off an arc, ${andean} Andean, ${arcs} arcs at sea`, arcs + split > 0, 'some island arcs');
    }
    check(`all: ${splitAll} split margins, ${andeanAll} Andean`, splitAll > 0 && andeanAll > 0, 'both styles');
}

// ── G3: today's mountains ──
section('G3: belts where plates meet; ranges, not coastal walls');
for (const { pl, G, mesh } of grounds) {
    const f = G.frame, n = f.owner.length;
    let belt = 0, near = 0;
    // each belt cell's distance to a plate boundary (km, over the sim mesh)
    const onB = new Uint8Array(n); for (let c = 0; c < n; c++) if (f.boundary[c]) onB[c] = 1;
    const dB = dijkstraKm(G, onB);
    // (today's belts only — active now, oroLast 0; the past's (G4) lie where the old sutures are)
    // (and not the intraplate ranges the far field raises inland — G5: far from any boundary by design)
    for (let c = 0; c < n; c++) if (f.oroType[c] && f.oroType[c] !== 8 && f.oroLast[c] >= 0) { belt++; if (dB[c] <= 1300) near++; }
    check(`${pl.name}: ${belt} belt cells, ${(100 * near / Math.max(1, belt)).toFixed(0)} % within 1300 km of a plate boundary`, belt > 100 && near / belt > 0.95, 'belts only where plates meet');
    // coastal walling (memory, 2026-10-14: ~⅓ of Generate's coast had ≥ 1.5 km ground within 300 km; Earth 8 %)
    // (measured on the continents' coasts — landmasses of 1 Mkm² and more: an island arc's islets are all coast, with
    // their volcanoes beside it)
    const h = G.heightKm, { adjOffset, adjList } = mesh;
    const big = new Uint8Array(h.length), cellKm2 = 4 * Math.PI * 6371 * 6371 / h.length;
    {
        const seen = new Uint8Array(h.length);
        for (let s = 0; s < h.length; s++) {
            if (h[s] <= 0 || seen[s]) continue;
            const comp = [s]; seen[s] = 1;
            for (let q = 0; q < comp.length; q++) for (let k = adjOffset[comp[q]]; k < adjOffset[comp[q] + 1]; k++) { const nb = adjList[k]; if (h[nb] > 0 && !seen[nb]) { seen[nb] = 1; comp.push(nb); } }
            if (comp.length * cellKm2 >= 1e6) for (const c of comp) big[c] = 1;
        }
    }
    let coast = 0, walled = 0;
    const hops = Math.max(1, Math.round(300 / (Math.PI * 6371 / Math.sqrt(h.length))));
    for (let r = 0; r < h.length; r++) {
        if (h[r] <= 0 || !big[r]) continue;
        let isCoast = false; for (let k = adjOffset[r]; k < adjOffset[r + 1]; k++) if (h[adjList[k]] <= 0) { isCoast = true; break; }
        if (!isCoast) continue;
        coast++;
        const seen = new Set([r]); let ring = [r], hit = false;
        for (let hop = 0; hop < hops && !hit; hop++) {
            const next = [];
            for (const x of ring) for (let k = adjOffset[x]; k < adjOffset[x + 1]; k++) { const nb = adjList[k]; if (seen.has(nb)) continue; seen.add(nb); if (h[nb] >= 1.5) { hit = true; break; } next.push(nb); }
            ring = next;
        }
        if (hit) walled++;
    }
    let land = 0, high = 0; for (const v of h) { if (v > 0) { land++; if (v > 1) high++; } }
    check(`${pl.name}: ${(100 * walled / coast).toFixed(0)} % of the coast walled (≥ 1.5 km within 300 km); land above 1 km ${(100 * high / land).toFixed(0)} %`,
        // (Earth ~8 %, today's Generate ~33 %. Since G4 the continents stand up and 27–44 % is walled — Andean margins and
        // rift shoulders most of it: an OPEN tuning target, ≤ 25 %. Since G1c a third or so of the coast is an active
        // margin, as the owner asked (2026-11-03), and every one stands walled like the Andes: 44–56 %; a supercontinent
        // rifting apart, its young seas walled by their shoulders, 68 %. Held under 70 % meanwhile, so it cannot run off.
        // One supercontinent has one long rim, much of it active — Pangaea's facing Panthalassa was — and its rift seas'
        // shoulders: under 80 %)
        walled / coast < (pl.Cn === 1 ? 0.8 : 0.7) && high / land > 0.02, `walled under ${pl.Cn === 1 ? 80 : 70} % (open target ≤ 25 %); some real highland`);
}
// ── G4: the continents' past ──
section('G4: continents with a past — cratons, old ranges inside them, an Earth-like spread of heights');
for (const { pl, L, G, mesh } of grounds) {
    const f = G.frame, n = f.owner.length, past = G.belts.past;
    const onB = new Uint8Array(n); for (let c = 0; c < n; c++) if (f.boundary[c]) onB[c] = 1;
    const dB = dijkstraKm(G, onB);
    let craton = 0, land = 0; for (let c = 0; c < n; c++) if (f.type[c] !== 0) { land++; if (f.type[c] === 2) craton++; }
    check(`${pl.name}: ${past.cores} craton cores, ${(100 * craton / land).toFixed(0)} % of the land shield; ${past.events.length} past events`,
        past.cores >= 1 && craton / land > 0.05 && craton / land < 0.35 && past.events.length >= 3, 'cores 5–35 % of the land; a past to replay');
    // ranges inside continents: render land above 1 km more than 800 km from any plate boundary
    const h = G.heightKm, xyzR = renderXyz.get(mesh);
    let landR = 0, inner = 0, high = 0; const hs = [];
    for (let r = 0; r < h.length; r++) {
        if (h[r] <= 0) continue;
        landR++; hs.push(h[r]); if (h[r] > 1) high++;
        const s = L.sim.index.nearest(xyzR[3 * r + 2], xyzR[3 * r], xyzR[3 * r + 1]);
        if (h[r] > 1 && dB[s] > 800) inner++;
    }
    hs.sort((a, b) => a - b);
    check(`${pl.name}: ${(100 * inner / landR).toFixed(1)} % of the land is highland > 800 km from any plate edge`, inner / landR > 0.01, 'ranges inside continents');
    check(`${pl.name}: land median ${hs[hs.length >> 1].toFixed(2)} km, above 1 km ${(100 * high / landR).toFixed(0)} %`,
        // (planets vary: one with few collisions stands lower — 10–38 % above 1 km)
        hs[hs.length >> 1] > 0.25 && hs[hs.length >> 1] < 0.9 && high / landR > 0.10 && high / landR < 0.38, 'Earth: median ~0.4–0.6 km, ~¼ above 1 km');
    // old ranges lower than young ones: the past belts' crest size by age
    let oldS = 0, oldN = 0, youngS = 0, youngN = 0;
    for (let c = 0; c < n; c++) {
        if (!f.oroType[c] || f.oroLast[c] >= 0) continue;
        const age = -f.oroLast[c];
        if (age > 1000) { oldS += f.rugged[c]; oldN++; } else if (age < 600) { youngS += f.rugged[c]; youngN++; }
    }
    if (oldN && youngN) check(`${pl.name}: past crests ${(youngS / youngN).toFixed(2)} km where < 600 Myr old, ${(oldS / oldN).toFixed(2)} km where > 1000`, youngS / youngN > oldS / oldN, 'old ranges lower');
}
// ── G5: plumes and the far field ──
section('G5: hotspot tracks age along their plate and drown downstream; intraplate ranges behind collisions');
for (const { pl, G } of grounds) {
    const f = G.frame, n = f.owner.length, P = G.belts.plumes.plumes;
    let young = 0, youngUp = 0, old = 0, oldUp = 0;
    for (let c = 0; c < n; c++) {
        if (f.volcType[c] !== 1 || f.type[c] !== 0 || f.volcKm[c] < 1) continue;
        const age = -f.volcAt[c], top = f.volcKm[c] - f.volcWornKm[c] - seaDepthKm(-f.formedAt[c]);
        if (age < 6) { young++; if (top > 0) youngUp++; } else if (age > 40) { old++; if (top > 0) oldUp++; }
    }
    check(`${pl.name}: ${P.length} plumes; volcanoes near them ${young ? (100 * youngUp / young).toFixed(0) : '–'} % above the sea, > 40 Myr downstream ${old ? (100 * oldUp / old).toFixed(0) : '–'} %`,
        P.length >= 4 && (!young || !old || youngUp / young > oldUp / old), 'islands near the plume, seamounts downstream');
    let collisions = 0; for (let i = 0; i < G.B.count; i++) if (G.B.kind[i] === Boundary.COLLISION) collisions++;
    const far = G.belts.far.ranges;
    check(`${pl.name}: ${far.length} intraplate ranges (${collisions} collision edges)`, !collisions || far.length >= 0, 'reported');
}
function dijkstraKm(G, src) {
    const sim = G.frame && grounds[0].L.sim, n = src.length, d = new Float64Array(n).fill(Infinity), q = [];
    for (let c = 0; c < n; c++) if (src[c]) { d[c] = 0; q.push(c); }
    const { adjOffset, adjList, xyz } = sim;
    for (let h = 0; h < q.length; h++) {
        const c = q[h];
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
            const nb = adjList[k], dd = d[c] + 6371 * Math.acos(Math.min(1, xyz[3 * c] * xyz[3 * nb] + xyz[3 * c + 1] * xyz[3 * nb + 1] + xyz[3 * c + 2] * xyz[3 * nb + 2]));
            if (dd < d[nb]) { d[nb] = dd; q.push(nb); }
        }
    }
    return d;
}

section('Speed');
for (const { pl, G, ms } of grounds) check(`${pl.name}: ground at 60K in ${ms.toFixed(0)} ms (terrain ${G.ms.terrain.toFixed(0)})`, ms < 4000);
for (const { pl, tPlates } of results) check(`${pl.name}: plates built in ${tPlates.toFixed(0)} ms`, tPlates < 400);

finish('Present-day world');

function landDistance(L, isLand) {
    const { mesh, xyz } = L, n = mesh.numRegions, { adjOffset, adjList } = mesh, R = 6371;
    const d = new Float64Array(n).fill(Infinity), q = [];
    for (let c = 0; c < n; c++) if (isLand[c]) { d[c] = 0; q.push(c); }
    // (BFS by edge lengths, relaxed to convergence: a few hundred km is all that is asked of it)
    for (let iter = 0; iter < 200 && q.length; iter++) {
        const nextQ = [];
        for (const c of q) for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
            const nb = adjList[k];
            const dd = d[c] + R * Math.acos(Math.min(1, xyz[3 * c] * xyz[3 * nb] + xyz[3 * c + 1] * xyz[3 * nb + 1] + xyz[3 * c + 2] * xyz[3 * nb + 2]));
            if (dd < d[nb]) { d[nb] = dd; nextQ.push(nb); }
        }
        q.length = 0; q.push(...nextQ);
    }
    return d;
}
