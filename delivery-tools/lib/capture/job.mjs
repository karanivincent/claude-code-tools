// The capture job file (spec 9, 6.1, 6.2): which states to capture, in which world, as whom, at
// which widths, locales and themes, and how to reach each one. The CLI writes it; the committed
// capture spec (templates/delivery-capture.spec.ts) reads it and writes one set of files per item.
// Pure: every function here takes plain data.
//
// Job (captures/<runId>/job.json):
//   { schemaVersion: 1, runId, mode, feature, baseUrl, expectedSha, outDir, extractScript,
//     versionProbe: { method, path }, auth: { module, fn }, webServer: WebServer|null,
//     settleMs, items: JobItem[], targets: { [stateId]: { text: string[], testids: string[] } } }
// JobItem:
//   { key, state, world, role, email, width, height, locale, theme, readOnly, check, steps,
//     intercept, clicks, controls, axe }
//   check: "markers" (the state's own world: markers are validated), "permission" (a member
//   variant for M9's permission rule: no marker rule), "none" (real organisation: M7, M10, M12 only)
// Files the spec writes per item, named <key>.<ext>: png, txt, dom.json, errors.json (capture-errors
// schema), meta.json, and controls.json when the item clicks its controls (M9).

export const REAL_ORG_WORLD = 'real-org';
export const BASELINE_WORLD = 'baseline';
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
export const MODES = Object.freeze(['baseline', 'branch', 'wave', 'full', 'staging', 'real-org']);
// The modes that add a member variant of every permission row (below). M9's member-not-captured
// rule reads the same set: a mode that never adds the variant must not be judged for missing it.
export const MEMBER_VARIANT_MODES = Object.freeze(new Set(['wave', 'full', 'staging']));

/**
 * The file-name key of one capture item.
 * @param {{ state: string, world: string, role: string, width: number, locale: string, theme: string }} i
 */
export function itemKey(i) {
  return `${i.state}.${i.world}.${i.role}.${i.width}.${i.locale}.${i.theme}`;
}

/** "GET /api/version" (or a bare path) as { method, path }. */
export function parseVersionProbe(probe) {
  const m = /^\s*(GET|HEAD|POST)\s+(\S+)\s*$/i.exec(String(probe ?? ''));
  if (m) return { method: m[1].toUpperCase(), path: m[2] };
  const s = String(probe ?? '').trim();
  return s ? { method: 'GET', path: s } : null;
}

/** Every locale the profile ships (its message files), primary first. */
export function profileLocales(profile) {
  const primary = profile.audit.primaryLocale;
  const all = (profile.paths.messages ?? []).map((m) => m.locale);
  return [primary, ...all.filter((l) => l !== primary)];
}

/**
 * Rewrite a leading locale segment of an app path for another locale: /en/x becomes /fr/x.
 * Paths with no known locale segment are left alone.
 */
export function localisePath(path, locale, known) {
  const m = /^\/([a-z]{2}(?:-[A-Z]{2})?)(\/|$|\?)/.exec(path);
  if (!m || !known.includes(m[1]) || m[1] === locale) return path;
  return `/${locale}${path.slice(1 + m[1].length)}`;
}

function localiseSteps(steps, locale, known) {
  return steps.map((s) => ('goto' in s ? { goto: localisePath(s.goto, locale, known) } : s));
}

/**
 * Which rule set judges a captured item, recomputed from the plan (never read back from the job):
 * the state's own world and role are judged by its markers; a member variant only for M9; the real
 * organisation and today's pages (baseline) are captured, not judged against markers.
 * @param {{ world: string, role: string }} item
 * @param {string} mode
 * @param {object|undefined} row the plan row of item.state
 * @returns {'markers'|'permission'|'none'}
 */
export function checkFor(item, mode, row) {
  if (mode === 'baseline' || item.world === REAL_ORG_WORLD || item.world === BASELINE_WORLD) return 'none';
  if (row?.reach && row.reach.world !== item.world) return 'none'; // the same screen on another world's data
  if (row?.reach && row.reach.role !== item.role) return 'permission';
  return 'markers';
}

/** Whether a plan row is captured by a browser (spec 6.1): seeded, or an action with an intercept. */
export function capturable(row) {
  if (!row.reach || row.class === 'cut' || row.class === 'remove') return false;
  return row.reach.class === 'seeded' || (row.reach.class === 'action' && Boolean(row.reach.intercept));
}

