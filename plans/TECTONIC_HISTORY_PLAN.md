# Orogenic History Engine — Research & Design (v2 line)

Status: research + architecture proposal. No code yet.
Target: a **net-new** generator built around a *simulated tectonic history*, where the
present-day heightmap is a **consequence** of a recorded sequence of orogenies rather than
a one-shot stress field. World Orogen v1 stays as-is; this is a parallel engine.

---

## 0. Research caveat (read first)

This session's network egress proxy blocks `worldbuildingpasta.blogspot.com`,
`web.archive.org`, `gplates.org`, `liris.cnrs.fr` and `hal.science`. Only GitHub raw
content and the search index were reachable. **Everything attributed to the blog below was
reconstructed from search-index extracts of the posts plus prior knowledge, not from a full
read of the source.** Numbers are marked `[verified]` when a search extract quoted them
directly and `[recalled]` when they come from memory and should be re-checked against the
post before they get hardcoded into `tectonic-config.js`.

Primary sources to re-read when the blog is reachable:

- Part Va — *Constructing a Plate Tectonic History* (the core method)
- Part V Supplement — *Using GPlates* (the mechanical workflow; maps to our data model)
- Part VIIa — *Tectonics and Volcanism* (landform taxonomy; maps to our elevation synthesis)
- Part VIIb — *Erosion and Deposition*
- Part VIIc — *Constructing Global Terrain* (heightmap assembly, elevation banding)

---

## 1. The Worldbuilding Pasta method, distilled

The blog's process is a **manual forward simulation**, not a noise process. That framing is
the whole point and it is what v1 is missing. Restated as an algorithm:

### 1.1 Initial state

- Start from an **ideal supercontinent**, not from random continents. `[verified]`
- Seed it with **~10 major cratons** (the guide uses 10; the GPlates supplement suggests
  **8–12** for an Earth-like land fraction). Cratons are old, thick, tough crust that
  deforms very little — they are the *invariants* of the whole run. `[verified]`
- Supercontinent covers **~1/4 of the planet's surface**, matching Earth's land area
  ~1 Ga. Above ~40% the continents have no room to manoeuvre; above ~50% plate tectonics
  effectively locks up. `[verified]` — that's a hard clamp for any "land fraction" slider.
- Cratons with exposed ancient rock = **shields**; cratons buried under younger cover =
  **platforms**. Same object, different surface expression. `[verified]`

### 1.2 The loop

- Timestep: **50 Myr** — long enough to keep the step count manageable, short enough not to
  lose detail. `[verified]`
- Total run: **500 Myr – 1 Gyr**, i.e. **10–20 steps**, covering the current supercontinent
  and the one before it. `[verified]`
- Plate speed: a worked example uses **3.4 cm/yr**, characterised as fast-but-reasonable →
  **~1,700 km of travel per 50 Myr step**. `[verified]` Earth's range is ~1–10 cm/yr.
- Motion is expressed as **Euler rotations** (pole + angle), not translations — the GPlates
  model. If a step produces implausible motion, you re-roll that plate's rotation and redo
  the step. `[verified]`
- **Subduction zones are added every other step or so**, deliberately, to keep the history
  varied rather than uniform. `[verified]` New subduction is marked **just offshore of the
  leading edge** of a moving continent. `[verified]`

### 1.3 Margin asymmetry (the single highest-value rule)

Once continents are in motion, most develop an **asymmetric profile**:

| Side | Type | Expression |
|---|---|---|
| Facing direction of motion | **Active margin** | Deep trench offshore, volcanic orogeny, high range, steep coast |
| Trailing | **Passive margin** | Wide shelf, low relief, thick sediment wedge, gentle coast |

`[verified]` This one rule reproduces the Americas' east/west contrast, and it is
*impossible* to express in v1 because v1 has no persistent direction-of-motion history.

### 1.4 Orogeny taxonomy (Part VIIa)

Four types, on two axes — **cause** (subduction vs collision) × **width** (thin vs broad).
They are ends of a spectrum, not exclusive categories. `[verified]`

