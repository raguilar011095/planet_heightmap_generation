// Import page entry point — handles heightmap file upload, import dispatch,
// terrain sculpting reapply, and all visualization wiring.

import * as THREE from 'three';
import { renderer, scene, camera, ctrl, waterMesh, atmosMesh, starsMesh,
         mapCamera, updateMapCameraFrustum, mapCtrl, canvas,
         tickZoom, tickMapZoom } from './scene.js';
import { state } from './state.js';
import { importHeightmap, reapplyViaWorker, computeClimateViaWorker } from './generate.js';
import { buildMesh, updateMeshColors, buildMapMesh, rebuildGrids, exportMap, exportMapBatch, buildWindArrows, buildOceanCurrentArrows, updateKoppenHoverHighlight, updateMapKoppenHoverHighlight } from './planet-mesh.js';
import { detailFromSlider } from './detail-scale.js';
import { KOPPEN_CLASSES } from './koppen.js';
import { elevationToColor } from './color-map.js';

// ─── File Upload ──────────────────────────────────────────────────

const fileInput = document.getElementById('heightmapFile');
const fileNameEl = document.getElementById('importFileName');
const previewCanvas = document.getElementById('importPreview');
const importDimsEl = document.getElementById('importDims');
const importBtn = document.getElementById('importBtn');

let storedGrayscale = null;
let storedWidth = 0;
let storedHeight = 0;

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    fileNameEl.textContent = file.name;
    const reader = new FileReader();
    reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
            storedWidth = img.width;
            storedHeight = img.height;
            // Draw full-res to offscreen canvas for grayscale extraction
            const offscreen = document.createElement('canvas');
            offscreen.width = img.width;
            offscreen.height = img.height;
            const offCtx = offscreen.getContext('2d');
            offCtx.drawImage(img, 0, 0);
            // Draw scaled preview to visible canvas
            const previewW = Math.min(img.width, 400);
            const previewH = Math.round(previewW * img.height / img.width);
            previewCanvas.width = previewW;
            previewCanvas.height = previewH;
            const ctx = previewCanvas.getContext('2d');
            ctx.drawImage(img, 0, 0, previewW, previewH);
            previewCanvas.style.display = 'block';
            importDimsEl.textContent = `${img.width} × ${img.height}`;
            importDimsEl.style.display = 'block';
            const expectEl = document.getElementById('importExpect');
            if (expectEl) expectEl.style.display = 'block';
            // Extract grayscale from RGBA via luminance — no normalization.
            // Convention: black (0) = ocean, brighter = higher elevation.
            const data = offCtx.getImageData(0, 0, img.width, img.height).data;
            const numPx = img.width * img.height;
            storedGrayscale = new Uint8Array(numPx);
            for (let i = 0; i < numPx; i++) {
                const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
                storedGrayscale[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
            }
            importBtn.disabled = false;
        };
        img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
});

// ─── Detail slider ────────────────────────────────────────────────

const AUTO_CLIMATE_THRESHOLD = 300000;
const WARN_ORANGE = state.isTouchDevice ? 200000 : 640000;
const WARN_RED    = state.isTouchDevice ? 500000 : 1280000;

function shouldSkipClimate() {
    return detailFromSlider(+document.getElementById('sN').value) > AUTO_CLIMATE_THRESHOLD;
}

function updateDetailWarning(detail) {
    const cg = document.getElementById('sN').closest('.cg');
    const warn = document.getElementById('detailWarn');
    cg.classList.remove('detail-orange', 'detail-red');
    warn.className = 'detail-warn';
    if (detail > WARN_RED) {
        cg.classList.add('detail-red');
        warn.classList.add('red');
        warn.textContent = '\u26A0 Very high \u2014 generation may be slow and unstable';
    } else if (detail > WARN_ORANGE) {
        cg.classList.add('detail-orange');
        warn.classList.add('orange');
        warn.textContent = '\u26A0 High detail \u2014 generation may be slow and unstable';
    } else {
        warn.textContent = '';
    }
}

// Slider tooltip
function initSliderTooltip(slider) {
    const cg = slider.closest('.cg');
    if (!cg) return;
    cg.style.position = 'relative';
    const tip = document.createElement('div');
    tip.className = 'slider-tooltip';
    cg.appendChild(tip);
    function positionTip() {
        const pct = (+slider.value - +slider.min) / (+slider.max - +slider.min);
        tip.style.left = (pct * slider.offsetWidth) + 'px';
    }
    slider.addEventListener('pointerdown', () => {
        const vEl = document.getElementById(slider.id.replace('s', 'v'));
        if (vEl) tip.textContent = vEl.textContent;
        positionTip();
        tip.classList.add('visible');
    });
    slider.addEventListener('input', () => {
        const vEl = document.getElementById(slider.id.replace('s', 'v'));
        if (vEl) tip.textContent = vEl.textContent;
        positionTip();
    });
    const hide = () => tip.classList.remove('visible');
    slider.addEventListener('pointerup', hide);
    slider.addEventListener('pointercancel', hide);
}

