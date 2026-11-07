---
name: orogen-look
description: World Orogen's style guide, as a working checklist. Use before changing anything a person sees in the app or on the site (CSS or HTML, a control, button, panel, modal, tooltip, legend, readout, the Studio page, an icon or the logo, the colours of a map mode or palette such as ores, food, climate or a new layer, or the words in the interface: labels, buttons, hints, errors, tutorials, What's New), and when adding a page, a map mode or a layer. Also for work on plans/REDESIGN_PLAN.md.
---

# World Orogen's look

The style guide is `docs/style-guide/`; its values are `tokens.css`; the redesign that moves the app onto it is
`plans/REDESIGN_PLAN.md`. This skill says what to read and what to check. When the guide and this skill disagree, the
guide wins; fix this skill.

## Read first

| The change | Read |
|---|---|
| Any interface change | `docs/style-guide/README.md`: Colour, Type, Layout, Shape, Phones, Accessibility |
| A control, panel, card, legend, pin or readout | `docs/style-guide/components.md` (the markup and the `og-` classes; reference CSS in `components.css`) |
| A whole page, or a new one | `docs/style-guide/pages.md` |
| Map colours, a new map mode or layer, a legend's rows | `docs/style-guide/maps.md`, all of it |
| Words anywhere in the interface | `docs/style-guide/README.md`: Voice, Casing, Numbers |
| Part of the redesign | `plans/REDESIGN_PLAN.md`: the phase, its references and its checklist |

## The rules that are easy to miss

- **Tokens, never literals.** Colours, fonts, spacing, corners, shadows come from `tokens.css` (`var(--accent)`,
  `var(--space-4)`, `var(--font-ui)`). Pages not yet redesigned use the `--ui-*` roles at the top of `styles.css` for
  small fixes; add no new `--ui-*` role. If no token fits, add a token to `tokens.css` (with a Night value in both
  Night blocks if it is an interface colour) and to the guide, rather than a literal.
- **Two themes.** Paper and Night, both checked. Map colours (`map-*` and the data palettes) are the same in both.
- **Three typefaces, three jobs.** Cormorant Garamond (`--font-display`) for headings and names, 20 px and up only;
  EB Garamond (`--font-text`) for what people read and the names of controls; Libre Franklin (`--font-ui`) for every
  button, tab, chip, label and number. The type styles are `og-t-<style>` in `tokens.css`.
- **Colour roles.** `accent` is for doing: one primary action per view. `gold` is ornament only, never text and never
  clickable (`gold-ink` for small-caps eyebrows). Layer colours (`layer-*`) mark the interface, never the data.
- **Ornament frames the world, never the controls.** One double rule per page (under the masthead). No compass rose,
  no Roman numerals, no corner squares, no ink-and-gold outlines on cards or buttons, no emoji.
- **Words.** Sentence case for buttons, labels, headings and chips. Buttons say exactly what happens, verb first.
  Controls are named by their effect ("Temperature", not "Greenhouse"); ask before swapping in a precise term. Units
  follow a space (34 °C, 2,350 mm). Near people and food: *could*, not *will*. No hype, no exclamation marks.
- **Phones.** Every control 44 px or more; tooltips above their trigger; the bottom sheet at 768 px and under.
- **Access.** Text 4.5:1 on its ground (3:1 at 24 px and up); marks and borders that carry meaning 3:1; the 2 px
  `focus` ring on every control; nothing moves under `prefers-reduced-motion`; colour is never alone (labels, the
  readout, patterns).

## Map colours

1. Name the map's question: a standard, how much, which side, which kind, or where.
2. A standard exists (Köppen, the height palettes, Satellite, Rocks): use it exactly and stop.
3. Draw from the palettes in `maps.md`, in their fixed order. Never generate hues; never cycle a palette.
4. At most eight hues on screen. More kinds than that: colour the families, put the members in words (legend rows,
   readout, finder), and let a picked member take the spotlight.
5. Check every pair, not only neighbours: on a map any two colours can touch. Run the dataviz skill's
   `validate_palette.js` with `--pairs all` in light and dark: normal sight 15 or more; colour-blind 8 or more (6–8
   only with labels). Record the result in `maps.md`'s table.
6. Look at it on the globe, on Paper and on Night.

## Check before you finish

- `node v2/tools/check-style.mjs` passes: no literal colours in the stylesheets or on the pages, no new `--ui-*`
  role, no undefined `var(--…)`, no literal colour set from interface JS. In this repo a hook runs it after every edit
  to a stylesheet, a page or interface JS and reports only when something is wrong.
- Look at the change in Chrome: Paper and Night, at 1440 px and 400 px.
- Anything the change adds to the look, or bends, is written into `docs/style-guide/` (and `tokens.css`) in the same
  change. Tell the owner when the design-system artifact needs the same update (it is linked from the plan).
- The other rules in `CLAUDE.md` still apply: the docs, the tutorials, What's New, phones per each tool's profile.
