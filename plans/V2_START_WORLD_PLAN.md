# Evolution start world: a supercontinent with a past

Status: Worktree `.claude/worktrees/start-world`, branch `worktree-start-world` (from origin/main 7026cc6).

- **2026-10-25: owner chose A and C combined.** Build the assembly story, and wherever noise still draws something, use
  smarter, anisotropic noise. No versioning: every Evolution world changes. A Tethys-like gulf is left to chance.
- **S1 built 2026-10-25.** The owner then asked for S2–S4 before anything else (far-field deformation comes after).
- **S2–S4 built the same day, awaiting the owner's look.** See §5.

## 1. What is wrong today

The owner's words: the start supercontinent "looks very bad, unrealistic, and clearly generated with noise", and the cratons
"face the same problem". Seen at 0 Myr (seed 1, Terrain and Plates layers) and in `render-start.mjs` for seeds 1–4, then
compared with the same history at 500–800 Myr. The later continents look good because the engine shaped them: rifted
coasts, arcs, belts along real margins. **The start world is the only frame the engine did not make.** It is drawn by
noise, and much of its coast and every one of its cratons survives the whole history, so it caps how good every later
frame can look.

Five causes, all in `v2/js/tectonics/init/` and `step/heights.js`:

| What you see | Where it comes from |
|---|---|
| **One fat blob of land**, its coast wiggly at every scale and in every direction | `landmass.js`: the coast is a soft union of discs around the cratons, bent by fBm, domain-warped fBm and a continent-scale noise swell. A threshold of isotropic fBm has no long straight stretches, no arcs, no cusps, no gulf with a cause. The eye reads that as noise. |
| **Leopard spots**: cratons as rounded potatoes, evenly sprinkled | `cratons.js`: each craton is a disc with harmonics k = 1…5, plus ±150 km fBm. They are packed greedily, each new one as close to the centre as the minimum gap allows, so every gap comes out close to the minimum. Size skew does not help, because evenly spaced blobs of mixed size still look like spots. |
| **Short worm-like ranges scattered evenly over the interior** | `start-world.js` `oldSutureRanges`: the suture network is the noisy Voronoi border between every craton's terrane (a honeycomb). A 1600 km noise then switches stretches of it on and off, which leaves about half the honeycomb as disconnected segments of one length, everywhere. |
| **Tan blotches** of upland with no relation to anything | `heights.js` `seedBaseRelief`: 2500 km fBm swells, up to 0.8 km. |
| **No hierarchy**: every craton, gap, range and bay is about the same size | All of the above draw from one kind of noise at one scale each. |

## 2. What the real thing looks like

- **A supercontinent is a collage of earlier continents.** Pangaea was Laurentia, Baltica, Siberia, Gondwana (itself
  West and East Gondwana) and smaller blocks, stitched along a few long sutures: the Central Pangean Mountains
  (Appalachian–Variscan, about 6000 km) and the Urals. The ranges are few, long, continuous and curved, and they wrap the
  blocks. They are never a uniform net.
- **Each continent is a collage too, grown outward.** Laurentia's Archean cratons (Superior, Slave, Rae, Hearne,
  Wyoming) were welded by Paleoproterozoic belts (Trans-Hudson) and then rimmed by ever-younger belts outward:
  Yavapai–Mazatzal, then Grenville, then the Appalachians and the Cordillera (Hoffman 1988, *United Plates of America*).
  The crust between and around cratons is a set of **concentric belts, each younger outward**, each parallel to the margin
  of its time (accretionary growth, Cawood et al. 2009).
- **Cratons are fragments.** The ~35 Archean cratons are pieces of a few earlier "supercratons" that rifted apart
  (Bleeker 2003, *a puzzle in ca. 35 pieces*). Their edges are mostly old rifted margins: straight-ish, segmented by
  offsets. Later belts wrapped round them. Shapes are angular and often elongate, with sibling pieces whose edges match.
  Inside, they have a **grain**: the Superior Province is striped east–west by belts hundreds of km long, and the Pilbara
  is domes and keels.
