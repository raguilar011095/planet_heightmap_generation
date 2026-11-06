"""
Phase 0 of plans/TERRAIN_DIFFUSION_EXPLORATION.md: Terrain Diffusion (Goslin, SIGGRAPH 2026; MIT) run on gnomonic patches of
an Orogen moment, conditioned on Orogen's own picture and climate — the coarse maps it expects (a heightmap at ~23 km a pixel
in metres, the mean temperature in °C, its seasonal standard deviation, the year's rain in mm and its coefficient of variation).

  python patches.py plan   <orogenDir> <workDir> [--cells 16]      the patches' geometry and the windows for fine-windows.mjs
  python patches.py run    <orogenDir> <workDir> <tdRepo> <weights> [--snr 3,1,1,1,1] [--seed 7]   the model, patch by patch

A patch is a square of N × N coarse cells of 23 km on a tangent plane at its centre (gnomonic: distortion sec²θ ≤ 1.01 at
these sizes), its cells sampled from the picture by their latitude and longitude. The model's 90 m output is averaged down
8 × to 720 m a pixel (the scale of the page's finest zoom tiles) and saved with the patch's geometry, for guards.py.
"""
import sys, json, os, time, math
import numpy as np

R_KM = 6371.0
CELL_KM = 23.0          # the 90 m model's coarse cell (256 output pixels of 90 m)
PAD = 64                # cells of edge padding around a patch, as tiff_export.py pads
OUT_PX = 256            # output pixels per coarse cell
DOWN = 8                # the output averaged down: 90 m → 720 m

def gnomonic_grid(lat0, lon0, n, cell_km):
    """Latitude and longitude (degrees) of an n × n grid of cells of cell_km on the plane tangent at (lat0, lon0); row 0 north."""
    s = (np.arange(n) - (n - 1) / 2) * cell_km / R_KM           # tangent-plane coordinates in radians of arc
    x, y = np.meshgrid(s, -s)                                    # x east, y north (row 0 north)
    rho = np.hypot(x, y); c = np.arctan(rho)
    la0, lo0 = np.radians(lat0), np.radians(lon0)
    with np.errstate(invalid='ignore', divide='ignore'):
        lat = np.arcsin(np.cos(c) * np.sin(la0) + np.where(rho > 0, y * np.sin(c) * np.cos(la0) / rho, 0))
        lon = lo0 + np.arctan2(x * np.sin(c), rho * np.cos(la0) * np.cos(c) - y * np.sin(la0) * np.sin(c))
    return np.degrees(lat), (np.degrees(lon) + 180) % 360 - 180

def sample_equirect(a, lat, lon, wrap=True):
    """Bilinear sample of an equirectangular array a (h × w, row 0 at 90°N) at lat, lon (degrees)."""
    h, w = a.shape
    u = (lon + 180) / 360 * w - 0.5; v = (90 - lat) / 180 * h - 0.5
    x0 = np.floor(u).astype(int); y0 = np.clip(np.floor(v).astype(int), 0, h - 2)
    fx = u - x0; fy = np.clip(v - y0, 0, 1)
    x1 = (x0 + 1) % w; x0 = x0 % w
    return ((1 - fx) * (1 - fy) * a[y0, x0] + fx * (1 - fy) * a[y0, x1] + (1 - fx) * fy * a[y0 + 1, x0] + fx * fy * a[y0 + 1, x1])

def load_orogen(d):
    meta = json.load(open(f'{d}/meta.json')); w, h = meta['w'], meta['h']
    H = np.fromfile(f'{d}/heightM.i16', np.int16).reshape(h, w).astype(np.float32)
    sea = np.fromfile(f'{d}/ocean.u8', np.uint8).reshape(h, w)
    gw, gh = meta['grid']['w'], meta['grid']['h']
    g = {k: np.fromfile(f'{d}/{k}.f32', np.float32).reshape(gh, gw) for k in ['T_year', 'T_jan', 'T_jul', 'P_year', 'P_jan', 'P_jul']}
    return meta, H, sea, g

def conditioning(H, sea, g, lat, lon):
    """The five coarse channels at the given latitudes and longitudes, in the model's internal units."""
    elev = sample_equirect(H, lat, lon)                                      # metres; the sea floor negative, as the picture has it
    T = sample_equirect(g['T_year'], lat, lon)                               # °C
    tstd = np.abs(sample_equirect(g['T_jul'], lat, lon) - sample_equirect(g['T_jan'], lat, lon)) / 2 / math.sqrt(2) * 100   # °C × 100 (a sinusoidal year)
    P = 12 * sample_equirect(g['P_year'], lat, lon)                           # mm a year (P.year is the months' mean)
    pamp = np.abs(sample_equirect(g['P_jul'], lat, lon) - sample_equirect(g['P_jan'], lat, lon)) / 2 / math.sqrt(2)
    pcv = 100 * pamp / np.maximum(1, sample_equirect(g['P_year'], lat, lon))   # %, the months' coefficient of variation
    return np.stack([elev, T, tstd, P, pcv]).astype(np.float32)

