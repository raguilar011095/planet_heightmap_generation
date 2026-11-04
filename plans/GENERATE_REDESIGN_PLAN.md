# Generate, rebuilt on Evolution's ground: plan

Status: **G1 built 2026-11-02, awaiting the owner's look** (`/generate?next=1`, Plates tab; `node v2/tools/check-present.mjs`,
98/98). The owner's answers are in §9 and below. Worktree `.claude/worktrees/generate-redesign`, branch
`worktree-generate-redesign` (from main 5e434b3).

**Decisions (owner, 2026-11-02):**
1. The slider stays **Plates**. It sets the pieces you click; the Plates tab shows the moving plates.
2. Coasts are drawn naturally, not along the pieces: "I don't like how obvious the grid looks."
3. Add detail runs **in the background on desktop**; phones get a button.
4. Colours: **whatever Evolution uses** (Relief).
5. **Adopt Evolution's export height scales** (−11…+9 km with the sea, 0…+9 km land).
6. Old codes: same continents, new terrain, current release archived. "Ideally at least the big major mountain ranges
   are LOOSELY in the similar spots but that is very very flexible if I think it looks bad." So the plates' motion is
   seeded from today's piece velocities, and continents are split where today's strongest land–land convergence lies
   (§3.1). A check measures how much of today's high ground the new belts cover, as a guide, not a gate.
7. **No new knobs.** The implied past assumes a world of about **2000 Myr**: the oldest seams and cratons are that old.
8. **PR #83 (ridge variety) is not landed first.**
9. **Sliders that no longer make sense may be deprecated**: hidden, still decoded from codes, ignored. "I'm comfortable
   with us driving a little bit more here." Candidates are listed in §3.6 and decided in G6.
