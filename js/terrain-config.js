// Terrain generation tunable constants.
// Grouped by subsystem for iterative tuning.
// These are internal algorithm constants, NOT user-facing slider parameters.

// ── Collision & Stress ──
export const COLLISION_THRESHOLD = 0.75;
export const COLLISION_DT_BASE = 1e-2;
export const COLLISION_DT_REF_REGIONS = 10000;
export const PAIR_INTENSITY_BASE = 0.5;
export const SUBDUCT_UNDULATION_DENSITY_DECAY = 12;
export const SUBDUCT_UNDULATION_FREQ = 6;
export const SUBDUCT_UNDULATION_AMP = 0.4;
export const SUBDUCT_FACTOR_BASE = 0.5;
export const SUBDUCT_FACTOR_TANH_SCALE = 8;
export const SUBDUCT_THRESHOLD = 0.55;
export const BOUNDARY_TYPE_THRESH_FACTOR = 0.3;

export const STRESS_PROPAGATE_MIN = 0.01;
export const STRESS_PROPAGATE_CUTOFF = 0.005;
export const STRESS_DIR_FACTOR_MIN = 0.1;
export const STRESS_DIR_FACTOR_BASE = 0.3;
export const STRESS_DIR_FACTOR_SCALE = 0.7;
export const STRESS_DIR_BLEND_PARENT = 0.8;
export const STRESS_DIR_BLEND_TRAVEL = 0.2;
// Scale-invariant smoothing targets (SP2). Physical distances chosen so the
// default Detail (~204K regions, avgEdgeKm ≈ 44.3 km) reproduces the previous
// fixed pass counts exactly — in declaration order below: stress-dir 2,
// plate-smooth 3, soil-creep 3 (round(88/44.3)=2, round(133/44.3)=3, round(133/44.3)=3).
export const STRESS_DIR_SMOOTH_KM = 88;
export const PLATE_SMOOTH_HIRES_KM = 133;
export const SOIL_CREEP_KM = 133;
export const STRESS_DIR_SELF_WEIGHT = 2;

export const STRESS_DECAY_BASE = 0.5;
export const STRESS_DECAY_SPREAD_FACTOR = 0.04;
export const STRESS_SUBDUCT_DECAY_MULT = 0.45;
export const STRESS_PASSES_PER_SPREAD = 3;

export const STRESS_PERCENTILE = 0.97;

// Plate blend balance — single parameter in [0, 1].
//   t = 0   → small plates dominate (smallW = 1.00, superW = 0.25)
//   t = 0.5 → both at 75%           (smallW = 0.75, superW = 0.75)
//   t = 1   → super plates dominate (smallW = 0.25, superW = 1.00)
// Quadratic curve through those three control points:
//   weight(s) = -0.5·s² + 1.25·s + 0.25
//   superW = weight(t),  smallW = weight(1 - t)
// Both layers contribute at least 25% at every value of t, so mountain
// ranges driven by either layer remain consistently visible regardless
// of where on the curve we sit.
//
// Note: SMALL_W and SUPER_W only blend stress magnitude / direction /
// subduction factor. Super plates still fully define the SEED SETS for
// distance fields (mountain_r, coastline_r, ocean_r) and the BOUNDARY
// TOPOLOGY flags (r_boundaryType, r_bothOcean, r_hasOcean) — that
// detail-stable fix is independent of this blend curve.
export const PLATE_BLEND_T = 0.7;
const _plateBlendW = (s) => -0.5 * s * s + 1.25 * s + 0.25;
export const SUPER_W = _plateBlendW(PLATE_BLEND_T);
export const SMALL_W = _plateBlendW(1 - PLATE_BLEND_T);

// ── Distance Fields & Zone Widths ──
export const INTERIOR_BAND_BASE = 16;
export const TECTONIC_REACH_BASE = 20;
export const COASTAL_PLAIN_WIDTH_BASE = 18;
export const COAST_BFS_WIDTH_BASE = 8;

// ── Mountain Profiles ──
export const RIDGE_STRENGTH = 0.12;            // toned 20% so phasor dominates the ridge texture
export const RIDGE_SIGMA_BASE = 5;
export const RIDGE_PEAK_SHIFT_BASE = 2;
export const RIDGE_EXTENT_BASE = 10;
export const RIDGE_ASYM_SUBDUCT_NARROW = 0.6;
export const RIDGE_ASYM_OVERRIDE_WIDEN = 0.5;
export const RIDGE_STRESS_WIDTH_BASE = 0.75;
export const RIDGE_STRESS_WIDTH_SCALE = 0.5;
export const RIDGE_WIDTH_NOISE_AMP = 0.2;
export const RIDGE_HEIGHT_VAR_BASE = 0.6;
export const RIDGE_HEIGHT_VAR_SCALE = 0.6;
export const RIDGE_HEIGHT_VAR_FREQ = 2.5;

