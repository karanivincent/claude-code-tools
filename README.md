# Yond Marketplace

A Claude Code plugin marketplace with tools for frontend development, GitHub workflows, and developer productivity.

## Installation

### Method 1: Using `/plugin` commands (recommended)

Run these commands in Claude Code:

```
/plugin marketplace add karanivincent/claude-code-tools
/plugin install frontend-tools@vince-tools-marketplace
/plugin install general-tools@vince-tools-marketplace
/plugin install goal-map@vince-tools-marketplace
/plugin install archive-ready@vince-tools-marketplace
```

### Method 2: Manual configuration

Add this marketplace to your project's `.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "yond-marketplace": {
      "source": {
        "source": "github",
        "repo": "karanivincent/claude-code-tools"
      }
    }
  },
  "enabledPlugins": {
    "frontend-tools@vince-tools-marketplace": true,
    "general-tools@vince-tools-marketplace": true
  }
}
```

## Plugins

> **Note:** Yond work skills (PR, planning, design, git, and meta workflows) now live in the team
> marketplace **[`goyond/AI-skills-`](https://github.com/goyond/AI-skills-)** as `yond-*` plugins.
> This personal marketplace keeps issue workflows, testing, and non-Yond skills.

### frontend-tools `v1.19.0`

Agents and skills for GitHub issue workflows and SvelteKit testing.

**Agents:**

| Agent | Description |
|-------|-------------|
| `github-fetch-agent` | Fetches and processes GitHub data (PR comments, reviews, issue discussions) |
| `failure-mapper` | Maps all failures in a failing E2E test for systematic fixing |
| `manual-tester` | Explores features using Playwright MCP to document interactive elements |
| `testid-fixer` | Adds testId prop support to Svelte components |

**Skills:**

| Skill | Description |
|-------|-------------|
| `test-fixer` | Fixes failing E2E/unit tests using systematic workflows |
| `sveltekit-test-guide` | Testing standards for SvelteKit (Vitest + Playwright) |
| `issue-workflow` | Manages GitHub Issues through full lifecycle |
| `github-image-downloader` | Downloads images attached to GitHub issues for design review |

### general-tools `v1.27.0`

Issue documentation workflows and non-Yond productivity skills.

| Skill | Description |
|-------|-------------|
| `issue-documenter` | Documents user stories and bug reports as GitHub Issues with investigation tooling, filing them via `gh` with the `priority` label and parented to an epic |
| `issue-executor` | End-to-end issue resolution orchestrator — takes a Linear issue URL, classifies bug vs story, routes bugs to lightweight (single-agent) or full (agent team) flow with flexible verification, and drives it to a reviewable PR |
| `loose-ends` | Audits what merged PRs declared but never performed — unticked handover checklist steps, env vars declared in `docs/env-registry.json` but never set on Vercel/Render, and migrations applied to staging but not production. Scopes by exact branch comparison (on `origin/staging`, not on `origin/main`), verifies what is mechanically checkable, and batches every tick or deferral onto one `chore/close-loose-ends-YYYY-MM-DD` PR. Reports could-not-check honestly instead of rendering a failed check as a pass; never applies migrations or writes env values |
| `verify-spec` | Checks a design spec's factual claims against the codebase before anyone implements it. Extracts every assertion about what exists, what a file does, what a command produces and what the numbers are, then verifies each with a command and reports verified / refuted / unverifiable. Built around the failure it exists to catch: a claim that X reads or writes Y is only verified by finding the read or the write, never by confirming Y exists or that some other caller touches it. Refuted claims block the implementation plan; unverifiable ones are recorded in the spec as named assumptions rather than quietly assumed true |
| `tldr` | Replaces the end-of-task wall of prose with four fixed blocks — a two-line verdict, what the user must do, what went wrong, what shipped — under hard length ceilings, with the depth linked rather than inlined. Every required action carries an escalation tier (🔴 broken or blocked, 🟠 breaks at a named upcoming event, 🔵 nothing degrades if it waits) and the section header takes the highest tier present, so the worst thing in the block reads before any item does. Repeated items are marked with a count and must be justified or demoted by the third briefing. Each item may carry one optional indented detail line saying what breaks if it is skipped, so titles stay skimmable and reasoning stays opt-in. Fires on merges, migrations, infra changes and multi-step investigations; stays silent for questions and trivial edits |
| `in-flight` | Shows what work is actually in flight across every branch and worktree of a repo, and what each piece is waiting on — sorted into live (a session is on it now), review (open PR, with its blocker named: red CI, conflicts, changes requested, or just waiting for a merge), stalled (unmerged commits, no PR) and landed (merged, worktree still on disk). Detects squash merges by patch equivalence rather than commit count, so branches that already shipped stop reading as abandoned work; flags commits that exist on one machine only and worktrees holding undrained loose ends. Read-only, network-free, and silent when nothing is outstanding, so it suits a SessionStart hook |
| `text-humanizer` | Removes signs of AI-generated writing from text using Wikipedia's "Signs of AI writing" patterns |
| `custom-demo-page-builder` | Researches a prospect (light WebFetch), brainstorms a TeliTask `/for/<slug>` custom demo page around the calls that specific business actually makes or takes, applies brand voice, and seeds rows to Supabase via MCP (asks production vs staging each run, defaults to production) — including the dedicated CTA fields (phone/WhatsApp/email) and `country` (drives the AI accent). Carries no built-in wedge and never puts a price on the page; these pages are discovery instruments that ask for a correction rather than close |

### archive-ready `v0.3.1`

A mod that draws two lines above the prompt: the session's state, then the goal it serves.

```
✗ Not ready  ·  Context 27% (265k/1000k)
◎ Goal map mod ▸ 5/7  next: you Run /goal-map-backfill 7
```

- Ready means the session is safe to archive: no open question, nothing running, nothing
  uncommitted or unpushed, and no unticked step under this goal's heading in `TASKS.md`.
  `/archive-check` lists the reasons.
- The goal and detour come from `goal-map`'s session file. The steps come from the `## <goal>`
  heading in `TASKS.md` that matches it. Press `▸` to expand the checklist: ticks, detours nested
  under the step they interrupted, live PR state for any `(#N)` or `(owner/repo#N)` in a step, `@me` steps marked
  "waiting on you", and one line naming the other live goals.
