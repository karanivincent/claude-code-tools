---
name: slack-pr-message
description: |
  Generate Slack announcement messages for pull requests. Use when user:
  - Asks to create a Slack message for a PR
  - Wants to announce a PR in Slack
  - Needs a PR summary for team communication
  - Mentions "Slack message", "announce PR", "PR announcement"
---

# Slack PR Message Generator

Generate copy-paste ready Slack messages for PR announcements.

## Workflow

### Step 1: Get PR Information

```bash
gh pr view --json number,title,body,url,headRefOid,headRefName
```

If no PR number specified, this gets the current branch's PR.

### Step 2: Get Preview URLs

Try these methods in order:

#### Method A: Unified Deployment Comment (preferred)

Check if the PR has a unified deployment comment (used in repos with multiple Cloudflare Workers):

```bash
gh pr view --json comments --jq '.comments[].body' | grep -A 20 'cloudflare-deployments-comment'
```

If found, parse the markdown table:
- Look for rows containing `yond-selfservice` → extract URL for **Preview (App)**
- Look for rows containing `yond-storybook-worker` → extract URL for **Preview (Storybook)**
- URLs appear as markdown links: `[https://...](https://...)`

#### Method B: Cloudflare Check Run Output (fallback)

If no unified comment found, fall back to check run parsing:

1. Get repository info:

   ```bash
   gh repo view --json owner,name --jq '"\(.owner.login)/\(.name)"'
   ```

2. Query the Cloudflare Workers check run output:

   ```bash
   gh api repos/{owner}/{repo}/commits/{headRefOid}/check-runs \
     --jq '.check_runs[] | select(.app.name == "Cloudflare Workers and Pages") | .output.summary'
   ```

3. Extract the **Preview Alias URL** (NOT the Preview URL):
   - Preview URL: `https://<version-id>-<project>.workers.dev` (changes each build)
   - Preview Alias URL: `https://<branch>-<project>.workers.dev` (stable, preferred)

### Step 3: Get Notion Link from GitHub Issue

1. Extract issue number from branch name:
   - Branch format: `<number>-<description>` (e.g., `28-add-calendar-view`)
   - Extract the leading number before the first dash

2. If issue number found, fetch the issue:

   ```bash
   gh issue view <number> --json body --jq '.body'
   ```

3. Look for Notion link with these labels (case-insensitive):
   - `Notion:` followed by URL
   - `Story:` followed by URL
   - `Ticket:` followed by URL

4. If no labeled link found, look for any `notion.so` URL in the description

### Step 4: Generate Message

Use this template (include lines only if data available):

```
PR #<NUMBER>: <PR Title>
---------------------------------------
GitHub: <PR URL>
Preview (App): <selfservice URL if available>
Preview (Storybook): <storybook URL if available>
Preview: <single URL if only Method B available>
Notion: <Notion link if found>
---------------------------------------
What's Changed:
- <Main change 1>
- <Main change 2>
- <Main change 3>
---------------------------------------
Testing Notes:
<Brief testing instructions>
```

**Note:** Use `Preview (App)` and `Preview (Storybook)` when both URLs available from unified comment. Use plain `Preview:` when only one URL available from fallback method.

## Rules

- Always include GitHub URL
- **Prefer unified deployment comment** over check run output when available
- Show both preview URLs as separate lines when available (App and Storybook)
- Use single `Preview:` line when only one URL available (backwards compatibility)
- Extract issue number from branch naming convention (`<number>-<description>`)
- Look for Notion link in issue description with labels: `Notion:`, `Story:`, `Ticket:`
- Include Notion link ONLY if found in issue or user provides it
- Keep "What's Changed" to 2-4 bullet points maximum
- Focus on user-facing changes, not implementation details

## Example Output (Dual Preview URLs)

When unified deployment comment is present:

```
PR #28: Add calendar appointment view
---------------------------------------
GitHub: https://github.com/goyond/yond_monorepo/pull/28
Preview (App): https://28-add-calendar-appointment-yond-selfservice.accounts-ec5.workers.dev
Preview (Storybook): https://28-add-calendar-appointment-yond-storybook-worker.accounts-ec5.workers.dev
Notion: https://www.notion.so/yond/Calendar-view-design-abc123
---------------------------------------
What's Changed:
- Added calendar appointment view component
- Integrated with appointment API
- Added date navigation controls
---------------------------------------
Testing Notes:
Navigate to /calendar and verify appointments display correctly with proper date filtering
```

## Example Output (Single Preview URL - Backwards Compatible)

For repos without unified deployment comment:

```
PR #1786: Fix calendar drag-and-drop scroll offset bug
---------------------------------------
GitHub: https://github.com/goyond/yond_management/pull/1786
Preview: https://1742-calendar-appointment-ge.yond.pages.dev
Notion: https://www.notion.so/yond/Calendar-update-e88c7b63fd44481fb1500ca4f5e6c0cf
---------------------------------------
What's Changed:
- Fixed drag-and-drop offset issue when scrolling during dragging in calendar
- Implemented scroll compensation using neodrag's custom transform function
- Tracks scroll position and applies compensation to keep element under cursor
---------------------------------------
Testing Notes:
Drag an appointment in the calendar, scroll horizontally while dragging, verify the appointment stays under the cursor and drops at the correct position
```

## Example Output (No Notion Link)

When branch doesn't reference an issue or issue has no Notion link:

```
PR #47: Update deployment workflow
---------------------------------------
GitHub: https://github.com/goyond/yond_monorepo/pull/47
Preview (App): https://update-deployment-workflow-yond-selfservice.accounts-ec5.workers.dev
Preview (Storybook): https://update-deployment-workflow-yond-storybook-worker.accounts-ec5.workers.dev
---------------------------------------
What's Changed:
- Updated GitHub Actions workflow for unified deployment comments
---------------------------------------
Testing Notes:
Create a test PR and verify both preview URLs appear in comment
```
