// Interactive plate-motion overlay and controls.
// Canvas plate selection stays in edit-mode.js; this module owns the motion
// arrows, accessible drag handle, speed panel, and pending override previews.

import * as THREE from 'three';
import { canvas, camera, mapCamera, scene } from './scene.js';
import { state } from './state.js';
import {
    bearingToDirection,
    directionToBearing,
    motionBearingDeg,
    motionFromOverride,
    normalizeMotionOverride,
    tangentFrame,
} from './plate-motion.js';

const GLOBE_RADIUS = 1.105;
const MAP_SCALE = 2 / Math.PI;
const HEAD_ANGLE = 28 * Math.PI / 180;
const HEAD_COS = Math.cos(HEAD_ANGLE);
const HEAD_SIN = Math.sin(HEAD_ANGLE);
const COLOR_GENERATED = 0x55c8ff;
const COLOR_APPLIED = 0xb985ff;
const COLOR_PENDING = 0xffad42;
const COLOR_SELECTED = 0xffffff;

let pointerDirectionForEvent = null;
let motionHandle = null;
let motionPanel = null;
let motionPlateLabel = null;
let motionDirectionValue = null;
let motionSpeed = null;
let motionSpeedValue = null;
let motionReset = null;
let selectedGlobeTip = null;
let selectedGlobeAnchor = null;
let selectedMapTip = null;
let draggingHandle = false;
let overlayRefreshQueued = false;

const projectVector = new THREE.Vector3();
const projectAnchor = new THREE.Vector3();
const projectToCamera = new THREE.Vector3();
const yAxis = new THREE.Vector3(0, 1, 0);

function isMotionModeActive() {
    return !!state.curData && state.editMode && state.editTool === 'motion';
}

function overridesEqual(a, b) {
    return !!a && !!b
        && a.bearingDeg === b.bearingDeg
        && a.speedPercent === b.speedPercent;
}

function getAppliedOverride(plateId) {
    return state.curData?.motionOverrides?.get(plateId) || null;
}

export function getEffectiveMotionOverride(plateId) {
    if (state.pendingMotionOverrides.has(plateId)) {
        return state.pendingMotionOverrides.get(plateId);
    }
    return getAppliedOverride(plateId);
}

export function getPlateMotionSummary(plateId) {
    const data = state.curData;
    const generatedMotion = data?.generatedPlateVec?.[plateId];
    const anchor = data?.motionAnchors?.[plateId];
    if (!generatedMotion || !anchor) return null;

    const effectiveOverride = getEffectiveMotionOverride(plateId);
    const fallbackBearing = Math.round(motionBearingDeg(generatedMotion, anchor)) % 360;
    const displayOverride = effectiveOverride == null
        ? { bearingDeg: fallbackBearing, speedPercent: 100 }
        : normalizeMotionOverride(effectiveOverride);
    const motion = effectiveOverride == null
        ? generatedMotion
        : motionFromOverride(generatedMotion, anchor, displayOverride);

    return {
        ...displayOverride,
        motion,
        anchor,
        applied: !!getAppliedOverride(plateId),
        pending: state.pendingMotionOverrides.has(plateId),
        pendingReset: state.pendingMotionOverrides.get(plateId) === null,
    };
}

function cardinalLabel(bearingDeg) {
    const labels = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return labels[Math.round((((bearingDeg % 360) + 360) % 360) / 45) % labels.length];
}

function notifyPendingChanged() {
    refreshPlateMotionEditor();
    document.dispatchEvent(new CustomEvent('pending-edits-changed'));
}

function stageMotionOverride(plateId, rawOverride) {
    const next = normalizeMotionOverride(rawOverride);
    const applied = getAppliedOverride(plateId);
    if (overridesEqual(applied, next)) {
        state.pendingMotionOverrides.delete(plateId);
    } else {
        state.pendingMotionOverrides.set(plateId, next);
    }
    notifyPendingChanged();
}

function stageMotionReset(plateId) {
    if (getAppliedOverride(plateId)) {
        state.pendingMotionOverrides.set(plateId, null);
    } else {
        state.pendingMotionOverrides.delete(plateId);
    }
    notifyPendingChanged();
}

export function selectMotionPlate(plateId) {
    if (!state.curData?.motionAnchors?.[plateId]) return;
    state.selectedMotionPlate = plateId;
    refreshPlateMotionEditor();
}

export function clearMotionSelection() {
    state.selectedMotionPlate = -1;
    refreshPlateMotionEditor();
}

