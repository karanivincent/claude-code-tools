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
  if (!fs.existsSync(link)) fs.symlinkSync(path.join(root, 'public', slug), link);
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
