// The degree ring (docs/style-guide/maps.md, Lines; README, Ornament): a gold circle round the globe at home zoom, with
// ticks every 5°, longer every 30°. It fades as you zoom in and goes in the map view. An SVG over the canvas, sized each
// frame to the globe on screen (the camera looks at the globe's centre; the picture is moved right of the canvas's centre
// by the open area's shift, js/open-area.js).
import { openShift } from './open-area.js';

const NS = 'http://www.w3.org/2000/svg';
const C = 300, R = 268;   // (the ring in a 600 × 600 box)

/** The ring after `canvas`; update(distance, fovDeg, width, height, show) once a frame. */
export function createDegreeRing(canvas) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'degree-ring');
    svg.setAttribute('viewBox', '0 0 600 600');
    svg.setAttribute('aria-hidden', 'true');
    let marks = `<circle cx="${C}" cy="${C}" r="${R}" class="ring-line"/>`;
    for (let d = 0; d < 360; d += 5) {
        const long = d % 30 === 0, a = (d - 90) * Math.PI / 180, r2 = R + (long ? 12 : 6);
        marks += `<line x1="${(C + R * Math.cos(a)).toFixed(1)}" y1="${(C + R * Math.sin(a)).toFixed(1)}" x2="${(C + r2 * Math.cos(a)).toFixed(1)}" y2="${(C + r2 * Math.sin(a)).toFixed(1)}" class="${long ? 'tick-long' : 'tick'}"/>`;
    }
    svg.innerHTML = marks;
    canvas.after(svg);
    let last = '';
    return {
        /** The globe (radius 1) seen from `distance` with a vertical field of `fovDeg` on a `width` × `height` canvas. */
        update(distance, fovDeg, width, height, show) {
            const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
            const fade = show ? Math.max(0, Math.min(1, (distance - 1.9) / 0.7)) : 0;
            const opacity = reduce ? (fade > 0.5 ? 1 : 0) : fade;
            const globePx = Math.tan(Math.asin(Math.min(1 / distance, 0.999))) / Math.tan(fovDeg * Math.PI / 360) * height / 2;
            const size = globePx * 1.075 * 600 / R;        // (just outside the rim of air)
            const shift = openShift(), key = `${Math.round(size)}|${width}|${height}|${shift.toFixed(1)}|${opacity.toFixed(2)}`;
            if (key === last) return;
            last = key;
            svg.style.width = svg.style.height = `${size}px`;
            svg.style.left = `${width / 2 + shift - size / 2}px`;
            svg.style.top = `${(height - size) / 2}px`;
            svg.style.opacity = opacity.toFixed(2);
            svg.style.display = opacity > 0 ? '' : 'none';
        },
    };
}
