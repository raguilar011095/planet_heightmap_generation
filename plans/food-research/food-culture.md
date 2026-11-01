# Food culture map modes: research notes

Prepared 2026-10-31 for World Orogen's Food tab. Each section gives the real-world pattern, thresholds where the literature has them, a proposed rule built from the inputs the Food tab already has, and how strong the evidence is.

**Notation used in the rules**
- `Tc`: coldest-month mean temperature (°C). `Tw`: warmest-month mean (°C). `Tann`: annual mean.
- `P`: annual precipitation (mm). `Pm[i]`: monthly precipitation. `dryMonths`: number of months with Pm < 60 mm. A month is "arid" when Pm < 2×Tm (Gaussen).
- `GSL`: growing-season months. `GST`: mean temperature over the 7 warm months (Apr–Oct in the north, Oct–Apr in the south). `GDD10`: degree-days above 10 °C summed over those 7 months, from the monthly means (≈ Σ max(0, Tm − 10) × 30.4).
- `H.paddy`, `H.cool`, `H.warm`, `H.roots`: crop-group harvest shares. `herd`: pasture/herding. `fish`. `wild`. `tree`, `needle`: land-cover shares. `coastKm`: distance to the coast. `elev`: elevation. `river`, `lake`. `upwell`: sea upwelling or temperature. `rockSalt`: rock salt deposits from geology.
- **Scale invariance:** every threshold below is in physical units (°C, mm, months, km, m), so none needs resolution scaling. Any "nearby" test (for example, trade rarity within R km) must use a radius in km, never a hop count.
- **Smooth, not thresholds** (owner rule): turn each threshold into a smoothstep ramp across about ±2 °C or ±20 % of its value, multiply the ramps into a suitability score per category, then take the category with the highest score (argmax). Then the edges are the zones where two scores cross, not stair-steps.

**Evidence grades**
- **A**: agronomy or physiology with measured limits, or a controlled study.
- **B**: a robust descriptive or historical pattern.
- **C**: plausible, popular or contested.
- **D**: speculative.

---

## 1. Cooking fat

### The real pattern (before industrial seed oils)
- **Olive oil (Mediterranean).** The traditional range is 30°–45° latitude in both hemispheres. Expansions reach about 27–33° S in the Andean foothills and 22–27° N in southern China, and there is one site above 50° N in Devon. The plant is usually grown from sea level to 700–800 m, up to 1600–1700 m in the Atlas. Its home climate is mild humid winters with minimums near −4 °C and hot dry summers.
  - Frost damage to the tree: slight at 0 to −3 °C, moderate at −6 to −7 °C, severe below −12 to −18 °C.
  - LT50 (temperature that kills half the tissue): leaves −12 °C, buds −8 °C, twig cambium −16 °C, root cambium −6 °C.
  - Flowers are seriously damaged below −3 to −4 °C in spring. Fruit is damaged by a fall to −0.4 to −3 °C before harvest.
  - Severe freezes recur every 10–40 years in the Mediterranean.
  - Chilling between 5 and 12 °C is what triggers flowering; typical figures are 200–300 h. Warm winters give asynchronous flowering, which is why olives fail in the wet tropics.
  - Sources: Frost-tolerance review (PMC9144808) https://pmc.ncbi.nlm.nih.gov/articles/PMC9144808/ ; Wikifarmer on cold-hardy cultivars https://wikifarmer.com/library/en/article/cold-hardy-olive-varieties ; UF/IFAS https://blogs.ifas.ufl.edu/stlucieco/2022/05/26/growing-olive-tree-in-florida/ ; IOC catalogue https://worldolivecatalogue.internationaloliveoil.org/en/search?page=3
- **The butter / olive (/ lard) line in Europe.** Northern, Central and Eastern Europe cooked with butter and lard; the Mediterranean cooked with olive oil.
  - Flandrin & Montanari (*Food: A Culinary History*, 2000) describe butter becoming a prestige fat only in the early modern period, while olive oil spread further in the south where the Church was strong.
  - Lent forbade animal fats, which pushed olive oil north as an import, and the Church sold dispensations. Rouen Cathedral's "Butter Tower" (1488–1506) was partly paid for by dispensations to eat butter in Lent.
  - Lard sat alongside both fats: pig fat in Iberia's interior, Central and Eastern Europe, and northern Italy.
  - Sources: https://thenewgastronome.com/?p=4508 ; https://lapanzapiena.substack.com/p/olive-oil-vs-butter-italys-great ; Rouen Cathedral https://en.wikipedia.org/wiki/Rouen_Cathedral ; https://www.webexhibits.org/butter/countries.html . Most of these are popular sources; the map pattern is grade B, the religious explanation grade B/C.
- **Coconut oil (South India, Southeast Asia, Pacific coasts).**
  - Thrives within about 23° N–23° S. The commercial altitude limit is about 600 m, and it grows best below 1000 m near the coast.
  - Mean temperature 25–29 °C. Yield falls when the annual mean drops below about 21 °C. One review gives no temperatures below 15 °C.
  - Rainfall 1000 mm or more if evenly spread; optimum 1300–2300 mm.
  - Sources: TNAU https://agritech.tnau.ac.in/expert_system/coconut/coconut/coconut_planting_seasons.html ; KAU https://celkau.in/crops/plantation/coconut/climate.php ; Carr, review of coconut water relations (Experimental Agriculture) https://resolve.cambridge.org/core/journals/experimental-agriculture/article/abs/an-analysis-of-the-effect-of-climate-and-weather-on-coconut-cocos-nucifera/8A10FC3738A618CC28275BD11E92F7C5 ; MDPI https://www2.mdpi.com/2071-1050/11/18/5132
- **Palm oil (West and Central Africa only, before industry).**
  - Rainfall about 2000 mm or more, well spread (1800–2500 mm).
  - Tolerates a dry season of 2–4 months; fewer than about 4–5 months is favourable.
  - Optimum 24–28 °C, mean maximum 30–32 °C.
  - Sources: KAU https://celkau.in/crops/plantation/oilpalm/climate.php ; Carr 2011, review of oil-palm water relations, Experimental Agriculture https://www-cambridge-org.ezproxyberklee.flo.org/core/journals/experimental-agriculture/article/water-relations-and-irrigation-requirements-of-oil-palm-elaeis-guineensis-a-review/CC4E0C8360BF74EB8A25B2A8C866137D ; https://www.cropj.com/bayona_supp_13_3_2019_424_432.pdf
- **Shea butter (the Sudano-Sahelian savanna belt from Senegal to Uganda).**
  - The belt is 500–700 km wide and about 6000 km long.
  - Subspecies *paradoxa*: 600–1400 mm rain, 5–8 dry months, annual mean 25–29 °C, 100–600 m altitude (up to 1300 m).
  - Subspecies *nilotica*: 900–1400 mm, 3–5 dry months, 450–1600 m.
  - PROTA: "High quality shea butter is consumed throughout West Africa as a cooking fat."
  - Its northern limit tracks the 600 mm isohyet.
  - Sources: PROTA https://plantuse.plantnet.org/en/Vitellaria_paradoxa_(PROTA) ; parkland-tree range shift (PMC5773006) https://pmc.ncbi.nlm.nih.gov/articles/PMC5773006 ; FAO NWFP https://www.fao.org/forestry/nwfp/statistics/shea-tree/en
