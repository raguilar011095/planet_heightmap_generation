# Evolution: far-field deformation and a continent-wide grain

Status: **plan, 2026-10-25, for the owner's review. Nothing built.** Follows the start-world work
(`plans/V2_START_WORLD_PLAN.md`, committed 8e4dc83 on `worktree-start-world`).

## 1. Why

A collision deforms its continent thousands of km from the front, and that is a big part of why real continents look
structured rather than noisy. The engine only models the near field:
- the weld's one-off displacement (`indentFalloffKm` 1500);
- escape at the front's ends;
- belts reaching a little further along old weak lines (`weakCellCost`);
- rim belts onto cratons;
- Laramide belts migrating inland;
- foreland flexure in the terrain.

Past ~1000 km a continent gets only isotropic noise. That is exactly the "generated with noise" look the start-world
work removed at 0 Myr, and it comes back over the history.

## 2. What happens on Earth

| Effect | Earth example | Reach | Look |
|---|---|---|---|
| **Stress passed through rigid blocks** | India → Tarim (rigid) → the Tian Shan rises on its far side along a Paleozoic suture, up to 7 km (Molnar & Tapponnier 1975; Neil & Houseman 1997) | 1500–2500 km | a range far inland, where the push meets a weak line *behind* a craton |
| **Rift inversion** | the Alps squeezed the North Sea and Polish basins back up (Ziegler et al. 1995); the Ouachita collision turned the Southern Oklahoma aulacogen into the Wichita Mts | 500–1500 km | failed rifts and old basins pop up as ridges |
| **Intraplate orogens** | the Ancestral Rockies (Kluth & Coney 1981); central Australia's Petermann and Alice Springs orogenies, along old sutures (Raimondo et al. 2014) | 1000–2000 km | basement-cored uplifts a few hundred km long, basins beside them |
| **Lithospheric folding** | Central Asia, Central Indian Ocean (Burov et al. 1993; Cloetingh & Burov 2011) | whole continent | long, gentle swells and basins parallel to the front, 200–600 km apart; on stiff cratons longer and lower |
| **Escape on strike-slip faults** | Indochina squeezed out; Altyn Tagh (1600 km), Red River, North Anatolian | 1000–3000 km | long straight fault valleys at ~30° to the push |

**The rule behind it all:** stiff blocks (cratons) pass the push through without deforming, and weak lines release it
(old sutures, failed rifts, rift margins). This is the thin-viscous-sheet picture (England & McKenzie 1982): stiff
inclusions in a soft sheet.

## 3. Design

**Records only, like the Phase 10 rim belts.** The history's events must not change, and that is checked with the
events hash. Terrain changes in every history, and the plates move exactly as before.

**One new record per crust cell: the far-field push** (`model/crust.js`, `CELL_FIELDS`; frames and the raster arrays
the terrain reads):
- `farWork`: shortening the cell has felt from distant fronts (km-equivalent), accumulated;
- `farAt`: when it last felt a significant push (for age and wear);
- `farDir`: the compression axis, a unit tangent in the plate's frame. It is an axis, not a vector: averaged
  sign-invariantly, weighted by each push's increment.

**Why a stored direction.** The engine has avoided stored directions so far: ridges read theirs from belt geometry at
terrain time. But the far field is many collisions deep, and reconstructing it at terrain time would mean keeping every
past front. A direction vector only needs rotating where crust changes plate frame:
- `merge-plates` (lower → upper);
- `accrete-terrane`;
- `scrape-arc`;
- `tidy-plates` fragments.

That is four call sites, through one `copyFrom(…, rotation)` path, covered by `check-invariants`.

Rejected alternative: curvilinear coordinates (distance across from the front, position along it). They are frame-free
scalars, but the noise built from them shows seams wherever the dominant front switches, and a direction taken from a
mesh-distance gradient snaps to the mesh's six directions (Phase 8a lesson).

