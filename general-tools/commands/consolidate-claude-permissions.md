# Consolidate Claude Code Permissions

Analyze and consolidate the permissions in the specified settings file, removing redundant entries while preserving granular security controls.

## Target File

$ARGUMENTS (defaults to `.claude/settings.local.json` if not provided)

Both `.claude/settings.local.json` and `.claude/settings.json` are valid targets.

## Instructions

1. **Read** the current permissions file
2. **Identify** redundant or overly-specific entries
3. **Consolidate** following the rules below
4. **Output** the cleaned permissions as a JSON code block
5. **Summarize** what was consolidated

---

## Consolidation Rules

### MUST Consolidate

| Pattern | Action |
|---------|--------|
| Hardcoded paths (`/Users/name/Projects/...`) | Replace with wildcard (`:*`) |
| One-time heredoc commit messages | Remove (keep `git commit:*`) |
| Exact duplicates | Remove duplicates |
| `command` + `command:*` pairs | Keep only `command:*` |
| Multiple `--filter <pkg>` variants | Consolidate to `--filter:*` |

### MUST NOT Consolidate

| Keep Separate | Reason |
|---------------|--------|
| Different git subcommands (`add`, `commit`, `push`, `reset`) | Different risk levels |
| Different pnpm subcommands (`add`, `build`, `publish`, `test`) | `publish` is destructive |
| Different npx tools (`tsc`, `vitest`, `prisma`) | Distinct tools |
| Read vs write operations | Security boundary |
| MCP tool permissions | Already atomic |
| Skill permissions | Already atomic |

### Consolidation Hierarchy

```
TOO BROAD (avoid):     Bash(git:*)
APPROPRIATE:           Bash(git add:*), Bash(git commit:*), Bash(git push:*)
TOO NARROW (remove):   Bash(git commit -m "exact message")
```

---

## Output Format

```json
{
  "permissions": {
    "allow": [
      // Grouped by category, alphabetized within groups
      // 1. Simple bash utilities (curl, echo, find, tree, etc.)
      // 2. Git commands
      // 3. Package manager commands (pnpm, npm, npx)
      // 4. CLI tools (gh, claude, etc.)
      // 5. WebSearch
      // 6. MCP permissions
      // 7. Skill permissions
    ]
  },
  "enabledPlugins": {}
}
```

---

## Example

**Before:**
```json
"Bash(git -C /Users/vince/Projects/App status)",
"Bash(git -C /Users/vince/Projects/App add file.ts)",
"Bash(git commit -m \"$(cat <<'EOF'\nfeat: thing\nEOF\n)\")",
"Bash(git commit:*)",
"Bash(pnpm --filter api test)",
"Bash(pnpm --filter api test:*)",
"Bash(pnpm --filter web build:*)"
```

**After:**
```json
"Bash(git -C:*)",
"Bash(git commit:*)",
"Bash(pnpm --filter:*)"
```

**Removed:**
- Path-specific `git -C` commands → `git -C:*`
- Heredoc commit message → already covered by `git commit:*`
- Exact + wildcard duplicate → kept wildcard
- Multiple `--filter` variants → `--filter:*`