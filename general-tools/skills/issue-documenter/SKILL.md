---
name: issue-documenter
description: >
  Document user stories and bug reports for Linear. Handles two modes:
  (1) User Story mode - create well-scoped stories with acceptance criteria. Triggers: "write a story",
  "create a story for", "break down this feature", "scope this work", "new feature".
  (2) Bug Report mode - investigate and document bugs using Sentry, Vercel, Render, and browser tools.
  Triggers: "report a bug", "document this bug", "bug report", "something is broken", "log this issue",
  "this isn't working", "found a bug", "there's an error". Can enrich existing rough Linear issues or
  create new detailed reports from scratch. This skill ONLY documents - it does NOT suggest fixes,
  root causes, or solutions.
---

# Issue Documenter

Document user stories and bug reports for Linear. Two modes: **User Story** and **Bug Report**.

**CRITICAL: This skill documents only. NEVER suggest fixes, root causes, or solutions.**

## Mode Detection

Determine mode from user input:

- **Bug keywords** (report, bug, broken, error, not working, issue, fix needed) -> Bug Report mode
- **Story keywords** (story, feature, scope, as a user, I want) -> User Story mode
- **Ambiguous** -> Ask: "Is this a bug report or a new feature story?"
- **Bug that's actually a feature** -> Ask: "This sounds more like a feature. Switch to user story mode?"

---

## User Story Mode

Create well-scoped user stories with clear boundaries and testable acceptance criteria.

### Template

```markdown
## [Action-oriented title]

**As a** [persona - the actual user, not technical role],
**I want** [goal - user intent, not implementation],
**so that** [benefit - the "why"].

### Acceptance Criteria
- [ ] [Testable behavior]

### Edge Cases (this story)
- [ ] [Edge case to handle]

### Out of Scope
- [Excluded feature] -> ISSUE-XX (link if exists)
- [Excluded feature] (future story)

### Implementation Notes

**Constraints:**
- [Technology/library requirements]

**Patterns to Follow:**
- See `path/to/example` for similar implementation

**Existing Code to Use:**
- `ComponentName` in `src/path/`
```

### Scope Control Rules

| Rule | Check |
|------|-------|
| **One Outcome** | Story delivers exactly one user-visible outcome. "And also..." = two stories. |
| **Explicit Boundaries** | Every story MUST have "Out of Scope" section. |
| **Edge Case Triage** | Each edge case is either handled (this story) or deferred (out of scope). |
| **No Scope Creep** | New ideas become new stories. Ask: "Core to outcome, or separate story?" |
| **Size Limit** | >5 acceptance criteria or >3 edge cases = consider splitting. |

### Acceptance Criteria Guidelines

Must be: testable (yes/no), user-observable, specific, independent.

| Bad | Good |
|-----|------|
| "Works correctly" | "User can see list with date and duration" |
| "Handle errors" | "When API fails, user sees error with retry option" |
| "Fast" | "Loads within 2 seconds" |

### User Story Workflow

1. **Understand** - Ask: "What single user outcome?" Confirm persona.
2. **Boundaries** - Ask: "What's NOT part of this?" Check for sibling stories.
3. **Criteria** - Write max 5 behaviors. List edge cases.
4. **Triage** - For each edge case: handle now or defer?
5. **Implementation** - Ask: "Technical constraints or patterns to follow?"
6. **Size Check** - If too large, suggest child stories under same epic.
7. **Output** - Produce complete story ready for Linear markdown.

---

## Bug Report Mode

Investigate and document bugs with evidence from dev tools. Documentation only — no fix suggestions.

### Entry Points

1. **From existing Linear issue** — User provides issue ID/URL -> read the rough note, enrich it
2. **From scratch** — User describes the bug -> create a new detailed report

### Bug Report Workflow

#### Step 1: Capture Basics

Ask one at a time:
1. What's the bug? (or read from existing Linear issue)
2. Where did it happen? (URL/page/feature — needed for service inference)
3. Which environment? (staging/production)

#### Step 2: Infer Services

Based on description and URL, determine which services to check.
Read [references/service-mapping.md](references/service-mapping.md) for the keyword-to-service mapping and tool priority.

#### Step 2.5: Probe and Initialize Tools

Auto-discover which investigation tools are available and initialize them before evidence collection.

1. Use `ToolSearch` to probe each service's MCP tool (see service-mapping.md for exact queries)
2. For unavailable MCP tools, check CLI fallback, then browser fallback URL from env vars
3. If any MCP tool is unavailable after probing: read [references/env-vars.md](references/env-vars.md) for fallback URLs and credentials. `ISSUE_DOCUMENTER_*` variables live in the repository root `.env` only.
4. **Initialize discovered tools** (see service-mapping.md for prerequisite calls per service):
   - **Sentry:** **NEVER guess the organizationSlug** — always call `find_organizations` first → store `organizationSlug` + `regionUrl`
   - **Render:** Call `list_workspaces` (auto-selects if one) → `list_services` → match service by name/keyword from bug description → store resource ID
   - **Vercel:** Read `.vercel/project.json` for `projectId` and `teamId`. In monorepos, also check `apps/*/vercel/project.json` if the root path doesn't exist.
   - **Linear:** Call `list_teams` → store team name for issue creation in Step 5
