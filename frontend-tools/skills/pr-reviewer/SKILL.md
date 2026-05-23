---
name: pr-reviewer
description: AI code review using patterns learned from Nicolas and Vincent's 2,768 review comments. Use when reviewing PRs, diffs, or code changes. Triggers on "/pr-reviewer", "review this PR", "review my changes", "code review", or when asked to check code before merging.
---

# PR Review Skill

Multi-agent code review in the synthesized style of Nicolas and Vincent.

## Usage

```
/pr-reviewer              # Review uncommitted local changes
/pr-reviewer --staged     # Review only staged changes
/pr-reviewer 123          # Review PR #123 from GitHub
/pr-reviewer <url>        # Review PR from URL
/pr-reviewer 123 --auto-post  # Review + auto-post comments to GitHub
/pr-reviewer post 123     # Post review comments to GitHub PR
/pr-reviewer post         # Post to PR (auto-detect from branch)
```

## Cost Optimization (read first)

The reference content is sharded so each agent reads only what it needs. **The `model` parameter on each spawned agent is mandatory — pick the tier that matches the work**:

| Stage | Model | Why |
|---|---|---|
| SetupAgent, DiffProcessor, PostAgent, CleanupAgent | `haiku` | Mechanical work (bash, diff parsing, markdown parsing, gh API calls) |
| Pattern specialists: DebugCode, Security, ImportPaths, Naming, Internationalization, CodeOrganization | `haiku` | Regex-shaped checks, deterministic flows |
| Judgment specialists: TypeSafety, ErrorHandling, TestCoverage | `sonnet` | Multi-step reasoning (api.ts cross-check, "does utility already exist?", "is this worth testing?") |
| Consolidated Reviewer (fast path) | `sonnet` | Doing 9 specialist jobs in one pass — breadth + reasoning |
| **MetaReviewer** | **`opus`** | False-positive filtering, severity calibration, final user-facing writeup. This is where smarter reasoning translates directly into fewer bad comments shipped to GitHub. |

Two additional levers:

1. **Each specialist reads only its own file.** Never tell a specialist to read a global agents file — none exists. Each agent's prompt lives in `references/specialists/{slug}.md` and is ~30 lines, plus the shared `references/specialists/_shared.md` (~60 lines) for the I/O contract.
2. **Fast path is the default for typical PRs.** The threshold is generous so most PRs use one reviewer instead of nine.

## Context Isolation Rules

**The main agent is a lightweight orchestrator. It stays lean.**

1. **Do NOT read any file from `references/`.** Specialists self-serve their own reference files.
2. **Do NOT pass large JSON payloads** between agents. All data flows through files in `{worktree_path}/_review/`.
3. **Only pass file paths** to agents. Receive only tiny status objects back.
4. **Never inline diff data, findings, or reference content** in the main agent's context.

### File Layout

All intermediate data lives in the worktree:

```
/tmp/review-{pr}/
  _review/
    diff-data.json            # DiffProcessor writes; specialists + MetaReviewer read
    findings/
      consolidated.json       # Fast path
      debug-code.json         # Full path: each specialist writes its own file
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
                        ┌─ triage ─┐
                        │          │
                    small/med    large PR
                    (<400 add    (≥400 add
                     <15 files)  or ≥15 files)
                        │          │
                        ▼          ▼
Phase 2: Review    Consolidated  6 pattern (Haiku)
                   Reviewer      + 3 judgment (Sonnet)
                   (Sonnet)        │
                        │          │
                        └────┬─────┘
                             ▼
Phase 3: Consolidation ► MetaReviewer (Opus)
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

Spawn **SetupAgent** with `model: "haiku"`:

```
Read your instructions from {references_dir}/orchestrator/setup.md.
Input: { "type": "{type}", "number": {number} }
```

Returns:
```json
{ "success": true, "worktree_path": "/tmp/review-123", "pr_branch": "feature/qr-codes" }
```

### Phase 1: Launch DiffProcessor

Spawn **DiffProcessor** with `model: "haiku"`:

```
Read your instructions from {references_dir}/orchestrator/diff-processor.md.
Input: { "type": "...", "staged": ..., "number": ..., "worktree_path": "..." }
```

| Argument | Input |
|----------|-------|
| (none) | `{ "type": "local", "staged": false, "worktree_path": "..." }` |
| `--staged` | `{ "type": "local", "staged": true, "worktree_path": "..." }` |
| Number | `{ "type": "pr", "number": 123, "worktree_path": "..." }` |
| URL | `{ "type": "pr", "url": "...", "worktree_path": "..." }` |

DiffProcessor writes the full diff to `{worktree_path}/_review/diff-data.json` and returns only:
```json
{
  "success": true,
  "diff_file": "/tmp/review-123/_review/diff-data.json",
  "total_changes": { "files": 10, "additions": 1468 },
  "reviewable_changes": { "files": 5, "additions": 153 },
  "pr_info": { "number": 123, "title": "Add user authentication" }
}
```

**The main agent never sees the full files array.**

### Triage (in main agent)

```
if reviewable_changes.additions < 400 AND reviewable_changes.files < 15:
  → Fast path: 1 Consolidated Reviewer
