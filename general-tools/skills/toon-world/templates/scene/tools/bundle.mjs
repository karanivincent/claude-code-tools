// __SLUG__ scene tools: one Remotion bundle, kept until a source file changes (a stills sheet then takes seconds).
import fs from 'node:fs';
import path from 'node:path';
import { OUT, storyPub, need } from './lib.mjs';

const newest = (dir) => { let t = 0; for (const f of fs.readdirSync(dir, { recursive: true })) { const p = path.join(dir, f); try { const s = fs.statSync(p); if (s.isFile() && s.mtimeMs > t) t = s.mtimeMs; } catch { /* gone */ } } return t; };
export async function bundled({ fresh = false } = {}) {
  const pub = storyPub(), ledger = path.join(OUT, 'bundle.json');
  const src = Math.max(newest(path.resolve('src')), newest(pub), newest(path.resolve('stories')) || 0);
  if (!fresh && fs.existsSync(ledger)) {
    const l = JSON.parse(fs.readFileSync(ledger, 'utf8'));
    if (l.time > src && fs.existsSync(l.dir)) return { serveUrl: l.dir, pub };
  }
  const tmp = path.join(OUT, 'tmp'); fs.mkdirSync(tmp, { recursive: true });
  process.env.TMPDIR = process.env.TEMP = process.env.TMP = tmp; // bundles land in out/, not the system temp
  const { bundle } = need('@remotion/bundler');
  const t0 = Date.now();
  const serveUrl = await bundle({ entryPoint: path.resolve('src/index.ts'), publicDir: pub });
  if (fs.existsSync(ledger)) { const old = JSON.parse(fs.readFileSync(ledger, 'utf8')).dir; if (old !== serveUrl) fs.rmSync(old, { recursive: true, force: true }); }
  fs.writeFileSync(ledger, JSON.stringify({ dir: serveUrl, time: Date.now() }));
  console.log(`bundled in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  return { serveUrl, pub };
}
