// Tunable constants of the Finish step (plans/V2_FINISH_PLAN.md): the expensive, on-request sculpting of one moment.
// Everything in km, Myr, °C and mm — never in cells — so a moment finished at 160K and at 10M is the same planet, the
// finer one showing more of it.

export const FINISH = {
    // ── F1: warp and detail ──
    warpKm: 14,                 // the whole surface domain-warped by up to about this (breaks the last of the sim's lines)…
    warpScaleKm: 150,           // …in waves about this long, and half and a quarter of it
    craggyKm: 0.05,             // fine relief on high, steep ground (none on the plains), ± this at 3 km up…
    craggyFromKm: 40,           // …from this wavelength down to what the mesh can show

    // ── the rivers: the carve run longer, with the climate's runoff ──
    carveTimeMyr: 1.0,          // (the timeline's 0.75; 1.2 cut trunk canyons too deep beside uncut ground — developer)
    carveRounds: [3, 2, 2, 2, 1],
    // runoff = rain − evaporation (Budyko's curve in Fu's form, ω), potential evaporation from the annual temperature
    petBaseMm: 300,             // potential evaporation at 0 °C…
    petPerC: 55,                // …plus this per °C (~1700 mm at 25 °C)
    petMinMm: 60,
    budykoW: 2.6,
    rainMaxMm: 6000,            // the climate's rain, for the finish's erosion, at most this (its grid has rare hotspots of
                                // 10 000–70 000 mm a year: ~0.2 % of land — Earth's wettest places get ~12 000)
    runoffFloor: 0.1,           // a desert's rivers still count this share of the mean (old wetter climates cut the wadis)…
    rainShare: 0.3,             // …and the drainage is weighted this much by the rain itself, the rest by the runoff (developer:
                                // "even deserts should get rivery erosion (even a little) cuz it gets some rain")
    wetPower: 0.5,              // the drainage's weight grows as this power of the (relative) water, at most wetMax times the
    wetMax: 2.5,                // mean: linear, the wettest regions carried ~10× the mean — valleys and grading far beyond the
                                // live terrain's, the land there "unnaturally blurry" (developer)
    // rivers wander: a fine relief the rivers are routed over (not the heights), from this wavelength down to what the mesh
    // shows, this high — so channels meander and bend instead of running straight down smooth slopes
    meanderKm: 0.03,
    meanderFromKm: 60,
    // dissection everywhere (developer: cutting "isolated … some mountains look blurry and not cut in"): every drainage
    // line cut in by a share of how steep the ground is — mountains dissected all over down to the mesh's own valleys,
    // plains calm; the ridges between them (the cells nothing drains into) kept. Its deepest cut, on steep ground: the
    // erosion strength's dissectKm (below)…
    dissectSlope: [0.02, 0.25], // …by the ground's steepness (km per km)…
    dissectKm2: [300, 8000],    // …and by the area draining there (km²: a ridge … a valley; 1.5 and 40 cells at 2.5M — in cells
                                // until 2026-10-15, so finer detail cut finer, shallower valleys)

    // ── how strongly the finish erodes the mountains (developer, 2026-10-15: "strengthen the erosion in a final detail pass,
    // particularly the fancy generated erosion we adapted from the paper, but not too much … break up SOME of the
    // monotony of the ridges"): 0 as it was … 3. The stream power (carve.js; Tzathas et al. 2024: erosion a wave climbing
    // each river at k·A^m) reaches further up the headwaters — m lower, k raised so a river draining erosionPivotKm2 cuts as
    // before; the dissection cuts deeper; soil creep rounds less; and the fold belts' crests stand harder, so the valleys
    // deepen between them rather than the ridges wearing away. The timeline's terrain is untouched
    erosionStrength: 3,
    erosionPivotKm2: 1e5,
    // (2026-10-26, plans/V2_FINE_DETAIL_PLAN.md: the developer — "not seeing the carving we see on the Alps, or the leading
    // edge of the Himalayas"; measured against the real Alps and Nepal at the same detail, the rising, wet fronts reached
    // ~¾ of the Himalayan front's depth)
    activeHold: 0.12,           // a rising belt's rivers cut this much less where it is wet and steep (the timeline's
                                // carveActiveHold: 0.3 — kept on flat ground: a plateau's top stays whole)…
    frontSlope: [0.004, 0.018],   // …steep: the surface's slope, km per km (from none … to all)
    valleySides: 0.5,           // a valley wider than its cell lowers the cells beside it this much toward its floor (a V
                                // across, not a slit: Earth's big valleys at 10M have ~45 % of their depth by the first
                                // ring of cells, ours had 59 %)
    creepChannelKm2: [30, 300], // soil creep only lowers where a river drains this much (km²: from none … to all) — the
                                // valleys keep their floors (creep had taken ~10 % of the wet sides' relief)
    erosionLevels: {            // at strength 0, 1, 2, 3 (between them, linear)
        carveM: [0.4, 0.35, 0.3, 0.25],
        dissectKm: [0.35, 0.45, 0.55, 0.65],
        creepKm: [10, 8.5, 7, 5.5],
        crestHardness: [0.5, 0.55, 0.6, 0.65],
    },

    // ── F2: closed basins — a basin whose inflow cannot make up what its lake would lose to evaporation stays closed:
    // a flat salt pan or playa at the level where the two balance, the rivers of its catchment ending there ──
    basinMinKm2: 3000,          // (smaller hollows are left to the rivers)
    // ── F2: sediment — what the rivers cut, carried down and laid where they slow: fans at the mountain front,
    // floodplains, deltas at the sea ──
    sedimentShare: 0.35,        // the share of the eroded rock that travels as bedload (the rest is fine and reaches the sea)
    capacityK: 15,              // bedload a reach can carry: capacityK · drainage (km²) · slope — a river carries what it cut
                                // down its mountain slopes and drops it where it slows (below a slope of ~0.002)
    fanSpreadKm: 20,            // deposits spread over about this (fans and aprons, not ridges along the channel)
    deltaShare: 0.03,           // the share of a river's load built into a delta above the sea (the rest on the shelf)
    deltaTopKm: 0.004,          // a delta plain stands this high
    deltaMaxDepthKm: 0.15,      // …and grows only over the shelf
    // ── F2: hillslopes by climate — soil creep rounds the hills where it is wet and warm; deserts and cold ground stay
    // sharp ──
    // (its rounding, σ at full wetness: the erosion strength's creepKm, above)
    creepRainMm: [300, 1200],   // wetness from the annual rain…
    creepTempC: [-5, 10],       // …and the annual temperature

    // ── F3: the last ice age, Earth-like ──
    iceColdEqC: 3.5,            // colder than now at the equator…
    iceColdPoleC: 16,           // …and at the poles (polar amplification: ~ (|lat|/90)^1.5 between)
    iceDrier: 0.3,              // precipitation lower by up to this share toward the poles
    iceSeaDropKm: 0.12,         // the sea ~120 m lower: shelves bare, ice grounded on them
    iceGroundedKm: 0.4,         // ice grounded on the sea floor down to this depth where it spread from land
    iceMarginC: [2, 6],         // ice flows past its snowline into summers this much warmer: a glacier's tongue … an ice sheet's lobe
    iceSheetKm2: [3e4, 1e6],    // (by how big the snowfield it flows from is)
    iceNyeKm: 0.015,            // ice thickness √(iceNyeKm · distance to the margin), km (a plastic ice sheet: ~3.9 km at 1000 km)
    iceMaxKm: 4.5,
    troughKm: 0.6,              // deepest trough a glacier cuts (at the largest ice flux; 1.1 was too deep — developer)…
    troughFluxKm2: [2e3, 2e5],  // …from its snowfield's area
    troughWidthKm: [3, 14],     // a trough's half-width, small glacier → ice stream
    // the ice cuts where it slides fast: outlet glaciers and ice streams near its margins, down the land's own valleys (it
    // is steered by the bed) — not across the frozen interior of a sheet along its dome's straight flow lines
    iceCutsWithinKm: [250, 40], // (full within the second of the margin, none beyond the first)
    iceSteer: 0.06,             // the ice routed over the bed plus this share of its thickness (its surface's pull)
    scourKm: 0.07,              // an ice sheet scours hollows this deep in its bed (lake districts on shields)…
    scourScaleKm: 45,           // …about this far apart
    moraineKm: 0.06,            // end moraines at the ice's farthest reach, and outwash plains beyond
    reboundLeft: 0.08,          // of the ice's weight (ρi/ρm × thickness), this share not yet rebounded (Hudson Bay, the Baltic;
                                // 0.2 sank basins that held vast lakes)…
    reboundKm: 350,             // …spread by the lithosphere over about this

    // ── R1: rivers and lakes (finish-hydro.js) ──
    riverMinM3s: 8,             // a river is traced from this discharge (the page draws from its own threshold, above it)
    riverWidthPerSqrtQ: 5,      // a river's width (m) per √(m³/s) — hydraulic geometry (Leopold & Maddock)
    bedLossMPerYear: 20,        // what a river's bed loses where it is fully arid (m a year over its width: seepage and
                                // evaporation — the Nile loses ~10 % over 1800 km of desert)
    lakeEvapShare: 1.2,         // open water evaporates this much of the land's potential evaporation
    lakeMinKm2: 300,            // a hollow is a lake from this size… (150 and 5 m: "too many lakes" — developer)
    lakeMinDepthM: 15,          // …and this depth; and only where it has an origin — scoured by the ice age (lake districts),
                                // or a hollow of the tectonic surface (rifts, forelands, closed basins: this share of its
    lakeTectonicShare: 0.25,    // cells, the tectonic surface's hollows at least tectonicHollowKm deep); the finishing's own
    tectonicHollowKm: 0.1,      // hollows (fans, loess and dunes damming valleys) are filled: flat valley floors
    tectonicHollowMeshKm: 60,   // (the tectonic surface's hollows read on the carving's mesh nearest this many km across: a
                                // range's troughs and a lowland's hummocks average away, basins hundreds of km across stand —
                                // developer, 2026-10-27: fresh lakes "should be lower like < 10%"; 0: on the finished mesh)
    breachKm: 0.6,              // an old basin that overflows has cut a gorge this deep through its rim (at most)…
    breachQ: [10, 1000],        // …by what spills over (m³/s): none below the first, full from the second…
    glacialBreachShare: 0.5,    // …half as deep in the ice age's own (young) hollows, and only by big rivers (glacialBreachQ, m³/s):
    glacialBreachQ: [500, 5000], // a big river breaks through its lakes, a small one keeps its lake district
    // which lakes stay (developer: "every river needs to end at ocean not lake"): a lake on a river is cut through to its
    // floor unless its river fills it and it is at least lakeKeepKm2 × √(inflow / 1000 m³/s) big (the ice age's lakes
    // glacialKeepShare of that) — no closed basins
    lakeKeepKm2: 5000,
    glacialKeepShare: 0.5,
    // …and a major river keeps only a huge lake (developer, 2026-10-27: major rivers ending in a lake "< 1% unless the lake
    // is huge"): from lakeHugeQ[0] m³/s, by lakeHugeQ[1], at least lakeHugeKm2 (Titicaca ~8 300, Ladoga ~18 000) — a
    // remnant of the sea too: one smaller its delta fills
    lakeHugeKm2: 8000,
    lakeHugeQ: [500, 1000],
    // Where a river must cut through — a basin it drains, a pocket in it — its gorge keeps the river's own course, every bend
    // of it, unless a shortcut is enough less work: the rock it cuts, and gorgeLengthKm for each km of its length (developer:
    // rivers "that go back and forth"; then "there should be some balance … between the 'true down' path and the 'shortcut'
    // path … Some windyness is good"). How direct: along its own course a river does only this share of the work, so a bend is
    // cut through only where the way round is over 1 / this times the shortcut (0.5: a detour twice as long); 0 keeps every
    // course as it was, 1 takes the way of least work
    riverDirectness: 0.1,
    riverWanderKm: 0.03,        // across a flat (a filled hollow, a pit filled to just above the sea) the rivers' ways bend
                                // with the meander as if the ground under them were this much lower where it is low (0: the
                                // straightest way: developer, 2026-10-27 — "slightly too straight now")
    gorgeLengthKm: 0.02,
    seaCutKm: 0,                // a basin below sea level opens into the ocean if its cut through dry land is at most this long
                                // (0: never — developer: a small trapped sea is "NOT a valid end it should go out to the real sea")…
    seaCutFloorKm: 0.003,       // …else its gorge stops this little above sea level (no arm of the sea winding inland); the
                                // ground it leaves below sea level is filled in to there (no dry land below sea level)
    // inland seas (2026-10-15, developer: inland seas "COMPLETELY dried out … leaving holes in the ground"): a body below
    // sea level behind a low, short barrier is a sea the mesh cannot connect — a strait narrower than its cells, low land
    // the carve keeps at its 2 m floor — opened into the ocean along the way it would spill, by a smooth weight on the
    // barrier's height and its length over dry land (open below the first of each, closed beyond the second)
    straitSillM: [3, 30],
    straitKm: [40, 160],
    straitDepthKm: 0.02,        // …the strait cut this far below sea level
    // a basin below sea level the ocean does not reach is a remnant of the sea: it holds water as its water balance
    // allows, up to its rim — full, it spills on (a fresh lake whatever its size); short of it, a terminal salt sea where
    // it is big for its river or an old sea floor this deep (km, from the first fully at the second — the Caspian, the
    // Dead Sea: developer, 2026-10-15, "allow terminal salt seas"), else a salt pan…
    saltSeaDeepKm: [0.2, 0.5],
    seaBasinKm2: [5000, 20000], // a remnant of the sea: a body below sea level this big (km², from the first to fully the
    seaBasinDeepKm: [0.05, 0.2],// second) and this deep (km) — a smooth weight, the same at every detail; a smaller or
                                // shallower pit — a dip the finer mesh finds — is the land's: its rivers cut it through
    seaFillKm: 1,               // its floor filled with sediment since it was cut off, toward at most about this far below
                                // its rim (depth d → this × tanh(d / this)): the Caspian's and Black Sea's depths, not an
                                // ocean's 5–9 km — a salt sea in a bowl, not at the foot of a cliff…
    panDepthKm: 0.12,           // …and a pocket a salt sea left dry below its water filled further, toward a flat at most about
                                // this far below it (d → this × tanh(d / this): the Qattara's, Death Valley's scale); a salt
                                // pan — a hole its river keeps all but dry — filled to a flat just above sea level: never a
                                // dry hole the size of the sea
    panFlatShare: 1.5,          // the pan itself: where the basin was deeper than this × panDepthKm (its flat floor)
    seaSeedKm2: 250000,         // the sea: a body below sea level at least this big, holding deep water (below seaDeepKm) —
    seaDeepKm: 1,               // the real oceans; a pit on a continent is a basin, not a sea (15 000: rivers "all ending in
                                // small lakes now instead of going to the ocean" — developer)
    wetShare: 0.3,              // a month is wet where its rain passes this share of its potential evaporation (or it freezes)
    // each river's year: each month's runoff — rain, and snow kept until it melts (snowMeltMmPerC per °C above freezing, a
    // month) — less a share of the month's potential evaporation (monthEvapShare); a share of it seeps into the ground
    // (baseflowShare where it is humid, none in deserts) and drains back to the rivers slowly (baseflowMonths: the time a
    // dry season takes to drain the ground to a third); big lakes even out what they pass on (lakeRegulation)
    snowMeltMmPerC: 90,
    monthEvapShare: 0.8,
    baseflowShare: 0.5,
    baseflowMonths: 2.5,
    lakeRegulation: 0.6,
    // regimes: a month is dry when the river carries under dryShare of its mean (or under dryM3s); dry ephemeralMonths or
    // more — dry most of the year; fewer — seasonal; never — permanent, with a flood season if its peak month carries
    // floodRatio × its mean (the Nile, the Ganges, the snowmelt rivers; not the Amazon, the Mississippi, the Rhine). Fed
    // from afar: permanent where the land's rain is under farFedAridity of its potential evaporation
    dryShare: 0.03,
    dryM3s: 0.5,
    ephemeralMonths: 7,
    floodRatio: 2.5,
    farFedAridity: 0.35,

    // ── F4: wind ──
    ergSlope: 0.006,            // sand seas: desert ground flatter than this…
    ergBelowKm: 0.05,           // …and at least about this much lower than its surroundings (sand gathers in basins)
    ergFill: 0.9,               // hollows in a sand sea filled to this share
    duneKm: 30,                 // dune ridges (draa) this far apart, where the mesh can show them (10M; ~4 cells a wave)…
    duneAmpKm: 0.08,            // …and this high
    panKm: 0.03,                // deflation pans in desert plains, this deep…
    panScaleKm: 35,             // …about this far apart
    loessKm: 0.08,              // loess downwind of deserts and the ice age's outwash, up to this thick…
    loessReachKm: 600,          // …over this far downwind…
    loessHotShare: 0.25,        // …the silt coming mostly from the outwash and the cold deserts (frost and glaciers grind
                                // it): a hot desert (BWh), whose dust is mostly sand, gives this share of a cold one's…
    loessWarmC: [21, 15],       // …and kept where the year is no warmer than this (°C, its mean: fading from the first) —
                                // tropical rain weathers silt into clay and washes it off; Earth's loess lies 30–55°
                                // (China's plateau, Ukraine, the Midwest, the Pampas), not on the Sahel
};

