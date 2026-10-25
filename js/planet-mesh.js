// Planet mesh construction: Voronoi geometry, map projection, overlays.

import * as THREE from 'three';
import { renderer, scene, waterMesh, atmosMesh, starsMesh } from './scene.js';
import { state } from './state.js';
import { elevationToColor, elevToHeightKm, biomeColor } from './color-map.js';
import { terrainColorFn } from './terrain-palette.js';
import { makeRng } from './rng.js';
import { KOPPEN_CLASSES } from './koppen.js';
import { climateColorFn, climateLayer, vectorAt, regionLatLon, sampleGrid as gridSampleAt } from './climate-layers.js';
import { satelliteRegionColors, seaIceRegion } from '../v2/js/evolution/sat-style.js';
import { FastNoise } from '../v2/js/core/fast-noise.js';

// Clipping planes for map wrap — keep everything within x ∈ [-2, 2]
renderer.localClippingEnabled = true;
const MAP_CLIP_PLANES = [
    new THREE.Plane(new THREE.Vector3(1, 0, 0), 2),   // x >= -2
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), 2),   // x <= 2
];

// The Satellite view's colours, per region: each climate's colours climbing with the land to rock and snow, in the season
// chosen (v2/js/evolution/sat-style.js — the same look as Evolution's), the sea by depth with its sea ice sharp and
// ragged; then each region blended a little with its neighbours (mesh adjacency, ~6 neighbours: scale-independent).
// The colours are in linear light, as three.js takes vertex colours: the globe and the map show them in sRGB, and the
// PNG export renders the same linear colours and encodes them to sRGB itself — so the export matches the screen. Cached
// per climate, Köppen array and season.
let _biomeCache = null;
let _biomeCacheKey = null;

function getCachedBiomeSmoothed(mesh, koppenArr, r_elevation) {
    const data = state.curData, season = state.climateSeason || 'year', key = [koppenArr, data?.climate, season, r_elevation];
    if (!(_biomeCache && _biomeCacheKey && key.every((k, i) => k === _biomeCacheKey[i]))) {
        _biomeCache = smoothBiomeColors(mesh, satelliteRaw(mesh, koppenArr, r_elevation, data, season));
        _biomeCacheKey = key;
    }
    return _biomeCache;
}

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** Each region's Satellite colour before smoothing (linear 0–1, 3 per region). */
function satelliteRaw(mesh, koppenArr, r_elevation, data, season) {
    const n = mesh.numRegions, C = data?.climate;
    if (!C?.cells || !C.grid || !data.r_xyz || data.r_xyz.length !== 3 * n) {
        // (no climate of the new kind at hand: V1's own colours, as they always were)
        const raw = new Float32Array(n * 3);
        for (let r = 0; r < n; r++) { const [cr, cg, cb] = biomeColor(koppenArr[r], r_elevation[r]); raw[r * 3] = cr; raw[r * 3 + 1] = cg; raw[r * 3 + 2] = cb; }
        return raw;
    }
    const display = new Float32Array(n * 3);
    const { lat, lon } = regionLatLon(data), g = C.grid, s = season in { year: 1, jan: 1, jul: 1 } ? season : 'year';
    const land = new Uint8Array(n);
    for (let r = 0; r < n; r++) land[r] = r_elevation[r] > 0 ? koppenArr[r] : 0;
    const at = (f, r) => gridSampleAt(g, f, lat[r], lon[r]);
    const lc = satelliteRegionColors({ n, xyz: data.r_xyz, lat, lon, elevKm: (r) => elevToHeightKm(r_elevation[r]), koppen: land,
        tAnnual: C.cells.t.year, tRange: C.cells.tRange, season: s, FastNoise,
        snowAt: g.snow ? (r) => at(g.snow[s], r) : () => 0, iceSheetAt: g.iceSheet ? (r) => at(g.iceSheet, r) : () => 0 });
    for (let r = 0; r < n; r++) {
        if (land[r]) {
            for (let c = 0; c < 3; c++) display[r * 3 + c] = srgbToLinear(lc[r * 3 + c]);
            continue;
        }
        const sea = elevationToColor(r_elevation[r]);
        const fi = g.seaIce ? seaIceRegion(at(g.seaIce[s], r), data.r_xyz[3 * r], data.r_xyz[3 * r + 1], data.r_xyz[3 * r + 2], FastNoise) : 0;
        for (let c = 0; c < 3; c++) display[r * 3 + c] = sea[c] + (srgbToLinear(SAT_SEA_ICE[c]) - sea[c]) * fi;
    }
    return display;
}
const SAT_SEA_ICE = [214 / 255, 223 / 255, 230 / 255];

function smoothBiomeColors(mesh, raw) {
    const n = mesh.numRegions;
    const out = new Float32Array(n * 3);
    const alpha = 0.35;
    const { adjOffset, adjList } = mesh;
    for (let r = 0; r < n; r++) {
        const start = adjOffset[r];
        const end = adjOffset[r + 1];
        const count = end - start;
        if (count === 0) {
            out[r * 3] = raw[r * 3]; out[r * 3 + 1] = raw[r * 3 + 1]; out[r * 3 + 2] = raw[r * 3 + 2];
            continue;
        }
        let avgR = 0, avgG = 0, avgB = 0;
        for (let i = start; i < end; i++) {
            const nr = adjList[i];
            avgR += raw[nr * 3]; avgG += raw[nr * 3 + 1]; avgB += raw[nr * 3 + 2];
        }
        avgR /= count; avgG /= count; avgB /= count;
        out[r * 3]     = raw[r * 3]     * (1 - alpha) + avgR * alpha;
        out[r * 3 + 1] = raw[r * 3 + 1] * (1 - alpha) + avgG * alpha;
        out[r * 3 + 2] = raw[r * 3 + 2] * (1 - alpha) + avgB * alpha;
    }
    return out;
}

// Grayscale heightmap: black (lowest) → white (highest), in physical height space
// Absolute-scale heightmap: fixed range -5 km (deep ocean) → 6 km (tallest peak)
// so the same physical height always maps to the same shade regardless of planet.
function heightmapColor(elevation) {
    const h = elevToHeightKm(elevation);
    const t = Math.max(0, Math.min(1, (h + 5) / 11)); // -5 → 0, 6 → 1
    return [t, t, t];
}

// Land heightmap: ocean = black, land = 0 → 6 km absolute scale
function landHeightmapColor(elevation) {
    if (elevation <= 0) return [0, 0, 0];
    const t = Math.max(0, Math.min(1, elevToHeightKm(elevation) / 6));
    return [t, t, t];
}

// Land mask: white = land, black = ocean
function landMaskColor(elevation) {
    return elevation > 0 ? [1, 1, 1] : [0, 0, 0];
}

// ── 16-bit grayscale PNG encoder ────────────────────────────────────
// Produces a standard 16-bit grayscale PNG (bit depth 16, color type 0)
// using the browser's CompressionStream API for zlib compression.

const _crc32Table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c;
    }
    return t;
})();

function _crc32(buf) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) crc = _crc32Table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

function _pngChunk(type, data) {
    const chunk = new Uint8Array(4 + 4 + data.length + 4);
    const dv = new DataView(chunk.buffer);
    dv.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) chunk[4 + i] = type.charCodeAt(i);
    chunk.set(data, 8);
    dv.setUint32(8 + data.length, _crc32(chunk.subarray(4, 8 + data.length)));
    return chunk;
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






// Köppen climate class color: returns [r,g,b] from KOPPEN_CLASSES lookup.
function koppenColor(classId) {
    const c = KOPPEN_CLASSES[classId] || KOPPEN_CLASSES[0];
    return c.color;
}

