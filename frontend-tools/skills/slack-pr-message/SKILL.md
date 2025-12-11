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
gh pr view --json number,title,body,url,headRefOid
```

If no PR number specified, this gets the current branch's PR.

### Step 2: Get Preview URL (Cloudflare Workers)

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

### Step 3: Generate Message

Use this template:

```
PR #<NUMBER>: <PR Title>
---------------------------------------
GitHub: <PR URL>
Preview: <Preview Alias URL if available, otherwise omit>
Notion: <Notion link if provided, otherwise omit>
---------------------------------------
What's Changed:
- <Main change 1>
- <Main change 2>
- <Main change 3>
---------------------------------------
Testing Notes:
<Brief testing instructions>
```

## Rules

- Always include GitHub URL
- Always include Preview Alias URL from Cloudflare check output (more readable than version-based URL)
- Include Notion link ONLY if user provides it or it's mentioned in the PR/issue
- Keep "What's Changed" to 2-4 bullet points maximum
- Focus on user-facing changes, not implementation details

## Example Output

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