- **Tail fat and tallow (arid pastoral belt from North Africa through the Middle East and Central Asia to China).**
  - Fat-tailed breeds are about 25 % of the world's sheep. Some store more than 20 % of their body weight in the tail.
  - They were selected for steppe and desert conditions in Central Asia by about 3000 BCE.
  - Tail fat (*dumba*, *qurdiuq*) is the classic cooking fat of Uzbek and Persian-sphere cooking.
  - Sources: https://en.wikipedia.org/wiki/Fat-tailed_sheep (cites Tilsley-Benham 1987, "Sheep with two tails") ; https://pmc.ncbi.nlm.nih.gov/articles/PMC7670677
- **Sesame (hot, semi-arid, irrigated lowlands: Mesopotamia, India, Sudan, northern China).**
  - Herodotus (*Histories* 1.193) wrote that sesame was the only oil used in Babylonia.
  - Charred sesame at Harappa/Mohenjo-daro; the Sanskrit for oil, *taila*, comes from *til* (sesame). Mustard and linseed at Chanhudaro.
  - In China lard came first; sesame was the first vegetable oil, before about 600 CE. Rapeseed, cottonseed and soy oil spread later.
  - South India: sesame and coconut oil. North and east India: mustard oil. Ghee was the prestige fat everywhere in India (K.T. Achaya, *Indian Food: A Historical Companion*).
  - Sources: Bedigian 2004, Economic Botany https://bioone.org/journals/economic-botany/volume-58/issue-3/0013-0001(2004)058[0330:HALOSI]2.0.CO;2/COVER-ARTICLE--History-and-Lore-of-Sesame-in-Southwest/10.1663/0013-0001(2004)058[0330:HALOSI]2.0.CO;2.full ; IMSc note on Indian oils https://www.imsc.res.in/~indu/JM/2012/SepOct/Food4-6/food2.doc ; Soyinfo Center history of oil crushing https://www.soyinfocenter.com/HSS/soybean_crushing2.php ; https://en.wikipedia.org/wiki/Sesame_oil
- **Marine oils: seal, whale, fish oil and eulachon grease (Arctic and subarctic coasts, Pacific Northwest).**
  - The Pacific Northwest's "grease trails" carried eulachon oil inland, for perhaps up to 4000 years. The Nuxalk–Carrier trail runs about 420 km. Grease was traded for furs, copper and obsidian.
  - Sources: https://en.wikipedia.org/wiki/Grease_Trail ; BC Geographical Names https://apps.gov.bc.ca/pub/bcgnws/names/68181.html ; National Geographic https://www.nationalgeographic.com/history/article/150707-salvation-fish-canada-first-nations-animals-conservation-world

### Proposed map mode "Cooking fat"
Compute every score and take the highest. Each score is availability × suitability.

| Category | Rule (soft ramps) | Grade |
|---|---|---|
| **Olive oil** | `Tc` 3–13 °C (ramp up across 1–5 °C, down across 13–17 °C: needs chill); `Tw` ≥ 21 °C; summer drought (Cs climate, or ≥ 2 arid summer months) gives a bonus; P 250–1000 mm; slopes OK. Treat `Tc` ≈ 3–4 °C as a proxy for absolute minima above about −10 °C. | A (limits), B (as the dominant fat) |
| **Coconut oil** | `Tc` ≥ 20 °C (ramp 18–22); P ≥ 1000 mm; `coastKm` ≤ ~50–100 (strand palm); elev < 600 m | A |
| **Palm oil** | `Tc` ≥ 22 °C; P ≥ 1600 mm; dryMonths ≤ 3–4; lowland; forested | A |
| **Shea butter** | P 600–1400 mm; 5–8 dry months; `Tann` 24–29 °C; savanna (tree share moderate) | A |
| **Butter** | herd high and dairy present (see §6); cool (`Tw` ≤ 22 °C); P ≥ 500 | B |
| **Ghee / clarified butter** | herd high and dairy present; hot (`Tw` ≥ 26 °C or `Tann` ≥ 20 °C), because clarified fat keeps in heat | B |
| **Lard** | pig suitability: settled crops (not nomadic) plus tree ≥ ~0.2 plus P ≥ 600 mm (pigs need shade, water and mud; Harris) | B/C |
| **Tail fat / tallow** | herd dominant; P < 450 mm; treeless; `Tw` ≥ 18 °C (fat-tailed sheep); colder steppe → mutton/horse fat | B |
| **Sesame oil** | `Tw` ≥ 25 °C; frost-free season ≥ 4 months; P 300–900 mm or a river; olive score low | B/C |
| **Mustard / rapeseed oil** | H.cool present as a winter crop in subtropics (`Tc` 8–18 °C, monsoon) or cool humid temperate; olive and dairy weak | C |
| **Seal / fish oil** | `Tw` ≤ 10–12 °C; coastKm small; fish high; or coastal upwelling with a rich fish run | A (Arctic), B (PNW) |
| **(optional) Nut oil** (walnut, argan) | small niche: temperate deciduous forest without dairy, or semi-arid Morocco-type | C |

Visual note: in Europe this yields an olive band, with butter and lard north of it and tail fat to the east, which is the famous map. Lard as a third band (Central and Eastern Europe, China) adds texture.

---

## 2. Drinks

### Grape wine
- **Growing-season temperature (GST, Apr–Oct mean, Gregory Jones).** Quality wine needs 13–21 °C; viticulture is possible across 12–22 °C. Cool regions sit at 13–15 °C, the warmest at 19–21 °C. Pinot noir needs 13–17 °C.
  - Sources: Jones, *Climate, Grapes and Wine* https://ives-openscience.eu/wp-content/uploads/2023/03/Climate_Grape_Wine_Jones.pdf ; https://ives-openscience.eu/jones
- **Winkler index.** Degree-days above a 10 °C base, summed Apr 1–Oct 31.
  - Region I ≤ 1389 °C-days (2500 °F), II 1389–1667, III 1667–1944, IV 1944–2222, V > 2222.
  - One source gives about 850 °C-days as the lower bound of Region I, which works as a practical floor.
  - Sources: https://en.wikipedia.org/wiki/Winkler_index ; ClimInd package docs https://search.r-project.org/CRAN/refmans/ClimInd/html/wki.html
- **Winter cold.** Mid-winter bud LT50 for *V. vinifera* is about −15 to −22 °C; Riesling survives to about −21/−25 °C. Colder continental zones must bury the vines (as in historic Central Asia and northern China).
  - Sources: Texas A&M https://aggie-horticulture.tamu.edu/wp-content/uploads/sites/13/2018/06/Grapevine-Cold-Hardiness.pdf ; MSU https://www.canr.msu.edu/news/understanding-grapevine-cold-hardiness ; Ohio State https://ohiograpeweb.cfaes.ohio-state.edu/blog/archive/202301
- **The "30–50° latitude" band is a popular framing, not a primary source (C).** Jones warns that latitude is a misused proxy. Use GST and GDD instead.