// Wire sliders
for (const [s, v] of [['sN','vN'],['sTw','vTw'],['sS','vS'],['sGl','vGl'],['sHEr','vHEr'],['sTEr','vTEr'],['sRs','vRs']]) {
    const slider = document.getElementById(s);
    if (!slider) continue;
    initSliderTooltip(slider);
    slider.addEventListener('input', e => {
        if (s === 'sN') {
            const detail = detailFromSlider(+e.target.value);
            document.getElementById(v).textContent = detail.toLocaleString();
            updateDetailWarning(detail);
        } else {
            document.getElementById(v).textContent = e.target.value;
        }
        if (s === 'sTw' || s === 'sS' || s === 'sGl' || s === 'sHEr' || s === 'sTEr' || s === 'sRs') {
            markReapplyPending();
        }
    });
}

// ─── Reapply ──────────────────────────────────────────────────────

const reapplyBtn = document.getElementById('reapplyBtn');

function markReapplyPending() {
    if (!state.curData) return; // only after first import
    reapplyBtn.disabled = false;
    reapplyBtn.classList.add('ready');
}

function clearReapplyPending() {
    reapplyBtn.disabled = true;
    reapplyBtn.classList.remove('ready');
}

function reapplyPostProcessing() {
    const d = state.curData;
    if (!d || !d.prePostElev) return;
    const skipClimate = shouldSkipClimate();
    reapplyViaWorker(() => {
        reapplyBtn.classList.remove('spinning');
        if (skipClimate && CLIMATE_LAYERS.has(state.debugLayer)) {
            state.debugLayer = '';
            if (debugLayerEl) debugLayerEl.value = '';
            syncTabsToLayer('');
            updateMeshColors();
            updateLegend('');
        }
    }, skipClimate);
}

reapplyBtn.addEventListener('click', () => {
    if (reapplyBtn.disabled) return;
    clearReapplyPending();
    reapplyBtn.classList.add('spinning');
    reapplyPostProcessing();
});

// ─── Import button ────────────────────────────────────────────────

importBtn.addEventListener('click', () => {
    if (!storedGrayscale) return;
    importBtn.disabled = true;
    importBtn.textContent = 'Importing\u2026';
    clearReapplyPending();
    buildWindArrows(null);
    buildOceanCurrentArrows(null);
    showBuildOverlay();
    // Collapse bottom sheet on mobile
    const ui = document.getElementById('ui');
    if (window.innerWidth <= 768 && ui) ui.classList.add('collapsed');
    // Copy grayscale since the buffer will be transferred
    const grayCopy = new Uint8Array(storedGrayscale);
    importHeightmap(grayCopy, storedWidth, storedHeight, onProgress, shouldSkipClimate());
});

// Generate-done handler (fired from generate.js after 'done' message)
const genBtn = document.getElementById('importBtn');
// The generate.js dispatches 'generate-done' on #generate, but for import page
// we use the same element ID pattern. Actually generate.js dispatches on
// document.getElementById('generate'). Since import page has no #generate,
// we need to listen on the actual element. Let me check...
// Actually, generate.js does: document.getElementById('generate').dispatchEvent(...)
// Since import page doesn't have a #generate element, we need a workaround.
// The cleanest approach: add a hidden #generate element, or listen differently.

// For now, we'll create a hidden generate button to receive the event
const hiddenGenBtn = document.createElement('button');
hiddenGenBtn.id = 'generate';
hiddenGenBtn.style.display = 'none';
document.body.appendChild(hiddenGenBtn);

hiddenGenBtn.addEventListener('generate-done', () => {
    hideBuildOverlay();
    importBtn.disabled = false;
    importBtn.textContent = 'Import';
    state.importedHeightmap = true;
    // Update info text
    const infoEl = document.getElementById('info');
    if (infoEl) infoEl.textContent = 'Drag to rotate \u00b7 Scroll to zoom';
    // Sync view
    if (!state.climateComputed && CLIMATE_LAYERS.has(state.debugLayer)) {
        state.debugLayer = '';
        if (debugLayerEl) debugLayerEl.value = '';
        syncTabsToLayer('');
        updateMeshColors();
    }
    syncTabsToLayer(state.debugLayer);
    if (debugLayerEl) debugLayerEl.value = state.debugLayer;
    updateLegend(state.debugLayer);
    // Rebuild arrows if needed
    const v = state.debugLayer;
    const isWindLayer = v === 'pressureSummer' || v === 'pressureWinter' ||
                        v === 'windSpeedSummer' || v === 'windSpeedWinter';
    const isOceanLayer = v === 'oceanCurrentSummer' || v === 'oceanCurrentWinter';
    if (isWindLayer) buildWindArrows(v.includes('Winter') ? 'winter' : 'summer');
    else if (isOceanLayer) buildOceanCurrentArrows(v.includes('Winter') ? 'winter' : 'summer');
});

// ─── Climate layers ───────────────────────────────────────────────

const CLIMATE_LAYERS = new Set([
    'pressureSummer', 'pressureWinter',
    'windSpeedSummer', 'windSpeedWinter',
    'oceanCurrentSummer', 'oceanCurrentWinter',
    'precipSummer', 'precipWinter',
    'rainShadowSummer', 'rainShadowWinter',
    'tempSummer', 'tempWinter',
    'koppen', 'biome', 'continentality'
]);