**The push** (`step/far-field.js`, new, every `farFieldEveryMyr`; ~4 Myr, on its own clock like the rivers). For each
active collision record:
1. Spread from its front cells over each plate's land: upper and lower, and on through land welded to them. A
   Dijkstra on the plate raster, with path cost per km:
   - cratons transmit (`farCratonCost` ~0.3: the push reaches far past a shield);
   - weak cells absorb (`farWeakCost` ~1.5);
   - ordinary crust 1.
2. Transmission decays as `exp(−cost-distance / farReachKm)` (~1200 km), cut at ~3000 km.
3. Each reached cell gains `farWork += km × transmission × take`:
   - `take` is small on a craton (it does not deform);
   - `take` is large on weak cells;
   - `farDir` blends toward the direction from the front point it was reached from.

**Scale.** Every distance is in km and every rate per Myr. The sim mesh is fixed. Terrain features fade below what the
mesh can show (`fade()`).

## 4. Phases (each judged in the lab, then the page; stops for the owner's look)

### F1 — The far-field record
- Build `step/far-field.js`, the crust/frame fields, rotation on cross-frame copies, and a lab layer showing the push's
  strength and direction (ticks).
- **The start world gets it too.** The S2 major seams push across the start supercontinent as prehistoric collisions,
  so 0 Myr already carries the assembly's push.
- *Verify (lab, the Phase 10 'cratons' scene: India into Asia, big shields on both sides):*
  - the push fans out from the front;
  - it runs through Asia's shield almost undiminished;
  - it piles up on the weak lines beyond;
  - it fades by ~3000 km;
  - the ticks lie across the front.
- *Numbers:*
  - events hash unchanged;
  - push at 1500 km behind a craton vs. behind ordinary crust;
  - 40K vs 80K within ~10 % (`check-scale`);
  - `check-invariants` with the rotated field;
  - `check-save` (a new frame field: old planet files read zeros).

### F2 — Reactivated ranges and inverted rifts
- **Where the push lands on weak cells,** a new belt kind rises (`OrogenyType.INTRAPLATE`): narrow (≤ ~250 km),
  basement-cored, records only.
- **Its work** = the push's increment × weakness × how squarely the push meets the line, cos² of the angle. A line
  struck head-on thrusts; one struck along its length mostly slides.
  - The line's strike comes from the weak cells' own arrangement nearby.
  - **Smooth, no on/off threshold:** a small push raises nothing visible, a big one a range.
- **Failed rifts** (`CrustFlag.FAILED_RIFT`) invert the same way: the trough becomes a ridge with a basin either side.
- **Terrain:** an entry in each belt table (`reliefKm`, `fullReachKm`, `upliftBuildKm`, profile). It erodes like any
  belt in `step/heights.js`.
- *Verify:*
  - a Tian Shan-like range rises behind Asia's shield in the 'cratons' scene;
  - the start world's inner seams wake where the history's first collisions push them;
  - an aulacogen near a collision becomes a ridge.
- *Numbers:* intraplate belt length and height, their distance from the front, and how many lie behind cratons.

### F3 — Lithospheric folds (terrain only)
- **Broad swells and basins across the push:** oriented noise, not a perfect sinusoid. Features about λ across the axis
  (`farFoldKm` ~300 km; ×1.6 on cratons) and 3–5 λ along it, height ∝ `tanh(farWork / W0)`, fading with age since
  `farAt`.
- They never drown land: as with the other lowlands, a basin stops above the sea.
- *Verify:*
  - Terrain at a moment just after a big collision: gentle whaleback swells parallel to the front, across the
    continent behind it;
  - longer and fainter on shields;
  - gone a few hundred Myr later.
- *Numbers:*
  - height spectrum across vs. along the axis (anisotropy ratio);
  - land below 400 m unchanged within a couple of points.

### F4 — The continent-wide grain
- **The remaining isotropic noise is stretched along `farDir`**, by how strong the push was:
  - the platform's basins and arches;
  - the start swells;
  - the craton grain where a push crossed it.
