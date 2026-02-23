// Terrain post-processing: bilateral smoothing and flow-based erosion.
// Runs after elevation assignment to soften harsh boundaries and carve
// natural drainage patterns.

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
    const out_r = [];
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
            mesh.r_circulate_r(out_r, cur);
            for (let i = 0; i < out_r.length; i++) {
                const nb = out_r[i];
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
    const NOISE_AMP = 0.01; // amplitude relative to typical elevation range
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
        mesh.r_circulate_r(out_r, r);
        for (let i = 0; i < out_r.length; i++) {
            if (isOpenOcean[out_r[i]]) {
                visited[r] = 1;
                drainTo[r] = out_r[i]; // drains to open ocean neighbor
                heap.push(r);
                break;
            }
        }
    }

    // Pass 1: priority-flood fill (noise-perturbed for winding paths)
    while (heap.size > 0) {
        const r = heap.pop();
        const surfR = surface[r];
        mesh.r_circulate_r(out_r, r);
        for (let i = 0; i < out_r.length; i++) {
            const nb = out_r[i];
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
        const radius = Math.max(3, Math.ceil(path.length * 0.3));
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
 * Bilateral-weighted Laplacian smoothing.
 * Neighbors with similar elevation receive more weight, preserving ridges
 * and trenches while blending the banded artefacts from BFS distance fields.
 * Coastline cells (land adjacent to ocean) are locked to prevent drift.
 */
export function smoothElevation(mesh, r_elevation, r_isOcean, iterations, strength) {
    const N = mesh.numRegions;
    const tmp = new Float32Array(N);
    const out_r = [];

    // Pre-compute coastline lock: land cells adjacent to at least one ocean cell
    const locked = new Uint8Array(N);
    for (let r = 0; r < N; r++) {
        if (r_isOcean[r]) continue;
        mesh.r_circulate_r(out_r, r);
        for (let i = 0; i < out_r.length; i++) {
            if (r_isOcean[out_r[i]]) { locked[r] = 1; break; }
        }
    }

    for (let iter = 0; iter < iterations; iter++) {
        for (let r = 0; r < N; r++) {
            if (locked[r]) { tmp[r] = r_elevation[r]; continue; }

            const h = r_elevation[r];
            mesh.r_circulate_r(out_r, r);
            let wSum = 0, hSum = 0;
            for (let i = 0; i < out_r.length; i++) {
                const nh = r_elevation[out_r[i]];
                const diff = Math.abs(nh - h);
                const w = 1 / (1 + diff * 8);
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
    gIters, glacialStrength)
{
    gIters = gIters || 0;
    glacialStrength = glacialStrength || 0;

    const totalIters = Math.max(hIters, tIters, gIters);
    if (totalIters <= 0) return;

    const N = mesh.numRegions;
    const out_r = [];

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
        priorityFloodCarve(mesh, r_elevation, r_isOcean, 0.5);
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
        const thresholdLat = Math.PI / 2 - glacialStrength * Math.PI / 4.5;

        for (let r = 0; r < N; r++) {
            if (r_isOcean[r]) continue;
            const y = r_xyz[3 * r + 1];
            const polarDist = Math.abs(Math.asin(Math.max(-1, Math.min(1, y))));
            const latFactor = smoothstep(polarDist, thresholdLat, Math.PI / 2);
            const elevFactor = smoothstep(r_elevation[r], 0.5, 0.9);
            const latScale = smoothstep(polarDist, Math.PI / 8, Math.PI / 3);
            glacIdx[r] = Math.max(latFactor, elevFactor * 0.3 * (0.3 + 0.7 * latScale)) * glacialStrength;
        }

        iceTarget = new Int32Array(N);
        iceFlow = new Float32Array(N);
        numIceUpstream = new Uint8Array(N);
    }

    // Per-iteration glacial rates (scaled so total effect ≈ same regardless of iter count)
    const gScale = gIters > 0 ? 1.0 / gIters : 0;
    const gCarveRate = 0.02 * gScale;
    const gConvergenceBonus = 0.01 * gScale;
    const gDepositAmount = 0.005 * gScale;
    const gFjordCarve = 0.015 * gScale;
    const gFlowThreshold = 0.1;
    const gFjordThreshold = 0.5;

    // Mid-loop drainage fix: at 75% of iterations, run a carve-biased
    // priority-flood to cut outlets through basins created by glaciation.
    const midFloodIter = Math.round(totalIters * 0.75);
    let midFloodDone = false;

    for (let iter = 0; iter < totalIters; iter++) {

        if (!midFloodDone && iter >= midFloodIter) {
            midFloodDone = true;
            priorityFloodCarve(mesh, r_elevation, r_isOcean, 0.85);
        }

        // ---- Glacial step ----
        if (iter < gIters && glacIdx) {
            // Sort land cells by descending elevation (also used by hydraulic below)
            landCells.sort((a, b) => r_elevation[b] - r_elevation[a]);

            // Rebuild ice drainage from current elevations
            iceTarget.fill(-1);
            numIceUpstream.fill(0);

            for (let i = 0; i < landCount; i++) {
                const r = landCells[i];
                if (glacIdx[r] <= 0) continue;
                const h = r_elevation[r];
                mesh.r_circulate_r(out_r, r);
                let bestNb = -1, bestDrop = 0;
                for (let j = 0; j < out_r.length; j++) {
                    const nb = out_r[j];
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
                if (iceFlow[r] <= gFlowThreshold) continue;

                const deepening = gCarveRate * Math.pow(iceFlow[r], 0.6) * glacialStrength;
                r_elevation[r] -= deepening;

                // Valley widening for U-shape
                mesh.r_circulate_r(out_r, r);
                for (let j = 0; j < out_r.length; j++) {
                    const nb = out_r[j];
                    if (r_isOcean[nb]) continue;
                    const dx = r_xyz[3 * r]     - r_xyz[3 * nb];
                    const dy = r_xyz[3 * r + 1] - r_xyz[3 * nb + 1];
                    const dz = r_xyz[3 * r + 2] - r_xyz[3 * nb + 2];
                    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
                    const slope = Math.abs(r_elevation[r] - r_elevation[nb]) / d;
                    r_elevation[nb] -= deepening * 0.4 * Math.max(0, 1 - slope);
                }

                // Over-deepening at convergence zones
                if (numIceUpstream[r] >= 2) {
                    r_elevation[r] -= gConvergenceBonus * Math.pow(iceFlow[r], 0.4);
                }
            }

            // Moraine deposition at glacier termini
            for (let i = 0; i < landCount; i++) {
                const r = landCells[i];
                if (iceFlow[r] <= gFlowThreshold) continue;
                const target = iceTarget[r];
                if (target < 0 || r_isOcean[target]) continue;
                if (glacIdx[target] < glacIdx[r] * 0.3) {
                    r_elevation[target] += gDepositAmount * Math.pow(iceFlow[r], 0.3);
                }
            }

            // Fjord enhancement on coastal glaciated cells
            for (let r = 0; r < N; r++) {
                if (r_isOcean[r]) continue;
                if (glacIdx[r] <= 0.2 || iceFlow[r] <= gFjordThreshold) continue;
                mesh.r_circulate_r(out_r, r);
                let isCoastal = false;
                for (let j = 0; j < out_r.length; j++) {
                    if (r_isOcean[out_r[j]]) { isCoastal = true; break; }
                }
                if (isCoastal) {
                    r_elevation[r] -= gFjordCarve * Math.pow(iceFlow[r], 0.5);
                    if (r_elevation[r] < 0) r_elevation[r] = 0;
                }
            }

            // Clamp: land stays land
            for (let r = 0; r < N; r++) {
                if (!r_isOcean[r] && r_elevation[r] < 0) r_elevation[r] = 0;
            }
        }

        // ---- Hydraulic step ----
        if (iter < hIters) {
            // Build drainage graph (steepest descent)
            drainTarget.fill(-1);

            for (let i = 0; i < landCount; i++) {
                const r = landCells[i];
                const h = r_elevation[r];
                mesh.r_circulate_r(out_r, r);

                let bestNb = -1, bestDrop = -Infinity;
                for (let j = 0; j < out_r.length; j++) {
                    const nb = out_r[j];
                    const drop = h - r_elevation[nb];
                    if (drop > bestDrop) {
                        bestDrop = drop;
                        bestNb = nb;
                    }
                }

                // Pit handling: drain to least-steep-ascent neighbor
                if (bestDrop <= 0) {
                    let minAscent = Infinity;
                    for (let j = 0; j < out_r.length; j++) {
                        const nb = out_r[j];
                        const ascent = r_elevation[nb] - h;
                        if (ascent < minAscent) {
                            minAscent = ascent;
                            bestNb = nb;
                        }
                    }
                }

                if (bestNb >= 0) {
                    drainTarget[r] = bestNb;
                    const dx = r_xyz[3 * r]     - r_xyz[3 * bestNb];
                    const dy = r_xyz[3 * r + 1] - r_xyz[3 * bestNb + 1];
                    const dz = r_xyz[3 * r + 2] - r_xyz[3 * bestNb + 2];
                    cellDist[r] = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
                }
            }

            // Flow accumulation (sort descending, propagate)
            landCells.sort((a, b) => r_elevation[b] - r_elevation[a]);

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

                const factor = K * Math.pow(flow[r], m) * dt / cellDist[r];
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
                    const depositFrac = 0.3 / (1 + receiverSlope * 50);
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
                mesh.r_circulate_r(out_r, r);

                let totalExcess = 0;
                let exStart = i * 0; // reuse inline to avoid allocation
                const excNb = [];
                const excVal = [];

                for (let j = 0; j < out_r.length; j++) {
                    const nb = out_r[j];
                    if (r_isOcean[nb]) continue;
                    const nh = r_elevation[nb];
                    if (nh >= h) continue;

                    const dx = r_xyz[3 * r]     - r_xyz[3 * nb];
                    const dy = r_xyz[3 * r + 1] - r_xyz[3 * nb + 1];
                    const dz = r_xyz[3 * r + 2] - r_xyz[3 * nb + 2];
                    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;

                    const slope = (h - nh) / d;
                    if (slope > talusSlope) {
                        const excess = (slope - talusSlope) * d;
                        excNb.push(nb);
                        excVal.push(excess);
                        totalExcess += excess;
                    }
                }

                if (totalExcess <= 0) continue;

                const transfer = kThermal * totalExcess * 0.5;
                for (let j = 0; j < excNb.length; j++) {
                    const share = (excVal[j] / totalExcess) * transfer;
                    delta[r]       -= share;
                    delta[excNb[j]] += share;
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
            mesh.r_circulate_r(out_r, r);
            let sum = 0, count = 0;
            for (let j = 0; j < out_r.length; j++) {
                if (!r_isOcean[out_r[j]]) { sum += r_elevation[out_r[j]]; count++; }
            }
            if (count > 0) {
                const avg = sum / count;
                tmp[r] = r_elevation[r] + (avg - r_elevation[r]) * 0.3;
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
    const tmp = new Float32Array(N);
    const original = new Float32Array(r_elevation);
    const out_r = [];

    for (let iter = 0; iter < iterations; iter++) {
        for (let r = 0; r < N; r++) {
            if (r_isOcean[r]) { tmp[r] = r_elevation[r]; continue; }

            const h = r_elevation[r];
            mesh.r_circulate_r(out_r, r);
            let sum = 0, count = 0;
            for (let i = 0; i < out_r.length; i++) {
                sum += r_elevation[out_r[i]];
                count++;
            }
            if (count === 0) { tmp[r] = h; continue; }

            const avg = sum / count;
            if (h > avg) {
                let h_new = h + (h - avg) * strength;
                // Clamp: don't exceed 1.5x original elevation
                const cap = original[r] * 1.5;
                if (h_new > cap) h_new = cap;
                tmp[r] = h_new;
            } else {
                tmp[r] = h;
            }
        }
        for (let r = 0; r < N; r++) r_elevation[r] = tmp[r];
    }
}

/**
 * Soil creep — simple Laplacian diffusion on land cells.
 * Unlike bilateral smoothing, this doesn't preserve ridges — it uniformly
 * rounds off hillslopes. Coastline cells are locked.
 */
export function applySoilCreep(mesh, r_elevation, r_isOcean, iterations, strength) {
    const N = mesh.numRegions;
    const tmp = new Float32Array(N);
    const out_r = [];

    // Pre-compute coastline lock
    const locked = new Uint8Array(N);
    for (let r = 0; r < N; r++) {
        if (r_isOcean[r]) continue;
        mesh.r_circulate_r(out_r, r);
        for (let i = 0; i < out_r.length; i++) {
            if (r_isOcean[out_r[i]]) { locked[r] = 1; break; }
        }
    }

    for (let iter = 0; iter < iterations; iter++) {
        for (let r = 0; r < N; r++) {
            if (r_isOcean[r] || locked[r]) { tmp[r] = r_elevation[r]; continue; }

            const h = r_elevation[r];
            mesh.r_circulate_r(out_r, r);
            let sum = 0, count = 0;
            for (let i = 0; i < out_r.length; i++) {
                if (!r_isOcean[out_r[i]]) {
                    sum += r_elevation[out_r[i]];
                    count++;
                }
            }
            if (count === 0) { tmp[r] = h; continue; }

            const avg = sum / count;
            tmp[r] = h + (avg - h) * strength;
        }
        for (let r = 0; r < N; r++) r_elevation[r] = tmp[r];
    }
}
