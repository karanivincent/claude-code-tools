#!/usr/bin/env python3
"""textround.py <clip.mp4> <round-dir> --limits <limits.md> [options]

The text round (a trial, S5-128; references/text-round.md): a built clip is written out as text, text reviewers read
the text and never the pictures, and a reviser turns their notes into the round's change list. The builder then builds
exactly that list, and the blind judge decides as in any round.

  1. describe   one `claude -p` on --describer (opus) reads labelled frame strips of the clip and writes the shot as
                text; --facts (numbers from the scene's own code) goes on top of it        -> text/beat.md
                (--text <beat.md> uses a description that already exists and skips this step)
  2. review     a cold reader, an acting critic and, with --reference, a reference reader, on --reviewers (sonnet)
                                                                                           -> text/notes-*.md
  3. revise     a reviser on --reviser (opus): at most five changes, exact numbers         -> text/changes-1.md
  4. check      with --passes 2 (the default): a checker reads the changed shot against the limits and the notes
                (text/check.md), and the reviser answers it                                -> text/changes.md

Steps 2 to 4 are "lean" calls: the text is pasted into the prompt, with no tools and a two-line system prompt
(`claude -p --tools "" --strict-mcp-config --system-prompt ...`). A reviewer started as an agent from a desktop session
carried about 110K tokens of tools on every call (1.16M for three); lean, three cost about 0.12M and found the same
faults (Epiclings, the dancing plague, 23 November 2026).

Options:
  --limits f      REQUIRED. The frame's hard limits, as the reviser's rules: where the captions and the app's buttons
                  sit, what must stay in frame, what cannot change (references/text-round.md has a form). A text round
                  with no limits went to a legs-only close-up and lost.
  --meaning f     what the scene must say (the loop folder's meaning.md)
  --protect f     the beats that must not get worse (protect.md)
  --facts f       facts from the scene's code for this clip: the camera's distance, lens and height at its keys, the
                  frames of each hit, the kit's names for faces and actions. Exact where the description is a guess.
  --words f       the scene's words on its own clock (words.json), for the cold reader and the timing
  --before "..."  one sentence: what the viewer saw just before this window (for the cold reader)
  --reference f   a written breakdown of the reference video (a shot list); adds the reference reader
  --can f         what the scene's code can and cannot do, for the reviser (default: a general paragraph)
  --window a-b    seconds of the clip to work on (default: the whole clip). Keep it to one shot or one beat.
  --film "..."    one line on what kind of film this is (default: a short vertical cartoon watched on a phone)
  --passes 1|2    2 (default) adds the check and the second revise
  --describer m, --reviewers m, --reviser m     models (opus, sonnet, opus)
  --text f        an existing description of this clip; skips the describer
  --dry-run       make the frames and the prompts, print each command, and stop

Writes <round-dir>/text/: frames/, beat.md, notes-cold.md, notes-critic.md, notes-reference.md, changes-1.md, check.md,
changes.md, usage.jsonl (one line per call, as look.sh writes them). It takes about 12 minutes: run it from the main
session as a background command and wait for it (a foreground command times out at 10). Needs python3, ffmpeg and the
claude CLI.
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
TPL = os.path.join(HERE, "text")
LEAN_SYSTEM = "You are a careful, exact reviewer of animation. Answer in plain text and Markdown tables. Do not ask questions."
DEFAULT_CAN = ("The camera can be anywhere, with any lens, on any timing. Each person's feet, arms, body drop, lean and "
               "tilt, head tilt and eye direction can be set frame by frame. Faces come from the kit's fixed set of named "
               "faces. Marks drawn over the picture can be any size, colour and timing. No new prop, no new place and no "
               "new kind of drawing of a person.")


def die(msg):
    print(f"textround.py: {msg}", file=sys.stderr)
    sys.exit(1)


def read(p):
    return open(p, encoding="utf-8").read().strip() if p else ""


def fill(name, **kv):
    """a brief from text/<name>.md: the part after the first line that is exactly ---, with {KEY} fields filled"""
    text = open(os.path.join(TPL, name + ".md"), encoding="utf-8").read()
    parts = text.split("\n---\n", 1)
    text = parts[1].lstrip("\n") if len(parts) == 2 else text
    for k, v in kv.items():
        text = text.replace("{" + k + "}", v)
    left = re.findall(r"\{[A-Z_]+\}", text)
    if left:
        die(f"brief {name}.md has unfilled fields {sorted(set(left))}")
    return text


def probe(clip, entry):
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", entry, "-of",
                          "default=nw=1:nk=1", clip], capture_output=True, text=True).stdout.strip().split("\n")[0]
    return out


def make_frames(clip, out, a, b, fps, vertical):
    """labelled strips with a grid: a frame every `step` source frames from a to b, six a strip; and full frames"""
    os.makedirs(out, exist_ok=True)
    for f in os.listdir(out):
        os.remove(os.path.join(out, f))
    span = b - a
    step = 2 if span <= 4 else 3 if span <= 7 else 4
    per, tilew = (6, 360) if vertical else (4, 480)
    grid = "drawgrid=w=iw/3:h=ih/5:t=1:c=white@0.55" if vertical else "drawgrid=w=iw/5:h=ih/3:t=1:c=white@0.55"
    dt = step / fps
    n = int(span / dt + 1e-6) + 1
    k = 0
    while k * per < n:
        s = a + k * per * dt
        left = min(per, n - k * per)
        txt = ("%{eif\\:t+" + f"{s:.4f}" + "\\:d}.%{eif\\:mod((t+" + f"{s:.4f}" + ")*100,100)\\:d\\:2}s f%{eif\\:(t+"
               + f"{s:.4f}" + ")*" + f"{fps:.4f}" + "+0.5\\:d}")
        vf = (f"setpts=PTS-STARTPTS,fps={fps / step:.4f},scale={tilew}:-2,{grid},drawtext=text='{txt}':x=6:y=6:"
              f"fontsize=20:fontcolor=yellow:box=1:boxcolor=black@0.6,tile={per}x1:padding=4:nb_frames={left}")
        subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", f"{s:.4f}", "-i", clip, "-vf", vf, "-frames:v",
                        "1", "-q:v", "3", os.path.join(out, f"strip-{k + 1:02d}-{s:05.2f}s.jpg")], check=True)
        k += 1
    full = 0
    t = a
    scale = "540:-2" if vertical else "960:-2"
    while t < b - 0.02 and full < 8:
        subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", f"{t:.2f}", "-i", clip, "-frames:v", "1", "-vf",
                        f"scale={scale}", "-q:v", "2", os.path.join(out, f"full-{t:05.2f}s.jpg")], check=True)
        full += 1
        t += max(0.4, span / 7)
    return k, full, step


def call(by, model, prompt, out_md, usage, cwd, tools=None, dry=False):
    """one `claude -p`; lean (no tools, the prompt on stdin) unless `tools` names some (the describer reads images)"""
    raw = out_md[:-3] + ".json"
    ppath = out_md[:-3] + ".prompt.md"
    open(ppath, "w", encoding="utf-8").write(prompt)
    if tools:
        cmd = ["claude", "-p", "Follow the brief in brief.md exactly. Read it first. Read only files inside this folder. "
               "Reply with text only.", "--model", model, "--allowedTools", tools, "--output-format", "json"]
        open(os.path.join(cwd, "brief.md"), "w", encoding="utf-8").write(prompt)
    else:
        cmd = ["claude", "-p", "--model", model, "--tools", "", "--strict-mcp-config", "--system-prompt", LEAN_SYSTEM,
               "--output-format", "json"]
    if dry:
        print(f"dry-run: {by} ({model}): (cd {cwd} && {' '.join(repr(c) if ' ' in c or not c else c for c in cmd)}"
              f"{'' if tools else ' < ' + ppath}) > {raw}")
        return ""
    t0 = time.time()
    with open(raw, "w") as o, open(out_md[:-3] + ".err", "w") as e:
        if tools:
            subprocess.run(cmd, stdin=subprocess.DEVNULL, stdout=o, stderr=e, cwd=cwd, timeout=900)
        else:
            with open(ppath) as f:
                subprocess.run(cmd, stdin=f, stdout=o, stderr=e, cwd=cwd, timeout=900)
    subprocess.run([sys.executable, os.path.join(HERE, "_usage.py"), raw, out_md, usage, by, model,
                    str(int(time.time() - t0))])
    text = read(out_md)
    if not text:
        die(f"{by} gave no reply (see {out_md[:-3]}.err and {raw})")
    return text


def cold_copy(beat):
    """the description without what the shot is meant to be: parts 1 and 8 onward go"""
    parts = re.split(r"(?m)^(?=## )", beat)
    keep = []
    for p in parts:
        m = re.match(r"## (\d+)\.", p)
        if m and (int(m.group(1)) == 1 or int(m.group(1)) >= 8):
            continue
        keep.append(p)
    return "".join(keep).strip()


def words_in(path, a, b):
    if not path:
        return "(no word times were given)"
    ws = json.load(open(path))
    got = [f'"{w["w"]}" {w["s"]:.2f}-{w["e"]:.2f} s' for w in ws if w["e"] > a and w["s"] < b]
    return ", ".join(got) if got else "(no words in this window)"


def main():
    ap = argparse.ArgumentParser(usage="textround.py <clip.mp4> <round-dir> --limits <limits.md> [options]")
    ap.add_argument("clip"), ap.add_argument("round")
    for k in ("limits", "meaning", "protect", "facts", "words", "reference", "can", "window", "text", "before"):
        ap.add_argument("--" + k)
    ap.add_argument("--film", default="a short vertical cartoon watched on a phone: flat 2D cartoon people in a rendered "
                    "3D place, with a narrator")
    ap.add_argument("--passes", type=int, default=2, choices=(1, 2))
    ap.add_argument("--describer", default="opus"), ap.add_argument("--reviewers", default="sonnet")
    ap.add_argument("--reviser", default="opus"), ap.add_argument("--dry-run", action="store_true")
    o = ap.parse_args()
    for f in (o.clip, o.limits, o.meaning, o.protect, o.facts, o.words, o.reference, o.can, o.text):
        if f and not os.path.isfile(f):
            die(f"missing file {f}")
    if not o.limits:
        die("--limits is required: the frame's hard limits (captions, what stays in frame, what cannot change)")
    if not o.dry_run and subprocess.run(["which", "claude"], capture_output=True).returncode:
        die("the claude CLI is not on PATH")

    T = os.path.join(os.path.abspath(o.round), "text")
    os.makedirs(T, exist_ok=True)
    usage = os.path.join(T, "usage.jsonl")
    if not o.dry_run and os.path.exists(usage):
        os.remove(usage)
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of",
                                "default=nw=1:nk=1", o.clip], capture_output=True, text=True).stdout.strip())
    w, h = int(probe(o.clip, "stream=width")), int(probe(o.clip, "stream=height"))
    num, _, den = probe(o.clip, "stream=r_frame_rate").partition("/")
    fps = float(num) / float(den or 1)
    a, b = (float(x) for x in o.window.split("-")) if o.window else (0.0, dur)
    b = min(b, dur - 0.5 / fps)
    if b <= a:
        die(f"--window {o.window}: nothing between {a} and {b} s")
    vertical = h >= w
    window = f"{a:.2f} to {b:.2f} s (frames {round(a * fps)} to {round(b * fps)}, at {fps:g} frames a second)"
    grid = ("3 columns (A, B, C from the left) by 5 rows (1 to 5 from the top), so the top left cell is A1" if vertical
            else "5 columns (A to E from the left) by 3 rows (1 to 3 from the top), so the top left cell is A1")
    meaning = read(o.meaning) or "(no meaning sheet was given)"
    protect = read(o.protect) or "(none named)"
    limits, facts = read(o.limits), read(o.facts)
    words = words_in(o.words, a, b)
    common = dict(FILM=o.film, WINDOW=window, MEANING=meaning, PROTECT=protect, LIMITS=limits, WORDS=words)

    # 1. the description
    beat_p = os.path.join(T, "beat.md")
    if o.text:
        beat = read(o.text)
    else:
        D = os.path.join(T, "frames")
        strips, full, step = make_frames(o.clip, D, a, b, fps, vertical)
        print(f"frames: {strips} strip(s), a frame every {step} source frames, and {full} full frames -> {D}")
        desc = call("describer", o.describer, fill("describer", GRID=grid, **common),
                    os.path.join(T, "description.md"), usage, D, tools="Read,Glob", dry=o.dry_run)
        head = "## Facts from the code\n\n" + facts + "\n\n" if facts else ""
        beat = (f"# The shot as it is now ({window})\n\nWhere the description below disagrees with the facts from the "
                f"code, the facts are right.\n\n{head}## The description, from the frames\n\n{desc}")
    if not o.dry_run:
        open(beat_p, "w", encoding="utf-8").write(beat + "\n")

    # 2. the reviewers, all at once
    before = f"- Just before this: {o.before}\n" if o.before else ""
    jobs = [("cold", fill("cold", TEXT=cold_copy(beat), BEFORE=before, **common)),
            ("critic", fill("critic", TEXT=beat, **common))]
    if o.reference:
        jobs.append(("reference", fill("reference", TEXT=beat, REFERENCE=read(o.reference), **common)))
    with ThreadPoolExecutor(len(jobs)) as ex:
        notes = list(ex.map(lambda j: call(f"text-{j[0]}", o.reviewers, j[1], os.path.join(T, f"notes-{j[0]}.md"), usage,
                                           T, dry=o.dry_run), jobs))
    allnotes = "\n\n".join(f"===== NOTES: the {name} reader =====\n{n}" for (name, _), n in zip(jobs, notes))

    # 3. the reviser
    can = read(o.can) or DEFAULT_CAN
    first = os.path.join(T, "changes-1.md" if o.passes == 2 else "changes.md")
    changes = call("reviser", o.reviser, fill("reviser", TEXT=beat, NOTES=allnotes, CAN=can, CHECK="", **common), first,
                   usage, T, dry=o.dry_run)

    # 4. the check and the second revise
    if o.passes == 2:
        check = call("text-checker", o.reviewers, fill("checker", TEXT=beat, NOTES=allnotes, CHANGES=changes, **common),
                     os.path.join(T, "check.md"), usage, T, dry=o.dry_run)
        again = ("\n\nA checker read your first list against the limits and the notes. Its report is below. Fix what it "
                 "found, keep what it passed, and give the whole list again in the same form.\n\n===== YOUR FIRST LIST "
                 f"=====\n{changes}\n\n===== THE CHECKER'S REPORT =====\n{check}")
        call("reviser-2", o.reviser, fill("reviser", TEXT=beat, NOTES=allnotes, CAN=can, CHECK=again, **common),
             os.path.join(T, "changes.md"), usage, T, dry=o.dry_run)
    if o.dry_run:
        return
    rows = [json.loads(l) for l in open(usage)]
    tok = sum(r["tokens"] or 0 for r in rows)
    secs = sum(r["seconds"] or 0 for r in rows)
    print(f"text round: {len(rows)} calls, {tok / 1000:.0f}K tokens, {secs:.0f} s -> {os.path.join(T, 'changes.md')}")
    print(f'next: node step.mjs <loop> log build "text round: {len(rows)} calls, {tok / 1000:.0f}K tokens"; the builder '
          f"builds exactly text/changes.md (copy it to the round's changes.md) and proves its check numbers")


if __name__ == "__main__":
    main()
