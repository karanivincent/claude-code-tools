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

### Permission prompts

A run calls the CLI hundreds of times. Approve it once, in the project's `.claude/settings.json`:

```json
{ "permissions": { "allow": ["Bash(node scripts/delivery.mjs:*)"] } }
```

A broader `"Bash(node scripts/:*)"` covers it too. The rule matches the start of the command, so
the harness still asks when the command has another shape. Three shapes do that:

- a `cd … &&` in front of it;
- an env prefix such as `VAR=value` in front of it;
- a `$(…)` (or backticks) anywhere in it.

So run `node scripts/delivery.mjs <command>` bare, from the worktree root. The CLI finds the run
itself, and reads the profile's env files itself (`environments.envFiles`). The skills and NEXT
lines are written in that shape.

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

An export with two pages that no file imports is refused, and the error names both. Pick one with
`delivery intake <archive> --page "<name>"`. The snapshot README records the choice, every later
command reads that page, and a later export of the same run keeps it. Intake runs the profile's
`commands.bootstrap` in the worktree it creates, so packages are installed before anything
renders; preflight P10 warns when the run worktree has no `node_modules`.

### Picture mode (the default since 0.4.0)

After intake and preflight, the design's states are rendered to pictures. A mapper agent writes
`docs/delivery/<feature>/map.json`: every state, how to reach it, its buttons and where each goes.
`delivery map` checks the map and writes `checklist.md`. One builder builds the page from the
pictures. `delivery shoot` takes full-height pictures of the page's own
area, with the sidebar and top bar cropped away, next to the design cropped the same way. Reviewer
agents compare them, one per screen, and `delivery review` compiles their notes into a comparison
page. Fix rounds follow while the count of items to fix falls; the loop ships at zero and stops
after two rounds with no fall (or at eight rounds), sending the founder only the stuck items
(`rounds/<n>/stuck.md`). A fix round shoots only routes whose files changed (map `sources`;
`shoot --all` shoots everything), and an earlier-passing item whose picture changed is sampled per
screen; `review --plan --held` reviews the held rest, always once before shipping. `delivery status`
names the next step throughout.

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

