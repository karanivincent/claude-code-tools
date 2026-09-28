// delivery slot: the machine-wide slot file that heavy work takes a place in (A8).
// Owner: slice C (docs/ARCHITECTURE.md).

import { spawn } from 'node:child_process';
import { defineCommand } from '../core/command.mjs';
import { UsageError, EXIT } from '../core/exit.mjs';
import { takeSlot, releaseSlot, withSlot, slotsFile, MAX_SLOTS } from '../capture/slots.mjs';

function flags(list, allowed) {
  const out = {};
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (!a.startsWith('--')) throw new UsageError(`unexpected argument "${a}"`);
    const [k, inline] = a.slice(2).split(/=(.*)/s);
    if (!allowed.includes(k)) throw new UsageError(`unknown option --${k}`);
    const v = inline ?? list[++i];
    if (v === undefined) throw new UsageError(`--${k} needs a value`);
    out[k] = v;
  }
  return out;
}

const seconds = (v, name) => {
  if (v === undefined) return undefined;
  if (!/^\d+$/.test(v)) throw new UsageError(`--${name} is a whole number of seconds`);
  return Number(v) * 1000;
};

export default defineCommand({
  name: 'slot',
  summary: 'Take, release or run a command inside one of the two machine-wide heavy-work slots',
  usage: `usage: delivery slot take [--label <text>] [--timeout <s>] [--pid <n>]
       delivery slot release <id>
       delivery slot run [--label <text>] [--timeout <s>] -- <command> [args...]

Heavy work (a shoot, the repo's e2e command) shares one machine-wide file, ~/.delivery/slots.json
(or $DELIVERY_SLOTS_FILE), with at most ${MAX_SLOTS} holders at a time. delivery shoot takes and
releases a slot itself. Wrap the repo's e2e command the same way:

  delivery slot run -- pnpm e2e ...

take     waits (polling, message naming the holders) until a slot is free, then prints its id.
         The slot belongs to --pid (default: the calling shell); a holder whose process has
         gone is reclaimed by the next taker. Release it with "slot release <id>".
run      takes a slot, runs the command with the same terminal, releases the slot whatever
         happens, and exits with the command's own exit code.

options:
  --timeout <s>   give up waiting after this many seconds (default 1800; exit 4)
  --label <text>  who holds it, shown to anyone waiting

exit: 0 done; 4 no slot became free in time; 2 usage; run: the command's own code

common options:
  --feature <slug>   ignored (slots are per machine)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const [sub, ...rest] = argv;
    const file = slotsFile(ctx.env);
    if (sub === 'take') {
      const f = flags(rest, ['label', 'timeout', 'pid']);
      const slot = await takeSlot({ file, label: f.label ?? 'slot take', pid: f.pid ? Number(f.pid) : process.ppid, timeoutMs: seconds(f.timeout, 'timeout'), onWait: (m) => ctx.out.line(m) });
      ctx.out.line(slot.id);
      ctx.out.set('slot', slot.id);
      return EXIT.PASS;
    }
    if (sub === 'release') {
      if (rest.length !== 1) throw new UsageError('slot release takes the slot id');
      await releaseSlot({ file, id: rest[0] });
      ctx.out.line(`released ${rest[0]}`);
      return EXIT.PASS;
    }
    if (sub === 'run') {
      const dash = rest.indexOf('--');
      if (dash < 0 || dash === rest.length - 1) throw new UsageError('slot run needs -- <command> [args...]');
      const f = flags(rest.slice(0, dash), ['label', 'timeout']);
      const [cmd, ...args] = rest.slice(dash + 1);
      return withSlot({ file, label: f.label ?? `slot run ${cmd}`, timeoutMs: seconds(f.timeout, 'timeout'), onWait: (m) => ctx.out.line(m) }, () => new Promise((resolve, reject) => {
        const child = spawn(cmd, args, { stdio: 'inherit', cwd: ctx.cwd });
        child.on('error', reject);
        child.on('close', (code, signal) => resolve(code ?? (signal ? 128 : 1)));
      }));
    }
    throw new UsageError('usage: delivery slot take|release|run (see delivery slot --help)');
  },
});