function colorForPlate(plateId, selected) {
    if (selected) return COLOR_SELECTED;
    if (state.pendingMotionOverrides.has(plateId)) return COLOR_PENDING;
    if (getAppliedOverride(plateId)) return COLOR_APPLIED;
    return COLOR_GENERATED;
}

function pushColor(target, color, vertexCount) {
    const c = new THREE.Color(color);
    for (let i = 0; i < vertexCount; i++) target.push(c.r, c.g, c.b);
}

function pushArrow3(target, colors, origin, direction, normal, arrowLength, color) {
    const tip = [
        origin[0] + direction[0] * arrowLength,
        origin[1] + direction[1] * arrowLength,
        origin[2] + direction[2] * arrowLength,
    ];
    const headLength = arrowLength * 0.28;
    const left = [
        tip[0] + (-direction[0] * HEAD_COS + normal[0] * HEAD_SIN) * headLength,
        tip[1] + (-direction[1] * HEAD_COS + normal[1] * HEAD_SIN) * headLength,
        tip[2] + (-direction[2] * HEAD_COS + normal[2] * HEAD_SIN) * headLength,
    ];
    const right = [
        tip[0] + (-direction[0] * HEAD_COS - normal[0] * HEAD_SIN) * headLength,
        tip[1] + (-direction[1] * HEAD_COS - normal[1] * HEAD_SIN) * headLength,
        tip[2] + (-direction[2] * HEAD_COS - normal[2] * HEAD_SIN) * headLength,
    ];
    target.push(...origin, ...tip, ...tip, ...left, ...tip, ...right);
    pushColor(colors, color, 6);
    return tip;
}

function pushArrow2(target, colors, origin, direction, arrowLength, color) {
    const tip = [origin[0] + direction[0] * arrowLength, origin[1] + direction[1] * arrowLength, origin[2]];
    const normal = [-direction[1], direction[0]];
    const headLength = arrowLength * 0.28;
    const left = [
        tip[0] + (-direction[0] * HEAD_COS + normal[0] * HEAD_SIN) * headLength,
        tip[1] + (-direction[1] * HEAD_COS + normal[1] * HEAD_SIN) * headLength,
        origin[2],
    ];
    const right = [
        tip[0] + (-direction[0] * HEAD_COS - normal[0] * HEAD_SIN) * headLength,
        tip[1] + (-direction[1] * HEAD_COS - normal[1] * HEAD_SIN) * headLength,
        origin[2],
    ];
    target.push(...origin, ...tip, ...tip, ...left, ...tip, ...right);
    pushColor(colors, color, 6);
    return tip;
}

function disposeMotionOverlay() {
    if (!state.plateMotionArrowGroup) return;
    state.plateMotionArrowGroup.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
    });
    scene.remove(state.plateMotionArrowGroup);
    state.plateMotionArrowGroup = null;
    selectedGlobeTip = null;
    selectedGlobeAnchor = null;
    selectedMapTip = null;
}

