// Generate's and Import's map view in any of the ten projections (Evolution's: v2/js/view/projections.js and
// projection-glsl.js). Equirectangular is the flat map mesh itself (planet-mesh.js buildMapMesh), crisp at any zoom, as
// before. Any other projection: whenever the view changes, the part of the flat map that is on screen — the cells, the
// arrows, the borders and the highlights — is drawn into an off-screen equirectangular picture at about one and a half times the
// screen's resolution, and a plane in the projection's shape shows it through the projection's inverse: each pixel
// asks which longitude and latitude it shows and samples the picture there. Drawing only what is on screen keeps the map
// sharp at any zoom. The map's lines — the super-plate borders, the wind's and the currents' arrows, the ITCZ — are kept
// out of the picture (a line a pixel wide there would thin to nothing as the picture is shrunk to the screen): they are
// projected point by point (the forward projection) and drawn over it a screen pixel wide, as on the flat map; the
// grid is drawn by the shader. Zoom and pan are the map camera's, as on the flat map; hover and Ctrl-click find their
// place through the same inverse (mapLonLatAt).

import * as THREE from 'three';
import { renderer, scene, camera, mapCamera, setMapAspect, resetMapView } from './scene.js';
import { state } from './state.js';
import { P } from '../v2/js/view/projections.js';
import { PROJECTION_GLSL, projectionUniforms } from '../v2/js/view/projection-glsl.js';

const PI = Math.PI, TWO = 2 * PI, HALF = PI / 2, SX = 2 / PI;     // (the flat map: x = longitude × 2/π, y = latitude × 2/π)
const SAMPLES = 24;                                                 // (the view sampled on a 25 × 25 grid to find what it shows)
const wrap = (l) => ((l + PI) % TWO + TWO) % TWO - PI;

const projected = () => state.mapMode && state.mapProjection !== 'equirect' && !!state.mapMesh;
const bounds = () => P[state.mapProjection].bounds(state.mapProjOpts);
/** The projected map's half width in the map camera's units (its height is 2, as the flat map's). */
const halfWidth = () => { const b = bounds(); return (b[1] - b[0]) / (b[3] - b[2]); };

/** Show the map in projection `id` with its options; the map view is fitted to the new shape when the shape changes. */
export function setProjection(id, opts = {}) {
    const before = state.mapProjection + ':' + halfWidth();
    state.mapProjection = P[id] ? id : 'equirect';
    state.mapProjOpts = opts;
    setMapAspect(id === 'equirect' ? 2 : halfWidth());
    if (state.mapProjection + ':' + halfWidth() !== before) resetMapView();
}

/** The longitude and latitude (radians, the longitude in −π … π) at a point of the map view (the map camera's units), or null off the map. */
export function mapLonLatAt(wx, wy) {
    const centre = state.mapCenterLon || 0;
    if (state.mapProjection === 'equirect') {
        const lat = wy / SX;
        return lat < -HALF || lat > HALF ? null : [wrap(wx / SX + centre), lat];
    }
    const A = halfWidth();
    if (Math.abs(wx) > A || Math.abs(wy) > 1) return null;
    const b = bounds(), ll = P[state.mapProjection].inv(b[0] + (wx + A) / (2 * A) * (b[1] - b[0]), b[2] + (wy + 1) / 2 * (b[3] - b[2]), state.mapProjOpts);
    return ll ? [wrap(ll[0] + centre), ll[1]] : null;
}

let target = null, flatCam = null, projScene = null, plane = null;

