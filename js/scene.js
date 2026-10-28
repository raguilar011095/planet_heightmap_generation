// Three.js scene setup: renderer, cameras, controls, lights, atmosphere, water, stars.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export const canvas   = document.getElementById('canvas');
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

export const scene  = new THREE.Scene();
scene.background = new THREE.Color(0x030308);

export const camera = new THREE.PerspectiveCamera(50, innerWidth/innerHeight, 0.1, 200);
camera.position.set(0, 0.4, 2.8);

/**
 * Fit the globe's camera to a w × h view: 50° vertically on landscape screens; on portrait ones the horizontal field is
 * held at 50° instead, so a phone shows the whole planet rather than a close-up wider than the screen (Evolution's globe,
 * v2/js/app/globe-view.js, does the same).
 */
export function fitCamera(w, h) {
    const aspect = w / h, half = Math.tan(25 * Math.PI / 180);
    camera.aspect = aspect;
    camera.fov = 2 * Math.atan(half / Math.min(1, aspect)) * 180 / Math.PI;
    camera.updateProjectionMatrix();
}
fitCamera(innerWidth, innerHeight);

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
export const sun = new THREE.DirectionalLight(0xfff8ee, 1.5);
sun.position.set(5, 3, 4);
scene.add(sun);

// Stars
export let starsMesh;
{ const g=new THREE.BufferGeometry(),p=[];
  for(let i=0;i<3000;i++){const th=Math.random()*Math.PI*2,ph=Math.acos(2*Math.random()-1),r=40+Math.random()*30;
    p.push(r*Math.sin(ph)*Math.cos(th),r*Math.sin(ph)*Math.sin(th),r*Math.cos(ph));}
  g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
  starsMesh = new THREE.Points(g,new THREE.PointsMaterial({color:0xffffff,size:0.08}));
  scene.add(starsMesh); }

// Atmosphere
const atmosMat = new THREE.ShaderMaterial({
    uniforms:{c:{value:new THREE.Color(0.35,0.6,1.0)}},
    vertexShader:`varying vec3 vN,vP;void main(){vN=normalize(normalMatrix*normal);vP=(modelViewMatrix*vec4(position,1)).xyz;gl_Position=projectionMatrix*vec4(vP,1);}`,
    fragmentShader:`uniform vec3 c;varying vec3 vN,vP;void main(){float r=1.0-max(0.0,dot(normalize(-vP),vN));gl_FragColor=vec4(c,pow(r,3.5)*0.55);}`,
    transparent:true,side:THREE.FrontSide,depthWrite:false
});
export const atmosMesh = new THREE.Mesh(new THREE.SphereGeometry(1.12,64,64), atmosMat);
scene.add(atmosMesh);

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

export function updateMapCameraFrustum() {
    const aspect = innerWidth / innerHeight;
    let halfW, halfH;
    if (aspect > mapAspect) {
        halfH = 1.15;
        halfW = halfH * aspect;
    } else {
        halfW = 1.15 * mapAspect;
        halfH = halfW / aspect;
    }
    mapCamera.left = -halfW; mapCamera.right = halfW;
    mapCamera.top = halfH; mapCamera.bottom = -halfH;
    mapCamera.updateProjectionMatrix();
}
updateMapCameraFrustum();

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
