// Argument parsing. bin/delivery.mjs strips the three global flags (--feature, --json,
// --help) first; each command then parses what is left with parseCommandArgs.

import { parseArgs as nodeParseArgs } from 'node:util';
import { UsageError } from './exit.mjs';

/**
 * Pull the global flags out of argv wherever they appear.
 * @param {string[]} argv
 * @returns {{ global: { feature: string|null, json: boolean, help: boolean }, rest: string[] }}
 */
export function extractGlobalFlags(argv) {
  const global = { feature: null, json: false, help: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { rest.push(...argv.slice(i)); break; }
    if (a === '--json') global.json = true;
    else if (a === '--help' || a === '-h') global.help = true;
    else if (a === '--feature') {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) throw new UsageError('--feature needs a value');
      global.feature = v;
      i++;
    } else if (a.startsWith('--feature=')) global.feature = a.slice('--feature='.length);
    else rest.push(a);
  }
  return { global, rest };
}

/**
 * Parse a command's own arguments. Unknown flags and wrong positional counts are usage errors.
 *
 * @param {string[]} argv arguments after the command words, global flags removed
 * @param {{
 *   options?: Record<string, { type: 'string'|'boolean', multiple?: boolean, short?: string, default?: unknown }>,
 *   positionals?: { min?: number, max?: number, names?: string[] },
 * }} spec
 * @returns {{ values: Record<string, any>, positionals: string[] }}
 */
export function parseCommandArgs(argv, spec = {}) {
  const options = spec.options ?? {};
  let parsed;
  try {
    parsed = nodeParseArgs({ args: argv, options, allowPositionals: true, strict: true });
  } catch (err) {
    throw new UsageError(String(err.message).replace(/\.$/, ''));
  }
  const values = { ...parsed.values };
  for (const [name, def] of Object.entries(options)) {
    if (values[name] === undefined && def.default !== undefined) values[name] = def.default;
  }
  const pos = parsed.positionals;
  const min = spec.positionals?.min ?? 0;
  const max = spec.positionals?.max ?? 0;
  const names = spec.positionals?.names ?? [];
  if (pos.length < min) {
    const missing = names.slice(pos.length, min).map((n) => `<${n}>`).join(' ');
    throw new UsageError(`missing argument${missing ? ' ' + missing : ''}`);
  }
  if (max >= 0 && pos.length > max) throw new UsageError(`unexpected argument "${pos[max]}"`);
  return { values, positionals: pos };
}

/**
 * Read an integer flag value (PR or epic numbers).
 * @param {unknown} value
 * @param {string} flag e.g. "--pr"
 * @param {{ required?: boolean }} [opts]
 */
export function intFlag(value, flag, opts = {}) {
  if (value === undefined || value === null) {
    if (opts.required) throw new UsageError(`${flag} <n> is required`);
    return null;
  }
  const s = String(value);
  if (!/^[1-9]\d*$/.test(s)) throw new UsageError(`${flag} needs a positive integer, got "${s}"`);
  return Number(s);
}
