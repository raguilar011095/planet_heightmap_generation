// The planet on screen — one for every page that shows a planet built from a Frame (plans/SHARED_CORE_PLAN.md U2): the
// globe and the map (app/globe-view.js), the picture painted on the GPU (view/gpu-paint.js) or on canvases, the sun's
// glint off the sea, the lines over the picture (the grid, the winds' and currents' arrows, a page's own), the clouds over
// the Satellite view, the Satellite view drawn ahead, the detail finer than the mesh where the view is zoomed in (Add
// detail's tiles, evolution/detail-view.js), the legend, the hover's lines, and the view strip's and the layer bar's
// controls (view/layer-bar.js). What it shows is the page's: a live surface (a moment's heights on a mesh — Evolution's
// timeline, Generate's first picture) or a finished moment (finish/finish.js, through the finish worker). The page keeps
// its own loop and calls paintLive / paintFinished when its picture changes; its own layers (the plates, Generate's Inspect
// layers) come as each cell's colour, and its own lines over the picture through `extraLines`.

import { SmoothMapRaster } from './map-raster.js';
import { GpuPainter } from './gpu-paint.js';
import { locate } from '../core/mesh-locate.js';
import { paintRelief } from './terrain-shade.js';
import { GlobeView } from '../app/globe-view.js';
import { drawGraticule } from '../app/overlays.js';
import { paintPalette, heightLutOf, PALETTES } from '../evolution/looks.js';
import { CLIMATE_LAYERS, FINISHED_ONLY_LAYERS, ARROW_LAYERS, paintClimate, paintUnavailable, drawArrows, drawItcz, drawLegend, finishedClimateColor, finishedClimateLines } from '../evolution/climate-view.js';
import { prepareSatellite, satelliteReady } from '../evolution/sat-style.js';
import { cloudFields, cloudStorms } from './clouds.js';
import { paintFinished, paintWindow, riverPaths, drawRivers, drawRiversWindow, riverAt, finishedAt, REGIME_STYLE, riverYearWords } from '../evolution/finish-view.js';
import { DetailService, DetailTiles, TileLayers, SLOT, TILE, TILE_MARGIN } from '../evolution/detail-view.js';
import { GEOLOGY_LAYERS, finishedGeologyColor, geologyLegendHTML, geologyLines, rockAt, rockLine, recAt, depositLines, ageLines, districtLines } from '../evolution/geology-view.js';
import { FARMING_LAYERS, finishedFarmingColor, farmingLegendHTML, farmingLines, farmChipClicked, farmOptionsKey } from '../evolution/farming-view.js';
import { initViewStrip, initProjectionPicker } from '../../../js/view-strip.js';
import { LayerBar } from './layer-bar.js';
import { createGraticuleFrame } from '../../../js/graticule-frame.js';
import { inSpace } from '../../../js/stage.js';
import { openLeft, openShift, onOpenArea, planetWidthFrom, planetChanged } from '../../../js/open-area.js';
import { createMapBand, navHeight } from '../../../js/map-band.js';

const $ = id => document.getElementById(id);
const SEASONS = ['year', 'jan', 'jul'];
// (a slice of the Satellite view drawn ahead, ~PREP_MS every PREP_EVERY_MS: the globe draws all the time, so the page is
// seldom idle — a steady slice, short enough that its frames keep coming)
const PREP_MS = 7, PREP_EVERY_MS = 16;
const PATCH_EVERY_MS = 50;      // (a moving view asks for its tiles this often)
const PATCH_SETTLE_MS = 200;   // (a zoom on its way to another level of tiles waits until the view has been still this long:
                               // no wheel, drag or pinch, and its zoom within a hundredth of where it is going)
const DEEP_ZOOM_OVER = 1.25;   // (zoomed in all the way, each pixel of the finest tiles spread over this many of the screen's)

/** A canvas texture `width` wide (×width/2), its 2D context and an image to paint into it. */
export function texture(width) {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = width >> 1;
    const ctx = canvas.getContext('2d');
    return { canvas, ctx, image: ctx.createImageData(width, width >> 1), width };
}

