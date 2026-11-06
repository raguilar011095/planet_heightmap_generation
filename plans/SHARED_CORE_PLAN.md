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
- [x] **U2 — one viewer.** Evolution's picture, views and controls out of `evolution-main.js` (−527 lines) into
  `v2/js/view/planet-view.js` (globe, GPU painter, textures, glint, clouds, Satellite ahead, Add detail's tiles, lines,
  legend, hover lines; the page's own layers as cell colours and its own lines through hooks) and `v2/js/view/layer-bar.js`
  (view strip, tabs, rows, pickers, phone list, legend card — markup made once; the deposit and age menus from their
  lists, which adds the three deposits the hand-written menu had missed: Iron veins, Magnetite-apatite, Basalt and tuff).
  Evolution moves onto them: its painting code moved verbatim, every view checked in the browser.
- [x] **U3 — Generate on the shared viewer and finish (`?next=1`).** `js/entry.js` loads `js/generate-next.js` with
  `?next=1` (today's page without). The worker sends that page its mesh (z-up), the first picture (the ground in km and
  its hillshade, GPU-painted on Generate's mesh), the story frame and the finish's job (`planet-worker.js`
  sharedPayload); Evolution's finish runs in the background (FinishService; a new build, edit or Reapply cancels it; the
  climate sliders re-run only the finish). Generate's own: sliders, planet codes, plate edits picked through the globe
  (uv → region; the pieces pending and the one under the pointer drawn over the picture), the Plates view and the
  Inspect layers as cell colours (`js/generate-plates.js`). Evolution's export panel and catalogue, with Generate's file
  names and words (`initEvolutionExport` page/names/about/titleNote). The planet view's and layer bar's CSS moved from
  `v2/evolution.css` to `styles.css`. The old page's `?next=1` code (`present/layers.js`, `js/present-layers-view.js`,
  the present rows of `js/export-generate.js`) is unreachable now and goes with the old page in U5. Not yet: a Plates row
  in the export (U5).
- [x] **U4 — Import on the shared viewer and finish.** `js/import-next.js` (`?next=1`): the image's heights on
  Generate's mesh, shaped by Terrain Warp, Smoothing and Ridge Sharpening (terrain-post.js), as the first picture; the
  finish then erodes it by its climate (the erosion sliders read there; at their defaults, 0, no carving: the heightmap
  as drawn) — the carving's inputs those of ground with no history (`synthesize.js plainCarveInputs`), no Frame (the
  finish skips the rocks; `finish-drivers.js` the belts). No Plates or Geology tab (`mountLayerBar` `without`). The two
  new pages share their chrome (`js/page-chrome.js`). Evolution's finish hashed identical again.
- [x] **U5 — switch-over.** The new pages are Generate's and Import's (`js/main.js`, `js/import-main.js`; `?next=1` no
  longer needed). Gone: the old pages and renderer (`generate.js`, `planet-mesh.js`, `scene.js`, `map-projection.js`,
  `edit-mode.js`, `layer-bar.js`, `terrain-palette.js`, `export-generate.js`, `present-layers-view.js`,
  `terrain-metrics.js`), the worker's old pipeline (it builds the present-day world or an imported heightmap only),
  `present/layers.js`'s own Geology and Food (only the story frame left) and their G7d checks, the pages' hand-written
  bar markup, the G7e copy of Evolution's legend styles. Kept: the old terrain and climate files the climate's tuning
  tools still build their synthetic planets with (`tuning/climate/lib/gen-planets.mjs`: `elevation.js`,
  `super-plates.js`, `koppen.js`, the old climate) and `terrain-post.js` (Import's image shaping). Generate's export has
  its Plates row again (`initEvolutionExport` catalogue, produceOwn). Docs, tutorial, SEO, `llms.txt`, sitemap. What's
  New: the owner's call (not bumped). Not checked: a phone-sized window.

## Decisions

- Speed (owner, 2026-11-04, yes): the first picture as fast as before; the finish's layers (lakes, dunes, the full
  Satellite, Geology, Food) a few seconds later, in the background.
- Look (yes): Generate's rivers are carved by the climate's runoff, as Evolution's are.
- Order (yes): as above.
