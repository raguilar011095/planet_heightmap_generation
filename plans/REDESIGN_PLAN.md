# The redesign: plan

Draft, 2026-11-03. R0 is built on the branch `redesign-foundations`; every later phase gets its own branch and pull
request. Tick a box when the work is done and checked, not when it is started.

## What the owner asked for

- **2026-11-01:** a design language and brand identity. Today's look is accidental: an emoji favicon, system fonts,
  123 distinct hard-coded interface colours and no colour variables.
- **Rounds 1–7 on the brand canvas** settled the look (the decisions are listed below).
- **2026-11-02:** "This all looks good basically, your defaults win. Lets work on building out a comprehensive
  styleguide". The style guide followed.
- **2026-11-03:** "I think we should do option 2, but alongside that a comprehensive checkable plan for a full on
  redesign that references the artifacts and documents." Option 2 was the style guide in the repo, plus today's
  colours as variables with no visible change, as the first step of the redesign.

## The sources

| Source | Where | Use it for |
|---|---|---|
| The style guide | [`docs/style-guide/`](../docs/style-guide/README.md): the brand book (`README.md`), [`maps.md`](../docs/style-guide/maps.md), [`pages.md`](../docs/style-guide/pages.md), [`components.md`](../docs/style-guide/components.md) with `components.css` and `components.js` | The rules every phase follows. From R0 on, the repo copy is the source of truth. |
| The tokens | [`tokens.css`](../tokens.css) | Every value: colours for Paper and Night, type, spacing, corners, lines, sizes, shadows, the fonts. |
| The design system | [claude.ai/artifact/BNodGciQr3HL9C4znZAzUR](https://claude.ai/artifact/BNodGciQr3HL9C4znZAzUR) (private to the owner) | Live previews of the twenty components in Paper and Night, the type specimens, every colour, the logo, icons and sample globes. |
| The brand canvas | [claude.ai/artifact/FB25cnVCLJfKLG4TuY1qmc](https://claude.ai/artifact/FB25cnVCLJfKLG4TuY1qmc) (private to the owner) | The boards each page follows, light and dark: **6 · Hybrid II** (Studio; tool, map; tool, globe; atlas print; blog post) and **7 · The globe and its maps** (the globe; colour by job; ores; food). Earlier rounds are history. |
| The vision | [`VISION.md`](../VISION.md) | The pillars, the protected strengths and each tool's profile (phones, speed). |
| Today's layout | [`plans/VIEW_UI_PLAN.md`](VIEW_UI_PLAN.md), [`plans/V2_EVOLUTION_UI_PLAN.md`](V2_EVOLUTION_UI_PLAN.md) | What stays where: the layer bar, the view strip, the legend card, Evolution's timeline. The redesign restyles this layout; it doesn't move it. |
| The Food view | [PR #88](https://github.com/raguilar011095/planet_heightmap_generation/pull/88) | The staple colours the guide tunes, and the view that has the most kinds to colour. |
| The voice | `brand.md` in the owner's HQ workspace (outside this repo) | Where the guide's Voice section came from. |

**Keeping them in step.** A phase that bends a rule writes the change into `docs/style-guide/` (and `tokens.css`) in the
same pull request, and into the design-system artifact. The canvas boards stay as the record of what was decided.

## Decisions already made

- **The look:** a calm modern instrument with a classic atlas callback. Engraved type, the degree ring and the print's
  frames mark the moments that present a world; rounded, quiet controls do the work. The globe is the star.
- **Per page (round 6):** the Studio and the tools are "5H with a little tweak/flair of 5A"; the atlas print is
  "firmly 5H on the layout", with the controls around it styled like the tool; the blog takes 5A's layout and flow with
  everyone else's styling.
- **Less ornament (round 6):** fewer gold-and-ink double outlines (one double rule per page, under the masthead); a muted,
  functional detail card in the tool ("it distracts from the globe itself which should be the star"); no Roman
  numerals.
- **The mark:** the stripes in a ring, "for sure (for now, we can figure out colors and other stuff later)".
- **The globe and the maps (round 7, "your defaults win"):** atlas light from the upper left, never dark; gentle relief
  under thematic colours (`1 + ½ × (shade − 1)`); one quiet sea (`map-sea`) and map paper under land-only layers; the
  stage follows the page theme (black space with stars becomes an option); a thin rim of air; the degree ring at home
  zoom; colour by the map's job, never generated hues; at most eight hues on screen; ore families; tuned staples; the
  categorical eight.
- **Themes:** Paper and Night; they follow the device, and the person can switch.
- **Type:** Cormorant Garamond for headings and names, EB Garamond for reading and the names of controls, Libre Franklin
  for every button, tab, label and number. Self-hosted.

## How it meets the vision

The redesign serves the first pillar, artistic appeal, and the boundary "Orogen's own identity". It keeps the globe
first: ornament frames the world and never the controls. The protected strengths, and how each phase guards them:

- **Climate depth:** no layer goes. Köppen and the height palettes are standards and keep their colours exactly.
- **Instant and zero-friction:** no build step and no new outside request (the fonts are served with the site, about
  200 KB, swapped in after first paint). Generate's first build must not get slower.
- **Watching a world form:** Evolution's playback stays as smooth as today; the chrome may not cost frames.
- **Exports and data:** the data exports (16-bit heightmaps, every scale) don't change. Colour exports change only
  where a map's colours change (R5, R6), on purpose, and the release notes say so.
- **A true globe:** the lighting and surround change; the wrapping and the zoom don't.
- **Free and open source:** the fonts are under the SIL Open Font License; no paid assets.
- **Terrain aesthetics:** the terrain palettes are standards and stay. Every rendering change is judged by eye, at the
  whole planet and close up.
- **Plate editing:** Ctrl-click → Rebuild, and edit mode on a phone, keep working the same way; Rebuild's "ready" state
  gets a new look but stays as obvious.
- **It runs on phones:** each tool keeps its commitment: 44 px targets, the bottom sheet, tooltips above.

**Trade-offs to know about:**
- **Paper by day.** Every tool is dark today, over black space. With the guide, someone on a light-mode device sees the
  tools on paper. That is the accepted round 7 decision; it is still the biggest change of feel for returning users,
  so the theme switch has to be easy to find.
- **The globe's lighting.** Atlas light changes how every world looks on screen, including old seeds and planet files.
  The worlds themselves don't change; their pictures do.

## Open questions for the owner

1. **The order.** Proposed: R1 palette and type → R2 tool chrome → R3 Evolution → R4 the Studio → R5 the globe →
   R6 map colours → R9 words and launch, with R7 (the atlas print) and R8 (Orogen Explains) as new features that each
   get their own plan. Change it freely.
2. **How it ships.** Proposed: R0 goes to `main` now (nothing changes on screen). R1–R6 collect on a long-lived `redesign`
   branch, one pull request per phase into it, and reach `main` together as one release, so nobody meets a half-new
   app. The release before it stays online at `/v/<major>.<minor>/` in the old look.
3. **Major or minor.** A new look across the whole site could be 3.0 rather than 2.x. Version numbers also name the
   archive folders.
4. **Night or Paper for returning users.** The guide says follow the device. An option: open the tools on Night for
   anyone who has visited before, until they choose.
5. **The Studio's turning globe.** Planned in the guide, not designed. In R4, or later?
6. **The mark's colours** ("for now"): settle before R9 makes the favicon and the social images.
7. **Orogen Explains before essays exist.** Hide the Studio's Explains row until the first essay is written, or link the
   tool guides there for now?

## The phases

Each phase stops for the owner to check it in the browser before the next starts.

### R0: foundations (no visible change)

The style guide in the repo, today's colours as variables, the tokens and fonts wired in but not used yet.

- [x] `tokens.css`, compiled from the guide's tokens: 133 colours (31 with their own Night value), the three type families,
  spacing, corners, lines, sizes and shadows, the five fonts' `@font-face`, and `og-t-<style>` classes for the
  25 type styles. Linked before `styles.css` on the Studio, Generate, Import and Evolution.
- [x] `assets/fonts/`: Cormorant Garamond (regular and italic), EB Garamond (regular and italic), Libre Franklin. Latin,
  variable weights, about 200 KB, from Google Fonts, with `OFL.txt`.
- [x] `assets/brand/`: the mark (Paper and Night) and the eight line icons.
- [x] `docs/style-guide/`: the brand book, maps and the globe, page patterns, the twenty components (markup, reference
  CSS and JS).
- [x] Today's interface colours as variables: 123 `--ui-*` roles at the top of `styles.css`, used 477 times across
  `styles.css`, `studio.css` and `v2/evolution.css`, plus the seed field's error border in `js/main.js`. Each has
  exactly the value it replaced.
- [x] The local dev server serves `.woff2`.
- [x] README (structure, dependencies, licence) and CLAUDE.md (where the look lives; new CSS uses tokens).
- [x] **Using the standard when it applies:**
  - CLAUDE.md's "The look" section, loaded in every session: the guide applies to anything a person sees.
  - The `orogen-look` skill (`.claude/skills/orogen-look/`), loaded when a change touches the interface, map colours
    or the words: what to read for the change, the rules that are easy to miss, how to colour a map, what to check.
  - `node v2/tools/check-style.mjs`: no literal colour in the pages' stylesheets, style attributes or `<style>`
    blocks; no new `--ui-*` role; no undefined `var(--…)`; no literal colour set on an element from interface JS.
  - A project hook (`.claude/settings.json`) runs it after every edit to a stylesheet, a page or interface JS, and
    reports only when something is wrong.
  - The two `color: white` left in `styles.css` became `var(--ui-ink)` (the same white).
- **Verify:**
  - [x] Resolving every `var(--ui-*)` back to its value gives the original three stylesheets exactly; no literal colour
    is left in a rule.
  - [x] Every element's computed style, and its `::before` and `::after`, is the same as `main`'s on the four pages,
    at 1440 px and at 400 px (phone emulation). The only differences are animation timing: the build spinner's
    angle and Evolution's progress bars.
  - [x] The fonts load from `assets/fonts/` when asked for, and today's pages download none of them.
  - [x] No new console errors.
  - [x] `check-style.mjs` passes on the branch, and catches one planted problem of each kind (a hex, a colour
    name, an `rgba()`, a new `--ui-*` role, a misspelt `var()`, a colour in a style attribute, one set from JS).
  - [x] The hook command, fed Claude Code's input for an edited file, reports the problems (exit 2) and stays silent
    for a clean or unrelated file. It takes effect in sessions started after it lands.
  - [ ] The owner looks at the four pages: they should look exactly as they do today.

### R1: the palette and the type on today's layout

Every page reads as World Orogen before any piece is redrawn. References: the guide's Colour and Type sections; the
artifact's Colors and Typography; the **6 · Hybrid II · tool** boards, light and dark.

- [ ] **The theme.** `data-theme` on `<html>`, set before the first paint from the person's choice (saved in the browser
  where storage works) or else the device. A theme switch beside the follow links, on every page, with the light-mode
  and dark-mode icons. `<meta name="theme-color">` for each theme.
- [ ] **The roles onto the tokens, per theme.** Point each `--ui-*` role at a token and fold the near-duplicates:
  - grounds and panels → `bg`, `surface`, `panel`, `desk`;
  - the text tiers → `ink`, `body`, `muted`;
  - the white washes and lines → `rule`, `chip-track`, `chip-on`;
  - blue selection and links → `accent`, `focus`, `gold` (the active tab's underline);
  - the build states (stale amber, ready green, regenerate red, busy grey) → kept as states, re-coloured to read on
    both themes, until R2 redraws the buttons.
- [ ] **The stage behind the globe** follows the theme (`desk`): the renderer's clear colour in `js/scene.js` and
  `v2/js/app/globe-view.js`; the stars go (they return as an option in R5).
- [ ] **The type.** Libre Franklin on every control; Cormorant Garamond on headings (the panel's title, section
  summaries, modal titles); EB Garamond on slider names, hints and notes.
- [ ] Retire every `--ui-*` role nothing uses any more.
- **Verify:**
  - [ ] Paper and Night on all four pages, at 1440 px and 400 px; screenshots side by side for the owner.
  - [ ] Text holds 4.5:1 on its ground (3:1 at 24 px and up), measured on the pages in both themes.
  - [ ] The theme carries across pages and reloads; no flash of the wrong theme.
  - [ ] Generate's first build is no slower (timed against `main` on the same seed).
  - [ ] No console errors.

### R2: the tool chrome (Generate and Import)

References: **Page patterns: A tool**; the components Masthead, Logo, Tabs, Segmented, Slider, Field, Button,
SectionHead, LegendCard, RampKey, Readout and Tag; the **6 · Hybrid II · tool, map** and **tool, globe** boards;
`plans/VIEW_UI_PLAN.md` for what stays where.

- [ ] **The masthead:** the lockup (the mark at 34–36 px, the name at 26 px); the tools with the current one underlined
  in `gold`; the follow and Ko-fi links quieter; Inspect, Export and the theme on the right; the page's one double rule.
- [ ] **The control panel:** section heads with their layer bars (Shape your world, Terrain sculpting, Climate); sliders
  as `og-slider` (the name in EB Garamond, the value in Cormorant); the `?` tips restyled and still above their trigger on
  phones.
- [ ] **The buttons:** Build new world is the one primary (`accent`); Rebuild and Regenerate are secondary, with layer
  dots; their states (stale, ready, building) keep their meaning. Rebuild's ready state must stay as obvious as today
  (plate editing is a protected strength). The phone's Rebuild and edit-mode buttons follow.
- [ ] **The planet code** as an `og-field`, with its error in words and the `--ui-error` border on a token.
- [ ] **The layer bar and Climate's row** as `og-tabs` with layer dots; **the view strip** as segmented controls
  (Globe | Map, Year | Jan | Jul) and quiet selects; its fold arrow kept.
- [ ] **The legend card** as `og-legend` (at most eight rows; Köppen grouped A to E); ramp keys as `og-ramp`.
- [ ] **The Inspect readout** as `og-readout`: everything at one place, with the view's own labels and real values.
- [ ] **The export panel, the tutorial, What's New, the build overlay and its errors, the "can't run" card:** surfaces,
  type and buttons on the tokens; no layout change.
- [ ] **Phones:** the bottom sheet, tabs that scroll sideways, the key folding into the sheet, 44 px everywhere.
- **Verify:**
  - [ ] Every control does what it did: build, Ctrl-click → Rebuild and edit mode, Regenerate, a planet code, every tab
    and Climate map, Inspect, every export.
  - [ ] Paper and Night, 1440 px and 400 px; a real phone if one is to hand.
  - [ ] Every control reachable by keyboard, with the 2 px focus ring.
  - [ ] `docs/generate.md`, `docs/import.md`, `docs/shared.md` and the tutorial match any renamed control.

### R3: Evolution's own pieces

References: as R2, plus `v2/evolution.css` and `plans/V2_EVOLUTION_UI_PLAN.md` (the minimum on screen: New World, the
timeline with Finish and Export, the layer tabs; every knob folded into Settings).

- [ ] **The timeline:** the rail (built and shown), play, speed, Finish and Export.
- [ ] **The moment and world cards, the build status, the busy states, Settings.**
- [ ] **Geology and Food:** their chips and sub-rows as segmented controls and tags in their layer's colours.
- [ ] **The planet-file drop zone.**
- **Verify:**
  - [ ] Build a history and play it; finish a moment; export; save a planet file and open it again.
  - [ ] A phone opens a link and a planet file, explores every view and exports (Evolution's commitment).
  - [ ] Playback is as smooth as on `main`.
  - [ ] `docs/evolution.md` and Evolution's tutorial match.

### R4: the Studio home page

References: **Page patterns: The Studio**; the **6 · Hybrid II · Studio** boards; the components ToolCard, EssayCard,
WorldPicker, GlobeFrame, SectionHead, Tag, Callout and Logo.

- [ ] **The utility line and the masthead** (the lockup at 42 px with the name at 34 px).
- [ ] **The hero:** the eyebrow, the headline with its italic accent phrase, the lede with three layer highlights, Begin
  with Generate (primary) and Watch a world form, the note; the globe in its degree ring with numerals every 30°. A still
  image first; the turning globe is open question 5.
- [ ] **Three ways in:** the three tool cards, with icon tiles in their layer's tint.
- [ ] **Worlds to explore:** the worlds panel (a world and a view) beside the big picture, from real renders.
- [ ] **Orogen Explains:** per open question 7.
- [ ] **The footer.**
- **Verify:**
  - [ ] Every link; Generate's old links (`/#code`) still reach `/generate`.
  - [ ] Paper and Night, 1440 px and 400 px (16 px gutter, no sideways scroll).
  - [ ] No layout shift when the fonts arrive; images sized.
  - [ ] The page's meta tags and hidden description still match what it says.

### R5: the globe and the map

References: **Maps and the globe: The globe's defaults**; the **7 · The globe and its maps · the globe** boards; the
artifact's Maps assets (`light-atlas.png` and the Arden globes). Code: `js/scene.js` and `js/map-projection.js`
(Generate and Import), `v2/js/app/globe-view.js` (Evolution); find the rest when the phase starts.

- [ ] **Atlas light** in every tool: soft, from the upper left, never dark; no night side.
- [ ] **Gentle relief under thematic colours:** `1 + ½ × (shade − 1)` in every tool (Evolution shades fully today;
  Generate draws Köppen and climate flat).
- [ ] **The quiet sea** (`map-sea`, shaded gently by the sea floor) under every land-only layer; `map-paper` for land with
  nothing to show; `map-ice`, `map-lake`.
- [ ] **Around the globe:** `desk` by theme (from R1); black space with stars as an option in the view strip.
- [ ] **A thin rim of air** (`map-air`), no heavy glow.
- [ ] **Lines:** the graticule in `map-grid`; the equator and tropics dashed in `map-tropics` (optional, useful in Climate);
  the degree ring in `gold` at home zoom, fading as you zoom in.
- [ ] **Flat maps:** the same colours and relief, without the globe's light.
- **Verify:**
  - [ ] By eye, at the whole planet and close up, on several seeds per tool and on an Earth import; before and after at
    one camera and zoom.
  - [ ] The frame rate while turning and zooming matches `main`.
  - [ ] Decide with the owner whether colour exports carry the gentle relief; check every export either way.
  - [ ] Links and planet files open the same worlds (only their pictures change).
  - [ ] `docs/shared.md` (the view) and each tool's guide.

### R6: map colours by job

References: **Maps and the globe: Colour by job**, its palettes and **Checked, not eyeballed**; the **7 · The globe and
its maps · colour by job, ores, food** boards; PR #88.

- [ ] **Every map mode, listed** with its question (a standard, how much, which side, which kind, where) and its palette,
  in this plan before any colour changes.
- [ ] **Standards untouched:** Köppen (`koppen-*`, as `js/koppen.js` draws it), the height palettes, Satellite, Rocks.
- [ ] **Ores:** by family (`ore-alloy`, `ore-base`, `ore-precious`, `ore-salt`), worth mining, and one metal at a time
  (its family's colour, richness by strength, the richest districts numbered).
- [ ] **Staple food:** the tuned `staple-*` hues, stripes for a second staple nearly as good, stipple for wild foods.
  After PR #88 is merged, or on top of it.
- [ ] **Invented kinds** (hearths, animals): `cat-1` … `cat-8` in order; never generated hues; members as words.
- [ ] **Ramps:** crop variety, when farming came, rain; temperature around 0 °C and pressure around 1012 hPa.
- [ ] **Legends, readouts and finders:** at most eight rows, members folded inside, a finder for the long tail.
- **Verify:**
  - [ ] Every palette through the colour check over every pair (normal sight 15 or more; colour-blind 8 or more, or 6–8
    with labels).
  - [ ] Each map looked at on the globe, on Paper and on Night.
  - [ ] Exported legends and colour maps.
  - [ ] Evolution's Earth farming check (`tuning/farming/earth-farming.mjs`) is unaffected: colours only.

### R7: the atlas print (a new feature)

References: **Page patterns: The atlas print**; the **6 · Hybrid II · atlas print** boards; the `paper-*` tokens.

- [ ] Its own plan, and the owner's go-ahead, before anything is built: which tools first, the plate's exports (PNG and
  PDF at print size), where place names come from, and how it sits with the export panel.
- [ ] Then, per that plan: the plate (18 × 12 inches, landscape) on Ivory or Midnight; the title row, the main map in its
  double neatline with degree numerals, the globe inset in its gold ring, About this world, the key, Places named, This
  plate; the controls around it styled like the tool.

### R8: Orogen Explains (a new section)

References: **Page patterns: An Orogen Explains essay**; the **6 · Hybrid II · blog post** boards; the components
EssayCard, Sidenote, Callout and Tag. VISION: the learning happens in the guides, and the Studio links them.

- [ ] Its own plan, and the owner's go-ahead: who writes the essays, which come first, the page template (static HTML,
  no build step), figures, and what each essay's search tags say.
- [ ] Then, per that plan: the essay page; the Studio's Explains row; the sitemap.

### R9: words, icons and the launch

- [ ] **The favicon and app icons** from the mark (16 and 32 px, 180 for Apple, 192 and 512 in `site.webmanifest`),
  replacing the emoji; the manifest's colours.
- [ ] **The social image** (`preview.png`) and `assets/social.svg` in the new look; `theme-color` per theme.
- [ ] **The 404 page.**
- [ ] **The README's front door**, the guides in `docs/` (words and pictures), the three tutorials.
- [ ] **What's New:** ask the owner; if yes, bump `VERSION` in `initWhatsNew()` (`js/main.js`).
- [ ] **SEO and AISEO** (`generate.html`'s head, JSON-LD and hidden block; `llms.txt`) where the words change;
  `sitemap.xml`'s dates.
- [ ] **The release:** the outgoing release archived at `/v/<major>.<minor>/` as usual; the version per open question 3.
- [ ] **The announcement** is HQ's work, in its own workspace.
- **Verify:**
  - [ ] Every rule in `CLAUDE.md`'s Key Rules checked.
  - [ ] A real phone; Firefox and Safari as well as Chrome.

## Every phase is done when

- [ ] It follows the style guide; anything it bends is written back into `docs/style-guide/`, `tokens.css` and the
  design-system artifact in the same pull request.
- [ ] Its CSS uses tokens and no literal colours: `node v2/tools/check-style.mjs` passes.
- [ ] Paper and Night, at 1440 px and 400 px, checked in Chrome, with screenshots for the owner.
- [ ] Controls are 44 px or more on phones; tooltips sit above their trigger; the bottom sheet holds what it should.
- [ ] Every control shows the focus ring; nothing moves under `prefers-reduced-motion`.
- [ ] Text holds 4.5:1 (3:1 at 24 px and up); marks and borders that carry meaning hold 3:1.
- [ ] No console errors; Generate's first build and Evolution's playback no slower.
- [ ] The docs `CLAUDE.md` asks for are updated; What's New is asked about at the end.
- [ ] The owner has checked it in the browser.

## Status

- **2026-11-03:** R0 built and checked (above), on `redesign-foundations`: PR #92.
