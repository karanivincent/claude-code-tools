// The button map (picture mode): every designed state, how the capture reaches it, its buttons and
// the state each button opens. A mapper agent writes docs/delivery/<feature>/map.json from the
// design renders; this module checks it and renders the checklist builders and reviewers read.
// Pure, except readMap and designIds, which read files.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WIDTHS, WIDTH_NAMES, designFileCandidates, designFor, mapWidths, stateWidths } from './widths.mjs';

export const MAP_FILE = 'map.json';
export const CHECKLIST_FILE = 'checklist.md';
export const EFFECTS = Object.freeze(['none', 'free', 'metered', 'dials', 'destructive']);
const SAFE_TO_CLICK = new Set(['none', 'free']);
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const STEP_KINDS = ['goto', 'click', 'type', 'open'];

/** @param {{ deliveryDir: string }} paths */
export function mapPath(paths) { return join(paths.deliveryDir, MAP_FILE); }
/** @param {{ deliveryDir: string }} paths */
export function checklistPath(paths) { return join(paths.deliveryDir, CHECKLIST_FILE); }

/** @param {{ deliveryDir: string }} paths @returns {object|null} */
export function readMap(paths) {
  const p = mapPath(paths);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
}

/** Design renders in the run's design folder, by file name less ".png": "<ID>" and "<ID>@phone". */
export function designIds(paths) {
  if (!paths.designRenders || !existsSync(paths.designRenders)) return new Set();
  return new Set(readdirSync(paths.designRenders).filter((f) => f.endsWith('.png')).map((f) => f.slice(0, -4)));
}

/** The test ids a step addresses. */
function stepTestid(step) {
  for (const k of ['click', 'type', 'open']) if (step[k]?.testid) return step[k].testid;
  return null;
}

/** Whether a button's test id is the one a step addresses: equal, or the step's id plus "-<n>". */
export function sameControl(buttonTestid, stepTestid) {
  if (!buttonTestid || !stepTestid) return false;
  return stepTestid === buttonTestid || new RegExp(`^${buttonTestid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d+$`).test(stepTestid);
}

/** Whether a state's design field has a shape the map allows. */
function designShapeOk(d) {
  if (d === undefined || d === false) return true;
  if (typeof d === 'string') return ID.test(d);
  if (!d || typeof d !== 'object' || Array.isArray(d)) return false;
  return Object.entries(d).every(([k, v]) => ['desktop', 'phone'].includes(k) && (v === false || (typeof v === 'string' && ID.test(v))));
}

/**
 * Check a map. Returns one plain sentence per problem; an empty list is a valid map.
 * @param {object} map
 * @param {{ designed?: Set<string> }} [opts] designed: ids with a design render
 * @returns {string[]}
 */
