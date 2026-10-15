---
name: explainer-page
description: >
  Turn a piece of finished technical work into a short, picture-first explainer page (an
  Artifact) for very non-technical readers: founders, designers, gym owners, sales. Mostly
  real screenshots, simple icon diagrams and visual numbers, with very few words. Use when
  the user wants to show or announce what was built to people who will never read the code
  or run the command. Triggers: "explainer", "explain this to non-technical people", "make a
  demo page", "something I can show the team", "for the CEO", "for Maja", "a page about what
  we built", "/explainer-page". Not for technical docs, specs, READMEs or PR descriptions.
---

# Explainer page

A one-page Artifact that shows what a piece of work does, for readers who do not code.
The reader should get it in 30 seconds by looking, not reading.

`assets/example.html` is a finished one (automated App Store screenshots). Read it before
writing. Copy its structure and CSS, not its words.

## Before writing

1. Find the real result to show: screenshots, generated files, a before/after. If there are
   none, make them (run the app, take screenshots). Never use mock-ups when the real thing
   exists.
2. Collect the facts from the work itself: what it produces, how many, what it uses (images,
   data) and where those are kept, what is left to do, what the reader must decide.
3. Check every claim about history. If the thing never existed before, do not say it "used to
   be done by hand". Say "by hand, it would take".

## Sections, in this order

Drop any section that has nothing true to say.

| Section | Form |
|---|---|
| Title | One plain sentence saying what it does. A small eyebrow label above it. One muted line below, at most |
| The result | Big real screenshots or outputs, side by side, with one or two words under each |
| How it works | 3 to 4 steps as a diagram: icon in a circle, a bold short label, a 3 to 6 word note, arrows between. Stacks vertically on phones |
| The numbers | A visual sum when it multiplies (11 × 2 × 2 = 44), with tiny drawn shapes in each tile. Skip if there is only one number |
| Why automate it | Two short checklists side by side: "By hand, it would take" and "Automated". Three items each |
| How choices are made | If the reader picks something (screens, items), show the full list as numbered chips, then a 3-step diagram: you pick → we update → it runs again |
| What it uses | Images shown big (faces round, other photos 3:2), with name and file name. Then a small folder map of where they are kept and how to replace them |
| Your part | One tinted box, one or two lines: exactly what the reader must decide or do |
| Coming next | Small pill labels with icons, three to five words each |

## Writing rules

- Very few words. One idea per sentence. No jargon. Name things the way the reader sees them
  ("pretend iPhone on the computer", not "simulator").
- Paths and file names may appear, but only in the "What it uses" section, in a mono face,
  muted, after the plain description.
- No marketing tone, no emoji, no exclamation marks.

## Build rules

- Load `artifact-design` guidance first (via the Artifact tool's quickstart). Follow the
  Artifact page contract: tokens on `:root`, light and dark, phone width, 16px gutter.
- Embed every image as a JPEG data URI. Resize first with PIL: phone screenshots about 540px
  wide, tablet about 800px, faces 280px square, other photos 720×480. Keep the page under
  1MB.
- Display sizes: phone shots up to 260px wide, tablet up to 420px, faces 140px, photos at
  least 260px wide. Page max width about 1000px.
- Icons: simple inline SVG `<symbol>`s with stroke `currentColor`, reused via `<use>`.
- Pick one accent colour from the product's own brand when there is one.
- Publish, then give the user the link and say it is private until they share it.

## After publishing

Expect edits: "too much text", "bigger images", "add where the files are". Make them in the
same file and republish to the same path, so the link stays the same.
