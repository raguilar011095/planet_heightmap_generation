// Planet mesh construction: Voronoi geometry, map projection, overlays.

import * as THREE from 'three';
import { renderer, scene, waterMesh, atmosMesh, starsMesh } from './scene.js';
import { state } from './state.js';
import { elevationToColor, elevToHeightKm } from './color-map.js';
import { makeRng } from './rng.js';
import { KOPPEN_CLASSES } from './koppen.js';

// Grayscale heightmap: black (lowest) → white (highest), in physical height space
function heightmapColor(elevation, minH, maxH) {
    const h = elevToHeightKm(elevation);
    const range = maxH - minH || 1;
    const t = Math.max(0, Math.min(1, (h - minH) / range));
    return [t, t, t];
}

// Land heightmap: ocean = black, land = black (sea level) → white (highest peak), in physical height space
function landHeightmapColor(elevation, maxH) {
    if (elevation <= 0) return [0, 0, 0];
    const t = Math.max(0, Math.min(1, elevToHeightKm(elevation) / (maxH || 1)));
    return [t, t, t];
}

// Diverging color map: blue (negative) → white (zero) → red (positive)
function debugValueToColor(v, minV, maxV) {
    const range = Math.max(Math.abs(minV), Math.abs(maxV)) || 1;
    const t = Math.max(-1, Math.min(1, v / range)); // normalise to [-1, 1]
    if (t < 0) {
        const s = -t; // 0→1
        return [1 - s * 0.7, 1 - s * 0.7, 1];           // white → blue
    } else {
        const s = t;  // 0→1
        return [1, 1 - s * 0.75, 1 - s * 0.75];          // white → red
    }
}

// Precipitation debug color: brown (dry) → green (moderate) → blue (wet)
function precipitationColor(value) {
    // value is 0–1 (p95-normalized)
    const t = Math.max(0, Math.min(1, value));
    if (t < 0.25) {
        // Very dry: tan/brown
        const s = t / 0.25;
        return [0.76 - s * 0.16, 0.60 - s * 0.05, 0.42 - s * 0.12];
    } else if (t < 0.5) {
        // Dry to moderate: brown → green
        const s = (t - 0.25) / 0.25;
        return [0.60 - s * 0.30, 0.55 + s * 0.20, 0.30 - s * 0.05];
    } else if (t < 0.75) {
        // Moderate to wet: green → teal
        const s = (t - 0.5) / 0.25;
        return [0.30 - s * 0.15, 0.75 - s * 0.10, 0.25 + s * 0.40];
    } else {
        // Wet to very wet: teal → deep blue
        const s = (t - 0.75) / 0.25;
        return [0.15 - s * 0.05, 0.65 - s * 0.35, 0.65 + s * 0.20];
    }
}

// Temperature debug color: discrete bands matching real climate map style.
// Input is 0-1 normalized from -45 to +45 C. Convert back to C for thresholds.
function temperatureColor(value) {
    const T = -45 + Math.max(0, Math.min(1, value)) * 90;
    if (T < -38) return [0.78, 0.78, 0.78];       // White-gray
    if (T <   0) return [0.00, 0.00, 0.50];        // Dark blue
    if (T <  10) return [0.53, 0.81, 0.92];        // Light blue
    if (T <  18) return [1.00, 1.00, 0.00];        // Yellow
    if (T <  22) return [1.00, 0.65, 0.00];        // Orange
    if (T <  32) return [1.00, 0.00, 0.00];        // Red
    if (T <  40) return [0.55, 0.00, 0.00];        // Dark red
    return [0.20, 0.00, 0.00];                      // Darker red
}

// Köppen climate class color: returns [r,g,b] from KOPPEN_CLASSES lookup.
function koppenColor(classId) {
    const c = KOPPEN_CLASSES[classId] || KOPPEN_CLASSES[0];
    return c.color;
}

// Plate colours — green shades for land, blue for ocean.
export function computePlateColors(plateSeeds, plateIsOcean) {
    state.plateColors = {};
    for (const r of plateSeeds) {
        const rng = makeRng(r);
        if (plateIsOcean.has(r)) {
            const h = 0.55 + rng() * 0.10;
            const s = 0.40 + rng() * 0.30;
            const l = 0.35 + rng() * 0.20;
            state.plateColors[r] = new THREE.Color().setHSL(h, s, l);
        } else {
            const h = 0.25 + rng() * 0.15;
            const s = 0.30 + rng() * 0.30;
            const l = 0.30 + rng() * 0.20;
            state.plateColors[r] = new THREE.Color().setHSL(h, s, l);
        }
    }
}

