#!/usr/bin/env python3
"""_brief.py <template.md> <out.md> KEY=@file KEY=text ...

Fills a brief's {KEY} fields. A value starting with @ is read from that file. Only the part of the template after the
first line that is exactly `---` is used (the part above it is for people). Used by look.sh and abjudge.sh.
"""
import sys

tpl, out = sys.argv[1], sys.argv[2]
text = open(tpl).read()
parts = text.split("\n---\n", 1)
text = parts[1].lstrip("\n") if len(parts) == 2 else text
for kv in sys.argv[3:]:
    k, v = kv.split("=", 1)
    if v.startswith("@"):
        v = open(v[1:]).read().rstrip("\n")
    text = text.replace("{" + k + "}", v)
open(out, "w").write(text)
