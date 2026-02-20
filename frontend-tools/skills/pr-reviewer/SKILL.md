---
name: pr-reviewer
description: AI code review using patterns learned from Nicolas and Vincent's 2,768 review comments. Use when reviewing PRs, diffs, or code changes. Triggers on "/review-pr", "review this PR", "review my changes", "code review", or when asked to check code before merging.
---

# PR Review Skill

Multi-agent code review in the synthesized style of Nicolas and Vincent.

## Usage

```
/review-pr              # Review uncommitted local changes
/review-pr --staged     # Review only staged changes
/review-pr 123          # Review PR #123 from GitHub
/review-pr <url>        # Review PR from URL
/review-pr 123 --auto-post  # Review + auto-post comments to GitHub
/review-pr post 123     # Post review comments to GitHub PR
/review-pr post         # Post to PR (auto-detect from branch)
```

## Context Isolation Rules

**CRITICAL: The main agent is a lightweight orchestrator. It must stay lean.**

1. **Do NOT read any file from `references/`.** Specialists self-serve their own reference files.
2. **Do NOT pass large JSON payloads** between agents. All data flows through files in `{worktree_path}/_review/`.
3. **Only pass file paths** to agents. Receive only tiny status objects back.
4. **Never inline diff data, findings, or reference content** in the main agent's context.

### File Layout

All intermediate data lives in the worktree:

```
/tmp/review-{pr}/
  _review/
    diff-data.json            # DiffProcessor writes, specialists + MetaReviewer read
    findings/
      debug-code.json         # Each specialist writes its own file
      security.json
      type-safety.json
      error-handling.json
      internationalization.json
      import-paths.json
      naming.json
      code-organization.json
      test-coverage.json
```

## Process

Five-phase architecture with file-based communication:

```
Phase 0: Setup ────────► SetupAgent
                              │
                              ▼
Phase 1: Preparation ──► DiffProcessor
                              │
                              ▼
Phase 2: Review ───────► 9 Specialists (parallel)
                              │
                              ▼
Phase 3: Consolidation ► MetaReviewer
                              │
                              ▼
                    ┌─── auto-post? ───┐
                    │ yes              │ no
                    ▼                  ▼
              PostAgent          Present summary
                    │                  │
                    ▼                  ▼
Phase 4: Cleanup ──► CleanupAgent ◄────┘
                              │
                              ▼
Main Agent ◄─────────── Final summary
```

### Phase 0: Launch SetupAgent

Spawn **SetupAgent** before any other work. This agent creates an isolated worktree and the `_review/` directory structure.

SetupAgent returns:
```json
{
  "success": true,
  "worktree_path": "/tmp/review-123",
  "pr_branch": "feature/qr-codes"
}
```

### Phase 1: Launch DiffProcessor Agent

Spawn **DiffProcessor** agent with the user's arguments plus `worktree_path`:

| Argument | Passed to Agent |
|----------|-----------------|
| (none) | `{ "type": "local", "staged": false, "worktree_path": "..." }` |
| `--staged` | `{ "type": "local", "staged": true, "worktree_path": "..." }` |
| Number | `{ "type": "pr", "number": 123, "worktree_path": "..." }` |
| URL | `{ "type": "pr", "url": "...", "worktree_path": "..." }` |

DiffProcessor **writes** full diff data to `{worktree_path}/_review/diff-data.json` and **returns only a summary**:
```json
{
  "success": true,
  "diff_file": "/tmp/review-123/_review/diff-data.json",
  "total_changes": { "files": 8, "additions": 312 },
  "pr_info": { "number": 123, "title": "Add user authentication" }
}
```

**The main agent never sees the full files array.**

### Phase 2: Launch 9 Specialist Agents in Parallel

Spawn all 9 agents in a **single message**. Each receives only paths — no data payloads.

| Agent | Focus | Severity |
|-------|-------|----------|
| DebugCode | console.log, debugger, commented code | Blocker |
| Security | Secrets, API keys, credentials | Blocker |
| TypeSafety | Missing types, `any`, unsafe casts | Major |
| ErrorHandling | Missing try/catch, unhandled edge cases | Major |
| Internationalization | Hardcoded UI strings, missing `$LL` | Major |
| ImportPaths | `$root/src/lib`, deep relative imports | Minor |
| Naming | Misleading names, negative booleans | Minor |
| CodeOrganization | Repeated patterns, extraction, documentation | Suggestion |
| TestCoverage | Missing E2E/unit tests, stories, testability | Major/Suggestion |

**Prompt template (identical structure for all 9):**

```
You are the {agent_name} specialist reviewer.
Read your instructions from {references_dir}/agents.md (section "## Specialist N: {agent_name} Agent").
Read diff data from {diff_file}.
Read patterns from {references_dir}/patterns.md.
Read project conventions from {references_dir}/project-conventions.md.
Write your findings JSON to {output_file}.
Worktree is at {worktree_path} (for validation only).
Return only: { "agent": "{agent_name}", "findings_count": N, "findings_file": "{output_file}" }
```