// Build equirectangular map mesh.
export function buildMapMesh() {
    if (state.mapMesh) { scene.remove(state.mapMesh); state.mapMesh.geometry.dispose(); state.mapMesh.material.dispose(); state.mapMesh = null; }
    if (!state.curData || !state.mapMode) return;

    const { mesh, r_xyz, t_xyz, r_plate, r_elevation, t_elevation, mountain_r, coastline_r, ocean_r, r_stress, debugLayers } = state.curData;
    const showPlates = document.getElementById('chkPlates').checked;
    const showStress = false;
    const waterLevel = 0;
    const debugLayer = state.debugLayer || '';

    let dbgArr = null, dbgMin = 0, dbgMax = 0;
    const isHeightmap = debugLayer === 'heightmap';
    const isLandHeightmap = debugLayer === 'landheightmap';
    const isOceanCurrent = debugLayer === 'oceanCurrentSummer' || debugLayer === 'oceanCurrentWinter';
    const oceanSeason = debugLayer === 'oceanCurrentWinter' ? 'winter' : 'summer';
    const oceanWarmth = isOceanCurrent ? state.curData[`r_ocean_warmth_${oceanSeason}`] : null;
    const oceanSpeed = isOceanCurrent ? state.curData[`r_ocean_speed_${oceanSeason}`] : null;
    if (isOceanCurrent && (!oceanWarmth || !oceanSpeed)) {
        console.warn(`[buildMapMesh] Ocean current layer "${debugLayer}" selected but data missing (warmth=${!!oceanWarmth}, speed=${!!oceanSpeed}). Hard-refresh (Ctrl+Shift+R) and generate a new planet.`);
    }
    const isPrecip = debugLayer === 'precipSummer' || debugLayer === 'precipWinter';
    const precipArr = isPrecip ? (debugLayers && debugLayers[debugLayer]) : null;
    const isTemp = debugLayer === 'tempSummer' || debugLayer === 'tempWinter';
    const tempArr = isTemp ? (debugLayers && debugLayers[debugLayer]) : null;
    const isKoppen = debugLayer === 'koppen';
    const koppenArr = isKoppen ? (debugLayers && debugLayers.koppen) : null;
    if (!isHeightmap && !isLandHeightmap && !isOceanCurrent && !isPrecip && !isTemp && !isKoppen && debugLayer && debugLayers && debugLayers[debugLayer]) {
        dbgArr = debugLayers[debugLayer];
        for (let r = 0; r < mesh.numRegions; r++) {
            if (dbgArr[r] < dbgMin) dbgMin = dbgArr[r];
            if (dbgArr[r] > dbgMax) dbgMax = dbgArr[r];
        }
    }

    let elevMin = Infinity, elevMax = -Infinity;
    if (isHeightmap || isLandHeightmap) {
        for (let r = 0; r < mesh.numRegions; r++) {
            const h = elevToHeightKm(r_elevation[r]);
            if (h < elevMin) elevMin = h;
            if (h > elevMax) elevMax = h;
        }
    }

    const { numSides } = mesh;
    const PI = Math.PI;

    // Pre-count antimeridian-wrapping sides to allocate tight buffers
    let wrapCount = 0;
    for (let s = 0; s < numSides; s++) {
        const it = mesh.s_inner_t(s), ot = mesh.s_outer_t(s), br = mesh.s_begin_r(s);
        const lon0 = Math.atan2(t_xyz[3*it], t_xyz[3*it+2]);
        const lon1 = Math.atan2(t_xyz[3*ot], t_xyz[3*ot+2]);
        const lon2 = Math.atan2(r_xyz[3*br], r_xyz[3*br+2]);
        if (Math.max(lon0, lon1, lon2) - Math.min(lon0, lon1, lon2) > PI) wrapCount++;
    }

    const totalTris = numSides + wrapCount;
    const posArr = new Float32Array(totalTris * 9);
    const colArr = new Float32Array(totalTris * 9);
    const faceToSide = new Int32Array(totalTris);
    let triCount = 0;

    for (let s = 0; s < numSides; s++) {
        const it = mesh.s_inner_t(s);
        const ot = mesh.s_outer_t(s);
        const br = mesh.s_begin_r(s);

        const re = r_elevation[br] - waterLevel;
        let cr, cg, cb;
        if (isKoppen && koppenArr) {
            [cr, cg, cb] = koppenColor(koppenArr[br]);
        } else if (isTemp && tempArr) {
            [cr, cg, cb] = temperatureColor(tempArr[br]);
        } else if (isPrecip && precipArr) {
            [cr, cg, cb] = precipitationColor(precipArr[br]);
        } else if (isOceanCurrent && oceanWarmth && oceanSpeed) {
            [cr, cg, cb] = oceanCurrentColor(oceanWarmth[br], oceanSpeed[br], r_elevation[br] <= 0);
        } else if (isOceanCurrent) {
            // Ocean layer selected but data missing — show magenta so it's obvious
            cr = 0.5; cg = 0; cb = 0.5;
        } else if (isLandHeightmap) {
            [cr, cg, cb] = landHeightmapColor(r_elevation[br], elevMax);
        } else if (isHeightmap) {
            [cr, cg, cb] = heightmapColor(r_elevation[br], elevMin, elevMax);
        } else if (dbgArr) {
            [cr, cg, cb] = debugValueToColor(dbgArr[br], dbgMin, dbgMax);
        } else if (showPlates) {
            const pc = state.plateColors[r_plate[br]] || new THREE.Color(0.3,0.3,0.3);
            cr = pc.r; cg = pc.g; cb = pc.b;
        } else if (showStress) {
            const sv = r_stress ? r_stress[br] : 0;
            if (sv > 0.5)                     { cr=0.9; cg=0.1+sv*0.3; cb=0.1; }
            else if (sv > 0.1)                { cr=0.9; cg=0.5+sv*0.5; cb=0.2; }
            else if (mountain_r.has(br))      { cr=0.8; cg=0.4; cb=0.1; }
            else if (coastline_r.has(br))     { cr=0.9; cg=0.9; cb=0.2; }
            else if (ocean_r.has(br))         { cr=0.1; cg=0.2; cb=0.7; }
            else                              { cr=0.15; cg=0.15; cb=0.18; }
        } else {
            [cr, cg, cb] = elevationToColor(re);
        }

        const x0 = t_xyz[3*it], y0 = t_xyz[3*it+1], z0 = t_xyz[3*it+2];
        const x1 = t_xyz[3*ot], y1 = t_xyz[3*ot+1], z1 = t_xyz[3*ot+2];
        const x2 = r_xyz[3*br], y2 = r_xyz[3*br+1], z2 = r_xyz[3*br+2];

        let lon0 = Math.atan2(x0, z0), lat0 = Math.asin(Math.max(-1, Math.min(1, y0)));
        let lon1 = Math.atan2(x1, z1), lat1 = Math.asin(Math.max(-1, Math.min(1, y1)));
        let lon2 = Math.atan2(x2, z2), lat2 = Math.asin(Math.max(-1, Math.min(1, y2)));

        const sx = 2 / PI;
        const maxLon = Math.max(lon0, lon1, lon2);
        const minLon = Math.min(lon0, lon1, lon2);
        const wraps = (maxLon - minLon) > PI;

        // Clamp projected coords to map bounds
        const cx = (v) => Math.max(-2, Math.min(2, v));
        const cy = (v) => Math.max(-1, Math.min(1, v));

        if (wraps) {
            if (lon0 < 0) lon0 += 2 * PI;
            if (lon1 < 0) lon1 += 2 * PI;
            if (lon2 < 0) lon2 += 2 * PI;

            let off = triCount * 9;
            posArr[off]   = cx(lon0*sx); posArr[off+1] = cy(lat0*sx); posArr[off+2] = 0;
            posArr[off+3] = cx(lon1*sx); posArr[off+4] = cy(lat1*sx); posArr[off+5] = 0;
            posArr[off+6] = cx(lon2*sx); posArr[off+7] = cy(lat2*sx); posArr[off+8] = 0;
            colArr[off]=cr; colArr[off+1]=cg; colArr[off+2]=cb;
            colArr[off+3]=cr; colArr[off+4]=cg; colArr[off+5]=cb;
            colArr[off+6]=cr; colArr[off+7]=cg; colArr[off+8]=cb;
            faceToSide[triCount] = s;
            triCount++;

            off = triCount * 9;
            posArr[off]   = cx((lon0-2*PI)*sx); posArr[off+1] = cy(lat0*sx); posArr[off+2] = 0;
            posArr[off+3] = cx((lon1-2*PI)*sx); posArr[off+4] = cy(lat1*sx); posArr[off+5] = 0;
            posArr[off+6] = cx((lon2-2*PI)*sx); posArr[off+7] = cy(lat2*sx); posArr[off+8] = 0;
            colArr[off]=cr; colArr[off+1]=cg; colArr[off+2]=cb;
            colArr[off+3]=cr; colArr[off+4]=cg; colArr[off+5]=cb;
            colArr[off+6]=cr; colArr[off+7]=cg; colArr[off+8]=cb;
            faceToSide[triCount] = s;
            triCount++;
        } else {
            const off = triCount * 9;
            posArr[off]   = cx(lon0*sx); posArr[off+1] = cy(lat0*sx); posArr[off+2] = 0;
            posArr[off+3] = cx(lon1*sx); posArr[off+4] = cy(lat1*sx); posArr[off+5] = 0;
            posArr[off+6] = cx(lon2*sx); posArr[off+7] = cy(lat2*sx); posArr[off+8] = 0;
            colArr[off]=cr; colArr[off+1]=cg; colArr[off+2]=cb;
            colArr[off+3]=cr; colArr[off+4]=cg; colArr[off+5]=cb;
            colArr[off+6]=cr; colArr[off+7]=cg; colArr[off+8]=cb;
            faceToSide[triCount] = s;
            triCount++;
        }
    }

    const finalPos = posArr.subarray(0, triCount * 9);
    const finalCol = colArr.subarray(0, triCount * 9);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(finalPos), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(finalCol), 3));

    state.mapMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    state.mapMesh.visible = state.mapMode;
    state.mapFaceToSide = faceToSide.subarray(0, triCount);
    state.mapBaseColors = new Float32Array(finalCol);
    scene.add(state.mapMesh);

    buildMapGrid();
}

// Build lat/lon grid overlay for map view.
function buildMapGrid() {
    if (state.mapGridMesh) {
        scene.remove(state.mapGridMesh);
        state.mapGridMesh.geometry.dispose();
        state.mapGridMesh.material.dispose();
        state.mapGridMesh = null;
    }

    const spacing = state.gridSpacing;
    const sx = 2 / Math.PI;
    const Z = 0.001;
    const positions = [];

    for (let deg = -90; deg <= 90; deg += spacing) {
        const y = (deg * Math.PI / 180) * sx;
        positions.push(-2, y, Z, 2, y, Z);
    }

    for (let deg = -180; deg <= 180; deg += spacing) {
        const x = (deg * Math.PI / 180) * sx;
        positions.push(x, -1, Z, x, 1, Z);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    state.mapGridMesh = new THREE.LineSegments(geo,
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12 }));
    state.mapGridMesh.visible = state.mapMode && state.gridEnabled;
    scene.add(state.mapGridMesh);
}

