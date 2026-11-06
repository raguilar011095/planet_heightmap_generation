# Learned detail: the Phase 0 experiment

The scripts of Phase 0 in [plans/TERRAIN_DIFFUSION_EXPLORATION.md](../../plans/TERRAIN_DIFFUSION_EXPLORATION.md) §8: an
Orogen moment's own picture and climate fed to [Terrain Diffusion](https://github.com/xandergos/terrain-diffusion) (Goslin,
SIGGRAPH 2026; MIT; its 90 m model from Hugging Face, `xandergos/terrain-diffusion-90m`) on gnomonic patches, the guards of
§5 applied to what comes back, and the result set beside today's detail finer than the mesh. Nothing here runs in the app.

1. `make-moment.mjs` — an Evolution history and a detailed moment of it, built headlessly as `v2/tools/check-save.mjs`
   builds them (10K plates, 300 Myr, 640K cells, a 2048 px picture: about a minute), written as a planet file and as raw
   arrays (the heights, sea and lakes; the 1° climate's January, July and year; the rivers' polylines).
   `npm install delaunator` first (the Node tools' one dependency; `node_modules` is ignored).
2. `patches.py plan` — three windows chosen from the picture (its highest-relief land, its densest small islands, its
   biggest river's mouth; `overview.py` in the session's scratch chose them), each a square of 12 × 23 km coarse cells on
   the plane tangent at its centre (276 km; gnomonic stretch 1.0009 at the corners), and the equirectangular windows that
   cover them for step 3.
3. `fine-windows.mjs` — today's detail (`fineWindow`) and the picture merely enlarged (the base) for those windows, at
   0.61 km a pixel (the planet 65,536 px wide: the page's zoom level 8).
4. `patches.py run` — the model, patch by patch: its five coarse channels (heights in m, mean temperature, its seasonal
   standard deviation, the year's rain, its coefficient of variation) sampled from Orogen's picture and 1° climate at
   each cell's latitude and longitude, 64 cells of real surroundings as padding, the conditioning noise (`--snr`: 0 is the map as given, more is less of it) 0.1 for
   the heights, 0.2 for temperature and rain, 1 for their seasonality (roughly estimated here); its 90 m output averaged down to 720 m. Needs the repository's Python environment
   (`pip install -r requirements.txt` there, or the subset: torch, torchvision, diffusers, infinite-tensor, numba, scipy,
   scikit-image, h5py, pyfastnoiselite, rasterio, matplotlib, ema-pytorch, accelerate) and the weights. About 12 minutes a
   patch on four CPU cores; seconds on a GPU.
5. `guards.py` — the guards on the patch's 720 m pixels, in two modes, with measurements (relief within 5 and 10 km, slopes,
   the share of river steps that climb, how far the rivers moved, catchment areas by D8 against today's, islands lost, the
   model's low band's drift from the picture's) and a four-panel render per patch: the base, today's detail, the model
   raw, and the guarded result.
   - `--mode light` (the default; the owner's call after seeing the strict renders: "the raw ones really are the best by
     far"): the model kept whole below 30 km (its coarsest band replaced by today's), today's land farther than 12 km
     from its shore and the land under its rivers lifted gently above the sea where the model drowned it, each river
     re-routed along the model's own valleys within 5 km of its line (a least-cost path, pulled gently toward the line)
     and made to descend. Renders `renders/{range,islands,river}.png`.
   - `--mode strict` (the first design): the model's high band (σ 12 km) gated by slope and ruggedness and laid on top of
     today's procedural detail, coasts free within 12 km of today's and each island's core held, each reach's bed carved
     monotone along its fixed line. Renders `renders/*-strict.png`.

The renders and `results.json` of the run of 2026-11-06 are in `renders/` (downsized to 1024 px; `range-noise2-lesson.png` is the first run, with the conditioning noise at 2 by mistake); the plan's §10 reads them.
