# Terrain diffusion and other learned terrain models: an exploration

Owner (2026-11-06): "explore terrain diffusion, and other potential open source models that generate realistic terrain.
I'm curious what could be used out of the box, how would we update our program? How can we deal with distortions on the
poles?" This document is the exploration: what exists, what a browser can run, where a model would plug into Orogen, how
to put a flat-tile model on a sphere, and a recommendation. Nothing here is built; it is a decision document.


## In short

- **Out of the box, nothing drops in.** Every open terrain model found generates or upsamples **flat square tiles** of
  Earth-like relief. None takes Orogen's inputs (a simulated planet on a sphere, its rivers, rock and climate) and none
  promises to keep them. The closest in spirit, Goslin's **Terrain Diffusion** (MIT, SIGGRAPH 2026), takes a coarse
  heightmap plus temperature and rain and adds seamless 90 m or 30 m relief, but it weighs ≈1.1 GB and runs in PyTorch
  on a desktop GPU. The one model already running in a browser, **Talus-3** (Apache-2.0, 45 MB ONNX), was trained on
  procedural maps and makes 4 km unconditional tiles: a template for shipping, not a source of realism.
- **What a browser can run** (2026): a small super-resolution network of 1–2 M parameters (a few MB in fp16) through
  ONNX Runtime Web on WebGPU, at ~50–130 ms a 128 px tile on a laptop and ~150–400 ms on a mid-range phone; a Stable-
  Diffusion-class model (0.9 B parameters, 1.7–2.3 GB) cannot be hosted on GitHub Pages, fits no phone, and its
  weights' licences conflict with "the maps people make are theirs". So the only learned model Orogen could ship is a
  **small one trained or distilled by Orogen**, on open DEMs, with weights under Apache-2.0 or CC-BY.
- **Where it fits**: only as the **detail finer than the mesh** (`fine-detail.js`): a conditional detail layer that
  keeps the finished picture's low frequencies exactly and adds what 7–15 km cells cannot hold, with hard guards for
  the rivers, the coasts and the islands (§5). Never the mesh: that is where every feature has its cause.
- **Poles and seams**: run the model on **gnomonic (tangent-plane) patches** placed on a Fibonacci lattice, 25–35°
  across, overlapping a quarter, blended back onto the sphere by centrality weights and a gradient-domain stitch (§6).
  That family is the only one where a flat model runs unchanged (Tangent Images, SphereDiff, 360MonoDepth); cube faces
  stretch 2–3× at their corners and HEALPix or icosahedral grids need retraining. The current zoom tiles already stop
  at ±85°; patches would also fill that hole.
- **Recommendation** (§8): do not integrate a third-party model. First, a two-week **offline experiment** feeding
  Orogen's own exports (heightmap, temperature, rain at ~23 km a pixel) into Terrain Diffusion's pipeline on a desktop
  GPU, patch by patch, to see whether learned detail conditioned on our picture looks better than the procedural detail
  the owner judged in October, and whether rivers, coasts and islands survive the constraints of §5. If it does, train
  Orogen's own small residual-detail network on open DEMs with our driver fields as conditioning, ship it as an opt-in
  "Learned detail" quality in Evolution's Add detail (desktop WebGPU first), and fall back to today's procedural detail
  everywhere else. If it does not, the cheaper lesson is still useful: the same offline pipeline can make an
  **exemplar library** of real relief (a few MB of 16-bit tiles) for the procedural layer to draw on.

## 0. Where Orogen stands (what a model would have to fit)

Orogen already draws its terrain at two scales, and a learned model could only ever touch the finer one:

- **The mesh is the terrain's truth.** Generate and Import build a Fibonacci-sphere Voronoi mesh of 5K–2.5M cells
  (`js/sphere-mesh.js`, `js/detail-scale.js`); Evolution's detailed moment runs to 10M (7.7 km cells; 2.5M is 15 km).
  Every height is the outcome of the pipeline (Generate: `js/elevation.js`, `js/terrain-post.js`; Evolution: the records,
  `v2/js/terrain/synthesize.js`, `carve.js`, the finish in `v2/js/finish/`). That is the layer where *every feature has a
  cause* (VISION.md pillar 3) and where plate editing, the climate and the geology read from. A model that painted new
  mountains here would cut the causes off and break the climate's and geology's inputs; it is not a candidate.
- **The finished picture is equirectangular.** The finish writes the moment onto a 2 : 1 raster (`finish.js`
  `finishRaster`: `heightM` as Int16 metres, `ocean`, `water`; ≤ 8192 px wide at 10M, 4096 on desktop pages, 2048 on
  phones), with a byte raster of regional **drivers** beside it (`finish-drivers.js`, ≤ 2048 × 1024: the ice age's
  glaciers, the sand seas and the winds, the belts' youth and strike, the margins' activity…), the rock picture
  (`finish-lithology.js`) and the climate's annual fields on the same grid. Everything the page shows and exports is read
  from these pictures.