// Build lat/lon grid on the 3D globe.
function buildGlobeGrid() {
    if (state.globeGridMesh) {
        scene.remove(state.globeGridMesh);
        state.globeGridMesh.geometry.dispose();
        state.globeGridMesh.material.dispose();
        state.globeGridMesh = null;
    }

    const spacing = state.gridSpacing;
    const R = 1.002; // slightly above water sphere
    const SEG = 120;  // segments per circle
    const positions = [];

    // Latitude lines
    for (let deg = -90; deg <= 90; deg += spacing) {
        if (deg === -90 || deg === 90) continue; // poles are points, skip
        const lat = deg * Math.PI / 180;
        const cosLat = Math.cos(lat);
        const y = Math.sin(lat) * R;
        for (let i = 0; i < SEG; i++) {
            const lon0 = (i / SEG) * Math.PI * 2;
            const lon1 = ((i + 1) / SEG) * Math.PI * 2;
            positions.push(
                Math.sin(lon0) * cosLat * R, y, Math.cos(lon0) * cosLat * R,
                Math.sin(lon1) * cosLat * R, y, Math.cos(lon1) * cosLat * R
            );
        }
    }

    // Longitude lines (semicircles pole to pole)
    for (let deg = -180; deg < 180; deg += spacing) {
        const lon = deg * Math.PI / 180;
        const sinLon = Math.sin(lon);
        const cosLon = Math.cos(lon);
        for (let i = 0; i < SEG; i++) {
            const lat0 = -Math.PI / 2 + (i / SEG) * Math.PI;
            const lat1 = -Math.PI / 2 + ((i + 1) / SEG) * Math.PI;
            positions.push(
                sinLon * Math.cos(lat0) * R, Math.sin(lat0) * R, cosLon * Math.cos(lat0) * R,
                sinLon * Math.cos(lat1) * R, Math.sin(lat1) * R, cosLon * Math.cos(lat1) * R
            );
        }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const gridMat = new THREE.ShaderMaterial({
        uniforms: {
            color: { value: new THREE.Color(0xffffff) },
            opacity: { value: 0.12 }
        },
        vertexShader: `
            void main() {
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                gl_Position.z -= 0.002 * gl_Position.w; // depth bias: render on top of nearby surfaces
            }
        `,
        fragmentShader: `
            uniform vec3 color;
            uniform float opacity;
            void main() {
                gl_FragColor = vec4(color, opacity);
            }
        `,
        transparent: true,
        depthWrite: false
    });
    state.globeGridMesh = new THREE.LineSegments(geo, gridMat);
    state.globeGridMesh.visible = !state.mapMode && state.gridEnabled;
    scene.add(state.globeGridMesh);
}

// Rebuild both grids (call when spacing changes).
export function rebuildGrids() {
    buildMapGrid();
    buildGlobeGrid();
}

// Ocean current debug color: warmth × speed, with gray land.
function oceanCurrentColor(warmth, speed, isOcean) {
    if (!isOcean) return [0.45, 0.45, 0.45]; // gray land

    // speed is 0-1 (p95 normalized); ensure even low-speed areas are clearly visible
    const intensity = Math.pow(Math.min(1, speed * 3), 0.6); // gamma curve for more visible low values
    // Minimum brightness so all ocean is distinguishable from land and black background
    const base = 0.12;

    if (warmth > 0.05) {
        // Warm (poleward) → dark red-orange to bright red
        const w = Math.min(1, warmth * 1.5);
        const t = base + (1 - base) * w * intensity;
        return [t, base * 0.4 + t * 0.1, base * 0.3];
    } else if (warmth < -0.05) {
        // Cold (equatorward) → dark blue to bright blue
        const w = Math.min(1, -warmth * 1.5);
        const t = base + (1 - base) * w * intensity;
        return [base * 0.3, base * 0.5 + t * 0.15, t];
    } else {
        // Neutral (zonal) → dark teal-gray
        const t = base + intensity * 0.45;
        return [t * 0.55, t * 0.7, t * 0.65];
    }
}

// Build Voronoi mesh — each half-edge produces one triangle.
export function buildMesh() {
    if (!state.curData) return;
    const { mesh, r_xyz, t_xyz, r_plate, r_elevation, t_elevation, mountain_r, coastline_r, ocean_r, r_stress, debugLayers } = state.curData;
    const showPlates = document.getElementById('chkPlates').checked;
    const showStress = false;
    const waterLevel = 0;
    const debugLayer = state.debugLayer || '';

    // Precompute debug layer min/max if active
    let dbgArr = null, dbgMin = 0, dbgMax = 0;
    const isHeightmap = debugLayer === 'heightmap';
    const isLandHeightmap = debugLayer === 'landheightmap';
    const isOceanCurrent = debugLayer === 'oceanCurrentSummer' || debugLayer === 'oceanCurrentWinter';
    const oceanSeason = debugLayer === 'oceanCurrentWinter' ? 'winter' : 'summer';
    const oceanWarmth = isOceanCurrent ? state.curData[`r_ocean_warmth_${oceanSeason}`] : null;
    const oceanSpeed = isOceanCurrent ? state.curData[`r_ocean_speed_${oceanSeason}`] : null;
    if (isOceanCurrent && (!oceanWarmth || !oceanSpeed)) {
        console.warn(`[buildMesh] Ocean current layer "${debugLayer}" selected but data missing (warmth=${!!oceanWarmth}, speed=${!!oceanSpeed}). Hard-refresh (Ctrl+Shift+R) and generate a new planet.`);
    }
    const isPrecip = debugLayer === 'precipSummer' || debugLayer === 'precipWinter';
    const precipArr = isPrecip ? (debugLayers && debugLayers[debugLayer]) : null;
    const isTemp = debugLayer === 'tempSummer' || debugLayer === 'tempWinter';
    const tempArr = isTemp ? (debugLayers && debugLayers[debugLayer]) : null;
    const isKoppen = debugLayer === 'koppen';
    const koppenArr = isKoppen ? (debugLayers && debugLayers.koppen) : null;
    if (!isHeightmap && !isLandHeightmap && !isOceanCurrent && !isPrecip && !isTemp && !isKoppen && debugLayer && debugLayers && debugLayers[debugLayer]) {
        dbgArr = debugLayers[debugLayer];
        for (let r = 0; r < mesh.numRegions; r++) {
            if (dbgArr[r] < dbgMin) dbgMin = dbgArr[r];
            if (dbgArr[r] > dbgMax) dbgMax = dbgArr[r];
        }
    }

    let elevMin = Infinity, elevMax = -Infinity;
    if (isHeightmap || isLandHeightmap) {
        for (let r = 0; r < mesh.numRegions; r++) {
            const h = elevToHeightKm(r_elevation[r]);
            if (h < elevMin) elevMin = h;
            if (h > elevMax) elevMax = h;
        }
    }

    if (state.planetMesh) { scene.remove(state.planetMesh); state.planetMesh.geometry.dispose(); state.planetMesh.material.dispose(); }
    if (state.wireMesh)   { scene.remove(state.wireMesh);   state.wireMesh.geometry.dispose();   state.wireMesh.material.dispose(); }

    const { numSides } = mesh;
    const V = 0.04;
    const pos = new Float32Array(numSides * 9);
    const col = new Float32Array(numSides * 9);
    const nrm = new Float32Array(numSides * 9);

    for (let s = 0; s < numSides; s++) {
        const it = mesh.s_inner_t(s);
        const ot = mesh.s_outer_t(s);
        const br = mesh.s_begin_r(s);

        const re  = r_elevation[br]  - waterLevel;
        const ite = t_elevation[it]  - waterLevel;
        const ote = t_elevation[ot]  - waterLevel;

        const rDisp  = 1.0 + (re  > 0 ? re  * V : re  * V * 0.3);
        const itDisp = 1.0 + (ite > 0 ? ite * V : ite * V * 0.3);
        const otDisp = 1.0 + (ote > 0 ? ote * V : ote * V * 0.3);

        const off = s * 9;
        let v0x = t_xyz[3*it]   * itDisp,
            v0y = t_xyz[3*it+1] * itDisp,
            v0z = t_xyz[3*it+2] * itDisp;
        let v1x = t_xyz[3*ot]   * otDisp,
            v1y = t_xyz[3*ot+1] * otDisp,
            v1z = t_xyz[3*ot+2] * otDisp;
        let v2x = r_xyz[3*br]   * rDisp,
            v2y = r_xyz[3*br+1] * rDisp,
            v2z = r_xyz[3*br+2] * rDisp;

        // Fix winding order
        const e1x = v1x-v0x, e1y = v1y-v0y, e1z = v1z-v0z;
        const e2x = v2x-v0x, e2y = v2y-v0y, e2z = v2z-v0z;
        const nx = e1y*e2z - e1z*e2y;
        const ny = e1z*e2x - e1x*e2z;
        const nz = e1x*e2y - e1y*e2x;
        const cx = (v0x+v1x+v2x)/3, cy = (v0y+v1y+v2y)/3, cz = (v0z+v1z+v2z)/3;
        if (nx*cx + ny*cy + nz*cz < 0) {
            let tx, ty, tz;
            tx=v1x; ty=v1y; tz=v1z;
            v1x=v2x; v1y=v2y; v1z=v2z;
            v2x=tx; v2y=ty; v2z=tz;
        }

        pos[off]   = v0x; pos[off+1] = v0y; pos[off+2] = v0z;
        pos[off+3] = v1x; pos[off+4] = v1y; pos[off+5] = v1z;
        pos[off+6] = v2x; pos[off+7] = v2y; pos[off+8] = v2z;

        for (let j = 0; j < 3; j++) {
            const px = pos[off+j*3], py = pos[off+j*3+1], pz = pos[off+j*3+2];
            const len = Math.sqrt(px*px+py*py+pz*pz) || 1;
            nrm[off+j*3]   = px/len;
            nrm[off+j*3+1] = py/len;
            nrm[off+j*3+2] = pz/len;
        }

        let cr, cg, cb;
        if (isKoppen && koppenArr) {
            [cr, cg, cb] = koppenColor(koppenArr[br]);
        } else if (isTemp && tempArr) {
            [cr, cg, cb] = temperatureColor(tempArr[br]);
        } else if (isPrecip && precipArr) {
            [cr, cg, cb] = precipitationColor(precipArr[br]);
        } else if (isOceanCurrent && oceanWarmth && oceanSpeed) {
            [cr, cg, cb] = oceanCurrentColor(oceanWarmth[br], oceanSpeed[br], r_elevation[br] <= 0);
        } else if (isOceanCurrent) {
            // Ocean layer selected but data missing — show magenta so it's obvious
            cr = 0.5; cg = 0; cb = 0.5;
        } else if (isLandHeightmap) {
            [cr, cg, cb] = landHeightmapColor(r_elevation[br], elevMax);
        } else if (isHeightmap) {
            [cr, cg, cb] = heightmapColor(r_elevation[br], elevMin, elevMax);
        } else if (dbgArr) {
            [cr, cg, cb] = debugValueToColor(dbgArr[br], dbgMin, dbgMax);
        } else if (showPlates) {
            const pc = state.plateColors[r_plate[br]] || new THREE.Color(0.3,0.3,0.3);
            cr = pc.r; cg = pc.g; cb = pc.b;
        } else if (showStress) {
            const sv = r_stress ? r_stress[br] : 0;
            if (sv > 0.5)                     { cr=0.9; cg=0.1+sv*0.3; cb=0.1; }
            else if (sv > 0.1)                { cr=0.9; cg=0.5+sv*0.5; cb=0.2; }
            else if (mountain_r.has(br))      { cr=0.8; cg=0.4; cb=0.1; }
            else if (coastline_r.has(br))     { cr=0.9; cg=0.9; cb=0.2; }
            else if (ocean_r.has(br))         { cr=0.1; cg=0.2; cb=0.7; }
            else                              { cr=0.15; cg=0.15; cb=0.18; }
        } else {
            [cr, cg, cb] = elevationToColor(re);
        }
        for (let j = 0; j < 3; j++) {
            col[off+j*3]   = cr;
            col[off+j*3+1] = cg;
            col[off+j*3+2] = cb;
        }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(col, 3));
    geo.setAttribute('normal',   new THREE.BufferAttribute(nrm, 3));

    state.baseColors = new Float32Array(col);

    state.planetMesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    scene.add(state.planetMesh);

    waterMesh.visible = !state.mapMode && !showPlates && !showStress && !debugLayer;

    // Voronoi-edge wireframe
    if (document.getElementById('chkWire').checked) {
        const lp = [];
        for (let s = 0; s < numSides; s++) {
            if (s < mesh.halfedges[s]) {
                const it = mesh.s_inner_t(s), ot = mesh.s_outer_t(s);
                const ite = t_elevation[it], ote = t_elevation[ot];
                const d1 = 1.001 + (ite > 0 ? ite*V : ite*V*0.3);
                const d2 = 1.001 + (ote > 0 ? ote*V : ote*V*0.3);
                lp.push(
                    t_xyz[3*it]*d1, t_xyz[3*it+1]*d1, t_xyz[3*it+2]*d1,
                    t_xyz[3*ot]*d2, t_xyz[3*ot+1]*d2, t_xyz[3*ot+2]*d2
                );
            }
        }
        const lg = new THREE.BufferGeometry();
        lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
        state.wireMesh = new THREE.LineSegments(lg,
            new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.12 }));
        scene.add(state.wireMesh);
    }

    buildDriftArrows();
    updateHoverHighlight();

    buildMapMesh();
    buildGlobeGrid();
    if (state.mapMode) {
        state.planetMesh.visible = false;
        waterMesh.visible = false;
        atmosMesh.visible = false;
        starsMesh.visible = false;
        if (state.wireMesh) state.wireMesh.visible = false;
        if (state.arrowGroup) state.arrowGroup.visible = false;
        if (state.mapGridMesh) state.mapGridMesh.visible = state.gridEnabled;
        if (state.globeGridMesh) state.globeGridMesh.visible = false;
        if (state.oceanCurrentArrowGroup) {
            state.oceanCurrentArrowGroup.traverse(c => {
                if (c.name === 'oceanGlobe') c.visible = false;
                if (c.name === 'oceanMap') c.visible = true;
            });
        }
    } else {
        state.planetMesh.visible = true;
        atmosMesh.visible = true;
        starsMesh.visible = true;
        if (state.wireMesh) state.wireMesh.visible = true;
        if (state.arrowGroup) state.arrowGroup.visible = true;
        if (state.mapGridMesh) state.mapGridMesh.visible = false;
        if (state.globeGridMesh) state.globeGridMesh.visible = state.gridEnabled;
        if (state.oceanCurrentArrowGroup) {
            state.oceanCurrentArrowGroup.traverse(c => {
                if (c.name === 'oceanGlobe') c.visible = true;
                if (c.name === 'oceanMap') c.visible = false;
            });
        }
    }
}

