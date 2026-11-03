// Vector overlays drawn on top of the rasterised map canvas: graticule, plate velocity
// arrows, and point markers (Euler poles). Because the globe uses this canvas as its
// texture, anything drawn here shows up in both views.

import { surfaceVelocity } from '../tectonics/step/kinematics.js';
import { CM_PER_YR_TO_RAD_PER_MYR } from '../tectonics/config.js';
import { plateCss } from '../view/palettes.js';

export function drawGraticule(ctx, width, height, stepDeg = 30) {
    ctx.save();
    ctx.strokeStyle = (window.orogenTheme?.token('map-grid') || 'rgba(255,255,255,0.22)');
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let lon = -180; lon <= 180; lon += stepDeg) {
        const x = (lon + 180) / 360 * width;
        ctx.moveTo(x, 0); ctx.lineTo(x, height);
    }
    for (let lat = -90 + stepDeg; lat < 90; lat += stepDeg) {
        const y = (90 - lat) / 180 * height;
        ctx.moveTo(0, y); ctx.lineTo(width, y);
    }
    ctx.stroke();
    ctx.restore();
}

/** One arrow per grid point showing the owning plate's surface velocity there. */
export function drawVelocityArrows(ctx, raster, frame, stepDeg = 12, pxPerCmYr = 5) {
    const { width, height } = raster;
    const v = [0, 0, 0];
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.5;
    for (let lat = -84; lat <= 84; lat += stepDeg) {
        const phi = lat * Math.PI / 180, cl = Math.cos(phi), sl = Math.sin(phi);
        // fewer arrows toward the poles so spacing stays even on the globe
        const lonStep = stepDeg / Math.max(0.2, cl);
        for (let lon = -180 + lonStep / 2; lon < 180; lon += lonStep) {
            const lam = lon * Math.PI / 180;
            const x = cl * Math.cos(lam), y = cl * Math.sin(lam), z = sl;
            const px = (lon + 180) / 360 * width, py = (90 - lat) / 180 * height;
            const id = frame.owner[raster.cellAt(px, py)];
            if (id < 0) continue;
            surfaceVelocity(frame.plates[id].omega, x, y, z, v);
            // local east / north components
            const east = -Math.sin(lam) * v[0] + Math.cos(lam) * v[1];
            const north = -sl * Math.cos(lam) * v[0] - sl * Math.sin(lam) * v[1] + cl * v[2];
            const e = east / CM_PER_YR_TO_RAD_PER_MYR, n = north / CM_PER_YR_TO_RAD_PER_MYR;
            if (Math.hypot(e, n) < 0.05) continue;   // stationary here
            // equirectangular stretches east–west by 1/cos(lat); compensate so arrows read true on the globe
            arrow(ctx, px, py, px + e * pxPerCmYr / Math.max(0.2, cl), py - n * pxPerCmYr);
        }
    }
    ctx.restore();
}

function arrow(ctx, x0, y0, x1, y1) {
    const a = Math.atan2(y1 - y0, x1 - x0), h = 4.5;
    ctx.beginPath();
    ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
    ctx.lineTo(x1 - h * Math.cos(a - 0.45), y1 - h * Math.sin(a - 0.45));
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - h * Math.cos(a + 0.45), y1 - h * Math.sin(a + 0.45));
    ctx.stroke();
}

/** ◎ markers, e.g. Euler poles, coloured like their plate. */
export function drawMarkers(ctx, raster, markers) {
    ctx.save();
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    for (const m of markers) {
        const [px, py] = raster.project(m.xyz[0], m.xyz[1], m.xyz[2]);
        if (m.kind === 'label') {                       // just a letter on the map, e.g. a craton's name
            ctx.save();
            ctx.font = 'bold 22px system-ui, sans-serif'; ctx.textAlign = 'center';
            ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.strokeText(m.label, px, py);
            ctx.fillStyle = '#fff'; ctx.fillText(m.label, px, py);
            ctx.restore();
            continue;
        }
        const color = m.color ?? (m.plateId === undefined ? '#ffffff' : plateCss(m.plateId));
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.beginPath(); ctx.arc(px, py, 7, 0, 2 * Math.PI); ctx.stroke();
        ctx.lineWidth = 2; ctx.strokeStyle = color;
        ctx.beginPath(); ctx.arc(px, py, 7, 0, 2 * Math.PI); ctx.stroke();
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(px, py, 2.2, 0, 2 * Math.PI); ctx.fill();
        if (m.label) {
            ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
            ctx.strokeText(m.label, px + 11, py);
            ctx.fillText(m.label, px + 11, py);
        }
    }
    ctx.restore();
}

/** Arrow colour per force, keyed by the force's name (tectonics/step/forces.js FORCE_KINDS). */
export const FORCE_COLORS = { 'slab pull': '#ffd166', 'slab suction': '#4cc9f0', 'ridge push': '#ff6b6b', 'rift push': '#ff9f43', 'mantle flow': '#c77dff' };

/**
 * One arrow per force kind at each plate's centre: the vector sum of that force over the plate's
 * boundary. `biggest` is the largest such force in the whole run, so arrow lengths stay comparable
 * from frame to frame (a trench visibly strengthens as its slab matures).
 */
export function drawForceArrows(ctx, raster, frame, biggest, maxPx = 70) {
    if (!(biggest > 0)) return;
    ctx.save();
    ctx.lineWidth = 4; ctx.lineCap = 'round';
    for (const p of frame.plates) {
        if (!p.dynamics || !p.alive) continue;
        const [x, y, z] = p.centre, lat = Math.asin(Math.max(-1, Math.min(1, z))), lam = Math.atan2(y, x), cl = Math.cos(lat), sl = Math.sin(lat);
        const [px, py] = raster.project(x, y, z);
        p.dynamics.forces.forEach(f => {
            const v = f.vector, size = Math.hypot(v[0], v[1], v[2]);
            if (size < 0.02 * biggest) return;
            const east = -Math.sin(lam) * v[0] + Math.cos(lam) * v[1], north = -sl * Math.cos(lam) * v[0] - sl * Math.sin(lam) * v[1] + cl * v[2];
            const scale = maxPx / biggest, x1 = px + east * scale / Math.max(0.2, cl), y1 = py - north * scale;
            ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 7; line(ctx, px, py, x1, y1);
            ctx.strokeStyle = FORCE_COLORS[f.name] ?? '#ffffff'; ctx.lineWidth = 4; line(ctx, px, py, x1, y1);
        });
    }
    ctx.restore();
}

function line(ctx, x0, y0, x1, y1) {
    const a = Math.atan2(y1 - y0, x1 - x0), h = 11;
    ctx.beginPath();
    ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
    ctx.lineTo(x1 - h * Math.cos(a - 0.5), y1 - h * Math.sin(a - 0.5));
    ctx.moveTo(x1, y1); ctx.lineTo(x1 - h * Math.cos(a + 0.5), y1 - h * Math.sin(a + 0.5));
    ctx.stroke();
}
