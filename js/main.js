// Entry point — wires UI controls, animation loop, and kicks off initial generation.

import * as THREE from 'three';
import { renderer, scene, camera, ctrl, waterMesh, atmosMesh, starsMesh,
         mapCamera, updateMapCameraFrustum, mapCtrl, canvas,
         tickZoom, tickMapZoom } from './scene.js';
import { state } from './state.js';
import { generate, reapplyViaWorker, computeClimateViaWorker, editRecomputeViaWorker } from './generate.js';
import { encodePlanetCode, decodePlanetCode } from './planet-code.js';
import { buildMesh, updateMeshColors, updateSuperPlateBorders, buildMapMesh, rebuildGrids, exportMap, exportMapBatch, buildWindArrows, buildOceanCurrentArrows, updateKoppenHoverHighlight, updateMapKoppenHoverHighlight, updatePendingHighlight, updateMapPendingHighlight } from './planet-mesh.js';
import { setupEditMode } from './edit-mode.js';
import { detailFromSlider, sliderFromDetail } from './detail-scale.js';
import { KOPPEN_CLASSES } from './koppen.js';
import { elevationToColor } from './color-map.js';

// Slider value displays + stale tracking
const sliderIds = ['sN','sP','sCn','sJ','sNs','sCsv','sLc'];
const PLATE_SLIDERS = ['sP', 'sCn', 'sCsv', 'sLc'];
let lastGenValues = {};

function snapshotSliders() {
    for (const id of sliderIds) lastGenValues[id] = document.getElementById(id).value;
}

function checkStale() {
    const btn = document.getElementById('generate');
    if (btn.classList.contains('generating')) return;
    const detailSliders = ['sN', 'sJ', 'sNs'];
    const plateChanged = PLATE_SLIDERS.some(id => document.getElementById(id).value !== lastGenValues[id]);
    const detailChanged = detailSliders.some(id => document.getElementById(id).value !== lastGenValues[id]);
    btn.classList.remove('stale', 'regen');
    if (plateChanged) {
        btn.classList.add('regen');
        btn.textContent = 'Regenerate';
    } else if (detailChanged) {
        btn.classList.add('stale');
        btn.textContent = 'Rebuild';
    } else {
        btn.textContent = 'Build New World';
    }
}

// Reapply smoothing + erosion without full rebuild (via worker)
function reapplyPostProcessing() {
    const d = state.curData;
    if (!d || !d.prePostElev) return;

    const skipClimate = shouldSkipClimate();
    reapplyViaWorker(() => {
        reapplyBtn.classList.remove('spinning');
        updatePlanetCode(false);
        // If climate invalidated and viewing a climate layer, switch to Terrain
        if (skipClimate && CLIMATE_LAYERS.has(state.debugLayer)) {
            state.debugLayer = '';
            if (debugLayerEl) debugLayerEl.value = '';
            syncTabsToLayer('');
            updateMeshColors();
            updateLegend('');
        }
    }, skipClimate);
}

const reapplyBtn = document.getElementById('reapplyBtn');

function markReapplyPending() {
    reapplyBtn.disabled = false;
    reapplyBtn.classList.add('ready');
}

function clearReapplyPending() {
    reapplyBtn.disabled = true;
    reapplyBtn.classList.remove('ready');
}

reapplyBtn.addEventListener('click', () => {
    if (reapplyBtn.disabled) return;
    clearReapplyPending();
    reapplyBtn.classList.add('spinning');
    reapplyPostProcessing();
});

// Auto Climate checkbox — default OFF above threshold
const AUTO_CLIMATE_THRESHOLD = 300000;

// Detail slider warning update (lower thresholds on touch devices)
const WARN_ORANGE = state.isTouchDevice ? 200000 : 640000;
const WARN_RED    = state.isTouchDevice ? 500000 : 1280000;

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

// Slider thumb tooltip — floating value bubble near the thumb during drag
function initSliderTooltip(slider) {
    const cg = slider.closest('.cg');
    if (!cg) return;
    cg.style.position = 'relative';
    const tip = document.createElement('div');
    tip.className = 'slider-tooltip';
    cg.appendChild(tip);

    function positionTip() {
        const pct = (+slider.value - +slider.min) / (+slider.max - +slider.min);
        const thumbOffset = pct * slider.offsetWidth;
        tip.style.left = thumbOffset + 'px';
    }

    slider.addEventListener('pointerdown', () => {
        tip.textContent = document.getElementById(slider.id.replace('s', 'v')).textContent;
        positionTip();
        tip.classList.add('visible');
    });
    slider.addEventListener('input', () => {
        tip.textContent = document.getElementById(slider.id.replace('s', 'v')).textContent;
        positionTip();
    });
    const hide = () => tip.classList.remove('visible');
    slider.addEventListener('pointerup', hide);
    slider.addEventListener('pointercancel', hide);
}

for (const [s,v] of [['sN','vN'],['sP','vP'],['sCn','vCn'],['sJ','vJ'],['sNs','vNs'],['sCsv','vCsv'],['sLc','vLc'],['sTw','vTw'],['sS','vS'],['sGl','vGl'],['sHEr','vHEr'],['sTEr','vTEr'],['sRs','vRs'],['sTmp','vTmp'],['sPrc','vPrc']]) {
    const slider = document.getElementById(s);
    initSliderTooltip(slider);
    slider.addEventListener('input', e => {
        if (s === 'sN') {
            const detail = detailFromSlider(+e.target.value);
            document.getElementById(v).textContent = detail.toLocaleString();
            updateDetailWarning(detail);
        } else if (s === 'sTmp') {
            const val = +e.target.value;
            document.getElementById(v).textContent = (val > 0 ? '+' : val === 0 ? '\u00b1' : '') + val + '\u00b0C';
        } else if (s === 'sPrc') {
            const val = +e.target.value;
            const pct = Math.round(val * 50);
            document.getElementById(v).textContent = (pct > 0 ? '+' : pct === 0 ? '\u00b1' : '') + pct + '%';
        } else if (s === 'sLc') {
            document.getElementById(v).textContent = Math.round(+e.target.value * 100) + '%';
        } else {
            document.getElementById(v).textContent = e.target.value;
        }
        if (s === 'sTw' || s === 'sS' || s === 'sGl' || s === 'sHEr' || s === 'sTEr' || s === 'sRs') {
            markReapplyPending();
        } else if (s === 'sTmp' || s === 'sPrc') {
            // Display-only update during drag; actual recompute on change (release)
        } else {
            checkStale();
        }
    });
    // Climate sliders: recompute only on release (change), not every drag tick
    if (s === 'sTmp' || s === 'sPrc') {
        slider.addEventListener('change', () => {
            if (!state.curData) return;
            updatePlanetCode(false);
            showBuildOverlay();
            computeClimateViaWorker(onProgress, () => {
                hideBuildOverlay();
                updateMeshColors();
                updateLegend(state.debugLayer);
            });
        });
    }
}

