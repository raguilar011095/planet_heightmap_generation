// The planet painted on the GPU: the terrain mesh's triangles drawn flat onto an equirectangular texture (a render
// target) — the GPU's own filling of a triangle is the blend of its three cells that the CPU's pixel table did
// (view/map-raster.js SmoothMapRaster) — each pixel's height blended THEN coloured by the palette and shaded, as
// paintHeights, so a coast is the heights' zero line, crisp at the pixel; or each cell's colour blended (the plates, the
// climate layers), as paint. A frame sends only the cells' heights and shading (or colours) as a small data texture,
// not a painted picture — the page's thread no longer paints ~2M pixels per frame, nor keeps a pixel table (117 MB for
// the sharper texture) (developer, 2026-10-18: "lets do the GPU repaint"). The sea (where the blended height is below
// sea level) is drawn too, for the glint; and lines over the picture (the grid, a climate layer's arrows) come from a
// transparent overlay canvas, blended in the same pass as a canvas blends them (over the colours, in sRGB).
//
// Where a triangle crosses the antimeridian it is drawn twice, a turn apart (the texture's edges cut it); the triangle
// round a pole is drawn as strips from each of its edges to the pole's row. Colours are written in linear light to an
// sRGB target, so the globe samples them as it samples a canvas texture. Needs WebGL 2 (GpuPainter.available).

import * as THREE from 'three';

const VERT = `
precision highp float; precision highp int;
in vec3 position; in float cell;
uniform highp sampler2D data; uniform int dataW;
out float vH; out float vS; out vec3 vRgb;
void main() {
    ivec2 t = ivec2(int(cell) % dataW, int(cell) / dataW);
    vec4 d = texelFetch(data, t, 0);
    vH = d.r; vS = d.g; vRgb = d.rgb;
    gl_Position = vec4(position.x * 2.0 - 1.0, 1.0 - position.y * 2.0, 0.0, 1.0);
}`;
// sRGB (0…1) → linear light (the target encodes back to sRGB on writing); the overlay's lines over a colour, in sRGB
// (a canvas's source-over: the overlay canvas is the target's size, so a fragment reads its own pixel)
const COMMON = `
uniform sampler2D overlay; uniform int laid; uniform vec2 size;
vec3 toLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 lined(vec3 c) { if (laid == 0) return c; vec4 o = texture(overlay, gl_FragCoord.xy / size); return mix(c, o.rgb, o.a); }`;
const FRAG_HEIGHTS = `
precision highp float; precision highp int;
in float vH; in float vS; in vec3 vRgb;
uniform highp sampler2D lut; uniform float seaKm, minM, stepM; uniform int zero, top, shaded;
out vec4 outColor;
${COMMON}
void main() {
    float m = (vH - seaKm) * 1000.0;
    int j = int(floor((m - minM) / stepM + 0.5));
    int k = m < 0.0 ? clamp(j, 0, zero - 1) : clamp(j, zero, top);
    vec3 c = texelFetch(lut, ivec2(k, 0), 0).rgb;
    if (shaded == 1) c = min(c * (0.35 + 0.65 * vS), vec3(1.0));
    outColor = vec4(toLinear(lined(c)), 1.0);
}`;
const FRAG_CELLS = `
precision highp float; precision highp int;
in float vH; in float vS; in vec3 vRgb;
out vec4 outColor;
${COMMON}
void main() { outColor = vec4(toLinear(lined(vRgb)), 1.0); }`;
const FRAG_SEA = `
precision highp float;
in float vH; in float vS; in vec3 vRgb;
uniform float seaKm;
out vec4 outColor;
void main() { float s = vH < seaKm ? 1.0 : 0.0; outColor = vec4(s, s, s, 1.0); }`;

