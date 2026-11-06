"""
Phase 0 of plans/TERRAIN_DIFFUSION_EXPLORATION.md: the guards of its §5 applied to a learned patch (patches.py), beside the
picture enlarged (the base) and today's detail finer than the mesh (fine-windows.mjs) — all on the patch's 720 m pixels —
with measurements and a four-panel render for each patch: base | today's detail | the model raw | the model with the guards.

  python guards.py <orogenDir> <workDir> [--sigma-km 12]
"""
import sys, json, math, os
import numpy as np
from scipy import ndimage as ndi
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from patches import gnomonic_grid, CELL_KM, DOWN, OUT_PX, R_KM

PXKM = CELL_KM / (OUT_PX / DOWN)        # 0.71875 km a pixel
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
    for rr, cc, qq in reaches:
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
    for rr, cc, qq in rivers_px:
        pts = list(zip((cc + 0.5) * scale, (rr + 0.5) * scale))
        if len(pts) > 1: d.line(pts, fill=(80, 190, 255), width=1 if qq.max() < 3000 else 2)
    d.rectangle([0, 0, 8 * len(title) + 10, 16], fill=(0, 0, 0)); d.text((5, 2), title, fill=(255, 255, 255))
    return im

def main(orogen, work, sigma_km):
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
        # ── the guards ──
        hp = learned - G(learned)                                                       # guard 1: only the high band is the model's
        slope = slope_of(G(base) if False else base)
        rug = ndi.maximum_filter(base, size=int(20 / PXKM) | 1) - ndi.minimum_filter(base, size=int(20 / PXKM) | 1)
        gate = 0.1 + 0.9 * smooth(0.012, 0.05, slope) * smooth(0.12, 0.7, rug)         # guard 5: the procedural gullies' gate
        out = base + gate * hp
        out = out - G(out) + G(base)                                                    # guard 1 again, as a guarantee
        dist = ndi.distance_transform_edt(~base_sea) * PXKM; dsea = ndi.distance_transform_edt(base_sea) * PXKM
        lab, n = ndi.label(~base_sea); sizes = ndi.sum(~base_sea, lab, index=np.arange(1, n + 1)) * PXKM * PXKM
        small = np.isin(lab, 1 + np.where(sizes < 300)[0])
        hold_land = (dist > 2.2) | (small & (dist > PXKM)); hold_sea = dsea > 2.2       # guard 4: coasts wander 2.2 km, islands stay
        out = np.where(hold_land, np.maximum(out, 0.005), out); out = np.where(hold_sea, np.minimum(out, -0.005), out)
        out = carve_river_beds(out, base, reaches, N)                                   # guard 2: rivers run downhill
        out_sea = np.where(hold_land, False, np.where(hold_sea, True, out <= 0))
        raw_sea = learned <= 0
        # ── measurements ──
        land = ~base_sea
        def relief(a, km):
            s = int(km / PXKM) | 1
            return float(np.median((ndi.maximum_filter(a, s) - ndi.minimum_filter(a, s))[land & (base > 0.5)])) if (land & (base > 0.5)).any() else 0
        accb = d8_accumulation(base); acco = d8_accumulation(out)
        rp = np.zeros((N, N), bool)
        for rr, cc, qq in reaches: rp[np.clip(np.rint(rr).astype(int), 0, N - 1), np.clip(np.rint(cc).astype(int), 0, N - 1)] = True
        ratio = (acco[rp] + 1) / (accb[rp] + 1)
        isl_lost = int(sum(1 for k in range(1, n + 1) if sizes[k - 1] < 300 and not (~out_sea)[lab == k].any()))
        isl_lost_raw = int(sum(1 for k in range(1, n + 1) if sizes[k - 1] < 300 and not (~raw_sea)[lab == k].any()))
        m = {
            'patchKm': N * PXKM, 'reaches': len(reaches), 'smallIslands': int((sizes < 300).sum()),
            'lowBandDrift_m_rms': float(np.sqrt(np.mean(((G(learned) - G(base))[land]) ** 2)) * 1000),
            'relief10km_m': {k: relief(a, 10) * 1000 for k, a in [('base', base), ('today', fine), ('learnedRaw', learned), ('guarded', out)]},
            'relief5km_m': {k: relief(a, 5) * 1000 for k, a in [('base', base), ('today', fine), ('learnedRaw', learned), ('guarded', out)]},
            'medianSlopeLand': {k: float(np.median(slope_of(a)[land])) for k, a in [('base', base), ('today', fine), ('learnedRaw', learned), ('guarded', out)]},
            'riverClimbShare': {k: river_ascents(a, reaches, base)[0] for k, a in [('base', base), ('today', fine), ('learnedRaw', learned), ('guarded', out)]},
            'riverWorstClimb_m': {k: river_ascents(a, reaches, base)[1] for k, a in [('base', base), ('today', fine), ('learnedRaw', learned), ('guarded', out)]},
            'landShare': {k: float((~s).mean()) for k, s in [('base', base_sea), ('today', fine_sea), ('learnedRaw', raw_sea), ('guarded', out_sea)]},
            'islandsLost': {'learnedRaw': isl_lost_raw, 'guarded': isl_lost},
            'riverCatchment_medianRatio': float(np.median(ratio)) if rp.any() else None,
            'riverCatchment_shareBelowHalf': float((ratio < 0.5).mean()) if rp.any() else None,
            'gateMeanLand': float(gate[land].mean()),
        }
        results[name] = m
        np.save(f'{d}/guarded.npy', out); np.save(f'{d}/base.npy', base); np.save(f'{d}/today.npy', fine)
        panels = [hillshade_rgb(base, base_sea, reaches, f'{name}: picture enlarged (base)'), hillshade_rgb(fine, fine_sea, reaches, 'today: procedural detail'),
                  hillshade_rgb(learned, raw_sea, reaches, 'Terrain Diffusion, raw'), hillshade_rgb(out, out_sea, reaches, 'Terrain Diffusion + guards')]
        S = panels[0].size[0]; sheet = Image.new('RGB', (2 * S + 6, 2 * S + 6), (20, 20, 20))
        for i, im in enumerate(panels): sheet.paste(im, ((i % 2) * (S + 6), (i // 2) * (S + 6)))
        os.makedirs(f'{work}/renders', exist_ok=True); sheet.save(f'{work}/renders/{name}.png')
        print(name, json.dumps(m, indent=None)[:600], flush=True)
    json.dump(results, open(f'{work}/results.json', 'w'), indent=1)

if __name__ == '__main__':
    arg = lambda k, d: sys.argv[sys.argv.index(k) + 1] if k in sys.argv else d
    main(sys.argv[1], sys.argv[2], float(arg('--sigma-km', 12)))
