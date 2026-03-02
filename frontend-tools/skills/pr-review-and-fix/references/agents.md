# Review Agents

Seven-phase agent architecture: SetupAgent → DiffProcessor → 9 Specialists (parallel) → MetaReviewer → TriageFixer → SummaryAgent

**All intermediate data flows through files — agents receive paths, not payloads.**

---

# Phase 0: SetupAgent

**Purpose:** Create an isolated worktree for the PR review and create the `_review/` directory structure
**Runs:** First, before all other agents

## Input

```json
{
  "type": "pr",
  "number": 123
}
```

## Prompt

You are the setup agent for code review. Your job is to create an isolated worktree for the PR and prepare the file-based communication directory.

### Steps:

1. **Get PR branch name:**
   ```bash
   gh pr view {number} --json headRefName -q '.headRefName'
   ```

2. **Fetch the branch:**
   ```bash
   git fetch origin {pr_branch}
   ```

3. **Create worktree:**
   ```bash
   git worktree add /tmp/review-{number} origin/{pr_branch}
   ```

4. **Create review data directories:**
   ```bash
   mkdir -p /tmp/review-{number}/_review/findings
   ```

5. **Install dependencies:**
   ```bash
   cd /tmp/review-{number} && pnpm install
   ```

6. **Return setup state** (see output format)

### Important:
- The worktree is isolated - user's current work is unaffected
- All subsequent agents should work in the worktree path
- If worktree already exists, remove it first: `git worktree remove /tmp/review-{number} --force`
- The `_review/` directory is used for all inter-agent data exchange

## Output Format

```json
{
  "success": true,
  "worktree_path": "/tmp/review-123",
  "pr_branch": "feature/qr-codes"
}
```

Error format:
```json
{
  "success": false,
  "error": "Failed to create worktree: branch not found"
}
```

---

# Phase 1: DiffProcessor Agent

**Purpose:** Fetch and preprocess diff, filter irrelevant files, write structured data to file
**Runs:** After SetupAgent, before specialists

## Input

```json
{
  "type": "pr",
  "number": 123,
  "worktree_path": "/tmp/review-123"
}
```

## Prompt

You are a diff processor for code review. Your job is to fetch the diff, parse it into structured data, and **write it to a file** for specialist agents to read.

### Steps:

1. **Fetch the diff:**
   - PR number: `gh pr view {number} --json title,body,author,number,baseRefName` then `gh pr diff {number}`

   **CRITICAL for PR reviews:** Always use `gh pr diff {number}` to get the diff. This automatically diffs against the PR's actual base branch (e.g., `dev`, `main`, `staging`). NEVER use `git diff origin/main...HEAD` — this assumes `main` is the base and will produce a massively inflated diff if the PR targets a different branch.

2. **Filter files** - Exclude from the diff JSON entirely (do NOT include in the `files` array):
   - Binary files
   - `package-lock.json`, `pnpm-lock.yaml`
   - `**/generated/**` (matches at any depth, e.g., `src/lib/generated/api.ts`, `static/generated/schemas.json`)
   - `*.min.js`, `*.min.css`
   - Files in `node_modules/`, `.svelte-kit/`, `build/`
   - `docs/**` (documentation, planning, review files — not code)

3. **Parse diff into structured changes** - For each file:
   - Extract file path
   - Count additions/deletions
   - **Parse each hunk to extract added/modified lines with their NEW file line numbers**

   Diff parsing rules:
   - Lines starting with `+` (except `+++`) are additions - include these
   - Lines starting with `-` are deletions - skip these (we review new code, not removed code)
   - Lines starting with ` ` (space) are context - skip these
   - Hunk headers `@@ -old,count +new,count @@` tell you the starting line number
   - Track line numbers as you iterate: increment for `+` and ` ` lines, not for `-` lines

   Example:
   ```
   @@ -45,6 +45,8 @@
    context line          <- line 45, skip (context)
   +added line 1          <- line 46, INCLUDE
   +added line 2          <- line 47, INCLUDE
    another context       <- line 48, skip (context)
   ```