function whyNotCaptured(row) {
  if (!row.reach) return 'no reach in the plan';
  if (row.class === 'cut' || row.class === 'remove') return `class ${row.class}`;
  if (row.reach.class === 'action') return 'an action with no intercept: verified by a component render test';
  return `${row.reach.class}: verified by a component render test${row.reach.why ? ` (${row.reach.why})` : ''}`;
}

/**
 * Whether the plan says `targetId` is one step from `row`: same world and role, and one list of
 * reach steps a prefix of the other (forwards for the control that opens it, backwards for the
 * one that closes it). Anything else is reached another way, and its markers describe that way.
 * @param {object} plan
 * @param {object} row the state the control is clicked in
 * @param {string} targetId
 */
export function oneStepApart(plan, row, targetId) {
  const target = (plan.rows ?? []).find((r) => r.id === targetId);
  if (!target?.reach || !row?.reach) return false;
  if (target.reach.world !== row.reach.world || target.reach.role !== row.reach.role) return false;
  const a = row.reach.steps ?? [];
  const b = target.reach.steps ?? [];
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (long.length - short.length > 1) return false;
  return short.every((s, i) => JSON.stringify(s) === JSON.stringify(long[i]));
}

/** Test ids the plan says a member does not see: a control's own rule first, then its row's. */
export function hiddenFromMembers(plan) {
  const out = new Set();
  for (const r of plan?.rows ?? []) {
    for (const c of r.controls ?? []) {
      if (c.testid && (c.permission?.member ?? r.permission?.member) === 'hidden') out.add(c.testid);
    }
  }
  return out;
}

/** Whether these reach steps address something by what it says, rather than by structure. */
export function stepsNameTheirData(steps) {
  return (steps ?? []).some((s) => Boolean(s.click?.name) || Boolean(s.waitFor?.text) || Boolean(s.type?.text));
}

function userOf(plan, world, role) {
  const w = plan.worlds.find((x) => x.id === world);
  return w?.users.find((u) => u.role === role)?.email ?? null;
}

/**
 * The widths, locales and themes of a mode (spec 9).
 * @param {string} mode
 * @param {object} profile
 */
export function modeMatrix(mode, profile) {
  const widths = profile.audit.widths.length ? profile.audit.widths : [1440];
  const primary = profile.audit.primaryLocale;
  const light = profile.audit.themes.includes('light') ? 'light' : profile.audit.themes[0];
  if (mode === 'branch') return { widths: [widths[0]], locales: [primary], themes: [light] };
  if (mode === 'full') return { widths, locales: profileLocales(profile), themes: profile.audit.themes };
  return { widths, locales: [primary], themes: [light] };
}

/**
 * Build the job's items.
 * @param {{ mode: string, profile: object, plan?: object|null, baseline?: object|null, realOrg?: { observerEmail: string, role: string }|null,
 *           unit?: { states: string[], capabilities: string[] }|null, states?: string[]|null, smoke?: boolean, height?: number,
 *           appLocalePrefix?: boolean }} o
 * @returns {{ items: object[], skipped: { state: string, why: string }[], targets: Record<string, { text: string[], testids: string[] }> }}
 */
