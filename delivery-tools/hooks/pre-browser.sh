#!/bin/sh
# PreToolUse on browser tools (spec 11.4). A call that carries an agent_id comes from a subagent;
# while a run is active it is refused, because every browser action by a subagent asks the founder
# for approval. The main session's calls (no agent_id) and every call with no run cost a pattern
# match and nothing else. Exit 0 allows; exit 2 refuses with the reason on stderr.

case $0 in */*) . "${0%/*}/common.sh" ;; *) . ./common.sh ;; esac

delivery_read_payload
case $payload in
  *'"agent_id":null'*|*'"agent_id": null'*|*'"agent_id":""'*|*'"agent_id": ""'*) exit 0 ;;
  *'"agent_id"'*) ;;
  *) exit 0 ;;
esac

delivery_session_dir
state=$(delivery_active_run "$delivery_dir")
[ -n "$state" ] || exit 0

delivery_plugin_root
printf '%s' "$payload" | node "$delivery_root/bin/delivery.mjs" hook pre-browser 1>&2
code=$?
[ "$code" -eq 0 ] && exit 0
[ "$code" -eq 2 ] && exit 2
echo "delivery: a subagent's browser call is refused while a delivery run is active (the hook exited $code)" >&2
exit 2
