// G4 — the continents' past, replayed (plans/GENERATE_REDESIGN_PLAN.md §3.2b; owner, 2026-11-02: "interesting mountain
// ranges inside of continents, and … simulate old orogenies").
//
// Each continent is put together by a short sequence of past collisions over a world ~2000 Myr old — replayed as events,
// not drawn as static seams, and not a physics run: every event is a real collision with a time, a front, a convergence
// and a duration, written by the history's own record function (tectonics/step/orogeny.js spreadBelt), oldest first, so
// a younger belt overprints an older one into its prev* layer exactly as in Evolution's history; between events the land
// wears down (uplift, crests and root, each on its own clock), so an ancient orogen is a low, grainy range, a middle-aged
// one still stands (the Urals) and a young one is high.
//   1. The terranes are the pieces (G4b, owner 2026-11-03: "The noise and mountains still look a bit too random, i
//      think it needs to be more based on the internal plate boundaries"): each landmass's craton cores are its pieces
//      deepest inland (their interiors the cratons), and the rest dock outward from them piece by piece, younger outward.
//   2. The events: each piece docking along its border with the pieces in before it (a Ural-type welt on the pieces'
//      outline), at its age; the cores welding where their growths meet (a major suture: a collision belt, a plateau if
//      young).
//   3. Swells along the seams (the worn highlands round an old range), lowlands between, the cratons calm.
// Today's belts (present/belts.js) then overprint all of it.

import { CrustType, CrustFlag, OrogenyType, BeltSide } from '../tectonics/model/crust.js';
import { spreadBelt, beltWidthKm } from '../tectonics/step/orogeny.js';
import { spreadPush } from '../tectonics/step/far-field.js';
import { makeRng } from '../../../js/rng.js';
import { MinHeap } from '../core/min-heap.js';
import { FastNoise } from '../core/fast-noise.js';
import { PRESENT } from './present-config.js';
import { shapeRange } from './ranges.js';

const R = 6371;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const at = (xyz, c) => [xyz[3 * c], xyz[3 * c + 1], xyz[3 * c + 2]];
const crossV = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unitV = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const rotate = (M, p) => [M[0] * p[0] + M[1] * p[1] + M[2] * p[2], M[3] * p[0] + M[4] * p[1] + M[5] * p[2], M[6] * p[0] + M[7] * p[1] + M[8] * p[2]];
const kmBetween = (a, b) => R * Math.acos(Math.max(-1, Math.min(1, dot(a, b))));

/**
 * Replay the continents' past into the crust raster (before today's belts are written over it).
 * @param {Object} L  the layout   @param {Uint8Array} land  the land per sim cell (the coast as drawn)
 * @param {import('../tectonics/model/crust.js').CrustRaster} crust   @param {Object} config  the tectonic config
 * @param {Object[]} [extra]  more past collisions to replay with the rest (G3b: the inner seams, present/seams.js)
 * @param {{wp: Int32Array, sub: Int32Array}} pieces  each land cell's piece as bent and its terrane within the piece
 *   (present/warp.js): the terranes are the pieces (G4b), their outlines bent by today's plates and a slow warp, each
 *   made of smaller terranes whose seams are minor welts (G4c)
 * @returns {{events: Object[], terrane: Int32Array, seamKm: Float32Array, cores: number}}
 */
