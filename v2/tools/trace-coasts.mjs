// How ragged a history's coasts get, and which stage of a step frays them (issue #73: "as the simulation goes on the
// coasts become very fractal"). The Evolution page's history (the 'cycle' scene, no ending) run headless, and:
//   · a timeline: the land outline on the world grid every --every Myr — its prongs (a land cell with at most two land
//     neighbours and two of sea: a one-cell spit or islet) by the kind of coast, its one-cell inlets, its islets, and its
//     roughness (the outline's length over its length smoothed to ~300 km: 1 is smooth);
//   · --stages: the same features counted on every plate's own raster (the crust that persists; the terrain reads its
//     coasts there) before and after each stage of every step — what each stage added and removed over the history,
//     and the empty raster cells walled in by land it left (holes, which resolve then fills with crust of its own);
//   · --drawn t,t,…: the coast as the page draws it (the terrain at --terrain cells), at those moments, with every coast
//     noise off (the outline alone) and as it is — its roughness and islets; the crust's own edge against the land the
//     heights drown or raise, by the crust under it; and the drawn coast's length beyond its smoothed self, by the kind of
//     coast it is on (which coasts make it ragged); --png writes the pictures to v2/out/coasts/.
// Usage: node v2/tools/trace-coasts.mjs [simCells=40000] [seed …] [--len 1200] [--every 100] [--stages] [--drawn 60,300,800]
//        [--terrain 160000] [--off mechanism,…] [--set key=value,…] [--png]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { labMesh } from './lib/check-kit.mjs';
import { simulate } from '../js/tectonics/simulate.js';
import { TERRAIN_SCENES } from '../js/tectonics/scenarios/terrain-scenes.js';
import { mechanismsOff } from '../js/tectonics/config.js';
import { CrustType, CrustFlag } from '../js/tectonics/model/crust.js';
import { Margin } from '../js/tectonics/measure.js';
import { terrainConfig } from '../js/terrain/terrain-config.js';
import { terrainMesh, sampleOnto } from '../js/terrain/terrain-mesh.js';
import { synthesizeTerrain } from '../js/terrain/synthesize.js';
import { MapRaster } from '../js/view/map-raster.js';
import { PNG } from 'pngjs';

const args = process.argv.slice(2), flag = k => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : null; }, has = k => { const i = args.indexOf(k); return i >= 0 ? (args.splice(i, 1), true) : false; };
const len = Number(flag('--len') ?? 1200), every = Number(flag('--every') ?? 100), terrainCells = Number(flag('--terrain') ?? 160000);
const drawnAt = (flag('--drawn') ?? '').split(',').filter(Boolean).map(Number);
const off = (flag('--off') ?? '').split(',').filter(Boolean), set = flag('--set');
const overrides = { ...mechanismsOff(...off), ...(set ? Object.fromEntries(set.split(',').map(kv => { const [k, v] = kv.split('='); return [k, Number(v)]; })) : {}) };
const stages = has('--stages'), png = has('--png');
const nums = args.map(Number);
const cells = nums[0] || 40000, seeds = nums.length > 1 ? nums.slice(1) : [12345];
const mesh = labMesh(cells), scene = TERRAIN_SCENES.find(s => s.id === 'cycle');
const { numCells: n, adjOffset: AO, adjList: AL } = mesh;

/** Roughness of a land mask on a mesh: its outline's length over the length of the mask smoothed to ~smoothKm. */
function roughness(m, land, smoothKm = 300) {
    const N = m.numCells, ao = m.adjOffset, al = m.adjList, edges = x => { let e = 0; for (let w = 0; w < N; w++) if (x[w]) for (let k = ao[w]; k < ao[w + 1]; k++) if (!x[al[k]]) e++; return e; };
    let a = Float32Array.from(land), b = new Float32Array(N);
    for (let p = Math.max(1, Math.round((smoothKm / m.edgeKm) ** 2 / 2)); p > 0; p--) {      // (diffusion: its reach grows with √passes)
        for (let w = 0; w < N; w++) { let s = a[w], c = 1; for (let k = ao[w]; k < ao[w + 1]; k++) { s += a[al[k]]; c++; } b[w] = s / c; }
        [a, b] = [b, a];
    }
    const smooth = new Uint8Array(N);
    for (let w = 0; w < N; w++) smooth[w] = a[w] >= 0.5 ? 1 : 0;
    return { ratio: edges(land) / Math.max(1, edges(smooth)), length: edges(land), smooth };
}
/** Pieces of land of at most maxCells cells (islets), and of more. */
function pieces(m, land, maxCells) {
    const N = m.numCells, seen = new Uint8Array(N), stack = [];
    let small = 0, big = 0;
    for (let s = 0; s < N; s++) {
        if (!land[s] || seen[s]) continue;
        let size = 0;
        stack.push(s); seen[s] = 1;
        while (stack.length) { const w = stack.pop(); size++; for (let k = m.adjOffset[w]; k < m.adjOffset[w + 1]; k++) { const q = m.adjList[k]; if (land[q] && !seen[q]) { seen[q] = 1; stack.push(q); } } }
        if (size <= maxCells) small++; else big++;
    }
    return { small, big };
}

