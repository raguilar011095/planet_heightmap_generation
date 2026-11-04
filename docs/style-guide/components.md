# Components

The twenty pieces of the World Orogen interface, as plain HTML and CSS on the tokens (`tokens.css`). The app has no build step and no framework, so each component is the markup to write and the `og-` classes that style it.

- **`components.css`** is the reference implementation: every `og-` class. Pick a layer with `.is-plates`, `.is-land`, `.is-climate`, `.is-rock` or `.is-food` on the component or any parent; it sets `--l`, `--l-ink` and `--l-tint`.
- **`components.js`** adds the few behaviours they need: call `Orogen.wire()` once, and segmented controls, tabs, world pickers and sliders work (`aria-pressed` and `aria-selected` follow the click; an `og-change` event carries the value).
- Images in the markup (`renders/…`) stand for a render of a world; the page supplies its own.
- The app doesn’t load either file yet. Each phase of [`plans/REDESIGN_PLAN.md`](../../plans/REDESIGN_PLAN.md) moves the pieces it needs into the app’s stylesheets.

## Brand

### Logo

The mark is a ring of ink holding three strata, violet, ochre and blue (Plates, Land, Climate). Set it beside the name in Cormorant Garamond for the lockup.

**Markup.** Inline the SVG so the ring takes `ink` and the strata take `logo-violet`, `logo-ochre`, `logo-blue`:
`<span class="og-logo"><svg class="og-mark">…</svg><span class="og-logo__word">World Orogen</span></span>`. The files in Logos (`orogen-mark.svg`, `orogen-mark-night.svg`) are for places that can only take an image.

- Sizes: 34–36px in a tool header with the name at 26px; 40–42px on the Studio with the name at 34px; the favicon is the same mark at 32 and 16.
- Clear space: half the mark’s width on every side.
- Do: keep the strata clipped inside the circle; on the night theme the ring turns ivory, the strata stay.
- Don’t: recolour the strata, outline it, add the degree ring to it, or set the name in another face.
- The mark is the current choice; its colours may still change.

<details><summary>Markup</summary>

```html
<div class="og-demo" style="align-items: center; gap: 40px">
<svg class="og-mark" width="96" height="96" viewBox="0 0 32 32" aria-hidden="true"><defs><clipPath id="m1"><circle cx="16" cy="16" r="12.8"></circle></clipPath></defs><g clip-path="url(#m1)"><rect class="og-mark__s1" x="0" y="9.6" width="32" height="3.2"></rect><rect class="og-mark__s2" x="0" y="14.4" width="32" height="3.2"></rect><rect class="og-mark__s3" x="0" y="19.2" width="32" height="3.2"></rect></g><circle class="og-mark__ring" cx="16" cy="16" r="13.6"></circle></svg>
<span class="og-logo"><svg class="og-mark" width="36" height="36" viewBox="0 0 32 32" aria-hidden="true"><defs><clipPath id="m2"><circle cx="16" cy="16" r="12.8"></circle></clipPath></defs><g clip-path="url(#m2)"><rect class="og-mark__s1" x="0" y="9.6" width="32" height="3.2"></rect><rect class="og-mark__s2" x="0" y="14.4" width="32" height="3.2"></rect><rect class="og-mark__s3" x="0" y="19.2" width="32" height="3.2"></rect></g><circle class="og-mark__ring" cx="16" cy="16" r="13.6"></circle></svg><span class="og-logo__word">World Orogen</span></span>
<span class="og-logo"><svg class="og-mark" width="42" height="42" viewBox="0 0 32 32" aria-hidden="true"><defs><clipPath id="m3"><circle cx="16" cy="16" r="12.8"></circle></clipPath></defs><g clip-path="url(#m3)"><rect class="og-mark__s1" x="0" y="9.6" width="32" height="3.2"></rect><rect class="og-mark__s2" x="0" y="14.4" width="32" height="3.2"></rect><rect class="og-mark__s3" x="0" y="19.2" width="32" height="3.2"></rect></g><circle class="og-mark__ring" cx="16" cy="16" r="13.6"></circle></svg><span class="og-logo__word" style="font-size: 34px">World Orogen</span></span>
<span style="display: flex; align-items: center; gap: 14px; padding: 10px 14px; border: 1px solid var(--rule); border-radius: 10px; background: var(--surface)"><span class="og-tag">Tab</span><svg class="og-mark" width="32" height="32" viewBox="0 0 32 32" aria-hidden="true"><defs><clipPath id="m4"><circle cx="16" cy="16" r="12.8"></circle></clipPath></defs><g clip-path="url(#m4)"><rect class="og-mark__s1" x="0" y="9.6" width="32" height="3.2"></rect><rect class="og-mark__s2" x="0" y="14.4" width="32" height="3.2"></rect><rect class="og-mark__s3" x="0" y="19.2" width="32" height="3.2"></rect></g><circle class="og-mark__ring" cx="16" cy="16" r="13.6"></circle></svg><svg class="og-mark" width="16" height="16" viewBox="0 0 32 32" aria-hidden="true"><defs><clipPath id="m5"><circle cx="16" cy="16" r="12.8"></circle></clipPath></defs><g clip-path="url(#m5)"><rect class="og-mark__s1" x="0" y="9.6" width="32" height="3.2"></rect><rect class="og-mark__s2" x="0" y="14.4" width="32" height="3.2"></rect><rect class="og-mark__s3" x="0" y="19.2" width="32" height="3.2"></rect></g><circle class="og-mark__ring" cx="16" cy="16" r="13.6"></circle></svg></span>
</div>
```

</details>

## Navigation

### Masthead

The page header: the lockup, the tools as tabs, actions on the right, and the page’s one double rule under it.

