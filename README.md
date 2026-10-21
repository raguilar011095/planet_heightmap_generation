# World Orogen

A browser-based procedural planet generator that creates realistic terrestrial planets with tectonic plate simulation, elevation modeling, and interactive editing. Uses native ES modules with no build step required.

[![Live Site](https://img.shields.io/badge/Try_it-orogen.studio-brightgreen)](https://orogen.studio/) ![Three.js](https://img.shields.io/badge/Three.js-0.160.0-blue) ![No Build](https://img.shields.io/badge/build-none-green)

## Philosophy

World Orogen is concept art for planets. It's built for the moment early in a project when you need a world that *looks* real — believable tectonics, organic coastlines, climate patterns that feel right — but you don't need a geophysical simulation to get there. The science isn't decoration: plate collision models inspired by real tectonics, pressure-driven wind patterns, and Köppen classification are what make the output feel convincing at a glance. If a climate scientist squints and finds inaccuracies, that's fine — but the scientific foundation is what earns the first glance. Plausibility, not precision.

The core value is creative velocity. Generate a planet in seconds, tweak plates and terrain until it matches your vision, then export high-resolution maps into whatever comes next — Gaea, Wonderdraft, Photoshop, a game engine, a novel outline. Orogen is designed to be the fastest path from a blank page to a world worth building on — the first tool in your worldbuilding pipeline, not the last.

## Guiding Principles

1. **Artistic appeal** — Visually interesting, scientifically informed output. Aesthetics come first.
2. **Ease of use and efficiency** — Approachable interface, fast generation. Don't sacrifice usability for realism.
3. **Scientific plausibility** — Grounded in real planetary science. Believable, not necessarily physically accurate.

All three are considered together; ties are broken in the order above.

## Features

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
- **Interactive editing** — Ctrl-click plates to mark them for reshaping (multi-select with visual tinting), then click Rebuild to apply all changes at once. Ctrl-click again to undo a pending selection. Press Escape to cancel all pending edits
- **Climate simulation** — one climate shared with the Evolution page (`v2/js/climate/`; Generate and Import run it through `js/climate-new.js`): a seasonal energy balance (sunlight for the planet's tilt, snow and sea-ice albedo, ice sheets, air masses carried inland, clouds; sea ice that thickens through the winter — slower as it thickens — and melts back through the summer, so a pack lasts the summer where winters are long — never past the winter's edge — and pulls back from warm currents well offshore), pressure belts and winds from it (the ITCZ at the thermal equator, the Hadley and Ferrel cells, monsoon thermal lows and highs — the tropical trough running into a summer continent's heat low, so the monsoon reaches the Himalayan foothills, and a monsoon trough deeper the warmer its heat low (deep where a plateau heats the air aloft, shallow over a flat desert) — friction), a wind-driven ocean (gyres with western boundary currents like the Gulf Stream, circumpolar currents, coastal upwelling, the overturning's heat — its currents seasonal in the tropics, so the monsoon seas' currents reverse), and a rain budget of the water each air column carries (evaporation, transport, rain-out, storms — the mid-latitudes' and the tropics' monsoon depressions and easterly waves, where the low-level winds turn cyclonically; a baseline of frontal rain along each hemisphere's polar front, moving with the seasons and kept out of the highs and the rain shadows — windward slopes and rain shadows) — coupled, and solved for all twelve months on a fixed 1° grid, so it takes a few seconds at any detail and looks the same at every resolution. Each region's twelve months, at its own height, give its Köppen class. Against real Earth it matches the observed Köppen map on about half the land (the old climate: about 38 %); see `plans/CLIMATE_REBUILD_REPORT.md`.
- **Map type switcher** — first-class Terrain / Satellite / Climate / Heightmap tabs with color legends for each view
- **Climate at any detail** — a few seconds whatever the detail; on phones, above 640K regions, it is computed when a climate view is first chosen
- **Detailed visualization** — climate layers in real units, each where it has seasons for the Year, January or July (pressure with the ITCZ, wind, ocean currents, upwelling, ice, temperature, precipitation, temperature range, rain shadow, aridity, growing season, rain seasonality), plus the geology and plate-physics layers, for viewing each component in isolation. Wind and current layers draw arrows on both globe and map views.
- **Heightmap import** — bring your own equirectangular B&W heightmap (Earth, Mars, hand-drawn maps) onto a 3D globe. Black pixels become ocean, brighter pixels become higher land. The import page (`/import`) runs full climate simulation (wind, precipitation, temperature, K&ouml;ppen) on your imported terrain, with optional terrain sculpting (smoothing, erosion, ridge sharpening). Supported formats: PNG, JPEG, WebP.
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

### Navigation

A top navigation bar connects the pages:
- **Studio** (`/studio`) — the three tools side by side, what each is for, and curated worldbuilding resources (blogs, YouTube channels, other tools)
- **Generate** (`/`) — procedural planet generation with tectonic plates, erosion, and climate
- **Import** (`/import`) — import your own equirectangular B&W heightmap, view it on a 3D globe, and run climate simulation. Black (0) = ocean, brighter = higher elevation. Supports PNG, JPEG, and WebP.
- **Evolution** (`/evolution`, in beta and best on a desktop for now; tagged so on its page and the Studio card) — watch a planet's tectonic history unfold, stop on a moment and add detail (rivers, glaciers, its own climate, a satellite view), then export it; its Climate tab has every climate layer Generate's Inspect has, and its Geology tab (on detailed moments) what the history left in the rock — a map of its rocks (sediment and sedimentary rock, volcanic arcs, flood basalts, granite, slate and gneiss, ancient shields with their greenstone belts, ophiolites; close to Earth's mix), its mountain belts, active, worn and long gone, the past shallow seas, the sediment laid on the continents and how deep erosion has cut — and its **Deposits**, by metal (iron, copper, gold, silver, tin, lead and zinc, aluminium, nickel, platinum, diamonds, salt; coal, oil and gas, peat, wood — each all its sources together) or by the kind of deposit — ~30 kinds of ore, fuel and mineral where the history and the finished climate and rivers put them (copper and gold over volcanic arcs, gold in old belts, tin far inboard and scarce, lead-zinc in basins, nickel and platinum under flood basalts, diamonds on ancient cratons, oil and gas, coal; bauxite, laterites, salt and peat by the climate; placers down the rivers), each poor, moderate or rich, one at a time or all together — and its **Ages**: what a people of the Stone, Copper, Bronze, Iron and Industrial Ages could reach (the surface first, rich ore only; deeper and poorer ore as technology grows), plus fuel, her **gems** (diamonds, rubies and sapphires, emeralds, aquamarine and tourmaline, opal, turquoise, lapis, amethyst, jade, garnet) and **building stone** — copper growing age by age, tin scarce (the readout says how far to the nearest), where bronze and iron could be made; the richest **districts** marked with an atlas's symbols (Cu, Au, Sn…; a **Districts** button turns them off), each with its story read off the history (*"quartz veins deep in a collision belt last active 320 Myr ago"*) and its rank on the world, and each landmass's share of every resource in the readout; the geology exports too — the Rocks, Deposits and each age's map, a greyscale mask per resource, the districts as GeoJSON and CSV, and a resource atlas in words; see `v2/README.md`

On narrow phones the Import tab reads just "Import".

### Sharing Planets

Every generated planet produces a **planet code** (shown below the Build button) that encodes the random seed, all slider values, and any plate edits. An unedited planet is 21 characters; plate edits (applied via Rebuild) extend the code to include the toggled plates. Older codes (13–18 characters) from previous versions are still supported — missing sliders default to their current default values. To share a planet:

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
| Continent Size Variety | 0 – 1 | 0.35 | How much continent sizes vary — 0 keeps continents similar in size, 1 allows a mix of large and small landmasses |
| Land Coverage | 0 – 1 | 0.3 | Percentage of the planet covered by land. Low values create ocean worlds, high values create large continents whose interiors, far from the sea, are drier |

### Terrain Sculpting

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

### Visual Options

- **Map Type** — segmented Terrain / Satellite / Climate / Heightmap tabs for quick switching between the four most common visualizations. Each tab shows a color legend:
  - **Terrain** — elevation color ramp from deep ocean through sea level to mountain peaks
  - **Satellite** — the same look as Evolution's Satellite view (`v2/js/evolution/sat-style.js`): each family of climates in its own colours by height — its lowland colour up to its tree line, then dark grey-red rock, grey rock and snow (rainforests deep green, deserts sand to rust to dark rock, taiga dark green, tundra grey-green, cold deserts like tundra) — blended across the climates' edges (noise-warped, on a fixed grid so it looks the same at every detail), with a gentle fractal mottling; for the year, January or July (the season picker): each place in its own season by latitude, the even mean toward the equator, the snow line lower in winter, the climate's own snow and ice sheets; the sea in the terrain palette with sharp, ragged sea ice in its season.
  - **Climate** — Köppen-Geiger classification with color swatches for all 30 climate types
  - **Heightmap** — black-to-white gradient on a fixed absolute scale (-5 km ocean floor to 6 km peaks), so the same physical height always maps to the same shade
- **View** dropdown — switch between Globe and Map (equirectangular projection)
- **Center Longitude** slider (map mode only) — shifts the map projection's central meridian to any longitude from 180°W to 180°E, scrolling the equirectangular projection so the chosen longitude is centered. Exports are unaffected (always centered on 0°).
- **Wireframe** — toggle switch to show Voronoi cell edges as a wireframe overlay
- **Show Plates** — toggle switch to color regions by plate (green shades = land, blue shades = ocean); also draws black super plate boundary lines showing tectonic super-groups
- **Auto-Rotate** — toggle switch to spin the globe continuously
- **Grid Lines** — toggle switch for latitude/longitude grid overlay on both globe and map views
- **Grid Spacing** — choose the interval between grid lines: 30°, 15°, 10°, 5°, or 2.5°

### Inspect Dropdown

The **Inspect** dropdown (in Visual Options, below the map tabs) selects a detailed visualization layer. Options are organized into groups:

- **Main views** (ungrouped at top) — Terrain, Satellite, Köppen Climate, Land Heightmap
- **Geology** — Base, Tectonic, Noise, Interior, Coastal, Ocean Floor, Hotspot, Tectonic Activity, Margins, Back-Arc, Fold Ridge, Orogenic Power, Erosion Delta (blue = eroded, red = deposited)
- **Atmosphere** — Pressure (sea-level pressure in hPa, blue = low, red = high, with the wind's arrows and the ITCZ as a green line), Wind (speed in m/s, with arrows)
- **Ocean** — Ocean Currents (the sea's temperature against its latitude's average — warm and cold currents — with current arrows; the currents are seasonal in the tropics), Upwelling (m/day: cold, nutrient-rich water rising where the wind pushes the surface away), Ice (sea ice, with a summer pack where winters are long; on land, the season's snow and the ice sheets — so in winter the white runs from an ice sheet across the snowy land to the sea ice)
- **Climate** — Temperature (°C in climate-map bands; the sea's surface temperature at sea), Precipitation (mm/month, or mm/year for the Year; brown = dry, green = moderate, blue = wet), Temperature Range (warmest month − coldest: continentality), Rain Shadow (how mountains move the rain: blue windward slopes, red-brown rain shadows), Aridity (the UNEP aridity index, precipitation ÷ potential evaporation: hyper-arid to humid), Growing Season (months above 10 °C), Rain Seasonality (Walsh & Lawler's index, from even rain to almost all of it in a month or two)
- **Season** — beside Inspect, for the layers that change through the year: Year, January or July (the same in both hemispheres — January is the southern summer)
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

A five-step tutorial modal introduces the tool on first visit (auto-shown via `localStorage`). It covers planet generation, slider controls, interactive editing, visualization, saving/sharing via planet codes, and map export. A **?** help button in the top-right corner reopens the tutorial at any time. The modal can be dismissed with the close button, backdrop click, Escape key, or the "Get Started" button on the final step.

A **What's New** modal is shown once per release to returning users (those who have already dismissed the tutorial). It highlights new features, changes, and a heads-up that saved planet codes may produce different-looking worlds due to terrain/climate reworks. The modal uses a versioned `localStorage` flag (`wo-whatsnew-seen`) — bump the `VERSION` constant in `initWhatsNew()` to trigger it again on the next release.

### Interaction

Navigation hints are shown in the sidebar panel and as a contextual tooltip when hovering the planet.

| Action | Desktop | Mobile |
|--------|---------|--------|
| Rotate globe / pan map | Drag | Drag (one finger) |
| Zoom | Scroll wheel | Pinch with two fingers |
| Highlight plate + info card | Hover | — |
| Mark plate for reshaping | Ctrl-click a plate (multi-select) | Tap the edit button (pencil), then tap plates |
| Undo pending plate | Ctrl-click the same plate again | Tap the same plate again |
| Apply pending edits | Click the Rebuild button | Tap the Rebuild button |
| Cancel all pending edits | Press Escape | — |

Hovering over a region shows an info card with plate type, elevation, coordinates, and (when climate has been computed) January and July temperature (the sea's surface temperature at sea, and its sea ice), yearly and monthly precipitation, aridity, and K&ouml;ppen classification. Pending plates show a colored tint (green = ocean→land, blue = land→ocean) and hover text indicates "(pending)".

### Mobile Support

World Orogen is fully usable on phones and tablets:

- **Bottom-sheet sidebar** — on screens 768px or narrower, the sidebar becomes a bottom sheet with a drag handle. Drag or tap the handle to expand/collapse. The globe stays visible above.
- **Pinch-to-zoom** — two-finger pinch zooms the globe and map, using the same smooth lerp as desktop scroll-zoom.
- **View switcher** — a dropdown in the top-right lets you switch between Terrain, Satellite, Climate, and Heightmap views without opening the bottom sheet.
- **Edit-mode toggle** — a floating pencil button (bottom-right) activates plate editing. Tap it to toggle edit mode (glows green when active), then tap plates to mark them. Tap the Rebuild button to apply all changes at once.
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
11. **Terrain post-processing** applies domain warping (controlled by Terrain Warp slider) using FBM simplex noise to deform the elevation field for organic coastlines and mountain ridges via greedy mesh walk, then bilateral smoothing (controlled by Smoothing slider) to blend BFS banding artefacts, two always-on detail-noise passes add domain-warped high-octave FBM relief to land cells (in physical km space, with Newton-Raphson inversion of the elev→km quartic) to break up flat continental interiors before erosion routes drainage through them — Layer 1 adds 0–100 m positive bumps for broad rolling variety, then Layer 2 adds ±50 m bipolar bumps at 2× frequency and 2× warp amplitude with magnitude biased toward the extremes for sharper finer-scale relief; both layers are dampened by 50 % at full craton/basin weight so geologically quiet regions stay characteristically subdued, and both are scaled by the orogenic-power field so noise relief tracks active mountain-building zones and quiets down over tectonically inactive crust, glacial erosion (controlled by Glacial Erosion slider) carves fjords, U-shaped valleys, and lake basins at high latitudes and altitudes, priority-flood pit resolution carves canyons through mountain saddle points to ensure all land drains to the ocean, iterative implicit stream power hydraulic erosion with sediment deposition (controlled by Hydraulic Erosion slider) carves self-reinforcing river valleys, thermal erosion (controlled by Thermal Erosion slider) softens ridges via talus-angle material transport, ridge sharpening (controlled by Ridge Sharpening slider) accentuates mountain ridgelines, and always-on soil creep gently rounds off hillslopes
12. **Climate** — the new climate (`v2/js/climate/`, see `v2/README.md` and `plans/CLIMATE_REBUILD_REPORT.md`) on a fixed 1° grid: a seasonal energy balance (mean and two harmonics of the year) for temperature, pressure belts and winds derived from it, a wind-driven ocean (gyres, circumpolar channels, upwelling, overturning heat; seasonal in the tropics), and a column-water rain budget, coupled; the energy balance and the ocean solved on the 1° grid itself, the circulation and rain on 3° (the energy balance's surface has a gentle variety of brightness — `TEMP_ALBEDO_VARY`, smooth fractal noise of ±0.025 at up to 900 km — an input it works through, so snow lines and ice-sheet edges follow the physics irregularly rather than the grid); then twelve months per region at the region's own height (lapse rate, a share of its own relief, orographic rain), and Köppen from those months. The Temperature and Precipitation sliders are its `greenhouseWm2` (a forcing on the heat radiated to space, in the energy balance) and `precipScale` (evaporation, in the rain budget) — so the ice, winds, currents and rain all answer them. What the sea's layers draw is refined for the eye (`v2/js/climate/grid.js` `refineForDrawing`): each field carried across the coast from its own side as far as it takes (the sea's temperature, ice, currents and upwelling from the sea; the ice sheets from the land), the rows near the poles evened out, and refined onto the 1° grid by a smooth curve (and carried no more than 600 km: an island far out keeps its own) — so no coastal rims, straight coarse-cell edges or polar wedges; the physics, Köppen and the land's own values are untouched.
13. **Rendering** builds a Voronoi cell mesh with per-vertex colors and terrain displacement

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
index.html              Main page — HTML markup + import map + structured data
import.html             Import page — heightmap upload + climate visualization
evolution.html          Evolution page — a planet's tectonic history (v2/)
studio.html             Studio page — the tools explained + curated resources
studio.css              Studio page styles
assets/studio/          Screenshots of each tool for the Studio cards
styles.css              Shared CSS (all pages)
robots.txt              Search engine crawler directives
sitemap.xml             Sitemap for search engine indexing
site.webmanifest        Web app manifest (metadata + theming)
llms.txt                AI/LLM-readable site description (AISEO)
humans.txt              Project credits
CNAME                   Custom domain config (orogen.studio)
404.html                Custom 404 page
preview.png             Social preview image (og:image / Twitter card)
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
  climate-config.js     The OLD climate's parameters (no longer run by the app; kept for the old tuning diagnostics)
  climate-util.js       Shared climate utilities — smoothing, ITCZ lookup, percentile selection
  wind.js … temperature.js  The OLD climate (wind, ocean, precipitation, heuristic-precip, temperature) — no longer run by the app
  scene.js              Three.js scene, cameras, controls, lights; fitCamera keeps the whole globe in view on portrait screens
  planet-mesh.js        Voronoi mesh, map projection, hover highlight
  edit-mode.js          Ctrl-click plate multi-select + hover info
  detail-scale.js       Non-linear (power-curve) detail slider mapping
  build-error.js        A failed build, import or export shown in the build overlay, with a Close button
  support-check.js      Classic script run before the modules: a browser that cannot run the app (no import maps, no
                        WebGL) or app code that fails to load gets a plain message instead of a blank page
v2/                     World Orogen V2 — the Evolution page (/evolution) and the climate every page runs;
                        tectonic *history* engine built in confirmed phases; see v2/README.md and
                        plans/V2_TECTONIC_HISTORY_DESIGN.md. Open /v2/ for the Tectonics Lab (locally: the deploy leaves
                        the labs out);
                        `node v2/tools/check-phase<N>.mjs` runs each phase's headless checks
tuning/
  climate/              Automated climate tuning suite — scores the simulated Köppen
                        map of an imported Earth heightmap against the observed
                        Köppen-Geiger classification and optimizes v2/js/climate/config.js
                        parameters to match (see tuning/climate/README.md)
  geology/              earth-deposits.mjs — Evolution's deposit climate tests (bauxite,
                        peat, salt, enriched copper, opal, turquoise) run on observed Earth climate beside
                        where those deposits really are
```

## Dependencies

Loaded via CDN import maps (no installation needed):

- [Three.js](https://threejs.org/) v0.160.0 — 3D rendering
- [Delaunator](https://github.com/mapbox/delaunator) v5.0.1 — 2D Delaunay triangulation

## License

This project is licensed under the GNU General Public License v3.0 — see [LICENSE](LICENSE) for details.

## Acknowledgments

Inspired by [Red Blob Games' planet generation](https://www.redblobgames.com/x/1843-planet-generation/) — Fibonacci sphere meshing, dual-mesh traversal, and distance-field elevation approach.

Additional inspiration and reference from:
- [Worldbuilding Pasta](https://worldbuildingpasta.blogspot.com/) — worldbuilding science and climate reference
- [Artifexian](https://www.youtube.com/@Artifexian) — worldbuilding tutorials and planetary science inspiration
- [Madeline James](https://www.youtube.com/@MadelineJamesWorldbuilds) ([website](https://www.madelinejameswrites.com/)) — worldbuilding methodology and climate design reference
- [Fractal Philosophy](https://www.youtube.com/watch?v=7xL0udlhnqI) — procedural terrain generation inspiration
