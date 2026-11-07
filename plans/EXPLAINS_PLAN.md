# Orogen Explains: plan

Draft, 2026-11-03. Phase R8 of `plans/REDESIGN_PLAN.md`. Nothing is built until the owner answers the questions below
and says go.

## What it is

Short illustrated essays on why worlds look the way they do, from the **6 · Hybrid II · blog post** boards (the owner:
"the 5A blog is great in terms of flow/alignment", with everyone else's styling). The page is the guide's
(`docs/style-guide/pages.md`, An Orogen Explains essay):

- The masthead with **Explains** underlined; a layer tag and "Orogen Explains · 4 min"; the `display` title (an italic
  accent word allowed); the dek in italic.
- The `essay` column (21 px EB Garamond, 720 px) with layer highlights; sidenotes in the side column, level with what they
  explain.
- Figures on a mat (`surface`, a `rule` border, `radius-lg`): an engraved diagram in ink hatching, its slider, two bars
  and a caption ("Figure 1." in `label`, then italic).
- An "In Orogen" section with a real render of a world, then the call to action; More from Orogen Explains (three essay
  cards); the footer.
- The Studio's Explains row comes back when the first essay exists (decided in the redesign plan).

## How it meets the vision

VISION.md: "The app doesn't set out to teach … The learning itself happens in the guides (the Studio links them) and
maybe in companion media." Explains is that companion media: outside the tools, linked from the Studio, never in the way
of making a world. It must keep the voice (`docs/style-guide/README.md`, Voice) and the scope's care near people: *could*,
not *will*.

## Questions for the owner

1. **Who writes them?** The owner, with Claude drafting from the owner's notes, or Claude drafting whole essays for the
   owner to edit? (The voice is the owner's; the guide's Voice section is the brief.)
2. **Which come first?** The boards had "Why one side of a mountain is green" (a rain shadow, explained with one
   slider), "How ranges rise" and a geology one. Three to launch with?
3. **How are they made?** Static HTML pages in the repo (`/explains/<slug>`, no build step, a shared template), or
   Markdown turned into pages by a small script run before committing (still no build step for the site)?
4. **The figures:** interactive (a slider moving an engraved diagram, in plain JS), or still images for a start?
5. **Search:** each essay its own title, description and social image (they could bring people in), and in the
   sitemap?

## Phases (once answered)

- **E1:** the essay template (the page pattern, the type, sidenotes, a figure on its mat), with one essay.
- **E2:** the interactive figure kit (a slider and an engraved diagram), the Studio's Explains row, the sitemap.
- **E3:** the next essays, as the owner writes or approves them.

Each phase stops for the owner to check it.