| Type | Cause | Width | Earth analog | Notes |
|---|---|---|---|---|
| **Andean** | Subduction at a coast | Thin | Andes | Volcanic front along the coast; forearc basin between outer-arc ridge and front; backarc behind, sometimes running to the next divergent boundary. Clear fall line at the back of the front. `[verified]` |
| **Laramide** | Subduction at a coast | Broad | Rockies / Sevier–Laramide | Flat-slab; deformation propagates far inland, well behind the arc `[recalled]` |
| **Ural** | Continent–continent collision | Thin | Urals | Narrow welded suture, little plateau |
| **Himalayan** | Continent–continent collision | Broad | Himalaya + Tibet | Highest peaks + a large internally-drained plateau behind them |

Dimensions to calibrate against: the Andes are **200 km wide (N Peru) to 750 km (Bolivia)**,
with up to **13 km of relief from trench to Altiplano**; Sumatra's arc ridge is **~50 km
across and >3 km high**. `[verified]`

### 1.5 Ageing

- **Over ~450 Myr old → eroded essentially flat.** `[verified]` But the *roots* survive and
  can be re-uplifted and exhumed by a later event. `[verified]`
- Between young and dead, categories blur: later volcanic pulses overprint, range edges
  lose definition, deformation migrates. `[verified]`

So orogeny elevation is a function of **(type, age, cumulative overprinting)**. That is the
core equation of this engine.

### 1.6 Other features tracked

- **Island arcs**, **oceanic plateaus**, **submarine ridges**, **seamounts**, **continental
  fragments / microcontinents** — all are *future accreted terranes*. A continent that pulls
  in a microcontinent closes the subduction zone and builds a collisional range. `[verified]`
- **Hotspots** leave trails; **LIPs** appear in broadly the same places but are tied to large
  plumes, and cluster either just before a plume surfaces (LIP / major rifting) or as remnants
  after it dies down. `[verified]`
- **Failed rifts** (aulacogens) are recorded and matter later — they steer rivers and
  later break-up. `[verified]`
- Supercontinent-induced plumes help drive break-up but are not required; competing
  subduction zones can pull a continent apart on their own. `[verified]`

### 1.7 The outputs the blog actually keeps

This is the tell for what our data model must store. The recommended output set is: `[verified]`

1. Orogenies, **coloured by age**, + cratons + failed rifts
2. LIPs **coloured by age**, + hotspots + hotspot tracks
3. Subduction zones + outlines of **all constituent terranes**

Those three maps *are* the tectonic history. Terrain is derived from them afterwards
(Part VIIc) — heightmap with roughly **18 elevation bands above sea level and 10 below**,
peaks up to ~9,000 m but **7–8,000 m is plenty at global raster resolution**. `[verified]`

---

## 2. GPlates data model — what to steal

GPlates is worth copying structurally even though we never touch the app.

- **Rotation file (`.rot`)** — one line per plate per time sample:
  `movingPlateID, timeMa, poleLat, poleLon, angleDeg, fixedPlateID`. `[verified]`
- Rotations are **relative to a parent ("fixed") plate**, forming a **tree** rooted at an
  anchored plate. Absolute position = walk up the tree composing finite rotations. The tree
  **can change shape between times**. `[verified]`
- Geometry lives in separate **feature collections** with a plate ID stamped on each feature;
  reconstruction = look up the feature's plate ID, compose its rotation chain at time *t*,
  apply. `[verified]`
- Worldbuilding workflow: give each craton a new plate ID, keep them in one feature
  collection, then draw coastline polygons, then ocean crust polygons traced from flowlines.
  `[verified]`
- Third-party tooling exists for exactly this pain (`Project-Artifexia`, a `.rot` editor that
  handles merging plates at a timestamp, splitting co-moving plates, and drift correction).
  `[verified]` — the fact that a dedicated editor exists tells us **plate merge/split over
  time is the hard part of the data model**, so design for it from day one.

**Implication for us:** the simulation state should be a *time-indexed rotation tree over
terranes*, and every geometry (craton polygon, arc, orogen belt, hotspot track) should carry
a plate ID + birth time. Then "show me the world at 300 Ma" is a pure function, the history
scrubber is free, and exporting a `.rot` + GPML for GPlates power users becomes a
day-two feature rather than a rewrite.

---

## 3. Prior art survey

