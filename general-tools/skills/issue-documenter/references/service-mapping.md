# Service Inference Mapping

Determine which services to investigate based on the bug description and URL.

## Keyword-to-Service Table

| Keywords in description/URL | Check these services |
|-----------------------------|----------------------|
| UI, dashboard, page, button, form, display, render, layout, style, CSS | Vercel logs + browser |
| call, voice, audio, telephony, WebSocket, Twilio, stream, microphone | Render logs |
| auth, login, signup, session, token, password, email verification | Vercel logs + Sentry |
| API, request, response, timeout, 500, 404, network, fetch, endpoint | Vercel + Render logs |
| database, query, data missing, not saving, duplicate, Supabase | Sentry + Vercel logs |
| realtime, subscription, live update, sync | Render logs + Sentry |
| deploy, build, CI, pipeline | Vercel logs |

## Rules

1. **Always check Sentry** regardless of keywords — it's the universal error source
2. If multiple keyword groups match, check all corresponding services
3. If no keywords match, ask the user which service to investigate
4. Browser reproduction is only triggered when the bug involves user interaction (clicking, navigating, submitting forms)

## Tool Priority: MCP → CLI → Browser

For each service, prefer MCP tools first, then CLI, then browser as last resort.

### Sentry
1. **MCP (primary):** `mcp__plugin_sentry_sentry__search_issues`, `search_events`
   - **Prerequisite:** Call `find_organizations` first → get `organizationSlug` and `regionUrl`
   - **Query syntax:** Sentry search does not support boolean `OR` or `AND` operators. Use separate targeted queries instead of combining terms.
     - Bad: `"memory failed OR fact extraction error"`
     - Good: Two separate queries — `"memory failed"`, then `"fact extraction error"`
2. **Browser fallback:** via `TEST_SENTRY_URL`

### Vercel
1. **MCP (primary):** `mcp__vercel__get_runtime_logs` — supports filters:
   - `query`: full-text search (use table names, error messages from code analysis)
   - `level`: `["error"]`, `["warning"]`, etc.
   - `statusCode`: `"500"`, `"4xx"`, etc.
   - `environment`: `"production"` or `"preview"` (staging = preview)
   - `since`: `"1h"`, `"24h"`, `"7d"`, or ISO timestamp
   - `source`: `["serverless"]`, `["edge-function"]`, etc.
   - Requires `projectId` and `teamId` — read from `.vercel/project.json`
2. **CLI (secondary):** `vercel logs <deployment-url>` (streams real-time only, no filters)
3. **Browser fallback:** via `TEST_VERCEL_LOGS_URL`

### Render
1. **MCP (primary):** `mcp__render__list_logs`
   - **Prerequisites:** Call `list_workspaces` first (auto-selects if only one) → then `list_services` to get the resource ID for the relevant service
2. **Browser fallback:** via `TEST_RENDER_LOGS_URL`

### Linear
1. **MCP (primary):** `mcp__plugin_linear_linear__create_issue`, `update_issue`, `get_issue`
   - **Prerequisite:** Call `list_teams` first → store team name for issue creation in Step 5
   - Used for: reading existing issues (entry point 1), creating new issues (Step 5)

### Browser
- Chrome MCP for reproduction and console/network inspection
- Tools: `tabs_context_mcp`, `navigate`, `read_page`, `read_console_messages`, `read_network_requests`

## Tool Discovery (Step 2.5)

Before gathering evidence, auto-probe tool availability using `ToolSearch`:

```
Sentry  → ToolSearch("+sentry search issues")
Vercel  → ToolSearch("+vercel runtime logs")
Render  → ToolSearch("+render logs")
Linear  → ToolSearch("+linear create issue")
Chrome  → ToolSearch("+chrome tabs_context navigate")
```

Build an internal investigation plan based on results. If a tool is unavailable:
- Check CLI fallback
- Check browser fallback URL from env vars
- Note in report: "[Service] logs not checked — tool not available"
