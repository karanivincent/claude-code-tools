# Mapper brief: write the button map

You write one file, `docs/delivery/<feature>/map.json`. It is the whole plan for a picture-mode
run: the builder builds from it, the capture walks it, and the reviewers check against it. You
don't write code.

## What you have

- `.delivery/<feature>/design/<ID>.png`, `<ID>.txt` and `<ID>.dom.json`: every design state the
  design render could draw, as a picture, its visible text and its elements. `<ID>@phone.png` is
  the same state rendered at phone width (390 pixels), when the design has been rendered narrow.
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
  "widths": ["desktop", "phone"],
  "pageArea": { "left": 240, "designLeft": 240, "phone": { "left": 0 } },
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
        { "label": "See the call", "testid": "kb-asked-see-call", "opens": "KC-12", "effect": "none" },
        { "label": "Menu", "testid": "kb-menu", "opens": "KC-40", "effect": "none", "phone": "shown" }
      ] },
    { "id": "KC-40", "screen": "To check", "name": "Navigation menu open", "widths": ["phone"],
      "reach": { "world": "design", "role": "admin",
                 "steps": [ { "goto": "/dashboard/<page>?view=check" }, { "click": { "testid": "kb-menu" } } ] } },
    { "id": "KC-01", "screen": "To check", "name": "Loading",
      "reach": { "test": "apps/dashboard/src/.../frame.state.test.tsx :: KC-01 loading" } }
  ],
  "keep": [ { "what": "Export as CSV", "where": "old-page.tsx", "how": "moves to the Sources menu" } ]
}
```

- One state per design picture. Every `<ID>.png` must have an entry, or be the design another
  entry points at (below). A state the design never drew needs `"design": false`.
- `widths` says which screen widths the run checks: `"desktop"` (1440 x 900) and `"phone"`
  (390 x 844). Leave it out for a desktop-only run. Declare `["desktop", "phone"]` when the design
  has phone screens, either as the same states drawn narrow (a responsive prototype) or as separate
  mobile frames. Each state at each width is one item; its pictures are `<ID>` and `<ID>@phone`.
  - A responsive design needs nothing more: the phone item is compared with `<ID>@phone.png`. If
    that file is missing, `delivery status` asks for `design render --width phone`.
  - Separate mobile frames: point the state at its phone screen with
    `"design": { "phone": "<design state id>" }`. The desktop keeps the state's own picture (or
    `"design": { "desktop": "<id>", "phone": "<id>" }` when both differ).
  - A state that exists at one width only says so: `"widths": ["phone"]` (a navigation menu
    opened on a phone), or `["desktop"]`. A state the phone design never drew, but that exists on
    a phone, can say `"design": { "phone": false }`.
- `pageArea.left` is where the page's own area starts on the live app (the sidebar's width), and
  `designLeft` the same on the design pictures. Both are cropped away, so no one grades the sidebar.
  At phone width there is no sidebar: `pageArea.phone` defaults to `{ "left": 0 }`.
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
  - A state whose render named a design-first component (its `<ID>.components.json` lists it)
    only gets a button entry for that component when the component has its own controls on that
    state (a date field's own calendar icon, say) — not for the component's whole surface.
- `reach.writes: true` marks a state reached by saving, adding, discarding or any other click
  that changes the test data. Those states are captured last, each in its own browser, and their
  world is reset before every one of them.
- `sources` (top level, recommended): each route's source folders, as repo-relative globs, so a
  fix round re-shoots only the routes whose files changed: `"sources": { "/dashboard/settings":
  ["apps/dashboard/src/app/(dash)/dashboard/settings/**", "apps/dashboard/src/components/settings/**"] }`.
  List every folder whose files draw the route; a shared component folder belongs to every route
  that uses it. When unsure, leave the route out: it is then always shot.
- `clock: true` marks a state whose look depends on the time of day or the date: "calling hours
  open", "overdue", "due today". Its world's times must be relative to the shoot
  (`{ "$rel": "today@09:00" }`, `{ "$rel": "now-2h" }`; a time that must fall today, because the page
  shows it under today, carries `today: true`: `{ "$rel": "now-80m", "today": true }`); `delivery map` refuses a fixed date or
  time in that world's file. The shoot resets the world right before it pictures it, so "open now"
  is true at that moment. Mark every state whose design shows calling hours open or closed,
  "waiting until", "calling now" or anything else that follows the time of day `clock: true`, and
  give its world its own time-of-day settings in relative minutes, never the product's default
  hours: `{ "$minuteOfDay": "now-60" }`, and for a closed or open window the paired tokens
  `closedStart`/`closedEnd` or `openStart`/`openEnd`, valid at every minute of the day (see
  briefs/seed-writer.md). When the profile names
  `testData.timeOfDayTables`, `delivery map` refuses a clock state whose world writes no row to one
  of them.
- `colorScheme: "dark"` (or `"light"`) marks a state the design shows in that colour scheme. The
  shoot emulates it before the state's first step, so an app following the system theme renders it;
  when the profile sets `ui.themeStorageKey` (the localStorage key the app keeps its theme in), the
  shoot also writes that key, so a stored preference cannot override it. `delivery map` refuses any
  other value.
- `member: "hidden"` marks a button a member must not see. Add a member state for each screen a
  member can open.
- `phone: "hidden"` marks a button the phone layout does not show (it moved into a menu), and
  `phone: "shown"` one only the phone layout has (the menu button). Leave it out when a button is
  on the page at both widths.
- `reach.phone: { "steps": [...] }` is how the capture gets to the state on a phone when the way
  differs, for example through the menu. It is used only at phone width, with the same world and
  role; without it the phone walks the same steps.
- `keep` (redesigns only): every feature of the old page, and where it lives on the new one. A
  feature with no home is a question for the founder, so put it in `keep` with `"how": "not in
  the design"` and say so in your reply.
