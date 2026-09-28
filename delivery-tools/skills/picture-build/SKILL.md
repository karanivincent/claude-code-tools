---
name: picture-build
description: Use inside a picture-mode delivery run (the default for /deliver-from-design) once the design's states are rendered - to write the button map, seed the test worlds, have one builder build the page from the design pictures, picture the live page, have reviewer agents compare it with the design, run at most two fix rounds, and ship. Triggers - NEXT names this skill, "build it from the pictures", "run the next round", "review the round".
---

# Picture build

A page is built by one agent looking at the design, and checked by agents looking at pictures.
Scripts only do the fixed jobs: picturing the design, seeding test data, signing in, walking to
each state, taking the live pictures, listing buttons, and running CI. They never judge whether a
page matches. Agents do that.

`delivery <command>` means `node scripts/delivery.mjs <command>` (the repo's shim). `<plugin>` is
this plugin's root, two directories above this skill.

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
| 0 Rules | one rules agent | `<plugin>/briefs/rules.md`, then `delivery rules` | `rules.json`: every behaviour the briefs state, with its proof |
| 0b Design-send | this session, `design-send` skill | only when a rule is `owed-design`: send that brief, or have the founder cut the rule | the design draws it, or `rules.json` records the cut |
| 1 Pictures | this session | `design-inventory` steps 1 to 4 only (candidates, states, assemble, render); when the map declares the phone, `delivery design render --width phone` too | `.delivery/<f>/design/<ID>.png`, `<ID>@phone.png` |
| 2 Map | one mapper agent | `<plugin>/briefs/mapper.md`, then `delivery map` | `map.json`, `checklist.md`, world files; also fills in the states of any `picture`-proof rule that needed them (rerun `<plugin>/briefs/rules.md` if one is still missing its states) |
| 3 Worlds | this session | `delivery seed --plan`, `--check`, `--apply` | fixture worlds on the test project |
| 4 Build | one `delivery-tools:picture-builder` agent | before dispatch: `delivery rules` must exit 0 (a non-zero exit names an owed rule; go back to step 0b); then `<plugin>/briefs/builder-picture.md` | commits on the run's branch |
| 5 Shoot | this session | dev server in the background, then `delivery shoot --base-url <url>` (every width the map declares) | `rounds/<n>/<ITEM>.live.png`, `<ITEM>.design.png`, `shoot.json` |
| 6 Review | one reviewer per screen | `<plugin>/briefs/reviewer-picture.md` | `rounds/<n>/review-<screen>.md` |
| 7 Compile | this session | `delivery review --round <n>` | `review.json`, `compare.html` |
| 8 Fix | the same builder | the round's `review.json` | commits; then 5 to 7 again |
| 9 Ship | this session | full CI chain, `delivery prepush`, push, `delivery ci --pr <n>` | the preview, a sign-in link, the comparison page |

`delivery status` prints where the run is and one NEXT line. Rules run first, straight after
intake, so a behaviour the briefs state but the design never drew is sent back before anything is
built, not found by a builder mid-round. Round 1 is the first build. At most two fix rounds
follow. Whatever is still open after round 3 goes to the founder as a list, with the comparison
page. It is not a red report.

## Update runs

A page built from an earlier design gets an update run when its design changes:
`delivery intake <new export> --feature <slug>-update --from <slug> --intent "<sentence>"`. It starts
from the earlier run's map, worlds, rules and intent. Render the new design, let the mapper bring
the map up to date (new states, phone widths, anything renamed), then round 1 pictures the page as
it already is, before any building. The reviewers list what the new design changed, and the
builder fixes only that. Something the code does that the design doesn't show is flagged like any
difference: it goes back to the design, or becomes a rule.

## Dispatching

Every agent is dispatched from this session, in the foreground unless noted, with exactly this
prompt and nothing else:

```
Read <plugin>/briefs/<brief>.md and follow it.
Feature: <slug>   Worktree: <absolute path of the run's worktree>
<mapper and rules agent: nothing more>
<builder: Dev server: <url>   Round: <n>   Components: run `delivery components --used`   (fix round: Review: .delivery/<f>/rounds/<n-1>/review.json)>
<reviewer: Round: .delivery/<f>/rounds/<n>/   States: <ITEMS, e.g. KC-05 KC-05@phone>   Write: review-batch-<k>.md>
```

You do not write the reviewer prompts. `delivery review --plan --round <n>` does, and dispatch is
copying: it writes `batches.json` and one `batch-<k>.prompt.md` per batch into the round's folder.
Dispatch each prompt file as it is. It also leaves out what needs no reviewer: an item whose live and
design pictures are both unchanged since the last round keeps that round's label (carried), and an
item whose text, test ids and buttons equal the design's with almost no pixel difference is marked
a match (auto). Both show on the comparison page. If `docs/delivery/<f>/steers.md` exists, its text
is added to every prompt; put anything you would otherwise repeat to each reviewer there.

- The builder is one `delivery-tools:picture-builder` agent (model: opus), in the background: a
  first build takes about an hour. Resume the same builder for each fix round (SendMessage), so it
  keeps what it learned. Never dispatch it as `delivery-tools:delivery-builder` — that agent works
  in a fresh worktree of its own, off the integration branch, which this run's dev server cannot
  see; a builder dispatched that way can work for an hour with nothing to show for it.
- Reviewers: one per batch from `batches.json` (up to 20 items, a state's desktop and phone
  together, a screen kept whole where it fits; model: sonnet). `batches.json` lists the waves:
  dispatch one wave in one message, and the next when it is done.
- Never more than four agents at once.

## Rules

1. **Scope is the page's own area.** The capture crops the sidebar and top bar away. A difference
   in the shared frame is filed as a loose end once, and never blocks the page.
2. **Re-seed before every shoot.** A state reached by saving, discarding or adding changes its
   world, and `delivery shoot` names those worlds at the end. `delivery seed --refresh all` before
   the next round's shoot, or the round grades drifted data.
3. **A test-data problem is fixed in the world file, never in code.** When a reviewer's note comes
   from the data (a stale banner, a missing row), fix `docs/delivery/<f>/worlds/<world>.json`,
   then `delivery seed --plan`, `--check` and `--refresh <world>`. Say so in the builder's next
   prompt, so it doesn't chase it.
4. **A behaviour the design implies but doesn't state is a Tier 1 decision.** Read the rule off
   the design pictures (which states show it, which don't), write the decision file, and give the
   builder the rule.
5. **The capture never clicks a metered, dialling or destructive control.** `delivery map` refuses
   a reach step that does, unless an intercept answers it. Never change an effect to get past it.
6. **No browser tool, for anyone.** Pictures come only from `delivery design render` and
   `delivery shoot`.
7. **The builder never pushes and never starts a server.** This session runs the dev server
   (the profile's `commands.devServer`, in the background), the full CI chain, and every push.
8. **Every behaviour the briefs state has a proof.** The rules agent writes one rule per behaviour
   into `rules.json`: shown by a design state, proved by a test named `R<n>: ...`, or cut. A rule the
   design never drew is `owed-design`: send it with the `design-send` skill (step 0b), or have the
   founder cut it (proof `cut`, with a Scope line) — never dispatch the builder while `delivery
   rules` still exits non-zero on an owed rule. `delivery rules` prints every gap and names the rule
   ids, and `delivery ready` stays red while one is open. Never soften a rule's text or switch its
   proof to get past it.
9. **A page that scrolls sideways on a phone is always a must fix.** The shoot measures it and
   `delivery review` counts it, so it cannot be argued away as small.

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
| "Another round will get the last few" | Three rounds, then the founder gets the list. The trial showed the last items are data-model gaps and product questions, not effort. |
| "Split the page across builders to go faster" | One builder keeps one look. Two at most, by screen, when a page is truly two pages. |
| "Check the wording letter by letter" | Meaning, not letters. Test data changes names and numbers, and that's fine. |
| "That rule is obvious, it doesn't need a test" | If no picture shows it, nothing checks it. The test is how the next change can't quietly undo it. |
| "Mark it cut, the design didn't draw it" | Cut needs a Scope line the founder saw. A rule nobody drew is owed to the design. |
| "The phone can wait for a later run" | When the map declares the phone, it is part of this run. A phone item still open after round 3 goes on the founder's list like any other. |
| "Compare the phone picture with the desktop design" | A phone layout is judged against the phone design only. |
