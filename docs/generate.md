# Generate

**A planet in seconds, shaped by hand:** [orogen.studio/generate](https://orogen.studio/generate)

Set the continents, plates and climate with sliders, then reshape any plate you don't like. Every planet comes with the
full seasonal climate (wind, ocean currents, rain, Köppen zones) and a planet code that rebuilds it exactly. Of the
Studio's tools it is the fastest and the most phone-friendly; its profile is in [VISION.md](../VISION.md#the-tools).

The view (the layer tabs, the map projections), the climate and the export panel are shared by every tool: see
[shared.md](shared.md). Back to the [README](../README.md).

## Building a planet

Click **Build new world** to create a new random planet. The button's label says what it will do, from what you've adjusted:
- **Build new world** — generates a fresh planet with a new random seed
- **Rebuild** — re-renders the current planet at a new detail/roughness level without changing continent shapes
- **Regenerate** — creates new tectonic plates when the Plates or Continents slider has changed

## Sharing planets

Every generated planet produces a **planet code** (shown below the Build button) that encodes the random seed, all slider values, and any plate edits. The seed is one of 2,147,483,646 (0 to 2,147,483,645: each its own world — the seeded generator's every starting state; before 2026-10 new planets drew from the first 16.7 million, whose codes read as they always did). An unedited planet is 22 characters; plate edits (applied via Rebuild) extend the code to include the toggled plates. Older codes (13–21 characters) from previous versions are still supported — missing sliders default to their current default values. To share a planet:

- **Copy** the code with the copy button and send it to someone
- **Load** a code by pasting it into the planet code field and clicking Load (or pressing Enter). The Load button lights up in the accent when a new code is ready to apply.
- **URL sharing** — the code is also stored in the URL hash (e.g. `#a7f3kq9xp2b`), so you can share the full URL directly (`orogen.studio/generate#…`; a link from before Generate moved there, `orogen.studio/#…`, is sent on to it by the home page). Opening a URL with a valid hash auto-loads that planet, including any plate edits.

## Controls

### Shape your world

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

### Terrain sculpting

Post-processing passes that refine the terrain (collapsed by default — the defaults produce good results). These do not require a full rebuild; adjusting any slider lights up the **Reapply** button at the bottom of this section — click it to reapply only the sculpting passes on the current planet.

| Control | Range | Default | Description |
|---------|-------|---------|-------------|
| Terrain Warp | 0 – 1 | 0.75 | Domain warping — deforms the elevation field using noise to produce organic, squiggly coastlines and mountain ridges |
| Smoothing | 0 – 1 | 0.10 | Blends harsh terrain boundaries from tectonic generation |
| Glacial Erosion | 0 – 1 | 0.50 | Ice-age sculpting — carves fjords, U-shaped valleys, and lake basins at high latitudes and altitudes via latitude-driven ice flow |
| Hydraulic Erosion | 0 – 1 | 0.50 | Iterative stream-power erosion — resolves endorheic basins via priority-flood canyon carving, then carves river valleys and dendritic drainage networks, with automatic sediment deposition in flat receivers |
| Thermal Erosion | 0 – 1 | 0.10 | Slope-driven material transport — softens ridges and creates natural talus slopes |
| Ridge Sharpening | 0 – 1 | 0.50 | Accentuates mountain ridgelines — pushes peaks further above their surroundings for more dramatic terrain |

### Climate

Global climate offsets that adjust temperature and precipitation without a full rebuild. Changing these recomputes only the climate (a few seconds).

| Control | Range | Default | Description |
|---------|-------|---------|-------------|
| Temperature | -30 – 30 W/m² | 0 | Warms or cools the whole planet. The value is the change in the heat its air holds in — a radiative forcing in the energy balance, in W/m². Snow, sea ice and ice sheets amplify a cooling far more than a warming: on Earth −10 cools the planet ≈ 8 °C and +10 warms it ≈ 6 °C, and past −20 the ice runs away — sea ice on a quarter of the sea at −20, a snowball planet by −28 to −30. The winds and currents shift with them, and warmer seas evaporate more, so a warm world is wetter and a cold one drier |
| Precipitation | -1 – 1 | 0 | The pace of the water cycle (±50 %): evaporation from the seas and land scaled, so about that much more or less rain overall — where it falls still follows the winds and mountains, and the rain's clouds shade the land in turn |

### Auto Climate

The climate (temperature, pressure and wind, ocean currents, rain, Köppen classification) runs with every generation: it works on a fixed 1° grid, so it takes a few seconds at any detail. On phones, above 640K regions, it is computed on demand when a climate-dependent view is first chosen.

### Inspect (advanced)

A folded section at the foot of the sidebar, for the terrain's inner workings (the maps you'll want most are the tabs):

- **Geology** — Base, Tectonic, Noise, Interior, Coastal, Ocean Floor, Hotspot, Tectonic Activity, Margins, Back-Arc, Fold Ridge, Orogenic Power, Erosion Delta (blue = eroded, red = deposited)
- **Plate Physics** — Continental Drag, Size-Velocity, Plate Speed, Velocity Change, Mantle Flow
- **Elevation** — Full Heightmap (full-range B&W)
- **Wireframe** — toggle switch to show Voronoi cell edges as a wireframe overlay

**None** returns to the tab shown. On the Import page the list holds the Full Heightmap and Erosion Delta.

## Tutorial & Help

A five-step tutorial modal introduces the tool on first visit (auto-shown via `localStorage`). It covers planet generation, slider controls, interactive editing, visualization, saving/sharing via planet codes, and map export. A **?** help button in the top-right corner reopens the tutorial at any time. The modal can be dismissed with the close button, backdrop click, Escape key, or the "Get Started" button on the final step.

A **What's New** modal is shown once per release to returning users (those who have already dismissed the tutorial). It highlights new features, changes, and a heads-up when saved links, planet codes or planet files give a different world (in 2.2, Evolution's histories), with the address where the previous version still opens them. The modal uses a versioned `localStorage` flag (`wo-whatsnew-seen`) — bump the `VERSION` constant in `initWhatsNew()` to trigger it again on the next release.

