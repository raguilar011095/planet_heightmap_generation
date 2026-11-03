// Checks for the present-day world (plans/GENERATE_REDESIGN_PLAN.md): Generate's planet built as one moment with an
// implied past. G1 — plates that move: Generate's pieces grouped into plates that carry continent and ocean; G1b — the
// plates drawn free of the piece grid, on Evolution's sim mesh.
//
//   node v2/tools/check-present.mjs            the checks, PASS/FAIL, exit code
//   node v2/tools/check-present.mjs --verbose  plus each planet's plates and boundaries

import { check, section, finish } from './lib/check-kit.mjs';
import { generateCoarsePlates } from '../../js/coarse-plates.js';
import { applyPlatePhysics } from '../../js/plate-physics.js';
import { buildPresentPlates, classifyBoundaries, plateStats, cellLandNow, Boundary, BOUNDARY_NAME } from '../js/present/plates.js';
import { presentLayout } from '../js/present/layout.js';
import { presentWorld } from '../js/present/world.js';
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
    check(`${pl.name}: ${W.M} plates (${ocean} ocean-only) for ${pl.P} pieces`, ocean >= 1 && W.M >= Math.min(want, pl.P) - 1 && W.M <= Math.max(want, W.continents.length + 1), `want ~${want}`);
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
    const [lo, hi] = pl.P >= 16 ? [0.45, 0.92] : [0.15, 0.98];
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

section('Edits never regroup; the same planet gives the same plates');
for (const { pl, L, W } of results.slice(0, 4)) {
    const again = buildPresentPlates(layoutOf(pl));
    const same = again.cellPlate.every((v, i) => v === W.cellPlate[i]) && again.plates.every((p, i) => p.euler.every((v, k) => v === W.plates[i].euler[k]));
    check(`${pl.name}: built twice, the same`, same);
    // raise three ocean pieces and sink a land piece: the grouping is the unedited one, so nothing regroups; only the
    // boundaries the edited crust touches change kind
    const now = W.land.slice();
    const ocean = []; for (let i = 0; i < now.length; i++) if (!now[i]) ocean.push(i);
    for (const i of ocean.slice(0, 3)) now[i] = 1;
    const landI = now.findIndex(v => v === 1); now[landI] = 0;
    const B0 = classifyBoundaries(L, W, W.cellLand), B1 = classifyBoundaries(L, W, cellLandNow(L, W, now));
    let changed = 0; for (let i = 0; i < B0.count; i++) changed += B0.kind[i] !== B1.kind[i];
    check(`${pl.name}: 4 pieces edited — plates unchanged, ${(100 * changed / B0.count).toFixed(1)} % of boundary length changed kind`, B0.count === B1.count && changed / B0.count < 0.25);
}

section('G1b: plate boundaries drawn free of the piece grid');
for (const { pl, L, W } of results) {
    // of the plate boundary at sea, how much runs along a piece border, against the share of all sea edges that are
    // piece borders (what a boundary laid down at random would show)
    const { adjOffset, adjList, numRegions: n } = L.mesh, cp = W.graph.cellP;
    let bSea = 0, bOnPiece = 0, sea = 0, seaOnPiece = 0;
    for (let c = 0; c < n; c++) {
        if (W.cellLand[c]) continue;
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
            const nb = adjList[k];
            if (nb < c || W.cellLand[nb]) continue;
            sea++; const onPiece = cp[c] !== cp[nb]; seaOnPiece += onPiece;
            if (W.cellPlate[c] !== W.cellPlate[nb]) { bSea++; bOnPiece += onPiece; }
        }
    }
    const share = bOnPiece / Math.max(1, bSea), base = seaOnPiece / Math.max(1, sea);
    check(`${pl.name}: ${(100 * share).toFixed(0)} % of plate boundary at sea on a piece border (${(100 * base).toFixed(0)} % of sea edges are)`, share <= 3 * base + 0.05, 'no more than ~3× chance');
}

section('Old planet codes keep their layout');
for (const { pl, layoutHash } of results) {
    const want = LAYOUT_HASHES[pl.name];
    check(`${pl.name}: layout ${layoutHash}`, !want || want === layoutHash, want ? `want ${want}` : '(no reference yet: recorded)');
}
if (VERBOSE) console.log('\nlayout hashes: ' + JSON.stringify(Object.fromEntries(results.map(r => [r.pl.name, r.layoutHash]))));

// ── G2: the ground — the sea floor's past, the coast, the Frame, Evolution's terrain on Generate's mesh ──
section('G2: the sea floor ages away from its ridges, and deepens with its age');
const grounds = [];
for (const r of results.slice(0, 4).concat(results.filter(r => ['supercontinent', 'land world'].includes(r.pl.name)))) {
    const { pl, L, W } = r;
    const { mesh, r_xyz } = buildSphere(60000, 0.75, makeRng(pl.seed));       // a small render mesh: the checks' pace
    const pieceLand = Uint8Array.from(L.pieceIds, id => (L.pieceOcean.has(id) ? 0 : 1));
    const t0 = performance.now();
    const G = presentWorld({ L, P: W }, pieceLand, mesh, r_xyz, { seed: pl.seed });
    grounds.push({ pl, L, W, G, mesh, ms: performance.now() - t0 });
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

section('G2: coasts drawn free of the pieces, land kept; the ground in km, sane');
for (const { pl, L, W, G, mesh } of grounds) {
    const n = G.land.length, cp = W.graph.cellP, { adjOffset, adjList } = L.mesh;
    let coast = 0, onPiece = 0, landSim = 0, landPieces = 0;
    for (let c = 0; c < n; c++) {
        landSim += G.land[c]; landPieces += W.cellLand[c];
        if (!G.land[c]) continue;
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const nb = adjList[k]; if (G.land[nb]) continue; coast++; if (cp[c] !== cp[nb]) onPiece++; }
    }
    check(`${pl.name}: ${(100 * onPiece / coast).toFixed(0)} % of the coast on a piece border; land ${(100 * landSim / n).toFixed(1)} % (pieces ${(100 * landPieces / n).toFixed(1)} %)`,
        onPiece / coast < 0.35 && Math.abs(landSim - landPieces) / n < 0.005, 'coast mostly off the piece borders; the land\'s share held');
    let land = 0, bad = 0, hi = -99, lo = 99;
    for (const h of G.heightKm) { if (!Number.isFinite(h)) bad++; else { if (h > 0) land++; hi = Math.max(hi, h); lo = Math.min(lo, h); } }
    // (the render's land share is reported, not held, until the continents stand up: G3/G4 — flat continents have low
    // ground the coast's noise floods)
    check(`${pl.name}: heights ${lo.toFixed(1)}…${hi.toFixed(1)} km, render land ${(100 * land / G.heightKm.length).toFixed(1)} %`, !bad && lo > -11 && hi < 9, 'finite, within −11…+9 km');
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