export class PlanetView {
    /**
     * @param {Object} o
     *   isTouch: a phone or tablet (lighter textures, fewer tiles, no lit clouds); gpu: false to paint on the CPU;
     *   paletteKey: where the browser remembers the Terrain colours; onChange(what): the view changed — what: 'view' (repaint),
     *   'water' / 'regime' (the rivers' switches), 'farm' (a Food chip), 'layer' (another layer); alive(fin): a finished
     *   moment still kept (its Satellite view drawn ahead only while it is); extraLines(ctx, width) and extraLinesKey(): the
     *   page's own lines over the picture
     */
    constructor({ isTouch, gpu = true, paletteKey, onChange = () => {}, alive = () => true, extraLines = null, extraLinesKey = () => null, infoText = null, band = {}, frameHidden = () => false }) {
        this.isTouch = isTouch;
        this.MAP_WIDTH = isTouch ? 1024 : 2048;
        this.SHARP_WIDTH = isTouch ? 0 : 4096;         // (the sharper texture, when paused (desktop; developer: "Sharper when paused"))
        // painted on the GPU (view/gpu-paint.js), where it can be: always this sharp — it costs a millisecond or two — and
        // twice as sharp on a phone as the CPU's (?gpu=0: the CPU's painting, as before, for comparison)
        this.GPU_WIDTH = isTouch ? 2048 : 4096;
        this.SHADING = { exaggeration: 20, seaLevelKm: 0 };
        this.onChange = onChange; this.alive = alive; this.extraLines = extraLines; this.extraLinesKey = extraLinesKey; this.paletteKey = paletteKey;
        this.ui = { canvas: $('canvas'), map: $('mapCanvas'), hover: $('hoverInfo'), info: $('info') };
        this.infoText = infoText ?? (mode => `Drag to ${mode === 'map' ? 'move the map' : 'turn the planet'} · scroll to zoom · hover for details`);
        this.tex = { lo: texture(this.MAP_WIDTH), sharp: null };
        // (V1's space around the globe — stars, atmosphere, its light, the sun glinting off the sea: developer: "I do like the
        // starry background and the sunlight/reflection of V1")
        this.globe = new GlobeView(this.ui.canvas, this.tex.lo.canvas, { space: true });
        this.globe.setSmooth(true);
        this.globe.controls.autoRotateSpeed = 0.6;
        // (the globe and the map placed beside the panel: centred on the window with room to spare, on the open area when
        // room is short, js/open-area.js)
        this.globe.setOpenArea(openLeft(), openShift());
        onOpenArea((left, shift) => this.globe.setOpenArea(left, shift));
        planetWidthFrom(left => this.globe.planetWidth(left));
        // (the band a flat map is fitted in, js/map-band.js: below the layer tabs and their rows, above what the page keeps
        // under the planet — `band.below`: Evolution's timeline, Generate's hint — its frame's numerals at the sides; and
        // the graticule frame round the globe or the map, js/graticule-frame.js, hidden while `frameHidden()`)
        this.band = createMapBand(band);
        this.graticule = createGraticuleFrame(this.ui.canvas);
        this.frameHidden = frameHidden;
        this.gpu = gpu && GpuPainter.available(this.globe.renderer) ? new GpuPainter(this.globe.renderer, this.GPU_WIDTH, this.MAP_WIDTH) : null;
        this.seaMask = texture(this.MAP_WIDTH);         // where the sea is, for the glint (the lighter resolution is enough for a glint)
        this.glinting = false; this.glintFrom = null;
        this.lines = null; this.linesKey = null;        // the GPU's overlay: the lines, drawn again only when they change
        const stored = (() => { try { return localStorage.getItem(paletteKey); } catch { return null; } })();
        /** The view: what is shown and how. */
        this.view = { deposit: 'all', age: 'bronze', ageRes: 'all', layer: 'terrain', palette: PALETTES[stored] ? stored : 'relief', mode: 'globe', grid: true, gridStep: 15, centerLon: 0, projection: 'equirect', projOpts: {}, season: 'year', finished: true,
            water: true, riverQ: 40, byRegime: false,                    // (rivers and lakes on finished moments: the density's threshold, m³/s; coloured by regime)
            shaded: true,                                                // (the hillshade; off, every view flat colour)
            clouds: true };                                              // (the clouds over the Satellite view — view/clouds.js)
        this.flat = null;
        this.raster = null;                             // the CPU's pixel table for the mesh in use (tens of MB at the finest detail)
        this.sharp = null;                              // the sharper pixel table
        // (the detail finer than the mesh: drawn in tiles where the view is zoomed in past a detailed moment's own pixels —
        // detail-view.js; plans/V2_FINE_DETAIL_PLAN.md — and for exports enlarged past them; a phone keeps fewer, coarser)
        // (the tiles' workers: all but two of a computer's threads, at most 8 — 12 kept a 16-thread computer's fans going
        // whenever the view moved; an export's bands still go 4 at a time)
        this.detail = new DetailService(isTouch ? 2 : Math.min(8, Math.max(1, (navigator.hardwareConcurrency || 4) - 2)));
        // (a layer of tiles on the GPU at most this many across or down: its texture within the GPU's largest, and 8192 px)
        this.PATCH_SPAN = Math.floor(Math.min(8192, this.globe.renderer.capabilities.maxTextureSize) / SLOT);
        this.PATCH_BUDGET_MS = isTouch ? 4 : 6;         // (a frame paints and lays tiles for about this long: the rest come in the frames after)
        this.tiles = new DetailTiles(this.detail, { ...(isTouch ? { keep: 64, most: 48, maxLevel: 8 } : { keep: 200, most: 150, maxLevel: 9 }), maxSpan: this.PATCH_SPAN });   // (~0.9 MB a tile)
        this.layers = new TileLayers(this.globe, this.PATCH_SPAN);
        this.patchLook = 0; this.patchLookKey = ''; this.patchClimate = null; this.viewSig = ''; this.wantedAt = 0; this.inputAt = 0;
        // (when the view was last moved by hand: the globe's canvas and the map's frame take the pointer)
        for (const el of [this.ui.canvas, this.ui.map]) {
            if (!el) continue;
            for (const ev of ['wheel', 'pointerdown', 'touchstart', 'touchmove']) el.addEventListener(ev, () => { this.inputAt = performance.now(); }, { passive: true });
            el.addEventListener('pointermove', e => { if (e.buttons) this.inputAt = performance.now(); }, { passive: true });
        }
        this.tileImage = null; this.tileColors = { look: -1, byWidth: new Map() };
        this.cloudsShown = { on: null, C: undefined, season: null };
        this.satPrep = null; this.satPrepFailed = new WeakSet();
        this.wire();
    }

