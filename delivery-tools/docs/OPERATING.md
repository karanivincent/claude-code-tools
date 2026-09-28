# Operating delivery-tools

How to install it, start a run, keep it current, and the few things that fail silently unless
someone does them. Written after the first end-to-end rehearsal, which found 57 bugs by running the
whole system for real; every rule below is one of them.

## Install

The plugin ships from this marketplace. A project that uses it enables it in its own
`.claude/settings.json`, so everyone who opens that project gets it:

```json
{
  "extraKnownMarketplaces": {
    "vince-tools-marketplace": { "source": { "source": "github", "repo": "karanivincent/claude-code-tools" } }
  },
  "enabledPlugins": { "delivery-tools@vince-tools-marketplace": true }
}
```

The project also needs its own profile, `.claude/delivery-profile.json`, and safety file,
`.claude/delivery-safety.json` (spec section 18). `delivery init` drafts the profile; the safety
file is written by the project's owner, because it names the numbers and identities no agent may
invent. The project's `scripts/delivery.mjs` shim finds the installed plugin.

## Start a run

1. Export the design from Claude Design as a **project archive (.zip)**. A standalone HTML download
   is a rendered page without the design's source; `intake` refuses it and says so.
2. Open a new session on the project's repository.
3. `/deliver-from-design <archive>.zip "<one sentence: what the page is for>"`

The export holds the whole design project, pages already built included. The sentence decides
which screens the run builds; every other screen in the export is left as it is, and `ready` goes
red if the branch changes one of their route files. Parts several screens share (a header, a
sidebar) follow the design, and the report lists each that changed. To bring an already built page
up to a newer design, start a separate run with the same export and a sentence naming that page.

The run asks nothing in chat. It ends with one draft pull request, a preview, a sign-in link as a
test user, and a comparison page showing every state three ways: the design, the first round and
the last.

### Picture mode (the default since 0.4.0)

After intake and preflight, the design's states are rendered to pictures. A mapper agent writes
`docs/delivery/<feature>/map.json`: every state, how to reach it, its buttons and where each goes.
`delivery map` checks the map and writes `checklist.md`. One builder builds the page from the
pictures. `delivery shoot --base-url <dev server>` takes full-height pictures of the page's own
area, with the sidebar and top bar cropped away, next to the design cropped the same way. Reviewer
agents compare them, one per screen, and `delivery review` compiles their notes into a comparison
page. At most two fix rounds follow. `delivery status` names the next step throughout.

Review only what changed. The shoot records a sha256 of every live and design picture, whether the
live page's text, test ids and buttons equal the design's, and the share of pixels that differ (the
browser measures it; more than 16 of 255 in a channel counts as different). `delivery review --plan
--round <n>` then leaves out two kinds of item. An item whose live and design pictures are both
unchanged since the round before keeps that round's label (marked carried). An item that agrees
exactly and differs in at most 0.5% of pixels is a match without a reviewer (marked auto); anything
missing, including an unmeasured difference, sends it to one. The rest go into batches of up to 20
items, a state's desktop and phone together, and the command writes `batches.json` and a
`batch-<k>.prompt.md` per batch into the round's folder. Dispatch those files as written, at most
four at once. Text in `docs/delivery/<feature>/steers.md` is added to every prompt. Then
`delivery review --round <n>` compiles as before.

Since 0.5.0 a run can check the phone as well as the desktop. When the design has phone screens,
the map declares `"widths": ["desktop", "phone"]` and every state is checked at 1440 x 900 and at
390 x 844. The design is rendered narrow with `delivery design render --width phone`, or a state
points at its own mobile frame with `"design": { "phone": "<id>" }`. A state that exists at one
width only says `"widths": ["phone"]`, and `reach.phone` gives the steps when a phone reaches it
another way. The shoot pictures the phone in its own touch-device browser, with no sidebar crop,
and flags a page that scrolls sideways, which always counts as a must fix. Phone pictures add
`@phone` to the name (`KC-05@phone.live.png`); desktop names are unchanged. Reviewers, the
comparison page (a row per width under each state), `status` and `ready` all count items, a state
at a width. A map without `widths` checks the desktop only, exactly as before.