else:
  → Full path: 9 specialists in parallel
```

Non-reviewable files (excluded from `reviewable_changes`): lock files, docs (`*.md`, `*.txt`), assets (`.svg`, `.png`, fonts), `database.types.ts`, version-only `package.json` changes. This ensures a PR with 1,400 lines of docs + 150 lines of code correctly takes the fast path.

### Phase 2 (Fast Path): Consolidated Reviewer

Spawn **one** Consolidated Reviewer with `model: "sonnet"` (it's doing 9 specialists' worth of work in one pass — Haiku will lose focus, Opus is overkill):

```
You are the Consolidated Reviewer.
Read your instructions from {references_dir}/orchestrator/consolidated-reviewer.md.
diff_file: {worktree_path}/_review/diff-data.json
output_file: {worktree_path}/_review/findings/consolidated.json
worktree_path: {worktree_path}
references_dir: {references_dir}
```

The agent reads `consolidated-reviewer.md` + `fast-review-patterns.md` (~150 lines total) and writes findings.

Output format matches specialist format — MetaReviewer needs no changes.

### Phase 2 (Full Path): 9 Specialists in Parallel

Spawn all 9 in a **single message**. The `model` differs by specialist — pattern specialists run on Haiku, judgment specialists on Sonnet.

| Agent | Reference file | Model | Focus | Severity |
|-------|----------------|-------|-------|----------|
| DebugCode | `specialists/debug-code.md` | `haiku` | console.log, debugger, dead code | Blocker |
| Security | `specialists/security.md` | `haiku` | Secrets, API keys, credentials | Blocker |
| **TypeSafety** | `specialists/type-safety.md` | **`sonnet`** | Missing types, `any`, unsafe casts (api.ts cross-check needs reasoning) | Major |
| **ErrorHandling** | `specialists/error-handling.md` | **`sonnet`** | Missing try/catch (existing-utility check needs reasoning) | Major |
| Internationalization | `specialists/internationalization.md` | `haiku` | Hardcoded UI strings | Major |
| ImportPaths | `specialists/import-paths.md` | `haiku` | `$root/src/lib`, deep relative imports | Minor |
| Naming | `specialists/naming.md` | `haiku` | Misleading names, negative booleans | Minor |
| CodeOrganization | `specialists/code-organization.md` | `haiku` | Repetition, missing JSDoc, dead code | Suggestion |
| **TestCoverage** | `specialists/test-coverage.md` | **`sonnet`** | Missing tests/stories/testability (judgment-heavy: is this worth testing?) | Major/Suggestion |

**Prompt template (identical for all 9):**

```
You are the {agent_name} specialist.
Read shared rules from {references_dir}/specialists/_shared.md (read once).
Read your specialist instructions from {references_dir}/specialists/{slug}.md.
diff_file: {worktree_path}/_review/diff-data.json
output_file: {worktree_path}/_review/findings/{slug}.json
worktree_path: {worktree_path} (for validation reads only)
Write findings JSON to the output_file.
Return only: { "agent": "{agent_name}", "findings_count": N, "findings_file": "{output_file}" }
```

Each specialist reads ~30-60 lines of its own file plus the ~50-line shared file — instead of the previous ~1,160-line monolith.

**Critical constraint:** Agents may ONLY flag issues on lines present in the `changes` array. Worktree access is for validation only.

### Phase 3: MetaReviewer

Spawn **MetaReviewer** with `model: "opus"`. This is the only stage that earns Opus pricing — it sees all findings across all specialists and is responsible for false-positive filtering, severity calibration, and writing the final user-facing markdown. Smarter reasoning here translates directly into fewer bad comments shipped to GitHub.

```
You are MetaReviewer.
Read your instructions from {references_dir}/orchestrator/meta-reviewer.md.
Input:
  worktree_path: {worktree_path}
  diff_file: {worktree_path}/_review/diff-data.json
  findings_dir: {worktree_path}/_review/findings
  references_dir: {references_dir}
  project_dir: {original_working_directory}
