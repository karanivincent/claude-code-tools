---
name: autocompact-threshold
description: Set the autocompact threshold percentage for context management. Use when adjusting when Claude Code compacts conversation history.
argument-hint: [percentage|default]
allowed-tools: Read, Edit
---

# Autocompact Threshold Configuration

Set the `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` in `~/.claude/settings.json`.

## Current Setting

!`grep "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE" ~/.claude/settings.json 2>/dev/null || echo "No override set (using default: 95%)"`

## Instructions

**Argument provided:** $ARGUMENTS

Based on the argument:

1. **If a number (1-100)**: Update `~/.claude/settings.json` to set `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` to that value in the `env` object
2. **If "default"**: Remove `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` from settings (keep `env` object if other values exist, or set to `{}`)
3. **If empty/no argument**: Just report the current setting shown above

The default threshold is **95%** - lower values compact earlier, higher values use more context before compacting.