// Hover highlight — brighten hovered plate's cells.
export function updateHoverHighlight() {
    if (!state.planetMesh || !state.curData || !state.baseColors) return;
    const colorAttr = state.planetMesh.geometry.getAttribute('color');
    const colors = colorAttr.array;
    colors.set(state.baseColors);

    if (state.hoveredPlate >= 0) {
        const { mesh, r_plate } = state.curData;
        for (let s = 0; s < mesh.numSides; s++) {
            const br = mesh.s_begin_r(s);
            if (r_plate[br] === state.hoveredPlate) {
                const off = s * 9;
                for (let j = 0; j < 3; j++) {
                    colors[off + j*3]     = Math.min(1, colors[off + j*3]     + 0.22);
                    colors[off + j*3 + 1] = Math.min(1, colors[off + j*3 + 1] + 0.22);
                    colors[off + j*3 + 2] = Math.min(1, colors[off + j*3 + 2] + 0.22);
                }
            }
        }
    }
    colorAttr.needsUpdate = true;
}

// Hover highlight for map mesh.
export function updateMapHoverHighlight() {
    if (!state.mapMesh || !state.curData || !state.mapBaseColors || !state.mapFaceToSide) return;
    const colorAttr = state.mapMesh.geometry.getAttribute('color');
    const colors = colorAttr.array;
    colors.set(state.mapBaseColors);

    if (state.hoveredPlate >= 0) {
        const { mesh, r_plate } = state.curData;
        const fts = state.mapFaceToSide;
        for (let f = 0; f < fts.length; f++) {
            const s = fts[f];
            const br = mesh.s_begin_r(s);
            if (r_plate[br] === state.hoveredPlate) {
                const off = f * 9;
                for (let j = 0; j < 3; j++) {
                    colors[off + j*3]     = Math.min(1, colors[off + j*3]     + 0.22);
                    colors[off + j*3 + 1] = Math.min(1, colors[off + j*3 + 1] + 0.22);
                    colors[off + j*3 + 2] = Math.min(1, colors[off + j*3 + 2] + 0.22);
                }
            }
        }
    }
    colorAttr.needsUpdate = true;
}

