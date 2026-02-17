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

export const ctrl = new OrbitControls(camera, canvas);
ctrl.enableDamping = true; ctrl.dampingFactor = 0.06;
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

// Water sphere
const waterMat = new THREE.MeshPhongMaterial({
    color:0x0c3a6e, transparent:true, opacity:0.55,
    shininess:120, specular:0x4488bb, depthWrite:false
});
export const waterMesh = new THREE.Mesh(new THREE.SphereGeometry(1.0,80,80), waterMat);
scene.add(waterMesh);

// Equirectangular map camera & controls
export const mapCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
mapCamera.position.set(0, 0, 5);
mapCamera.lookAt(0, 0, 0);

export function updateMapCameraFrustum() {
    const aspect = innerWidth / innerHeight;
    const mapAspect = 2;
    let halfW, halfH;
    if (aspect > mapAspect) {
        halfH = 1.15;
        halfW = halfH * aspect;
    } else {
        halfW = 2.3;
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
mapCtrl.dampingFactor = 0.06;
mapCtrl.screenSpacePanning = true;
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

export function tickMapZoom() {
    const cur = mapCamera.zoom;
    const next = THREE.MathUtils.lerp(cur, _mapZoomTarget, MAP_ZOOM_SMOOTH);
    if (Math.abs(next - cur) < 0.0001) return;
    mapCamera.zoom = next;
    mapCamera.updateProjectionMatrix();
}
