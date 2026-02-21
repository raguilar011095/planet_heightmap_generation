// Plate interaction: hover info + ctrl-click to toggle land/sea.

import * as THREE from 'three';
import { canvas, camera, mapCamera } from './scene.js';
import { state } from './state.js';
import { assignElevation } from './elevation.js';
import { computePlateColors, buildMesh, updateHoverHighlight, updateMapHoverHighlight } from './planet-mesh.js';

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

/** Recompute elevation from the (possibly edited) plate data. */
function recomputeElevation() {
    const { mesh, r_xyz, plateIsOcean, r_plate, plateVec, plateSeeds, plateDensity, noise, seed } = state.curData;
    const nMag   = +document.getElementById('sNs').value;
    const spread = 5;

    const { r_elevation, mountain_r, coastline_r, ocean_r, r_stress, debugLayers } =
        assignElevation(mesh, r_xyz, plateIsOcean, r_plate, plateVec, plateSeeds, noise, nMag, seed, spread, plateDensity);

    const t_elevation = new Float32Array(mesh.numTriangles);
    for (let t = 0; t < mesh.numTriangles; t++) {
        const s0 = 3 * t;
        const a = mesh.s_begin_r(s0), b = mesh.s_begin_r(s0+1), c = mesh.s_begin_r(s0+2);
        t_elevation[t] = (r_elevation[a] + r_elevation[b] + r_elevation[c]) / 3;
    }

    Object.assign(state.curData, { r_elevation, t_elevation, mountain_r, coastline_r, ocean_r, r_stress, debugLayers });
    computePlateColors(plateSeeds, plateIsOcean);
    buildMesh();
}

/** Raycast to find which plate the mouse is over. */
function getHitInfo(event) {
    if (!state.curData) return null;
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    if (state.mapMode) {
        if (!state.mapMesh || !state.mapFaceToSide) return null;
        raycaster.setFromCamera(mouse, mapCamera);
        const hits = raycaster.intersectObject(state.mapMesh);
        if (hits.length === 0) return null;
        const faceIdx = hits[0].faceIndex;
        const s = state.mapFaceToSide[faceIdx];
        const region = state.curData.mesh.s_begin_r(s);
        const plate = state.curData.r_plate[region];
        return { region, plate };
    } else {
        if (!state.planetMesh) return null;
        raycaster.setFromCamera(mouse, camera);
        const hits = raycaster.intersectObject(state.planetMesh);
        if (hits.length === 0) return null;
        const s = hits[0].faceIndex;
        const region = state.curData.mesh.s_begin_r(s);
        const plate = state.curData.r_plate[region];
        return { region, plate };
    }
}

/** Set up hover and ctrl-click event listeners. */
export function setupEditMode() {
    let downInfo = null;

    canvas.addEventListener('pointerdown', (e) => {
        if (!state.curData || e.button !== 0 || !e.ctrlKey) return;
        const hit = getHitInfo(e);
        if (!hit) return;
        downInfo = { x: e.clientX, y: e.clientY, plate: hit.plate };
    });

    canvas.addEventListener('pointerup', (e) => {
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

            setTimeout(() => {
                recomputeElevation();
                btn.disabled = false;
                btn.textContent = 'Build New World';
                btn.classList.remove('generating');
                // Update hover info to reflect the new state
                if (state.hoveredPlate >= 0 && state.curData) {
                    const isOcean = state.curData.plateIsOcean.has(state.hoveredPlate);
                    const dot = `<span style="color:${isOcean ? '#4af' : '#6b3'}">\u25CF</span>`;
                    hoverEl.innerHTML = `${dot} <b>${isOcean ? 'Ocean' : 'Land'}</b> plate &middot; Ctrl-click to ${isOcean ? 'raise land' : 'flood'}`;
                }
            }, 16);
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
                hoverEl.innerHTML = `${dot} <b>${typeStr}</b> plate &middot; Ctrl-click to ${isOcean ? 'raise land' : 'flood'}`;
                hoverEl.style.display = 'block';
            } else {
                hoverEl.style.display = 'none';
            }
        }
    });
}