// Drift arrows — show plate movement directions.
export function buildDriftArrows() {
    if (state.arrowGroup) {
        state.arrowGroup.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
        scene.remove(state.arrowGroup);
        state.arrowGroup = null;
    }
    return;

    state.arrowGroup = new THREE.Group();
    const { r_xyz, plateSeeds, plateVec, plateIsOcean } = state.curData;

    for (const seed of plateSeeds) {
        const px = r_xyz[3*seed], py = r_xyz[3*seed+1], pz = r_xyz[3*seed+2];
        const pos = new THREE.Vector3(px, py, pz).normalize();
        const pv = plateVec[seed];
        const vel = [
            pv.omega * (pv.pole[1] * pz - pv.pole[2] * py),
            pv.omega * (pv.pole[2] * px - pv.pole[0] * pz),
            pv.omega * (pv.pole[0] * py - pv.pole[1] * px)
        ];
        const drift = new THREE.Vector3(...vel);

        const radial = drift.dot(pos);
        const tangent = drift.clone().sub(pos.clone().multiplyScalar(radial));
        if (tangent.length() < 0.001) continue;
        tangent.normalize();

        const origin = pos.clone().multiplyScalar(1.07);
        const length = 0.18;
        const color = plateIsOcean.has(seed) ? 0x66ccff : 0xffcc44;

        const arrow = new THREE.ArrowHelper(tangent, origin, length, color, 0.055, 0.03);
        state.arrowGroup.add(arrow);
    }

    scene.add(state.arrowGroup);
}

