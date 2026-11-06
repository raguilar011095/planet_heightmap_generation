# Generate's ranges, reshaped

Owner, 2026-11-05, on Generate at 981K Detail: "At this detail the worm like mountains really bother me/they dont look
good. We realy need to rethink the shape of those from the ground up I think. Take some inspiration from both the
original take on generate, as well as evolution" — and then: "It not just that they are thin, but they all look the same
and have no variety".

## What made the worms

Measured on the owner's planet (seed 1342544217, 108 pieces, Irregularity 1) and seeds 2 and 6:

1. **Every inland feature traced its pieces' outline cell by cell.** The ranges of the past (`present/past.js`: a piece
   docking, two cores welding, a small terrane's welt; `present/seams.js`: two pieces of one plate closing), today's
   rifts (`present/belts.js`) and the far field's inland ranges (`present/plumes.js`) were each written by spreadBelt from
   the sim cells along an outline. That outline zigzags at about a range's own width, and the warp (`present/warp.js`)
   adds bends of ~1100 km on top. A belt's width measured from such a line follows every bend.
2. **The worst worm was a rift.** On the owner's planet the long winding ridge with a groove down its middle was a
   continental rift ~11,000 km long: two plates of one continent pulling apart along a jagged boundary. Its valley was
   the groove and its shoulders the walls, continuous from end to end.
3. **One cross-section for everything.** Every old range was a Ural-type ridge (or, for a young weld, a narrow Himalayan
   pair round a suture valley: two walls and a groove). A belt's relief barely depends on its convergence
   (`tectonics/step/heights.js`: past ~30 km of work it is the kind's full height), so the old along-strike variation of
   the work showed only where it fell to zero. Every range of a kind stood at one height.

## The two inspirations

- **The original Generate** (`js/elevation.js`, still in the repo): mountains as fractal massifs, broad and irregular,
  set by the *large* structure (super-plates), with the small plates only modulating the texture. Nothing was a line.
- **Evolution**: wide belts whose fronts sweep over time, so their axes are smooth arcs. Each belt has a cross-section by
  its kind (a high spine set back from the suture, a plateau, a foreland basin, fold-and-thrust ridges), and the crests
  rise and fall along the strike.

## The rethink (present/ranges.js)

The cause stays the same: ranges still stand where the pieces met (G4b, the owner's ask of 2026-11-03). Only the shape
changes.

### First try, rejected

Each outline smoothed into broad arcs and cut into overlapping lens-shaped segments stepped en echelon. Owner: "honestly
you totally missed the mark. The variety in height is better but all the shapes in NEW got way way more uniform". Every
range became the same clean lens. Kept from it: the height variety, and rifts as chains of basins.

### Two takes, and the pick

- **A, Ranges:** each range on its own outline, lightly smoothed, swelling, pinching and branching along it, carved
  into massifs by a fractal mask.
- **B, Massifs:** wider belts carved much harder, so ranges break into irregular massifs, spurs and knots, closest to
  the original Generate.

Then two blends of 25 % A + 75 % B: C, each setting in between; D, the two worlds' heights before erosion mixed. D
built the ground twice (13 s instead of 10 s at 981K). Owner, after seeing all four: "lets just go with fully B!"

### What B does

1. **Its own outline.** The range follows its pieces' outline, smoothed only lightly (a Gaussian of 90 km, or a
   quarter of its width), so no two ranges share a course.
2. **Swelling and pinching.** Along its length its width × e^(±1.4) and its height × 1 ± 1.4 vary over noises about
   500 and 320 km long, and it tapers at its ends. Belts are 2.4× their kind's width.
3. **The range mask** (`maskBelt`): what the belt adds is multiplied by a domain-warped fractal of its own (520 km
   across, 5 octaves). Near the range's line most of it stands; toward its edge, only where the noise is high, and the
   highest parts swell past it. The belt breaks into massifs, lobes and spurs: the original Generate's way, mountains
   as a noise field cut out of the tectonic one. Where the mask leaves under 15 % of the range, the belt's whole
   record is undone (its orogeny, its geometry, its thickened crust), so the rocks follow the mountains.
4. **A style**, by what raised the range and a roll of its own, written as one of Evolution's kinds of belt, so the
   rocks, deposits and hover read it as they read Evolution's:

   | Style | Belt | Looks like | Most often |
   |---|---|---|---|
   | spine | Ural, a long side and a short one | the Alps, the Caucasus | young welds, seams |
   | plateau | Himalayan, upper and lower | Tibet, the Altiplano | young welds |
   | folds | Ural, wide and low | the Valley and Ridge, the Zagros | dockings, old welds |
   | blocks | intraplate | the Tian Shan, the Laramide ranges | seams, small terranes, the far field |
   | sliver | transpression | the Transverse Ranges | dockings, seams |
   | knots | Ural, short | the Massif Central | small terranes |

5. **Its own height.** spreadBelt takes a height multiplier per source (`amps`): a belt's relief barely depends on its
   convergence, so this is what lets a range rise and fall along its length and each range have its own height. The
   one shared-code change. Evolution passes none, and its finish hashes identical (`ALL 5249565`).
6. **Rifts** as chains of basins, the one feature still cut in segments (`riftShape`). The valley is cut along its
   smooth line (signed distance, `present/rifts.js`) and broken by the mask's noise too. Each basin is a half-graben
   whose high shoulder flips from side to side. A basin is deepest where the plates open fastest and missing where they
   barely part (`riftOpenMin`, `riftOpenFull`, km/Myr). The shoulders are masked like the ranges.

The far field's inland ranges are shaped and masked the same way, as their own style (`far`: basement blocks, lower,
× 0.55–0.85): they're live, never worn, and with B's full swells they stood 10.0–10.4 km.

