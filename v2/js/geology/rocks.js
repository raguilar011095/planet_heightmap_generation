// Rocks (plans/V2_GEOLOGY_PLAN.md G2; Madeline James's major rock types map): what each place of a finished moment is
// made of at the surface. Each land cell of the history keeps a rock column (tectonics/step/geology.js) — sediment cover
// over the basement, the basement worn to some depth — and the setting it was last in. Here, per cell of the finished
// surface:
//   · the BASEMENT, from that setting and that depth: a live arc's volcanics, bared to its granite batholiths once its
//     lid is worn off, then gneiss; a collision belt's folded rocks — slate and schist, then gneiss, with granite plutons;
//     a shield's granite-gneiss domes between greenstone keels (each craton its own share and style); an old mobile
//     belt's gneiss; a closed sea's ophiolite; a hotspot island's basalt;
//   · the COVER over it as beds, cut by the finished surface as a geologic map shows them: where the ground lies below
//     the land around it (a valley) older beds crop out, so outcrops follow the valleys; across a fold belt its folds
//     bare older beds in stripes along the belt; less where the region shed its cover (a canyon country, glacial scour,
//     high ground); each bed's kind by the cover's make-up — limestone, salt seldom, sandstone or shale;
//   · YOUNG SEDIMENT over both — the plains along the big rivers (the low ground near them, wider down a bigger river),
//     deltas and basin floors, sand seas, loess, moraines and outwash — and FLOOD BASALT where a large igneous province
//     still caps the ground.
// The history's record is read where the terrain read it (each cell's record cell, handed over by the surface:
// terrain/synthesize.js recCell), so belts and basins sit on the terrain's own; read smoothly over a sim cell or so and
// through a fractal warp, so contacts wander and fold at every scale the mesh draws but never show the sim's cells.

import { CrustType, CrustFlag, OrogenyType, VolcanicType } from '../tectonics/model/crust.js';
import { GeoFlag, decodeCoverKm, decodeExhumKm, decodeUnroofKm, decodeFacies, decodeArcMyr } from '../tectonics/model/geology.js';
import { warpField, warpPoint } from '../terrain/terrain-mesh.js';
import { locate } from '../core/mesh-locate.js';
import { FastNoise } from '../core/fast-noise.js';
import { spreadKm } from '../core/min-heap.js';
import { LatLonGrid } from '../finish/finish-grid.js';
import { GEOLOGY } from './geology-config.js';

const R = 6371, DEG = 180 / Math.PI;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** The kinds of rock shown (0 = sea). Families: young sediment; sedimentary rock; volcanic; plutonic; metamorphic. */
export const Rock = Object.freeze({ NONE: 0, ALLUVIUM: 1, SANDSTONE: 2, SHALE: 3, LIMESTONE: 4, SALT: 5, BASALT: 6, VOLCANIC: 7, GRANITE: 8,
    SLATE: 9, GNEISS: 10, SHIELD: 11, GREENSTONE: 12, OPHIOLITE: 13 });
export const ROCK_COUNT = 14;
/** Each kind's name, colour (the geologic map's families, softened: warm sands and tans for sediment, blue limestone,
 *  violet volcanics, red granite, greens metamorphic, rose shields — research §3, BGR/CGMW), and its family (for the
 *  Earth comparison: GLiM, Hartmann & Moosdorf 2012). */
export const ROCK_INFO = [
    { name: 'Sea', rgb: [0, 0, 0], family: null },
    { name: 'Young sediment', rgb: [240, 228, 168], family: 'loose', words: 'river plains, deltas, dunes, loess and moraines' },
    { name: 'Sandstone', rgb: [222, 182, 110], family: 'sedimentary' },
    { name: 'Shale & mudstone', rgb: [176, 150, 112], family: 'sedimentary' },
    { name: 'Limestone', rgb: [118, 172, 222], family: 'sedimentary' },
    { name: 'Salt & gypsum', rgb: [236, 176, 208], family: 'sedimentary' },
    { name: 'Basalt', rgb: [96, 80, 120], family: 'volcanic' },
    { name: 'Andesite & rhyolite', rgb: [172, 124, 204], family: 'volcanic' },
    { name: 'Granite', rgb: [226, 110, 104], family: 'plutonic' },
    { name: 'Slate & schist', rgb: [136, 192, 140], family: 'metamorphic' },
    { name: 'Gneiss', rgb: [70, 140, 112], family: 'metamorphic' },
    { name: 'Shield granite-gneiss', rgb: [212, 150, 164], family: 'metamorphic' },
    { name: 'Greenstone', rgb: [52, 112, 84], family: 'metamorphic' },
    { name: 'Ophiolite & mélange', rgb: [44, 98, 112], family: 'plutonic' },
];
/** Earth's land, ice- and water-free, by family (GLiM, research §3: 28 % loose, 42 % sedimentary rock, 15 % metamorphic,
 *  7.5 % plutonic, 7.5 % volcanic). */
