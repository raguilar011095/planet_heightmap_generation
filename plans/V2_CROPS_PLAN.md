# Evolution: every kind of crop, and how each spread — plan

**Parked on branch `crops` (2026-10-29).** The developer split the Farming tab's next release from individual crops: the
farming layer now speaks of archetypes — a place's staple food source and its people's primary lifestyle — and the real
crops (varietals.js, the Crop spread's Real crops chip and per-strain picks, crop climates steering the spread) moved
here with this plan, to come back as a layer over it.

Developer (2026-10-29): "deeply research and provide a plan to expand the crop spread beyond what we have and to make it
more accurate. Ideally i want other genres of crops like vegetables, spices, berries, herbs, berries, fruits, etc. I also
would love to add in wild rice from north america as a potential staple crop as well." Then, on the first draft (which
made wild rice the foragers' gathered staple): "wild rice is assuming it was never domesticated and turned into more of a
staple crop. I want to think outside the box into these alternative worlds" — and, rather than a staple group of its own
or folded into rice: "maybe it should be more [relegated] to the other crops, only grown in zones where it makes sense".
So wild rice is a **farmed** grain of the catalogue below, grown where its zones are.

The research behind every number below, with sources: `plans/V2_CROPS_RESEARCH.md` (where ~200 crops were domesticated,
ECOCROP's climate ranges for 198 of them, how crops spread and how fast, wild rice wild and farmed, and Earth's lost crops
and near-domesticates).

## What there is today (plans/V2_FARMING_PLAN.md C2–C4e)

- **Staples**: four crop groups — rice; wheat and barley; maize and millet; roots and tubers — and herding; each place's
  harvests a year per group from the finish's months (farming.js), its staple the one that feeds the most.
- **Crop spread**: 6–8 hearths, the regions richest in rain-fed food, far apart; each domesticates two or three staples;
  each strain a real crop (~30, varietals.js), named from 12 Earth packages by climate likeness; each strain spreads by
  its own Dijkstra over a 0.5° grid (rivers, coasts and plains cheap; hills, deserts, unfit land dear; open ocean never),
  its niche its crop's Köppen list blended toward its hearth's climates; the first strain to reach a place keeps it unless
  a much better one comes from near; Re-roll draws another likely history (`crops=`). Budgets: the whole spread ≤ 1.5 s
  (605 ms), a crop chosen ≤ 0.3 s (91 ms).
- **Per pixel** a finished moment already keeps: soil, the months warm and wet enough, flood, canal, slope, wetland,
  pasture, the harvests; and on the climate's picture Köppen, the year's temperature and rain, the warmest − coldest month,
  aridity, the months over 10 °C, rain seasonality; its 1° climate the sea's temperature and upwelling.

## What the research changes

1. **Wild rice can be farmed — in its zones.** Minnesota's paddies (from 1950) had shatter-resistant plants within ~13
   years, simply by sowing harvested seed; they yield ~325 kg/ha finished (Minnesota) to ~670–900 (California) — a
   medieval wheat field's 340–560 — with twice rice's protein. China ate Manchurian wild rice as one of the Zhou's six
   grains into the Tang, gathered wild. But it grows only in shallow, fresh, through-flowing water; the northern kind only
   where winters are long and cold (its seed's dormancy) and summers long-dayed and not hot and humid (brown spot, poor
   seed set); and its seed, dying if dried, cannot be carried far as dry grain: a **regional grain**, as amaranth or
   buckwheat are, not a staple group (research §5).
2. **~200 crops in a dozen kinds**, each with an Earth home (18 packages: today's twelve and six new — the Levant–
   Mediterranean orchard, Central Asia–Iran, South India–Sri Lanka, the Moluccas, Yunnan–Assam, the West African forest),
   a date and how it is propagated — seed, clonal or grafted (research §2).
3. **Niches from the months, not Köppen lists**: ECOCROP's temperature and rain ranges, cycle and killing frost for 198 of
   them, with winter chill (fruit and nuts), heat sums (grape, date), frost limits (citrus, cacao, coconut) and dry seasons
   (coffee, vanilla, mango, cotton) (research §3).
4. **How crops spread, in years**: ~1 km a year overland; along rivers ×2.5–5 and coasts ×5–10 while the coast stays in
   the crop's climate; sea hops of 300–450 km; a climate edge stalls a crop 1,600–3,000 years (seed crops adapt, clonal ones
   need a better-suited stock); rich foragers slow farming to 0.1–0.3 km a year or refuse it; crops move fast between
   farmers already there (Europe's millet in 1–2 centuries); fruit trees 3,000–5,000 years after the grains, by trade;
   spices stay within a few hundred km of home for ~3,000 years; secondary domestication where an arriving package met a
   local plant (rye, oats) is as common as the primary hearths (research §4).

## Design

### 1. Wild rice: a grain of the lake country

A crop of the catalogue's **Grains** (§2) — farmed, not gathered: sown in the shallows from the harvest (as the Ojibwe and
Assiniboine sowed their lakes — on this world, sowing from the harvest bred it non-shattering, as Minnesota's paddies did
in a dozen years) and in diked paddies on peat and river flats — grown only where its zones are. Not a staple group: it never shows in Staples or
People (they stay the four groups'); it is in the Crop spread's picker, under Grains, as every other crop.

**Its zones** — its niche (§3) is its climate × its water:
- **Water** — a new byte a pixel, `shallows` (0…255), from the finish's own waters in the farming stage (farmCells):
  shallow and fresh — within a few km of a fresh lake's shore, along slow rivers (discharge rising [2, 20] m³/s, fading
  [300, 1500]: big rivers are deep, turbid, their levels swinging), and on waterlogged flats (FARMING.wetlandFlat [6, 2] m
  per km); through-flowing — no terminal or salt lake (the year's rain ÷ potential evaporation rising [0.7, 1]); more in
  kettle-lake country (till or shield ground, or under the last ice age's ice: × up to ~2 for lakes the mesh cannot show).
  Taro, lotus and cranberry read it too. Data added: older moments have none until detailed again; no version bump.
- **Climate**, by kind: **Northern wild rice** (*Zizania palustris*) — 2–4 months at or below 0 °C (the seed's cold
  dormancy: ~3 months in water near freezing), the warmest month rising [13, 16] °C and fading [23, 27] — faster where the
  summer is also wet (brown spot: hot, humid nights; California's dry summers grow it well), degree-days over 5 °C rising
  [800, 1200] (110–130 days; ~1,440 over 4.4 °C in Minnesota), long summer days (fewer flowers under 14 h: fading below
  ~35–40° latitude);
  **Manchurian wild rice** (*Z. latifolia*: perennial, from rhizomes) — warm-temperate to subtropical monsoon country,
  growing over 5 °C, no cold need, fading into the wet tropics. (Annual *Z. aquatica*'s thin grain was never worth sowing:
  left out.)
- **Expected on Earth**: the Great Lakes, Manitoba and the boreal lakes, Finland and Karelia, the Baltic lowlands, the
  Amur; Manchurian on the Yangtze's lakes. None in Florida, the Sahara or the Amazon, and none away from water — a
  scatter of lake districts and river margins, a few % of the land where it grows at all.

**Where it is first grown** — as every catalogue crop (§4): Northern wild rice's home package is eastern North America,
Manchurian's the Yangtze; where no hearth like them suits it, a **secondary centre** in lake country once farming arrives
— farmers whose wheat drowns in the cold shallows take up the grain growing there, as Europe's took up rye and oats. A
world with no cold lake country grows none (the atlas says so).

**How it spreads** — as the catalogue's other crops (§5), but only through its zones, and slowly, as clonal crops do: its
seed must be kept wet and cold, so it travels by water — along lake chains and rivers — not as a sack of dry grain over
the land between. Through farmers already there it moves faster; it stops where the shallows stop. (Saskatchewan, with
none of its own, grew 550 t a year from lakes seeded in the 1980s: given water and cold, it takes.)

### 2. The catalogue

`farming/crops.js`: each crop — id, name, scientific name, **kind**, Earth home package(s), when domesticated (ka), life
(annual · biennial · evergreen perennial · deciduous perennial), propagation (seed · clonal · grafted), worth (how widely
grown: 0.3 a minor crop … 1 a great one), its ECOCROP ranges (temperature absolute and optimal, rain absolute and optimal,
killing frost in growth and in rest, cycle) and its special needs (chill hours, a heat sum, dry months, frost-free days,
grown watered, wetland or shallows, its range kept near home). The kinds — twelve; the staples' own crops (varietals.js)
stay the staples', and the Grains and Roots here are the regional ones, spread as the other kinds':

| Kind | Examples (home package) |
|---|---|
| Grains | northern wild rice (eastern North America); Manchurian wild rice (Yangtze); grain amaranth (Mesoamerica, Andes); barnyard millet (Yellow River); little millet (South India); maygrass, little barley, erect knotweed — Earth's lost crops, grown in eastern North America until maize replaced them |
| Roots and tubers | ulluco, mashua, arracacha, maca (Andes); arrowroot, tannia (Amazonia); konjac (Yunnan) |
| Legumes | lentil, pea, chickpea (Fertile Crescent); soybean (Yellow River); mung bean (South India); cowpea (West Africa); common bean (Mesoamerica and the Andes); peanut (Amazonia) |
| Vegetables | onion, garlic, carrot (Central Asia); cabbage, beet, lettuce (Mediterranean); squash, chili, tomato (Mesoamerica, Andes); cucumber, eggplant (Ganges); okra; lotus (Yangtze) |
| Fruit | olive, grape, fig, date (Mediterranean, Fertile Crescent); apple, pear, apricot (Central Asia); peach, persimmon (Yangtze); citrus, lychee (Yunnan); banana, breadfruit (New Guinea); mango; avocado, papaya (Mesoamerica); pineapple (Amazonia) |
| Nuts | almond, pistachio, walnut, chestnut, hazelnut; Brazil nut, cashew; kola; candlenut, canarium; pecan |
| Berries | blueberry, cranberry (eastern North America); raspberry, currants (Europe); Chilean strawberry (Andes) |
| Spices | black pepper, cardamom, cinnamon, turmeric (South India); clove, nutmeg (the Moluccas); saffron (Mediterranean); vanilla, allspice (Mesoamerica); cumin; Sichuan pepper (Yunnan) |
| Herbs | coriander, dill, fennel; oregano, thyme, sage, rosemary, bay, mint, parsley (Mediterranean); basil (South India); perilla (Yellow River) |
| Oil and sugar | flax, sesame, poppy, safflower, rapeseed, sunflower, oil palm, shea, noog, castor; sugarcane (New Guinea) |
| Drinks and stimulants | tea (Yunnan); arabica coffee, khat (Ethiopia); cacao (Amazonia → Mesoamerica); kola; yerba mate; coca, tobacco (Andes); areca; kava; hops |
| Fibres and dyes | hemp (Yellow River); ramie (Yangtze); cotton (four: Ganges, Africa, Mesoamerica, the Andes); jute; agave; paper mulberry; indigo, woad |

Eighteen packages (varietals.js PACKAGES, widened), each with its Earth climates and place, as today.

### 3. Niches from the months

`farming/niche.js`: a crop's fit at a place, 0…1 — the product of smooth factors (CIAT's product; never a hard cut):
- **Annuals**: the best start month of its season's window (from its cycle), its worst month's temperature trapezoid ×
  the rain over the window's trapezoid; a smooth kill ramp near its killing frost.
- **Evergreen perennials**: all twelve months (what makes them cold-limited), the coldest month against their frost;
  annual rain.
- **Deciduous perennials**: temperature over the growing months only (ECOCROP's limits are growing-season means: applied in
  winter they would kill every apple), winter by the extreme minimum against their rest frost, × the **chill** met (a
  month's chill hours from its mean, a smooth estimate to calibrate on Earth), × a **heat sum** where it matters (grape,
  date).
- **Dry seasons** where a crop wants one (coffee, vanilla, mango, cotton, saffron, cumin) or cannot bear one (cacao, oil
  palm).
- **Water brought** lifts the rain factor of crops grown watered (date, citrus, cotton, cumin…) where the techniques bring
  it; water crops (wild rice, lotus) grow only as far as a place has shallows (§1), wetland crops (taro, cranberry) want
  waterlogged ground or shallows, the rest lose on it; soil fertility, as the staples do.

**Inputs**: first from what a pixel already keeps — the year's temperature ± half the warmest − coldest range (a
twelve-month curve), the year's rain, aridity, rain seasonality, the months over 10 °C, the farming's warm and wet months,
soil, wetland, water brought — so nothing new is saved. The Earth check (below) measures this against Earth's exact months;
if a crop's area disagrees by more than ~10 %, the finish keeps four more bytes a pixel (the coldest and warmest months,
the dry months, the chill) — data added, older moments detailed again for the crops.

