# Heightmap Realism: Holistic Gap Analysis & Implementation Plan

## Context

This plan evaluates the *combined output* of the entire elevation pipeline — base distance fields + tectonic uplift/suppression + stress propagation + noise + interior uplift + ocean profiles + coastal roughening + island arcs + hotspots — to identify where the net elevation at canonical planetary positions diverges from reality. Each gap is assessed against what all layers together already produce, not what any single layer does in isolation.

All implementations must scale with region count. The codebase normalizes via `scaleFactor = Math.sqrt(numRegions / 10000)`. BFS distances, band widths, and pass counts use this factor. All new features must follow the same pattern so geological proportions hold from 2k to 640k regions.

---

## Part 1: Combined Pipeline Behavior at Canonical Positions

To understand what's truly missing, here's what the pipeline *actually produces* at key positions (at 10k regions, default settings: noiseMag=0.10, spread=4):

### A. Mountain front (continent-continent convergence, overriding side)
- Base: ~0.55 (small dist_mountain, large dist_ocean)
- Tectonic: +0.10 to +0.25 (high stress, low sf → strong uplift)
- Interior: +0.14 (deep inland)
- Noise: ridged fbm dominated, ±0.10-0.15
- **Net: ~0.75-1.0** — Realistic for high peaks

### B. 5 cells behind mountain front (overriding plate, inland)
- Base: ~0.35
- Tectonic: +0.01-0.02 (propagated stress, decayed)
- Interior: +0.14
- Noise: mostly smooth fbm, ±0.05
- **Net: ~0.50** — Elevated, plateau-like. Already approximates a post-collision uplift region.

### C. 5 cells in front of mountain front (subducting plate side)
- Base: ~0.35 (same dist_mountain symmetry)
- Tectonic: suppressed (sf>0.5 → `*0.86`), slight net depression → base ~0.30, tectonic ~-0.01
- Interior: +0.14
- Noise: ±0.05
- **Net: ~0.43** — Still elevated. The ~10% asymmetry vs Position B (0.50) is subtle but present.

### D. 12 cells from mountain, edge of stress propagation (overriding plate)
- Base: ~0.16
- Tectonic: stressNorm 0.01-0.05 → triggers the `-0.03` dip (line 333-335) → -0.03
- Interior: +0.14
- Noise: ±0.05
- **Net: ~0.27** — The foreland "dip" brings it from 0.30 to 0.27. This is barely perceptible against the +0.14 interior uplift that dominates.

### E. Deep continental interior, no nearby collisions
- Base: ~0.06 (dist_mountain=Infinity fallback, `0.1 * 0.6`)
- Tectonic: zero
- Interior: +0.14
- Noise: smooth fbm + detail noise, ±0.05-0.08
- **Net: ~0.20** — Moderate, uniformly rough. The same everywhere regardless of tectonic history.

### F. Coastal cell on a non-boundary coast
- Base: ~0.06
- Interior: lcd=0 → baseBias = -0.08 (full depression)
- Noise: ±0.05
- **Net: ~0.03** — Near sea level, realistic.

### G. Ocean cell, passive coast (no collision), 8 cells out
- Ocean profile: -0.19 (slope zone)
- **Net: ~-0.19** — Identical to active margin at same distance.

### H. Ocean cell, active subduction coast, 8 cells out
- Ocean profile: -0.19 (same slope zone), plus potential trench dip at convergent boundary (btype=1: -0.15 - 0.15*stressNorm)
- **Net: ~-0.19 at distance, ~-0.45 right at boundary** — The trench only affects the immediate boundary cells, not the overall shelf/slope shape.

### I. Divergent continent-continent boundary
- Base: moderate positive (~0.20)
- Tectonic: -0.12 flat rift depression
- Interior: +0.14 (if deep inland)
- **Net: ~0.22** — The rift depression barely dents it. Still elevated. Real rifts are deep valleys.

---

## Part 2: True Gaps (Where Combined Output Diverges from Reality)

### Gap 1: Passive vs. Active Margins Are Identical
**Combined output**: Positions G and H show that ocean cells at the same distance from coast have identical shelf/slope/abyss profiles regardless of boundary type. The ocean floor code (lines 372-398) has zero awareness of whether the adjacent coast is a subduction zone or a quiet passive margin.

**Reality**: Active margins (Andes/Peru-Chile trench) have narrow shelves (0-20km), steep slopes, and deep trenches. Passive margins (US East Coast, Brazil) have wide shelves (100-300km), gentle slopes, and no trench. This is one of the most fundamental distinctions in marine geology and affects ~60% of all coastlines.

