// The graticule frame (docs/style-guide/maps.md, Lines; README, Ornament): the gold ring round the globe and the gold
// frame round a map, with ticks and numerals where the grid lines meet them — the same idea on the globe and on every
// projection, always in step with the grid as the view turns, pans and zooms.
//
// - The globe: a gold ring just outside its rim, at home zoom (it fades as you zoom in, and goes in the map view). A tick
//   wherever a grid line meets the globe's edge (its limb, as the camera sees it), carried straight out to the ring, and
//   the line's degrees beside it — one family at a time, so it stays calm (the owner: "correct, but look crazy… It is
//   disorienting moving everything around all the time"): seen from near the equator, the parallels (°N, °S), which stay
//   put as the globe spins; seen from over a pole, the meridians (°E, °W), round the ring like a dial. Tilting toward a
//   pole crossfades from one to the other (between 35° and 55° of the camera's latitude).
// - A map: a gold frame along the map's own outline (a rectangle, an ellipse, a circle, two discs…), or along the edge of
//   the view where the map runs past it when zoomed in — then the map beyond is matted out in the stage's colour, an
//   atlas plate's window. A tick and the degrees wherever a grid line leaves the frame. Where the meridians all meet at a
//   pole on the outline (Mollweide, Hammer, Van der Grinten…), their degrees go along the equator instead.
// - Numerals every 30° (or every line, when the grid is coarser), never on top of each other: the round numbers first.
//
// One SVG over the canvas, in client pixels; the pages hand it their view (js/graticule-view.js for Generate and Import,
// v2/js/app/globe-view.js's frameView for Evolution). DOM-light: it is rewritten only when what it shows has changed.

import { P } from '../v2/js/view/projections.js';

const NS = 'http://www.w3.org/2000/svg', D = Math.PI / 180, PI = Math.PI, TWO = 2 * PI;
const wrap = (l) => ((l + PI) % TWO + TWO) % TWO - PI;
const r1 = (v) => Math.round(v * 10) / 10;
const fmt = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
const lonText = (deg) => { const a = ((deg % 360) + 540) % 360 - 180; return a === 0 ? '0°' : Math.abs(a) === 180 ? '180°' : `${fmt(Math.abs(a))}°${a > 0 ? 'E' : 'W'}`; };
const latText = (deg) => (deg === 0 ? '0°' : `${fmt(Math.abs(deg))}°${deg > 0 ? 'N' : 'S'}`);
/** The lines a frame labels: every 30°, or every line when the grid is coarser. */
const labelled = (deg, spacing) => Math.abs(deg / Math.max(30, spacing) - Math.round(deg / Math.max(30, spacing))) < 1e-6;
/** The round numbers placed first. */
const rank = (deg) => (deg === 0 ? 4 : deg % 90 === 0 ? 3 : deg % 60 === 0 ? 2 : 1);

// (a label's box, roughly: the font's figures at 10.5 px)
const boxOf = (text, x, y) => { const w = text.length * 6.1 + 4, h = 13; return [x - w / 2, y - h / 2, x + w / 2, y + h / 2]; };
const overlaps = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
/** The labels that fit — wholly on screen, none on another — the round numbers first. */
function place(cands) {
    cands.sort((a, b) => b.rank - a.rank);
    const kept = [], W = innerWidth, H = innerHeight;
    for (const c of cands) {
        const [x0, y0, x1, y1] = c.box;
        if (x0 < 2 || y0 < 2 || x1 > W - 2 || y1 > H - 2) continue;
        if (!kept.some(k => overlaps(k.box, c.box))) kept.push(c);
    }
    return kept;
}

