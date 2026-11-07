# Evolution

**A planet with a past:** [orogen.studio/evolution](https://orogen.studio/evolution)

Evolution simulates a planet's tectonic history: a supercontinent breaks up, oceans open and close, and continents
collide and gather again, over up to one and a half billion years. It automates the method Worldbuilding Pasta describes
for doing this by hand (a supercontinent run forward in GPlates), and its Geology and Food views follow Madeline James's
guides. Stop on any moment, add detail, and explore what its history left.

Evolution works best on a desktop computer for now. It runs on a phone with lighter settings: coarser plates, and Add
detail up to 640K cells. Its Food tab is in beta (tagged so at the end of its sub-bar, in its tab's tooltip, in the
tutorial and on the Studio card), and neither it nor Geology has been tried on a phone yet.

The view, the climate and the export panel are shared by every tool: see [shared.md](shared.md). How the engine works:
[v2/README.md](../v2/README.md) and [the design](../plans/V2_TECTONIC_HISTORY_DESIGN.md). Back to the
[README](../README.md).

## Start a world

**New world** starts a fresh history from a random seed. **World** (folded to a one-line summary once a history is
building) holds its settings, with **Build this world** and **Load planet…**:

| Setting | Range | Default | What it does |
|---------|-------|---------|--------------|
| Seed | 0 – 2,147,483,645, or any word or phrase | random | What the world is built from. A word is hashed to a number: the same word, the same world |
| Starting continent size | 20 – 40 % | 30 % | How much of the planet the first supercontinent covers, shelves included |
| History length | 300 – 1500 Myr | 1200 Myr | How long the history runs. A supercontinent breaks up and gathers again roughly every 600–700 million years |
| End as | Wherever the history has got to · A supercontinent · A supercontinent breaking up · Continents dispersed | Wherever the history has got to | The history runs on past its length until the planet is in that stage (at most 1000 Myr further) |
| Temperature | −30 – +30 W/m² | 0 | Warms or cools the whole planet, through the climate's physics |
| Precipitation | ±50 % | 0 | Speeds up or slows down the water cycle |
| Quality | Fast · Balanced · Best · Custom | Balanced | How finely the history is simulated and drawn while you watch. Fast: 20K plate cells, terrain 160K. Balanced: 40K, 160K. Best: 80K, 640K. Custom: Plates (20K–160K cells) and Terrain detail (160K–2.5M) |

Temperature and Precipitation change the climate only: previews are worked out again when shown, and a detailed moment
says it was made with the old ones.

## Watch and scrub

- The history builds while you watch: the planet changes as it is simulated. Until its first moment is drawn (a second
  or two), a loading screen says what is happening ("Starting a world", the seed, laying out the plates, building the
  start world); then it steps aside, and the rest builds in view.
- Every moment on the timeline is a **Preview**, a quick look at the planet at that time. Drag the timeline or press
  play; the shaded part of the rail is the history computed so far, and you can scrub through all of it while the rest
  fills in. Playback speed is on the timeline.
- Drag the globe to turn it, scroll to zoom, and hover the planet for its height, crust (its age and setting) and
  climate.
- At the end of a history, **Extend history** runs it on for as long as you like.
- The link in your address bar rebuilds the same history, so you can share it.

## Add detail

Found a moment you like? Press **Add detail**. It sculpts that moment again, much more finely: rivers and lakes
(permanent, flooding each year or dry for months, fed by the moment's own rain), glaciers and fjords, sand seas, its own
climate, and the Satellite, Geology and Food views. Its **Detail** is 160K, 640K, 2.5M (the default) or 10M cells
(about three minutes); phones go up to 640K. It takes from a few seconds to a few minutes. Meanwhile a loading screen over
the planet names each step as it comes (shaping the surface, working out the climate, carving the rivers, carving with
the last ice age, mapping the rocks, finding the ore deposits, painting the picture…) with how far along it is; Cancel
stays on the timeline.

One moment is kept in detail at a time. Adding detail to another replaces it once the new one is done, and the card
tells you when it will.

Zoomed in, a detailed moment shows detail finer than its mesh, drawn in tiles at the screen's resolution as you pan and
zoom (and in exports wider than the moment's picture): faint ridges and valleys on its mountains, cut by their rock,
benches stepped through layered rock, ice-scoured knobs and karst hollows, dunes in its sand seas, coves along its
coasts. The rivers' options (Rivers & lakes, By regime, density) are in the view strip.

## Look around

Switch views with the tabs over the planet: **Terrain**, **Satellite** (on detailed moments), **Climate**, **Geology**,
**Food**, **Heightmap** and **Plates**.

- **Climate** shows Köppen zones, temperature, rain, wind and currents, with more layers (pressure with the ITCZ,
  upwelling, ice, temperature range, rain shadow, aridity, growing season, rain seasonality) under **More…**, for the
  year, January or July. It also works on a paused preview (its legend says "Preview climate").
- **Satellite** colours the land from its climate and terrain, and clouds from the planet's own climate drift over the
  globe, with storm spirals; turn them off with **Clouds** beside Hillshade.
- The arrow at the tabs' left opens the view options: Globe or Map, the map in any of ten projections, its centre,
  auto-rotate, **Stars** (the globe in space), a grid, the terrain's colours (sixteen palettes) and **Hillshade**, which turns the relief's shading off
  for flat colour.

## Geology

On a detailed moment, Geology shows what the history left in the rock.

- **Rocks**: sediment and sedimentary rock, volcanic arcs, flood basalts, granite, slate and gneiss, ancient shields with
  their greenstone belts, ophiolites, close to Earth's mix. They follow the terrain's own structure (an old range's hard
  rock on its ridges and soft rock in its valleys, a platform's folds, a shield's greenstone belts along its grain), with
  contacts that stay organic when zoomed in, and they shape the land: hard rock left standing, soft rock worn into vales,
  the bare deserts showing their bedrock from space. Hover a rock for how it came to be there: its mountain belt, the
  shallow seas that laid it, its cover and how deep it is worn.
- **Deposits**: all the metals at once, coloured by family (iron and alloy metals, base metals, precious, salt: four
  hues, each family's metals named in the legend and the readout), or by metal (iron, copper, gold, silver, tin, lead
  and zinc, aluminium, nickel, platinum, diamonds, salt, each in its family's colour;
  coal, oil and gas, peat, wood) or by the kind of deposit: about 35 kinds of ore, fuel and mineral where the history and
  the finished climate and rivers put them. Copper and gold over volcanic arcs, gold in old belts and along shear zones,
  iron in most mountain belts, tin far inboard and scarce, lead-zinc in basins over the basement's highs, nickel and
  platinum under flood basalts, diamonds on ancient cratons, banded iron in their greenstone belts; oil and gas in thick
  basins, gathered on fold crests and arches; coal in forelands, rifts and coastal plains; laterite and bauxite capping
  old uplands, peat and bog iron on wet floors, salt in dry pans; placers down the rivers; building stone rich in hill
  country. They sit in districts shaped as real ones are, each poor, moderate or rich.
- **Ages**: what a people of the Stone, Copper, Bronze, Iron and Industrial Ages could reach (the surface and rich ore
  first; deeper and poorer ore as technology grows), plus fuel, gems (diamonds, rubies and sapphires, emeralds,
  aquamarine and tourmaline, opal, turquoise, lapis, amethyst, jade, garnet) and building stone. Copper grows age by age,
  tin is scarce (the readout says how far to the nearest), and the map shows where bronze and iron could be made.
- **Districts**: hover a deposit for its district's story, read off the history (*"quartz veins deep in a collision belt
  last active 320 Myr ago"*), and its rank on the world. The readout gives each landmass's share of every resource.

## Food (beta)

On a detailed moment, Food shows what the land could feed. Like every layer this close to people, it describes what the
land allows, not what its people must do.

- **Farmland**: soil × ground × growing season, by rain alone or with water brought by flood farming and canals, plus
  terraces and raised fields (switch each technique on and off in the legend; a soft ramp or graded classes), counted in
  harvests a year (good: one sure harvest; excellent: two or three, as on the Nile or the Yangtze).
- **Staple food**: what each place could live on most, as archetypes (paddy grains, cool-season grains, warm-season
  grains, roots and tubers, livestock, fish or wild foods), striped where a second does nearly as well.
- **Lifestyle**: whether its people could farm, herd or gather (hunting, fishing and gathering from the sea's shelf off
  cold, upwelling coasts, big rivers and lakes, and the land's plants and game). Gatherers keep to their way unless
  farming or herding would feed ten times as many, so rich coasts can stay theirs, as the Pacific Northwest's did.
- **People**: how many the land could feed before industry, each place by its way of life: poor ground farmed in long
  fallows, so a rainforest feeds a few a km², and gatherers a tenth to a few a km².
- **Soil** and **Growing season** show what lies behind it.

## Export

**Export** saves the detailed moment as map files: a colour map, the Satellite view (the year, January or July, with or
without its clouds), the clouds alone, its climate zones, heightmaps with and without the sea floor, a land mask, and its
rivers and lakes on their own. Every climate and food view can go too, each as colour or as data (16-bit greyscales on
fixed scales). From Geology: its rocks, its deposits and each age's map, a richness mask for every resource, the
districts as GeoJSON or CSV, and a resource atlas in words. Several maps save as one ZIP with a README, at any width up to
16,384 px, in any of ten map projections, centred as you like, with or without the hillshade. The panel itself is
described in [shared.md](shared.md#export).

## Keep a planet

In Export, **Save planet** puts the whole history and its detailed moment in one `.orogen` file. **Load planet…** (in
World) opens it again later, or drop the file anywhere on the page, with no waiting for either; a loading screen shows
it opening (the history, the detailed moment, the terrain) until its moment is drawn. The file holds the
history itself, so it opens exactly as it was saved, in any browser. **Extend history** on an opened planet first runs the
history again from its seed (as long as it took to build), then goes on from where the file ends, if it comes out the
same in this browser.