export function presentPast(L, land, crust, config, cfg = PRESENT, extra = [], pieces) {
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
    const seamMajor = new Uint8Array(n), seamRing = new Uint8Array(n), seamSub = new Uint8Array(n);

    // each land cell's piece as bent (present/warp.js; a land cell carried out onto an ocean piece's edge the land
    // piece's beside it), and its terrane within the piece
    const tp = pieces.wp, sub = pieces.sub;
    // (G5b: on a coast that fits another across its ocean — present/fit.js — the old ranges and shields run to the coast,
    // cut by it as the ocean opened, not kept back from it)
    const fits = pieces.fits ?? null, fitCoast = fits?.fitCoast ?? null;
    const coastOk = (c, km) => toSea[c] >= (fitCoast && fitCoast[c] ? cfg.fitCoastKm : km);
    // how far in each land cell lies from the nearest edge between two pieces (km over the land)
    const atEdge = (c) => { if (!land[c]) return false; for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const nb = adjList[k]; if (land[nb] && tp[nb] !== tp[c]) return true; } return false; };
    const inFromEdge = dijkstra(sim, atEdge, (c) => land[c] === 1, kmOf);

    masses.forEach((cells, mi) => {
        const areaKm2 = cells.length * cellKm2;
        const rng = makeRng((seed ^ 0x7a57) + mi * 7919);
        if (areaKm2 < cfg.pastMinAreaKm2) {
            // a microcontinent or an island: one young terrane, no history of its own
            const id = nextTerrane++;
            for (const c of cells) terrane[c] = id;
            return;
        }
        const inMass = (c) => mass[c] === mi;
        // its pieces: their land cells here, how deep inland each lies, which meet which
        const pcs = new Map();
        for (const c of cells) { const p = tp[c]; if (p < 0) continue; let e = pcs.get(p); if (!e) pcs.set(p, e = { cells: [], inland: 0, nbr: new Set() }); e.cells.push(c); e.inland += toSea[c]; }
        for (const c of cells) for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const nb = adjList[k]; if (inMass(nb) && tp[nb] !== tp[c] && tp[nb] >= 0 && tp[c] >= 0) pcs.get(tp[c]).nbr.add(tp[nb]); }
        const list = [...pcs.keys()].sort((a, b) => a - b);
        const inland = (p) => pcs.get(p).inland / pcs.get(p).cells.length;
        const hops = (from) => { const d = new Map([[from, 0]]), q = [from]; for (let h = 0; h < q.length; h++) for (const j of pcs.get(q[h]).nbr) if (!d.has(j)) { d.set(j, d.get(q[h]) + 1); q.push(j); } return d; };
        // ── 1. craton cores: the pieces deepest inland, as many as its size calls for, at least a piece apart ──
        const k = Math.max(1, Math.min(cfg.maxCores, list.length, Math.round(areaKm2 / cfg.coreAreaKm2)));
        const jitter = new Map(list.map(p => [p, 0.85 + 0.3 * rng()]));       // (not always the very deepest interior)
        const coreP = [];
        for (let i = 0; i < k; i++) {
            const far = coreP.map(hops);
            let best = -1, bs = -1;
            for (const p of list) {
                if (coreP.includes(p) || far.some(d => (d.get(p) ?? 99) < 2)) continue;
                const s = inland(p) * jitter.get(p);
                if (s > bs) { bs = s; best = p; }
            }
            if (best < 0) break;
            coreP.push(best);
        }
        const coreAge = coreP.map(() => cfg.coreAgeMyr[0] + (cfg.coreAgeMyr[1] - cfg.coreAgeMyr[0]) * rng());
        // ── 2. the rest docked outward from the cores, piece by piece (a Dijkstra in km between their middles) ──
        const mid = new Map(list.map(p => { const s = [0, 0, 0]; for (const c of pcs.get(p).cells) { s[0] += xyz[3 * c]; s[1] += xyz[3 * c + 1]; s[2] += xyz[3 * c + 2]; } const l = Math.hypot(...s); return [p, [s[0] / l, s[1] / l, s[2] / l]]; }));
        const pDist = new Map(), pCore = new Map(), heap = new MinHeap(64);
        coreP.forEach((p, i) => { pDist.set(p, 0); pCore.set(p, i); heap.push(0, p); });
        while (heap.size) {
            const p = heap.pop(), dp = heap.lastKey;
            if (dp > pDist.get(p)) continue;
            for (const j of pcs.get(p).nbr) {
                const nd = dp + R * Math.acos(Math.max(-1, Math.min(1, dot(mid.get(p), mid.get(j)))));
                if (nd < (pDist.get(j) ?? Infinity)) { pDist.set(j, nd); pCore.set(j, pCore.get(p)); heap.push(nd, j); }
            }
        }
        // (a piece no core reached — cut off by a sea the crust opened — is its own young terrane)
        const ringKm = cfg.ringKm[0] + (cfg.ringKm[1] - cfg.ringKm[0]) * rng();
        const ringStep = cfg.ringStepMyr[0] + (cfg.ringStepMyr[1] - cfg.ringStepMyr[0]) * rng();
        const ageOf = new Map(), ringOfP = new Map();
        for (const p of list) {
            if (!pCore.has(p)) { ageOf.set(p, cfg.youngestRingMyr); ringOfP.set(p, 99); continue; }
            const ring = coreP.includes(p) ? 0 : 1 + Math.floor(pDist.get(p) / ringKm);
            ringOfP.set(p, ring);
            ageOf.set(p, ring ? Math.max(cfg.youngestRingMyr, coreAge[pCore.get(p)] - ring * ringStep * (0.85 + 0.3 * rng())) : coreAge[pCore.get(p)]);
        }
        // the cratons: a core piece's interior, cratonRimKm in from its edges and cratonCoastKm from the sea
        for (const p of coreP) for (const c of pcs.get(p).cells) if (inFromEdge[c] >= cfg.cratonRimKm && coastOk(c, cfg.cratonCoastKm)) crust.type[c] = CrustType.CRATON;
        for (const p of list) {
            const id = nextTerrane++;
            for (const c of pcs.get(p).cells) { terrane[c] = id; coreOf[c] = pCore.get(p) ?? -1; ringOf[c] = ringOfP.get(p); }
        }
        coreCount += coreP.length;
        // ── the events ──
        // (a) each piece docking, at its age, along its border with the pieces of its core already in (nearer the core):
        // a Ural-type welt on the piece's edge — the old ranges run along the pieces' outlines
        for (const p of list) {
            if (!pDist.has(p) || coreP.includes(p)) continue;
            const front = [];
            for (const c of pcs.get(p).cells) {
                if (!coastOk(c, cfg.pastCoastKm)) continue;
                for (let j = adjOffset[c]; j < adjOffset[c + 1]; j++) {
                    const nb = adjList[j], q = tp[nb];
                    if (inMass(nb) && q !== p && q >= 0 && pCore.get(q) === pCore.get(p) && (pDist.get(q) ?? Infinity) < pDist.get(p)) { front.push(c); break; }
                }
            }
            if (front.length < 2) continue;
            const work = cfg.ringWorkKm[0] + (cfg.ringWorkKm[1] - cfg.ringWorkKm[0]) * rng();
            // (G4d: some pieces docked quietly — a suture, a weak line the far field can find, but no range of its own; so
            // the old ranges are some of the pieces' outlines, not a net round every one. Its own draw)
            const quiet = makeRng((seed ^ 0x9d0c) + p * 7919)() < cfg.ringQuietShare;
            events.push({ age: ageOf.get(p), kind: 'ring', type: OrogenyType.URAL, side: BeltSide.NONE, front, work, allow: inMass, strength: quiet ? 0 : 1 });
        }
        // (a2) G4c: the smaller terranes each piece is made of (the "small plates"), welded before it docked or worked
        // since: a low welt along each seam between two of them (each its own age and work, most of them old and worn)
        // — texture on the ranges and the plains between, none inside a craton
        for (const p of list) {
            const seams = new Map();
            for (const c of pcs.get(p).cells) {
                if (!coastOk(c, cfg.pastCoastKm) || crust.type[c] === CrustType.CRATON) continue;
                for (let j = adjOffset[c]; j < adjOffset[c + 1]; j++) {
                    const nb = adjList[j];
                    if (tp[nb] !== p || sub[nb] === sub[c]) continue;
                    const key = Math.min(sub[c], sub[nb]) * 4096 + Math.max(sub[c], sub[nb]);
                    if (!seams.has(key)) seams.set(key, []);
                    seams.get(key).push(c); break;
                }
            }
            for (const key of [...seams.keys()].sort((a, b) => a - b)) {
                const front = seams.get(key);
                if (front.length < 2) continue;
                const r = makeRng((seed ^ 0x5b5e) + key);
                const hi = Math.min(cfg.subAgeMyr[1], (ageOf.get(p) ?? cfg.subAgeMyr[1]) + cfg.subOlderMyr);
                const age = Math.exp(Math.log(cfg.subAgeMyr[0]) + (Math.log(Math.max(cfg.subAgeMyr[0] + 1, hi)) - Math.log(cfg.subAgeMyr[0])) * r());
                events.push({ age, kind: 'sub', type: OrogenyType.URAL, side: BeltSide.NONE, front, allow: inMass, strength: 1,
                    work: cfg.subWorkKm[0] + (cfg.subWorkKm[1] - cfg.subWorkKm[0]) * r() });
            }
        }
        // (b) the cores welding where their growths meet — along the pieces' edges between them: the major sutures, the
        // last pair to meet the youngest
        const pairs = new Map();
        for (const c of cells) for (let j = adjOffset[c]; j < adjOffset[c + 1]; j++) {
            const nb = adjList[j];
            if (!inMass(nb) || nb < c || coreOf[nb] < 0 || coreOf[c] < 0 || coreOf[nb] === coreOf[c]) continue;
            const key = Math.min(coreOf[c], coreOf[nb]) * 64 + Math.max(coreOf[c], coreOf[nb]);
            if (!pairs.has(key)) pairs.set(key, []);
            pairs.get(key).push(c, nb);
        }
        const weights = coreP.map(p => pcs.get(p).cells.length);
        const pairList = [...pairs.entries()].sort((a, b) => a[0] - b[0]);
        pairList.forEach(([key, seam], j) => {
            const last = j === pairList.length - 1;
            const age = last ? cfg.lastWeldMyr[0] + (cfg.lastWeldMyr[1] - cfg.lastWeldMyr[0]) * rng() : cfg.weldMyr[0] + (cfg.weldMyr[1] - cfg.weldMyr[0]) * rng();
            const work = cfg.weldWorkKm[0] + (cfg.weldWorkKm[1] - cfg.weldWorkKm[0]) * rng();
            const i0 = Math.floor(key / 64), i1 = key % 64;
            // (M2: one range per suture — its style says what each side does; the side thrust over, the larger core's)
            const big = weights[i0] >= weights[i1] ? i0 : i1;
            const front = [...new Set(seam.filter(c => coastOk(c, cfg.pastCoastKm)))].sort((a, b) => a - b);
            if (front.length < 2) return;
            events.push({ age, kind: 'weld', type: OrogenyType.URAL, side: BeltSide.NONE, front, work, allow: inMass, strength: last ? 1 : cfg.innerWeldShare,
                // (which side of the range the larger core lies on: + its left, − its right)
                upper: (side) => { let s = 0; for (const c of cells) if (side[c] && coreOf[c] === big) s += side[c]; return s; } });
        });
    });

    // ── G5b: across a fitting pair's ocean, what was one carries on — each old range or weld that reaches one facing coast
    // carries on from the matching point of the other (the closing rotation's), along its own trend, into that continent
    // (the Appalachians and the Caledonides); a shield cut by one coast carries on at the other's (the São Francisco and the
    // Congo cratons); and a failed rift arm points inland from the join on one side (the Benue trough) ──
    const fitEvents = [];
    let fitShields = 0, fitArms = 0;
    if (fits) fits.pairs.forEach((pr, pi) => {
        if (!pr.ok) return;
        for (const [from, to, M, Minv, kmFrom, kmTo] of [[pr.massB, pr.massA, pr.R, pr.Rinv, pr.kmB, pr.kmA], [pr.massA, pr.massB, pr.Rinv, pr.R, pr.kmA, pr.kmB]]) {
            for (const ev of events) {
                if ((ev.kind !== 'ring' && ev.kind !== 'weld') || !(ev.strength > 0) || fits.mass[ev.front[0]] !== from) continue;
                // (each stretch of the front within the band on its own: a docked piece's outline can reach the coast twice)
                for (const run of runsOf(ev.front.filter(c => kmFrom[c] <= cfg.fitGeoBandKm))) {
                    if (run.length < 2) continue;
                    const front = continueAlong(run.map(c => rotate(M, at(sim.xyz, c))), to, cfg.fitGeoExtendKm);
                    if (front.length >= 3) fitEvents.push({ ...ev, front, allow: (c) => fits.mass[c] === to, fit: true });
                }
            }
            // the shields: each cell of the other side's band read back through the rotation (so the shield carried across
            // is whole, not the speckle a push of each source cell to its nearest would leave)
            for (let c = 0; c < n; c++) {
                if (fits.mass[c] !== to || !(kmTo[c] <= cfg.fitGeoBandKm) || crust.type[c] === CrustType.CRATON) continue;
                const p = rotate(Minv, at(sim.xyz, c)), s = sim.index.nearest(p[0], p[1], p[2]);
                if (fits.mass[s] === from && kmFrom[s] <= cfg.fitGeoBandKm && crust.type[s] === CrustType.CRATON) { crust.type[c] = CrustType.CRATON; fitShields++; }
            }
        }
        // the failed arm: from a point of A's facing coast where B's fits closest, inland on one side or the other
        const r = makeRng((seed ^ 0xa4a7) + pi * 7919);
        const good = pr.facingA.filter(c => { const p = rotate(pr.Rinv, at(sim.xyz, c)); for (const o of pr.facingB) if (kmBetween(p, at(sim.xyz, o)) < cfg.fitArmFitKm) return true; return false; });
        if (!good.length) return;
        const ca = good[Math.floor(r() * good.length)];
        const onA = r() < 0.5, start = onA ? ca : sim.index.nearest(...rotate(pr.Rinv, at(sim.xyz, ca)));
        const m = onA ? pr.massA : pr.massB, km = onA ? pr.kmA : pr.kmB;
        if (fits.mass[start] !== m) return;
        // (inland: down the gradient of the distance from its facing coast, step by step)
        let c = start;
        const L = cfg.fitArmKm[0] + (cfg.fitArmKm[1] - cfg.fitArmKm[0]) * r();
        for (let step = 0; step < 200; step++) {
            crust.flags[c] |= CrustFlag.FAILED_RIFT; fitArms++;
            if (km[c] >= L) break;
            let best = -1, bk = km[c];
            for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const nb = adjList[k]; if (fits.mass[nb] === m && km[nb] > bk) { bk = km[nb]; best = nb; } }
            if (best < 0) break;
            c = best;
        }
    });

    // ── replay, oldest first, the land wearing down between events ──
    events.push(...fitEvents, ...extra);
    events.sort((a, b) => b.age - a.age || a.front[0] - b.front[0]);
    // (G4d: which kind of event last raised each cell — 1 an old orogeny, 2 a seam between two pieces of one plate (a
    // minor plate's) — for the checks' tiers; and the old collisions' pushes through their continents, the grain they left)
    const tier = new Uint8Array(n), pushWorld = { config: { ...config, farReachKm: cfg.farPushReachKm }, mesh: sim };
    // M1–M2 (present/ranges.js; owner, 2026-11-05: the ranges were "worm like … they all look the same"): each event's
    // range shaped before the replay — its outline smoothed into a curve, cut into lens-shaped segments stepped en
    // echelon, written as its style's kind of belt (a quiet docking none: its outline only a weak line)
    const coastKmOf = (ev) => (ev.kind === 'seam' ? cfg.rangeCoastKm : cfg.pastCoastKm);
    for (const ev of events) {
        ev.outline = ev.front; ev.parts = []; ev.works = [];
        const work = ev.work * ev.strength;
        if (!(work > 0)) continue;
        const width = Math.min(config.belts.ural.maxKm, beltWidthKm('ural', work, cfg.pastRateCmYr, config));
        const shaped = shapeRange(sim, { ...ev, work }, { source: (c) => land[c] === 1 && ev.allow(c) && coastOk(c, coastKmOf(ev)), reach: ev.allow }, width, seed, cfg);
        ev.style = shaped.style; ev.parts = shaped.parts; ev.front = shaped.front; ev.works = shaped.works;
        const mark = ev.kind === 'weld' ? seamMajor : ev.kind === 'sub' ? seamSub : ev.kind === 'ring' ? seamRing : null;
        if (mark && ev.parts.length) for (const c of ev.front) mark[c] = 1;
    }
    let clock = -Infinity;
    for (const ev of events) {
        const t = -ev.age;
        if (clock > -Infinity) wear(t - clock);
        clock = t;
        // (the weak line: where the pieces met — the outline, the range's or a quiet docking's; the far field squeezing it up
        // again shapes its range as these are, present/plumes.js)
        for (const c of ev.outline) crust.flags[c] |= CrustFlag.SUTURE;
        if (!ev.parts.length) continue;
        for (const part of ev.parts)
            spreadBelt({ crust }, sim, part.front, { type: part.type, time: t, side: part.side, widths: part.widths, works: part.works, amps: part.amps, shear: part.shear, widthKm: 0, workKm: 0 }, config, part.allow);
        // (the event lasted a while: it began this long before its end)
        // (the records are Float32: the event's time as they hold it)
        const tf = Math.fround(t);
        for (const c of ev.front) if (crust.oroLast[c] === tf && crust.oroStart[c] === tf) crust.oroStart[c] = t - cfg.pastEventMyr;
        for (let c = 0; c < n; c++) if (crust.oroLast[c] === tf && crust.oroType[c]) tier[c] = ev.kind === 'seam' ? 2 : 1;
        // (the collision pushed through its continent: a docking piece's, two cores' — Evolution's far field, whose grain the
        // terrain draws; tectonics/step/far-field.js spreadPush)
        if ((ev.kind === 'weld' || ev.kind === 'ring') && cfg.farPastShare > 0) {
            const mask = new Uint8Array(n); for (let c = 0; c < n; c++) if (ev.allow(c)) mask[c] = 1;
            const src = new Map(); ev.front.forEach((c, i) => { if (ev.works[i] > 0) src.set(c, ev.works[i] * cfg.farPastShare); });
            if (src.size) spreadPush(pushWorld, { crust: { mask, type: crust.type, flags: crust.flags, farWork: crust.farWork, farDist: crust.farDist, farFold: crust.farFold, farAt: crust.farAt, farDx: crust.farDx, farDy: crust.farDy, farDz: crust.farDz } }, src, ev.front.length * sim.edgeKm, t);
        }
    }
    if (clock > -Infinity) wear(0 - clock);

    // ── 3. swells: uplands along the seams (the worn highlands round an old range), lowlands between; cratons calm ──
    const toMajor = dijkstra(sim, (c) => seamMajor[c], (c) => land[c], kmOf), toRing = dijkstra(sim, (c) => seamRing[c], (c) => land[c], kmOf);
    const toSub = dijkstra(sim, (c) => seamSub[c], (c) => land[c], kmOf);
    const seamKm = new Float32Array(n);
    for (let c = 0; c < n; c++) {
        if (!land[c]) continue;
        seamKm[c] = Math.min(toMajor[c], toRing[c]);
        const g = (d, s) => (d < Infinity ? Math.exp(-0.5 * (d / s) ** 2) : 0);
        let b = cfg.swellMajorKm * g(toMajor[c], cfg.swellMajorWidthKm) + cfg.swellRingKm * g(toRing[c], cfg.swellRingWidthKm) + cfg.swellSubKm * g(toSub[c], cfg.swellSubWidthKm);
        b += cfg.swellNoiseKm * nAt(c, 2200, 21.1) + cfg.swellFloorKm;
        if (crust.type[c] === CrustType.CRATON) b *= 0.5;
        // (and the swells sink toward the coast, under the coastal plain)
        b *= Math.min(1, Math.max(0, (toSea[c] - 0.3 * cfg.pastCoastKm) / cfg.pastCoastKm));
        crust.baseKm[c] = Math.max(0, b);
        crust.terrane[c] = terrane[c];
    }
    return { events, terrane, seamKm, cores: coreCount, tier, fit: { events: fitEvents.length, shields: fitShields, arms: fitArms } };

    /** Cells in connected runs (over the sim mesh's adjacency). */
    function runsOf(cells) {
        const inSet = new Set(cells), seen = new Set(), out = [];
        for (const s of cells) {
            if (seen.has(s)) continue;
            const run = [s]; seen.add(s);
            for (let h = 0; h < run.length; h++) for (let k = adjOffset[run[h]]; k < adjOffset[run[h] + 1]; k++) { const nb = adjList[k]; if (inSet.has(nb) && !seen.has(nb)) { seen.add(nb); run.push(nb); } }
            out.push(run);
        }
        return out;
    }

    /** The cells of landmass `to` along the trend of points `pts` (a great circle through their middle), within `km` of it. */
    function continueAlong(pts, to, km) {
        const mid = unitV(pts.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]));
        const up = Math.abs(mid[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
        const e = unitV(crossV(up, mid)), f = crossV(mid, e);
        let suu = 0, svv = 0, suv = 0;
        for (const p of pts) { const u = dot(p, e), v = dot(p, f); suu += u * u; svv += v * v; suv += u * v; }
        const th = 0.5 * Math.atan2(2 * suv, suu - svv), t = [e[0] * Math.cos(th) + f[0] * Math.sin(th), e[1] * Math.cos(th) + f[1] * Math.sin(th), e[2] * Math.cos(th) + f[2] * Math.sin(th)];
        const out = new Set(), step = 0.5 * sim.edgeKm;
        for (let s = -km; s <= km; s += step) {
            const a = s / R, p = [mid[0] * Math.cos(a) + t[0] * Math.sin(a), mid[1] * Math.cos(a) + t[1] * Math.sin(a), mid[2] * Math.cos(a) + t[2] * Math.sin(a)];
            const c = sim.index.nearest(p[0], p[1], p[2]);
            if (fits.mass[c] === to && land[c]) out.add(c);
        }
        return [...out].sort((a, b) => a - b);
    }

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
