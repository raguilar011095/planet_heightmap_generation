# Usability audit: the redesign (branch `audits` = `redesign`, PR #147)

2026-11-06. Pages served from the worktree at `http://localhost:8102`; `origin/main` served from a `git archive` copy on
port 8160 for comparison. Driven with Puppeteer (Chrome, SwiftShader) at 1920/1440/1280/1100/1024/900/834/820/800/769 px
and as phones (390×844 and 360×800, touch, DPR 2), Paper and Night. Screenshots: `v2/out/audits/usability-shots/` (local
only, not in git; paths below are relative to it); scripts and their raw logs (JSON):
`v2/out/audits/usability-scripts/`. Nothing in the repo was edited.

## Summary

**Verdict: the redesign is in good shape on desktops of 1280 px and up and on phones.** Every core task worked: the
Studio leads to each tool; Generate builds in about 5 s, Ctrl-click → Rebuild and the phone's edit mode work; Import
takes a new image; Evolution starts, plays, scrubs, adds detail with clear staged loading screens, unlocks its tabs and
opens the export dialog. No sideways scroll on any page at any width tested, no console errors, the theme switch works
by mouse, Enter and Space, and the pages hold up with `localStorage` blocked. The problems cluster in two places: the
band of window widths between the phone layout and a full desktop (769–1100 px, which includes every iPad in portrait),
and keyboard / screen-reader basics. Most of those were already there on `main`, so the redesign carried them over and
didn't cause them.

**Top 5**

1. **U-01 (High):** Between 769 and about 1100 px the layer tabs run under the help button and off the window. Plates
   and Heightmap can't be reached at 800–834 px. The fold arrow covers the panel's collapse button. Below about 880 px
   the theme switch is pushed off the masthead, on every page including the Studio. This includes every iPad in
   portrait.
2. **U-14 (Medium, regression):** Generate's **Rebuild (n)** button now sits on top of the hint line on every desktop
   size. Plate editing is a protected strength.
3. **U-02 / U-03 (Medium, pre-existing):** Closed dialogs (Export with about 75 checkboxes, the tutorial, What's New,
   the survey) stay in the Tab order. They are invisible at opacity 0, so a keyboard user tabs through dozens of
   controls they can't see. Open dialogs don't take focus or keep it.
4. **U-04 (Medium, pre-existing):** On phones the `?` tooltips near the left edge open partly off-screen. Detail's tip
   starts about 71 px off the left edge, so its text is cut. This breaks a CLAUDE.md mobile rule.
5. **U-07 (Medium, mostly pre-existing):** Phone touch targets are still under 44 px: the planet-code field, Copy and
   Load (36 px), Export map (37), Stats (14), the tutorial's Back, Next and × (40 / 30), and the Studio's "Open …" links
   (41).

**Counts:** 1 High · 8 Medium · 15 Low (24 findings). Eleven of them were already on `main` (or are mostly so), and
each is marked "pre-existing". The redesign carried them over and didn't cause them.

---

## Findings

Severity: **High** blocks or badly hurts a core task or a protected strength; **Medium** real friction; **Low** polish.
Effort: S (an hour or two), M (half a day to a day), L (more).

### All pages (the shared chrome)

**U-01 · High · Tablet and narrow-desktop widths: tabs off-screen, panel controls covered, theme switch unreachable**
- *Where:* every tool's layer bar (`.layer-bar`, styles.css:463–469; centring by `js/open-area.js:58`; the nudge in
  `js/view-strip.js:81–87`); the masthead on every page (`#topNav`, styles.css:136 and :203; the compact masthead only
  starts at ≤ 768 px, styles.css:1290).
