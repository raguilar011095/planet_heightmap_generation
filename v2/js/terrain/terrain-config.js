// Tunable constants of terrain synthesis (Phase 8). Everything is in kilometres and Myr, never in cells, so the
// same planet comes out at any terrain resolution — a finer mesh shows more detail, not a different world.
// Heights are km above sea level.

import { OrogenyType } from '../tectonics/model/crust.js';

export const TERRAIN = {
    // ── Carrying the sim's records onto a finer mesh ──
    warpKm: 70,                 // lookup positions are displaced by up to this (smooth noise), so the sim's 121 km cells never show
    warpScale: 4,               // noise frequency of that warp on the unit sphere (≈ 1500 km features, plus finer octaves)
    // a second warp at the sim's own scale (developer: "its also very common on the grids where mountains form and sort of
    // 'take up' the whole grid cell … more flexibility and noise at that scale"): waves of cellWarpCells sim cells (and
    // half that), moving every lookup by up to cellWarp of a sim cell's edge — belts, plateaus, coasts and craton edges
    // bent at the scale of the cells they came from, not only in the large. In sim cells, so 20K plates get as much as 80K.
    // Read in the frame of the plate under the point (it rides with the crust: the same bends at the same place on a
    // continent, frame after frame) and fixed there (it does not renew).
    cellWarp: 0.35,
    cellWarpCells: 3,

    // ── Coasts ──
    coastNoiseKm: 45,           // the coast is moved in and out by up to this, at 200–1500 km scales: bays and headlands
    // curved coasts (developer: "at high terrain detail the coast can look a bit polygonal, especially on island arcs"):
    // the coast distance is read with each sim cell's slope, so its lines curve between the sim cells as the coast they
    // measure does instead of running straight across every sim triangle (1: fully; 0: straight, as before)
    coastCurve: 1,
    // the coast's fine detail: octaves below the coast noise, from coastDetailFromKm down to what the terrain mesh can show
    // (none at 160K; coves, headlands and islets at 640K and 2.5M), each coastDetailRoughness of the one before
    coastDetailKm: 7,           // amplitude of the first (km of coast distance: how far it moves the coast in and out) (14 went a little too far — developer)
    coastDetailFromKm: 88,      // its wavelength
    coastDetailRoughness: 0.6,  // (a coast's fractal roughness: finer wiggles relatively larger than a smooth curve's)
    // the coast at the sim's own scale (synthesize.js): the coast moved in and out by up to this share of a sim cell…
    coastCellNoise: 0.5,
    coastCellWaveCells: 2.5,    // …in waves of this many sim cells and finer octaves — the lobes a coast read over the cells makes, broken…
    coastFreshFloor: 0.3,       // …down to this share on a fresh coast (a young rift's sides still fit; a fresh belt's shape leads)…
    coastFreshMyr: 60,          // …a belt counting as fresh for about this long after it was last active (a rift: by its margin's maturity)
    // mountain shape (developer: "i want to see what we cook up"): the evolved uplift and the platform read with each sim
    // cell's slope, as the coast distance is — curved slopes instead of a flat facet per sim triangle — each corner's
    // reading kept within the range of its cell and its neighbours (no overshoot at a steep front); 1: fully, 0: as before
    mountainCurve: 1,
    // the belts' crests read at the distance across the belt that the ridge kernels carry (stripes.js crossAt — it bends
    // with the front) rather than one interpolated straight across the sim triangles (its crest lines zig-zagged from cell
    // to cell); 1: fully where the kernels cover the point, 0: as before
    crestFollow: 1,
    // a belt's width, crest height and age read the same way — blended over its kernels — rather than over the sim triangles,
    // whose cell-to-cell steps lobed a range's edges, bent its crests into crescents and made blobs of crest height at
    // 20K–40K (developer, 2026-10-18: "realistic shaping … leading ridges and edges"); 1: fully, 0: as before
    beltCarry: 1,
    // the evolved uplift's SHAPE from the belt's profile at the point (the smooth coordinate), its height and wear from the
    // record: fronts, plateau rims and far edges on the belt's own lines, not the cells' (1: fully, 0: as before)
    envelopeCarry: 1,
    // crests rise and fall along the strike — peaks and saddles — by up to this share, at crestAlongKm and half that, read on
    // the belt's front line so nothing moves across the belt (fronts and parallel ridges keep their places)
    crestAlongVar: 0.4,
    crestAlongKm: 300,
    // hills down to what the terrain can show (developer): relief below the platform's noise (whose finest is ~250 km),
    // from hillsFromKm down to what the mesh can draw (none at 160K; 120 km at 640K; 120 and 60 km at 2.5M), each octave
    // hillsRoughness of the one before — hillsKm on the plains, up to hillsUplandGain times that on high ground (≥ 1.5 km);
    // none at the shore (the coast is not speckled). Read in the crust's frame, renewing as the other fine detail does.
    hillsKm: 0.05,
    hillsFromKm: 120,
    hillsRoughness: 0.6,
    hillsUplandGain: 4,
    // island arcs as chains of islands (developer): arc crust's land is cut into islands and straits by a noise of islands
    // arcIslandKm apart — the coast distance lowered by up to arcStraitKm where it is low — so a young, narrow arc is a
    // chain of islands with straits between (the Aleutians, the Lesser Antilles) and a mature, broad one stays long
    // islands (Japan, Java). In the crust's frame, renewing as the coast noise does.
    arcStraitKm: 35,            // (70 cut the arcs' texture away — their small islets and ragged edges; halfway keeps the chains and the texture: developer)
    arcIslandKm: 140,
    // submarine canyons (developer: a shelf edge with character; carve.js): from the mouth of each big river (drainage
    // canyonAreaKm2: none below the first, full from the second), down the shelf and the slope by the steepest way, up to
    // canyonKm: a trough canyonDepthKm deep at most — deepest across the shelf break and the upper slope — its sides half as
    // deep. Faded out where the terrain cannot draw a canyon's width (as the drowned valleys).
    canyonAreaKm2: [5000, 60000],
    canyonKm: 260,
    canyonDepthKm: 0.7,
    shelfEdgeKm: -0.15,         // depth of the shelf break, at the edge of the continental crust
    // per kind of margin (measure.js Margin): width of the continental shelf, of the low coastal plain behind the
    // shoreline, and of the slope down to the deep sea (a passive margin's shelf and plain: a mature one's; a young one's
    // are youngShelfKm and youngPlainKm — marginMatureMyr below)
    margins: {
        passive:   { shelfKm: 180, plainKm: 240, slopeKm: 110, youngShelfKm: 40, youngPlainKm: 50 },   // rifted, trailing: wide shelves, low coasts (Argentina, the US east coast)
        active:    { shelfKm: 15,  plainKm: 25,  slopeKm: 45 },    // a trench offshore: narrow shelf, the coastal range rises from the sea
        transform: { shelfKm: 30,  plainKm: 50,  slopeKm: 50 },
        collision: { shelfKm: 40,  plainKm: 80,  slopeKm: 80 },
        arc:       { shelfKm: 5,   plainKm: 15,  slopeKm: 40 },    // island arcs: steep volcanic flanks
    },
    shelfNoise: 0.45,           // shelves vary in width by ± this share along the coast
    pocketSeaKm2: 50000,        // a pocket of ocean crust trapped in the land smaller than this is a lowland, not a sea (a
                                // one-cell sliver would otherwise stand as a deep hole ringed by drowned shelf)
    coastKindKm: 250,           // a margin's kind holds along its stretch of coast: a bay or a headland's flank within this
                                // many km (along the coast) of an active / transform / collision coast is one too
    // Passive margins flatten and widen as they age (developer, 2026-10-15: "after a while of no tectonic activity they
    // should flatten/widen and create a bit of a bigger shelf, as things erode"). A margin's age: the oldest ocean floor
    // beside its coast — the floor that formed as it broke away — or less where its own belt was active since. A stretched
    // margin subsides as it cools and fills with sediment, e-folding over about this (McKenzie 1978: ~60 Myr); its
    // maturity, 1 − e^(−age / this), widens the shelf and the coastal plain from the young widths to the mature ones and
    // buries the relief under them by that share — a young rifted margin's shoulders stand at the sea (the Red Sea), an
    // old one's lie well inland, worn and lowered, behind a wide shelf and a low coastal plain (the US east coast)
    marginMatureMyr: 60,
    marginOpenSeaKm2: [1e6, 4e6],   // …its shelf widening only on the open ocean: a sea enclosed by land smaller than the first
                                // (km²; fully open from the second) fills with sediment from its rim (the North Caspian's
                                // shelf builds out into it) — its rim matures into a lowland, but no shelf drowns it

    // ── Continental platform ──
    continentKm: 0.12,          // unthickened continental crust: lowland platforms and plains
    cratonKm: 0.28,             // shields: low, flat, stable
    // ── Cratons against the ranges, and their look (Phase 10; terrain/cratons.js — the research is in the roadmap) ──
    cratonBlendKm: 60,          // a shield's platform blends into its neighbours over ± this across its edge line…
    cratonEdgeNoiseKm: 45,      // …the line moved in and out by up to about this (the shield's own bays and promontories —
                                // small: the history's craton is already a fragment with its own edges, plans/V2_START_WORLD_PLAN.md)
    cratonScrapKm: 110,         // a craton patch whose deepest point is less than about this from its edge is a scrap: it reads
                                // as what surrounds it (no flat, stair-edged hole in a range)
    cratonRimInKm: 10,          // a range pressed against a shield fades across its rim, from this far in…
    cratonRimOutKm: 120,        // …to nothing here (the history's thin-skinned belt: tectonics config cratonRimKm; the
                                // sub-Andean zone is 50–100 km wide)
    foredeepPerKm: 0.12,        // the foreland a range bends into a shield: a lowland this much below the shield per km of the
                                // range's height (flexure is linear in the load; the Ganges plain lies ~0.3 km below the Indian
                                // shield, the Chaco ~0.5 km below the Brazilian — filled with sediment: a plain, not a trough)…
    foredeepMaxKm: 0.3,         // …at most this…
    forelandFromKm: 100,        // …deepest this far in from the edge line (in front of the rim's thrusts)…
    forelandAlphaKm: 110,       // …over a stiff plate's flexural length: the foredeep ~πα/2 wide beyond that, the forebulge's
                                // crest ~3πα/4 (a craton's elastic thickness, 80–90 km, gives wide, shallow forelands)
    forebulgeGain: 3,           // the forebulge, this many times the thin elastic plate's (tens of metres)
    forelandByKind: {           // how much a front of each kind loads the shield beside it (0: none)
        [OrogenyType.ANDEAN]: 1, [OrogenyType.HIMALAYAN]: 1, [OrogenyType.URAL]: 1, [OrogenyType.LARAMIDE]: 0.6,
        [OrogenyType.TRANSPRESSION]: 0.5, [OrogenyType.ARC]: 0.3, [OrogenyType.RIFT]: 0, [OrogenyType.INTRAPLATE]: 0.6,
    },
    forelandUpperPlate: 0.15,   // …× this where a collision's UPPER plate — its plateau's back — meets the block: a steep front
                                // with little foreland (the Longmen Shan against the Sichuan Basin)
    cratonCharacter: 1,         // how strongly the shields show their characters (developer: "in between"; a lab slider)
    cratonSwellKm: 0.45,        // a swell rises up to this above the shield's edge (× 0.7–1.3 per craton; the Kalahari's
                                // ~1 km would be bold)…
    cratonSagKm: 0.2,           // …a sag basin's floor lies this much below it (the Congo, Hudson Bay)…
    cratonFlatKm: 0.08,         // …a flat shield only undulates by this
    cratonShapeKm: 900,         // (the scale of the noise that makes a swell or a sag irregular)
    cratonGrainKm: 0.06,        // a grain of domes and keels (granite domes between greenstone belts), this high…
    cratonGrainScaleKm: 90,     // …its domes about this far apart (faded where the mesh cannot show them)…
    cratonGrainStretch: 4,      // …drawn out along the craton's length this many times (greenstone belts; plans/V2_START_WORLD_PLAN.md S4)
    // ── The far field in the terrain (tectonics/step/far-field.js; plans/V2_FAR_FIELD_PLAN.md F3–F4) ──
    // Read across the fronts that pushed the crust: records.js farPhase, how far the push came, its level lines along the
    // fronts (an average over the pushes, so it holds still while a front keeps pushing: the folds and the grain ride with
    // the crust from frame to frame).
    // The lithosphere's folds: broad, low swells and basins across a recent push, their crests along the front
    // (Central Asia, the Central Indian Ocean: Burov et al. 1993, Cloetingh & Burov 2011). Subtle (developer).
    farFoldKm: 0.12,            // up to this high (± about the platform)…
    farFoldWavelengthKm: 320,   // …this far apart across the push (lithospheric folds: 200–600 km; over a craton further, as
                                // the push crosses it with little loss — the phase changes slowly there: a stiff plate's)…
    farFoldStretch: 4,          // …drawn out along the front this many times…
    farFoldWander: 0.4,         // …the bands wandering by up to this many wavelengths' phase…
    farFoldWanderKm: 700,       // …over features this big (not rings round a short front like ripples round a stone)…
    farFoldWorkKm: 150,         // …brought up by the push taken up lately: 1 − e^(−push ÷ this)
    // The grain a push leaves: what noise draws on the platform (its basins and arches) and the start world's swells is
    // drawn out along the fronts that pushed it — combed, not blotchy (the Appalachian Valley and Ridge at continent scale)
    farGrainStretch: 4,         // up to this many times longer along the front than across it…
    farGrainOctaves: 2,         // …over this many of the platform noise's 4 octaves, broadest first; the finer stay as they
                                // were (drawn out too, they shift the small rivers from frame to frame — Phase 9: 4 failed
                                // its 290→300 Myr rivers check — for a grain hardly stronger)…
    farGrainWorkKm: 200,        // …as strongly as 1 − e^(−push taken up in all ÷ this): the drawn-out noise fades in as it
                                // grows (a stronger push changes how much of it there is, never where it lies)…
    farCratonTakeTerrain: 0.15, // …what a craton takes up of the push reaching it (tectonics config farCratonTake)…
    farWeakTakeTerrain: 1.6,    // …and a weak line (farWeakTake)
    platformNoiseKm: 0.16,      // broad basins and arches (the Michigan basin, the Ozark dome), 400–2000 km across
    // The first continents are not flat (developer, 8b round 5: "start the baseline with some large noise … that can erode
    // over time and direct rivers more consistently"): broad swells and the lowlands between them, a record of the crust
    // (baseKm, step/heights.js) that rides with it, wears down like any relief and steers the history's rivers. Crust made
    // later starts flat. (Changing these re-runs the history in the lab.)
    baseReliefKm: 0.8,          // the swells stand up to this high at the start…
    baseReliefScaleKm: 2500,    // …the largest this many km across (then halves and quarters of it)…
    baseReliefTauMyr: 200,      // …and wear away over this e-folding time (at erosionHeight.refKm, like the uplift)
    baseReliefCraton: 0.5,      // a shield rises this share as high (cold, thick and stiff: the flattest ground there is)
    // …placed, in a generated start world, by its assembly (plans/V2_START_WORLD_PLAN.md S4; step/heights.js seedBaseRelief):
    baseSeamShare: 0.75,        // uplands along the major seams, this share of the full height…
    baseSeamKm: 900,            // …fading over this distance from them (a highland round the old range)…
    baseRingShare: 0.35,        // …and along the young accreted belts, this share…
    baseRingKm: 500,            // …over this…
    baseFloor: 0.1,             // …the ground away from them this much lower (the lowlands and interior basins)…
    baseNoiseShare: 1.15,       // …all broken up by the swell noise at this share of its strength alone
    // Airy isostasy: thickened crust floats higher, with diminishing returns (a 35 km thicker crust stands ~5 km: Tibet)
    isoMaxKm: 6,
    isoScaleKm: 30,             // (≈ 0.17 km of height per km of extra crust at first; 35 km → 4.2 km, before the belt's relief)
    thickTauMyr: 70,            // once a belt falls quiet, its root is eroded and rebounds away over this e-folding time
    swellKm: 0.28,              // broad uplift over mantle hotter than the land's average (the African superswell): × the
                                // excess of mantleHeat² over its mean under the land (records.js). (Developer, 8b round 6:
                                // relative and a bit smaller — heat tends to 1 under any continent that sits still, so an
                                // absolute swell, 0.35 × heat², lifted most land by most of it: land below 400 m 45 % → 24 %.)
    lipLandKm: 0.75,            // flood basalt on land: this much height per km of basalt (8b round 6: 0.6 → 0.75 — Putorana
                                // stands ~1.5 km, the Western Ghats 1–1.6)
    lipSeaKm: 1.4,              // an oceanic plateau (Ontong Java) rises this much per km of basalt
    lipMaxKm: 2.5,              // (only this much of a pile counts: where a hotspot track crossed a LIP the record holds the edifice)
    lipSeaSmoothKm: 150,        // …one broad rise: smoothed over this (holes filled, flanks sloping), never lowered inside
    // Flood basalts on land are cut up as they wear, not ground flat (developer, 8b round 6; terrain/lips.js): hard, they
    // last (the Drakensberg basalt ~1.4 km after 180 Myr, 0.5–1 km of it gone), as canyons, a retreating escarpment and
    // the mesas and buttes it leaves (Ethiopia's ambas), stepped wherever they are cut into ("trap": a stair)
    lipWearKmPerMyr: 0.004,     // the pile wears this fast (× the erosion of the latitude; re-runs the history): the cap is
                                // stripped as the wear goes through the pile — a thin edge first, the thick middle last…
    // …and cut up along its drainage (carve.js stripBasalt; developer, 2026-09-29: a mesa noise was "super blotchy"): its
    // escarpment retreats from the province's edge, its rivers' valleys widen through it, the cap left on the divides —
    // a dissected plateau (the Deccan), then mesas along the divides (Ethiopia's ambas), then remnants. Rates × the wear's
    // age, which runs with the climate's erosion (a wet province goes faster)
    lipEdgeRetreatKmPerMyr: 0.35, // the escarpment (the Western Ghats ~60–100 km in 66 Myr, the Drakensberg ~150 km in 180)…
    lipValleyKmPerMyr: 0.12,    // …a river's valley widens this fast on each side (at 10⁴ km² of drainage; ∝ drainage^0.3)…
    lipValleyAreaKm2: 3000,     // …rivers draining this much or more…
    lipIncisionMyr: 20,         // …once they have cut down through the pile (a canyon first: a young plateau stays whole)
    lipWallKm: 30,              // the cap's slopes fall over up to this, once retreated twice as far (6 made cliffed mesas — developer: "the mesa effect is way
                                // too strong … should erode down more smoothly")…
    lipWallNoise: 0.35,         // …and wander by up to this share of the escarpment's retreat (at most 40 km)…
    lipWallNoiseKm: 70,         // …in features about this big: bays, spurs and outliers
    lipWearFloor: 0.45,         // (the plateau's top lowers by up to this share as the wear goes through, and is gone once
                                // worn right through)
    lipStepKm: 0.22,            // the stair: steps about this tall (± 40 %; real flow packets are 10–100 m — these read at
                                // 15–30 km cells)…
    lipRiser: 0.35,             // …a cliff taking this share of each step, the rest a flat tread…
    lipStairShare: 0.35,        // …and the stair only this strong: a hint of benches on the slopes, not cliffed treads
    lipCliff: 2,                // canyon walls in basalt stand this many times steeper (a hard cap: cliffs, not slopes)…
    lipHardness: 0.75,          // …and its rivers cut this much slower (k × 1 − this; 0.3 until 2026-10-27: every stream cut
                                // it into hills — a hard cap lets only the big rivers cut canyons, the tops between stay flat)
    // How a flood basalt lies on the land (developer, 2026-10-27: LIPs "dont have the same profiles of real LIPs" — the
    // Deccan, Siberia, Ethiopia): its lavas level the land — a flat surface over the broad ground, ponded in the lows,
    // older hills standing through — thinning out over lipFeatherKm inside its edge (the line wandering by lipEdgeNoiseKm,
    // in lobes lipEdgeNoiseScaleKm across) instead of standing there as a wall; no hills or crags on it. 0: as before (a slab)
    lipFeatherKm: 250,
    lipEdgeNoiseKm: 40,
    lipEdgeNoiseScaleKm: 140,
    // its escarpment retreats where its edge stands above the ground beyond — from the first km (none) to the second (all;
    // the sea too): a rifted coast's Western Ghats, not every edge…
    lipEscarpDropKm: [0.2, 0.7],
    // …a river cuts down through the whole pile from the first drainage (km², none) to the second (all), its side valleys
    // leaving the divides' flat tops standing (Putorana); a cap left smaller than lipMesaMinKm2 goes (no one-cell pinnacles)
    lipValleyCutAreaKm2: [3000, 40000],
    lipMesaMinKm2: 2500,
    // …and young lava has hardly been cut: its erodibility rises from lipYoungFloor of it to all over lipYoungMyr of wear (a
    // fresh province — the Columbia River's — a plain cut only by its big rivers' canyons; older, dissected all over)
    lipYoungMyr: 40,
    lipYoungFloor: 0.15,
    lipFoldedMyr: 20,           // lavas a belt was still at work on this long after they erupted ride on its relief (folded and lifted), not levelling it
    // the plume under a young province: a dome lipSwellKm high, falling off over lipSwellReach × the province's radius,
    // subsiding over lipSwellTauMyr (Ethiopia's plateau stands 2–3 km); and shield volcanoes on its lavas near the centre
    // (Simien, Choke, Guna) up to lipShieldKm high and ~lipShieldRadiusKm across, on provinces from lipShieldMinRadiusKm
    // across (radius), worn down over lipShieldTauMyr
    lipSwellKm: 1, lipSwellReach: 1.2, lipSwellTauMyr: 60,
    lipShieldKm: 1.6, lipShieldRadiusKm: 70, lipShieldMinRadiusKm: 450, lipShieldTauMyr: 80,
    dykeKm: 0.15,               // the radiating dyke swarm: a grain ± this high…
    dykeAcrossKm: 90,           // …its highs this far apart where they leave the province (fanning out beyond)…
    dykeAlongKm: 500,           // …each running about this far along its ray…
    dykeReach: 2.2,             // …out to this many times the province’s radius (developer: "slightly too large" — 2.5 → 1.9;
                                // then "we lost too much … somewhere in the middle": reach, waver, fans and fade-in halfway)…
    dykeWanderKm: 22,           // …wavering sideways by about this much as it runs (developer: "too straight and perfect")…
    dykeInKm: 150,              // …coming out from under the lava this far inside its edge…
    dykeOutKm: 120,             // …and reaching full strength this far outside it (developer: "no transition")
    // The land's floor (developer, 2026-10-27: a push down "making the land floor at 0 … we cant have it just be that, it
    // needs noise on top of it … or we can maybe soft floor"): where a push down would take land under the sea — a valley
    // between crests, a failed arm's sag, a fold's trough, the massif's lows, a dyke's — it eases into a floor instead of
    // stopping dead on it (a flat sheet at 20–30 m): unchanged until within landFloorSoftKm of it, then e-folding toward it.
    // And the floor is low, rough country, not a sheet: it rolls above landFloorKm by up to landFloorRollKm, plus up to
    // landFloorDeepKm more where the push would have gone landFloorDeepAtKm or more under the sea — in features from
    // landFloorScaleKm across down to what the mesh can show, each octave landFloorRoughness of the one before
    landFloorKm: 0.02,
    landFloorRollKm: 0.1,
    landFloorDeepKm: 0.22,
    landFloorDeepAtKm: 0.3,
    landFloorScaleKm: 240,
    landFloorRoughness: 0.6,
    landFloorSoftKm: 0.1,
    failedArmKm: 0.4,           // a failed rift arm (aulacogen) is a sagged, sediment-filled corridor this much lower…
    failedArmHalfKm: 45,        // …about twice this wide — low land, not sea (the Benue trough, the Reelfoot rift)

    // ── Island arcs ──
    arcYoungKm: -2.0,           // the ridge an arc stands on, when young: under water, only its volcanoes break the surface
    arcMatureKm: 0.3,           // …and when mature: continuous land (Japan) — near a continent (within arcCoastKm);
    arcOceanMatureKm: -1.5,     // out in the open ocean (arcOceanKm or more from any continent) it stays a submerged ridge its
    arcCoastKm: 300,            // volcanoes break through (the Marianas, Tonga); between, a smooth blend
    arcOceanKm: 1000,
    arcMatureMyr: 150,          // (a Mariana, ~50 Myr old, is still mostly under water: islands on a submarine ridge)
    arcUpliftShare: 0.25,       // a subduction belt's broad uplift counts this much on arc crust (its maturity gives the rest)
    foreArcIsleKm: 0.2,         // a fore-arc island (step/margin-isles.js): low

    // ── Oceans ──
    fabricPeriodMyr: 2,         // abyssal hills run along the isochrons, one every this much crust age
    fabricKm: 0.12,             // their height on young floor…
    fabricOldKm: 0.03,          // …and on old floor, buried in sediment
    fabricTauMyr: 60,
    trenchKm: 2.4,              // a trench is this much deeper than the floor beside it (under an old slab; a young one 60 %)
    trenchHalfKm: 55,           // its half-width
    riseKm: 0.35,               // the outer rise on the subducting plate, this high…
    riseAtKm: 160,              // …this far from the trench axis
    // ridge segments and fracture zones (records.js; tectonics/model/segments.js)
    fractureOffsetMyr: 12,      // each segment's floor reads this much older or younger at most: the ridge and isochrons step
    fractureTroughKm: 0.7,      // a fracture zone's trough, this deep…
    fractureHalfKm: 30,         // …and this wide either side of the boundary
    fractureSmoothKm: 200,      // (the coordinate smoothed over this: the spreading poles drift between rows)

    anchorRecords: true,        // read the records over each plate's own raster (Phase 9: steady detail); false = the fixed
                                // world grid, as before (kept for comparisons)

    // ── Mountain belts: relief on top of the isostatic platform (profiles.js lays out the cross-sections) ──
    reliefKm: {                 // crest height of each kind of belt when mature and active
        [OrogenyType.ANDEAN]: 3.4, [OrogenyType.LARAMIDE]: 1.5, [OrogenyType.URAL]: 1.7, [OrogenyType.HIMALAYAN]: 3.2,
        [OrogenyType.ARC]: 0.8, [OrogenyType.RIFT]: 1.4, [OrogenyType.TRANSPRESSION]: 1.9, [OrogenyType.INTRAPLATE]: 3.0,
    },
    fullReachKm: {              // a belt this wide counts as mature (a young one is narrower and lower)
        [OrogenyType.ANDEAN]: 450, [OrogenyType.LARAMIDE]: 900, [OrogenyType.URAL]: 250, [OrogenyType.HIMALAYAN]: 900,
        [OrogenyType.ARC]: 200, [OrogenyType.RIFT]: 220, [OrogenyType.TRANSPRESSION]: 80, [OrogenyType.INTRAPLATE]: 300,
    },
    youngShare: 0.55,           // a belt just begun stands at this share of a mature one's relief (a young arc like the Cascades: 3–4 km with its volcanoes)
    // ── Heights evolving through the history (tectonics/step/heights.js) ── every rate below is × the erosion factor of
    // the latitude the crust is at, step by step. (Changing these re-runs the history in the lab.)
    upliftBuildKm: {            // an active belt builds its uplift and ruggedness toward their targets, e-folding every this
                                // many km its front absorbs (Andean fronts count 12 % of the slab — andeanWorkShare — so
                                // theirs is shorter; rifts and accretions build theirs at once)
        [OrogenyType.ANDEAN]: 20, [OrogenyType.LARAMIDE]: 20, [OrogenyType.URAL]: 30, [OrogenyType.HIMALAYAN]: 50,
        [OrogenyType.ARC]: 20, [OrogenyType.RIFT]: 1, [OrogenyType.TRANSPRESSION]: 30, [OrogenyType.INTRAPLATE]: 15,
    },
    // (developer, round 4: erosion here a little slower overall — 8b's rivers cut down more, and the two should balance;
    // then, after Phase 13, "a ton of the land is above 400m": over 600–1200 Myr only 18–26 % of land was below 400 m
    // (Earth ~45–50 %) — 178 → 100 and thickTauMyr 135 → 70 with the floor below, and narrower Andean and plateau belts
    // (tectonics/config.js belts): 32–41 % below 400 m before rivers carve — the rivers take it toward the developer's
    // "like 40% usually is a sweeter spot" (130 / 100 with round 3's balanced crust budget: 28–37 %; with the old budget 90 / 60
    // wore India's young plateau to 0.6 km above its foreland — now, with less underthrusting, 100 / 70 leaves it 0.9 km)
    reliefTauMyr: 100,          // uplift wears away over this e-folding time (at erosionHeight.refKm)…
    riftReliefTauMyr: 450,      // …except a rifted margin's shoulders: the great escarpment retreats rather than wears down
                                // (the Drakensberg ~180 Myr, the Brazilian highlands ~130 Myr, the Western Ghats ~90 Myr)
    ruggedTauMyr: 368,          // the crests and ridges of a belt wear away more slowly: an old belt keeps its grain (the Appalachians)
    rootGain: { [OrogenyType.ANDEAN]: 1.25 },  // a belt's root grows this many times its recorded thickening (1 if not listed):
                                // an Andean margin's crust is thickened by magma added from below as well as by the
                                // shortening the history records — the Altiplano's 70 km crust
    // High ground wears fast, low ground slowly (developer: "wear down higher places faster — really slower on lower
    // places"): denudation rises with relief (Ahnert 1970; Montgomery & Brandon 2002), which is also why old ranges
    // persist as low hills for hundreds of Myr (Baldwin et al. 2003). Every clock above runs × (H / refKm) below refKm
    // (never under floor) and × (H / refKm)^0.5 above it (at most max) — H: the belt's height above its plain
    // (evolved uplift + the root's isostatic lift).
    // (a 600 Myr planet: median land 0.71 → 0.87 km, belts quiet 300+ Myr keep ~0.4 km of uplift instead of 0.2; the floor
    // 0.5 → 0.75 after Phase 13, low ground still wearing slower than high: old ranges lingered at 0.4–0.8 km everywhere)
    erosionHeight: { refKm: 2, floor: 0.75, max: 1.8 },
    diffusionKm2PerMyr: 80,     // hillslope smoothing of the uplift: range edges spread and blend over time (not onto cratons)
    // A belt's crests need room: a scrap of a belt — a few sim cells left of a collision — cannot hold its cross-section
    // (the suture valley, ranges 40–130 km off it), and drawn anyway its valley sank into the uplift around it as a pit
    // ringed by ranges (developer: "mountain donuts or crescents"). So its crest structure scales with the area of its
    // patch of belt (both sides of a collision together): none below the first, all of it above the second…
    beltPatchMinKm2: 20000,
    beltPatchFullKm2: 200000,   // …(a scrap stays a mound of its uplift)
    alongStrikeVar: 0.18,       // crest heights vary by ± this share along a range (round 3: 0.3 read as "mountain noise")
    // Where two kinds of ground meet — two belts, a belt and the plain, a craton and its neighbours — each corner's
    // share is scaled by noise of its own, so they interfinger over about blendNoiseKm instead of blending linearly
    blendNoise: 1.1,            // (weights × e^(± this))
    blendNoiseKm: 180,
    edgeJitter: 0.13,           // a belt's far edge wanders by ± this share of its width
    // A belt a newer orogeny overprinted still shows under it, at this share of its own (age-decayed) relief and with
    // its own ridge grain (developer: the new should dominate, not erase — cross-cutting grain makes ranges varied)
    overprintShare: 0.5,
    // Old ranges erode fatter (developer, 2026-09-29: rings and "eyebrow" ranges, "tendrilly ridges" — "it should be a bit
    // more fractal bulky and erode fatter/out"). As a belt falls quiet its crests are smoothed as hillslope wear smooths
    // a ridge — each exactly lower and wider, its bulk the same (profiles.js: a bump smoothed by a Gaussian of std σ) —
    // with σ growing as the square root of the time quiet; its parallel ridges and ridge noise wear the same way, by
    // wavelength, so the finest go first (a wave λ keeps e^(−2π²σ²/λ²) of itself)
    crestSpreadKm: 20,          // σ after crestSpreadMyr quiet (55 until 2026-09-29: "GREATLY turn down the … 'fattening'" —
                                // developer; the crests' own spread, crestBaseKm, does the no-lines work now)…
    crestSpreadMyr: 200,
    crestSpreadMaxKm: 130,      // …and at most this
    crestTextureShare: 0.15,    // the ridges' and the ridge noise's σ: this share of the crests' (0.5 wore the wavy ridges away)
    // No crest is a line (developer, 2026-09-29: the thin crest ridges "are simply too perfect and connected and they have
    // to go" — on the timeline's terrain, most at high detail, and in the finish): a crest drawn at a distance from its
    // belt's front is a contour of a smooth field — an unbroken curve. Every crest is spread by at least crestBaseKm (σ,
    // its bulk kept: a broad high zone, not a line), and made of broken, branching ridges — a ridged fractal (the massif's
    // octaves, read in the crust's frame) raising and lowering it by up to crestRugged of itself
    crestBaseKm: 25,
    crestRugged: 0.55,
    // …and every belt has a massif texture: rounded, fractal relief in every direction (not drawn out along the strike),
    // octaves from massifKm down to what the mesh can show — a share of the belt's crest height, more as its crests wear
    // (the bulk they spread becomes the massif's), its finer octaves worn as the ridges are
    massifKm: 200,
    massifRoughness: 0.4,       // (each octave this share of the one before: 0.55 was "slightly too fractally" — developer)
    massifShare: 0.04,          // ± this share of the crest height on a belt as built (0.16 until 2026-09-29: "GREATLY turn down
                                // the fractal" — developer)…
    massifWornShare: 0.1,       // …plus this share × how much its crests have spread (1 − their height kept)
    // Old ranges keep their grain (developer, 2026-10-27: "old old mountain ranges really lose their definition and start
    // looking like noise … i want the non-current orogenies to look like they have structure"): as a range wears down, its
    // hard layers stand out and its soft ones wear into the valleys between — differential erosion (the Appalachians'
    // Valley and Ridge, the Cape Fold Belt, the Flinders Ranges: 250–500 Myr old and still combed). As a belt falls quiet —
    // by 1 − e^(−quiet / oldGrainMyr) — its massif and the hills on it are drawn out along its strike (the massif into the
    // ridge noise; the hills oldHillsStretch times longer along it), its parallel ridges stand stronger, and its rock is
    // banded with them: the ridges hard, the troughs between soft, so its rivers settle into the strike valleys and cross
    // the ridges in gaps (trellis drainage). Broad, not lines: the bands are the ridges' own wavelength
    oldGrainMyr: 80,
    oldComb: 0.8,               // the share of the massif and of the hills drawn out along the strike, once old
    oldHillsStretch: 4,
    oldRidgeGain: 1,            // the parallel ridges this much stronger, once old…
    oldEven: -0.25,             // …and this much more even along the strike: their segments' fading, their crests' rise and fall
                                // and the crests' roughening × 1 − this. Negative: a little LESS even than a young belt's — 0.7
                                // (the Appalachians' even crests, troughs running on to catch the rivers) until 2026-10-28,
                                // when the old belts read as combed rows (developer: "old belts should not be more even,
                                // maybe it should even be slightly less")
    oldGrainHardness: 0.6,      // erodibility × 1 ∓ this on the ridges and in the troughs (×0.4 … ×1.6, the same on the whole), once old

    // ── Ridges inside a belt: strike-parallel stripes (stripes.js) ──
    stripeKm: {                 // wavelength of the main set of parallel ridges, per kind of belt
        [OrogenyType.ANDEAN]: 75, [OrogenyType.LARAMIDE]: 190, [OrogenyType.URAL]: 70, [OrogenyType.HIMALAYAN]: 95,
        [OrogenyType.ARC]: 60, [OrogenyType.RIFT]: 90, [OrogenyType.TRANSPRESSION]: 55, [OrogenyType.INTRAPLATE]: 80,
    },
    // Their height is GUIDANCE layered on the belt's own uplift (developer: "guides, layered on top of other
    // increases"): a share of the local relief, plus a little on a young belt's low ground; 8b carves the rest
    stripeShare: 0.35,          // ± this share of the belt's relief where they are (2026-09-29: "the wavy ridges we had before …
                                // a little stronger again … on the highs and especially lows" — developer: 0.3 → 0.35, and
                                // stripeLowGain; before: round 4: up from 0.14 — the layering gives the texture, the ridges
                                // give it structure; 8b round 5, "strengthen the ridges, the highs and the lows": 0.22 → 0.3)
    stripeLowGain: 1.5,         // the troughs between the ridges this much deeper than the ridges are high
    stripeBaseKm: 0.17,         // …plus ± this much (× the belt's intensity and activity)
    stripeWaveJitter: 0.25,     // each kernel's wavelength varies by ± this share, and its direction by ±…
    stripeAngleJitterDeg: 10,   // …this: spacing and strike wander, ridges fork and end — less perfect
    stripeFineShare: 0.4,       // a second, finer set (wavelength ÷ stripeFineRatio) this strong, for fine meshes
    stripeFineRatio: 2.6,
    stripeBandKm: 150,          // kernel envelope (σ) of the phasor sum: must overlap from one sim cell to the next
    stripeCarry: 1,             // 1: the ridges' sum taken at the corners of the plate's raster and carried to the points
                                // between (stripes.js carriedStripeAt) — ~3 waves a point instead of ~28, a 2.5M surface ~30 %
                                // quicker, the same ridges to the eye (developer, 2026-09-26: "they look almost identical");
                                // 0: every kernel at every point (stripeAt), as before
    // Fine detail renews slowly (developer, after Phase 9 made the detail ride with the crust: the frames were "a little bit
    // too consistent — some of the variation added to the charm"): the ridges' phases drift, and the bays and headlands,
    // the ridges' segments and crests and the ridge noise fade over to new ones — steady from one frame to the next, a
    // landscape re-sculpted over geological time. Only the fine detail: the history's own shapes are the history's.
    detailRenewMyr: 150,        // …over about this long (0: never — the detail stays frozen on the crust)
    stripeMeanderKm: 16,        // stripes wander by about this much…
    stripeMeanderAlongKm: 350,  // …over this distance (so they bend by ~15° at most, and stay parallel to the front)
    // …and they undulate at every scale about their own, in every direction (developer, 2026-10-28: "the overall shape is
    // great, but its too uniform. It needs to undulate in every direction … and at every scale (larger than phasor and
    // less than phasor)"): octaves of a noise at these multiples of the ridges' wavelength (stripeKm), where the mesh can
    // show them, bend the ridges — each displacing them by ± ridgeVaryBend of its own wavelength — and raise and lower
    // them: the parallel ridges and the ridge noise × e^(ridgeVaryHeight × the octaves' sum), its mean kept. Peaks and
    // saddles along each ridge, one ridge higher than the next, groups of them higher, uneven flanks
    ridgeVaryScales: [2, 1, 0.5, 0.25],
    ridgeVaryWeights: [1, 1, 0.8, 0.6],
    ridgeVaryBend: 0.035,
    ridgeVaryHeight: 0.5,
    // En-echelon ridges: where plates met obliquely, fold axes turn by half the obliquity. Along a transform that is
    // the whole story (the Transverse Ranges); at an oblique trench or collision most of the sideways motion goes onto
    // a separate fault along the margin (strain partitioning — the Great Sumatran Fault), so folds stay nearly parallel.
    enEchelonShare: { [OrogenyType.TRANSPRESSION]: 1, other: 0.25 },
    stripeSegmentKm: 300,       // ridges come in segments about this long — a tangle of shorter ridgelines
    // Ridge noise along each range (developer, 8b round 5: "simplex noise that is aggressively stretched along the
    // direction of the ridges — can increase or decrease things"): read at the distance across the belt (fast) and the
    // position along it (slow), so its highs and lows are drawn out along the strike, over the whole belt
    ridgeNoiseShare: 0.25,      // ± this share of the belt’s relief…
    ridgeNoiseBaseKm: 0.08,     // …plus ± this much (× the belt's intensity)
    ridgeNoiseAcross: 0.8,      // its features are this share of the belt kind's ridge wavelength (stripeKm) across the strike…
    ridgeNoiseStretch: 8,       // …and this many times as long along it
    ridgeNoiseOctaves: 3,       // (then halves and quarters of that, where the mesh can show them)
    // Broken ridgelines (developer, 2026-10-27: "the perfectly intact ridgelines we have may be unrealistic and they should
    // be broken a little (less so in the front …)" — the main range by the plate edge the most whole, though it can break;
    // the Andes least broken, "very close to what we have today", then Laramide, Ural, Himalayan). In patches of a noise
    // about a ridge wavelength across (stripeKm: so they show wherever the ridges do), read in the crust's frame so they
    // ride with the range, the parallel ridges and the ridge noise drop toward their valley floors and the crests dip:
    // each ridge runs on in pieces, with saddles and gaps between. And the rock there gives, so a river crossing the
    // range — the gaps are the lowest way across — deepens its gap into a water gap (the Susquehanna's, the Arun's).
    ridgeBreak: {               // how broken, by kind of belt (0: whole, as before)
        [OrogenyType.ANDEAN]: 0.15, [OrogenyType.LARAMIDE]: 0.45, [OrogenyType.URAL]: 0.7, [OrogenyType.HIMALAYAN]: 1,
        [OrogenyType.ARC]: 0.15, [OrogenyType.RIFT]: 0.5, [OrogenyType.TRANSPRESSION]: 0.5, [OrogenyType.INTRAPLATE]: 0.6,
    },
    ridgeBreakFront: 0.35,      // along the main range by the plate edge only this share of it, the full share 0.3 × the belt's width behind it
    ridgeBreakSize: 1,          // the breaks' noise: features about this many ridge wavelengths across…
    ridgeBreakPatch: [-0.25, 0.1],   // …a break where it rises from the first to the second (2 octaves, spread ~0.3: over half the ridge broken some)
    ridgeBreakCrest: 0.5,       // the crests themselves dip by this share of what the ridges do (passes, not gaps)
    ridgeBreakSoft: 0,          // the rock in a break erodes (1 + this) times as fast (1.5 cut new valley networks into the plateaus)
    minWavesPerCell: 2.0,      // a wavelength shorter than this many terrain cells is faded out (it would only alias)
    fullWavesPerCell: 3.2,

    // ── Volcanoes ── (developer: fewer, thicker, and spreading out as they erode — not a pox of little cones)
    arcConeShare: 0.6,          // chance of a volcano per sim cell of island arc…
    arcActiveMyr: 25,           // …while it is an active arc (arc crust accreted into a continent, now in a collision belt, has none)…
    arcFrontKm: 130,            // …and only along its volcanic front: one line on the trench side, not across a whole swath of arc crust
    andeanConeShare: 0.35,      // chance of a stratovolcano per sim cell along an active Andean volcanic range
    coneKm: { young: 2.5, mature: 2.0, andean: 1.2 },   // cone heights above what they stand on
    coneRadiusKm: { young: 34, mature: 48, andean: 34 },
    coneActiveMyr: 15,          // an Andean volcanic range falls silent this long after its margin stops
    coneSpreadMyr: 25,          // as a volcano erodes it spreads: over about this long it grows ×(1 + coneSpread) wider…
    coneSpread: 0.6,
    coneSettle: 0.35,           // …and loses this share of its height, turning from a cone into a broad, rounded shield
    // no two volcanoes the same shape (developer: "too perfectly circular", then "more ridgey and irregularly shaped"):
    // a ragged central edifice, ridges (arms) running out from the summit, gullies in the flanks, sometimes a collapse
    coneElongation: { hotspot: 0.3, arc: 0.35, andean: 0.25 },   // the edifice's long axis is up to 1 + this times the short one
    coneWarp: 0.3,              // a volcano's own coordinates are warped by smooth noise this strong (× its radius): irregular
    coneLobes: 0.1,             // outline wobble: up to ± this share of the radius in each of three harmonics…
    coneLobesFine: 0.04,        // …and a fifth-order one this strong: a ragged edge
    coneArms: { hotspot: [2, 3], arc: [1, 2], andean: [0, 2] },   // arms per volcano, fewest…most: a shield's rift zones,
                                // spread round it; an arc volcano's ridge along the arc
    coneArmLength: { hotspot: [1.3, 2.4], arc: [0.9, 1.6], andean: [0.7, 1.3] },   // × the radius
    coneArmWidth: [0.35, 0.55], // × the radius (the width of the ridge where it leaves the summit)
    coneArmHeight: [0.8, 0.95], // an arm's crest where it leaves the summit, × the volcano's height; it stays high, then falls to its tip
    coneRibs: { young: 0.12, worn: 0.35 },   // gullies cut the lower flanks this deep (share of the height), deeper as it erodes
    coneRibCount: [5, 9],       // about this many gullies round a volcano
    coneCollapse: { hotspot: 0.3, arc: 0.2, andean: 0.15 },   // chance of a flank-collapse amphitheatre (El Golfo, Mount St Helens)…
    coneCollapseDepth: [0.3, 0.6],                               // …cutting this share of the height out of one side
    coneSatellites: { hotspot: 0.6, arc: 0.35, andean: 0.3 },    // chance of flank vents out along the arms

    // ── Erosion follows rainfall ──
    // A hard-coded estimate of zonal-mean precipitation by |latitude| (mm/yr, after Earth's: the wet equatorial belt,
    // the dry subtropics, the mid-latitude storm tracks, the dry poles). Every erosion clock of the tectonic surface —
    // relief of a quiet belt, its root rebounding, a rift's shoulders, a volcano wearing down and spreading — runs
    // (rain / rainRefMm)^rainErosionExponent times as fast, and softer still where it is wetter than the reference
    // (developer, round 4: the contrast was too strong, especially at the equator): ×wetErosionShare on the exponent.
    // Heights erode at the latitude the crust is at, step by step (tectonics/step/heights.js).
    rainByLatitude: [[0, 2000], [10, 1600], [20, 950], [30, 850], [40, 1050], [50, 1100], [60, 800], [70, 400], [80, 200], [90, 120]],
    rainRefMm: 1000,
    rainErosionExponent: 0.6,   // 0 = erosion everywhere alike
    wetErosionShare: 0.6,       // (equator: 2000 mm → ×1.28, the subtropics' 850 mm → ×0.91)

    // ── Phase 8b: rivers carve the tectonic surface (carve.js) ──
    // The stream power law ∂z/∂t = u − k A^m |∇z| (n = 1), solved analytically in time along the rivers (Tzathas et al.
    // 2024): erosion travels up each river at k A^m, so after carveTimeMyr a point stands where the ground downstream
    // stood, plus the uplift gathered on the way. Units: km, km², Myr.
    // (developer, 8b round 1: at 2 Myr it was "too aggressive … cutting all the way down instead of descending against
    // the existing topography … cutting through all the ridges": a short time — the valley floor drops to the ground a
    // little way downstream, so it follows the land's own slope; bigger rivers only; steep valley sides keep the ridges)
    // (developer, 8b round 3: "we are losing some of the original and interesting shape of the mountains … slightly
    // decrease erosion in each step … active boundaries should do less cutting and more shaping"; then "a bit too far —
    // things are too high, let's land in the middle": the active hold and the history's clocks are halfway between the
    // two, the carving time back where it was — a 600 Myr planet's median land 0.69 km before, 0.89 at the peak, 0.78 now)
    carveTimeMyr: 0.75,         // how long the rivers have worked on the present surface (longer: deeper, more graded; 0.6 until
                                // 2026-09-29 — developer: increase the carving "again a bit")
    // drowned valleys (developer: "where the mountains or hills hit the sea" — the coast there ran smooth past the valleys):
    // where hills and mountains meet the sea, the sea runs up the big river valleys — rias and fjords — and the ridges
    // between stand out as headlands. Along each river, within drownKm of its mouth (measured along the river), its
    // valley floor is lowered by up to drownDepthKm — most at the mouth, fading upstream — by how much it drains
    // (drownAreaKm2: none below the first, full from the second) and how high the land around is (drownReliefKm, the
    // land's mean height over ~4 terrain cells: none on a lowland coast, full in the mountains). Whatever that leaves
    // below the sea but cut off from it is given back. Shown where the terrain can draw a valley's width (fading out
    // toward 160K's 61 km cells).
    // (developer, 2026-10-18: "a lot of fjords in areas where they arent that cold, it makes the coast look super fractal
    // basically everywhere") Deep and long only where it is cold — fjords, where the ice age's glaciers reached the sea
    // and cut the valleys far below it (Norway, Patagonia, British Columbia); elsewhere rias — the sea risen ~120 m since
    // the ice age, up the lowest stretch of the big valleys (Galicia, south China): a few short inlets, not a fractal coast.
    // Cold: the warmest month at sea level (Add detail: the moment's climate), from none at the first to full at the second
    // (Galicia's rias ~20 °C, Puget Sound ~18, Norway's and Patagonia's fjords 11–15); the timeline, before any climate,
    // by latitude (where Earth's coasts pass those summers).
    drownKm: 180,               // a fjord's reach up its valley…
    drownDepthKm: 1.4,          // …and its depth at the mouth
    riaKm: 60,                  // a ria's
    riaDepthKm: 0.15,
    drownColdC: [19, 13],
    drownColdLat: [44, 58],
    drownAreaKm2: [800, 15000],
    drownReliefKm: [0.15, 0.9],
    drownWiden: 0.55,           // a drowned valley's neighbours lowered by this share of it too (an inlet a few cells wide)
    carveM: 0.4,                // the drainage-area exponent m (the paper's; concavity m / n)
    carveK: 5,                  // k (km^(1−2m)/Myr): the wave's speed where 1 km² drains — 200 km/Myr at 10⁴ km² (the paper's k)
    carveBgUplift: 0.02,        // background rock uplift (km/Myr) everywhere: rivers keep a gentle graded slope
    carveUpliftPerKm: 0.4,      // an active belt's rock uplift, per km of its relief (a 5 km range: 2 km/Myr) — its rivers stay high
    carveActiveMyr: 15,         // …fading with the time since the belt was active, over this
    carveActiveHold: 0.3,       // an active belt's rivers cut this much less (0.45 until 2026-09-29) (uplift keeps pace with them: the range is
                                // shaped, not trenched), fading with its activity
    carveCratonHardness: 0.5,   // shields erode this much slower (k × 1 − this)…
    carveCrestHardness: 0.5,    // …and so do the crests of a fold belt's ridges: rivers follow the strike valleys (trellis)
    // (developer, 8b round 2: no arbitrary cut-off for which rivers carve — every river does, by the width of its valley)
    carveValleyKm: 20,          // a valley is this wide where its river drains 10⁴ km², wider with √(drainage) (Leopold &
                                // Maddock 1953): a cell drops by the share of it its valley takes
    carveHillSlope: 0.1,        // valley sides: no ground stands more than this gradient (km per km) above the ground its
                                // water runs to…
    carveHillRelief: 0.5,       // …steeper by this share per km of belt relief (mountain valleys have steep sides)
    carveHillNoise: 0.35,       // …and varying by ± this share from place to place
    // ── 8b-2: the rivers of the history (tectonics/step/rivers.js) — drained on the sim mesh as the history runs; their
    // cuts are records of the crust that the carving draws (developer: "a history of rivers in the terrain") ──
    riverEveryMyr: 4,           // the land is drained this often
    riverCutK: 0.5,             // k of the history's rivers: they cut E = k A^m S (km/Myr; A km², S km per km) — a river
                                // that keeps up with the land rising under it holds its course and cuts a gorge…
    riverHalfKm2: 250000,       // …toward a share A / (A + this) of the relief it crosses: a stream notches its valley, a
                                // great river (10⁶ km²) cuts ~75 % of the way through the range…
    riverActiveHold: 0.45,       // …less by this share where the belt is still active (it rises as fast as they cut)…
    riverPlainKm: 0.08,         // …plus a valley of its own even on flat land (a great river's floodplain below its bluffs)
    carveMicroKm: 0.1,          // the crust's micro-relief (± km): steers the small rivers' ways down, and rides with the
    carveMicroScaleKm: 150,     // crust, so they hold their courses between frames (it shapes the routing only, not the
                                // heights; small-river drainage between frames 10 Myr apart correlates 0.30, from 0.12)
    carveRounds: [3, 2, 2, 1],  // rounds of routing ↔ carving per level, coarsest (the sim mesh) to finest
    // The same big rivers at every terrain detail (developer: "slopes and rivers … being in the main rough area"): the
    // carving's coarse levels, where the big rivers are settled, average the surface shown — which differs with the detail
    // (~90 m rms over a 20K plate cell: ridges drawn or faded, crests sampled finely or coarsely), enough on gentle ground
    // to send a big river down another valley. With this many cells (e.g. 160000), a finer terrain gives that level the
    // surface synthesized at this detail instead (synthesize.js settleFields). 0: off
    carveSettleCells: 0,
    // …except where ice does the work (developer): glaciers erode fast though little falls, so poleward of the storm
    // tracks erosion holds near their level — the rate is the larger of rain's and this, by |latitude|
    glacialErosion: [[45, 0], [52, 0.95], [58, 1.07], [90, 1.0]],
};

