#!/usr/bin/env python3
"""How long each step of making a video takes, kept as data (Vincent, 9 November 2026: "keep data ... it would be
very interesting to see it").

    python3 production_log.py add <log> --story S --stage STAGE --step "what was done" [--round N]
                                  [--by "opus agent"] [--minutes M] [--tokens T] [--at ISO] [--note "..."]
    python3 production_log.py report <log> [--story S]
    python3 production_log.py rounds <log> [--story S]
    python3 production_log.py profile <log> --story S --channel C --look L --methods m1,m2 [--note "..."]
    python3 production_log.py areas <log>
    python3 production_log.py audience <log> --story S --days 7 --viewed 0.62 --avg-viewed 0.78 [--views N]
                                       [--dips 9.5,38,61] [--url U]

An audience row is what viewers did, the yardstick the critic is calibrated against (toon-video step 11): the share
who viewed rather than swiped away, the average percentage viewed, and the seconds where the retention graph dips.
`areas` prints them beside the critic's last scores, and for each dip the critic's score at that second when the
story's per-second table is given (--scores docs/stories/<slug>/review-N-scores.md).

A profile row says what kind of video a story is, so videos can be compared by how they were made (Vincent,
10 November 2026: "this one was 3D items from Higgsfield, or still pictures from Higgsfield, 3D worlds we created,
2D objects"). Methods, any of:
  picture-backdrop   AI pictures as far backdrops (Higgsfield)     picture-to-3d   image-to-3D hero props (Higgsfield)
  code-3d            places and props built in code                painted-texture AI tileable textures on code 3D
  drawn-2d           cards, details and effects drawn in code      bean-cards      the lit bean-head people
  clay-3d            clay figures in 3D                            ai-video        AI-generated video (Higgsfield)
A critique row can carry --areas world=3.5,camera=3.2,... (each area's average, 1-5) and --judge "opus 5.5".
`areas` prints each story's last critique by area, then each area's average across stories that use a method and
those that do not, so the weakest area and the method behind it show up after a few videos.

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
          'spike', 'review', 'other', 'profile', 'audience']
METHODS = ['picture-backdrop', 'picture-to-3d', 'code-3d', 'painted-texture', 'drawn-2d', 'bean-cards', 'clay-3d', 'ai-video']
AREAS = ['world', 'camera', 'people', 'light', 'story', 'sound']


def add(a):
    row = {'at': a.at or datetime.now(timezone.utc).isoformat(timespec='minutes'), 'story': a.story, 'stage': a.stage,
           'round': a.round, 'step': a.step, 'by': a.by, 'minutes': a.minutes, 'tokens': a.tokens}
    if a.score is not None:
        row['score'] = a.score
        row['scale'] = 5
    if getattr(a, 'areas', None):
        row['areas'] = {k: float(v) for k, v in (x.split('=') for x in a.areas.split(','))}
        bad = [k for k in row['areas'] if k not in AREAS]
        if bad: sys.exit(f'unknown area(s) {bad}; use {AREAS}')
    if getattr(a, 'judge', None):
        row['judge'] = a.judge
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


def profile(a):
    methods = [m for m in a.methods.split(',') if m]
    bad = [m for m in methods if m not in METHODS]
    if bad: sys.exit(f'unknown method(s) {bad}; use {METHODS}')
    row = {'at': a.at or datetime.now(timezone.utc).isoformat(timespec='minutes'), 'story': a.story, 'stage': 'profile',
           'step': 'what kind of video', 'channel': a.channel, 'look': a.look, 'methods': methods}
    if a.note: row['note'] = a.note
    with open(a.log, 'a') as f:
        f.write(json.dumps(row, ensure_ascii=False) + '\n')
    print(json.dumps(row, ensure_ascii=False))


def audience(a):
    row = {'at': a.at or datetime.now(timezone.utc).isoformat(timespec='minutes'), 'story': a.story, 'stage': 'audience',
           'step': f'audience after {a.days} days', 'days': a.days, 'viewed': a.viewed, 'avgViewed': a.avg_viewed}
    if a.views is not None: row['views'] = a.views
    if a.dips: row['dips'] = [float(x) for x in a.dips.split(',') if x]
    if a.url: row['url'] = a.url
    with open(a.log, 'a') as f:
        f.write(json.dumps(row, ensure_ascii=False) + '\n')
    print(json.dumps(row, ensure_ascii=False))


def per_second(path):
    import re
    out = {}
    for line in open(path):
        m = re.match(r'\|\s*(\d+)-\d+\s*\|(.*)', line)
        if not m: continue
        cells = [c.strip() for c in line.strip().strip('|').split('|')][1:7]
        try: v = [float(x) for x in cells]
        except ValueError: continue
        out[int(m.group(1))] = sum(v) / len(v)
    return out


def areas(a):
    rows = sorted((json.loads(l) for l in open(a.log) if l.strip()), key=lambda r: r['at'])
    prof = {r['story']: r for r in rows if r['stage'] == 'profile'}
    last = {}
    for r in rows:
        if r['stage'] == 'critique' and r.get('areas'):
            last[r['story']] = r
    if not last:
        print('no critique with --areas yet'); return
    print(f'{"story":22s} ' + ' '.join(f'{x:>6s}' for x in AREAS) + '  overall  judge')
    for st, r in last.items():
        ar = r['areas']
        print(f'{st:22s} ' + ' '.join(f'{ar.get(x, float("nan")):6.2f}' for x in AREAS) + f'  {r.get("score", float("nan")):7.2f}  {r.get("judge", "")}')
    mean = lambda xs: sum(xs) / len(xs) if xs else float('nan')
    print('\nweakest area per story: ' + ', '.join(f'{st} {min(r["areas"], key=r["areas"].get)}' for st, r in last.items()))
    aud = {}
    for r in rows:
        if r['stage'] == 'audience': aud[r['story']] = r
    if aud:
        print(f'\n{"story":22s} {"days":>4s} {"viewed":>7s} {"avg %":>6s} {"views":>7s}  critic overall  dips (critic score there)')
        table = per_second(a.scores) if getattr(a, 'scores', None) else {}
        for st, r in aud.items():
            dips = ', '.join(f'{d:g}s' + (f' ({table[int(d)]:.1f})' if int(d) in table else '') for d in r.get('dips', []))
            crit = last.get(st, {}).get('score', float('nan'))
            print(f'{st:22s} {r["days"]:4d} {r["viewed"]:7.2f} {r["avgViewed"]:6.2f} {r.get("views", 0):7d}  {crit:14.2f}  {dips}')
    print(f'\n{"method":18s} {"with":>5s} ' + ' '.join(f'{x:>6s}' for x in AREAS) + '   (average of stories with the method; then without)')
    for m in METHODS:
        w = [last[s]['areas'] for s in last if m in prof.get(s, {}).get('methods', [])]
        wo = [last[s]['areas'] for s in last if s in prof and m not in prof[s].get('methods', [])]
        if not w: continue
        print(f'{m:18s} {len(w):5d} ' + ' '.join(f'{mean([x[k] for x in w if k in x]):6.2f}' for k in AREAS))
        if wo: print(f'{"  without":18s} {len(wo):5d} ' + ' '.join(f'{mean([x[k] for x in wo if k in x]):6.2f}' for k in AREAS))


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest='cmd', required=True)
    pa = sub.add_parser('add')
    pa.add_argument('log'); pa.add_argument('--story', required=True)
    pa.add_argument('--stage', required=True, choices=STAGES); pa.add_argument('--step', required=True)
    pa.add_argument('--round', type=int); pa.add_argument('--by', default='coordinator')
    pa.add_argument('--minutes', type=float); pa.add_argument('--tokens', type=int)
    pa.add_argument('--at'); pa.add_argument('--note'); pa.add_argument('--score', type=float)
    pa.add_argument('--areas'); pa.add_argument('--judge')
    pr = sub.add_parser('report')
    pr.add_argument('log'); pr.add_argument('--story')
    pd = sub.add_parser('rounds')
    pd.add_argument('log'); pd.add_argument('--story')
    pp = sub.add_parser('profile')
    pp.add_argument('log'); pp.add_argument('--story', required=True); pp.add_argument('--channel', required=True)
    pp.add_argument('--look', required=True); pp.add_argument('--methods', required=True); pp.add_argument('--at'); pp.add_argument('--note')
    pr2 = sub.add_parser('areas')
    pr2.add_argument('log'); pr2.add_argument('--scores')
    pu = sub.add_parser('audience')
    pu.add_argument('log'); pu.add_argument('--story', required=True); pu.add_argument('--days', type=int, default=7)
    pu.add_argument('--viewed', type=float, required=True); pu.add_argument('--avg-viewed', type=float, required=True)
    pu.add_argument('--views', type=int); pu.add_argument('--dips'); pu.add_argument('--url'); pu.add_argument('--at')
    a = p.parse_args()
    {'add': add, 'report': report, 'rounds': rounds, 'profile': profile, 'areas': areas, 'audience': audience}[a.cmd](a)


if __name__ == '__main__':
    main()
