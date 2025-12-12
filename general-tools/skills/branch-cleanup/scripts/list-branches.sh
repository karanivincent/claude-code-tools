#!/bin/bash
# list-branches.sh - List candidate branches for cleanup, grouped by contributor
#
# Usage: list-branches.sh [--age <months>] [--main-branch <name>]
#
# Arguments:
#   --age <months>      Threshold for abandoned branches (default: 3)
#   --main-branch <name> Branch to check merge status against (default: main)

set -uo pipefail

# Defaults
AGE_MONTHS=3
MAIN_BRANCH=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --age)
            AGE_MONTHS="$2"
            shift 2
            ;;
        --main-branch)
            MAIN_BRANCH="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1" >&2
            exit 1
            ;;
    esac
done

# Auto-detect main branch if not specified
if [[ -z "$MAIN_BRANCH" ]]; then
    MAIN_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')
    if [[ -z "$MAIN_BRANCH" ]]; then
        # Fallback: try common branch names
        for branch in main master dev develop; do
            if git rev-parse --verify "origin/$branch" >/dev/null 2>&1; then
                MAIN_BRANCH="$branch"
                break
            fi
        done
    fi
    [[ -z "$MAIN_BRANCH" ]] && MAIN_BRANCH="main"  # Final fallback
    echo "Auto-detected main branch: $MAIN_BRANCH" >&2
fi

# Protected branches - never delete these
PROTECTED_BRANCHES="main|dev|master|develop"

# Calculate cutoff date
CUTOFF_DATE=$(date -v-${AGE_MONTHS}m +%s 2>/dev/null || date -d "${AGE_MONTHS} months ago" +%s)

# Fetch to ensure we have latest remote state
echo "Fetching from origin..." >&2
git fetch origin --prune >/dev/null 2>&1 || true

# Temp file for collecting branches
TMPFILE=$(mktemp)
trap "rm -f $TMPFILE" EXIT

# Function to get last commit date as epoch
get_last_commit_epoch() {
    git log -1 --format=%ct "$1" 2>/dev/null || echo "0"
}

# Function to get last commit author email
get_author_email() {
    git log -1 --format=%ae "$1" 2>/dev/null || echo "unknown"
}

# Function to format relative time
format_relative_time() {
    local epoch=$1
    local now=$(date +%s)
    local diff=$((now - epoch))
    local days=$((diff / 86400))
    local months=$((days / 30))

    if [[ $months -gt 0 ]]; then
        echo "${months}m ago"
    elif [[ $days -gt 0 ]]; then
        echo "${days}d ago"
    else
        echo "today"
    fi
}

# Clean branch name: remove origin/ and remotes/origin/ prefixes
clean_branch_name() {
    echo "$1" | sed 's/^[* ]*//' | sed 's/^remotes\/origin\///' | sed 's/^origin\///'
}

# Get merged branches using process substitution to avoid subshell
while IFS= read -r raw_branch; do
    [[ -z "$raw_branch" ]] && continue
    branch=$(clean_branch_name "$raw_branch")

    # Skip protected
    if echo "$branch" | grep -qE "^($PROTECTED_BRANCHES)$"; then
        continue
    fi
    [[ "$branch" == "HEAD" ]] && continue

    remote_branch="origin/$branch"
    if git rev-parse --verify "$remote_branch" >/dev/null 2>&1; then
        email=$(get_author_email "$remote_branch")
        epoch=$(get_last_commit_epoch "$remote_branch")
        relative=$(format_relative_time "$epoch")
        echo "MERGED|$email|$branch|$relative" >> "$TMPFILE"
    fi
done < <(git branch -r --merged "origin/$MAIN_BRANCH" 2>/dev/null | grep -v HEAD)

# Get unmerged abandoned branches
while IFS= read -r raw_branch; do
    [[ -z "$raw_branch" ]] && continue
    branch=$(clean_branch_name "$raw_branch")

    # Skip protected
    if echo "$branch" | grep -qE "^($PROTECTED_BRANCHES)$"; then
        continue
    fi
    [[ "$branch" == "HEAD" ]] && continue

    remote_branch="origin/$branch"
    if git rev-parse --verify "$remote_branch" >/dev/null 2>&1; then
        epoch=$(get_last_commit_epoch "$remote_branch")

        if [[ $epoch -lt $CUTOFF_DATE ]]; then
            email=$(get_author_email "$remote_branch")
            relative=$(format_relative_time "$epoch")
            # Skip if already in merged
            if ! grep -qF "|$branch|" "$TMPFILE" 2>/dev/null; then
                echo "ABANDONED|$email|$branch|$relative" >> "$TMPFILE"
            fi
        fi
    fi
done < <(git branch -r --no-merged "origin/$MAIN_BRANCH" 2>/dev/null | grep -v HEAD)

# Output header
echo ""
echo "=== Branch Cleanup Candidates ==="
echo "Main branch: $MAIN_BRANCH"
echo "Abandoned threshold: $AGE_MONTHS months"
echo ""

if [[ ! -s "$TMPFILE" ]]; then
    echo "No branches found for cleanup."
    echo ""
    echo "=== Summary ==="
    echo "Total: 0 branches (0 merged, 0 abandoned)"
    exit 0
fi

# Sort by email and type, then output grouped
current_email=""
current_type=""

sort -t'|' -k2,2 -k1,1 "$TMPFILE" | while IFS='|' read -r type email branch relative; do
    if [[ "$email" != "$current_email" ]]; then
        if [[ -n "$current_email" ]]; then
            echo ""
        fi
        # Count branches for this email
        email_count=$(grep -c "|$email|" "$TMPFILE" 2>/dev/null || echo "0")
        echo "$email ($email_count branches):"
        current_email="$email"
        current_type=""
    fi

    if [[ "$type" != "$current_type" ]]; then
        echo "  $type:"
        current_type="$type"
    fi

    echo "    - $branch ($relative)"
done

# Summary
total_merged=$(grep -c "^MERGED|" "$TMPFILE" 2>/dev/null || echo "0")
total_abandoned=$(grep -c "^ABANDONED|" "$TMPFILE" 2>/dev/null || echo "0")
total=$((total_merged + total_abandoned))

echo ""
echo "=== Summary ==="
echo "Total: $total branches ($total_merged merged, $total_abandoned abandoned)"
