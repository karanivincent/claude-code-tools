# Consolidate Claude Code Permissions

Analyze and consolidate the permissions in the specified settings file, removing redundant entries while preserving granular security controls. Also reviews the permission log to recommend new permissions and flag risky ones.

## Target File

$ARGUMENTS (defaults to `.claude/settings.local.json` if not provided)

Both `.claude/settings.local.json` and `.claude/settings.json` are valid targets.

## Instructions

### Step 1: Read Current State

1. **Read** the target permissions file
2. **Read** the permission log at `~/.claude/permission-log.jsonl` (if it exists)
   - Each line is a JSON object with: `timestamp`, `project`, `tool`, `permission`, `full_input`, `decision`, `session_id`
3. **Read** review history at `~/.claude/permission-reviews/history.json` (if it exists)
   - Array of past review records with: `date`, `recommended`, `applied`, `deferred`, `auto_applied`, `log_entries`

### Step 1.5: Cross-Session Analysis

If `history.json` exists and has entries:

1. **Detect recurring deferrals** — permissions recommended in 2+ past reviews but never applied:
   - Check each entry in `history[].deferred` against current log
   - If the same permission category appears again → **escalate**: "This was recommended on {dates} but not applied. It appeared {N} more times since. Strongly recommend adding."

2. **Detect recurring patterns** — if the same broad category (e.g., `Edit`, `Write`, `Agent`) keeps appearing across reviews even after previous consolidation:
   - The current approach is too narrow — suggest blanket allow for that category

Present escalations at the TOP of the recommendations, before the normal analysis.

### Step 2: Analyze Permission Log

If the log file exists and has entries, perform a three-pass analysis:

**Pass 1 — Frequency analysis:**
- Group log entries by `permission` field
- Count occurrences per permission pattern
- Note which projects each permission appeared in
- Flag permissions allowed 3+ times as strong candidates for the allow list

**Pass 2 — Security review:**
Flag permissions by risk level. For each risky permission, explain WHY it shouldn't be auto-allowed:

| Risk Level | Patterns | Why Keep Gated |
|------------|----------|----------------|
| **HIGH** | `Bash(rm:*)`, `Bash(git push --force:*)`, `Bash(git reset --hard:*)`, `Bash(git checkout .:*)`, `Bash(git clean:*)` | Destructive and irreversible — can delete work permanently |
| **HIGH** | `mcp__*__execute_sql`, `mcp__*__apply_migration` | Direct database mutation — wrong query can corrupt data |
| **HIGH** | `Bash(curl -X POST:*)`, `Bash(curl -X DELETE:*)` | Sends data to external services — can trigger unintended actions |
| **MEDIUM** | `WebFetch(domain:*)` on unknown domains | May send project context to untrusted third parties |
| **MEDIUM** | `mcp__*__update_*`, `mcp__*__create_*`, `mcp__*__delete_*` | Mutating operations on external services |
| **MEDIUM** | `Bash(docker:*)`, `Bash(kubectl:*)` | Infrastructure changes with broad blast radius |
| **LOW** | `Bash(cat:*)`, `Bash(ls:*)`, `Bash(tree:*)`, read-only MCP tools | Safe read-only operations |
| **LOW** | `Bash(npx tsc:*)`, `Bash(npx vitest:*)` | Build/test tools with no side effects |

**Pass 2.5 — Auto-apply safe universals:**

Before presenting recommendations, identify permissions that should be auto-applied without asking. A permission qualifies for auto-apply if ALL conditions are met:
- **10+ occurrences** in the current log
- **100% allow rate** (never denied in the log — check `decision` field)
- **LOW risk** (not in the HIGH or MEDIUM risk tables above)

Auto-apply candidates are typically broad tool categories where path-specific entries dominate:
- `Edit` — if 10+ path-specific Edit entries, all allowed → auto-apply blanket `Edit`
- `Write` — same logic as Edit
- `Agent` — if 10+ Agent entries across any subtype, all allowed → auto-apply blanket `Agent`

**Do not ask.** Add these to the allow list directly. Inform the user what was auto-applied and why:

```
## Auto-Applied (safe universals)

| Permission | Log entries | Allow rate | Reason |
|------------|-----------|------------|--------|
| Edit | 162 | 100% | All path-specific edits allowed, LOW risk, reversible via git |
| Write | 110 | 100% | All path-specific writes allowed, LOW risk, reversible via git |
| Agent | 28 | 100% | All agent dispatches allowed, LOW risk, no side effects |
```

**Pass 3 — Recommendations:**
Present each **remaining** logged permission (not already auto-applied) with one of these verdicts:

