// Coarse reference grid for resolution-independent plate boundaries.
// Generates plates on a fixed ~20K-region mesh, then projects onto any
// high-res mesh with FBM noise perturbation for fractal boundaries.

import { makeRng } from './rng.js';
import { buildSphere } from './sphere-mesh.js';
import { SimplexNoise } from './simplex-noise.js';
import { generatePlates, smoothAndReconnectPlates } from './plates.js';
import { assignOceanLand } from './ocean-land.js';

const N_COARSE = 20000;
const COARSE_JITTER = 0.75; // fixed — coarse mesh shape is independent of user's jitter

/**
 * Generate plates and ocean/land on a fixed coarse reference mesh.
 * Uses isolated RNG so it doesn't affect the main mesh's random stream.
 * Jitter is fixed so plate shapes don't change when the user adjusts irregularity.
 */
export function generateCoarsePlates(seed, numPlates, numContinents) {
    const coarseRng = makeRng(seed + 137);
    const { mesh: coarseMesh, r_xyz: coarse_xyz } = buildSphere(N_COARSE, COARSE_JITTER, coarseRng);

    const { r_plate: coarse_r_plate, plateSeeds: coarsePlateSeeds, plateVec: coarsePlateVec } =
        generatePlates(coarseMesh, coarse_xyz, numPlates, seed);

    const coarsePlateIsOcean = assignOceanLand(
        coarseMesh, coarse_r_plate, coarsePlateSeeds, coarse_xyz, seed, numContinents
    );

    return {
        coarseMesh,
        coarse_xyz,
        coarse_r_plate,
        coarsePlateSeeds,
        coarsePlateVec,
        coarsePlateIsOcean,
    };
}

/**
 * Project coarse plate assignments onto a high-res mesh via nearest-neighbor
 * with FBM noise perturbation for fractal plate boundaries.
 *
 * Each hi-res point is shifted by multi-octave simplex noise before the
 * nearest-neighbor lookup, which wobbles the plate boundary by ~2 coarse
 * cell widths with fractal detail at multiple scales.
 *
 * Uses adjacency-walk on the coarse mesh with warm-starting for O(1)
 * amortized cost per region.
 */
export function projectCoarsePlates(mesh, r_xyz, coarseMesh, coarse_xyz, coarse_r_plate, seed) {
    const N = mesh.numRegions;
    const r_plate = new Int32Array(N);
    const { adjOffset: cOff, adjList: cAdj } = coarseMesh;

    // FBM noise for fractal boundary perturbation
    const noise = new SimplexNoise(seed + 999);
    const coarseEdgeRad = Math.PI / Math.sqrt(coarseMesh.numRegions);
    const perturbAmp = coarseEdgeRad * 1.5; // wobble by ~1.5 coarse cells
    const BASE_FREQ = 8; // ~8 features per sphere diameter → ~16 around equator

    let cur = 0; // current best coarse region — warm-started across iterations

    for (let r = 0; r < N; r++) {
        const ox = r_xyz[3 * r], oy = r_xyz[3 * r + 1], oz = r_xyz[3 * r + 2];

        // FBM perturbation: shift lookup point for fractal boundaries
        let dx = 0, dy = 0, dz = 0;
        let amp = perturbAmp, freq = BASE_FREQ;
        for (let oct = 0; oct < 4; oct++) {
            dx += noise.noise3D(ox * freq,       oy * freq,       oz * freq)       * amp;
            dy += noise.noise3D(ox * freq + 100, oy * freq + 100, oz * freq + 100) * amp;
            dz += noise.noise3D(ox * freq + 200, oy * freq + 200, oz * freq + 200) * amp;
            amp *= 0.5;
            freq *= 2;
        }

        // Project perturbed point back onto unit sphere
        let px = ox + dx, py = oy + dy, pz = oz + dz;
        const len = Math.sqrt(px * px + py * py + pz * pz) || 1;
        px /= len; py /= len; pz /= len;

        // Greedy walk: find nearest coarse region to the perturbed point
        let bestDot = px * coarse_xyz[3 * cur] + py * coarse_xyz[3 * cur + 1] + pz * coarse_xyz[3 * cur + 2];

        let improved = true;
        while (improved) {
            improved = false;
            for (let i = cOff[cur], iEnd = cOff[cur + 1]; i < iEnd; i++) {
                const nb = cAdj[i];
                const d = px * coarse_xyz[3 * nb] + py * coarse_xyz[3 * nb + 1] + pz * coarse_xyz[3 * nb + 2];
                if (d > bestDot) {
                    bestDot = d;
                    cur = nb;
                    improved = true;
                }
            }
        }

        r_plate[r] = coarse_r_plate[cur];
    }

    return r_plate;
}

/**
 * Smooth projected plate boundaries with majority-vote passes, then reconnect.
 * Uses a fixed pass count so plate shapes are stable across resolutions.
 * With noise perturbation the boundaries are already fractal — smoothing just
 * cleans up single-cell artifacts from the projection.
 * Mutates r_plate in place.
 */
export function smoothProjectedPlates(mesh, r_plate, plateSeeds) {
    smoothAndReconnectPlates(mesh, r_plate, plateSeeds, 3);
}
