# Dispatching builders and the scope-reply extractor

`<PLUGIN>` is this plugin's root: two folders above this skill's base directory. `<RUN>` is the
absolute path of `.delivery/<feature>/` in this (the integration) worktree. `<UNIT>`, `<FEATURE>`
and `<BRANCH>` come from the plan and the unit file. Builders run in their own worktrees, so every
path you give them is absolute.

## A unit's first dispatch

Agent tool, from this session only:

| Field | Value |
|---|---|
| `subagent_type` | `delivery-tools:delivery-builder` |
| `isolation` | `worktree` |
| `model` | the unit's `model` (`opus` for the contract unit and `risk: "high"` units) |
| `run_in_background` | `true`: this is the top-level session, so the builder survives the turn and you are notified when it ends |
| `description` | `Build <UNIT>` |
| `prompt` | exactly the text below, nothing added |

```
You are the builder for unit <UNIT> of the <FEATURE> delivery run.
Read <PLUGIN>/briefs/builder.md, then your unit file <RUN>/units/<UNIT>.json.
Work only as they say, and end by writing the report at the unit file's reportPath.
```

Dispatch every unit of the wave in one message, up to `limits.builderParallel`; start the next
unit as a builder finishes. A builder's report file is its marker. Never read an agent's
transcript with `TaskOutput`, and never re-dispatch a unit whose report exists.

## The unit gate

`delivery gate <UNIT>` captures on a dev server the capture itself starts, through the heavy
wrapper, and can run longer than 8 minutes. Run it here with `run_in_background: true`:

```
mkdir -p <RUN>/logs && node scripts/delivery.mjs gate <UNIT> > <RUN>/logs/gate-<UNIT>.txt 2>&1; echo $? > <RUN>/logs/gate-<UNIT>.exit
```

Wait for the `.exit` file (or the completion notice). `0`: `delivery wave merge <UNIT>`. `1`:
the gate wrote its failures to `<RUN>/units/<UNIT>.gate.json`, and the builder continues from
that file. Several gates may be queued at once; the heavy wrapper hands out the machine's slots.

## Continuing after a red gate

Preferred: SendMessage to the same builder:

```
The gate for <UNIT> is red. Its failures are in <RUN>/units/<UNIT>.gate.json. Continue on your branch as the brief says, then rewrite your report.
```

If that builder is gone (a new session, a crash), dispatch fresh with the same fields and:

```
You are the builder for unit <UNIT> of the <FEATURE> delivery run, continuing on branch <BRANCH>.
Read <PLUGIN>/briefs/builder.md, then your unit file <RUN>/units/<UNIT>.json, then the gate's failures in <RUN>/units/<UNIT>.gate.json.
Work only as they say, and end by rewriting the report at the unit file's reportPath.
```

When `delivery wave merge <UNIT>` stops on a conflict, the same message form tells the builder to
merge `origin/<integration branch>` into its unit branch and resolve the files it names.

If the continuing builder reports that its branch is checked out in another worktree, that
worktree belonged to the builder that died: its commits are safe on the branch, and a builder
writes nothing else there. Remove it with `git worktree remove <path>` and dispatch again.

## A correction

A correction for one unit goes into the plan (its rows, markers or files), then `delivery wave
start` rewrites the unit files. A correction for every builder is a change to the brief in the
plugin. Neither goes into a dispatch prompt.

## The scope-reply extractor

When `delivery wave start` (through `scope read`) lists founder comments it could not map:

| Field | Value |
|---|---|
| `subagent_type` | `delivery-tools:delivery-extractor` |
| `run_in_background` | `false` |
| `prompt` | the text below |

```
Read <PLUGIN>/briefs/extractor-scope-reply.md and follow it.
Feature: <FEATURE>
Plan: <absolute path of docs/delivery/<FEATURE>/plan.json>
Comments:
<one block per comment: id, time, the text verbatim>
Write: <RUN>/scope-replies/<YYYYMMDD-HHMM>.json
```

Then, for each comment in the extractor's file:

- mapped: `delivery scope read --apply "<reply>" --comment <id>`, one `--apply` per decision
  (the `reply` field, such as `S2 keep`);
- unmapped: `delivery scope read --ignore <id>`. Its lines keep their defaults, the journal
  records it, and the generated report names it under Went wrong.

Never edit the plan's classes for a reply by hand, and never ask him what he meant.
