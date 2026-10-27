# Evolution: Farming — farmland, soil and growing season (and later the cradles of civilization)

Developer, 2026-10-21: "I am interested in understanding/building a map mode around soil suitability X the climate X the
growing season … to identify areas that are prime for potential high population centers and or could be cradles of
civilization, either with irrigation or without." For the Evolution mode, after Madeline James's culture series
(madelinejameswrites.com/blog — Part 4, *Antiquity and State-Building*, is the core). Decisions (2026-10-21): its own
tab; a soft ramp with graded classes as an option; farming techniques **not** tied to the Geology tab's metal ages (the
Andes had terraces and canals but no iron); start with C1; built on the worktree `farming`, off the geology branch.

## The guide, and the science under it

Madeline James places the first states where three things overlap (Part 4): **rich soil and a grain climate** — loess
(wind-blown, downwind of the last ice age's ice) or alluvium (river silt: floodplains, deltas) under rice climates (Am,
Cfa, Cwa, Dwa, Dwb, with river water) or the other grains' (Cs, Cw, Dfa/Dfb), dry river valleys included ("think
Egypt"); **navigable water** (calm rivers, sheltered coasts; deltas and wetlands too rich in wild food to start one);
and **geographic isolation** (good land walled in by desert, mountains or sea). Her soil notes: the best soils under
temperate grassland and temperate broadleaf forest; rainforest, taiga, deserts, polar land and mountains poor; savanna
middling. Non-state settled peoples on deltas, wetlands, coasts and ecotones; migratory peoples in dry, cold and
mountain land. She warns against geographic determinism — the layers say what the land *could* grow, not who people are.

The science agrees and gives the arithmetic:
- **Ramankutty et al. 2002** (*Global Ecology and Biogeography* 11: 377): cropland suitability = climate (growing
  degree-days × moisture, actual ÷ potential evaporation) × soil (carbon, pH). Rain-fed farming mostly stops below a
  moisture index of ~0.5.
- **FAO agro-ecological zones**: the *length of growing period* — the days warm enough (above ~5 °C) and wet enough
  (rain above half the potential evaporation, plus ~100 mm the soil holds).
- **Carneiro 1970** (circumscription) is her isolation; **HYDE 3.3** (gridded population and cropland back to 10,000
  BCE) a possible Earth check for C3.

## The model (C1)

Every factor 0…1, multiplied — each a smooth ramp, in physical units (scale invariant):

- **Growing season** (months): each month's growth = warm (5 → 15 °C) × wet (rain, melt and the soil's 100 mm ÷ the
  month's potential evaporation, 0.3 → 0.7). Rain-fed = their sum; *watered* = the warm months alone (water brought).
  A crop needs ~3 months; a long season grows two crops (a small bonus to 11 months).
- **Soil** (inherent, on flat ground): the parent material — river silt and loess best, young volcanic ash and basalt,
  limestone and shale good, till middling, sandstone and granite poor, serpentine and salt barren — × the climate's
  work on it: black earth under temperate grassland (a bonus), leaching in the hot wet tropics (a penalty, less where the
  ground is renewed — river silt, volcanic ash, rising mountains), acid podzol under boreal conifers (a penalty).
- **Ground**: slope (regional gradient, m/km) thins the soil and stops the plough; waterlogged flat wet ground drowns it.
- **Water brought** (irrigation availability): *flood farming* on a big river's floodplain (low ground beside it);
  *canals* from any river worth tapping, reaching farther from a bigger one (half-width ~8 km × (q / 100 m³/s)^0.4, up to
  50 km), on ground not far above it; fresh lakes' shores too.
- **Techniques** (legend chips, independent — not metal ages): Flood farming, Canals, Terraces (slopes farmable), Raised
  fields (wetlands drained, chinampas). Farmland = soil × ground × season(with the water the techniques bring).

