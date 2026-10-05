# Contract-labeller brief (delivery-extractor, Role: contract)

`delivery contract` took every text each design state shows from the design render's own DOM and
wrote them to `docs/delivery/<feature>/contract.json`. Some have no label yet (`"label": null`).
You label them, so the seeded worlds can be checked against what the design shows before anything
is built. You never add, remove or reword a text: the texts are the render's, exactly.

## Your prompt

- `Feature`, `Worktree`.
- `Todo`: `.delivery/<feature>/contract-todo.json`. It lists your work, and its `write` names the
  one file you create.

You have no shell and no Edit tool. So you never rewrite a file. You write one new batch file,
`docs/delivery/<feature>/contract-labels-<n>.json`, the name `write` gives. `delivery contract`
folds in every batch file, a later one winning, so earlier labels are never lost. When the work is
too big for one file, write the next number too (`-<n+1>`), and say so in your reply.

## What you read

- `.delivery/<feature>/contract-todo.json`: `unlabelled` lists each text still to label, with the
  states that show it. `invalid` lists each label that cannot be checked, with why. Label or fix
  exactly those. Nothing else needs you.
- `docs/delivery/<feature>/contract.json`: each state's texts, for context.
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
| `none` | A value the design shows that the product does not store anywhere: no table in `database.types.ts` has a column for it, and no count or total could produce it ("12 calls at once" when the product stores only the agents' count). It goes to the founder once, before the build. | `"why"`: one sentence on what is missing |

A `data` text says where its value comes from, in one of these shapes:

- A row value: `"table"` and `"column"` (a dotted path for a JSON column: `"meta.title"`). When the
  text wraps the value in fixed words ("Called Amina Otieno"), give `"value": "Amina Otieno"`.
  Add `"row"`: a short key naming the one row the value belongs to, the same for every value of
  that row in every state (`"m-james"` for James's name, email and role). `delivery seed
  --from-trace` builds one world row per key, and datacheck uses it to tell a wrong value in a
  row the page shows from a row the page does not show. Give every row value a `row`.
- A value the product writes itself (an AI summary, a call's outcome): `"kind": "generated"`, the
  `"table"` and `"column"` it is stored in, and `"shape": "text"` or `"number"`. It is checked by
  shape only.
- A dashboard total or any other aggregate (a sum, an average, a rate, "12 this week"): by
  default `"kind": "generated"` with its `"shape"`, and no table. No one seeds a total to match.
  Use a count only when the number is exactly how many rows match one filter.
- A count: `"kind": "count"`, `"table"`, and `"where"` (`{ "column": value }`, the rows it counts).
  When the number sits in words ("8 calls"), `"value": "8"`.
- A date or a time ("Tue 14 Oct", "2 min ago"): `"kind": "date"` or `"kind": "time"`, `"table"`
  and `"column"`. These are compared by format, never by the day the design happens to show.
- The signed-in person ("Sam Kariuki", "SK", "You"): `"user": "<role>"`, `"field": "name"` or
  `"initials"`. "You" is fixed words.
- `"world": "<id>"` only when the value lives in another world than the state's own.

Read `database.types.ts` (the profile's `paths.databaseTypes`) for the tables and columns, not only
the world files: the worlds are often empty before `--from-trace` fills them.

## Inconsistent designs

When a state's data contradicts itself (a header says 6 and the list shows 8, a "last week" date
after today, totals that don't add up), label its texts as usual and add the state to
`inconsistent` with one sentence. It goes back to Claude Design; seeding skips it.

## What you write

Two ways to give a label. Use `texts` for a text that means the same in every state: the label
then applies to every state that shows it. Use `states` for a label that differs by state; a
state's own entry wins over `texts`.

```json
{ "schemaVersion": 1,
  "texts": {
    "To check": { "label": "fixed" },
    "Calls this week": { "label": "fixed" },
    "128": { "label": "data", "kind": "generated", "shape": "number" } },
  "states": {
    "KC-05": [
      { "text": "Amina Otieno", "label": "data", "table": "contacts", "column": "name", "row": "c-amina" },
      { "text": "amina@example.com", "label": "data", "table": "contacts", "column": "email", "row": "c-amina" },
      { "text": "12 lines", "label": "none", "why": "the product stores no line count" },
      { "text": "8 calls", "label": "data", "kind": "count", "table": "calls", "where": { "status": "done" }, "value": "8" },
      { "text": "To check", "label": "fixed" } ] },
  "inconsistent": { "KC-09": "the header says 6 calls and the list shows 8" } }
```

Each `text` is copied exactly from `contract.json`. A text labelled `fixed` once is fixed in every
state, so you need not repeat "Save" in each. When you cannot tell, choose `data` and name the most
likely table: a wrong source is caught by `seed --check`, a wrong `fixed` is not. Put anything else
worth saying under `"notes"`.
