---
name: loose-ends
description: >
  Audit what merged PRs declared but never performed, then help close each item. Checks three
  sources: unticked manual steps in handover docs, environment variables declared in the env
  registry but never set on the hosting platforms, and migrations applied to staging but not
  production. Triggers: "/loose-ends", "loose ends", "what did we forget to do",
  "did anyone ever run the manual steps", "check the handover checklists", "env drift",
  "is production behind staging", "migration drift", "audit unfinished work before a release".
  It reports and assists only — it never applies migrations, writes env values, or blocks a merge.
argument-hint: "[--all] [--deferred]"
---

# Loose Ends

Work a PR declares but does not perform gets lost at merge. This skill reads the three places
that record it — handover checklists, the env registry, the two databases' migration state —
reports what is genuinely open, and helps close each item.

**This is a triage tool, not a linter.** A report that only lists problems gets ignored by the
second week, especially when most items are already done and merely unticked. The primary job
is making items cheap to close, so the ledger becomes trustworthy.

**Announce at start:** "I'm using the loose-ends skill to audit unfinished work from merged PRs."

## When to use

- Before a staging → main release, to see what is riding along unverified
- After a run of merges, as a periodic sweep
- When the user asks what was promised but never done

## When NOT to use

- To gate or block a merge. It has to prove it produces a trustworthy signal first.
- To apply migrations or write env var values. Those stay deliberate human actions.
- To police unmerged feature branches. Unticked boxes there are pending work, not debt.

## What the project must provide

| Source | Expected location | If it is missing |
|--------|-------------------|------------------|
| Handovers | `docs/handovers/*.md`, one per PR, using `- [ ]` checkboxes | Ask for the real path, pass `--dir`. Do not invent one. |
| Env registry | `docs/env-registry.json` with `files[].deployment` / `deploymentId` and `variables[].deployments` | Report check 2 as could-not-check |
| Database project ids | Named in the project's own `CLAUDE.md` (or `supabase/config.toml`) | Ask the user. **Never guess a project id.** |
| Branches | An integration branch (`origin/staging`) and a release branch (`origin/main`) | Ask which branches this project uses, pass `--integration-ref` / `--release-ref` |

**Never hardcode project ids, service ids, or tokens into this skill or into a run.** Read them
from the invoking project's config every time. Different repos, different infrastructure.

Scripts live in `${CLAUDE_PLUGIN_ROOT}/skills/loose-ends/scripts/`. Set `SCRIPTS` to that path
once at the start of a run; if the variable is unset, resolve the path relative to this SKILL.md.

## Scoping

Default scope is handovers present on `origin/staging` but **not** on `origin/main` — work merged
but not yet released. That window is where unreleased risk lives.

This is an exact branch comparison. Do **not** approximate it with dates, tags, or "recent"
files: a handover is committed on its feature branch, so its presence on the integration branch
is what proves the PR merged, and its absence from the release branch is what proves it is
unreleased.

`--all` widens to every handover on the integration branch, released ones included.

## Check 1 — handover checkboxes

```bash
python3 "$SCRIPTS/scan-handovers.py" --repo . --fetch          # default scope
python3 "$SCRIPTS/scan-handovers.py" --repo . --fetch --all    # every handover
```

The script is read-only. It emits JSON: per file, the `open`, `deferred`, and `ticked` counts,
and for each item its `line`, `end_line`, and text. It reads file content from the integration
branch, not the working tree, so it is correct even when checked out on a feature branch.

Exit code 2 means could-not-check — a missing ref, a wrong directory. Report it as such and never
render it as a pass.

Wrapped items span several lines: `line` is where the `- [ ]` sits, `end_line` is where its text
ends. Tick on `line`; append a deferral marker at the end of `end_line`.

## Check 2 — env drift

```bash
python3 "$SCRIPTS/env-drift.py" --repo . --registry docs/env-registry.json
```

Reads the registry, then asks each platform which variable **names** it holds:

- **Vercel** via `vercel env ls`, run in the directory holding that app's `.vercel` link
- **Render** via the REST API, which needs `RENDER_API_KEY` in the shell

**Names only. Never read, print, log, or compare values** — presence is the whole signal, and
comparing secrets would put them in the transcript. Do not "fix" a missing variable by pulling a
value from another environment; report it and let the user set it.

Exit code 1 means at least one platform could not be checked. When `RENDER_API_KEY` is absent the
report names the missing key and reports could-not-check for that service. Render usually holds
the majority of variables, so silently skipping it would make a clean report meaningless.

Variables with no deployment target are listed under `untargeted` — unverifiable, not drift, since
nothing claims to hold them. `unmapped` means a variable names a platform that no registry file
entry points at; that is a registry bug worth mentioning once.

Env groups and dashboard-only variables that the registry does not declare come back as
`extra_on_platform`. Report the count, not each name, unless the user asks.

## Check 3 — migration drift

1. Find the staging and production project ids in the invoking project's own docs:

   ```bash
   grep -niE "project id|supabase.*(staging|production)" CLAUDE.md docs/*.md 2>/dev/null | head
   ```

   If both ids are not stated unambiguously, ask the user. Do not infer them from a URL in an
   unrelated file, and do not guess from `list_projects` names alone.

2. Load the Supabase MCP tools (`ToolSearch` with `+supabase list_migrations`) and call
   `list_migrations` once per project id.

