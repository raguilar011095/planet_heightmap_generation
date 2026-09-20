# Tectonics v2 — Simulation-First Orogenic History Engine

Status: design. No code yet.
Location: `tectonics/` — a parallel project in this repo. World Orogen v1 keeps running
unchanged at the repo root and keeps its own design tenets.

---

## 0. Premise, and how it differs from v1

v1 generates a plausible-*looking* planet instantly. v2 **simulates** one and lets you watch
it happen. The present-day heightmap is not drawn — it is the state a crust simulation
arrives at after ~1 Gyr of force-driven plate motion.

Concretely: v2 has no "mountain range" primitive. It has crust with mass, thickness and
density floating on a mantle, and mountains are what you get when two pieces of that crust
are driven into each other and conservation of mass has nowhere else to put the material.

### 0.1 Worldbuilding Pasta is the rubric, not the algorithm

The Pasta method (see §2) is an **authoring** method. Its 50 Myr timestep and 10–20 total
steps work because a human draws each frame and re-rolls anything implausible. At 50 Myr a
plate moves ~1,700 km per step — continents would pass through each other before a collision
could resolve. A force-driven simulation needs **1–5 Myr steps**.

So v2 keeps the blog's *taxonomy and validation targets* and discards its mechanics. The
win condition is that the simulation produces these **on its own, unprompted**:

- [ ] Active/passive margin asymmetry on the same continent
- [ ] All four orogeny types (Andean / Laramide / Ural / Himalayan) appearing in the right
      tectonic settings without being placed
- [ ] Orogens older than ~450 Myr eroded to rolling relief, with roots that later events
      can re-uplift
- [ ] Continents that are visibly collages of accreted terranes
- [ ] Hotspot tracks, LIPs, failed rifts, and rifts that preferentially reopen along old sutures
- [ ] A hypsometric curve resembling Earth's (bimodal: continental platform + abyssal plain)

That checklist is the acceptance test for the whole project. If the physics is right, these
are free; if we have to special-case any of them, the physics is wrong somewhere.

### 0.2 Tenets (these differ from the root `CLAUDE.md` on purpose)

Root `CLAUDE.md` says never slow generation to chase physical accuracy, and breaks ties
artistic → usability → plausibility. That is correct for v1's instant-generation product and
**does not apply here**. v2's order:

1. **Physical self-consistency** — prefer one mechanism that produces many landforms over
   many rules that each produce one. If a feature needs a special case, treat that as a bug
   in the model first.
2. **Legibility** — the user must be able to see *why* the world came out this way. The
   history is the product as much as the heightmap is.
3. **Artistic appeal** — still matters, but earned through the simulation rather than applied
   on top of it. Detail noise and stylisation are a final render layer, never load-bearing.

Shared with v1, non-negotiable: runs in a browser, no install, no account, no server, globe-first,
free and open source, works on mobile.

---

## 1. Runtime model

**Budget: 10–60 s per world**, with the globe visibly evolving as it runs. This is a
deliberate break from v1's instant generation — the watching is a feature, not a cost, and
it's a large part of what makes tectonics.js compelling.

- Simulation runs in a **Web Worker**, posting a downsampled snapshot every N steps.
- Main thread renders the evolving globe plus a live boundary/velocity overlay.
- On completion, all snapshots are retained for the **history scrubber**.
- Two-tier (coarse preview + full bake) is a **later** optimisation. Do not build it until
  the simulation is proven at one fidelity — it doubles the pipeline surface.

Rough cost model: ~30–50k crust particles × ~300 steps. The per-step cost is dominated by
re-tessellation; Delaunay on 50k points is ~20–50 ms in JS, so ~300 steps lands at
10–15 s. Incremental/local re-tessellation is the main optimisation lever if that's too slow.

---

## 2. Source material, distilled

Research caveat: this session's egress proxy blocked `worldbuildingpasta.blogspot.com`,
`web.archive.org`, `gplates.org`, `liris.cnrs.fr` and `hal.science`. Blog content below was
reconstructed from search-index extracts plus prior knowledge, **not a full read**. Items
marked `[verified]` were quoted in an extract; `[recalled]` came from memory and must be
re-checked before becoming constants.

### 2.1 What to keep from the blog

- ~**8–12 cratons** `[verified]`; cratons are the tough, ancient invariants that deformation
  routes *around*. In v2 they're not a mask — they're crust with high yield strength.
- Supercontinent ≈ **25% of surface**; >40% and continents can't manoeuvre; >50% and plate
  tectonics locks up `[verified]`. Hard clamp on any land-fraction control.