export function validateMap(map, opts = {}) {
  const problems = [];
  if (!map || typeof map !== 'object') return ['map.json is not an object'];
  if (map.schemaVersion !== 1) problems.push('schemaVersion must be 1');
  if (!['redesign', 'new'].includes(map.kind)) problems.push('kind must be "redesign" or "new"');
  if (typeof map.route !== 'string' || !map.route.startsWith('/')) problems.push('route must be a path starting with /');
  const area = map.pageArea ?? {};
  for (const k of ['left', 'designLeft']) {
    if (area[k] !== undefined && !(Number.isInteger(area[k]) && area[k] >= 0)) problems.push(`pageArea.${k} must be a whole number of pixels`);
  }
  if (area.phone !== undefined) {
    if (!area.phone || typeof area.phone !== 'object') problems.push('pageArea.phone must be an object like { "left": 0 }');
    else for (const k of ['left', 'designLeft']) {
      if (area.phone[k] !== undefined && !(Number.isInteger(area.phone[k]) && area.phone[k] >= 0)) problems.push(`pageArea.phone.${k} must be a whole number of pixels`);
    }
  }
  const widthProblem = (list, where) => {
    if (!Array.isArray(list) || !list.length) return `${where} must be a list of widths, such as ["desktop", "phone"]`;
    const bad = list.filter((w) => !WIDTH_NAMES.includes(w));
    if (bad.length) return `${where} names ${bad.map((w) => `"${w}"`).join(', ')}; use ${WIDTH_NAMES.join(' or ')}`;
    if (new Set(list).size !== list.length) return `${where} lists a width twice`;
    return null;
  };
  if (map.widths !== undefined) { const p = widthProblem(map.widths, 'widths'); if (p) problems.push(p); }
  const declared = mapWidths(map);

  const worlds = new Map();
  for (const w of map.worlds ?? []) {
    if (!ID.test(String(w.id ?? ''))) { problems.push(`world id "${w.id}" is not a valid id`); continue; }
    if (worlds.has(w.id)) problems.push(`world ${w.id} is listed twice`);
    worlds.set(w.id, new Set((w.users ?? []).map((u) => u.role)));
    for (const u of w.users ?? []) {
      if (!u.role || !u.email) problems.push(`world ${w.id} has a user without a role or an email`);
    }
  }

  const states = map.states ?? [];
  if (!Array.isArray(states) || !states.length) problems.push('states is empty');
  const ids = new Set();
  for (const s of states) {
    if (!ID.test(String(s.id ?? ''))) { problems.push(`state id "${s.id}" is not a valid id`); continue; }
    if (ids.has(s.id)) problems.push(`state ${s.id} is listed twice`);
    ids.add(s.id);
  }
  const designed = opts.designed ?? null;
  if (designed) {
    // A picture is covered by the state of that id, or by a state whose design names it (a
    // separate mobile frame, or another design state). "<ID>@phone" is <ID> rendered narrow.
    const referenced = new Set(ids);
    for (const s of states) {
      for (const w of WIDTH_NAMES) { const d = designShapeOk(s.design) ? designFor(s, w) : null; if (d) referenced.add(d.id); }
    }
    const seen = new Set();
    for (const pic of designed) {
      const base = pic.replace(/@[a-z]+$/, '');
      if (seen.has(base)) continue;
      seen.add(base);
      if (!referenced.has(base)) problems.push(`design state ${base} has a picture but no entry in the map`);
    }
  }
  const phoneRendered = designed ? [...designed].some((p) => p.endsWith('@phone')) : false;

  for (const s of states) {
    if (!ids.has(s.id)) continue;
    const where = `state ${s.id}`;
    if (!s.screen || !s.name) problems.push(`${where} needs a screen and a name`);
    let widths = declared;
    if (s.widths !== undefined) {
      const p = widthProblem(s.widths, `${where} widths`);
      if (p) problems.push(p);
      else {
        const extra = s.widths.filter((w) => !declared.includes(w));
        if (extra.length) problems.push(`${where} is checked at ${extra.join(', ')}, which the map's widths do not declare`);
        else widths = stateWidths(s, map);
      }
    }
    if (!designShapeOk(s.design)) {
      problems.push(`${where} design must be false, a design state id, or { "desktop": <id or false>, "phone": <id or false> }`);
    } else {
      const phoneFrame = s.design && typeof s.design === 'object' ? s.design.phone : undefined;
      if (typeof phoneFrame === 'string' && designed && !designed.has(phoneFrame) && !designed.has(`${phoneFrame}@phone`)) problems.push(`${where} design.phone names ${phoneFrame}, which has no design picture`);
      if (designed && widths.includes('desktop') && designFor(s, 'desktop') && !designFileCandidates(s, 'desktop').some((f) => designed.has(f.slice(0, -4)))) {
        problems.push(`${where} has no design picture (set "design": false for a state the design never drew)`);
      }
      // Phone pictures are checked once the phone is rendered: before that, status asks for the render.
      if (phoneRendered && widths.includes('phone') && designFor(s, 'phone') && !designFileCandidates(s, 'phone').some((f) => designed.has(f.slice(0, -4)))) {
        problems.push(`${where} has no phone design picture (render it with design render --width phone, point "design": { "phone": "<id>" } at a mobile frame, or set "design": { "phone": false })`);
      }
    }
    const buttons = s.buttons ?? [];
    for (const b of buttons) {
      if (!b.label && !b.testid) problems.push(`${where} has a button with neither a label nor a test id`);
      if (b.effect && !EFFECTS.includes(b.effect)) problems.push(`${where} button "${b.label ?? b.testid}" has effect "${b.effect}"; use one of ${EFFECTS.join(', ')}`);
      if (b.opens && !ids.has(b.opens)) problems.push(`${where} button "${b.label ?? b.testid}" opens ${b.opens}, which is not a state in the map`);
      if (b.member && !['hidden', 'shown'].includes(b.member)) problems.push(`${where} button "${b.label ?? b.testid}" member must be "hidden" or "shown"`);
      if (b.phone !== undefined && !['hidden', 'shown'].includes(b.phone)) problems.push(`${where} button "${b.label ?? b.testid}" phone must be "hidden" or "shown"`);
    }
    const reach = s.reach;
    if (!reach) { problems.push(`${where} has no reach`); continue; }
    if (reach.test) {
      if (typeof reach.test !== 'string') problems.push(`${where} reach.test must name the test that renders it`);
      if (reach.phone !== undefined) problems.push(`${where} is reached by a component test, so it has no reach.phone`);
      continue;
    }
    if (!worlds.has(reach.world)) problems.push(`${where} is reached in world "${reach.world}", which the map does not list`);
    else if (!worlds.get(reach.world).has(reach.role)) problems.push(`${where} is reached as ${reach.role}, but world ${reach.world} has no ${reach.role} user`);
    const steps = reach.steps ?? [];
    if (!steps.length) problems.push(`${where} has no reach steps`);
    let phoneSteps = [];
    if (reach.phone !== undefined) {
      if (!reach.phone || typeof reach.phone !== 'object' || !Array.isArray(reach.phone.steps) || !reach.phone.steps.length) problems.push(`${where} reach.phone must be { "steps": [...] }`);
      else phoneSteps = reach.phone.steps;
      if (!widths.includes('phone')) problems.push(`${where} has reach.phone but is not checked at phone width`);
    }
    for (const [list, at] of [[steps, where], [phoneSteps, `${where} reach.phone`]]) for (const step of list) {
      const kinds = STEP_KINDS.filter((k) => k in step);
      if (kinds.length !== 1) { problems.push(`${at} has a step that is not exactly one of ${STEP_KINDS.join(', ')}`); continue; }
      if (step.goto !== undefined && (typeof step.goto !== 'string' || !step.goto.startsWith('/'))) problems.push(`${at} goto must be a path starting with /`);
      if (step.type && typeof step.type.text !== 'string') problems.push(`${at} type step needs text`);
      if ((step.click || step.type || step.open) && !stepTestid(step) && !(step.click && step.click.name)) problems.push(`${at} has a click without a test id or a name`);
    }
    // Safety: a reach step never clicks a control that spends money, dials, or deletes, unless the
    // state answers that request from a fixture (intercept).
    const allButtons = states.flatMap((x) => x.buttons ?? []);
    for (const step of [...steps, ...phoneSteps]) {
      if (!step.click) continue;
      const t = stepTestid(step);
      const b = allButtons.find((x) => sameControl(x.testid, t));
      const effect = b?.effect ?? 'free';
      if (!SAFE_TO_CLICK.has(effect) && !reach.intercept) {
        problems.push(`${where} clicks "${t}", whose effect is ${effect}; answer it with reach.intercept or reach it in a component test`);
      }
    }
  }
  return problems;
}