// ─── Visualization (debug layers, tabs, legend) ───────────────────

const mapTabs = document.getElementById('mapTabs');
const vizLegend = document.getElementById('vizLegend');
const debugLayerEl = document.getElementById('debugLayer');

function switchVisualization(layer) {
    if (CLIMATE_LAYERS.has(layer) && !state.climateComputed) {
        showBuildOverlay();
        computeClimateViaWorker(onProgress, () => {
            hideBuildOverlay();
            applyLayer(layer);
        });
        return;
    }
    applyLayer(layer);
}

function applyLayer(layer) {
    state.debugLayer = layer;
    state.hoveredKoppen = -1;
    updateMeshColors();
    const isWindLayer = layer === 'pressureSummer' || layer === 'pressureWinter' ||
                        layer === 'windSpeedSummer' || layer === 'windSpeedWinter';
    const isOceanLayer = layer === 'oceanCurrentSummer' || layer === 'oceanCurrentWinter';
    if (isOceanLayer) {
        buildWindArrows(null);
        buildOceanCurrentArrows(layer.includes('Winter') ? 'winter' : 'summer');
    } else if (isWindLayer) {
        buildOceanCurrentArrows(null);
        buildWindArrows(layer.includes('Winter') ? 'winter' : 'summer');
    } else {
        buildWindArrows(null);
        buildOceanCurrentArrows(null);
    }
    updateLegend(layer);
}

function syncTabsToLayer(layer) {
    mapTabs.querySelectorAll('.map-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.layer === layer);
    });
    const mvs = document.getElementById('mobileViewSwitch');
    if (mvs && [...mvs.options].some(o => o.value === layer)) {
        mvs.value = layer;
    }
}

mapTabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.map-tab');
    if (!tab) return;
    const layer = tab.dataset.layer;
    mapTabs.querySelectorAll('.map-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    if (debugLayerEl) debugLayerEl.value = layer;
    const mvs = document.getElementById('mobileViewSwitch');
    if (mvs) mvs.value = layer;
    switchVisualization(layer);
});

const mobileViewSwitch = document.getElementById('mobileViewSwitch');
if (mobileViewSwitch) {
    mobileViewSwitch.addEventListener('change', (e) => {
        const layer = e.target.value;
        syncTabsToLayer(layer);
        if (debugLayerEl) debugLayerEl.value = layer;
        switchVisualization(layer);
    });
}

if (debugLayerEl) {
    debugLayerEl.addEventListener('change', (e) => {
        const layer = e.target.value;
        syncTabsToLayer(layer);
        switchVisualization(layer);
    });
}

// ─── Legend ────────────────────────────────────────────────────────

const KOPPEN_DESCRIPTIONS = {
    Af:  'Tropical rainforest \u2014 Hot and wet year-round.',
    Am:  'Tropical monsoon \u2014 Brief dry season offset by heavy monsoon rains.',
    Aw:  'Tropical savanna \u2014 Distinct wet and dry seasons.',
    BWh: 'Hot desert \u2014 Extremely dry with scorching summers.',
    BWk: 'Cold desert \u2014 Arid with cold winters.',
    BSh: 'Hot steppe \u2014 Semi-arid grassland with hot summers.',
    BSk: 'Cold steppe \u2014 Semi-arid with cold winters.',
    Cfa: 'Humid subtropical \u2014 Hot humid summers, mild winters.',
    Cfb: 'Oceanic \u2014 Mild year-round, cool summers, frequent rain.',
    Cfc: 'Subpolar oceanic \u2014 Cool year-round with short summers.',
    Csa: 'Hot-summer Mediterranean \u2014 Dry hot summers, mild wet winters.',
    Csb: 'Warm-summer Mediterranean \u2014 Dry warm summers, mild wet winters.',
    Csc: 'Cold-summer Mediterranean \u2014 Cool dry summers, mild wet winters.',
    Cwa: 'Humid subtropical monsoon \u2014 Warm with dry winters.',
    Cwb: 'Subtropical highland \u2014 Mild with dry winters.',
    Cwc: 'Cold subtropical highland \u2014 Cool with dry winters.',
    Dfa: 'Hot-summer continental \u2014 Hot summers, cold snowy winters.',
    Dfb: 'Warm-summer continental \u2014 Warm summers, cold winters.',
    Dfc: 'Subarctic \u2014 Long cold winters, brief cool summers.',
    Dfd: 'Extremely cold subarctic \u2014 Harshest winters on Earth.',
    Dsa: 'Hot-summer continental, dry summer.',
    Dsb: 'Warm-summer continental, dry summer.',
    Dsc: 'Subarctic, dry summer.',
    Dsd: 'Extremely cold subarctic, dry summer.',
    Dwa: 'Hot-summer continental, monsoon.',
    Dwb: 'Warm-summer continental, monsoon.',
    Dwc: 'Subarctic monsoon \u2014 Brief wet summers, long frigid winters.',
    Dwd: 'Extremely cold subarctic, monsoon.',
    ET:  'Tundra \u2014 Permafrost, only warmest month above 0\u00b0C.',
    EF:  'Ice cap \u2014 Permanent ice, never above 0\u00b0C.',
};

