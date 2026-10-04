// A map state may ask for a colour scheme: the shoot emulates prefers-color-scheme for it and, with
// the profile's ui.themeStorageKey, writes the app's stored theme so a saved preference cannot win.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateMap } from '../../lib/picture/map.mjs';
import { applyColorScheme } from '../../lib/picture/shoot.mjs';
import { validateAgainst } from '../../lib/core/schema.mjs';
import { makeProfile } from '../helpers/fixtures.mjs';
import { sampleMap } from './map.test.mjs';

const designed = new Set(['KC-05', 'KC-04', 'KC-08', 'KC-01']);

function withScheme(value) {
  const m = sampleMap();
  m.states[0] = { ...m.states[0], colorScheme: value };
  return m;
}

test('delivery map accepts colorScheme dark or light and refuses anything else', () => {
  assert.deepEqual(validateMap(withScheme('dark'), { designed }), []);
  assert.deepEqual(validateMap(withScheme('light'), { designed }), []);
  assert.ok(validateMap(withScheme('night'), { designed }).some((p) => p.includes('colorScheme must be "dark" or "light"')));
});

function fakePage() {
  const calls = [];
  const storage = {};
  return {
    calls,
    storage,
    async emulateMedia(o) { calls.push(['emulateMedia', o.colorScheme]); },
    async addInitScript(fn, arg) { calls.push(['addInitScript', arg.v]); },
    async evaluate(fn, arg) { storage[arg.k] = arg.v; calls.push(['evaluate', arg.v]); },
  };
}

test('applyColorScheme emulates the scheme, then goes back to no emulation for a state without one', async () => {
  const page = fakePage();
  await applyColorScheme(page, undefined);
  assert.deepEqual(page.calls, [], 'nothing to do for a page never set');
  await applyColorScheme(page, 'dark');
  await applyColorScheme(page, 'dark');
  await applyColorScheme(page, undefined);
  assert.deepEqual(page.calls, [['emulateMedia', 'dark'], ['emulateMedia', null]]);
});

test('with ui.themeStorageKey the stored theme is written before navigation and on the open page', async () => {
  const page = fakePage();
  await applyColorScheme(page, 'dark', 'app-theme');
  assert.deepEqual(page.calls, [['emulateMedia', 'dark'], ['addInitScript', 'dark'], ['evaluate', 'dark']]);
  assert.equal(page.storage['app-theme'], 'dark');
  await applyColorScheme(page, undefined, 'app-theme');
  assert.equal(page.storage['app-theme'], 'system', 'a state without a scheme follows the system again');
});

test('the profile schema takes ui.themeStorageKey and nothing else under ui', () => {
  assert.equal(validateAgainst('profile', makeProfile({ ui: { themeStorageKey: 'app-theme' } })).ok, true);
  assert.equal(validateAgainst('profile', makeProfile({ ui: { themeKey: 'x' } })).ok, false);
});
