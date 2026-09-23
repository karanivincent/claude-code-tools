// What every check reads, loaded once per runChecks: the profile, the plan, the inventory, the
// capture run and its files. Files are read lazily and cached; a missing file is null, never a
// crash, so one absent log does not stop the other checks.

import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { readArtefact } from '../core/artefacts.mjs';
import { readJson } from '../core/fs.mjs';
import { loadState } from '../core/state.mjs';
import { validateAgainst } from '../core/schema.mjs';
import { makeFinding } from '../core/findings.mjs';
import { DeliveryError } from '../core/exit.mjs';
import { flattenMessages } from './icu.mjs';
import { applySeverityPolicy, floorOf, rowsById } from './severity.mjs';
import { latestCaptureRun } from '../capture/validate.mjs';

/** The world id capture items of the founder's organisation carry (spec 9, M12). */
export const REAL_ORG = 'real-org';

/**
 * @typedef {object} ItemEnv
 * @property {object} item            the capture.json item
 * @property {string} key             state.world.role.width.locale.theme
 * @property {() => Promise<string|null>} txt
 * @property {() => Promise<object|null>} dom
 * @property {() => Promise<object|null>} errors
 */

/** The newest capture run on disk (by capture.json modification time), or null. */
export async function newestCaptureRun(paths, { mode } = {}) {
  let names;
  try { names = await readdir(paths.captures); } catch { return null; }
  let best = null;
  for (const n of names) {
    const file = join(paths.captures, n, 'capture.json');
    let s;
    try { s = await stat(file); } catch { continue; }
    if (mode) {
      const doc = await readJson(file, { optional: true }).catch(() => null);
      if (doc?.mode !== mode) continue;
    }
    if (!best || s.mtimeMs > best.t || (s.mtimeMs === best.t && n > best.n)) best = { n, t: s.mtimeMs };
  }
  return best?.n ?? null;
}

/**
 * The capture run to check: the one named, else the newest (slice C's latestCaptureRun, or a scan
 * of captures/ while that is not built).
 */
export async function resolveCaptureRun(ctx, paths, runId) {
  if (runId) return runId;
  try { return await latestCaptureRun(ctx, {}); } catch (err) {
    if (err?.code !== 'not-implemented') throw err;
  }
  return newestCaptureRun(paths);
}

async function lazyText(path) {
  try { return await readFile(path, 'utf8'); } catch { return null; }
}
async function lazyJson(path, schema) {
  const t = await lazyText(path);
  if (t === null) return null;
  try {
    const v = JSON.parse(t);
    return schema && !validateAgainst(schema, v).ok ? null : v;
  } catch { return null; }
}

/**
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {{ captureRunId?: string|null, needsCapture?: boolean }} [opts]
 */
export async function loadCheckEnv(ctx, opts = {}) {
  const paths = ctx.requirePaths();
  const profile = await ctx.profile();
  const plan = await readArtefact(paths, 'plan', { optional: true });
  const inventory = await readArtefact(paths, 'inventory', { optional: true });
  let state = null;
  try { state = await loadState(paths.state, { optional: true }); } catch (err) { if (!(err instanceof DeliveryError)) throw err; }
  const rows = rowsById(plan);
  const screens = new Map((inventory?.states ?? []).map((s) => [s.id, s.screen]));
  const worldKinds = new Map((plan?.worlds ?? []).map((w) => [w.id, w.kind]));
  const worldOrder = (plan?.worlds ?? []).map((w) => w.id);
  const roleOrder = profile.audit?.roles ?? ['admin', 'member'];
  const primaryLocale = profile.audit?.primaryLocale ?? 'en';

  let capture = null;
  if (opts.needsCapture !== false) {
    const runId = await resolveCaptureRun(ctx, paths, opts.captureRunId ?? null);
    if (runId) {
      const doc = await readArtefact(paths, 'capture', { key: runId });
      const dir = paths.captureDir(runId);
      const cache = new Map();
      const once = (k, fn) => { if (!cache.has(k)) cache.set(k, fn()); return cache.get(k); };
      const items = doc.items.map((item) => ({
        item,
        key: [item.state, item.world, item.role, item.width, item.locale, item.theme].join('.'),
        txt: () => once(`t:${item.files.txt}`, () => lazyText(join(dir, item.files.txt))),
        dom: () => once(`d:${item.files.dom}`, () => lazyJson(join(dir, item.files.dom), 'dom')),
        errors: () => (item.files.errors ? once(`e:${item.files.errors}`, () => lazyJson(join(dir, item.files.errors), 'capture-errors')) : Promise.resolve(null)),
      }));
      const order = (i) => [
        -i.item.width,
        i.item.theme === 'light' ? 0 : 1,
        roleOrder.indexOf(i.item.role) < 0 ? 99 : roleOrder.indexOf(i.item.role),
        worldOrder.indexOf(i.item.world) < 0 ? 99 : worldOrder.indexOf(i.item.world),
        i.item.locale === primaryLocale ? '' : i.item.locale,
      ];
      items.sort((a, b) => {
        const x = order(a), y = order(b);
        for (let k = 0; k < x.length; k++) if (x[k] !== y[k]) return x[k] < y[k] ? -1 : 1;
        return a.key.localeCompare(b.key);
      });
      capture = { runId, dir, doc, items };
    }
  }

  let namespaces;
  const env = {
    ctx, paths, profile, plan, inventory, state, rows, capture, primaryLocale,
    feature: paths.feature,
    runId: state?.runId ?? `run-${paths.feature}`,
    /** Screen group of a state: its inventory screen, else its id prefix. */
    groupOf: (id) => screens.get(id) ?? String(id).split('-')[0],
    worldKind: (id) => worldKinds.get(id) ?? (id === REAL_ORG ? REAL_ORG : null),
    /** An item of the founder's organisation: world "real-org", or any item of a real-org run. */
    isRealOrg: (item) => item.world === REAL_ORG || capture?.doc.mode === REAL_ORG,
    /** Top-level namespaces of the primary message file, or null when it cannot be read. */
    async namespaces() {
      if (namespaces !== undefined) return namespaces;
      const m = (profile.paths?.messages ?? []).find((x) => x.locale === primaryLocale) ?? profile.paths?.messages?.[0];
      const text = m ? await lazyText(join(paths.repoRoot, m.file)) : null;
      try { namespaces = text ? new Set(Object.keys(JSON.parse(text))) : null; } catch { namespaces = null; }
      return namespaces;
    },
    /** A design render's text and dom (null when absent). */
    async design(stateId) {
      const [txt, dom] = await Promise.all([lazyText(paths.designRender(stateId, 'txt')), lazyJson(paths.designRender(stateId, 'dom.json'), 'dom')]);
      return { txt, dom };
    },
    /**
     * A finding of this check with its rule's severity, day-one raise and screen group.
     * @param {string} check "M7"
     * @param {{ rule: string, state: string, where: string, design?: string, live?: string, cause?: string, evidence?: string, severity?: string }} f
     */
    finding(check, f) {
      const severity = f.severity ?? floorOf({ source: `check:${check}`, rule: f.rule }) ?? 'P2';
      return applySeverityPolicy(makeFinding({ source: `check:${check}`, group: env.groupOf(f.state), ...f, severity }), rows);
    },
  };
  return env;
}

/** Every string key of a message object (for tests and M8 over a namespace). */
export function messageKeys(messages, prefix) {
  const root = prefix ? prefix.split('.').reduce((o, k) => o?.[k], messages) : messages;
  return flattenMessages(root, prefix ?? '').filter(([, v]) => typeof v === 'string').map(([k]) => k);
}
