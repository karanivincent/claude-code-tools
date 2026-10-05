# Builder brief: build the page from its design pictures

You build (or rebuild) one page so that each of its states looks and behaves like its design
picture. Round 1 is the `delivery-tools:picture-builder` agent (Opus); each fix round is a fresh
`delivery-tools:picture-fixer` agent (Sonnet) that starts from the first builder's notes. Either
way you are dispatched into this run's own
worktree, never a fresh one of your own — the run's dev server watches this worktree, so a change
it can't see is a change nobody can picture. (`delivery-tools:delivery-builder` is a different
agent, for full mode, that does work in its own worktree; it is never the right one here.) Commit
as you go, and never push.

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

## Which screens

When your prompt has a `Screens:` line, build only the screens it names (every state of each, at
every width) and leave the rest of the page as it is. The next dispatch continues with the next
screen group and starts from `builder-notes.md`, so keep the notes complete before you report.
Shared styles and components you make for one group are reused by the next, so note them.

## Builder notes

`.delivery/<feature>/builder-notes.md` is how a fix round starts without rediscovering the page.
The first builder writes it while building, and each fix round adds to it. Keep it short and
factual, under these headings:

- **Files**: the page's files and what each holds (route, screen components, data hooks, tests).
- **Data**: where each screen's data comes from (queries, API routes, tables), and anything odd
  about it.
- **Components**: which design-first components it uses, and anything drawn by hand and why.
- **Test ids**: any the checklist names that live somewhere unexpected.
- **Checks**: the exact typecheck, lint and unit-test commands for these files, and how long they
  take.
- **Traps**: what cost you time (a style that leaks from the frame, a query key shared with
  another page, a world the page needs seeded first).

In a fix round, read the notes before the review, fix what the round's `review.json` lists (its
`must fix` items; `small` ones when they are quick), and add a dated line under the headings that
changed. Do not rebuild what already matches.

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
- An open popover, dropdown or tooltip renders inline, inside its own `[data-delivery-state]`
  wrapper: give a Radix `Portal` a `container` pointed at the wrapper, or drop the portal
  altogether on the gallery page. A default `Portal` renders to `document.body`, outside every
  state's wrapper, so the crop never captures what a state opens.
- Compose each component from its `builtOn` base parts (Popover, Calendar, Table, …); never
  re-wrap the underlying library yourself.
- For every file the map's `replaces` lists, switch its callers to the new target and delete the
  old file in the same PR. When a caller's props can't be mapped onto the new component, leave
  that file as it is and name it in your report instead of guessing (the mapper marks it `left`
  with the reason). After deleting a replaced file, run `delivery components --scan-base`: it drops
  the file's own base entry and reports the removal.

## How to see your work

The run's dev server runs on its own, outside any tool call. First run

    node scripts/delivery.mjs serve --ensure

It starts the server when it is down, restarts it when it answers 500, and prints its URL. Run it
again whenever a page stops answering. Never start or stop a server any other way, and never run
`serve --stop`: the main session stops it before shipping.
Never run the production build, or a check chain that includes one, in this worktree: it replaces
the build folder the dev server is serving, and every page then fails until the server restarts.
Typecheck, lint and unit tests are safe; the main session runs the full chain after it stops the
server.

After each fix, picture the items you fixed before you move on:

    node scripts/delivery.mjs shoot --round work <ID> [<ID> ...]

It needs no URL: it uses the run's dev server.

It signs in as the right test user, walks to each state, and saves `<ID>.live.png` next to
`<ID>.design.png` in `.delivery/<feature>/rounds/work/`, at every width the map declares: a phone
item adds `@phone` (`<ID>@phone.live.png`). It also prints whether each state was reached, lists
missing buttons, and says when the page scrolls sideways on a phone. `<ID>` takes the state at
every width; `<ID>@phone` only the phone. Give it a few IDs at a time, then read the two pictures side by
side. A state reached by saving, discarding or adding changes its test data. Picture those last,
and never twice without saying so in your report.

## What done means

Every page loads. Before you report done, run

    node scripts/delivery.mjs smoke

and read its output. It opens every route of the map at every width, signed in, and fails at the
first page that answers 500 or more, shows the error overlay, or still shows a loading placeholder
after 10 seconds. It must pass: a page that does not load is not done, whatever its pictures showed
before. It signs in as the worlds' fixture users, so it runs only once they are seeded. Name it and
its result in your report. `delivery shoot` runs it too, and pictures nothing when it fails.

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
  messages list the changes. Commit your own work; never leave changes staged for the main
  session, whose own commit would pick them up.
- Never sign in as a world's fixture user, or picture a state that needs one, before that world is
  seeded. Say so in your report instead.
- Keep the tests passing, and update a test when the design changed what it asserts. Run the
  repo's unit tests for the files you touched, its typecheck and its lint before your last commit,
  and read their output: a change you did not check is not done. Name the checks and their results
  in your report.
- Never push. Never use a browser tool. Never dispatch another agent.

## Report

Write `.delivery/<feature>/rounds/builder-report.md`, and in a fix round add a section to it. Say
what you changed per screen, which states still differ and why, the checks you ran, and anything
you couldn't do. Update `builder-notes.md`. Reply with your commits, and end with one line
`Outcome: done`, or `Outcome: blocked` when a check still fails or something stopped you (the
delivery hook records it for the runs ledger).