Since 0.6.0 decisions made in words are checked too. Every brief sent to the design is saved in
`docs/delivery/<feature>/intent/` (the spec with `--brief` as well). A rules agent (`briefs/rules.md`)
writes `rules.json`: one numbered rule per behaviour the briefs state, each with one proof.
`picture` names the design states that show it; `delivery map` writes the rule under those states
in the checklist, and reviewers mark a broken rule `must fix: R<n>`. `test` means no picture can
show it; the builder writes a test named `R<n>: ...` and lists its file. `cut` quotes the Scope
line the founder saw. `owed-design` means the design never drew it, and the run stays red until it
does. `delivery rules` prints every gap; `status` stops on one; `ready` adds a `rules` check that
also requires each named test to exist. A run with no briefs is unchanged.

The rules agent now runs twice: straight after intake, before the design's states are even
rendered, so an undrawn behaviour is caught before a map and a build are spent on it, and again
after `delivery map` to fill in each `picture` rule's states. `status`'s NEXT line asks for the
rules pass before it asks for anything else. When a rule comes back `owed-design`, NEXT names the
`design-send` skill and stops there — `picture-build` refuses to dispatch the builder while
`delivery rules` still exits non-zero on an owed rule, until it is either sent to the design or the
founder cuts it (proof `cut`, with a Scope line).

Since 0.7.0 a page that was already built gets an update run when its design changes:
`delivery intake <new export> --feature <slug>-update --from <slug> --intent "<sentence>"`. It
copies the earlier run's `map.json`, `worlds/`, `rules.json` and `intent.json` (never over a file it
already has), and `status` makes round 1 a picture of the page as it is, before any building, so
the builder only fixes what the new design changed.