    // ── the controls: the layer bar and the view strip ──
    wire() {
        const view = this.view, changed = what => this.onChange(what);
        this.bar = new LayerBar(view, { onLayer: () => changed('layer'), onPick: () => changed('view') });
        // (the Food legend's chips: a technique on or off, the classes or the ramp, the season watered or not — at once)
        $('climateLegend').addEventListener('click', e => { if (farmChipClicked(e.target)) changed('farm'); });
        $('chkWater').addEventListener('change', e => { view.water = e.target.checked; changed('water'); });
        $('riverDensity').addEventListener('change', e => { view.riverQ = Number(e.target.value); changed('view'); });
        $('chkRegime').addEventListener('change', e => { view.byRegime = e.target.checked; changed('regime'); });
        $('chkShade').addEventListener('change', e => { view.shaded = e.target.checked; changed('view'); });
        $('chkClouds').addEventListener('change', e => { view.clouds = e.target.checked; changed('view'); });
        $('palette').value = view.palette;
        $('palette').addEventListener('change', e => {
            view.palette = e.target.value; changed('view');
            try { localStorage.setItem(this.paletteKey, view.palette); } catch { /* (remembered only where the browser allows) */ }
        });
        $('viewMode').addEventListener('change', e => {
            view.mode = e.target.value;
            this.ui.map.hidden = view.mode !== 'map';             // (the map's frame: the map is drawn under it, and it takes the pointer)
            this.ui.hover.style.display = 'none';
            if (!this.isTouch) this.ui.info.textContent = this.infoText(view.mode);
            this.showMap();
        });
        // the map view's projection (projections.js), with its own options; remembered, the same on the three pages
        initProjectionPicker((id, opts) => { view.projection = id; view.projOpts = opts; this.showMap(); });
        $('sMapCenterLon').addEventListener('input', e => {
            view.centerLon = Number(e.target.value);
            $('vMapCenterLon').textContent = `${view.centerLon}°`;
            this.showMap();
        });
        $('chkGrid').checked = view.grid;
        $('chkGrid').addEventListener('change', e => { view.grid = e.target.checked; changed('view'); $('gridSpacingGroup').hidden = !view.grid; });
        $('gridSpacing').addEventListener('change', e => { view.gridStep = Number(e.target.value); changed('view'); });
        // the view strip under the layer bar (Globe | Map and what applies to it; on a phone, in the bottom sheet)
        initViewStrip();
    }

    /** Show a layer (as its tab does). */
    setLayer(layer) { this.bar.setLayer(layer); }

    // ── painting ──
    /** Every cell lit as flat ground (hillshade 1): the live views' colours without the relief's shading. */
    flatShade(n) { return this.flat?.length === n ? this.flat : (this.flat = new Float32Array(n).fill(1)); }
    /** Colour heights with the palette chosen (the lab's relief, or one of looks.js's). */
    tint(heightKm, shade, out) { return this.view.palette === 'relief' ? paintRelief(heightKm, shade, out, { seaLevelKm: this.SHADING.seaLevelKm }) : paintPalette(this.view.palette, heightKm, shade, out, this.SHADING.seaLevelKm); }
    /** The CPU's pixel table for a mesh (only the one in use). */
    tableOf(mesh) { return (this.raster?.mesh === mesh ? this.raster : (this.raster = { mesh, table: new SmoothMapRaster(mesh, this.MAP_WIDTH) })).table; }
    /** The sharper pixel table: built a few rows at a time the first time the view is paused (~1 s, 117 MB), one mesh at a time. */
    sharpTableOf(mesh) {
        if (!this.SHARP_WIDTH) return null;
        if (this.sharp?.mesh !== mesh) {
            this.sharp?.controller.abort();
            const job = this.sharp = { mesh, table: null, controller: new AbortController() };
            SmoothMapRaster.build(mesh, this.SHARP_WIDTH, { signal: job.controller.signal })
                .then(t => { if (this.sharp === job) { job.table = t; this.onChange('view'); } }).catch(() => {});
        }
        return this.sharp.table;
    }

    /** The finished moment painted last let go, its world gone: what the view kept of it — the legend's, the tiles'
     *  colours, the Satellite view drawn ahead — held it, and every cache hung on it, in memory until another was painted. */
    forget() {
        this.legendFin = null; this.patchClimate = null;
        this.tileColors = { look: -1, byWidth: new Map() };
        this.satPrep = null;
    }

    /** A plain sea, while a new world starts (the old world's finished moment let go). */
    blank() {
        this.forget();
        const px = new Uint8Array(3), t = this.tex.lo;
        this.tint(new Float32Array([-4]), new Float32Array([0.8]), px);
        this.glint(false);
        t.ctx.fillStyle = `rgb(${px[0]},${px[1]},${px[2]})`;
        t.ctx.fillRect(0, 0, t.width, t.width >> 1);
        this.show(t);
    }

    /** The glint on (the sea mask painted with each frame: the canvas's, or the GPU's) or off — off, too, with the hillshade. */
    glint(on, from = this.seaMask.canvas) {
        const want = on && this.view.shaded ? from : null;
        if (want === this.glintFrom) return;
        this.glintFrom = want; this.glinting = !!want;
        this.globe.setSeaMask(want);
    }

    /** Put a painted texture (a canvas's, or the GPU's) on the globe and the map. */
    show(t) {
        this.globe.setSource(t.isTexture ? t : t.canvas);
        this.globe.textureChanged();
        this.pictured = true;                                   // (a planet on the globe: its graticule frame may show)
    }

    /** The map view (or the globe): the texture flat, turned so that the centre longitude is in the middle. */
    showMap() {
        const v = this.view;
        this.layoutMap();
        this.globe.setMap(v.mode === 'map' ? this.ui.map : null, v.centerLon, v.projection, v.projOpts);
        planetChanged();
    }
    /** The room the map keeps round its frame (the band's), handed to the globe view. */
    layoutMap() {
        const { top, bottom, m } = this.band.now();
        this.globe.setMapPad({ top: top - navHeight(), bottom, side: m });
    }

