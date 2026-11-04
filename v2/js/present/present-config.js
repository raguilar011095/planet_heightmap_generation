// The present-day world's tunables (plans/GENERATE_REDESIGN_PLAN.md): Generate's planet built as one moment of a
// believable history, its past filled in by closed forms. Physical units throughout: km, Myr, cm/yr.

// Evolution's terrain tunables Generate's present-day world draws differently (G3c): an open-ocean island arc, mature,
// stands at the sea's surface — its islands a chain (the Philippines, the Lesser Antilles) — where Evolution's stays a
// submerged ridge its volcanoes break (kept low there, so its arcs never grow huge over a long history)
export const PRESENT_TERRAIN = {
    arcOceanMatureKm: -0.35,       // (Evolution's −1.5: its islands the ridge's high points, not the whole ridge)
    arcMatureKm: 0.5,              // (0.3)
    arcStraitKm: 90,               // the straits cut deeper and wider apart (35, 140): chains of islands, not ribbons
    arcIslandKm: 200,
};

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
    activeMinShare: 0.01,          // …and every continent of at least this share of the sphere (~5 Mkm²) leads somewhere (G1d)
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
    oceanCeilKm: -0.05,            // an ocean piece's ceiling at the land pieces' edge: under the sea…
    shelfDeepKm: -0.3,             // …deepening to this…
    shelfKm: 150,                  // …over this far out (a shelf: no flat band where the land was carried out)
    holdSoftKm: 0.05,              // every hold soft: the ground squeezed into a band this deep under its bound, not cut flat
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
    reliefVary: 0.2,               // ± this much more or less rugged from place to place…
    reliefVaryKm: 900,             // …in patches about this wide
    reliefFrontKm: 500,            // G4b: full along the fronts (the pieces' edges), falling off with this e-folding…
    reliefFarShare: 0.35,          // …to this share far from any
    // G3b: the grain (present/seams.js): near a closing front the relief runs along its strike…
    grainShare: 0.85,              // …this share of it at the front…
    grainKm: 700,                  // …fading with the distance from it over this (e-folding)…
    grainStretch: 4,               // …its features this many times longer along the strike than across

    // ── G3b: the pieces jostle (present/seams.js) — where two land pieces of one plate meet, the pieces' own motion ──
    seamQuiet: 0.25,               // a seam moving less than this share of the planet's seams' spread did nothing…
    seamMaxStrength: 1.5,          // …and counts at most this many spreads
    seamMinCells: 3,               // (a seam shorter than this many sim cells is no seam)
    seamAgeMyr: [30, 600],         // a closing seam raised a range this long ago (log-uniform: G4d, younger than the old
                                   // orogenies — a minor plate's range stands between them and today's plate edges)…
    seamWorkKm: [140, 480],        // …with this much convergence per spread of closing
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
    arcMaxKm: 280,                 // an island arc's crust at most this wide…
    arcMinRateCmYr: 2,             // …only where the slab goes down at least this fast…
    arcMinSlabMyr: 15,             // …and is at least this old (dense)…
    arcAgeMyr: [25, 120],          // …its crust this old, each arc its own draw (a Mariana young, a Philippines mature)
    // G3d: an arc stands along only part of its trench (owner, 2026-11-04: "too uniform and everywhere"), where a noise
    // along the trench (arcSegKm) falls under its chance there:
    arcNearChance: 0.9,            // …likely within arcNearKm of its own plate's land (an arc trailing from its continent)…
    arcFarChance: 0.08,            // …seldom arcFarKm or more from it, or on a plate with none (the open ocean)
    arcNearKm: 500,
    arcFarKm: 1800,
    arcSegKm: 900,                 // (stretches about this long: an arc, a gap, an arc)
    arcFadeShare: 0.2,             // toward a stretch's ends it is younger and narrower (over this much of the chance)…
    arcYoungShare: 0.15,           // …down to this share of its age (a submerged ridge its volcanoes break)
    arcVaryKm: 500,                // along it, over about this: its width × this range…
    arcWidthVary: [0.45, 1.5],
    arcSetbackKm: [40, 150],       // …and its distance from the trench (the fore-arc) in this range
    // G3c: a margin along a continent splits off an island arc and opens a sea behind it (Mariana type: Japan, the Kurils,
    // the Philippines, Indonesia's arcs) rather than squeezing an Andes, with a chance of…
    backArcBase: 0.35,             // …this at a 60 Myr slab and an upper plate standing still…
    backArcAgeGain: 0.35,          // …more by this per 100 Myr older slab (old, dense floor sinks steeply and rolls back)…
    backArcDriveGain: 0.12,        // …less by this per cm/yr the upper plate drives at its trench…
    backArcMaxChance: 0.85,
    backArcMinCells: 4,            // (a front shorter than this many cells along a continent: as before)
    backArcSegKm: 1600,            // G3d: a long front splits along some stretches, about this long, and squeezes along others
    // G3e: Indonesia (owner, 2026-11-04). A split margin's back-arc either spreads into one sea floored by new ocean crust
    // (Japan) or, with this chance, stretches the continent behind the arc and breaks it into blocks with young seas
    // between (Sundaland, eastern Indonesia)…
    sundaChance: 0.3,
    sundaMax: 2,                   // (at most this many a planet: an Indonesia, an Aegean — not every margin)
    sundaShelfKm: [600, 1200],     // …this far behind the arc (the Java Sea to Borneo's far side: ~1000 km)…
    sundaBlockKm: 750,             // …its blocks in a noise about this big (a Borneo, a Sulawesi, a Malay peninsula)…
    sundaKeepShare: 0.38,          // …about this share of it standing…
    sundaFadeKm: 260,              // …more and more of it toward its far edge, over this, back to the mainland;
    sundaDeepKm: 260,              // its seas shelf seas, but deep basins farther than this from every block;
    shelfSeaFloorKm: -0.25,        // (a shelf sea held above this, softly over this much: shallow by its islands, a little
    shelfSeaSoftKm: 0.12,          // deeper away from them)
    sundaArcIslandKm: 700,         // …and its arc a chain of long islands, along a noise about this long,…
    sundaStraitShare: 0.22,        // …straits where it is in its lowest this share
    fragmentKm: 350,               // a spread back-arc sea leaves slivers of the continent in it (microcontinents), in patches
    fragmentShare: 0.14,           // about this big, over about this share of the sea
    arcCollideKm: 700,             // an ocean arc whose diving plate brings a continent within this of its trench has met it…
    arcCollideFullKm: 250,         // …fully within this (Timor, Taiwan): it stands along all of it, mature,…
    arcCollideWiden: 0.6,          // …this much wider…
    arcCollideWork: 1.0,           // …and raised by this much more convergence
    backArcArcKm: [120, 220],      // the arc split off: this wide (its islands — chains, or long ones as it matures)…
    backArcSeaKm: [220, 520],      // …the sea behind it this wide…
    backArcAgeMyr: [6, 30],        // …its floor at most this old (a back-arc basin, shallow for an ocean)
    backArcIslandMyr: [40, 140],   // …the arc's crust this old (a Japan matured into long islands)

    // ── G4: the continents' past, replayed (a world ~2000 Myr old; owner, 2026-11-02) ──
    pastMinAreaKm2: 1.5e6,         // a landmass smaller than this has no past of its own (a microcontinent, an island)
    // G4b: the terranes are the pieces — the cores the pieces deepest inland, the rest docked outward piece by piece
    coreAreaKm2: 12e6,             // one craton core (a piece) per this much continent…
    maxCores: 4,                   // …at most this many, at least a piece apart
    cratonRimKm: 160,              // a core piece's interior is craton: this far in from its edges…
    cratonCoastKm: 400,            // …and this far from the coast
    coreAgeMyr: [1800, 2000],      // the cores formed this long ago
    ringKm: [650, 950],            // a piece docked one ring further out per this many km from its core…
    ringStepMyr: [280, 450],       // …each ring this much younger…
    youngestRingMyr: 120,          // …never younger than this
    ringWorkKm: [250, 500],        // a piece docking: this much convergence (a Ural-type welt along its inner edge)…
    ringQuietShare: 0.3,           // …but G4d: this share of them docked quietly (a suture, no range: not a net round every piece)
    weldMyr: [700, 1400],          // two cores welding: this long ago…
    lastWeldMyr: [250, 600],       // …the last pair to meet, this recently
    weldWorkKm: [700, 1500],       // …with this much convergence
    plateauBelowMyr: 350,          // a weld younger than this raised a plateau on one side (a Himalaya, worn)
    innerWeldShare: 0.7,           // the earlier welds this share of the last one's work
    pastRateCmYr: 4,               // the past's convergence rate (the belts' width factor)
    pastCoastKm: 300,              // a past seam this near today's coast raised no welt there (a passive margin rifted
                                   // across the old belts); the swells sink toward the coast over the same distance
    pastEventMyr: 40,              // each past event lasted about this long
    wearUpliftMyr: 220,            // a past belt's broad uplift wears with this e-folding time…
    wearCrestMyr: 900,             // …its crests more slowly (old ranges linger as ridges)…
    wearRootMyr: 420,              // …its root (isostatic rebound) between
    swellMajorKm: 0.4,             // uplands along the major sutures (the worn highlands round an old range)…
    swellMajorWidthKm: 800,
    swellRingKm: 0.3,              // …lower ones along the pieces' seams (G4b: the uplands follow them)…
    swellRingWidthKm: 500,
    swellNoiseKm: 0.05,            // …broken a little by a broad noise (G4b: the seams, not the noise, shape the land)…
    swellFloorKm: 0.14,            // …over a floor; the cratons half as much (calm shields)
    // G4c: the pieces' outlines bent before the past is read from them (present/warp.js; owner, 2026-11-04: "more warped
    // and twisted … so the big plates really drive it (and the smally plates give texture to the big plates mountains)")
    dragMyr: 10,                   // today's plates carried the ground at a front this long's motion against each other…
    dragMaxKm: 350,                // …at most this far…
    dragKm: 450,                   // …fading inland with this e-folding (an orocline: old seams bent toward the front)…
    dragSmoothKm: 300,             // …smoothed over this (a front's ends shear the ground, not tear it)
    bendBroadKm: 2400,             // a slow warp at two scales: the broad one bends a seam's course (waves this long, …
    bendBroadAmpKm: 240,           // …moving it this far)…
    bendFineKm: 1100,              // …the finer one twists it
    bendFineAmpKm: 100,
    subAreaKm2: 1.6e6,             // each piece is made of smaller terranes, one per this much land…
    subMax: 4,                     // …at most this many
    subAgeMyr: [150, 1800],        // a seam between two of them is a welt this old (log-uniform; most old and worn)…
    subOlderMyr: 300,              // …at most this much older than its piece's docking…
    subWorkKm: [100, 260],         // …with this much convergence…
    swellSubKm: 0.08,              // …and a low swell along it
    swellSubWidthKm: 250,
    // G4d: along its length an old range varies (owner, 2026-11-04: "still a little wormy"): its work × pastVary over a noise
    // about pastVaryKm long (its width × 0.6–1.4 over a shorter one), and none where the noise is in its lowest pastGap —
    // a small terrane's welt pastGapSub (broken ridges)
    pastVaryKm: 550,
    pastVary: [0.4, 2.0],
    pastGap: 0.25,
    pastWidthVary: [0.5, 1.7],
    pastGapSub: 0.45,
    farPastShare: 0.5,             // …and an old collision pushed through its continent with this share of its work (its grain)
    segmentVary: 0.35,             // …and along today's ranges each terrane took up its own share of the convergence (× 0.65–1:
                                   // a range lower along some, never above what its front built)

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
    // G4d: today's fronts push through their plates (Evolution's far field, tectonics/step/far-field.js, its config's
    // shares and costs): the grain and folds the terrain draws across the interiors…
    farPushReachKm: 1500,          // …the push fading over this (e-folding, path cost; Evolution's 1100 — Generate's is today's
                                   // whole push at once, the owner's "long range impacts from the major plates")…
    farMinPushKm: 60,              // …and where it meets an old weak line square-on this hard (km taken up), far inland…
    farQuietMyr: 150,              // …quiet at least this long…
    farMinCells: 4,                // …a piece of it at least this many sim cells long…
    farRanges: 5,                  // …the strongest this many a planet are squeezed up again…
    farWorkKm: 380,                // …with up to this much shortening…
    farPushRefKm: 300,             // …(tanh of the push taken ÷ this)…
    farVaryKm: 700,                // …varying along its length over about this…
    farActiveMyr: 20,              // …rising for about this long
};
