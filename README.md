# Yond Marketplace

A Claude Code plugin marketplace with tools for frontend development, GitHub workflows, and developer productivity.

## Installation

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

### frontend-tools `v1.7.0`

Agents and skills for codebase research, PR workflows, testing, planning, and skill development.

**Agents:**

| Agent | Description |
|-------|-------------|
| `gather-codebase-context` | Explores and documents codebase context for a proposed change |
| `github-fetch-agent` | Fetches and processes GitHub data (PR comments, reviews, issue discussions) |
| `failure-mapper` | Maps all failures in a failing E2E test for systematic fixing |
| `manual-tester` | Explores features using Playwright MCP to document interactive elements |
| `testid-fixer` | Adds testId prop support to Svelte components |

**Skills:**

| Skill | Description |
|-------|-------------|
| `feature-planner` | Orchestrates multi-agent research and parallel planning workflows |
| `skill-creator` | Creates, edits, and troubleshoots Claude Code Skills |
| `claudemd-editor` | Creates, reviews, and optimizes CLAUDE.md configuration files |
| `pr-creator` | Creates GitHub PRs with focused descriptions and CI monitoring |
| `pr-reviewer` | AI code review using patterns learned from team review history |
| `pr-comment-resolver` | Systematically processes PR review comments with critical analysis |
| `test-fixer` | Fixes failing E2E/unit tests using systematic workflows |
| `sveltekit-test-guide` | Testing standards for SvelteKit (Vitest + Playwright) |
| `story-breakdown` | Transforms user stories into actionable task breakdowns |
| `issue-workflow` | Manages GitHub Issues through full lifecycle |
| `github-image-downloader` | Downloads images attached to GitHub issues for design review |
| `pr-slack-announcer` | Generates and auto-posts Slack announcement messages for PRs |

### general-tools `v1.8.0`

General-purpose skills for git workflows and developer productivity.

| Skill | Description |
|-------|-------------|
| `branch-cleanup` | Cleans up stale git branches (merged or abandoned) |
| `autocompact-threshold` | Sets the autocompact threshold percentage for context management |
| `env-sync` | Manages env vars across monorepo workspaces and deployment services with a central registry, alias detection, and Vercel/Render MCP sync |
| `design-implementer` | Orchestrates parallel implementation of a design document using agent teams, umbrella branch pattern, and isolated worktrees |
| `issue-documenter` | Documents user stories and bug reports for Linear with investigation tooling and automatic issue creation |
| `issue-executor` | End-to-end issue resolution orchestrator — takes a Linear issue URL, classifies bug vs story, and drives it to a reviewable PR |
| `skill-reviewer` | Reviews skills after real-world usage with scored reports and actionable recommendations |

## License

MIT