- **The craton grain** (S4) takes the push's direction where one crossed it, and keeps its own long axis elsewhere.
- **Same stretch formula as the S4 craton grain.** Noise read at `p·f + (k−1)(p·a)a`. It is sign-invariant in `a`, so
  continuous wherever the direction field is.
- *Verify:* Terrain on the start world and mid-history. Regions behind past collisions read as combed, Appalachian
  Valley-and-Ridge-like at large scale, instead of blotchy. Untouched interiors stay as they are.
- *Numbers:* anisotropy ratio of the platform noise where `farWork` is high vs. where it is ~0.

### F5 (optional, later) — Escape faults
A few long straight fault valleys from the indenter's corners at ~30° to the push, offsetting ranges they cross. Only if
F1–F4 leave the far field looking too smooth.

## 5. Costs and risks

- **History time.** One Dijkstra per active collision every ~4 Myr, over ≤ one plate's raster: an estimated +1–3 s on
  a 1200 Myr history (now ~60–70 s), to be measured.
- **Terrain time.** One more oriented noise per point and a stretch on existing ones: an estimated +3–6 % per frame,
  to be measured on the lab's 2.5M pool.
- **Memory.** 5 floats per crust cell (packed in frames like the other records).
- **Saved planets** still open. Their frames lack the new fields (read as zeros, no far field), and Extend re-runs the
  history as usual.
- **The flat-opening trap.** Folds and reactivation add relief. Keep the land below 400 m near today's, as the owner
  wanted more lowland, not less.

## 6. Decisions for the owner

1. **Push sources:**
   - **(a)** continent–continent collisions only (recommended first);
   - **(b)** also strong Andean and flat-slab margins: the Sierras Pampeanas ~700 km inland, the Laramide (which the
     engine already has as a belt) and its foreland uplifts.
2. **Reactivated ranges:**
   - **(a)** subtle (Ancestral Rockies, 1–2 km);
   - **(b)** scaled by the push, so an India-sized collision can raise a Tian Shan (4–5 km) and small ones only low
     ridges (recommended).
3. **Folds:** subtle (≤ 150 m) or visible (≤ 350 m)?
4. **Grain:** which noises it orients. Recommended: platform basins and arches, start swells, craton grain. Leave the
   coast and the ranges' own crest noise alone, since belts already have their grain.
5. **Escape faults (F5):** plan for them, or skip?

## 7. Checks touched

- New `check-far-field.mjs`: F1–F4, plus the events hash.
- `check-phase10` (cratons and forelands).
- `check-phase8a` / `check-phase8b` (terrain shape and carving), `check-invariants`, `check-scale`, `check-save`.
- Only the affected suites, and no sweep unless asked.

## 8. References

- Molnar, P. & Tapponnier, P. (1975). Cenozoic tectonics of Asia: effects of a continental collision. *Science* 189,
  419–426.
- England, P. & McKenzie, D. (1982). A thin viscous sheet model for continental deformation. *Geophys. J. R. Astr.
  Soc.* 70, 295–321.
- Kluth, C. F. & Coney, P. J. (1981). Plate tectonics of the Ancestral Rocky Mountains. *Geology* 9, 10–15.
- Burov, E. et al. (1993). Continental lithosphere folding in Central Asia (Part II). *Tectonophysics* 226, 73–87.
- Ziegler, P. A., Cloetingh, S. & van Wees, J.-D. (1995). Dynamics of intra-plate compressional deformation: the Alpine
  foreland and other examples. *Tectonophysics* 252, 7–59.
- Neil, E. A. & Houseman, G. A. (1997). Geodynamics of the Tarim Basin and the Tian Shan in central Asia. *Tectonics*
  16, 571–584.
- Cloetingh, S. & Burov, E. (2011). Lithospheric folding and sedimentary basin evolution. *Basin Research* 23, 257–290.
- Raimondo, T., Hand, M. & Collins, W. J. (2014). Compressional intracontinental orogens. *Earth-Science Reviews* 130,
  128–153.