**Consumer provides:** the lockup, an `og-tabs` nav with the current page marked `aria-current="page"`, and the actions in `og-masthead__end`.

- The double rule (`line-masthead` double, in `ink`) appears once per page, here. Nowhere else in the interface.
- The current tool is underlined in `gold`, exactly under the word, with no other highlight.
- Actions: quiet buttons for Inspect, a plain button for Export, and the theme switch: a small segmented button on `chip-track` with a hairline `rule` border, a sun and a moon, the theme in use raised on `chip-on` (a 44px target). 44px tall.
- On phones the tabs scroll sideways and the actions fold into the bottom sheet.

<details><summary>Markup</summary>

```html
<header class="og-masthead">
<span class="og-logo"><svg class="og-mark" width="36" height="36" viewBox="0 0 32 32" aria-hidden="true"><defs><clipPath id="mh"><circle cx="16" cy="16" r="12.8"></circle></clipPath></defs><g clip-path="url(#mh)"><rect class="og-mark__s1" x="0" y="9.6" width="32" height="3.2"></rect><rect class="og-mark__s2" x="0" y="14.4" width="32" height="3.2"></rect><rect class="og-mark__s3" x="0" y="19.2" width="32" height="3.2"></rect></g><circle class="og-mark__ring" cx="16" cy="16" r="13.6"></circle></svg><span class="og-logo__word">World Orogen</span></span>
<nav class="og-tabs" aria-label="Tools"><a class="og-tab" href="#">Studio</a><a class="og-tab" href="#" aria-current="page">Generate</a><a class="og-tab" href="#">Import Heightmap</a><a class="og-tab" href="#">Evolution</a></nav>
<div class="og-masthead__end"><button type="button" class="og-btn og-btn--quiet"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>Inspect</button><button type="button" class="og-btn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/></svg>Export</button><button type="button" class="og-btn og-btn--quiet og-btn--icon" aria-label="Switch to dark mode"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg></button></div>
</header>
```

</details>

### Tabs

Tabs switch what the map shows: the chosen one is set in 600 and underlined in `gold`, exactly under the word.

**Consumer provides:** `role="tablist"` with `og-tab` buttons, `aria-selected` on the chosen one. Add `og-tabs--bar` for 44px tap height. `Orogen.wire()` (or `Orogen.tabs(el)`) moves `aria-selected` on click.

- Views (Terrain, Satellite, Köppen…) are plain words. Layer tabs (Plates, Land, Climate, Rock, Food) may carry their layer’s dot, `.is-<layer>` with `og-tab__dot`.
- Don’t box, fill or colour the chosen tab; the underline is the whole signal.

<details><summary>Markup</summary>

```html
<div class="og-demo og-demo--col" style="gap: 6px">
<div class="og-tabs og-tabs--bar" role="tablist"><button type="button" class="og-tab" role="tab" aria-selected="false">Terrain</button><button type="button" class="og-tab" role="tab" aria-selected="false">Satellite</button><button type="button" class="og-tab" role="tab" aria-selected="true">Köppen</button><button type="button" class="og-tab" role="tab" aria-selected="false">Temperature</button><button type="button" class="og-tab" role="tab" aria-selected="false">Rain</button><button type="button" class="og-tab" role="tab" aria-selected="false">Wind</button></div>
<div class="og-tabs og-tabs--bar" role="tablist"><button type="button" class="og-tab is-plates" role="tab" aria-selected="false"><span class="og-tab__dot"></span>Plates</button><button type="button" class="og-tab is-land" role="tab" aria-selected="false"><span class="og-tab__dot"></span>Land</button><button type="button" class="og-tab is-climate" role="tab" aria-selected="true"><span class="og-tab__dot"></span>Climate</button><button type="button" class="og-tab is-rock" role="tab" aria-selected="false"><span class="og-tab__dot"></span>Rock</button><button type="button" class="og-tab is-food" role="tab" aria-selected="false"><span class="og-tab__dot"></span>Food</button></div>
</div>
```

</details>

### SectionHead

A section head names a group of controls or a legend: a 10 × 22 bar in the layer’s colour, then Cormorant 22px.

**Consumer provides:** a heading element with `og-section` and `.is-<layer>`; `og-section--plain` drops the bar for groups that are not a layer (the print maker’s The plate, The words).

- The bar is the layer colour’s only job in a control panel. Don’t colour the words.

<details><summary>Markup</summary>

```html
<div class="og-demo" style="gap: 32px; align-items: center">
<h3 class="og-section is-plates">The plates</h3><h3 class="og-section is-land">The land</h3><h3 class="og-section is-climate">The climate</h3><h3 class="og-section is-rock">The rock</h3><h3 class="og-section is-food">The food</h3><h3 class="og-section og-section--plain">The words</h3>
</div>
```

</details>

## Actions

### Button

Buttons do things; they say exactly what, verb first, in sentence case.

**Consumer provides:** a `<button>` (or `<a>` to go somewhere) with `og-btn`, plus `og-btn--primary` for the one main action, `og-btn--main` for the full-width panel button, `og-btn--quiet` for low-key actions, `og-btn--icon` for an icon alone (give it an `aria-label`).

- One `og-btn--primary` (`accent` with `on-accent`) per view: Build new world, Begin with Generate, Print this plate, Open Arden →.
- Secondary actions are plain buttons on `surface` with a `rule` border. A small layer dot (`og-btn__dot` with `.is-<layer>`) may say what an action touches (Rebuild: land).
- Links that act (`og-link`) are `accent` text, or a layer’s ink on a tool card, and end with an arrow when they go somewhere.
- Never black or white buttons; never letterspaced capitals.
- 44px tall at least (`size-touch`); the panel’s main button is 50px.

