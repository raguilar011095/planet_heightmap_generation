# Evolution: detail finer than the mesh

Owner, 2026-10-26: the detailed moments' mountains are "fairly good, but not fully perfect" — "I'm not seeing the carving
we see on the Alps, or the leading edge of the Himalayas"; the troughs may not be deep enough, or the wet sides not carved
enough. Then: do it "all at the same time", and "make sure we are respecting plateaus and we have some of those". Scope
chosen: the zoomed detail (A), sub-mesh carving (B), the mesh-scale fixes (C), and detail finer than the mesh for coasts,
valley floors and rivers, glacial sculpture, fold and fault grain, dunes and lake districts (D1–D4, D6, D7). The sea
floor's fabric, reefs and atolls (D5) are left for later.

## 1. What the measurements said

Seed 799224, 30 % land, 240 Myr (this branch's history: its biggest active collision belt), the finish run stage by stage
(scratch tool `erosion-stages.mjs`); the real Alps and Nepal Himalaya from Terrain Tiles (terrarium, zoom 7, ~1 km),
each cell of the page's terrain mesh holding the mean height of the ground it covers (`earth-relief.mjs`):

| 10M, mountains ≥ 1 km (km) | ours | ours, wet side | Alps | Nepal Himalaya |
|---|---|---|---|---|
| relief within 10 km | 0.73 | 1.00 | 0.78 | 1.12 |
| relief within 30 km | 1.81 | 2.34 | 1.73 | 2.85 |
| depth below the highest ground within 15 km | 0.45 | 0.60 | 0.47 | 0.81 |
| a big valley's rings 1 / 2 / 3 above its floor | 0.47 / 0.69 / 0.80 | | 0.22 / 0.41 / 0.46 | 0.34 / 0.61 / 0.76 |

(2.5M the same picture: depth 0.28 against the Alps' 0.22, the Himalaya's 0.40.)

- **At the mesh's own scale our mountains already match the Alps.** The rising, wet fronts reach ~¾ of the Himalayan
  front's depth; the big valleys are as deep as Earth's, a little more slit-like.
- **The carving the eye misses is finer than the mesh.** The Alps' valleys are 5–15 km apart; the 10M mesh's cells are
  7.7 km apart, 2.5M's 15 km. Averaged to 10M cells the real Alps look as lumpy as ours.
- **And the page shows ~10 km a pixel.** A detailed moment is painted on a texture at most 4096 px wide (desktop): a 10M
  moment's 8192 px picture is halved on screen; exports wider than the picture are only enlarged.
- **What the stages do** (wet side, 10M): the carve doubles the relief; dissection, sediment and the ice age change it by
  a few %; soil creep takes ~10 % back where it is wet and warm (fills valleys as it rounds crests); the active belts'
  hold (`carveActiveHold` 0.3) cuts the rising fronts' valleys by up to 30 %.
- **Plateaus.** The surface before the rivers holds 7.5–9.6 M km² of high flat land (≥ 2.5 km, < 0.8 km of relief within
  30 km); the carve leaves 2.6–3.1 M km² (Tibet ≈ 2.5). It must not shrink.

## 2. The design

### A. The detail where you look

When the view is zoomed in past the picture's own pixels and settles, the page has the region in view drawn again at the
screen's resolution — a **patch** — and lays it over the globe (and the map), feathered at its edges. The patch is made in
a worker from what the page already holds — the finished picture (heights, sea, lakes), the rivers — plus a few small
**driver** pictures the finish now leaves (below), and painted by the same painter as the whole planet (palette, hillshade,
Satellite, every climate layer, the lakes, the rivers' lines). Nothing new is stored per pixel of the patch; zooming out
drops it. On phones the same, at a smaller patch.

Exports wider than the finished picture are made the same way, band by band — the heightmaps included — so an enlarged
export carries the detail instead of a blur.

### B. The detail itself: one function of a place

`finish/fine-detail.js`: the heights at any window of the planet at any resolution — the finished picture enlarged
(Catmull–Rom) plus detail **only below the mesh's own scale** (from ~1.7 cells down to the window's pixels, octave by
octave as the pixels allow: a coarser view and a finer one agree), every feature drawn from a cause the finish recorded:

| | where | what |
|---|---|---|
| gullies (B) | steep ground: by the slope of the finished surface, more where wet and on young belts | branching valleys running downhill — stripes aligned with the slope, each octave turned by the slope the coarser ones left (Rune Skovbo Johansen's erosion filter idea), V-shaped |
| glacial sculpture (D3) | where the ice age's glaciers were (finish-ice.js) | the same valleys U-shaped, the ridges between them sharp (arêtes), more relief |
| fold and fault grain (D4) | fold belts (the belts' strike from the records), rifts | whaleback folds a few km apart along the strike; tilted fault blocks in rifts, a steep scarp and a gentle back |
| dunes (D6) | the sand seas (finish-wind.js) | ridges across the year's wind, or along it where the seasons' winds cross |
| lake districts (D7) | ground the ice sheets scoured, low and calm | many small hollows drawn out along the ice's flow; the deeper ones lakes |
| valley floors and rivers (D2) | along every river drawn | a flat floor as wide as the river's flow where the valley is gentle, the river meandering on it — the lines drawn there |
| coasts (D1) | within a few cells of the coast | fjords (cold, high coasts: the glacial troughs run below the sea, skerries off them); rias (warm, hilly: the valleys drowned); headlands and coves by the coast's relief; barrier islands and lagoons on low passive coasts; delta lobes and distributaries at the big rivers' mouths; active margins clean |

Plains and plateau tops get none of the gullies (they are flat); a plateau's edge is steep and is cut. The sea is only
where the detailed ground is below sea level near the finished picture's sea (no new inland seas).

### Drivers (the finish's, saved with the moment)

A ≤ 2048 × 1024 picture of bytes (half the finished picture's width at most; regional fields): the ice age's glaciers;
how cold the coast is (the fjords' measure); how active the margin is; the fold belts' strength, strike and style; the sand
seas, the wind's direction and how much the seasons' winds differ; the ice sheets' scour and their flow direction; how
young the belt is. ~13 MB at 2048. A planet file saved before has none: its patches get gullies and generic coasts only.

### C. At the mesh's scale (the finish only; the timeline's terrain untouched)

- Soil creep no longer fills valley floors: where a river drains, creep only lowers (the river carries the soil away);
  the crests still round.
- The rising fronts held back less (`FINISH.activeHold`, below the timeline's 0.3), toward the Himalayan front's figure.
- The big valleys a little wider: their sides carried into the cells beside them (`FINISH.valleySides`), toward Earth's
  ring profile.
- Plateaus checked: the high flat land left after the finish no less than before.

## 3. Checks

- Earth comparison (scratch tools, Terrain Tiles): the patch's heights over our mountains against the real Alps' and
  Himalaya's at the same pixel size — relief within 5 / 10 km, the spread of slopes.
- `check-save.mjs` (the moment gains arrays), the finish's numbers before/after (erosion-stages.mjs), plateau area.
- The page in Chrome: zoom into a range, a fjord coast, a delta, a sand sea, a shield; Satellite and a climate layer;
  an enlarged export.

## 4. Built (2026-10-26, not committed: for the owner's look)

- **Drivers**: `finish/finish-drivers.js` (2048 × 1024 bytes at 2.5M and 10M, 1024 below; ~1 s), kept as
  `raster.drivers` and saved with the moment (`check-save.mjs` now saves and reads them back bit for bit). The rivers keep
  each point's floor (`rivers.level`: the carve's bed — `carve.js` now returns it).
- **Detail**: `finish/fine-detail.js` — a window's heights, sea, lakes and rivers' courses; ~1.4–2.5 µs a pixel, a
  2048 × 900 patch in under a second on four workers. `cropSource` sends each worker only its window's slice (a crop's
  result is bit-identical to the whole picture's).
- **Page**: `evolution/detail-view.js` + `detail-worker.js`; `app/globe-view.js` `setPatch` (globe and map, blended over
  the box's outer 4 %); the hover readout reads the patch's heights. On phones a 1024 px patch on two workers.
- **Exports** wider than the picture are drawn with it (band by band, ≤ 1.5 M pixels a band); the README.txt says so.
- **At the mesh's scale** (seed 799224, 240 Myr; wet side = rain ≥ 1500 mm): the hold lowered only on wet, steep fronts
  (`frontSlope` [0.004, 0.018]): depth below the ridges within 15 km on the wet side 0.35 → 0.38 km at 2.5M, 0.60 → 0.66
  at 10M (Nepal 0.81); high flat land 2.69 → 2.68 M km² at 2.5M, 1.14 → 1.14 at 10M. Without the steepness gate the wet
  side reached 0.73 at 10M but plateaus lost 12 % at 2.5M — the gate kept (the owner: "respecting plateaus").
- **Measured on a patch** (relief within ±5 / ±10 km, ground ≥ 1 km, ~0.9 km a pixel): the young range at 2.5M
  0.76 / 1.30 enlarged → 1.58 / 2.20 with the detail; the real Alps' DEM at the same pixel 1.34 / 1.86 (their 2.5M cell
  means enlarged: 0.30 / 0.63).
- **Lessons**: the gullies first read as uniform "fur" — the coarsest octaves competed with the rivers' own valleys and
  every octave combed the same slope. What fixed it: the coarsest octaves subdued, the finer ones gated to the coarser
  ones' sides (none on their crests and floors), the picture's slope weighted 3× in their direction (side gullies slant
  downstream), a drainage pass at the window's pixels, and the rivers' valleys cut to the carve's beds. Fjords need the
  distance to the sea along the whole network (a reach runs only from one confluence to the next). Features thinner than
  a pixel (barrier islands) are drawn at least two pixels wide on a patch. A backgrounded browser tab throttles the
  page's animation frames, so its view never "settles" and no patch is asked for — a test-harness artifact, not the page's.
- **Not done**: the sea floor's fabric, reefs and atolls (D5). Cirques only as the U-shaped valleys' heads.

## 5. Revised after the owner's look (2026-10-26)

The owner on §4: "honestly this looks horrible. Everything looks messy and samey. The rivers look horrible too just like
cut through and bad. Its way too much. Also, the zooming doesnt work when trying to move to other areas of the globe it
should be smoother." What was wrong, and what changed:

- **Samey fur**: one octave of stripes (~12 km at 2.5M) at full strength on every steep pixel, the same everywhere, a
  V-floor drawing a hairline at every valley, the D8 channels cutting more lines. Now: about half as strong
  (`gullyGamma` 0.035 → 0.016), coming and going from place to place (`gullyPatchKm`, `gullyCalm`), much weaker on dry
  ground (`gullyDry`), only on steep ground (`gullySlope` 0.012 … 0.05 — the plains beside a range were striped), bent
  by noise (`gullyWarp`: no slope combed), the floor rounded (no hairlines), drawn only once a feature spans 6 pixels
  (`minPx` 3.5 → 6: no scratches); no channels.
- **Rivers cut through**: the valley floors stamped to the carve's beds, the meandering channel, the bluffs and the deltas
  read as trenches and lines drawn into the ground. All gone: the rivers are the moment's own lines, drawn crisp over the
  detail; the heights carry no river. (`rivers.level`, the carve's `bed`, removed with them.)
- **Too much**: folds and rift blocks (stripes on every belt and plain), lake districts, fjords and rias, skerries,
  barrier islands and deltas are off — to come back one at a time, each only if it looks right on its own. Left: the
  ridges and valleys, dunes (only on real sand seas: erg ≥ 0.3), and the coast's headlands and coves.
- **The base**: a clamped Catmull–Rom creased where the clamp switched (ticks in the hillshade, the sea's too); a monotone
  cubic drew the picture's grid; the Catmull–Rom alone showed the mesh's one-cell pits as square blobs. Now a B-spline
  inland, the Catmull–Rom at the coast (which keeps the coastline where the picture has it); the detail steered by the
  B-spline's slope (the Catmull–Rom's turns at every pixel, and stripes steered by it creased there); the drivers read
  eased across their pixels.
- **Zooming and panning**: the one patch waited for the view to settle and was drawn whole (seconds), so moving to
  another area showed the blurry picture until then. Now tiles (`DetailTiles`, §2 A): asked for as the view moves, every
  100 ms, nearest its middle first, the ones no longer wanted dropped before they start; kept (desktop 200, phone 64);
  a coarser or finer level's tile stands in for one not drawn yet; a tile meets its neighbours exactly (checked: a
  512² window and its four 256² quarters agree to the bit); ~40 ms a tile at 1.2 km a pixel.

Measured (relief within ±5 / ±10 km, ground ≥ 1 km, 0.89 km a pixel, 2.5M): the young range 0.76 / 1.30 enlarged →
0.64 / 1.10 with the revised detail (the B-spline base a little smoother than the Catmull–Rom; §4's detail made it 1.58 /
2.20).

**Then (2026-10-27): "when zoomed in it looks super sluggish when moving".** Measured on the page: every 100 ms of a
moving view, finding the tiles in view cast 81 rays against the globe's 16K triangles (38 ms), and each new tile or
shifted range drew every tile, the rivers and the grid onto one canvas of up to ~10 Mpx and sent it all to the GPU again.
Now: the view's points from the ray meeting the sphere itself (0.02 ms for 81); the tiles laid on the GPU (`TileLayers`)
in two layers of slots — the view's level's over the level before's, which stands in for a zoom — a slot holding the
tiles whose column and row are its own modulo the layer's, so each tile is painted once per look and sent once (258² with
a pixel of its neighbours', so the GPU's blend across tile edges reads their own pixels; drawn from a window two pixels
wider), a pan sends only the tiles it brings, and a frame paints and sends at most ~6 ms of them (4 on a phone); the
waiting tiles put in order again as the view moves; a tile repainted only when what it shows changes (the layer, its
colours, the rivers, the grid), not whenever the planet is. The rivers on a tile are only those near it (a grid of the
segments, ~1.3 ms a tile), each dashed line begun where its dashes last began, so they fall where the whole line's do.
three.js r160's copyTextureToTexture sends to whichever texture the active unit holds when the target is already bound
on unit 0 (tiles landed on the planet's own texture): tiles are sent with WebGL directly.