// The palettes' colours are display (sRGB) values, but three.js reads a vertex colour as linear light and encodes it to
// sRGB on the way out, which brightens it (Köppen's #f5a600 came out #fbd300 on the map and in the export), and the
// globe's lights tinted it on top (#c6b200). So the layers whose colours must match their legend — the climate's Inspect
// layers, Köppen and the heightmaps — are turned to linear light first (so the screen and the export show the legend's
// own colours) and are drawn unlit on the globe (issues #64 and #51).
const toLinear3 = (c) => [srgbToLinear(c[0]), srgbToLinear(c[1]), srgbToLinear(c[2])];
/** Whether a layer is drawn in its legend's exact colours (unlit, no gamma shift). */
const isExactLayer = (debugLayer) => debugLayer === 'koppen' || debugLayer === 'heightmap' || debugLayer === 'landheightmap' || !!climateLayer(debugLayer);
/** The globe's material for a layer: unlit for an exact layer, lit (with the mesh's own normals) otherwise. */
function globeMaterial(exact) {
    if (exact) return new THREE.MeshBasicMaterial({ vertexColors: true });
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    mat.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader.replace(
            '#include <beginnormal_vertex>',
            'vec3 objectNormal = normalize(position);'
        );
    };
    mat.userData.exact = false;
    return mat;
}

// A side's colour is its region's (or, on the smooth heightmaps, its corners'), so each is worked out once before the
// loops over the sides — a region has about six, and the globe and the map both read them — not once per side.
/** The layer's colour of a region (linear light), from the layer state each mesh builder works out. */
function regionColorFn({ climateColor, isBiome, biomeSmoothed, isKoppen, koppenArr, dbgArr, dbgMin, dbgMax, showPlates, showStress,
    r_plate, r_stress, mountain_r, coastline_r, ocean_r, r_elevation, waterLevel, terrainColor }) {
    return (br) => {
        if (climateColor) return toLinear3(climateColor(br));
        if (isBiome && biomeSmoothed) return [biomeSmoothed[br * 3], biomeSmoothed[br * 3 + 1], biomeSmoothed[br * 3 + 2]];
        if (isKoppen && koppenArr) return toLinear3(koppenColor(koppenArr[br]));
        if (dbgArr) return debugValueToColor(dbgArr[br], dbgMin, dbgMax);
        if (showPlates) {
            const pc = state.plateColors[r_plate[br]] || new THREE.Color(0.3,0.3,0.3);
            return [pc.r, pc.g, pc.b];
        }
        if (showStress) {
            const sv = r_stress ? r_stress[br] : 0;
            if (sv > 0.5)                     return [0.9, 0.1+sv*0.3, 0.1];
            if (sv > 0.1)                     return [0.9, 0.5+sv*0.5, 0.2];
            if (mountain_r.has(br))           return [0.8, 0.4, 0.1];
            if (coastline_r.has(br))          return [0.9, 0.9, 0.2];
            if (ocean_r.has(br))              return [0.1, 0.2, 0.7];
            return [0.15, 0.15, 0.18];
        }
        return terrainColor(r_elevation[br] - waterLevel);
    };
}
/** Every region's colour (3 a region) from a colour-of-a-region function. */
function regionColors(n, colorOf) {
    const out = new Float32Array(3 * n);
    for (let r = 0; r < n; r++) { const c = colorOf(r); out[3 * r] = c[0]; out[3 * r + 1] = c[1]; out[3 * r + 2] = c[2]; }
    return out;
}
/** A smooth heightmap's grey (linear light) at every triangle (t) and every region (r) of the mesh. */
function smoothGreys(mesh, colorFn, t_elevation, r_elevation) {
    const t = new Float32Array(mesh.numTriangles), r = new Float32Array(mesh.numRegions);
    for (let i = 0; i < t.length; i++) t[i] = srgbToLinear(colorFn(t_elevation[i])[0]);
    for (let i = 0; i < r.length; i++) r[i] = srgbToLinear(colorFn(r_elevation[i])[0]);
    return { t, r };
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
    const showPlates = state.showPlates;
    const showStress = false;
    const waterLevel = 0;
    const debugLayer = state.debugLayer || '';

    let dbgArr = null, dbgMin = 0, dbgMax = 0;
    const isHeightmap = debugLayer === 'heightmap';
    const isLandHeightmap = debugLayer === 'landheightmap';
    const climateColor = climateColorFn(debugLayer, state.climateSeason, state.curData);
    const isKoppen = debugLayer === 'koppen';
    const isBiome = debugLayer === 'biome';
    const koppenArr = (isKoppen || isBiome) ? (debugLayers && debugLayers.koppen) : null;
    if (!isHeightmap && !isLandHeightmap && !climateColor && !isKoppen && !isBiome && debugLayer && debugLayers && debugLayers[debugLayer]) {
        dbgArr = debugLayers[debugLayer];
        for (let r = 0; r < mesh.numRegions; r++) {
            if (dbgArr[r] < dbgMin) dbgMin = dbgArr[r];
            if (dbgArr[r] > dbgMax) dbgMax = dbgArr[r];
        }
    }

    const { numSides } = mesh;
    const PI = Math.PI;
    const centerLon = state.mapCenterLon || 0;

    // Offset longitude by center meridian and wrap to [-PI, PI]
    function wrapLon(lon) {
        let l = lon - centerLon;
        if (l > PI) l -= 2 * PI;
        else if (l < -PI) l += 2 * PI;
        return l;
    }

    const biomeSmoothed = (isBiome && koppenArr) ? getCachedBiomeSmoothed(mesh, koppenArr, r_elevation) : null;
    const terrainColor = terrainColorFn();
    const isSmooth = isHeightmap || isLandHeightmap;
    const grey = isSmooth ? smoothGreys(mesh, isLandHeightmap ? landHeightmapColor : heightmapColor, t_elevation, r_elevation) : null;
    const rgb = isSmooth ? null : regionColors(mesh.numRegions, regionColorFn({ climateColor, isBiome, biomeSmoothed, isKoppen, koppenArr,
        dbgArr, dbgMin, dbgMax, showPlates, showStress, r_plate, r_stress, mountain_r, coastline_r, ocean_r, r_elevation, waterLevel, terrainColor }));

    // Upper-bound allocation: wrapping sides produce 2 triangles, non-wrapping 1.
    // Wraps are rare, so 2× is a conservative upper bound; trimmed after the loop.
    const posArr = new Float32Array(numSides * 2 * 9);
    const colArr = new Float32Array(numSides * 2 * 9);
    const faceToSide = new Int32Array(numSides * 2);
    let triCount = 0;

    for (let s = 0; s < numSides; s++) {
        const it = mesh.s_inner_t(s);
        const ot = mesh.s_outer_t(s);
        const br = mesh.s_begin_r(s);

        const re = r_elevation[br] - waterLevel;

        // Per-vertex colors for smooth heightmaps, flat for everything else
        let c0r, c0g, c0b, c1r, c1g, c1b, c2r, c2g, c2b;
        if (isSmooth) {
            const v0 = grey.t[it], v1 = grey.t[ot], v2 = grey.r[br];
            c0r = c0g = c0b = v0;
            c1r = c1g = c1b = v1;
            c2r = c2g = c2b = v2;
        } else {
            const cr = rgb[3 * br], cg = rgb[3 * br + 1], cb = rgb[3 * br + 2];
            c0r = c1r = c2r = cr;
            c0g = c1g = c2g = cg;
            c0b = c1b = c2b = cb;
        }

        const x0 = t_xyz[3*it], y0 = t_xyz[3*it+1], z0 = t_xyz[3*it+2];
        const x1 = t_xyz[3*ot], y1 = t_xyz[3*ot+1], z1 = t_xyz[3*ot+2];
        const x2 = r_xyz[3*br], y2 = r_xyz[3*br+1], z2 = r_xyz[3*br+2];

        let lon0 = wrapLon(Math.atan2(x0, z0)), lat0 = Math.asin(Math.max(-1, Math.min(1, y0)));
        let lon1 = wrapLon(Math.atan2(x1, z1)), lat1 = Math.asin(Math.max(-1, Math.min(1, y1)));
        let lon2 = wrapLon(Math.atan2(x2, z2)), lat2 = Math.asin(Math.max(-1, Math.min(1, y2)));

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
            colArr[off]=c0r; colArr[off+1]=c0g; colArr[off+2]=c0b;
            colArr[off+3]=c1r; colArr[off+4]=c1g; colArr[off+5]=c1b;
            colArr[off+6]=c2r; colArr[off+7]=c2g; colArr[off+8]=c2b;
            faceToSide[triCount] = s;
            triCount++;

            off = triCount * 9;
            posArr[off]   = cx((lon0-2*PI)*sx); posArr[off+1] = cy(lat0*sx); posArr[off+2] = 0;
            posArr[off+3] = cx((lon1-2*PI)*sx); posArr[off+4] = cy(lat1*sx); posArr[off+5] = 0;
            posArr[off+6] = cx((lon2-2*PI)*sx); posArr[off+7] = cy(lat2*sx); posArr[off+8] = 0;
            colArr[off]=c0r; colArr[off+1]=c0g; colArr[off+2]=c0b;
            colArr[off+3]=c1r; colArr[off+4]=c1g; colArr[off+5]=c1b;
            colArr[off+6]=c2r; colArr[off+7]=c2g; colArr[off+8]=c2b;
            faceToSide[triCount] = s;
            triCount++;
        } else {
            const off = triCount * 9;
            posArr[off]   = cx(lon0*sx); posArr[off+1] = cy(lat0*sx); posArr[off+2] = 0;
            posArr[off+3] = cx(lon1*sx); posArr[off+4] = cy(lat1*sx); posArr[off+5] = 0;
            posArr[off+6] = cx(lon2*sx); posArr[off+7] = cy(lat2*sx); posArr[off+8] = 0;
            colArr[off]=c0r; colArr[off+1]=c0g; colArr[off+2]=c0b;
            colArr[off+3]=c1r; colArr[off+4]=c1g; colArr[off+5]=c1b;
            colArr[off+6]=c2r; colArr[off+7]=c2g; colArr[off+8]=c2b;
            faceToSide[triCount] = s;
            triCount++;
        }
    }

    const finalPos = posArr.subarray(0, triCount * 9);
    const finalCol = colArr.subarray(0, triCount * 9);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(finalPos), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(finalCol), 3));

    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, clippingPlanes: MAP_CLIP_PLANES });
    state.mapMesh = new THREE.Mesh(geo, mat);
    state.mapMesh.visible = state.mapMode;
    state.mapMesh._builtCenterLon = state.mapCenterLon || 0;
    state.mapFaceToSide = faceToSide.subarray(0, triCount);
    state._mapHoverBackup = null;
    state._mapKoppenHoverBackup = null;
    state._mapPendingBackup = null;
    // Wrap clones: children inherit parent visibility + transform — shown only while the Centre slider slides the map
    // (at rest they lie wholly outside the clip planes, yet would still cost their vertices every frame)
    const cloneL = new THREE.Mesh(geo, mat); cloneL.position.x = -4;
    const cloneR = new THREE.Mesh(geo, mat); cloneR.position.x = 4;
    cloneL.visible = cloneR.visible = false;
    state.mapMesh.add(cloneL, cloneR);
    state.mapMesh.userData.wrap = [cloneL, cloneR];
    scene.add(state.mapMesh);

    updateSuperPlateBorders();
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
    const PI = Math.PI;
    const centerLonDeg = (state.mapCenterLon || 0) * 180 / PI;
    const positions = [];

    for (let deg = -90; deg <= 90; deg += spacing) {
        const y = (deg * Math.PI / 180) * sx;
        positions.push(-2, y, Z, 2, y, Z);
    }

    for (let deg = -180; deg <= 180; deg += spacing) {
        let offsetDeg = deg - centerLonDeg;
        // Wrap to [-180, 180]
        if (offsetDeg > 180) offsetDeg -= 360;
        else if (offsetDeg < -180) offsetDeg += 360;
        const x = (offsetDeg * Math.PI / 180) * sx;
        positions.push(x, -1, Z, x, 1, Z);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const gridMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, clippingPlanes: MAP_CLIP_PLANES });
    state.mapGridMesh = new THREE.LineSegments(geo, gridMat);
    state.mapGridMesh.visible = state.mapMode && state.gridEnabled;
    // Wrap clones for smooth longitude scrolling
    const gCloneL = new THREE.LineSegments(geo, gridMat); gCloneL.position.x = -4;
    const gCloneR = new THREE.LineSegments(geo, gridMat); gCloneR.position.x = 4;
    state.mapGridMesh.add(gCloneL, gCloneR);
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


