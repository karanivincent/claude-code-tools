# Look numbers in the cartoon-3d-short reports' terms (grade.md section 1): every 6th frame, 540x960, caption band
# rows 650-706 masked; Y' Rec.709 luma on sRGB; ink = black top-hat > .12 and Y' < .30; lit C*ab over L* 40-85 non-ink;
# vignette = mean Y' at r >= .9 over r < .3. Usage: python3 measure.py a.mp4 [b.mp4 ...]
import subprocess, sys, numpy as np
from scipy import ndimage
def frames(path, every=6):
    p = subprocess.run(['ffmpeg','-v','error','-i',path,'-vf',f"select='not(mod(n\\,{every}))',scale=540:960:flags=area",'-vsync','0','-f','rawvideo','-pix_fmt','rgb24','-'],capture_output=True).stdout
    a = np.frombuffer(p, np.uint8).reshape(-1, 960, 540, 3)
    return a.astype(np.float32) / 255
def lab(rgb):
    c = np.where(rgb <= 0.04045, rgb/12.92, ((rgb+0.055)/1.055)**2.4)
    M = np.array([[0.4124,0.3576,0.1805],[0.2126,0.7152,0.0722],[0.0193,0.1192,0.9505]])
    xyz = c @ M.T / np.array([0.9505,1,1.089])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787*xyz + 16/116)
    return 116*f[...,1]-16, 500*(f[...,0]-f[...,1]), 200*(f[...,1]-f[...,2])
yy, xx = np.mgrid[0:960, 0:540]; r = np.hypot((xx-269.5)/269.5, (yy-479.5)/479.5) / np.sqrt(2)
keep = np.ones((960,540), bool); keep[650:707] = False
for path in sys.argv[1:]:
    rows = []
    for im in frames(path):
        Y = im @ np.array([0.2126,0.7152,0.0722])
        ink = ((ndimage.grey_closing(Y, size=(7,7)) - Y) > 0.12) & (Y < 0.30)
        ni = keep & ~ndimage.binary_dilation(ink)
        L, a, b = lab(im); C = np.hypot(a, b); lit = ni & (L > 40) & (L < 85)
        mx = im.max(-1); mn = im.min(-1); S = np.where(mx > 0.15, (mx-mn)/np.maximum(mx,1e-6), np.nan)
        rows.append([np.median(Y[keep]), np.percentile(Y[ni], 5), np.percentile(Y[keep], 95), np.nanmedian(S[keep]),
                     np.percentile(C[lit], 50) if lit.any() else np.nan, np.percentile(C[lit], 90) if lit.any() else np.nan,
                     Y[(r >= 0.9) & keep].mean() / max(Y[(r < 0.3) & keep].mean(), 1e-6), ink[keep].mean()])
    m = np.nanmedian(np.array(rows), 0)
    print(f"{path.split('/')[-1]:<14} n={len(rows):3d} medianY {m[0]:.3f}  nonink p5 {m[1]:.3f}  p95 {m[2]:.3f}  satS {m[3]:.3f}  C*lit p50 {m[4]:.1f} p90 {m[5]:.1f}  vignette {m[6]:.2f}  ink {m[7]:.3f}")