// Force range input re-render when <details> sections are opened.
// Browsers may not update the visual thumb position for sliders that were
// hidden (inside a closed <details>) when their value was set via JS.
document.querySelectorAll('details.section').forEach(det => {
    det.addEventListener('toggle', () => {
        if (!det.open) return;
        det.querySelectorAll('input[type="range"]').forEach(s => {
            const v = s.value; s.value = ''; s.value = v;
        });
    });
});

/** Returns true if climate should be skipped (detail above threshold). */
function shouldSkipClimate() {
    return detailFromSlider(+document.getElementById('sN').value) > AUTO_CLIMATE_THRESHOLD;
}

// Climate layer keys — layers that require climate data
const CLIMATE_LAYERS = new Set([
    'pressureSummer', 'pressureWinter',
    'windSpeedSummer', 'windSpeedWinter',
    'oceanCurrentSummer', 'oceanCurrentWinter',
    'precipSummer', 'precipWinter',
    'rainShadowSummer', 'rainShadowWinter',
    'tempSummer', 'tempWinter',
    'koppen', 'biome', 'continentality'
]);

// Map tabs → tab-layer mapping
const mapTabs = document.getElementById('mapTabs');
const vizLegend = document.getElementById('vizLegend');
const debugLayerEl = document.getElementById('debugLayer');