/** The steps that reach a state at a width: reach.phone's at phone width when it has them. */
export function reachSteps(state, width = 'desktop') {
  if (width === 'phone' && state.reach?.phone?.steps?.length) return state.reach.phone.steps;
  return state.reach?.steps ?? [];
}

/**
 * Whether reaching a state changes its world's data (a save, a discard, an add): such states are
 * captured last, and the world is re-seeded before the next capture. The map says so with
 * reach.writes; without it, a click on a save, discard, keep, submit, confirm, undo, restore,
 * remove, delete or dismiss control counts.
 */
export function writesData(state, map, width = 'desktop') {
  if (state.reach?.writes !== undefined) return Boolean(state.reach.writes);
  const clicks = reachSteps(state, width).filter((s) => s.click).map(stepTestid);
  const buttons = (map.states ?? []).flatMap((x) => x.buttons ?? []);
  return clicks.some((t) => buttons.some((b) => sameControl(b.testid, t) && b.effect === 'free' && b.writes === true))
    || clicks.some((t) => /(^|-)(save|discard|keep|submit|confirm|put-back|undo|restore|remove|delete|dismiss)(-|$)/.test(t ?? ''));
}

function stepText(step) {
  if (step.goto) return `open ${step.goto}`;
  if (step.click) return `click "${step.click.name ?? step.click.testid}"`;
  if (step.type) return `type "${step.type.text}" into ${step.type.testid}`;
  if (step.open) return `open the ${step.open.testid} group`;
  return JSON.stringify(step);
}

