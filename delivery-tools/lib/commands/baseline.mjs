// delivery baseline: extract today's capabilities at a ref; M2 diff and refresh.
// Owner: slice B2 (docs/ARCHITECTURE.md). Stub until that slice lands.

import { defineCommand, notImplementedRun } from '../core/command.mjs';

export default defineCommand({
  name: "baseline",
  summary: "Extract today's capabilities at a ref; M2 diff and refresh",
  usage: `usage: delivery baseline [--ref <ref>] [--refresh] [--against <ref>]

Extract every capability of the in-scope routes at a ref (default: the run's start SHA on
origin/<base>): routes and tabs, controls, API calls with discriminating fields, e2e
assertions, copy keys, data fields, open issues naming those files. Writes baseline.json.

options:
  --ref <ref>        extract at this ref
  --refresh          re-read origin/<base>; a capability that landed since the run began gets
                     a plan row (default migrate); red while any is unclassed
  --against <ref>    extract at <ref> (usually HEAD) and run the M2 diff against baseline.json

exit: 0 green; 1 M2 red or an unclassed new capability

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  run: notImplementedRun("B2"),
});