function updateLegend(layer) {
    if (!vizLegend) return;
    if (layer === '' || !layer) {
        const stops = [
            { e: -0.50 }, { e: -0.25 }, { e: -0.05 }, { e: 0.00 },
            { e: 0.03 }, { e: 0.15 }, { e: 0.35 }, { e: 0.55 }, { e: 0.80 }
        ];
        const colors = stops.map(s => {
            const [r, g, b] = elevationToColor(s.e);
            return `rgb(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)})`;
        });
        const pcts = stops.map((_, i) => Math.round(i / (stops.length - 1) * 100));
        const gradStr = colors.map((c, i) => `${c} ${pcts[i]}%`).join(', ');
        vizLegend.innerHTML = `<div class="legend-gradient" style="background:linear-gradient(to right,${gradStr})"></div>` +
            `<div class="legend-labels"><span>Deep Ocean</span><span>Sea Level</span><span>Peak</span></div>`;
    } else if (layer === 'koppen') {
        let html = '<div class="legend-koppen-header"><a href="https://en.wikipedia.org/wiki/K%C3%B6ppen_climate_classification" target="_blank" rel="noopener">K\u00f6ppen climate classification</a></div>';
        html += '<div class="legend-koppen">';
        for (let i = 1; i < KOPPEN_CLASSES.length; i++) {
            const k = KOPPEN_CLASSES[i];
            const [r, g, b] = k.color;
            const hex = `rgb(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)})`;
            html += `<div class="legend-koppen-item" data-code="${k.code}"><span class="legend-koppen-swatch" style="background:${hex}"></span>${k.code}</div>`;
        }
        html += '<div class="legend-koppen-tooltip" id="koppenTip"></div>';
        html += '</div>';
        vizLegend.innerHTML = html;
        const tipEl = document.getElementById('koppenTip');
        const container = vizLegend.querySelector('.legend-koppen');
        vizLegend.querySelectorAll('.legend-koppen-item').forEach(item => {
            item.addEventListener('mouseenter', () => {
                const code = item.dataset.code;
                tipEl.textContent = KOPPEN_DESCRIPTIONS[code] || '';
                tipEl.classList.add('visible');
                const itemRect = item.getBoundingClientRect();
                const containerRect = container.getBoundingClientRect();
                const tipWidth = 240;
                let left = itemRect.left - containerRect.left + itemRect.width / 2 - tipWidth / 2;
                left = Math.max(0, Math.min(left, containerRect.width - tipWidth));
                tipEl.style.left = left + 'px';
                tipEl.style.bottom = (containerRect.bottom - itemRect.top + 6) + 'px';
                const classId = KOPPEN_CLASSES.findIndex(c => c.code === code);
                if (classId >= 0) {
                    state.hoveredKoppen = classId;
                    updateKoppenHoverHighlight();
                    updateMapKoppenHoverHighlight();
                }
            });
            item.addEventListener('mouseleave', () => {
                tipEl.classList.remove('visible');
                state.hoveredKoppen = -1;
                updateKoppenHoverHighlight();
                updateMapKoppenHoverHighlight();
            });
        });
    } else if (layer === 'biome') {
        const biomeStops = [
            { color: [0.82,0.72,0.50], label: 'Desert' },
            { color: [0.72,0.62,0.30], label: 'Steppe' },
            { color: [0.42,0.50,0.18], label: 'Savanna' },
            { color: [0.12,0.38,0.10], label: 'Forest' },
            { color: [0.06,0.22,0.08], label: 'Taiga' },
            { color: [0.35,0.32,0.22], label: 'Tundra' },
            { color: [0.78,0.80,0.84], label: 'Ice' },
        ];
        const biomeColors = biomeStops.map(s => `rgb(${Math.round(s.color[0]*255)},${Math.round(s.color[1]*255)},${Math.round(s.color[2]*255)})`);
        const biomePcts = biomeStops.map((_, i) => Math.round(i / (biomeStops.length - 1) * 100));
        const biomeGrad = biomeColors.map((c, i) => `${c} ${biomePcts[i]}%`).join(', ');
        vizLegend.innerHTML = `<div class="legend-gradient" style="background:linear-gradient(to right,${biomeGrad})"></div>` +
            `<div class="legend-labels"><span>${biomeStops[0].label}</span><span>${biomeStops[3].label}</span><span>${biomeStops[6].label}</span></div>`;
    } else if (layer === 'rainShadowSummer' || layer === 'rainShadowWinter') {
        vizLegend.innerHTML = `<div class="legend-gradient" style="background:linear-gradient(to right,rgb(230,51,33) 0%,rgb(140,140,148) 50%,rgb(38,102,243) 100%)"></div>` +
            `<div class="legend-labels"><span>Rain Shadow</span><span>Neutral</span><span>Windward</span></div>`;
    } else if (layer === 'landheightmap') {
        vizLegend.innerHTML = `<div class="legend-gradient" style="background:linear-gradient(to right,#000 0%,#fff 100%)"></div>` +
            `<div class="legend-labels"><span>Ocean / Sea Level</span><span>Peak</span></div>`;
    } else {
        vizLegend.innerHTML = '';
    }
}