function switchVisualization(layer) {
    if (CLIMATE_LAYERS.has(layer) && !state.climateComputed) {
        // Need to compute climate first
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
    // Show/hide wind/ocean arrows
    const isWindLayer = layer === 'pressureSummer' || layer === 'pressureWinter' ||
                        layer === 'windSpeedSummer' || layer === 'windSpeedWinter';
    const isOceanLayer = layer === 'oceanCurrentSummer' || layer === 'oceanCurrentWinter';
    if (isOceanLayer) {
        const season = layer.includes('Winter') ? 'winter' : 'summer';
        buildWindArrows(null);
        buildOceanCurrentArrows(season);
    } else if (isWindLayer) {
        const season = layer.includes('Winter') ? 'winter' : 'summer';
        buildOceanCurrentArrows(null);
        buildWindArrows(season);
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
    // Sync mobile view switcher (only for main views it knows about)
    const mvs = document.getElementById('mobileViewSwitch');
    if (mvs && [...mvs.options].some(o => o.value === layer)) {
        mvs.value = layer;
    }
}

mapTabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.map-tab');
    if (!tab) return;
    const layer = tab.dataset.layer;
    // Update active tab
    mapTabs.querySelectorAll('.map-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    // Sync debug dropdown + mobile switcher
    if (debugLayerEl) debugLayerEl.value = layer;
    mobileViewSwitch.value = layer;
    switchVisualization(layer);
});

// Mobile view switcher
const mobileViewSwitch = document.getElementById('mobileViewSwitch');
mobileViewSwitch.addEventListener('change', (e) => {
    const layer = e.target.value;
    syncTabsToLayer(layer);
    if (debugLayerEl) debugLayerEl.value = layer;
    switchVisualization(layer);
});

// Koppen climate zone descriptions for hover tooltips
const KOPPEN_DESCRIPTIONS = {
    Af:  'Tropical rainforest — Hot and wet year-round. Amazon Basin, Congo Basin, Southeast Asia.',
    Am:  'Tropical monsoon — Brief dry season offset by heavy monsoon rains. Southern India, West Africa, Northern Australia.',
    Aw:  'Tropical savanna — Distinct wet and dry seasons. Sub-Saharan Africa, Brazilian Cerrado, Northern Australia.',
    BWh: 'Hot desert — Extremely dry with scorching summers. Sahara, Arabian Desert, Sonoran Desert.',
    BWk: 'Cold desert — Arid with cold winters. Gobi Desert, Patagonian steppe, Great Basin.',
    BSh: 'Hot steppe — Semi-arid grassland with hot summers. Sahel, outback Australia, northern Mexico.',
    BSk: 'Cold steppe — Semi-arid with cold winters. Central Asian steppe, Montana, Anatolian plateau.',
    Cfa: 'Humid subtropical — Hot humid summers, mild winters. Southeastern US, eastern China, Buenos Aires.',
    Cfb: 'Oceanic — Mild year-round, cool summers, frequent rain. Western Europe, New Zealand, Pacific Northwest.',
    Cfc: 'Subpolar oceanic — Cool year-round with short summers. Iceland, southern Chile, Faroe Islands.',
    Csa: 'Hot-summer Mediterranean — Dry hot summers, mild wet winters. Southern California, Greece, coastal Turkey.',
    Csb: 'Warm-summer Mediterranean — Dry warm summers, mild wet winters. San Francisco, Porto, Cape Town.',
    Csc: 'Cold-summer Mediterranean — Cool dry summers, mild wet winters. Rare; high-altitude Mediterranean coasts.',
    Cwa: 'Humid subtropical monsoon — Warm with dry winters. Hong Kong, northern India, Southeastern Brazil highlands.',
    Cwb: 'Subtropical highland — Mild with dry winters. Mexico City, Bogota, Ethiopian Highlands.',
    Cwc: 'Cold subtropical highland — Cool with dry winters. Rare; high-altitude tropical mountains.',
    Dfa: 'Hot-summer continental — Hot summers, cold snowy winters. Chicago, Kyiv, Beijing.',
    Dfb: 'Warm-summer continental — Warm summers, cold winters. Moscow, southern Scandinavia, New England.',
    Dfc: 'Subarctic — Long cold winters, brief cool summers. Siberia, northern Canada, interior Alaska.',
    Dfd: 'Extremely cold subarctic — Harshest winters on Earth. Yakutsk, Verkhoyansk (eastern Siberia).',
    Dsa: 'Hot-summer continental, dry summer — Hot dry summers, cold winters. Parts of eastern Turkey, Iran.',
    Dsb: 'Warm-summer continental, dry summer — Dry warm summers, cold winters. Parts of the western US highlands.',
    Dsc: 'Subarctic, dry summer — Cool dry summers, very cold winters. Rare; high-altitude inland regions.',
    Dsd: 'Extremely cold subarctic, dry summer — Very rare; extreme cold with dry summers.',
    Dwa: 'Hot-summer continental, monsoon — Wet hot summers, dry cold winters. Northern China, Korea.',
    Dwb: 'Warm-summer continental, monsoon — Wet warm summers, dry cold winters. Parts of northeast China.',
    Dwc: 'Subarctic monsoon — Brief wet summers, long dry frigid winters. Eastern Siberia, far northeast China.',
    Dwd: 'Extremely cold subarctic, monsoon — Extreme cold, driest in winter. Interior eastern Siberia.',
    ET:  'Tundra — Permafrost, only warmest month above 0 C. Arctic coasts, high mountain plateaus.',
    EF:  'Ice cap — Permanent ice, never above 0 C. Antarctica interior, Greenland ice sheet.',
};

// Legend rendering
function updateLegend(layer) {
    if (!vizLegend) return;

    if (layer === '' || !layer) {
        // Terrain legend
        const stops = [
            { e: -0.50, label: '' },
            { e: -0.25, label: '' },
            { e: -0.05, label: '' },
            { e: 0.00, label: '' },
            { e: 0.03, label: '' },
            { e: 0.15, label: '' },
            { e: 0.35, label: '' },
            { e: 0.55, label: '' },
            { e: 0.80, label: '' }
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
        // Koppen legend — Wikipedia link + swatches with hover tooltips
        let html = '<div class="legend-koppen-header"><a href="https://en.wikipedia.org/wiki/K%C3%B6ppen_climate_classification" target="_blank" rel="noopener">K\u00f6ppen climate classification</a></div>';
        html += '<div class="legend-koppen">';
        for (let i = 1; i < KOPPEN_CLASSES.length; i++) {
            const k = KOPPEN_CLASSES[i];
            const [r, g, b] = k.color;
            const hex = `rgb(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)})`;
            const desc = KOPPEN_DESCRIPTIONS[k.code] || k.name;
            html += `<div class="legend-koppen-item" data-code="${k.code}"><span class="legend-koppen-swatch" style="background:${hex}"></span>${k.code}</div>`;
        }
        html += '<div class="legend-koppen-tooltip" id="koppenTip"></div>';
        html += '</div>';
        vizLegend.innerHTML = html;
        // Wire hover tooltips with dynamic positioning
        const tipEl = document.getElementById('koppenTip');
        const container = vizLegend.querySelector('.legend-koppen');
        vizLegend.querySelectorAll('.legend-koppen-item').forEach(item => {
            item.addEventListener('mouseenter', () => {
                const code = item.dataset.code;
                const desc = KOPPEN_DESCRIPTIONS[code] || '';
                tipEl.textContent = desc;
                tipEl.classList.add('visible');
                // Position above the hovered item, clamped within the container
                const itemRect = item.getBoundingClientRect();
                const containerRect = container.getBoundingClientRect();
                const tipWidth = 240;
                let left = itemRect.left - containerRect.left + itemRect.width / 2 - tipWidth / 2;
                left = Math.max(0, Math.min(left, containerRect.width - tipWidth));
                tipEl.style.left = left + 'px';
                tipEl.style.bottom = (containerRect.bottom - itemRect.top + 6) + 'px';
                // Highlight matching cells on the mesh
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
        // Satellite biome legend — gradient bar of key biome colors
        const biomeStops = [
            { color: [0.82,0.72,0.50], label: 'Desert' },
            { color: [0.72,0.62,0.30], label: 'Steppe' },
            { color: [0.42,0.50,0.18], label: 'Savanna' },
            { color: [0.12,0.38,0.10], label: 'Forest' },
            { color: [0.06,0.22,0.08], label: 'Taiga' },
            { color: [0.35,0.32,0.22], label: 'Tundra' },
            { color: [0.78,0.80,0.84], label: 'Ice' },
        ];
        const biomeColors = biomeStops.map(s => {
            const [r, g, b] = s.color;
            return `rgb(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)})`;
        });
        const biomePcts = biomeStops.map((_, i) => Math.round(i / (biomeStops.length - 1) * 100));
        const biomeGrad = biomeColors.map((c, i) => `${c} ${biomePcts[i]}%`).join(', ');
        vizLegend.innerHTML = `<div class="legend-gradient" style="background:linear-gradient(to right,${biomeGrad})"></div>` +
            `<div class="legend-labels"><span>${biomeStops[0].label}</span><span>${biomeStops[3].label}</span><span>${biomeStops[6].label}</span></div>`;
    } else if (layer === 'rainShadowSummer' || layer === 'rainShadowWinter') {
        // Rain shadow diverging legend: leeward shadow ↔ neutral ↔ windward boost
        vizLegend.innerHTML = `<div class="legend-gradient" style="background:linear-gradient(to right,rgb(230,51,33) 0%,rgb(140,140,148) 50%,rgb(38,102,243) 100%)"></div>` +
            `<div class="legend-labels"><span>Rain Shadow</span><span>Neutral</span><span>Windward</span></div>`;
    } else if (layer === 'landheightmap') {
        vizLegend.innerHTML = `<div class="legend-gradient" style="background:linear-gradient(to right,#000 0%,#fff 100%)"></div>` +
            `<div class="legend-labels"><span>Ocean / Sea Level</span><span>Peak</span></div>`;
    } else {
        vizLegend.innerHTML = '';
    }
}

// Build overlay — unified loading / generation overlay
const buildOverlay  = document.getElementById('buildOverlay');
const buildBarFill  = document.getElementById('buildBarFill');
const buildBarLabel = document.getElementById('buildBarLabel');
let overlayActive = true; // starts active (visible in HTML on first load)

function onProgress(pct, label) {
    if (!overlayActive) return;
    if (buildBarFill)  buildBarFill.style.transform = 'scaleX(' + (pct / 100) + ')';
    if (buildBarLabel) buildBarLabel.textContent = label;
}

function showBuildOverlay() {
    if (!buildBarFill || !buildOverlay) return;
    // Snap bar to 0 instantly — disable transition, reset transform, force reflow
    buildBarFill.style.transition = 'none';
    buildBarFill.style.transform = 'scaleX(0)';
    buildBarLabel.textContent = '';
    buildBarFill.offsetWidth; // force reflow
    buildBarFill.style.transition = '';
    overlayActive = true;
    buildOverlay.classList.remove('hidden');
}

function hideBuildOverlay() {
    setTimeout(() => {
        overlayActive = false;
        if (buildOverlay) {
            buildOverlay.classList.add('hidden');
            // After first generation, switch from opaque to semi-transparent
            buildOverlay.classList.remove('initial');
        }
    }, 500);
}

// Generate button
const genBtn = document.getElementById('generate');
genBtn.addEventListener('click', () => {
    clearReapplyPending();
    buildWindArrows(null); // dispose previous wind arrows
    buildOceanCurrentArrows(null); // dispose previous ocean arrows
    showBuildOverlay();
    // Collapse bottom sheet on mobile so user can see the planet build
    const ui = document.getElementById('ui');
    if (window.innerWidth <= 768 && ui) ui.classList.add('collapsed');
    // Rebuild: reuse seed + plate edits so only resolution/params change.
    // If plate-affecting sliders (Plates, Continents, Continent Size Variety, Land Coverage) changed,
    // force a fresh generation — the coarse plate grid is fully determined by seed + P + Cn + Csv + Lc.
    const plateChanged = PLATE_SLIDERS.some(id => document.getElementById(id).value !== lastGenValues[id]);
    const isRebuild = genBtn.classList.contains('stale') && state.curData && !plateChanged;
    const seed = isRebuild ? state.curData.seed : undefined;
    const toggles = isRebuild ? getToggledIndices() : [];
    generate(seed, toggles, onProgress, shouldSkipClimate());
});
genBtn.addEventListener('generate-done', snapshotSliders);
genBtn.addEventListener('generate-done', hideBuildOverlay);
genBtn.addEventListener('generate-done', () => {
    const infoEl = document.getElementById('info');
    if (!infoEl.dataset.nudged) {
        infoEl.dataset.nudged = '1';
        infoEl.classList.add('nudge');
        infoEl.addEventListener('animationend', () => infoEl.classList.remove('nudge'), { once: true });
    }
}, { once: true });

// Planet code — display after generation, copy, load, URL hash
const seedInput = document.getElementById('seedCode');
const copyBtn   = document.getElementById('copyBtn');
const loadBtn   = document.getElementById('loadBtn');
let currentCode = ''; // the code for the currently loaded planet

function updateLoadBtn() {
    const val = seedInput.value.trim().toLowerCase();
    const ready = val.length > 0 && val !== currentCode;
    loadBtn.classList.toggle('ready', ready);
}

/** Get sorted array of toggled plate indices by diffing current vs original plateIsOcean. */
function getToggledIndices() {
    const d = state.curData;
    if (!d || !d.originalPlateIsOcean) return [];
    const indices = [];
    const seeds = Array.from(d.plateSeeds);
    for (let i = 0; i < seeds.length; i++) {
        const r = seeds[i];
        if (d.originalPlateIsOcean.has(r) !== d.plateIsOcean.has(r)) {
            indices.push(i);
        }
    }
    return indices;
}

/** Encode current planet state and update the seed input + URL hash. */
function updatePlanetCode(flash) {
    const d = state.curData;
    if (!d) return;
    const code = encodePlanetCode(
        d.seed,
        detailFromSlider(+document.getElementById('sN').value),
        +document.getElementById('sJ').value,
        +document.getElementById('sP').value,
        +document.getElementById('sCn').value,
        +document.getElementById('sNs').value,
        +document.getElementById('sTw').value,
        +document.getElementById('sS').value,
        +document.getElementById('sGl').value,
        +document.getElementById('sHEr').value,
        +document.getElementById('sTEr').value,
        +document.getElementById('sRs').value,
        0.75,
        +document.getElementById('sCsv').value,
        +document.getElementById('sTmp').value,
        +document.getElementById('sPrc').value,
        +document.getElementById('sLc').value,
        getToggledIndices()
    );
    currentCode = code;
    seedInput.value = code;
    updateLoadBtn();
    history.replaceState(null, '', '#' + code);
    if (flash) {
        seedInput.classList.add('flash');
        seedInput.addEventListener('animationend', () => seedInput.classList.remove('flash'), { once: true });
    }
}

genBtn.addEventListener('generate-done', () => updatePlanetCode(false));
genBtn.addEventListener('generate-done', () => {
    // If climate not computed and current view is a climate layer, switch to Terrain
    if (!state.climateComputed && CLIMATE_LAYERS.has(state.debugLayer)) {
        state.debugLayer = '';
        if (debugLayerEl) debugLayerEl.value = '';
        syncTabsToLayer('');
        updateMeshColors();
    }
    syncTabsToLayer(state.debugLayer);
    if (debugLayerEl) debugLayerEl.value = state.debugLayer;
    updateLegend(state.debugLayer);

    // Rebuild wind/ocean arrows if a relevant debug layer is active
    const v = state.debugLayer;
    const isWindLayer = v === 'pressureSummer' || v === 'pressureWinter' ||
                        v === 'windSpeedSummer' || v === 'windSpeedWinter';
    const isOceanLayer = v === 'oceanCurrentSummer' || v === 'oceanCurrentWinter';
    if (isWindLayer) {
        buildWindArrows(v.includes('Winter') ? 'winter' : 'summer');
    } else if (isOceanLayer) {
        buildOceanCurrentArrows(v.includes('Winter') ? 'winter' : 'summer');
    }
});

document.addEventListener('plates-edited', () => {
    updatePlanetCode(true);
    // If climate was invalidated and we're viewing a climate layer, switch to Terrain
    if (!state.climateComputed && CLIMATE_LAYERS.has(state.debugLayer)) {
        state.debugLayer = '';
        if (debugLayerEl) debugLayerEl.value = '';
        syncTabsToLayer('');
        updateMeshColors();
        updateLegend('');
    }
});

copyBtn.addEventListener('click', () => {
    if (!seedInput.value) return;
    navigator.clipboard.writeText(seedInput.value).then(() => {
        copyBtn.textContent = '\u2713';
        setTimeout(() => { copyBtn.textContent = '\u2398'; }, 1200);
    });
});

seedInput.addEventListener('input', () => {
    updateLoadBtn();
    seedError.classList.remove('visible');
});

const seedError = document.getElementById('seedError');

function paramsToSliderMap(params) {
    return {
        sN: sliderFromDetail(params.N), sJ: params.jitter, sP: params.P,
        sCn: params.numContinents, sNs: params.roughness,
        sCsv: params.continentSizeVariety, sLc: params.landCoverage,
        sTw: params.terrainWarp, sS: params.smoothing, sGl: params.glacialErosion,
        sHEr: params.hydraulicErosion, sTEr: params.thermalErosion,
        sRs: params.ridgeSharpening, sTmp: params.temperatureOffset,
        sPrc: params.precipitationOffset,
    };
}

function applyCode(code) {
    const params = decodePlanetCode(code);
    if (!params) {
        seedInput.style.borderColor = '#c44';
        seedError.classList.add('visible');
        setTimeout(() => { seedInput.style.borderColor = ''; }, 1500);
        return;
    }
    seedError.classList.remove('visible');
    // Set slider values + fire input events to update displays
    const map = paramsToSliderMap(params);
    for (const [id, val] of Object.entries(map)) {
        const el = document.getElementById(id);
        el.value = val;
        el.dispatchEvent(new Event('input'));
    }
    clearReapplyPending();
    state.pendingToggles.clear();
    document.getElementById('rebuildFab').style.display = 'none';
    showBuildOverlay();
    generate(params.seed, params.toggledIndices, onProgress, shouldSkipClimate());
}

loadBtn.addEventListener('click', () => {
    applyCode(seedInput.value);
});

seedInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') applyCode(seedInput.value);
});

// View-mode checkboxes
document.getElementById('chkPlates').addEventListener('change', () => { updateMeshColors(); updateSuperPlateBorders(); });
document.getElementById('chkWire').addEventListener('change', buildMesh);

// Grid toggle
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

// Grid spacing dropdown
document.getElementById('gridSpacing').addEventListener('change', (e) => {
    state.gridSpacing = parseFloat(e.target.value);
    rebuildGrids();
});

// Map center longitude slider — translate on drag (instant), rebuild on release
const mapCenterLonGroup = document.getElementById('mapCenterLonGroup');
const sMapCenterLon = document.getElementById('sMapCenterLon');
const vMapCenterLon = document.getElementById('vMapCenterLon');

sMapCenterLon.addEventListener('input', () => {
    const lon = +sMapCenterLon.value;
    const suffix = lon > 0 ? 'E' : lon < 0 ? 'W' : '';
    vMapCenterLon.textContent = Math.abs(lon) + '\u00B0' + suffix;
    state.mapCenterLon = lon * Math.PI / 180;
    if (state.mapMode && state.mapMesh) {
        // Instant GPU translation — wrap clones (children at ±4) fill edges
        const builtLon = state.mapMesh._builtCenterLon || 0;
        const dx = (builtLon - state.mapCenterLon) * (2 / Math.PI);
        state.mapMesh.position.x = dx;
        if (state.mapGridMesh) state.mapGridMesh.position.x = dx;
    }
});

sMapCenterLon.addEventListener('change', () => {
    if (state.mapMode) {
        buildMapMesh();
        // Rebuild arrows if a wind/ocean layer is active
        const layer = state.debugLayer;
        const isWind = layer === 'pressureSummer' || layer === 'pressureWinter' ||
                       layer === 'windSpeedSummer' || layer === 'windSpeedWinter';
        const isOcean = layer === 'oceanCurrentSummer' || layer === 'oceanCurrentWinter';
        if (isWind) buildWindArrows(layer.includes('Winter') ? 'winter' : 'summer');
        if (isOcean) buildOceanCurrentArrows(layer.includes('Winter') ? 'winter' : 'summer');
    }
});

// View mode dropdown (Globe / Map)
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
            // Yield to let the overlay paint, then build the mesh
            setTimeout(() => {
                buildMapMesh();
                if (state.mapMesh) state.mapMesh.visible = true;
                hideBuildOverlay();
            }, 50);
        }
        if (state.mapMesh) state.mapMesh.visible = true;
        if (state.mapGridMesh) state.mapGridMesh.visible = state.gridEnabled;
        if (state.globeGridMesh) state.globeGridMesh.visible = false;
        // Toggle wind arrow sub-groups for map mode
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
        // Toggle wind arrow sub-groups for globe mode
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
        const showPlates = document.getElementById('chkPlates').checked;
        waterMesh.visible = !showPlates && !state.debugLayer;
        scene.background = new THREE.Color(0x030308);
        mapCtrl.enabled = false;
        ctrl.enabled = true;
        mapCenterLonGroup.style.display = 'none';
    }
});

