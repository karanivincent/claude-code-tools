# Bug Report Template

Use this exact structure when producing bug reports as GitHub issues.

```markdown
## [Bug] [Short descriptive title]

### Description
[1-2 sentences describing what's broken, from user perspective]

### Environment
- **Where:** staging / production
- **URL:** [page URL where bug occurs]
- **Services affected:** Dashboard / Voice Server / Both

### Steps to Reproduce
1. [Step 1]
2. [Step 2]
3. [Step 3]

### Expected Behavior
[What should happen]

### Actual Behavior
[What actually happens]

### Code Analysis
- **Affected file(s):** `path/to/file.ts`
- **Error display path:** [how the error message reaches the user]
- **Monitoring visibility:** [whether this error is captured by Sentry/logs, or client-side only]

### Error Evidence

**Sentry:**
- Error: [error message]
- Frequency: [X occurrences in last Y hours/days]
- Affected users: [count]
- First seen: [date] | Last seen: [date]
- Link: [direct Sentry issue URL]

**Server Logs (Vercel/Render):**
- Link: [direct logs URL]
\```
[Relevant log excerpts - keep concise, include only the error and immediate context]
\```

**Browser Console:**
\```
[Relevant console errors if captured via Chrome MCP]
\```

**Network Failures:**
- [Failed request URL] -> [status code / error]

### Related Findings
- [Finding description] — [evidence summary]. Consider filing as separate issue.

### Scope
- Affected users: [count or estimate from Sentry]
- Frequency: one-time / intermittent / consistent
- Severity: blocking / degraded / cosmetic
```

## Severity Inference

Infer severity from evidence, user can override:

| Evidence | Severity |
|----------|----------|
| 500 errors, service down, data loss | **blocking** |
| Partial functionality broken, workaround exists | **degraded** |
| Visual/UI glitch, cosmetic issue | **cosmetic** |

## Severity and Labels

GitHub has no priority field, so severity is carried by labels and stated in the report body.

Every issue gets `priority` regardless of severity — see **Filing the Issue** in SKILL.md for
why. Severity decides what goes *alongside* it:

| Severity  | Labels                          |
|-----------|---------------------------------|
| blocking  | `priority`, `bug`, + area label |
| degraded  | `priority`, `bug`, + area label |
| cosmetic  | `priority`, `bug`               |

State the severity as a line in the report body — that is where a reader actually sees it.

## Section Rules

- **Code Analysis**: Include for bugs where the affected file is identifiable. Shows where the error occurs and whether monitoring captures it. Do NOT include root cause analysis, dependency tracing, or pattern suggestions — leave that to the executor.
- **Error Evidence sections**: Only include sections where evidence was found. If Sentry returned nothing, omit the Sentry section entirely — unless the absence is itself notable (see Diagnose Gaps in SKILL.md).
- **Related Findings**: Only include when investigation revealed secondary issues that weren't filed as separate reports. Omit if no secondary findings.
- **Links**: Always include direct links to log sources when available. If no direct link, note the search terms used (e.g., "Searched Render logs for `initiateCall` between 2pm-3pm UTC").
- **Log excerpts**: Keep concise. Include the error line and 2-3 lines of surrounding context, not full log dumps.
- **Steps to Reproduce**: If reproduced via browser, document the exact steps taken. If not reproduced, write "Could not reproduce - documented from user report" and include whatever steps the user described.
