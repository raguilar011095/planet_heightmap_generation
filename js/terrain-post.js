// Terrain post-processing: domain warping, bilateral smoothing, and
// flow-based erosion. Runs after elevation assignment to deform terrain
// for organic shapes, soften harsh boundaries, and carve natural
// drainage patterns.

import { SimplexNoise } from './simplex-noise.js';
import {
    FLOOD_NOISE_AMP, FLOOD_CARVE_RADIUS_FRAC,
    WARP_FREQ, WARP_OCTAVES, WARP_MAX_AMP_MULT,
    WARP_BIAS_BASE, WARP_BIAS_STRENGTH_SCALE, WARP_HOTSPOT_DAMPEN,
    SMOOTH_EDGE_SENSITIVITY,
    GLACIAL_LAT_DIVISOR, GLACIAL_ELEV_LOW, GLACIAL_ELEV_HIGH,
    GLACIAL_ELEV_FACTOR_SCALE, GLACIAL_ELEV_FACTOR_LAT_BASE, GLACIAL_ELEV_FACTOR_LAT_SCALE,
    GLACIAL_CARVE_RATE, GLACIAL_CONVERGENCE_BONUS, GLACIAL_DEPOSIT_AMOUNT,
    GLACIAL_FJORD_CARVE, GLACIAL_FLOW_THRESHOLD, GLACIAL_FJORD_THRESHOLD,
    GLACIAL_WIDENING_FRAC, GLACIAL_TERMINUS_RATIO, GLACIAL_FJORD_ICE_MIN,
    GLACIAL_POST_SMOOTH, GLACIAL_MID_FLOOD_FRAC, GLACIAL_MID_FLOOD_CARVE,
    GLACIAL_INITIAL_CARVE,
    HYDRAULIC_DEPOSIT_FRAC, HYDRAULIC_SLOPE_SENSITIVITY, EROSION_REF_REGIONS,
    THERMAL_TRANSFER_FRAC,
    RIDGE_SHARPEN_CAP, VALLEY_DEEPEN_FACTOR, VALLEY_FLOOR_FRAC, VALLEY_FLOOR_MIN,
    DETAIL_NOISE_AMP_KM, DETAIL_NOISE_FREQ, DETAIL_NOISE_OCTAVES,
    DETAIL_NOISE_WARP_FREQ, DETAIL_NOISE_WARP_AMP, DETAIL_NOISE_WARP_OCTAVES,
    DETAIL_NOISE_DAMPEN_STRENGTH,
} from './terrain-config.js';

/**
 * Inline binary min-heap keyed on an external Float32Array of priorities.
 * Each cell is pushed/popped exactly once — no decrease-key needed.
 */
class MinHeap {
    constructor(keyArray) {
        this._key = keyArray;
        this._data = [];
    }
    get size() { return this._data.length; }
    push(cell) {
        this._data.push(cell);
        let i = this._data.length - 1;
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (this._key[this._data[i]] >= this._key[this._data[parent]]) break;
            const tmp = this._data[i]; this._data[i] = this._data[parent]; this._data[parent] = tmp;
            i = parent;
        }
    }
    pop() {
        const top = this._data[0];
        const last = this._data.pop();
        if (this._data.length > 0) {
            this._data[0] = last;
            let i = 0;
            const n = this._data.length;
            while (true) {
                let smallest = i;
                const l = 2 * i + 1, r = 2 * i + 2;
                if (l < n && this._key[this._data[l]] < this._key[this._data[smallest]]) smallest = l;
                if (r < n && this._key[this._data[r]] < this._key[this._data[smallest]]) smallest = r;
                if (smallest === i) break;
                const tmp = this._data[i]; this._data[i] = this._data[smallest]; this._data[smallest] = tmp;
                i = smallest;
            }
        }
        return top;
    }
}

/**
 * Priority-flood pit resolution with canyon carving.
 * Ensures every land cell has a monotonically descending drainage path to
 * the ocean, favoring carving through spill points over filling pit floors.
 *
 * Pass 1: Standard Barnes et al. priority-flood fill from ocean-adjacent
 *         land cells inward → surface[], drainTo[]
 * Pass 2: Redistribute fill deficit as carving along spill paths
 * Pass 3: Enforce monotonic drainage with epsilon gradient
 */
