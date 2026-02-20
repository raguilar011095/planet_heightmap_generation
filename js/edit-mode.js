// Edit mode: toggle plates land/sea, set drift direction, adjust density.
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

function setEditSubMode(mode) {
    state.editSubMode = mode;
    document.getElementById('btnToggle').classList.toggle('active', mode === 'toggle');
    document.getElementById('btnDrift').classList.toggle('active', mode === 'drift');
    document.getElementById('btnDensity').classList.toggle('active', mode === 'density');
    ctrl.enabled = mode !== 'drift';
    const helpText = {
        toggle: 'Click a plate to toggle land/sea',
        drift: 'Click and drag on a plate to set drift direction',
        density: 'Click to increase density (+0.1), Shift+click to decrease (-0.1)'
    };
    document.getElementById('editHelp').textContent = helpText[mode];
}

/** Set up all edit-mode and hover event listeners. */
export function setupEditMode() {
    canvas.addEventListener('pointerdown', (e) => {
        if (!state.editMode || !state.curData || e.button !== 0) return;
        const hit = getHitInfo(e);
        if (!hit) return;
        state.dragStart = { x: e.clientX, y: e.clientY, plate: hit.plate, point: hit.point };
        if (state.editSubMode === 'drift') e.preventDefault();
    });

    canvas.addEventListener('pointerup', (e) => {
        if (!state.editMode || !state.dragStart || !state.curData || e.button !== 0) { state.dragStart = null; return; }

        const dx = e.clientX - state.dragStart.x;
        const dy = e.clientY - state.dragStart.y;
        const dist2 = dx * dx + dy * dy;

        if (state.editSubMode === 'toggle' && dist2 < 36) {
            const pid = state.dragStart.plate;
            if (state.curData.plateIsOcean.has(pid)) state.curData.plateIsOcean.delete(pid);
            else state.curData.plateIsOcean.add(pid);
            recomputeElevation();
        } else if (state.editSubMode === 'drift' && dist2 >= 36) {
            const hit = getHitInfo(e);
            if (hit) {
                const sp = state.dragStart.point, ep = hit.point;
                const ddx = ep.x - sp.x, ddy = ep.y - sp.y, ddz = ep.z - sp.z;
                const len = Math.sqrt(ddx*ddx + ddy*ddy + ddz*ddz) || 1;
                state.curData.plateVec[state.dragStart.plate] = [ddx/len, ddy/len, ddz/len];
                recomputeElevation();
            }
        } else if (state.editSubMode === 'density' && dist2 < 36) {
            const pid = state.dragStart.plate;
            const step = e.shiftKey ? -0.1 : 0.1;
            state.curData.plateDensity[pid] = Math.max(1.0, Math.min(5.0, state.curData.plateDensity[pid] + step));
            recomputeElevation();
            state.hoveredPlate = -1;
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
                const density = state.curData.plateDensity[state.hoveredPlate];
                const vec = state.curData.plateVec[state.hoveredPlate];

                const seedR = state.hoveredPlate;
                const px = state.curData.r_xyz[3*seedR], py = state.curData.r_xyz[3*seedR+1], pz = state.curData.r_xyz[3*seedR+2];
                const pLen = Math.sqrt(px*px+py*py+pz*pz) || 1;
                const nx = px/pLen, ny = py/pLen, nz = pz/pLen;
                const dot = vec[0]*nx + vec[1]*ny + vec[2]*nz;
                const tx = vec[0] - dot*nx, ty = vec[1] - dot*ny, tz = vec[2] - dot*nz;
                const tLen = Math.sqrt(tx*tx+ty*ty+tz*tz);

                let dirLabel = 'stationary';
                if (tLen > 0.01) {
                    const upDot = 0*nx + 0*ny + 1*nz;
                    let enx = 0 - upDot*nx, eny = 0 - upDot*ny, enz = 1 - upDot*nz;
                    const enLen = Math.sqrt(enx*enx+eny*eny+enz*enz) || 1;
                    enx /= enLen; eny /= enLen; enz /= enLen;
                    const eex = eny*nz - enz*ny, eey = enz*nx - enx*nz, eez = enx*ny - eny*nx;
                    const northComp = (tx*enx + ty*eny + tz*enz) / tLen;
                    const eastComp  = (tx*eex + ty*eey + tz*eez) / tLen;
                    const angle = Math.atan2(eastComp, northComp) * 180 / Math.PI;
                    const dirs = ['N','NE','E','SE','S','SW','W','NW'];
                    const idx = Math.round(((angle % 360) + 360) % 360 / 45) % 8;
                    dirLabel = dirs[idx];
                }

                const dot2 = `<span style="color:${isOcean ? '#4af' : '#6b3'}">\u25CF</span>`;
                const typeStr = isOcean ? 'Ocean' : 'Land';
                hoverEl.innerHTML = `${dot2} <b>${typeStr}</b> &nbsp; Density: ${density.toFixed(2)} &nbsp; Drift: ${dirLabel}`;
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
        ctrl.enabled = !(state.editMode && state.editSubMode === 'drift');
        canvas.classList.toggle('edit-active', state.editMode);
        if (state.editMode) {
            document.getElementById('chkPlates').checked = true;
        }
        buildMesh();
    });

    // Sub-mode buttons
    document.getElementById('btnToggle').addEventListener('click', () => setEditSubMode('toggle'));
    document.getElementById('btnDrift').addEventListener('click', () => setEditSubMode('drift'));
    document.getElementById('btnDensity').addEventListener('click', () => setEditSubMode('density'));
}