// Wind arrows — show wind direction/magnitude overlay.
export function buildWindArrows(season) {
    // Clean up previous arrows
    if (state.windArrowGroup) {
        state.windArrowGroup.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
        scene.remove(state.windArrowGroup);
        state.windArrowGroup = null;
    }

    if (!season || !state.curData || !state.curData.r_wind_east_summer) return;

    const { mesh, r_xyz,
        r_wind_east_summer, r_wind_north_summer,
        r_wind_east_winter, r_wind_north_winter } = state.curData;

    const windE = season === 'winter' ? r_wind_east_winter : r_wind_east_summer;
    const windN = season === 'winter' ? r_wind_north_winter : r_wind_north_summer;
    if (!windE || !windN) return;

    const PI = Math.PI;
    const DEG = PI / 180;
    const sx = 2 / PI;
    const numRegions = mesh.numRegions;

    // ── Bin regions into a lat/lon grid for even geographic sampling ──
    const LAT_STEP = 3; // degrees
    const LON_STEP = 3;
    const latBands = Math.floor(180 / LAT_STEP); // 60
    const lonBands = Math.floor(360 / LON_STEP); // 120

    // For each grid cell, find the closest region to the cell center
    const gridRegions = new Int32Array(latBands * lonBands).fill(-1);
    const gridDist2 = new Float32Array(latBands * lonBands).fill(1e9);

    for (let r = 0; r < numRegions; r++) {
        const ry = r_xyz[3 * r + 1];
        const lat = Math.asin(Math.max(-1, Math.min(1, ry)));
        const lon = Math.atan2(r_xyz[3 * r], r_xyz[3 * r + 2]);

        const li = Math.max(0, Math.min(latBands - 1,
            Math.floor((lat + PI / 2) / (LAT_STEP * DEG))));
        const lo = Math.max(0, Math.min(lonBands - 1,
            Math.floor((lon + PI) / (LON_STEP * DEG))));

        const cellLat = (-90 + li * LAT_STEP + LAT_STEP * 0.5) * DEG;
        const cellLon = (-180 + lo * LON_STEP + LON_STEP * 0.5) * DEG;
        const dlat = lat - cellLat, dlon = lon - cellLon;
        const d2 = dlat * dlat + dlon * dlon;

        const idx = li * lonBands + lo;
        if (d2 < gridDist2[idx]) {
            gridDist2[idx] = d2;
            gridRegions[idx] = r;
        }
    }

    const globePositions = [];
    const globeColors = [];
    const mapPositions = [];
    const mapColors = [];

    const HEAD_ANGLE = 25 * DEG;
    const HEAD_FRAC = 0.35; // arrowhead length as fraction of shaft
    const cosA = Math.cos(HEAD_ANGLE), sinA = Math.sin(HEAD_ANGLE);

    for (let i = 0; i < gridRegions.length; i++) {
        const r = gridRegions[i];
        if (r < 0) continue;

        const we = windE[r], wn = windN[r];
        const speed = Math.sqrt(we * we + wn * wn);
        if (speed < 0.001) continue;

        const x = r_xyz[3 * r], y = r_xyz[3 * r + 1], z = r_xyz[3 * r + 2];

        // Color: blue (slow) → yellow (medium) → red (fast)
        const t = Math.min(1, speed * 3);
        let cr, cg, cb;
        if (t < 0.5) {
            const s = t * 2;
            cr = s; cg = s; cb = 1 - s * 0.5;
        } else {
            const s = (t - 0.5) * 2;
            cr = 1; cg = 1 - s; cb = 0.5 - s * 0.5;
        }

        // ── Globe arrows: 3D with arrowhead ──
        {
            // Tangent frame (Y-up)
            let ex = z, ey = 0, ez = -x;
            const elen = Math.sqrt(ex * ex + ez * ez);
            if (elen > 1e-10) { ex /= elen; ez /= elen; }
            else { ex = 1; ez = 0; }

            let nx = y * ez - z * ey;
            let ny = z * ex - x * ez;
            let nz = x * ey - y * ex;
            const nlen = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
            nx /= nlen; ny /= nlen; nz /= nlen;

            // Wind direction in 3D = we * east + wn * north
            const dirX = we * ex + wn * nx;
            const dirY = we * ey + wn * ny;
            const dirZ = we * ez + wn * nz;
            const dirLen = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ) || 1;
            const dxn = dirX / dirLen, dyn = dirY / dirLen, dzn = dirZ / dirLen;

            // Perpendicular in tangent plane: position × dir
            let px = y * dzn - z * dyn;
            let py = z * dxn - x * dzn;
            let pz = x * dyn - y * dxn;
            const plen = Math.sqrt(px * px + py * py + pz * pz) || 1;
            px /= plen; py /= plen; pz /= plen;

            const arrowLen = 0.008 + Math.min(0.012, speed * 0.025);
            const R = 1.007;

            const ox = x * R, oy = y * R, oz = z * R;
            const tx = ox + dxn * arrowLen;
            const ty = oy + dyn * arrowLen;
            const tz = oz + dzn * arrowLen;

            // Shaft
            globePositions.push(ox, oy, oz, tx, ty, tz);
            globeColors.push(cr, cg, cb, cr, cg, cb);

            // Arrowhead wings
            const hLen = arrowLen * HEAD_FRAC;
            const lwx = tx + (-dxn * cosA + px * sinA) * hLen;
            const lwy = ty + (-dyn * cosA + py * sinA) * hLen;
            const lwz = tz + (-dzn * cosA + pz * sinA) * hLen;
            const rwx = tx + (-dxn * cosA - px * sinA) * hLen;
            const rwy = ty + (-dyn * cosA - py * sinA) * hLen;
            const rwz = tz + (-dzn * cosA - pz * sinA) * hLen;

            globePositions.push(tx, ty, tz, lwx, lwy, lwz);
            globeColors.push(cr, cg, cb, cr, cg, cb);
            globePositions.push(tx, ty, tz, rwx, rwy, rwz);
            globeColors.push(cr, cg, cb, cr, cg, cb);
        }

        // ── Map arrows: 2D with arrowhead ──
        {
            const lon = Math.atan2(x, z);
            const lat = Math.asin(Math.max(-1, Math.min(1, y)));
            const mx = lon * sx;
            const my = lat * sx;

            const norm = speed || 1;
            const arrowLen = 0.006 + Math.min(0.012, speed * 0.025);
            const dx = (we / norm) * arrowLen;
            const dy = (wn / norm) * arrowLen;
            const tipX = mx + dx, tipY = my + dy;

            // Shaft
            mapPositions.push(mx, my, 0.002, tipX, tipY, 0.002);
            mapColors.push(cr, cg, cb, cr, cg, cb);

            // Arrowhead wings (2D rotation of -dir)
            const hLen = arrowLen * HEAD_FRAC;
            const dLen = Math.sqrt(dx * dx + dy * dy) || 1;
            const ndx = -dx / dLen, ndy = -dy / dLen;

            const lx = tipX + (ndx * cosA - ndy * sinA) * hLen;
            const ly = tipY + (ndx * sinA + ndy * cosA) * hLen;
            const rx = tipX + (ndx * cosA + ndy * sinA) * hLen;
            const ry = tipY + (-ndx * sinA + ndy * cosA) * hLen;

            mapPositions.push(tipX, tipY, 0.002, lx, ly, 0.002);
            mapColors.push(cr, cg, cb, cr, cg, cb);
            mapPositions.push(tipX, tipY, 0.002, rx, ry, 0.002);
            mapColors.push(cr, cg, cb, cr, cg, cb);
        }
    }

    state.windArrowGroup = new THREE.Group();

    // Globe arrows
    if (globePositions.length > 0) {
        const gGeo = new THREE.BufferGeometry();
        gGeo.setAttribute('position', new THREE.Float32BufferAttribute(globePositions, 3));
        gGeo.setAttribute('color', new THREE.Float32BufferAttribute(globeColors, 3));
        const gMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6, depthWrite: false });
        const gLines = new THREE.LineSegments(gGeo, gMat);
        gLines.name = 'windGlobe';
        gLines.visible = !state.mapMode;
        state.windArrowGroup.add(gLines);
    }

    // Map arrows
    if (mapPositions.length > 0) {
        const mGeo = new THREE.BufferGeometry();
        mGeo.setAttribute('position', new THREE.Float32BufferAttribute(mapPositions, 3));
        mGeo.setAttribute('color', new THREE.Float32BufferAttribute(mapColors, 3));
        const mMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6 });
        const mLines = new THREE.LineSegments(mGeo, mMat);
        mLines.name = 'windMap';
        mLines.visible = state.mapMode;
        state.windArrowGroup.add(mLines);
    }

    // ── ITCZ spline line (shown on pressure layers) ──
    const isPressureLayer = season && (state.debugLayer === 'pressureSummer' || state.debugLayer === 'pressureWinter');
    const itczLons = state.curData.itczLons;
    const itczLats = season === 'winter' ? state.curData.itczLatsWinter : state.curData.itczLatsSummer;

    if (isPressureLayer && itczLons && itczLats) {
        const N = itczLons.length;
        const R_ITCZ = 1.01;

        // Globe: polyline on sphere surface
        const gPos = [];
        for (let i = 0; i < N; i++) {
            const j = (i + 1) % N;
            const lon0 = itczLons[i], lat0 = itczLats[i];
            const lon1 = itczLons[j], lat1 = itczLats[j];
            const cosLat0 = Math.cos(lat0), cosLat1 = Math.cos(lat1);
            gPos.push(
                Math.sin(lon0) * cosLat0 * R_ITCZ, Math.sin(lat0) * R_ITCZ, Math.cos(lon0) * cosLat0 * R_ITCZ,
                Math.sin(lon1) * cosLat1 * R_ITCZ, Math.sin(lat1) * R_ITCZ, Math.cos(lon1) * cosLat1 * R_ITCZ
            );
        }
        const igGeo = new THREE.BufferGeometry();
        igGeo.setAttribute('position', new THREE.Float32BufferAttribute(gPos, 3));
        const igMat = new THREE.LineBasicMaterial({ color: 0x00ff88, linewidth: 2, depthWrite: false });
        const igLines = new THREE.LineSegments(igGeo, igMat);
        igLines.name = 'windGlobe';
        igLines.visible = !state.mapMode;
        state.windArrowGroup.add(igLines);

        // Map: polyline on equirectangular projection
        const mPos = [];
        for (let i = 0; i < N; i++) {
            const j = (i + 1) % N;
            const mx0 = itczLons[i] * sx, my0 = itczLats[i] * sx;
            const mx1 = itczLons[j] * sx, my1 = itczLats[j] * sx;
            // Skip segment that wraps across antimeridian
            if (Math.abs(mx1 - mx0) > 1) continue;
            mPos.push(mx0, my0, 0.003, mx1, my1, 0.003);
        }
        const imGeo = new THREE.BufferGeometry();
        imGeo.setAttribute('position', new THREE.Float32BufferAttribute(mPos, 3));
        const imMat = new THREE.LineBasicMaterial({ color: 0x00ff88, linewidth: 2 });
        const imLines = new THREE.LineSegments(imGeo, imMat);
        imLines.name = 'windMap';
        imLines.visible = state.mapMode;
        state.windArrowGroup.add(imLines);
    }

    scene.add(state.windArrowGroup);
}

