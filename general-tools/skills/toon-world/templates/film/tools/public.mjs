// The public folder handed to Remotion's bundle(): this story's own files only, linked, not the project's whole public
// folder. bundle() copies its publicDir into every bundle, and the project's public held 3.5 GB of other stories: 23 s and
// 1 GB per bundle, against 5.5 s for the story's own 137 MB (12 Nov 2026). FULL_PUBLIC=1 hands over the whole folder,
// for a story that loads files from outside public/<slug>/.
import fs from 'node:fs';
import path from 'node:path';
const slug = path.basename(path.resolve(import.meta.dirname, '..'));
export function storyPublic(root) {
  if (process.env.FULL_PUBLIC) return path.join(root, 'public');
  const dir = path.join(root, 'out', slug, 'pub'), link = path.join(dir, slug);
  fs.mkdirSync(dir, { recursive: true });
  // the gate runs the audit and the look checks at once: both may make the link, so one finding it made is fine
  if (!fs.existsSync(link)) try { fs.symlinkSync(path.join(root, 'public', slug), link); } catch (e) { if (e.code !== 'EEXIST') throw e; }
  return dir;
}

// Tool timings for speed work: each tool appends one line a step to out/<slug>/tool-times.jsonl, the bundle timed on
// its own ({ tool, step, seconds, at }; step is bundle, stills, render, audit, look or gate).
// `production_log.py tooltime out/<slug>/tool-times.jsonl --since <round start>` sums them per tool and step.
export function toolTime(root, tool, step, since) {
  try {
    const dir = path.join(root, 'out', slug);
    fs.mkdirSync(dir, { recursive: true });
    const row = { tool, step, seconds: Math.round((Date.now() - since) / 100) / 10, at: new Date().toISOString() };
    fs.appendFileSync(path.join(dir, 'tool-times.jsonl'), JSON.stringify(row) + '\n');
  } catch { /* a timing never stops a tool */ }
}

/** runs async jobs `n` at a time (several stills on one browser); resolves to their results in order */
export async function pool(jobs, n) {
  const out = new Array(jobs.length); let next = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, jobs.length)) }, async () => {
    while (next < jobs.length) { const i = next++; out[i] = await jobs[i](); }
  }));
  return out;
}