export const EARTH_FAMILIES = { loose: 0.28, sedimentary: 0.42, metamorphic: 0.15, plutonic: 0.075, volcanic: 0.075 };

// the basement's kinds, per sim cell (scores 0…1), then shaped per point by patterns
const B_VOLC = 0, B_BASALT = 1, B_GRANITE = 2, B_SLATE = 3, B_GNEISS = 4, B_SHIELD = 5, B_OPHIO = 6, NB = 7;
const ARC_BELTS = new Set([OrogenyType.ANDEAN, OrogenyType.ARC]);
const COLLISION_BELTS = new Set([OrogenyType.URAL, OrogenyType.HIMALAYAN, OrogenyType.TRANSPRESSION]);

/**
 * The history's record per sim cell, read off a frame into what the rocks need: the cover (km, its kinds), the
 * basement's kinds (scores), a craton's character, a suture's slivers. Small (sim-mesh sized).
 */
export function simRocks(frame, simMesh, seed, G = GEOLOGY) {
    const n = simMesh.numCells, time = frame.time, fac = {};
    const S = { cover: new Float32Array(n), carb: new Float32Array(n), salt: new Float32Array(n), marine: new Float32Array(n), organic: new Float32Array(n),
        base: new Float32Array(NB * n), green: new Float32Array(n), style: new Float32Array(n), axis: new Float32Array(3 * n), suture: new Float32Array(n),
        felsic: new Float32Array(n), fold: new Float32Array(n), dKm: new Float32Array(n), land: new Uint8Array(n) };
    const lerp = (r, t) => r[0] + (r[1] - r[0]) * t;
    for (let w = 0; w < n; w++) {
        if (frame.owner[w] < 0 || frame.type[w] === CrustType.OCEAN) continue;
        S.land[w] = 1;
        const type = frame.type[w], flags = frame.flags[w], geo = frame.geoFlags[w];
        S.cover[w] = decodeCoverKm(frame.coverKm[w]);
        decodeFacies(frame.facies[w], fac);
        S.carb[w] = fac.carb; S.salt[w] = fac.salt; S.organic[w] = fac.organic;
        S.marine[w] = geo & (GeoFlag.SHELF | GeoFlag.EPEIRIC) ? 1 : 0;
        const ex = decodeExhumKm(frame.exhumKm[w]), un = decodeUnroofKm(frame.unroofKm[w]), b = NB * w;
        const slate = smooth(G.gradeKm.slate[0], G.gradeKm.slate[1], ex), gneiss = smooth(G.gradeKm.gneiss[0], G.gradeKm.gneiss[1], ex);
        // (the grade: folded sediment and volcanics worn into slate and schist, then gneiss)
        // (guideRules.graniteIntrusive off: her granitic rock in every orogeny, worn or not)
        const bared = G.guideRules.graniteIntrusive ? slate : 1;
        const meta = (share, granite) => {
            S.base[b + B_GRANITE] += share * granite * bared;
            S.base[b + B_SLATE] += share * (1 - granite * bared) * slate * (1 - gneiss);
            S.base[b + B_GNEISS] += share * (1 - granite * bared) * gneiss;
            S.base[b + B_VOLC] += share * (1 - slate) * 0.15;           // (an unworn belt's own volcanics, folded in)
            S.base[b + B_SLATE] += share * (1 - slate) * 0.85;          // (…and its folded sediment, under any cover left: slate-like)
        };
        const belt = frame.oroType[w], age = belt ? time - frame.oroLast[w] : Infinity;
        S.fold[w] = belt ? 1 : geo & GeoFlag.FORELAND ? 0.3 : 0;      // (its beds folded: a belt’s, a foreland’s gently)
        S.dKm[w] = belt ? (frame.beltU[w] / 255) * frame.beltReach[w] : 0;          // (how far from the belt's front: its folds run along it)
        const live = belt ? 1 - smooth(G.arcActiveMyr[0], G.arcActiveMyr[1], age) : 0;
        const u = frame.beltU[w] / 255;
        // a hotspot's island on land: basalt
        if (frame.volcType[w] === VolcanicType.TRACK && frame.volcKm[w] > 0) { S.base[b + B_BASALT] = 1; continue; }
        if (type === CrustType.CRATON && !belt) {
            // a shield: its own character (seeded per craton): greenstone's share, domes or belts, the belts' trend
            const h = hash01(seed, frame.terrane[w]), h2 = hash01(seed ^ 0x51ed, frame.terrane[w]), h3 = hash01(seed ^ 0x7a11, frame.terrane[w]);
            S.base[b + B_SHIELD] = 1;
            // (a shield worn shallower keeps more of its greenstone; one worn deep is granulite gneiss)
            S.green[w] = lerp(G.greenstoneShare, h) * (1.3 - 0.6 * smooth(12, 28, ex));
            S.style[w] = h2 < G.beltStyleShare ? 1 : 0;
            const th = 2 * Math.PI * h3, ph = Math.acos(2 * hash01(seed ^ 0x3c3c, frame.terrane[w]) - 1);
            S.axis[3 * w] = Math.sin(ph) * Math.cos(th); S.axis[3 * w + 1] = Math.sin(ph) * Math.sin(th); S.axis[3 * w + 2] = Math.cos(ph);
            continue;
        }
        // ophiolite: a closed sea's floor thrust up; slivers along old sutures
        if (geo & GeoFlag.OPHIOLITE) { S.base[b + B_OPHIO] = G.ophioliteFlag; meta(1 - G.ophioliteFlag, 0); continue; }
        if (flags & CrustFlag.SUTURE) S.suture[w] = G.sutureOphiolite;
        if (ARC_BELTS.has(belt) || belt === OrogenyType.LARAMIDE || type === CrustType.ARC || ((geo & GeoFlag.WAS_ARC) && !belt)) {
            // an arc, live or old: its volcanic lid (andesite; basalt on an island arc's thin crust; rhyolite and tuff on
            // thick crust — guideRules.arcRockByCrust), bared to its granite batholiths, then to gneiss. Across an Andean
            // belt the volcanoes stand on its arc only (arcFront); a flat slab's belt has none — its arc gap bares the
            // basement in uplifts (the Laramide's ranges). An accreted arc no longer live is worn like any
            const island = type === CrustType.ARC;
            const onArc = belt === OrogenyType.ANDEAN ? smooth(0, G.arcFront[0], u) * (1 - smooth(G.arcFront[1] - 0.1, G.arcFront[1] + 0.1, u)) : 1;
            const lid = belt === OrogenyType.LARAMIDE ? 0 : (1 - smooth(G.volcanicLidKm[0], G.volcanicLidKm[1], live > 0.5 ? 0 : Math.max(0, un))) * Math.max(onArc * Math.max(live, 0.4), island ? 1 : 0);
            S.felsic[w] = G.guideRules.arcRockByCrust ? (island ? 0 : smooth(G.felsicThickKm[0], G.felsicThickKm[1], frame.thickKm[w])) : (belt === OrogenyType.LARAMIDE ? 0 : 0.6);
            // (an island arc's thin crust: basalt among its andesite — by the crust, guideRules.arcRockByCrust)
            if (island && lid > 0 && G.guideRules.arcRockByCrust) { S.base[b + B_BASALT] += lid * 0.35; S.base[b + B_VOLC] += lid * 0.65; } else S.base[b + B_VOLC] += lid;
            const roots = 1 - lid;
            S.base[b + B_GRANITE] += roots * G.arcGranite * (1 - smooth(G.gradeKm.gneiss[0], G.gradeKm.gneiss[1], ex));
            meta(roots * (1 - G.arcGranite), 0);
            if (belt !== OrogenyType.ANDEAN && belt !== OrogenyType.ARC) S.base[b + B_GRANITE] += roots * 0.3;
            continue;
        }
        if (COLLISION_BELTS.has(belt) || belt === OrogenyType.RIFT) {
            // a collision belt: folded rocks worn to slate and schist, then gneiss, with granite plutons where it is worn
            // past its sediments (S-type, crustal melts: tin's granites); a rift's shoulders: the basement raised, with
            // basalt where it is young
            meta(1, belt === OrogenyType.RIFT ? G.beltGranite : G.collisionGranite);
            if (belt === OrogenyType.RIFT) S.base[b + B_BASALT] += 0.35 * live;
            continue;
        }
        // older continental crust with no belt of its own: the start world's mobile belts about the cratons (gneiss and
        // schist with granite) — or crust a newer history made
        meta(1, G.beltGranite);
    }
    return S;
}

