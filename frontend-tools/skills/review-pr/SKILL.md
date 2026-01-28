---
name: review-pr
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
/review-pr post 123     # Post review comments to GitHub PR
/review-pr post         # Post to PR (auto-detect from branch)
```

## Process

Five-phase architecture to minimize main agent context usage:

```
Phase 0: Setup ────────► SetupAgent
                              │
                              ▼
Phase 1: Preparation ──► DiffProcessor agent
                              │
                              ▼
Phase 2: Review ───────► 9 Specialist agents (parallel)
                              │
                              ▼
Phase 3: Consolidation ► MetaReviewer agent
                              │
                              ▼
Phase 4: Cleanup ──────► CleanupAgent
                              │
                              ▼
Main Agent ◄─────────── Final summary to user
```

### Phase 0: Launch SetupAgent

Spawn **SetupAgent** before any other work. This agent creates an isolated worktree for the review:

1. **Get PR branch name:**
   - `gh pr view {number} --json headRefName -q '.headRefName'`

2. **Create worktree:**
   - `git worktree add /tmp/review-{number} origin/{pr-branch}`

3. **Generate fresh types (in worktree):**
   - `cd /tmp/review-{number} && pnpm install && pnpm run generate:api-types`

SetupAgent returns:
```json
{
  "success": true,
  "worktree_path": "/tmp/review-123",
  "pr_branch": "feature/qr-codes"
}
```

### Phase 1: Launch DiffProcessor Agent

Spawn **DiffProcessor** agent with the user's arguments:

| Argument | Passed to Agent |
|----------|-----------------|
| (none) | `{ "type": "local", "staged": false }` |
| `--staged` | `{ "type": "local", "staged": true }` |
| Number | `{ "type": "pr", "number": 123 }` |
| URL | `{ "type": "pr", "url": "..." }` |

DiffProcessor returns:
```json
{
  "pr_info": { "number": 123, "title": "...", "author": "..." },
  "files": [
    { "path": "src/lib/utils/dateUtils.ts", "additions": 45, "deletions": 12 },
    { "path": "src/routes/app/classes/+page.svelte", "additions": 120, "deletions": 30 }
  ],
  "total_changes": { "files": 8, "additions": 312, "deletions": 87 },
  "diff_chunks": {
    "src/lib/utils/dateUtils.ts": "... diff content ...",
    "src/routes/app/classes/+page.svelte": "... diff content ..."
  },
  "excluded": ["package-lock.json", "generated/api.ts"]
}
```

### Phase 2: Launch 9 Specialist Agents in Parallel

Spawn all 9 agents in a **single message** with their assigned diff chunks:

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

Each agent:
1. Receives diff chunks relevant to its focus
2. Reads its own section from `references/agents.md`
3. Reads relevant patterns from `references/patterns.md`
4. Returns findings JSON

Agent output format:
```json
{
  "agent": "TypeSafety",
  "findings": [{
    "file": "src/lib/api/services/search.ts",
    "line": 126,
    "severity": "major",
    "confidence": 0.85,
    "issue": "Loss of type safety - using string literal instead of enum",
    "why": "String literals bypass TypeScript's enum checks—if the enum value changes, this comparison silently breaks",
    "suggestion": "Use `AppointmentStatus.DECLINED` instead of `'DECLINED'`",
    "code_snippet": "booking.appointment_status !== 'DECLINED'",
    "fixed_code": "booking.appointment_status !== AppointmentStatus.DECLINED"
  }]
}
```

### Phase 3: Launch MetaReviewer Agent

Spawn **MetaReviewer** agent with:
- All specialist findings (merged)
- PR info from Phase 1
- File list for context validation

MetaReviewer performs:
1. **Deduplication** - Same file + line + similar issue = keep highest confidence
2. **Confidence threshold** - Drop findings below 0.6
3. **Context validation** - Read actual files to verify issues
4. **Noise limiting** - Cap at 15 comments (all blockers, 8 major, 5 minor/suggestions)
5. **Write output file** - `./docs/reviews/review-{pr}.md` (grouped by file, ordered by line)

MetaReviewer returns:
```json
{
  "raw_count": 34,
  "final_count": 12,
  "filtered": { "low_confidence": 18, "duplicates": 4 },
  "output_file": "./docs/reviews/review-123.md",
  "summary": {
    "blocker": 2,
    "major": 5,
    "minor": 3,
    "suggestion": 2
  }
}
```

### Main Agent: Present Results

The main agent only presents the final summary to the user:

```
Review complete for PR #123

12 comments ready for GitHub (./docs/reviews/review-123.md)

| Severity | Count |
|----------|-------|
| Blocker | 2 |
| Major | 5 |
| Minor | 3 |
| Suggestion | 2 |