function priorityFloodCarve(mesh, r_elevation, r_isOcean, carveStrength) {
    const N = mesh.numRegions;
    const { adjOffset, adjList } = mesh;
    const EPS = 1e-7;

    // --- Identify the main ocean body via BFS ---
    // Find connected ocean components and mark only the largest as "open ocean"
    const oceanLabel = new Int32Array(N).fill(-1);
    const componentSizes = [];
    for (let r = 0; r < N; r++) {
        if (!r_isOcean[r] || oceanLabel[r] >= 0) continue;
        const label = componentSizes.length;
        let size = 0;
        const queue = [r];
        oceanLabel[r] = label;
        while (queue.length > 0) {
            const cur = queue.pop();
            size++;
            for (let i = adjOffset[cur], iEnd = adjOffset[cur + 1]; i < iEnd; i++) {
                const nb = adjList[i];
                if (r_isOcean[nb] && oceanLabel[nb] < 0) {
                    oceanLabel[nb] = label;
                    queue.push(nb);
                }
            }
        }
        componentSizes.push(size);
    }
    let mainOceanLabel = 0;
    for (let i = 1; i < componentSizes.length; i++) {
        if (componentSizes[i] > componentSizes[mainOceanLabel]) mainOceanLabel = i;
    }
    const isOpenOcean = new Uint8Array(N);
    for (let r = 0; r < N; r++) {
        if (r_isOcean[r] && oceanLabel[r] === mainOceanLabel) isOpenOcean[r] = 1;
    }

    // --- Deterministic hash for noise perturbation (meander paths) ---
    // Small noise on priority keys makes the flood front irregular,
    // producing winding drainage paths instead of straight lines
    const NOISE_AMP = FLOOD_NOISE_AMP; // amplitude relative to typical elevation range
    function cellNoise(r) {
        let h = (r * 2654435761) >>> 0; // Knuth multiplicative hash
        h = ((h >>> 16) ^ h) * 0x45d9f3b >>> 0;
        h = ((h >>> 16) ^ h) >>> 0;
        return (h / 0xffffffff) * NOISE_AMP;
    }

    const surface = new Float32Array(r_elevation);
    const drainTo = new Int32Array(N).fill(-1);
    const visited = new Uint8Array(N);

    // Priority key array — elevation + small noise for meandering
    const key = new Float32Array(N);
    for (let r = 0; r < N; r++) key[r] = r_elevation[r] + cellNoise(r);

    const heap = new MinHeap(key);

    // Seed: land cells adjacent to the main open ocean (not inland seas)
    for (let r = 0; r < N; r++) {
        if (r_isOcean[r]) { visited[r] = 1; continue; }
        for (let i = adjOffset[r], iEnd = adjOffset[r + 1]; i < iEnd; i++) {
            if (isOpenOcean[adjList[i]]) {
                visited[r] = 1;
                drainTo[r] = adjList[i]; // drains to open ocean neighbor
                heap.push(r);
                break;
            }
        }
    }

    // Pass 1: priority-flood fill (noise-perturbed for winding paths)
    while (heap.size > 0) {
        const r = heap.pop();
        const surfR = surface[r];
        for (let i = adjOffset[r], iEnd = adjOffset[r + 1]; i < iEnd; i++) {
            const nb = adjList[i];
            if (visited[nb]) continue;
            visited[nb] = 1;
            drainTo[nb] = r;
            if (r_elevation[nb] < surfR + EPS) {
                // Pit detected — fill to current surface + epsilon
                surface[nb] = surfR + EPS;
                key[nb] = surface[nb] + cellNoise(nb);
            }
            // else: neighbor drains naturally, surface[nb] already = r_elevation[nb]
            heap.push(nb);
        }
    }

    // Pass 2: carve-bias redistribution
    // For each filled cell, trace path back to ocean, find the peak (spill point),
    // and redistribute deficit as carving near the peak
    for (let r = 0; r < N; r++) {
        if (r_isOcean[r]) continue;
        const deficit = surface[r] - r_elevation[r];
        if (deficit <= EPS) continue;

        // Trace drainTo path toward ocean, collect path and find peak
        const path = [];
        let peakIdx = -1;
        let peakElev = -Infinity;
        let cur = r;
        while (cur >= 0 && !r_isOcean[cur]) {
            path.push(cur);
            if (r_elevation[cur] > peakElev) {
                peakElev = r_elevation[cur];
                peakIdx = path.length - 1;
            }
            cur = drainTo[cur];
        }

        if (peakIdx < 0 || path.length === 0) continue;

        // Carve: lower cells near the peak using a triangle kernel
        const carveAmount = deficit * carveStrength;
        const radius = Math.max(3, Math.ceil(path.length * FLOOD_CARVE_RADIUS_FRAC));
        const startIdx = Math.max(0, peakIdx - radius);
        const endIdx = Math.min(path.length - 1, peakIdx + radius);

        let kernelSum = 0;
        for (let k = startIdx; k <= endIdx; k++) {
            const dist = Math.abs(k - peakIdx);
            kernelSum += 1 - dist / (radius + 1);
        }
        if (kernelSum > 0) {
            for (let k = startIdx; k <= endIdx; k++) {
                const dist = Math.abs(k - peakIdx);
                const weight = (1 - dist / (radius + 1)) / kernelSum;
                r_elevation[path[k]] -= carveAmount * weight;
                if (r_elevation[path[k]] < 0) r_elevation[path[k]] = 0;
            }
        }

        // Fill: raise the pit floor by the remaining fraction
        const fillAmount = deficit * (1 - carveStrength);
        r_elevation[r] += fillAmount;
    }

    // Pass 3: enforce monotonic drainage along drainTo paths
    // Process cells in order of ascending surface (re-sort by surface)
    const order = [];
    for (let r = 0; r < N; r++) {
        if (!r_isOcean[r]) order.push(r);
    }
    order.sort((a, b) => surface[a] - surface[b]);

    for (let i = 0; i < order.length; i++) {
        const r = order[i];
        const target = drainTo[r];
        if (target < 0) continue;
        const targetElev = r_isOcean[target] ? 0 : r_elevation[target];
        if (r_elevation[r] <= targetElev) {
            r_elevation[r] = targetElev + EPS;
        }
    }
}