// Debug layer dropdown
if (debugLayerEl) {
    debugLayerEl.addEventListener('change', (e) => {
        const layer = e.target.value;
        syncTabsToLayer(layer);
        switchVisualization(layer);
    });
}

// Export modal
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
        // Disable climate-dependent export types when climate isn't computed
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

    // Export All — downloads Satellite, Climate, Heightmap, and Land Mask
    const exportAllBtn = document.getElementById('exportAllGo');
    const EXPORT_ALL_TYPES = [
        { type: 'biome',          label: 'Satellite' },
        { type: 'koppen',         label: 'Climate' },
        { type: 'landheightmap',  label: 'Heightmap' },
        { type: 'landmask',       label: 'Land Mask' },
    ];

    exportAllBtn.addEventListener('click', async () => {
        const w = +widthEl.value;
        closeModal();
        showBuildOverlay();

        // Compute climate first if needed (Satellite & Climate require it)
        if (!state.climateComputed) {
            onProgress(0, 'Computing climate...');
            await new Promise(resolve => computeClimateViaWorker(onProgress, resolve));
        }

        await exportMapBatch(EXPORT_ALL_TYPES, w, onProgress);
        hideBuildOverlay();
    });
})();

// Edit mode setup (pointer events, sub-mode buttons)
setupEditMode();