    /**
     * A live surface painted: `T` its heights (km) and hillshade per cell of `tMesh`, `table` its CPU pixel table (CPU only);
     * `C` a preview climate (or null: the climate layers greyed); `cells(layer, out, shade)` the page's own layers' colours
     * per cell (true when it painted them); `legendHead` above a preview climate's legend.
     */
    paintLive({ T, tMesh, table = null, C = null, cells = null, sharpTable = null, legendHead = '' }) {
        const view = this.view, out = this.cellRgb?.length === 3 * tMesh.numCells ? this.cellRgb : (this.cellRgb = new Uint8Array(3 * tMesh.numCells));
        const shade = view.shaded ? T.shade : this.flatShade(tMesh.numCells);
        // (the terrain and the heightmap are coloured per pixel from the heights — their coasts crisp; the other layers per cell)
        let byHeight = null;
        if (cells && cells(view.layer, out, shade)) { /* (the page's own: the plates, an Inspect layer) */ }
        else if (view.layer === 'heightmap') byHeight = heightLutOf('heightmap');
        else if (CLIMATE_LAYERS.has(view.layer)) {
            // the climate of this moment, if it has been calculated; else the terrain greyed (and the chip offers it)
            if (C && !FINISHED_ONLY_LAYERS.has(view.layer)) paintClimate(view.layer, view.season, C, { heightKm: T.heightKm, shade }, tMesh, out, o => this.tint(T.heightKm, shade, o));
            else { this.tint(T.heightKm, shade, out); paintUnavailable(out, tMesh.numCells); }
        } else if (GEOLOGY_LAYERS.has(view.layer) || FARMING_LAYERS.has(view.layer)) { this.tint(T.heightKm, shade, out); paintUnavailable(out, tMesh.numCells); }   // (comes with detail)
        else byHeight = heightLutOf(view.palette);
        const Cl = CLIMATE_LAYERS.has(view.layer) && !FINISHED_ONLY_LAYERS.has(view.layer) ? C : null;
        // the sun glints off the sea on the Terrain view (V1's water shows there only)
        const gpu = this.gpu;
        if (gpu) {
            // (on the GPU: the cells' heights or colours sent, the picture drawn there — its sea and its lines with it)
            this.glint(view.layer === 'terrain', gpu.seaTexture);
            gpu.setMesh(tMesh);
            this.layLines(Cl);
            if (byHeight) gpu.drawHeights(T.heightKm, shade, byHeight, this.SHADING.seaLevelKm, this.glinting);
            else gpu.drawCells(out, T.heightKm, this.SHADING.seaLevelKm, this.glinting);
            this.show(gpu.texture);
        } else {
            this.glint(view.layer === 'terrain');
            const base = table ?? this.tableOf(tMesh);
            if (this.glinting) {
                base.paintSea(T.heightKm, this.seaMask.image.data, this.SHADING.seaLevelKm);
                this.seaMask.ctx.putImageData(this.seaMask.image, 0, 0);
                this.globe.seaMaskChanged();
            }
            const tab = sharpTable ?? base, t = sharpTable ? (this.tex.sharp ??= texture(this.SHARP_WIDTH)) : this.tex.lo;
            if (byHeight) tab.paintHeights(T.heightKm, shade, byHeight, t.image.data, this.SHADING.seaLevelKm);
            else tab.paint(out, t.image.data);
            t.ctx.putImageData(t.image, 0, 0);
            this.drawLines(t, Cl);
            this.show(t);
        }
        const legend = $('climateLegend'), legendKey = Cl ? `${view.layer}|${view.season}|${C.key ?? ''}` : '';
        if (legend.dataset.key !== legendKey || this.legendFor !== C) {
            if (Cl) { drawLegend(legend, view.layer, view.season, C, T); if (legendHead) legend.insertAdjacentHTML('afterbegin', `<div class="evo-legend-head">${legendHead}</div>`); }
            else legend.innerHTML = '';
            legend.dataset.key = legendKey; this.legendFor = C;
        }
    }

    /** The lines over a picture (on texture t, as thick on the sharper texture as on the other): a climate layer's, the
     *  page's own, then the grid. */
    drawLines(t, C) {
        if (C) this.climateOverlays(t, C);
        const k = t.width / this.MAP_WIDTH;
        if (this.extraLines) { t.ctx.save(); t.ctx.scale(k, k); this.extraLines(t.ctx, this.MAP_WIDTH, this.view); t.ctx.restore(); }
        if (this.view.grid) { t.ctx.save(); t.ctx.scale(k, k); drawGraticule(t.ctx, this.MAP_WIDTH, this.MAP_WIDTH >> 1, this.view.gridStep); t.ctx.restore(); }
    }

    /** The GPU's overlay for the picture painted next: the lines drawn on a transparent canvas — again only when they change
     *  (a 4096-pixel canvas is 32 MB to send) — or none. */
    layLines(C) {
        const view = this.view, gpu = this.gpu, extra = this.extraLines ? this.extraLinesKey(view) : null;
        const arrows = C && (ARROW_LAYERS[view.layer] || view.layer === 'pressure') ? C : null;
        if (!view.grid && !arrows && extra === null) { gpu.setOverlay(null); return; }
        const key = [view.grid && view.gridStep, arrows, arrows && view.layer, arrows && view.season, extra];
        const changed = !this.linesKey || key.some((v, i) => v !== this.linesKey[i]);
        if (changed) {
            const W = this.GPU_WIDTH;
            if (!this.lines) { const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = W >> 1; this.lines = { canvas, ctx: canvas.getContext('2d'), width: W }; }
            this.lines.ctx.clearRect(0, 0, W, W >> 1);
            this.drawLines(this.lines, arrows);
            this.linesKey = key;
        }
        gpu.setOverlay(this.lines.canvas, changed);
    }

    /** A climate layer's lines over its colours (on texture t): the winds' or the currents' arrows, and the ITCZ. */
    climateOverlays(t, C) {
        const view = this.view;
        if (!ARROW_LAYERS[view.layer] && view.layer !== 'pressure') return;
        const k = t.width / this.MAP_WIDTH;
        t.ctx.save(); t.ctx.scale(k, k);
        if (view.layer === 'pressure') drawItcz(t.ctx, this.MAP_WIDTH, view.season, C);
        if (ARROW_LAYERS[view.layer]) drawArrows(t.ctx, this.MAP_WIDTH, view.layer, view.season, C);
        t.ctx.restore();
    }