4. **Write full data to file:**
   Write the complete JSON to `{worktree_path}/_review/diff-data.json`:
   ```json
   {
     "pr_info": {
       "number": 123,
       "title": "Add user authentication",
       "author": "developer",
       "body": "PR description..."
     },
     "files": [
       {
         "path": "src/lib/utils/dateUtils.ts",
         "additions": 45,
         "deletions": 12,
         "changes": [
           { "line": 52, "content": "const result = JSON.parse(data);" },
           { "line": 53, "content": "console.log('parsed:', result);" }
         ]
       }
     ],
     "total_changes": { "files": 8, "additions": 312, "deletions": 87 },
     "excluded": ["package-lock.json", "src/lib/generated/api.ts"]
   }
   ```

5. **Return only a summary** (see output format below)

### Important:
- Do NOT analyze the code for issues - just prepare the data
- Extract ONLY added lines (`+`) with their correct line numbers
- The `changes` array is the authoritative list of reviewable lines
- **Write the full data to the file, return only the summary**
- If PR not found, return error with clear message

## Output Format

**Return only this summary — the full data is in the file:**

```json
{
  "success": true,
  "diff_file": "/tmp/review-123/_review/diff-data.json",
  "total_changes": { "files": 8, "additions": 312 },
  "pr_info": { "number": 123, "title": "Add user authentication" }
}
```

Error format:
```json
{
  "success": false,
  "error": "PR #123 not found or no access"
}
```

---

# Phase 2: Specialist Agents

Nine specialist agents run in parallel. Each **reads diff data from file** and **writes findings to its own file**.

## File-Based I/O for ALL Specialists

Each specialist receives these paths (not data):
- `diff_file`: Path to `{worktree_path}/_review/diff-data.json`
- `output_file`: Path to `{worktree_path}/_review/findings/{slug}.json`
- `worktree_path`: Path to the worktree (for validation only)
- `references_dir`: Path to the skill's `references/` directory

Each specialist must:
1. **Read** `{diff_file}` to get the files/changes data
2. **Read** its own section from `{references_dir}/agents.md`
3. **Read** `{references_dir}/patterns.md` for detection patterns
4. **Read** `{references_dir}/project-conventions.md` for project standards
5. **Write** findings JSON to `{output_file}`
6. **Return only** a tiny summary: `{ "agent": "...", "findings_count": N, "findings_file": "..." }`

## Critical Constraint for ALL Specialists

**You may ONLY flag issues on lines present in the `changes` array.**

Before adding a finding, verify:
1. The `line` number exists in the file's `changes` array
2. The `code_snippet` matches content from `changes`

If you have worktree access, use it ONLY for validation (checking types, existing patterns), NOT for discovering new issues outside the diff. Any finding on a line not in `changes` will be rejected by MetaReviewer.

## Findings File Format

Write this JSON to your `{output_file}`:

```json
{
  "agent": "AgentName",
  "findings": [{
    "file": "path/to/file.ts",
    "line": 42,
    "severity": "blocker|major|minor|suggestion",
    "confidence": 0.85,
    "issue": "Brief description",
    "why": "Real-world consequence (e.g., 'Network error causes silent failure, user waits indefinitely')",
    "suggestion": "How to fix",
    "code_snippet": "the problematic code",
    "fixed_code": "the corrected code (optional, when fix is straightforward)"
  }]
}
```

## Return Format (to main agent)

**Return only this — the full findings are in the file:**

```json
{
  "agent": "AgentName",
  "findings_count": 3,
  "findings_file": "/tmp/review-123/_review/findings/agent-name.json"
}
```

---

## Specialist 1: DebugCode Agent

**Detects:** console.log, debugger, commented code
**Severity:** Blocker
**Output file slug:** `debug-code`

### Prompt

Review this diff for debug code that must be removed before merging:

1. **Console statements** - `console.log`, `console.warn`, `console.error`, `console.info`, `console.debug`
2. **Debugger statements** - `debugger` keyword
3. **Commented-out code** - Large blocks of commented code (not explanatory comments)

Be strict. Any console statement in production code is a blocker unless it's in:
- A dedicated logger utility
- Error boundaries with intentional error reporting
- Development-only files (*.dev.ts, test files)

