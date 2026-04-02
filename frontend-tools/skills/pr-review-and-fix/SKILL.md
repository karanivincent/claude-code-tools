---
name: pr-review-and-fix
description: Use when an agent needs to review AND fix a PR in one pass. Combines AI code review with automated fixing -- reviews code, triages findings, implements fixes, posts a single summary comment. For agent-driven PR workflows where separate review + resolve steps are wasteful.
---

# PR Review & Fix

Single-pass AI code review + automated fixing. Reviews a PR, triages findings, implements fixes, posts one summary comment. Designed for agent use -- no interactive prompts, minimal GitHub API calls.

## Usage

```
/pr-review-and-fix              # Auto-detect PR from branch
/pr-review-and-fix 123          # Explicit PR number
/pr-review-and-fix <url>        # PR URL
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
    consolidated-findings.md  # MetaReviewer writes
    consolidated-findings.json # MetaReviewer writes (structured data for TriageFixer)
    decisions.json            # TriageFixer writes
```

## Process

Seven-phase architecture with file-based communication:

```
Phase 0: PR Detection ────► Auto-detect or explicit number
                                │
Phase 1: Setup ───────────► SetupAgent
                                │
Phase 2: Diff Processing ─► DiffProcessor
                                │
Phase 3: Specialist Review ► 9 Specialists (parallel)
                                │
Phase 4: Consolidation ───► MetaReviewer
                                │  writes consolidated-findings.json
                                │
Phase 5: Triage & Fix ────► TriageFixer
                                │  reads findings, decides fix/disagree,
                                │  implements fixes, commits, pushes
                                │
Phase 6: Summary & Cleanup ► SummaryAgent
                                   posts badge comment, removes worktree
```

### Phase 0: PR Detection (main agent, no sub-agent)

- If argument is a number: use as PR number
- If argument is a URL: extract PR number from URL
- If no argument: `gh pr view --json number -q '.number'`
- Error if no PR found -- instruct user to pass PR number explicitly

### Agent Permission Mode

**All subagents MUST be spawned with `mode: "bypassPermissions"`** to avoid prompting the user for every Read/Write/Edit/Bash call. This skill orchestrates many agents — without this, the user gets 15+ permission prompts per review.

### Phase 1: Launch SetupAgent

Spawn **SetupAgent** with `mode: "bypassPermissions"` to create an isolated worktree and the `_review/` directory structure.

SetupAgent returns:
```json
{
  "success": true,
  "worktree_path": "/tmp/review-123",
  "pr_branch": "feature/qr-codes"
}
```

### Phase 2: Launch DiffProcessor Agent

Spawn **DiffProcessor** agent with `mode: "bypassPermissions"` and:

```json
{ "type": "pr", "number": 123, "worktree_path": "..." }
```

DiffProcessor **writes** full diff data to `{worktree_path}/_review/diff-data.json` and **returns only a summary**:
```json
{
  "success": true,
  "diff_file": "/tmp/review-123/_review/diff-data.json",
  "total_changes": { "files": 8, "additions": 312 },
  "pr_info": { "number": 123, "title": "Add user authentication" }
}
```

**If no code changes:** Skip to Phase 6 (SummaryAgent) with "no code changes" message.

### Phase 3: Launch 9 Specialist Agents in Parallel

Spawn all 9 agents in a **single message** with `mode: "bypassPermissions"`. Each receives only paths -- no data payloads.

| Agent | Focus | Severity |
|-------|-------|----------|
| DebugCode | console.log, debugger, commented code | Blocker |
| Security | Secrets, API keys, credentials | Blocker |
| TypeSafety | Missing types, `any`, unsafe casts | Major |
| ErrorHandling | Missing try/catch, unhandled edge cases | Major |
| Internationalization | Hardcoded UI strings | Major |
| ImportPaths | Deep relative imports, wrong aliases | Minor |
| Naming | Misleading names, negative booleans | Minor |
| CodeOrganization | Repeated patterns, extraction, documentation | Suggestion |
| TestCoverage | Missing tests, testability | Major/Suggestion |

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
- `{worktree_path}` = from Phase 1

