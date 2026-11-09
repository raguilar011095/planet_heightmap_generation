# The ground's water — research notes

The sources and the parameters behind `v2/js/finish/finish-groundwater.js` (the finish's `groundwater` stage, issue #87),
November 2026. **Checked** marks a source whose record and abstract were read; **read** one read in full or in its
relevant part; **unchecked** one cited from memory, its figures to be checked before they are relied on.

## 1. What the stage is, in one paragraph

A layer above the rivers and below the farming: it reads the finished moment (rock, relief, climate, rivers, lakes, the
ice age's till) and adds soils, recharge, a water table at equilibrium, springs, oases and wetlands, changing nothing it
reads. Every wetland comes from a cause: the water table near the surface, a big river's plain, a low coast, a lake's
shore. Nothing is placed by noise.

## 2. Sources, by part of the model

### The frame: wetlands by cause

- **Brinson 1993**, *A Hydrogeomorphic Classification for Wetlands*, Technical Report WRP-DE-4, US Army Corps of
  Engineers (checked). Wetlands by three causes: where they sit in the landscape, where their water comes from, how it
  moves. With Smith et al. 1995 (checked), seven classes: riverine, depressional, slope, mineral flats, organic flats
  (peat), lake fringe, estuarine fringe. The stage covers four (riverine, flats, lake fringe, coastal fringe); the
  depressional class (the finish's own hollows) and slope wetlands as a class of their own are not done (§4).
- **Fan & Miguez-Macho 2011**, *Climate Dynamics* 37, 253–278 (checked). Wetlands from the depth to the water table,
  driven by rain, evaporation, drainage, relief and sea level; built for climate models, past ones too. The direct base
  of the stage.
- **Fan, Li & Miguez-Macho 2013**, *Science* 339, 940–943, and its supplementary material (read). The global
  equilibrium water table at 1 km: the equations, the e-folding of permeability with depth, the correction for frozen
  ground, and the 0.25 m threshold for a wetland.
- **Beven & Kirkby 1979**, *Hydrological Sciences Bulletin* 24(1), 43–69, doi:10.1080/02626667909491834 (checked).
  TOPMODEL: saturation where much water comes from upslope onto gentle slopes. The simpler classic, not used here.

### Scale

- **Wolock & Price 1994**, *Water Resources Research* 30(11), 3041–3052 (checked). The scale and resolution of the
  relief change TOPMODEL's water table and flows, partly through the slope: the same effect the stage met and corrects
  (§3, `slopeRefKm`).

### Rock, soil and recharge

- **Gleeson, Smith, Moosdorf, Hartmann, Dürr, Manning, van Beek & Jellinek 2011**, *Geophysical Research Letters* 38,
  L02401, doi:10.1029/2010GL045565 (checked; the class values in `logK` are from memory and want checking against its
  table). Permeability by hydrolithology over the top ~100 m; near-surface mean of the order of 5 × 10⁻¹⁴ m².
- **Gleeson, Moosdorf, Hartmann & van Beek 2014**, GLHYMPS, *Geophysical Research Letters* 41, 3891–3898 (checked), and
  **Huscroft et al. 2018**, GLHYMPS 2.0 (checked). Global mean about 10⁻¹⁴ m² without permafrost, 10⁻¹⁵ m² with.
- **Hartmann & Moosdorf 2012**, GLiM, *Geochemistry, Geophysics, Geosystems* 13, Q12004, doi:10.1029/2012GC004370
  (checked). The global lithological map; it would let the stage run on Earth through Import (§5).
- **Cosby, Hornberger, Clapp & Ginn 1984**, *Water Resources Research* 20(6), 682–690, doi:10.1029/WR020i006p00682
  (checked; the regression used is from memory). The soil's conductivity from its texture.
- **Songs of the Eons** (SongsOfFOSS, MIT: `libsote/rock-qualities.lua`, `soils/gen-parent-material.lua`,
  `hydrology/calculate-waterflow.lua`) (read). Parent material, weathering, infiltration and the water a soil holds.
  SotE's units are abstract; their conversion to metres is this stage's own.
- **Döll & Fiedler 2008**, *Hydrology and Earth System Sciences* 12, 863–885 (checked). Global recharge, 12,666 km³ a
  year, from runoff with factors for rock, slope, soil texture and permafrost: the same build as the stage's recharge,
  and the source its recharge parameters should come from (§3).
- **Shah, Nachabe & Ross 2007**, *Ground Water* 45(3), 329–338 (checked). Extinction depth, the depth below which the
  water table no longer evaporates, by soil and cover: about 0.5–3.3 m (as transcribed by a water district; to check
  against the paper).

### Streams finer than the mesh

- **de Vries 1994**, *Journal of Hydrology* 155, 39–56, doi:10.1016/0022-1694(94)90157-0 (checked, abstract only). In
  lowlands the stream net adapts to the discharge needed to release the precipitation surplus: its density and channels
  as functions of geology and climate. The idea behind `streamMound`; its formula is not yet used (§3).
- **Horton 1945; Melton 1957** (unchecked). Drainage density by climate, rock and relief.

### By kind of wetland

- **Floodplains**: Nardi et al. 2019, GFPLAIN250m, *Scientific Data* 6, 180309 (checked). Floodplains outlined by
  relief, the same way the world over.
- **Peat**: Xu et al. 2018, PEATMAP, 4.23 million km² (checked); Gallego-Sala & Prentice 2013, *Nature Climate Change*
  3, 152–155, the climate space of blanket peat (checked). The stage's peat thresholds are its own, not yet such an
  envelope.
- **Mangroves**: Osland et al. 2017, *Ecological Monographs* 87, 341–359 (checked). Their limits follow extreme winters,
  and differ from region to region; one coldest-month threshold is a simplification.
- **Salt marshes**: Mcowen et al. 2017, *Biodiversity Data Journal* 5, e11764 (checked). 5.5 million ha mapped; global
  estimates from 2.2 to 40 million ha.
- **Classes together**: Davidson & Finlayson 2018, *Marine and Freshwater Research* 69, 1525–1533 (checked); latitude
  profile, Matthews & Fung 1987 (checked).

### Earth's totals, for comparison only

None of these is a target: they are what the same question gives on Earth, by three definitions.

| Estimate | Wetlands | What it counts |
|---|---|---|
| Classic estimates quoted by Fan et al. 2013 | 4–12 % of the land | mostly mapped wetlands |
| GLWD v2, Lehner et al. 2025 | 18.2 million km², about 13.4 % without Antarctica | 33 classes, intermittent ones too, 1984–2020 |
| Tootchi, Jost & Ducharne 2019, *ESSD* 11, 189–220 | 27.5–29 million km², 21.1–21.6 % | regularly flooded (9.7 %) plus groundwater-fed (about 15 %), the latter from Fan's model |

Tootchi et al. split flooded wetlands from groundwater-fed ones, as the stage does (`groundWetFlood`, `groundWetGW`).

## 3. The parameters, by where they come from

Each entry of `GROUNDWATER`: **lit.** from the literature; **lit. (mem.)** from the literature, value from memory, to
check; **choice** a structural choice without a source yet; **tuned** set by looking at the result against Earth's
figures, which is what "Earth is a benchmark, not gospel" asks to avoid; **measured** measured on Orogen's own planets;
**solver** a numerical setting, not a physical quantity.

| Group | Parameters (value) | Origin | Where a range could come from |
|---|---|---|---|
| Rock | `logK` (−18 … −12.5), `karstLogK` (2.2), `specificYield` (0.01–0.2) | lit. (mem.) | Gleeson 2011 table; Freeze & Cherry 1979 |
| Rock | `sote` tables | lit. | SotE |
| Young sediment | `erg`, `loess`, `till`, `floodplain` textures and `logK` | lit. (mem.) | Gleeson 2011 (unconsolidated −14 … −10.9) |
| Young sediment | `floodplainM3s` (100 m³/s) | choice | GFPLAIN widths by discharge |
| Soil | `soilRefM` (1.2 m), `soilMaxM` (3), `soilMinM` (0.1), `youngSoilM` (2), `soilSlope` (0.05) | choice | Pelletier et al. 2016 (soil and regolith thickness), unchecked |
| Soil | `rootM` (1.5 m), `awcScale` (200 mm/m) | choice | Schenk & Jackson 2002; Saxton & Rawls 2006, unchecked |
| Recharge | `permRange`, `minShare` (0.1), `span` (0.8), `soilBase` (0.4), `slopeHalf` (0.1), `frostCut` (0.5) | choice | **Döll & Fiedler 2008**: the same factors, one source for the group |
| Recharge | `bedRecharge` (0.6) | choice | ephemeral-bed recharge studies |
| Water table | `efoldM` (120 m), `efoldSlope` (150), `efoldMinM` (5 m); `shallowM[0]` (0.25 m) | lit. | Fan et al. 2013 |
| Water table | `extinctionM` (3 m) | lit. (mem.) | Shah et al. 2007 (0.5–3.3 m) |
| Water table | `evapMaxMm` (2500) | choice | — |
| Streams | `densityBase` (0.3), `densityPow` (1.3), `densityFlat`, `densityFlatMin`, `densityGlaciated`, `spacingFlatM` (2 km), `spacingSteepM` (150 m), `spacingGlaciated` | choice | measured drainage densities; de Vries 1994 |
| Streams | `streamMound` (0.75) | **tuned** | de Vries 1994's formula in its place |
| Streams | `incisionMinM` (2 m), `incisionRelief` (0.25), `incisionMaxM` (150 m) | choice | hydraulic geometry (Leopold & Maddock 1953) |
| Springs | `springSlope`, `springContrast`, `karstShare`, `karstOut` | choice | spring hydrogeology |
| Oases | `aridIndex` (0.2) | lit. | UNEP 1992 aridity index |
| Oases | `wellM` (30 m), `riverOasisM3s` (20) | choice | — |
| Oases | `oasisMm` (20 mm) | **tuned** | — |
| Floodplains | `floodM3s` (50), `floodSlope`, `floodFlat`, `floodWidthKm` (6 per √(1000 m³/s)), `floodMaxShare` (0.8) | choice | GFPLAIN |
| Coast | `coastShare` (0.12), `coastSteep` (0.3), `estuaryShare` (0.3) with `estuaryM3s` | **tuned** | coastal geomorphology (§4) |
| Coast | `coastHighM`, `coastLowM`, `coastSeaM`, `coastTypeM` | choice | — |
| Lakes | `lakeShare` (0.15) | **tuned** | shore slope and level swings (§4) |
| Lakes | `lakeSlope` (0.003) | choice | — |
| Labels | `mangroveColdC` (16 °C) | lit. (mem.) | Osland et al. 2017 |
| Labels | `peatWarmC` (6 °C), `peatWet` (0.8), `meadowWet` (0.3–0.8) | choice | Gallego-Sala & Prentice 2013's envelope |
| Scale | `slopeRefKm` (7.68 km), `slopeExp` (0.6), `reliefScale` | measured | the slope between cell centres on Orogen's relief: 4.1 m/km at 61 km, 14.2 at 7.7 km; exponent 0.55 (steep) to 0.8 (flat) |
| Solver | `outerMax` (80), `cgHeadM`, `cgMax`, `settleM` (0.05 m), `settleShare` (2·10⁻⁴), `relax`, `tDamp` (0.5), `surfacePerS`, `leak`, `drainSoftM`, `baseM3s`, `baseWet` | solver | — |

In short: 7 tuned, about 45 choices, the rest from the literature or the solver. The natural home of the physical ones,
once each has a range, is a `PARAM_PRIORS`-like table, as the climate's.

`tDamp`: each round's transmissivity is the geometric mean of the last round's and the new one. Without it a few dry
cells see-saw between their soil's transmissivity and their rock's. Tried at 10M cells with 80 passes: 0 and 0.25 do
not settle (6,872 and 1,795 cells still moving); 0.5 and 0.75 settle in 72 and 66 passes; 0.9 is slower (51 passes
against 36 at 640K). The wetlands, recharge and balance are the same to the third figure in every case.

## 4. What is missing

- **Flooded extent by season.** The finish has each river's twelve months, its regime and its flood months; the stage
  reads only the year's mean discharge, so the great seasonal floodplains (Pantanal, Sudd, inner Niger delta) are
  narrower than they could be. The flood season's peak over the mean would do, as one number per river.
- **Depressional wetlands.** The finish's hollows that hold no lake (too small or too shallow for `lakeMinKm2` and
  `lakeMinDepthM`) are where they belong; the stage does not use them.
- **Water perched on permafrost** in the boreal lowlands.
- **Coastal and lake fringes by cause**, not by fixed shares: the coast's slope, the sediment the rivers bring (the
  finish's deltas), shelter from waves (from the winds and the open sea in front), the temperature. Tides are left out:
  they would need the planet's moon.

## 5. Checking it on Earth

Import has no rocks, so the stage cannot run on Earth today. Two ways: give Import a rock map (GLiM translated into
Orogen's fourteen rocks), or check the parts one by one (recharge against Döll & Fiedler, depth against Fan's map,
wetlands by kind against GLWD v2 and Tootchi, floodplains against GFPLAIN).
