---
name: github-image-downloader
description: |
  Download images attached to GitHub issues for design review workflows.

  WHEN TO USE: After reading a GitHub issue that contains image attachments
  (URLs matching https://github.com/user-attachments/assets/...). Do NOT use
  for issues without images. This skill handles the authenticated download
  that regular curl/wget cannot perform.

  TRIGGERS:
  - Issue body contains github.com/user-attachments/assets/ URLs
  - User is reviewing designs from a GitHub issue
  - User asks to see/download images from an issue

  DO NOT USE when:
  - Issue has no image attachments
  - Images are hosted elsewhere (not user-attachments)
---

# GitHub Issue Images

Download and display images from GitHub issues for design review workflows.

## When This Skill Activates

This skill activates when:
1. A GitHub issue has been read (via `gh issue view` or github-fetch-agent)
2. The issue body contains image URLs matching `https://github.com/user-attachments/assets/...`

If no images are found, do not use this skill.

## Workflow

### Step 1: Run the Download Script

```bash
python ~/.claude/skills/github-image-downloader/scripts/fetch_issue_images.py \
  <issue_number> \
  --repo <owner/repo> \
  --output-dir docs/designs
```

Example:
```bash
python ~/.claude/skills/github-image-downloader/scripts/fetch_issue_images.py \
  60 \
  --repo goyond/frontend-monorepo \
  --output-dir docs/designs
```

The script will:
- Fetch the issue body
- Extract all `user-attachments` image URLs
- Download each image using authenticated `gh api`
- Save to `docs/designs/issue-{number}/`
- Name files using markdown alt text when available

### Step 2: Display Images

After downloading, use the Read tool to display each image inline:

```
Read: docs/designs/issue-{number}/image-name.png
```

Display all downloaded images so the user can see the designs.

## Output Structure

```
docs/designs/
└── issue-{number}/
    ├── {alt-text-1}.png
    ├── {alt-text-2}.png
    └── image-{n}.png  (fallback if no alt text)
```

## Script Details

Location: `scripts/fetch_issue_images.py`

Arguments:
- `issue_number` (required): GitHub issue number
- `--repo` (required): Repository in `owner/repo` format
- `--output-dir` (optional): Output directory, defaults to `docs/designs`

The script uses `gh api -H "Accept: application/octet-stream"` to download images with authentication, which is required for GitHub user-attachments URLs.