/**
 * Domain warping — displaces each region's elevation lookup by FBM simplex
 * noise in the tangent plane, producing organic, squiggly coastlines and
 * mountain ridges. Scale-invariant: noise is evaluated in 3D coordinate
 * space and amplitude is in radians (physical distance on the sphere).
 *
 * For each region:
 *  1. Compute a tangent-plane frame (east/north) at its position on the unit sphere
 *  2. Use FBM simplex noise (4 octaves, frequency 6) to generate two
 *     displacement values in the tangent plane
 *  3. Displace the region's 3D position along the tangent frame by the noise
 *     offsets, then re-project onto the unit sphere
 *  4. Walk the mesh graph (greedy nearest-neighbor) from the original region
 *     toward the displaced point to find the closest region
 *  5. Copy that source region's elevation to the output
 */
export function warpTerrain(mesh, r_elevation, r_xyz, seed, strength, r_hotspot) {
    if (strength <= 0) return;

    const N = mesh.numRegions;
    const { adjOffset, adjList } = mesh;
    const noise = new SimplexNoise(seed + 9999);
    const freq = WARP_FREQ;
    const octaves = WARP_OCTAVES;
    const maxAmp = WARP_MAX_AMP_MULT * strength; // radians (~760 km at Earth scale when strength=1)

    const out = new Float32Array(r_elevation);

    for (let r = 0; r < N; r++) {
        const px = r_xyz[3 * r], py = r_xyz[3 * r + 1], pz = r_xyz[3 * r + 2];

        // Tangent frame: east = normalize(cross(up, pos)), north = cross(pos, east)
        let ex = -pz, ey = 0, ez = px; // cross([0,1,0], pos) = [-pz, 0, px]
        const elen = Math.sqrt(ex * ex + ez * ez);
        if (elen > 1e-10) { ex /= elen; ez /= elen; }
        else { ex = 1; ez = 0; } // poles

        const nx = py * ez;
        const ny = pz * ex - px * ez;
        const nz = -py * ex;
        const nlen = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        const nnx = nx / nlen, nny = ny / nlen, nnz = nz / nlen;

        // FBM noise → two displacement values
        const pfx = px * freq, pfy = py * freq, pfz = pz * freq;
        const d1 = noise.fbm(pfx, pfy, pfz, octaves) * maxAmp;
        const d2 = noise.fbm(pfx + 31.7, pfy + 47.3, pfz + 19.1, octaves) * maxAmp;

        // Displace position along tangent frame and re-project onto unit sphere
        let wx = px + ex * d1 + nnx * d2;
        let wy = py + ey * d1 + nny * d2;
        let wz = pz + ez * d1 + nnz * d2;
        const wlen = Math.sqrt(wx * wx + wy * wy + wz * wz) || 1;
        wx /= wlen; wy /= wlen; wz /= wlen;

        // Greedy mesh walk from r toward the displaced point
        let cur = r;
        let bestDot = wx * px + wy * py + wz * pz;
        for (;;) {
            let moved = false;
            for (let i = adjOffset[cur], iEnd = adjOffset[cur + 1]; i < iEnd; i++) {
                const nb = adjList[i];
                const dot = wx * r_xyz[3 * nb] + wy * r_xyz[3 * nb + 1] + wz * r_xyz[3 * nb + 2];
                if (dot > bestDot) {
                    bestDot = dot;
                    cur = nb;
                    moved = true;
                }
            }
            if (!moved) break;
        }

        out[r] = r_elevation[cur];
    }

    // Weighted max: pick whichever is larger, biased by strength
    // At strength≈0 → 75% original, at strength=1 → 75% warped
    // Dampen near hotspots so volcanic peaks keep their sculpted shape
    const warpBias = WARP_BIAS_BASE + WARP_BIAS_STRENGTH_SCALE * strength;
    for (let r = 0; r < N; r++) {
        const orig = r_elevation[r];
        const warped = out[r];
        let bias = warpBias;
        if (r_hotspot) {
            const hotFrac = Math.min(1, Math.abs(r_hotspot[r]) / (Math.abs(orig) || 1));
            bias *= 1 - WARP_HOTSPOT_DAMPEN * hotFrac;
        }
        if (warped > orig) {
            r_elevation[r] = orig + (warped - orig) * bias;
        } else {
            r_elevation[r] = warped + (orig - warped) * (1 - bias);
        }
    }
}

/**
 * Bilateral-weighted Laplacian smoothing.
 * Neighbors with similar elevation receive more weight, preserving ridges
 * and trenches while blending the banded artefacts from BFS distance fields.
 * Locked cells:
 *   - Coastline cells (land adjacent to ocean) — preserve coast definition
 *   - Ocean island cells (ocean plate, positive elevation) — without this,
 *     volcanic islands / island arcs get averaged against deep-ocean
 *     neighbors and pulled below sea level. The effect compounds at higher
 *     detail where islands span more cells but each edge cell pulls the
 *     island down further every iteration.
 */