// ── the land's cover, as a satellite sees it (plans/V2_SATELLITE_PLAN.md; finish-cover.js) — from each place's twelve
// months. Wetness = rain ÷ potential evaporation (FINISH.petBaseMm, petPerC); warmth from the warmest month; the S-curves'
// ends below ([from, to]) are where a share goes from none to all ──
export const COVER = {
    vegWet: [0.02, 0.28],       // all vegetation (trees, grass, shrub, moss): by the year's wetness… (greener than the
                                // first cut, 0.03–0.4 — developer: "everything looks a bit too dry/not green" — and closer
                                // to Blue Marble on Earth too: July 6.3 → 4.2, January 10.2 → 9.2 per channel)
    vegWarm: [1, 8],            // …and the warmest month (°C: polar desert below, tundra between, full above)
    treeWet: [0.3, 0.85],       // trees: by the year's wetness (savanna and woodland between)…
    treeWarm: [9, 13],          // …the warmest month (the tree line: Köppen's 10 °C)…
    treeSeason: [1, 3],         // …and the growing months (warm and wet enough) — a long dry or cold year has none
    needleCold: [-2, -14],      // needle-leaved: by a cold winter (the coldest month, °C)…
    needleCool: [16, 11],       // …or a cool summer (the warmest month: mountain and maritime conifers)
    evergreenWarm: [4, 16],     // broad-leaved evergreen: by a mild winter (the coldest month)…
    evergreenDry: [3, 7],       // …unless the dry season is this many months long (dry forests shed their leaves)
    growWarm: [1, 8],           // a month green: warm enough (°C)…
    leafWarm: [3, 10],          // …(trees leaf out later)…
    grassWet: [0.18, 0.6],      // …and wet enough (its rain and the soil's water ÷ its potential evaporation; grass…
    treeWetMonth: [0.1, 0.45],  // …trees, with deeper roots)
    soilMm: 150,                // the water the soil holds through a dry spell
    lag: 0.4,                   // a month's look is this much the month before's (greening and browning take time)
    snowPhase: [2, -2],         // snow, not rain: from this °C (none) to this (all)
    snowMeltMmPerC: 90,         // snow melts this many mm a month per °C above freezing
    snowCoverMm: [3, 20],       // snow on the ground (mm of water): first patches → white (≈ 7 cm of snow buries
                                // tundra and grass: the winter Arctic and the steppes white from space; a mild
                                // European January mostly bare)
    snowLossMm: 10,             // a snowpack loses up to this much a month to the dry winter air (thin snow on dry steppes
    snowLossWarm: [-15, 0],     // goes) — the more, the less cold (°C: in a Siberian winter it hardly goes at all)
    snowYear: [0.5, 0.85],      // the year's look: snow where it lies over half the year (patchy) to most of it (white)
    snowUnderTrees: 0.3,        // a full evergreen canopy hides this share of the snow, a leafless one half of it (from
                                // space a snowy taiga is grey-white: Blue Marble, January)
    larchCold: [-25, -38],      // needle-leaved trees that drop their needles (larch): by a very cold winter
    // ice sheets (developer: "the poles, especially when there is land, is frequently not icey, which feels super wrong"):
    // the climate runs on bare bedrock, without an ice sheet's feedback (its kilometres of height and its whiteness keep it
    // cold through the summer) — so where the summer is this cool (the warmest month, °C: none at the first, all at the
    // second) and this much snow falls in a year (mm: none … all; the dry Arctic coasts of Siberia stay bare), the land
    // carries an ice sheet, white in every season; warmer fringes stay tundra (Greenland's coast). (By the year's mean
    // instead, Siberia's and Canada's forests — mean −5…−15 °C, warm summers — turned to ice: the Earth check, July 6 → 16)
    iceSheetTw: [7, 3],
    iceSheetSnowMm: [60, 200],
    // …and the summer that still freezes over warmer toward the pole (the polar night, the ice's own feedback): by up to
    // this many °C, from the first latitude to the second — the poles read icy (developer)
    iceSheetPolarC: 5,
    iceSheetPolarLat: [60, 80],
    // each climate's mean colour on the planet moved this share of the way to its own (Blue Marble's mean per Köppen class
    // and season, finish-cover.js CLIMATE_RGB) — a ratio per class, season and channel (within climateRatio), blurred this
    // far so climates hand over gradually; the cover keeps its detail within the climate
    climateBias: 0.7,
    climateBiasKm: 100,
    climateRatio: [0.33, 3],
    // …strongest deep inside a climate: from none at its edge with another to all this deep (km) — near the edge the
    // cover's own colours, which change smoothly, carry the transition; the depth roughened by noise this strong (km), and
    // the corrections displaced by up to about this (km), both at this size (km) — so the transitions meander
    climateDepthKm: [0, 450],
    climateDepthNoiseKm: 180,
    climateWarpKm: 150,
    climateNoiseKm: 700,
    // the rain the cover reads: each place's year of rain moved this share of the way (in logs) to its surroundings' —
    // blurred over this far (km), warped by up to about this (km), roughened by e^{±this}, at this size (km) — so the
    // green and the bare follow the regional climate, not each cell's own wobble (the climate tabs keep their own rain)
    coverRainShare: 0.5,
    coverRainKm: 80,
    coverRainWarpKm: 110,
    coverRainNoise: 0.2,
    coverRainNoiseKm: 250,
    // variety (developer: "too 'one color' … add noise to shift naturally between a couple colors for each climate and
    // between climates"): each kind of ground tinted by noise between a few natural colours — the same noise everywhere,
    // so it flows across climates. Tints are linear-light multipliers, at full strength varyStrength standard deviations
    // of the noise out: bare ground red (iron-rich) or pale (sand, limestone) by province, dark (basalt, varnish) or grey
    // (gravel, granite) by patch; grass lusher or olive, khaki where the ground is red; trees deeper or olive, needle-
    // leaved bluer in the dark patches
    varySoil: { red: [1.25, 0.9, 0.72], pale: [1.18, 1.16, 1.14], dark: [0.64, 0.64, 0.67], grey: [0.93, 0.98, 1.08] },
    varyGrass: { lush: [0.85, 1.24, 0.72], olive: [0.8, 0.85, 0.64], khaki: [1.26, 1.07, 0.87] },
    varyTree: { deep: [0.72, 1.07, 0.68], olive: [1.27, 1.07, 0.74], blue: [0.82, 0.94, 1.3] },
    varyKm: [900, 260, 400],    // the noise's size (km): provinces, patches, the vegetation's own — domain-warped by
    varyWarp: 0.6,              // this share of its size (so its shapes stretch and wander, like geology, not blobs)
    varyStrength: 1.8,          // (developer: at 1.5 "way too much, tone it down a lot"; at 4.5 "crank up the noise to be like 75%
                                // towards what we had before": the tints' strength goes as 1 / this)
    varyFineKm: 50,             // and a fine mottling of the picture's brightness, this size (km; per pixel)…
    varyBright: 0.031,          // …± this share
    // the ground's own rock and sand (S2): the bare ground tinted (linear-light multipliers) toward the wind's sand seas,
    // its loess, and the flood basalt where it still caps the ground (dark trap rock: the Deccan from space)
    sandTint: [1.22, 1.1, 0.86],
    loessTint: [1.1, 1.05, 0.92],
    basaltTint: [0.5, 0.48, 0.47],

    // ── the terrain in the satellite view (S2, plans/V2_SATELLITE_PLAN.md) ──
    // the cover's temperatures at each place's own full height (the climate takes only part of a place's height above
    // its surroundings — CORE_DEFAULTS.terrainRelief — so its classes are not speckled; tree and snow lines follow it all)
    fullLapse: true,
    // rock and scree where the ground is rugged: from none to rockMax as the height varies this much (km, its standard
    // deviation within valleyKm) — or, where the detail shows cliffs, as steep as this (m per km, over a picture's pixel;
    // a pixel's slope is broad: the land's 99th percentile is ~60 at 640K)…
    rockRelief: [0.1, 0.45],
    rockSlope: [60, 200],
    rockMax: 0.85,
    rockExposure: 0.4,          // …in a warm, humid place only this share of it (forest holds steep slopes); all where dry or cold
    rockWarm: [140, 122, 102],  // the rock: warm brown where it is warm…
    rockCold: [124, 122, 118],  // …grey where it is cold
    rockUnderSnow: 0.6,         // a snowy month keeps this share of the rock (cliffs: snow slides off)
    // in dry country (by its dryness) the slopes facing the pole are greener, those facing the equator barer…
    aspectShare: 0.45,
    aspectSlope: [8, 40],       // …on slopes this steep (m/km, over a picture's pixel)
    // …and the valleys greener, the ridges barer — by the height against the surroundings this far around (km), per
    // valleyKmPerFull km below or above
    valleyKm: 25,
    valleyKmPerFull: 0.3,
    valleyShare: 0.5,
    greenerTint: [0.85, 1.0, 0.8],
    barerTint: [1.1, 1.05, 0.96],
    // the mountains' own texture (developer: "the mountains themselves need to be more prominent and evocative … it is NOT
    // immediately clear where the big mountains are"): where the ground is rugged (its height's spread within valleyKm:
    // mtnRelief, km) or high (mtnHeightKm, up to mtnHigh of it), a crumpled ridged micro-relief up to mtnReliefKm high —
    // at mtnTextureKm, its octaves down to two pixels — lit as the page lights the relief (× mtnExaggeration), its crests
    // barer by up to mtnCrestRock; it multiplies the climate's own colours (dark creased forest, rock, snow with grey creases)
    mtnRelief: [0.08, 0.35],
    mtnHeightKm: [1.2, 3.5],
    mtnHigh: 0.8,
    mtnReliefKm: 0.35,
    mtnExaggeration: 14,        // (20: with the deeper shading, "the hillshading is too strong" — developer)
    mtnTextureKm: 60,
    mtnCrestRock: 0.35,
    // the mountains' tone (developer: "a darker or browner color for the mountains … maybe varied by age or height"): a dark
    // warm brown (linear-light multipliers) over mountainous ground, up to mtnTone — all of it on young ranges (a belt the
    // history still raises), mtnToneOld of it on old worn ones (soil and forest cover them), and the more the higher
    // (from mtnToneHeightKm[0] at half to [1] at all); a third as much under snow
    mtnToneTint: [0.7, 0.6, 0.5],
    mtnTone: 0.6,
    mtnToneOld: 0.35,
    mtnToneHeightKm: [0.8, 3.5],

    // ── rivers green the dry land (S3; developer: "rivers should make things greener, this should only really be
    // noticable in arid climates") ──
    // a green ribbon along each river carrying ripMinM3s or more: ripWidthKm × √(q / 1000 m³/s) wide (within ripWidthMaxKm;
    // narrower than a pixel, fainter), up to ripWiden times wider on low ground (below ripLowKm: floodplains and deltas),
    // by the place's dryness, none under snow; and a fringe ripLakeKm wide
    // around the lakes (oases)
    ripMinM3s: 15,
    ripWidthKm: 6,
    ripWidthMinKm: 8,           // (every river at least this wide: a glow, not a line — developer: "blend more"; 14: "too thick")
    ripStrengthM3s: [15, 2000], // its opacity by its discharge: a third at the first, all at the second (log)
    ripWidthMaxKm: 12,          // (30: "the thickest rivers need to be way thinner on the satelite map (small ones are ok)")
    ripWiden: 0.5,
    ripLowKm: [0.25, 0.02],
    ripLakeKm: 12,
    ripMax: 0.9,
    // (developer: "the green from rivers should blend more, stronger in the middle and fade out … a bit of a warp that is
    // blended with the original to give a bit of waveyness … noisier colors and opaque on top of the base color"): its
    // profile a bell — all at the middle, none ripSpread half-widths out; a copy of it displaced by noise (up to about
    // ripWarpKm, in waves ripWarpWaveKm long) blended with the original (it at ripOriginal); its green between two by
    // noise at ripGrainKm
    ripSpread: 2.8,
    ripWarpKm: 3.5,
    ripWarpWaveKm: 45,
    ripOriginal: 0.7,
    // its colour the climate's own green, well watered (developer: "the neon green is awful. It should be more an
    // intensification of the natural hues of green of the climate its going through"): the place's cover again with its
    // rain raised to ripWetness of its potential evaporation (its season, its warmth, its variety — an oasis's palms, a
    // cold steppe's willows, dormant in a cold month); its opacity grained by noise at ripGrainKm (± ripGrain)
    ripWetness: 0.55,
    ripGrainKm: 25,
    ripGrain: 0.06,             // (0.2: "rivers need to be less noisy")
    // a flow texture (developer: "a light earthy/natural texture layed over the whole planet scaled by the FLOW of each
    // area (at some opacity) … to add additional texture and help blend between areas"): an earthy tint (linear-light
    // multipliers), grained by noise at flowGrainKm, laid over everything at up to flowOpacity — by the area each place
    // drains, from flowAreaKm2[0] (none) to [1] (all; km², log-scaled: every valley system shows, the trunks most); half
    // as strong on snow
    flowTint: [0.74, 0.62, 0.46],     // (warmer: developer)
    flowOpacity: 0.6,
    flowAreaKm2: [400, 40000],
    flowGrainKm: 12,
    flowGrain: 0.5,
    // …those colours made livelier (finish-cover.js livelier): greens (hues from…to, °) turned this share of the way to
    // this hue, saturation and brightness times these — golds, browns, greys and snow as Blue Marble has them
    climateGreen: { from: [40, 58], to: [150, 175], hue: 105, share: 0.5, sat: 1.4, value: 1.3 },
};
