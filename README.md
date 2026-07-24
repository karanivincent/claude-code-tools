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

### general-tools `v1.17.0`

Linear issue workflows and non-Yond productivity skills.

| Skill | Description |
|-------|-------------|
| `issue-documenter` | Documents user stories and bug reports for Linear with investigation tooling and automatic issue creation |
| `issue-executor` | End-to-end issue resolution orchestrator — takes a Linear issue URL, classifies bug vs story, routes bugs to lightweight (single-agent) or full (agent team) flow with flexible verification, and drives it to a reviewable PR |
| `text-humanizer` | Removes signs of AI-generated writing from text using Wikipedia's "Signs of AI writing" patterns |
| `custom-demo-page-builder` | Researches a prospect (light WebFetch), brainstorms a TeliTask `/for/<slug>` custom demo page around the calls that specific business actually makes or takes, applies brand voice, and seeds rows to Supabase via MCP (asks production vs staging each run, defaults to production) — including the dedicated CTA fields (phone/WhatsApp/email) and `country` (drives the AI accent). Carries no built-in wedge and never puts a price on the page; these pages are discovery instruments that ask for a correction rather than close |

## Releases

Releases are automated via GitHub Actions. When a plugin version is bumped in `plugin.json` and pushed to `main`, a GitHub Release is created automatically with the tag `{plugin-name}/v{version}`.

## License

MIT