- **Four orogeny types** on cause × width: Andean (thin/subduction), Laramide
  (broad/subduction, flat-slab `[recalled]`), Ural (thin/collision), Himalayan
  (broad/collision). Spectrum, not categories. `[verified]`
- Calibration dimensions: Andes **200 km (N Peru) – 750 km (Bolivia)** wide, up to **13 km
  trench-to-Altiplano relief**; Sumatra arc ridge **~50 km across, >3 km high** `[verified]`.
- **>450 Myr → eroded flat, roots survive and can be re-uplifted** `[verified]`.
- Active margin (leading edge): trench, volcanic orogeny, steep coast. Passive (trailing):
  wide shelf, low relief, sediment wedge. `[verified]`
- Plate speeds ~1–10 cm/yr; a worked example uses **3.4 cm/yr** `[verified]`.
- Output maps worth keeping: orogenies-by-age + cratons + failed rifts; LIPs-by-age +
  hotspots + tracks; subduction zones + terrane outlines `[verified]`.
- Terrain targets: peaks to ~9,000 m but **7–8,000 m is plenty at global raster
  resolution** `[verified]`.

In v2 all of these become **expected outputs**, not inputs — except the craton count and the
land fraction, which are genuine initial conditions.

### 2.2 GPlates — what to borrow structurally

- Rotation file line: `movingPlateID, timeMa, poleLat, poleLon, angleDeg, fixedPlateID`
  `[verified]`, with rotations relative to a **parent plate**, forming a tree rooted at an
  anchored plate; the tree can rewire between times `[verified]`.
- Even though v2 *derives* rotations rather than authoring them, storing them in this shape
  makes `.rot` + GPML **export** nearly free — a strong hook for the exact audience that
  reads Pasta and already uses GPlates.
- The existence of `Project-Artifexia` (a dedicated `.rot` editor handling plate merge at a
  timestamp, splitting co-moving plates, drift correction) `[verified]` is the tell that
  **plate merge/split over time is the hard part of the data model**. Design for it on day one.

---

## 3. Prior art — what v2 takes from each

| Project | Relationship to v2 |
|---|---|
| **Tectonics.js** (Davidson) | Closest existing thing. Per-cell crust with thickness/density/age, real isostasy, browser-native. v2's crust model is essentially this. Differs in that v2 records a **history** and derives plate motion from **forces**, where tectonics.js is open-ended and hard to art-direct. |
| **Procedural Tectonic Planets** (Cortial et al., EG 2019) | Deliberately the *opposite* trade from v2 — procedural approximation for controllability. Worth re-fetching for its uplift formulations, but v2 is choosing the simulation side of that fork. |
| **platec** (Viitanen) / WorldEngine | Minimum viable collision/subduction rule set and crust-as-mass bookkeeping. 2D flat map, so the model transfers but the geometry doesn't. |
| **SimpleTectonics** (weigert) | Clustered-convection plate *emergence* rather than hand-seeded plates. Relevant if v2 ever wants plates to be born from convection (§9, out of scope for now). |
| **Undiscovered Worlds** (lukabergs) | The discipline of explicit, independently inspectable pipeline passes. |
| **Experilous** (Gainey), **Red Blob 1843** | Per-plate drift+spin parameterisation and sphere-graph mechanics; both stop at boundary-assigned elevation with no history. |
| **World Orogen v1** (this repo) | Supplies the mesh, worker pipeline, erosion, climate stack and render layer (§7). |

The gap: **nobody has shipped a browser tool where you watch a tectonic history simulate and
the mountains you end up with are explained by it.** Tectonics.js simulates but doesn't
narrate; Pasta narrates but takes weeks by hand; everyone else skips history.

---

## 4. The physics stack

Ordered by realism-per-unit-effort. Each layer is independently testable and each one
retires a pile of special cases.

### 4.1 Crust columns + Airy isostasy — *the* foundational change

State per particle:

```js
CrustParticle {
  pos: [x,y,z],        // unit sphere, advected each step
  plateId,
  type,                // CONTINENTAL | OCEANIC
  thickness,           // km  — the conserved quantity
  density,             // kg/m³
  ageMa,               // time since formation (oceanic) or last major thermal event
  orogenAge,           // time since last significant thickening — drives erosion decay
  strength             // yield strength; cratons high, young arcs low
}
```

Elevation is **computed, never assigned**:

```
elevation = thickness · (1 − ρ_crust / ρ_mantle) − referenceOffset
```

