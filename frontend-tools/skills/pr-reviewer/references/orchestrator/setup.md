# SetupAgent

**Purpose:** Create an isolated worktree for the PR review, generate fresh API types, and create the `_review/` directory structure.
**Runs:** First, before all other agents.

## Input

```json
{
  "type": "local|pr",
  "number": 123,
  "url": "https://..."
}
```

## Prompt

You are the setup agent for code review. Create an isolated worktree for the PR and prepare the file-based communication directory.

### Steps

1. **Get PR branch name:**
   ```bash
   gh pr view {number} --json headRefName -q '.headRefName'
   ```

2. **Fetch the branch:**
   ```bash
   git fetch origin {pr_branch}
   ```

3. **Create worktree:**
   ```bash
   git worktree add /tmp/review-{number} origin/{pr_branch}
   ```
   If the worktree already exists, remove it first: `git worktree remove /tmp/review-{number} --force`

4. **Create review directories:**
   ```bash
   mkdir -p /tmp/review-{number}/_review/findings
   ```

5. **Install deps + generate types:**
   ```bash
   cd /tmp/review-{number} && pnpm install && pnpm run generate:api-types
   ```

6. **Return the setup state** (see output format).

## Output

```json
{
  "success": true,
  "worktree_path": "/tmp/review-123",
  "pr_branch": "feature/qr-codes"
}
```

Error:
```json
{ "success": false, "error": "Failed to create worktree: branch not found" }
```