export const BASE_SCALE = 0.6;
export const ASYMMETRY_FACTOR = 0.8;

export const SUBDUCTING_SUPPRESSION = 0.42;

export const STRESS_MAG_SCALE = 0.32;          // toned 20% so phasor dominates the ridge texture
export const STRESS_DEPRESS_FRAC = 0.4;
export const STRESS_HEIGHT_VAR_BASE = 0.60;
export const STRESS_HEIGHT_VAR_SCALE = 0.8;

export const SUBDUCTING_REACH_MIN = 0.35;
export const SUBDUCTING_REACH_RANGE = 0.3;

// ── Phasor Ridges ──
// Directional Gabor-wavelet sums producing organic ridge patterns oriented
// perpendicular to compression (parallel to orogen strike). Wavelength and
// bandwidth are in physical km, so scale-invariant by construction.
// Replaces the v1 sin-based fold ridges entirely.
//
// Subduction asymmetry: real fold-and-thrust belts form on the OVERRIDING
// side. PHASOR_SF_KERNEL_MAX excludes kernels from strongly-subducting
// cells; per-cell amplitude gate (1 - sf) makes the effect strong on the
// overriding side and bleed onto both at C-C collisions where sf ≈ 0.5.
export const PHASOR_NUM_KERNELS = 4000;        // total kernels distributed in stressed land
export const PHASOR_WAVELENGTH_KM = 55;        // ridge-to-ridge spacing (visible at planet scale)
export const PHASOR_BANDWIDTH_KM = 180;        // kernel envelope width — must overlap neighbors for coherent stripes
export const PHASOR_ORIENTATION_JITTER = 0.22; // radians (~12.5°) per-kernel direction perturbation
export const PHASOR_AMPLITUDE = 0.50;          // peak elevation contribution; modulated by foldBelt
                                               // weight AND orogenic power (squared, see below).
                                               // Decoupled from noiseMag.
// Positive bias on the sawtooth output. Raw sawtooth is [-0.5, +0.5]
// (symmetric, equal peaks and troughs). PHASOR_BIAS shifts the range
// upward → mostly-positive contribution (peaks tall, troughs mild).
//   bias = 0.0  → symmetric:        [-0.5, +0.5]
//   bias = 0.4  → mostly positive:  [-0.1, +0.9]   (default)
//   bias = 0.5  → fully positive:   [ 0.0, +1.0]
export const PHASOR_BIAS = 0.30;
export const PHASOR_STRESS_THRESHOLD = 0.02;   // min stressNorm for kernel placement; lowered so
                                               // kernels seed into orogen fringes and connect peaks
export const PHASOR_ELEV_THRESHOLD = 0.005;    // min elevation for phasor (just above sea level)
export const PHASOR_ELEV_RAMP_RANGE = 0.08;    // elev range over which gate ramps from 0→1 (faster ramp)
// Fold-belt modulation: contribution scales DIRECTLY with foldBelt weight,
// floored so non-fold-belt cells still receive some phasor. At foldBelt=1
// the cell receives full amplitude; at foldBelt=0 it gets PHASOR_FOLDBELT_FLOOR
// of the amplitude.
export const PHASOR_FOLDBELT_FLOOR = 0.05;     // strict — non-fold-belt cells get only 5% of amplitude
export const PHASOR_SF_KERNEL_MAX = 0.75;      // skip kernel placement on cells with sf above this
// Per-cell amplitude gate is a smoothstep falloff in sf: full strength up to
// PHASOR_SF_GATE_FULL, then ramps to zero at PHASOR_SF_GATE_ZERO. With FULL
// at 0.55 and ZERO at 0.92, both sides of a C-C collision (sf≈0.5) get full
// strength, the overriding side of an O-C boundary gets full strength, and
// the subducting side fades smoothly to zero.
export const PHASOR_SF_GATE_FULL = 0.55;
export const PHASOR_SF_GATE_ZERO = 0.92;
export const PHASOR_DIRECTION_PERP = false;    // if true, rotate kernel direction 90° in tangent
                                               // plane. Default false: kernel d = stress direction,
                                               // so ridges form perpendicular to compression =
                                               // parallel to orogen strike (geologically correct).