- When every step is ticked and every linked PR is merged, the bar offers `/goal-done`.

TASKS.md format:

```
## Goal map mod
- [x] Build the goal-map mod (#74)
  - [x] detour: move archive-ready into the tools repo (#76)
- [ ] @me Run /goal-map-backfill 7 and check the map
```

### goal-map `v0.2.1`

A mod (function hooks, not a skill) that keeps one map of what you are working on across every
Claude Code session. Each session writes its own record to `~/.claude/goal-map/`; any session can
draw all of them.

- Each human prompt is sorted by Haiku into one of four kinds: a new goal, more of the same goal,
  a detour, or a return from a detour. A new session joins an open goal when it is the same work,
  so related sessions share one lane.
- The goal, and the detour topic while you are on one, show in the line above the prompt, next to
  context, through the `archive-ready` mod, which reads this mod's session file. A toast fires
  when a detour starts.
- `/goal-map` opens a pane. On desktop it is a GitKraken-style graph: one coloured column per goal,
  dashed side branches for detours, PRs as open or merged dots, and orange `?` for questions waiting
  on you. The terminal gets the same content as a text tree.
- The "Waiting on you" tab lists these: questions sessions left you, `@me` steps in each live session's `TASKS.md`, PRs ready to merge, founder-click
  PRs, CI failing on your own PRs, `needs-decision` issues, and duplicate PRs (an open PR fixing an
  issue another PR already fixed).
