// Generate's own layers on the shared planet view (v2/js/view/planet-view.js; plans/SHARED_CORE_PLAN.md U3): the Plates
// view — each plate that moves in its own hue, its continent light and its ocean dark, each piece (what Ctrl-click raises
// or sinks) a shade of its own, the plate boundaries a band ~60 km wide in the colour of their kind, arrows for the motion
// — the Inspect list's layers of the world's past, and the plate edits pending (and the piece under the pointer while
// editing), drawn over the picture. Colours per region of Generate's mesh (the planet view paints them), lines on the
// picture's equirectangular canvas.

import { makeRng } from './rng.js';

/** The boundaries' colours (sRGB) and names, by kind (v2/js/present/plates.js Boundary). */
export const BOUNDARY_RGB = { 1: [240, 60, 50], 2: [255, 150, 40], 3: [40, 120, 255], 4: [255, 0, 200], 5: [70, 205, 95], 6: [140, 140, 140] };
export const BOUNDARY_NAME = { 1: 'Ridge', 2: 'Rift', 3: 'Trench', 4: 'Collision', 5: 'Transform', 6: 'Inactive seam' };

/** HSL (0…1) → sRGB bytes into out at o. */
function hsl(h, s, l, out, o) {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = t => { t = (t % 1 + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    out[o] = Math.round(255 * f(h + 1 / 3)); out[o + 1] = Math.round(255 * f(h)); out[o + 2] = Math.round(255 * f(h - 1 / 3));
}

/**
 * Each region's colour on the Plates view (sRGB, 3 a region), kept on the world until it changes. `w`: the page's world
 * ({ tMesh, r_plate, plateIsOcean, present: { regionPlate, plates, boundaries } }).
 */
export function plateColors(w) {
    if (w._plateRgb) return w._plateRgb;
    const { tMesh, r_plate, plateIsOcean, present: pr } = w, n = tMesh.numCells, { adjOffset, adjList, xyz } = tMesh, plateOf = pr.regionPlate;
    const rgb = new Uint8Array(3 * n);
    const hues = new Map(), hueOf = p => { if (!hues.has(p)) { const k = pr.plates[p]?.key ?? p; hues.set(p, makeRng(k * 7 + 13)()); } return hues.get(p); };
    const shades = new Map(), pieceShade = id => { if (!shades.has(id)) shades.set(id, makeRng(id + 31)() - 0.5); return shades.get(id); };
    for (let r = 0; r < n; r++) {
        const p = plateOf[r], land = !plateIsOcean.has(r_plate[r]);
        let pieceEdge = false;
        for (let k = adjOffset[r]; k < adjOffset[r + 1]; k++) { const nb = adjList[k]; if (r_plate[nb] !== r_plate[r] && plateOf[nb] === p) { pieceEdge = true; break; } }
        // (each plate's hue from who it is — its first piece — so an edit recolours only the plates it regroups)
        hsl(hueOf(p), land ? 0.36 : 0.5, (land ? 0.56 : 0.27) + 0.07 * pieceShade(r_plate[r]) - (pieceEdge ? 0.05 : 0), rgb, 3 * r);
    }
    // the boundaries: each region touching another plate takes the kind of the nearest classified edge of that pair, then
    // the band is widened to ~60 km (in km: the same at every Detail). The edges' midpoints are in Generate's y-up frame,
    // the mesh's in Evolution's z-up one (x ← z, y ← x, z ← y)
    const B = pr.boundaries, pairs = new Map();
    for (let i = 0; i < B.count; i++) {
        const key = Math.min(B.a[i], B.b[i]) * 1024 + Math.max(B.a[i], B.b[i]);
        if (!pairs.has(key)) pairs.set(key, []);
        pairs.get(key).push(i);
    }
    const kindOf = new Uint8Array(n);
    let front = [];
    for (let r = 0; r < n; r++) {
        const p = plateOf[r];
        let other = false;
        for (let k = adjOffset[r]; k < adjOffset[r + 1]; k++) {
            const q = plateOf[adjList[k]];
            if (q === p) continue;
            const list = pairs.get(Math.min(p, q) * 1024 + Math.max(p, q));
            if (!list) { other = true; continue; }
            let best = -2, kind = 6;
            const gx = xyz[3 * r + 1], gy = xyz[3 * r + 2], gz = xyz[3 * r];
            for (const i of list) { const d = gx * B.mid[3 * i] + gy * B.mid[3 * i + 1] + gz * B.mid[3 * i + 2]; if (d > best) { best = d; kind = B.kind[i]; } }
            kindOf[r] = kind; front.push(r); other = false;
            break;
        }
        if (other && !kindOf[r]) { kindOf[r] = 6; front.push(r); }
    }
    const rings = Math.max(0, Math.round(30 / tMesh.edgeKm) - 1);
    for (let ring = 0; ring < rings; ring++) {
        const next = [];
        for (const r of front) for (let k = adjOffset[r]; k < adjOffset[r + 1]; k++) { const nb = adjList[k]; if (!kindOf[nb]) { kindOf[nb] = kindOf[r]; next.push(nb); } }
        front = next;
    }
    for (let r = 0; r < n; r++) if (kindOf[r]) rgb.set(BOUNDARY_RGB[kindOf[r]], 3 * r);
    return (w._plateRgb = rgb);
}

/**
 * The Plates map for the export, W px wide (× W/2, unrolled): each pixel its nearest region's plate colour ('rgba') or
 * its plate's number ('id', 8-bit) — or its rows y0 … y0 + rows − 1 (an export drawn in bands).
 */
export function platesMap(w, W, kind, y0 = 0, rows = W >> 1) {
    const H = W >> 1, index = w.tMesh.index, rgb = plateColors(w), plateOf = w.present.regionPlate;
    const out = kind === 'rgba' ? new Uint8ClampedArray(4 * W * rows) : new Uint8Array(W * rows);
    for (let j = 0; j < rows; j++) {
        const y = y0 + j, lat = Math.PI / 2 - (y + 0.5) / H * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
        for (let x = 0; x < W; x++) {
            const lon = (x + 0.5) / W * 2 * Math.PI - Math.PI, r = index.nearest(cl * Math.cos(lon), cl * Math.sin(lon), sl), p = j * W + x;
            if (kind === 'rgba') { out[4 * p] = rgb[3 * r]; out[4 * p + 1] = rgb[3 * r + 1]; out[4 * p + 2] = rgb[3 * r + 2]; out[4 * p + 3] = 255; }
            else out[p] = plateOf[r] & 255;
        }
    }
    return out;
}

/** The Plates view's legend: the boundaries by kind, and what the arrows and the edits are. */
export function platesLegendHTML() {
    return `<div class="evo-legend-head">Plates: each moving plate its own hue, continents light, ocean dark; arrows its motion</div><div class="evo-koppen">` +
        Object.entries(BOUNDARY_NAME).map(([k, name]) => `<span><i style="background:rgb(${BOUNDARY_RGB[k].join(',')})"></i>${name}</span>`).join('') + '</div>';
}

// ── the Inspect list's layers of the world's past (the worker's: v2/js/present/… per region off its sim cell) ──
const PAST_KIND_RGB = [[0, 0, 0], [214, 96, 60], [200, 140, 70], [150, 120, 190], [230, 70, 150], [90, 170, 220], [250, 170, 60], [120, 200, 120], [180, 180, 90]];
const PAST_KIND_NAME = ['', 'Andean margin', 'Laramide belt', 'old belt', 'collision belt', 'island arc', 'rift', 'transpression ridge', 'intraplate range'];
/** A ramp 0…1 → sRGB (dark blue → teal → yellow). */
function ramp(t, out, o) {
    t = Math.max(0, Math.min(1, t));
    const stops = [[24, 30, 80], [30, 120, 150], [120, 190, 110], [250, 225, 90]], x = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(x)), f = x - i;
    for (let c = 0; c < 3; c++) out[o + c] = Math.round(stops[i][c] + (stops[i + 1][c] - stops[i][c]) * f);
}
/** The Inspect layers: their ids, names, legends and colours (`v` the worker's per-region values; sea regions greyed). */
export const INSPECT = {
    presentFloorAge: { name: 'Sea-floor age', legend: 'Sea-floor age: young at the ridges (dark) to 200 Myr (yellow)', color: (v, r, out, o) => ramp(v / 200, out, o) },
    presentBeltKind: { name: 'Mountain belts by kind', legend: PAST_KIND_NAME.slice(1).map((n, k) => `<span><i style="background:rgb(${PAST_KIND_RGB[k + 1].join(',')})"></i>${n}</span>`).join(''),
        color: (v, r, out, o) => { if (v > 0) out.set(PAST_KIND_RGB[v] ?? PAST_KIND_RGB[3], o); else out.set([40, 44, 56], o); } },
    presentBeltAge: { name: 'Mountain belts by age', legend: 'Mountain belts by age: active now (yellow) to 2000 Myr (dark)', color: (v, r, out, o, kind) => { if (kind) ramp(1 - Math.min(1, Math.sqrt(v / 2000)), out, o); else out.set([40, 44, 56], o); } },
    presentCraton: { name: 'Cratons', legend: '<span><i style="background:rgb(230,200,120)"></i>Craton (ancient shield)</span>', color: (v, r, out, o) => out.set(v ? [230, 200, 120] : [40, 44, 56], o) },
};
/** An Inspect layer's colours per region, shaded by the relief (as the plates). */
export function inspectColors(id, w, out, shade) {
    const L = INSPECT[id], vals = w.inspect?.[id];
    if (!L || !vals) return false;
    const kind = w.inspect.presentBeltKind;
    for (let r = 0; r < vals.length; r++) {
        L.color(vals[r], r, out, 3 * r, kind?.[r]);
        const k = 0.45 + 0.55 * shade[r];
        for (let c = 0; c < 3; c++) out[3 * r + c] = Math.min(255, out[3 * r + c] * k);
    }
    return true;
}

// ── lines over the picture: the plates' motion arrows (on the Plates view), the edits pending and the piece under the
// pointer while editing ──
/** Equirectangular x, y (W px wide) of a unit vector in Generate's y-up frame. */
const atY = (x, y, z, W) => [(Math.atan2(x, z) + Math.PI) / (2 * Math.PI) * W, (Math.PI / 2 - Math.asin(Math.max(-1, Math.min(1, y)))) / Math.PI * (W >> 1)];

/** The plates' motion arrows, as segments in Generate's frame (the worker's anchors, each its plate's velocity). */
function arrowSegments(w) {
    if (w._arrows) return w._arrows;
    const pr = w.present, segs = [];
    if (!pr?.arrows) return (w._arrows = segs);
    const { pts, plate } = pr.arrows, nrm = a => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };
    for (let k = 0; k < plate.length; k++) {
        const p = [pts[3 * k], pts[3 * k + 1], pts[3 * k + 2]], e = pr.plates[plate[k]].euler;
        const v = [e[1] * p[2] - e[2] * p[1], e[2] * p[0] - e[0] * p[2], e[0] * p[1] - e[1] * p[0]], vl = Math.hypot(v[0], v[1], v[2]);
        if (vl < 1e-12) continue;
        const cm = vl * 6371 / 10, t = [v[0] / vl, v[1] / vl, v[2] / vl], L = 0.02 + 0.015 * cm;     // (radians: 9 cm/yr ≈ 1000 km)
        const s = [p[1] * t[2] - p[2] * t[1], p[2] * t[0] - p[0] * t[2], p[0] * t[1] - p[1] * t[0]];
        const end = nrm([p[0] + t[0] * L, p[1] + t[1] * L, p[2] + t[2] * L]);
        const h1 = nrm([end[0] - t[0] * 0.35 * L + s[0] * 0.18 * L, end[1] - t[1] * 0.35 * L + s[1] * 0.18 * L, end[2] - t[2] * 0.35 * L + s[2] * 0.18 * L]);
        const h2 = nrm([end[0] - t[0] * 0.35 * L - s[0] * 0.18 * L, end[1] - t[1] * 0.35 * L - s[1] * 0.18 * L, end[2] - t[2] * 0.35 * L - s[2] * 0.18 * L]);
        segs.push([p, end], [end, h1], [end, h2]);
    }
    return (w._arrows = segs);
}