### Wine, beer and vodka belts
- Wine in the south, beer in the middle (Britain, the Low Countries, Germany, Czechia), vodka in the north and east.
- The belts describe traditional drinks, not today's consumption. Poland switched to beer by 1998.
- One widely repeated claim says the vodka belt's southern edge follows the −2 °C January isotherm. This is a popular source only (C).
- Vodka is distilled, which is late medieval. Before that, the cold grain zone drank beer, mead and kvass.
- Sources: Big Think https://bigthink.com/strange-maps/442-distilled-geography-europes-alcohol-belts/ ; Datawrapper https://www.datawrapper.de/blog/europe-map-alcohol-consumption ; Wikipedia, "Alcohol belts of Europe" https://EN.wikipedia.com/wiki/Vodka_Belt

### Other pre-industrial drinks
- **Fermented mare's milk (kumis/airag).**
  - Residues in Botai pottery (Kazakhstan, about 3500 BCE) suggest mare's milk, probably taken in summer (Outram et al. 2009, *Science*).
  - Herodotus describes Scythian milk processing.
  - Kumis is 0.7–2.5 % alcohol. Mare's milk has about 40 % more lactose than cow's, which feeds the fermentation.
  - Herders milk only in summer, so the drink is seasonal.
  - Sources: https://en.wikipedia.org/wiki/Kumis ; https://www.sciencenews.org/article/horse-domestication-traced-ancient-central-asian-culture ; https://phys.org/news/2009-03-archaeologists-earliest-domestic-horses.pdf
- **Palm wine / toddy.**
  - Traditional across tropical Africa, South and Southeast Asia, Central and South America; about 4–6 % ABV.
  - Made from many palms: oil palm and raffia in Africa; coconut, palmyra, *Arenga* and nipa in Asia.
  - Sources: bioRxiv 2024 https://www.biorxiv.org/content/10.1101/2024.04.26.591403.full.pdf ; Frontiers 2023 review https://www.frontiersin.org/articles/10.3389/frfst.2023.1225762/full
- **Maize chicha (Andes) and cassava beer (masato, cauim, Amazonia).** Starch is converted by chewing. Chicha can also be made from cassava or fruit. Grade B (ethnographic).
  - Sources: Frontiers review (as above) ; https://www.good.is/food/fermented-drinks-worldwide
- **Sorghum and millet beer.** Grade B (well known; this search returned no primary source).
  - Examples: dolo, pito, tella, umqombothi and chibuku in Africa; chhang and tongba in the Himalaya.
  - Medicated/traditional beverages chapter: https://www.eurekaselect.com/chapter/28504
- **Rice wine (East and Southeast Asia: huangjiu, sake, makgeolli, tapai, lao-lao).** Paddy-dominant regions. Grade B.
- **Pulque (fermented agave sap, aguamiel).** Central Mexican plateau, in cold, dry, rocky highlands (Hidalgo, Tlaxcala); pre-Hispanic.
  - Sources: PMC4928461 https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4928461/ ; https://en.wikipedia.org/wiki/Pulque
- **Mead.** Honey drinks in the forest belt where grapes fail and grain is marginal or prestige: Poland, Lithuania, Rus', Scandinavia; also Ethiopian *tej*.
  - Polish tree beekeeping (*bartnictwo*) is more than 1000 years old. Wax was a major medieval export. It survives in Bashkiria.
  - Sources: https://pomorskie.travel/en/articles/pomorskie-miodem-plynace/ ; https://wilanow-palac.pl/pl/change/en/jak-sie-dzieje-barc ; https://cepl.sggw.edu.pl/wp-content/uploads/sites/75/2021/08/sim34_Sliwka.pdf?x68467
- **Kava (non-alcoholic).** Probably originated in Vanuatu. Grown across Melanesia and Polynesia, but cannot grow in New Zealand's cold.
  - Needs the per-humid tropics: 20–35 °C, rainfall > 2000 mm, shade.
  - Sources: PROSEA https://prosea.prota4u.org/view.aspx?id=614 ; Guampedia https://www.guampedia.com/kava-a-popular-plant-of-the-pacific/

### Stimulants (could be a second layer or a toggle)
- **Tea (*Camellia sinensis*).**
  - FAO EcoCrop (var. *sinensis*): rainfall optimum 1400–2000 mm, tolerated 1000–4500 mm.
  - Growth stops below about 13 °C and above 35 °C.
  - var. *sinensis* tolerates occasional −5 to −10 °C; var. *assamica* is frost-tender.
  - It is a hill crop on acidic soils.
  - Sources: EcoCrop https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=4090 ; UF/IFAS https://edis.ifas.ufl.edu/publication/HS308/pdf ; Farmers Weekly https://www.farmersweekly.co.za/farm-basics/how-to-crop/learn-basics-growing-tea/
- **Coffee (arabica).**
  - Very narrow daily temperature band of 18–23 °C, or 15–24 °C. Frost-sensitive.
  - In Ethiopia it grows at 1300–1800 m with 1500–2500 mm of rain.
  - Origin: the southwestern Ethiopian highland forests; Yemen as the early cultivator.
  - Sources: Thai review https://li01.tci-thaijo.org/index.php/thaiagriculturalresearch/article/view/242408 ; https://core.ac.uk/download/386156221.pdf ; Cenicafé https://publicaciones.cenicafe.org/index.php/pex/article/download/4822/5967/4651
- **Cacao.**
  - Grown 20° N–20° S.
  - Rainfall 1250–3000 mm, preferably 1500–2000 mm, with no more than 3 months under 100 mm.
  - Range 15–39 °C, optimum about 25 °C. Not grown where the minimum falls below 10 °C or the annual mean is below 21 °C.
  - It is a lowland crop.
  - Sources: CPCRI Cocoa Guide 2018 https://cpcri.gov.in/filemgr/webfs/publication/COCOA_GUIDE_2018.pdf ; ICRAF https://apps.worldagroforestry.org/treedb/AFTPDFS/Theobroma_cacao.PDF
- **Kola (West African forest zone).**
  - Traded north to the savanna and Sahel, where it does not grow, by the 11th–13th century. Lovejoy, *Caravans of Kola* (1980). Grade B.
  - Sources: Gestrich et al. 2021 https://link.springer.com/article/10.1007/s10437-021-09445-7 ; Lovejoy review https://www.cambridge.org/core/journals/journal-of-african-history/article/kola-trade-caravans-of-kola-the-hausa-kola-trade-17001900-by-paul-e-lovejoy-zaria-ahmadu-bello-university-press-and-university-press-ltd-in-association-with-oxford-university-press-1980-pp-x-181-no-price-stated/51ECD65A20DFE78622C6759BD4A9D935
- **Others (grade B from general ethnobotany; no dedicated source fetched):**
  - Yerba mate: humid subtropical Paraná/Atlantic forest.
  - Coca: Andean east-slope montane forest, about 500–2000 m.
  - Khat: Yemeni and East African highlands.
  - Betel/areca: humid tropical Asia and Melanesia.

### Proposed map mode "Drink"
Score each category and take the highest; wine wins ties where it is suitable.

