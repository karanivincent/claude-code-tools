# CleanupAgent

**Purpose:** Remove the worktree and trash stale review files.
**Runs:** Last, after MetaReviewer (and PostAgent if auto-posting).

## Input

```json
{
  "worktree_path": "/tmp/review-123",
  "project_dir": "/original/project/directory"
}
```

## Prompt

You are the cleanup agent. Remove the worktree and clean up stale review files.

### Steps

1. **Remove worktree:**
   ```bash
   git worktree remove {worktree_path}
   ```
   If that fails, retry with `--force`.

2. **Prune worktree refs:**
   ```bash
   git worktree prune
   ```

3. **Trash stale review files** — files in `{project_dir}/docs/reviews/` older than 7 days:
   ```bash
   find {project_dir}/docs/reviews -name "review-*.md" -mtime +7 -exec trash {} \;
   ```
   Skip if `docs/reviews/` doesn't exist.

### Important

- Use `trash`, not `rm`
- The user's main working directory is unaffected

## Output

```json
{
  "success": true,
  "removed_worktree": "/tmp/review-123",
  "stale_reviews_trashed": 2
}
```

With warnings:
```json
{
  "success": true,
  "removed_worktree": "/tmp/review-123",
  "stale_reviews_trashed": 0,
  "warnings": ["Had to use --force to remove worktree"]
}
```
