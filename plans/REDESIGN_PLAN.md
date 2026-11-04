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

**Decided 2026-11-03.** The owner: "lets actually set up continuous PRs for the whole project here. do it continuously
through". So the phases run one after another without a stop between them, and the open questions take their proposed
answers:
1. The order as proposed.
2. **Stacked pull requests**, one per phase, each on the one before (R1 on R0's branch, R2 on R1's, …), so they can be
   reviewed and merged in order; nothing reaches `main` until the owner merges.
3. The version is settled in R9.
4. The device decides; the switch is always one tap away.
5. A still image first; the turning globe later.
6. The mark as it is.
7. The Explains row stays off the Studio until the first essay exists.

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

- [x] **The theme.** `js/theme.js`, a classic script in each page's `<head>` before the stylesheets, puts a saved
  choice on `<html>` (`data-theme`) before the first paint; otherwise the device decides. The switch sits at the top
  bar's far end on every page, phones included (a moon on Paper, a sun on Night; a 44 px target in the 36 px phone
  bar). `<meta name="theme-color">` for each theme, and the chosen one when the switch has been used.
- [x] **The roles onto the tokens, per theme.** Every `--ui-*` role now points at a token, or a mix of one with
  transparency, so both themes follow:
  - grounds and panels → `desk` for the page behind the globe, `bg` for the floating panels (94–97 %), `surface` for
    tooltips, menus and cards, `chip-track` for wells;
  - the text tiers → `ink`, `body` and `muted` (every faint tier folds into `muted`, which holds 4.5:1);
  - the white washes and lines → `rule`, or `ink` at 3–30 %, so they darken Paper and lighten Night;
  - the main action (Build, and its Rebuild and Regenerate states, whose words already say which) → `accent` with
    `on-accent` text; a build in progress → `chip-track` with `muted` words;
  - a chosen tab → `chip-on` with `ink` words; sliders, toggles and progress → `ink`; links → `accent`;
  - beta tags and notes → `gold-ink` on a gold tint; the live-climate badge → the Climate layer's ink and tint; Food's
    chips → the Food layer's; Evolution's finish bar → `gold`.