Shadow grader (optional, record only). Set `review.shadowGrader` in the profile to
`{ "endpoint": "<url>", "model": "<id>", "keyEnv": "<NAME OF AN ENV VAR>" }` and export that variable.
Compiling a round then asks the outside model, for every must, small and not-reached finding (not the
carried ones), whether it is a code bug, a data gap or a known steer (the lines of `steers.md`), and
writes `rounds/<n>/shadow.json`. It never changes review.json, a count, the exit code or what the
builder sees; a failure is one warning line, and the key is never written anywhere. To score it, run
`delivery review --shadow-export`: it writes `shadow-sample.json` (the findings, with ids) and
`shadow-answers.json` (the model's answers, apart). Two labellers, blind to the answers and holding the
run's evidence, label the sample; keep the findings they agree on and compare the model with those
labels. Adopt the model for known steers only if, at probability 0.8 or more, it is right on at least
95% of them and the lower bound of the 95% confidence interval is above 90%. The retro record shows
how many answers each run got and how many failed.

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
- A design that reacts only when a prop changes needs `"kind": "preset"` with `props`. Render boots the design, then changes those props on the running component (not its state, which is what a `{"set": ...}` step writes), so its `componentDidUpdate` sees the change once. A `prop` reach still bakes its props in as defaults, which never triggers `componentDidUpdate`.
- `design candidates` finds a preset table: a top-level `const T = {...}` that a method `m(arg)` indexes, called as `this.m(this.props.P)`. Each key becomes a `preset` candidate reached with `{ "P": key }`, in place of that prop's `prop-value` candidates. A `_bundle_src.dc.html` beside the page is ignored, and intake says so.
- `design candidates --groups` writes `.delivery/<f>/candidate-groups.json`: which extractor reads which candidates, one group per in-scope screen plus `shared` and `other-screens`, split by section above `--max` (150). The assembler writes `.delivery/<f>/unclaimed.json`, each id with its group, to resend.
- A reach that puts a state key (a key the design writes with `this.set`) in `props` renders it as a `{"set": ...}` step instead, and `design render` prints a `note` saying so. Write it as a step in the first place.
- `design render` warns (never fails) when a state's page is mostly an iframe, whose words it cannot read (a phone view drawn in a phone frame: render it with `--width phone` instead), and when a reach sets a prop named like one of the design's state keys.
- `delivery serve --ensure` keeps the run's dev server (`commands.devServer`, with `commands.serverEnv` added) running on its own: detached, in its own process group, output in `.delivery/<f>/server.log`, recorded in `.delivery/<f>/server.json`. A dev server started with a tool call's `run_in_background` dies at the tool's two-hour limit. It reuses a server that answers and restarts one that is gone or answers 500, on the same port. `shoot` and `smoke` with no `--base-url` run it themselves, so a builder's `shoot --round work <ID>` needs no URL. `delivery serve --stop` stops it before the full CI chain; `--status` says whether it serves.
- `delivery smoke` opens every route the map reaches, signed in, at every width, and fails at the first page that answers 500 or more, shows the Next.js error overlay, serves a replaced build output, or still shows a loading placeholder 10 s after loading (the profile's `smoke.skeleton` selectors, `[aria-busy=true]` and `[data-skeleton]` by default). `shoot` runs it before it pictures anything, and again after: when the server broke during the shoot, the new round's folder is deleted, so the next shoot takes the same number. The builder and the fixer run it before they report done.
- `shoot` scrolls a components state into view and pictures it with `locator.screenshot()`, so a page that scrolls inside `<main>` is pictured whole. Fixed bars and dev overlays are hidden at every width.
- `shoot --prod` builds and serves a production build with the profile's `commands.prodServer` (`{port}`, a build folder of its own), inside the shoot's heavy slot, and stops it after. A failed build stops the shoot with its last lines, and no round is used. Worlds are shot side by side (`shoot.parallelWorlds`, 2), one browser context each; the waits and the 3 s click timeout are `shoot.*` tunables.
- The crop: at the bottom, only the phone tab bar is hidden (the profile's `picture.tabBar` selectors; without them a full-width bar at most 160 px tall, never a sheet or dialog). At the top, both pictures are cut at the same edge: the page title less 24 px, raised to an open panel; `picture.keepPhoneHeader` keeps the phone header in both.
- `review --plan` writes `rounds/<n>/facts/<ITEM>.md` for each item it sends, under 2 KB: reached, buttons, sideways scroll, pixel difference, texts one picture shows and the other does not, and what datacheck sorted. Reviewers read those, not `shoot.json`.
- Before round 1 a `delivery-extractor` (Role: steers, `briefs/steers.md`) writes `steers.md` from the design: phone patterns, test data, rules over the picture. It is added to every reviewer prompt, and an update run carries it over (with `swaps.json`).
- Every state that changes data is shot in its own browser context, and its world is reset right before it (desktop before phone), so a save never leaks into the next state.
- After each shoot, datacheck looks for every contract data value in the page's text (`<ITEM>.live.txt`), and looks each miss up in the world as seeded (`seeded.json`): a data fault (the world lacks it) goes to the seed-writer and is re-shot with `shoot --only data-faults` before any reviewer; a must fix (the world holds it) goes to the fixer. `delivery datacheck` does it again from the saved files. The round's `datacheck.json` also lists traced columns no query in the code selects, which `delivery contract --questions` asks the founder about.

- After a round's review is compiled and before the next fixer, NEXT asks for `delivery prepush --round <n>`: the push checks, then the profile's `commands.security` when set, recorded in `rounds/<n>/prepush.json`. The fixer fixes what it lists with the review, so nothing new turns up at ship.
- A map state the run will not build carries `"later": "<why>"`: it is not shot, its verdict is `later`, and it is never open. An item the founder accepts as it is (a test-data gap the safety rules make on purpose) is waived with `delivery waive <ITEM> --why "<reason>"` (`.delivery/<f>/waived.json`): it keeps its verdict, is not open, and ready, `stuck.md` and the PR body show the reason.

### Test data

- `delivery seed --from-trace` writes world rows from the contract: one row per `row` key, named `t-<row>`, with the design's values, relative times, enum literals, numbers and the organisation column (from `paths.databaseTypes`). Emails become fixture addresses and the organisation's name the world's; each swap is in `docs/delivery/<f>/swaps.json`. It prints what it could not infer, for a seed-writer.
- `delivery seed --need "<STATE>: <what>"` answers in one line: held, or queued in `needs.json` for the seed-writer; `--need-done` closes needs.
- `seed --plan` refuses a column a table lacks, a value of the wrong type or an enum value the database does not list. A profile may add `commands.validateSeedJson`, a script that checks Json column values with the app's own rules (stdin `{ "entries": [...] }`, stdout `{ "problems": [...] }`).
- `seed --check` refuses a seeded table that a side-effect rule watches and no guard covers. `seed --refresh` cleans every table the world has ever seeded (the seed plan's `seededTables`), not only the ones it seeds now.
- A fixture user's name lives in the auth user's metadata, and often in the app's own users table too, which an insert trigger fills once. Name those copies in the profile's `testData.userNameColumns` (`[{ "table", "column", "idColumn" }]`, `idColumn` default `id`), and `seed --apply` writes each named fixture user's name there, so a name changed in the map reaches the page. A refused rename now fails `seed --apply`.
- The safety file's guard probes name the tables no fixture organisation may hold: a plain `select count(*) from <table> where organization_id = any($fixtureOrgs)` expecting 0. `delivery map` refuses a world that writes one and a state that shows one with no `reach.intercept`, `seed --from-trace` never writes them, and review planning adds a steer telling reviewers their values are data gaps. A value the state's intercept answers with counts as held, in `seed --check` and in datacheck.
- `seed --from-trace` records a hash of each `t-` row it writes in the world file (`traced`). A `t-` row edited by hand since is kept and reported; one the contract no longer produces is reported as dropped.
- `seed --plan` writes each world's rows after the rows their `$ref`s name (the organisation first, file order otherwise). Only two rows that name each other still need a forward reference.
- The contract labeller has no shell, so it never rewrites a file: it writes batch files, `contract-labels-<n>.json`, and `delivery contract` folds in `contract-labels.json` and every batch file, a later one winning. A label may be keyed by its text alone (`"texts": { "<text>": { ... } }`), for every state that shows it; a state's own entry still wins. `delivery contract` writes `.delivery/<f>/contract-todo.json`: each text to label or fix, its states, and the batch file to write next. The labeller works from it.
- A contract text labelled `none` is a value the product does not store. `delivery contract --questions` writes the one list for the founder; `delivery contract --decide build|drop|design --state <ID> [--text ...]` records each answer.

### Shipping checks

- `delivery map` warns, while the build can still act on it, about test ids the base branch's e2e specs name that the page's code has and the map does not keep (open the skip PR now), and about other open runs that change the same files: a database function both redefine, the message files, `paths.sharedFiles` (the navigation config) or files under this run's routes. `delivery prepush` refuses a function both runs redefine, and ignores test ids inside `test.skip` and `.fixme`.
- `delivery land` reads the merge commit's commit statuses too (a host's deploy, which no workflow run shows) and fails on a red one; once the deploy is live it runs the profile's optional `commands.stagingE2e` once per merge.

### Scope and models

- A design with more states than `run.splitAboveStates` (120) gets a NEXT step proposing one run per screen group; `"oneRun": true` in the map keeps one run. With more than one screen, the first builder is dispatched once per screen group (a `Screens:` line), continuing from `builder-notes.md`.
- Extractors run at Sonnet medium. `models.json`'s `experiment` names a role to try on another agent for a number of runs (now: the first builder at Opus medium, `picture-builder-medium`, for one run); the ledger records it and `delivery runs` shows it.

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

## The retro and the size rule

`delivery retro` closes a run. Once `ready` is green, NEXT names it: run it and commit
`docs/delivery/runs.jsonl` in the run's PR. `delivery land` runs it again before the epic closes and
refuses to finish until the run's line is committed (on the base branch, or on the run's branch); a
retro that fails is a red land. It runs in the delivery session only: no
schedule, no cron. It never touches production, never dials, never seeds and never opens a database.
It writes four things: the runs ledger (`<deliveryRoot>/runs.jsonl`, one line per run, replaced on a
re-run; commit it with the run), the run's own `steers.md` and `proposals/`, and the plugin checkout
through pull requests.

One line holds the phase minutes from the journal, the founder's waiting, each round's counts, reviewer
tokens and minutes where `batches.json` records them, CI failures seen after the PR opened, and the
entries of the run's `workflow-improvements.md`. Since 0.14.0 (record version 2) it also holds, per phase,
the models its agents used, their tokens and estimated cost (`phaseCost`); every agent with its
role, model, effort, minutes, tokens and outcome (`agents`); the main session's own tokens (`main`);
and the time spent waiting for a machine slot (`slotWaits`). The plugin's `SubagentStop` hook
writes each agent to the journal from its transcript (its role from a `Role:` line in its prompt, or
its agent type; its outcome from an `Outcome:` line in its last message); `delivery log-agent`
covers an agent the hook missed, and `delivery log-wait --founder` a wait on the founder in chat.
Costs are estimates from `models.json`'s prices. `delivery runs` prints the table across runs, and
`delivery backfill-run` writes an earlier run's line from its journal and Claude Code's transcripts
of its worktree, marked `"estimate": true`.

`models.json` at the plugin root names each role's model, effort and agent (an agent's effort lives
in its own definition, so each model-and-effort pair has its own agent file). The retro reads the
agents' outcomes and cost and may propose a change to it: a Sonnet role with two or more agents
that did not finish goes up an effort step, and an Opus role that finished every time in two runs
at $10 or more is proposed for a Sonnet trial. A model change is always large: a proposal and a
`needs-decision` issue, never applied. A phase 30% over the median of earlier runs in two or
more runs (this one included), a phase over an hour more than that median in one run, or the same
improvement written up in two runs becomes a proposal with its evidence, its change and the number
it should move.

`lib/retro/size.mjs` sorts each proposal. Small only when every rule holds: the kind is a tunable in
`tunables.json`, a steer, a sentence in a brief, or a new check that only warns; it touches no
seed-safety file (`delivery-safety.json`, its schema, guards, never-dial rules, `lib/seed/**`,
`hooks/**`); it deletes or loosens no check or gate (each tunable says which direction loosens it);
it adds no command or agent and changes no agent's isolation or model; the real diff is 50 lines or
fewer; and it does not undo an earlier decision. Anything else, or anything the rule cannot read, is
large. Nothing large is ever applied.

- Small: a steer goes straight into `steers.md`. Anything else needs a plugin checkout, named by
  `DELIVERY_PLUGIN_REPO` or the profile's `retro.pluginRepo` (never a path under
  `~/.claude/plugins/cache/`; `DELIVERY_PLUGIN_GH` or `retro.pluginRepoSlug` names its GitHub repo). The
  retro branches `retro/<feature>-<id>`, edits, checks the real diff with the size rule again, runs
  the plugin's suite, pushes, opens a PR and squash-merges it. Without a checkout, or if any step
  fails, the change becomes a proposal.
- Large: `<deliveryRoot>/<feature>/proposals/<id>.md` (evidence, change, recommended default, why it is
  large) and a `needs-decision` issue in the plugin repo.
- Each applied change names its metric. Every later retro measures it on the runs after it: worse than
  its baseline in two runs in a row and it is reverted through a PR; otherwise it is marked kept or
  mixed.
- `delivery retro --dry-run` shows what it would do. `--propose <file.json>` adds proposals of your own.
  The report ends with "Changed automatically", "Reverted" and "Needs you". Put "Needs you" in the
  run's final report.

The numbers a small change may move live in `tunables.json`; the code reads them from there.

## The Trust rule

Section 20 of the spec gates real use. 20.2 (the real-artefact tests) passed on 2026-09-21. 20.5
(the seeded-defect rehearsal) passed on five of seven defects; defects 4 (a stale base) and 7 (a
removed capability) need a baseline, so they are proven on the first real run that is a redesign,
and only when that run's request asks for it.

## Where the spec is

The normative spec, its reviews and the full build record cite the first consuming project's own
pages, so they live in that project's repository, not in this public one. `docs/STATE.md` says
where.