// Build / destroy super plate boundary lines for both globe and map views.
// Called from buildMesh, buildMapMesh, and the Show Plates checkbox handler.
export function updateSuperPlateBorders() {
    // Cleanup existing
    if (state.superPlateBorderMesh) { scene.remove(state.superPlateBorderMesh); state.superPlateBorderMesh.geometry.dispose(); state.superPlateBorderMesh.material.dispose(); state.superPlateBorderMesh = null; }
    if (state.mapSuperPlateBorderMesh) { scene.remove(state.mapSuperPlateBorderMesh); state.mapSuperPlateBorderMesh.geometry.dispose(); state.mapSuperPlateBorderMesh.material.dispose(); state.mapSuperPlateBorderMesh = null; }

    if (!state.curData) return;
    const showPlates = state.showPlates;
    if (!showPlates) return;

    const { mesh, t_xyz, t_elevation, debugLayers } = state.curData;
    if (!debugLayers || !debugLayers.superPlates) return;
    const spArr = debugLayers.superPlates;
    const { numSides } = mesh;
    const PI = Math.PI;
    const V = 0.04;

    // Globe borders
    if (!state.mapMode) {
        const bp = [];
        for (let s = 0; s < numSides; s++) {
            const opp = mesh.halfedges[s];
            if (s < opp) {
                const r1 = mesh.s_begin_r(s);
                const r2 = mesh.s_begin_r(opp);
                if (spArr[r1] !== spArr[r2]) {
                    const it = mesh.s_inner_t(s), ot = mesh.s_outer_t(s);
                    const ite = t_elevation[it], ote = t_elevation[ot];
                    const d1 = 1.002 + (ite > 0 ? ite*V : ite*V*0.3);
                    const d2 = 1.002 + (ote > 0 ? ote*V : ote*V*0.3);
                    bp.push(
                        t_xyz[3*it]*d1, t_xyz[3*it+1]*d1, t_xyz[3*it+2]*d1,
                        t_xyz[3*ot]*d2, t_xyz[3*ot+1]*d2, t_xyz[3*ot+2]*d2
                    );
                }
            }
        }
        if (bp.length > 0) {
            const bg = new THREE.BufferGeometry();
            bg.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
            state.superPlateBorderMesh = new THREE.LineSegments(bg,
                new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55 }));
            scene.add(state.superPlateBorderMesh);
        }
    }

    // Map borders
    if (state.mapMode) {
        const centerLon = state.mapCenterLon || 0;
        function wrapLon(lon) {
            let l = lon - centerLon;
            if (l > PI) l -= 2 * PI;
            else if (l < -PI) l += 2 * PI;
            return l;
        }
        const sx = 2 / PI;
        const bps = [];
        for (let s = 0; s < numSides; s++) {
            const opp = mesh.halfedges[s];
            if (s < opp) {
                const r1 = mesh.s_begin_r(s);
                const r2 = mesh.s_begin_r(opp);
                if (spArr[r1] !== spArr[r2]) {
                    const it = mesh.s_inner_t(s), ot = mesh.s_outer_t(s);
                    const lat1 = Math.asin(Math.max(-1, Math.min(1, t_xyz[3*it+1])));
                    const lon1 = wrapLon(Math.atan2(t_xyz[3*it], t_xyz[3*it+2]));
                    const lat2 = Math.asin(Math.max(-1, Math.min(1, t_xyz[3*ot+1])));
                    const lon2 = wrapLon(Math.atan2(t_xyz[3*ot], t_xyz[3*ot+2]));
                    if (Math.abs(lon1 - lon2) < PI * 0.5) {
                        bps.push(lon1 * sx, lat1 * sx, 0.002, lon2 * sx, lat2 * sx, 0.002);
                    }
                }
            }
        }
        if (bps.length > 0) {
            const bg = new THREE.BufferGeometry();
            bg.setAttribute('position', new THREE.Float32BufferAttribute(bps, 3));
            const bMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55, clippingPlanes: MAP_CLIP_PLANES });
            state.mapSuperPlateBorderMesh = new THREE.LineSegments(bg, bMat);
            const bcL = new THREE.LineSegments(bg, bMat); bcL.position.x = -4;
            const bcR = new THREE.LineSegments(bg, bMat); bcR.position.x = 4;
            state.mapSuperPlateBorderMesh.add(bcL, bcR);
            scene.add(state.mapSuperPlateBorderMesh);
        }
    }
}