    /** A finished moment as the layer shown can show it (the height layers; the climate layers with its climate; Satellite
     *  with its picture; Geology with its rocks; Food) — or null. */
    shows(fin) {
        const v = this.view;
        if (!fin || !v.finished || !(v.layer === 'terrain' || v.layer === 'heightmap' || CLIMATE_LAYERS.has(v.layer) || GEOLOGY_LAYERS.has(v.layer) || FARMING_LAYERS.has(v.layer))) return null;
        return (!CLIMATE_LAYERS.has(v.layer) || fin.climate) && (!FINISHED_ONLY_LAYERS.has(v.layer) || fin.climate?.raster?.sat) && (!GEOLOGY_LAYERS.has(v.layer) || fin.raster.geology) ? fin : null;
    }

    /** The legend's key for a finished moment's view (a legend made for another is made again). */
    finishedLegendKey(fin, farm, id = '') { const v = this.view; return `finished|${v.layer}|${v.season}|${v.deposit}|${v.age}|${v.ageRes}|${id}|${fin.cells}${farm ? `|${farmOptionsKey()}` : ''}`; }

    /** A finished moment: its picture, coloured and shaded as the live terrain is — or its climate, per pixel. `id`: the
     *  moment's (its legend kept while it is shown). */
    paintFinished(fin, sharp, id = '') {
        const view = this.view, t = sharp ? (this.tex.sharp ??= texture(this.SHARP_WIDTH)) : this.tex.lo;
        const lut = heightLutOf(view.layer === 'heightmap' ? 'heightmap' : view.palette), water = view.water && (view.layer === 'terrain' || view.layer === 'satellite');
        const C = CLIMATE_LAYERS.has(view.layer) ? fin.climate : null, geo = GEOLOGY_LAYERS.has(view.layer), farm = FARMING_LAYERS.has(view.layer);
        this.glint(view.layer === 'terrain' || view.layer === 'satellite');
        // (the satellite view shows the lakes always — they are its ground — the rivers with Rivers & Lakes; the geology and
        // farming views their lakes too, as water)
        paintFinished(fin.raster, t, lut, { seaImage: this.glinting ? this.seaMask.image.data : null, seaWidth: this.MAP_WIDTH, exaggeration: this.SHADING.exaggeration * (view.layer === 'satellite' ? 1.25 : 1), lakes: water || view.layer === 'satellite' || geo || farm,
            shaded: view.shaded, keep: true, colorAt: geo ? finishedGeologyColor(view.layer, t.width, fin, view.deposit, view.age, view.ageRes) : farm ? finishedFarmingColor(view.layer, fin, t.width) : C ? finishedClimateColor(view.layer, view.season, C, t.width, lut, fin) : null });
        if (this.glinting) { this.seaMask.ctx.putImageData(this.seaMask.image, 0, 0); this.globe.seaMaskChanged(); }
        t.ctx.putImageData(t.image, 0, 0);
        // (the rivers' lines on the Terrain view — and on Farmland, the water its canals and floods come from; from space they
        // are ground, not lines — the Satellite view draws none: drawn at a 2048-wide texture's scale, as thick on the sharper one)
        if (view.water && (view.layer === 'terrain' || view.layer === 'farmLand') && fin.rivers) { const k = t.width / this.MAP_WIDTH * (this.MAP_WIDTH / 2048); t.ctx.save(); t.ctx.scale(k, k); drawRivers(t.ctx, riverPaths(fin, view.riverQ), view.byRegime && view.layer === 'terrain'); t.ctx.restore(); }
        this.drawLines(t, C);
        this.show(t);
        // (and made again for another finished moment — the same moment finished again, with another climate, has the same key)
        const legend = $('climateLegend'), legendKey = C || geo || farm ? this.finishedLegendKey(fin, farm, id) : '';
        if (legend.dataset.key !== legendKey || this.legendFin !== fin) {
            this.legendFin = fin;
            if (geo) legend.innerHTML = geologyLegendHTML(view.layer, fin, view.deposit, view.age, view.ageRes);
            else if (farm) legend.innerHTML = farmingLegendHTML(view.layer, fin);
            else if (C) drawLegend(legend, view.layer, view.season, C, null);
            else legend.innerHTML = '';
            legend.dataset.key = legendKey;
        }
        this.prepareSatelliteSoon(fin);
    }

    /** The legend's card and the rivers' regime key: shown when they hold something (`detailed`: a finished moment shown). */
    syncLegendCard(detailed) {
        const view = this.view, legend = $('regimeLegend');
        legend.hidden = !(view.byRegime && view.water && view.layer === 'terrain' && detailed);
        if (!legend.childElementCount) legend.innerHTML = REGIME_STYLE.map(s => `<span><i style="background:${s.rgb}"></i>${s.name}</span>`).join('');
        $('legendCard').hidden = !$('climateLegend').innerHTML.trim() && legend.hidden;
    }

    // ── the clouds (view/clouds.js): over the Satellite view only, from its detailed moment's own climate, in the season
    // picked (owner, 2026-11-01: "only be in the satellite mode after the world climate can shift it"); the globe draws them ──
    /** `fin`: the finished moment shown (or null); `seed`: the world's number (its storms its own). */
    syncClouds(fin, seed) {
        const view = this.view, C0 = view.clouds && view.layer === 'satellite' ? fin?.climate ?? null : null, on = !!C0?.P;
        const C = on ? C0 : null, k = this.cloudsShown;
        if (k.on === on && k.C === C && k.season === view.season) return;
        this.cloudsShown = { on, C, season: view.season };
        // (on a phone lighter: unlit, no shadows — the shader runs for every pixel of the globe; the storms the world's own)
        this.globe.setClouds({ on, fields: on ? cloudFields(C, view.season) : null, storms: on ? cloudStorms(seed ?? 0, C, view.season) : null, lit: !this.isTouch, shadow: !this.isTouch });
    }

