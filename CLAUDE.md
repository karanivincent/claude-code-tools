# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Claude Code plugin marketplace repository hosting the `frontend-tools` plugin, which provides agents and skills to extend Claude Code functionality.

## Architecture

- **Marketplace configuration**: `.claude-plugin/marketplace.json` - Defines the marketplace and lists available plugins
- **Plugin structure**: `frontend-tools/` containing:
  - `.claude-plugin/plugin.json` - Plugin metadata
  - `agents/` - Agent definitions (model-invoked specialized assistants)
  - `skills/` - Skill definitions (model-invoked capabilities)

## Plugin Contents

### Agents
- `claude-md-architect` - Creates, reviews, and optimizes CLAUDE.md files
- `gather-codebase-context` - Research-only agent for exploring codebases

### Skills
- `github-pr-creator` - Creates PRs with focused descriptions and Slack messages
- `research-and-planning` - Orchestrates research and parallel planning workflows
- `skill-creator` - Creates and troubleshoots SKILL.md files (includes SKILLS_GUIDE.md reference)
