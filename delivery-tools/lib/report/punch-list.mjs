// The punch-list page (spec 11.5): every finding with the design render and the live capture side
// by side, as one HTML file the main session publishes as a private Artifact. Rendered here in full
// (no data fetched at view time); the page's only script filters rows.

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { exists } from '../core/fs.mjs';

export const SEVERITIES = ['P1', 'P2', 'P3'];
export const STATUSES = ['open', 'accepted', 'filed', 'fixed', 'cut', 'duplicate'];
const SHOWN_BY_DEFAULT = new Set(['open', 'accepted', 'filed']);

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** "scripts" -> "Scripts", "new-inbox" -> "New inbox". */
export function featureName(slug) {
  const s = String(slug).replace(/-/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Findings in the order a person works them: severity, then status, then group and state. */
export function orderFindings(findings) {
  return findings.slice().sort((a, b) =>
    SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity)
    || STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status)
    || String(a.group).localeCompare(String(b.group))
    || String(a.state).localeCompare(String(b.state))
    || String(a.where).localeCompare(String(b.where)));
}

function figure(label, src, alt, words) {
  const pic = src
    ? `<img class="shot" src="${esc(src)}" alt="${esc(alt)}" loading="lazy" tabindex="0">`
    : `<div class="none">No ${label.toLowerCase()} picture</div>`;
  return `<figure>${pic}<figcaption><span>${esc(label)}</span>${words ? `<q>${esc(words)}</q>` : ''}</figcaption></figure>`;
}

/**
 * The page (pure).
 * @param {{ template: string, feature: string, findings: object[], pictures: Map<string, { design: string|null, live: string|null, liveLine: string|null }>,
 *           meta: string, footer: string }} o
 * @returns {string}
 */
export function renderPunchList(o) {
  const findings = orderFindings(o.findings);
  const count = (pred) => findings.filter(pred).length;
  const tally = [
    ['p1', count((f) => f.status === 'open' && f.severity === 'P1'), 'P1 open'],
    ['p2', count((f) => f.status === 'open' && f.severity === 'P2'), 'P2 open'],
    ['p3', count((f) => f.status === 'open' && f.severity === 'P3'), 'P3 open'],
    ['', count((f) => f.status === 'accepted'), 'accepted'],
    ['', count((f) => f.status === 'filed'), 'filed'],
    ['', count((f) => f.status === 'fixed'), 'fixed'],
  ].map(([cls, n, label]) => `<li${cls ? ` class="${cls}"` : ''}><b>${n}</b><span>${esc(label)}</span></li>`).join('');

  const chip = (kind, value, pressed, label = value) =>
    `<button type="button" class="chip" data-kind="${kind}" data-value="${esc(value)}" aria-pressed="${pressed ? 'true' : 'false'}">${esc(label)}</button>`;
  const statuses = STATUSES.filter((s) => findings.some((f) => f.status === s));
  const groups = [...new Set(findings.map((f) => f.group || 'ungrouped'))].sort();
  const filters = [
    `<div class="group"><span>Severity</span>${SEVERITIES.map((s) => chip('severity', s, true)).join('')}</div>`,
    `<div class="group"><span>Status</span>${statuses.map((s) => chip('status', s, SHOWN_BY_DEFAULT.has(s))).join('')}</div>`,
    groups.length > 1 ? `<div class="group"><span>Group</span>${groups.map((g) => chip('group', g, false)).join('')}</div>` : '',
  ].join('\n    ');

  const rows = findings.map((f) => {
    const pics = o.pictures.get(f.id) ?? { design: null, live: null, liveLine: null };
    const group = f.group || 'ungrouped';
    const facts = [
      ['source', `<span class="mono">${esc(f.source)}${f.rule ? ` · ${esc(f.rule)}` : ''}</span>`],
      ['where', `<span class="mono">${esc(f.where)}</span>`],
      ['group', esc(group)],
      ['evidence', esc(f.evidence)],
    ];
    if (f.accept) facts.push(['accepted', `${esc(f.accept.reasonClass)}, #${esc(f.accept.issue)}: ${esc(f.accept.text)}`]);
    if (f.fixedIn) facts.push(['fixed in', `<span class="mono">${esc(f.fixedIn)}</span>`]);
    if (f.reAudits) facts.push(['re-audits', String(f.reAudits)]);
    return `    <article class="snag" id="${esc(f.id)}" data-severity="${esc(f.severity)}" data-status="${esc(f.status)}" data-group="${esc(group)}">
      <div class="facts">
        <div class="head"><span class="sev ${esc(f.severity)}">${esc(f.severity)}</span><span class="state">${esc(f.state)}</span><span class="status ${esc(f.status)}">${esc(f.status)}</span>${f.dayOne ? '<span class="day-one">day one</span>' : ''}</div>
        <dl>${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>
        ${f.cause ? `<p class="cause">${esc(f.cause)}</p>` : ''}
        <span class="mono meta">${esc(f.id)}</span>
      </div>
      <div class="pair">
        ${figure('Design', pics.design, `Design render of ${f.state}`, f.design)}
        ${figure('Live', pics.live, `Live capture of ${f.state}`, f.live || pics.liveLine)}
      </div>
    </article>`;
  }).join('\n');

  const title = `${featureName(o.feature)} punch list`;
  const fill = {
    TITLE: esc(title),
    HEADING: esc(title),
    META: o.meta,
    TALLY: tally,
    FILTERS: filters,
    ROWS: rows,
    EMPTY: findings.length ? '' : 'No findings: every check and auditor came back clean.',
    EMPTY_HIDDEN: findings.length ? 'hidden' : '',
    FOOTER: o.footer,
  };
  return o.template.replace(/%%([A-Z_]+)%%/g, (m, k) => (k in fill ? fill[k] : m));
}

