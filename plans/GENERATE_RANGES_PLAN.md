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
changes. Each range is built from:

1. **A skeleton.** The outline is taken as a chain (its longest path, plus any long branch) and smoothed into a curve by
   a Gaussian of at least 260 km, its style's share of its width, or 4.5 % of its length. Bends become broad arcs
   (≥ ~1000 km): a range bends but doesn't meander.
2. **Segments.** The curve is cut into overlapping segments, each:
   - turned a few degrees about its middle (en echelon, the same way all along the range);
   - set off sideways a little and bowed into an arc;
   - widest and highest toward its middle, tapering to points (a lens: the Alps, the Caucasus).

   One segment per range is the massif and a few are gaps.
3. **A style**, by what raised the range and a roll of its own, written as one of Evolution's kinds of belt, so the
   rocks, deposits and hover read it as they read Evolution's:

   | Style | Belt | Looks like | Most often |
   |---|---|---|---|
   | spine | Ural, a long side and a short one | the Alps, the Caucasus | young welds, seams |
   | plateau | Himalayan, upper and lower | Tibet, the Altiplano | young welds |
   | folds | Ural, wide and low | the Valley and Ridge, the Zagros | dockings, old welds |
   | blocks | intraplate | the Tian Shan, the Laramide ranges | seams, small terranes, the far field |
   | sliver | transpression | the Transverse Ranges | dockings, seams |
   | knots | Ural, short and scattered | the Massif Central | small terranes |
   | rift | rift shoulders and valley | East Africa | today's rifts |

4. **Its own height.** spreadBelt takes a height multiplier per source (`amps`), so a range rises and falls along its
   length and each range has its own height. This is the one shared-code change. Evolution passes none, and its finish
   hashes identical (`ALL 5249565`).
5. **Rifts** as chains of basins. The valley is cut along the smooth line itself (signed distance, `present/rifts.js`),
   not along the cells. Each basin is a half-graben whose high shoulder flips from side to side. A basin is deepest where
   the plates open fastest and missing where they barely part (`riftOpenMin` and `riftOpenFull`, km/Myr), so a rift dies
   out toward its slow end.

**Kept as built:** today's collisions and transpressions. They follow plate edges too, but they're wide and high
enough to read as massifs, not worms. Reshaping them made them thinner and lower (tried, reverted).

## Numbers (check-present, 290/290)

- Crest tiers: 4.9 km at today's plate edges, 2.6 along the seams and 1.45 on the old orogenies (× 1.9, × 1.8). Before:
  5.0, 3.0 and 1.7.
- Coasts walled (≥ 1.5 km within 300 km): 34–53 %. Before: 46–55 %.
- Docked arcs `recAccretedArcShare` 0.45 → 0.36. The spines, blocks and slivers bare more of the docked arcs' rock, and
  at 0.45 the supercontinent's copper (16 %) passed a third of its iron (Evolution's bound). Now 12.6 %, and the
  default planets' volcanic rock is 3.2 %.
- Sutures stay on the outlines where the pieces met; the ranges stand on their curves beside them. Flagging the
  ranges' cells instead put seed 10's orogenic gold at 2.1 % (bound 2 %).
- Evolution unchanged: finish hashed `ALL 5249565`, as before; check-save passes.

## Open

- The owner's look in the browser (dev server, any planet; theirs: `#m7yrtxgw7ehxm7mhtcbowq`).
- Phone-size: not affected (no UI change).
- Next, if wanted: more texture inside the old uplands (the original Generate's ridged massifs), and rifts that branch
  around a craton (East Africa's two arms).
