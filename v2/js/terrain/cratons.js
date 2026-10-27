// Cratons in the terrain (Phase 10): a shield's edge as a line, not the sim cells' staircase; the ranges pressed against
// it fading across its rim; a foreland bent into it under their weight; and each shield a character of its own.
//
// What real cratons do (plans/V2_ROADMAP_PHASES_9_13.md, Phase 10 B, with sources): they are rigid — deformation piles up
// against them and goes around them — and a thrust front follows a craton's margin at the scale of its promontories
// and embayments, never finer (Thomas 1977, 2006). A stiff craton bends under a range's weight into a wide, shallow
// foreland: a foredeep 100–300 km wide filled to a lowland, with a trunk river along the range, then a forebulge only
// tens of metres high (DeCelles & Giles 1996; Watts 1992). Where a plateau's edge meets the block the front is abrupt
// (the Longmen Shan against the Sichuan Basin). Shield interiors are calm but not blank: basins and swells 1,000–2,000
// km apart, saucer-shaped sag basins, a faint grain of granite domes between greenstone keels.
//
// Measured per plate on its own raster (as the coast is, records.js plateCoasts), so it rides with the crust.

import { CrustType } from '../tectonics/model/crust.js';
import { spreadKm } from '../core/min-heap.js';
import { rasterToWorld, cellRng } from './anchor.js';

const R = 6371, FAR = 2000;

/**
 * Per plate that holds craton: the signed distance to the craton's edge (km, + inside the craton — any craton: two
 * welded shields read as one), the foreland load carried in from the range at the nearest stretch of edge (km of
 * foredeep, smoothed along the edge), and the depth of the craton patch each cell belongs to (its deepest point from
 * the edge: a scrap of a few cells is shallow). As rasters for the plates that moved (the terrain reads them there), and
 * per world cell for the rest.
 * @param {Float32Array} loadW   per world cell: the foredeep a range here would bend into a craton beside it (records.js)
 */
export function plateCratons(simMesh, A, frame, loadW) {
    const { xyz, numCells: n, adjOffset, adjList } = simMesh;
    const depthW = new Float32Array(n).fill(-FAR), loadOut = new Float32Array(n), patchW = new Float32Array(n), acrossW = new Float32Array(3 * n), rasters = new Map();
    const byPlate = new Map();
    for (let w = 0; w < n; w++) { const o = A.owner[w]; if (o >= 0) (byPlate.get(o) ?? byPlate.set(o, []).get(o)).push(w); }
    const runs = new Map();
    if (frame.crustCells) for (let i = 0; i < frame.crustCells.length; i++) { const o = Math.floor(frame.crustCells[i] / n); const r = runs.get(o); if (r) r.end = i + 1; else runs.set(o, { start: i, end: i + 1 }); }
    const cls = new Int8Array(n), d = new Float32Array(n), load = new Float32Array(n), next = new Float32Array(n);
    const half = (a, b) => 0.5 * R * Math.acos(Math.min(1, xyz[3 * a] * xyz[3 * b] + xyz[3 * a + 1] * xyz[3 * b + 1] + xyz[3 * a + 2] * xyz[3 * b + 2]));
    for (const o of [...byPlate.keys()].sort((a, b) => a - b)) {
        const cells = byPlate.get(o), run = runs.get(o);
        // which raster cells are craton: the plate's own crust where the frame carries it (its hidden cells too), else
        // the world view
        cls.fill(-1);
        let any = false;
        if (run) for (let i = run.start; i < run.end; i++) { const r = frame.crustCells[i] - o * n, c = frame.crustType[i] === CrustType.CRATON ? 1 : 0; cls[r] = c; any ||= c === 1; }
        else for (const w of cells) { const c = frame.type[w] === CrustType.CRATON ? 1 : 0; cls[A.cell[w]] = c; any ||= c === 1; }
        if (!any) continue;
        // the range's load: what the ground outside the craton weighs, the heaviest within ~250 km (the belt cell at the
        // craton's edge is the range's foot, not the range)
        load.fill(0);
        for (let r = 0; r < n; r++) if (cls[r] === 0) { const w = rasterToWorld(A, simMesh, o, r); if (w >= 0) load[r] = loadW[w]; }
        for (let pass = 0; pass < 2; pass++) {
            for (let r = 0; r < n; r++) {
                next[r] = load[r];
                if (cls[r] !== 0) continue;
                for (let k = adjOffset[r]; k < adjOffset[r + 1]; k++) { const q = adjList[k]; if (cls[q] === 0 && load[q] > next[r]) next[r] = load[q]; }
            }
            load.set(next);
        }
        // the edge: half the distance between a craton cell and a neighbour that is not; the range's load at the edge
        // goes to the craton cells along it (the heaviest of their outside neighbours')
        d.fill(Infinity);
        for (let r = 0; r < n; r++) {
            if (cls[r] < 0) continue;
            let heaviest = 0;
            for (let k = adjOffset[r]; k < adjOffset[r + 1]; k++) {
                const q = adjList[k];
                if (cls[q] < 0 || cls[q] === cls[r]) continue;
                const h = half(r, q);
                if (h < d[r]) d[r] = h;
                if (cls[r] === 1 && load[q] > heaviest) heaviest = load[q];
            }
            if (cls[r] === 1) next[r] = heaviest;
        }
        for (let r = 0; r < n; r++) if (cls[r] === 1) load[r] = next[r]; else if (cls[r] === 0) load[r] = 0;
        spreadKm(simMesh, d, { canEnter: (a, q) => cls[q] >= 0 && cls[q] === cls[a], onReach: (a, q) => { if (cls[q] === 1) load[q] = load[a]; }, maxKm: FAR });
        // (the load, smoothed along the edge — each craton cell took one edge cell's, so it would change in steps)
        for (let pass = 0; pass < 3; pass++) {
            for (let r = 0; r < n; r++) {
                if (cls[r] !== 1 || d[r] > 800) { next[r] = load[r]; continue; }
                let s = load[r], m = 1;
                for (let k = adjOffset[r]; k < adjOffset[r + 1]; k++) { const q = adjList[k]; if (cls[q] === 1) { s += load[q]; m++; } }
                next[r] = s / m;
            }
            load.set(next);
        }
        // craton patches (connected craton cells): each one's depth — its deepest point from the edge — and its grain: the
        // direction ACROSS its long axis, in the plate's frame (a craton's greenstone belts run along its length, as the
        // Superior's do; plans/V2_START_WORLD_PLAN.md S4) — read from the patch's shape, so it rides with the crust
        const patchDepth = new Float32Array(n), across = new Float32Array(3 * n), seen = new Uint8Array(n), queue = [];
        for (let r0 = 0; r0 < n; r0++) {
            if (cls[r0] !== 1 || seen[r0]) continue;
            queue.length = 0; queue.push(r0); seen[r0] = 1;
            let deepest = 0, mx = 0, my = 0, mz = 0;
            for (let i = 0; i < queue.length; i++) {
                const r = queue[i];
                if (d[r] < Infinity && d[r] > deepest) deepest = d[r];
                mx += xyz[3 * r]; my += xyz[3 * r + 1]; mz += xyz[3 * r + 2];
                for (let k = adjOffset[r]; k < adjOffset[r + 1]; k++) { const q = adjList[k]; if (cls[q] === 1 && !seen[q]) { seen[q] = 1; queue.push(q); } }
            }
            for (const r of queue) patchDepth[r] = deepest;
            const a = grainAcross(xyz, queue, mx, my, mz);
            for (const r of queue) { across[3 * r] = a[0]; across[3 * r + 1] = a[1]; across[3 * r + 2] = a[2]; }
        }
        const depth = new Float32Array(n).fill(NaN), loadR = new Float32Array(n), patchR = new Float32Array(n);
        for (let r = 0; r < n; r++) {
            if (cls[r] < 0) continue;
            const dd = Math.min(FAR, d[r]);
            depth[r] = cls[r] ? dd : -dd; loadR[r] = cls[r] ? load[r] : 0; patchR[r] = patchDepth[r];
        }
        rasters.set(o, { depth, load: loadR, patch: patchR, across });
        for (const w of cells) {
            const r = A.cell[w];
            if (depth[r] === depth[r]) { depthW[w] = depth[r]; loadOut[w] = loadR[r]; patchW[w] = patchR[r]; acrossW[3 * w] = across[3 * r]; acrossW[3 * w + 1] = across[3 * r + 1]; acrossW[3 * w + 2] = across[3 * r + 2]; }
        }
    }
    return { depthW, loadW: loadOut, patchW, acrossW, rasters, characters: new Map() };
}