export function smoothElevation(mesh, r_elevation, r_isOcean, iterations, strength) {
    const N = mesh.numRegions;
    const tmp = new Float32Array(N);
    const { adjOffset, adjList } = mesh;

    const locked = new Uint8Array(N);
    for (let r = 0; r < N; r++) {
        if (r_isOcean[r]) {
            // Ocean island — lock so smoothing doesn't drag it underwater.
            if (r_elevation[r] > 0) locked[r] = 1;
            continue;
        }
        // Land cell — lock if adjacent to ocean (coastline preservation).
        for (let i = adjOffset[r], iEnd = adjOffset[r + 1]; i < iEnd; i++) {
            if (r_isOcean[adjList[i]]) { locked[r] = 1; break; }
        }
    }

    for (let iter = 0; iter < iterations; iter++) {
        for (let r = 0; r < N; r++) {
            if (locked[r]) { tmp[r] = r_elevation[r]; continue; }

            const h = r_elevation[r];
            let wSum = 0, hSum = 0;
            for (let i = adjOffset[r], iEnd = adjOffset[r + 1]; i < iEnd; i++) {
                const nh = r_elevation[adjList[i]];
                const diff = Math.abs(nh - h);
                const w = 1 / (1 + diff * SMOOTH_EDGE_SENSITIVITY);
                wSum += w;
                hSum += nh * w;
            }
            if (wSum > 0) {
                const avg = hSum / wSum;
                tmp[r] = h + (avg - h) * strength;
            } else {
                tmp[r] = h;
            }
        }
        // Copy back
        for (let r = 0; r < N; r++) r_elevation[r] = tmp[r];
    }
}

/**
 * Combined iterative erosion — interleaves hydraulic (stream power) and
 * thermal (talus-angle) passes so they interact each iteration.
 *
 * Hydraulic: Braun-Willett implicit stream power. Rebuilds drainage graph
 * each iteration so carved valleys attract more flow.
 *
 * Thermal: Slope-driven material transport. Redistributes material from
 * steep slopes to lower neighbors using a simultaneous delta buffer.
 *
 * Each iteration runs one hydraulic step then one thermal step (if their
 * respective iteration counts haven't been exhausted).
 */
