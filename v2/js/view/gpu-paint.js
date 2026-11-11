// The planet painted on the GPU, on the globe first (owner, 2026-11-05: "almost everything at the poles are getting
// distorted, instead of doing things on the globe first"): the terrain mesh drawn as it stands on the sphere, seen from
// the planet's centre onto the six faces of a cube (a cube render target) — the GPU's own filling of a triangle is then
// the blend of its three cells across the triangle itself, at the poles as at the equator, with no seam and no pole —
// and that cube then read into the equirectangular texture every view and export samples, each pixel looking out along
// its own direction. Before, the triangles were drawn flat on the equirectangular texture itself, so near a pole each
// was smeared across its longitudes: coasts there came out as spikes and saw-teeth.
//
// Each pixel's height blended THEN coloured by the palette and shaded, as SmoothMapRaster.paintHeights, so a coast is
// the heights' zero line, crisp at the pixel (the cube holds the heights, in half floats, where the GPU can draw them;
// else their colours); or each cell's colour blended (the plates, the climate layers), as paint. A frame sends only the
// cells' heights and shading (or colours) as a small data texture, not a painted picture (developer, 2026-10-18: "lets
// do the GPU repaint"). The sea (where the blended height is below sea level) is drawn too, for the glint; and lines over
// the picture (the grid, a climate layer's arrows) come from a transparent overlay canvas, blended as the cube is read
// out (over the colours, in sRGB, as a canvas blends them). Colours are written in linear light to an sRGB target, so the
// globe samples them as it samples a canvas texture. Needs WebGL 2 (GpuPainter.available).
//
// A finished moment's Terrain and Heightmap views are painted here too (drawFinished): its picture of heights, its sea and
// its lakes as textures the picture's size — sent once per moment — and the palette, the hillshade and the lakes' colours
// per pixel in a shader, as finish-view.js paintFinished paints them on the CPU (which the exports, and the layers with
// colours of their own, still use). A palette, the hillshade or the rivers switched is then a few milliseconds rather
// than a quarter of a second of the page's thread; the colours within 1 of 255 per channel of the CPU's.

import * as THREE from 'three';

// the mesh on the sphere, seen from its centre (positions in the terrain mesh's own z-up frame)
const VERT = `
precision highp float; precision highp int;
in vec3 position; in float cell;
uniform mat4 projectionMatrix, modelViewMatrix;
uniform highp sampler2D data; uniform int dataW;
out float vH; out float vS; out vec3 vRgb;
void main() {
    ivec2 t = ivec2(int(cell) % dataW, int(cell) / dataW);
    vec4 d = texelFetch(data, t, 0);
    vH = d.r; vS = d.g; vRgb = d.rgb;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
// the palette's colour of a height (m above the sea), shaded — sRGB 0…1
const LUT = `
uniform highp sampler2D lut; uniform float seaKm, minM, stepM; uniform int zero, top, shaded;
vec3 coloured(float hKm, float s) {
    float m = (hKm - seaKm) * 1000.0;
    int j = int(floor((m - minM) / stepM + 0.5));
    int k = m < 0.0 ? clamp(j, 0, zero - 1) : clamp(j, zero, top);
    vec3 c = texelFetch(lut, ivec2(k, 0), 0).rgb;
    if (shaded == 1) c = min(c * (0.35 + 0.65 * s), vec3(1.0));
    return c;
}`;
// onto the cube: the heights and shading as they are (a float cube), or already coloured (a byte cube); a cell colour;
// the sea
const FRAG_HEIGHTS = `
precision highp float; precision highp int;
in float vH; in float vS; in vec3 vRgb;
${LUT}
uniform int raw;
out vec4 outColor;
void main() { outColor = raw == 1 ? vec4(vH, vS, 0.0, 1.0) : vec4(coloured(vH, vS), 1.0); }`;
const FRAG_CELLS = `
precision highp float; precision highp int;
in float vH; in float vS; in vec3 vRgb;
out vec4 outColor;
void main() { outColor = vec4(vRgb, 1.0); }`;
const FRAG_SEA = `
precision highp float;
in float vH; in float vS; in vec3 vRgb;
uniform float seaKm;
out vec4 outColor;
void main() { float s = vH < seaKm ? 1.0 : 0.0; outColor = vec4(s, s, s, 1.0); }`;

// the cube read out: each pixel of the equirectangular target (u east from −180°, rows from the south: the GL target's)
// looks out along its own direction; `what` 0: heights to colour, 1: colours, 2: the sea (from heights), 3: the sea as
// drawn. sRGB (0…1) → linear light (the target encodes back to sRGB on writing); the overlay's lines over a colour, in
// sRGB (a canvas's source-over: the overlay canvas is the target's size, so a fragment reads its own pixel)
const VERT_QUAD = `
precision highp float;
in vec3 position;
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const FRAG_OUT = `
precision highp float; precision highp int;
uniform highp samplerCube cube; uniform int what;
uniform sampler2D overlay; uniform int laid; uniform vec2 size;
${LUT}
out vec4 outColor;
vec3 toLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 lined(vec3 c) { if (laid == 0) return c; vec4 o = texture(overlay, gl_FragCoord.xy / size); return mix(c, o.rgb, o.a); }
void main() {
    vec2 f = gl_FragCoord.xy / size;
    float lon = (f.x - 0.5) * 6.283185307179586, lat = (f.y - 0.5) * 3.141592653589793;
    vec3 dir = vec3(cos(lat) * cos(lon), cos(lat) * sin(lon), sin(lat));
    vec4 v = texture(cube, dir);
    if (what == 2) { float s = v.r < seaKm ? 1.0 : 0.0; outColor = vec4(s, s, s, 1.0); return; }
    if (what == 3) { outColor = vec4(v.rrr, 1.0); return; }
    vec3 c = what == 0 ? coloured(v.r, v.g) : v.rgb;
    outColor = vec4(toLinear(lined(c)), 1.0);
}`;

