# Tectonics v2 — Automated Plate-History Engine

Status: design, revision 3 (post adversarial review). No code yet.
Location: `tectonics/` — a parallel project in this repo. World Orogen v1 keeps running
unchanged at the repo root with its own tenets.

This document covers *what* is simulated. Its companion **`ARCHITECTURE.md`** covers *how the
code is organised* — pass contract, field registry, dependency rules, debugging, testing.
Both are binding.

---

## 0. Premise

**v2 is Worldbuilding Pasta's plate-history method, automated.** The blog describes a human
sitting in GPlates for weeks: placing cratons in a supercontinent, choosing Euler rotations,
adding subduction zones offshore of leading edges, recording orogenies, rerolling anything
implausible. v2 replaces the human with a **policy** that makes the same kinds of decisions
using the same rules of thumb, and replaces GPlates with a **kinematic simulation** that
tracks what those decisions do to the crust.

Two things follow from taking that seriously:

1. **It is kinematic, not dynamic.** GPlates never computes a force. Plates are rigid bodies
   with Euler rotations; the "physics" is rules of thumb applied at each step. v2 does the
   same. There is no torque solver. Slab pull, ridge push and the rest appear only as
   *heuristics inside the motion policy*, the way they appear in the blog author's head.
2. **Authored-style rules are legitimate.** Because we are automating an authoring method,
   a rule like "add subduction just offshore of a moving continent's leading edge" is not a
   cheat — it *is* the method. The earlier revision's tenet that every rule must be
   physically emergent was wrong for this project and produced an unbuildable design.

The line to hold: stay as close to the blog and GPlates as is reasonable, and change only
what automation requires. Where v2 departs from the blog (§2.3), it says so and why.

### 0.1 Tenets (these differ from the root `CLAUDE.md` on purpose)

1. **Fidelity to the method** — the blog's rules and GPlates' data model are the reference.
   Depart only for automation, and document each departure.
2. **Component isolation** — every behaviour is an independently understandable, testable,
   toggleable unit. See `ARCHITECTURE.md`. Hard structural requirement.
3. **Legibility** — the user can see *why* the world came out this way. The history is the
   product as much as the heightmap is.
4. **Artistic appeal** — matters, and is *art-directable* precisely because the orogeny
   rules are rules: the width and magnitude of thickening per event type are designed values
   with ranges, not emergent accidents.

Shared with v1, non-negotiable: browser, no install, no account, no server, globe-first, free
and open source. Mobile: runs at reduced resolution (§8).

---

## 1. Representation

### 1.1 A fixed cell grid, not particles and not polygons

The simulation runs on a **fixed Fibonacci sphere mesh** (the repo's `sphere-mesh.js`,
jitter 0) at a coarse resolution independent of render detail — default **~80k cells
(~80 km spacing)**, 20k on mobile, up to 160k on desktop. Each cell carries crust attributes.
Plates are *labels* on cells, not geometry.

Why not the alternatives:

- **Spherical polygons with boolean ops** (what GPlates literally stores) — robust spherical
  clipping with no dependencies is a large, risky project on its own, and it is the reason
  GPlates is hard to use. Cells give the same information without the geometry problem.
- **Particles with re-tessellation** (revision 2) — the adversarial review found the mass
  model unspecified, the per-step Delaunay cost budget-breaking, and stable IDs missing.
  A fixed grid removes all three: cell index *is* the stable ID, nothing is ever
  re-tessellated, and mass is fixed-area × thickness.

This is the representation every working browser tectonics simulation actually uses
(platec in 2D, tectonics.js in 3D). It is unglamorous and it works.

### 1.2 Cell state

```
crust.plateId      Int32     which rigid plate this cell currently rides on
crust.terraneId    Int32     provenance grouping (craton, arc, fragment…); survives accretion
crust.type         Uint8     CONTINENTAL | OCEANIC | NONE (transient, during scatter)
crust.thickness    Float32   km — the conserved mass quantity (area is fixed per cell)
crust.ageMa        Float32   time since formation (oceanic) or last thermal reset
crust.isCraton     Uint8     the blog's "rarely broken or deformed" flag
crust.orogenAge    Float32   time since last thickening event; drives erosion state
crust.sediment     Float32   km; deposited material (passive margins, forelands)
```

