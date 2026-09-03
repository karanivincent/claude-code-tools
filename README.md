# Yond Marketplace

A Claude Code plugin marketplace with tools for frontend development, GitHub workflows, and developer productivity.

## Installation

### Method 1: Using `/plugin` commands (recommended)

Run these commands in Claude Code:

```
/plugin marketplace add karanivincent/claude-code-tools
/plugin install frontend-tools@vince-tools-marketplace
/plugin install general-tools@vince-tools-marketplace
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

## Releases

Releases are automated via GitHub Actions. When a plugin version is bumped in `plugin.json` and pushed to `main`, a GitHub Release is created automatically with the tag `{plugin-name}/v{version}`.

## License

MIT
