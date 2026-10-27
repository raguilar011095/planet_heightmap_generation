// The Finish step's worker (plans/V2_FINISH_PLAN.md): finishes one moment (finish.js) and sends back its picture of
// heights. It keeps the mesh it built (a 10M-cell mesh takes ~15 s to build — only this worker ever holds it) until a
// finish at another detail (one fine mesh at a time: they are big); its
// terrain pool (the surface, in slices) lives only for the surface and is let go before the heavy stages.
//
// Message in:  {type: 'finish', id, frame (the terrain fields of a frame, terrain-pool.js FRAME_FIELDS, and the plates'
//              rotations), simMesh {numCells, xyz, adjOffset, adjList}, seed, cells, width, delaunatorUrl, poolSize?}
//              · {type: 'prepare', cells, simCells, delaunatorUrl} — the meshes a finish at `cells` needs, built ahead
//              while nothing waits on them (no reply; a finish asked for meanwhile waits for them, then finds them built)
// Messages out: {type: 'stage', id, stage} · {type: 'progress', id, share} (the picture) · {type: 'done', id, raster:
//              {w, h, heightM, ocean, water, geology, farming (farming/farming.js: its parts per pixel)}, rivers
//              (finish-hydro.js), climate (the moment's own, at its detail: the
//              grid's fields, climate-fields.js, and raster {w, h, koppen, tAnnual (°C × 100), pAnnual (mm), stats} — the land's
//              climate, at most 4096 px wide), stats, ms} · {type: 'error', id, message}

import { finishPlanet, finishRaster, FARM_KEYS } from './finish.js';
import { driverWidth, DRIVER_FIELDS } from './finish-drivers.js';
import { climateTransfers } from '../evolution/climate-fields.js';
import { TerrainPool } from '../terrain/terrain-pool.js';
import { keepOnlyTerrainMesh, terrainMesh } from '../terrain/terrain-mesh.js';
import { ladderCells } from '../terrain/synthesize.js';
import { meshFromArrays } from '../core/sim-mesh.js';
import { setDelaunator } from '../../../js/sphere-mesh.js';

let sim = null, simCells = 0, delaunatorSet = false;

self.onmessage = async ({ data }) => {
    if (data.type === 'prepare') {
        // (the fine mesh and the coarser ones its carving climbs — ~3 s at 2.5M — built before the first Add detail)
        try {
            if (!delaunatorSet) { setDelaunator((await import(data.delaunatorUrl)).default); delaunatorSet = true; }
            const sizes = ladderCells(data.simCells, data.cells);
            keepOnlyTerrainMesh(data.cells, ...sizes);
            for (const c of [...sizes, data.cells]) terrainMesh(c);
        } catch { /* (built when a finish asks for them, then) */ }
        return;
    }
    if (data.type !== 'finish') return;
    const { id, frame, seed, cells, width, poolSize = null, climateOptions = {} } = data;
    try {
        if (!delaunatorSet) { setDelaunator((await import(data.delaunatorUrl)).default); delaunatorSet = true; }
        if (!sim || simCells !== data.simMesh.numCells) { sim = meshFromArrays(data.simMesh); simCells = data.simMesh.numCells; }
        keepOnlyTerrainMesh(cells, ...ladderCells(sim.numCells, cells));   // (another detail's mesh goes: one fine mesh at a time; the coarser ones its carving climbs stay)
        const pool = await TerrainPool.create(sim, poolSize);
        const out = await finishPlanet({ frame, simMesh: sim, seed, cells, pool, closePool: true, climateOptions, driversWidth: driverWidth(width), onStage: stage => self.postMessage({ type: 'stage', id, stage }) });
        self.postMessage({ type: 'stage', id, stage: 'picture' });
        const t0 = performance.now();
        const raster = finishRaster(out.mesh, out.z, out.ocean, width, share => self.postMessage({ type: 'progress', id, share }), out.lake, out.lakeLevel, out.climate.cell, out.geology, out.farming);
        const farm = raster.farming ? [...FARM_KEYS, 'kind', ...(raster.farming.crops ? ['crops'] : [])].map(k => raster.farming[k].buffer) : [];
        out.ms.picture = performance.now() - t0;
        // (the finished moment's climate: the grid's fields, and its own picture of the land's climate)
        const climate = { ...out.climate.page, raster: raster.climate };
        delete raster.climate;
        // (what the detail finer than the mesh is drawn from: kept with the picture, and saved with it)
        raster.drivers = out.drivers;
        const rv = out.rivers;
        self.postMessage({ type: 'done', id, raster, rivers: rv, climate, stats: out.stats, ms: out.ms },
            [raster.heightM.buffer, raster.ocean.buffer, raster.water.buffer, ...farm, ...(raster.geology ? [raster.geology.rock.buffer, ...(raster.geology.rec ? [raster.geology.rec.buffer] : [])] : []), rv.start.buffer, rv.lat.buffer, rv.lon.buffer, rv.q.buffer, rv.season.buffer,
                ...(rv.regime ? [rv.regime.buffer, rv.floodFrom.buffer, rv.floodTo.buffer, rv.farFed.buffer] : []), ...climateTransfers(climate),
                ...DRIVER_FIELDS.map(k => raster.drivers[k].buffer)]);
    } catch (err) {
        self.postMessage({ type: 'error', id, message: err?.stack ?? String(err) });
    }
};