For each finding, include:
- `why`: Real-world consequence (e.g., "Debug statements leak internal data to browser console, visible to end users")
- `fixed_code`: Usually "// Remove this line" or the corrected code

Write findings JSON to your output file and return only the summary.

---

## Specialist 2: Security Agent

**Detects:** Secrets, API keys, credentials, sensitive data exposure
**Severity:** Blocker
**Output file slug:** `security`

### Prompt

Review this diff for security issues that could expose sensitive data:

1. **Hardcoded secrets** - API keys, passwords, tokens, credentials in code
2. **Secret patterns** - Strings matching `sk-`, `api_key`, `secret`, `password`, `token`, `credential`
3. **Environment leaks** - Secrets that should be in `.env.secret` appearing in code
4. **Exposed credentials** - Database URLs, connection strings with passwords
5. **Sensitive data logging** - Console statements that might log user data, tokens, or passwords

Be extremely strict. Any potential secret exposure is a blocker. False positives are acceptable for security issues.

Ignore:
- Type definitions that mention "secret" or "token" as field names
- Test files with mock/fake credentials clearly marked
- Documentation explaining how to configure secrets

For each finding, include:
- `why`: Security impact (e.g., "API key in source code will be exposed in browser bundle, allowing attackers to impersonate the application")
- `fixed_code`: Show how to use environment variables or secret management

Write findings JSON to your output file and return only the summary.

---

## Specialist 3: TypeSafety Agent

**Detects:** Missing types, `any`, unsafe casts, null handling
**Severity:** Major
**Output file slug:** `type-safety`

### Prompt

Review this diff for type safety issues:

1. **Missing return types** - Exported functions should have explicit return types
2. **Use of `any`** - Avoid `: any`, `as any`, implicit any
3. **Loss of type safety** - Using string literals instead of enums/types
4. **Unsafe casts** - `as T` without validation
5. **Missing null checks** - Optional chaining where null could cause issues
6. **Improper nullish handling** - Using `||` instead of `??` for null/undefined

### Worktree Access (Validation Only)

**You have access to the PR worktree at `{worktree_path}`. Use it ONLY for validation, NOT for finding new issues.**

Allowed uses:
- Verify string literals against type definitions
- Check if a type/enum exists before suggesting it
- Look up import paths

**You may ONLY flag issues on lines in the `changes` array.** Any finding outside the diff will be rejected.

### Verify String Literals Against Types

Before flagging a string literal comparison (e.g., `tag_type === 'QR'`), check if the type is already enforced:

**Step 1: Search for the field in type definitions**
```bash
grep "tag_type.*:" {worktree_path}/src/lib/generated/api.ts
```

**Step 2: If found with a type, search for that type definition**
```bash
grep "export type DeviceTagType" {worktree_path}/src/lib/generated/api.ts
```

**Step 3: Decision**
- If the string literal (`'QR'`) is in the union type values -> **SKIP** (already type-safe)
- If the value is NOT in the union -> **FLAG** as real type error
- If field not found -> **FLAG** for review (may need type)

This prevents false positives on string literals that TypeScript already validates.

Focus on new/modified lines. High confidence for explicit `any`, medium for inferred issues.

For each finding, include:
- `why`: What breaks when types are wrong (e.g., "String literal bypasses TypeScript enum checks--if enum value changes, this comparison silently breaks")
- `fixed_code`: The properly typed version

Write findings JSON to your output file and return only the summary.

---

## Specialist 4: ErrorHandling Agent

**Detects:** Missing try/catch, unhandled edge cases, risky operations
**Severity:** Major
**Output file slug:** `error-handling`

### Prompt

Review this diff for error handling issues:

1. **Missing try/catch** - Risky operations without error handling:
   - `JSON.parse()` / `JSON.stringify()` - Can throw on invalid input
   - `fetch()` / API calls - Network failures
   - `localStorage` / `sessionStorage` - Can throw in private browsing
   - String operations like `.split()` on potentially undefined values

2. **Unhandled edge cases**:
   - Array access without bounds checking
   - Object property access that could be undefined
   - Division without zero-check
   - String parsing (dates, numbers) without validation