| Category | Rule | Grade |
|---|---|---|
| **Wine** | GST 12–22 °C (peak 14–20); GDD10 ≥ 850; `Tc` ≥ −4 °C (a proxy for absolute minima above about −20 °C); penalise growing-season months with T > 22 °C and Pm > 120 mm (fungal disease, as in the humid subtropics and tropics); slope bonus | A |
| **Barley/wheat beer** | H.cool dominant; wine weak | B |
| **Mead** | tree ≥ 0.4 (broadleaf/mixed) and cold (`Tc` ≤ −3 °C); wine impossible; grain weak to moderate; or highland honey regions | B/C |
| **Fermented mare's milk** | herd dominant, crops low; treeless steppe; `Tc` ≤ −8 °C; P 200–500 mm | B |
| **Rice wine** | H.paddy dominant | B |
| **Millet/sorghum (or maize) beer** | H.warm dominant | B |
| **Root beer (cassava, masato)** | H.roots dominant; `Tc` ≥ 18 °C; humid | B |
| **Palm wine / toddy** | `Tc` ≥ 20 °C; P ≥ 1000 mm; lowland; coastKm small or riverine; grain weak | B |
| **Agave sap wine (pulque)** | semi-arid highland: elev ≥ 1500 m; `Tc` 5–15 °C; P 400–800 mm; dry winter (Cwb/BSk) | B |
| **Kava** | `Tc` ≥ 20 °C; P ≥ 2000 mm; H.roots dominant; coastKm small (island-like); grain absent | B |
| **None / broth** | Arctic hunters (`Tw` < 10 °C, crops ≈ 0, herd ≈ 0) and arid foragers | B |

Stimulant layer: tea, coffee, cacao, kola, mate, coca or betel, using the agronomic limits above. Coffee: tropical (|lat| < 25°) at elevations where `Tann` is 15–24 °C, frost-free, P 1200–2500 mm. Tea: `Tc` ≥ −2 °C (sinensis) or ≥ 12 °C (assamica), P ≥ 1200 mm, slope, acidic soil, monsoon. Cacao: |lat| < 20°, `Tann` ≥ 21 °C, `Tc` ≥ 18 °C, P 1500–3000 mm, ≤ 3 months under 100 mm, lowland.

---

## 3. Sweeteners

- **Honey.** The universal default. There is temperate forest beekeeping (Polish *bartnictwo*, Bashkiria). The Americas had no honeybees: the Maya kept stingless bees. Grade B.
- **Dates and date syrup.**
  - Heat units of about 3300–3400 °C-days above a 10 °C base, from pollination to full maturity, for the finest varieties. Algerian cultivars need about 1500–1940 °C-days (Deglet Nour about 1890 °C over 200 days).
  - An 18 °C base is used for flowering, which does not start below 18 °C.
  - It must be rainless and dry from flowering to ripening; rain and humidity ruin the fruit.
  - Hence hot-desert oases with groundwater or rivers ("feet in water, head in fire").
  - Sources: https://acta.sapientia.ro/content/docs/04-907135.pdf ; https://orbi.uliege.be/bitstream/2268/240339/1/article%20Rihab%202020.pdf ; https://growables.org/information/TropicalFruit/PalmPhoenixDactiliferaFruitipedia.htm ; https://epubs.icar.org.in/index.php/AAZ/article/download/65835/28061/165209
- **Cane sugar / jaggery.**
  - Frost kills it, and even brief freezing makes a region unsuitable.
  - Optimum 20–35 °C (sources vary). Rainfall 1500–2500 mm, or irrigation.
  - A cooler, drier ripening period raises the sucrose.
  - History (general knowledge, grade B): domesticated in New Guinea; crystallised sugar (*khanda*) in India in the first millennium CE; spread by the Islamic world with irrigation to Egypt, Sicily and Cyprus; Mintz, *Sweetness and Power*.
  - Sources: IntechOpen https://www.intechopen.com/online-first/1178854 ; PMF IAS https://www.pmfias.com/crop-210-frost-free-days-pyq-2020/
- **Maple and birch sap.**
  - Sap flow is driven by freeze–thaw: freezing nights and thawing days build stem pressure. The bigger the day–night swing, the more sap.
  - In Quebec, 64 % of sap-flow days had a freeze–thaw event. Flow ends once it stays above freezing and buds open.
  - Maple sugaring belongs to northeastern North America (continental Dfa/Dfb with deciduous forest). Birch sap is drunk and fermented in the Baltic, Belarus, Ukraine and Russia (grade B, general).
  - Sources: Royal Society Te Apārangi (NZ synchrotron study) https://synchrotron.royalsociety.org.nz/science-impact/primary-industries-and-environment/maple-syrup-industry ; Frontiers in Agronomy 2024 https://www.frontiersin.org/articles/10.3389/fagro.2024.1496255/full ; UVM https://www.uvm.edu/femc/attachments/project/999/annualMeeting/2017/presentations/Rapp_FEMC_ImpactsOfClimateChangeOnMapleSyrupProduction_121417.pdf ; Michigan https://mi-maplesyrup.com/making-maple-syrup
- **Palm sugar (South and Southeast Asia).** Palmyra (*Borassus*) in the seasonally dry tropics: Tamil Nadu, northern Sri Lanka, Cambodia. Coconut, *Arenga* and nipa in wetter areas. The same sap makes toddy. Grade B, general.
- **Grape molasses (pekmez, dibs, sapa/defrutum) and carob syrup.** Wine-climate regions, especially where wine was not drunk (the Islamic Mediterranean). Grade C: the choice is cultural.

### Proposed map mode "Sweetener"

| Category | Rule | Grade |
|---|---|---|
| **Dates** | `Tw` ≥ 30 °C; summed (Tm − 10) over the hot months ≥ ~2000 °C-days; P < 250 mm, and the ripening months (late summer to autumn) nearly rainless; plus river, lake or groundwater; `Tc` ≥ 8 °C | A |
| **Cane sugar** | `Tc` ≥ 16 °C (frost-free); `Tw` ≥ 25 °C; P ≥ 1200 mm or a river; lowland; GSL ≥ 9 | A |
| **Palm sugar** | `Tc` ≥ 20 °C; distinct dry season (3–7 dry months); coast, sandy plain or delta | B |
| **Maple syrup** | deciduous forest (tree high, needle < 0.5); `Tc` ≤ −4 °C; at least one spring month with mean −3…+5 °C; continental (large annual range, `Tw − Tc` ≥ 25 °C) | A (mechanism), B (geography) |
| **Birch sap** | as maple, but colder and more needle-leaf (Dfc, `Tc` ≤ −10 °C) | B |
| **Grape syrup** | wine score high but the drink is not wine, or hot-dry wine fringe (Csa/BSk) | C |
| **Honey** | the default where nothing above scores; plus the forest-beekeeping belt | B |

---

## 4. Spice

### What the correlation shows
- **Billing & Sherman 1998** (*Quarterly Review of Biology* 73:3–49).
  - Data: 4578 meat-based recipes from 93 cookbooks; 43 spices; 36 countries.
  - As the mean annual temperature rose, so did the share of recipes with spices, the number of spices per recipe, the total number of spices used, and the use of the most potent antibacterial spices, both within and among countries.
  - Their explanation: spices fight food spoilage. They also tested four alternative explanations and found none well supported.
  - Sources: PDF https://bpb-us-e1.wpmucdn.com/blogs.cornell.edu/dist/3/1009/files/2015/05/Antimicrobial-Functions-of-Spices.pdf ; Cornell news https://news.cornell.edu/stories/1998/03/food-bacteria-spice-survey-shows-why-some-cultures-it-hot ; ScienceDaily https://sciencedaily.com/releases/1998/03/980305053307.htm
