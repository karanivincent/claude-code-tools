# Yond Claude Code Marketplace

A Claude Code plugin marketplace hosting the `frontend-tools` plugin.

## Installation

To use this marketplace, add it to your project's `.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "yond": {
      "source": {
        "source": "github",
        "repo": "your-org/test-marketplace"
      }
    }
  },
  "enabledPlugins": {
    "frontend-tools@yond": true
  }
}
```

## Available Plugins

### frontend-tools

Comprehensive toolkit with agents and skills for Claude Code.

**Agents:**
- `claude-md-architect` - Expert at creating, reviewing, and optimizing CLAUDE.md files
- `gather-codebase-context` - Research-only agent that explores and documents codebase context

**Skills:**
- `github-pr-creator` - Creates GitHub PRs with focused descriptions and generates Slack announcement messages
- `research-and-planning` - Orchestrates multi-agent research and parallel planning workflows
- `skill-creator` - Creates, edits, and troubleshoots Claude Code Skills (SKILL.md files)

## Structure

```
test-marketplace/
├── .claude-plugin/
│   └── marketplace.json
├── frontend-tools/
│   ├── .claude-plugin/
│   │   └── plugin.json
│   ├── agents/
│   │   ├── claude-md-architect.md
│   │   └── gather-codebase-context.md
│   └── skills/
│       ├── github-pr-creator/
│       │   └── SKILL.md
│       ├── research-and-planning/
│       │   └── SKILL.md
│       └── skill-creator/
│           ├── SKILL.md
│           └── SKILLS_GUIDE.md
├── CLAUDE.md
└── README.md
```
