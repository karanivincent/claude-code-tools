#!/bin/sh
# PreToolUse on Bash (spec 11.4). The fast path matches only commands that mention gh pr ready, a
# gh api call marking a PR ready for review, or a seed, and only while a run is active does Node
# start: `delivery hook pre-bash` then lexes the command and runs the ready check or refuses a raw
# seed. Exit 0 allows; exit 2 refuses with the reason on stderr. Never non-zero on the fast path.

case $0 in */*) . "${0%/*}/common.sh" ;; *) . ./common.sh ;; esac

delivery_read_payload
cmd=${payload#*\"command\"}
case $cmd in
  *"gh "*pr*ready*) ;;
  *"gh "*api*ready_for_review*|*"gh "*api*markPullRequestReadyForReview*) ;;
  *[Ss][Ee][Ee][Dd]*) ;;
  *) exit 0 ;;
esac

delivery_session_dir
state=$(delivery_active_run "$delivery_dir")
[ -n "$state" ] || exit 0

delivery_plugin_root
printf '%s' "$payload" | node "$delivery_root/bin/delivery.mjs" hook pre-bash 1>&2
code=$?
[ "$code" -eq 0 ] && exit 0
[ "$code" -eq 2 ] && exit 2
echo "delivery: the pre-bash hook could not decide (exit $code) while a delivery run is active, so the command is refused; run delivery status" >&2
exit 2
