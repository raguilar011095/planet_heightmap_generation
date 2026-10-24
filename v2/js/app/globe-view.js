// Three.js globe that displays the lab's equirectangular canvas as a texture.
// The texture is the single source of truth for both views, so globe and map always agree.
// `space: true` (the Evolution page) sets it in V1's space (js/scene.js): its stars, its atmosphere, its bluish ambient
// light and sun — the sun over the viewer's shoulder, where V1's stands for its opening view, so whatever is turned to
// face you is lit as V1's planet is — and the sun glinting off the sea (V1's water sphere: shininess 120, specular
// 0x4488bb at its opacity 0.55), the sea given by a mask (setSeaMask).
// The texture is a canvas's, or one painted on the GPU (view/gpu-paint.js: setSource takes either). Zoom is V1's
// (js/scene.js): the wheel or a pinch sets the distance aimed at and the camera eases there. The map view (setMap) is
// the same texture drawn flat by the same renderer, letterboxed in a frame element's box.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { P as PROJ } from '../view/projections.js';
import { PROJECTION_GLSL, projectionUniforms } from '../view/projection-glsl.js';

// a wheel's notch (100 px): 14 % nearer or farther — OrbitControls' own was 5 % and felt slow (developer, 2026-10-18:
// "zooming in is also very slow"); V1's is 8 %. The camera covers this share of the way left each 60th of a second.
const ZOOM_PER_PX = 0.0015, ZOOM_EASE = 0.15;

