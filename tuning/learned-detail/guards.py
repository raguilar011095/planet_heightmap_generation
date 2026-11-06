"""
Phase 0 of plans/TERRAIN_DIFFUSION_EXPLORATION.md: the guards of its §5 applied to a learned patch (patches.py), on top of today's
detail finer than the mesh (fine-windows.mjs; the picture enlarged, the base, shown too) — all on the patch's 720 m pixels —
with measurements and a four-panel render for each patch: base | today's detail | the model raw | the model with the guards.

  python guards.py <orogenDir> <workDir> [--mode light|strict] [--sigma-km 12]
  python guards.py <orogenDir> <workDir> --sweep        variants of the light guards, a sheet per patch (renders/<patch>-sweep.png)

  light (the default; the owner's call after the strict renders): the raw model kept below the mesh's scale, its coarsest
  band ours (σ 30 km), today's inland land lifted above the sea where the model drowned it, each river snapped to the model's
  nearest valley and made to descend. strict: §5 as first written, the model's high band gated on top of today's detail.
"""
import sys, json, math, os
import numpy as np
from scipy import ndimage as ndi
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from patches import gnomonic_grid, CELL_KM, DOWN, OUT_PX, R_KM

PXKM = CELL_KM / (OUT_PX / DOWN)        # 0.71875 km a pixel
LOCK_SIGMA_KM = 30                      # light mode: only the band coarser than this (the mesh's cell at 640K) is held to ours; the model keeps all below
LIFT_KM = 12                            # light mode: today's land farther than this from its coast (an island's core) is kept above the sea, lifted gently, not clipped; nearer, the model's bays and straits stand
RIVER_CORRIDOR_PX = 7                   # light mode: a river may move this far (5 km) to follow the model's own valley
COAST_KM = 12                           # how far a coast may wander: the model's coastline within this of today's
COAST_SIGMA_KM = 5                      # …its coastline's shape taken down to this scale (its low band below it is today's)
ISLAND_CORE = 0.35                      # an island keeps the part of it farther from its shore than this share of its widest
ISLAND_KM2 = 20000                      # an island, for the hold and the count: a landmass smaller than this (Sicily is 25,700 km²)
smooth = lambda a, b, x: (lambda t: t * t * (3 - 2 * t))(np.clip((x - a) / (b - a), 0, 1))

def forward_gnomonic(lat, lon, lat0, lon0):
    """Tangent-plane coordinates (radians of arc; x east, y north) of lat, lon (degrees) about lat0, lon0."""
    la, lo, la0, lo0 = map(np.radians, (lat, lon, lat0, lon0))
    cosc = np.sin(la0) * np.sin(la) + np.cos(la0) * np.cos(la) * np.cos(lo - lo0)
    return np.cos(la) * np.sin(lo - lo0) / cosc, (np.cos(la0) * np.sin(la) - np.sin(la0) * np.cos(la) * np.cos(lo - lo0)) / cosc, cosc

