#!/usr/bin/env python3
"""Ask the observation files of many studied videos one question, or get the overview.

    python3 query_shots.py <library-dir>                 the overview across every video that has shots.json
    python3 query_shots.py <library-dir> joins           every join, by kind, with video and second
    python3 query_shots.py <library-dir> field <path>    counts of one field, e.g. camera.lens or people.expression

<library-dir> holds one folder per video (docs/studies/<channel>/), each with shots.json and seconds.jsonl
(copied from the study's observe/ folder). Plain counts, no judgement.
"""
import json, statistics, sys
from collections import Counter
from pathlib import Path


def load(lib):
    vids = []
    for d in sorted(Path(lib).iterdir()):
        f = d / 'shots.json'
        if f.exists():
            shots = json.load(open(f))
            secs = [json.loads(l) for l in open(d / 'seconds.jsonl')] if (d / 'seconds.jsonl').exists() else []
            vids.append((d.name, shots, secs))
    return vids


def values(shot, path):
    head, _, rest = path.partition('.')
    v = shot.get(head)
    if isinstance(v, list):
        out = []
        for x in v:
            out += [x.get(rest)] if rest and isinstance(x, dict) else [x]
        return out
    if rest and isinstance(v, dict):
        v = v.get(rest)
    return v if isinstance(v, list) else [v]


def main():
    lib = sys.argv[1]
    vids = load(lib)
    if not vids:
        sys.exit(f'no shots.json under {lib}')
    what = sys.argv[2] if len(sys.argv) > 2 else 'overview'
    if what == 'joins':
        by = {}
        for name, d, _ in vids:
            for s in d['shots']:
                by.setdefault(s['join_out']['kind'], []).append(f"{name} {s['end']:.1f} s" + (f" via {s['join_out']['via']}" if s['join_out'].get('via') else ''))
        for k, xs in sorted(by.items(), key=lambda kv: -len(kv[1])):
            print(f'{k} ({len(xs)}): ' + '; '.join(xs))
        return
    if what == 'field':
        c = Counter()
        for _, d, _ in vids:
            for s in d['shots']:
                c.update(str(v) for v in values(s, sys.argv[3]))
        for k, n in c.most_common():
            print(f'{n:4d}  {k}')
        return
    print(f'{"video":20s} {"s":>5s} {"shots":>5s} {"median shot s":>13s} {"cuts":>4s} {"bright":>6s} {"sat":>5s}')
    for name, d, secs in vids:
        lens = [s['end'] - s['start'] for s in d['shots']]
        cuts = sum(1 for s in d['shots'] if s['join_out']['kind'] == 'hard cut')
        b = statistics.mean(r['bright'] for r in secs) if secs else float('nan')
        sat = statistics.mean(r['sat'] for r in secs) if secs else float('nan')
        print(f'{name:20s} {d["duration"]:5.1f} {len(lens):5d} {statistics.median(lens):13.2f} {cuts:4d} {b:6.0f} {sat:5.2f}')
    for field in ('join_out.kind', 'camera.lens', 'camera.moves', 'people.expression', 'time_of_day'):
        c = Counter()
        for _, d, _ in vids:
            for s in d['shots']:
                c.update(str(v) for v in values(s, field))
        print(f'\n{field}: ' + ', '.join(f'{k} {n}' for k, n in c.most_common(10)))


if __name__ == '__main__':
    main()