## Interaction

Navigation hints are shown in the sidebar panel and as a contextual tooltip when hovering the planet.

| Action | Desktop | Mobile |
|--------|---------|--------|
| Rotate globe / pan map | Drag | Drag (one finger) |
| Zoom | Scroll wheel | Pinch with two fingers |
| Highlight plate + info card | Hover | — |
| Mark plate for reshaping | Ctrl-click a plate (Cmd-click on a Mac; multi-select) | Tap the edit button (pencil), then tap plates |
| Undo pending plate | Ctrl-click the same plate again | Tap the same plate again |
| Apply pending edits | Click the Rebuild button | Tap the Rebuild button |
| Cancel all pending edits | Press Escape | — |

Hovering over a region shows an info card with plate type, elevation, coordinates, and (when climate has been computed) January and July temperature (the sea's surface temperature at sea, and its sea ice), yearly and monthly precipitation, aridity, and K&ouml;ppen classification. Pending plates show a colored tint (green = ocean→land, blue = land→ocean) and hover text indicates "(pending)".

## Mobile Support

World Orogen is fully usable on phones and tablets:

- **Bottom-sheet sidebar** — on screens 768px or narrower, the sidebar becomes a bottom sheet with a drag handle. Drag or tap the handle to expand/collapse. The globe stays visible above.
- **Pinch-to-zoom** — two-finger pinch zooms the globe and map, using the same smooth lerp as desktop scroll-zoom.
- **View switcher** — a dropdown in the top-right lets you switch between Terrain, Satellite, Climate, and Heightmap views without opening the bottom sheet.
- **Edit-mode toggle** — a floating pencil button (bottom-right) activates plate editing. Tap it to toggle edit mode (glows green when active), then tap plates to mark them. Tap the Rebuild button to apply all changes at once.
- **Touch-friendly targets** — buttons, checkboxes, and sliders are enlarged for comfortable finger input.
- **Performance** — detail warning thresholds are lowered on touch devices (orange at 200K, red at 500K). Export widths above 8192px are disabled on mobile.
- **Tooltips** reposition above their trigger instead of to the right, so they stay on screen.
- **Orientation** changes are handled automatically.

## What it builds

- **Fibonacci sphere meshing** with Voronoi cell tessellation via Delaunay triangulation
- **Tectonic plate simulation** — farthest-point seed placement with top-3 jitter, round-robin flood fill with directional growth bias, growth-rate governor, compactness penalty to prevent spindly shapes, multi-pass boundary smoothing, and fragment reconnection
- **Ocean/land assignment** — farthest-point continent seeding, round-robin growth with separation guarantees, trapped sea absorption, targeting ~30% land coverage
- **Collision detection** — convergent, divergent, and transform boundary classification with density-based subduction modeling; dual-layer super plate system groups same-type plates into ~20 tectonic units for broad orogenic belts blended 50/50 with fine-grained individual plate orogeny
- **Elevation generation** — three distance fields (mountain/ocean/coastline) combined via harmonic-mean formula, stress-driven uplift, asymmetric mountain profiles, continental shelf/slope/abyss profiles, foreland basins, plateau formation, and rift valleys with graben profiles
- **Ocean floor features** — mid-ocean ridges at divergent boundaries, deep trenches at subduction zones, fracture zones at transform boundaries, back-arc basins behind subduction zones
- **Island arcs** — volcanic island chains at ocean-ocean convergent boundaries with ridged noise shaping
- **Hotspot volcanism** — dual-component mantle plume model (broad thermal swell + volcanic peak) with drift-trail island chains, domain-warped shape distortion, drift-direction elongation, summit calderas on active domes, radial rift-zone ridges, age-dependent volcanic texture, and per-hotspot variation in strength/decay/spacing
- **Terrain post-processing** — noise-based domain warping (FBM simplex noise with greedy mesh walk) to deform the elevation field for organic coastlines and mountain ridges, independently controllable bilateral smoothing to blend harsh BFS distance-field boundaries, glacial erosion that carves fjords, U-shaped valleys, and lake basins at high latitudes and altitudes via latitude-driven ice flow with drainage accumulation, priority-flood pit resolution with canyon carving (Barnes et al. algorithm that ensures every land cell drains to the ocean, carving dramatic canyons through mountain saddle points rather than filling basins), iterative implicit stream power hydraulic erosion (Braun-Willett style) that carves self-reinforcing river valleys with automatic sediment deposition in flat receivers, thermal erosion that softens ridges via talus-angle material transport, ridge sharpening that accentuates mountain ridgelines, and always-on soil creep (Laplacian diffusion) that rounds off hillslopes
- **Coastal roughening** — fractal noise with active/passive margin differentiation, domain warping for bays/headlands, and offshore island scattering
- **3D globe rendering** with atmosphere rim shader, translucent water sphere, terrain displacement, and starfield
- **Equirectangular map projection** with antimeridian wrapping
- **Interactive editing** — Ctrl-click (Cmd-click on a Mac) plates to mark them for reshaping (multi-select with visual tinting), then click Rebuild to apply all changes at once. Ctrl-click again to undo a pending selection. Press Escape to cancel all pending edits
- **Map type switcher** — first-class Terrain / Satellite / Climate / Heightmap tabs with color legends for each view
- **Climate at any detail** — a few seconds whatever the detail; on phones, above 640K regions, it is computed when a climate view is first chosen
- **Detailed visualization** — climate layers in real units, each where it has seasons for the Year, January or July (pressure with the ITCZ, wind, ocean currents, upwelling, ice, temperature, precipitation, temperature range, rain shadow, aridity, growing season, rain seasonality), plus the geology and plate-physics layers, for viewing each component in isolation. Wind and current layers draw arrows on both globe and map views.

## How It Works

### Pipeline

1. **Fibonacci spiral** distributes N points evenly on a unit sphere with optional jitter
2. **Stereographic projection** maps the sphere points to 2D
3. **Delaunator** computes Delaunay triangulation in projected space
4. **Pole closure** connects convex hull edges to a pole point, creating a watertight mesh
5. **Coarse plate generation** on a fixed ~20,000-region reference mesh (resolution-independent), via farthest-point seed placement (with top-3 jitter for variety), round-robin flood fill with per-plate growth rates, directional bias coupled inversely to growth rate, growth-rate governor, and compactness penalty
6. **Ocean/land assignment** on the coarse mesh using farthest-point continent seeding with area budgeting
7. **Plate projection** maps coarse plate assignments onto the high-res mesh via nearest-neighbor adjacency walk, then smooths boundaries with resolution-scaled majority-vote passes
8. **Collision detection** simulates plate drift to classify convergent/divergent/transform boundaries
9. **Stress propagation** diffuses collision stress inward through continental plates via frontier BFS
10. **Elevation assignment** combines distance fields, stress-driven uplift, ocean floor profiles, rift valleys, back-arc basins, hotspot volcanism, island arcs, coastal roughening, and multi-layered noise
11. **Terrain post-processing** applies domain warping (controlled by Terrain Warp slider) using FBM simplex noise to deform the elevation field for organic coastlines and mountain ridges via greedy mesh walk, then bilateral smoothing (controlled by Smoothing slider) to blend BFS banding artefacts, two always-on detail-noise passes add domain-warped high-octave FBM relief to land cells (in physical km space, with Newton-Raphson inversion of the elev→km quartic) to break up flat continental interiors before erosion routes drainage through them — Layer 1 adds 0–100 m positive bumps for broad rolling variety, then Layer 2 adds ±50 m bipolar bumps at 2× frequency and 2× warp amplitude with magnitude biased toward the extremes for sharper finer-scale relief; both layers are dampened by 50 % at full craton/basin weight so geologically quiet regions stay characteristically subdued, and both are scaled by the orogenic-power field so noise relief tracks active mountain-building zones and quiets down over tectonically inactive crust, glacial erosion (controlled by Glacial Erosion slider) carves fjords, U-shaped valleys, and lake basins at high latitudes and altitudes, priority-flood pit resolution carves canyons through mountain saddle points to ensure all land drains to the ocean, iterative implicit stream power hydraulic erosion with sediment deposition (controlled by Hydraulic Erosion slider) carves self-reinforcing river valleys, thermal erosion (controlled by Thermal Erosion slider) softens ridges via talus-angle material transport, ridge sharpening (controlled by Ridge Sharpening slider) accentuates mountain ridgelines, and always-on soil creep gently rounds off hillslopes
12. **Climate** — the new climate (`v2/js/climate/`, see `v2/README.md` and `plans/CLIMATE_REBUILD_REPORT.md`) on a fixed 1° grid: a seasonal energy balance (mean and two harmonics of the year) for temperature, pressure belts and winds derived from it, a wind-driven ocean (gyres, circumpolar channels, upwelling, overturning heat given up on its way to the polar sea, little in it; seasonal in the tropics), and a column-water rain budget, coupled; near the poles the summer air by the ground is held back toward the yearly mean (`TEMP_POLAR_SUMMER_DAMP`: the heat goes into melting snow and ice), so land beyond 75° stays tundra or ice; the energy balance and the ocean solved on the 1° grid itself, the circulation and rain on 3° (the energy balance's surface has a gentle variety of brightness — `TEMP_ALBEDO_VARY`, smooth fractal noise of ±0.025 at up to 900 km — an input it works through, so snow lines and ice-sheet edges follow the physics irregularly rather than the grid); then twelve months per region at the region's own height (lapse rate, a share of its own relief, orographic rain), and Köppen from those months. The Temperature and Precipitation sliders are its `greenhouseWm2` (a forcing on the heat radiated to space, in the energy balance) and `precipScale` (evaporation, in the rain budget) — so the ice, winds, currents and rain all answer them. What the sea's layers draw is refined for the eye (`v2/js/climate/grid.js` `refineForDrawing`): each field carried across the coast from its own side as far as it takes (the sea's temperature, ice, currents and upwelling from the sea; the ice sheets from the land), the rows near the poles evened out, and refined onto the 1° grid by a smooth curve (and carried no more than 600 km: an island far out keeps its own) — so no coastal rims, straight coarse-cell edges or polar wedges; the physics, Köppen and the land's own values are untouched.
13. **Rendering** builds a Voronoi cell mesh with per-vertex colors and terrain displacement

### Key Algorithms

- **Seeded PRNG** — Park-Miller LCG for deterministic generation
- **3D Simplex noise** — with fBm and ridged fBm variants for terrain detail
- **Harmonic-mean distance blending** — `(1/a - 1/b) / (1/a + 1/b + 1/c)` for smooth elevation transitions
- **Domain warping** — noise-driven coordinate offsets for organic coastlines
- **Density-based subduction** — tanh mapping of density differences with undulation noise
- **BFS distance fields** — randomized frontier expansion from boundary seeds, used for elevation, coast distance, rift width, ridge profiles, and back-arc basins
- **Gaussian dome uplift** — hotspot volcanism modeled as dual-component Gaussians (thermal swell + volcanic peak) with domain-warped shape distortion, anisotropic drift elongation, summit calderas, radial rift ridges, and age-dependent texture blending

## Code

Generate and Import Heightmap live in `js/` (the climate they run is `v2/js/climate/`):

```
js/
  main.js               Generator entry point — UI wiring, animation loop
  import-main.js        Import page entry point — file upload, import dispatch
  state.js              Shared mutable application state
  generate.js           Worker dispatcher — posts jobs, handles results
  planet-worker.js      Web Worker — runs geology pipeline off main thread
  planet-code.js        Planet code encode/decode (seed + sliders → base36)
  rng.js                Seeded PRNG (Park-Miller LCG)
  simplex-noise.js      3D Simplex noise with fBm and ridged fBm
  color-map.js          Elevation → RGB colour mapping + satellite biome colors
  sphere-mesh.js        Fibonacci sphere, Delaunay, SphereMesh dual-mesh
  plates.js             Tectonic plate generation (farthest-point seeding, round-robin flood fill, compactness constraints)
  coarse-plates.js      Resolution-independent plate pipeline — coarse reference grid, projection, boundary smoothing
  super-plates.js       Groups same-type plates into ~20 super plates for broad orogenic belts
  ocean-land.js         Ocean/land assignment with continent seeding
  elevation.js          Collisions, stress propagation, distance fields, elevation
  terrain-post.js       Domain warping, bilateral smoothing, glacial/hydraulic/thermal erosion, ridge sharpening, soil creep
  climate-new.js        The climate for Generate and Import — runs the new climate (v2/js/climate/) on a V1 planet: Köppen, per-region months, the 1° grid
  climate-layers.js     The climate's Inspect layers — colours, legends, hover lines, arrows, the season picker
  terrain-palette.js    The Terrain view's Colours (Generate, Import): Classic or one of Evolution's palettes, by height in km
  layer-bar.js          The layer bar over the planet (Generate, Import): tabs, the Climate row and season, the phone's list
  view-strip.js         The view strip above the layer tabs (every page), folded behind an arrow: Globe | Map and what applies, the projection picker; in the sheet on phones
  map-projection.js     Generate's and Import's map view in any of the ten projections: the flat map drawn off-screen, shown through the projection's inverse; hover and Ctrl-click through it
  climate-config.js     The OLD climate's parameters (no longer run by the app; kept for the old tuning diagnostics)
  climate-util.js       Shared climate utilities — smoothing, ITCZ lookup, percentile selection
  wind.js … temperature.js  The OLD climate (wind, ocean, precipitation, heuristic-precip, temperature) — no longer run by the app
  scene.js              Three.js scene, cameras, controls, lights; fitCamera keeps the whole globe in view on portrait screens
  planet-mesh.js        Voronoi mesh, map projection, hover highlight, the export's rasters (the mesh drawn flat in tiles, as colours or numbers)
  export-generate.js    The export panel on Generate and Import: the catalogue of maps and how each is drawn from the mesh
  edit-mode.js          Ctrl-click plate multi-select + hover info
  detail-scale.js       Non-linear (power-curve) detail slider mapping
  build-error.js        A failed build, import or export shown in the build overlay, with a Close button; the controls held during a build
  theme.js              Classic script in each page's <head>: Paper or Night, the device's choice until the theme switch
                        saves one (before the first paint, so no flash); window.orogenTheme lets the globes' stage follow
  support-check.js      Classic script run before the modules: a browser that cannot run the app (no import maps, no
                        WebGL) or app code that fails to load gets a plain message instead of a blank page
```
