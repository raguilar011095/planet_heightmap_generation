// Every tunable of the Farming tab (plans/V2_FARMING_PLAN.md), in physical units — °C, mm, km, m³/s, m per km — so it
// reads the same at every detail. Each factor is a smooth ramp [from, to] (0 at the first, 1 at the second; either way
// round). PRIORS: each value's range in the literature (or the range that still looks right), as the climate's.

export const FARMING = {
    // ── the growing season (FAO's length of growing period, by month): warm enough and wet enough ──
    warmC: [5, 15],             // a month grows crops from this mean °C (wheat's and barley's minimum) to fully at this
    wetShare: [0.25, 0.6],      // …and is wet enough as its rain, melt and the soil's water pass about half its potential
                                // evaporation (FAO: P > 0.5 PET — the finish's straight-line PET runs high in spring and
                                // autumn, so a little under), fading in over this (Earth: Ukraine ~4 months, the Nile 0)
    soilMm: 100,                // the water the soil holds into a dry spell (FAO's 100 mm)
    seasonMonths: [1.5, 5],     // a crop needs a season this long (months, growing fully) — up to full yield…
    doubleMonths: [6, 11],      // …and a season this long grows a second crop: a bonus
    doubleBonus: 0.15,          // …of this share of the yield

    // ── the soil: what it formed from (its parent material) × what the climate made of it ──
    // (parent material, 0…1: river silt and loess deep and fertile; young volcanic ash and basalt rich in nutrients;
    // limestone and shale clayey and good; till middling; quartz sand, granite and gneiss acid and poor; serpentine toxic)
    parent: { plain: 1, loess: 0.95, till: 0.6, erg: 0.05, sandstone: 0.35, shale: 0.65, limestone: 0.7, salt: 0.03, basalt: 0.85,
        volcanic: 0.9, granite: 0.3, slate: 0.45, gneiss: 0.35, shield: 0.3, greenstone: 0.55, ophiolite: 0.15, unknown: 0.5 },
    soilRegionKm: 100,          // the bedrock's soils read over this (a regional soil map's), the young sediment's crisp…
    soilLocal: 0.3,             // …each place's own rock this much of it
    // black earth (chernozem, mollisols): deep humus under the temperate grasslands and forest-steppe — the subhumid
    // continental climates (the steppes, the prairies, the Pampas, Manchuria), by climate rather than by the cover's grass
    // (which puts forest on the humid prairies: their grass is fire's and grazing's): the year's rain ÷ potential
    // evaporation from this (a deep sod)…
    blackWet: [0.3, 0.55],
    blackWetMax: [1.35, 0.9],   // …to this (wetter: forest soils, leached)…
    blackWarmest: [15, 21],     // …with summers this warm (°C, the warmest month: the tundra's grass makes none)…
    blackColdest: [15, 5],      // …and winters this cool (the coldest month: the savanna's grass makes none)…
    blackBonus: 0.3,            // …up to this much richer
    leachWet: [0.6, 1.3],       // leaching (laterite, oxisols): where the year is this wet (rain ÷ the finish's potential
                                // evaporation: the rainforests' 1–1.5)…
    leachWarm: [14, 22],        // …and this warm (°C, the year's mean) — the nutrients washed out of old ground…
    leachLoss: 0.6,             // …up to this share of its fertility…
    leachRenew: { plain: 0.85, volcanic: 0.8, basalt: 0.6, young: 0.5 },   // …less where the ground is renewed: by floods, ash,
                                // a young basalt, a rising range (its share of the loss spared)
    podzolNeedle: [0.25, 0.7],  // podzol: acid ground under boreal conifers — by their share of the cover…
    podzolColdest: [0, -8],     // …where winters are this cold (°C)…
    podzolWarmest: [21, 17],    // …and summers this cool (the warmest month: Manchuria's hot summers make black earth)…
    podzolLoss: 0.4,            // …up to this share of its fertility

    // ── the ground ──
    slopeKm: 12,                // slope read over about this distance (km): a field's hillside, as far as the mesh shows it…
    slopeFullKm: 30,            // …cells coarser than this see slopes gentler: raised by (their size ÷ it)^0.7 (the same
                                // ground's gradient at 160K as at 640K and 2.5M)
    slopeLoss: [8, 40],         // the plough's slopes: losing from this gradient (m per km, over the mesh's ~15–30 km — a
                                // finished range's flanks run 20–50) to nearly all at this…
    terraceLoss: [30, 90],      // …with terraces, from this to this (steeper still: too steep even for terraces)
    slopeMaxLoss: 0.92,
    wetlandFlat: [6, 2],        // waterlogged: ground this flat (m per km)…
    wetlandWet: [1.2, 2.2],     // …where the year is this wet (rain ÷ potential evaporation)…
    wetlandLoss: 0.6,           // …loses up to this (drained by raised fields)

    // ── water brought ──
    floodQ: [100, 400],         // flood farming: on the plain of a river this big (m³/s) and more…
    floodKm: [3, 12, 40],       // …the plain's half-width: this at the second discharge (× (q / it)^0.4), between the first
                                // and the last (km) — the Nile's valley is 10–20 km wide…
    floodHandKm: [0.01, 0.03],  // …on ground no higher above the river than this (fading by the second)
    canalQ: [5, 100],           // canals: from rivers this big (m³/s) and more…
    canalKm: [2, 10, 60],       // …reaching this far at the second discharge (× (q / it)^0.4), between the first and the last (km)…
    canalHandKm: [0.04, 0.12],  // …onto ground no higher above the river than this (a canal is led off upstream)
    lakeKm: 6,                  // fresh lakes' shores watered this far

    // ── the crops (C2): what grows best here, not where each was first grown (that is culture's: not modelled yet) — and
    // how many harvests a year. Each crop kind grows each month as it is warm past its `base` (linearly to its `opt`imum:
    // growing degree-days — wheat and barley from ~0 °C, rice, maize and sorghum from 10 °C), not too `hot` (fading from,
    // gone at), and `wet` enough (its rain, melt and the soil's water ÷ potential evaporation); it ripens after `cycle`
    // months of that growth at its best (a run broken by a dry or a cold month is lost — winter grains only sleep through
    // the cold: `dormant`). `weight`: how many a harvest feeds; `soil`: how much it asks of the soil (its food × (1 − soil +
    // soil × fertility) — tubers little); `level`: rice's fields must be level (its ground factor to this power). A crop
    // group's kinds: the best of them (× its `share`). Ranges: FAO ECOCROP; Madeline James's Part 4 state-building grains ──
    crops: {
        // paddy rice: hot and wet — the monsoon's; standing water (rain past what evaporates); ~3.8 months of warmth (100–
        // 120 days); two or three crops a year where it is warm and wet the year round. Feeds the most people a hectare —
        // on rich ground: its old heartlands are river plains and volcanic soils (on leached ground, tubers do better)
        // (from 12 °C, best by 26: cool summers chill its flowers sterile — the Midwest grows none, the Po and Kyushu do)
        rice: { weight: 1.4, soil: 1, level: 1.5, kinds: [{ base: 12, opt: 26, hot: [35, 40], wet: [0.8, 1.4], cycle: 3.8, paddy: true, share: 1 }] },
        // wheat and barley: the cool season's grains — an autumn-sown crop sleeping through the winter (the Mediterranean's
        // winter rain, a temperate or continental winter), or a spring one; tropical highlands; heat ends them (over ~21–27
        // °C a month: the wet tropics none). ~4 months' growth at its best (~2000 degree-days from 0 °C)
        wheat: { weight: 0.9, soil: 0.65, level: 1, kinds: [{ base: 0, opt: 16, hot: [19, 25], wet: [0.15, 0.5], soggy: [200, 400], cycle: 4, dormant: true, max: 1, share: 1 }] },
        // the warm season's grains, on summer rain: maize where it is wet enough for long enough (~1500 degree-days from
        // 10 °C); millet and sorghum, quick (~80–100 days) and drought-hardy, in the hot dry country (the Sahel's)
        maize: { weight: 1, soil: 0.65, level: 1, kinds: [{ base: 10, opt: 24, hot: [34, 40], wet: [0.35, 0.8], soggy: [120, 260], cycle: 3.8, share: 1 },
            { base: 12, opt: 28, hot: [38, 44], wet: [0.15, 0.45], soggy: [50, 150], cycle: 2.8, share: 0.75 }] },
        // roots and tubers: yams, cassava, taro and sweet potatoes in the wet tropics (a long season; poor soil will do),
        // potatoes in cool highlands and short summers (where a grain does as well, the grain: it keeps and feeds more)
        roots: { weight: 0.85, soil: 0.25, level: 1, kinds: [{ base: 12, opt: 25, hot: [36, 40], wet: [0.3, 0.7], soggy: [150, 300], cycle: 6, share: 1 },
            { base: 5, opt: 16, hot: [21, 26], wet: [0.3, 0.7], soggy: [100, 220], cycle: 3.2, max: 1, share: 0.8 }] },
    },
    // ── harvests: a staircase, not a line — a crop gives nothing until it ripens; a second needs a second whole cycle ──
    // (each dry-land crop's `soggy`: it drowns as a month's water beyond what it evaporates passes this (mm) — fading from the
    // first: a monsoon's deluge, waterlogged fields — millet and sorghum soonest, dry country's grains)
    harvestBreak: 0.15,         // a month growing less than this ends a crop's run (a dry or cold gap: what was sown dies)…
    dormantKillC: -15,          // …but winter grains sleep through cold months above this (°C, the month's mean; and not dry)
    harvestTurn: 0.75,          // months between one harvest and the next crop's start (reaping, threshing, ploughing, sowing)
    harvestRamp: 0.35,          // a crop cut short by up to this share of its cycle still yields (eased: less)
    maxHarvests: 3,             // at most this many of one crop a year (rice in Java and Bengal: three)
    relayAt: 0.15,              // a second crop of another group takes the months the first grows less than this in (rice
                                // then winter wheat on the Yangtze; winter wheat then summer millet on the Nile)
    multiSoil: [0.45, 0.9],     // harvests past the first count as the soil can feed them, from this fertility to this: two or
                                // three crops a year off renewed ground (a flood's silt, volcanic ash), one off leached
    // ── farmland: the food a place grows (harvests × what it feeds × soil × ground; a good grain harvest on good flat
    // ground ≈ 0.8), on a soft scale v / (v + farmHalf) ──
    farmHalf: 0.67,
    classesV: [0.12, 0.35, 0.65, 1.25],  // poor · fair · good · excellent from this food (good: one sure harvest on decent soil;
                                         // excellent: more than one good harvest a year — the Nile, the Yangtze, Bengal, Java)
    seasonRisk: 0.2,            // rain-fed harvests lost to failed rains, at most this share more…
    riskSeason: [0.5, 1],       // …where the year's rain comes in a few months (seasonality, Walsh & Lawler: the Mediterranean
                                // ~0.8, a monsoon margin past 1)…
    riskWet: [1, 0.5],          // …and the year is not so wet that a short rain still suffices (rain ÷ potential
                                // evaporation: fading in from the first) — the drier and more seasonal, the more the
                                // rains vary from year to year
    waterSupplyMm: 60,          // water brought by canal or flood: about this much a month (an ancient canal's share, or a
                                // flood's soaking held in the ground) — enough for a cool season's grain in a desert, not
                                // for its summer heat's thirst (Egypt and Mesopotamia grew wheat and barley in winter) nor a
                                // paddy's standing water
    rainReliable: [0.12, 0.3],  // rain-fed crops count fully only where the year is this wet (rain ÷ potential evaporation)
                                // or more: drier, the rains fail too often — the arid lands are the herders' (the Horn's,
                                // Arabia's), the semi-arid the farmers' and herders' both (water brought does not fail)
    herdGrass: [0.08, 0.35],    // herding: where grass and shrub grow (the cover's vegetation)…
    herdWet: [0.03, 0.3],       // …as much as the year's rain grows (÷ potential evaporation: the desert's edge little,
                                // the steppe's grass much)…
    herdTrees: 0.7,             // …less under forest (by the trees' share)…
    herdWeight: 0.5,            // …feeding fewer than a crop (so a crop wins where one grows at all well)…
    herdWatered: 0.8,           // …and not where water is brought: the watered strip is farmed (this share of it)
    stapleMin: 0.06,            // nothing grown where the best does less than this
};

export const PRIORS = {
    warmC: [[3, 7], [12, 18]],
    soilMm: [60, 150],
    seasonMonths: [[1, 2.5], [4, 6]],
    canalKm: [[1, 3], [5, 15], [30, 80]],
    floodKm: [[2, 5], [8, 20], [25, 60]],
};
