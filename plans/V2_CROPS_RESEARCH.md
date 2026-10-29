# Evolution crops — research notes

The research behind `plans/V2_CROPS_PLAN.md` (2026-10-29): four research passes — where each crop was domesticated,
what climate each needs, how crops spread, and North American wild rice — for widening the Farming tab's Crop spread from
the staples to every kind of crop. *Derived* marks arithmetic on cited figures; *?* marks weak or contested sources;
several figures come from abstracts or secondary sources only.

## 1. Sources and licences

| Source | What it gives | Use |
|---|---|---|
| **FAO EcoCrop** (via OpenCLIM/ecocrop's `EcoCrop_DB.csv`, 2,568 records; Recocrop R package, GPL-3, 1,710 taxa) | Per species: optimal and absolute temperature (growing-season means), optimal and absolute annual rain, killing temperature in growth and in rest, cycle length (days), photoperiod, soil pH/fertility/drainage, latitude and altitude limits, life span | The climate niches (§3). FAO states no licence (its general terms); discontinued ~2015, folded into GAEZ. Transcribe the rows used, credited, as tunable priors — never ship the database |
| **Milla 2020, *Crop Origins*** (Glob. Ecol. Biogeogr. 29:606; github.com/rubenmilla/Crop_Origins_Phylo) | 866 food crops: growth form, earliest cultivation and domestication (years ago, referenced), part used, the wild progenitor's ecoregion and 19 WorldClim medians | Dates and growth forms; free with citation (no licence file). The progenitor's place comes from GBIF and is noisy — not a domestication region |
| **Khoury et al. 2016** (Proc. R. Soc. B 283:20160792; Table S1 on Dryad doi:10.5061/dryad.s08t2, CC0) | 151 FAO commodity groups × 23 "primary regions of diversity" | Cross-check of homes; regions broad, commodities lumped |
| **Larson et al. 2014** (PNAS 111:6139) | Map of the independent centres ("at least 11"); a timeline per crop (~45 crops) | Dates; centres |
| **Purugganan & Fuller 2009** (Nature 457:843); **Fuller et al. 2014** (PNAS) | ~13 centres; seed vs vegetative ("vegeculture") zones | Concepts |
| **Vavilov** (1926/1935: 8 centres of diversity); **Harlan 1971** (centres and non-centres) | Names of packages; domestication over wide areas | Concepts |
| **FAO-IIASA GAEZ v4** (51 crops, 5′, suitability classes) | Crop suitability on Earth | Offline benchmark only (fetched, never redistributed — as the Köppen-Geiger reference) |
| **Fort 2026** (J. Archaeol. Res. 34:263–311) | Review of farming spread rates worldwide | §4 |
| **van Etten & Hijmans 2010** | Maize spread by least-cost distance on a 0.5° grid — the Crop spread's own grid | Precedent |

## 2. Where crops come from

### 2.1 Packages (crops domesticated together)

Today's twelve (varietals.js PACKAGES) — FC Fertile Crescent, YR Yellow River, YZ Yangtze, GA Ganges, MA Mesoamerica,
AN Andes, AM Amazonia, NG New Guinea, SWA Sahel & West Africa, ET Ethiopian highlands, ENA eastern North America, EU
temperate Europe — and six proposed:
- **MED Levant–Mediterranean orchard** (~7–5 ka, Cs climates): olive, grape, fig, date, pomegranate, carob, almond,
  leek, lettuce, artichoke, asparagus, chard, saffron, the herbs. (Could instead be a later "orchard wave" of FC.)
- **CAS Central Asia–Iran** (Vavilov's Central Asiatic centre): apple, pear, plum, apricot, quince, pistachio, walnut,
  onion, garlic, carrot, spinach, turnip — mostly late, grafted, spread along the Silk Road.
- **SIN South India–Sri Lanka**: mung bean, black gram, horsegram, small millets, black pepper, cardamom, cinnamon,
  turmeric, the Indian Ocean coconut, jackfruit.
- **MOL Island Southeast Asia–Moluccas**: clove, nutmeg, the Pacific coconut, areca, candlenut, durian, mangosteen, paper
  mulberry — the Austronesian voyages' launch pad.
- **YUN Yunnan–Assam–northern Indochina** (Larson: "biogeographically inferred"): citrus, tea, buckwheat, Sichuan pepper,
  lychee and longan.
- **WAF West African forest margin ("yam belt")**: Guinea yam, oil palm, cowpea, kola, ackee, robusta coffee — split from
  the savanna crops left in SWA.

Polynesia is not a centre: its crops spread from NG and MOL.

Non-staple crops for today's packages:
- FC: lentil, pea, chickpea, faba bean, bitter vetch, flax, fenugreek, coriander, cumin, safflower.
- YR: soybean, adzuki, hemp, jujube, apricot, perilla, Chinese cabbage.
- YZ: peach, lotus, Manchurian wild rice, ramie, persimmon, Asian pear.
- GA: pigeon pea, cucumber, eggplant, sesame, tree cotton, jute, mango.
- MA: common bean, runner and tepary beans, squashes, chili, avocado, tomatillo, amaranth, vanilla, papaya, upland
  cotton, agave, cacao (adopted).
- AN: oca, ulluco, mashua, maca, tarwi, quinoa, *C. maxima*, coca, Pima cotton, cherimoya, tobacco, Chilean strawberry.
- AM: peanut, *C. moschata*, pineapple, cacao, peach palm, Brazil nut, cashew, annatto, guaraná, yerba mate.
- NG: sugarcane, sago, breadfruit, kava, canarium.
- SWA: Bambara groundnut, watermelon, shea.
- ET: noog, Ethiopian mustard, arabica coffee, khat, castor.
- ENA: *C. pepo* ssp. *ovifera*, sunflower, sumpweed, maygrass, knotweed, little barley, Jerusalem artichoke, northern wild
  rice (gathered).
- EU: poppy, camelina, cabbage, beet, hops, hazelnut, rapeseed.

### 2.2 Catalogue

Earliest domestication in thousand years ago (*c*: cultivation or use only); life A annual, B biennial, P perennial, P→A
perennial grown as an annual; propagation S seed, C clonal (cuttings, tubers, suckers, offsets), G grafted.

**Grains**: wheat FC 10.5 A S · barley FC 10.5 A S · rye FC→EU 3–5? A S *(secondary: a weed of wheat fields)* · oats EU ~3
A S *(secondary)* · japonica rice YZ 7.8 · indica GA ~4 · African rice SWA 2–3 · broomcorn and foxtail millet YR ~8 ·
maize MA ~9 · sorghum SWA (E Sudan) 4–5 · pearl millet SWA 4.5 · fonio SWA ~2.5? · finger millet ET ~4? · teff ET ? ·
little and browntop millets SIN 4.5 · barnyard millet YR (Japan) 4.5 · buckwheat YUN ~5? · quinoa AN 5–3.5 · grain
amaranths MA (+AN) ~6 · goosefoot, sumpweed, maygrass, knotweed, little barley ENA 5–2 · northern wild rice ENA (gathered
by canoe; paddies only since 1950) · Manchurian wild rice YZ (an ancient Chinese grain, now a stem vegetable). All A S
but Manchurian wild rice (P C).

**Legumes**: lentil, pea, chickpea, bitter vetch, faba bean FC ~10 A S · grass pea, fenugreek FC 6–8 · soybean, adzuki YR
~5 · mung bean, black gram, horsegram SIN ~4 · pigeon pea GA 3.5 P→A · cowpea WAF 3.7 · Bambara groundnut SWA ? · hyacinth
bean ET/E Africa? 3.7 P→A · common bean AN ~5 and MA ~3 (twice) · lima bean AN + MA 6–8 P→A · runner and tepary beans MA
· peanut AM (Bolivia–Argentina foothills) 8.5–6.5 · tarwi AN.

**Roots and tubers**: potato AN 8–4.5 P→A C · oca, ulluco, mashua, arracacha AN P→A C · maca AN ~2 B S · cassava AM 7–7.5
P C · sweet potato AM/C America ~5 P→A C · arrowroot, leren, achira AM/AN ~9c P C · tannia AM P C · taro NG + S/SE Asia
7–10c P C · greater yam NG/MOL 7–10c P C · Guinea yam WAF P C · sago NG (managed) P C · enset ET P C · tiger nut MED ~6
P C · Jerusalem artichoke ENA P C.

**Vegetables**: onion CAS ~5 B S · garlic CAS ~5 P→A C (sterile) · leek MED 4.5 B S · carrot CAS ~1 B S · spinach CAS 1.4 A
S · beet and chard MED 2.5 B S · cabbage group MED/EU coasts 2.7 B S · turnip, Chinese cabbages EU/CAS; YR ~3.5 B S ·
lettuce MED ~6? A S · artichoke MED ~2 P S/C · asparagus MED ~2 P S/C · cucumber GA ~2.5? A S · melon GA + Africa ~4
(twice) A S · watermelon SWA (Sudan) ≥ 4.4 A S · eggplant GA/YUN 2–5 A S · okra ET or GA ~3? A S · bottle gourd Africa
→ Americas by 10 ka A S · squash *C. pepo* MA 10 + ENA ~5 · *C. moschata* AM ~10 · *C. maxima* AN ~4? · *C. argyrosperma*
MA ~5 · chili *C. annuum* MA 6–3 P→A S · *C. baccatum*, *chinense*, *pubescens* AN/AM ~6 · tomato AN → finished in MA P→A
S · tomatillo, chayote MA · lotus YZ P C.

**Fruits, Mediterranean and Near East** (clonal, early): olive MED (Jordan Valley) 7 P C · grape FC/MED + Caucasus 11
(genomic; twice) P C · fig MED 11.3 P C · date palm FC (Gulf) 6–7 P C (offshoots) · pomegranate CAS ~5 P C · carob MED P G.

**Fruits, temperate** (grafted, late): apple CAS (Tian Shan), hybridised in Europe ~3 · pear CAS/W Asia ~3 · Asian pear YZ
~2 · plum CAS/Caucasus ~3? · cherries MED/Caucasus ~2 · apricot CAS + YR 4? (twice; S/G) · peach YZ 7.5–4 (S/G) · quince
CAS ~4? · persimmon YZ ~2 · jujube YR ~4 · mulberry YR/YZ ~2.5 (C; silkworms) · kiwifruit (wild in YZ; domesticated in New
Zealand in the 20th century). All P G unless marked.

**Fruits, tropical**: banana NG (Kuk) + MOL ~7 P C (suckers) · breadfruit NG → Polynesia ~3 P C · coconut MOL (Pacific) +
SIN (Indian Ocean) ~3.5 P S · mango GA/YUN ~4 P S/G · jackfruit SIN P S · citron, lemon, lime YUN ~3? P S/G · mandarin,
pomelo, sweet orange (a hybrid) YUN/S China P G · lychee, longan S China P C (air-layered) · durian, mangosteen, rambutan
MOL P S · tamarind SWA → India P S · avocado MA 7–4 P S/G · papaya, guava MA/AM P S · pineapple AM ~3.5? P C (crowns) ·
cherimoya AN P S · peach palm AM P S · prickly pear MA P C (pads) · ackee WAF P S.

**Berries**: garden strawberry (Chilean, Mapuche-grown, × Virginian: France, 18th century) AN × ENA 0.27 P C · raspberry,
currants EU < 1 P C · blueberry, cranberry ENA 0.1 P C.

**Nuts**: almond MED ~5? P S/G · pistachio CAS ~3 P G · walnut CAS ~3? P S · hazelnut EU/Anatolia ~2 P C · chestnut
Anatolia → EU ~3 P G · Brazil nut AM (managed) P S · cashew AM P S · kola WAF P S · candlenut, canarium MOL/NG P S ·
pecan ENA, macadamia Australia 0.15 P G.

**Spices**: black pepper SIN (Malabar) ≥ 3.2c (traded) P C · cardamom SIN P C/S · cinnamon SIN (Sri Lanka) P S · cassia S
China P S · turmeric SIN/GA ~4? P C · ginger MOL/YUN? P C (sterile) · clove MOL (N Moluccas) P S · nutmeg and mace MOL
(Banda) 3.5c P S · saffron MED (Aegean) ~3.5 P C (corms; sterile) · vanilla MA P C · allspice MA/Caribbean (gathered) P S
· annatto AM ~1.2 P S · cumin, nigella FC/MED 3.5–6 A S · mustards MED/CAS ~2–3? A S · Sichuan pepper YUN P S.

**Herbs**: coriander, dill, fennel FC/MED 3.5–6 A S · oregano, thyme, sage, rosemary, bay, mint, parsley MED (gathered,
then gardened) P/B S/C · basil SIN A S · perilla YR A S.

**Oil crops**: flax (also fibre) FC ~9 A S · sesame GA (Indus) ~4.5 A S · opium poppy EU (W Mediterranean) ~7? A S ·
safflower FC ~4 A S · rapeseed EU ~3 A S · camelina EU A S · sunflower ENA 4.7 A S · oil palm WAF 3.5 (semi-domesticated) P
S · shea SWA (semi-domesticated) P S · noog ET A S · castor ET/NE Africa P S.

**Sugar**: sugarcane NG ~6? P C (to the Pacific ~3.5 ka, India and China ~3 ka; crystal sugar India → Persia ~500 CE →
the Mediterranean with the Arabs) · sugar beet EU (Prussia, 1747–1800) B S · maple and palm saps (tapped, not domesticated).

**Drinks and stimulants**: tea YUN ≥ 2.1 P S/C · arabica coffee ET (wild in SW Ethiopia; cultivated in Yemen from the
~15th century) ~0.6 P S · robusta coffee WAF/Congo 0.15 P S · cacao AM (upper Amazon, used 5.3 ka) → MA P S · kola WAF P
S · yerba mate AM (Paraná) ~0.3 P S · guaraná AM P S/C · coca AN (eastern slopes) ~8c P S/C · khat ET P C · areca/betel
MOL P S/C · kava NG (Vanuatu) P C (sterile) · tobacco AN A S · hops EU 1.3 P C.

**Fibres and dyes**: hemp YR ~6 (genomics ~12) A S · ramie YZ ~4.7 P C · tree cotton GA (Indus) 4.5 (used ~7) P S · Levant
cotton Africa/Arabia ~5? P→A S · upland cotton MA ~5.5 P→A S · Pima cotton AN (coast) ~6 P→A S · jute GA A S · agave
(henequen, maguey) MA P C · paper mulberry MOL (Taiwan; tapa) P C · indigo GA A S · woad EU B S.

### 2.3 How crops travelled

- **Neolithic founder crops** (einkorn, emmer, barley, lentil, pea, chickpea, bitter vetch, flax: ~11–10 ka) spread
  together across western Eurasia (Weiss & Zohary 2011). Rye and oats rode along as weeds and became crops where wheat
  failed (Vavilov's secondary crops). Wheat and barley went east and the millets west in a trans-Eurasian exchange from
  ~7 ka (Liu et al. 2019).
- **Fruit trees in two waves**: olive, grape, fig and date (cuttings, knobs, suckers) were the first horticultural
  additions (Zohary & Spiegel-Roy 1975) — olive ~7 ka at Tel Tsaf; grape twice, ~11 ka (Dong 2023). Apple, pear and plum
  only once grafting existed (~1st millennium BCE): the apple from Tian Shan *Malus sieversii*, hybridised along the Silk
  Road (Spengler 2019).
- **The milpa** (maize, beans, squash, chili, amaranth) **dissolved on the way north**: in northeastern North America
  squash ~800 BCE, maize ~750–900 CE, beans ~1300 CE — adopted over 2,100 years (Hart). Eastern North America had its own
  earlier package (~5–3.8 ka; Smith 2006).
- **Austronesian canoe plants** (taro, yams, banana, breadfruit, coconut, sugarcane, kava, paper mulberry, ti, turmeric)
  carried as living cuttings and tubers; sweet potato reached Polynesia from Peru–Ecuador before Columbus (Roullier 2013);
  coconut brought into cultivation twice (Gunn 2011).
- **The Indian Ocean exchange** (~2000–1500 BCE): sorghum, millets, cowpea and hyacinth bean to India; banana, taro and
  yams to Africa and Madagascar (Fuller et al. 2011).
- **Ethiopia**: teff, finger millet, noog, enset, coffee, khat; enset never grown outside Ethiopia.
- **Spices stayed home and were traded**: nutmeg used on Pulau Ay (Banda) ~3.5 ka; clove (N Moluccas), cinnamon (Sri
  Lanka) and pepper (Malabar) kept tiny native ranges until the 18th century.
- **Stimulants**: cacao in the upper Amazon ~5.3 ka, ~1,500 years before Mesoamerica (Zarrillo 2018); arabica wild in SW
  Ethiopia, cultivated in Yemen from the ~15th century; tea in a Han tomb ~2.1 ka; citrus from the NE India–N
  Myanmar–NW Yunnan triangle, sweet orange a pomelo × mandarin hybrid (Wu 2018).
- **Clonal crops spread only with people** carrying living material; many are sterile (banana, breadfruit, kava, garlic,
  saffron, ginger), never escaping into the wild. Perennials are 35–80 % of the species domesticated in each major centre
  (Meyer 2012, via the Land Institute).
- **Madeline James's series** (Parts 1–7) covers staples only: a crop "typically [emerges] within a single continent";
  innovations spread through clusters with similar growing conditions and good connections; tubers make poor tax crops.
  Nothing on vegetables, fruit, spices, fibres or stimulants. Worldbuilding Pasta: nothing on crops found.

## 3. What each crop needs from the climate

### 3.1 The ECOCROP model, and what to change

Each factor a trapezoid: 0 below the absolute minimum, rising to 1 at the optimal minimum, 1 across the optimum, falling to
0 at the absolute maximum.
- **dismo** (Hijmans et al. 2001): a season of round((GMIN+GMAX)/60) months; each month's mean temperature through its
  trapezoid; a month fails where its mean minimum − 5 ≤ KTMP; rain summed over the season through its trapezoid; the season
  the minimum of its months; the best of the 12 starts kept.
- **CIAT** (Ramirez-Villegas et al. 2013, Agric. For. Meteorol. 170:67): a month 0 where its mean minimum ≤ KTMP + 4; the
  score max over starts of (temperature × rain) — a product, not a minimum (sorghum's true-positive rate 0.967).
- FAO gives the rain limits as **annual**; dismo and CIAT apply them to the season — an ambiguity (climcropr's critique).

For Evolution (each place's own months only — no neighbours, so the same at every detail):
- **Annuals**: the best start month of a season's window: its worst month's temperature trapezoid, a smooth kill ramp, ×
  the rain over the window.
- **Evergreen tropical perennials** (GMIN 365): all twelve months — what makes them cold-limited — with the coldest month
  or GAEZ's day bins (§3.2).
- **Deciduous temperate perennials**: temperature over the growing window only — ECOCROP's TMIN is a growing-season value
  (apple 8 °C): applied in winter it would kill every apple — and winter by a ramp on the extreme minimum against KTMPR ×
  the chill met.
- **Water brought** (rivers, lakes) lifts the rain score of crops grown watered (date, cotton, rice, citrus, cumin, peach,
  almond): ECOCROP's rain values for them are unreliable.
- Köppen stays a soft prior; ECOCROP's `CLIZ` lists can check the niches.

### 3.2 Special requirements

- **Winter chill** (temperate fruit and nuts): hours at 0–7.2 °C (or Utah units, or chill portions). Monthly temperatures
  predict them well (Brazilian regressions R² 0.65–0.96). A smooth estimate *(derived, to calibrate)*: a month's chill hours
  = 730 × P(0 < T < 7.2) with T normal about the month's mean, spread ~4–6 °C (a 5 °C month ~370 h, a 12 °C month ~120 h).
  Needs: apple 400–1000 h (most cultivars 800–1200); pear 600–800 (Asian 400–500); sweet cherry 800–1200; peach 50–1390 by
  cultivar; apricot 500–600; walnut 600–700; almond 400–700; chestnut 400–500; hazelnut ~800; fig 100–200; blueberry
  northern highbush 800–1200, southern 150–800; olive needs winter cold to flower.
- **Heat sums**: grape — Winkler degree-days > 10 °C over the warm half-year, the coolest class from ~850; date palm ≥ 1000
  °C·days > 18 °C from flowering to ripening (Munier 1973), growth from 7 °C, best ~32 °C, dry ripening.
- **Frost**: orange fruit freezes at −2/−3 °C, wood −4 to −7; olive damaged at −8/−11, killed ~−10; banana checked below
  16 °C, damaged by long spells below 8; coconut to latitude ~26°; cacao not where the minimum < 10 °C and the year < 21
  °C.
- **Dry seasons**: arabica coffee wants 2–4 dry months to flower (best 18–23 °C); vanilla ~3; cacao at most 3 months under
  100 mm; mango flowers after cool nights (≤ 15 °C) or a dry spell, rain at flowering cutting the crop; cotton ≥ 200
  frost-free days, rain at boll opening harmful; saffron a hot dry summer's dormancy; cumin a cool dry season (250–500 mm),
  blighted by humidity at flowering.
- **GAEZ's perennial rule** (coffee arabica): days a year with mean > 10 °C optimal 365, unsuitable < 305; no days below 0
  °C; ≤ 1/6 of the year at 5–10 °C; ≤ 1/2 at 10–15 °C; none above 30 °C. Monthly means map onto its 5 °C bins directly.
- **BIOME1** (Prentice et al. 1992): tree types from monthly data — coldest-month minimum (cold tolerance), coldest-month
  maximum (chilling), GDD5 (heat), a moisture index. *(Thresholds quoted from memory by the research pass — check its
  Table 1 before use.)*
- **Extreme minimum**: Magarey et al. 2008 regress the year's extreme minimum on the coldest month's mean minimum (mean
  absolute error 1.9 °C).

### 3.3 Data problems

ECOCROP's temperature limits are growing-season means; some killing temperatures look wrong (sweet cherry's rest −3;
clove, nutmeg and cacao a rest value warmer than their growth value); rain values unreliable for dryland or irrigated
crops (cumin, saffron, date, peach); chill figures vary widely between counting methods (use ranges, smoothly); no chill
figures found for cranberry, strawberry or sour cherry; eggplant's latitude and altitude fields swapped.

### 3.4 ECOCROP's numbers for the catalogue

Read from FAO EcoCrop (OpenCLIM's `EcoCrop_DB.csv`), 2026-10-29: temperatures °C (growing-season means), rain mm a year,
kill °C in growth / in rest (NA: none given), cycle in days.

| Category | Crop | ECOCROP name | Topt | Tabs | Rain opt | Rain abs | Kill (grow/rest) | Cycle d | Life | Photo |
|---|---|---|---|---|---|---|---|---|---|---|
| Grain | Wheat | *Triticum aestivum* | 15–23 | 5–27 | 750–900 | 300–1600 | 0/-20 | 90–250 | annual | neutral day (12-14 hours), l |
| Grain | Barley | *Hordeum vulgare* | 15–20 | 2–40 | 500–1000 | 200–2000 | 0/-4 | 90–240 | annual | neutral day (12-14 hours), l |
| Grain | Rye | *Secale cereale* | 15–20 | 3–31 | 600–1000 | 400–2000 | -1/-18 | 110–270 | annual | short day (<12 hours), neutr |
| Grain | Oats | *Avena sativa* | 16–20 | 5–30 | 600–1000 | 250–1500 | -1/-15 | 110–270 | annual | neutral day (12-14 hours), l |
| Grain | Rice | *Oryza sativa* | 20–30 | 10–36 | 1500–2000 | 1000–4000 | NA/NA | 80–180 | annual | neutral day (12-14 hours) |
| Grain | African rice | *Oryza glaberrima* | 26–32 | 16–38 | 1000–1500 | 700–2700 | NA/NA | 120–270 | annual | short day (<12 hours) |
| Grain | Maize | *Zea mays* | 18–33 | 10–47 | 600–1200 | 400–1800 | NA/NA | 65–365 |  |  |
| Grain | Sorghum | *Sorghum bicolor* | 22–35 | 8–40 | 400–600 | 300–700 | NA/NA | 90–300 | annual | short day (<12 hours) |
| Grain | Pearl millet | *Pennisetum glaucum* | 25–35 | 12–40 | 400–900 | 200–1700 | 0/2 | 60–120 | annual | short day (<12 hours), neutr |
| Grain | Foxtail millet | *Setaria italica* | 16–26 | 5–35 | 500–700 | 300–4000 | NA/NA | 60–120 | annual | short day (<12 hours), neutr |
| Grain | Broomcorn millet | *Panicum miliaceum* | 20–32 | 15–45 | 500–750 | 200–1000 | NA/NA | 55–280 | annual | short day (<12 hours), neutr |
| Grain | Finger millet | *not in ECOCROP* | | | | | | | | |
| Grain | Fonio | *Digitaria exilis* | 22–27 | 18–31 | 900–1600 | 400–2800 | 0/5 | 90–130 | annual | short day (<12 hours) |
| Grain | Teff | *Eragrostis tef* | 22–28 | 2–30 | 600–1200 | 300–2500 | NA/NA | 65–150 | annual | short day (<12 hours), neutr |
| Grain | Buckwheat | *Fagopyrum esculentum* | 17–27 | 7–40 | 700–1000 | 400–1300 | NA/NA | 55–85 | annual | short day (<12 hours), neutr |
| Grain | Quinoa | *Chenopodium quinoa* | 14–18 | 2–35 | 500–1000 | 250–2600 | -8/-8 | 90–240 | annual | short day (<12 hours), neutr |
| Grain | Grain amaranth | *Amaranthus cruentus* | 22–28 | 10–45 | 2000–2400 | 500–4000 | 0/4 | 30–300 | annual | short day (<12 hours), neutr |
| Grain | Barnyard millet | *Echinochloa frumentacea* | 25–30 | 10–35 | 500–750 | 450–1000 | NA/NA | 40–120 | annual | short day (<12 hours) |
| Grain | Manchurian wild rice | *Zizania latifolia* | 22–32 | 14–35 | 600–2500 | 400–3500 | 0/-10 | 150–200 | perennial |  |
| Legume | Lentil | *Lens culinaris* | 15–29 | 5–32 | 600–1000 | 250–2500 | NA/NA | 70–240 | annual | neutral day (12-14 hours), l |
| Legume | Pea | *Pisum sativum* | 10–24 | 4–30 | 800–1200 | 350–2500 | 0/-2 | 60–140 | annual | short day (<12 hours), neutr |
| Legume | Chickpea | *Cicer arietinum* | 15–29 | 7–35 | 600–1000 | 300–1800 | 0/-9 | 90–180 | annual | short day (<12 hours), neutr |
| Legume | Faba bean | *Vicia faba* | 18–28 | 5–32 | 650–1000 | 250–2600 | NA/NA | 100–150 | annual | short day (<12 hours), neutr |
| Legume | Bitter vetch | *Vicia ervilia* | 12–22 | 5–28 | 500–700 | 300–1200 | -1/-10 | 90–150 | annual | long day (>14 hours) |
| Legume | Grass pea | *Lathyrus sativus* | 10–28 | 4–32 | 500–1300 | 320–3000 | NA/NA | 100–190 | annual | neutral day (12-14 hours), l |
| Legume | Fenugreek | *Trigonella foenum-graecum* | 13–27 | 5–32 | 600–800 | 380–1550 | 0/-15 | 60–120 | annual | short day (<12 hours) |
| Legume | Soybean | *Glycine max* | 20–33 | 10–38 | 600–1500 | 450–1800 | NA/NA | 75–180 | annual | short day (<12 hours) |
| Legume | Adzuki bean | *Vigna angularis* | 15–30 | 5–36 | 900–1300 | 530–1800 | NA/NA | 60–190 | annual | short day (<12 hours), neutr |
| Legume | Mung bean | *Vigna radiata* | 21–36 | 8–40 | 650–900 | 500–1250 | NA/NA | 50–120 | perennial | short day (<12 hours), neutr |
| Legume | Black gram | *Vigna mungo* | 22–35 | 8–40 | 650–900 | 530–2430 | NA/NA | 60–130 | annual | short day (<12 hours), neutr |
| Legume | Horsegram | *Macrotyloma uniflorum* | 20–28 | 17–35 | 500–1200 | 300–4300 | NA/NA | 40–180 | annual | short day (<12 hours), neutr |
| Legume | Pigeon pea | *Cajanus cajan* | 18–38 | 10–45 | 600–1500 | 400–4000 | NA/NA | 90–365 | perennial | short day (<12 hours), neutr |
| Legume | Cowpea | *Vigna unguiculata* | 25–35 | 15–40 | 500–1500 | 300–4100 | -1/-1 | 30–240 | annual | short day (<12 hours), neutr |
| Legume | Bambara groundnut | *Vigna subterranea* | 19–30 | 16–38 | 750–1400 | 300–3000 | NA/NA | 90–180 | annual | short day (<12 hours), neutr |
| Legume | Hyacinth bean | *Lablab purpureus* | 18–32 | 3–38 | 600–1000 | 200–2500 | NA/NA | 70–300 | annual, perennial | short day (<12 hours), neutr |
| Legume | Common bean | *Phaseolus vulgaris* | 16–25 | 7–32 | 500–2000 | 300–4300 | NA/NA | 50–270 | annual | short day (<12 hours), neutr |
| Legume | Lima bean | *Phaseolus lunatus* | 16–28 | 13–34 | 900–1500 | 400–4300 | NA/NA | 60–365 | annual, perennial | short day (<12 hours), neutr |
| Legume | Runner bean | *Phaseolus coccineus* | 12–26 | 5–30 | 800–1500 | 400–2600 | NA/NA | 80–365 | annual, perennial | short day (<12 hours), neutr |
| Legume | Tepary bean | *Phaseolus acutifolius* | 20–30 | 8–38 | 600–1000 | 300–1700 | NA/NA | 60–120 | annual | short day (<12 hours), neutr |
| Legume | Peanut | *Arachis hypogaea* | 22–32 | 10–45 | 600–1500 | 400–4000 | NA/NA | 90–150 | annual | short day (<12 hours), neutr |
| Legume | Tarwi | *Lupinus mutabilis* | 18–24 | 6–30 | 500–1000 | 350–1700 | -5/-5 | 150–330 | annual | short day (<12 hours), neutr |
| Root | Potato | *Solanum tuberosum* | 15–25 | 7–30 | 500–800 | 250–2000 | 0/-1 | 90–160 | annual | short day (<12 hours), neutr |
| Root | Oca | *Oxalis tuberosa* | 12–24 | 5–28 | 800–1300 | 570–2150 | NA/NA | 180–270 | annual, perennial | short day (<12 hours) |
| Root | Ulluco | *Ullucus tuberosus* | 12–20 | 5–28 | 1100–1400 | 800–1800 | 0/-4 | 120–270 | annual | short day (<12 hours) |
| Root | Mashua | *Tropaeolum tuberosum* | 12–20 | 4–24 | 1000–1200 | 700–1600 | 0/-2 | 180–240 | annual | short day (<12 hours) |
| Root | Arracacha | *Arracacia xanthorrhiza* | 14–21 | 10–28 | 800–1200 | 600–1800 | NA/NA | 120–365 | perennial | short day (<12 hours) |
| Root | Maca | *Lepidium meyenii* | 12–18 | 3–22 | 600–800 | 500–1000 | -10/-20 | 180–270 | perennial | short day (<12 hours) |
| Root | Cassava | *Manihot esculenta* | 20–29 | 10–35 | 1000–1500 | 500–5000 | 0/7 | 180–365 | perennial | short day (<12 hours), neutr |
| Root | Sweet potato | *Ipomoea batatas* | 18–28 | 10–38 | 750–2000 | 350–5000 | 5/1 | 80–170 |  |  |
| Root | Arrowroot | *Maranta arundinacea* | 23–29 | 17–34 | 1500–2000 | 700–4000 | 5/5 | 300–365 | perennial | short day (<12 hours) |
| Root | Tannia | *Xanthosoma sagittifolium* | 20–28 | 10–35 | 1000–2000 | 750–6000 | 0/7 | 120–365 | annual | short day (<12 hours) |
| Root | Taro | *Colocasia esculenta* | 21–28 | 10–35 | 1800–2700 | 1000–4100 | NA/NA | 180–300 | perennial | short day (<12 hours), neutr |
| Root | Greater yam | *Dioscorea alata* | 20–32 | 14–40 | 1200–4000 | 700–8000 | 9/-2 | 220–300 | perennial | short day (<12 hours) |
| Root | Guinea yam | *Dioscorea rotundata* | 25–32 | 15–38 | 1000–1500 | 800–3000 | 9/9 | 180–300 | perennial | short day (<12 hours) |
| Root | Sago palm | *Metroxylon sagu* | 25–36 | 18–40 | 3000–4500 | 2100–5800 | 0/10 | 365–365 | perennial | short day (<12 hours), neutr |
| Root | Enset | *Ensete ventricosum* | 16–24 | 8–30 | 1100–1500 | 900–1700 | -2/-2 | 365–365 | perennial | short day (<12 hours) |
| Root | Tiger nut | *Cyperus esculentus* | 14–26 | 4–30 | 500–1000 | 300–1700 | -1/-2 | 90–120 | perennial | short day (<12 hours), neutr |
| Root | Jerusalem artichoke | *Helianthus tuberosus* | 15–27 | 7–30 | 700–1500 | 300–2000 | NA/NA | 80–150 | perennial | short day (<12 hours) |
| Vegetable | Onion | *Allium cepa* | 12–25 | 4–30 | 350–600 | 300–2800 | NA/NA | 85–175 | biennial | short day (<12 hours), neutr |
| Vegetable | Garlic | *Allium sativum* | 18–30 | 7–35 | 750–1600 | 500–2700 | -5/-5 | 90–120 | biennial | long day (>14 hours) |
| Vegetable | Leek | *Allium ampeloprasum* | 18–24 | 6–27 | 750–1000 | 350–2800 | -5/-5 | 120–150 | annual, biennial | long day (>14 hours) |
| Vegetable | Carrot | *Daucus carota* | 15–24 | 3–30 | 600–1200 | 400–4000 | 0/-1 | 40–150 | biennial | long day (>14 hours) |
| Vegetable | Spinach | *Spinacia oleracea* | 13–20 | 2–27 | 800–1200 | 300–1700 | 0/-7 | 40–120 | annual | short day (<12 hours), neutr |
| Vegetable | Beet and chard | *Beta vulgaris* | 15–25 | 4–35 | 600–800 | 500–1000 | 0/-3 | 160–240 | biennial | long day (>14 hours) |
| Vegetable | Cabbage | *not in ECOCROP* | | | | | | | | |
| Vegetable | Turnip and Chinese cabbage | *Brassica campestris* | 17–30 | 5–41 | 700–1000 | 400–3500 | -1/-10 | 60–340 | annual | short day (<12 hours), neutr |
| Vegetable | Lettuce | *not in ECOCROP* | | | | | | | | |
| Vegetable | Artichoke | *Cynara scolymus* | 15–25 | 5–30 | 900–1200 | 300–1500 | 0/1 | 210–270 | perennial | short day (<12 hours), neutr |
| Vegetable | Asparagus | *Asparagus officinalis* | 15–30 | 6–38 | 800–1200 | 500–4000 | -1/-5 | 210–270 | perennial | short day (<12 hours), neutr |
| Vegetable | Cucumber | *Cucumis sativus* | 18–32 | 6–38 | 1000–1200 | 400–4300 | NA/NA | 40–180 | annual | short day (<12 hours), neutr |
| Vegetable | Melon | *Cucumis melo* | 18–30 | 9–35 | 1000–1300 | 900–2500 | NA/NA | 50–120 | annual | short day (<12 hours), neutr |
| Vegetable | Watermelon | *Citrullus lanatus* | 20–35 | 15–40 | 500–700 | 400–1800 | NA/NA | 0–0 | annual | long day (>14 hours) |
| Vegetable | Eggplant | *Solanum melongena* | 20–35 | 9–40 | 1200–1600 | 800–4000 | NA/NA | 70–120 | annual | short day (<12 hours), neutr |
| Vegetable | Okra | *Abelmoschus esculentus* | 20–30 | 12–35 | 600–1200 | 300–2500 | NA/NA | 50–180 | annual | short day (<12 hours) |
| Vegetable | Bottle gourd | *Lagenaria siceraria* | 19–27 | 12–38 | 1200–1800 | 700–2800 | NA/NA | 60–120 | annual | short day (<12 hours), neutr |
| Vegetable | Squash (pepo) | *Cucurbita pepo* | 17–30 | 6–40 | 600–1500 | 300–2800 | NA/NA | 40–100 | annual | short day (<12 hours), neutr |
| Vegetable | Squash (moschata) | *Cucurbita moschata* | 20–30 | 10–40 | 600–1600 | 300–2800 | NA/NA | 80–140 | annual | short day (<12 hours), neutr |
| Vegetable | Squash (maxima) | *Cucurbita maxima* | 20–30 | 9–38 | 600–1000 | 450–2700 | NA/NA | 80–140 | annual | short day (<12 hours), neutr |
| Vegetable | Chili pepper | *Capsicum annuum* | 17–30 | 8–35 | 600–1250 | 500–1700 | NA/NA | 60–180 | annual | short day (<12 hours), neutr |
| Vegetable | Aji | *Capsicum chinense* | 20–26 | 15–32 | 600–1250 | 500–1500 | NA/NA | 120–150 | annual | short day (<12 hours), neutr |
| Vegetable | Tomato | *Lycopersicon esculentum* | 20–27 | 7–35 | 600–1300 | 400–1800 | NA/NA | 70–150 | annual | short day (<12 hours), neutr |
| Vegetable | Tomatillo | *Physalis philadelphica* | 15–25 | 8–31 | 700–1000 | 600–1100 | NA/NA | 80–120 | annual | short day (<12 hours) |
| Vegetable | Chayote | *Sechium edule* | 19–30 | 12–40 | 800–2000 | 600–2600 | NA/NA | 100–180 | annual, perennial | short day (<12 hours), neutr |
| Vegetable | Lotus | *Nelumbo nucifera* | 25–30 | 10–40 | 2000–2800 | 700–4000 | -1/-5 | 120–200 | perennial | short day (<12 hours) |
| Fruit | Olive | *Olea europaea* | 20–34 | 5–40 | 400–700 | 200–1200 | 0/-10 | 365–365 | perennial |  |
| Fruit | Grape | *Vitis vinifera* | 18–30 | 10–38 | 700–850 | 400–1200 | -3/-20 | 160–270 | perennial | short day (<12 hours), neutr |
| Fruit | Fig | *Ficus carica* | 16–26 | 4–38 | 700–1500 | 300–2700 | -1/-12 | 120–300 | perennial | short day (<12 hours), neutr |
| Fruit | Date palm | *Phoenix dactylifera* | 26–45 | 10–52 | 200–300 | 100–400 | -4/-15 | 365–365 | perennial | short day (<12 hours) |
| Fruit | Pomegranate | *Punica granatum* | 23–32 | 8–40 | 900–1200 | 400–4200 | 0/-10 | 180–365 | perennial | short day (<12 hours) |
| Fruit | Carob | *Ceratonia siliqua* | 20–32 | 10–39 | 400–1000 | 200–2000 | 0/-4 | 210–365 | perennial | short day (<12 hours) |
| Fruit | Apple | *Malus domestica* | 14–27 | 8–33 | 700–2500 | 500–3200 | -2/-30 | 180–320 | perennial | short day (<12 hours), neutr |
| Fruit | Pear | *Pyrus communis* | 20–35 | 10–37 | 600–900 | 400–2100 | -9/-34 | 180–270 | perennial | short day (<12 hours), neutr |
| Fruit | Asian pear | *Pyrus pyrifolia* | 17–25 | 7–40 | 600–900 | 400–2100 | -1/-35 | 150–180 | perennial | short day (<12 hours), neutr |
| Fruit | Plum | *Prunus domestica* | 18–33 | 6–36 | 900–1500 | 600–1800 | -2/-10 | 180–210 | perennial | short day (<12 hours), neutr |
| Fruit | Sweet cherry | *Prunus avium* | 18–28 | 6–40 | 500–900 | 300–1500 | 0/-3 | 180–240 | perennial |  |
| Fruit | Sour cherry | *Prunus cerasus* | 15–25 | 4–30 | 800–1600 | 500–2700 | -4/-10 | 180–240 | perennial | short day (<12 hours), neutr |
| Fruit | Apricot | *Prunus armeniaca* | 14–35 | 7–40 | 900–1300 | 800–1470 | -1/-5 | 180–240 | perennial | short day (<12 hours), neutr |
| Fruit | Peach | *Prunus persica* | 20–33 | 7–35 | 900–1100 | 750–1600 | -5/-5 | 240–270 | perennial | short day (<12 hours), neutr |
| Fruit | Quince | *Cydonia oblonga* | 10–30 | 7–35 | 700–900 | 500–1100 | -1/-25 | 180–270 | perennial | short day (<12 hours) |
| Fruit | Persimmon | *Diospyros kaki* | 20–31 | 8–35 | 1000–1700 | 300–3000 | 0/-18 | 150–270 | perennial | short day (<12 hours), neutr |
| Fruit | Jujube | *not in ECOCROP* | | | | | | | | |
| Fruit | Mulberry | *Morus alba* | 20–28 | 13–45 | 700–2500 | 300–5100 | NA/NA | 180–330 | perennial | short day (<12 hours), neutr |
| Fruit | Banana | *Musa acuminata* | 23–33 | 12–42 | 1200–3600 | 650–5000 | 1/1 | 180–365 | perennial | short day (<12 hours), neutr |
| Fruit | Breadfruit | *Artocarpus altilis* | 21–33 | 16–40 | 1500–3000 | 1000–3500 | NA/NA | 300–365 | perennial | short day (<12 hours) |
| Fruit | Coconut | *Cocos nucifera* | 22–34 | 14–38 | 1200–2400 | 650–4000 | 0/-1 | 270–365 | perennial | short day (<12 hours), neutr |
| Fruit | Mango | *Mangifera indica* | 24–30 | 8–48 | 600–1500 | 300–2600 | 0/-1 | 150–365 | perennial | short day (<12 hours), neutr |
| Fruit | Jackfruit | *Artocarpus heterophyllus* | 20–30 | 16–34 | 1500–3000 | 700–4200 | NA/NA | 210–365 | perennial | long day (>14 hours) |
| Fruit | Orange | *Citrus sinensis* | 20–30 | 13–38 | 1200–2000 | 450–2700 | 0/-10 | 180–365 | perennial | short day (<12 hours), neutr |
| Fruit | Mandarin | *Citrus reticulata* | 23–34 | 12–38 | 1200–1800 | 300–4000 | NA/NA | 60–365 | perennial | short day (<12 hours), neutr |
| Fruit | Lemon | *Citrus limon* | 15–28 | 12–36 | 1000–2300 | 300–4000 | -2/-6 | 210–365 | perennial | short day (<12 hours), neutr |
| Fruit | Citron | *Citrus medica* | 21–27 | 12–35 | 1200–1400 | 800–2000 | -1/-2 | 210–365 | perennial | short day (<12 hours), neutr |
| Fruit | Pomelo | *Citrus grandis* | 23–32 | 12–40 | 1500–2500 | 700–4000 | NA/NA | 0–0 | perennial | short day (<12 hours), long  |
| Fruit | Lychee | *Litchi chinensis* | 20–35 | 15–40 | 1000–1700 | 700–2800 | -1/-5 | 100–270 | perennial | short day (<12 hours), neutr |
| Fruit | Longan | *not in ECOCROP* | | | | | | | | |
| Fruit | Durian | *Durio zibethinus* | 22–40 | 12–45 | 1500–2500 | 1200–3500 | NA/NA | 270–365 | perennial | short day (<12 hours), neutr |
| Fruit | Mangosteen | *Garcinia mangostana* | 20–30 | 15–40 | 1600–2000 | 1100–2800 | 4/4 | 365–365 | perennial | short day (<12 hours), neutr |
| Fruit | Rambutan | *Nephelium lappaceum* | 21–35 | 10–42 | 2000–3000 | 1400–4000 | 4/4 | 170–365 | perennial | short day (<12 hours), neutr |
| Fruit | Tamarind | *Tamarindus indica* | 20–35 | 12–45 | 800–3000 | 300–4500 | -1/-3 | 70–210 | perennial | short day (<12 hours), neutr |
| Fruit | Avocado | *Persea americana* | 14–40 | 10–45 | 500–2000 | 300–2500 | -1/-4 | 0–0 | perennial |  |
| Fruit | Papaya | *Carica papaya* | 21–30 | 12–44 | 1500–2500 | 1000–3000 | -1/-1 | 330–365 | perennial | short day (<12 hours), neutr |
| Fruit | Guava | *Psidium guajava* | 20–33 | 10–45 | 1000–3000 | 400–5000 | -1/-5 | 150–365 | perennial | short day (<12 hours) |
| Fruit | Pineapple | *Ananas comosus* | 21–30 | 10–36 | 800–2500 | 550–3500 | NA/NA | 330–365 | perennial | short day (<12 hours) |
| Fruit | Cherimoya | *Annona cherimola* | 17–25 | 7–32 | 800–1200 | 600–2200 | 0/-1 | 240–270 | perennial | short day (<12 hours), neutr |
| Fruit | Peach palm | *Bactris gasipaes* | 18–28 | 12–35 | 2000–4000 | 1500–6000 | NA/NA | 365–365 | perennial | short day (<12 hours), neutr |
| Fruit | Prickly pear | *Opuntia ficus-indica* | 18–26 | 10–30 | 700–1300 | 300–1700 | NA/NA | 140–270 | perennial | short day (<12 hours) |
| Fruit | Ackee | *Blighia sapida* | 24–27 | 20–34 | 2000–4000 | 700–6000 | -1/-3 | 150–365 | perennial | short day (<12 hours) |
| Berry | Strawberry | *Fragaria x ananassa* | 11–24 | 6–28 | 600–900 | 300–1700 | NA/NA | 180–270 | perennial | short day (<12 hours), neutr |
| Berry | Raspberry | *not in ECOCROP* | | | | | | | | |
| Berry | Blackcurrant | *Ribes nigrum* | 17–25 | 5–30 | 700–900 | 500–1100 | -1/-28 | 150–180 | perennial | long day (>14 hours) |
| Berry | Blueberry | *Vaccinium corymbosum* | 18–30 | 7–42 | 900–1100 | 700–1300 | -1/-29 | 160–200 | perennial | short day (<12 hours), neutr |
| Berry | Cranberry | *Vaccinium macrocarpon* | 16–24 | 4–27 | 600–1000 | 400–1300 | -1/-5 | 100–180 | perennial | short day (<12 hours), neutr |
| Nut | Almond | *Prunus amygdalus* | 12–35 | 10–40 | 600–900 | 250–1500 | -1/-5 | 150–240 | perennial | short day (<12 hours), neutr |
| Nut | Pistachio | *Pistacia vera* | 25–35 | 12–40 | 400–700 | 250–1100 | -1/-18 | 150–180 | perennial | short day (<12 hours) |
| Nut | Walnut | *Juglans regia* | 15–30 | 7–40 | 800–1700 | 400–2200 | -2/-24 | 150–180 | perennial | long day (>14 hours) |
| Nut | Hazelnut | *Corylus avellana* | 10–24 | 5–35 | 900–1100 | 600–1400 | -3/-10 | 150–210 | perennial | short day (<12 hours), neutr |
| Nut | Chestnut | *Castanea sativa* | 15–25 | 7–30 | 900–1300 | 500–1600 | NA/NA | 150–210 | perennial | long day (>14 hours) |
| Nut | Brazil nut | *Bertholletia excelsa* | 20–36 | 12–40 | 2400–2800 | 1400–3500 | NA/NA | 365–365 | perennial | short day (<12 hours), neutr |
| Nut | Cashew | *Anacardium occidentale* | 15–35 | 5–46 | 750–1600 | 400–4000 | NA/NA | 190–260 | perennial | short day (<12 hours), neutr |
| Nut | Kola | *Cola nitida* | 21–30 | 10–35 | 1400–2500 | 1200–3500 | NA/NA | 150–365 | perennial | short day (<12 hours) |
| Nut | Candlenut | *Aleurites moluccana* | 18–28 | 14–32 | 1000–1800 | 600–4300 | NA/NA | 240–365 | perennial | short day (<12 hours) |
| Nut | Canarium | *Canarium indicum* | 22–28 | 10–34 | 2000–4000 | 1200–6000 | NA/NA | 240–300 | perennial | short day (<12 hours) |
| Nut | Pecan | *Carya illinoensis* | 15–35 | 5–40 | 600–1200 | 400–1800 | -1/-20 | 140–210 | perennial | short day (<12 hours), neutr |
| Nut | Macadamia | *Macadamia integrifolia* | 10–26 | 8–35 | 1000–3000 | 700–3500 | NA/NA | 365–365 | perennial |  |
| Spice | Black pepper | *Piper nigrum* | 22–35 | 10–40 | 2500–4000 | 2000–5500 | NA/NA | 180–270 | perennial | short day (<12 hours), neutr |
| Spice | Cardamom | *Elettaria cardamomum* | 22–30 | 10–35 | 3000–6000 | 1500–7000 | NA/NA | 240–365 | perennial | short day (<12 hours) |
| Spice | Cinnamon | *Cinnamomum verum* | 24–30 | 18–36 | 2000–2600 | 1200–3000 | NA/NA | 300–365 | perennial | short day (<12 hours) |
| Spice | Cassia | *Cinnamomum cassia* | 15–32 | 10–38 | 1100–1500 | 900–3000 | -2/-6 | 250–325 | perennial | short day (<12 hours) |
| Spice | Turmeric | *Curcuma longa* | 20–28 | 18–32 | 1000–2000 | 800–3000 | NA/NA | 270–300 | perennial | short day (<12 hours) |
| Spice | Ginger | *Zingiber officinale* | 19–29 | 13–35 | 1400–3000 | 700–4000 | NA/NA | 270–365 | annual, perennial | short day (<12 hours), neutr |
| Spice | Clove | *Eugenia aromatica* | 24–34 | 20–38 | 1500–3600 | 1200–4000 | 0/5 | 300–365 | perennial | short day (<12 hours) |
| Spice | Nutmeg | *Myristica fragrans* | 22–34 | 12–38 | 1500–3500 | 1200–4000 | 0/5 | 365–365 | perennial | short day (<12 hours), neutr |
| Spice | Saffron | *Crocus sativus* | 7–19 | 4–23 | 800–900 | 400–1100 | NA/NA | 180–210 | perennial | short day (<12 hours), neutr |
| Spice | Vanilla | *Vanilla planifolia* | 21–30 | 10–33 | 2000–2500 | 1500–3000 | NA/NA | 180–300 | perennial | short day (<12 hours) |
| Spice | Allspice | *Pimenta dioica* | 15–32 | 10–35 | 1500–2500 | 1000–3500 | NA/NA | 150–365 | perennial | short day (<12 hours) |
| Spice | Annatto | *Bixa orellana* | 20–28 | 15–36 | 1500–2000 | 1250–2500 | NA/NA | 150–365 | perennial | short day (<12 hours) |
| Spice | Cumin | *Cuminum cyminum* | 17–26 | 9–30 | 1200–1800 | 800–2700 | NA/NA | 60–110 | annual | short day (<12 hours) |
| Spice | Nigella | *Nigella sativa* | 14–26 | 5–30 | 600–800 | 400–1000 | NA/NA | 100–150 | annual | short day (<12 hours) |
| Spice | Mustard | *Brassica nigra* | 10–25 | 5–27 | 600–1400 | 300–2500 | -1/-5 | 120–180 | annual | long day (>14 hours) |
| Spice | Sichuan pepper | *not in ECOCROP* | | | | | | | | |
| Herb | Coriander | *Coriandrum sativum* | 15–25 | 4–32 | 500–1400 | 300–2600 | 0/-10 | 35–140 | annual | short day (<12 hours), neutr |
| Herb | Dill | *Anethum graveolens* | 15–18 | 6–26 | 800–1200 | 500–1700 | 0/-2 | 100–180 | annual, biennial | long day (>14 hours) |
| Herb | Fennel | *Foeniculum vulgare* | 15–25 | 6–32 | 700–1500 | 300–2600 | -2/-5 | 30–110 | biennial, perennial | long day (>14 hours) |
| Herb | Oregano | *Origanum vulgare* | 17–28 | 4–32 | 700–1300 | 400–2700 | 0/-5 | 180–300 | perennial | short day (<12 hours), neutr |
| Herb | Thyme | *Thymus vulgaris* | 16–25 | 4–30 | 700–1500 | 400–2600 | NA/NA | 100–200 | perennial | long day (>14 hours) |
| Herb | Sage | *Salvia officinalis* | 15–26 | 5–30 | 500–1000 | 300–1500 | NA/NA | 120–240 | perennial | short day (<12 hours), neutr |
| Herb | Rosemary | *Rosmarinus officinalis* | 18–30 | 8–38 | 600–1400 | 300–2700 | NA/NA | 120–270 | perennial | short day (<12 hours), neutr |
| Herb | Bay laurel | *Laurus nobilis* | 17–25 | 8–30 | 600–1000 | 300–2200 | -1/-5 | 120–180 | perennial | short day (<12 hours), neutr |
| Herb | Peppermint | *Mentha piperita* | 15–25 | 4–35 | 1000–2200 | 700–4000 | 0/-8 | 40–330 | perennial | short day (<12 hours), neutr |
| Herb | Spearmint | *not in ECOCROP* | | | | | | | | |
| Herb | Parsley | *Petroselinum crispum* | 11–20 | 7–28 | 900–1500 | 300–2800 | 0/-5 | 70–365 | perennial | short day (<12 hours), neutr |
| Herb | Basil | *Ocimum basilicum* | 18–27 | 7–36 | 1000–1600 | 600–4300 | NA/NA | 80–270 | annual | short day (<12 hours), neutr |
| Herb | Perilla | *Perilla frutescens* | 5–30 | NA–NA | 250–600 | NA–NA | NA/NA | 80–150 | annual | short day (<12 hours) |
| Oil | Flax | *Linum usitatissimum* | 16–24 | 5–30 | 500–800 | 250–1300 | -1/-6 | 80–180 | annual, biennial, perennial | neutral day (12-14 hours), l |
| Oil | Sesame | *Sesamum indicum* | 20–30 | 10–40 | 500–1000 | 300–1500 | NA/NA | 40–180 | annual | short day (<12 hours), neutr |
| Oil | Opium poppy | *Papaver somniferum* | 15–24 | 3–28 | 800–1200 | 300–1700 | 0/-5 | 135–210 | annual | long day (>14 hours) |
| Oil | Safflower | *Carthamus tinctorius* | 20–32 | 5–45 | 600–1000 | 300–1400 | -2/-14 | 120–245 | annual | short day (<12 hours), neutr |
| Oil | Rapeseed | *Brassica napus* | 15–25 | 5–41 | 500–1000 | 400–2800 | -6/-15 | 85–340 | annual, biennial | neutral day (12-14 hours), l |
| Oil | Camelina | *Camelina sativa* | NA–NA | NA–NA | NA–NA | NA–NA | NA/NA | 0–0 | annual |  |
| Oil | Sunflower | *Helianthus annuus* | 17–34 | 5–45 | 600–1000 | 300–1600 | 0/-10 | 70–200 | annual | short day (<12 hours) |
| Oil | Oil palm | *Elaeis guineensis* | 20–35 | 12–38 | 1500–3000 | 1000–8000 | NA/NA | 300–365 | perennial | short day (<12 hours), neutr |
| Oil | Shea | *Vitellaria paradoxa* | 24–38 | 18–43 | 500–1000 | 300–1800 | NA/NA | 180–NA | perennial | short day (<12 hours) |
| Oil | Noog | *Guizotia abyssinica* | 18–26 | 11–34 | 1000–1300 | 500–3000 | NA/NA | 90–150 | annual | short day (<12 hours) |
| Oil | Castor | *Ricinus communis* | 20–30 | 15–39 | 600–1000 | 400–2000 | 0/-2 | 140–210 | perennial | neutral day (12-14 hours), l |
| Sugar | Sugarcane | *Saccharum officinarum* | 24–37 | 15–41 | 1500–2000 | 1000–5000 | 0/-2 | 210–365 |  |  |
| Sugar | Sugar beet | *Beta vulgaris var. saccharifera* | 15–25 | 7–30 | 400–700 | 250–1000 | -1/-3 | 60–140 | biennial | long day (>14 hours) |
| Drink | Tea | *Camellia sinensis* | 20–30 | 8–35 | 1400–2000 | 1000–5000 | 0/-5 | 240–365 | perennial | short day (<12 hours), neutr |
| Drink | Arabica coffee | *Coffea arabica* | 14–28 | 10–34 | 1400–2300 | 750–4200 | NA/NA | 210–330 | perennial | short day (<12 hours), neutr |
| Drink | Robusta coffee | *Coffea canephora* | 20–30 | 12–36 | 1700–3000 | 900–4000 | 5/5 | 270–300 | perennial | short day (<12 hours), neutr |
| Drink | Cacao | *Theobroma cacao* | 21–32 | 10–38 | 1200–3000 | 900–7600 | 0/5 | 180–365 | perennial | short day (<12 hours), neutr |
| Drink | Yerba mate | *Ilex paraguariensis* | 17–26 | 12–30 | 1200–2000 | 700–2500 | -1/-6 | 210–300 | perennial | short day (<12 hours) |
| Drink | Guarana | *Paullinia cupana* | 24–32 | 18–38 | 2000–2500 | 1100–3000 | 0/10 | 270–365 | perennial | short day (<12 hours) |
| Drink | Coca | *Erythroxylum coca* | 17–23 | 14–27 | 1000–2100 | 700–4000 | -1/-5 | 150–180 | perennial | short day (<12 hours) |
| Drink | Khat | *Catha edulis* | 18–24 | 7–32 | 800–1100 | 400–1300 | NA/NA | 120–210 | perennial | short day (<12 hours) |
| Drink | Areca | *Areca catechu* | 16–33 | 7–39 | 1500–3000 | 750–5000 | NA/NA | 240–365 | perennial | long day (>14 hours) |
| Drink | Kava | *Piper methysticum* | 22–35 | 14–40 | 2200–4000 | 1800–5000 | NA/NA | 300–365 | perennial | short day (<12 hours) |
| Drink | Tobacco | *Nicotiana tabacum* | 15–30 | 7–35 | 500–750 | 350–3000 | -1/-3 | 70–150 | annual, biennial | short day (<12 hours), neutr |
| Drink | Hops | *Humulus lupulus* | 15–19 | 8–35 | 400–700 | 300–1300 | NA/NA | 150–210 | perennial | short day (<12 hours), neutr |
| Fibre | Hemp | *not in ECOCROP* | | | | | | | | |
| Fibre | Ramie | *Boehmeria nivea* | 17–27 | 10–34 | 1500–2500 | 1000–4000 | NA/NA | 45–365 | perennial | short day (<12 hours), neutr |
| Fibre | Tree cotton | *Gossypium arboreum* | 26–36 | 18–38 | 750–1250 | 500–1500 | NA/NA | 190–210 | annual, perennial | short day (<12 hours), neutr |
| Fibre | Levant cotton | *Gossypium herbaceum* | 26–36 | 18–38 | 750–1250 | 200–1500 | NA/NA | 190–210 | biennial, perennial | short day (<12 hours), neutr |
| Fibre | Upland cotton | *Gossypium hirsutum* | 22–36 | 15–42 | 750–1200 | 450–1500 | NA/NA | 150–200 | annual, perennial | short day (<12 hours), neutr |
| Fibre | Pima cotton | *Gossypium barbadense* | 22–32 | 15–38 | 750–1250 | 500–1500 | NA/NA | 180–210 | perennial | short day (<12 hours), neutr |
| Fibre | Jute | *Corchorus capsularis* | 20–37 | 13–45 | 1500–3000 | 900–3600 | NA/NA | 80–150 | annual | short day (<12 hours) |
| Fibre | Henequen and sisal | *Agave fourcroydes* | 15–30 | 10–40 | 900–1250 | 700–2500 | -5/-5 | 210–330 | perennial | short day (<12 hours) |
| Fibre | Paper mulberry | *Broussonetia papyrifera* | 15–28 | 12–38 | 800–2500 | 500–3000 | 0/-10 | 0–0 | perennial |  |
| Fibre | Indigo | *Indigofera tinctoria* | 22–28 | 7–32 | 1300–1700 | 640–3000 | NA/NA | 90–210 | perennial | short day (<12 hours) |
| Fibre | Woad | *not in ECOCROP* | | | | | | | | |

<!-- 208 crops, 10 not found: Finger millet (Eleusine coracana); Cabbage (Brassica oleracea); Lettuce (Lactuca sativa); Jujube (Ziziphus jujuba, Zizyphus jujuba); Longan (Dimocarpus longan, Euphoria longan); Raspberry (Rubus idaeus); Sichuan pepper (Zanthoxylum piperitum, Zanthoxylum bungeanum, Zanthoxylum simulans); Spearmint (Mentha spicata); Hemp (Cannabis sativa); Woad (Isatis tinctoria) -->

## 4. How crops spread

### 4.1 Measured speeds

| Expansion | km a year | Source |
|---|---|---|
| Neolithic Europe, overall (735 sites) | 0.6–1.3 | Pinhasi, Fort & Ammerman 2005 |
| 18 inland expansions worldwide | ~1 (Iran–Indus 0.6–1.3; India 1.7–1.9; East Asian rice 0.7–1.3; Bantu east 0.5–1.5, south 1.3–2.5; South America 0.7–2.5) | Fort 2026 |
| Central Balkans; Balkans → north Germany | 1.2–2.1; slowing 1.6 → ~0 | Fort 2026 |
| Alps; Galicia; Cantabria | 0.09–0.14; 0.26–0.29; 0.11–0.23 | Fort 2026 |
| LBK along the Danube | 1.4–4.2 (Henderson 2014; 5.6 Ammerman & Cavalli-Sforza) — then 1,300 years for the last 250 km into Denmark | Fort 2026; Rowley-Conwy 1985 |
| Mediterranean coast (Impressa/Cardial) | 7.5–10.6: 2,500 km in ~300 years, by sea hops of ~350 km a generation (1.7 without sea travel) | Isern et al. 2017 |
| …but Cyprus → southern Italy | ~0.65 | Fort 2026 |
| Scandinavia | 0.44–0.66 (the continent 0.9–1.0) | Fort, Pareta & Sørensen 2018 |
| Rice into Japan | 0.9–2.4 (median ~1.4); < 1 at first in Kyushu, ~4 Chugoku/Kansai, ≤ 1 from Kanto north; ~500 years' pause at the Korea Strait *(derived)* | Crema et al. 2022 |
| Rice and millet to mainland SE Asia | farmers by ~4000 BP, along coasts and rivers | Wang et al. 2022 |
| Broomcorn millet across Europe once arrived (through farmers) | across the continent in 1–2 centuries | Filipović et al. 2020 |
| Maize, Balsas → US Southwest | ~0.4 *(derived)*, by 2100 cal BC; staple in the Eastern Woodlands only ~AD 900, ~3,000 years later; then Plains → Northeast in < 170 years | Merrill 2009; Emerson 2020; Hart 2024 |
| Lapita, Bismarcks → Tonga/Samoa | > 8 (4,550 km), then a ~1,500-year standstill; East Polynesia in two pulses AD 1025–1120, 1190–1290 | Fort 2026; Wilmshurst 2011 |
| Canoe plants | ~60 species: nearly all to Tonga, ~24–27 to Hawaiʻi, ~6 to New Zealand (climate) | Te Ara |
| Bantu | rainforest 0.05–0.10; savanna 0.39–0.98; Zambezi 4.3; Congo 1.4; savanna → rainforest ~300 years longer a step | Russell 2014; Grollemund 2015 |
| Potato | once, southern Peru > 7 ka; never left the Andes before 1492 | Spooner 2005 |

### 4.2 Climate as a barrier

- Climate similarity governs spread (well supported); "east–west continents are special" is weak — Laitin et al. 2012's
  effect ~±5 %; Chira, Gray & Botero 2024 (least-cost paths minimising temperature and aridity change, from 16 origins of
  farming): Eurasia's corridors no more uniform than other continents'.
- Betti et al. 2020: farming in Europe stalled ~1,600 years (6100–4500 BCE) at the growing-degree-day threshold of the
  Near Eastern package, on 3 of 4 routes (not the warm Mediterranean one).
- Silva & Steele 2014: an 1,100 m altitude cut-off and speed halving 40°N → 55°N (1.05 → 0.525 km a year) fit better than
  geography-free models.
- Liu et al. 2019: before 5000 BC crops moved only between neighbours of compatible climate and seasonality (monsoon east,
  westerlies west); crossing a seasonality regime took ~2,000–3,000 years (winter wheat into summer-rain China, millets
  west, 2500–1500 BC).
- d'Alpoim Guedes & Bocinsky 2018: crop thermal niches by growing degree days; wheat and barley replaced millets on the
  cooling NE Tibetan Plateau ~4000 BP.
- Fort 2026: no climate-only model reproduces the northern slowdown without tuning; forager competition does (§4.4) — both
  are at work.

### 4.3 By kind of crop

- **Seed crops** adapt by selection (photoperiod-insensitive barley and millets went north). **Clonal crops** are not slow
  to travel (Lapita carried taro, yams and bananas at > 8 km a year by canoe) but are climate-locked: a better-suited
  stock replaces them rather than adapting (Chilean long-day potatoes displaced Andean short-day ones in Europe by the
  1840s; Ames & Spooner 2008).
- **Fruit trees**: olive, grape, date, fig ~5,000 years after the cereals (cloning by cuttings); apples spread with trade and
  cities, not with farmers' frontiers.
- **Spices**: nutmeg only in Banda until the 1750s–70s; cloves only in the Moluccas until ~1770; cinnamon wild-harvested in
  Sri Lanka until Dutch plantations ~1765; pepper from Malabar (in Ramesses II's mummy ~1213 BC?) — goods for ~3,000
  years without their cultivation spreading.
- **Crops tied to peoples**: Madagascar's Asian crops beside the mainland's African ones; early farmers kept the most
  productive crops for each new place and dropped others (Colledge 2005; Coward 2008).

### 4.4 Where farming came slowly, or never

- Fort's competition model: speed = 2√(aD(1 − m)), m the local forager density ÷ the regional maximum — reproduces the
  inland European slowdown 1.6 → 0 km a year with no fitted parameters.
- Denmark (Ertebølle) ~0.2 km a year for ~1,300 years; Atlantic Iberia 0.1–0.3; rice slowest in Japan's dense-Jomon east;
  Hokkaido never (cold and rich coasts; upland crops only from the 9th century AD).
- Never adopted: the Pacific Northwest (salmon), California (acorns, burning), Australia (a gradient across the Torres
  Strait, despite contact).
- Forager density: net primary productivity is the main predictor — subtropical and temperate forests carry the most
  foragers (Tallavaara 2018; a model explaining 77 % of density over 220 societies, Kavanagh 2018); marine richness
  (upwelling, cold-current coasts, salmon rivers) and nut-mast forests a consistent but unquantified pattern.

### 4.5 Secondary and multiple domestication

- Secondary domestication — a local plant domesticated where an arriving package met it — is common (Larson 2014): rye
  (Neolithic weed → crop by the early Iron Age; Behre 1992) and oats; indica rice (proto-indica on the Ganges, completed
  ~2000–1500 BC by hybridising with arriving japonica); sorghum's domestic forms first in India after 4000 BP; India's five
  candidate local centres (Fuller 2011); eastern North America (squash, sunflower, marshelder, chenopod, by 3800 BP) —
  later displaced by maize.
- Multiple independent domestications: rice (Asia; Africa ~3000 BP — African rice declined as Asian rice replaced it, the
  last 500 years), cotton (four species), common bean (Mesoamerica and the Andes), squash, coconut, grape, apricot, melon.
  At least 11 independent centres (Larson), "perhaps more than 20" (Fuller 2014); across 203 crops multiple origins are
  rarer than the well-studied crops suggest (Meyer 2012).

### 4.6 Models

- Wave of advance: speed 2√(aD), a 0.023–0.033 a year, 20–30 km a 25-year generation → 0.7–1.0 km a year; the cultural
  share of the spread ≤ 48 % (Fort 2012).
- Davison et al. 2006: background 1 km a year; + 5 within 15 km of major rivers; + 20 within 30 km of coasts; slower beyond
  54°N; sea-faring reach 40 km.
- Silva & Steele 2014 (best fit), relative speeds: northern Mediterranean coast 2.0, Danube/Rhine 0.5, temperate broadleaf
  and Mediterranean forest 0.2, other coasts and conifer forest 0.1, the rest 1.0.
- van Etten & Hijmans 2010: water easy to cross, with a decay of thousands of km. Silva et al. 2015: rice's origin by
  least-cost distance. GLUES (Lemmen 2011): agent-based.

## 5. Wild rice and the other wild staples

### 5.1 The species

- ***Zizania palustris*** (northern, annual; the grain staple): Great Lakes states and the boreal lakes of Ontario,
  Manitoba, Saskatchewan and Alberta; northern limit ~50°N (Jenks), harvests to ~53°N east of Lake Winnipeg (old source),
  Saskatchewan's commercial lakes 54–58°N (partly seeded). Köppen Dfb, Dfc at its north, Dfa at its south.
- ***Z. aquatica*** (southern, annual): the St Lawrence to Florida and Louisiana (~30–47°N), fresh to slightly brackish
  tidal shores; Cfa, Dfa/Dfb; grain "more slender and difficult to harvest" (MN DNR) — never the staple.
- ***Z. texana*** (perennial): only the spring-fed San Marcos River, Texas — endangered.
- ***Z. latifolia*** (perennial, rhizomes; Manchurian wild rice): the Amur and eastern China 21–50°N, Korea, Japan,
  Taiwan, Assam; Dwa/Dwb to Cwa/Cfa; best water 5–40 cm deep; grows above 5 °C. One of the Zhou's six grains (菰, the
  grain 菰米 / 雕胡); no longer harvested as grain after the Tang (famine food by the Song) as lakes were drained for paddy;
  since eaten as the smut-swollen stem jiaobai (> 60,000 ha today). **Gathered wild, as far as anyone knows** — no
  evidence it was ever sown for grain (§5.6).

### 5.2 Habitat (*Z. palustris*)

- **Depth** 15–90 cm (MN DNR); Saskatchewan ideal 75–105, workable 45–135 cm. **Flow**: "generally requires some moving
  water" — rivers, flowages, lakes with inlets and outlets; sheltered bays. **Water level** stable or slowly falling (high
  water at the floating-leaf stage, late May–June, uproots it: the main cause of failure).
- **Clarity**: 11 of 12 sites with transparency < 30 cm had none. **Sediment**: soft organic, > 45 cm deep.
  **pH** 6–8, alkalinity > 40 ppm.
- **Sulfate**: Minnesota's 10 mg/L standard; the median wild-rice lake 1.8 mg/L; the harm is sulfide made from it in the
  sediment (present at 74 % of sites under 1,000 µg/L porewater sulfide, 23 % above) — fresh, through-flowing water; no
  closed or saline basins (Myrbo et al. 2017).
- **Cold**: seed needs 3–4 months dormant in near-freezing water (≤ 1.7 °C), dies if dried; germinates at 4–7 °C water
  (April in Minnesota); "favorable wild rice habitat has long, cold winters"; summer water 21.9 °C (median, with rice)
  against 23.7 °C (without).
- **Season**: 110–130 days to seed drop (~100 in the north); Minnesota ~1,440 °C-days > 4.4 °C *(derived)*; Saskatchewan
  lakes 900–1,300 °C-days > 5 °C; poor in the hot humid US South; harvest mid-August to September, a stand ripening over
  10–30 days, shattering 3–6 % of its crop a day.
- **Glaciated lake country**: "thrived in shallow lakes, rivers, and streams left behind by melting glaciers … most commonly
  in areas of glacial moraines" (MN DNR) — kettle lakes, deranged drainage, soft organic beds, low-sulfate shield and till
  waters, long ice cover.

### 5.3 Food

- **Wild stands**: ~56 kg/ha green (~22–28 kg/ha finished) hand-harvested (Oelke 1982); good Manitoba lakes 335–450 kg/ha
  green; total seed set > 560 kg/ha (MN DNR). Finished grain 40–50 % of green weight. **Boom and bust**: 3–5-year cycles;
  Minnesota's natural harvest 1940–72 from 20,000 lb to nearly 4 million lb a year; a failure "threatened the people with
  starvation" (Jenks).
- **Paddies** (bred non-shattering, since the 1950s–60s): ~325 kg/ha finished in Minnesota, ~670 in California.
- **Against wheat**: the Winchester estates (1283–1349) 515 kg/ha gross, 385 net (*?*: a weak source; the BAHS dataset);
  England 0.56 t/ha in 1275, 0.34 in 1455, 0.95 in 1705 (https://ourworldindata.org/grapher/wheat-yields). Maize without
  the plough: ~1,185 kg/ha (19th-century Native American), ~627 prehistoric
  (https://www.cambridge.org/core/journals/american-antiquity/article/maize-productivity-in-the-eastern-woodlands-and-great-plains-of-north-america/054A9C9CCDE28C237E3893B41D40FED6).
  Nutrition: 357 kcal and 14.7 g protein per 100 g (USDA), lysine-rich.
- **Stores well** parched (pits, skin sacks, "till the return of their harvest"); seed for sowing must stay wet and cold.
- **Per km² of heartland** *(derived)*: beds cover ~0.13 % of Minnesota (64,328 acres in 1,292 lakes and river stretches)
  and ~0.35 % of its five core counties; at ~75 kg/ha finished × 0.35 ha a km² ≈ 26 kg ≈ 94,000 kcal ≈ 0.12 person-years
  a km² — about **1/300 of a medieval wheat landscape's** (~35 M kcal, ~40 person-years a km²). It cannot compete with a
  field crop.

### 5.4 The people it fed

- Jenks 1900's "wild-rice district" (northern and northeastern Wisconsin, Minnesota east of the Mississippi, ~43.5–49.4°N):
  about a fifth of the Old Northwest with an Indian population "equal to all the other country" — ~4× the density;
  Schoolcraft 1853: > 22,000 in the district against < 21,000 in the rest. Rough district-wide ~0.15 people a km² *(derived,
  uncertain)*.
- Diet share unsourced (a "25 %" figure online is uncited); the Menominee "in times of scarcity of game, they subsist
  entirely upon it" (1843); the Mdewakanton grew maize and beans but "always used wild rice for bread" (Pike 1806).
  Estimate 10–40 % of calories *(uncertain)*.
- The Menominee are named for it; Ojibwe migration stories end where "the food that grows on water" is found; also
  Dakota, Ho-Chunk, Potawatomi, Sauk, Fox, Assiniboine. Proto-cultivation: the Assiniboine and Ojibwe sowed lakes, weeded,
  tied stalks into family-owned sheaves; the Menominee "absolutely refuse to sow".
- **Never domesticated**: it shatters and ripens unevenly over weeks; seed must stay wet and cold; water levels cannot be
  controlled without dikes; non-shattering types appeared only after the 1960s (recessive, two genes); and it was
  abundant without labour.

### 5.5 Other wild staples

- **Sago** (*Metroxylon*): Af freshwater swamps of lowland New Guinea and the Moluccas — ~244 kg of starch a palm; wild
  stands ~7–11 t starch/ha/yr (J-STAGE) — food enough to compete with crops.
- **Water caltrop** (*Trapa*): selected at Tianluoshan 7000–6300 BP, lower-Yangtze lakes.
- **Acorns**: California — 0.5–1.1 people a km² (Kroeber; ×3? Baumhoff), against 0.025–0.05 in the Great Basin.
- **Mongongo**: Kalahari sands, a third to a half of !Kung calories (secondary sources).
- Lotus, cattail, camas, chestnut: real staples or supplements, no solid numbers found (some in §6.3).

### 5.6 Wild rice farmed (follow-up, 2026-10-29)

The developer wants wild rice farmed on this world ("think outside the box into these alternative worlds"), as a regional
grain grown where it makes sense. What farming it takes:

- **Minnesota's domestication**: the Godwards diked a 1-acre paddy near Merrifield in 1950 (seed from wild stands; its
  second crop lost to brown spot); Yagyu and Brooks found shatter-resistant plants in a grower's field in 1963, the source
  of every cultivar since (https://hort.purdue.edu/newcrop/proceedings1993/v2-235.html); paddies 354 ha (1968) → 7,090 ha
  (1973); K2 1972, M3 1974, then Netum … Itasca-C20 2018, RayGun 2023
  (https://www.lrl.mn.gov/docs/2024/mandated/240126.pdf). Shatter resistance, synchronous tillering, larger seed came by
  "automatic selection" — sowing harvested seed — "the largest modern effort to domesticate a cereal grain" (Hayes et al.
  1989, https://link.springer.com/article/10.1007/BF02859862). Lake ricing, where shed seed resows the bed, never selected
  for it *(inference)*.
- **Still unfinished**: shatter losses 11–27 % (mean 16 %, 1997–99 trials); self-reseeding paddies drift back toward
  shattering (California replants certified seed after the 4th year,
  https://wildrice.ucdavis.edu/sites/g/files/dgvnsk14566/files/inline-files/256323.pdf); brown spot (no resistance found),
  stem rot; seed stores only 1–2 years.
- **Yields** (green = fresh, 35–50 % moisture; finished ≈ 40 % of green in Minnesota, 50 % in California): shattering
  types 168–224 kg/ha green; non-shattering up to 1,680; Minnesota farms ≈ 813 green ≈ 325 finished
  (https://www.auri.org/news/article/native-grains-yields-improve-with-new-varieties/); California ≈ 1,793 green
  ≈ 670–900 finished. Wild stands harvested ≈ 56–100 kg/ha green; potential 600–1,000 (Saskatchewan 1987,
  https://ualberta.scholaris.ca/handle/123456789/16050) — lake crops excellent ~1 year in 4.
- **Nutrition** (per 100 g, USDA FoodData Central): wild rice 357 kcal, 14.7 g protein; brown rice ~366 kcal, 7.5 g; hard
  red winter wheat 327 kcal, 12.6 g; maize 365 kcal, 9.4 g. Lysine-rich.
- **Paddies**: flat (< 0.5 % slope), diked, on peat (Minnesota, "previously unused land, often peat bog") or clay
  (California); flooded ≥ 15 cm for 8–10 weeks (> 36 cm weak stems), drained 2–3 weeks before harvest; self-reseeded 3–4
  years then fallow or replanted; rotated with small grains, not barley (brown spot's host). Harvest at 35–40 % dark
  kernels; cured 4–7 days, parched to 7 % moisture, hulled. Finished grain keeps ~10 years
  (https://www.lrl.mn.gov/docs/2008/mandated/080235.pdf); seed for sowing kept in water at 0.5–1.7 °C.
- **Climate limits** (USDA ERS 1996, https://legacy.rma.usda.gov/pilots/feasible/PDF/wildrice.pdf; Purdue AFCM,
  https://hort.purdue.edu/newcrop/afcm/wildrice.html): 110–130 days, ~1,440 °C-days over 4.4 °C; fewer flowers under 14 h
  days; poor in the hot humid US South (heat and short days speed it, humidity brings leaf disease); California's cool
  nights and dry air suit it; early frost kills and shatters. Brown spot worst with days 25–35 °C, nights ≥ 20 °C,
  humidity > 89 % (https://apsnet.org/publications/plantdisease/backissues/Documents/1987Abstracts/PD_71_419.htm).
- **It takes where it can**: Saskatchewan had none of its own; its seeded lakes gave > 550 t in 1987. Grown also in
  Idaho, Oregon, Hungary, Australia (ERS; https://www.frontiersin.org/articles/10.3389/fpls.2023.1183739).
- **Seed**: dies dried below ~6 % moisture (rice tolerates 2 %, https://pmc.ncbi.nlm.nih.gov/articles/PMC159216) —
  "intermediate" rather than recalcitrant; it cannot travel as dry seed grain *(inference: slower, waterborne spread)*.
- **Indigenous sowing** (Jenks 1900, https://archive.org/details/wildricegatherer00jenkuoft): the Ojibwe sowed rice "from
  purely economic motive"; Lac Courte Oreilles held all the rice to the Red River sown by their ancestors; families
  harvested beds their grandparents sowed, tied sheaves to mark them; Rice Lake people weeded competing grass. Use > 2,000
  years (MN DNR 2008); phytoliths in pot crust ~170 CE at Ogema-Geshik
  (https://fromsitetostory.org/nhr/21ic0012ogemageshik/21ic0012ogemageshik.asp).
- **China's gu**: tribute grain in the Zhou, "famous for tender taste" in the Tang, abandoned after
  (https://www.frontiersin.org/journals/plant-science/articles/10.3389/fpls.2019.01406/full) — heavy shattering, low
  yield, lakes drained for paddy (Xie et al. 2023); Li Bai's "跪进雕胡饭". Gathered wild: no evidence of sowing for grain.
  Jiaobai's domestication ~1,400 (genetic) or ~2,000 years ago. *Conflict*: some sources keep gu a staple to the Song.

## 6. Lost crops and near-domesticates (follow-up, 2026-10-29)

For crops Earth domesticated and dropped, or managed without domesticating — candidates for a world's catalogue.
Scores: 5 a staple domesticate · 4 domesticated or nearly, lost for history's reasons · 3 a managed staple needing real
genetic change · 2 a major biological barrier · 1 implausible *(the scores and Köppen codes are judgements)*.

### 6.1 What makes a plant domesticable

- **The syndrome** (Fuller et al. 2014, https://pmc.ncbi.nlm.nih.gov/articles/PMC4035951): non-shattering, seeds 20–60 %
  bigger, germination inhibition lost (*Chenopodium*'s and the pulses' first change), thinner coats, erect habit; tubers
  bigger and less toxic; fruit seedless.
- **Speed**: in the record millennia — wheat and barley's non-shattering ≥ 2,000–2,500 years, pearl millet's 1,000–2,000;
  seed size slower still. In theory 20–200 years under sickle harvest (Hillman & Davies 1990,
  https://link.springer.com/doi/10.1007/BF00974763); wild rice's took ~13 (§5.6).
- **Annual selfers**: the Near East's founders are annual, selfing, interfertile with their wild kin (Weiss & Zohary 2011,
  https://www.journals.uchicago.edu/doi/10.1086/658367); no perennial was domesticated for grain in 10,000 years (Van
  Tassel et al. 2010, https://pmc.ncbi.nlm.nih.gov/articles/PMC3352511). Perennials and trees became staples by tending,
  suckers and grafts (enset, sago, chestnut), not by seed selection.
- **Big-seeded grasses** (Blumler 1992 via Diamond's Table 8.1): of the 56 grasses with seed ≥ 10× the median, West
  Asia–Europe–North Africa 33 (~32 in the Mediterranean zone), East Asia 6, sub-Saharan Africa 4, the Americas 11
  (Mesoamerica 5, Chile 2, California 1), northern Australia 2, southwestern Australia 0
  (https://quotables.github.io/2018/12/24/blumler-wild-grass.html). Mild wet winters and long dry summers favour annuals
  that put their year into big, drought-proof seeds; the Fertile Crescent's progenitors also grow in single-species stands
  (https://pmc.ncbi.nlm.nih.gov/articles/PMC8019021). Australia's native millet: 1,000 grains ~1 g against wheat's 38.6
  (https://pmc.ncbi.nlm.nih.gov/articles/PMC10217037/).

### 6.2 Lost crops

| Crop | Kind; home (K) | When, evidence | Why lost | Score |
|---|---|---|---|---|
| Goosefoot *Chenopodium berlandieri* | pseudocereal; E N America floodplains (Cfa/Dfa) | by ~3,700 BP, thin seed coat (https://pmc.ncbi.nlm.nih.gov/articles/PMC1567861) | maize | 5 |
| Sumpweed *Iva annua* var. *macrocarpa* | oilseed; E N America (Cfa) | by ~4,400 BP, achenes 31 % larger (same) | unclear (allergenic?) | 4 |
| Maygrass *Phalaris caroliniana* | grain; SE United States (Cfa) | from ~2400 BC, grown beyond its range (https://ethnobiology.org/maygrass-phalaris-caroliniana-meaning-early-native-north-american-crop) | maize | 3 |
| Little barley *Hordeum pusillum* | grain; Midwest, Hohokam (Cfa/BSh) | naked domesticated form (https://escholarship.org/content/qt1v84t8z1/qt1v84t8z1.pdf) | maize | 4 |
| Erect knotweed *Polygonum erectum* | pseudocereal; floodplains (Cfa/Dfa) | domesticated ~AD 1 (Ohio), AD 150–1000 (Illinois); with goosefoot it fed as well as maize (https://source.washu.edu/2019/12/lost-crops-could-have-fed-as-many-as-maize/) | maize | 4 |
| Mango *Bromus mango* | grain, biennial; central–southern Chile (Csb/Cfb) | Molina 1782; bread and chicha (https://oar.icrisat.org/4468/1/CP_417.pdf) | wheat and barley; *last grown and extinction disputed* | 4 |
| Madi *Madia sativa* | oilseed; Chile (Csb) | grown for oil, 26 % oil | undocumented | 4 |
| Sauwi *Panicum sonorum* | millet; Sonoran summer rains (BWh/BSh) | Hohokam, ~4,000 years; kept by Guarijío farmers (https://nativeseeds.org/blogs/blog-news/a-short-history-of-panic-grass) | maize, wheat *(inferred)* | 4 |
| *Setaria* (Mexico) | millet; Tamaulipas, Tehuacán (BSh) | eaten 4000–3500 BC; domestication contested | maize | 3 |
| Sown manna *Digitaria sanguinalis* | millet; Poland, Bohemia, Brandenburg (Dfb) | cultivated like a cereal 17th–19th c. (https://link.springer.com/doi/10.1007/s10745-012-9513-4) | mainstream cereals | 4 |
| Manna grass *Glyceria fluitans* | perennial aquatic grain; Polish wet meadows (Dfb/Cfb) | from the 1380s; 6–13× wheat's price; never domesticated (same) | drained marshes, ~1914 | 2 |
| New glume wheat (*T. timopheevii* group) | grain; Anatolia to Europe (Csa/Cfb) | Çatalhöyük mid-7th millennium BC; 89 sites; gone by the 1st millennium BC (https://eprints.whiterose.ac.uk/164743) | unknown | 5 |
| *Lallemantia* | oilseed; Anatolia–Iran, Bronze Age Greece (Csa/BSk) | stored at 3 sites | unknown | 4 |
| Hohokam agaves | sugary heart, perennial; Arizona (BWh) | ≥ 556 field sites, rock-pile fields after AD 1000 (https://pmc.ncbi.nlm.nih.gov/articles/PMC10799993) | Hohokam collapse *(inferred)* | 4 |
| Kañiwa *Chenopodium pallidicaule* | pseudocereal; Altiplano ~3,900 m (ET/Cwc) | after 250 CE; still sheds 25–35 % | — (alive, semi-domesticated) | 4 |

### 6.3 Managed wild staples

| Plant | Kind; K | Management, scale | Score |
|---|---|---|---|
| Acorns, California | nut, tree; Csa/Csb | the coast ranges' main plant food; 65–110 people per 100 km² (https://digitalassets.lib.berkeley.edu/anthpubs/ucb/text/kas038-005.pdf) | 2 (slow trees, tannin) |
| Acorns and chestnut, Jomon | nut, tree; Cfa/Dfa | storage pits of thousands of nuts; chestnut stands by villages, nuts growing larger (https://pmc.ncbi.nlm.nih.gov/articles/PMC7794426) | 3 |
| Chestnut, Corsica and Apennines | nut, grafted tree; Csb/Cfb | most people's staple into the 20th c.; planting decreed 1619 | 5 (a crop) |
| Pinyon | nut, pine; BSk | winter staple; crops every 2–7 years | 2 (masting) |
| Mesquite, screwbean | pod, tree; BWh | the Pima's "tree of life", stored all year | 3 |
| Bunya | nut, araucaria; Cfa | bumper crops every 3–4 years drew thousands | 2 |
| Camas | bulb; Csb wet prairie | burned (~150 % plants), dug ~5-yearly; ~3,500 years (https://www.pubmed.gov/34938450/) | 3 |
| Wapato *Sagittaria* | aquatic tuber; Csb | Katzie wetland garden with stone pavement, 3,800 years ago (https://www.smithsonianmag.com/smart-news/northwests-earliest-garden-discovered-british-columbia-180961560/); *S. trifolia* a crop in China and Japan | 4 |
| Cattail, tule | rhizome and pollen flour; marshes | Typha flour on 30,000-year-old grindstones (https://pmc.ncbi.nlm.nih.gov/articles/pmid/20956317) | 2 |
| Yampah | root; BSk/Csb | staple of the Blackfoot, Paiute, Cheyenne | 2 (hemlock look-alike) |
| Murnong | tuber; Cfb/Csb | southeast Australia's staple until sheep, 1840s | 3 |
| Nardoo *Marsilea* | spore-case flour; BWh/BSh | thiaminase unless roasted | 1–2 |
| Enset | corm starch, from suckers; Cwb highland | wild across Africa, domesticated only in Ethiopia; > 20 million fed; 4–7 t/ha/yr (https://doi.org/10.17660/th2018/73.6.5) | 5 |
| Tiger nut | tuber, sedge; Csa/BWh | Predynastic Egypt's crop | 5 |
| Native millet *Panicum decompositum* | perennial grain; BSh/BWh | heaps at the Narran Lakes (Mitchell); Gamilaraay, Yuwaalaraay (https://www.frontiersin.org/articles/10.3389/fsufs.2023.1237862/full); best of 15 native grains tested | 3 (tiny grain, perennial) |
| Indian ricegrass | perennial grain; BSk sand | Paiute food; dormancy limits | 2 |
| Sea lyme grass *Leymus arenarius* | perennial grain; Cfc/ET coastal sand | Iceland's bread flour to the 1700s | 3 |
| Sahel "kreb" grasses | annual grains; BSh | *Panicum laetum*, *Dactyloctenium* in market quantities | 4 |
| Sago | trunk starch, palm from suckers; Af swamp | 142–425 kg starch a palm; 1 M kcal per 157 work-hours (https://doi.org/10.1007/BF01531422) | 4 |
| Brazil nut | nut, tree; Af/Am | groves spread by people, not domesticated | 1–2 |
| Mongongo | nut, tree; BSh Kalahari | over a third of !Kung calories *(secondary)* | 2 |

*Flags*: Diamond's finer regional splits unconfirmed (N America 4, S America 2); "grain belt" and the Dharawal/Gurindji
names not found in the sources (Gamilaraay, Yuwaalaraay instead); erect knotweed's dates differ between abstracts;
murnong's species names confused until 2016.