/** "OV-05.design.admin.1440.en.light.txt:4" -> { key, line }; null when where names no capture file. */
export function captureKeyOf(where) {
  const m = /^([A-Z]{1,6}-\d{2,3}\.[A-Za-z0-9._-]+?)\.(txt|dom\.json|png|errors\.json)(?::(\d+))?/.exec(String(where ?? ''));
  return m ? { key: m[1], line: m[3] ? Number(m[3]) : null } : null;
}

/**
 * Find the pictures for each finding: the design render of its state, and the live capture it points
 * at (its where names the capture file), else the newest capture of the state (design world, the
 * first width, light, first).
 * @param {import('../core/paths.mjs').FeaturePaths} paths
 * @param {object[]} findings
 * @param {{ primaryLocale?: string }} [opts]
 * @returns {Promise<{ pictures: Map<string, object>, files: string[], runs: string[] }>}
 */
export async function locatePictures(paths, findings, opts = {}) {
  let runs = [];
  try { runs = (await readdir(paths.captures)).filter((n) => /^c-/.test(n)).sort().reverse(); } catch { runs = []; }
  const manifests = new Map();
  for (const r of runs) {
    try { manifests.set(r, JSON.parse(await readFile(join(paths.captures, r, 'capture.json'), 'utf8'))); } catch { /* a run with no manifest */ }
  }
  const pictures = new Map();
  const files = new Set();
  for (const f of findings) {
    let design = null;
    if (/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(f.state) && (await exists(paths.designRender(f.state, 'png')))) design = `design/${f.state}.png`;
    let live = null;
    let liveLine = null;
    const k = captureKeyOf(f.where);
    if (k) {
      for (const r of runs) {
        if (await exists(join(paths.captures, r, `${k.key}.png`))) {
          live = `captures/${r}/${k.key}.png`;
          if (k.line) {
            const txt = await readFile(join(paths.captures, r, `${k.key}.txt`), 'utf8').catch(() => '');
            liveLine = txt.split('\n')[k.line - 1] ?? null;
          }
          break;
        }
      }
    }
    if (!live) {
      for (const r of runs) {
        const m = manifests.get(r);
        const items = (m?.items ?? []).filter((i) => i.state === f.state && i.status === 'reached');
        if (!items.length) continue;
        items.sort((a, b) => score(b, opts) - score(a, opts));
        const p = join(paths.captures, r, items[0].files.png);
        if (await exists(p)) { live = `captures/${r}/${items[0].files.png}`; break; }
      }
    }
    if (design) files.add(design);
    if (live) files.add(live);
    pictures.set(f.id, { design, live, liveLine });
  }
  return { pictures, files: [...files].sort(), runs };
}

function score(i, opts) {
  return (i.world === 'design' ? 8 : 0) + (i.role === 'admin' ? 4 : 0) + (i.theme === 'light' ? 2 : 0) + (i.locale === (opts.primaryLocale ?? 'en') ? 1 : 0) + i.width / 100000;
}
