# Issue Documenter Improvements

**Date:** 2026-02-18
**Skill:** `general-tools/skills/issue-documenter`
**Source:** Post-session skill review (TELI-150 bug report session)

## Context

Five improvements identified from a real-world session where the skill:
- Guessed the Sentry org slug (2 failed API calls before calling `find_organizations`)
- Used vague keyword search instead of the URL path to find the Sentry issue
- Read `env-vars.md` unconditionally even when MCP tools were fully available
- Assumed `.vercel/project.json` at repo root (wrong in a monorepo)
- Didn't auto-prompt Step 5 after presenting the report (user had to initiate)

---

## Changes

### 1. Step 2.5 — Sentry slug enforcement

**File:** `SKILL.md`

In Step 2.5, item 4, prepend to the Sentry bullet:

> **NEVER guess the organizationSlug** — always call `find_organizations` first → store `organizationSlug` + `regionUrl`.

### 2. Step 2.5 — Vercel monorepo path

**File:** `SKILL.md`

In Step 2.5, item 4, append to the Vercel bullet:

> In monorepos, also check `apps/*/vercel/project.json` if the root path doesn't exist.

### 3. Step 2.5 — Conditional env-vars.md loading

**File:** `SKILL.md`

Change item 3 from:
```
Read references/env-vars.md and load env vars from `.env`
```

To:
```
If any MCP tool is unavailable after probing: read references/env-vars.md for fallback
URLs and credentials. ISSUE_DOCUMENTER_* variables live in the repository root `.env` only.
```

**Also update:** `references/env-vars.md` — add note at top:

> `ISSUE_DOCUMENTER_*` variables must be defined in the **repository root `.env`** only — not in app-level `.env` files (e.g. `apps/dashboard/.env`).

### 4. Step 3 — Path-first Sentry search strategy

**File:** `SKILL.md`

Replace the current Sentry evidence bullets with:

```
**Sentry (always check):**
- Use the URL path from Step 2.7 as the primary search term (e.g. `admin/calls`,
  `billing/revenue`) — this matches Sentry's transaction field directly and is more
  reliable than keyword search.
- If search returns nothing: ask "Do you have a direct Sentry URL or issue ID?"
  → use `get_issue_details` instead.
- Pull: error count, affected users, stack trace, first/last seen, direct link.
```

**Also update:** Edge Cases table — add row:

| `Sentry search returns nothing` | Use URL path from Step 2.7 as search term first; if still nothing, ask user for direct Sentry URL or ID |

### 5. Step 5 — Mandatory auto-trigger

**File:** `SKILL.md`

Change Step 5 opening from:
```
After presenting the report, ask: "Create this as a new Linear issue, or update an existing one?"
```

To:
```
**MUST** immediately after presenting the report (do not wait for user input), ask:
- If started from an existing Linear issue (entry point 1): "Update [ISSUE-ID] with this report, or skip?"
- If started from scratch (entry point 2): "Create this as a new Linear issue, or skip?"
```

---

## Files to Edit

| File | Changes |
|------|---------|
| `general-tools/skills/issue-documenter/SKILL.md` | Items 1, 2, 3, 4, 5 |
| `general-tools/skills/issue-documenter/references/env-vars.md` | Item 3 (root .env note) |

## Out of Scope

- User Story mode — no changes needed
- `references/bug-report-template.md` — no changes needed
- `references/service-mapping.md` — no changes needed (Sentry search strategy goes in SKILL.md)