5. Build internal investigation plan: ordered list of sources with the tool to use for each

#### Step 2.7: Analyze Code

Read the source code for failing endpoint(s) before checking logs. This makes log searches targeted.

**When:** Always for API/backend bugs. Skip for purely visual/CSS bugs.

1. **Locate the route** — infer file path from failing URL (e.g., `/api/admin/billing/revenue` → `apps/dashboard/src/app/api/admin/billing/revenue/route.ts`). Use `Glob` if path isn't obvious.
2. **Read the route handler** — identify:
   - Database tables/queries referenced
   - Error handling patterns (thrown vs caught, `console.error` vs `Sentry.captureException`)
   - Shared dependencies across failing endpoints (common table, service, middleware)
   - External API calls that could fail
3. **Document internal notes** for use in evidence gathering:
   - Table/service names to search for in logs
   - Whether errors would be captured by monitoring
   - Common failure points across endpoints

#### Step 3: Gather Evidence

Run checks using the investigation plan from Step 2.5. Priority: **MCP → CLI → Browser**.
Use table names, error messages, and patterns from Step 2.7 as search keywords.

Read [references/service-mapping.md](references/service-mapping.md) for detailed tool priority and filter options per service.

**Sentry (always check):**
- Use the URL path from Step 2.7 as the primary search term (e.g. `admin/calls`, `billing/revenue`) — this matches Sentry's transaction field directly and is more reliable than keyword search.
- If search returns nothing: ask "Do you have a direct Sentry URL or issue ID?" → use `get_issue_details` instead.
- Pull: error count, affected users, stack trace, first/last seen, direct link.

**Vercel (if dashboard/API related):**
- Pull runtime logs filtered by query, status code, level, environment, timeframe
- Infer relevant paths from bug URL (e.g., `/admin/billing` → filter by `billing`)

**Render (if voice/backend related):**
- Pull recent logs filtered by keyword, focus on error-level

**Browser (if reproduction needed):**
- Only for user-interaction bugs (clicking, navigating, submitting)
- Ask user before reproducing: "Should I try to reproduce this in the browser?"
- Use Chrome MCP: navigate, check console errors, attempt action, read network failures
- If not authenticated, use credentials from `.env`

**If a tool is unavailable:** skip it, note "[Service] logs not checked — tool not available" in the report.

#### Step 3.5: Diagnose Gaps

When a monitoring source returns nothing for a confirmed bug, investigate why — don't just move on.

**Trigger:** Sentry returned 0 errors but logs show 500s, or logs show no error output despite 500 status codes.

1. **Check error handling** (from Step 2.7): errors thrown or caught? `Sentry.captureException()` called? Only `console.error()`?
2. **Check integration**: Sentry config exists? Enabled for this environment?
3. **Assess scale**: pattern isolated or widespread? Use `Grep` to count affected routes.
4. **Document** in the report's Error Evidence section as a note.
5. **If gap is significant** (multiple routes/categories): ask user: "I found a systemic observability gap affecting N endpoints. Should I document this as a separate issue?"

#### Step 4: Compile Report

Read [references/bug-report-template.md](references/bug-report-template.md) for the exact output template.

Compile all evidence into the template. Rules:
- Only include evidence sections where data was found
- Always include Code Analysis section for API/backend bugs
- Always include direct links to log sources when available
- Keep log excerpts concise (error + 2-3 lines of context)
- Infer severity from evidence (blocking/degraded/cosmetic)
- NEVER suggest how to fix the bug

**Multi-issue detection:** If investigation revealed a distinct secondary issue (different root area, fix scope, or severity):
- Ask user: "I found a related but separate issue: [description]. Should I document it as its own report?"
- If yes: produce both reports, link them as related in Linear
- If no: add a "Related Findings" section to the primary report

#### Step 5: Create or Update Linear Issue

**MUST** immediately after presenting the report (do not wait for user input), ask:
- If started from an existing Linear issue (entry point 1): "Update [ISSUE-ID] with this report, or skip?"
- If started from scratch (entry point 2): "Create this as a new Linear issue, or skip?"

- **New issue:** Use `create_issue` MCP tool with:
  - `title`: from report's `## [Bug]` heading
  - `team`: from team discovered in Step 2.5
  - `description`: full report markdown
  - `labels`: `["Bug"]`
  - `priority`: mapped from severity (see bug-report-template.md Priority Mapping table)
- **Update existing:** If started from existing Linear issue (entry point 1), use `update_issue` to replace description with enriched report
- **Skip:** User declines → present report as-is

### Edge Cases

| Scenario | Action |
|----------|--------|
| Not enough info | Ask targeted questions, don't guess |
| No errors found anywhere | Diagnose the gap (Step 3.5), then document findings |
| Sentry search returns nothing | Use URL path from Step 2.7 as search term first; if still nothing, ask user for direct Sentry URL or ID |
| No direct link from tool | Note search terms used for manual lookup |
| Investigation reveals second issue | Ask user, then document both or note in Related Findings |
| Linear MCP not available | Present report for manual copy-paste, note "Linear tool not available" |
