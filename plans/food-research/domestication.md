# Where and why domestication happens — research notes for the Food tab redesign

Compiled 2026-10-31. Scope: the CONDITIONS for hearths, progenitor habitats, animal domestication,
timescales / number of centres, and computational models. Already-covered topics (Vavilov/Larson/Fuller
centre lists, Earth crop packages, ECOCROP ranges, spread speeds, Fort's competition model, secondary
domestication, wild rice, lost crops) are NOT redone here.

Confidence flags used below: **[strong]** = replicated/quantitative evidence; **[moderate]** = one good
quantitative study or broad consensus without numbers; **[weak/contested]** = argued, disputed, or
resting on secondary citations I could not verify.

---

## 1. Why hearths arise where they do — conditions, quantitatively

### 1.1 Seasonality and storage — Matranga (QJE 2024) **[strong-moderate]**

Andrea Matranga, "The Ant and the Grasshopper: Seasonality and the Invention of Agriculture",
*Quarterly Journal of Economics* 139(3):1467–1504 (2024). doi:10.1093/qje/qjae012
- Published abstract: https://ideas.repec.org/a/oup/qjecon/v139y2024i3p1467-1504..html
- Working paper (2017, MPRA 76626, full text read): https://mpra.ub.uni-muenchen.de/76626/1/MPRA_paper_76626.pdf

Mechanism: rising seasonality makes nomadism less useful (every place within migratory range is lean
at the same time) -> bands settle and store -> sedentary storers invent/adopt farming. Lower average
consumption is more than repaid by consumption smoothing.

**Measures (directly computable from 12 monthly means):**
- `TempSeas = max(T_warmest_quarter, 0) − max(T_coldest_quarter, 0)` — the range is censored at 0 °C
  because below freezing there is no growth either way (a −10/−50 °C location has zero *resource*
  seasonality). Proportional to the difference in growing degree days between seasons.
- `PrecipSeas = (P_wettest − P_driest) / P_mean` (wettest minus driest month over mean).
- `SeasIndex = max(quantile(TempSeas), quantile(PrecipSeas))` on a 0–1000 scale over all cells and
  periods; "max" because growth is limited by whichever factor is scarcest (Sahel: never cold, but the
  long dry season alone makes food highly seasonal). A cell is "seasonal" if SeasIndex > 925.
- Data: TraCE paleoclimate (48 × 96 cells × 22,000 yr, 500-yr bins; 1036 land cells); adoption dates
  from Putterman; invention from Purugganan & Fuller.
- The average location on Earth: TempSeas 9 °C, PrecipSeas 1.3, SeasIndex 625, mean T 2.5 °C,
  ~650 mm/yr; started farming 4,500 BP.

**Effect sizes:**
- Global: +10 °C of yearly (censored) temperature range -> farming starts ~1,000 years earlier.
- +1 SD temperature seasonality -> adopted ~1,500 years earlier (invention + spread combined).
- Spread only (time from first exposure to adoption, Weibull survival): +1 SD TempSeas -> 250 yr
  sooner; +1 SD PrecipSeas -> 200 yr sooner; ≈ the frontier moves ~0.5 km/yr faster.
- Seasonal cells (SeasIndex > 925) more than tripled in frequency from the glacial to the early
  Holocene (orbital: NH insolation seasonality at 12,000 BP higher than at any time in 50,000 yr).
- 6 of 7 independent inventions fell in or right next to "seasonal" cells; outlier Mexico is a
  resolution artefact (Oaxaca today: almost all rain in half the year).

**Latitude bands:** "all confirmed independent inventions of farming occurred within these two absolute
latitude bands": the **northern temperate 30–40° N** (hot rainy or warm summers, harsh winters: Middle
East, Eastern North America, North China, South China) and the **tropical 15–20° band of rainfall
seasonality** (Sub-Saharan Africa, Andes, Mexico).

**Topography test (the "hilly flanks" in numbers):** within 100–250 km of wild-cereal stands (Pinhasi
site dates), `r(5)` = elevation range within 5 km, `r(50)` = within 50 km.
- High r(5) (variety reachable from one home base) -> EARLIER adoption.
- High r(50) (variety reachable only by moving) -> LATER: "Adding a 1000 m mountain within 50 km of a
  given site delayed adoption by approximately 500 years."
- r(200) is not predictive (beyond nomadic reach). Early adopters Jerf el Ahmar and Qermez Dere
  (variety close by, flat beyond) vs late ones (Girikihaciyan, Gawra: big peaks 40 km away) differ by
  > 2,000 yr with the same wild species.
- Interpretation: Braidwood's hilly flanks matter as *local* ecotone (a settler can reach several
  zones from one village), and mountains a day or two away keep people mobile instead.

Caveats: country-level adoption dates (Putterman) are coarse; seasonality correlates with latitude
(controls for latitude, mean T and P, squared terms and 123 regional fixed effects keep the effect).

### 1.2 Climatic volatility (hump-shaped) — Ashraf & Michalopoulos (REStat 2015) **[moderate]**

Q. Ashraf & S. Michalopoulos, "Climatic Fluctuations and the Diffusion of Agriculture", *Review of
Economics and Statistics* 97(3):589–609 (2015). Open: https://pmc.ncbi.nlm.nih.gov/articles/PMC4803118 ;
NBER w18765 https://www.nber.org/papers/w18765

- Measure: standard deviation of monthly temperature over 1901–2000 (1,200 monthly values, CRU), i.e.
  dominated by the seasonal cycle. Country mean 4.0 °C (Rwanda 0.55 … China 10.1).
- Result: **hump-shaped** — moderate volatility -> earliest adoption; too stable or too volatile ->
  later. Mechanism: foragers in moderately variable climates were forced to experiment with/store
  plant foods and so had the know-how when farming arrived; extreme volatility destroys accumulated
  know-how.
- Optimum (intermonthly SD of temperature): **8.2 °C** (baseline), **7.2 °C** with full controls;
  each 1 °C away from the optimum delays the transition ~80 years (cross-country). Sites (750 Neolithic
  sites, Europe/Near East): optimum **7.0–7.3 °C**, ~50 yr per °C. Historical 1500–1900 seasonal data:
  optimum 6.4 °C, 354 yr per °C.
