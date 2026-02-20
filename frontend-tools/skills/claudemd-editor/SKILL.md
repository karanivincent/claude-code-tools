---
name: claudemd-editor
description: Create, review, optimize, or troubleshoot CLAUDE.md configuration files. Use when user wants a new CLAUDE.md ("I need a CLAUDE.md for my project"), asks for review/improvements ("review my CLAUDE.md", "make it better"), reports instruction-following issues ("Claude keeps using npm instead of pnpm"), wants to consolidate scattered documentation into CLAUDE.md, or mentions CLAUDE.md structure, best practices, or optimization.
---

# CLAUDE.md Editor

## Core Understanding

- CLAUDE.md is the highest-leverage configuration point for Claude Code
- Frontier LLMs follow ~150-200 instructions with reasonable consistency
- Claude Code's system prompt contains ~50 instructions, leaving ~100-150 for project-specific instructions
- As instruction count increases, instruction-following quality decreases uniformly
- Instructions should be universally applicable to all tasks in the project

## Core Principles

### 1. Less Is More

- Keep CLAUDE.md under 300 lines (ideally under 60)
- Use short, declarative bullet points
- Avoid narrative paragraphs
- Only include rules Claude genuinely needs

### 2. Universal Applicability

- Every instruction should apply to most tasks in the project
- Avoid task-specific instructions that only apply occasionally
- Use progressive disclosure for detailed documentation

### 3. The WHAT, WHY, HOW Framework

- WHAT: Tech stack, project structure, codebase map
- WHY: Purpose of the project and its components
- HOW: How to work on the project (commands, workflows)

## Workflow: Creating New CLAUDE.md Files

1. Gather project information:
   - Tech stack
   - Essential commands (build, test, lint, dev)
   - Key directories and their purposes
   - Critical "do not touch" areas
   - Most important coding conventions

2. Structure the file with these sections (adapt as needed):
   - Project Context (brief behavioral guidance)
   - About This Project (one paragraph)
   - Key Directories
   - Commands
   - Code Style (essential rules only)
   - Do Not (protected areas)
   - Workflow (if applicable)

3. Use @ syntax for importing detailed documentation rather than including everything inline

## Workflow: Reviewing Existing CLAUDE.md Files

### Best Practices Checklist

- [ ] Concise (<300 lines, ideally <60)
- [ ] Includes common commands (build, test, lint)
- [ ] Documents key directories and purposes
- [ ] Defines critical "do not touch" areas
- [ ] Uses imports (@path) for detailed docs
- [ ] Uses bullet points and short sentences
- [ ] Instructions are universally applicable
- [ ] No sensitive information or secrets
- [ ] No detailed style guides (should use linters)
- [ ] No task-specific instructions
- [ ] No outdated code snippets

### Red Flags to Identify

- Narrative paragraphs instead of bullet points
- Style guide details that should be in linter config
- Instructions that only apply to specific tasks
- Duplicated information from README
- Auto-generated content that wasn't reviewed
- Sensitive information or secrets
- Code snippets that may become outdated
- Exceeding ~150 total instructions

## Workflow: Optimizing CLAUDE.md Files

1. **Consolidate and condense**: Merge related instructions, remove redundancy
2. **Prioritize by importance**: Most critical rules near the top
3. **Add emphasis strategically**: Use IMPORTANT, MUST, NEVER for critical rules
4. **Implement progressive disclosure**: Move detailed docs to separate files with @ imports
5. **Replace prose with bullets**: Convert paragraphs to scannable lists
6. **Remove style guides**: Recommend linter configuration instead
7. **Add anchor comments**: Suggest CLAUDE-note comments for code-level guidance

## Output Format

When presenting CLAUDE.md content:

1. Use markdown code blocks for file content
2. Explain reasoning for structural decisions
3. Highlight trade-offs or considerations
4. Provide before/after comparisons when optimizing
5. Suggest follow-up improvements or companion files if appropriate

## Important Behaviors

- Always read the existing CLAUDE.md file(s) before making suggestions
- Consider the project's actual structure and tech stack
- Ask clarifying questions if more context is needed
- Preserve project-specific knowledge that cannot be inferred
- Suggest creating .claude/commands/ templates for repetitive workflows
- Recommend CLAUDE.local.md for personal preferences that shouldn't be shared
- When in doubt, err on the side of brevity

## File Location Hierarchy

1. Enterprise policy: `/Library/Application Support/ClaudeCode/CLAUDE.md` (organization-wide)
2. Project memory: `./CLAUDE.md` or `./.claude/CLAUDE.md` (team-shared)
3. User memory: `~/.claude/CLAUDE.md` (personal, all projects)
4. Project local: `./CLAUDE.local.md` (personal, current project)

Help users place instructions at the appropriate level based on their scope.
