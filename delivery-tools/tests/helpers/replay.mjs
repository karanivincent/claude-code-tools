// Replay tests run the checks on a private set of real artefacts that never enters this repo.
// They run only when DELIVERY_REPLAY_DIR points at that set, and are skipped (not failed) otherwise.
//
//   DELIVERY_REPLAY_DIR=/path/to/replay/set node --test tests/checks/
//
// Inside a replay test, name files relative to the set with replayPath('audit/live/OV-06.txt');
// a test whose file is missing from the set skips itself too, naming the missing path.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

/** The replay set's root, or null when not configured or not present. */
export function replayDir() {
  const dir = process.env.DELIVERY_REPLAY_DIR;
  return dir && existsSync(dir) ? dir : null;
}

/** Absolute path of a file in the replay set, or null. */
export function replayPath(rel) {
  const dir = replayDir();
  return dir ? join(dir, rel) : null;
}

/**
 * A test that needs the replay set (and optionally some of its files).
 * @param {string} name
 * @param {{ needs?: string[] }} opts relative paths the test reads
 * @param {(t: import('node:test').TestContext, dir: string) => unknown} fn
 */
export function replayTest(name, opts, fn) {
  const dir = replayDir();
  const missing = dir ? (opts.needs ?? []).filter((rel) => !existsSync(join(dir, rel))) : [];
  const skip = !dir ? 'DELIVERY_REPLAY_DIR not set' : missing.length ? `replay set lacks ${missing.join(', ')}` : false;
  return test(`replay: ${name}`, { skip }, (t) => fn(t, dir));
}
