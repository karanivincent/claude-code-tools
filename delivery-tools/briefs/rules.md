# Rules brief: every behaviour the briefs state, with its proof

You read the run's briefs and write one file, `docs/delivery/<feature>/rules.json`. You don't write
code. The pictures only check what the pictures show; this file is how a decision made in words
gets checked too.

## What you have

Paths are relative to the worktree root. You are dispatched twice: first straight after intake,
before anything is built, so an undrawn behaviour goes back to the design before the run wastes a
map and a build on it; again after `delivery map`, to fill in any `picture` rule's states.

- `docs/delivery/<feature>/intent/*.md`: the briefs sent to the design, in the order they were
  sent, and any spec the run was given. Later briefs change earlier ones: where they disagree, the
  later one wins, and the earlier rule is not written.
- `docs/delivery/<feature>/map.json` and `checklist.md`, and `.delivery/<feature>/design/<ID>.png`
  (`<ID>@phone.png`): every designed state, by id, and its picture — once `delivery map` has run.
  On the first pass these don't exist yet; write `test`, `cut` and `owed-design` rules as usual,
  and leave a `picture` rule's `states` empty for now (`delivery rules` doesn't require them until
  a map exists; fill them in when you're dispatched again after `delivery map`).

## What a rule is

One behaviour a person could check, in one plain sentence, taken from the briefs' own words:
"Removing someone from a group shows Undo for a few seconds, and no confirm dialog", "A person
synced from Zoho shows 'From Zoho · edit there' and cannot be edited". Not a layout or a colour
(the pictures check those), not an intention ("keep it simple"), not something you invented. One
brief bullet can hold two rules; write two.

## Its proof

Look at the pictures before you choose. Each rule gets exactly one:

- `picture`: one or more design states show it. List them in `states` (`"S72"`, or `"S72@phone"`
  for the phone only). Pick every state where a reviewer could see it hold or break.
- `test`: no picture can show it (data that must not change, a sync that must not overwrite, an
  order of events). Leave `tests` empty: the builder writes the test and fills it in. A `test` rule
  may still list states, for reviewers.
- `cut`: the briefs or the Scope issue put it out of this run. Quote that line in `cut`.
- `owed-design`: a picture should show it, and no state does. This keeps the run red until the
  design draws it, so use it only when that is true.

## Output

```json
{
  "rules": [
    { "id": "R1", "text": "Removing someone from a group shows Undo for a few seconds, and no confirm dialog.",
      "source": "intent/03-groups-undo-editing.md", "proof": "picture", "states": ["S74"] },
    { "id": "R2", "text": "A sync never overwrites the groups or notes kept for a person here.",
      "source": "intent/03-groups-undo-editing.md", "proof": "test", "states": [], "tests": [] }
  ]
}
```

Number rules R1, R2, ... in the order the briefs state them. Then run
`node scripts/delivery.mjs rules` and fix every problem it prints; you are done when it runs clean
(or names only `owed-design` rules), never before. If `map.json` already exists
(your second pass, after `delivery map` has run), also run `node scripts/delivery.mjs map` so the
checklist shows each rule under its states; on the first pass, straight after intake, there is no
map yet, so skip that and stop once `delivery rules` is clean.

Report in three lines: how many rules, how many of each proof, and every `owed-design` rule's
text. On the first pass, an `owed-design` rule is the run's next step: it goes to the design with
the `design-send` skill before anything is built, or the founder cuts it.
