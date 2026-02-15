# Procedural Planet Generator

A browser-based procedural planet generator that creates realistic terrestrial planets with tectonic plate simulation, elevation modeling, and interactive editing. Built as a single HTML file with no build step required.

![Planet Generator](https://img.shields.io/badge/Three.js-0.160.0-blue) ![No Build](https://img.shields.io/badge/build-none-green)

## Features

- **Fibonacci sphere meshing** with Voronoi cell tessellation via Delaunay triangulation
- **Tectonic plate simulation** — round-robin flood fill with directional growth bias, boundary smoothing, and fragment reconnection
- **Ocean/land assignment** — farthest-point continent seeding, round-robin growth with separation guarantees, trapped sea absorption, targeting ~30% land coverage
- **Collision detection** — convergent, divergent, and transform boundary classification with density-based subduction modeling
- **Elevation generation** — three distance fields (mountain/ocean/coastline) combined via harmonic-mean formula, stress-driven uplift, continental shelf/slope/abyss profiles, mid-ocean ridges, trenches, foreland basins, and rift valleys
- **Coastal roughening** — fractal noise, domain warping for bays/headlands, and offshore island scattering
- **3D globe rendering** with atmosphere rim shader, translucent water sphere, terrain displacement, and starfield
- **Equirectangular map projection** with antimeridian wrapping
- **Interactive editing** — toggle plates between land/sea, set drift directions by dragging, adjust plate densities
- **Visualization overlays** — Voronoi cell borders, plate coloring, boundary stress view

## Quick Start

Open `index.html` in any modern browser. No server, no dependencies to install, no build step.

```
# Or serve locally if you prefer
npx serve .
```

Click **Generate New Planet** to create a new random planet.

## Controls

### Sliders

| Control | Range | Description |
|---------|-------|-------------|
| Regions | 2,000 - 640,000 | Number of Voronoi cells on the sphere |
| Plates | 4 - 120 | Number of tectonic plates |
| Continents | 1 - 10 | Number of separate landmasses |
| Jitter | 0 - 1 | Randomization of Fibonacci point positions |
| Noise | 0 - 0.4 | Fractal noise magnitude for terrain detail |
| Collision Spread | 0 - 10 | How far collision stress propagates inland |
| Water Level | -0.5 - 0.5 | Raises or lowers the sea level |

### Toggles

- **Borders** — show Voronoi cell edges
- **Plates** — color regions by plate (green = land, blue = ocean)
- **Boundaries** — visualize boundary types and stress magnitude
- **Rotate** — auto-rotate the globe
- **Edit Mode** — enable interactive plate editing
- **Map** — switch to equirectangular map projection

### Edit Mode

When Edit Mode is enabled, three sub-modes are available:

- **Land / Sea** — click a plate to toggle between land and ocean
- **Set Drift** — click and drag on a plate to change its movement direction
- **Density** — click to increase plate density (+0.1), shift+click to decrease (-0.1)

### Navigation

- **Drag** to rotate the globe
- **Scroll** to zoom in/out
- **Hover** over a plate to see its type, density, and drift direction

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
9. **Elevation assignment** combines distance fields, stress-driven uplift, ocean floor profiles, and multi-layered noise
10. **Rendering** builds a Voronoi cell mesh with per-vertex colors and terrain displacement

### Key Algorithms

- **Seeded PRNG** — Park-Miller LCG for deterministic generation
- **3D Simplex noise** — with fBm and ridged fBm variants for terrain detail
- **Harmonic-mean distance blending** — `(1/a - 1/b) / (1/a + 1/b + 1/c)` for smooth elevation transitions
- **Domain warping** — noise-driven coordinate offsets for organic coastlines
- **Density-based subduction** — tanh mapping of density differences with undulation noise

## Dependencies

Loaded via CDN import maps (no installation needed):

- [Three.js](https://threejs.org/) v0.160.0 — 3D rendering
- [Delaunator](https://github.com/mapbox/delaunator) v5.0.1 — 2D Delaunay triangulation

## Acknowledgments

Inspired by [Red Blob Games' planet generation](https://www.redblobgames.com/x/1843-planet-generation/) — Fibonacci sphere meshing, dual-mesh traversal, and distance-field elevation approach.
