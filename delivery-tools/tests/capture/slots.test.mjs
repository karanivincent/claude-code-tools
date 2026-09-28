// The machine-wide slot file (A8): at most two holders, dead pids reclaimed, released on error.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { takeSlot, releaseSlot, withSlot, slotsFile } from '../../lib/capture/slots.mjs';
import { withShootSlot } from '../../lib/picture/shoot.mjs';
import slotCommand from '../../lib/commands/slot.mjs';
import { makeTempDir } from '../helpers/tmp-repo.mjs';
import { makeTestCtx } from '../helpers/ctx.mjs';

const holders = (file) => JSON.parse(readFileSync(file, 'utf8')).holders;
const alive = () => true;

test('slotsFile: the env var overrides ~/.delivery/slots.json', () => {
  assert.equal(slotsFile({ DELIVERY_SLOTS_FILE: '/x/s.json' }), '/x/s.json');
  assert.match(slotsFile({}), /\.delivery[/\\]slots\.json$/);
});

test('a third taker times out while two hold, naming the holders; a release lets it in', async () => {
  const dir = makeTempDir();
  try {
    const file = join(dir.dir, 'slots.json');
    const a = await takeSlot({ file, pid: 101, label: 'shoot a', isAlive: alive });
    await takeSlot({ file, pid: 102, label: 'e2e b', isAlive: alive });
    let t = 0;
    const msgs = [];
    await assert.rejects(
      takeSlot({ file, pid: 103, isAlive: alive, timeoutMs: 5000, pollMs: 1000, now: () => t, sleep: async (ms) => { t += ms; }, onWait: (m) => msgs.push(m) }),
      (err) => err.exit === 4 && /shoot a \(pid 101/.test(err.message) && /e2e b \(pid 102/.test(err.message),
    );
    assert.equal(msgs.length, 1);
    assert.match(msgs[0], /waiting for a slot: 2 of 2 are held by shoot a/);
    assert.equal(holders(file).length, 2);
    // it waits, then gets the slot the moment one is released
    let released = false;
    const third = await takeSlot({
      file, pid: 103, isAlive: alive, pollMs: 1,
      sleep: async () => { if (!released) { released = true; await releaseSlot({ file, id: a.id }); } },
    });
    assert.ok(third.id);
    assert.deepEqual(holders(file).map((h) => h.pid).sort(), [102, 103]);
  } finally { dir.cleanup(); }
});

test('a holder whose pid is dead is reclaimed', async () => {
  const dir = makeTempDir();
  try {
    const file = join(dir.dir, 'slots.json');
    await takeSlot({ file, pid: 201, isAlive: alive });
    await takeSlot({ file, pid: 202, isAlive: alive });
    const isAlive = (pid) => pid !== 201; // 201 died
    await takeSlot({ file, pid: 203, isAlive, timeoutMs: 0 });
    assert.deepEqual(holders(file).map((h) => h.pid).sort(), [202, 203]);
  } finally { dir.cleanup(); }
});

test('withSlot releases the slot when the work throws', async () => {
  const dir = makeTempDir();
  try {
    const file = join(dir.dir, 'slots.json');
    await assert.rejects(withSlot({ file, isAlive: alive }, async () => { assert.equal(holders(file).length, 1); throw new Error('boom'); }), /boom/);
    assert.equal(holders(file).length, 0);
  } finally { dir.cleanup(); }
});

test('shoot takes its slot through withShootSlot and releases it on error', async () => {
  const dir = makeTempDir();
  try {
    const file = join(dir.dir, 'slots.json');
    const { ctx } = await makeTestCtx({ repoRoot: dir.dir, env: { DELIVERY_SLOTS_FILE: file } });
    await assert.rejects(withShootSlot(ctx, async () => {
      const h = holders(file);
      assert.equal(h.length, 1);
      assert.match(h[0].label, /^shoot/);
      throw new Error('browser died');
    }), /browser died/);
    assert.equal(holders(file).length, 0);
  } finally { dir.cleanup(); }
});

test('delivery slot run: runs the command, returns its exit code, and frees the slot', async () => {
  const dir = makeTempDir();
  try {
    const file = join(dir.dir, 'slots.json');
    const { ctx } = await makeTestCtx({ repoRoot: dir.dir, env: { DELIVERY_SLOTS_FILE: file } });
    assert.equal(await slotCommand.run(ctx, ['run', '--', process.execPath, '-e', 'process.exit(7)']), 7);
    assert.equal(holders(file).length, 0);
    assert.equal(await slotCommand.run(ctx, ['run', '--', process.execPath, '-e', '0']), 0);
    await assert.rejects(slotCommand.run(ctx, ['run']), /needs --/);
  } finally { dir.cleanup(); }
});

test('delivery slot take and release', async () => {
  const dir = makeTempDir();
  try {
    const file = join(dir.dir, 'slots.json');
    const { ctx, stdout } = await makeTestCtx({ repoRoot: dir.dir, env: { DELIVERY_SLOTS_FILE: file } });
    assert.equal(await slotCommand.run(ctx, ['take', '--pid', String(process.pid), '--label', 'e2e']), 0);
    const [h] = holders(file);
    assert.equal(h.label, 'e2e');
    assert.ok(stdout.text().includes(h.id));
    assert.equal(await slotCommand.run(ctx, ['release', h.id]), 0);
    assert.equal(holders(file).length, 0);
  } finally { dir.cleanup(); }
});