3. Compare the version lists:
   - **Staging ahead of production** — the normal finding. Report the count and the oldest pending
     version, in apply order.
   - **Production ahead of staging** — an anomaly. It means something was applied straight to
     production outside the release flow, which most projects' rules forbid. Surface it loudly at
     the top of the report rather than assuming it cannot happen.

Never call `apply_migration` from this skill, on either project. Reporting is the whole job.

## Item states

| State | Looks like | Meaning |
|-------|-----------|---------|
| Open | `- [ ] Thing` | Unticked, no marker. Needs triage. |
| Verified | `- [ ] Thing` + evidence | Checked mechanically this run and it passed. Offer to tick it. |
| Ticked | `- [x] Thing` | Confirmed done. Written back via PR, never straight to the branch. |
| Deferred | `- [ ] Thing <!-- deferred: … -->` | Consciously not doing it now. Hidden from the main report, kept as a count. |

Deferral marker — a trailing HTML comment, date first, then a short reason:

```markdown
- [ ] Deregister the Telegram bot webhook <!-- deferred: 2026-08-21 low priority, bot is dormant -->
```

An HTML comment keeps GitHub rendering the line cleanly, leaves the box honestly unticked, and
keeps the reason next to the item. Do not invent a new checkbox glyph, a separate ledger file, or
a front-matter block.

## Triage loop

For each open item, decide whether its text describes something mechanically checkable. This is
judgment, not pattern matching: "existing calls still show in the dashboard, all owned by TeliTask
Internal" is a SQL query to a reader who understands the schema, and unparseable to a regex.

| Item shape | Action |
|-----------|--------|
| Checkable — a row exists, a column is populated, a file is deployed, an endpoint answers | Run the check. Show the evidence (the query and its result), then offer to tick. |
| Needs a human — a live call, a visual check, an account only the user can open | Mark `[needs you]`. Offer to defer with a reason. |
| Already false — the feature was since removed, the step no longer applies | Offer to tick with a note, or delete the line if the whole section is obsolete. |

Ask before writing anything. A verified item is an offer to tick, never an automatic tick — the
value of this ledger is that a tick means someone confirmed it.

## Write-back rule

Edits go to handover markdown, and handovers live on branches the project forbids committing to
directly. So:

1. Branch from the integration branch: `git checkout -b chore/close-loose-ends-YYYY-MM-DD origin/staging`
2. Apply **every** edit from this run — ticks, deferral markers, deletions — on that branch
3. `git add` the specific handover paths. Never `git add .` or `git add -A`.
4. Commit, push, open a PR against the integration branch listing what was ticked and what was
   deferred, with the evidence for each tick
5. Leave it for the user to merge

One run produces one small, reviewable PR. **Never commit to `staging` or `main` directly**, and
never push a tick without the evidence that justified it.

## First run

A repo adopting this will have hundreds of open boxes — mostly stale aspirational checklists in
long-released handovers. They cannot be triaged interactively.

On the first run, offer a one-time bulk **deferral** (not a tick) of every open box in handovers
already on the release branch:

```markdown
<!-- deferred: YYYY-MM-DD historical, bulk-deferred at audit introduction -->
```

Deferring is the honest move: it records that these were never confirmed, instead of falsely
asserting they were done. Ask before doing it, say how many items it will touch, and ship it as
its own `chore/close-loose-ends-YYYY-MM-DD` PR, separate from any triage of live items.

That collapses the backlog to the current unreleased window, and every later run works on a
small, real list.

## Output

Short, grouped, most consequential first, with counts. The header states how many checks ran and
how many could not complete.

```
Loose ends — 3 checks run, 1 could not complete

Migrations         14 pending on production (staging is ahead)
                   oldest: 20260820083452_drop_personal_assistant_tables

Handover items     10 open across 1 merged handover since last release
                   2026-08-20-organisation-tenancy  10 open, 0 deferred
                     - Existing calls owned by "TeliTask Internal"     [verifiable]
                     - A second org cannot see the first's contacts    [needs you]
                     ...

Env vars           Vercel  33/33 present
                   Render  COULD NOT CHECK — RENDER_API_KEY not set

Deferred           4 items hidden (run with --deferred to see them)
```

`--deferred` lists the hidden items with their dates and reasons instead of just counting them.

## Reporting failure honestly

Every check reports exactly one of three outcomes:

1. **Reached and passed** — the check ran and found nothing open
2. **Reached and found problems** — the check ran and here is the list
3. **Could not check** — name what was missing (`RENDER_API_KEY`, a ref, a project id) and what
   would fix it

A check that errored must never be rendered as passing, must never be silently dropped from the
report, and must never be summarised as "no issues found". If any check could not complete, the
header says so. Green must mean verified green, otherwise this manufactures the exact false
confidence it exists to prevent.

## Red flags

**Never:**
- Tick a box without evidence, or tick without asking
- Commit to `staging` or `main`, or use `git add .`
- Apply a migration, or write an env var value
- Read, print, or compare env var values
- Hardcode a project id, service id, or token
- Count an unmerged branch's unticked boxes as debt
- Report a failed check as a pass, or drop it from the report

**Always:**
- Scope by exact branch comparison, never by date
- Batch a run's edits onto one `chore/close-loose-ends-YYYY-MM-DD` branch and open a PR
- Show the evidence beside every verified item
- Name the missing prerequisite when a check cannot run
- Defer rather than tick when nobody actually confirmed the item
