// The runs ledger: docs/delivery/runs.jsonl in the product repo, one JSON line per run (C1).
// Re-running the retro for a feature replaces that feature's line, in place. Owner: slice A2.

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { writeFileAtomic, ensureDir } from '../core/fs.mjs';
import { assertValid } from '../core/schema.mjs';

/** @param {{ deliveryDir: string }} paths */
export function ledgerPath(paths) {
  return join(dirname(paths.deliveryDir), 'runs.jsonl');
}

/** Every record in the file, oldest first; a missing file is an empty ledger. A bad line is an error, not a skip. */
export async function readLedger(file) {
  let text;
  try { text = await readFile(file, 'utf8'); } catch (err) { if (err.code === 'ENOENT') return []; throw err; }
  const out = [];
  text.split('\n').forEach((line, i) => {
    if (!line.trim()) return;
    let rec;
    try { rec = JSON.parse(line); } catch { throw new Error(`${file} line ${i + 1} is not JSON`); }
    assertValid('run-record', rec, { exit: 5, label: `${file} line ${i + 1}` });
    out.push(rec);
  });
  return out;
}

/** Replace the feature's line, or append. Returns the new list. */
export async function writeRecord(file, record) {
  assertValid('run-record', record, { exit: 5, label: 'run record' });
  const all = await readLedger(file);
  const at = all.findIndex((r) => r.feature === record.feature);
  if (at >= 0) all[at] = record; else all.push(record);
  await ensureDir(dirname(file));
  await writeFileAtomic(file, all.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return all;
}