| Project | Platform | Model | What to take | What to avoid |
|---|---|---|---|---|
| **Tectonics.js** (Carl Davidson) | Browser, JS + WebGL/GPU | Full Eulerian crust simulation on a sphere; per-cell crust with thickness/density, real isostasy, rifting, subduction, erosion; runs continuously | The crust-column state vector (thickness, density, age) and isostatic elevation; proof that a real sim runs in a browser | Open-ended sim with no authored narrative; slow to converge; hard to art-direct |
| **Procedural Tectonic Planets** (Cortial, Peytavie, Galin, Guérin — EG 2019) | Offline research | *Procedural approximation* of tectonics rather than physical simulation; plates deform lithosphere via approximated subduction/collision; user-controlled plate motion; produces continents, ridges, ranges, island arcs | **Closest match to our brief**: explicitly trades physical accuracy for controllability + speed, which is exactly the CLAUDE.md tie-break order | Paper is paywalled/blocked here — re-fetch the PDF for the actual uplift equations |
| **platec / plate-tectonics** (Viitanen; used by WorldEngine) | C++ (2D) | Flat fractal map split into plates, plates translated, continental collision folds belts, oceanic collision subducts into coastal ranges/island chains | Simple, fast, and its collision/subduction branch is the minimum viable rule set | 2D flat map — breaks the globe-first requirement |
| **Undiscovered Worlds** (lukabergs) | Desktop | Tectonics engine first, then ordered terraforming passes: mountain building, volcanism, coastline refinement, erosion, deposition; W × W/2 cell grids; uint16 GeoTIFF I/O | The **explicit pass ordering** and the "each stage independently configurable, inspectable, repeatable" discipline | Not web, not interactive |
| **Experilous** (Andy Gainey) | Browser JS | Flood-fill plates from seeds; per-plate rotation axis + drift angle + spin angle; boundary elevation from relative motion | The per-plate drift+spin parameterisation — it is already a finite rotation in disguise | Elevation assigned only at boundaries; no history |
| **Red Blob 1843** | Browser JS | Sphere Voronoi, 10–50 plates, elevation from plate boundaries, rivers on the sphere graph, random per-plate moisture | Sphere mesh + river code patterns; honest about where it punts | Deliberately no climate/tectonic depth |
| **SimpleTectonics** (weigert) | C++17 + shaders | Clustered-convection plate sim; shader passes for cascading, diffusion, subduction | Convection-driven plate *emergence* instead of hand-placed plates | Desktop GL |
| **Azgaar FMG** | Browser | Not tectonic — heightmap templates + political layer | The editing UX bar | No geology |
| **World Orogen v1** (this repo) | Browser | Single-snapshot plates → stress → elevation → climate | Mesh, worker pipeline, erosion, climate, edit mode — all reusable | No time axis (see §4) |

The gap nobody has filled: **a browser tool where the user watches a tectonic history run and
the mountains they get are explained by it.** Tectonics.js simulates but doesn't narrate;
Pasta narrates but is manual and takes weeks; everyone else skips history entirely.

---

## 4. Where v1 stands

v1 is a well-built **one-shot** system. Reading `js/elevation.js`:

- `findCollisions()` classifies each region against its most-converging neighbour into
  boundary type 1/2/3 and a `subductFactor`, using an *instantaneous* velocity difference
  over a single scale-corrected `dt`.
- `propagateStress()` diffuses that stress inland.
- Cratons and orogenies exist only as **derived texture masks** —
  `r_t_craton = max(0, 1 - tecActivity * CRATON_TECTONIC_MULT) * (1 - basin)` — i.e. "craton"
  means "wherever nothing much is happening right now", the exact inverse of the real
  definition, where cratons are ancient *causes* that constrain where deformation can go.
- `orogenicPower` is a noise-shaped multiplier on stress, not a record of an event.

Consequences: no orogeny ages, so no eroded-flat old belts and no re-uplifted roots; no
margin asymmetry; no terrane accretion; no hotspot tracks; and no way to answer "why is this
range here", which is the entire pitch of an orogeny-first tool.

