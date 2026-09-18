# Shared by the delivery hook scripts (spec 11.4, 15.2). Sourced, never run. POSIX sh, builtins only
# on the no-run path: answering "is a delivery run active here?" must cost well under 50 ms, so the
# worktree scan reads git's own worktree files instead of starting git. Node decides anything more.

# Read the hook payload from stdin into $payload.
delivery_read_payload() {
  payload=$(cat)
}

# Set delivery_value to the first "key":"value" string in $payload; return 1 when absent.
# Enough for plain paths; a value with escaped quotes is cut at the first one.
delivery_json_str() {
  case $payload in
    *"\"$1\":\""*) delivery_value=${payload#*\""$1"\":\"} ;;
    *"\"$1\": \""*) delivery_value=${payload#*\""$1"\": \"} ;;
    *) delivery_value=; return 1 ;;
  esac
  delivery_value=${delivery_value%%\"*}
}

# The directory the session works in: the payload's cwd, else $PWD.
delivery_session_dir() {
  if delivery_json_str cwd && [ -d "$delivery_value" ]; then
    delivery_dir=$delivery_value
  else
    delivery_dir=$PWD
  fi
}

# Print every worktree root of the repository holding $1, one per line, without starting git.
delivery_worktrees() {
  _d=$1
  while [ ! -e "$_d/.git" ]; do
    case $_d in /|'') return 0 ;; esac
    _d=${_d%/*}
    [ -n "$_d" ] || _d=/
  done
  printf '%s\n' "$_d"
  if [ -d "$_d/.git" ]; then
    _common=$_d/.git
  else
    _l=
    IFS= read -r _l < "$_d/.git" || [ -n "$_l" ] || return 0
    _gd=${_l#gitdir: }
    case $_gd in /*) ;; *) _gd=$_d/$_gd ;; esac
    _c=
    if [ -f "$_gd/commondir" ]; then IFS= read -r _c < "$_gd/commondir" || [ -n "$_c" ]; fi
    case $_c in
      '') _common=$_gd ;;
      /*) _common=$_c ;;
      *) _common=$(cd "$_gd/$_c" 2>/dev/null && pwd -P) || return 0 ;;
    esac
  fi
  case $_common in */.git) printf '%s\n' "${_common%/.git}" ;; esac
  for _g in "$_common"/worktrees/*/gitdir; do
    [ -f "$_g" ] || continue
    _p=
    IFS= read -r _p < "$_g" || [ -n "$_p" ] || continue
    case $_p in /*) ;; *) _p=${_g%/gitdir}/$_p ;; esac
    printf '%s\n' "${_p%/.git}"
  done
}

# The run root the profile names (paths.runRoot), else .delivery.
delivery_run_root() {
  delivery_runroot=.delivery
  _prof=$1/.claude/delivery-profile.json
  [ -f "$_prof" ] || return 0
  _r=$(sed -n 's/.*"runRoot"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$_prof" 2>/dev/null)
  [ -n "$_r" ] && delivery_runroot=${_r%%
*}
  return 0
}

# Print the state.json of the first active run (phase not closed) in any worktree of $1's repository.
delivery_active_run() {
  delivery_run_root "$1"
  delivery_worktrees "$1" | while IFS= read -r _wt; do
    for _s in "$_wt/$delivery_runroot"/*/state.json; do
      [ -f "$_s" ] || continue
      grep -q '"phase": "closed"' "$_s" 2>/dev/null && continue
      printf '%s\n' "$_s"
      exit 0
    done
  done
}

# The plugin root: CLAUDE_PLUGIN_ROOT, else the directory above this script.
delivery_plugin_root() {
  case $0 in */*) _here=${0%/*} ;; *) _here=. ;; esac
  delivery_root=${CLAUDE_PLUGIN_ROOT:-$_here/..}
}
