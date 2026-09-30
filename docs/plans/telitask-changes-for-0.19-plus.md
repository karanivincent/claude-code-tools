# Telitask changes that delivery-tools 0.19 and later can use

For the Telitask session to apply, in the Telitask repo, through a normal draft PR to staging.
Every item is optional: the plugin works without it, with the default named under each. None of
them may land while the Rounds run is still on 0.14 (D12), because its session must not see a
changed profile mid-run.

The profile is `.claude/delivery-profile.json`. The safety file is `.claude/delivery-safety.json`
(the founder's; only the guard approvals below change it).

## 0.19.0 (W3, right data)

### 1. `commands.validateSeedJson` (optional)

What it buys: `delivery seed --plan` refuses a Json column value the app's own Zod schemas reject
(the Rounds run's `release_policy.mode: "manual"`), before anything is written.

Default without it: Json values are only checked for being an object or array.

Profile snippet (inside `"commands"`):

```json
"validateSeedJson": "node scripts/delivery/validate-seed-json.mjs"
```

The script's contract, exactly as the plugin calls it (`lib/seed/validate.mjs`,
`runValidateSeedJson`):

- It is run with `sh -c`, in the run's worktree, with a 30 s timeout.
- stdin is one JSON object:

  ```json
  { "entries": [
      { "world": "design", "table": "rounds", "row": "t-round-1", "column": "release_policy",
        "value": { "mode": "manual" } } ] }
  ```

  `row` is the world file row key (the row id when the row has none). One entry per Json column
  value the worlds write.
- stdout is one JSON object, and the exit code is 0 (no problems) or 1 (problems):

  ```json
  { "problems": [
      { "world": "design", "table": "rounds", "row": "t-round-1", "column": "release_policy",
        "message": "mode: expected 'auto' | 'review', got 'manual'" } ] }
  ```

- Anything else (another exit code, a timeout, output that is not that JSON) is a one-line note,
  never a refusal. So a broken script cannot block a run, but it also checks nothing.

A sketch of the script: map `"<table>.<column>"` to the Zod schema the app parses that column with
(the same schema its API route uses), `safeParse` each entry's value, and print the issues.
Tables and columns it does not know are skipped, not refused.

### 2. `paths.databaseTypes` (already set, check it)

`seed --plan` now reads it for column names, types, nullability and enum literals, and
`seed --from-trace` uses it for enum literals, numbers and the organisation column. It must point
at the generated Supabase types (`database.types.ts`) the app compiles against. When it is
missing, both steps print a note and skip the type checks.

### 3. Guards the worlds now need (founder, safety file)

`seed --check` now refuses a seeded table that a side-effect rule watches (a derived or hand
predicate on that table) when no guard covers it. Tables nothing watches need nothing. The first
run on 0.19 will name the tables in `delivery contract --questions`; the founder approves a guard
for each (or answers "intercept"). Nothing to do before that run.

### 4. `testData.timeZone` (already optional)

The design render now uses it too, so the design's own dates read in the organisation's zone. Set
it if it is not set yet:

```json
"testData": { "mode": "tenant", "timeZone": "Africa/Nairobi" }
```

### Files the plugin now writes in the Telitask repo (commit them with the run)

- `docs/delivery/<feature>/swaps.json`: design values `seed --from-trace` swapped for safe ones.
- `docs/delivery/<feature>/needs.json`: data agents asked for with `seed --need`.
- `docs/delivery/<feature>/questions.md` and `questions.json`: the one list sent to the founder.

And in the run's scratch folder (`.delivery/<feature>/rounds/<n>/`, never committed):
`<ITEM>.live.txt`, `seeded.json`, `datacheck.json`.
