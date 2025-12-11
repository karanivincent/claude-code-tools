---
name: github-pr-creator
description: |
  Create GitHub pull requests with focused descriptions. Use when user:
  - Asks to create a PR or pull request
  - Wants to push changes and open a PR
  - Needs a PR description written
  - Mentions "open PR", "create PR", "make a pull request", "submit PR", "can you create a pr"
---

# GitHub PR Creator

Create professional pull requests with focused descriptions and wait for CI status.

## Workflow

### Step 0: Check for Existing PR

1. Check if an **open** PR already exists for the current branch:

   ```bash
   gh pr view --json number,title,body,url,commits,state 2>/dev/null
   ```

2. **If PR exists and state is "OPEN"**:
   - Get the commit count from the PR's `commits` array
   - Compare with current `git log dev..HEAD --oneline | wc -l`
   - If new commits exist since PR was created:
     - Re-analyze changes (Step 1)
     - Update PR description using `gh pr edit <NUMBER> --body "..."`
   - Skip to Step 4 (CI check)

3. **If no open PR exists** (or PR is closed/merged): Continue normal workflow from Step 1

### Step 1: Analyze Changes

1. Run `git log dev..HEAD --oneline` to see all commits on this branch
2. Run `git diff dev...HEAD --stat` to see changed files summary
3. Identify the **main purpose** of the PR (the primary feature or bug fix)

### Step 2: Write Focused PR Description

**IMPORTANT**: Focus on the main changes only. Do NOT include:

- Minor bug fixes encountered during development
- Typo fixes
- Small refactors made along the way
- Debug commits

**DO include**:

- The primary feature being added
- The main bug being fixed
- Key architectural changes
- Breaking changes (if any)

### Step 3: Create the PR

Use `gh pr create` with a HEREDOC for the body. **Always target the `dev` branch** (not `main`):

```bash
gh pr create --base dev --title "Brief descriptive title" --body "$(cat <<'EOF'
## Summary
- Main change 1
- Main change 2

## Test Plan
- How to test the changes

EOF
)"
```

### Step 4: Wait for CI Build

1. Get the PR number from the creation output
2. Run `gh pr checks <PR_NUMBER> --watch` to wait for CI
3. Report the build status to the user:
   - If successful: "Build passed"
   - If failed: "Build failed" and show which checks failed

### Step 5: Generate Slack Message

Use the `slack-pr-message` skill to generate a Slack announcement for the PR.

## Best Practices

1. **Title**: Use imperative mood ("Add feature" not "Added feature")
2. **Description**: Be concise but complete
3. **Testing notes**: Be specific enough that someone unfamiliar can test

## Existing PR Handling

When a PR already exists for the current branch:

1. **Check for new commits**:

   ```bash
   # Get current commit count on branch
   git log dev..HEAD --oneline | wc -l
   ```

2. **If PR description is outdated** (new commits since creation):
   - Re-run Step 1 analysis to understand all changes
   - Update the PR body:

     ```bash
     gh pr edit <NUMBER> --body "$(cat <<'EOF'
     ## Summary
     - Updated change 1
     - Updated change 2

     ## Test Plan
     - Updated testing instructions
     EOF
     )"
     ```

3. **Continue to CI check and Slack message generation** (Steps 4-5)
