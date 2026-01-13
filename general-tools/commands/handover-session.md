---
description: Create a structured handover document for seamless session transitions
allowed-tools: Bash(git:*), Read, Write, Glob, Grep, TodoRead
argument-hint: [topic]
---

# Handover Command

Create a structured handover document for the next Claude session to continue seamlessly.

## Step 1: Gather Information

### Git Context

```bash
!`git branch --show-current`
!`git status --short`
!`git log --oneline -5`
!`git diff --stat HEAD~3..HEAD 2>/dev/null || git diff --stat`
```

### Topic Extraction

- If argument provided (`$ARGUMENTS`), use it as topic: `$ARGUMENTS`
- Otherwise, extract from git branch name (remove prefixes like `feature/`, `fix/`, convert to kebab-case)

## Step 2: Analyze the Session

Review the conversation to identify:

1. **Session goal** - What was the user trying to accomplish?
2. **Completed work** - What changes were made? Files edited? Features added?
3. **Current state** - Are tests passing? Any uncommitted changes?
4. **Next steps** - What was planned but not done? Check todo list.
5. **Key resources** - Important files, docs, or URLs referenced
6. **Decisions made** - Why were certain approaches chosen?
7. **Blockers/warnings** - Known issues or gotchas

## Step 3: Write the Handover Document

Create file at: `docs/handovers/YYYY-MM-DD-HH-MM-<topic>.md`

Use this exact template (keep each section to 1-5 bullet points max):

```markdown
# Handover: <topic>

**Date:** <current date and time>
**Branch:** <git branch>
**Session goal:** <one-line summary>

## Completed Work

- <change 1>
- <change 2>

## Current State

- Tests: <passing/failing/not verified>
- Build: <passing/failing/not verified>
- Uncommitted changes: <yes/no - list if yes>

## Next Steps

- [ ] <task 1>
- [ ] <task 2>

## Key Resources

- `<path>` - <why it matters>

## Decisions Made

- <decision>: <reasoning>

## Blockers & Warnings

- <issue or gotcha>
```

## Step 4: Commit and Output

1. Create `docs/handovers/` directory if it doesn't exist
2. Write the handover document
3. Commit with message: `Add handover: <topic>`
4. Print the full document to console
5. End with:

```
---
Handover saved to: <filepath>

To continue in a new session, say:
"Continue from <filepath>"
```

## Guidelines

- Keep it concise - total document should be under 100 lines
- Be specific about file paths and line numbers where relevant
- Include actual error messages if there are failing tests
- Don't include sensitive information (API keys, passwords)
- If a section has nothing to report, write "None" instead of omitting it