# Terrain diffusion and V2 — a collaboration plan with Neural Earth

Draft, 2026-10-13, for the developer to agree before anything is built (plan first; one verifiable step at a time).
Nothing in this document is built.

**The goal is collaboration, not a second implementation.** [Neural Earth](https://github.com/dunkean/neural-earth) already
runs Terrain Diffusion on top of World Orogen and is working toward running it in the browser. World Orogen's job in that
partnership is the thing it is already good at: producing a believable planet, fast, in the browser, and handing it over in
the shape their pipeline wants. This plan says what that shape is, why V2 is a far better source for it than V1, and what
V0 looks like. The model itself, the GPU work and the browser inference stay theirs.

## 1. What terrain diffusion is, in plain words

V2 paints a planet at the scale of a wall map: a finish mesh cell is 7.7 km (10M cells) to 15 km (2.5M) across, and the
finished picture is 8192 or 4096 px wide — about 5 or 10 km a pixel at the equator. [Terrain Diffusion](https://github.com/xandergos/terrain-diffusion)
(Goslin, SIGGRAPH 2026, MIT code) is a set of neural networks that have *learned what real Earth terrain looks like at
30 m* — from the ETOPO relief model, 30 m / 90 m elevation data and WorldClim climate — and can paint plausible 30 m detail
*between* your pixels, guided by your map. It is the heightmap equivalent of a sketch-to-photo tool: your map says
"mountains here, this wet, this cold", the model fills in ridges, valleys, drainage and texture the way Earth would have
them. It is **not an upscaler**: it invents new terrain statistically consistent with your map, and a knob (called SNR)
decides how closely it must follow it.

Three networks, from the `xandergos/terrain-diffusion-30m` checkpoint (a 90 m one also exists):

| Network | Size | Input | Output |
| --- | ---: | --- | --- |
| **Coarse** | ~2.8 M params (11 MB) | five maps at **7.68 km / px**: height (m), mean temperature (°C), temperature seasonality, annual rain (mm), rain seasonality — the WorldClim variables BIO1, BIO4, BIO12, BIO15 | an "Earth-like" redraw of the same five maps, 64 × 64 cells a tile |
| **Base** | ~250 M params (1.0 GB fp32) | a 4 × 4-cell coarse neighbourhood | a 64 × 64 **latent** tile at **240 m / px** describing the landforms, plus a smooth low-frequency height |
| **Decoder** | ~28 M params (111 MB) | the latents, 8× upsampled | the 30 m height *detail*, 512 × 512 px a tile |

Final height = decoded detail + upsampled low-frequency height, in signed-square-root space (so one network spans −10 000 m
trenches and 9 000 m peaks). The output is always **256× the conditioning raster** on each axis: a 7.68 km input cell
becomes 256 × 256 pixels of 30 m. Every tile's noise is a hash of (seed, position), so any tile can be computed alone and
overlapping tiles blend seamlessly ("InfiniteDiffusion"). Work is proportional to the area asked for: a whole planet at
30 m is ~2.5 EFLOP, more than a day on an RTX 3090 — **nobody computes a planet at 30 m**; everyone refines what is on
screen or a chosen region.

Two things the model does not do: it has no notion of a sphere (training tiles are square metre pixels between 60°S and
60°N, so whoever feeds it must supply square pixels and accept that it never saw polar terrain), and it does not promise
to keep your coastline or connect your rivers across tiles (Neural Earth: "a land mask does not force the neural DEM into
the initial silhouette"). V2's finish stays the place where landforms are *decided*; diffusion is a last pass that makes a
30 m export look like a DEM.

## 2. What Neural Earth built, and where it is heading (as of 2026-10-12)

Neural Earth is five days old (first commit 2026-10-07), ~150 commits across `main` and a `distill` branch, one developer
with an RTX 4090 and 5090 running an AI-assisted research loop; its direction changes by the day. What it does today:

- **Orogen side: V1 only, worked hard to fit.** `native/orogen/vendor/` is a copy of nineteen V1 modules from a snapshot
  older than `main`, run headlessly under Node by a shim that fakes `self.postMessage` and swaps the CDN Delaunator import.
  CUDA rasterises V1's sphere triangles into a 2048 × 1024 equirectangular atlas. V1's unit heights become metres with V1's
  quartic plus a `coastal-slope-v1` term they added because V1's coasts came out as sub-metre plains. V1's two seasons are
  turned into WorldClim's seasonality statistics by a harmonic approximation (`orogen_bioclim`), which they document as "a
  statistic contract, not actual monthly weather". Their maintenance note (2026-10-10) reviewed upstream commit `cc2662b4`
  and deferred integrating it: 14 of 19 files differ. They have not looked at V2.
- **Inference today: a local Python/CUDA server**, reference card RTX 3090 24 GB; WebGPU is used for rendering only.
  Above 60° latitude the globe switches to a chart rotated 90° so the poles sit on its equator; mid-latitude tiles keep the
  equirectangular stretch.
- **Heading for the browser.** On 2026-10-12 the `distill` branch's stated priority flipped from speed to size: the base
  model must be "small enough to be embedded in the page", target **50–100 MB, ceiling 150 MB**, with the WASM/WebGPU
  runtime "already handled by the user". Their route is weight-only 4-bit quantisation of the unchanged 254 M-parameter base
  (149.6 MB packed) plus quantisation-aware fine-tuning; by their notes valleys survive, flat plains gain high-frequency
  grain, coasts get scattered pixels. Every attempt at a *smaller architecture* failed on erosion shapes, so the weights
  stay and only their storage shrinks. Coarse (4-step, 11 MB) and decoder (13 MB) distillations already shipped. Their
  `webgpu/` folder is an ONNX Runtime Web + WebGPU feasibility probe that reproduces a CUDA crop to within 1 m.
- **Their roadmap's next items** are ugly ice caps ("from old noise"), seasons, exports, and coastline cleanup — all things
  V2's finish already has.
- **Licensing:** Terrain Diffusion's code is MIT; the weights are on Hugging Face with their own terms (not reachable from
  this container — read them before anything ships). Neural Earth bundles GPL-3 Orogen and has no licence file of its own.

## 3. Why V2 is the right source

What the model needs is five co-registered rasters at 7.68 km / px (30 m model) or 23.04 km / px (90 m), in physical
units. V2 produces almost all of it already (surveyed 2026-10-12; all of it CPU, in workers — V2 uses the GPU for display
only):

| Needed | V2 has | Gap |
| --- | --- | --- |
| Elevation in signed metres | `finishRaster` (`v2/js/finish/finish.js:336-404`): Int16 metres, equirectangular, 4096 px wide (≤ 2.5M cells) or 8192 (10M), 2048 on phones, with `ocean` and `water` masks; `v2/js/evolution/export.js` writes 16-bit PNGs. The 10M mesh never leaves the finish worker | none — no quartic, no coastal fix: V2 has a real shelf ramp and coastal slope |
| BIO1 annual mean °C, BIO12 annual mm | the finish climate picture: `tAnnual` (°C × 100), `pAnnual` (mm), ≤ 4096 wide | none |
| BIO4, BIO15 (seasonality of the 12 monthly means) | `finishCells` (`v2/js/climate/core.js:238-293`) builds each land cell's **twelve monthly T and P** (`T12`, `P12`) and hands them to Köppen and an `onCell` callback | compute the two statistics in that callback — ~100 lines, exact WorldClim definitions, no proxy |
| Square pixels | equirectangular pictures | sample regions in a **rotated chart** with the region's centre on the chart equator (stretch < 2 % within ±10°); `locate()` (`v2/js/core/mesh-locate.js`) gives barycentric heights anywhere on the sphere, so this is a sampling change in the finish worker |
| Coarse cells no finer than V2's own detail | 160K 61 km · 640K 30 km · 2.5M 15 km · 10M 7.7 km (`edgeKm = 6371·√(8π/(√3·n))`) | the 30 m model wants a 10M finish (desktop, ~53 s); the 90 m model is happy with 2.5M (~15 s) |
| Ice, lakes, closed basins, seasons, rivers | the finish: Earth-like ice age (sheets, fjords, moraines, rebound), lakes by water balance, pans, 12 months, river polylines with regimes | none — these are Neural Earth's open roadmap items |
| Headless, deterministic runs | `v2/js/climate-lab/evolution-world.js` runs history + terrain in Node; `finish.js` is DOM-free | a CLI entry point (§4.1) |

## 4. The deliverable: what V2 should hand over

Everything Neural Earth built around V1 exists to manufacture five GeoTIFFs from something that was not designed to
produce them. The output that makes their life easiest is those files, in their units, from a command they can run.

### 4.1 A headless command

```
node v2/tools/export-planet.mjs --seed 42 --sim 20000 --finish 10000000 --myr 1200 --out world-42/
```

with a `package.json` so `npm install` resolves Delaunator. This alone lets them delete the Node shim, the AST-rewriting
CUDA adapter and the upstream-tracking process. The same code path serves the page's own export (§5), so it is one
implementation, not two. A `--stage` switch emits the pre-carve tectonic surface, the finished surface, or both; a
`climate-only --heightmap other.tif` command runs V2's climate on a surface they eroded themselves (they do this today for
their GPU erosion) — `computeClimate` already takes heights and a land mask per cell.

### 4.2 The five channels, exactly, as float32 GeoTIFF

Upstream's own `tiff_export` filenames, so the folder also feeds Terrain Diffusion's exporter and the Planetary fork with
no adapter:

| File | Content | From |
| --- | --- | --- |
| `heightmap.tif` | signed metres, sea negative | `finishRaster` |
| `temperature.tif` | BIO1, annual mean °C | mean of `T12` |
| `temperature_std.tif` | BIO4, std of the twelve monthly means, °C (×100 is applied by the reader) | `T12` |
| `precipitation.tif` | BIO12, mm / yr | sum of `P12` |
| `precipitation_cv.tif` | BIO15, coefficient of variation of monthly rain, %, with WorldClim's +1 mm and 12/11 correction | `P12` |

Float32 needs no scale/offset decoding; `rasterio` reads it; an uncompressed GeoTIFF for a global grid is a fixed set of
TIFF tags plus four GeoKeys, ~150 lines of JavaScript, and it works in the browser too. 16-bit PNG stays the human-facing
export; GeoTIFF is the machine-facing one.

### 4.3 Masks and layers their UI already draws

- `ocean.tif`, `lakes.tif`, `ice.tif` (8-bit). Their convention "sea iff height < 0" is wrong for V2's below-sea-level
  closed basins and lakes; say so in the manifest.
- `koppen.tif` (8-bit classes), `plates.tif`, `crust.tif` (ocean / continent / craton / arc), `belt.tif` (kind and
  `oroWork`), `hotspots`, `rivers.geojson` (polylines with discharge and regime).
- The 1° grid's twelve-month winds, sea-level pressure, currents and sea ice as 12-band float32 TIFFs.
- Not colours, not satellite imagery: they render their own.

### 4.4 Geometry and resolution, stated

Equirectangular, pixel-centred, row 0 north, longitude −180° at column 0, 8192 × 4096 from a 10M finish (2.5M → 4096). For
a region, the rotated-chart option of §3 at exactly 7.68 km or 23.04 km per pixel with a 64-cell apron, the chart's
rotation recorded in the manifest so they can place the result. The whole-planet raster is theirs to sample as they do
now; the regional chart is the one that gives the model square pixels.

### 4.5 One manifest

`manifest.json`: generator version, seed, every slider, sim and finish cell counts, moment in Myr, raster and unit
conventions, file list with SHA-256. They hash every source file to invalidate caches; this gives them an identity
without reading our code.

### 4.6 What we deliberately do not do

No server, no model weights on orogen.studio, no GPU dependency on the generate path, no change to the live timeline.
Diffusion never touches the planet shown on the page; it refines an *export*. If their in-page inference lands, a
"Refine region" button that loads *their* quantised weights through ONNX Runtime Web is a possible later step, desktop
only, opt-in, after a measured spike — see §7.

## 5. The ethos check

CLAUDE.md's seven strengths, against this plan:

1. **Climate depth** — strengthened: the twelve monthly layers become the exact WorldClim statistics; ice, lakes and
   seasons go out as layers. Nothing is simplified.
2. **Instant, in-browser, zero-friction** — unchanged: the pack is one more Export type; the CLI is for servers and
   partners; the model never runs on the generate path and no download is required to use the site.
3. **Interactive plate editing** — untouched (V2's history has its own controls; V1 unchanged).
4. **True globe** — unchanged; the rotated regional chart exists *because* the globe is primary and the model is flat.
5. **Free and open source** — unchanged; the export is a format, not a gate. GPL-3 stays; the weights' licence is
   Neural Earth's problem until we ever load them.
6. **Mobile** — the export must work at 2048 px and 640K on phones (90 m conditioning only); the 10M / 30 m path is
   desktop, as the 10M finish already is.
7. **Terrain aesthetics** — protected: V2's fjords, deltas, basins and gorges are the *input*; a low elevation SNR on
   their side keeps them. We do not let a model redraw the planet people see.

Scientific grounding is served the same way it always has been: the five channels are the real geophysical variables
the model was trained on, computed from V2's own climate, not faked.

## 6. V0 — steps, each checked in the browser or Node before the next (~1–2 weeks)

1. **BIO4 / BIO15 planes** from `finishCells`' `T12` / `P12`; a `conditioningRaster(region | planet)` in the finish worker
   with the rotated chart and apron. *Done when* `node v2/tools/check-conditioning.mjs` shows sane ranges on an Earth
   import and a V2 world, and chart stretch < 2 % over a region.
2. **GeoTIFF writer** (`v2/js/view/geotiff.js`, float32 and 8-bit, global and regional geotransforms) + `manifest.json`.
   *Done when* `rasterio` and QGIS open the files with the right georeferencing.
3. **`export-planet.mjs` CLI** wrapping history → finish → climate → files, with `--stage` and `climate-only`. *Done when*
   a 10M export of a 1200 Myr world finishes in Node in about a minute and memory stays under 4 GB.
4. **"Diffusion conditioning" export** on the Evolution page (finished moments only): region picker (click the globe,
   size in km, 30 m / 90 m) or whole planet; a ZIP of the files. Desktop and bottom-sheet layouts; phones 90 m only.
   README, tutorial, What's New per CLAUDE.md.
5. **Hand-off**: open an issue on `dunkean/neural-earth` with a sample pack and the manifest; the ask is that their
   `terrain_conditioning.py` grows an `orogen-v2` source that reads the files directly. Their side, not ours.
6. **Optional, for users without Neural Earth**: `tools/diffuse/refine.py`, ~200 lines on upstream's `tiff_export.py`, that
   turns a pack into a 30 m / 90 m 16-bit heightmap on a local GPU. Keep it a documented script, never a site dependency.

## 7. Open questions and risks

- **The quality question** is on their side but decides whether any of this matters: at what elevation SNR does the model
  keep V2's landforms? Neural Earth runs elevation at 0.05 and climate at 0.5; upstream's default is 0.2 / 0.2 / 1.0 /
  0.2 / 1.0. Step 5's sample pack is how we find out.
- **Earth prior**: ocean worlds, desert planets and 12 km ranges are out of distribution; nothing poleward of 60° was in
  training. Flag exotic worlds; let the climate channels do what they can.
- **Coastline drift and river continuity** are properties of the model, not of our export; the land mask lets them
  re-impose the shore after decoding, as they already do below 30 m.
- **Their timeline**: the `distill` branch rejects most of its own experiments within a day. Plan for the pack to be
  useful to their *current* CUDA server; treat in-page inference as a bonus.
- **Weights licence**: read before any "Refine" button is considered.
- **Resolution honesty**: 30 m means the model's native pixel, not a measurement; our export names should say
  "conditioning", never "30 m terrain".

## Appendix — the wider field, briefly (surveyed 2026-10-12)

Kept short on purpose; this is background, not scope.

- **Same model, other front ends**: upstream's `azgaar-to-tiff`; a Minecraft mod (ONNX Runtime from Java, 1.5 GB VRAM,
  2.5 GB download); `finnnosam/Planetary-Terrain-Diffusion` (whole planets on a cube-sphere, GeoTIFF out, hours per
  planet). Always the same pattern: a map tool makes five rasters, a local GPU does the rest.
- **Other sketch-to-terrain diffusion** (Lochner et al. 2023; Terrain Diffusion Network 2023; Liu et al. CGF 2025;
  Earthbender 2025; TerraFusion 2025, noncommercial; MESA 2025, text-to-DEM, which released the open 30 m Copernicus
  **Core-DEM** dataset): bounded tiles, condition on ridges / rivers / basins — exactly what V2 has exactly, if anyone ever
  fine-tunes.
- **DEM super-resolution** (D-SRGAN, DSRT, TUGAN): 1–10 M-parameter networks that sharpen rather than redraw; the one
  learned thing small enough to live in our page someday, and the natural "V0.5" against which to weigh any in-page
  diffusion.
- **No-weights amplification**: example-based synthesis (Zhou et al. 2007), and GPU stream-power erosion
  (Schott et al. SIGGRAPH 2023, MIT) — a WebGPU erosion pass over an exported region is the cheapest in-page "refine",
  and even Neural Earth's roadmap wants one after diffusion.
- **The sphere**: SphereDiff / SphereDiffusion run MultiDiffusion on a latent sampled uniformly over the sphere; V2's
  Fibonacci mesh already is that sampling. Research, not V0.
