# Builder brief: build the page from its design pictures

You build (or rebuild) one page so that each of its states looks and behaves like its design
picture. You work in the run's worktree, commit as you go, and never push.

## What you have

Paths are relative to the worktree root.

- `.delivery/<feature>/design/<ID>.png`: the design of every state. When the map declares
  `"widths": ["desktop", "phone"]`, `<ID>@phone.png` is the phone design (or the checklist names the
  state's own mobile frame).
- `docs/delivery/<feature>/checklist.md`: every state, how it is reached, every button, and the
  state each button opens. Use the test ids it names; the capture clicks them.
- `docs/delivery/<feature>/map.json`: the same, as data.
- `docs/delivery/<feature>/rules.json`, when the run has one: every behaviour the briefs state. The
  checklist shows each rule under the states that show it.
- `.delivery/<feature>/design-serve/`: the design prototype's source. Search it for the exact
  spacing, sizes, colours, borders and structure of what you're copying. Copy the look, not its
  code: the page uses the repo's own components, styles and data.
- In a fix round: the round's `review.json` and `review-*.md` in `.delivery/<feature>/rounds/<n>/`,
  with the live pictures the reviewers judged.

In an update run (the run's state names a `from` run) the page already exists and round 1 has
already pictured it: change only what the round's review lists, and keep everything else as it is.

## Components

When the product has design-first components (`docs/delivery/components.json`), run
`delivery components --used` for the components this page uses, each with its `target` (the file
to import) and its `props` (design prop name to code prop name). Import these; never draw your own
copy of a control the design already built as a component. A built component that looks wrong on
this page is a finding against the components run, not something to patch here.

In a components run (the map's `"kind"` is `"components"`) you are building the gallery page
itself, not a product page:

- Build the gallery page at the profile's `components.galleryRoute`, rendering every state listed
  in `docs/delivery/<feature>/gallery-states.json`. Wrap each state in
  `<div data-delivery-state="<id>">…</div>` at that route — `delivery shoot` crops to that element,
  so a state drawn outside its own wrapper, or two states sharing one, cannot be pictured.
- Compose each component from its `builtOn` base parts (Popover, Calendar, Table, …); never
  re-wrap the underlying library yourself.
- For every file the map's `replaces` lists, switch its callers to the new target and delete the
  old file in the same PR. When a caller's props can't be mapped onto the new component, leave
  that file as it is and name it in your report instead of guessing (the mapper marks it `left`
  with the reason). After deleting a replaced file, run `delivery components --scan-base`: it drops
  the file's own base entry and reports the removal.

## How to see your work

The dev server is already running; your prompt gives its URL. Never start or stop a server. To
picture the live page after a change:

    node scripts/delivery.mjs shoot --base-url <url> --round work <ID> [<ID> ...]

It signs in as the right test user, walks to each state, and saves `<ID>.live.png` next to
`<ID>.design.png` in `.delivery/<feature>/rounds/work/`, at every width the map declares: a phone
item adds `@phone` (`<ID>@phone.live.png`). It also prints whether each state was reached, lists
missing buttons, and says when the page scrolls sideways on a phone. `<ID>` takes the state at
every width; `<ID>@phone` only the phone. Give it a few IDs at a time, then read the two pictures side by
side. A state reached by saving, discarding or adding changes its test data. Picture those last,
and never twice without saying so in your report.

## What done means

For every state in the checklist:

- Everything in the design is there: sections, buttons, badges, counts, progress bars, empty
  states, side panels and toasts.
- Every button is there, with its test id, and clicking it reaches the state it names.
- A member doesn't see a button marked hidden from members.
- It matches the design at a glance: the same arrangement, sizes, spacing, colours, borders,
  weights and button styles.
- The wording means the same as the design's. The test data's names and numbers may differ.
- Nothing from the checklist's "must not be lost" list is gone.
- When the map declares the phone: the page is responsive, and each state matches its phone design
  at 390 pixels as well as its desktop design at 1440. Never let the page scroll sideways on a
  phone. A button marked "hidden on a phone" is off the phone layout; one marked "on a phone only"
  is off the desktop. Look at your own work at both widths.

Every rule in rules.json holds. For a rule whose proof is `test`, write a test whose name starts
with the rule's id and a colon (`it('R7: a sync never overwrites groups', ...)`), in the repo's own
test style, and add its path to the rule's `tests` list. `node scripts/delivery.mjs rules --ready`
tells you which are still missing. Never change a rule's text or proof; if a rule is wrong, say so
in your report.

Ignore differences that need a ruler to see.

## Scope

- Only the page's own area. The sidebar and top bar are out of scope, even when they differ.
- Change the API or the database only when a state truly can't be shown without it. Name each
  change in your report. A migration is always additive.
- Test data comes from the map's worlds. If a state can't match because its world is wrong, say
  which world and why. Don't edit world files.

## Working rules

- Shared styles first (header, tabs, cards, buttons), then screen by screen.
- Commit per screen, with `git add <specific files>` only. Never `git add .` or `-A`. Commit
  messages list the changes.
- Keep the tests passing, and update a test when the design changed what it asserts. Run the
  repo's unit tests for the files you touched, its typecheck and its lint before your last commit.
- Never push. Never use a browser tool. Never dispatch another agent.

## Report

Write `.delivery/<feature>/rounds/builder-report.md`, and in a fix round add a section to it. Say
what you changed per screen, which states still differ and why, and anything you couldn't do.
Reply with your commits.
