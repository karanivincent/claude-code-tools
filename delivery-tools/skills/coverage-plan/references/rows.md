# Writing plan.json

The shape is `schemas/plan.schema.json` in this plugin; every object is closed, so a field not
listed there fails validation. This page says what goes in each field.

## Top level

`feature`, `epic`, `scopeIssue` and `scopeSnapshot` (both `null` until `delivery scope post`),
`worlds`, `units`, `contracts`, `rows`, `seed: { globalRows }`, `scope`.

## Rows (`rows[]`)

| Field | What goes in it |
|---|---|
| `id` | the inventory state id (`RP-01`) or the baseline capability id (`CAP-014`); never a made-up id |
| `class` | `references/decisions.md` |
| `owner` | the id of exactly one unit; shared UI (header, menus, dialogs, shared components, shared copy) is owned like everything else; `null` only for `cut` |
| `requested` | the id from `intent.json` `requested[]` when the founder asked for it in a design round, else `null` |
| `invented` | `true` for a state the design does not draw but the product needs (loading, empty, error, permission) |
| `reason` | `{ code, text }`: a cut code for `cut`; `unused` or `product-rule` for `remove` |
| `issue` | the cut's follow-up issue (filled by `delivery issues sync`) |
| `scopeLine` | `S<n>` when a Scope line decides this row |
| `migrateTo` | `{ file, control }` for `migrate`: where the old capability now lives |
| `adapt` | `{ rule, designText, productText }` for `adapt` |
| `route`, `component` | the route that shows the state and the component that renders it |
| `data[]` | `{ table, column, exists, verifiedBy }`, one per column read; `verifiedBy: "types"` when the generated database types prove it, else `"verify-spec"` |
| `backend[]` | `{ method, route, discriminator?, exists, verifiedBy, unit? }`, one per route or mutation called; every `exists: false` names the backend `unit` that builds it |
| `reach` | `{ class, world, role, steps, intercept?, test?, why? }`; see below |
| `markers` | `{ text, testids, forbidden, sameAs? }`; see below |
| `controls[]` | `{ label, testid, effect, target, enabledWhen? }`: every control, its effect class (`none`, `free`, `metered`, `dials`, `destructive`) and the state it leads to |
| `permission` | `{ member }`: `hidden`, `disabled` or `enabled`, taken from the route's own authorisation rule, not from the design |
| `copy[]` | `{ key, en, plural }`: every message key the state uses, English taken from the design render's `.txt`; `plural: true` for every string that carries a count (an ICU plural) |
| `dayOne` | `true` when a read-only count query (counts only, no rows) across the test environment's real organisations shows the state is what most of them will see first; day-one states have their severity raised one level |
| `invariants` | statements a capture can check on messy data, in the grammar `plan check` parses (see below) |
| `e2eMap` | `{ baseTest, branchTest }` for every base-branch e2e test on an in-scope route that the branch rewrites; the checker confirms the new test asserts the same test id or text |

### Reach

- `steps` are app steps, in order: `{ goto }`, `{ click: { testid | role, name } }`,
  `{ type: { testid, text } }`, `{ select: { testid, value } }`, `{ press }`, `{ waitFor }`.
- `world` and `role` pick the fixture organisation and user.
- `intercept: { method, url, status, body, timeoutMs? }` answers one request (an AI move, a
  metered start, an error state); its body is built from the real API's response type.
- `test: { file, name }` names the component render test for `prop`, test-verified `action` and
  `unseedable` states. The builder writes it from `templates/component-state.test.tsx`; the unit
  gate checks that it contains every marker, passes, and fails when the component renders nothing.
- `why` is the `unseedable` reason code.

### Invariants

Each is one sentence in one of these forms, or `plan check` is red:

| Form | Example |
|---|---|
| `at most <n> <anything> shows <target>` (or `at least`, `exactly`) | `at most one version row shows Submit` |
| `never <target>` | `never "undefined"` |
| `"<a>" never beside "<b>"` | `"No reports yet" never beside "Last run"` |
| `not both "<a>" and "<b>"` | `not both "Draft" and "Live"` |

`<n>` is digits or a word from zero to ten. A target in double quotes matches any element that
contains it; a bare target matches an element equal to it.

### Markers

Derived from the design render and the state's place in the plan:

- `text`: lines that must be visible: headings, control labels, the state's distinctive sentence.
  Literal strings in the design world, patterns in other worlds.
- `testids`: the state's root test id (name one per state, such as `reports-list-empty`) and the
  test ids of its controls.
- `forbidden`: markers of sibling states that must not be present (an empty state's sentence on a
  list that has rows).
- `sameAs: { state, why }` only when two states truly render the same text in the same world and
  role; otherwise identical captures are refused as a neighbouring state.

## Worlds (`worlds[]`)

`{ id, kind, orgName, users: [{ role, email, name? }], notes }`. One organisation per world, named with
the safety file's `fixtureOrgPrefix`; users match its `fixtureUserPattern` and belong to exactly
one world. The repo's e2e robot is never in a fixture world.

**Give a user the `name` the design draws.** A design that says "Settings for Sam" is read back
from the account, so a fixture user with no name renders its own email address there and the
state's own marker fails — which reads as a screen bug and is a fixture nobody named. `seed
--apply` sets it on the account, and sets it on a user it had already created.

**Each world file joins its own users to its organisation.** `delivery seed --apply` creates the
users in the auth system and nothing more — only the repo knows which table and columns a
membership lives in — so the world file carries one row per user:

```json
{ "key": "m-admin", "table": "organization_members",
  "values": { "organization_id": { "$ref": "org" }, "user_id": { "$ref": "user:admin" }, "role": "admin" } }
```

`seed --plan` refuses a world that declares a user no row references. Without the join the capture
signs that user in and they belong to no organisation, so every world renders the same page and
the differences the worlds exist to show are invisible.

| Kind | Holds |
|---|---|
| `design` | the design's own numbers and names |
| `day-one` | none, one, a few |
| `messy` | old-shaped rows on purpose: several open drafts, rows with missing parents, zero counts |
| `empty` | nothing |
| `limits` | every allowance spent, by seeding the meter's own rows |

A table without an organisation column goes in `seed.globalRows` with a reason. Nothing seeded may
match a worker's query unless a founder-approved guard covers it; `delivery seed --check` decides.

## Units (`units[]`)

`{ id, title, issue, kind, wave, files, states, capabilities, risk, model }`.

| Kind | Wave | Notes |
|---|---|---|
| `contract` | 0 | always present; `risk: "high"`, `model: "opus"`; typed contracts and stubs for the whole feature |
| `tooling` | 0 | repo prerequisites preflight turned into tasks |
| `backend` | 1 by default, **0 for a table the worlds seed** | one per missing backend piece; `risk: "high"` on the voice or payment path. `delivery seed --apply` runs at the end of wave 0, so the unit that creates a table the fixtures need has to be in wave 0; wave 1 is right for a route, or a column on a table that already exists |
| `shared-ui` | 1 | header, menus, dialogs, shared components |
| `words` | 1 | the only unit that edits message files, all locales |
| `screen` | 1 | builds inside the stub shell against the contracts, **and owns the registry entry that names its screen**: its gate captures through the real route, which renders whatever the registry names, so a screen still registered as a stub is graded as the stub |
| `stub-swap` | 2 | deletes the stub files once every screen is registered; its gate fails while a non-test file imports a `*.stub.*` module |
| `fix` | later | P1 and P2 findings of the previous wave |

Size: roughly one builder session, 60 to 120 minutes. Two units in the same wave never share a
file, except message files, which only the words unit edits. List every file a unit may touch:
the builder stays inside that list.

## Contracts (`contracts[]`)

`{ id, file, stub, consumers }`, written by the contract unit in wave 0:

- the shell contract: the context every tab reads, a stub provider filled from the design world,
  the real route files mounting the stub shell;
- the tab and dialog registry, **one file per entry**, each mapping one tab value or dialog key to
  a component and pointing at that entry's stub. The screen unit that builds the component swaps
  its own entry when it lands, which is why the entries are separate files: two screen units in one
  wave may not share a file, and a single registry file makes every screen of a wave collide on it.
  A screen whose entry still names the stub captures as the stub, and its gate says so
  (`gate-stub-registered`) rather than reporting each of its states as its neighbour's text;
- the API contracts: request and response schemas for every new or changed route, and stub
  handlers returning design-world fixtures validated against them;
- the copy keys: every key the plan names, owned by the words unit.