Constants `[verified]`: ρ_mantle ≈ **3300 kg/m³**, ρ_continental ≈ **2750 kg/m³**
(the commonly quoted figure; 2700–2850 is the defensible range), ρ_oceanic ≈ 2900 kg/m³.
Reference thicknesses: continental ≈ **35 km**, thickened collisional crust (Tibet-like)
≈ **70 km** `[verified]`, oceanic ≈ 7 km. `referenceOffset` is calibrated so that 35 km
continental crust sits just above sea level.

This one equation delivers: continents floating high, ocean basins low, mountains **with
deep roots** wherever crust thickened, basins wherever it thinned, and correct rebound as
erosion removes mass. It retires the entire per-orogeny-type "uplift profile function"
layer from the earlier draft.

### 4.2 Oceanic age → depth

Oceanic crust depth follows half-space cooling, which is **only valid to ~80 Myr**
`[verified]` — past that, real seafloor is significantly shallower than √t predicts and
needs the flattening (plate-model) branch. Use a two-branch fit:

```
d(t) = 2500 + 350·√t                      for t < ~70–80 Myr     (Parsons & Sclater)
d(t) = 6400 − 3200·exp(−t / 62.8)         beyond                  (plate model)
```
(GDH1 / Stein & Stein is the modern alternative: `2600 + 365·√t`, crossing over at ~20 Myr.
Pick one, put it in config, and note which.)

Free consequences: mid-ocean ridges (young crust rides high), abyssal plains, ridge-flank
asymmetry around spreading centres, and ocean basins that deepen believably with age.
Enormous realism for one function.

### 4.3 Force-balance plate motion

Plate motion stops being rolled and becomes a consequence. Per plate, accumulate torques:

```
τ_slabPull  = Σ over subducting boundary segments:  k_sp · length · f(slabAge) · r̂ × n̂
τ_ridgePush = Σ over divergent boundary segments:   k_rp · length · r̂ × n̂
τ_drag      = −k_drag · Σ over particles: area · v(particle)      (continental keels drag more)
τ_collision = resistance at convergent continental boundaries
```

Then solve the 3-DOF least-squares for the Euler rotation (pole + ω) that zeroes net torque.
Cheap: a 3×3 solve per plate per step.

Magnitudes `[verified]`: ridge push ≈ **2–3 TN/m** along strike; slab pull **>10 TN/m** —
so slab pull is roughly **3–5× ridge push per unit length** and dominates the budget. Slab
pull scales with slab age (older = colder = denser = stronger pull), which is what makes the
system self-organising: a plate with a long, old subducting margin accelerates; a continent
arriving at a trench jams it and forces collision; losing a slab causes a plate
reorganisation. None of that has to be scripted.

**This is the highest-risk component.** Force balance can lock up, oscillate, or wander into
degenerate configurations. Mitigations, build them in from the start: velocity clamp to the
observed 1–10 cm/yr band, angular-velocity damping between steps, and a diagnostic overlay
showing per-plate torque contributions before anything depends on the output.

### 4.4 Boundary evolution via re-tessellation

The genuinely hard part, and where most implementations get stuck. Approach:

1. Advect every particle by its plate's finite rotation for the step.
2. Re-tessellate (Delaunay on the sphere — the repo already has `sphere-mesh.js` /
   Delaunator plumbing).
3. Classify each inter-plate edge by relative velocity → divergent / convergent / transform.
4. **Divergent**: gaps open. Insert new particles with `type = OCEANIC`, `age = 0`,
   thickness 7 km — seafloor spreading falls out of gap-filling.
5. **Convergent**: particles overlap. Resolve per §4.5.
6. **Transform**: no mass change; accumulate shear for later fault expression.

Particle-based-with-re-tessellation beats polygon-resampling because it handles topology
changes (plate splitting, terrane accretion, ridge subduction) without special cases.

### 4.5 Mass-conserving convergence

| Case | Resolution |
|---|---|
| Oceanic + continental | Oceanic particle subducts → **deleted** (mass leaves the system). Overriding plate gains arc volcanism: thickness added in a band offset inland from the trench by a slab-dip-derived distance. Produces Andean margins. Shallow slab dip (young/buoyant slab, fast convergence) pushes the band far inland → **Laramide**. |
| Oceanic + oceanic | Denser/older plate subducts; overriding plate grows an **island arc** — new continental-ish crust, and a future accreted terrane. |
| Continental + continental | Neither subducts. **Thicken**: conserve mass as area shrinks, so thickness and root grow together. Isostasy then lifts it. Narrow, fast suturing → **Ural**; broad, long-lived, large-terrane → **Himalayan** plateau. |
| Arc/plateau/microcontinent arriving at a trench | **Accretion**: buoyant crust jams the subduction zone, particles are reassigned to the overriding plate, the boundary dies, a suture is recorded, and subduction often flips polarity outboard. |

