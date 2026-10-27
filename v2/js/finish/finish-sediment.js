// F2 — sediment and hillslopes. What the rivers cut is carried down their network and laid where they slow: fans where
// they leave the mountains, floodplains in the lowlands, deltas where they meet the sea (the rest of the fine load is
// lost to the deep sea). Then hillslopes by climate: soil creep rounds the land where it is wet and warm; deserts and
// cold ground keep their edges.

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * @param {Object} mesh
 * @param {Float32Array} before   the surface before the rivers cut it (km)
 * @param {{z: Float32Array, recv: Int32Array, area: Float32Array, order: Int32Array}} C   the carve's result (z changed in place)
 * @param {Uint8Array|null} sink  closed basins' floors (their rivers' loads end there)
 */
export function depositSediment(mesh, before, C, sink, cellKm2, F) {
    const { z, recv, area, order } = C, n = mesh.numCells, { adjOffset, adjList, edgeKm } = mesh;
    const load = new Float64Array(n), deposit = new Float32Array(n), mouths = new Map();
    // ── down the network, upstream first: each cell adds what was cut from it (the bedload share) and lays down what the
    // reach cannot carry (capacity ∝ drainage × slope) ──
    const maxLayer = 0.25;                                              // (km: no reach buried deeper at once)
    for (let i = order.length - 1; i >= 0; i--) {
        const c = order[i], r = recv[c];
        load[c] += F.sedimentShare * Math.max(0, before[c] - z[c]) * cellKm2;
        const zr = r >= 0 ? z[r] : sink && sink[-1 - r] ? z[-1 - r] : 0, slope = Math.max(0, z[c] - zr) / edgeKm;
        const capacity = F.capacityK * Math.max(area[c], cellKm2) * slope;
        if (load[c] > capacity) {
            const d = Math.min(load[c] - capacity, maxLayer * cellKm2);
            deposit[c] += d / cellKm2; load[c] -= d;
        }
        if (r >= 0) load[r] += load[c];
        else if (!(sink && sink[-1 - r])) mouths.set(-1 - r, (mouths.get(-1 - r) ?? 0) + load[c]);
        else deposit[-1 - r] += load[c] / cellKm2 / 4;                   // (a closed basin's floor fills — spread below)
    }
    // ── deposits spread over fans and aprons (mass kept), then laid on the land ──
    spread(mesh, deposit, z, F.fanSpreadKm);
    for (let c = 0; c < n; c++) if (deposit[c] > 0 && z[c] > 0) z[c] += deposit[c];
    // ── deltas: a river's share of its load built out over the shelf from its mouth, nearest first, to a low plain ──
    let deltas = 0;
    const seen = new Int32Array(n).fill(-1);
    for (const [mouth, v] of mouths) {
        let vol = v * F.deltaShare;
        if (vol < cellKm2 * 0.02) continue;
        const queue = [mouth]; seen[mouth] = mouth;
        let built = 0;
        for (let q = 0; q < queue.length && vol > 0 && q < 20000; q++) {
            const c = queue[q];
            if (z[c] <= 0) {
                if (z[c] < -F.deltaMaxDepthKm) continue;
                const cost = (F.deltaTopKm - z[c]) * cellKm2;
                if (cost > vol) { z[c] += vol / cellKm2; vol = 0; break; }   // (the last of it: a shallow bar)
                z[c] = F.deltaTopKm; vol -= cost; built++;
            }
            for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const nb = adjList[k]; if (seen[nb] !== mouth && z[nb] <= 0) { seen[nb] = mouth; queue.push(nb); } }
        }
        if (built) deltas++;
    }
    return { deltas };
}

/** Spread a field over about `km` (σ), keeping its sum: a few passes toward the neighbours' mean, as many as the mesh
 *  needs to reach that far (none where its cells are wider than that). Cells at or below `floor` (the sea) take none. */
