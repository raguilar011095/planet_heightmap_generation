# Design and vision audit of the redesign (branch `audits` = `redesign`, PR #147)

2026-11-06. Read: VISION.md, `docs/style-guide/` (README, maps, pages, components), `tokens.css`, the `orogen-look`
skill, CLAUDE.md's *The look*, `plans/REDESIGN_PLAN.md`; the redesign diff (`git diff origin/main...HEAD`, 110 files).
Ran `node v2/tools/check-style.mjs` (PASS). Drove every page in Chrome (Puppeteer) in Paper and Night at 1440 × 900 and
at a 390 × 844 phone: Generate and Import built once per size, Evolution built twice (one desktop history of 600 Myr
with Add detail at 160K, one phone history). No console errors on any page. Screenshots: `v2/out/audits/design-shots/`
(local only, not in git) (named below), scripts: `v2/out/audits/design-scripts/`.

## Status

Fixed on this PR (#148), 2026-11-06: D-01, D-07, D-27, D-28, D-29 and D-33, and the desktop half of D-15 (the opened
view strip stays clear of the help button). The rest are open. The before and after screenshots are local, in
`v2/out/audits/fixes/`.

## Summary

**Verdict.** The redesign reads as one brand. The masthead, the theme switch, the tokens, the layer bar, the graticule
frame, the ore families and the Studio are consistent across the four pages in both themes, and the check passes. What
is left is mostly the parts the phases did not reach: legacy controls and words that R2/R9 marked done but that still
show on the main paths, phone layout that slipped when the masthead grew to 47 px, legends that are not yet the guide's
legend card, and a guide that describes several things the app doesn't do (and doesn't describe several things it does).
Nothing found contradicts VISION.md outright. Two protected strengths are visibly dented: phones (Generate's first
screen) and, more slightly, plate editing (Rebuild over the hint).

**Top 5**
1. **D-01 (High)** On phones, on all three tools, the layer list and the help button sit 7 px under the masthead (they
   are at `top: 40px`; the masthead is now 47 px). It is the first thing on Generate's phone screen, the most
   phone-friendly tool.
2. **D-33 (High)** `preview.png`, the social image for the Studio, Generate and Import, still says "Generate, **Import
   Heightmap** and Evolution" (and an eyebrow and a globe the Studio no longer uses). A text search can't find it.
3. **D-27 (High)** Title Case is still on the main paths: Generate's "Continent Size Variety", "Land Coverage", "Terrain
   Warp", "Glacial Erosion"…, Evolution's "Starting Continent Size", "History Length", "End As", the view strip's
   "Rivers & Lakes", "By Regime", the export's "Colour Map", most tutorial headings. R9 says these were done.
4. **D-02 (Medium)** Legacy buttons were never moved onto the guide: **Export map** (37 px, muted, looks disabled),
   Import's **Import** (its page's main action: 38 px, weight 500, 8 px corners, a gradient) and **Choose image**.
5. **D-18/D-19 (Medium)** The legends: Köppen is up to 25 bare codes with no names or grouping, Food's staples are a
   chip per item, and every ramp legend (Temperature, Rain, Pressure, Currents) labels its numbers at about 7 px in a
   fixed grey on a canvas. The climate is the spine; its key is the hardest part of the screen to read.

**Count:** 3 High · 18 Medium · 16 Low (37 findings).

---

## Style guide

### D-01 · High · Phone: the top controls run under the masthead (all three tools)
- **Where:** `styles.css:1367` (`.mobile-view-switch { top: 40px }`), `styles.css:1454` (`#helpBtn { top: 40px }`), with
  `--nav-h: 47px` at `styles.css:1291`; also hard-coded `.layer-bar { top: 92px }` (1445) and `.legend-card { top: 140px
  }` (1448). Measured: switch top 40, masthead bottom 47.
- **What:** R10 raised the phone masthead from 36 to 47 px ("so its tabs are 44 px tall"), but these were left at the
  old offsets. The layer list's top edge and the "?" are cut by the double rule. Guide (Phones): tap targets 44 px;
  CLAUDE.md: overlays "must be usable within the bottom-sheet layout and not hidden". Shots: `gen-phone-paper.png`,
  `imp-phone-paper-sheet.png`, `evo-phone-night.png`.
- **Fix (S):** `top: calc(var(--nav-h) + 8px)` for both, and derive the bar's and legend's phone tops from `--nav-h`.