<details><summary>Markup</summary>

```html
<div class="og-demo" style="align-items: center">
<button type="button" class="og-btn og-btn--primary">Build new world</button>
<button type="button" class="og-btn is-land"><span class="og-btn__dot"></span>Rebuild</button>
<button type="button" class="og-btn is-rock"><span class="og-btn__dot"></span>Regenerate</button>
<button type="button" class="og-btn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/></svg>Export</button>
<button type="button" class="og-btn og-btn--quiet"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>Inspect</button>
<a class="og-link" href="#">Try Evolution →</a>
<a class="og-link is-climate" href="#">Open Import →</a>
<div style="width: 252px"><button type="button" class="og-btn og-btn--primary og-btn--main">Build new world</button></div>
</div>
```

</details>

### Segmented

A segmented control picks one of a few: a rounded track in `chip-track` with the chosen option raised on `chip-on`.

**Consumer provides:** `og-seg` with `og-seg__opt` buttons and `aria-pressed` on the chosen one. Use `og-seg--grid` with `--cols` for two rows (globe faces). `Orogen.wire()` (or `Orogen.segmented(el)`) moves `aria-pressed` on click and fires an `og-change` event with the option’s value.

- For two to five short options that change the view: Globe / Map, Year / Jan / Jul, Terrain / Satellite / Rocks, Flat / Oval, Ivory / Midnight.
- More than five, or long labels: use tabs or a list.
- Unchosen options are `muted`, the chosen one `ink` with `shadow-chip`. Sentence case, Libre Franklin 600.

<details><summary>Markup</summary>

```html
<div class="og-demo og-demo--col" style="gap: 14px">
<div class="og-seg"><button type="button" class="og-seg__opt" aria-pressed="true">Globe</button><button type="button" class="og-seg__opt" aria-pressed="false">Map</button></div>
<div class="og-seg"><button type="button" class="og-seg__opt" aria-pressed="true">Year</button><button type="button" class="og-seg__opt" aria-pressed="false">Jan</button><button type="button" class="og-seg__opt" aria-pressed="false">Jul</button></div>
<div class="og-seg og-seg--grid" style="--cols: 2; width: 252px"><button type="button" class="og-seg__opt" aria-pressed="false">Arden</button><button type="button" class="og-seg__opt" aria-pressed="true">Keshar</button><button type="button" class="og-seg__opt" aria-pressed="false">Norra</button><button type="button" class="og-seg__opt" aria-pressed="false">The south</button></div>
</div>
```

</details>

## Inputs

### Slider

A slider shows its name and its value above the track: name in EB Garamond (`control-label`), value in Cormorant (`value`).

**Consumer provides:** `og-slider` holding a `<label class="og-slider__top" for>` with `og-slider__name` and `og-slider__value`, and the `<input type="range">`. `Orogen.wire()` keeps the value text in step with the input; `data-format="{v}%"` adds a unit.

- Name controls by their effect (“Temperature”, never “Greenhouse”), in sentence case.
- Values carry their unit as the app writes it (30%, 0 °C, ±0%).
- Group sliders under a `og-section` with its layer bar; a hint line (`og-hint`, italic, `muted`) closes a group.
- The track takes `ink`; the hit area stays 44px tall on phones.

<details><summary>Markup</summary>

```html
<div class="og-demo" style="padding: 0"><div class="og-panel is-land">
<h3 class="og-section">The land</h3>
<div class="og-slider"><label class="og-slider__top" for="s1"><span class="og-slider__name">Plates</span><span class="og-slider__value" id="v1">80</span></label><input id="s1" type="range" min="4" max="120" value="80"></div>
<div class="og-slider"><label class="og-slider__top" for="s2"><span class="og-slider__name">Continents</span><span class="og-slider__value" id="v2">4</span></label><input id="s2" type="range" min="1" max="10" value="4"></div>
<div class="og-slider" data-format="{v}%"><label class="og-slider__top" for="s3"><span class="og-slider__name">Land coverage</span><span class="og-slider__value" id="v3">30%</span></label><input id="s3" type="range" min="0" max="100" value="30"></div>
<span class="og-hint">Ctrl-click a plate to raise or sink it, then Rebuild.</span>
</div></div>
```

</details>

### Field

Text fields, the textarea and the checkbox: a label in EB Garamond above a rounded field on `surface`.

**Consumer provides:** `og-field` with a `<label for>` and an `og-input` or `og-textarea`; `og-check` wraps a checkbox with its words on the left. `og-input--title` previews a display title (the print maker). `og-code` shows a planet code to copy.

- Labels name the thing (“Title”, “Line beneath”, “About this world”), sentence case.
- The checkbox takes `accent`. Fields are 44px tall at least, `radius-input`, a `rule` border.
- Write errors as what went wrong and how to fix it, under the field in `accent`.

<details><summary>Markup</summary>

```html
<div class="og-demo og-demo--col" style="max-width: 300px; gap: 12px">
<div class="og-field"><label for="f1">Title</label><input id="f1" class="og-input og-input--title" value="Arden"></div>
<div class="og-field"><label for="f2">Line beneath</label><input id="f2" class="og-input" style="font-style: italic" value="as it stands nine hundred million years after the first rift"></div>
<div class="og-field"><label for="f3">About this world</label><textarea id="f3" class="og-textarea">Simulated in World Orogen’s Evolution over nine hundred million years. Four continents are drifting apart.</textarea></div>
<label class="og-check">Place names<input type="checkbox" checked></label>
<div class="og-field"><span style="font: 500 13px/1 var(--font-ui); color: var(--muted)">Planet code</span><span class="og-code">a7f3kq9xp2b4m1z8c0d5e6</span></div>
</div>
```

