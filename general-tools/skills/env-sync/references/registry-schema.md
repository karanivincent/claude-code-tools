# Env Registry Schema

Reference for `docs/env-registry.json` structure.

## Full Schema

```json
{
  "files": {
    "<workspace-key>": {
      "envFile": "<relative path to .env file>",
      "exampleFile": "<relative path to .env.example file>",
      "purpose": "<one-line description of this workspace's env scope>",
      "deployment": "<vercel | render | null>",
      "deploymentId": "<service/project ID for MCP calls, if applicable>"
    }
  },
  "variables": {
    "<ENV_VAR_NAME>": {
      "description": "<what this variable is for>",
      "required": true,
      "sensitive": true,
      "targets": ["<workspace-key>", ...],
      "deployments": ["<vercel | render>", ...],
      "source": "<supabase-mcp | sentry-mcp | alias:VAR_NAME | manual>",
      "aliases": ["<OTHER_VAR_NAME>", ...],
      "setupUrl": "<URL to get the value, for manual sources>",
      "category": "<service grouping>"
    }
  }
}
```

## Field Reference

### files[key]

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `envFile` | string | yes | Relative path from repo root to the actual `.env` file (e.g., `apps/dashboard/.env.local`) |
| `exampleFile` | string | yes | Relative path to the `.env.example` file |
| `purpose` | string | yes | One-line description of what env vars this workspace needs |
| `deployment` | string\|null | yes | Deployment service: `"vercel"`, `"render"`, or `null` |
| `deploymentId` | string | no | Service/project ID used in MCP tool calls |

### variables[name]

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `description` | string | yes | What this variable is for |
| `required` | boolean | yes | Whether the app fails without it |
| `sensitive` | boolean | yes | Whether the value is a secret (affects output masking) |
| `targets` | string[] | yes | Workspace keys from `files` that need this var |
| `deployments` | string[] | yes | Deployment services that need this var |
| `source` | string | yes | How to get the value (see Source Types below) |
| `aliases` | string[] | no | Other var names that hold the same underlying secret |
| `setupUrl` | string | no | Direct URL to get the value (for `manual` source) |
| `category` | string | yes | Service grouping for organization |

### Source Types

| Source | Meaning | Action |
|--------|---------|--------|
| `supabase-mcp` | Fetchable via Supabase MCP tools | Use `get_project_url`, `get_publishable_keys` |
| `sentry-mcp` | Fetchable via Sentry MCP tools | Use `find_projects`, `find_organizations` |
| `alias:VAR_NAME` | Same value as another variable | Copy from the primary variable |
| `manual` | Must be set by user | Show `setupUrl` if available |

### Category Examples

`supabase`, `sentry`, `twilio`, `google`, `ai`, `payments`, `analytics`, `email`, `redis`, `telegram`, `app-config`

## Sensitivity Classification

**sensitive: true** — variable name contains: `KEY`, `TOKEN`, `SECRET`, `PASSWORD`, `DSN`, `SID`, `CREDENTIAL`

**sensitive: false** — variable name contains: `URL`, `HOST`, `PORT`, `ENV`, `ENVIRONMENT`, `PROJECT`, `ORG` (non-secret identifiers)

When ambiguous, default to `sensitive: true`.