// Target smoothing radius (physical km) for the kernel direction field.
// At runtime, the number of neighborhood-average passes is computed as
// round(km / avgEdgeKm) so the smoothing covers the same physical
// distance regardless of Detail slider — without this, low-resolution
// meshes get many km of smoothing per pass while high-resolution meshes
// get tiny km per pass, producing visibly more chaotic phasor at high
// detail.
export const PHASOR_DIRECTION_SMOOTHING_KM = 220;

// Domain warp on the phasor phase computation. Each query cell warps its
// position once and that warped position is used for all kernel phase
// contributions, so stripes locally meander rather than running as
// straight small-circles. Multi-octave fbm with high frequency (small
// feature scale) and substantial amplitude.
export const PHASOR_WARP_FREQ = 110;        // fbm spatial frequency (~60 km wavelength)
export const PHASOR_WARP_AMPLITUDE = 0.006; // displacement in unit-sphere (~38 km, ~0.7 phasor wavelength)
export const PHASOR_WARP_OCTAVES = 5;
export const FOLD_FREQ_MULT_SCALE = 2.0;       // (kept) per-cell freq mult used by stage 5 noise

// ── Basins & Rifts ──
// Rift band geometry — each constant times scaleFactor gives a hop count
// at the 10K-region reference; physically, BASE × ~200 km gives the
// maximum extent in km.
//
//   FLOOR_MULT          → valley graben half-width    (target 50–250 km total valley)
//   SHOULDER_INNER_MULT → peak shoulder zone width    (extends BEYOND valley edge)
//   SHOULDER_OUTER_MULT → shoulder fadeout outer edge (extends BEYOND valley edge,
//                                                     target 200–400 km from valley edge)
//   HALF_WIDTH_BASE     → BFS bound (= max FLOOR_MULT + max SHOULDER_OUTER_MULT)
export const RIFT_HALF_WIDTH_BASE = 3.2;
export const RIFT_FLOOR_MULT = 0.35;
export const RIFT_SHOULDER_INNER_MULT = 0.5;
export const RIFT_SHOULDER_OUTER_MULT = 2.75;
// Per-cell width modulation: low-freq noise pinches/bulges the band along
// its length. The floor scales aggressively (50–100%, valley swings ~50–150 km
// total at default detail), the shoulder scales gently (50–100%, so the
// shoulder mountain extent stays 200–400 km from valley edge). Both share
// the same noise field so narrower floors correlate with narrower shoulders.
// Floor uses widthNorm² in elevation.js to bias the valley toward narrow —
// most sections render as axis-only (~30–50 km total at typical detail),
// with occasional wider sections up to ~140 km total. Shoulders stay
// linear so the mountain extent remains consistent on average.
export const RIFT_FLOOR_VAR_MIN = 0.5;
export const RIFT_SHOULDER_VAR_MIN = 0.65;
export const RIFT_WIDTH_VAR_FREQ = 0.5;
// Per-side width asymmetry: each cell samples noise offset by its plate ID,
// so cells on opposite walls of the rift get independent width factors —
// one wall can be wider than the other (footwall vs hanging-wall asymmetry,
// applies to both valley and shoulder extents). Capped at 1.0 so BFS bound
// covers max reach.
export const RIFT_WIDTH_ASYM_MIN = 0.65;
export const RIFT_WIDTH_ASYM_FREQ = 0.7;
export const RIFT_AXIS_DEPTH = -0.12;
export const RIFT_AXIS_VOLCANIC_AMP = 0.06;
export const RIFT_FLOOR_DEPTH = -0.08;
export const RIFT_FLOOR_TAPER = 0.3;
export const RIFT_FLOOR_VOLCANIC_AMP = 0.03;
export const RIFT_SHOULDER_UPLIFT = 0.50;
export const RIFT_SHOULDER_HEIGHT_VAR_BASE = 0.55;
export const RIFT_SHOULDER_HEIGHT_VAR_SCALE = 0.55;
export const RIFT_SHOULDER_HEIGHT_VAR_FREQ = 2.5;
export const RIFT_FADEOUT_RESIDUAL = 1.0;

