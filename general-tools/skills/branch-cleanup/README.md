# Branch Cleanup

Clean up stale git branches (merged or abandoned) with safety measures for team repositories.

## When to Use

- Cleaning up old/stale/merged branches
- Pruning branches after merging PRs
- Managing cluttered branch lists
- Git housekeeping

## Quick Start

```bash
# List all cleanup candidates
./scripts/list-branches.sh

# Preview what would be deleted (dry-run)
./scripts/delete-branches.sh --dry-run

# Execute deletion
./scripts/delete-branches.sh --execute
```

## Cleanup Rules

| Condition | Action |
|-----------|--------|
| Merged into main branch | Safe to delete (any age) |
| Unmerged + >3 months old | Considered abandoned |
| `main`, `dev`, `master`, `develop` | **Never delete** (protected) |
| Default scope | Only your branches |

## Script Arguments

### list-branches.sh

| Argument | Default | Description |
|----------|---------|-------------|
| `--age <months>` | 3 | Abandoned threshold |
| `--main-branch <name>` | auto-detect | Branch to check merge status |

### delete-branches.sh

| Argument | Default | Description |
|----------|---------|-------------|
| `--emails <list>` | Your git email | Comma-separated emails |
| `--age <months>` | 3 | Abandoned threshold |
| `--dry-run` | (default) | Show what would be deleted |
| `--execute` | - | Actually delete branches |

## Safety Measures

1. **Dry-run by default** - Must explicitly pass `--execute`
2. **Confirmation prompt** - Asks before deletion
3. **Protected branches** - `main`, `dev`, `master`, `develop` never deleted
4. **Current branch check** - Skips currently checked out branch
5. **Failure tolerance** - Continues and reports failures at end
