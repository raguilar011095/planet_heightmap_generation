# Import Heightmap

**Your own landmass, its climate:** [orogen.studio/import](https://orogen.studio/import)

Bring a heightmap, whether hand-drawn, from another tool or of a real planet, and Orogen wraps it onto a globe and runs
the full seasonal climate on it, with optional erosion and sculpting. It opens with Earth, so you can see how well the
climate matches the real one. Use it to check how a world you drew would really behave.

The view (the layer tabs, the map projections), the climate and the export panel are shared by every tool: see
[shared.md](shared.md). Back to the [README](../README.md).

## Your heightmap

- A 2 : 1 equirectangular greyscale image: PNG, JPEG or WebP.
- Black (0) is ocean; brighter is higher land.
- Your image stays on your device: nothing is uploaded.
- Generate's **Land heightmap** export (the sea black) re-imports here.
- Imported worlds can't be shared with planet codes.

## Controls

- **Detail**: how finely the image is laid onto the sphere, from Coarse to Fine (204,000 regions by default), then
  **Import**.
- **Terrain sculpting**: Generate's six passes (Terrain Warp, Smoothing, Glacial Erosion, Hydraulic Erosion, Thermal
  Erosion, Ridge Sharpening), all at 0 by default so your map is used as drawn. What each does is in
  [generate.md](generate.md#terrain-sculpting).
- **Climate**: **Temperature** (−30 to +30 W/m²) and **Precipitation** (±50 %), as on Generate.
- **Inspect (advanced)**: the Full Heightmap and the Erosion Delta.
- The layer tabs are Terrain, Satellite, Climate and Heightmap (no Plates: an imported world has none).