### 4. Where each crop was first grown

- **The hearths** (unchanged: still found by the staples, the same at every roll) also domesticate, per kind, crops of the
  Earth packages they are like that grow well around them (niche over the hearth's region ≥ ~0.4), the likeliest first, up
  to a few per kind (legumes 2–4, vegetables 3–6, fruit 2–5, nuts 1–3, herbs 2–4, oil and sugar 1–3, spices 0–3, drinks
  0–2, fibres 1–2).
- **Secondary centres** (Vavilov's; Larson's secondary domestication): the crops no hearth took get homes where farming
  came — regions (~400 km) of farmed land that best suit a package's crops, far from the hearths and each other (≥ ~1,500
  km), each like one of the packages no hearth took (the Mediterranean orchard, Central Asia, the spice coasts…), about as
  many as the hearths; their crops start once farming has arrived there, 500–3,000 years later.
- **Twice-domesticated crops** (common bean, squash, cotton, coconut, grape, melon, apricot) may have two homes where two
  regions suit them that are cut off from each other.
- A crop that suits nowhere is **not grown on this world** (the atlas says so).
- Each choice with its own seeded stream (the staples' rolls untouched: a `crops=` link keeps its hearths, staples and
  their names).

### 5. How the other crops spread

Each crop its own Dijkstra, its cost in **years a km** (so the map has an age):
- **Land in its niche** 1 year a km; × the niche's fit (to the 1st power for seed crops, the 2nd for clonal crops and trees);
  hills and mountains dear unless they are its niche (highland crops climb).
