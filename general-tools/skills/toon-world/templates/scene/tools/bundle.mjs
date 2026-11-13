// __SLUG__ scene tools: a Remotion bundle per builder, kept until a source file changes (a stills sheet then takes
// seconds). Each scene (or the film, or the cast sheet) has its own bundle folder, out/__SLUG__/bundles/<key>/: in the
// cliff film one shared bundle was deleted by one builder's rebuild while another builder rendered from it (a 404).
// Builders sharing one checkout still see each other's saved files in a fresh bundle: keep edits in your own scene.
import fs from 'node:fs';
import path from 'node:path';
import { OUT, storyPub, need } from './lib.mjs';

const newest = (dir) => { let t = 0; for (const f of fs.readdirSync(dir, { recursive: true })) { const p = path.join(dir, f); try { const s = fs.statSync(p); if (s.isFile() && s.mtimeMs > t) t = s.mtimeMs; } catch { /* gone */ } } return t; };
export async function bundled({ fresh = false, key = 'film' } = {}) {
  const k = String(key).replace(/[^a-z0-9-]/gi, '_'), pub = storyPub(), home = path.join(OUT, 'bundles', k), ledger = path.join(home, 'bundle.json');
  const src = Math.max(newest(path.resolve('src')), newest(pub), newest(path.resolve('stories')) || 0);
  if (!fresh && fs.existsSync(ledger)) {
    const l = JSON.parse(fs.readFileSync(ledger, 'utf8'));
    if (l.time > src && fs.existsSync(l.dir)) return { serveUrl: l.dir, pub };
  }
  const tmp = path.join(home, 'tmp'); fs.mkdirSync(tmp, { recursive: true });
  process.env.TMPDIR = process.env.TEMP = process.env.TMP = tmp; // bundles land in out/, not the system temp
  const { bundle } = need('@remotion/bundler');
  const t0 = Date.now();
  const serveUrl = await bundle({ entryPoint: path.resolve('src/index.ts'), publicDir: pub });
  // only this key's old bundle goes: another builder may be rendering from theirs
  if (fs.existsSync(ledger)) { const old = JSON.parse(fs.readFileSync(ledger, 'utf8')).dir; if (old !== serveUrl && old.startsWith(home)) fs.rmSync(old, { recursive: true, force: true }); }
  fs.writeFileSync(ledger, JSON.stringify({ dir: serveUrl, time: Date.now() }));
  console.log(`bundled in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  return { serveUrl, pub };
}
