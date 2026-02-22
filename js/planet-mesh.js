// Planet mesh construction: Voronoi geometry, map projection, overlays.

import * as THREE from 'three';
import { scene, waterMesh, atmosMesh, starsMesh } from './scene.js';
import { state } from './state.js';
import { elevationToColor } from './color-map.js';
import { makeRng } from './rng.js';

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
    if (debugLayer && debugLayers && debugLayers[debugLayer]) {
        dbgArr = debugLayers[debugLayer];
        for (let r = 0; r < mesh.numRegions; r++) {
            if (dbgArr[r] < dbgMin) dbgMin = dbgArr[r];
            if (dbgArr[r] > dbgMax) dbgMax = dbgArr[r];
        }
    }

    const { numSides } = mesh;
    const PI = Math.PI;

    const posArr = new Float32Array(numSides * 18);
    const colArr = new Float32Array(numSides * 18);
    const faceToSide = new Int32Array(numSides * 2);  // max faces = 2x sides (wrapping)
    let triCount = 0;

    for (let s = 0; s < numSides; s++) {
        const it = mesh.s_inner_t(s);
        const ot = mesh.s_outer_t(s);
        const br = mesh.s_begin_r(s);

        const re = r_elevation[br] - waterLevel;
        let cr, cg, cb;
        if (dbgArr) {
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
    if (debugLayer && debugLayers && debugLayers[debugLayer]) {
        dbgArr = debugLayers[debugLayer];
        for (let r = 0; r < mesh.numRegions; r++) {
            if (dbgArr[r] < dbgMin) dbgMin = dbgArr[r];
            if (dbgArr[r] > dbgMax) dbgMax = dbgArr[r];
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
        if (dbgArr) {
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

    waterMesh.visible = !state.mapMode && !showPlates && !showStress;

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
    } else {
        state.planetMesh.visible = true;
        atmosMesh.visible = true;
        starsMesh.visible = true;
        if (state.wireMesh) state.wireMesh.visible = true;
        if (state.arrowGroup) state.arrowGroup.visible = true;
        if (state.mapGridMesh) state.mapGridMesh.visible = false;
        if (state.globeGridMesh) state.globeGridMesh.visible = state.gridEnabled;
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
        const drift = new THREE.Vector3(...plateVec[seed]);

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