/** Estimated mean rainfall (mm/yr) at a latitude (degrees), from cfg.rainByLatitude. */
export function rainAtLatitude(latDeg, cfg) {
    const table = cfg.rainByLatitude, a = Math.min(90, Math.abs(latDeg));
    for (let i = 1; i < table.length; i++) {
        const [l0, r0] = table[i - 1], [l1, r1] = table[i];
        if (a <= l1) return r0 + (r1 - r0) * (a - l0) / (l1 - l0);
    }
    return table[table.length - 1][1];
}

/**
 * How many times faster than at rainRefMm things erode at this latitude: by the rain that falls there, or — poleward —
 * by the ice (cfg.glacialErosion), whichever is more. With rainErosionExponent 0, 1 everywhere.
 */
export function erosionAtLatitude(latDeg, cfg) {
    if (cfg.rainErosionExponent <= 0) return 1;
    const wet = rainAtLatitude(latDeg, cfg) / cfg.rainRefMm;
    const rain = wet ** (cfg.rainErosionExponent * (wet > 1 ? cfg.wetErosionShare : 1));
    const g = cfg.glacialErosion, a = Math.min(90, Math.abs(latDeg));
    let ice = 0;
    if (a > g[0][0]) for (let i = 1; i < g.length; i++) if (a <= g[i][0]) { const [l0, v0] = g[i - 1], [l1, v1] = g[i]; ice = v0 + (v1 - v0) * (a - l0) / (l1 - l0); break; }
    return Math.max(rain, ice);
}

/**
 * How many times faster than the reference a belt standing `heightKm` above its plain wears down (cfg.erosionHeight):
 * slower on low ground, faster on high.
 */
export function erosionAtHeight(heightKm, cfg) {
    const { refKm, floor, max } = cfg.erosionHeight, x = heightKm / refKm;
    return x <= 1 ? Math.max(floor, x) : Math.min(max, Math.sqrt(x));
}

/** Terrain constants with the given overrides (shallow for scalars, one level deep for grouped tables). */
export function terrainConfig(overrides = {}) {
    const out = structuredClone(TERRAIN);
    for (const [k, v] of Object.entries(overrides)) if (k in out && typeof v === typeof out[k]) out[k] = v;
    return out;
}
