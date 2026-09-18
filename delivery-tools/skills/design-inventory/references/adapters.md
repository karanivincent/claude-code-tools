# Design adapters

`delivery intake` picks the adapter (`claude-design` by default, `--adapter image-folder` for a
folder of pictures) and records it in `intent.json`. `delivery design candidates` and
`delivery design render` use the same adapter.

## Claude Design exports

What the snapshot holds: one `*.dc.html` (the prototype), `shots/`, `support.js`, usually
`uploads/`, a design-system folder, and the runtime scripts zipped into `runtime.zip` (a
committed `.js` that calls `eval` would trip most repos' security gates, so intake zips it).

Where candidates come from:

| Candidate | In the prototype |
|---|---|
| `set-target` | every `this.set({...})` call: each key it sets (`screen`, `tab`, `mode`, `dlg`, `menuOpen`, ...) and each value |
| `prop-value` | every key and enum value in the `data-props` blob, the prototype's switchable defaults |
| `dialog` | every dialog key the markup opens |
| `shot` | every picture in `shots/` |
| `ternary` | every conditional expression whose branches produce different visible text |
| `list` | every list or table, as its `empty` candidate |

**Prop-only states.** Some states have no click path: the prototype shows them only when a prop
has a certain value (a transient mode, a variant the designer switched on while drawing). They are
still states. The extractor writes them as `reach.kind: "prop"` with every value they need in
`props`; `delivery design render` loads a temporary copy of the prototype with those defaults
changed.

**The served runtime.** The prototype renders only with its runtime scripts beside it.
`delivery design render` unzips them into `.delivery/<f>/design-serve/` (never committed), serves
the directory on a local port and drives it with the target repo's Playwright. Opening the
`.dc.html` from disk, or in any browser tool, shows something else and asks the founder to approve
every action; neither is ever needed.

**When a render fails**, the cause is almost always in the reach:

| Render error | Usual cause | Fix in the group file |
|---|---|---|
| a prop produced no visible change | the state needs a second value (the dialog opens only when a list is non-empty, a panel only in a mode) | add the missing values to `props` |
| a click found no element | the step's label is not the rendered label, or an earlier step is missing | take the label from the parent state's `.txt`; add the missing step |
| a timeout | an asset or font the runtime could not load, or a step that waits for something the prototype never shows | say so under `notes`; the main session looks at the served directory |

A state the prototype cannot show but a picture in `shots/` does is `shot-only`: its render is
that picture, and its words are read from it. Only a state the design never drew at all is
`impossible`, with that reason.

## Image folders

Every picture is one candidate (`shot`) and one state with `reach.kind: "shot-only"`: a picture
has no click path and no props. `delivery design render` copies the picture as the state's render
(`<ID>.png`, with no `.txt` and no `.dom.json`). The words part reads each label from the picture
itself, the only render there is, and says so in `notes`. Everything else is the same: every
picture mapped or excluded with its own reason, the same effect classes, the same `unspecified`
states for what the pictures do not draw.

## Today's pages, before a redesign

When `intent.redesign` is true, the inventory also covers what the existing pages do:

1. `delivery baseline` reads the base branch at the run's start and writes
   `docs/delivery/<f>/baseline.json`: every route and tab, control, API call with its
   discriminating fields, e2e assertion, message key, displayed data field and open issue of the
   in-scope routes, each with a signature and `file:line` evidence.
2. `delivery capture --mode baseline` captures those pages in the fixture worlds, and read-only in
   the founder's organisation. The captures add the controls each reachable state really shows,
   and they are the "before" pictures in the pull request.

Nothing in the baseline is typed by hand. A capability the design leaves out is not dropped here;
the plan decides it later, and its default there is to keep it.