- *What happens (measured with the panel open, `v2/out/audits/usability-scripts/widths-generate.json`,
  `final-log.json`):*
  - 1100×800 and 1024×768: the tab row overlaps the help `?` (at 1024 the tabs end at x 1015 and the help button starts
    at 968, so "Plates" is half under it). The view-options arrow (277–319) sits on top of the panel's collapse button «
    (the panel ends at 316). See `generate-w1024.png`.
  - 900, 834, 820, 800 and 769 px: the tab row is 690 px wide and runs past the window's right edge. At 820 it ends at
    913 px and "Plates" ends at 904, so Heightmap and Plates can't be reached. See `gen-820-top.png` and
    `generate-w800.png`.
  - Masthead at 769–~880 px: the masthead is 62–76 px too wide (`navOverflow` at 834/820). The theme switch sits at x
    816–876, past the window, on the Studio, Generate and the other pages. The masthead scrolls sideways (`overflow-x:
    auto` with the scrollbar hidden), so the switch can be reached only by swiping a bar that gives no hint it scrolls.
    See `studio-820-top.png`.
  - On `main` at the same widths the tabs stayed inside the window and clear of the help button (they did overlap the
    panel at ≤ 900 px, `widths-main-gen.json`). Two redesign changes make it worse here: the open-area shift (158 px
    right) and the wider tab row (690 vs 562 px). The masthead gained the lockup and the theme switch with no in-between
    breakpoint.
  - Related, pre-existing (traced in code only): on a touch device wider than 768 px, Generate hides the edit-mode
    pencil (`.edit-toggle { display:none }` outside the phone media query, styles.css:1214). An iPad therefore has no
    way to edit plates.
- *Why it matters:* CLAUDE.md requires every change to the UI to work on mobile, and 810–834 px is every iPad in
  portrait. The plan's decision "the switch is always one tap away" fails here. Plate editing (protected strength 8)
  needs the Plates tab. WCAG 1.4.10 Reflow.
- *Fix:* when the tab row is wider than the room right of the panel, don't apply the open-area shift; let `.map-tabs`
  wrap or scroll inside `max-width`. Add a breakpoint at about 1000 px that drops the masthead's follow links (they are
  already in the panel's foot) and shortens the lockup to the mark. Consider the bottom-sheet layout up to 1024 px for
  touch devices, which would also bring back the edit pencil. **M.**

**U-02 · Medium · Pre-existing · Closed dialogs stay in the Tab order and the accessibility tree**
- *Where:* `#exportOverlay.hidden`, `#tutorialOverlay.hidden`, `#whatsNewOverlay.hidden`, `#surveyOverlay.hidden` are
  `opacity:0; pointer-events:none` only (styles.css:857, :1047, :1126, :1083). The rules on `main` are the same.
- *What happens:* tabbing from the top of Generate gives 42 sensible stops (nav, panel, tabs, help). Stops 43–69 and on
  go to the invisible tutorial's × and Next, the export panel's × and its four selects, then about 75 unlabelled export
  checkboxes, all at opacity 0 (`gen-extra-log.json` → `tabFromStart`). Evolution is the same: Tab after the timeline's
  action goes into the hidden export dialog (`evolution-log.json` → `tab`). A screen reader also reads all of them.
- *Why it matters:* WCAG 2.4.3 Focus Order and 2.4.7 Focus Visible (focus lands where nothing is visible). Keyboard
  users lose their place on every tool page.
- *Fix:* add `visibility:hidden` to each `.hidden` state with a `transition: visibility 0s linear 0.5s`, which keeps the
  fade, or set `inert` on the overlay when it closes. **S.**

**U-03 · Medium · Pre-existing · Dialogs don't take focus, keep it, or give it back**
- *Where:* Export, the tutorial and What's New on Generate, Import and Evolution.
- *What happens:* after Export opens, focus stays on the Export button (`activeElement: exportBtn`). The next five Tabs
  go to the panel's links behind the scrim (`exportTab: in-dialog=false`). What's New opens with focus on `BODY`. None
  has `role="dialog"`, `aria-modal` or a label. Escape does close all of them, which is good.
- *Why it matters:* WCAG 2.4.3 and 4.1.2. Screen-reader users aren't told that a dialog opened.
- *Fix:* on open, focus the first control (or the title with `tabindex=-1`); trap Tab inside; on close, return focus to
  the opener. Add `role="dialog" aria-modal="true" aria-labelledby` to the cards. **S–M** (one shared helper for the
  four overlays).

**U-04 · Medium · Pre-existing · Phone tooltips open off the left edge of the screen**
- *Where:* `.tip:hover::after` on phones (styles.css:1470: `left:50%; transform:translateX(-50%); width:240px`), on
  every `?` near the left of the sheet (Generate, Import, Evolution).
- *What happens:* tapping Detail's `?` at x 54 px puts the 240 px tip's left edge at about −71 px. The text is cut:
  "f the sphere — more detail / oastlines and terrain, but / o generate" (`gen-p390-tooltip-detail.png`). `main` has the
  same rule at 220 px wide. The redesign's larger 15 px serif makes the box taller, not wider.
