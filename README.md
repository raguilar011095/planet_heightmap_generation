# Atlas Engine

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
- **Terrain post-processing** — independently controllable bilateral smoothing to blend harsh BFS distance-field boundaries, glacial erosion that carves fjords, U-shaped valleys, and lake basins at high latitudes and altitudes via latitude-driven ice flow with drainage accumulation, priority-flood pit resolution with canyon carving (Barnes et al. algorithm that ensures every land cell drains to the ocean, carving dramatic canyons through mountain saddle points rather than filling basins), iterative implicit stream power hydraulic erosion (Braun-Willett style) that carves self-reinforcing river valleys with automatic sediment deposition in flat receivers, thermal erosion that softens ridges via talus-angle material transport, ridge sharpening that accentuates mountain ridgelines, and always-on soil creep (Laplacian diffusion) that rounds off hillslopes
- **Coastal roughening** — fractal noise with active/passive margin differentiation, domain warping for bays/headlands, and offshore island scattering
- **3D globe rendering** with atmosphere rim shader, translucent water sphere, terrain displacement, and starfield
- **Equirectangular map projection** with antimeridian wrapping
- **Interactive editing** — Ctrl-click any plate to toggle between land and ocean, with live elevation recomputation
- **Detailed visualization** — thirteen selectable inspection layers (base, tectonic, noise, interior, coastal, ocean, hotspot, tectonic activity, margins, back-arc, erosion delta, heightmap, land heightmap) for viewing each elevation component in isolation
- **Map export** — download high-resolution equirectangular PNGs (color terrain, B&W heightmap, or land-only heightmap) at configurable widths up to 65536px with tiled rendering

## Quick Start

Serve the project with any local HTTP server (required for ES modules):

```bash
# Python
python3 -m http.server 8000

# Or Node.js
npx serve .
```

Then open **http://localhost:8000** in your browser. No dependencies to install, no build step.

Click **Build New World** to create a new random planet.

### Sharing Planets

Every generated planet produces a **planet code** (shown below the Build button) that encodes the random seed, all slider values, and any plate edits. An unedited planet is 17 characters; Ctrl-click edits extend the code to include the toggled plates. To share a planet:

- **Copy** the code with the copy button and send it to someone
- **Load** a code by pasting it into the planet code field and clicking Load (or pressing Enter). The Load button turns blue when a new code is ready to apply.
- **URL sharing** — the code is also stored in the URL hash (e.g. `#a7f3kq9xp2b`), so you can share the full URL directly. Opening a URL with a valid hash auto-loads that planet, including any plate edits.

## Controls

### Shape Your World

Core world parameters that control the planet's structure (changing these requires a full rebuild):

| Control | Range | Default | Description |
|---------|-------|---------|-------------|
| Detail | 2,000 – 2,560,000 | 200,000 | Number of Voronoi cells on the sphere |
| Irregularity | 0 – 1 | 0.75 | Randomization of Fibonacci point positions |
| Plates | 4 – 120 | 80 | Number of tectonic plates |
| Continents | 1 – 10 | 4 | Target number of separate landmasses |
| Roughness | 0 – 0.5 | 0.40 | Fractal noise magnitude for terrain roughness |

### Terrain Sculpting

Post-processing passes that refine the terrain (collapsed by default — the defaults produce good results). These do not require a full rebuild; adjusting any slider lights up the **Reapply** button at the bottom of this section — click it to reapply only the sculpting passes on the current planet.

| Control | Range | Default | Description |
|---------|-------|---------|-------------|
| Smoothing | 0 – 1 | 0.10 | Blends harsh terrain boundaries from tectonic generation |
| Glacial Erosion | 0 – 1 | 0.35 | Ice-age sculpting — carves fjords, U-shaped valleys, and lake basins at high latitudes and altitudes via latitude-driven ice flow |
| Hydraulic Erosion | 0 – 1 | 0.35 | Iterative stream-power erosion — resolves endorheic basins via priority-flood canyon carving, then carves river valleys and dendritic drainage networks, with automatic sediment deposition in flat receivers |
| Thermal Erosion | 0 – 1 | 0.10 | Slope-driven material transport — softens ridges and creates natural talus slopes |
| Ridge Sharpening | 0 – 1 | 0.35 | Accentuates mountain ridgelines — pushes peaks further above their surroundings for more dramatic terrain |

### Visual Options

- **View** dropdown — switch between Globe and Map (equirectangular projection)
- **Wireframe** — show Voronoi cell edges as a wireframe overlay
- **Show Plates** — color regions by plate (green shades = land, blue shades = ocean)
- **Auto-Rotate** — spin the globe continuously
- **Grid Lines** — toggle latitude/longitude grid overlay on both globe and map views
- **Grid Spacing** — choose the interval between grid lines: 30°, 15°, 10°, 5°, or 2.5°