def plan(orogen, work, n):
    meta, H, sea, g = load_orogen(orogen)
    cands = json.load(open(f'{work}/candidates.json'))
    patches, windows = [], []
    W_FINE = 65536                                                           # the window's width of the planet: 0.61 km a pixel at the equator
    for name, c in cands.items():
        lat0, lon0 = c['lat'], c['lon']
        lat, lon = gnomonic_grid(lat0, lon0, n, CELL_KM)
        # the equirect window covering the patch (with a margin), at W_FINE
        pxw, pxh = W_FINE, W_FINE // 2
        xs = (lon + 180) / 360 * pxw; ys = (90 - lat) / 180 * pxh
        # (a patch across the antimeridian: not among these candidates; left simple)
        x0, x1 = int(xs.min()) - 16, int(xs.max()) + 17; y0, y1 = int(ys.min()) - 16, int(ys.max()) + 17
        patches.append({'name': name, 'lat0': lat0, 'lon0': lon0, 'n': n, 'cellKm': CELL_KM})
        windows.append({'name': name, 'W': W_FINE, 'x0': x0, 'y0': y0, 'w': x1 - x0, 'h': y1 - y0})
        print(f'{name}: centre {lat0:.1f}°, {lon0:.1f}°; {n} cells = {n * CELL_KM:.0f} km; corner sec² {1 / math.cos(math.hypot(n, n) / 2 * CELL_KM / R_KM) ** 2:.4f}; window {x1 - x0}×{y1 - y0} px at W {W_FINE}')
    json.dump(patches, open(f'{work}/patches.json', 'w'), indent=1)
    json.dump(windows, open(f'{work}/windows.json', 'w'), indent=1)

def run(orogen, work, td_repo, weights, snr, seed):
    sys.path.insert(0, td_repo)
    import torch
    torch.set_num_threads(os.cpu_count())
    import terrain_diffusion.inference.world_pipeline as wp
    wp.make_synthetic_map_factory = lambda **k: None     # (all five channels are imported, periodic: the Perlin map is never sampled)
    meta, H, sea, g = load_orogen(orogen)
    patches = json.load(open(f'{work}/patches.json'))
    world = wp.WorldPipeline.from_pretrained(weights, seed=seed, latents_batch_size=[1, 2, 4], torch_compile=False, caching_strategy='direct', cache_limit=1024 * 1024 * 1024, log_mode='info')
    world.to('cpu')
    world.set_cond_snr(snr)
    world.bind(hdf5_file=None)
    for p in patches:
        t0 = time.time()
        n = p['n']; m = n + 2 * PAD
        lat, lon = gnomonic_grid(p['lat0'], p['lon0'], m, CELL_KM)          # the padded grid, the patch in its middle
        cond = conditioning(H, sea, g, lat, lon)
        # (the padding: the real surroundings on the tangent plane — sec² 1.3 at its far corners, but it is only context)
        world.change_seed_with_periodic_conditioning(seed, {k: cond[k] for k in range(5)})
        i1 = j1 = PAD * OUT_PX; i2 = j2 = (PAD + n) * OUT_PX
        d = f'{work}/patches/{p["name"]}'; os.makedirs(d, exist_ok=True)
        np.save(f'{d}/cond.npy', cond[:, PAD:PAD + n, PAD:PAD + n]); np.save(f'{d}/lat.npy', lat[PAD:PAD + n, PAD:PAD + n]); np.save(f'{d}/lon.npy', lon[PAD:PAD + n, PAD:PAD + n])
        with world:
            # in bands of 4 cells of rows, so a slow machine shows progress
            rows = []
            for r in range(0, n, 4):
                a, b = i1 + r * OUT_PX, i1 + min(n, r + 4) * OUT_PX
                e = world.get(a, j1, b, j2, with_climate=False)['elev'].numpy().astype(np.float32)
                rows.append(e); print(f'  {p["name"]}: rows {r}–{min(n, r + 4)} of {n} ({time.time() - t0:.0f} s)', flush=True)
            elev = np.concatenate(rows, 0)
        np.save(f'{d}/elev90m.npy', elev.astype(np.float32))
        hh, ww = elev.shape[0] // DOWN, elev.shape[1] // DOWN
        np.save(f'{d}/elev720m.npy', elev.reshape(hh, DOWN, ww, DOWN).mean(axis=(1, 3)).astype(np.float32))
        json.dump({**p, 'snr': snr, 'seed': seed, 'secs': time.time() - t0, 'outPx': elev.shape[0]}, open(f'{d}/patch.json', 'w'), indent=1)
        print(f'{p["name"]}: {elev.shape[0]} px at 90 m, min {elev.min():.0f} max {elev.max():.0f} m, {time.time() - t0:.0f} s', flush=True)
    world.close()

if __name__ == '__main__':
    cmd, orogen, work = sys.argv[1:4]
    arg = lambda k, d: sys.argv[sys.argv.index(k) + 1] if k in sys.argv else d
    if cmd == 'plan': plan(orogen, work, int(arg('--cells', 16)))
    elif cmd == 'run': run(orogen, work, sys.argv[4], sys.argv[5], [float(x) for x in arg('--snr', '3,1,1,1,1').split(',')], int(arg('--seed', 7)))