</details>

## Content

### ToolCard

A tool card is a way in: the whole card is the link, with an icon tile and a call to action in the tool’s layer.

**Consumer provides:** an `<a class="og-toolcard is-<layer>">` with the head (tile + name + meta pill), one sentence, and the `og-toolcard__cta` row.

- Each tool takes the layer it starts from: Generate is Land, Import Heightmap is Climate, Evolution is Plates. A new tool picks its layer the same way.
- The meta pill says the speed or the input (“Takes seconds”, “Your map”, “Takes minutes”).
- One plain sentence of what you get; no numbering, no Roman numerals.
- Three in a row on the desktop, stacked on phones.

<details><summary>Markup</summary>

```html
<div class="og-demo" style="flex-wrap: nowrap">
<a class="og-toolcard is-land" href="#"><span class="og-toolcard__head"><span class="og-toolcard__tile"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h9M18 6h3M3 12h2M11 12h10M3 18h7M16 18h5M15 3.6v4.8M8 9.6v4.8M13 15.6v4.8"/></svg></span><span class="og-toolcard__names"><span class="og-toolcard__name">Generate</span><span class="og-toolcard__meta">Takes seconds</span></span></span><p class="og-toolcard__text">A planet in seconds from a few sliders. Reshape any plate you don’t like and build again.</p><span class="og-toolcard__cta"><span>Open Generate</span><span>→</span></span></a>
<a class="og-toolcard is-climate" href="#"><span class="og-toolcard__head"><span class="og-toolcard__tile"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h8l4 4v14H6zM14 3v4h4M8.5 15.5c1.4-1.8 2.9-2 4.1-1s2.4 1 3.4-.6"/></svg></span><span class="og-toolcard__names"><span class="og-toolcard__name">Import Heightmap</span><span class="og-toolcard__meta">Your map</span></span></span><p class="og-toolcard__text">Bring a map you drew. See what its winds, rain and climate zones would really be.</p><span class="og-toolcard__cta"><span>Open Import</span><span>→</span></span></a>
<a class="og-toolcard is-plates" href="#"><span class="og-toolcard__head"><span class="og-toolcard__tile"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 9.5c1.2-2.8 4.6-3.3 6-1.4s.3 4.6-2.2 5-4.3-1-3.8-3.6zM14 14.5c1.3-2.4 4.6-2.8 5.6-.9s-.1 4.6-2.5 4.9-3.8-1.4-3.1-4zM11.5 5.5h5m-1.8-1.8 1.8 1.8-1.8 1.8"/></svg></span><span class="og-toolcard__names"><span class="og-toolcard__name">Evolution</span><span class="og-toolcard__meta">Takes minutes</span></span></span><p class="og-toolcard__text">A planet with a past. Watch it rift and collide, then add detail to the moment you choose.</p><span class="og-toolcard__cta"><span>Open Evolution</span><span>→</span></span></a>
</div>
```

</details>

### EssayCard

An Orogen Explains card: a layer tag, the essay’s title as a question or claim, one line under it, and Read →.

**Consumer provides:** an `<a class="og-essay is-<layer>">` with an `og-tag`, `og-essay__title`, `og-essay__dek` and `og-essay__more`.

- The tag names the layer the essay is about (Climate, Tectonics, Geology, Food), with the reading time if known.
- The featured essay may carry a small engraved sketch on the left, drawn in ink hatching on `paper-ivory`.

<details><summary>Markup</summary>

```html
<div class="og-demo" style="flex-wrap: nowrap">
<a class="og-essay is-climate" href="#"><span class="og-tag">Climate · Four minutes</span><span class="og-essay__title">Why one side of a mountain is green</span><span class="og-essay__dek">A rain shadow, explained with one slider.</span><span class="og-essay__more">Read the essay →</span></a>
<a class="og-essay is-plates" href="#"><span class="og-tag">Tectonics</span><span class="og-essay__title">How ranges rise</span><span class="og-essay__dek">Collisions, old seams, and what they leave behind.</span><span class="og-essay__more">Read →</span></a>
<a class="og-essay is-rock" href="#"><span class="og-tag">Geology</span><span class="og-essay__title">Where ores hide</span><span class="og-essay__dek">What a world’s history leaves in the rock.</span><span class="og-essay__more">Read →</span></a>
</div>
```

</details>

### Tag

Tags label a card’s subject; highlights mark a term in running text. Both take a layer’s tint and ink.

**Consumer provides:** `<span class="og-tag is-<layer>">` (11px capitals) or `<span class="og-hl is-<layer>">` around a word.

- Tags and eyebrows are the only text in capitals.
- Highlight the words a figure or a sidenote picks up again, a few per paragraph at most.
- A highlight’s colour says which layer the idea belongs to: rain is Climate, ranges are Land, plates are Plates.

<details><summary>Markup</summary>

```html
<div class="og-demo" style="align-items: center">
<span class="og-tag is-plates">Tectonics</span><span class="og-tag is-land">Land</span><span class="og-tag is-climate">Climate</span><span class="og-tag is-rock">Geology</span><span class="og-tag is-food">Food</span><span class="og-tag">In beta</span>
<span style="font: 400 21px/1.65 var(--font-text); color: var(--ink)">Clouds build on the <span class="og-hl is-climate">windward</span> side, leaving a <span class="og-hl is-land">rain shadow</span> as <span class="og-hl is-plates">plates</span> raise the range.</span>
</div>
```

</details>

### Sidenote

A sidenote sits in the 300px column beside an Explains essay, level with the passage it adds to.