### D-02 · Medium · Legacy buttons on main paths, not on the guide's Button
- **Where:** `#exportBtn` `styles.css:1030-1037` (transparent, `--ui-muted` text, weight 500, 8 px corners, 37 px tall);
  `.import-btn` `styles.css:1276-1287` (Import's main action: 38 px, weight 500, 8 px corners, `linear-gradient(135deg,
  accent, accent)`); `.import-file-label` `1240-1253` (Choose image: 34 px, ink-6 % wash, muted); `.build-error-close`
  `996-1001`.
- **What:** Guide (Button): secondaries "plain buttons on `surface` with a `rule` border", 44 px at least, the panel's
  main button 50 px; "never a gradient for decoration". R2 says "Export map are secondaries on surface", but Export map
  now looks like the disabled Reapply above it (`gen-1440-paper-panel-foot.png`), and Import's primary is visibly
  smaller and lighter than Generate's Build new world (`imp-1440-paper.png` vs `gen-1440-paper-terrain.png`). The
  `og-btn` classes are in `styles.css` but no tool uses them.
- **Fix (S):** Export map and Choose image as `og-btn`; Import as `og-btn og-btn--primary og-btn--main`; Close as
  `og-btn`.

### D-03 · Medium · The Tag is drawn six ways
- **Where:** `.og-tag` 11 px / 0.14 em (`styles.css:108`); `.hero-free__tag` 14 px sentence case in gold
  (`studio.css:28`); `.evo-beta` 10 px / 0.1 em gold (`styles.css:628`); `.evo-badge` 10 px (`v2/evolution.css:118`);
  `.whatsnew-beta` 10 px 700 / 0.06 em, 5 px corners (`styles.css:1186`); `.res-kind` 10.5 px / 0.08 em
  (`studio.css:135`); `.climate-live-badge` 9 px (`styles.css:277`, unused).
- **What:** Guide (Tag): "`og-tag` (11px capitals)", a layer's tint and ink. Beta, Preview, Detailed, YouTube and Takes
  seconds are the same idea in five sizes and three letter-spacings.
- **Fix (M):** one `og-tag` with `is-<layer>` and one written-down "note" variant (see D-08); delete the dead badge.

### D-04 · Medium · The type scale is bypassed; Cormorant below 20 px
- **Where:** no page or stylesheet uses an `og-t-*` class. Cormorant at 19 px: slider values `.cg .v` (`styles.css:303`;
  the guide's `value` is 26 px), the Studio's world names `.world b` (`studio.css:111`); 18 px: Evolution's time on
  phones (`v2/evolution.css:255`); **14 px and 13 px**: every section head on phones (`styles.css:1464, 1499`). Other
  off-scale sizes: 21, 23, 24 px.
- **What:** Guide (Type): Cormorant "headings and names, 20px and up only". On phones "Shape your world", "Import your
  heightmap" and "World" shrink to 14 px Cormorant and read smaller than the text beside them
  (`gen-phone-paper-sheet.png`, `evo-phone-paper-sheet.png`).
- **Fix (S–M):** keep section heads at 20 px on phones (they have the room), and either size values to the scale or add
  a small `value` step to the guide.

### D-05 · Medium · Night: native controls stay light (no `color-scheme`)
- **Where:** nothing sets `color-scheme` (`tokens.css`, `styles.css`).
- **What:** In Night the export panel's unticked checkboxes are bright white squares, and select pop-ups and scrollbars
  use the light scheme (`evo-1440-night-export.png`). Guide: "Never pure black or pure white buttons"; both themes
  "checked".
- **Fix (S):** `:root { color-scheme: light; }` and `color-scheme: dark` in both Night blocks of `tokens.css`.

### D-06 · Medium · A second filled primary: the chip over the planet
- **Where:** `.evo-chip button` in accent (`styles.css:621-624`); its actions in
  `v2/js/evolution/evolution-main.js:863-871`.
- **What:** On a preview, choosing Satellite, Geology or Food shows the chip "…add detail to 600 Myr to see it" with a
  filled **Add detail**, while the timeline's Add detail is the view's primary and the card repeats it in outline: three
  Add details, two filled. Guide: "One primary button per view". (Traced in code; not captured in a screenshot.)
- **Fix (S):** the chip's button as the card's accent outline (or a quiet link).

### D-07 · Medium · Plate editing: Rebuild sits on the hint; on phones the readout covers it
- **Where:** `.rebuild-fab { bottom: 20px }` (`styles.css:1221`) over `#info { bottom: 16px }` (805); phones `#hoverInfo
  { bottom: 92px }` over `#info { bottom: 68px }` (1477-1478).
- **What:** After a Ctrl-click, **Rebuild (1)** lands on top of "Drag to rotate · Scroll to zoom · Ctrl-click…", the
  hint's words showing on both sides (`gen-1440-paper-edit.png`); on a phone the readout's last lines sit on the hint
  (`gen-phone-night-edit.png`). Plate editing is protected strength 8; the plan promised Rebuild "stays as obvious".