- **Detail finer than the mesh is a function of place** (`v2/js/finish/fine-detail.js`, plans/V2_FINE_DETAIL_PLAN.md).
  `fineWindow(src, {W, x0, y0, w, h})` returns the heights of any window of the planet at any width W: the picture
  enlarged (Catmull–Rom, a B-spline away from the coast) plus octaves of slope-aligned "phacelle" stripes, dunes, karst
  hollows, knobs and coastal wander, each gated by the finished slope, wetness, rock and drivers, and only below the
  mesh's own scale (from ~1.7 cells down to the window's pixels). Its noise is evaluated at each pixel's **3D position on
  the sphere** (`cosLa`, `sinLa`, `cosLo`, `sinLo` → `phacelle(px, py, pz, …)`), so the detail is free of the
  equirectangular stretch; only the pixel-space steps correct for `cos(lat)` (the slope's east–west step, `chamfer`'s
  row widths). A window reads only its pixels plus a margin of ≤ 64 px, so windows drawn apart agree.
- **It runs where a model would have to run.** The page draws zoom tiles of 256 px (`evolution/detail-view.js`
  `DetailService`, `DetailTiles`: level L is the planet at 256 · 2^L px wide, up to level 9 ≈ 0.3 km a pixel) in two to
  four workers, nearest the view's middle first, ~1.4–2.5 µs a pixel; exports wider than the picture are drawn band by
  band with the same function (`evolution/export.js` `pictureAt`), the heightmaps included. **Zoom tiles stop at
  ±85° latitude** (`tileRange` returns null with a pole in view): the poles are already a hole in the fine detail.
- **The owner's standard for this layer** (V2_FINE_DETAIL_PLAN §5, V2_SATELLITE_LOOK_PLAN): subtle, varied, never
  samey; "looks horrible … messy and samey" was the verdict on the first fine detail, which drew one octave of stripes
  at full strength on every steep pixel. Features come back one at a time, each judged by eye. Rivers stay lines drawn
  over the heights, never cut into them.
- **The constraints.** No build step, no server, static hosting (GitHub Pages; Three.js 0.160 and Delaunator from
  jsdelivr import maps); GPL-3.0; phones explore every view and export (Generate most of all); every seed and planet
  file ever shared must open again, so a learned detail layer must be deterministic for a seed and versioned like
  everything else (`orogen.studio/v/<major>.<minor>/`); scale invariance across the Detail slider (CLAUDE.md).

- **Both pages run the same finish.** Generate and Import run Evolution's finish in a background worker
  (`js/main.js`: "the finish (Evolution's: finish/finish-worker.js) in the background"), so their finished pictures,
  drivers, rivers and zoom tiles are the same objects as Evolution's. A detail layer written into `fine-detail.js`
  serves all three tools at once; Evolution is only where it is judged first.