**Consumer provides:** `og-sidenote is-<layer>` with a title (a question or a short claim) and two or three sentences.

- The rule and the title take the layer of the highlighted word it explains.
- Credit sources by name in a Go deeper note.

<details><summary>Markup</summary>

```html
<div class="og-demo" style="gap: 40px">
<div class="og-sidenote is-climate"><span class="og-sidenote__title">Why does rising air cool?</span><span class="og-sidenote__text">Higher up there’s less air pressing down, so a rising parcel expands, and expanding air cools.</span></div>
<div class="og-sidenote is-land"><span class="og-sidenote__title">The dry wind has names</span><span class="og-sidenote__text">The warm, dry wind coming down the lee is the foehn in the Alps and the chinook in the Rockies.</span></div>
<div class="og-sidenote is-plates"><span class="og-sidenote__title">Go deeper</span><span class="og-sidenote__text">Worldbuilding Pasta’s climate series covers rain shadows and much more, the way Orogen’s climate follows them.</span></div>
</div>
```

</details>

### Callout

The call to action at the end of an essay: a tinted panel, one primary button, one link.

**Consumer provides:** `og-callout is-<layer>` with `og-callout__text` (title + where to find it), an `og-btn--primary` and an `og-link`.

- Say where the thing lives in the app, as a path of real labels.
- One per essay, after the In Orogen section.

<details><summary>Markup</summary>

```html
<div class="og-demo" style="display: block"><div class="og-callout is-climate" style="max-width: 720px">
<div class="og-callout__text"><span class="og-callout__title">See it on your own world</span><span class="og-callout__sub">Free, in your browser. Climate → More → Rain Shadow.</span></div>
<a class="og-btn og-btn--primary" href="#">Open Generate</a><a class="og-link is-plates" href="#">Try Evolution →</a>
</div></div>
```

</details>

### WorldPicker

The worlds panel on the Studio: pick a ready-made world and a view, then open it. The big picture sits to the right.

**Consumer provides:** an `og-world-panel` holding an eyebrow, a title, an `og-worlds` list of `og-world` buttons (thumbnail, name, age), a view `og-seg` and the primary Open button; the picture beside it is the chosen world in the chosen view.

- Worlds are real seeds rendered by the tools, named, with their age in words.
- The chosen world is raised on `surface`; the others sit flat.

<details><summary>Markup</summary>

```html
<div class="og-demo"><div class="og-world-panel" style="width: 330px"><div style="display: flex; flex-direction: column; gap: 14px">
<span class="og-eyebrow">From the atlas</span><span style="font: 500 42px/1 var(--font-display)">Worlds to explore</span>
<div class="og-worlds"><button type="button" class="og-world" aria-pressed="true"><img src="renders/globe-satellite.webp" alt=""><span class="og-world__text"><span class="og-world__name">Arden</span><span class="og-world__sub">nine hundred million years in</span></span></button><button type="button" class="og-world" aria-pressed="false"><img src="renders/globe-terrain.webp" alt=""><span class="og-world__text"><span class="og-world__name">Thessaly</span><span class="og-world__sub">three hundred million years in</span></span></button></div>
<div class="og-seg"><button type="button" class="og-seg__opt" aria-pressed="true">Terrain</button><button type="button" class="og-seg__opt" aria-pressed="false">Satellite</button><button type="button" class="og-seg__opt" aria-pressed="false">Rocks</button></div>
<a class="og-btn og-btn--primary" href="#" style="align-self: flex-start">Open Arden →</a>
</div></div></div>
```

</details>

## Maps

### GlobeFrame

The globe as Orogen draws it by default: atlas light from the upper left, gentle relief under every colour, the quiet sea, a thin rim of air, and the degree ring at home zoom.

**Consumer provides:** the world’s picture (an orthographic disc), the light mask (`light-atlas.webp` in Maps, multiplied over it), and any pins inside `og-globe__marks` (positions in % of the disc). Size it with `--globe`.

- Stage: `desk` (it follows the page theme: paper by day, navy at night). `stage-space` with stars is the optional cinematic look, never the default.
- Ring: `gold`, ticks every 5°, longer every 30°, 300 / 680 of the frame; it fades as you zoom in.
- Air: `map-air`, thin. No heavy glow on paper.
- The globe is the star: nothing sits on it but pins, the place marker and names.
- In the app this is the Three.js scene; these are the defaults it should reach (see Maps and the globe).

<details><summary>Markup</summary>