// Build Voronoi mesh — each half-edge produces one triangle.
export function buildMesh() {
    if (!state.curData) return;
    const { mesh, r_xyz, t_xyz, r_plate, r_elevation, t_elevation, mountain_r, coastline_r, ocean_r, r_stress, debugLayers } = state.curData;
    const showPlates = state.showPlates;
    const showStress = false;
    const waterLevel = 0;
    const debugLayer = state.debugLayer || '';

    // Precompute debug layer min/max if active
    let dbgArr = null, dbgMin = 0, dbgMax = 0;
    const isHeightmap = debugLayer === 'heightmap';
    const isLandHeightmap = debugLayer === 'landheightmap';
    const climateColor = climateColorFn(debugLayer, state.climateSeason, state.curData);
    const isKoppen = debugLayer === 'koppen';
    const isBiome = debugLayer === 'biome';
    const koppenArr = (isKoppen || isBiome) ? (debugLayers && debugLayers.koppen) : null;
    if (!isHeightmap && !isLandHeightmap && !climateColor && !isKoppen && !isBiome && debugLayer && debugLayers && debugLayers[debugLayer]) {
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
    // Track per-side winding swaps so updateMeshColors can assign per-vertex colors correctly
    const sideSwapped = new Uint8Array(numSides);

    const biomeSmoothed = (isBiome && koppenArr) ? getCachedBiomeSmoothed(mesh, koppenArr, r_elevation) : null;
    const terrainColor = terrainColorFn();
    const isSmooth = isHeightmap || isLandHeightmap;
    const grey = isSmooth ? smoothGreys(mesh, isLandHeightmap ? landHeightmapColor : heightmapColor, t_elevation, r_elevation) : null;
    const rgb = isSmooth ? null : regionColors(mesh.numRegions, regionColorFn({ climateColor, isBiome, biomeSmoothed, isKoppen, koppenArr,
        dbgArr, dbgMin, dbgMax, showPlates, showStress, r_plate, r_stress, mountain_r, coastline_r, ocean_r, r_elevation, waterLevel, terrainColor }));

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
        const cnx = (v0x+v1x+v2x)/3, cny = (v0y+v1y+v2y)/3, cnz = (v0z+v1z+v2z)/3;
        const swapped = nx*cnx + ny*cny + nz*cnz < 0;
        if (swapped) {
            let tx, ty, tz;
            tx=v1x; ty=v1y; tz=v1z;
            v1x=v2x; v1y=v2y; v1z=v2z;
            v2x=tx; v2y=ty; v2z=tz;
        }
        sideSwapped[s] = swapped ? 1 : 0;

        pos[off]   = v0x; pos[off+1] = v0y; pos[off+2] = v0z;
        pos[off+3] = v1x; pos[off+4] = v1y; pos[off+5] = v1z;
        pos[off+6] = v2x; pos[off+7] = v2y; pos[off+8] = v2z;

        if (isSmooth) {
            // Smooth heightmap: per-vertex colors from averaged triangle elevations
            const c0 = grey.t[it];   // inner_t (vertex 0, never swapped)
            const cOt = grey.t[ot];  // outer_t
            const cBr = grey.r[br];  // begin_r
            // After winding fix, v1/v2 may have swapped (outer_t ↔ begin_r)
            const c1 = swapped ? cBr : cOt;
            const c2 = swapped ? cOt : cBr;
            col[off] = col[off+1] = col[off+2] = c0;
            col[off+3] = col[off+4] = col[off+5] = c1;
            col[off+6] = col[off+7] = col[off+8] = c2;
        } else {
            const cr = rgb[3 * br], cg = rgb[3 * br + 1], cb = rgb[3 * br + 2];
            for (let j = 0; j < 3; j++) {
                col[off+j*3]   = cr;
                col[off+j*3+1] = cg;
                col[off+j*3+2] = cb;
            }
        }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(col, 3));

    state._hoverBackup = null;
    state._koppenHoverBackup = null;
    state._sideSwapped = sideSwapped;

    const mat = globeMaterial(isExactLayer(debugLayer));
    mat.userData.exact = isExactLayer(debugLayer);
    state.planetMesh = new THREE.Mesh(geo, mat);
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

    updateSuperPlateBorders();

    buildDriftArrows();
    updatePendingHighlight();
    updateHoverHighlight();

    // Defer map mesh construction to reduce peak GPU memory — built on demand
    // when switching to map view (see viewMode handler in main.js).
    if (state.mapMode) buildMapMesh();
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

// Update only color buffers for globe + map meshes (no geometry rebuild).
// Use this when switching display modes to avoid GPU memory spikes.
export function updateMeshColors() {
    if (!state.curData || !state.planetMesh) return;
    const { mesh, r_plate, r_elevation, t_elevation, mountain_r, coastline_r, ocean_r, r_stress, debugLayers } = state.curData;
    const showPlates = state.showPlates;
    const showStress = false;
    const waterLevel = 0;
    const debugLayer = state.debugLayer || '';

    // Precompute debug layer state
    let dbgArr = null, dbgMin = 0, dbgMax = 0;
    const isHeightmap = debugLayer === 'heightmap';
    const isLandHeightmap = debugLayer === 'landheightmap';
    const climateColor = climateColorFn(debugLayer, state.climateSeason, state.curData);
    const isKoppen = debugLayer === 'koppen';
    const isBiome = debugLayer === 'biome';
    const koppenArr = (isKoppen || isBiome) ? (debugLayers && debugLayers.koppen) : null;
    if (!isHeightmap && !isLandHeightmap && !climateColor && !isKoppen && !isBiome && debugLayer && debugLayers && debugLayers[debugLayer]) {
        dbgArr = debugLayers[debugLayer];
        for (let r = 0; r < mesh.numRegions; r++) {
            if (dbgArr[r] < dbgMin) dbgMin = dbgArr[r];
            if (dbgArr[r] > dbgMax) dbgMax = dbgArr[r];
        }
    }

    // Precompute smoothed biome colors (one-pass neighbor blend)
    const biomeSmoothed = (isBiome && koppenArr) ? getCachedBiomeSmoothed(mesh, koppenArr, r_elevation) : null;
    const terrainColor = terrainColorFn();
    const isSmooth = isHeightmap || isLandHeightmap;
    const grey = isSmooth ? smoothGreys(mesh, isLandHeightmap ? landHeightmapColor : heightmapColor, t_elevation, r_elevation) : null;
    const rgb = isSmooth ? null : regionColors(mesh.numRegions, regionColorFn({ climateColor, isBiome, biomeSmoothed, isKoppen, koppenArr,
        dbgArr, dbgMin, dbgMax, showPlates, showStress, r_plate, r_stress, mountain_r, coastline_r, ocean_r, r_elevation, waterLevel, terrainColor }));

    // The globe's material follows the layer: unlit for an exact layer, lit otherwise
    const exact = isExactLayer(debugLayer);
    if (state.planetMesh.material.userData.exact !== exact) {
        state.planetMesh.material.dispose();
        state.planetMesh.material = globeMaterial(exact);
        state.planetMesh.material.userData.exact = exact;
    }

    // Update globe mesh colors in-place
    const colorAttr = state.planetMesh.geometry.getAttribute('color');
    const colors = colorAttr.array;
    const { numSides } = mesh;
    const sideSwapped = state._sideSwapped;

    for (let s = 0; s < numSides; s++) {
        const off = s * 9;
        if (isSmooth) {
            const it = mesh.s_inner_t(s);
            const ot = mesh.s_outer_t(s);
            const br = mesh.s_begin_r(s);
            const c0 = grey.t[it];
            const cOt = grey.t[ot];
            const cBr = grey.r[br];
            const swapped = sideSwapped && sideSwapped[s];
            const c1 = swapped ? cBr : cOt;
            const c2 = swapped ? cOt : cBr;
            colors[off] = colors[off+1] = colors[off+2] = c0;
            colors[off+3] = colors[off+4] = colors[off+5] = c1;
            colors[off+6] = colors[off+7] = colors[off+8] = c2;
        } else {
            const br = mesh.s_begin_r(s);
            const cr = rgb[3 * br], cg = rgb[3 * br + 1], cb = rgb[3 * br + 2];
            for (let j = 0; j < 3; j++) {
                colors[off + j*3]     = cr;
                colors[off + j*3 + 1] = cg;
                colors[off + j*3 + 2] = cb;
            }
        }
    }
    colorAttr.needsUpdate = true;
    state._hoverBackup = null;
    state._koppenHoverBackup = null;
    state._pendingBackup = null;

    // Update map mesh colors in-place (if map exists)
    if (state.mapMesh && state.mapFaceToSide) {
        const mapColorAttr = state.mapMesh.geometry.getAttribute('color');
        const mapColors = mapColorAttr.array;
        const fts = state.mapFaceToSide;

        for (let f = 0; f < fts.length; f++) {
            const s = fts[f];
            const off = f * 9;
            if (isSmooth) {
                const it = mesh.s_inner_t(s);
                const ot = mesh.s_outer_t(s);
                const br = mesh.s_begin_r(s);
                const v0 = grey.t[it], v1 = grey.t[ot], v2 = grey.r[br];
                mapColors[off] = mapColors[off+1] = mapColors[off+2] = v0;
                mapColors[off+3] = mapColors[off+4] = mapColors[off+5] = v1;
                mapColors[off+6] = mapColors[off+7] = mapColors[off+8] = v2;
            } else {
                const br = mesh.s_begin_r(s);
                const cr = rgb[3 * br], cg = rgb[3 * br + 1], cb = rgb[3 * br + 2];
                for (let j = 0; j < 3; j++) {
                    mapColors[off + j*3]     = cr;
                    mapColors[off + j*3 + 1] = cg;
                    mapColors[off + j*3 + 2] = cb;
                }
            }
        }
        mapColorAttr.needsUpdate = true;
        state._mapHoverBackup = null;
        state._mapKoppenHoverBackup = null;
        state._mapPendingBackup = null;
    }

    // Update water visibility
    waterMesh.visible = !state.mapMode && !showPlates && !showStress && !debugLayer;

    updatePendingHighlight();
    updateMapPendingHighlight();
    updateHoverHighlight();
    updateMapHoverHighlight();
}

// Hover highlight — brighten hovered plate's cells (surgical save/restore).
export function updateHoverHighlight() {
    if (!state.planetMesh || !state.curData) return;
    const colorAttr = state.planetMesh.geometry.getAttribute('color');
    const colors = colorAttr.array;

    // Restore previously highlighted cells
    if (state._hoverBackup) {
        const { offsets, saved } = state._hoverBackup;
        for (let i = 0; i < offsets.length; i++) {
            const off = offsets[i] * 9;
            for (let j = 0; j < 9; j++) colors[off + j] = saved[i * 9 + j];
        }
        state._hoverBackup = null;
    }

    // Apply new highlight
    if (state.hoveredPlate >= 0) {
        const { mesh, r_plate } = state.curData;
        // Count cells for this plate
        let count = 0;
        for (let s = 0; s < mesh.numSides; s++) {
            if (r_plate[mesh.s_begin_r(s)] === state.hoveredPlate) count++;
        }
        const offsets = new Int32Array(count);
        const saved = new Float32Array(count * 9);
        let idx = 0;
        for (let s = 0; s < mesh.numSides; s++) {
            if (r_plate[mesh.s_begin_r(s)] === state.hoveredPlate) {
                offsets[idx] = s;
                const off = s * 9;
                for (let j = 0; j < 9; j++) saved[idx * 9 + j] = colors[off + j];
                for (let j = 0; j < 3; j++) {
                    colors[off + j*3]     = Math.min(1, colors[off + j*3]     + 0.22);
                    colors[off + j*3 + 1] = Math.min(1, colors[off + j*3 + 1] + 0.22);
                    colors[off + j*3 + 2] = Math.min(1, colors[off + j*3 + 2] + 0.22);
                }
                idx++;
            }
        }
        state._hoverBackup = { offsets, saved };
    }
    colorAttr.needsUpdate = true;
}

// Hover highlight for map mesh (surgical save/restore).
export function updateMapHoverHighlight() {
    if (!state.mapMesh || !state.curData || !state.mapFaceToSide) return;
    const colorAttr = state.mapMesh.geometry.getAttribute('color');
    const colors = colorAttr.array;

    // Restore previously highlighted cells
    if (state._mapHoverBackup) {
        const { offsets, saved } = state._mapHoverBackup;
        for (let i = 0; i < offsets.length; i++) {
            const off = offsets[i] * 9;
            for (let j = 0; j < 9; j++) colors[off + j] = saved[i * 9 + j];
        }
        state._mapHoverBackup = null;
    }

    // Apply new highlight
    if (state.hoveredPlate >= 0) {
        const { mesh, r_plate } = state.curData;
        const fts = state.mapFaceToSide;
        // Count faces for this plate
        let count = 0;
        for (let f = 0; f < fts.length; f++) {
            if (r_plate[mesh.s_begin_r(fts[f])] === state.hoveredPlate) count++;
        }
        const offsets = new Int32Array(count);
        const saved = new Float32Array(count * 9);
        let idx = 0;
        for (let f = 0; f < fts.length; f++) {
            if (r_plate[mesh.s_begin_r(fts[f])] === state.hoveredPlate) {
                offsets[idx] = f;
                const off = f * 9;
                for (let j = 0; j < 9; j++) saved[idx * 9 + j] = colors[off + j];
                for (let j = 0; j < 3; j++) {
                    colors[off + j*3]     = Math.min(1, colors[off + j*3]     + 0.22);
                    colors[off + j*3 + 1] = Math.min(1, colors[off + j*3 + 1] + 0.22);
                    colors[off + j*3 + 2] = Math.min(1, colors[off + j*3 + 2] + 0.22);
                }
                idx++;
            }
        }
        state._mapHoverBackup = { offsets, saved };
    }
    colorAttr.needsUpdate = true;
}

// Köppen legend hover highlight — brighten cells matching hovered climate class (globe).
export function updateKoppenHoverHighlight() {
    if (!state.planetMesh || !state.curData) return;
    const colorAttr = state.planetMesh.geometry.getAttribute('color');
    const colors = colorAttr.array;

    // Restore previously highlighted cells
    if (state._koppenHoverBackup) {
        const { offsets, saved } = state._koppenHoverBackup;
        for (let i = 0; i < offsets.length; i++) {
            const off = offsets[i] * 9;
            for (let j = 0; j < 9; j++) colors[off + j] = saved[i * 9 + j];
        }
        state._koppenHoverBackup = null;
    }

    if (state.hoveredKoppen >= 0) {
        const { mesh, debugLayers } = state.curData;
        const koppenArr = debugLayers && debugLayers.koppen;
        if (!koppenArr) { colorAttr.needsUpdate = true; return; }
        let count = 0;
        for (let s = 0; s < mesh.numSides; s++) {
            if (koppenArr[mesh.s_begin_r(s)] === state.hoveredKoppen) count++;
        }
        const offsets = new Int32Array(count);
        const saved = new Float32Array(count * 9);
        let idx = 0;
        for (let s = 0; s < mesh.numSides; s++) {
            if (koppenArr[mesh.s_begin_r(s)] === state.hoveredKoppen) {
                offsets[idx] = s;
                const off = s * 9;
                for (let j = 0; j < 9; j++) saved[idx * 9 + j] = colors[off + j];
                for (let j = 0; j < 3; j++) {
                    colors[off + j*3]     = Math.min(1, colors[off + j*3]     + 0.22);
                    colors[off + j*3 + 1] = Math.min(1, colors[off + j*3 + 1] + 0.22);
                    colors[off + j*3 + 2] = Math.min(1, colors[off + j*3 + 2] + 0.22);
                }
                idx++;
            }
        }
        state._koppenHoverBackup = { offsets, saved };
    }
    colorAttr.needsUpdate = true;
}

// Köppen legend hover highlight for map mesh (surgical save/restore).
export function updateMapKoppenHoverHighlight() {
    if (!state.mapMesh || !state.curData || !state.mapFaceToSide) return;
    const colorAttr = state.mapMesh.geometry.getAttribute('color');
    const colors = colorAttr.array;

    // Restore previously highlighted cells
    if (state._mapKoppenHoverBackup) {
        const { offsets, saved } = state._mapKoppenHoverBackup;
        for (let i = 0; i < offsets.length; i++) {
            const off = offsets[i] * 9;
            for (let j = 0; j < 9; j++) colors[off + j] = saved[i * 9 + j];
        }
        state._mapKoppenHoverBackup = null;
    }

    if (state.hoveredKoppen >= 0) {
        const { mesh, debugLayers } = state.curData;
        const koppenArr = debugLayers && debugLayers.koppen;
        if (!koppenArr) { colorAttr.needsUpdate = true; return; }
        const fts = state.mapFaceToSide;
        let count = 0;
        for (let f = 0; f < fts.length; f++) {
            if (koppenArr[mesh.s_begin_r(fts[f])] === state.hoveredKoppen) count++;
        }
        const offsets = new Int32Array(count);
        const saved = new Float32Array(count * 9);
        let idx = 0;
        for (let f = 0; f < fts.length; f++) {
            if (koppenArr[mesh.s_begin_r(fts[f])] === state.hoveredKoppen) {
                offsets[idx] = f;
                const off = f * 9;
                for (let j = 0; j < 9; j++) saved[idx * 9 + j] = colors[off + j];
                for (let j = 0; j < 3; j++) {
                    colors[off + j*3]     = Math.min(1, colors[off + j*3]     + 0.22);
                    colors[off + j*3 + 1] = Math.min(1, colors[off + j*3 + 1] + 0.22);
                    colors[off + j*3 + 2] = Math.min(1, colors[off + j*3 + 2] + 0.22);
                }
                idx++;
            }
        }
        state._mapKoppenHoverBackup = { offsets, saved };
    }
    colorAttr.needsUpdate = true;
}

// Pending-toggle highlight — tint plates queued for rebuild (surgical save/restore).
// Runs BEFORE hover highlight so hover saves/restores the already-tinted colors.
export function updatePendingHighlight() {
    if (!state.planetMesh || !state.curData) return;
    const colorAttr = state.planetMesh.geometry.getAttribute('color');
    const colors = colorAttr.array;

    // Restore previously highlighted cells
    if (state._pendingBackup) {
        const { offsets, saved } = state._pendingBackup;
        for (let i = 0; i < offsets.length; i++) {
            const off = offsets[i] * 9;
            for (let j = 0; j < 9; j++) colors[off + j] = saved[i * 9 + j];
        }
        state._pendingBackup = null;
    }

    if (state.pendingToggles.size > 0) {
        const { mesh, r_plate, plateIsOcean } = state.curData;
        let count = 0;
        for (let s = 0; s < mesh.numSides; s++) {
            if (state.pendingToggles.has(r_plate[mesh.s_begin_r(s)])) count++;
        }
        const offsets = new Int32Array(count);
        const saved = new Float32Array(count * 9);
        let idx = 0;
        for (let s = 0; s < mesh.numSides; s++) {
            const pid = r_plate[mesh.s_begin_r(s)];
            if (state.pendingToggles.has(pid)) {
                offsets[idx] = s;
                const off = s * 9;
                for (let j = 0; j < 9; j++) saved[idx * 9 + j] = colors[off + j];
                const isOcean = plateIsOcean.has(pid);
                for (let j = 0; j < 3; j++) {
                    if (isOcean) {
                        // Ocean → Land pending: strong green tint
                        colors[off + j*3]     = colors[off + j*3]     * 0.7;
                        colors[off + j*3 + 1] = Math.min(1, colors[off + j*3 + 1] + 0.25);
                        colors[off + j*3 + 2] = colors[off + j*3 + 2] * 0.7;
                    } else {
                        // Land → Ocean pending: strong blue tint
                        colors[off + j*3]     = colors[off + j*3]     * 0.7;
                        colors[off + j*3 + 1] = colors[off + j*3 + 1] * 0.7;
                        colors[off + j*3 + 2] = Math.min(1, colors[off + j*3 + 2] + 0.25);
                    }
                }
                idx++;
            }
        }
        state._pendingBackup = { offsets, saved };
    }
    colorAttr.needsUpdate = true;
}

// Pending-toggle highlight for map mesh (surgical save/restore).
export function updateMapPendingHighlight() {
    if (!state.mapMesh || !state.curData || !state.mapFaceToSide) return;
    const colorAttr = state.mapMesh.geometry.getAttribute('color');
    const colors = colorAttr.array;

    if (state._mapPendingBackup) {
        const { offsets, saved } = state._mapPendingBackup;
        for (let i = 0; i < offsets.length; i++) {
            const off = offsets[i] * 9;
            for (let j = 0; j < 9; j++) colors[off + j] = saved[i * 9 + j];
        }
        state._mapPendingBackup = null;
    }

    if (state.pendingToggles.size > 0) {
        const { mesh, r_plate, plateIsOcean } = state.curData;
        const fts = state.mapFaceToSide;
        let count = 0;
        for (let f = 0; f < fts.length; f++) {
            if (state.pendingToggles.has(r_plate[mesh.s_begin_r(fts[f])])) count++;
        }
        const offsets = new Int32Array(count);
        const saved = new Float32Array(count * 9);
        let idx = 0;
        for (let f = 0; f < fts.length; f++) {
            const pid = r_plate[mesh.s_begin_r(fts[f])];
            if (state.pendingToggles.has(pid)) {
                offsets[idx] = f;
                const off = f * 9;
                for (let j = 0; j < 9; j++) saved[idx * 9 + j] = colors[off + j];
                const isOcean = plateIsOcean.has(pid);
                for (let j = 0; j < 3; j++) {
                    if (isOcean) {
                        colors[off + j*3]     = colors[off + j*3]     * 0.7;
                        colors[off + j*3 + 1] = Math.min(1, colors[off + j*3 + 1] + 0.25);
                        colors[off + j*3 + 2] = colors[off + j*3 + 2] * 0.7;
                    } else {
                        colors[off + j*3]     = colors[off + j*3]     * 0.7;
                        colors[off + j*3 + 1] = colors[off + j*3 + 1] * 0.7;
                        colors[off + j*3 + 2] = Math.min(1, colors[off + j*3 + 2] + 0.25);
                    }
                }
                idx++;
            }
        }
        state._mapPendingBackup = { offsets, saved };
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

    // (season: 'year', 'jan' or 'jul' — the new climate's winds, m/s, on its 1° grid; null clears the arrows)
    if (!season || !state.curData || !state.curData.climate) return;

    const { mesh, r_xyz } = state.curData;
    const climateGrid = state.curData.climate.grid;
    const { lat: rLat, lon: rLon } = regionLatLon(state.curData);

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

        // (10 m/s → 1: the arrows' scale)
        const [ue, vn] = vectorAt(climateGrid, 'wind', season, rLat[r], rLon[r]);
        const we = ue / 10, wn = vn / 10;
        const speed = Math.sqrt(we * we + wn * wn);
        if (speed < 0.01) continue;

        const x = r_xyz[3 * r], y = r_xyz[3 * r + 1], z = r_xyz[3 * r + 2];

        // Color: blue (slow) → yellow (medium) → red (fast, 10 m/s and more)
        const t = Math.min(1, speed);
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

            const arrowLen = 0.008 + Math.min(0.012, speed * 0.012);
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
            let lon = Math.atan2(x, z) - (state.mapCenterLon || 0);
            if (lon > PI) lon -= 2 * PI; else if (lon < -PI) lon += 2 * PI;
            const lat = Math.asin(Math.max(-1, Math.min(1, y)));
            const mx = lon * sx;
            const my = lat * sx;

            const norm = speed || 1;
            const arrowLen = 0.006 + Math.min(0.012, speed * 0.012);
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
    const isPressureLayer = season && !!climateLayer(state.debugLayer)?.itcz;
    // (the ITCZ: a latitude per 1° of longitude on the climate grid, degrees → radians)
    const itczRow = climateGrid.itcz?.[season];
    const itczLons = itczRow ? Float32Array.from(itczRow, (_, i) => (-180 + (i + 0.5) * climateGrid.step) * DEG) : null;
    const itczLats = itczRow ? Float32Array.from(itczRow, v => v * DEG) : null;

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

    // (season: 'year', 'jan' or 'jul' — the new climate's surface currents, m/s, on its 1° grid; null clears them)
    if (!season || !state.curData || !state.curData.climate) return;

    const { mesh, r_xyz, r_elevation } = state.curData;
    const climateGrid = state.curData.climate.grid;
    const { lat: rLat, lon: rLon } = regionLatLon(state.curData);
    const sKey = ['year', 'jan', 'jul'].includes(season) ? season : 'year';
    // speeds scaled by the sea's 95th percentile (the currents' own scale: the gyres' transport over a display depth)
    let p95 = 0;
    {
        const U = climateGrid.currentU[sKey], V = climateGrid.currentV[sKey], sp = [];
        for (let c = 0; c < U.length; c++) if (climateGrid.sea[c]) sp.push(Math.hypot(U[c], V[c]));
        sp.sort((a, b) => a - b);
        p95 = sp.length ? sp[Math.floor(0.95 * (sp.length - 1))] : 0;
    }
    if (!(p95 > 0)) return;

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

        const [cu, cv] = vectorAt(climateGrid, 'currents', sKey, rLat[r], rLon[r]);
        const ce = cu / p95, cn = cv / p95;
        const speed = Math.min(1.5, Math.hypot(ce, cn));
        // warm or cold: the sea against its latitude's average (±0.2 °C and more)
        const warmth = 5 * gridSampleAt(climateGrid, climateGrid.sstAnom[sKey], rLat[r], rLon[r]);
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
            let lon = Math.atan2(x, z) - (state.mapCenterLon || 0);
            if (lon > PI) lon -= 2 * PI; else if (lon < -PI) lon += 2 * PI;
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

/** A longitude as it is read: `lonOf(x, z)` from a position on the sphere, turned so that the Map view's Centre Longitude is
 * in the middle (the export centred as the map is shown; issue #62). */
function exportLonOf(centerLon = state.mapCenterLon || 0) {
    const PI = Math.PI, cLon = centerLon;
    return (x, z) => {
        let l = Math.atan2(x, z) - cLon;
        if (l > PI) l -= 2 * PI; else if (l < -PI) l += 2 * PI;
        return l;
    };
}
/** The file name's note of the centre longitude — `-c120E` — when it is not 0°. */
export function exportCentreTag(centerLonDeg = (state.mapCenterLon || 0) * 180 / Math.PI) {
    const d = Math.round(centerLonDeg);
    return d ? `-c${Math.abs(d)}${d > 0 ? 'E' : 'W'}` : '';
}
function exportFilename(type, seed) {
    seed = `${seed}${exportCentreTag()}`;
    switch (type) {
        case 'landmask':       return `orogen-landmask-${seed}.png`;
        case 'landheightmap':  return `orogen-land-heightmap-${seed}.png`;
        case 'heightmap':      return `orogen-heightmap-${seed}.png`;
        case 'biome':          return `orogen-satellite-${seed}.png`;
        case 'koppen':         return `orogen-climate-${seed}.png`;
        default:               return `orogen-colormap-${seed}.png`;
    }
}

// ── the export's rasters (v2/js/view/export-panel.js, js/export-generate.js): the mesh drawn flat, in tiles, as colours
// or as numbers — the geometry built once per export and recoloured per layer ──

/**
 * Begin an export at `width` px (× width / 2), centred on `centerLon` (degrees): the map's triangles once, for every
 * layer that follows. @returns the export's context for renderExportLayer / endExportRender.
 */
export function beginExportRender(width, centerLon = 0) {
    const { mesh, r_xyz, t_xyz, r_elevation } = state.curData;
    const { numSides, numTriangles } = mesh, PI = Math.PI, sx = 2 / PI, height = width >> 1;
    const posArr = new Float32Array(numSides * 18), triRegions = new Uint32Array(numSides * 2), triInnerT = new Uint32Array(numSides * 2), triOuterT = new Uint32Array(numSides * 2);
    let triCount = 0;
    const lonOf = exportLonOf(centerLon * PI / 180), clx = (v) => Math.max(-2, Math.min(2, v)), cly = (v) => Math.max(-1, Math.min(1, v));
    const put = (lon0, lat0, lon1, lat1, lon2, lat2, br, it, ot) => {
        const off = triCount * 9;
        posArr[off] = clx(lon0 * sx); posArr[off + 1] = cly(lat0 * sx); posArr[off + 2] = 0;
        posArr[off + 3] = clx(lon1 * sx); posArr[off + 4] = cly(lat1 * sx); posArr[off + 5] = 0;
        posArr[off + 6] = clx(lon2 * sx); posArr[off + 7] = cly(lat2 * sx); posArr[off + 8] = 0;
        triRegions[triCount] = br; triInnerT[triCount] = it; triOuterT[triCount] = ot; triCount++;
    };
    for (let s = 0; s < numSides; s++) {
        const it = mesh.s_inner_t(s), ot = mesh.s_outer_t(s), br = mesh.s_begin_r(s);
        let lon0 = lonOf(t_xyz[3 * it], t_xyz[3 * it + 2]), lat0 = Math.asin(Math.max(-1, Math.min(1, t_xyz[3 * it + 1])));
        let lon1 = lonOf(t_xyz[3 * ot], t_xyz[3 * ot + 2]), lat1 = Math.asin(Math.max(-1, Math.min(1, t_xyz[3 * ot + 1])));
        let lon2 = lonOf(r_xyz[3 * br], r_xyz[3 * br + 2]), lat2 = Math.asin(Math.max(-1, Math.min(1, r_xyz[3 * br + 1])));
        if (Math.max(lon0, lon1, lon2) - Math.min(lon0, lon1, lon2) > PI) {
            // (a triangle across the seam: drawn at both edges)
            if (lon0 < 0) lon0 += 2 * PI; if (lon1 < 0) lon1 += 2 * PI; if (lon2 < 0) lon2 += 2 * PI;
            put(lon0, lat0, lon1, lat1, lon2, lat2, br, it, ot);
            put(lon0 - 2 * PI, lat0, lon1 - 2 * PI, lat1, lon2 - 2 * PI, lat2, br, it, ot);
        } else put(lon0, lat0, lon1, lat1, lon2, lat2, br, it, ot);
    }
    const tris = mesh.triangles, triRegionsOf = (t) => [tris[3 * t], tris[3 * t + 1], tris[3 * t + 2]];
    const maxTex = renderer.capabilities.maxTextureSize, MAX_TILE = 2048;
    const tileW = Math.min(width, maxTex, MAX_TILE), tileH = Math.min(height, maxTex, MAX_TILE);
    return { width, height, mesh, r_elevation, numTriangles, triRegionsOf, posData: new Float32Array(posArr.buffer, 0, triCount * 9), triRegions, triInnerT, triOuterT, triCount,
        offScene: new THREE.Scene(), tileW, tileH, tilesX: Math.ceil(width / tileW), tilesY: Math.ceil(height / tileH),
        pixelBuf: new Uint8Array(tileW * tileH * 4), floatBuf: new Float32Array(tileW * tileH * 4) };
}

/**
 * One layer of an export: `spec` = { mode: 'rgb', colorOf(r) → [r, g, b] (linear 0–1) } for a colour map (as the map
 * view draws it: each region its colour; the result sRGB, { kind: 'rgba', data }), or { mode: 'value', valueOf(r) → 0…1
 * (NaN as 0), smooth } for a number map — smooth: the value interpolated across each triangle from the regions' means at
 * its corners, as the heightmaps are; else flat per region (a class) — rendered through a float target ({ kind: 'gray16' }).
 */
export async function renderExportLayer(ctx, spec, onProgress = () => {}) {
    const { width, height, offScene, tileW, tileH, tilesX, tilesY, pixelBuf, floatBuf, triCount, triRegions, triInnerT, triOuterT, numTriangles, triRegionsOf, mesh } = ctx;
    const isValue = spec.mode === 'value', colData = new Float32Array(triCount * 9);
    if (isValue) {
        const n = mesh.numRegions, vr = new Float32Array(n);
        for (let r = 0; r < n; r++) { const v = spec.valueOf(r); vr[r] = v === v ? Math.min(1, Math.max(0, v)) : 0; }
        let tv = null;
        if (spec.smooth) {
            tv = new Float32Array(numTriangles);
            for (let t = 0; t < numTriangles; t++) { const [a, b, c] = triRegionsOf(t); tv[t] = (vr[a] + vr[b] + vr[c]) / 3; }
        }
        for (let i = 0; i < triCount; i++) {
            const off = i * 9, br = triRegions[i], v2 = vr[br], v0 = tv ? tv[triInnerT[i]] : v2, v1 = tv ? tv[triOuterT[i]] : v2;
            colData[off] = colData[off + 1] = colData[off + 2] = v0;
            colData[off + 3] = colData[off + 4] = colData[off + 5] = v1;
            colData[off + 6] = colData[off + 7] = colData[off + 8] = v2;
        }
    } else {
        const rgb = regionColors(mesh.numRegions, spec.colorOf);
        for (let i = 0; i < triCount; i++) {
            const off = i * 9, br = 3 * triRegions[i], cr = rgb[br], cg = rgb[br + 1], cb = rgb[br + 2];
            colData[off] = colData[off + 3] = colData[off + 6] = cr;
            colData[off + 1] = colData[off + 4] = colData[off + 7] = cg;
            colData[off + 2] = colData[off + 5] = colData[off + 8] = cb;
        }
    }
    offScene.background = isValue ? new THREE.Color(0x000000) : new THREE.Color(0x1a1a2e);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(ctx.posData, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colData, 3));
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }), mapMesh = new THREE.Mesh(geo, mat);
    offScene.add(mapMesh);
    const out = isValue ? new Uint16Array(width * height) : new Uint8ClampedArray(width * height * 4);
    const total = tilesX * tilesY; let done = 0;
    for (let ty = 0; ty < tilesY; ty++) for (let tx = 0; tx < tilesX; tx++) {
        const px0 = tx * tileW, py0 = ty * tileH, pw = Math.min(tileW, width - px0), ph = Math.min(tileH, height - py0);
        const cam = new THREE.OrthographicCamera(-2 + 4 * px0 / width, -2 + 4 * (px0 + pw) / width, 1 - 2 * py0 / height, 1 - 2 * (py0 + ph) / height, 0.1, 10);
        cam.position.set(0, 0, 5); cam.lookAt(0, 0, 0);
        const target = new THREE.WebGLRenderTarget(pw, ph, isValue ? { type: THREE.FloatType } : {});
        const prevCS = renderer.outputColorSpace;
        if (isValue) renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
        renderer.setRenderTarget(target); renderer.render(offScene, cam); renderer.outputColorSpace = prevCS;
        renderer.readRenderTargetPixels(target, 0, 0, pw, ph, isValue ? floatBuf : pixelBuf);
        renderer.setRenderTarget(null); target.dispose();
        for (let y = 0; y < ph; y++) {
            const srcRow = (ph - 1 - y) * pw, dstRow = (py0 + y) * width + px0;
            if (isValue) { for (let x = 0; x < pw; x++) out[dstRow + x] = Math.max(0, Math.min(65535, (floatBuf[(srcRow + x) * 4] * 65535 + 0.5) | 0)); }
            else for (let x = 0; x < pw; x++) {
                const si = (srcRow + x) * 4, di = (dstRow + x) * 4;
                for (let c = 0; c < 3; c++) { const v = pixelBuf[si + c] / 255; out[di + c] = (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255 + 0.5 | 0; }
                out[di + 3] = 255;
            }
        }
        done++; onProgress(done / total, 'rendering');
        await new Promise(r => setTimeout(r, 0));
    }
    offScene.remove(mapMesh); geo.dispose(); mat.dispose();
    return { kind: isValue ? 'gray16' : 'rgba', W: width, H: height, data: out };
}

/** The export's end: its buffers let go. */
export function endExportRender(ctx) { ctx.posData = ctx.pixelBuf = ctx.floatBuf = null; }

/** The Satellite view's colours per region (linear 0–1, 3 per region) for a season — for the export. */
export function exportSatelliteColors(season) {
    const { mesh, r_elevation, debugLayers } = state.curData, koppenArr = debugLayers && debugLayers.koppen;
    if (!koppenArr) return null;
    return smoothBiomeColors(mesh, satelliteRaw(mesh, koppenArr, r_elevation, state.curData, season));
}
export { koppenColor, heightmapColor, landHeightmapColor, toLinear3 };