/** The regions of each piece, kept on the world. */
function piecesOf(w) {
    if (w._pieces) return w._pieces;
    const m = new Map(), rp = w.r_plate;
    for (let r = 0; r < rp.length; r++) { let a = m.get(rp[r]); if (!a) m.set(rp[r], a = []); a.push(r); }
    return (w._pieces = m);
}

// ── the edits drawn over the picture, as the old page drew them on its mesh: the piece under the pointer while editing
// lightened, each piece whose edit waits for Rebuild tinted by what it will become (green: raised to land; blue: sunk),
// the ground showing through. Each piece is a mask on the picture's grid, its pixels the ones whose nearest region is
// the piece's — so it follows the piece's own outline, not a scatter of squares. ──
const MASK_W = 4096;                                  // (the masks' grid: ~10 km a pixel at the equator; the overlay's width)
const EDIT_TINT = { raise: [70, 230, 110], sink: [30, 100, 255], hover: [255, 255, 255] };
const EDIT_ALPHA = { pending: 0.38, hover: 0.22 };

/** A piece's mask: its box on the MASK_W grid (x0 may be negative, x1 past the edge: a piece across the date line) and,
 *  per pixel of the box, whether it is the piece's. Kept on the world. */
function pieceMask(w, id) {
    const masks = (w._masks ??= new Map());
    if (masks.has(id)) return masks.get(id);
    const regs = piecesOf(w).get(id);
    if (!regs) { masks.set(id, null); return null; }
    const { xyz, index, numCells } = w.tMesh, H = MASK_W >> 1, rp = w.r_plate, TAU = 2 * Math.PI;
    // (its longitudes, unwrapped from the widest gap between them; its latitudes; a margin of two cells round them)
    const lons = new Float64Array(regs.length);
    let lat0 = Infinity, lat1 = -Infinity;
    for (let i = 0; i < regs.length; i++) {
        const r = regs[i], lat = Math.asin(Math.max(-1, Math.min(1, xyz[3 * r + 2])));
        lons[i] = Math.atan2(xyz[3 * r + 1], xyz[3 * r]);
        if (lat < lat0) lat0 = lat; if (lat > lat1) lat1 = lat;
    }
    lons.sort();
    let gap = lons[0] + TAU - lons[lons.length - 1], start = lons[0];
    for (let i = 1; i < lons.length; i++) if (lons[i] - lons[i - 1] > gap) { gap = lons[i] - lons[i - 1]; start = lons[i]; }
    const pad = 2 * Math.sqrt(4 * Math.PI / numCells), padLon = pad / Math.max(0.05, Math.cos(Math.max(Math.abs(lat0), Math.abs(lat1)) + pad));
    let x0 = Math.floor((start - padLon + Math.PI) / TAU * MASK_W), x1 = Math.ceil((start + TAU - gap + padLon + Math.PI) / TAU * MASK_W);
    if (x1 - x0 >= MASK_W || lat1 + pad >= Math.PI / 2 || lat0 - pad <= -Math.PI / 2) { x0 = 0; x1 = MASK_W; }
    const y0 = Math.max(0, Math.floor((Math.PI / 2 - lat1 - pad) / Math.PI * H)), y1 = Math.min(H, Math.ceil((Math.PI / 2 - lat0 + pad) / Math.PI * H));
    const bw = x1 - x0, bh = y1 - y0, on = new Uint8Array(bw * bh);
    for (let j = 0; j < bh; j++) {
        const lat = Math.PI / 2 - (y0 + j + 0.5) / H * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
        for (let i = 0; i < bw; i++) {
            const lon = (x0 + i + 0.5) / MASK_W * TAU - Math.PI;
            if (rp[index.nearest(cl * Math.cos(lon), cl * Math.sin(lon), sl)] === id) on[j * bw + i] = 1;
        }
    }
    const m = { x0, y0, bw, bh, on };
    masks.set(id, m);
    return m;
}