- **Bromham et al. 2021** (*Nature Human Behaviour* 5:878–891, doi 10.1038/s41562-020-01039-8).
  - Data: 33,750 recipes, 70 cuisines, 93 spices.
  - They acknowledge the raw pattern ("spicier food is found in hotter countries").
  - Once they account for shared ancestry and spatial proximity, "variation in spice use is not explained by temperature." Nor is it explained by cultural, plant, crop or native-spice diversity.
  - Spice use scales with a bundle of socioeconomic and health indicators (GDP per capita, life expectancy, even deaths not from infection), so the cause cannot be pinned down.
  - Sources: PubMed https://pubmed.ncbi.nlm.nih.gov/33542529 ; Nature https://www.nature.com/articles/s41562-020-01039-8 ; phys.org https://phys.org/news/2021-02-spicy-isnt-infection.html
- **What survives:** a descriptive gradient, with hot, poorer, lower-latitude cuisines being more heavily spiced. The causal story (antimicrobial adaptation) does not survive. For a concept-art tool, a temperature-based intensity gradient reproduces what people see on Earth. It should not be described as germ-driven. Grade B for the gradient as observed, C/D for the mechanism.

### Where spice plants come from: narrow native ranges, which drive trade
- **Cloves:** native only to a handful of small volcanic islands in the North Moluccas (Ternate, Tidore, Moti/Makian, Bacan).
- **Nutmeg and mace:** only the tiny Banda Islands until the 1500s. The Dutch could monopolise nutmeg but not cloves.
  - Sources (clove, nutmeg): https://www.worldhistory.org/article/1849/the-early-history-of-clove-nutmeg--mace/ ; Sydney University Press https://open.sydneyuniversitypress.com.au/9781743325445/pfp-the-rise-and-decline-of-the-spice-islands.html ; GBIF https://www.gbif.org/species/113634137
- **Black pepper:** native to southwestern India and Sri Lanka, in the humid evergreen forests of the Western Ghats (Kew POWO).
- **Green cardamom:** native to southwestern India (the Cardamom Hills of the Western Ghats); world supply came from wild stands there until the 19th century.
- **True cinnamon:** native to Sri Lanka.
  - Sources (pepper, cardamom, cinnamon): https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:682369-1/general-information ; https://powo.science.kew.org/taxon/796556-1/general-information ; https://en.wikipedia.org/wiki/Cinnamomum_verum ; https://india.mongabay.com/2019/06/when-and-from-where-did-black-pepper-come-to-india/
- **Chilli:** domesticated in central-east Mexico (Kraft et al. 2014, *PNAS* 111:6165). It spread to Asia and Africa only after 1492 and became pan-tropical within about a century.
  - Sources: https://ui.adsabs.harvard.edu/abs/2014PNAS..111.6165K ; https://sciencedaily.com/releases/2014/04/140421093925.htm
- **Mediterranean aromatic herbs:** thyme, oregano, rosemary, savory. These are evergreen Lamiaceae shrubs whose essential oils track adaptation to summer drought and high sun. Grade B for the ecology.
  - Sources: Springer https://link.springer.com/article/10.1007/BF02189456 ; Frontiers review https://www.frontiersin.org/articles/10.3389/fpls.2022.864807
- **Frankincense (*Boswellia sacra*):** the arid leeward side of Dhofar's monsoon mountains (the Nejd), within reach of the cool monsoon winds but outside its rain; on limestone up to 1200 m; also northern Somalia and Hadhramaut.
  - Sources: CITES PC25 Inf.18 https://cites.org/sites/default/files/eng/com/pc/25/Inf/E-PC25-Inf-18.pdf ; Oman National Museum https://www.nm.gov.om/en/the-land
- **"Flavour principles" (Elisabeth Rozin, 1973/1983).** Each cuisine is recognised by a small signature combination, e.g. soy sauce + rice wine + ginger (China), olive oil + lemon + oregano (Greece). This is a nice frame for map categories. Grade B as description.
  - Sources: https://www.eatyourbooks.com/library/48359/ethnic-cuisine ; https://restaurantbusinessonline.com/understanding-flavor-principles

### Proposed map mode "Spice / flavour"
Two outputs:
- **Intensity** (a continuous shade): rises with `Tann`, roughly from 5 °C to 27 °C, plus a bonus near spice-source cells or trade routes. Grade B as observed; label it "how spiced", never "because of germs".
- **Palette** (a category):

| Category | Rule |
|---|---|
| **Tropical aromatic** (pepper, ginger, turmeric, cardamom, clove) | Af/Am; `Tc` ≥ 20 °C; P ≥ 1500 mm |
| **Seed & resin** (cumin, coriander, saffron, sumac, incense) | arid and semi-arid warm climates (BWh/BSh/BSk/Csa, P < 600 mm) |
| **Herb garden** (thyme, oregano, rosemary) | Cs (summer-dry); scrub land cover |
| **Fermented savoury** (soy and fish sauces, ginger) | H.paddy high; monsoon (Cwa/Cfa/Aw) |
| **Pungent roots & seeds** (mustard, horseradish, garlic, caraway, dill) | cool temperate (Cfb/Dfb), H.cool dominant |
| **Salt & smoke** (few spices) | boreal and Arctic: `Tw` < 15 °C or needle-leaf high |

- **Spice-source hotspots** (a rare overlay for the trade map): wet tropical (P ≥ 2500 mm, `Tc` ≥ 22 °C) small islands, volcanic arcs or humid escarpments. Pick the top few per world by a seeded rarity score, so that real spices remain *rare*.

---

## 5. Preservation and salt

### Patterns
- **Sun-drying:** arid and dry-season climates; sun-dried meat, fruit and curd (*qurut*, *kashk*). Grade B, general.
- **Humid tropics → smoking:** the FAO report on bonga (*Ethmalosa*) in West Africa says that in humid southern coastal countries sun-dried fish re-absorbs moisture and goes mouldy. Drying takes 5 days in the wet season versus 3 in the dry. More salt is used in the rainy season because flies are more abundant. Hot smoking dominates.
  - Sources: FAO T3536E https://www.fao.org/4/t3536e/T3536E07.htm ; Ghana fish curing https://csirspace.foodresearchgh.org/bitstream/123456789/1079/1/Fish_Curing_Industry_Ghana_Nerquaye_Tetteh.pdf
- **Cold air-drying (stockfish):** Lofoten cod hangs from February to May, ideally just above 0 °C (0–4 °C) with little rain and constant wind. Frost damages the flesh; warmth brings flies.
  - Sources: https://en.wikipedia.org/wiki/Lofoten_Fishery ; Barents Observer https://barentsobserver.com/en/node/28148 ; PGI document https://assets.publishing.service.gov.uk/media/66585ad87b792ffff71a8549/Torrfisk_fra_Lofoten.pdf
- **Freeze-drying (chuño):** on the Andean altiplano (> 3500–3800 m) in June–July, bitter frost-resistant potatoes are frozen by night and dried by day's sun over about 5 days, and trampled. They keep for years and were Inca famine reserves.
  - Sources: https://en.wikipedia.org/wiki/Chu%C3%B1o ; https://www.potatopro.com/es/node/82330 ; https://doaj.org/article/76a160e4cbce491eb8e2dc8182be89ce