def window_sample(a, win, lat, lon, nearest=False):
    """A window's array (h × w at W, from x0, y0) sampled at lat, lon (degrees)."""
    W = win['W']; u = (lon + 180) / 360 * W - win['x0'] - 0.5; v = (90 - lat) / 180 * (W // 2) - win['y0'] - 0.5
    h, w = a.shape
    if nearest:
        return a[np.clip(np.rint(v).astype(int), 0, h - 1), np.clip(np.rint(u).astype(int), 0, w - 1)]
    x0 = np.clip(np.floor(u).astype(int), 0, w - 2); y0 = np.clip(np.floor(v).astype(int), 0, h - 2)
    fx = np.clip(u - x0, 0, 1); fy = np.clip(v - y0, 0, 1)
    return (1 - fx) * (1 - fy) * a[y0, x0] + fx * (1 - fy) * a[y0, x0 + 1] + (1 - fx) * fy * a[y0 + 1, x0] + fx * fy * a[y0 + 1, x0 + 1]

def slope_of(h):
    gy, gx = np.gradient(h, PXKM)
    return np.hypot(gx, gy)

def d8_accumulation(h):
    """D8 flow accumulation (cells) on a height grid: each cell drains to its lowest of eight neighbours; pits keep theirs."""
    H, W = h.shape; best = np.full((H, W), -1, np.int64); bestdrop = np.zeros((H, W))
    flat = h.ravel(); idx = np.arange(H * W).reshape(H, W)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dy == 0 and dx == 0: continue
            sh = np.roll(np.roll(h, -dy, 0), -dx, 1); nb = np.roll(np.roll(idx, -dy, 0), -dx, 1)
            drop = (h - sh) / math.hypot(dy, dx)
            ok = drop > bestdrop
            # (no wrap across the edges)
            if dy == 1: ok[-1, :] = False
            if dy == -1: ok[0, :] = False
            if dx == 1: ok[:, -1] = False
            if dx == -1: ok[:, 0] = False
            bestdrop = np.where(ok, drop, bestdrop); best = np.where(ok, nb, best)
    acc = np.ones(H * W); order = np.argsort(-flat, kind='stable'); b = best.ravel()
    for p in order:
        q = b[p]
        if q >= 0: acc[q] += acc[p]
    return acc.reshape(H, W)

def river_pixels(rivers, p, N):
    """The reaches crossing the patch: each as (rows, cols, q), densified to about a pixel, source to mouth (by the base's fall)."""
    lat = np.asarray(rivers['lat']); lon = np.asarray(rivers['lon']); q = np.asarray(rivers['q']); start = np.asarray(rivers['start'])
    x, y, cosc = forward_gnomonic(lat, lon, p['lat0'], p['lon0'])
    col = x * R_KM / PXKM + (N - 1) / 2; row = (N - 1) / 2 - y * R_KM / PXKM
    inside = (cosc > 0) & (col >= -2) & (col <= N + 1) & (row >= -2) & (row <= N + 1)
    out = []
    for k in range(len(start) - 1):
        a, b = start[k], start[k + 1]
        if b - a < 2 or not inside[a:b].any(): continue
        rr, cc, qq = [], [], []
        for i in range(a, b - 1):
            n = max(1, int(math.ceil(math.hypot(row[i + 1] - row[i], col[i + 1] - col[i]))))
            t = np.arange(n) / n
            rr.append(row[i] + t * (row[i + 1] - row[i])); cc.append(col[i] + t * (col[i + 1] - col[i])); qq.append(np.full(n, max(q[i], q[i + 1])))
        rr.append([row[b - 1]]); cc.append([col[b - 1]]); qq.append([q[b - 1]])
        out.append((np.concatenate(rr), np.concatenate(cc), np.concatenate(qq)))
    return out

def along(h, rr, cc):
    N = h.shape[0]
    return h[np.clip(np.rint(rr).astype(int), 0, N - 1), np.clip(np.rint(cc).astype(int), 0, N - 1)]

def river_ascents(h, reaches, base):
    """Of the steps along the reaches (downstream by the base's fall), the share that climb more than 2 m, and the biggest climb (m)."""
    climbs, steps = 0, 0; worst = 0.0
    for reach in reaches:
        if reach is None: continue
        rr, cc, qq = reach
        v = along(h, rr, cc); vb = along(base, rr, cc)
        if len(v) < 2: continue
        if vb[0] < vb[-1]: v = v[::-1]
        d = np.diff(v) * 1000
        climbs += int((d > 2).sum()); steps += len(d); worst = max(worst, float(d.max()))
    return (climbs / steps if steps else 0.0), worst, steps

def carve_river_beds(h, base, reaches, N):
    """Guard 2: each reach's bed monotone descending (never above the base), the pixels about it lowered to it with a soft V."""
    out = h.copy()
    bed = np.full((N, N), np.inf); rad = np.zeros((N, N))
    for rr, cc, qq in reaches:
        ri = np.clip(np.rint(rr).astype(int), 0, N - 1); ci = np.clip(np.rint(cc).astype(int), 0, N - 1)
        vb = base[ri, ci]; v = out[ri, ci]
        rev = vb[0] < vb[-1]
        if rev: ri, ci, vb, v, qq = ri[::-1], ci[::-1], vb[::-1], v[::-1], qq[::-1]
        b = np.minimum(v, vb).copy()
        for i in range(1, len(b)): b[i] = min(b[i], b[i - 1] - 1e-5)
        r = np.clip(0.5 * np.log10(np.maximum(qq, 1)), 1, 4)
        np.minimum.at(bed, (ri, ci), b); np.maximum.at(rad, (ri, ci), r)
    # the soft V: out ≤ bed + k·distance, within each river pixel's radius (a chamfer of small radius)
    K = 0.02                                                     # km a pixel: ~28 m per km, a gentle valley side
    ys, xs = np.nonzero(np.isfinite(bed))
    for y, x in zip(ys, xs):
        r = int(math.ceil(rad[y, x])); y0, y1, x0, x1 = max(0, y - r), min(N, y + r + 1), max(0, x - r), min(N, x + r + 1)
        dy, dx = np.mgrid[y0:y1, x0:x1]; d = np.hypot(dy - y, dx - x)
        lim = bed[y, x] + K * d
        sub = out[y0:y1, x0:x1]; m = d <= rad[y, x]
        sub[m] = np.minimum(sub[m], lim[m])
    return out

LIGHT = {
    'lockKm': LOCK_SIGMA_KM,    # only the band coarser than this is ours
    'liftKm': LIFT_KM,          # today's land farther than this from its shore is kept above the sea
    'liftTexture': 1.0,         # lifted ground (the model's smooth sea floor raised) gets this much of today's procedural high band, so it is not bald
    'corridorPx': RIVER_CORRIDOR_PX,   # a river may move this far to follow the model's valley
    'linePull': 1.5,            # how dearly a routed river leaves its line (per step, at the corridor's edge)
    'vK': 0.01,                 # the shallow valley cut where the model had none: km a pixel of its sides
    'vRmax': 5,                 # …and its widest (pixels)
    'smooth': 3,                # Chaikin passes on the routed lines
}

def light_guards(learned, fine, fine_sea, reaches, N, P):
    """§5's light guards (plans/TERRAIN_DIFFUSION_EXPLORATION.md): the model kept whole below P.lockKm, today's land beyond
    P.liftKm of its shore (and under its rivers) lifted above the sea where the model drowned it — with today's procedural
    texture where the model's sea floor came up bald — and the rivers re-routed along the model's valleys within P.corridorPx
    of their lines and made to descend. Returns (heights, sea, the routed reaches)."""
    GL = lambda a: ndi.gaussian_filter(a, P['lockKm'] / PXKM, mode='nearest')
    out = learned - GL(learned) + GL(fine)
    dist = ndi.distance_transform_edt(~fine_sea) * PXKM if fine_sea.any() else np.full((N, N), np.inf)
    # the lift, feathered: nothing within 0.6 × liftKm of today's shore (the model's coast decides there), all beyond 1.6 ×
    # (an island's core), a smooth ramp between — so the shoreline is the model's everywhere, only raised toward the core,
    # and no edge of today's outline is traced (a hard mask at a fixed offset drew one, and strips held under the rivers
    # drew square tongues)
    w = smooth(0.6 * P['liftKm'], 1.6 * P['liftKm'], dist) * (~fine_sea)
    deficit = w * np.maximum(0, 0.004 - out)
    lift = ndi.gaussian_filter(ndi.maximum_filter(deficit, size=7), 3, mode='nearest')
    out = out + lift
    core = (~fine_sea) & (dist > 1.6 * P['liftKm'])
    out = np.where(core, np.maximum(out, 0.002), out)
    # an island the model sank whole (no land left of it): its core held above the sea whatever the model drew
    lab, n = ndi.label(~fine_sea)
    for k in range(1, n + 1):
        m = lab == k
        if m.sum() * PXKM * PXKM >= ISLAND_KM2 or (out[m] > 0).any(): continue
        ck = m & (dist > 0.35 * dist[m].max()); out[ck] = np.maximum(out[ck], 0.002); lift[ck] = np.maximum(lift[ck], 0.03)
    if P['liftTexture'] > 0:
        # (the model's sea floor raised is bald: today's procedural detail's high band laid on it, by how much was lifted)
        wl = smooth(0.0, 0.03, lift)
        Gt = lambda a: ndi.gaussian_filter(a, 6 / PXKM, mode='nearest')
        out = out + P['liftTexture'] * wl * (fine - Gt(fine))
    routed = river_route(out, reaches, N, corridor=P['corridorPx'], pull=P['linePull'], passes=P['smooth'], sea=out <= 0)
    routed = clip_at_sea(routed, out <= 0, N)
    out = river_corridor_carve(out, routed, N, K=P['vK'], rmax=P['vRmax'])
    return out, out <= 0, routed

def clip_at_sea(reaches, sea, N):
    """Each reach cut where it first enters the sea (downstream: from its higher end), a point into it; one wholly at sea dropped."""
    out = []
    for reach in reaches:
        if reach is None: out.append(None); continue
        rr, cc, qq = reach
        ri = np.clip(np.rint(rr).astype(int), 0, N - 1); ci = np.clip(np.rint(cc).astype(int), 0, N - 1)
        at_sea = sea[ri, ci]
        if at_sea.all(): out.append(None); continue
        if not at_sea.any(): out.append((rr, cc, qq)); continue
        land_idx = np.nonzero(~at_sea)[0]
        a, b = land_idx[0], land_idx[-1]
        lo, hi = max(0, a - 1), min(len(rr) - 1, b + 1)
        out.append((rr[lo:hi + 1], cc[lo:hi + 1], qq[lo:hi + 1]))
    return out

def river_route(h, reaches, N, corridor=None, pull=1.5, passes=2, sea=None):
    """Light mode's rivers, "loosely in the same spot and going in the same direction": each reach re-routed between its ends
    along the least-cost path through the model's heights within a corridor about its line (cost: height above the corridor's
    floor, climbs dearly), so it follows the model's own valleys where there are any. Returns the routed reaches."""
    import heapq
    corridor = corridor or RIVER_CORRIDOR_PX
    yy, xx = np.mgrid[0:N, 0:N]
    out = []
    for rr, cc, qq in reaches:
        ri = np.clip(np.rint(rr).astype(int), 0, N - 1); ci = np.clip(np.rint(cc).astype(int), 0, N - 1)
        # the corridor: pixels within `corridor` of any point of the line
        mask = np.zeros((N, N), bool); mask[ri, ci] = True
        mask = ndi.binary_dilation(mask, iterations=corridor)
        if sea is not None:
            # (the sea is not a valley: kept out of the corridor, except about the reach's lower end, where its mouth may be)
            lo_end = (ri[-1], ci[-1]) if h[ri[0], ci[0]] >= h[ri[-1], ci[-1]] else (ri[0], ci[0])
            near = np.zeros((N, N), bool); near[lo_end] = True; near = ndi.binary_dilation(near, iterations=corridor)
            mask &= (~sea) | near
            mask[ri[0], ci[0]] = True; mask[ri[-1], ci[-1]] = True
        ys, xs = np.nonzero(mask); floor = h[mask].min()                   # (the corridor's lowest, its mouth's sea included: no step costs less than nothing)
        idx = {(y, x): k for k, (y, x) in enumerate(zip(ys, xs))}
        line = np.ones((N, N), bool); line[ri, ci] = False
        dline = ndi.distance_transform_edt(line) / corridor                   # 0 on the line … 1 at the corridor's edge
        a, b = (ri[0], ci[0]), (ri[-1], ci[-1])
        if h[a] < h[b]: a, b = b, a                                          # from the higher end down
        dist = {a: 0.0}; prev = {}; pq = [(0.0, a)]
        while pq:
            d, u = heapq.heappop(pq)
            if u == b: break
            if d > dist.get(u, np.inf): continue
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    if not dy and not dx: continue
                    v = (u[0] + dy, u[1] + dx)
                    if v not in idx: continue
                    step = math.hypot(dy, dx)
                    cost = step * (0.2 + max(0.0, h[v] - floor) * 10 + pull * dline[v]) + 40 * max(0.0, h[v] - h[u])   # km above the floor, the line's pull, climbs ×40
                    nd = d + cost
                    if nd < dist.get(v, np.inf): dist[v] = nd; prev[v] = u; heapq.heappush(pq, (nd, v))
        if b not in prev: out.append((rr, cc, qq)); continue
        path = [b]
        while path[-1] != a: path.append(prev[path[-1]])
        path = path[::-1]
        pr = np.array([p[0] for p in path], float); pc = np.array([p[1] for p in path], float)
        for _ in range(passes):                                              # Chaikin's corner cutting: the stairs of the 8-connected path smoothed, the ends kept
            if len(pr) < 3: break
            qr = np.empty(2 * len(pr) - 2); qc = np.empty(2 * len(pr) - 2)
            qr[0::2] = 0.75 * pr[:-1] + 0.25 * pr[1:]; qr[1::2] = 0.25 * pr[:-1] + 0.75 * pr[1:]
            qc[0::2] = 0.75 * pc[:-1] + 0.25 * pc[1:]; qc[1::2] = 0.25 * pc[:-1] + 0.75 * pc[1:]
            pr = np.concatenate([[pr[0]], qr, [pr[-1]]]); pc = np.concatenate([[pc[0]], qc, [pc[-1]]])
        out.append((pr, pc, np.full(len(pr), float(qq.max()))))
    return out

def river_corridor_carve(h, reaches, N, K=0.01, rmax=5):
    """Light mode's rivers: each reach snapped to the lowest ground within its corridor (the model's own valley, where there is one
    nearby), its bed monotone descending, the ground about it lowered to the bed with a wide shallow V (K km a pixel)."""
    out = h.copy(); bed = np.full((N, N), np.inf); rad = np.zeros((N, N))
    yy, xx = np.mgrid[0:N, 0:N]
    for reach in reaches:
        if reach is None: continue
        rr, cc, qq = reach
        ri = np.clip(np.rint(rr).astype(int), 0, N - 1); ci = np.clip(np.rint(cc).astype(int), 0, N - 1)
        r = np.clip(0.5 * np.log10(np.maximum(qq, 1)), 1.5, rmax)
        v = np.empty(len(ri))
        for i in range(len(ri)):
            R = int(math.ceil(r[i])); y0, y1, x0, x1 = max(0, ri[i] - R), min(N, ri[i] + R + 1), max(0, ci[i] - R), min(N, ci[i] + R + 1)
            v[i] = out[y0:y1, x0:x1].min()                                                  # the corridor's lowest: "loosely in the same spot"
        if v[0] < v[-1]: ri, ci, v, r = ri[::-1], ci[::-1], v[::-1], r[::-1]                 # downstream by the model's own fall
        b = v.copy()
        for i in range(1, len(b)): b[i] = min(b[i], b[i - 1] - 1e-5)
        np.minimum.at(bed, (ri, ci), b); np.maximum.at(rad, (ri, ci), r)
    ys, xs = np.nonzero(np.isfinite(bed))
    for y, x in zip(ys, xs):
        R = int(math.ceil(rad[y, x])); y0, y1, x0, x1 = max(0, y - R), min(N, y + R + 1), max(0, x - R), min(N, x + R + 1)
        d = np.hypot(yy[y0:y1, x0:x1] - y, xx[y0:y1, x0:x1] - x); m = d <= rad[y, x]
        sub = out[y0:y1, x0:x1]; sub[m] = np.minimum(sub[m], bed[y, x] + K * d[m])
    return out

def hillshade_rgb(h, sea, rivers_px, title, scale=2):
    N = h.shape[0]
    gy, gx = np.gradient(h, PXKM)
    shade = np.clip(0.55 + 0.9 * (gx - gy) / (1 + 2 * np.hypot(gx, gy)), 0.15, 1)
    hl = np.clip(h, 0, 4)
    col = np.stack([0.42 + 0.5 * hl / 4, 0.55 - 0.25 * hl / 4, 0.32 + 0.1 * hl / 4], -1)
    col = np.where(hl[..., None] > 2.8, np.array([0.9, 0.9, 0.92]) * (0.7 + 0.3 * (hl[..., None] - 2.8) / 1.2), col)
    rgb = np.clip(col * shade[..., None], 0, 1)
    depth = np.clip(-h, 0, 5) / 5
    seacol = np.stack([0.18 - 0.1 * depth, 0.36 - 0.18 * depth, 0.62 - 0.25 * depth], -1)
    rgb = np.where(sea[..., None], seacol, rgb)
    im = Image.fromarray((rgb * 255).astype(np.uint8)).resize((N * scale, N * scale), Image.NEAREST)
    d = ImageDraw.Draw(im)
    for reach in rivers_px:
        if reach is None: continue
        rr, cc, qq = reach
        pts = list(zip((cc + 0.5) * scale, (rr + 0.5) * scale))
        if len(pts) > 1: d.line(pts, fill=(80, 190, 255), width=1 if qq.max() < 3000 else 2)
    d.rectangle([0, 0, 8 * len(title) + 10, 16], fill=(0, 0, 0)); d.text((5, 2), title, fill=(255, 255, 255))
    return im

def main(orogen, work, sigma_km, mode):
    rivers = json.load(open(f'{orogen}/rivers.json'))
    results = {}
    for name in sorted(os.listdir(f'{work}/patches')):
        d = f'{work}/patches/{name}'
        if not os.path.exists(f'{d}/elev720m.npy'): continue
        p = json.load(open(f'{d}/patch.json')); learned = np.load(f'{d}/elev720m.npy') / 1000; N = learned.shape[0]
        lat, lon = gnomonic_grid(p['lat0'], p['lon0'], N, PXKM)
        wd = f'{orogen}/windows/{name}'; win = json.load(open(f'{wd}/window.json')); h, w = win['h'], win['w']
        rd = lambda f, t: np.fromfile(f'{wd}/{f}', t).reshape(h, w)
        base = window_sample(rd('base_h.f32', np.float32), win, lat, lon); base_sea = window_sample(rd('base_sea.u8', np.uint8), win, lat, lon, nearest=True).astype(bool)
        fine = window_sample(rd('fine_h.f32', np.float32), win, lat, lon); fine_sea = window_sample(rd('fine_sea.u8', np.uint8), win, lat, lon, nearest=True).astype(bool)
        reaches = river_pixels(rivers, p, N)
        sig = sigma_km / PXKM
        G = lambda a: ndi.gaussian_filter(a, sig, mode='nearest')
        if mode == 'light':
            out, out_sea, routed = light_guards(learned, fine, fine_sea, reaches, N, LIGHT)
            lab, n = ndi.label(~fine_sea); sizes = ndi.sum(~fine_sea, lab, index=np.arange(1, n + 1)) * PXKM * PXKM
            gate = np.ones((N, N)); dist = ndi.distance_transform_edt(~fine_sea) * PXKM if fine_sea.any() else np.full((N, N), np.inf)
            hold_land = (~fine_sea) & (dist > LIGHT['liftKm']); hold_sea = np.zeros((N, N), bool); raw_sea = learned <= 0
            reaches_drawn = routed; label4 = 'Terrain Diffusion, light guards'
        else:
          label4 = 'today + Terrain Diffusion, guarded'; reaches_drawn = reaches
          # ── the guards (the owner, 2026-11-06: the learned detail goes on top of the procedural detail — `fine`, today's surface,
          # is the ground it is added to and the ground the locks refer to) ──
          hp = learned - G(learned)                                                       # guard 1: only the high band is the model's
          slope = slope_of(base)
          rug = ndi.maximum_filter(base, size=int(20 / PXKM) | 1) - ndi.minimum_filter(base, size=int(20 / PXKM) | 1)
          gate = 0.1 + 0.9 * smooth(0.012, 0.05, slope) * smooth(0.12, 0.7, rug)         # guard 5: the procedural gullies' gate
          out = fine + gate * hp
          out = out - G(out) + G(fine)                                                    # guard 1 again, as a guarantee: today's low band
          # guard 4, loosened (the owner, 2026-11-06: coasts and islands may change shape "quite a bit, just not that
          # aggressively"): within COAST_KM of today's coast the model's own coastline comes through — its heights relative to
          # its low band at a finer scale (σ COAST_SIGMA_KM) on today's low band, blended in by nearness to the coast — so bays,
          # headlands and islets form where it drew them; beyond the band the land and the sea are today's; each island keeps
          # its core (the inner part of it, by distance from its shore) whatever the model drew, so none sinks
          dist = ndi.distance_transform_edt(~fine_sea) * PXKM if fine_sea.any() else np.full((N, N), np.inf)      # (no sea in the window: no coast)
          dsea = ndi.distance_transform_edt(fine_sea) * PXKM if (~fine_sea).any() else np.full((N, N), np.inf)
          Gc = lambda a: ndi.gaussian_filter(a, COAST_SIGMA_KM / PXKM, mode='nearest')
          coastMix = learned - Gc(learned) + Gc(fine)
          wcoast = 1 - smooth(0, COAST_KM, np.maximum(dist, dsea))        # (each pixel's distance to the coast: on land dist, at sea dsea; the other is 0)
          out = (1 - wcoast) * out + wcoast * coastMix
          lab, n = ndi.label(~fine_sea); sizes = ndi.sum(~fine_sea, lab, index=np.arange(1, n + 1)) * PXKM * PXKM
          small = np.isin(lab, 1 + np.where(sizes < ISLAND_KM2)[0])
          core = np.zeros((N, N), bool)
          for k in np.where(sizes < ISLAND_KM2)[0] + 1:
              m = lab == k; core |= m & (dist > max(PXKM, ISLAND_CORE * dist[m].max()))
          hold_land = (dist > COAST_KM) | core; hold_sea = dsea > COAST_KM
          out = np.where(hold_land, np.maximum(out, 0.005), out); out = np.where(hold_sea, np.minimum(out, -0.005), out)
          out = carve_river_beds(out, fine, reaches, N)                                   # guard 2: rivers run downhill, never above today's bed
          out_sea = np.where(hold_land, False, np.where(hold_sea, True, out <= 0))
          raw_sea = learned <= 0
        # ── measurements ──
        land = ~fine_sea
        def relief(a, km):
            s = int(km / PXKM) | 1
            m = land & (base > 0.5) if (land & (base > 0.5)).sum() > 500 else land
            return float(np.median((ndi.maximum_filter(a, s) - ndi.minimum_filter(a, s))[m])) if m.any() else 0
        accb = d8_accumulation(fine); acco = d8_accumulation(out)      # (catchments against today's: the model's effect alone)
        rp = np.zeros((N, N), bool)
        for reach in reaches_drawn:
            if reach is None: continue
            rr, cc, qq = reach; rp[np.clip(np.rint(rr).astype(int), 0, N - 1), np.clip(np.rint(cc).astype(int), 0, N - 1)] = True
        ratio = (acco[rp] + 1) / (accb[rp] + 1)
        isl_lost = int(sum(1 for k in range(1, n + 1) if sizes[k - 1] < ISLAND_KM2 and not (~out_sea)[lab == k].any()))
        rlab, rn = ndi.label(~base_sea); rsizes = ndi.sum(~base_sea, rlab, index=np.arange(1, rn + 1)) * PXKM * PXKM
        isl_lost_raw = int(sum(1 for k in range(1, rn + 1) if rsizes[k - 1] < ISLAND_KM2 and not (~raw_sea)[rlab == k].any()))
        m = {
            'patchKm': N * PXKM, 'reaches': len(reaches), 'islands': int((sizes < ISLAND_KM2).sum()),
            'lowBandDrift_m_rms': float(np.sqrt(np.mean(((G(learned) - G(base))[land]) ** 2)) * 1000),   # the model's low band against the picture's: how far it redrew the broad shape
            'relief10km_m': {k: relief(a, 10) * 1000 for k, a in [('base', base), ('today', fine), ('learnedRaw', learned), ('todayPlusModel', out)]},
            'relief5km_m': {k: relief(a, 5) * 1000 for k, a in [('base', base), ('today', fine), ('learnedRaw', learned), ('todayPlusModel', out)]},
            'medianSlopeLand': {k: float(np.median(slope_of(a)[land])) for k, a in [('base', base), ('today', fine), ('learnedRaw', learned), ('todayPlusModel', out)]},
            'riverClimbShare': {**{k: river_ascents(a, reaches, base)[0] for k, a in [('base', base), ('today', fine), ('learnedRaw', learned)]}, 'todayPlusModel': river_ascents(out, reaches_drawn, out)[0]},
            'riverWorstClimb_m': {**{k: river_ascents(a, reaches, base)[1] for k, a in [('base', base), ('today', fine), ('learnedRaw', learned)]}, 'todayPlusModel': river_ascents(out, reaches_drawn, out)[1]},
            'landShare': {k: float((~s).mean()) for k, s in [('base', base_sea), ('today', fine_sea), ('learnedRaw', raw_sea), ('todayPlusModel', out_sea)]},
            'islandsLost': {'learnedRaw': isl_lost_raw, 'todayPlusModel': isl_lost},
            'riverCatchment_medianRatioVsToday': float(np.median(ratio)) if rp.any() else None,
            'riverCatchment_shareBelowHalfVsToday': float((ratio < 0.5).mean()) if rp.any() else None,
            'gateMeanLand': float(gate[land].mean()),
            'riverMoved_km_mean': float(np.mean([np.mean([np.min(np.hypot(o[0] - y, o[1] - x)) for y, x in zip(r[0], r[1])]) for o, r in zip(reaches, reaches_drawn) if r is not None]) * PXKM) if any(r is not None for r in reaches_drawn) else 0.0,
        }
        results[name] = m
        np.save(f'{d}/todayPlusModel.npy', out); np.save(f'{d}/base.npy', base); np.save(f'{d}/today.npy', fine)
        panels = [hillshade_rgb(base, base_sea, reaches, f'{name}: picture enlarged (base)'), hillshade_rgb(fine, fine_sea, reaches, 'today: procedural detail'),
                  hillshade_rgb(learned, raw_sea, reaches, 'Terrain Diffusion, raw'), hillshade_rgb(out, out_sea, reaches_drawn, label4)]
        S = panels[0].size[0]; sheet = Image.new('RGB', (2 * S + 6, 2 * S + 6), (20, 20, 20))
        for i, im in enumerate(panels): sheet.paste(im, ((i % 2) * (S + 6), (i // 2) * (S + 6)))
        os.makedirs(f'{work}/renders', exist_ok=True); sheet.save(f'{work}/renders/{name}{"" if mode == "light" else "-strict"}.png')
        print(name, json.dumps(m, indent=None)[:600], flush=True)
    json.dump(results, open(f'{work}/results{"" if mode == "light" else "-strict"}.json', 'w'), indent=1)

SWEEP = [
    ('as set', {}),
    ('lock 15 km (more of our shape)', {'lockKm': 15}),
    ('lock 60 km (more of the model)', {'lockKm': 60}),
    ('rivers freer (corridor 9 km)', {'corridorPx': 12, 'linePull': 0.8}),
    ('rivers closer (corridor 2 km)', {'corridorPx': 3, 'linePull': 3}),
    ('valleys steeper and narrower', {'vK': 0.03, 'vRmax': 3}),
    ('lifted ground bald (no texture)', {'liftTexture': 0}),
]

def sweep(orogen, work):
    """Variants of the light guards on each patch: a sheet of the raw model, today, and each variant."""
    rivers = json.load(open(f'{orogen}/rivers.json'))
    for name in sorted(os.listdir(f'{work}/patches')):
        d = f'{work}/patches/{name}'
        if not os.path.exists(f'{d}/elev720m.npy'): continue
        p = json.load(open(f'{d}/patch.json')); learned = np.load(f'{d}/elev720m.npy') / 1000; N = learned.shape[0]
        lat, lon = gnomonic_grid(p['lat0'], p['lon0'], N, PXKM)
        wd = f'{orogen}/windows/{name}'; win = json.load(open(f'{wd}/window.json')); h, w = win['h'], win['w']
        rd = lambda f, t: np.fromfile(f'{wd}/{f}', t).reshape(h, w)
        fine = window_sample(rd('fine_h.f32', np.float32), win, lat, lon); fine_sea = window_sample(rd('fine_sea.u8', np.uint8), win, lat, lon, nearest=True).astype(bool)
        reaches = river_pixels(rivers, p, N)
        panels = [hillshade_rgb(learned, learned <= 0, reaches, f'{name}: Terrain Diffusion, raw'), hillshade_rgb(fine, fine_sea, reaches, 'today: procedural detail')]
        for label, over in SWEEP:
            out, sea, routed = light_guards(learned, fine, fine_sea, reaches, N, {**LIGHT, **over})
            climb = river_ascents(out, routed, out)[0]
            panels.append(hillshade_rgb(out, sea, routed, f'light: {label}  (climb {100 * climb:.1f} %)'))
            print(f'  {name}: {label}', flush=True)
        S = panels[0].size[0]; cols = 3; rows = (len(panels) + cols - 1) // cols
        sheet = Image.new('RGB', (cols * S + 6 * (cols - 1), rows * S + 6 * (rows - 1)), (20, 20, 20))
        for i, im in enumerate(panels): sheet.paste(im, ((i % cols) * (S + 6), (i // cols) * (S + 6)))
        os.makedirs(f'{work}/renders', exist_ok=True); sheet.save(f'{work}/renders/{name}-sweep.png')

if __name__ == '__main__':
    arg = lambda k, d: sys.argv[sys.argv.index(k) + 1] if k in sys.argv else d
    if '--sweep' in sys.argv: sweep(sys.argv[1], sys.argv[2])
    else: main(sys.argv[1], sys.argv[2], float(arg('--sigma-km', 12)), arg('--mode', 'light'))
