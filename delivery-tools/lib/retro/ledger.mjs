// The runs ledger: docs/delivery/runs.jsonl in the product repo, one JSON line per run (C1).
// Re-running the retro for a feature replaces that feature's line, in place. A version 1 line is read
// as version 2 with no agent data, and written back as version 2. Owner: slice A2.

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
    try { rec = upgradeRecord(JSON.parse(line)); } catch { throw new Error(`${file} line ${i + 1} is not JSON`); }
    assertValid('run-record', rec, { exit: 5, label: `${file} line ${i + 1}` });
    out.push(rec);
  });
  return out;
}

/** A version 1 record as version 2: no agent data, not an estimate. Anything else is returned as it is. */
export function upgradeRecord(rec) {
  if (rec?.schemaVersion !== 1) return rec;
  const { schemaVersion, feature, endedAt, pluginVersion, phases, founder, ...rest } = rec;
  return { schemaVersion: 2, feature, endedAt, pluginVersion, estimate: false, phases, phaseCost: {}, founder, slotWaits: null, main: null, agents: [], ...rest };
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
