// Three.js globe that displays the lab's equirectangular canvas as a texture.
// The texture is the single source of truth for both views, so globe and map always agree.
// `space: true` (the Evolution page) sets it in V1's space (js/scene.js): its stars, its atmosphere, its bluish ambient
// light and sun — the sun over the viewer's shoulder, where V1's stands for its opening view, so whatever is turned to
// face you is lit as V1's planet is — and the sun glinting off the sea (V1's water sphere: shininess 50, specular
// 0x4488bb at half, at its opacity 0.55 — a soft sheen), the sea given by a mask (setSeaMask).
// The texture is a canvas's, or one painted on the GPU (view/gpu-paint.js: setSource takes either). Zoom is V1's
// (js/scene.js): the wheel or a pinch sets the distance aimed at and the camera eases there. The map view (setMap) is
// the same texture drawn flat by the same renderer, letterboxed in a frame element's box — zoomed and panned on the
// frame as Generate's map is: the wheel zooms toward the pointer, easing as the globe's zoom does, a drag pans, two
// fingers pinch; the equirectangular map runs on east and west without end.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { P as PROJ } from '../view/projections.js';
import { PROJECTION_GLSL, projectionUniforms } from '../view/projection-glsl.js';

const GLINT = new THREE.Color(0x4488bb).multiplyScalar(0.5 * 0.55);    // (the sea's specular: V1's water sphere's)

