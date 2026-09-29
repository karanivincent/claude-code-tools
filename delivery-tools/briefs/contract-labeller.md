# Contract-labeller brief (delivery-extractor, Role: contract)

`delivery contract` took every text each design state shows from the design render's own DOM and
wrote them to `docs/delivery/<feature>/contract.json`. Some have no label yet (`"label": null`).
You label them, so the seeded worlds can be checked against what the design shows before anything
is built. You never add, remove or reword a text: the texts are the render's, exactly.

## Your prompt

- `Feature`, `Worktree`.
- `Write`: `docs/delivery/<feature>/contract-labels.json`, the one file you create.

## What you read

- `docs/delivery/<feature>/contract.json`: each state's texts. Label only those with `"label": null`.
- `docs/delivery/<feature>/map.json`: each state's world (`reach.world`) and role, and the worlds'
  fixture users.
- `docs/delivery/<feature>/worlds/<world>.json`: the tables and columns each world writes. Use
  those names; never invent a table.
- `.delivery/<feature>/design/<ID>.png`: the design picture, to see where each text sits.

## The labels

| Label | When | Also give |
|---|---|---|
| `fixed` | The page's own words: headings, button and column names, help text, empty-state sentences. The same on every account. | nothing |
| `data` | A value that comes from the account's rows: a name, a title, a number, a status shown as a value, a date. | where it comes from (below) |
| `random` | A value no seed can pin: a generated id, a hash, a random avatar colour. It is masked in the pictures. Use it rarely. | nothing |

A `data` text says where its value comes from, in one of these shapes:

- A row value: `"table"` and `"column"` (a dotted path for a JSON column: `"meta.title"`). When the
  text wraps the value in fixed words ("Called Amina Otieno"), give `"value": "Amina Otieno"`.
- A count: `"kind": "count"`, `"table"`, and `"where"` (`{ "column": value }`, the rows it counts).
  When the number sits in words ("8 calls"), `"value": "8"`.
- A date or a time ("Tue 14 Oct", "2 min ago"): `"kind": "date"` or `"kind": "time"`, `"table"`
  and `"column"`. These are compared by format, never by the day the design happens to show.
- The signed-in person ("Sam Kariuki", "SK", "You"): `"user": "<role>"`, `"field": "name"` or
  `"initials"`. "You" is fixed words.
- `"world": "<id>"` only when the value lives in another world than the state's own.

## Inconsistent designs

When a state's data contradicts itself (a header says 6 and the list shows 8, a "last week" date
after today, totals that don't add up), label its texts as usual and add the state to
`inconsistent` with one sentence. It goes back to Claude Design; seeding skips it.

## What you write

```json
{ "schemaVersion": 1,
  "states": {
    "KC-05": [
      { "text": "Amina Otieno", "label": "data", "table": "contacts", "column": "name" },
      { "text": "8 calls", "label": "data", "kind": "count", "table": "calls", "where": { "status": "done" }, "value": "8" },
      { "text": "To check", "label": "fixed" } ] },
  "inconsistent": { "KC-09": "the header says 6 calls and the list shows 8" } }
```

Each `text` is copied exactly from `contract.json`. A text labelled `fixed` once is fixed in every
state, so you need not repeat "Save" in each. When you cannot tell, choose `data` and name the most
likely table: a wrong source is caught by `seed --check`, a wrong `fixed` is not. Put anything else
worth saying under `"notes"`.