Orogeny *type* is therefore **classified after the fact** from geometry and history, not
chosen in advance. That's the inversion from the earlier draft.

### 4.6 Erosion / uplift coupling

Orogen height is a balance of uplift and erosion rate, not a decay curve. Stream-power-ish:
`erosion ∝ precipitation^m · slope^n`, with eroded mass **deposited** in adjacent lows
(foreland basins, passive-margin wedges) and isostatic rebound applied as mass leaves.

Payoffs: the ~450 Myr flattening horizon *emerges*; wet orogens end up lower than dry ones;
foreland basins appear without being placed. If v1's climate stack is wired in even crudely
during the run (§7), this is a real tectonics–climate coupling — genuinely novel in this space.

### 4.7 Plumes, hotspots, LIPs

Fixed-frame hotspots in the mantle reference frame; plates drift over them leaving **tracks**
whose geometry directly records absolute plate motion. Plume surfacing emits a LIP (thick
basalt pile, isostatically high) and raises local break-up probability. Rifting preferentially
reopens **old sutures** — crust remembers where it was welded — and some rifts fail,
becoming aulacogens that steer later drainage.

---

## 5. Data model

```js
Plate {
  id, parentId,              // GPlates-style rotation tree (export-ready)
  rotations: [{ timeMa, poleLat, poleLon, angleDeg }],   // DERIVED per step, not authored
  particleIds: [...],
  torqueDiagnostics          // per-force contributions, for the debug overlay
}

Terrane {                    // provenance grouping over particles
  id, kind,                  // 'craton' | 'arc' | 'plateau' | 'fragment'
  birthMa, accretedToMa, accretedToPlate
}

// Events are RECORDS, derived from what the simulation did. They drive the
// "why is this here" inspector and the geologic overlays — they do NOT generate terrain.
Event {
  kind,                      // 'orogeny' | 'accretion' | 'rift' | 'failedRift'
                             // | 'lip' | 'arc' | 'subductionInitiation' | 'reorganisation'
  subtype,                   // for orogeny: andean | laramide | ural | himalayan
  startMa, endMa,
  particleIds, plateIds,
  peakThickness, peakElevation
}
```

Terrain is read straight off the particle field via §4.1 — there is no separate synthesis step.

---

## 6. Simulation loop

```
init:
  seed ~8–12 cratons packed into a supercontinent covering ~25% of the sphere
  fill the rest with oceanic crust, ages ramped from seed ridges
  partition into plates; seed 3–8 fixed-frame hotspots
  optional degree-2 mantle pattern biasing where break-up wants to start

for t = −1000 Ma to 0, step Δt = 1–5 Myr:        # ~200–1000 steps
   1. forces      — accumulate torques per plate (§4.3), solve for Euler rotation,
                    clamp to 1–10 cm/yr, damp against the previous step
   2. advect      — rotate every particle by its plate's finite rotation
   3. tessellate  — re-triangulate, classify inter-plate edges (§4.4)
   4. create      — fill divergent gaps with new oceanic crust, age 0
   5. converge    — subduct / thicken / accrete per §4.5; conserve mass
   6. age         — increment ages; apply age→depth for oceanic crust (§4.2)
   7. erode       — uplift/erosion balance, deposit, isostatic rebound (§4.6)
   8. plumes      — advance hotspots, extend tracks, roll LIPs and rift nucleation (§4.7)
   9. topology    — split plates at mature rifts, merge on full suturing,
                    initiate subduction at weak points (old sutures, loaded passive margins)
  10. record      — append Events; snapshot for the scrubber every N steps
```

Step 9 is where the rotation tree rewires, and per §2.2 it's the part most likely to be
fiddly. Get it right early.

---

## 7. What v2 reuses from v1

Reuse as-is: `sphere-mesh.js` (spherical Delaunay), `planet-mesh.js` render layer,
`scene.js` globe + camera, the Web Worker harness pattern in `generate.js` /
`planet-worker.js`, `terrain-post.js` erosion (as a final detail pass over the simulated
field, not as the load-bearing erosion), the entire climate stack
(`wind.js`, `temperature.js`, `precipitation.js`, `koppen.js`, `ocean.js`), and the
`tuning/` harness pattern for calibration.