// ─── Build overlay ────────────────────────────────────────────────

const buildOverlay  = document.getElementById('buildOverlay');
const buildBarFill  = document.getElementById('buildBarFill');
const buildBarLabel = document.getElementById('buildBarLabel');
let overlayActive = false;

function onProgress(pct, label) {
    if (!overlayActive) return;
    if (buildBarFill) buildBarFill.style.transform = 'scaleX(' + (pct / 100) + ')';
    if (buildBarLabel) buildBarLabel.textContent = label;
}

function showBuildOverlay() {
    if (!buildBarFill || !buildOverlay) return;
    buildBarFill.style.transition = 'none';
    buildBarFill.style.transform = 'scaleX(0)';
    buildBarLabel.textContent = '';
    buildBarFill.offsetWidth;
    buildBarFill.style.transition = '';
    overlayActive = true;
    buildOverlay.classList.remove('hidden');
}

function hideBuildOverlay() {
    setTimeout(() => {
        overlayActive = false;
        if (buildOverlay) {
            buildOverlay.classList.add('hidden');
            buildOverlay.classList.remove('initial');
        }
    }, 500);
}

// ─── View mode ────────────────────────────────────────────────────

document.getElementById('chkWire').addEventListener('change', buildMesh);

const gridSpacingGroup = document.getElementById('gridSpacingGroup');
document.getElementById('chkGrid').addEventListener('change', (e) => {
    state.gridEnabled = e.target.checked;
    gridSpacingGroup.style.display = state.gridEnabled ? '' : 'none';
    if (state.mapMode) {
        if (state.mapGridMesh) state.mapGridMesh.visible = state.gridEnabled;
        if (state.globeGridMesh) state.globeGridMesh.visible = false;
    } else {
        if (state.globeGridMesh) state.globeGridMesh.visible = state.gridEnabled;
        if (state.mapGridMesh) state.mapGridMesh.visible = false;
    }
});

document.getElementById('gridSpacing').addEventListener('change', (e) => {
    state.gridSpacing = parseFloat(e.target.value);
    rebuildGrids();
});

// Map center longitude
const mapCenterLonGroup = document.getElementById('mapCenterLonGroup');
const sMapCenterLon = document.getElementById('sMapCenterLon');
const vMapCenterLon = document.getElementById('vMapCenterLon');

sMapCenterLon.addEventListener('input', () => {
    const lon = +sMapCenterLon.value;
    const suffix = lon > 0 ? 'E' : lon < 0 ? 'W' : '';
    vMapCenterLon.textContent = Math.abs(lon) + '\u00B0' + suffix;
    state.mapCenterLon = lon * Math.PI / 180;
    if (state.mapMode && state.mapMesh) {
        const builtLon = state.mapMesh._builtCenterLon || 0;
        const dx = (builtLon - state.mapCenterLon) * (2 / Math.PI);
        state.mapMesh.position.x = dx;
        if (state.mapGridMesh) state.mapGridMesh.position.x = dx;
    }
});

sMapCenterLon.addEventListener('change', () => {
    if (state.mapMode) {
        buildMapMesh();
        const layer = state.debugLayer;
        const isWind = layer === 'pressureSummer' || layer === 'pressureWinter' ||
                       layer === 'windSpeedSummer' || layer === 'windSpeedWinter';
        const isOcean = layer === 'oceanCurrentSummer' || layer === 'oceanCurrentWinter';
        if (isWind) buildWindArrows(layer.includes('Winter') ? 'winter' : 'summer');
        if (isOcean) buildOceanCurrentArrows(layer.includes('Winter') ? 'winter' : 'summer');
    }
});

