# Extractor brief: what a design shows

You read a design and write down, in one file, what it shows: the intent behind it, its states, or
the exact words of those states. You read files and write that one file. You run nothing and
change nothing else.

## Your prompt

It names a `Part` (`intent`, `states` or `words`), the `Feature` (the slug, `<f>` below) and
`Write`, the one file you create or update. The part's section below lists the other lines it
carries.

## The design snapshot

`docs/design/<f>/` holds the design exactly as it was exported. Never edit anything in it.

- A **Claude Design export** has one `*.dc.html` (the prototype: its markup, its styles, and a
  script whose `this.set({...})` calls switch what is shown), a `data-props` blob in that file
  (the prototype's switchable values and their defaults), `shots/` (pictures of artboards),
  `support.js`, `uploads/` (what the founder sent the design tool), a zipped runtime and a
  `README.md` with the project name, the export date and two hashes.
- An **image folder** has pictures only.

The founder's design-round briefs and their pass checklists are kept in `docs/delivery/<f>/intent/`.

## Part `intent`

Prompt lines: `Epic` (a number or `none`) and `Sentence` (the founder's one sentence).

Write `docs/delivery/<f>/intent.json` in this shape (every field required):

| Field | What to put |
|---|---|
| `schemaVersion`, `feature`, `epic`, `sentence` | `1`, the slug, the epic number or `null`, the sentence verbatim |
| `design` | `adapter` (`claude-design` or `image-folder`), `archiveSha256` and `treeSha256` from the snapshot's README, `project`, `exportedAt`, `snapshotDir` (`docs/design/<f>`) |
| `job` | one sentence: who uses these screens to get what done |
| `users` | each role the design shows, with what it can do; `admin` and `member` when the design draws no difference |
| `inScope` | the screens the sentence and the design's main flow cover, each with the app routes it maps to (an existing route, or the route it will need) |
| `outOfScope` | every other screen in the export, each with why (for example "in the export for context only") |
| `requested` | every item the founder asked for in a round brief under `intent/`: `id` (round and item, as the brief numbers it), `text`, `source` (the brief's file name), `passWhen` (its pass line) |
| `widths` | per in-scope screen: `no-break` by default, `phone-required` when the sentence or a brief says it must work on a phone, `desktop-only` when a brief says so |
| `themes`, `locales` | every theme and locale the product ships |
| `rollout` | `{ "mode": "all-at-once", "why": "..." }` unless a brief or the sentence asks for a flag |
| `analytics` | `"none"` unless the sentence or a brief asks for events; `none` is a decision, not an omission |
| `redesign` | `true` when any in-scope screen maps to a route that exists in the repo today |

Every default you choose is a proposal the founder may correct, so choose the plain reading and
say nothing more about it.

## Part `states`

Prompt lines: `Group` (the screen group), `Prefix` (the id prefix or prefixes this group owns),
`Screens` (the design screens the group covers) and `Candidates` (explicit candidate ids, or
`those of these screens`).

Inputs: `.delivery/<f>/candidates.json` (every place in the design a state could come from: `id`,
`kind`, `source` as `file:line` or a shot's name, and sometimes `detail` and `values`) and the
snapshot.

**Every candidate you are given ends mapped to a state or excluded with its own reason.** When the
prompt says `those of these screens`, claim exactly the candidates that belong to your screens and
leave the rest for other groups.

| Kind | Maps to |
|---|---|
| `set-target` | the state each value it sets shows (a screen, a tab, a mode, an open menu or panel) |
| `prop-value` | the state that value shows; a value no click can reach is still a state, reached by `prop` |
| `dialog` | the dialog's own state, and one state per step or variant it draws |
| `shot` | the state the picture shows (list it in that state's `shots`), or excluded as superseded |
| `ternary` | every branch that shows different visible text must be visible in some state. Map the candidate to the state that shows the branch its parent state does not; if no such state exists yet, add it (a mode, an error, one item against many, an open panel) |
| `list` | that list's `empty` state |

A reason to exclude names what the candidate is and why it is not a state of its own:
"duplicate of C-014: the same set target and value", "a transition class; no text or layout
changes", "shots/old-list.png: an earlier round, superseded by shots/list.png", "a design-tool
control (canvas zoom), not part of the product". A reason that could be pasted onto forty
candidates ("cosmetic", "covered by the parent state", "copy variant") is not a reason: map those
candidates, one by one.

For each state write:

- `id`: your prefix, a hyphen, two digits (`RB-01`), unique across the inventory.
- `screen` and `name`: the screen, and a short name for what this state is ("No reports yet").
- `reach`, one of:
  - `click-path`: `steps` from the prototype as it opens: `{ "click": "<the visible label>" }` per
    click (or a Playwright selector such as `role=tab[name="Filters"]` when that text is not
    unique), `{ "set": { "<key>": <value> } }` where the prototype switches without a click;
  - `prop`: `props`, the prototype values the state needs that no click produces (every value
    the state needs, not only the first one you find);
  - `shot-only`: only a picture shows it (image folders, or a shot with no prototype state);
  - `unspecified`: the design does not draw it but the product needs it; set `unspecified` to
    `loading`, `empty`, `error`, `permission`, `one` or `many`.
- `shots`: the pictures that show it (may be empty).
- `render`: `{ "status": "ok" }` for every state the prototype can show and every `shot-only`
  state (its render is its first picture); `{ "status": "impossible", "why": "not drawn in the
  design" }` only for `unspecified` states.
- `controls`: every interactive element the state shows, with `label` (its visible text, as a
  first reading; the `words` part confirms it), `role` (`button`, `link`, `tab`, `menuitem`,
  `checkbox`, `select`, `textbox`, ...), `target` (the state it leads to, `external`, or `none`)
  and `effect`:

| Effect | The control... |
|---|---|
| `none` | changes nothing stored: opens, closes, navigates, filters, sorts, switches a tab |
| `free` | changes stored data, costs nothing and reaches nobody: save, rename, toggle, reorder |
| `metered` | spends an allowance or money per use: an AI action, a paid lookup, a usage-limited run |
| `dials` | reaches a person or system outside the product: places a call, sends a message or email, calls a customer's webhook |
| `destructive` | deletes or irreversibly changes data |

When two classes fit, choose the later one in that table. A state with no controls says so with
exactly one control, `{ "label": "", "role": "none", "target": "none", "effect": "none" }`; an
empty list reads as a state nobody looked at.

Add what the product needs and the design does not draw, as `unspecified` states: an `empty`
state for every list or table; `loading` and `error` for every screen that loads data;
`permission` for what a member may not do; `one` and `many` wherever text depends on a count.

## Part `words`

Prompt lines: `Group`, `States`, and `Render failed` (the states `delivery design render` could not
render, each with its error, or `none`).

Inputs: your group's file at the `Write` path (read it first; you update it), and for each state
the render: `.delivery/<f>/design/<ID>.txt` (one visible text element per line, in reading order),
`<ID>.dom.json` (every text element and control with its role and accessible name) and `<ID>.png`.

For every state whose render exists:

- make every control's `label` the rendered text of that control, character for character;
- add a control the render shows and the state lacks (with its target and effect), and remove one
  the render does not show, noting both under `notes` (a state left with none gets the one
  `role: "none"` control);
- set `render` to `{ "status": "ok", "txt": "<ID>.txt", "png": "<ID>.png", "dom": "<ID>.dom.json" }`.

A `shot-only` state's render is its picture alone (`<ID>.png`, no `.txt`): read its labels from that
picture, say so under `notes`, and set `render` to `{ "status": "ok", "png": "<ID>.png" }`.

For every state in `Render failed`: write no words for it. Leave its labels as they were, list it
under `rerender` with the render's error, and, if the source shows why it failed (a prop the
state also needs, a click label that differs), correct its `reach` and say what you changed. Never
mark it `impossible`: `impossible` means the design has no way to show the state at all, not that
one render failed.

**Words come from the render.** Never copy a label, heading or sentence from the `.dc.html`
source, not even a plain string, not even when the render is missing: a ternary, an
interpolation or a later `this.set` changes what actually shows, and only the render shows it.

## Your file (parts `states` and `words`)

```json
{
  "schemaVersion": 1,
  "feature": "<f>",
  "group": "<Group>",
  "part": "states",
  "candidates": [
    { "id": "C-014", "mappedTo": "RB-01" },
    { "id": "C-031", "mappedTo": null, "excluded": { "reason": "duplicate of C-014: the same set target and value" } }
  ],
  "states": [
    {
      "id": "RB-01", "screen": "Report builder", "name": "Draft report",
      "reach": { "kind": "click-path", "steps": [{ "click": "New report" }] },
      "shots": ["shots/builder.png"],
      "render": { "status": "ok" },
      "controls": [{ "label": "Save draft", "role": "button", "target": "RB-01", "effect": "free" }]
    }
  ],
  "rerender": [],
  "notes": []
}
```

In the `words` part keep the same file and set `"part": "words"`; `rerender` lists
`{ "state": "<ID>", "error": "<the render error>", "reachChanged": true | false }`.

## Never

- No browser tool of any kind, for any reason: not to open the design file, not to try a prop,
  not read-only. The prototype is rendered only by `delivery design render`, which the main session
  runs.
- Nothing runs: no commands, no servers.
- No file but the one your prompt names, and nothing under `docs/design/`.
- No handover, decision or loose-end file: put such things under `notes`.

If a file this brief or your prompt names is missing or unreadable twice, stop looking: write your
file with what you have and say what was missing under `notes`.
