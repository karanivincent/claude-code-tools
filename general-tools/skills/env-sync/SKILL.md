---
name: env-sync
description: >
  Manage environment variables across monorepo workspaces and deployment services.
  Maintains a central env registry, keeps .env.example files in sync, detects duplicate/aliased
  variables, and propagates vars to Vercel/Render via MCP tools. Three modes:
  (1) Add mode - register a new env var, update .env.example files, check deployments.
  Triggers: "add env var", "new env variable", "I need a new API key", "add SECRET to env".
  (2) Audit mode - full scan for drift, orphans, missing deployment vars, alias duplicates.
  Triggers: "env audit", "check env vars", "sync env", "env drift", "are env files up to date".
  (3) Deploy mode - push missing vars to Vercel/Render.
  Triggers: "deploy env vars", "sync to vercel", "push env to render", "env deploy".
  Also handles bootstrapping when no registry exists yet.
---

# Env Sync

Manage environment variables across monorepo workspaces and deployment services using a central registry.

## Prerequisites

- Registry file: `docs/env-registry.json` (create via bootstrap if missing)
- Changelog file: `docs/env-changelog.md` (create if missing)
- Vercel MCP tools (for dashboard deployment sync)
- Render MCP tools (for voice-server deployment sync)

## Mode Detection

Determine mode from user input or context:

| Input | Mode |
|-------|------|
| Agent added new `process.env.*` reference | **Add** |
| "add", "new env var", "I need KEY" | **Add** |
| "audit", "check", "sync", "drift", "scan" | **Audit** |
| "deploy", "push to vercel/render" | **Deploy** |
| No `docs/env-registry.json` exists | **Bootstrap** first |

---

## Bootstrap Mode

Run when `docs/env-registry.json` doesn't exist. One-time setup.

### Steps

1. **Read the registry schema** from [references/registry-schema.md](references/registry-schema.md)
2. **Discover env files** — Glob for `**/.env.example` (exclude node_modules). Build the `files` section mapping each workspace to its env file, example file, purpose, and deployment target.
3. **Parse all .env.example files** — Extract every variable with:
   - Name from the line
   - Description from inline comment or preceding comment line
   - Target inferred from which file it appears in
   - Deployment inferred from file topology (map workspace to deployment service)
4. **Infer sources** — Match variable name patterns to MCP sources:
   - `SUPABASE_*` or `*_SUPABASE_*` -> `supabase-mcp`
   - `SENTRY_*` or `*_SENTRY_*` -> `sentry-mcp`
   - Everything else -> `manual`
5. **Detect aliases** — Cross-reference variables across files. Flag pairs with similar names pointing to the same service (e.g., `SUPABASE_SERVICE_ROLE_KEY` vs `SUPABASE_SERVICE_KEY`). Present each detected pair to the user for confirmation.
6. **Classify sensitivity** — `sensitive: true` for vars containing: KEY, TOKEN, SECRET, PASSWORD, DSN, SID, CREDENTIAL. `sensitive: false` for: URL, HOST, PORT, ENV, ENVIRONMENT, PROJECT, ORG, ID (non-secret identifiers).
7. **Write `docs/env-registry.json`** with full schema
8. **Create `docs/env-changelog.md`** with initial entry
9. **Verify against deployments** — Run Deploy mode to check gaps

---

## Add Mode

Register a new environment variable.

### Input

Variable name (required). Description and target workspace (inferred or asked).

### Steps

1. **Read registry** — Load `docs/env-registry.json`
2. **Check for duplicates** — Fuzzy-match the new var name against all existing vars:
   - Exact match -> already registered, report and stop
   - Similar name (same base with different prefix/suffix) -> ask: "Is `NEW_VAR` the same secret as `EXISTING_VAR`? If yes, I'll link them as aliases."
   - Common patterns to catch: `_KEY` vs `_SECRET` vs `_TOKEN`, `SERVICE_ROLE_KEY` vs `SERVICE_KEY`, `NEXT_PUBLIC_` prefix variants, same name in different case
3. **If alias confirmed** -> add to registry with `source: "alias:PRIMARY_VAR"`, update only the target workspace's `.env.example`
4. **If genuinely new** -> determine:
   - `targets`: which workspaces need it (infer from code location, or ask)
   - `deployments`: which services need it (infer from targets using file topology)
   - `source`: MCP source or `manual`
   - `sensitive`: classify from name
   - `setupUrl`: for manual sources, ask or infer from service name
   - `category`: group by service (supabase, sentry, twilio, ai, payments, etc.)
