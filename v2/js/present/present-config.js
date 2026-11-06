// The present-day world's tunables (plans/GENERATE_REDESIGN_PLAN.md): Generate's planet built as one moment of a
// believable history, its past filled in by closed forms. Physical units throughout: km, Myr, cm/yr.

// Evolution's terrain tunables Generate's present-day world draws differently (G3c): an open-ocean island arc, mature,
// stands at the sea's surface — its islands a chain (the Philippines, the Lesser Antilles) — where Evolution's stays a
// submerged ridge its volcanoes break (kept low there, so its arcs never grow huge over a long history)
import { OrogenyType, BeltSide } from '../tectonics/model/crust.js';

export const PRESENT_TERRAIN = {
    arcOceanMatureKm: -0.35,       // (Evolution's −1.5: its islands the ridge's high points, not the whole ridge)
    arcMatureKm: 0.5,              // (0.3)
    arcStraitKm: 90,               // the straits cut deeper and wider apart (35, 140): chains of islands, not ribbons
    arcIslandKm: 200,
    // M6 (owner, 2026-11-05: "not treating everything as the same age"): an old range a little LESS even along its
    // strike than a young one, not more (owner, 2026-10-28, for Evolution's ridges: "old belts should not be more even,
    // maybe it should even be slightly less" — PR #83's R1/R4, never landed in main). The rest of M6 is the past's own
    // ages and wear (present/past.js): a range's age now shows in how high it stands, as in Evolution
    oldEven: -0.1,
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
    foreArcTrenchRings: 2,         // (only where a trench's upper side lies within this many sim cells: not at a ridge, a transform)

    peakSoftKm: [8, 8.95],         // M6: summits above the first eased toward the second (present/world.js presentSynthesize)

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
    seamAgeMyr: [5, 150],          // a closing seam raised a range this long ago (log-uniform: G4d, younger than the old
                                   // orogenies — a minor plate's range stands between them and today's plate edges; M6: 30–600
                                   // until the past wore as Evolution's does, which left them as low as the old ones)…
    seamWorkKm: [220, 720],        // …with this much convergence per spread of closing (M6: 140–480 before the past wore
                                   // as Evolution's does)
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
    riftSeaMinKm: 140,             // a rift opened wider than this has pulled apart into a young sea (the Red Sea)…
    // G3f (owner, 2026-11-04: "more like the african rift valley … particularly strong ones can pull away closer to the
    // coasts"): …but only where it nears a coast — within riftSeaCoastKm of it, × its opening ÷ riftSeaMinKm (at most
    // riftSeaReachMax), widest at the coast and narrowing inland into the valley
    riftSeaCoastKm: 450,
    riftSeaReachMax: 2.2,
    riftValleyKm: [0.6, 1.6],      // inland a graben this deep under its surroundings (the Albertine and Gregory rifts)…
    riftHalfKm: [28, 55],          // …about twice this wide…
    riftGap: 0.12,                 // …broken where a noise along it is in its lowest this share…
    riftSegKm: 380,                // …its line stepping from side to side in segments about this long (en echelon)…
    riftVaryKm: 600,               // …deeper and wider, its shoulders higher and lower, over about this along it…
    riftShoulderVary: [0.4, 1.6],  // (the shoulders' work × this)
    riftDomeKm: 0.45,              // …on a broad dome about this high (× 0.5–1.5 along it; the East African plateau)…
    riftDomeWidthKm: 450,          // …this wide (σ)
    riftFloorKm: 0.08,             // (a graben's floor stays land: at least this high where the ground was above it)
    riftOpenMin: 10,               // (M2: a rift's valley where its plates open faster than this, km/Myr…
    riftOpenFull: 35,              // …full depth from this; none where its depth share is under riftLineMin: a gap, a sag)
    riftLineMin: 0.12,
    riftBreak: 0.05,               // (the valley kept where the range mask's noise is above −this: broken into basins)
    riftBorderHigh: 1.15,          // (M2: a half-graben's border-fault shoulder × this of its height, the other side's × riftBorderLow)
    riftBorderLow: 0.3,
    riftThinShare: 0.3,            // the valley's crust thinned: the old ranges' root, uplift and crests there × this
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

    // ── G5b: continents that fit (owner, 2026-11-04: "an illusion that some of these continents would have fit together like
    // a puzzle in the past"; present/fit.js) ──
    fitMinEdges: 6,                // two continent plates bordering each other at sea over this many sim edges, parting there…
    fitBasinKm: 6000,              // …have their ocean split down its midline (each cell to the nearer coast) within this…
    fitFacingExtraKm: 1500,        // …their facing coasts: within the narrowest gap + this of the other's…
    fitMinCoastCells: 6,           // …at least this many sim cells each…
    fitIterations: 12,             // …the closing rotation fitted to them (ICP, Horn's method) in this many rounds…
    fitMaxMisfitKm: 450,           // …a pair that fits no closer than this (mean km, coast to coast) keeps only its ridge…
    fitPushKm: 120,                // …and the rotation pushed this much further, so the coasts overlap more than they gap…
    fitCarveKm: 320,               // …where one's land lies on the other's within this of its coast, one side drowned to…
    fitShelfKm: -0.08,             // …a shelf: which side, by a noise read at the join, its patches about…
    fitCutKm: 500,
    fitCutSoft: 0.12,              // (eased over this much of the noise either side of the line: a slope, not a wall)
    fitGeoBandKm: 500,             // an old range or shield within this of one facing coast carries on at the other's…
    fitGeoExtendKm: 1000,          // …along its trend this far either side of the join…
    fitCoastKm: 60,                // …and on a facing coast the past's ranges and shields run to within this of it
    fitArmFitKm: 200,              // a failed rift arm at a point of the join fitting within this…
    fitArmKm: [500, 1000],         // …running this far inland

    // ── G7c: the geological record in closed form (present/record.js; Evolution's history keeps it as it goes —
    // tectonics/step/geology.js; its latitude bands and shares are that config's) ──
    recShieldExhumKm: [16, 28],    // a shield worn this deep (each its own): granite-gneiss, granulite
    // (the rest of the old crust worn as the history's start world is: tectonics/config.js geology.beltExhumKm, 6–16 km)
    recUplandWearKm: 8,            // …the uplands' (the swells') worn deeper still since, up to this…
    recPastExhumKm: [5, 36],       // an old belt's core worn deeper since it rose, from the first depth when young to the second…
    recExhumMyr: 600,              // …e-folding with its age (a Ural ~300 Myr: slate and schist; a Grenville ~1000: gneiss)…
    recBeltOuterWear: 0.35,        // …its outer zone this share as deep…
    recExhumMaxKm: 60,             // …and no place deeper than this in all
    recLiveExhumPerKm: 2.2,        // a live belt's core worn this many km per km it stands (crests + uplift)…
    recLiveExhumMaxKm: 14,         // …at most this (the Himalaya's crystalline core)
    recCoreU: [0.08, 0.35],        // across a belt (0 its front, 1 its far edge): its core stripped to the basement, its outer zone keeps its cover
    recStripKm: 6,                 // (a core worn deeper than this keeps a little less of its outer cover)
    recSwellKm: [0.12, 0.45],      // the platform's cover by its swell: thickest at the first height (a basin), thinnest at the second…
    recPlatformKm: [0.25, 2.5],    // …this thick at most (in the start world's sags: tectonics/config.js geology.platformNoiseKm…)…
    recCoverVary: 0.35,            // …× 1 ± this (a noise ~900 km)
    recShieldBare: 0.8,            // a shield bared where a noise (~1100 km) passes 0 less this (and less in a basin)…
    recShieldPatchKm: 1100,
    recShieldCover: 0.35,          // …elsewhere a thin platform over it, this share of the platform's
    recShelfKm: 220,               // a passive margin's coastal plain and shelf wedge: e-folding inland…
    recShelfCoverKm: 3,            // …this thick at the coast…
    recShelfHighKm: 0.6,           // …where the land is low (none on ground this high)
    recActiveCoastKm: 400,         // (a coast within this of a live range or arc is no passive margin)
    recRiftKm: 150,                // a rift's basin: its valley, its failed arms, the old parting seams, e-folding over this…
    recRiftCoverKm: 3.5,           // …this thick…
    recMarginKm: 180,              // …and along a passive margin (where an ocean opened), e-folding inland over this…
    recMarginPatchKm: 900,         // …in stretches (a noise this size) along about this share of it (the rest under the
    recMarginShare: 0.85,          // shelf that followed, or lifted on the rift's shoulder)
    recForelandKm: 4,              // a live range's foreland basin this thick at its foot (the Ganges plain's ~5 km)…
    recForelandWearMyr: 900,       // …a past range's, as much worn since, e-folding with the range's age
    recSeaStand: 0.6,              // the sea's mean stand through the history (step/geology.js: 0 lowest … 1 highest; along
                                   // the shelves ± a noise)…
    recSeaStandHigh: 0.85,         // …and when the inland seas spread (they come at the high stands)
    recCoverWearKmPerMyr: 0.018,   // the cover worn off land above the sea since it last sank, at most this fast (on the
    recCoverWearLow: 0.25,         // swells; in a basin this share as fast)…
    recCoverExposedMyr: 300,       // …land no inland sea reached exposed at least this long
    recParalicCoal: 0.35,          // a passive margin's coastal plain: its swamps' coal this share of a foreland's
    recFloodMyr: 220,              // the low interiors under inland seas at the high stands, up to this long…
    recFloodFromKm: 0.8,           // …none where a belt raised the ground this much…
    recFloodCoastKm: 300,
    recFloodAgoMyr: [0, 420],      // …last this long ago (a noise, squared: most of them lately)
    recDriftDeg: 12,               // the latitude the cover lay at: today's ± this (the continents drifted)…
    recOldDriftDeg: 35,            // …the oldest platform's, ± this
    recArcMaxMyr: 150,             // an arc's own crust in a live arc this long at most
    recAccretedArcShare: 0.3,      // this share of the docked pieces came as island arcs (was 0.3, then 0.45: below)…
    recAccretedArcMyr: [30, 200],  // …each this long in one (its own draw), until it docked…
    recAccretedCover: 0.02,        // …its platform's cover this share…
    recArcCover: 0.01,             // an arc's own crust (a split-off arc, an arc at sea grown into land): its cover this share…
    recArcBandU: [0.6, 0.9],       // …and across a live Andean belt, its volcanic arc's (to about here; geology arcFront)
    recAccretedExhumKm: [0.2, 3],  // …worn this deep (its volcanic pile bared to its plutons in places)
    // (U1, 2026-11-04: the docked arcs were 30 % of the docked pieces, worn 1–7 km, the arcs' cover 0.05 over a band to
    // [0.45, 0.65]: 2.3 % of the default planets' land volcanic once Evolution's finish laid its dunes, loess and till over
    // Generate's ground — Evolution's bound, Earth's, is ≥ 3 %; now 2.9 %, the arcs less worn and nearly half the docked
    // pieces arcs, as many of the North American Cordillera's were. More arcs bring their copper too: at 60 % copper
    // passed a third of iron, Evolution's other bound. M2, 2026-11-05: the reshaped ranges — spines, blocks, slivers —
    // bare more of the docked arcs' rock, so 45 % → 36 %: the supercontinent's copper back under a third of its iron
    // (16.3 % → 12.6 %), the default planets' volcanic 3.2 %)
    recBeltThicken: 0.6,           // a belt's outer zone's cover thickened by this share (its sheets thrust over one another:
                                   // step/geology.js thickenCover, × 1 + the crust's thickening ÷ 35 km)
    recSlabChangeShare: 0.45,
    recOldLipCount: [2, 5],        // old flood basalts (records only: a long history's plume heads), this many on a planet…
    recOldLipAgeMyr: [250, 1500],  // …this long ago…
    recOldLipAreaKm2: [0.3e6, 2e6],   // …this big (log-uniform)…
    recOldLipWornShare: [0.45, 1],  // …worn this share of the way to their feeders…
    recOldLipCoastKm: 300,         // …centred this far inland at least
    recOldArcKm: 800,              // an Andean margin's older arcs inland of its live one, out to this far…
    recOldArcShare: 0.75,          // …in stretches (a noise ~700 km) along this share of it…
    recOldArcMyrPerKm: 0.25,       // …each dead the longer the further in (the arc swept trenchward this fast: 4 km a Myr)…
    recOldArcWearKmPerMyr: 0.03,   // …and worn since it died this fast (its volcanics near, its batholiths further in)      // this share of the live arcs saw their slab flatten or steepen (each its own draw)
    recOphioliteAbove: 0.3,        // ophiolite slivers along the sutures where a noise (~600 km) passes this
    recBeltShelfAbove: -0.1,       // a collision belt's folded shelves (the sea it closed) where a noise (~1100 km) passes this
    recOphioliteKm: 600,
    riverQPerKm2: 0.015,           // a river's discharge (m³/s) per km² of its (rain-weighted) drainage: ~470 mm/yr of runoff (the rocks' river plains, the food's water)

    // ── G4: the continents' past, replayed (a world ~2000 Myr old; owner, 2026-11-02) ──
    pastMinAreaKm2: 1.5e6,         // a landmass smaller than this has no past of its own (a microcontinent, an island)
    // G4b: the terranes are the pieces — the cores the pieces deepest inland, the rest docked outward piece by piece
    coreAreaKm2: 12e6,             // one craton core (a piece) per this much continent…
    maxCores: 4,                   // …at most this many, at least a piece apart
    cratonRimKm: 160,              // a core piece's interior is craton: this far in from its edges…
    cratonCoastKm: 400,            // …and this far from the coast
    coreAgeMyr: [1800, 2000],      // the cores formed this long ago
    ringKm: [650, 950],            // a piece docked one ring further out per this many km from its core…
    // …the rings spanning the history from the core's age to the outermost's (M6: before, each ring 280–450 Myr younger
    // than the last, never under 120 — most of the land's ranges 300–1500 Myr old together)…
    outerRingMyr: [40, 300],       // …the outermost docked this recently (a Cordillera's terranes: 50–200 Myr)…
    ringAgePow: 0.6,               // …the rings between younger the further out, by (ring ÷ outermost)^this
    youngestRingMyr: 120,          // (a piece no core reached, a microcontinent: one young terrane this old)
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
    // a past belt wears as Evolution's history wears it (its uplift, root and crests each on the terrain config's clock,
    // faster the higher it stands: present/past.js wear — M6), in steps of at most this long (220, 900 and 420 Myr of its
    // own until 2026-11-05: every upland one age)
    wearStepMyr: 20,
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
    subAgeMyr: [40, 1800],         // a seam between two of them is a welt this old (log-uniform; M6: from 40, not 150 — the
                                   // history's ages spread as Evolution's, not most of them 250–1000 Myr together)…
    subOlderMyr: 300,              // …at most this much older than its piece's docking…
    subWorkKm: [100, 260],         // …with this much convergence…
    swellSubKm: 0.08,              // …and a low swell along it
    swellSubWidthKm: 250,
    // M1–M2 (present/ranges.js; owner, 2026-11-05: the ranges were "worm like … they all look the same and have no
    // variety"; of a first answer that smoothed every range into one lens, "all the shapes … got way way more uniform"; of
    // two takes after it — A, ranges on their own outlines; B, wider and carved harder into massifs — "lets just go with
    // fully B!"):
    // a past range keeps its pieces' outline, lightly smoothed, but swells, pinches, rises and falls along it by noises of
    // its own, and the range mask carves it into massifs, lobes and spurs (the original Generate's way: mountains a noise
    // field cut out of the tectonic one); each written as its style's kind of belt (Evolution's)
    rangeStepKm: 25,               // (the curve's points this far apart)
    rangeMinKm: 320,               // a range whose curve is shorter than this is none…
    rangeKnotMinKm: 150,           // …but a knot
    rangeCoastKm: 150,             // a seam's range keeps this far from the coast (the past's other ranges pastCoastKm)
    // the shape every range takes (its style's own fields over it): its outline smoothed by a Gaussian of smoothMinKm (or
    // smooth × its width, or smoothShare × its length, the most); segKm past any range's length, so one piece, overlap,
    // echelonDeg, offset, gap, bow, strength and massif its segments' (none here: a rift's are — riftShape); its width ×
    // segWidth, tapering at its ends to tipWidth (× sin^lensPow), its work to 0 (× sin^workPow), its height to tipAmp
    // (× sin^ampPow); along it its width × e^(±2·widthNoise) and its height × 1 ± 2·ampNoise, over noises about widthNoiseKm
    // and ampNoiseKm long (B; A was × 1.6, 0.55 over 650 and 420 km); its height multiplier (its style's roll × the lens × the
    // swell) eased from ampKnee toward ampMax: the swells stack, a peak stays possible (a live range — the far field's —
    // isn't worn down: unchecked it stood 10 km)
    rangeShape: { smoothMinKm: 90, smoothShare: 0, smooth: 0.25, segKm: [1e5, 1e5], overlap: 0, echelonDeg: [0, 0], offset: 0, gap: 0, bow: 0,
        strength: [1, 1], massif: 1, segWidth: [2.4, 2.4], tipWidth: 0.35, lensPow: 0.4, workPow: 0.3, tipAmp: 0.3, ampPow: 0.5,
        widthNoise: 0.7, widthNoiseKm: 500, ampNoise: 0.7, ampNoiseKm: 320, ampKnee: 1.4, ampMax: 2.0 },
    // the range mask (ranges.js maskBelt): what a belt adds × smooth((v − threshold) / soft + ½) × (1 + boost · max(0, v)), v a
    // fractal waveKm across (octaves; domain-warped by warpKm over warpWaveKm), the threshold `near` at the range's line,
    // rising to `far` at its edge — so near its line most of the range stands, toward its edge only where the noise is high,
    // the highest swelling past it (B; A was 700, 1200, 250, 4, −0.6, 0.5, 0.5, 0.5: softer, more of each range kept); where
    // under `drop` of it is left, no belt at all (its record undone: the rocks follow the mountains); its boost eased from
    // kKnee toward kMax
    rangeMask: { waveKm: 520, warpWaveKm: 900, warpKm: 320, octaves: 5, near: -0.25, far: 0.35, soft: 0.35, boost: 0.9, drop: 0.15, kKnee: 1.15, kMax: 1.5 },
    // the styles: type, the kind of belt (Evolution's: its cross-section, ridges, rock), or sides, a suture's two sides each
    // its own kind ([type, side, width share], the upper first); width, work, amp: the range's width (its kind's, from its
    // work), its convergence and its height × these
    rangeStyles: {
        // one high spine, a long slope on one side and a short steep one on the other (the Alps, the Caucasus, the Pyrenees)
        spine: { sides: [[OrogenyType.URAL, BeltSide.NONE, 1], [OrogenyType.URAL, BeltSide.NONE, 0.35]], width: [1.1, 1.7], work: [1.0, 1.5], amp: [1.3, 1.9] },
        // a plateau behind a rim range, the high range of the side thrust under before it (Tibet, the Altiplano, Anatolia)
        plateau: { sides: [[OrogenyType.HIMALAYAN, BeltSide.UPPER, 1], [OrogenyType.HIMALAYAN, BeltSide.LOWER, 0.55]], width: [1.8, 2.6], work: [1.0, 1.4], amp: [0.95, 1.2] },
        // a broad fold belt: parallel ridges and valleys (the Appalachians' Valley and Ridge, the Zagros)
        folds: { type: OrogenyType.URAL, width: [1.4, 2.3], work: [0.7, 1.1], amp: [0.75, 1.15] },
        // basement-cored blocks, basins between (the Tian Shan, the Laramide ranges)
        blocks: { type: OrogenyType.INTRAPLATE, width: [0.55, 0.9], work: [0.6, 1.0], amp: [0.7, 1.3] },
        // a narrow ridge along an oblique seam, its ridges en echelon (the Transverse Ranges, the Southern Alps)
        sliver: { type: OrogenyType.TRANSPRESSION, width: [0.5, 0.9], work: [0.8, 1.2], amp: [0.8, 1.2] },
        // a knot of short ridges round a massif (the Massif Central, the Hoggar's ranges)
        knots: { type: OrogenyType.URAL, width: [0.7, 1.1], work: [0.8, 1.2], amp: [0.75, 1.25] },
        // the far field's: an old line squeezed up again far inland, live (never worn), as basement blocks lower than a
        // collision's (the Tian Shan, ~7 km at most)
        far: { type: OrogenyType.INTRAPLATE, width: [1, 1], work: [1, 1], amp: [0.55, 0.85] },
    },
    // a rift (present/belts.js; its own shape, not rangeShape): its valley in basins stepped en echelon, each deepest toward
    // its middle, an accommodation zone between (the East African rift's), its shoulders beside them; segKm, overlap
    // (negative: apart), echelonDeg (each turned about its middle), offset (set off sideways × its width), gap (this share
    // left out), bow, segWidth and strength (each segment's width and depth), massif (one segment's); width: its shoulders'
    // reach × this, work: the valley's depth share
    riftShape: { type: OrogenyType.RIFT, smoothMinKm: 200, smoothShare: 0.03, smooth: 0.5, width: [1, 1], work: [1, 1], amp: [1, 1],
        segKm: [200, 600], overlap: 0.0, echelonDeg: [4, 12], offset: 0.2, gap: 0.32, bow: 0.04, segWidth: [0.7, 1.2], strength: [0.5, 1.0],
        massif: 1.0, tipWidth: 0.3, lensPow: 0.7, workPow: 0.6, tipAmp: 0.2, ampPow: 0.7 },
    // each kind of past range's styles (weights): a young weld of two cores is a plateau or a spine; an old one, and a piece
    // docking, most often a fold belt; two pieces of one plate closing, any; a small terrane's welt, blocks and knots
    rangeStyleWeights: {
        weldYoung: { plateau: 0.55, spine: 0.45 },
        weld: { spine: 0.35, folds: 0.45, blocks: 0.2 },
        ring: { folds: 0.4, spine: 0.2, blocks: 0.2, sliver: 0.1, knots: 0.1 },
        seam: { spine: 0.3, blocks: 0.3, sliver: 0.2, folds: 0.1, knots: 0.1 },
        sub: { blocks: 0.45, knots: 0.35, folds: 0.2 },
    },
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
