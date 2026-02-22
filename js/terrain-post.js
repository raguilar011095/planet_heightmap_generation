// Terrain post-processing: bilateral smoothing and flow-based erosion.
// Runs after elevation assignment to soften harsh boundaries and carve
// natural drainage patterns.

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
 * Simple flow-accumulation erosion (land cells only).
 *
 * 1. Drainage graph — each land cell drains to its lowest neighbor (steepest descent).
 * 2. Flow accumulation — cells sorted by elevation descending; each starts with 1 unit
 *    of "rain" and passes accumulated flow to its drain target.
 * 3. Erosion & deposition — stream power law: erosion = K * sqrt(flow) * slope.
 *    Capped at 30% of cell height. A fraction of eroded material deposits at the
 *    drain target, weighted by how flat that target is.
 */
export function erodeElevation(mesh, r_elevation, r_xyz, r_isOcean, erosionK) {
    if (erosionK <= 0) return;

    const N = mesh.numRegions;
    const out_r = [];

    // Collect land cell indices
    const landCells = [];
    for (let r = 0; r < N; r++) {
        if (!r_isOcean[r]) landCells.push(r);
    }
    const landCount = landCells.length;
    if (landCount === 0) return;

    // --- Pass 1: Drainage graph ---
    const drainTarget = new Int32Array(N).fill(-1);
    const drainSlope = new Float32Array(N);

    for (let i = 0; i < landCount; i++) {
        const r = landCells[i];
        const h = r_elevation[r];
        mesh.r_circulate_r(out_r, r);

        let bestNb = -1, bestDrop = 0;
        for (let j = 0; j < out_r.length; j++) {
            const nb = out_r[j];
            const drop = h - r_elevation[nb];
            if (drop > bestDrop) {
                bestDrop = drop;
                bestNb = nb;
            }
        }
        if (bestNb >= 0) {
            drainTarget[r] = bestNb;
            // Approximate slope using great-circle distance proxy (Euclidean on unit sphere)
            const dx = r_xyz[3 * r] - r_xyz[3 * bestNb];
            const dy = r_xyz[3 * r + 1] - r_xyz[3 * bestNb + 1];
            const dz = r_xyz[3 * r + 2] - r_xyz[3 * bestNb + 2];
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
            drainSlope[r] = bestDrop / dist;
        }
    }

    // --- Pass 2: Flow accumulation ---
    // Sort land cells by elevation descending
    landCells.sort((a, b) => r_elevation[b] - r_elevation[a]);

    const flow = new Float32Array(N);
    for (let i = 0; i < landCount; i++) flow[landCells[i]] = 1;

    for (let i = 0; i < landCount; i++) {
        const r = landCells[i];
        const target = drainTarget[r];
        if (target >= 0) {
            flow[target] += flow[r];
        }
    }

    // --- Pass 3: Erosion & deposition ---
    for (let i = 0; i < landCount; i++) {
        const r = landCells[i];
        const target = drainTarget[r];
        if (target < 0) continue;

        const slope = drainSlope[r];
        const erosion = Math.min(erosionK * Math.sqrt(flow[r]) * slope, r_elevation[r] * 0.3);
        if (erosion <= 0) continue;

        r_elevation[r] -= erosion;

        // Deposit a fraction at the drain target — flatter targets collect more
        if (!r_isOcean[target]) {
            const targetSlope = drainSlope[target];
            const depositFrac = 0.3 / (1 + targetSlope * 20);
            r_elevation[target] += erosion * depositFrac;
        }
    }
}