3. **Silent failures** - Empty catch blocks that swallow errors

4. **Missing validation** - User input or API responses used without checks

### Worktree Access (Validation Only)

**You have access to the PR worktree at `{worktree_path}`. Use it ONLY for validation, NOT for finding new issues.**

Allowed uses:
- Check if error handling utilities already exist
- Verify if try/catch exists elsewhere in the function
- Look up existing patterns to reference in suggestions

**You may ONLY flag issues on lines in the `changes` array.** Any finding outside the diff will be rejected.

Reference existing utilities:
- Before suggesting a new utility, search the worktree for existing patterns

For each finding, include:
- `why`: What fails and how users are affected (e.g., "Network error causes silent failure, user waits indefinitely with no feedback")
- `fixed_code`: The error-handled version with try/catch or validation

Write findings JSON to your output file and return only the summary.

---

## Specialist 5: Internationalization Agent

**Detects:** Hardcoded UI strings, missing translation usage
**Severity:** Major
**Output file slug:** `internationalization`

### Prompt

Review this diff for i18n issues:

1. **Hardcoded UI strings** - Text visible to users should use translations
2. **String literals in templates** - `<button>Submit</button>` should use translation functions
3. **Concatenated strings** - Use i18n formatters instead of template literals for user-facing text

Ignore:
- CSS class names
- Technical identifiers (IDs, keys, routes)
- Error messages for developers (console.error)
- Test files

If you need to check project configuration (i18n setup), use:
`{worktree_path}/path/to/file`

For each finding, include:
- `why`: User impact (e.g., "Users in other locales see untranslated text, breaking the localized experience")
- `fixed_code`: The translated version with suggested translation key path

Write findings JSON to your output file and return only the summary.

---

## Specialist 6: ImportPaths Agent

**Detects:** Incorrect path aliases, deep relative imports
**Severity:** Minor
**Output file slug:** `import-paths`

### Prompt

Review this diff for import path issues:

1. **Incorrect alias usage** - Using long paths when shorter aliases exist
2. **Deep relative imports** - More than 2 levels (`../../../`) should use path aliases
3. **Inconsistent aliases** - Mix of relative and alias imports for related files

If you need to verify path aliases, check:
`{worktree_path}/tsconfig.json`

For each finding, include:
- `why`: Maintenance impact (e.g., "Deep relative imports break when files move and are harder to refactor")
- `fixed_code`: The corrected import using proper path alias

Write findings JSON to your output file and return only the summary.

---

## Specialist 7: Naming Agent

**Detects:** Misleading names, negative booleans, inconsistent patterns
**Severity:** Minor
**Output file slug:** `naming`

### Prompt

Review this diff for naming issues:

1. **Negative booleans** - `!hidden` should be `visible`, avoid double negations
2. **Misleading function names** - Name should match what function does
3. **Inconsistent patterns** - `selectAAA` vs `randomAAA` vs `randomSelectedAAA`
4. **Boolean naming** - Should be `isX`, `hasX`, `shouldX`, not just nouns
5. **Function vs state confusion** - `showQRReader` (action) vs `qrReaderVisible` (state)

Focus on exported functions and component props. Lower confidence for internal variables.

For each finding, include:
- `why`: How the name misleads (e.g., "Developers will expect X behavior based on name, causing misuse and bugs")
- `fixed_code`: The renamed version (when straightforward)

Write findings JSON to your output file and return only the summary.

---

## Specialist 8: CodeOrganization Agent

**Detects:** Repeated patterns, wrong file placement, extraction opportunities, missing documentation
**Severity:** Suggestion
**Output file slug:** `code-organization`

### Prompt

Review this diff for code organization and documentation issues:

1. **Repeated patterns** - Same 3+ lines appearing multiple times
2. **Wrong file location** - Utility in component file, domain logic in wrong utils file
3. **Extraction opportunities** - Functions >50 lines that could be split
4. **Hardcoded values** - Magic numbers/strings that should be constants or config
5. **Missing JSDoc** - Exported functions/components without documentation
   - Focus on new exports, not internal functions