Where:
- `{references_dir}` = path to `references/` directory of this skill
- `{diff_file}` = `{worktree_path}/_review/diff-data.json`
- `{output_file}` = `{worktree_path}/_review/findings/{slug}.json`
- `{worktree_path}` = from Phase 0

Each specialist:
1. Reads `diff-data.json` to get the files/changes
2. Reads its own section from `agents.md` + patterns + conventions
3. **Writes** findings to `_review/findings/{slug}.json`
4. **Returns only**: `{ "agent": "...", "findings_count": N, "findings_file": "..." }`

**Critical constraint:** Agents may ONLY flag issues on lines present in the `changes` array. Worktree access is for validation only.

### Phase 3: Launch MetaReviewer Agent

Spawn **MetaReviewer** with only paths:

```json
{
  "worktree_path": "/tmp/review-123",
  "diff_file": "/tmp/review-123/_review/diff-data.json",
  "findings_dir": "/tmp/review-123/_review/findings",
  "references_dir": "{path to references/}",
  "project_dir": "{original working directory}"
}
```

MetaReviewer reads all data from files within its own context, performs deduplication/validation/filtering, and writes the review to `{project_dir}/docs/reviews/review-{pr}.md`.

**Important:** `project_dir` is the original project directory (not the worktree). The review file must always be written there so it persists after worktree cleanup.

MetaReviewer returns:
```json
{
  "raw_count": 34,
  "final_count": 12,
  "filtered": { "outside_diff": 5, "low_confidence": 13, "duplicates": 4 },
  "output_file": "./docs/reviews/review-123.md",
  "review_file": "/absolute/path/to/docs/reviews/review-123.md",
  "summary": {
    "blocker": 2,
    "major": 5,
    "minor": 3,
    "suggestion": 2
  }
}
```

### Auto-Post Mode

When `--auto-post` is present OR the project's CLAUDE.md contains an instruction like "When using /review-pr, always auto-post review comments to GitHub":

1. Phases 0-3 run as normal
2. After MetaReviewer returns, **automatically launch PostAgent** with `auto_post: true`
3. PostAgent shows a preview of what will be posted, then proceeds directly (no confirmation prompt)
4. PostAgent trashes the review file after successful posting
5. Proceed to Phase 4 (CleanupAgent)

When auto-post is NOT active:
1. Present summary to user after Phase 3
2. User can later run `/review-pr post` manually
3. Proceed to Phase 4 (CleanupAgent)

### Main Agent: Present Results

```
Review complete for PR #123

12 comments ready for GitHub (./docs/reviews/review-123.md)

| Severity | Count |
|----------|-------|
| Blocker | 2 |
| Major | 5 |
| Minor | 3 |
| Suggestion | 2 |

Filtered out: 5 outside-diff, 13 low-confidence, 4 duplicates (from 34 raw findings)
```

### Phase 4: Launch CleanupAgent

After presenting results (and after PostAgent if auto-posting), spawn **CleanupAgent** with:

```json
{
  "worktree_path": "/tmp/review-123",
  "project_dir": "{original working directory}"
}
```

CleanupAgent:
1. Removes the worktree (`git worktree remove`)
2. Prunes worktree references
3. Trashes stale review files older than 7 days from `{project_dir}/docs/reviews/`

## Output Format

Output is a single file (`{project_dir}/docs/reviews/review-{pr}.md`) with inline comments grouped by file, ordered by line number. See the MetaReviewer section in `references/agents.md` for the full format specification.

## Severity Levels

| Level | Description |
|-------|-------------|
| Blocker | Must fix before merge |
| Major | Should fix |
| Minor | Nice to fix |
| Suggestion | Optional improvement |

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| PR not found | Clear error message |
| No code changes | "No code files to review" |
| Very large PR (50+ files) | Warn user, proceed anyway |
| Binary/generated files | Auto-exclude |
| No findings | "No issues found" |

## Posting Reviews to GitHub

The `post` command reads a review file and posts comments to GitHub as inline PR comments. See `references/agents.md` (PostAgent section) for the full flow.

**Quick reference:**
1. Parse `docs/reviews/review-{pr}.md` into structured comments
2. Fetch existing GitHub comments, filter duplicates
3. Validate line numbers against current diff
4. Show preview, ask confirmation (skipped in auto-post mode)
5. Submit as single review via `gh api`
6. Trash review file after successful posting

| Scenario | Behavior |
|----------|----------|
| Review file not found | Error: "No review found" |
| All comments already posted | "All comments already posted or stale" |
| User declines confirmation | Abort with no changes |
| Some lines no longer exist | Post valid comments, report skipped |

## References

- `references/agents.md` - Agent prompts, output formats, and review file format
- `references/patterns.md` - Regex patterns for detection
- `references/reviewer-examples.md` - Real Nicolas/Vincent comments
- `references/project-conventions.md` - Yond-specific standards