- **Freezing:** Arctic and subarctic stores (Inuit caches, Siberian frozen fish). Grade A/B, general.
- **Fermented fish (Ishige & Ruddle).** Grade B (field survey).
  - Fermented fish products centre on continental Southeast Asia, made from freshwater fish (except Vietnamese *nuoc mam* and coastal shrimp paste).
  - *Narezushi* (fish fermented with rice) "seems to have developed parallel with the rise of irrigated rice cultivation in the Mekong Basin". Ricefield fishing developed alongside.
  - The link is to a strongly seasonal monsoon climate. Northeast Asia shifted to soy ferments. Fish sauce arose independently of Roman garum.
  - Sources: minpaku repository https://minpaku.repo.nii.ac.jp/records/4354 , https://minpaku.repo.nii.ac.jp/records/4315 ; Ruddle & Ishige 2010 (Scribd copy) https://www.scribd.com/doc/266340790/1-2-RUDDLE-ISHIGE ; Springer review https://link.springer.com/10.1186/s42779-021-00109-0
- **Salt geography.**
  - **Solar salt** needs evaporation well above precipitation, with sun, wind and warmth: Mediterranean summers, trade-wind desert coasts, the tropical dry season.
    - In Indonesia output correlates positively with radiation and negatively with humidity, and rain strongly cuts production.
    - Sources: Indonesia study https://ejournal2.undip.ac.id/index.php/ijoce/article/view/14006 ; Algerian chotts https://yadda.icm.edu.pl/baztech/element/bwmeta1.element.baztech-67985f6c-8a72-4bea-8927-a2880da9aa6a/c/193.pdf ; Portugal https://sapientia.ualg.pt/entities/publication/cade6a95-47be-464d-9ad9-c9f5f3c6c93b
  - **Brine springs boiled with fuel** in cool humid lands: Lüneburg salt cured Hanseatic herring; Bay salt from Bourgneuf replaced it from about 1400.
    - Sources: https://en.wikipedia.org/wiki/L%C3%BCneburg ; ORB essay https://the-orb.arlima.net/wales/mtib/mti16c.htm ; https://EN.wikipedia.com/wiki/Baltic_maritime_trade_(c._1400%E2%80%931800)
  - **Deep brine wells:** Zigong in Sichuan, boiled with natural gas piped through bamboo; the Shenhai well reached 1 km in 1835.
    - Source: https://en.wikipedia.org/wiki/Zigong
  - **Desert salt pans (playas):** Taghaza, then Taoudenni, supplied the Sahel. Salt was traded for gold and kola.
    - Sources: https://www.worldhistory.org/article/1342/the-salt-trade-of-ancient-west-africa/ ; https://encyclopedia.com/history/news-wires-white-papers-and-books/trans-saharan-caravan-trade
  - **Salt as money:** Danakil/Afar salt bars (*amole*) were Ethiopia's small currency, worth more the farther they went inland, until about 1930.
    - Sources: National Geographic https://www.nationalgeographic.com/magazine/2012/01/africas-afar-depression ; Reclus https://kwx.liehendr.com/content/wikisource_en_all_maxi_2022-09/A/Page%3AAfrica_by_%C3%89lis%C3%A9e_Reclus%2C_Volume_1.djvu/223 ; https://visura.co/marin/stories/salt-of-the-earth
  - Overview: https://en.wikipedia.org/wiki/History_of_salt
  - Plant-ash salt in humid interiors (Central Africa, New Guinea): no source fetched, grade C.

### Proposed map mode "Preserving" (the main method)
Each score is multiplied by the food available to preserve (fish, herd, crops).

| Category | Rule | Grade |
|---|---|---|
| **Frozen stores** | ≥ 5 months with Tm ≤ −5 °C | A |
| **Freeze-dried** (chuño-type) | tropical highland: |lat| < 25°, elev ≥ 3300 m, dry-season months with Pm < 20 mm and Tm 0–8 °C (frosty nights under clear skies); H.roots present | A/B |
| **Wind-dried fish** | coast, fish high, ≥ 2 consecutive months with Tm −1…+5 °C and Pm < 80 mm | B |
| **Sun-dried** | ≥ 3 consecutive months with Tm ≥ 18 °C and Pm < 30 mm (or P < 400 mm) | B |
| **Salted** | salt access high: rockSalt nearby, OR a solar-salt coast (≥ 3 consecutive months with Tm ≥ 20 °C and Pm < 30 mm, coastKm ≈ 0), OR a desert playa (closed basin, P < 200 mm); plus fish or herd | B |
| **Smoked** | humid (no month with Pm < 40 mm, or P ≥ 1200 mm) and tree ≥ 0.3; plus fish or meat | B |
| **Fermented fish** | H.paddy high; river or lake fish; monsoon seasonality (≥ 3 dry months); a salt source within trade reach | B |
| **Pickled / fermented vegetables** | 3–5 months with Tm < 0 °C but not Arctic; H.cool or vegetables (kimchi, sauerkraut) | C |

**Salt-source sub-map** (also feeds trade goods): `saltSupply = max(rockSalt, solarSaltCoast, playa, brineSpring)`. `saltScarcity` = distance in km to the nearest supply, weighted by humidity, since humid interiors lack evaporite. High scarcity marks a salt-importing region, and those make good stories.

---

## 6. Dairy and lactase persistence

- **Holden & Mace 1997** (*Human Biology* 69:605–628).
  - A phylogenetic comparative test across 62 cultures.
  - It supports adult lactose digestion as an adaptation to dairying.
  - It does **not** support extra selection at high latitudes (calcium/vitamin D) or in arid environments (water).
  - Milking evolved *before* lactase persistence.
  - The raw geography fits all three hypotheses, because they are confounded by shared ancestry.
  - Sources: https://discovery.ucl.ac.uk/id/eprint/72952/ ; https://hraf.yale.edu/hypotheses/3249
- **Itan et al. 2010** (*BMC Evolutionary Biology* 10:36). An interpolated Old World map of phenotype and genotype frequencies. Lactase-persistence frequencies include:
  - Ireland about 96 %, Finland 83 %, Hungary 59 %, Sardinia 15 % vs central Italy 82 %.
  - Saudi Bedouin 81 %, Jordan 76 %, Beni Amer (Sudan) 88 %, northern India about 55 %.
  - Wolof 51 %, Yoruba 17 %, Ugandan Bantu 6 %, Kazakh (China) 24 %, Japan 28 %.
  - Pastoralists stand out: the Bedouin are high and non-pastoral Arabs lower. Another summary cites up to 92 % in pastoralists versus about 0 % in non-pastoralists.
  - Sources: https://pmc.ncbi.nlm.nih.gov/articles/PMC2834688/ ; https://discovery.ucl.ac.uk/id/eprint/19627/
