# Review Agents

Five-phase agent architecture: SetupAgent → DiffProcessor → 9 Specialists (parallel) → MetaReviewer → CleanupAgent

Standalone agent for posting: PostAgent (triggered by `/review-pr post` or auto-post mode)

**All intermediate data flows through files — agents receive paths, not payloads.**

---

# Phase 0: SetupAgent

**Purpose:** Create an isolated worktree for the PR review, generate fresh API types, and create the `_review/` directory structure
**Runs:** First, before all other agents

## Input

```json
{
  "type": "local|pr",
  "number": 123,           // for PR
  "url": "https://..."     // for PR URL
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

5. **Install dependencies and generate types:**
   ```bash
   cd /tmp/review-{number} && pnpm install && pnpm run generate:api-types
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
  "type": "local|pr",
  "staged": true,          // for local
  "number": 123,           // for PR
  "url": "https://...",    // for PR URL
  "worktree_path": "/tmp/review-123"
}
```

## Prompt

You are a diff processor for code review. Your job is to fetch the diff, parse it into structured data, and **write it to a file** for specialist agents to read.

### Steps:

1. **Fetch the diff:**
   - Local unstaged: `git diff`
   - Local staged: `git diff --cached`
   - PR number: `gh pr view {number} --json title,body,author,number,baseRefName` then `gh pr diff {number}`
   - PR URL: Extract owner/repo/number, use `gh pr diff`

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
- Verify string literals against `api.ts` type definitions
- Check if a type/enum exists before suggesting it
- Look up import paths

**You may ONLY flag issues on lines in the `changes` array.** Any finding outside the diff will be rejected.

### Verify String Literals Against api.ts

Before flagging a string literal comparison (e.g., `tag_type === 'QR'`), check if the type is already enforced:

**Step 1: Search for the field in api.ts**
```bash
grep "tag_type.*:" {worktree_path}/src/lib/generated/api.ts
```
Example result: `tag_type?: DeviceTagType | null;`

**Step 2: If found with a type, search for that type definition**
```bash
grep "export type DeviceTagType" {worktree_path}/src/lib/generated/api.ts
```
Example result: `export type DeviceTagType = "MIFARE" | "APPLE" | "GOOGLE" | "QR" | "OTHER";`

**Step 3: Decision**
- If the string literal (`'QR'`) is in the union type values → **SKIP** (already type-safe)
- If the value is NOT in the union → **FLAG** as real type error
- If field not found in api.ts → **FLAG** for review (FE-only field may need type)

This prevents false positives on string literals that TypeScript already validates.

Focus on new/modified lines. High confidence for explicit `any`, medium for inferred issues.

For each finding, include:
- `why`: What breaks when types are wrong (e.g., "String literal bypasses TypeScript enum checks—if enum value changes, this comparison silently breaks")
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
- Before suggesting a new utility, search the worktree for existing patterns:
  ```bash
  grep -r "safeJson" {worktree_path}/src/lib/utils/
  ```
- Nicolas mentioned: "JSON.stringify can throw exceptions. I think we recently implemented a function which has try/catch inside"

For each finding, include:
- `why`: What fails and how users are affected (e.g., "Network error causes silent failure, user waits indefinitely with no feedback")
- `fixed_code`: The error-handled version with try/catch or validation

Write findings JSON to your output file and return only the summary.

---

## Specialist 5: Internationalization Agent

**Detects:** Hardcoded UI strings, missing `$LL` usage
**Severity:** Major
**Output file slug:** `internationalization`

### Prompt

Review this diff for i18n issues in this SvelteKit project using typesafe-i18n:

1. **Hardcoded UI strings** - Text visible to users should use `$LL` translations
2. **String literals in templates** - `<button>Submit</button>` should be `<button>{$LL.common.submit()}</button>`
3. **Concatenated strings** - Use i18n formatters instead of template literals for user-facing text

Ignore:
- CSS class names
- Technical identifiers (IDs, keys, routes)
- Error messages for developers (console.error)
- Test files

If you need to check project configuration (i18n setup, svelte.config.js), use:
`{worktree_path}/path/to/file`

For each finding, include:
- `why`: User impact (e.g., "German users see English text, breaking the localized experience")
- `fixed_code`: The `$LL` version with suggested translation key path

Write findings JSON to your output file and return only the summary.

---

## Specialist 6: ImportPaths Agent

**Detects:** `$root/src/lib`, deep relative imports
**Severity:** Minor
**Output file slug:** `import-paths`

### Prompt

Review this diff for import path issues:

1. **$root/src/lib usage** - Should use `$lib` alias instead of `$root/src/lib`
2. **Deep relative imports** - More than 2 levels (`../../../`) should use path aliases
3. **Inconsistent aliases** - Mix of relative and alias imports for related files

Path aliases available: `$lib`, `$components`, `$utils`, `$models`, `$i18n`, `$routes`

If you need to verify path aliases, check:
`{worktree_path}/tsconfig.json` or `{worktree_path}/svelte.config.js`

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
2. **Wrong file location** - Utility in component file, finance logic in generalUtils
3. **Extraction opportunities** - Functions >50 lines that could be split
4. **Hardcoded values** - Magic numbers/strings that should be constants or config
5. **Missing JSDoc** - Exported functions/components without documentation
   - Focus on new exports, not internal functions
   - Nicolas: "please add some JSDoc" / "As mentioned earlier, we should have JSDoc for any export properties"
   - Vincent: "If this is meant to be a reusable utility function, please add some jsdoc"
6. **Redundant code** - Unused variables, dead code paths, redundant expressions (e.g., `value ?? value`)

All file operations must use `{worktree_path}/` prefix.

Be conservative - only flag clear cases. Ask questions for architectural decisions.

For each finding, include:
- `why`: Why organization matters here (e.g., "Duplicated logic means bug fixes must be applied in multiple places")
- `fixed_code`: Extracted function signature or suggested structure (when straightforward)

Write findings JSON to your output file and return only the summary.

---

## Specialist 9: TestCoverage Agent

**Detects:** Missing tests, missing Storybook stories, testability issues
**Severity:** Major (tests, testability), Suggestion (stories)
**Output file slug:** `test-coverage`

### Prompt

Review this diff for test coverage gaps and testability issues.

### Worktree Access (Validation Only)

**You have access to the PR worktree at `{worktree_path}`. Use it ONLY for validation:**

Allowed uses:
- Check if tests/stories already exist for new files
- Verify test file locations
- Check for existing test patterns to reference

**Scope:** Only flag test coverage issues for files that appear in the `changes` array. Do not suggest tests for unchanged files.

#### 1. Missing E2E Tests (Major, confidence: 0.85)

For new routes (`+page.svelte`, `+page.ts`):

1. Check if route has forms or mutations:
   - Search for: `<form`, `use:enhance`, `createMutation`, `$mutation`
   - If none found → skip (display-only page)

2. Search for existing E2E coverage:
   ```bash
   find {worktree_path}/e2e -name "*.spec.ts" | xargs grep -l "route-keyword"
   ```

3. Flag if no E2E test covers the route

#### 2. Missing Unit Tests (Major, confidence: 0.80)

For new exported functions in `utils/`, `lib/`, `services/`, `models/`:

1. Check if function has testable logic (conditionals, loops, error handling)
2. Check for colocated test file
3. If test file exists, grep for function name to verify coverage
4. Flag if no test exists

#### 3. Missing Storybook Stories (Suggestion, confidence: 0.75)

For new `.svelte` components in `components/atoms/`, `components/molecules/`, `packages/ui/`. Skip organisms and page-specific components.

#### 4. Testability Issues (Major, confidence: 0.70)

Flag functions that are hard to test due to tight coupling:
- **Pattern 1:** Direct store access in logic → Extract pure logic
- **Pattern 2:** Fetch mixed with transformation → Split fetcher + transformer
- **Pattern 3:** Multiple side effects → Split into single-purpose functions

### What to Skip

- Display-only routes (no forms, no mutations)
- Trivial utilities (one-liners, type guards, simple mappers)
- Organisms and page-specific components
- Pass-through API services (thin wrappers around generated client)
- Test files themselves
- Generated files

Write findings JSON to your output file and return only the summary.

---

# Phase 3: MetaReviewer Agent

**Purpose:** Read all findings from files, deduplicate, validate, filter, and write final review
**Runs:** After all specialists complete

## Input

The main agent passes only paths:

```json
{
  "worktree_path": "/tmp/review-123",
  "diff_file": "/tmp/review-123/_review/diff-data.json",
  "findings_dir": "/tmp/review-123/_review/findings",
  "references_dir": "{path to references/}",
  "project_dir": "/original/project/directory"
}
```

## Prompt

You are the meta-reviewer for code review. Your job is to read all specialist findings from files, consolidate, validate, and produce the final review.

### Steps:

1. **Read diff data** from `{diff_file}` to get `pr_info` and `files` (with `changes` arrays)

2. **Read all findings** from `{findings_dir}/*.json` — each file contains one specialist's output

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

9. **Read review format references** from `{references_dir}/agents.md` if needed for output formatting

10. **Write output file** to `{project_dir}/docs/reviews/review-{pr}.md`
    - **Important:** Use the `{project_dir}` path (original project, NOT the worktree)
    - Create the directory if it doesn't exist: `mkdir -p {project_dir}/docs/reviews`
    - Group comments by file, ordered by line number within each file

### Output File Format

Use this markdown format (comments grouped by file, ordered by line number):

```markdown
# PR #{number} — File Comments

**Reviewed:** {date}
**Files changed:** {count}

## `{file_path}`

---

### Line {line}

\`\`\`{language}
{code_snippet}
\`\`\`

**{Severity}: {Category}**

{why explanation — real-world consequence, 1-2 sentences}

\`\`\`{language}
{fixed_code}
\`\`\`

<!-- agent:{AgentName} confidence:{0.XX} -->

---

### Line {next_line}

...

## `{next_file_path}`

---

### Line {line}

...
```

**Format notes:**
- Each file gets an H2 header (`## \`path/to/file.ts\``)
- Each comment gets an H3 header (`### Line X` or `### Lines X-Y`)
- The "why" explanation must describe real-world consequences, not just "this is bad"
- Include `fixed_code` block when the fix is straightforward
- Omit `fixed_code` block for complex architectural issues that need discussion

### Output Format Examples

**Blocker example:**
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

**Major example:**
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

**Suggestion example:**
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
  "output_file": "./docs/reviews/review-123.md",
  "review_file": "/absolute/path/to/project/docs/reviews/review-123.md",
  "summary": {
    "blocker": 2,
    "major": 5,
    "minor": 3,
    "suggestion": 2
  }
}
```

**Note:** `outside_diff` counts findings that were rejected because their line number was not in the `changes` array. `review_file` is the absolute path for use by PostAgent.

---

# Phase 4: CleanupAgent

**Purpose:** Remove the worktree and clean up stale review files
**Runs:** Last, after MetaReviewer (and PostAgent if auto-posting)

## Input

```json
{
  "worktree_path": "/tmp/review-123",
  "project_dir": "/original/project/directory"
}
```

## Prompt

You are the cleanup agent for code review. Your job is to remove the worktree and clean up stale review files.

### Steps:

1. **Remove worktree:**
   ```bash
   git worktree remove {worktree_path}
   ```

2. **Prune worktree references (optional cleanup):**
   ```bash
   git worktree prune
   ```

3. **Trash stale review files:**
   Check `{project_dir}/docs/reviews/` for old review files and trash any older than 7 days:
   ```bash
   find {project_dir}/docs/reviews -name "review-*.md" -mtime +7 -exec trash {} \;
   ```
   If no `docs/reviews/` directory exists, skip this step.

### Important:
- If worktree remove fails, try with `--force`
- The user's main working directory is unaffected
- Use `trash` instead of `rm` for review file cleanup

## Output Format

```json
{
  "success": true,
  "removed_worktree": "/tmp/review-123",
  "stale_reviews_trashed": 2
}
```

With warnings:
```json
{
  "success": true,
  "removed_worktree": "/tmp/review-123",
  "stale_reviews_trashed": 0,
  "warnings": ["Had to use --force to remove worktree"]
}
```

---

# PostAgent

**Purpose:** Post review comments from markdown file to GitHub PR as inline comments
**Runs:** Standalone via `/review-pr post`, or automatically in auto-post mode

## Input

```json
{
  "type": "post",
  "pr_number": 123,
  "review_file": "./docs/reviews/review-123.md",
  "auto_post": false
}
```

- `auto_post`: When `true`, skip the confirmation prompt (still show preview)
- If `pr_number` is not provided, detect from current branch:
  ```bash
  gh pr view --json number -q '.number'
  ```

## Prompt

You are the post agent for code review. Your job is to post review comments to GitHub as inline PR comments.

### Steps:

1. **Read and parse the review file**

   Parse `docs/reviews/review-{pr}.md` to extract comments. The format is:

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

   Extract into structure:
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
   - `## \`{path}\`` → file path
   - `### Line {n}` or `### Lines {n}-{m}` → line number (use start line for ranges)
   - `**{Severity}: {Category}**` → severity and category
   - Body = everything from severity header through fix code block
   - Strip the `<!-- agent:... -->` metadata from body

2. **Get PR details**
   ```bash
   gh api repos/{owner}/{repo}/pulls/{pr} --jq '{head_sha: .head.sha, title: .title}'
   ```

3. **Fetch existing review comments**
   ```bash
   gh api repos/{owner}/{repo}/pulls/{pr}/comments --paginate
   ```

4. **Filter duplicates**

   A comment is a duplicate if ALL match:
   - Same `path` (file)
   - Same `line` (within ±2 lines to handle minor shifts)
   - Body starts with same severity header (e.g., `**Blocker: Debug Code**`)

   Skip any comment that's already posted.

5. **Validate line numbers exist in current diff**
   ```bash
   gh pr diff {pr}
   ```

   Parse the diff to build a map of `{file: [valid_lines]}`. A line is valid if it appears in the diff as an addition (`+` line).

   Mark comments on invalid lines as "stale" and skip them.

6. **Show preview and handle confirmation**

   Display:
   ```
   Ready to post {n} comments to PR #{pr} "{pr_title}"
   Skipped (already posted): {n}
   Skipped (line not in diff): {n}

   Comments to post:

   1. {file}:{line}
      {Severity}: {Category} — {first line of explanation}

   2. {file}:{line}
      {Severity}: {Category} — {first line of explanation}

   ... (more)
   ```

   **If `auto_post` is `false` (or absent):** Use AskUserQuestion tool with options: "Yes, post comments" / "No, cancel"

   **If `auto_post` is `true`:** Skip confirmation, proceed directly to posting.

7. **Submit review to GitHub**

   Build the comments array:
   ```json
   [
     {
       "path": "src/lib/api/services/scanner.ts",
       "line": 89,
       "side": "RIGHT",
       "body": "**Major: Error Handling**\n\nJSON.parse can throw...\n\n<!-- ai:review-pr -->"
     }
   ]
   ```

   **Important:** Append `\n\n<!-- ai:review-pr -->` to every comment body before writing to comments.json. This invisible marker enables programmatic identification of AI-generated comments.

   Submit as a single review:
   ```bash
   gh api repos/{owner}/{repo}/pulls/{pr}/reviews \
     --method POST \
     -f event="COMMENT" \
     -f commit_id="{head_sha}" \
     -f body="AI-assisted code review ({n} comments)\n\n<!-- ai:review-pr -->" \
     --input comments.json
   ```

   Note: `side: "RIGHT"` means commenting on the new version (additions).

8. **Trash review file after successful posting**
   ```bash
   trash {review_file}
   ```
   The review comments are now on GitHub — the local file has served its purpose.

9. **Report results**

   ```
   Posted {n} comments to PR #{pr}

   Results:
     ✓ {n} posted successfully
     ⚠ {n} skipped (already posted)
     ⚠ {n} skipped (line not in diff)

   Review file trashed (comments now on GitHub)
   View at: https://github.com/{owner}/{repo}/pull/{pr}
   ```

### Important:
- In manual mode, always ask for confirmation before posting
- In auto-post mode, skip confirmation but still show the preview
- The review is submitted with `event: "COMMENT"` (neutral, no approval/rejection)
- If user declines (manual mode), abort with no changes
- This command is idempotent - running it twice won't create duplicates
- Always trash the review file after successful posting

## Output Format

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

Error format:
```json
{
  "success": false,
  "error": "Review file not found: docs/reviews/review-123.md"
}
```

User declined:
```json
{
  "success": false,
  "error": "User cancelled",
  "reason": "declined_confirmation"
}
```
