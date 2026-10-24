// The export panel (plans: the fast follows after the Evolution release, 2026-10): one dialog for Generate, Import and
// Evolution — a checklist of every map the page can give, each as its Colour (as shown, in its legend's colours) and / or
// as Data (the numbers themselves, a greyscale on a fixed scale), for the year, January or July, at a width, centred on
// a longitude, in a projection (projections.js). One map saves as a PNG; several save as one ZIP with a README.txt that
// says what every file is. The page supplies the catalogue of its maps and an adapter that draws them (export-raster.js
// for the shared pieces); this module is the dialog and the run.

import { encodeGrayPng, encodeRgbPng, encodeRgbaPng, downloadBlob } from './png.js';
import { zipFiles } from './zip.js';
import { readmeText, fileName, SEASON_NAMES, gray16to8 } from './export-raster.js';
import { PROJECTIONS, projectLayer, projectionSize, PROJECTION_OPTIONS } from './projections.js';

/**
 * A projection's own option controls (PROJECTION_OPTIONS) rendered into `container` (hidden when there are none), each
 * change reported by `onChange()`. `stored`: values to start from. @returns a function giving the values now.
 */
export function renderProjectionOptions(container, id, stored = null, onChange = () => {}) {
    const opts = PROJECTION_OPTIONS[id] || [];
    container.innerHTML = ''; container.hidden = !opts.length;
    for (const op of opts) {
        const lab = document.createElement('label'); lab.className = 'xp-proj-opt';
        const v = stored && stored[op.id] != null ? stored[op.id] : op.def;
        if (op.type === 'select') {
            lab.innerHTML = `<span>${op.label}</span><select data-opt="${op.id}">${op.values.map(([val, t]) => `<option value="${val}"${String(val) === String(v) ? ' selected' : ''}>${t}</option>`).join('')}</select>`;
            lab.querySelector('select').addEventListener('change', onChange);
        } else {
            lab.innerHTML = `<span>${op.label} <b class="v">${v}°</b></span><input type="range" data-opt="${op.id}" min="${op.min}" max="${op.max}" step="${op.step || 5}" value="${v}">`;
            lab.querySelector('input').addEventListener('input', (e) => { lab.querySelector('b').textContent = e.target.value + '°'; onChange(); });
        }
        container.appendChild(lab);
    }
    return () => { const o = {}; for (const el of container.querySelectorAll('[data-opt]')) o[el.dataset.opt] = el.type === 'range' ? Number(el.value) : (isNaN(+el.value) ? el.value : +el.value); return o; };
}

const DEFAULT_SELECTION = { color: { colour: true }, satellite: { colour: true }, koppen: { colour: true }, landheightmap: { data: true }, landmask: { data: true } };
const tick = () => new Promise(r => setTimeout(r, 0));

/**
 * Build the panel inside `host` (#exportCard — its close button and title stay) and wire it.
 * `catalogue`: [{ id, label, rows: [{ id, label, tip, colour, data: [{ key, suffix, label, scale, bits }], seasonal, needs }] }]
 * `adapter`: { page, widths(ctx), available(row, ctx), ensure(rows, progress, ctx), begin(W, opts, ctx), produce(rctx,
 * job, progress), end(rctx), names(ctx), about(ctx, opts), options: { hillshade }, koppenClasses, planetFile? }
 * (planetFile, a page that saves its planet whole: { status(ctx) → {ok, note}, save(ctx, progress) → {blob, name} })
 * `onOpen()`: the page's context for this opening (null: nothing to export); `getCenterLon()`: the map view's centre.
 * @returns {{ open(): void, close(): void }}
 */
