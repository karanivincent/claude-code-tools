#!/usr/bin/env python3
"""Compare declared environment variables against what each platform actually holds.

Read-only, names only. Values are never read, printed, compared, or stored -- a
variable being present is the whole signal, and putting secret values in a
transcript would be worse than the drift being audited.

Expects an env registry shaped like:

    {
      "files": {
        "dashboard": {"envFile": "apps/dashboard/.env.local",
                      "deployment": "vercel", "deploymentId": "prj_..."},
        "voice-server": {"envFile": "apps/voice-server/.env",
                         "deployment": "render", "deploymentId": "srv-..."}
      },
      "variables": {
        "SOME_VAR": {"targets": ["dashboard"], "deployments": ["vercel"]}
      }
    }

Every platform reports one of three outcomes: ok (reached, compared),
could_not_check (never rendered as passing), or skipped (nothing declared).

Exit codes: 0 = every platform reached, 1 = at least one could not be checked,
2 = the registry itself could not be read.
"""

import argparse
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request

NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
RENDER_API = "https://api.render.com/v1"


def die(message):
    print(json.dumps({"status": "could_not_check", "error": message}, indent=2))
    sys.exit(2)


def vercel_names(repo, project_dir, token=None):
    """Names held by a Vercel project, via the authenticated CLI."""
    cwd = os.path.join(repo, project_dir) if project_dir else repo
    if not os.path.isdir(cwd):
        return None, f"project directory {project_dir} not found in the repo"
    cmd = ["vercel", "env", "ls"]
    if token:
        cmd += ["--token", token]
    try:
        proc = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=120)
    except FileNotFoundError:
        return None, "vercel CLI not installed (npm i -g vercel, then `vercel login`)"
    except subprocess.TimeoutExpired:
        return None, "vercel env ls timed out after 120s"
    if proc.returncode != 0:
        return None, f"vercel env ls failed: {proc.stderr.strip()[:300]}"

    names = set()
    for line in proc.stdout.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        first = re.split(r"\s{2,}|\t", stripped)[0].strip()
        if first.lower() in ("name", "value", "environments", "created"):
            continue
        if NAME.match(first) and first.upper() == first:
            names.add(first)
    if not names:
        return None, (
            "vercel env ls returned no parseable variable names -- the project may "
            "not be linked (`vercel link`) or the output format changed"
        )
    return names, None


def render_names(service_id, api_key):
    """Names held by a Render service, via the REST API (paginated)."""
    names, cursor = set(), None
    while True:
        url = f"{RENDER_API}/services/{service_id}/env-vars?limit=100"
        if cursor:
            url += f"&cursor={cursor}"
        request = urllib.request.Request(
            url,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Accept": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                payload = json.load(response)
        except urllib.error.HTTPError as exc:
            return None, f"Render API {exc.code} for service {service_id}"
        except Exception as exc:  # noqa: BLE001 - surfaced verbatim, never swallowed
            return None, f"Render API request failed: {exc}"
        if not payload:
            break
        for row in payload:
            key = (row.get("envVar") or {}).get("key")
            if key:
                names.add(key)
            cursor = row.get("cursor") or cursor
        if len(payload) < 100:
            break
    return names, None


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--repo", default=".", help="repository root (default: cwd)")
    ap.add_argument("--registry", default="docs/env-registry.json")
    args = ap.parse_args()

    repo = os.path.abspath(args.repo)
    registry_path = os.path.join(repo, args.registry)
    try:
        with open(registry_path, encoding="utf-8") as handle:
            registry = json.load(handle)
    except OSError as exc:
        die(f"could not read {args.registry}: {exc}")
    except json.JSONDecodeError as exc:
        die(f"{args.registry} is not valid JSON: {exc}")

    files = registry.get("files") or {}
    variables = registry.get("variables") or {}
    if not variables:
        die(f"{args.registry} declares no variables")

    # Which deployment target each registry file key points at.
    services = {
        key: meta
        for key, meta in files.items()
        if meta.get("deployment") and meta.get("deploymentId")
    }

    expected = {}  # service key -> set of variable names
    untargeted, unmapped = [], []
    for name, meta in variables.items():
        deployments = meta.get("deployments") or []
        if not deployments:
            untargeted.append(name)
            continue
        targets = meta.get("targets") or []
        matched = False
        for key, service in services.items():
            if service["deployment"] in deployments and key in targets:
                expected.setdefault(key, set()).add(name)
                matched = True
        if not matched:
            unmapped.append(name)

    platforms, degraded = {}, False
    for key, service in services.items():
        want = expected.get(key, set())
        entry = {
            "platform": service["deployment"],
            "service_id": service["deploymentId"],
            "expected": len(want),
        }
        if not want:
            entry["status"] = "skipped"
            entry["note"] = "no variables declared for this service"
            platforms[key] = entry
            continue

        if service["deployment"] == "vercel":
            project_dir = os.path.dirname(service.get("envFile", "")) or None
            have, error = vercel_names(repo, project_dir, os.environ.get("VERCEL_TOKEN"))
        elif service["deployment"] == "render":
            api_key = os.environ.get("RENDER_API_KEY")
            if not api_key:
                have, error = None, "RENDER_API_KEY not set in this shell"
            else:
                have, error = render_names(service["deploymentId"], api_key)
        else:
            have, error = None, f"no reader implemented for {service['deployment']}"

        if have is None:
            degraded = True
            entry["status"] = "could_not_check"
            entry["error"] = error
        else:
            missing = sorted(want - have)
            entry["status"] = "ok"
            entry["present"] = len(want) - len(missing)
            entry["missing"] = missing
            entry["extra_on_platform"] = sorted(have - want)
        platforms[key] = entry

    result = {
        "status": "partial" if degraded else "ok",
        "registry": args.registry,
        "platforms": platforms,
        "untargeted": sorted(untargeted),
        "unmapped": sorted(unmapped),
        "note": "names only -- no values were read or compared",
    }
    print(json.dumps(result, indent=2))
    sys.exit(1 if degraded else 0)


if __name__ == "__main__":
    main()
