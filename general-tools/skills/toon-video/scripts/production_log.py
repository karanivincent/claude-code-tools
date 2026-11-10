#!/usr/bin/env python3
"""How long each step of making a video takes, kept as data (Vincent, 9 November 2026: "keep data ... it would be
very interesting to see it").

    python3 production_log.py add <log> --story S --stage STAGE --step "what was done" [--round N]
                                  [--by "opus agent"] [--minutes M] [--tokens T] [--at ISO] [--note "..."]
    python3 production_log.py report <log> [--story S]
    python3 production_log.py rounds <log> [--story S]

A critique row carries --score (the critic's average, 1-5; rows logged before 11 November 2026 were 0-3 and carry no
`scale`, so `rounds` shows them times 5/3). `rounds` lists each story's critiques in order with the
score, the change from the round before, and the agent hours and calendar hours spent up to that point, so the cost of
each step up is plain, and ends with the count of rounds against the aim of three (toon-video "Three rounds, not
seven").

<log> is the project's docs/production-log.jsonl, one JSON line per step. Stages:
  study     studying a reference video          script    choosing the story, writing the script
  voice     voice, music and the mix            plan      plan, contracts, comic, stills, the shot list
  world     building places                     people    building the cast and props that act
  camera    the camera and joins                build     a build not split by owner
  render    a contact sheet or a full render    critique  a critic scoring a cut
  fix       a fix round after a critique        spike     a try-out of a new technique
  review    the owner looking (when known)      other

`report` sums each story by stage (runs, minutes, tokens), says how long the story took from its first step to its
last (calendar time, with the overnight wait in it), and averages each stage across stories.
"""
import argparse, json, sys
from collections import defaultdict
from datetime import datetime, timezone

STAGES = ['study', 'script', 'voice', 'plan', 'world', 'people', 'camera', 'build', 'render', 'critique', 'fix',
          'spike', 'review', 'other']


def add(a):
    row = {'at': a.at or datetime.now(timezone.utc).isoformat(timespec='minutes'), 'story': a.story, 'stage': a.stage,
           'round': a.round, 'step': a.step, 'by': a.by, 'minutes': a.minutes, 'tokens': a.tokens}
    if a.score is not None:
        row['score'] = a.score
        row['scale'] = 5
    if a.note:
        row['note'] = a.note
    with open(a.log, 'a') as f:
        f.write(json.dumps(row, ensure_ascii=False) + '\n')
    print(json.dumps(row, ensure_ascii=False))


def fmt_t(n):
    return f'{n / 1e6:.2f}M' if n >= 1e5 else f'{n / 1e3:.0f}k'


def report(a):
    rows = [json.loads(l) for l in open(a.log) if l.strip()]
    if a.story:
        rows = [r for r in rows if r['story'] == a.story]
    by_story = defaultdict(list)
    for r in rows:
        by_story[r['story']].append(r)
    stage_all = defaultdict(lambda: [0, 0.0, 0])
    for story, rs in by_story.items():
        rs.sort(key=lambda r: r['at'])
        first, last = rs[0]['at'], rs[-1]['at']
        span = (datetime.fromisoformat(last) - datetime.fromisoformat(first)).total_seconds() / 3600
        mins = sum(r.get('minutes') or 0 for r in rs)
        toks = sum(r.get('tokens') or 0 for r in rs)
        print(f'\n## {story}: {len(rs)} steps, {mins / 60:.1f} h of work, {fmt_t(toks)} tokens, '
              f'{span:.1f} h from first step to last ({first[:16]} to {last[:16]})')
        print(f'{"stage":10s} {"runs":>4s} {"minutes":>8s} {"tokens":>8s}')
        agg = defaultdict(lambda: [0, 0.0, 0])
        for r in rs:
            g = agg[r['stage']]
            g[0] += 1; g[1] += r.get('minutes') or 0; g[2] += r.get('tokens') or 0
            s = stage_all[r['stage']]
            s[0] += 1; s[1] += r.get('minutes') or 0; s[2] += r.get('tokens') or 0
        for st in STAGES:
            if st in agg:
                n, m, t = agg[st]
                print(f'{st:10s} {n:4d} {m:8.1f} {fmt_t(t):>8s}')
    print('\n## One run of each stage, on average across stories')
    print(f'{"stage":10s} {"runs":>4s} {"minutes":>8s} {"tokens":>8s}')
    for st in STAGES:
        if st in stage_all:
            n, m, t = stage_all[st]
            print(f'{st:10s} {n:4d} {m / n:8.1f} {fmt_t(t / n):>8s}')


def rounds(a):
    rows = sorted((json.loads(l) for l in open(a.log) if l.strip()), key=lambda r: r['at'])
    stories = [a.story] if a.story else sorted({r['story'] for r in rows if r['stage'] == 'critique' and 'score' in r})
    for story in stories:
        rs = [r for r in rows if r['story'] == story]
        if not rs:
            continue
        t0, mins, prev = datetime.fromisoformat(rs[0]['at']), 0.0, None
        print(f'\n## {story}')
        print(f'{"critique":>8s} {"score":>5s} {"gain":>6s} {"agent h":>7s} {"calendar h":>10s}  at')
        n = 0
        for r in rs:
            mins += r.get('minutes') or 0
            if r['stage'] == 'critique' and 'score' in r:
                n += 1
                sc = r['score'] * (5 / 3 if r.get('scale', 3) == 3 else 1)   # old rows were 0-3: shown out of 5
                gain = '' if prev is None else f'{sc - prev:+.2f}'
                cal = (datetime.fromisoformat(r['at']) - t0).total_seconds() / 3600
                print(f'{n:8d} {sc:5.2f} {gain:>6s} {mins / 60:7.1f} {cal:10.1f}  {r["at"][:16]}')
                prev = sc
        print(f'{n} round(s) of critique; the aim is three'
              + ('' if n <= 3 else f', {n - 3} over: read the findings for what came back, and why each extra round was needed'))


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest='cmd', required=True)
    pa = sub.add_parser('add')
    pa.add_argument('log'); pa.add_argument('--story', required=True)
    pa.add_argument('--stage', required=True, choices=STAGES); pa.add_argument('--step', required=True)
    pa.add_argument('--round', type=int); pa.add_argument('--by', default='coordinator')
    pa.add_argument('--minutes', type=float); pa.add_argument('--tokens', type=int)
    pa.add_argument('--at'); pa.add_argument('--note'); pa.add_argument('--score', type=float)
    pr = sub.add_parser('report')
    pr.add_argument('log'); pr.add_argument('--story')
    pd = sub.add_parser('rounds')
    pd.add_argument('log'); pd.add_argument('--story')
    a = p.parse_args()
    {'add': add, 'report': report, 'rounds': rounds}[a.cmd](a)


if __name__ == '__main__':
    main()