/** A mask as a canvas in one colour (the last few kept: a piece hovered again draws at once). */
const maskCanvases = new Map();
function maskCanvas(m, rgb) {
    const key = rgb.join(',');
    let byColour = maskCanvases.get(m);
    if (!byColour) { if (maskCanvases.size >= 24) maskCanvases.delete(maskCanvases.keys().next().value); maskCanvases.set(m, byColour = new Map()); }
    let c = byColour.get(key);
    if (c) return c;
    c = document.createElement('canvas'); c.width = m.bw; c.height = m.bh;
    const g = c.getContext('2d'), img = g.createImageData(m.bw, m.bh), d = img.data;
    for (let i = 0; i < m.on.length; i++) if (m.on[i]) { d[4 * i] = rgb[0]; d[4 * i + 1] = rgb[1]; d[4 * i + 2] = rgb[2]; d[4 * i + 3] = 255; }
    g.putImageData(img, 0, 0);
    byColour.set(key, c);
    return c;
}

/** A piece tinted on the picture (W px wide), its ground showing through. */
function tintPiece(ctx, w, id, W, rgb, alpha) {
    const m = pieceMask(w, id);
    if (!m) return;
    const c = maskCanvas(m, rgb), s = W / MASK_W, x = m.x0 * s, y = m.y0 * s, cw = m.bw * s, ch = m.bh * s;
    ctx.save(); ctx.globalAlpha = alpha; ctx.imageSmoothingEnabled = true;
    for (const dx of [0, -W, W]) if (x + dx < W && x + dx + cw > 0) ctx.drawImage(c, x + dx, y, cw, ch);
    ctx.restore();
}

/**
 * The page's lines over the picture (planet-view.js extraLines), W px wide: on the Plates view the motion arrows; on every
 * view the pieces whose edit is pending (tinted by what they will become) and the piece under the pointer while editing
 * (lightened).
 */
export function drawPlateLines(ctx, W, view, w, { pending, hovered }) {
    if (!w) return;
    if (view.layer === 'plates') {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.4; ctx.beginPath();
        for (const [a, b] of arrowSegments(w)) {
            const A = atY(a[0], a[1], a[2], W), Bp = atY(b[0], b[1], b[2], W);
            if (Math.abs(A[0] - Bp[0]) > W / 2) continue;                       // (across the map's edge)
            ctx.moveTo(A[0], A[1]); ctx.lineTo(Bp[0], Bp[1]);
        }
        ctx.stroke(); ctx.restore();
    }
    for (const id of pending) tintPiece(ctx, w, id, W, w.plateIsOcean.has(id) ? EDIT_TINT.raise : EDIT_TINT.sink, EDIT_ALPHA.pending);
    if (hovered >= 0) tintPiece(ctx, w, hovered, W, EDIT_TINT.hover, EDIT_ALPHA.hover);
}
