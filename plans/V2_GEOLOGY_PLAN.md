# Evolution: rocks and ore deposits — plan

Developer (2026-10-19): "building out rock types and determining ore deposit locations … I want this to be built on
evolution, and it can tie in to climate … I mostly want to follow [Madeline James's] guide and take her approach to how we
are breaking out/thinking about ores in different ages."

The guide is Madeline James's worldbuilding series, Part 11 "Rocks and Minerology" and Part 12 "Deposits and Gemology"
(madelinejameswrites.com/blog/minerology, /blog/deposits-and-gemology-extended). It is a method for drawing by hand: first
a map of orogenies and past shallow seas, then a rock-type map, then **one map per technological age** (Stone, Copper,
Bronze, Iron, Industrial) of what a people of that age could actually reach, plus fuel, building stone and gems, every
region graded poor / moderate / rich. She notes that "if you are one of those weird gplates-people, you already have a
tectonic history and can extract all of this information and more from that." Evolution *is* that history — so we keep her
structure, step for step, and fill each of her maps from what actually happened to each piece of crust.

The research behind every number below, with sources: `plans/V2_GEOLOGY_RESEARCH.md`.

## Her steps, and what Evolution makes of each

| Her step (by hand) | In Evolution |
|---|---|
| Orogenies map: active, inactive (worn), past (worn flat, invisible in the heights) | The belt records every crust cell already carries (`oroType/oroStart/oroLast`, the overprinted `prev*`, `SUTURE`, `thickKm`), plus how deep each has been worn (new) and the start world's own "past" belts (new) |
| Past shallow seas at a Cretaceous highstand, and the shelves | **New**: a sea level through the history (from the age of the ocean floor) and a record of how long each piece of continent lay under shallow sea — and at what latitude |
| Rock-type map: cratons, igneous, metamorphic, sedimentary, sediments | A **rock column** per cell (sediment cover over volcanics over basement); the layer shown is the one erosion has cut down to |
| Ore deposit types (porphyry, VMS, SEDEX, MVT, skarn, IOCG, greenstone, tin belts, placers, laterites…) | Deposit **systems** fed by the history (porphyry along arcs, VMS in arcs that docked, MVT in forelands…), each with a depth window: hidden until erosion reaches it, gone once erosion passes it |
| Maps by technological age | Her commodity lists per age, with technology as **how deep** a people can dig and **how poor** an ore they can use |
| Fuel (wood, peat, coal) | Wood from the finished planet's biomes; peat from its climate and drainage; coal from the history's coal basins, where erosion has bared them |
| Poor / moderate / rich (grade × size) | A continuum — deposits per km² × a lognormal size — banded into her three grades |
| Gems | A later, optional phase |

## Where the science disagrees with the guide

Everything else follows her lists. In four places the literature says otherwise. **Decided (developer, 2026-10-19):
take a stance for the look and the stories, and keep it undoable** — so each is a named switch in `geology-config.js`
(`guideRules`), and any one goes back to her rule in a line. The stance, science in all four, each for a visual or
worldbuilding reason:

1. **Coal belts.** Her blanket rule (the last supercontinent's 45°N–45°S, in sedimentary basins) fits Carboniferous coal
   only. Since then coal has formed in basins sitting in a *wet* belt — the ever-wet tropics and the humid mid-latitudes
   (median ~48°) — and hardly at all in the dry 15–35° belt (Bao et al. 2023). Evolution knows each basin's past latitude,
   so coal forms where and when it was wet: distinct coal basins with a story (*"laid down when this basin lay near the
   equator, 210 Myr ago"*) instead of one wide smear.
2. **Placers and glaciers.** She has placers richest near receding glaciation. Ice strips placers; the richest gold
   placers (the Klondike) are the ones the ice missed, and glacial margins are only moderate (outwash reworks them).
   So: gold-rush valleys in unglaciated mountain country richest, a moderate band along the old ice's edge, poor under it.
3. **Arc rocks.** Her "shallow subduction → andesite, steep → rhyolite" is not the main control: arcs get more felsic as
   the crust under them thickens (island arcs basalt–andesite, continental arcs andesite–dacite–rhyolite), and a flat slab
   shuts the arc off and moves magmatism inland. Island arcs dark, continental arcs pale with ignimbrite plateaus, and a
   gap in the volcanoes over a flat slab — more variety than a rule by dip, which Evolution only half knows anyway.
4. Small: her "extrusive granite" in orogenies becomes granite *exposed by erosion* (granite is intrusive); contact
   aureoles (metres to a few km) are below a pixel — a halo in the readout, not a class.

## What there is to build on

- **Crust records** (`v2/js/tectonics/model/crust.js`, riding with the crust on each plate's own raster): `type` (ocean,
  continent, craton, arc), `formedAt`, `terrane`, the latest belt (`oroType` ANDEAN / LARAMIDE / URAL / HIMALAYAN / ARC /
  RIFT / TRANSPRESSION, `oroStart`, `oroLast`, `beltSide`, `beltU`) and the one it overprinted (`prev*`), `thickKm`, flags
  (`TRENCH` — a former active margin, `SUTURE`, `FAILED_RIFT`, `RIFT_MARGIN`, `LIP`, `APRON`, `MARGIN_ISLE`, `EROSIVE`),
  the plume record (`volcType` TRACK / LIP, `volcAt`, `volcKm`, `volcSource`), and the heights as evolving state (`rootKm`,
  `upliftKm` — negative in a foreland basin — `baseKm`, `volcWornKm`, `riverIncKm`; `step/heights.js`).
- **Plumes and LIPs exist** (`step/hotspots.js`): a plume every ~20 Myr, flood basalts 0.15–4 million km² — the
  literature's own figures. Cratons, with a faint dome-and-keel grain already in the terrain (`cratonGrainKm`) and a
  per-craton character (`terrain/cratons.js`).
- **Events** (`model/world.js`): rifts, sutures, subduction starts, flat and steep slabs, back-arcs, plumes, LIPs,
  supercontinent stages — with plate ids, not places.
- **The finished moment** (`v2/js/finish/`): monthly climate per cell, Köppen, biome cover (`finish-cover.js`), rivers
  (discharge, receivers), lakes (fresh, salt, pan), the sediment stage's deposits, the last ice age (`finish-ice.js` —
  Ohmura's equilibrium line, the same test the research recommends), sand seas and loess.
- **UI** (`evolution-main.js`): the layer tabs; the Plates branch of `paint()` as the template for a layer drawn from sim
  cells; the Köppen legend with % of area; the hover readout (`settingOf`, `looks.js`); `export.js`'s `EXPORT_TYPES`.

**Missing**: no past sea level or record of flooding; no record of how deep erosion has cut; no sediment fill; the arc
history is one belt deep (a second overprint loses it); the crust's 8 flag bits are all taken; events carry no places.

## How it works

### 1. The history keeps a geological record (new; records only)

New per-cell fields on the crust raster (`CELL_FIELDS`, carried in frames, quantised to a byte or two — frames are
sparse-packed and these are zero over the ocean). Records only: **the tectonics stay byte-identical** (checked by hashing
every existing frame field before and after), no existing random stream is touched, and links still build the same world.

- **The rock column.** `coverKm`, the sediment laid on top, with its make-up (`coverCarb`, `coverCoal`, `coverSalt`,
  `coverOrganic` — source rock — as fractions, the rest sand and mud), its deepest burial and when it was reached (oil and
  gas mature with it); the volcanic pile the plume record already has (`volcKm − volcWornKm`); and `exhumKm`, how
  much basement has been worn away beneath them — in total, and since the latest belt was last active. Every step's wear
  in `step/heights.js` (relief, root, swells, river cuts) strips the cover first, then the volcanics, then the basement;
  a foreland basin filling back toward zero, a sinking rift, or a flooded shelf adds cover.
- **Past shallow seas.** Each step a sea level from the mean age of the ocean floor (young ocean floor rides high: a
  dispersing world floods its continents, a supercontinent drains them), scaled into a configurable range (~0–250 m
  above the present). Continental crust whose history height (the cheap one `step/rivers.js` already computes) lies below
  it is under shallow sea that step: time flooded is recorded, and what it laid down depends on its latitude then —
  carbonate in warm water (< ~30°) away from rivers, mud and sand near them, salt in the arid belt where the sea was
  restricted.
- **A zonal palaeoclimate.** The climate runs only on finished moments, so the history uses belts by latitude (ever-wet
  < ~10°, arid ~15–35°, humid ~36–60°, cold beyond) — enough for coal (a subsiding basin in a wet belt), salt (a
  restricted basin in the arid belt), carbonate (warm shallow sea), and old laterite.
- **Geological flags** (a new `geoFlags`, 16 bits): born in an island arc (kept after it matures into continent),
  back-arc floor, scraped-on fore-arc and accretionary wedge, ophiolite (ocean floor caught in a suture), sat in a
  foreland, sat in a rift basin, a volcanic rifted margin, an arc that was live when its slab flattened or steepened
  (porphyry fertility), plus `arcMyr` (how long the crust sat on a live magmatic arc).
- **The start world's past.** Each craton draws, from its own seeded stream, an age (Archean or Proterozoic), a style
  (Pilbara-like domes 30–70 km across ~120 km apart, or Superior-like belts), a greenstone share (15–35%), an
  endowment (some rich, some barren) and how deep its shield is worn; the start world's younger continental crust
  becomes Proterozoic mobile belts wrapping the cratons — the guide's "past orogenies".

### 2. Rocks — what each place is made of

The exposed layer of each cell's column, from smooth weightings (no hard cut-offs; noise anchored to the crust as the
terrain's is, so a craton's belts ride with it through the timeline):

- **Cover still there** → limestone, sandstone and shale (coal measures among them), or salt, by its make-up; on the
  finished moment, the young sediments too — river plains and deltas (the sediment stage), sand seas and loess (wind),
  till and outwash (the ice age).
- **Volcanics still there** → flood basalt (LIPs), hotspot basalt, and arc volcanics by the crust under them: basalt on
  thin crust, andesite, rhyolite and tuff on thick.
- **Basement** → by its make-up and how deep it is worn: arcs — volcanics under ~3 km, granite plutons to ~15 km, gneiss
  below; mountain belts — folded sediments under ~3 km, slate, schist (12–25 km), gneiss and migmatite beyond, with
  granite plutons in collision belts; ophiolite slivers along sutures; cratons — granite-gneiss domes between greenstone
  belts in the craton's own style.
- **The sea floor** → ridge basalt (young), deep-sea sediment, shelf sediment; oceanic plateaus basalt.

**Shown** as about a dozen classes in the geologic map's colour families (warm sands and tans for sediment, blue for
limestone, red for granite, violet for volcanics, greens for metamorphic, rose for the ancient shields), desaturated and
multiplied with the hillshade so the relief still reads. Legend with % of land; readout with the origin: *"Granite and
gneiss — roots of a mountain belt active 180–140 Myr ago, worn ~9 km down."*

**Calibrated against Earth** (GLiM, computed from the open grid): of ice-free land ~28% loose sediment, ~18% sandstone,
~16% shale and marl, ~8% limestone, ~15% metamorphic, ~7.5% plutonic, ~7.5% volcanic; ~40% of craton land crystalline,
the rest covered; the highest mountains mostly sedimentary and volcanic, not metamorphic.

### 3. Deposit systems — where the ores formed and whether they survive

Each deposit type is a **mineral system**: a source × a pathway and trap × the right timing × **exposure** (its depth
window against the erosion since it formed: buried → exposed → worn away), combined smoothly (logistic memberships, a
weighted geometric mean across the ingredients). Each gives a density (deposits per km²) and a lognormal size, so a
place's richness is a continuum — and resolution-independent.

| System | From the history | Depth | Notes |
|---|---|---|---|
| Porphyry Cu-Mo-Au, with epithermal Au-Ag above | live and past arc belts; longer-lived, thicker, contractional arcs richer; a slab change boosts | 1–4 km (epithermal < 1) | epithermal only on young arcs; porphyries expose ~10–40 Myr after; Au-rich on island arcs, Mo-rich on thick ones; post-collisional porphyries on old arc crust thickened by a later collision |
| Across an arc | distance inboard of the trench | — | iron and IOCG → Cu-Mo-Au → Pb-Zn-Ag → **tin-tungsten** ~500 km inboard (the Andes) |
| Skarn Cu / Fe / Zn-Pb / Au | arc or collision granite meeting carbonate cover | as the pluton | small, rich |
| VMS Cu-Zn (Au, Ag) | arc and back-arc floor, ophiolite — preserved where they docked onto land | 0 | crops out as long as its host does; gossans on top (early gold and silver) |
| Orogenic gold | accretionary and collisional belts, sutures; late in the belt | 2–15 km | bared tens of Myr after the collision |
| MVT Pb-Zn (Ag, fahlore) | carbonate cover in a foreland or platform beside a rising range, near salt | shallow | tens of Myr younger than its host |
| SEDEX Pb-Zn-Ag (Cu) | clastic cover in rift basins, failed rifts, young passive margins | 0 | the largest lead-zinc |
| Tin-tungsten granites, pegmatites (Li, Be, gems) | inboard of collisions where a former passive margin's sediments were melted; inboard arcs | 3–10 km | narrow belts; **far rarer than copper** |
| IOCG Fe-Cu-Au | reactivated craton margins | — | mostly inherited |
| Ni-Cu-PGE; Cr-PGE-V layered intrusions; Fe-Ti-V | LIP feeders where a LIP crosses a craton edge (richer over salt or coal); a layered intrusion bared as an old LIP wears | — | Noril'sk, Bushveld |
| Native copper | flood basalt that filled a rift; fahlore in carbonates around basaltic LIPs | 0 | Keweenaw; the Copper Age's first metal |
| Kimberlite and diamonds | old (Archean) cratons only; fields 30–50 km, 100–500 km apart, in pulses ~20–30 Myr after a nearby breakup | — | some cratons rich, some barren |
| Inherited (Archean–Proterozoic only) | greenstone gold, banded iron, one Witwatersrand-type gold basin per world | — | the guide's greenstone belts; Earth can't make these any more, so the start world brings them |
| **Oil and gas** (added, developer) | source: organic-rich cover — warm, restricted shallow seas at high sea level, rift lakes, coal for gas; matured by the deepest burial (oil ~60–150 °C, gas to ~200 °C; rifts hot, forelands and cratons cool); trapped in foreland fold belts (best, more so under salt), salt, rift blocks, deltas, carbonate platforms | 1–6 km | survives ~100 Myr under shale, ~300 under salt; uplift turns it to heavy oil and tar sands, bares oil shale, opens seeps and asphalt lakes |

### 4. The climate and the rivers (on the finished moment)

- **Laterite, bauxite, nickel laterite**: MAT > 22 °C, rain > 1200 mm, ≤ 6 dry months (Price et al.), on gentle,
  long-stable ground; the rock decides — basalt or aluminous rock → bauxite, ultramafic → nickel (cold-month 15–27 °C),
  greenstone → gold laterite, else iron laterite.
- **Supergene enrichment** of exposed copper and silver deposits in a warm semi-arid climate, away from ice and fast
  erosion → the native copper and silver of the Copper Age, and richer Bronze Age ores. The Atacama.
- **Salt**: today's salt lakes and pans (the hydrology already makes them) and the history's salt beds where erosion bares
  them; **alum** around volcanoes and in deserts.
- **Coal** where erosion has bared the history's coal basins (her "mined in old mountains"); **peat** where the warm
  season is wet, the ground flat and badly drained and cool, most of all on land the last ice age left; **bog iron** in the
  same wet lowlands below metal-bearing belts; **oolitic ironstone** in old warm shallow-sea cover.
- **Placers**: gold, tin, gems, platinum and diamonds carried down the finished planet's rivers from exposed sources —
  rich within ~10–25 km, richest at confluences and where the gradient breaks; diamonds down to the coast and along it;
  heavy-mineral sands at river mouths; poor under the old ice, moderate at its margin, richest in unglaciated hills.
- **Gossans**: the weathered iron caps of exposed sulfide deposits — surface gold and silver for the earliest ages.
- **Fuel**: wood from the biome cover (forests high, woodland and savanna moderate, steppe and tundra low, desert none),
  peat, coal.

### 5. Resources by age (her maps)

Technology is **reach** and **cut-off grade**: the Stone and Copper Ages take only what lies at the surface (placers,
native metals, gossans, enriched caps, stone); the Bronze Age digs pits and shafts to ~100 m and wants rich ore (copper
~10–15%); the Iron Age reaches deeper and smelts the common iron ores; the Industrial Age mines ~1 km down and bulk
low-grade ore (porphyry copper at 0.3%). Each age's map is her list:

- **Stone**: flint (chalk and limestone, river gravels), obsidian (young rhyolite), quartzite, jade (subduction belts),
  agate, basalt; bitumen from seeps (hafting glue).
- **Copper**: native copper, arsenical copper, placer and laterite gold, gossan gold and silver, native silver; bitumen
  (caulking, mortar — traded far).
- **Bronze**: copper (VMS first, then SEDEX, skarn, a few porphyries and IOCGs), tin (belts and their placers), arsenic,
  lead and silver (MVT, SEDEX, veins), gold, alum — and **bronze potential** = copper × (tin or arsenic) × fuel.
- **Iron**: bog iron, skarn iron, laterite iron, oolitic ironstone, meteoritic iron, zinc (brass) — and **iron potential**
  = ore × charcoal or coal; naphtha and lamp oil from hand-dug pits, gas wells (Sichuan's for boiling brine), asphalt.
- **Industrial**: porphyry copper, greenstone and Carlin gold, IOCG and banded iron, coal, bauxite, nickel, platinum and
  chromium, diamonds; **oil and gas fields** onshore and on the shelf, oil shale, tar sands.

Bands: poor (a faint wash), moderate, rich — never everywhere: tin stays scarce, the Industrial map does not light up the
planet, and a people's distance to the scarce metal is part of the readout (*"nearest tin: 2,300 km north-east, a rich
placer"*).

### 6. On screen

A **Geology** tab beside Climate, with sub-tabs **Rocks · Resources · Fuel** (Gems later); Resources has an age switch
(Stone · Copper · Bronze · Iron · Industrial) the way Climate has Year · January · July, and a **Potential** view per age.
- **Finished moments only**, all of it (developer, 2026-10-19), as Satellite is: the history keeps its records on every
  frame, and the finish turns them into rocks and resources.
- **Districts** (developer, 2026-10-19: "A for sure, but we should be cognisant of overlap"): soft-edged belts and
  patches per commodity over muted terrain; grade by intensity (faint, solid, a glowing core), never by hue; no more than
  ~8 hues per age.
  - **One metal at a time**: the legend's entries are the switch — *All* (the default), or tap a metal to show only it,
    every grade of it, the rest muted. On a phone the same chips, a thumb wide.
  - **All, with overlaps honest**: where districts overlap, the higher grade wins, and a tie goes to the scarcer metal
    (tin over copper), so a rare metal is never buried under a common one; where a second metal is moderate or better
    it shows as fine stripes of its colour across the first; the readout lists everything there.
  - The **Potential** view and atlas symbols come later as extras: Potential as a switch beside the age (G5), symbols
    for discrete deposits when zoomed in and in exports (G6).
- **Readout**: *"Granite and gneiss — roots of a 180 Myr-old belt. Copper ●●● (VMS) · Tin ●●○ (river placer) · Fuel ●●○
  (oak forest). Bronze potential: rich."*
- **Phones**: the tab in the mobile dropdown, the legend folded, tap for the readout.
- **Export** (finished moments, in Export All): rock map, each age's map, a greyscale mask per commodity, transparent
  overlays, and the deposits as GeoJSON / CSV with their origin stories.

## Where it runs

- **History worker**: the records, every step — a few % of the history's time (measured before and after), frames a
  little larger (measured on desktop and phone).
- **Finish**: a new **geology** stage after the water and final climate — rock class per pixel (a byte, as Köppen is) and
  commodity richness on a coarser grid (soft washes need no more: ~0.25°, ~20 MB on a desktop, 0.5° and ~5 MB on a
  phone). Target: under ~3 s at 10M cells.
- Tunables in `v2/js/geology/geology-config.js`, in physical units, each with its literature range (as the climate's
  `PARAMS` / `PARAM_PRIORS`), and the `guideRules` switches. No new sliders.

## Phases (each checked in the browser before the next)

- **G1 — the history's geological record.** The rock column and its wear, past sea level and flooding, basin fill and its
  make-up, the zonal palaeoclimate, the geological flags, the start world's past. Shown on the finished moment as **her
  first two maps**: an *Orogenies* view (active / worn / past, by age) and a *Past shallow seas* view, plus debug views
  of fill and wear.
  *Check*: tectonics byte-identical (hashes); history time and frame memory within budget; old belts deeply worn and
  young ones barely; epeiric seas during dispersal, drained under a supercontinent; carbonate seas in the tropics.
- **G2 — Rocks.** The classes, palette, legend, readout with origin; timeline and finished; phones.
  *Check*: it reads as a geologic map at a glance; land shares near Earth's (headless, 8 seeds); cratons not
  honeycombed; the same at 640K and 10M.
- **G3 — Deposit systems.** Every system's field and its exposure window, the cross-arc zoning; a debug select per system.
  *Check*: belts follow arcs and sutures; epithermal only on young arcs; tin belts narrow, inboard and rare; deposits
  clustered in districts, not scattered; kimberlites on some cratons only.
- **G4 — Climate and rivers.** Laterite and bauxite, supergene, salt, coal, peat, bog iron, ironstone, placers, gossans,
  fuel. *Check*: bauxite on wet tropical plateaus; placers trace rivers from their sources; enriched copper in dry arcs;
  **an Earth check** — the same climate tests run on observed Earth climate (tuning/climate's reference data) beside
  where bauxite, peat and salt really are.
- **G5 — Resources by age.** Her five maps, the potentials, the grades, the readouts. *Check*: tin scarce; bronze
  potential patchy; the Industrial map not everywhere; each age reads as her maps do.
- **G6 — Districts, stories, export, polish.** District points with their origin stories, region summaries, the exports,
  phones; README, tutorial, SEO and llms.txt; ask about What's New.
- **G7 (optional) — Gems**, by her rules (kimberlite, pegmatite, metamorphic, sedimentary and placer gems).

## Checks

- `v2/tools/check-geology.mjs` (headless, a few seeds): rock shares against Earth's bands; rocks against settings
  (forelands mostly sediment, shields ~40% crystalline); ores — tin ≪ copper, epithermal only near young arcs,
  kimberlites only on cratons, rich bronze land a small share, densities within the USGS ranges.
- Byte-identity of the tectonics after G1; history time and frame memory before and after.
- Scale invariance: one moment finished at 640K and 10M — class shares within ~2%, the same districts.
- Only the affected checks per phase; nothing heavy in the background while the developer is testing.

## G1 built (2026-10-19)

- **History** (`tectonics/step/geology.js`, `model/geology.js`, hooks in heights.js, orogeny.js, rift.js,
  remnant-seas.js; constants `config.geology`): the rock column, the sea's stand from GDH1 ocean depth, shallow seas
  (shelves on low coasts, then the lowest land joined to the sea), forelands in front of active belts, young rift
  basins, the zonal palaeoclimate, `GeoFlag`, the start world's seeded past. Records only: four histories (20K–40K,
  400–600 Myr) hash identical to before; `check-geology.mjs` runs records on and off.
- **Cost**: history ~0–3 % slower (within run-to-run noise); frames +13 % packed (963 → 1086 KB at 40K); the page's
  history budget `FRAME_BYTES_PER_CELL` 28 → 31.
- **Page**: a **Geology** tab (finished moments only; locked with "comes with detail" on previews) with four views —
  *Mountain belts* (active / worn / long gone / before the history / shields: her orogenies map), *Past seas* (lately /
  earlier / long ago, deeper the longer), *Sediment* (the cover's dominant make-up, paler where thin; bare basement
  slate), *Erosion depth* (the grade bands G2 will turn into rocks) — legends with land shares, hover lines (sea, cover,
  wear, past settings). `evolution/geology-view.js`.
- **Seen on seed 12345 (400 Myr)**: the flooded share swings 4 % (the start supercontinent) → 31 % (dispersed); limestone
  ~11–21 % of land, all in warm seas; shields worn ~18 km; ~44 % of land bare basement — more than Earth's ~25 %
  (crystalline rock): G2 calibrates the exposed rock against GLiM (the finish's young sediments add to the cover).

## G2 built (2026-10-19)

- **The rocks** (`geology/rocks.js`, `geology/geology-config.js`; the finish's new `geology` stage, finish.js): per cell
  of the finished surface, the frame's record sampled through the terrain's own warp (belts and basins where the terrain
  put them), each kind scored and the strongest wins — 13 kinds: young sediment, sandstone, shale & mudstone,
  limestone, salt & gypsum, basalt, andesite & rhyolite, granite, slate & schist, gneiss, shield granite-gneiss,
  greenstone, ophiolite & mélange. The cover shows where enough is left after the region's cuts (rivers over ~50 km,
  a share of a great canyon's own), glacial scour and high ground; young sediment over both: river plains (the land
  where the rivers laid the most over ~25 km — `plainsShare` 13 % of it, so the same at every detail: how much the
  finish's rivers lay differs ~2× between 640K and 2.5M), dunes, loess, the ice age's moraines and outwash (finish-ice.js
  now returns `till`); flood basalt where its cap is left. Shields: each craton its greenstone share and style (Pilbara
  domes or Superior belts); granite as plutons (noise blobs); ophiolite slivers along sutures. A two-pass majority
  filter removes specks.
- **Seen** (seed 12345, 400 Myr): loose 25–29 %, sedimentary 42–46 %, metamorphic 11–13 %, plutonic 7–8 %, volcanic
  9–11 % — Earth 28 / 42 / 15 / 7.5 / 7.5; 160K, 640K and 2.5M agree within ~1 point a family (dunes vary a little with
  the finish's own wind stage). The stage takes ~0.3 s at 640K, ~0.7 s at 2.5M (~4 % of a finish).
- **Page**: Geology → **Rocks** (the default view): the finished picture's rocks per pixel, shelves lighter than the deep
  sea, ice caps a pale veil; legend with each kind's share and the families beside Earth's; the readout's *Rock* line
  says how it came to be there (*"Sandstone · laid in front of a rising range, 10.2 km of cover — folded in an Andean
  range"*). `check-geology.mjs`: 20 checks.
- **guideRules** in place: `arcRockByCrust` (arcs felsic with thickness), `graniteIntrusive` (granite only where bared);
  the G4 ones (`coalByWetBelts`, `iceStripsPlacers`) wait for their phase.

## G2 reworked (2026-10-20): rocks that follow the finished terrain

Developer, on the first G2: *"it looks super blobby. It doesnt seem to get detailed at all or inheret any of the noise of
the detailing rounds. Its clear there are remnants of prior."* Two causes: the rocks read the record through the
terrain's large world-frame warp only — not where the terrain itself read it (on each plate's raster, its cell warp,
the finish's own warp, its interfingering) — so belts and seas sat off the terrain's, in the sim's own lobes; and the
cover was decided over ~50 km regions with noise patches, so nothing of the finished relief showed.

- **Read where the terrain read it**: the surface hands over each cell's record cell (synthesize.js `recCell`, the land
  corner with the largest noisy share, as the platform interfingers; terrain-pool `recCells: true`). The record is read
  smoothly (≈0.6 sim cell, on a 0.5° grid) and through a fractal warp (30 km, 160 km waves down to the mesh): contacts
  wander and fold but stay whole — noise added to scores had broken them into confetti.
- **The cover as beds** (`bedKm` 0.35, counted up from the basement) cut by the finished surface: where the ground lies
  below the land around it (relief over `reliefKm`, the surface lightly smoothed) older beds crop out — outcrops follow
  the valleys (the rule of Vs); each bed's kind by roulette on the cover's make-up, its own pattern across country
  (`facieKm`). **Fold belts**: waves across the belt from the record's distance to the front (`foldKm` 70 and 2.6× that),
  anticlines baring beds `foldDepthKm` deeper — stripes along the belt; slate/gneiss contacts follow them.
- **River plains** are floodplains now: the low ground along rivers over `floodplainQ` m³/s (height above the nearest
  channel under `floodplainHandKm`), half-width `floodplainKm` growing with discharge, each cell by the share the plain
  covers (so the same at every detail); deltas and basin floors by the deposit's top `plainsShare` (6 %).
- **Pixels**: where a pixel's cells differ, the rock picked by a cell-sized noise — no mesh edges. The finish also keeps
  each pixel's record cell (`raster.geology.rec`): Mountain belts, Past seas, Sediment and Erosion depth are drawn from
  it — on the terrain's own belts and coasts — and by the pixel's rock (Sediment bare and Erosion depth undimmed where
  the basement crops out, Past seas fainter there). The readout reads that cell too.
- **Seen** (seed 12345, 400 Myr): 640K loose 28 / sedimentary 39 / metamorphic 15 / plutonic 9 / volcanic 10; 2.5M
  23 / 41 / 16 / 10 / 11; floodplains ~12 % (640K) and ~10 % (2.5M) of the land. The stage ~0.65 s at 640K (~6 % of a
  finish), ~1.6 s at 2.5M. `check-geology.mjs` checks rocks against their record cells now.

## G3 + G4 built (2026-10-20)

Developer: "lets commit, and then do g3 and g4".

- **The systems** (`geology/deposits.js`, `geology-config.js` `deposits`; the finish's new `deposits` stage after the
  rocks): 33 — 16 metal systems from the record (porphyry copper, epithermal gold-silver, orogenic gold, massive
  sulfide, skarn, MVT and SEDEX lead-zinc, tin-tungsten, IOCG, Ni-Cu-PGE, layered intrusion, native copper, kimberlite,
  greenstone gold, banded iron, one fossil gold reef); oil, gas, and bitumen/tar/oil shale; 11 from the climate and the
  rivers (bauxite, nickel and iron laterite, enriched copper, gossan, placer gold, tin and diamonds, salt, ironstone, bog
  iron); fuel (coal, peat, wood). Each: the record's part per sim cell (setting × exposure window: a live arc's porphyries
  bared as it rises, a dead one's since — `unroofKm`; epithermal only on live or lately live arcs; tin far inboard on
  thickened crust; orogenic gold in belts ≥ ~50 Myr old; oil by source × burial temperature × trap × seal, lifted out
  into seeps and tar), read smoothly where the terrain read it, × its host (the rocks' shares in the district — judged
  per cell the fine rock map speckled them), × its district noise (its own spacing and share of the permissive ground).
  Placers: carried down the rivers' receivers from bared sources, fading over 20–400 km, a gravel band either side,
  stripped by the ice (`iceStripsPlacers`). Climate tests per finished cell from its twelve months (`climateTests`:
  Price's bauxite, Thorne's nickel laterite, Bao's evaporite and coal/peat tests, a dry season for enriched copper).
  Flatness by the heights' spread over ~50 km (a slope between cells is steeper on a finer mesh).
- **Coal's switch**: `coalByWetBelts` is the history's (tectonics config `geology.coalByWetBelts`, from the guideRules;
  false: her rule, any basin within 45°) — records only, a new world.
- **Kept** per grid cell (the richest of its cells; 0.25° at 2.5M cells, 0.5° at 640K, 1° at 160K — never finer than the
  mesh, holes filled from neighbours), the land and the shelf; ~1–5 MB.
- **Page**: Geology → **Deposits**, with a picker: *All metals and minerals* (each place its richest, a grade tie to the
  scarcer; colours blended where systems meet) or any one system (fuels included); washes over the rocks muted — faint
  poor, solid moderate, full rich; legend with each system's land share; readout: the deposits under the pointer with
  ●○○ grades. Offshore only oil and gas.
- **Scarcer, and fading with age** (developer, 2026-10-20, on a history run to 1,840–2,000 Myr: "WAY too much deposits, i
  expect many in the old old mountains to have eroded away … orogenic gold covering like 6% of the world just feels crazy
  for how 'valuable' gold should be"). Two causes: districts took up to ~45 % of all permissive ground, and nothing removed
  a deposit but the record's erosion — which barely moves on old, worn-flat belts — so every arc and collision of a long
  history kept adding (gold 13 % of the land at 400 Myr, 23 % at 1,840; porphyry 7 → 20 %). Now: each deposit fades with
  the time since it formed (`halfLifeMyr`: epithermal 25, porphyry 160 — Earth's ~60 % of Phanerozoic porphyries gone —
  skarn 200, tin 300, MVT 300, orogenic gold 450, VMS 500, SEDEX 600, IOCG 800; ages from the arc's or the collision's
  last activity, the basin's deepest burial); orogenic gold only where belts collided (an arc margin is not a collision),
  the start world's belts nearly barren (`prehistoricGold` 0.1); districts small (gold 7 %, copper 18 % of the
  permissive ground), mostly poor with a rich core; and a metal's districts gathered in **provinces** (`province`: ~1,000
  km, 35 % of its ground) — a stretch of a belt endowed, the next barren. Seed 12345 at 400 / 1,000 / 1,840 Myr: orogenic
  gold ~2 % of the land (0.4–0.5 % moderate or rich), porphyry copper 1.7–2.6 % (0.5–0.8 %), tin 0.1–0.8 % (all poor),
  steady with age.
- **Seen** before that (seed 12345, 400 Myr): porphyry copper ~7 % of the land, tin ~0.4 %, kimberlite ~0.9 %, coal ~6 %, oil ~3 %
  (+ shelf), bauxite ~4 %, peat ~8 %; 640K and 2.5M within ~0.5 point a system (placers fade at coarse detail). Stage
  ~0.8 s at 640K, ~2 s at 2.5M (rocks + deposits ~12 % of a finish at 640K, ~15 % at 2.5M).
- **Earth check** (`tuning/geology/earth-deposits.mjs`, Beck et al. 1991–2020 at 1°): bauxite's test true at 8 of 9 real
  bauxite districts (Gove marginal), peat's at 8 of 8 peatlands, salt's at 8 of 9 salt flats (Uyuni: cold), enriched
  copper's at 5 of 6 — none of them in the wrong climates.
- `check-geology.mjs`: 33 checks (G3: tin scarce, epithermal near young arcs, copper and gold along arcs and belts,
  kimberlites on cratons, districts not specks, time; G4: bauxite hot and wet, placers below sources, enrichment under dry
  skies, the Earth check).

- **Iron and the metals** (developer, 2026-10-20: "it FEELS like iron is a bit under represented … Maybe we need a more simple
  map of just iron, gold, tin etc, like the output metals"): iron was there six times over — bog iron, ironstone, laterite,
  banded iron, skarn, IOCG — each looking small. Iron widened (bog iron in any wet northern lowland, the coal measures' clay
  ironstone, savanna laterite, banded iron on more cratons) and the Deposits view is now **by metal** (`METALS` in
  deposits.js: each metal its sources and their weights, its richness the richest source's plus a little for overlaps,
  computed per grid cell in the finish), the kinds of deposit a second group in the picker; the readout names each
  metal's sources there. Seed 12345 at 400 Myr: iron ~30 % of the land (~15 % moderate or rich), copper ~5 % (1.5),
  gold ~5 % (1.1), tin 0.2 % — the shares counted as the map paints them (each grid cell over its land). G5's ages read
  these metals, each age only what it can reach.

## G5 built (2026-10-20)

Developer: "when this is complete, go straight into the ages work".

- **The ages** (`geology/ages.js`): her Stone, Copper, Bronze, Iron and Industrial Ages, and Fuel — each its resources, each
  resource the kinds of deposit that age can reach, each with a weight and a **cut-off** (only the richness above it counts:
  the Copper Age takes native copper, enriched caps and gossans, river gold; the Bronze Age sea-floor sulfides first, rich
  skarns, a few porphyries' rich parts, tin and its placers, arsenic as tin's stand-in; the Iron Age bog iron, ironstone and
  laterite, the other metals deeper; the Industrial Age the metals whole, with coal and oil and gas). New for the Stone Age:
  flint (chalk and limestone, their gravels), obsidian (a young arc's volcanics), jade (ophiolite and mélange), agate (flood
  basalts) — deposits.js `group: 'stone'`. Her potentials: **bronze** = copper × tin (or, poorer, arsenic) within ~600 km ×
  wood within ~100 km; **ironworking** = iron ore × wood or coal within ~150 km (`within`: a max filter over the grid).
- **Page**: Geology → **Ages**: the age picker and its resources (All · each · potential); "All" each place its richest
  (a grade tie to the scarcer), a second at moderate or better as diagonal stripes of its colour; the legend's entries are
  the switch (tap one to see it alone, again for all; on phones the same, a thumb's height); readout: the age's resources
  there with ●○○ grades, its potential, and in the Bronze Age the **nearest tin** — distance and direction.
- **Seen** (seed 12345): copper on 1.0 → 2.1 → 2.8 → 6.1 % of the land through the Copper, Bronze, Iron and Industrial Ages;
  Bronze Age tin 0.2 % (moderate+ only on old worlds); bronze potential 0.4–1.2 %; Iron Age iron ~21–25 %; the Industrial
  Age's metals moderate or rich on ~16 % of the land. `check-geology.mjs` G5: 5 checks.

## G6 + G7 built (2026-10-21)

Developer: "ok lets do g6 and g7 now".

- **Gems** (G7, deposits.js `group: 'gem'`, appended so every earlier system is byte-identical — hashed): her kinds —
  pegmatite gems (tourmaline, aquamarine, topaz) in the granites of collision belts and old mobile belts; emeralds where
  pegmatites cut old sea floor, or in a fold belt's black shale (Colombia); rubies and sapphires in marble (a carbonate
  platform — a passive margin, a shallow sea — caught in a belt and baked 4–24 km down: Mogok), lapis where a granite met
  it; sapphire, zircon and peridot in a hotspot's basalts on land; amethyst geodes in flood basalts (Paraná); opal and
  turquoise in dry country (a new climate test, `arid`; on observed Earth true at 6 of 7 real localities — Querétaro's
  summer-rain highland the miss — and at none of the wet places); garnet in schist and gneiss; gem gravels carried down
  the rivers. Diamonds and jade were there already. Seed 12345 at 400 Myr: each gem under ~1.7 % of the land (garnet
  ~5 %), emerald and lapis ~0.05 %. **Building stone** (her list: limestone, sandstone, granite, marble, slate, clay) from
  the rocks. Both are entries of the Ages picker (Gems, Building stone).
- **Districts** (G6, `geology/districts.js`): a field's moderate-or-better ground in connected patches (poor where a world
  has nothing better), a large patch split around its peaks ≥ 200 km apart; each district's kind of deposit (its richest
  source at the peak) and its **story**, read off the record cells under it: *"Formed 1–4 km beneath a volcanic arc last
  active 14 Myr ago, bared by ~2 km of erosion since"*, *"Organic mud buried 4.2 km deep in a shallow sea — cooked in the
  oil window, trapped under salt"*. Landmasses (connected land on the grid, largest first) and each one's share of every
  resource — the **region summaries**.
- **Page**: the Deposits and Ages views mark the richest districts with an atlas's symbols (Fe, Cu, Au, Ag, Sn, Pb, Al,
  Ni, Pt, ◆, Ru, Em…) drawn on the picture — small dots at a glance, readable zoomed in, round on the globe; in All a few
  per resource and one per cluster; a **Districts** button beside the pickers hides them. The readout: the district under
  the pointer (its grade, kind, size, rank on the world), its origin, and its landmass's resources and what it lacks.
- **Exports** (`evolution/geology-export.js`, in the Export dialog and Export All): the Rocks map, the Deposits map as
  shown and each age's map (with the symbols), a greyscale mask per metal, fuel and gem (a ZIP; a `masks/` folder in
  Export All), the districts as GeoJSON and CSV (resource, kind, grade, area, landmass, rank, story), and a **resource
  atlas** in Markdown: the world's richest, then each landmass — its rocks, metals, fuels and gems, bronze and ironworking,
  its richest districts with their stories.
- **Phones**: the pickers and the Districts button in one row at 390 px (44 px tall), no sideways scroll.
- **Speed** (exact, hashed before and after): the record's fields blurred with their weights summed once
  (finish-grid.js `blurMany`, also for the rocks), the per-cell closures made once, the record read by property — the
  deposits stage with the gems ~0.87 s at 640K, as it was before them (~8 % of a finish). Districts for every metal ~40 ms;
  every district's row and story and the atlas ~0.4 s, on export.
- `check-geology.mjs`: 51 checks (G6: districts on land, few for the scarce metals, stories that read the history,
  landmass summaries that add up, the files well formed, quick; G7: gems scarce, the rarest rarest, rubies in collision
  belts, amethyst on flood basalts, opal in dry country; the Earth check's opal and turquoise).
- **Then (2026-10-22, developer: "i dont really like the labels"; "a lot of the deposits are hard to see with the shading
  and colors underneath … the contrast broadly needs to be higher guarenteed across the board")**: the symbols and the
  Districts button are gone (the districts live on in the readout and the exports). The Deposits and Ages washes are drawn
  on plain pale paper — no rock colours under them, the light's swing small (0.84…1) — and each colour is inked at a set
  contrast with its ground, more the richer (poor 50, rich 90 of 255 — lightness, with a third of the difference in hue —
  at least half of it in lightness): a pale colour darkened on the paper, a dark one lightened at sea, its hue kept
  (geology-view.js ink). Salt is pink, as in the Sediment view (its near-white went grey). check-geology.mjs holds the
  contrast for every colour, grade and light, on land, at sea and on a lake, and halfway between any two that can meet.

## Merged with main's fast follows (2026-10-25)

The developer merged the fast follows into main (one view layout on every page, ten projections and zoom on every map,
Hillshade, the shared export panel, planet files, the Studio as home page) and asked that the geology "not just fit from
merge conflicts, but fit the aesthetics and goals of that update". Merged into this branch (not yet committed):
- **The layer bar:** Geology a tab in main's bar; its views and pickers (Deposits' metal, the Ages' age and resource)
  its row under it, as Climate's, in the shared `.layer-subbar` style; on a phone the views in the layer list and the
  pickers under it (44 px). The geology views follow **Hillshade** (off: flat paper, flat rocks), the map's ten
  **projections** and its zoom, and the readout works through them.
- **The export:** Export All and its geology types are gone with main's dialog; the geology is a **Geology** group in the
  shared panel (geology-export.js `GEOLOGY_GROUP`): Rocks (data: the rock type index, the README listing the types),
  Deposits as shown (data: a richness mask per metal, mineral and fuel), each age's map (data: a mask per resource and
  its potential), the four record views, and two that are not maps — Districts (GeoJSON, CSV) and the Resource atlas
  (Markdown) — saved as they come, unprojected (export-panel.js: kind 'file'). Every map comes in the panel's widths,
  projections and centre, shaded or flat; the rocks at other widths by their weighted majority (export-raster.js
  `classIndexMap`, now the Köppen zones' too — their export unchanged, hashed before and after).
- **Planet files:** the moment's geology saves with it (the generic codec; no version bump). A file saved before the
  geology (main's, v2.1.0) lacks the record: `openPlanet` now says which fields a file lacks (`lacking`), and the page
  keeps the Geology tab off for it with a note — Build This World builds the history again with its record. **Extend
  history** on such a file skips what it lacks when comparing the replay (main's way it failed at the first frame) and
  takes the record from the replay, so the history then has its geology (add detail again to see it); saved again, a
  file still lacking it says so (`savePlanet` `omit`). Checked: main's kept planet replays the same in Node bar the new
  fields; a Chrome-made file with its geology stripped opens, extends, and details again with deposits.
- **Words:** the card and the tutorial name Geology among what detail brings; the SEO lines moved with main's pages
  (generate.html, the Studio's Evolution card, evolution.html's own meta and feature list); README, v2/README, llms.txt.
- `check-save.mjs` details its moment with the geology and draws every geology map and file from it (89); kept planets
  from before the geology open without it. `check-geology.mjs`: 54 pass.

## Merged with main again (2026-10-27)

Developer: "look at main, pull it in and update this code/approach with it". Main had gained the start world (an
assembled supercontinent of rifted cratons, old ranges along its seams), the far field (a front's push felt far inland:
old sutures and failed rifts squeezed up as **intraplate ranges**, the Tian Shan; folds and grain across the platform),
re-imagined flood basalts, rivers to the sea, the polar climate and the **fine detail zoom** (tiles finer than the mesh
where the view is zoomed in, and exports wider than the picture drawn over that detail). Folded into the same pending
merge (one merge commit, its second parent main's latest). The branch `farming` (built on G1–G2) had merged the same
main and fitted its rocks to it the same day; those changes are taken as they are, so the two branches carry the same
code:

- **Records:** the far field's frame fields beside the geological record's (crust.js, snapshot.js), both records only —
  a history is still the same with the record or without. An intraplate range lays a foreland at its feet (the Tarim,
  the Junggar), keeps its old line's rocks (raised and folded again), and is named in the readout and the district
  stories ("an intraplate range").
- **The start world's past** (`seedGeology`): its platform sediment in its lowlands between the swells along its seams
  (`platformLowGain`), its old ranges worn by their age (`startBeltExhumKm` over `startBeltExhumMyr`).
- **Rocks follow the structure the terrain draws** (synthesize.js `cue`, the heights byte-identical with it or without):
  an old belt's hard and soft bands (`bandGain`), the far field's folds (`farFoldDepthKm`), a shield's greenstone on its
  grain's ridges.
- **The fine detail zoom:** every Geology view is drawn in its tiles (their colours the views', the relief and coasts the
  detail's); the Deposits and Ages washes read their grid smoothly at any width already, the Rocks and record views
  through `rockPixel` (bilinear-weighted majority, a small warp, the finer coast's land its nearest rock — no squares,
  no yellow rim). The readout reads the rock so too.
- **Exports wider than the picture** go through main's detail (export.js `pictureAt`/`paintAt`, handed to
  `produceGeology`): the maps over its relief and coasts, the masks' sea its coast; the rock index wider as the view
  draws it, narrower by its commonest (`classIndexMap`, as before).
- **Checks:** `check-geology.mjs` pools its belt checks over three histories (seeds 12345, 777, 2024; mountain belts only
  for the unroofing — the rebuilt start world's quiet belts are mostly rift shoulders), the foreland check counts the
  cover laid in the history, and six new: the start world's cover in its lowlands, its ranges worn by age, bands, folds
  and keels followed, the heights untouched. `check-save.mjs` draws the rocks at twice their picture over the finer
  detail: no land read as sea.

## Decided (developer, 2026-10-19)

- The four departures: take a stance for the look and the stories, undoable — science in all four, each a `guideRules`
  switch.
- The ages: her five, Fuel, and Gems as G7.
- Finished moments only, for all of it.
- **Oil and gas added** (not in her guide): a petroleum system in the history and the finish — research under way; seeps
  and bitumen for the early ages, fields for the Industrial.
- No slider for now.
- One **Geology** tab (Rocks · Resources · Fuel) for now.
- The Resources look: **soft districts**, mindful of overlap — one metal at a time from the legend, or all with the
  scarcer metal winning ties and second metals as stripes (§6).