- **Fix (S):** hide `#info` while edits are pending (the readout already steps up), and lift the phone readout above it.

### D-08 · Medium · Gold, gold-ink and layer colours used beyond their roles (the `--ui-*` roles that now contradict the guide)
- **Where (the 72 remaining roles, those that bend the guide):** `--ui-warn`, `--ui-note-warm`, `--ui-beta` → `gold-ink`
  for warnings, notes and beta text (`styles.css:68-73`, used `styles.css:1176`, `v2/evolution.css:127,156-157`);
  `--ui-sun` → `gold` as text, the ☼ in the export list (`styles.css:72, 1521`); `--ui-amber` → `layer-land-ink` for the
  Detail warning (`styles.css:65, 791-795`). Directly: gold progress fills and busy tints (`v2/evolution.css:92, 144,
  166, 192`), gold bars on the Studio's resource heads (`studio.css:125`), "(pending)" in gold-ink (`js/main.js:213`),
  the Detailed badge in the Land tint (`v2/evolution.css:122`), Inspect's section bar in Rock (`generate.html:299`).
- **What:** Guide (Colour): `gold` "is ornament only… never text"; "gold text is `gold-ink`, for small-caps eyebrows
  only"; layer colours "mark the interface" (a section bar, a tab dot); SectionHead: `og-section--plain` "drops the bar
  for groups that are not a layer". The app has a real need for a "note / attention" role and a "busy / progress" role
  that the guide doesn't have.
- **Fix (M):** probably change the guide: add `note-ink`/`note-tint` and a `progress` role to `tokens.css` and the
  Colour section, then point these at them; give non-layer heads the plain head.

### D-09 · Medium · What `check-style.mjs` passes but the guide forbids
- **Where:** `v2/tools/check-style.mjs`.
- **What it does not catch** (each found in this audit): `404.html` is not in `PAGES`; font families and sizes
  (Cormorant under 20 px, D-04); literal corners and spacing (D-12); colours inside `url()` data URIs (the select arrow
  `fill='%23808890'`, `styles.css:350, 1375`); SVG `fill`/`stroke` attributes in pages and JS templates; a literal
  chosen by a ternary inside `color:${…}` (`'#4af' : '#6b3'`, `js/main.js:212`, `evolution-main.js:979`; `'#37c'`,
  `planet-view.js:527`); interface text drawn on canvas outside the four UI folders (`v2/js/climate-lab/palettes.js:65`,
  D-19); emoji (D-28); gold as a text colour; layer tokens on data (D-24); gradients built from tokens (D-02);
  `color-scheme` (D-05).
- **Fix (M):** add `404.html`; flag `--font-display` under 20 px, `var(--gold)` in `color:`, emoji ranges in UI strings,
  `url(data:…)` colours, and the ternary pattern; scan `v2/js/climate-lab/palettes.js` too.

### D-10 · Low · The focus ring is switched off in four places
- **Where:** `#seedCode { outline: none }` (`styles.css:408`) beats the global `:focus-visible` rule (93) by its id;
  `.mobile-view-switch:focus { outline: none }` (1379); `.build-error-close:focus-visible { outline: none }` (1001);
  `select:focus` rings on mouse focus too, offset 1 px (356).
- **What:** Guide: "a 2px solid `focus` ring, offset 2px, on every control". These show a border colour instead.
- **Fix (S):** drop the `outline: none`s; make the select rule `:focus-visible`, offset 2 px.

### D-11 · Low · One text role in two faces
- **Where:** hints in 11 px Libre Franklin (`.climate-hint` 283, `.import-hint` 1272, `.import-expect` 287) while the
  panel's line under the title is the guide's `note` (italic EB Garamond); What's New's body in 14 px Libre Franklin
  (`styles.css:1161`) while the tutorial's is 16 px EB Garamond (894) in the same card (`gen-1440-paper-whatsnew.png` vs
  `gen-1440-paper-tutorial.png`).
- **What:** Guide (Type): hints `note` (italic, `muted`); cards and notes `reading`.
- **Fix (S):** the hints as `note`, What's New as the tutorial.

### D-12 · Low · Corners and sizes off the scale
- **Where:** 33 literal `border-radius` values (2, 3, 4, 5, 6, 8, 11, 16, 18 px) and 91 literal `font-size`s across
  `styles.css`, `studio.css`, `v2/evolution.css`; e.g. the bottom sheet `16px 16px 0 0` (1310), the phone layer list 18
  px (1372), nav icons 6 px (175).
