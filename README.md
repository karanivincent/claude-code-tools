# Claude Code Tools Marketplace

A Claude Code plugin marketplace with tools for frontend development, testing, GitHub workflows, and developer productivity.

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
    "frontend-tools@yond-marketplace": true,
    "general-tools@yond-marketplace": true
  }
}
```

## Available Plugins

### frontend-tools

Comprehensive toolkit for frontend development with SvelteKit, testing, and GitHub workflows.

**Agents:**

| Agent | Description |
|-------|-------------|
| `gather-codebase-context` | Research-only agent that explores and documents codebase context |
| `github-fetch-agent` | Fetches and processes GitHub data |
| `failure-mapper` | Maps all failures in failing E2E tests for systematic fixing |
| `manual-tester` | Explores features using Playwright MCP to document interactive elements |
| `testid-fixer` | Adds testId prop support to Svelte components |

**Skills:**

| Skill | Description |
|-------|-------------|
| `research-and-planning` | Orchestrates multi-agent research and parallel planning workflows |
| `skill-creator` | Creates, edits, and troubleshoots Claude Code Skills |
| `claude-md-editor` | Creates, reviews, and optimizes CLAUDE.md configuration files |
| `github-pr-creator` | Creates GitHub PRs with focused descriptions and CI monitoring |
| `test-maintenance` | Fixes failing E2E/unit tests using systematic workflows |
| `sveltekit-testing-skill` | Testing standards for SvelteKit (Vitest + Playwright) |
| `user-story-breakdown` | Transforms user stories into actionable task breakdowns |
| `github-workflow` | Manages GitHub Issues through full lifecycle |
| `slack-pr-message` | Generates Slack announcement messages for PRs |

**MCP Servers:**
- `playwright` - Browser automation for testing

---

### general-tools

General-purpose tools for git workflows and developer productivity.

**Skills:**

| Skill | Description |
|-------|-------------|
| `branch-cleanup` | Cleans up stale git branches (merged or abandoned) |

**MCP Servers:**
- `context7` - Library documentation lookup
- `notionMCP` - Notion integration

## Structure

```
claude-code-tools/
├── .claude-plugin/
│   └── marketplace.json
├── frontend-tools/
│   ├── .claude-plugin/
│   │   └── plugin.json
│   ├── agents/
│   │   ├── gather-codebase-context.md
│   │   ├── github-fetch-agent.md
│   │   ├── failure-mapper.md
│   │   ├── manual-tester.md
│   │   └── testid-fixer.md
│   └── skills/
│       ├── research-and-planning/
│       ├── skill-creator/
│       ├── claude-md-editor/
│       ├── github-pr-creator/
│       ├── test-maintenance/
│       ├── sveltekit-testing-skill/
│       ├── user-story-breakdown/
│       ├── github-workflow/
│       └── slack-pr-message/
├── general-tools/
│   ├── .claude-plugin/
│   │   └── plugin.json
│   └── skills/
│       └── branch-cleanup/
├── CLAUDE.md
└── README.md
```

## License

MIT