export function updatePlateMotionOverlay() {
    disposeMotionOverlay();
    if (!isMotionModeActive()) {
        if (motionHandle) motionHandle.hidden = true;
        return;
    }

    const data = state.curData;
    const globePositions = [];
    const globeColors = [];
    const mapPositions = [];
    const mapColors = [];
    const selectedPlate = state.selectedMotionPlate;

    for (const plateId of data.plateSeeds) {
        const summary = getPlateMotionSummary(plateId);
        if (!summary) continue;
        const selected = plateId === selectedPlate;
        const color = colorForPlate(plateId, selected);
        const direction = summary.speedPercent === 0
            ? bearingToDirection(summary.anchor, summary.bearingDeg)
            : bearingToDirection(summary.anchor, motionBearingDeg(summary.motion, summary.anchor));
        const normal = [
            summary.anchor[1] * direction[2] - summary.anchor[2] * direction[1],
            summary.anchor[2] * direction[0] - summary.anchor[0] * direction[2],
            summary.anchor[0] * direction[1] - summary.anchor[1] * direction[0],
        ];
        const normalLength = Math.hypot(...normal) || 1;
        normal[0] /= normalLength; normal[1] /= normalLength; normal[2] /= normalLength;

        const globeLength = 0.055 + summary.speedPercent * 0.00032 + (selected ? 0.012 : 0);
        const globeOrigin = summary.anchor.map(value => value * GLOBE_RADIUS);
        const globeTip = pushArrow3(
            globePositions, globeColors, globeOrigin, direction, normal,
            globeLength, color
        );

        let lon = Math.atan2(summary.anchor[0], summary.anchor[2]) - (state.mapCenterLon || 0);
        if (lon > Math.PI) lon -= 2 * Math.PI;
        else if (lon < -Math.PI) lon += 2 * Math.PI;
        const lat = Math.asin(Math.max(-1, Math.min(1, summary.anchor[1])));
        const { north, east } = tangentFrame(summary.anchor);
        let mapDx = direction[0] * east[0] + direction[1] * east[1] + direction[2] * east[2];
        let mapDy = direction[0] * north[0] + direction[1] * north[1] + direction[2] * north[2];
        const mapDirectionLength = Math.hypot(mapDx, mapDy) || 1;
        mapDx /= mapDirectionLength; mapDy /= mapDirectionLength;
        const mapLength = 0.045 + summary.speedPercent * 0.00025 + (selected ? 0.01 : 0);
        const mapOrigin = [lon * MAP_SCALE, lat * MAP_SCALE, 0.025];
        const mapTip = pushArrow2(
            mapPositions, mapColors, mapOrigin, [mapDx, mapDy],
            mapLength, color
        );

        if (selected) {
            selectedGlobeTip = globeTip;
            selectedGlobeAnchor = summary.anchor;
            selectedMapTip = mapTip;
        }
    }

    const root = new THREE.Group();
    const globeGroup = new THREE.Group();
    globeGroup.name = 'plateMotionGlobe';
    globeGroup.visible = !state.mapMode;
    globeGroup.rotation.y = state.planetMesh?.rotation.y || 0;

    if (globePositions.length > 0) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(globePositions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(globeColors, 3));
        const material = new THREE.LineBasicMaterial({
            vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false,
        });
        globeGroup.add(new THREE.LineSegments(geometry, material));
    }
    root.add(globeGroup);

    if (mapPositions.length > 0) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(mapPositions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(mapColors, 3));
        const material = new THREE.LineBasicMaterial({
            vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false,
        });
        const mapLines = new THREE.LineSegments(geometry, material);
        mapLines.name = 'plateMotionMap';
        mapLines.visible = state.mapMode;
        root.add(mapLines);
    }

    state.plateMotionArrowGroup = root;
    scene.add(root);
    tickPlateMotionEditor();
}

function requestOverlayRefresh() {
    if (overlayRefreshQueued) return;
    overlayRefreshQueued = true;
    requestAnimationFrame(() => {
        overlayRefreshQueued = false;
        updatePlateMotionOverlay();
    });
}

function updateMotionPanel() {
    if (!motionPanel) return;
    const plateId = state.selectedMotionPlate;
    const summary = getPlateMotionSummary(plateId);
    const active = isMotionModeActive() && summary;
    motionPanel.hidden = !active;
    if (!active) return;

    const plateIds = Array.from(state.curData.plateSeeds);
    const plateNumber = plateIds.indexOf(plateId) + 1;
    const type = state.curData.plateIsOcean.has(plateId) ? 'Ocean' : 'Land';
    const status = summary.pending ? ' · pending' : (summary.applied ? ' · edited' : '');
    motionPlateLabel.textContent = `Plate ${plateNumber} · ${type}${status}`;
    motionDirectionValue.textContent = `${summary.bearingDeg}° ${cardinalLabel(summary.bearingDeg)}`;
    motionSpeed.value = summary.speedPercent;
    motionSpeedValue.textContent = `${summary.speedPercent}%`;
    motionReset.disabled = !summary.applied && !summary.pending;
}

export function refreshPlateMotionEditor() {
    updateMotionPanel();
    requestOverlayRefresh();
    if (!isMotionModeActive() && motionHandle) motionHandle.hidden = true;
}

function updateDirectionFromPointer(event) {
    if (!pointerDirectionForEvent || state.selectedMotionPlate < 0) return;
    const pointerDirection = pointerDirectionForEvent(event);
    const summary = getPlateMotionSummary(state.selectedMotionPlate);
    if (!pointerDirection || !summary) return;
    const anchor = summary.anchor;
    const projection = pointerDirection[0] * anchor[0]
        + pointerDirection[1] * anchor[1]
        + pointerDirection[2] * anchor[2];
    const tangent = [
        pointerDirection[0] - anchor[0] * projection,
        pointerDirection[1] - anchor[1] * projection,
        pointerDirection[2] - anchor[2] * projection,
    ];
    if (Math.hypot(...tangent) < 1e-7) return;
    stageMotionOverride(state.selectedMotionPlate, {
        bearingDeg: Math.round(directionToBearing(anchor, tangent)),
        speedPercent: summary.speedPercent,
    });
}