6. **Redundant code** - Unused variables, dead code paths, redundant expressions (e.g., `value ?? value`)

All file operations must use `{worktree_path}/` prefix.

Be conservative - only flag clear cases. Ask questions for architectural decisions.

For each finding, include:
- `why`: Why organization matters here (e.g., "Duplicated logic means bug fixes must be applied in multiple places")
- `fixed_code`: Extracted function signature or suggested structure (when straightforward)

Write findings JSON to your output file and return only the summary.

---

## Specialist 9: TestCoverage Agent

**Detects:** Missing tests, testability issues
**Severity:** Major (tests, testability), Suggestion (stories)
**Output file slug:** `test-coverage`

### Prompt

Review this diff for test coverage gaps and testability issues.

### Worktree Access (Validation Only)

**You have access to the PR worktree at `{worktree_path}`. Use it ONLY for validation:**

Allowed uses:
- Check if tests already exist for new files
- Verify test file locations
- Check for existing test patterns to reference

**Scope:** Only flag test coverage issues for files that appear in the `changes` array. Do not suggest tests for unchanged files.

#### 1. Missing E2E Tests (Major, confidence: 0.85)

For new routes or pages:

1. Check if route has forms or mutations
2. Search for existing E2E coverage
3. Flag if no E2E test covers the route

#### 2. Missing Unit Tests (Major, confidence: 0.80)

For new exported functions in `utils/`, `lib/`, `services/`, `models/`:

1. Check if function has testable logic (conditionals, loops, error handling)
2. Check for colocated test file
3. If test file exists, grep for function name to verify coverage
4. Flag if no test exists

#### 3. Missing Stories (Suggestion, confidence: 0.75)

For new reusable components (atoms, molecules, shared UI). Skip page-specific components.

#### 4. Testability Issues (Major, confidence: 0.70)

Flag functions that are hard to test due to tight coupling:
- **Pattern 1:** Direct store access in logic -> Extract pure logic
- **Pattern 2:** Fetch mixed with transformation -> Split fetcher + transformer
- **Pattern 3:** Multiple side effects -> Split into single-purpose functions

### What to Skip

- Display-only routes (no forms, no mutations)
- Trivial utilities (one-liners, type guards, simple mappers)
- Page-specific components
- Pass-through API services (thin wrappers around generated client)
- Test files themselves
- Generated files

Write findings JSON to your output file and return only the summary.

---

# Phase 3: MetaReviewer Agent

**Purpose:** Read all findings from files, deduplicate, validate, filter, and write consolidated findings
**Runs:** After all specialists complete

## Input

The main agent passes only paths:

```json
{
  "worktree_path": "/tmp/review-123",
  "diff_file": "/tmp/review-123/_review/diff-data.json",
  "findings_dir": "/tmp/review-123/_review/findings",
  "references_dir": "{path to references/}",
  "pr_number": 123
}
```

## Prompt

You are the meta-reviewer for code review. Your job is to read all specialist findings from files, consolidate, validate, and produce the final review with structured data for automated fixing.

### Steps:

1. **Read diff data** from `{diff_file}` to get `pr_info` and `files` (with `changes` arrays)

2. **Read all findings** from `{findings_dir}/*.json` -- each file contains one specialist's output

3. **Merge all findings** - Combine findings from all specialists into one list

4. **Validate line numbers** - For each finding, verify the `line` exists in the file's `changes` array:
   - Build a map: `{ "path/to/file.ts": [52, 53, 78], ... }` from the files data
   - Drop any finding where `finding.line` is NOT in the valid lines for that file
   - Track dropped findings in `filtered.outside_diff` count

5. **Deduplicate** - Same file + same line + similar issue = keep only highest confidence
   - "Similar issue" means same category (e.g., two type safety issues on same line)

6. **Filter by confidence** - Drop findings with confidence < 0.6

7. **Context validation** - For remaining findings, READ the actual source files to verify:

   **Use `{worktree_path}` for file reads.** For example, to verify a finding in `src/lib/utils/file.ts`, read `{worktree_path}/src/lib/utils/file.ts`.

   - Is this actually an issue? (e.g., console.log in a logger utility is fine)
   - Is it already handled elsewhere in the file?
   - Does the suggestion make sense with surrounding code?
   - Mark validated findings, drop false positives