export class GpuPainter {
    /** Can this renderer paint on the GPU (WebGL 2: integer texel fetches, float data textures)? */
    static available(renderer) { return !!renderer?.capabilities?.isWebGL2; }

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
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.scene = new THREE.Scene();
        this.uniforms = {
            data: { value: null }, dataW: { value: 1 }, lut: { value: null }, seaKm: { value: 0 },
            minM: { value: 0 }, stepM: { value: 1 }, zero: { value: 0 }, top: { value: 0 }, shaded: { value: 0 },
            overlay: { value: null }, laid: { value: 0 }, size: { value: new THREE.Vector2(width, width >> 1) },
        };
        const material = frag => new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: frag, uniforms: this.uniforms, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
        this.materials = { heights: material(FRAG_HEIGHTS), cells: material(FRAG_CELLS), sea: material(FRAG_SEA) };
        this.mesh = null;                     // the terrain mesh drawn, and its flat triangles (THREE.Mesh)
        this.drawn = null;
        this.overlayTexture = null;
        this.lutKey = null;
    }

    get texture() { return this.target.texture; }
    get seaTexture() { return this.seaTarget.texture; }

    /** The terrain mesh to draw (its flat triangles built once per mesh — a fraction of a second at the finest detail). */
    setMesh(tMesh) {
        if (this.mesh === tMesh) return;
        this.mesh = tMesh;
        if (this.drawn) { this.scene.remove(this.drawn); this.drawn.geometry.dispose(); }
        this.drawn = new THREE.Mesh(flatTriangles(tMesh), this.materials.heights);
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
            this.uniforms.overlay.value = this.overlayTexture;
            changed = true;
        }
        if (canvas && changed) this.overlayTexture.needsUpdate = true;
        this.uniforms.laid.value = canvas ? 1 : 0;
    }

    /** A frame by its heights (km) and hillshade (0…1) per cell, coloured by the palette (as SmoothMapRaster.paintHeights); the sea too, if `sea`. */
    drawHeights(heightKm, shade, lut, seaLevelKm, sea = false) {
        const d = this.heightData.image.data, n = heightKm.length;
        for (let c = 0; c < n; c++) { d[2 * c] = heightKm[c]; d[2 * c + 1] = shade[c]; }
        this.heightData.needsUpdate = true;
        this.setLut(lut);
        this.uniforms.data.value = this.heightData;
        this.uniforms.seaKm.value = seaLevelKm;
        this.pass(this.materials.heights, this.target);
        if (sea) this.pass(this.materials.sea, this.seaTarget);
    }

    /** A frame by a colour per cell (3 bytes each, as SmoothMapRaster.paint), and its heights for the sea, if `sea`. */
    drawCells(cellRgb, heightKm, seaLevelKm, sea = false) {
        const d = this.colorData.image.data, n = cellRgb.length / 3;
        for (let c = 0; c < n; c++) { d[4 * c] = cellRgb[3 * c]; d[4 * c + 1] = cellRgb[3 * c + 1]; d[4 * c + 2] = cellRgb[3 * c + 2]; d[4 * c + 3] = 255; }
        this.colorData.needsUpdate = true;
        this.uniforms.data.value = this.colorData;
        this.pass(this.materials.cells, this.target);
        if (sea) {
            const h = this.heightData.image.data;
            for (let c = 0; c < n; c++) h[2 * c] = heightKm[c];
            this.heightData.needsUpdate = true;
            this.uniforms.data.value = this.heightData;
            this.uniforms.seaKm.value = seaLevelKm;
            this.pass(this.materials.sea, this.seaTarget);
        }
    }

    pass(material, target) {
        this.drawn.material = material;
        const r = this.renderer, was = r.getRenderTarget(), autoClear = r.autoClear;
        r.setRenderTarget(target);
        r.autoClear = true;
        r.render(this.scene, this.camera);
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
        for (const t of [this.target, this.seaTarget]) t.dispose();
        this.drawn?.geometry.dispose();
        for (const m of Object.values(this.materials)) m.dispose();
        this.heightData?.dispose(); this.colorData?.dispose(); this.lutTexture?.dispose(); this.overlayTexture?.dispose();
    }
}

/**
 * The terrain mesh's triangles, flat on the equirectangular texture: per vertex its place (u east from −180°, v south from
 * the north pole, both 0…1) and its cell — vertex c is cell c where it stands; the copies below come after. A triangle
 * that crosses the antimeridian twice, a turn apart; the triangle round a pole as a strip from each of its edges to the
 * pole's row (u along the edge, v 0 or 1). Indexed, and its arrays let go once on the GPU (~25 MB at 640K cells).
 */
