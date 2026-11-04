// Three.js scene setup: renderer, cameras, controls, lights, atmosphere, water, stars.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { stageColour, inSpace, onStage, makeAir } from './stage.js';
import { openLeft, openShift, onOpenArea, planetWidthFrom, planetChanged } from './open-area.js';

export const canvas   = document.getElementById('canvas');
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

export const scene  = new THREE.Scene();
// The stage behind the globe: the page theme's desk (paper by day, navy at night), or space with stars when the view
// strip's Stars is on (js/stage.js; docs/style-guide/maps.md)
scene.background = new THREE.Color(stageColour());

export const camera = new THREE.PerspectiveCamera(50, innerWidth/innerHeight, 0.1, 200);
camera.position.set(0, 0.4, 2.8);

const HOME = camera.position.length();                // (the globe's home zoom: its size there sets where it sits)
const half25 = Math.tan(25 * Math.PI / 180);

/**
 * Fit the globe's camera to a w × h view: 50° vertically on landscape screens; on portrait ones the horizontal field is
 * held at 50° instead, so a phone shows the whole planet rather than a close-up wider than the screen (Evolution's globe,
 * v2/js/app/globe-view.js, does the same). Beside the panel the fit is to the open area, `left` pixels in, and the
 * picture moves `shift` pixels right of the view's centre (js/open-area.js).
 */
