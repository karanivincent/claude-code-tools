---
name: branch-cleanup
description: |
  Clean up stale git branches (merged or abandoned). Use when user:
  - Wants to clean up old branches
  - Has too many branches in their repo
  - Asks about branch cleanup or maintenance
  - Mentions "delete old branches", "prune branches", "branch cleanup"
---

# Branch Cleanup

Clean up stale git branches with safety measures for team repositories.

## Rules

| Condition | Action |
|-----------|--------|
| Branch merged into main | Safe to delete (any age) |
| Unmerged + no commits for 3+ months | Considered abandoned, delete |
| `main`, `dev`, `master`, `develop` | Never delete (protected) |
| Default scope | Only user's branches (by git author email) |

## Workflow

### Step 1: List Candidates

Run the list script to see all branches grouped by contributor:

```bash
SKILL_DIR="$(dirname "$0")"
"$SKILL_DIR/scripts/list-branches.sh" --age 3 --main-branch main
```

**Arguments:**
- `--age <months>` — Abandoned threshold (default: 3)
- `--main-branch <name>` — Branch to check merge status against (default: main)

Output groups branches by contributor email showing MERGED and ABANDONED categories.

### Step 2: Choose Scope

After seeing the grouped list:
1. Identify which contributors' branches the user has permission to delete
2. By default, only delete the user's own branches
3. Include others only if explicitly appropriate

### Step 3: Delete Branches

**Dry run (default):**

```bash
"$SKILL_DIR/scripts/delete-branches.sh" --age 3 --main-branch main --dry-run
```

**Execute deletion:**

```bash
"$SKILL_DIR/scripts/delete-branches.sh" --age 3 --main-branch main --execute
```

**Include specific contributors:**

```bash
"$SKILL_DIR/scripts/delete-branches.sh" --emails "me@example.com,departed@company.com" --execute
```

**Arguments:**
- `--emails <list>` — Comma-separated contributor emails (default: user's git email)
- `--age <months>` — Abandoned threshold (default: 3)
- `--main-branch <name>` — Branch to check merge status against (default: main)
- `--dry-run` — Show what would be deleted (default)
- `--execute` — Actually perform deletion

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