- **They cluster.** Some cratons nearly touch, welded by a narrow belt; others sit far apart across wide accreted
  ground (West Africa vs Congo–Kalahari in Gondwana).
- **The coast has causes.** Pangaea was a C around the Tethys embayment. Its outer rim was one long subduction margin
  (the Terra Australis orogen, ~18,000 km) in long smooth arcs, convex to the ocean and joined at cusps. Passive stretches
  have promontories and recesses inherited from rift segments and their transform offsets (Thomas 2006).

## 3. The principle

**Noise only for detail under ~150 km. Every larger shape comes from a geological primitive that has a story:**

| Primitive | Gives |
|---|---|
| fragment (rift cuts) | angular cratons, faceted passive coasts |
| accretion (growth fronts) | concentric belts and terranes, the land between cratons |
| collision (blocks meeting) | a few long major sutures, embayments where blocks do not meet |
| subduction (arcs) | smooth arcuate active coasts with cusps |

The history engine downstream does not change. It still receives one plate of crust types, terranes, suture flags and
belt records, so every mechanism (rifting along sutures, welds, the supercontinent cycle) works as before. Only the
picture it starts from improves.

## 4. Options

### A. Assembly story, built geometrically — recommended

Build the supercontinent the way Earth built Pangaea, from those primitives, in about the time it takes today (~1 s).
Fully controllable and deterministic, and it keeps every promise of the current generator (§6). It is new geometry code
in `init/`, about 600–900 lines replacing ~400. Collisions are drawn as meeting growth fronts, not simulated, so there is
no indentation at first (phase S5 can add it with the engine's own weld op).

### B. Let the engine assemble it (a prehistory run)

Start a few hundred Myr earlier with 4–6 small continents, built with A's cratons and clusters. Drive them together
with Phase 13's mantle-flow traction, weld them with the real collision machinery (indentation, escape, arcs, remnant
seas), and call the weld 0 Myr. This is the most authentic, because it uses the same process as the later continents.
But:

- it adds ~10–20 s before the first frame on a desktop, and more on phones. Showing the assembly as negative time would
  hide that, but changes what the timeline means;
