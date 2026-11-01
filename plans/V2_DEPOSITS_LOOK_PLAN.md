# Deposits: shaped by the geology, as common or rare as they are

Owner, 2026-10-31: the deposits "really look like noise everywhere … not just blobby/uniform/the same scale"; gas, oil and
coal "too isolated and only in tropics (mostly for oil)"; "unrealistic scarcity on some things, like stones/building
materials and some things like iron which id expect to be in most mountains … but also like all the cratons just look
FULL of iron"; and "it should still be realistic though, not just noise fixing all our problems".

Branch `worktree-deposits-look` off main (b9eb7fe). Bench: `v2/tools/render-deposits.mjs` (three moments — 432175 at 300
Myr, 2024 at 900, 542650052 at 2180 — at 2.5M; the page's own Deposits and Ages painting; the numbers by metal, latitude
and setting) → `v2/out/deposits/index.html`, any two phases side by side or blinking. `--reuse-finish` re-runs only the
deposits (the finish keeps their inputs: finish.js `inspect`), ~3 s a moment.

**Status 2026-10-31:** D0 (with the owner's picks), D1, D1b, D2, D3 (rendered with D2) and D4 built, uncommitted; R
dropped. check-geology 55/56 (the deposits stage over its 10 % of the finish: ~11 %, the new shapes' cost — owner to
decide), check-save (new fixture, finish v2 with a step from v1), check-farming pass. Along the way: D1's coal window
first subtracted the erosion since the basin was deepest, which the start world's platforms seed at a third of their
cover — new coal on them cut away; now measured from the present cover's top. D2's oil was choked by two old rules: the
oil window read at the column's full thickness (a thick basin judged overcooked) and a 100 Myr keeping time (no
Paleozoic oil) — now a window somewhere in any thick basin, and 180–480 Myr.

## What the base renders show (phase `base`)

- **Every deposit is the same round blob.** A system's richness is its record field, blurred to ~60 km, times one
  isotropic noise of one wavelength (140–400 km by system) and a 1000 km province noise. The Rocks map beneath has
  valleys, folds, keels and bed outcrops; the deposits ignore all of it.
- **"Cratons full of iron" is oolitic ironstone, not banded iron.** Ironstone covers 16–18 % of all land (moderate+ 6–7 %):
  every platform that was ever under an inland sea for 4–30 Myr, at 35 % of its ground. Iron laterite adds 7–11 %, bog
  iron 4–6 %; banded iron is 1.6 %. Real oolitic ironstones are thin beds (2–5 m) of particular high-sea-level intervals —
  the Minette, Cleveland, Clinton — a few % of a platform at most, in outcrop bands.
- **Mountains have almost no iron**: only skarn (district share 0.07, × 0.5 for iron) and IOCG at an Andean front.
- **Oil and gas**: source rock is laid only in *restricted inland seas* (≥ 400 km from the open ocean) × the sea's stand ×
  warmth (gone poleward of ~27° palaeolatitude), or young rift lakes. Oil is 0.4–3 % of land, by |lat| 16 % at 0–15° vs
  ≤ 4 % past 30° (900 Myr world). Shelves, deltas and forelands make none.
- **Coal** forms only in the forelands of *active* ranges and young rifts, in a wet belt.
- **Coarse record**: coal and source rock are kept as a 0–15 step of their share of the cover's top. Coal's share is ≤ 0.12,
  so it is stored as 0, 1 or 2 — weak coal rounds to none; source rock's (≤ 0.35 × stand × warmth) often rounds to 0.
- **Building stone has holes over basalt, andesite and tuff, gneiss, schist, greenstone** — none of them counts as building
  stone, though all are built with. Stone Age tool stone is flint on limestone only, as speckle.

## The approach