    // ── the Satellite view drawn ahead (owner, 2026-11-01: "in the background right after Add detail"): a detailed moment's
    // styled picture (sat-style.js) a slice at a time beside the page's own work — the season shown first; the others once
    // the Satellite view is open — so opening it, or changing its season, has little or nothing left to draw ──
    prepareSatelliteSoon(fin) {
        const R = fin?.climate?.raster, view = this.view;
        if (!R?.sat || !fin.raster?.heightM || this.satPrepFailed.has(R)) return;
        const want = (view.layer === 'satellite' ? [view.season, ...SEASONS.filter(s => s !== view.season)] : [view.season]).filter(s => SEASONS.includes(s) && !satelliteReady(R, s));
        if (!want.length) return;
        if (this.satPrep?.R === R) { this.satPrep.todo = want; return; }      // (already under way for this moment: its list renewed)
        this.satPrep = { R, todo: want };
        const tick = () => {
            const sp = this.satPrep;
            if (sp?.R !== R) return;                            // (another moment shown: this one's left)
            // (the moment let go — another detailed in its place, memory freed for a retry, a new world: left too, its memory
            // with it)
            if (!this.alive(fin)) { this.satPrep = null; return; }
            try {
                const s = sp.todo[0];
                if (!s || prepareSatellite(R, s, fin.raster.heightM, fin.raster.w, fin.rivers, fin.raster.water, fin.raster, PREP_MS)) sp.todo.shift();
            } catch (err) {
                this.satPrep = null; this.satPrepFailed.add(R);
                console.warn('[orogen] could not draw the Satellite view ahead:', err);
                return;
            }
            if (sp.todo.length) setTimeout(tick, PREP_EVERY_MS); else this.satPrep = null;
        };
        setTimeout(tick, PREP_EVERY_MS);
    }