- Seasonal (interannual SD of a season's temperature) optima 0.6–1.6 °C; deviations cost 1,500–8,200 yr
  per °C (larger units because interannual SDs are small).
- Conversion for a generator: for a sinusoidal annual cycle with warm–cold range R, monthly SD ≈ R/2.8.
  An optimum SD of ~7–8 °C ≈ a **warmest–coldest month range of ~20–23 °C** (e.g. Levant, N China
  lowlands are ~20–30 °C). Very low SD (< 2 °C, equatorial) or very high (> 12 °C, continental
  interiors) -> late.
- Controls: distance to nearest Neolithic frontier, absolute latitude, land area, Olsson–Hibbs
  biogeography (domesticable plants/animals, axis orientation), elevation, ruggedness.

Combined reading with Matranga: seasonality helps up to a point; extreme continental ranges (and
sub-zero winters, which Matranga censors) do not help.

### 1.3 Holocene stability and CO2 — Richerson, Boyd & Bettinger (2001) **[moderate; the CO2 part has experimental support]**

P. Richerson, R. Boyd, R. Bettinger, "Was agriculture impossible during the Pleistocene but mandatory
during the Holocene? A climate change hypothesis", *American Antiquity* 66(3):387–411 (2001).
doi:10.2307/2694241 . PDF: https://faculty.bennington.edu/~kwoods/classes/env%20hist%20ag/readings_21/Richerson%20et%20al.%20-%202001%20-%20Was%20agriculture%20impossible%20during%20the%20Pleistocene%20.pdf

- Glacial climate: arid, low CO2, and extremely variable on < 150-yr timescales (Dansgaard–Oeschger
  flickers of a decade or two). The Holocene (last ~11,600 yr) is dramatically quieter at these
  timescales.
- CO2 ~190 ppm in the last glacial vs ~250 ppm at the start of the Holocene; terrestrial carbon store
  at LGM modelled 33–60 % lower than Holocene.
- Population pressure is NOT rate-limiting: logistic growth at r = 0.5–3 %/yr brings a population from
  1 % to 99 % of carrying capacity in ~460–1,400 yr; so the multi-millennial lags must be set by the
  rate of innovation in subsistence technology / social organisation.
- "Agriculture was independently evolved about 10 times"; "unlikely that the present list will double."
  In the Holocene agriculture becomes "compulsory" in the long run via between-group competition
  (farmers outnumber and displace foragers) — except in marginal environments.
- Lags from Holocene onset vary hugely (Near East ~1–2 kyr; eastern N America ~6–7 kyr) -> local
  innovation rates and species differ.
- Never-farming non-arctic regions at European contact: western North America (California) and
  Australia — both with rich, storable wild foods or harsh variability (see 1.6).

Experimental test of the CO2 part — Cunniff, Jones, Charles & Osborne, "Yield responses of wild C3 and C4
crop progenitors to subambient CO2…", *Global Change Biology* 23(1):380–393 (2017), doi:10.1111/gcb.13473 ;
accepted MS https://eprints.whiterose.ac.uk/104455 ; abstract
https://www.cropwildrelatives.org/resources/publications/publication-detail/yield-responses-of-wild-c3-and-c4-crop-progenitors-to-subambient-co2-a-test-for-the-role-of-co2-limitation-in-the-origin-of-agriculture-2017
- Glacial -> post-glacial CO2: C3 progenitors (einkorn, barley) grain yield **+~50 %**; C4 progenitors
  (foxtail, broomcorn millet) **+10–15 %**. Low CO2 also cut germination/viability.
- Original hypothesis: R. Sage (1995) *Global Change Biology* 1:93–106 (CO2 rise < 200 -> ~270 ppm
  between 15 and 12 ka removed a productivity barrier). https://www.scilit.net/publications/c3984e800e7f1b5ae578be87e4dcd39c

Related: Feynman & Ruzmaikin (2018), "Climate stability and the origin of agriculture" (IntechOpen
chapter, doi:10.5772/intechopen.83344) https://www.intechopen.com/chapters/65015 — argue farming needs
~2,000 yr free of significant centennial-scale variation; Greenland variability dropped at
11,570 ± 200 BP. **[weak — book chapter, inference from few cases]**

Generator use: this is a *global* gate (planet-wide "Holocene"), not a per-place rule. Every planet the
generator shows is post-glacial, so treat it as background; optionally a planet-wide "climate
stability" scalar could stretch all times-to-domestication.

### 1.4 Surplus vs necessity — Kavanagh et al. (2018) **[moderate]**

P. Kavanagh, B. Vilela, H. Haynie, T. Tuff, M. Lima-Ribeiro, R. Gray, C. Botero, M. Gavin,
"Hindcasting global population densities reveals forces enabling the origin of agriculture",
*Nature Human Behaviour* 2:478–484 (2018), doi:10.1038/s41562-018-0358-8 .
Summary: https://hraf.yale.edu/ehc/documents/1289 ; press: https://www.eurekalert.org/news-releases/733963
- Model of forager population density from environment + culture (Binford's 220 forager societies,
  ~77 % of variance explained); hindcast 21–4 ka with ecoClimate paleoclimate at 12 origin centres.
- At ALL 12 centres, improving environment and rising forager density preceded domestication ->
  supports the **surplus** hypothesis; little support for **necessity** (deteriorating conditions) or
  for "each centre unique".
- Predictors named: environmental productivity, environmental stability, distance moved per
  relocation, resource ownership, distance to coast.
- Generator reading: hearths arise where *forager carrying capacity is high and rising*, not in
  marginal or deteriorating land.

### 1.5 Big-seeded grasses and Mediterranean climates — Blumler **[moderate; numbers from secondary sources]**

- J. Blumler (1992 PhD; 1998 "Introgression of durum into wild emmer and the agricultural origin
  question", in Damania et al. eds.) tabulated the world's **56 wild grasses with the largest seeds**
  (≥ ~10× the median grass seed mass), as reproduced in Diamond, *Guns, Germs and Steel* (1997) Table 8.1:
  **~32 native to the Mediterranean zone / Fertile Crescent of western Eurasia**, versus 2 in Chile's
  Mediterranean zone, 1 in California, 1 in southern Africa (Cape), 0 in SW Australia; the rest
  scattered (E Asia, sub-Saharan Africa, Mesoamerica, N & S America, N Australia).
  "Virtually all" are native to Mediterranean or other seasonally dry environments.
  Excerpt: https://quotables.github.io/2018/12/24/blumler-wild-grass.html  **[the full per-region
  table could not be verified first-hand]**
- Ecology behind it: in Mediterranean annual grasslands large seed mass is favoured in warmer, drier
  communities with longer summer drought, and large seeds survive summer drought better
  (Seed Science Research, "Testing seed-size predictions in Mediterranean annual grasslands"
  https://resolve.cambridge.org/core/journals/seed-science-research/article/testing-seedsize-predictions-in-mediterranean-annual-grasslands/F899DFB6E8B7A42DAB7287F250337BDB ;
  Murdoch "Seed mass and summer drought survival"
  https://researchportal.murdoch.edu.au/esploro/outputs/journalArticle/Seed-mass-and-summer-drought-survival/991005541235407891 ).
  Annual life history + winter-rain/summer-drought -> plants put resources into big, dormant seeds
  that wait out the dry summer -> exactly the storable, harvestable package.
- Critique/refinement — Preece et al. (2015/2016), "Were Fertile Crescent crop progenitors higher
  yielding than other wild species that were never domesticated?", *New Phytologist*.
  https://pmc.ncbi.nlm.nih.gov/articles/PMC4949991/
  24 grasses + 19 legumes grown side by side: progenitor grasses had ~2.7–3.4× heavier seeds but **no
  higher yield per plant**; seed size did not predict yield among grasses. So big seeds were not
  chosen for yield — more likely for ease of harvest/processing and big-seedling competitiveness
  (companion paper: "Fertile Crescent crop progenitors gained a competitive advantage from large
  seedlings" https://www.peeref.com/works/21890985 ).
- Generator reading: **Csa/Csb (and BSk/BSh fringes with winter rain)** are by far the richest habitat
  for big-seeded annual grasses; give them the highest "seed-crop progenitor density". Other
  seasonally dry climates (Aw, Cwa, BSh) get a lower density; perennially wet climates get none.

### 1.6 Population pressure, packing, marginal zones, sedentism **[weak/contested as primary causes]**

- **Binford's packing / Flannery's marginal-zone model**: as populations "pack" the best zones, people
  spill into marginal zones and broaden/intensify their diet; cultivation begins at the margins of wild
  stands. Status: has lost its central position; zooarchaeology shows broad-spectrum shifts (small game)
  but often in contexts of abundance, not stress (Stiner 2001 PNAS
  https://mail.hatayup.uawebhost.arizona.edu/pubs/stiner2001.pdf ; Zeder 2012, "The Broad Spectrum
  Revolution at 40", *J. Anthropological Archaeology* 31:241–264; Zeder 2015 "Feast or famine"
  https://core.tdar.org/document/395660/feast-or-famine-the-broad-spectrum-revolution-revisited ).
  Kavanagh 2018 (1.4) found the surplus, not necessity, pattern.
- **Binford's quantitative thresholds** (*Constructing Frames of Reference*, 2001; 339 forager groups,
  data at D-PLACE https://d-place.org/contributions/Binford ). Using **Effective Temperature**
  `ET = (18·W − 10·C) / (W − C + 8)` (W, C = warmest/coldest month mean, °C; Bailey 1960):
  - ET < **12.75** °C: foragers cannot rely on terrestrial plants as staple ("terrestrial plant
    threshold"; https://pmc.ncbi.nlm.nih.gov/articles/PMC3917328 ).
  - ET ≤ **15.25–15.75** °C: food storage becomes the rule ("storage threshold"; sources disagree on the
    exact value) https://www.cliffsnotes.com/study-notes/603276 **[value unverified]**
  - Packing threshold ≈ **9.1 persons / 100 km²**: above it, residential mobility collapses and
    intensification (aquatic or plant) follows; "packing" begins ~1.6 / 100 km²
    (https://texasbeyondhistory.net/waco/images/population.html ;
    https://www.npshistory.com/series/archeology/18h/report.pdf ) **[secondary citations]**
- **Sedentism before farming**: true in the Levant (Natufian villages 15–11.7 ka preceded cultivation),
  NOT in Mesoamerica (squash ~10 ka in mobile foraging systems, maize/beans 4 kyr later) (Richerson et
  al. 2001). Rich sedentary foragers who never farmed: Jomon Japan (until late), Pacific Northwest,
  California. So sedentism is neither necessary nor sufficient; where foragers have a superabundant,
  storable wild staple (salmon, acorns) farming can be *delayed*.
- **Theory debate**: Gremillion, Barton & Piperno (2014) PNAS 111:6171–6177 argue for general
  behavioural-ecology theory against "particularism" https://pmc.ncbi.nlm.nih.gov/articles/PMC4035987 ;
  Zeder and Smith replied (niche construction). Consensus today: several conditions co-occur; none
  alone suffices.

Generator reading: use forager *density/productivity* (surplus) as a positive weight, not stress; use
"rich storable wild food that makes farming unnecessary" (salmon coasts, acorn woodlands: Csb/Cfb
coasts with cold upwelling / big rivers) as a *delay* factor on hearth formation, not a promoter.

### 1.7 What Earth's independent centres share (synthesis)

From Matranga (bands), Larson et al. 2014 and Fuller 2014 centre maps, and the progenitor habitats below:
- **Latitude**: two bands — **~25–40° (mostly N)** subtropical/temperate with strong temperature or
  winter-rain seasonality (Fertile Crescent 33–38° N, N China 34–40° N, Yangtze 28–31° N, eastern N
  America 33–40° N), and **~5–20°** tropical with a strong dry season (Mesoamerica 15–20° N, Sahel
  10–17° N, Ethiopia 7–14° N, Andes 8–18° S, India 15–25° N). Wet-equatorial centres (New Guinea 5–7° S,
  Amazon margin ~10–15° S) are vegeculture.
- **None** above ~45° (rye/oats only as secondary weeds) or in desert interiors (BW) or ever-wet
  lowland rainforest cores (Af away from margins).
- **Altitude**: many centres are mid-elevation (Fertile Crescent foothills 300–1,500 m; Oaxaca/Balsas
  400–1,800 m; Ethiopian plateau 1,500–2,500 m; Andes 2,500–4,000 m; New Guinea highlands
  1,400–2,000 m), others are lowland river/wetland margins (Yangtze, Yellow River, Sahel floodplains,
  eastern N America river valleys). Common thread: **sharp ecological gradients within a day's walk**
  (Matranga's r(5)) and seasonally flooded or foothill alluvium.
- **Climate**: Köppen Csa/Csb/BSk (winter rain), Cwa/Cwb/Aw (summer-monsoon with a long dry season),
  Cfa (hot humid summer, cold winter). Matranga TempSeas typically 15–30 °C, or PrecipSeas > ~2.
- **Water**: nearly all centres sit on or within ~10–30 km of permanent rivers, springs or lake
  margins with seasonal flooding (alluvial fans, floodplain backswamps).

---

## 2. Progenitor habitats per staple archetype

Values marked (ZHW) are recalled from Zohary, Hopf & Weiss, *Domestication of Plants in the Old World*
(4th ed. 2012) and were not re-verified online in this session **[moderate]**.

### 2.1 Winter-rain big-seeded annual grasses + pulses (wild wheat/barley/lentil) — Fertile Crescent
- Climate: Mediterranean Csa/Csb and its semi-arid fringe (BSk/BSh with winter rain); rain falls in
  the cool half-year, 4–6 month summer drought; mild winters (coldest month ~0–10 °C).
- Wild emmer (*T. dicoccoides*): allelic diversity peaks at **350–550 mm/yr** rainfall (unimodal,
  "intermediate stress") https://cris.huji.ac.il/en/publications/allelic-diversity-associated-with-aridity-gradient-in-wild-emmer/ ;
  Jordanian populations at ~550–1,100 m, none below sea level east of the Jordan; overall range
  (ZHW) ~−100 m to ~1,600 m, typically 300–1,300 m, on basalt and limestone slopes in oak park-forest
  and steppe-like herbaceous vegetation; never dominant.
- Wild barley (*H. spontaneum*): far wider and drier — marginal populations at **< 200 mm**, even
  ~70 mm in Negev wadis (Mitzpe Ramon, 519 m); "more often in warm plains and desert environments
  than wild wheat"; elevation, mid-day temperature and rainfall structure its populations
  (Israel, 1,020 accessions) https://pmc.ncbi.nlm.nih.gov/articles/PMC4981475 ;
  https://www.tropentag.de/2002/abstracts/datashows/33.pdf
- Wild einkorn: grassland on lower limestone slopes in degraded oak forest/scrub; collections
  1,000–1,300 m; (ZHW) up to ~2,000 m — the highest of the three.
  https://grinczech.vurv.cz/gringlobal/accessiondetail.aspx?id=7541
- Pattern: barley = dry/warm edge, emmer = mid-rainfall basalt/limestone foothills, einkorn = higher
  and cooler. Dense natural stands within reach of a home base (Matranga's r(5)).

### 2.2 Wetland perennial grass (wild rice, *Oryza rufipogon*) — Yangtze
- Perennial of **permanent or seasonally flooded wetlands** (ponds, marshes, river backswamps); water
  level is the key habitat requirement (Hunan reserve study https://www.plant-ecology.com/EN/Y2001/V25/I1/65 ).
- Thermal limits: **mean annual T > 17 °C and mean summer T > ~26 °C** (Dodson et al. 2021,
  *Frontiers in Earth Science* 9:666846 https://frontiersin.org/articles/10.3389/feart.2021.666846/full );
  coldest-month minimum and annual precipitation are the other main controls (Huang & Schaal 2012).
- Northernmost wild population today: Dongxiang, Jiangxi, **28°14′ N**, cold-tolerant and close to
  temperate japonica (https://www.chinaagrisci.com/EN/Y2007/V40/I6/1085 ); in a northern common garden
  only northern-range populations reproduced (65 %) and overwintered (58 %) (Zhou et al. 2013,
  https://ueaeprints.uea.ac.uk/44894/ ). The early-Holocene monsoon maximum may have pushed the range
  north (Shandong?) — inferred, no fossil evidence **[weak]**.
- Domestication: dual origin Middle + Lower Yangtze best fits 400 dated sites (Silva et al. 2015
  PLoS ONE 10:e0137024 https://discovery.ucl.ac.uk/id/eprint/1470829/ ). Non-shattering spikelets at
  Tianluoshan rose 27 % -> 39 % between 6,900 and 6,600 BP (Fuller et al. 2009 *Science* 323:1607
  https://ui.adsabs.harvard.edu/abs/2009Sci...323.1607F ).
- Generator: wetlands/floodplains (lakes, high discharge, low slope) in Cfa/Cwa/Aw/Am, lat ≲ 30°.

### 2.3 Seasonally dry tropical mid-elevation grass (teosinte -> maize) — Balsas, Mexico
- *Zea mays* ssp. *parviglumis*: "highly seasonal, sunny thorn scrub, and open tropical deciduous
  forests and savannahs, at elevations of (450)600–1400(1950) m", most abundant in the Balsas drainage
  (Flora of North America https://floranorthamerica.org/Zea_mays_subsp._parviglumis ). ssp. *mexicana*
  replaces it on the cooler Central Plateau (to ~2,700 m, recalled). Summer rain, ~6-month dry season
  (Aw/Cwa).
- Domestication ~9 ka in the Balsas (Matsuoka et al. 2002; Piperno et al. 2009 — recalled, not
  re-checked this session).

### 2.4 Sahel grasses (wild sorghum, wild pearl millet)
- Pearl millet: whole-genome data place the centre in the **western Sahara (Taoudeni Basin)**, when
  the "green Sahara" was wetter (~6 ka); cultivated expansion from **4,900 BP**; wild relatives
  retreated south to today's Sahel ~3,200 BP (Burgarella et al. 2018 *Nat. Ecol. Evol.* 2:1377
  https://www.botany.one/2018/08/origins-of-domesticated-pearl-millet-identified-in-the-western-sahara/ ;
  PDF https://cegsb.icrisat.org/wp-content/uploads/2022/10/2018_Nature-Eco-Evol_Domestication_Pearl-Millet-Genome.pdf ).
  Today's wild pearl millet: Sahara–Sahel margins, roughly 100–600 mm summer rain **[range recalled]**.
- Sorghum: earliest domestic sorghum at KG23, Butana Group, **eastern Sudan, 3500–3000 BC**, with half
  the impressions still wild — mid-process, protracted (Winchell et al. 2017 *Current Anthropology*
  58:673 https://discovery-pp.ucl.ac.uk/id/eprint/1574602 ). Wild sorghum (*S. arundinaceum* /
  ssp. *verticilliflorum*): Sudanian–Sahelian savannas, ~400–900 mm single summer rainy season,
  seasonal floodplains/wadis **[range recalled]**.
- Fuller et al. 2014 note that these Mid-Holocene grain domestications followed **aridification**
  (Saharan drying, S Indian savanna expansion): a seasonality-increase trigger, not a surplus one.

### 2.5 Savanna–forest margin yams (African yam)
- *Dioscorea rotundata* was domesticated from the **forest** wild yam *D. praehensilis* (the savanna
  species *D. abyssinica* diverged earlier); expansion began in the **Niger River basin**
  (Scarcelli et al. 2019 *Science Advances* doi:10.1126/sciadv.aaw1947 https://hal.inrae.fr/hal-02627974 ).
  Overturns the "savanna origin" view; together with African rice and pearl millet makes the Niger
  basin a major African cradle.
- Yam tubers: dormancy 2–4 months, storage 4–6 months (Denham et al. 2020, below).

### 2.6 Seasonally dry Amazon-margin roots (wild cassava)
- Cassava derives from wild *M. esculenta* ssp. *flabellifolia* "along the southern border of the
  Amazon basin" (Olsen & Schaal 1999 PNAS 96:5586 https://www.sciencedaily.com/releases/1999/06/990603070709.htm ;
  microsatellites agree, Olsen & Schaal 2001 https://profiles.wustl.edu/en/publications/microsatellite-variation-in-cassava-manihot-esculenta-euphorbiace/ ).
  That border is the forest–cerrado transition with a 3–5 month dry season (Aw/Am).
- Earliest cultivation (recalled, Lombardo et al. 2020 *Nature* doi:10.1038/s41586-020-2162-7):
  manioc ~10.3 ka, squash ~10.2 ka, maize ~6.9 ka in forest islands of the seasonally flooded Llanos
  de Moxos savanna, Bolivia **[not re-checked this session]**.

### 2.7 Cold tropical highland tubers (wild potato)
- All landrace potatoes trace to a single origin in the **northern *S. brevicaule* complex, southern
  Peru** (Spooner et al. 2005 PNAS 102:14694 https://pmc.ncbi.nlm.nih.gov/articles/PMC1253605 ).
- Wild potatoes as a group "typically occur at **2000–4000 m**"; species richness peaks at **8–20° S**
  and ~20° N (Hijmans & Spooner 2001 *Am. J. Bot.* 88:2101; atlas
  https://cipotato.org/genebankcip/wp-content/uploads/sites/3/2017/06/Atlas-of-wild-potatoes.pdf ).
- Generator: |lat| < ~25°, elevation 2–4 km, MAT ~5–12 °C, frequent frost, summer rain
  (Cwb/ET/BSk-highland). Andean companions: oca, ulluco, mashua, quinoa.

### 2.8 Wet tropical vegeculture (taro, banana, yams) — New Guinea
- Kuk Swamp (~1,500 m, Wahgi valley): wetland-edge plant use and some cultivation **10,220–9,910 cal
  BP**, mounding **6,950–6,440**, ditched drainage **4,350–3,980**; taro early Holocene, banana
  intensively cultivated by ~6.9 ka (Denham et al. 2003 *Science* 301:189
  https://agris.fao.org/search/en/records/65def4734c5aef494fdea6ec ).
- Climate: Af/Cfb-highland, > 2,000 mm, weak seasonality; wetland margins for taro, forest gaps for
  banana (*Musa acuminata* ssp. *banksii*), lowlands to ~2,000 m.

### 2.9 Seed crops vs vegeculture — which climates favour which
- Denham et al. 2020, "The domestication syndrome in vegetatively propagated field crops", *Annals of
  Botany* https://pmc.ncbi.nlm.nih.gov/articles/PMC7102979 : vegetative propagation "especially
  important" in "the wet tropics and sub-tropics, mountainous regions, wetland habitats and deserts";
  vegeculture is "less seasonal"; tubers allow piecemeal harvest (sweet potato up to 9 months) —
  storage in the ground instead of granaries. Domestication syndrome poorly defined; yam trait
  fixation can take only 3–5 years and reverts when cultivation relaxes; banana went through
  stepwise thresholds; barley's single episode ran ~11,500 -> ~8,500 cal BP.
- Fuller et al. 2014 PNAS 111:6147 https://pmc.ncbi.nlm.nih.gov/articles/PMC4035951 : seed crops have
  the best-defined syndrome; vegeculture cannot yet be rate-measured; tuber cultivation by ~7 ka in
  New Guinea and the Neotropics.
- Harris (1972) "The origins of agriculture in the tropics", *American Scientist* 60:180–193 — the
  classic seed-culture vs vegeculture distinction: vegeculture = vegetatively propagated roots, seed
  culture = clearing, mass sowing, one short harvest
  https://www.cambridge.org/core/books/agricultural-systems-of-the-world/early-history-of-agriculture/188087D2ECAFDE075A9BCC4C67E79C01
  **[Harris's dry-season-length argument not verified first-hand]**.
- Underground storage organs are abundant in seasonal savanna woodland and scarce in rainforest
  (Laden & Wrangham 2005 *J. Human Evolution* 49:482, doi:10.1016/j.jhevol.2005.04.007 — recalled,
  not re-checked).
- Synthesis for a generator (my inference, consistent with the above):
  - **Long, predictable dry or cold season (≥ 4–5 months)** -> annuals with big dormant seeds ->
    **seed crops** (grains + pulses), granary storage.
  - **Wet tropics, short/weak dry season (≤ 2–3 months)** -> perennial clonal plants, starch held in
    the ground -> **vegeculture** (taro, banana, yams, sago), little storage need.
  - **Tropical forest–savanna margin, 3–5 dry months** -> underground storage organs as dry-season
    survival organs -> **root crops with a seed-crop fringe** (yam + sorghum/pearl millet; cassava +
    maize/squash).
  - **Cold tropical highlands (frosty nights, summer rain)** -> frost-hardy tubers (potato, oca) +
    chenopod grains; freeze-drying for storage (chuño).
  - **Wetlands/floodplains** -> wetland grasses (rice) and taro.

---

## 3. Animal domestication

### 3.1 Zeder's three pathways (Zeder 2012; Larson & Fuller 2014) **[strong framework]**
G. Larson & D. Fuller, "The Evolution of Animal Domestication", *Annu. Rev. Ecol. Evol. Syst.* 45:115–136
(2014) https://www.rpgroup.caltech.edu/aph150_human_impacts/assets/pdfs/Larson_2014.pdf
(35 domestication episodes, 32 mapped). Zeder (2012) *J. Anthropological Research* 68:161–190
https://www.scribd.com/document/448522283/Zeder-2012-JAR ; summary in Beckman et al. 2022
https://par.nsf.gov/servlets/purl/10403994

- **Commensal** (the animal comes to the human niche: waste, vermin in grain stores): dog (wolf; the
  only pre-agricultural domesticate, across Eurasia before 11.7 ka), cat (Near East — on Cyprus by
  11 ka; also China), pig (Near East oak-woodland villages and central China millet/wetland villages;
  ≥ 3,000 yr of commensalism–domestication), chicken (red junglefowl drawn to scraps and crop waste),
  pigeon, guinea pig (Andes ~5 ka, with early sedentism), duck/goose/carp (with East Asian rice).
  "The earliest domestic animals in each independent region all followed the commensal pathway."
- **Prey** (hunted game -> game management -> herd management): sheep, goat, cattle in W Eurasia
  10.5–10.0 ka (alongside cereals); zebu in the Indus 9–7 ka (or by introgression); river buffalo in the
  Lower Indus/W India by 4.5–4.0 ka; swamp buffalo E India–SE Asia before 3–2.5 ka; mithun, Bali cattle;
  llama & alpaca ("grazers of mid- to high-elevation meadows") 6–5 ka; turkey (SW USA by 2 ka);
  Muscovy duck ~4 ka; reindeer — the exception, domesticated by **nomadic hunters**, herding 3–2 ka,
  migratory tundra ecotype. Overhunting preceded domestication (Sha'ar Hagolan cattle and pigs).
  Prey-pathway domestication is "associated with more settled human communities that cultivated plants".
- **Directed** (deliberate, needs existing domesticates as a model): horse, donkey, dromedary, Bactrian
  camel, honeybee, silkworm, later rabbit, guineafowl, carp (Rome). These arise "**in regions
  peripheral** to those where early animal domestication took place", usually after the secondary
  products revolution: donkey on the Nile fringes; dromedary in Arabian deserts (~3 ka, with qanat oasis
  farming); Bactrian in the cool deserts of Central Asia; horse in temperate grasslands by people who
  already herded sheep and goats (riding perhaps by 7 ka; breeding change 5.5–4 ka).
- Africa: "no clear evidence for the domestication of a herded prey animal" — cattle came from W Eurasia
  ~8 ka with sheep and goats (Barbary sheep were penned in Libya, then abandoned). But the **donkey** is
  an African domesticate: a single origin in Africa ~5000 BCE (Todd et al. 2022 *Science* 377:1172
  https://phys.org/news/2022-09-donkey-domestication-years-africa-dna.html ); guineafowl < 2 ka.
- The number of animal domesticates **doubled in the mid-Holocene (8–4 ka)**.

### 3.2 Updated dates (selected)
- Horse: modern DOM2 horses come from the **lower Volga–Don steppe** and spread across Eurasia
  ~2200–2000 BCE with chariots; Botai (Kazakh steppe, ~3500 BC) horses are not their ancestors
  (Librado et al. 2021 *Nature* 598:634 https://www.sci.news/paleontology/horse-domestication-western-eurasian-steppes-10191.html ).
- Chicken: earliest unambiguous bones at Ban Non Wat, central Thailand, **1650–1250 BCE**; junglefowl
  were lured by cereal (rice/millet) storage; a rebuttal argues for earlier SW China (Peters et al. 2022
  PNAS https://pmc.ncbi.nlm.nih.gov/articles/PMC9636945 ). Not domesticated in India.
- Yak: **7,300 BP**, most likely by nomads, ~6× population growth by 3,600 BP (Qiu et al. 2015
  *Nat. Commun.* https://pmc.ncbi.nlm.nih.gov/articles/PMC4703879 ).
- Llama from guanaco, alpaca from vicuña (Kadwell et al. 2001 *Proc. R. Soc. B* 268:2575
  https://pmc.ncbi.nlm.nih.gov/articles/PMC1088918 ); domestication 6–7 ka in the Peruvian Andes.

### 3.3 Progenitor habitats (for placing wild ancestors from climate)
| Progenitor (-> domestic) | Habitat / climate | Elevation | Source |
|---|---|---|---|
| Aurochs (-> cattle, zebu) | Old World north of the Sahara and south of the boreal forest; river valleys, wetlands, forest–grassland mosaics ("wood-pasture"); mixed feeder; absent from Ireland and N Scandinavia; not desert, not boreal/tundra | lowland–mid | https://lup.lub.lu.se/record/3d24c5d4-4804-4280-8460-74a72c417534 ; https://acta-zoologica-bulgarica.eu/2022/002552.pdf |
| Asiatic mouflon (-> sheep) | rugged-but-rolling hills, steppe and open woodland of Taurus–Zagros–Caucasus; suitability tied to rugged terrain | ~500–2,500 m **[range recalled]** | https://pages.cms.hu-berlin.de/biogeo/website/uploads/BA_2015_Bluhm.pdf |
| Bezoar (-> goat) | rocky cliffs and scree with maquis or conifer patches | sea level–4,000 m, usually < 2,500 m | https://en.wikipedia.com/wiki/Wild_goat |
| Wild boar (-> pig) | very broad: forest, wetland, farmland; northern limit set by snow depth (~40 cm cited, an older view) and winter food; not desert | 0–4,000 m | https://link.springer.com/doi/10.1007/s13364-014-0190-0 |
| Wild horse (-> horse) | temperate grass steppe (BSk/Dfb grassland) | lowland plains | Librado 2021 above |
| Wild Bactrian camel | cold desert: −40 to +40 °C, ~25–100 mm/yr (Gobi) | ~1,000–2,000 m | https://en.wikipedia.org/wiki/Great_Gobi_A_Strictly_Protected_Area |
| Wild dromedary (extinct) | hot desert/coast of SE Arabia; domesticated ~3 ka | lowland | Larson & Fuller 2014 |
| African wild ass (-> donkey) | arid hills/semi-desert of NE Africa | low–mid | Todd 2022 |
| Wild yak | cold alpine steppe/meadow, Tibetan Plateau | ~4,000–6,000 m **[unverified]** | Qiu 2015 |
| Guanaco (-> llama) | arid–semi-arid open land | 0–4,500 m **[recalled]** | Kadwell 2001 |
| Vicuña (-> alpaca) | semi-arid puna grassland, short tough vegetation | 3,500–5,750 m | https://animaldiversity.org/accounts/Vicugna_vicugna/ |
| Wild water buffalo | tropical floodplain grassland, swamp, riverine forest; prefers < 500 m from water, < 25 % canopy | lowland | https://threatenedtaxa.org/index.php/JoTT/article/download/7584/8043?inline=1 |
| Red junglefowl (-> chicken) | tropical forest edge, second growth, bamboo, mangrove; S & SE Asia | 0–~2,000 m | https://www.allaboutbirds.org/guide/Red_Junglefowl/lifehistory |
| Reindeer | tundra (migratory ecotype) and taiga | lowland–subalpine | Larson & Fuller 2014 |

Niche test: Hendrix & Vos (2019 bioRxiv 10.1101/629188, https://www.biorxiv.org/content/10.1101/629188v1 ):
152 ungulates (14 domesticated progenitors) — **no weighted combination of climate/environment clusters
the domesticated ones**; they are *overdispersed* in niche space. Domesticability is not a climate
property: any biome can hold a candidate. **[preprint]**

### 3.4 Diamond's criteria and counts **[pattern accepted; causality contested]**
- Diamond, *Guns, Germs and Steel* (1997) ch. 9: a "candidate" = terrestrial herbivorous/omnivorous
  mammal averaging > 45 kg (100 lb). **148 candidates, 14 domesticated** (the "Ancient Fourteen";
  https://interconnected.org/home/2006/04/25/the_ancient_fourteen ). By continent (Table 9.2; counts
  consistent with the published percentages 18 %, 4 %, 0 %): **Eurasia 13 of 72 (18 %), the Americas
  1 of 24 (4 %, llama/alpaca), sub-Saharan Africa 0 of 51, Australia 0 of 1**
  (https://www.shortform.com/blog/history-of-domesticated-animals/ ; https://cdn.odi.org/media/documents/3294.pdf )
  **[the 72/51/24 counts are from memory of the table; the percentages are confirmed]**.
- Diamond's six reasons for failure ("Anna Karenina principle"): diet (inefficient to feed), slow
  growth, failure to breed in captivity, nasty disposition, tendency to panic, social structure
  (needs herd hierarchy, overlapping ranges, no strict territoriality).
- Megafauna losses (genera > 44 kg; Koch & Barnosky 2006 via https://ourworldindata.org/quaternary-megafauna-extinction ):
  **Africa 21 % (48 -> 38), Eurasia 35 % (26 -> 17), North America 72 % (47 -> 13), South America
  83 % (60 -> 10), Australia 88 % (16 -> 2)**. Losses followed human arrival (the latest-settled, most
  naive faunas lost most); Sandom et al. 2014 (Proc. R. Soc. B, https://pmc.ncbi.nlm.nih.gov/articles/PMC4071532 )
  find the global pattern tracks humans, not climate.
- Critiques:
  - Counts are of *survivors*; a pre-extinction count reportedly gives South America the most large
    herbivores (77) and Eurasia the fewest (31) — so the Americas lost their candidates rather than
    lacking them (cited in https://www.shortform.com/blog/history-of-domesticated-animals/ **[original not traced]**).
  - Sub-Saharan Africa had 51 candidates and still domesticated none in Diamond's tally (though the
    donkey and guineafowl are African) — so candidate number is not the binding constraint there.
  - Eland are tameable and have been domesticated recently (Cochran, https://www.isegoria.net/?p=42367
    **[non-academic]**); musk ox likewise.
  - The first quantitative test of domesticability traits — Steklis et al. 2024, "Why were zebras not
    domesticated?", *Animals* 14:2355 https://pmc.ncbi.nlm.nih.gov/articles/PMC11350691/ : PGLS on 65
    ungulates; only **capture myopathy (stress reactivity)** significantly predicts domestication
    (β = −0.278, p = 0.042); body mass, diet breadth, gregariousness not significant; model R² 21 %.
    Across six Old World regions, **loss of large predators correlates with lower reactivity**
    (r = −0.97, n = 6): prey that kept facing big predators (African zebras) stayed jumpy.
    **[small n; correlational]**

### 3.5 Landmass size, isolation, extinction -> domesticable fauna
- **Area** is a robust ecological control:
  - Species–area: mammal richness ∝ A^z with z ≈ 0.25 (islands 0.12–0.25; continents ~0.33 for genera)
    https://math.hws.edu/~mitchell/SpeciesArea/speciesAreaText.html ; https://deepblue.lib.umich.edu/items/eb123a42-e45e-4053-81b6-bf27f6a0e95d
  - Burness, Diamond & Flannery 2001 PNAS 98:14518 https://pmc.ncbi.nlm.nih.gov/articles/PMC64714/ :
    top endothermic herbivore mass **M = 0.47·A^0.52** (kg, km²; n = 27, r² = 0.61). That gives about
    56 kg at 10⁴ km², 190 kg at 10⁵, 620 kg at 10⁶ and 2 t at 10⁷ km². A landmass below ~1–2 × 10⁴ km²
    can barely support any native herbivore above Diamond's 45 kg threshold; below ~10⁵ km², nothing
    cattle-sized. (Dwarf elephants on Crete and Santa Rosa are recorded exceptions.)
- **Isolation**: long-isolated landmasses evolve endemic clades (Australia: marsupials; S America
  before the Isthmus). None produced a large domesticate except the camelids, which entered S America
  from N America. No direct evidence that isolation by itself lowers domesticability.
- **Late human arrival -> megafauna loss** (above): the strongest continent-scale pattern.
- **Verdict**: yes, a generator can plausibly give a continent fewer domesticable beasts if it is
  (a) **small** (strong: area laws), (b) **isolated so that people arrive late** (strong pattern,
  contested causation), (c) home to a **long-intact large-predator guild** (weak). "Young" (recently
  rifted) on its own should *not* reduce it — a fresh fragment inherits its parent continent's fauna.

---

## 4. How long domestication takes; how many centres

### 4.1 Durations **[strong]**
- Cereals: fixing non-shattering took **~2,000–4,000 years** in wheat, barley and rice (Larson et al.
  2014 PNAS 111:6139 https://pmc.ncbi.nlm.nih.gov/articles/PMC4035915/ ); "at least 2,000–2,500 y"
  for cereals and **1,000–2,000 y** for pearl millet; seeds grow 20–60 % in one or two dimensions;
  rates 0.0006–0.11 haldanes (Fuller et al. 2014, https://pmc.ncbi.nlm.nih.gov/articles/PMC4035951 ).
- Pre-domestication cultivation lasted centuries to millennia before domestic forms appear.
- Selection was weak, comparable to natural selection (Purugganan & Fuller 2011 *Evolution* 65:171,
  11 species, 60 sites https://api-pubmed-ncbi.laibokeji.com/20666839 ). Rates change within an
  episode: rice selection coefficients ~0.001 before 5500 BC, > 0.003 in 5000–4500 BC, ending
  ~4000–3500 BC; wheat/barley strongest 8500–7500 BC (Allaby et al. 2017 *Phil. Trans. B*
  372:20160429 https://pmc.ncbi.nlm.nih.gov/articles/PMC5665816 ). Faster on islands (einkorn on
  Cyprus 0.06 vs 0.006 H).
- Animals: pig ≥ 3,000 yr; for sheep/goat/cattle, ~500–1,500 yr from first management to clear
  morphology (management by 10.5–10 ka and translocation to Cyprus before morphological change).
- From the Holocene onset (11.6 ka) to agriculture: Near East ~1–2 kyr; N China ~1–3 kyr; Mesoamerica
  squash by 10 ka but full farming ~4 kyr later; eastern N America ~5–7 kyr; Sahel/Sudan ~6–7 kyr
  (Richerson et al. 2001 Table 1; Winchell 2017; Burgarella 2018).
- Bowles 2011 PNAS 108:4760 https://pmc.ncbi.nlm.nih.gov/articles/PMC3064343 : foraging wild species
  returned on average **59 % more kcal per hour** than early cereal farming (73 % more once delay and
  risk are counted). Farming was not adopted because it paid better per hour.

### 4.2 How many independent centres **[moderate]**
- Matranga 2024: "at least seven" (confirmed); Richerson et al. 2001: "about 10", unlikely to double;
  Kavanagh 2018: 12; Larson et al. 2014: "**at least 11 regions**" (late Pleistocene–early Holocene
  12–8.2 ka and mid-Holocene 8.2–4.2 ka); Fuller et al. 2014: "perhaps more than 20" (24 areas in
  Fuller's maps, many with only minor crops).
- My spacing calculation over 14 Earth centres (Fertile Crescent, N China, Yangtze, Mesoamerica,
  eastern N America, central Andes, SW Amazonia, New Guinea, W Sahel, E Sahel/Sudan, Ethiopia,
  Ganges, S India, W African forest margin; script at
  scripts/spacing.py):
  - nearest-neighbour distance **min ~720 km, median ~1,100 km, mean ~1,570 km, max ~5,000 km**
    (New Guinea);
  - centres come in **pairs/clusters 700–1,300 km apart** across a habitat contrast (N vs S China:
    millet vs rice; Andes vs Amazon: tubers vs cassava; W Sahel vs forest: pearl millet vs yam;
    Sudan vs Ethiopia; Ganges vs S India), and the clusters lie **2,400–5,000 km apart**;
  - Earth's ~134 M km² of ice-free land: 11 centres ≈ 1 per 12 M km² (equivalent spacing ~3,500 km);
    24 ≈ 1 per 5.6 M km² (~2,400 km).
- Diffusion vs invention: "societies acquire most of their technological innovations by diffusion,
  not independent invention" (Richerson 2001). Independent centres had no agricultural neighbours when
  they began (Larson 2014: the regions were "geographically isolated" from one another). Directed
  animal domestications happen at the *periphery* of existing herding (Larson & Fuller 2014). Adoption
  timing is strongly spatially autocorrelated (de Souza et al. 2025, below). So once a region is within
  diffusion reach of an existing hearth, it becomes a receiver (perhaps adding local crops, which is
  "secondary domestication", already covered), not a new independent centre.

---

## 5. Computational models predicting hearths / adoption

| Model | What it does | How well | Source |
|---|---|---|---|
| Matranga 2024 (regression on TraCE paleoclimate) | seasonality index -> invention/adoption | 6 of 7 inventions in or next to SeasIndex > 925 cells; +10 °C range -> 1 kyr earlier | QJE; MPRA PDF above |
| Ashraf & Michalopoulos 2015 | hump in temperature volatility | optimum ~7–8 °C monthly SD; ±80 yr per °C (countries), 50 yr (sites) | https://pmc.ncbi.nlm.nih.gov/articles/PMC4803118 |
| Kavanagh et al. 2018 | forager density hindcast 21–4 ka (Binford sample, ~77 % of variance) | all 12 centres show rising density and improving environment before domestication (surplus) | https://hraf.yale.edu/ehc/documents/1289 |
| GLUES (Wirtz & Lemmen 2003 *Climatic Change* 59:333; Lemmen, Gronenborn & Wirtz 2011 *JAS* 38:3459 https://www.arxiv.org/abs/1104.1905 ) | 685 regions; traits: technology, number of agro-economies, farming ratio; growth-gradient adaptation; demic and cultural diffusion | W Eurasia: r² 0.37–0.43 against 39 regional onset dates; bias ~400 ± 1,000 yr; climate events delay onset 461 ± 179 yr, not significantly; indigenous farming possible in some Mediterranean landscapes, not in N/C Europe | https://ar5iv.labs.arxiv.org/html/1203.0222 |
| Bowles & Choi 2013 PNAS 110:8830 (agent-based model) | farming co-evolves with private property under NGRIP climate volatility | reproduces timing of emergence | https://pmc.ncbi.nlm.nih.gov/articles/PMC3670368 |
| Gallagher, Shennan & Thomas 2015 PNAS (replication, fitting to idealised outcomes) | key parameters: group structure, small group size, conservatism, property rights; higher farm productivity helps but is **not essential** | qualitative | https://discovery.ucl.ac.uk/id/eprint/1483843/ |
| de Souza et al. 2025 *Sci. Rep.* 15:8301 (Random Survival Forest on first-crop radiocarbon dates) | environment + space | strong spatial autocorrelation (diffusion); Americas: mean T and T seasonality matter most; SW Asia/Europe: seasonal precipitation relative to temperature; **no universal drivers** | https://library.kab.ac.ug/Record/doaj-art-982655a2a93d4e5f9e83233b6a2d3dd8/Description |
| Least-cost / Fast-Marching from origins | crop dispersal arrival times | rice: dual Yangtze origin best fits 400 sites (Silva 2015); Europe: Mediterranean coast and Danube–Rhine corridors fastest (Silva & Steele 2014 *JAS* https://www.sciencedirect.com/science/article/pii/S0305440314001563 ); Bantu farming (Russell et al. 2014 https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0087854 ) | — |
| "Chira et al. 2024, least-cost from 16 origins" | **could not be located** with the searches available; may be misattributed. Treat as unverified | — | — |

Overall: models that **predict hearth locations from environment alone** (Matranga, Ashraf &
Michalopoulos, Kavanagh) explain the *bands* and the *ordering* well but cannot pick the exact spot;
process models (GLUES) fit adoption timing only modestly (r² ~0.4, ±1 kyr). Spread is modelled better
than origin.

---

## 6. Generator-ready rules (inputs -> outputs)

All thresholds below should be smooth weights (logistic/Gaussian), not hard cut-offs, and any
neighbourhood measure must be in km (BFS hops = round(km / avgEdgeKm)) for scale invariance.

**A. Derived per-cell metrics**
- `TempSeas = max(T_warm3, 0) − max(T_cold3, 0)` (quarter means) — Matranga.
- `PrecipSeas = (P_maxMonth − P_minMonth) / P_meanMonth`.
- `SeasIndex = max(pct(TempSeas), pct(PrecipSeas))` over the planet's land cells.
- `TempSD = sd(12 monthly T)` — Ashraf & Michalopoulos (≈ annual range / 2.8).
- `ET = (18W − 10C)/(W − C + 8)` — Binford's effective temperature.
- `dryMonths` = months with P(mm) < 2·T(°C) (Gaussen); `winterRainFrac` = share of P in the cold half.
- `r5` = elevation range within ~5–10 km (≈ local slope × cell size on coarse grids); `r50` = range
  within 50 km.
- `water` = distance to a permanent river (discharge above a threshold) or lake ≤ ~20 km.

**B. Progenitor-archetype suitability** (fuzzy ranges; see §2)
1. Winter-rain grains + pulses: Cs*/BSk with winterRainFrac > 0.6, P 250–1,000 (peak 350–550),
   Tcold 0–12 °C, 3–6 dry summer months, elevation −400…2,000 (peak 300–1,500), tree share 0.1–0.5.
   Highest progenitor density (Blumler: ~32 of 56 big-seeded grasses).
2. Summer-rain millets: Dwa/Dwb/Cwa/BSk monsoon, P 300–800, TempSeas ≥ 25 °C, fine sediment/loess.
3. Wetland rice: MAT > 17 °C, warmest quarter > 26 °C, wetland/floodplain (low slope, high discharge,
   lakes), P > 1,000, |lat| ≲ 30°.
4. Teosinte-type: Aw/Cwa, elevation 450–1,950 (core 600–1,400), 5–7 dry months, open dry forest/savanna.
5. Sahel grains: BSh/Aw, P ~200–900 (pearl millet drier, sorghum wetter), 3–5 month summer rains,
   seasonal lakes/floodplains.
6. Forest-margin yams / 7. Amazon-margin cassava: Aw/Am, P 1,000–2,000, 3–5 dry months, tree share
   0.3–0.7, lowland.
8. Highland tubers: |lat| < 25°, elevation 2,000–4,000, MAT 5–12, frost.
9. Wet vegeculture: Af/Am, P > 2,000, dryMonths ≤ 2; taro on wetland margins.
Rule of thumb: dryMonths ≥ 4–5 or a cold season -> seed crops; ≤ 2 -> vegeculture; 3–5 -> roots with
a seed-crop fringe.

**C. Hearth score** per region (~300–500 km patch):
`H = richness(B) × f_seas × f_vol × f_surplus × f_water × f_ecotone × f_delay`
- `f_seas`: logistic on SeasIndex, midpoint ~0.85–0.9 percentile.
- `f_vol`: Gaussian on TempSD, peak ~7.5 °C, σ ~3 °C (penalises < 2 °C equatorial and > 12 °C continental).
- `f_surplus`: forager productivity must be high, not marginal: growing-season length × moisture;
  ET ≥ ~13 (plants can be a staple).
- `f_water`: permanent river/lake/spring within ~20 km.
- `f_ecotone`: rises with r5 (hundreds of metres of relief nearby), falls with r50 − r5 (≈ −500 yr per
  extra 1,000 m within 50 km).
- `f_delay` (< 1): superabundant storable wild food (cold upwelling coasts, big temperate rivers with
  salmon-like runs, acorn woodland) -> rich sedentary foragers who farm late.
- Expect the winners in two bands: |lat| ~25–40° (strong temperature or winter-rain seasonality) and
  ~5–20° (long tropical dry season, often mid-elevation); none poleward of ~45° or in BW cores.

**D. Count, spacing, timing**
- Number: ~10–25 on an Earth-like planet (≈ 1 per 5–12 M km² of non-desert, non-ice land); pick by H
  with Poisson-disk spacing ≥ ~700 km; allow paired centres 700–1,300 km apart across a habitat
  contrast; clusters ~2,500–5,000 km apart.
- Onset: earliest ~1 kyr after the planet's "Holocene" in the top-H centre; the others spread over
  ~7 kyr; ~1 kyr earlier per +10 °C TempSeas. Cultivation -> domestic cereal 2–4 kyr; millet ~1–2 kyr;
  vegeculture fuzzy/faster; full dependence later still.
- Any high-H region within diffusion reach of an earlier hearth becomes a receiver, not a new centre.

**E. Animals**
- Commensal first (dog wherever people are; cat/pig/chicken-types where villages and grain stores are).
- Prey animals (gregarious herbivores ≥ 45 kg) at hearths that have them: rugged hills 500–2,500 m ->
  sheep/goat-type; floodplain–woodland mosaics -> cattle-type; tropical wetlands -> buffalo-type;
  puna 3,500–5,000 m -> camelid-type; cold plateau 3,000–5,500 m -> yak-type; tundra -> reindeer-type
  (late, by nomads).
- Directed animals later (+2–5 kyr) at the periphery of herding: steppe -> horse-type; desert/oasis ->
  camel-types; arid river fringe -> donkey-type.
- Per continent: candidate pool ∝ A^0.25–0.33; largest herbivore ≈ 0.47·A^0.52 kg (none ≥ 45 kg below
  ~10⁴ km²); multiply by (1 − megafauna loss), the loss growing with how late and how remotely people
  arrive (21 % … 88 %); success per candidate ~10 % on average (Eurasia 18 %, Americas 4 %, Africa 0 %),
  lower where big predators stayed intact.
