// One machine-wide slot file (A8): heavy work (a shoot, the repo's e2e command) takes a slot,
// at most two at a time, and releases it itself, so sessions need not announce shoots to each
// other. A holder whose process is gone is reclaimed. The file is ~/.delivery/slots.json, or
// $DELIVERY_SLOTS_FILE (tests set it).

import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { readJson, writeJsonAtomic, withLock } from '../core/fs.mjs';
import { DeliveryError, EXIT } from '../core/exit.mjs';

export const MAX_SLOTS = 2;

/** @param {Record<string, string|undefined>} [env] */
export function slotsFile(env = process.env) {
  return env.DELIVERY_SLOTS_FILE || join(homedir(), '.delivery', 'slots.json');
}

/** Whether a process exists (signal 0). EPERM means it exists but is not ours. */
export function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (err) { return err.code === 'EPERM'; }
}

async function readHolders(file) {
  const doc = await readJson(file, { optional: true }).catch(() => null);
  return Array.isArray(doc?.holders) ? doc.holders : [];
}

/** Run mutate(holders) under the file's lock and save the holders it returns. */
async function update(file, mutate) {
  return withLock(`${file}.lock`, async () => {
    const out = mutate(await readHolders(file));
    await writeJsonAtomic(file, { schemaVersion: 1, holders: out.holders });
    return out.result;
  });
}

/**
 * Take a slot, waiting (polling) until one is free or timeoutMs passes.
 * @param {{ file?: string, pid?: number, label?: string, max?: number, timeoutMs?: number, pollMs?: number,
 *           isAlive?: (pid: number) => boolean, now?: () => number, sleep?: (ms: number) => Promise<void>, onWait?: (msg: string) => void }} [o]
 * @returns {Promise<{ id: string, file: string }>}
 */
export async function takeSlot(o = {}) {
  const file = o.file ?? slotsFile();
  const pid = o.pid ?? process.pid;
  const max = o.max ?? MAX_SLOTS;
  const alive = o.isAlive ?? pidAlive;
  const now = o.now ?? Date.now;
  const sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const timeoutMs = o.timeoutMs ?? 30 * 60_000;
  const pollMs = o.pollMs ?? 2000;
  const id = randomBytes(6).toString('hex');
  const start = now();
  let told = false;
  for (;;) {
    const busy = await update(file, (holders) => {
      const live = holders.filter((h) => alive(h.pid)); // a dead pid is reclaimed here
      if (live.length < max) {
        live.push({ id, pid, label: o.label ?? 'delivery', at: new Date(now()).toISOString() });
        return { holders: live, result: null };
      }
      return { holders: live, result: live };
    });
    if (!busy) return { id, file };
    const names = busy.map((h) => `${h.label} (pid ${h.pid}, since ${h.at})`).join('; ');
    if (now() - start >= timeoutMs) {
      throw new DeliveryError(EXIT.WAIT, `no slot free after ${Math.round(timeoutMs / 1000)} s: ${max} of ${max} are held by ${names}; retry when one finishes`, { code: 'slot-timeout' });
    }
    if (!told) { o.onWait?.(`waiting for a slot: ${max} of ${max} are held by ${names}`); told = true; }
    await sleep(pollMs);
  }
}

/** Release a slot by id (or, with no id, every slot this pid holds). Safe to call twice. */
export async function releaseSlot({ file, id, pid } = {}) {
  await update(file ?? slotsFile(), (holders) => ({
    holders: holders.filter((h) => (id ? h.id !== id : h.pid !== (pid ?? process.pid))),
    result: null,
  }));
}

/** Take a slot, run fn, release the slot whatever fn does. */
export async function withSlot(o, fn) {
  const slot = await takeSlot(o);
  try { return await fn(slot); } finally { await releaseSlot({ file: slot.file, id: slot.id }); }
}
