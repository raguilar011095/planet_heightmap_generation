// Checks for the present-day world (plans/GENERATE_REDESIGN_PLAN.md): Generate's planet built as one moment with an
// implied past. G1 — plates that move: Generate's pieces grouped into plates that carry continent and ocean.
//
//   node v2/tools/check-present.mjs            the checks, PASS/FAIL, exit code
//   node v2/tools/check-present.mjs --verbose  plus each planet's plates and boundaries

import { check, section, finish } from './lib/check-kit.mjs';
import { generateCoarsePlates } from '../../js/coarse-plates.js';
import { applyPlatePhysics } from '../../js/plate-physics.js';
import { buildPresentPlates, classifyBoundaries, plateStats, Boundary, BOUNDARY_NAME } from '../js/present/plates.js';

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

/** Generate's layout, unedited, and the pieces' motion today on it (as js/planet-worker.js builds them). */
export function layoutOf({ seed, P, Cn, Csv, Lc }) {
    const g = generateCoarsePlates(seed, P, Cn, Csv, Lc);
    const pieceVec = JSON.parse(JSON.stringify(g.coarsePlateVec));
    applyPlatePhysics(pieceVec, g.coarsePlateSeeds, g.coarsePlateIsOcean, g.coarse_r_plate, g.coarseMesh, g.coarse_xyz, seed);
    return {
        mesh: g.coarseMesh, xyz: g.coarse_xyz, cellPiece: g.coarse_r_plate, pieceIds: Array.from(g.coarsePlateSeeds),
        pieceOcean: new Set(g.coarsePlateIsOcean), pieceVec, seed, raw: g,
    };
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
    const landNow = W.land;
    const B = classifyBoundaries(L, W, landNow);
    const S = plateStats(L, W, B);
    results.push({ pl, L, W, B, S, tLayout, tPlates, layoutHash: hashArrays(L.cellPiece, Int8Array.from(L.pieceIds, id => (L.pieceOcean.has(id) ? 1 : 0))) });
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
    const broken = W.plates.filter(p => {
        const mine = new Set(p.pieces), seen = new Set([p.pieces[0]]), q = [p.pieces[0]];
        while (q.length) { const i = q.pop(); for (const j of W.graph.nbr[i].keys()) if (mine.has(j) && !seen.has(j)) { seen.add(j); q.push(j); } }
        return seen.size !== mine.size;
    });
    const empty = W.plates.filter(p => !p.pieces.length);
    check(`${pl.name}: ${W.M} plates, each in one piece`, !broken.length && !empty.length, `${broken.length} broken, ${empty.length} empty`);
}

section('How many plates: about 1.5 √pieces, at least one ocean-only plate');
for (const { pl, W } of results) {
    const ocean = W.plates.filter(p => !p.continental).length;
    const want = Math.max(3, Math.min(18, Math.round(1.5 * Math.sqrt(pl.P))));
    check(`${pl.name}: ${W.M} plates (${ocean} ocean-only) for ${pl.P} pieces`, ocean >= 1 && W.M >= Math.min(want, pl.P) && W.M <= Math.max(want, W.continents.length + 1), `want ~${want}`);
}

section('Continents ride whole, split at most along one or two seams');
for (const { pl, W } of results) {
    const bad = W.continents.filter(cont => new Set(cont.map(i => W.piecePlate[i])).size > 3);
    const splits = W.continents.map(cont => new Set(cont.map(i => W.piecePlate[i])).size - 1);
    check(`${pl.name}: ${W.continents.length} continents, split ${splits.join('/')}`, !bad.length, `${bad.length} in more than 3 plates`);
}

section('Most continental coast is passive (inside a plate), as on Earth');
for (const { pl, S } of results) {
    // (with under ~16 pieces a continent is one or two whole pieces with no ocean piece of its own beside it: there the
    // coast can only be a plate's edge, so only that it is not all active is asked)
    const lo = pl.P >= 16 ? 0.45 : 0.15;
    check(`${pl.name}: ${(100 * S.passiveCoastShare).toFixed(0)} % of the coast is passive`, S.passiveCoastShare >= lo && S.passiveCoastShare <= 0.92, `want ${100 * lo}–92 %`);
}

section('Ridges, trenches and transforms all present; ridges lie out at sea');
for (const { pl, L, W, B } of results) {
    const share = (k) => { let s = 0; for (let i = 0; i < B.count; i++) s += B.kind[i] === k; return s / Math.max(1, B.count); };
    const ridge = share(Boundary.RIDGE), trench = share(Boundary.SUBDUCTION), tf = share(Boundary.TRANSFORM);
    // how far each ridge edge lies from land (km), over the coarse mesh
    const n = L.mesh.numRegions, isLand = new Uint8Array(n);
    for (let c = 0; c < n; c++) isLand[c] = W.land[W.graph.cellP[c]];
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
    const same = again.piecePlate.every((v, i) => v === W.piecePlate[i]) && again.plates.every((p, i) => p.euler.every((v, k) => v === W.plates[i].euler[k]));
    check(`${pl.name}: built twice, the same`, same);
    // raise three ocean pieces and sink a land piece: the grouping is the unedited one, so nothing regroups; only the
    // boundaries the edited crust touches change kind
    const now = W.land.slice();
    const ocean = []; for (let i = 0; i < now.length; i++) if (!now[i]) ocean.push(i);
    for (const i of ocean.slice(0, 3)) now[i] = 1;
    const landI = now.findIndex(v => v === 1); now[landI] = 0;
    const B0 = classifyBoundaries(L, W, W.land), B1 = classifyBoundaries(L, W, now);
    let changed = 0; for (let i = 0; i < B0.count; i++) changed += B0.kind[i] !== B1.kind[i];
    check(`${pl.name}: 4 pieces edited — plates unchanged, ${(100 * changed / B0.count).toFixed(1)} % of boundary length changed kind`, B0.count === B1.count && changed / B0.count < 0.25);
}

section('Old planet codes keep their layout');
for (const { pl, layoutHash } of results) {
    const want = LAYOUT_HASHES[pl.name];
    check(`${pl.name}: layout ${layoutHash}`, !want || want === layoutHash, want ? `want ${want}` : '(no reference yet: recorded)');
}
if (VERBOSE) console.log('\nlayout hashes: ' + JSON.stringify(Object.fromEntries(results.map(r => [r.pl.name, r.layoutHash]))));

section('Speed');
for (const { pl, tPlates } of results) check(`${pl.name}: plates built in ${tPlates.toFixed(0)} ms`, tPlates < 400);

finish('Present-day world, G1');

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
