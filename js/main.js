// Entry point — wires UI controls, animation loop, and kicks off initial generation.

import * as THREE from 'three';
import { renderer, scene, camera, ctrl, waterMesh, atmosMesh, starsMesh,
         mapCamera, updateMapCameraFrustum, mapCtrl, canvas,
         tickZoom, tickMapZoom } from './scene.js';
import { state } from './state.js';
import { generate } from './generate.js';
import { buildMesh, buildMapMesh } from './planet-mesh.js';
import { setupEditMode } from './edit-mode.js';

// Slider value displays + stale tracking
const sliderIds = ['sN','sP','sCn','sJ','sNs'];
let lastGenValues = {};

function snapshotSliders() {
    for (const id of sliderIds) lastGenValues[id] = document.getElementById(id).value;
}

function checkStale() {
    const btn = document.getElementById('generate');
    if (btn.classList.contains('generating')) return;
    const stale = sliderIds.some(id => document.getElementById(id).value !== lastGenValues[id]);
    btn.classList.toggle('stale', stale);
    btn.textContent = stale ? 'Regenerate' : 'Generate New Planet';
}

for (const [s,v] of [['sN','vN'],['sP','vP'],['sCn','vCn'],['sJ','vJ'],['sNs','vNs']]) {
    document.getElementById(s).addEventListener('input', e => {
        document.getElementById(v).textContent = e.target.value;
        checkStale();
    });
}

// Generate button
const genBtn = document.getElementById('generate');
genBtn.addEventListener('click', generate);
genBtn.addEventListener('generate-done', snapshotSliders);

// View-mode checkboxes
for (const id of ['chkWire','chkPlates'])
    document.getElementById(id).addEventListener('change', buildMesh);

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
        if (!state.mapMesh) buildMapMesh();
        if (state.mapMesh) state.mapMesh.visible = true;
        scene.background = new THREE.Color(0x1a1a2e);
        ctrl.enabled = false;
        mapCtrl.enabled = true;
        mapCamera.position.set(0, 0, 5);
        mapCamera.lookAt(0, 0, 0);
        updateMapCameraFrustum();
        mapCtrl.target.set(0, 0, 0);
        mapCtrl.update();
    } else {
        if (state.planetMesh) state.planetMesh.visible = true;
        atmosMesh.visible = true;
        starsMesh.visible = true;
        if (state.wireMesh) state.wireMesh.visible = true;
        if (state.arrowGroup) state.arrowGroup.visible = true;
        if (state.mapMesh) state.mapMesh.visible = false;
        const showPlates = document.getElementById('chkPlates').checked;
        waterMesh.visible = !showPlates;
        scene.background = new THREE.Color(0x030308);
        mapCtrl.enabled = false;
        ctrl.enabled = true;
    }
});

// Debug layer dropdown
const debugLayerEl = document.getElementById('debugLayer');
if (debugLayerEl) {
    debugLayerEl.addEventListener('change', (e) => {
        state.debugLayer = e.target.value;
        buildMesh();
    });
}

// Edit mode setup (pointer events, sub-mode buttons)
setupEditMode();

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    if (state.mapMode) { tickMapZoom(); mapCtrl.update(); } else { tickZoom(); ctrl.update(); }
    if (!state.mapMode && state.planetMesh && document.getElementById('chkRotate').checked) {
        state.planetMesh.rotation.y += 0.0008;
        waterMesh.rotation.y = state.planetMesh.rotation.y;
        if (state.wireMesh) state.wireMesh.rotation.y = state.planetMesh.rotation.y;
        if (state.arrowGroup) state.arrowGroup.rotation.y = state.planetMesh.rotation.y;
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

// Go!
generate();
animate();
