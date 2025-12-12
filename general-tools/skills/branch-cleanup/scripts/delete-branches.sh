#!/bin/bash
# delete-branches.sh - Delete branches for specified contributors
#
# Usage: delete-branches.sh [--emails <list>] [--age <months>] [--main-branch <name>] [--dry-run|--execute]
#
# Arguments:
#   --emails <list>     Comma-separated contributor emails (default: your git email)
#   --age <months>      Threshold for abandoned branches (default: 3)
#   --main-branch <name> Branch to check merge status against (default: main)
#   --dry-run           Show what would be deleted (default)
#   --execute           Actually perform deletion

set -uo pipefail

# Defaults
AGE_MONTHS=3
MAIN_BRANCH="main"
DRY_RUN=true
EMAILS=""

# Get current user's email as default
DEFAULT_EMAIL=$(git config user.email 2>/dev/null || echo "")

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
        --emails)
            EMAILS="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --execute)
            DRY_RUN=false
            shift
            ;;
        *)
            echo "Unknown option: $1" >&2
            exit 1
            ;;
    esac
done

# Use default email if none specified
if [[ -z "$EMAILS" ]]; then
    EMAILS="$DEFAULT_EMAIL"
fi

# Protected branches - never delete these
PROTECTED_BRANCHES="main|dev|master|develop"

# Get current branch to avoid deleting it
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "")

# Calculate cutoff date
CUTOFF_DATE=$(date -v-${AGE_MONTHS}m +%s 2>/dev/null || date -d "${AGE_MONTHS} months ago" +%s)

# Fetch to ensure we have latest remote state
echo "Fetching from origin..."
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

# Clean branch name: remove origin/ and remotes/origin/ prefixes
clean_branch_name() {
    echo "$1" | sed 's/^[* ]*//' | sed 's/^remotes\/origin\///' | sed 's/^origin\///'
}

# Function to check if email matches any in list
email_matches() {
    local check_email=$1
    echo "$EMAILS" | tr ',' '\n' | while read -r email; do
        if [[ "$check_email" == "$email" ]]; then
            echo "match"
            return
        fi
    done
}

# Get merged branches
while IFS= read -r raw_branch; do
    [[ -z "$raw_branch" ]] && continue
    branch=$(clean_branch_name "$raw_branch")

    # Skip protected
    if echo "$branch" | grep -qE "^($PROTECTED_BRANCHES)$"; then
        continue
    fi
    [[ "$branch" == "HEAD" ]] && continue

    # Check if current branch
    if [[ "$branch" == "$CURRENT_BRANCH" ]]; then
        echo "Skipping $branch (currently checked out)"
        continue
    fi

    remote_branch="origin/$branch"
    if git rev-parse --verify "$remote_branch" >/dev/null 2>&1; then
        email=$(get_author_email "$remote_branch")
        if [[ -n "$(email_matches "$email")" ]]; then
            echo "$branch" >> "$TMPFILE"
        fi
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

    # Check if current branch
    if [[ "$branch" == "$CURRENT_BRANCH" ]]; then
        echo "Skipping $branch (currently checked out)"
        continue
    fi

    # Skip if already in delete list
    if grep -qF "$branch" "$TMPFILE" 2>/dev/null; then
        continue
    fi

    remote_branch="origin/$branch"
    if git rev-parse --verify "$remote_branch" >/dev/null 2>&1; then
        epoch=$(get_last_commit_epoch "$remote_branch")

        if [[ $epoch -lt $CUTOFF_DATE ]]; then
            email=$(get_author_email "$remote_branch")
            if [[ -n "$(email_matches "$email")" ]]; then
                echo "$branch" >> "$TMPFILE"
            fi
        fi
    fi
done < <(git branch -r --no-merged "origin/$MAIN_BRANCH" 2>/dev/null | grep -v HEAD)

# Show summary
echo ""
echo "=== Branches to Delete ==="
echo "Filtering for: ${EMAILS}"

if [[ ! -s "$TMPFILE" ]]; then
    echo "Total: 0 branches"
    echo ""
    echo "Nothing to delete."
    exit 0
fi

branch_count=$(wc -l < "$TMPFILE" | tr -d ' ')
echo "Total: $branch_count branches"
echo ""

while read -r branch; do
    echo "  - $branch"
done < "$TMPFILE"
echo ""

# Dry run - just show and exit
if [[ "$DRY_RUN" == true ]]; then
    echo "This is a dry run. Use --execute to actually delete branches."
    exit 0
fi

# Confirm before deleting
echo "Are you sure you want to delete $branch_count branches? (y/n)"
read -r confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "Aborted."
    exit 0
fi

# Delete branches
deleted_local=0
deleted_remote=0
failed_branches=""

while read -r branch; do
    echo "Deleting $branch..."

    # Delete local if exists
    if git rev-parse --verify "$branch" >/dev/null 2>&1; then
        if git branch -D "$branch" 2>/dev/null; then
            deleted_local=$((deleted_local + 1))
        fi
    fi

    # Delete remote
    if git push origin --delete "$branch" 2>/dev/null; then
        deleted_remote=$((deleted_remote + 1))
    else
        if [[ -z "$failed_branches" ]]; then
            failed_branches="$branch"
        else
            failed_branches="$failed_branches"$'\n'"$branch"
        fi
    fi
done < "$TMPFILE"

# Report results
echo ""
echo "=== Results ==="
echo "Deleted $deleted_remote remote branches"
echo "Deleted $deleted_local local branches"

if [[ -n "$failed_branches" ]]; then
    echo ""
    echo "Failed to delete:"
    echo "$failed_branches" | while read -r branch; do
        echo "  - $branch"
    done
fi