export function tickPlateMotionEditor() {
    if (!motionHandle || !isMotionModeActive() || state.selectedMotionPlate < 0) {
        if (motionHandle) motionHandle.hidden = true;
        return;
    }

    let visible = true;
    if (state.mapMode && selectedMapTip) {
        projectVector.set(...selectedMapTip).project(mapCamera);
    } else if (!state.mapMode && selectedGlobeTip && selectedGlobeAnchor) {
        const rotation = state.planetMesh?.rotation.y || 0;
        const globeGroup = state.plateMotionArrowGroup?.getObjectByName('plateMotionGlobe');
        if (globeGroup) globeGroup.rotation.y = rotation;
        projectVector.set(...selectedGlobeTip).applyAxisAngle(yAxis, rotation).project(camera);
        projectAnchor.set(...selectedGlobeAnchor).applyAxisAngle(yAxis, rotation);
        projectToCamera.copy(camera.position).sub(projectAnchor);
        visible = projectAnchor.dot(projectToCamera) > 0;
    } else {
        visible = false;
    }

    visible = visible
        && projectVector.z >= -1 && projectVector.z <= 1
        && projectVector.x >= -1.1 && projectVector.x <= 1.1
        && projectVector.y >= -1.1 && projectVector.y <= 1.1;
    if (!visible) {
        motionHandle.hidden = true;
        return;
    }

    const rect = canvas.getBoundingClientRect();
    motionHandle.style.left = `${rect.left + (projectVector.x + 1) * rect.width * 0.5}px`;
    motionHandle.style.top = `${rect.top + (1 - projectVector.y) * rect.height * 0.5}px`;
    motionHandle.hidden = false;
}

export function setupPlateMotionEditor(getPointerDirection) {
    pointerDirectionForEvent = getPointerDirection;
    motionHandle = document.getElementById('motionHandle');
    motionPanel = document.getElementById('motionPanel');
    motionPlateLabel = document.getElementById('motionPlateLabel');
    motionDirectionValue = document.getElementById('motionDirectionValue');
    motionSpeed = document.getElementById('motionSpeed');
    motionSpeedValue = document.getElementById('motionSpeedValue');
    motionReset = document.getElementById('motionReset');
    if (!motionHandle || !motionPanel || !motionSpeed || !motionReset) return;

    motionHandle.addEventListener('pointerdown', event => {
        if (!isMotionModeActive() || state.selectedMotionPlate < 0) return;
        event.preventDefault();
        event.stopPropagation();
        draggingHandle = true;
        motionHandle.classList.add('dragging');
        motionHandle.setPointerCapture(event.pointerId);
    });
    motionHandle.addEventListener('pointermove', event => {
        if (!draggingHandle) return;
        event.preventDefault();
        updateDirectionFromPointer(event);
    });
    const finishDrag = event => {
        if (!draggingHandle) return;
        draggingHandle = false;
        motionHandle.classList.remove('dragging');
        try { motionHandle.releasePointerCapture(event.pointerId); } catch (_) {}
    };
    motionHandle.addEventListener('pointerup', finishDrag);
    motionHandle.addEventListener('pointercancel', finishDrag);

    motionHandle.addEventListener('keydown', event => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        const summary = getPlateMotionSummary(state.selectedMotionPlate);
        if (!summary) return;
        event.preventDefault();
        const step = event.shiftKey ? 1 : 5;
        const sign = event.key === 'ArrowLeft' ? -1 : 1;
        stageMotionOverride(state.selectedMotionPlate, {
            bearingDeg: summary.bearingDeg + sign * step,
            speedPercent: summary.speedPercent,
        });
    });

    motionSpeed.addEventListener('input', () => {
        const summary = getPlateMotionSummary(state.selectedMotionPlate);
        if (!summary) return;
        stageMotionOverride(state.selectedMotionPlate, {
            bearingDeg: summary.bearingDeg,
            speedPercent: +motionSpeed.value,
        });
    });
    motionReset.addEventListener('click', () => {
        if (state.selectedMotionPlate >= 0) stageMotionReset(state.selectedMotionPlate);
    });
}