export class GlobeView {
    /** @param {HTMLCanvasElement} glCanvas  @param {HTMLCanvasElement} mapCanvas  @param {{space?: boolean}} [o] */
    constructor(glCanvas, mapCanvas, { space = false } = {}) {
        this.canvas = glCanvas;
        this.renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true });
        this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(space ? 0x030308 : 0x05060a);
        this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, space ? 200 : 50);
        this.camera.position.set(0, 0.9, 3.2);

        // (how a canvas's texture is sampled: sim cells crisp by default — setSmooth; repeating east–west, for the map's turn)
        this.look = { colorSpace: THREE.SRGBColorSpace, magFilter: THREE.NearestFilter, minFilter: THREE.LinearFilter, generateMipmaps: false, wrapS: THREE.RepeatWrapping };
        this.texture = Object.assign(new THREE.CanvasTexture(mapCanvas), this.look);
        this.ownTexture = true;                            // (a canvas's: made here; a GPU-painted one belongs to its painter)
        this.globe = new THREE.Mesh(
            new THREE.SphereGeometry(1, 128, 64),
            space ? new THREE.MeshPhongMaterial({ map: this.texture, specular: new THREE.Color(0x4488bb).multiplyScalar(0.55), shininess: 120 })
                : new THREE.MeshBasicMaterial({ map: this.texture }),
        );
        this.scene.add(this.globe);
        if (space) this.addSpace();

        this.controls = new OrbitControls(this.camera, glCanvas);
        this.controls.enablePan = false;
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.minDistance = 1.4;
        this.controls.maxDistance = 8;
        this.controls.rotateSpeed = 0.6;
        this.controls.enableZoom = false;                  // (V1's zoom instead, below)
        this.zoomTo = this.camera.position.length();
        this._zoomAt = 0;
        glCanvas.addEventListener('wheel', e => {
            if (!this.controls.enabled) return;
            e.preventDefault();
            // (a mouse's notch is ~100 px, or 3 lines, or a page; a trackpad sends many small steps)
            const px = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 800 : 1);
            this.zoomBy(Math.exp(Math.max(-200, Math.min(200, px)) * ZOOM_PER_PX));
        }, { passive: false });
        let pinch = 0;
        const apart = e => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        glCanvas.addEventListener('touchstart', e => { pinch = this.controls.enabled && e.touches.length === 2 ? apart(e) : 0; }, { passive: true });
        glCanvas.addEventListener('touchmove', e => {
            if (!pinch || e.touches.length !== 2) return;
            const d = apart(e);
            if (d > 0) { this.zoomBy(pinch / d); pinch = d; }
        }, { passive: true });
        glCanvas.addEventListener('touchend', () => { pinch = 0; }, { passive: true });
        this.map = null;                                   // the map view, while shown: { frame, centerLon }

        this._raycaster = new THREE.Raycaster();
        this._ndc = new THREE.Vector2();
    }

    resize() {
        const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
        if (!w || !h || (w === this._w && h === this._h)) return;
        this._w = w; this._h = h;
        this.renderer.setSize(w, h, false);
        this._dirty = true;
        this.camera.aspect = w / h;
        // Keep the whole globe in frame on portrait screens: hold the horizontal FOV at 40°.
        const half = Math.tan(20 * Math.PI / 180);
        this.camera.fov = 2 * Math.atan(half / Math.min(1, w / h)) * 180 / Math.PI;
        this.camera.updateProjectionMatrix();
    }

    /** Point the camera at a geographic position (degrees), keeping its current distance. */
    lookAt(latDeg, lonDeg) {
        const lat = latDeg * Math.PI / 180, lon = lonDeg * Math.PI / 180, d = this.camera.position.length();
        // SphereGeometry + equirectangular texture: lon 0 faces +x, lon 90°E faces −z, north is +y
        this.camera.position.set(d * Math.cos(lat) * Math.cos(lon), d * Math.sin(lat), -d * Math.cos(lat) * Math.sin(lon));
        this.controls.update();
    }

    /** A canvas texture's canvas was painted again (a GPU-painted texture needs no upload: only drawing again). */
    textureChanged() { if (this.ownTexture) this.texture.needsUpdate = true; this._dirty = true; }

    /** Nearer (k < 1) or farther (k > 1): where the camera eases to. */
    zoomBy(k) {
        this.zoomTo = Math.max(this.controls.minDistance, Math.min(this.controls.maxDistance, this.zoomTo * k));
        this._dirty = true;
    }

    /** The camera a step nearer the distance aimed at; whether it moved. */
    easeZoom() {
        const now = performance.now(), dt = this._zoomAt ? Math.min(0.1, (now - this._zoomAt) / 1000) : 1 / 60;
        this._zoomAt = now;
        const d = this.camera.position.length();
        if (Math.abs(this.zoomTo - d) < 1e-4) return false;
        this.camera.position.setLength(d + (this.zoomTo - d) * (1 - Math.pow(1 - ZOOM_EASE, dt * 60)));
        return true;
    }

    /** V1's stars, atmosphere and light (js/scene.js). */
    addSpace() {
        const p = [];
        for (let i = 0; i < 3000; i++) {
            const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1), r = 40 + Math.random() * 30;
            p.push(r * Math.sin(ph) * Math.cos(th), r * Math.sin(ph) * Math.sin(th), r * Math.cos(ph));
        }
        const stars = new THREE.BufferGeometry();
        stars.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
        this.scene.add(new THREE.Points(stars, new THREE.PointsMaterial({ color: 0xffffff, size: 0.08 })));
        const atmosphere = new THREE.ShaderMaterial({
            uniforms: { c: { value: new THREE.Color(0.35, 0.6, 1.0) } },
            vertexShader: 'varying vec3 vN,vP;void main(){vN=normalize(normalMatrix*normal);vP=(modelViewMatrix*vec4(position,1)).xyz;gl_Position=projectionMatrix*vec4(vP,1);}',
            fragmentShader: 'uniform vec3 c;varying vec3 vN,vP;void main(){float r=1.0-max(0.0,dot(normalize(-vP),vN));gl_FragColor=vec4(c,pow(r,3.5)*0.55);}',
            transparent: true, side: THREE.FrontSide, depthWrite: false,
        });
        this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.12, 64, 64), atmosphere));
        this.scene.add(new THREE.AmbientLight(0xaabbcc, 3.5));
        // the sun, carried with the camera: where V1's (5, 3, 4) stands seen from V1's opening view
        const sun = new THREE.DirectionalLight(0xfff8ee, 1.5);
        sun.position.set(0.707, 0.34, 0.62);
        this.camera.add(sun, sun.target);
        this.scene.add(this.camera);
        this.setSeaMask(null);
    }

    /**
     * Where the sea is (white sea, black land; a canvas the texture's shape, or a texture painted on the GPU) — the sun
     * glints there only; null: nowhere.
     */
    setSeaMask(src) {
        const m = this.globe.material;
        if (!('specularMap' in m)) return;
        if (src?.isTexture) this.seaMask = src;
        else if (src && this.seaMaskCanvas?.image !== src) {
            this.seaMaskCanvas?.dispose();
            this.seaMask = this.seaMaskCanvas = new THREE.CanvasTexture(src);
            this.seaMask.generateMipmaps = false;
            this.seaMask.minFilter = THREE.LinearFilter;
        } else if (src) this.seaMask = this.seaMaskCanvas;
        const map = src ? this.seaMask : null;
        if (m.specularMap !== map) { m.specularMap = map; m.needsUpdate = true; }
        m.specular.setScalar(0);
        if (src) m.specular.set(0x4488bb).multiplyScalar(0.55);
        this._dirty = true;
    }
    /** The sea mask's canvas was painted again. */
    seaMaskChanged() { if (this.seaMask && this.seaMask === this.seaMaskCanvas) this.seaMask.needsUpdate = true; this._dirty = true; }

    /** Show another canvas (of another size) as the globe's texture, with the same filtering — or a texture painted on the GPU. */
    setSource(src) {
        if (this.texture === src || (this.ownTexture && this.texture.image === src)) return;
        const old = this.texture, owned = this.ownTexture;
        this.ownTexture = !src.isTexture;
        this.texture = src.isTexture ? src : Object.assign(new THREE.CanvasTexture(src), this.look);
        this.globe.material.map = this.texture;
        this.globe.material.needsUpdate = true;
        if (owned) old.dispose();
        this._dirty = true;
    }

    /** Crisp texels (sim cells, the default) or smoothly filtered ones (shaded terrain) — a canvas's texture. */
    setSmooth(on) {
        const filter = on ? THREE.LinearFilter : THREE.NearestFilter;
        this.look.magFilter = filter;
        if (this.ownTexture && this.texture.magFilter !== filter) { this.texture.magFilter = filter; this.texture.needsUpdate = true; }
    }

    /**
     * The map view: the texture flat in `frame`'s box — in a projection (projections.js; equirectangular letterboxed
     * 2 : 1, the others in their own shape), turned so that `centerLon` (degrees) is in the middle — drawn on this canvas,
     * under the frame (which should be transparent: it takes the pointer, so the globe's controls rest); null: the globe
     * again. The projection is the fragment shader's: each pixel asks which longitude and latitude it shows
     * (projection-glsl.js) and samples the texture there.
     */
    setMap(frame, centerLon = 0, projection = 'equirect', projOpts = {}) {
        this.map = frame ? { frame, centerLon, projection, projOpts, bounds: PROJ[projection].bounds(projOpts) } : null;
        this.controls.enabled = !frame;
        if (frame && !this.mapScene) {
            this.mapScene = new THREE.Scene();
            this.mapScene.background = new THREE.Color(0x000000);
            const u = projectionUniforms();
            this.mapQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
                uniforms: { map: { value: null }, turn: { value: 0 }, uProj: { value: u.uProj }, uBounds: { value: new THREE.Vector4(...u.uBounds) }, uOpt: { value: new THREE.Vector4(...u.uOpt) } },
                vertexShader: 'varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
                fragmentShader: `uniform sampler2D map; uniform float turn; varying vec2 vUv;
${PROJECTION_GLSL}
void main() {
    vec2 xy = vec2(uBounds.x + vUv.x * (uBounds.y - uBounds.x), uBounds.z + vUv.y * (uBounds.w - uBounds.z));
    vec2 ll;
    if (!projInverse(xy, ll)) discard;
    gl_FragColor = texture2D(map, vec2(ll.x / (2.0 * PI) + 0.5 + turn, 0.5 + ll.y / PI));
    #include <colorspace_fragment>
}`,
                depthTest: false, depthWrite: false,
            }));
            this.mapQuad.frustumCulled = false;
            this.mapScene.add(this.mapQuad);
        }
        this._dirty = true;
    }

    /** The map's box in client pixels: the frame's, letterboxed to the projection's shape (2 : 1 equirectangular). */
    mapBox() {
        const f = this.map.frame.getBoundingClientRect(), b = this.map.bounds, aspect = (b[1] - b[0]) / (b[3] - b[2]), s = Math.min(f.width / aspect, f.height);
        return { left: f.left + (f.width - aspect * s) / 2, top: f.top + (f.height - s) / 2, width: aspect * s, height: s };
    }

    /** On the map view: the texture's place under a client-space point, [u (west → east), v (north → south)] — or null, off the map. */
    mapUvAt(clientX, clientY) {
        const bx = this.mapBox(), x = (clientX - bx.left) / bx.width, y = (clientY - bx.top) / bx.height;
        if (!(x >= 0 && x < 1 && y >= 0 && y < 1)) return null;
        const b = this.map.bounds, ll = PROJ[this.map.projection].inv(b[0] + x * (b[1] - b[0]), b[3] - y * (b[3] - b[2]), this.map.projOpts);
        if (!ll) return null;
        return [((ll[0] / (2 * Math.PI) + 0.5 + this.map.centerLon / 360) % 1 + 1) % 1, 0.5 - ll[1] / Math.PI];
    }

    renderMap() {
        const r = this.renderer, b = this.mapBox(), c = this.canvas.getBoundingClientRect(), u = this.mapQuad.material.uniforms;
        u.map.value = this.texture; u.turn.value = this.map.centerLon / 360;
        const pu = projectionUniforms(this.map.projection, this.map.projOpts);
        u.uProj.value = pu.uProj; u.uBounds.value.set(...pu.uBounds); u.uOpt.value.set(...pu.uOpt);
        r.setViewport(b.left - c.left, c.height - (b.top - c.top) - b.height, b.width, b.height);      // (from the bottom)
        r.render(this.mapScene, this.camera);                                                         // (its background clears the whole canvas)
        r.setViewport(0, 0, c.width, c.height);
    }

    render() {
        if (this.map) { this.renderMap(); return; }
        this.easeZoom();
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    /**
     * Draw only when something changed — the camera (moved, easing, or auto-rotating), the texture, the size. A globe
     * redrawn at 60 fps for nothing takes a core from the workers building the history (and a phone's battery).
     */
    renderIfNeeded() {
        if (this.map) {
            if (!this._dirty) return false;
            this.renderMap();
            this._dirty = false;
            return true;
        }
        const zoomed = this.easeZoom(), moved = this.controls.update();
        if (!zoomed && !moved && !this._dirty) return false;
        this.renderer.render(this.scene, this.camera);
        this._dirty = false;
        return true;
    }

    /** Texture UV under a client-space point, or null if the pointer is off the globe. */
    uvAt(clientX, clientY) {
        const r = this.canvas.getBoundingClientRect();
        this._ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
        this._raycaster.setFromCamera(this._ndc, this.camera);
        const hit = this._raycaster.intersectObject(this.globe)[0];
        return hit ? hit.uv : null;
    }
}