A run that began in full mode switches with `delivery map --from-plan`. Before the pull request
is marked ready, `delivery ready --pr <n>` checks CI, the pushed head, the preview, duplicates and
the rounds (every round compiled, every state's newest picture reached) and the rules; it no longer asks a
picture run for a full capture or an audit.

To try the page as a test user, `delivery sign-in <world> --base-url <preview>` prints a one-time
link (fixture users on the test project only; add `--role member` or `--next <path>`). It lasts
about an hour, so make a new one rather than resending an old one.

Full mode (coverage plan, waves of units, mechanical gates, graded audit) is still here for a run
that asks for it by name. It decides readiness through `delivery ready`, and its Scope issue
carries the owner's decisions.

### Render and shoot details

- `design render` hashes every picture. Two different states with the same picture fail the render, naming both ids and the hash. If a state really shares a picture, add `"samePictureAs": "<id>"` to its inventory entry.
- A design that reacts only when a prop changes needs `"kind": "preset"` with `props`. Render boots the design, then applies the props with a `set`, the way a `{"set": ...}` step does. A `prop` reach still bakes its props in as defaults.
- `shoot` scrolls a components state into view and pictures it with `locator.screenshot()`, so a page that scrolls inside `<main>` is pictured whole. Fixed bars and dev overlays are hidden at every width.
- A state that changes data and is shot at both widths is shot at desktop first. The world is then re-seeded (`refreshWorld`) before the phone shot.

### Shared slots

Heavy work shares one machine-wide file, `~/.delivery/slots.json` (override with `DELIVERY_SLOTS_FILE`), with at most two holders. `delivery shoot` takes a slot and releases it itself. The e2e command in a project's profile can be wrapped the same way: `delivery slot run -- pnpm e2e ...`. A holder whose process has died is reclaimed. A waiting command prints who holds the slots and gives up (exit 4) after 30 minutes, or `--timeout <s>`.

## Components first

Since 0.9.0, a design component is built once and every page imports it, instead of each page
drawing its own copy. `docs/delivery/components.json` is the product-wide record: one entry per
component Claude Design named (`kind: "design"`) and one per shadcn-style part the repo already
has (`kind: "base"`). A project enables it with a `components` block in its profile
(`components.map`, `components.baseDir`, `components.baseLibraries`, `components.galleryRoute`).

1. `delivery components --scan-base` writes or refreshes the `kind: "base"` entries from
   `components.baseDir`, recording which of `components.baseLibraries` each one wraps. Run it once
   to start the map, and again whenever a base part is added.
2. `delivery intake <export> --components` snapshots the design, adds or updates every
   `kind: "design"` entry (name, hash, `uses`, `status`), and writes a components run: its own
   `inventory.json`, `gallery-states.json` and `map.json` (`"kind": "components"`), one state per
   component state, at both widths. Refused when a design entry has no `target` yet — the mapper
   must run first. Feature slug: `components` the very first time, ever; once that slug is taken (a
   components run has happened before, landed or not), a later export needs `--from components`
   too, which gets a dated slug of its own (`components-<YYYYMMDD>`, from the clock) — `--from`
   cannot name the run it is starting.
3. Dispatch the mapper agent with `briefs/components-mapper.md`. It fills each entry's `target`,
   `props`, `builtOn`, `owns` and `replaces`; `delivery components` checks the result. `delivery
   status` on this run says the same before `map.json` exists: dispatch the mapper with
   `briefs/components-mapper.md`, then run `delivery intake --components` again — never the intent
   extractor, which a components run never has.
4. The components run then follows the same picture loop as any other run (`picture-build`): one
   builder builds every component from its design picture, reviewers compare, fix rounds follow.
   The builder gets its component list from `delivery components --used`, never from the prompt.
5. Before `ready`, mark what the builder finished: `delivery components --mark-built <Name>`
   (repeatable). `delivery ready` adds a `components` check with four rules: a screen's used
   component must be built at the design's current hash; a changed file must not import a
   component's owned library directly; a new file named like a component must be that component's
   own target, not a redraw of it; a used component's target must actually be imported by what the
   PR changes.
6. A page run's `ready` reads which components its screens show from the design render's
   `<ID>.components.json` record and refuses to land while one of them is unbuilt; `picture-build`'s
   NEXT line says so and names `delivery intake <export> --components` as the fix — with
   `--from components` added once a components run exists already, since `components` is then a
   taken feature slug.
7. Once a components run lands, NEXT has one thing left: `/design-sync` on the design-system
   project, so its own manifest knows what this run built. `delivery components --export <dir>`
   (or a page run's own design snapshot) reports drift against an export at any time, without
   writing anything — `delivery components --mark-built` is what persists a fresh hash (land never
   commits); NEXT and `ready` both read it from the PR head, so marking built only counts once it
   is actually committed and pushed.

## Briefing and reviewing the design

Since 0.9.0, sending Claude Design a change and checking what came back both go through the CLI,
so a brief is checked before it is sent and a reply is judged from its export rather than from a
screenshot.

1. `delivery brief new <slug>` writes `intent/briefs/NN-<slug>.md` from
   `templates/design-brief.md`: what changes and why, each screen's Desktop and Phone line, the
   components to use (named from `components.json`, never described in words), numbered
   behaviours, and generic data. `--from-review` pre-fills it from the latest
   `delivery design review`; `--from-run` pre-fills it from a picture-mode round's `design:` notes
   (the items that go back to the design instead of being fixed in code).
2. `delivery brief check <file>` refuses a leaked name (`design.forbiddenNames`), a screen missing
   its phone line, a component described instead of named, or an unnumbered behaviour.
3. `delivery brief pack <file> [<image>...]` builds the pack folder the `design-send` skill sends:
   the checked brief as `00-brief.md`, plus every image in order.
4. The `design-send` skill hands the pack to Claude Design in the in-app browser and waits for the
   final edit.
5. `delivery brief sent <file> --chat <url>` records the send (the file, the chat link, the time),
   so a later session can tell what was sent and whether the file has changed since.
6. `delivery design review <export>` compares the new export with the run's current snapshot:
   components and screens whose hash changed, states added or removed, the changed states
   re-rendered before and after. It writes `review.json` and `compare.html` under
   `.delivery/<feature>/design-review/`, and lists rules gaps and forbidden names it found in the
   rendered text. Use this instead of canvas screenshots — the export already renders headlessly,
   and canvas screenshots lag and show one state at a time.
7. Findings feed the next brief: `delivery brief new <slug> --from-review`.

## Data gaps and seed guards (A1, A2)

Two picture-mode changes that move seed problems earlier, from the middle of a review round to
`seed --check`/`--apply` before any shoot, and from a founder discovering one guard proposal per
`seed --apply` to seeing every guard a run's worlds need in one place, right after the map.

- **A1, data gaps.** A state's map entry may carry `data`: what the picture needs to exist (a
  table, a filter, a minimum count — briefs/mapper.md has the shape). `seed --check` and `--apply`
  check it against the rows the worlds seed (the world files, not a live read) and name any state
  whose world falls short, exiting non-zero the same way a safety layer does. A reviewer who
  notices the live page is only wrong because that data is missing writes `data gap:` instead of
  `must fix:` (checklist.md prints the "Needs data" line under the state so they can tell). A data
  gap never spends one of the picture loop's fix rounds — it is the world's problem, not the
  builder's — but `ready` never goes green over one either: `pictureReadiness`
  (`lib/run/ready-compute.mjs`) lists it apart from code defects and always keeps ready red until
  the world is re-seeded and the state shot again. That is the smallest honest behaviour: a data
  gap can't silently ship, but it also can't burn a builder's fix round the way a real defect does.
- **A2, guards and CHECK constraints.** `seed --plan` prints one grouped "guards to approve" list:
  every table the worlds write that no guard in `.claude/delivery-safety.json` covers. NEXT
  surfaces the same list once, right after the map validates (before rules or worlds), so the
  founder reviews every guard the run will need in one sitting. `seed --plan` also reads the test
  database's CHECK constraints and enum types and refuses a world value outside them, naming the
  table, column, the value and the allowed values; a constraint it cannot parse (anything beyond a
  plain `col IN (...)` or `col = ANY (ARRAY[...])` list) is silently skipped, never wrongly
  enforced. Neither of these loosens or changes what a guard permits.

## Things a session must do that nothing else will

- **Enter the run's worktree.** `intake` creates the run in its own worktree. A session in any other
  worktree has every write into it refused, its agents' included: in the rehearsal four auditors
  finished an audit and could not save a line. Switch with `EnterWorktree` (its `path`) as soon as
  intake or NEXT names the worktree. The consuming project's `CLAUDE.md` should say so, because the
  tool is only used when the user or the project's instructions ask for it.
- **Keep the installed copy current.** The plugin cache is a copy, not a link. A change reaches a
  session only after the plugin's version is bumped, released, and the copy updated
  (`claude plugin update delivery-tools@vince-tools-marketplace`). Once, the installed copy ran two
  days and 57 files behind the code with nothing to show it.
- **Name the env files.** A run works in worktrees, and a project's untracked `.env` exists only in
  its main checkout. The profile's `environments.envFiles` lists the files the CLI reads from the
  main checkout at startup; it fills only variables the shell has not set and prints no value.
- **Cap the builders.** `limits.builderParallel` in the profile. Seventeen agents in parallel once
  used a week of model budget in an afternoon; three is a sane default.

## Rules the rehearsal wrote

| Rule | Why |
|---|---|
| Never wrap `delivery capture` in a heavy-work slot wrapper | it takes its own slots and deadlocks waiting on yours |
| Push every integration commit before a wave capture | a wave capture waits for a preview of the pushed head, for ever if it was never pushed |
| Address controls in reach steps by test id | a step that names words is captured in the primary locale only, and cannot be replayed in a messy world |
| A fix unit may own no state | its gate captures the states of every unit whose files it changes, so a regression is caught at the gate, not a wave later |
| A version route may sit behind sign-in | `ready` then proves the served commit from the full capture, which signed in and read it on every item |
| Reads and sign-ins retry on a dropped connection; writes never do | an upsert whose response was lost may already have landed |
| A run whose pull request was closed unmerged closes with `advance closed` | otherwise the session-start hook tells every later session to resume it |
| A run builds the screens its sentence names, and no other screen in the export | an export is the whole project; without this a Calls run would inventory, plan and rebuild Scripts too |

## Before the first push

Run `delivery prepush`. It fails, one line per problem, on: a test id or visible text the base
branch's design plans (`<deliveryRoot>/replay/**/plan.json`) or e2e specs still name that the branch
removed (the design gate and E2E read the base, so the PR cannot fix it); a migration the branch adds
that creates a table with the org column and is missing from a list in `paths.orgScopedLists`; a
branch behind its base; and the components rule `ready` runs after CI. Set `paths.migrationsGlob`,
`paths.orgScopedLists` (and `paths.orgColumn`, default `organization_id`) in the profile to turn the
second check on; without `orgScopedLists` it is skipped. The removed-name search covers
`componentGlobs`, `appRouteGlobs` and the message files at the merge base and at HEAD.

## The Trust rule

Section 20 of the spec gates real use. 20.2 (the real-artefact tests) passed on 2026-09-21. 20.5
(the seeded-defect rehearsal) passed on five of seven defects; defects 4 (a stale base) and 7 (a
removed capability) need a baseline, so they are proven on the first real run that is a redesign,
and only when that run's request asks for it.

## Where the spec is

The normative spec, its reviews and the full build record cite the first consuming project's own
pages, so they live in that project's repository, not in this public one. `docs/STATE.md` says
where.