// a wheel's notch (100 px): 14 % nearer or farther — OrbitControls' own was 5 % and felt slow (developer, 2026-10-18:
// "zooming in is also very slow"); V1's is 8 %. The camera covers this share of the way left each 60th of a second.
const ZOOM_PER_PX = 0.0015, ZOOM_EASE = 0.15;
const MAP_ZOOM_MIN = 0.5, MAP_ZOOM_MAX = 20;                      // (the map's zoom: 1, the whole map; out to half that, in to 20, as Generate's)
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
// the patch over the texture (putPatchTile, showPatchLayer): two layers of tiles of a sharper picture — layer 0 over
// layer 1 — each a texture of slots (uPatchSlot px square: a tile and a pixel of its neighbours' all round, so the blend
// across a tile's edge reads its neighbour's own pixels) holding the tiles whose column and row are the slot's modulo the
// layer's columns and rows, and a table of the tile each slot holds. A layer shows over its range of a level's tiles
// (uPatchRange: first column — any whole number, the columns running on past the date line — first row, columns, rows;
// uPatchGrid: the level's tiles around the planet, the layer's columns and rows of slots, on) only where its slot holds
// the tile there, faded in over the range's outer 4 % so the range's edge does not show
const PATCH_GLSL = `uniform sampler2D uPatchAtl0, uPatchTab0, uPatchAtl1, uPatchTab1;
uniform vec4 uPatchRange0, uPatchGrid0, uPatchRange1, uPatchGrid1; uniform float uPatchSlot;
vec4 patchLayer(sampler2D atl, sampler2D tab, vec4 R, vec4 G, vec2 tc) {
    if (G.w < 0.5) return vec4(0.0);
    float X = fract(tc.x) * G.x, Y = (1.0 - tc.y) * G.x * 0.5;            // (the place in tiles: west → east, north → south)
    float dx = mod(X - R.x, G.x), dy = Y - R.y;
    if (dx >= R.z || dy < 0.0 || dy >= R.w) return vec4(0.0);
    float tx = R.x + floor(dx), ty = floor(Y);
    vec2 slot = vec2(mod(tx, G.y), mod(ty, G.z));
    vec4 k = floor(texture2D(tab, (slot + 0.5) / G.yz) * 255.0 + 0.5);    // (the tile the slot holds: its column modulo 65536, its row; a ≥ 128: one)
    if (k.a < 128.0 || k.r + 256.0 * k.g != mod(tx, 65536.0) || k.b + 256.0 * (k.a - 128.0) != ty) return vec4(0.0);
    vec2 px = (slot * uPatchSlot + 1.0 + vec2(fract(dx), fract(Y)) * (uPatchSlot - 2.0)) / (G.yz * uPatchSlot);
    float e = min(min(dx, R.z - dx) / R.z, min(dy, R.w - dy) / R.w);
    return vec4(texture2D(atl, px).rgb, smoothstep(0.0, 0.04, e));
}
vec4 withPatch(vec4 base, vec2 tc) {
    vec4 a = patchLayer(uPatchAtl0, uPatchTab0, uPatchRange0, uPatchGrid0, tc);
    if (a.a >= 1.0) return vec4(a.rgb, base.a);
    vec4 b = patchLayer(uPatchAtl1, uPatchTab1, uPatchRange1, uPatchGrid1, tc);
    return vec4(mix(mix(base.rgb, b.rgb, b.a), a.rgb, a.a), base.a);
}`;

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
            space ? new THREE.MeshPhongMaterial({ map: this.texture, specular: GLINT.clone(), shininess: 50 })
                : new THREE.MeshBasicMaterial({ map: this.texture }),
        );
        this.scene.add(this.globe);
        // (a patch: tiles of the planet painted sharper, laid over the texture where they are — putPatchTile)
        this.patch = { uPatchSlot: { value: 1 } };
        for (const k of [0, 1]) Object.assign(this.patch, { [`uPatchAtl${k}`]: { value: null }, [`uPatchTab${k}`]: { value: null }, [`uPatchRange${k}`]: { value: new THREE.Vector4() }, [`uPatchGrid${k}`]: { value: new THREE.Vector4() } });
        this.patchLayers = [0, 1].map(() => ({ atl: null, tab: null, cols: 0, rows: 0, range: null }));
        this.globe.material.onBeforeCompile = shader => {
            Object.assign(shader.uniforms, this.patch);
            shader.fragmentShader = shader.fragmentShader
                .replace('#include <common>', `#include <common>\n${PATCH_GLSL}`)
                .replace('#include <map_fragment>', `#ifdef USE_MAP
    vec4 sampledDiffuseColor = withPatch(texture2D(map, vMapUv), vMapUv);
    diffuseColor *= sampledDiffuseColor;
#endif`);
        };
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
        this._sphere = new THREE.Sphere(new THREE.Vector3(), 1); this._hit = new THREE.Vector3();
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
        if (src) m.specular.copy(GLINT);
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

    // ── the patch: a detailed moment's detail finer than the mesh, where the view is zoomed in — tiles of it laid over the
    // texture (PATCH_GLSL), each sent to the GPU once: a pan sends only the tiles it brings ──
    /**
     * Patch layer k (0 shown over 1) made to hold `cols` × `rows` tiles in slots `slot` px square (a tile and a pixel of
     * its neighbours' all round) — made again, every slot empty, if it is not that size. Returns whether it was.
     */
    sizePatchLayer(k, cols, rows, slot) {
        const P = this.patchLayers[k];
        if (P.cols === cols && P.rows === rows && this.patch.uPatchSlot.value === slot) return false;
        P.atl?.dispose(); P.tab?.dispose();
        const w = cols * slot, h = rows * slot;
        P.atl = Object.assign(new THREE.DataTexture(new Uint8Array(w * h * 4), w, h), { colorSpace: THREE.SRGBColorSpace, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter, needsUpdate: true });
        this.renderer.initTexture(P.atl);
        P.atl.image.data = null;                           // (its pixels on the GPU only: tiles are sent there as they come)
        P.tab = Object.assign(new THREE.DataTexture(new Uint8Array(cols * rows * 4), cols, rows), { needsUpdate: true });
        P.cols = cols; P.rows = rows; this.patch.uPatchSlot.value = slot;
        this.patchUniforms();
        return true;
    }

    /** A tile's picture (a canvas the slot's size) into patch layer k's slot (sx, sy), as the tile in column tx, row ty. */
    putPatchTile(k, sx, sy, tx, ty, image) {
        const P = this.patchLayers[k], d = P.tab.image.data, o = 4 * (sy * P.cols + sx), c = ((tx % 65536) + 65536) % 65536, S = this.patch.uPatchSlot.value;
        // (straight to the texture, on whichever unit is active, that unit's texture bound again after: three.js's
        // copyTextureToTexture trusts its record of what is bound, and that record can be stale here — the tile then went
        // to another texture)
        const gl = this.renderer.getContext(), was = gl.getParameter(gl.TEXTURE_BINDING_2D);
        gl.bindTexture(gl.TEXTURE_2D, this.renderer.properties.get(P.atl).__webglTexture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, sx * S, sy * S, gl.RGBA, gl.UNSIGNED_BYTE, image);
        gl.bindTexture(gl.TEXTURE_2D, was);
        d[o] = c & 255; d[o + 1] = c >> 8; d[o + 2] = ty & 255; d[o + 3] = 128 | (ty >> 8);
        P.tab.needsUpdate = true;
        if (P.range) this._dirty = true;
    }

    /** Every slot of patch layer k emptied. */
    emptyPatchLayer(k) {
        const P = this.patchLayers[k];
        if (!P.tab) return;
        P.tab.image.data.fill(0); P.tab.needsUpdate = true;
        if (P.range) this._dirty = true;
    }

    /**
     * Patch layer k shown over a range of its level's tiles: { n (the level's tiles around the planet), tx0 (its first
     * column: any whole number — the columns run on past the date line), ty0 (its first row), nx, ny (its columns and
     * rows) } — or hidden (null).
     */
    showPatchLayer(k, range) {
        const P = this.patchLayers[k], r = P.range;
        if (r === range || (r && range && r.n === range.n && r.tx0 === range.tx0 && r.ty0 === range.ty0 && r.nx === range.nx && r.ny === range.ny)) return;
        P.range = range && { ...range };
        this.patchUniforms();
    }

    /** The two patch layers swapped: the one shown over the other goes under it. */
    swapPatchLayers() {
        this.patchLayers.reverse();
        this.patchUniforms();
    }

    /** The shader's uniforms from the layers in their places. */
    patchUniforms() {
        this.patchLayers.forEach((P, k) => {
            const r = P.range, U = this.patch;
            U[`uPatchAtl${k}`].value = P.atl; U[`uPatchTab${k}`].value = P.tab;
            if (r) U[`uPatchRange${k}`].value.set(r.tx0, r.ty0, r.nx, r.ny);
            U[`uPatchGrid${k}`].value.set(r ? r.n : 1, P.cols || 1, P.rows || 1, r && P.atl ? 1 : 0);
        });
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
        const bounds = PROJ[projection].bounds(projOpts), shape = projection + ':' + ((bounds[1] - bounds[0]) / (bounds[3] - bounds[2])).toFixed(4);
        // (the whole map again on coming to it, and when its shape changes; kept as its centre or options move)
        if (frame && (!this.map || this.map.shape !== shape)) this.mapView = { zoom: 1, zoomTo: 1, panX: 0, panY: 0, anchor: null, at: 0 };
        this.map = frame ? { frame, centerLon, projection, projOpts, bounds, shape } : null;
        this.controls.enabled = !frame;
        if (frame && this._mapFrame !== frame) this.wireMapFrame(frame);
        if (frame && !this.mapScene) {
            this.mapScene = new THREE.Scene();
            this.mapScene.background = new THREE.Color(0x000000);
            const u = projectionUniforms();
            this.mapQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
                uniforms: { map: { value: null }, turn: { value: 0 }, uView: { value: new THREE.Vector4(1, 1, 0, 0) }, uWrap: { value: new THREE.Vector2() },
                    uProj: { value: u.uProj }, uBounds: { value: new THREE.Vector4(...u.uBounds) }, uOpt: { value: new THREE.Vector4(...u.uOpt) }, ...this.patch },
                vertexShader: 'varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
                fragmentShader: `uniform sampler2D map; uniform float turn; uniform vec4 uView; uniform vec2 uWrap; varying vec2 vUv;
${PATCH_GLSL}
${PROJECTION_GLSL}
void main() {
    vec2 m = vUv * uView.xy + uView.zw;                            // (the frame's pixel → its place in the map's box, zoomed and panned)
    if (uWrap.x > 0.5) {                                           // (one turn of the planet about the frame's middle: zoomed out, no place twice)
        if (m.x < uWrap.y || m.x > uWrap.y + 1.0) discard;
        m.x = fract(m.x);
    }
    if (m.x < 0.0 || m.x > 1.0 || m.y < 0.0 || m.y > 1.0) discard;
    vec2 xy = vec2(uBounds.x + m.x * (uBounds.y - uBounds.x), uBounds.z + m.y * (uBounds.w - uBounds.z));
    vec2 ll;
    if (!projInverse(xy, ll)) discard;
    vec2 tc = vec2(ll.x / (2.0 * PI) + 0.5 + turn, 0.5 + ll.y / PI);
    gl_FragColor = withPatch(texture2D(map, tc), tc);
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

    /** The place in the map's box (fractions: x west → east, y north → south) under a client-space point, zoomed and panned. */
    mapFrac(clientX, clientY) {
        const b = this.mapBox(), v = this.mapView;
        return [0.5 + (clientX - b.left - b.width / 2) / (b.width * v.zoom) + v.panX, 0.5 + (clientY - b.top - b.height / 2) / (b.height * v.zoom) + v.panY];
    }

    /** Pan so that the box's place `m` lies under the client point (cx, cy). */
    panTo(m, cx, cy) {
        const b = this.mapBox(), v = this.mapView;
        v.panX = m[0] - 0.5 - (cx - b.left - b.width / 2) / (b.width * v.zoom);
        v.panY = m[1] - 0.5 - (cy - b.top - b.height / 2) / (b.height * v.zoom);
        this.clampPan();
    }

    /** At least half the map kept in view; the equirectangular map wraps east–west instead. */
    clampPan() {
        const v = this.mapView;
        v.panX = this.map.projection === 'equirect' ? v.panX - Math.round(v.panX) : clamp(v.panX, -0.5, 0.5);
        v.panY = clamp(v.panY, -0.5, 0.5);
        this._dirty = true;
    }

    /** The map frame's wheel, drag and pinch (wired once per frame element). */
    wireMapFrame(frame) {
        this._mapFrame = frame;
        frame.style.touchAction = 'none';
        frame.addEventListener('wheel', e => {
            if (!this.map) return;
            e.preventDefault();
            const px = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 800 : 1), v = this.mapView;
            v.zoomTo = clamp(v.zoomTo * Math.exp(-clamp(px, -200, 200) * ZOOM_PER_PX), MAP_ZOOM_MIN, MAP_ZOOM_MAX);
            v.anchor = { cx: e.clientX, cy: e.clientY, m: this.mapFrac(e.clientX, e.clientY) };   // (the place under the pointer stays there)
            this._dirty = true;
        }, { passive: false });
        const down = new Map();                                    // pointer → its last client point
        let pinch = 0, mid = null;
        frame.addEventListener('pointerdown', e => {
            if (!this.map || (e.pointerType === 'mouse' && e.button !== 0)) return;
            down.set(e.pointerId, [e.clientX, e.clientY]);
            frame.setPointerCapture?.(e.pointerId);
            pinch = 0;
        });
        frame.addEventListener('pointermove', e => {
            const last = down.get(e.pointerId);
            if (!last || !this.map) return;
            const v = this.mapView, b = this.mapBox();
            v.anchor = null; v.zoomTo = v.zoom;                    // (a drag or a pinch stops an easing zoom)
            if (down.size === 1) {
                v.panX -= (e.clientX - last[0]) / (b.width * v.zoom);
                v.panY -= (e.clientY - last[1]) / (b.height * v.zoom);
                this.clampPan();
            }
            down.set(e.pointerId, [e.clientX, e.clientY]);
            if (down.size === 2) {
                const [a, c] = [...down.values()], d = Math.hypot(a[0] - c[0], a[1] - c[1]), m2 = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
                if (pinch) {
                    const m = this.mapFrac(mid[0], mid[1]);       // (the place under the fingers stays under them)
                    v.zoom = v.zoomTo = clamp(v.zoom * d / pinch, MAP_ZOOM_MIN, MAP_ZOOM_MAX);
                    this.panTo(m, m2[0], m2[1]);
                }
                pinch = d; mid = m2;
            }
        });
        const up = e => { down.delete(e.pointerId); pinch = 0; };
        frame.addEventListener('pointerup', up);
        frame.addEventListener('pointercancel', up);
    }

    /** The map's zoom a step nearer the zoom aimed at, about the place under the pointer; whether it moved. */
    easeMapZoom() {
        const v = this.mapView, now = performance.now(), dt = v.at ? Math.min(0.1, (now - v.at) / 1000) : 1 / 60;
        v.at = now;
        if (v.zoom === v.zoomTo) return false;
        v.zoom = Math.abs(v.zoomTo - v.zoom) < 1e-3 * v.zoom ? v.zoomTo : v.zoom + (v.zoomTo - v.zoom) * (1 - Math.pow(1 - ZOOM_EASE, dt * 60));
        if (v.anchor) this.panTo(v.anchor.m, v.anchor.cx, v.anchor.cy);
        this._dirty = true;
        return true;
    }

    /** On the map view: the texture's place under a client-space point, [u (west → east), v (north → south)] — or null, off the map. */
    mapUvAt(clientX, clientY) {
        let [x, y] = this.mapFrac(clientX, clientY);
        if (this.map.projection === 'equirect') {
            const p = this.mapView.panX;
            if (x < p || x > p + 1) return null;
            x -= Math.floor(x);
        }
        if (!(x >= 0 && x < 1 && y >= 0 && y < 1)) return null;
        const b = this.map.bounds, ll = PROJ[this.map.projection].inv(b[0] + x * (b[1] - b[0]), b[3] - y * (b[3] - b[2]), this.map.projOpts);
        if (!ll) return null;
        return [((ll[0] / (2 * Math.PI) + 0.5 + this.map.centerLon / 360) % 1 + 1) % 1, 0.5 - ll[1] / Math.PI];
    }

    renderMap() {
        const r = this.renderer, b = this.mapBox(), f = this.map.frame.getBoundingClientRect(), c = this.canvas.getBoundingClientRect(), u = this.mapQuad.material.uniforms, v = this.mapView;
        u.map.value = this.texture; u.turn.value = this.map.centerLon / 360;
        const pu = projectionUniforms(this.map.projection, this.map.projOpts);
        u.uProj.value = pu.uProj; u.uBounds.value.set(...pu.uBounds); u.uOpt.value.set(...pu.uOpt);
        // (the whole frame drawn: its pixels → the box's places, at the zoom and pan; y from the bottom)
        const zw = b.width * v.zoom, zh = b.height * v.zoom;
        u.uView.value.set(f.width / zw, f.height / zh, 0.5 + (f.left - b.left - b.width / 2) / zw + v.panX, 0.5 - (f.top + f.height - b.top - b.height / 2) / zh - v.panY);
        u.uWrap.value.set(this.map.projection === 'equirect' ? 1 : 0, v.panX);
        r.setViewport(f.left - c.left, c.height - (f.top - c.top) - f.height, f.width, f.height);      // (from the bottom)
        r.render(this.mapScene, this.camera);                                                         // (its background clears the whole canvas)
        r.setViewport(0, 0, c.width, c.height);
    }

    render() {
        if (this.map) { this.easeMapZoom(); this.renderMap(); return; }
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
            this.easeMapZoom();
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

    /** Texture UV under a client-space point, or null if the pointer is off the globe. `r`: the canvas's client rect, if
     *  the caller has it (asking for many points). The ray meets the unit sphere itself — not its triangles: a few
     *  microseconds, not half a millisecond — and the UV is SphereGeometry's at that point. */
    uvAt(clientX, clientY, r = this.canvas.getBoundingClientRect()) {
        this._ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
        this._raycaster.setFromCamera(this._ndc, this.camera);
        const p = this._raycaster.ray.intersectSphere(this._sphere, this._hit);
        if (!p) return null;
        // (SphereGeometry: x = −cos φ sin θ, y = cos θ, z = sin φ sin θ; u = φ / 2π, v = 1 − θ / π)
        const phi = Math.atan2(p.z, -p.x);
        return new THREE.Vector2((phi < 0 ? phi + 2 * Math.PI : phi) / (2 * Math.PI), 1 - Math.acos(Math.max(-1, Math.min(1, p.y))) / Math.PI);
    }
}