// Rebuild FAB — batch-apply pending plate toggles
(function initRebuildFab() {
    const rebuildBtn = document.getElementById('rebuildFab');
    const rebuildLabel = rebuildBtn.querySelector('span');

    function clearPending() {
        state.pendingToggles.clear();
        rebuildBtn.style.display = 'none';
        state._pendingBackup = null;
        state._mapPendingBackup = null;
        updatePendingHighlight();
        updateMapPendingHighlight();
    }

    // Show/hide rebuild button when pending set changes
    document.addEventListener('pending-edits-changed', () => {
        const count = state.pendingToggles.size;
        if (count > 0) {
            rebuildLabel.textContent = `Rebuild (${count})`;
            rebuildBtn.style.display = '';
        } else {
            rebuildBtn.style.display = 'none';
        }
    });

    // Click: apply all pending toggles, then recompute once
    rebuildBtn.addEventListener('click', () => {
        if (state.pendingToggles.size === 0) return;
        const { plateIsOcean, plateDensity, plateDensityLand, plateDensityOcean } = state.curData;

        // Apply all pending toggles
        for (const pid of state.pendingToggles) {
            if (plateIsOcean.has(pid)) {
                plateIsOcean.delete(pid);
                plateDensity[pid] = plateDensityLand[pid];
            } else {
                plateIsOcean.add(pid);
                plateDensity[pid] = plateDensityOcean[pid];
            }
        }

        clearPending();

        // Show building state
        const btn = document.getElementById('generate');
        btn.disabled = true;
        btn.textContent = 'Building\u2026';
        btn.classList.add('generating');

        const hoverEl = document.getElementById('hoverInfo');
        hoverEl.innerHTML = '\u23F3 Rebuilding\u2026';
        hoverEl.style.display = 'block';

        const skipClimate = shouldSkipClimate();
        editRecomputeViaWorker(() => {
            btn.disabled = false;
            btn.textContent = 'Build New World';
            btn.classList.remove('generating');
            hoverEl.style.display = 'none';
            document.dispatchEvent(new CustomEvent('plates-edited'));
        }, skipClimate);
    });

    // Escape clears all pending edits
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && state.pendingToggles.size > 0) {
            clearPending();
        }
    });

    // Clear pending on new generation
    genBtn.addEventListener('generate-done', clearPending);
})();

