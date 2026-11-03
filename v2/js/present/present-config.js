// The present-day world's tunables (plans/GENERATE_REDESIGN_PLAN.md): Generate's planet built as one moment of a
// believable history, its past filled in by closed forms. Physical units throughout: km, Myr, cm/yr.

export const PRESENT = {
    // ── G1: plates that move ──
    // Generate's plates are the PIECES you raise or sink. Neighbouring pieces are grouped into plates that move, which
    // carry continent and ocean alike (as Evolution's do), so most coasts lie inside a plate: passive margins. Each plate
    // is whole pieces (G1c), so its edges follow the outlines the Plates tab shows.
    platesPerSqrtPieces: 1.5,      // about 1.5 √P plates: 80 pieces → 13 (Earth: 7 major, ~8 minor)
    minPlates: 3,
    maxPlates: 18,
    // A big continent is split along the seam where today's pieces converged or parted hardest: a collision or a rift
    // inside it (India–Asia, Africa–Arabia) — and the owner's wish that the big ranges stay loosely where they were.
    splitMinShare: 0.07,           // a continent covering ≥ 7 % of the sphere (~36 Mkm²) may be split once…
    splitTwiceShare: 0.2,          // …twice from 20 % (a supercontinent)
    splitMinPart: 0.25,            // each part at least a quarter of the continent
    splitTries: 8,                 // seams tried, strongest first
    oceanPlateMin: 1,              // at least this many ocean-only plates (a Pacific)
    minPlateShare: 0.006,          // an ocean plate squeezed below this share of the sphere joins its neighbour
    // A continent trails its ocean behind it: the ocean its plate takes grows 1 + α times less far ahead of its motion
    // than behind, so the leading coast meets another plate and the trailing one stays passive.
    leadingAnisotropy: 2,
    // Most continents lead into an ocean plate that dives under them — an active margin, the plate's edge along their
    // leading coast (the Andes, the Cascades, Sumatra); the rest lead into nothing (Africa, Antarctica).
    activeLeadShare: 0.6,
    seaSmoothKm: 250,              // out at sea a plate's edge is smoothed over about this (the pieces' outlines wiggle)
    leadCoastCos: 0.55,            // an ocean piece within ~57° of its continent's motion, seen from their shared coast, is ahead
    // An ocean-only plate is drawn toward the continents it dives under (slab pull): its motion is bent this far from
    // the motion its pieces had toward those boundaries.
    slabPullBlend: 0.55,
    // Speeds (the plate's RMS surface speed). Continents are slow, the bigger the slower; ocean plates with trenches fast.
    continentSpeedCmYr: [1.5, 4.0],    // a continent plate's speed from small to big …
    continentSpeedFullShare: 0.15,     // … the slowest at ≥ 15 % of the sphere
    oceanSpeedCmYr: [4.0, 8.5],        // an ocean plate's speed from no trench to its whole rim at continents
    speedJitter: 0.15,                 // ± a share of it, per plate
    // Boundaries: each kind by the relative motion across it, averaged along the boundary
    smoothKm: 450,                 // the motion averaged over this much of the same boundary either side
    transformRatio: 0.45,          // |closing or opening| below this share of the slip along it: a transform
    minRateCmYr: 0.4,              // slower than this: an inactive seam

    // ── G2: the sea floor and the coasts ──
    // The floor's age: distance from its ridge ÷ half the spreading rate there (km/Myr = 10 × cm/yr)
    minHalfSpreadCmYr: 1.0,        // (a ridge spreading slower than this still spreads at this pace)
    maxFloorAgeMyr: 180,           // older floor than this has gone down a trench somewhere (Earth's oldest: ~180 Myr)
    unreachedHalfSpreadCmYr: 1.2,  // floor no ridge reaches ages on from the floor around it this slowly…
    unreachedStartMyr: 90,         // …or, reached by nothing, starts this old at its plate's edges
    // G2c: the land is the pieces' own (present/coast.js), and on Generate's mesh the ground is held to them
    // (present/hold.js): a land piece never deeper than a shelf, an ocean piece never above the sea but where orogeny
    // raised it
    landFloorKm: -0.12,            // a land piece's floor (km): its coast may drown into a shelf sea, no deeper
    landFloodShare: 0.06,          // …but at most this share of the land pieces under the sea (fore-arcs, rift seas and gulfs
                                   // counted): past it the fringe barely under is lifted to landLiftKm, shallowest first
    landLiftKm: 0.02,
    oceanCeilKm: -0.08,            // an ocean piece's ceiling: under the sea, its shelf edge sharp
    volcanoReachKm: 160,           // …but within this of a volcano on it (its island's flanks), or on island-arc crust
    foreArcDrownKm: 70,            // a land piece's edge along another plate's ocean piece drowned this far in (the fore-arc:
    foreArcDepthKm: -0.2,          // the Andes' coast ~100 km from the trench), to at least this deep
    foreArcFloorKm: -1.2,          // …and no deeper than this (the trench itself is on the ocean piece)

    // ── G6d: detail that holds up close (present/relief.js) — a ridged fractal on the uplands and mountains, its octaves
    // from reliefFromKm down to what the terrain mesh can show, laid down before the rivers carve ──
    reliefShare: 0.15,             // its strength: ± about this share of the ground's height (× the Roughness slider's factor)
    reliefFromKm: 160,             // its broadest wave (shown from ~200K cells; 80 km from ~800K, 40 km at 2.5M)
    reliefRoughness: 0.55,         // each octave this share of the one before
    reliefRiseKm: [0.25, 1.5],     // none below the first height, full from the second (the plains keep Evolution's hills)
    reliefVary: 0.5,               // ± this much more or less rugged from place to place…
    reliefVaryKm: 900,             // …in patches about this wide
    // G3b: the grain (present/seams.js): near a closing front the relief runs along its strike…
    grainShare: 0.85,              // …this share of it at the front…
    grainKm: 700,                  // …fading with the distance from it over this (e-folding)…
    grainStretch: 4,               // …its features this many times longer along the strike than across

    // ── G3b: the pieces jostle (present/seams.js) — where two land pieces of one plate meet, the pieces' own motion ──
    seamQuiet: 0.25,               // a seam moving less than this share of the planet's seams' spread did nothing…
    seamMaxStrength: 1.5,          // …and counts at most this many spreads
    seamMinCells: 3,               // (a seam shorter than this many sim cells is no seam)
    seamAgeMyr: [60, 1500],        // a closing seam raised a range this long ago (log-uniform: most old and worn)…
    seamWorkKm: [120, 420],        // …with this much convergence per spread of closing
    seamSagKm: 0.2,                // a parting seam sagged this deep per spread (× 0.6–1.4)…
    seamSagWidthKm: 220,           // …over a trough this wide (σ): a lowland inland, a gulf where it meets the coast

    // ── G3: today's mountains — how long each kind of front has been at work (Myr), drawn per front ──
    andeanMyr: [40, 140],          // a subduction margin (the Andes: ~200 Myr; the Cascades' arc younger)
    andeanCoastKm: 180,            // a trench within this of its upper plate's coast makes an Andean margin there; farther
                                   // out at sea it is an island arc's (Japan's sea behind it)
    couplingCmYr: [-0.5, 2.0],     // an upper plate driving at its trench this fast (cm/yr) is fully coupled — squeezed…
    rollbackShare: 0.25,           // …and one moving away from it builds this share of the belt (rollback, stretching)
    riftShoulderShare: 0.6,        // a rift's shoulders: this share of the history's shoulder work (a young rift's flanks)
    flatSlabMyr: 20,               // a flat slab's belt migrates inland over at most this long (the Laramide: ~20 Myr)
    collisionMyr: [8, 45],         // a continent–continent collision since first contact (India–Asia: ~50)
    transpressionMyr: [5, 25],     // a transform pressed together on land (the Southern Alps: ~5–10)
    riftMyr: [3, 25],              // a continent pulling apart (East Africa: ~25; the Red Sea opened ~5–25)
    riftSeaMinKm: 140,             // a rift opened wider than this has a young sea down its middle
    arcMaxKm: 220,                 // an island arc's crust at most this wide…
    foreArcKm: 60,                 // …set back this far from its trench (the fore-arc)…
    arcMinRateCmYr: 3,             // …only where the slab goes down at least this fast…
    arcMinSlabMyr: 30,             // …and is at least this old (dense)…
    arcAgeMyr: 30,                 // …its crust no older than this

    // ── G4: the continents' past, replayed (a world ~2000 Myr old; owner, 2026-11-02) ──
    pastMinAreaKm2: 1.5e6,         // a landmass smaller than this has no past of its own (a microcontinent, an island)
    coreAreaKm2: 12e6,             // one craton core per this much continent…
    maxCores: 4,                   // …at most this many
    cratonShare: 0.22,             // the cores together are this share of the continent…
    cratonCoastKm: 450,            // …kept this far from its coast…
    cratonEdgeKm: 120,             // …their edges wandering this much (and cut by a straight rifted edge or two)
    coreAgeMyr: [1800, 2000],      // the cores formed this long ago
    seamWander: 0.8,               // the growth out from the cores runs through a noise weighing each step 1…1 + 2× this…
    seamWanderKm: 1100,            // …in waves this long: the seams between terranes wander
    ringKm: [650, 950],            // each accreted ring this wide…
    ringWanderKm: 220,             // …its inner seam wandering this much…
    ringStepMyr: [280, 450],       // …and this much younger than the one inside it…
    youngestRingMyr: 120,          // …never younger than this
    ringWorkKm: [250, 500],        // a ring docking: this much convergence (a Ural-type welt)…
    ringArcDeg: 180,               // …along the arc of its seam facing the margin active then (not all round the core)
    weldMyr: [700, 1400],          // two cores welding: this long ago…
    lastWeldMyr: [250, 600],       // …the last pair to meet, this recently
    weldWorkKm: [700, 1500],       // …with this much convergence
    plateauBelowMyr: 350,          // a weld younger than this raised a plateau on one side (a Himalaya, worn)
    innerWeldShare: 0.7,           // the earlier welds this share of the last one's work
    pastRateCmYr: 4,               // the past's convergence rate (the belts' width factor)
    pastCoastKm: 550,              // a past seam this near today's coast raised no welt there (a passive margin rifted
                                   // across the old belts); the swells sink toward the coast over the same distance
    pastEventMyr: 40,              // each past event lasted about this long
    wearUpliftMyr: 200,            // a past belt's broad uplift wears with this e-folding time…
    wearCrestMyr: 420,             // …its crests more slowly (old ranges linger as ridges)…
    wearRootMyr: 320,              // …its root (isostatic rebound) between
    swellMajorKm: 0.4,             // uplands along the major sutures (the worn highlands round an old range)…
    swellMajorWidthKm: 800,
    swellRingKm: 0.15,             // …lower ones along the rings' seams…
    swellRingWidthKm: 450,
    swellNoiseKm: 0.15,            // …broken by a broad noise…
    swellFloorKm: 0.08,            // …over a floor; the cratons half as much (calm shields)

    // ── G5: plumes and the far field ──
    plumeCount: [4, 7],            // mantle plumes, fixed under the moving plates…
    plumeOceanWeight: 0.4,         // …rising under the sea this much less often than under a continent…
    plumeApartKm: 1800,            // …and at least this far apart
    trackMyr: 90,                  // a track runs back along its plate's motion at most this far (Hawaii–Emperor: ~80)…
    trackStepMyr: 0.5,
    trackRibbonKm: 110,            // …on a swell this wide…
    burstMyr: [0.6, 2],            // …in bursts of eruption (one volcano each)…
    quietMyr: [1.5, 5],            // …between quiet spells
    trackBuildKmPerMyr: 8,         // a burst builds its volcano this fast (× the plume's strength 0.6–1.4)…
    trackMaxKm: 10,                // …up to this pile on the sea floor…
    volcanoRadiusKm: 70,           // …this wide
    activeMyr: 2,                  // the volcano over the plume is still erupting (no wear yet)
    lipCount: [0, 2],              // flood basalts: at most this many on a planet…
    lipChance: 0.45,               // …a plume's head made one with this chance…
    lipAgeMyr: [15, 200],          // …this long ago (on its track)…
    lipAreaKm2: [0.15e6, 2e6],     // …this big (log-uniform; the Deccan ~0.5 Mkm², Siberia ~2+)…
    lipThicknessKm: 2,             // …this thick
    farReachKm: 2600,              // a collision's push reaches this far through its continent…
    farMinKm: 500,                 // …squeezing up an old suture at least this far inland…
    farQuietMyr: 150,              // …quiet at least this long…
    farMinCells: 4,                // …a piece of it at least this many sim cells long…
    farRanges: 2,                  // …at most this many such ranges a planet…
    farWorkKm: 400,                // …with this much shortening at the front's own distance, less farther off…
    farActiveMyr: 20,              // …rising for about this long
};
