// Headless checks for the ground's water (finish/finish-groundwater.js; issue #87): soils, the water table, springs, oases
// and wetlands on a finished moment.
// — it only reads: a finish with it is the finish without it, array for array, with its layers added;
// — its water balances: what goes underground comes out again (to streams, the sea, the air, the surface);
// — it follows its causes, on any planet: flatter or rainier ground wetter, steeper ground drier below, more permeable
//   ground recharged more (no figure of Earth's is a target);
// — the same at 160K and 640K cells;
// — what it costs.
// Usage: node v2/tools/check-groundwater.mjs

import { check, section, finish, labMesh } from './lib/check-kit.mjs';
import { simulate } from '../js/tectonics/simulate.js';
import { TERRAIN_SCENES } from '../js/tectonics/scenarios/terrain-scenes.js';
import { terrainConfig } from '../js/terrain/terrain-config.js';
import { GEO_FRAME_FIELDS } from '../js/tectonics/model/geology.js';
import { TerrainPool, FRAME_FIELDS } from '../js/terrain/terrain-pool.js';
import { finishPlanet } from '../js/finish/finish.js';
import { GROUNDWATER } from '../js/finish/finish-groundwater.js';

const SEED = 12345, SIM = 20000, UNTIL = 400;
const mesh = labMesh(SIM), scene = TERRAIN_SCENES.find(s => s.id === 'cycle');

// the Evolution page's history (scene 'cycle'), its geological record kept (the rocks the ground's water reads)
const world = scene.build(mesh, SEED, { continentalFraction: 0.3 });
world.config.heights = terrainConfig({});
world.config.geology.records = true;
let last = null;
simulate(world, { untilMyr: UNTIL, drive: w => scene.drive(w), snapshotEveryMyr: 10, keepFrames: false, onFrame: f => { last = f; } });
const frame = Object.fromEntries([...FRAME_FIELDS, ...GEO_FRAME_FIELDS].map(k => [k, last[k]]));
frame.plates = last.plates.map(p => p && { quat: p.quat });
const pool = await TerrainPool.create(mesh);
const finishAt = (cells, groundwater = null) => finishPlanet({ frame, simMesh: mesh, seed: SEED, cells, pool, debug: true, groundwater });
const plain = await finishAt(160000), coarse = await finishAt(160000, {}), fine = await finishAt(640000, {});
pool.terminate();

/** Every typed array in a finish's result, by its path (the layers, timings and stats aside). */
function arraysOf(o, path = '', out = new Map(), seen = new Set()) {
    if (!o || typeof o !== 'object' || seen.has(o)) return out;
    seen.add(o);
    if (ArrayBuffer.isView(o)) { out.set(path, o); return out; }
    for (const [k, v] of Object.entries(o)) if (!['layers', 'ms', 'stats'].includes(k)) arraysOf(v, path ? `${path}.${k}` : k, out, seen);
    return out;
}
const sameBytes = (a, b) => {
    if (a.byteLength !== b.byteLength) return false;
    const x = new Uint8Array(a.buffer, a.byteOffset, a.byteLength), y = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
    return true;
};

section('it only reads');
{
    const A = arraysOf(plain), B = arraysOf(coarse), differ = [...A.keys()].filter(k => !B.has(k) || !sameBytes(A.get(k), B.get(k)));
    check('every array the finish returns is the same with it, byte for byte', differ.length === 0, `${A.size} arrays${differ.length ? '; differ: ' + differ.slice(0, 6).join(', ') : ''}`);
    const { groundwater: _g, ...statsWith } = coarse.stats, strip = s => JSON.stringify(s, (k, v) => (k === 'ms' ? undefined : v));
    check('…and every stat but its own', strip(plain.stats) === strip(statsWith));
    check('none of it without the parameter', !plain.stats.groundwater && !Object.keys(plain.layers).some(k => k.startsWith('ground')));
    check('its layers with it', ['groundWtd', 'groundRecharge', 'groundSoilDepth', 'groundSpring', 'groundOasis', 'groundWetFrac', 'groundWetType'].every(k => coarse.layers[k]?.length === coarse.mesh.numCells));
}

section('its water balances');
for (const [name, out] of [['160K', coarse], ['640K', fine]]) {
    const { rechargeKm3: r, outKm3: o } = out.stats.groundwater.balance;
    check(`${name}: what comes out within 3 % of what goes in`, Math.abs(o - r) <= 0.03 * r, `in ${r} km³ a year, out ${o}`);
    const s = out.stats.groundwater.solver;
    // (settled by the solver's own rule, before its limit: at most settleShare of the cells still moving more than settleM)
    check(`${name}: the water table settled`, s.settled && s.lastMoving <= GROUNDWATER.settleShare * s.cells,
        `${s.outer} passes, ${s.cgIterations} iterations, ${s.lastMoving} of ${s.cells} cells still moving more than ${GROUNDWATER.settleM} m (largest ${s.lastMaxMoveM} m)`);
}

