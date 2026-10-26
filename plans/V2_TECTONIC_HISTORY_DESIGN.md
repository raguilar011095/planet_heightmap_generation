# World Orogen V2 — Tectonic History Engine (Design)

Status: draft 1 · 2026-09-20 · scope: terrain generation only (climate, erosion and
rendering are reused from V1 until their own V2 passes).

## 1. Why

V1 paints terrain from a **single frozen snapshot**: a Voronoi partition of plates, each
plate wholly "land" or "ocean", boundaries classified from instantaneous velocities, and
elevation built from distance-to-boundary fields. It looks good at a glance, but it cannot
produce the things that make real planets read as *real*:

- mountains far from any current boundary (Urals, Appalachians) — old sutures
- coastlines that fit together across an ocean (S. America / Africa)
- low continental interiors ringed by coastal ranges of different ages
- cratons, accreted terranes, microcontinents, ribbon continents, Mediterranean-style seas
- ocean-floor age structure, hotspot tracks with age progression, failed rifts → river basins

Worldbuilding Pasta (WBP) says it directly: *"not all mountain ranges are associated with
current tectonic boundaries"*, and *"I don't suggest trying to just slap down plate
boundaries at random and then draw continents to fit them"* — which is exactly what V1 does.
His prescription (Part Va, "The Obsessively Detailed Approach") is to simulate 500–1000 Myr
forward from a supercontinent in GPlates, by hand, a week of afternoons per planet.
**V2 automates that procedure, in the browser, in seconds.**

Guiding tenets are unchanged (artistic appeal > speed/ease > plausibility). The history
engine is bookkeeping that feeds the art — it is not a geodynamics code.

## 2. Source methodology → engine rules

Everything in this table is taken from WBP Part Va / V-supplement / VIIa / VIIc. The
right column is how the engine honours it.

| WBP rule | Engine rule |
|---|---|
| Start from a supercontinent of ~8–12 cratons + accreted crust, ≈25 % of the surface (≤40 %); ring it with subduction zones; ignore initial ocean plates — they get overwritten | `init/`: cratons drawn as rifted fragments in a few clusters (proto-continents), wrapped into one landmass on its own plate, rim trenches on its margin, and one passive pre-history ocean plate around it (no driving ocean plates) |
| Run 500–1000 Myr (one full supercontinent cycle + the breakup you want to end in). Cycle ≈ 400–750 Myr | `historyMyr` parameter (default ≈ 600), `endPhase` hint (breakup / assembly / tenure) |
| **Subduction is active; ridges and rifts are passive.** Subduction zones dictate plate motion | `step/forces.js`: slab pull ≫ slab suction > ridge push; mantle drag larger under continents; torque balance → Euler pole. No random velocity vectors |
| Speeds (cm/yr): subducting ocean 10–20 · recent subduction/collision 5–10 · active-margin continent 2–5 · passive-margin continent < 1. 1 cm/yr ≈ 0.09°/Myr | Force coefficients calibrated so emergent speeds land in these bands; hard clamps as a safety net |
| Ocean crust is created symmetrically at ridges, ages, and is fully replaced on ~250 Myr scales; older crust is more likely to start subducting | Gaps between diverging plates are filled with age-0 crust split between the flanking plates; subduction initiation probability rises with margin crust age |
| Ocean always subducts under continent; between oceans the older/denser side subducts; the overriding plate records an Andean orogeny or island arc | `step/resolve.js` overlap rules + `step/subduction.js` records |
| Continental crust never subducts; collisions build mountains, the plates slow, stop and **suture** into one plate; the suture stays as a weakness | `step/collision.js`: collision resistance force, shortening budget, then plate merge; suture line recorded as a weakness feature |
| Small collisions (arcs, microcontinents) don't stop subduction: it **jumps** outboard or **reverses polarity**; only a big continent–continent collision kills a subduction zone | terrane accretion transfers just the terrane to the overriding plate; the ocean behind it keeps subducting on the new coastline |
| Rifts start at plume-weakened triple junctions, join into a zig-zag, **avoid cratons**, prefer old sutures/failed rifts; third arms become **failed rifts** (aulacogens) → future river valleys/inlets; breakups are multi-stage; opening is hinge-like | `step/rifting.js`: least-cost noisy path between plume points and the coast, craton cost high, suture/failed-rift cost low; unused arms stored as features; child plates get a hinge Euler pole |
| Supercontinents insulate the mantle → plumes, LIPs, uplift; LIPs leave hotspots behind; hotspots are fixed in the mantle frame, 10–20 matter, mostly only the last ~100 Myr is visible | `step/hotspots.js`: plumes in world (mantle) frame stamp age-tagged volcanic records into the overriding plate's crust → real age-progressive chains |
| Leading-edge margins: smooth coast, high coastal range. Trailing-edge subduction: **slab rollback**, back-arc basin, offshore arc (Japan). Passive margins: wide shelf, coastal plain, old eroded ranges | margin classification per coast cell (`leading` / `trailing` / `passive` + age) drives shelf width, coast roughness and arc placement in terrain synthesis |
| Flat-slab (Laramide) when the overriding plate moves fast toward the trench or a ridge is subducted → very wide orogen + interior uplift | flag on the subduction record when trench-normal overriding speed or subducting-crust youth crosses a threshold |
| Orogen types & widths: Andean 80–200 km · Laramide 750–1300 · Ural 50–180 (arc/terrane collisions up to ~600) · Himalayan ~1200 (multi-stage, fast, many pre-existing sutures) | orogeny records carry `type`, `intensity`, `startAge`, `endAge`; widths come from this table in `terrain/orogens.js` |
| Height vs age: mean ≈ 2500 m − 5 m/Myr, peaks ≈ 4000 m − 8 m/Myr (exponential is arguably better) | `terrain/orogens.js` decay law, tunable |
| Record orogenies (by type + age), failed rifts, hotspots + trails, LIPs, terranes/tectonic units; then **interpret** them into terrain as stress fields with a preferred ridge orientation — "a tangle of shorter ridgelines with the same preferred orientation" | the sim only *records*; `terrain/` interprets. Orogen strike vectors feed V1's phasor-ridge generator |
| ~Half of land is below 400 m; continents typically have low interiors ringed by ranges; continental crust area ≠ land area (shelves are submerged crust) | hypsometric target in synthesis; sea level solved so land fraction matches the Land Coverage slider |
| Sea level is low during supercontinent tenure, high ~100 Myr after breakup (young buoyant ocean floor) | ocean-age → mean depth → eustatic term (also available to a future climate-through-time feature) |
| WBP's critique of Tectonics.js: deletes old crust instead of modelling persistent subduction zones; no overriding/subducting distinction; no subduction orogenies | explicit design requirement: subduction zones are persistent, polar, and drive both motion and orogeny |

## 3. Core architecture — a GPlates-shaped data model

GPlates stores every feature in a plate's own reference frame plus a **rotation model**
(plate ID, time, Euler rotation, conjugate plate); "reconstructing" is just applying the
rotation. V2 adopts the same split, discretised onto our Fibonacci sphere mesh:

```
TectonicWorld
 ├─ simMesh            fixed-resolution SphereMesh (default ~40K cells ≈ 100 km) — resolution
 │                     independent of the Detail slider, like V1's coarse plate grid
 ├─ time               Myr since start (runs forward, like WBP)
 ├─ plates[]           Plate { id, name, rotation (quaternion: plate frame → world),
 │                             eulerPole, omega, born, died, parentId, stats }
 ├─ crust (SoA, per plate frame)   ← each plate owns a full-sphere raster in ITS OWN frame
 │     mask, type (ocean | continent | craton | arc | lip), formedAt, thickness,
 │     orogeny {type, intensity, start, last, strike}, margin info, terraneId, hotspot stamp…
 ├─ features[]         failed rifts, sutures, LIPs, hotspot tracks (valid-time ranges)
 ├─ hotspots[]         mantle-frame plumes
 ├─ rotationModel      per-plate finite rotations sampled through time  (→ playback, .rot export)
 └─ events[]           human-readable log: "412 Myr: Microcontinent 3 accretes to CE (Ural-type)"
```

Why per-plate rasters in the plate frame (the Tectonics.js storage idea, without its
physics): rigid motion is *exact* — a continent is never resampled while its plate lives,
so coastlines do not diffuse or shred over 300+ steps, and conjugate margins still fit
after 200 Myr apart. Splitting a plate needs no resampling at all (children inherit the
parent frame and partition the mask). Only sutures/accretions resample, once, locally.

**Continents first (decision 2026-09-20).** As in WBP's GPlates workflow, continents are
the primary moving objects and oceans are *inferred* from them:

- A plate is whatever crust is in its raster. Continental plates start as just a continent
  (cratons + accreted crust). There are no hand-placed ocean plates.
- The pre-history ocean is a single passive, stationary background plate. It never drives
  anything; it is only overridden and consumed ("all of these will be near-completely erased
  and overwritten" — WBP).
- New ocean crust appears where continents separate and is written into the flanking
  continent's plate — WBP: "give them the plate ID of the nearest craton on the continent
  they're formed by". A plate's ocean is a growing attachment to its continent.
- Subduction zones and island arcs live on the overriding plate, so arc crust is created
  directly in that plate's raster — i.e. it is automatically "assigned" to the nearby
  craton's plate, and accretes to the continent when the back-arc closes.
- Ocean-only plates (WBP's Ocean i, ii, …) are never created up front. They are born only
  when a new subduction zone cuts old ocean crust away from its continent (Phase 6).
- Reconstruction ranks continental claims above oceanic ones: land rides over ocean.

**Plates are larger than their land (requirement from Phase 2 review, 2026-09-20).** In the
Phase 2 test scene a plate is only its continent, so the trench is the jagged coastline, it
ends where the land ends, and the continent's flanks rub directly against the old ocean —
every headland opens a sliver of new crust in its lee, which reads as "spreading all round the
edges" instead of a wake trailing the land. WBP's subduction zones are smooth lines owned by
the overriding plate that run along the coast a little offshore and then *continue past the
land out to sea*; those seaward stretches are where island arcs form, perpendicular to plate
motion, and they propagate along strike and bridge separating continents. The engine gets
this by letting a continent with a trench carry an **ocean apron** — old ocean crust captured
(moved from the background plate's raster into the continent's):

- *Offshore apron*: the trench sits ~100–300 km off the coast (`marginSplitOffshoreKm`) and is
  smooth; embayments lie inside the plate, so no lee slivers form along an active margin.
- *Trench wings*: the apron extends along strike beyond the continent's tips and lengthens with
  time (trench propagation). The wings' leading edge overrides old ocean → ocean–ocean
  subduction → arc records → island arcs in the right orientation; arcs stay tied to a
  continent at one end, as WBP requires.
- *Flanks*: the plate's sides become transform boundaries out at sea, so new ocean forms only
  in the wake behind the plate.

Where it lands: the start state's rim trench is built this way (Phase 3); apron capture, wing
propagation and arc crust arrive with the collision/arc work (Phase 5) and subduction
initiation (Phase 6); slab rollback and back-arc opening behind a wing are Phase 7.

**World resolve (each step, "gather"):** for every world cell, rotate its position into each
candidate plate's frame and look up the nearest plate-frame cell through an O(1) cube-map
index. 0 claims → divergent gap → new ocean crust. 1 claim → owned. ≥2 claims → convergent
overlap → subduction / collision rules. Boundary type, polarity, margins, and all forces
are derived from this resolved world view.

Naming follows WBP's bookkeeping so the event log reads like his posts: cratons `A, B, C…`,
continents named by their cratons (`ABCD`), ocean plates `i, ii, iii…`, microcontinents
`1, 2, 3…`.

## 4. Step loop

As built (`tectonics/simulate.js`; ✔ = exists, ○ = later phase):

```
resolve → tidy → classify → drive → steer back-arc strips → capture frame 0   (so even frame 0 carries forces)
while t < untilMyr:
  dt = chooseStep         adaptive: the two fastest plates together cover ≤ maxCellsPerStep cells (a finer mesh takes
                          more, shorter steps), ≤ maxStepMyr, floored at what the speed limits would need, and never
                          across a multiple of stepGridMyr — so how often a history is recorded never changes it
  advancePlates           integrate quaternions (step/kinematics.js)
  resolve                 rebuild world ownership by gather (step/gather.js); overlaps → delete the subducting crust
                          (step/polarity.js) or mark a collision; gaps → lattice-native growth of new ocean crust on
                          the flanking plates; what is still empty is marked PROVISIONAL (step/resolve.js). The world
                          view is fresh here, and every plate's `reshaped` flag is cleared
  classifyBoundaries      ridge / trench / transform / collision per contact (step/contact.js); the persistent TRENCH
                          flag and slab length per trench cell; ocean-on-ocean polarity voted per segment; Andean /
                          Laramide belts inland of feeding trenches, transpression ridges on squeezed transforms
                          (step/boundaries.js, step/orogeny.js)
  events (unless events: false; Phases 2–4 run without them) — in this order, each on a world view that the
  stages before it may have made stale for the plates they reshaped (Plate.reshaped):
    updateHotspots        plumes, LIPs, tracks; queues plume rifts (step/hotspots.js) — first: it only stamps records
    trackCollisions       per-pair collision records, belts, suture (ops/merge-plates.js), docking (ops/accrete-
                          terrane.js), arc scraping (ops/scrape-arc.js) (step/collision.js)
    growWings, buildArcs  trench wings + fore-arc capture, island arcs (step/wings.js)
    collapseArcs          an arc collapses onto its own coast (ops/collapse-arc.js)
    growMarginIsles       fore-arc islands grow into an active coast (step/margin-isles.js)
    riftContinents        plume and tension rifts (step/rifting.js, ops/rift.js)
    openBackArcs          rolling-back trenches open back-arc seas; finished strips rejoin (step/backarc.js)
    initiateSubduction    old passive margins founder; a new ocean plate if against the passive ocean
                          (step/subduction-init.js, ops/birth-ocean-plate.js)
    tidyPlates            integrity: fragments join a neighbour, ocean scraps to the passive ocean (ops/tidy-plates.js)
    → if anything changed crust: refresh the plates, resolve, fill pinholes, classify again
  drive(world)            the next step's angular velocities: a scene's prescribed motion, or
                          step/torque-balance.js `updatePlateMotion` (forces from step/forces.js)
  steerBackArcStrips      a strip whose back-arc sea is opening follows its trench, whatever drives the rest
  captureFrame            on every snapshotEveryMyr (a multiple of stepGridMyr) and at untilMyr: a self-contained
                          world-frame Frame (snapshot.js) — the only thing views, stat panels and checks read;
                          it carries the event log (kind + data per event, EventKind in model/world.js)
```

A run can be stopped and resumed: `simulate(world, …)` continues from `world.time`.

Every module is a function over `TectonicWorld` with no UI or worker knowledge, and the whole
of `core/` and `tectonics/` runs unchanged in Node.

Rules the first four phases established (each one fixed a concrete failure — see §10):

- **Forces come from boundary state, not from velocities**, so a world at rest can start itself:
  the persistent TRENCH flag, the crust type on each side, its age, and how much slab a trench has
  (`slabMatureKm`).
- **Crust grows on each plate's own lattice.** A plate creates exactly those of its raster cells
  whose true centre lies in a gap, at least half a cell on its side of the gap's mid-line, judged
  against the crust as it was before the step. Growing per *world* cell is biased toward whichever
  plate moves faster against the world lattice.
- **New crust forms only where a plate is not advancing on the crust in front of it** — judged from
  the plates' relative motion (is the neighbour's crust within 60° of the direction of travel?),
  not from a one-cell edge normal, which is mostly lattice noise. Holes ahead of a closing edge are
  raster jitter and are left to be overridden; holes on a sliding (transform) margin are filled.
- **Nothing hides a hole.** A world cell no raster holds crust for is marked *provisional*
  (NEWBORN = the ridge axis, LIKE_NEIGHBOUR = a passing hole ahead of a closing edge). Views draw
  them; boundary records, forces and budgets skip them; the Phase 2 checks bound how wide and how
  long-lived they may be.
- **The overlap of a collision is the indenter, not waste.** Land over land is not consumed while the
  collision lasts: it is the lower plate's nose pushed into the upper plate, and its depth is the
  indentation. The viscous lock (harder where a craton is at the front) limits how deep it gets.
- **Belts are records that reach inland, by an amount set by rate × time.** Convergence at a front
  is recorded across a belt whose reach = (base + perKm × work absorbed so far, capped by kind) × a
  factor for the current (collision: mean) convergence rate — so a long or fast subduction builds a
  wider belt (developer requirement). Caps are WBP's widths (Andean ≲ 700 km; a continental plateau
  up to ~1300 km; its foreland ≲ 350 km). Records taper from the front; **thickening spreads over the
  same reach with a smooth plateau profile** (no spike at the front cell). Cratons are impassable
  (belts wrap them); old sutures / rift margins carry a belt further (reactivation). A belt from a
  trench at sea crosses to the nearest coast, outward only.