- [x] **The stage behind the globe** follows the theme (`desk`) in `js/scene.js` and `v2/js/app/globe-view.js`
  (Evolution's flat map too), changing the moment the theme does. The stars' material is hidden (they return as an
  option in R5).
- [x] **The type.** Libre Franklin on every control (the page's font); Cormorant Garamond on the panel's title, the
  modal and card titles and the Studio's headings; EB Garamond on slider names.
- [x] Retired the roles nothing used once the Studio's stars went (`white-35`, `white-40`, `select-16`): 120 remain.
- [x] **Found on the way:** four colours written into inline styles from JS. Edit mode's "(pending)" note → `gold-ink`;
  the readout's lake dot → `layer-climate`; Generate's timing line → `muted`. `check-style.mjs` now catches a literal
  text colour written into an inline style from JS (a data colour, `rgb(${…})`, stays allowed).
- **Verify:**
  - [x] Paper and Night on all four pages, at 1440 px and 400 px (Chrome, and Puppeteer's phone emulation).
  - [x] Text holds 4.5:1 on its ground (3:1 at 24 px and up), measured on every visible text node of the four pages in
    both themes. The only readings under the line were the build overlay caught mid-fade.
  - [x] The theme carries across pages and reloads, set before the first paint; the switch works by click.
  - [x] Generate's first build is no slower: median 5.83 s against `main`'s 5.86–5.91 s (three runs each, one seed).
  - [x] No console errors.
- **Left for later phases:** the atmosphere's glow, made for black space, reads as a pale halo on Paper (R5's thin rim of
  air); the Studio's tool pictures are dark screenshots (R4); Evolution shows "Add detail" as a primary twice, in the
  card and on the timeline (R3).

### R2: the tool chrome (Generate and Import)

References: **Page patterns: A tool**; the components Masthead, Logo, Tabs, Segmented, Slider, Field, Button,
SectionHead, LegendCard, RampKey, Readout and Tag; the **6 · Hybrid II · tool, map** and **tool, globe** boards;
`plans/VIEW_UI_PLAN.md` for what stays where. The pieces are shared by all three tools, so Evolution gets them too.

- [x] **The masthead:** the lockup at its start on every page (the mark at 30 px, the name in Cormorant at 22 px, home
  to the Studio); the tools as tabs with the current one in ink and underlined in gold; the follow and Ko-fi links in
  `muted`; the theme switch at the end; the page's one double rule under it. 56 px on the desktop (`--nav-h`, which
  everything placed under it follows); 36 px on phones, where the lockup gives way to the tools.
- [x] **The control panel:** 300 px (`--size-panel`; Import's had grown to 590 px around one long hint); titled with
  the tool and its line from VISION.md's "The way in" ("Generate · A planet in seconds, shaped by hand"); section heads
  in Cormorant with their layer's bar (Shape your world: plates; Terrain sculpting and Import your heightmap: land;
  Climate: climate; Inspect: rock) and a chevron; sliders with the name in EB Garamond and the value in Cormorant
  (lining figures); the `?` tips on `surface`, in EB Garamond.
- [x] **The buttons:** Build new world is the one primary (`accent`, 50 px); Reapply, the planet code's buttons and
  Export map are secondaries on `surface`; a ready Reapply is lit in the accent; a build in progress is `chip-track`.
  **Rebuild (n)** after a plate edit is an accent pill with a soft ring, under the readout (they used to overlap).
- [x] **The planet code** as a field on `surface`; its error in the accent.
- [x] **The layer tabs** with a gold underline and a dot for each layer's colour (Terrain and Heightmap: land; Climate;
  Plates; Evolution's Geology: rock; Food); **Climate's row** and the view strip's choices as segmented controls
  (`chip-track`, the chosen one on `chip-on` with `shadow-chip`); the strip and its fold arrow on the panel's ground.
- [x] **The legend card** on `surface` with `shadow-card`; **the readout** (`#hoverInfo`) the same, its values in EB
  Garamond and its labels in small capitals.
- [x] **The export panel, the tutorial, What's New, the survey, the build overlay:** cards on `surface` with
  `radius-xl` and `shadow-card`, titles in Cormorant, the step text in EB Garamond, the buttons as above.
- [x] **Toggles:** the accent when on (as the guide's checkboxes), a white thumb on a soft track when off.
- [x] **Focus:** a 2 px `focus` ring on every button, link, select, summary and input reached by keyboard, toggles too.
- [x] **Words:** Build new world, Shape your world, Terrain sculpting, Import your heightmap, Export map (sentence case),
  in the pages, the tutorial, the JS that relabels the button, and the guides. Generate's guide no longer says the
  button changes colour: its words say what it will do.
- [x] **Phones:** the 36 px masthead; section heads 44 px tall; the bottom sheet on the panel's ground.
- Not done, on purpose: Inspect and Export stay in the panel rather than moving to the masthead, since this phase keeps
  `plans/VIEW_UI_PLAN.md`'s layout. Other labels still in title case (Auto-Rotate, Grid Lines, New World…) are R9's
  words.
- **Verify:**
  - [x] Plate editing: Ctrl-click marks a plate ("Land → Ocean (pending)"), Rebuild (1) appears, a click rebuilds and
    the planet code takes the edit. The export panel opens and closes; the tabs, Climate's row and the view strip work.
  - [x] Paper and Night, 1440 px and 400 px, with the phone's bottom sheet opened.
  - [x] Text contrast on every visible text node of the four pages in both themes: all pass.
  - [x] `check-style.mjs` passes; no console errors.
  - [ ] Every export downloaded and opened (the panel was checked; no file was saved).
  - [ ] A real phone.

### R3: Evolution's own pieces

References: as R2, plus `v2/evolution.css` and `plans/V2_EVOLUTION_UI_PLAN.md` (the minimum on screen: New World, the
timeline with Finish and Export, the layer tabs; every knob folded into Settings).

- [x] **The timeline:** a card like the panel (`shadow-card`, `radius-xl`); the rail on `chip-track` with what is built
  in a faint ink and what is shown in ink; a white thumb ringed in ink; play and the speed as quiet controls; the
  moment in Cormorant (lining figures). Its action (Add detail, then Export) is the view's one primary; the others
  are quiet pills; a busy one is gold-tinted.
- [x] **The moment card:** on `panel`, its time in Cormorant at 24 px, its text in EB Garamond. Its button repeats the
  timeline's action, so it is an accent outline (the guide: one primary per view); Extend history and the rest are
  secondaries; the badges (Preview, Detailed · 2.5M) are small pills, Detailed in the land tint.
- [x] **The build status and the finish bar:** `chip-track` tracks, filled in ink and in gold.
- [x] **Geology and Food:** their rows as segmented controls (from R2); the Beta tag in gold-ink; Food's technique chips
  in the Food layer's tint and ink.
- [x] **The locked tabs** (Satellite, Geology, Food on a preview): a line lock drawn with a mask, instead of the 🔒 emoji
  (the guide: no emoji). The active tab's gold underline now overrides the lock's box.
- [x] **The climate chip over the planet, the tooltips, the planet-file drop zone, the export dialog's lines:** on
  `surface`, in the guide's type.
- [x] **Phones:** the timeline keeps one row (its Preview badge gives way: the sheet's line already says it); the moment
  in Cormorant at 18 px.
- [x] Generate's guide: the Load button "lights up in the accent" (it said blue).
- **Verify:**
  - [x] A history built and played; paused; **Add detail** from the timeline (Cancel · 12 % … 100 % in the gold busy
    state); the detailed moment (Detailed · 2.5M, the tabs unlocked, rivers drawn); the Food and Geology views; the
    export dialog opened and closed.
  - [x] Paper and Night at 1440 px and 400 px; text contrast passes on the page in both themes.
  - [x] `check-style.mjs` passes; no console errors.
  - [ ] A planet file saved and opened again (no file was saved).
  - [ ] Playback timed against `main` (the change is CSS only).

### R4: the Studio home page

References: **Page patterns: The Studio**; the **6 · Hybrid II · Studio** boards; the components ToolCard, EssayCard,
WorldPicker, GlobeFrame, SectionHead, Tag, Callout and Logo.

- [x] **The masthead** (from R2: the lockup, the tools, the follow links, the theme). The board's utility line above it
  is left out: the masthead carries the same links.
- [x] **The hero:** the eyebrow (A studio of planet tools), the headline at 92 px with *from the ground up.* in the
  accent's italic, the lede with Plates, ranges and rain marked in their layers' tints, **Begin with Generate** (the
  primary) and **Watch a world form**, the note; Arden (round 7's relief globe, a still) in its gold degree ring with
  numerals every 30°, and its caption. The turning globe is for later (decided).
- [x] **Three ways in:** the title between hachure; three tool cards with icon tiles in their layer's tint (Generate:
  land, Import: climate, Evolution: plates), a tag (Takes seconds · Your map · Takes minutes), the board's line, one
  honest note (Evolution: best on a desktop for now; Geology and Food in beta) and **Open …** on a hairline.
- [x] **Worlds to explore:** Arden (900 Myr) and Thessaly (300 Myr) in Terrain, Satellite and Rocks, with the board's
  captions; a small script switches them. **Make your own in Evolution →** stands in for the board's "Open Arden": the
  worlds' exact Evolution links aren't kept, and links build differently in different browsers.
- [x] **Orogen Explains:** off, until the first essay exists (decided).
- [x] **Resources I love:** kept (VISION: the Studio links the guides) as cards in two columns, grouped under heads
  with a gold bar.
- [x] **The footer:** on a hairline, the follow links (they left the hero), "World Orogen · orogen.studio", "Free and
  open source · GPL-3.0 · Your maps are yours", the copyright and the issues link.
- [x] The shared pieces the page needs (`og-btn`, `og-link`, `og-seg`, `og-tag`, `og-eyebrow`) moved from the guide's
  reference CSS into `styles.css`; 48 `--ui-*` roles retired (72 remain).
- **Verify:**
  - [x] Every link; Generate's old links (`/#code`) still reach `/generate` (the page adds no `#` links of its own).
  - [x] Paper and Night at 1440 px and 400 px (16 px gutter, no sideways scroll, the cards stacked); the picker works.
  - [x] Text contrast passes in both themes; `check-style.mjs` passes; no console errors.
  - [x] The page's meta tags still match what it says. Pictures are sized and below the hero lazy (about 750 KB of
    worlds, 72 KB for the globe).

### R5: the globe's light, air and stage

References: **Maps and the globe: The globe's defaults**; the **7 · The globe and its maps · the globe** boards. Code:
`js/scene.js`, `js/planet-mesh.js` (Generate and Import), `v2/js/app/globe-view.js` (Evolution), and two new shared
modules, `js/stage.js` and `js/degree-ring.js`.

**Re-scoped while building:** the defaults that change a layer's colours (gentle relief under thematic colours, the quiet
sea, map paper) moved to R6, with the rest of the map colours: they are per-layer colour work in both renderers, and
they need the same checks as the palettes. R5 is the globe's light, air and stage.

- [x] **Atlas light** in every tool: the sun carried with the camera, soft, from the upper left (the side the relief is
  shaded from); the strong ambient keeps the far side up, so nothing falls into night. Generate's sun used to be fixed
  in the world (the side turned away dimmed); Evolution's came from the upper right.
- [x] **A thin rim of air** (`map-air`, a little bluer at night) at 1.03 of the globe's radius, lit only at its edge,
  instead of the heavy glow at 1.12 that read as a pale halo on Paper.
- [x] **The stage:** the theme's `desk` (R1); **Stars**, a new option in the view strip on all three tools (globe only,
  remembered), puts the globe in `stage-space` with its stars. Evolution's flat map stays on the desk.