- **Rivers are lines, not heights.** The finish's hydrology (`finish-hydro.js` `hydrology`) returns the rivers as
  polylines (`rivers: {start, lat, lon, q, season}`: each reach's points, its flow in m³/s and its season) carved on the
  mesh; the page and the exports draw them over the fine heights. Their valleys exist in the picture at the mesh's scale
  (the carve's), and the fine detail has no river of its own.

### The owner's constraints (2026-11-06)

"We can start focus on Evolution if it helps but it should work for Generate as well. I'm also particularly interested in
maintaining major river flows and respecting them. As well as respecting the broad shape of mountains and coasts. They can
move to be more realistic but whole islands should rarely disappear."

Read as requirements on any learned detail layer:

1. **Evolution first, Generate and Import for free**: one implementation in the shared finish; judged on Evolution's
   detailed moments first.
2. **Rivers are kept**: every drawn river must still run downhill through a valley in the detailed heights, from its
   source to its mouth, and its flow (`q`) must still make sense of the catchment the fine heights imply. The detail may
   move a river's course by a little within its valley; it may not dam it, lift it onto a ridge, or route it elsewhere.
3. **Broad shapes are kept**: the finished picture's low frequencies (the ranges' crests and fronts, the plateaus, the
   basins, the coasts' outlines) stay; the detail changes only what is finer than the mesh. Coasts may wander by a few km
   (as `coastWiggleKm` already lets them), a ridge may sharpen or a valley deepen; no range moves, no sea opens, no
   plateau is roughened.
4. **Islands survive**: any landmass in the picture stays land in the detail (a one-cell islet may change shape, grow a
   lagoon or split, but it does not sink), and no new islands appear far from the picture's land.

So the only place a learned terrain model fits Orogen's vision is **as a detail layer below the mesh** (§3–§5): given
the finished picture (and the drivers, rock and climate), produce the heights of a window at a finer pixel size, keeping
the picture's own low frequencies exactly and adding only what a mesh of 7–15 km cells cannot hold. In machine-learning
terms that is **conditional DEM super-resolution / detail synthesis**, not unconditional terrain generation.
Unconditional models (a diffusion model that dreams up a 256 × 256 mountain tile from noise) are the wrong tool: they
would need a conditioning path we would have to train ourselves anyway.

## 1. What exists: learned terrain models in the open (November 2026)

Three families, by what they do:

### 1.1 Terrain diffusion (generation from noise, usually conditioned)

| Model | Year | Licence (code / weights) | Size, architecture | Trained on | Makes | Conditioned on | Steps, cost | Seams | Sphere | Browser |
|---|---|---|---|---|---|---|---|---|---|---|
| **Terrain Diffusion / InfiniteDiffusion** (Goslin) | SIGGRAPH 2026 | MIT / MIT | latent consistency UNet ≈254 M + decoder ≈28 M + coarse ≈2.8 M + autoencoder ≈20 M; **968 + 107 + 11 MB** (verified) | MERIT DEM + ETOPO bathymetry + WorldClim at 90 m; Copernicus GLO-30 at 30 m; \|lat\| < 60° | infinite 90 m or 30 m relief and climate fields | a coarse heightmap (23 km or 7.7 km a pixel: mean and 5th-percentile height, mask) + temperature, its variation, rain, rain's seasonality; Azgaar maps | **2 + 1 steps**; first tile 1–3 s on an RTX 3090 Ti, 2.2 GB VRAM | **yes**: every window denoised from one infinite deterministic noise field, O(1) random access, seed-consistent | no (planar, equal-area stretch) | no ONNX; custom UNet class; ≈0.5 GB fp16 for the core alone |
| **PlanetDiffusion** (Borg, Gain, Cordonnier, "Authoring Terrestrial Planets with Diffusion Models") | Eurographics 2026 | MIT / MIT | diffusers UNet ≈78 M; **297 MB** (verified) | Earth and Mars elevation and imagery (sources not listed) | a whole planet's heightmap and appearance (~2.4 km a pixel, unverified) | a sketch on the globe, remapped to a **quadsphere**, plus a global river network extracted from it | DDIM 10–250 steps × ~625 blended tiles | yes (blended on the quadsphere) | **yes** | exportable (≈150 MB fp16) but minutes per planet |
| **Talus-3** (osfv) | Oct 2026 | Apache-2.0 / Apache-2.0 | pixel UNet 23 M; **45 MB fp16 ONNX** (verified) | 45,000 procedural maps (noise + stream power + hillslope + thermal erosion) | 64 × 64 px at 64 m (4 km), ≤ 1,200 m | archetype (plains … islands) + 5 statistics | 50 DDIM; ~3 s a map in the browser | optional overlap only | no | **yes, already**: ONNX Runtime Web on WebGPU, a JS sampler with PyTorch-parity tests |
| **Terra 4M** (novaia) | 2024 | Apache-2.0 / Apache-2.0 | convolutional UNet 4.2 M; 45 MB Flax zip | 574K SRTM tiles, 8-bit, normalised per tile (relative relief only, ~43 m a pixel) | 256 × 256 unconditional | none | DDIM-style | no | no | after a Flax → ONNX port; quality unverified |
| **MESA** (Borne-Pons et al.) | CVPR-W 2025 | code open / weights **Adobe licence** | Stable Diffusion 2.1 fine-tune ≈0.9 B; 4.6 GB | Major TOM: 1.3 M 10 km tiles of Sentinel-2 + Copernicus GLO-30 | one 10 km tile, RGB + DEM at 30 m | text | DDIM 50 | no | no | no |
| **TerraFusion** (Higo et al.) | 2025 | PolyForm-NC / CC-BY-NC | SD-class ≈0.87 B + two VAEs; 5.5 GB | NASADEM + Sentinel-2 at 25 m | 512 px heightmap + texture | none, or a sketch ControlNet | 20 steps ≈ 2 s on an RTX 6000 Ada | no | no | no, and not GPL-compatible |
| Lochner et al., "Interactive authoring of terrain using diffusion models" | PG 2023 | unknown; **code offline** (the paper's GitHub org is empty) | cascaded pixel diffusion | real DEMs | high-resolution tiles | sketch (ridges, rivers) + style | — | no | no | — |
| Terrain Diffusion Network (TDN), Earthbender, Pixels2Peaks, Jain et al. 2022 | 2022–26 | no weights / no code | — | — | — | sketches, photos | — | — | — | no |

Two lessons run through the good ones. **Terrain Diffusion** gets its realism from a *coarse map plus climate* and
stores heights as a low band plus a residual (its Laplacian encoding alone took its FID from 23 to 9), and gets its
seamlessness from one shared noise field rather than from overlap. **PlanetDiffusion** is the only published model that
thinks about a sphere, and it does so with a quadsphere atlas and a river network as conditioning, which is the design
space Orogen would be in too; its paper (CGF 45(2), DOI 10.1111/cgf.70390) should be read in full before any build.

### 1.2 GANs and other generators

Guérin et al. 2017 (cGAN sketch-to-terrain, the foundation of the field; 2017-era code), StyleDEM (Perche et al. 2023:
StyleGAN2 on DEMs with an encoder for sketches and super-resolution; a Blender add-on, no training code, licence
unknown), Beckham & Pal 2017 (DCGAN heightmaps, no weights), SingleTerrainGAN, Procedural3DTerrain, TerrainGAN. All flat
tiles, none with an open, documented, exportable checkpoint. No normalising-flow terrain model exists; the one
flow-matching work (Geodiffussr) makes textures from a given DEM.

### 1.3 DEM super-resolution (the task closest to Orogen's need)

The literature is rich (DEM-SDE, Real-GDSR, Feedback DEM-SR, D-SRGAN, CEDGAN, MindEarth's DEM-SRNet) and nearly code-
free: the one open checkpoint (zcash/DEM-SuperRes-Model, MIT, 294 MB) needs Sentinel-2 imagery as input and was trained
on one mine site; OpenDEM's FastAI4DEM templates report "no better than bicubic". What *is* reusable is the recipe every
good paper shares: **predict a residual over the bicubic upsample, detrend into a deterministic low band and a learned
high band, and condition on the coarse DEM**. That is exactly the shape a detail layer for Orogen must have (§5).

### 1.4 Data in the open (for training or for an exemplar library)

Copernicus GLO-30 (free with attribution; `Major-TOM/Core-DEM`, CC-BY-SA, 1.8 M tiles of 356 px at 30 m), SRTM 1″ (US
public domain), MERIT DEM, ETOPO 2022 and GEBCO bathymetry, WorldClim; `aliasfox/openzenith-dem` (MIT) is a Terrarium
PNG tile pyramid of GLO-30 + GEBCO with a JS decoder, readable from a browser as it stands.

## 2. What a browser can run (and ship)

Measured and reported in this exploration (the runtime from npm, the rest from the vendors' docs and benchmarks):

| | |
|---|---|
| ONNX Runtime Web 1.31.1 (MIT), WebGPU build | 28.2 MB of WASM raw, **6.6 MB gzipped**, plus ~0.1–0.8 MB of JS, from jsDelivr as an ES module import (no build step); the WASM-only build 3.6 MB gzipped |
| Three.js 0.160, for comparison | ~0.15 MB gzipped |
| WebGPU support | Chrome/Edge 113+; Chrome on Android 12+ with Adreno 6xx+ or Mali (since 121); **Safari 26 / iOS 26** (since September 2025, with early device-lost reports); Firefox 141+/145+ |
| Phones without WebGPU | the WASM fallback is 10–50× slower: not interactive |
| Quantisation | int8 does **not** accelerate on WebGPU (no quantised Conv kernels): fp16 on the GPU, int8 on the WASM fallback |
| Hosting | GitHub Pages: 100 MB a file, 1 GB a site, 100 GB a month; GitHub Releases: 2 GiB an asset, no bandwidth cap; jsDelivr refuses files over 50 MB; Hugging Face serves weights with CORS but is a third party's policy |
| Memory | WebGPU default `maxBufferSize` 256 MiB, bindings 128 MiB; iOS kills a tab near 1.4–1.5 GB and evicts a site's cached files after 7 days without a visit |

What that buys, by model class (estimates from the networks' FLOPs and the browsers' measured throughput):

| Class | Example | Weights | A 128 px tile on a laptop iGPU | On a mid-range phone | Verdict |
|---|---|---|---|---|---|
| Micro-CNN with weights baked into a shader | Anime4K-WebGPU (10³–10⁵ parameters) | KBs | < 10 ms a frame | real-time | the only neural class that fits Generate's "seconds, on phones"; also works as GLSL in the WebGL Orogen already has |
| Small residual super-resolution CNN | realesr-general-x4v3 class (1.2 M) | 2–5 MB fp16 | 50–130 ms | 150–400 ms | **feasible on both**; a 1024 px map in seconds on a desktop, tens of seconds on a phone |
| Large super-resolution CNN | Real-ESRGAN x4plus (16.7 M) | 34 MB fp16 | 0.7–2 s | 2–5 s | desktop only, as a "refine this region" step |
| Small diffusion UNet, few steps | Talus-3 (23 M, 50 steps); a distilled 5–30 M UNet at 4–8 steps | 45 MB | ~3 s a 64 px map (Talus); hundreds of ms to seconds a tile distilled | flagship phones perhaps | desktop opt-in; a research project if trained by us |
| Terrain Diffusion core | ≈254 M latent consistency, 2 + 1 steps | ≈0.5 GB fp16 + decoder | seconds a window with a discrete GPU; iGPU untested | no | desktop opt-in at best, with a half-gigabyte warning; or offline |
| Stable-Diffusion class | MESA, TerraFusion, SD-Turbo (≈0.9 B) | 1.7–4.6 GB | 5–20 s an image on an iGPU | no | **not for Orogen** (hosting, phones, licences) |

**Licences.** ONNX Runtime (MIT), Transformers.js and TensorFlow.js (Apache-2.0) and Real-ESRGAN's code and weights
(BSD-3) all sit inside GPL-3.0. Stable Diffusion weights (CreativeML OpenRAIL-M), SD-Turbo (Stability's community
licence), MESA (Adobe licence), TerraFusion (CC-BY-NC) do not: their use restrictions would bind Orogen's users, against
"the maps people make are theirs, commercially too". Weights Orogen trains on SRTM or Copernicus and releases under
Apache-2.0 or CC-BY-4.0 are clean. (web-realesrgan is GPL-2.0-only: do not borrow its code.)

**Determinism.** WebGPU and WASM float results differ across GPUs by rounding; a learned layer is not bit-reproducible
across machines the way the procedural detail is. "Every seed builds its world again" then means: the same picture and
the same noise field, and detail that is statistically the same, not pixel-identical. Exports must say which quality
drew them, and the detail's version must be part of the moment (and of the `.orogen` file) like every other versioned
thing.

## 3. Why not the mesh

A model that painted heights onto the mesh (Generate's `assignElevation`, Evolution's `synthesize.js`) would make
mountains without a plate behind them, cut the climate's and the geology's inputs off from their causes, and break plate
editing, scale invariance and seed permanence at once. Pillar 3 rules it out, and so does the owner's constraint that
broad shapes stay. The learned layer belongs **below the mesh**, where `fine-detail.js` already draws, and nowhere
else. Everything below assumes that.

## 4. How Orogen would change: a learned detail layer

The shape of the change, in the files that exist:

- **`v2/js/finish/fine-detail.js`** gains a second way to make the detail of a window: `fineWindow` keeps producing the
  base (the picture enlarged, sea, lakes, the margin) and today's procedural octaves; a new `learnedWindow` takes the
  same `src` and window and returns a **high-pass residual** in km for the window's pixels, which is added to the base
  where it is enabled. The two must agree on the band split: the procedural octaves start at ~1.7 cells
  (`gullyCells`), so the learned residual is high-passed at the same wavelength (a scale-invariant blur in km, as the
  finish's `LatLonGrid.blur` and `smooth()` do) and the procedural octaves that the learned layer replaces are turned
  off, not stacked.
- **Conditioning**: what the window already crops (`cropSource`): the picture's heights, sea and lakes; the drivers
  (ice, erg and wind, belt youth and strike, margin activity, coast coldness); the rock picture and its properties
  (`rockProps`); the annual climate. Rasterised into the model's input channels per patch (§6), scaled by their
  `PARAM`-style ranges. This is what the published models lack and what makes "every feature has a cause" survive:
  the network sees the cause fields and is trained to answer them.
- **Inference**: a `detail-worker.js` already runs the windows; the learned path runs in one dedicated worker that
  owns the ONNX session (WebGPU in a worker: Chrome yes, Safari 26 to verify), takes patches, returns residuals; the
  tile workers keep compositing. Weights (a few MB) load once, from the site itself (GitHub Pages), cached by the
  Cache API; the runtime from jsDelivr pinned by version, like Three.js. Where WebGPU is missing or the weights fail to
  load, the procedural detail draws as today and the quality toggle says so.
- **Where it is switched on**: Evolution's **Add detail** gains a quality, "Learned detail (desktop, downloads 30 MB)",
  off by default, remembered; the detailed moment records which drew it (`finishRaster` metadata; `versions.js` and a
  fixture, so `check-save.mjs` keeps old files opening). Generate and Import get the same switch beside their Detail
  slider once Evolution's look is approved: the finish is shared, so the code path is the same.
- **Exports** (`evolution/export.js` `pictureAt`): already drawn band by band through the same function; nothing changes
  except the README.txt's note of what drew the detail.
- **Docs**: `docs/evolution.md` (Add detail's qualities), `docs/generate.md` and `docs/import.md` when they get the
  switch, `docs/shared.md` (the export note), `v2/README.md` (the finish's detail), the README's dependencies (ONNX
  Runtime Web), `llms.txt`, the JSON-LD feature list.

## 5. Keeping the rivers, the coasts and the islands

The owner's constraints are not hopes for a well-behaved model; they are **guards applied to its output**, so they hold
whatever the network does. All run per window at the window's pixels, after the residual and before compositing.

1. **The low band is the picture's, exactly.** The residual is high-passed at the mesh's scale, then the composite's
   own low band is measured and any drift replaced by the picture's (the ILVR idea, applied once at the end for a
   one-shot network, or every step inside a diffusion sampler). Ranges, plateaus, basins and the broad coasts cannot
   move because the band they live in never came from the network.
2. **Rivers run downhill.** For each river polyline through the window (`rivers.lat`, `lon`, `q`), its course is
   sampled onto the pixels; the composite's heights along it are forced to a **monotone descending bed**: from the
   source down, each point's height is the lesser of its own and the previous point's less a minimum fall, and the bed
   is never above the picture's enlarged height there (the carve's valley). The pixels within a width set by the flow
   (`q`) are lowered toward the bed with a soft V, so a learned ridge across a river becomes a gorge, never a dam. No
   new channel is cut (the owner: rivers stay lines); the heights are only kept consistent with the lines.
3. **Catchments still feed them.** A D8 flow pass over the window's composite (the detail plan already ran a drainage
   pass once) checks that the accumulated area at each river pixel is within a factor of the picture's; where the detail
   has turned a slope away from its river (a learned side valley draining the other way), the residual's amplitude is
   faded there and the pixel re-checked. Reported as a per-window number in the dev harness, so a regression shows.
4. **Coasts wander, islands stay.** The picture's land mask is kept with a tolerance: pixels farther than
   `coastWiggleKm` inside the picture's land are held above sea (at least a few metres), pixels farther than that into
   the sea are held below; within the band the composite decides, so headlands and coves still form. A landmass that
   is small in the picture (a few cells) is held whole: its pixels get the inside rule at a smaller tolerance, so an
   islet may change shape or gain a lagoon but never sinks. No new land appears beyond the band: the sea's residual is
   clamped below zero there (the sea floor's own detail is a later item, as D5 was).
5. **Plateaus stay flat.** The residual's amplitude is gated by the picture's slope and ruggedness exactly as the
   procedural gullies are (`gullySlope`, `gullyRugged`), so the learned layer, like today's, draws nothing on plains
   and plateau tops. This is also where the model must be trained (on residuals gated the same way), or it will learn
   to roughen the flats of real plateaus too.
6. **Lakes keep their levels.** Lake pixels (`water`) take the picture's level; their shores follow the coast rule.

The procedural layer already respects 1, 5 and 6 by construction and 4 by `coastWiggleKm`; 2 and 3 are new and would
be worth adding to the procedural detail regardless of any model, since a steep stripe across a river is possible today.

## 6. Poles and seams: a flat model on a sphere

### 6.1 The problem

Every candidate model takes a square tile with a constant metres-per-pixel. Orogen's finished picture and its zoom
tiles are equirectangular: a pixel at 60° is half as wide as at the equator, at 85° a twelfth, and at the pole a row of
pixels is one point. A model fed equirectangular tiles would see squashed terrain near the poles and draw stretched
detail back; the current fine detail avoids this because its noise is sampled in 3D, and the zoom tiles simply stop at
±85°. Seams are the second half: a model that sees one tile at a time draws two different textures either side of a
tile edge.

### 6.2 The strategies, compared

| Strategy | Distortion | Seams | A pretrained flat model unchanged? | Complexity |
|---|---|---|---|---|
| Equirectangular tiles (today's windows) | unbounded at the poles | wrap seam, pole pinch | yes, but the poles are wrong | none |
| Cube sphere (6 faces, cube padding) | scale sec²θ: 2.0 at a face's edge, 3.0 at its corners (area ×5) | hidden by padding from the neighbouring faces; a residual mismatch still blended (CubeComposer 2026) | yes for padding; CubeDiff fine-tuned | low: 6 faces, 24 edge adjacencies |
| HEALPix (12 facets, padded convolutions) | equal-area but sheared, 8 corner singularities | facet padding (earth2grid, DLWP-HPX) | **no**: every model found trains from scratch (cBottle's coarse-plus-patch diffusion is the climate analogue) | medium |
| Icosahedral / gauge-equivariant CNNs | very low | none | **no**: custom operators | high |
| **Gnomonic tangent patches** (Tangent Images 2020, 360MonoDepth 2022, SphereDiff 2026, SyncTweedies 2024) | set by the patch's angular size (table below) | must be blended | **yes**: perspective-trained networks run on tangent images "without fine-tuning" | low to medium |
| Spherical convolutions (S2CNN, DeepSphere, SphereNet) | native | none | no | high |

### 6.3 Patch size against distortion

Computed for this exploration (`gnomonic.mjs`: N patch centres on a Fibonacci lattice, the half-angle every point of the
sphere lies within, the gnomonic scale there, and the square patch that reaches it at its corner):

| Patches | Covering half-angle | Radial scale sec²θ | Tangential sec θ | Square patch side | Side with 50 % overlap |
|---|---|---|---|---|---|
| 6 | 62.5° | 4.70 | 2.17 | 17,300 km | 24,500 km |
| 12 | 44.7° | 1.98 | 1.41 | 8,900 km | 12,600 km |
| 20 | 34.8° | 1.48 | 1.22 | 6,250 km | 8,850 km |
| 42 | 24.1° | 1.20 | 1.09 | 4,020 km | 5,690 km |
| **80** | **17.3°** | **1.10** | **1.05** | **2,810 km** | **3,970 km** |
| 162 | 11.8° | 1.04 | 1.02 | 1,880 km | 2,650 km |
| 320 | 8.4° | 1.02 | 1.01 | 1,340 km | 1,890 km |
| 642 | 6.0° | 1.01 | 1.005 | 940 km | 1,330 km |
| 1280 | 4.1° | 1.005 | 1.003 | 650 km | 915 km |

A terrain model trained on real DEM tiles already sees pixels that vary in size with latitude by 10–20 %, so a corner
stretch of 1.1–1.2 (patches of 25–35° across, i.e. **80–160 patches** with a quarter to a half overlap) is below what it
will notice. At 80 patches and 256 px a patch, a pixel is ~11–15 km: the mesh's own scale at 2.5M. For finer detail the
patch shrinks with the target pixel size and the count grows as the inverse square: at ~1 km a pixel, 1,280 patches of
~900 km in 1024 px, or ~5,000 of 512 px. The zoom tiles need only the patches under the view, so the count is a budget,
not a cost paid at once.

### 6.4 The recommended scheme

1. **Patch centres on a Fibonacci lattice** (the mesh's own construction, `generateFibonacciSphere`; Keinert et al.
   2015 give an O(1) nearest-lattice-point inverse for "which patch owns this place"). Square gnomonic patches whose
   angular size is set by the target metres per pixel and the model's training scale, overlapping by a quarter to a
   half (360MonoDepth pads each by 30 %).
2. **Rasterise each patch from the sphere, never from the equirectangular picture's pixels**: for each patch pixel, the
   tangent-plane point is projected to a latitude and longitude and the picture, drivers, rock and climate are sampled
   there (bicubic for heights, the same eased bilinear `rockProps` uses). This is the step that removes the poles from
   the problem: a patch over a pole is an ordinary square of ground.
3. **Run the model per patch**, and only let it add detail: a residual network's output is high-passed; a diffusion
   sampler gets the patch's low band replaced each step (ILVR) and is denoised from **one deterministic noise field
   defined on the sphere** (noise per mesh cell or per Fibonacci site from the seed, projected into each patch), so the
   result does not depend on the patch layout, and the same seed draws the same relief (InfiniteDiffusion's trick).
4. **Blend on the sphere.** For a diffusion sampler, synchronise during denoising (MultiDiffusion / SyncTweedies:
   after each step unproject every patch's estimate to the sphere, average with weights that fall to zero at a patch's
   border and fall with sec²θ, re-project), so seams never form. For a one-shot network, weighted averaging alone leaves
   faint seams at the amplitude heightmaps show (360MonoDepth's ablation: radial and mean weights seam, "frustum"
   weights least, Poisson best), so finish with a **gradient-domain stitch**: take each pixel's gradient from its most
   central patch and solve for the heights with the picture's low band as the constraint. On a window this is a small
   Poisson solve; the finish already has the multigrid-like tools in km.
5. **Composite into the window**: `h = base + guards(highpass(learned))` (§5), then today's compositing, hillshade and
   painting. The zoom tiles stay equirectangular on the GPU as they are; only the detail's *source* changes.
6. **Check** by drawing the same seed at two Detail levels (the low band must be identical, the detail statistically
   the same) and with the Fibonacci lattice rotated (any patch outline visible in a slope map is a blending bug).

What to avoid: feeding equirectangular tiles to the model above ~60°; cube faces at 90°; HEALPix or icosahedral
operators (retraining); blending finished tiles by nearest patch or plain feathering.

### 6.5 The same fix for the procedural detail

The scheme is not tied to a network. Today's `fineWindow` computes its octaves per window in equirectangular pixel
space with `cos(lat)` corrections and stops at ±85°; the only thing that would break at the poles is the slope's
east–west step and the coast's chamfer. Rasterising windows from gnomonic patches when a pole is in view (or the view's
latitude passes ~70°) would let the zoom tiles cover the poles with the detail that exists now, and would be the first,
cheap use of the patch code.

## 7. The options, side by side

| | A. Keep improving the procedural detail | B. An exemplar library made offline | C. Orogen's own small residual network | D. Terrain Diffusion's stack as an opt-in | E. PlanetDiffusion |
|---|---|---|---|---|---|
| What ships | nothing new | a few MB of 16-bit tiles of real relief (SRTM/Copernicus, or a big model's output made offline under any licence), blended as patches where the drivers call for them (Zhou et al. 2007, Guérin et al. 2016's sparse atoms) | 1–2 M parameters, ~5 MB fp16 ONNX + 6.6 MB runtime, trained on GLO-30 residuals conditioned on our driver fields | ≈0.5 GB fp16 + a JS port of the sCM sampler and InfiniteDiffusion; or an offline tool that details an export | ≈150 MB fp16, a quadsphere, 600+ tiles × DDIM steps |
| Realism | the owner's last verdict: subtle but samey risk | real relief, risk of repetition; a cause only by selection | learned from real relief, answered to our causes | the best published look, conditioned on heights + climate | planet-aware but 2.4 km a pixel: coarser than our mesh |
| Rivers, coasts, islands | by construction | guards of §5 | guards of §5 | guards of §5; its own 30 m rivers would fight ours | its river conditioning is the sketch's, not ours |
| Phones | yes | yes | yes (slower; or desktop-first) | no | no |
| Generate's "seconds" | yes | yes | borderline (a 2048 px picture in seconds on a desktop iGPU) | no | no |
| Licence | — | tiles' data licences (attribution) | ours (Apache-2.0 / CC-BY) | MIT | MIT |
| Cost to build | small | weeks | months (data pipeline, training, export, the §5–6 machinery) | weeks of porting, then a heavy download users may refuse | weeks, for a coarser result than we have |
| Determinism | exact | exact | statistical | statistical | statistical |

## 8. Recommendation and a path

**Do not integrate a third-party model as it stands**: none fits the inputs, the sphere, the phones or (for the SD-class
ones) the licence. But the question "would learned detail look better than our procedural detail?" is answerable
cheaply, and the answer decides whether option C is worth its months.

**Phase 0: look (one to two weeks, offline, a desktop GPU).** Export a detailed Evolution moment and a Generate planet
(heightmap with sea floor, temperature, rain, rain seasonality, land mask at 2048 px: ~20 km a pixel, Terrain
Diffusion's coarse scale) and feed them to Terrain Diffusion's pipeline as its coarse maps, patch by patch on a few
gnomonic patches (a range, a shield, a coast with islands, a river delta), with the picture's low band put back
afterwards and the §5 guards applied in a small Python script. Put the result beside today's fine detail at the same
pixel size and beside the real Alps and Himalaya (the plan's Terrain Tiles comparison), and judge by eye: is it less
samey, does the relief read as caused, do the rivers and islands survive? Also run PlanetDiffusion once on the same
export to see what a sphere-aware model makes of our coasts. Nothing ships; the branch gets the scripts and the renders.

**Phase 1: the guards and the patches, without a model (two to three weeks).** Add §5's river and catchment guards to
the procedural detail (they are missing today), and §6's gnomonic patch rasterisation for windows near the poles, so
the zoom tiles cover the poles. Both improve Evolution now, serve Generate for free, and are the scaffolding a model
would need.

**Phase 2, if Phase 0 convinces: Orogen's own detail network.** Train a small residual network (realesr-general class,
1–2 M parameters) on Copernicus GLO-30 and MERIT: input the DEM averaged to the mesh's scale plus the fields Orogen
can supply (slope, relief, rain, temperature, rock class from a global lithology map, ice history where known), target
the real residual below that scale, gated as §5.5. Export to ONNX fp16, ship as Evolution's opt-in "Learned detail"
quality on desktop WebGPU with the §5 guards and §6 blending, judged against Phase 0's renders. Then Generate and
Import, then phones as the measurements allow. Alternatively distil Terrain Diffusion's core into a few-step, smaller
model conditioned the same way (its author ships training code and trains the whole stack in a week on one GPU).

**If Phase 0 does not convince**, Phase 0's pipeline still yields option B: a library of real-relief exemplars chosen by
the driver fields, a few MB, for the procedural layer to draw on where it is weakest (young wet ranges, glaciated
coasts), on every device.

## 9. Open questions and things to verify

- PlanetDiffusion's paper (CGF 45(2)): its real metres per pixel, its quadsphere blending and how it uses the river
  network; the Lochner 2023 code (the paper's repository is offline; the authors may share it).
- Whether ONNX Runtime Web's WebGPU runs inside a worker on Safari 26, and its Conv throughput on Intel and Apple
  integrated GPUs (the operator list flags Conv as "needs performance optimisation").
- How a learned residual behaves at a Detail change: the band split in km makes the low band identical, but the
  residual's statistics at 2.5M and 10M must be checked, as the scale-invariance rule asks.
- What the detailed moment should store: the residual itself (a 10M moment's picture is 8192 px: 130 MB as Int16) or
  only the model's version and seed, drawing it again on load. The latter keeps `.orogen` files small and is how the
  procedural detail works today.
- Whether Generate's "seconds" survives even a small network for its 2048 px picture, or whether the learned detail is
  only for the zoom tiles and exports there.

## Sources

Terrain Diffusion: github.com/xandergos/terrain-diffusion, arXiv 2512.08309, HF `xandergos/terrain-diffusion-90m` ·
PlanetDiffusion: github.com/Oliver-Borg/PlanetDiffusion, HF `otrolie/PlanetDiffusion`, CGF DOI 10.1111/cgf.70390 ·
Talus: github.com/osfv/talus, HF `osfv/talus` · Terra 4M: HF `novaia/terra-4m` · MESA: arXiv 2504.07210 · TerraFusion:
arXiv 2505.04050 · Lochner et al. 2023: DOI 10.1111/cgf.14941 · Guérin et al. 2017: ACM TOG 36(6) · StyleDEM: arXiv
2304.09626 · DEM-SDE: arXiv 2407.01908 · Real-GDSR: arXiv 2404.03930 · Feedback DEM-SR: arXiv 2007.01940 · ILVR: arXiv
2108.02938 · Tangent Images: arXiv 1912.09390 · 360MonoDepth: arXiv 2111.15669 · SphereDiff: arXiv 2504.14396 ·
SyncTweedies: synctweedies.github.io · MultiDiffusion / Mixture of Diffusers: arXiv 2302.02412 · Cube Padding: arXiv
1806.01320 · CubeDiff: arXiv 2501.17162 · CubeComposer: arXiv 2603.04291 · HEALPix: arXiv astro-ph/0409513 · DLWP-HPX:
arXiv 2311.06253 · cBottle: arXiv 2505.06474 · Icosahedral CNN: arXiv 1902.04615 · Kazhdan & Hoppe, spherical
stitching: hhoppe.com/proj/spherestitch · Spherical Fibonacci mapping: Keinert et al., ACM TOG 2015 · Zhou et al. 2007,
terrain synthesis from DEMs: IEEE TVCG · Guérin et al. 2016, sparse representation of terrains: CGF 35(2) · ONNX Runtime
Web: github.com/microsoft/onnxruntime (releases 1.31.1; JSEP deprecation; WebGPU operator list; large-models and
env-flags docs) · Transformers.js 4.3.2 · Anime4K-WebGPU · WebGPU limits: MDN · GitHub Pages limits: docs.github.com ·
Safari 26 WebGPU: web.dev · Licences: licenses.ai FAQ (OpenRAIL), Stability AI community licence, Real-ESRGAN BSD-3.
Bundle sizes measured from the npm tarball of onnxruntime-web 1.31.1 on 2026-11-06; model file sizes read from the
Hugging Face API the same day.
