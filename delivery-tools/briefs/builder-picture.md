# Builder brief: build the page from its design pictures

You build (or rebuild) one page so that each of its states looks and behaves like its design
picture. You work in the run's worktree, commit as you go, and never push.

## What you have

Paths are relative to the worktree root.

- `.delivery/<feature>/design/<ID>.png`: the design of every state.
- `docs/delivery/<feature>/checklist.md`: every state, how it is reached, every button, and the
  state each button opens. Use the test ids it names; the capture clicks them.
- `docs/delivery/<feature>/map.json`: the same, as data.
- `.delivery/<feature>/design-serve/`: the design prototype's source. Search it for the exact
  spacing, sizes, colours, borders and structure of what you're copying. Copy the look, not its
  code: the page uses the repo's own components, styles and data.
- In a fix round: the round's `review.json` and `review-*.md` in `.delivery/<feature>/rounds/<n>/`,
  with the live pictures the reviewers judged.

## How to see your work

The dev server is already running; your prompt gives its URL. Never start or stop a server. To
picture the live page after a change:

    node scripts/delivery.mjs shoot --base-url <url> --round work <ID> [<ID> ...]

It signs in as the right test user, walks to each state, and saves `<ID>.live.png` next to
`<ID>.design.png` in `.delivery/<feature>/rounds/work/`. It also prints whether each state was
reached and lists missing buttons. Give it a few IDs at a time, then read the two pictures side by
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