The finish computes the parts per cell (the final climate's twelve months, the rocks, the rivers, the heights) and hands
them over per pixel; the page combines them with the techniques chosen, at once.

## Phases

- **C1 — Farmland, Soil, Growing season** (this phase). A **Farming** tab (finished moments only, like Geology) with
  three views: *Farmland* (green by rain; teal where only water brought makes it farmable; chips for the techniques;
  ramp or classes), *Soil* (inherent fertility; the readout names it: river silt, loess, black earth, leached red earth,
  podzol…), *Growing season* (months, by rain or watered). Checks: `v2/tools/check-farming.mjs` (the same at two
  details, fields where they belong, cost) and `tuning/farming/earth-farming.mjs` (the climate's part on Earth's
  observed climate: breadbaskets long, the Nile and Mesopotamia only watered, the tropics leached, the taiga podzol).
- **C2 — Staple crops** (built 2026-10-21): rice, wheat and barley, maize and millet, roots and tubers, herding land (and
  so the nomads). Developer: "it should show what grows best here. spread really depends on culture and other things
  that we arent modeling right yet" — so no per-landmass domestication yet. Per cell, each group's yield by rain and
  watered from its own months (FAO ECOCROP-style windows; brought water a limited ~60 mm a month, so a desert river grows
  winter wheat, not paddy; rain-fed crops discounted in arid climates, whose rains fail often — the herders' lands);
  the page picks the best with the techniques, soil (tubers tolerant, rice demanding) and ground (rice level fields).
  A **Staples** view (one hue each, paler where it grows less well; a chip shows one alone). Earth: 73 places right.
  Alongside, loess fixed (developer: "loess soil is reaching too far down, almost to the equator"): its silt mostly the
  outwash's and cold deserts', kept only outside the tropics (finish-wind.js).
  **Harvests, not a growing season** (developer: "it take some minimum time for the crops to mature … distinguish good,
  from excellent, like nile or the rivers in china which allow for multiple harvests"; and the Mediterranean questioned):
  each crop kind grows by degree-days from its base (wheat and barley ~0 °C, rice, maize and sorghum 10–12 °C) to its
  optimum, wet enough and not drowned (surplus mm), and ripens after its cycle of such growth; a run broken by a dry or
  cold month is lost (winter grains sleep through the cold); harvests are a staircase — the next needs a whole cycle and
  a turnaround more; wheat and barley one a year (they flower on lengthening days), rice up to three; a second crop of
  another group in the months the first leaves (rice then winter wheat; wheat then millet); extra harvests only as the
  soil can feed them (silt, ash). Farmland is the best crop's food (fix 1: Farmland and Staples agree), its classes
  good = one sure harvest on decent soil, excellent = more than one. Rain-fed harvests discounted where rain is dry or
  seasonal (fix 2, the Mediterranean's and the monsoon margins' failed years). Earth: 95 places right (Nile, Bengal,
  Java, Yangtze excellent; Paris, Iowa, Ukraine, Sicily good; the dry edges fair to poor).
- **C3 — Cradles and people** (built 2026-10-21): `farming/cradles.js`, on the page from the farming picture. People:
  ~60 a km² per good harvest's food, pre-industrial potential. Cradles: a taxable grain grown densely within ~60 km
  (rice, wheat, maize; tubers hardly) × walled in (the land within ~350 km mostly desert, mountains, sea — half — or
  steppe, not farmland and forest to slip away to) × fed by works that need organising (irrigation, terraces) ×
  navigable water (a big river, or a coast) × herders near; the likeliest places ≥ 800 km apart numbered (up to 8), said
  why. Two views: **People** and **Cradles**.
  **Heartlands and a critical mass** (developer, after a look: "we are being too strict with space/they can be over
  larger distances … it needs to be some like critical mass of people to be a meaningful state"): the dense 60 km core
  became a heartland of any size — the land within 150, 300 or 600 km of a place, each tried, the likeliest kept — judged
  by its people fed by taxable grain (250 thousand → 2.5 million on a log scale: polity population is the main driver of
  state formation in Seshat, Turchin et al.; Egypt ~0.9 million at unification, Butzer), close enough to rule (3–12 a
  km² of its land: a vast thin land is not one); its water, works and grain counted over it (the share of its grain on a
  big river's floodplain or by the sea), its walls in the land up to 300 km beyond it. Its likelihood glows across its
  grain land, out to its reach; the legend and the readout say how many its grain could feed. 600 km heartlands seldom
  win — the land beyond so big a one is mostly more farmland — as early states' cores were ~150–300 km.
  **Cradles set aside** (developer, 2026-10-22: "im not sure the cradle thing is working out that well, lets just
  remove it for now and put it in a 'future world' option or something"): the Cradles view is kept, shown only with
  View → **Experimental Views** (remembered in the browser).
- **C4 — Hearths and the spread of crops** (built 2026-10-22): `farming/spread.js`, a **Crop spread** view. Developer:
  "focus on stable crop dominance based on area/continent … up to 4-6 areas where domestication started … each of these
  areas should be geographically isolated. Some minimum distance from one another, and separated by some major
  ocean/mountain range/desert. … Each agricultural zone can domesticate 1-3 staples that are dominantly growable in
  that area … an area not having the 2 strains of the same crop type in the same region … this is more just like osmosis
  and spreading out over a very very long time"; then "faster along rivers/coasts, faster along flat plains, avoiding
  deserts/mountains. Long stretches of open ocean are very expensive"; "every crop type should have at least 1 hearth to
  spread it (maybe 2)"; and "optimize towards areas with multiple crops so we have variety in domestication".
  The model (on a 0.5° grid from the farming picture, with the techniques chosen): **hearths** — regions (~400 km) whose
  land grows the most rain-fed food at one harvest a year (the first farmers had no works: the wet tropics' two or three
  rice crops came later), up to twice as likely with several staples (their effective number: Vavilov's centres of
  diversity); up to 6, each ≥ 2000 km from the others and ≥ 5000 apart by the way crops travel (a continent's breadth of
  open farmland, or 2000 km with a major barrier). Each domesticates the staples that grow best (rain-fed) on ≥ 15 % of
  its farmland, 2 or 3 (developer, after a look: "each hearth should domesticate at least 2 crops" — the next best there
  if no other grows best on so much); every staple from at least one hearth (a hearth with room where it grows best on ≥ 4 %, or a
  hearth of its own, up to 8 — or the hearth that suits it best), from two where it can be, from no more than three
  (never taking a hearth's leading staple; developer: "the second staple favoring crops fewer hearths have make sense" — a hearth short of two, or over the cap, takes the staple fewest hearths have of those that grow there). **The ways**: a km costs 1 on flat land the crop grows on, + up to 4 over
  hills to mountains, + 4 over desert, + 2 where it does not grow (carried across), × 0.5 along a river, × 0.7 on a
  coast; the sea 1 within ~100 km of land (boats hug the shore), up to 40 past ~450 km (open ocean: never crossed). **The
  spread**: per crop one multi-source Dijkstra from its hearths, to a reach of 16 000 — the first strain to a place keeps
  it (no two strains of a crop in one place). **A place's crops**: the best of those that reached it (or herds — animals
  not modelled yet), a second where it feeds ≥ 80 % as much (a third of the farmland: herds beside the fields, mostly);
  none reached: foragers. The view: each crop its colour, each strain a shade of it (lighter or darker), a second crop
  striped, foragers hatched; chips show one crop's strains alone (by hearth colour; hatched where it would grow but never
  came) or colour by hearth; numbered pins in the hearths' colours; the readout names each crop's hearth and how far it
  came, and a better crop that never came. Checks (`check-farming.mjs`): 3–8 hearths, far apart; each 2–3 staples, every
  staple domesticated; strains ≥ 1500 km from home, ≤ 2 % of them over open ocean; a second crop on ≤ 45 %; foragers
  ≤ 15 % of the farmland; the same at 160K; ≤ 1 s on the page (~300 ms).
- **C4b — Real crops** (built 2026-10-22): developer: "it would be really cool to have the options to assign real crop
  varietals that were historically domesticated … select and change them. And even have some sort of similarity
  matching so that crops that were historically domesticated together are more likely to be chosen as coming from the
  same cradle"; "names first then niches, but we can use the niche to tie break … one root core by tropics and one by
  cold they should get their respective roots, but we dont need to affect spreading (for now …)"; "none of these
  restrictions should be hard rules, more preferences/driving selection". `farming/varietals.js`: ~30 crops by staple
  group (Japonica, Indica and African rice; emmer, einkorn, barley, rye, oats, quinoa, teff, buckwheat; maize, sorghum,
  pearl, foxtail, broomcorn, finger and browntop millet, fonio, goosefoot; potato, oca, sweet potato, cassava, yams,
  greater yam, taro, banana, enset), each with its Köppen climates and its `kind` (its group's growing habit, for its own
  niche in the spread later); 12 packages (the Fertile Crescent, the Yellow River, the Yangtze, the Ganges, Mesoamerica,
  the Andes, Amazonia, New Guinea, the Sahel and West Africa, the Ethiopian highlands, eastern North America, temperate
  Europe). After a look: "each type should be taken exactly once" (no crop names two strains), "prioritize a set of
  more hearty/historically used crops for staple foods" (each crop's `major`: 1 the great staples — wheat, barley,
  Japonica and Indica rice, maize, sorghum, potato, cassava — ~0.6 regional, ~0.3 minor), and "each area wont be exactly
  like 1 area historically, this isnt earth … partialy like sahel and geanges … just a part of the driver". So: each
  hearth keeps its region's Köppen mix; a crop suits a strain by its climate + 0.6 × (0.3 + 0.7 × major) × the best fit
  of the packages it is in (each package's climate × the hearth's staples it covers — every package pulling, none
  assigned) + 1.2 × major; each staple group's crops shared out one each among its strains, the best sharing found
  exactly (a pruned search); a hearth is "like" the homes of its crops whose climate is like its ("partly like the Sahel
  and the Ganges"); a package's crops pull a hearth's second staple. Choosing a crop another strain has swaps the two. The hearths now chosen by rain alone, spacing included (the same whatever the
  techniques, so a chosen name stays put). The legend: each hearth's crops as choices (its group's, the likeliest first,
  each with its Earth home and the hearth that has it), "like …" as above; Real crops and Reset chips; the
  readout names each place's crops.
- **C4c — Each crop's geographic bias** (built 2026-10-22): developer: "lets implement the geographic biases for each
  specific crop now"; "if a new crop creeps in that is much BETTER suited to the climate or nutritionally capable and
  already established nearby (ie not over a long sea) I think it can win out"; "the nutritional capability should bias
  initial selection too" (it does: `major`). No finish change — a bias on the staple group's harvests, from the
  climate: each crop's niche per Köppen class (0.25 outside its climates → 1 in them; `like` between); each strain its
  own Dijkstra with the group's fit × its niche; a cell's strain the first to reach it unless one later is worth more:
  niche × (0.6 + 0.4 × major) × e^(−lateness ÷ 3000 of the ways' cost); each place's crops × their strains' niches.
  spread.js split: spreadBase (cached per techniques; the hearths) and spreadStrains (per chosen crops, ~0.3 s), so a
  crop chosen in the legend re-spreads as that crop. Real crops off: the staple groups alone. Checks: where a real crop
  is the main one its niche 0.71 → 0.83 (vs the groups alone); a second crop now on 18 % (the biases break ties). A
  later step could keep harvests per kind in the finish (maize vs sorghum, tropical roots vs potato) for real yields.
  **Fuller spread** (developer: "the lack of spreading crops is a bit of a concern, im seeing areas relatively nearby
  to one another that could spread a crop but are not … too much aggression in how we are detering ocean transport";
  "for the ocean transport, at least when there is nothing competing, it should be harsh when something is already
  established"): the unreached good land sat at the strains' reach (16 000, nearest reached 400–800 km off at
  12 000–16 000 — the niches' dearer off-climate land made it worse: roots 5 → 25 % unreached). Now: reach 50 000; the sea,
  where no strain is yet, 1 a km within 200 km of land rising to 40 at 700 km, and never past 1000 km from land (an
  ocean's breadth — nor searched); against a strain already there, each km of sea counts 10× in the lateness that a
  later, better strain must make up; between hearths the sea as dear as before (the same hearths). Good crop land
  unreached 0 % on both test planets; the search inlined and each strain's spread kept, so a crop chosen re-spreads
  only its strain (~0.1 s; the first spread ~0.9 s with the picture read).
- **C4d — Re-roll** (built 2026-10-22): developer: "is there any way to maybe "re-roll" the crops so that I dont need to
  redo the whole thing, but I can still be accurate to the code/logic?"; one button for the whole history, hearths too
  (the crop lists already hand-tune names). The scores as odds, not a ranking: the regions tried in the order of their
  richness × e^(rollRegion 0.25 × a random field smooth over ~1000 km — a hearth jumps region, not a few km); a hearth's
  other staples by share × e^(rollStaple 0.4 × N(0,1)), its leading one kept, and as much in which it takes up; each real
  crop's pull + rollCrop 0.3 × Gumbel before the exact one-each sharing (perturb-and-MAP: the best still likeliest).
  Every rule enforced as before (apart, 2–3 staples, every staple, each crop once). Random numbers a hash of (roll,
  stream, place): no stream re-rolls another, the same at any detail. Roll 0 byte-identical to before (hashed). spread.js:
  spreadGround (kept per techniques) + spreadHearths(ground, roll); the strains' spreads kept with the ground by hearth
  cell, so a re-roll re-spreads only moved or renamed strains (~0.5–0.8 s). Legend: Re-roll chip (its count), Reset crops
  back to roll 0; a crop chosen is dropped by a re-roll. On the test planets over 12 rolls: every rule kept; great
  staples ~80 %, climate-suited 81–91 %; the richest hearth within 2000 km in 10 of 10 (over a broad rich plain its place
  is a toss-up: it wanders ~1500 km). Known: a cold or dry hearth taking roots once the potato is another's gets a
  tropical leftover (yams; on a roll banana) — as at roll 0.
- **C4e — One part of the world; at home** (built 2026-10-22): developer: "Can we strengthen a bit the "should be from
  the same area of the world" pull factor? Also, I think we should "blend" the "natural" ranges of the real varietals to
  be slightly more attuned to the climates in the cradles". The package pull suited each crop to the hearth alone, each
  group named apart — so a hearth's crops came from all over (maize + barley; wheat + banana). Now each pair of a
  hearth's crops + together 0.6 × nearness (1 one package; else by their packages' rough places on Earth, 1 within
  1500 km → 0 at 6000: the Yellow River and the Yangtze ~1, the Fertile Crescent and Europe ~0.8, Mesoamerica and the
  Andes ~0.4), solved by block coordinate ascent over the groups (each re-shared exactly given the others) till settled.
  Pair nearness 0.13–0.19 → 0.38–0.47, hearths all from one part of the world ~10 → 30–50 %, great staples and
  climate fit about as before (examples: pearl millet + African rice + yams; maize + sweet potato; quinoa + potato;
  buckwheat + japonica). And each strain's niche its crop's blended attune 0.3 toward its hearth's climates (strainNiche;
  each hearth class full as it covers 5–25 % of its land): a strain's niche over its own hearth least 0.25 → 0.45,
  mean 0.81 → 0.85. Checks: 62 of 62.
- **C4f — Re-roll in the link** (built 2026-10-23): developer: "i think the rerolls should be encoded in the url. ALso we
  dont need to keep count of them". The roll one for the page (farmOptions.roll, not per picture), Re-roll a random one
  (1–999999, as the seed) with no count on its chip, kept in the link as `crops=` (roll 0 leaves it out); Reset crops
  and New World back to 0; a re-roll or Reset drops every crop chosen. The crops chosen in the list are not in the link.
- **Fitted to the fast-follows** (2026-10-25): developer, after merging fast-follows (#68: one view layout, projections
  and zoom on every map, the export panel, planet files, word seeds, the Studio home page) into main: "make this not
  just fit from merge conflicts, but fit the aesthetics and goals of that update". Merged main into `farming` (G1 + G2
  and C1–C4f with it), then:
  - **Layout**: Geology and Farming tabs in the shared layer bar (`.layer-bar`), their rows in its sub-bar, the legend
    in the shared `.legend-card`; Experimental Views moves from the old View section into the view strip (Evolution only).
    Phones: their rows in the layer list, chips and crop choices 44 px.
  - **Hillshade**: the view strip's switch flattens the Geology and Farming views too.
  - **Pins over the planet**: the hearths' and the cradle sites' numbered pins were drawn on the texture — on a zoomed
    map they grew into blurred discs, and a projection squashed them; now an overlay placed by GlobeView.screenAt (the
    projection's forward, the zoom and pan; on the globe, its near side), round and sharp at any projection and zoom.
  - **Export**: Geology and Farming groups in the panel — every view as colour (as shown: the legend's techniques, crops
    and re-roll, in the README.txt; Crop spread with its pins), and data where the number stands alone (rocks' and
    staples' indices with their classes listed, farmland, people, soil, growing season).
  - **Planet files**: the rocks and the farming saved with the moment (generic, as the save plan meant); the re-roll in
    the settings (`crops`); a history saved before the rock record is detailed without rocks, not from zeros. check-save
    draws the rocks' and farming's maps from a planet read back.
- **Fitted to main again** (2026-10-27): developer, after main gained the start world (an assembled supercontinent), the
  far field (intraplate ranges), coasts as arc chains, the fine detail zoom, flood basalts re-imagined, a faster Add
  detail, the polar climate fix and past versions online: "look at all the changes and make sure everything is up to
  date and matches up". Merged main into `farming`, then:
  - **Fine detail zoom**: the Geology and Farming views get main's tiles too (evolution-main.js `patchLayer`,
    `paintTile`): zoomed in past the picture, their colours over the detail's relief and coasts, as the Climate views;
    Farmland's and Cradles' rivers crisp on them; a farming choice repaints them (its options in the tiles' look).
  - **Exports wider than the picture**: the Geology and Farming maps drawn on the detail too (export.js `paintAt`,
    `pictureAt`), as main's other maps.
  - **Intraplate ranges** (main's new belt kind): named in the Geology readout; their rocks the old line's, raised and
    folded again (rocks.js, as before by default — now said); a foreland at their feet (step/geology.js).
  - **Checks**: check-farming's open-ocean check measured land near a pole through a box of latitude and longitude, so
    a crop's way round the pole (the spread's own distance, right there) read as open ocean once main's world had land at
    ~82° N — now settled by the great-circle distance; check-geology's two belt checks pooled over three histories (the
    rebuilt start world left seed 12345 34 cells at the foot of its active belts) and the unroofing one counts mountain
    belts only (a rift's shoulders — now most of the old belts — retreat as an escarpment). 62/62, 20/20, check-save.
- **C5 (optional)**: her Parts 1–3 — cultural barrier clusters, domesticable animals (herding from its own hearths);
  her polity typology map.

## What to verify in the browser (C1)

1. Farming tab locked on previews; opens on a detailed moment; phone: in the layer picker, chips ≥ 44 px.
2. Farmland: dry river valleys teal ribbons in deserts; temperate plains and loess green; mountains, deserts, tundra and
   ice blank; chips change it at once (all off = rain only); Classes toggles graded bands with shares of the land.
3. Soil: river plains and loess richest; shields, sand seas and the wet tropics' old ground poor; readout names the soil.
4. Growing season: long in the wet tropics, short poleward and up mountains, zero in deserts by rain alone.
5. Looks the same at 640K and 2.5M (patterns, not speckle); the finish no slower than a few %.
