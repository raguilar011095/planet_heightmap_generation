# Terrain diffusion on V2 — what it is, what others have tried, and a V0 plan

Draft, 2026-10-12, for the developer to agree before anything is built (plan first; one verifiable step at a time).
Nothing in this document is built. Sources: `dunkean/neural-earth` (the Reddit project), `xandergos/terrain-diffusion`
(the model it runs; SIGGRAPH 2026; MIT code), this branch's `v2/`, and the papers and projects of §6.

## 1. What terrain diffusion is, in plain words

V2 paints a planet at the scale of a wall map: a finish mesh cell is 7.7 km (10M cells) to 15 km (2.5M) across, and the
finished picture is 8192 or 4096 px wide — about 5 or 10 km a pixel at the equator. Terrain Diffusion is a set of neural
networks that have *learned what real Earth terrain looks like at 30 m* — from the ETOPO relief model and 30 m / 90 m
elevation data, with WorldClim climate — and can paint plausible 30 m detail *between* your pixels, guided by your map.
It is the heightmap equivalent of a sketch-to-photo tool: your map says "mountains here, this wet, this cold", the model
fills in ridges, valleys, drainage and texture the way Earth would have them. It is **not an upscaler**: it does not
sharpen your pixels, it invents new terrain statistically consistent with them, and a knob (called SNR) decides how
closely it must follow your map.

It runs as a stack of three networks (the `xandergos/terrain-diffusion-30m` checkpoint; there is also a 90 m one):

| Network | Size | Input | Output | Cost per tile |
| --- | ---: | --- | --- | --- |
| **Coarse** | ~2.8 M params (11 MB) | your five maps at **7.68 km / px** (height in m; mean temperature °C; temperature seasonality; annual rain mm; rain seasonality), with noise mixed in to the degree the SNR allows | an "Earth-like" version of the same five maps, 64 × 64 cells a tile, 20 denoising steps | tiny |
| **Base** | ~250 M params (1.0 GB fp32) | a 4 × 4-cell coarse neighbourhood | a 64 × 64 **latent** tile at **240 m / px**: a compressed description of the landforms, plus a smooth low-frequency height; two passes | ~0.2 TFLOP per pass |
| **Decoder** | ~28 M params (111 MB) | the latents, 8× upsampled | the 30 m height *detail* (a Laplacian residual) in one pass, 512 × 512 px a tile | ~1.4 TFLOP |

Final height = decoded detail + the upsampled low-frequency height, in **signed-square-root space** (so one network can
span −10 000 m trenches and 9 000 m peaks), then squared back to metres. The 30 m model's coarse cell is exactly
256 × 30 m = 7.68 km; the 90 m model's is 23.04 km. The output is always **256× the conditioning raster** on each axis.

Two properties matter for us:

- **Lazy and seamless ("InfiniteDiffusion").** Every tile's noise is a hash of (seed, tile coordinates), so any tile can be
  computed alone, in any order, and come out identical; overlapping tiles are blended with a tent-shaped weight (the
  MultiDiffusion idea). This is why Neural Earth can compute only what is on screen, and why a region can be refined
  without the rest of the planet. It does not make a planet cheap — work is proportional to the area asked for.
- **It is a texture-and-landform stage, not a geology stage.** Rivers are not guaranteed to connect across tiles,
  coastlines can move (Neural Earth says so plainly: "a land mask does not force the neural DEM into the initial
  silhouette"), and V2's deliberate features — fjords, deltas, closed basins, carved gorges — survive only as far as a low
  elevation SNR forces the model to respect them. V2's finish stays the place where landforms are *decided*; diffusion
  would be the last pass that makes a 30 m export look like a DEM.

## 2. What Neural Earth actually built (facts from its source)

- **Orogen side: V1 only.** `native/orogen/vendor/` is a copy of nineteen V1 modules from a snapshot *older* than `main`
  (before plate physics, super-plate projection, `terrain-config.js`, the exported `CLIMATE` object). It runs V1's worker
  headlessly under **Node** (`native/orogen/pipeline.mjs` fakes `self.postMessage` and dumps `r_xyz`, triangles, elevation,
  plates, crust type and the climate layers as one float32 file). Their maintenance note (2026-10-10) reviewed upstream
  commit `cc2662b4` and deferred integrating it: 14 of 19 files differ. They never touched V2.
- **Rasterisation.** CUDA rasterises the sphere's triangles into a **2048 × 1024 equirectangular atlas** (~19.5 km / px at
  the equator — coarser than the 7.68 km cell the coarse model wants; it is bilinearly upsampled into it). V1's unit
  heights become metres with V1's quartic (sea `10000·e`, land `6000·t⁴(5−4t)`) plus a small "coastal slope" term they added
  so coasts are not sub-metre plains.
