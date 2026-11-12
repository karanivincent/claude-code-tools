#!/usr/bin/env python3
"""Critic prep: everything the render critic reads, made before it starts (rule S5-39), so the critic spends its turn
judging, not cutting frames and measuring sound.

Usage: python3 critic_prep.py render.mp4 out/<slug>/critic-prep-<cycle> --stems public/<slug>/<dir of the mix>
           [--cues public/<slug>/sound/cues.json] [--fx <effects-alone stem>.wav]
Needs ffmpeg and numpy (the shared venv: ~/.cache/toon-tools/venv/bin/python). Writes into the output folder:
  frames/f<NN>-<s>.jpg   one full-size frame every 2.4 s
  sheets/s<NN>.jpg       contact sheets at 2 frames a second, 8 by 2 (8 s a sheet), each frame stamped with its time
  motion.txt, .json      motion_probe.py on the whole render: spikes flagged, hard cuts, fast runs, still stretches
  cuts.txt               the hard cuts alone, one time a line
  sound.txt, .json       per cue in cues.json: the effect's loudest 100 ms in the second after its cue, against the
                         voice stem in the same 100 ms and the voice's loudest 100 ms within 0.25 s either side, and
                         the mix there (dB RMS)
  README.txt             what each file is, for the critic's brief
The effect is read from --fx when given (the sound script's effects-alone stem: the toon sound scripts write fx.wav
and music.wav when SOUND_STEMS=<folder> is set). Without it the bed stem (music and effects together) stands in, and
the table says so: a loud bed under a cue is then not proof the effect is heard.
A cue is flagged UNDER when its loudest 100 ms sits more than 12 dB below the voice in the same 100 ms (the voice covers
it on a phone), NEAR when it is clear at its moment but more than 12 dB below the voice's loudest 100 ms within 0.25 s
(it may be masked), FAINT when it is under -45 dBFS. These are pointers for the critic's ear, not a gate.
"""
import argparse, json, os, subprocess, sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from motion_probe import probe, text as motion_text  # noqa: E402

SR = 24000


def pcm(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def db(x):
    return float(20 * np.log10(np.sqrt((x.astype(np.float64) ** 2).mean()) + 1e-9)) if len(x) else -180.0


def loudest(x, a, b, w=int(0.1 * SR)):
    """the start (in samples) and level of the loudest 100 ms of x between samples a and b"""
    a, b = max(0, a), min(len(x), b)
    if b - a < w:
        return a, db(x[a:b])
    e = np.convolve(x[a:b].astype(np.float64) ** 2, np.ones(w), 'valid')
    k = int(e.argmax())
    return a + k, float(10 * np.log10(e[k] / w + 1e-18))


def duration(path):
    return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path], capture_output=True, text=True, check=True).stdout)


def pictures(video, out):
    fr, sh = os.path.join(out, 'frames'), os.path.join(out, 'sheets')
    os.makedirs(fr, exist_ok=True); os.makedirs(sh, exist_ok=True)
    dur = duration(video)
    times = [round(k * 2.4, 2) for k in range(int(dur / 2.4) + 1) if k * 2.4 < dur]
    for n, t in enumerate(times, 1):
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(t), '-i', video, '-frames:v', '1', '-q:v', '3',
                        os.path.join(fr, f'f{n:02d}-{t:06.2f}s.jpg')], check=True)
    stamp = "drawtext=text='%{pts\\:hms}':x=4:y=2:fontsize=18:fontcolor=yellow:box=1:boxcolor=black@0.6"
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', video, '-vf', f'fps=2,scale=270:480,{stamp},tile=8x2', '-q:v', '3',
                    os.path.join(sh, 's%02d.jpg')], check=True)
    return times, len(os.listdir(sh))


