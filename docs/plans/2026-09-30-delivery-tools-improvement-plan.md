# delivery-tools: the improvement plan

**Status: approved by Vincent on 2026-09-30, all 13 decisions as recommended, with the spike
amendments below. Built in full by 2026-09-30: W1+W2 in 0.18.0 (#67), W3 to W9 in 0.19.0 to
0.23.0 (#68 to #72); see Progress at the bottom.** The review page is
https://claude.ai/artifact/CnctSJf2pBVaZYJLsTiB2n. Next: measure the next two runs.

**Release numbers (added when W1 and W2 shipped).** Releases 0.15.0 to 0.17.0 were taken by the
stable-picture-data plan, which landed the same week. W1 and W2 shipped as 0.18.0, so every release
in Part 3's table moves up by three (W3 is 0.19.0, and so on).

## Spike results (2026-09-30, about 1 h 55 min, Settings Members and Calling states)

The scripts are in `docs/plans/spike-2026-09-30/`. They were run against the landed
settings-page run, in the worktree
`/Users/vince/Projects/Telitask/telitask-development/.claude/worktrees/delivery-settings-page`.

| # | Result | Evidence | Amendment to the plan |
|---|---|---|---|
| S1 preset tables | Pass | `s1-preset-table.mjs`: it found `csApply(this.props.callsState)` reading `const CS = {…}`, which has 275 keys and includes all 34 hand-fixed ones. 6 of 6 states rendered through `reach.kind: "preset"` with `{callsState: key}` had text identical to the hand-set renders. | W1 detection pattern: a method `m(arg)` whose body indexes a top-level `const T = {`, called as `this.m(this.props.P)`. The candidates are T's keys, rendered as a preset on prop P. The existing `__deliveryProps` path already draws them. The table can also seed the state list, which saves extractor time. |
| S2 trace | Pass, one miss | One Sonnet agent traced 8 states (about 180 values) in 90 s, from the design `.txt` and `database.types.ts` alone; about 98% were right. The miss: "12 calls at once" was mapped to `org_telephony.max_channels`, but the product stores only the agents' count there (`api/dashboard/calling/route.ts`: `lines: { total: null, agents: max_channels }`). | After the build, a machine check confirms every traced `column` is one the page's API selects (grep the route's `.select(...)`). A mismatch becomes a "no source" question for the founder. |
| S3 trace → world | Pass | `s3-trace-to-world.mjs` rebuilt 10 of 11 rows identical to the hand world `worlds/design.json`: users and names, member roles, invitations, calling-hours minutes. The miss: `org_calling_hours.days`, drawn as toggles. It can be read from `<ID>.dom.json` styles, because on-days share a background colour. | The trace carries a `row` key per value, grouping values into rows (the spike inferred it from order). Toggle and selection state comes from `dom.json`. Emails and org names are swapped to the safety patterns (`delivery+st-<world>-<role>@example.invalid`, the `Delivery fixture · ` prefix). The command writes that swap list per world for datacheck. |
| S4 datacheck | Pass | `s4-datacheck.mjs` caught 3 of 3 faults planted through `page.route` response rewrites (member removed, role changed, hours shifted). It also flagged the header role "Owner", which the design shows and the live page doesn't: a real page gap, not a data fault. Other worlds' emails showed as misses only because the spike used one world's swap list. | A miss is a `data-fault` only when the rest of that traced row is present on the page. Otherwise it goes to the reviewers as a page issue. The swap list is per world. |
| S5 re-seed per saving state | Pass | `seed --refresh role-change` took 5.1 s including its scan. It rolled back a saved role change (`s5-leak.mjs`: "rewrote 2 rows"). The world had drifted by 3 rows since the run. | None. |
| S6 prod-build shoot | Partial | The prod build took 69 s (cached). 5 states on the dev server took 50.8 s (25.8 s of it the first compile). The same 5 on the prod server took 24.9 s: 1.8× overall, but about 1.3× per state. `networkidle` waits on staging dominate. | W6's 35 → 10 min target needs the two parallel contexts and shorter or smarter waits. Re-measure when W6 is built. |

Side finding: the plugin's `hooks/pre-bash.sh` refuses any command whose text contains "seed",
including a read-only `node …seed-from-trace.mjs`. It should match what the command does, not
file names. Add this to W3.

Written 2026-09-30 for review before any code changes. It is based on two finished analyses (the
Settings run, #2120, and the Rounds run) and a line-by-line check of delivery-tools 0.14.0.

- Part 1 is the list of decisions to approve. Read that first.
- Part 2 is the detail: what changes, why, where, how we test it, and what it saves.
- Part 3 is the order of work, how we measure, and what we are not doing.

## The goal, in numbers

| | Settings run (actual) | Rounds run (so far) | Target after this plan |
|---|---|---|---|
| Wall time | 12 h | 15.5 h at round 3 | 6.5 to 8 h |
| Time lost to the process | 5 h (42%) | 4.5 h (29%) | under 1 h |
| Agent cost | about $200, before round 4 and the PR review | not totalled | $120 to $150 for a Settings-sized run |
| Rounds thrown away | 2 | 1 | 0 |
| Data problems found during rounds | 39 in round 2 | "most of the to-fix count" | close to 0; found before round 1 |
| Open items at the end | 13, after the round cap | 172 to fix at round 2 | 0 real bugs |

These are estimates. Part 3 says how the next two runs will prove or disprove them.

---

# Part 1: decisions to approve

Each line is one choice. My recommendation comes first; the alternative follows.

| # | Decision | Recommended | Alternative |
|---|---|---|---|
| D1 | Order of work | 1 pictures right → 2 pages load → 3 right data → 4 rounds → 5 faster shoots → 6 reviewers → 7 ship checks → 8 scope and models | data first (it depends on 1, so no) |
| D2 | How it lands | one PR per workstream, merged when its tests pass, with a version bump each | one big PR (harder to measure, harder to revert) |
| D3 | Keeping test data clean between states | re-seed the world before every state that saves data | one organisation per state (more users, more sign-ins, slower) |
| D4 | The clock problem ("calling hours closed" at night) | time-based data is written relative to the moment of the shoot, and the browser uses the organisation's time zone | a test-only "now" override inside the dashboard (touches product code; a security risk if it ever reached production) |
| D5 | A new table with no seed guard | seeding stops; the mapper drafts a guard or an intercept for it | today's behaviour: it only prints a warning |
| D6 | Questions for you | one list, before the build: data the product doesn't store, and guards to approve | today: they surface at rounds 2 to 4 |
| D7 | How many rounds | no fixed cap: keep going while real bugs go down, stop at zero, stop after two rounds with no progress | today's fixed three |
| D8 | Re-reviewing items that already matched | re-review a sample when their picture changes, and all of them only if the sample finds a problem | re-review every changed item (Settings round 4: 219 items for one colour change) |
| D9 | What the shoot runs against | a production build of the page | today's dev server (slow, and the page compiles on first visit) |
| D10 | Big designs | above about 120 states, split the run into one run per screen group | one run for everything (Rounds: 275 states) |
| D11 | Models | extractors Sonnet `low` → `medium`; Sonnet never above `high`; try the first builder at Opus `medium` for one run; fixer stays Sonnet `medium` | leave as 0.14 |
| D13 | Who writes test data | a command, not an agent: `delivery seed --from-trace` builds worlds from the trace; `delivery seed --need "<state>: 3 failed calls"` lets any agent ask for data and get a one-line answer; a small seed agent, shown one state's trace, handles only what the command can't infer | today: a seed-writer agent reads the whole map and pictures every time |
| D12 | The Rounds run in flight | keep it on 0.14 until it lands; don't update the plugin in its session | pause it until workstreams 1 to 3 land |

---

# Part 2: the workstreams

Each workstream has five parts: what goes wrong today (with evidence), what changes, where it
changes, how we test it, and what it saves.

## W1. The design pictures are right

What goes wrong:

- **Preset tables.** Some designs keep their states in a table (`CS = { home: {...}, empty: {...} }`)
  and pick one with a string prop.
  - The renderer only reads options, booleans and numbers from props (`lib/design/claude-dc.mjs:propValues`).
  - So those states are never found, and they render as the default screen.
  - Settings: 40 states rewritten by hand, about 40 min.
  - Rounds: about 125 states showed the Home screen, about 1.3 h.
  - The plain "preset sets props" part was fixed in 0.13.4.
- **The duplicate bundle file.** Claude Design exports sometimes include `_bundle_src.dc.html`.
  Intake then finds two page files and refuses the export (`adapters/design/claude-design.mjs:findDcFile`).
  Both runs removed it by hand.
- **Phone frames.** A design that draws its phone view inside an iframe can't be read. The page
  text extractor only reads the top document.
- **Stale help.** `lib/commands/design-render.mjs:30` still describes the old preset mechanism.

What changes:

1. `propValues` detects a preset table.
   - The trigger: a string prop whose default is a key of an object literal in the bundle, and that
     object's values are state patches.
   - It emits one candidate per key.
   - The render applies the table entry as a `set` step, which is what we did by hand.
2. `findDcFile` ignores a file named `_bundle_src.dc.html` when another page file exists, and notes
   that it did.
3. The extractor brief says: never reach phone states through a phone-frame prop; render them with
   `--width phone`. The renderer warns when a state's page contains an iframe covering more than half
   the page, so a wrong reach shows up at render time, not at review.
4. The renderer warns when a prop name matches a state key (the Rounds `screen` mix-up).
5. The help text is fixed.

Where: `lib/design/claude-dc.mjs`, `lib/design/render.mjs`, `adapters/design/claude-design.mjs`,
`lib/commands/design-render.mjs`, `briefs/extractor-design.md`, and tests in `tests/design/`.

Tests:

- A toy design with a preset table renders each key's state.
- An export with the duplicate file passes intake.
- An iframe-heavy state prints the warning.
- Acceptance: the Settings export renders its 40 named states with no hand edits.

Saves: 40 min to 1.3 h per run, and reviewers compare against the right picture.

## W2. The page loads before we photograph it

What goes wrong:

- **The shoot probes only the base URL** (`lib/commands/shoot.mjs:probeServer`). A page that
  returns 500 on its own route is shot anyway.
  - Rounds waited out 206 click timeouts of 8 s each.
  - Settings shot twice against a 500ing page, about 70 min lost.
- **A failure after the shoot still uses a round number**, because `rounds/<n>/shoot.json` exists.
  Settings had to renumber rounds by hand.
- **The builder reports done without opening the page.**

What changes:

1. A new `delivery smoke` command. It opens each distinct route in the map, signed in, at each
   width. It fails at the first:
   - status of 500 or above;
   - Next.js error overlay;
   - replaced-output page;
   - skeleton still showing after 10 s (a selector set in the profile, with `[aria-busy=true]` and
     `[data-skeleton]` as defaults).
2. `delivery shoot` runs smoke first and stops on a failure. A failure after the shoot deletes that
   round's folder, so the next shoot reuses the number.
3. The builder and fixer briefs require `delivery smoke` to pass before they report done. The
   SubagentStop rule already sends back an agent that reports done without naming its check.

Where: new `lib/commands/smoke.mjs`; `lib/commands/shoot.mjs`, `lib/picture/rounds.mjs`,
`briefs/builder-picture.md`, the fixer brief, `schemas/profile.schema.json` (skeleton selector).

Tests:

- A fixture server that returns 500 on one route: smoke fails, and names the route.
- A post-shoot failure leaves no round folder.
- Acceptance: re-running the Settings `node:crypto` failure stops in seconds, not after 75 min.

Saves: about 1 h per run whenever a page breaks, which happened in both runs.

## W3. Right data every time

This is the largest workstream, and the one you asked about most. Five of its six problems are
data problems, not page problems.

What goes wrong:

| Problem | Evidence in 0.14.0 |
|---|---|
| Worlds are written by an agent guessing from pictures | the seed-writer brief doesn't point it at the design's text files (`briefs/seed-writer.md:10-16`), although the renderer already saves them (`<ID>.txt`, `<ID>.dom.json`) |
| The design shows things the product doesn't store | there is no "no data source" verdict; a data gap always assumes a re-seed fixes it, so `ready` stays red forever (Settings: 28 items) |
| Saves leak into later states | the re-seed runs between widths, not between states (`lib/picture/shoot.mjs:captureOrder`); in Settings, world `connected` holds 22 states, 6 of which save |
| Old rows stay behind | `seed --refresh` only cleans tables the world still seeds (`lib/seed/extras.mjs:52-67`) |
| Values the code rejects pass the check | only simple database CHECKs are read; the app's own Zod rules and column types are never checked in picture mode (Rounds: `release_policy.mode: "manual"`) |
| New tables with no guard | only a warning; seeding then stops later on a predicate |
| The clock | the shoot sets no time zone; nothing makes time-based states true at the moment of the shoot |
| Data gaps go nowhere | NEXT counts only must-fix and not-reached, so a round with only data gaps says "ship" while `ready` stays red |

What changes, in the order it runs:

1. **Trace the design's values at map time.**
   - The mapper already reads `<ID>.txt`. It now labels each line that carries data in one of four
     ways:
     - `column` (with its table and column);
     - `computed` (a count or a total, with its source);
     - `word` (a fixed label from the locale files);
     - `none`.
   - This goes into a new `trace` field per state in `map.json`.
   - `delivery map` refuses a state that shows data but has no trace.
2. **One list for you before the build (D6).**
   - `delivery status` gathers every `none` line and every new table without a guard into one
     message, sent once.
   - For each `none` line you choose one of three: build it (it becomes a rule), drop it (it becomes
     a cut rule), or send it back to the design.
   - For each guard you approve the draft, or tell the mapper to use an intercept.
   - After that, `none` items are no longer data gaps. They are decided items, and `ready` counts
     them as closed.
3. **Worlds carry the design's own values.**
   - The seed-writer is handed the trace. Names, counts, statuses and relative dates come from it,
     so the seeded page shows the same values the design shows.
   - It only invents what the trace doesn't give, such as ids and foreign keys.
4. **Validate before writing.** `seed --plan` gains two checks:
   - columns exist and have the right type, read from `database.types.ts`, which the profile
     already names;
   - JSON columns pass the app's own rules, through a small profile command
     (`commands.validateSeedJson`) that the repo implements with its Zod schemas.
   - The plugin stays generic; the repo owns its rules.
5. **Guards (D5).**
   - `seed --check` fails on a seeded table with no guard. Today it only prints a warning.
   - The mapper drafts a guard (probe plus row rule), or an intercept for the API call instead.
   - Guards still need your approval in `.claude/delivery-safety.json`, which lanes can't edit. That
     approval comes in the one list above.
6. **Isolation (D3).**
   - The shoot re-seeds a world before every state that saves, not once per width.
   - `seed --refresh` removes every row in the world's organisation that isn't in the plan, in any
     organisation-scoped table, including tables the world stopped seeding. The scan already reads
     all of them.
   - A re-seed is a diff, so it takes seconds.
7. **Time (D4).**
   - The mapper marks states whose look depends on the clock, such as "calling hours open" or
     "overdue". Their world values must be relative to the shoot (`$rel`); `delivery map` refuses a
     fixed time on them.
   - `seed --refresh` runs right before the shoot, so "open now" is true when the picture is taken.
   - Browser contexts get `timezoneId` from the profile, in the design render and the shoot, so
     client-side dates match.
   - `today` resolves in the organisation row's own zone when it has one.
8. **Check the data before any reviewer looks.**
   - The shoot saves each item's live text (`<ITEM>.live.txt`). Today it only keeps a yes/no.
   - A new step, `delivery datacheck --round <n>`, compares each traced value with the live text:
     - `column` and `computed` values must appear exactly;
     - values the product generates (an AI summary, an outcome) are checked by shape, meaning "text
       is there", "a number is there".
   - A miss gets the verdict `data-fault` with the missing value named.
   - NEXT sends data faults to the seed-writer, then re-seeds and re-shoots only those items. Only
     after that do reviewers see the round.
   - This is a text comparison: it costs seconds and no tokens.
   - Reviewers stop writing "data gap" for seeded data. That label stays only for a value the trace
     missed.

Where: `briefs/mapper.md`, `briefs/seed-writer.md`, `lib/picture/map.mjs` (trace, clock marks,
refusals), `lib/seed/extras.mjs`, `lib/seed/scan.mjs`, `lib/seed/data.mjs`, `lib/seed/evaluate.mjs`,
`lib/commands/seed.mjs`, `lib/picture/shoot.mjs` (per-state re-seed, live text, time zone),
`lib/design/render.mjs` (time zone), new `lib/commands/datacheck.mjs`, `lib/picture/review.mjs`
(the `data-fault` and `decided` verdicts), `lib/picture/next.mjs`, `lib/run/ready-compute.mjs`,
`schemas/profile.schema.json`. In the Telitask repo, one small script behind
`commands.validateSeedJson`.

Tests:

- A world with a leaking save: the second state sees clean data.
- A table the world stopped seeding is emptied by refresh.
- `"manual"` is refused at `--plan`.
- A missing traced value on the live page gives `data-fault`, and NEXT routes it to the
  seed-writer.
- A `none` item decided "drop" no longer keeps `ready` red.
- A round with only data faults never says "ship".
- Acceptance: replay the Settings run's round 2. Its 39 data gaps become data faults, fixed before
  review, or items decided before the build.

Saves: about 1.5 h per run, and it removes most false "to fix" items, so the round counts become
honest.

## W4. Rounds without a fixed cap (D7)

What goes wrong:

- `MAX_ROUNDS = 3` is a constant (`lib/picture/next.mjs:52`).
- NEXT and `ready` count it differently: one uses the round number, the other the number of shot
  rounds.
- After round 3, whatever is left goes to you as a list, even real bugs.

What changes:

- The cap becomes a stop rule, with its numbers in `tunables.json`:
  - keep going while the real-bug count (must fix plus not reached) falls;
  - stop at zero;
  - stop after two rounds in a row with no fall, and send you only the stuck items, each with the
    reviewers' notes and why it didn't move;
  - a hard safety ceiling of 8 rounds.
- NEXT and `ready` share one function, so they always agree.
- A round made void by W2 never counts.

Where: `lib/picture/next.mjs`, `lib/run/ready-compute.mjs`, `tunables.json`,
`skills/picture-build/SKILL.md` (lines 50-52 and 172).

Tests: a sequence of 12, 5, 5, 5 stops after the second 5. A sequence of 12, 5, 0 ships. The
ceiling holds.

Saves: no time by itself. It removes the leftover-bug list, and W5 makes the extra rounds cheap.

## W5. Cheaper late rounds (D8, D9)

What goes wrong:

- Every fix round shoots every item.
- Any item whose picture changed is reviewed again, even if it matched before. Settings round 4
  reviewed 219 items because one colour changed.

What changes:

1. **Shoot only what can have changed.**
   - Items that were not a match last round are always shot.
   - Matching items are shot again only when their route's files changed since the last round.
   - The map records each route's source folder; the mapper fills it in.
   - When unsure, shoot.
2. **Sample re-reviews.**
   - A matching item whose picture changed goes to a sample: one per screen group, plus any item
     whose pixel difference is above the auto-match line.
   - If the sample finds a problem, the rest of that group is reviewed.

Where: `lib/picture/shoot.mjs:selectStates`, `lib/picture/review.mjs:planReview`/`carriedItems`,
`lib/picture/map.mjs` (route sources), `briefs/mapper.md`, `tunables.json`.

Tests: an unchanged route isn't re-shot. A group whose sample finds a regression is fully
reviewed.

Saves: a late round goes from about 1.5 h to 20 to 30 min.

## W6. Faster shoots (D9)

What goes wrong:

- One browser, fully sequential.
- A dev server that compiles each route on first visit.
- 8 s click timeouts, and fixed pauses after every step.
- Rounds: 35 min per shoot of 322 items.

What changes:

1. The shoot runs against a production build (`next build` then `next start` on a second port).
   The dev server stays for the builder. The build goes through the machine's heavy slot. If it
   fails, the shoot stops with the build error, which is another page-load gate.
2. Two browser contexts run at once, each on a different world. A world is never shared between two
   contexts at the same time, so re-seeds stay safe.
3. The fixed pauses and timeouts move from constants into `tunables.json`. The click timeout after
   the page has loaded drops from 8 s to 3 s.
4. One sign-in per world and role. This already exists; it's kept.

Where: `lib/picture/shoot.mjs`, `lib/commands/shoot.mjs`, `lib/capture/slots.mjs`, `tunables.json`,
and the profile's `commands.prodServer`.

Tests: two worlds shoot in parallel with identical results to a serial run. A build failure stops
the shoot.

Saves: 35 min → about 10 to 12 min per shoot, about 1.5 h over a Rounds-sized run.

## W7. Better reviews

What goes wrong:

- **Reviewers disagree between rounds.** Settings round 1 called the phone menus bottom sheets and
  round 2 called them floating cards, so one fix went the wrong way. Steers are written only by
  `retro`, after the run.
- **The crop.** At phone width it hides any full-width bar at the bottom 160 px or less tall, so a
  short bottom sheet disappears. It also cuts everything above the first heading, including the
  phone header, but only on the live picture, not on the design. That gave 13 false "to fix" items
  in Settings round 4.
- **`shoot.json` is 500 KB**, too big for reviewers to read.

What changes:

1. Before round 1, one Sonnet worker writes `steers.md` from the design: phone patterns (sheet,
   card, full page), fixture names, and which rules override the picture. Update runs copy the
   earlier run's steers.
2. The crop hides only the element the profile names as the tab bar (a selector). The top crop is
   applied to both pictures the same way, and it keeps the phone header when the profile says so.
3. `review --plan` writes a short facts file per item (buttons found, overflow, text differences
   from W3), and reviewers read that instead of `shoot.json`.

Where: new `briefs/steers.md` role, `lib/lifecycle/intake.mjs` (`--from` copies steers),
`lib/picture/shoot.mjs` (`hideBottomBars`, `pageAreaTop`, `cropDesigns`), `lib/picture/widths.mjs`,
`lib/commands/review.mjs`, `briefs/reviewer-picture.md`.

Tests: a short bottom sheet stays visible. Design and live crops share a top edge. The facts file
is under 2 KB per item.

Saves: about 1 h per run in wrong fixes and false findings.

## W8. Shipping checks

What goes wrong:

- **Two runs changed the same shared code.** Both redefined `retire_organization`, and the later
  one silently dropped the other's tables on staging. Nothing flagged it before the staging merge.
- **Retired test ids surfaced only at prepush.** That needed a prep PR (#2117) and a wait for you.
- **Prepush flagged ids inside skipped tests.**
- **Land missed a silently failed Vercel build.** It reads only GitHub Actions, and it didn't
  re-run staging E2E after the deploy.

What changes:

1. `delivery map` lists files this run will likely touch that another open run also changes:
   - a function two migrations redefine;
   - the locale files;
   - the navigation config.
   It says which run to coordinate with.
2. The retired-test-id check runs at map time, so the skip PR can go up while the build runs.
   Prepush ignores ids inside `test.skip`.
3. Land reads the merge commit's statuses, including Vercel's, and fails on a red deploy. Once the
   deploy is live, it runs the profile's staging E2E command.

Where: `lib/picture/map.mjs` or a new `lib/lifecycle/overlap.mjs`, `lib/lifecycle/prepush.mjs`,
`lib/lifecycle/land.mjs`, `lib/core/gh.mjs`, `schemas/profile.schema.json`.

Tests: two fixture branches that both redefine one function are flagged. A failed commit status
fails land.

Saves: about 1.5 h per run, and it prevents one class of silent data loss on staging.

## W9. Scope and models (D10, D11)

What changes:

1. **Splitting big designs.**
   - Intake counts the design's states. Above 120 (a tunable), NEXT proposes screen groups, and
     each group becomes its own run.
   - Groups build one after another after a components run, or in parallel. Four agents at most
     at once, per your budget rule.
   - The first builder gets one screen group per dispatch, not the whole page, so it stops hitting
     its turn limit. Rounds hit it four times.
2. **Models.**
   - Extractors: Sonnet `low` → `medium`.
   - A test fails if any Sonnet role is set above `high`.
   - `models.json` gains an `experiment` field. The next run sets the builder to Opus `medium`, and
     the ledger records it, so the retro can compare it with a run at `high`.
   - The fixer stays Sonnet `medium`.

Where: `lib/lifecycle/intake.mjs`, `lib/picture/next.mjs`, `skills/picture-build/SKILL.md`,
`agents/delivery-extractor.md`, `models.json`, `tests/retro/models.test.mjs`,
`lib/retro/record.mjs`.

Saves: about 2.5 h of wall time on a Rounds-sized design, and cost from the effort changes. That
figure is measured, not assumed.

---

# Part 3: order, measurement, limits

## Order and releases

| Release | Workstreams | Why this order |
|---|---|---|
| 0.15.0 | W1 pictures, W2 page load | small, and everything later compares against these pictures |
| 0.16.0 | W3 right data | the biggest gain in quality; uses W1's text |
| 0.17.0 | W4 rounds, W5 cheaper rounds | more rounds only make sense once rounds are cheap and honest |
| 0.18.0 | W6 faster shoots | independent; biggest single time saving |
| 0.19.0 | W7 reviews | uses W3's text differences in its facts file |
| 0.20.0 | W8 ship checks, W9 scope and models | least urgent; W9's model change is measured on the next run |

Each release is one PR in `claude-code-tools`. It carries a version bump, a README update and
tests, and it merges once `node --test` passes. The first PR also commits this plan.

The Telitask repo changes only where a workstream needs it: the `validateSeedJson` script (W3), the
profile's tab-bar and skeleton selectors (W2, W7), and `prodServer` (W6). Those go through a normal
draft PR to staging.

## How we measure

`docs/delivery/runs.jsonl` already records per-phase minutes and each agent's model, minutes and
cost. After the next two runs, the retro compares them with Settings and Rounds on five numbers:

1. wall time;
2. cost per run and per finished round;
3. rounds thrown away (target 0);
4. data faults found before review versus data gaps found by reviewers (target: almost all
   before);
5. real bugs left at the end (target 0).

If a workstream doesn't move its number, we revert it. That's the reason for one PR each.

## What this plan does not do

- It doesn't replace the picture reviewers with a machine. Machines check data, loading and
  cropping; judging the look stays with agents.
- It doesn't add a test clock to the dashboard (D4).
- It doesn't tear down fixture organisations on staging. They stay for later E2E use, as today.
- It doesn't automate your guard approvals. The safety file stays yours.

## Risks

- **The trace adds mapper work.** About 10 to 15 minutes per run. It pays back in round 1.
- **Production-build shoots need a free heavy slot.** At busy times the shoot waits. The wait is
  logged, so the retro sees it.
- **Sampling can miss a regression** in a group whose sample happens to be clean. The final round
  before ship reviews every changed item, so nothing ships unreviewed.
- **Values the product generates** can only be checked by shape, so a wrong AI summary still needs
  a reviewer's eye.

---

# Progress (unattended run from 2026-09-30, W3 to W9)

Each workstream: what 0.15 to 0.18 already had, what this run built, the PR, and the decisions
taken where the plan left a choice open. Baseline before W3: 1213 tests, 1195 pass, 0 fail, 18
skipped (`node --test 'tests/**/*.test.mjs' 'skills/**/*.test.mjs'`).

## W3 right data (0.19.0), merged as #68

Already there:

- The trace is the 0.15 data contract (`lib/picture/contract.mjs`): every design text, labelled
  data / fixed / random, data entries with table, column and kind (value, count, date, time).
- `seed --check` refuses a data value no world holds (0.15, `contractGaps`).
- The shoot resets each world right before its shots and after a data-changing entry, freezes the
  browser clock at the seed moment, in `testData.timeZone` (0.16, `lib/picture/shoot.mjs:runShoot`).
- Data differences are looked up in the world after the shoot: world lacks it → data gap, world
  holds it → must fix (0.16, `sortDataDifferences`); `shoot --only data-gaps` re-shoots them.
- `seed --plan` prints guards to approve and refuses CHECK and enum violations (A2).

Decisions:

- D5 reading: a seeded table needs a guard only when a side-effect rule watches it. Tables no
  predicate watches (organisations, members) stay guard-free, or every run would need guards for
  them.
- Refresh cleans every table the world has ever seeded (a `seededTables` history in the seed
  plan), not every organisation-scoped table: rows a trigger creates for a new organisation live
  in tables the world never seeded, and deleting them would break the world.
- The trace stays the 0.15 contract, extended, not a second `trace` field in `map.json`: `row`
  (spike S3), kind `generated` (checked by shape), and a fourth label `none` for "the product does
  not store it". `computed` is the contract's existing `count` kind.
- The founder's decision on a `none` value lives in `contract.json` (`decision`: build, drop,
  design), set by `delivery contract --decide`; it survives a rebuild. The run goes on while the
  founder answers; `ready` stays red until every value is decided. The questions step replaces the
  separate A2 guards step, so the founder gets one list.
- `data-fault` is a new verdict beside `data-gap`: the machine's finds (datacheck) are counted
  apart from the reviewers' (`dataFault` per round in the ledger and in `delivery runs`), which is
  the plan's measure 4.
- Datacheck replaced the 0.16 lookup inside the shoot, and uses the rows the reset read back. The
  spike's row rule (S4) is the fallback when a round has no `seeded.json`. It runs in the shoot;
  `delivery datacheck` re-runs it from saved files. At most two data-fix passes per round, then the
  reviewers see it anyway.
- `seed --from-trace` never writes to the database, only world files, `swaps.json` and missing
  fixture user names in `map.json`. Its rows are keyed `t-<row>`; hand rows are never touched.
  Toggle state from `dom.json` (the spike's calling-hours days) is left to the seed-writer.
- `seed --need` answers "held" only when a contract value of that state matches; anything else is
  queued in `needs.json`, closed with `--need-done`.
- The source check (spike S2) greps the repo's code for `.from('<table>')...select(...)` after a
  shoot; a traced column no query selects is a founder question, never a refusal.
- The hook refuses a seed-named interpreter script only when its text shows a database write or it
  cannot be read (fail closed).

Built: PR https://github.com/karanivincent/claude-code-tools/pull/68 (tests 1321, 1303 pass, 0 fail); Telitask-side changes are in
`docs/plans/telitask-changes-for-0.19-plus.md`.

## W4 rounds and W5 cheaper rounds (0.20.0)

Already there: `MAX_ROUNDS = 3` in `lib/picture/next.mjs`, used by NEXT and by ready with
different counts (round number against shot rounds); carried items (unchanged pictures) and
auto-matched items skip reviewers (A6); `shoot --only` re-shoots into a round (0.16); a round the
server broke during is deleted (0.18, W2), so void rounds already never count.

Decisions:

- The stop rule is `lib/picture/stop.mjs:roundDecision`, over each compiled round's real-bug count
  (must plus not reached, each item's newest verdict up to that round). NEXT and ready both call
  it. Stall 2 and ceiling 8 are tunables.
- "Stuck items" are the items open in each of the last three compiled rounds; `review` writes
  `stuck.md` when the rule stops. "Why it did not move" is stated from the notes: the same note
  every round, or notes that changed.
- W5 route sources are a top-level `sources` map in `map.json` (route → globs), matched by longest
  route prefix. Any changed file outside every route's sources means "not sure", and everything is
  shot. `.delivery/` is ignored. `--all` forces a full shoot.
- A skipped item keeps its earlier record and pictures, copied into the new round with
  `unchanged: { from }`; their hashes are equal, so the review carries them as before.
- Sampling covers items that passed (match or small) whose picture changed. Per screen: the one
  with the largest pixel difference, plus every item above the auto-match line (tunable
  `review.samplePerScreen`). The rest are held. A failed sample makes NEXT plan the held rest of
  that screen (`review --plan --held`) before the fix; every held item is reviewed once before
  shipping, and ready stays red until then. That is the plan's "final round reviews every changed
  item".

Built: PR https://github.com/karanivincent/claude-code-tools/pull/69 (tests 1365, 1347 pass, 0 fail).

## W6 faster shoots (0.21.0)

Already there: the shoot is one browser, fully sequential, against `--base-url` (a dev server or a
preview); `waitForQuiet` (0.13.1) and one saved sign-in per world and role; the profile already has
`prodBuild`/`prodStart`, used by full-mode captures with no preview.

Decisions:

- A new optional `commands.prodServer`, not `prodBuild`+`prodStart`: those build into the dev
  server's own folder, which would break the builder's running dev server. The consuming repo gives
  prodServer its own build folder (Telitask note, item 5). `shoot --prod` uses it; `--base-url`
  stays for a preview or the dev server.
- The build runs inside the shoot's own heavy slot rather than through `commands.heavy`, which would
  take a second slot and could wait on itself.
- Parallelism is by world (tunable `shoot.parallelWorlds`, 2): whole world queues, so a world is
  never in two contexts and its resets stay safe.
- Waits became tunables. Click timeout 8 s → 3 s as planned; the fixed pauses were also shortened
  (step 400 → 250 ms, settle 600 → 300 ms, resize 300 → 200 ms) because `waitForQuiet` and
  `networkidle` already do the real waiting and screenshots disable animations. The next run's
  ledger says whether that moved not-reached counts; the retro can move them back.

Built: PR https://github.com/karanivincent/claude-code-tools/pull/70 (tests 1381, 1363 pass, 0 fail).

## W7 reviews (0.22.0)

Already there: `steers.md` is added to every reviewer prompt (0.11); `retro` proposes steers after
a run; the crop hid any full-width fixed bottom bar up to 160 px and cut the live picture only at
the page title; reviewers read `shoot.json`; the 0.16 prompts list the lookup's sorted notes.

Decisions:

- The steers writer is a `delivery-extractor` (Role: steers, Sonnet, `briefs/steers.md`): it only
  writes one file. NEXT asks for it before round 1 (and before an update run's first shoot);
  `carryOver` copies `steers.md`, and `swaps.json` with it, since carried worlds hold swapped
  values.
- The tab bar is the profile's optional `picture.tabBar`. Without it the old rule stays, minus any
  element in or holding a sheet or dialog, so the plugin still works without a Telitask change.
- The design's top edge uses the design's own page title (its dom.json `h1`) less the same 24 px,
  raised to the live picture's open-panel top, since the design's dom.json does not record panels.
  `picture.keepPhoneHeader` sets both to 0 at phone width.
- The facts file is markdown, one per item sent to a reviewer, cut to 2 KB with "and N more".

Built: PR https://github.com/karanivincent/claude-code-tools/pull/71 (tests 1412, 1393 pass, 0 fail, 19 skipped).

## W8 ship checks and W9 scope and models (0.23.0)

Already there (W8): prepush's removed-name rule (base specs and plans against the branch's app
sources), the org-scoped retirement lists, land's deploy waiter, workflow runs and loop test. No
overlap detection between runs; statuses were never read.

Decisions (W8):

- Overlap lives in a new `lib/lifecycle/overlap.mjs`. "Another open run" is any open PR whose
  branch starts with the profile's `repo.branchPrefix`. Its files and the functions its migrations
  define come from the PR's file patches. At map time it only warns; at prepush a function both
  runs redefine is a problem (that was the staging data loss), shared-file overlaps stay warnings.
- The navigation config is the profile's optional `paths.sharedFiles`; the message files are always
  shared.
- Retired test ids at map time need the map's `sources` (W5). Without them the check says so and
  prepush catches them as before.
- Prepush cuts `test.skip(...)`, `describe.skip(...)` and `.fixme(...)` calls out of a spec before
  reading its ids.
- Land reads the combined commit status of the merge commit (Vercel reports there) and runs the
  optional `commands.stagingE2e` once per merge after the deploy is live, journalled like the loop
  test.

Decisions (W9):

- The split is a NEXT step after a valid map, when the map has more than `run.splitAboveStates`
  (120) states, listing screen groups with counts; `"oneRun": true` in the map keeps one run. It
  proposes; starting the group runs stays with the session and the founder.
- The builder brief and skill give the first builder one screen group per dispatch (a `Screens:`
  line) whenever the map has more than one screen.
- Extractor, contract and steers roles move to Sonnet medium (one agent file, `delivery-extractor`).
  A test fails on any Sonnet role above high.
- The D11 builder trial is `models.json` `experiment` with its own agent file,
  `picture-builder-medium` (effort lives in agent files). The builder role lists it in
  `agentTypes`; the SubagentStop record carries the agent type, so the ledger knows the experiment
  ran and `delivery runs` shows it. `activeExperiment` turns it off after `runs` runs.

Built: PR https://github.com/karanivincent/claude-code-tools/pull/72 (tests 1467, 1448 pass, 0 fail, 19 skipped).

## What the next run should measure

The plan's five numbers, from `docs/delivery/runs.jsonl` and `delivery runs`, against Settings
(12 h, about $200, 2 rounds thrown away, 39 data gaps in round 2, 13 open at the end) and Rounds:

1. Wall time, and the share of it in shoots (W6: target 10 to 12 min per shoot on `--prod`).
2. Cost per run and per finished round, and the builder experiment's build-phase cost against a
   run at Opus high.
3. Rounds thrown away (target 0): a round deleted by W2 or re-shot for a broken page.
4. Data faults per round (datacheck, before review) against data gaps per round (reviewers): the
   ledger now records both. Target: almost all caught as data faults, before round 1's review.
5. Real bugs left when the loop stops, and whether it stopped at zero, stuck (`stuck.md`) or at
   the ceiling.

Also worth one line each in the retro: items skipped as unchanged per fix round (W5), held items
and failed samples, and whether the shorter shoot pauses raised not-reached counts.