- **Suture = resample once + redraw.** The lower plate is resampled into the upper's frame once, and
  in the same pass the upper plate's crust in and behind the overlap is displaced by an inverse warp:
  back by `indentGain` × the local indentation, and sideways toward the ends of the front (escape
  tectonics), decaying over `indentFalloffKm` (developer: the warp must be generous — the whole
  zone deforms, not just the overlap); cratons move as rigid blocks and are stamped back
  cell-for-cell; **sea caught between the two plates closes** where it is narrower than
  2 × `sealStraitKm`, and enclosed seas smaller than `inlandSeaMaxKm2` close too, while larger ones
  survive as inland seas (developer requirement); the closed seam becomes a SUTURE belt; plateau and
  foreland belts are painted on their own sides.
  Everywhere else and at every other time, rasters stay rigid (the developer's decision, §10).
- **A trench does not stop where the land stops.** Each end of a trench line propagates out to sea at
  `wingGrowthCmYr`, across the plate's motion (`wingBendToMotion`) and away from the plate's body, by
  capturing the passive background's old ocean — together with a wedge of fore-arc behind it
  (`wingFillKm`), which is part of the overriding plate. Ends are found before any grows (else a
  captured cell grows again in the same pass). Trench-flag inheritance on a wing applies only beside
  or ahead of the trench: a gap can open behind a wing's tip as the plate moves on.
- **Island arcs form behind mature, active ocean–ocean trenches** (`arcMatureConsumedKm`, judged over
  a cell and its trench neighbours; overriding right now; no CONTINENTAL crust within
  `arcNoLandWithinKm` — arc crust already there does not count, or arcs could only ever be dots):
  one row of arc per trench line, growing into chains — and WIDENING with age: every further
  `arcWidenSlabKm` of slab the arc gains a row (Aleutians → Philippines → Indonesia; developer). Arc
  crust is land, on the plate that carries the trench. A trench with continental crust close behind
  it is a continental margin: Andean belt. A landmass that is mostly arc crust docks as a terrane
  whatever its size — an arc never sutures as an equal.
- **A plate never grows forward.** Wings run across the motion and never forward of it; the fore-arc
  wedge captured behind a wing excludes anything ahead of the plate's leading edge. Checked: the
  fore-arc ahead of the land stays an apron's width deep.
- **Arcs collapse onto their own coast** (ops/collapse-arc.js): an arc chain on a continent's plate,
  at least `arcCollapseMinKm2`, `arcCollapseAgeMyr` old, within `arcCollapseKm` of the continent
  with sea between, is pushed onto the coast; the sea closes, and the fore-arc it stood on (bar a rim
  of trench in front of the landed arc) is given back to the open ocean — subduction jumps in to the
  new coast and the plate's front RETREATS (developer requirement: arcs agglomerating onto land make
  the leading edge lose space). Every arc cell lands (a band of arc becomes a band of coast; extra
  cells stack outward from the coast): land is conserved, and the rule fires only when there is sea
  on the path in.
- **Small landmasses dock, big ones suture — and a small one docks as soon as it TOUCHES.** Land
  that merely touches another plate's land (no overlap yet: a fragment sliding along a coast) is
  enough to dock a terrane; the host is the plate carrying the continent (more land overall), never
  the bigger of two scraps. At first contact, if either landmass (the connected
  land component of that plate at the contact) is under `terraneMaxAreaKm2`, the smaller is moved onto
  the other's plate at once, with a Ural belt and a suture; its trench-flagged fore-arc within two
  cells comes along, flags intact. Subduction then jumps to the terrane's outboard side, and if the
  piece was an arc on the overriding plate the polarity reverses — both purely because land always
  overrides ocean. Scraps under `terraneMinAreaKm2` are absorbed silently. An ocean trench cell that
  is itself overridden by arriving land loses its flag.
- **Plate integrity** (ops/tidy-plates.js, every step and once at the start): a plate keeps only its
  largest connected piece. Any other piece with land joins the nearest plate within a few cells (a
  docking, in effect); ocean-only pieces and land scraps under `terraneMinAreaKm2` are subsumed into
  the passive ocean. A landmass genuinely adrift stays put until Phase 6 (plate birth). Without this
  the old plate lingers as drifting slivers — "swiss cheese" (developer).
- **Each piece of an arc docks as it arrives** (developer: not the whole arc at once), bringing the
  donor's ocean immediately around it so it arrives connected to the host.
- **Wings are straight lines fixed when they start** — across the plate's motion at that moment, away
  from the body — and grow only from trench ends anchored at a continental margin (within an apron of
  continental crust, or already on a wing). Re-aiming wings as the motion drifted curled them and
  turned the plate; letting trench that appeared out at sea sprout wings made the plate eat the
  ocean in a chain reaction (1 600 → 31 000 cells in 150 Myr). The fore-arc captured behind a wing is
  an apron wide and lies directly behind it (against the motion), never in front of any coast.
- **Rifting is probabilistic and follows the seams** (developer decisions). A continent above
  `riftMinContinentKm2`, stable for `riftTenureMyr`, rifts with chance `riftRatePerMyr × tension ×
  size` per Myr from the world's seeded rng; a plume (scheduled, or `plumeRatePerMyr`) forces one.
  The junction is a weak interior cell; three arms run to the coast by cheapest path (craton cells
  cost `riftCratonCost`, sutures / failed rifts `riftWeaknessCost` = 0.45: strongly preferred, not
  exclusively); the rift is the pair of arms leaving ≥ 135° apart with the lowest cost PER KM OF CHORD
  (so it crosses the landmass rather than nicking a coast or looping one craton), capped at
  `riftTortuosityMax` × chord; the third arm becomes a FAILED_RIFT. The plate is split by a
  two-colour flood from the path's sides; both margins get RIFT_MARGIN; halves are named by the
  cratons they hold; a craton is never divided. A fresh rift PUSHES its halves apart (`riftPush`, one
  fixed direction per plate, fading over `riftPushMyr`); rift partners are exempt from collision and
  the lock meanwhile, and a stalled seam only welds after `sutureStallMinKm` of real shortening.
- **A subducting plate's speed is set by slab pull against the mantle's resistance to the sinking
  slab** (`slabResistance`, acting along the trench normal on the convergence rate), not by basal
  drag and never by the speed cap. The cap is a backstop; the Phase 4 checks fail if it engages.
- **Trench rollback:** crust created outboard of a live trench inherits the trench (flag and slab
  record), so a trailing trench stays at the plate's edge.
- **A trench flag on ocean crust is cleared once that crust is no longer a plate edge;** on land it
  stays as the record of a former active margin.
- **Boundary length is measured along shared cell edges**, not by counting boundary cells.

## 5. Terrain synthesis (history → elevation)