// Globe / Map toggle
document.getElementById('viewMode').addEventListener('change', (e) => {
    state.mapMode = e.target.value === 'map';
    if (state.mapMode) {
        if (state.planetMesh) state.planetMesh.visible = false;
        waterMesh.visible = false;
        atmosMesh.visible = false;
        starsMesh.visible = false;
        if (state.wireMesh) state.wireMesh.visible = false;
        if (state.arrowGroup) state.arrowGroup.visible = false;
        if (!state.mapMesh) {
            showBuildOverlay();
            onProgress(0, 'Building map mesh\u2026');
            setTimeout(() => {
                buildMapMesh();
                if (state.mapMesh) state.mapMesh.visible = true;
                hideBuildOverlay();
            }, 50);
        }
        if (state.mapMesh) state.mapMesh.visible = true;
        if (state.mapGridMesh) state.mapGridMesh.visible = state.gridEnabled;
        if (state.globeGridMesh) state.globeGridMesh.visible = false;
        if (state.windArrowGroup) {
            state.windArrowGroup.traverse(c => {
                if (c.name === 'windGlobe') c.visible = false;
                if (c.name === 'windMap') c.visible = true;
            });
        }
        if (state.oceanCurrentArrowGroup) {
            state.oceanCurrentArrowGroup.traverse(c => {
                if (c.name === 'oceanGlobe') c.visible = false;
                if (c.name === 'oceanMap') c.visible = true;
            });
        }
        scene.background = new THREE.Color(0x1a1a2e);
        ctrl.enabled = false;
        mapCtrl.enabled = true;
        mapCamera.position.set(0, 0, 5);
        mapCamera.lookAt(0, 0, 0);
        updateMapCameraFrustum();
        mapCtrl.target.set(0, 0, 0);
        mapCtrl.update();
        mapCenterLonGroup.style.display = '';
    } else {
        if (state.planetMesh) state.planetMesh.visible = true;
        atmosMesh.visible = true;
        starsMesh.visible = true;
        if (state.wireMesh) state.wireMesh.visible = true;
        if (state.arrowGroup) state.arrowGroup.visible = true;
        if (state.mapMesh) state.mapMesh.visible = false;
        if (state.mapGridMesh) state.mapGridMesh.visible = false;
        if (state.globeGridMesh) state.globeGridMesh.visible = state.gridEnabled;
        if (state.windArrowGroup) {
            state.windArrowGroup.traverse(c => {
                if (c.name === 'windGlobe') c.visible = true;
                if (c.name === 'windMap') c.visible = false;
            });
        }
        if (state.oceanCurrentArrowGroup) {
            state.oceanCurrentArrowGroup.traverse(c => {
                if (c.name === 'oceanGlobe') c.visible = true;
                if (c.name === 'oceanMap') c.visible = false;
            });
        }
        waterMesh.visible = !state.debugLayer;
        scene.background = new THREE.Color(0x030308);
        mapCtrl.enabled = false;
        ctrl.enabled = true;
        mapCenterLonGroup.style.display = 'none';
    }
});

// ─── Export modal ─────────────────────────────────────────────────

(function initExport() {
    const overlay   = document.getElementById('exportOverlay');
    const closeBtn  = document.getElementById('exportClose');
    const cancelBtn = document.getElementById('exportCancel');
    const goBtn     = document.getElementById('exportGo');
    const widthEl   = document.getElementById('exportWidth');
    const dimsEl    = document.getElementById('exportDims');
    const typeEl    = document.getElementById('exportType');
    const openBtn   = document.getElementById('exportBtn');

    function updateDims() {
        const w = +widthEl.value;
        dimsEl.textContent = w + ' \u00D7 ' + (w / 2);
    }

    function openModal() {
        overlay.classList.remove('hidden');
        updateDims();
        for (const opt of typeEl.options) {
            if (opt.value === 'biome' || opt.value === 'koppen') {
                opt.disabled = !state.climateComputed;
                if (opt.disabled && typeEl.value === opt.value) typeEl.value = 'color';
            }
        }
    }
    function closeModal() { overlay.classList.add('hidden'); }

    openBtn.addEventListener('click', openModal);
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !overlay.classList.contains('hidden')) closeModal();
    });
    widthEl.addEventListener('change', updateDims);

    goBtn.addEventListener('click', async () => {
        const type = typeEl.value;
        const w = +widthEl.value;
        closeModal();
        showBuildOverlay();
        onProgress(0, 'Preparing export...');
        await exportMap(type, w, onProgress);
        hideBuildOverlay();
    });

    const exportAllBtn = document.getElementById('exportAllGo');
    const EXPORT_ALL_TYPES = [
        { type: 'biome',         label: 'Satellite' },
        { type: 'koppen',        label: 'Climate' },
        { type: 'landheightmap', label: 'Heightmap' },
        { type: 'landmask',      label: 'Land Mask' },
    ];

    exportAllBtn.addEventListener('click', async () => {
        const w = +widthEl.value;
        closeModal();
        showBuildOverlay();
        if (!state.climateComputed) {
            onProgress(0, 'Computing climate...');
            await new Promise(resolve => computeClimateViaWorker(onProgress, resolve));
        }
        await exportMapBatch(EXPORT_ALL_TYPES, w, onProgress);
        hideBuildOverlay();
    });
})();

// ─── Sidebar toggle + bottom sheet ────────────────────────────────

const sidebarToggle = document.getElementById('sidebarToggle');
const uiPanel = document.getElementById('ui');
const isMobileLayout = () => window.innerWidth <= 768;

if (isMobileLayout()) {
    uiPanel.classList.add('collapsed');
}

sidebarToggle.addEventListener('click', () => {
    const collapsed = uiPanel.classList.toggle('collapsed');
    sidebarToggle.innerHTML = collapsed ? '\u00BB' : '\u00AB';
    sidebarToggle.title = collapsed ? 'Show panel' : 'Collapse panel';
});