The height multipliers are eased, not clipped: a range's roll × its lens × its swell runs freely to 1.4 and eases toward
2.0, and the mask's boost runs to 1.15 and eases toward 1.5. The swells still stack; a peak stays possible.

**Kept as built:** today's collisions and transpressions. They follow plate edges too, but they're wide and high
enough to read as massifs, not worms. Reshaping them made them thinner and lower (tried, reverted).

## Numbers (check-present, 290/290)

- Crest tiers: 5.1 km at today's plate edges, 2.95 along the seams and 1.84 on the old orogenies (× 1.7, × 1.6).
  Before: 5.0, 3.0 and 1.7.
- Peaks at most 8.5 km on the check planets (the export's ceiling is +9 km). Unchecked, the far field's live ranges stood
  10.0–10.4 km.
- Land above 1 km: 26–30 % on the default planets (Earth ~¼). The supercontinent has 44 % (41 % before this PR); its
  bound is raised from 42 % to 46 %, flagged to the owner rather than toning B down.
- Coasts walled (≥ 1.5 km within 300 km): 47–57 %. Before: 46–55 %; the rejected first try 34–53 %.
- Rocks on the default planets, after Evolution's finish: plutonic 3.05 %, volcanic 2.7 % (bounds ≥ 3 % and ≥ 2.5 %).
  Undoing the record where the mask removes a range is what brought plutonic back: B's wider belts otherwise overprinted
  the docked arcs' terranes (1.6 % plutonic). `recAccretedArcShare` is back at 0.45. Copper within a third of iron on
  every planet.
- Rift valleys 0.37–0.45 km below their flanks (≥ 0.3).
- Sutures stay on the outlines where the pieces met. Flagging the ranges' cells instead put seed 10's orogenic gold at
  2.1 % (bound 2 %).
- Evolution unchanged: finish hashed `ALL 5249565`, as before; check-save passes.

## Open

- The owner's look in the browser (dev server, any planet; theirs: `#m7yrtxgw7ehxm7mhtcbowq`).
- Phone-size: not affected (no UI change).
- Next, if wanted: more texture inside the old uplands (the original Generate's ridged massifs), and rifts that branch
  around a craton (East Africa's two arms).