```html
<div class="og-demo og-demo--desk" style="gap: 40px">
<div class="og-globe" style="--globe: 340px"><svg class="og-globe__ring" viewBox="0 0 680 680" aria-hidden="true"><circle cx="340.0" cy="340.0" r="300" stroke-width="1.4"></circle><path d="M340.0 40.0L340.0 28.0M366.1 41.1L366.7 35.2M392.1 44.6L393.1 38.6M417.6 50.2L419.2 44.4M442.6 58.1L444.7 52.5M466.8 68.1L469.3 62.7M490.0 80.2L496.0 69.8M512.1 94.3L515.5 89.3M532.8 110.2L536.7 105.6M552.1 127.9L556.4 123.6M569.8 147.2L574.4 143.3M585.7 167.9L590.7 164.5M599.8 190.0L610.2 184.0M611.9 213.2L617.3 210.7M621.9 237.4L627.5 235.3M629.8 262.4L635.6 260.8M635.4 287.9L641.4 286.9M638.9 313.9L644.8 313.3M640.0 340.0L652.0 340.0M638.9 366.1L644.8 366.7M635.4 392.1L641.4 393.1M629.8 417.6L635.6 419.2M621.9 442.6L627.5 444.7M611.9 466.8L617.3 469.3M599.8 490.0L610.2 496.0M585.7 512.1L590.7 515.5M569.8 532.8L574.4 536.7M552.1 552.1L556.4 556.4M532.8 569.8L536.7 574.4M512.1 585.7L515.5 590.7M490.0 599.8L496.0 610.2M466.8 611.9L469.3 617.3M442.6 621.9L444.7 627.5M417.6 629.8L419.2 635.6M392.1 635.4L393.1 641.4M366.1 638.9L366.7 644.8M340.0 640.0L340.0 652.0M313.9 638.9L313.3 644.8M287.9 635.4L286.9 641.4M262.4 629.8L260.8 635.6M237.4 621.9L235.3 627.5M213.2 611.9L210.7 617.3M190.0 599.8L184.0 610.2M167.9 585.7L164.5 590.7M147.2 569.8L143.3 574.4M127.9 552.1L123.6 556.4M110.2 532.8L105.6 536.7M94.3 512.1L89.3 515.5M80.2 490.0L69.8 496.0M68.1 466.8L62.7 469.3M58.1 442.6L52.5 444.7M50.2 417.6L44.4 419.2M44.6 392.1L38.6 393.1M41.1 366.1L35.2 366.7M40.0 340.0L28.0 340.0M41.1 313.9L35.2 313.3M44.6 287.9L38.6 286.9M50.2 262.4L44.4 260.8M58.1 237.4L52.5 235.3M68.1 213.2L62.7 210.7M80.2 190.0L69.8 184.0M94.3 167.9L89.3 164.5M110.2 147.2L105.6 143.3M127.9 127.9L123.6 123.6M147.2 110.2L143.3 105.6M167.9 94.3L164.5 89.3M190.0 80.2L184.0 69.8M213.2 68.1L210.7 62.7M237.4 58.1L235.3 52.5M262.4 50.2L260.8 44.4M287.9 44.6L286.9 38.6M313.9 41.1L313.3 35.2" stroke-width="1"></path></svg><img class="og-globe__img" src="renders/globe-koppen.webp" alt="Arden, Köppen zones, on the quiet sea"><img class="og-globe__light" src="renders/light-atlas.png" alt=""><span class="og-globe__air"></span><div class="og-globe__marks"></div></div>
<div class="og-globe" style="--globe: 340px"><svg class="og-globe__ring" viewBox="0 0 680 680" aria-hidden="true"><circle cx="340.0" cy="340.0" r="300" stroke-width="1.4"></circle><path d="M340.0 40.0L340.0 28.0M366.1 41.1L366.7 35.2M392.1 44.6L393.1 38.6M417.6 50.2L419.2 44.4M442.6 58.1L444.7 52.5M466.8 68.1L469.3 62.7M490.0 80.2L496.0 69.8M512.1 94.3L515.5 89.3M532.8 110.2L536.7 105.6M552.1 127.9L556.4 123.6M569.8 147.2L574.4 143.3M585.7 167.9L590.7 164.5M599.8 190.0L610.2 184.0M611.9 213.2L617.3 210.7M621.9 237.4L627.5 235.3M629.8 262.4L635.6 260.8M635.4 287.9L641.4 286.9M638.9 313.9L644.8 313.3M640.0 340.0L652.0 340.0M638.9 366.1L644.8 366.7M635.4 392.1L641.4 393.1M629.8 417.6L635.6 419.2M621.9 442.6L627.5 444.7M611.9 466.8L617.3 469.3M599.8 490.0L610.2 496.0M585.7 512.1L590.7 515.5M569.8 532.8L574.4 536.7M552.1 552.1L556.4 556.4M532.8 569.8L536.7 574.4M512.1 585.7L515.5 590.7M490.0 599.8L496.0 610.2M466.8 611.9L469.3 617.3M442.6 621.9L444.7 627.5M417.6 629.8L419.2 635.6M392.1 635.4L393.1 641.4M366.1 638.9L366.7 644.8M340.0 640.0L340.0 652.0M313.9 638.9L313.3 644.8M287.9 635.4L286.9 641.4M262.4 629.8L260.8 635.6M237.4 621.9L235.3 627.5M213.2 611.9L210.7 617.3M190.0 599.8L184.0 610.2M167.9 585.7L164.5 590.7M147.2 569.8L143.3 574.4M127.9 552.1L123.6 556.4M110.2 532.8L105.6 536.7M94.3 512.1L89.3 515.5M80.2 490.0L69.8 496.0M68.1 466.8L62.7 469.3M58.1 442.6L52.5 444.7M50.2 417.6L44.4 419.2M44.6 392.1L38.6 393.1M41.1 366.1L35.2 366.7M40.0 340.0L28.0 340.0M41.1 313.9L35.2 313.3M44.6 287.9L38.6 286.9M50.2 262.4L44.4 260.8M58.1 237.4L52.5 235.3M68.1 213.2L62.7 210.7M80.2 190.0L69.8 184.0M94.3 167.9L89.3 164.5M110.2 147.2L105.6 143.3M127.9 127.9L123.6 123.6M147.2 110.2L143.3 105.6M167.9 94.3L164.5 89.3M190.0 80.2L184.0 69.8M213.2 68.1L210.7 62.7M237.4 58.1L235.3 52.5M262.4 50.2L260.8 44.4M287.9 44.6L286.9 38.6M313.9 41.1L313.3 35.2" stroke-width="1"></path></svg><img class="og-globe__img" src="renders/globe-terrain.webp" alt="Arden, terrain"><img class="og-globe__light" src="renders/light-atlas.png" alt=""><span class="og-globe__air"></span><div class="og-globe__marks"><span class="og-here" style="left: 50%; top: 52%"></span></div></div>
</div>
```

