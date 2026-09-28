// The numbers the retro may move (tunables.json at the plugin root). The code that uses a number
// reads it here, so a small retro change is a one-line edit to that file and nothing else.
// Owner: slice A2 (docs/ARCHITECTURE.md).

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TUNABLES_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'tunables.json');

/** @returns {Record<string, { value: number, min: number, max: number, step: number, loosens: 'higher'|'lower'|'never', about?: string }>} */
export function loadTunables(file = TUNABLES_FILE) {
  return JSON.parse(readFileSync(file, 'utf8')).tunables;
}

const CURRENT = loadTunables();

/** The current value of one tunable; a key that is not in the file is a bug, not a default. */
export function tunable(key) {
  const t = CURRENT[key];
  if (!t) throw new Error(`unknown tunable ${key}`);
  return t.value;
}
