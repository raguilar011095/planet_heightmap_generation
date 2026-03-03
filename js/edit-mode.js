// Plate interaction: hover info + ctrl-click to toggle land/sea.
// Uses analytical ray-sphere intersection instead of Three.js mesh raycasting
// for O(N) dot-product lookups rather than O(N) triangle intersection tests.

import * as THREE from 'three';
import { canvas, camera, mapCamera } from './scene.js';
import { state } from './state.js';
import { updateHoverHighlight, updateMapHoverHighlight, updatePendingHighlight, updateMapPendingHighlight } from './planet-mesh.js';
import { KOPPEN_CLASSES } from './koppen.js';
import { elevToHeightKm } from './color-map.js';

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const _inverseMatrix = new THREE.Matrix4();
const _localRay = new THREE.Ray();

/** Find nearest region to a unit-sphere direction (max dot product). */
function findNearestRegion(nx, ny, nz) {
    const { mesh, r_xyz, r_plate } = state.curData;
    const N = mesh.numRegions;
    let bestDot = -2, bestR = -1;
    for (let r = 0; r < N; r++) {
        const dot = nx * r_xyz[3 * r] + ny * r_xyz[3 * r + 1] + nz * r_xyz[3 * r + 2];
        if (dot > bestDot) { bestDot = dot; bestR = r; }
    }
    if (bestR < 0) return null;
    return { region: bestR, plate: r_plate[bestR] };
}

/** Globe view: analytical ray-sphere intersection → nearest region.
 *  ~50-100x faster than Three.js mesh raycasting at high detail. */
function getHitInfoGlobe(event) {
    if (!state.planetMesh) return null;
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    // Transform ray into planet's local space (handles auto-rotation)
    _inverseMatrix.copy(state.planetMesh.matrixWorld).invert();
    _localRay.copy(raycaster.ray).applyMatrix4(_inverseMatrix);

    const ox = _localRay.origin.x, oy = _localRay.origin.y, oz = _localRay.origin.z;
    const dx = _localRay.direction.x, dy = _localRay.direction.y, dz = _localRay.direction.z;

    // Ray-sphere: |O + tD|² = R²  (a=1 since direction is normalised)
    const R = 1.08; // slightly above max elevation displacement
    const b = 2 * (ox * dx + oy * dy + oz * dz);
    const c = ox * ox + oy * oy + oz * oz - R * R;
    const disc = b * b - 4 * c;
    if (disc < 0) return null;

    const t = (-b - Math.sqrt(disc)) * 0.5;
    if (t < 0) return null;

    // Hit point → normalise to unit direction
    const hx = ox + t * dx, hy = oy + t * dy, hz = oz + t * dz;
    const len = Math.sqrt(hx * hx + hy * hy + hz * hz) || 1;
    return findNearestRegion(hx / len, hy / len, hz / len);
}

/** Map view: unproject mouse → map plane → inverse equirect → nearest region. */
function getHitInfoMap(event) {
    if (!state.mapMesh) return null;
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Intersect ray with z=0 plane to get world coords on the map
    raycaster.setFromCamera(mouse, mapCamera);
    const o = raycaster.ray.origin, d = raycaster.ray.direction;
    if (Math.abs(d.z) < 1e-10) return null;
    const t = -o.z / d.z;
    const wx = o.x + t * d.x;
    const wy = o.y + t * d.y;

    // Inverse equirectangular: map coords → lon/lat → unit sphere xyz
    const PI = Math.PI;
    const sx = 2 / PI;
    let lon = wx / sx + (state.mapCenterLon || 0);
    const lat = wy / sx;
    if (lat < -PI / 2 || lat > PI / 2) return null;
    // Wrap lon back to [-PI, PI]
    if (lon > PI) lon -= 2 * PI;
    else if (lon < -PI) lon += 2 * PI;

    const cosLat = Math.cos(lat);
    return findNearestRegion(
        cosLat * Math.sin(lon),
        Math.sin(lat),
        cosLat * Math.cos(lon)
    );
}