</details>

### MapPin

Pins mark places on the map with a number; the number is the name, the readout and the lists use it too.

**Consumer provides:** an absolutely placed `og-pin` (it centres itself on its point) with the number; `is-open` for the place the readout shows; `og-pin--kind` with `--c` for a pin that carries a kind (a hearth in its colour); `og-pin--founder` for a founding hearth; `og-pin--home` (◆) for a crop’s home; `og-here` rings the place a readout describes. `og-badge` is the same number in a list.

- Numbers are 1, 2, 3, never Roman.
- Pins use `pin-fill` and `pin-ink` on every map; only kind pins take a data colour.
- Where a pin already marks the readout’s place, leave the ring out.

<details><summary>Markup</summary>

```html
<div class="og-demo og-demo--desk" style="align-items: center; gap: 22px">
<span class="og-pin og-pin-static">2</span><span class="og-pin og-pin-static is-open">1</span>
<span class="og-pin og-pin-static og-pin--kind" style="--c: var(--cat-4)">4</span><span class="og-pin og-pin-static og-pin--kind og-pin--founder" style="--c: var(--cat-1)">1</span>
<span class="og-pin og-pin-static og-pin--home"></span>
<span style="position: relative; width: 30px; height: 30px"><span class="og-here" style="left: 15px; top: 15px"></span></span>
<span class="og-badge">2</span><span class="og-badge is-open">1</span>
</div>
```

</details>

### LegendCard

The key beside the map: at most eight rows, each a swatch, a name and its share, with members folded inside and a finder for the long tail.

**Consumer provides:** `og-card og-legend is-<layer>` with an `og-legend__head` (the view’s name; its bar takes the layer), rows (`og-legend__row`: `og-sw` with `--c`, `og-legend__name`, `og-legend__share`), `<details>` around a row whose members fold (`og-legend__members`), an `og-finder` and an `og-legend__foot` with the settings line.

- Eight rows on screen at most. More kinds than that: colour the families, list members inside their row, find the rest.
- Never a chip per item, and never a generated hue per member: members are words.
- Shares are “of the land”, rounded, with the unit; numbers in `muted`, tabular.
- Absence gets a pattern, not a hue (`og-pat-stipple` for wild foods).
- Köppen groups its 30 classes under A to E with `og-legend__group`; C, D, E fold by default.

<details><summary>Markup</summary>

```html
<div class="og-demo"><div class="og-card og-legend is-food" style="width: 380px">
<div class="og-legend__head">Staple food<span class="og-legend__sub">main on</span></div>
<details><summary><div class="og-legend__row"><span class="og-sw" style="--c: var(--staple-paddy)"></span><span class="og-legend__name">Paddy grains<small>Manchurian wild rice-like 10 %, indica rice-like II 7 % and 9 more ›</small></span><span class="og-legend__share">3 %</span></div></summary><div class="og-legend__members">northern wild rice-like 6 % · Manchurian wild rice-like II 6 % · indica rice-like III 5 % · African rice-like II 5 % · Amazonian rice-like 4 % · japonica rice-like 3 % · northern wild rice-like II 2 % · japonica rice-like II 1 %</div></details>
<details><summary><div class="og-legend__row"><span class="og-sw" style="--c: var(--staple-cool)"></span><span class="og-legend__name">Cool-season grains<small>einkorn-like 11 %, barley-like 10 % and 4 more ›</small></span><span class="og-legend__share">9 %</span></div></summary><div class="og-legend__members">teff-like 4 % · oats-like 3 % · bread wheat-like 3 % · emmer-like 2 %</div></details>
<details><summary><div class="og-legend__row"><span class="og-sw" style="--c: var(--staple-warm)"></span><span class="og-legend__name">Warm-season grains<small>browntop millet-like 21 %, foxtail millet-like 20 % and 8 more ›</small></span><span class="og-legend__share">27 %</span></div></summary><div class="og-legend__members">maygrass-like 16 % · little millet-like 16 % · broomcorn millet-like 15 % · fonio-like 14 % · sorghum-like 14 % · Job’s tears-like 14 % · pearl millet-like II 13 % · maize-like 2 %</div></details>
<div class="og-legend__row"><span class="og-sw" style="--c: var(--staple-roots)"></span><span class="og-legend__name">Roots &amp; tubers</span><span class="og-legend__share">9 %</span></div>
<div class="og-legend__row"><span class="og-sw" style="--c: var(--staple-tree)"></span><span class="og-legend__name">Tree &amp; palm crops</span><span class="og-legend__share">3 %</span></div>
<div class="og-legend__row"><span class="og-sw" style="--c: var(--staple-livestock)"></span><span class="og-legend__name">Livestock</span><span class="og-legend__share">29 %</span></div>
<div class="og-legend__row"><span class="og-sw" style="--c: var(--staple-fish)"></span><span class="og-legend__name">Fish</span><span class="og-legend__share">5 %</span></div>
<div class="og-legend__row"><span class="og-sw og-pat-stipple"></span><span class="og-legend__name">Wild foods</span><span class="og-legend__share">9 %</span></div>
<label class="og-finder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg><input aria-label="Find a staple crop or strain" placeholder="Find a staple crop or strain"></label>
<div class="og-legend__foot"><span>10,000 years · all farming tools · the planet’s own food seed</span><b>Settings ›</b></div>
</div></div>
```

</details>

### RampKey

Keys for “how much” and “which side”: a ramp bar with three labels, or a row of steps for grades and rungs.

**Consumer provides:** `og-ramp` with an `og-ramp__bar` of spans (one per stop, `background` from the ramp tokens) and `og-ramp__labels`; or `og-steps` with one span per step, `--c` its colour.