- **Rivers** ×2.5–5 and **coasts** ×5–10 faster, but only while in its niche (the Bantu coasts and the eastern
  Mediterranean show no speed-up).
- **Sea hops** up to ~300–450 km at ~8–10 km a year; open ocean (> ~1,000 km) never — as the staples.
- **Through farmers** ×3–10 faster where the staples' spread has farming already (how minor crops travel); **into
  foragers** × √(1 − m), m the foragers' richness (the land's productivity, rich coasts, wild stands): where m is high and the
  crop poor, never adopted (the Pacific Northwest, California, Hokkaido).
- **A climate edge** (its niche falling below ~0.4): seed crops stall 1,000–2,000 years then cross as an adapted strain;
  clonal crops do not cross.
- **When it starts**: a hearth's founder crops with its staples; its fruit trees 3,000–5,000 years later, grafted ones
  later still, drinks and stimulants late; a secondary centre's when farming came.
- **Spices kept home**: a spice's range held within ~300–1,000 km of its home (its narrow niche does most of it) — the
  world's spice islands; beyond, a trade good (the readout and the atlas say so).
- **How long farming has been going** (needs your call): 10,000 years by default (the pre-industrial world), or 3,000 or
  6,000 — the crop map of a Bronze Age, classical or medieval world.
- **Where it is grown**: where it came and its niche there is ≥ ~0.3, smoothly, its strength how well; a place's
  **variety** per kind, how many of that kind it grows.