export function erodeComposite(mesh, r_elevation, r_xyz, r_isOcean,
    hIters, K, m, dt,
    tIters, talusSlope, kThermal,
    gIters, glacialStrength,
    neighborDist)
{
    gIters = gIters || 0;
    glacialStrength = glacialStrength || 0;

    const totalIters = Math.max(hIters, tIters, gIters);
    if (totalIters <= 0) return;

    const N = mesh.numRegions;
    // Convert raw upstream-cell counts to physical-area scale (no-op at the
    // default Detail); see EROSION_REF_REGIONS in terrain-config.js.
    const flowScale = EROSION_REF_REGIONS / N;
    const { adjOffset, adjList } = mesh;

    // Collect land cell indices
    const landCells = [];
    for (let r = 0; r < N; r++) {
        if (!r_isOcean[r]) landCells.push(r);
    }
    const landCount = landCells.length;
    if (landCount === 0) return;

    // Shared buffers
    const drainTarget = new Int32Array(N);
    const cellDist = new Float32Array(N);
    const flow = new Float32Array(N);
    const delta = new Float32Array(N);

    // Priority-flood pit resolution: ensure every land cell drains to ocean
    // before hydraulic erosion begins. Carves canyons through spill points.
    if (hIters > 0) {
        priorityFloodCarve(mesh, r_elevation, r_isOcean, GLACIAL_INITIAL_CARVE);
    }

    // ---- Glacial precomputation (once — index is position-based) ----
    let glacIdx = null;
    let iceTarget = null;
    let iceFlow = null;
    let numIceUpstream = null;

    if (gIters > 0 && glacialStrength > 0) {
        function smoothstep(x, edge0, edge1) {
            const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
            return t * t * (3 - 2 * t);
        }

        glacIdx = new Float32Array(N);
        // At strength=1 glaciation starts at ~50° latitude; at 0.5 it starts at ~70°
        const thresholdLat = Math.PI / 2 - glacialStrength * Math.PI / GLACIAL_LAT_DIVISOR;

        for (let r = 0; r < N; r++) {
            if (r_isOcean[r]) continue;
            const y = r_xyz[3 * r + 1];
            const polarDist = Math.abs(Math.asin(Math.max(-1, Math.min(1, y))));
            const latFactor = smoothstep(polarDist, thresholdLat, Math.PI / 2);
            const elevFactor = smoothstep(r_elevation[r], GLACIAL_ELEV_LOW, GLACIAL_ELEV_HIGH);
            const latScale = smoothstep(polarDist, Math.PI / 8, Math.PI / 3);
            glacIdx[r] = Math.max(latFactor, elevFactor * GLACIAL_ELEV_FACTOR_SCALE * (GLACIAL_ELEV_FACTOR_LAT_BASE + GLACIAL_ELEV_FACTOR_LAT_SCALE * latScale)) * glacialStrength;
        }

        iceTarget = new Int32Array(N);
        iceFlow = new Float32Array(N);
        numIceUpstream = new Uint8Array(N);
    }

    // Per-iteration glacial rates (scaled so total effect ≈ same regardless of iter count)
    const gScale = gIters > 0 ? 1.0 / gIters : 0;
    const gCarveRate = GLACIAL_CARVE_RATE * gScale;
    const gConvergenceBonus = GLACIAL_CONVERGENCE_BONUS * gScale;
    const gDepositAmount = GLACIAL_DEPOSIT_AMOUNT * gScale;
    const gFjordCarve = GLACIAL_FJORD_CARVE * gScale;
    const gFlowThreshold = GLACIAL_FLOW_THRESHOLD;
    const gFjordThreshold = GLACIAL_FJORD_THRESHOLD;

    // Mid-loop drainage fix: at 75% of iterations, run a carve-biased
    // priority-flood to cut outlets through basins created by glaciation.
    const midFloodIter = Math.round(totalIters * GLACIAL_MID_FLOOD_FRAC);
    let midFloodDone = false;

    // Pre-allocate thermal erosion buffers (max neighbor degree)
    let maxDeg = 0;
    for (let r = 0; r < N; r++) {
        const deg = adjOffset[r + 1] - adjOffset[r];
        if (deg > maxDeg) maxDeg = deg;
    }
    const excNb  = new Int32Array(maxDeg);
    const excVal = new Float32Array(maxDeg);
    const excAdjIdx = new Int32Array(maxDeg);
    const excSlope  = new Float32Array(maxDeg);

    for (let iter = 0; iter < totalIters; iter++) {

        if (!midFloodDone && iter >= midFloodIter) {
            midFloodDone = true;
            priorityFloodCarve(mesh, r_elevation, r_isOcean, GLACIAL_MID_FLOOD_CARVE);
        }

        // Sort land cells by descending elevation — needed by glacial ice flow
        // and hydraulic flow accumulation. If glacial runs this iteration and
        // hydraulic follows, glacial modifies elevations so we re-sort before hydraulic.
        const glacialThisIter = iter < gIters && glacIdx;
        const hydraulicThisIter = iter < hIters;
        if (glacialThisIter || hydraulicThisIter) {
            landCells.sort((a, b) => r_elevation[b] - r_elevation[a]);
        }

        // ---- Glacial step ----
        if (glacialThisIter) {

            // Rebuild ice drainage from current elevations
            iceTarget.fill(-1);
            numIceUpstream.fill(0);

            for (let i = 0; i < landCount; i++) {
                const r = landCells[i];
                if (glacIdx[r] <= 0) continue;
                const h = r_elevation[r];
                let bestNb = -1, bestDrop = 0;
                for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
                    const nb = adjList[j];
                    const drop = h - r_elevation[nb];
                    if (drop > bestDrop) { bestDrop = drop; bestNb = nb; }
                }
                if (bestNb >= 0) iceTarget[r] = bestNb;
            }

            // Accumulate ice flow downstream
            for (let r = 0; r < N; r++) iceFlow[r] = glacIdx[r];
            for (let i = 0; i < landCount; i++) {
                const r = landCells[i];
                const target = iceTarget[r];
                if (target >= 0 && iceFlow[r] > 0) {
                    iceFlow[target] += iceFlow[r];
                    numIceUpstream[target]++;
                }
            }

            // Carving: deepening + widening + over-deepening
            for (let i = 0; i < landCount; i++) {
                const r = landCells[i];
                const iceFlowNorm = iceFlow[r] * flowScale;
                if (iceFlowNorm <= gFlowThreshold) continue;

                const deepening = gCarveRate * Math.pow(iceFlowNorm, 0.6) * glacialStrength;
                r_elevation[r] -= deepening;

                // Valley widening for U-shape
                for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
                    const nb = adjList[j];
                    if (r_isOcean[nb]) continue;
                    const d = neighborDist[j] || 1e-6;
                    const slope = Math.abs(r_elevation[r] - r_elevation[nb]) / d;
                    r_elevation[nb] -= deepening * GLACIAL_WIDENING_FRAC * Math.max(0, 1 - slope);
                }

                // Over-deepening at convergence zones
                if (numIceUpstream[r] >= 2) {
                    r_elevation[r] -= gConvergenceBonus * Math.pow(iceFlowNorm, 0.4);
                }
            }

            // Moraine deposition at glacier termini
            for (let i = 0; i < landCount; i++) {
                const r = landCells[i];
                const iceFlowNorm = iceFlow[r] * flowScale;
                if (iceFlowNorm <= gFlowThreshold) continue;
                const target = iceTarget[r];
                if (target < 0 || r_isOcean[target]) continue;
                if (glacIdx[target] < glacIdx[r] * GLACIAL_TERMINUS_RATIO) {
                    r_elevation[target] += gDepositAmount * Math.pow(iceFlowNorm, 0.3);
                }
            }

            // Fjord enhancement on coastal glaciated cells
            for (let r = 0; r < N; r++) {
                if (r_isOcean[r]) continue;
                if (glacIdx[r] <= GLACIAL_FJORD_ICE_MIN || iceFlow[r] * flowScale <= gFjordThreshold) continue;
                let isCoastal = false;
                for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
                    if (r_isOcean[adjList[j]]) { isCoastal = true; break; }
                }
                if (isCoastal) {
                    r_elevation[r] -= gFjordCarve * Math.pow(iceFlow[r] * flowScale, 0.5);
                    if (r_elevation[r] < 0) r_elevation[r] = 0;
                }
            }

            // Clamp: land stays land
            for (let r = 0; r < N; r++) {
                if (!r_isOcean[r] && r_elevation[r] < 0) r_elevation[r] = 0;
            }
        }

        // ---- Hydraulic step ----
        if (hydraulicThisIter) {
            // Re-sort if glacial step modified elevations this iteration
            if (glacialThisIter) {
                landCells.sort((a, b) => r_elevation[b] - r_elevation[a]);
            }
            // Build drainage graph (steepest descent)
            drainTarget.fill(-1);

            for (let i = 0; i < landCount; i++) {
                const r = landCells[i];
                const h = r_elevation[r];

                let bestNb = -1, bestDrop = -Infinity, bestJ = -1;
                for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
                    const nb = adjList[j];
                    const drop = h - r_elevation[nb];
                    if (drop > bestDrop) {
                        bestDrop = drop;
                        bestNb = nb;
                        bestJ = j;
                    }
                }

                // Pit handling: drain to least-steep-ascent neighbor
                if (bestDrop <= 0) {
                    let minAscent = Infinity;
                    for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
                        const nb = adjList[j];
                        const ascent = r_elevation[nb] - h;
                        if (ascent < minAscent) {
                            minAscent = ascent;
                            bestNb = nb;
                            bestJ = j;
                        }
                    }
                }

                if (bestNb >= 0) {
                    drainTarget[r] = bestNb;
                    cellDist[r] = neighborDist[bestJ] || 1e-6;
                }
            }

            // Flow accumulation (already sorted descending at top of iteration)
            flow.fill(0);
            for (let i = 0; i < landCount; i++) flow[landCells[i]] = 1;

            for (let i = 0; i < landCount; i++) {
                const r = landCells[i];
                const target = drainTarget[r];
                if (target >= 0) flow[target] += flow[r];
            }

            // Implicit stream power solve (ascending elevation order) + sediment deposition
            for (let i = landCount - 1; i >= 0; i--) {
                const r = landCells[i];
                const target = drainTarget[r];
                if (target < 0 || cellDist[r] <= 0) continue;

                const factor = K * Math.pow(flow[r] * flowScale, m) * dt / cellDist[r];
                const h_receiver = Math.max(r_elevation[target], 0);
                let h_new = (r_elevation[r] + factor * h_receiver) / (1 + factor);

                if (h_new < h_receiver) h_new = h_receiver;
                if (h_new < 0) h_new = 0;

                // Sediment deposition: deposit fraction of eroded material at receiver
                const eroded = r_elevation[r] - h_new;
                if (eroded > 0 && !r_isOcean[target]) {
                    const drainOfTarget = drainTarget[target];
                    let receiverSlope = 0;
                    if (drainOfTarget >= 0 && cellDist[target] > 0) {
                        receiverSlope = Math.abs(r_elevation[target] - r_elevation[drainOfTarget]) / cellDist[target];
                    }
                    const depositFrac = HYDRAULIC_DEPOSIT_FRAC / (1 + receiverSlope * HYDRAULIC_SLOPE_SENSITIVITY);
                    const deposit = eroded * depositFrac;
                    r_elevation[target] += deposit;
                    if (r_elevation[target] > h_new) r_elevation[target] = h_new;
                }

                r_elevation[r] = h_new;
            }
        }

        // ---- Thermal step ----
        if (iter < tIters) {
            delta.fill(0);

            for (let i = 0; i < landCount; i++) {
                const r = landCells[i];
                const h = r_elevation[r];

                let totalExcess = 0;
                let excCount = 0;

                for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
                    const nb = adjList[j];
                    if (r_isOcean[nb]) continue;
                    const nh = r_elevation[nb];
                    if (nh >= h) continue;

                    const d = neighborDist[j] || 1e-6;

                    const slope = (h - nh) / d;
                    if (slope > talusSlope) {
                        const excess = (slope - talusSlope) * d;
                        excNb[excCount] = nb;
                        excVal[excCount] = excess;
                        excAdjIdx[excCount] = j;
                        excCount++;
                        totalExcess += excess;
                    }
                }

                if (totalExcess <= 0) continue;

                // Slope-weighted distribution: steeper neighbors get more debris
                let totalSlopeWeighted = 0;
                for (let k = 0; k < excCount; k++) {
                    const d = neighborDist[excAdjIdx[k]] || 1e-6;
                    excSlope[k] = (h - r_elevation[excNb[k]]) / d;
                    totalSlopeWeighted += excVal[k] * excSlope[k];
                }

                const transfer = kThermal * totalExcess * THERMAL_TRANSFER_FRAC;
                if (totalSlopeWeighted > 0) {
                    for (let k = 0; k < excCount; k++) {
                        const share = (excVal[k] * excSlope[k] / totalSlopeWeighted) * transfer;
                        delta[r]       -= share;
                        delta[excNb[k]] += share;
                    }
                } else {
                    for (let k = 0; k < excCount; k++) {
                        const share = (excVal[k] / totalExcess) * transfer;
                        delta[r]       -= share;
                        delta[excNb[k]] += share;
                    }
                }
            }

            for (let i = 0; i < landCount; i++) {
                r_elevation[landCells[i]] += delta[landCells[i]];
            }
        }
    }

    // Post-loop: light Laplacian smooth on glaciated cells to blend carving edges
    if (glacIdx) {
        const tmp = new Float32Array(r_elevation);
        for (let r = 0; r < N; r++) {
            if (r_isOcean[r] || glacIdx[r] <= 0) continue;
            let sum = 0, count = 0;
            for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
                if (!r_isOcean[adjList[j]]) { sum += r_elevation[adjList[j]]; count++; }
            }
            if (count > 0) {
                const avg = sum / count;
                tmp[r] = r_elevation[r] + (avg - r_elevation[r]) * GLACIAL_POST_SMOOTH;
            }
        }
        for (let r = 0; r < N; r++) {
            if (!r_isOcean[r] && glacIdx[r] > 0) r_elevation[r] = tmp[r];
        }
    }
}