**Reusable as-is:** `sphere-mesh.js`, `planet-mesh.js`, the worker pipeline in
`generate.js` / `planet-worker.js`, `terrain-post.js` erosion, the whole climate stack,
`edit-mode.js` interaction, `planet-code.js` packing, `scene.js`, the tuning harness under
`tuning/`.
**Replaced:** `plates.js`, `plate-physics.js`, `super-plates.js`, `coarse-plates.js`, and the
tectonic front half of `elevation.js`.

---

## 5. Proposed architecture

Two layers, deliberately decoupled — this is the key design decision.

```
  ┌─ Layer A: HISTORY  (coarse, Lagrangian, ~10–20 steps, few thousand points) ─┐
  │  cratons · terranes · plates · rotation tree · event log                    │
  └────────────────────────────────────────────────────────────────────────────┘
                                   │  emits a feature list at t = 0
                                   ▼
  ┌─ Layer B: TERRAIN  (fine, Eulerian, existing sphere mesh, 2K–2.5M regions) ─┐
  │  features → uplift fields → isostasy → erosion → climate (v1 pipeline)      │
  └────────────────────────────────────────────────────────────────────────────┘
```

Layer A is cheap (it runs on a few thousand Lagrangian markers, not on the render mesh), so
the history can be re-run interactively and scrubbed. Layer B is the expensive one and runs
once per "bake". This also gives scale invariance for free: Layer A is resolution-independent
by construction, and only Layer B has to obey the `avgEdgeKm` rules in CLAUDE.md.

### 5.1 Layer A data model

```js
// A point that rides on a plate. Cratons are just terranes with craton=true.
Terrane {
  id, plateId,            // plateId can change on accretion — that's the whole point
  kind,                   // 'craton' | 'fragment' | 'arc' | 'plateau' | 'oceanic'
  markers: Float32Array,  // unit-sphere marker positions defining its outline/area
  birthMa, accretedToMa,  // provenance
  area                    // steradians
}

Plate {
  id, parentId,           // GPlates-style rotation tree
  isOceanic,
  rotations: [ { timeMa, poleLat, poleLon, angleDeg } ],   // .rot line, verbatim shape
  terranes: [terraneId]
}

Boundary { plateA, plateB, kind, polarity, bornMa, diedMa }
  // kind: 'divergent' | 'convergent' | 'transform'
  // polarity: which plate subducts (density + age driven)

Event {                    // the thing the whole engine exists to produce
  kind,                    // 'andean' | 'laramide' | 'ural' | 'himalayan'
                           // | 'arc' | 'rift' | 'failedRift' | 'lip' | 'hotspotTrack'
                           // | 'accretion' | 'suture'
  startMa, endMa,
  spine: [markerIds],      // Lagrangian — it deforms and moves with its plate
  intensity, width,        // width distinguishes thin (Ural/Andean) from broad (Laramide/Himalayan)
  plateIds: [...]
}
```

Everything downstream reads **`Event[]` + the rotation tree**, nothing else. That is the
same information set the blog says to keep (§1.7), which is a good sign.

### 5.2 Layer A loop

```
init:
  place N_cratons ≈ 8–12 cratons packed into a supercontinent covering ~25% of the sphere
  assign plates, build rotation tree, seed 3–8 fixed-frame mantle hotspots
  optionally seed a degree-2 mantle pattern to bias where break-up wants to happen

for t = T_start (e.g. -1000 Ma) to 0 step +50 Myr:
  1. advance   — compose finite rotations, move every marker
  2. reclassify boundaries from relative velocity: divergent / convergent / transform
  3. accrete   — any terrane arriving at a convergent boundary is welded to the
                 overriding plate; its plateId is reassigned (rotation tree edit),
                 subduction there dies, and a suture Event is emitted
  4. orogeny   — for each live convergent boundary, emit or extend an Event:
                   ocean→continent  → andean, or laramide when convergence is fast
                                      and the downgoing slab is young/buoyant (flat slab)
                   continent→continent → ural, or himalayan when the collision is
                                      head-on, long-lived, and involves large terranes
                   ocean→ocean      → island arc (a future terrane)
  5. rift      — where divergence starts inside continental crust: split the terrane, give
                 the halves new plate IDs, open ocean between them. Roll some rifts as
                 **failed** and record them; bias rifting toward plume locations and toward
                 old sutures (crust remembers where it was welded)
  6. plumes    — advance hotspots in the fixed frame; append to tracks; on a plume-surfacing
                 roll, emit a LIP and raise local break-up probability
  7. re-roll any plate motion that produced an implausible step (speed clamp 1–10 cm/yr,
     no overlap of continental crust that didn't collide)
  8. snapshot for the scrubber
```