Shapes come from the geology the Rocks map already draws; noise only breaks a shape into its districts (and wanders its
edges), never makes the shape. Each rule a smooth weighting with a physical reason. Abundance stays calibrated: iron and
stone common, gold, tin and gems scarce (at or under today's shares).

## Phases (each: before/after renders, the numbers, check-geology updated, then a stop for the owner's verdict)

Owner, after the first draft: "add D1b, but also add in some ways to make more fundamentally 'interesting' and varied
shape noise underlying all of this" → D0 first (the noise every later phase breaks its shapes with), D1b after D1.

### D0 — District shapes: the noise underneath, varied and structural

Today one isotropic noise of one wavelength per system, thresholded: every district the same round blob. Instead
(geology/district-shapes.js, its own seeded stream; every length in km):
- **Clusters of clusters** — a multiplicative cascade (a shared province octave × the system's own two or three),
  thresholded at an exact share: a few big districts, many small ones, small ones gathered round big ones — the fractal,
  lognormal way real deposits are spaced (Carlson 1991; Agterberg's multifractals), not one size.
- **Drawn out along the grain** — stretched along the local structure: a belt's strike (the across-belt distance the
  record keeps, as the Rocks map's fold stripes use it), a shield's trend (its craton's axis), elsewhere a slowly turning
  grain of its own. Lenses and chains along a belt, not discs.
- **Lineaments** — fault corridors: lines along the grain (shear zones: orogenic and greenstone gold, jade, emerald) and
  a crosscutting set (transverse faults: where one crosses a belt its districts gather — the Andes' transverse lineaments).
- **Bent and lobed** — a fractal warp of the position (two scales), so outlines wander, lobe and fork.
- **Regions differ** — a slow field sets how lumpy each region is: here few rich districts, there many poor ones.
- **Coupled by association, not one field** (owner: "all of the deposits are very correlated … worth trying to
  decouple") — the province octave, the lineaments and the lumpiness are each an association's own (copper-gold of arcs,
  lead-zinc of basins, oil-gas-bitumen, the laterites, peat and bog iron…; any other system its own), shared with the
  rest only by `coupling` (their correlation, 0.2).
- Options to pick from: `v2/tools/render-district-options.mjs` → `v2/out/deposits/options/index.html` — each scale at
  three levels (size variety, along the grain, fault lines, bent outlines, district size, coupling, inner breakup) and a
  few combinations, on the same places, beside today's.
- Recipes by setting: belt, shear, craton, basin, surface, stone (config `deposits.shapes`); each system's spacing and share
  as now (`deposits.district`), its thresholds calibrated on the sphere so its share holds; rich cores the top ~15 % of a
  system's districts. Kimberlite and intrusion spots read the warped position (irregular spots).

### D1 — The sediment's deposits are beds: they crop out as the rocks do

Coal measures, oolitic ironstone, oil shale and bitumen, and old salt become beds in the cover's column, exposed where the
finished surface cuts them — the same surface-meets-column depth the Rocks map uses (rocks.js `s`, its valleys, folds and
the far field's arches), handed from classifyRocks to the deposits per cell. So a coal field is a band round its basin and
up its valleys, kept in the synclines of a fold belt (the anthracite fields) and gone from the anticlines; under younger
beds it is buried (deeper reach: Industrial), not drawn as exposed. Ironstone: a thin bed at a level of the marine cover —
narrow outcrop bands on the platform's scarps and valley sides, not its whole surface.
Expect: iron off the platforms (ironstone 16–18 % → ~3–5 % of land), coal following basins and outcrops.

### D1b — Weathering and wetland deposits follow the ground

The climate's deposits (iron laterite alone 7–11 % of land, bauxite, nickel laterite, peat, bog iron, salt flats) are today
climate × the district noise. In nature they follow the ground: laterite and bauxite are duricrusts capping old, flat,
well-drained uplands — plateau tops and interfluves, broken where valleys cut through (West Africa's and Australia's
mesas); stripped from steep scarps and young belts. Peat and bog iron lie on flat, badly drained ground at the drainage's
level — valley floors, floodplains, lake margins, the hummocky till of the last ice. Salt flats in the lowest closed pans
of dry country. From the finished terrain: height above the nearest drainage, flatness over a few cells, the surface's age
(the record's quiet time), the rivers and lakes — D0's noise only for the thickness along them.

### R — The rocks' own patterns — dropped

Proposed (facies in belts across a basin, plutons of many sizes); owner, 2026-10-31: "i changed my mind dont do the rocks
just do the rest of the ore things". The Rocks map stays as it is.

### D2 — Oil, gas and coal where real basins have them (the history's record)

Records only (tectonics byte-identical; check-geology runs both ways). Source rock also on shelves at a high stand
(upwelling, anoxic events), in cooler seas (less), and land-plant mud in deltas and forelands (gas-prone); warmth decides
oil versus gas more than whether there is any (Bazhenov at ~60° palaeolatitude, the North Sea, the North Slope). Coal also
on coastal plains behind shallow seas and in slow inland sags of a wet belt (Illinois, the Ruhr), not only active
forelands. Coal and source rock stored as the share of coal measures / source-rock interval (up to ~0.6), not of pure coal —
full use of the 0–15 steps; what a saved number means is unchanged, so no frame-version bump.
Finish: fields gather on structural highs — the fold belt's anticlines (trends along the front: the Zagros), the platform's
arches, salt — gas in the deep basin centres, the shelf offshore. Histories re-run (~5 min for the three).

### D3 — Ore along the structure

Belt-hosted systems (porphyry, epithermal, orogenic gold, tin, VMS, skarn, pegmatites) as strips parallel to their belt, by
the across-belt distance the record keeps (as the Rocks map's fold stripes use it): the Andean zoning (iron and IOCG at
the front → copper-gold on the arc → lead-zinc-silver → tin inboard), orogenic gold along sutures and the belt's main
thrusts. Strips segmented along strike into chains of districts, clustered within — several scales, so a few large districts
and many small ones. Greenstone gold and banded iron in the keels and craton-edge basins the Rocks map draws, not the
whole craton. At the paint, a district's wash follows its host rock on the Rocks picture (skarn on granite–limestone
contacts, greenstone gold on greenstone): crisp geologic outlines instead of the 0.25° grid's soft squares.

### D4 — Iron and stone, as common as they are

Iron in most mountain belts, each its kind: magnetite skarn at granite contacts, hematite–siderite veins and replacements
in a fold belt's limestone and slate (Erzberg, Bilbao, Siegerland, Elba), magnetite–apatite along arcs (Kiruna, Chile's iron
belt) — mostly poor to moderate, a few rich; banded-iron "iron ranges" along keels and craton margins, richest where deep
weathering enriched them (Hamersley, Carajás). Building stone wherever there is rock, on the Rocks picture's own outlines —
basalt, andesite and tuff, gneiss, schist, greenstone added; mud brick and clay on the plains. Stone Age tool stone broadly
(chert in limestone, shale and greenstone, quartzite, basalt and greenstone for ground axes, obsidian at young arcs), rich
at the best sources, absent on the big alluvial plains (as in Mesopotamia).
New kinds of deposit change the deposits' rows: FINISH_VERSION 1 → 2 with no step (an older file's detailed moment is
detailed again on opening; its history opens as ever); check-save.

## Not changing

The page's look (paper, ink contrast, legends), the Ages' reach and cut-offs, the readout, the exports' formats.
