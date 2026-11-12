// __SLUG__ scene tools: what they share. Run every tool from the project root.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const STORY_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));   // src/stories/__SLUG__
export const SLUG = '__SLUG__', FILM = '__FILM__';
export const OUT = path.resolve('out', SLUG);
const req = createRequire(path.resolve('package.json'));
/** a package from the project's node_modules (esbuild may sit under @remotion/bundler only) */
export const need = (name) => { try { return req(name); } catch { return createRequire(req.resolve('@remotion/bundler'))(name); } };
/** an ES module from the project (this file sits inside it, so node finds its node_modules) */
export const importPkg = async (name) => import(name);

/** Load a TypeScript file in node (a scene's story.ts, plan.ts). It must not import three.js or Remotion at run time
 *  (type imports are fine): the story files keep to that so the tools can read them. */
export async function loadTs(file) {
  const esbuild = need('esbuild');
  fs.mkdirSync(path.join(OUT, '.tools'), { recursive: true });
  const out = path.join(OUT, '.tools', `${path.basename(path.dirname(file))}-${path.basename(file).replace(/\.tsx?$/, '')}-${process.pid}.mjs`);
  await esbuild.build({ entryPoints: [file], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error', external: ['three', 'remotion', 'react', '@remotion/*'] });
  try { return await import(pathToFileURL(out).href + `?t=${Date.now()}`); } finally { fs.rmSync(out, { force: true }); }
}
export const loadFilm = () => loadTs(path.join(STORY_DIR, 'plan.ts'));
export const loadScene = (id) => {
  const f = path.join(STORY_DIR, 'scenes', id, 'story.ts');
  if (!fs.existsSync(f)) throw new Error(`no scene "${id}" (${path.relative(process.cwd(), f)})`);
  return loadTs(f);
};

/** The story's own public folder for bundles and renders: out/__SLUG__/pub/__SLUG__/ <- public/__SLUG__/ (copied when
 *  newer). Bundling the project's whole public/ copies every story's files into every bundle. */
export function storyPub() {
  const src = path.resolve('public', SLUG), dst = path.join(OUT, 'pub', SLUG);
  fs.mkdirSync(dst, { recursive: true });
  if (fs.existsSync(src)) for (const f of fs.readdirSync(src, { recursive: true })) {
    const a = path.join(src, f), b = path.join(dst, f);
    if (fs.statSync(a).isDirectory()) { fs.mkdirSync(b, { recursive: true }); continue; }
    if (!fs.existsSync(b) || fs.statSync(b).mtimeMs < fs.statSync(a).mtimeMs) fs.copyFileSync(a, b);
  }
  return path.join(OUT, 'pub');
}

/** argv: positional args and --key value / --flag */
export function args(argv = process.argv.slice(2)) {
  const pos = [], o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { const k = a.slice(2), v = argv[i + 1]; if (v === undefined || v.startsWith('--')) o[k] = true; else { o[k] = v; i++; } } else pos.push(a);
  }
  return { pos, o };
}

/** take a render slot when the project keeps them (Bible in Clay: ~/.cache/bible-in-clay/render-slots/1 or /2; mkdir
 *  fails when it is taken). Returns a release function, or null when every slot is taken. */
export function takeSlot(what, dir = process.env.RENDER_SLOTS ?? path.join(process.env.HOME ?? '', '.cache/bible-in-clay/render-slots')) {
  if (!fs.existsSync(dir)) return () => {};
  for (const n of ['1', '2']) {
    const s = path.join(dir, n);
    try {
      const st = fs.existsSync(s) ? fs.statSync(s) : null;
      if (st && Date.now() - st.mtimeMs > 3 * 3600e3) fs.rmSync(s, { recursive: true, force: true }); // stale after three hours
      fs.mkdirSync(s);
      fs.writeFileSync(path.join(s, 'who'), `${what} ${new Date().toISOString()}\n`);
      return () => fs.rmSync(s, { recursive: true, force: true });
    } catch { /* taken */ }
  }
  return null;
}
