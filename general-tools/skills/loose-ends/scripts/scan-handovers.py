#!/usr/bin/env python3
"""Scope handover docs by branch and extract their checkbox items.

Read-only. Emits JSON on stdout and never edits, commits, or fetches destructively.

Scope rules:
  default  handovers present on the integration branch (origin/staging) but NOT on
           the release branch (origin/main) -- merged but not yet released
  --all    every handover present on the integration branch

Handovers that exist only on an unmerged feature branch are deliberately invisible:
unticked boxes there are expected work, not debt.

Exit codes: 0 = scan completed, 2 = could not check (refs missing, not a repo, ...)
"""

import argparse
import json
import os
import re
import subprocess
import sys

CHECKBOX = re.compile(r"^(?P<indent>\s*)[-*]\s+\[(?P<mark>[ xX])\]\s+(?P<text>.+?)\s*$")
DEFERRED = re.compile(
    r"<!--\s*deferred:\s*(?P<date>\d{4}-\d{2}-\d{2})?\s*(?P<reason>.*?)\s*-->"
)


def git(repo, *args):
    proc = subprocess.run(
        ["git", "-C", repo, *args], capture_output=True, text=True
    )
    return proc.returncode, proc.stdout, proc.stderr.strip()


def fail(message, **extra):
    print(json.dumps({"status": "could_not_check", "error": message, **extra}, indent=2))
    sys.exit(2)


def list_handovers(repo, ref, path):
    code, out, err = git(repo, "ls-tree", "-r", "--name-only", ref, "--", path)
    if code != 0:
        fail(f"could not list {path} on {ref}: {err}")
    return [line for line in out.splitlines() if line.endswith(".md")]


def read_blob(repo, ref, path):
    code, out, err = git(repo, "show", f"{ref}:{path}")
    if code != 0:
        return None
    return out


NEW_BLOCK = re.compile(r"^\s*(?:[-*+]\s|\d+[.)]\s|#|>|```|\|)")


def parse(text):
    """Split a handover's checkbox items into open / deferred / ticked.

    A checkbox item can wrap across several physical lines, so each item records
    the line its `- [ ]` sits on and the last line of its wrapped text. Ticking
    edits the first line; a deferral marker is appended to the last one.
    """
    lines = text.splitlines()
    open_items, deferred_items, ticked = [], [], 0
    index = 0
    while index < len(lines):
        match = CHECKBOX.match(lines[index])
        if not match:
            index += 1
            continue

        start = index
        body = [match.group("text")]
        index += 1
        while index < len(lines):
            nxt = lines[index]
            if not nxt.strip() or NEW_BLOCK.match(nxt) or not nxt.startswith((" ", "\t")):
                break
            body.append(nxt.strip())
            index += 1
        end = index  # 1-based line number of the item's last physical line

        if match.group("mark") in ("x", "X"):
            ticked += 1
            continue

        joined = " ".join(body)
        marker = DEFERRED.search(joined)
        label = DEFERRED.sub("", joined).strip()
        item = {"line": start + 1, "end_line": end, "text": label}
        if marker:
            item["deferred_on"] = marker.group("date")
            item["reason"] = marker.group("reason") or None
            deferred_items.append(item)
        else:
            open_items.append(item)
    return open_items, deferred_items, ticked


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--repo", default=".", help="repository root (default: cwd)")
    ap.add_argument("--dir", default="docs/handovers", help="handover directory")
    ap.add_argument("--integration-ref", default="origin/staging")
    ap.add_argument("--release-ref", default="origin/main")
    ap.add_argument("--all", action="store_true", help="include released handovers")
    ap.add_argument("--fetch", action="store_true", help="git fetch first")
    args = ap.parse_args()

    repo = os.path.abspath(args.repo)
    code, out, err = git(repo, "rev-parse", "--show-toplevel")
    if code != 0:
        fail(f"{repo} is not a git repository: {err}")
    repo = out.strip()

    if args.fetch:
        git(repo, "fetch", "--quiet", "origin")

    refs = {}
    for label, ref in (
        ("integration", args.integration_ref),
        ("release", args.release_ref),
    ):
        code, out, err = git(repo, "rev-parse", "--verify", "--quiet", f"{ref}^{{commit}}")
        if code != 0:
            fail(
                f"ref {ref} not found -- run `git fetch origin`, or pass the branch "
                f"names this project actually uses",
                missing_ref=ref,
            )
        refs[label] = {"ref": ref, "sha": out.strip()[:12]}

    on_integration = list_handovers(repo, args.integration_ref, args.dir)
    if not on_integration:
        fail(
            f"no handover markdown found in {args.dir} on {args.integration_ref} -- "
            f"pass --dir if this project keeps them elsewhere"
        )
    released = set(list_handovers(repo, args.release_ref, args.dir))

    selected = on_integration if args.all else [
        p for p in on_integration if p not in released
    ]

    files, totals = [], {"open": 0, "deferred": 0, "ticked": 0}
    unreadable = []
    for path in sorted(selected):
        text = read_blob(repo, args.integration_ref, path)
        if text is None:
            unreadable.append(path)
            continue
        open_items, deferred_items, ticked = parse(text)
        totals["open"] += len(open_items)
        totals["deferred"] += len(deferred_items)
        totals["ticked"] += ticked
        files.append(
            {
                "path": path,
                "released": path in released,
                "open": open_items,
                "deferred": deferred_items,
                "ticked": ticked,
            }
        )

    result = {
        "status": "ok" if not unreadable else "partial",
        "scope": "all" if args.all else "merged-not-released",
        "refs": refs,
        "counts": {
            "handovers_on_integration": len(on_integration),
            "handovers_in_scope": len(files),
            "handovers_released": len(released),
            **totals,
        },
        "files": files,
    }
    if unreadable:
        result["unreadable"] = unreadable
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