Elevation is **derived** from this state (§4), never stored as the primary field.

### 1.3 Plates, terranes, rotations — the GPlates model

```
Plate {
  id,
  rotation: { poleLat, poleLon, degPerMyr }     // current Euler rotation, held constant
                                                //   across a policy interval (§2.1)
  history: [{ fromMa, toMa, poleLat, poleLon, angleDeg }]   // .rot lines, fixed plate 000
}
Terrane { id, kind, birthMa, accretedMa, accretedToPlate }
```

**Departure from GPlates:** rotations are stored **absolute** (relative to the mantle
frame, GPlates' plate 000) rather than as a parent-relative tree. A tree exists in GPlates
because humans author relative motions; the policy authors absolute ones, and hotspot tracks
need the absolute frame anyway. Export writes every plate against 000, which GPlates reads
directly. The *terrane* hierarchy (an accreted arc rides its host plate) is preserved by
`plateId` reassignment, which is what the tree was for.

---

## 2. Time

Two cadences, matching how the blog actually works.

### 2.1 Policy steps: 50 Myr — the blog's cadence, kept

Every 50 Myr the **policy** runs: the automated stand-in for the human. It decides rotations,
initiates or kills subduction, opens rifts, marks failed rifts, rolls plumes. Between policy
steps, rotations are held constant. A 1 Gyr run has **20 policy steps**, exactly the blog's
10–20. `[verified: 50 Myr steps; 500 Myr–1 Gyr total]`

These are also the **chapters** of the history: the scrubber, the event log and the
overlays aggregate to policy steps, so a run reads as ~20 legible frames rather than
hundreds of noisy ones. This is the blog's own granularity, and it was chosen for legibility.

### 2.2 Kinematic substeps: 5 Myr

Geometry advances in **5 Myr substeps** (10 per policy step, 200 per Gyr). At 5 cm/yr a
substep moves crust 250 km ≈ 3 cells, which forward-scatter advection (§3) handles without
a CFL-style limit — it is a rigid transform plus nearest-cell write, not a PDE. Substeps
exist so that collisions resolve progressively over a few frames instead of teleporting.

### 2.3 Departures from the blog's mechanics, and why

| Blog | v2 | Why |
|---|---|---|
| Human chooses each rotation | Policy chooses, with plausibility rerolling (§5) | Automation |
| One 50 Myr geometric jump per step | 10 × 5 Myr substeps per policy step | Collisions must resolve, not teleport |
| Polygons drawn by hand in GPlates | Cell labels on a fixed grid (§1.1) | No robust spherical boolean ops needed |
| Orogeny drawn as a polygon, coloured by age | Orogeny *thickens crust* in a belt; elevation derived (§4) | Lets erosion, roots and rebound follow from one mechanism |
| Terrain constructed manually afterwards (Part VIIc) | Terrain derived continuously from crust state | Automation; also gives the scrubber real terrain at every chapter |

Everything else — cratons, supercontinent start, ~25 % land, subduction offshore of leading
edges added every other step, the four orogeny types, active/passive margins, terranes,
hotspots, LIPs, failed rifts, the three output maps — is kept as-is.

---

## 3. Kinematics: forward-scatter advection

Per substep, for each plate, for each cell on that plate:

1. Rotate the cell's position by the plate's finite rotation for 5 Myr.
2. Find the nearest grid cell to the new position (Fibonacci sphere has a cheap inverse).
3. Write the cell's crust attributes to that destination cell.

Then classify every destination cell by how many sources landed on it:

| Sources | Meaning | Resolution |
|---|---|---|
| 0 | **Divergence** — a gap opened | Fill with new oceanic crust: `type = OCEANIC, age = 0, thickness = 7 km`, plateId from the nearest neighbour on the spreading side. This *is* seafloor spreading. |
| 1 | Normal advection | Copy. |
| ≥ 2 | **Convergence** — overlap | Resolve per §3.1, conserving `thickness × area`. |

Transform boundaries produce neither gaps nor overlaps along strike and need no mass
handling; they are detected from relative velocity for the boundary map only.

This is platec's algorithm on a sphere. A full pass over 80k cells is ~1–3 ms in plain JS;
200 substeps ≈ **under a second** of advection for the whole history. The runtime budget
(§8) is spent on elevation, erosion and rendering, not on moving plates.

### 3.1 Convergence resolution

Applied per overlapping cell, in this order:

| Case | Rule (the blog's rule, stated per cell) |
|---|---|
| Oceanic + anything | The oceanic cell **subducts**: its mass is removed. If the other cell is continental, its plate is the overriding plate; the trench is recorded at the boundary and arc thickening is applied on the overriding side per §5.4. If both oceanic, the **older** (denser) one subducts and an **island arc** forms on the other — new continental-type crust, flagged as a terrane. |
| Continental + continental, neither craton | Neither subducts. **Thicken**: destination thickness = sum of sources (mass conserved). Suture recorded. Collision orogeny begins (§5.4). |
| Continental + continental, one is craton | Craton cell keeps its thickness; **all excess mass goes to the non-craton cell** and is spread into the non-craton side over the next substeps. This is the blog's "cratons are rarely deformed" as a rule, and it is what makes belts wrap around cratons. |
| Arc / fragment / microcontinent meets a trench | **Accretion**: buoyant crust does not subduct. Cells are reassigned to the overriding plate (`plateId` changes; `terraneId` is kept as provenance), the trench segment dies, a suture is recorded, and the policy may initiate a new trench outboard (§5.3). |

Craton handling is a hard rule rather than a rheology. Revision 2 claimed routing-around
would emerge from a `strength` field that nothing used; this is the honest replacement.

---

## 4. Crust state → elevation

Elevation is recomputed from cell state at every policy step (and optionally each substep
for the live view). Four cheap passes:

1. **Airy isostasy.** `e = thickness · (1 − ρ_crust/ρ_mantle) − offset`, with
   ρ_mantle 3300, ρ_continental ~2750, ρ_oceanic ~2900 kg/m³ `[verified]`; offset calibrated so
   35 km continental crust sits just above sea level. Thickened crust rises *with roots*.
2. **Flexure.** Airy alone gives spiky local uplift and **no foreland basins** — those are
   flexural, from the plate bending under the load. Apply an elastic-plate response as a
   smoothing kernel with ~150–250 km wavelength (effective elastic thickness 20–40 km). This
   is the correction the adversarial review demanded; it is one filter pass and it produces
   forelands, moats around loads, and believable range shoulders.
3. **Oceanic age → depth.** Half-space cooling `2500 + 350·√t` m to ~75 Myr, plate-model
   flattening beyond (`6400 − 3200·exp(−t/62.8)`), since √t over-predicts depth past
   ~80 Myr `[verified]`. Ridges, abyssal plains and ridge-flank asymmetry for free.
4. **Sediment.** Passive-margin wedges and foreland fill from §6.

### 4.1 Orogeny as thickening — the blog's four types, as rules

An orogeny **adds thickness in a belt** alongside the boundary. Type is chosen by the blog's
two axes and expressed as belt geometry — these are *designed* values with ranges, and are
the main artistic controls in the project:

| Type | Setting | Belt width (km) | Peak added thickness | Notes |
|---|---|---|---|---|
| **Andean** | ocean → continent, normal dip | 150–300 | +15–20 km at the volcanic front | Front offset ~150 km inland from trench; forearc between. Calibrate: Andes 200–750 km wide `[verified]`, Sumatra arc ~50 km / >3 km `[verified]`. |
| **Laramide** | ocean → continent, shallow dip | 400–750 | +8–12 km, spread inland | Trigger: young subducting crust (< ~30 Myr) *or* an oceanic plateau entering the trench — both real associations, and stated as a rule, not physics. |
| **Ural** | continent–continent, fast/oblique/short | 100–250 | +15–20 km, narrow | Suture-centred. |
| **Himalayan** | continent–continent, head-on, long-lived, large terranes | 400–800 | +25–35 km with plateau | Frontal range + plateau + flexural foreland. Total crust ≈ 70 km `[verified]`. |

Thickening accrues per substep while the boundary stays convergent, so a long collision
builds a broad belt and a brief one a thin belt — the blog's "spectrum, not categories"
falls out of duration.

---

## 5. The policy: the automated human

Runs every 50 Myr. Each decision below is a separate pass (see `ARCHITECTURE.md`) with its
own parameters and RNG, so any of them can be disabled or replaced.

### 5.1 Initial condition (t = −1000 Ma)

- **8–12 cratons** `[verified]` placed inside one supercontinent covering **~25 % of the
  sphere** `[verified]` (clamped: >40 % cramped, >50 % locks up `[verified]`). Cratons are
  thick (40–45 km), old, `isCraton = 1`; inter-craton continental crust ~35 km.
- Oceanic crust elsewhere with ages ramped from 2–4 seed ridges, so the initial ocean has
  ridges, flanks and old abyssal plain rather than a uniform slab.
- **Subduction zones around the supercontinent margin** where the ocean is oldest — a
  supercontinent that has assembled *has* subduction around it; that is how it assembled.
  This is an authored initial condition and is stated as such. (Revision 2 omitted it and
  would have started with nothing moving.)
- 3–8 fixed-frame hotspots; a degree-2 mantle pattern biasing where break-up wants to start
  `[recalled — the blog discusses degree-1→2 transition at late supercontinent stage]`.

### 5.2 Rotation policy

For each plate, propose an Euler rotation and accept it only if plausible — the blog's
"if motion looks unrealistic, reroll" as code:

- **Direction heuristics**: away from its ridges, toward its trenches (slab pull as a
  heuristic), with persistence — 70–90 % of the previous interval's rotation blended in,
  because real plates do not change course every 50 Myr.
- **Speed heuristics**: base 1–10 cm/yr `[verified band]`; scale up with the fraction of the
  plate's boundary that is subducting and with slab age; scale down for large continental
  area (the blog's continental drag); drop sharply once a continent is in collision.
- **Reject and reroll** if: speed leaves the 1–10 band; two continents would overlap without
  an intervening convergent boundary; net rotation of the whole lithosphere exceeds a small
  bound. Up to N rerolls, then take the least-bad.

### 5.3 Subduction initiation and death

- **Initiate** offshore of the **leading edge of a moving continent**, roughly **every
  other policy step** `[verified]`, preferring old oceanic crust (> ~50 Myr) and old passive
  margins. Also initiate outboard of a newly accreted terrane (subduction jump) with some
  probability.
- **Kill** a trench when a continent or buoyant terrane arrives (accretion, §3.1) or when
  its slab is exhausted (the subducting plate has no oceanic cells left on that side).

### 5.4 Orogeny bookkeeping

Each substep, along each convergent boundary segment, apply thickening per §4.1 and extend
or open an `Event`. Type is decided once when the event opens, from the §4.1 triggers, and
re-evaluated only on a category change (e.g. an Andean margin becoming Himalayan when the
ocean closes and continents meet).

### 5.5 Rifting

At policy steps, propose rift lines through continental crust, biased toward: hotspot/LIP
sites, **old sutures** (crust remembers where it was welded), and the mantle pattern.
Assign the two sides divergent rotations. With probability p, mark the rift **failed** —
record it, stop divergence, leave a thinned-crust scar (a real aulacogen; steers later
rivers and break-up). The supercontinent break-up is the first and largest instance.

### 5.6 Plumes, hotspots, LIPs

Hotspots are fixed in the mantle frame; crust drifting over them gets a small volcanic
thickness add, leaving a **track** that records absolute plate motion. On a plume-surfacing
roll, emit a **LIP** — a broad, thick, isostatically high basalt pile — and raise rift
probability nearby. The blog's relationship (LIPs near plume clusters, preceding or
following major rifting `[verified]`) is the rule.

---

## 6. Erosion and ageing

The blog's rule is that an orogen over ~450 Myr is eroded essentially flat with roots that
later events can re-uplift `[verified]`. In v2 this is a **tuned** outcome, and the doc says
so plainly (revision 2 called it emergent; it is not):

- Per policy step: thickness removed ∝ elevation above a base level (an erosion-rate
  parameter tuned so a Himalayan-scale belt reads as hills by ~450 Myr), with **isostatic
  rebound** as mass leaves, so roots persist longer than peaks.
- Removed mass is **deposited** in flexural lows (forelands) and at passive margins as
  `sediment`, which is where the blog's wide trailing-edge shelves come from.
- Hillslope-style diffusion for smoothness. **No fluvial erosion in-sim**: drainage routing
  over the coarse grid every step is expensive and the fine-scale result is thrown away
  at render time anyway. v1's `terrain-post.js` runs *once* on the rasterised final state.
- Tectonics–climate coupling (wet orogens lower) is **out of scope for v2.0**. Revision 2
  oversold it.

---

## 7. Events, overlays, provenance

Events are records, opened and extended by the passes above, aggregated per policy step:

```
Event { kind, subtype, startMa, endMa, cellIds, plateIds, terraneIds, peakThickness }
  kind: orogeny | accretion | rift | failedRift | lip | arc | subductionInit | subductionDeath
```

They drive the blog's three output maps `[verified]` as overlays — orogenies by age +
cratons + failed rifts; LIPs by age + hotspots + tracks; trenches + terrane outlines — and a
click-on-a-range provenance inspector. They do not generate terrain; §4 does.

---

## 8. Runtime and platforms

- Advection: < 1 s per Gyr (§3). Elevation + flexure + erosion at 20 policy steps: a few
  seconds. Live view at substep granularity costs more; make it optional.
- **Target: 3–10 s per world on desktop at 80k cells, with the globe visibly evolving.**
  Reduced-mobile: 20k cells, target < 3 s. The blog's 20-frame cadence keeps the
  watching legible even at these speeds.
- Scrubber memory: snapshot the eight cell fields at each of 20 policy steps —
  80k × 8 × 4 B × 20 ≈ **50 MB** desktop, ~13 MB at 20k. Acceptable; no delta encoding needed.
- Runs in a Web Worker; headless core per `ARCHITECTURE.md`.

---

## 9. Validation — honest version

The revision-2 checklist was mostly unfalsifiable (the sim classifies its own orogenies).
Split it:

**Quantitative, automated** (extend `tuning/` in the `evaluate.mjs` style):
- Hypsometric curve vs Earth (bimodal; continental platform + abyssal plain).
- Land fraction stays within 20–35 % over the run.
- Plate speeds within 1–10 cm/yr; RMS ~4–5.
- Mass conservation of continental crust within tolerance across 200 substeps.
- Orogen belt widths and peak thicknesses within the §4.1 ranges for their declared type.

**Qualitative, by design** — expected because rules produce them; useful as smoke tests:
- Active/passive asymmetry on moving continents; terrane-collage continents; hotspot
  tracks; failed rifts reopening later.

**Blind** — the only real realism test: a set of final tectonic maps, sim vs simplified
Earth, judged by someone who knows geology without being told which is which.

---

## 10. Phasing

Reordered so that **mountains appear before any risky component exists**, answering the
aesthetic question first.

- **P−1 — Harness.** Pass contract, field registry, scheduler, dev guard, dependency
  checker, tests. See `ARCHITECTURE.md` §8.
- **P0 — Static crust.** Cell state, isostasy, flexure, age→depth on an authored initial
  condition. Correct hypsometry with nothing moving.
- **P1 — Motion + collision, prescribed rotations.** Scatter advection, gap-filling,
  convergence resolution, orogeny thickening — with hand-set rotations. **The first
  mountains.** If they don't look good here, stop and fix §4 before building the policy.
- **P2 — Policy.** Initial condition generator, rotation policy with rerolling, subduction
  initiation/death, rifting, plumes. Full automated 1 Gyr runs.
- **P3 — Erosion, sediment, ageing.** The 450 Myr horizon, tuned.
- **P4 — Events, overlays, scrubber, provenance.** Legibility.
- **P5 — Render handoff.** Rasterise to the v1 render mesh, `terrain-post.js` once, existing
  climate stack.
- **P6 — Export + calibration.** `.rot` + feature collections for GPlates; §9 metrics.

---

## 11. Risks

1. **The policy produces boring or degenerate histories** — every run the same, or plates
   that never reorganise. Mitigation: the reroll and persistence knobs are parameters with
   ranges; validate the *distribution* of outcomes across seeds, not one run.
2. **Belt geometry looks drawn.** It *is* drawn (in thickness space), then isostasy, flexure,
   accrual-over-substeps and erosion soften it. If it still reads as drawn at P1, add
   along-strike modulation from the boundary's own geometry before reaching for noise.
3. **Scatter artefacts** — Moiré at plate boundaries from nearest-cell rounding. Mitigation:
   sub-cell jitter in the destination lookup, and boundary smoothing at policy steps.
4. **Craton rule too rigid** — belts that wrap cratons perfectly look artificial. Allow a
   small craton-edge thickening allowance.
5. **Harness overhead** (see `ARCHITECTURE.md` §7) — realistic infrastructure cost is
   1,500–2,500 lines including dev UI, not 300–500.

---

## 12. Adversarial review — disposition

| Finding | Disposition |
|---|---|
| Supercontinent start → nothing moves | Initial subduction around the supercontinent is authored (§5.1); motion is a policy, not a force balance, so it never depends on forces existing |
| Particle mass model unspecified | Fixed-area cells; `thickness` is the mass field; overlap sums it (§1.1, §3) |
| Airy can't make forelands | Flexure pass added (§4.2) |
| Simulated planets look like simulations | Belt geometry is designed and art-directable (§4.1); phases reordered so mountains appear at P1 (§10) |
| Runtime numbers contradictory; CFL forces 1 Myr | Scatter advection has no CFL limit; 5 Myr substeps; advection < 1 s (§2.2, §3, §8) |
| Mobile likely violated | Reduced 20k-cell mode, target < 3 s (§8) |
| Scrubber memory | Snapshot at 20 policy steps only: ~50 MB / ~13 MB (§8) |
| Laramide rule contradicts "emergent" tenet | Tenet replaced; rules are the method (§0, §4.1) |
| Cratons' `strength` unused | Replaced by a hard mass-routing rule (§3.1) |
| 450 Myr "emerges" | Stated as tuned (§6) |
| Checklist unfalsifiable | Split into quantitative / by-design / blind (§9) |
| Mid-sim climate coupling oversold | Out of scope for v2.0 (§6) |
| Pass model fails topology passes; no stable IDs | Fixed grid: cell index is the ID; split/merge is a `plateId` write; no topology mutation exists (`ARCHITECTURE.md`) |
| Per-pass RNG insufficient | Stateless per-(pass, step, cell) hashing (`ARCHITECTURE.md` §4.3) |
| Example violated field-level reads | `ctx.read` returns only declared fields (`ARCHITECTURE.md` §2) |
| Golden hashes break across engines | Tolerance-based comparison (`ARCHITECTURE.md` §6) |
| Infra estimate lowballed | 1,500–2,500 lines (`ARCHITECTURE.md` §7) |
| 1,000-step history is narrative noise | Everything aggregates to the blog's 50 Myr chapters (§2.1) |
| Root `CLAUDE.md` misleads work in `tectonics/` | Scoping clause added to root `CLAUDE.md` |
| Stereographic Delaunay on moving clouds | Moot: the grid is never re-tessellated |

---

## 13. Sources

- Worldbuilding Pasta, *An Apple Pie From Scratch* Parts Va, V Supplement, Vb, VIIa, VIIb, VIIc
  — blocked from direct fetch this session; accessed via search extracts (`[verified]`) and
  memory (`[recalled]`); needs a verification pass against the posts
- GPlates / EarthByte: rotation-file format, plate reconstructions, flowlines; pyGPlates
  rotation hierarchy; `halkszavu/Project-Artifexia`
- platec (Viitanen; `Mindwerks/plate-tectonics`) — forward-scatter advection;
  `davidson16807/tectonics.js` — the same on a sphere
- Parsons & Sclater (1977) age–depth; Stein & Stein (1992) GDH1; half-space validity ~80 Myr
- Airy isostasy and flexural isostasy; effective elastic thickness ranges
- Cortial, Peytavie, Galin, Guérin, *Procedural Tectonic Planets*, CGF 38(2) / EG 2019
- `lukabergs/UndiscoveredWorlds`; `redblobgames/1843-planet-generation`; Experilous
