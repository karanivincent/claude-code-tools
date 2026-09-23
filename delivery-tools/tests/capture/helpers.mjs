// Builders for capture tests: a generic plan for the widgets feature, and a stand-in for the
// committed capture spec that writes each item's files the way templates/ does, from a script of
// what each state "shows".

import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { validExample } from '../helpers/fixtures.mjs';
import { pngBytes } from '../design/helpers.mjs';
import { PASS } from '../../lib/core/gate.mjs';

const row = (id, over = {}) => ({
  id, class: 'new', owner: 'U2', requested: null, invented: false, data: [], backend: [], controls: [], copy: [],
  dayOne: false, invariants: [], ...over,
});

/** A plan with every reach class: seeded, an intercepted action, prop, unseedable, a cut. */
export function widgetsPlan() {
  const plan = validExample('plan');
  plan.worlds = [
    { id: 'design', kind: 'design', orgName: 'Delivery fixture · widgets design', users: [
      { role: 'admin', email: 'delivery+widgets-design-admin@example.invalid' },
      { role: 'member', email: 'delivery+widgets-design-member@example.invalid' },
    ], notes: '' },
    { id: 'empty', kind: 'empty', orgName: 'Delivery fixture · widgets empty', users: [
      { role: 'admin', email: 'delivery+widgets-empty-admin@example.invalid' },
    ], notes: '' },
  ];
  plan.units = [
    { id: 'U1', title: 'Contracts', issue: 102, kind: 'contract', wave: 0, files: ['apps/web/src/widgets/contract.ts'], states: [], capabilities: [], risk: 'high', model: 'opus' },
    { id: 'U2', title: 'Widgets list', issue: 103, kind: 'screen', wave: 1, files: ['apps/web/src/widgets/list.tsx'], states: ['WG-01', 'WG-02', 'WG-03'], capabilities: [], risk: 'normal', model: 'sonnet' },
    { id: 'U3', title: 'Widget refresh', issue: 104, kind: 'screen', wave: 1, files: ['apps/web/src/widgets/refresh.tsx'], states: ['WG-04', 'WG-05', 'WG-06'], capabilities: [], risk: 'normal', model: 'sonnet' },
  ];
  plan.rows = [
    row('WG-01', {
      data: [{ table: 'widgets', column: 'name', exists: true, verifiedBy: 'types' }],
      controls: [
        { label: 'Duplicate', testid: 'widget-duplicate', effect: 'free', target: 'WG-03' },
        { label: 'Delete', testid: 'widget-delete', effect: 'destructive', target: 'none' },
        { label: 'Ring', testid: 'widget-ring', effect: 'dials', target: 'none' },
      ],
      reach: { class: 'seeded', world: 'design', role: 'admin', steps: [{ goto: '/en/widgets' }] },
      markers: { text: ['3 widgets in stock'], testids: ['widget-list'], forbidden: ['No widgets yet'] },
      permission: { member: 'disabled' },
    }),
    row('WG-02', {
      reach: { class: 'seeded', world: 'empty', role: 'admin', steps: [{ goto: '/en/widgets' }] },
      markers: { text: ['No widgets yet'], testids: ['widget-empty'], forbidden: ['widget-list'] },
    }),
    row('WG-03', {
      reach: { class: 'seeded', world: 'design', role: 'admin', steps: [{ goto: '/en/widgets' }, { click: { testid: 'widget-duplicate' } }] },
      markers: { text: ['Copy made'], testids: ['widget-list'], forbidden: [] },
    }),
    row('WG-04', {
      reach: { class: 'action', world: 'design', role: 'admin', steps: [{ goto: '/en/widgets' }, { click: { testid: 'widget-refresh' } }], intercept: { method: 'POST', url: '/api/refresh', status: 500, body: '{"error":"down"}' } },
      markers: { text: ['Refresh failed'], testids: [], forbidden: [] },
    }),
    row('WG-05', {
      reach: { class: 'prop', world: 'design', role: 'admin', steps: [], test: { file: 'apps/web/src/widgets/x.test.tsx', name: 'x' } },
      markers: { text: ['Syncing'], testids: [], forbidden: [] },
    }),
    row('WG-06', {
      reach: { class: 'unseedable', world: 'design', role: 'admin', steps: [], why: 'needs-live-call', test: { file: 'apps/web/src/widgets/y.test.tsx', name: 'y' } },
      markers: { text: ['On a call'], testids: [], forbidden: [] },
    }),
    row('WG-07', { class: 'cut', owner: null, reason: { code: 'money', text: 'paid per use' }, issue: 105, scopeLine: 'S1' }),
  ];
  plan.scope = [{ line: 'S1', rows: ['WG-07'], kind: 'cut-requested', text: 'Cut WG-07.', default: 'cut', appliesAtWave: 1, reply: null }];
  return plan;
}

