# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Claude Code plugin marketplace hosting two plugins (`frontend-tools` and `general-tools`) that extend Claude Code with specialized agents and skills.

## Architecture

```
yond-marketplace/
├── .claude-plugin/marketplace.json    # Marketplace definition
├── frontend-tools/                    # Plugin for frontend/testing/GitHub workflows
│   ├── .claude-plugin/plugin.json     # Plugin metadata (name, version, description)
│   ├── agents/                        # Agent definitions (*.md files)
│   └── skills/                        # Skill definitions (directories with SKILL.md)
└── general-tools/                     # Plugin for git/productivity tools
    ├── .claude-plugin/plugin.json
    └── skills/
```

## Authoring Agents

Agents are single markdown files in `agents/` with YAML frontmatter:

```yaml
---
name: agent-name
description: When to use this agent
tools: Glob, Grep, Read, ...  # Available tools
model: sonnet                  # Model to use
color: green                   # Optional display color
---
```

The body contains instructions for the agent's behavior.

## Authoring Skills

Skills are directories containing a required `SKILL.md` with optional resources:

```
skill-name/
├── SKILL.md          # Required: frontmatter (name, description) + instructions
├── scripts/          # Optional: executable scripts
├── references/       # Optional: documentation to load on-demand
└── assets/           # Optional: templates, images for output
```

Key principles:
- **Concise is key**: Only include what Claude doesn't already know
- **Progressive disclosure**: Keep SKILL.md lean (<500 lines), split details into `references/`
- **Description triggers activation**: The frontmatter `description` determines when the skill is used—include specific trigger phrases

See `frontend-tools/skills/skill-creator/SKILL.md` for the complete skill authoring guide.

## Updating Plugin Versions

After modifying a plugin, update the version in `.claude-plugin/plugin.json`:
- `frontend-tools/.claude-plugin/plugin.json`
- `general-tools/.claude-plugin/plugin.json`
