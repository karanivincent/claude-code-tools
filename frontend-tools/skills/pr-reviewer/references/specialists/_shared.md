# Specialist Shared Instructions

All specialists follow these rules. Read once at the start of your run.

## File I/O

You receive paths, not data:
- `diff_file` — read `{worktree_path}/_review/diff-data.json` to get files/changes
- `output_file` — write findings JSON here
- `worktree_path` — for validation reads only (verifying types, checking existing utilities)

## Critical Constraint

**You may ONLY flag issues on lines present in the `changes` array.**

Before adding a finding, verify:
1. The `line` number exists in the file's `changes` array
2. The `code_snippet` matches content from `changes`

Worktree access is for validation, NOT discovery. Findings on lines outside `changes` are rejected by MetaReviewer.

## Findings File Format

Write this JSON to `{output_file}`:

```json
{
  "agent": "AgentName",
  "findings": [{
    "file": "path/to/file.ts",
    "line": 42,
    "severity": "blocker|major|minor|suggestion",
    "confidence": 0.85,
    "issue": "Brief description",
    "why": "Real-world consequence (1-2 sentences, concrete impact)",
    "suggestion": "How to fix",
    "code_snippet": "the problematic line from changes array",
    "fixed_code": "corrected version (optional, omit for complex issues)"
  }]
}
```

## Return Format

Return ONLY this small object — the full findings live in the file:

```json
{
  "agent": "AgentName",
  "findings_count": 3,
  "findings_file": "/tmp/review-123/_review/findings/agent-name.json"
}
```

## Confidence Calibration

- 0.95+ — Pattern match is unambiguous (e.g., `console.log` in non-logger code)
- 0.80-0.94 — Strong signal but context could change verdict
- 0.60-0.79 — Probable issue, MetaReviewer will weigh against duplicates
- Below 0.60 — Don't report; MetaReviewer drops these anyway