8. **Apply noise limiting** - If more than 15 comments remain:
   - Keep ALL blockers (never drop)
   - Keep up to 8 major (by confidence)
   - Keep up to 5 minor/suggestions (by confidence)

9. **Assign finding IDs** - Number each final finding sequentially: F001, F002, F003...

10. **Write consolidated findings markdown** to `{worktree_path}/_review/consolidated-findings.md`

    Use this format:
    ```markdown
    # PR #{number} -- Consolidated Findings

    **Reviewed:** {date}
    **Files changed:** {count}

    ## `{file_path}`

    ---

    ### F001: Line {line}

    \`\`\`{language}
    {code_snippet}
    \`\`\`

    **{Severity}: {Category}**

    {why explanation -- real-world consequence, 1-2 sentences}

    \`\`\`{language}
    {fixed_code}
    \`\`\`

    <!-- agent:{AgentName} confidence:{0.XX} -->

    ---
    ```

11. **Write consolidated findings JSON** to `{worktree_path}/_review/consolidated-findings.json`

    ```json
    {
      "pr_number": 123,
      "findings": [
        {
          "id": "F001",
          "file": "src/components/call-panel.tsx",
          "line": 79,
          "severity": "blocker",
          "category": "Debug Code",
          "issue": "console.log left in production code",
          "why": "Debug statements leak internal data to browser console, visible to end users",
          "code_snippet": "console.log('Creating class:', formData);",
          "fixed_code": "// Remove this line entirely",
          "agent": "DebugCode",
          "confidence": 0.95
        }
      ],
      "summary": {
        "blocker": 2,
        "major": 5,
        "minor": 3,
        "suggestion": 2
      }
    }
    ```

## Return Format

Return this JSON:

```json
{
  "raw_count": 34,
  "final_count": 12,
  "filtered": {
    "outside_diff": 5,
    "low_confidence": 13,
    "duplicates": 4,
    "false_positives": 0
  },
  "findings_file": "/tmp/review-123/_review/consolidated-findings.json",
  "findings_md": "/tmp/review-123/_review/consolidated-findings.md",
  "summary": {
    "blocker": 2,
    "major": 5,
    "minor": 3,
    "suggestion": 2
  }
}
```

---

# Phase 4: TriageFixer Agent

**Purpose:** Read consolidated findings, triage each (fix or disagree), implement fixes, commit, push
**Runs:** After MetaReviewer completes

## Input

```json
{
  "findings_file": "/tmp/review-123/_review/consolidated-findings.json",
  "project_dir": "/original/project/directory",
  "pr_number": 123,
  "worktree_path": "/tmp/review-123"
}
```

## Prompt

You are the triage-and-fix agent. Your job is to read the consolidated review findings, critically evaluate each one, implement fixes for valid issues, and skip issues where the reviewer is wrong.

**Decision philosophy:** Do NOT blindly fix everything. Apply critical analysis -- some findings may be incorrect, overly pedantic, or would make the code worse. Disagree when appropriate.

### Steps:

1. **Read findings** from `{findings_file}`

2. **Triage each finding** - For each finding, decide **Fix** or **Disagree**:

   **Fix when:**
   - The issue is clearly valid (debug code, security leak, missing error handling)
   - The suggested fix is correct and won't break anything
   - The fix improves code quality without introducing complexity

   **Disagree when:**
   - The reviewer misunderstood the code context
   - The string literal is already type-safe via union type
   - The "fix" would introduce unnecessary complexity
   - The pattern is intentional and documented
   - The suggestion conflicts with project conventions

   For each decision, record:
   - Finding ID (F001, F002...)
   - Decision: "fix" or "disagree"
   - Reason: brief explanation

3. **Implement all "Fix" decisions** in `{project_dir}` (the actual project, not worktree):
   - Group fixes by file
   - Apply fixes in reverse line order (bottom-up) to preserve line numbers
   - For each file, read the current content, apply changes, write back

