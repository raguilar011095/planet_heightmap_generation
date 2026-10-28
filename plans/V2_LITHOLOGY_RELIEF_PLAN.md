# V2 — Rocks shape the land (lithology in the relief)

Developer, 2026-10-28: "how can we leverage the rock types to make the detail layer or the geography more realistic
itself? like influencing erosion or other things like texture or noise?" — then: "write it up as a plan, then I want you to
build out Everything at once, with commits for each phase … show differences after each change so I can inspect
individually." Branch `lithology-relief`, off `rock-types-ores` (PR #82).

## Where things stand

The arrow runs one way: the rocks are classified **after** every stage that shapes the heights (finish.js `classifyRocks`),
so the terrain never knows what it is made of. A few places fake it — and they are the ones that look most real:
- the old belts' hardness bands (synthesize.js `oldGrainHardness`: the carve's k ×0.4…1.6 on ridge and trough — the
  Valley and Ridge), craton and crest hardness;
- the flood-basalt stack (a hard cap, cliffs, `stripBasalt` escarpment retreat and mesas, `terraceBasalt` stairs);
- creep that leaves lava alone (finish-sediment.js `creepByClimate` `hard`).

What the pipeline allows:
- **The carve cannot build relief.** carve.js solves the stream power law analytically for ~1 Myr and never rises above
  the surface it is given; hardness in its k only limits how far erosion reaches ("crest hardness alone barely changed
  the ridges"). Relief from rock has to be **put into the surface the carve starts from**, with the carve's k agreeing.
- **Most rock landforms are smaller than the mesh** (15 km cells at 2.5M): cuestas and broad hard/soft relief the mesh
  can carry; benches, stepped walls, domes, karst, strike ridges belong to the fine detail (L7–L9, 1.2–0.3 km a pixel).
- **The fine detail never saw a rock** — but everything it needs is already in a detailed moment and its file: the rock
  picture (`raster.geology.rock`, ~10 km a pixel) and the climate's (`climate.raster` tAnnual, pAnnual). No new saved
  fields; a moment without geology (or saved before it) simply gets no rock texture.
- **The rock decision that depends on the relief is only which bed crops out** (valleys bare older beds); the column
  itself — cover, its make-up, the basement's grade, folds — is the history's record. So rocks can be worked out once
  *before* the carving (on the uncarved surface) to drive it, and once after, as now, for the map.

## The design

**One table of what each rock does** (geology-config.js `lithology`, each value with a range in `PRIORS`):

| Rock | hard | dissect | bedded | dome | soluble | satellite ground |
|---|---|---|---|---|---|---|
| Young sediment | 0.1 | 0.5 | — | — | — | — |
| Sandstone | 0.7 | 0.3 | 0.9 | 0.15 | — | red-orange |
| Shale & mudstone | 0.2 | 0.9 | 0.4 | — | — | grey-brown |
| Limestone | 0.75 dry … 0.3 wet | 0.25 | 0.8 | — | 1 | pale |
| Salt & gypsum | 0.1 | 0.5 | — | salt domes | 0.6 | white |
| Basalt | 0.8 | 0.35 | 0.7 (its flows) | — | — | near black |
| Andesite & rhyolite | 0.55 | 0.7 (tuffs) | 0.3 | — | — | grey-violet |
| Granite | 0.85 | 0.3 | — | 1 | — | pale pink-grey |
| Slate & schist | 0.5 | 0.75 | — | — | — | dark grey |
| Gneiss | 0.8 | 0.4 | — | 0.5 | — | grey |
| Shield granite-gneiss | 0.75 | 0.35 | — | 0.8 | — | pale grey |
| Greenstone | 0.7 | 0.45 | — | — | — | dark green-grey |
| Ophiolite & mélange | 0.4 | 0.6 | — | — | — | dark green-brown |

`hard`: against erosion (the carve's k, the critical slope, creep, dissection, differential lowering, the coasts).
`dissect`: how densely valleys cut it (impermeable shale and tuff densely, permeable sandstone and limestone, granite
barely). `bedded`: layered and flat-lying enough to step. `dome`: rises as domes and inselbergs. `soluble`: karst. Climate
turns some of them: limestone is a cliff-former in a desert (the Grand Canyon's Redwall) and a dissolving lowland in the
wet; steps are crisp where it is dry (weathering-limited) and rounded where wet; granite's domes stand where it is warm
(bornhardts, sugarloaves), tors and ice-scoured knobs where it is cold.

**Everything reads continuous properties**, blended across contacts (smooth weightings, no thresholds), from the same rock
map the Rocks view shows — so a texture changes where the Rocks view's contact is.

## Phases (each its own commit, each with before/after renders)

**L0 — exact speed-up first (fine detail).** The ridge pass's weights are worked out for every steep pixel even when no
octave will be drawn (~25 ms of a 41 ms tile at L6): skip it then. Output byte-identical (hashed).

**L1 — dissection by rock (fine detail).** `detailSource`/`cropSource` carry the rock picture and the climate's
temperature and rain; `fineWindow` reads each pixel's rock properties (eased bilinear over the rock picture's land pixels).
The ridges-and-valleys feature is weighted by `dissect` — and its spectrum too: soft rock dissected finely and densely
(badland-like where dry), hard rock coarsely and faintly. Neighbouring provinces now read differently at the same zoom.

**L2 — bedding (fine detail).** Where rock is `bedded`, slopes are terraced in the beds' own frame: each place's height
measured from a gently tilted structural surface (a slow noise, its dip a few degrees where folds or forelands tilt it,
near flat on platforms), in steps of ~100–150 m — a tread, then a riser rounded at foot and rim (no hairlines). Flat beds
give benches, mesas' and buttes' rims and stepped canyon walls; tilted ones cuestas. Crisp where dry, faint where wet;
none on gentle ground (plateau tops stay whole), none where the steps would be narrower than a few pixels. Basalt's
flows step the same way. *Built:* each bed its own thickness (0.4–1.6 steps) and hardness (its riser full or faint) —
uniform steps read as contour lines; strongest at L9, a hint at L8.
~~And in a fold belt, folded cover and slate run as strike ridges~~ — *tried and dropped*: phacelle stripes across the
belts' strike read as worms over every belt (the first fine detail's fault, V2_FINE_DETAIL_PLAN §5); a belt's ridges and
rock bands stay the mesh's (synthesize.js, the old-belt bands).

**L3 — rocks shape the relief (mesh scale, the finish).** After the climate and before the rivers:
1. *Provisional rocks* — classifyRocks on the uncarved surface (no rivers, sediment or ice yet): what the carve will cut.
2. *Hardness* per cell from them (limestone by the climate), lightly smoothed.
3. *Differential lowering*: `Δz = amp · unroofed · (hard − regional mean)` — mean-preserving over ~80 km, so the land's
   heights stay where they were overall; `unroofed` grows with how much rock the history has stripped there (the
   record's `unroofKm`, and its `exhumKm`), so old worn belts and shields get the most, a young range little (its hold).
   None on lava (its own stack), none at sea level. *Built:* the record's stripping is km almost everywhere (median
   6–10 km), so the strength is also by the height above base level (`lithBaseKm` 0.02 … 0.6 km: a lowland plain at the
   rivers' grade cannot stand in relief, whatever its rock) — mean change ~25 m over the land, ±100–200 m in uplands
   where hard and soft rock meet; the land's heights stay put (median +10 m). Broad: the contacts' scarps are finer than
   the mesh — the fine detail's (L4).
4. *The carve and hillslopes agree*: the carve's k × e^(κ(½ − hard)), its critical slope × (0.75 + 0.5 hard); creep and
   dissection weaker on hard rock.
5. *Cover stairs*: where the carve has cut into bedded cover, its walls stepped (`terraceBasalt` generalised: steps of
   ~0.25 km through the cover, by how deep the cut is), crisp where dry.
6. The final rocks are classified as before, the relief read without the differential (so a hard ridge raised by it keeps
   its hard rock) — the ridges sit on the hard rock by construction.

**L4 — rock landforms (fine detail).** Each from its rock and climate, each faint, on the same smooth 27-cell lattice
as the ridges (no seams):
- *inselbergs and domes* on granite and shields in warm country — steep-sided, round-topped, standing from the plains;
- *knobs* on crystalline rock under the last ice age's ice or in the cold — hummocks drawn out along the ice's flow
  (`iceDir`, until now unused): the Canadian Shield's knock-and-lochan, without the lakes;
- *karst* on limestone where it is wet: little dissection (the water goes underground), shallow closed hollows
  (dolines, uvalas); in the wet tropics tower karst instead — steep cones (Guilin, Ha Long), drawn larger than life (real
  ones ~0.5–1 km apart would be two pixels at the closest zoom);
- *salt domes* where salt lies in dry country (the Zagros).

*Built (2026-10-28):* the knobs (streamlined along the ice's flow, the drivers' `iceDir`) and the karst — its valleys
fewer, closed hollows (packed closer and deeper in the wet tropics: cockpit karst, rather than towers). *Tried and
dropped:* inselbergs and domes, tower karst and salt domes (smooth bumps standing alone on flat ground read as bubbles —
even made lumpy, elongated and clustered), and scarps at hard rock's contacts (sharpened from the rock picture's ~10 km
pixels, they traced its squares as staircases; the mesh's broad step, L3, stays the contact's). The table's `dome` row
became `knobby` (crystalline rock), its salt row went. Tiles ~4–5 ms slower at L7–L8 on average.

**L5 — coasts by rock (fine detail).** The coast's headlands and coves follow the rock: hard rock juts out as headlands,
soft retreats into bays (discordant coasts: Dorset; the noise keeps a share).

**L6 — bedrock colours on the satellite view.** Where vegetation is sparse — deserts, tundra — the bare ground takes its
rock's colour: red sandstone, near-black basalt and ophiolite, pale limestone, white salt, pink-grey granite. The rocks
are classified before the land's cover (the deposits stay after it), so the cover's bare ground can be tinted by them.

*Built:* the tint is the bare ground's only (deserts and tundra; vegetated land as before): ~1 in 5 desert cells visibly
changed, most by limestone, slate, ophiolite and salt; the rock map is the same as before the move.

**L7 — docs.** README, v2/README, llms.txt, the tutorial if needed; What's New asked, not done.

## Results (2026-10-28)

Commits on `lithology-relief`: the plan, L0 (exact: 242 windows hashed byte-identical), L1–L6, the docs. Renders of every
phase: `v2/out/litho/` (`index.html`: any two phases side by side, or blinking; the height change between them). In
Chrome, a 2.5M finish of seed 432175 at 300 Myr: 39 s, the `bedrock` stage ~1.8 s; no console errors.
- **What shows most:** the satellite's deserts (their bedrock's colours); ice-scoured shields (knobs, L8–L9); layered rock
  in dry country stepped (L9); limestone plains pocked with hollows (L9); granite and shale cut differently (L7+).