/**
 * Ridge sharpening — pushes cells that sit above their neighborhood average
 * further upward, accentuating ridgelines without creating unrealistic spikes.
 */
export function sharpenRidges(mesh, r_elevation, r_isOcean, iterations, strength) {
    const N = mesh.numRegions;
    const { adjOffset, adjList } = mesh;

    // Pre-build land cell list to skip ~40% ocean cells each iteration
    const landCells = [];
    for (let r = 0; r < N; r++) {
        if (!r_isOcean[r]) landCells.push(r);
    }
    const landCount = landCells.length;

    const tmp = new Float32Array(N);
    const original = new Float32Array(r_elevation);

    for (let iter = 0; iter < iterations; iter++) {
        for (let li = 0; li < landCount; li++) {
            const r = landCells[li];
            const h = r_elevation[r];
            let sum = 0;
            const count = adjOffset[r + 1] - adjOffset[r];
            for (let i = adjOffset[r], iEnd = adjOffset[r + 1]; i < iEnd; i++) {
                sum += r_elevation[adjList[i]];
            }
            if (count === 0) { tmp[r] = h; continue; }

            const avg = sum / count;
            if (h > avg) {
                // Ridge sharpening: push peaks up
                let h_new = h + (h - avg) * strength;
                // Clamp: don't exceed 1.5x original elevation
                const cap = original[r] * RIDGE_SHARPEN_CAP;
                if (h_new > cap) h_new = cap;
                tmp[r] = h_new;
            } else if (h < avg) {
                // Valley deepening: push valleys down (weaker than ridge sharpening)
                const VALLEY_FACTOR = VALLEY_DEEPEN_FACTOR;
                let h_new = h - (avg - h) * strength * VALLEY_FACTOR;
                // Floor cap: don't go below 0.5x original (symmetric to 1.5x ceiling)
                const floor = original[r] * VALLEY_FLOOR_FRAC;
                if (original[r] > 0 && h_new < floor) h_new = floor;
                // Don't push land below sea level
                if (original[r] > 0 && h_new < VALLEY_FLOOR_MIN) h_new = VALLEY_FLOOR_MIN;
                tmp[r] = h_new;
            } else {
                tmp[r] = h;
            }
        }
        for (let li = 0; li < landCount; li++) r_elevation[landCells[li]] = tmp[landCells[li]];
    }
}