Not reused: `plates.js`, `plate-physics.js`, `super-plates.js`, `coarse-plates.js`, and the
tectonic half of `elevation.js`. v1's `r_t_craton = max(0, 1 − tecActivity · MULT) · (1 − basin)`
defines cratons as "wherever nothing is happening now" — the inverse of the real definition,
where cratons are ancient causes that constrain where deformation can go. v2 fixes this by
making cratons actual high-strength crust.

Scale invariance: v2's particle field is resolution-independent by construction. Only the
final rasterisation onto the render mesh needs the `avgEdgeKm = (π × 6371) / √numRegions`
discipline from the root `CLAUDE.md`.

---

## 8. UX

1. **Watch it run** — evolving globe with live plate boundaries and velocity arrows.
2. **History scrubber** — drag through the simulated past; the reconstruction is exact
   because it's a replay, not a re-derivation.
3. **Geologic overlays** — the blog's three output maps (§2.1), which double as the primary
   development debugging views. Build these *first*.
4. **Provenance inspector** — click a range: type, the collision that made it, when, which
   terranes, peak thickness. Nothing else in this space does this.
5. **Force diagnostics** — per-plate torque breakdown. A dev tool that's interesting enough
   to ship.
6. **Export** — `.rot` + feature collections for GPlates, plus heightmap raster.
7. **Mobile** — scrubber as a full-width touch slider, ≥44 px targets. Simulation runtime on
   phones needs measuring early; a reduced particle count may be necessary.

---

## 9. Phasing

Each phase must be independently validatable. Do not start the next until the current one's
debug view looks right.

- **P0 — Crust + isostasy, no motion.** Particle field, Airy elevation, oceanic age→depth.
  Static world, correct hypsometry. Proves §4.1–4.2.
- **P1 — Motion.** Advection, re-tessellation, boundary classification, divergent gap-filling.
  Plates move, seafloor spreads, nothing collides yet. Proves §4.4.
- **P2 — Forces.** Torque solver replacing prescribed rotations. Debug overlay first.
  Highest-risk phase; expect stabilisation work. Proves §4.3.
- **P3 — Convergence.** Subduction, thickening, accretion, mass conservation. Mountains
  appear. Proves §4.5 — and the §0.1 checklist starts being testable.
- **P4 — Erosion coupling + plumes.** §4.6–4.7. The 450 Myr horizon should emerge here.
- **P5 — Event records + overlays + scrubber.** The legibility layer.
- **P6 — Render + climate handoff.** Rasterise to the v1 mesh, run the existing climate stack.
- **P7 — Calibration.** Extend `tuning/` with tectonic metrics: hypsometric curve vs Earth,
  orogen width distribution, land fraction stability, coastline fractal dimension,
  continental-crust age distribution. Same shape as `tuning/climate/evaluate.mjs`.

---

## 10. Open risks

1. **Force balance instability** (§4.3) — the likeliest thing to sink the project. Mitigate
   with clamps, damping, and an early diagnostic view. Fallback: prescribed rotations with
   forces as a perturbation.
2. **Re-tessellation cost** — 300 × full spherical Delaunay may exceed the 60 s budget.
   Lever: incremental/local retriangulation.
3. **Numerical crust drift** — mass must be conserved to a stated tolerance or continents
   slowly inflate or evaporate over 1,000 steps. Add a conservation assertion to the test
   suite from P0.
4. **Aesthetic regression vs v1** — simulated terrain may read flatter or more regular than
   v1's noise-driven output. Mitigation is a final detail pass (`terrain-post.js`) that is
   explicitly cosmetic and never load-bearing. Judge by eye and by `tuning/` metrics.
5. **Mobile runtime** — measure on a real phone at P1, not at P7.

---

## 11. Sources

- Worldbuilding Pasta, *An Apple Pie From Scratch* Parts Va, V Supplement, Vb, VIIa, VIIb, VIIc
  — **blocked this session; accessed via search extracts, needs a verification pass**
- Parsons & Sclater (1977) age–depth relation; Stein & Stein (1992) GDH1; half-space cooling
  validity limit ~80 Myr
- Airy isostasy; crustal/mantle density and thickness references
- Plate driving-force budget: ridge push 2–3 TN/m, slab pull >10 TN/m along strike
- GPlates / EarthByte rotation-file and plate-reconstruction tutorials; pyGPlates rotation hierarchy
- `davidson16807/tectonics.js`; `Mindwerks/plate-tectonics` (platec); `weigert/SimpleTectonics`;
  `lukabergs/UndiscoveredWorlds`; `redblobgames/1843-planet-generation`;
  `halkszavu/Project-Artifexia`
- Cortial, Peytavie, Galin, Guérin, *Procedural Tectonic Planets*, CGF 38(2) / Eurographics 2019
