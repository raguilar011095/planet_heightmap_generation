# Generate

**A planet in seconds, shaped by hand:** [orogen.studio/generate](https://orogen.studio/generate)

Set the continents, plates and climate with sliders, then reshape any plate you don't like. Every planet comes with the
full seasonal climate (wind, ocean currents, rain, Köppen zones) and a planet code that rebuilds it exactly. Of the
Studio's tools it is the fastest and the most phone-friendly; its profile is in [VISION.md](../VISION.md#the-tools).

The view (the layer tabs, the map projections), the climate and the export panel are shared by every tool: see
[shared.md](shared.md). Back to the [README](../README.md).

## Building a planet

Click **Build New World** to create a new random planet. The button changes color and label based on what you've adjusted:
- **Build New World** (blue) — generates a fresh planet with a new random seed
- **Rebuild** (amber) — re-renders the current planet at a new detail/roughness level without changing continent shapes
- **Regenerate** (red) — creates new tectonic plates when the Plates or Continents slider has changed

## Sharing planets

Every generated planet produces a **planet code** (shown below the Build button) that encodes the random seed, all slider values, and any plate edits. The seed is one of 2,147,483,646 (0 to 2,147,483,645: each its own world — the seeded generator's every starting state; before 2026-10 new planets drew from the first 16.7 million, whose codes read as they always did). An unedited planet is 22 characters; plate edits (applied via Rebuild) extend the code to include the toggled plates. Older codes (13–21 characters) from previous versions are still supported — missing sliders default to their current default values. To share a planet:

- **Copy** the code with the copy button and send it to someone
- **Load** a code by pasting it into the planet code field and clicking Load (or pressing Enter). The Load button turns blue when a new code is ready to apply.
- **URL sharing** — the code is also stored in the URL hash (e.g. `#a7f3kq9xp2b`), so you can share the full URL directly (`orogen.studio/generate#…`; a link from before Generate moved there, `orogen.studio/#…`, is sent on to it by the home page). Opening a URL with a valid hash auto-loads that planet, including any plate edits.

## Controls

### Shape Your World

Core world parameters that control the planet's structure (changing these requires a full rebuild):

| Control | Range | Default | Description |
|---------|-------|---------|-------------|
| Detail | 5,000 – 2,560,000 | 204,000 | Number of Voronoi cells on the sphere. Only affects rendering resolution — continent shapes are stable across detail levels (generated on a fixed ~20K reference grid) |
| Irregularity | 0 – 1 | 0.75 | Randomization of Fibonacci point positions |
| Plates | 4 – 120 | 80 | Number of tectonic plates |
| Continents | 1 – 10 | 4 | Target number of separate landmasses |
| Roughness | 0 – 0.5 | 0.40 | Fractal noise magnitude for terrain roughness |
| Continent Size Variety | 0 – 1 | 0.35 | How much continent sizes vary — 0 keeps continents similar in size, 1 allows a mix of large and small landmasses |
| Land Coverage | 0 – 1 | 0.3 | Percentage of the planet covered by land. Low values create ocean worlds, high values create large continents whose interiors, far from the sea, are drier |

### Terrain Sculpting

Knobs on the ground drawn from the present-day world (collapsed by default). They do not rebuild the world: adjusting any
slider lights up **Reapply**, which draws the ground again from the same plates and past, then finishes it again. At their
defaults the ground is drawn exactly as Evolution draws its own (`v2/js/present/knobs.js`).

| Control | Range | Default | What it scales |
|---------|-------|---------|-------------|
| Terrain Warp | 0 – 1 | 0.75 | How far the records are read off-place: the organic wander of coasts and belts |
| Smoothing | 0 – 1 | 0.10 | Wear: crests spread wider and lower (the same bulk) |
| Glacial Erosion | 0 – 1 | 0.50 | How far fjords reach up their valleys (the finish's ice age carves its own) |
| Hydraulic Erosion | 0 – 1 | 0.50 | How long the rivers work: the first picture's carve and the finish's, by the climate's runoff |
| Thermal Erosion | 0 – 1 | 0.10 | The valley sides' critical slope: more, gentler talus-softened slopes |
| Ridge Sharpening | 0 – 1 | 0.50 | The parallel ridges, the ridge noise and the crests' ruggedness |

Roughness (in Shape Your World) scales the hills, the coast's bays and the fine relief.

### Climate

| Control | Range | Default | Description |
|---------|-------|---------|-------------|
| Temperature | -30 – 30 W/m² | 0 | Warms or cools the whole planet. The value is the change in the heat its air holds in — a radiative forcing in the energy balance, in W/m². Snow, sea ice and ice sheets amplify a cooling far more than a warming: on Earth −10 cools the planet ≈ 8 °C and +10 warms it ≈ 6 °C, and past −20 the ice runs away — sea ice on a quarter of the sea at −20, a snowball planet by −28 to −30. The winds and currents shift with them, and warmer seas evaporate more, so a warm world is wetter and a cold one drier |
| Precipitation | -1 – 1 | 0 | The pace of the water cycle (±50 %): evaporation from the seas and land scaled, so about that much more or less rain overall — where it falls still follows the winds and mountains |

Releasing either slider finishes the planet again (the ground stays): its rivers, ice, Satellite view, rocks and food all
follow the new climate.

### Inspect (advanced)

A folded section at the foot of the sidebar: **The world's past**, per region — Sea-floor age, Mountain belts by kind,
Mountain belts by age, Cratons. **None** returns to the tab shown.

## Tutorial & Help

A five-step tutorial modal introduces the tool on first visit (auto-shown via `localStorage`). It covers planet generation, slider controls, interactive editing, visualization, saving/sharing via planet codes, and map export. A **?** help button in the top-right corner reopens the tutorial at any time. The modal can be dismissed with the close button, backdrop click, Escape key, or the "Get Started" button on the final step.

A **What's New** modal is shown once per release to returning users (those who have already dismissed the tutorial). It highlights new features, changes, and a heads-up when saved links, planet codes or planet files give a different world, with the address where the previous version still opens them. The modal uses a versioned `localStorage` flag (`wo-whatsnew-seen`) — bump the `VERSION` constant in `whatsNew()` (`js/main.js`) to trigger it again on the next release.

## Interaction

| Action | Desktop | Mobile |
|--------|---------|--------|
| Rotate globe / pan map | Drag | Drag (one finger) |
| Zoom | Scroll wheel (past the picture's own pixels, the detail finer than the mesh is drawn in tiles) | Pinch with two fingers |
| What is here | Hover | Tap |
| Mark a piece for reshaping | Ctrl-click it (Cmd-click on a Mac; the piece under the pointer lights while Ctrl is held) | Tap the edit button (pencil), then tap pieces |
| Undo a pending piece | Ctrl-click it again | Tap it again |
| Apply pending edits | Click the Rebuild button | Tap the Rebuild button |
| Cancel all pending edits | Press Escape | — |

The hover card reads as Evolution's (`v2/js/view/planet-view.js` readoutLines), with Generate's own lines first: the piece
(land or ocean, and what Ctrl-click would do), the plate it rides (its number and speed here) and its crust (an ocean
floor's age, a belt and when it was last active, a shield, a flood basalt). Then the height, the river (its flow, its year
and its floods) or lake, the place, and the layer's own — the climate, the rock and its record, the deposits or the age's
resources and the district's story, or the land's food. Over every view, as on the old page: the piece under the pointer
lightens while Ctrl (⌘) is held, and each pending piece is tinted by what it will become — green to rise as land, blue to
sink — with the ground showing through, to its own outline (`js/generate-plates.js`). The hover card steps up over the
Rebuild button while edits wait.

## Mobile Support

Generate is fully usable on phones and tablets:

- **Bottom-sheet sidebar** — on screens 768px or narrower, the sidebar becomes a bottom sheet with a drag handle. Drag or tap the handle to expand/collapse. The globe stays visible above.
- **Pinch-to-zoom** — two-finger pinch zooms the globe and map.
- **View switcher** — the layer list (top-right) holds every view: Terrain, Satellite, Heightmap, Plates, the climate's, Geology's and Food's; the Geology pickers stay under it.
- **Edit-mode toggle** — a floating pencil button (bottom-right) activates plate editing. Tap it to toggle edit mode (glows green when active), then tap pieces to mark them. Tap the Rebuild button to apply all changes at once.
- **Touch-friendly targets** — buttons, chips, pickers and sliders are 44 px or more.
- **Performance** — detail warning thresholds are lowered on touch devices (orange at 200K, red at 500K); the finished picture is 2048 px wide; export widths above 4096 px are off.
- **Tooltips** reposition above their trigger instead of to the right, so they stay on screen.

## What it builds

Generate builds one moment of a believable history — today's — in closed form, then finishes it with Evolution's own
finish (plans/GENERATE_REDESIGN_PLAN.md, plans/SHARED_CORE_PLAN.md):

- **The pieces** (the plates the sliders lay out and Ctrl-click reshapes; the layout is today's, so every planet code ever
  shared keeps its continents) are grouped whole into ~1.5 √P plates that move and carry continent and ocean, their
  edges along some coasts, their motion fitted from the pieces' own.
- **Today's boundaries** by kind — ridges, rifts, trenches (some splitting off island arcs and back-arc seas), collisions,
  transforms — and the sea floor's age away from its ridges.
- **The past in closed form** — the continents assembled from their pieces as old orogenies, their ages spread as a
  history's are (the cores ~2000 Myr old, the docking rings younger outward to the margins' 40–300 Myr, the pieces'
  seams 5–150 Myr), each worn as Evolution's history wears a range — faster the higher it stands, on Evolution's own
  clocks — so a range's age shows: young ranges high and sharp, middle-aged ones ridged hills, old ones worn low; cratons;
  seams closing into ranges or sagging into gulfs; the pieces' outlines bent by today's plates; continents that fit
  across their ocean; plumes, hotspot tracks and flood basalts; the far field pushing ranges inland.
- **A geological record** (plans/GENERATE_DEPOSITS_PLAN.md) — written by the history's own steps, in shortcut: the old
  crust worn deep before anything else, each range since by its age; a foreland basin in front of every range, today's
  and the past's; rift basins along every coast where an ocean opened and in the old failed rifts; shelves and inland
  seas; each place's sediment laid layer on layer by the latitude it lay at (limestone in warm seas, salt in the dry
  belts, coal in the wet ones, black mud where the sea was cut off); the arcs docked in the past and those swept inland
  behind today's; old flood basalts worn to their roots. Evolution's rocks, deposits and food read it on Evolution's
  clock, so Generate's ores sit where Evolution's would and in about its shares.
- **Ranges carved into massifs** (plans/GENERATE_RANGES_PLAN.md) — each range of the past, each rift and each range the
  far field squeezes up runs where its pieces met, on its own outline, but swells and pinches and rises and falls along
  it, and a fractal mask of its own carves it into massifs, lobes and spurs (the original Generate's way); where the mask
  leaves nothing, no belt and none of its rocks. Each is one of several kinds by what raised it and a roll of its own —
  a spine, a plateau behind a rim range, a broad fold belt, basement blocks, a narrow sliver, a knot. A rift is a chain
  of basins, each a half-graben whose high shoulder flips side to side, deepest where its plates open fastest and dying
  out where they barely part.
- **A Frame** written from all of it, as Evolution's history writes one — so Evolution's terrain draws the ground on
  Generate's mesh (fine relief, rift valleys, interlocking coasts, the ground held to the pieces), carved by its rivers:
  the first picture, in seconds.
- **Evolution's finish**, in the background (a few seconds more): the climate, the rivers carved again by its runoff with
  closed basins and sediment, lakes, the last ice age, dunes and loess, the rocks and their deposits, the land's cover
  (the Satellite view, with clouds), and its food.

## How It Works

### Pipeline

1. **The mesh** — a Fibonacci sphere of Detail regions (`js/sphere-mesh.js`).
2. **The layout** — Generate's pieces on a fixed ~20K reference grid, projected onto the mesh (`js/coarse-plates.js`, `js/plates.js`, `js/ocean-land.js`) and their motion (`js/plate-physics.js`); a planet code's edits toggle pieces. An edit reshapes the place edited, as on the old page: the
   world's past is the layout's as first built, the plates there before keep their pieces and their motion (a raised piece
   joins the plate it borders most), and each mechanism's draws are keyed by who they belong to, so the rest of the planet
   stays as it was (`v2/js/present/world.js`, `plates.js`) — a planet code's edits build the same.
3. **The present-day world** — on Evolution's 40K sim mesh (`v2/js/present/`): plates, boundaries, sea floor, coast, past, belts, plumes and far field (their ranges shaped by `ranges.js`), record, Frame.
4. **The ground** — Evolution's synthesis and carving (`v2/js/terrain/`) on Generate's mesh, with Generate's fine relief, rift valleys, interlocking coasts and hold to the pieces (`v2/js/present/world.js`); the uncarved surface kept for the finish. The ranges' ridges have the variety the owner asked of Evolution's on 2026-10-28, the same in both tools: old belts a little less even than young ones, the ridges undulating at every scale about their own wavelength, and more ridge noise at three scales (`v2/js/terrain/terrain-config.js`).
5. **The first picture** — the ground and its hillshade, painted on the GPU (`v2/js/view/planet-view.js`).
6. **The finish** — Evolution's (`v2/js/finish/finish.js`), in its own worker, from that surface: the climate (`v2/js/climate/`), bedrock, rivers, sediment, hillslopes, the ice age, wind, sea, water, detail drivers, geology, the land's climate and cover, deposits, farming — then its pictures.

## Code

Generate and Import Heightmap live in `js/` (the climate they run is `v2/js/climate/`; Generate's present-day world is
`v2/js/present/`, listed in `v2/README.md`):

```
js/
  main.js               Generate's page, on the shared core (plans/SHARED_CORE_PLAN.md): the worker's present-day world as
                        the first picture, Evolution's finish in the background, on Evolution's planet view, layer bar and
                        export (v2/js/view/planet-view.js, layer-bar.js; v2/js/evolution/export.js); its own: the sliders,
                        the planet code, the plate edits, the build overlay, the tutorial and What's New
  import-main.js        Import Heightmap's page, on the shared core: the image's heights as the first picture, Evolution's
                        finish in the background (its climate, rivers, lakes, ice, dunes, Satellite, Food — no Frame, so
                        no Geology)
  page-chrome.js        The chrome both pages share: slider bubbles, the Detail warning, the side panel and bottom sheet,
                        the build overlay, the tutorial
  generate-plates.js    Generate's own layers on the planet view: the Plates view (colours, boundaries, arrows; its export
                        map), the Inspect list's layers of the world's past, the edits pending drawn over the picture
  present-crust.js      The present-day world's crust in words (the hover's Crust line)
  planet-worker.js      The worker: the present-day world (v2/js/present/) or an imported heightmap, sent with the finish's job
  state.js              The touch device and edit mode
  planet-code.js        Planet code encode/decode (seed + sliders + edits → base36)
  detail-scale.js       Non-linear (power-curve) Detail slider mapping
  build-error.js        A failed build or import shown in the build overlay, with a Close button; the controls held during a build
  view-strip.js         The view strip above the layer tabs (every page), folded behind an arrow: Globe | Map and what applies,
                        the projection picker; in the sheet on phones
  theme.js              Classic script in each page's <head>: Paper or Night, the device's choice until the theme switch
                        saves one (before the first paint, so no flash); window.orogenTheme lets the globes' stage follow
  support-check.js      Classic script run before the modules: a browser that cannot run the app (no import maps, no
                        WebGL) or app code that fails to load gets a plain message instead of a blank page
  rng.js                Seeded PRNG (Park-Miller LCG)
  simplex-noise.js      3D Simplex noise with fBm and ridged fBm
  sphere-mesh.js        Fibonacci sphere, Delaunay, SphereMesh dual-mesh
  coarse-plates.js      The pieces' layout on a fixed ~20K reference grid, projected onto the mesh
  plates.js             The pieces' growth (farthest-point seeding, round-robin flood fill, compactness) and smoothing
  ocean-land.js         Ocean/land assignment of the pieces with continent seeding
  plate-physics.js      The pieces' motion (drag, slab pull, ridge push, mantle flow)
  terrain-config.js     The layout's and the old terrain's constants
  terrain-post.js       Import's image shaping (warp, smoothing, ridge sharpening, soil creep); the old terrain's erosion
  color-map.js          Generate's elevation scale ↔ km (an imported image's grey is read through it)
  climate-layers.js     The climate's colour scales, legends and words (shared with Evolution's climate views)
  climate-new.js        The new climate on a V1 mesh (the climate's tuning tools)
  elevation.js, super-plates.js, koppen.js, climate-config.js, climate-util.js, wind.js … temperature.js
                        The old pipeline (terrain and climate) — no longer run by the pages; kept as the climate's tuning
                        tools' synthetic planets (tuning/climate/lib/gen-planets.mjs) and the climate lab
```