/**
 * Detail noise — adds domain-warped FBM bumps to every land cell to break
 * up visually-flat continental interiors (where the elev→km quartic
 * compresses small elev differences to near-zero physical relief).
 *
 * Two modes via opts:
 *   - Default (unipolar): output remapped to [0, amplitudeKm] km. Bumps
 *     only, no pits — safe near coastlines.
 *   - Bipolar (opts.bipolar=true): output mapped to [-amp, +amp] km, with
 *     `biasExponent` < 1 pushing values toward the extremes (so most
 *     cells receive a near-full-amplitude bump or pit, fewer sit at zero).
 *     kmTarget is clamped to a small positive so dips don't sink land.
 *
 * Works in km space because the elev→km mapping is highly nonlinear:
 * a uniform elev offset would map to wildly different km amounts at
 * different elevations. After computing deltaKm we invert the quartic
 * km(t) = 6t⁴(5−4t) via Newton-Raphson to get back to elev.
 */
export function applyDetailNoise(mesh, r_xyz, r_elevation, r_isOcean, seed, opts = {}) {
    const amplitudeKm = opts.amplitudeKm ?? DETAIL_NOISE_AMP_KM;
    const frequencyMult = opts.frequencyMult ?? 1.0;
    const warpAmpMult = opts.warpAmpMult ?? 1.0;
    const bipolar = opts.bipolar ?? false;
    const biasExponent = opts.biasExponent ?? 1.0;
    const seedOffset = opts.seedOffset ?? 31337;
    // Optional per-cell dampening: dampenField[r] in [0,1], 1 = max dampen.
    // The noise amplitude at cell r is scaled by (1 - dampenStrength * dampenField[r]).
    const dampenField = opts.dampenField ?? null;
    const dampenStrength = opts.dampenStrength ?? 0;
    const useDampen = dampenField !== null && dampenStrength > 0;
    // Optional per-cell amplitude multiplier: amplitudeField[r] in [0,1].
    // Applied as a direct factor on top of any dampening — used for the
    // orogenic-power coupling so noise tracks active mountain-building zones.
    const amplitudeField = opts.amplitudeField ?? null;

    const N = mesh.numRegions;
    const noise = new SimplexNoise(seed + seedOffset);
    const wf = DETAIL_NOISE_WARP_FREQ * frequencyMult;
    const wa = DETAIL_NOISE_WARP_AMP * warpAmpMult;
    const wo = DETAIL_NOISE_WARP_OCTAVES;
    const df = DETAIL_NOISE_FREQ * frequencyMult;
    const doct = DETAIL_NOISE_OCTAVES;

    for (let r = 0; r < N; r++) {
        if (r_isOcean[r]) continue;
        const elev = r_elevation[r];
        // Skip cells outside the quartic's well-defined domain. Above
        // elev≈1 the formula 6t⁴(5−4t) goes negative, producing NaN
        // through Math.pow(negative, 0.25) and corrupting downstream
        // erosion via NaN propagation. Mountain peaks already have
        // plenty of relief — no visible loss from skipping them.
        if (elev <= 0 || elev >= 0.99) continue;

        const px = r_xyz[3 * r], py = r_xyz[3 * r + 1], pz = r_xyz[3 * r + 2];

        // Domain warp: perturb the position by FBM in each axis
        const dx = noise.fbm(px * wf + 1.7, py * wf + 9.2, pz * wf + 4.5, wo) * wa;
        const dy = noise.fbm(px * wf - 5.1, py * wf + 2.8, pz * wf - 7.3, wo) * wa;
        const dz = noise.fbm(px * wf + 6.6, py * wf - 8.4, pz * wf + 3.1, wo) * wa;

        let n = noise.fbm((px + dx) * df, (py + dy) * df, (pz + dz) * df, doct);
        if (n < -1) n = -1; else if (n > 1) n = 1;

        let mapped;
        if (bipolar) {
            // Preserve sign, expand magnitude with |n|^bias (bias<1 → toward ±1)
            const absN = n < 0 ? -n : n;
            mapped = (n < 0 ? -1 : 1) * Math.pow(absN, biasExponent);
        } else {
            // Remap [-1, 1] → [0, 1] (positive bumps only)
            mapped = n * 0.5 + 0.5;
            if (mapped < 0) mapped = 0;
        }

        let deltaKm = mapped * amplitudeKm;
        if (useDampen) deltaKm *= 1 - dampenStrength * dampenField[r];
        if (amplitudeField) deltaKm *= amplitudeField[r];
        if (deltaKm > -1e-9 && deltaKm < 1e-9) continue;

        // km(t) = 6t⁴(5−4t); invert km0 + deltaKm via Newton-Raphson.
        // Clamp kmTarget at a tiny positive so bipolar dips can't push
        // land below sea level. At low elev the derivative is ~0, so
        // seed with the small-t approximation (km ≈ 30t⁴ → t ≈ (km/30)^¼).
        const t02 = elev * elev, t04 = t02 * t02;
        const km0 = 6 * t04 * (5 - 4 * elev);
        const kmTarget = Math.max(1e-4, km0 + deltaKm);

        let t = Math.max(elev, Math.pow(kmTarget / 30, 0.25));
        if (t > 0.999) t = 0.999;
        for (let i = 0; i < 5; i++) {
            const t2 = t * t, t3 = t2 * t, t4 = t3 * t;
            const f = 6 * t4 * (5 - 4 * t) - kmTarget;
            const fp = 120 * t3 * (1 - t);
            if (fp < 1e-6) break;
            const dt = f / fp;
            t -= dt;
            if (t < 1e-4) t = 1e-4;
            else if (t > 0.9999) t = 0.9999;
            if (Math.abs(dt) < 1e-6) break;
        }
        r_elevation[r] = t;
    }
}

