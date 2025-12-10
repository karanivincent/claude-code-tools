---
name: github-pr-creator
description: |
  Create GitHub pull requests with focused descriptions and Slack messages. Use when user:
  - Asks to create a PR or pull request
  - Wants to push changes and open a PR
  - Needs a PR description written
  - Mentions "open PR", "create PR", "make a pull request", "submit PR", "can you create a pr"
---

# GitHub PR Creator

Create professional pull requests with focused descriptions, wait for CI status, and generate Slack announcement messages.

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

Create a Slack message using this exact template:

```
PR #<NUMBER>: <PR Title>
---------------------------------------
GitHub: <PR URL>
Preview: <Preview URL if available, otherwise omit this line>
Notion: <Notion link if provided, otherwise omit this line>
---------------------------------------
What's Changed:
• <Main change 1>
• <Main change 2>
• <Main change 3>
---------------------------------------
Testing Notes:
<Brief testing instructions>
```

**Rules for Slack message**:

- Always include GitHub URL
- Always include Preview Alias URL from Cloudflare check output (more readable than version-based URL)
- Include Notion link ONLY if user provides it or it's mentioned in the issue.
- Keep "What's Changed" to 2-4 bullet points maximum
- Focus on user-facing changes, not implementation details

## Example Output

```
PR #1786: Fix calendar drag-and-drop scroll offset bug
---------------------------------------
GitHub: https://github.com/goyond/yond_management/pull/1786
Preview: https://1742-calendar-appointment-ge.yond.pages.dev
Notion: Notion: https://www.notion.so/yond/Calendar-update-e88c7b63fd44481fb1500ca4f5e6c0cf?source=copy_link#22c31c80ce358064b44cda5bd1117025
---------------------------------------
What's Changed:
• Fixed drag-and-drop offset issue when scrolling during dragging in calendar
• Implemented scroll compensation using neodrag's custom transform function
• Tracks scroll position and applies compensation to keep element under cursor
---------------------------------------
Testing Notes:
Drag an appointment in the calendar, scroll horizontally while dragging, verify the appointment stays under the cursor and drops at the correct position
```

## Preview URL Retrieval (Cloudflare Workers)

To get the Preview Alias URL from Cloudflare Workers builds:

1. Get repository info:

   ```bash
   gh repo view --json owner,name --jq '"\(.owner.login)/\(.name)"'
   ```

2. Get the PR's head commit SHA:

   ```bash
   gh pr view <NUMBER> --json headRefOid --jq '.headRefOid'
   ```

3. Query the Cloudflare Workers check run output:

   ```bash
   gh api repos/{owner}/{repo}/commits/{sha}/check-runs \
     --jq '.check_runs[] | select(.app.name == "Cloudflare Workers and Pages") | .output.summary'
   ```

4. **Extract the Preview Alias URL** (NOT the Preview URL):
   - Preview URL: `https://<version-id>-<project>.workers.dev` (changes each build)
   - Preview Alias URL: `https://<branch>-<project>.workers.dev` (stable, preferred)

   Parse for line containing `Preview Alias URL:` and extract the URL.

## Best Practices

1. **Title**: Use imperative mood ("Add feature" not "Added feature")
2. **Description**: Be concise but complete
3. **Testing notes**: Be specific enough that someone unfamiliar can test
4. **Slack message**: Copy-paste ready format
5. **Always wait for CI**: Don't share the Slack message until build status is known

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
