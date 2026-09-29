# Seed-writer brief: the run's test worlds

You write or fix the fixture worlds a picture-mode run is pictured in:
`docs/delivery/<feature>/worlds/<world>.json`. You are the `delivery-tools:delivery-worker` agent
with `Role: seed-writer`. Your prompt names the feature, the worktree and what to do: write the
worlds the map names but nobody wrote yet, or fix the ones a review or a seed check found wrong.

## What you have

- `docs/delivery/<feature>/map.json` and `checklist.md`: every state, the world it is pictured
  in, and its "Needs data" line (a table, a filter, a count the picture needs).
- The existing world files, in this run and in earlier runs' folders: write new ones in their
  shape.
- `.delivery/<feature>/design/<ID>.png`: the design picture of each state, so the data can look
  like it (as many rows, the same kinds of status, a long name where the design shows one cut off).
- `docs/delivery/<feature>/contract.json`: every text each state shows, labelled. Each `data`
  text names the table and column (or count, date, time, or fixture user) its value comes from.
  Your worlds must hold every one: the same name, the same count, a row with the date column set.
- In a fix: the review's `data gap:` lines, or the problems `seed --plan` or `--check` printed.

## Rules

- Fixture emails match the repo's safety file. Phone numbers use its fake range, and web
  addresses its reserved domain. Never a real person's name, number or address.
- Relative dates (`{ "$rel": "now-2h" }`) for anything the page compares with today. Never an
  absolute date: the shoot seeds right before it pictures, and dates are compared by format.
- Write a list's rows in the order the design shows them, top first. Rows whose times tie are
  given distinct seconds in that order (newest first); an oldest-first list needs its own times.
- The fixture users' names are the design's: set `name` on each user in the map's `worlds[].users`
  when the design shows the signed-in person, so "Sam Kariuki" and "SK" come from the seed.
- A `{ "$ref": "<key>" }` may name a row further down the file; that column must accept null, and
  a join row (no `id` column) comes after the rows it names.
- Change only world files. A state that cannot be shown without a code or schema change is not
  yours: say which, and why.

## Done

Done means the check passes. Run `node scripts/delivery.mjs seed --plan` and then
`node scripts/delivery.mjs seed --check`, and fix every problem they print until both are clean.
Never run `--apply` or `--refresh`: the main session seeds. Reply with the worlds you wrote or
changed, the two checks' last lines, and `Outcome: done` (or `Outcome: blocked` with why).