```

MetaReviewer reads findings files, deduplicates, validates, filters, and writes `{project_dir}/docs/reviews/review-{pr}.md`.

**Important:** `project_dir` is the original project directory (not the worktree) — the review file must persist after worktree cleanup.

Returns:
```json
{
  "raw_count": 34,
  "final_count": 12,
  "filtered": { "outside_diff": 5, "low_confidence": 13, "duplicates": 4 },
  "output_file": "./docs/reviews/review-123.md",
  "review_file": "/absolute/path/to/docs/reviews/review-123.md",
  "summary": { "blocker": 2, "major": 5, "minor": 3, "suggestion": 2 }
}
```

### Auto-Post Mode

When `--auto-post` is present OR the project's CLAUDE.md contains an instruction like "When using /pr-reviewer, always auto-post review comments to GitHub":

1. Phases 0-3 run as normal.
2. After MetaReviewer returns, automatically launch PostAgent with `auto_post: true`.
3. PostAgent shows a preview and proceeds directly (no confirmation prompt).
4. PostAgent trashes the review file after successful posting.
5. Proceed to Phase 4 (CleanupAgent).

When auto-post is NOT active:
1. Present summary to user after Phase 3.
2. User can later run `/pr-reviewer post` manually.
3. Proceed to Phase 4 (CleanupAgent).

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

### Phase 4: CleanupAgent

Spawn **CleanupAgent** with `model: "haiku"`:

```
Read your instructions from {references_dir}/orchestrator/cleanup.md.
Input: { "worktree_path": "{worktree_path}", "project_dir": "{project_dir}" }
```

Removes the worktree, prunes references, and trashes stale review files (>7 days old).

## Output Format

Single file (`{project_dir}/docs/reviews/review-{pr}.md`) with inline comments grouped by file, ordered by line number. See `references/orchestrator/meta-reviewer.md` for the full format specification.

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

The `post` command reads a review file and posts comments to GitHub as inline PR comments. Spawn PostAgent with `model: "haiku"`:

```
Read your instructions from {references_dir}/orchestrator/post-agent.md.
Input: { "type": "post", "pr_number": ..., "review_file": "...", "auto_post": false }
```

**Quick reference:**
1. Parse `docs/reviews/review-{pr}.md` into structured comments
2. Fetch existing GitHub comments, filter duplicates
3. Validate line numbers against current diff
4. Show preview, ask confirmation (skipped in auto-post mode)
5. Submit as a single review via `gh api`
6. Trash the review file after successful posting

| Scenario | Behavior |
|----------|----------|
| Review file not found | Error: "No review found" |
| All comments already posted | "All comments already posted or stale" |
| User declines confirmation | Abort with no changes |
| Some lines no longer exist | Post valid comments, report skipped |

## References

### Orchestrator agents
- `references/orchestrator/setup.md` — SetupAgent
- `references/orchestrator/diff-processor.md` — DiffProcessor
- `references/orchestrator/consolidated-reviewer.md` — Fast-path single reviewer
- `references/orchestrator/meta-reviewer.md` — Deduplication, validation, final writeup
- `references/orchestrator/post-agent.md` — GitHub comment posting
- `references/orchestrator/cleanup.md` — Worktree cleanup

### Specialist agents
- `references/specialists/_shared.md` — Shared I/O rules and findings format
- `references/specialists/debug-code.md`
- `references/specialists/security.md`
- `references/specialists/type-safety.md`
- `references/specialists/error-handling.md`
- `references/specialists/internationalization.md`
- `references/specialists/import-paths.md`
- `references/specialists/naming.md`
- `references/specialists/code-organization.md`
- `references/specialists/test-coverage.md`

### Supporting references (rarely needed)
- `references/fast-review-patterns.md` — Compact checklist used by Consolidated Reviewer
- `references/patterns.md` — Verbose regex catalog (no longer auto-loaded by specialists)
- `references/project-conventions.md` — Yond-specific standards (no longer auto-loaded by specialists)
- `references/reviewer-examples.md` — Real Nicolas/Vincent comments for style reference