/** The checklist builders and reviewers read, rendered from the map. */
export function renderChecklist(map) {
  const byId = new Map((map.states ?? []).map((s) => [s.id, s]));
  const name = (id) => (byId.get(id) ? `${byId.get(id).screen} / ${byId.get(id).name}` : id);
  const lines = [
    `# ${map.title ?? map.feature}: every state and every button`,
    '',
    'Made from map.json by `delivery map`. Edit the map, never this file.',
    'Each state lists how the capture reaches it, its buttons, and the state each button opens.',
    '"stays" means the button acts on this state (saves, filters, closes) rather than opening another designed state.',
    'Scope: the page area only. The sidebar and the top bar are not part of this work.',
  ];
  const declared = mapWidths(map);
  const multi = declared.length > 1 || declared[0] !== 'desktop';
  if (multi) {
    lines.push(`Widths: ${declared.map((w) => `${w} (${WIDTHS[w]?.width ?? '?'} px)`).join(' and ')}. The page is responsive: every state is checked at each width unless it says otherwise, and a phone layout is compared with the phone design.`);
  }
  lines.push('');
  for (const s of map.states ?? []) {
    lines.push(`## ${s.id}: ${s.screen} / ${s.name}`);
    if (s.note) lines.push(s.note);
    if (multi && Array.isArray(s.widths) && s.widths.length) lines.push(`- Widths: ${s.widths.join(' and ')} only`);
    if (s.reach?.test) lines.push(`- Reached by: the component test ${s.reach.test} (the capture cannot reach it)`);
    else if (s.reach) lines.push(`- Reached by: ${(s.reach.steps ?? []).map(stepText).join(' then ')} (test data: ${s.reach.world}, ${s.reach.role})`);
    if (s.reach?.phone?.steps?.length) lines.push(`- Reached on a phone by: ${s.reach.phone.steps.map(stepText).join(' then ')}`);
    if (multi && stateWidths(s, map).includes('phone')) {
      const d = designFor(s, 'phone');
      if (!d) lines.push('- Phone design: none (the design never drew this state on a phone)');
      else if (d.separate) lines.push(`- Phone design: its own mobile frame, ${d.id}`);
    }
    for (const b of s.buttons ?? []) {
      const to = b.opens && b.opens !== s.id ? `opens ${b.opens}: ${name(b.opens)}` : 'stays';
      const who = b.member === 'hidden' ? ' (hidden from members)' : '';
      const width = b.phone === 'hidden' ? ' (hidden on a phone)' : b.phone === 'shown' ? ' (on a phone only)' : '';
      const fx = b.effect && !SAFE_TO_CLICK.has(b.effect) ? ` [${b.effect}: never clicked by the capture]` : '';
      lines.push(`- Button "${b.label ?? b.testid}"${b.testid ? ` (${b.testid})` : ''} → ${to}${who}${width}${fx}`);
    }
    lines.push('');
  }
  if ((map.keep ?? []).length) {
    lines.push('## Features of the old page that must not be lost', '');
    for (const k of map.keep) lines.push(`- ${k.what}${k.where ? ` (${k.where})` : ''}${k.how ? `: ${k.how}` : ''}`);
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * A map from a coverage plan (the full mode's plan.json), for a run that started in full mode.
 * States are the plan's rows that have a design render; each row's controls become buttons.
 * @param {object} plan
 * @param {{ designed: Set<string>, names?: Record<string, { screen: string, name: string }>, route?: string }} opts
 */
export function mapFromPlan(plan, opts) {
  const rows = (plan.rows ?? []).filter((r) => opts.designed.has(r.id) && r.class !== 'cut');
  const route = opts.route ?? rows.find((r) => r.route)?.route ?? '/';
  const mapped = new Set(rows.map((r) => r.id));
  const states = rows.map((r) => {
    const n = opts.names?.[r.id];
    const reach = r.reach?.steps?.length
      ? { world: r.reach.world, role: r.reach.role, steps: r.reach.steps, ...(r.reach.intercept ? { intercept: r.reach.intercept } : {}) }
      : { test: r.reach?.test ? `${r.reach.test.file} :: ${r.reach.test.name}` : 'component test' };
    const buttons = (r.controls ?? []).map((c) => ({
      label: c.label || undefined,
      testid: c.testid || undefined,
      opens: c.target && mapped.has(c.target) ? c.target : undefined,
      effect: c.effect,
      member: c.permission?.member === 'hidden' ? 'hidden' : undefined,
    }));
    return { id: r.id, screen: n?.screen ?? r.id, name: n?.name ?? r.id, reach, buttons };
  });
  return {
    schemaVersion: 1,
    feature: plan.feature,
    kind: 'redesign',
    route,
    pageArea: { left: 240, designLeft: 240 },
    worlds: plan.worlds ?? [],
    states,
    keep: [],
  };
}