export function initExportPanel({ host, overlay, catalogue, adapter, onOpen, getCenterLon = () => 0, getProjection = null, storageKey = 'wo-export' }) {
    const page = adapter.page;
    const title = host.querySelector('h3');
    const panel = document.createElement('div');
    panel.className = 'xp';
    panel.innerHTML = `
        <div class="xp-settings">
            <div class="cg"><label>Width <span class="v" id="exportDims"></span></label><select id="exportWidth"></select></div>
            <div class="cg"><label>Projection <span class="tip" data-tip="The map's shape. Equirectangular is the plain 2 : 1 map (the one that re-imports and that most tools expect); the others are drawn from it pixel by pixel. Each has its own options below it">?</span></label><select id="exportProjection"></select></div>
            <div class="cg xp-proj-opts" id="exportProjOpts" hidden></div>
            <div class="cg"><label>Centre longitude <span class="v" id="exportCentreV">0°</span> <span class="tip" data-tip="The longitude in the middle of the map — the map view's Center Longitude when the dialog opens. The file name notes it (-c90E)">?</span></label><input type="range" id="exportCentreLon" min="-180" max="180" step="5" value="0"></div>
            <div class="cg"><label>Season <span class="tip" data-tip="For the maps that change with the seasons (marked ☼): the year's mean, January, July, or all three as separate files">?</span></label><select id="exportSeason"><option value="year">Year</option><option value="jan">January</option><option value="jul">July</option><option value="all">All three</option></select></div>
        </div>
        <div class="xp-head"><span>Map</span><span title="As shown on screen, in its legend's colours">Colour</span><span title="The numbers themselves: a greyscale on a fixed scale (README.txt says which)">Data</span></div>
        <div class="xp-layers" id="exportLayers"></div>
        <div class="xp-options">
            <label class="xp-opt" id="exportShadeRow"><input type="checkbox" id="chkExportShade" checked> Hillshade on the colour maps <span class="tip" data-tip="Shade the Colour Map and the Satellite view by the relief, as on screen. Off, they are flat colour — to lay your own shading over">?</span></label>
            <label class="xp-opt"><input type="checkbox" id="chkExportReadme" checked> README.txt in the ZIP <span class="tip" data-tip="A text file naming every map, its kind, units and scale, the projection and the centre — for whoever opens the files later">?</span></label>
        </div>
        <div class="xp-planet" id="exportPlanet" hidden>
            <div class="xp-planet-text"><span>Planet file <span class="tip" data-tip="The whole history and this detailed moment in one file (.orogen), to open again later without building them again — the same planet in any browser. Its maps are drawn again from it, so later versions of World Orogen can draw them better">?</span></span><small id="exportPlanetNote"></small></div>
            <button class="btn-ghost" id="exportPlanetGo" type="button">Save planet</button>
        </div>
        <div class="xp-progress" id="exportProgress" hidden><div class="xp-bar"><i></i></div><span></span></div>
        <div class="export-actions">
            <button class="btn-ghost xp-small" id="exportNone" type="button">None</button>
            <button class="btn-ghost xp-small" id="exportAllSel" type="button">All</button>
            <span class="xp-spacer"></span>
            <button class="btn-ghost" id="exportCancel" type="button">Cancel</button>
            <button class="btn-primary" id="exportGo" type="button">Export</button>
        </div>`;
    title.after(panel);
    const $ = (id) => panel.querySelector('#' + id);
    const els = { width: $('exportWidth'), dims: $('exportDims'), proj: $('exportProjection'), projOpts: $('exportProjOpts'), centre: $('exportCentreLon'), centreV: $('exportCentreV'),
        season: $('exportSeason'), layers: $('exportLayers'), shadeRow: $('exportShadeRow'), shade: $('chkExportShade'), readme: $('chkExportReadme'),
        progress: $('exportProgress'), go: $('exportGo'), cancel: $('exportCancel'), none: $('exportNone'), all: $('exportAllSel'),
        planet: $('exportPlanet'), planetNote: $('exportPlanetNote'), planetGo: $('exportPlanetGo') };
    if (!adapter.options?.hillshade) els.shadeRow.hidden = true;
    for (const p of PROJECTIONS) { const o = document.createElement('option'); o.value = p.id; o.textContent = p.label; els.proj.appendChild(o); }

    // ── the rows ──
    const rows = [], byId = new Map();
    for (const group of catalogue) {
        const g = document.createElement('div'); g.className = 'xp-group';
        g.innerHTML = `<div class="xp-group-title">${group.label}</div>`;
        for (const row of group.rows) {
            const el = document.createElement('div'); el.className = 'xp-row'; el.dataset.id = row.id;
            const files = row.data && row.data.length > 1 ? `<small>${row.data.map(d => d.suffix).join(' · ')}</small>` : '';
            el.innerHTML = `<span class="xp-name">${row.label}${row.seasonal ? ' <span class="xp-sun" title="Changes with the seasons">☼</span>' : ''}${row.tip ? ` <span class="tip" data-tip="${row.tip.replace(/"/g, '&quot;')}">?</span>` : ''}${files}</span>` +
                `<label class="xp-check">${row.colour ? '<input type="checkbox" data-variant="colour">' : '<i>–</i>'}</label>` +
                `<label class="xp-check">${row.data ? '<input type="checkbox" data-variant="data">' : '<i>–</i>'}</label>`;
            g.appendChild(el);
            const r = { row, el, colour: el.querySelector('[data-variant="colour"]'), data: el.querySelector('[data-variant="data"]') };
            rows.push(r); byId.set(row.id, r);
        }
        els.layers.appendChild(g);
    }

    // ── remembering the choices ──
    const store = { get() { try { return JSON.parse(localStorage.getItem(storageKey + '-' + page) || 'null'); } catch { return null; } },
        set(v) { try { localStorage.setItem(storageKey + '-' + page, JSON.stringify(v)); } catch { /* not remembered */ } } };
    function applySelection(sel) {
        for (const r of rows) { const s = sel?.[r.row.id]; if (r.colour) r.colour.checked = !!s?.colour; if (r.data) r.data.checked = !!s?.data; }
    }
    function selection() {
        const sel = {};
        for (const r of rows) { const s = { colour: !!r.colour?.checked, data: !!r.data?.checked }; if (s.colour || s.data) sel[r.row.id] = s; }
        return sel;
    }
    function remember() { store.set({ sel: selection(), width: els.width.value, season: els.season.value, readme: els.readme.checked, shade: els.shade.checked, projection: els.proj.value, projOpts: projOptValues() }); }

    // ── the projection's own options ──
    let projGet = () => ({});
    function projOptValues() { return projGet(); }
    function buildProjOpts(stored = null) {
        projGet = renderProjectionOptions(els.projOpts, els.proj.value, stored, updateDims);
        updateDims();
    }
    function updateDims() {
        const W = Number(els.width.value) || 0, { w, h } = projectionSize(els.proj.value, W, projOptValues());
        els.dims.textContent = `${w} × ${h}`;
    }

    // ── the jobs: every file the selection asks for ──
    function jobs() {
        const season = els.season.value, seasons = season === 'all' ? ['year', 'jan', 'jul'] : [season], out = [];
        for (const r of rows) {
            if (r.el.classList.contains('xp-off')) continue;
            const ss = r.row.seasonal ? seasons : [null];
            for (const s of ss) {
                if (r.colour?.checked) out.push({ row: r.row, variant: 'colour', season: s, file: null, label: r.row.label });
                if (r.data?.checked) for (const f of r.row.data) out.push({ row: r.row, variant: 'data', season: s, file: f, label: f.label || r.row.label });
            }
        }
        return out;
    }
    function updateGo() {
        const n = jobs().length;
        els.go.textContent = n === 0 ? 'Export' : n === 1 ? 'Export 1 file' : `Export ${n} files as ZIP`; els.go.disabled = n === 0 || busy;
        els.planetGo.disabled = busy || !planetOk;
    }

    // ── wiring ──
    let ctx = null, busy = false, planetOk = false;
    els.layers.addEventListener('change', () => { updateGo(); remember(); });
    els.season.addEventListener('change', () => { updateGo(); remember(); });
    els.width.addEventListener('change', () => { updateDims(); remember(); });
    els.proj.addEventListener('change', () => { buildProjOpts(); remember(); });
    els.projOpts.addEventListener('change', remember);
    els.centre.addEventListener('input', () => { const c = Number(els.centre.value); els.centreV.textContent = c ? `${Math.abs(c)}°${c > 0 ? 'E' : 'W'}` : '0°'; });
    els.readme.addEventListener('change', remember); els.shade.addEventListener('change', remember);
    els.none.addEventListener('click', () => { applySelection({}); updateGo(); remember(); });
    els.all.addEventListener('click', () => { for (const r of rows) { if (r.el.classList.contains('xp-off')) continue; if (r.colour) r.colour.checked = true; if (r.data) r.data.checked = true; } updateGo(); remember(); });
    const progress = (p, text) => { els.progress.hidden = false; els.progress.querySelector('i').style.width = `${Math.round(100 * Math.min(1, Math.max(0, p)))}%`; els.progress.querySelector('span').textContent = text; };

    function open() {
        ctx = onOpen ? onOpen() : {};
        if (ctx === null) return;
        const saved = store.get();
        // the widths this page offers now
        const widths = adapter.widths(ctx), want = saved?.width && widths.some(x => String(x.w) === String(saved.width) && !x.disabled) ? String(saved.width) : String((widths.find(x => x.selected) || widths.find(x => !x.disabled) || widths[0]).w);
        els.width.innerHTML = widths.map(x => `<option value="${x.w}"${x.disabled ? ' disabled' : ''}>${x.label || x.w}</option>`).join('');
        els.width.value = want;
        // the rows this page can draw now
        for (const r of rows) {
            const ok = adapter.available ? adapter.available(r.row, ctx) : true;
            r.el.classList.toggle('xp-off', !ok);
            r.el.title = ok ? '' : (r.row.needs === 'climate' ? 'Needs the moment\'s climate (Add detail first)' : 'Not available here');
            for (const c of [r.colour, r.data]) if (c) c.disabled = !ok;
        }
        applySelection(saved?.sel || DEFAULT_SELECTION);
        els.season.value = saved?.season || 'year';
        els.readme.checked = saved?.readme !== false;
        els.shade.checked = saved?.shade !== false;
        // (the map view's projection when it shows one; else the one chosen last)
        const vp = getProjection ? getProjection() : null;
        if (vp && vp.id && vp.id !== 'equirect') { els.proj.value = vp.id; buildProjOpts(vp.opts || null); }
        else { els.proj.value = saved?.projection && PROJECTIONS.some(p => p.id === saved.projection) ? saved.projection : 'equirect'; buildProjOpts(saved?.projOpts || null); }
        const c = Math.round(getCenterLon() || 0);
        els.centre.value = String(c); els.centreV.textContent = c ? `${Math.abs(c)}°${c > 0 ? 'E' : 'W'}` : '0°';
        els.progress.hidden = true;
        // (the planet file, where the page saves one: whether it can now, and what it would hold)
        els.planet.hidden = !adapter.planetFile;
        if (adapter.planetFile) { const st = adapter.planetFile.status(ctx); planetOk = st.ok; els.planetNote.textContent = st.note; }
        if (adapter.titleNote) title.querySelector('.xp-note')?.remove(), title.insertAdjacentHTML('beforeend', ` <span class="xp-note evo-export-moment">${adapter.titleNote(ctx)}</span>`);
        updateGo();
        overlay.classList.remove('hidden');
    }
    function close() { if (busy) return; overlay.classList.add('hidden'); ctx = null; }
    host.querySelector('#exportClose').addEventListener('click', close);
    els.cancel.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !overlay.classList.contains('hidden')) close(); });

    // ── the run ──
    els.go.addEventListener('click', async () => {
        if (busy) return;
        const list = jobs(); if (!list.length) return;
        busy = true; els.go.disabled = true; els.cancel.disabled = true;
        const W = Number(els.width.value), centerLon = Number(els.centre.value), projection = els.proj.value, projOpts = projOptValues();
        const opts = { width: W, centerLon, season: els.season.value, hillshade: !adapter.options?.hillshade || els.shade.checked, projection, projOpts };
        const t0 = performance.now();
        try {
            progress(0, 'Starting…'); await tick();
            const needing = [...new Set(list.map(j => j.row).filter(r => r.needs))];
            if (needing.length && adapter.ensure) await adapter.ensure(needing, progress, ctx);
            const rctx = await adapter.begin(W, opts, ctx);
            const files = [], meta = [], n = list.length, prefix = adapter.names(ctx, opts);
            try {
                for (let i = 0; i < n; i++) {
                    const job = list[i], what = `${job.label}${job.season ? ` (${SEASON_NAMES[job.season]})` : ''}`;
                    const sub = (p, text) => progress((i + 0.8 * p) / (n + 0.3), `${what} — ${text} (${i + 1} of ${n})`);
                    sub(0, 'drawing'); await tick();
                    let layer = await adapter.produce(rctx, job, sub);
                    if (job.file?.bits === 8 && layer.kind === 'gray16') layer = { ...layer, kind: 'gray8', data: gray16to8(layer.data) };
                    if (projection !== 'equirect') { sub(0.6, 'projecting'); await tick(); layer = projectLayer(layer, projection, projOpts); }
                    sub(0.8, 'encoding PNG'); await tick();
                    const blob = layer.kind === 'rgba' ? (layer.alpha ? await encodeRgbaPng(layer.W, layer.H, layer.data) : await encodeRgbPng(layer.W, layer.H, layer.data))
                        : await encodeGrayPng(layer.W, layer.H, layer.data, layer.kind === 'gray8' ? 8 : 16);
                    const name = fileName([...prefix.start, job.row.id === 'color' ? 'colormap' : job.row.id, job.season, job.file?.suffix, job.variant === 'data' && job.row.colour ? 'data' : null, ...prefix.end]);
                    files.push({ name, blob }); meta.push({ name, label: job.label, season: job.season, file: job.file, kind: layer.kind, W: layer.W, H: layer.H });
                    layer = null; await tick();
                }
            } finally { if (adapter.end) await adapter.end(rctx); }
            let out, name;
            if (files.length === 1 && !(els.readme.checked && false)) { out = files[0].blob; name = files[0].name; }
            else {
                progress(n / (n + 0.3), 'Packing the ZIP…'); await tick();
                if (els.readme.checked) {
                    const { w, h } = projectionSize(projection, W, projOpts), P = PROJECTIONS.find(p => p.id === projection);
                    const about = { ...adapter.about(ctx, opts), width: w, height: h, projection: P.label, projectionNote: P.note, centerLon, hillshade: adapter.options?.hillshade ? opts.hillshade : null };
                    files.push({ name: 'README.txt', blob: new Blob([readmeText(about, meta, adapter.koppenClasses)], { type: 'text/plain' }) });
                }
                out = await zipFiles(files); name = fileName([...prefix.start, 'export', ...prefix.end], 'zip');
            }
            downloadBlob(out, name);
            progress(1, `Saved ${name} · ${(out.size / 2 ** 20).toFixed(1)} MB in ${((performance.now() - t0) / 1000).toFixed(0)} s`);
        } catch (err) {
            progress(0, `Could not export: ${String(err && err.message || err).split('\n')[0]}`);
            console.error(err);
        } finally { busy = false; els.cancel.disabled = false; updateGo(); }
    });

    // ── the planet file: the page's own save, beside the maps ──
    els.planetGo.addEventListener('click', async () => {
        if (busy || !planetOk || !adapter.planetFile) return;
        busy = true; els.cancel.disabled = true; updateGo();
        const t0 = performance.now();
        try {
            progress(0, 'Starting…'); await tick();
            const { blob, name } = await adapter.planetFile.save(ctx, progress);
            downloadBlob(blob, name);
            progress(1, `Saved ${name} · ${(blob.size / 2 ** 20).toFixed(1)} MB in ${((performance.now() - t0) / 1000).toFixed(0)} s`);
        } catch (err) {
            progress(0, `Could not save the planet: ${String(err && err.message || err).split('\n')[0]}`);
            console.error(err);
        } finally { busy = false; els.cancel.disabled = false; updateGo(); }
    });

    return { open, close };
}