### Phase 4: Launch MetaReviewer Agent

Spawn **MetaReviewer** with `mode: "bypassPermissions"` and only paths:

```json
{
  "worktree_path": "/tmp/review-123",
  "diff_file": "/tmp/review-123/_review/diff-data.json",
  "findings_dir": "/tmp/review-123/_review/findings",
  "references_dir": "{path to references/}",
  "pr_number": 123
}
```

MetaReviewer reads all findings, performs deduplication/validation/filtering, assigns finding IDs (F001, F002...), and writes:
- `{worktree_path}/_review/consolidated-findings.md` -- human-readable review
- `{worktree_path}/_review/consolidated-findings.json` -- structured data for TriageFixer

**If no findings remain after filtering:** Skip to Phase 6 (SummaryAgent) with "no issues found" message.

MetaReviewer returns:
```json
{
  "raw_count": 34,
  "final_count": 12,
  "filtered": { "outside_diff": 5, "low_confidence": 13, "duplicates": 4 },
  "findings_file": "/tmp/review-123/_review/consolidated-findings.json",
  "summary": { "blocker": 2, "major": 5, "minor": 3, "suggestion": 2 }
}
```

### Phase 5: Launch TriageFixer Agent

Spawn **TriageFixer** with `mode: "bypassPermissions"` and:

```json
{
  "findings_file": "/tmp/review-123/_review/consolidated-findings.json",
  "project_dir": "{original working directory}",
  "pr_number": 123,
  "worktree_path": "/tmp/review-123"
}
```

TriageFixer:
1. Reads consolidated findings
2. Triages each -- **Fix** or **Disagree** (critical analysis, not blind compliance)
3. Implements fixes in `project_dir` (reverse line order, grouped by file)
4. Runs `pnpm typecheck && pnpm lint` -- reverts any fix that breaks the build
5. Commits specific files (never `git add .`), pushes
6. Writes `{worktree_path}/_review/decisions.json`

Returns:
```json
{
  "total": 12,
  "fixed": 8,
  "disagreed": 4,
  "committed": true,
  "pushed": true,
  "commit_sha": "abc1234",
  "decisions_file": "/tmp/review-123/_review/decisions.json"
}
```

### Phase 6: Launch SummaryAgent

Spawn **SummaryAgent** with `mode: "bypassPermissions"` and:

```json
{
  "decisions_file": "/tmp/review-123/_review/decisions.json",
  "pr_number": 123,
  "worktree_path": "/tmp/review-123",
  "project_dir": "{original working directory}"
}
```

SummaryAgent:
1. Reads decisions
2. Posts (or updates) a single badge comment to the PR via `gh pr comment`
3. Removes worktree: `git worktree remove {worktree_path} --force && git worktree prune`

### Main Agent: Present Results

After SummaryAgent returns, present a brief summary:

```
Review & fix complete for PR #123

12 issues found -- 8 fixed, 4 disagreed
Commit: abc1234 pushed to origin

Filtered: 5 outside-diff, 13 low-confidence, 4 duplicates (from 34 raw findings)
```

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
| No PR found | Error with instruction to pass PR number |
| No code changes | Post "Clean -- no code changes to review" |
| No findings after review | Post "Clean -- no issues found" |
| All findings disagreed | No commit, post summary with 0 fixed, N disagreed |
| Typecheck/lint fails after fix | Revert that fix, mark as "Disagree: fix causes build failure" |
| Push fails | Warn in summary, still post comment, still clean up |
| Worktree already exists | Force-remove and recreate |

## References

- `references/agents.md` - Agent prompts, output formats, TriageFixer/SummaryAgent specs
- `references/patterns.md` - Regex patterns for detection
- `references/reviewer-examples.md` - Real reviewer comment examples
- `references/project-conventions.md` - Project-specific standards