    // ── the detail finer than the mesh (detail-view.js): where the view, paused on a detailed moment, is zoomed in past its
    // picture's own pixels, the tiles in view are drawn at about the screen's resolution — as it moves, nearest its middle
    // first — and laid over the planet as they come, each sent to the GPU once (TileLayers) ──
    /** The layers a patch is painted for: the heights', the climate's, the geology's and the farming's — not those whose
     *  arrows or lines are on the picture. */
    patchLayer(layer) {
        return layer === 'terrain' || layer === 'heightmap' || (CLIMATE_LAYERS.has(layer) && !ARROW_LAYERS[layer] && layer !== 'pressure') || GEOLOGY_LAYERS.has(layer) || FARMING_LAYERS.has(layer);
    }
    /** The view's places: a 9 × 9 grid over the globe's canvas or the map's frame, as [lon, lat] (null off the planet), and
     *  its height in device pixels. */
    viewPlaces() {
        const map = this.view.mode === 'map', el = map ? this.ui.map : this.ui.canvas, r = el.getBoundingClientRect(), places = [];
        for (let j = 0; j <= 8; j++) for (let i = 0; i <= 8; i++) {
            const x = r.left + r.width * i / 8, y = r.top + r.height * j / 8;
            let p = null;
            if (map) p = this.globe.mapUvAt(x, y); else { const uv = this.globe.uvAt(x, y, r); p = uv ? [uv.x, 1 - uv.y] : null; }
            places.push(p ? [p[0] * 360 - 180, 90 - p[1] * 180] : null);
        }
        return { places, px: r.height * Math.min(devicePixelRatio || 1, 1.5) };
    }
    /** What the patch's tiles are painted for: a number that changes when the layer, its colours or what is drawn over it do. */
    patchLookOf(fin) {
        const v = this.view, key = `${v.layer}|${v.palette}|${v.season}|${v.shaded}|${v.water}|${v.riverQ}|${v.byRegime}|${v.grid}|${v.gridStep}${GEOLOGY_LAYERS.has(v.layer) ? `|${v.deposit}|${v.age}|${v.ageRes}` : ''}${FARMING_LAYERS.has(v.layer) ? `|${farmOptionsKey()}` : ''}`;
        if (key !== this.patchLookKey || fin.climate !== this.patchClimate) { this.patchLookKey = key; this.patchClimate = fin.climate; this.patchLook++; }
        return this.patchLook;
    }
    /**
     * Each frame: the tiles the view wants — asked for as it moves, every PATCH_EVERY_MS (another level's once the view has
     * been still for PATCH_SETTLE_MS: a zoom draws none of the levels it passes through) — and those drawn laid over the
     * planet. `fin`: the finished moment shown, paused (else null); `kept`: the finished moment the page keeps (its tiles
     * go once it is gone); `seed`: the world's.
     */
    updatePatch(now, fin, kept, seed) {
        const { tiles, layers, globe, ui, view } = this;
        if (tiles.fin && kept !== tiles.fin) { tiles.reset(); layers.clear(); }   // (that moment is gone: its tiles too)
        const drawn = !!fin && DetailService.can(fin) && this.patchLayer(view.layer);
        // (zoomed in as far as its finest tiles a little larger than the screen's pixels, where the detail is drawn)
        globe.setDeepZoom(drawn ? DEEP_ZOOM_OVER * TILE * 2 ** tiles.maxLevel : 0, Math.min(devicePixelRatio || 1, 1.5));
        if (!drawn) { layers.hide(); return; }
        const mv = globe.mapView, sig = view.mode === 'map' ? `m|${mv?.zoom}|${mv?.panX}|${mv?.panY}|${view.centerLon}|${view.projection}|${ui.map.clientWidth}|${ui.map.clientHeight}`
            : `${globe.camera.position.toArray().map(v => v.toFixed(4)).join()}|${ui.canvas.clientWidth}|${ui.canvas.clientHeight}`;
        const settled = now - this.inputAt >= PATCH_SETTLE_MS && !globe.zoomEasing();
        if ((sig !== this.viewSig || fin !== tiles.fin || (tiles.held && settled)) && now - this.wantedAt >= PATCH_EVERY_MS) {
            this.viewSig = sig; this.wantedAt = now;
            if (fin !== tiles.fin) layers.clear();
            const { places, px } = this.viewPlaces(), round = view.mode !== 'map';
            if (!this.isTouch) {
                // (as many tiles as the screen's first level needs — its pixels up to 2^0.75 the screen's, and the margin
                // all round: ~240 on a 2560 × 1290 view — so a wide screen gets the level it wants, not one coarser)
                const el = round ? ui.canvas : ui.map, k = Math.min(devicePixelRatio || 1, 1.5) * 2 ** 0.75 * (1 + 2 * TILE_MARGIN) / TILE;
                tiles.most = Math.max(150, Math.ceil((el.clientWidth * k + 2) * (el.clientHeight * k + 2)));
                tiles.keep = Math.max(200, Math.ceil(1.35 * tiles.most));
            }
            tiles.want(fin, seed, places, px, this.SHARP_WIDTH || this.MAP_WIDTH, round, settled || fin !== tiles.fin);
        }
        const look = this.patchLookOf(fin);
        layers.lay(tiles, look, t => this.paintTile(fin, t, look), this.PATCH_BUDGET_MS);
    }
    /** A tile painted for the layer shown (as paintFinished paints the planet), once per look: a SLOT-px canvas — the tile
     *  and a pixel of its neighbours' all round — with the rivers' lines and the grid over it. */
    paintTile(fin, t, look) {
        if (t.look === look) return t.canvas;
        const view = this.view, W = t.win.W, lut = heightLutOf(view.layer === 'heightmap' ? 'heightmap' : view.palette), water = view.water && (view.layer === 'terrain' || view.layer === 'satellite');
        const C = CLIMATE_LAYERS.has(view.layer) ? fin.climate : null, geo = GEOLOGY_LAYERS.has(view.layer), farm = FARMING_LAYERS.has(view.layer), tc = this.tileColors;
        if (tc.look !== look) { tc.look = look; tc.byWidth.clear(); }
        if ((C || geo || farm) && !tc.byWidth.has(W)) tc.byWidth.set(W, geo ? finishedGeologyColor(view.layer, W, fin, view.deposit, view.age, view.ageRes) : farm ? finishedFarmingColor(view.layer, fin, W)
            : finishedClimateColor(view.layer, view.season, C, W, lut, fin));
        if (this.tileImage?.width !== t.win.w || this.tileImage.height !== t.win.h) this.tileImage = new ImageData(t.win.w, t.win.h);
        paintWindow(t.data, t.win, this.tileImage.data, lut, { exaggeration: this.SHADING.exaggeration * (view.layer === 'satellite' ? 1.25 : 1), lakes: water || view.layer === 'satellite' || geo || farm, shaded: view.shaded,
            colorAt: C || geo || farm ? tc.byWidth.get(W) : null });
        if (!t.canvas) { t.canvas = document.createElement('canvas'); t.canvas.width = t.canvas.height = SLOT; }
        const ctx = t.canvas.getContext('2d'), x0 = t.win.x0 + 1, y0 = t.win.y0 + 1;     // (the canvas's pixel 0, 0 on the planet W px wide)
        ctx.putImageData(this.tileImage, -1, -1);                               // (the window's outer pixel the hillshade's neighbours only)
        // (the planet's rivers, crisp: a little thicker the closer the view, not as thick as the picture's enlarged)
        // (and on Farmland, as the picture has them: the water canals and floods come from)
        if (view.water && (view.layer === 'terrain' || view.layer === 'farmLand') && fin.rivers) drawRiversWindow(ctx, fin, view.riverQ, view.byRegime && view.layer === 'terrain', W, x0, y0, SLOT, SLOT, 2 * (W / 4096) ** 0.3 / (W / 2048));
        if (view.grid) {
            // (the grid's lines, as thin as the screen's pixels)
            const st = view.gridStep, w0 = x0 / W * 360 - 180, e0 = (x0 + SLOT) / W * 360 - 180, n0 = 90 - y0 / (W >> 1) * 180, s0 = 90 - (y0 + SLOT) / (W >> 1) * 180;
            const X = lon => (lon + 180) / 360 * W - x0, Y = lat => (90 - lat) / 180 * (W >> 1) - y0;
            ctx.save();
            ctx.strokeStyle = (window.orogenTheme?.token('map-grid') || 'rgba(255,255,255,0.22)'); ctx.lineWidth = 1.5; ctx.beginPath();
            for (let lon = Math.ceil(w0 / st) * st; lon <= e0; lon += st) { ctx.moveTo(X(lon), 0); ctx.lineTo(X(lon), SLOT); }
            for (let lat = Math.ceil(s0 / st) * st; lat <= n0; lat += st) { if (Math.abs(lat) >= 90) continue; ctx.moveTo(0, Y(lat)); ctx.lineTo(SLOT, Y(lat)); }
            ctx.stroke();
            ctx.restore();
        }
        t.look = look;
        return t.canvas;
    }
    /** The patch's height (m), sea and lake at a place [u, v] of the map, where a tile of it is drawn — the finer picture's. */
    patchAt(fin, u, v) {
        if (!this.layers.shown || this.tiles.fin !== fin) return null;
        const hit = this.tiles.at(u, v);
        if (!hit) return null;
        const { t: { data }, i } = hit;
        return { heightM: Math.round(1000 * data.h[i]), ocean: data.sea[i], water: data.wat[i] };
    }

    /** The globe drawn: turning if asked, sized to its canvas, only when something changed. */
    render(now = performance.now()) {
        this.globe.controls.autoRotate = $('chkRotate').checked && this.view.mode === 'globe';
        this.globe.resize();
        if (this.band.tick(now)) { this.layoutMap(); planetChanged(); }  // (the map's band gliding: the tabs' rows changed)
        this.globe.renderIfNeeded();                         // (the globe, or the map: the same renderer draws both)
        this.showFrame();
    }
    /** The graticule frame: the gold ring round the globe, its ticks and degrees where the grid lines meet its edge, fading
     *  as you zoom in; the gold frame round the map, its degrees where the lines leave it. None before a picture, or while
     *  the page hides it (Evolution's loading screen). */
    showFrame() {
        if (!this.pictured || this.frameHidden()) { this.graticule.hide(); return; }
        const fv = this.globe.frameView(), spacing = this.view.grid ? this.view.gridStep : 30;
        if (fv.kind === 'map') {
            const rect = this.band.frameRect();
            this.graticule.map({ ...fv, rect, spacing, key: `${fv.key}|${spacing}|${innerWidth}|${innerHeight}|${rect.l},${rect.t},${rect.r},${rect.b}` });
            return;
        }
        this.graticule.globe({ ...fv, spacing, space: inSpace() });
    }