**What existing layers contribute**: Nothing. No layer distinguishes margin type in the ocean.

### Gap 2: Continental Interiors Are Uniformly Elevated and Rough
**Combined output**: Position E shows deep interiors always land at ~0.20 ± noise. The interior uplift (+0.14) is applied identically everywhere regardless of tectonic context. Position B (behind a collision) and Position E (passive interior) differ only by ~0.30 because stress propagation has fully decayed by deep-interior distances. Meanwhile, the detail noise (line 348: `0.5 * noiseMag` everywhere) prevents any region from being truly flat.

**Reality**: Continental interiors vary enormously:
- Behind active collision zones: High plateaus (Tibet ~+5500m, Altiplano ~+3700m)
- Stable cratons far from boundaries: Low and very flat (Canadian Shield ~300m, West Siberian Plain ~100m, Sahara platform ~400m)
- The roughness contrast is dramatic: collision zones are rugged, old interiors are smooth

**What existing layers contribute**: The stress-adaptive noise blend (lines 343-346) does reduce ridged noise in low-stress areas. But the detail noise at 0.5x amplitude everywhere (line 348) and the uniform +0.14 interior uplift prevent the system from producing the flat-low vs. elevated-rough contrast that defines real continents.

### Gap 3: Foreland Basins Drowned by Interior Uplift
**Combined output**: Position D shows the foreland "dip" of -0.03 (line 333-335) is completely overwhelmed by the +0.14 interior uplift. The net elevation at what should be a low-lying basin is ~0.27 — higher than many continental interiors. A real Indo-Gangetic plain sits at near sea level (~0-200m) despite being adjacent to the Himalayas.

**Reality**: Foreland basins are the deepest continental depressions outside of rifts. They collect all the sediment and rivers from the adjacent mountains. They're flat, low, and wide.

**What existing layers contribute**: The -0.03 dip exists but is ~5x too weak to overcome the +0.14 interior uplift. The dip's position (at stress edge) is roughly correct. The issue is magnitude and noise suppression: a real foreland is flat and low, but the current output is bumpy and elevated.

### Gap 4: Rift Valleys Are Not Valleys
**Combined output**: Position I shows divergent continental boundaries net at ~0.22 despite the -0.12 rift depression. The +0.14 interior uplift and moderate base elevation absorb the depression entirely. Real rifts (East African Rift) are deep, narrow troughs with lakes, flanked by elevated shoulders.

**Reality**: Rift structures have three components: (1) a narrow, deep graben floor, (2) elevated shoulders flanking the graben, and (3) volcanic peaks along the axis. The current flat -0.12 captures none of this structure.

**What existing layers contribute**: The -0.12 depression is a start, but it's fighting against +0.14 interior uplift and moderate base elevation. The net depression is near zero. No shoulder uplift, no graben geometry, no volcanic features.

### Gap 5: Mountain Asymmetry Is Too Subtle
**Combined output**: Positions B vs C show ~10% elevation difference between overriding and subducting sides. The subduction factor suppresses by at most 35% of (sf-0.5)*2, and the stress propagation decays faster on the subducting side. The effects are real but subtle.

**Reality**: The Andes drop ~6000m over ~100km on the Pacific side but only ~3000m over ~500km on the Amazon side. That's roughly 3:1 slope asymmetry, not 1.1:1. The base elevation formula (harmonic-mean of distance fields) is inherently symmetric and dominates the profile shape. The sf-based corrections are second-order adjustments on top of a first-order symmetric function.

**What existing layers contribute**: The asymmetry mechanisms exist (sf suppression, differential stress decay) and point in the right direction. They just can't overcome the symmetric base elevation which contributes ~60% of the final mountain elevation.

### Gap 6: Ocean Fracture Zones Are Absent
**Combined output**: Transform ocean-ocean boundaries (`btype === 3`) are classified but produce zero elevation effect. Real fracture zones are prominent linear features in bathymetry.

**What existing layers contribute**: Nothing.

### Gap 7: Back-Arc Basins
**Combined output**: Behind ocean-continent convergent arcs, the overriding continental plate gets normal elevated terrain. No mechanism creates the extension-driven depression (Sea of Japan, Mediterranean back-arc basins).

**What existing layers contribute**: Nothing specific. The generic interior uplift applies uniformly.

---

## Part 3: Stack-Ranked Implementation Plan

Ranked by `(net_realism_gain_given_existing_layers) / (implementation_cost)`.

All features target `elevation.js` unless noted. Each uses `scaleFactor = Math.sqrt(numRegions / 10000)`.

---