export const BASIN_FREQ = 1.8;
export const BASIN_FACTOR_BIAS = 0.5;
export const BASIN_FACTOR_SCALE = 0.6;
export const FORELAND_STRESS_THRESH = 0.15;
export const FORELAND_WIDTH_FRAC = 0.3;
export const FORELAND_BASIN_DEPTH = 0.05;
export const FORELAND_PEAK_POS = 0.2;
export const FORELAND_BASIN_DEEPENING_BASE = 0.5;
export const FORELAND_BASIN_DEEPENING_SCALE = 0.5;

// ── Back-Arc & Foreland ──
export const BACK_ARC_START_BASE = 2;
export const BACK_ARC_PEAK_BASE = 3;
export const BACK_ARC_END_BASE = 5;
export const BACK_ARC_DEPTH = 0.14;
export const BACK_ARC_SUBDUCT_THRESH = 0.50;

// ── Noise Layering ──
// Defaults reduced relative to v1 so textured noise is secondary to phasor
// ridges and other shaped features. Slider (noiseMag) still scales these,
// so the original look is recoverable by raising the slider.
// Frequencies bumped 3× from the v1 values to de-blob mountain shapes.
export const WARP_SCALE = 0.4;
export const OROGENIC_FREQ = 1.5;
export const NOISE_ACTIVITY_SCALE = 4;
export const NOISE_BASE_SCALE = 0.15;          // toned ~17% so phasor dominates ridge texture
export const NOISE_ACTIVITY_CONTRIB = 0.45;    // toned ~18% so phasor dominates ridge texture
export const PLATEAU_SUPPRESS_MIN = 0.30;       // floor (rarely binds with smaller scale)
export const PLATEAU_SUPPRESS_SCALE = 0.30;     // halved — plateaus damp noise less aggressively
export const BASIN_AMP_SUPPRESS = 0.25;         // halved — basins damp noise less aggressively
export const CRATON_AMP_SUPPRESS = 0.12;        // halved — cratons barely damp now
export const RIDGED_NOISE_AMP = 1.0;
export const CONTINENTAL_FREQ_MULT = 4;        // base "continental" + ocean fbm (was 1, now 4×)
export const DETAIL_NOISE_FREQ_MULT = 16;      // mid-band detail (was 4, now 4×)
export const DETAIL_NOISE_AMP = 0.27;          // toned ~16% so phasor dominates
export const FINE_NOISE_FREQ_MULT = 20;        // high-band fine (was 8, now 2.5× — already fine in v1)
export const FINE_NOISE_AMP = 0.14;            // toned ~13% so phasor dominates
export const OCEAN_NOISE_AMP = 0.20;

// ── Uniform Land Noise ──
// Applied uniformly across all land (land-plate OR above sea level),
// independent of stress/tectonic activity. Two layers: additive bumps
// and subtractive carving, blended at equal strength.
export const UNIFORM_LAND_NOISE_FREQ = 72;     // was 36 (now 2× — already high in v1)
export const UNIFORM_LAND_NOISE_OCTAVES = 8;
export const UNIFORM_LAND_NOISE_AMP = 0.65;     // toned ~19% so phasor dominates ridge texture

// ── Dissection & Summits ──
// Reduced relative to v1 — phasor handles primary mountain shape now.
export const DISSECT_THRESHOLD = 0.10;
export const DISSECT_AMP = 0.30;               // toned ~14% so phasor dominates
export const DISSECT_ELEV_SCALE = 2;
export const SUMMIT_THRESHOLD = 0.55;
export const SUMMIT_STRESS_MIN = 0.03;
export const SUMMIT_SPIKE_OFFSET = 0.45;
export const SUMMIT_STRESS_FLOOR = 0.20;

// ── Interior Elevation ──
export const PLATE_BASE_HEIGHT_MEAN = -0.15;
export const PLATE_BASE_HEIGHT_STDDEV = 0.025;
export const INTERIOR_BASE_SHIELD = 0.14;
export const INTERIOR_BASE_BASIN = 0.04;
export const INTERIOR_TECTONIC = 0.16;         // toned 20% so phasor dominates the ridge texture
export const COASTAL_DEPRESSION = -0.08;
export const COASTAL_DEPRESSION_BASIN_REDUCE = 0.4;
export const INTERIOR_UPLIFT_RAMP_FRAC = 0.4;
export const INTERIOR_UPLIFT_MOD_AMP = 0.2;
export const INTERIOR_FLOOR = 0.008;
export const PLATEAU_BOOST = 0.04;
export const PLATEAU_START_BASE = 3;
export const MOUNTAIN_BOOST_FRAC = 0.3;
export const FOLD_BELT_MULT = 3;
export const CRATON_TECTONIC_MULT = 2.5;
export const BASIN_TECTONIC_MULT = 2;

