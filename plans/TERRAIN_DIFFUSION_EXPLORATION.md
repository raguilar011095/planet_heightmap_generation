# Terrain diffusion and other learned terrain models: an exploration

Owner (2026-11-06): "explore terrain diffusion, and other potential open source models that generate realistic terrain.
I'm curious what could be used out of the box, how would we update our program? How can we deal with distortions on the
poles?" This document is the exploration: what exists, what a browser can run, where a model would plug into Orogen, how
to put a flat-tile model on a sphere, and a recommendation. Nothing here is built; it is a decision document.

<!-- RESEARCH SECTIONS TO FOLLOW -->

## Where Orogen stands (what a model would have to fit)

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

So the only place a learned terrain model fits Orogen's vision is **as a detail layer below the mesh**: given the finished
picture (and the drivers, rock and climate), produce the heights of a window at a finer pixel size, keeping the picture's
own low frequencies exactly and adding only what a mesh of 7–15 km cells cannot hold. In machine-learning terms that is
**conditional DEM super-resolution / detail synthesis**, not unconditional terrain generation. Unconditional models
(a diffusion model that dreams up a 256 × 256 mountain tile from noise) are the wrong tool: they would need a conditioning
path we would have to train ourselves anyway.
