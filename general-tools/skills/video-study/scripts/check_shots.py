#!/usr/bin/env python3
"""Check an observe/shots.json against the form in references/observe-brief.md.

    python3 check_shots.py <shots.json> <duration-seconds>

Prints `ok`, or one line per problem and exits 1. Checks the fields and their allowed values, that the shots touch end
to start and cover the whole video, and that no opinion words crept in.
"""
import json, re, sys

LENS = {'extreme wide', 'wide', 'medium', 'close', 'extreme close'}
HEIGHT = {'ground', 'low', 'eye', 'high', 'overhead'}
LOOKS = {'up', 'level', 'down', 'straight down'}
MOVES = {'still', 'push', 'pull', 'pan', 'tilt', 'orbit', 'track', 'crane up', 'crane down', 'follow', 'zoom', 'shake', 'roll'}
SPEED = {'still', 'slow', 'medium', 'fast'}
TOD = {'day', 'dawn', 'dusk', 'night', 'none'}
POSE = {'standing', 'walking', 'running', 'sitting', 'lying', 'crouching', 'carrying', 'climbing', 'falling'}
FACING = {'camera', 'three-quarter', 'side', 'away'}
EXPR = {'neutral', 'smile', 'laugh', 'angry', 'afraid', 'surprised', 'sad', 'disgusted', 'thinking', 'smug', 'tired', 'pain', None}
KEY = {'left', 'right', 'front', 'back', 'top', 'none'}
JOINS = {'hard cut', 'moving dissolve', 'shape-matched dissolve', 'horizon approach', 'map zoom',
         'crane to an aerial and dive', 'into a screen, lens, eye, mirror, icon or page',
         'through a door, window, porthole or gap', 'follow what travels', 'smoke, flash, light wash or iris',
         'shrinks into an object or freezes into a photo', 'near object crosses the lens', 'whip pan',
         'world-made wipe', 'split screen', 'loop to frame 0', 'none'}
OPINION = re.compile(r'\b(good|great|clever|works|working|effective|nice|beautiful|should|we|our|well done|smart|brilliant|weak|bad)\b', re.I)


def ok_value(v, allowed):
    return v in allowed or (isinstance(v, str) and v.startswith('other: '))


def main():
    path, dur = sys.argv[1], float(sys.argv[2])
    d = json.load(open(path))
    errs = []
    shots = d.get('shots') or []
    if not shots:
        errs.append('no shots')
    prev_end = 0.0
    for s in shots:
        n = s.get('n', '?')
        at = f'shot {n}'
        for k in ('start', 'end', 'place', 'inside', 'time_of_day', 'camera', 'join_out', 'people', 'objects',
                  'words_on_screen', 'light', 'effects', 'sound', 'spoken', 'change', 'frames'):
            if k not in s:
                errs.append(f'{at}: missing {k}')
        if abs(s.get('start', -1) - prev_end) > 0.11:
            errs.append(f'{at}: starts at {s.get("start")}, the shot before ends at {prev_end}')
        if s.get('end', 0) <= s.get('start', 0):
            errs.append(f'{at}: ends before it starts')
        prev_end = s.get('end', prev_end)
        if not ok_value(s.get('time_of_day'), TOD):
            errs.append(f'{at}: time_of_day {s.get("time_of_day")!r}')
        c = s.get('camera') or {}
        for k, allowed in (('lens', LENS), ('height', HEIGHT), ('looks', LOOKS), ('speed', SPEED)):
            if not ok_value(c.get(k), allowed):
                errs.append(f'{at}: camera.{k} {c.get(k)!r}')
        for m in c.get('moves') or []:
            if not ok_value(m, MOVES):
                errs.append(f'{at}: camera move {m!r}')
        j = s.get('join_out') or {}
        if not ok_value(j.get('kind'), JOINS):
            errs.append(f'{at}: join_out.kind {j.get("kind")!r}')
        for p in s.get('people') or []:
            if not ok_value(p.get('pose'), POSE):
                errs.append(f'{at}: pose {p.get("pose")!r}')
            if not ok_value(p.get('facing'), FACING):
                errs.append(f'{at}: facing {p.get("facing")!r}')
            if not ok_value(p.get('expression'), EXPR):
                errs.append(f'{at}: expression {p.get("expression")!r}')
        if not ok_value((s.get('light') or {}).get('key'), KEY):
            errs.append(f'{at}: light.key {(s.get("light") or {}).get("key")!r}')
        for k in ('place', 'change'):
            v = s.get(k)
            if isinstance(v, str) and OPINION.search(v):
                errs.append(f'{at}: {k} has an opinion word: {v!r}')
        for p in s.get('people') or []:
            if isinstance(p.get('action'), str) and OPINION.search(p['action']):
                errs.append(f'{at}: action has an opinion word: {p["action"]!r}')
    if shots and abs(prev_end - dur) > 0.25:
        errs.append(f'the shots end at {prev_end}, the video at {dur}')
    print('\n'.join(errs) if errs else 'ok')
    sys.exit(1 if errs else 0)


if __name__ == '__main__':
    main()