function flatTriangles(mesh) {
    const { xyz, adjOffset, adjList, numCells: n } = mesh;
    const u = new Float64Array(n), v = new Float64Array(n);
    // (growing arrays: vertex c is cell c; a sphere's triangulation has 2n − 4 triangles, plus the copies)
    let pos = new Float32Array(3 * (n + 4096)), cells = new Float32Array(n + 4096), index = new Uint32Array(3 * (2 * n + 4096));
    let nv = n, ni = 0;
    for (let c = 0; c < n; c++) {
        const x = xyz[3 * c], y = xyz[3 * c + 1], z = xyz[3 * c + 2];
        u[c] = (Math.atan2(y, x) + Math.PI) / (2 * Math.PI);
        v[c] = (Math.PI / 2 - Math.asin(Math.max(-1, Math.min(1, z)))) / Math.PI;
        pos[3 * c] = u[c]; pos[3 * c + 1] = v[c]; cells[c] = c;
    }
    const vert = (uu, vv, cell) => {
        if (nv === cells.length) { const p = new Float32Array(2 * pos.length); p.set(pos); pos = p; const q = new Float32Array(2 * cells.length); q.set(cells); cells = q; }
        pos[3 * nv] = uu; pos[3 * nv + 1] = vv; cells[nv] = cell;
        return nv++;
    };
    const tri = (a, b, c) => {
        if (ni + 3 > index.length) { const g = new Uint32Array(2 * index.length); g.set(index); index = g; }
        index[ni++] = a; index[ni++] = b; index[ni++] = c;
    };
    // a strip from the edge p → q to the pole's row (v = row), its corners there the cells pa, pb (the pole's own, if it is a cell)
    const strip = (p, q, row, pa, pb) => {
        let up = u[p], uq = u[q];
        if (uq - up > 0.5) uq -= 1; else if (up - uq > 0.5) uq += 1;
        for (const sh of [-1, 0, 1]) {
            const P = vert(up + sh, v[p], p), Q = vert(uq + sh, v[q], q), QB = vert(uq + sh, row, pb), PA = vert(up + sh, row, pa);
            tri(P, Q, QB); tri(P, QB, PA);
        }
    };
    const atPole = c => Math.abs(xyz[3 * c + 2]) > 1 - 1e-7;
    // (is the pole (0, 0, pz) inside the spherical triangle a, b, c: on the inner side of each edge — each triple product's
    // sign that of the triangle's own orientation; agreeing among themselves only, the opposite pole would pass too)
    const det = (a, b, pz) => (xyz[3 * a] * xyz[3 * b + 1] - xyz[3 * a + 1] * xyz[3 * b]) * pz;
    const orient = (a, b, c) => {
        const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2], bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2], cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
        return ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
    };
    const holds = (a, b, c, pz) => { const o = orient(a, b, c); return det(a, b, pz) * o > 0 && det(b, c, pz) * o > 0 && det(c, a, pz) * o > 0; };
    const corners = [0, 0, 0];
    for (let c = 0; c < n; c++) {
        const s = adjOffset[c], e = adjOffset[c + 1];
        for (let k = s; k < e; k++) {
            const a = adjList[k], b = adjList[k + 1 < e ? k + 1 : s];
            if (a <= c || b <= c) continue;                    // (each triangle once: from its lowest cell)
            corners[0] = c; corners[1] = a; corners[2] = b;
            const at = corners.findIndex(atPole);
            if (at >= 0) {                                     // a cell on the pole (the mesh's closing point): the strip from the edge across
                const P = corners[at], p = corners[(at + 1) % 3], q = corners[(at + 2) % 3];
                strip(p, q, xyz[3 * P + 2] > 0 ? 0 : 1, P, P);
                continue;
            }
            const pole = holds(c, a, b, 1) ? 0 : holds(c, a, b, -1) ? 1 : -1;
            if (pole >= 0) {                                   // round a pole: a strip from each edge to the pole's row
                strip(c, a, pole, c, a); strip(a, b, pole, a, b); strip(b, c, pole, b, c);
                continue;
            }
            const lo = Math.min(u[c], u[a], u[b]), hi = Math.max(u[c], u[a], u[b]);
            if (hi - lo > 0.5) {                               // across the antimeridian: unwrapped east, and a turn west
                const east = x => (u[x] < 0.5 ? vert(u[x] + 1, v[x], x) : x), west = x => (u[x] < 0.5 ? x : vert(u[x] - 1, v[x], x));
                tri(east(c), east(a), east(b));
                tri(west(c), west(a), west(b));
            } else tri(c, a, b);
        }
    }
    const g = new THREE.BufferGeometry();
    const free = function () { this.array = null; };     // (on the GPU now: the page need not keep them)
    g.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, 3 * nv), 3).onUpload(free));
    g.setAttribute('cell', new THREE.BufferAttribute(cells.subarray(0, nv), 1).onUpload(free));
    g.setIndex(new THREE.BufferAttribute(index.subarray(0, ni), 1).onUpload(free));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0.5, 0.5, 0), 2);      // (given: the renderer would measure the arrays let go)
    return g;
}
