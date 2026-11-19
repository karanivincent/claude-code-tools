#!/usr/bin/env python3
"""What moves in a finished film besides the camera, second by second, and a gate on the quiet seconds.

Usage: <python with numpy and opencv> -I <toon-video>/scripts/motion-check.py <clip.mp4> [--json [out.json]] [--gate]
                                                                                  [--sheet <heat.jpg>]
  (no flag)        the report on stdout, exit 0
  --json out.json  also writes the numbers (totals and one row per second) to out.json
  --json           the numbers as JSON on stdout (the report and any gate lines go to stderr)
  --gate           exit 0 on a pass and 1 on a fail; one line per failed measure on stdout, the report on stderr.
                   It fails when
                     - the clip has more quiet seconds than its limit: 4 per 60 s of length, rounded half up, and never
                       under 1: limit = max(1, floor(4 * seconds / 60 + 0.5)) (a 59 s or 62.5 s film: 4; a 30 s cut:
                       2; a 6 s scene: 1), or
                     - two quiet seconds come in a row (the longest quiet run is 2 or more), or
                     - the clip's first second is quiet (S1-37: motion from frame 1; S5-127).
  --sheet out.jpg  also draws the heat sheet: one tile per 2 s, the middle frame in grey with everything that moved
                   besides the camera tinted red. No sheet is drawn without it.
Exit 2 when numpy or opencv is missing, or the clip cannot be read.

It is a whole-film check, run once the scenes are joined (and on any cut before it goes out). It is not part of the scene
loop's per-round gate: it needs a render and opencv, and a 5 to 10 s scene is too short to judge on.

The measure (the same as the gap study's measure.py of 19 November 2026, number for number): every 2nd frame (15 a
second at 30 fps), small (216 x 384) and grey. For each pair of frames, the camera is the one flat move (shift, zoom,
roll) that fits most of the textured picture, found from the optical flow; its speed is how far the picture's corners
and centre travel, in % of the width per second. That move is taken out, and what still changed (14 levels of 255 or
more, specks under 0.3% of the frame removed) is what moved besides the camera. A pair where nearly everything changes
at once is a hard cut and is left out. Per second: the mean of its pairs.
  - a quiet second: under 1% of the picture moves besides the camera;
  - a dead second: quiet, and the camera under 2;  a busy second: 4% or more moves besides the camera;
  - a slow-camera second: the camera under 6;  the camera in a typical second: the median of the seconds' speeds.
The caption band (64% to 79% of the height, 12% to 88% of the width) is left out of every measure, so words popping on
and off do not count as motion.

What it cannot tell apart: it sees pixels, not people. Depth sliding past a moving camera (near grass against far
hills: no one flat move fits both) counts as motion, and so do flame flicker, water, smoke and any detail-layer loop. A
second can be "busy" with a fire while every person holds still. A quiet second is a sure fault; a busy one is not proof
of acting. The acting audit (the story's tools/acting-audit.mjs) checks the people themselves.

The reference numbers (19 November 2026):
  - the reference Short (Ricks Clips, 59 s): 4 quiet seconds, never two in a row, the camera at 15% of the width in a
    typical second, 15 slow-camera seconds;
  - our Hannibal film before its acting round (62.5 s): 15 quiet seconds, a run of 3, the camera at 6, 31 slow-camera
    seconds; after the round: 4 quiet seconds (at 26, 47, 56 and 60 s), runs of 1, 23 slow-camera seconds.
"""
import argparse
import json
import sys


def need_libs():
    try:
        import numpy as np  # noqa: F401
        import cv2  # noqa: F401
        return np, cv2
    except ImportError as e:
        print(f"motion-check: needs numpy and opencv ({e}). Make a python that has them: "
              f"python3 -m venv <dir> && <dir>/bin/pip install numpy opencv-python-headless ; "
              f"then run <dir>/bin/python -I motion-check.py ...", file=sys.stderr)
        sys.exit(2)