- Phase 13 showed that engine-assembled supercontinents need steering to be one cohesive body ("not continents joined by
  thin strips");
- the continental fraction drifts, and the first-rift timing has to be won again.

Keep it in reserve as S5 if A's sutures look too drawn.

### C. Smarter noise only (quick fix)

Anisotropic, ridged noise; fewer, longer suture segments; a cut or two through each craton. About a day of work, but it
stays noise. It would likely still fail the glance test the owner is applying. Not recommended except as a stopgap.

## 5. Phases (A), each checked in the browser before the next

Every phase is visible in Evolution at 0 Myr (and in `render-start.mjs`), with a headless numeric check. Phases stop for
the owner's look, as usual.

### S1 — Cratons as fragments, in clusters
- **Shape.** A craton is a body with low harmonics only (k = 1–3), elongated along its own grain axis (aspect
  1.2–2.2), clipped by 2–4 old rift edges. Each edge is a near-straight line at a random bearing, broken into 2–4
  segments by transform-like offsets. The 150 km edge noise drops to ~50 km. The signed distance stays analytic (the
  larger of body and cuts), so outline-gap packing keeps working.
- **Siblings.** Some cratons come in pairs or triples cut from one parent, placed near each other with matching edges
  facing (Vaalbara-style).
- **Clusters.** 3–6 proto-continents with skewed sizes (one Gondwana-sized, the rest smaller) each take a share of the
  cratons. Inside a cluster, cratons sit near the minimum gap; between clusters the gap is 2–4× the minimum. **The
  minimum gap is never relaxed.**
- **Grain** (terrain, `terrain/cratons.js`): the isotropic dome-and-keel grain becomes greenstone stripes along each
  craton's grain axis.
- *Verify:* Plates layer at 0 Myr on ~6 seeds shows angular, varied cratons in clumps, not spots. *Numbers:* share of
  outline that is near-straight; aspect ratios; the spread of nearest-neighbour gaps (clustered, not even).
- **Built (2026-10-25)** in `init/cratons.js`, `init/landmass.js` and `config.js`:
  - fragments: 1–3 rift edges per craton, corners rounded, redrawn while a piece comes out a sliver;
  - sibling pairs (`cratonSiblingChance` 0.3);
  - 2–6 clusters (`clusterBlocks`, `clusterApart`, `clusterGapVariety`);
  - edge noise that follows the grain, quieter on rift edges;
  - the terrain's craton-edge noise 70 → 45 km.

  The grain *stripes* inside cratons moved to S4: the terrain cannot know a craton's grain axis without a new per-cell
  record, and they are barely visible at preview detail.

  Measured from the crust (`check-phase3`, 3 new checks; 12 seeds):

  | | before | after |
  |---|---|---|
  | least compact craton per world | 0.25–0.44 | 0.43–0.60 |
  | gap between clusters ÷ gap between cluster-mates | — | 1.9–2.6× |
  | sibling pairs per world | — | 2–4 |

  Cost: ~1.7 s per world in node (was ~1.0), because the clustered layouts need more attempts to pass the width cap.
  The page's helpers run attempts in parallel, so the wait there is shorter.

  Other suites run:
  - `check-phase6`: 20 of 21 pass. The first rift comes at 2 Myr and splits clusters A–F from G–N. The one failure
    (the plume scene's "each half moves under its own trench") fails identically on the untouched baseline.
  - `check-phase10`: 5 of 8 pass. The two India-foreland failures were there before. **New:** "cratons carry some
    relief — still the calmest ground" now reads 104 m inside cratons vs 76 m on lowland, over the 1.3× cap (before:
    87 vs 70). The cause is the new world, not the terrain edge-noise change (104 m with the old value too). It is one
    history, so it is left for the owner's look.

  After S2–S4, on the final settings:
  - `check-phase3`: 31/31.
  - `check-phase6`: 20/21. Only the pre-existing plume-speed failure remains. Re-baselined: "rifts follow the old
    sutures" ≥ 15 → ≥ 12 %. The weak network is now the major and inner seams only (4–6 % of the land, was 7–10 %), so
    rifts from *random* junctions cross fewer: 19 → 13 %. The first real rift still opens between clusters.
  - `check-phase10`: 6/8. Only the two pre-existing India-foreland failures remain; "calmest ground" passes again
    (82 vs 72 m). Re-baselined: the scraps check judges its median only with ≥ 3 scraps. Compact cratons leave 1
    scrap in 30 frames, where the lobed cores left 9–38.
  - `check-phase3` change: the "longest belt" figure is reported, not checked. The honeycomb's joined segments also
    reached 7400 km.

### S2 — Proto-continents grown outward, and the major sutures
- Each cluster grows outward in 2–3 accretion pulses: fronts at increasing distance from the cluster, each smoother
  than the last (growth fronts become broad arcs), wobbled only at low frequency. Each pulse is a terrane with an age,
  older inward. Inner belts sit between a cluster's own cratons.
- Where two clusters' growth meets lies a **major suture**: few, long, continuous lines, curving round the blocks. Where
  they do not meet is a gulf or embayment, sometimes a Tethys-like wedge.
- The old ranges follow this hierarchy instead of the noise-masked honeycomb:
  - major sutures, youngest (~−300 Myr): continuous worn ranges whose height and width change smoothly along strike;
  - accretion belts: lower and broader;
  - inner belts, oldest: nearly flat.
- The suture flags (rift weakness) come from the same lines, so rifts follow the real seams.
- The continental fraction is still met first. The skirt bisection now sets the width of the outer accretion pulse.
- *Verify:* Terrain at 0 Myr: a few long ranges wrapping shields, not scattered worms. The first rifts open along major
  sutures. *Numbers:* range length distribution (long belts, not one segment length), belt count, land fraction, first
  rift time.
- **Built (2026-10-25)** in `init/landmass.js`, `init/start-world.js` and `config.js` (`startCoreKm`, `startRingKm`,
  `startGrowthBias`, `startSeamWanderKm`, `startRanges`, `startRangeVary*`):
  - **Growth distance.** Each cluster's growth is measured from its cratons joined softly over about half their gap,
    so the core takes in the belts between cluster-mates. It is shortened on a random side, the side that grew wider.
    Clusters own the land by smallest growth distance, and the **major seams** lie where two meet, wandering
    `startSeamWanderKm`.
  - **Rings.** Beyond the core (`startCoreKm`), rings `startRingKm` wide are counted by true distance, so the wide
    side holds them and the quiet side few or none. Only seams *between* rings are drawn: the core's own edge follows
    the cratons' lumps, and drawn all round every cluster it read as contour lines.
  - **Old ranges** by kind, oldest first:
    - inner seams nearly flat;
    - ring seams low;
    - major seams highest. Each pair of proto-continents gets its own strength: the last to meet 1, earlier ones
      0.25–0.7. Otherwise a proto-continent hemmed in by others would be ringed by one even range, a crater rim.
  - **Strength scales the relief kept, not the convergence.** A built belt's height barely depends on its convergence,
    so a strength fed in as convergence changed nothing; every seam stood at ~0.6 km.
  - **Weak seams** (`CrustFlag.SUTURE`): major and inner only. Ring seams run along the coast, and a rift following one
    would shave a ribbon off it.

  Measured from the crust on 8 seeds:

  | | before (honeycomb) | after |
  |---|---|---|
  | land within 500 km of an old range | 35–40 % | 19–30 % |
  | raised ground (share of land) | 5–6 % | 4–6 % |
  | longest belt | 2,900–7,400 km | 5,200–9,500 km |

  So the ranges are concentrated on a few seams, not reduced. A count of connected pieces did *not* separate the two:
  a honeycomb's segments, where they join, count as one long belt.

### S3 — The coast's character
- Active stretches (the rim trench's share, `rim-trench.js`) are smoothed into arcs, convex to the ocean, ~1000–3000 km
  long, joined at cusps.
- Passive stretches are faceted: rift segments with transform offsets, promontories and recesses.
- Fine bays and headlands (≤150 km) remain the only noise, and are less isotropic.
- *Verify:* the outline reads as drawn by tectonics: lobes, a gulf, arcs, facets. *Numbers:* coast roughness by scale
  (energy moved from the 300–1500 km fBm band into a few large features).
- **Built (2026-10-25)** in `init/landmass.js` (`marginProfile`), `rim-trench.js` and `config.js` (`startArcKm`,
  `startArcRadiusKm`, `startStepKm`, `startStepOffsetKm`, `startCoastDetailKm`; `coastReliefKm` 1200 → 350):
  - **Passive stretch chosen first** (`passiveStretch`, its own stream), so the coast can be drawn for it.
  - **Coast field.** The proto-continents' growth distances, softly joined: lobes where they bulge, bays where they
    don't meet (gulfs by chance).
  - **Margin by azimuth** about the cratons' centroid, only out where the coast is:
    - arcs (sagitta L²/8R) bulging seaward and joined at cusps along the active rim;
    - steps offset by transforms along the passive stretch.
  - **Noise:** the continent-scale term is now ±350 km instead of ±1,200, and fine bays and headlands are ≤ 90 km,
    less of both on the arcs.
  - **Not measured numerically yet;** judged in the page. The terrain's own fine coast fringe is unchanged: every frame
    has it.

### S4 — Heights at 0 Myr
- The swells come from structure, not free fBm:
  - broad uplands over the young accreted belts and along the major sutures;
  - shields low and calm (sag, swell or flat, as now);
  - foreland lowlands beside the major ranges;
  - an interior basin or two, at the scale of Pangaea's interior basins.
- Free noise remains as modulation only.
- *Verify:* Terrain and Satellite at 0 Myr. Land below 400 m stays near today's share (the owner wanted more lowland,
  not less).
- **Built (2026-10-25):**
  - **Starting swells placed by the assembly.** `world.startSeamKm` (from `init/start-world.js` `seamDistances`) holds
    each cell's distance to the major seams and ring seams, carrying the nearest major seam's strength. `seedBaseRelief`
    (`step/heights.js`) places uplands along them (`baseSeamShare`/`Km`, `baseRingShare`/`Km` in `terrain-config.js`),
    lowlands away from them (`baseFloor`), with the old swell noise at `baseNoiseShare` only breaking them up. Worlds
    without seams (the test scenes) keep the noise alone.
  - **Craton grain stripes** (moved here from S1). `terrain/cratons.js` reads each craton patch's long axis from its
    shape on the plate's own raster (second moments), so it rides with the crust and needs no new record.
    `synthesize.js` stretches the dome-and-keel noise along it, `cratonGrainStretch` 4× (greenstone belts).
  - **Not done:** foreland lowlands beside the old ranges. The terrain's flexure already does them for active belts.
  - **0 Myr hypsometry** (seeds 1, 3, 7, 12345 at 160K, carved), before → after:

    | | before | after |
    |---|---|---|
    | land below 400 m | 65–67 % | 71–72 % |
    | median | 0.25–0.27 km | 0.22–0.24 km |
    | 90th percentile | 0.82–0.87 km | 0.77–0.82 km |
    | highest peak | 2.5–2.6 km | 2.7–3.2 km |

    A first try with the noise at 0.8 and the floor at 0.15 left 77–79 % below 400 m: the flat opening the realism pass
    had removed. The noise was raised to 1.15 and the floor lowered to 0.1.

### S5 (optional, later) — Deformed sutures
Either weld the clusters with the engine's suture op (`ops/merge-plates.js`: indentation, escape, plateau), or option B's
prehistory run.

## 6. Promises kept

- **Spacing minimums never relaxed.** The continental fraction is hit first. Craton size gives way, down to
  `cratonMinAreaScale` (developer decision, Phase 3). The craton–sea margin and the one-landmass guarantee (bridges, or
  their equivalent) stay.
- Lettered cratons; one plate with an apron and rim trenches; the passive pre-history ocean; born old (first rift within
  ~30 Myr).
- Layout attempts are still evaluated on the helper pool (`buildStartWorldAsync`): each attempt depends on its number
  alone.
- **Own seeded streams.** New random choices draw from their own streams (seeded-streams rule).
- **Scale invariance.** Every rule is in km on the fixed sim mesh, checked at 40K and 80K.
- **No UI change** is needed. A possible later slider, "Assembly" (how many continents the supercontinent was built
  from), would need the planet-code and README work.

## 7. Decisions for the owner

1. **Approach**: A (recommended), B, or C.
2. **Shared links and saved planets.** Every Evolution world changes, so a shared seed builds a different planet.
   Saved planets still open; Extend then reports that the history "comes out otherwise" and stays view-only. Either:
   - **(a)** version the start world: links and planet files carry `start=2`, and an old link keeps the old generator,
     frozen in its own file; or
   - **(b)** accept the change, as with the browser-dependence accepted for the beta.
3. **Pangaea's C**: should a Tethys-like embayment be common, occasional, or left entirely to chance?

## 8. Checks touched

- `check-phase3` (start world): its guarantees are kept, so it is re-baselined only for shape.
- `check-phase6` (first rifts) and `check-phase13` (cycle timing).
- `check-phase10` (craton terrain).
- `check-save`: fixtures store frames, so they keep opening.
- `check-seeds`: seed reading is unchanged.

Only the affected suites, and no sweep unless asked.

## 9. References

- Bleeker, W. (2003). The late Archean record: a puzzle in ca. 35 pieces. *Lithos* 71, 99–134.
- Hoffman, P. F. (1988). United Plates of America, the birth of a craton. *Annu. Rev. Earth Planet. Sci.* 16, 543–603.
- Cawood, P. A. et al. (2009). Accretionary orogens through Earth history. *Geol. Soc. London Spec. Publ.* 318, 1–36.
- Thomas, W. A. (2006). Tectonic inheritance at a continental margin. *GSA Today* 16(2), 4–11.
- Card, K. D. (1990). A review of the Superior Province of the Canadian Shield. *Precambrian Research* 48, 99–156.
