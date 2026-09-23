---
name: design-audit
description: Use when a built page, a branch or a deployed preview has to be compared with its design state by state, in every width, role and language that ships, before calling it done, or when a live page must be captured before a redesign. Symptoms - tests pass but the page looks wrong; "—", "" or "1 calls" on screen; designed buttons missing or doing nothing. Triggers - "audit the preview against the design", "does this match the design", "punch list". Not for code review.
---

# Design audit

## Overview

An audit measures the build against the design. It does not negotiate with it. Pictures come only
from the committed capture command. Verdicts come from the mechanical checks and from auditors
whose brief never mentions a gate. Severities come from fixed rules. You run the audit; you never
grade it, and nothing you do after a finding exists may make it smaller.

**Violating the letter of these rules is violating the spirit of them.**

`delivery <command>` below means `node scripts/delivery.mjs <command>` (the repo's shim), or
`node "${CLAUDE_PLUGIN_ROOT}/bin/delivery.mjs" <command>` in a repo without one. Outside a run, add
`--feature <slug>` to every command. `<plugin>` means this plugin's root: two directories above
this skill's base directory.

## When to use

- A preview, a branch or a deployed page must be compared with its design, state by state.
- Inside a delivery run: the wave audit after `delivery wave end`, the full audit before
  `delivery ready`, and the staging audit inside `delivery land`. Branch mode is
  `delivery gate <unit>` and needs nothing from this skill.
- On its own, against any preview whose feature has an inventory and a plan: the capture reads
  states, worlds, reach steps and markers from them.
- Before a redesign, to capture today's pages (`baseline` mode, which `design-inventory` drives).

Not for code review: `yond-dev:pr-reviewer` looks at different things, and neither replaces the
other. Not for a feature with no design: there is nothing to compare against.

## Modes

| Mode | When | Commands | Auditors |
|---|---|---|---|
| `baseline` | before a redesign | `delivery capture --mode baseline` | none |
| `branch` | one unit on its dev server | `delivery gate <unit>` | none |
| `wave` | every wave end, on the pushed head's preview | `delivery capture --mode wave`, then `delivery check all` | one per screen group: English, 1440, admin |
| `full` | before `ready`, on the PR's preview | `delivery capture --mode full`, `delivery capture --mode real-org`, then `delivery check all` | one per screen group (English, 1440, admin; also the phone width where the intent says `phone-required`), plus one real-org auditor |
| `staging` | after the merge, from `land` | `delivery capture --mode staging`, `delivery capture --mode real-org --base-url <the staging URL>`, then `delivery check all` | none |

Worlds, widths, roles, locales, themes and checks for each mode: `references/modes.md`.

## The audit, wave and full

1. **Capture.** `delivery capture --mode <mode>`. Exit 4 means the preview is not ready: wait,
   then run it again. Exit 1 means some states are `not-reached`, and each one is a P1 (M3). Fix
   the cause (the plan row's reach steps, markers or intercept, or the world's data with
   `delivery seed --refresh <world>`), then run `delivery capture --mode <mode> --states <IDs>`.
   A state is reached only when the capture reaches it.
2. **Mechanical checks.** `delivery check all`.
3. **Auditors.** Dispatch one auditor (agent type `delivery-tools:delivery-auditor`) per screen
   group, all in one message, in the foreground, each with the dispatch prompt below and nothing
   else. In full mode, add one auditor with `briefs/auditor-real-org.md` for the `real-org`
   capture run.
4. **Compile.** `delivery audit compile` records each `<group>.json` in `findings.json`, with the
   P1 floors applied, and writes `punch-list.html`. Exit 2 names a malformed report: dispatch that
   group's auditor again with the same prompt.
5. **Refutation.** For every group with an open P1 from its auditor, dispatch one more auditor in
   `refute` mode. It may only mark such a P1 `duplicate`, or `explained-by` a `cut` row or an
   `adapt` row. It never changes a severity.
6. **Spot check.** From each group's report, sort the `matched` states by id and take every
   tenth, starting with the first. Dispatch one more auditor per group in `spot` mode for them.
   The report prints the disagreement rate.
7. **Compile again.** `delivery audit compile` applies the refutations and records the spot
   checks. In full mode, publish `punch-list.html` as a private Artifact, with the pictures it
   lists (or run it with `--embed`).
8. **Fix.** P1s and P2s go to the next fix wave (`epic-build`). A P3 is fixed in that wave if the
   builder can, or waits for the run's polish issue. Inside a run, `delivery status`, then NEXT.

File names and shapes for every auditor pass, and how a P2 is accepted:
`references/auditor-files.md`.

## The dispatch prompt

Exactly these lines, filled in. Nothing else.

```
Read <plugin>/briefs/auditor.md and follow it.
Mode: <audit | refute | spot>
Group: <screen group, as a slug>
States: <IDs, space-separated>
Items: width <1440; in full mode 1440 390 where the intent says phone-required> role admin locale <primary>
Feature: <slug>   Capture run: <run id>
Write: .delivery/<slug>/audit/<group>.json   (refute: <group>.refute.json; spot: <group>.spot.json)
```

For the founder's organisation use `briefs/auditor-real-org.md`, `Group: real-org`, `Items: all`,
the `real-org` capture run and `Write: .delivery/<slug>/audit/real-org.json`.

Leave out the time, the founder, `ready`, gates, caps, fix waves, earlier audits, which severity
a difference deserves, what counts as minor and what to skip. An auditor that knows the pass mark
grades toward it.

## Severities are set by rules, never by you

- A check's severity is its rule's (`check:<id>`). An auditor finding in a P1 category (missing
  element, dead control, wrong fact or number, anything misleading) is P1 whatever the auditor
  wrote, and a day-one state is raised one level. `audit compile` and `ready` apply both.
- You never edit `findings.json`, a capture, a render or an auditor's report. You never tell an
  auditor what a difference is worth, and never dispatch one to get a different answer.
- A severity changes only through a full re-audit: the same group, brief and prompt, so the
  auditor writes `<group>.json` again. `audit compile` journals it and the report counts it.
- **P1**: fixed, or its state cut through a Scope line the founder saw. Never accepted. Never
  lowered.
- **P2**: fixed, or accepted with one of four reason classes (`adapt`, `data-not-in-product`,
  `platform-limit`, `shared-component-follow-up`), an issue, and one line for the PR body. At most
  `limits.maxAcceptedP2PerGroup` in a screen group and `limits.maxAcceptedP2` in the run. Over the
  cap, the rest are fixed. The cap is a ceiling, not an allowance.
- **P3**: fixed in the fix wave, or filed in the polish issue.
- Out of fix waves (`limits.maxFixWaves`) with a P1 still open: stop. The founder gets
  `delivery report` as it stands, red.

## Pictures come only from the capture

- **No browser tool, ever**: not you, not an agent you dispatch, not "just to look", not
  read-only. A subagent's browser action asks the founder to approve it, and during a run the hook
  refuses it. A page you looked at has no served SHA, no checked markers and no file anyone can
  read again.
- A `not-reached` state stays not-reached until `delivery capture` reaches it.
- The capture clicks only controls whose effect is `none` or `free`, and only in fixture worlds.
  A `metered` or `dials` action is reached through the plan row's intercept (its one request is
  answered from a fixture built from the real response type and never sent) or through a
  component render test. A `destructive` control is never clicked.
