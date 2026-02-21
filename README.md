# World Buildr

A browser-based procedural planet generator that creates realistic terrestrial planets with tectonic plate simulation, elevation modeling, and interactive editing. Uses native ES modules with no build step required.

![Three.js](https://img.shields.io/badge/Three.js-0.160.0-blue) ![No Build](https://img.shields.io/badge/build-none-green)

## Guiding Principles

1. **Artistic appeal** — Visually interesting, scientifically informed output. Aesthetics come first.
2. **Ease of use and efficiency** — Approachable interface, fast generation. Don't sacrifice usability for realism.
3. **Scientific plausibility** — Grounded in real planetary science. Believable, not necessarily physically accurate.

All three are considered together; ties are broken in the order above.

## Features

- **Fibonacci sphere meshing** with Voronoi cell tessellation via Delaunay triangulation
- **Tectonic plate simulation** — round-robin flood fill with directional growth bias, boundary smoothing, and fragment reconnection
- **Ocean/land assignment** — farthest-point continent seeding, round-robin growth with separation guarantees, trapped sea absorption, targeting ~30% land coverage
- **Collision detection** — convergent, divergent, and transform boundary classification with density-based subduction modeling
- **Elevation generation** — three distance fields (mountain/ocean/coastline) combined via harmonic-mean formula, stress-driven uplift, asymmetric mountain profiles, continental shelf/slope/abyss profiles, foreland basins, plateau formation, and rift valleys with graben profiles
- **Ocean floor features** — mid-ocean ridges at divergent boundaries, deep trenches at subduction zones, fracture zones at transform boundaries, back-arc basins behind subduction zones
- **Island arcs** — volcanic island chains at ocean-ocean convergent boundaries with ridged noise shaping
- **Hotspot volcanism** — mantle plume simulation with drift-trail island chains, per-hotspot variation in strength/decay/spacing, and volcanic texture noise
- **Coastal roughening** — fractal noise with active/passive margin differentiation, domain warping for bays/headlands, and offshore island scattering
- **3D globe rendering** with atmosphere rim shader, translucent water sphere, terrain displacement, and starfield
- **Equirectangular map projection** with antimeridian wrapping
- **Interactive editing** — Ctrl-click any plate to toggle between land and ocean, with live elevation recomputation
- **Detailed visualization** — ten selectable inspection layers (base, tectonic, noise, interior, coastal, ocean, hotspot, tectonic activity, margins, back-arc) for viewing each elevation component in isolation

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

## Controls

### Shape Your World

All generation parameters live in a single section:

| Control | Range | Default | Description |
|---------|-------|---------|-------------|
| Detail | 2,000 – 640,000 | 200,000 | Number of Voronoi cells on the sphere |
| Irregularity | 0 – 1 | 0.75 | Randomization of Fibonacci point positions |
| Plates | 4 – 120 | 80 | Number of tectonic plates |
| Continents | 1 – 10 | 4 | Target number of separate landmasses |
| Roughness | 0 – 0.5 | 0.40 | Fractal noise magnitude for terrain roughness |

### Visual Options

- **View** dropdown — switch between Globe and Map (equirectangular projection)
- **Wireframe** — show Voronoi cell edges as a wireframe overlay
- **Show Plates** — color regions by plate (green shades = land, blue shades = ocean)
- **Auto-Rotate** — spin the globe continuously

### Detailed Visualization

- **Inspect** dropdown — select an elevation component to visualize in isolation: Terrain, Base, Tectonic, Noise, Interior, Coastal, Ocean, Hotspot, Tectonic Activity, Margins, or Back-Arc

### Interaction

Navigation hints are shown in the sidebar panel and as a contextual tooltip when hovering the planet.

- **Drag** to rotate the globe (or pan in map view)
- **Scroll** to zoom in/out (smooth lerp-based zoom)
- **Hover** over the planet to highlight the plate under the cursor and see its type
- **Ctrl-click** a plate to reshape continents — ocean plates rise into land, land plates flood into ocean (elevation is recomputed automatically)

## How It Works

### Pipeline

1. **Fibonacci spiral** distributes N points evenly on a unit sphere with optional jitter
2. **Stereographic projection** maps the sphere points to 2D
3. **Delaunator** computes Delaunay triangulation in projected space
4. **Pole closure** connects convex hull edges to a pole point, creating a watertight mesh
5. **Plate generation** via round-robin flood fill with per-plate growth rates and directional bias
6. **Ocean/land assignment** using farthest-point continent seeding with area budgeting
7. **Collision detection** simulates plate drift to classify convergent/divergent/transform boundaries
8. **Stress propagation** diffuses collision stress inward through continental plates via frontier BFS
9. **Elevation assignment** combines distance fields, stress-driven uplift, ocean floor profiles, rift valleys, back-arc basins, hotspot volcanism, island arcs, coastal roughening, and multi-layered noise
10. **Rendering** builds a Voronoi cell mesh with per-vertex colors and terrain displacement

### Key Algorithms

- **Seeded PRNG** — Park-Miller LCG for deterministic generation
- **3D Simplex noise** — with fBm and ridged fBm variants for terrain detail
- **Harmonic-mean distance blending** — `(1/a - 1/b) / (1/a + 1/b + 1/c)` for smooth elevation transitions
- **Domain warping** — noise-driven coordinate offsets for organic coastlines
- **Density-based subduction** — tanh mapping of density differences with undulation noise
- **BFS distance fields** — randomized frontier expansion from boundary seeds, used for elevation, coast distance, rift width, ridge profiles, and back-arc basins
- **Gaussian dome uplift** — hotspot volcanism modeled as great-circle-distance Gaussians with shape warping noise

## Project Structure

```
index.html              HTML markup + import map
styles.css              All CSS
js/
  main.js               Entry point — UI wiring, animation loop
  state.js              Shared mutable application state
  generate.js           Orchestrates the full geology pipeline
  rng.js                Seeded PRNG (Park-Miller LCG)
  simplex-noise.js      3D Simplex noise with fBm and ridged fBm
  color-map.js          Elevation → RGB colour mapping
  sphere-mesh.js        Fibonacci sphere, Delaunay, SphereMesh dual-mesh
  plates.js             Tectonic plate generation (round-robin flood fill)
  ocean-land.js         Ocean/land assignment with continent seeding
  elevation.js          Collisions, stress propagation, distance fields, elevation
  scene.js              Three.js scene, cameras, controls, lights
  planet-mesh.js        Voronoi mesh, map projection, hover highlight
  edit-mode.js          Ctrl-click plate toggle + hover info
```

## Dependencies

Loaded via CDN import maps (no installation needed):

- [Three.js](https://threejs.org/) v0.160.0 — 3D rendering
- [Delaunator](https://github.com/mapbox/delaunator) v5.0.1 — 2D Delaunay triangulation

## Acknowledgments

Inspired by [Red Blob Games' planet generation](https://www.redblobgames.com/x/1843-planet-generation/) — Fibonacci sphere meshing, dual-mesh traversal, and distance-field elevation approach.