export function fitCamera(w, h, left = 0, shift = 0) {
    camera.aspect = w / h;
    camera.fov = 2 * Math.atan(half25 / Math.min(1, (w - left) / h)) * 180 / Math.PI;
    if (shift) camera.setViewOffset(w, h, -shift, 0, w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
}

/** The globe and the map fitted to the window and placed by the open area (after a resize, or the panel folding). */
export function fitView() {
    fitCamera(innerWidth, innerHeight, openLeft(), openShift());
    updateMapCameraFrustum();
}

// (the planet's width for the open area: the map whole with its frame's numerals, or the globe at home zoom with its
// ring and numerals)
let mapShown = false;
function planetWidth() {
    if (mapShown) return 2 * mapAspect / mapUnit() + 2 * MAP_MARGIN_PX();
    const fov = 2 * Math.atan(half25 / Math.min(1, (innerWidth - openLeft()) / innerHeight));
    return 1.3 * Math.tan(Math.asin(1 / HOME)) / Math.tan(fov / 2) * innerHeight;
}
/** The view shows the map (true) or the globe: the planet's place follows its width. */
export function showingMap(on) { mapShown = !!on; planetChanged(); }

export const ctrl = new OrbitControls(camera, canvas);
ctrl.enableDamping = true; ctrl.dampingFactor = 0.06;
ctrl.enablePan = false;
ctrl.minDistance = 1.4; ctrl.maxDistance = 8;
ctrl.enableZoom = false; // disable built-in zoom; custom handler below

// Smooth zoom: wheel sets a target distance, each frame lerps toward it
let _zoomTarget = camera.position.distanceTo(ctrl.target);
const ZOOM_STEP   = 0.92;   // multiplier per tick (lower = faster zoom)
const ZOOM_SMOOTH = 0.12;   // lerp speed per frame (higher = snappier)

canvas.addEventListener('wheel', (e) => {
    if (!ctrl.enabled) return;
    e.preventDefault();
    const dir = Math.sign(e.deltaY);
    _zoomTarget *= dir > 0 ? 1 / ZOOM_STEP : ZOOM_STEP;
    _zoomTarget = THREE.MathUtils.clamp(_zoomTarget, ctrl.minDistance, ctrl.maxDistance);
}, { passive: false });

// Pinch-to-zoom for globe (touch)
let _pinchDist = 0;
canvas.addEventListener('touchstart', (e) => {
    if (!ctrl.enabled || e.touches.length !== 2) { _pinchDist = 0; return; }
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    _pinchDist = Math.sqrt(dx * dx + dy * dy);
}, { passive: true });

canvas.addEventListener('touchmove', (e) => {
    if (!ctrl.enabled || e.touches.length !== 2 || _pinchDist === 0) return;
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const ratio = _pinchDist / dist;
    _zoomTarget *= ratio;
    _zoomTarget = THREE.MathUtils.clamp(_zoomTarget, ctrl.minDistance, ctrl.maxDistance);
    _pinchDist = dist;
}, { passive: true });

canvas.addEventListener('touchend', () => { _pinchDist = 0; }, { passive: true });

export function tickZoom() {
    const v = new THREE.Vector3().subVectors(camera.position, ctrl.target);
    const cur = v.length();
    const next = THREE.MathUtils.lerp(cur, _zoomTarget, ZOOM_SMOOTH);
    if (Math.abs(next - cur) < 0.0001) return;
    v.setLength(next);
    camera.position.copy(ctrl.target).add(v);
}

scene.add(new THREE.AmbientLight(0xaabbcc, 3.5));
// Atlas light: the sun carried with the camera, soft, from the upper left (the side the relief is shaded from), never
// dark — the ambient holds the far side up (docs/style-guide/maps.md; Evolution's globe has the same)
export const sun = new THREE.DirectionalLight(0xfff8ee, 1.5);
sun.position.set(-0.6, 0.5, 0.62);
camera.add(sun, sun.target);
scene.add(camera);

// Stars
export let starsMesh;
{ const g=new THREE.BufferGeometry(),p=[];
  for(let i=0;i<3000;i++){const th=Math.random()*Math.PI*2,ph=Math.acos(2*Math.random()-1),r=40+Math.random()*30;
    p.push(r*Math.sin(ph)*Math.cos(th),r*Math.sin(ph)*Math.sin(th),r*Math.cos(ph));}
  g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
  starsMesh = new THREE.Points(g,new THREE.PointsMaterial({color:0xffffff,size:0.08}));
  starsMesh.material.visible = inSpace();   // (space with stars is an option, never the default)
  scene.add(starsMesh); }

// Air: a thin rim of map-air at the globe's edge, no heavy glow
const air = makeAir(THREE, 1.03);
export const atmosMesh = air.mesh;
scene.add(atmosMesh);
onStage(() => { scene.background = new THREE.Color(stageColour()); starsMesh.material.visible = inSpace(); air.update(); });

// Water sphere — the sun's glint on it broad and soft, a sheen the sea still shows through (a tight, bright one hid it)
const waterMat = new THREE.MeshPhongMaterial({
    color:0x0c3a6e, transparent:true, opacity:0.55,
    shininess:50, specular:new THREE.Color(0x4488bb).multiplyScalar(0.5), depthWrite:false
});
export const waterMesh = new THREE.Mesh(new THREE.SphereGeometry(1.0,80,80), waterMat);
scene.add(waterMesh);

// Map camera & controls: the map is 2 high and mapAspect × 2 wide (2 : 1 equirectangular; another projection its own
// shape, js/map-projection.js)
export const mapCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
mapCamera.position.set(0, 0, 5);
mapCamera.lookAt(0, 0, 0);
let mapAspect = 2;

// (room round the map for its frame's ticks and numerals, js/graticule-frame.js; less on a phone)
const narrowView = matchMedia('(max-width: 768px)');
export const MAP_MARGIN_PX = () => (narrowView.matches ? 22 : 56);
/** The masthead's height (--nav-h), the map kept below it. */
export function navHeight() { return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 56; }
/** The band the map is fitted in at zoom 1: below the masthead and the layer tabs, above the hint, beside the panel,
 *  with room all round for its frame's numerals. */
function mapBand() {
    const m = MAP_MARGIN_PX();
    let top = navHeight() + 22, bottom = 22;
    if (!narrowView.matches) {
        const row = document.querySelector('#layerBar .layer-row')?.getBoundingClientRect(), info = document.getElementById('info')?.getBoundingClientRect();
        if (row?.height) top = Math.max(top, row.bottom + 30);
        if (info?.height) bottom = Math.max(bottom, innerHeight - info.top + 24);
    }
    return { w: Math.max(1, innerWidth - openLeft() - 2 * m), h: Math.max(1, innerHeight - top - bottom), drop: (top - bottom) / 2, top, bottom, m };
}
/** The rectangle the map's frame keeps within (client px), zoomed in: the band, a little wider, its numerals outside
 *  (measured when the map was last fitted, not each frame). */
let lastBand = null;
export function mapFrameRect() {
    const { top, bottom, m } = lastBand ?? mapBand(), side = Math.max(16, m - 4);
    return { l: openLeft() + side, t: top - 8, r: innerWidth - side, b: innerHeight - bottom + 8 };
}
/** Map units a pixel at zoom 1: the map fitted to that band (js/open-area.js for the panel). */
function mapUnit(band = mapBand()) {
    const { w, h } = band;
    return Math.max(2 * mapAspect / w, 2 / h);
}

// (the frustum spans the whole window; the picture moves right by the open area's shift and down by half the masthead —
// so a drag still pans one to one, and the zoom centres where the map sits)
export function updateMapCameraFrustum() {
    const band = lastBand = mapBand(), unit = mapUnit(band), halfW = unit * innerWidth / 2, halfH = unit * innerHeight / 2, shift = openShift(), drop = band.drop;
    mapCamera.left = -halfW; mapCamera.right = halfW;
    mapCamera.top = halfH; mapCamera.bottom = -halfH;
    if (shift || drop) mapCamera.setViewOffset(innerWidth, innerHeight, -shift, -drop, innerWidth, innerHeight);
    else mapCamera.clearViewOffset();
    mapCamera.updateProjectionMatrix();
}

/** What the map camera shows, in map units: [x0, x1, y0, y1] (the whole window, zoomed, panned and moved off centre). */
export function mapVisible() {
    const c = mapCamera, z = c.zoom, v = c.view;
    let l = c.left / z, r = c.right / z, t = c.top / z, b = c.bottom / z;
    if (v?.enabled) {
        const sw = (r - l) / v.fullWidth, sh = (t - b) / v.fullHeight;
        l += sw * v.offsetX; r = l + sw * v.width; t -= sh * v.offsetY; b = t - sh * v.height;
    }
    return [c.position.x + l, c.position.x + r, c.position.y + b, c.position.y + t];
}
/** The map's width ÷ height (its projection's shape). */
export function mapAspectNow() { return mapAspect; }
planetWidthFrom(planetWidth);
onOpenArea(() => fitView());
fitView();

export const mapCtrl = new OrbitControls(mapCamera, canvas);
mapCtrl.enableRotate = false;
mapCtrl.enableDamping = true;
mapCtrl.dampingFactor = 0.09;
mapCtrl.panSpeed = 1.4;
mapCtrl.screenSpacePanning = true;
mapCtrl.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
mapCtrl.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
mapCtrl.minZoom = 0.5;
mapCtrl.maxZoom = 20;
mapCtrl.enableZoom = false; // custom handler below
mapCtrl.enabled = false;

// Smooth zoom for map view (orthographic)
let _mapZoomTarget = mapCamera.zoom;
const MAP_ZOOM_STEP   = 0.92;
const MAP_ZOOM_SMOOTH = 0.12;

canvas.addEventListener('wheel', (e) => {
    if (!mapCtrl.enabled) return;
    e.preventDefault();
    const dir = Math.sign(e.deltaY);
    _mapZoomTarget *= dir < 0 ? 1 / MAP_ZOOM_STEP : MAP_ZOOM_STEP;
    _mapZoomTarget = THREE.MathUtils.clamp(_mapZoomTarget, mapCtrl.minZoom, mapCtrl.maxZoom);
}, { passive: false });

// Pinch-to-zoom for map (touch)
let _mapPinchDist = 0;
canvas.addEventListener('touchstart', (e) => {
    if (!mapCtrl.enabled || e.touches.length !== 2) { _mapPinchDist = 0; return; }
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    _mapPinchDist = Math.sqrt(dx * dx + dy * dy);
}, { passive: true });

canvas.addEventListener('touchmove', (e) => {
    if (!mapCtrl.enabled || e.touches.length !== 2 || _mapPinchDist === 0) return;
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const ratio = dist / _mapPinchDist;
    _mapZoomTarget *= ratio;
    _mapZoomTarget = THREE.MathUtils.clamp(_mapZoomTarget, mapCtrl.minZoom, mapCtrl.maxZoom);
    _mapPinchDist = dist;
}, { passive: true });

canvas.addEventListener('touchend', () => { _mapPinchDist = 0; }, { passive: true });

/** The map's width ÷ height (its projection's shape). */
export function setMapAspect(a) {
    mapAspect = a;
    updateMapCameraFrustum();
    if (mapShown) planetChanged();
}

/** The whole map in view again: unzoomed, centred. */
export function resetMapView() {
    mapCamera.position.set(0, 0, 5);
    mapCtrl.target.set(0, 0, 0);
    mapCamera.zoom = _mapZoomTarget = 1;
    mapCamera.updateProjectionMatrix();
    mapCtrl.update();
}

export function tickMapZoom() {
    const cur = mapCamera.zoom;
    const next = THREE.MathUtils.lerp(cur, _mapZoomTarget, MAP_ZOOM_SMOOTH);
    if (Math.abs(next - cur) < 0.0001) return;
    mapCamera.zoom = next;
    mapCamera.updateProjectionMatrix();
}
