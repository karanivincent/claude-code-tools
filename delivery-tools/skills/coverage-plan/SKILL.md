---
name: coverage-plan
description: Full mode only (the founder asked for full mode by name; picture mode uses picture-build). Use when a design inventory exists and every designed state and every existing capability needs a class, an owning issue, test data and a backend before a build starts, or when deciding what to cut, adapt or remove. Symptoms - designed controls with no route behind them, states no issue owns, cuts written as a line in a PR instead of an issue, a removal nobody decided. Triggers - "plan the coverage", "what does the design need that we do not have".
---

# Coverage plan

## Overview

`docs/delivery/<feature>/plan.json` **is** the spec: one row for every state in the inventory
and every capability in the baseline. `spec.md`, the issues and the Scope issue are generated
from it. This skill decides what goes in the plan; the CLI decides whether the plan is complete.

**Core principle: a red gate is fixed by building, never by relabelling.** A row's class and its
reach say what is true about the product. Changing them because a gate is red, a cap is close or
the founder wakes soon is the failure this plan exists to prevent. Violating the letter of these
rules is violating their spirit.

`delivery <command>` below means `node scripts/delivery.mjs <command>` (the repo's shim) or
`node "${CLAUDE_PLUGIN_ROOT}/bin/delivery.mjs" <command>`. Use the commands exactly as written
here or as their `--help` prints them; never add arguments they do not list.

## When to use

- Phase 3 of a delivery run: `delivery inventory check` is green and the run is in `plan`.
- Any later moment a row's class, owner or reach is in question: a builder reports a state not
  done, `delivery baseline --refresh` finds a new capability, a gate or a deadline tempts a cut.
- Not for work with no design inventory: that is `/ship`, not this suite.

## Phase 3, in order

1. Read `intent.json`, `inventory.json`, `baseline.json` (for a redesign) and the design's own
   words in `.delivery/<feature>/design/<ID>.txt`. Copy comes from those renders, never from source.
2. **Rows.** One per inventory state and per baseline capability, every field of the plan schema
   (`references/rows.md`). Classes, reach, cuts and adapts follow `references/decisions.md`.
3. **Worlds.** `design`, `day-one`, `messy`, `empty`, `limits`: each its own organisation with an
   admin and a member user. The limits world spends allowances by seeding the meter's own rows.
4. **Units and contracts.** Wave 0 is always the contract unit. One unit per 60 to 120
   builder-minutes; no two units in a wave share a file; only the words unit edits message files;
   every `missing` backend piece is a backend unit in wave 1.
5. `delivery plan verify`, then `general-tools:verify-spec` on each claim it lists as left.
6. `delivery plan check`. Fix every line it prints **by adding** (a world, an intercept, a unit,
   a row, a Scope line), never by relabelling (see the rule below). The one line allowed to stay
   red here is a cut row with no issue yet: the next step files it.
7. `delivery issues sync`: it files the children and the cut follow-ups, writes their numbers
   into `plan.json`, and posts the spec on the epic. Then `delivery plan check` again (green),
   `delivery plan render`, and `delivery scope post` (it takes the Scope snapshot).
8. `delivery advance wave0`.

Use `superpowers:brainstorming` only to think through an `adapt` or a split; then decide by the
repo's tier test. Never stop for its approval step, and never write a second prose plan.

## Deciding classes and reach (summary; the tables are in `references/decisions.md`)

| Question | Default |
|---|---|
| A designed state | `new` or `change`: build it |
| An old capability the design leaves out | `migrate`, with `migrateTo` naming the new file and control |
| A shipped capability nobody wants | `remove` only with a reason, a decision file and a Scope line |
| The design breaks a product rule | `adapt`, naming the rule and the product text |
| A designed state not built now | `cut` only with one of five reason codes, an issue and budget |
| A shared part (`screen: "Shared"`) the design changes | `change`: build it. It shows on every page, and the report lists it; no Scope line |
| A screen `intent.json` leaves out | no rows at all: the inventory holds none of its states, and it is not a `cut` |
| How the capture reaches a state | `seeded`, unless no world, intercept or guard can produce it |

Before any state is `prop` or `unseedable`, try in order: a world that seeds it (counters and
allowances are rows: seed them), an intercept that answers its one request, a founder-approved
guard. Only then the class, with its reason code and a component test.

## The rule: never relabel to turn a gate green

When `plan check`, a unit gate or `ready` is red, the only moves are:

- **Build it.** A missing route is a backend unit; a state not reached is a fix unit, a seed row
  or an intercept; a dead control is a fix.
- **Add a Scope line** for the three kinds the founder decides: cutting something he requested,
  removing something shipped, an `adapt` that changes behaviour a customer sees. Its default
  applies at the wave it names.
- **Leave it red.** `ready` stays red and the generated report says so, first. That is the product
  working, not failing.

After `delivery scope post`, the plan's classes are frozen. Any class change is a **late change**:
it gets a Scope line at once and leads the report and the PR body. A row carrying `requested`
never changes class late without the founder's reply: its line's default is **build**, and the
state stays red until it is built or he answers.

Never, whatever the clock says:

- change a row's `class` to `cut`, `remove` or `adapt`, or its `reach.class` to `prop` or
  `unseedable`, in the same breath as a gate going red;
- pick a reason code because it fits the change rather than because it is the reason;
- count what a relabel does to the cut budget or the 20% cap (a relabel that only fits the cap
  because of a cut is two relabels);
- cut a `requested` row, or remove a shipped capability, without a Scope line and his reply;
- ask the founder in chat. After preflight a question is a Scope line (three kinds only) or a
  Tier 1 decision file; nothing else.

| Thought | Reality |
|---|---|
| "There's no route, so leave it out" | A missing route is a backend unit in wave 1. Cutting needs one of five reason codes. |
| "The design is just older, drop it" | An old capability the design omits defaults to `migrate`. |
| "Nobody uses that" | Removing a shipped capability needs a Scope line. |
| "I'll decide the empty state while building" | Every list has an `empty` state with markers in the plan, or the builder invents it at 3 a.m. |
| "This state can't be seeded" | Check the worlds, the guard list and intercepts first; `unseedable` is capped and listed. |
| "It only fills up over time, so `needs-time`" | A counter is rows. Seed them in the limits world. `needs-time` is for what only the clock produces. |
| "The reason is true, so the cut is fine" | A true reason makes a cut legal only before the Scope snapshot, and never for a requested row without his reply. |
| "It fits the budget and the cap" | They are ceilings, not allowances. Each cut and each non-seeded state needs its own reason. |
| "I'll note it in the PR body and file a follow-up" | Last run a spec cut eight designed features that way, and none came back as work. A cut is a row, a reason code, an issue and, when requested, a Scope line. |
| "He wakes in an hour; a green PR beats a red one" | Last run a PR was reported complete with 93 findings open. A red report that says what is left is the honest result. |

## Red flags: stop and re-read this section

- Editing `class` or `reach.class` minutes after a gate printed FAIL.
- Doing arithmetic on the cap or the cut budget to see whether a change "fits".
- A reason code chosen to fit ("over-size" for a backend that exists, "needs-time" for a count).
- "Follow-up issue" as the justification for a cut.
- A cut or removal of a `requested` or shipped row with no Scope line and no reply.
- A question to the founder anywhere but the Scope issue.

## Common mistakes

| Mistake | Instead |
|---|---|
| Inventing plan fields (`title`, `unit`, `note`) or row ids | The plan schema's fields only (`references/rows.md`); capability ids come from `delivery baseline`. |
| Inventing CLI arguments | Run `delivery <command> --help`; use only what it lists. |
| A Scope line with options and a recommendation | One line: what, the reason, the default, the wave it applies at, the reply that flips it. |
| Writing the report, the PR body or a status comment by hand | `delivery report`, `delivery pr-body`, `delivery handover` generate them. |
| Planning a state with no markers or no world | Every `build` row has an owner, a reach and markers, or `plan check` is red. |
