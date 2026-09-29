#!/bin/sh
# SubagentStop: record the agent that just finished (role, model, effort, minutes, tokens, outcome)
# in the active run's journal, for the runs ledger. No run: one scan of git's worktree files,
# silent. Always exits 0: a hook that cannot record never stops the session.

case $0 in */*) . "${0%/*}/common.sh" ;; *) . ./common.sh ;; esac

delivery_read_payload
delivery_session_dir
state=$(delivery_active_run "$delivery_dir")
[ -n "$state" ] || exit 0

delivery_plugin_root
printf '%s' "$payload" | node "$delivery_root/bin/delivery.mjs" hook subagent-stop >/dev/null 2>&1
exit 0
