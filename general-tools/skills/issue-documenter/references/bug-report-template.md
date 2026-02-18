# Bug Report Template

Use this exact structure when producing bug reports for Linear.

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
- **Failing route(s):** `path/to/route.ts`
- **Key dependencies:** [tables, services, middleware queried]
- **Error handling pattern:** [thrown/caught, uses Sentry.captureException or console.error only]
- **Shared failure points:** [if multiple endpoints share a table/service/middleware]

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

## Section Rules

- **Code Analysis**: Always include for API/backend bugs. Omit for purely visual/CSS bugs.
- **Error Evidence sections**: Only include sections where evidence was found. If Sentry returned nothing, omit the Sentry section entirely — unless the absence is itself notable (see Diagnose Gaps in SKILL.md).
- **Related Findings**: Only include when investigation revealed secondary issues that weren't filed as separate reports. Omit if no secondary findings.
- **Links**: Always include direct links to log sources when available. If no direct link, note the search terms used (e.g., "Searched Render logs for `initiateCall` between 2pm-3pm UTC").
- **Log excerpts**: Keep concise. Include the error line and 2-3 lines of surrounding context, not full log dumps.
- **Steps to Reproduce**: If reproduced via browser, document the exact steps taken. If not reproduced, write "Could not reproduce - documented from user report" and include whatever steps the user described.
