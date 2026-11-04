// Generate's and Import's view for the graticule frame (js/graticule-frame.js): the globe — its centre, rim and camera
// in the planet's own frame (the planet turns about its axis under auto-rotate) — or the map, flat or in its projection,
// where the map camera puts it. Once a frame, from the animation loop.

import * as THREE from 'three';
import { camera, ctrl, mapVisible, mapAspectNow, mapFrameRect } from './scene.js';
import { state } from './state.js';
import { inSpace } from './stage.js';
import { createGraticuleFrame } from './graticule-frame.js';
import { P } from '../v2/js/view/projections.js';

// (the globe's own frame: its grid's — js/planet-mesh.js buildGlobeGrid — longitude 0 facing +z, 90°E facing +x)
const local = (lon, lat) => [Math.sin(lon) * Math.cos(lat), Math.sin(lat), Math.cos(lon) * Math.cos(lat)];
const turn = (p, a) => [p[0] * Math.cos(a) + p[2] * Math.sin(a), p[1], -p[0] * Math.sin(a) + p[2] * Math.cos(a)];

export function createGraticuleView(canvas) {
    const frame = createGraticuleFrame(canvas), v = new THREE.Vector3();
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    const client = (x, y, z) => { v.set(x, y, z).project(camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; };
    return {
        update() {
            const spacing = state.gridEnabled ? state.gridSpacing : 30;
            if (state.mapMode && state.mapMesh) {
                const id = state.mapProjection && P[state.mapProjection] && state.mapProjection !== 'equirect' ? state.mapProjection : 'equirect';
                const opts = id === 'equirect' ? {} : (state.mapProjOpts || {}), b = P[id].bounds(opts);
                const A = id === 'equirect' ? 2 : mapAspectNow(), W = innerWidth, H = innerHeight, [x0, x1, y0, y1] = mapVisible();
                // (the projection's own coordinates ↔ the map camera's units ↔ the window)
                const toClient = (X, Y) => {
                    const wx = (X - b[0]) / (b[1] - b[0]) * 2 * A - A, wy = (Y - b[2]) / (b[3] - b[2]) * 2 - 1;
                    return [(wx - x0) / (x1 - x0) * W, (y1 - wy) / (y1 - y0) * H];
                };
                const fromClient = (x, y) => {
                    const wx = x0 + x / W * (x1 - x0), wy = y1 - y / H * (y1 - y0);
                    return [b[0] + (wx + A) / (2 * A) * (b[1] - b[0]), b[2] + (wy + 1) / 2 * (b[3] - b[2])];
                };
                const rect = mapFrameRect();
                const key = [id, JSON.stringify(opts), state.mapCenterLon || 0, x0, x1, y0, y1, W, H, spacing, rect.l, rect.t, rect.b].join('|');
                frame.map({ id, opts, centre: state.mapCenterLon || 0, toClient, fromClient, rect, spacing, key });
                return;
            }
            if (!state.planetMesh) { frame.hide(); return; }
            const d = camera.position.distanceTo(ctrl.target), rot = state.planetMesh.rotation.y;
            const fade = Math.max(0, Math.min(1, (d - 1.9) / 0.7)), opacity = reduce.matches ? (fade > 0.5 ? 1 : 0) : fade;
            const [cx, cy] = client(0, 0, 0);
            const r = Math.tan(Math.asin(Math.min(1 / d, 0.999))) / Math.tan(camera.fov * Math.PI / 360) * innerHeight / 2;
            const cam = turn([camera.position.x, camera.position.y, camera.position.z], -rot);
            frame.globe({ cx, cy, r, opacity, cam, local, spacing, space: inSpace(),
                toScreen: (p) => { const q = turn(p, rot); return client(q[0], q[1], q[2]); } });
        },
    };
}
