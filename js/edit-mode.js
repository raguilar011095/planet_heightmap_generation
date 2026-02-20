// Edit mode: toggle plates land/sea.
// Also handles pointer hover for plate info display.

import * as THREE from 'three';
import { canvas, camera, ctrl } from './scene.js';
import { state } from './state.js';
import { assignElevation } from './elevation.js';
import { computePlateColors, buildMesh, updateHoverHighlight } from './planet-mesh.js';

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

/** Recompute elevation from the (possibly edited) plate data. */
function recomputeElevation() {
    const { mesh, r_xyz, plateIsOcean, r_plate, plateVec, plateSeeds, plateDensity, noise, seed } = state.curData;
    const nMag   = +document.getElementById('sNs').value;
    const spread = 5;

    const { r_elevation, mountain_r, coastline_r, ocean_r, r_stress } =
        assignElevation(mesh, r_xyz, plateIsOcean, r_plate, plateVec, plateSeeds, noise, nMag, seed, spread, plateDensity);

    const t_elevation = new Float32Array(mesh.numTriangles);
    for (let t = 0; t < mesh.numTriangles; t++) {
        const s0 = 3 * t;
        const a = mesh.s_begin_r(s0), b = mesh.s_begin_r(s0+1), c = mesh.s_begin_r(s0+2);
        t_elevation[t] = (r_elevation[a] + r_elevation[b] + r_elevation[c]) / 3;
    }

    Object.assign(state.curData, { r_elevation, t_elevation, mountain_r, coastline_r, ocean_r, r_stress });
    computePlateColors(plateSeeds, plateIsOcean);
    buildMesh();
}

/** Raycast to find which plate the mouse is over. */
function getHitInfo(event) {
    if (!state.planetMesh || !state.curData) return null;
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObject(state.planetMesh);
    if (hits.length === 0) return null;
    const s = hits[0].faceIndex;
    const region = state.curData.mesh.s_begin_r(s);
    const plate = state.curData.r_plate[region];
    const localPt = hits[0].point.clone().applyMatrix4(
        new THREE.Matrix4().copy(state.planetMesh.matrixWorld).invert()
    );
    return { region, plate, point: localPt };
}

/** Set up all edit-mode and hover event listeners. */
export function setupEditMode() {
    canvas.addEventListener('pointerdown', (e) => {
        if (!state.editMode || !state.curData || e.button !== 0) return;
        const hit = getHitInfo(e);
        if (!hit) return;
        state.dragStart = { x: e.clientX, y: e.clientY, plate: hit.plate };
    });

    canvas.addEventListener('pointerup', (e) => {
        if (!state.editMode || !state.dragStart || !state.curData || e.button !== 0) { state.dragStart = null; return; }

        const dx = e.clientX - state.dragStart.x;
        const dy = e.clientY - state.dragStart.y;
        const dist2 = dx * dx + dy * dy;

        if (dist2 < 36) {
            const pid = state.dragStart.plate;
            const { plateIsOcean, plateDensity, plateDensityLand, plateDensityOcean } = state.curData;
            if (plateIsOcean.has(pid)) {
                plateIsOcean.delete(pid);
                plateDensity[pid] = plateDensityLand[pid];
            } else {
                plateIsOcean.add(pid);
                plateDensity[pid] = plateDensityOcean[pid];
            }
            recomputeElevation();
        }
        state.dragStart = null;
    });

    canvas.addEventListener('pointermove', (e) => {
        if (!state.curData || !state.planetMesh) {
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
            updateHoverHighlight();
            const hoverEl = document.getElementById('hoverInfo');
            if (state.hoveredPlate >= 0) {
                const isOcean = state.curData.plateIsOcean.has(state.hoveredPlate);
                const dot2 = `<span style="color:${isOcean ? '#4af' : '#6b3'}">\u25CF</span>`;
                const typeStr = isOcean ? 'Ocean' : 'Land';
                hoverEl.innerHTML = `${dot2} <b>${typeStr}</b> &nbsp; Click to toggle`;
                hoverEl.style.display = 'block';
            } else {
                hoverEl.style.display = 'none';
            }
        }
    });

    // Edit mode checkbox
    document.getElementById('chkEdit').addEventListener('change', () => {
        state.editMode = document.getElementById('chkEdit').checked;
        document.getElementById('editPanel').style.display = state.editMode ? 'block' : 'none';
        canvas.classList.toggle('edit-active', state.editMode);
        buildMesh();
    });
}
