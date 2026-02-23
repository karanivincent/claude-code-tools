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

The script names files using a priority chain:
1. **Alt text** — markdown alt text (if not generic like "image" or "screenshot")
2. **Context** — nearest heading or descriptive text above the image in the issue body
3. **Fallback** — `image-{n}` when no meaningful name can be derived

Duplicate names get `-2`, `-3` suffixes automatically.

The script emits a `--- IMAGE_DOWNLOAD_RESULT ---` JSON block listing which files are generically named.

### Step 2: Rename Generically-Named Images

Check the script output for the `generically_named` array in the JSON result block.

For each generically-named file:
1. **Read the image** using the Read tool to view its contents
2. **Generate a descriptive name** (2-4 words) based on what the image shows
3. **Rename** with `mv old-name.png new-name.png`

Naming guidelines:
- Use kebab-case (e.g., `checkout-form-error.png`)
- Describe the UI element, state, or feature shown
- Avoid generic words like "image", "screenshot", "view"
- Keep names concise: 2-4 words max

If vision cannot determine a meaningful name, keep the `image-{n}` fallback — don't force a bad name.

### Step 3: Display Images

After downloading (and renaming), use the Read tool to display each image inline:

```
Read: docs/designs/issue-{number}/image-name.png
```

Display all downloaded images so the user can see the designs.

## Output Structure

```
docs/designs/
└── issue-{number}/
    ├── {alt-text}.png          (from meaningful alt text)
    ├── {context-name}.png      (from nearby heading/text)
    ├── {vision-name}.png       (renamed by vision in Step 2)
    └── image-{n}.png           (only if vision couldn't name it)
```

## Script Details

Location: `scripts/fetch_issue_images.py`

Arguments:
- `issue_number` (required): GitHub issue number
- `--repo` (required): Repository in `owner/repo` format
- `--output-dir` (optional): Output directory, defaults to `docs/designs`

The script uses `gh api -H "Accept: application/octet-stream"` to download images with authentication, which is required for GitHub user-attachments URLs.
