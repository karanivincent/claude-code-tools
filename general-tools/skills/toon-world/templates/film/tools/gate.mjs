// The render gate (toon-video "The order"): a render longer than 8 s waits for the owner's yes to the beat board and the
// critic's score for it, written in src/stories/<slug>/gates.json:
//   { "beatBoard": { "ownerYes": "<date>: <his words>", "critic": 3.9 } }
// Stills and short fix checks (8 s or less) always pass. Nobody edits this file or the gate to get past it.
import fs from 'node:fs';
import path from 'node:path';

export function renderGate(storyDir, seconds) {
  if (seconds <= 8) return;
  const file = path.join(storyDir, 'gates.json');
  const g = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  const b = g.beatBoard ?? {};
  const missing = [!b.ownerYes && "the owner's yes to the beat board", typeof b.critic !== 'number' && "the critic's score for the beat board"].filter(Boolean);
  if (missing.length) {
    console.error(`render gate: a ${seconds.toFixed(1)} s render needs ${missing.join(' and ')} in ${path.relative(process.cwd(), file)}.`);
    console.error('The order: build, cold read, audit, beat board (owner first, then the critic), then one render. A fix check is 8 s or less.');
    process.exit(2);
  }
}