- **Climate → the five channels.** V1 gives two seasons, so they approximate WorldClim's statistics from them
  (`backend/terrain_conditioning.py: orogen_bioclim`): BIO1 = mean of summer/winter, BIO4 from the summer–winter swing as a
  12-month harmonic, BIO12 = the two half-year totals, BIO15 from their contrast. They call it "a statistic contract, not
  actual monthly weather". **V2 needs no approximation here** — see §3.
- **Inference.** The unchanged pinned checkpoint, run through upstream's `WorldPipeline` with heavy engineering around it
  (BF16, CUDA graphs, cached weights, a window scheduler prioritising what the camera sees, four coarse streams). Reference
  hardware **RTX 3090 24 GB**; "smaller cards have no certified minimum". A new world's overview is on screen after ~16 s
  (that is V1 + rasterising, not the networks); 30 m tiles then stream in as you zoom. The entire planet is **never**
  computed at 30 m. Above 60° latitude the globe switches to a chart rotated 90° so the poles sit on its equator (the
  model never saw stretched polar pixels). Below 30 m (their LOD −1 … −6) is procedural detail, not the model.
- **Distillation (their `distill/`).** They tried to make the three networks faster. The coarse model with its solver cut
  from 20 to 4 steps works ("coarse4 works very well visually"); a small distilled decoder works; every attempt at a smaller
  **base** model failed — straight horizontal/vertical lines, erosion forms lost — and their external review concluded the
  base's attention and two-pass windowed design is what carries the landforms. So the 1 GB base model is the irreducible
  cost.
- **Browser inference: a probe, not a product.** `webgpu/` is an ONNX Runtime Web 1.30 + WebGPU feasibility study: the
  three networks exported to ONNX (the base is a 2.03 GB external-data file), and a 64²-crop runner that ports the noise
  hash, the DPM solver, the tile fusion, the Laplacian decode and the climate readout to JavaScript so a browser run can be
  compared against CUDA to within 1 m. Their design note: "the prototype in `webgpu/` remains a feasibility study"; the
  shipped product runs the networks on a **local Python/CUDA server**, WebGPU is used for rendering only.
- **Licensing to check before anything ships.** Terrain Diffusion's code is MIT; the *weights* are on Hugging Face with their
  own terms (not reachable from this container — read them). Neural Earth bundles GPL-3 Orogen and has no licence file of
  its own, so its JavaScript ports are not something to copy; porting from upstream's MIT Python is clean.

## 3. How V2 fits (better than V1 did)

What the model needs is **five co-registered rasters at 7.68 km / px (30 m) or 23.04 km / px (90 m), in physical units**.
V2 produces almost all of it already (surveyed 2026-10-12; everything below runs on the CPU in workers — V2 uses the GPU
for display only, through Three.js):

