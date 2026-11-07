# World Orogen — Vision

**Believable worlds from the ground up: a free studio of planet tools that gets you from a blank page to a world that
makes sense.**

This file is the project's foundation: what Orogen is, who it is for, what each tool is for, and how to decide when goals
conflict. It is a living document: it changes when the vision does, on purpose. `CLAUDE.md` imports it; the README
carries a short public version. When a change would contradict something here, flag it. Don't quietly drift.

## How we got here

- **v1 (March 2026): concept art for planets.** One fast generator: sliders, Ctrl-click plates, a climate no other map
  tool had. Its test was the *glance*: does it look real at first sight?
- **v2 (October 2026): a world with a past.** v1 painted terrain from a single frozen snapshot. It looked right, but it
  couldn't make what makes real planets read as real: old ranges far from any plate edge, coasts that fit across an ocean,
  ancient shields. Evolution simulates the history instead. It automates the hand methods of the worldbuilding guides
  (Worldbuilding Pasta's GPlates workflow; Madeline James's rocks, ores and food). From that history come the land, its
  climate, its rocks and what it can feed. The test became *does it hold up when you look closer, and does it make sense?*
- **The Studio.** Generate, Import and Evolution became separate ways into the same idea, under one home page.

Orogen is now beyond concept art, but it keeps concept art's instinct: the output has to look good first.

## Who it's for

1. **Curious explorers who become science-minded worldbuilders.** Someone opens a link, watches a world form, pokes at it
   and gets hooked on why things are where they are: the Artifexian / Worldbuilding Pasta / Madeline James crowd. Design
   for both ends of that journey at once: approachable on first open, deep when they dig.
2. **Storytellers and game masters** who want a believable map for a novel or campaign, fast.
3. **Artists and game developers** who need heightmaps and data to carry into other tools (Gaea, engines, Photoshop).

## What every tool shares

- **Free and open source**, for people to use. GPL-3.0. No paywalls, tiers, ads or accounts. Ko-fi is optional and
  nothing is locked. The maps people make are theirs, commercially too.
- **Zero friction.** Open a URL and you are making a world: in the browser, no install, no account, no server, no build
  step.
- **Globe first.** A true globe with proper wrapping. Flat maps (in any projection) are a second view.
- **The climate is the spine.** Every tool's world gets the full seasonal climate (wind, currents, rain, Köppen). It is
  the most-cited reason people choose Orogen. Never simplify it; new layers should build on it.
- **Worlds are permanent.** Every seed, link and planet file ever shared opens again, and each minor release stays online
  at `orogen.studio/v/<major>.<minor>/`.

## The pillars

Weigh all three together. When they conflict, break ties in this order:

1. **Artistic appeal.** It looks compelling at every scale, from the whole planet to the zoomed-in close-up. It is informed
   by science but not constrained by it.
2. **Ease of use and efficiency.** Approachable, and fast for what the tool is for. Each tool sets its own speed target
   (see the tool profiles).
3. **Scientific plausibility, and every feature has a cause.** Grounded in real planetary science and believable rather
   than precise. Beyond believable, *coherent*: a mountain range, a desert, an ore body, a breadbasket each exists because
   of something the world did, not because noise put it there. Prefer a cause the world can trace over decoration that
   only looks right.

### How results are judged

- **Looks are judged by eye, at both scales.** Real data (Blue Marble, observed climate) is a reference, not a target.
  When a change is more literal but less legible, prefer legible. The aim is a clear improvement in the overall feel, not
  perfection; stop when the gain is clear and what remains is small or costly.
- **Earth is a benchmark, not gospel.** Simulations run on worlds that are not Earth, so every tunable is a physical
  quantity with a literature range, never a fix for Earth's geography. Tune on the whole Earth, score each continent
  separately so none gets worse, and check on synthetic planets too. A high Earth score bought by overfitting is a
  regression.

## The tools

Each tool is a different way into a believable world. They are equals in the long run, even when one gets most of the
attention for a while. Today that is Evolution, and the others are brought up to the same completeness later.

