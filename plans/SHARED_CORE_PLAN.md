# One core for Generate and Evolution

Owner, 2026-11-04: "examine how much of the code can be reused between the two. ideally future changes can very much
isolated in one place and apply to both." Then, on the plan below: "yea do it all now" (the speed, look and order
questions answered yes).

## Where it stood

Measured on `generate/g7f-export` (the static import closure of each page, main thread and workers):

| | Files | Lines |
|---|---|---|
| Generate (with `?next=1`) | 152 | 43,700 |
| Evolution | 166 | 37,200 |
| Loaded by both | 103 | 25,200 |

The science was shared (climate, terrain synthesis and carving, rocks, deposits, food). The work around it was not:

1. **Finishing the planet.** Evolution's finish (`v2/js/finish/finish.js` finishPlanet) runs 17 stages. Generate
   re-assembled five of them in its own files (`present/world.js` presentSynthesize, `present/layers.js`, the worker's
   climate) and skipped the rest: no lakes, dunes, loess, glacial deposits, ice age, river sediment, rock-shaped relief,
   rivers by flow, or the finish's Satellite.
2. **Views and controls.** Each page wired its own tabs, pickers, legend and hover; the deposit and age menus were
   written out by hand in both pages' HTML; Generate's copy lacked the Ages resource menu, the Hillshade, Clouds and
   Rivers & Lakes switches, and the river and lake hover. The layer ids differed (`biome`/`satellite`,
   `precip`/`rain`, `food`/`farming`).
3. **Drawing the planet.** Evolution paints an equirectangular texture on the GPU (`v2/js/app/globe-view.js`,
   `v2/js/view/gpu-paint.js`); Generate coloured its mesh region by region (`js/planet-mesh.js`, `js/scene.js`,
   `js/map-projection.js`). Hillshade, clouds, rivers and lakes, and Add detail's zoomed tiles existed only in
   Evolution's.

## The rule

The pages differ only in **where the world comes from and how it is steered**: Evolution's history, timeline and
planet files; Generate's sliders, plate edits and planet codes; Import's heightmap. Everything from the Frame down —
the finish, the views, the controls over the planet, the picture, the export — is one copy.

## Phases (each a PR in the stack after #129)

- [x] **U1 — one finish.** `finishPlanet` takes a page's own mesh and surface (`mesh`, `surface`; `surfaceConfig` gives
  the terrain config to draw it with), the finish worker passes them on (`mesh`, `surface`, `terrain`, `finish`
  overrides; no terrain pool then). Generate's ground pass keeps its uncarved surface for it
  (`presentSynthesize(…, finish)` → `surface`, the carve's erodibility at the finish's strength beside its own:
  synthesize.js `kAlt`), its first picture unchanged. Hydraulic Erosion scales the finish's carve too
  (`knobs.js finishOverrides`). Evolution byte-identical (finishPlanet's whole result hashed before and after).
  Measured: Generate's ground through the finish at 204K, Node, one thread: 8.3 s after the 2.2 s first picture.
- [ ] **U2 — one viewer.** Evolution's picture, views and controls out of `evolution-main.js` into shared modules:
  the planet view (globe, GPU painter, textures, glint, clouds, Satellite ahead, Add detail's tiles, overlays, legend,
  hover) and the layer bar (tabs, sub-tabs, deposit / age / resource pickers, season, phone list — its markup built from
  one list, not written in each page). Evolution moves onto them, its pictures unchanged.
- [ ] **U3 — Generate on the shared viewer and finish (`?next=1`).** A new Generate page module on the planet view and
  layer bar: the worker's first picture (the ground on Generate's mesh, GPU-painted), then Evolution's finish in the
  background (FinishService, cancelled by a new build, edit or Reapply). Generate's own: sliders, plate editing (picked
  through the globe: uv → region), the Plates view and Inspect layers as cell colours, planet codes. Evolution's export
  panel (its catalogue and scales; Generate adds Plates). Retires Generate's copies for `?next=1`
  (`present/layers.js`, `js/present-layers-view.js`, the present rows of `js/export-generate.js`).
- [ ] **U4 — Import on the shared viewer and finish.** The imported heights as the surface (no Frame: no Geology),
  the rest as Generate.
- [ ] **U5 — switch-over.** The new page is Generate's default; the old pipeline, renderer and climate leftovers go
  (`js/elevation.js`, `terrain-post.js`, `terrain-metrics.js`, `planet-mesh.js`, `scene.js`, `map-projection.js`,
  the old climate files); docs, tutorial, SEO, `llms.txt`, sitemap. What's New: ask the owner.

## Decisions

- Speed (owner, 2026-11-04, yes): the first picture as fast as before; the finish's layers (lakes, dunes, the full
  Satellite, Geology, Food) a few seconds later, in the background.
- Look (yes): Generate's rivers are carved by the climate's runoff, as Evolution's are.
- Order (yes): as above.