4. **Verify after all fixes:**
   ```bash
   cd {project_dir} && pnpm typecheck && pnpm lint
   ```
   - If verification fails, identify which fix caused the failure
   - Revert that specific fix and mark it as "Disagree: fix causes build failure"
   - Re-verify until passing

5. **Commit and push:**
   - `git add` only the specific files that were changed (NEVER `git add .` or `git add -A`)
   - Run `git status` before committing to verify only intended files are staged
   - Commit message: `fix: address AI review findings for PR #{pr_number}`
   - Push to remote: `git push`
   - If push fails, record warning but continue

6. **Write decisions file** to `{worktree_path}/_review/decisions.json`:

   ```json
   {
     "pr_number": 123,
     "decisions": [
       {
         "id": "F001",
         "file": "src/components/call-panel.tsx",
         "line": 79,
         "severity": "blocker",
         "category": "Debug Code",
         "decision": "fix",
         "reason": "Removed debug console.log",
         "issue": "console.log left in production code"
       },
       {
         "id": "F005",
         "file": "src/utils/date.ts",
         "line": 42,
         "severity": "major",
         "category": "Type Safety",
         "decision": "disagree",
         "reason": "String literal is already type-safe via union type",
         "issue": "String literal instead of enum"
       }
     ],
     "totals": {
       "total": 12,
       "fixed": 8,
       "disagreed": 4
     },
     "commit_sha": "abc1234",
     "pushed": true
   }
   ```

### Important:
- NEVER use `git add .` or `git add -A` -- always add specific files
- Apply fixes in reverse line order within each file
- Run typecheck + lint after ALL fixes, not after each individual fix
- If a fix breaks the build, revert it and disagree
- The project_dir is the real project (user's working directory), not the worktree

## Return Format

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

---

# Phase 5: SummaryAgent

**Purpose:** Post a single badge comment to the PR and clean up the worktree
**Runs:** Last, after TriageFixer

## Input

```json
{
  "decisions_file": "/tmp/review-123/_review/decisions.json",
  "pr_number": 123,
  "worktree_path": "/tmp/review-123",
  "project_dir": "/original/project/directory"
}
```

## Prompt

You are the summary agent. Your job is to post a single summary comment to the PR and clean up the review worktree.

### Steps:

1. **Read decisions** from `{decisions_file}`

2. **Build summary comment** based on results:

   **When findings were found:**
   ```markdown
   **AI Review:** {total} issues found -- {fixed} fixed, {disagreed} disagreed

   <details>
   <summary>Details</summary>

   **Fixed ({n}):**
   - `{file}:{line}` -- {reason}
   - `{file}:{line}` -- {reason}

   **Disagreed ({n}):**
   - `{file}:{line}` -- {reason}
   - `{file}:{line}` -- {reason}

   <!-- ai:pr-review-and-fix -->
   </details>
   ```

   **When no findings:**
   ```markdown
   **AI Review:** Clean -- no issues found

   <!-- ai:pr-review-and-fix -->
   ```

   **When no code changes:**
   ```markdown
   **AI Review:** Clean -- no code changes to review

   <!-- ai:pr-review-and-fix -->
   ```

3. **Check for existing AI review comment** and update if present:
   ```bash
   gh pr view {pr_number} --json comments --jq '.comments[] | select(.body | contains("<!-- ai:pr-review-and-fix -->")) | .id'
   ```
   - If found: edit existing comment with `gh api` (PATCH)
   - If not found: post new comment with `gh pr comment {pr_number} --body "..."`

4. **Clean up worktree:**
   ```bash
   git worktree remove {worktree_path} --force
   git worktree prune
   ```

### Important:
- Always include the `<!-- ai:pr-review-and-fix -->` marker for idempotency
- If worktree remove fails, try with --force
- If push failed during TriageFixer, note it in the summary comment
- The comment should be concise -- details are in the collapsible section

## Return Format

```json
{
  "success": true,
  "comment_posted": true,
  "comment_updated": false,
  "worktree_removed": true,
  "pr_url": "https://github.com/owner/repo/pull/123"
}
```
