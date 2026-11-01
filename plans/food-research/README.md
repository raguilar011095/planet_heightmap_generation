# Food redesign — research notes (2026-10-31)

The research behind `plans/V2_FOOD_PLAN.md`, in four passes. Each file marks its confidence per claim and lists its
sources:

- `domestication.md`: where and why farming began, covering seasonality (Matranga), volatility (Ashraf & Michalopoulos),
  surplus (Kavanagh), big seeds (Blumler) and hilly flanks. It also covers each archetype's wild ancestor and its habitat,
  animal domestication (Zeder's three pathways), beasts against landmass size and extinction, how many centres there
  were and how far apart, and the models.
- `food-systems.md`: Whittlesey, Dixon, Leff and Ruthenberg; forager rules (Binford's ET, Tallavaara, the sedentary
  foragers); the Ethnographic Atlas and D-PLACE, with an analysis of their 1,291 societies by ET, rain and animal; herd
  animals' limits; the tsetse belt; pre-1492 staples; and Earth datasets with their licences (ArchaeoGLOBE, GLW, MapSPAM,
  GAEZ, Galor–Özak, HYDE). Its §7 proposes the classes.
- `food-culture.md`: cooking fats, drinks, sweeteners, spice (Billing & Sherman, Bromham), preserving, salt, dairy and
  lactase, the hungry season, harvest festivals, the food-and-society theories, and why Europe's food maps read well.
- `worldbuilding-and-games.md`: what worldbuilders ask (Madeline James, Stack Exchange, Mythcreants, Worldbuilding
  Pasta); food map modes in EU4, Imperator, Victoria 3, Civ, Anno, RimWorld and Dwarf Fortress; what other generators do
  (Azgaar read from source); the real food maps that grip people; and ten distinctive map ideas.

`scripts/`: the analysis scripts behind `food-systems.md` §3 and §6 (`env.mjs` and `binford.mjs` take the folder holding
D-PLACE's CLDF downloads as their argument) and the hearth-spacing sum in `domestication.md` §4.2 (`spacing.py`). The
D-PLACE data are CC BY-NC and are not kept here: download them again from github.com/D-PLACE (`dplace-dataset-ea`,
`dplace-dataset-binford`).

The earlier crops research (about 200 crops, ECOCROP ranges, spread speeds, wild rice, lost crops) is on branch `crops`:
`plans/V2_CROPS_RESEARCH.md`.