// Sidebar toggle (desktop) + bottom sheet (mobile)
const sidebarToggle = document.getElementById('sidebarToggle');
const uiPanel = document.getElementById('ui');
const isMobileLayout = () => window.innerWidth <= 768;

if (isMobileLayout()) {
    uiPanel.classList.add('collapsed');
}

// Desktop sidebar toggle
sidebarToggle.addEventListener('click', () => {
    const collapsed = uiPanel.classList.toggle('collapsed');
    sidebarToggle.innerHTML = collapsed ? '\u00BB' : '\u00AB';
    sidebarToggle.title = collapsed ? 'Show panel' : 'Collapse panel';
});

// Bottom-sheet drag behavior (Pointer Events + setPointerCapture)
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

    function getCollapsedY() {
        return uiPanel.offsetHeight - 60;
    }

    function applyTransform() {
        if (pendingY !== null) {
            uiPanel.style.transform = `translateY(${pendingY}px)`;
            pendingY = null;
        }
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
        dragging = true;
        didDrag = false;
        startY = e.clientY;
        lastY = e.clientY;
        lastTime = performance.now();
        velocity = 0;
        startTransform = uiPanel.classList.contains('collapsed') ? getTranslateY() : 0;
        uiPanel.style.transition = 'none';
        uiPanel.classList.add('dragging');
    });

    handle.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const y = e.clientY;
        const now = performance.now();
        const dt = now - lastTime;
        if (dt > 0) velocity = (y - lastY) / dt; // px/ms, positive = downward
        lastY = y;
        lastTime = now;
        const dy = y - startY;
        if (Math.abs(dy) > 5) didDrag = true;
        const collapsedY = getCollapsedY();
        const newY = Math.max(0, Math.min(collapsedY, startTransform + dy));
        scheduleTransform(newY);
    });

    handle.addEventListener('pointerup', (e) => {
        if (!dragging) return;
        handle.releasePointerCapture(e.pointerId);
        cleanup();
        const curY = getTranslateY();
        const collapsedY = getCollapsedY();
        const progress = collapsedY > 0 ? 1 - curY / collapsedY : 0;
        const shouldCollapse = velocity > 0.3 || (velocity > -0.3 && progress < 0.3);
        if (shouldCollapse) {
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

    // Tap on handle toggles collapsed state (suppressed if a drag just happened)
    handle.addEventListener('click', () => {
        if (!isMobileLayout()) return;
        if (didDrag) { didDrag = false; return; }
        uiPanel.classList.toggle('collapsed');
    });
})();

// Edit-mode toggle wiring
(function initEditToggle() {
    const editBtn = document.getElementById('editToggle');
    if (!editBtn) return;
    editBtn.addEventListener('click', () => {
        state.editMode = !state.editMode;
        editBtn.classList.toggle('active', state.editMode);
    });
})();

// Mobile refresh FAB — two-tap to regenerate (blue → green → generate)
(function initRefreshFab() {
    const btn = document.getElementById('refreshFab');
    if (!btn) return;
    let armed = false;
    let timer = 0;

    function disarm() {
        armed = false;
        btn.classList.remove('armed');
        clearTimeout(timer);
    }

    btn.addEventListener('click', () => {
        if (!armed) {
            armed = true;
            btn.classList.add('armed');
            timer = setTimeout(disarm, 3000);
        } else {
            disarm();
            // Collapse sheet so user sees the planet build
            if (isMobileLayout()) uiPanel.classList.add('collapsed');
            clearReapplyPending();
            showBuildOverlay();
            generate(undefined, [], onProgress, shouldSkipClimate());
        }
    });
})();

// Mobile info text
if (state.isTouchDevice) {
    const infoEl = document.getElementById('info');
    if (infoEl) infoEl.textContent = 'Drag to rotate \u00b7 Pinch to zoom \u00b7 Use edit button to reshape';
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

// Orientation change handler
window.addEventListener('orientationchange', () => {
    setTimeout(() => {
        camera.aspect = innerWidth / innerHeight;
        camera.updateProjectionMatrix();
        updateMapCameraFrustum();
        renderer.setSize(innerWidth, innerHeight);
    }, 100);
});

// Animation loop
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

// Resize handler
window.addEventListener('resize', () => {
    camera.aspect = innerWidth/innerHeight;
    camera.updateProjectionMatrix();
    updateMapCameraFrustum();
    renderer.setSize(innerWidth, innerHeight);
});

// Tutorial modal
(function initTutorial() {
    const overlay  = document.getElementById('tutorialOverlay');
    const card     = document.getElementById('tutorialCard');
    const closeBtn = document.getElementById('tutorialClose');
    const backBtn  = document.getElementById('tutorialBack');
    const nextBtn  = document.getElementById('tutorialNext');
    const helpBtn  = document.getElementById('helpBtn');
    const steps    = card.querySelectorAll('.tutorial-step');
    const dots     = card.querySelectorAll('.dot');
    const TOTAL    = steps.length;
    const LS_KEY   = 'atlas-engine-tutorial-seen';
    let current    = 0;

    function showStep(i) {
        current = i;
        steps.forEach((s, idx) => s.classList.toggle('active', idx === i));
        dots.forEach((d, idx) => d.classList.toggle('active', idx === i));
        backBtn.disabled = i === 0;
        nextBtn.textContent = i === TOTAL - 1 ? 'Get Started' : 'Next';
    }

    function openModal() {
        current = 0;
        showStep(0);
        overlay.classList.remove('hidden');
    }

    function closeModal() {
        overlay.classList.add('hidden');
        localStorage.setItem(LS_KEY, '1');
    }

    nextBtn.addEventListener('click', () => {
        if (current < TOTAL - 1) showStep(current + 1);
        else closeModal();
    });

    backBtn.addEventListener('click', () => {
        if (current > 0) showStep(current - 1);
    });

    closeBtn.addEventListener('click', closeModal);

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !overlay.classList.contains('hidden')) closeModal();
    });

    helpBtn.addEventListener('click', openModal);

    // Update tutorial step 2 for touch devices
    if (state.isTouchDevice) {
        const step2 = card.querySelector('.tutorial-step[data-step="2"]');
        if (step2) {
            const p = step2.querySelector('p');
            if (p) p.innerHTML = '<strong>Drag</strong> to rotate the globe. <strong>Pinch</strong> to zoom in and out. Tap the <strong>edit button</strong> (pencil icon) then <strong>tap</strong> plates to mark them for reshaping &mdash; select multiple, then hit <strong>Rebuild</strong> to apply all at once. Tap again to undo a pending selection.';
        }
    }

    // Auto-show on first visit — wait until the build overlay has faded out
    overlay.classList.add('hidden');
    if (!localStorage.getItem(LS_KEY)) {
        genBtn.addEventListener('generate-done', () => {
            if (buildOverlay) {
                buildOverlay.addEventListener('transitionend', () => openModal(), { once: true });
            } else {
                openModal();
            }
        }, { once: true });
    }
})();