// ── the timeline: the outline on the world grid ──
const KINDS = ['passive', 'active', 'transform', 'collision', 'arc', 'isle'];
function kindOf(f, w) {
    if (f.type[w] === CrustType.ARC) return f.flags[w] & CrustFlag.MARGIN_ISLE ? 5 : 4;
    const t = f.margin[w] & Margin.TYPE;
    return t === Margin.ACTIVE ? 1 : t === Margin.TRANSFORM ? 2 : t === Margin.COLLISION ? 3 : 0;
}
function outline(f) {
    const land = new Uint8Array(n);
    let landCells = 0;
    for (let w = 0; w < n; w++) if (f.owner[w] >= 0 && f.type[w] !== CrustType.OCEAN) { land[w] = 1; landCells++; }
    const coast = KINDS.map(() => 0), prong = KINDS.map(() => 0);
    let seaCoast = 0, inlets = 0;
    for (let w = 0; w < n; w++) {
        let same = 0, other = 0;
        for (let k = AO[w]; k < AO[w + 1]; k++) if (land[AL[k]] === land[w]) same++; else other++;
        if (!other) continue;
        if (land[w]) { const K = kindOf(f, w); coast[K]++; if (same <= 2 && other >= 2) prong[K]++; }
        else { seaCoast++; if (other >= 4) inlets++; }
    }
    const cont = [0, 1, 2, 3].reduce((s, k) => s + coast[k], 0), contProng = [0, 1, 2, 3].reduce((s, k) => s + prong[k], 0);
    const P = pieces(mesh, land, 3);
    const pct = (a, b) => (b ? `${(100 * a / b).toFixed(0)}%` : '—');
    return { t: Math.round(f.time), land: `${(100 * landCells / n).toFixed(1)}%`, rough: roughness(mesh, land).ratio.toFixed(2), pieces: P.big, islets: P.small,
        prongs: pct(contProng, cont), ...Object.fromEntries(KINDS.map((k, i) => [k, `${pct(prong[i], coast[i])} of ${coast[i]}`])), inlets: pct(inlets, seaCoast) };
}

// ── the stages: features of every plate's own raster ──
const PRONG = 0, ARC_PRONG = 1, INLET = 2, HOLE = 3, LAND = 4, FEATURES = ['prongs', 'arc prongs', 'inlets', 'holes', 'land'];
const near = new Uint8Array(n), touched = new Int32Array(n);
function rasterFeatures(world, out) {
    out.fill(0);
    for (const p of world.plates) {
        if (!p.alive || !p.crust.count) continue;
        const { mask, type } = p.crust;
        let nt = 0;
        for (let c = 0; c < n; c++) {
            if (!mask[c] || type[c] === CrustType.OCEAN) continue;
            out[LAND]++;
            let land = 0, sea = 0;
            for (let k = AO[c]; k < AO[c + 1]; k++) {
                const q = AL[k];
                if (mask[q] && type[q] !== CrustType.OCEAN) { land++; continue; }
                if (mask[q]) sea++;
                if (!near[q]++) touched[nt++] = q;
            }
            if (land <= 2 && sea >= 2) out[type[c] === CrustType.ARC ? ARC_PRONG : PRONG]++;
        }
        for (let i = 0; i < nt; i++) { const q = touched[i]; if (near[q] >= 4) out[mask[q] ? INLET : HOLE]++; near[q] = 0; }
    }
}

const renderDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'out', 'coasts');
for (const seed of seeds) {
    const t0 = performance.now();
    const world = scene.build(mesh, seed, { continentalFraction: 0.3 });
    world.config.heights = terrainConfig();
    Object.assign(world.config, overrides);
    const timeline = [], kept = new Map();
    const onFrame = f => {
        const t = Math.round(f.time);
        if (t % every === 0) timeline.push(outline(f));
        if (drawnAt.includes(t)) kept.set(t, f);
    };
    // (each stage's change to the rasters' features, summed over the history: what it added, what it took away)
    let onStage = null;
    const added = new Map(), removed = new Map(), before = new Int32Array(FEATURES.length), after = new Int32Array(FEATURES.length);
    if (stages) {
        rasterFeatures(world, before);          // (from the world as built: the setting-up before the first step counts to its resolve)
        onStage = (name, w) => {
            rasterFeatures(w, after);
            if (!added.has(name)) { added.set(name, new Float64Array(FEATURES.length)); removed.set(name, new Float64Array(FEATURES.length)); }
            const A = added.get(name), R = removed.get(name);
            for (let i = 0; i < FEATURES.length; i++) { const d = after[i] - before[i]; if (d > 0) A[i] += d; else R[i] -= d; }
            before.set(after);
        };
    }
    simulate(world, { untilMyr: len, drive: w => scene.drive(w), snapshotEveryMyr: 10, keepFrames: false, onFrame, onStage });
    console.log(`\nseed ${seed} (${cells / 1000}K, ${len} Myr${off.length ? `, off: ${off.join(' ')}` : ''}${set ? `, set ${set}` : ''}) — ${((performance.now() - t0) / 1000).toFixed(0)} s, ${world.step} steps`);
    console.log('the outline on the world grid (prongs: share of coast cells that are one-cell spits or islets; inlets: of sea cells on the coast, one-cell inlets):');
    console.table(timeline);
    if (stages) {
        rasterFeatures(world, after);
        console.log(`each stage's change to the plates' rasters over the history (+added −removed; at the end: ${FEATURES.map((f, i) => `${after[i]} ${f}`).join(', ')}):`);
        const rows = [...added.keys()].map(name => {
            const A = added.get(name), R = removed.get(name);
            return { stage: name, ...Object.fromEntries(FEATURES.map((f, i) => [f, `+${A[i]} −${R[i]}`])), net: A[PRONG] - R[PRONG] + A[INLET] - R[INLET] + A[HOLE] - R[HOLE] };
        });
        console.table(rows.sort((a, b) => b.net - a.net));
    }
    if (drawnAt.length) {
        const tMesh = terrainMesh(terrainCells), base = terrainConfig(), sampler = sampleOnto(mesh, tMesh, base, seed);
        const bare = terrainConfig({ coastNoiseKm: 0, coastCellNoise: 0, coastDetailKm: 0, arcStraitKm: 0 });
        const isletCells = Math.max(1, Math.round(3000 / tMesh.cellAreaKm2)), rows = [], heights = [], byKind = [];
        // (the crust under each terrain cell, on the world grid: 0 ocean, 1 continent or craton, 2 arc)
        const simCell = new Int32Array(tMesh.numCells);
        for (let w = 0; w < tMesh.numCells; w++) simCell[w] = mesh.index.nearest(tMesh.xyz[3 * w], tMesh.xyz[3 * w + 1], tMesh.xyz[3 * w + 2]);
        const CRUST = ['ocean', 'continent', 'arc'], crustOf = (f, s) => f.owner[s] < 0 || f.type[s] === CrustType.OCEAN ? 0 : f.type[s] === CrustType.ARC ? 2 : 1;
        for (const t of drawnAt) {
            const f = kept.get(t);
            if (!f) { console.log(`(no frame at ${t} Myr)`); continue; }
            const row = { t };
            for (const [name, cfg] of [['outline', bare], ['drawn', base]]) {
                const { heightKm, parts, rec } = synthesizeTerrain(f, mesh, tMesh, { cfg, seed, sampler, parts: true });
                const land = new Uint8Array(tMesh.numCells);
                for (let w = 0; w < tMesh.numCells; w++) land[w] = heightKm[w] > 0 ? 1 : 0;
                row[`${name} rough`] = roughness(tMesh, land).ratio.toFixed(2);
                row[`${name} islets`] = pieces(tMesh, land, isletCells).small;
                if (png) writePicture(tMesh, heightKm, path.join(renderDir, `coasts-${seed}-${cells / 1000}k-t${String(t).padStart(4, '0')}-${name}${off.length || set ? '-variant' : ''}.png`));
                if (name !== 'outline') {
                    // (the drawn coast's land cells, by the crust under them: how much of the coastline is island arc)
                    const coastBy = [0, 0, 0];
                    for (let w = 0; w < tMesh.numCells; w++) {
                        if (!land[w]) continue;
                        for (let k = tMesh.adjOffset[w]; k < tMesh.adjOffset[w + 1]; k++) if (!land[tMesh.adjList[k]]) { coastBy[crustOf(f, simCell[w])]++; break; }
                    }
                    row['arc coast'] = `${(100 * coastBy[2] / (coastBy[0] + coastBy[1] + coastBy[2])).toFixed(0)}%`;
                    // (…and the coastline the drawn coast has beyond its smoothed self, by the kind of the nearest coast in the
                    // sim — records.js coastKind — or open ocean: more than 300 km from any coast; fore-arc islands apart from their active coast)
                    const { smooth } = roughness(tMesh, land), kindOf = w => (f.type[simCell[w]] === CrustType.ARC && f.flags[simCell[w]] & CrustFlag.MARGIN_ISLE ? 6 : Math.abs(rec.coastKm[simCell[w]]) > 300 ? 5 : rec.coastKind[simCell[w]]);
                    const excess = [0, 0, 0, 0, 0, 0, 0];
                    for (let w = 0; w < tMesh.numCells; w++) for (let k = tMesh.adjOffset[w]; k < tMesh.adjOffset[w + 1]; k++) {
                        const q = tMesh.adjList[k];
                        if (land[w] && !land[q]) excess[kindOf(w)]++;
                        if (smooth[w] && !smooth[q]) excess[kindOf(w)]--;
                    }
                    const total = excess.reduce((a, b) => a + b, 0);
                    byKind.push({ t, 'excess coast': total, ...Object.fromEntries(['passive', 'active', 'transform', 'collision', 'arc', 'open ocean', 'fore-arc isles'].map((k, i) => [k, `${(100 * excess[i] / total).toFixed(0)}%`])) });
                    continue;
                }
                // the crust's edge as the terrain reads it (land past the shelf: coast distance ≥ shelf width) against land by
                // height — land the heights drown (flooded) and sea they raise (raised), by the crust under it
                const edge = new Uint8Array(tMesh.numCells), flooded = [0, 0, 0], raised = [0, 0, 0], edgeLand = [0, 0, 0];
                for (let w = 0; w < tMesh.numCells; w++) {
                    edge[w] = parts.dcoastRaw[w] >= 0 && parts.dcoast[w] >= parts.dshelf[w] ? 1 : 0;     // (dcoast, dshelf: land side only)
                    const k = crustOf(f, simCell[w]);
                    if (edge[w]) { edgeLand[k]++; if (!land[w]) flooded[k]++; } else if (land[w]) raised[k]++;
                }
                row['edge rough'] = roughness(tMesh, edge).ratio.toFixed(2);
                const all = edgeLand.reduce((a, b) => a + b, 0);
                row.flooded = `${(100 * flooded.reduce((a, b) => a + b, 0) / all).toFixed(1)}%`;
                row.raised = `${(100 * raised.reduce((a, b) => a + b, 0) / all).toFixed(1)}%`;
                heights.push({ t, ...Object.fromEntries(CRUST.flatMap((c, k) => [[`${c} land`, edgeLand[k]], [`${c} flooded`, flooded[k]], [`${c} raised`, raised[k]]])) });
            }
            rows.push(row);
        }
        console.log(`the coast as drawn at ${terrainCells / 1000}K (outline: every coast noise off; edge: the crust's edge past the shelf, heights aside;`);
        console.log(`flooded / raised: land past the shelf the heights put under the sea, and sea they raise, as a share of that land; drawn: as the page draws it):`);
        console.table(rows);
        console.log('…by the crust under it (terrain cells; land: past the shelf):');
        console.table(heights);
        console.log('the drawn coast’s length beyond its smoothed self (in cell edges), by the kind of coast it is on:');
        console.table(byKind);
    }
}

/** The terrain as a picture: the sea by depth, the land by height. */
function writePicture(tMesh, heightKm, file) {
    const raster = new MapRaster(tMesh, 2048), rgb = new Uint8Array(tMesh.numCells * 3);
    for (let w = 0; w < tMesh.numCells; w++) {
        const z = heightKm[w];
        let r, g, b;
        if (z <= 0) { const d = Math.min(1, -z / 5); [r, g, b] = z > -0.2 ? [90, 160, 200] : [40 - 20 * d, 110 - 60 * d, 170 - 60 * d]; }
        else { const k = Math.min(1, z / 3); [r, g, b] = [90 + 120 * k, 140 + 40 * k - 40 * k * k, 70 + 60 * k]; }
        rgb[3 * w] = r; rgb[3 * w + 1] = g; rgb[3 * w + 2] = b;
    }
    const out = new PNG({ width: raster.width, height: raster.height });
    raster.paint(rgb, out.data);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, PNG.sync.write(out));
}
