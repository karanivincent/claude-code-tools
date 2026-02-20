---
name: pr-slack-announcer
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
- Look for rows containing yond-selfservice → extract URL for Preview (App)
- Look for rows containing yond-storybook-worker → extract URL for Preview (Storybook)
- URLs appear as markdown links: [https://...](https://...)

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

3. Extract the Preview Alias URL (NOT the Preview URL):
   - Preview URL: https://<version-id>-<project>.workers.dev (changes each build)
   - Preview Alias URL: https://<branch>-<project>.workers.dev (stable, preferred)

### Check if Storybook Link is Relevant

Before including the Storybook URL, verify there are relevant changes:

```bash
gh pr diff --name-only | grep -E '\.(stories\.svelte|svelte)$' | grep -E '(packages/ui/|apps/storybook/)'
```

Include Storybook URL only if the PR contains changes to:
- Story files (*.stories.svelte)
- Components in packages/ui/src/
- Storybook configuration in apps/storybook/

Omit Storybook URL entirely if changes are only to:
- App routes/pages
- API/backend code
- Configuration files
- Tests (non-story)
- Documentation

### Step 3: Get Notion Link from GitHub Issue

1. Extract issue number from branch name:
   - Branch format: <number>-<description> (e.g., 28-add-calendar-view)
   - Extract the leading number before the first dash
2. If issue number found, fetch the issue:

```bash
gh issue view <number> --json body --jq '.body'
```

3. Look for Notion link with these labels (case-insensitive):
   - Notion: followed by URL
   - Story: followed by URL
   - Ticket: followed by URL
4. If no labeled link found, look for any notion.so URL in the description

### Step 4: Enhance Preview URLs with Deep Links

#### For App Preview URLs (Multiple Features)

1. Get changed route files:

```bash
gh pr diff --name-only | grep -E 'src/routes/.*\+page\.svelte$'
```

2. Convert each route file to a URL path:
   - src/routes/classes/+page.svelte → /classes
   - src/routes/classes/[oid]/+page.svelte → /classes/book (use navigable parent for dynamic routes)
   - src/routes/profile/settings/+page.svelte → /profile/settings
3. Deduplicate and prioritize:
   - Remove duplicate parent paths if child route also changed
   - Limit to 4 most relevant routes
   - Prioritize new routes over modified routes

#### For Storybook URLs (Multiple Components)

1. Get all new/modified story files:

```bash
gh pr diff --name-only | grep '\.stories\.svelte$'
```

2. For each story file, extract the title and generate URL:
   - Read title from defineMeta({ title: '...' })
   - atoms/IconAnimatedClock → /?path=/story/atoms-iconanimatedclock--default
   - basic/FilterRow → /?path=/story/basic-filterrow--default
3. Generate a link for each (limit to 5 max)

### Step 5: Generate Message

Use this template (include lines only if data available):

**Single feature/component:**

```
PR #<NUMBER>: <PR Title>
---------------------------------------
GitHub: <PR URL>
Preview (App): <selfservice URL><route path>
Preview (Storybook): <storybook URL><story path>
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

**Multiple features/components:**

```
PR #<NUMBER>: <PR Title>
---------------------------------------
GitHub: <PR URL>

Preview (App):
  • /classes/book → <full-url>/classes/book
  • /profile → <full-url>/profile

Preview (Storybook):
  • IconAnimatedClock → <full-url>/?path=/story/atoms-iconanimatedclock--default
  • FilterRow → <full-url>/?path=/story/basic-filterrow--default

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

### Step 6: Post to Slack

After generating the message, post it directly to Slack via webhook if configured.

**If `SLACK_WEBHOOK_URL` is set:**

1. Escape the message for JSON (escape newlines, quotes, backslashes)
2. Post to Slack:

```bash
curl -s -X POST "$SLACK_WEBHOOK_URL" \
  -H 'Content-type: application/json' \
  -d "{\"text\": \"$ESCAPED_MESSAGE\"}"
```

3. If curl returns `"ok"`, confirm the message was posted to Slack
4. If curl fails or returns an error, print the message to terminal as fallback and show the error

**If `SLACK_WEBHOOK_URL` is not set:**

Print the message to the terminal as before (copy-paste workflow).

## Rules

- Always include GitHub URL
- Prefer unified deployment comment over check run output when available
- Only include Storybook preview URL when the PR contains component or story changes
- Omit sections entirely when no relevant changes (don't show empty sections)
- Enhance preview URLs with deep links when possible:
  - App: Link to the most relevant route(s) changed in the PR
  - Storybook: Link to new/modified stories if any
- List multiple deep links when PR contains multiple features or components
- Format as bullet list when more than one link per category
- Limit to 4 routes and 5 stories maximum to keep message readable
- Use component/route name as link label for clarity
- Extract issue number from branch naming convention (<number>-<description>)
- Look for Notion link in issue description with labels: Notion:, Story:, Ticket:
- Include Notion link ONLY if found in issue or user provides it
- Keep "What's Changed" to 2-4 bullet points maximum
- Focus on user-facing changes, not implementation details

## Example Output (Multiple Features and Components)

```
PR #42: feat: add user profile and settings pages
---------------------------------------
GitHub: https://github.com/goyond/yond_monorepo/pull/42

Preview (App):
  • /profile → https://abc123-yond-selfservice.workers.dev/profile
  • /profile/settings → https://abc123-yond-selfservice.workers.dev/profile/settings

Preview (Storybook):
  • ProfileCard → https://abc123-yond-storybook.workers.dev/?path=/story/basic-profilecard--default
  • SettingsToggle → https://abc123-yond-storybook.workers.dev/?path=/story/atoms-settingstoggle--default

Notion: https://www.notion.so/yond/User-profile-abc123
---------------------------------------
What's Changed:
- Added user profile page with avatar and bio
- Added settings page with notification preferences
- Created ProfileCard and SettingsToggle components
---------------------------------------
Testing Notes:
Navigate to /profile to see user info, then /profile/settings to toggle preferences
```

## Example Output (Single Feature with Deep Link)

```
PR #28: Add calendar appointment view
---------------------------------------
GitHub: https://github.com/goyond/yond_monorepo/pull/28
Preview (App): https://28-add-calendar-yond-selfservice.workers.dev/calendar
Preview (Storybook): https://28-add-calendar-yond-storybook.workers.dev/?path=/story/atoms-iconanimatedclock--default
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

## Example Output (App Changes Only - No Storybook)

When PR only changes routes/pages without component changes:

```
PR #69: feat: implement class detail page with E2E tests
---------------------------------------
GitHub: https://github.com/goyond/yond_monorepo/pull/69
Preview (App): https://0c73649f-yond-selfservice.workers.dev/classes/book
Notion: https://www.notion.so/yond/CSS-class-detail-page-2bf31c80ce358090993bdf22e6a900ae
---------------------------------------
What's Changed:
- Implemented class detail page showing class info, instructor, date/time
- Added E2E tests for the new page
---------------------------------------
Testing Notes:
Navigate to /classes/book and click any class to view details
```

## Example Output (No Deep Links Available)

When no specific routes or stories can be detected:

```
PR #47: Update deployment workflow
---------------------------------------
GitHub: https://github.com/goyond/yond_monorepo/pull/47
Preview (App): https://update-deployment-yond-selfservice.workers.dev
---------------------------------------
What's Changed:
- Updated GitHub Actions workflow for unified deployment comments
---------------------------------------
Testing Notes:
Create a test PR and verify deployment comment appears
```