// ── the outline of a projection, in its own coordinates. Most: the world's own edge traced through the projection —
// the back meridian down one side, the pole (or Mercator's cut) across, up the other side — exact, corners and all. The
// orthographic and the azimuthal, whose edge is a circle the world's edge doesn't trace: rays from the middle (or each
// disc's), each to where the map ends ──
const outlines = new Map();
function outlineOf(id, opts) {
    const key = id + JSON.stringify(opts);
    if (outlines.has(key)) return outlines.get(key);
    const pr = P[id], b = pr.bounds(opts);
    if (id !== 'ortho' && id !== 'azeq') {
        const top = id === 'mercator' ? (opts.maxLat ?? 85) : 90, E = PI - 1e-9, ring = [];
        const at = (l, p) => { const q = pr.fwd(l, p * D, opts); if (q) ring.push([q[0], q[1]]); };
        for (let p = -top; p <= top; p += 1) at(-E, p);
        for (let l = -180; l <= 180; l += 2) at(Math.max(-E, Math.min(E, l * D)), top);
        for (let p = top; p >= -top; p -= 1) at(E, p);
        for (let l = 180; l >= -180; l -= 2) at(Math.max(-E, Math.min(E, l * D)), -top);
        outlines.set(key, [ring]);
        return [ring];
    }
    const inside = (x, y) => x >= b[0] - 1e-9 && x <= b[1] + 1e-9 && y >= b[2] - 1e-9 && y <= b[3] + 1e-9 && !!pr.inv(x, y, opts);
    const centres = id === 'ortho' && (opts.hemis ?? 2) === 2 ? [[-1.06, 0], [1.06, 0]] : [[(b[0] + b[1]) / 2, (b[2] + b[3]) / 2]];
    const rings = centres.map(([cx, cy]) => {
        const ring = [], N = 240, far = Math.hypot(b[1] - b[0], b[3] - b[2]);
        for (let i = 0; i < N; i++) {
            const a = TWO * i / N, dx = Math.cos(a), dy = Math.sin(a);
            let lo = 0, hi = far;
            for (let s = 1; s <= 64; s++) { const t = far * s / 64; if (!inside(cx + dx * t, cy + dy * t)) { hi = t; break; } lo = t; }
            for (let k = 0; k < 22; k++) { const m = (lo + hi) / 2; if (inside(cx + dx * m, cy + dy * m)) lo = m; else hi = m; }
            ring.push([cx + dx * lo, cy + dy * lo]);
        }
        return ring;
    });
    outlines.set(key, rings);
    return rings;
}

/** A polygon clipped to a rectangle (Sutherland–Hodgman; the rectangle is convex, the polygon need not be). */
function clipToRect(poly, R) {
    const edges = [[(p) => p[0] >= R.l, (a, b) => [R.l, a[1] + (b[1] - a[1]) * (R.l - a[0]) / (b[0] - a[0])]],
        [(p) => p[0] <= R.r, (a, b) => [R.r, a[1] + (b[1] - a[1]) * (R.r - a[0]) / (b[0] - a[0])]],
        [(p) => p[1] >= R.t, (a, b) => [a[0] + (b[0] - a[0]) * (R.t - a[1]) / (b[1] - a[1]), R.t]],
        [(p) => p[1] <= R.b, (a, b) => [a[0] + (b[0] - a[0]) * (R.b - a[1]) / (b[1] - a[1]), R.b]]];
    let out = poly;
    for (const [inn, cut] of edges) {
        const src = out; out = [];
        for (let i = 0; i < src.length; i++) {
            const a = src[i], b = src[(i + 1) % src.length], ia = inn(a), ib = inn(b);
            if (ia) out.push(a);
            if (ia !== ib) out.push(cut(a, b));
        }
        if (!out.length) break;
    }
    return out;
}
const pathOf = (poly) => (poly.length < 3 ? '' : 'M' + poly.map(p => `${r1(p[0])} ${r1(p[1])}`).join('L') + 'Z');
const inRect = (p, R) => p[0] >= R.l - 0.5 && p[0] <= R.r + 0.5 && p[1] >= R.t - 0.5 && p[1] <= R.b + 0.5;