Revised 2026-09-24 after research (developer: "real visible ridge lines, consistent with the definition of collision,
as realistic a look as possible"). Sources: WBP Parts VIIa (range geometries) and VIIc (constructing terrain); Tzathas
et al. 2024 (analytical stream-power erosion); Cordonnier et al. 2016 (uplift + fluvial erosion on a graph mesh);
Cortial et al. 2019 (per-point fold direction, detail aligned to it); Braun & Willett 2013 (FastScape); Hovius 1996
(transverse drainage spacing: catchment length ÷ outlet spacing 1.91–2.23 on 11 ranges); Argudo et al. 2019 (divide
trees); Rajasekaran et al. 2019 (perceived realism tracks valleys, ridges, spurs, hollows); Undiscovered Worlds, Gaea,
World Machine, Wilbur, gospl, Tectonics.js, Azgaar (tool survey).

**What "ridges consistent with collision" means (the target):** ridges run parallel to the front and follow its curves;
each kind of belt has its cross-section, asymmetric across a collision (plateau and back range on the upper plate,
highest range, fold hills and foreland basin on the lower); oblique convergence staggers them en-echelon (fully along
transforms — at trenches and collisions the sideways motion is partitioned onto a margin-parallel fault); rivers cut
transverse valleys at regular spacing and run along the strike between parallel ranges; young belts are high and sharp,
old ones low but keep their grain; size follows the recorded work, rate, obliquity and slab age.

**Why this design:** noise alone reads as "noise mountains"; oriented stripes (V1's phasor ridges, Cortial) get the
direction right but have no drainage; stream-power erosion (Cordonnier, Tzathas) makes ridges the divides of a river
network — the look perception studies reward — and Tzathas makes it one pass instead of a simulation. So: place the
belts' crests from the records (consistency, control: "the Andes stand 6 km" can be aimed), then carve them.

Heights are built on a **terrain mesh** finer than the sim mesh (160K / 640K / 2.5M cells; the 121 km sim cells are far
too coarse for ridges), in km, the same planet at every resolution.

1. **Records** (Phase 8a, engine): `spreadBelt` keeps each cell's position across its belt (`beltU`, 0 at the front),
   the belt's reach, the side of a collision and the obliquity — scalars in the plate frame, never rotated. Records only:
   the history is unchanged (event-log hash identical).
2. **Tectonic surface** (8a, `js/terrain/`) — the planet before erosion, drawn "higher and broader, since erosion
   removes material" (WBP VIIc): sea floor from crust age, abyssal hills along the isochrons, trenches and outer rise,
   oceanic plateaus; continents on an isostatic platform (the root, broad uplift and crest size EVOLVED during the
   history — §8, built 2026-09-25),
   shelves / coastal plains / slopes by kind of margin, the coast placed by an interpolated signed distance (a shape in
   km); belt cross-sections by kind and side (WBP VIIa); strike-parallel ridges (phasor noise, kernels aligned straight
   away from the nearest front cell); volcanoes (hotspot islands and seamounts, arc chains, Andean stratovolcanoes).
   The fine detail belongs to the crust (`anchor.js`): noise is read in the frame of the plate under each point, and
   ridge kernels and volcanoes are keyed to crust cells, so a drifting continent carries its detail with it.
3. **Carving** (8b-1, built 2026-09-25: `terrain/carve.js`) — the stream power law (n = 1) solved ANALYTICALLY in time
   along the river network (Tzathas, Gailleton, Steer & Cordonnier, Eurographics 2024): after a time t a point stands
   where the ground downstream stood, the wave having travelled up at k A^m, plus the uplift gathered on the way
   (their eqns 6–9). Network: a priority flood from the sea (depressions crossed at their spill), receivers drawn at
   random among lower neighbours by slope (random numbers of the crust's own); drainage area in km², rain-weighted.
   Every river carves its bed; a cell drops by the share of it its valley takes — valley width ∝ √(discharge)
   (hydraulic geometry, Leopold & Maddock 1953), carveValleyKm at 10⁴ km² — so great rivers cut whole cells and streams
   barely mark theirs, with no threshold; valley sides held to a critical gradient along the flow paths (steeper with
   belt relief, varied by noise). Starting surface = tectonic − u·t, so ground the wave has not reached keeps the tectonic height; carved
   never above tectonic; channels kept monotone downstream (pits of the tectonic surface stay as basins). Rock uplift u
   from the records (active belts, by relief, fading once quiet; a small background everywhere); erodibility lower on
   cratons and on fold-belt crests (trellis). Coarse to fine over the sim mesh and the terrain meshes (the paper's
   multigrid idea): the big rivers are settled at the coarse levels, so they are the same at every resolution.
   8b-2 (built 2026-09-26, `tectonics/step/rivers.js`): rivers DURING the history — every 4 Myr the land is drained on
   the sim mesh over its evolved height less what rivers already cut (so a cut course stays the lowest way and its river
   keeps it), and each river cuts by stream power, never below the reach below, toward a share A / (A + 250,000 km²) of
   the relief it crosses (plus a floodplain valley on flat land); the cut is a record of the crust (riverIncKm), worn
   back with the crests. A river that keeps up with land rising under it holds its course and cuts a gorge (antecedent
   rivers). The terrain routes over the surface less that record — rivers follow the old courses — and a bed is at least
   as deep as the history cut it. Small rivers are routed over a crust-anchored micro-relief (steepest descent), so they
   ride with their continent between frames.
4. **Sea level and hypsometry**: sea level as a control; concave river profiles should give ≈ half the land under 400 m;
   a partial rank-remap to Earth's curve (Tectonics.js) only as a fallback control.
5. **Phase 9**: project to the render mesh; V1's detail, erosion and climate as the final polish.

Heights evolve as state during the history (§8, since 2026-09-25): step 2 draws the evolved root, uplift and crest size
instead of deriving them from a belt's age; steps 3–4 are unchanged by it.

## 6. Code organisation

V2 lives in `v2/` beside V1 (V1 stays deployable and untouched). It imports V1's stable,
generic modules (`sphere-mesh`, `rng`, `simplex-noise`, later `terrain-post` + climate)
instead of copying them. Rules: one responsibility per file, ≲300 lines per file, all
tunables in one config in physical units (km, Myr, cm/yr), no module reaches into another's
internals — they communicate through `TectonicWorld` and documented record types, and
everything in `tectonics/` and `terrain/` runs unchanged in Node for headless testing.

```
v2/
  index.html  lab.css           the browser lab (no build step; open through any static server)
  README.md                     how to run the lab and the checks; conventions; how to add a phase
  js/
    core/                       geometry with no tectonics in it
      rotation.js               quaternions, row-major 3×3, Euler poles
      sphere-geom.js            dot / cross / bearings / destination / polarFrame / cellDistanceKm / centroidOfCells
      sphere-index.js           cube-map + neighbour-walk nearest-cell lookup (exact)
      sim-mesh.js               the fixed-resolution sim mesh; edgeKm, cell area, kmToHops
      mesh-bfs.js               hopDistance, hopsFrom, withinKm (true distance), floodFrom, reachesWithin, piecesOf, touches
    tectonics/
      config.js                 EVERY tunable, physical units; MECHANISMS (each mechanism's off-switch); `reserved` = later phases
      model/    crust.js (CrustRaster, CELL_FIELDS, enums)  plate.js  world.js (TectonicWorld, EventKind)
      init/     cratons.js  landmass.js  rim-trench.js  start-world.js  measure-start.js
      step/     kinematics.js  gather.js  reconstruct.js  polarity.js  resolve.js  occupancy.js
                contact.js  boundaries.js  forces.js  torque-balance.js
                orogeny.js (belts)  collision.js (per-pair records, suture / docking / arc scraping)
                wings.js (trench wings + fore-arc capture, island arcs)  margin-isles.js (fore-arc islands)
                rifting.js (when and where a continent rifts)  subduction-init.js (foundering margins)
                hotspots.js (plumes, LIPs, tracks)  backarc.js (slab rollback, back-arc seas)
      ops/      merge-plates.js     suturing with the outline redraw
                accrete-terrane.js  terrane / arc docking (subduction jump, polarity reversal)
                scrape-arc.js       arc crust shaved onto the plate it meets
                collapse-arc.js     an arc collapses onto its own coast (fore-arc closure, front retreats)
                birth-ocean-plate.js  a plate carved out of the passive ocean
                tidy-plates.js      integrity: fragments, pinholes; transferCells, freeCellBeside, bridgePieces
                rift.js             the rift path (Dijkstra over the landmass) and the split
      scenarios/  scene-kit.js  rigid-drift.js  wilson-cycle.js  start-world-nudge.js  force-scenes.js  event-scenes.js
                  rift-scenes.js  hotspot-scenes.js  margin-scenes.js
      simulate.js               the stepping loop
      snapshot.js               Frame: the world-frame picture everything downstream reads
      measure.js                measurements on Frames (margins, tallies, force situations)
    view/       map-raster.js  palettes.js (colours and name tables)   (DOM-free: also used by the Node tools)
    app/        lab-main.js  globe-view.js  overlays.js
      phases/   phase-kit.js (the Phase contract + shared helpers)  phase1 … phase7b
  tools/
    lib/check-kit.mjs           mesh set-up, PASS/FAIL reporter, lab-module smoke test, shared frame helpers
    check-phase1…7b.mjs         headless acceptance checks, one per phase
    check-invariants.mjs        invariants through whole histories (land, dead plates, terrane ids, cratons, fields)
    check-scale.mjs             40K vs 80K cells agree in physical units; recording rate never changes a history
    trace-forces.mjs            print speeds / targets / situations through a force scene
    trace-collisions.mjs        print collision records, events and belt statistics through a scene
    render-frames.mjs  render-start.mjs   PNG frames of a scene / of start worlds
    shoot-lab.mjs               Puppeteer screenshots + page smoke test (desktop and phone)
```

Still to come, as planned: `terrain/` (Phase 8) and the real app (worker, UI, export).

Conventions that the review pass (2026-09-21) made explicit:
- **One config path.** `new TectonicWorld(simMesh, seed, overrides)` → `world.config`; engine code
  reads `world.config` only, never the `TECTONICS` defaults.
- **Test scenes keep their own data in `plate.scene`** (prescribed motion, notes); the engine never
  reads it. Scenes and checks look plates up by name, never by index.
- **Distances are km.** Use `withinKm` for a guarantee in km; `kmToHops` only where a hop count is
  really what is meant (smoothing reach), never a bare integer.
- **A lab phase is a module exporting `createPhase(simMesh, seed, overrides) → Phase`**; the
  contract is written down and asserted in `app/phases/phase-kit.js`.
- **Every check script is built on `tools/lib/check-kit.mjs`** and ends by loading its lab module
  the way the browser does.

## 7. Performance & scale invariance

- Sim cost is independent of the Detail slider. Per step ≈ `simCells × candidatePlates`
  exact nearest-cell lookups (cube-map start + neighbour walk, bounding-cap culled). Measured on the
  40K-cell mesh: ~2.5 ms/step for prescribed motion with 4 plates, ~7–15 ms/step with the force model
  and crust growth (Phase 4 scenes: 60–160 Myr in 0.1–1.5 s). Budget for a full 600 Myr history: a few
  seconds in a worker. A "history quality" option can trade cells/steps for speed (mobile default lower).
- All distances in km, times in Myr, speeds in cm/yr; hop counts are always derived from
  `targetKm / avgEdgeKm`. No raw cell-count constants.
- Deterministic from the seed (planet codes keep working); the code will gain a version
  field + history parameters.

## 8. What this unlocks later (not in the first milestone)

- **Heights as evolving state (developer idea, 2026-09-21) — built in 8a, 2026-09-25** (see §10). Still open: heights
  never feed back into the history (developer: decoupled "for now, or maybe forever"); a COARSE DRAINAGE model run
  during the history — pre-carving ridges, antecedent "Grand Canyon" rivers that keep cutting as the rock rises — is
  wanted for 8b.

- **Timeline scrubber** — watch the world assemble and break up (GPlates-style playback).
- **GPlates export** (`.rot` + plate polygons) so WBP-style worldbuilders can continue by hand.
- Plate editing evolves from "toggle land/ocean" into steering history: pin a craton,
  force a rift here, choose extroversion vs introversion, pick the end phase.
- Geology layers: crust age, terranes, orogen age/type map (exactly WBP's GPlates maps),
  resources later (ophiolites, arcs, cratons).
- Paleoclimate: run V1 climate on any snapshot.

## 9. Phased delivery — every phase is a gate

Decisions (2026-09-20): V2 lives in `v2/` beside V1 · rule-based, event-driven, but
**physics-informed** (torque balance for plate motion, slab pull scaling with slab age,
half-space cooling for ocean depth, Airy isostasy for crust thickness → elevation,
exponential erosional decay) · basics visible in the browser from the first phase ·
**no phase starts until the previous one has been confirmed by the developer.**

Every phase ships (a) a scene in the browser lab `v2/index.html` that isolates exactly
that component, (b) an on-screen checklist of what to verify, and (c) a headless check
script `v2/tools/check-phaseN.mjs` with numeric pass/fail. Early phases use small
hand-built test scenes so one mechanism is visible at a time; the real generator only
comes together in Phase 6.

**Status (2026-09-26)**

| Phase | Status | Check script (checks) | Lab scenes |
|---|---|---|---|
| 1 rigid kinematics | accepted | check-phase1 (14) | rigid drift |
| 2 ridges & trenches | accepted | check-phase2 (20) | Wilson cycle |
| 3 start world | accepted | check-phase3 (27) | generated start worlds |
| 4 driving forces | accepted | check-phase4 (40) | one-sided, tug, wilson, india, start |
| 5a collisions | accepted | check-phase5 (25) | the Phase 4 scenes with events on |
| 5b wings, arcs, terranes | accepted | check-phase5b (25) | wings, terrane, arc, arc-collision |
| 6a rifting | accepted 2026-09-22 | check-phase6 (21) | plume, breakup |
| 6b new trenches, ocean plates | built 2026-09-22 | check-phase6b (19) | founder |
| 7a hotspots & LIPs | built 2026-09-22 | check-phase7 (23) | hawaii, deccan, history |
| 7b margins, back-arcs, belts, fore-arc islands | built 2026-09-23 (two rounds) | check-phase7b (33) | margins, laramide, mariana, japan, history |
| code review A–D | 2026-09-23 | check-invariants (11), check-scale (7) | — |
| 7c crust budget | built 2026-09-24 | check-phase7c (19) | erosion, india, arcs, history (600 Myr) |
| 8a tectonic surface (records + heights before carving) | accepted 2026-09-26 (built 2026-09-24; rounds 2–4, evolving heights 2026-09-25) | check-phase8a (47) | andes, laramide, india, mariana, japan, hawaii, rift, traps, history |
| 8b-1 rivers carve the surface (analytic stream power) | accepted 2026-09-26 (built 2026-09-25) | check-phase8b | the same scenes, carved; every frame |
| 8b-2 rivers through the history (gorges, persistence) | accepted 2026-09-26 (built 2026-09-26) | check-phase8b (24 with 8b-1) | history, india |
| 8b rounds 3–6: mountain shape, ridge noise, start swells, flood basalts, relative mantle swell, belt scraps | accepted 2026-09-26 | check-phase8a, check-phase8b | traps, history |
| 9 steady detail: records read on each plate's crust; fine detail renews slowly (9B, stale belts at the source, moved to 11) | accepted 2026-09-26 | check-phase9 (8) | history, india |
| 10 cratons against the ranges: rim belts, the edge as a line, forelands, craton characters (the craton count: tried, dropped) | accepted 2026-09-26 | check-phase10 (8), check-phase5 re-baselined | cratons, india, history |

The roadmap from here — 9 steady detail, 10 start-world defaults, 11 natural collisions, 12 sim resolution, 13 the
supercontinent cycle, each with its definition of done — is plans/V2_ROADMAP_PHASES_9_13.md.
Phase 8 closed 2026-09-26. Before Phase 9 (developer: "the parked are the most important things … before moving
forward"), the parked items get their own phases, each with a definition of done agreed with the developer first:
the supercontinent CYCLE (bursts of rifting with quiet spells in which the pieces reassemble); heights feeding the
history (a height ceiling that turns into width — plateaus — and belt shape by climate; wider Andean belts); the
records read in each plate's own frame (steadier coastlines and small rivers between frames); stale belt positions
fixed where the history stamps them; the history's speed. The build narrative of each phase is in §10.

| # | Phase | What you see in the browser | Confirm before moving on |
|---|---|---|---|
| 1 | **Foundations & rigid kinematics** — sim mesh, O(1) sphere index, plate-frame crust rasters, quaternion rotations, read-only reconstruction, lab viewer (globe + map, time scrubber) | 4 continent-only test plates, each on a fixed Euler pole, over a stationary pre-history ocean. Gaps shown black, overlaps tinted magenta — deliberately unresolved | continents stay perfectly rigid at any time; scrubbing back to 0 Myr re-tiles the sphere exactly; measured speed = configured cm/yr; Euler-pole markers behave like GPlates poles (near pole = spin, far pole = translation) |
| 2 | **Divergence & convergence rules** (still prescribed motion) — gap → new ocean crust with age, attached to the flanking continents' plates, symmetric ridges; ocean-under-continent and older-under-younger subduction; persistent trench polarity on the overriding plate; continental collision contact | Two-continent test ocean opening and closing; layers: crust age, crust type, trench flags, boundary kinds | symmetric age stripes about the ridge; trenches sit on the overriding plate and persist; ocean crust is consumed, continents are not; surface-area budget balances |
| 3 | **Initial world** — cratons, supercontinent, passive pre-history ocean, rim subduction as a smooth offshore trench on an ocean apron (WBP start state) | Generated start states for several seeds | 8–12 cratons of plausible size, ~25–30 % continental crust, organic outline, craton cores vs accreted crust, rim trenches |
| 4 | **Plate driving forces** (physics-informed) — slab pull, slab suction, ridge push, basal drag (ocean/continent/craton), collision resistance → torque balance → Euler poles | Force/torque overlay per plate, live table of plate speeds against WBP's cm/yr bands, speed-vs-time chart | speeds land in the right bands per situation; subducting oceanic plates fastest, passive-margin continents slowest; motion is smooth, no jitter or runaway |
| 5a | **Collision events** — orogeny belts (type, work, ages, thickness; widths by type, blocked by cratons, reactivating old sutures), per-pair shortening budget, suturing by resample-once with the outline redrawn (indentation + escape, rigid cratons) | Orogeny / Thickness / Weakness layers, before/after redraw overlay, WBP-style event log; scenes India, self-driven Wilson, Andean margin | India sutures by shortening, East–Far by stalling; belts of the right widths on the right sides; cratons intact and record-free; one connected plate afterwards; Phases 2–4 unchanged |
| 5b | **Arcs, wings and terranes** — ocean-apron capture with trench wings that extend past the land, arc crust along them, terrane/arc accretion with subduction jumping and polarity reversal | Wing + arc scene; microcontinent docking; arc meets passive margin | trench continues past the land; small terranes accrete without killing the trench; polarity reverses where it should |
| 6 | **Rifting & subduction initiation** — plume weakening, zig-zag rift paths that avoid cratons and reuse sutures, failed arms, hinge opening; old passive margins collapse into new trenches; plate birth/death | First full supercontinent cycle from a seed; named plates/continents (A, B… / i, ii… / 1, 2…) and period-style event log | conjugate coasts fit; failed rifts recorded; breakup → dispersal → assembly emerges; ocean floor mostly younger than ~200–250 Myr; plate count stays sane |
| 7 | **Secondary features** — hotspots & LIPs with age-progressive tracks, margin classification (leading / trailing / passive), slab rollback & back-arc basins, flat-slab (Laramide) flag | Feature layers over the Phase 6 history | tracks line up with plate motion; margin types match plate kinematics |
| 8 | **Terrain synthesis** (terrain mesh 160K–2.5M, km; §5) — 8a records + tectonic surface: ocean depth from age, isostatic platform, shelves by margin type, belt cross-sections by kind and side, strike-parallel ridges, volcanoes; 8b analytic stream-power carving: drainage, valleys, divides, plateaus eaten from their edges | Shaded terrain on a finer mesh, cross-section tool, ridge directions, hypsometry | ridges parallel to fronts, collision asymmetry, old low ranges, trenches and ridges in the ocean; 8b: dendritic valleys, Hovius spacing, ≈ half of land under 400 m; the same planet at every resolution |
| 9 | **Full-resolution planet** — projection to the render mesh, V1 erosion + climate reuse, worker, real app UI, planet codes, export, mobile | A V2 planet end-to-end | visual quality ≥ V1; generation time acceptable; all seven protected strengths intact |
| 10 | **Tuning & extras** — Earth-statistics harness (hypsometry, ocean-age histogram, speed bands, orogen stats), timeline polish, GPlates `.rot` export | — | — |

## 10. Decision & lessons log

**Build notes, Phases 3–7 (moved here from §9's status)**

Status (2026-09-22): Phases 1–4 reviewed and accepted by the developer, followed by a full code-review pass (§10). **Phase 5a (collision events) built and accepted; Phase 5b (wings, arcs, terranes) built and accepted; Phase 6a (rifting) built, third round**: `node v2/tools/check-phase6.mjs` passes 18 checks; the start world produces a 300 Myr history by itself — on every seed tried the supercontinent rifts within 2–18 Myr into two compact pieces (long ÷ short axis 1.3–1.9), then 8–12 rifts and 3–7 sutures follow, with at most one quick re-weld of rift partners per history. Island arcs are scraped onto the continents they meet instead of welding plates where they touch, so a suture marks the meeting of the CORES (`ops/scrape-arc.js`; scene `arc-collision`). Earlier phases' scenes isolate their own mechanism (5a: no wings, no rifts; 5b: no rifts). **6a accepted by the developer 2026-09-22. 6b first half built the same day — subduction initiation (`step/subduction-init.js`, scene `founder`, `check-phase6b.mjs`, 14 checks): an old, long, trenchless margin founders into a new trench with the older side going down, which starts a still continent moving and closes an ocean that had opened. Oceanic plate birth followed (`ops/birth-ocean-plate.js`): the pre-history ocean is a modelling device, not a plate — it never moves, never pushes back and never accepts crust — so a trench may not simply found against it. Instead the old ocean within `oceanPlateReachKm` of the new margin becomes a plate of its own (Thalassa, Thalassa 2, …), free to move under slab pull and to take crust at a ridge; the start world's 300 Myr now grows real oceanic plates beside its continents. The segment-wise polarity vote finished 6b: the contact cells of each plate pair are split into connected segments, each votes on the physical rules (an established trench counting several times over), and the winner holds for the whole segment — measured on the start world's 300 Myr, the share of neighbouring ocean boundary cells playing opposite roles falls from 8.6 % to 4.1 %, and `segmentPolarity` can be switched off to see the difference. **Phase 6 is complete. Phase 7a (hotspots & LIPs) built 2026-09-22** (`step/hotspots.js`, scenes `hawaii` / `deccan` / `history`, lab phase 7a, `check-phase7.mjs`, 20 checks): plumes are fixed in the mantle frame; each head erupts a LIP (traps on land, a plateau at sea) and, under a continent of riftMinContinentKm2 or more, splits it with plumeRiftChance — the 6a plumes ARE these plumes (developer decision 1); new plumes are drawn with a bias toward mantle a continent has insulated, which the mantle remembers after the continent leaves (`world.mantleHeat`; decision 2, "not perfectly": plumeOceanWeight 0.3); each tail stamps an age-progressive track. Over the start world's 300 Myr: 18–23 plume heads, ~12 live at a time, 7–10 rifts of which ~2 by a plume (no more rifting than before 7a). **Phase 7b built 2026-09-23** (`step/backarc.js`, flat slabs in `step/boundaries.js`, `classifyMargins` in `measure.js`, scenes `margins` / `laramide` / `mariana` / `japan` / `history`, lab phase 7b, `check-phase7b.mjs`, 25 checks). Developer: back-arcs both at sea and at continental margins (decision 3: real). A back-arc opens where a trench retreats faster than its overriding plate follows (rollback rises with slab age, up to rollbackMaxCmYr); the strip is everything of the plate within backArcWidthKm of the trench (backArcContinentalWidthKm where it fronts a continent, so ~300 km of coast goes with it), never a craton, and a continental strip must be one coherent body of land. While the sea opens (backArcActiveMyr) the strip follows the slab's retreating hinge — parent motion + rollback — not the force balance, which flung small light strips at 20 cm/yr; then it rejoins its parent, the new sea kept (as the Sea of Japan moves with Eurasia today). Over the start world's 300 Myr: 3–7 back-arc seas, rifting unchanged, the fastest plate ~10 cm/yr, 12–18 s. **7b second round (developer review, 2026-09-23):** (1) a belt's reach is set PER FRONT CELL, not per plate: it grows with the convergence that stretch has absorbed (lower bases, so a young margin starts narrow), with its closing rate, with how head-on the plates meet (× beltObliqueMin…1 by cos² of the obliquity — oblique convergence goes into strike-slip) and, at a trench, with the slab's youth (a ridge close offshore: up to × 1.5; an old slab × 0.75); `spreadBelt` carries each front cell's own reach inland. The Laramide belt migrates inland with the length of slab gone down FLAT (`plate.flatSlabKm`): 600 → 1600 km over ~20 Myr, and stops when the slab ages and steepens. Collisions take the obliquity factor too. (2) Transforms pressed together raise a narrow TRANSPRESSION ridge (new OrogenyType, never escalates another). (3) Fore-arc islands (`step/margin-isles.js`): between an active continental coast and its trench, islands rise at random, grow and merge into the mainland until the land reaches almost to the trench (a strip marginIsleGapKm is always left); over 300 Myr the continents end ~14 % larger than without. (4) Bug: a back-arc strip that rejoined its parent vanished — resampled onto the parent's lattice it left a seam of empty cells, tidyPlates took it for a fragment and handed it to the strip, which had just been retired. Fixed at both ends: the seam is bridged (`bridgePieces`), and a fragment never joins a dead plate. **Phase 7 is complete; Phase 8 (terrain synthesis) is next.** A supercontinent CYCLE — bursts of rifting separated by quiet spells in which the pieces reassemble — is wanted but belongs to a phase of its own, not to 6a/6b. Check counts: 14 / 20 / 27 / 40 / 25 / 25 / 21 / 19 / 23 / 33.

Performance: a 300 Myr history takes ~20 s headless (was 79 s before the crust-growth work described in §10).
Phase 5 decisions by the developer: plates merge by **resampling once** into the upper plate's frame; continents **must be deformed** at collisions, emulating WBP's hand-redrawn outlines (indentation, escape, the orogeny spread over the deformed zone) — not kept rigid with thickness only.
Phase 4 as built: quasi-static torque balance per plate (3×3 drag tensor from the plate's own crust; ocean < continent < craton), slab pull on subducting plates, slab suction on trench-bearing plates, ridge push, viscous collision coupling that locks colliding plates; trench forces scale with slab maturity (km already subducted); trench rollback keeps a trailing trench at the plate's edge; boundary length is measured along shared cell edges. A subducting plate is held back by the mantle's resistance to its sinking slab (`slabResistance`). Two constants calibrate speeds to WBP's table: `mobility` (continents) and `slabResistance` (subducting ocean plates). The pre-history ocean never moves.
Developer requirements added during Phase 3: there must ALWAYS be sufficient space between cratons and between cratons and the sea (hard minimums `cratonMinGapKm`, `cratonMinCoastKm`, verified by measurement on every seed and slider extreme), and cratons / terranes must vary clearly in size (`cratonSizeRatio`).
Engine rules added in Phases 2–3 (all in `step/resolve.js`): crust grows on each plate's own lattice, split along the true mid-line of a gap, with half a cell of clearance; new crust forms only where a plate's edge is not advancing (never at a closing boundary); plate outlines with a trench are smoothed over ~1400 km so trench lines are long arcs and no lee-of-headland slivers form.

Newest last. Each entry is something a future change must not silently undo.

**Decisions by the developer**
- V2 lives in `v2/` beside V1; rule-based and event-driven but physics-informed; visible in the
  browser from Phase 1; **phase-gated** — nothing starts until the previous phase is confirmed.
- Code must be more organised and compartmentalised than V1.
- **Continents first** (§3): only land is a primary moving object; the pre-history ocean is one
  passive plate; new ocean is attached to the flanking continents' plates.
- **Plates are larger than their land** (§3): trenches are smooth offshore lines on an ocean apron
  and must eventually continue past the land as wings with island arcs (Phases 5–7).
- Start world: there must *always* be sufficient space between cratons and between cratons and the
  sea; cratons and terranes must vary clearly in size.
- When generator settings compete: spacing minimums are never relaxed → the continental fraction
  is hit as closely as possible → **craton size is what gives way** (down to `cratonMinAreaScale`).
  The craton-share setting is therefore an upper bound.

**Lessons from building Phases 1–4**
- *Test scenes must be unfair.* Symmetric spreading looked right at 2.5 vs 4 cm/yr and was badly
  wrong at 1 vs 6. Use strongly unequal speeds, off-centre trenches, several seeds.
- *Never decide crust growth per world cell* — see §4. Related: measure ridge/flank results in the
  Euler pole's frame (crust flows along circles about the pole), not in bands of latitude.
- *Average the boundary normal.* The direction to a single neighbouring cell makes a sliding
  contact read as opening or closing at random.
- *A trench needs a slab before it can pull.* Without `slabMatureKm`, any edge that advanced over
  old ocean became a full-strength trench at once, which sped the plate up, which built more
  trench: a runaway.
- *A trailing trench must roll back with its plate*, or balanced pulls can never stay balanced and
  a ringed supercontinent drifts.
- *Smooth plate outlines over ~1400 km, not ~450.* Broad embayments shed new crust in their lee,
  which later ends up on the trench.
- *Guarantees are enforced, not hoped for.* Craton↔craton spacing comes from packing at full
  reach; craton↔sea spacing is applied after shaping, by distance on the mesh, so no shape or
  noise function can break it. Both are verified by independent measurement.
- *Checks must load what the browser loads.* A syntax error in a lab module passed every numeric
  check until the check scripts also imported the phase module.

**Code review after Phase 4 (2026-09-21)** — two independent reviews (engine, lab + tools); everything
they found was fixed, and each fix has a check that would catch its return.
- *India's speed had been the speed cap, not the physics.* The force balance alone wanted 44–55
  cm/yr; the 16 cm/yr on screen was the cap plus relaxation. Fixed with slab resistance; caps are
  now a backstop (25 / 10 cm/yr, applied to the fastest point of the plate) and the checks fail if
  one ever engages. India now runs at ~9–10 cm/yr and drops to ~3 on contact.
- *Holes were being hidden.* Crust growth could refuse a cell forever (its "closing boundary" test
  used a one-cell normal), and the display papered over the hole. Now: the motion-based rule in §4,
  explicit provisional cells, and checks on their width and lifetime.
- *`edgeRad` was 22 % too small* (π/√n instead of √(8π/(√3·n))). Everything in km that went through
  it shifted: forces, step size, mid-line clearance. Re-calibrated (`mobility` 3.0,
  `slabResistance` 30); Phase 1 now measures the real neighbour spacing against it.
- *The craton↔sea guarantee was a hop count in disguise* and broke once `edgeRad` was right. It is
  now a true-distance dilation (`withinKm`) and holds to the kilometre at every slider extreme.
- *Same seed, different browser → different world:* a random-comparator sort consumed an
  engine-dependent number of random draws. Replaced with Fisher–Yates.
- Smaller: slab length has its own field (`slabKm`) instead of riding on the orogeny record that a
  quiet spell resets; plates are solved against start-of-step velocities (order-independent);
  frame 0 carries forces and the last frame lands exactly on `untilMyr`; runs can be resumed;
  circular mean for ridge azimuth; contact normals that cancel no longer read as "interior".
- Lab: a broken phase shows its error and keeps the previous one; keyboard shortcuts no longer
  steal keys from form controls; the layer survives a rebuild; force arrows share one scale
  through a run; ✓/✗ is only shown once a plate has settled at the speed its forces call for,
  using the same classifier the checks use (`measure.js`); 44 px touch targets and a full-width
  scrubber on phones; the URL carries phase, seed and every scene / generator setting.
- *Lesson:* a check that re-derives its expectation from the engine's own code path proves
  nothing. The rigid-shape check now compares against an independent Rodrigues rotation; the
  slider-range check reads the ranges from the lab module; the situation checks read each scene's
  `expect`.

**Phase 5a (2026-09-21)**
- Built as designed above; three bugs the checks caught on the first run are worth remembering:
  a belt spread along the sea apron and entered land everywhere (belts may now cross sea outward
  only, and no further than the apron); the plateau belt painted at suture crossed the seam into the
  lower plate (belts take an `allow` side); a craton could be a belt *source* when the front reached
  it (sources that are cratons take no record).
- Measuring collisions from frames is subtle: an overlap cell shows only its owner's crust, so land
  and craton counts "before" a suture undercount what is hidden under the other plate. Frames now
  carry `collider`; compare with the moment of contact, not the frame before the suture.
- Thickness is a record (`thickeningPerWorkKm`), not isostasy; Andean margins count only a share
  (`andeanWorkShare`) of the slab going down as shortening, or they thicken absurdly.
- The Andean rule can legitimately put a small belt near the tips of a trench sector on the "wrong"
  side: a slightly rotating plate's rim overrides old ocean there and a real trench forms.
- Phase 5b, same day. Wings: a first version chained (a captured cell grew again in the same pass),
  then ran round the apron rim (along-strike from a convex rim hugs it), then curled back over the
  continent (the wrong side of "perpendicular to motion"), then ballooned (a half-plane fill grabbed
  ocean beyond the tip). Each fix is a line in step/wings.js; the picture that survives is WBP's:
  a trench along the plate's leading edge, past the land, fore-arc behind it, arc after ~70 Myr.
- An accreting arc must bring its fore-arc (the flagged trench rim in front of it): left behind, a
  sliver of the old plate sits between the continent and its new arc and the two pull apart.
- Third round: "plates are growing still too much in the direction of movement" and "I did NOT want
  the arc to meet as a whole… each PIECE of the arc to fuse on". Measured properly (from each coastal
  cell facing the motion, march forward until the plate ends): with no wings the coast-to-trench
  distance sits at 364 km (the apron + a cell) for 270 Myr, so the plate's front does not advance; a
  straight wing past a ROUND continent leaves a triangular fore-arc between the wing and the curving
  coast at the corners (WBP's picture too), which reads as ~600–850 km ahead of the corner coasts and
  is what arc accretion closes. A blunt "trim the leading side to an apron" rule was tried and
  reverted: it re-formed the trench beside accreted arcs and arcs piled onto arcs (1 900 arc cells).
- Fourth round: "land totally disappears on collision" — the collapse right after a docking squashed a
  2–3-deep arc band onto a one-cell coast line and dropped the extras as sea (121 arc cells → 66). Now
  every arc cell lands and the count is conserved. Arcs mature sooner (`arcMatureConsumedKm` 1400)
  and widen with continued subduction (`arcWidenSlabKm`), so a chain of islets grows into clusters
  and long islands with age (developer). A wide arc is one connected island and docks as one body.
- Developer feedback on the first 5b build: arc pieces that touch the continent were left unmerged
  (docking needed overlap → now touching suffices, and the host is the continent's plate); arcs came
  out as dots (the arc itself counted as "land nearby" and blocked its neighbours → continental crust
  only, one row per trench, chains); plates grew forward (the fore-arc wedge reached ahead of the
  leading edge → clipped, and checked); and arcs that agglomerate onto land should make the leading
  edge lose space → ops/collapse-arc.js. Also found: a scene's 2-deep mature trench rim made a 3 Mkm²
  arc band that SUTURED as an equal (one row per trench line fixes it), and an accreted arc must
  bring its trench rim along or a sliver of the old plate is left between continent and arc.
- Second round of 5b feedback: after a docking the old plate persisted as drifting fragments
  ("swiss cheese") and arc pieces joined the continent tens of Myr late → ops/tidy-plates.js and
  whole-arc docking. Lessons: the piece a plate KEEPS must be its largest by area (keeping "the piece
  with land" handed a whole ocean plate to the background); a docked arc must arrive connected to the
  host; scene-construction slivers must be settled before the first step; and the 5a collision
  scenes now run with wings and arcs off (`NO_WINGS`) so they isolate collisions. The wings scene
  runs 300 Myr so arc chains can be judged over long spans (developer).
- Phase 6a lessons: pick rift arms by cost per km of chord, or the cheapest pair nicks the nearest
  coast / loops round one craton; conjugate margins one cell out of step read as a collision (lock!)
  and their touching as a docking — both exempted; a stalled seam welded plates that merely touched
  (now needs `sutureStallMinKm`); halves of a huge supercontinent part at 0.4–1.5 cm/yr and hinge,
  so a pinched end can re-suture — a failed breakup, which WBP also allows; rewritten rasters leave
  pinholes (ops/tidy-plates.js fillPinholes).
- Developer feedback on the first 6a build: cratons were being divided (a hairpin in the rift path
  let the two-colour flood colour a craton from both sides; the path also merely penalised craton
  cells) and the halves pivoted straight back into each other. Now: cratons are impassable to the
  path AND repaired whole after the split (checked every frame); a RIFT PUSH (`riftPush`,
  fading over `riftPushMyr`) drives each half straight away from its partner along ONE direction
  fixed at the split — along the local normals of a winding rift it only spun them; rift partners
  are exempt from collision records and the lock while the push acts; a rift must leave
  `riftMinPieceShare` of the land on each side; tortuosity capped at 1.4. The plume scene's halves
  now part at 6–9 cm/yr and never return; the start world disperses into several continents.
- Developer feedback on the second 6a build: rifts sliced off bits that collided at once, the first
  rift should come within ~30 Myr, and pieces should come out round or square, not elongated. Built:
  the start supercontinent is born old (`born = −riftTenureMyr`) and `riftRatePerMyr` doubled;
  a rift path must be monotone along its own great circle (`riftOverhangCells`: no promontory of
  one half sticks into the other); and the cut is chosen for compactness (`riftElongationBias`,
  from the second moments of each side's land). Doing this exposed the real bug behind the
  "slivers": the scoring flooded land only while the split flooded all crust, so the rift that
  happened was never the one scored — and the split's two-colour flood, seeded by a LOCAL left /
  right test at each path cell, mis-coloured cells at sharp bends; the craton repair then moved a
  whole craton across, leaving the land beyond it as a pocket on the wrong side, joined to its
  plate by ocean alone, which drifted off (as a "fragment" to the neighbour) when that ocean
  subducted. Now ONE partition (`partition` in ops/rift.js) serves both: the path taken out of
  the land leaves pieces, each on the left or right by where it touches the path; the largest
  right-hand piece parts, everything else stays; the path never crosses a craton, so none is ever
  divided; the plate's ocean follows its nearest land. The cut's shape is set by the junction far
  more than by the arm ends, so the compactness choice is made ACROSS junctions (`tryRift` takes
  the best of 12), among distinct cuts within `riftCostSlack` of the cheapest. Also: a cut-off
  piece whose land the host already covers is stacked beside it or absorbed (it re-logged every
  step for ever); fallback names X·n never repeat. Land counted in the world view jitters by a few
  cells per frame as plates move (raster land is exact), so the checks allow 1 %.
- Two rule changes were tried and reverted because they re-rolled Phase 4's marginal cases: trench
  inheritance judged by an outward normal everywhere (now only on wings), and neighbour-aware trench
  polarity for ocean–ocean contacts. The engine the developer approved stays as it is.
- Developer feedback on the first 5a build (same day): belt reach must be modulated by the speed and
  duration of the convergence, thickness must spread like the belt, the warp was not generous
  enough, and small seas / straits caught between welding plates must close (large ones may stay).
  All four built in; `check-phase5` grew to 25 checks (belt widens with time and with rate;
  thickness is a plateau; absorbed area may exceed the overlap).

- Performance (2026-09-22, developer: "creating a new world takes a very long time"): a 300 Myr
  breakup history took 79 s, 90 % of it in crust growth (`step/resolve.js`): for every candidate
  cell, a ring search (`nearestCrust`) per plate, each allocating a Set, and every plate a rival
  once bounding caps span the globe. Now the search marks visited cells in one reused stamped
  array, and a coarse occupancy grid (`step/occupancy.js`: 6° bins each plate marks during the
  gather; a bin's neighbourhood is every bin within 700 km, so no answer changes) skips plates and
  gaps nowhere near each other. 79 s → 19.5 s; every check suite unchanged. What remains is the
  real work: ~11k birth decisions and one 40K-cell gather per plate per step.

- Developer feedback after the third 6a build (2026-09-22): (a) island arcs were becoming the site of
  collision — "the plates fuse when island arcs butt up against one another, not when the meat of the
  plates hit"; (b) the cratons looked "honeycombed" and the land around them too evenly sized. For (a),
  arc crust is no longer a continent as far as collisions go: it does not lock two plates
  (`step/forces.js`), it takes no part in a collision record, and where it lies in an overlap it is
  SCRAPED onto the plate it hits (`ops/scrape-arc.js`, called from `step/collision.js`) while the ocean
  behind it keeps going down — so the record, the shortening, the belts and the weld all wait for the
  continental CORES. The scrape is deliberately lean: unlike docking it closes no seas and spreads no
  belt, because it runs every step while an arc arrives (the first version reused `accreteTerrane` and
  manufactured land — 11.6k → 17.4k cells over 300 Myr — which is what the developer saw as magenta
  spreading everywhere). New scene `arc-collision` and five checks in `check-phase5b` pin the sequence:
  arcs scraped at 110 Myr, collision record at 117, weld at 152 after 759 km of shortening.
  For (b): the craton size ladder is skewed so most cores are small and a few big (`cratonSizeSkew`,
  `cratonSizeRatio` 2.6 → 3.4), each core gets its own raggedness from harmonics k = 1…5 (k = 1 makes it
  egg-shaped), and cratons are now packed by the distance between their SAMPLED OUTLINES rather than
  between discs of their full reach, so lobed cores interlock instead of sitting on a honeycomb of
  circles. The land around them varies too: a continent-scale swell in the coast field (one side
  carries a wide shelf, elsewhere the cratons come near the sea), `coastReliefKm` 900 → 1200,
  `gapVariety` 0.6 → 1.0, `terraneBorderWanderKm` 220 → 380. Two consequences had to be handled: the
  skirt bisection now counts the land the way the landmass is finally made (enclosed seas filled,
  detached scraps dropped), or a ragged coast lost the requested continental fraction and the cratons
  were shrunk to 30–60 % for nothing; and a spanning-tree corridor of accreted crust
  (`bridgeHalfWidthKm`) guarantees the cores stay one landmass however deep the coast bites in.
  `withinKm` was also rewritten — it flooded from every source at once and could report a cell as
  within reach when it was not, which cost the craton↔sea guarantee on ragged coasts.

- A scene whose plates face only the PASSIVE BACKGROUND is worthless as a test (developer caught this
  on the first `founder` scene: "the 2 continents just basically spin, and the plate expands in EVERY
  direction"). The background never moves, never pushes back and never accepts crust, so the plate
  spins, a trench founded against it tows its owner outward for ever, and every gap it opens against
  the background is filled by the plate itself — growth in all directions. Every margin in a scene
  needs a real plate on the other side. The same insight drove oceanic plate birth in the engine.
  The checks were equally at fault: they asserted that plate SPEED rose after a trench founded, which
  pure spin satisfies. They now assert direction and outcome — the basin closes, the plates do not
  balloon, and the continents finally collide.

- Developer bug (2026-09-22): "pieces are colliding all the way through another plate when it should
  definitely be merging". A collision welded only on 600 km of shortening, or on a stalled seam. A slow
  but persistent collision met neither: in one 300 Myr history a piece had been grinding into another
  plate for 81 Myr with 314 km of shortening, closing at ~0.4 cm/yr — just fast enough never to count as
  stalled. Land cannot subduct, so the indenter simply ploughed on. Now a pair held in contact for
  `sutureContactMyr` (40 Myr) welds however slowly it converges, and a record whose plates have been
  apart for `collisionForgetMyr` is forgotten so a later meeting starts afresh. `check-phase6` asserts
  no contact outlasts the weld.

- Developer round on rifting realism (2026-09-22): weakness had grown to a quarter of all land, so rifts kept
  re-opening the same lines and shaving ribbons off coasts. `sutureHalfWidthKm` 140 → 80; a scraped arc no longer
  weakens its neighbours; `riftWeaknessCost` 0.45 → 0.75 (suture-following fell from 90 % to 56 % of rift cells).
  Failed arms were short and merely re-traced old weak lines: there are now `riftFailedArms` of them, up to
  `riftFailedArmKm` long, traced on a SECOND path tree with uniform cost so they strike out across ordinary ground
  and seed NEW weak lines. A rift must CROSS the land rather than run along its edge (`riftCoastClearanceKm`,
  `riftCoastHugKm`) — the cause of "a sliver attached to a big portion of the land in an unnatural way". Note that
  the elongation measure could NOT see that artefact: a blob with a thin tail still scores as compact, because the
  blob dominates the second moments. `mergePlates` now resets `born`, so a freshly welded continent serves its
  tenure again instead of coming apart at once (plume rifts still ignore tenure, by design). Cratons: 14 of them
  at `cratonShare` 0.24 — more, smaller cores, so a supercontinent reads as an assembly of many old pieces.
- Rifts record an orogeny of their own (`OrogenyType.RIFT`): the flanks a rift opened along are lifted into
  shoulders (East African Rift, the Western Ghats), recorded as a belt like any other so the terrain stage need
  not work out later where a rift ran. The FAILED arm is deliberately excluded (developer): an aulacogen sagged
  and filled with sediment, it was never lifted — it stays a weak, low corridor and a future river course.

- Developer feedback on the first 7a build: (a) LIPs must be irregular like cratons — the outline is now lobed
  (harmonics k = 1…5 at `lipLobes`, each province with its own raggedness) and bitten by finer noise
  (`lipEdgeNoise`); (b) a hotspot track must not read as a line of land — a plume erupts in BURSTS
  (`hotspotBurstMin…MaxMyr`) separated by quiet spells (`hotspotQuietMin…MaxMyr`), so each burst builds one
  volcano within `hotspotEdificeKm` and the chain is a string of separate edifices on a continuous swell (the
  swell keeps the age progression and the track's continuity). Whether a volcano breaks the surface is answered
  once, in `measure.js` (`volcanoTopKm`): pile height − sea depth from the crust's age (half-space cooling) −
  erosion since its last eruption. So volcanoes stand as islands near the plume and drown downstream into
  seamounts — Hawaii, then the Emperor chain — and on young floor (Indica's wake) more of them stand. Both use a
  stream of their own (`world.rngVolcano`), so the rest of the history did not re-roll.
- Phase 8b round 3 (developer, 2026-09-26): "we are losing some of the original and interesting shape of the mountains …
  slightly decrease erosion in each step … active boundaries should do less cutting and more shaping"; "Andean belts are
  not growing tall or thick enough … the leading and trailing ridges get lost quickly: mounds and mountain noise instead
  of eroded geological activity" (for all mountains). Measured first (history world, 640K): active belts kept their
  shape at r 0.928 against the uncarved surface, cut 0.39 km on average. (1) Active belts rise as fast as their rivers
  cut: river beds stand higher there by carveActiveHold (0.6) × activity — then kept monotone, so rivers stay whole — and
  the history's rivers cut toward a smaller share (riverActiveHold 0.6): shape r 0.989, mean cut 0.13–0.16 km. (2) A
  little less erosion at every stage: carving 0.6 → 0.5 Myr, riverHalfKm2 2 → 3 × 10⁵ km², the history's clocks ~10 %
  slower (uplift 185, crests 385, root 140 Myr). (3) The cause of the mounds: when heights began to evolve, most of each
  range went into the SMOOTH broad part (carried on 121 km sim cells, diffused) and only 0.2–0.3 of it stayed a sharp
  crest; the broad part now keeps plateaus and a low envelope (e.g. the Andean main range 0.8 → 0.35, collision fronts
  0.7 → 0.35) and the ranges are crests — which also wear on the slower crest clock, so old belts keep their structure.
  Less noise across ranges: alongStrikeVar 0.3 → 0.18, blendNoise 1.4 → 1.1. (4) Andes: crests 2.7 → 3.4 km, a wider
  main range, the plateau and eastern cordillera coming in smoothly in narrower belts, and the root ×2 (rootGain: magma
  added from below thickens an Andean margin beyond its recorded shortening; ×3 lifted old Andean margins — India's
  foreland — too much). Active Andean belts in the history world: 3–4 km across the belt (90th percentile 4–6.5 km), from
  ~2.3. Median land before carving 0.86 → 1.01 km (8a's ceiling recalibrated to 1.1: the developer's request), ~0.87
  after. Andean belt WIDTH is a history rule (baseKm 120 + 1 km per km of recorded shortening; the young, slow Andes
  scene reaches ~76 km): widening it changes every history — asked, not done.
- Phase 9, steady detail (2026-09-26; developer: "steady detail is critical"; "the goal is improvement and overall feel of
  stability, not perfection"). Measured with a test that turns the planet half a cell under the world grid and
  re-samples it as the history re-samples a moving plate (nothing geological changes, so whatever moves is sampling):
  interpolating over the plate's raster alone barely helped — the jitter was in the records themselves. Causes: (1) a
  frame carried only the world view, and ~15 % of a moving plate's crust cells are no world cell's nearest at any
  moment — near a coast a guessed hidden cell moved the shoreline by a cell (121 km): 404 of 427 coastline flips were
  at hidden cells; (2) the coast distance, shelves and belt directions were measured on the world grid, and the shelf
  noise read at world positions; (3) ridge kernels and volcanoes were placed per world cell (came, went or doubled as a
  plate moved); (4) a ridge lookup could miss kernels (corners two cells off). Now: a frame carries every plate's crust
  (crustCells, crustType, crustBelt, crustReach — records only, ~0.6 MB a frame; the history is bit-identical); the coast
  distance, shelves, coastal plains and belt directions are measured on each plate's own raster (a coastline on the
  raster of the plate whose land it is, the sea beyond included); the terrain reads a moving plate's records over its
  raster (anchorRecords); kernels and volcanoes are placed once per crust cell (anchor.js crustSites); a crust cell's
  records come from the world cell that shows it. Turned half a cell (640K, against the code before Phase 9): coastline
  agreement 92.4 → 97.4 %, land shape 0.65 → 0.89, ridges 0.44–0.47 → 0.65 (a ridge kernel's direction off by 15.5° →
  8.1° on average; the first figures, at 160K, gave the ridges as 0.32 → 0.57 — one draw of a handful of features: at 160K
  the resolution fade leaves only the broadest belts' ridges, and the measure swung by ±0.2 from seed to seed). Real frames 10 Myr apart,
  the continent that moved most: coastline agreement 87–95 → 94–97 %, land heights at the same crust 0.45–0.64 →
  0.52–0.78, rivers over 10,000 km² keeping their course 95–96 %. The small-river correlation of the plan (catchments
  from 300 km², under one 640K terrain cell of ~800 km²) was dropped for course persistence: a stream below the terrain
  mesh's grain re-forms whatever the records do (the terrain mesh is fixed to the world). Terrain at 640K 1.4 → 1.86 s.
  Stale belt positions at the source (9B): ~1.8 % of belt crust cells (174 of 9,632 at 600 Myr) — 68 left from an older
  stamp the current one no longer reaches, 104 stamped in the same step as their neighbours but far from them (most
  likely a weld's repainting of the seam); the terrain's repair (records.js) already removes the donuts they made, and
  fixing them in the history changes every history for ~2 % of cells — proposed to fold into Phase 11 (collisions).
- Phase 10, cratons against the ranges (2026-09-26; developer: "better ways to treat cratons so they blend with stronger
  mountain ranges that border up very close to them"; research and decisions in plans/V2_ROADMAP_PHASES_9_13.md).
  First, more and smaller cratons were tried for the untouched-land goal and dropped: 14, 18, 22 and 26 cratons gave
  30–51 % untouched continental crust at 600 Myr with no trend (the seeds differ more than the settings) — land is
  worked by breakups and collisions, which Phase 13 takes on. Then: a belt reaches onto a craton's rim in the history
  (cratonRimKm 150, at twice the cost per km, a third of the relief, no thickening — a thin-skinned fold-thrust belt; no
  event of any history changes, only records and heights; check-phase5's "cratons carry no record" became "only the
  rim, never the core"). In the terrain (terrain/cratons.js): the craton's edge a line — the signed distance to it on
  each plate's raster, moved by noise — for the shield's platform, its hardness and the rim over which a range fades;
  craton scraps under ~110 km deep read as their surroundings; a flexural foreland in front of the rim, loaded by the
  range within ~250 km outside (0.12 × its height, ≤ 0.3 km; a plateau's back 0.15 of that), deepest 100 km in, the
  forebulge at ~360 km; each craton (by terrane) a sag basin, a swell or a flat shield, plus a grain of domes and
  keels. A first try read the load at the belt cell touching the craton — the range's foot — and bent the shield by
  ~0.04 km: nothing to see; the range within 250 km is the load. Measured at terrain resolution (a profile binned by sim
  cell cannot show a foreland 100–300 km wide), in the new craton scene (the India collision with big shields on both
  sides): India's shield bent 0.15 km down in front of the range, Asia's 0.04 behind the plateau. A craton scrap takes
  the ground around it in the records (a shield never thickens: a scrap inside a plateau stood as a hole); the worst
  "scrap" left (0.77 km, 1.27 before) is the tip of a shield hidden in a collision's overlap, and the weld's redraw moves
  crust under rim records (a record ~280 km in after the weld, 184 before it) — both the weld's geometry, for Phase 11.
  The terrain's craton reads skip, exactly, points more than 200 km outside a craton with no craton corner (the edge
  noise moves the line ≤ 105 km): 640K terrain 2.10 → 1.96–2.08 s, heights byte-identical.
- Phase 11, natural collisions (2026-09-26; plan and definition of done in plans/V2_ROADMAP_PHASES_9_13.md). A land
  contact was a lock: the whole relative velocity resisted, so plates froze where they first touched and welded with the
  ocean beyond still open — 62–73 Mkm² seas sealed inside one plate, rings of continent round them. Now (torque-balance.js,
  forces.js) a contact resists the closing part of the motion along the front's normal (from the land on either side
  within two rings), half as hard along the front and 0.05 against parting: the lower plate pivots about the contact
  and the rest of the margin closes. The weld waits for the seam (collision.js): the sea within 500 km of both coasts
  a strip ≤ 100 km wide along the front — or stalled 24 Myr, or not shrunk by a tenth in 40 Myr, or 120 Myr locked;
  measured every 4 Myr. Two plates whose land rings a sea over 1.5 Mkm² stay apart (welded, one rigid plate would hold it
  for good) unless stacked 500 km deep on average; land stacked deeper than 250 km goes under the upper plate. A sea
  sealed inside a plate closes from its shores at 12 km/Myr (remnant-seas.js, its own mechanism switch); holes the
  redraw leaves are filled from their neighbours. Enclosed ocean now at most 0.8 / 18 / 8.3 Mkm² on the three seeds (a
  ringed ocean the three continents around it are closing, and a zipper's last frame). Lessons: the world view resamples
  a moving plate's raster, so a narrow neck's joining cell can be skipped — three checks (Phase 5's one body, Phase 10's
  scraps, and Phase 9's coasts through the world grid's records) were measuring that aliasing and now measure on the
  plate's own raster; most "stale" belt positions were a craton rim's and old seams' path costs or two belts meeting.
- Phase 12, the sim's resolution (2026-09-27; accepted, default kept at 40K "for the remaining testing" though the
  developer likes the look of 160K "a lot more"). Frames packed losslessly for the lab (tectonics/frame-pack.js: 4.3–4.5×
  smaller); maxCellsPerStep 1.0 → 1.5 (a third fewer steps); the Sim resolution setting (40K/80K/160K) in the terrain
  labs. Exact history optimisation found little room (a flat profile; the gather already tuned). The zipper scene fixed:
  a round Borea could never be zipped by a straight Austra (now a long Borea); the weld now waits for the sea between to
  be narrow at its widest where the coasts face each other (an average let a wedge through); and collisionResistance
  300 → 100 so a collided part keeps converging and the plate turns about the end of the seam instead of see-sawing about
  its middle. Lesson: look at a test scene in the lab before trusting a check that passes on numbers — the zipper's check
  passed with a 12° turn and a weld by the stall fallback. Left: India's foreland at the weaker lock (Phase 5a, 3 checks).
- Phase 13, the supercontinent cycle (2026-09-27; built, awaiting the developer's test). Baseline: every seed broke up,
  but nothing drew the pieces together (one seed of three reassembled, by chance) and rifts came at a steady 1–5 per
  100 Myr. Built: (1) a continent's rift chance × (0.05 + 5·heat⁵) of the mantle heat under it, and a rift's pieces over
  hot mantle may rift again after 5 Myr — breakup in a burst, quiet on cool mantle; (2) the mantle's flow, a basal drag
  on continental crust in the torque balance (step/supercontinent.js): out from the upwelling under the last
  supercontinent × the heat left there, and — once it has broken up, as that mantle cools — toward a downwelling set 90°
  away (orthoversion); a new supercontinent moves both; (3) riftWeaknessCost 0.75 → 0.9 for about half the rift length on
  old weak lines. Lessons: (a) pulling an assembled supercontinent toward the next gathering point slides it off its own
  mantle, which then never heats — the inflow must wait for the breakup; (b) a supercontinent that is a pile of 3–4
  unwelded plates cannot break up by rifting alone: each piece is boxed in by its neighbours and re-collides within
  ~10 Myr — the radial outflow has to be strong enough (0.025, ~10–50 % of a continental plate's boundary forces) to
  spread the pile; (c) landmass counting is fragile (two continents touching at a corner are one), so the cycle's states
  must hold 30 Myr, and "broken up" must be a split, not full dispersal (a 61/39 split that gathered again to 100 % went
  uncounted at a 50 % line); (d) the first rift of a new supercontinent is otherwise vetoed 60 Myr by the tenure every
  rift piece gets — the hot-mantle tenure is for rift pieces only, a just-welded continent keeps its full tenure.
  Choose your ending, built with it (developer: "go on and build out the 'choose your ending' version"): a history may
  end as a supercontinent, one breaking up, or continents dispersed — run on until it is in that stage and cut there
  (tectonics/ending.js, simulate's stopAt); nothing is steered, so the lab cuts an ending out of a longer run.
  check-phase13: 11 of 14; short of the targets: the first reassembly of one seed (220 Myr of 300–700), the reassembled
  supercontinent's thinness (0.41–0.47 of 0.5), untouched land at 600 Myr (25–31 % of 25 %). Found on the way: the cycle
  read the heat at an upwelling before any supercontinent had set one — every scene not starting as one crashed.
  Round 2 (developer's first look: the supercontinent "shouldnt happen until like 600 [Myr] in … its ok for us to put our
  hand on the scale"; "only TECHNICHALLY supercontinents, with thin strips"; too much land above 400 m; far-ocean arcs
  "huge"): the cycle is clocked (a period of 600–720 Myr per supercontinent: disperse, then gather), with the continents
  kept apart while dispersing (a repulsion, rare foundering of the young oceans, and a clump over 45 % rifting readily),
  a packing pull while gathering, landmasses counted with necks under 800 km apart, and the new one held together until
  it first rifts; Andean and plateau belts narrower and erosion quicker (land below 400 m 18–26 % → 42–46 %); arcs capped
  in width by their distance from continents, and open-ocean arcs submerged ridges in the terrain. Lessons: (a) forces
  that only bias motion could not keep continents apart — collisions weld them and a welded clump feels no force
  between its parts; the lever that worked was rifting the clump; (b) measure repulsion from a continent's edge, not its
  centre — big continents' centres are 6000+ km apart while their coasts touch; (c) "a ton of the land above 400 m" was
  mostly ACTIVE belts (30–44 % of the land), not slow erosion; (d) degenerate worlds exist: every plate welded into one
  has no boundaries (no tension, no outside for a rift, its world ocean taken for a sealed sea) — each needed a guard.
  Round 3 ("a bit too flat … like 40%"; "the overall landmass … decreasing over time"): erosion eased (130 / 100 Myr); the
  continental crust budget balanced — accreted arcs mature into continent (step/arc-maturation.js), smaller arc pieces
  dock, underthrustShare 0.8 → 0.25: 148 → 133–165 Mkm² over 1200 Myr (was 110–125), land above sea level flat (27.9 →
  27.5 %). Lesson: the land loss was old (Phase 7c's budget, visible only over long histories) — the arcs that balance it
  had simply never been allowed to become continent. Rifts ("way too straight … a bunch of rectangle continents") now
  follow the crust's grain — a smooth cost field in each plate's frame, ±0.9 over ~1500 km and ±0.4 over ~350 km; at
  ±0.5 the detours did not pay for their length and the cuts stayed straight. Plates ringing a big sea (Phase 11: kept
  apart so it can close) weld round it after sutureLockMaxMyr — held apart for good, they ground on without end and left
  seas inside supercontinents.
- The pace of breakups (2026-10-01; developer: "the supercontinent cycle is too extreme. During the supercontinent phase
  there is a long period of only erosion and 0 breakups. And during other phases there are way way too many breakups all
  at once … aiming for at most one major rifting event every 30 Myr, and closer to 50 … not more than 150 [Myr] without
  one, and really closer to 100. Use simulation to get closer-ish … then hard rules to ensure the 30 and 150"). Measured
  first (v2/tools/trace-rifts.mjs, the Evolution history, 4 seeds at 20K): 34–42 rifts in 1200 Myr, 23–31 gaps under
  30 Myr, up to 7 rifts in 30 Myr; quiet spells to 348 Myr around each supercontinent (the gathering's rift factor 0.2
  and the 100 Myr hold were applied to every continent on the planet). Now (step/rifting.js): the pace kept from the last
  rift anywhere — one a step, none within riftMinGapMyr 30 (a plume head then only erupts), the chance back over 30→60
  Myr (smoothstep), × (1 + ((gap − 90) ÷ 30)²) past riftDueMyr; at riftMaxGapMyr 150 a rift is forced (the last step before
  the gap would pass it; the likeliest continent of ≥ riftForcedMinKm2 6 Mkm², those outside the landmass gathering first,
  48 junctions, then looser shape rules — a just-gathered landmass is ragged and often admits no cut by the usual ones).
  The supercontinent's hold and the gathering's factor now apply to its own plates only. dispersalRepulsion 0.2 → 0.3 (the
  bursts had broken up pieces gathered too soon; with the pace the push keeps them apart: next supercontinent 460–910 Myr
  at 0.2, 560–730 at 0.3). Result (10 histories, 20K and 40K): 21–26 rifts, gaps ≥ 31 Myr, median 40–50, mean 46–59, the
  longest quiet ≤ 149 Myr, 0–2 forced per history. Side effects, for the developer's look: phase 7a — no plume-head rift in
  its 300 Myr history (heads arriving within 30 Myr of a rift only erupt); phase 13 — the burst check fails by design, and
  fewer rifts leave more land untouched, more lowland (43–48 %), a 10 Mkm² enclosed sea on one seed, crust growth to
  × 1.22 on one seed.
  Then, per piece (developer: "the rules dont apply to the whole world, but to each individual PIECE of continent … each
  piece has its own timer for when it CAN break. This resets when they fit together … shouldnt FORCE something to break
  apart if its too small … a limit globally … minimum at 10myrs"): each plate's clock runs from plate.born (reset for both
  halves of a rift and for a weld; a terrane docking does not reset it) — none within riftMinGapMyr 30, the chance back over
  30→50, × (1 + ((age − 90) ÷ 20)²) past 90, forced from 140 (riftMaxGapMyr 150 − riftGlobalGapMyr 10, so the world's floor
  cannot push it past 150) if it holds riftMinContinentKm2 — the clock for the forcing counting from when it grew that big
  (plate.bigSince: a piece grown big by accretion is not split at once for its years as a small one); the world: no two
  rifts within riftGlobalGapMyr 10. The supercontinent's hold and the gathering's factor stay on its own plates; no
  exemption from the forcing (welding resets the clocks). riftRatePerMyr 0.04 → 0.08 (with each piece paced, most otherwise
  rifted only when forced). A plume head under a piece too young (or the world in its 10 Myr) waits plumeRiftWaitMyr 30 and
  rifts once it may, from the junctions where it arrived (taken then in the plate's frame), with the looser shape rules if
  the usual admit no cut (otherwise none ever rifted: the start's pieces are young when the early heads arrive). Result (4
  seeds, 20K): pieces rift at 31–33 Myr at the least, median 48–58; no piece big enough over 148 Myr; world gaps ≥ 10, at
  most 3 rifts in 30 Myr; 31–42 rifts in 1200 Myr, 2–6 forced, 0–2 by plumes; the next supercontinent 550–690 Myr. The world
  may now go longer than 150 Myr without a rift when no piece is both big and old (one seed: 246 Myr). check-phase13's burst
  check became the pace check, and "keep apart" a 60 Myr window (riftMinGapMyr + 30); check-phase7's plume rift may follow
  its LIP by up to plumeRiftWaitMyr; the plume scene's Pangaea is born in prehistory (as the start world). Checks: phase 6
  21/21; 7a 22/23 (the old mantle-memory one); 13 14/18 (compactness, untouched land, open-ocean arcs as before; the
  enclosed sea 3.4 Mkm² on one seed; the timing now passes).
- Lab speed (2026-09-26, during Phase 11; developer: at 2.5M, pressing Play in lab 8b "freezes up … my computer starts
  whirring aggressively"; "first without changing the output, and then … cut corners"). The freeze: the play clock ran
  on while a 2.5M frame took 2–5 s to build, so the frame asked for had always moved on and nothing was painted; and the
  page's own thread rebuilt each shown frame's records (~0.3–2.7 s), copied nine component arrays nobody showed, sorted
  ~1M land heights for the stats (206 ms) and passed over the planet eight times every 300 ms. Now, pixel-identical
  (every layer of 8a and 8b hashed against the tree before): Play waits for a frame being built; records and components
  only when a layer shows them; the hypsometry by selection (16 ms); one cached stats pass; hillshade on a shading
  worker; the carving's inputs handed over, not copied — the page's thread ~91 % idle while playing, ~85 ms per new
  frame. The fans: every change rebuilt all 61 frames ahead on every core for 1.5–2.5 min — now only the ten frames
  next to the one shown, the way it is moving (developer's choice among four corner cuts; fewer workers, a coarser
  preview while playing and no carving while playing were declined). Exact, on the workers: carving's coarse-to-fine
  averaging field by field (2.2 → 0.9 s a frame at 2.5M, the same bits); each frame's plan built once, by one worker, and
  handed to the others (8 × 0.14 s → 0.14 s). "Similar but cheaper" (developer asked what is fundamentally heavy): a
  2.5M frame's surface is 27 % ridge kernels (28 phasors a point — the look; a narrower window is a tuning choice, not a
  look-alike), 19 % the plate-frame lookup (its warp: 12 noise evaluations), 14 % assorted noise, 13 % the profiles.
  The warp now reads a cube-map table (256 a face edge, bilinear, continuous across faces): 344 → 65 ns, within 0.3 km
  (1.8 km at worst) of the noise; heights at 640K move by 0 m median, 27 m at the 99th percentile, 36 of 640K cells by
  > 0.5 km, all on steep coasts — surface −14.5 %. A fast sine/cosine for the kernels was tried and dropped: V8's are as
  fast as a polynomial or a table (~17 ns the pair). Found on the way: a craton raster corner off the plate's crust
  read NaN, making NaN heights (2 cells at 300 Myr) that the carving spread over a whole basin (≤ 1.25 km) — now read
  on the world cells as the coast does; and check-phase8b's river-course correlation took log10(0) at points that were
  sea the frame before (0.27 now). The history (26 s for 600 Myr, 826 steps): 40 % the per-step reprojection of the
  plates' crust (resolve), 13 % boundary classification, the rest ≤ 7 % each — no look-alike; its speed goes with
  Phase 12's finer sim mesh.
- Carried ridges (2026-09-26; developer: "lets get creative on the parallel ridges … similar results?", then chose one of
  eight ideas to prototype, then "they look almost identical" → the default). The phasor sum (27 % of a 2.5M surface:
  ~28 kernels a point, 46 visited) is taken only at the corners of the plate's raster — turned into the world, so the
  field rides with the crust — and each point continues its three corners' waves (each corner's kernels' mean wave
  vector, signs turned to agree) to itself and blends them; where corners disagree their waves cancel in part and ridges
  fork and end, as they did where kernels disagreed. Corner sums are made lazily, per worker, per frame. Against the
  kernel sum: correlation 0.975 at 640K, 0.961 at 2.5M, the same rms; frame-to-frame agreement on the same crust
  identical (0.58 / 0.62 / 0.80 at 150 / 300 / 600 Myr — ~0 at the same world point); surface −19 % at 640K, −30 % at
  2.5M on one thread (a 2.5M frame on 8 workers 1.27 → 1.00 s). The kernel sum stays behind stripeCarry 0. Ideas not
  taken: contours of the distance from the front (nearly free, strictly parallel, but smooth contours never fork);
  fine ridges as the main ridges' overtones; a narrower kernel window (a tuning choice); ridge spacing from how the
  belt grew in the history (the sim's cells are coarser than the ridges); texture bombing (shears on curves); WebGPU for
  all per-point terrain (later, with the full planet).
- Fine detail renews slowly (2026-09-26; developer, after Phase 9: "something about 9A made things look worse, in that
  they were all a little bit too consistent. Some of the variation added to the charm and variety … a naturalistic way to
  add a little bit of that back in controllably? just a bit"). Compared with the code before Phase 9 at the same frame,
  nothing in a single frame had lost variety — coast length (132.5 vs 132.2 edges per 1,000 land cells), fine roughness
  (equal or higher in belts, near coasts and on plains), the spread of heights within a belt, and how much neighbouring
  ridge kernels disagree (14.7° vs 13.9°) all held; a regional bend of the ridges' strike was tried and dropped (barely
  visible, nothing to restore). What Phase 9 removed is change: the detail stood still on the crust for hundreds of Myr,
  where before every frame re-formed it. Now it renews (terrain-config detailRenewMyr, 150 Myr; a lab slider, 0 freezes
  it): each ridge kernel's phases drift at a rate of its own (up to a wave per period, either way — stripes.js, its own
  stream), so ridges fork and end in new places; and the coast's bays and headlands, the ridges' segments and crests and
  the ridge noise fade from one noise to the next over each period (cos/sin weights of two independent fields, so the
  spread never dips). Nothing else: the history's own shapes, the plains' grain and the lookup warp stay. From one frame
  to the next it holds (10 Myr: ridges 0.99, bays and headlands 0.995; the drifting continent's coastline agreement 96.9
  → 96.6 %, big rivers keeping their course 95 → 94 %); one period on, it is new (0.00, −0.04). With the period 0 the
  terrain is bit-identical to before; mid-period it costs ~4 % (1.86 → 1.93 s at 640K).
  Also found: the 8a check of the ridge noise's stretch measured along the world grid's strike (rec.across), which
  since Phase 9 is a few degrees off the strike the noise follows (the kernels', measured on the crust) — 0.68 along it;
  along the noise's own strike (the level lines of crossAt) 0.84.
- A heap bug in the terrain's distances (found 2026-09-26, measuring landmass shapes for the next phases): spreadKm
  (core/min-heap.js) queued a cell at its exact distance but stored it in a Float32Array, rounded; popped, a key that
  had been rounded DOWN in the store read as stale, and the cell never passed its distance on. Whole patches were
  reached late, by detours, or not at all — in one start world 1,299 land cells never reached from the sea, and the
  deepest "inland" point 15,800 km. Every distance the terrain spreads was affected: the signed coast distance (coastal
  plains, shelves, coast kinds), trench and outer-rise distances, belt fronts (the across-strike direction), failed rift
  arms, the flood basalts' edges. Now queued at the stored value. The history never used it (its rift paths have their
  own Float64 search): histories unchanged. Retuned on the true distances: the flood basalts' edge wear (lipEdgeKm
  150 → 100, lipEdgeWear 1 → 1.5); 8a's escarpment check compares the third of a province nearest its edge with the
  third furthest in (a province is ~120 km deep at median — no longer "400 km in").
- "Mountain donuts" (developer, 2026-09-26: "in some of the very small Himalayan pockets it looks like little mountain
  donuts or crescents"). Two causes, both in how the terrain reads the belt records (records.js; the history is
  unchanged). (1) Stale distances: the distance across a belt (u × reach) changes by at most the distance between
  cells, but the history leaves the odd cell with a stale one — at 600 Myr, 380 of 16,655 belt cells, e.g. a collision
  cell at u 0.95 amid its suture (u 0) — and interpolating across it swept the profile through its main range (71 km
  off the suture) all round the cell: a ring. A cell more than 1.3 cell spacings from its same-kind neighbours' median
  takes that median. (2) Scraps: a patch of belt a sim cell or two across (25 single-cell collision patches at 600
  Myr) sits on the suture, where the crests are negative by design (the suture valley between the ranges) — in a
  scrap that valley is the whole patch, sunk into the uplift around it: a pit ringed by ranges. A belt's crest
  structure now scales smoothly with the area of its patch (beltPatchMinKm2 20,000 → beltPatchFullKm2 200,000 km²,
  both sides of a collision together): a scrap is a mound of its uplift.
- Mantle heat at the start (developer, 2026-09-26: "on step 1, sort of all the land raises up a bit"): a bug. The start is
  old — the mantle under every continent already insulated (heat 1) — but that was set by the hotspots' first step, after
  the first frame was recorded: frame 0 read no heat, and at step 1 every continent rose by its whole mantle swell
  (swellKm 0.35 × heat²): the history world's median land 0.30 → 0.64 km, land below 400 m 61 % → 7 %, before carving.
  Now step/hotspots.js insulateAtStart sets it before the first frame too; the first step sets it again the same way:
  the event log and every later frame are bit-identical (only frame 0's mantleHeat changed). It also showed how much
  the swell weighs: under any continent that sits still the heat tends to 1, so the swell lifts most land by most of
  0.35 km — carved, 600 Myr: 24 % below 400 m and median 0.65 km with it, 38 % / 0.55 at 0.15 km, 45 % / 0.48 without
  (Earth ≈ half below 400 m). And the flood-basalt round moved it: 600 Myr median 0.81 → 0.65 km, since the history
  world's many old provinces were permanent 1.2 km pads and are now worn and stripped. The developer chose "relative but
  also a bit smaller": dynamic topography is relative — the land rises by swellKm (0.35 → 0.28) × the excess of heat²
  over its mean under the land that frame (records.js), never below it (no interior drowns): a supercontinent, all
  equally hot, gets none; a continent that sat still while the others drifted stands out. History world: median land
  (before carving) 0.30 km at the start, 0.39 at 20 Myr, 0.42 at 100, 0.53 at 300, 0.66 at 600; carved at 600 Myr, 40 %
  below 400 m and median 0.53 km (were 24 % and 0.65). Cratons — the old supercontinent's core, hottest mantle — fell
  most: 90th percentile 1.52 → 0.64 km (8a's craton ceiling back to 1.5).
- Phase 8b round 6, flood basalts (developer, 2026-09-26): LIPs were "just really flat boring ground … research what they
  look like and what noise shapes could be interesting … not just plateaus that ground down"; the developer chose all
  four proposed pieces. Research (primary descriptions): "trap" is Old Norse for a stair step — horizontal lava stacks,
  hard and soft in turn, so slopes and riverbeds are stepped; flood-basalt landscapes are plateaus and escarpments,
  canyons, mesas and buttes (Ethiopia's ambas); Putorana is "dissected almost to the entire height" by 800–1000 m
  canyons with stepped slopes; the Blue Nile gorge ~1.6 km; they last — the Drakensberg basalt ~1.4 km after 180 Myr
  with 0.5–1 km gone; caprock escarpments retreat parallel, leaving mesas, then buttes; giant radiating dyke swarms run
  out from the plume centre (Mackenzie: 2300 km). Before: a pad of up to 1.2 km that never wore. Now (terrain/lips.js):
  (1) the history records the wear (volcWornKm on LIP cells, lipWearKmPerMyr × the latitude's erosion; records only);
  the terrain strips the cap where a mesa noise (180 km, crust-anchored) stands below 0.7 × the share of the pile worn
  through (sooner near the edge, lipEdgeWear), in three tiers each dropping over about one cell: a plateau with a lobed,
  tiered edge; then an escarpment retreating with mesas before it; then buttes — a first version stripped by a smooth
  depth ramp and read as soft mottling, and a pad of 1.2 km barely shades: 0.6 → 0.75 km of height per km of basalt.
  In the traps scene: the cap stands over 95 % of the province 10 Myr after it erupted, 68 % after 100 Myr (67 % near
  the edge, all of it inside), 8 % after 250 Myr (the continent drifts through the wet tropics). (2) After carving, the
  basalt is stepped where cut into (carve.js terraceBasalt): an irregular stair (lipStepKm ± 40 %, a cliff over the
  last lipRiser of each step, steepening to the rim) applied by how far below the intact top the ground is — the
  unbroken top keeps its shape (terracing a dome would ring it like a wedding cake); never raises; a cell a tread left
  below the cell it drains into stands at that cell's height again (a first pass lifted every such cell and raised
  10,000 cells above the tectonic surface: now never above where it was). (3) Basalt canyons: hillslope limit × 3,
  rivers' k × 0.7. (4) Dykes: simplex noise around each province piece's centre in its plate's frame, fast with the
  angle and slow with the distance; the developer's first look: "very cool but too straight and perfect … a little
  wavy, not perfectly going out in every direction … slightly too large … no transition between LIP and the radial
  zone" — so each ray wavers sideways (dykeWanderKm), a slow noise around the centre leaves some sectors bare (fans),
  reach 2.5 → 1.9 radii, and it fades in from 150 km inside the lava's edge to 250 km outside (a signed distance from
  the real, lobed edge). The history's rivers see the pile (rivers.js) and cut into it. Lab: a new terrain scene,
  "Flood basalts through time" (the Deccan scene's head under a continent drifting slowly for 300 Myr).
- Phase 8b round 5 (developer, 2026-09-26): "1) strengthen ridge strength (increasing the highs and lows); 2) add
  ADDITIONAL ridge noise along each mountain range — SIMPLEX noise aggressively STRETCHED along the direction of the
  ridges (can increase or decrease things); 3) start the baseline with some large noise … that can erode over time and
  direct rivers more consistently". (1) stripeShare 0.22 → 0.3, stripeBaseKm 0.13 → 0.17. (2) Ridge noise over every
  belt: ± ridgeNoiseShare (0.25) of the belt's relief plus a little base, features 0.8 × the kind's ridge wavelength
  across and 8× that along, octaves faded by the mesh. Read first at the recorded distance from the front — that is
  interpolated only over the corners of the same belt kind, so it steps at triangle edges where kinds change, and in a
  narrow belt most triangles are such (the Andean ridges' angle to the coast went 23° → 33°). Now at a distance carried
  by the ridge kernels (stripes.js crossAt: each kernel's own distance continued along its across direction, blended by
  its smooth window; negative on a collision's lower side, so it runs through the suture): 23° again. In the India
  collision at 640K: ± 0.13 km (the stripes ± 0.04 — faded and textured), correlation with itself 45 km along the strike
  0.76, across 0.24. (3) Start swells, a crust record (baseKm): fbm ~2500 km across mapped so a quarter of the land stays
  low and a tenth stands near the full 0.8 km (median 0.09, 90th percentile 0.73 km); half on shields (cratons are the
  flattest ground — 8a's craton 90th percentile went 1.47 → 1.52 with them; the relative mantle swell later took it to
  0.64); worn by
  the relief clock's erosion (baseReliefTauMyr 200: mean 0.22 km → 0.03 km after 600 Myr); in the platform
  (records.js), so they taper to the coast with it and never lift a shelf, and in the history rivers' land height. At
  50 Myr big rivers run over 0.09 km of swell on average, divides over 0.22. Big rivers were already 90 % persistent and
  stay so. A 600 Myr planet: carved median 0.78 → 0.81 km, 21 % below 400 m.
- Phase 8b round 4 (developer, 2026-09-26): "the erosion changes went a bit too far and now things are too high, let's
  land in the middle". Measured on the history world at 600 Myr, 640K, carved: median land 0.69 km before round 3, 0.89
  at its peak. Halving each erosion change moved it little (0.84): the history's clocks, the Andean root and the rivers'
  half-depth drainage each move the median by 0.01–0.03 km. Most of the rise came from (3): crests wear on the slower
  crest clock, so the bigger their share of a range, the higher an old belt stands. So the broad envelope's range terms
  are halfway back (e.g. the Andean main range 0.35 → 0.575 of 0.8, collision fronts 0.35 → 0.525 of 0.7; plateaus
  unchanged), the history's clocks halfway (uplift 178, crests 368, root 135 Myr), carveActiveHold and riverActiveHold
  0.45, riverHalfKm2 2.5 × 10⁵ km², rootGain ×1.25, carving back to 0.6 Myr. Result: median 0.78 km, 23 % below 400 m,
  mountains (> 1 km) on 107K cells between 98K and 115K; the carving keeps the shape of active belts at r 0.976 (0.928
  before round 3) and of all mountains at 0.961. Median land before carving 0.94 km — 8a's ceiling back to 1.0.
- Phase 8b-2, rivers through the history (2026-09-26; developer: "the important part is to indicate a history of rivers
  in the terrain"; and "can we add more stability of small rivers between frames? (over time they can and should shift)").
  Engine: step/rivers.js (records only; the event log and every older frame field unchanged — verified; history 27.8 s,
  no measurable cost). First version cut toward full grading — at 121 km cells every cell is a river, and over hundreds
  of Myr they cut away all belt relief (median land incision 0.9 km): now toward a smooth share of the relief,
  A / (A + riverHalfKm2) — a stream notches, a great river cuts through (collision belt 90th percentile 1.1 km, plains
  0.08, deepest ~2.4 km in the India scene) — plus a floodplain valley on flat land. Big rivers keep their courses: 92 %
  of big-river crust cells still carry one 10 Myr on. Terrain: routing over the surface less the record, beds at least as
  deep as the history cut them — 1800 terrain cells in the India scene cut > 100 m deeper, up to 2.8 km: gorges through the
  belt. Small rivers: the paper's random receivers were white noise keyed to the crust position — a terrain cell sees a new
  crust point every frame, so small rivers reshuffled everywhere (log-drainage correlation between frames at the same
  crust 0.12); now steepest descent over a crust-anchored micro-relief (±0.1 km, 150 km): 0.2–0.3 depending on the window.
  Frames only 2 Myr apart score the same, so the rest is NOT the land changing: the tectonic surface's medium-scale shape
  is interpolated from records on the fixed world grid and re-forms as a plate moves (the limit noted for coastlines in
  8a round 4) — sampling the records in each plate's own frame is the fix, proposed to the developer. Lab: Rivers
  through time layer; sliders for the history's rivers (cutting speed, half-depth drainage; they re-run the history).
- Phase 8b-1 round 2 (developer, 2026-09-25): "much better, though I don't LOVE that we limit the rivers arbitrarily —
  more elegantly and smoothly". The on/off channel threshold is gone: every river carves its bed (the analytical
  solution for all cells), and a cell drops by the share of it its valley takes, valley width ∝ √(discharge) (hydraulic
  geometry; 20 km at 10⁴ km²) divided by the cell's size — a great river's valley fills its cell, a stream's is a sliver.
  The hierarchy of valleys is continuous, and the resolutions agree better than with the threshold (land below 400 m
  24 / 23 / 23 % at 160K / 640K / 2.5M; per sim cell r ≥ 0.998): a coarse cell holds more than its valley, so it drops
  less — its mean, as at any resolution. Valley sides: a critical gradient along the flow paths (the paper's thermal
  erosion as a limit) instead of hillslopes grown from channels. Checks: "rivers run downhill" on rivers whose valley
  fills the cell (elsewhere a cell is a blend of its ground and the bed); the plateau-gorge check at 0.5 km of cell-mean
  cut (0.75 measured; gorge cells now average shallower than their floor).
- Phase 8b-1 round 1 (developer, 2026-09-25): "too aggressive … too uniform and cutting too deep everywhere, seemingly
  cutting all the way down instead of descending against the existing topography … cutting through all the ridges".
  Three causes: at 2 Myr a big river's wave reached hundreds of km, so a valley floor took the height of ground far
  downstream (near the sea); channels from ~2000 km² made every upland the same dense network; hillslopes at 0.03 km/km
  planed off everything a few hundred metres above a channel within ~10 km — the fold ridges. Now 0.6 Myr (a valley
  floor drops to the ground a little way downstream: it follows the land's own slope and cuts deep only where the land
  falls steeply — mountain fronts, plateau edges), channels from 5000 km², valley sides 0.1 km/km (steeper with relief):
  ridges, grain and plateau tops survive, valleys cut back from coasts and edges. Land below 400 m 18 → 23 % (was 31 %;
  Earth ≈ half — the balance now rests on 8b-2 and the evolving erosion); the hypsometry check re-specified (moderate
  lowering, median kept ≥ 75 %). Slider range 0.1–5 Myr. The developer's next priority, before 8b-2: this look.
- Phase 8b-1, rivers carve the surface (2026-09-25; developer: no river lines by default; carve every frame of the
  history — "it will be interesting"; rivers may change from frame to frame, "somewhat realistic", and the history of
  rivers matters most — 8b-2). Method in §5 step 3 (Tzathas et al. 2024, read in full). Lessons: (1) carving EVERY cell
  as a channel (the paper's grids are metres; ours are 12–60 km) made a patchwork of valley floors with no hillslopes —
  choppy, faceted, and far more lowering at coarse meshes (all cells channels at 160K); channels only above a drainage
  area in km² (and ≥ 4 cells), hillslopes rising from them, fixed both: carved heights now agree sim cell by sim cell at
  160K / 640K / 2.5M (r ≥ 0.995, ≤ 0.14 km) with the same hypsometry. (2) Over a surface that is not monotone along a
  river the travelling wave leaves dips (7 % of channel cells stood below their receiver): channels are kept monotone
  downstream. (3) River beds can never go below the sea (the starting surface z − u·t is clamped at 0) and land stays
  land (a 2 m floor), or coasts drowned in strips. (4) Reach is wave speed × time: at 3 Myr India's plateau was cut
  everywhere (and the plains uniformly dissected); 2 Myr leaves a front of dissection moving inland — plateau cores kept
  (median 75 % of their height, gorges to ~1.9 km), plains partly whole — and 31 % of the land below 400 m (18 % before;
  Earth ≈ half: the remaining gap is the tectonic surface's upland, the balance to tune with the developer). Lab: phase
  8b (the 8a machinery as terrainPhase), the frame on screen shown at once and carved ~1–2 s later on a carving worker
  (carve-worker.js), every other frame surfaced and carved ahead in the background (carving pipelined with the next
  surface); layers Before carving, Carving depth, Drainage (the river network, off the terrain by default). Carving:
  0.2 s at 160K, 0.65–0.9 s at 640K, ~2.6 s at 2.5M (four levels), bit-identical on the worker.
- Phase 8a round 4 (developer, 2026-09-25). (1) "Shouldn't we have it precalculated and replay it?" — the history and
  its evolved heights already are; the terrain drawn from them was rebuilt per frame, and its fine detail did NOT persist:
  every noise was read at world positions (a drifting continent slid through a fixed pattern) and ridge phases / volcano
  shapes came from one random stream drawn in world-cell order (any change re-rolled everything after it). Now the detail
  belongs to the crust (terrain/anchor.js): noise is read where a point lies in its plate's frame (the corners' plates
  blended by weight where plates meet); every ridge kernel and volcano draws from a stream keyed by its crust cell (a
  hash, then mulberry32 — V1's makeRng gives correlated first draws for neighbouring seeds) and sits where that crust is
  now. A rifted plate keeps its parent's frame and raster, so its detail carries on; at a suture the lower plate
  re-anchors once. Measured: the noise-driven detail of a continent's interior correlates 0.97 with the same crust 10 Myr
  earlier (0.3–0.6 before, and only because the platform noise is broad); every volcano present in both frames keeps its
  shape exactly and moves with its plate. The coarse outlines still re-form at the scale of a sim cell as a plate moves —
  frames store the world view on the fixed 121 km mesh, not the plate rasters. (2) The lab builds the frame shown, then
  every other frame in the background, nearest first, heights only (16-bit metres) within a memory budget (320 MB, 64 MB
  on small devices; records made lazily when a layer asks); the store outlives a rebuild of the phase, so sea level and
  hillshade only re-shade, and a terrain setting rebuilds from the frame shown. Scrubbing in Chrome once built: 0.15–0.35 s
  at 640K (0.7 s to build), ~0.4 s at 2.5M (2.6 s). (3) Erosion's latitude contrast toned down, most at the equator: the
  exponent 0.8 → 0.6, and ×0.6 on it where wetter than the reference (equator ×1.74 → ×1.28, subtropics ×0.88 → ×0.91).
  (4) "Wear down higher places faster (really slower on lower places)": every clock runs × H/2 km below 2 km (never under
  0.5) and × (H/2 km)^0.5 above (at most 1.8) — H the belt's height above its plain (Ahnert 1970; Montgomery & Brandon
  2002; old ranges persist — Baldwin et al. 2003); basins fill back and rift escarpments retreat at their own pace.
  (5) "Erosion at this level can be toned down a little — the rivers will cut more in 8b": clocks 150/300/120 →
  170/350/130 Myr (uplift / crests / root), rifts 450. Calibrated on the 600 Myr planet by a sweep: median land 0.71 →
  0.86 km, 18 % below 400 m, belts quiet 300+ Myr keep ~0.4 km of uplift instead of 0.2 (the first try, 200/400/150 with
  a 0.2 floor, gave 1.06 km — "mountains everywhere"). (6) Ridges back up: stripeShare 0.14 → 0.22, base 0.1 → 0.13.
  (7) Volcanoes "more ridgey and irregularly shaped": each has a central edifice with an irregular outline (its own
  coordinates warped by smooth noise, plus low harmonics), ARMS — broad ridges from the summit that stay high then fall
  to their tips (a shield's 2–3 rift zones spread round it, an arc volcano's 1–2 along the arc), gullies in the lower
  flanks deepening with wear (faded where the mesh cannot show them), sometimes a flank-collapse amphitheatre, and flank
  vents out along the arms; arms join the edifice through an 8-norm (no crease; a plain rounded max lifted the whole
  footprint). Found on the way: in the Mariana scene the arc's crust carries an ANDEAN belt (the arc itself overrides the
  trench), so the island-arc volcano rule never fired, and the Andean belt's broad uplift lifted the arc platform to sea
  level (green speckle): arc volcanoes now take either belt, and a subduction belt's uplift counts 0.25 on arc crust (the
  arc's maturity already gives it its height, as for its root). A hotspot edifice now has an absolute top — the sea floor it
  stands on plus its height: where its footprint reached a coast beside it, it had added its whole height to the land
  (a 9.3 km peak); over higher ground it adds only what rises above it. Check changes: the rift-shoulder check
  reads the evolved uplift (0.77 vs 0.19 km) plus a smaller terrain margin — with the drawing's noise off, the shoulder
  margin was 0.24 km both before and after this round; the ±45 % along-strike noise had passed it by luck before and
  failed it now; the rainfall check expects the new, softer contrast. check-phase8a: 40.
- Phase 8a, heights evolve (developer, 2026-09-25: "I do want these heights to be evolving over time, not just taking
  the recent ones… bake in some of that history… histories of orogeny can accumulate over time more smoothly").
  Every crust cell now carries its height story on its plate (`step/heights.js`; crust.rootKm, upliftKm, rugged,
  prevRugged, volcWornKm): the root thickens exactly as belts thicken the crust (and as a slab underthrusts) and feeds
  Airy isostasy; the broad uplift rises toward the belt's cross-section (`broadProfile` × its relief) at the pace of the
  convergence its front absorbed that step (e-folding every upliftBuildKm of it) — a NEWER, LOWER belt never lowers what
  an older one left, only erosion does, so orogenies accumulate; a foreland basin still sinks under the load in front of
  a range, whatever stood there; ruggedness (the size of the crests and ridges drawn at terrain resolution) builds the
  same way for the current belt and is kept for the one it overprinted. Every step erodes all of it at the latitude the
  cell is at THEN (rain and ice tables of round 3, tabulated by latitude — a range that drifted out of the tropics keeps
  the wear it took there), and smooths the uplift sideways a little (hillslope diffusion, never into the sea nor onto a
  craton). Developer decisions: heights and history stay DECOUPLED (the heights never feed back; the event-log hash and
  every older frame field are unchanged — verified); river carving stays a final pass (8b), with a coarse drainage model
  during the history saved for 8b. Lab: the four erosion clocks re-run the history (in its worker) when changed.
  Result on the 600 Myr planet: highest point 7.7 km, active belts at their targets, belts quiet for more than
  ~250 Myr worn to low hills that still show their grain. Checks re-specified for evolving heights: the Andean main
  range is found by position across the belt (u 0.2–0.5), not by km from the coast — a young belt is narrow; India's
  plateau stands ≥ 0.75 km above the foreland (it has worn in the tropics since it welded). Fixed along the way: (1) the
  terrain workers were not sent the new height fields (FRAME_FIELDS; only the pooled check caught it); (2) small inland
  seas behind the Andean coastal range — single sim cells of ocean crust trapped in the land, each ringed by 150 km of
  drowned passive shelf: pockets under pocketSeaKm2 are lowland now, and a margin's kind carries along its coast for
  coastKindKm (a bay on an active margin gets the active margin's narrow shelf); (3) a valley between crests floors at
  sea level on a continent (not on an arc: an ocean arc IS drowned between its islands).
- Phase 8a round 3 (developer, 2026-09-25): volcanoes were "too perfectly circular" — each now has an outline of its
  own: drawn out along the arc or range it stands on (a hotspot shield any way: its rift zones) by up to 1 + coneElongation,
  lobed (three harmonics of ± coneLobes), often with satellite vents on its long axis. And "modulate erosion based on
  latitude based on a hard-coded estimate of precipitation averages": a zonal-mean rainfall table (rainByLatitude — wet
  equator ~2000 mm, dry subtropics ~850, storm tracks ~1100, dry poles) sets how fast every erosion clock of the surface
  runs, (rain / 1000 mm)^0.8 — a quiet belt's relief and root, rift shoulders, volcanoes wearing down and spreading; and
  (developer) "poles would erode fast … ice and glaciers": poleward of ~50° the rate holds at the storm tracks' level
  (glacialErosion, the larger of the two). Present latitude only (not the path the crust took) — superseded the same
  day by evolving heights, which erode at the latitude of each step. Lab: Erosion rate layer,
  a slider for how strongly erosion follows rainfall. 8b's carving will use the same factor for erodibility.
- Performance pass (developer, 2026-09-25: "drastically improve performance… DO NOT COMPROMISE the core algorithm or
  output… smart code optimization"; "also focus on the 2.5M cells"). Every change exact, verified by hashing a 600 Myr
  history's event log and all its frames (d113b02a… / df0837f0…) and the terrain's heights before and after. History:
  39.3 s → 26.3 s in Node (−33 %); 50 → 33 s in Chrome, now in a worker (page responsive, progress shown). Wins:
  nearestCrust reads precomputed rings (core/mesh-rings.js) instead of a ring BFS per call; the gather skips lookups for
  the unrotated background (cell w IS raster cell w) and — exactly — where the index's first guess lies over 3 rings from
  the crust's edge (the true nearest is always within 2 hops of the guess: measured on 1.7M lookups); each plate's
  world→raster map is reused between the two resolves of a step (same rotation); contactAt is cached per resolve;
  spreadBelt reuses its scratch arrays; arc collapse and fore-arc islands skip searches that cannot matter. Terrain:
  bit-identical fast noise (core/fast-noise.js), each corner's blend noise computed once, kernel fades once per
  synthesis; synthesis split into preparePlan + surfaceRange and spread over workers (terrain-pool.js: 2.5M cells
  5.2 s → 0.6 s a frame in Node, 0.5–0.6 s in Chrome; 640K 1.3 s → 0.2–0.4 s); terrain meshes built in a worker
  alongside the history, with a 4× smaller index table on huge meshes. Tried and dropped: testing "another plate has
  crust here" before the own-crust search (no gain). What is left in the history is spread thin over many stages.
- Phase 8a, the tectonic surface (2026-09-24; plan in §5). Engine: `spreadBelt` records each cell's belt geometry
  (`beltU`, reach, side, obliquity; crust.belt*), checked to leave the history byte-identical (event-log hash). Terrain:
  `js/terrain/` builds heights on a terrain mesh of any size; the lab draws it through a per-pixel barycentric raster
  (SmoothMapRaster), with a cross-section tool and ridge-direction ticks. Lessons: (1) a distance measured along mesh
  edges (the belt BFS, Dijkstra) has contours that snap to the mesh's six directions — its GRADIENT is off by tens of
  degrees, so ridge directions are taken straight away from the nearest front cell instead, and the checks measure
  alignment against straight-line or smoothed references, never a mesh-distance gradient; (2) the sim coast zigzags at
  cell scale — near a narrow coastal belt only a coast direction smoothed over ~200 km is a fair reference; (3) at an
  oblique trench or collision en-echelon tilt must be small (strain partitioning), full only along transforms;
  (4) phasor stripes where kernel directions disagree are blobs — faded by a direction-agreement measure; (5) volcano
  cones belong only on ACTIVE arcs (arc crust accreted into a continent and now in a collision belt had sprouted a
  field of cones); (6) the thickening record alone does not lift a Tibet — it concentrates near the front — so mature
  collision, Andean and Laramide profiles carry their own plateau term. Scale: 160K / 640K / 2.5M agree sim cell by
  sim cell (correlation ≥ 0.998). 0.85 s at 640K. Fix (developer, 2026-09-25: "the continent splits one is broken"): the rift
  scene carries no drive of its own (its lab phase supplied the force model), so it crashed; terrain scenes now default
  to updatePlateMotion, end 20 Myr after the split and look at the rifted margins; rift shoulders decay over 400 Myr
  (escarpments retreat rather than wear down); a failed arm is a trough in km from the arm line (a one-cell record
  only smeared into a faint dip). The check now builds every lab scene.
  Round 2 (developer, 2026-09-25): (1) the parallel ridges were far too prominent — they are GUIDES layered on the uplift:
  ± stripeShare (0.14) of the belt's own relief plus a little base, with per-kernel wavelength (±25 %) and strike (±10°)
  jitter, stronger meander and segments/crests that fade along their length — "less perfect", something for noise and
  8b to work with; (2) island arcs looked "diseased" (a pox of cones): volcanoes are fewer (arcs 0.6 per sim cell, only
  along the arc's volcanic FRONT, within 130 km of it — a swath of arc crust had grown cones everywhere; Andean 0.35),
  broader, and an eroding volcano spreads — wider, lower, a rounded shield (coneSpread / coneSettle over coneSpreadMyr),
  hotspots too; (3) transitions were too clean: each corner's share is scaled by a noise field of its own
  (blendNoise, ~180 km) so belts, plains and cratons interfinger, belt far edges wander (edgeJitter) and plateau edges
  are softer. (4) A new orogeny erased the old one's character: the engine now keeps the belt a newer one OVERPRINTS
  (crust.prev*: type, last active, position across, reach, side, obliquity; one layer deep; history still byte-identical),
  and the terrain adds it under the new at overprintShare 0.5 of its own decayed relief, with its own ridge grain — an
  Andean margin under a later collision, cross-cutting grain. 46 % of the 600 Myr planet's land carries one.
- Phase 7c, the crust budget (2026-09-24; developer: aim for 1000–2000 Myr histories, GROWTH but bounded, 50 % erosive
  margins, fewer and bigger arc additions). Land only grew before (+28–47 % in 1000 Myr). Now: (1) erosive margins —
  half the active continental margins, from a field fixed in the plate (step/margin-isles.js) — eat their coasts at
  2 km/Myr instead of building islands; (2) at a collision the lower continent's overlapped front is consumed
  (underthrustShare × the swept area) and the upper crust thickens (step/collision.js underthrust); (3) arc pieces under
  arcAccreteMinKm2 arriving at a continent go down with their slab. Result on the start world: +17–21 % in 1000 Myr,
  most of it in the first ~300 Myr, then roughly level. Lesson: underthrusting mostly removes HIDDEN double crust — the
  overlap is counted once in the world view — so collisions only take visible area off if convergence continues
  longer before the weld (a later weld cut land further, to +10 %, but halves speed): that belongs with the
  supercontinent cycle (developer: the weld not being immediate already models some of it). Lesson: a scene built on
  another scene inherits its build()'s mechanism switches — mechanismsOn() turns wanted ones back on.
- Phase 7c, second round (2026-09-24). Developer: two rift halves were driven back through each other for ~70 Myr on seed
  592250 (up to 14 Mkm² of stacked land) — young rift partners were exempt from colliding for riftPushMyr, and their
  collision lock was off too. Now only the sliver of jitter along the rift itself is exempt; and plates overlapping by
  more than sutureOverlapKm2 weld at once. check-invariants runs 600 Myr on three seeds (592250 among them) and fails on a
  big or lasting overlap. Developer: island arcs at sea / on wings were too rare (coasts were fine): arcs now form after
  1000 km of slab (was 1400) and widen every 500 km (was 700) — about twice the arc area; continents then grow ~+32 %
  in 1000 Myr (levelling off after ~300 Myr); backArcRatePerMyr 0.015 → 0.03 (more arcs meant fewer qualifying trenches).
- Code review, batches B–D (2026-09-23/24). B: events carry data — world.log(kind, text, data), one EventKind per kind of
  event; checks and the lab read kind + data, never the prose (about 40 checks had parsed log text). Scale: steps never cross
  a 2 Myr grid (a 50 Myr recording rate had produced a different history than 2 Myr); arcs, arc belts, hotspot tracks,
  rift overhang / arm ends, jitter filters, wing growth and the step floor are in km, not cells; check-scale.mjs runs
  scenes at 40K and 80K cells. What still differs between meshes is force convergence (finer outlines cancel ~5–10 %
  more), amplified through slab maturity — acceptable because the sim mesh is fixed; Detail-slider invariance is Phase
  8's job. C: one BFS / geometry toolkit (core/mesh-bfs.js, sphere-geom.js), shared check helpers (check-kit), shared
  lab helpers (phase-kit: describeCell for every crust type and flag, orogenyLegend, speedSeries). D: README "how the
  engine works / rules for event stages / adding a mechanism", this document's status table, config regrouped, dead
  trimLeadingEdge removed, rift.js split in three. Every refactor was checked against a hash of a full history's event
  log (unchanged).
- Code review, batch A (2026-09-23) — correctness. (1) Terrane ids were remapped on every hand-off and snowballed to the
  Uint16 limit within a history (65,528 by 300 Myr), wrapping into the craton ids: ids are now unique when made (scenes
  and start world) and never remapped (world.nextTerraneId, a counter). (2) A plate merged away earlier in a step could
  still weld in a later pair and take a live continent's crust with it: collision pairs re-check alive. (3) `dirty` meant
  both "extent stale" and "changed this step", but refreshExtent clears it: `Plate.reshaped` (markReshaped) now means
  "world view stale for this plate" and resolve clears it. (4) Per-cell fields are listed once (crust.js CELL_FIELDS) —
  a hand-written copy had dropped the volcanic record. (5) Land is never deleted on a hand-off (accretion stacks it
  beside the coast), which docks arcs straight onto the coast (97 % joined vs 64 %). (6) Mechanism off-switches live in
  one place (config.js MECHANISMS / onlyMechanisms): older scenes had silently kept back-arcs on. check-invariants.mjs
  guards all of it through whole histories.
- Phase 7b second-round lessons. (1) A width computed once per plate hides everything the user looks at along a
  margin — obliquity, slab age, how long THIS stretch has been active; per-front-cell reach costs nothing extra.
  (2) A large base width means a belt is born full-grown: time only shows if the base is small. (3) Whenever cells
  change hands, check what the fragment rule does with the result the same step — the world view it reads is stale.
- Phase 7b lessons. (1) The passive pre-history ocean is no slab: against it a trench neither founders (6b) nor
  rolls back — the first Mariana run peeled the WRONG flank off Philippina because its edge over the passive ocean
  counted as an old slab. (2) Rollback is a race — the trench's retreat against the plate's advance — not "the
  plate is still": a big continent creeping forward at 1.5 cm/yr is still outrun by an old slab. (3) A scene must
  put the physics it tests where the plate actually is: the first Laramide scene's young slab covered only part of
  the leading edge, so most of the trench consumed 170-Myr-old passive ocean and nothing went flat. (4) A tenure
  clock must measure the event it is about: timing back-arcs from plate.born let every rift and suture reset it.
- Phase 7a lesson — thin records and the gather: a plate's raster is rotated against the world grid, and a
  nearest-cell gather leaves ~20 % of a plate's cells shown by no world cell. Harmless for areas, fatal for a
  record one cell wide: a perfectly continuous hotspot track on the plate showed as dashes. Two fixes, both
  needed: stamp the track on the PLATE's own lattice (stamping world cells and mapping each to its plate cell
  leaves orphans two raster cells apart), and have `captureFrame` show a hidden track cell on a world cell next
  to it whose own raster cell carries nothing — every track cell seen, none shown twice. Sutures, rift margins
  and failed arms are thin records too and alias the same way; they have not needed it yet.
- **Start world rethought (developer, 2026-10-25; plans/V2_START_WORLD_PLAN.md).** "The starting position
  supercontinent looks very bad, unrealistic, and clearly generated with noise … the cratons face the same problem."
  The start world is the one frame the engine does not shape, and its coast and cratons outlive the whole history.
  Developer chose the plan's option A (an assembly story, noise only below ~150 km) combined with C (smarter noise
  where noise remains), accepted that every Evolution world changes (no versioning), and left a Tethys-like gulf to
  chance. **S1 (cratons as fragments, in clusters):** a craton is an elongated body (aspect ≤ `cratonMaxAspect`, its
  grain) with low lobes, clipped by 1–3 near-straight rift edges with transform steps (`cratonRift*`), corners rounded;
  redrawn shallower while it comes out a sliver (`cratonMinCompact`); `cratonSiblingChance` of them come as a parent
  split across its long axis, the halves drifted apart with their matching edges facing. Blocks are drawn in their own
  azimuthal frame and packed by their outlines, as before. They cluster into 2–6 proto-continents
  (`clusterBlocks`): close inside one (`clusterGapVariety`), `clusterApart` × the reserve between clusters. The edge
  noise follows the grain (`cratonGrainNoiseKm`) and a rift edge wanders less (`cratonRiftNoise`); the terrain's own
  craton-edge noise 70 → 45 km so the fragment's edges survive. Measured from the crust (check-phase3): least
  compact craton 0.25–0.44 → 0.43–0.60; gap between clusters 1.9–2.6 × the gap between cluster-mates. Lesson: an
  evenly spaced packing reads as spots whatever the sizes — only unequal GAPS (clusters) read as an assembly.
  **S2–S4 (same day, developer: "lets do s2-4 first", before far-field deformation):**
  - **Assembly (S2, `init/landmass.js`).** Each cluster is a proto-continent grown outward. The core is its cratons
    softly joined over half their gap; rings lie beyond, wider on a random side. Clusters meet along a few long major
    seams. Old ranges by seam kind with a strength per pair of proto-continents (the last to meet highest), applied to
    the relief KEPT.
  - **Margin (S3).** The passive stretch is chosen first; arcs with cusps on the active rim, transform steps on the
    passive; coast noise ±1200 → ±350 km.
  - **Swells and grain (S4).** Starting swells are placed by distance to the seams (`world.startSeamKm`, `seedBaseRelief`).
    Craton grain is stretched along each patch's long axis, read from its shape on the raster.
  - **Lessons:**
    1. A belt's height saturates with convergence: to vary a range's height, scale what is kept, not the work.
    2. Rings drawn round every cluster read as contour lines; draw only the rings beyond the core, on the side that
       grew.
    3. A count of connected raised pieces cannot tell a honeycomb from long belts (joined honeycomb segments count as
       one long belt); the share of land within 500 km of a range can (35–40 % → 19–30 %).

  0 Myr hypsometry (seeds 1, 3, 7 at 160K, carved), before → after:

  | | before | after |
  |---|---|---|
  | land below 400 m | 65–67 % | 71–72 % |
  | 90th percentile | 0.82–0.87 km | 0.77–0.82 km |
  | highest peak | 2.5–2.6 km | 2.7–3.2 km |

**Known limitations (accepted for now)**
- A plate under little net force can still *spin* noticeably (drag against rotation about a small
  plate's own centre is weak). Speeds are therefore quoted at the plate's centre.
- A continent with balanced opposite trenches is an unstable balance: it holds ~30–40 Myr, then
  tips. A supercontinent's stillness relies on being pulled from most sides.
- Trench forces agree within ~5 % across 16K/40K/90K sim meshes, but the speed that *emerges* over
  time differs by ~10–15 % between 16K and 40K (how newly formed trench cells mature). The history
  always runs on the fixed sim mesh, so planets do not change with render detail.
- Collision is a viscous lock: it resists sliding along a seam as much as convergence, and each
  plate is solved against its neighbour's previous-step velocity rather than jointly.
- The redraw is a one-shot warp at suture: no deformation during the collision itself, and area is
  conserved on the map (the overlap is absorbed, escape bulges the coasts) rather than lost to
  thickening. Displaced upper-plate crust that reaches the coast simply extends it.
- Ocean–ocean fronts used to be jagged at cell scale, polarity being decided cell by cell. FIXED in
  Phase 6b by the segment-wise vote (`voteSegments`, step/boundaries.js): 8.6 % → 4.1 % of neighbouring
  boundary cells playing opposite roles. What remains is the ordinary cell-scale jitter of a rotated
  raster, not interleaved polarity.
- Wings grow to `wingMaxKm` and then the plate's whole leading edge keeps picking up trench flags
  wherever it consumes ocean — the trench ends up along most of the plate's front, not a neat line.
- A continent drifting away from old ocean with no partner spreads one-sidedly (the passive
  background never receives crust).
- The visible edge of a rotated raster jitters by about a cell, so trench bands are 2–3 cells wide
  and a few single-cell age specks survive in ocean stripes.
- Start-world coastlines and suture networks are still somewhat regular — being redone, plans/V2_START_WORLD_PLAN.md
  (S1, the cratons, built 2026-10-25; S2–S4 the belts, the coast and the opening heights).