(function initBottomSheet() {
    const handle = document.getElementById('sheetHandle');
    if (!handle) return;
    let startY = 0, startTransform = 0, dragging = false;
    let lastY = 0, lastTime = 0, velocity = 0;
    let didDrag = false;
    let rafId = 0, pendingY = null;

    function getTranslateY() {
        const st = getComputedStyle(uiPanel);
        const m = new DOMMatrix(st.transform);
        return m.m42;
    }
    function getCollapsedY() { return uiPanel.offsetHeight - 60; }
    function applyTransform() {
        if (pendingY !== null) { uiPanel.style.transform = `translateY(${pendingY}px)`; pendingY = null; }
        rafId = 0;
    }
    function scheduleTransform(y) {
        pendingY = y;
        if (!rafId) rafId = requestAnimationFrame(applyTransform);
    }
    function cleanup() {
        dragging = false;
        uiPanel.style.transition = '';
        uiPanel.classList.remove('dragging');
        if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
        pendingY = null;
    }

    handle.addEventListener('pointerdown', (e) => {
        if (!isMobileLayout()) return;
        e.preventDefault();
        handle.setPointerCapture(e.pointerId);
        dragging = true; didDrag = false;
        startY = e.clientY; lastY = e.clientY;
        lastTime = performance.now(); velocity = 0;
        startTransform = uiPanel.classList.contains('collapsed') ? getTranslateY() : 0;
        uiPanel.style.transition = 'none';
        uiPanel.classList.add('dragging');
    });
    handle.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const y = e.clientY;
        const now = performance.now();
        const dt = now - lastTime;
        if (dt > 0) velocity = (y - lastY) / dt;
        lastY = y; lastTime = now;
        const dy = y - startY;
        if (Math.abs(dy) > 5) didDrag = true;
        const collapsedY = getCollapsedY();
        scheduleTransform(Math.max(0, Math.min(collapsedY, startTransform + dy)));
    });
    handle.addEventListener('pointerup', (e) => {
        if (!dragging) return;
        handle.releasePointerCapture(e.pointerId);
        cleanup();
        const curY = getTranslateY();
        const collapsedY = getCollapsedY();
        const progress = collapsedY > 0 ? 1 - curY / collapsedY : 0;
        if (velocity > 0.3 || (velocity > -0.3 && progress < 0.3)) {
            uiPanel.classList.add('collapsed');
        } else {
            uiPanel.classList.remove('collapsed');
        }
        uiPanel.style.transform = '';
    });
    handle.addEventListener('pointercancel', (e) => {
        if (!dragging) return;
        try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
        cleanup();
        uiPanel.style.transform = '';
    });
    handle.addEventListener('click', () => {
        if (!isMobileLayout()) return;
        if (didDrag) { didDrag = false; return; }
        uiPanel.classList.toggle('collapsed');
    });
})();

// ─── Mobile info text ─────────────────────────────────────────────

if (state.isTouchDevice) {
    const infoEl = document.getElementById('info');
    if (infoEl) infoEl.textContent = 'Import a heightmap to get started';
}

// Disable export widths > 8192 on touch devices
if (state.isTouchDevice) {
    const exportWidth = document.getElementById('exportWidth');
    if (exportWidth) {
        for (const opt of exportWidth.options) {
            if (+opt.value > 8192) {
                opt.disabled = true;
                opt.textContent = opt.value + ' (too large for mobile)';
            }
        }
    }
}

// ─── Orientation change ───────────────────────────────────────────

window.addEventListener('orientationchange', () => {
    setTimeout(() => {
        camera.aspect = innerWidth / innerHeight;
        camera.updateProjectionMatrix();
        updateMapCameraFrustum();
        renderer.setSize(innerWidth, innerHeight);
    }, 100);
});

// ─── Animation loop ───────────────────────────────────────────────

function animate() {
    requestAnimationFrame(animate);
    if (state.mapMode) { tickMapZoom(); mapCtrl.update(); } else { tickZoom(); ctrl.update(); }
    if (!state.mapMode && state.planetMesh && document.getElementById('chkRotate').checked) {
        state.planetMesh.rotation.y += 0.0008;
        waterMesh.rotation.y = state.planetMesh.rotation.y;
        if (state.wireMesh) state.wireMesh.rotation.y = state.planetMesh.rotation.y;
        if (state.arrowGroup) state.arrowGroup.rotation.y = state.planetMesh.rotation.y;
        if (state.windArrowGroup) state.windArrowGroup.rotation.y = state.planetMesh.rotation.y;
        if (state.oceanCurrentArrowGroup) state.oceanCurrentArrowGroup.rotation.y = state.planetMesh.rotation.y;
        if (state.globeGridMesh) state.globeGridMesh.rotation.y = state.planetMesh.rotation.y;
    }
    renderer.render(scene, state.mapMode ? mapCamera : camera);
}

// ─── Resize handler ───────────────────────────────────────────────

window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    updateMapCameraFrustum();
    renderer.setSize(innerWidth, innerHeight);
});

// ─── Hover info (analytical ray-sphere, no mesh raycasting) ───────