/** A minimal, schema-valid dom.json for these lines and test ids. */
export function domFor(lines, testids = []) {
  const style = { fontFamily: 'sans-serif', fontClass: 'sans', fontSize: 14, fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'rgb(0, 0, 0)', backgroundColor: 'rgb(255, 255, 255)' };
  const el = (i, text, testid) => ({ i, kind: 'text', tag: 'div', role: null, name: null, text, testid, box: { x: 0, y: i * 20, w: 100, h: 20 }, visible: true, style, icon: false, clipped: false, lines: 1, disabled: null });
  const elements = [...lines.map((t, i) => el(i, t, null)), ...testids.map((id, k) => el(lines.length + k, '', id))];
  return { schemaVersion: 1, url: 'https://app.example.invalid/', viewport: { width: 1440, height: 900 }, document: { scrollWidth: 1440, clientWidth: 1440, scrollHeight: 900 }, fonts: [{ family: 'sans-serif', loaded: true }], elements };
}

/**
 * Write one item's files as the committed spec would.
 * @param {string} dir
 * @param {string} key
 * @param {{ lines?: string[], testids?: string[], servedSha?: string|null, console?: object[], requests?: object[],
 *           createdRows?: object[], error?: string|null, skip?: boolean, controls?: object[] }} s
 */
export function writeItem(dir, key, s) {
  if (s.skip) return;
  mkdirSync(dir, { recursive: true });
  const meta = { key, state: key.split('.')[0], startedAt: '2026-01-15T20:00:00.000Z', finishedAt: '2026-01-15T20:00:01.000Z', finalUrl: 'https://app.example.invalid/en/widgets', servedSha: s.servedSha ?? null, versionStatus: 200, steps: [], error: s.error ?? null, createdRows: s.createdRows ?? [], axe: 'not-installed' };
  writeFileSync(join(dir, `${key}.meta.json`), JSON.stringify(meta));
  writeFileSync(join(dir, `${key}.errors.json`), JSON.stringify({ schemaVersion: 1, console: s.console ?? [], requests: s.requests ?? [], perf: { requestCount: 3, loadMs: 120 }, axe: null }));
  if (s.error && !s.lines) return;
  const lines = s.lines ?? [];
  writeFileSync(join(dir, `${key}.txt`), lines.length ? `${lines.join('\n')}\n` : '');
  writeFileSync(join(dir, `${key}.dom.json`), JSON.stringify(domFor(lines, s.testids ?? [])));
  writeFileSync(join(dir, `${key}.png`), pngBytes());
  if (s.controls) writeFileSync(join(dir, `${key}.controls.json`), JSON.stringify(s.controls));
}

/** What each state shows in the widgets app when everything works, by state id. */
export const GOOD = Object.freeze({
  'WG-01': { lines: ['Widgets', '3 widgets in stock', 'Blue widget', 'Duplicate'], testids: ['widget-list'] },
  'WG-02': { lines: ['Widgets', 'No widgets yet'], testids: ['widget-empty'] },
  'WG-03': { lines: ['Widgets', 'Copy made', '4 widgets in stock'], testids: ['widget-list'] },
  'WG-04': { lines: ['Widgets', 'Refresh failed', 'Try again'], testids: [], requests: [{ method: 'POST', url: 'https://app.example.invalid/api/refresh', status: 500, failure: null, intercepted: true, aborted: false }] },
});

/**
 * A runner rule standing in for `<heavy> <e2e> <capture spec>`: reads the job from the call's env
 * and writes every item, by `show(item)` (return an item script; default GOOD by state).
 */
export function captureRule(show = () => null, opts = {}) {
  return {
    match: (call, text) => text.includes('delivery-capture.spec.ts'),
    result: (call) => {
      const job = JSON.parse(readFileSync(call.env.DELIVERY_CAPTURE_JOB, 'utf8'));
      opts.seen?.push(job);
      for (const it of job.items) {
        const s = show(it, job) ?? { ...(GOOD[it.state] ?? { lines: [`${it.state} page`] }) };
        writeItem(job.outDir, it.key, { servedSha: job.expectedSha, ...s });
      }
      return { code: opts.code ?? 0, stdout: '', stderr: opts.stderr ?? '' };
    },
  };
}

/** Cross-slice hooks for captureRun, all green unless overridden; calls are recorded. */
export function hooks(over = {}) {
  const calls = { refresh: [], scan: 0, teardown: [], preview: [] };
  return {
    calls,
    hooks: {
      resolvePreview: async (ctx, { sha }) => { calls.preview.push(sha); return { url: 'https://preview.example.invalid', pending: false, detail: 'stub' }; },
      refreshWorld: async (ctx, w) => { calls.refresh.push(w); return PASS; },
      seedScanGate: async () => { calls.scan++; return PASS; },
      teardownRows: async (ctx, rows) => { calls.teardown.push(rows); return PASS; },
      probeServedSha: async () => null,
      ...over,
    },
  };
}

/** Write the plan (and optionally a unit file) into a repo's run paths. */
export function writePlan(repo, plan, feature = 'widgets') {
  const p = join(repo.dir, 'docs/delivery', feature, 'plan.json');
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(plan, null, 2));
}
