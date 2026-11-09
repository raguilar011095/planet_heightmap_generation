# The atlas print: plan

Draft, 2026-11-03. Phase R7 of `plans/REDESIGN_PLAN.md`. Nothing is built until the owner answers the questions below
and says go.

## What it is

A plate to print or hang: a finished world laid out as an old atlas sheet, from the **6 · Hybrid II · atlas print**
boards on the brand canvas (the owner: "5H atlas is actually the best. Its the most unique design IMO. I like the right
aligning and the old style together"). The layout is the guide's (`docs/style-guide/pages.md`, The atlas print):

- **The plate:** 18 × 12 inches, landscape; a hairline frame inset 18 px; the title row ("THE WORLD OF" in gold capitals
  over the world's name at 50 px, the line beneath right-aligned in italic) and a hairline under it; the main map in a
  double neatline with degree numerals; the globe inset in a gold ring with its caption; About this world; then a double
  rule and three columns: Key, Places named (small capitals), This plate ("Drawn by World Orogen · orogen.studio").
- **Papers:** Ivory (`paper-ivory`, `paper-ink`, `paper-gold`) and Midnight (`paper-midnight`).
- **Around it, the tool's look:** a masthead with "Evolution / Atlas print", a status line and **Print this plate** (the
  primary); a panel with The plate (Map, Main map, Globe faces, as segmented controls), The words (Title, Line beneath,
  About this world, Place names) and Paper. The plate lies on `desk` with `shadow-paper`.

## How it meets the vision

- **Exports and data** (a protected strength): a new export, beside the export panel, not instead of any of it.
- **Artistic appeal** (the first pillar): the print is where Orogen's look is most its own.
- **Generator, not editor:** the words are the person's (a title, names); the map is the world's. Naming places is the
  nearest the tools come to editing; the plate takes names as text, it never redraws the land.

## Questions for the owner

1. **Which tools first?** Evolution's finished moments only (they have rivers, rocks, satellite) — or Generate and
   Import too?
2. **Where does it live?** A page of its own (`/atlas`, opened from a finished moment with its planet file or link), or a
   full-screen view inside each tool?
3. **What comes out?** PNG at print size (18 × 12 in at 300 dpi is 5400 × 3600 px), PDF, or both? (Both can be drawn in
   the browser; PDF needs a small library or a hand-written writer.)
4. **Place names:** typed by the person, placed by clicking the map? Or Orogen's own names (it already names landmasses
   and districts in Geology) as a starting point the person edits?
5. **The key:** the main map's own legend (one view: Terrain, Satellite, Köppen, Rocks…), or a fixed set?
6. **Phones:** make the plate on a phone too (VISION: phones explore and export), or desktop-first like building a
   history?

## Phases (once answered)

- **P1:** the plate drawn from a finished moment in one view, Ivory, fixed words; Print this plate saves a PNG.
- **P2:** the words and the place names; Midnight; the globe inset's faces.
- **P3:** PDF (if wanted), the other views, phones as decided; docs, the tutorial, What's New (asked).

Each phase stops for the owner to check it.
