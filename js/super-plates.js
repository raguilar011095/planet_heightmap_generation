// Super plates: groups connected same-type plates into ~20 larger tectonic
// units that move cohesively, producing broad orogenic belts while preserving
// fine-grained detail from individual plate interactions.

/**
 * Build super plate assignments from individual plates.
 *
 * @param {Object}      mesh          Sphere mesh (adjOffset, adjList, numRegions)
 * @param {Int32Array}  r_plate       Region → plate seed ID
 * @param {Set}         plateSeeds    Set of all plate seed IDs
 * @param {Object}      plateVec      plate seed → { pole: [x,y,z], omega }
 * @param {Set}         plateIsOcean  Set of ocean plate seed IDs
 * @param {Object}      plateDensity  plate seed → density value
 * @returns {{ r_superPlate, superPlateVec, superPlateIsOcean, superPlateDensity, numSuperPlates }}
 */
export function buildSuperPlates(mesh, r_plate, plateSeeds, plateVec, plateIsOcean, plateDensity) {
    const { numRegions, adjOffset, adjList } = mesh;
    const numPlates = plateSeeds.size;

    // 1. Count regions per plate (plate areas)
    const plateArea = {};
    for (const pid of plateSeeds) plateArea[pid] = 0;
    for (let r = 0; r < numRegions; r++) {
        plateArea[r_plate[r]]++;
    }

    // 2. Build plate adjacency graph
    // plateNeighbors: pid → Set of neighbor plate IDs
    const plateNeighbors = {};
    for (const pid of plateSeeds) plateNeighbors[pid] = new Set();
    for (let r = 0; r < numRegions; r++) {
        const myPlate = r_plate[r];
        for (let ni = adjOffset[r], niEnd = adjOffset[r + 1]; ni < niEnd; ni++) {
            const nbPlate = r_plate[adjList[ni]];
            if (nbPlate !== myPlate) {
                plateNeighbors[myPlate].add(nbPlate);
            }
        }
    }

    // 3. Connected components of same-type plates (BFS on plate graph)
    const plateVisited = new Set();
    const components = []; // each: array of plate seed IDs
    for (const pid of plateSeeds) {
        if (plateVisited.has(pid)) continue;
        const isOcean = plateIsOcean.has(pid);
        const comp = [];
        const queue = [pid];
        plateVisited.add(pid);
        let head = 0;
        while (head < queue.length) {
            const cur = queue[head++];
            comp.push(cur);
            for (const nb of plateNeighbors[cur]) {
                if (!plateVisited.has(nb) && plateIsOcean.has(nb) === isOcean) {
                    plateVisited.add(nb);
                    queue.push(nb);
                }
            }
        }
        components.push(comp);
    }

    // 4. Split large components to reach target count
    const target = Math.max(2, Math.min(20, Math.round(numPlates / 4)));
    const totalPlates = numPlates;

    // plateToSuperPlate: plate seed → super plate ID
    const plateToSuperPlate = {};
    let nextSuperPlate = 0;

    for (const comp of components) {
        const k = Math.max(1, Math.round(target * comp.length / totalPlates));

        if (k <= 1) {
            // Entire component is one super plate
            const spId = nextSuperPlate++;
            for (const pid of comp) plateToSuperPlate[pid] = spId;
        } else {
            // Farthest-point seeding on plate graph using area-weighted
            // distances, then multi-source Dijkstra assignment.
            // Edge cost = sqrt(area of destination plate), so traversing a
            // large plate costs more than a small one → more equal-area splits.
            const compSet = new Set(comp);
            const localAdj = {};
            for (const pid of comp) {
                localAdj[pid] = [];
                for (const nb of plateNeighbors[pid]) {
                    if (compSet.has(nb)) localAdj[pid].push(nb);
                }
            }

            // Edge weight: sqrt of destination plate area (linear proxy)
            const edgeWeight = {};
            for (const pid of comp) {
                edgeWeight[pid] = Math.sqrt(plateArea[pid] || 1);
            }

            // Dijkstra from source set — updates dist in-place
            const dist = {};
            const dijkstraFrom = (startPids) => {
                for (const pid of comp) dist[pid] = Infinity;
                const visited = new Set();
                for (const s of startPids) dist[s] = 0;
                for (let iter = 0; iter < comp.length; iter++) {
                    // Find unvisited node with smallest dist
                    let cur = -1, minD = Infinity;
                    for (const pid of comp) {
                        if (!visited.has(pid) && dist[pid] < minD) {
                            minD = dist[pid]; cur = pid;
                        }
                    }
                    if (cur === -1) break;
                    visited.add(cur);
                    for (const nb of localAdj[cur]) {
                        const nd = dist[cur] + edgeWeight[nb];
                        if (nd < dist[nb]) dist[nb] = nd;
                    }
                }
            };

            // Farthest-point seeding: pick k seeds maximizing minimum weighted distance
            const seeds = [comp[0]];
            dijkstraFrom([comp[0]]);

            for (let si = 1; si < k; si++) {
                let farthest = comp[0], maxDist = -1;
                for (const pid of comp) {
                    if (dist[pid] > maxDist) {
                        maxDist = dist[pid];
                        farthest = pid;
                    }
                }
                seeds.push(farthest);
                dijkstraFrom(seeds);
            }

            // Multi-source Dijkstra from seeds to assign plates to nearest seed
            const assignment = {};
            for (const pid of comp) assignment[pid] = -1;
            const d = {};
            for (const pid of comp) d[pid] = Infinity;
            const visited = new Set();
            for (let si = 0; si < seeds.length; si++) {
                const spId = nextSuperPlate + si;
                assignment[seeds[si]] = spId;
                d[seeds[si]] = 0;
            }
            for (let iter = 0; iter < comp.length; iter++) {
                let cur = -1, minD = Infinity;
                for (const pid of comp) {
                    if (!visited.has(pid) && d[pid] < minD) {
                        minD = d[pid]; cur = pid;
                    }
                }
                if (cur === -1) break;
                visited.add(cur);
                for (const nb of localAdj[cur]) {
                    const nd = d[cur] + edgeWeight[nb];
                    if (nd < d[nb]) {
                        d[nb] = nd;
                        assignment[nb] = assignment[cur];
                    }
                }
            }

            for (const pid of comp) {
                plateToSuperPlate[pid] = assignment[pid];
            }
            nextSuperPlate += seeds.length;
        }
    }

    const numSuperPlates = nextSuperPlate;

    // 5. Build r_superPlate: region → super plate ID
    const r_superPlate = new Int32Array(numRegions);
    for (let r = 0; r < numRegions; r++) {
        r_superPlate[r] = plateToSuperPlate[r_plate[r]];
    }

    // 6. Compute super plate Euler poles (area-weighted)
    // L = sum(area_i * omega_i * pole_i) — resultant angular momentum vector
    // omega_avg = sum(area_i * |omega_i|) / sum(area_i) — restores magnitude
    const spLx = new Float64Array(numSuperPlates);
    const spLy = new Float64Array(numSuperPlates);
    const spLz = new Float64Array(numSuperPlates);
    const spOmegaSum = new Float64Array(numSuperPlates);
    const spAreaSum = new Float64Array(numSuperPlates);
    const spLargestPlate = new Array(numSuperPlates).fill(null); // { pid, area } for fallback

    for (const pid of plateSeeds) {
        const spId = plateToSuperPlate[pid];
        const pv = plateVec[pid];
        if (!pv || !pv.pole) continue; // skip synthetic/zero-velocity plates
        const area = plateArea[pid];
        const omega = pv.omega;
        const px = pv.pole[0], py = pv.pole[1], pz = pv.pole[2];

        spLx[spId] += area * omega * px;
        spLy[spId] += area * omega * py;
        spLz[spId] += area * omega * pz;
        spOmegaSum[spId] += area * Math.abs(omega);
        spAreaSum[spId] += area;

        if (!spLargestPlate[spId] || area > spLargestPlate[spId].area) {
            spLargestPlate[spId] = { pid, area };
        }
    }

    const superPlateVec = {};
    for (let sp = 0; sp < numSuperPlates; sp++) {
        const lx = spLx[sp], ly = spLy[sp], lz = spLz[sp];
        const lLen = Math.sqrt(lx * lx + ly * ly + lz * lz);
        const totalArea = spAreaSum[sp];

        if (lLen < 1e-8 || totalArea < 1) {
            // Fallback: use largest constituent plate's pole
            const largest = spLargestPlate[sp];
            if (largest) {
                const pv = plateVec[largest.pid];
                if (pv && pv.pole) {
                    superPlateVec[sp] = { pole: [pv.pole[0], pv.pole[1], pv.pole[2]], omega: pv.omega };
                    continue;
                }
            }
            superPlateVec[sp] = { pole: [0, 1, 0], omega: 0 };
            continue;
        }

        const pole = [lx / lLen, ly / lLen, lz / lLen];
        const omega = spOmegaSum[sp] / totalArea;
        // Preserve sign from resultant direction
        superPlateVec[sp] = { pole, omega };
    }

    // 7. Super plate ocean/land type: majority area of constituent plates
    const superPlateIsOcean = new Set();
    const spOceanArea = new Float64Array(numSuperPlates);
    const spTotalArea = new Float64Array(numSuperPlates);
    for (const pid of plateSeeds) {
        const spId = plateToSuperPlate[pid];
        const area = plateArea[pid];
        spTotalArea[spId] += area;
        if (plateIsOcean.has(pid)) spOceanArea[spId] += area;
    }
    for (let sp = 0; sp < numSuperPlates; sp++) {
        if (spOceanArea[sp] > spTotalArea[sp] * 0.5) {
            superPlateIsOcean.add(sp);
        }
    }

    // 8. Super plate density: area-weighted average
    const superPlateDensity = {};
    const spDensitySum = new Float64Array(numSuperPlates);
    const spDensityArea = new Float64Array(numSuperPlates);
    for (const pid of plateSeeds) {
        const spId = plateToSuperPlate[pid];
        const area = plateArea[pid];
        const density = plateDensity[pid];
        if (density !== undefined) {
            spDensitySum[spId] += area * density;
            spDensityArea[spId] += area;
        }
    }
    for (let sp = 0; sp < numSuperPlates; sp++) {
        superPlateDensity[sp] = spDensityArea[sp] > 0
            ? spDensitySum[sp] / spDensityArea[sp]
            : 2.7; // fallback average crust density
    }

    return { r_superPlate, superPlateVec, superPlateIsOcean, superPlateDensity, numSuperPlates };
}