| Needed | V2 has | Gap |
| --- | --- | --- |
| Elevation in signed metres | `finishRaster` (`v2/js/finish/finish.js:336-404`): Int16 metres, equirectangular, 4096 px wide (≤ 2.5M cells) or 8192 (10M), 2048 on phones, with `ocean` and `water` masks; Export writes it as 16-bit PNG (`v2/js/evolution/export.js`). The 10M mesh never leaves the finish worker; the page holds only the raster | none — V2's heights are already −10 … +9 km in metres; no quartic |
| BIO1 annual mean °C, BIO12 annual mm | the finish climate picture carries `tAnnual` (°C × 100) and `pAnnual` (mm) per pixel, ≤ 4096 wide (`finish.js:407 CLIMATE_WIDTH_MAX`) | none |
| BIO4 (std of the 12 monthly means × 100), BIO15 (CV of the 12 monthly rains, %) | `finishCells` (`v2/js/climate/core.js:238-293`) builds each land cell's **twelve monthly T and P** (`T12`, `P12`: the 1° grid's months, lapse-corrected to the cell's height, orographic rain factor, 200 km texture) and hands them to Köppen and to an `onCell` callback | compute the two statistics in that callback and add two planes to the climate picture — ~100 lines, exact WorldClim definitions, no proxy |
| Square pixels (metres per pixel the same in x and y) | equirectangular pictures | sample the region in a **rotated chart** with the region's centre on the chart equator (as Neural Earth does above 60°, but for every region): within ±10° of that equator the stretch is < 2 %. `locate()` (`v2/js/core/mesh-locate.js`) gives barycentric heights at any point on the sphere, so this is a sampling change inside the finish worker, not a new pipeline |
| Coarse cells no finer than the conditioning's own detail | finish cells: 160K 61 km · 640K 30 km · 2.5M 15 km · 10M 7.7 km (`edgeKm = 6371·√(8π/(√3·n))`) | the 30 m model wants a 10M finish (desktop only, ~53 s); the 90 m model is happy with 2.5M (~15 s) |
| 64 cells of context around a region | a planet | free: sample a 64-cell apron around the chosen region |
| Deterministic, headless runs for testing | `v2/js/climate-lab/evolution-world.js` runs history + terrain in Node; `finish.js` is DOM-free | none |
| A GPU | orogen.studio is static GitHub Pages (`.github/workflows/deploy.yml`); the page cannot run Python; V2 has no WebGL2/WebGPU compute (only a proposal in `plans/V2_PERFORMANCE_PLAN.md`) | the whole question of §4 |

## 4. The three ways to run it, and the recommended V0

The compute is the deciding constraint. Per pixel at 30 m the three networks cost ≈ 15 MFLOP (decoder ~1.4 TFLOP per 512²
tile covering 11.5 km; base ~0.4 TFLOP per 64² latent window covering 7.7 km; coarse negligible). Order-of-magnitude
figures, assuming ~25 TFLOPS effective on an RTX 3090 and ~5 TFLOPS effective for fp32 WebGPU on a desktop GPU:

| Region | Output | Work | RTX 3090 | Browser WebGPU (desktop) | CPU |
| --- | --- | ---: | ---: | ---: | ---: |
| 100 × 100 km at 30 m | 3 333² px | ~170 TFLOP | ~7 s | ~35 s | ~5 min |
| 300 × 300 km at 30 m | 10 240² px (200 MB 16-bit) | ~1.5 PFLOP | ~1 min | ~5 min | ~45 min |
| 920 × 920 km at 90 m | 10 240² px | ~1.5 PFLOP | ~1 min | ~5 min | ~45 min |
| Earth's land at 90 m | — | ~0.3 EFLOP | ~3 h | — | — |
| Earth's land at 30 m | — | ~2.5 EFLOP | > 1 day | — | — |

So: **a planet at 30 m is not a thing anywhere** (Neural Earth never does it either; the Minecraft mod generates around the
player). The product is "pick a region of a finished moment, get it at 30 m or 90 m". Three ways to run the networks:

**A. Export → refine offline → use (recommended V0; ~1–2 weeks).** The page exports a *conditioning pack*; a script on the
user's machine (NVIDIA GPU, or CPU slowly) refines it with upstream's pipeline; the result is a 16-bit PNG / GeoTIFF for
Gaea, Unreal, Wonderdraft — where our users already take exports. No change to the site's zero-friction promise: the pack
is one more Export type, the script is optional and documented. Upstream already has 90 % of the script
(`terrain_diffusion/inference/tiff_export.py`: imports five rasters with a 64-cell edge pad, runs `world.get()` in
chunks, writes int16). Steps, each checked before the next:

1. **BIO4 and BIO15 planes** in the finish climate picture (from `finishCells`' `T12` / `P12`), and a
   `conditioningRaster(region)` in the finish worker that samples the finished mesh in a rotated chart centred on the
   region, at exactly 7.68 km or 23.04 km per pixel, with the 64-cell apron: five Float32 planes. *Done when* a Node check
   (`v2/tools/check-conditioning.mjs`) shows the five planes of an Earth import and of a V2 world with sane ranges, and the
   chart's stretch is < 2 % over the region.
2. **"Diffusion conditioning" export** on the Evolution page (finished moments only, like the other exports): a region
   picker (centre by clicking the globe, size in km, model 30 m / 90 m), and a ZIP of five 16-bit PNGs plus a JSON sidecar
   with the scales, the chart, the seed and the moment. *Done when* a 300 km region of a 10M finish exports in a few
   seconds, desktop and phone layouts intact (phones: 90 m only).
3. **`tools/diffuse/refine.py`** (Python; terrain-diffusion pinned as a git submodule or `pip install git+…@commit`): reads
   the pack, `set_cond_snr`, `set_custom_conditioning_import` × 5, loops `world.get()`, writes the 16-bit PNG (our
   −11 … +9 km scale) and a GeoTIFF; options for seed, SNR per channel, model, device, bf16. ~200 lines, mostly
   `tiff_export.py`. *Done when* the 300 km region above comes back at 30 m on the developer's GPU within a couple of
   minutes and its mountains, rivers and coasts are recognisably the finished moment's.
4. **Quality pass** (the real unknown): compare SNRs — Neural Earth runs elevation at 0.05 and the climate channels at 0.5;
   upstream's default is 0.2 / 0.2 / 1.0 / 0.2 / 1.0 — on a fjord coast, a delta, a closed desert basin and a flood basalt.
   Decide what V2 keeps and what the model is allowed to redraw; write it down.
5. **Import of the result** (optional for V0): `import.html` reads 8-bit grey with white = 6 km; teach it 16-bit PNGs on our
   −11 … +9 km scale so a refined region can come back onto the globe for a look. README, tutorial, What's New per
   CLAUDE.md.

**B. In the browser (the "crazy world"; a 1-week feasibility spike before any commitment, then 4–8 weeks).** Technically
possible, and two existing ports show the route: Neural Earth's probe (ONNX Runtime Web + WebGPU), and the official
Minecraft mod, which runs the same three networks through **ONNX Runtime from Java** (DirectML on Windows, CUDA on Linux,
CoreML on Apple Silicon) with **1.5 GB of VRAM and a ~2.5 GB model download** — i.e. the stack already runs outside PyTorch,
on the same runtime family the browser would use. The browser version: ONNX Runtime Web's WebGPU backend in a worker; the
networks exported with upstream's own `terrain_diffusion/onnx/export.py` (the base in fp16 to halve its 1 GB); the noise
hash, DPM solver, tent-window fusion and Laplacian decode re-implemented in JavaScript from upstream's Python (a few hundred
lines; Neural Earth's `webgpu/*.mjs` is exactly this, but unlicensed — port from upstream). Non-negotiable constraints: a
**~0.6 GB weight download** the first time (then cached); **desktop with a real GPU only** (the base model's attention and
250 M weights, WebGPU's `maxStorageBufferBindingSize`, fp16 shader support — phones are out); and the table above's minutes,
not seconds. It would be an opt-in "Refine region (experimental, desktop GPU)" button on a finished moment, never on the
generate path. The spike: export the ONNX files, run one forward of each network in Chrome on the developer's desktop,
record ms per forward and memory, multiply by the table's tile counts. Go only if a 300 km region at 90 m lands under
~2 minutes.

**C. An optional local companion server (Neural Earth's shape).** A's script left running as a small localhost service the
page talks to; upstream already ships a Flask `api` with `/terrain?i1,j1,i2,j2`, and the Minecraft mod ships a local
browser explorer the same way. Little work beyond A, but "run this Python thing first" is the install friction we promise
not to have, so this is a convenience for A's users, not a product path.

**Recommendation: A, then measure.** It needs no server, no model download on the site, no new dependency on the page,
and it answers the question that matters before any browser work — *does the model respect V2's landforms at a usable
SNR?* If it does, B's spike tells us whether a desktop-only in-page button is realistic. If the base model's cost or the
coastline drift kills it, we have lost two weeks and gained a very good export for Gaea users. §6 adds a cheaper learned
path (a small super-resolution network) that *can* live in the page and should be weighed against B.

## 5. Risks and open questions

- **Weights licence** (Hugging Face `xandergos/terrain-diffusion-30m` / `-90m`): read before bundling or redistributing.
- **Earth prior.** The networks learned Earth: an ocean world, a desert planet or a 12 km range is out of distribution and
  may come out strange. V2's Earth-like worlds are fine; flag the exotic ones in the UI.
- **Coastlines and rivers.** The model may redraw a shore or leave a river unconnected across tiles. Mitigations: low
  elevation SNR; re-impose V2's land mask within a few pixels of the finished coast after decoding (Neural Earth does a
  version of this in its sub-30 m stage); accept that a 30 m export is a DEM, not a map with guaranteed hydrology.
- **Projection.** Equirectangular pixels are not square; the rotated regional chart removes the problem for regions, and
  there is no whole-planet mode in V0, so nothing is needed at the poles.
- **Memory.** A's script runs outside the tab; B would have to live beside a 10M finish worker (~3 GB) — another reason to
  measure first.
- **Resolution honesty.** 30 m here means "the model's native pixel", not a measurement; below it is procedural, as Neural
  Earth is careful to say. Our export naming should be as careful.

## 6. What others have tried, and what is worth borrowing (surveyed 2026-10-12)

**The same model, other front ends.** Upstream ships `azgaar-to-tiff` (Azgaar's Fantasy Map Generator JSON → the five
conditioning GeoTIFFs); a community fork feeds Azgaar heightmaps into the Minecraft mod; `finnnosam/Planetary-Terrain-
Diffusion` wraps the pipeline for whole planets with a **cube-sphere geometry by default** (equirectangular kept as
"legacy"), a draft-PNG input (black = −2000 m, white = 4000 m), per-channel SNR, and a GeoTIFF planet export whose default
is 8192 × 4096 — accepting the hours such a run takes. Neural Earth is the fourth. The pattern is always the same: *a coarse
map tool produces the five rasters; a local NVIDIA GPU does the rest.* Nobody has it in a browser. **Borrow:** the
conditioning-pack idea (A is this), cube or rotated charts for the sphere, the draft-PNG convention for hand-drawn input.

**Other sketch-to-terrain diffusion models.** Lochner, Gain, Perche, Peytavie, Galin & Guérin, *Interactive Authoring of
Terrain using Diffusion Models* (Pacific Graphics / CGF 2023): a pixel-space diffusion model trained on real DEMs, steered
by **style selection and feature sketches**, able to import an existing terrain and **amplify its resolution** "up to the
limits of the source data"; evaluated with drainage simulations; code, a Blender add-on and weights released (I could not
locate the repository from this container). *Terrain Diffusion Network* (Qin et al., 2023, arXiv 2308.16725): a
**climate-aware** multi-level diffusion model guided by **geological sketches — basins, peaks, rivers, ridges —**
extracted from NASA elevation data. Liu et al., *Single-shot example terrain sketching* (CGF 2025): a ControlNet fine-tuned
on ~7 000 US DEMs with ridge and valley contours as the condition. *Earthbender* (MIG 2025): Stable Diffusion + ControlNet
with a **multi-channel colour sketch** (edges for structure, colours for mountains, lakes, rivers). *TerraFusion* (Higo et
al., 2025): a latent diffusion model generating heightmap **and** texture with a sketch adapter (red valleys, green ridges,
blue cliffs); it found Stable Diffusion's VAE reconstructs heightmaps poorly and trained a heightmap-specific one;
PolyForm **Noncommercial** licence. *MESA* (Adobe Research / ESA, CVPR-W 2025): a Stable Diffusion 2.1 fine-tune producing
optical image + DEM from **text**, on an 8 GB GPU; it released **Major TOM Core-DEM, a global 30 m Copernicus DEM dataset**
on Hugging Face. **Borrow:** V2 can emit far richer conditioning than five rasters — exact ridge lines from its belts,
the carved river network, closed basins, crust type and age — which is what TDN, Earthbender and Liu condition on; if we
ever train or fine-tune anything of our own, that is the input design, and Core-DEM / ETOPO are the free training data.
Terrain Diffusion remains the only one of these built for *unbounded, seam-free* generation, which is why it is the right
first backend for A.

**DEM super-resolution (the realistic in-browser learned path).** A separate literature upsamples real DEMs 2–8× with small
networks: D-SRGAN (2020, 4×), DSRT (a window-attention transformer, 2023), TUGAN (U-Net + transformer + GAN, 2024), multi-path
transformers (2025). These are 1–10 M-parameter models that run through ONNX Runtime Web at interactive speed and
*preserve the input's structure by construction* — they sharpen V2's landforms instead of redrawing them. Trained on
Core-DEM / ETOPO pairs (e.g. 240 m → 60 m, or 7.7 km → 1 km), a 4× model over a 10M finish would take the picture from
8192 to 32 768 px (~1.2 km / px; a 1 GB Int16 planet, so tiled, or regional), on a laptop GPU, in the page. **Borrow:** this
is the "V0.5" to weigh against B — far cheaper, mobile-safe to skip, no hallucinated coastlines; it adds plausible 1–2 km
relief, not 30 m drainage. A training run is a week on one GPU with the open datasets; the harder part is a loss that
keeps V2's rivers connected.

**Non-learned amplification that runs anywhere.** *Example-based terrain synthesis* (Zhou, Sun, Turk & Rehg, TVCG 2007; GPU
follow-ups at UCT): copy patches of real DEMs that match a user's ridge/valley feature map, stitch with graph cuts and
Poisson editing — deterministic, CPU, no weights; dated against diffusion and no open code found. *Terrain amplification
with implicit 3D features* (Paris et al., 2019) and the whole Gaea / World Machine school: procedural detail + erosion,
no ML; our users already take exports there. *Interactive stream-power erosion on the GPU* (Schott, Paris, Fournier,
Guérin & Galin, SIGGRAPH 2023; `H-Schott/StreamPowerErosion`, MIT) and several WebGPU erosion demos in browsers show that a
**raster erosion pass at 100 m–1 km / px over a region is cheap in WebGPU** — notably Neural Earth's own roadmap wants "GPU
erosion on LODs 3–0 to recreate fjords", i.e. even with diffusion they want an erosion post-pass. **Borrow:** a WebGPU
stream-power + thermal pass over an exported region is a plausible first in-page "refine" with no weights at all; V2 already
has the analytic stream-power solver on the mesh (`v2/js/terrain/carve.js`), so this is a raster port, not new science.

**Tiny learned texture.** Neural cellular automata for height maps (Univ. of Ljubljana, 2025) and texture NCAs in general:
~10 K-parameter models that run as a fragment shader at 60 fps. Texture-scale detail only, no landforms; speculative, but
the one learned approach that would run on a phone.

**The sphere.** *SphereDiff* (KAIST, 2025) and *SphereDiffusion* (AAAI 2024) run MultiDiffusion on a **spherical latent
sampled uniformly over directions** to kill pole distortion in 360° panoramas — the same problem a whole-planet diffusion
would have, and V2's Fibonacci mesh *is* such a sampling. A research project, not a V0; for regions the rotated chart is
enough.

**What this changes in the recommendation.** Nothing for V0 (A). For the page itself, the cheapest credible ladder is:
WebGPU erosion pass on a region (no weights) → a small 4× DEM super-resolution network (tens of MB, in-page) → the full
Terrain Diffusion stack via ONNX Runtime Web (B, 0.6 GB, desktop only). Each rung is measured before the next.
