# Evolution: Food — a redesign (plan)

Developer, 2026-10-31: "we should pick up the food exploration work again … I want you to understand the code and the
goal, but then i want you to totally rethink and redesign how this part of the project could work. Do more research into
distributions of crops, crop domestication, food worldbuilding, and really understand how we can make a believable
generator with interesting map modes." Branch `farming-spread`, fast-forwarded to main (b9eb7fe). The parked Crop spread
is still reachable at 21c4623.

The research behind this plan is in `plans/food-research/`: `domestication.md` (where and why farming began, wild
ancestors, animals), `food-systems.md` (classifications, foragers, herd animals, Earth datasets, with an analysis of
D-PLACE's 1,291 societies), `food-culture.md` (fats, drinks, sweeteners, spice, preserving, dairy, calendar, trade) and
`worldbuilding-and-games.md` (what worldbuilders ask, map modes in games, other generators). The earlier crops research
is on branch `crops`.

## 0. Decisions (developer, 2026-10-31, after the first draft)

> "I'm a little hesitant for culture at this point … so many non-geographic determinism elements to that and the
> spread. Initial seeding and the history/spread makes some sense since its so slow and over such longer timespans that I
> think it is ok to take a more geographic/climatic/historical determinism angle. The uniqueness of culture spread needs
> trade routes, population centers, historical events, ebbs and flows … right now i want to really focus on the INPUTS to
> what can eventually be an interesting historical and cultural development process."

- **Scope: inputs only.** The land (§3), the domestication history (§4) and what they directly allow: staple, animals,
  way of life as subsistence, the calendar, people. **Kitchen (§5.4) and Specialties (§5.6) are moved to a later
  culture layer**, together with trade routes, cities, states and events. Their research stays in
  `food-research/food-culture.md`.
- **1. Soil and Season fold into Farmland.** "All this should shape people/population eventually too": People should
  later weigh the lean months, the fly belt and the plough (§5.7).
- **2. "As it came" by default**, with a Best possible chip.
- **3. 10,000 years by default, and the full spread shown too.** "Maybe different areas domesticate at different times
  and domesticate different crops at different times. But once the first is domesticated others start more quickly."
  So:
  - each (region, archetype) has its own start date;
  - once a region farms (its own first crop, or one arriving), its other wild ancestors follow at a know-how rate:
    mean ~1,200 / niche² years, beasts ~1,500 / niche² years;
  - news of farming outruns the crops: a region within ~700 km of a new hearth becomes a receiver after ~400 years.
    That alone spaced the mock-up's hearths at least ~800 km apart, in Earth's pairs and groups.
- **4. Scarcity is allowed, with a toggle.** "Fewer gaps" (placeholder) raises each landmass's odds of every beast from
  ~70 % to ~96 %.
- **5. Tree & palm crops** (left to my call): a new food, staple code 8, appended. Perennial, a ~9.5-month run (so the
  ever-wet tropics), no bar on slopes, poor soil enough; with water brought, the oasis palms. It goes into the finish
  with the larder (F3).
- **6. Calendar first.** The names are placeholders.

**Mock-up.** https://claude.ai/artifact/CPrP3a1fCqYnzkiqsA8KLS shows the seven views and their keys, live on a toy
planet: a stand-in climate with the app's crop model ported, plus the tree crops. Its sources are in
`food-research/mockup/` (`node build.mjs`; `node test.mjs [seed] [roll]`, `node sweep.mjs rate base rivers through`
check the history). The history there is the proposed one, with these tunings from the toy:
- a world rate of ~45 first ignitions per 8,000 years, cubic in the hearth score;
- spread of ~0.55 km a year over fit land, ×2.5 along rivers and coasts, ×2 through farmers;
- contact at 700 km.

Earth-like results on six test planets: 9–15 primary hearths, with the cool-season grains at 37–45° and the rest in the
tropics; farming on 84–97 % of the farmable land by 10,000 years.

**Lessons from the mock-up:**
- Store times in Float64: Float32 rounding made every source look stale, and the spread never started.
- A region's niche must be read over ~330 km, not only at its centre, or the mid-latitude grain hearths never ignite.
- Herders tame the directed beasts (horse, camel, reindeer) late, even where no farmer ever came: from ~3,500 years
  after the world's first crop.
- Rank the leading beast by its wild home, not by where it can be kept, or one beast takes the whole map.
- The harvest month needs reading over ~150 km on the year's wheel, or it is confetti.

## 1. Where it stands, and what is wrong with it

**What there is** (`plans/V2_FARMING_PLAN.md`, C1–C6b, on main since 944a75e):
- **The land's model**: the growing season by month; soils from the rocks, reshaped by the climate; water brought from
  rivers and lakes; four techniques; each crop group's harvests by degree-days (a harvest staircase, rotations, dormancy);
  pasture.
- **Gatherers**: fish from cold, upwelling shelves and wild foods by season.
- **People**: by fallow.
- **Six views**: Farmland, Staple food, Lifestyle, People, Soil, Growing season.

**What is wrong:**
1. **Every map is what the land *could* support.** Each is a pure function of the climate. Two continents with the same
   climate eat the same, so the tab reads as the Climate tab recoloured. Earth's food maps grip people for the opposite
   reason:
   - **Contingency**: who domesticated what, and where it could or could not travel.
   - **Crisp lines along physical limits**: the olive's frost line, the tsetse belt, the rice–wheat line, a farming
     front stalled at a climate edge.
2. **Half the views are inputs** (Soil, Growing season, Farmland). Worldbuilders' recurring questions go unanswered:
   - what is in the pot, and what do they drink?
   - when is the harvest, and when are the hungry months?
   - what pulls the plough?
   - what is traded?
   - why do these people herd and those fish?
   (`worldbuilding-and-games.md` §1.9)
3. **The archetypes are coarse where it shows:**
   - "Livestock" lumps camels, yaks and reindeer together.
   - There are no tree crops.
   - A hoe garden and a plough field look the same.
   - "Gathering" is one class, though settled fishers and mobile hunters are worlds apart. The data say sedentism is a
     fishing phenomenon (`food-systems.md` §2.1).
4. **The parked spread (C4–C4f) chose hearths as "the richest rain-fed land", and that is not where farming began.**
   Farming began on strongly *seasonal* ground with storable wild seeds or roots (§4.2). To look right, it then needed a
   dozen hand rules, each a fix for a look:
   - hearths ≥ 2,000 km and ≥ 5,000 cost apart
   - 2–3 staples each
   - every staple from 1–3 hearths
   - caps that never take a hearth's leading staple
   - reach budgets
   - sea held ×10
   - pair-nearness pulls

   Together they are fragile.
5. **The spread's unit was cost, not time.** So it could never say *when*, and time is what makes the farming-front
   maps compelling (isochrones bending along coasts, stalling at the cold edge).

**What is right, and stays:**
- the crop model and its Earth checks
- archetypes, not species (the owner's 10-29 decision; real crops a later layer on `crops`)
- the legend's patterns: one alone per chip, stripes for a close second, hue for the kind, lightness for the amount
- computing on the page from what a moment keeps
- the `farm=` re-roll
- codes that are only ever appended

## 2. The new shape: Land → History → Culture

```
LAND      (the finish, per pixel — exists)      what each place could grow, graze and catch; and when
   │
HISTORY   (the page, 0.5° grid, in YEARS; seeded) wild larder → hearths ignite → crops and beasts spread
   │                                              → each place: which strains came, from where, and when
CULTURE   (the page, per pixel)                  way of life · staple · animals · kitchen · calendar ·
                                                 specialties · people — "as it came", or "best possible"
```

Principles:
- **Each stage is a map you can open** and check by itself (the phase-gated way of working).
- **Potential and history side by side.** Every culture view shows what came, by default. A **Best possible** chip shows
  what the land alone would support (today's maps).
- **Time replaces the rules.** Hearths ignite at random dates drawn from their odds. Farming spreading out from an earlier
  hearth absorbs any candidate it reaches before that candidate's date. So the number of hearths, their spacing and
  "every staple from somewhere" come out of the geography instead of being imposed.
- As always:
  - smooth scores, not cut-offs;
  - physical units (°C, mm, km, years: the same at every detail);
  - one seeded stream per mechanism, so adding one never re-rolls the others;
  - archetypes, with Earth's likeness only as words ("like olive oil").

## 3. Land — small additions to the finish

- **Derived on the page from what a moment already keeps** (no new bytes), each checked against Earth's exact months in
  the Earth harness (§8):
  - **Effective temperature** ET = (18W − 10C) / (W − C + 8) (Bailey; Binford), with W and C the warmest and coldest
    month, from the year's mean ± half the kept range.
  - **Matranga's temperature seasonality**: the warmest minus the coldest quarter, each cut off at 0 °C.
  - **Rain seasonality** (`rainSeason`, kept).
  - **Net primary productivity**, from the Miami model on the year's temperature and rain (Tallavaara's input).
  - **Approximate dry and frost months.**
- **New per-cell bytes in the finish** (data added; no version bump; an older moment detailed again for them):
  - the **main harvest month** of the leading crop, by rain and watered, or "all year";
  - the **lean months** before it;
  - the **harvest risk**: drought at the dry edge, failed rains, frost at the cold edge, flood.

  `cropYields` already walks each crop's runs, so it knows when they end.
- **Optionally a fifth crop group, *Tree & palm crops*** (decision 5): bananas, breadfruit, sago, dates, chestnut-like
  mast. Its harvests are kept under its own name (C6a's design: data added). It would be staple code 8, appended.

## 4. History (the page)

### 4.1 The wild larder

Where each archetype's wild ancestor grows. This is its *domestication* niche, which is not the crop's later growing niche
(`domestication.md` §2, §3.3). Smooth scores:

| Archetype | Wild ancestor's niche |
|---|---|
| Cool-season grains (with pulses) | Winter rain and a long summer drought. Coldest month 0–12 °C, 250–1,000 mm (best 350–550), hills from −400 to 2,000 m, open woodland or steppe. Blumler: 32 of the world's 56 biggest-seeded grasses grow in such climates. |
| Warm-season grains | Three kinds: (a) monsoon millets: summer rain 300–800 mm, strong temperature seasons; (b) savanna grains: one short summer rainy season, 200–900 mm, hot; (c) a maize-like grass of seasonally dry tropical hills, 450–1,950 m, about 6 dry months. |
| Paddy grains | Seasonal wetlands and floodplains. Year's mean above 17 °C, summer above 26 °C, up to about 30° latitude. |
| Roots & tubers | Two kinds: (a) the forest–savanna edge, 3–5 dry months; (b) cold tropical highlands, 2,000–4,000 m, with frost. |
| Tree & palm crops (if added) | Wet tropics with 2 or fewer dry months (vegeculture); oasis palms; nut-mast forests. |
| Herd beasts | By habitat (Madeline James Part 3). Small stock: rugged hills, 500–2,500 m. A great grazer: river and woodland mosaics. A wallowing buffalo: tropical wetlands. A steppe horse: cold semi-arid grass. A desert camel: hot, under 250 mm (a two-humped one in cold desert). A plateau yak: above 3,000 m and cold. A mountain camelid: puna at 3,500–5,000 m. A tundra deer. A forest pig. Village fowl. |

The rule of thumb (Harris; Fuller; Denham 2020):
- **4–5 or more dry or cold months** give seed crops kept in granaries.
- **2 or fewer** give clonal crops kept in the ground.
- **3–5** give roots with a grain fringe.

**Which beasts a landmass has.** Domesticability shows no climate signature: it is luck (Hendrix & Vos 2019). So each
landmass draws its own:
- **How many candidates.** The count grows with area to about the 0.3 power.
- **How big.** The largest native herbivore weighs about 0.47·A^0.52 kg (Burness, Diamond & Flannery 2001), so nothing
  ox-sized lives on land under about 10⁵ km².
- **Which succeed.** Each habitat's beast is present with odds: about 18 % of candidates succeeded in Eurasia, 4 % in the
  Americas.
- **Shared beasts.** Landmasses joined across shelves shallower than about 120 m (the ice ages' land bridges: Beringia,
  Sunda) share their beasts.
- **Consequences.** A landmass with no heavy draft beast farms by hoe: no plough, no milk. That is the deepest contingent
  difference between Earth's Old and New Worlds, and it follows from the world's own geography.
- **Optional.** People's first arrival: the later it was, the more large beasts were lost (genera lost: Africa 21 %,
  Eurasia 35 %, North America 72 %, Australia 88 %).

### 4.2 Hearths

A **hearth score** per region (~300 km), as the product of smooth factors (`domestication.md` §1, §6):

| Factor | Grounding |
|---|---|
| **Larder variety**: how many archetypes' wild ancestors grow within reach | Vavilov's centres of diversity |
| **Seasonality** | Matranga 2024: 6 of 7 independent inventions sat in or beside the planet's most seasonal 7.5 % of land; a 10 °C wider (cut-off) range started farming ~1,000 years sooner |
| **A moderate temperature spread**: monthly SD near 7–8 °C, falling off either side | Ashraf & Michalopoulos 2015 |
| **Productive land** | Kavanagh 2018: every centre saw rising forager density first — surplus, not need |
| **Hilly flanks**: high relief within ~5 km, low within ~50 km | Matranga: a 1,000 m mountain within 50 km delayed adoption ~500 years |
| **Water within ~20 km** | Nearly every centre |
| **Foragers not too rich**: rich, storable wild food lowers the score (cold upwelling coasts, salmon rivers, nut-mast forests) | Pacific Northwest, California, Jōmon |

Expected result: two bands. One is 25–40° with strong seasons; the other is 5–20° with a long dry season. None should fall
poleward of about 45°, in desert cores or in ever-wet rainforest cores; their margins grow vegeculture.

**Ignition in time.** Each candidate region gets a start date drawn at random (exponential), at a rate set by its score
(its own seeded stream; `farm=` re-rolls it). The best usually start first, not always.

**Receivers, not rivals.** When farming spreading from an earlier hearth reaches a candidate before its date, the
candidate never starts on its own: it adopts. Independent centres had no farming neighbours when they began (Larson 2014),
and diffusion beats invention (Richerson 2001). A receiver still domesticates the wild ancestors growing there that the
arriving package lacks. This is **secondary domestication** (rye and oats: weeds of the fields that thrived where wheat
failed), and each one is a strain of its own.

So the count and the spacing emerge. On an Earth-like planet that should be about 7–14 hearths, roughly one per 5–12 M km²
of land. They should come in **pairs 700–1,300 km apart across a habitat contrast** (millet beside rice, tubers beside
cassava), with **groups 2,400–5,000 km apart** (`domestication.md` §4.2). This replaces C4's `hearthsMax`, `apartKm`,
`apartCost`, `domesticMin/Max`, `perCrop`, `perCropMax` and `domesticLeast`.

**What a hearth domesticates.** It takes the archetypes whose wild ancestors grow in it (1–4), over 1–4 thousand years:
cereals 2–4, millets 1–2.
- **Beasts come after.** Village scavengers come first (pig, fowl). Prey animals follow at hearths that have them. Riding
  and pack beasts come 2–5 thousand years later, at the herders' fringe (horse on the steppe, camel at the oasis).
- **"Every staple from at least one hearth"** (the owner's C4 rule) is kept softly: secondary domestication supplies a
  staple wherever its wild ancestor meets farmers (decision 4).

### 4.3 The spread, in years

**One search in time per strain**, from its hearth's start date: a Dijkstra over the 0.5° grid, reusing 21c4623's `flow`,
`neighbours` and `seaDistance`. The step costs are **years a km** (crops research §4; Fort 2026; Silva & Steele 2014;
Davison 2006):
- **Overland:** 1 km a year over land the crop grows on; slower over hills unless they are its niche.
- **Rivers and coasts:** ×2.5–5 faster along rivers, ×5–10 along coasts, but only while the coast stays in the crop's
  climate.
- **Sea:** hops up to 300–450 km at 8–10 km a year; open ocean more than ~1,000 km from land never crossed, as before.
- **Climate edges:** seed crops stall 1–2 thousand years, then cross as an adapted strain. Clonal crops do not cross; a
  better-suited strain must come instead.
- **Foragers:** speed × √(1 − m), with m the local foragers' richness (Fort's model). Rich coasts can refuse farming
  outright; C6b's 10× hold stays.
- **Through farmers:** ×3–10 faster where farming already is. Crops move quickly between farmers (Europe's millet crossed
  the continent in 1–2 centuries).
- **Competing strains:** strains of one archetype compete. The first to arrive keeps a place unless a much better one,
  at home there, comes from near (C4c's rule, now in years).

**The age of farming:** "Farming began N years ago" (decision 3: 3,000 · 6,000 · 10,000, the default). Land not yet
reached is the foragers' or herders'. The default reaches nearly everything reachable, as the owner's "osmosis over a very
very long time" asked.

**Outputs per 0.5° cell:**
- each archetype's strain there, and when it came;
- when farming came at all;
- each beast, and when it came.

These are cached per moment, techniques, roll and age: about 1 s the first time, ≤ 0.5 s for a re-roll. A worker takes
over if it runs longer.

### 4.4 Variants, and the crops that stack (developer, 2026-10-31: "what about the actual variants of crops domesticated and where they spread by type? which are competitive/more mutually exclusive in an area vs those that can intermingle (spices fruits, etc)")

The mock-up's **Crops** tab shows this.

**Two behaviours.** Farming diets have a starch core, a pulse beside it and a fringe of flavours (Mintz & Schlettwein-Gsell 2001, the core–fringe–legume pattern).
- **Field staples compete** for one field and one season.
- **Everything else stacks.**

**Variants.**
- Each hearth's strain of an archetype is a variant at home in its hearth's climate (`homeMatch`: 0.55–1 by temperature and wetness).
- Each variant spreads by its own search.
- Shares per place ∝ (at home × e^(−lateness / 3,000 years))^6. That is nearly winner-takes-all; a second variant is kept when it holds ≥ 25 %. On Earth, free-threshing wheat displaced emmer and einkorn over millennia, and maize displaced eastern North America's goosefoot, knotweed and maygrass after ~900 CE.
- Variants are named by Earth likeness from their home's climate, each name once per archetype ("barley-like", "teff-like" for a highland home…).
- Their traits come from the same climate: frost-hardy, drought-hardy, long-season, quick-ripening, highland.
- Real names stay the later layer on `crops`.

**Two seasons.** Summer and winter are two slots and do not compete. A winter grain follows a summer crop where the coldest month is ≥ −6 °C and the warm season is ≥ 7 months. A summer crop follows a winter grain where the warm season is ≥ 8 months. The map stripes the second crop.

**Pulses.**
- Each primary hearth with the partner staple domesticates its pulse 300 years plus ~700 years (random) after that staple: cool pulse with the cool-season grains, beans with the warm-season grains, monsoon beans with paddy, savanna peas with roots.
- They travel with the package and drop off at climate edges.
- Where two do equally well, the map stripes them.

**Orchards.**
- Oil tree, vine, oasis palm, chill fruit, nut tree, grove fruit, each with its climate rule (frost, chill, the vine's season, heat with water).
- First grown 3,000+ years after farming came.
- They spread only through farmed land (×3 through farmers, ×0.12 beyond) and are counted per place. One in three may have a second, far home.

**Spices.**
- Bark, pepper vine, buds, roots, seeds, incense, each with a narrow niche.
- Capped at ~900 km from home: each is a place's specialty, the input to trade later.

**Gardens.** Nine kinds (bulbs, cole crops, gourds, hot pods, melons, greens, fruiting vegetables, herbs, root vegetables), spreading fast between farmers. They count only toward **Variety**: how many crops a farming place grows. Variety fades with distance from the hearths and across seas, as Polynesia's canoe plants thinned from ~60 to ~6.

**Cost in the mock-up.** About 0.45 s per history (65 variant spreads and 25 minor-crop spreads on the 1° grid); about 170 ms to recompute the views.

### 4.5 Real names, founders, pulses by season (developer, 2026-10-31, after the Crops tab)

Prompts:
- "way more specifics … with 'real' spices. I do like the copout of calling things 'X-like'"
- "similar things should be domesticated in areas closer and with other items that were domesticated NEAR each other in the real world (though should still be randomized) … a toggle to control how aggressive that pull is (some people will not want the equivalent of new and old world mixing)"
- "nearby hearths should likely be drawn to have similar and more historically contingent crops"
- "beans … american beans definitely grow further in colder regions … lentils are big in india which is very hot"
- "apples are not spreading that much?"
- "a couple of varied and far apart croplands that start relatively early … 2-4 minimum that are very early"

**Earth likenesses** (`mockup/names.js`). This is a naming layer only: it never changes the history.
- **The regions.** 18 Earth regions where crops were first grown, each with a centre, a climate (mean °C, wetness, height, winter share of rain) and a side of the oceans (Afro-Eurasia with the western Pacific, or the Americas).
- **Sites.** Every place crops were first grown is a site: each hearth, each secondary centre, each minor crop's home.
- **Each site's likeness.** A site is "like" one region, plus a runner-up when close. It is chosen by:
  - climate fit;
  - a seeded Gumbel nudge;
  - a pull toward its neighbours' likenesses. Neighbours are weighted by e^(−(km / 2,200)²), halved across landmasses. The pull counts how near the two regions are on Earth (1 within 1,500 km → 0 at 6,000 km), plus 0.25 if they are on the same side of the oceans, or a penalty if not.
  - The fit is settled over a few sweeps, earliest site first.
- **The Earth likeness control** sets the pull:
  - **Mix freely**: pull 0.
  - **Regional** (the default): pull 1.4, other-side penalty 0.35.
  - **Keep worlds apart**: pull 3.2, penalty 2, so Old and New World never mix among neighbours.
- **Re-roll names** redraws likenesses and names alone (its own seeded stream).
- **Each crop's name.** From a catalogue of about 200 real crops, each tagged by home region and, where it differs from its home, its own climate. The pick scores:
  - nearness to the site's region and runner-up;
  - climate fit;
  - the side-of-the-ocean penalty;
  - a seeded nudge.
  
  Each name is used once per list where it can be, then II, III. Examples: emmer-, teff-, quinoa-, buckwheat-like grains; cinnamon-, cassia-, clove-, nutmeg-and-mace-, vanilla-, cardamom-, cumin-, saffron-, Sichuan-pepper-, frankincense-like spices.

**Founder hearths** (`world.js` runHistory). Each planet gets 2–4 founders, more on more land (land area ÷ 40 M km² + 1).
- They are the likeliest regions, nudged at random. Each is at least 3,500 km from the others, and each leads with a different staple where it can.
- Each one's first crop comes within ~100–1,500 years of the start.
- Once farming, a founder takes up a wider share of its wild larder: niche threshold 0.16 instead of 0.25, with a faster know-how rate.
- They show ringed on the pins and in the timeline.

**Pulses by season.** Each pulse's range comes from the months (counted in the finish's monthly loop), not the year's mean:
- **Cool-season** (lentil, pea, chickpea, faba): months 5–25 °C, living on the soil's stored water. That is the winter of hot lands and the summer of cold ones.
- **Warm-season beans**: a frost-free run above ~15 °C, so they reach cool summers.
- **Monsoon beans**: those months warm and wet.
- **Savanna peas**: hot and drought-hardy.
- A summer pulse and a cool-season pulse are two slots that do not compete, striped where both grow (India's mung, then lentils).
- Catalogue climates per pulse: common and runner beans cool; lima, tepary and peanut hot; lentils, chickpeas and grass peas warm-land winter crops.

**Wider spread of orchards and gardens.**
- Orchards are first grown ~2,000 years after farming came (was 3,000), then move ×5 through farmed land.
- Every crop but the spices is carried across unsuitable patches between farmers, garden to garden.
- A landmass with no home for a garden or orchard crop yet domesticates its own more readily (odds 0.85), up to four homes, as Earth's Old and New World gardens differ.
- On the default world, gardens now reach 60–85 % of the farmed land that suits them by 10,000 years (was ~35 %), and chill fruit ~80 %. Spices stay home.

### 4.6 Every crop its own, popularity and nourishment, realism (developer, 2026-10-31)

> "many of the most 'popular' fruits and vegetables should be more or less likely to show up in the world. So some popular
> weighting, plus the weighting on how nutritious things are. and settings for how 'realistic' vs 'random' it should be.
> Also, for the variety, I think we should err on the side of having a ton of things that can spread all over … make sure
> those visualizations work. Also for the actual site we should have a link out to wikipedia for each crop too"

**Every catalogue crop is its own crop** (`mockup/items.js`), about 225 beside the staples:
- pulses, fruit and nuts, vegetables and herbs, and spices;
- new kinds: leaf and bean drinks (tea-, coffee-, khat-, coca-, mate-, tobacco-like), shade-tree stimulants (cacao-, kola-, areca-, guaraná-, kava-like), and oil, fibre and dye crops (flax-, hemp-, cotton-, sunflower-, rapeseed-, indigo-like…).

Each crop has:
- **its fit**: its kind's niche × its own climate, kept as a byte per history cell;
- **whether this world grows it**: a logistic draw, likelier the more popular and nourishing it is on Earth, as the realism weighs it;
- **its home**: the farmed region that suits it best and is most like its Earth home (with a seeded nudge); sometimes a second home on another landmass;
- **its own spread**: carried between farmers. Spices are kept within ~900 km. A popular crop moves a little faster.

**Popularity and nourishment** are rough 0–1 judgements per crop (`names.js`; to check against FAO output later). They weigh both the staples' variant names and whether each other crop is grown.

**Realism** (Earth-like · Balanced · Anything goes) sets how much popularity, nourishment and Earth's geography decide against chance:

| | Earth-like | Balanced | Anything goes |
|---|---|---|---|
| Popularity weight | 1.6 | 1.0 | 0.12 |
| Nourishment weight | 0.8 | 0.5 | 0.08 |
| Earth-home pull | 1.8 | 1.1 | 0.25 |
| Noise | 0.3 | 0.6 | 1.4 |
| Chance of a second home | 0.25 | 0.45 | 0.65 |

Earth likeness stays separate: it sets the pull between neighbours.

**On the default toy planet (Balanced):**
- about 180 of 225 crops are grown;
- a farmed place grows ~17 crops on average and up to ~60 with the staples;
- the whole crops layer builds in ~0.2 s, and a realism change takes ~0.35 s.

**The views:**
- **Picker:** Field crops · Pulses · Fruit & nuts · Vegetables · Spices · Drinks & fibres · Variety.
- **Pulses and Spices** are coloured by their leading crop's kind. The other kinds are count maps. Variety counts every crop, staples included.
- **The key:** the realism and likeness controls, a **crop finder** (type any crop this world grows), the crops leading on the most land as chips, and each kind's mean and most per place.
- **A crop card:** where and when it was first grown (diamonds), its share of the land, its real Earth home, popularity and nourishment as dots, and a **Wikipedia link**. Its map hatches where it would grow but never came.
- **Variant cards:** the staples' variants get the same card.
- **A click on the map** lists every crop grown at that place, grouped by kind, each linked to Wikipedia (a Special:Search URL, so an exact title lands on its article).

## 5. Culture (per pixel, from the land and the history)

### 5.1 Way of life: the food system

Today's Lifestyle becomes ten classes plus uninhabited:
- **Grounding:** Whittlesey's pre-industrial types, with Dixon's names.
- **Scoring:** each class lines up with ArchaeoGLOBE's land-use classes and D-PLACE's dominant activity (EA042), so it can
  be scored on Earth.
- **Inputs:** each comes from what the land model already computes (harvests, pasture, water, fish), the history (what
  came, whether there is a plough beast) and ET.
- **Compatibility:** each class collapses to Farming · Herding · Gathering. The Lifestyle codes and export stay the same,
  and the three-way view stays as a chip.

| # | Class | Recipe (smooth scores; the best one wins, a close second striped) | Lifestyle |
|---|---|---|---|
| 1 | Paddy farming | Paddy grains lead: warm, wet, level ground; buffalo, pigs, ducks, fish ponds | Farming |
| 2 | Irrigated valleys | Arid by rain, farmed by flood or canal water (the Nile, the Indus) | Farming |
| 3 | Plough & flocks | Cool-season grains with a plough beast and sheep or goats; winter-rain or mild lands; trees on the slopes | Farming |
| 4 | Mixed farms | Cool-season grains with cattle and pigs; humid, short summers; ET ~12.75–15 | Farming |
| 5 | Hoe farming | Grains or roots without a plough beast (none on the landmass, or the fly belt); bush fallow | Farming |
| 6 | Forest gardens | Roots and trees, shifting cultivation in the wet tropics (C3's long fallows) | Farming |
| 7 | Highland farming | Terraces; cold-hardy tubers and grains above ~2,000 m in the tropics; camelids or yak | Farming |
| 8 | Grain & herds | The dry margin, 300–700 mm (the 300 mm isohyet is pearl millet's limit) | Farming and herding |
| 9 | Nomadic herding | Pasture only, a growing season under ~60 days; tinted by the beast | Herding |
| 10 | Settled foragers | Rich fish or mast within reach in the storage band (ET ~10–15.5); ~10× mobile foragers' density | Gathering |
| 11 | Mobile foragers | Hunters below ET 12.75, gatherers above (Binford; D-PLACE: no gathering-dominant group below 11.5) | Gathering |

"Hoe farming" comes from the history. That is what makes a continent's farming differ from its neighbour's in a way the
climate alone never would.

### 5.2 Staple food

Kept. By default it shows the staple **as it came**; the **Best possible** chip shows today's map.

### 5.3 Animals (new)

**The leading beast per place**, with its role marks (draft, mount, pack, milk), from the habitats of §4.1, filtered by what
came.

**A disease belt** is hatched where a tsetse-like fly would live (`food-systems.md` §4.1). Its score is high where:
- the year's mean is 19–30 °C and the warmest month under 32 °C;
- rain is over ~500–600 mm with a wet season;
- the land is wooded and below ~2,000 m;
- there is no frost (the score fades out as frost comes in).

Inside it cattle and horses fail and goats, pigs and fowl hold; there is no plough and no milk. That is the reason half of
tropical Africa's herds live on its highlands.

**Milking** spreads with the beasts that were milked at their hearth (one seeded stream per beast). The fresh-milk
drinkers follow the dairying (Holden & Mace 1997).

### 5.4 Kitchen (later: the culture layer, per §0)

Each category gets a smooth score and the leading one is shown, a close second striped. They are named as archetypes, and
the readout gives Earth's likeness. Rules and evidence grades are in `food-culture.md`.

- **Cooking fat:**
  - tree oil (olive-like: coldest month 3–13 °C, a winter chill, dry summers)
  - butter (dairy, cool)
  - ghee (dairy, hot)
  - lard (pigs, settled, wooded)
  - tail fat (dry herders)
  - seed oil (sesame-like when warm, mustard-like when cool)
  - palm and coconut oil (the wet tropics)
  - sea oil (cold, rich coasts)
- **Drink:**
  - grain beer
  - fruit wine (vine-like: a growing season of 12–22 °C, ≥ 850 degree-days over 10 °C, coldest month ≥ −4 °C, not hot
    and wet)
  - rice wine
  - palm wine
  - root beer (cassava-like)
  - fermented milk (the steppe)
  - mead (cold forest)
  - sap wine (dry highlands)
  - leaf, bean and cacao-like stimulants as chips
- **Sweet:**
  - honey (the default)
  - dates (hot oases)
  - cane (frost-free and wet)
  - palm sugar
  - tree sap (maple-like: freeze-thaw springs)
  - fruit syrup
- **Flavour:**
  - tropical aromatic
  - seed & resin (dry lands)
  - herb garden (summer-dry lands)
  - fermented savoury (monsoon paddies)
  - pungent roots & seeds (cool lands)
  - salt & smoke (the boreal north)

  An intensity shade grows with warmth. That correlation survives Bromham et al. 2021, but the cause is not germs, so the
  view never says it is.
- **Preserving:**
  - frozen
  - freeze-dried (high frosty dry seasons)
  - wind-dried (cold dry coasts)
  - sun-dried
  - smoked (humid with trees)
  - salted (needs salt: Geology's salt, solar-salt coasts, salt pans)
  - fermented fish (monsoon paddies with fish)
  - pickled

These give Earth's belts unasked: the olive and butter lines follow the frost limit, wine and beer the vine's season, and
the ghee/butter split follows heat.

### 5.5 Calendar (new; a picker of three)

- **Harvest month:** a ring of hues for the twelve months, grey for "all year" (ever-wet roots). Hemispheres flip, and
  monsoon harvests stand apart.
- **Lean months:** the 2–3 months before a single yearly harvest (Vaitla 2009). They shrink with two harvests, with roots
  kept in the ground, and with fish or herds.
- **Harvest risk:** drought at the dry edge, a failed monsoon, frost at the cold edge, flood.

The readout reads: "Sown Oct · harvested May · lean Mar–Apr · a harvest festival in May". No other generator does this.

### 5.6 Specialties (later: the culture layer, per §0)

- **What a region is known for:** each region's signature good is the one with the highest local suitability × its
  rarity in the world, raised when neighbours within ~500–1,000 km lack it.
- **Goods:**
  - spices on a few very wet tropical islands and escarpments (as Banda's nutmeg)
  - wine and oil
  - dates
  - sugar
  - stimulants
  - incense (dry slopes beside a monsoon)
  - furs (conifer forest, coldest month ≤ −10 °C)
  - honey and wax
  - dried fish
  - horses
  - wool
  - cheese
  - grain surplus (river plains)
  - salt, from the Geology tab
- **Presentation:** pick one good to see it everywhere; icons appear only when zoomed in.

### 5.7 People

**As it came:** each place by its way of life, by the age of farming.

## 6. The views

| View | Picker / chips | Shows |
|---|---|---|
| **Farmland** | Farmland · Soil · Season; the techniques | Today's three views in one |
| **Origins** | When farming came · From which hearth · Wild larder | Isochrone bands with thin contour lines; each hearth's lands in its colour; numbered hearth pins (the `#mapPins` overlay, re-wired from 21c4623) |
| **Way of life** | Simple (farming · herding · gathering) | §5.1 |
| **Staple food** | Best possible; each food alone | §5.2 |
| **Animals** | Each beast alone; Milk | §5.3 |
| **Kitchen** | Fat · Drink · Sweet · Flavour · Preserving | §5.4 |
| **Calendar** | Harvest month · Lean months · Risk | §5.5 |
| **People** | Best possible; the techniques | §5.7 |
| *Specialties* (later) | Each good alone | §5.6 |

Eight views instead of six, since three of today's fold into one. That is more to read, which is the tradeoff against
ease of use. The pickers keep the bar short, and every view opens on its plainest form.

Design rules (`worldbuilding-and-games.md` §2.10):
- at most ~8 hues to a view
- a chip shows one class alone
- stripes for a close second
- hue for the kind, lightness for the amount, never both
- the hover says *why* ("two harvests: monsoon paddy, then a winter grain; river silt")
- icons only when zoomed in
- phones: pickers in the layer sheet, chips 44 px

## 7. Engineering

- **Files:**
  - `farming/` stays as the land.
  - New `farming/history.js`: larder, hearths and spread, from 21c4623's spread.js helpers.
  - New `farming/beasts.js`, `farming/kitchen.js` and `farming/calendar.js`.
  - `living.js` grows the food systems.
  - `farming-view.js` is split per view if it grows past ~600 lines.
- **Saves:** nothing new is saved but the calendar bytes (and, if added, the tree crops' harvests). Both are data added,
  so an older moment is detailed again for them. **Links:** `farm=` (the roll); `age=` when not the default.
- **Codes, appended only:**
  - STAPLES: tree crops → 8.
  - LIFESTYLES: unchanged.
  - New FOOD_SYSTEMS, BEASTS, FATS, DRINKS, SWEETS, FLAVOURS and PRESERVES enums, each appended to only (they are the
    exports' indices).
- **Scale invariance:** physical units throughout; history on a grid fixed in degrees; culture per pixel of the picture.
  The same at 160K and 2.5M.
- **Seeded streams, each its own:** ignition, each landmass's beasts, milking per beast, strain ties (`seededStreams`
  memory).

## 8. Checks and an Earth benchmark

- **`v2/tools/check-food.mjs`** (extending check-farming):
  - 160K and 640K draw the same patterns;
  - 5–15 hearths on the test planets, none poleward of 50°;
  - the budgets met;
  - fishing coasts where they should be;
  - a landmass without a plough beast farms by hoe;
  - the calendar flips between hemispheres.
- **`tuning/farming/earth-food.mjs`** runs on Earth's observed 1° climate (Beck 2023, already fetched for the climate
  checks). It scores, with near-match credit like the Köppen check:
  - (a) the **hearth score**: are Earth's 14 centres in its top ~10 % of land (AUC)?
  - (b) the **spread from Earth's centres, in years**, against dated first farming (Pinhasi 2005's 735 European sites;
    licence to check);
  - (c) **ways of life** against ArchaeoGLOBE at 1500 CE (CC0: fetched, a derived table may be committed), and against
    D-PLACE's EA042 (CC BY-NC: fetched only, never committed; weighted by region, since 41 % of its societies are
    African);
  - (d) **beasts** against EA040 (the fly belt, the camel belt, reindeer);
  - (e) the **kitchen's lines as places**: olive in Seville and not Paris; wine in Bordeaux and not Lagos; dates in
    Baghdad and not Java; maple in Quebec and not Paris.
- **Earth is not gospel:** parameters stay within their literature priors, tuned on the whole Earth, with the test
  planets checked too.

## 8b. F1 built (2026-10-31): the Calendar

**What it adds:**
- **Harvest months in the finish:** `farming.months[group]`, two bytes a place, worked out in farming.js `kindHarvests`. A winter grain gets the spring rule; roots dug as needed are taken all year. It is data added, with no version bump.
- **`farming/calendar.js`:** the neighbourhood's circular mean, the lean months and the harvest risk.
- **The Calendar view:** a chip each for harvest month, lean months and harvest risk; a readout line; an export row (the colour map plus three data maps); a tutorial line.

**Earth:** `earth-farming.mjs` gained 15 harvest places.
- First run: 3 of 15 right. Every winter grain read "all year" (no gap in a winter sleep), and most crops ripened about a month early.
- After the fixes: 14 of 14, plus one known miss. The fixes: ripening at the whole cycle plus half a month, a winter grain counted from the end of its winter, and `piecemeal` roots taken all year.
- The known miss is the Ethiopian highlands. Their two rainy seasons let the model sow at the short belg rains.

**The planet:** `check-farming.mjs` 47 of 47 (F1: 7 checks).
- The calendar agrees within a month between 160K and 640K on 97 % of the land farmed at both.
- The hemispheres mirror: 88 % of the north's mid-latitude cool-season grains reaped May–Sep, 94 % of the south's Nov–Mar.
- 85 % of farmed Af land is harvested all year.
- The risks: low 49 %, drought 16 %, failed rains 7 %, frost 17 %, flood 11 %.
- The page reads the neighbourhood in 170 ms.

**Saves:** `check-save` passes. A kept planet saved before the months is not offered the Calendar export.

**Folded away (developer, 2026-10-31).** The developer asked what the Calendar was for. Lean months and harvest risk read
the staple alone, but a hungry gap depends on the whole mix: roots left in the ground, stored pulses, a second season's
crop, fish and herds all fill it. The decision:
- **Kept:** the harvest-month bytes, `placeMonth`, `calendarGround`, `calendarMonth`, the earth places, and F1's month checks
  (now 5). The readout's **Harvest** line gives the neighbourhood's month.
- **Removed:** the Calendar view, its export row, the tutorial line, `leanMonths`, `harvestRisk` and `RISKS`.
- **Later:** **Food security**, rebuilt from each place's actual crops once F4's spread knows them.

## 8c. F2 built (2026-10-31): Way of life and Animals, best possible

**What it adds:**
- **`farming/beasts.js`:** eight beasts with roles, wild homes and keeping, the leading beast, the plough, the fly belt.
- **living.js:** `FOOD_SYSTEMS` (11 and uninhabited) by gates taken in turn; `measuresAt` reads a place's measures off
  the picture (no new bytes: heights, the climate's kept year, the cover's biome).
- **The views:** Lifestyle becomes **Way of life** (the food systems; the old three under a Simple chip) and a new
  **Animals** view (the fly belt hatched); readout lines; export rows; tutorial; READMEs.

**Tuning on Earth** (`earth-farming.mjs`, heights given per place, the fly kept to Africa): from 14 misses to none.
- The harness passed no foods to the farming (the gates read zero).
- Hoe before paddy: without a plough, paddies are hand-worked (West Africa).
- Cattle and sheep "too wet" only where warm (a cold wet coast was barred from cattle, so it hoe-farmed).
- Reindeer need hard winters, not just short summers (Cfc and Dfb had them).
- Cattle off rugged heights (the Zagros's goats); the llama's puna at ~8 °C; the fly below ~1,500 m (Kenya's highlands).
- The pig led every humid farm; now halved where a plough beast is kept. The buffalo's wallows include the paddies,
  north to the Yangtze, lowland only.

**The planet** (`check-farming.mjs` 56 of 56, F2: 11 checks): shares within a point between 160K and 640K.
- Ways of life: plough and flocks 15 %, mixed farms 17 %, hoe 16 %, grain and herds 12 %, nomadic 26 %, paddy 2 %,
  irrigated 3 %, forest gardens 2 %, highland 1 %, foragers 5 %.
- Beasts: cattle 34 %, small stock 27 %, camels 15 %, pigs 9 %, reindeer 4 %, horses 4 %.
- **The fly belt covers 20 % of this planet's land** (its tropics are large): every landmass has the fly for now, so
  hoe farming fills the tropical lowlands that are not forest gardens. On Earth only Africa has it. F3's landmasses
  should make it luck (with "Fewer gaps"), and `L.flyHere` is the input waiting for it.

**Browser:** both views render; chips (one alone, Simple) work; readout lines; no console errors.

**Speed** (developer: "super laggy"). Every change below keeps the output byte-identical; hashes were checked on every view and chip, at two widths, and the Earth check's output is unchanged.
- **The legend's tally, the people count and the harvest neighbourhood are keyed on the techniques only.** They used to rerun on every look chip (one alone, Simple, Classes).
- **The ways of life and beasts are worked out once per moment and techniques** (`waysOf`), at the farming picture's own width, which the page paints at. The legend and every repaint read them from there.
- **The Animals paint skips the farming step**, except where a buffalo is asked for.
- **foodSystem no longer makes closures per place**, and **farmPlace no longer raises to the power 1**.
- **On the page (a 4096-wide picture), the main thread is blocked for:**
  - each view switch or look chip: ~0.8 s (Staple food, People, Way of life), was ~1.7–4.5 s;
  - Animals and its chips: ~0.5 s, was ~3.7 s;
  - the first Way of life of a moment: ~3 s;
  - a technique change: 1.2–2.4 s.
- **The ~0.8 s floor** is the farming and people work every repaint redoes per pixel.

**The store** (developer: "Why do we recalculate everything again?" … "half precision is ok"). `evolution/farming-store.js` works out what each land pixel is once per moment and techniques, and keeps it at half precision. Every view, chip, zoomed-in tile, the legend's shares and the data maps read it; only the hover readout still works its one place out in full.
- **What is kept:** 16-bit 0…1 values; people as log10(1 + people) to 1/16384; an index of a bit per pixel and a count per 32.
- **Thresholds stay exact:** farmland classes are kept as classes, and a beast's keeping keeps its side of the 0.15 floor. The fly belt leaves cattle and buffalo exactly at that floor, and a first try lost a buffalo region to rounding.
- **Accuracy:** at the page's own width, every view is within one shade of the exact pictures, on at most 0.1 % of pixels; the legends are identical. Zoomed in, each map pixel is one colour (the gatherers' fish were read per screen pixel before), so the tiles match the globe.
- **Speed on the page:** each view switch or look chip ~0.35–0.4 s, against ~0.23 s for Terrain and ~0.37 s for Köppen: the page's own repaint is the floor now. A chip's one-alone values cost ~0.4–0.7 s the first time. A technique change, or a moment's first Food view, ~1–2.5 s once.

## 8d. F3a built (2026-10-31): tree crops, the wild larder, landmasses' luck, hearth odds

F3 is split in two, since hearths only emerge with the spread (a candidate farming reaches first never starts): **F3a**
(this) and **F3b** (hearths igniting, the spread engine, pins, When farming came).

**What it adds:**
- **Tree & palm crops** in the finish (staple 8, group `trees`; data added). Perennials pause through dry or cool months
  (≤ 2 for bananas, Harris/Denham's ≤ 2 dry months for clonal crops), die where the year breaks the run, count their
  year's growth over their cycle, take no second crop, ignore waterlogging (sago), and bear dates only under a dry sky.
- **`farming/larder.js`** (the crop archetypes' wild niches, ported from the mock-up) and **`farming/history.js`** (the
  0.5° ground: measures, larder, landmasses across shelves < 120 m, each landmass's luck, hearth odds).
- **The Origins view:** Wild larder (variety, or one archetype alone, a beast hatched where its landmass lacks it) and
  Hearth odds; Re-roll and Fewer gaps chips; the five biggest landmasses' luck in the legend; readout lines.
- **The fly's luck** in Way of life and Animals (the open question from F2). The fin carries the world's seed and the
  moment's time.

**Tuning:** the first tree crops took 7 % of the planet, including savannas with five dry months, until:
- the pause was capped at two months;
- a broken year was made to kill the grove;
- date palms were given a dry sky.

At that point they had fallen to 0 %, because the annual crops' harvest staircase undercounted a continuously fruiting
stand. Counting growth over the cycle brought them back to about 1 %: first in Sepik and the New Guinea highlands, a close
second in Congo. Wild rice needed the Pearl River's ever-wet wetlands too.

**Speed:** the ground took ~0.6 s until the 330 km window maximum became a monotonic queue and the sampling fixed
(~0.25 s). Hearth odds agreed poorly between details (53 % of the top tenth) until relief was read over the
neighbours' mean heights (rank correlation 0.95).

**Earth:** 212 of 212 places (14 larder, 5 tree crops).

## 8e. F3b built (2026-10-31): hearths and the spread

**What it adds:**
- **`farming/hearths.js`:** candidate regions, ignition, founders, know-how, contact, and the spread in years (a port of the
  mock-up's `runHistory`).
- **The ground's new fields:** each crop group's fit, each beast's keeping, rivers and coasts, the foragers' richness, and
  each sea cell's distance from land.
- **Origins' new looks:** **When farming came** (years after the first, a line each thousand) and **From which hearth**
  (each primary hearth's lands, paler the later).
- **Hearth pins:** numbered in the order they began, founders ringed in gold, placed over the planet by a restored
  `screenAt`.
- **Readout and export:** "Farming came" and "Hearth N" lines; the Origins export gains when farming came.

**Tuning:** the spread at the mock-up's 0.55 km a year covered 97 % of the farmable land by 5,000 years. Slowing it didn't
cut coverage much: fewer places were absorbed, so more hearths ignited (up to 23). On a world of ~160 M km² with a dozen or
more hearths, near-full coverage by 10,000 years is plausible (Earth's farming covered most farmable land by ~500 CE), so
the base speed is 0.4. Results:
- 12–19 hearths, all in the top odds;
- 5–10 % of the land reached within 1,000 years.

**The sea's distance from land** first walked the coast as a plain front, revisiting cells; as a Dijkstra it dropped from
~1 s to a few milliseconds.

**Browser:** the pins sit on their hearths' territories on the globe and on the map. Two fixes:
- The pins layer was placed under the panels.
- The hearth list in the legend wraps.

**Owner's check, two asks (2026-10-31):**
- *"A lot of farming cropping up … cap it at like 12 and skew it closer to like 8 on average and spread them out"* — and
  *"not just minimally placed but … spread across the world evenly, weighted by likelihood"*. The world rate fell to ~15
  first ignitions per 8,000 years. A region whose crops ignite with 12 hearths already begun, or within
  0.6 × √(farmable land ÷ 8) of one (~2,300 km here), waits to be reached instead. The likeliest regions still ignite
  first, so the spacing follows the odds. Over 16 rolls: a mean of 7.7 hearths (6–9), at most 12, the nearest pair
  ≥ 2,300 km apart, a Clark–Evans ratio ~2.3 (random 1), 160K's mean 8.5, and ~98 % of the farmable land reached by
  10,000 years.
- *"A lot of the map modes … look low res on farming"*, then *"way of life is crazy blocky"*. The Food views drew the
  farming picture's pixels as blocks when zoomed in (the detail tiles). Now:
  - Each view's colours are worked out once per pixel, and zoomed in they are *voted* at each drawn point: each pixel's
    say is a Gaussian ~0.6 px wide, shades of one colour count together, and the edge is eased over a drawn pixel. So
    boundaries curve, a lone speck goes, and patches of two pixels or more stay.
  - The stripes and the fly's hatching are drawn at the screen's pixels (a first version had baked them into the
    picture's pixels: chunky zigzags).
  - Voting at the picture's own size too would cost ~0.3 s a view at 4,096 px, since 60–90 % of the land's pixels sit
    next to another colour, so it is not done there.
  - The few seconds before the detail tiles come still show the picture magnified, as every view does.

**Not yet (F4):** every other view "as it came", the age chips, the re-roll in links, and the Earth check of the odds
(its centres' AUC).

## 8f. F4a built (2026-10-31): the views as it came

F4 was split: **F4a** shows the views as it came; **F4b** puts the re-roll and the age in links, and adds the Earth checks
(Europe's dates, the hearth odds' AUC).

**What it adds:**
- **The age chips** on Staple food, Way of life, Animals and People: **10,000 years** (the default, per §0), **Full spread**
  and **Best possible** (today's maps). Farmland, Soil, Growing season and Origins stay the land's own.
- **What had come** (`farming-store.js` `cameOf`/`cameAt`): the run's arrival times (`best`, per archetype) read at each
  place between the 0.5° cells, as When farming came reads them, so the fronts are smooth.
- **Each place worked out with only what had come:**
  - crops that had not come are zeroed before the staple is chosen;
  - the herds' pasture is scaled by the best come herd beast's keeping;
  - beasts that had not come are kept nowhere. So hoe farming wherever no plough beast came, as in the Americas.
- **Words:** the legend's head says when ("10,000 years after farming began"), a note explains, and the readout lists
  what would grow or be kept well but had not come.

**Results on the check planet (one big landmass):** the crops reach almost everywhere they grow within 10,000 years, so
staples barely change. The beasts do change: no buffalo was ever tamed and few horses, so cattle lead more (a leading
beast's share moves up to 11 points). Places where no crop had come (14 % of the land: deserts, tundra, the unreached)
herd or gather. Worlds of several landmasses differ more: a continent without wild rice or a plough beast keeps that gap.

**Speed:** what had come takes ~15 ms an age; the stores as quick as the land's own (one pass for the ways and the
places together). In the browser at 4,096 px a new age takes ~2.3 s (Way of life), a kept one ~0.3 s, as a look chip does;
the last three of each store are kept (the land's own and two ages, ~20 bytes a land pixel each), so the chips switch
freely once each has been seen.

**Owner's check:** "When farming came and From which hearth are still blocky": they read the 0.5° grid as the nearest
cell (jittered) or bilinear with "never" only where all four corners were. Now a Gaussian vote by class over the 4 × 4
cells round each point (σ 0.7 cells): reached against never, or hearth against hearth, the time blended in the winner's
cells, the lines each thousand drawn from its gradient (~1 px at any zoom). What had come (cameAt) reads the same way.

**Not yet (F4b):** the re-roll and age in links, the Earth checks.

## 8g. F4b links, F5a built (2026-10-31): named crops and animals

**F4b (part):** the re-roll, Fewer gaps and the age are in the page's link (`foodroll`, `fewer`, `foodage`, only off their
defaults). The Earth checks (the hearth odds' AUC at Earth's centres, Europe's dates) need the history ground on a finished
Earth — the harness checks places on the 1° observed climate, not a whole ground — and are left for later.

**F5a**, after the owner: *"I want to start seeing actual crops and animals over the world"*:
- **Names** (`farming/names.js`, ported from the mock-up's): 20 Earth regions (the mock-up's 18, plus the Tibetan plateau
  and the northern taiga for yak and reindeer), the staple catalogue (~65 crops in the five groups) and a new **animal
  catalogue** (~40: cattle, zebu, sanga, Bali cattle, gayal, bison, eland; sheep, goats, fat-tailed sheep, cashmere goats,
  mouflon, bighorn; horse, donkey, onager, kiang, Przewalski's horse; dromedary, Bactrian camel, guanaco; yak, llama,
  alpaca, takin; reindeer, caribou, moose; pigs, Chinese pigs, peccary, babirusa, bushpig; river and swamp buffalo,
  African buffalo, anoa).
- **Sites:** every centre of the run, its climate from the finished picture (the aridity index for wetness; the
  winter's share from January's and July's rain, a rough one, so matched widely). With the page's ~140 sites (the
  mock-up had a few dozen) the pull and nudge drowned the climate (a hot, wet hearth came out "like temperate Europe"):
  the climate weighs 2.6 (was 1.4), the nudge 0.3 (was 0.45).
- **Each place's strain** is the one with the most say round it of the cells it had come to (the first to reach them),
  read as the Origins views read the grid. The variant-shares model of §4.4 (home climate × lateness) is not built yet.
- **Views:** Staple food and Animals, Named on by default: each strain a hue round its kind's; the legend groups the
  named strains by kind with their shares and a Wikipedia link; one alone on a click; the readout names the staple's and
  beast's strain and lists the crops and beasts of the place; Origins' hearth list names what each hearth tamed.

**On the check planet:** ~140 sites, ~190 strains; at 10,000 years e.g. bread wheat-like 9 %, emmer-like 7 % of the land
as staple, Guinea yam-like 4 %, sanga cattle-like 19 % and goat-like 6 % leading. Every centre's tamings get a name, so
the long tail repeats names (dromedary-like V); the legend shows strains on ≥ 0.2 % of the land.

**Next (F5b):** the rest of the catalogue — pulses, fruit and nuts, vegetables and herbs, spices, drinks and fibres, each
its own home and spread — and minor animals (fowl, ducks, turkeys, guinea pigs, bees, silkworms), Variety, the crop
finder and cards, the realism and likeness controls, re-roll names.

## 8h. F5b built (2026-10-31): the rest of the crops; ranked core crops

**The owner's two notes during it:**
- *"only ONE core crop is spreading, when in reality a crop can spread if it can grow and there isnt anything already
  there. The main one will be whatever shows up first though."*
- *"anywhere a certain crop can grow, it WILL spread (barring distance) but it wont take over as primary unless it is
  TRUELY a much better crop for the region. Basically I want to know what all the secondary or tertiary etc primary
  crop are."*

So:
- **The staple** (as it came) is the crop group that came first among those that grow, a later one leading only where its
  food × e^(−years later ÷ 1,500) is more (FARMING.lateYears). On the check planet: rice 7.4 → 6.5 %, wheat 25 → 23 %,
  maize 19 → 20 %, roots 10 → 11 %.
- **Every strain spreads by itself** wherever it can grow (its group's fit × its home match), no longer blocked by the
  first to arrive (the old single search per archetype let one strain flood a continent). Each place's strains are ranked
  by fit × e^(−arrival ÷ 1,500): the named views' **Main · 2nd · 3rd** chips, and the readout's ranked **Core crops** and
  **Beasts here**. On the check planet 99 % of the places with a crop have a second.

**The Crops view** (the mock-up's Crops tab and §4.4–4.6, on a 1° ground): ~225 crops in 28 kinds and a new list of 14
small animals; Variety, each kind's count, the leading pulse or spice, one crop alone with its card and homes pinned, the
finder, Realism, Earth likeness, Re-roll names. On the check planet (Balanced): 211 of 239 grown, a farming place growing
~45 crops at 10,000 years (up to ~100).

**Speed:** the strains' spreads ~1.1 s and the crops ~0.8 s, each once per history run (and settings); an age's ranks
~0.2 s and counts ~20 ms. Both moved from each step's cosines to a per-row table of step lengths, and the strains' speeds
are worked out once per strain.

**Not yet:** the Earth checks (F4b), Food security from the real crop mix, the culture layer.

## 9. Phases (each checked in the browser before the next)

**After §0:**
1. **F1 Calendar** (built; folded to a readout line, see §8b).
2. **F2 Animals & Way of life**, best possible (built, §8c).
3. **F3 Wild larder & hearths**, with tree crops in the finish: F3a (§8d), F3b (§8e) and F4a (§8f) built.
4. **F4 The spread in years**, with 10,000 years and the full spread, and every view as it came.
5. **F5 People, words and exports.**

Kitchen and Specialties leave this plan. The list below is the first draft's.


1. **F1 Calendar.** The harvest-month, lean-month and risk bytes in the finish; the Calendar view; Earth places for it.
   Stand-alone, quick and distinctive.
2. **F2 Way of life & Animals (the land's own).** ET, seasonality and NPP; the food systems; beasts by habitat; the
   disease belt; the Earth harness for ArchaeoGLOBE and EA. No history yet: everything on "best possible" until F4.
3. **F3 Larder & hearths.** Wild ranges, each landmass's beasts, hearth odds and ignition; Origins (Wild larder, hearth
   pins). Earth: the centres' AUC.
4. **F4 The spread in years.**
   - the search in time, receivers, secondary centres, the age chips;
   - Origins' "When farming came" and "From which hearth";
   - Staple food, Way of life, Animals and People "as it came", with the Best possible chip;
   - Earth: Europe's dates.
5. **F5 Kitchen.**
6. **F6 Specialties** (with Geology's salt).
7. **F7 Words and exports.** README, v2/README, the tutorial, SEO and llms.txt, the export rows; What's New if the owner
   wants it.

Each phase comes with a numeric check and a "what to verify in the browser" list.

## 10. Decisions for the developer

1. **The shape** (Land → History → Culture) and the view list: OK? And should Soil and Season fold into Farmland's
   picker?
2. **"As it came" by default**, with Best possible as a chip (recommended), or the reverse?
3. **The age of farming:** chips for 3,000 · 6,000 · 10,000 years (default 10,000), or always the full spread?
4. **Scarcity:**
   - May a landmass lack a plough or milk beast? Recommended: yes, it is luck, as on Diamond's continents.
   - May a world lack an archetype altogether? Recommended: no on Earth-like worlds; secondary domestication guarantees
     it wherever it grows. Yes only where nothing like its wild ancestor's niche exists.
5. **Tree & palm crops as a staple:** now (in F2), later, or never?
6. **Order and names:** Calendar first (recommended)? Names: "Way of life" or keep "Lifestyle"; "Origins", "Kitchen",
   "Calendar"?

## 11. Not in this plan

- **Cradles and states.** The owner will redo them later. "Granaries" (storable, taxable grain per km²) is the nearest
  idea, and is not planned.
- **Real Earth crops** (branch `crops`): a later layer naming the archetypes' strains, never changing them.
- **Cultures and peoples.**
- **Contact and the Columbian exchange.**
- **Trade routes.**
- **Generate and Import** (v1): the Food tab is Evolution's.

## 12. Research flags

- "Chira, Gray & Botero 2024", cited in the crops research (branch `crops`, §4.2), could not be found again: treat it as
  unverified.
- Binford's storage threshold is ET 15.25 or 15.75 depending on the source (D-PLACE's data favour ~15.25).
- Several habitat ranges in `domestication.md` are marked [recalled].
- D-PLACE is CC BY-NC (download only). ArchaeoGLOBE and GLW are CC0. GAEZ's and HYDE's licences are unchecked at source.