// Ocean current arrows — show current direction colored by heat transport.
export function buildOceanCurrentArrows(season) {
    // Clean up previous arrows
    if (state.oceanCurrentArrowGroup) {
        state.oceanCurrentArrowGroup.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
        scene.remove(state.oceanCurrentArrowGroup);
        state.oceanCurrentArrowGroup = null;
    }

    if (!season || !state.curData || !state.curData.r_ocean_current_east_summer) return;

    const { mesh, r_xyz, r_elevation } = state.curData;

    const currentE = season === 'winter'
        ? state.curData.r_ocean_current_east_winter : state.curData.r_ocean_current_east_summer;
    const currentN = season === 'winter'
        ? state.curData.r_ocean_current_north_winter : state.curData.r_ocean_current_north_summer;
    const speedArr = season === 'winter'
        ? state.curData.r_ocean_speed_winter : state.curData.r_ocean_speed_summer;
    const warmthArr = season === 'winter'
        ? state.curData.r_ocean_warmth_winter : state.curData.r_ocean_warmth_summer;
    if (!currentE || !currentN || !speedArr || !warmthArr) return;

    const PI = Math.PI;
    const DEG = PI / 180;
    const sx = 2 / PI;
    const numRegions = mesh.numRegions;

    // ── Bin regions into a lat/lon grid for even geographic sampling ──
    const LAT_STEP = 3;
    const LON_STEP = 3;
    const latBands = Math.floor(180 / LAT_STEP);
    const lonBands = Math.floor(360 / LON_STEP);

    const gridRegions = new Int32Array(latBands * lonBands).fill(-1);
    const gridDist2 = new Float32Array(latBands * lonBands).fill(1e9);

    for (let r = 0; r < numRegions; r++) {
        // Skip land
        if (r_elevation[r] > 0) continue;

        const ry = r_xyz[3 * r + 1];
        const lat = Math.asin(Math.max(-1, Math.min(1, ry)));
        const lon = Math.atan2(r_xyz[3 * r], r_xyz[3 * r + 2]);

        const li = Math.max(0, Math.min(latBands - 1,
            Math.floor((lat + PI / 2) / (LAT_STEP * DEG))));
        const lo = Math.max(0, Math.min(lonBands - 1,
            Math.floor((lon + PI) / (LON_STEP * DEG))));

        const cellLat = (-90 + li * LAT_STEP + LAT_STEP * 0.5) * DEG;
        const cellLon = (-180 + lo * LON_STEP + LON_STEP * 0.5) * DEG;
        const dlat = lat - cellLat, dlon = lon - cellLon;
        const d2 = dlat * dlat + dlon * dlon;

        const idx = li * lonBands + lo;
        if (d2 < gridDist2[idx]) {
            gridDist2[idx] = d2;
            gridRegions[idx] = r;
        }
    }

    const globePositions = [];
    const globeColors = [];
    const mapPositions = [];
    const mapColors = [];

    const HEAD_ANGLE = 25 * DEG;
    const HEAD_FRAC = 0.35;
    const cosA = Math.cos(HEAD_ANGLE), sinA = Math.sin(HEAD_ANGLE);

    for (let i = 0; i < gridRegions.length; i++) {
        const r = gridRegions[i];
        if (r < 0) continue;

        const ce = currentE[r], cn = currentN[r];
        const speed = speedArr[r];
        const warmth = warmthArr[r];
        if (speed < 0.01) continue;

        const x = r_xyz[3 * r], y = r_xyz[3 * r + 1], z = r_xyz[3 * r + 2];

        // Color by heat transport: red (warm/poleward), blue (cold/equatorward), gray (neutral)
        let cr, cg, cb;
        if (warmth > 0.1) {
            cr = 0.9; cg = 0.15; cb = 0.15;
        } else if (warmth < -0.1) {
            cr = 0.15; cg = 0.3; cb = 0.9;
        } else {
            cr = 0.5; cg = 0.5; cb = 0.5;
        }

        // ── Globe arrows: 3D with arrowhead ──
        {
            let ex = z, ey = 0, ez = -x;
            const elen = Math.sqrt(ex * ex + ez * ez);
            if (elen > 1e-10) { ex /= elen; ez /= elen; }
            else { ex = 1; ez = 0; }

            let nx = y * ez - z * ey;
            let ny = z * ex - x * ez;
            let nz = x * ey - y * ex;
            const nlen = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
            nx /= nlen; ny /= nlen; nz /= nlen;

            const dirX = ce * ex + cn * nx;
            const dirY = ce * ey + cn * ny;
            const dirZ = ce * ez + cn * nz;
            const dirLen = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ) || 1;
            const dxn = dirX / dirLen, dyn = dirY / dirLen, dzn = dirZ / dirLen;

            let px = y * dzn - z * dyn;
            let py = z * dxn - x * dzn;
            let pz = x * dyn - y * dxn;
            const plen = Math.sqrt(px * px + py * py + pz * pz) || 1;
            px /= plen; py /= plen; pz /= plen;

            const arrowLen = 0.006 + Math.min(0.014, speed * 0.025);
            const R = 1.007;

            const ox = x * R, oy = y * R, oz = z * R;
            const tx = ox + dxn * arrowLen;
            const ty = oy + dyn * arrowLen;
            const tz = oz + dzn * arrowLen;

            globePositions.push(ox, oy, oz, tx, ty, tz);
            globeColors.push(cr, cg, cb, cr, cg, cb);

            const hLen = arrowLen * HEAD_FRAC;
            const lwx = tx + (-dxn * cosA + px * sinA) * hLen;
            const lwy = ty + (-dyn * cosA + py * sinA) * hLen;
            const lwz = tz + (-dzn * cosA + pz * sinA) * hLen;
            const rwx = tx + (-dxn * cosA - px * sinA) * hLen;
            const rwy = ty + (-dyn * cosA - py * sinA) * hLen;
            const rwz = tz + (-dzn * cosA - pz * sinA) * hLen;

            globePositions.push(tx, ty, tz, lwx, lwy, lwz);
            globeColors.push(cr, cg, cb, cr, cg, cb);
            globePositions.push(tx, ty, tz, rwx, rwy, rwz);
            globeColors.push(cr, cg, cb, cr, cg, cb);
        }

        // ── Map arrows: 2D with arrowhead ──
        {
            const lon = Math.atan2(x, z);
            const lat = Math.asin(Math.max(-1, Math.min(1, y)));
            const mx = lon * sx;
            const my = lat * sx;

            const rawSpeed = Math.sqrt(ce * ce + cn * cn) || 1;
            const arrowLen = 0.006 + Math.min(0.014, speed * 0.025);
            const dx = (ce / rawSpeed) * arrowLen;
            const dy = (cn / rawSpeed) * arrowLen;
            const tipX = mx + dx, tipY = my + dy;

            mapPositions.push(mx, my, 0.002, tipX, tipY, 0.002);
            mapColors.push(cr, cg, cb, cr, cg, cb);

            const hLen = arrowLen * HEAD_FRAC;
            const dLen = Math.sqrt(dx * dx + dy * dy) || 1;
            const ndx = -dx / dLen, ndy = -dy / dLen;

            const lx = tipX + (ndx * cosA - ndy * sinA) * hLen;
            const ly = tipY + (ndx * sinA + ndy * cosA) * hLen;
            const rx = tipX + (ndx * cosA + ndy * sinA) * hLen;
            const ry = tipY + (-ndx * sinA + ndy * cosA) * hLen;

            mapPositions.push(tipX, tipY, 0.002, lx, ly, 0.002);
            mapColors.push(cr, cg, cb, cr, cg, cb);
            mapPositions.push(tipX, tipY, 0.002, rx, ry, 0.002);
            mapColors.push(cr, cg, cb, cr, cg, cb);
        }
    }

    console.log(`[OceanArrows] ${season}: ${globePositions.length / 18} arrows (from ${gridRegions.length} grid cells)`);

    state.oceanCurrentArrowGroup = new THREE.Group();

    if (globePositions.length > 0) {
        const gGeo = new THREE.BufferGeometry();
        gGeo.setAttribute('position', new THREE.Float32BufferAttribute(globePositions, 3));
        gGeo.setAttribute('color', new THREE.Float32BufferAttribute(globeColors, 3));
        const gMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6, depthWrite: false });
        const gLines = new THREE.LineSegments(gGeo, gMat);
        gLines.name = 'oceanGlobe';
        gLines.visible = !state.mapMode;
        state.oceanCurrentArrowGroup.add(gLines);
    }

    if (mapPositions.length > 0) {
        const mGeo = new THREE.BufferGeometry();
        mGeo.setAttribute('position', new THREE.Float32BufferAttribute(mapPositions, 3));
        mGeo.setAttribute('color', new THREE.Float32BufferAttribute(mapColors, 3));
        const mMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6 });
        const mLines = new THREE.LineSegments(mGeo, mMat);
        mLines.name = 'oceanMap';
        mLines.visible = state.mapMode;
        state.oceanCurrentArrowGroup.add(mLines);
    }

    scene.add(state.oceanCurrentArrowGroup);
}