// ── Continental Margins ──
export const SHELF_NARROW_BASE = 4;
export const SHELF_WIDE_BASE = 12;
export const SLOPE_WIDTH_BASE = 7;
export const SHELF_DEPTH_START = -0.08;
export const SHELF_DEPTH_RANGE = 0.08;
export const SLOPE_DEPTH_RANGE = 0.19;
export const ABYSS_BASE = -0.35;
export const ABYSS_NOISE_AMP = 0.03;
export const OCEAN_FLOOR_CLAMP = -0.005;

// ── Mid-Ocean Features ──
export const RIDGE_HALF_WIDTH_BASE = 4;
export const RIDGE_UPLIFT_NOISE = 0.12;
export const RIDGE_UPLIFT_BASE = 0.06;
export const FRACTURE_HALF_WIDTH_BASE = 3;
export const FRACTURE_DEPTH = 0.03;
export const TRENCH_BASE_DEPTH = 0.20;
export const TRENCH_STRESS_DEPTH = 0.20;

// ── Coastal Roughening ──
export const COAST_ROUGHEN_BASE = 8;
export const COAST_PASSIVE_FREQ = 24;          // was 6 (now 4×)
export const COAST_ACTIVE_FREQ = 36;           // was 9 (now 4×)
export const COAST_PASSIVE_AMP = 0.08;
export const COAST_ACTIVE_AMP = 0.12;
export const COAST_WARP_PASSIVE_REACH = 1.2;
export const COAST_WARP_ACTIVE_REACH = 1.5;
export const COAST_WARP_AMT = 0.35;
export const COAST_SUBDUCT_SUP_LOW = 0.45;
export const COAST_SUBDUCT_SUP_RANGE = 0.55;

// ── Island Scattering ──
export const ISLAND_DIST_BASE = 4;
export const ISLAND_FREQ = 17.5;               // reverted from 2× — bump was producing visibly
                                                // more islands ("land in seas") due to fbm threshold
                                                // gating scaling with frequency
export const ISLAND_THRESHOLD_BASE = 0.35;
export const ISLAND_THRESHOLD_STRESS = 0.2;
export const ISLAND_BUMP_AMP = 0.22;
export const ISLAND_PEAK_FLOOR = 0.04;
export const ISLAND_SUBDUCT_MAX = 0.3;

export const MAX_OCEAN_ARC_ELEV = 0.60;          // 6 km — allow Andean-volcano-tall peaks

// ── Island Arcs ──
// Aleutian-style chains of stratovolcanoes along ocean-ocean convergent
// boundaries. Tuned to produce sparse, tall peaks rather than continuous
// flat-topped plateaus.
//
// Two-level gating:
//   1) MACRO gate at seed time — a low-freq fbm + stress decides which
//      STRETCHES of boundary develop an arc (active subduction zones,
//      not every OO boundary). Real subduction zones vary widely in
//      whether they support active stratovolcano arcs.
//   2) Per-cell ridgedFbm threshold — within an active stretch, decides
//      which cells qualify as part of an island patch.
//
// Uplift has two components:
//   base lift = excess × ARC_BASE_AMP × distWeight × stressFactor
//     — linear in excess so qualifying cells reliably break sea level.
//   peak spike = peakMask × ARC_PEAK_AMP × distWeight × stressFactor
//     — sparse spikes (peakMask = ridgedFbm² is biased near 0) that
//     stack stratovolcano peaks on top of the base.
// Final elevation is then clamped to MAX_OCEAN_ARC_ELEV.
export const ARC_DIST_BASE = 7;           // wider band → larger islands when they do qualify
export const ARC_PEAK_DIST_BASE = 2;
export const ARC_SIGMA_BASE_VAL = 2;
export const ARC_MACRO_FREQ = 4;          // ~1600 km wavelength: discriminates which boundary
                                          //   segments get arcs
export const ARC_MACRO_THRESH = 0.55;     // strict — only the most active stretches of OO
                                          //   boundary become arc seeds
export const ARC_MACRO_STRESS_WEIGHT = 0.25; // stress nudge to macro gate (kept modest so
                                          //   noise-driven sparsity dominates)