def sound(stems, cues_file, fx_file, out):
    voice, bed, mix = (pcm(os.path.join(stems, f'{n}.wav')) for n in ('voice', 'bed', 'mix'))
    fx = pcm(fx_file) if fx_file else None
    src = 'the effects stem' if fx is not None else 'the bed stem (music and effects together: no effects stem given)'
    eff = fx if fx is not None else bed
    cues = json.load(open(cues_file)) if cues_file and os.path.exists(cues_file) else []
    rows = []
    for c in sorted(cues, key=lambda c: c['t']):
        t = float(c['t']); a = int(t * SR)
        p, e = loudest(eff, a - int(0.05 * SR), a + SR)
        w = slice(p, p + int(0.1 * SR))
        v_same = db(voice[w])
        _, v_near = loudest(voice, p - int(0.25 * SR), p + int(0.35 * SR))
        flags = [f for f, on in (('UNDER', e < v_same - 12), ('NEAR', e >= v_same - 12 and e < v_near - 12), ('FAINT', e < -45)) if on]
        rows.append({'cue': c.get('name', ''), 't': round(t, 3), 'loudest': round(p / SR, 3), 'effect': round(e, 1), 'voiceSame': round(v_same, 1),
                     'voiceNear': round(v_near, 1), 'overSame': round(e - v_same, 1), 'overNear': round(e - v_near, 1), 'mix': round(db(mix[w]), 1),
                     'flags': flags})
    L = [f'per-cue audibility from {src}: dB RMS of 100 ms. effect = the loudest 100 ms in the second after the cue (from',
         '0.05 s before it); voice = the voice stem in that same 100 ms, and its loudest 100 ms within 0.25 s either side;',
         'over = effect minus voice. UNDER: more than 12 dB under the voice at the same moment; NEAR: clear of the voice at',
         'its moment but more than 12 dB under its loudest within 0.25 s (it may be masked); FAINT: under -45 dBFS.',
         f"{'cue':18s} {'t':>7s} {'loudest':>8s} {'effect':>7s} {'voice=':>7s} {'voice~':>7s} {'over=':>6s} {'over~':>6s} {'mix':>6s}  flags"]
    for r in rows:
        L.append(f"{r['cue'][:18]:18s} {r['t']:7.2f} {r['loudest']:8.2f} {r['effect']:7.1f} {r['voiceSame']:7.1f} {r['voiceNear']:7.1f} "
                 f"{r['overSame']:6.1f} {r['overNear']:6.1f} {r['mix']:6.1f}  {' '.join(r['flags'])}")
    if not cues:
        L.append('(no cues.json: no cues to check)')
    return rows, '\n'.join(L), src


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('render'); ap.add_argument('out')
    ap.add_argument('--stems', required=True, help='the folder holding voice.wav, bed.wav and mix.wav (beside STORY.audio)')
    ap.add_argument('--cues', help='cues.json (default: <stems>/../sound/cues.json when it exists)')
    ap.add_argument('--fx', help='the effects-alone stem, when the sound script wrote one')
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    cues = a.cues or os.path.join(os.path.dirname(os.path.abspath(a.stems)), 'sound', 'cues.json')
    times, nsheets = pictures(a.render, a.out)
    m = probe(a.render)
    json.dump(m, open(os.path.join(a.out, 'motion.json'), 'w'), indent=1)
    open(os.path.join(a.out, 'motion.txt'), 'w').write(motion_text(m) + '\n')
    open(os.path.join(a.out, 'cuts.txt'), 'w').write(''.join(f"{c['t']:.2f}\n" for c in m['cuts']))
    rows, table, src = sound(a.stems, cues, a.fx, a.out)
    json.dump(rows, open(os.path.join(a.out, 'sound.json'), 'w'), indent=1)
    open(os.path.join(a.out, 'sound.txt'), 'w').write(table + '\n')
    readme = (f'critic prep for {a.render}\n'
              f'frames/   {len(times)} full-size frames, one every 2.4 s (the name carries the time)\n'
              f'sheets/   {nsheets} contact sheets, 2 frames a second, 8 s a sheet, each frame stamped with its time\n'
              f"motion.txt  frame-to-frame difference: {len(m['spikes'])} spike(s) flagged, {len(m['cuts'])} hard cut(s), "
              f"{len(m['fast'])} fast run(s), {len(m['still'])} still stretch(es) (motion.json: every frame)\n"
              f"cuts.txt  the hard cuts, one time a line\n"
              f"sound.txt  each cue's effect against the voice, from {src}; "
              f"{sum(1 for r in rows if r['flags'])} of {len(rows)} flagged\n")
    open(os.path.join(a.out, 'README.txt'), 'w').write(readme)
    print(readme, end='')


if __name__ == '__main__':
    main()