- **Add to allow list** — safe + frequently prompted (3+ times). Show the consolidated pattern.
- **Keep gated** — risky, with specific reason why (from the security review table above). Explain what could go wrong.
- **Consolidate** — can be merged with an existing broader pattern already in settings (e.g., specific command covered by existing `command:*` rule)
- **One-off** — appeared only once, likely situational. Remove from consideration.

Present as a table:

```
| Permission | Count | Decision | Reason |
|------------|-------|----------|--------|
| Bash(docker build:*) | 7 | Add | Safe build command, no side effects |
| mcp__render__delete_service | 2 | Keep gated | HIGH: deletes infrastructure permanently |
| Bash(npx prisma migrate:*) | 1 | One-off | Single use, not worth auto-allowing |
```

**Pass 4 — Predict nearby permissions (family completion):**

For each tool family already present in settings, suggest all other **safe** commands from that family that aren't yet allowed. The goal: prevent future prompts for commands the user would obviously approve.

**General principle:** Read-only operations are safe to suggest. Mutating operations are not.

- **Bash CLI tools:** If user has any `Bash(gh <sub>:*)`, suggest all other safe gh subcommands. Same for `git`, `npm`, `docker`, etc.
- **MCP tools:** If user has any `mcp__<server>__*` tool, suggest all `list_*` and `get_*` tools from that server. Never suggest `create_*`, `delete_*`, `update_*`, `apply_*`, or `execute_*`.

**Known safe commands by family** (suggest if any sibling exists):

| Family | Safe to suggest | Never suggest |
|--------|----------------|---------------|
| `gh` | `pr:*`, `api:*`, `run:*`, `issue:*`, `repo view:*`, `release list:*`, `release view:*` | `repo delete:*`, `pr close:*`, `release create:*`, `release delete:*` |
| `git` | `status:*`, `log:*`, `diff:*`, `branch:*`, `fetch:*`, `stash:*`, `worktree:*`, `tag:*`, `remote:*`, `show:*` | `push --force:*`, `reset --hard:*`, `clean:*`, `checkout .:*` |
| `npm` | `view:*`, `list:*`, `outdated:*`, `run:*` | `publish:*` |
| `docker` | `build:*`, `images:*`, `ps:*`, `logs:*`, `inspect:*` | `rm:*`, `rmi:*`, `system prune:*` |

For MCP servers not in the table, apply the general principle: `list_*` and `get_*` = safe, everything else = not suggested.

Present predicted permissions in a separate table:

```
| Permission | Decision | Reason |
|------------|----------|--------|
| Bash(gh run:*) | Predict | Same family as gh pr:*, safe read-only CI status |
| mcp__render__get_service | Predict | Same server as list_services, safe read-only |
```

**Pass 5 — Gap detection (why did this get prompted?):**

Cross-check logged permissions against existing rules to find prompts that **should not have happened** — the user clearly intended to allow them based on existing rules, but a pattern mismatch caused a prompt.

**Check for prefix gaps:**
1. Scan log entries for `Bash(cd /path && <command> ...)` patterns
2. Extract the inner command after `cd ... &&`
3. If the inner command matches an existing allow rule (e.g., `pnpm:*`, `git:*`), flag it as a gap
4. If 2+ such entries exist, recommend adding `Bash(cd:*)` and report how many prompts it would have prevented

**Check for suffix gaps:**
1. Scan for entries with `2>&1`, `| tail`, `| head`, `| grep` suffixes where the base command is already allowed
2. These usually match fine — only flag if they actually caused prompts

Present gap findings separately:

```
## Gap Analysis

| Gap | Prompts caused | Fix |
|-----|---------------|-----|
| `cd /path &&` prefix breaks pnpm:*, git:* matches | 15 | Add `Bash(cd:*)` |
```

### Step 3: Get User Approval

**Auto-applied permissions (Pass 2.5) are already added — no approval needed.** Inform the user what was auto-applied.

**STOP and ask the user** before applying remaining changes. Present:
1. Auto-applied summary (informational, already done)
2. Escalated permissions from cross-session analysis (Step 1.5) — strongly recommend
3. The recommendations table from Pass 3
4. The consolidation changes from Step 4 (preview only)
5. Ask: "Which recommendations should I apply? (all / list specific numbers / none)"

### Step 4: Consolidate Existing Permissions

Apply the standard consolidation rules to the target file:

#### MUST Consolidate

| Pattern | Action |
|---------|--------|
| Hardcoded paths (`/Users/name/Projects/...`) | Replace with wildcard (`:*`) |
| One-time heredoc commit messages | Remove (keep `git commit:*`) |
| Exact duplicates | Remove duplicates |
| `command` + `command:*` pairs | Keep only `command:*` |
| Multiple `--filter <pkg>` variants | Consolidate to `--filter:*` |