- Label the two ends and the middle that matters (0 °C, sea level, 12 a place) with units.
- Grades are one hue in strength (Poor, Moderate, Rich); rungs are one hue in strength (Main, 2nd, 3rd, Grown otherwise). Never a different hue per step.

<details><summary>Markup</summary>

```html
<div class="og-demo og-demo--col" style="max-width: 360px; gap: 18px">
<div class="og-ramp"><div class="og-ramp__bar"><span style="background: var(--ramp-variety-0)"></span><span style="background: var(--ramp-variety-1)"></span><span style="background: var(--ramp-variety-2)"></span><span style="background: var(--ramp-variety-3)"></span><span style="background: var(--ramp-variety-4)"></span><span style="background: var(--ramp-variety-5)"></span></div><div class="og-ramp__labels"><span>none</span><span>12 a place</span><span>23 or more</span></div></div>
<div class="og-ramp"><div class="og-ramp__bar"><span style="background: var(--temp-0)"></span><span style="background: var(--temp-1)"></span><span style="background: var(--temp-2)"></span><span style="background: var(--temp-3)"></span><span style="background: var(--temp-4)"></span><span style="background: var(--temp-5)"></span><span style="background: var(--temp-6)"></span><span style="background: var(--temp-7)"></span></div><div class="og-ramp__labels"><span>−40 °C</span><span>0 °C</span><span>40 °C</span></div></div>
<div class="og-steps"><span style="--c: color-mix(in srgb, var(--ore-base) 55%, var(--map-paper))">Poor</span><span style="--c: color-mix(in srgb, var(--ore-base) 80%, var(--map-paper))">Moderate</span><span style="--c: var(--ore-base)">Rich</span></div>
<div class="og-steps"><span style="--c: color-mix(in srgb, var(--layer-food) 92%, var(--map-paper))">Main</span><span style="--c: color-mix(in srgb, var(--layer-food) 56%, var(--map-paper))">2nd</span><span style="--c: color-mix(in srgb, var(--layer-food) 30%, var(--map-paper))">3rd</span><span style="--c: color-mix(in srgb, var(--layer-food) 14%, var(--map-paper))">Grown otherwise</span></div>
</div>
```

</details>

### PinnedPlaces

The tool’s readout of places the user pinned, under the map (a list beside the globe): muted and functional, so the map stays the star.

**Consumer provides:** an `og-places` table: a numbered `og-badge`, the place (`og-place`: a small swatch of its class, the name, the code), where, the values for the view, a remove control; `is-open` on the pin the map shows open.

- Numbers in Libre Franklin with tabular figures; units after a space (34 °C, 2,350 mm).
- The swatch is the place’s own class colour (here Köppen), the only colour in the table.
- Never an ornamented card, double frame or display-size numbers.

<details><summary>Markup</summary>

```html
<div class="og-demo" style="display: block"><table class="og-places" style="max-width: 852px">
<thead><tr><th></th><th>Pinned places</th><th style="text-align: left">Where</th><th>January</th><th>July</th><th>Rain in a year</th><th></th></tr></thead>
<tbody>
<tr class="is-open"><td><span class="og-badge is-open">1</span></td><td><span class="og-place"><span class="og-sw og-sw--sm" style="--c: var(--koppen-BWh)"></span><b>Hot desert</b><em>BWh</em></span></td><td class="og-where">18.0° S, 36.0° W</td><td>34 °C</td><td>21 °C</td><td>90 mm</td><td style="color: var(--muted)">×</td></tr>
<tr><td><span class="og-badge">2</span></td><td><span class="og-place"><span class="og-sw og-sw--sm" style="--c: var(--koppen-Af)"></span><b>Rainforest</b><em>Af</em></span></td><td class="og-where">7.2° N, 79.2° W</td><td>27 °C</td><td>26 °C</td><td>2,350 mm</td><td style="color: var(--muted)">×</td></tr>
<tr><td><span class="og-badge">3</span></td><td><span class="og-place"><span class="og-sw og-sw--sm" style="--c: var(--koppen-ET)"></span><b>Tundra</b><em>ET</em></span></td><td class="og-where">64.8° S, 18.0° E</td><td>4 °C</td><td>−22 °C</td><td>260 mm</td><td style="color: var(--muted)">×</td></tr>
</tbody></table></div>
```

</details>

### Readout

The readout names everything at one place, so the map can colour only what matters.

**Consumer provides:** `og-card og-readout` with an `og-readout__head` (what and where) and rows of `<b>` label + text; grades as `og-grade` dots.

- It carries what the colours leave out: every metal, every crop, the strain names, the numbers.
- Real labels from the view; no paraphrase, no invented values.
- On phones it opens from a tap, as a sheet.

<details><summary>Markup</summary>

```html
<div class="og-demo"><div class="og-card og-readout" style="width: 420px">
<div class="og-readout__head">In the ground here<span>36.4° N, 11.6° W</span></div>
<div class="og-readout__row"><b>Copper <span class="og-grade">●●●</span></b><span><em>porphyry copper, enriched copper</em></span></div>
<div class="og-readout__row"><b>Wood <span class="og-grade">●●●</span></b><span></span></div>
<div class="og-readout__row"><b>Silver <span class="og-grade">●○○</span></b><span><em>enriched copper, gossan</em></span></div>
<div class="og-readout__row"><b>Gold <span class="og-grade">●○○</span></b><span><em>orogenic gold, porphyry copper</em></span></div>
<span class="og-readout__note">Everything in the ground here, richest first. ●●● rich · ●●○ moderate · ●○○ poor</span>
</div></div>
```

</details>