### Rank 1: Passive vs. Active Continental Margins
**Why #1**: This is the cleanest gap — zero existing coverage, high visibility in any bathymetry view, and straightforward to implement. Affects ~60% of all coastlines.

**Scaling**: Shelf/slope width breakpoints in BFS cells scale with `scaleFactor`. `dist_coast` is already computed and inherently scales. The `coastConvergent` array from the coastal roughening block already BFS-propagates boundary type info into the ocean — we can reuse it.

**Approach** (modify ocean floor section, lines 372-398):
- Reuse the already-computed `coastConvergent[r]` flag (from the coastal roughening BFS at lines 404-448) to classify each ocean cell as active or passive margin
- Replace fixed `dc` breakpoints with margin-dependent values:
  ```
  Active:  shelf end = round(3 * sf),  slope end = round(8 * sf)
  Passive: shelf end = round(10 * sf), slope end = round(22 * sf)
  ```
- Passive shelves are shallower: `-0.01 → -0.03` (vs current `-0.02 → -0.08`)
- Passive slopes are gentler: `-0.03 → -0.20` over wider distance (vs `-0.08 → -0.33`)
- Active margins keep current steep profile and preserve existing trench behavior at convergent boundaries
- **Dependency**: The `coastConvergent` BFS currently runs inside the coastal roughening block (lines 400-513) which happens AFTER the ocean floor elevation is set (lines 371-398). Need to either hoist the coast-type BFS earlier, or restructure the loop to defer ocean floor assignment. Hoisting is cleaner.

**Key concern**: At low resolution (2k regions, sf=0.45), passive shelf = `round(10*0.45)` = 5 cells, which is still distinguishable from active shelf = `round(3*0.45)` = 2 cells. Degrades gracefully.

---

### Rank 2: Interior Elevation Differentiation (Tectonic-Aware Interior)
**Why #2**: Addresses the root cause of Gaps 2 and 3 simultaneously. The uniform +0.14 interior uplift is the single biggest structural issue — it flattens the distinction between collision-backed plateaus and quiet cratons, and overwhelms foreland depressions. Fixing this one mechanism fixes two gaps.

**Scaling**: Uses existing `r_stress` (already resolution-scaled via stress propagation), `dist_coast_land` (already resolution-scaled via BFS), and `scaleFactor` for any new BFS distances.

**Approach** (modify interior uplift section, lines 353-369):
- Replace the uniform +0.14 plateau with a tectonic-modulated interior elevation:

  **Plateau component** (replaces the flat +0.14):
  - Compute `tectonicActivity = max(r_stress[r] / maxStress, smoothed_nearby_stress)` where `smoothed_nearby_stress` is the maximum stress within ~`round(5 * sf)` cells (cheaply approximated: during stress propagation, track the *maximum* stress each cell has been exposed to, not just current propagated value)
  - Plateau uplift = `0.06 + tectonicActivity * 0.16` (ranges from +0.06 quiet interior to +0.22 collision-backed plateau)
  - This makes Tibet-analogues (+0.22) significantly higher than Canadian-Shield-analogues (+0.06)

  **Depression component** (unchanged): The coastal depression (-0.08 at coast) stays as is.

  **Noise suppression** (new): Multiply the detail noise amplitude (line 348) by `(0.15 + 0.85 * tectonicActivity)` so quiet interiors become flat while collision zones stay rough. This is a one-line change that produces the erosion contrast from the old Rank 2.

  **Foreland basin effect** (emerges naturally): With lower baseline interior uplift (+0.06 instead of +0.14), the existing -0.03 stress-edge dip (line 333-335) now actually creates a perceptible depression. If +0.06 base interior - 0.03 stress dip = +0.03, that's near sea level — a foreland basin. Previously +0.14 - 0.03 = +0.11, which was still elevated. No separate foreland system needed if the interior uplift is tuned correctly.

**Key concern**: Need to avoid making ALL quiet interiors too low. The +0.06 base should keep them above sea level. The `base elevation` formula still contributes positive elevation for land cells, so cells in the middle of a continent will have base ~0.06 + interior ~0.06 + noise ≈ 0.12-0.18, which is reasonable lowland.

---

### Rank 3: Rift Valley Structure
**Why #3**: The current -0.12 flat depression doesn't produce a valley (net elevation is still positive at ~0.22). With the Rank 2 fix reducing interior uplift in non-collision areas, rifts will already be somewhat deeper (net ~0.14 instead of 0.22), but still not a valley. Need the structured graben + shoulders to match reality.