#### MUST NOT Consolidate

| Keep Separate | Reason |
|---------------|--------|
| Different git subcommands (`add`, `commit`, `push`, `reset`) | Different risk levels |
| Different pnpm subcommands (`add`, `build`, `publish`, `test`) | `publish` is destructive |
| Different npx tools (`tsc`, `vitest`, `prisma`) | Distinct tools |
| Read vs write operations | Security boundary |
| MCP tool permissions | Already atomic |
| Skill permissions | Already atomic |

#### Consolidation Hierarchy

```
TOO BROAD (avoid):     Bash(git:*)
APPROPRIATE:           Bash(git add:*), Bash(git commit:*), Bash(git push:*)
TOO NARROW (remove):   Bash(git commit -m "exact message")
```

### Step 5: Apply Changes

After user approval:

1. **Write** the consolidated permissions to the target file (grouped by category, alphabetized):
   ```
   // 1. Simple bash utilities (curl, echo, find, tree, etc.)
   // 2. Git commands
   // 3. Package manager commands (pnpm, npm, npx)
   // 4. CLI tools (gh, claude, etc.)
   // 5. WebSearch / WebFetch
   // 6. MCP permissions
   // 7. Skill permissions
   ```

2. **Clear** the permission log — truncate `~/.claude/permission-log.jsonl` to empty

3. **Append to review history** at `~/.claude/permission-reviews/history.json`:
   ```json
   {
     "date": "YYYY-MM-DD",
     "log_entries": 341,
     "auto_applied": ["Edit", "Write", "Agent"],
     "recommended": ["Bash(open:*)", "mcp__chrome__navigate"],
     "applied": ["Bash(open:*)"],
     "deferred": ["mcp__chrome__navigate"]
   }
   ```
   - If the file doesn't exist, create it as `[{...}]`
   - If it exists, read the array, append, write back
   - `auto_applied`: permissions added without asking (Pass 2.5)
   - `recommended`: permissions presented to user in Pass 3
   - `applied`: subset of recommended that user approved
   - `deferred`: recommended but not approved (these get escalated next review)

4. **Write review summary** to `~/.claude/permission-reviews/YYYY-MM-DD.md`:
   ```markdown
   # Permission Review — YYYY-MM-DD

   ## Auto-Applied (safe universals)
   - `Edit` — 162 entries, 100% allow rate, reversible via git
   - `Write` — 110 entries, 100% allow rate, reversible via git

   ## Escalated (recurring deferrals)
   - `Agent(Explore)` — recommended on 2026-03-15, 2026-03-28, appeared 11 more times

   ## Added to Allow List
   - `Bash(docker build:*)` — 7 occurrences, safe build command

   ## Predicted (family completion)
   - `Bash(gh run:*)` — same family as gh pr:*, safe read-only

   ## Gap Fixes
   - `Bash(cd:*)` — prevented 15 unnecessary prompts from cd prefix pattern

   ## Kept Gated
   - `mcp__render__delete_service` — HIGH risk: deletes infrastructure permanently

   ## Deferred (not applied this review)
   - `mcp__chrome__form_input` — user chose not to add

   ## Consolidated
   - `Bash(git -C /specific/path)` → already covered by `Bash(git -C:*)`

   ## Removed (One-offs)
   - `Bash(npx prisma migrate:*)` — single use
   ```

---

## Example

**Before (settings file):**
```json
"Bash(git -C /Users/vince/Projects/App status)",
"Bash(git -C /Users/vince/Projects/App add file.ts)",
"Bash(git commit -m \"$(cat <<'EOF'\nfeat: thing\nEOF\n)\")",
"Bash(git commit:*)",
"Bash(pnpm --filter api test)",
"Bash(pnpm --filter api test:*)",
"Bash(pnpm --filter web build:*)"
```

**Permission log entries:**
```jsonl
{"permission":"Bash(docker build -t myapp .)","decision":"allowed","...":"..."}
{"permission":"Bash(docker build -t myapp:v2 .)","decision":"allowed","...":"..."}
{"permission":"Bash(docker build:*)","decision":"allowed","...":"..."}
{"permission":"mcp__render__delete_service","decision":"denied","...":"..."}
```

**After (settings file):**
```json
"Bash(docker build:*)",
"Bash(git -C:*)",
"Bash(git commit:*)",
"Bash(pnpm --filter:*)"
```

**Summary:**
- Consolidated: path-specific `git -C` → `git -C:*`, multiple `--filter` variants → `--filter:*`
- Added: `Bash(docker build:*)` (3 occurrences, safe)
- Kept gated: `mcp__render__delete_service` (destructive)
- Removed: heredoc commit message (covered by `git commit:*`)