| | **Generate** | **Import** | **Evolution** |
|---|---|---|---|
| The way in | A planet in seconds, shaped by hand | Your own landmass, its climate | A planet with a past |
| Optimises for | Speed and fast iteration | Showing how a drawn or real world would behave | Depth and cause; science weighs a little more here |
| Speed target | Seconds. Never slow generation down to chase accuracy; if a shortcut looks as good, use it | Seconds | Something to watch within seconds (it builds while you watch); minutes are fine for depth that is asked for and says what it costs |
| Control | The most direct: sliders and plate editing (Ctrl-click → Rebuild; edit mode on a phone) | Your map is the input; sculpting knobs | Few knobs (three sliders, settings folded away) and a chosen ending |
| Phones | Fully phone-friendly: the most mobile of the tools | Phone-friendly | Phones explore (open links and planet files, look at every view, export); building can stay desktop-first |
| Where it's heading | Parity with Evolution: its believability through fast approximations, and every downstream layer (geology, food, satellite look, fine detail) on its worlds | Parity where it fits (decided as it comes) | Deeper history, and the layers downstream of it |

New tools may come. Each gets its own column here before it is built.

## Scope

### Possible worlds, from the ground up

Orogen builds a world from the ground up: plates and their history first, then the land, its climate, its water and ice,
its rock, and what the land could feed. Each layer rests on the ones below, and the science says a great deal about
each. But it never settles everything. Even in the physics, much is a roll of the dice: where a rift opens, which
continents meet, where a hotspot rises. Every feature has a cause, but the causes themselves are rolled; a seed is one
history out of countless possible ones.

The higher up the layers, the fuzzier the line between what the ground decides and what chance decides. Once people are
involved, chance and choice count for more than the ground. So Orogen makes **possible worlds, not predictions**. It
generates the inputs: the ground that people then build on, whether they are worldbuilders deciding for themselves or
peoples simulated in a tool, Orogen's or another's. Its tools today sit low in the layers, where the science is firmest.
As they reach higher:

- **Say what the land allows, not what its people are.** Near the people layers (soil, farmland, staple food, how people
  might live), describe possibilities and tendencies: *could*, not *will*. Geography sets the odds; it doesn't write the
  story.
- **Lean on the theories, knowingly.** Worldbuilders and programmers alike can only build worlds by leaning on
  theories, and simplifying them is a strength: it is what makes a world buildable at all. Use them openly, name them, and
  treat what they give as one possible outcome, never destiny. The closer to people, the more care: some of that science
  has a troubled past.
- **Clear lines between the layers.** Each layer should stand on its own, with a visible line between what it takes from
  the layers below and what it hands up, so anyone can pick the world up at any layer and start making different
  choices: a worldbuilder who keeps the climate and invents their own peoples, or a tool that takes the farmland and
  simulates who settles it.

### Boundaries

- **Generator, not editor, as a gradient.** The existing tools are generators: knobs, seeds and steering, never brushes or
  drawing. Steering is a feature, and tools differ in how much they offer: Generate gives more direct control than
  Evolution. A future tool could be editor-first, but the existing ones don't drift into editors.
- **Earth-like worlds are the core.** Exotic settings (tilt, spin direction, size, a different star) come later, as knobs
  that work through the physics, never as one-off hacks.
- **Followable by those who know.** The app doesn't set out to teach. Instead, anyone who has read the guides, watched
  the videos or knows the science should be able to follow what each tool is doing, and see where it is wrong or taking a
  shortcut. Its methods are recognisable and credited, not hidden. The learning itself happens in the guides (the Studio
  links them) and maybe in companion media.
- **Orogen's own identity.** Other tools aren't rivals to copy: the more tools the merrier. Orogen follows one artistic
  vision, its author's, set out in this living document. Users' requests are welcome input, not a roadmap. It does keep up
  with what is common across the space, so it never falls out of date.

## What users love (protect these)

Any change should preserve or enhance these and never degrade them as a side effect. If a change trades one for another,
say so.

1. **Climate depth.** "The only map generator with this level of detail." Every climate layer stays, and new features
   lean on it (rivers fed by rain, food by growing season).
2. **Instant and zero-friction.** A world from a URL, with no sign-up and no install.
3. **Watching a world form.** The history plays like a film as it builds: supercontinents breaking up and gathering
   again, a timeline to scrub, an ending to choose.
4. **Exports and data.** Every map, as colour or 16-bit data on documented scales, in ten projections, plus planet
   files: ready for whatever comes next.
5. **A true globe.** Globe first, with seamless wrapping.
6. **Free and open source.** A trust signal. No paywalls, no "pro" tier.
7. **Terrain aesthetics.** Fractal-looking mountains, organic coastlines, believable erosion, and detail that holds up
   close.
8. **Plate editing (Generate).** "Haven't seen this functionality anywhere else." Don't break the Ctrl-click →
   Rebuild pattern; extend it.
9. **It runs on phones.** Per each tool's commitment above. Generate most of all.
