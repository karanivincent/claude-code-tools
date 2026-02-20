# Environment Variables

All test/credential variables use the generic `TEST_` prefix and are shared across skills.

> **Location:** In monorepos with multiple `.env` files, `TEST_*` variables must be defined in the **repository root `.env`** only — not in app-level files (e.g. `apps/dashboard/.env`).

## App Credentials (for browser login)

```
TEST_STAGING_URL=         # e.g., https://staging.telitask.com
TEST_STAGING_EMAIL=       # Login email for staging
TEST_STAGING_PASSWORD=    # Login password for staging
TEST_PROD_URL=            # e.g., https://telitask.com
TEST_PROD_EMAIL=          # Login email for production
TEST_PROD_PASSWORD=       # Login password for production
```

## Dashboard Fallback URLs (for browser log access)

Used when MCP and CLI tools are unavailable:

```
TEST_VERCEL_LOGS_URL=     # e.g., https://vercel.com/team/project/logs
TEST_RENDER_LOGS_URL=     # e.g., https://dashboard.render.com/web/srv-xxx/logs
TEST_SENTRY_URL=          # e.g., https://sentry.io/organizations/org/issues/
```

## Vercel MCP Credentials

The Vercel MCP requires `projectId` and `teamId`. These are read from the project, not from env vars:

```
.vercel/project.json  →  { "projectId": "...", "orgId": "team_..." }
```

Read this file in Step 2.5 (Probe Tools) when Vercel MCP is available. The `orgId` field maps to the `teamId` parameter.

## Usage

Read `TEST_*` vars from the **repository root `.env`** only. Load this file only when an MCP tool is unavailable (for fallback URLs) or when browser reproduction is needed (for credentials). If variables are missing, skip the corresponding capability and note it in the report.