function setUp() {
    flatCam = new THREE.OrthographicCamera(-2, 2, 1, -1, 0.1, 100);
    flatCam.position.set(0, 0, 5);
    flatCam.lookAt(0, 0, 0);
    projScene = new THREE.Scene();
    const u = projectionUniforms();
    plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
        uniforms: {
            map: { value: null }, uWin: { value: new THREE.Vector4() }, uGrid: { value: 0 }, uCentre: { value: 0 },
            uProj: { value: u.uProj }, uBounds: { value: new THREE.Vector4(...u.uBounds) }, uOpt: { value: new THREE.Vector4(...u.uOpt) },
        },
        vertexShader: 'varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform sampler2D map; uniform vec4 uWin; uniform float uGrid; uniform float uCentre; varying vec2 vUv;
${PROJECTION_GLSL}
// how near a line of the grid (every uGrid radians) the value v is, in pixels: 1 on the line, 0 a pixel or more away
float gridLine(float v) {
    float w = fwidth(v);
    if (w > 0.5) return 0.0;                                       // (across the projection's seam: no line)
    float d = abs(fract(v / uGrid + 0.5) - 0.5) * uGrid / max(w, 1e-6);
    return 1.0 - smoothstep(0.5, 1.0, d);
}
void main() {
    vec2 xy = vec2(uBounds.x + vUv.x * (uBounds.y - uBounds.x), uBounds.z + vUv.y * (uBounds.w - uBounds.z));
    vec2 ll;
    if (!projInverse(xy, ll)) discard;
    float lon = ll.x < uWin.x ? ll.x + 2.0 * PI : ll.x;               // (the picture may run past the map's edge, wrapped)
    gl_FragColor = texture2D(map, vec2((lon - uWin.x) / uWin.y, (ll.y - uWin.z) / uWin.w));
    #include <colorspace_fragment>
    // (the grid as the flat map's: white at 12 %, blended on the screen's colours)
    if (uGrid > 0.0) gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0), 0.12 * max(gridLine(ll.x + uCentre), gridLine(ll.y)));
}`,
        extensions: { derivatives: true },
        depthTest: false, depthWrite: false,
    }));
    plane.frustumCulled = false;
    plane.renderOrder = -1;                                         // (first: the lines over it)
    projScene.add(plane);
}

// The map's lines (LineSegments lying flat on the map, not its grid or the wrap copies), each with its projected copy
const lineCopies = new Map();                                       // source → { key, copy }
const MAX_SEGMENT = 0.25;                                           // (a projected segment longer than this crosses a seam: dropped)

function mapLines() {
    const lines = [];
    scene.traverseVisible((o) => {
        if (!o.isLineSegments || o === state.mapGridMesh || o.parent?.isLineSegments) return;
        const g = o.geometry;
        if (!g.boundingBox) g.computeBoundingBox();
        if (Math.max(Math.abs(g.boundingBox.min.z), Math.abs(g.boundingBox.max.z)) < 0.01) lines.push(o);
    });
    return lines;
}

/** A line object's segments through the projection, in the map camera's units. */
function projectLines(src) {
    const A = halfWidth(), b = bounds(), o = state.mapProjOpts, fwd = P[state.mapProjection].fwd;
    src.updateWorldMatrix(true, false);
    const dx = src.matrixWorld.elements[12], dy = src.matrixWorld.elements[13];
    const at = (x, y) => {
        const lat = (y + dy) / SX;
        if (lat < -HALF || lat > HALF) return null;
        const f = fwd(wrap((x + dx) / SX), lat, o);
        return f ? [(f[0] - b[0]) / (b[1] - b[0]) * 2 * A - A, (f[1] - b[2]) / (b[3] - b[2]) * 2 - 1] : null;
    };
    const pos = src.geometry.attributes.position, col = src.geometry.attributes.color, P2 = [], C2 = [];
    for (let i = 0; i + 1 < pos.count; i += 2) {
        const a = at(pos.getX(i), pos.getY(i)), c = at(pos.getX(i + 1), pos.getY(i + 1));
        if (!a || !c || Math.hypot(a[0] - c[0], a[1] - c[1]) > MAX_SEGMENT) continue;
        P2.push(a[0], a[1], 0.002, c[0], c[1], 0.002);
        if (col) C2.push(col.getX(i), col.getY(i), col.getZ(i), col.getX(i + 1), col.getY(i + 1), col.getZ(i + 1));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P2, 3));
    if (col) g.setAttribute('color', new THREE.Float32BufferAttribute(C2, 3));
    return g;
}

/** The projected copies brought up to date with the map's lines (made again when a line, the projection or its options change). */
function syncLineCopies(lines) {
    const proj = state.mapProjection + JSON.stringify(state.mapProjOpts);
    for (const src of lines) {
        const key = src.geometry.uuid + proj + src.matrixWorld.elements[12];
        let entry = lineCopies.get(src);
        if (entry && entry.key !== key) { entry.copy.geometry.dispose(); entry.copy.geometry = projectLines(src); entry.key = key; }
        if (!entry) {
            const copy = new THREE.LineSegments(projectLines(src), src.material);
            copy.frustumCulled = false;
            projScene.add(copy);
            lineCopies.set(src, entry = { key, copy });
        }
        entry.copy.material = src.material;
    }
    for (const [src, entry] of lineCopies) if (!lines.includes(src)) { projScene.remove(entry.copy); entry.copy.geometry.dispose(); lineCopies.delete(src); }
}

/** The picture's size: one and a half times the screen's, within the GPU's limit. */
function ensureTarget() {
    const buf = renderer.getDrawingBufferSize(new THREE.Vector2()), max = renderer.capabilities.maxTextureSize;
    const w = Math.min(max, Math.ceil(buf.x * 1.5)), h = Math.min(max, Math.ceil(buf.y * 1.5));
    if (target && target.width === w && target.height === h) return;
    target?.dispose();
    target = new THREE.WebGLRenderTarget(w, h, { depthBuffer: false, stencilBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    target.texture.colorSpace = THREE.SRGBColorSpace;
}

/**
 * The longitudes and latitudes the view shows: { lon0, lonSpan, lat0, latSpan } (radians; the longitudes relative to the
 * map's centre, lon0 in −π … π, lon0 + lonSpan past π when the view runs across the map's back meridian, as the far
 * disk of two hemispheres does), or null when the view shows none of the map.
 */
let lastKey = '', lastWindow = null;
function viewWindow() {
    const A = halfWidth(), b = bounds(), o = state.mapProjOpts, proj = P[state.mapProjection], z = mapCamera.zoom;
    const x0 = Math.max(mapCamera.position.x + mapCamera.left / z, -A), x1 = Math.min(mapCamera.position.x + mapCamera.right / z, A);
    const y0 = Math.max(mapCamera.position.y + mapCamera.bottom / z, -1), y1 = Math.min(mapCamera.position.y + mapCamera.top / z, 1);
    if (x0 >= x1 || y0 >= y1) return null;
    const key = [state.mapProjection, JSON.stringify(o), x0, x1, y0, y1].join();
    if (key === lastKey) return lastWindow;
    lastKey = key;
    return (lastWindow = sampleWindow(proj, o, b, A, x0, x1, y0, y1));
}

function sampleWindow(proj, o, b, A, x0, x1, y0, y1) {
    const toX = (wx) => b[0] + (wx + A) / (2 * A) * (b[1] - b[0]), toY = (wy) => b[2] + (wy + 1) / 2 * (b[3] - b[2]);
    const lons = [];
    let latLo = Infinity, latHi = -Infinity;
    for (let j = 0; j <= SAMPLES; j++) for (let i = 0; i <= SAMPLES; i++) {
        const ll = proj.inv(toX(x0 + (x1 - x0) * i / SAMPLES), toY(y0 + (y1 - y0) * j / SAMPLES), o);
        if (!ll) continue;
        lons.push(ll[0]);
        if (ll[1] < latLo) latLo = ll[1];
        if (ll[1] > latHi) latHi = ll[1];
    }
    if (!lons.length) return { lon0: -PI, lonSpan: TWO, lat0: -HALF, latSpan: PI };    // (a sliver between the samples: all of it)
    // the longitudes as an arc: it starts after the widest gap between them, so a view across the back meridian is one arc
    lons.sort((a, c) => a - c);
    let gap = lons[0] + TWO - lons[lons.length - 1], lon0 = lons[0], lon1 = lons[lons.length - 1];
    for (let k = 1; k < lons.length; k++) if (lons[k] - lons[k - 1] > gap) { gap = lons[k] - lons[k - 1]; lon0 = lons[k]; lon1 = lons[k - 1] + TWO; }
    // a margin of a sample and a half (what falls between the samples). Longitudes all round (no gap of a quarter
    // turn): every longitude — a pole in view, where they all meet — and the latitudes on to a pole the samples near it.
    const mLon = (lon1 - lon0) / SAMPLES * 1.5 + 0.005, mLat = (latHi - latLo) / SAMPLES * 1.5 + 0.005;
    lon0 -= mLon; lon1 += mLon; latLo = Math.max(-HALF, latLo - mLat); latHi = Math.min(HALF, latHi + mLat);
    if (gap < HALF || lon1 - lon0 >= TWO) {
        lon0 = -PI; lon1 = PI;
        if (latHi > HALF - 3 * mLat) latHi = HALF;
        if (latLo < -HALF + 3 * mLat) latLo = -HALF;
    }
    if (lon0 < -PI) { lon0 += TWO; lon1 += TWO; }
    return { lon0, lonSpan: lon1 - lon0, lat0: latLo, latSpan: latHi - latLo };
}

/** Draw the longitudes [l0, l1] (relative to the centre, within −π … π) of the flat map into the picture's columns [c0, c1). */
function drawFlat(l0, l1, lat0, latSpan, c0, c1) {
    flatCam.left = l0 * SX; flatCam.right = l1 * SX; flatCam.bottom = lat0 * SX; flatCam.top = (lat0 + latSpan) * SX;
    flatCam.updateProjectionMatrix();
    target.viewport.set(c0, 0, c1 - c0, target.height);
    target.scissor.set(c0, 0, c1 - c0, target.height);
    renderer.setRenderTarget(target);                              // (three takes the viewport as the target is set)
    renderer.render(scene, flatCam);
}

// A projected frame is drawn only when something it shows has changed — the flat map's visible objects (their geometry,
// colours, materials and places), the projection, the grid, the centre, the map camera, the picture's size — and the
// canvas keeps the last one meanwhile, as Evolution's globe does. (A frame is two passes, one at 2.25 × the screen's
// pixels: drawn every frame, a still map would spend a phone's battery.) A resize, the page hidden and shown again, or
// the GPU's context restored may empty the canvas: the next frame is drawn whatever.
let shownKey = null;
const invalidate = () => { shownKey = null; };
addEventListener('resize', invalidate);
document.addEventListener('visibilitychange', invalidate);
renderer.domElement.addEventListener('webglcontextrestored', invalidate);

function frameKey() {
    scene.updateMatrixWorld();
    const k = [target.width, target.height, state.mapProjection, JSON.stringify(state.mapProjOpts), state.gridEnabled, state.gridSpacing,
        state.mapCenterLon || 0, scene.background?.isColor ? scene.background.getHex() : '', mapCamera.position.x, mapCamera.position.y,
        mapCamera.zoom, mapCamera.left, mapCamera.right, mapCamera.top, mapCamera.bottom];
    scene.traverseVisible((o) => {
        if (!o.isMesh && !o.isLine && !o.isPoints) return;
        const e = o.matrixWorld.elements, g = o.geometry;
        k.push(o.id, g.id, g.index?.version ?? '', g.drawRange.start, g.drawRange.count, e[0], e[5], e[12], e[13]);
        for (const name in g.attributes) k.push(g.attributes[name].version);
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) k.push(m.id, m.version, m.opacity, m.visible);
    });
    return k.join();
}

/** The projected view's picture and line copies let go (their GPU memory back) once the view is the globe or the flat map. */
function release() {
    if (!target) return;
    target.dispose(); target = null;
    for (const entry of lineCopies.values()) { projScene.remove(entry.copy); entry.copy.geometry.dispose(); }
    lineCopies.clear();
    shownKey = null;
}

function renderProjected() {
    if (!plane) setUp();
    ensureTarget();
    const key = frameKey();
    if (key === shownKey) return;
    shownKey = key;
    const win = viewWindow(), u = plane.material.uniforms, lines = mapLines();
    syncLineCopies(lines);
    if (win) {
        // the flat map, without its lines (drawn over it, projected) or its grid (the shader draws it), into the
        // picture: in two parts when the view runs across the back meridian (the flat map holds one copy of the world)
        const grid = state.mapGridMesh, gridShown = grid?.visible;
        if (grid) grid.visible = false;
        for (const l of lines) l.visible = false;
        target.scissorTest = true;
        const lon1 = win.lon0 + win.lonSpan, split = Math.round(Math.min(1, (PI - win.lon0) / win.lonSpan) * target.width);
        if (split > 0) drawFlat(win.lon0, Math.min(lon1, PI), win.lat0, win.latSpan, 0, split);
        if (split < target.width) drawFlat(-PI, lon1 - TWO, win.lat0, win.latSpan, split, target.width);
        renderer.setRenderTarget(null);
        if (grid) grid.visible = gridShown;
        for (const l of lines) l.visible = true;
        u.uWin.value.set(win.lon0, win.lonSpan, win.lat0, win.latSpan);
    }
    plane.visible = !!win;
    u.map.value = target.texture;
    u.uGrid.value = state.gridEnabled ? state.gridSpacing * PI / 180 : 0;
    u.uCentre.value = state.mapCenterLon || 0;
    const pu = projectionUniforms(state.mapProjection, state.mapProjOpts);
    u.uProj.value = pu.uProj; u.uBounds.value.set(...pu.uBounds); u.uOpt.value.set(...pu.uOpt);
    plane.scale.set(2 * halfWidth(), 2, 1);
    projScene.background = scene.background;
    renderer.render(projScene, mapCamera);
}

/** Draw the view: the globe, the flat map, or the map in its projection (`force`: drawn even if it looks unchanged). */
export function renderView(force = false) {
    if (force) shownKey = null;
    if (projected()) renderProjected();
    else { release(); renderer.render(scene, state.mapMode ? mapCamera : camera); }
}