/** One pass of a majority filter: a land cell whose neighbours mostly agree on another kind (4 of its ~6) takes it. */
function despeckle(mesh, rock, ocean, counts) {
    const { adjOffset, adjList, numCells: n } = mesh, was = rock.slice(), tally = new Uint8Array(ROCK_COUNT);
    for (let c = 0; c < n; c++) {
        if (ocean[c]) continue;
        let best = -1, bn = 0, all = 0;
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const r = was[adjList[k]]; if (!r) continue; all++; if (++tally[r] > bn) { bn = tally[r]; best = r; } }
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) tally[was[adjList[k]]] = 0;
        if (best > 0 && best !== was[c] && bn >= Math.max(3, Math.ceil(0.6 * all))) { counts[was[c]]--; counts[best]++; rock[c] = best; }
    }
}

/** 0…1 from a seed and an id (a craton keeps its own character). */
function hash01(seed, id) {
    let h = (seed ^ Math.imul(id + 0x9e37, 0x85ebca6b)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d); h = Math.imul(h ^ (h >>> 15), 0x846ca68b); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

/**
 * River plains: the low ground along each big river (its discharge over floodplainQ[0]) — within its plain's half-width
 * (wider down a bigger river) and not much above the river where it is nearest (the height above the nearest drainage:
 * a terrace or a valley side is not its plain). 0…1 per cell.
 */
function floodplains(mesh, z, ocean, q, G) {
    const n = mesh.numCells, dist = new Float32Array(n).fill(Infinity), base = new Float32Array(n), reach = new Float32Array(n), out = new Float32Array(n);
    const [qMin, qRef] = G.floodplainQ, [hFull, hNone] = G.floodplainHandKm, [wMin, wRef, wMax] = G.floodplainKm;
    for (let c = 0; c < n; c++) if (!ocean[c] && q[c] >= qMin) { dist[c] = 0; base[c] = z[c]; reach[c] = Math.min(wMax, Math.max(wMin, wRef * (q[c] / qRef) ** 0.4)); }
    spreadKm(mesh, dist, { maxKm: wMax + mesh.edgeKm, canEnter: (a, b) => !ocean[b] && z[b] - base[a] < hNone, onReach: (a, b) => { base[b] = base[a]; reach[b] = reach[a]; } });
    // (each cell by how much of it the plain covers — a channel's cell its plain's full width, one beside it the part
    // within reach — so a plain narrower than the mesh's cells does not show, and a wide one shows alike at every detail)
    const cellKm = mesh.edgeKm;
    for (let c = 0; c < n; c++) {
        if (!(dist[c] <= reach[c] + 0.5 * cellKm)) continue;
        const part = dist[c] === 0 ? Math.min(1, 2 * reach[c] / cellKm) : Math.max(0, Math.min(1, (reach[c] - dist[c]) / cellKm + 0.5));
        out[c] = smooth(hNone, hFull, z[c] - base[c]) * part;
    }
    return out;
}

/**
 * The world cell whose record each terrain cell shows, read through the terrain's large warp (terrain-mesh.js) — when
 * the surface did not hand its own over (terrain/synthesize.js recCell): the heaviest land corner.
 */
function readRecord(mesh, simMesh, S, seed, cfg) {
    const n = mesh.numCells, { xyz } = mesh, rec = new Int32Array(n), W = warpField(seed, cfg), q = [0, 0, 0], c3 = [0, 0, 0], w3 = [0, 0, 0];
    for (let c = 0; c < n; c++) {
        warpPoint(W, cfg, xyz[3 * c], xyz[3 * c + 1], xyz[3 * c + 2], q);
        locate(simMesh, q[0], q[1], q[2], c3, w3);
        let best = c3[0], bw = -1;
        for (let j = 0; j < 3; j++) { const k = w3[j] + (S.land[c3[j]] ? 1 : 0); if (k > bw) { bw = k; best = c3[j]; } }
        rec[c] = best;
    }
    return rec;
}

/**
 * Each land cell of the finished surface: its kind of rock (Rock).
 * @param {Object} o  { mesh (the finish's), z (km), ocean, frame, simMesh, seed, cfg (the terrain's), recCell (the world
 *                     cell whose record each cell shows, as the terrain read it; else read here), on ({grid, lat, lon}: the
 *                     finish's LatLonGrid and each cell's latitude and longitude, °), local: the finish's own fields, any of
 *                     them null — cut (how deep its rivers cut, × cutStepKm), alluv (the sediment they laid, × alluvStepKm),
 *                     erg (sand seas, 0…1), loess (km, × loessShare), till (moraines and outwash, 0…255), glaciated (under
 *                     the last ice age's ice, 0/1), lava (a flood basalt's cap, 0…255) }
 * @returns {{rock: Uint8Array, rec: Int32Array, shares: Float64Array, youngBy: Float64Array}} rec: each cell's record cell;
 *          shares: each kind's share of the land (by cell);
 *          youngBy: the land's share of young sediment laid by rivers, dunes, loess and the ice
 */
export function classifyRocks({ mesh, z, ocean, frame, simMesh, seed, cfg, recCell = null, on, local = {} }, G = GEOLOGY) {
    const n = mesh.numCells, { xyz } = mesh, rock = new Uint8Array(n), shares = new Float64Array(ROCK_COUNT);
    const S = simRocks(frame, simMesh, seed, G), rec = recCell ?? readRecord(mesh, simMesh, S, seed, cfg);
    const { grid, lat, lon } = on;
    const { cut, cutStepKm = 0, alluv, alluvStepKm = 0, erg, loess, loessShare = 1, till, glaciated, lava, q = null } = local;
    const nz = new FastNoise(((seed | 0) * 0x2c1b + 0x4d) >>> 0), patchF = R / G.patchKm, domeF = R / G.domeKm, beltF = 2 * Math.PI * R / G.beltSpacingKm;
    const score = new Float64Array(ROCK_COUNT);
    // ── the record, smooth: its cover, the cover's make-up, its folding — each cell's record cell's, averaged over a sim
    // cell or so (where the terrain read them: belts and basins sit where the terrain put them) ──
    const isRecLand = c => !ocean[c] && S.land[rec[c]] === 1, isLand = c => !ocean[c], tmp = new Float32Array(n);
    const recordKm = G.recordBlurCells * simMesh.edgeKm, coarse = new LatLonGrid(0.5);        // (smooth fields: a coarser grid)
    const smoothed = (f, km = recordKm) => { for (let c = 0; c < n; c++) tmp[c] = f[rec[c]]; return coarse.blur(coarse.average(lat, lon, tmp, isRecLand), km); };
    const F = { cover: smoothed(S.cover), carb: smoothed(S.carb), salt: smoothed(S.salt), organic: smoothed(S.organic), marine: smoothed(S.marine), fold: smoothed(S.fold), dKm: smoothed(S.dKm), suture: smoothed(S.suture) };
    // (and the basement's kinds, so a belt's zones — its grades, its batholiths, its volcanic front — run along it as its
    // record does, their contacts wandering, rather than a patchwork of the sim's cells)
    const FB = [];
    for (let k = 0; k < NB; k++) { for (let c = 0; c < n; c++) tmp[c] = S.base[NB * rec[c] + k]; FB.push(coarse.blur(coarse.average(lat, lon, tmp, isRecLand), recordKm)); }
    // ── the finished surface: each place's relief (its height over the land around it), and over its region (~50 km)
    // the height and the rivers' cuts (whether the cover is gone is a region's matter — high ground shedding it, a canyon
    // country cut through it) ──
    const ref = grid.blur(grid.average(lat, lon, z, isLand), G.reliefKm), hReg = coarse.blur(coarse.average(lat, lon, z, isLand), 50);
    // (the surface a little smoothed — over a cell or two — so a feature the map can show sets the rocks, not one cell's
    // roughness: its valleys and ridges, not their speckle)
    const zs = Float32Array.from(z);
    {
        const { adjOffset, adjList } = mesh;
        for (let pass = 0; pass < 2; pass++) {
            const was = zs.slice();
            for (let c = 0; c < n; c++) {
                if (ocean[c]) continue;
                let sum = was[c], k = 1;
                for (let j = adjOffset[c]; j < adjOffset[c + 1]; j++) { const d = adjList[j]; if (!ocean[d]) { sum += 0.5 * was[d]; k += 0.5; } }
                zs[c] = sum / k;
            }
        }
    }
    const cutReg = cut ? coarse.blur(coarse.average(lat, lon, cut, isLand), 50) : null;
    // ── the beds, counted up from the basement: each its thickness (seeded) ──
    const bedTop = [];
    for (let i = 0, b = 0; b < 40; i++) { b += G.bedKm * (0.6 + 0.8 * hash01(seed ^ 0x6b3d, i)); bedTop.push(b); }
    const bedOf = s => { let i = 0; while (i < bedTop.length - 1 && bedTop[i] <= s) i++; return i; };
    // (noise in km, its octaves down to what this mesh can show — the beds' contacts wander at every scale it draws)
    const octaves = (fromKm, n0) => { const out = []; for (let o = 0, lam = fromKm, a = 1; o < n0; o++, lam /= 2, a *= 0.55) { const f = smooth(1.5, 3, lam / mesh.edgeKm); if (f > 0.01) out.push([R / lam, a * f]); } return out; };
    const contactO = octaves(150, 2), bedO = octaves(120, 2), facF = R / G.facieKm, wanderF = R / 400, warpO = octaves(G.contactWarpKm[1], 3), warpA = G.contactWarpKm[0] / R;
    // (a fold belt's folds: waves across it, parallel to its front — a long set, and G.foldKm's where this mesh can draw it)
    const foldWaves = [[G.foldKm * 2.6, 0.6], [G.foldKm, smooth(1.5, 3, G.foldKm / mesh.edgeKm)]].filter(([, a]) => a > 0.01);
    const fbm = (O, x, y, zz, off) => { let s = 0; for (let o = 0; o < O.length; o++) { const [f, a] = O[o]; s += a * nz.noise3D(x * f + off + 1.3 * o, y * f + 2 * off + 2.9 * o, zz * f + 3 * off + 0.7 * o); } return s; };
    let land = 0;
    const youngBy = new Float64Array(4);
    // the river plains: along the big rivers (floodplains); and deltas and basin floors — the land where the rivers laid
    // the most, about plainsShare of it (how much they lay differs with the detail; where they lay it does not), never where
    // they laid less than alluviumKm[0] — a cell's deposit with its neighbours' (a plain, not a speck)
    const along = q ? floodplains(mesh, z, ocean, q, G) : null;
    let plain = null, plainLo = G.alluviumKm[0], plainHi = G.alluviumKm[1];
    if (alluv) {
        plain = new Float32Array(n);
        const { adjOffset, adjList } = mesh, sample = [];
        for (let c = 0; c < n; c++) {
            if (ocean[c]) continue;
            let s = alluv[c], k = 1;
            for (let j = adjOffset[c]; j < adjOffset[c + 1]; j++) { const d = adjList[j]; if (!ocean[d]) { s += 0.5 * alluv[d]; k += 0.5; } }
            plain[c] = s / k * alluvStepKm;
        }
        // (and once more: a plain is a few cells wide at least)
        const once = plain.slice();
        for (let c = 0; c < n; c++) {
            if (ocean[c]) continue;
            let s = once[c], k = 1;
            for (let j = adjOffset[c]; j < adjOffset[c + 1]; j++) { const d = adjList[j]; if (!ocean[d]) { s += 0.5 * once[d]; k += 0.5; } }
            plain[c] = s / k;
            if (c % 7 === 0) sample.push(plain[c]);
        }
        sample.sort((a, b) => a - b);
        const q = p => sample[Math.max(0, Math.min(sample.length - 1, Math.round(p * (sample.length - 1))))] ?? 0;
        plainLo = Math.max(G.alluviumKm[0], q(1 - G.plainsShare - 0.03)); plainHi = Math.max(plainLo + 1e-4, G.alluviumKm[0] * 2, q(1 - G.plainsShare + 0.03));
    }
    for (let c = 0; c < n; c++) {
        if (ocean[c]) continue;
        land++;
        const w = rec[c];
        // (land the record has as sea — a delta built out, a strait filled — is young sediment)
        if (!S.land[w]) { rock[c] = Rock.ALLUVIUM; shares[Rock.ALLUVIUM]++; youngBy[0]++; continue; }
        const x = xyz[3 * c], y = xyz[3 * c + 1], zz = xyz[3 * c + 2];
        // (the record read a little displaced — a fractal warp: its contacts wander and fold at every scale this mesh
        // draws, but stay whole lines — no islands of noise)
        let wx = x + warpA * fbm(warpO, x, y, zz, 31.7), wy = y + warpA * fbm(warpO, x, y, zz, 43.1), wz = zz + warpA * fbm(warpO, x, y, zz, 57.9);
        const wl = Math.hypot(wx, wy, wz); wx /= wl; wy /= wl; wz /= wl;
        const la = Math.asin(Math.max(-1, Math.min(1, wz))) * DEG, lo = Math.atan2(wy, wx) * DEG, tla = lat[c], tlo = lon[c];
        // ── where the surface meets the rock column: s km above the basement. The cover's top less what the region shed;
        // down into older beds where the ground lies below the land around it (a valley — steeply in a fold belt, its
        // beds on edge: stripes along its ridges); the contact wandering, as far as there is cover to wander ──
        const T = coarse.at(F.cover, la, lo), fold = coarse.at(F.fold, la, lo), r = zs[c] - grid.at(ref, tla, tlo);
        const strip = (cutReg ? coarse.at(cutReg, tla, tlo) * cutStepKm : 0) + (glaciated && glaciated[c] ? G.glacialStripKm : 0) + G.highStripPerKm * Math.max(0, coarse.at(hReg, tla, tlo) - G.highStripFromKm);
        const top = T - strip;
        // (a fold belt: across it, synclines keep the top beds, anticlines bare older ones — stripes along the belt, its
        // basement in the anticlines' cores where the cover is thin; −1 in an anticline … +1 in a syncline)
        let syn = 0;
        if (fold > 0.02 && foldWaves.length) {
            const d = coarse.at(F.dKm, la, lo) / Math.max(0.05, fold), wander = 2 * nz.noise3D(x * wanderF + 4.2, y * wanderF + 8.8, zz * wanderF + 0.6) + 0.5 * fbm(contactO, x, y, zz, 17.3);
            let sum = 0, amp = 0;
            for (const [lam, a] of foldWaves) { sum += a * Math.cos(2 * Math.PI * d / lam + wander); amp += a; }
            syn = fold * sum / amp;
        }
        const s = top - G.foldDepthKm * (fold - syn) * 0.5 + G.reliefGain * (1 - 0.7 * fold) * Math.min(0, r) + (T > 0 ? G.bedJitterKm * smooth(0, 0.5, T) * fbm(contactO, x, y, zz, 3.1) : 0);
        score.fill(0);
        if (s > G.coverShowKm) {
            // the bed here, and its kind: by the cover's make-up (lime where it was laid as carbonate, salt seldom, else
            // sand and mud — mud more where laid in the sea or rich in organic matter; the lowest bed sandier), each bed
            // its own pattern across country
            const i = bedOf(s + 0.5 * G.bedJitterKm * fbm(bedO, x, y, zz, 7.7));
            const carb = coarse.at(F.carb, la, lo), salt = G.saltShare * coarse.at(F.salt, la, lo), organic = coarse.at(F.organic, la, lo), marine = coarse.at(F.marine, la, lo);
            const clastic = Math.max(0, 1 - carb - salt), shaleShare = Math.min(0.9, G.shaleLand + (G.shaleMarine - G.shaleLand) * marine + 0.6 * organic);
            let sand = clastic * (1 - shaleShare) + (i === 0 ? G.basalSand : 0), shale = clastic * shaleShare;
            const sum = carb + salt + sand + shale || 1;
            const u = smooth(-0.5, 0.5, nz.noise3D(x * facF + 7.3 * i, y * facF + 1.9 * i + 3, zz * facF + 4.1 * i) + 0.35 * nz.noise3D(x * facF * 3.1 + 2.2 * i, y * facF * 3.1 + 5.5, zz * facF * 3.1 + 1.1 * i)) * sum;
            const kind = u < carb ? Rock.LIMESTONE : u < carb + salt ? Rock.SALT : u < carb + salt + shale ? Rock.SHALE : Rock.SANDSTONE;
            score[kind] = 1;
        } else {
            // ── the basement, by the record cell's setting: granite plutons as blobs, standing high (an arc's instead
            // bared in its valleys, under its volcanoes' lid); deeper grades in the valleys; a shield's greenstone keels
            // between domes (or in belts); ophiolite slivers along a suture ──
            const bz = k => Math.max(0, coarse.at(FB[k], la, lo)), hi = Math.max(-1, Math.min(1, r / 0.4));
            const volc = bz(B_VOLC), arc = volc > 0.1, nA = fbm(contactO, x, y, zz, 11.1), nB = fbm(contactO, x, y, zz, 23.7);
            const pl = nz.noise3D(x * patchF * 0.8 + 5.5, y * patchF * 0.8 + 2.2, zz * patchF * 0.8 + 8.8) + 0.25 * nB + 0.1 * (arc ? -hi : hi);
            const granite = bz(B_GRANITE), blob = smooth(-0.15, 0.25, pl + (granite - 0.4));
            const others = bz(B_SLATE) + bz(B_GNEISS) + volc;
            score[Rock.GRANITE] = granite > 0.02 ? blob * Math.max(granite, 0.5 * (granite + others)) : 0;
            const rest = 1 - (granite > 0.02 ? blob : 0) * 0.85;
            score[Rock.SLATE] = bz(B_SLATE) * rest * Math.exp(0.6 * nA + 0.1 * hi + 0.8 * syn); score[Rock.GNEISS] = bz(B_GNEISS) * rest * Math.exp(-0.6 * nA - 0.1 * hi - 0.8 * syn);
            score[Rock.VOLCANIC] = volc * rest * Math.exp(0.6 * nB + 0.2 * hi); score[Rock.BASALT] = bz(B_BASALT) * Math.exp(0.4 * nA);
            score[Rock.OPHIOLITE] = bz(B_OPHIO) * Math.exp(0.4 * nB);
            const suture = coarse.at(F.suture, la, lo);
            if (suture > 0.01) {
                const ridge = 1 - Math.abs(nz.noise3D(x * patchF * 0.6 + 1.4, y * patchF * 0.6 + 6.6, zz * patchF * 0.6 + 3.3) + 0.3 * nA);
                score[Rock.OPHIOLITE] += suture * 2 * smooth(0.82, 0.95, ridge);
            }
            const shield = bz(B_SHIELD);
            if (shield > 0.02 && S.base[NB * w + B_SHIELD] > 0) {
                const ax = S.axis[3 * w], ay = S.axis[3 * w + 1], az = S.axis[3 * w + 2];
                let keel;
                if (S.style[w] > 0.5) {
                    // the Superior's long belts: stripes along the craton's trend, wandering
                    const al = (x * ax + y * ay + zz * az) / (Math.hypot(ax, ay, az) || 1);
                    keel = 0.5 + 0.5 * Math.cos(beltF * al + 2.5 * nz.noise3D(x * domeF * 0.5 + 2.7, y * domeF * 0.5, zz * domeF * 0.5 + 6.1));
                } else {
                    // the Pilbara's domes: greenstone in the troughs between rounded highs
                    keel = 1 - Math.abs(nz.noise3D(x * domeF, y * domeF + 4.4, zz * domeF + 8.2) + 0.5 * nz.noise3D(x * domeF * 2.1 + 1.1, y * domeF * 2.1, zz * domeF * 2.1 + 3.7));
                }
                // (the keels' width set so greenstone holds about its share; a little wider in the valleys — greenstone wears)
                const gs = S.green[w], g = smooth(1 - gs - 0.06, 1 - gs + 0.06, keel - 0.04 * hi + 0.1 * nA);
                score[Rock.GREENSTONE] = shield * g; score[Rock.SHIELD] = shield * (1 - g);
            }
        }
        // ── over both: young sediment (a river's plain, a delta, dunes, loess, moraines and outwash) and flood basalt ──
        const yA = Math.max(plain ? smooth(plainLo, plainHi, plain[c]) : 0, along ? along[c] : 0), yE = erg ? smooth(G.ergShow[0], G.ergShow[1], erg[c]) : 0;
        const yL = loess ? smooth(G.loessShow[0], G.loessShow[1], loess[c] * loessShare) : 0, yT = till ? smooth(G.tillShow[0], G.tillShow[1], till[c] / 255) : 0;
        const young = Math.max(yA, yE, yL, yT);
        score[Rock.ALLUVIUM] = 1.2 * young;
        if (lava) score[Rock.BASALT] = Math.max(score[Rock.BASALT], 1.1 * smooth(G.lavaShow[0], G.lavaShow[1], lava[c] / 255));
        let best = Rock.SLATE, bv = -1;
        for (let k = 1; k < ROCK_COUNT; k++) if (score[k] > bv) { bv = score[k]; best = k; }
        rock[c] = best; shares[best]++;
        // (for the checks: what made young sediment win — a river's deposit, dunes, loess, the ice's moraines)
        if (best === Rock.ALLUVIUM) youngBy[young === yA ? 0 : young === yE ? 1 : young === yL ? 2 : 3]++;
    }
    // (a cell alone among others of one kind takes theirs — a speck on a map is noise, at any detail)
    for (let pass = 0; pass < G.despeckle; pass++) despeckle(mesh, rock, ocean, shares);
    if (land) { for (let k = 0; k < ROCK_COUNT; k++) shares[k] /= land; for (let k = 0; k < 4; k++) youngBy[k] /= land; }
    return { rock, rec, shares, youngBy };
}