// What's New modal — shown once per version for returning users
(function initWhatsNew() {
    const VERSION    = '2';
    const LS_KEY     = 'wo-whatsnew-seen';
    const LS_TUTORIAL = 'atlas-engine-tutorial-seen';
    const overlay    = document.getElementById('whatsNewOverlay');
    const card       = document.getElementById('whatsNewCard');
    if (!overlay || !card) return;

    const closeBtn = document.getElementById('whatsNewClose');
    const backBtn  = document.getElementById('whatsNewBack');
    const nextBtn  = document.getElementById('whatsNewNext');
    const steps    = card.querySelectorAll('.whatsnew-step');
    const dots     = card.querySelectorAll('.dot');
    const TOTAL    = steps.length;
    let current    = 0;

    function showStep(i) {
        current = i;
        steps.forEach((s, idx) => s.classList.toggle('active', idx === i));
        dots.forEach((d, idx) => d.classList.toggle('active', idx === i));
        backBtn.disabled = i === 0;
        nextBtn.textContent = i === TOTAL - 1 ? 'Got It' : 'Next';
    }

    function closeModal() {
        overlay.classList.add('hidden');
        localStorage.setItem(LS_KEY, VERSION);
    }

    nextBtn.addEventListener('click', () => {
        if (current < TOTAL - 1) showStep(current + 1);
        else closeModal();
    });
    backBtn.addEventListener('click', () => {
        if (current > 0) showStep(current - 1);
    });
    closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !overlay.classList.contains('hidden')) closeModal();
    });

    // Only show for returning users (tutorial already seen) who haven't seen this version
    overlay.classList.add('hidden');
    const seenVersion = localStorage.getItem(LS_KEY);
    const isReturningUser = localStorage.getItem(LS_TUTORIAL);
    if (isReturningUser && seenVersion !== VERSION) {
        genBtn.addEventListener('generate-done', () => {
            showStep(0);
            setTimeout(() => overlay.classList.remove('hidden'), 600);
        }, { once: true });
    }
})();