    // ── the hover ──
    /** Where the pointer is on the texture, as fractions [u (west → east), v (north → south)] — or null, off the planet. */
    placeUnder(e) {
        if (this.view.mode === 'map') return this.globe.mapUvAt(e.clientX, e.clientY);
        const uv = this.globe.uvAt(e.clientX, e.clientY);
        return uv ? [uv.x, 1 - uv.y] : null;
    }
    /** The mesh cell that weighs most at a place [u, v] (the mesh triangle it falls in: the one a pixel there blends). */
    cellUnder(mesh, [u, v]) {
        const C3 = this.C3 ??= [0, 0, 0], W3 = this.W3 ??= [0, 0, 0];
        const lon = u * 2 * Math.PI - Math.PI, lat = Math.PI / 2 - v * Math.PI;
        locate(mesh, Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat), C3, W3);
        return C3[W3[0] >= W3[1] && W3[0] >= W3[2] ? 0 : W3[1] >= W3[2] ? 1 : 2];
    }
    /**
     * The hover's lines at a place p: the page's own first (`head`), the height (the finished moment's where one is shown,
     * else `heightKm`), its lake and river, the place, the page's next (`after`), then the layer's own — the rock and its
     * record (`story`: the Frame the stories read, `rec`: the record cell where the picture has none), the deposits or the
     * age, the district; the land's food; or the climate (`preview()`: a live surface's).
     */
    readoutLines({ p, fin, heightKm, head = [], after = [], story = null, rec = -1, preview = null }) {
        const view = this.view, lat = 90 - p[1] * 180, lon = p[0] * 360 - 180, lines = [...head];
        // (a finished moment shown: its own heights, its lakes and rivers, its own climate)
        const at = fin ? this.patchAt(fin, p[0], p[1]) ?? finishedAt(fin, p[0], p[1]) : null;
        lines.push(`<span class="hi-label">Elev</span> ${Math.round(at ? at.heightM : heightKm * 1000).toLocaleString()} m`);
        if (at && view.water && (view.layer === 'terrain' || view.layer === 'satellite')) {
            if (at.water && !at.ocean) lines.push(`<span style="color:var(--layer-climate)">●</span> <b>${['', 'Fresh lake', 'Salt lake', 'Salt pan'][at.water]}</b>`);
            const rv = fin.rivers && !at.ocean ? riverAt(fin, view.riverQ, p[0], p[1]) : null;
            if (rv) lines.push(`<span style="color:${view.byRegime ? REGIME_STYLE[rv.regime].rgb : '#37c'}">●</span> <b>River</b> · ${Math.round(rv.q).toLocaleString()} m³/s · ${riverYearWords(rv)}`);
        }
        lines.push(`<span class="hi-label">Coord</span> ${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'}`);
        lines.push(...after);
        // the geology views: the rock under the pointer and the record it came from (its belt, its seas, its cover, its wear)
        if (fin && GEOLOGY_LAYERS.has(view.layer)) {
            // (the record where the terrain read it, if the finish handed that over: the cell the pixel shows)
            const rw = !at.ocean ? recAt(fin, p[0], p[1]) : -1, wr = rw >= 0 ? rw : rec;
            const rl = !at.ocean && story && wr >= 0 ? rockLine(rockAt(fin, p[0], p[1]), story, wr) : null;
            if (rl) lines.push(rl);
            if (view.layer === 'geoDeposits') lines.push(...depositLines(fin, p[0], p[1], !!at.ocean, view.deposit));
            if (view.layer === 'geoAges') lines.push(...ageLines(fin, view.age, p[0], p[1], !!at.ocean));
            if ((view.layer === 'geoDeposits' || view.layer === 'geoAges') && !at.ocean && story) lines.push(...districtLines(fin, story, view.layer, view.deposit, view.age, view.ageRes, p[0], p[1]));
            if (story && wr >= 0) lines.push(...geologyLines(story, wr));
            return lines;
        }
        // the farming views: what the land could grow there, and why (its water, soil, season and ground)
        if (fin && FARMING_LAYERS.has(view.layer)) { lines.unshift(...farmingLines(fin, p[0], p[1], !!at.ocean, view.layer)); return lines; }
        // the climate: its Köppen class, temperature and rain
        if (fin?.climate) lines.push(...finishedClimateLines(fin.climate, p[0], p[1], !!at.ocean, view.layer, view.season));
        else if (preview) lines.push(...preview());
        return lines;
    }
    /** The hover shown with these lines (or hidden: null). */
    hover(lines) {
        const h = this.ui.hover;
        if (!lines) { h.style.display = 'none'; return; }
        h.innerHTML = lines.join('<br>'); h.style.display = 'block';
    }
    /** `readout(e)` called as a mouse moves over the planet, or where a finger taps it (a drag turns the globe and hides it). */
    onPointer(readout) {
        const hover = this.ui.hover;
        for (const el of [this.ui.canvas, this.ui.map]) {
            let down = null;
            el.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
            el.addEventListener('pointermove', e => {
                if (e.pointerType === 'mouse') { if (!e.buttons) readout(e); else hover.style.display = 'none'; }
                else if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 8) { down = null; hover.style.display = 'none'; }
            });
            el.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse' && down) readout(e); down = null; });
            el.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hover.style.display = 'none'; });
        }
    }
}
