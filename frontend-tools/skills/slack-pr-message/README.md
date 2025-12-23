# Slack PR Message Generator

Generate copy-paste ready Slack messages for PR announcements.

## When to Use

- Creating a Slack message for a PR
- Announcing a PR to the team
- Generating PR summaries for team communication

## Workflow

1. **Get PR Information** - Fetch PR details with `gh pr view`
2. **Get Preview URLs** - Check for Cloudflare deployment comments
3. **Get Notion Link** - Extract from linked GitHub issue
4. **Generate Message** - Create formatted announcement

## Output Format

```
PR #28: Add calendar appointment view
---------------------------------------
GitHub: https://github.com/org/repo/pull/28
Preview (App): https://branch-app.workers.dev
Preview (Storybook): https://branch-storybook.workers.dev
Notion: https://www.notion.so/project/page
---------------------------------------
What's Changed:
- Main change 1
- Main change 2
---------------------------------------
Testing Notes:
Brief testing instructions
```

## Features

- Auto-detects PR from current branch
- Extracts preview URLs from Cloudflare deployment comments
- Finds Notion links from linked GitHub issues
- Supports dual preview URLs (App + Storybook)
- Keeps "What's Changed" focused (2-4 bullet points)

## URL Sources

1. **Unified Deployment Comment** (preferred) - Parses markdown table for multiple URLs
2. **Cloudflare Check Run** (fallback) - Extracts from CI check output