**Scaling**: Rift width in BFS cells scales with `scaleFactor`. At 2k regions (sf=0.45), rift width = ~2 cells — degrades to a simple dip, which is acceptable. At 100k+ (sf=3.16), width = ~13 cells — enough for full graben/shoulder structure.

**Approach** (replace lines 337-339):
- Identify divergent continent-continent boundary cells (`btype === 2 && !r_hasOcean[r]`)
- BFS from these cells through same-plate land cells, max distance `RIFT_HALF_WIDTH = round(4 * sf)`
- Apply structured elevation profile based on BFS distance `d`:
  - `d = 0` (rift axis): depression `= -0.20` (deeper than current -0.12, now penetrating below the reduced interior uplift)
  - `d = 1 to round(1.5*sf)` (rift floor): depression `= -0.15`, add `ridgedFbm * 0.06` for volcanic features along axis
  - `d = round(1.5*sf) to round(2.5*sf)` (rift shoulders): uplift `= +0.05 * (1 - (d-1.5*sf)/(1*sf))`
  - `d > round(2.5*sf)`: smoothstep transition to ambient
- The depression is applied IN ADDITION to whatever the base+tectonic layers produced, so it's relative, not absolute
- With Rank 2's lower interior uplift (~+0.06), a -0.20 rift depression yields net ~-0.08 — an actual depression below sea level (rift lake). The shoulders at +0.05 create the flanking escarpments.

---

### Rank 4: Strengthen Mountain Asymmetry
**Why #4**: The existing asymmetry mechanisms (sf suppression, differential stress decay) produce ~10% asymmetry. Increasing this to ~30-50% would produce visibly realistic orogens without adding new systems. This is an amplification of existing behavior, not a new feature.

**Scaling**: Operates on existing distance fields and subduction factors, which are already resolution-scaled. No new BFS needed.

**Approach** (modify base elevation and tectonic sections):
- **In base elevation** (lines 297-305): Modulate `dist_mountain` by subduction factor before feeding into the harmonic-mean formula:
  ```
  const sfLocal = r_subductFactor[r];
  const asymmetry = 1.0 + (sfLocal - 0.5) * 1.2;  // 0.4 for sf=0, 1.6 for sf=1
  const a_eff = (dist_mountain[r] * asymmetry) + eps;
  ```
  This makes the distance-field "ridge" shift toward the subducting side (shorter effective distance = higher elevation) and the overriding side gentler (longer effective distance = lower elevation farther from peak)
- **Amplify sf suppression** (lines 320-323): Increase from `0.35` to `0.5`:
  ```
  r_elevation[r] *= 1 - suppression * 0.50;
  ```
- These two changes transform the ~10% asymmetry into ~30-40% asymmetry

**Key concern**: The `r_subductFactor` at non-boundary cells was propagated during stress BFS (line 138: `r_subductFactor[nb] = sf`). For cells far from any boundary, sf = default 0.5, so `asymmetry = 1.0` — no effect. The asymmetry only activates near collision zones where sf has been propagated, which is correct.

---

### Rank 5: Post-Collision Plateau Enhancement
**Why #5**: With Rank 2 already creating tectonic-aware interior uplift, this rank adds the specific broad elevated tableland behind continent-continent collisions. Rank 2 does the bulk of the work; this adds the characteristic flat-topped shape.

**Scaling**: Uses the already-propagated `r_stress` which scales naturally. No additional BFS needed.

**Approach** (insert after tectonic uplift, before noise):
- For land cells where:
  - `r_stress[r] > 0.05 * maxStress` (has propagated collision stress)
  - `r_subductFactor[r] < 0.45` (on the overriding side)
  - `dist_mountain[r] > round(3 * sf)` (not the mountain front itself, but behind it)
- Apply:
  - Additional uplift: `+0.06 * stressNorm * (1 - sf)` — modest boost on top of what Rank 2's tectonic-aware interior already provides
  - Noise suppression: multiply total noise by `max(0.2, 1 - stressNorm * 0.8)` — flatten the plateau top
- This creates the characteristic flat-topped elevated region (Tibet, Altiplano) as a specific enhancement to the overriding-plate interior, rather than a separate system

**Key concern**: Must not double-count with Rank 2's `tectonicActivity`-based interior uplift. The Rank 2 uplift is a base that varies from +0.06 to +0.22 based on nearby stress. This Rank 5 enhancement adds the flat-top *character* (noise suppression) and a modest extra boost. Together they produce: mountain front (~0.8-1.0) → plateau (~0.4-0.5, flat) → gradual decline to interior (~0.15-0.20, also flatter than current). Without Rank 5, you get the elevation gradient but not the flatness.

