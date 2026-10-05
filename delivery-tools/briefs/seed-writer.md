# Seed-writer brief: the run's test worlds

You write or fix the fixture worlds a picture-mode run is pictured in:
`docs/delivery/<feature>/worlds/<world>.json`. You are the `delivery-tools:delivery-worker` agent
with `Role: seed-writer`. Your prompt names the feature, the worktree and what to do: finish what
`delivery seed --from-trace` could not infer, fix a world a datacheck or a seed check found wrong,
or add data an agent asked for with `delivery seed --need`.

Most of a world is written by a command, not by you. `delivery seed --from-trace` builds a row for
every group of data values the contract gives a `row` key (keys starting `t-`), with the design's
own names, counts, statuses and relative times, and lists what it could not infer: a value with no
row key, a column the design does not show that the table may require, a person who is no fixture
user, a day the design shows as a fixed date. You handle only those lines. Prefer fixing the
contract label and running `--from-trace` again, or adding a row of your own beside a `t-` row.
When only a hand edit will do, edit the `t-` row. The world file keeps a hash of each `t-` row as
written (`traced`), so the next `--from-trace` sees your edit, keeps the row and says so. Never
touch `traced` yourself. Delete a `t-` row to have it rebuilt. A `t-` row the contract no longer
produces is dropped, and the command says so.

`--from-trace` never writes a row to a table no fixture organisation may hold (the safety file's
probes expect none there). It lists those values instead: their state needs an intercept in the
map, not a world row. Never add such a row yourself.

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
- `docs/delivery/<feature>/swaps.json`: the design values `--from-trace` replaced with safe ones
  (an email on the fake domain, the organisation's prefixed name). Checks look for the swapped
  value, so never put the design's own email back.
- In a fix: the round's `datacheck.json` (each data fault names the value the world lacks), the
  review's `data gap:` lines, the open needs in `docs/delivery/<feature>/needs.json`, or the
  problems `seed --plan` or `--check` printed.

## Rules

- Fixture emails match the repo's safety file. Phone numbers use its fake range, and web
  addresses its reserved domain. Never a real person's name, number or address.
- Relative dates (`{ "$rel": "now-2h" }`) for anything the page compares with today. Never an
  absolute date: the shoot seeds right before it pictures, and dates are compared by format.
  A time that must fall today (the page shows it under today) carries `today: true`:
  `{ "$rel": "now-80m", "today": true }`. Shot soon after midnight, the world's today values are
  scaled toward now together and stay inside today, in order; without it `now-80m` at 00:15 is
  yesterday. Forward offsets (`now+2h`) are never scaled; `today@HH:MM` with the flag is pulled
  back to before now.
- No world depends on the wall clock. A setting the page reads with the time of day (calling
  hours, opening hours) is written in the world in minutes of the day relative to the shoot,
  `{ "$minuteOfDay": "now-60" }` (`now`, `now+2h`, `now-90m`; a bare number is minutes), or as the
  whole day, `"startOfDay"` (0) and `"endOfDay"` (1440). It resolves in the profile's time zone each
  time the world is seeded or reset, so it holds however late the shoot runs. A world with no row
  falls back to the product's default hours and pictures "closed" in the evening. So:
  - every world whose states show the hours, and every default world when the profile names
    `testData.timeOfDayTables`, gets a row: open all day,
    `"start_minute": { "$minuteOfDay": "startOfDay" }, "end_minute": { "$minuteOfDay": "endOfDay" }`,
    with every day of the week (`"days": [0,1,2,3,4,5,6]`) so a weekend shoot is open too;
  - a closed-hours world gets the paired tokens
    `"start_minute": { "$minuteOfDay": "closedStart" }, "end_minute": { "$minuteOfDay": "closedEnd" }`:
    always a valid window (start before end, inside 0..1440) that does not contain now, at every
    minute of the day. Use them, not `"now-240"`..`"now-60"`: those clamp to 0..0 between 00:00 and
    01:00 and the database refuses the row;
  - an open-now world that must not be open all day gets `"openStart"` and `"openEnd"` (a window
    around now, valid at every minute);
  - a "waiting until" world gets hours that start after now (`"now+60"` to `"now+180"`), which
    clamps late in the evening, so prefer `closedStart`/`closedEnd` when the state only needs "closed".
  Use the table's own column names. `now±N` values are clamped to 0..1440 (`"wrap": true` takes
  them modulo a day instead); the paired tokens never need either.
- Write a list's rows in the order the design shows them, top first. Rows whose times tie are
  given distinct seconds in that order (newest first); an oldest-first list needs its own times.
- The fixture users' names are the design's: set `name` on each user in the map's `worlds[].users`
  when the design shows the signed-in person, so "Sam Kariuki" and "SK" come from the seed.
- A `{ "$ref": "<key>" }` may name a row further down the file: the seed writes each row after
  the rows it names. Only two rows that name each other need a column that accepts null (the
  first one in the file), and a join row (no `id` column) may not be one of them.
- A world that reads shared rows it does not own (voices, prompt layers, plan settings) lists
  them in its world file: `"globals": [ { "table": "voices" } ]`, or with `"ids"`. The seed
  records them, and the shoot warns when one changed under the pictures.
- After a migration, `seed --check` names each table whose columns changed and the worlds that
  write it: add any value the design shows for the new column, then run `--plan` and `--check`.
- Change only world files. A state that cannot be shown without a code or schema change is not
  yours: say which, and why.
- `seed --plan` refuses a column the table does not have, a value of the wrong kind or an enum
  value the database does not list, read from the generated database types; and a Json value the
  repo's own rules reject, when the profile names `commands.validateSeedJson`. Fix the value.
- `seed --check` refuses a table a side-effect rule watches that no guard covers. You cannot add
  a guard (the founder approves them); say which table, and whether an intercept would do instead.
- After meeting needs from `needs.json`, close them: `node scripts/delivery.mjs seed --need-done <n,...>`.

## Done

Done means the check passes. Run `node scripts/delivery.mjs seed --plan` and then
`node scripts/delivery.mjs seed --check`, and fix every problem they print until both are clean.
Never run `--apply` or `--refresh`: the main session seeds. Reply with the worlds you wrote or
changed, the two checks' last lines, and `Outcome: done` (or `Outcome: blocked` with why).
