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

### frontend-tools `v1.6.0`

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
| `research-and-planning` | Orchestrates multi-agent research and parallel planning workflows |
| `skill-creator` | Creates, edits, and troubleshoots Claude Code Skills |
| `claude-md-editor` | Creates, reviews, and optimizes CLAUDE.md configuration files |
| `github-pr-creator` | Creates GitHub PRs with focused descriptions and CI monitoring |
| `review-pr` | AI code review using patterns learned from team review history |
| `resolve-pr-comments` | Systematically processes PR review comments with critical analysis |
| `test-maintenance` | Fixes failing E2E/unit tests using systematic workflows |
| `sveltekit-testing-skill` | Testing standards for SvelteKit (Vitest + Playwright) |
| `user-story-breakdown` | Transforms user stories into actionable task breakdowns |
| `github-workflow` | Manages GitHub Issues through full lifecycle |
| `github-issue-images` | Downloads images attached to GitHub issues for design review |
| `slack-pr-message` | Generates Slack announcement messages for PRs |

### general-tools `v1.1.0`

General-purpose skills for git workflows and developer productivity.

| Skill | Description |
|-------|-------------|
| `branch-cleanup` | Cleans up stale git branches (merged or abandoned) |
| `autocompact-threshold` | Sets the autocompact threshold percentage for context management |

## License

MIT