/**
 * Soil creep — simple Laplacian diffusion on land cells.
 * Unlike bilateral smoothing, this doesn't preserve ridges — it uniformly
 * rounds off hillslopes. Coastline cells are locked.
 */
export function applySoilCreep(mesh, r_elevation, r_isOcean, iterations, strength) {
    const N = mesh.numRegions;
    const { adjOffset, adjList } = mesh;

    // Pre-build interior land cell list: skip ocean cells and coastline-locked cells
    const interiorLand = [];
    for (let r = 0; r < N; r++) {
        if (r_isOcean[r]) continue;
        let coastal = false;
        for (let i = adjOffset[r], iEnd = adjOffset[r + 1]; i < iEnd; i++) {
            if (r_isOcean[adjList[i]]) { coastal = true; break; }
        }
        if (!coastal) interiorLand.push(r);
    }
    const ilCount = interiorLand.length;

    const tmp = new Float32Array(N);

    for (let iter = 0; iter < iterations; iter++) {
        for (let li = 0; li < ilCount; li++) {
            const r = interiorLand[li];
            const h = r_elevation[r];
            let sum = 0, count = 0;
            for (let i = adjOffset[r], iEnd = adjOffset[r + 1]; i < iEnd; i++) {
                if (!r_isOcean[adjList[i]]) {
                    sum += r_elevation[adjList[i]];
                    count++;
                }
            }
            if (count === 0) { tmp[r] = h; continue; }

            const avg = sum / count;
            tmp[r] = h + (avg - h) * strength;
        }
        for (let li = 0; li < ilCount; li++) r_elevation[interiorLand[li]] = tmp[interiorLand[li]];
    }
}
