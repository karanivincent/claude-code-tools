# Operating delivery-tools

How to install it, start a run, keep it current, and the few things that fail silently unless
someone does them. Written after the first end-to-end rehearsal, which found 57 bugs by running the
whole system for real; every rule below is one of them.

## Install

The plugin ships from this marketplace. A project that uses it enables it in its own
`.claude/settings.json`, so everyone who opens that project gets it:

```json
{
  "extraKnownMarketplaces": {
    "vince-tools-marketplace": { "source": { "source": "github", "repo": "karanivincent/claude-code-tools" } }
  },
  "enabledPlugins": { "delivery-tools@vince-tools-marketplace": true }
}
```

The project also needs its own profile, `.claude/delivery-profile.json`, and safety file,
`.claude/delivery-safety.json` (spec section 18). `delivery init` drafts the profile; the safety
file is written by the project's owner, because it names the numbers and identities no agent may
invent. The project's `scripts/delivery.mjs` shim finds the installed plugin.

## Start a run

1. Export the design from Claude Design as a **project archive (.zip)**. A standalone HTML download
   is a rendered page without the design's source; `intake` refuses it and says so.
2. Open a new session on the project's repository.
3. `/deliver-from-design <archive>.zip "<one sentence: what the page is for>"`

The run asks nothing in chat. Decisions only the owner can make go on one Scope issue, each with a
default. It ends with one draft pull request whose generated report leads with what is still red.

## Things a session must do that nothing else will

- **Enter the run's worktree.** `intake` creates the run in its own worktree. A session in any other
  worktree has every write into it refused, its agents' included: in the rehearsal four auditors
  finished an audit and could not save a line. Switch with `EnterWorktree` (its `path`) as soon as
  intake or NEXT names the worktree. The consuming project's `CLAUDE.md` should say so, because the
  tool is only used when the user or the project's instructions ask for it.
- **Keep the installed copy current.** The plugin cache is a copy, not a link. A change reaches a
  session only after the plugin's version is bumped, released, and the copy updated
  (`claude plugin update delivery-tools@vince-tools-marketplace`). Once, the installed copy ran two
  days and 57 files behind the code with nothing to show it.
- **Name the env files.** A run works in worktrees, and a project's untracked `.env` exists only in
  its main checkout. The profile's `environments.envFiles` lists the files the CLI reads from the
  main checkout at startup; it fills only variables the shell has not set and prints no value.
- **Cap the builders.** `limits.builderParallel` in the profile. Seventeen agents in parallel once
  used a week of model budget in an afternoon; three is a sane default.

## Rules the rehearsal wrote

| Rule | Why |
|---|---|
| Never wrap `delivery capture` in a heavy-work slot wrapper | it takes its own slots and deadlocks waiting on yours |
| Push every integration commit before a wave capture | a wave capture waits for a preview of the pushed head, for ever if it was never pushed |
| Address controls in reach steps by test id | a step that names words is captured in the primary locale only, and cannot be replayed in a messy world |
| A fix unit may own no state | its gate captures the states of every unit whose files it changes, so a regression is caught at the gate, not a wave later |
| A version route may sit behind sign-in | `ready` then proves the served commit from the full capture, which signed in and read it on every item |
| Reads and sign-ins retry on a dropped connection; writes never do | an upsert whose response was lost may already have landed |
| A run whose pull request was closed unmerged closes with `advance closed` | otherwise the session-start hook tells every later session to resume it |

## The Trust rule

Section 20 of the spec gates real use. 20.2 (the real-artefact tests) passed on 2026-09-21. 20.5
(the seeded-defect rehearsal) passed on five of seven defects; defects 4 (a stale base) and 7 (a
removed capability) need a baseline, so they are proven on the first real run that is a redesign,
and only when that run's request asks for it.

## Where the spec is

The normative spec, its reviews and the full build record cite the first consuming project's own
pages, so they live in that project's repository, not in this public one. `docs/STATE.md` says
where.