// HARD CAP on origins: after macro filtering, sort surviving candidates by
// score and greedily keep at most ARC_MAX_ORIGINS, with each pair separated
// by at least ARC_ORIGIN_MIN_SPACING in chord distance. This prevents the
// "hundreds of islands at high detail" failure mode where every passing
// cell along a long boundary became its own BFS seed.
export const ARC_MAX_ORIGINS = 5;
export const ARC_ORIGIN_MIN_SPACING = 0.50; // chord distance (≈ 30° great-circle, ~3300 km)
export const ARC_BASE_FREQ = 5;           // lower freq = bigger patches when they do qualify
export const ARC_PEAK_FREQ = 36;          // sharp peak mask (sparse mountainous internals)
export const ARC_THRESHOLD = 0.80;        // qualifying threshold within an active boundary segment
export const ARC_BASE_AMP = 2.30;         // base lift (recovers height lost when stricter macro
                                          //   gate sparsened seeds → smaller avg distWeight)
export const ARC_PEAK_AMP = 1.65;         // additional spike at sparse peaks
export const ARC_SUBDUCT_THRESH = 0.45;

// ── Volcanic Features ──
export const VOLC_MIN_SPACING = 0.015;
export const VOLC_SIGMA_BASE = 0.003;
export const VOLC_HEIGHT_BASE = 0.15;
export const VOLC_HEIGHT_VAR_BASE = 0.7;
export const VOLC_HEIGHT_VAR_RANGE = 0.6;
export const VOLC_SIGMA_VAR_BASE = 0.6;
export const VOLC_SIGMA_VAR_RANGE = 0.8;
export const VOLC_SUBDUCT_THRESH = 0.45;

// ── Continental Hotspots (Yellowstone-style plateau mode) ──
export const CONT_HOTSPOT_SIGMA_MULT = 2.5;      // sigma multiplier vs oceanic domes
export const CONT_HOTSPOT_STRENGTH_MULT = 0.4;   // lower peak, broader plateau
export const CONT_HOTSPOT_CALDERA_SIGMA_FRAC = 0.35;  // wider caldera than oceanic
export const CONT_HOTSPOT_CALDERA_DEPTH_FRAC = 0.30;  // deeper caldera
export const CONT_HOTSPOT_SWELL_MULT = 1.5;      // wider swell around continental hotspot

// ── Large Igneous Provinces (hotspot-driven) ──
export const LIP_SIGMA = 0.08;
export const LIP_HEIGHT = 0.03;
export const LIP_LOBE_COUNT = 6;
export const LIP_LOBE_OFFSET = 0.6;        // offset in sigma units
export const LIP_LOBE_SIGMA = 0.6;         // lobe sigma as fraction of parent
export const LIP_LOBE_STRENGTH = 0.9;      // lobe height as fraction of parent
export const LIP_UPWELLING_THRESHOLD = 0.2;       // minimum mantle upwelling to trigger LIP

// ── Hotspot Chains ──
export const NUM_HOTSPOTS = 5;
export const CHAIN_LENGTH = 6;
export const CHAIN_DECAY = 0.65;
export const CHAIN_SPACING = 0.06;
export const DOME_SIGMA = 0.006;
export const DOME_STRENGTH = 0.60;
export const SWELL_SIGMA_MULT = 2;
export const SWELL_STR_MULT = 0.10;
export const DOME_OCEAN_BOOST = 1.8;
export const DOME_PEAK_THRESH_SIGMA = 5.5;
export const DOME_SWELL_THRESH_SIGMA = 3;
export const DOME_DRIFT_STRETCH = 1.05;
export const DOME_SATELLITE_COUNT = 2;          // extra sub-cones per island
export const DOME_SATELLITE_OFFSET = 0.8;       // offset distance in sigma units
export const DOME_SATELLITE_SIGMA = 0.5;        // satellite sigma as fraction of parent
export const DOME_SATELLITE_STRENGTH = 0.35;    // satellite strength as fraction of parent
export const DOME_RIFT_BOOST = 0.5;
export const DOME_CALDERA_SIGMA_FRAC = 0.25;
export const DOME_CALDERA_DEPTH_FRAC = 0.20;
export const DOME_CALDERA_STRENGTH_MIN = 0.15;
export const DOME_AGE_BROADENING = 0.03;
export const DOME_SHAPE_WARP_FREQ = 8;
export const DOME_SHAPE_WARP_AMP = 0.4;
export const DOME_SHAPE_WARP_DETAIL_FREQ = 20;
export const DOME_SHAPE_WARP_DETAIL_AMP = 0.40;
export const DOME_TEXTURE_BASE_WEIGHT = 0.7;
export const DOME_TEXTURE_DETAIL_WEIGHT = 0.3;
export const DOME_TEXTURE_ACTIVE_MIN = 0.4;
export const DOME_TEXTURE_ACTIVE_MAX = 1.2;
export const DOME_TEXTURE_AGE_MIN_SHIFT = 0.3;
export const DOME_TEXTURE_AGE_MAX_SHIFT = 0.2;