10. **The brand restyle (PR #92) does not affect this work for now.**
11. **(Owner, during G1.)** "I'm also open to rethinking the underlying way the tectonics work here as well. Importantly I
    also want to make sure we have interesting mountain ranges inside of continents, and to simulate old orogenies as
    well." This leads to two changes:
    - **Only the land comes from the pieces.** Plate boundaries out at sea, the seams inside continents and the ranges
      along them get their own geometry, so the piece grid shows nowhere but where you edit (G1b). *Reversed for the
      plates by decision 12.*
    - **The continents' past is replayed as a sequence of real past collisions** (§3.2b, G4). Each one writes the same
      belt records Evolution's history writes, at its own age; they overprint one another and wear down between events.
      Ranges inside continents come from four sources: those old orogens, young collisions where a continent spans two
      plates, intraplate ranges raised by today's collisions (the far field), and rifts.
12. **(Owner, 2026-11-03, after G6b.)** The plate boundaries drawn free of the pieces looked "haphazard": "they dont
    follow the plates really. And also they do not really conform to the land. At least some/a lot of the edges of
    plates should be on the sides of the ocean/land boundaries at least in some places." So the plates are whole
    pieces again, and a continent leading into the ocean has its plate's edge along its coast (G1c). Coasts stay drawn
    free of the pieces, except along those edges.

The owner's ask (2026-11-02): bring Generate up to parity with Evolution, because

1. Evolution looks better and more realistic;
2. Generate needs to be both faster and more interesting to be worthwhile;
3. Generate should reach parity with the other map modes (Satellite, Geology, Food, rivers, fine detail).

The redesign must stay true to Generate's knobs and plate editing. VISION.md's Generate column already names this as
where Generate is heading: "Parity with Evolution: its believability through fast approximations, and every downstream
layer (geology, food, satellite look, fine detail) on its worlds". Nothing in this plan changes that column's profile:
it stays seconds, sliders plus plate editing, and fully phone-friendly.

---

## 1. Why Generate looks worse

Seen side by side on 2026-11-02: Generate at its defaults and Evolution at 410 Myr, both in the Relief colours on the
Winkel Tripel map. The causes were traced in the code by four research passes (§10).

| What you see in Generate | Where it comes from |
|---|---|
| **Mountains rim nearly every coast** as patchy blotches, and the interiors are flat green. | Each of the ~80 plates is wholly land or ocean (`ocean-land.js assignOceanLand`), so **every coast is a plate boundary**: 47 % of coast cells lie within 50 km of a plate's land/ocean edge, 69 % within 150 km. A land/ocean boundary is convergent, divergent or transform, never a quiet passive margin, so ranges grow along most coasts. It is also why generated planets come out drier than Earth: about ⅓ of their coast has ≥ 1.5 km ground within 300 km, against 8 % on Earth (memory, 2026-10-14). |
| **Continents are clusters of equal-sized lobes.** | A continent is a union of whole flood-filled plates of similar size. |
| **No ranges, only blotches**: a single Gaussian crest, isotropic noise, ridges smeared sideways. | `elevation.js buildSkeleton`: one crest along the boundary, made from integer BFS hop distances (banding). Then isotropic fbm at many scales, several of them finer than the mesh (aliased speckle). Then `warpTerrain` crossfades two copies displaced by up to ~760 km: ghosted coasts and ridges. The phasor ridges have one 55 km wavelength, about 1.2 cells at 204K, so they alias. |
| **The sea floor is cloudy noise** with crinkly dark cracks. | Shelf, slope and abyss are bands of hops plus fbm. Ridges and trenches are drawn on the plate boundaries, which are wiggly flood-fill borders. Depth does not follow the age of the floor. |
| **No relief at all on screen.** | `planet-mesh.js` colours each Voronoi cell flat and lights the globe as a smooth sphere: there is no hillshade in any view. |
| **Nothing has a cause.** | There are no old ranges, cratons, sutures, flood basalts with a history, or margins whose shelf width depends on age. The design doc says it plainly (`V2_TECTONIC_HISTORY_DESIGN.md` §1): V1 "slaps down plate boundaries at random and then draws continents to fit them". |
| **Results change with Detail.** | Iteration counts are in cell hops, octave counts switch at 200K (the 204K default sits just over it), and the phasor kernels are drawn on the render mesh. This is against CLAUDE.md's scale rule. |

Evolution looks better for two reasons, and **almost none of either needs a history**:

- **Records in km on a coarse mesh, heights synthesised at every point.** Smooth fields per sim cell (coast distance,
  belt kind and side, distance across the belt, width, crest height, quiet time, margin kind and maturity, sea-floor
  age) are read at each terrain point through km profiles, strike-aligned ridge kernels and noise that fades out below
  2–3 cells. Then the rivers carve it (Tzathas 2024). It is painted per pixel with a hillshade.
- **The records have causes.** Belts sit where plates converged, shelves are as wide as their margin is old, and cratons,
  sutures and old worn ranges come from an assembly story.

The research's key finding: **Evolution's terrain, Add detail, Geology and Food are pure functions of a Frame.** They
never read the event log, earlier frames, the hotspot list or the plates' spin. A Frame whose plates all have identity
rotations runs through all of them, and every record left at zero means "absent". This was tested on a frame holding
only the land mask: it ran through `synthesizeTerrain`, carving and the whole finish without errors (flat, as expected).

## 2. The idea: one present-day moment with an implied past

**Generate builds the present instant of a believable history and fills in its past with closed forms, without
simulating it.** It writes the same records Evolution's terrain reads, and hands them to Evolution's terrain, carving,
painting and Add detail.

- **Keep the map you shaped.** The layout stage (the plates, continents, land coverage and size variety you set, and
  your plate edits) stays **byte for byte** as it is. It uses its own random streams (seed+137, `generatePlates`, seed+42,
  seed+999), so every planet code keeps its continents and plates.
- **Replace the ground.** Everything after the layout goes: `elevation.js` (2,615 lines), Generate's use of
  `terrain-post.js`, `super-plates.js`, `plate-physics.js`, `terrain-metrics.js` and the Voronoi painting.
- **Every feature has a cause:**
  - a range: a convergent boundary, active for some Myr;
  - a wide shelf: a margin as old as the floor beside it;
  - a craton: the continent's oldest core;
  - an island chain: a plume under a moving plate.
- **Noise only for detail under ~150 km**, as the start world's rule says (`V2_START_WORLD_PLAN.md` §3).

```
layout (kept, 20K coarse mesh, ~50 ms)
   │  pieces (today's "plates"), land/ocean, your edits
   ▼
plates that move: pieces grouped into ~13 plates that carry continents AND ocean; Euler poles by a quick force balance
   ▼
the past in closed form (v2 sim mesh, 40K, fixed):
   sea-floor age from the ridges · belts active T Myr (spreadBelt once + closed-form heights and wear)
   · cratons, accreted rings, seams, old worn ranges · swells, platform cover, geology record · plumes, tracks, LIPs
   ▼
one Frame (one world-indexed raster, identity rotations)
   ▼
Evolution's synthesizeTerrain + carve on Generate's own Detail mesh (terrain pool)   →  painted per pixel with hillshade
   ▼                                                                                     (Evolution's painter)
climate (unchanged)  →  [Add detail: rivers and lakes, ice age, sand seas, Satellite, Geology, Food, zoom detail]
```

## 3. The design

### 3.1 Pieces and plates

Today's ~80 "plates" become **pieces**: the units you raise or sink. Neighbouring pieces are grouped into **plates
that move**, and those plates carry both continent and ocean, as Evolution's plates do ("plates are larger than their
land"). Without that grouping every coast stays a boundary. Today's `super-plates.js` groups only pieces of the same
type, which is why it does not help.

- **How many.** About 1.5 √P plates, clamped to 3–18: 80 pieces give ~13 plates (Earth has 7 major and ~8 minor). This
  is a tunable, not a new slider.
- **How they are grouped**, on the piece graph:
  - Each continent starts as one plate. Continents ride whole.
  - The largest continents may be split once along an inner seam, which gives a rift or a young collision inside a
    continent (Africa–Arabia, India–Asia).
  - Extra ocean-only plates are seeded farthest from the land (Pacific-like).
  - The ocean pieces go to the nearest plate by a Dijkstra in km.
  - Result: a continent is mostly surrounded by its own ocean, so most of its coast is **passive**. Trenches appear where
    an ocean-only plate meets a continent. Ridges appear where two continents' oceans meet: the Atlantic, by
    construction.
- **How they move.** Euler poles come from a quick force balance on the plates (Generate's slab pull, ridge push and
  continental drag, reused on plates instead of pieces), iterated twice so the trenches it implies and the pull they give
  agree. Its random stream is its own.
- **Boundaries** are classified per segment from the relative motion:
  - ridge, or a continental rift where a split continent pulls apart;
  - trench, with the older floor going down (Evolution's rule);
  - collision;
  - transform, or transpression where it is oblique.
- **Edits stay stable.** The plates and their motions come from the **unedited** layout. A Ctrl-click then changes only
  the crust, never the grouping, so raising one piece changes only its own neighbourhood:
  - an ocean piece raised beside a continent docks as a **young accreted terrane**, with a young range along its seam;
  - an isolated raised piece becomes a microcontinent, rifted all round;
  - a sunk land piece leaves a young rifted margin behind.
  - Loading a code and editing in the page take the same path. Today they differ: Rebuild skips the plate physics and the
    mantle field, so an edited world and its code build different planets.
- **Coasts drawn as coasts.** The continental crust starts as the union of the land pieces. Its coast is then redrawn
  on the sim mesh, by the same primitives as Evolution's start world:
  - passive stretches faceted, with rift-segment steps and offsets;
  - active stretches as smooth arcs convex to the ocean, with cusps between them;
  - bays and headlands under ~150 km, by Evolution's coast noise;
  - all within about ±150 km of the pieces' edge;
  - the threshold set by bisection so that **Land Coverage is still met**.

### 3.2 The past, in closed form

Every mechanism has its own random stream, so adding one never re-rolls the others. All of it runs on Evolution's fixed
40K sim mesh: Generate's layout is projected onto it, the same on every device and at every Detail.

| Record | How it is made | Reuses |
|---|---|---|
| **Sea-floor age** | A Dijkstra from each ridge through its plate's ocean. Age = distance ÷ half the spreading rate, capped near 180 Myr. Ocean with no ridge in its plate is old floor. | `seaDepthKm` (half-space cooling, already in records.js) |
| **Fracture zones** | `fzU` from the two plates' relative pole: exact for a pole that has not moved. | `fractureCoordinate` |
| **Margin maturity** | Comes for free: records.js already takes a passive margin's age from the oldest floor beside it. Wide shelves and coastal plains face old oceans; narrow ones face young ones. | `deriveRecords` |
| **Active belts** | Per convergent segment: its kind (Andean; arc on ocean-ocean; Himalayan upper / foreland lower in a collision; transpression where oblique; Laramide if wanted) and a time active T, drawn from a seeded range weighted by the rate. One `spreadBelt` call with front work v·T. Uplift and crests in closed form, U·(1 − e^(−W/B)), at their eroded steady state. The root by a few growing calls (~1 ms each). | `spreadBelt`, `beltWidthKm`, `beltShape`, `obliquityDeg`, `chooseSides` |
| **Rifts** | A divergent boundary inside a continent gets rift shoulders and an axial valley. If it has opened long enough, a narrow young sea (Red Sea) as wide as rate × time. | `ops/rift.js` (single call) |
| **Island arcs, back-arcs** | Arc crust on the overriding side, as wide as it is mature. Island chains come from the synthesis's own arc straits. Behind an old, rolling-back slab, a strip of young back-arc floor. | records, `arcStraitKm` |
| **The continents' past** | Cratons placed **inside** each continent (count ∝ area, kept clear of the coast) with the start world's block shapes: rifted edges, sibling pairs, grain. Around them, accreted rings, each younger outward and youngest toward the active margin (the Cordillera). Inner, ring and major seams (1–3 proto-continents per continent by area). Old Ural-type ranges along the seams at their ages, worn by the closed form of the history's erosion (not "relief kept" factors). | `makeBlock`, `cratonEdge`, the landmass structure split from its coast code, `oldRanges`, `seamDistances` |
| **Swells, platform, rock** | Swells along the seams; platform cover in the lowlands; exhumation by age. Then one call of `evolveGeology` primed to the belts' ages: shelves, forelands in front of active belts, rift basins, coal measures. This is needed: with zero geology the rocks come out 72 % slate. | `seedBaseRelief`, `seedGeology`, `evolveGeology` |
| **Plumes, tracks, LIPs** | ~5–8 plumes, fixed in the mantle. Each track is laid backward along its plate's own rotation (`poseAtConstantOmega`), erupting in bursts as Evolution's do, so islands sit near the plume and drown downstream. A few flood basalts on land, with an eruption age and the wear it implies. | `poseAtConstantOmega`, `volcanoes.js`, `lips.js` |
| **Far field** *(later, optional)* | A collision's push through its continent, raising an old seam it meets square-on (the Tian Shan). | `spreadPush` |

### 3.2b The continents' past, replayed (owner, 2026-11-02: "simulate old orogenies")

Each continent is put together by a short **sequence of past collisions over the ~2000 Myr world**, replayed as events.
It is not drawn as static seams, and it is not a physics run: every event is a real collision with a time, a front, a
convergence and a duration, written with the engine's own record functions.

1. **Terranes, not pieces.** The continent's land (on the sim mesh) is cut into terranes by the start world's
   primitives:
   - 1–3 craton cores, shaped by `makeBlock` and placed clear of the coast;
   - around them, accreted terranes in rings and sectors, younger outward, the youngest toward today's leading margin
     (the Cordillera);
   - their seams wander as Evolution's do, and never follow the piece grid.
2. **The events, oldest first, each on its own random stream.**
   - Cores weld (~2500–1800 Myr ago).
   - Terranes dock one by one: an arc, a microcontinent, a continent-sized block.
   - Each event:
     - is a collision at time tᵢ along its seam;
     - has a kind by what docked: Ural-type for a terrane, Himalayan upper and lower for a continent-continent weld,
       with a plateau when the convergence went on long after contact;
     - writes the belt with `spreadBelt` (width from its convergence × duration);
     - overprints any older belt into `prev*`, as in a real history;
     - lays a foreland basin's cover in front of it;
     - pushes through the continent, so a strong collision can raise an older seam again (`spreadPush`: the far field).
3. **Between events the land wears down** by the history's own erosion clocks, in closed form (§10). So a 1800 Myr
   orogen is a low, grainy range (the Appalachians' Valley and Ridge), a 300 Myr one still stands (the Urals), and a
   60 Myr one is high.
4. **Today on top.**
   - The present boundaries (G1, G3) add the active belts.
   - Today's collisions push through their continents and raise intraplate ranges on old seams they meet square-on (the
     Tian Shan behind the Tarim).
   - Rifts and failed rifts (aulacogens) cut across.
   - A piece you raise beside a continent docks as the last event.

The cost is small: ~5–15 events per continent, each `spreadBelt` ~1 ms and `spreadPush` 2–3 ms, so ~0.1–0.3 s for the
planet. A real simulation of the assembly (Evolution's engine run as a prehistory) would take 10–20 s and would no
longer honour your continents.

The time active T, the ages and the wear are the only invented history. Each is drawn from a physically sensible range
in Myr, written into the records, and shown in the hover readout, so the cause is traceable ("Andean margin, active
~45 Myr"; "sea floor 120 Myr old"; "craton core, 2.6 Gyr").

### 3.3 The Frame and the ground

- **One world-indexed raster** with identity rotations. Generate's plate ids go into `owner`, and `crustCells` is left
  out (records.js and cratons.js fall back to the world grid). There is **not** one Evolution `Plate` per piece: a raster
  is 178 bytes a cell, and 80 of them would be ~285 MB.
- **Evolution's fixed sim mesh**, not Generate's per-seed coarse mesh. The terrain and finish caches key meshes by cell
  count only, so a same-size mesh from another seed would silently be reused stale.
- **Synthesis and carving on Generate's own Detail mesh**, so Detail, Irregularity, hover and Ctrl-click picking and
  the export rasters keep working. The mesh caches are keyed by the mesh itself rather than its size: a change to shared
  code that must leave Evolution byte-identical (checked by hashes).
- **The terrain pool** (workers) started from Generate's worker, as Evolution's finish worker already does. Heights are
  in **km** from here on. The climate, exports and palettes read km. The raw-unit Classic palette is ported to km.

### 3.4 Painting

Generate and Import adopt Evolution's per-pixel painting (`view/gpu-paint.js`: the mesh's triangles drawn onto a
texture, heights blended and then coloured, so the coast is the exact zero line), with its hillshade. Ideally they also
take its globe and map view (`app/globe-view.js`), so the Studio has one renderer. The pending-plate tint and the hover
highlight become overlays.

- **Import gets the hillshade too**: a free gain.
- The research says this alone is roughly a third of the first-glance gap. But a hillshade exposes today's banding and
  speckle, so it arrives **with** the new terrain (G2), not before it.

### 3.5 Add detail on Generate worlds

Evolution's finish runs unchanged on the Frame:
- rivers and lakes by the climate (drawn as lines);
- the last ice age (U-troughs, fjords);
- sediment (fans, floodplains, deltas);
- sand seas and loess;
- rocks shaping the land;
- the full Satellite look;
- Geology and Food (beta, as in Evolution);
- detail finer than the mesh when zoomed;
- their exports.

Its cost (measured, Node, pooled): 160K 6.7 s, 640K 12.3 s, 2.5M ~15–28 s. About 3 s of that is the climate, computed
twice. That is not Generate's seconds, so the build never waits for it. The planet shows first, and Add detail either runs
by itself in the background, unlocking tabs as it lands, or is a button as in Evolution (question 3). Once the look
settles, the finish can start from the build's surface and climate instead of making its own, saving a few seconds.

### 3.6 The knobs

Every slider stays, at the same position in the planet code. Defaults map onto Evolution's tuned defaults, so a default
Generate world is drawn as Evolution draws its own.

| Knob | Today | New |
|---|---|---|
| Detail | render mesh cells | the same (and Add detail's cells) |
| Irregularity | mesh jitter | the same; little visible effect once painted per pixel (kept for codes) |
| Plates | plates, each land or ocean | the **pieces** (unchanged layout); ~1.5 √P plates that move are made from them |
| Continents, Size Variety, Land Coverage | layout | unchanged; Land Coverage still met after the coast is redrawn |
| Roughness | fbm magnitude | hills, ridge noise and coast detail amplitude (`hillsKm`, `ridgeNoiseShare`, `coastNoiseKm`, `crestRugged`) |
| Terrain Warp | ±760 km crossfaded warp | the synthesis's organic warp (`warpKm`, `cellWarp`) and bays (`coastNoiseKm`) |
| Smoothing | bilateral passes in hops | wear: crest spreading and soil creep (older, softer land) |
| Glacial Erosion | latitude-band ice flow | fjords and drowned valleys in the build; Add detail's ice age strength |
| Hydraulic Erosion | 20s iterations of Braun–Willett | the carving's time (`carveTimeMyr` / erosion strength) |
| Thermal Erosion | talus passes | the carving's critical hillslope (`carveHillSlope`) |
| Ridge Sharpening | sharpening passes | parallel ridges and rugged crests (`stripeShare`, `crestRugged`) |
| Temperature, Precipitation | the climate | unchanged |
| Ctrl-click → Rebuild | flips a plate | flips a **piece** (the same units, the same flow on desktop and phone); the coast is drawn naturally within it (question 2) |

Sculpting stays a Reapply, with no new layout: the Frame is kept, and only the synthesis, carving and climate run again.

**Deprecation candidates** (owner's go-ahead, 2026-11-02, decided in G6). A deprecated slider is hidden but keeps its
digit in the planet code, decoded and ignored:
- **Irregularity:** no visible effect once heights are painted per pixel.
- **Smoothing:** it existed to hide BFS banding.
- **Thermal Erosion:** folds into the carving's hillslope.
- **Terrain Warp:** if the synthesis's own warp is enough.

### 3.7 Planet codes and old links

The code format does not change. An old code decodes to **the same seed, sliders, continents, plates and edits**,
re-sculpted. That is a different world in its heights, so CLAUDE.md's "every seed ever shared must build its world
again" is kept the way Evolution's start-world change kept it:
- the current release stays online at `orogen.studio/v/<major>.<minor>/generate`;
- What's New gives the heads-up.

Unlike Evolution's histories, no chaotic simulation is involved, so a Generate code should build the same world in every
browser.

### 3.8 Speed

Measured today (Node, seed 12345, default sliders; `buildMesh` on the page not included):

| | Today: terrain | Today: total | Target: terrain | Target: total |
|---|---|---|---|---|
| 204K (default) | 2.0 s | 4.9 s | ≤ 1 s | climate + ≤ 1 s |
| 640K | 5.8 s | 8.8 s | ≤ 1.5 s | climate + ≤ 1.5 s |

The new terrain pieces:
- the past: ~0.3–0.6 s at 40K (`placeCratons` 40–50 ms, `spreadBelt` ~1 ms a call, `seedGeology` < 10 ms; the start
  world's slow attempt search and coast bisection are not used);
- synthesis plus carving: 0.95 s at 160K on **one** thread with a minimal frame, ~0.4–0.6 s pooled.

**The climate then becomes most of the wait**: 2.9 s in a cold Node run, about 1 s in desktop Chrome per the climate
plan. Two ways to make the whole build feel fast without lowering quality:
1. Show the Terrain view as soon as the heights are ready (~1 s) and let the climate tabs fill in after.
2. An optional exact (byte-identical) speed pass on the climate, which helps all three tools.

An edit's Rebuild and a Reapply skip the layout and the sphere mesh, so they get faster still. Every number is measured
again in Chrome in G2, on a desktop and on a phone-class profile.

## 4. Alternatives considered

- **B. Run a short real Evolution history from Generate's layout** (say 100 Myr at 20K). This is the most authentic. But
  the history moves what you placed, so the direct control (Generate's whole point) goes. It adds several seconds. And it
  is chaotic, so codes would build different worlds in different browsers, as Evolution's links do. **Not recommended.**
- **C. Upgrade `elevation.js` in place**: port the techniques one at a time into the BFS fields. Coasts would stay on
  plate outlines, every plate would stay land or ocean, and the hop fields would stay. It could never feed Geology, Food
  or Add detail, which need records. It would be a long road to a weaker result. **Not recommended.**
- **A. This plan.** It reuses ~25,000 lines of tuned Evolution code downstream of the Frame, and adds a few thousand
  lines of "present-day world" code that builds the Frame.

## 5. Where the new code lives

- `v2/js/present/`: the present-day world. A sibling of `tectonics/`, because it writes the engine's records and calls
  its record functions. It holds:
  - `plates.js`: grouping, motion and boundaries;
  - `seafloor.js`;
  - `belts.js`;
  - `continents.js`: cratons, rings, seams;
  - `plumes.js`;
  - `frame.js`: assembly;
  - `present-config.js`: its tunables, in km / Myr / cm·yr⁻¹, with ranges.
- `js/`: Generate's worker calls it, and keeps its UI, codes, edits and layout.
- **Shared-code changes**, each with Evolution's frames, terrain and finish hash-identical before and after:
  - export the start world's private pieces (`makeBlock`, `oldRanges`, `seamDistances` …);
  - split the landmass structure from its coast;
  - key the mesh caches by mesh, not by size.
- **Removed from Generate:** `elevation.js`, `super-plates.js`, `plate-physics.js` (its force terms move to
  `present/plates.js`), `terrain-metrics.js`, and the Voronoi painting. `terrain-post.js` stays for **Import**, which is
  not changed by this plan beyond the painting.

## 6. Phases

The phase gate applies as always. One phase at a time. Each has:
- a lab view: Generate's page with `?next=1` until the switch, so Today and New run side by side;
- a headless check: `v2/tools/check-present.mjs`;
- a comparison page: `v2/tools/render-generate.mjs --phase NAME` → `v2/out/generate/index.html`, Today | New, opening on
  the view that changed, the whole map plus close-ups;
- a stop for the owner's look.

**Fixed planets:**
- the climate tuning's Earth-like Generate seeds 2, 6 and 10;
- Continents 1 and 10;
- Land Coverage 0.1 and 0.7;
- Plates 8 and 120;
- one code with edits.

### G1: Plates that move
- **Build:** the pieces grouped into plates; their poles; boundaries by kind. Shown on the Plates tab: plates in colour,
  pieces outlined thinly, boundaries coloured by kind, motion arrows (today's `buildDriftArrows` is dead code). The terrain
  is unchanged.
- **Check:**
  - every plate is one piece of the globe;
  - most of the continental coast lies inside a plate (passive);
  - ridges lie between continents;
  - continents ride whole except for deliberate splits;
  - the same code gives the same plates;
  - an edit never regroups;
  - old codes' layout hashes are unchanged.
- **Verify:** the plates read like Earth's: large plates carrying continents, a Pacific, trenches along some coasts.
- **Built 2026-11-02** (`v2/js/present/plates.js`, `present-config.js`, `v2/tools/check-present.mjs` 98/98, the Plates tab
  with `?next=1`).
  - **Grouping:** each continent rides one plate, split at most twice along the seam where today's pieces converged or
    parted hardest. Ocean-only plates are seeded farthest from land. The oceans are divided by a Dijkstra in km that
    grows a continent's ocean 1 + 5 times less far ahead of its motion than behind, so it trails its ocean.
  - **Motion:** each continent's motion is fitted to its pieces' motion today. Ocean plates are bent 55 % toward the
    continents they dive under.
  - **Speeds:** continents 1.5–4 cm/yr, ocean plates 4–8.5 cm/yr.
  - **Boundaries:** the motion is averaged over 450 km of each boundary before the kind is judged.
  - **Measured on 10 planets:**
    - 80 pieces become 13 plates; 120 become 16;
    - 53–85 % of the coast is passive (27 % with 8 pieces, where a continent is one or two whole pieces);
    - boundary length is ~30 % ridge, ~35 % trench and ~25 % transform;
    - ~20 ms a planet.
  - **Edits:** an edit changes the boundary kinds along 0–0.4 % of the length and never the grouping.

### G1b: Free of the piece grid (owner, 2026-11-02)
- **Build:**
  - plate boundaries at sea drawn cell by cell from the same anisotropic Dijkstra, not along piece borders;
  - a continent split along a terrane seam (G4's geometry) rather than a piece border;
  - the pieces left to decide only what is land.
- **Check:** boundaries at sea smoother than the piece borders (length ÷ end-to-end distance per 500 km); edits still
  never regroup.
- **Built 2026-11-02** on Evolution's 40K sim mesh (`present/layout.js`: the pieces projected onto it exactly as onto the
  render mesh; Generate's y-up frame ↔ Evolution's z-up). `check-present.mjs` 108/108.
  - **Plates drawn cell by cell:**
    - continents ride whole on one plate, cut by a line grown from two points across their strongest seam;
    - the oceans are divided by a Dijkstra in km with a local cost (a step costs 1 + 5× its share along the
      continent's motion, so its ocean trails behind it);
    - boundaries at sea smoothed over ~250 km;
    - an ocean plate squeezed below 0.6 % of the sphere joins a neighbour.
  - **Active margins by cause:** ~60 % of continents (at least the biggest) lead into an ocean plate that dives under
    them. It is seeded along a line 1300 km off their leading coast, so it spans the whole margin and its trench lies
    ~200 km offshore (the Andes).
  - **Measured:**
    - 70–90 % of the coast passive (no boundary within 400 km);
    - plate boundary at sea on a piece border 5–7 %, against 1–7 % of all sea edges (chance);
    - 35–95 ms a planet.

### G1c: Plates of whole pieces, edges along some coasts (owner, 2026-11-03; decision 12)
- **Built 2026-11-03** (`present/plates.js`, `present/coast.js`); `check-present.mjs` 208/208.
  - **Plates are whole pieces:**
    - each continent rides one plate, or is split along its pieces' strongest seam;
    - the oceans are divided by the same anisotropic Dijkstra, each ocean piece then going whole to the plate that
      reached most of it;
    - the Plates tab draws each region's plate from its own piece, so the edges are the outlines you click at every
      Detail.
  - **Active margins along coasts:** ~60 % of continents (at least the biggest) lead into an ocean plate that dives
    under them. The ocean pieces their coast faces along their motion seed that plate, so its edge runs along the coast.
    Pieces also touching another continent's coast are left out; its slab pull points at that continent.
  - **No ridge along a coast:** an ocean piece parting from the continent it borders joins that continent's plate. A
    narrow sea between two continents parting is split down its middle, so its ridge runs there (the Red Sea).
  - **Smoothing at sea:** far out at sea (more than ~360 km from land), the edge is smoothed by a Gaussian blur of the
    plates' shares (σ 250 km), so trenches and island arcs sweep in arcs. The pieces' outlines wiggle a few hundred km
    across.
  - **The coast hugs those edges** (`marginHugKm` 350, a Gaussian blend), set back `marginInsetKm` 70 km from them, so the
    trench lies offshore. The level that keeps Land Coverage is solved with the hugged part held. The continent rides
    over the trench even where that leaves a strip of sea in front of it.
  - **Measured:**
    - 25–40 % of the coast is a plate edge (10 % for the supercontinent, 74 % with 8 pieces): trenches 53–82 % of it,
      ridges 0–13 %;
    - the drawn land touches 12–27 % of the coastal trench;
    - peaks ≤ 6.2 km (a collision through a coast reached 11.5 km before the hug);
    - plates built in 45–130 ms.
  - **Cost:** walled coasts rose from 33–47 % to 44–56 % (69 % for the supercontinent, whose rift seas' shoulders wall
    them). Every active margin stands walled like the Andes, even weakly coupled: coupling by slab age was tried and
    changed nothing measurable. The guard was raised to 70 %; the ≤ 25 % target stays open.

### G2: The ground switches over: sea floor, coasts, painting
- **Build:** the Frame with the land mask, sea-floor age, fracture zones, trenches and margins. Evolution's synthesis and
  carving on Generate's mesh, painted per pixel with the hillshade. The coasts redrawn. Continents are still low and calm
  (no belts yet).
- **Check:**
  - floor depth ~2.6 km at the ridges and ~5–6 km at 150 Myr;
  - shelves wider where the floor beside them is older;
  - Land Coverage met to within 1 %;
  - scale invariance: the same code at 204K and 1.28M agrees cell by cell on the sim mesh;
  - timings in Chrome;
  - Evolution hash-identical.
- **Verify:** oceans that read as Evolution's (ridges, abyssal plains, fracture zones, shelves); coasts that are no
  longer plate outlines.
- **Built 2026-11-02**, the ground without the painting (the painting is its own PR, G2b).
  - **Modules** in `present/`:
    - `seafloor.js`: the floor's age is the time from its ridge, distance ÷ half the spreading rate, over its own plate's
      floor. Floor no ridge reaches ages on slowly. The cap is 180 Myr. Each cell's spreading pole sets its fracture
      zones.
    - `coast.js`: the land's signed distance smoothed with σ 360 km, moved ±240 km by a continent-scale shape, and its
      threshold set so the land's share holds. Landmasses the pieces keep apart stay apart (the Continents slider).
    - `frame.js`: the Frame. Identity rotations; boundaries by kind (the trench's two sides SUBDUCTING / OVERRIDING,
      with the TRENCH flag); `classifyMargins`.
    - `world.js`: Evolution's `synthesizeTerrain` with carving on Generate's own render mesh, its positions turned
      z-up.
  - **In the worker**, with `?next=1`, the ground replaces `assignElevation` and the post-processing, for a build and
    for an edit. Heights in km are handed to the page as raw elevations (`js/color-map.js heightKmToElev`) until it
    reads km. Reapply keeps the ground until G6.
  - **Measured** (`check-present.mjs` 138/138):
    - the floor at the ridges is ~0 Myr, and old floor 6.4 km deep;
    - 24–31 % of the coast lies on a piece border (it was 100 % by construction);
    - the land's share is held on the sim mesh;
    - the ground at a 60K render mesh takes 0.7–0.9 s, and ~1.5 s at 204K on one thread (synthesis 0.54 s, carving
      0.57 s).
  - **Open:** the render's land is ~3 points short of the target (25 % for 28 %): flat continents (no belts or swells
    yet) have low ground that the coast's noise floods. To be held once G3/G4 stand the land up.

### G2b: The painting
- Generate's and Import's views painted per pixel from the heights (Evolution's `view/gpu-paint.js`), with the hillshade;
  the coast the heights' zero line. Then the Relief colours by default.
- **Built 2026-11-02, a first step** within Generate's own renderer, not yet Evolution's GPU painter.
  - **Hillshade:** the worker shades the ground with Evolution's own hillshade (`view/terrain-shade.js`: NW light,
    ×20, flat = 1).
  - **Smooth colours:** the Terrain view colours each vertex by its height (triangle centres from their corners)
    × (0.35 + 0.65 · shade), so the relief shows and the coast is no longer the cells' staircase. This is
    `planet-mesh.js smoothGreys`, now RGB, on the globe, the map and colour updates.
  - **Colours:** Relief by default with `?next=1`.
  - **Still open:** Evolution's per-pixel painter (heights blended, then coloured: a crisp zero-line coast) and the
    globe and map views (`app/globe-view.js`); Import's hillshade.

### G3: Today's mountains
- **Build:**
  - Andean margins;
  - island arcs as chains;
  - collisions with a plateau on the upper side and a foreland on the lower;
  - rifts opening into narrow seas;
  - transpression.
  
  Each has a time active, closed-form heights and wear, and a smoothed front (the piece border says only where).
- **Check:**
  - belts only at convergent boundaries, with widths in Evolution's range for their kind;
  - the land above 1 km in Evolution's range;
  - coastal walling (≥ 1.5 km within 300 km of the coast) well below today's ~⅓, toward Earth's 8 %;
  - the climate's `planets-dry.mjs` (its Generate planets built the new way) no drier.
- **Verify:** ranges, not rims and blotches. Parallel ridges, broken crests, valleys carved.

- **Built 2026-11-02** (`present/belts.js`). One world-indexed crust raster carries it all. Every convergent front is
  written by Evolution's own `spreadBelt` in one call: the convergence it absorbed over a time active drawn per front
  (its own stream), at today's closing rate; heights come from `buildHeights` (a single call reaches the closed form).
  - Ocean under continent: an Andean belt. Laramide where a young slab goes in under a plate driving at it. Coupling
    by the upper plate's drive at its trench: a plate moving away rolls back and builds ¼ of the belt.
  - Ocean under ocean: island-arc crust (≤ 220 km, set back 60 km, no older than 30 Myr) only where an old slab
    (≥ 30 Myr) goes down fast (≥ 3 cm/yr), and its arc belt.
  - Collision: a Himalayan plateau on the side with more land, a foreland on the other; a Ural welt for a short front.
  - Transpression on land; rift shoulders, and a young sea down a rift opened wider than 140 km.
  - The continent's cut between two plates now wanders through a noise (it was a straight bisector).
  - Fewer margins lead into a trench (activeLeadShare 0.35, leading coast within ~57° of the motion, anisotropy 2).
  - **Measured** (`check-present.mjs` 150/150):
    - belts lie only where plates meet;
    - 16–29 % of continental coast is walled (≥ 1.5 km within 300 km), against today's ~33 %;
    - land above 1 km is 5–7 % (interiors stay low until G4).
  - **Open:**
    - Andean margins are still most of the walling: coasts where an ocean plate's growth reaches the shore. To tune with
      the knobs in G6, toward Earth's ~8 %.
    - Passive share 77–98 % (they trade against each other).

### G4: Continents with a past: old orogenies replayed (§3.2b)
- **Build:**
  - terranes, with cratons inside continents;
  - the assembly replayed as collision events over ~2000 Myr: belts by kind, overprinting, wear between events,
    forelands, far-field pushes raising older seams;
  - today's collisions raising intraplate ranges;
  - failed rifts;
  - swells and platform cover;
  - the geology record;
  - the stories of edits (a docked terrane, a microcontinent, a rifted margin).
- **Check:**
  - cratons clear of the coast;
  - seams few and long, not a honeycomb (the start world's measures);
  - every continent above ~10 Mkm² has at least one range of ≥ 1 km more than 800 km from any plate boundary;
  - old ranges lower and broader than young ones, by age;
  - rocks near Earth's families (`check-geology`'s shares).
- **Verify:** interiors with shields, old ranges of several ages far from any plate edge, intraplate ranges behind
  today's collisions, and lowland basins between them.
- **Built 2026-11-02** (`present/past.js`, run before today's belts, which overprint it).
  - **Per landmass of ≥ 1.5 Mkm²:**
    - 1–4 craton cores (one per ~12 Mkm²), placed in the interior: ellipses cut by a straight rifted edge or two, kept
      450 km from the coast, ~22 % of the land;
    - growth out from them through a noise, so the seams wander;
    - accreted rings 650–950 km wide, each 280–450 Myr younger outward.
  - **Events replayed oldest first** with the history's own `spreadBelt` at their times:
    - rings docking (Ural welts);
    - cores welding where their growth meets, the last pair 250–600 Myr ago, a plateau and foreland if under 350 Myr.
  - **Between events** uplift, crests and root wear down, each on its own clock (e-folding 200, 420, 320 Myr). Younger
    belts overprint older ones into `prev*`.
  - **Swells** along the seams, the cratons calm. Seams and swells fade within 550 km of the coast (a passive margin
    rifted across the old belts).
  - **Measured** (`check-present.mjs` 174/174):
    - land median 0.48–0.58 km;
    - 17–24 % of land above 1 km (Earth ~¼);
    - 9–14 % of land is highland more than 800 km from any plate edge (ranges inside continents);
    - past crests ~1 km where under 600 Myr old, ~0.08 km where over 1000.
  - **Not yet:** intraplate ranges raised by today's collisions (the far field) → G5. The geology record (cover,
    exhumation) → G7, with Add detail.
  - **Open, and worse than today:** 27–44 % of the continents' coast is walled (≥ 1.5 km within 300 km), against
    today's ~33 % and Earth's ~8 %. Mostly Andean margins and rift shoulders. G6 tuning target: ≤ 25 %. It matters for
    the climate: walled coasts dry generated planets.

### G5: Plumes and the sea's features
- **Build:** hotspot tracks (islands near the plume, drowning downstream), flood basalts on land (levelled lava, mesas),
  back-arc seas, ocean plateaus. The far field if the owner wants it.
- **Check:** tracks age-progressive along their plate's motion; islands only near plumes.
- **Built 2026-11-02** (`present/plumes.js`).
  - **Plumes:** 4–7, fixed in the mantle, rising more often under continents, at least 1800 km apart.
  - **Tracks:** laid back along each plate's own rotation, up to 90 Myr, while still on that plate. Eruption comes in
    bursts (one volcano each, quiet spells between), each worn by 0.15 km/Myr since it erupted.
  - **Flood basalts:** 0–2 a planet, on the track at the head's age (15–200 Myr), lobed, 0.15–2 Mkm². On land they are
    worn by Evolution's rate; at sea they make an oceanic plateau.
  - **Far field:** today's collisions push through their continents (cratons pass the push on). The push squeezes up
    to 2 old, long-quiet sutures 500–2600 km inland into INTRAPLATE belts (no root of their own).
  - The volcano records now reach the Frame (`writeCrust`).
  - **Measured** (`check-present.mjs` 186/186): volcanoes near the plumes are 67–100 % above the sea, and none older
    than 40 Myr; 2 intraplate ranges per planet where collisions push.
  - Back-arc seas were not done; the synthesis's own arc and fore-arc handling stands in.

### G6: Knobs, edits, codes, speed
- **Build:**
  - every slider mapped (§3.6) and Reapply;
  - the edit path the same as loading a code;
  - the planet code round trip, and old codes' layout identical;
  - the Inspect list replaced: plates and boundaries, plate speed, sea-floor age, belts by kind and age, crust (craton,
    accreted ring ages, arc, ocean), margins, plumes and tracks, wireframe;
  - the hover readout with the crust's age and setting;
  - exports on their scales (question 5);
  - the terrain shown before the climate;
  - phones.
- **Check:** a timing budget per Detail on desktop and phone profiles; a scale-invariance sweep; codes.
- **Built 2026-11-02, the first half.**
  - **The sculpting knobs** (`present/knobs.js`): each scales the Evolution tunables its name says, around Evolution's
    defaults (every factor 1 at Generate's default positions):
    - Roughness: hills and the coast's bays and detail;
    - Terrain Warp: `warpKm` and `cellWarp`;
    - Ridge Sharpening: stripes, ridge noise and rugged crests;
    - Smoothing: wider crests;
    - Hydraulic Erosion: the carving's time (0 = none);
    - Thermal Erosion: the valley sides' slope;
    - Glacial Erosion: how far fjords reach.
  - **Reapply** draws only the ground again from the kept Frame (`world.js presentGroundOf`). This also fixes G2's
    reapply crash (a null buffer in the transfer list).
  - **Land Coverage held:** the sim's land is grown to make up for the coastal strip the terrain sinks (~10 % at 28 %
    land, ∝ 1/√share); the land as drawn is within 1.3 points of the slider on all 6 planets.
  - **The hover's Crust line:** what built the ground and when (an Andean margin active ~90 Myr; an old mountain belt
    last active 1400 Myr ago; ocean floor 85 Myr old; a hotspot volcano; a flood basalt; a craton).
  - `check-present.mjs` 192/192.
- **Left for G8** (with the switch-over):
  - the page reading km itself, with Evolution's export scales (heights are clipped at 6 km until then);
  - the Inspect list's present-day layers;
  - the deprecated sliders;
  - phone timing.
  - Also still open: walled coasts ≤ 25 %.

### G2c + G6d: Coasts and detail from the pieces (owner, 2026-11-03)
- **The owner's words:**
  - "the actual heights are still blobby regardless of the [Detail] slider";
  - "at higher detail and iregularity we are loosing some of the interesting coastlines and shapres that the plates
    create naturally and everything is looking uniformly blobby";
  - "anything labeled as a land plate needs to be some minimum height, and the same for the ocean plates (land can be
    underwater for sure, ocean can only be above during orogeny) I think this will help keep the sharpness".
- **Built 2026-11-03** (`present/coast.js`, `present/hold.js`, `present/relief.js`, `world.js presentSynthesize`);
  `check-present.mjs` 210/210.
  - **The land is the pieces'.** G2's smoothing (σ 360 km) and its growth into the sea are gone. The Frame's continental
    crust is the land pieces as edited; a passive coast is carried one sim cell out to sea, but never beside another
    plate nor between two landmasses.
  - **The ground held to the pieces** on Generate's own mesh, each region by its own piece (the outlines the Plates tab
    draws, as fine as Detail and Irregularity make them), before the rivers carve:
    - a land piece no deeper than −0.12 km (a shelf), except a rift's young sea;
    - an ocean piece no higher than −0.08 km, except island-arc crust and within 160 km of a volcano;
    - the fore-arc, a land piece's edge along another plate's ocean piece, drowned over ~70 km to −0.2…−1.2 km, so the
      trench lies offshore. This replaces G1c's coast hug.
  - **Fine relief** on the uplands and mountains: a ridged fractal from 160 km down to what the mesh can show, ± ~15 % of
    the ground's height (× the Roughness slider), patchy, laid down before the carving so the rivers cut it. It is
    nothing at 60K, ~90 m on a 2 km upland at 204K and ~105 m at 2.5M, in finer octaves. Evolution's synthesis is
    unchanged: `presentSynthesize` runs its steps and matches it exactly with no relief and no hold.
  - **Measured at 204K:**
    - land drawn 25.5–26.2 % for the pieces' 27.4–28 % (the fore-arcs and a little coastal lowland), against 1.3 points
      in G6;
    - 6–9 % of land pieces under the sea;
    - ocean pieces above it 0.1–0.2 % of the globe (arcs, volcanoes);
    - a quarter of the coast exactly on the pieces' outline; the rest is Evolution's coast just inside it, the outline
      its shelf's edge.

### G3b: The pieces jostle — inner seams and the grain (owner, 2026-11-03)
- **The owner's words:** "everything is a little blobby/noisy/'perfect'/uniform … bringing some variety based on the mesh
  and directions of the collisions at the macro and micro level and how that spreads … adding back in some of the
  inner/smaller plate collisions for noise (in whatver way could make sense, doesnt need to be that realistic) could
  force more interesting and 'organic' looking shapes".
- **Built 2026-11-03** (`present/seams.js`; `past.js` takes extra events); `check-present.mjs` 216/216.
  - **Inner seams:** where two land pieces of one plate meet, the pieces' own motion (today's Generate's
    `plate-physics.js`, scaled by each planet's own spread of seam rates) says what the seam did:
    - closing: a past collision (Ural-type), replayed and worn with the rest of the past, 60–1500 Myr ago (log-uniform:
      most old and low, a few young), its work 120–420 km per spread;
    - parting: a sag on the land's base height, 0.2 km per spread over a trough σ 220 km — a lowland inland, a gulf
      where it meets the coast;
    - its sutures can be squeezed up again by the far field (G5).
    - Measured: 23–34 inner seams a planet (81 on a land world), two-thirds of them at work.
  - **The grain:** the distance from the nearest closing front (today's plate edges, every past weld, ring and closing
    seam) is read fast across and slow along by the fine relief (G6d), the way Evolution's ridge noise is read. Its spurs
    and valleys run along the strike near a front (85 % at it, fading with an e-folding of 700 km; 4× longer along than
    across) and wander freely far from any.
  - **Land Coverage:** at most 6 % of the land pieces under the sea (fore-arcs, rift seas and gulfs counted); past that,
    the fringe barely under it is lifted to +20 m, shallowest first. Land drawn 25.9–26.4 % for the pieces' 27.4–28 %.
  - Heights stay Earth-like: land median 0.41–0.50 km, 18–27 % above 1 km.

### G1d + G2d: Edits regroup; every continent active; the sea held softly (owner, 2026-11-03)
- **The owner's words:**
  - "Im not sure the plate swapping/editing is really working corectly. I dont think the plates update motion and
    recalculate things";
  - "I saw a bunch of light blue and patterns of dark blue 'diamonds' on the ocean";
  - "can we potentially have each continent have at least 1 active orogeny/plate boundary?"
- **Built 2026-11-03**; `check-present.mjs` 226/226.
  - **A bug:** the worker's own `r_plate` (each region's piece) was transferred to the page and left empty. After an
    edit or Reapply every region read as a land piece, and the whole sea was held to the land's floor (light blue).
    The present-day world now keeps the worker's copy.
  - **Edits regroup** (reverses decision G1's "edits never regroup"): the plates are built on the layout as edited, as
    loading its planet code would. A raised piece rides its continent's plate, whose motion is fitted again. The pieces'
    own motion stays the unedited layout's: `plate-physics.js` re-run on an edit moved all 80 pieces and flipped up to a
    third of the plate edges.
    - The leading-margin draws are keyed to each unit's first piece, and the ocean seeds' choice to each piece's own
      draw, so an edit elsewhere leaves them be. An edit now flips 12–26 of 234 piece borders' plate-edge status (54
      when it joins two continents).
    - Each plate's colour comes from its first piece, so only regrouped plates change colour.
  - **Every continent active:** the plates are built once as drawn. A continent of at least 1 % of the sphere left with
    no trench, collision or transform pressed together on it then leads into the ocean with its biggest unit, and all
    is built again. None of the 10 test planets needed it.
  - **The sea held softly** (`hold.js`):
    - an ocean piece's ceiling deepens from −0.05 km at the land pieces' edge to −0.3 km over 150 km (a shelf, not a flat
      band where the land was carried out);
    - every hold is soft (squeezed into a band 50 m deep under its bound, not cut flat);
    - the exceptions (rift seas, arcs, volcanoes) are read through the terrain's warped sampling, not the nearest sim
      cell, so no sim cell's outline shows.
  - A single supercontinent's walled-coast guard is 80 % (74 % now: its long rim, much of it active, as Pangaea's was).

### G4b: The past along the pieces (owner, 2026-11-03)
- **The owner's words:** "The noise and mountains still look a bit too random, i think it needs to be more based on the
  internal plate boundaries." This reverses decision 11's "seams … never along the piece grid" for the past.
- **Built 2026-11-03** (`present/past.js`); `check-present.mjs` 225/225.
  - **The terranes are the pieces.** A continent's craton cores are its pieces deepest inland, one per 12 Mkm², at most
    4, at least a piece apart. Their interiors are the cratons: 160 km in from the piece's edges and 400 km from the
    coast.
  - The other pieces dock outward from the cores piece by piece (a Dijkstra between the pieces' middles), one ring per
    650–950 km, each 280–450 Myr younger. Each docks along its border with the pieces already in: a Ural-type welt on
    the pieces' outline.
  - The cores weld where their growths meet, along the pieces' edges between them (the major sutures).
  - The noise is gone from the seams (no more noisy ellipses or noise-grown rings). The swells' noise is down from 0.15
    to 0.05 km; their height now follows the seams (0.3 km over 500 km along the pieces' seams, 0.14 km floor). Past
    seams reach within 300 km of the coast (550 before).
  - The fine relief is full along the fronts (every piece edge, today's and the past's) and falls to 35 % far from any
    (e-folding 500 km); its patchiness is down from ±50 % to ±20 %.
  - **Measured:** land median 0.35–0.58 km, 15–25 % above 1 km; walled coasts 40–50 % on the default planets (48–56 %
    before), 67 % on the supercontinent.

### G3c: Island arcs (owner, 2026-11-03)
- **The owner's words:** "island arcs and chains and things like indonesia/phillipines are nowhere to be found, we should
  find a way to simulate them better".
- **Built 2026-11-03** (`present/belts.js`, `PRESENT_TERRAIN`); `check-present.mjs` 232/232.
  - **Two styles of margin** (Uyeda & Kanamori 1979): a subduction front along a continent either squeezes an Andes
    (Chilean type) or has the arc split off the continent's edge and a sea open behind it (Mariana type: Japan and its
    sea, the Kurils, the Philippines, Indonesia's arcs).
    - The chance: 35 % at a 60 Myr slab and a still upper plate, +35 % per 100 Myr older slab, −12 % per cm/yr the
      upper plate drives at the trench, at most 85 %. A draw of its own per front.
    - A split: the continent's edge becomes arc crust (120–220 km, 40–140 Myr old: chains, or long islands as it
      matures) and the sea behind it young ocean floor (220–520 km, 6–30 Myr), never through a craton.
    - 28 split margins beside 37 Andean on the 6 planets.
  - **Arcs at sea:** each arc's crust 25–120 Myr old, its own draw (it was 30, so all were submerged); arcs from slabs
    ≥ 15 Myr old going down ≥ 2 cm/yr (30, 3 before), up to 280 km wide.
  - **Generate's terrain draws a mature open-ocean arc at −0.35 km** (Evolution's −1.5) and one near a continent at
    +0.5 (0.3), with straits cut 90 km deep at islands 200 km apart (35, 140). The result is chains of islands, not
    ribbons. Evolution is unchanged (`PRESENT_TERRAIN`).
  - Walled coasts 32–43 % on the default planets (a split margin is no wall); ocean pieces above the sea 0.3–0.9 % of
    the globe (arcs, volcanoes; Earth's arcs ~0.5 %).
  - **Not yet:** Indonesia's broad clusters (arcs colliding with continents and microcontinents).

### G3d: Arcs that vary, near land (owner, 2026-11-04)
- **The owner's words:** "ocean island arcs are too uniform and everywhere … lets definitely work on making the open arcs
  much less uniform, and they should be less likely on ocean to ocean/much more likely land to ocean. (or on an ocean
  plate right by land on the same major plate, that is good as it looks like a trailing/edge arc".
- **Built 2026-11-04** (`present/belts.js`); `check-present.mjs` 239/239.
  - **An arc stands along only part of its trench.** A noise along the trench (stretches ~900 km) is read as a share of
    its spread and compared with the chance there: 90 % within 500 km of the upper plate's own land (an arc trailing
    from its continent: the Aleutians, the Antilles, the Scotia arc), falling to 8 % at 1800 km or on a plate with no
    land (the open ocean: the Marianas).
  - **Where it stands it varies along its strike** (over ~500 km): its width × 0.45–1.5, its distance from the trench
    40–150 km, and toward a stretch's ends younger (down to 15 % of its age: a submerged ridge its volcanoes break) and
    narrower.
  - **A long continental front splits along some stretches (~1600 km) and squeezes an Andes along others**, by the same
    noise against its chance (G3c's, now no longer one draw per front); the back-arc sea narrows toward a stretch's ends,
    where the arc joins its continent again (Kamchatka, Sakhalin).
  - **Measured on the 6 planets:** an arc along 25 % of the trenches that could hold one (every one before); 65 % of the
    arc crust at sea within 1000 km of land (the supercontinent's 35 %: its ocean plates carry no land); ocean pieces
    above the sea 0.12–0.33 % of the globe (0.3–0.9 % before); 49 split margins beside 58 Andean.

### G4c: The pieces bent, and smaller terranes (owner, 2026-11-04)
- **The owner's words:** "We should still have some of the old mountain building especially to add more texture. ANd even
  the inner plate stuff should be more warped and twisted too (as should the old mountain building) so the big plates
  really drive it (and the smally plates give texture to the big plates mountains)".
- **Built 2026-11-04** (`present/warp.js`; `past.js`, `seams.js`, `belts.js` read it); `check-present.mjs` 246/246.
  - **The pieces' outlines are bent before the past is read from them.** The plate edges and coasts stay on the pieces;
    only the past and the inner seams follow the bent outlines.
    - **The drag of today's plates:** at every front where a plate is pushed (a collision, a trench's upper plate, a
      transform pressed together), the ground is carried along the other plate's motion, 10 Myr of it, at most 350 km,
      fading inland over 450 km and smoothed over 300 km. An old seam that runs into the front bends toward it (an
      orocline); one beside its end swings round it. 36–53 % of the land is dragged, at most ~300 km.
    - **A slow warp at two scales:** 240 km over waves of 2400 km bends a seam's course, and 100 km over 1100 km,
      read at the broadly warped point, twists it. Kept under the amplitude that folds a seam over itself, so the
      ranges stay lines, not blobs.
    - About 3–5 % of the land reads its piece from a neighbour; 60–74 % of the old fronts lie off the drawn borders.
  - **Each piece is made of smaller terranes** (the "small plates"): one per 1.6 Mkm², at most 4, their outlines bent
    alike (the nearest of the piece's seeds at each cell's bent point).
    - The seams between them are low welts: 150–1800 Myr old (log-uniform, at most 300 Myr older than the piece's
      docking), 100–260 km of convergence, a 0.08 km swell. None inside a craton or within 300 km of the coast.
      76–188 per planet.
    - Along today's ranges each terrane took up its own share of the convergence (× 0.65–1, its own draw): the Andes'
      segments. Only lower, never higher, so no peak passes what its front built.
  - **Measured:** land median 0.41–0.45 km on the default planets (0.34–0.36 before), 20–23 % above 1 km (13–15 %:
    Earth's ~25 %); peaks 5.7–7.9 km; walled coasts 41–47 % (35–46 % before), the supercontinent's 66 % (58 %).

### G3e: Indonesia (owner, 2026-11-04)
- **The owner's words:** "lets figure out a way for indonesia".
- **Built 2026-11-04** (`present/belts.js`, `hold.js`); `check-present.mjs` 253/253. Three of the settings that make
  Indonesia and the Philippines:
  - **A continent stretched behind its arc** (Sundaland; the Aegean). A split margin's back-arc (G3c) either spreads
    into one sea floored by new ocean crust (Japan), or, with a 30 % chance and at most 2 a planet, stretches the
    continent behind the arc and breaks it.
    - 600–1200 km behind the arc, blocks stand where a noise about 750 km across is high (~38 % of it; more toward the
      zone's far edge, back to the mainland). These are the Borneos and Sulawesis.
    - Between the blocks lies young sea floor. In the Frame it is sea, so Evolution's terrain draws its coasts, and the
      arc in front gets straits: a chain of long islands where a noise along it is in its lowest 22 % (Sumatra, Java,
      Bali).
    - On Generate's mesh those seas are held on a shelf (above −0.25 km, softly: shallow by the islands, a little deeper
      away from them, as the Java Sea is). Where a sea lies farther than 260 km from every block, a deep basin opens (the
      Banda, Celebes, Sulu seas).
    - Land Coverage counts these shelf seas with the land (drowned continent); the land drawn falls by ~0.5 point.
  - **Microcontinents:** a spread back-arc sea leaves slivers of the continent in it (patches ~350 km, ~14 % of the sea),
    like Corsica and Sardinia or eastern Indonesia's slivers.
  - **Arcs meeting continents:** an ocean arc whose diving plate brings a continent within 700 km of its trench (fully
    within 250) stands along all of it there, mature, 60 % wider and raised by twice the convergence (Timor before
    Australia, Taiwan, New Guinea's north).
  - **Measured on the 6 planets:** 11 stretched continents (0.2–0.7 % of the globe under their shelf seas; Earth's Sunda
    shelf ~0.4 %), 50 arc cells meeting a continent, 17 microcontinent cells.

### G4d: Ranges that vary, in tiers; the far field (owner, 2026-11-04)
- **The owner's words:** "mountains are still a little wormy, we should warm/change them more (especially the old ones and
  the ones from the smaller plates.) Also we should have more long range impacts from the major plates on interiors", and
  "The major plates shoudl also be the biggest mountain ranges/rifts by a majority. Like, on average major plates = 1.5x
  minor plates = 1.5x old orogeny".
- **Built 2026-11-04** (`present/past.js`, `plumes.js`, `belts.js`); `check-present.mjs` 260/260.
  - **No more even tubes.** Along its length an old range's work varies × 0.4–2.0 (over a ~550 km noise) and its width ×
    0.5–1.7. Where the noise is in its lowest 25 % the range pinches out (its seam stays a weak line); a small terrane's
    welt pinches out over its lowest 45 %, so it reads as broken ridges. 30 % of the pieces docked quietly, leaving a
    suture but no range, so the old ranges are some of the pieces' outlines, not a net round every one.
  - **The far field** (Evolution's: `tectonics/step/far-field.js` spreadPush, its costs and shares).
    - Today's fronts push through their plates: a collision with the shortening it absorbs, a fast, strongly coupled
      subduction coast and a flat slab with a share of their belts' work. The push fades over 1500 km of path cost
      (Evolution's 1100: Generate's is the whole push at once).
    - Each past docking and weld pushed through its continent at its time, with half its work.
    - The records (grain, folds, axis) are written into the Frame (`writeCrust`), so Evolution's terrain draws the
      lithosphere's folds and the combed grain across the interiors. 97–99 % of the land is pushed.
    - Where today's push meets an old weak line square-on far inland (≥ 450 km of path), the strongest 5 lines a planet
      are squeezed up again (2 before, collisions only), each varying along its length.
  - **Tiers:** the pieces' seams (the minor plates' ranges) are younger, 30–600 Myr (60–1500), with 140–480 km of work
    (120–420). The old orogenies wear more slowly (uplift e-folding 220 Myr, crests 900, root 420; were 200, 420, 320).
    - Crests (90th percentile of the ground each tier last raised, 6 planets): today's continental belts 5.0 km, the
      seams 3.0, the old orogenies 1.7 — × 1.69 and × 1.73 (the owner's 1.5 and 1.5).
    - By planet the order holds on most; seed 6's plate edges are mostly arcs.
  - **Fixed:** the past's event times were compared with the Float32 records exactly, so the "event lasted ~40 Myr"
    stamp almost never applied.
  - **Measured:** land median 0.40–0.45 km on the default planets, 23–25 % above 1 km; walled coasts 46–55 % (42–50 %
    before); the supercontinent 39 % above 1 km (its allowance now 42 %).

### G3f: Rift valleys (owner, 2026-11-04)
- **The owner's words:** rifts are "too uniform", and "its strange that they open up to like ocean in the middle of
  continents, they should look more like the african rift valey for this tool, and particularly strong ones can pull away
  closer to the coasts".
- **Built 2026-11-04** (`present/belts.js` rift, new `present/rifts.js`); `check-present.mjs` 266/266.
  - **Inland, a rift is a valley.**
    - A graben 0.6–1.6 km deep and ~60–110 km wide is cut on Generate's mesh along a line that steps from side to side
      of the rift in ~380 km segments (en echelon). It is deeper and wider here, shallower there, and broken where a
      noise along it is in its lowest 12 %. It is read through the terrain's warped sampling, and the floor stays land.
    - The valley's crust is thinned: the old ranges' root, uplift and crests there are cut to 30 %.
    - The shoulders rise beside it, never on its line, their work × 0.4–1.6 along it. The whole sits on a broad dome
      (0.45 km × 0.5–1.5, σ 450 km): the East African plateau.
  - **Only a strong rift near a coast has opened a sea.** A rift opened past 140 km pulls apart only within 450 km of the
    coast (× its opening ÷ 140, at most 2.2×). The sea is widest at the coast and narrows inland into the valley (the Red
    Sea, the Gulf of California). Before, any such rift opened a sea along its whole length, mid-continent.
  - **Measured:** valley floors 0.6–1.2 km under shoulders 1.8–2.6 km on the 6 planets; rift seas only toward coasts.

### G5b: Continents that fit (owner, 2026-11-04)
- **The owner's words:** "Do you think there is anything we can do to create more of an illusion that some of these
  continents would have fit together like as puzzle in the past", then, of the five ideas proposed: "it all in 1 pr now".
- **The limit:** the continents' outlines are the layout's (old planet codes keep them), and the coasts follow the pieces
  (a land piece may drown, an ocean piece never rises).
- **Built 2026-11-04** (`present/plates.js` conjugates, new `present/fit.js`, `past.js`, `hold.js`);
  `check-present.mjs` 273/273.
  - **The pairs:** two continent plates bordering each other at sea over ≥ 6 sim edges and parting there (as a ridge
    is classed). 2–3 per default planet, 6 on the land world, none on the supercontinent.
  - **An Atlantic between them:** their ocean's cells each go to the plate of the nearer coast, within 6000 km (the
    narrow-sea split, G1c, for a whole ocean). The ridge runs down its middle, mirroring both coasts (4–11 % off the
    midline), and the floor's ages stripe parallel to both.
  - **The closing rotation:** fitted to the facing coasts (within the narrowest gap + 1500 km of each other).
    - B's coast centroid is carried onto A's, then refined by ICP (each point to the nearest of the other's; the best
      rotation by Horn's quaternion method; 12 rounds).
    - Never one that lays B's land over A's. A pair fitting no closer than 450 km (mean) keeps only its ridge: 14 of 17
      fit, at 207–423 km.
  - **Coasts that interlock:**
    - The rotation is pushed 120 km further, so the coasts overlap more than they gap.
    - Within 320 km of a facing coast, where one's land lies on the other's, one side is drowned to a shelf (−0.08 km).
      Which side is chosen by a noise read at the join (the same point from either side, patches ~500 km), so the two
      are cut as one line.
    - 70 % of the overlap is resolved. Land Coverage counts these drowned edges with the land.
  - **Geology carried across:**
    - On a facing coast the past's ranges and shields run to within 60 km of the coast (300 and 400 elsewhere).
    - Each docking or weld reaching within 500 km of one facing coast carries on from the matching point of the other,
      along its own trend, 1000 km either side of the join (the Appalachians and the Caledonides).
    - Each craton cell within 500 km of one facing coast makes the matching cell on the other craton (the São Francisco
      and the Congo).
    - One failed rift arm (500–1000 km) runs inland from a well-fitting point of the join, on one side (the Benue trough).
  - Scratch diagnostic `v2/out/g5b-recon.mjs <seed>` draws each pair with its ocean closed.

### G7: Add detail parity
- **Build:** the finish on Generate worlds: rivers and lakes, the ice age, sand seas, the zoom detail, Satellite (with
  clouds), Geology and Food, and their export rows. Automatic or a button (question 3). Phones up to 640K, as in
  Evolution.
- **Check:** `check-farming`- and `check-geology`-style shares on Generate worlds; river ends at the sea.

### G8: Switch over and tidy
- **Build:**
  - `?next=1` becomes the default;
  - the old code is removed;
  - the docs (`docs/generate.md`, `docs/shared.md`, README file list, `v2/README.md`), tutorial, SEO block, `llms.txt`
    and sitemap;
  - What's New (owner's call), with the heads-up on codes;
  - the current version archived at `/v/<major>.<minor>/`.
- **Check:** `check-seeds`, `check-save` (Evolution), the climate's Earth checks (Import's path is unchanged), and a phone
  pass.

## 7. What it does to each protected strength

| Strength (VISION.md) | Effect |
|---|---|
| 1. Climate depth | Unchanged, and fed better terrain: fewer coastal walls should make generated worlds less dry for the right reason. |
| 2. Instant, zero-friction | Kept. The terrain gets faster; the climate is then most of the wait (§3.8). Add detail never blocks. |
| 3. Watching a world form | Evolution's. Generate gains motion arrows and a readout that tells each feature's past. |
| 4. Exports and data | Gains every Evolution export row after Add detail. The height scales may change (question 5). |
| 5. A true globe | Kept. Per-pixel painting on the same globe. |
| 6. Free and open | Unchanged. |
| 7. Terrain aesthetics | The point of the plan. |
| 8. Plate editing | **Kept as the same gesture on the same units.** The trade-off: what rises is still what you clicked, but its coast is drawn as a real coast within ~150 km of the piece's edge, not traced along it. Edits also gain a story (a docked terrane, a microcontinent). |
| 9. Runs on phones | Kept to Generate's "most mobile" standard: the past on a fixed 40K mesh, synthesis on 3 workers, Add detail up to 640K. |

## 8. Risks

- **Evolution's terrain was tuned on histories.** An implied past differs in its statistics (belt widths, ages, how
  many seams). The fix is to tune the *records* in `present-config.js`, never Evolution's `terrain-config.js`. Generate
  passes overrides only where its knobs say.
- **Shared code.** Every change to `v2/` must keep Evolution byte-identical, checked by hashes as the exact optimisations
  were.
- **The ridge-variety work (R1–R4, PR #83) never reached main.** Generate inherits whatever main's terrain is. If the
  owner wants R1–R4, land it first (question 8).
- **Mesh, cache and worker plumbing** inside Generate's worker: nested workers already work in Evolution's finish worker.
- **Import** shares the painting and `planet-mesh.js`. It gets the new painting and keeps its own heights pipeline.
- **The brand redesign** (PR #92) restyles the same pages. The owner (2026-11-02): it does not affect this work for
  now.

## 9. Questions for the owner

1. **Pieces and plates.** The Plates slider would set the pieces you click (as today). Fewer, larger plates that carry
   continent and ocean would be made from them. Keep the slider's name "Plates", with the Plates tab showing the moving
   plates and the pieces outlined inside them? (Recommended.) Or rename it?
2. **Edited coasts.** Should a raised piece's coast be drawn naturally (within ~150 km of its edge, Land Coverage
   kept)? (Recommended.) Or traced along the piece's outline as today?
3. **Add detail on Generate.** Should it run by itself in the background after every build (desktop), with tabs
   unlocking as it lands and a button on phones? (Recommended.) Or always a button, as in Evolution?
4. **Default colours.** Evolution's Relief (recommended, since it is what the comparison shows), or Classic?
5. **Export height scales.** Adopt Evolution's: −11…+9 km with the sea, and 0…+9 km for land, so the tools agree? Or keep
   Generate's −5…+6 and 0…6?
6. **Old codes.** Same continents and plates, new terrain; the current release archived at `/v/<major>.<minor>/` and a
   What's New heads-up. Is that acceptable?
7. **New knobs.** None is proposed. A "world age" (young and rugged ↔ old and worn) is a natural later candidate. Leave
   it for later?
8. **Ridge variety (PR #83, R1–R4).** Land it in main before this, so Generate inherits it?
9. **The sculpting sliders' new meanings (§3.6).** Is Smoothing as wear, Glacial as the ice age, and so on, OK?

## 10. Research behind this plan

Four read-only passes on 2026-11-02:
- Generate's pipeline: stages, random streams, codes, consumers, timings;
- Evolution's Frame and what the terrain, finish, geology and farming read (a minimal-frame run through all of them);
- Evolution's look techniques, each with its file and whether it needs history;
- the start world's assembly and closed forms for belts, wear, sea floor and tracks.

Their scratch scripts are in the session's scratchpad: `time-generate.mjs`, `coast-check.mjs`, `probe-frame0.mjs`,
`time-start.mjs` and `time-pieces.mjs`.

**Closed forms worth keeping:**
- A belt's uplift and crests after front work W: A·profile(u)·(1 − e^(−W/B)), with B = 20 (Andean), 50 (Himalayan) or
  30 (Ural) km. Saturated within ~3B.
- The history's erosion, dh/dt = −h·r(lat)·f(h)/τ:
  - τ = 100 Myr for uplift, 70 for the root, 368 for crests, 200 for swells;
  - below ~1.5 km, a plain exponential;
  - an active belt settles at 95–99 % of its target.
- Hillslope smoothing over T Myr is roughly a Gaussian blur of σ = √(160·T) km.
- Sea-floor depth = min(6.4, 2.6 + 0.345√age) km.
- A track is the plume carried by Rot(ω, t).

**Bugs found in today's Generate** (moot after the switch, but real until then):
- A Ctrl-click Rebuild skips plate physics and the mantle field, so it builds a different world from the code it shows.
- Reapply drops the hotspot field from the warp.
- `warpTerrain`'s "weighted max" is a crossfade on both branches.
- The 204K default sits just past a 200K octave switch.