// Export equirectangular map as PNG (async, with tiled rendering for large sizes).
export async function exportMap(type, width, onProgress) {
    if (!state.curData) return;

    // Yield so the browser paints the loading overlay before heavy work begins
    await new Promise(r => setTimeout(r, 50));

    const height = width / 2;
    const { mesh, r_xyz, t_xyz, r_elevation } = state.curData;
    const isBW = type === 'heightmap' || type === 'landheightmap';

    // Compute elevation range
    let elevMin = Infinity, elevMax = -Infinity;
    if (isBW) {
        for (let r = 0; r < mesh.numRegions; r++) {
            if (r_elevation[r] < elevMin) elevMin = r_elevation[r];
            if (r_elevation[r] > elevMax) elevMax = r_elevation[r];
        }
    }

    // Build map triangles (same projection as buildMapMesh, chosen coloring, no grid)
    const { numSides } = mesh;
    const PI = Math.PI;
    const sx = 2 / PI;

    const posArr = new Float32Array(numSides * 18);
    const colArr = new Float32Array(numSides * 18);
    let triCount = 0;

    for (let s = 0; s < numSides; s++) {
        const it = mesh.s_inner_t(s);
        const ot = mesh.s_outer_t(s);
        const br = mesh.s_begin_r(s);

        let cr, cg, cb;
        if (type === 'landheightmap') {
            [cr, cg, cb] = landHeightmapColor(r_elevation[br], elevMax);
        } else if (type === 'heightmap') {
            [cr, cg, cb] = heightmapColor(r_elevation[br], elevMin, elevMax);
        } else {
            [cr, cg, cb] = elevationToColor(r_elevation[br]);
        }

        const x0 = t_xyz[3*it], y0 = t_xyz[3*it+1], z0 = t_xyz[3*it+2];
        const x1 = t_xyz[3*ot], y1 = t_xyz[3*ot+1], z1 = t_xyz[3*ot+2];
        const x2 = r_xyz[3*br], y2 = r_xyz[3*br+1], z2 = r_xyz[3*br+2];

        let lon0 = Math.atan2(x0, z0), lat0 = Math.asin(Math.max(-1, Math.min(1, y0)));
        let lon1 = Math.atan2(x1, z1), lat1 = Math.asin(Math.max(-1, Math.min(1, y1)));
        let lon2 = Math.atan2(x2, z2), lat2 = Math.asin(Math.max(-1, Math.min(1, y2)));

        const clx = (v) => Math.max(-2, Math.min(2, v));
        const cly = (v) => Math.max(-1, Math.min(1, v));

        const maxLon = Math.max(lon0, lon1, lon2);
        const minLon = Math.min(lon0, lon1, lon2);
        const wraps = (maxLon - minLon) > PI;

        if (wraps) {
            if (lon0 < 0) lon0 += 2 * PI;
            if (lon1 < 0) lon1 += 2 * PI;
            if (lon2 < 0) lon2 += 2 * PI;

            let off = triCount * 9;
            posArr[off]   = clx(lon0*sx); posArr[off+1] = cly(lat0*sx); posArr[off+2] = 0;
            posArr[off+3] = clx(lon1*sx); posArr[off+4] = cly(lat1*sx); posArr[off+5] = 0;
            posArr[off+6] = clx(lon2*sx); posArr[off+7] = cly(lat2*sx); posArr[off+8] = 0;
            colArr[off]=cr; colArr[off+1]=cg; colArr[off+2]=cb;
            colArr[off+3]=cr; colArr[off+4]=cg; colArr[off+5]=cb;
            colArr[off+6]=cr; colArr[off+7]=cg; colArr[off+8]=cb;
            triCount++;

            off = triCount * 9;
            posArr[off]   = clx((lon0-2*PI)*sx); posArr[off+1] = cly(lat0*sx); posArr[off+2] = 0;
            posArr[off+3] = clx((lon1-2*PI)*sx); posArr[off+4] = cly(lat1*sx); posArr[off+5] = 0;
            posArr[off+6] = clx((lon2-2*PI)*sx); posArr[off+7] = cly(lat2*sx); posArr[off+8] = 0;
            colArr[off]=cr; colArr[off+1]=cg; colArr[off+2]=cb;
            colArr[off+3]=cr; colArr[off+4]=cg; colArr[off+5]=cb;
            colArr[off+6]=cr; colArr[off+7]=cg; colArr[off+8]=cb;
            triCount++;
        } else {
            const off = triCount * 9;
            posArr[off]   = clx(lon0*sx); posArr[off+1] = cly(lat0*sx); posArr[off+2] = 0;
            posArr[off+3] = clx(lon1*sx); posArr[off+4] = cly(lat1*sx); posArr[off+5] = 0;
            posArr[off+6] = clx(lon2*sx); posArr[off+7] = cly(lat2*sx); posArr[off+8] = 0;
            colArr[off]=cr; colArr[off+1]=cg; colArr[off+2]=cb;
            colArr[off+3]=cr; colArr[off+4]=cg; colArr[off+5]=cb;
            colArr[off+6]=cr; colArr[off+7]=cg; colArr[off+8]=cb;
            triCount++;
        }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(posArr.buffer, 0, triCount * 9), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colArr.buffer, 0, triCount * 9), 3));

    const mapMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));

    const offScene = new THREE.Scene();
    offScene.background = isBW ? new THREE.Color(0x000000) : new THREE.Color(0x1a1a2e);
    offScene.add(mapMesh);

    // Tiled rendering — split into GPU-sized tiles if image exceeds max texture size
    const maxTex = renderer.capabilities.maxTextureSize;
    const tileW = Math.min(width, maxTex);
    const tileH = Math.min(height, maxTex);
    const tilesX = Math.ceil(width / tileW);
    const tilesY = Math.ceil(height / tileH);
    const totalTiles = tilesX * tilesY;

    const cvs = document.createElement('canvas');
    cvs.width = width;
    cvs.height = height;
    const ctx = cvs.getContext('2d');

    let tilesDone = 0;
    for (let ty = 0; ty < tilesY; ty++) {
        for (let tx = 0; tx < tilesX; tx++) {
            const px0 = tx * tileW;
            const py0 = ty * tileH;
            const pw = Math.min(tileW, width - px0);
            const ph = Math.min(tileH, height - py0);

            // Orthographic frustum for this tile (map space: x [-2,2], y [-1,1])
            const left   = -2 + 4 * px0 / width;
            const right  = -2 + 4 * (px0 + pw) / width;
            const top    =  1 - 2 * py0 / height;
            const bottom =  1 - 2 * (py0 + ph) / height;

            const cam = new THREE.OrthographicCamera(left, right, top, bottom, 0.1, 10);
            cam.position.set(0, 0, 5);
            cam.lookAt(0, 0, 0);

            const renderTarget = new THREE.WebGLRenderTarget(pw, ph);
            renderer.setRenderTarget(renderTarget);
            renderer.render(offScene, cam);

            const pixels = new Uint8Array(pw * ph * 4);
            renderer.readRenderTargetPixels(renderTarget, 0, 0, pw, ph, pixels);
            renderer.setRenderTarget(null);
            renderTarget.dispose();

            // Write tile to canvas (flip rows + sRGB gamma)
            const imageData = ctx.createImageData(pw, ph);
            const out = imageData.data;
            for (let y = 0; y < ph; y++) {
                const src = (ph - 1 - y) * pw * 4;
                const dst = y * pw * 4;
                for (let x = 0; x < pw; x++) {
                    const si = src + x * 4, di = dst + x * 4;
                    for (let c = 0; c < 3; c++) {
                        const v = pixels[si + c] / 255;
                        out[di + c] = (v <= 0.0031308
                            ? v * 12.92
                            : 1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255 + 0.5 | 0;
                    }
                    out[di + 3] = pixels[si + 3];
                }
            }
            ctx.putImageData(imageData, px0, py0);

            tilesDone++;
            if (onProgress) onProgress(tilesDone / totalTiles * 80, 'Rendering...');
            await new Promise(r => setTimeout(r, 0));
        }
    }

    // Cleanup mesh
    geo.dispose();
    mapMesh.material.dispose();

    // Encode & download
    if (onProgress) onProgress(85, 'Encoding PNG...');
    await new Promise(r => setTimeout(r, 0));

    const seed = state.curData ? state.curData.seed : '';
    const filename = type === 'landheightmap' ? `atlas-land-heightmap-${seed}.png`
        : type === 'heightmap' ? `atlas-heightmap-${seed}.png` : `atlas-colormap-${seed}.png`;

    await new Promise(resolve => {
        cvs.toBlob(blob => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 5000);
            resolve();
        }, 'image/png');
    });
}