export function createGraticuleFrame(canvas) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'graticule-frame');
    svg.setAttribute('aria-hidden', 'true');
    canvas.after(svg);
    let shown = '', lastMapKey = null, lastGlobeKey = null, size = '';
    const draw = (html, opacity = 1, space = false) => {
        const w = innerWidth, h = innerHeight;
        if (size !== `${w}x${h}`) { size = `${w}x${h}`; svg.setAttribute('viewBox', `0 0 ${w} ${h}`); }
        svg.classList.toggle('in-space', space);
        svg.style.opacity = opacity.toFixed(2);
        svg.style.display = opacity > 0 && html ? '' : 'none';
        if (html !== shown) { shown = html; svg.innerHTML = html; }
    };

    return {
        /**
         * The globe: its centre and rim on screen (cx, cy, r: client px), the frame's opacity (its fade with zoom), the
         * camera's place in the planet's own frame (cam: [x, y, z], the globe's radius 1), toScreen(p) for a point of the
         * planet's own frame → [x, y] client px, local(lonRad, latRad) → the planet's own [x, y, z], the grid's spacing
         * (degrees), and whether the stage is space.
         */
        globe({ cx, cy, r, opacity, cam, toScreen, local, spacing, space = false }) {
            lastMapKey = null;
            if (!(opacity > 0) || !(r > 0)) { lastGlobeKey = null; return draw('', 0); }
            // (redrawn when the view moves — the camera's place over the planet, and how the planet sits on screen: seen
            // straight down a pole, a spin moves no camera, only the picture turning about its middle)
            const n0 = toScreen(local(0, PI / 2)), e0 = toScreen(local(0, 0));
            const gk = `${cam.map(v => v.toFixed(5))}|${r1(n0[0])},${r1(n0[1])}|${r1(e0[0])},${r1(e0[1])}|${r1(cx)}|${r1(cy)}|${r1(r)}|${spacing}|${opacity.toFixed(2)}|${space}|${innerWidth}x${innerHeight}`;
            if (gk === lastGlobeKey) return;
            lastGlobeKey = gk;
            const d = Math.hypot(cam[0], cam[1], cam[2]), c = cam.map(v => v / d), k = 1 / d;
            const f = (p) => p[0] * c[0] + p[1] * c[1] + p[2] * c[2] - k;
            const step = Math.max(5, spacing), R = r * 1.075, hits = [];
            // (which family shows: by the camera's latitude over the planet — the parallels near the equator, the
            // meridians over a pole, crossfading between)
            const n = local(0, PI / 2), camLat = Math.abs(Math.asin(Math.max(-1, Math.min(1, c[0] * n[0] + c[1] * n[1] + c[2] * n[2])))) / D;
            const t = Math.max(0, Math.min(1, (camLat - 35) / 20)), weight = { lon: t * t * (3 - 2 * t), lat: 1 - t * t * (3 - 2 * t) };
            // the meridians where they run over the edge (not at the poles, where they all meet)
            if (weight.lon > 0.01) for (let lon = -180; lon < 180 - 1e-6; lon += step) {
                let pa = local(lon * D, -88 * D), fa = f(pa);
                for (let lat = -87; lat <= 88; lat += 1) {
                    const pb = local(lon * D, lat * D), fb = f(pb);
                    if ((fa < 0) !== (fb < 0)) { const t = fa / (fa - fb), q = pa.map((v, i) => v + (pb[i] - v) * t); hits.push({ kind: 'lon', deg: lon, p: q }); }
                    pa = pb; fa = fb;
                }
            }
            // the parallels where they run over it
            if (weight.lat > 0.01) for (let lat = -90 + step; lat < 90 - 1e-6; lat += step) {
                let pa = local(-PI, lat * D), fa = f(pa);
                for (let lon = -179; lon <= 180; lon += 1) {
                    const pb = local(lon * D, lat * D), fb = f(pb);
                    if ((fa < 0) !== (fb < 0)) { const t = fa / (fa - fb), q = pa.map((v, i) => v + (pb[i] - v) * t); hits.push({ kind: 'lat', deg: lat, p: q }); }
                    pa = pb; fa = fb;
                }
            }
            let ticks = '';
            const labels = { lon: [], lat: [] }, op = (w) => (w < 0.99 ? ` opacity="${w.toFixed(2)}"` : '');
            for (const h of hits) {
                const s = toScreen(h.p), a = Math.atan2(s[1] - cy, s[0] - cx), ca = Math.cos(a), sa = Math.sin(a);
                const lab = labelled(h.deg, spacing), len = lab ? 10 : 6;
                ticks += `<line class="gf-tick${lab ? ' gf-tick--long' : ''}"${op(weight[h.kind])} x1="${r1(cx + R * ca)}" y1="${r1(cy + R * sa)}" x2="${r1(cx + (R + len) * ca)}" y2="${r1(cy + (R + len) * sa)}"/>`;
                if (lab) {
                    const text = h.kind === 'lon' ? lonText(h.deg) : latText(h.deg), x = cx + (R + 22) * ca, y = cy + (R + 22) * sa;
                    labels[h.kind].push({ text, x, y, rank: rank(h.deg), box: boxOf(text, x, y) });
                }
            }
            // (each family placed on its own: while they crossfade, one doesn't push the other's numerals out)
            const html = `<circle class="gf-ring" cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(R)}"/>${ticks}` +
                ['lat', 'lon'].map(kind => place(labels[kind]).map(l => `<text class="gf-num"${op(weight[kind])} x="${r1(l.x)}" y="${r1(l.y)}">${l.text}</text>`).join('')).join('');
            draw(html, opacity, space);
        },

        /**
         * A map: its projection (id, opts) and centre longitude (radians), toClient(X, Y) for a place in the projection's
         * own coordinates → client px and fromClient(x, y) back, the rectangle the frame keeps within (client px: l, t,
         * r, b), the grid's spacing, and a key that changes whenever any of it does. `xRange` [X0, X1]: an
         * equirectangular map that wraps east–west shows one turn there (panned, it may run past its bounds).
         */
        map({ id, opts = {}, centre = 0, toClient, fromClient, xRange = null, rect, spacing, key }) {
            lastGlobeKey = null;
            if (key === lastMapKey) return;
            lastMapKey = key;
            const pr = P[id], b = pr.bounds(opts), width = b[1] - b[0], step = Math.max(5, spacing);
            const [X0, X1] = xRange ?? [b[0], b[1]];
            const insideMap = (x, y) => { const q = fromClient(x, y); if (!q) return false; const [X, Y] = q;
                if (xRange) return X >= X0 && X <= X1 && Y >= b[2] && Y <= b[3]; return X >= b[0] && X <= b[1] && Y >= b[2] && Y <= b[3] && !!pr.inv(X, Y, opts); };
            const copies = []; for (let k = Math.floor((X0 - b[0]) / width); k <= Math.ceil((X1 - b[1]) / width); k++) copies.push(k);
            // the frame: the outline (or the turn shown) clipped to the rectangle
            let polys;
            if (xRange) polys = [[[X0, b[2]], [X1, b[2]], [X1, b[3]], [X0, b[3]]].map(([X, Y]) => toClient(X, Y))];
            else polys = outlineOf(id, opts).map(ring => ring.map(([X, Y]) => toClient(X, Y)));
            const frames = polys.map(p => clipToRect(p, rect)).filter(p => p.length >= 3);
            const W = innerWidth, H = innerHeight;
            let html = `<path class="gf-mat" fill-rule="evenodd" d="M-2 -2H${W + 2}V${H + 2}H-2Z${frames.map(pathOf).join('')}"/>` +
                frames.map(p => `<path class="gf-frame" d="${pathOf(p)}"/>`).join('');
            // the grid lines, on screen, cut where the map does
            const lines = [];
            const trace = (kind, deg, pts) => {
                for (const k of copies) {
                    let seg = [];
                    const flush = () => { if (seg.length > 1) lines.push({ kind, deg, pts: seg }); seg = []; };
                    let prev = null;
                    for (const [l, p] of pts) {
                        const q = pr.fwd(wrap(l - centre), p, opts), X = q && q[0] + k * width;
                        if (!q || X < X0 - 1e-9 || X > X1 + 1e-9) { flush(); prev = null; continue; }
                        const s = toClient(X, q[1]);
                        if (prev && (Math.abs(q[0] - prev[0]) > width * 0.4 || (q[2] ?? 0) !== (prev[2] ?? 0))) flush();
                        seg.push(s); prev = q;
                    }
                    flush();
                }
            };
            for (let lon = -180; lon < 180 - 1e-6; lon += step) {
                const pts = []; for (let lat = -90; lat <= 90; lat += 2) pts.push([lon * D, lat * D]);
                trace('lon', lon, pts);
            }
            for (let lat = -90 + step; lat < 90 - 1e-6; lat += step) {
                const pts = [], c = centre / D; for (let l = -180; l <= 180; l += 2) pts.push([(c + l) * D, lat * D]);
                trace('lat', lat, pts);
            }
            // where each leaves the frame: an end of the line on the map's outline (not inside the map: a pole in the
            // middle), or a crossing of the rectangle's edge
            const exits = [];
            for (const L of lines) {
                const P2 = L.pts;
                for (const [e, n] of [[P2[0], P2[1]], [P2[P2.length - 1], P2[P2.length - 2]]]) {
                    if (!inRect(e, rect)) continue;
                    let dx = e[0] - n[0], dy = e[1] - n[1]; const m = Math.hypot(dx, dy); if (m < 1e-6) continue; dx /= m; dy /= m;
                    if (insideMap(e[0] + dx * 3, e[1] + dy * 3)) continue;
                    exits.push({ kind: L.kind, deg: L.deg, x: e[0], y: e[1], dx, dy, end: true });
                }
                for (let i = 1; i < P2.length; i++) {
                    const a = P2[i - 1], c2 = P2[i], ia = inRect(a, rect), ic = inRect(c2, rect);
                    if (ia === ic) continue;
                    const [o, q] = ia ? [a, c2] : [c2, a];            // (from inside out)
                    let best = null;
                    for (const [t, nx, ny] of [[(rect.l - o[0]) / (q[0] - o[0]), -1, 0], [(rect.r - o[0]) / (q[0] - o[0]), 1, 0], [(rect.t - o[1]) / (q[1] - o[1]), 0, -1], [(rect.b - o[1]) / (q[1] - o[1]), 0, 1]])
                        if (t >= 0 && t <= 1 && (!best || t < best[0])) best = [t, nx, ny];
                    if (best) exits.push({ kind: L.kind, deg: L.deg, x: o[0] + (q[0] - o[0]) * best[0], y: o[1] + (q[1] - o[1]) * best[0], dx: best[1], dy: best[2] });
                }
            }
            // the meridians meeting at a pole on the outline: no tick there (their degrees go inside, below)
            const pole = new Set();
            for (const e of exits) if (e.kind === 'lon' && e.end && exits.filter(o => o.kind === 'lon' && o.end && Math.hypot(o.x - e.x, o.y - e.y) < 6).length >= 3) pole.add(e);
            let ticks = '';
            const cands = [], framed = new Set();
            for (const e of exits) {
                if (pole.has(e)) continue;
                const lab = labelled(e.deg, spacing), len = lab ? 9 : 5;
                ticks += `<line class="gf-tick${lab ? ' gf-tick--long' : ''}" x1="${r1(e.x)}" y1="${r1(e.y)}" x2="${r1(e.x + e.dx * len)}" y2="${r1(e.y + e.dy * len)}"/>`;
                if (!lab) continue;
                framed.add(e.kind + e.deg);
                const text = e.kind === 'lon' ? lonText(e.deg) : latText(e.deg), w = text.length * 6.1 + 4;
                const reach = len + 4 + Math.abs(e.dx) * w / 2 + Math.abs(e.dy) * 7;
                const x = e.x + e.dx * reach, y = e.y + e.dy * reach;
                cands.push({ text, x, y, rank: rank(e.deg), box: boxOf(text, x, y), cls: 'gf-num' });
            }
            // a labelled line that never leaves the frame (meridians meeting at a pole; an azimuthal map's lines, which
            // all end inside it): its degrees on the map itself — a meridian's below the equator, a parallel's beside the
            // central meridian
            const inner = [];
            for (let lon = -180; lon < 180 - 1e-6; lon += step) if (labelled(lon, spacing) && !framed.has('lon' + lon)) inner.push(['lon', lon]);
            for (let lat = -90 + step; lat < 90 - 1e-6; lat += step) if (labelled(lat, spacing) && !framed.has('lat' + lat)) inner.push(['lat', lat]);
            for (const [kind, deg] of inner) {
                const q = kind === 'lon' ? pr.fwd(wrap(deg * D - centre), 0, opts) : pr.fwd(0, deg * D, opts);
                if (!q) continue;
                const text = kind === 'lon' ? lonText(deg) : latText(deg), w = text.length * 6.1 + 4;
                for (const k of copies) {
                    const X = q[0] + k * width; if (X < X0 || X > X1) continue;
                    const s2 = toClient(X, q[1]), x = kind === 'lon' ? s2[0] : s2[0] + w / 2 + 5, y = kind === 'lon' ? s2[1] + 11 : s2[1] - 8;
                    if (!inRect([x, y], rect)) continue;
                    cands.push({ text, x, y, rank: rank(deg) - 0.5, box: boxOf(text, x, y), cls: 'gf-num gf-num--on-map' });
                }
            }
            html += ticks + place(cands).map(l => `<text class="${l.cls}" x="${r1(l.x)}" y="${r1(l.y)}">${l.text}</text>`).join('');
            draw(html, 1, false);
        },

        /** Nothing to frame (no planet yet). */
        hide() { lastMapKey = lastGlobeKey = null; draw('', 0); },
    };
}