// (the causes, on any planet: each check splits the land into thirds by one cause and asks that the effect follow it —
// no figure of Earth's is a target)
section('it follows its causes');
{
    const { mesh: m, z, ocean, layers: L, climate } = fine, { adjOffset, adjList, numCells: n } = m;
    const { pAnnual, tAnnual } = climate.cell, wet = L.groundWetFrac, wtd = L.groundWtd, rech = L.groundRecharge, logK = L.groundLogK;
    const land = [], steep = new Float32Array(n);
    for (let c = 0; c < n; c++) {
        if (ocean[c] || !(wtd[c] === wtd[c])) continue;                    // (the sea, and the ice caps: no water table)
        let s = 0, k = 0;
        for (let i = adjOffset[c]; i < adjOffset[c + 1]; i++) { const j = adjList[i]; if (!ocean[j]) { s += Math.abs(z[j] - z[c]); k++; } }
        steep[c] = k ? s / k : 0;
        land.push(c);
    }
    // (the lowest and the highest third of `cells` by `key`, and the mean of `value` over each)
    const thirds = (cells, key, value) => {
        const o = cells.slice().sort((a, b) => key(a) - key(b)), t = Math.floor(o.length / 3);
        const mean = a => a.reduce((s, c) => s + value(c), 0) / Math.max(1, a.length);
        return [mean(o.slice(0, t)), mean(o.slice(o.length - t))];
    };
    const f = (v, d = 1) => v.toFixed(d), pc = v => `${(100 * v).toFixed(1)} %`;
    {
        const [flat, steepest] = thirds(land, c => steep[c], c => wet[c] / 255);
        check('flatter ground, more wetland (water gathers where it cannot run off)', flat > steepest, `flattest third ${pc(flat)} · steepest ${pc(steepest)}`);
    }
    {
        const warm = land.filter(c => tAnnual[c] >= 10), [dry, rainy] = thirds(warm, c => pAnnual[c], c => wet[c] / 255);
        check('more rain, more wetland (warm land, ≥ 10 °C, where the rain decides the surplus)', rainy > dry, `driest third ${pc(dry)} · rainiest ${pc(rainy)}`);
    }
    {
        const [flat, steepest] = thirds(land, c => steep[c], c => wtd[c]);
        check('a deeper water table under steeper ground (uplands drain, lowlands gather)', steepest > flat, `flattest third ${f(flat)} m · steepest ${f(steepest)} m`);
    }
    {
        const fed = land.filter(c => pAnnual[c] > 100), [tight, open] = thirds(fed, c => logK[c], c => rech[c] / pAnnual[c]);
        check('more permeable ground, more of the rain recharges it', open > tight, `least permeable third ${pc(tight)} of the rain · most ${pc(open)}`);
    }
    const sp = fine.stats.groundwater.springs, oa = fine.stats.groundwater.oases;
    check('springs and oases, some of each kind that is common', sp[1] + sp[2] > 0 && oa[1] + oa[2] + oa[3] > 0, `springs ${sp.slice(1).join(' · ')} (contact · karst · dry); oases ${oa.slice(1).join(' · ')} (spring · river · wells · salt flat)`);
}

section('the same at 160K and 640K cells');
{
    const a = coarse.stats.groundwater, b = fine.stats.groundwater, pts = (x, y) => `160K ${(100 * x).toFixed(1)} % · 640K ${(100 * y).toFixed(1)} %`;
    check('wetlands: within 3 points', Math.abs(a.wetShare - b.wetShare) <= 0.03, pts(a.wetShare, b.wetShare));
    check('the water table within 1 m: within 4 points', Math.abs(a.shallowShare[1] - b.shallowShare[1]) <= 0.04, pts(a.shallowShare[1], b.shallowShare[1]));
    check('recharge: within 15 %', Math.abs(a.meanRechargeMm - b.meanRechargeMm) <= 0.15 * b.meanRechargeMm, `160K ${a.meanRechargeMm} · 640K ${b.meanRechargeMm} mm`);
}

section('what it costs');
{
    const share = out => out.ms.groundwater / Object.values(out.ms).reduce((s, v) => s + v, 0);
    check('the stage ≤ 25 % of the finish at 640K', share(fine) <= 0.25, `${(fine.ms.groundwater / 1000).toFixed(1)} s of ${(Object.values(fine.ms).reduce((s, v) => s + v, 0) / 1000).toFixed(1)} s`);
}

finish('Groundwater');