// Power-user survey — triggers after 3+ distinct hours across 2+ distinct days
(function initSurveyTracker() {
    const LS = 'wo-usage';
    const LS_DISMISSED = 'wo-survey-dismissed';

    if (localStorage.getItem(LS_DISMISSED)) return;

    // Simple hash so we don't store raw timestamps
    function hash(str) {
        let h = 5381;
        for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
        return h.toString(36);
    }

    let data;
    try { data = JSON.parse(localStorage.getItem(LS)) || {}; } catch (_) { data = {}; }
    const hours = data.h || 0;
    const days  = data.d || 0;
    const lastH = data.lh || '';
    const lastD = data.ld || '';

    const now = new Date();
    const hourKey = hash(now.getFullYear() + '-' + now.getMonth() + '-' + now.getDate() + 'T' + now.getHours());
    const dayKey  = hash(now.getFullYear() + '-' + now.getMonth() + '-' + now.getDate());

    const newHours = hourKey !== lastH ? hours + 1 : hours;
    const newDays  = dayKey  !== lastD ? days  + 1 : days;

    localStorage.setItem(LS, JSON.stringify({ h: newHours, d: newDays, lh: hourKey, ld: dayKey }));

    if (newHours >= 3 && newDays >= 2) {
        const overlay    = document.getElementById('surveyOverlay');
        const closeBtn   = document.getElementById('surveyClose');
        const dismissBtn = document.getElementById('surveyDismiss');
        const linkBtn    = document.getElementById('surveyLink');
        if (!overlay) return;

        function dismiss() {
            overlay.classList.add('hidden');
            localStorage.setItem(LS_DISMISSED, '1');
        }

        // Show after the first generation completes
        genBtn.addEventListener('generate-done', () => {
            setTimeout(() => overlay.classList.remove('hidden'), 1000);
        }, { once: true });

        closeBtn.addEventListener('click', dismiss);
        dismissBtn.addEventListener('click', dismiss);
        linkBtn.addEventListener('click', dismiss);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) dismiss(); });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !overlay.classList.contains('hidden')) dismiss();
        });
    }
})();

// Screenshot helper — call window.takePreview() from the browser console
// Hides UI, renders at 1200×630 from the current camera angle, downloads preview.png
window.takePreview = function(width = 1200, height = 630) {
    // Save current state
    const savedW = renderer.domElement.width;
    const savedH = renderer.domElement.height;
    const savedAspect = camera.aspect;
    const savedPixelRatio = renderer.getPixelRatio();

    // Hide all UI elements
    const hiddenEls = [];
    for (const sel of ['#ui', '#topInfo', '#info', '#hoverInfo', '#helpBtn',
                        '#editToggle', '#refreshFab', '#rebuildFab', '#mobileViewSwitch',
                        '#buildOverlay', '#tutorialOverlay', '#exportOverlay', '#surveyOverlay', '#whatsNewOverlay']) {
        const el = document.querySelector(sel);
        if (el && el.style.display !== 'none') {
            hiddenEls.push({ el, prev: el.style.display });
            el.style.display = 'none';
        }
    }

    // Keep the current camera angle, just adjust aspect ratio for the output size
    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    // Render at exact target size
    renderer.setPixelRatio(1);
    renderer.setSize(width, height);
    renderer.render(scene, camera);

    // Download
    const link = document.createElement('a');
    link.download = 'preview.png';
    link.href = renderer.domElement.toDataURL('image/png');
    link.click();

    // Restore everything
    renderer.setPixelRatio(savedPixelRatio);
    renderer.setSize(savedW / savedPixelRatio, savedH / savedPixelRatio);
    camera.aspect = savedAspect;
    camera.updateProjectionMatrix();
    for (const { el, prev } of hiddenEls) el.style.display = prev;
    renderer.render(scene, state.mapMode ? mapCamera : camera);
    console.log('preview.png downloaded!');
};

// Go! Check URL hash for a planet code, otherwise random generation.
const hashCode = location.hash.replace(/^#/, '').trim();
const hashParams = hashCode ? decodePlanetCode(hashCode) : null;
if (hashParams) {
    const map = paramsToSliderMap(hashParams);
    for (const [id, val] of Object.entries(map)) {
        const el = document.getElementById(id);
        el.value = val;
        el.dispatchEvent(new Event('input'));
    }
    generate(hashParams.seed, hashParams.toggledIndices, onProgress, shouldSkipClimate());
} else {
    generate(undefined, [], onProgress, shouldSkipClimate());
}
animate();
