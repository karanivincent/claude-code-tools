// How commands register: one module per command in lib/commands/, named <command>.mjs or
// <command>-<sub>.mjs, whose default export is { name, summary, usage, run(ctx, argv) }.
// Nothing else registers a command; bin/delivery.mjs finds modules by file name.

import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { UsageError, notImplementedError } from './exit.mjs';

export const COMMANDS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'commands');

/** Every command of spec section 16, in the order --help lists them. */
export const COMMAND_ORDER = Object.freeze([
  'init', 'intake', 'preflight', 'waive', 'status', 'advance',
  'design candidates', 'design render', 'map', 'inventory check', 'baseline',
  'plan verify', 'plan check', 'plan render',
  'issues sync', 'scope post', 'scope read', 'claims open', 'claims verify', 'dupes',
  'sidefx', 'seed', 'shoot', 'review', 'sign-in',
  'wave start', 'wave merge', 'wave end', 'gate', 'capture', 'check', 'audit compile',
  'ci', 'ready', 'pr-body', 'handover', 'report', 'land',
  'hook session-start', 'hook pre-bash', 'hook pre-browser',
]);

/**
 * @typedef {object} CommandModule
 * @property {string} name     "status", "plan check", "hook pre-bash"
 * @property {string} summary  one line for --help
 * @property {string} usage    the full usage text printed by `<command> --help`
 * @property {(ctx: import('./ctx.mjs').Ctx, argv: string[]) => Promise<number>} run  resolves to the exit code
 */

/**
 * Validate and freeze a command definition (use as the module's default export).
 * @param {CommandModule} def
 * @returns {Readonly<CommandModule>}
 */
export function defineCommand(def) {
  for (const k of ['name', 'summary', 'usage']) {
    if (typeof def[k] !== 'string' || !def[k].trim()) throw new Error(`command definition needs a non-empty ${k}`);
  }
  if (typeof def.run !== 'function') throw new Error(`command ${def.name} needs run(ctx, argv)`);
  if (def.summary.includes('\n')) throw new Error(`command ${def.name}: summary must be one line`);
  return Object.freeze({ ...def });
}

/**
 * The run() of a command whose slice has not landed yet: exit 2, "not implemented (slice X)".
 * @param {string} slice
 */
export function notImplementedRun(slice) {
  return async function run() {
    throw notImplementedError(slice);
  };
}

/** @param {string} name e.g. "plan check" @returns {string} its module file name */
export function fileForCommand(name) {
  return `${name.replace(/ /g, '-')}.mjs`;
}

/** @param {string} [dir] @returns {string[]} module file names in lib/commands */
export function commandFiles(dir = COMMANDS_DIR) {
  return readdirSync(dir).filter((f) => f.endsWith('.mjs')).sort();
}

/**
 * Find the module for the command words at the start of argv.
 * @param {string[]} words argv after global flags are removed
 * @param {string} [dir]
 * @returns {Promise<{ module: CommandModule, rest: string[], file: string }>}
 */
export async function resolveCommand(words, dir = COMMANDS_DIR) {
  const [cmd, sub] = words;
  if (!cmd) throw new UsageError('no command given; run "delivery --help"');
  const files = new Set(commandFiles(dir));
  if (!/^[a-z][a-z-]*$/.test(cmd)) throw new UsageError(`unknown command "${cmd}"; run "delivery --help"`);
  let file = null;
  let rest;
  if (sub && /^[a-z][a-z-]*$/.test(sub) && files.has(`${cmd}-${sub}.mjs`)) { file = `${cmd}-${sub}.mjs`; rest = words.slice(2); }
  else if (files.has(`${cmd}.mjs`)) { file = `${cmd}.mjs`; rest = words.slice(1); }
  if (!file) {
    const subs = [...files].filter((f) => f.startsWith(`${cmd}-`)).map((f) => f.slice(cmd.length + 1, -4));
    if (subs.length) {
      throw new UsageError(sub ? `unknown subcommand "${cmd} ${sub}"; one of: ${subs.join(', ')}` : `"delivery ${cmd}" needs a subcommand: ${subs.join(', ')}`);
    }
    throw new UsageError(`unknown command "${cmd}"; run "delivery --help"`);
  }
  const mod = (await import(pathToFileURL(join(dir, file)).href)).default;
  if (!mod || typeof mod.run !== 'function') throw new Error(`lib/commands/${file} has no valid default export`);
  return { module: mod, rest, file };
}

/**
 * Every command module, in COMMAND_ORDER then alphabetical for anything extra.
 * @param {string} [dir]
 * @returns {Promise<{ file: string, module: CommandModule }[]>}
 */
export async function loadAllCommands(dir = COMMANDS_DIR) {
  const mods = [];
  for (const file of commandFiles(dir)) {
    mods.push({ file, module: (await import(pathToFileURL(join(dir, file)).href)).default });
  }
  const pos = (m) => { const i = COMMAND_ORDER.indexOf(m.module.name); return i < 0 ? COMMAND_ORDER.length : i; };
  return mods.sort((a, b) => pos(a) - pos(b) || a.module.name.localeCompare(b.module.name));
}

/** The top-level --help text. */
export async function helpText(dir = COMMANDS_DIR) {
  const all = await loadAllCommands(dir);
  const width = Math.max(...all.map((c) => c.module.name.length));
  return [
    'usage: delivery <command> [<sub>] [options]',
    '',
    'Every command takes --feature <slug>, --json and --help.',
    'Exit codes: 0 pass, 1 red, 2 usage or config, 3 blocked on the founder, 4 wait and retry, 5 inconsistency.',
    '',
    'commands:',
    ...all.map((c) => `  ${c.module.name.padEnd(width)}  ${c.module.summary}`),
  ].join('\n');
}