- *Why it matters:* CLAUDE.md says tooltips "must reposition above their trigger on mobile, not … overflow off-screen".
- *Fix:* on phones, anchor the tip to its `.cg` row (`left:0; right:0; width:auto`) rather than to the 16 px `?`, or
  clamp it in JS. **S.**

**U-05 · Medium · Pre-existing · The `?` tips can't be reached by keyboard or screen reader**
- *Where:* every `<span class="tip" data-tip="…">` (no `tabindex`, no role, no label; `gen-extra-log.json` → `tips`).
- *What happens:* the explanations exist only as `::after` content on `:hover`. They can't be focused, and assistive
  tech never hears them.
- *Why it matters:* WCAG 2.1.1 Keyboard and 1.4.13 Content on Hover or Focus. The tips carry real meaning (what Detail,
  Temperature in W/m² and Quality do).
- *Fix:* make each tip a `<button type="button" aria-describedby>` (or give it `tabindex=0` and `aria-label` from
  `data-tip`), show it on `:focus-visible` too, and dismiss it with Escape. **S–M.**

**U-06 · Medium · Pre-existing · Controls without accessible names or states**
- *Where:* across the tools (accessibility snapshot in `gen-extra-log.json` → `a11y`).
- *What happens:*
  - All 15 of Generate's sliders read as `slider ""`: the `<label>`s have no `for` and don't wrap the input.
  - The export checkboxes read as `checkbox ""`.
  - The layer tabs (Terrain … Plates) and Climate's row are plain buttons with an `.active` class and no `aria-pressed`
    or `aria-selected`, so nobody hears which map is shown.
  - The nav tabs have no `aria-current="page"`.
  - Icon buttons are named by their glyphs: `«` (collapse panel), `⎘` (copy code), `?` (tutorial), `×` (closes on
    Generate and Import; Evolution's have `aria-label="Close"`).
  - Evolution's play button is always "Play / pause" with no state.
  - The locked tabs' lock is now a CSS mask that assistive tech can't see (see U-22).
- *Why it matters:* WCAG 1.3.1, 4.1.2. The view strip's Globe/Map (with `aria-pressed`) and the Studio's pickers show
  the right pattern already.
- *Fix:* `for`/`id` on slider labels; `aria-label` on the export checkboxes (map name + Colour/Data); `aria-pressed` on
  the tab buttons (set in `LayerBar.setLayer`, v2/js/view/layer-bar.js); `aria-current` on `.nav-tab.active`;
  `aria-label` on the icon buttons; toggle the play button's label. **S–M.**

**U-07 · Medium · Mostly pre-existing · Phone touch targets under 44 px**
- *Where / what (measured, `generate-log.json`, `compare-log.json`, `evolution-log.json`, `studio-log.json`):*
  - Generate sheet: planet-code field 244×36, Copy 37×36, Load 57×36, **Export map 350×37**, Stats summary 350×14.
  - Import sheet: Export map 350×37, Stats 350×14.
  - Evolution sheet: Seed field 350×36, Stats 350×14.
  - Generate's first-visit tutorial on a phone: × 21×30, Back 76×40, Next 74×40.
  - Studio: "Open Generate →" 328×41 (and the other two cards'). Inline links "Madeline James Writes" 138×21 and
    "Gaea" 31×21 (WCAG exempts inline links, but CLAUDE.md asks for 44).
  - On `main` the code row was 34 px and Export 39 px. The redesign restyled these controls (R2: "section heads 44 px
    tall") but left them under 44.
- *Why it matters:* CLAUDE.md's rule (≥ 44 px at ≤ 768 px); VISION: Generate is "fully phone-friendly".
- *Fix:* add `#seedCode, #seedRow button, .export-btn, .stats-toggle summary, #tutorialNav button, #tutorialClose,
  #whatsNewClose, .tool-card__cta { min-height: var(--size-touch) }` to the 768 px block. **S.**

**U-08 · Low · Copy: labels the sentence-case pass missed, and a tutorial line out of step**
- *Where / what:*
  - View strip: "Rivers & Lakes", "By Regime" (v2/js/view/layer-bar.js:82–83, also docs/shared.md:27, :45, :65).
  - Generate and Import sliders: "Continent Size Variety", "Land Coverage", "Terrain Warp", "Glacial / Hydraulic /
    Thermal Erosion", "Ridge Sharpening"; hints "Ocean World / Desert World", "Ice Age".
  - Evolution: "Starting Continent Size", "History Length", "End As", "Terrain Detail".
  - Export: "Colour Map", "Ocean Currents".
  - Tutorial titles: "Explore & Edit", "Visualize Your World", "Save & Share", "A Planet's History", "Scrub the
    Timeline", "Keep a Planet", "Steer It".
  - Buttons: "Get Started", "Got It".
  - Generate's tutorial step 1 still says "Expand **Terrain Sculpting**" (generate.html:346), but the section is now
    "Terrain sculpting".
  - The tutorials don't mention the new theme switch or Stars.
- *Why it matters:* R9 set sentence case everywhere. Mixed casing on one panel reads as unfinished.
- *Fix:* one pass over the pages, `layer-bar.js`, the export list and the guides. **S.**

**U-09 · Low · Under reduced motion the loading logo still spins**
- *Where:* styles.css:970 (`animation-duration: 3s` under `prefers-reduced-motion`).
- *What happens:* everything else holds still under reduced motion: the Studio globe stays a still with no pause button,
  the tool cards and the open-area glide don't animate, and Evolution's indeterminate bar stops. The spinner's ring
  keeps turning, only slower (`reducedSpinner: "3s spin"`).
- *Why it matters:* the plan's own bar is "nothing moves under prefers-reduced-motion". A slow spinner is commonly
  accepted, so this is a judgement call.
- *Fix:* stop the arc and rely on the progress bar and its words, or pulse its opacity. **S.**

**U-10 · Low · The legend card covers part of the map**
- *Where:* `.legend-card` (styles.css:558, fixed bottom-right, 280 px wide). The map band (`js/map-band.js`) fits the
  map below the tabs and above the hint or timeline, but not beside the legend.
- *What happens:* in Generate's Map view with Köppen, the legend covers the map's south-east corner and the frame's
  120°E/150°E numerals (`gen-1440-map-climate.png`). In Evolution's Food view it covers about 280×250 px of the map's
  east (`evo-1440-map.png`). On a phone, Rocks' legend covers the top third of the globe (`evo-p390-rocks.png`).
- *Fix:* in the map view, take the legend's width into the band's right margin when there is room, or let the legend
  fold to its title. **S–M.**

### The Studio (`index.html`)

**U-11 · Low · The tools section's keyboard and reading order doesn't match what is shown**
- *Where:* `#worlds` (index.html:85–168; the reorder in the `open()` script, index.html:299–320; CSS `order`,
  studio.css).
- *What happens:*
  - The view switches (Satellite / Plates / Terrain) come before the tool cards in the DOM. At 1440 Tab reaches them
    before the Generate card beside them. In one column (< 1280 px and phones) they sit *below* the map but are still
    reached before the open card (`studio-log.json` → `domOrderAtlas1100`).
  - Opening a card moves it to the top with CSS `order` only. After Evolution is opened by keyboard, Tab goes Calder →
    Linmore → Open Evolution → straight into Resources. The Generate and Import cards, now shown *below* it, are skipped
    and can be reached only with Shift+Tab (`tabAfterEvolution`).
- *Why it matters:* WCAG 1.3.2 Meaningful Sequence and 2.4.3 Focus Order.
- *Fix:* put the views after the picture in the DOM (or inside the `figure`). When a card opens, move its node to the
  top of the list rather than only setting `order`, or don't reorder at all. **S.**

**U-12 · Low · The open card looks collapsible but isn't**
- *What happens:* the open card's chevron points up, the usual sign for "click to collapse". Its header is a button with
  `aria-expanded="true"`, but clicking it does nothing (`cursor: default`, index.html:340).
- *Fix:* hide the chevron on the open card and drop the button role there, or let it collapse. **S.**

**U-13 · Low · On a phone, opening a lower card leaves its map below the fold**
- *What happens:* tapping "Import" low on the screen keeps that card under the finger (`scrollBy` in index.html:313).
  The page jumps about 570 px back towards the hero globe, and the card's worlds, the map and its switches all end up
  below the screen (`studio-p390-atlas-import.png`).
- *Fix:* on narrow screens, scroll the opened card to the top (`scrollIntoView({block:'start'})`, respecting
  `scroll-margin-top`) so its contents follow it. **S.**

### Generate

**U-14 · Medium · Regression · Rebuild (n) sits on top of the hint line**
- *Where:* `.rebuild-fab { bottom: 20px }` (styles.css:1221) and `#info { bottom: 16px }` (styles.css:805), both
  centred on `50% + --open-shift`.
- *What happens:* after a Ctrl-click, the 44 px Rebuild pill covers the middle of "Drag to rotate · Scroll to zoom ·
  Ctrl-click (⌘-click on a Mac) to reshape continents", so only "…zoom" and "…a Mac) to reshape continents" show past it
  (`gen-1440-ctrlclick.png`, `cmp-branch-gen-ctrlclick.png`, Paper and Night). On `main` the button was at `bottom:
  60px`, clear of the hint (`cmp-main-gen-ctrlclick.png`; measured 800–840 vs 866). Both are bottom-anchored on the same
  centre, so they overlap at every desktop size. The button stays clickable.
- *Why it matters:* plate editing is protected strength 8. The plan says Rebuild's new look "stays as obvious", but here
  it collides with the one line that explains the gesture.
- *Fix:* `bottom: 48px` for `.rebuild-fab` (the readout's `body.edits-pending` offset of 112 px still clears it), or
  hide `#info` while edits are pending. **S.**

**U-15 · Low · Pre-existing, slightly worse · On a 1280×720 laptop window, Build new world is below the panel's fold**
- *What happens:* the panel's scroll area ends at y 704. Build new world starts at y 702 (`main`: 689). The one primary
  action is hidden until the panel is scrolled (`cmp-branch-gen-1280x720.png`). The redesign's larger slider type
  raised the panel's content from 866 to 912 px.
- *Fix:* keep Build new world and the planet code in a sticky foot of the panel, or tighten the slider rows on short
  windows (`@media (max-height: 800px)`). **S–M.**

**U-16 · Low · Opened view options run under the help button at 1440 px**
- *What happens:* the opened strip spans x 332–1424 and the help `?` is at 1384–1424, drawn on top of the strip's
  top-right corner (`gen-1440-viewstrip-open.png`; `stripVsHelp.overlap: true`). No control is hidden, but the two
  collide.
- *Fix:* cap the strip's right edge at the help button's left (`max-width` from `--open-left` and the help button's
  width). **S.**

**U-17 · Low · On a 360 px phone the river density select is cut off in the sheet**
- *What happens:* in the sheet's view options, the "Normal" select reaches x 380 on a 360 px screen and is clipped to
  "Norma" (`gen-p360-sheet.png`). At 390 px it pokes past the strip's tinted panel (`gen-p390-sheet.png`).
- *Fix:* let `#waterGroup` wrap onto its own line in the sheet. **S.**

**U-18 · Low · On short or narrow windows the hint wraps and runs over the globe**
- *What happens:* at 1280×720 and narrower the hint takes two lines and overlaps the globe's lower edge
  (`cmp-branch-gen-1280x720.png`, `gen-1100-initial.png`). Sampled behind the text: 13 % of the background pixels give
  the muted text less than 4.5:1 (`final-log.json` → `infoContrast1280x720`).
- *Fix:* shorten the hint when it would wrap, or give it a faint `surface` pill like the readout's. **S.**

### Import

**U-19 · Medium · Pre-existing · "Choose image" can't be reached by keyboard**
- *Where:* `<input type="file" style="display:none">` with a `<label for>` (import.html, `.import-file-label`).
- *What happens:* the label isn't focusable (`tabIndex -1`) and the input is `display:none`, so Tab skips the only way
  to bring in a map (`import-log.json` → `fileInput`).
- *Why it matters:* WCAG 2.1.1. Bringing your own map is Import's whole purpose (VISION: "Your map is the input").
- *Fix:* hide the input visually (`.visually-hidden`, or `opacity:0` over the label) instead of with `display:none`,
  and show the focus ring on the label via `:focus-within`. **S.**

**U-20 · Low · Pre-existing · A file that isn't a readable image fails silently**
- *Where:* `js/import-main.js:150–154`: no `img.onerror` or `reader.onerror`.
- *What happens:* choosing a corrupt `.png` changes nothing. The previous file's name, preview and dimensions stay, and
  no message appears (`imp-1440-broken.png`, `import-log.json` → `broken`).
- *Fix:* on error, show "Couldn't read <name> as an image (PNG, JPEG or WebP)" in `#importFileName`, in the accent.
  **S.**

### Evolution

**U-21 · Low · Pre-existing CSS · The phone's collapsed sheet line gets squeezed and cut**
- *Where:* `.evo-sheet-line` (v2/evolution.css:263, `height:22px` in a flex column, no `flex-shrink:0`). The CSS on
  `main` is the same; I did not run this on `main`.
- *What happens:* before the sheet is ever opened, the line ("370 Myr · Preview") reads fine (`evo-p390-done.png`).
  After the World section is opened and the sheet closed, the line shrinks to 8 px and its text is cut through the
  middle ("280 Myr · Preview", `evo-p390-after-sheet.png`; `lineBefore` 13 px → `lineAfter` 8 px). It is the phone's
  main status line (Preview or Detailed, the detail progress).
- *Fix:* `flex-shrink: 0` on `.evo-sheet-line` (and on the handle). **S.**

**U-22 · Low · The lock on Satellite, Geology and Food is faint and invisible to assistive tech**
- *What happens:* the lock is a 10×11 px CSS mask at 70 % opacity (styles.css:632–638). At 1440 it reads as a speck
  beside the label (`evo-1440-t09.png`). The 🔒 emoji it replaced was at least in the text. The buttons aren't
  `aria-disabled`, and only their long `title` ends "Comes with Add detail". Clicking a locked tab does give good
  feedback: the chip "The Satellite view comes with detail — add detail to 160 Myr to see it [Add detail]"
  (`evo-1440-locked-click.png`).
- *Fix:* add visually hidden text "(comes with Add detail)" or `aria-describedby` to locked tabs, and raise the lock to
  full `muted` at 12 px. **S.**

**U-23 · Low · Pre-existing · Play / pause doesn't say which it is**
- *What happens:* `#playBtn` swaps ▶ and ⏸ glyphs while its `aria-label` stays "Play / pause" with no `aria-pressed`
  (`evolution-log.json` → `play`).
- *Fix:* set the label to "Play" or "Pause" in `setPlaying`. **S.**

**U-24 · Low · "End As" is truncated in the desktop panel**
- *What happens:* the select shows "Wherever the history has got t…" at 1440 (`evo-1440-world.png`).
- *Fix:* shorten the option ("Wherever it has got to") or let the select take the row's full width. **S.**

---

## What works well

- **Studio:** at every width tested (1920–360 px) nothing scrolls sideways and nothing logs an error. The hero's turning
  globe has a pause button (aria-pressed, 44 px on phones). It stays a still under reduced motion and without WebGL 2,
  and its pause button is then hidden. The tool cards, world pickers and view and climate switches all use
  `aria-pressed`, and the map's `alt` follows the choice. The keyboard focus ring is visible on every stop.
- **Theme switch:** clear labels ("Switch to Night, the dark theme"), works by click, Enter and Space, carries across
  pages, and still works with `localStorage` blocked (the choice then lasts the page). Night and Paper both look
  finished.
- **Generate:** first build in about 5 s. Ctrl-click marks a plate, the readout says "Land → Ocean (pending) ·
  Ctrl-click to undo", and Rebuild (1) rebuilt in about 1 s and updated the planet code. Enter in the code field loads
  it, and a bad code shows "Invalid planet code". The phone's edit pencil → tap → Rebuild flow works
  (`gen-p390-edit.png`). The graticule frame and map band read well in the map view.
- **Import:** the Earth default appears at once. A new image shows its preview and size before Import; importing runs
  under a clear "Importing heightmap" screen.
- **Evolution:** the staged loading screens ("Starting a world", "Adding detail to 550 Myr · Reading the bedrock…") say
  what is happening, never cover the history while it builds, and keep Cancel · n % on the timeline. The tabs unlock
  after detail. A broken planet file gives a plain message ("Could not open broken.orogen: not a planet file"). The
  phone timeline's controls are all 44 px. The export dialog fits a 390 px phone with 44 px rows.
- **404 page:** clear, on the tokens, with two 44 px actions.

## What I did not test

- Real devices (iOS Safari, Android Chrome), Firefox and Safari. Everything ran in Chrome with SwiftShader and touch
  emulation, so pinch-zoom, real swipes on the bottom sheet and iOS's sticky `:hover` on the `?` tips were not
  exercised.
- A screen reader. Names and roles come from Chrome's accessibility tree, not from listening.
- Downloading and opening any export, saving and reopening a real `.orogen` file, **Extend history**, Add detail at the
  default 2.5M or 10M cells (I used 640K to keep the load light), the Ages and Deposits pickers in depth, and the
  survey's trigger.
- Frame rate and playback smoothness against `main`.
- A full contrast sweep. I only spot-checked; the plan records an automated pass, and I found no text failure beyond the
  hint over the globe (U-18).
- Import's flow with a real hand-drawn heightmap (I used the repo's Mars map).
