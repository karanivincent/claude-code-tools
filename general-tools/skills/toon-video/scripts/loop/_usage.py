#!/usr/bin/env python3
"""_usage.py <raw.json> <reply.md> <usage.jsonl> <by> <model> <wall-seconds>

look.sh and abjudge.sh start `claude -p --output-format json`. Its stdout is one JSON object: the reply text in
`result`, the tokens in `usage` (input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens),
`duration_ms`, `num_turns` and `total_cost_usd`. This helper writes the reply text to <reply.md> and appends one line
to <usage.jsonl>:
  {"by": "reviewer-1", "model": "sonnet", "tokens": <all four counts added, as the production log counts them>,
   "input": .., "output": .., "cache_read": .., "cache_write": .., "seconds": .., "turns": .., "cost_usd": ..}
A stdout that is not that JSON (an older CLI, or an error) is copied to <reply.md> unchanged and logged with null
counts, so a round still runs. Used by look.sh and abjudge.sh; step.mjs adds the lines up into the round's log line.
"""
import json
import sys

raw_p, reply_p, usage_p, by, model, wall = sys.argv[1:7]
raw = open(raw_p, encoding="utf-8", errors="replace").read() if raw_p != "-" else ""
row = {"by": by, "model": model, "tokens": None, "input": None, "output": None, "cache_read": None,
       "cache_write": None, "seconds": float(wall), "turns": None, "cost_usd": None}
text = raw
try:
    j = json.loads(raw)
    if isinstance(j, list):  # a stream-json array: the result object is the last one with "result"
        j = next((x for x in reversed(j) if isinstance(x, dict) and "result" in x), {})
    if isinstance(j, dict) and "result" in j:
        text = j.get("result") or ""
        u = j.get("usage") or {}
        row.update({
            "input": u.get("input_tokens"), "output": u.get("output_tokens"),
            "cache_read": u.get("cache_read_input_tokens"), "cache_write": u.get("cache_creation_input_tokens"),
            "turns": j.get("num_turns"), "cost_usd": j.get("total_cost_usd"),
        })
        parts = [row[k] for k in ("input", "output", "cache_read", "cache_write") if isinstance(row[k], (int, float))]
        row["tokens"] = int(sum(parts)) if parts else None
        if isinstance(j.get("duration_ms"), (int, float)):
            row["seconds"] = round(j["duration_ms"] / 1000, 1)
        if j.get("is_error"):
            row["error"] = j.get("subtype") or True
except (json.JSONDecodeError, ValueError):
    row["error"] = "stdout was not JSON (an older claude CLI?); reply kept as text, no token count"
open(reply_p, "w").write(text if text.endswith("\n") or not text else text + "\n")
with open(usage_p, "a") as fh:
    fh.write(json.dumps(row) + "\n")
