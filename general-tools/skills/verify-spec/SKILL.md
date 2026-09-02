---
name: verify-spec
description: Check a design spec's factual claims against the codebase before anyone implements it. Extracts every assertion the spec makes about what exists, what a file does, what a command produces and what the numbers are, then verifies each one and reports verified / refuted / unverifiable. Use after writing a spec and before writing an implementation plan, and again whenever a spec is picked up days later. Triggers - "verify the spec", "check this spec", "is this design still true", "before we implement", "the plan assumes", "/verify-spec".
---

# Verify a spec before anyone builds from it

A spec is a set of factual claims about a codebase plus a set of intentions. The
intentions cannot be wrong yet. The claims can, and a plan built on a false claim
wastes the whole implementation.

## The failure this exists to catch

Real, 2026-09-02. A spec said an operator skill would open by reading a script's last
rehearsal result from `test_call_runs`. The author had checked that table carefully:
right columns, right verdict values, a `no_verdict` case that matched the bug in hand.
Every column claim was true.

Nothing wrote to it from the path in question. `loopback.ts` contained no database
write at all, so every rehearsal run through the CLI left no row. The spec's opening
move was impossible, and the section arguing for it cited numbers from two rows an
unrelated e2e test had written.

The author verified the noun and never verified the verb.

**A claim that X reads or writes Y is only verified by finding the read or the write.**
Confirming that Y exists, that Y has the right shape, or that some other caller touches
Y proves nothing about X. This is the single highest-yield check in this skill.

## Process

1. Read the spec in full.
2. Extract every claim into a list. Do not summarise — one row per checkable assertion.
3. Verify each one with a command. Not from memory, not from the spec's own prose.
4. Report. Refuted claims block the implementation plan.

## What counts as a claim

Anything a reader would act on that could be false:

- a file, function, table, column, route or command exists
- a file does something, or does not
- data flows from one place to another
- a number, count, rate or measurement
- a named issue, PR or decision exists and says what is claimed
- a constraint holds, or a rule is enforced somewhere
- something is already handled, so the spec need not handle it

Not claims: what the spec intends to build, opinions about design, and anything
explicitly marked as a decision or an open question.

## How to check each kind

| Claim | Check | Passes only if |
| --- | --- | --- |
| Path exists | `ls <path>` | The path resolves |
| Symbol exists there | `grep -n "<symbol>" <path>` | Found in that file, not merely in the repo |
| X writes to Y | `grep -rn "Y" <X's file and its imports>` | A write is found in X's own call path |
| X reads Y | Same, for the read | Same |
| Command exists | `grep -n '"<name>"' package.json` | The script is defined and its entry point resolves |
| Column or table exists | Read the migration, or query | The migration is in the repo, not only in a live database |
| A count or rate | Re-run the query or command | The number comes out again |
| Issue says X | `gh issue view <n>` | The issue is open and says it |
| A rule is enforced | Find the test or the CI job | Something fails when the rule is broken |
| Already handled | Find the handling code | It handles the specific case the spec names |

Two traps worth naming, both of which produce a confident wrong answer:

- **Checking the destination instead of the source.** The table exists, so the write
  must too. It does not follow.
- **Grepping the whole repo instead of the path in question.** A hit in `test-runs.ts`
  is not evidence about `loopback.ts`. Scope the grep to the file the claim names and
  the modules it imports.

## Verdicts

| Verdict | Meaning | Effect |
| --- | --- | --- |
| verified | A command confirmed it | None |
| refuted | A command contradicted it | Blocks. Fix the spec before planning |
| unverifiable | No command settles it here — needs a live environment, a person, or a vendor console | Record it in the spec as an assumption, by name |

Never report a claim as verified because it is probably true, because the spec sounds
confident, or because it was true in a sibling repo. Unverifiable is an honest answer;
assumed-true is not.

## Fixing what you refute

A refuted claim usually means one of three things, and they need different fixes:

- **The fact is wrong** — correct the spec, and check whether the argument that quoted
  it still stands. Wrong numbers often propagate into the motivation section.
- **The capability is missing** — the spec assumed something the codebase does not do.
  Add it to the spec as a prerequisite, ahead of the work that depends on it, and say
  it was missed on the first pass so the next reader knows the ordering matters.
- **The design depended on it** — the approach itself needs revisiting. Say so and stop;
  do not patch around it inside the plan.

Commit the corrections with a message naming what was wrong, not "update spec". The
correction is the useful history.

## Report

Lead with the count, then only the claims that are not verified:

```
14 claims — 11 verified, 1 refuted, 2 unverifiable.

REFUTED
  "The skill reads the last result from test_call_runs"
  loopback.ts contains no database write. CLI runs persist nothing.
  → the spec's opening move is impossible as written

UNVERIFIABLE
  "Production has no org_telephony row" — needs the production project
  "The carrier bills 1 KSh/minute on-net" — vendor invoice, not in the repo
```

Verified claims need no listing. The count is enough.

If nothing is refuted, say so in one line and hand straight over to planning.