### Detailed Visualization

- **Inspect** dropdown — select an elevation component to visualize in isolation: Terrain, Base, Tectonic, Noise, Interior, Coastal, Ocean, Hotspot, Tectonic Activity, Margins, Back-Arc, Erosion Delta (blue = eroded, red = deposited), Heightmap (full-range B&W), or Land Heightmap (sea level = black, highest peak = white)

### Export

Click **Export Map** (below Visual Options) to open the export modal:

- **Type** — Color Map (terrain colors), Heightmap (B&W full range, black = deepest, white = highest), or Land Heightmap (B&W, sea level = black, highest peak = white, ocean is black)
- **Width** slider — 1024 to 65536 pixels (height is always width/2 for equirectangular). Large exports use tiled rendering to handle GPU texture limits.
- Downloads an equirectangular PNG with no grid overlay
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
| Highlight plate | Hover | — |
| Reshape continents | Ctrl-click a plate | Tap the edit button (pencil), then tap a plate |

### Mobile Support

Atlas Engine is fully usable on phones and tablets:

- **Bottom-sheet sidebar** — on screens 768px or narrower, the sidebar becomes a bottom sheet with a drag handle. Drag or tap the handle to expand/collapse. The globe stays visible above.
- **Pinch-to-zoom** — two-finger pinch zooms the globe and map, using the same smooth lerp as desktop scroll-zoom.
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
5. **Plate generation** via farthest-point seed placement (with top-3 jitter for variety), round-robin flood fill with per-plate growth rates, directional bias coupled inversely to growth rate, growth-rate governor, and compactness penalty
6. **Ocean/land assignment** using farthest-point continent seeding with area budgeting
7. **Collision detection** simulates plate drift to classify convergent/divergent/transform boundaries
8. **Stress propagation** diffuses collision stress inward through continental plates via frontier BFS
9. **Elevation assignment** combines distance fields, stress-driven uplift, ocean floor profiles, rift valleys, back-arc basins, hotspot volcanism, island arcs, coastal roughening, and multi-layered noise
10. **Terrain post-processing** applies bilateral smoothing (controlled by Smoothing slider) to blend BFS banding artefacts, glacial erosion (controlled by Glacial Erosion slider) carves fjords, U-shaped valleys, and lake basins at high latitudes and altitudes, priority-flood pit resolution carves canyons through mountain saddle points to ensure all land drains to the ocean, iterative implicit stream power hydraulic erosion with sediment deposition (controlled by Hydraulic Erosion slider) carves self-reinforcing river valleys, thermal erosion (controlled by Thermal Erosion slider) softens ridges via talus-angle material transport, ridge sharpening (controlled by Ridge Sharpening slider) accentuates mountain ridgelines, and always-on soil creep gently rounds off hillslopes
11. **Rendering** builds a Voronoi cell mesh with per-vertex colors and terrain displacement

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
index.html              HTML markup + import map
styles.css              All CSS
js/
  main.js               Entry point — UI wiring, animation loop
  state.js              Shared mutable application state
  generate.js           Worker dispatcher — posts jobs, handles results
  planet-worker.js      Web Worker — runs geology pipeline off main thread
  planet-code.js        Planet code encode/decode (seed + sliders → base36)
  rng.js                Seeded PRNG (Park-Miller LCG)
  simplex-noise.js      3D Simplex noise with fBm and ridged fBm
  color-map.js          Elevation → RGB colour mapping
  sphere-mesh.js        Fibonacci sphere, Delaunay, SphereMesh dual-mesh
  plates.js             Tectonic plate generation (farthest-point seeding, round-robin flood fill, compactness constraints)
  ocean-land.js         Ocean/land assignment with continent seeding
  elevation.js          Collisions, stress propagation, distance fields, elevation
  terrain-post.js       Bilateral smoothing, glacial/hydraulic/thermal erosion, ridge sharpening, soil creep
  scene.js              Three.js scene, cameras, controls, lights
  planet-mesh.js        Voronoi mesh, map projection, hover highlight
  edit-mode.js          Ctrl-click plate toggle + hover info
  detail-scale.js       Non-linear (quadratic) detail slider mapping
```

## Dependencies

Loaded via CDN import maps (no installation needed):

- [Three.js](https://threejs.org/) v0.160.0 — 3D rendering
- [Delaunator](https://github.com/mapbox/delaunator) v5.0.1 — 2D Delaunay triangulation

## Acknowledgments

Inspired by [Red Blob Games' planet generation](https://www.redblobgames.com/x/1843-planet-generation/) — Fibonacci sphere meshing, dual-mesh traversal, and distance-field elevation approach.