function getHitInfo(event) {
    if (!state.curData) return null;
    return state.mapMode ? getHitInfoMap(event) : getHitInfoGlobe(event);
}

/** Build multi-line hover HTML for a region. */
function buildHoverHTML(region, plate) {
    const d = state.curData;
    const isOcean = d.plateIsOcean.has(plate);
    const isPending = state.pendingToggles.has(plate);
    const dot = `<span style="color:${isOcean ? '#4af' : '#6b3'}">●</span>`;
    const action = state.isTouchDevice ? 'Tap' : 'Ctrl-click';
    const lines = [];

    // Line 1: plate type + edit hint
    if (isPending) {
        const target = isOcean ? 'Land' : 'Ocean';
        lines.push(`${dot} <b>${isOcean ? 'Ocean' : 'Land'} → ${target}</b> <span style="color:#fa0">(pending)</span> · ${action} to undo`);
    } else {
        lines.push(`${dot} <b>${isOcean ? 'Ocean' : 'Land'}</b> plate · ${action} to ${isOcean ? 'raise land' : 'flood'}`);
    }

    // Elevation
    const elev = d.r_elevation[region];
    const elevKm = elevToHeightKm(elev).toFixed(1);
    lines.push(`<span class="hi-label">Elev</span> ${elevKm} km`);

    // Lat/Lon from r_xyz
    const x = d.r_xyz[3 * region];
    const y = d.r_xyz[3 * region + 1];
    const z = d.r_xyz[3 * region + 2];
    const lat = Math.asin(Math.max(-1, Math.min(1, y))) * (180 / Math.PI);
    const lon = Math.atan2(x, z) * (180 / Math.PI);
    const latStr = Math.abs(lat).toFixed(1) + '°' + (lat >= 0 ? 'N' : 'S');
    const lonStr = Math.abs(lon).toFixed(1) + '°' + (lon >= 0 ? 'E' : 'W');
    lines.push(`<span class="hi-label">Coord</span> ${latStr}, ${lonStr}`);

    // Climate data (only if computed)
    if (state.climateComputed && d.r_temperature_summer) {
        const tS = -45 + Math.max(0, Math.min(1, d.r_temperature_summer[region])) * 90;
        const tW = -45 + Math.max(0, Math.min(1, d.r_temperature_winter[region])) * 90;
        if (elev <= 0) {
            // Ocean: show as SST
            lines.push(`<span class="hi-label">SST</span> ${tS.toFixed(0)}°C / ${tW.toFixed(0)}°C`);
        } else {
            lines.push(`<span class="hi-label">Temp</span> ${tS.toFixed(0)}°C / ${tW.toFixed(0)}°C`);

            // Precipitation (land only)
            if (d.r_precip_summer) {
                const pS = (Math.max(0, Math.min(1, d.r_precip_summer[region])) * 1000).toFixed(0);
                const pW = (Math.max(0, Math.min(1, d.r_precip_winter[region])) * 1000).toFixed(0);
                lines.push(`<span class="hi-label">Precip</span> ${pS} / ${pW} mm`);
            }

            // Köppen (land only)
            if (d.debugLayers && d.debugLayers.koppen) {
                const kIdx = d.debugLayers.koppen[region];
                const kc = KOPPEN_CLASSES[kIdx];
                if (kc && kc.code !== 'Ocean') {
                    const [r, g, b] = kc.color;
                    const hex = '#' + [r, g, b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
                    lines.push(`<span class="hi-label">Clima</span> <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${hex};vertical-align:middle;margin-right:4px"></span>${kc.code} — ${kc.name}`);
                }
            }
        }
    }

    return lines.join('<br>');
}

/** Set up hover and ctrl-click event listeners. */
export function setupEditMode() {
    let downInfo = null;
    let orbiting = false;
    let lastHoverTime = 0;
    const HOVER_INTERVAL = 50; // ms — cap hover lookups

    canvas.addEventListener('pointerdown', (e) => {
        if (!state.curData) return;
        const isEditTap = (e.button === 0 && e.ctrlKey) ||
                          (e.button === 0 && state.isTouchDevice && state.editMode);
        if (isEditTap) {
            // Ctrl-click or mobile edit-mode tap: plate editing
            const hit = getHitInfo(e);
            if (!hit) return;
            downInfo = { x: e.clientX, y: e.clientY, plate: hit.plate };
        } else if (e.button === 0 || e.button === 2) {
            // Regular click/right-click: orbit or pan — skip hover raycasts
            orbiting = true;
        }
    });

    canvas.addEventListener('pointerup', (e) => {
        orbiting = false;
        if (!downInfo || !state.curData || e.button !== 0) { downInfo = null; return; }

        const dx = e.clientX - downInfo.x;
        const dy = e.clientY - downInfo.y;

        if (dx * dx + dy * dy < 36) {
            const pid = downInfo.plate;
            // Toggle pending: add if absent, remove if present (undo)
            if (state.pendingToggles.has(pid)) {
                state.pendingToggles.delete(pid);
            } else {
                state.pendingToggles.add(pid);
            }
            // Remove hover highlight first so pending tint applies to base colors.
            // Hover saves its backup from pre-pending colors; if we don't strip it,
            // the hover restore in updateHoverHighlight wipes out the pending tint.
            const savedHover = state.hoveredPlate;
            state.hoveredPlate = -1;
            if (state.mapMode) updateMapHoverHighlight();
            else updateHoverHighlight();
            state.hoveredPlate = savedHover;
            // Apply pending tint to the now-clean base colors
            updatePendingHighlight();
            updateMapPendingHighlight();
            // Re-apply hover on top of pending-tinted colors
            if (state.mapMode) updateMapHoverHighlight();
            else updateHoverHighlight();
            // Update hover text to reflect pending state
            const hoverEl = document.getElementById('hoverInfo');
            if (state.hoveredRegion >= 0 && state.curData) {
                hoverEl.innerHTML = buildHoverHTML(state.hoveredRegion, state.hoveredPlate);
            }
            // Notify main.js to show/hide rebuild button
            document.dispatchEvent(new CustomEvent('pending-edits-changed'));
        }
        downInfo = null;
    });

    canvas.addEventListener('pointermove', (e) => {
        if (!state.curData) {
            if (state.hoveredPlate >= 0 || state.hoveredRegion >= 0) {
                state.hoveredPlate = -1;
                state.hoveredRegion = -1;
                document.getElementById('hoverInfo').style.display = 'none';
            }
            return;
        }

        // Skip while orbiting/panning — no hover lookup during drag
        if (orbiting) return;

        // Throttle hover updates
        const now = performance.now();
        if (now - lastHoverTime < HOVER_INTERVAL) return;
        lastHoverTime = now;

        const hit = getHitInfo(e);
        const newRegion = hit ? hit.region : -1;
        // Only highlight the plate when in edit mode (Ctrl held or mobile edit toggle)
        const inEditMode = e.ctrlKey || (state.isTouchDevice && state.editMode);
        const newPlate = (hit && inEditMode) ? hit.plate : -1;

        // Update plate highlight only when plate changes
        if (newPlate !== state.hoveredPlate) {
            state.hoveredPlate = newPlate;
            if (state.mapMode) updateMapHoverHighlight();
            else updateHoverHighlight();
        }

        // Update info text when region changes
        if (newRegion !== state.hoveredRegion) {
            state.hoveredRegion = newRegion;
            state.hoveredPlate = (hit && inEditMode) ? hit.plate : -1;
            const hoverEl = document.getElementById('hoverInfo');
            if (newRegion >= 0) {
                hoverEl.innerHTML = buildHoverHTML(newRegion, hit.plate);
                hoverEl.style.display = 'block';
            } else {
                hoverEl.style.display = 'none';
            }
        }
    });
}
