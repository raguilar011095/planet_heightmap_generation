// The export of a generated or imported planet (the panel: v2/js/view/export-panel.js; the rasters: planet-mesh.js
// beginExportRender / renderExportLayer): the catalogue of every map these pages can give — as colour, as the numbers
// themselves, or both — and the adapter that draws each one from the mesh.

import { state } from './state.js';
import { beginExportRender, renderExportLayer, endExportRender, exportSatelliteColors, koppenColor, heightmapColor, landHeightmapColor, toLinear3, exportCentreTag } from './planet-mesh.js';
import { climateColorFn, gridAt } from './climate-layers.js';
import { elevationToColor } from './color-map.js';
import { KOPPEN_CLASSES } from './koppen.js';
import { initExportPanel } from '../v2/js/view/export-panel.js';
import { DATA_SCALES as SC, scaled, hillshade8, climateRows } from '../v2/js/view/export-raster.js';

/** The heightmaps' scales here (V1's, re-importable on the Import page): −5 … +6 km with the sea floor; 0 … 6 km on land. */
export const HEIGHT_SCALE = { unit: 'km (sea level at 5/11 of the range)', lo: -5, hi: 6 }, LAND_SCALE = { unit: 'km above sea level (the sea 0)', lo: 0, hi: 6 };


/** The catalogue: groups of rows, each row a map as Colour and / or Data (one file per `data` entry). */
export const CATALOGUE = [
    { id: 'maps', label: 'Maps', rows: [
        { id: 'color', label: 'Colour Map', colour: true, tip: 'The Terrain view: the terrain palette by height, the sea by depth' },
        { id: 'satellite', label: 'Satellite', colour: true, seasonal: true, needs: 'climate', tip: 'The Satellite view: each climate\'s colours climbing with the land to rock and snow, sea ice in its season' },
        { id: 'koppen', label: 'Climate zones (Köppen)', colour: true, needs: 'climate', data: [{ key: 'koppenIndex', suffix: 'index', label: 'Köppen class index', scale: SC.koppenIndex, bits: 8 }], tip: 'The Köppen classes in the legend\'s colours; as data, each class\'s index (the README lists them)' },
    ] },
    { id: 'elevation', label: 'Elevation', rows: [
        { id: 'heightmap', label: 'Heightmap with sea floor', data: [{ key: 'heightmap', suffix: '', label: 'Heightmap with sea floor', scale: HEIGHT_SCALE, bits: 16 }], tip: '16-bit greyscale: black −5 km, white +6 km, the same scale on every planet' },
        { id: 'landheightmap', label: 'Land heightmap', data: [{ key: 'landheightmap', suffix: '', label: 'Land heightmap', scale: LAND_SCALE, bits: 16 }], tip: '16-bit greyscale: the sea black, land 0 to 6 km — re-imports on the Import Heightmap page' },
        { id: 'landmask', label: 'Land mask', data: [{ key: 'landmask', suffix: '', label: 'Land mask', scale: SC.landmask, bits: 8 }], tip: 'Land white, the sea black' },
        { id: 'hillshade', label: 'Hillshade', data: [{ key: 'hillshade', suffix: '', label: 'Hillshade', scale: SC.hillshade, bits: 8 }], tip: 'The relief lit from the north-west, on its own — to lay over a flat colour map' },
    ] },
    { id: 'climate', label: 'Climate', rows: climateRows('climate') },
    { id: 'geology', label: 'Geology', rows: [
        { id: 'plates', label: 'Plates', colour: true, data: [{ key: 'plateId', suffix: 'id', label: 'Plate number', scale: SC.plateId, bits: 8 }], tip: 'The plates in their colours (Show Plates); as data, each plate\'s number' },
    ] },
];

/** The quantity accessors per region for a season (the sea where the layer is the sea\'s, the land where it is the land\'s). */
function valueFns(data, s) {
    const C = data.climate, g = C.grid, cells = C.cells, elev = data.r_elevation, sea = (r) => !(elev[r] > 0), at = (f, r) => gridAt(data, f, r);
    return {
        temperature: (r) => (sea(r) ? at((g.Tsea ?? g.T)[s], r) : cells.t[s][r]),
        precip: (r) => (sea(r) ? at(g.P[s], r) : cells.p[s][r]),
        pressure: (r) => at(g.slp[s], r),
        windSpeed: (r) => Math.hypot(at(g.u[s], r), at(g.v[s], r)), windU: (r) => at(g.u[s], r), windV: (r) => at(g.v[s], r),
        sstAnom: (r) => (sea(r) ? at(g.sstAnom[s], r) : NaN), currentU: (r) => (sea(r) ? at(g.currentU[s], r) : NaN), currentV: (r) => (sea(r) ? at(g.currentV[s], r) : NaN),
        upwelling: (r) => (sea(r) ? at(g.upwelling[s], r) : NaN),
        seaIce: (r) => (sea(r) ? at(g.seaIce[s], r) : 0), snow: (r) => (sea(r) || !g.snow ? 0 : at(g.snow[s], r)), iceSheet: (r) => (sea(r) || !g.iceSheet ? 0 : at(g.iceSheet, r)),
        tempRange: (r) => (sea(r) ? NaN : cells.tRange[r]), rainShadow: (r) => (sea(r) ? NaN : at(g.orographic, r)),
        aridity: (r) => (sea(r) ? NaN : cells.aridity[r]), growing: (r) => (sea(r) ? NaN : cells.growing[r]), rainSeason: (r) => (sea(r) ? NaN : cells.rainSeason[r]),
    };
}