// ── Hypsometry & Isostasy ──
export const PEAK_COMPRESS_POWER = 0.90;
export const ISOSTATIC_K = 0.07;
export const HYPS_BLEND = 0.40;
export const HYPS_LOW_BREAK = 0.60;
export const HYPS_MID_BREAK = 0.85;
export const HYPS_LOW_ELEV_FRAC = 0.25;
export const HYPS_MID_ELEV_FRAC = 0.35;
export const HYPS_HIGH_POWER = 0.7;
export const FILL_LEVEL = 0.005;

// ── Passive Margin Coastal Plain ──
export const PLAIN_TARGET = 0.02;
export const PLAIN_SUPPRESSION_STRENGTH = 0.6;

// ── Domain Warp (terrain-post.js) ──
export const WARP_FREQ = 4;
export const WARP_OCTAVES = 5;
export const WARP_MAX_AMP_MULT = 0.13;
export const WARP_BIAS_BASE = 0.25;
export const WARP_BIAS_STRENGTH_SCALE = 0.5;
export const WARP_HOTSPOT_DAMPEN = 0.8;

// ── Smoothing (terrain-post.js) ──
export const SMOOTH_EDGE_SENSITIVITY = 12;

// ── Glacial Erosion (terrain-post.js) ──
export const GLACIAL_LAT_DIVISOR = 4.5;
export const GLACIAL_ELEV_LOW = 0.5;
export const GLACIAL_ELEV_HIGH = 0.9;
export const GLACIAL_ELEV_FACTOR_SCALE = 0.3;
export const GLACIAL_ELEV_FACTOR_LAT_BASE = 0.3;
export const GLACIAL_ELEV_FACTOR_LAT_SCALE = 0.7;
export const GLACIAL_CARVE_RATE = 0.025;
export const GLACIAL_CONVERGENCE_BONUS = 0.015;
export const GLACIAL_DEPOSIT_AMOUNT = 0.007;
export const GLACIAL_FJORD_CARVE = 0.020;
export const GLACIAL_FLOW_THRESHOLD = 0.1;
export const GLACIAL_FJORD_THRESHOLD = 0.5;
export const GLACIAL_WIDENING_FRAC = 0.4;
export const GLACIAL_TERMINUS_RATIO = 0.3;
export const GLACIAL_FJORD_ICE_MIN = 0.2;
export const GLACIAL_POST_SMOOTH = 0.3;
export const GLACIAL_MID_FLOOD_FRAC = 0.75;
export const GLACIAL_MID_FLOOD_CARVE = 0.85;
export const GLACIAL_INITIAL_CARVE = 0.5;

// ── Hydraulic Erosion (terrain-post.js) ──
export const HYDRAULIC_DEPOSIT_FRAC = 0.5;
export const HYDRAULIC_SLOPE_SENSITIVITY = 50;

// Reference region count for flow-accumulation normalization (SP2).
// flow[] and iceFlow[] are raw upstream-cell counts, which scale ∝ numRegions
// for a fixed physical catchment; multiplying by (REF / N) converts them to a
// physical-area-proportional quantity that is a no-op at the default Detail.
// 204000 = detailFromSlider(600), the default Detail slider position.
export const EROSION_REF_REGIONS = 204000;

// ── Thermal Erosion (terrain-post.js) ──
export const THERMAL_TRANSFER_FRAC = 0.5;

// ── Ridge Sharpening (terrain-post.js) ──
export const RIDGE_SHARPEN_CAP = 2.0;
export const VALLEY_DEEPEN_FACTOR = 0.5;
export const VALLEY_FLOOR_FRAC = 0.5;
export const VALLEY_FLOOR_MIN = 0.001;

// ── Priority Flood (terrain-post.js) ──
export const FLOOD_NOISE_AMP = 0.01;
export const FLOOD_CARVE_RADIUS_FRAC = 0.3;

