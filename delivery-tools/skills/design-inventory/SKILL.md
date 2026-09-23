---
name: design-inventory
description: Use when a design must be turned into a complete list of its screens, states, controls and exact words before anything is planned, or when a page that already exists must be listed by everything it does before it is redesigned. Symptoms - a spec that names screens but not their dialogs, menus or empty states; a redesign that quietly drops something the old page did. Triggers - "inventory the design", "list every state", "what does this page do today".
---

# Design inventory

## Overview

Everything the design shows, and everything today's page does, is listed before anything is
planned. The list starts mechanical (every place in the design a state could come from), is judged
second (which of those places are states), and takes its words from the rendered design, never
from its source. A state missing here is planned by nobody, built by nobody and audited by nobody.

**Violating the letter of these rules is violating the spirit of them.**

`delivery <command>` below means `node scripts/delivery.mjs <command>` (the repo's shim), or
`node "${CLAUDE_PLUGIN_ROOT}/bin/delivery.mjs" <command>` in a repo without one. Outside a run, add
`--feature <slug>` to every command. `<plugin>` means this plugin's root: two directories above
this skill's base directory.

## When to use

- Phase 2 of a delivery run, after preflight and before the plan.
- On its own: "what does this design show?" for any design snapshot that `delivery intake` took.
  It writes the same files as in a run.
- Before a redesign: everything today's page does, listed so none of it is lost quietly.
- A new export arrived mid-run (`delivery intake` reports a new archive hash): run steps 1 to 5
  again; the assembler prints the states added, removed and changed.

Not for deciding what to build (`coverage-plan`) or for comparing a build with its design
(`design-audit`).

## Steps

1. **Candidates.** `delivery design candidates` writes `.delivery/<f>/candidates.json`: every set
   target and value, prop key and enum value, dialog, shot, ternary with different visible text
   in its branches, and one `empty` candidate per list or table.
2. **States.** Split the design's screens into groups: one per screen (a large screen by tab),
   plus one for chrome shared by several screens (header, menus, shared dialogs). Dispatch one
   extractor (agent type `delivery-tools:delivery-extractor`) per group, all in one message, in
   the foreground, with the `states` prompt below.
3. **Assemble.** `node "<plugin>/skills/design-inventory/scripts/assemble-inventory.mjs"
   --feature <f>` builds `docs/delivery/<f>/inventory.json` from the group files, and writes
   nothing while a candidate is unclaimed or claimed two ways, a state id repeats, or a target is
   unknown. Send each unclaimed candidate, by id, to the group it belongs to, and run it again.
4. **Render.** `delivery design render`, through the profile's heavy wrapper (it launches a
   browser). It serves the snapshot itself and writes `<ID>.png`, `<ID>.txt` and `<ID>.dom.json`
   under `.delivery/<f>/design/`; a picture-only state gets its picture. When a state fails to
   render, the next step fixes its reach; then run `delivery design render --states <IDs>` again.
5. **Words.** Dispatch the extractors again with the `words` prompt, passing each group the render
   failures. They take every label from the render and correct the reach of each state that did
   not render. Assemble again (step 3), and repeat 4 and 5 for the states in `rerender`.
6. **Today's pages**, only when `intent.redesign` is true: `delivery baseline`, then
   `delivery capture --mode baseline` (see `design-audit` for capture modes).
7. **Gate.** `delivery inventory check`. Inside a run, then `delivery advance plan`.

## Dispatch prompts

Exactly these lines, filled in:

```
Read <plugin>/briefs/extractor-design.md and follow it.
Part: states
Group: <group name>   Prefix: <one to six capitals, unique to this group>
Screens: <the design screens this group covers>
Candidates: <explicit ids, or "those of these screens">
Feature: <slug>
Write: .delivery/<slug>/extract/<group-slug>.json
```

```
Read <plugin>/briefs/extractor-design.md and follow it.
Part: words
Group: <group name>
States: <the group's state ids>
Render failed: <ID (the render's error), ... or none>
Feature: <slug>
Write: .delivery/<slug>/extract/<group-slug>.json
```

The same brief's `intent` part drafts `intent.json` at intake; the umbrella skill dispatches it.

## Rules

1. **Every candidate is mapped or excluded with its own reason.** Mapped means the state that
   shows it. A ternary whose branches show different text is mapped to the state that shows the
   branch its parent state does not, and that state is added if it is missing. An exclusion names
   what the candidate is and why it is not a state. A reason that fits forty candidates fits none
   of them; the assembler prints any reason used five times or more.
2. **Words come from the render, never from source.** No label, heading or sentence is copied
   from the `.dc.html`, not a plain string, not even when a render is missing. A state that did
   not render has no words yet: fix its reach and render it again.
3. **`impossible` means the design does not draw the state at all**: the `unspecified` states,
   with the reason. A render that failed is a reach to fix, never an `impossible`.
4. **Derived files live in `docs/delivery/<f>/` and `.delivery/<f>/`.** The snapshot
   `docs/design/<f>/` is never edited, not even to fix a typo.
5. **No browser tool, for anyone, for any reason.** The design is rendered only by
   `delivery design render`, which serves its own runtime; opening the `.dc.html` from disk shows
   something else anyway.

Adapter details (Claude Design exports and image folders): `references/adapters.md`.

## Rationalizations

| Thought | Reality |
|---|---|
| "These ternaries are just copy variants inside one state" | A branch that shows different text is a state the plan must build and the audit must check. Last time a spec that transcribed the ternaries instead of rendering them got exactly those lines wrong. |
| "Exclude the rest as cosmetic; the check will go green" | The check proves every candidate was looked at, not that the reason is true. Every exclusion is listed on the Scope sheet, and a state missing here is missing from the build. |
| "Map them all to the dialog's main state" | A candidate maps to the state that shows its branch. Mapping forty branches to one state hides thirty-nine of them. |
| "The founder wants the Scope issue before he wakes" | A late Scope issue is visible and costs nothing; a state nobody planned surfaces on the preview after the build. |
| "The words are right there in the source" | The source is what the prototype might show. Only the render shows what it does show. |
| "The render failed, so the state is impossible" | Impossible is for states the design cannot draw. A failed render usually lacks one more prop; fix the reach. |
| "Open the design file in the browser; it's local and read-only" | Every browser action by an agent asks the founder for approval, and the file needs the served runtime to render at all. `delivery design render` is the only viewer. |
| "I'll fix the typo in the snapshot" | The snapshot is the evidence of what was designed. A wrong design becomes an `adapt` row in the plan. |

## Red flags: stop and run `delivery status`

- One exclusion reason on many candidates, or many candidates mapped to one state.
- `inventory check` about to be run because a file was edited, not because the extractors finished.
- A label, heading or sentence typed from the `.dc.html` source.
- A state marked `impossible` after its render failed.
- Any edit under `docs/design/`.
- Any browser tool call, or a prompt that would let an agent make one.

REQUIRED: `superpowers:verification-before-completion` for every claim you make in chat.
