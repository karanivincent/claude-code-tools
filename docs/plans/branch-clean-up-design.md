# Branch Cleanup Skill Design

## Overview

A `/branch-cleanup` command that helps clean up stale git branches based on clear rules, with safety measures and flexibility for team repositories.

## Rules of Thumb

| Condition | Action |
|-----------|--------|
| Branch merged into `dev` or `main` | Safe to delete (any age) |
| Unmerged + no commits for 3+ months | Considered abandoned, delete |
| `main` or `dev` branch | Never delete (protected) |
| Default scope | Only your branches (by git author email) |
| Optional | Include other contributors after reviewing grouped list |

## Command

**Name:** `/branch-cleanup`

**Flags:**

| Flag | Description | Default |
|------|-------------|---------|
| `--age <months>` | Threshold for abandoned branches | 3 |
| `--emails <list>` | Include other contributors' branches | Your email only |
| `--dry-run` | Show what would be deleted | true |
| `--execute` | Actually delete branches | false |

## Scripts

### `scripts/branch-cleanup/list-branches-to-delete.sh`

Lists all candidate branches grouped by contributor.

**Arguments:**
- `--age <months>` — Threshold for abandoned branches (default: 3)
- `--main-branch <name>` — Branch to check merge status against (default: dev)

**Logic:**
1. Fetch origin to ensure accurate merge status
2. Find ALL branches matching criteria:
   - Merged into main branch, OR
   - Unmerged but last commit older than threshold
3. Group results by contributor email
4. Output grouped list with branch details

**Output format:**
```
vince@example.com (47 branches):
  MERGED:
    - fix/old-bug (4 months ago)
    - 1827-pdf-adjustments (3 months ago)
  ABANDONED:
    - calendar-backup (5 months ago)

alex@company.com (12 branches):
  MERGED:
    - feature/notifications (2 months ago)
  ABANDONED:
    - wip-refactor (8 months ago)
```

### `scripts/branch-cleanup/delete-branches.sh`

Deletes branches for specified contributors.

**Arguments:**
- `--emails <list>` — Comma-separated contributor emails (default: your git email)
- `--age <months>` — Same threshold as list script (default: 3)
- `--dry-run` — Show what would be deleted (default)
- `--execute` — Actually perform deletion

**Logic:**
1. Re-run same criteria as list script
2. Filter to only specified contributors
3. If `--execute`:
   - Show summary and prompt for confirmation
   - Delete local branches first (`git branch -D`)
   - Delete remote branches (`git push origin --delete`)
   - Report results

## Workflow

1. Run `/branch-cleanup` → Shows all candidates grouped by contributor
2. Review output, identify which contributors to include
3. Run `/branch-cleanup --execute` → Deletes only your branches
4. Or `/branch-cleanup --execute --emails "me@example.com,departed@company.com"` → Include others

## Safety Measures

1. **Dry-run by default** — Must explicitly pass `--execute` to delete
2. **Confirmation prompt** — Before deletion, show summary and ask "Continue? (y/n)"
3. **Protected branches** — `main` and `dev` are hardcoded as protected, never deleted
4. **Local before remote** — Delete local first; if it fails, skip remote for that branch
5. **Failure tolerance** — If one branch fails, continue with rest and report failures at end
6. **Current branch check** — Skip if candidate branch is currently checked out

## Edge Cases

| Situation | Behavior |
|-----------|----------|
| Branch exists locally but not remotely | Delete local only |
| Branch exists remotely but not locally | Delete remote only |
| Currently checked out branch is candidate | Skip with warning |
| No branches match criteria | Exit with "Nothing to delete" |
| Network error during remote deletion | Log error, continue with others |

## Output Examples

**Dry-run output:**
```
Scanning branches for vince@example.com...

MERGED (safe to delete):
  - 1827-adjustments-to-show-migrated-contract-pdfs (merged 3 months ago)
  - fix/search-preview-photo-url (merged 4 months ago)
  ... 47 more

ABANDONED (>3 months, unmerged):
  - 1669-advanced-filters-backup (last commit: 3 months ago)
  - calendar-create-modal-duplicate (last commit: 3 months ago)
  ... 12 more

Summary: 61 branches to delete (49 merged, 12 abandoned)
Run with --execute to delete
```

**Post-execution output:**
```
Deleted 47 branches (32 local, 41 remote)
Skipped 2 branches:
  - feature-x: currently checked out
  - old-wip: remote deletion failed (branch not found)
```
