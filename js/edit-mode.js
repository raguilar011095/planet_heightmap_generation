// Plate interaction: hover info + ctrl-click to toggle land/sea.
// Uses analytical ray-sphere intersection instead of Three.js mesh raycasting
// for O(N) dot-product lookups rather than O(N) triangle intersection tests.

import * as THREE from 'three';
import { canvas, camera, mapCamera } from './scene.js';
import { state } from './state.js';
import { editRecomputeViaWorker } from './generate.js';
import { computePlateColors, buildMesh, updateHoverHighlight, updateMapHoverHighlight } from './planet-mesh.js';

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const _inverseMatrix = new THREE.Matrix4();
const _localRay = new THREE.Ray();

/** Recompute elevation from the (possibly edited) plate data via worker. */
function recomputeElevation(onDone) {
    editRecomputeViaWorker(onDone);
}

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
    const lon = wx / sx;
    const lat = wy / sx;
    if (lat < -PI / 2 || lat > PI / 2 || lon < -PI || lon > PI) return null;

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
            const { plateIsOcean, plateDensity, plateDensityLand, plateDensityOcean } = state.curData;
            if (plateIsOcean.has(pid)) {
                plateIsOcean.delete(pid);
                plateDensity[pid] = plateDensityLand[pid];
            } else {
                plateIsOcean.add(pid);
                plateDensity[pid] = plateDensityOcean[pid];
            }

            const hoverEl = document.getElementById('hoverInfo');
            hoverEl.innerHTML = '\u23F3 Rebuilding\u2026';
            hoverEl.style.display = 'block';

            const btn = document.getElementById('generate');
            btn.disabled = true;
            btn.textContent = 'Building\u2026';
            btn.classList.add('generating');

            recomputeElevation(() => {
                btn.disabled = false;
                btn.textContent = 'Build New World';
                btn.classList.remove('generating');
                // Update hover info to reflect the new state
                if (state.hoveredPlate >= 0 && state.curData) {
                    const isOcean = state.curData.plateIsOcean.has(state.hoveredPlate);
                    const dot = `<span style="color:${isOcean ? '#4af' : '#6b3'}">\u25CF</span>`;
                    const action = state.isTouchDevice ? 'Tap' : 'Ctrl-click';
                    hoverEl.innerHTML = `${dot} <b>${isOcean ? 'Ocean' : 'Land'}</b> plate &middot; ${action} to ${isOcean ? 'raise land' : 'flood'}`;
                }
                // Notify main.js to update the planet code
                document.dispatchEvent(new CustomEvent('plates-edited'));
            });
        }
        downInfo = null;
    });

    canvas.addEventListener('pointermove', (e) => {
        if (!state.curData) {
            if (state.hoveredPlate >= 0) {
                state.hoveredPlate = -1;
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
        const newPlate = hit ? hit.plate : -1;
        if (newPlate !== state.hoveredPlate) {
            state.hoveredPlate = newPlate;
            if (state.mapMode) updateMapHoverHighlight();
            else updateHoverHighlight();
            const hoverEl = document.getElementById('hoverInfo');
            if (state.hoveredPlate >= 0) {
                const isOcean = state.curData.plateIsOcean.has(state.hoveredPlate);
                const dot = `<span style="color:${isOcean ? '#4af' : '#6b3'}">\u25CF</span>`;
                const typeStr = isOcean ? 'Ocean' : 'Land';
                const action = state.isTouchDevice ? 'Tap' : 'Ctrl-click';
                hoverEl.innerHTML = `${dot} <b>${typeStr}</b> plate &middot; ${action} to ${isOcean ? 'raise land' : 'flood'}`;
                hoverEl.style.display = 'block';
            } else {
                hoverEl.style.display = 'none';
            }
        }
    });
}