- **Evershed et al. 2022** (*Nature* 608:336–345).
  - About 7000 pottery fat residues from more than 550 sites show that milk was used widely in Europe from the Neolithic.
  - But lactase-persistence selection is explained better by famine and pathogen proxies than by how much milk was used.
  - In the UK Biobank, genotype is only weakly linked to milk intake.
  - Sources: https://www.sciencedaily.com/releases/2022/07/220727110700.htm ; https://phys.org/news/2022-07-famine-disease-drove-evolution-lactose.pdf ; https://discovery-pp.ucl.ac.uk/id/eprint/10155389
- **Simoons.** Mapped the traditional non-milking areas: East and Southeast Asia (most of China, Southeast Asia, Oceania) and the Americas. West and Central Africa are also non-milking, owing to tsetse.
  - Simoons 1970, "The traditional limits of milking and milk use in Southern Asia", *Anthropos* 65.
  - Sources: https://indianmedicine.eldoc.ub.rug.nl/9339/ ; https://indianmedicine.eldoc.ub.rug.nl/9343/
- **Tsetse.** It infests about 40 % of tropical Africa (9.5 million km², 37 countries).
  - Alsan 2015 (*AER* 105:382–410) built a tsetse suitability index from temperature and humidity.
  - Ethnic groups in tsetse-suitable areas were less likely to use domesticated animals and the plough, less centralised, and less dense. No such pattern appears in tropics outside Africa.
  - Sources: https://econpapers.repec.org/RePEc:aea:aecrev:v:105:y:2015:i:1:p:382-410 ; https://fsi.stanford.edu/node/19125 ; https://www.openicpsr.org/openicpsr/project/112921 ; the tsetse area figure https://scielo.org.za/pdf/ojvr/v75n1/10.pdf
- **Dairy form vs climate.** Hot climates → fresh acid curds and brined cheeses (çökelek, feta-like), yogurt and ghee. Cool, semi-humid → long-matured hard cheese (Dolomites study: "the cold and semi-humid climate appears to be the biggest factor"). Kindstedt, *Cheese and Culture* (2012). Grade B/C.
  - Sources: https://obihiro.repo.nii.ac.jp/record/4363/files/67_1.pdf ; https://www.sevendaysvt.com/food-drink/cultured-read-2183974/

### Proposed map mode "Dairy" (the main milk animal and the product)
- **Gate:** dairy is possible only if herd ≥ ~0.1 and the disease (tsetse-like) score is low.
  - `tsetse = ramp(Tc, 16, 20) × ramp(P, 700, 1000) × tree-moderate-to-high`. This is a hot, humid, wooded savanna-forest; grade B as a proxy for Alsan's index.
- **Categories:**

| Category | Rule |
|---|---|
| **No dairy** | gate fails; or paddy-dominant humid monsoon with little pasture (the East/SE Asian pattern, grade C as environmental); or foragers |
| **Reindeer** | ET/Dfc, needle-leaf or tundra |
| **Yak** | elev ≥ 3000 m and `Tw` ≤ 12 °C, treeless |
| **Mare** | steppe, `Tc` ≤ −8 °C, P 200–500 mm |
| **Camel** | `Tw` ≥ 30 °C, P < 250 mm |
| **Sheep & goat** | Cs or BSk uplands, slopes |
| **Water buffalo** | humid lowland with rivers or paddy, `Tc` ≥ 12 °C |
| **Cattle** | everything else with good pasture |

- **Product overlay:**
  - "Cheese & butter": `Tw` ≤ 22 °C and humid.
  - "Yogurt & brined cheese": Cs/BSk.
  - "Ghee & curds": hot.
  - "Fermented milk": steppe/desert nomads.
- **"Fresh-milk drinkers" (the lactase map), drawn as a gradient:** high where dairy is *fresh-drunk*. That means cool pasture (N Europe type) and nomadic pastoralists of desert and savanna. It is moderate where milk is mostly fermented or processed (Mediterranean, Mongolian steppe, India) and near zero where there is no dairy. Grade A for dairying → lactase persistence; latitude on its own is NOT supported.

---

## 7. Calendar, hunger and society

### Hungry season
- **Vaitla, Devereux & Hauenstein Swan 2009** (*PLoS Medicine* 6:e1000101).
  - The hunger season is the pre-harvest period, "when the previous year's harvest stocks have dwindled, food prices are high, and jobs are scarce".
  - Many of the roughly 600 million affected "live in areas where water or temperature constraints allow only one crop harvest per year".
  - It "is also often the rainy season", when malaria and diarrhoea peak and farm labour demand is highest.
  - Sources: https://pmc.ncbi.nlm.nih.gov/articles/PMC2696035/ ; https://concernusa.org/news/what-is-the-hunger-season/
- **Temperate "hungry gap":** April–June in Britain, between the bolting of overwintered brassicas and the first broad beans. Bridged with stored potatoes, cabbage, preserves and wild greens.
  - Source: https://en.wikipedia.org/wiki/Hungry_gap
- **Root crops buffer the hunger season.** Cassava can be harvested 8–24 months after planting, or left in the ground as a reserve; it is hard to steal or destroy.
  - Sources: FAO "Cassava's comeback" https://www.fao.org/newsroom/detail/Cassava-s-comeback/en ; FAO T0207E https://www.fao.org/3/T0207E/T0207E01.htm
- **Pastoral lean season:** the late dry season, when milk yields fall. Grade B, general.

### Harvest festivals timed by the main harvest
Grade B as description: they cluster at the end of the local main harvest, not at a fixed season.
- New Yam (Iri ji, Igbo): August–September, the start of the yam harvest.
- Thai Pongal (Tamil Nadu): about 14 January, after the rice harvest that follows the northeast monsoon.
- Chuseok (Korea): the 15th of the 8th lunar month (September–October), rice.
- Sukkot: the autumn ingathering of fruit, olives and grapes. The Levant also has an early-summer wheat festival (Shavuot), a two-harvest Mediterranean pattern.
- Northern Europe and Canada: September–October.
- Sources: https://en.wikipedia.org/wiki/Harvest_festival ; https://Www.wikipedia.org/wiki/List_of_Harvest_Festivals ; https://www.Britannica.Com/list/5-harvest-festivals-around-the-world

### Proposed map mode "Harvest calendar"
- **Main harvest month (cyclic colours).** The month when the dominant crop group finishes. Use the last month of the growing season for that crop group. Summer-dry (Cs) cool grains are harvested in late spring to early summer. Monsoon paddy is harvested about 1–2 months after the rains end.
  - Two growing seasons in a year (bimodal rain) give two harvests; show the main one with a second-harvest tick.
  - Root-dominant aseasonal tropics show "any time" (a neutral colour).
- **Hungry months.**
  - Length = months from about 2–3 months before the main harvest up to it, scaled by:
    - (a) a single harvest per year (×1.0) vs two (×0.5);
    - (b) reliance on stored grain (cereal share) vs roots (×0.3 for H.roots);
    - (c) dry-season length, i.e. how long stores must last;
    - (d) buffers (fish, herding, wild foods) that cut it.
  - Grade A (single harvest + rainy pre-harvest) / B (scaling).
  - Temperate: the late-winter/spring gap.
  - Herders: the late dry season.
- **Festival:** the main harvest month, named by the main crop ("rice-harvest festival", "new-yam feast", "grape ingathering").