- **Speed**: on a 1° grid (64,800 cells; ~25 ms a crop, estimated from today's 91 ms at 0.5°), a kind's crops spread when
  the kind is first shown (≤ ~0.5 s), kept per moment, techniques, roll and age; the whole catalogue (~4 s) only for the
  export's atlas, with progress. The staples stay on their 0.5° grid, as they are.

### 6. On the page

- The **Crop spread** view gains a picker in the bar under the tabs (as the Deposits view's): **Staples** (today's view, the
  default), then each kind — **All legumes**, and each legume alone — and so on.
- **A kind**: its variety (how many of its crops grow there) as a wash on the Deposits views' pale paper, each colour inked
  at the guaranteed contrast (geology-view.js `ink`); the legend lists its crops with their shares of the land, each a
  switch to show it alone (as the Ages legend's entries).
- **One crop**: where it grows, by how well, in its colour; where it could grow but never came, a faint wash ("could grow
  here"); its home (needs your call: a pin like the hearths').
- **Readout**: a place's crops by kind, each with where it came from (hearth 3, or the centre named for its Earth likeness),
  and what would grow there but never came.
- **Phone**: the picker in the layer sheet as the Deposits picker; the legend's chips 44 px.

### 7. Export

The Farming group gains a **Crops** row per kind: the map as shown; as data its variety (8-bit) and a mask per crop (8-bit:
0 none … 255 grows best) — as the geology's richness masks. Files, not maps: the crops as CSV (kind, home, when it started,
share of the land, landmasses), their homes as GeoJSON, and a **crop atlas** in Markdown — each landmass's crops by kind,
its rare ones (a spice found nowhere else: a trade good), what would grow there but never came.

### 8. Detail, saves, links, speed

- **Scale invariance**: niches per pixel in °C and mm; spread grids fixed in degrees; habitats in km and m³/s — the same at
  160K and 2.5M (checked).
- **Saves**: the shallows byte (and maybe four climate bytes) added — older moments detailed again for them, the legend
  saying so; no version bump. **Links**: `crops=` unchanged in meaning; the age of farming as `farmed=` if chosen.
- **Budgets**: the farming stage ≤ 4 % of the finish; the staples' spread ≤ 1.5 s, unchanged; a kind's spread ≤ 0.5 s; the
  atlas ≤ ~5 s.

## Phases (each checked in the browser before the next)

1. **The catalogue and the niches**: crops.js and niche.js; the shallows byte at the finish; `tuning/farming/earth-crops.mjs`
   — each crop where it should grow on Earth and where it should not (olive in the Mediterranean, not in Paris; apple in
   Kent, not in Lagos — chill; coffee in the Ethiopian highlands, not the Sahara; cacao in Ghana, not Cairo; pepper in
   Kerala; date in Baghdad, not Java; northern wild rice on the Great Lakes, in Manitoba and Finland, not in Florida or
   on a dry plain…), and the reconstructed months against the exact ones; on the page, a first look: the picker with each
   crop's "could grow here" map (no spread yet). Browser: a glaciated continent's lake country for wild rice.
2. **Homes**: the hearths' crops by kind, the secondary centres, the twice-domesticated; legend and readout; check — every
   kind has crops, each home suits its crop, the staples unchanged at every roll.
3. **The spread**: years, corridors, through farmers, foragers, stalls, trees late, spices kept; the kinds' and the crops'
   maps; readout; the age of farming (if wanted); checks — spices rare (each ≤ ~1–2 % of the land), wild rice only in
   its zones, the staples byte-identical, budgets, 160K against 640K.
4. **Export and words**: the rows, masks, CSV, GeoJSON and atlas; README, v2/README, the tutorial's step, SEO and
   llms.txt; What's New (asked).
5. **(Your call) The staples on the same footing**: their real crops' niches from the months instead of Köppen lists, and
   their spread in years by the same rules — more accurate, but today's maps and every `crops=` link would change.

## Decisions for the developer

Settled (10-29): wild rice is a farmed regional grain of the catalogue, grown only in its zones — not gathered, not a
staple group, not folded into rice.

1. **How many crops**: ~120 first (every kind, the best documented), the rest later — or all ~200 at once.
2. **The age of farming**: a choice of 3,000 · 6,000 · 10,000 years — or always the full spread.
3. **A pin at the home** of the crop shown (a mark on the map).
4. **Phase 5** — the staples re-founded: now, later or never.
5. **Ideas raised, not yet planned** (yes, later or no each): **Tree crops** as a staple group (chestnut, breadfruit, date
   palm, sago, coconut; acorns, mesquite) — groves on hills too steep to plough, oases, swamp forest; **Fishing** and
   **Foraging** as ways of life beside Herding (salmon and upwelling coasts; land no crop reached); **Earth's lost crops**
   in the catalogue, as the lost eastern North American grains are (research §6) — the best documented: new glume wheat
   (Anatolia to Europe, gone by the 1st millennium BC), sown manna (a millet farmed in Poland and Bohemia into the 1800s),
   Chile's mango brome and madi, Mexico's sauwi millet, the Hohokam's agaves; and the tended wild plants nearest to
   crops — wapato (a 3,800-year-old wetland garden), camas, murnong, Iceland's sea lyme grass, Australia's native millet.

## Not in this plan

Domestic animals (her Parts 1–3: C5); the Columbian exchange (crops crossing oceans by ship — an "after contact" option
one day); spice trade routes; each crop's own yield (People stays the staples').