- Never change a control's effect class, delete an intercept, put a `metered`, `dials` or
  `destructive` control into a state's reach steps, or click anything yourself to reach a state. A
  fake number or a spare credit is one safety layer, not a permit.
- The founder's organisation is captured read-only (`--mode real-org`): every non-GET request is
  aborted and only `none` controls are clicked.

## Rationalizations

| Thought | Reality |
|---|---|
| "These are only spacing; call them P3" | The party being gated never sets a severity. Last time most findings were P2 or P3, nothing made anyone fix them, and the founder found them on the preview. |
| "Accept them under `platform-limit`" | A platform limit names something the platform cannot do today. Spacing and font weight are not one. |
| "The cap is a guideline; I'll list the extras in the PR body" | One over the cap keeps `ready` red. Listing a difference does not fix it. |
| "The auditor was harsh; run it again" | Only a full re-audit of the group with the same brief, and the report counts it. Re-running until one is lenient is exactly what the count exposes. |
| "The P1 is a quirk of the fixture data" | Then the refutation pass marks it `explained-by` a plan row. You do not. |
| "A red report looks bad when he wakes" | A red report he can trust is the product. Last time a run reported complete, with green CI, while 93 findings stood. |
| "Just look at it in the browser; it's read-only" | Every subagent browser action is a permission prompt for a sleeping founder; last time that was hundreds of prompts. Only the capture is evidence. |
| "The number is fake, so pressing Call is harmless" | The effect class says `dials`, and fake numbers are one safety layer, not a permit. A refused call shows the refusal, not the designed state; if the designed state appears, something was dialled. Use the intercept or a component test. |
| "One AI credit costs nothing" | `metered` means it spends an allowance. The intercept answers it from a fixture. |
| "A real click tests more than an intercept" | The capture compares a page with its design; routes have their own tests. A dialling click is never the price of a picture. |
| "It can't be reached tonight; make it `unseedable`" | Reach classes belong to the plan, are capped and are listed in the report. A state the capture missed is `not-reached`, and the report says so. |

## Red flags: stop and run `delivery status`

- You are about to edit `findings.json`, a capture file, a render or an auditor's report.
- A dispatch prompt mentions time, the founder, `ready`, a cap, earlier audits or a severity.
- A second auditor for a group that is not a full re-audit, a refutation or a spot check.
- A P2 accepted outside the four reason classes, or one past the cap.
- Any browser tool call, or a prompt that would let an agent make one.
- A control's effect class, an intercept or a reach class changed after a capture failed.
- Anything clicked by hand.

REQUIRED: `superpowers:verification-before-completion` for every claim you make in chat. The
founder's report is `delivery report`, never a summary you type.
