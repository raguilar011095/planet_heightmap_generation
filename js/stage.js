// The stage around the globe and the air on it (docs/style-guide/maps.md, The globe's defaults), shared by Generate,
// Import and Evolution. The stage is the page theme's desk (paper by day, navy at night); space with stars is an option
// (the view strip's Stars, remembered by the browser), never the default. Map colours read from tokens.css, so the
// globes follow a change of theme or of stage at once.

const SPACE_KEY = 'orogen.space';
let space = false;
try { space = localStorage.getItem(SPACE_KEY) === '1'; } catch { /* (the default where the browser forbids remembering) */ }
const listeners = [];

const token = (name, fallback) => window.orogenTheme?.token(name) || fallback;

/** Whether the globe sits in space with its stars (the option) rather than on the page's desk. */
export function inSpace() { return space; }

/** The stage's colour, as CSS: the desk, or space. */
export function stageColour() { return space ? token('stage-space', '#04060C') : token('desk', '#0B1420'); }

/** The desk's colour, as CSS: what a flat map always sits on, whatever the globe's stage. */
export function deskColour() { return token('desk', '#0B1420'); }

/** A token's colour as { r, g, b, a } in 0…1 (sRGB), from #rrggbb or rgb()/rgba(). */
export function tokenRGBA(name, fallback = '#ffffff') {
    const v = token(name, fallback).trim();
    let m = v.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (m) return { r: parseInt(m[1], 16) / 255, g: parseInt(m[2], 16) / 255, b: parseInt(m[3], 16) / 255, a: 1 };
    m = v.match(/rgba?\(([^)]+)\)/);
    if (m) { const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return { r: p[0] / 255, g: p[1] / 255, b: p[2] / 255, a: p.length > 3 ? p[3] : 1 }; }
    return { r: 1, g: 1, b: 1, a: 1 };
}

/** fn() whenever the stage or the theme changes (the globes repaint their background, air and stars). */
export function onStage(fn) {
    listeners.push(fn);
    window.orogenTheme?.onChange(() => fn());
}

/** The view strip's Stars toggle (#chkSpace), on every page. */
export function wireSpaceToggle() {
    const box = document.getElementById('chkSpace');
    if (!box) return;
    box.checked = space;
    box.addEventListener('change', () => {
        space = box.checked;
        try { localStorage.setItem(SPACE_KEY, space ? '1' : '0'); } catch { /* (remembered only where the browser allows) */ }
        for (const fn of listeners) fn();
    });
}

/**
 * The thin rim of air (map-air): a sphere a little larger than the globe, lit only at its edge. `THREE` is the page's
 * three.js; returns the mesh and an update(), called when the theme changes (the air is a little bluer at night).
 */
export function makeAir(THREE, radius = 1.03) {
    const air = tokenRGBA('map-air', 'rgba(120,150,185,0.38)');
    const material = new THREE.ShaderMaterial({
        uniforms: { c: { value: new THREE.Color(air.r, air.g, air.b) }, a: { value: air.a } },
        vertexShader: 'varying vec3 vN,vP;void main(){vN=normalize(normalMatrix*normal);vP=(modelViewMatrix*vec4(position,1)).xyz;gl_Position=projectionMatrix*vec4(vP,1);}',
        fragmentShader: 'uniform vec3 c;uniform float a;varying vec3 vN,vP;void main(){float r=1.0-max(0.0,dot(normalize(-vP),vN));gl_FragColor=vec4(c,pow(r,4.0)*a*1.6);}',
        transparent: true, side: THREE.FrontSide, depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 96), material);
    const update = () => { const t = tokenRGBA('map-air', 'rgba(120,150,185,0.38)'); material.uniforms.c.value.setRGB(t.r, t.g, t.b); material.uniforms.a.value = t.a; };
    return { mesh, update };
}
