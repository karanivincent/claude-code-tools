---
name: branch-cleanup
description: |
  Clean up stale git branches (merged or abandoned). Use bundled scripts in
  ./scripts/ directory. Use when user wants to clean up old branches, has too
  many branches, asks about "delete old branches", "prune branches", or
  "branch cleanup".
---

# Branch Cleanup

Clean up stale git branches with safety measures for team repositories.

## Quick Start

```bash
# List all cleanup candidates (auto-detects main branch)
./scripts/list-branches.sh

# Delete only your branches (dry-run first)
./scripts/delete-branches.sh --dry-run

# Execute deletion
./scripts/delete-branches.sh --execute
```

## Rules

| Condition | Action |
|-----------|--------|
| Merged into main branch | Safe to delete (any age) |
| Unmerged + >3 months old | Considered abandoned |
| `main`, `dev`, `master`, `develop` | **Never delete** (protected) |
| Default scope | Only user's branches |

> **Note:** Both `main` and `dev` are protected because typically one is the
> development branch and the other is production.

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
| `--main-branch <name>` | auto-detect | Branch to check merge status |
| `--dry-run` | (default) | Show what would be deleted |
| `--execute` | - | Actually delete branches |

## Workflow

### Step 1: List Candidates

```bash
./scripts/list-branches.sh
```

Output groups branches by contributor email showing MERGED and ABANDONED categories.

### Step 2: Choose Scope

After seeing the grouped list:
1. By default, only your branches are deleted
2. Use `--emails` to include other contributors if appropriate

### Step 3: Delete Branches

```bash
# Dry run (default) - see what would be deleted
./scripts/delete-branches.sh --dry-run

# Execute deletion for your branches only
./scripts/delete-branches.sh --execute

# Include specific contributors
./scripts/delete-branches.sh --emails "me@example.com,other@example.com" --execute
```

## Safety Measures

1. **Dry-run by default** — Must explicitly pass `--execute`
2. **Confirmation prompt** — Before deletion, asks "Continue? (y/n)"
3. **Protected branches** — `main`, `dev`, `master`, `develop` never deleted
4. **Current branch check** — Skips currently checked out branch
5. **Failure tolerance** — Continues with rest and reports failures at end

## Argument Mapping

| User says | Script argument |
|-----------|-----------------|
| "older than 6 months" | `--age 6` |
| "check against dev branch" | `--main-branch dev` |
| "include john@example.com" | `--emails "user@email.com,john@example.com"` |
| "just show me" / "don't delete yet" | `--dry-run` (default) |
| "go ahead and delete" | `--execute` |