- `data` (optional, per state): what the picture needs to exist, so `delivery seed --check` can
  say so before any shoot instead of a reviewer guessing why a list looks empty. A list of
  `{ "table": "...", "where": { "column": "value" }, "min": 3 }` (min defaults to 1); add `"world"`
  only when the state's data lives in a world other than the one that reaches it. For example, a
  state that shows a table of scripts needs `"data": [ { "table": "call_scripts", "where": {
  "category": "renewals" }, "min": 3 } ]` if the design shows three or more rows. Leave `data` off
  a state whose reach world already has everything it needs by construction (most states).
- `mask` (optional, per state, rare): a value no seed can pin, such as a generated id or a random
  avatar colour, painted over on both pictures: `[ { "testid": "row-avatar", "why": "a random
  colour" } ]`. Every mask is counted in the runs ledger. Never mask a name, a count or a date:
  those are seeded from the design.
- The fixture users' `name` (on each `worlds[].users[]` entry): the design's name for the signed-in
  person, when the design shows one.
- Test worlds: one world per distinct data situation the states need (the design's own data, empty,
  a messy one, one per special case). Each world needs a world file in
  `docs/delivery/<feature>/worlds/<id>.json`. Write the missing ones in the shape of the existing
  ones; keep them small (the organisation row and the users' memberships), because
  `delivery seed --from-trace` later adds the rows the design's own values need, from the data
  contract. Fixture emails match the repo's safety file. Phone numbers use its fake range, and web
  addresses its reserved domain. Use relative dates (`{ "$rel": "now-2h" }`) for anything the page
  compares with today; a time that must fall today (the page shows it under today) carries
  `today: true`. A `{ "$ref": "<key>" }` may name a row further down the file, which is how two
  tables that point at each other are seeded; that column must accept null, and a join row (no `id`
  column) must come after the rows it names.

## Done

Done means the check passes, not that the file looks right. Run `node scripts/delivery.mjs map`
(or the CLI the repo uses) until it prints no problems, and
reply with the number of states, buttons and worlds, the widths, plus any old feature with no
home.