- **What:** Guide (Shape): "Soft corners by role" from `radius-xs` … `radius-2xl`. Mostly in the legacy blocks (export
  rows, What's New, Import, phone FABs).
- **Fix (M):** goes with D-02/D-03.

### D-13 · Low · Motion longer than the guide, and some not reduced
- **Where:** modal fade-and-slide 0.5 s (`styles.css:855, 863, 1124, 1130`), not under `prefers-reduced-motion`; the
  Studio's card glide 380 ms and fade 260 ms (`index.html:317, 319`); the sheet 350 ms (1314); the spinner keeps turning
  under reduced motion, only slower (970); the dead `@keyframes rebuildPulse` (1230).
- **What:** Guide (Motion): "State changes take 150–200ms… Respect `prefers-reduced-motion`… no cross-fades".
- **Fix (S):** 200 ms, a reduced-motion block for the modals and the spinner; delete the dead keyframes. Or record the
  longer durations for cards/sheets in the guide.

### D-14 · Low · Glyphs and off-grid SVGs as icons
- **Where:** copy ⎘ and ✓ (`generate.html:243`, `js/main.js:346`), collapse « (`generate.html:195`, all panels), Reapply
  ↻ (`generate.html:280`), Stats ▶ (`styles.css:760`), Play ▶ (`evolution.html:218`), ☼ (`export-panel.js:98`); the
  edit, refresh and Rebuild icons on a 20 / 16 px grid at stroke 2 (`generate.html:457-472`), Choose image's at stroke 2
  (`import.html:87`).
- **What:** Guide (Iconography): "Line icons on a 24px grid, 1.6 stroke… no outside icon library". ▶ is an emoji-capable
  code point and may draw as an emoji on some phones (uncertain).
- **Fix (S–M):** draw copy, collapse, reapply, play/pause and season as line icons in the set.

### D-15 · Low · The view strip runs under the help button; on phones it overflows
- **Where:** `.view-strip { max-width: min(1120px, calc(100vw - 32px)) }` (`styles.css:529`) against `#helpBtn` (834);
  phones: the last row's "Normal" select past the strip's edge.
- **What:** `gen-1440-paper-strip.png` (the "?" sits on the strip's corner), `gen-phone-paper-sheet.png`.
- **Fix (S):** cap the strip at the room left of the help button; let the river select wrap.

### D-16 · Low · Loading title in old-style figures; one wait, three progress colours
- **Where:** `.build-overlay-title` (`styles.css:971`) has no `lining-nums`: "Adding detail to 6oo Myr"
  (`evo-1440-paper-adding.png`); progress fills in ink (`--ui-select`, 1013), gold (`v2/evolution.css:92`) and an accent
  gradient (export, `styles.css:1536`).
- **What:** R3: "the moment in Cormorant (lining figures)"; the same Add detail shows an ink bar and two gold bars at
  once.
- **Fix (S):** lining figures on the title; one progress role (D-08).

## Maps and the globe

### D-17 · Medium · At home zoom the globe and its ring run under the bars
- **Where:** Generate, Import, Evolution at 1440 × 900 (the globe's home distance, `v2/js/app/globe-view.js:77`; the map
  view is fitted to the band by `js/map-band.js`, the globe is not).
- **What:** The gold ring's top passes under the masthead, the layer tabs and Climate's row sit on the globe, the ring's
  foot runs under the hint and, in Evolution, under the timeline (`gen-1440-paper-terrain.png`,
  `gen-1440-paper-climate.png`, `evo-1440-paper-building.png`). Guide: "The globe is the star: nothing sits on it but
  pins, the place marker and names"; "The degree ring circles the globe at home zoom".
- **Fix (M):** size the home zoom so globe and ring fit the same band the map uses (below the tabs, above the hint or
  the timeline).

### D-18 · Medium · The legend is not yet the guide's legend card
- **Where:** Köppen: `v2/js/evolution/climate-view.js:300-304` (a swatch, the code and a share per class, no head);
  Food's staples: a chip per staple (`v2/js/evolution/farming-view.js:255`).
- **What:** Guide (LegendCard, maps.md): "at most eight rows… Köppen groups its 30 classes under A to E… C, D, E fold";
  "Never a chip per item"; a head with its layer's bar. Generate shows 23 Köppen codes with no names
  (`gen-1440-paper-climate.png`); Food a chip per staple and the "paler/striped" note wrapped in a 3 cm column
  (`gen-1440-paper-staple.png`). No phase of the plan covers the legend's structure (R2 only restyled the card).
- **Fix (L):** a phase for the legend card: groups and names for Köppen, rows not chips, the head.

### D-19 · Medium · Ramp legends unreadable: 7 px labels, system font, fixed grey
- **Where:** `v2/js/climate-lab/palettes.js:65-66` (`fillStyle = '#8b93a7'`, `system-ui`, 17 px on a 560 × 44 canvas
  shown ~250 px wide), called from `climate-view.js:310`.
- **What:** Temperature, Rain, Pressure and Currents label their stops at about 7 px, in a grey of ~3.1:1 on `surface`,
  with hyphen-minus ("-40"), not in Libre Franklin (`gen-1440-paper-temperature.png`). Guide (RampKey): "Label the two
  ends and the middle that matters (0 °C…) with units"; text 4.5:1.
- **Fix (S):** draw only the bar on the canvas and put three HTML labels under it (`og-ramp__labels`, `meta`, `muted`),
  with "−40 °C · 0 °C · 40 °C".

### D-20 · Medium · Phones: the key doesn't fold; it covers the globe
- **Where:** `.legend-card { top: 140px; left: 8px; right: 8px; max-height: 28vh }` (`styles.css:1448`).
- **What:** Guide (Phones): "the key folds into a sheet". On Köppen the card covers the top third of the globe and its
  ring (`gen-phone-night-climate.png`). Generate's profile: "fully phone-friendly".
- **Fix (M):** fold the key into a one-line summary that opens as a sheet (or into the bottom sheet).

### D-21 · Medium · maps.md states defaults the app doesn't draw yet
- **Where:** `docs/style-guide/maps.md:7-10` ("Relief under every colour: gentle…", "The quiet sea…", "Nothing here…")
  vs plan R6 (`plans/REDESIGN_PLAN.md:359-363`, unticked).
- **What:** Köppen and the climate layers still sit on the Köppen ocean blue with full relief
  (`gen-1440-paper-climate.png`), while Deposits and Food use the quiet sea (`gen-1440-paper-deposits.png`). With the
  stack collapsed into one pull request, the guide ships describing as "the defaults" what is an open item.
- **Fix (S/M):** finish the R6 item, or mark those three bullets "planned (R6)" in maps.md until it lands.

### D-22 · Medium · Staple food uses the palette the guide marks "Fails"
- **Where:** `STAPLE_RGB` (`v2/js/evolution/farming-view.js:50`) vs `staple-*` in `tokens.css`; maps.md's table:
  "Staples before … 8.6 … 3.2 … Fails".
- **What:** The tuned `staple-*` (16.7 / 7.5) are in the tokens but not used; wild foods are a brown swatch, not
  `map-stipple`; plus the per-staple chips (D-18). Tracked in R6 as waiting on PR #88 (not merged).
- **Fix (M):** the colour swap doesn't need #88's crop work; it could land now with the stipple.

### D-23 · Medium · Plates (and Ages): generated hues, and a red–green pair
- **Where:** plate hues from `hsl()` per plate (`js/generate-plates.js:15-19`); boundary kinds Ridge `[240,60,50]`, Rift
  `[255,150,40]`, Transform `[70,205,95]` (`js/generate-plates.js:11`); Ages one hue per resource
  (`evo-1440-paper-ages.png`: Copper and Bronze potential both orange).
- **What:** maps.md: "Never generate hues"; "Check it: every pair through the colour check". Plates and Ages are open R6
  items; the boundary colours aren't in R6's inventory at all, and red ridges against green transforms are the classic
  colour-blind confusion (not measured with the validator).
- **Fix (M):** add the boundary kinds to the R6 inventory and run them through the check; the categorical eight for
  plates (as planned).

### D-24 · Low · A layer colour on data; literal data dots
- **Where:** the readout's lake dot `color:var(--layer-climate)` (`v2/js/view/planet-view.js:525`; R1 chose it); plate
  dots `'#4af' : '#6b3'` (`js/main.js:212`, `evolution-main.js:979`); river dot `'#37c'` (`planet-view.js:527`).
- **What:** "Layer colours mark the interface, never the data". A lake is data: `map-lake`.
- **Fix (S):** `var(--map-lake)` for lakes; name the land/ocean/river marks as map tokens.

### D-25 · Low · Coordinates and readout labels
- **Where:** `js/graticule-frame.js:26-27` ("30°N"), `planet-view.js:529` ("COORD 15.7°N, 87.5°W"); readout labels ELEV,
  COORD, CLIMA (`gen-1440-paper-hover.png`).
- **What:** Guide (Numbers): "Coordinates read '18.0° S, 36.0° W'"; Readout: "Real labels from the view; no paraphrase".
- **Fix (S):** a thin space before the hemisphere; whole words (Height, Where, Climate).

### D-26 · Low · The Studio's ring means something else
- **Where:** `index.html:72` (numerals 0°, 30° … 330° round a still ring), shader `index.html:395` (centred limb
  darkening).
- **What:** In the tools the ring labels real parallels and meridians (30°N, 0°, 30°S); on the Studio it is a compass
  dial that doesn't match the turning globe. VISION: "followable by those who know". The guide sanctions "numerals every
  30°" for the hero, so this may be a guide change. The hero globe also has no air rim and is lit from the centre, not
  the upper left.
- **Fix (S):** label the hero's ring as the tools do (parallels from 18° N), or say in the guide that the hero's ring is
  a dial.

## Words

### D-27 · High · Title Case on the main paths (R9 marked done)
- **Where:** Generate `generate.html:229` Continent Size Variety, `234` Land Coverage, `236` Ocean World / Desert World,
  `251` Terrain Warp, `261` Glacial Erosion (+ Ice Age, 263), `266` Hydraulic Erosion, `271` Thermal Erosion, `276`
  Ridge Sharpening; the same in `import.html:111-136`; Evolution `evolution.html:122` Starting Continent Size, `127`
  History Length, `132` End As, `165` Terrain Detail; the view strip `layer-bar.js:63` School Atlas, `82-83` Rivers &
  Lakes, By Regime; export `v2/js/evolution/export.js:35, 40` Colour Map, Rivers & Lakes; tutorial headings
  `generate.html:350, 354, 358` (Explore & Edit, Visualize Your World, Save & Share) and "Expand **Terrain Sculpting**"
  (346); `evolution.html:247, 253, 263, 289, 294` (A Planet's History, Scrub the Timeline, Look Around, Keep a Planet,
  Steer It); survey "Thanks for exploring!" (`generate.html:386`, an exclamation mark).
- **What:** Guide (Casing): "Sentence case for every button, label, heading and chip". Generate's panel now reads "Shape
  your world" over "Continent Size Variety" (`gen-1440-paper-terrain.png`, `evo-1440-paper-panel.png`). The What's New
  headings are title case too, but are the last release's record.
- **Fix (S):** sentence case throughout, then the guides that quote them (`docs/generate.md`, `docs/import.md` "Terrain
  Warp, Smoothing and Ridge Sharpening…"). Labels only: the planet code is unaffected.

### D-28 · Medium · Emoji left in the interface
- **Where:** 🔒 in Evolution's phone layer list (`v2/js/evolution/evolution-main.js:771-775`; seen: "Satellite 🔒 |
  Geology 🔒 | Food 🔒"); ⏳ in Generate's readout while it rebuilds (`js/main.js:268`); ⚠ in the Detail warning
  (`js/page-chrome.js:35-36`).
- **What:** Guide: "No emoji, anywhere". R3 says the 🔒 was replaced; it was, on the desktop tabs only.
- **Fix (S):** "Satellite (with detail)" or "— with detail" in the list; drop ⏳ and ⚠ (the warning's colour and words
  carry it).

### D-29 · Medium · Docs out of step with the redesigned UI
- **Where / what:** `docs/shared.md:17` "The Studio has GitHub and the follow links under its introduction" (they are in
  the masthead and the footer); `docs/shared.md:10` "the three tools side by side" (now a card per tool beside a map);
  `docs/generate.md:109` the edit toggle "glows green when active" (it is the accent) and "the layer list (top-right)"
  (top-left, full width); `generate.html:91` FAQ JSON-LD "exports maps up to 65,536px wide" against 16,384 in the
  featureList, the hidden block, llms.txt and the guides (pre-existing).
- **Fix (S):** update the four lines.

### D-30 · Low · "could, not will" in Food
- **Where:** "Lifestyle — how each place's people would live" (`farming-view.js:268`); the Food tab's tooltip "how its
  people would live… whether its people would farm, herd or gather" (`layer-bar.js:97`), Lifestyle's
  (`layer-bar.js:126`); the tutorial (`evolution.html:279`); `generate.html` JSON-LD and hidden block. `llms.txt`
  already says "could farm, herd or gather"; People's legend says it well ("What it could support, not how many would
  live there", `farming-view.js:285`).
- **What:** VISION: "Say what the land allows, not what its people are: *could*, not *will*". "Would" is softer than
  "will" but still says what the people do. Owner's call; flagged, not certain.
- **Fix (S):** "how each place's people could live", "whether its people could farm, herd or gather".

### D-31 · Low · The same thing in different words
- **Where / what:** the hint "Drag to rotate · Scroll to zoom" (Generate, Import) vs "Drag to turn the planet · scroll
  to zoom · hover for details" (Evolution, `evolution.html:315`); "Build new world" vs the 404's "Build a new world";
  Farmland's water "teal" (`layer-bar.js:121`) vs "aqua" (tutorial, `evolution.html:278`); the tagline with a comma in
  the guide ("Believable worlds, from the ground up.") and without in VISION, README and llms.txt; the Studio's tool
  tags mix a benefit ("Takes seconds", "Your map brought to life") with a mechanism ("Tectonic simulation"); the error
  "Invalid planet code" says what but not how to fix (guide: "Errors say what went wrong and how to fix it").
- **Fix (S):** pick one of each.

## Vision

### D-32 · Low · The tools as equals on the Studio
- **Where:** `index.html:63-66` (hero: Generate your world, primary; Evolve your world), the open card (Generate first).
- **What:** VISION: the tools "are equals in the long run… Today that is Evolution". The hero offers no way into Import,
  and Generate leads both the hero and the cards. The words are the owner's own (R10), so this is only a note: Import is
  a full scroll away for someone who arrives with a map.
- **Fix (S, optional):** a quiet third link under the buttons ("Have a map? Bring it to Import →").

**The protected strengths, as the redesign leaves them**

| Strength | Verdict |
|---|---|
| Climate depth | Every layer is there in all three tools. Its keys are the weak spot (D-18, D-19). |
| Instant, zero-friction | Fonts self-hosted, no new request; no console errors; nothing slower seen. |
| Watching a world form | Evolution's loading screens never cover the history (`evo-1440-paper-building.png`). |
| Exports and data | Unchanged; the panel is themed, its words still Title Case (D-27). |
| A true globe | Globe first, light, air and frame as the guide says; home zoom crowded (D-17). |
| Free and open source | Said in the hero, the footer and the 404. |
| Terrain aesthetics | Unchanged palettes; the atlas light reads well on Paper and Night. |
| Plate editing | Works (Ctrl-click → "Land → Ocean (pending)" → Rebuild (1)); Rebuild sits on the hint (D-07). |
| It runs on phones | Dented on every tool's first screen: D-01, D-04 (14 px heads), D-20 (key over the globe), D-07, D-15, D-28 (🔒). |

The Studio's description of each tool is accurate to what it does today (Import's "PNG, JPEG or WebP. It starts with
Earth.", Generate's "most phone-friendly", Evolution's "best on a desktop for now; its Food view is in beta").

## Brand

### D-33 · High · The social image still says "Import Heightmap"
- **Where:** `preview.png` (og:image and twitter:image of `index.html`, `generate.html`, `import.html`; JSON-LD
  `screenshot` in `generate.html:62`).
- **What:** It reads "Free, open-source planet tools in your browser: Generate, **Import Heightmap** and Evolution", the
  eyebrow "A STUDIO OF PLANET TOOLS" (the Studio says "A studio of worldbuilding tools"), and Arden (the Studio now
  turns Linmore). Every shared link shows it. The rename's only leftover outside `plans/`, and invisible to a text
  search.
- **Fix (S):** re-render with "Generate, Import and Evolution" and the current eyebrow (Linmore optional).

### D-34 · Medium · Evolution's social image is the old look
- **Where:** `assets/studio/evolution.jpg` (`evolution.html:19, 29, 54`).
- **What:** Black space, a heavy halo and a bright sun glint: what maps.md now calls "an option, never the default" and
  "no heavy glow". R9 notes it as "to replace when Evolution's look settles"; it has settled.
- **Fix (S–M):** a new 1200 × 630 card in `preview.png`'s layout with an Evolution world on `desk`.

### D-35 · Low · The 404's mark ignores the chosen theme
- **Where:** `404.html` `<img src="/assets/brand/favicon.svg">`; the SVG switches its ring by `prefers-color-scheme`.
- **What:** Night chosen on a light device: a navy ring on navy (`404-1440-dark-device-light.png`); Paper on a dark
  device: an ivory ring on ivory (`404-1440-light-device-dark.png`). Guide: "On Night the ring turns `ink`'s ivory".
- **Fix (S):** inline the mark with the `og-mark` classes, as the masthead does.

### D-36 · Low · The lockup's sizes differ from the guide
- **Where:** every masthead: mark 30 px, name 22 px (`styles.css:163`, R2's choice); hidden on phones (1294).
- **What:** Guide (Logo): "34–36px in a tool header with the name at 26px; 40–42px on the Studio with the name at 34px".
- **Fix (S):** change the guide to what R2 chose (it reads well), or the code to the guide.

### D-37 · Low · Dead assets and CSS
- **Where:** `assets/studio/generate.jpg`, `assets/studio/import.jpg` (referenced nowhere); `.climate-live-badge` and
  the `--ui-live`, `--ui-live-bg` roles (unused); `@keyframes rebuildPulse`; `--ui-busy-grey` / `-deep` (both
  `chip-track`: a flat "gradient").
- **Fix (S):** delete; retire the roles (the list only shrinks).


---

## Guide drift: what the code does that the guide doesn't record

1. **Logo:** 30 px mark / 22 px name everywhere, no lockup on phones (guide: 34–36/26, 40–42/34).
2. **The Studio (pages.md):** no utility line; the lockup at 30 px; the tools left of the follow links, not "on the
   right"; the **Resources I love** section isn't in the pattern, while Orogen Explains (off) is; the 404 page has no
   pattern.
3. **A tool (pages.md, Masthead):** Inspect and Export stay in the panel (guide: in the masthead); Rebuild and
   Regenerate are labels of the main button, not separate buttons "with their dots"; the planet code sits under the main
   button, not at the foot; the season is a dropdown (guide: Year | Jan | Jul segmented); there is no view title over
   the map, no pinned places, no finder, and no plan phase builds them.
4. **Phones:** the layers are a dropdown list, not sideways-scrolling tabs; the key is a fixed card, not a sheet; the
   readout is a floating card, not a tap-opened sheet.
5. **Controls not in components.md:** toggle switches (accent when on; the guide has only the checkbox), the view strip,
   the layer bar's fold arrow, the bottom sheet, the floating edit/refresh buttons, the Rebuild pill, the climate chip,
   the timeline, the loading screen with the logo spinner.
6. **Gold and gold-ink** for progress fills, busy buttons, beta tags, the hero's "Free and open source" tag (pages.md
   records this one; README's Colour rule forbids it), the Studio's resource-head bars, warnings and notes, "(pending)",
   the ☼.
7. **Layer tints for states:** Detailed (Land), the Detail warning (Land ink), Inspect's head (Rock).
8. **Pills for actions** (Rebuild, the timeline's actions, the Studio's footer links) where the guide gives buttons
   `radius-md` and pills only to pins and tags.
9. **Shadows not in the tokens:** the Rebuild ring (`0 0 0 4px` accent 22 %), the edit/refresh glows (`0 0 12px`), the
   timeline thumb's halo.
10. **Monospace** planet code and seed (Consolas) where `og-code` is Libre Franklin; no monospace token.
11. **Night `map-air`** differs from Paper (tokens.css) while the README says map colours "are the same in both themes".
12. **Sizes:** Studio tool tiles 42 px with a 26 px icon and names at 23 px (guide: `size-tile` 60, 30 px icon,
    `card-title` 28); section heads 20 px (`og-t-group`, missing from the README's Type list) vs `og-section` 22 px;
    slider values 19 px vs `value` 26 px.
13. **Motion:** 260–500 ms for cards, modals and the sheet (guide: 150–200 ms).
14. **The 44 px rule** contradicts itself: README Layout "Every control is at least `size-touch` (44px) tall";
    components' segmented options are `size-chip` (36 px); the app keeps 44 px on phones only (desktop controls 30–42
    px).
15. **Eyebrow spacing:** `og-eyebrow` 0.22 em (components.css, styles.css) vs `og-t-eyebrow` 0.14 em (tokens.css).
16. **"The app doesn't load these yet"** (README, components.md): `og-btn`, `og-link`, `og-seg`, `og-tag`, `og-eyebrow`
    have been in `styles.css` since R4.
17. **The hero globe:** lit from the centre with no air rim (maps.md: atlas light, a thin rim of air).

## What is consistent and works well

- One masthead on all four pages: the same lockup, tabs, gold underline, the page's one double rule, the follow links
  and the theme switch; the theme is set before the first paint and carries across pages.
- Tokens everywhere; `check-style.mjs` passes; no console errors in any run; Paper and Night swap live, the globe's
  stage (`desk`) and air with them; Stars works as an option.
- The graticule frame: calm ring on the globe, a gold frame with numerals on the flat map, the map fitted under the tabs
  (`gen-1440-paper-map.png`).
- Ore families exactly as maps.md: four hues, the metals in words with shares, a metal alone in its family's colour
  (`gen-1440-paper-deposits.png`, `evo-1440-paper-deposits.png`).
- The Studio: the tools-and-worlds layout works at 1440 and on a 390 px phone with no sideways scroll; honest notes; the
  turning globe pauses, rests off screen and respects reduced motion.
- "Import Heightmap" is gone from every text file outside `plans/` (only the image in D-33 is left).
- Evolution: one filled primary on the timeline in the normal flow, the card's outline repeat, loading screens that say
  what is happening and never cover the history.

## What I did not check

Firefox and Safari; a real phone; landscape phones and tablet widths (769–1279 px) beyond reading the CSS; downloaded
exports and planet files; a full contrast scan (spot checks only, R1–R3 report one); keyboard-only traversal beyond
reading the focus CSS; reduced motion at run time; the palettes through the dataviz validator (the red–green boundary
pair in D-23 is not measured); every Food and Geology sub-view on a phone; What's New beyond its first step; the
design-system artifact and brand canvas (private links); frame rate and build time; the climate chip's Add detail button
on screen (D-06 is traced in code).