/**
 * Wire the export panel on the Generate or Import page. `ensureClimate(progress)` computes the climate when a map needs
 * it; `code()` the planet code (or '' on the Import page) for the file names.
 */
export function initGenerateExport({ page, ensureClimate, code }) {
    const adapter = {
        page,
        options: { hillshade: false },
        koppenClasses: KOPPEN_CLASSES,
        widths: () => [1024, 2048, 4096, 8192, 16384, 32768, 65536].map(w => ({ w, label: w > 8192 && state.isTouchDevice ? `${w} (too large for mobile)` : String(w), disabled: w > 8192 && state.isTouchDevice, selected: w === 4096 })),
        available: () => true,
        ensure: async (rows, progress) => { if (rows.some(r => r.needs === 'climate') && !state.climateComputed) { progress(0, 'Computing the climate…'); await ensureClimate((pct, label) => progress(0, label || 'Computing the climate…')); } },
        begin: async (W, opts) => ({ render: beginExportRender(W, opts.centerLon), opts, sat: {}, values: {} }),
        end: async (rctx) => { endExportRender(rctx.render); rctx.sat = rctx.values = null; },
        names: (ctx, opts) => ({ start: ['orogen', page === 'import' ? 'import' : null], end: [code(), exportCentreTag(opts.centerLon)] }),
        about: (ctx, opts) => { const c = code(); return { page: page === 'import' ? 'Import Heightmap' : 'Generate', planet: c ? `planet code ${c}` : 'an imported heightmap', link: c ? `https://orogen.studio/#${c}` : null, notes: [] }; },
        produce: async (rctx, job, progress) => {
            const data = state.curData, { r_elevation: elev, r_plate, debugLayers } = data, koppenArr = debugLayers && debugLayers.koppen, s = job.season || 'year', id = job.row.id;
            const render = (spec) => renderExportLayer(rctx.render, spec, progress);
            if (job.variant === 'colour') {
                if (id === 'color') return render({ mode: 'rgb', colorOf: (r) => elevationToColor(elev[r]) });
                if (id === 'satellite') { const sat = rctx.sat[s] || (rctx.sat[s] = exportSatelliteColors(s)); return render({ mode: 'rgb', colorOf: (r) => [sat[3 * r], sat[3 * r + 1], sat[3 * r + 2]] }); }
                if (id === 'koppen') return render({ mode: 'rgb', colorOf: (r) => toLinear3(koppenColor(koppenArr[r])) });
                if (id === 'plates') return render({ mode: 'rgb', colorOf: (r) => { const c = state.plateColors[r_plate[r]]; return c ? [c.r, c.g, c.b] : [0.3, 0.3, 0.3]; } });
                const fn = climateColorFn(id, s, data); if (!fn) throw new Error(`no colours for ${id}`);
                return render({ mode: 'rgb', colorOf: (r) => toLinear3(fn(r)) });
            }
            const key = job.file.key;
            if (key === 'heightmap') return render({ mode: 'value', smooth: true, valueOf: (r) => heightmapColor(elev[r])[0] });
            if (key === 'landheightmap') return render({ mode: 'value', smooth: true, valueOf: (r) => landHeightmapColor(elev[r])[0] });
            if (key === 'landmask') return render({ mode: 'value', smooth: false, valueOf: (r) => (elev[r] > 0 ? 1 : 0) });
            if (key === 'koppenIndex') return render({ mode: 'value', smooth: false, valueOf: (r) => koppenArr[r] / 255 });
            if (key === 'plateId') return render({ mode: 'value', smooth: false, valueOf: (r) => (r_plate[r] & 255) / 255 });
            if (key === 'hillshade') {
                const hm = await render({ mode: 'value', smooth: true, valueOf: (r) => heightmapColor(elev[r])[0] }), km = new Float32Array(hm.data.length);
                for (let i = 0; i < km.length; i++) km[i] = HEIGHT_SCALE.lo + hm.data[i] / 65535 * (HEIGHT_SCALE.hi - HEIGHT_SCALE.lo);
                return { kind: 'gray8', W: hm.W, H: hm.H, data: hillshade8(km, hm.W, hm.H) };
            }
            const V = rctx.values[s] || (rctx.values[s] = valueFns(data, s)), fn = V[key], sc = job.file.scale;
            if (!fn) throw new Error(`no data for ${key}`);
            return render({ mode: 'value', smooth: true, valueOf: (r) => scaled(fn(r), sc) });
        },
    };
    return initExportPanel({ host: document.getElementById('exportCard'), overlay: document.getElementById('exportOverlay'), catalogue: CATALOGUE, adapter,
        onOpen: () => (state.curData ? {} : null), getCenterLon: () => Math.round((state.mapCenterLon || 0) * 180 / Math.PI) });
}
