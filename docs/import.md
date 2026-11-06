# Import Heightmap

**Your own landmass, its climate:** [orogen.studio/import](https://orogen.studio/import)

Bring a heightmap, whether hand-drawn, from another tool or of a real planet, and Orogen wraps it onto a globe and runs
the full seasonal climate on it, with its rivers and lakes, its ice age, its land's cover and what it could feed, and
optional erosion and sculpting. It opens with Earth, so you can see how well the climate matches the real one. Use it to
check how a world you drew would really behave.

The view (the layer tabs, the map projections), the climate, the finish and the export panel are shared by every tool:
see [shared.md](shared.md). Back to the [README](../README.md).

## Your heightmap

- A 2 : 1 equirectangular greyscale image: PNG, JPEG or WebP.
- Black (0) is ocean; brighter is higher land, white 6 km.
- Your image stays on your device: nothing is uploaded.
- Generate's and Evolution's **Land heightmap** export (the sea black) re-imports here.
- Imported worlds can't be shared with planet codes.

## What it does

1. The image is laid onto the sphere at the Detail chosen and shaped by the sculpting sliders that shape an image
   (Terrain Warp, Smoothing, Ridge Sharpening): the first picture.
2. Evolution's finish then runs on it in the background (`v2/js/finish/finish.js`; plans/SHARED_CORE_PLAN.md U4): the
   climate, the rivers routed — and carved as deep as the erosion sliders ask, by the climate's runoff (at their
   defaults, 0, not at all: the map as drawn) — lakes, the last ice age, dunes and loess, the land's cover (the Satellite
   view, with clouds) and its food. An imported map has no plates and no history, so no Plates or Geology view.

## Controls

- **Detail**: how finely the image is laid onto the sphere, from Coarse to Fine (204,000 regions by default), then
  **Import**.
- **Terrain sculpting**: Terrain Warp, Smoothing and Ridge Sharpening shape the image; Glacial, Hydraulic and Thermal
  Erosion are read by the finish's carving (how far fjords reach, how long its rivers work, how gentle the valley sides
  are). All at 0 by default, so your map is used as drawn. **Reapply** shapes and finishes it again.
- **Climate**: **Temperature** (−30 to +30 W/m²) and **Precipitation** (±50 %), as on Generate; releasing either finishes
  the map again.
- The layer tabs are Terrain, Satellite, Climate, Food and Heightmap.