- [x] **The degree ring** in `gold` at home zoom (ticks every 5°, longer every 30°), sized each frame to the globe on
  screen, fading as you zoom in, gone in the map view; still under reduced motion (it shows or hides, no fade).
- [x] **The grid** in `map-grid` (white at 22 %, was 12–13 %) on Generate's and Import's globe and map, and Evolution's.
- [x] Guides: `docs/shared.md` (the stage, the light, the ring, Stars), `docs/generate.md` (the files, the globe),
  `docs/evolution.md` (Stars).
- **Verify:**
  - [x] Generate on Paper and on Night, Stars on and off; Evolution's globe and its map view (the ring goes); a phone
    (the ring fits the portrait camera).
  - [x] No console errors; `check-style.mjs` passes.
  - [ ] Frame rate while turning and zooming, timed against `main` (one SVG updated only when its size changes).
  - [ ] By eye on several seeds per tool and an Earth import (one seed each was looked at).

### R6: map colours by job

References: **Maps and the globe: Colour by job**, its palettes and **Checked, not eyeballed**; the **7 · The globe and
its maps · colour by job, ores, food** boards; PR #88.

**Every map mode and its question** (the inventory this phase starts from; `docs/style-guide/maps.md`'s rules):

| Tool | Map mode | Its question | Its colours now | What the guide asks |
|---|---|---|---|---|
| All | Terrain (Relief and the other height palettes) | a standard | the palettes | keep |
| All | Satellite | a standard | Blue Marble-like | keep |
| All | Köppen | a standard | Beck et al. 2018 | keep; gentle relief, the quiet sea |
| All | Temperature | which side (0 °C) | `temp-*` | keep (already the guide's) |
| All | Rain | how much | `rain-*` | keep |
| All | Pressure | which side (1012 hPa) | `pressure-*` | keep |
| All | Wind, Currents | how much, with arrows | ramps | keep; they live at sea |
| Generate, Import | Upwelling, Ice, Temperature range, Rain shadow, Aridity, Growing season, Rain seasonality | how much | one-hue ramps | keep; land-only ones on the quiet sea |
| All | Heightmap | a standard (grey) | grey | keep |
| All | Plates | which kind (up to ~100 plates) | a hue per plate | **open:** colour neighbours apart with the categorical eight (a map colouring), not a hue each |
| Evolution | Rocks | a standard (the geological map's families) | families | keep |
| Evolution | Deposits | which kind (11 metals) | a hue per metal | **done here:** four ore families |
| Evolution | Ages | which kind (an age's resources, up to 12 in the Industrial Age) | a hue per resource | **open:** families, as Deposits |
| Evolution | Food: Farmland, Lifestyle, People, Soil, Growing season | how much / which kind | per view | after PR #88 |
| Evolution | Food: Staple food, Crops, hearths, animals | which kind | generated hues (PR #88) | after PR #88: the tuned `staple-*`, `cat-1`…`cat-8` |

- [x] **Ores:** the Deposits map colours each metal by its family (`ore-alloy`: iron, nickel, platinum and chromium;
  `ore-base`: copper, tin, lead and zinc, aluminium; `ore-precious`: gold, silver, diamonds; `ore-salt`), so four hues
  instead of eleven; a metal shown alone takes its family's colour, its richness by strength; the readout's dots the
  same. The legend is a row per family with its metals in words and their shares. `ORE_FAMILIES` sits beside `METALS`
  (`v2/js/geology/deposits.js`); the Ages view and the fuels keep their own colours.
- [x] `check-geology.mjs`'s contrast section now covers the families; run on them alone: 0 of 10 colours (the families
  and their midpoints) × 168 grounds and grades short, the grades in order.
- [ ] **From R5, the colour defaults:** gentle relief under thematic colours, `1 + ½ × (shade − 1)`, in every tool
  (Evolution shades them fully today; Generate draws Köppen and climate flat); the quiet sea (`map-sea`, shaded gently by
  the sea floor) under every land-only layer; `map-paper` for land with nothing to show; `map-ice`, `map-lake`. This
  touches every thematic layer's colour function in three view modules (`js/climate-layers.js`,
  `v2/js/evolution/climate-view.js`, `geology-view.js`, `farming-view.js`), so it is its own pull request.
- [ ] **Worth mining** (moderate or richer only) as a Deposits choice.
- [ ] **Ages** by family, as Deposits.
- [ ] **Plates** with the categorical eight, neighbours apart.
- [ ] **Staple food, hearths and animals** with the tuned `staple-*` and `cat-1`…`cat-8`, once PR #88 is merged.
- **Verify:**
  - [x] The Deposits view on a detailed moment: the family legend, the map in four hues; `check-style.mjs` passes.
  - [ ] Each remaining palette through the colour check over every pair, on the globe, on Paper and on Night.
  - [ ] Exported legends and colour maps (the Deposits colour map follows the view; not exported here).

### R7: the atlas print (a new feature)

References: **Page patterns: The atlas print**; the **6 · Hybrid II · atlas print** boards; the `paper-*` tokens.

- [x] Its own plan: [`plans/ATLAS_PRINT_PLAN.md`](ATLAS_PRINT_PLAN.md) (2026-11-03), with six questions for the owner
  (which tools, where it lives, PNG or PDF, place names, the key, phones) and three phases.
- [ ] The owner's answers and go-ahead.
- [ ] Then, per that plan: the plate (18 × 12 inches, landscape) on Ivory or Midnight; the title row, the main map in its
  double neatline with degree numerals, the globe inset in its gold ring, About this world, the key, Places named, This
  plate; the controls around it styled like the tool.

### R8: Orogen Explains (a new section)

References: **Page patterns: An Orogen Explains essay**; the **6 · Hybrid II · blog post** boards; the components
EssayCard, Sidenote, Callout and Tag. VISION: the learning happens in the guides, and the Studio links them.

- [x] Its own plan: [`plans/EXPLAINS_PLAN.md`](EXPLAINS_PLAN.md) (2026-11-03), with five questions for the owner (who
  writes, which first, how the pages are made, the figures, search) and three phases.
- [ ] The owner's answers and go-ahead.
- [ ] Then, per that plan: the essay page; the Studio's Explains row; the sitemap.

### R9: words, icons and the launch

- [x] **The favicon and app icons** from the mark (`assets/brand/`): `favicon.svg` (its ring ivory in a dark browser),
  `favicon-32.png`, `apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png` and a maskable 512 in
  `site.webmanifest`, replacing the 🌍 emoji; the manifest's colours on Paper's ground.
- [x] **The social image** (`preview.png`, 1200 × 630): the lockup, the eyebrow, "Believable worlds, *from the ground
  up.*", the three tools named, Arden in its degree ring, the double rule; on Paper. (Evolution keeps its own,
  `assets/studio/evolution.jpg`, a screenshot to replace when Evolution's look settles.) `theme-color` per theme (R1).
- [x] **The 404 page** on the tokens: the mark, a gold eyebrow, "This planet doesn't *exist yet.*", Build a new world
  and the Studio.
- [x] **Words:** the rest of the labels in sentence case (Auto-rotate, Grid lines, New world, Build this world, Load
  planet, Choose image, Temperature range, Rain shadow, Growing season, Rain seasonality, Add detail) in the pages, the
  layer lists, the export list, Evolution's messages, the guides, `v2/README.md` and `llms.txt`.
- [x] **The README's front door:** the files (R0–R9); its words needed no other change.
- [ ] **What's New:** ask the owner; if yes, bump `VERSION` in `initWhatsNew()` (`js/main.js`).
- [x] **SEO and AISEO:** no feature claim changed (the theme switch and Stars are not headline features), so the meta
  tags, the JSON-LD and `llms.txt`'s claims stand.
- [ ] `sitemap.xml`'s dates, at the release.
- [ ] **The release:** the outgoing release archived at `/v/<major>.<minor>/` as usual; the version per open question 3
  (3.0 or 2.x) is the owner's.
- [ ] **The announcement** is HQ's work, in its own workspace.
- **Verify:**
  - [x] Every icon, the manifest and the preview served; the 404 page on Paper; `check-style.mjs` passes.
  - [ ] Every rule in `CLAUDE.md`'s Key Rules checked at the release.
  - [ ] A real phone; Firefox and Safari as well as Chrome.

### R10: detail passes (the owner's notes)

On `redesign-polish`, stacked on R9: the owner's notes after looking at the whole redesign (2026-11-04), in batches,
each checked in the browser.

**Overall**
- [x] The theme switch as a button that is easy to see: a small segmented button, a sun and a moon on a track, the theme
  in use raised (all four pages).
- [x] The globe, the map and what floats over them placed by the room beside the open panel (`js/open-area.js`): with
  room to spare centred on the window; when short, centred on the space right of the panel; in between a smooth ease
  (a smoothstep over the gap a centred planet would leave, from none to the panel's width; the owner: "smoothly
  interpolate between the 2 (not necessarily linearly though)"). The globe's width is counted at home zoom with its ring,
  so it doesn't slide as you zoom; a change glides there. Generate, Import and Evolution, globe and map.
- [x] The loading spinner is the logo: its stripes still, its ring turning (Generate, Import).
- [ ] Evolution uses the loading screen more, saying what is happening (batch 2).
- [ ] The degree ring's numerals on the globe, where the grid lines meet it, moving as the globe turns; the same gold
  graticule frame with numerals on every map projection (batch 3).

**The Studio**
- [x] "Free and open source" raised above the buttons, in a gold tag.
- [x] "Three ways in" is now **Orogen tools** with a line; the hachure is gone (and from the guide), the space above it
  smaller.
- [ ] A new Evolution icon: options at `v2/out/evolution-icons/` (not committed), the owner to choose.
- [x] Worlds to explore: the map from the eyebrow's top to the picker's foot, its name just below (narrower desktop
  windows trim the map's sides to fill that height; wider ones show it whole).

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
- **2026-11-03:** R1 built and checked, on `redesign-r1` (stacked on R0): PR #95.
- **2026-11-03:** R2 built and checked, on `redesign-r2` (stacked on R1): PR #97.
- **2026-11-03:** R3 built and checked, on `redesign-r3` (stacked on R2): PR #99.
- **2026-11-03:** R4 built and checked, on `redesign-r4` (stacked on R3): PR #101.
- **2026-11-03:** R5 built and checked, on `redesign-r5` (stacked on R4): PR #104.
- **2026-11-03:** R6, first part (ore families and the inventory), on `redesign-r6` (stacked on R5): PR #107.
- **2026-11-03:** R7 and R8: their own plans written, waiting for the owner's answers (nothing built), on `redesign-r7`: PR #108.
- **2026-11-03:** R9 built and checked (all but What's New, the sitemap and the release, which wait for the owner), on `redesign-r9` (stacked on R7 and R8).
- **2026-11-04:** R10, detail passes: batch 1 (the theme switch, the open area, the logo spinner, the Studio) on `redesign-polish`.
