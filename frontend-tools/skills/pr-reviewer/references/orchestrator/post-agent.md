# PostAgent

**Purpose:** Post review comments from the markdown file to GitHub PR as inline comments.
**Runs:** Standalone via `/pr-reviewer post`, or automatically in auto-post mode.

## Input

```json
{
  "type": "post",
  "pr_number": 123,
  "review_file": "./docs/reviews/review-123.md",
  "auto_post": false
}
```

- `auto_post: true` → skip the confirmation prompt (still show the preview)
- If `pr_number` missing, detect from current branch:
  ```bash
  gh pr view --json number -q '.number'
  ```

## Prompt

You are the post agent. Read the review markdown, dedupe against existing GitHub comments, and submit a single review with all valid inline comments.

### Steps

1. **Parse the review file** — extract comments from this structure:

   ```markdown
   ## `src/lib/utils/file.ts`

   ---

   ### Line 79

   \`\`\`typescript
   code snippet
   \`\`\`

   **Blocker: Debug Code**

   Explanation text...

   \`\`\`typescript
   fixed code
   \`\`\`

   <!-- agent:DebugCode confidence:0.95 -->
   ```

   Into:
   ```json
   {
     "file": "src/lib/utils/file.ts",
     "line": 79,
     "severity": "Blocker",
     "category": "Debug Code",
     "body": "**Blocker: Debug Code**\n\nExplanation text...\n\n```typescript\nfixed code\n```"
   }
   ```

   **Parsing rules:**
   - `` ## `{path}` `` → file path
   - `### Line {n}` or `### Lines {n}-{m}` → line number (start line for ranges)
   - `**{Severity}: {Category}**` → severity + category
   - Body = everything from severity header through fix code block
   - Strip the `<!-- agent:... -->` metadata from body

2. **Get PR details:**
   ```bash
   gh api repos/{owner}/{repo}/pulls/{pr} --jq '{head_sha: .head.sha, title: .title}'
   ```

3. **Fetch existing review comments:**
   ```bash
   gh api repos/{owner}/{repo}/pulls/{pr}/comments --paginate
   ```

4. **Filter duplicates** — a comment is a duplicate if ALL match:
   - Same `path`
   - Same `line` (±2 lines for minor shifts)
   - Body starts with the same severity header (e.g., `**Blocker: Debug Code**`)

   Skip duplicates.

5. **Validate against current diff:**
   ```bash
   gh pr diff {pr}
   ```
   Build `{file: [valid_lines]}` from `+` lines in the diff. Comments on invalid lines = stale; skip.

6. **Show preview and handle confirmation:**

   ```
   Ready to post {n} comments to PR #{pr} "{pr_title}"
   Skipped (already posted): {n}
   Skipped (line not in diff): {n}

   Comments to post:

   1. {file}:{line}
      {Severity}: {Category} — {first line of explanation}

   ... (more)
   ```

   - `auto_post: false` → use AskUserQuestion: "Yes, post comments" / "No, cancel"
   - `auto_post: true` → proceed directly

7. **Submit the review as a single API call:**

   Build comments array:
   ```json
   [
     {
       "path": "src/lib/api/services/scanner.ts",
       "line": 89,
       "side": "RIGHT",
       "body": "**Major: Error Handling**\n\nJSON.parse can throw...\n\n<!-- ai:pr-reviewer -->"
     }
   ]
   ```

   **Append `\n\n<!-- ai:pr-reviewer -->` to every comment body.** This invisible marker lets us programmatically identify AI-generated comments later.

   ```bash
   gh api repos/{owner}/{repo}/pulls/{pr}/reviews \
     --method POST \
     -f event="COMMENT" \
     -f commit_id="{head_sha}" \
     -f body="AI-assisted code review ({n} comments)\n\n<!-- ai:pr-reviewer -->" \
     --input comments.json
   ```

   `side: "RIGHT"` = commenting on the new version.

8. **Trash the review file** after success:
   ```bash
   trash {review_file}
   ```

9. **Report results:**

   ```
   Posted {n} comments to PR #{pr}

   Results:
     ✓ {n} posted successfully
     ⚠ {n} skipped (already posted)
     ⚠ {n} skipped (line not in diff)

   Review file trashed (comments now on GitHub)
   View at: https://github.com/{owner}/{repo}/pull/{pr}
   ```

### Important

- Manual mode → always confirm before posting
- Auto-post mode → skip confirmation but still show preview
- `event: "COMMENT"` is neutral (no approval/rejection)
- Idempotent — running twice won't duplicate
- Always `trash` the review file after success

## Output

```json
{
  "success": true,
  "posted": 9,
  "skipped_duplicate": 2,
  "skipped_stale": 1,
  "review_file_trashed": true,
  "pr_url": "https://github.com/owner/repo/pull/123"
}
```

Error:
```json
{ "success": false, "error": "Review file not found: docs/reviews/review-123.md" }
```

User declined:
```json
{ "success": false, "error": "User cancelled", "reason": "declined_confirmation" }
```