- **Subtle by design:** the mesh-scale relief (±100–200 m in uplands, broad), the coasts by rock (~1 km).
- **Tried and dropped:** strike ridges (worms over every belt), inselbergs, tower karst and salt domes (bubbles), contact
  scarps (the rock picture's squares as staircases).
- **Left open:** the contacts' scarps would need the rock's contacts finer than its picture (its own vector or a finer
  rock grid); inselbergs would need shapes of their own (a dome's joints, its talus apron), not bumps.

## Not done (and why)

- **The history's sim stays as it is.** Cover stripping faster than basement is real, but the sim's cells (~100 km) see
  only provinces, it would change every world, and the record must stay records-only (check-geology G1).
- **No real karst hydrology** (sinks, lost rivers): it fights "every river reaches the sea". Karst stays a texture.
- **No lakes in the knob country**: lake districts were taken out of the fine detail (V2_FINE_DETAIL_PLAN §5).
- **Escarpment retreat for sedimentary caps** (`stripBasalt` generalised) — the differential lowering, the hard caps'
  steep critical slope and the stairs give cuestas and mesas; a retreat model only if they do not.

## Seeing each change

`v2/tools/render-litho.mjs` renders the same moments after each phase into `v2/out/litho/<phase>/`: the whole planet
(Terrain view), and the same places zoomed in (L7, L8 and L9 — each phase drawn by its own commit; Terrain, Rocks and Satellite views) — a shield, granite, a
bedded basin in dry country, wet limestone, an old fold belt, a glaciated shield, a coast — picked once from the first
render by their rocks. `v2/out/litho/index.html` (served by the dev server) puts any two phases side by side, or blinks
between them.

## Checks

check-save (moments open; the detail draws), check-geology (rock shares near Earth's; the record still records only;
exports), the fine detail's tile time (`bench`), and per phase the renders' numbers: land heights (the share below 400 m
stays near 40 %), water and dry hollows (render-moment's), rocks' families.
