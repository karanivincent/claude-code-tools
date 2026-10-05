---
name: picture-build
description: Use inside a picture-mode delivery run (the default for /deliver-from-design) once the design's states are rendered - to write the button map, seed the test worlds, have one builder build the page from the design pictures, picture the live page, have reviewer agents compare it with the design, run fix rounds while the count of items to fix falls, and ship. Triggers - NEXT names this skill, "build it from the pictures", "run the next round", "review the round".
---

# Picture build

A page is built by one agent looking at the design, and checked by agents looking at pictures.
Scripts only do the fixed jobs: picturing the design, seeding test data, signing in, walking to
each state, taking the live pictures, listing buttons, and running CI. They never judge whether a
page matches. Agents do that.

`delivery <command>` means `node scripts/delivery.mjs <command>` (the repo's shim). `<plugin>` is
this plugin's root, two directories above this skill.

Run every delivery command bare, from the worktree root. No `cd … &&` in front, no `VAR=value`
prefix, no `$(…)`. Those shapes make the harness ask for permission every time
(`docs/OPERATING.md`, Permission prompts).

## Widths

A map checks the widths it declares: `"widths": ["desktop", "phone"]` (desktop 1440 x 900, phone
390 x 844), or desktop only when it says nothing. Each state at each width is an **item**: `KC-05`
is the desktop, `KC-05@phone` the phone. The loop below is the same at two widths, with twice the
pictures: the shoot takes every item, reviewers review items, and every count is of items. A
desktop-only run is exactly as before.

## Components

A page run's used components come from `docs/delivery/components.json`, not from writing them by
hand: when a design state names a component that isn't built there yet, NEXT names the components
run (`delivery intake <export> --components`) instead of the next picture-loop step, and that run
must land first.

## The loop

| Step | Who | Command or brief | Output |
|---|---|---|---|
| 0 Rules | one `delivery-worker`, `Role: rules` | `<plugin>/briefs/rules.md`, then `delivery rules` | `rules.json`: every behaviour the briefs state, with its proof |
| 0b Design-send | this session, `design-send` skill | only when a rule is `owed-design`: send that brief, or have the founder cut the rule | the design draws it, or `rules.json` records the cut |
| 1 Pictures | this session | `design-inventory` steps 1 to 4 only (candidates, states, assemble, render); when the map declares the phone, `delivery design render --width phone` too | `.delivery/<f>/design/<ID>.png`, `<ID>@phone.png` |
| 2 Map | one `delivery-worker`, `Role: mapper` | `<plugin>/briefs/mapper.md`, then `delivery map` | `map.json`, `checklist.md`, world files; also fills in the states of any `picture`-proof rule that needed them (rerun `<plugin>/briefs/rules.md` if one is still missing its states) |
| 2b Contract | this session, then one `delivery-extractor`, `Role: contract` | `delivery contract` (the texts, from the design DOM); the labeller with `<plugin>/briefs/contract-labeller.md` works from `.delivery/<f>/contract-todo.json` and writes the batch file it names (`contract-labels-<n>.json`); `delivery contract` again, and a new labeller for what the new todo lists | `contract.json`: every text each state shows, labelled data (with its table, column and row), fixed, random, or none (the product does not store it) |
| 2c Questions | this session | `delivery contract --questions`, sent to the founder in one message; each answer recorded with `delivery contract --decide`. Carry on while they answer | `questions.md`: values the product does not store, guards to approve, and after a shoot the traced columns no query selects |
| 3 Worlds | this session, then one `delivery-worker`, `Role: seed-writer`, only for what the command lists | `delivery seed --from-trace` (world rows from the contract, safe emails and names, `swaps.json`); the seed-writer with `<plugin>/briefs/seed-writer.md` handles the lines it could not infer; `seed --plan` (column types, `validateSeedJson`), `--check` (every contract data value held, every watched table guarded); then this session runs `delivery seed --apply` | fixture worlds on the test project |
| 3b Steers | one `delivery-extractor`, `Role: steers` | `<plugin>/briefs/steers.md`, before round 1; an update run carries the earlier run's | `steers.md`: phone patterns, test data, rules over the picture; added to every reviewer prompt |
| 4 Build | one `delivery-tools:picture-builder` agent (Opus, high) | before dispatch: `delivery rules` must exit 0 (a non-zero exit names an owed rule; go back to step 0b); then `<plugin>/briefs/builder-picture.md`; it reports done only once `delivery smoke` passes | commits on the run's branch |
| 5 Shoot | this session | `delivery shoot --prod` when the profile has `commands.prodServer` (a production build, built in the heavy slot, served on its own port; the dev server keeps running for the builder), else the dev server in the background and `delivery shoot --base-url <url>` (worlds are shot two at a time; it runs `delivery smoke` first and pictures nothing when a page does not load, and deletes the round's folder when the server breaks during it, so the number is reused; every width the map declares; it resets each world to its seed right before its shots and before every state that saves, and freezes the browser clock at that moment; then datacheck looks for every traced value in the page's text) | `rounds/<n>/<ITEM>.live.png`, `<ITEM>.design.png`, `<ITEM>.live.txt`, `shoot.json`, `datacheck.json` |
| 5b Data faults | a seed-writer, then this session | only when datacheck found a data fault: the seed-writer with `Problem: rounds/<n>/datacheck.json`, then `seed --plan`, `--check`, and `delivery shoot --only data-faults`; at most two passes, before any reviewer | the round's data faults fixed in the world, not in code |
| 6 Review | one `delivery-tools:picture-reviewer` per batch (Sonnet, medium, with `delivery crop`) | `<plugin>/briefs/reviewer-picture.md` | `rounds/<n>/review-batch-<k>.md` |
| 7 Compile | this session | `delivery review --round <n>` | `review.json`, `compare.html` |
| 8 Fix | a fresh `delivery-tools:picture-fixer` per round (Sonnet, medium) | the round's `review.json` and `builder-notes.md` | commits; then 5 to 7 again |
| 9 Ship | this session; a `delivery-worker` with `Role: ci-fixer` per failing check | full CI chain, `delivery prepush`, push, `delivery ci --pr <n>`; a red check goes to `<plugin>/briefs/ci-fixer.md` | the preview, a sign-in link, the comparison page |
| 10 Retro | this session | `delivery retro` once `ready` is green; commit `docs/delivery/runs.jsonl` with the run | the run's line in the ledger |

`delivery status` prints where the run is and one NEXT line. Rules run first, straight after
intake, so a behaviour the briefs state but the design never drew is sent back before anything is
built, not found by a builder mid-round. Round 1 is the first build. There is no fixed number of
fix rounds: they go on while the count of items to fix (must fix plus not reached) falls, the run
ships at zero, and the loop stops after two rounds in a row with no fall (or at the ceiling of eight
rounds). Then only the stuck items go to the founder, in the round's `stuck.md`, each with the
reviewers' notes and why it did not move. NEXT and `ready` read the same rule. The numbers are in
`tunables.json` (`rounds.stallRounds`, `rounds.ceiling`).

Late rounds are cheap. A fix round shoots only what can have changed: an item that passed the round
before keeps its pictures when no file under its route's `sources` (in `map.json`) changed. An item
that passed and whose picture changed is sampled: one per screen, plus any whose pixels differ
beyond the auto-match line, goes to a reviewer, and the rest are held. When the sample finds a
problem, `review --plan --held` reviews the rest of that screen; every held item is reviewed once
before shipping.

## Update runs

A page built from an earlier design gets an update run when its design changes:
`delivery intake <new export> --feature <slug>-update --from <slug> --intent "<sentence>"`. It starts
from the earlier run's map, worlds, rules and intent. Render the new design, let the mapper bring
the map up to date (new states, phone widths, anything renamed), then round 1 pictures the page as
it already is, before any building. The reviewers list what the new design changed, and the
builder fixes only that. Something the code does that the design doesn't show is flagged like any
difference: it goes back to the design, or becomes a rule.

## Who does what

`<plugin>/models.json` names each role's model, effort and agent; the agent file carries the
effort, which the Agent tool cannot set, so dispatch the agent it names and never override its
model. In short: extractors are Sonnet at medium; the rules, map, seed-world and CI-fix jobs are one
`delivery-tools:delivery-worker` each (Sonnet at medium), told their role on the prompt's first
line; the first build is Opus at high; each fix round is a fresh Sonnet fixer; reviewers are Sonnet
at medium with a crop tool. This session stays on Opus: it runs the run, decides, sorts findings
and never does an agent's job itself. Every agent that edits runs a real check before it reports
done, and ends its reply with `Outcome: done` or `Outcome: blocked`; the SubagentStop hook records
it for the runs ledger. An agent that reports done without naming the check it ran is sent back
once to run it.

## Dispatching

Every agent is dispatched from this session, in the foreground unless noted, with exactly this
prompt and nothing else:

```
<worker: Role: rules | mapper | seed-writer | ci-fixer>
Read <plugin>/briefs/<brief>.md and follow it.
Feature: <slug>   Worktree: <absolute path of the run's worktree>
<rules and mapper: nothing more>
<seed-writer: Worlds: <world ids, or "the ones the map names without a file">   (a fix: Problem: <the lines seed --from-trace could not infer, rounds/<n>/datacheck.json, needs.json, or the check's output>)>
<contract (delivery-extractor): Role: contract, then Read <plugin>/briefs/contract-labeller.md and follow it.   Todo: .delivery/<f>/contract-todo.json (its write names the batch file)>
<steers (delivery-extractor): Role: steers, then Read <plugin>/briefs/steers.md and follow it.   Write: docs/delivery/<f>/steers.md>
<ci-fixer: Check: <the failing check>   Log: <the log file delivery ci wrote>   Dev server: <running at <url>, or stopped>>
<builder: Dev server: <url>   Round: 1   Screens: <one screen group>   Components: run `delivery components --used`>
<fixer: Dev server: <url>   Round: <n>   Components: run `delivery components --used`   Review: .delivery/<f>/rounds/<n-1>/review.json   Notes: .delivery/<f>/builder-notes.md>
<reviewer: Round: .delivery/<f>/rounds/<n>/   States: <ITEMS, e.g. KC-05 KC-05@phone>   Write: review-batch-<k>.md>
```

You do not write the reviewer prompts. `delivery review --plan --round <n>` does, and dispatch is
copying: it writes `batches.json` and one `batch-<k>.prompt.md` per batch into the round's folder.
Dispatch each prompt file as it is. It also leaves out what needs no reviewer: an item whose live and
design pictures are both unchanged since the last round keeps that round's label (carried), and an
item whose text, test ids and buttons equal the design's with almost no pixel difference is marked
a match (auto). Both show on the comparison page. If `docs/delivery/<f>/steers.md` exists, its text
is added to every prompt; put anything you would otherwise repeat to each reviewer there.

- The first build is one `delivery-tools:picture-builder` agent (Opus, high), in the background:
  it takes about an hour, and it leaves `.delivery/<f>/builder-notes.md` behind. When the map has
  more than one screen (`screen` on its states), dispatch it once per screen group, one after
  another, each with a `Screens:` line naming one group, so no dispatch runs into its turn limit;
  each later dispatch continues from the notes the one before left. When `models.json` has an
  active experiment for a role, dispatch its agent instead of the role's usual one; the ledger
  records it. Each fix round is
  a fresh `delivery-tools:picture-fixer` agent (Sonnet, medium), in the background, given the
  round's review and those notes; never resume the first builder for a fix round. Neither is ever
  dispatched as `delivery-tools:delivery-builder`: that agent works in a fresh worktree of its own,
  off the integration branch, which this run's dev server cannot see; a builder dispatched that
  way can work for an hour with nothing to show for it.
- Reviewers: one `delivery-tools:picture-reviewer` per batch from `batches.json` (up to 20 items, a
  state's desktop and phone together, a screen kept whole where it fits). `batches.json` lists the
  waves: dispatch one wave in one message, and the next when it is done.
- A world file problem (a reviewer's `data gap:`, a red `seed --check`) goes to a seed-writer, and
  a red CI check after the push to a ci-fixer; this session re-seeds and pushes after them.
- Never more than four agents at once.

## Rules

1. **Scope is the page's own area.** The capture crops the sidebar and top bar away. A difference
   in the shared frame is filed as a loose end once, and never blocks the page.
2. **The shoot resets the worlds itself.** Right before a world's first shot it is restored to
   its seed (relative dates moved to that moment, rows a click added removed, then scanned), and
   again after a data-changing shot touched it; the browser clock is frozen at that moment, in the
   profile's time zone. A world whose reset the safety scan refuses is not pictured. Never pass
   `--no-reset` for a numbered round.
3. **A test-data problem is fixed in the world file, never in code.** After every shoot,
   datacheck looks for every contract data value in the page's text, and looks each miss up in
   the world as seeded: the world lacks it (`data fault`) or holds it and the page doesn't show it
   (`must fix`, for the fixer). Data faults go to a seed-writer before any reviewer sees the round;
   once `seed --plan` and `--check` pass, `delivery shoot --only data-faults --base-url <url>`
   pictures just those items again into the same round. A round whose only open items are data
   faults or gaps never ships. `delivery datacheck` sorts a round again without shooting, after a
   contract fix. Say so in the builder's next prompt, so it doesn't chase them.
   Any agent that needs data asks `delivery seed --need "<STATE>: <what>"` and gets one line back:
   held, or queued for the seed-writer.
4. **The pictures show the design's data.** `contract.json` lists every text each state shows,
   taken from the design render. `seed --check` refuses a data value no world holds, a count the
   rows don't add up to, and a fixture user whose name isn't the design's, before anything is
   built. A state the labeller marks inconsistent (the design contradicts itself) goes to Claude
   Design with `design-send`, not to seeding. A value the product does not store is labelled
   `none` and asked once, before the build (step 2c); a decided one is closed, an undecided one
   keeps `ready` red. A state whose look depends on the clock is marked `clock: true`, and its
   world's times must be relative. `design render` rebuilds the contract on every new
   export; run `delivery contract` and `seed --check` again after it.
5. **The worlds belong to this run.** `seed --check` refuses a world whose organisation name
   another fixture organisation already has, and a table the worlds write whose columns changed
   since `seed --plan` (a migration mid-run: re-plan, and have a seed-writer add any value the
   design shows). A world lists the shared rows it reads as `globals`; the shoot warns when one
   changed since `seed --apply`. Masks (`mask` on a map state) are only for values no seed can
   pin, and every one is counted in the runs ledger.
6. **A behaviour the design implies but doesn't state is a Tier 1 decision.** Read the rule off
   the design pictures (which states show it, which don't), write the decision file, and give the
   builder the rule.
7. **The capture never clicks a metered, dialling or destructive control.** `delivery map` refuses
   a reach step that does, unless an intercept answers it. Never change an effect to get past it.
8. **No browser tool, for anyone.** Pictures come only from `delivery design render` and
   `delivery shoot`.
9. **The builder never pushes and never starts a server.** This session runs the dev server
   (the profile's `commands.devServer`, in the background), the full CI chain, and every push.
10. **Every behaviour the briefs state has a proof.** The rules agent writes one rule per behaviour
   into `rules.json`: shown by a design state, proved by a test named `R<n>: ...`, or cut. A rule the
   design never drew is `owed-design`: send it with the `design-send` skill (step 0b), or have the
   founder cut it (proof `cut`, with a Scope line) — never dispatch the builder while `delivery
   rules` still exits non-zero on an owed rule. `delivery rules` prints every gap and names the rule
   ids, and `delivery ready` stays red while one is open. Never soften a rule's text or switch its
   proof to get past it.
11. **A page that scrolls sideways on a phone is always a must fix.** The shoot measures it and
   `delivery review` counts it, so it cannot be argued away as small.
12. **No round waits for the clock.** A state that depends on the time of day carries its own
   hours in its world (relative minute-of-day values, `{"$minuteOfDay": "now-60"}`, and for
   a closed or open window the paired `closedStart`/`closedEnd` or `openStart`/`openEnd`); never
   schedule a shoot for a time of day.

## Shipping

1. Stop the dev server first: a production build and a dev server share the build folder.
2. The full CI chain through the heavy wrapper (`commands.heavy` around `commands.gate`). If a
   package isn't installed in the worktree, install from the lockfile (`commands.bootstrap`) and
   run it again.
3. Run `delivery prepush` and fix every FAIL line first: a test id or text the base branch's design plans
   or specs still name, an org-scoped table missing from a retirement list, a branch behind its base,
   or a components problem. Each of these fails after the push and the pull request cannot fix the
   first one. Then push. `delivery ci --pr <n>` until it is green (a profile's `ci.knownRed` workflows excepted),
   then `delivery ready --pr <n>`. In picture mode it checks the rounds instead of a full capture:
   every round compiled, every state's newest picture reached, open states only once the fix rounds
   are spent, and every rule proved (`delivery rules --ready`). The hook refuses `gh pr ready` until it is green.
4. Resolve the preview (`commands.previewUrl`), re-seed the design world, and give the founder a
   sign-in link: `delivery sign-in design --base-url <preview>`. It works once and lasts about an
   hour; when the founder says it expired, re-seed and run it again.
5. Publish the last round's `compare.html` with its folder as a private Artifact.
6. Report in the founder's report format: the preview, the link, the comparison page, the counts,
   and what is still open.

## Rationalizations

| Thought | Reality |
|---|---|
| "Let the builder picture every state after each change" | A shoot of every state takes ten minutes and changes data. It pictures a few states at a time, into `rounds/work`. |
| "The reviewer flagged the sidebar" | Out of scope. The crop exists so that doesn't happen. Tell the reviewer's next prompt, or ignore it. |
| "Another round will get the last few" | Only while the count falls. Two rounds with no fall and the founder gets the stuck list; the last items are usually data-model gaps and product questions, not effort. |
| "Shoot everything again, to be safe" | A fix round shoots what can have changed; `--all` exists for a change the route sources do not show. Every held item is still reviewed before shipping. |
| "Split the page across builders to go faster" | One builder keeps one look. Two at most, by screen, when a page is truly two pages. |
| "Check the wording letter by letter" | Meaning, not letters. Test data changes names and numbers, and that's fine. |
| "That rule is obvious, it doesn't need a test" | If no picture shows it, nothing checks it. The test is how the next change can't quietly undo it. |
| "Mark it cut, the design didn't draw it" | Cut needs a Scope line the founder saw. A rule nobody drew is owed to the design. |
| "The phone can wait for a later run" | When the map declares the phone, it is part of this run. A phone item still stuck when the loop stops goes on the founder's list like any other. |
| "Compare the phone picture with the desktop design" | A phone layout is judged against the phone design only. |