Step 3 is the one nobody else implements and it is what produces believable continents:
real continents are **collages of accreted terranes**, and if the sim tracks that, the
present-day map has visible internal geologic structure instead of uniform blobs.

### 5.3 Layer B — history → heightmap

For each region `r` on the render mesh, accumulate over all events:

```
h(r) = base_isostasy(crustType, crustThickness, crustAge)
     + Σ_events  profile_k(d⊥(r, spine_k), width_k) · intensity_k · decay(age_k, kind_k)
     + hotspot/LIP/arc contributions
     + detail noise gated by craton/basin masks   (v1 already does this well)
```

- `profile_k` is a **cross-strike profile function per orogeny type**, not a symmetric bump:
  - *Andean*: trench → outer-arc ridge → forearc basin → steep volcanic front (the highest
    line) → sharp fall line → gently inclined backarc
  - *Laramide*: same trench/arc, plus discrete basement-cored uplifts scattered far inland
  - *Ural*: narrow double-vergent welt centred on the suture
  - *Himalayan*: high frontal range + broad high plateau behind it + a foreland basin in front
- `decay(age, kind)`: monotone to ~zero by **~450 Myr**, with a floor for **roots** so a later
  event can re-uplift an old belt. Something like
  `relief = exp(-age / τ)` with τ ≈ 120–150 Myr, plus `root = 0.15 · exp(-age / 600)`.
  Calibrate τ so a 450 Myr belt reads as rolling hills, not mountains.
- Overprinting: later events **add** and also locally reset the age clock, which reproduces
  the blurring the blog describes.
- Margin type comes straight out of the history: a coast whose plate has had a convergent
  boundary within the last ~100 Myr is active (trench + steep coast + narrow shelf);
  otherwise passive (wide shelf, sediment wedge, low relief).
- Cratons act as **rigid blockers**: deformation routes *around* them, so an orogen's spine
  should be repelled by craton outlines. This is the single biggest source of organic-looking
  mountain-belt curvature and it falls out of the model for free.
- Then hand off to the existing `terrain-post.js` erosion and the existing climate stack
  untouched.

### 5.4 Scale invariance

Layer A carries no cell-hop quantities at all, so it is scale-invariant by construction.
In Layer B, every profile width, decay distance and smoothing pass must be expressed in km
and converted with `avgEdgeKm = (π × 6371) / √numRegions`, per CLAUDE.md. Orogeny widths are
already in km from §1.4 (50 km Sumatra-style arc → 750 km Bolivian-style belt), which makes
this straightforward.

### 5.5 Performance budget

- Layer A: 20 steps × ~4,000 markers × ~30 plates — sub-100 ms in plain JS. Re-runnable on
  every slider drag.
- Layer B: same cost class as v1's elevation stage, since it is still one pass over the mesh
  with a bounded number of event contributions per region (spatial hash the spines).
- Keeps the "instant, in-browser" strength intact; the history scrubber only re-renders
  Layer A geometry, not a full bake.

---

## 6. UX proposal

1. **History scrubber** — a timeline under the globe; dragging shows the reconstructed world
   at that age with plate outlines, boundaries and active orogenies. This is the feature that
   makes the tool obviously different from everything in §3.
2. **Geologic overlays** matching the blog's three output maps (§1.7): orogenies-by-age,
   LIPs + hotspot tracks, subduction zones + terrane outlines. These also double as the
   debugging views during development.
3. **"Why is this here?"** — click a mountain range, get its provenance: type, the collision
   that made it, when, which terranes. No other generator does this.
4. **Editing, extended not replaced** — keep v1's Ctrl-click multi-select → Rebuild, but let
   the selection act on *history* objects: pin a craton, force a collision, re-roll one
   plate's motion from step *n* forward, mark a rift as failed.
5. **Mobile** — scrubber must be a full-width touch slider with ≥44 px targets; overlays via
   the existing bottom sheet; history re-runs are cheap enough for phones.
