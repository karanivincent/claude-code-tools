// Builders for the checks' tests: a run on disk (profile, plan, inventory, design renders, capture
// runs written the way the capture spec writes them: <key>.txt, .dom.json, .errors.json,
// .meta.json beside capture.json), and a ctx over it. Synthetic and generic only.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateAgainst } from '../../lib/core/schema.mjs';
import { featurePaths } from '../../lib/core/paths.mjs';
import { worldFilePath } from '../../lib/seed/plan.mjs';
import { sha256 } from '../../lib/core/hash.mjs';
import { makeTestCtx } from '../helpers/ctx.mjs';
import { makeTempDir } from '../helpers/tmp-repo.mjs';
import { makeProfile } from '../helpers/fixtures.mjs';

export const SHA = 'e'.repeat(40);

export function validAgainstSchema(name, value) {
  const r = validateAgainst(name, value);
  if (!r.ok) throw new Error(`${name}: ${r.errors.map((e) => `${e.path} ${e.message}`).join('; ')}`);
  return true;
}

const style = (o = {}) => ({ fontFamily: 'Inter', fontClass: 'sans', fontSize: 14, fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'rgb(20, 20, 20)', backgroundColor: 'rgba(0, 0, 0, 0)', ...o });

/**
 * A dom.json from visible lines, plus extra elements (controls with test ids and states).
 * @param {string[]} lines
 * @param {{ extra?: object[], width?: number, scrollWidth?: number, fonts?: object[] }} [o]
 */
export function domFor(lines, o = {}) {
  const elements = [];
  let y = 10;
  for (const text of lines) {
    elements.push({ i: elements.length, kind: 'text', tag: 'p', role: null, name: null, text, testid: null, box: { x: 10, y, w: 300, h: 20 }, visible: true, style: style(), icon: false, clipped: false, lines: 1, disabled: null });
    y += 30;
  }
  for (const e of o.extra ?? []) {
    elements.push({ i: elements.length, kind: 'control', tag: 'button', role: 'button', name: e.text ?? e.testid, text: e.text ?? '', testid: e.testid ?? null, box: e.box ?? { x: 10, y, w: 120, h: 32 }, visible: e.visible ?? true, style: style(e.style), icon: e.icon ?? false, clipped: e.clipped ?? false, lines: e.lines ?? 1, disabled: e.disabled ?? false });
    y += 40;
  }
  const width = o.width ?? 1440;
  return { schemaVersion: 1, url: 'http://localhost:4101/widgets', viewport: { width, height: 900 }, document: { scrollWidth: o.scrollWidth ?? width, clientWidth: width, scrollHeight: 1200 }, fonts: o.fonts ?? [{ family: 'Inter', loaded: true }], elements };
}

export const emptyLog = () => ({ schemaVersion: 1, console: [], requests: [], perf: { requestCount: 12, loadMs: 400 }, axe: [] });

export function world(id, kind = 'design', roles = ['admin', 'member']) {
  return { id, kind, orgName: `Delivery fixture · widgets ${id}`, users: roles.map((role) => ({ role, email: `delivery+widgets-${id}-${role}@example.invalid` })), notes: '' };
}

/** A built, seeded row with sensible defaults; an option set to undefined removes that field. */
export function row(id, o = {}) {
  const r = {
    id, class: 'new', owner: 'U1', requested: null, invented: false, data: [], backend: [], controls: [], copy: [], dayOne: false, invariants: [],
    reach: { class: 'seeded', world: 'design', role: 'admin', steps: [{ goto: `/widgets/${id.toLowerCase()}` }] },
    markers: { text: [], testids: [], forbidden: [] },
    ...o,
  };
  for (const k of Object.keys(r)) if (r[k] === undefined) delete r[k];
  return r;
}

export function planWith(rows, o = {}) {
  return {
    schemaVersion: 1, feature: 'widgets', epic: 101, scopeIssue: null, scopeSnapshot: null,
    worlds: o.worlds ?? [world('design')],
    units: o.units ?? [
      { id: 'U0', title: 'Contracts', issue: null, kind: 'contract', wave: 0, files: ['src/contract.ts'], states: [], capabilities: [], risk: 'high', model: 'opus' },
      { id: 'U1', title: 'Widgets', issue: null, kind: 'screen', wave: 1, files: ['src/widgets.tsx'], states: rows.filter((r) => r.owner === 'U1' && !/^CAP-/.test(r.id)).map((r) => r.id), capabilities: [], risk: 'normal', model: 'sonnet' },
    ],
    contracts: o.contracts ?? [], rows, seed: { globalRows: [] }, scope: o.scope ?? [],
  };
}

export const itemKey = (i) => `${i.state}.${i.world}.${i.role}.${i.width}.${i.locale}.${i.theme}`;