5. **Add to registry** — Write new entry to `docs/env-registry.json`
6. **Update .env.example files** — Add the variable with description comment and placeholder to each target's example file. Maintain existing grouping/section structure in the file.
7. **Log change** — Append to `docs/env-changelog.md`:
   ```
   ## YYYY-MM-DD
   - Added `VAR_NAME` to registry (targets: dashboard, voice-server; deployments: vercel, render)
   ```
8. **Check deployments** — Use MCP to verify if the var exists on each target deployment service. Report gaps.
9. **Resolve value** — Based on source:
   - `supabase-mcp`: use Supabase MCP tools to fetch the value
   - `sentry-mcp`: use Sentry MCP tools to fetch DSN/project info
   - `alias:VAR`: copy value from the primary variable
   - `manual`: show `setupUrl` and instruct user what to set

### Output

```
ENV SYNC: ADD
+ Added VAR_NAME to registry
+ Updated apps/dashboard/.env.example
+ Updated apps/voice-server/.env.example
+ Vercel: variable exists
- Render: MISSING — set via Render dashboard or /env-sync deploy
! Action needed: get value from https://example.com/settings
```

---

## Audit Mode

Full scan for drift, orphans, and gaps.

### Steps

1. **Read registry**
2. **Scan codebase** — Grep for `process\.env\.(\w+)` and `import\.meta\.env\.(\w+)` across all source files. Exclude: `node_modules`, `dist`, `build`, `.next`, test mock files, `.env.example` files.
3. **Diff against registry** — Categorize:
   - **New**: in code but not in registry -> run Add mode for each
   - **Orphaned**: in registry but not in code -> flag for user review (do NOT auto-delete)
   - **Known**: in registry and in code -> check deployment sync
4. **Check .env.example sync** — For each registered var, verify it appears in the correct `.env.example` files per its `targets`. Flag missing entries.
5. **Check deployment sync** — For each registered var, verify it exists on the correct deployment services. Flag missing.
6. **Check alias consistency** — For vars with aliases, verify all aliases are also registered and have matching deployment targets.
7. **Report** — Present findings grouped by category:
   ```
   ENV AUDIT REPORT

   New (3):
     STRIPE_SECRET_KEY — found in apps/dashboard/src/...
     STRIPE_PUBLIC_KEY — found in apps/dashboard/src/...
     REDIS_URL — found in apps/voice-server/src/...

   Orphaned (1):
     OLD_API_KEY — in registry but no code references found

   .env.example gaps (2):
     POSTHOG_API_KEY — missing from apps/dashboard/.env.example
     REDIS_URL — missing from apps/voice-server/.env.example

   Deployment gaps (1):
     CRON_SECRET — missing on Vercel

   Alias issues (0): None
   ```
8. **Offer fixes** — Ask: "Want me to fix the .env.example gaps and register the new vars?"

---

## Deploy Mode

Push missing vars to deployment services via MCP.

### Steps

1. **Read registry**
2. **Check Vercel** — Use `ToolSearch` to find Vercel MCP tools. Get project env vars. Compare against registry vars where `deployments` includes `vercel`.
3. **Check Render** — Use `ToolSearch` to find Render MCP tools. Get service env vars. Compare against registry vars where `deployments` includes `render`.
4. **For each missing var** — Resolve value:
   - If source is an MCP tool -> fetch value automatically
   - If source is `alias:VAR` -> use the primary var's value
   - If source is `manual` -> ask user for the value (mask in output if sensitive)
5. **Set on deployment service** — Use MCP tools to push the value
6. **Log changes** to `docs/env-changelog.md`
7. **Report**

### Security Rules for Deploy Mode

- **Never print sensitive values in full** — show first 4 chars + `****` for `sensitive: true` vars
- **Always confirm before writing** — list all vars to be set and ask for confirmation before pushing
- **Log but don't log values** — changelog records what was set and where, never the actual value

---

## Security Model

These rules apply across all modes:

| Rule | Detail |
|------|--------|
| No secrets in git | Registry stores metadata only. `.env` files stay in `.gitignore`. |
| Sensitive masking | `sensitive: true` vars shown as `ABCD****` (first 4 chars only) |
| MCP permissions | All MCP calls go through Claude Code permission system |
| No agent deletion | Agents can add vars and flag orphans but cannot delete from registry or deployment services |
| Audit trail | Every change logged to `docs/env-changelog.md` with timestamp and action |

---

## CLAUDE.md Integration

After bootstrapping, suggest adding this to the project's CLAUDE.md:

```markdown
## Environment Variables

**Registry:** `docs/env-registry.json` is the single source of truth for all env vars.

When adding code that references a new `process.env.*` or `import.meta.env.*` variable:
1. Run `/env-sync add VAR_NAME` before committing
2. Never manually edit `.env.example` files — the skill manages them
3. If unsure whether a var already exists under a different name, run `/env-sync audit`
```