Filtered out: 18 low-confidence, 4 duplicates (from 34 raw findings)
```

### Phase 4: Launch CleanupAgent

After presenting results, spawn **CleanupAgent** to remove the worktree:

1. **Remove worktree:**
   - `git worktree remove {worktree_path}`

2. **Prune worktree references (optional):**
   - `git worktree prune`

CleanupAgent returns:
```json
{
  "success": true,
  "removed_worktree": "/tmp/review-123"
}
```

## Output Format

Output is a single file (`./docs/reviews/review-{pr}.md`) with inline comments ready to copy-paste into GitHub PR line comments. No separate summary table—each comment is self-contained.

### File Header

```markdown
# PR #123 — File Comments

**Reviewed:** 2026-01-19
**Files changed:** 8
```

### Comment Block (Blocker)

```markdown
## `src/routes/app/classes/[id]/+page.svelte`

---

### Line 79

\`\`\`svelte
console.log('Creating class:', formData);
\`\`\`

**Blocker: Debug Code**

Debug statements leak internal data structures to browser console, making it visible to end users and potential attackers.

\`\`\`svelte
// Remove this line entirely
\`\`\`

<!-- agent:DebugCode confidence:0.95 -->
```

### Comment Block (Major with fix)

```markdown
---

### Line 126

\`\`\`typescript
booking.appointment_status !== 'DECLINED'
\`\`\`

**Major: Type Safety**

String literals bypass TypeScript's enum checks—if the enum value changes, this comparison silently breaks with no compiler warning.

\`\`\`typescript
booking.appointment_status !== AppointmentStatus.DECLINED
\`\`\`

<!-- agent:TypeSafety confidence:0.85 -->
```

### Comment Block (Suggestion)

```markdown
---

### Lines 102-111

\`\`\`typescript
export function sortStaffByWorkHours<T extends Staff>(
  staffList: T[],
  _workHoursList: WorkHour[],
\`\`\`

**Suggestion: Naming**

Function name promises sorting by work hours but actually sorts alphabetically. Developers will misuse this expecting work-hour ordering, causing subtle bugs in scheduling logic.

Consider renaming to `sortStaffAlphabetically` and removing the unused `_workHoursList` parameter.

<!-- agent:Naming confidence:0.82 -->
```

## Severity Levels

| Level | Icon | Description |
|-------|------|-------------|
| Blocker | (none) | Must fix before merge |
| Major | (none) | Should fix |
| Minor | (none) | Nice to fix |
| Suggestion | (none) | Optional improvement |

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| PR not found | Clear error message |
| No code changes | "No code files to review" |
| Very large PR (50+ files) | Warn user, proceed anyway |
| Binary/generated files | Auto-exclude |
| No findings | "No issues found" |

## Posting Reviews to GitHub

The `post` command reads an existing review file and posts comments directly to GitHub as inline PR comments.

### Post Command Flow

```
/review-pr post 123
        │
        ▼
   PostAgent
        │
        ├── 1. Read ./docs/reviews/review-123.md
        ├── 2. Parse comments from markdown
        ├── 3. Fetch existing GitHub comments
        ├── 4. Fetch current diff (validate lines)
        ├── 5. Filter duplicates + stale lines
        ├── 6. Show preview, ask confirmation
        ├── 7. Submit review via API
        └── 8. Report results
        │
        ▼
   Done
```

### Preview and Confirmation

Before posting, the agent shows a full preview:

```
┌─────────────────────────────────────────────────────────────┐
│ Ready to post 10 comments to PR #123                        │
│ "Add QR code scanning feature"                              │
├─────────────────────────────────────────────────────────────┤
│ Skipped (already posted): 2                                 │
│ Skipped (line not in diff): 1                               │
└─────────────────────────────────────────────────────────────┘

Comments to post:

1. src/lib/api/services/scanner.ts:45
   Blocker: Debug Code — console.log statement in production code

2. src/lib/api/services/scanner.ts:89
   Major: Error Handling — Missing try/catch around JSON.parse

... (more)

Post these comments? [y/N]:
```

### After Posting

```
Posted 10 comments to PR #123

Results:
  ✓ 9 posted successfully
  ⚠ 1 skipped (line 45 no longer in diff)

View at: https://github.com/owner/repo/pull/123
```

### Post Command Edge Cases

| Scenario | Behavior |
|----------|----------|
| Review file not found | Error: "No review found at ./docs/reviews/review-123.md" |
| All comments already posted | "All comments already posted or stale" |
| User declines confirmation | Abort with no changes |
| Some lines no longer exist | Post valid comments, report skipped |

## References

- `references/agents.md` - Agent prompts and output format
- `references/patterns.md` - Regex patterns for detection
- `references/reviewer-examples.md` - Real Nicolas/Vincent comments
- `references/project-conventions.md` - Yond-specific standards
