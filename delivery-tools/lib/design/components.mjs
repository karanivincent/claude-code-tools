// Design components (components-first spec §1): every <dc-import name="X"> in a Claude Design
// export names a component whose own file is X.dc.html. Pure apart from readExportComponents.

import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { htmlUnescape } from './claude-dc.mjs';
import { PROP_COPY_PREFIX } from './serve.mjs';

const ATTRS = `(?:[^>"']|"[^"]*"|'[^']*')*`;
const IMPORT_RE = new RegExp(`<dc-import(${ATTRS})>`, 'gi');
const ATTR_RE = /([A-Za-z][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

export const kebabToCamel = (s) => s.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
export const sha256Text = (text) => `sha256:${createHash('sha256').update(text).digest('hex')}`;

function attrValue(raw) {
  const v = htmlUnescape(raw);
  const m = /^\s*\{\{\s*([\s\S]*?)\s*\}\}\s*$/.exec(v);
  if (!m) return { literal: v };
  const e = m[1];
  if (e === 'true') return { literal: true };
  if (e === 'false') return { literal: false };
  if (e === 'null') return { literal: null };
  if (/^-?\d+(\.\d+)?$/.test(e)) return { literal: Number(e) };
  const q = /^(['"])(.*)\1$/.exec(e);
  return q ? { literal: q[2] } : { expr: e };
}

/**
 * A component file's declared props and preview size, from its `data-props` attribute.
 * @param {string} html
 * @returns {{ props: object, preview: {width:number,height:number|null}|null, error?: string }}
 *   error: `data-props` is present but not valid JSON (fix round, M1) — props and preview are
 *   empty/null rather than throwing, so one malformed component never crashes an intake.
 */
export function declaredProps(html) {
  const tag = /<script\b[^>]*\bdata-dc-script\b[^>]*>/i.exec(html);
  const attr = tag && /\bdata-props\s*=\s*"([^"]*)"/i.exec(tag[0]);
  if (!attr) return { props: {}, preview: null };
  let meta;
  try {
    meta = JSON.parse(htmlUnescape(attr[1]));
  } catch (err) {
    return { props: {}, preview: null, error: err.message };
  }
  const props = {};
  for (const [k, v] of Object.entries(meta)) {
    if (!k.startsWith('$')) props[k] = { tsType: v?.tsType ?? null, default: v?.default ?? null };
  }
  const p = meta.$preview;
  return { props, preview: p && Number.isFinite(p.width) ? { width: p.width, height: Number.isFinite(p.height) ? p.height : null } : null };
}

export function readDesignComponents(files) {
  const byFile = new Map(files.map((f) => [f.file, f.html]));
  const sites = new Map();
  const errors = [];
  for (const { file, html } of files) {
    for (const m of html.matchAll(IMPORT_RE)) {
      const line = html.slice(0, m.index).split('\n').length;
      const attrs = {};
      let name = null;
      for (const a of m[1].replace(/\/\s*$/, '').matchAll(ATTR_RE)) {
        const key = a[1];
        const raw = a[2] ?? a[3];
        if (key === 'name') name = raw;
        else if (!key.startsWith('hint-')) attrs[kebabToCamel(key)] = attrValue(raw);
      }
      if (!name) { errors.push(`${file}:${line}: a dc-import has no name`); continue; }
      if (!byFile.has(`${name}.dc.html`)) { errors.push(`${file}:${line}: dc-import names ${name}, but ${name}.dc.html is not in the export`); continue; }
      if (!sites.has(name)) sites.set(name, []);
      sites.get(name).push({ file, line, attrs });
    }
  }
  const components = [...sites.keys()].sort().map((name) => {
    const file = `${name}.dc.html`;
    const html = byFile.get(file);
    const { props, preview, error } = declaredProps(html);
    if (error) errors.push(`${file}: data-props is not valid JSON: ${error}`);
    return { name, file, hash: sha256Text(html), props, preview, events: Object.keys(props).filter((k) => /^on[A-Z]/.test(k)).sort(), sites: sites.get(name), uses: [] };
  });
  for (const c of components) {
    c.uses = [...sites].filter(([, ss]) => ss.some((s) => s.file === c.file)).map(([n]) => n).sort();
  }
  return { components, errors };
}

export function componentOrder(components) {
  const by = new Map(components.map((c) => [c.name, c]));
  const out = [];
  const seen = new Map();
  const visit = (n, path) => {
    if (seen.get(n) === 'done') return;
    if (seen.get(n) === 'active') throw new Error(`component import cycle: ${[...path, n].join(' -> ')}`);
    seen.set(n, 'active');
    for (const u of by.get(n)?.uses ?? []) visit(u, [...path, n]);
    seen.set(n, 'done');
    out.push(n);
  };
  for (const c of [...components].sort((a, b) => a.name.localeCompare(b.name))) visit(c.name, []);
  return out;
}

export async function readExportComponents(dir) {
  let names = (await readdir(dir)).filter((n) => n.endsWith('.dc.html') && !n.startsWith(PROP_COPY_PREFIX)).sort();
  // A second copy of a page's source that some exports carry (adapters/design/claude-design.mjs findDcFile).
  if (names.length > 1) names = names.filter((n) => n !== '_bundle_src.dc.html');
  const files = await Promise.all(names.map(async (file) => ({ file, html: await readFile(join(dir, file), 'utf8') })));
  return readDesignComponents(files);
}
