// Update runs. A page that was built from an earlier design gets a new run when its design
// changes (`delivery intake <archive> --from <earlier feature>`). The new run starts from the
// earlier run's committed map, test worlds, rules and intent instead of from nothing, and its first
// round pictures the page as it already is, so the reviewers list only what the new design changed.

import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** What an update run carries over from the earlier run, relative to its delivery folder. */
export const CARRIED = Object.freeze(['map.json', 'rules.json', 'intent.json', 'worlds/']);

/**
 * Copy the earlier run's map, worlds, rules and intent into the new run's delivery folder. Never
 * overwrites: a file the new run already has is kept, so running intake again is harmless.
 * @param {{ fromDir: string, toDir: string, feature: string, sentence: string, carryMap?: boolean }} o
 *   carryMap: false for a components run's --from (fix round, round 2 of I15) — its own intake
 *   always writes a fresh map.json from the export's current inventory, so copying the earlier
 *   run's over first would leave a stale one sitting there if this run is later refused or has
 *   nothing new to build (I15, M5): the earlier run's map.json is still required to exist, as
 *   proof --from names a real picture-mode run, just not copied.
 * @returns {Promise<string[]>} what was copied, relative to the delivery folder
 */
export async function carryOver({ fromDir, toDir, feature, sentence, carryMap = true }) {
  if (!existsSync(join(fromDir, 'map.json'))) {
    throw new Error(`${fromDir} has no map.json: --from names a run that never wrote a picture-mode map`);
  }
  await mkdir(toDir, { recursive: true });
  const copied = [];
  const json = async (name, edit) => {
    const from = join(fromDir, name);
    const to = join(toDir, name);
    if (!existsSync(from) || existsSync(to)) return;
    const doc = JSON.parse(await readFile(from, 'utf8'));
    await writeFile(to, JSON.stringify(edit(doc), null, 2) + '\n');
    copied.push(name);
  };
  if (carryMap) await json('map.json', (m) => ({ ...m, feature }));
  await json('rules.json', (r) => r);
  // intake fills the epic and the design fields; the screens in scope stay the earlier run's.
  await json('intent.json', (i) => ({ ...i, feature, sentence }));
  // W7: the earlier run's steers (how to read the design) and its swap list (the safe values its
  // worlds hold) belong with its map and worlds.
  for (const name of ['steers.md', 'swaps.json']) {
    if (existsSync(join(fromDir, name)) && !existsSync(join(toDir, name))) {
      await copyFile(join(fromDir, name), join(toDir, name));
      copied.push(name);
    }
  }
  const worlds = join(fromDir, 'worlds');
  if (existsSync(worlds)) {
    await mkdir(join(toDir, 'worlds'), { recursive: true });
    for (const f of (await readdir(worlds)).filter((n) => n.endsWith('.json')).sort()) {
      if (existsSync(join(toDir, 'worlds', f))) continue;
      await copyFile(join(worlds, f), join(toDir, 'worlds', f));
      copied.push(`worlds/${f}`);
    }
  }
  return copied;
}
