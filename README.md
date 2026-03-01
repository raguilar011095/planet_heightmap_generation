# World Orogen

A browser-based procedural planet generator that creates realistic terrestrial planets with tectonic plate simulation, elevation modeling, and interactive editing. Uses native ES modules with no build step required.

![Three.js](https://img.shields.io/badge/Three.js-0.160.0-blue) ![No Build](https://img.shields.io/badge/build-none-green)

## Guiding Principles

1. **Artistic appeal** — Visually interesting, scientifically informed output. Aesthetics come first.
2. **Ease of use and efficiency** — Approachable interface, fast generation. Don't sacrifice usability for realism.
3. **Scientific plausibility** — Grounded in real planetary science. Believable, not necessarily physically accurate.

All three are considered together; ties are broken in the order above.

## Features

- **Fibonacci sphere meshing** with Voronoi cell tessellation via Delaunay triangulation
- **Tectonic plate simulation** — farthest-point seed placement with top-3 jitter, round-robin flood fill with directional growth bias, growth-rate governor, compactness penalty to prevent spindly shapes, multi-pass boundary smoothing, and fragment reconnection
- **Ocean/land assignment** — farthest-point continent seeding, round-robin growth with separation guarantees, trapped sea absorption, targeting ~30% land coverage
- **Collision detection** — convergent, divergent, and transform boundary classification with density-based subduction modeling
- **Elevation generation** — three distance fields (mountain/ocean/coastline) combined via harmonic-mean formula, stress-driven uplift, asymmetric mountain profiles, continental shelf/slope/abyss profiles, foreland basins, plateau formation, and rift valleys with graben profiles
- **Ocean floor features** — mid-ocean ridges at divergent boundaries, deep trenches at subduction zones, fracture zones at transform boundaries, back-arc basins behind subduction zones
- **Island arcs** — volcanic island chains at ocean-ocean convergent boundaries with ridged noise shaping
- **Hotspot volcanism** — dual-component mantle plume model (broad thermal swell + volcanic peak) with drift-trail island chains, domain-warped shape distortion, drift-direction elongation, summit calderas on active domes, radial rift-zone ridges, age-dependent volcanic texture, and per-hotspot variation in strength/decay/spacing
- **Terrain post-processing** — noise-based domain warping (FBM simplex noise with greedy mesh walk) to deform the elevation field for organic coastlines and mountain ridges, independently controllable bilateral smoothing to blend harsh BFS distance-field boundaries, glacial erosion that carves fjords, U-shaped valleys, and lake basins at high latitudes and altitudes via latitude-driven ice flow with drainage accumulation, priority-flood pit resolution with canyon carving (Barnes et al. algorithm that ensures every land cell drains to the ocean, carving dramatic canyons through mountain saddle points rather than filling basins), iterative implicit stream power hydraulic erosion (Braun-Willett style) that carves self-reinforcing river valleys with automatic sediment deposition in flat receivers, thermal erosion that softens ridges via talus-angle material transport, ridge sharpening that accentuates mountain ridgelines, and always-on soil creep (Laplacian diffusion) that rounds off hillslopes
- **Coastal roughening** — fractal noise with active/passive margin differentiation, domain warping for bays/headlands, and offshore island scattering
- **3D globe rendering** with atmosphere rim shader, translucent water sphere, terrain displacement, and starfield
- **Equirectangular map projection** with antimeridian wrapping
- **Interactive editing** — Ctrl-click any plate to toggle between land and ocean, with live elevation recomputation
- **Seasonal wind simulation** — pressure-driven wind patterns with a longitude-varying ITCZ that tracks the thermal equator (~5° over ocean, up to 15-20° over continents), Gaussian pressure bands (subtropical highs, subpolar lows, polar highs), land/sea thermal contrast for monsoon-like pressure reversals, elevation barometric effects, and Coriolis-deflected geostrophic wind with natural cross-equatorial flow reversal. Computed for both summer and winter seasons.
- **Ocean surface currents** — rule-based geographic gyre simulation driven by wind belts (trade winds, westerlies, polar easterlies) with a longitude-varying ITCZ equatorial countercurrent. Continental shelves are classified as western or eastern boundaries via coast-normal BFS, producing subtropical gyres (CW in NH, CCW in SH) with western boundary intensification (Gulf Stream, Kuroshio effect) and weaker eastern boundary return flow. Detects circumpolar channels for unobstructed eastward currents (Antarctic Circumpolar Current). Currents are colored by heat transport: red = warm poleward flow, blue = cold equatorward flow, black = zonal (neutral). Computed for both summer and winter seasons.
- **Precipitation** — blended dual-model approach: a complex moisture advection simulation is combined 50-50 with a fast heuristic zonal model. The advection model simulates wind-driven moisture transport from coasts with six mechanisms: ITCZ convective uplift, frontal convergence, orographic rain/shadow, lee cyclogenesis, polar-front precipitation, and subtropical high suppression. The heuristic model provides smooth latitude-based patterns (ITCZ wet belt, subtropical dry belt, mid-latitude recovery, polar dryness) modulated by continentality and orographic effects. Blending the two reduces splotchiness while preserving terrain-informed detail and strengthening subtropical desert formation (~20–35°). Visualized on a brown (dry) → green (moderate) → blue (wet) color ramp. Computed for both summer and winter seasons.
- **Map type switcher** — first-class Terrain / Satellite / Climate / Heightmap tabs with color legends for each view
- **On-demand climate** — optional deferred climate computation; skip climate during generation for faster terrain iteration, compute it on demand when needed
- **Detailed visualization** — twenty-six selectable inspection layers organized by category (Geology, Atmosphere, Ocean, Climate, Elevation) for viewing each component in isolation. Wind/pressure layers show directional wind arrows, ocean current layers show current arrows colored by heat transport, on both globe and map views. Precipitation layers use a brown→green→blue ramp showing dry to wet regions.
- **Map export** — download high-resolution equirectangular PNGs (color terrain, satellite biome, climate/Köppen, B&W heightmap, land-only heightmap, or B&W land mask) at configurable widths up to 65536px with tiled rendering. **Export All** downloads Satellite, Climate, Heightmap, and Land Mask in one click, auto-computing climate if needed.

## Quick Start

Serve the project with any local HTTP server (required for ES modules):

```bash
# Python
python3 -m http.server 8000

# Or Node.js
npx serve .
```

Then open **http://localhost:8000** in your browser. No dependencies to install, no build step.

Click **Build New World** to create a new random planet. The button changes color and label based on what you've adjusted:
- **Build New World** (blue) — generates a fresh planet with a new random seed
- **Rebuild** (amber) — re-renders the current planet at a new detail/roughness level without changing continent shapes
- **Regenerate** (red) — creates new tectonic plates when the Plates or Continents slider has changed

### Sharing Planets

Every generated planet produces a **planet code** (shown below the Build button) that encodes the random seed, all slider values, and any plate edits. An unedited planet is 18 characters; Ctrl-click edits extend the code to include the toggled plates. To share a planet:

- **Copy** the code with the copy button and send it to someone
- **Load** a code by pasting it into the planet code field and clicking Load (or pressing Enter). The Load button turns blue when a new code is ready to apply.
- **URL sharing** — the code is also stored in the URL hash (e.g. `#a7f3kq9xp2b`), so you can share the full URL directly. Opening a URL with a valid hash auto-loads that planet, including any plate edits.

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

### Terrain Sculpting

Post-processing passes that refine the terrain (collapsed by default — the defaults produce good results). These do not require a full rebuild; adjusting any slider lights up the **Reapply** button at the bottom of this section — click it to reapply only the sculpting passes on the current planet.

| Control | Range | Default | Description |
|---------|-------|---------|-------------|
| Terrain Warp | 0 – 1 | 1.00 | Domain warping — deforms the elevation field using noise to produce organic, squiggly coastlines and mountain ridges |
| Smoothing | 0 – 1 | 0.10 | Blends harsh terrain boundaries from tectonic generation |
| Glacial Erosion | 0 – 1 | 0.50 | Ice-age sculpting — carves fjords, U-shaped valleys, and lake basins at high latitudes and altitudes via latitude-driven ice flow |
| Hydraulic Erosion | 0 – 1 | 0.50 | Iterative stream-power erosion — resolves endorheic basins via priority-flood canyon carving, then carves river valleys and dendritic drainage networks, with automatic sediment deposition in flat receivers |
| Thermal Erosion | 0 – 1 | 0.10 | Slope-driven material transport — softens ridges and creates natural talus slopes |
| Ridge Sharpening | 0 – 1 | 0.50 | Accentuates mountain ridgelines — pushes peaks further above their surroundings for more dramatic terrain |

### Auto Climate

Climate simulation (wind, ocean currents, precipitation, temperature, Köppen classification) runs automatically during generation when detail is ≤ 300K regions. Above 300K, climate is skipped for faster terrain iteration and computed on demand when switching to a climate-dependent view.

### Visual Options

- **Map Type** — segmented Terrain / Satellite / Climate / Heightmap tabs for quick switching between the four most common visualizations. Each tab shows a color legend:
  - **Terrain** — elevation color ramp from deep ocean through sea level to mountain peaks
  - **Satellite** — realistic biome colors based on Köppen climate classification and elevation (lush green rainforests, tan deserts, white ice caps, dark taiga, gray tundra), with ocean using the standard terrain palette. High elevations blend toward snow white based on climate-aware snow lines.
  - **Climate** — Köppen-Geiger classification with color swatches for all 30 climate types
  - **Heightmap** — black-to-white gradient on a fixed absolute scale (-5 km ocean floor to 6 km peaks), so the same physical height always maps to the same shade
- **View** dropdown — switch between Globe and Map (equirectangular projection)
- **Center Longitude** slider (map mode only) — shifts the map projection's central meridian to any longitude from 180°W to 180°E, scrolling the equirectangular projection so the chosen longitude is centered. Exports are unaffected (always centered on 0°).
- **Wireframe** — toggle switch to show Voronoi cell edges as a wireframe overlay
- **Show Plates** — toggle switch to color regions by plate (green shades = land, blue shades = ocean)
- **Auto-Rotate** — toggle switch to spin the globe continuously
- **Grid Lines** — toggle switch for latitude/longitude grid overlay on both globe and map views
- **Grid Spacing** — choose the interval between grid lines: 30°, 15°, 10°, 5°, or 2.5°

### Inspect Dropdown

The **Inspect** dropdown (in Visual Options, below the map tabs) selects a detailed visualization layer. Options are organized into groups:

- **Main views** (ungrouped at top) — Terrain, Satellite, Köppen Climate, Land Heightmap
- **Geology** — Base, Tectonic, Noise, Interior, Coastal, Ocean Floor, Hotspot, Tectonic Activity, Margins, Back-Arc, Fold Ridge, Erosion Delta (blue = eroded, red = deposited)
- **Atmosphere** — Pressure Summer/Winter (blue = low, red = high), Wind Speed Summer/Winter (with directional arrows on both globe and map)
- **Ocean** — Currents Summer/Winter (red = warm poleward, blue = cold equatorward, black = zonal; with directional current arrows)
- **Climate** — Precipitation Summer/Winter (brown = dry, green = moderate, blue = wet), Rain Shadow Summer/Winter (diverging blue = windward orographic boost, gray = neutral, red-brown = leeward rain shadow; leeward effects are seeded at downslope faces scaled by mountain height, then propagated ~1500 km downwind to show extended shadow zones like the foehn drying effect), Temperature Summer/Winter (purple-blue = cold, white = 0 C, green-yellow = warm, red = hot; fixed -45 to +45 C range), Continentality (blue = ocean, green = coast, yellow = moderate interior, orange/red = deep continental interior)
- **Elevation** — Full Heightmap (full-range B&W)

### Export

Click **Export Map** (below Visual Options) to open the export modal:

- **Type** — Color Map (terrain colors), Satellite (biome colors from Köppen classification), Climate (Köppen classification colors), Heightmap (B&W full range on fixed -5 to 6 km absolute scale), Land Heightmap (B&W on fixed 0 to 6 km absolute scale, ocean is black), or Land Mask (pure B&W — white = land, black = ocean). Satellite and Climate options are disabled when climate hasn't been computed.
- **Width** slider — 1024 to 65536 pixels (height is always width/2 for equirectangular). Large exports use tiled rendering to handle GPU texture limits.
- **Export** — downloads the selected type as an equirectangular PNG with no grid overlay
- **Export All** — downloads four maps (Satellite, Climate, Land Heightmap, Land Mask) sequentially. If climate hasn't been computed yet, it runs automatically before exporting.
- A progress overlay shows rendering and PNG encoding status during export

### Sidebar & Loading

The control panel can be collapsed and expanded with the **«** toggle button in the sidebar header. On small screens (≤ 768px) the sidebar becomes a bottom sheet with a drag handle — starts collapsed, showing only the handle and header. Drag up or tap the handle to expand. A fullscreen overlay with spinner, title, and progress bar appears during every generation — fully opaque on initial load, semi-transparent on subsequent builds so the previous planet is dimmed behind it. Stage labels (shaping, plates, oceans, mountains, painting) update as the pipeline progresses.

### Tutorial & Help

A four-step tutorial modal introduces the tool on first visit (auto-shown via `localStorage`). It covers planet generation, slider controls, interactive editing, saving/sharing via planet codes, and map export. A **?** help button in the top-right corner reopens the tutorial at any time. The modal can be dismissed with the close button, backdrop click, Escape key, or the "Get Started" button on the final step.

### Interaction

Navigation hints are shown in the sidebar panel and as a contextual tooltip when hovering the planet.

| Action | Desktop | Mobile |
|--------|---------|--------|
| Rotate globe / pan map | Drag | Drag (one finger) |
| Zoom | Scroll wheel | Pinch with two fingers |
| Highlight plate + info card | Hover | — |
| Reshape continents | Ctrl-click a plate | Tap the edit button (pencil), then tap a plate |

Hovering over a region shows an info card with plate type, elevation, coordinates, and (when climate has been computed) temperature, precipitation, and K&ouml;ppen classification.

### Mobile Support

World Orogen is fully usable on phones and tablets:

- **Bottom-sheet sidebar** — on screens 768px or narrower, the sidebar becomes a bottom sheet with a drag handle. Drag or tap the handle to expand/collapse. The globe stays visible above.
- **Pinch-to-zoom** — two-finger pinch zooms the globe and map, using the same smooth lerp as desktop scroll-zoom.
- **View switcher** — a dropdown in the top-right lets you switch between Terrain, Satellite, Climate, and Heightmap views without opening the bottom sheet.
- **Edit-mode toggle** — a floating pencil button (bottom-right) activates plate editing. Tap it to toggle edit mode (glows green when active), then tap any plate to reshape.
- **Touch-friendly targets** — buttons, checkboxes, and sliders are enlarged for comfortable finger input.
- **Performance** — detail warning thresholds are lowered on touch devices (orange at 200K, red at 500K). Export widths above 8192px are disabled on mobile.
- **Tooltips** reposition above their trigger instead of to the right, so they stay on screen.
- **Orientation** changes are handled automatically.

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
11. **Terrain post-processing** applies domain warping (controlled by Terrain Warp slider) using FBM simplex noise to deform the elevation field for organic coastlines and mountain ridges via greedy mesh walk, then bilateral smoothing (controlled by Smoothing slider) to blend BFS banding artefacts, glacial erosion (controlled by Glacial Erosion slider) carves fjords, U-shaped valleys, and lake basins at high latitudes and altitudes, priority-flood pit resolution carves canyons through mountain saddle points to ensure all land drains to the ocean, iterative implicit stream power hydraulic erosion with sediment deposition (controlled by Hydraulic Erosion slider) carves self-reinforcing river valleys, thermal erosion (controlled by Thermal Erosion slider) softens ridges via talus-angle material transport, ridge sharpening (controlled by Ridge Sharpening slider) accentuates mountain ridgelines, and always-on soil creep gently rounds off hillslopes
12. **Wind simulation** computes a longitude-varying ITCZ by scanning for the thermal maximum at each longitude (accounting for land/sea heating differential and elevation lapse rate), builds pressure fields from Gaussian zonal bands centered on the ITCZ plus land/sea thermal modifiers and elevation barometric effects, then derives wind vectors from pressure gradients with latitude-dependent Coriolis deflection and surface friction. Computed for both NH summer and winter.
13. **Ocean currents** uses a rule-based geographic approach: classifies ocean cells by wind belt (trades, westerlies, polar easterlies) to set base zonal flow, runs three BFS passes from coastal seeds to compute distance to western and eastern coastlines (classified by coast-normal direction), deflects currents poleward near western boundaries (warm, intensified ×2) and equatorward near eastern boundaries (cold, weaker ×0.8), detects circumpolar channels at ±60° latitude for unobstructed eastward flow, smooths with 5 Laplacian passes, and classifies heat transport by meridional flow direction. Computed for both seasons.
14. **Precipitation** uses a blended dual-model approach. The complex model computes moisture advection from coasts using iterative upwind propagation driven by wind vectors, with depletion based on distance and elevation gain, plus six mechanisms: ITCZ convective uplift, frontal convergence at subpolar lows, orographic rain/rain shadow, lee cyclogenesis, polar front diffuse precipitation, and seasonal subtropical high suppression (shifts poleward in local summer to create Mediterranean dry-summer patterns). A heuristic zonal model computes smooth precipitation from ITCZ distance (with aggressive subtropical drying at 15–30°), seasonal hemisphere boost with Mediterranean subtropical suppression (up to 55% summer reduction at 25-42° latitude), continental dryness, and orographic rain shadow. The two models are blended 50-50 then normalized via 95th-percentile scaling. Computed for both seasons.
15. **Temperature** computes per-cell surface temperature using the ITCZ as the thermal equator (28°C peak, warmest latitude band), with poleward cooling following a power-law curve (exponent 1.2, 13° tropical plateau, 52°C range). Modulated by seasonal hemisphere offset with latitude-dependent seasonal amplitude boost (up to ±12°C peaking at 55-75° latitude), continentality-scaled maritime factor (coast 0.50× to deep interior 1.20× seasonal swing), moisture-dependent elevation lapse rate (4.5 C/km in wet regions to 9.3 C/km in dry regions, interpolated by precipitation), ocean current warmth (16-pass diffusion onto coastal land, ±20°C effect with 0.95 continentality gate), and precipitation/cloud cover moderation. Normalized to a fixed -45 to +45 C range. Computed for both seasons.
16. **Rendering** builds a Voronoi cell mesh with per-vertex colors and terrain displacement

### Key Algorithms

- **Seeded PRNG** — Park-Miller LCG for deterministic generation
- **3D Simplex noise** — with fBm and ridged fBm variants for terrain detail
- **Harmonic-mean distance blending** — `(1/a - 1/b) / (1/a + 1/b + 1/c)` for smooth elevation transitions
- **Domain warping** — noise-driven coordinate offsets for organic coastlines
- **Density-based subduction** — tanh mapping of density differences with undulation noise
- **BFS distance fields** — randomized frontier expansion from boundary seeds, used for elevation, coast distance, rift width, ridge profiles, and back-arc basins
- **Gaussian dome uplift** — hotspot volcanism modeled as dual-component Gaussians (thermal swell + volcanic peak) with domain-warped shape distortion, anisotropic drift elongation, summit calderas, radial rift ridges, and age-dependent texture blending

## Project Structure

```
index.html              HTML markup + import map + structured data
styles.css              All CSS
robots.txt              Search engine crawler directives
sitemap.xml             Sitemap for search engine indexing
llms.txt                AI/LLM-readable site description (AISEO)
CNAME                   Custom domain config (orogen.studio)
preview.png             Social preview image (og:image / Twitter card)
js/
  main.js               Entry point — UI wiring, animation loop
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
  ocean-land.js         Ocean/land assignment with continent seeding
  elevation.js          Collisions, stress propagation, distance fields, elevation
  terrain-post.js       Domain warping, bilateral smoothing, glacial/hydraulic/thermal erosion, ridge sharpening, soil creep
  climate-util.js       Shared climate utilities — smoothing, ITCZ lookup, percentile selection
  wind.js               Seasonal wind simulation — pressure fields, ITCZ tracking, Coriolis wind
  ocean.js              Ocean surface currents — rule-based wind-belt gyres, coast BFS, circumpolar detection
  precipitation.js      Precipitation simulation — moisture advection, ITCZ/frontal/orographic effects, blended with heuristic
  heuristic-precip.js   Heuristic zonal precipitation model — smooth latitude/continentality/orographic patterns
  temperature.js        Temperature simulation — ITCZ thermal equator, lapse rate, continentality, ocean currents
  scene.js              Three.js scene, cameras, controls, lights
  planet-mesh.js        Voronoi mesh, map projection, hover highlight
  edit-mode.js          Ctrl-click plate toggle + hover info
  detail-scale.js       Non-linear (power-curve) detail slider mapping
```

## Dependencies

Loaded via CDN import maps (no installation needed):

- [Three.js](https://threejs.org/) v0.160.0 — 3D rendering
- [Delaunator](https://github.com/mapbox/delaunator) v5.0.1 — 2D Delaunay triangulation

## License

This project is licensed under the GNU General Public License v3.0 — see [LICENSE](LICENSE) for details.

## Acknowledgments

Inspired by [Red Blob Games' planet generation](https://www.redblobgames.com/x/1843-planet-generation/) — Fibonacci sphere meshing, dual-mesh traversal, and distance-field elevation approach.