function spread(mesh, f, z, km) {
    const { adjOffset, adjList, edgeKm, numCells: n } = mesh;
    // each pass that moves share a of a cell to its neighbours adds about a·edge²/2 to the variance
    const need = 2 * km * km / (edgeKm * edgeKm), passes = Math.min(40, Math.ceil(need / 0.5));
    if (passes < 1) return;
    const a = Math.min(0.5, need / passes), next = new Float32Array(n);
    for (let p = 0; p < passes; p++) {
        next.fill(0);
        for (let c = 0; c < n; c++) {
            const v = f[c];
            if (!(v > 0)) continue;
            let land = 0;
            for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) if (z[adjList[k]] > 0) land++;
            if (!land) { next[c] += v; continue; }
            next[c] += v * (1 - a);
            const each = v * a / land;
            for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) if (z[adjList[k]] > 0) next[adjList[k]] += each;
        }
        f.set(next);
    }
}

/**
 * Dissection everywhere: every drainage line cut in by a share of how steep the ground around it is — by how many cells
 * drain there (none on a ridge, all of it in a valley the mesh can show) — so mountains are cut all over, plains stay
 * calm, and the ridges between the valleys stand. Rivers still run downhill after it (each cell no lower than the one it
 * drains into, as the carve leaves them); land stays land.
 */
export function dissect(mesh, z, C, cellKm2, F) {
    const { adjOffset, adjList, edgeKm } = mesh, { recv, area, order } = C;
    const la1 = Math.log(F.dissectKm2[0]), la2 = Math.log(F.dissectKm2[1]), before = z.slice();
    for (let i = 0; i < order.length; i++) {
        const c = order[i];
        let m = 0, k0 = 0;
        for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const nb = adjList[k]; if (before[nb] > 0) { m += Math.abs(before[nb] - before[c]); k0++; } }
        if (!k0) continue;
        const steep = smooth(F.dissectSlope[0], F.dissectSlope[1], m / k0 / edgeKm), valley = smooth(la1, la2, Math.log(Math.max(1, area[c])));
        if (steep > 0 && valley > 0) z[c] = Math.max(Math.min(before[c], 0.002), before[c] - F.dissectKm * steep * valley);
    }
    // (downhill still: in the flood's order every cell comes after the one it drains into)
    for (let i = 0; i < order.length; i++) { const c = order[i], r = recv[c]; if (r >= 0 && z[c] < z[r]) z[c] = Math.min(before[c], z[r]); }
}

/**
 * Soil creep by climate: the land relaxed toward its neighbours' mean over about F.creepKm (σ) where it is wet and warm
 * (wetness from the annual rain and temperature), not at all in deserts and on frozen ground; the coast stays where it is.
 * Where a river drains (`area`, km²: from F.creepChannelKm2[0], fully from [1]) the creep only lowers: the soil that slides
 * into a valley is carried off by its river, so the crests round and the valleys keep their floors (developer, 2026-10-26:
 * the wet sides were not carved enough — the creep had been filling their valleys).
 */
export function creepByClimate(mesh, z, rainMm, tempC, F, area = null) {
    const { adjOffset, adjList, edgeKm, numCells: n } = mesh;
    const ch = area && F.creepChannelKm2 ? F.creepChannelKm2.map(Math.log) : null;
    const need = 2 * F.creepKm * F.creepKm / (edgeKm * edgeKm), passes = Math.min(30, Math.ceil(need / 0.5));
    if (passes < 1) return 0;
    const a = Math.min(0.5, need / passes), wet = new Float32Array(n);
    for (let c = 0; c < n; c++) if (z[c] > 0 && rainMm[c] === rainMm[c]) wet[c] = a * smooth(F.creepRainMm[0], F.creepRainMm[1], rainMm[c]) * smooth(F.creepTempC[0], F.creepTempC[1], tempC[c]);
    const next = new Float32Array(n);
    for (let p = 0; p < passes; p++) {
        for (let c = 0; c < n; c++) {
            const w = wet[c];
            if (!(w > 0)) { next[c] = z[c]; continue; }
            let s = 0, k0 = 0;
            for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) { const nb = adjList[k]; if (z[nb] > 0) { s += z[nb]; k0++; } }
            let dz = k0 ? w * (s / k0 - z[c]) : 0;
            if (dz > 0 && ch && area[c] > 0) dz *= 1 - smooth(ch[0], ch[1], Math.log(area[c]));
            next[c] = k0 ? Math.max(0.002, z[c] + dz) : z[c];
        }
        z.set(next);
    }
    return passes;
}