W, H = 216, 384            # analysis size
STEP = 2                   # every 2nd frame of 30 fps = 15 fps
FPS = 15.0
CAP_Y0, CAP_Y1 = int(H * 0.64), int(H * 0.79)   # the caption band, left out of every measure
CAP_X0, CAP_X1 = int(W * 0.12), int(W * 0.88)
DIFF = 14                  # a pixel "changed" when it moved this many levels of 255
BLOB = int(W * H * 0.003)  # a moving thing is at least 0.3% of the frame
QUIET, DEAD_CAM, BUSY, SLOW_CAM = 1.0, 2.0, 4.0, 6.0
QUIET_PER_60 = 4           # the gate: quiet seconds allowed per 60 s of length


def runs(flag):
    best = cur = 0
    for v in flag:
        cur = cur + 1 if v else 0
        best = max(best, cur)
    return best


def measure(video, sheet=None):
    np, cv2 = need_libs()
    cap = cv2.VideoCapture(video)
    frames, small = [], []
    i = 0
    while True:
        ok, f = cap.read()
        if not ok:
            break
        if i % STEP == 0:
            s = cv2.resize(f, (W, H), interpolation=cv2.INTER_AREA)
            small.append(s)
            frames.append(cv2.GaussianBlur(cv2.cvtColor(s, cv2.COLOR_BGR2GRAY), (3, 3), 0))
        i += 1
    cap.release()
    n = len(frames)
    if n < 2:
        print(f"motion-check: cannot read {video} (fewer than two frames)", file=sys.stderr)
        sys.exit(2)

    valid = np.ones((H, W), bool)
    valid[CAP_Y0:CAP_Y1, CAP_X0:CAP_X1] = False
    ys, xs = np.mgrid[8:H:8, 8:W:8]
    grid = np.stack([xs.ravel(), ys.ravel()], 1).astype(np.float32)
    grid = grid[valid[grid[:, 1].astype(int), grid[:, 0].astype(int)]]
    kernel = np.ones((3, 3), np.uint8)

    rows, masks = [], []    # one per frame pair; the "moved besides the camera" mask per pair
    for k in range(1, n):
        a, b = frames[k - 1], frames[k]
        raw = cv2.absdiff(a, b)
        raw_share = float((raw[valid] > DIFF).mean())
        mean_diff = float(raw[valid].mean())
        if mean_diff > 38:  # a hard cut: nearly everything changes at once
            rows.append(dict(cut=True)); masks.append(np.zeros((H, W), bool)); continue
        flow = cv2.calcOpticalFlowFarneback(a, b, None, 0.5, 4, 21, 3, 5, 1.1, 0)
        # the camera: the one flat move (shift, zoom, roll) that fits most of the picture
        src = grid
        dst = grid + flow[grid[:, 1].astype(int), grid[:, 0].astype(int)]
        # points with texture only: flat colour gives no flow to trust
        gx = cv2.Sobel(a, cv2.CV_32F, 1, 0); gy = cv2.Sobel(a, cv2.CV_32F, 0, 1)
        tex = (np.abs(gx) + np.abs(gy))[grid[:, 1].astype(int), grid[:, 0].astype(int)] > 12
        M = None
        if tex.sum() >= 12:
            M, _ = cv2.estimateAffinePartial2D(src[tex], dst[tex], method=cv2.RANSAC, ransacReprojThreshold=1.0)
        if M is None:
            M = np.array([[1, 0, 0], [0, 1, 0]], np.float32)
        # camera speed: how far the picture's corners and centre travel, % of the width per second
        pts = np.array([[0, 0], [W, 0], [0, H], [W, H], [W / 2, H / 2]], np.float32)
        moved = pts @ M[:, :2].T + M[:, 2]
        cam = float(np.linalg.norm(moved - pts, axis=1).mean()) / W * 100 * FPS
        # what is left once the camera's move is taken out
        warped = cv2.warpAffine(a, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        res = cv2.absdiff(warped, b) > DIFF
        res &= valid
        res = cv2.morphologyEx(res.astype(np.uint8), cv2.MORPH_OPEN, kernel).astype(bool)
        cnt, _, stats, _ = cv2.connectedComponentsWithStats(cv2.dilate(res.astype(np.uint8), kernel, iterations=2))
        blobs = int((stats[1:, cv2.CC_STAT_AREA] >= BLOB).sum()) if cnt > 1 else 0
        rows.append(dict(cut=False, raw=raw_share, cam=cam, own=float(res[valid].mean()), things=blobs))
        masks.append(res)

    secs = []
    for s in range(int(np.ceil((n - 1) / FPS))):
        part = [r for r in rows[int(s * FPS): int((s + 1) * FPS)] if not r["cut"]]
        cuts = sum(1 for r in rows[int(s * FPS): int((s + 1) * FPS)] if r["cut"])
        if not part:
            continue
        secs.append(dict(t=s, cuts=cuts,
                         raw=round(float(np.mean([r["raw"] for r in part])) * 100, 2),
                         cam=round(float(np.mean([r["cam"] for r in part])), 2),
                         own=round(float(np.mean([r["own"] for r in part])) * 100, 2),
                         things=round(float(np.mean([r["things"] for r in part])), 2)))

    good = [r for r in rows if not r["cut"]]
    own = np.array([r["own"] for r in good]) * 100
    cam = np.array([r["cam"] for r in good])
    raw = np.array([r["raw"] for r in good]) * 100
    things = np.array([r["things"] for r in good])
    sec_own = np.array([s["own"] for s in secs]); sec_cam = np.array([s["cam"] for s in secs])
    quiet = sec_own < QUIET
    # where the longest quiet run starts (seconds as listed; a second that is all cut is not listed)
    run_from, cur, best = None, 0, 0
    for k, v in enumerate(quiet):
        cur = cur + 1 if v else 0
        if cur > best:
            best, run_from = cur, secs[k - cur + 1]["t"]
    tot = dict(
        seconds=round((n - 1) / FPS, 1), hard_cuts=sum(1 for r in rows if r["cut"]),
        raw_mean=round(float(raw.mean()), 2), raw_median=round(float(np.median(raw)), 2),
        cam_mean=round(float(cam.mean()), 2), cam_median=round(float(np.median(cam)), 2),
        cam_locked_share=round(float((cam < 1.0).mean()) * 100, 1),
        own_mean=round(float(own.mean()), 2), own_median=round(float(np.median(own)), 2),
        things_mean=round(float(things.mean()), 2),
        quiet_seconds=int(quiet.sum()),
        dead_seconds=int((quiet & (sec_cam < DEAD_CAM)).sum()),
        busy_seconds=int((sec_own >= BUSY).sum()),
        longest_quiet_run=runs(quiet),
        peaks=int(((sec_own[1:-1] > sec_own[:-2]) & (sec_own[1:-1] > sec_own[2:]) & (sec_own[1:-1] >= BUSY)).sum()),
        # added beside measure.py's totals
        quiet_at=[s["t"] for s, q in zip(secs, quiet) if q],
        longest_quiet_run_from=run_from,
        slow_camera_seconds=int((sec_cam < SLOW_CAM).sum()),
        cam_typical_second=round(float(np.median(sec_cam)), 2) if len(sec_cam) else 0.0,
    )
    if sheet:
        draw_sheet(np, cv2, sheet, small, masks, n)
    return tot, secs


def draw_sheet(np, cv2, path, small, masks, n):
    tw, th = 162, 288
    tiles = []
    per = int(FPS * 2)
    for s in range(0, n - 1, per):
        m = np.mean(masks[s: s + per], axis=0) if masks[s: s + per] else np.zeros((H, W))
        mid = small[min(s + per // 2, n - 1)].astype(np.float32)
        grey = cv2.cvtColor(cv2.cvtColor(mid.astype(np.uint8), cv2.COLOR_BGR2GRAY), cv2.COLOR_GRAY2BGR).astype(np.float32) * 0.55 + 30
        heat = np.clip(cv2.GaussianBlur(m.astype(np.float32), (0, 0), 2) * 5, 0, 1)[..., None]
        tile = grey * (1 - heat) + np.array([40, 40, 255], np.float32) * heat
        tile = cv2.resize(tile.astype(np.uint8), (tw, th))
        cv2.putText(tile, f"{s / FPS:.0f}s", (5, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA)
        tiles.append(tile)
    cols = 11
    while len(tiles) % cols:
        tiles.append(np.zeros((th, tw, 3), np.uint8))
    sheet = np.vstack([np.hstack(tiles[r: r + cols]) for r in range(0, len(tiles), cols)])
    cv2.imwrite(path, sheet, [cv2.IMWRITE_JPEG_QUALITY, 82])


def quiet_limit(seconds):
    return max(1, int(QUIET_PER_60 * seconds / 60 + 0.5))


def gate(clip, tot):
    """one line per failed measure (empty: pass)"""
    out, lim = [], quiet_limit(tot["seconds"])
    if tot["quiet_seconds"] > lim:
        at = ', '.join(str(t) for t in tot["quiet_at"])
        out.append(f"motion quiet: {tot['quiet_seconds']} quiet seconds in {tot['seconds']} s (at {at} s), over {lim} "
                   f"(4 per 60 s; a quiet second is under 1% of the picture moving besides the camera; the reference Short: 4 in 59 s)")
    if tot["longest_quiet_run"] >= 2:
        out.append(f"motion quiet run: {tot['longest_quiet_run']} quiet seconds in a row from {tot['longest_quiet_run_from']} s "
                   f"(two in a row fails; the reference Short never has two)")
    if 0 in tot["quiet_at"]:
        out.append("motion opening: the first second is quiet (S1-37 asks for motion from frame 1; the reference opens on a fast flight)")
    return [f"{clip}: FAIL {x}" for x in out]


def report(clip, tot, out):
    p = lambda s: print(s, file=out)
    p(f"{clip}: {tot['seconds']} s, {tot['hard_cuts']} hard cut(s)")
    p(f"  quiet seconds ({tot['quiet_seconds']}, limit {quiet_limit(tot['seconds'])}): "
      f"{', '.join(str(t) for t in tot['quiet_at']) or 'none'}; longest quiet run {tot['longest_quiet_run']}"
      f"{'' if not tot['longest_quiet_run'] else ' from ' + str(tot['longest_quiet_run_from']) + ' s'} "
      f"(the reference Short: 4 in 59 s, never two in a row)")
    p(f"  dead seconds (quiet and the camera under 2): {tot['dead_seconds']}; busy seconds (4% or more moving): {tot['busy_seconds']}; peaks {tot['peaks']}")
    p(f"  camera: {tot['cam_typical_second']}% of the width in a typical second, {tot['slow_camera_seconds']} slow-camera seconds (under 6), "
      f"locked {tot['cam_locked_share']}% of the time (the reference Short: 15, 15 slow seconds in 59)")
    p(f"  besides the camera: mean {tot['own_mean']}% of the picture, median {tot['own_median']}%; moving things per frame {tot['things_mean']}")


def main(argv=None):
    ap = argparse.ArgumentParser(description='What moves besides the camera, second by second, and a gate on the quiet seconds.')
    ap.add_argument('clip')
    ap.add_argument('--json', nargs='?', const='-', default=None, help='write the numbers to a file, or to stdout with no file')
    ap.add_argument('--gate', action='store_true', help='exit 1 when a measure fails; one line per failed measure on stdout')
    ap.add_argument('--sheet', default=None, help='also draw the heat sheet to this .jpg')
    a = ap.parse_args(argv)
    tot, secs = measure(a.clip, a.sheet)
    res = dict(clip=a.clip, totals=tot, seconds=secs)
    fails = gate(a.clip, tot) if a.gate else []
    if a.gate:
        res['gate'] = dict(limit=quiet_limit(tot['seconds']), passed=not fails, fails=fails)
    json_out = a.json == '-'
    if a.json and not json_out:
        with open(a.json, 'w') as f:
            json.dump(res, f, indent=1)
    # stdout carries one thing: the JSON, or the gate's fail lines, or (with neither) the report
    report(a.clip, tot, sys.stderr if (a.gate or json_out) else sys.stdout)
    if a.gate:
        print(f"gate: {'pass' if not fails else 'FAIL'} ({len(fails)} failed measure(s))", file=sys.stderr)
        for x in fails:
            print(x, file=sys.stderr if json_out else sys.stdout)
    if json_out:
        print(json.dumps(res, indent=1))
    return 1 if fails else 0


if __name__ == '__main__':
    sys.exit(main())
