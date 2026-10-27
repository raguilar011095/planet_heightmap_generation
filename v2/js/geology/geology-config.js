// Every tunable of the finish's geology (plans/V2_GEOLOGY_PLAN.md; research and sources: plans/V2_GEOLOGY_RESEARCH.md), in
// physical units — km, Myr, shares — so it reads the same at every detail. The history's own record has its tunables in
// tectonics/config.js `geology`. PRIORS: each value's range in the literature (or the range that still looks right),
// as the climate's PARAM_PRIORS.
//
// guideRules: where the science disagrees with Madeline James's guide, the stance taken (developer, 2026-10-19: "take a
// stance … go for interesting visual and worldbuilding wise so we can undo") — each one back to her rule in a line.

export const GEOLOGY = {
    guideRules: {
        arcRockByCrust: true,   // arcs grow more felsic as the crust under them thickens (island arcs basalt–andesite,
                                // continental arcs andesite–rhyolite); false: her "shallow subduction → andesite, steep → rhyolite"
        coalByWetBelts: true,   // (G4) coal where a basin lay in a wet belt; false: her last supercontinent's 45°N–45°S
        iceStripsPlacers: true, // (G4) ice strips placers, the unglaciated hills richest; false: richest by the old ice
        graniteIntrusive: true, // granite only where erosion has bared it (it is intrusive); false: her granitic rock at every orogeny
    },

    // ── what lies at the surface: the cover if any is left, else the basement — or young sediment over either ──
    coverShowKm: 0.05,          // cover thinner than this (where the surface meets it) is not shown: the basement's
    glacialStripKm: 0.4,        // under the last ice age's sheets thin cover is scoured off (the Canadian Shield): this much
    highStripFromKm: 1.5,       // high ground sheds its cover: from this regional height (over ~50 km)…
    highStripPerKm: 1,          // …this many km of it per km higher (the crystalline cores of high ranges)
    despeckle: 2,               // passes of a majority filter: a cell alone among another kind takes theirs
    // ── the cover as beds, cut by the finished surface — so its outcrops follow the ground, as on a geologic map ──
    recordBlurCells: 0.6,       // the record's cover, its make-up and its wear read smoothly, over this many sim cells
    bedKm: 0.35,                // the beds (formations) about this thick (0.6–1.4 × it), counted up from the basement
    reliefKm: 40,               // a place's relief: its height over the land around it (~this far) — valleys cut down into
    reliefGain: 1.5,            // older beds, ridges keep younger ones: the relief × this (the beds lie flat; a little more
                                // shows the pattern at a map's scale)…
    foldKm: 70,                 // a fold belt's folds this far apart (the terrain's ridges: 55–95 km; and a set 2.6 × longer)…
    foldDepthKm: 2,             // …an anticline baring beds this much deeper than its syncline keeps: stripes along the belt
    // ── the structure the terrain drew, followed (terrain/synthesize.js surfaceRange `cue`) ──
    bandGain: 1.6,              // an old belt's rock banded as its ridges are (terrain-config oldGrainHardness: the ridges hard,
                                // the troughs soft — the Valley and Ridge): resistant rock's odds × e^(± this) on them —
                                // sandstone over shale and limestone in the cover, gneiss over slate and schist beneath
    farFoldDepthKm: 0.6,        // the far field's folds (the platform's broad anticlines and synclines, ~320 km apart, where
                                // the terrain raises them): a crest bares beds this much deeper, a trough keeps this much
                                // more (the Cincinnati arch, the Ozark dome)
    bedJitterKm: 0.12,          // the beds' contacts wander by this (noise, 150 and 75 km)
    contactWarpKm: [30, 160],   // the record read displaced by up to ~this (km), in waves from this long down to what the
                                // mesh draws: contacts that wander and fold, whole
    facieKm: 350,               // each bed's kind changes across country over about this (sand to mud to lime)
    floodplainQ: [250, 1000],   // a river's plain: along rivers of this discharge and more (m³/s) — its half-width…
    floodplainKm: [6, 25, 60],  // …this at the second discharge (× (q / it)^0.4), between the first and the last (km)…
    floodplainHandKm: [0.03, 0.1],  // …on ground no higher above the river than the first (fading out by the second)
    plainsShare: 0.06,          // deltas and basin floors: the land where the rivers laid the most, about this share of it
                                // (Earth's mapped alluvium; GLiM's loose sediment, 28 %, is that with dunes, loess and moraines)…
    alluviumKm: [0.005, 0.02],  // …never where they laid less than this over the region (a dry world has fewer); with no
                                // regional field, a cell's own deposit between these
    ergShow: [0.25, 0.6],       // sand seas, from the wind stage's sand (0…1)…
    loessShow: [0.4, 0.9],      // …and loess (as a share of the finish's loessKm)
    tillShow: [0.2, 0.7],       // the last ice age's moraines and outwash, by its margin (0…1)
    lavaShow: [0.15, 0.5],      // a flood basalt's cap still on the ground (the finish's basalt field, 0…1)

    // ── the basement, by the setting the crust was last in and how deep it is worn (its grade) ──
    gradeKm: { slate: [4, 8], gneiss: [16, 24] },   // worn this deep: from the folded sediments and volcanics into slate and
                                                    // schist, then gneiss and migmatite (Barrovian depths; research §3)
    volcanicLidKm: [1.5, 4],    // an arc's volcanic pile: bared to its plutons once its unroofing passes this
    arcActiveMyr: [10, 60],     // a subduction belt counts as a live arc for this long after it was last active (then fading)
    arcFront: [0.05, 0.55],     // the volcanic arc across an Andean belt: from its front (0) to this far across (1 = far edge)
    collisionGranite: 0.3,      // granite plutons' share of a collision belt worn past its sediments (S-type: tin's granites)
    arcGranite: 0.65,           // …of an arc's roots once its lid is gone (batholiths: the Sierra Nevada)
    beltGranite: 0.2,           // …of an old mobile belt's
    felsicThickKm: [15, 40],    // an arc on crust thickened this much turns andesite → rhyolite and tuff
    // ── shields ──
    greenstoneShare: [0.15, 0.35],  // each craton's greenstone belts (per craton; the rest granite-gneiss domes)
    domeKm: 90,                 // dome-and-keel: the domes' spacing (Pilbara: 30–70 km domes, ~120 km apart)
    beltStyleShare: 0.4,        // cratons in long parallel belts (the Superior's) rather than domes
    beltSpacingKm: 220,         // …their spacing
    // ── sutures ──
    ophioliteFlag: 0.55,        // a closed sea's floor, thrust up (GeoFlag.OPHIOLITE): ophiolite this much of it, mélange the rest
    sutureOphiolite: 0.35,      // along an old suture: thin slivers this strong
    // ── the sediment's kinds ──
    shaleMarine: 0.55,          // shale's share of sand-and-mud laid in the sea (the rest sandstone); on land…
    shaleLand: 0.25,            // …this
    saltShare: 0.5,             // a bed is salt by the cover's salt share × this (it dissolves at the surface: rarely seen)
    basalSand: 0.5,             // the lowest bed, laid as the sea first spread over the basement, sandier by this
    patchKm: 110,               // the patches each kind of rock comes in (noise, so edges are ragged, never the sim's cells)
};

export const PRIORS = {
    coverShowKm: [0.01, 0.2],
    bedKm: [0.1, 1],
    glacialStripKm: [0.1, 1],
    gradeKm: { slate: [[3, 6], [6, 12]], gneiss: [[12, 20], [20, 30]] },
    bandGain: [0.6, 2],
    farFoldDepthKm: [0.2, 1.5],
    volcanicLidKm: [[1, 3], [3, 6]],
    collisionGranite: [0.2, 0.4],
    arcGranite: [0.6, 0.8],
    greenstoneShare: [0.15, 0.35],
    domeKm: [60, 140],
    beltSpacingKm: [150, 300],
};