// ── Plate Generation ──
export const PLATE_LOW_PLATE_T_HIGH = 80;
export const PLATE_LOW_PLATE_T_RANGE = 60;
export const PLATE_RATE_MIN_BASE = 0.7;
export const PLATE_RATE_MIN_LOW_T = 0.4;
export const PLATE_RATE_RANGE_BASE = 2.3;
export const PLATE_RATE_RANGE_LOW_T = 2.4;
export const PLATE_DIR_BASE_BASE = 0.15;
export const PLATE_DIR_BASE_LOW_T = 0.25;
export const PLATE_DIR_SCALE_BASE = 0.25;
export const PLATE_DIR_SCALE_LOW_T = 0.25;
export const PLATE_DIR_STRENGTH_CAP = 0.85;
export const PLATE_COMPACT_BASE = 0.3;
export const PLATE_COMPACT_LOW_T = 0.22;
export const PLATE_AREA_GOVERNOR_BASE = 2.0;
export const PLATE_AREA_GOVERNOR_LOW_T = 2.0;
export const PLATE_COMPACT_THRESHOLD_MULT = 1.8;
export const PLATE_COMPACT_PENALTY_MULT = 4;
export const PLATE_OMEGA_MIN = 0.5;
export const PLATE_OMEGA_RANGE = 1.5;
// ── Plate Physics ──
export const CONTINENTAL_DRAG_FACTOR = 0.35;
export const OCEAN_DRAG_FACTOR = 1.0;
export const SIZE_VEL_POWER = 0.5;
export const SIZE_VEL_MIN_FACTOR = 0.4;
export const SIZE_VEL_MAX_FACTOR = 2.5;
export const MANTLE_CELLS = 5;
export const MANTLE_ROTATION_STRENGTH = 0.6; // tangential swirl relative to radial flow
export const MANTLE_DOMINANT_STRENGTH = 2.0;  // strength multiplier for the 2 dominant cells
export const MANTLE_MINOR_STRENGTH = 0.7;     // strength multiplier for the remaining cells
export const MANTLE_POLE_BLEND = 0.45;
export const SLAB_PULL_POLE_BLEND = 0.65;
export const RIDGE_PUSH_POLE_BLEND = 0.40;
// Super plate multiplier: physics blends are this much stronger on super plates
export const SUPER_PLATE_PHYSICS_MULT = 1.6;

// ── Mantle-Driven Features ──
export const MANTLE_SPEED_ALIGN_STRENGTH = 0.35;
export const DYNAMIC_TOPO_UPLIFT = 0.035;
export const DYNAMIC_TOPO_SUBSIDENCE = 0.025;
export const MANTLE_STRESS_BOOST = 0.40;
export const HOTSPOT_UPWELLING_CANDIDATES = 8;
export const HOTSPOT_UPWELLING_JITTER = 0.3;

export const PLATE_SMOOTH_BASE = 3;
export const PLATE_SMOOTH_LOW_T = 2;
export const PLATE_SMOOTH_FIRST_THRESH = 0.4;
export const PLATE_SMOOTH_LATER_THRESH = 0.5;

// ── Detail Noise (post-processing) ──
// Final pass that adds 0–DETAIL_NOISE_AMP_KM of domain-warped FBM bumps to
// land cells, breaking up the visually-flat continental interiors that
// emerge from the elev→km quartic compression. Frequencies are in
// unit-sphere coordinates (Earth radius ≈ 1) so the result is scale-
// invariant. Bumps only — no depressions — so coastlines never sink.
export const DETAIL_NOISE_AMP_KM = 0.10;        // 100 m peak bump height
export const DETAIL_NOISE_FREQ = 5.0;           // ~1280 km base wavelength
export const DETAIL_NOISE_OCTAVES = 6;          // → finest features ~40 km
export const DETAIL_NOISE_WARP_FREQ = 3.0;      // ~2100 km warp wavelength
export const DETAIL_NOISE_WARP_AMP = 0.08;      // ~510 km displacement
export const DETAIL_NOISE_WARP_OCTAVES = 3;
// Slight dampening of detail-noise amplitude over geologically quiet
// regions (cratons, basins) to preserve their characteristic flatness
// without erasing the variety entirely.
export const DETAIL_NOISE_DAMPEN_STRENGTH = 0.5; // 50% reduction at full craton/basin weight

// ── Coarse Projection ──
export const N_COARSE = 20000;
export const COARSE_JITTER = 0.75;
export const COARSE_PERTURB_BASE = 1.5;
export const COARSE_PERTURB_LOW_T = 1.0;
export const COARSE_FBM_BASE_FREQ = 8;
export const COARSE_FBM_OCTAVES = 4;
export const COARSE_FBM_DECAY = 0.5;
export const COARSE_FBM_FREQ_MULT = 2;