### Society: optional "worldbuilding hints", each with a caveat label
- **Talhelm et al. 2014** (*Science* 344:603): rice regions are more collectivist and holistic than wheat regions in China, with the effect visible across the rice–wheat border.
  - Critiques: Ruan, Xie & Zhang 2015 (*Food Policy* 56:51–58) say most findings no longer hold after fixing sample bias and model specification.
  - The Frontiers 2015 commentary flags non-independence of provinces.
  - Talhelm & Dong 2024 (*Nature Communications*): farmers assigned quasi-randomly to rice vs wheat show the predicted differences.
  - Grade C (contested but alive).
  - Sources: https://ideas.repec.org/a/eee/jfpoli/v56y2015icp51-58.html ; https://www.frontiersin.org/articles/10.3389/fpsyg.2015.00950/full ; https://www.nature.com/articles/s41467-024-44770-w.pdf ; https://www.wwno.org/2018-04-30/so-a-rice-grower-and-a-wheat-grower-walk-into-a-coffee-shop
- **Mayshar, Moav & Pascali 2022** (*JPE* 130:1091–1144). Cereals (storable, visible, harvested at once, hence taxable) cause hierarchy and states. Land productivity does not. Roots and tubers (perishable, about 70 % water, harvested on demand) do not. The Columbian Exchange is used as a natural experiment. Grade B.
  - Sources: https://warwick.ac.uk/fac/soc/economics/staff/omoav/mayshar_et_al_jpe_2nd_11_oct_2019.pdf ; https://warwick.ac.uk/news/pressreleases/study_sheds_new ; https://hraf.yale.edu/documents/1392
- **Scott, *Against the Grain* (2017).** Early states were built on legible, taxable grain. Cassava and other perennials were "fiscally sterile" and are associated with people escaping the state. This is an argument, not a test; critics say it applies only to the earliest states. Grade C.
  - Sources: https://foodanthro.com/2019/02/27/review-against-the-grain/ ; https://ajaonline.org/?p=4881
- **Harris, "The Abominable Pig" (*Good to Eat*, 1985).** Pigs need shade, water and mud, so they compete with people for grain in arid, deforested lands, and the religious taboo reinforced that practical strategy.
  - Critiques: ecological determinism; neglect of the early Egyptian history of the taboo; Douglas's symbolic reading in *Purity and Danger*.
  - Grade C for the taboo. Grade B for "pigs fit forested, humid, settled farming", which is what the lard rule uses.
  - Sources: https://hekint.org/2025/04/24/cultural-taboos-marvin-harris-and-the-abominable-pig/ ; https://warwick.ac.uk/fac/arts/history/students/modules/hi2a7/programme/t2w04/
- **Alsan 2015 (tsetse):** see §6. Grade B.
- **Suggested derived hint:** "Taxable grain" vs "garden roots" (cereal share vs H.roots) as a soft "how state-prone" shade. Label it as a theory, not a fact.

---

## 8. Classic food-culture maps, and why they read well

- **Europe's fat belts (olive / butter / lard) and drink belts (wine / beer / vodka).** Two or three bands stacked south to north. They follow obvious climate gradients (summer drought, winter cold) and reinforce each other: olive and wine together, butter and beer together. Viewers "get it" instantly, and the exceptions tell stories: Rouen's Butter Tower, Iberian lard, Hungarian wine.
  - Sources: https://bigthink.com/strange-maps/442-distilled-geography-europes-alcohol-belts/ ; https://www.datawrapper.de/blog/europe-map-alcohol-consumption
- **The Qinling–Huai line.** It approximates the 800 mm isohyet and the 0 °C January isotherm: rice to the south, wheat and millet to the north. In food terms that is rice vs noodles and steamed buns, and in Talhelm's theory collectivist vs individualist. One physical line that splits climate, crop, food and (arguably) psychology is very legible.
  - Source: https://en.wikipedia.org/wiki/Qinling%E2%80%93Huaihe_Line
- **The tsetse belt.** No cattle, horses or plough south of the line. Cavalry states lived in the savanna north of it. The line follows a humidity/temperature gradient.
- **Simoons's milking and non-milking map of Asia.** A sharp cultural edge (no dairy in East and Southeast Asia) beside dairying Central and South Asia.
- **The trans-Saharan exchange (salt north, gold and kola south).** It shows *ecological complementarity*: neighbouring zones that each lack what the other has.
- **(bonus) "Tea vs cha".** The word for tea follows overland (cha) vs maritime (te) trade routes: a trade-route map that reads well (well-known map; no source fetched).

**Why these read well (design notes for Orogen):**
1. Few categories (3–6) with strong colour contrast.
2. Boundaries that coincide with a physical line the user can see on the planet (isotherm, isohyet, mountain range, desert edge).
3. Banded, coherent regions rather than speckle: apply the score smoothing in km, as in the Köppen view.
4. Paired maps that reinforce each other (fat and drink).
5. Exceptions that hint at stories (islands of wine in beer land, at slopes or microclimates).
6. Iconic names ("olive line", "butter belt") the user can repeat.

---

## 9. Trade goods: proposed map mode
**Rule:** each region's *signature export* is the good with the highest local suitability × global rarity.
- `rarity = 1 − (fraction of the world's land area (or of land within R km, with R ≈ 1500–3000 km) where that good scores > 0.5)`.
- Trade happens across ecological contrasts (salt and kola in the Sahel). So the export score is boosted when the neighbouring zone, within about 500–1000 km, lacks the good.

Candidate goods and their source rules:
- **Salt:** rockSalt, solar coasts, playas (§5). Highest value where scarcity around it is high.
- **Spices:** the hotspots in §4.
- **Incense / resins:** arid escarpments leeward of monsoon (BWh/BSh, slopes, `Tw` ≥ 28 °C, near a wetter monsoon zone).
- **Wine and olive oil:** the §1/§2 scores.
- **Dates:** §3.
- **Sugar:** §3.
- **Tea, coffee, cacao, kola:** §2.
- **Furs:** needle-leaf high, `Tc` ≤ −10 °C.
- **Honey and wax:** forest beekeeping belt.
- **Dried or salted fish:** cold productive shelf seas or upwelling plus a salt supply or cold air-drying (§5).
- **Fish grease:** cold upwelling coast plus an inland market.
- **Horses:** cold steppe.
- **Wool:** semi-arid and highland sheep.
- **Cheese and butter:** cool humid pasture.
- **Grain surplus:** large flat alluvial plains with rivers and high H.cool or H.paddy yields.
- **Timber:** forest with river or coast access.

Evidence grade B for complementarity, from Lovejoy's kola, salt and gold. The scoring itself is a design choice.

---

## Open gaps (not verified in this pass)
- No primary source fetched for:
  - sorghum/millet beer geography;
  - plant-ash salt;
  - birch sap geography;
  - "tea vs cha";
  - Achaya's Indian oil geography (cited from memory of the book; the IMSc note partly supports it);
  - mustard/rapeseed regions in pre-modern China.
- Alsan's tsetse index formula (temperature/humidity) was not retrieved; it is in the replication files at https://www.openicpsr.org/openicpsr/project/112921 .
- The olive frost thresholds are tree/organ temperatures (absolute minima). The translation to coldest-month mean (`Tc` ≈ 3 °C) is my estimate from Mediterranean station climatology: Tc − absolute minimum ≈ 8–12 °C in maritime climates.
