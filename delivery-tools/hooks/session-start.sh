#!/bin/sh
# SessionStart (startup, resume, compact, clear): print `delivery status --brief` for every active
# run in this repository's worktrees, so a compacted session resumes from NEXT (spec 11.4).
# No run: one scan of git's worktree files, silent. Always exits 0.

case $0 in */*) . "${0%/*}/common.sh" ;; *) . ./common.sh ;; esac

delivery_read_payload
delivery_session_dir
state=$(delivery_active_run "$delivery_dir")
[ -n "$state" ] || exit 0

delivery_plugin_root
printf '%s' "$payload" | node "$delivery_root/bin/delivery.mjs" hook session-start
exit 0