// a finished moment's picture (finish-view.js rasterAt: heights in km, the sea, the lakes' kinds — row 0 the north), as
// paintFinished colours it: the palette by height (the sea by its depth), hillshaded from its neighbours' heights; a lake
// flat water. `what` 1: the sea and the lakes (fresh, salt) for the glint, on a target of another size.
const FRAG_FINISHED = `
precision highp float; precision highp int;
uniform highp sampler2D heights; uniform highp sampler2D seas; uniform highp sampler2D kinds;
uniform ivec2 dim; uniform int what, lit, lakes;
uniform float exaggeration, pxKm;
uniform vec3 lake1, lake2, lake3;
uniform sampler2D overlay; uniform int laid; uniform vec2 size;
uniform highp sampler2D lut; uniform float minM, stepM; uniform int zero, top;
out vec4 outColor;
vec3 toLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 lined(vec3 c) { if (laid == 0) return c; vec4 o = texture(overlay, gl_FragCoord.xy / size); return mix(c, o.rgb, o.a); }
float heightAt(int x, int y) { return texelFetch(heights, ivec2(x, y), 0).r; }
void main() {
    ivec2 p = ivec2(gl_FragCoord.xy);
    if (what == 1) {
        float f = float(dim.x) / size.x;
        int sy = int(size.y) - 1 - p.y;
        ivec2 q = ivec2(min(dim.x - 1, int(floor((float(p.x) + 0.5) * f))), min(dim.y - 1, int(floor((float(sy) + 0.5) * f))));
        int kind = lakes == 1 ? int(texelFetch(kinds, q, 0).r * 255.0 + 0.5) : 0;
        float s = texelFetch(seas, q, 0).r > 0.0 || kind == 1 || kind == 2 ? 1.0 : 0.0;
        outColor = vec4(s, s, s, 1.0);
        return;
    }
    int x = p.x, y = dim.y - 1 - p.y;
    float v = heightAt(x, y);
    bool wet = texelFetch(seas, ivec2(x, y), 0).r > 0.0;
    int kind = lakes == 1 ? int(texelFetch(kinds, ivec2(x, y), 0).r * 255.0 + 0.5) : 0;
    vec3 c;
    if (kind > 0 && !wet) c = kind == 3 ? lake3 : (kind == 2 ? lake2 : lake1);
    else {
        float kk = 1.0;
        if (lit == 1) {
            float cl = max(0.05, cos(((float(y) + 0.5) / float(dim.y) - 0.5) * 3.141592653589793));
            float ex = wet ? exaggeration * 0.35 : exaggeration;
            float ge = (heightAt(x + 1 == dim.x ? 0 : x + 1, y) - heightAt(x == 0 ? dim.x - 1 : x - 1, y)) / (2.0 * pxKm * cl);
            float gn = (heightAt(x, max(0, y - 1)) - heightAt(x, min(dim.y - 1, y + 1))) / (2.0 * pxKm);
            float qx = -ex * ge, qy = -ex * gn, len = sqrt(qx * qx + qy * qy + 1.0);
            kk = 0.35 + 0.65 * max(0.0, (qx * -0.5 + qy * 0.5 + 0.7071067811865476) / len) / 0.7071067811865476;
        }
        int j = int(floor((v * 1000.0 - minM) / stepM + 0.5));
        int k = wet ? clamp(j, 0, zero - 1) : clamp(j, zero, top);
        c = min(texelFetch(lut, ivec2(k, 0), 0).rgb * kk, vec3(1.0));
    }
    outColor = vec4(toLinear(lined(c)), 1.0);
}`;