---

### Rank 6: Oceanic Fracture Zones
**Why #6**: Zero existing coverage; transform ocean boundaries produce no elevation effect. Visible in any bathymetric view. Relatively simple to implement.

**Scaling**: Fracture zone influence width scales with `scaleFactor`. At 2k regions, width = ~2 cells (just a line of depressed cells). At high resolution, the stepped offset pattern emerges.

**Approach** (insert in ocean elevation section, after ocean floor base):
- For ocean cells on transform boundaries (`btype === 3 && r_bothOcean[r]`):
  - BFS outward through ocean plate, max `round(4 * sf)` cells
  - Apply depression: `-0.04 * (1 - d/maxDist)` with high-frequency directional noise for stepped offsets
  - Where fracture zones cross mid-ocean ridge uplift (nearby `btype === 2` cells), offset the ridge crest (reduce ridge uplift on one side of the fracture)
- Creates the characteristic staircase pattern in ocean bathymetry

---

### Rank 7: Back-Arc Basins
**Why #7**: No existing layer produces depression behind volcanic arcs. Moderate visual impact — creates marginal seas when depression goes below water level.

**Scaling**: Basin distance from arc front scales with `scaleFactor`.

**Approach** (insert after tectonic uplift):
- For ocean-continent convergent boundaries, identify cells on the overriding continental plate that are `round(5*sf)` to `round(12*sf)` cells behind the collision front
- Requires: a new short BFS from convergent ocean-continent boundary cells inward through the overriding plate (already have `r_subductFactor < 0.5` to identify overriding side)
- Apply depression: smoothstep down to `-0.06 * stressNorm` at `round(8*sf)` cells, then back up
- Modulate with noise for irregular basin shape
- Cells that end up below 0 will appear as water through the existing water sphere

---

### Rank 8: Hypsometric Distribution Correction
**Why #8**: Even with all the above fixes, the overall elevation histogram may not match Earth's bimodal distribution. A light post-processing pass ensures global coherence.

**Scaling**: Operates on elevation values directly — resolution-independent.

**Approach** (final post-processing pass):
- Compute separate histograms for ocean and land cells
- Apply gentle quantile remapping toward target bimodal distribution
- Light blend: `new_elev = lerp(old_elev, remapped_elev, 0.25)` to preserve local detail
- This is a polish step, not a structural fix

---

### Rank 9: Simplified Fluvial Erosion
**Why #9**: Highest implementation cost. Adds valley networks, but depends on the mesh topology for flow routing.

**Scaling**: Flow accumulation operates on mesh neighbors (inherently scale-independent). Erosion depth per unit flow is absolute. At low resolution, produces wide valleys; at high resolution, dendritic networks.

**Approach** (new function, final elevation pass):
- Topological sort land cells by elevation (highest first)
- For each cell, route flow to steepest-descent neighbor
- Accumulate flow: each cell contributes area=1 plus incoming flow
- Erode: `elev[r] -= EROSION_RATE * log(1 + flow[r])` where `EROSION_RATE = 0.008`
- 100-150 new lines

---

## Recommended Implementation Phases

**Phase 1** (Core structural fix): Rank 2
- Tectonic-aware interior differentiation. This single change improves Gaps 2, 3, and partially 5. It's the highest-leverage modification because the uniform +0.14 interior uplift is the root cause of multiple issues.

**Phase 2** (Mountain systems): Ranks 4 + 5
- Strengthen asymmetry + plateau enhancement. These amplify existing mechanisms rather than adding new ones. Combined with Phase 1, produces complete mountain system profiles.

**Phase 3** (Structural features): Ranks 1 + 3
- Passive margins + rift valleys. Independent additions that fill genuine zero-coverage gaps.

**Phase 4** (Ocean + refinements): Ranks 6 + 7 + 8
- Fracture zones + back-arc basins + hypsometric correction. Polish.

**Phase 5** (Advanced): Rank 9
- Fluvial erosion. Most complex, implement last.

## Verification

After each phase:
- Generate 10+ planets at 10k regions with default settings
- Test at 2k, 10k, 50k, 200k regions to verify scaling invariance
- Use debug layers to confirm new component contributes correctly (add debug layer for each new feature)
- Verify that combined elevation at canonical positions (mountain front, foreland, interior, coast, passive ocean, active ocean, rift) matches expected values documented above
- Check `performance.now()` stays under 300ms at 10k regions
- Verify no NaN/Infinity in output
- Visual check: flat interiors should look flat, collision zones should look rough, foreland basins should be near sea level, passive margins should have wider shelves
