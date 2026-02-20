# CLAUDE.md Editor

Create, review, optimize, and troubleshoot CLAUDE.md configuration files - the highest-leverage configuration point for Claude Code.

## When to Use

- Creating a new CLAUDE.md for a project
- Reviewing or improving an existing CLAUDE.md
- Troubleshooting instruction-following issues
- Consolidating scattered documentation

## Key Principles

### Less Is More

- Keep under 300 lines (ideally under 60)
- Use short, declarative bullet points
- Only include rules Claude genuinely needs

### Universal Applicability

- Every instruction should apply to most tasks
- Avoid task-specific instructions

### The WHAT, WHY, HOW Framework

- **WHAT**: Tech stack, project structure, codebase map
- **WHY**: Purpose of the project and components
- **HOW**: Commands, workflows, conventions

## Best Practices Checklist

- Concise (<300 lines, ideally <60)
- Includes common commands (build, test, lint)
- Documents key directories and purposes
- Uses imports (@path) for detailed docs
- Uses bullet points and short sentences
- No sensitive information or secrets

## File Location Hierarchy

1. Enterprise policy: `/Library/Application Support/ClaudeCode/CLAUDE.md`
2. Project memory: `./CLAUDE.md` or `./.claude/CLAUDE.md`
3. User memory: `~/.claude/CLAUDE.md`
4. Project local: `./CLAUDE.local.md`
