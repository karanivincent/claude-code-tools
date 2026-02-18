# Environment Variables

All variables are prefixed with `ISSUE_DOCUMENTER_` for clear skill ownership.

> **Location:** In monorepos with multiple `.env` files, `ISSUE_DOCUMENTER_*` variables must be defined in the **repository root `.env`** only — not in app-level files (e.g. `apps/dashboard/.env`).

## App Credentials (for browser login)

```
ISSUE_DOCUMENTER_STAGING_URL=         # e.g., https://staging.telitask.com
ISSUE_DOCUMENTER_STAGING_EMAIL=       # Login email for staging
ISSUE_DOCUMENTER_STAGING_PASSWORD=    # Login password for staging
ISSUE_DOCUMENTER_PROD_URL=            # e.g., https://telitask.com
ISSUE_DOCUMENTER_PROD_EMAIL=          # Login email for production
ISSUE_DOCUMENTER_PROD_PASSWORD=       # Login password for production
```

## Dashboard Fallback URLs (for browser log access)

Used when MCP and CLI tools are unavailable:

```
ISSUE_DOCUMENTER_VERCEL_LOGS_URL=     # e.g., https://vercel.com/team/project/logs
ISSUE_DOCUMENTER_RENDER_LOGS_URL=     # e.g., https://dashboard.render.com/web/srv-xxx/logs
ISSUE_DOCUMENTER_SENTRY_URL=          # e.g., https://sentry.io/organizations/org/issues/
```

## Vercel MCP Credentials

The Vercel MCP requires `projectId` and `teamId`. These are read from the project, not from env vars:

```
.vercel/project.json  →  { "projectId": "...", "orgId": "team_..." }
```

Read this file in Step 2.5 (Probe Tools) when Vercel MCP is available. The `orgId` field maps to the `teamId` parameter.

## Usage

Read `ISSUE_DOCUMENTER_*` vars from the **repository root `.env`** only. Load this file only when an MCP tool is unavailable (for fallback URLs) or when browser reproduction is needed (for credentials). If variables are missing, skip the corresponding capability and note it in the report.