export class GpuPainter {
    /** Can this renderer paint on the GPU (WebGL 2: integer texel fetches, float data textures)? */
    static available(renderer) { return !!renderer?.capabilities?.isWebGL2; }

    /** Is WebGL drawn by the processor here (no graphics card the browser will use: SwiftShader, llvmpipe, WARP)? A
     *  shader over every pixel is then slower than the page's own loop — a finished moment keeps the CPU's paint. */
    static software(renderer) {
        try {
            const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
            const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
            return /swiftshader|llvmpipe|softpipe|software|basic render|warp/i.test(name);
        } catch { return false; }
    }

    /** Wait until what has been drawn is drawn (one pixel read back) — to time a paint. */
    settle() { const px = new Uint8Array(4); this.renderer.readRenderTargetPixels(this.target, 0, 0, 1, 1, px); }

    /**
     * @param {THREE.WebGLRenderer} renderer  the globe's  @param {number} width  the texture's width (× width/2)
     * @param {number} [seaWidth]  the sea mask's (a glint needs less)
     */
    constructor(renderer, width, seaWidth = width) {
        this.renderer = renderer;
        this.width = width;
        // (the picture with mipmaps, renewed after each paint, and filtered anisotropically — zoomed out each screen pixel
        // the mean of the texels under it, as the globe's own canvas textures: globe-view.js; the sea mask without)
        const target = (w, colorSpace, mip) => {
            const rt = new THREE.WebGLRenderTarget(w, w >> 1, { depthBuffer: false, stencilBuffer: false, generateMipmaps: mip, minFilter: mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter, magFilter: THREE.LinearFilter });
            rt.texture.colorSpace = colorSpace;
            rt.texture.wrapS = THREE.RepeatWrapping;           // (the map view turns it to its centre longitude)
            if (mip) rt.texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
            return rt;
        };
        this.target = target(width, THREE.SRGBColorSpace, true);
        this.seaTarget = target(seaWidth, THREE.NoColorSpace, false);
        // the cube the mesh is drawn onto: each face's texels a little finer than the texture's pixels at its middle (a
        // face spans 90°, its middle's texels 2 ÷ size radians across; the texture's 2π ÷ width) — in half floats, the
        // heights themselves, where the GPU can draw into them
        this.raw = renderer.extensions.has('EXT_color_buffer_float');
        const face = Math.max(256, Math.round(0.375 * width));
        this.cube = new THREE.WebGLCubeRenderTarget(face, { depthBuffer: false, stencilBuffer: false, generateMipmaps: false,
            type: this.raw ? THREE.HalfFloatType : THREE.UnsignedByteType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
        this.cube.texture.colorSpace = THREE.NoColorSpace;
        this.cubeCamera = new THREE.CubeCamera(0.05, 10, this.cube);
        this.scene = new THREE.Scene();
        this.uniforms = {
            data: { value: null }, dataW: { value: 1 }, lut: { value: null }, seaKm: { value: 0 }, raw: { value: this.raw ? 1 : 0 },
            minM: { value: 0 }, stepM: { value: 1 }, zero: { value: 0 }, top: { value: 0 }, shaded: { value: 0 },
        };
        const material = frag => new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: frag, uniforms: this.uniforms, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
        this.materials = { heights: material(FRAG_HEIGHTS), cells: material(FRAG_CELLS), sea: material(FRAG_SEA) };
        // (the read-out: a quad over the target)
        this.outUniforms = {
            cube: { value: this.cube.texture }, what: { value: 0 }, overlay: { value: null }, laid: { value: 0 }, size: { value: new THREE.Vector2(width, width >> 1) },
            lut: this.uniforms.lut, seaKm: this.uniforms.seaKm, minM: this.uniforms.minM, stepM: this.uniforms.stepM, zero: this.uniforms.zero, top: this.uniforms.top, shaded: this.uniforms.shaded,
        };
        this.outScene = new THREE.Scene();
        this.outCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: VERT_QUAD, fragmentShader: FRAG_OUT, uniforms: this.outUniforms, depthTest: false, depthWrite: false }));
        quad.frustumCulled = false;
        this.outScene.add(quad);
        // (a finished moment's picture: another quad over the target, its own textures)
        this.finUniforms = {
            heights: { value: null }, seas: { value: null }, kinds: { value: null }, dim: { value: new THREE.Vector2(1, 1) }, what: { value: 0 }, lit: { value: 0 }, lakes: { value: 0 },
            exaggeration: { value: 20 }, pxKm: { value: 1 }, lake1: { value: new THREE.Vector3() }, lake2: { value: new THREE.Vector3() }, lake3: { value: new THREE.Vector3() },
            overlay: this.outUniforms.overlay, laid: this.outUniforms.laid, size: this.outUniforms.size,
            lut: this.uniforms.lut, minM: this.uniforms.minM, stepM: this.uniforms.stepM, zero: this.uniforms.zero, top: this.uniforms.top,
        };
        this.finScene = new THREE.Scene();
        const finQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: VERT_QUAD, fragmentShader: FRAG_FINISHED, uniforms: this.finUniforms, depthTest: false, depthWrite: false }));
        finQuad.frustumCulled = false;
        this.finScene.add(finQuad);
        this.finished = null;                 // the finished picture on the GPU: { shown, textures }
        this.mesh = null;                     // the terrain mesh drawn, and its triangles on the sphere (THREE.Mesh)
        this.drawn = null;
        this.overlayTexture = null;
        this.lutKey = null;
    }

    get texture() { return this.target.texture; }
    get seaTexture() { return this.seaTarget.texture; }

    /** The terrain mesh to draw (its triangles built once per mesh — a fraction of a second at the finest detail). */
    setMesh(tMesh) {
        if (this.mesh === tMesh) return;
        this.mesh = tMesh;
        if (this.drawn) { this.scene.remove(this.drawn); this.drawn.geometry.dispose(); }
        this.drawn = new THREE.Mesh(sphereTriangles(tMesh), this.materials.heights);
        this.drawn.frustumCulled = false;
        this.scene.add(this.drawn);
        const n = tMesh.numCells, w = Math.min(4096, Math.ceil(Math.sqrt(n))), h = Math.ceil(n / w);
        this.heightData?.dispose(); this.colorData?.dispose();
        this.heightData = new THREE.DataTexture(new Float32Array(2 * w * h), w, h, THREE.RGFormat, THREE.FloatType);
        this.colorData = new THREE.DataTexture(new Uint8Array(4 * w * h), w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
        for (const t of [this.heightData, this.colorData]) { t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; }
        this.uniforms.dataW.value = w;
    }

    /** The palette (looks.js heightLutOf: rgb 3 per step 0–255, minM, stepM, n, zero, shaded) as a texture, once per palette. */
    setLut(lut) {
        if (this.lutKey === lut) return;
        this.lutKey = lut;
        const px = new Uint8Array(4 * lut.n);
        for (let i = 0; i < lut.n; i++) { px[4 * i] = lut.rgb[3 * i]; px[4 * i + 1] = lut.rgb[3 * i + 1]; px[4 * i + 2] = lut.rgb[3 * i + 2]; px[4 * i + 3] = 255; }
        this.lutTexture?.dispose();
        this.lutTexture = new THREE.DataTexture(px, lut.n, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
        this.lutTexture.minFilter = this.lutTexture.magFilter = THREE.NearestFilter;
        this.lutTexture.needsUpdate = true;
        const u = this.uniforms;
        u.lut.value = this.lutTexture; u.minM.value = lut.minM; u.stepM.value = lut.stepM; u.zero.value = lut.zero; u.top.value = lut.n - 1; u.shaded.value = lut.shaded ? 1 : 0;
    }

    /**
     * Lines to lay over the pictures drawn from now on: a canvas the texture's size, transparent but for its lines (sRGB
     * colours, as a canvas's), or null. `changed`: it has been drawn again since it was last laid.
     */
    setOverlay(canvas, changed = false) {
        if (canvas && this.overlayTexture?.image !== canvas) {
            this.overlayTexture?.dispose();
            this.overlayTexture = new THREE.CanvasTexture(canvas);
            this.overlayTexture.colorSpace = THREE.NoColorSpace;          // (its bytes as they are: blended in sRGB, then turned to linear light)
            this.overlayTexture.generateMipmaps = false;
            this.overlayTexture.minFilter = this.overlayTexture.magFilter = THREE.NearestFilter;
            this.outUniforms.overlay.value = this.overlayTexture;
            changed = true;
        }
        if (canvas && changed) this.overlayTexture.needsUpdate = true;
        this.outUniforms.laid.value = canvas ? 1 : 0;
    }

    /** A frame by its heights (km) and hillshade (0…1) per cell, coloured by the palette (as SmoothMapRaster.paintHeights); the sea too, if `sea`. */
    drawHeights(heightKm, shade, lut, seaLevelKm, sea = false) {
        const d = this.heightData.image.data, n = heightKm.length;
        for (let c = 0; c < n; c++) { d[2 * c] = heightKm[c]; d[2 * c + 1] = shade[c]; }
        this.heightData.needsUpdate = true;
        this.setLut(lut);
        this.uniforms.data.value = this.heightData;
        this.uniforms.seaKm.value = seaLevelKm;
        this.onCube(this.materials.heights);
        this.readOut(this.raw ? 0 : 1, this.target);
        if (sea) {
            if (!this.raw) this.onCube(this.materials.sea);
            this.readOut(this.raw ? 2 : 3, this.seaTarget);
        }
    }

    /** A frame by a colour per cell (3 bytes each, as SmoothMapRaster.paint), and its heights for the sea, if `sea`. */
    drawCells(cellRgb, heightKm, seaLevelKm, sea = false) {
        const d = this.colorData.image.data, n = cellRgb.length / 3;
        for (let c = 0; c < n; c++) { d[4 * c] = cellRgb[3 * c]; d[4 * c + 1] = cellRgb[3 * c + 1]; d[4 * c + 2] = cellRgb[3 * c + 2]; d[4 * c + 3] = 255; }
        this.colorData.needsUpdate = true;
        this.uniforms.data.value = this.colorData;
        this.onCube(this.materials.cells);
        this.readOut(1, this.target);
        if (sea) {
            const h = this.heightData.image.data;
            for (let c = 0; c < n; c++) h[2 * c] = heightKm[c];
            this.heightData.needsUpdate = true;
            this.uniforms.data.value = this.heightData;
            this.uniforms.seaKm.value = seaLevelKm;
            this.onCube(this.materials.sea);
            this.readOut(3, this.seaTarget);
        }
    }

    /**
     * A finished moment's picture painted (as finish-view.js paintFinished paints it on the CPU): `shown` its picture at
     * this painter's width (rasterAt: h km, sea, wat — sent to the GPU once, kept while it is the one shown), coloured by
     * `lut` and hillshaded where the palette is (`shaded`), its lakes flat water in `lakeRgb` (three colours 0–255: fresh,
     * salt, a pan) with `lakes`; the sea and the lakes for the glint too, if `sea`.
     */
    drawFinished(shown, lut, { exaggeration = 20, lakes = false, lakeRgb = null, shaded = true, sea = false } = {}) {
        const W = this.width, H = W >> 1, u = this.finUniforms;
        if (shown.h.length !== W * H) throw new Error('GpuPainter.drawFinished: the picture is not the texture\'s size');
        if (this.finished?.shown !== shown) {
            this.forgetFinished();
            const data = (array, type) => {
                const t = new THREE.DataTexture(array, W, H, THREE.RedFormat, type);
                t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.unpackAlignment = 1; t.needsUpdate = true;
                // (on the GPU now: the picture's own arrays are the page's to keep — the texture need not hold them)
                return t;
            };
            const heights = data(shown.h, THREE.FloatType), seas = data(shown.sea, THREE.UnsignedByteType), kinds = shown.wat ? data(shown.wat, THREE.UnsignedByteType) : null;
            this.finished = { shown, textures: [heights, seas, kinds] };
        }
        const [heights, seas, kinds] = this.finished.textures;
        this.setLut(lut);
        u.heights.value = heights; u.seas.value = seas; u.kinds.value = kinds ?? seas;
        u.dim.value.set(W, H);
        u.lit.value = shaded && lut.shaded ? 1 : 0;
        u.lakes.value = lakes && kinds ? 1 : 0;
        u.exaggeration.value = exaggeration; u.pxKm.value = 2 * Math.PI * 6371 / W;
        if (lakeRgb) [u.lake1, u.lake2, u.lake3].forEach((l, i) => l.value.set(lakeRgb[i][0] / 255, lakeRgb[i][1] / 255, lakeRgb[i][2] / 255));
        this.finishedOut(0, this.target);
        if (sea) this.finishedOut(1, this.seaTarget);
    }

    /** The finished picture's quad drawn into a target (`what`: FRAG_FINISHED's). */
    finishedOut(what, target) {
        const r = this.renderer, was = r.getRenderTarget(), autoClear = r.autoClear;
        this.finUniforms.what.value = what;
        this.finUniforms.size.value.set(target.width, target.height);
        r.setRenderTarget(target);
        r.autoClear = true;
        r.render(this.finScene, this.outCamera);
        r.setRenderTarget(was);
        r.autoClear = autoClear;
    }

    /** The finished picture's textures let go (another moment's, or none, shown next: ~50 MB of the GPU's at 4096). */
    forgetFinished() {
        if (!this.finished) return;
        for (const t of this.finished.textures) t?.dispose();
        this.finished = null;
    }

    /** The mesh drawn onto the cube's six faces, seen from the planet's centre. */
    onCube(material) {
        this.drawn.material = material;
        const r = this.renderer, autoClear = r.autoClear;
        r.autoClear = true;
        this.cubeCamera.update(r, this.scene);
        r.autoClear = autoClear;
    }

    /** The cube read out into an equirectangular target (`what`: FRAG_OUT's). */
    readOut(what, target) {
        const r = this.renderer, was = r.getRenderTarget(), autoClear = r.autoClear;
        this.outUniforms.what.value = what;
        this.outUniforms.size.value.set(target.width, target.height);
        r.setRenderTarget(target);
        r.autoClear = true;
        r.render(this.outScene, this.outCamera);
        r.setRenderTarget(was);
        r.autoClear = autoClear;
    }

    /** The texture's pixels (RGBA bytes; rows from the bottom, south first: the GL convention) — for checks. */
    read(target = this.target) {
        const W = target.width, H = target.height, px = new Uint8Array(4 * W * H);
        this.renderer.readRenderTargetPixels(target, 0, 0, W, H, px);
        return px;
    }

    dispose() {
        for (const t of [this.target, this.seaTarget, this.cube]) t.dispose();
        this.drawn?.geometry.dispose();
        for (const m of Object.values(this.materials)) m.dispose();
        this.heightData?.dispose(); this.colorData?.dispose(); this.lutTexture?.dispose(); this.overlayTexture?.dispose();
        this.forgetFinished();
    }
}

/**
 * The terrain mesh's triangles where they stand on the sphere: per vertex its place (the mesh's own unit vector) and its
 * cell — vertex c is cell c, each triangle once. Indexed, and its arrays let go once on the GPU (~20 MB at 640K cells).
 */
function sphereTriangles(mesh) {
    const { xyz, adjOffset, adjList, numCells: n } = mesh;
    const pos = Float32Array.from(xyz.subarray(0, 3 * n)), cells = new Float32Array(n);
    for (let c = 0; c < n; c++) cells[c] = c;
    let index = new Uint32Array(3 * (2 * n + 16)), ni = 0;
    for (let c = 0; c < n; c++) {
        const s = adjOffset[c], e = adjOffset[c + 1];
        for (let k = s; k < e; k++) {
            const a = adjList[k], b = adjList[k + 1 < e ? k + 1 : s];
            if (a <= c || b <= c) continue;                    // (each triangle once: from its lowest cell)
            if (ni + 3 > index.length) { const g = new Uint32Array(2 * index.length); g.set(index); index = g; }
            index[ni++] = c; index[ni++] = a; index[ni++] = b;
        }
    }
    const g = new THREE.BufferGeometry();
    const free = function () { this.array = null; };     // (on the GPU now: the page need not keep them)
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).onUpload(free));
    g.setAttribute('cell', new THREE.BufferAttribute(cells, 1).onUpload(free));
    g.setIndex(new THREE.BufferAttribute(index.subarray(0, ni), 1).onUpload(free));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.01);      // (given: the renderer would measure the arrays let go)
    return g;
}