6. **Export** — GPlates `.rot` + feature collections, so power users can take the generated
   history into GPlates and continue by hand. Cheap given §2, and a strong hook for exactly
   the audience that reads Worldbuilding Pasta.

---

## 7. Tradeoffs against the seven protected strengths

| Strength | Effect |
|---|---|
| Climate depth | **Preserved.** Layer B hands the same heightmap to the same climate stack. Possible upside: palaeoclimate at any scrubber position. |
| Instant / zero-friction | **Preserved** if Layer A stays coarse. Risk if the history is ever run on the render mesh — don't. |
| Interactive plate editing | **Extended.** Same interaction, richer objects. Needs care: "rebuild from step n" is a heavier operation than v1's rebuild. |
| True globe | **Preserved and reinforced** — finite rotations are inherently spherical. |
| Free / open source | Unaffected. |
| Mobile | Needs explicit design for the scrubber; flagged above. |
| Terrain aesthetics | **The main risk.** Profile-function terrain can read as too regular where v1's noise-driven approach reads organic. Mitigation: keep v1's detail-noise layer and craton/basin gating on top, and jitter spines with the existing simplex field. Judge with `tuning/` metrics + eyeball, not theory. |

---

## 8. Phasing

1. **P0 — Layer A core.** Rotation tree, markers, 50 Myr stepping, boundary classification,
   plain 2D debug render of plate outlines through time. No terrain at all.
2. **P1 — Events.** Orogeny classification into the four types, accretion, rifting, hotspots,
   LIPs. Output the three geologic maps. Still no heightmap. *Validate the history reads as
   plausible before spending anything on terrain.*
3. **P2 — Layer B.** Profile functions, age decay, isostasy → heightmap on the existing mesh;
   hand off to existing erosion + climate.
4. **P3 — UX.** Scrubber, overlays, provenance inspector, mobile pass.
5. **P4 — Editing + export.** History-level editing, `.rot`/GPML export.
6. **P5 — Calibration.** Extend the `tuning/` harness with tectonic metrics (hypsometry,
   orogen width distribution, land fraction, coastline fractal dimension) scored against
   Earth, in the same style as `tuning/climate/evaluate.mjs`.

Per CLAUDE.md, README / tutorial / What's New / SEO / `planet-code.js` updates land with the
phase that introduces the user-facing change, not at the end.

---

## 9. Open questions for the developer

1. **Separate app or a mode of the current one?** Own entry point (`tectonics.html`) reusing
   `js/` modules, or a new top-level generator that supersedes v1? Affects P0 scaffolding.
2. **How much authored vs. rolled?** Does the user pick the starting supercontinent shape and
   craton layout, or is it always seeded? The blog's method is authored; a generator should
   probably roll by default and allow editing.
3. **Is the scrubber a first-class product feature or a dev tool?** It's the strongest
   differentiator but also the biggest UI surface.
4. **Backwards compatibility** — should v2 planet codes decode v1 codes, or is the history
   model a clean break?
5. **How far back?** 1 Gyr (two supercontinent cycles) is the blog's recommendation and gives
   the richest inherited structure, but doubles the step count over 500 Myr.

---

## 10. Sources

- Worldbuilding Pasta — *An Apple Pie From Scratch*, Parts Va, V Supplement, Vb, VIIa, VIIb, VIIc
  (`worldbuildingpasta.blogspot.com`) — **blocked this session, accessed via search extracts**
- GPlates / EarthByte tutorials: rotation file format, plate reconstructions, constructing a
  plate model from scratch; pyGPlates plate-rotation-hierarchy docs
- `halkszavu/Project-Artifexia` — `.rot` editor (plate merge/split/drift correction)
- `davidson16807/tectonics.js` — browser 3D plate tectonics
- Cortial, Peytavie, Galin, Guérin, *Procedural Tectonic Planets*, CGF 38(2) / Eurographics 2019
- `Mindwerks/plate-tectonics` (fork of Viitanen's platec) and `Mindwerks/worldengine`
- `lukabergs/UndiscoveredWorlds`
- Experilous (Andy Gainey), *Procedural Planet Generation*
- `redblobgames/1843-planet-generation` + Blobs in Games, *Map generation on a sphere* 1 & 2
- `weigert/SimpleTectonics`