export function buildItems(o) {
  const { mode, profile } = o;
  const plan = o.plan ?? null;
  const height = o.height ?? 900;
  const { widths, locales, themes } = modeMatrix(mode, profile);
  const primary = profile.audit.primaryLocale;
  const known = profileLocales(profile);
  const items = [];
  const skipped = [];
  const targets = {};
  const wanted = o.states ? new Set(o.states) : null;
  const clickModes = new Set(['branch', 'wave', 'full']);
  const realOrgModes = new Set(['baseline', 'full', 'staging', 'real-org']);

  let rows = [];
  if (plan) {
    rows = plan.rows;
    for (const r of rows) if (r.markers) targets[r.id] = { text: r.markers.text, testids: r.markers.testids };
    if (o.unit) {
      const mine = new Set([...(o.unit.states ?? []), ...(o.unit.capabilities ?? [])]);
      rows = rows.filter((r) => mine.has(r.id));
    }
    if (mode === 'baseline') rows = rows.filter((r) => ['keep', 'change', 'migrate', 'remove'].includes(r.class) || /^CAP-/.test(r.id));
  }
  if (wanted) rows = rows.filter((r) => wanted.has(r.id));

  const add = (it) => items.push({ ...it, key: itemKey(it) });

  if (plan && mode !== 'real-org') {
    const seenWorldRole = new Set();
    for (const row of rows) {
      if (!capturable(row) && !(mode === 'baseline' && row.reach && row.class === 'remove' && row.reach.class === 'seeded')) {
        skipped.push({ state: row.id, why: whyNotCaptured(row) });
        continue;
      }
      const { world, role } = row.reach;
      if (o.smoke) {
        const k = JSON.stringify([world, role]);
        if (seenWorldRole.has(k)) continue;
        seenWorldRole.add(k);
      }
      const email = userOf(plan, world, role);
      if (!email) { skipped.push({ state: row.id, why: `world ${world} has no ${role} user in the plan` }); continue; }
      // A control is always clicked; its target's markers are required only where the plan itself
      // says that target is one step from here (or a state on the way here, for a Close). A target
      // reached another way describes another page: its own world's rows, or the pane it was drawn
      // over. Asking the empty world for the design world's three widgets after a click, or the
      // settings pane for the list behind the dialog it just opened, is asking for something no
      // component can show.
      const controls = (row.controls ?? [])
        .filter((c) => (c.effect === 'none' || c.effect === 'free') && c.testid)
        // The control keeps the target the plan gives it, and says separately whether this run can
        // judge arriving there. Blanking the target instead wrote "leads nowhere" into the record,
        // and two auditors read it back as a dead control.
        .map((c) => (oneStepApart(plan, row, c.target) ? c : { ...c, verifyTarget: false }));
      for (const width of o.smoke ? [widths[0]] : widths) {
        for (const locale of o.smoke ? [primary] : locales) {
          for (const theme of o.smoke ? [themes[0]] : themes) {
            const first = width === widths[0] && locale === primary && theme === themes[0];
            add({
              state: row.id, world, role, email, width, height, locale, theme,
              // today's page (baseline) predates the plan's markers: it is captured, not judged
              readOnly: mode === 'baseline', check: mode === 'baseline' ? 'none' : 'markers',
              steps: localiseSteps(row.reach.steps, locale, known),
              intercept: row.reach.intercept ?? null,
              clicks: first && !o.smoke && clickModes.has(mode) && controls.length > 0,
              controls: first && !o.smoke && clickModes.has(mode) ? controls : [],
              axe: width >= 1024,
            });
          }
        }
      }
      // M9: a member sees each control as the plan's permission says.
      if (!o.smoke && MEMBER_VARIANT_MODES.has(mode) && row.permission && role === 'admin' && profile.audit.roles.includes('member')) {
        const member = userOf(plan, world, 'member');
        // A state an admin reaches by clicking a control a member does not have is a state no
        // member can be taken to: the plan says so itself, in the row that hides the control.
        const shut = [...hiddenFromMembers(plan)].find((t) => (row.reach.steps ?? []).some((st) => st.click?.testid === t));
        if (shut) skipped.push({ state: row.id, why: `member check: reaching it clicks "${shut}", which the plan hides from a member` });
        else if (member) {
          add({
            state: row.id, world, role: 'member', email: member, width: widths[0], height, locale: primary, theme: themes[0],
            // what the member sees of each control is read from dom.json; nothing is clicked
            readOnly: false, check: 'permission', steps: row.reach.steps, intercept: row.reach.intercept ?? null,
            clicks: false, controls: [], axe: false,
          });
        } else skipped.push({ state: row.id, why: `member check: world ${world} has no member user` });
      }
      // The messy world seeds the same shapes on purpose, so a row's invariants are also checked on
      // data the suite controls (spec 9, M12): the row again, in each messy world, judged as data.
      if (!o.smoke && row.invariants?.length && ['wave', 'full', 'staging'].includes(mode)) {
        // Steps that name their own world's data cannot be replayed in another world: a click on
        // "Blue widget 4 left" finds nothing in a world seeded with a nameless widget and a
        // negative stock. Ids were already excluded; what a row SAYS is just as much its world's.
        const fixtureIds = row.reach.steps.some((s) => Object.values(s).some((v) => UUID.test(JSON.stringify(v))))
          || stepsNameTheirData(row.reach.steps);
        for (const m of plan.worlds.filter((w) => w.kind === 'messy' && w.id !== world)) {
          const email = userOf(plan, m.id, role);
          if (fixtureIds) { skipped.push({ state: row.id, why: `messy world ${m.id}: the steps name the ${world} world's own ids` }); continue; }
          if (!email) { skipped.push({ state: row.id, why: `messy world ${m.id} has no ${role} user` }); continue; }
          add({
            state: row.id, world: m.id, role, email, width: widths[0], height, locale: primary, theme: themes[0],
            readOnly: false, check: 'none', steps: row.reach.steps, intercept: row.reach.intercept ?? null,
            clicks: false, controls: [], axe: false,
          });
        }
      }
    }
  }

  // Before a plan exists, a baseline captures today's routes as the repo's robots, read-only.
  if (mode === 'baseline' && !plan && o.baseline) {
    const robots = [['admin', profile.auth.robotAdminEmail], ['member', profile.auth.robotMemberEmail]].filter(([r, e]) => e && profile.audit.roles.includes(r));
    for (const cap of o.baseline.capabilities.filter((c) => c.kind === 'route')) {
      if (wanted && !wanted.has(cap.id)) continue;
      const path = cap.signature.replace(/^route:/, '');
      if (/\[[^\]]+\]/.test(path)) { skipped.push({ state: cap.id, why: `dynamic route ${path} needs an id` }); continue; }
      const goto = o.appLocalePrefix ? `/${primary}${path.startsWith('/') ? '' : '/'}${path}` : path;
      for (const [role, email] of robots) {
        for (const width of widths) {
          add({
            state: cap.id, world: BASELINE_WORLD, role, email, width, height, locale: primary, theme: themes[0],
            readOnly: true, check: 'none', steps: [{ goto }], intercept: null, clicks: false, controls: [], axe: width >= 1024,
          });
        }
      }
    }
  }

  // The founder's organisation, read-only (spec 9): each distinct route the plan reaches without
  // a fixture's own ids, captured by URL alone; no control is clicked.
  if (o.realOrg && realOrgModes.has(mode) && !o.smoke) {
    const routes = new Map();
    const source = plan ? rows.filter((r) => capturable(r)) : [];
    for (const row of source) {
      const goto = row.reach.steps.find((s) => 'goto' in s)?.goto;
      if (!goto || UUID.test(goto) || /[{}[\]]/.test(goto) || routes.has(goto)) continue;
      routes.set(goto, row.id);
    }
    if (mode === 'baseline' && !plan) {
      for (const it of items.filter((i) => i.role === 'admin')) {
        const goto = it.steps[0].goto;
        if (!routes.has(goto)) routes.set(goto, it.state);
      }
    }
    const orgWidths = mode === 'real-org' ? [widths[0]] : widths;
    for (const [goto, state] of routes) {
      for (const width of orgWidths) {
        add({
          state, world: REAL_ORG_WORLD, role: o.realOrg.role, email: o.realOrg.observerEmail, width, height,
          locale: primary, theme: themes[0], readOnly: true, check: 'none', steps: [{ goto }], intercept: null,
          clicks: false, controls: [], axe: width >= 1024,
        });
      }
    }
  }
  return { items, skipped, targets };
}

/**
 * The job object the capture spec reads.
 * @param {object} o
 */
export function buildJob(o) {
  return {
    schemaVersion: 1,
    runId: o.runId,
    mode: o.mode,
    feature: o.feature,
    baseUrl: o.baseUrl,
    expectedSha: o.expectedSha,
    outDir: o.outDir,
    extractScript: o.extractScript,
    versionProbe: o.versionProbe,
    auth: o.auth,
    webServer: o.webServer ?? null,
    settleMs: o.settleMs ?? 300,
    items: o.items,
    targets: o.targets ?? {},
  };
}

/** A new capture run id: c-YYYYMMDD-HHMMSS-<mode>[-<suffix>] (s- for a spot recapture). */
export function newCaptureRunId(clock, mode, suffix = null, prefix = 'c') {
  const iso = clock.now().toISOString();
  const stamp = `${iso.slice(0, 10).replace(/-/g, '')}-${iso.slice(11, 19).replace(/:/g, '')}`;
  return [prefix, stamp, mode, suffix].filter(Boolean).join('-').replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 64);
}