(function initHoverInfo() {
    const hoverEl = document.getElementById('hoverInfo');
    if (!hoverEl) return;
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const _inverseMatrix = new THREE.Matrix4();
    const _localRay = new THREE.Ray();

    const HOVER_INTERVAL = 50; // ms throttle
    let lastHoverTime = 0;
    let lastRegion = -1;

    /** Find nearest region to a unit-sphere direction (max dot product). */
    function findNearestRegion(nx, ny, nz) {
        const { mesh, r_xyz } = state.curData;
        const N = mesh.numRegions;
        let bestDot = -2, bestR = -1;
        for (let r = 0; r < N; r++) {
            const dot = nx * r_xyz[3 * r] + ny * r_xyz[3 * r + 1] + nz * r_xyz[3 * r + 2];
            if (dot > bestDot) { bestDot = dot; bestR = r; }
        }
        return bestR;
    }

    function getHitRegionGlobe(e) {
        if (!state.planetMesh) return -1;
        const rect = canvas.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        _inverseMatrix.copy(state.planetMesh.matrixWorld).invert();
        _localRay.copy(raycaster.ray).applyMatrix4(_inverseMatrix);
        const ox = _localRay.origin.x, oy = _localRay.origin.y, oz = _localRay.origin.z;
        const dx = _localRay.direction.x, dy = _localRay.direction.y, dz = _localRay.direction.z;
        const R = 1.08;
        const b = 2 * (ox * dx + oy * dy + oz * dz);
        const c = ox * ox + oy * oy + oz * oz - R * R;
        const disc = b * b - 4 * c;
        if (disc < 0) return -1;
        const t = (-b - Math.sqrt(disc)) * 0.5;
        if (t < 0) return -1;
        const hx = ox + t * dx, hy = oy + t * dy, hz = oz + t * dz;
        const len = Math.sqrt(hx * hx + hy * hy + hz * hz) || 1;
        return findNearestRegion(hx / len, hy / len, hz / len);
    }

    function getHitRegionMap(e) {
        if (!state.mapMesh) return -1;
        const rect = canvas.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, mapCamera);
        const o = raycaster.ray.origin, d = raycaster.ray.direction;
        if (Math.abs(d.z) < 1e-10) return -1;
        const t = -o.z / d.z;
        const wx = o.x + t * d.x, wy = o.y + t * d.y;
        const PI = Math.PI, sx = 2 / PI;
        let lon = wx / sx + (state.mapCenterLon || 0);
        const lat = wy / sx;
        if (lat < -PI / 2 || lat > PI / 2) return -1;
        if (lon > PI) lon -= 2 * PI;
        else if (lon < -PI) lon += 2 * PI;
        const cosLat = Math.cos(lat);
        return findNearestRegion(cosLat * Math.sin(lon), Math.sin(lat), cosLat * Math.cos(lon));
    }

    function updateHoverInfo(e) {
        if (!state.curData) return;
        const now = performance.now();
        if (now - lastHoverTime < HOVER_INTERVAL) return;
        lastHoverTime = now;

        const r = state.mapMode ? getHitRegionMap(e) : getHitRegionGlobe(e);
        if (r === lastRegion) return; // no change
        lastRegion = r;

        if (r < 0) { hoverEl.style.display = 'none'; return; }
        showRegionInfo(r);
    }

    function showRegionInfo(r) {
        const d = state.curData;
        if (!d || r < 0 || r >= d.mesh.numRegions) { hoverEl.style.display = 'none'; return; }
        const x = d.r_xyz[3*r], y = d.r_xyz[3*r+1], z = d.r_xyz[3*r+2];
        const lat = Math.asin(Math.max(-1, Math.min(1, y))) * 180 / Math.PI;
        const lon = Math.atan2(x, z) * 180 / Math.PI;
        const elev = d.r_elevation[r];
        const heightKm = elev <= 0 ? (elev * 10).toFixed(1) : (6 * elev * elev).toFixed(1);
        const isOcean = elev <= 0;

        let html = `<span class="hi-label">Elev</span> ${heightKm} km (${isOcean ? 'ocean' : 'land'})<br>`;
        html += `<span class="hi-label">Coord</span> ${Math.abs(lat).toFixed(1)}\u00b0${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(1)}\u00b0${lon >= 0 ? 'E' : 'W'}`;

        if (d.r_temperature_summer && d.r_precip_summer) {
            const ts = d.r_temperature_summer[r], tw = d.r_temperature_winter[r];
            const ps = d.r_precip_summer[r], pw = d.r_precip_winter[r];
            const tAvg = ((ts + tw) / 2).toFixed(1);
            const pTotal = Math.round(ps + pw);
            html += `<br><span class="hi-label">Temp</span> ${tAvg}\u00b0C avg (${ts.toFixed(1)} summer, ${tw.toFixed(1)} winter)`;
            html += `<br><span class="hi-label">Prec</span> ${pTotal} mm/yr`;
        }

        if (d.debugLayers?.koppen) {
            const kIdx = d.debugLayers.koppen[r];
            if (kIdx > 0 && kIdx < KOPPEN_CLASSES.length) {
                const k = KOPPEN_CLASSES[kIdx];
                html += `<br><span class="hi-label">Clim</span> ${k.code} \u2014 ${k.name}`;
            }
        }

        hoverEl.innerHTML = html;
        hoverEl.style.display = 'block';
    }

    canvas.addEventListener('mousemove', updateHoverInfo);
    canvas.addEventListener('mouseleave', () => { lastRegion = -1; hoverEl.style.display = 'none'; });
})();

// ─── Start ────────────────────────────────────────────────────────

animate();