/**
 * Write one capture run the way the capture spec does: <key>.txt, .dom.json, .errors.json and
 * .meta.json per item, and capture.json.
 * @param {import('../../lib/core/paths.mjs').FeaturePaths} paths
 * @param {{ runId: string, mode?: string, expectedSha?: string, items: object[] }} c
 */
export function writeCapture(paths, c) {
  const put = (abs, v) => { mkdirSync(join(abs, '..'), { recursive: true }); writeFileSync(abs, typeof v === 'string' ? v : `${JSON.stringify(v, null, 2)}\n`); };
  const dir = paths.captureDir(c.runId);
  const items = c.items.map((x) => {
    const it = { world: 'design', role: 'admin', width: 1440, locale: 'en', theme: 'light', ...x };
    const key = itemKey(it);
    const txt = it.txt ?? `${(it.lines ?? []).join('\n')}\n`;
    put(join(dir, `${key}.txt`), txt);
    if (it.dom !== null) put(join(dir, `${key}.dom.json`), it.dom ?? domFor(it.lines ?? [], { width: it.width }));
    if (it.errors !== null) put(join(dir, `${key}.errors.json`), it.errors ?? emptyLog());
    put(join(dir, `${key}.meta.json`), it.meta ?? { servedSha: it.servedSha ?? c.expectedSha ?? SHA });
    return {
      state: it.state, world: it.world, role: it.role, width: it.width, locale: it.locale, theme: it.theme,
      status: it.status ?? 'reached', servedSha: it.servedSha ?? c.expectedSha ?? SHA,
      files: { png: `${key}.png`, txt: `${key}.txt`, dom: `${key}.dom.json`, ...(it.errors !== null ? { errors: `${key}.errors.json` } : {}) },
      textSha256: sha256(txt), createdRowIds: it.createdRowIds ?? [],
    };
  });
  const doc = { schemaVersion: 1, runId: c.runId, mode: c.mode ?? 'wave', expectedSha: c.expectedSha ?? SHA, baseUrl: 'http://localhost:4101', items };
  validAgainstSchema('capture', doc);
  put(paths.captureManifest(c.runId), doc);
  return doc;
}

/**
 * Write a run to a temp directory and build a ctx over it.
 * @param {{ plan?: object, inventory?: object, profile?: object, designs?: Record<string, { txt: string, dom?: object }>,
 *           captures?: { runId: string, mode?: string, expectedSha?: string, items: object[] }[],
 *           files?: Record<string, string>, rules?: object[], passthrough?: string[], repoRoot?: string }} o
 *   capture items: { state, world?, role?, width?, locale?, theme?, lines?: string[], txt?: string, dom?: object|null,
 *                    errors?: object|null, servedSha?: string, status?: string, createdRowIds?: string[], meta?: object }
 */
export async function makeRun(o = {}) {
  const t = o.repoRoot ? { dir: o.repoRoot, cleanup() {} } : makeTempDir();
  const profile = o.profile ?? makeProfile();
  const paths = featurePaths(t.dir, 'widgets', profile.paths);
  const put = (abs, v) => { mkdirSync(join(abs, '..'), { recursive: true }); writeFileSync(abs, typeof v === 'string' ? v : `${JSON.stringify(v, null, 2)}\n`); };
  mkdirSync(paths.runDir, { recursive: true });
  if (o.plan) put(paths.plan, o.plan);
  // A plan's worlds each need a world file, and the phase-3 gate says so. Write a minimal valid
  // one per world unless the case under test supplies or withholds it (worldFiles: false).
  if (o.plan && o.worldFiles !== false) {
    for (const w of o.plan.worlds ?? []) {
      put(worldFilePath(paths, w.id), o.worldFiles?.[w.id] ?? { schemaVersion: 1, world: w.id, rows: [{ key: 'org', table: 'organizations', values: { name: { $orgName: true } } }] });
    }
  }
  if (o.inventory) put(paths.inventory, o.inventory);
  for (const [rel, text] of Object.entries(o.files ?? {})) put(join(t.dir, rel), text);
  for (const [id, d] of Object.entries(o.designs ?? {})) {
    put(paths.designRender(id, 'txt'), d.txt);
    if (d.dom) put(paths.designRender(id, 'dom.json'), d.dom);
  }
  for (const c of o.captures ?? []) writeCapture(paths, c);
  const { ctx, stdout, stderr, runner, gh } = await makeTestCtx({ repoRoot: t.dir, feature: 'widgets', profile, rules: o.rules ?? [], passthrough: o.passthrough ?? [] });
  return { dir: t.dir, paths, ctx, stdout, stderr, runner, gh, cleanup: t.cleanup };
}
