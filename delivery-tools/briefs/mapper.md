# Mapper brief: write the button map

You write one file, `docs/delivery/<feature>/map.json`. It is the whole plan for a picture-mode
run: the builder builds from it, the capture walks it, and the reviewers check against it. You
don't write code.

## What you have

- `.delivery/<feature>/design/<ID>.png`, `<ID>.txt` and `<ID>.dom.json`: every design state the
  design render could draw, as a picture, its visible text and its elements.
- `.delivery/<feature>/extract/*.json`, when present: each state's screen, name and controls.
- `docs/delivery/<feature>/intent.json`: the sentence, and which screens are in scope.
- For a redesign, the page being replaced: its route under the app, and its components. Read them
  to list the features it has today.
- `docs/delivery/<feature>/worlds/*.json`, when present: test worlds already written.

## What map.json holds

```json
{
  "schemaVersion": 1,
  "feature": "<slug>",
  "title": "<Page name>",
  "kind": "redesign",
  "route": "/dashboard/<page>",
  "pageArea": { "left": 240, "designLeft": 240 },
  "worlds": [
    { "id": "design", "kind": "design", "orgName": "Acme Store",
      "users": [ { "role": "admin", "email": "delivery+<feature>-design-admin@example.invalid", "name": "Sam" } ],
      "notes": "The design's own data" }
  ],
  "states": [
    { "id": "KC-05", "screen": "To check", "name": "Questions, found facts and a mismatch",
      "reach": { "world": "design", "role": "admin",
                 "steps": [ { "goto": "/dashboard/<page>?view=check" } ] },
      "buttons": [
        { "label": "Add knowledge", "testid": "kb-add-knowledge", "opens": "KC-04", "effect": "free", "member": "hidden" },
        { "label": "See the call", "testid": "kb-asked-see-call", "opens": "KC-12", "effect": "none" }
      ] },
    { "id": "KC-01", "screen": "To check", "name": "Loading",
      "reach": { "test": "apps/dashboard/src/.../frame.state.test.tsx :: KC-01 loading" } }
  ],
  "keep": [ { "what": "Export as CSV", "where": "old-page.tsx", "how": "moves to the Sources menu" } ]
}
```

- One state per design picture. Every `<ID>.png` must have an entry. A state the design never drew
  needs `"design": false`.
- `pageArea.left` is where the page's own area starts on the live app (the sidebar's width), and
  `designLeft` the same on the design pictures. Both are cropped away, so no one grades the sidebar.
- `reach` says how the capture gets there: a test world, a role and steps. The steps are `goto` a
  path, `click` a test id (add `name` when several rows share it), `type` text into a test id, or
  `open` a folded group. A state only a component test can show (loading, an error the fixture
  can't cause) uses `"test": "<file> :: <test name>"` instead.
- `buttons` lists every control on that state. Give each a test id the builder will use, the state
  it opens (`opens`, or leave it out when the button acts in place), and its `effect`:
  - `none`: moves around only (tabs, links, opening a panel);
  - `free`: changes test data but costs nothing (save, discard, add);
  - `metered`: spends an allowance (an AI call, a paid API);
  - `dials`: places a call or sends a text;
  - `destructive`: deletes something that can't be regenerated.
  The capture only ever clicks `none` and `free`. A state behind a `metered` or `dials` click needs
  `reach.intercept` (`{ "method", "url", "status", "body" }`, answered from a fixture) or a
  component test.
- `reach.writes: true` marks a state reached by saving, adding, discarding or any other click
  that changes the test data. Those states are captured last, and their world is re-seeded before
  the next capture.
- `member: "hidden"` marks a button a member must not see. Add a member state for each screen a
  member can open.
- `keep` (redesigns only): every feature of the old page, and where it lives on the new one. A
  feature with no home is a question for the founder, so put it in `keep` with `"how": "not in
  the design"` and say so in your reply.
- Test worlds: one world per distinct data situation the states need (the design's own data, empty,
  a messy one, one per special case). Each world needs a world file in
  `docs/delivery/<feature>/worlds/<id>.json`. Write the missing ones in the shape of the existing
  ones. Fixture emails match the repo's safety file. Phone numbers use its fake range, and web
  addresses its reserved domain. Use relative dates (`{ "$rel": "now-2h" }`) for anything the page
  compares with today.

## Done

Run `node scripts/delivery.mjs map` (or the CLI the repo uses) until it prints no problems, and
reply with the number of states, buttons and worlds, plus any old feature with no home.