/** The unit direction across a patch's long axis, at its centroid (the patch's cells' positions, summed m*). */
function grainAcross(xyz, cells, mx, my, mz) {
    const l = Math.hypot(mx, my, mz) || 1, m = [mx / l, my / l, mz / l];
    const up = Math.abs(m[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
    let e = [up[1] * m[2] - up[2] * m[1], up[2] * m[0] - up[0] * m[2], up[0] * m[1] - up[1] * m[0]];
    const el = Math.hypot(...e) || 1; e = [e[0] / el, e[1] / el, e[2] / el];
    const nn = [m[1] * e[2] - m[2] * e[1], m[2] * e[0] - m[0] * e[2], m[0] * e[1] - m[1] * e[0]];
    // second moments of the cells in the tangent plane at the centroid: the long axis is the larger one's direction
    let su = 0, sv = 0, suu = 0, svv = 0, suv = 0;
    for (const r of cells) {
        const u = xyz[3 * r] * e[0] + xyz[3 * r + 1] * e[1] + xyz[3 * r + 2] * e[2], v = xyz[3 * r] * nn[0] + xyz[3 * r + 1] * nn[1] + xyz[3 * r + 2] * nn[2];
        su += u; sv += v; suu += u * u; svv += v * v; suv += u * v;
    }
    const k = cells.length, cu = su / k, cv = sv / k, cuu = suu / k - cu * cu, cvv = svv / k - cv * cv, cuv = suv / k - cu * cv;
    const th = 0.5 * Math.atan2(2 * cuv, cuu - cvv) + Math.PI / 2, c = Math.cos(th), s = Math.sin(th);
    return [e[0] * c + nn[0] * s, e[1] * c + nn[1] * s, e[2] * c + nn[2] * s];
}

/**
 * A craton's character, keyed by its terrane (its own stream): a sag basin (a low interior plain, the Congo, Hudson
 * Bay), a swell (a high shield, the Kalahari) or a flat shield; how strong (× 0.7–1.3); and where its shape's noise
 * starts. Cached on the craton records.
 */
export function cratonCharacter(C, seed, terrane) {
    let ch = C.characters.get(terrane);
    if (!ch) {
        const rng = cellRng(seed, terrane, 41), r = rng();
        ch = { kind: r < 0.38 ? -1 : r < 0.76 ? 1 : 0, amp: 0.7 + 0.6 * rng(), salt: 13.7 * rng() };
        C.characters.set(terrane, ch);
    }
    return ch;
}