- Commands: `/goal <title>` names or renames the goal, `/goal-done` closes it, and
  `/goal-map-backfill [days]` imports past sessions from their transcripts.

### delivery-tools `v0.23.0`

Turns a design export into one pull request built by agents. Since 0.4.0 the default is
**picture mode**: one builder agent builds the page from the design pictures, reviewer agents
compare pictures of the live page with the design, and at most two fix rounds follow. Scripts only
do the fixed jobs: rendering the design, seeding test data, signing in, walking to each state,
taking the pictures, listing buttons, and CI. They never judge whether a page matches. On the
knowledge-page redesign, the older full mode spent about two days and left 27 of 66 states
matching the design; three and a half more hours of this loop took it to 42. Since 0.5.0 a run
can check the phone width (390 px) as well as the desktop: the map declares `"widths": ["desktop",
"phone"]`, and every state is pictured, reviewed and counted at both. Since 0.6.0 every behaviour the briefs
state is a numbered rule in `rules.json`, shown by a design state, proved by a test named after it,
or cut; `delivery rules` lists the gaps and `delivery ready` stays red while one is open. Since
0.7.0 a page already built gets an update run (`intake --from <feature>`) that starts from the
earlier run's map and pictures the page before building, so only what the design changed is fixed. Since
0.8.0 a world file may name a row that comes later in it, so two tables that point at each other can be
seeded: the seed writes that column empty, then fills it once every row is there. Since 0.9.0 a
design component is built once from `docs/delivery/components.json` and every page imports it
instead of redrawing it, `delivery ready` refuses a screen whose component isn't built or a file
that bypasses one, and briefs are written, checked, packed, sent and reviewed against a design
export through the CLI rather than by hand. Since 0.9.1, three fixes the first real components run
hit: `intake --components` run from inside another run's own worktree no longer adopts that
worktree's feature and overwrites its snapshot; the components world it seeds carries a fixture
email, `kind` and `orgName` (copying an organisation-row template from a sibling run's world file
when the repo has one) instead of a world `seed --check` refused and `seed --plan` crashed on; and
the mapper brief greps file names, not only contents, before filling `replaces`. Since 0.9.2, `ready`
no longer counts the design snapshot's own files as redrawn components. Since 0.10.0 a run
finds its slow parts before they cost a round: each map state lists the data its picture needs and
`seed --check` names a state whose world lacks it (reviews label those "data gap", not "to fix");
`seed --plan` lists every seed guard to approve at the start and refuses a value the database's
CHECK or enum rules would reject; the rules pass runs straight after intake and the builder waits
while a rule is owed to the design; picture mode names its own `picture-builder` agent; `design
render` refuses two states with the same picture and applies presets as a prop change after boot; `shoot` crops
components with the element itself, re-seeds between the desktop and phone shot of a state that
changes data, and takes a machine-wide slot (`delivery slot`), at most two at a time. Since 0.11.0
`delivery prepush` fails before the first push on a removed test id or text the base branch's plans
or e2e specs name, an organisation-scoped table missing from the profile's retirement and erasure
lists, a branch behind its base, or an unbuilt component; and `review --plan` writes the reviewer
batches itself (20 items, desktop and phone together, four at once, the run's `steers.md` appended),
carries forward any item whose pictures did not change, and matches without a reviewer only when
text, test ids and buttons agree exactly and under 0.5% of pixels differ. Since 0.11.1 `ready`
no longer rewrites `baseline.json` when the base moved but added nothing, which had kept it
failing its own `head` check. Since 0.12.0 the system improves itself: `delivery retro`, run by
`land` at the end of each run, writes one record per run to `docs/delivery/runs.jsonl`, turns a
slowdown seen in two runs (or an hour lost in one) into a proposal, applies only small changes (a
number in `tunables.json` that does not loosen a check, a steer, a brief sentence, a new warning;
under 50 lines) through a PR, files every large one as a `needs-decision` issue for the founder, and
reverts an automatic change that made its number worse two runs running. Since 0.13.0 a project
can name a shadow grader in its profile (`review.shadowGrader`): `review` records that model's
code bug / data gap / known steer answer for every finding in `rounds/<n>/shadow.json` without
ever changing a verdict, and `review --shadow-export` splits the answers from the findings so they
can be scored against blind labels. Since 0.13.1 `shoot` waits after each reach step until the
requests that step started have answered (500 ms of quiet, at most 10 s), so a save is pictured
after it finishes, not while its dialog is still pending. Since 0.13.2 a world's `today` resolves in
the profile's `testData.timeZone`, and `shoot` refuses a dev server whose build output a production
build replaced, before and after it pictures. Since 0.13.3 a reach step's test id matches exactly
before it falls back to that id's numbered rows, so `editor-save` no longer clicks
`editor-save-status`. Since 0.13.4 a `preset` reach changes the design component's props after
boot rather than its state, so a design's `componentDidUpdate` sees the change. Since 0.14.0
every run is measured and each job runs on the model that fits it: `land` runs the retro and
refuses to close the epic until the run's line in `runs.jsonl` is committed; the line records per
phase the models used, agent tokens and estimated cost, every agent's role, model, effort, minutes,
tokens and outcome (a `SubagentStop` hook captures them from the transcripts), and founder and slot
waits; `delivery runs` prints the cross-run table (time by phase, time and cost by model, rounds to
green, match rate per round) and `delivery backfill-run` records an earlier run as an estimate.
`models.json` names each role's model and effort, which the retro may propose changing but never
changes: extractors Sonnet at low; the rules, map, seed-world and CI-fix jobs a Sonnet worker at
medium; the first build Opus at high, leaving a notes file for each fix round's fresh Sonnet fixer;
reviewers Sonnet at medium with `delivery crop` for a close look; the full-mode auditor Sonnet at
high. Every Sonnet role that edits runs a real check before it reports done. Since 0.15.0 the
live page is seeded with the design's own data: `delivery contract` takes every text each design
state shows from the render's DOM into `contract.json`, a Sonnet extractor at low labels each one
data, fixed words or random, and `seed --check` refuses a data value no world holds, a count the
rows don't add up to, or a fixture user without the design's name, before anything is built. Rows
whose times tie get distinct seconds in the design's order, a state whose design contradicts
itself goes back to Claude Design, and `design render` rebuilds the contract on every new export.
Since 0.16.0 `shoot` resets each world to its seed right before its shots (and again after a
data-changing shot) and freezes the browser clock at that moment in the profile's time zone; a
world whose reset the safety scan refuses is not pictured. Each difference in a contract data value
is looked up in the world: missing rows are a data gap for the seed worker, rows present a must fix
for the fixer, and dates are compared by format. `shoot --only <items|data-gaps>` re-shoots into
the same round, `review --plan` then reviews just those items, and `delivery runs` prints data gaps
per round, the plan's measure of success. Since 0.17.0 the worlds are protected from what changes
under them: `seed --check` refuses a table the worlds write whose columns changed since `seed
--plan` and a world named like another run's fixture organisation; a world file lists the shared
rows it reads as `globals`, hashed at `seed --apply`, and `shoot` warns when one changed; and a
value no seed can pin is masked by test id on both pictures, listed in the checklist and counted
per round in the ledger and in `delivery runs`. Since 0.18.0 the design pictures are right and
the page loads before it is pictured: `design candidates` finds a design's preset table (a method
that indexes a top-level `const T = {...}`, called as `this.m(this.props.P)`) and lists one
`preset` candidate per key, which `design render` draws with no hand edits; intake ignores a
duplicate `_bundle_src.dc.html`; the render warns when a state's page is mostly an iframe or its
reach sets a prop named like a state key. The new `delivery smoke` opens every route the map
reaches, signed in, at every width, and fails at the first status of 500 or more, error overlay,
replaced build output, or loading placeholder still there after 10 s. `shoot` runs it first and
pictures nothing when it fails, and a server that breaks during a shoot deletes that round's
folder so its number is reused. The builder and fixer report done only once smoke passes. Since
0.19.0 the pictures show the right data every time: the contract gains a `row` key per value, a
`generated` kind checked by shape, and a `none` label for a value the product doesn't store, which
the founder decides once, before the build, from one list (`delivery contract --questions`, then
`--decide build|drop|design`). `delivery seed --from-trace` writes the world rows from the contract
(safe emails and organisation names, recorded in `swaps.json`), and `seed --need "<STATE>: <what>"`
answers any agent in one line. `seed --plan` refuses a column the table lacks, a wrong type or an
enum value the database doesn't list, and runs the profile's optional `commands.validateSeedJson`
on Json columns; `seed --check` refuses a seeded table a side-effect rule watches with no guard;
`seed --refresh` cleans every table the world ever seeded. The shoot resets the world before every
state that saves, saves each item's live text, and runs datacheck: every traced value is looked for
in the page's text, and a miss the world lacks is a `data-fault`, fixed by the seed-writer and
re-shot (`shoot --only data-faults`) before any reviewer looks. `delivery datacheck` re-sorts a
round without shooting. A round with only data faults left never ships, a traced column no query
selects becomes a founder question, a `clock: true` state's world must use relative times, and the
design render uses the profile's time zone. The pre-bash hook judges a seed-named script by
whether it writes to a database, not by its name. Since 0.20.0 there is no fixed round cap:
fix rounds go on while the count of items to fix falls, the run ships at zero, and after two rounds
with no fall (or eight in all) only the stuck items go to the founder in `stuck.md`; NEXT and
`ready` share the rule. Late rounds are cheap: a fix round shoots only routes whose files changed
(the map's `sources`), and earlier-passing items whose picture changed are sampled per screen, the
rest held and reviewed once before shipping (`review --plan --held`). Since 0.21.0 shoots are
faster: `shoot --prod` pictures a production build from the profile's optional
`commands.prodServer` (built in the heavy slot, on its own port, so the dev server keeps running), a
failed build stops the shoot, worlds are shot two at a time in their own browser contexts, and the
waits are tunables with a 3 s click timeout. Since 0.22.0 reviews agree between rounds: a
Sonnet extractor writes `steers.md` from the design before round 1 (phone patterns, test data,
rules over the picture), and update runs carry it; the crop hides only the phone tab bar (the
profile's optional `picture.tabBar`, never a sheet) and cuts the design and live pictures at the
same top edge (`picture.keepPhoneHeader` keeps the phone header); and reviewers read a facts file
under 2 KB per item instead of `shoot.json`. Since 0.23.0 shipping is checked earlier: `delivery
map` warns about test ids the redesign will retire (so the skip PR goes up during the build) and
about other open runs changing the same function, message files or navigation config; prepush
refuses a function two runs redefine and ignores ids in skipped tests; land reads commit statuses
(a failed Vercel build) and runs the optional `commands.stagingE2e`. A design above 120 states gets
a proposal to split into one run per screen group, the first builder works one screen group per
dispatch, extractors run at Sonnet medium, and `models.json` carries a recorded experiment (the
first builder at Opus medium for one run). An export
holds the whole design project; a run
builds only the screens its sentence names. A project enables it in its own
`.claude/settings.json` and supplies a profile and a safety file; how to install it, start a run
and keep it current is in [`delivery-tools/docs/OPERATING.md`](delivery-tools/docs/OPERATING.md).

**Agents:**

| Agent | Description |
|-------|-------------|
| `delivery-extractor` | Reads a design export or a Scope reply and writes one part file (Sonnet at medium): the inventory, the contract labels, the steers. Runs nothing, opens no browser, and takes every word from a render rather than from the design's source |
| `picture-builder` | Picture mode: the first build, Opus at high, in the run's own worktree so the dev server serves its changes; commits its own work and keeps `builder-notes.md` |
| `picture-builder-medium` | The same first build at Opus medium: the builder experiment `models.json` names, for one run, recorded in the ledger |
| `picture-fixer` | Picture mode: one fresh fixer per fix round, Sonnet at medium, from the round's review and the builder's notes; runs a real check before it reports done |
| `picture-reviewer` | Picture mode: compares one batch of live and design pictures, Sonnet at medium, with `delivery crop` for a close look |
| `delivery-worker` | The rules, map, seed-world and CI-fix jobs, Sonnet at medium, told its role on the prompt's first line; done means its check passes |
| `delivery-builder` | Full mode: builds one unit of the coverage plan in its own worktree and reports back (Sonnet at medium) |
| `delivery-builder-opus` | Full mode: the contract unit and high-risk units (Opus at high) |
| `delivery-auditor` | Full mode: judges captured screens against the design and writes findings (Sonnet at high, with `delivery crop`) |

Which agent, model and effort each role uses is in `delivery-tools/models.json`. The briefs:
`briefs/builder-picture.md` (builder and fixer), `briefs/reviewer-picture.md`, `briefs/mapper.md`,
`briefs/rules.md`, `briefs/seed-writer.md`, `briefs/contract-labeller.md` and `briefs/ci-fixer.md`; a components run's mapper
uses `briefs/components-mapper.md`.

**Skills:**

| Skill | Description |
|-------|-------------|
| `deliver-from-design` | The umbrella: intake, preflight, then the design pictures and the picture loop. Full mode only when the founder asks for it by name |
| `design-inventory` | Renders every in-scope design state to a picture (picture mode stops there); in full mode, also lists every word and control and what the old page does |
| `picture-build` | The picture loop: the button map, test worlds, one builder, full-height pictures of the page's own area at every width the map declares (desktop, phone), reviewer agents, a comparison page, at most two fix rounds, and shipping |
| `design-send` | Hands a checked, packed design brief to Claude Design in the in-app browser and records when it was sent |
| `coverage-plan` | Full mode: one row per state and per capability, each with a class, an owning unit and how a capture reaches it |
| `epic-build` | Full mode: parallel builders, wave by wave, into one integration branch |
| `design-audit` | Full mode: graded captures with severity floors |

**CLI:** `delivery <command>`, 58 commands. Picture mode uses `map` (check the button map and
write the checklist; `--from-plan` converts a full-mode run), `seed` (`--refresh all` resets every
world), `shoot` (full-height pictures of the page area next to the cropped design, at desktop and phone
widths, a button check, a sideways-scroll check on the phone, data-changing states last), `review` (the reviewers' notes into `review.json` and a comparison
page) and `sign-in` (a one-time link that signs a person in as a world's test user). `delivery status` prints the one NEXT line the run is steered by. Since 0.9.0: `components`
(the product-wide component map, checked against the repo and a design export), `design review`
(compares a new export with the run's snapshot, headlessly) and `brief new|check|pack|sent` (write,
check, pack and record a design brief from `templates/design-brief.md`). Since 0.14.0: `runs` (the
cross-run table), `backfill-run` (an estimated ledger line for an earlier run), `log-agent` and
`log-wait` (an agent or a wait the hook did not record), `crop` (the same box of two pictures,
scaled up) and `hook subagent-stop`. Since 0.15.0: `contract` (every text each design state shows,
labelled, so `seed --check` can refuse a world that lacks the design's data).

## Releases

Releases are automated via GitHub Actions. When a plugin version is bumped in `plugin.json` and pushed to `main`, a GitHub Release is created automatically with the tag `{plugin-name}/v{version}`.

## License

MIT
