// The Claude Design adapter (spec 4.0 step 1, 4.2 step 1): an export (or its snapshot) with one
// *.dc.html, its runtime (support.js, zipped into runtime.zip in a snapshot), usually shots/,
// uploads/ and _ds/. Candidates come from reading the file, never from running it.

import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { listTree } from '../../lib/core/hash.mjs';
import { readZip } from '../../lib/core/zip.mjs';
import { tokenize } from '../../lib/design/js-tokens.mjs';
import { splitDcHtml, propValues, stateWrites, textTernaries, templateLists, idPart } from '../../lib/design/claude-dc.mjs';

export const RUNTIME_ENTRY = 'support.js';
export const RUNTIME_ZIP = 'runtime.zip';

const IMAGE = /\.(png|jpe?g|webp|gif)$/i;
// State keys that open something over the page; their values become dialog candidates.
const DIALOG_KEY = /^(dlg|dialog|modal|sheet|drawer|popover|popup|overlay|confirm|menu)|(Dialog|Modal|Sheet|Drawer|Popover|Popup|Menu\d*|Form|Open)$/;

async function isDir(p) { try { return (await stat(p)).isDirectory(); } catch { return false; } }
async function isFile(p) { try { return (await stat(p)).isFile(); } catch { return false; } }

/** The one *.dc.html at the top of dir, or an error message. */
export async function findDcFile(dir) {
  let names;
  try { names = await readdir(dir); } catch { return { error: `${dir} is not a readable directory` }; }
  const dc = names.filter((n) => n.endsWith('.dc.html') && !n.startsWith('__delivery__'));
  if (dc.length === 0) return { error: 'no *.dc.html at the top of the export' };
  if (dc.length > 1) return { error: `more than one *.dc.html (${dc.join(', ')})` };
  return { file: dc[0] };
}

/** Whether dir carries the runtime: support.js loose, or inside runtime.zip. */
async function hasRuntime(dir) {
  if (await isFile(join(dir, RUNTIME_ENTRY))) return true;
  if (!(await isFile(join(dir, RUNTIME_ZIP)))) return false;
  try {
    return readZip(await readFile(join(dir, RUNTIME_ZIP))).some((e) => e.name === RUNTIME_ENTRY);
  } catch { return false; }
}

/** @type {import('./index.mjs').DesignAdapter} */
const adapter = {
  name: 'claude-design',

  async detect(dir) {
    const dc = await findDcFile(dir);
    if (dc.error) return { ok: false, reason: dc.error };
    if (!(await hasRuntime(dir))) return { ok: false, reason: `no ${RUNTIME_ENTRY} (or ${RUNTIME_ZIP} holding it) beside ${dc.file}` };
    return { ok: true, project: dc.file.replace(/\.dc\.html$/, ''), exportedAt: null };
  },

  // Runtime scripts are zipped: a repo's security gate may refuse eval in a committed .js, and
  // the Claude Design runtime uses it. uploads/ is in neither list: intake keeps it as intent
  // input (spec 4.0 step 4), not as part of the design.
  async snapshotLayout(dir) {
    const files = await listTree(dir, { ignore: (rel) => rel.startsWith('__MACOSX/') || rel.startsWith('uploads/') });
    const zip = files.filter((f) => f.endsWith('.js'));
    const copy = files.filter((f) => !f.endsWith('.js'));
    return { copy, zip };
  },

  async candidates(snapshotDir) {
    const dc = await findDcFile(snapshotDir);
    if (dc.error) throw new Error(dc.error);
    const text = await readFile(join(snapshotDir, dc.file), 'utf8');
    const shotsDir = join(snapshotDir, 'shots');
    const shots = (await isDir(shotsDir)) ? (await readdir(shotsDir)).filter((n) => IMAGE.test(n)).sort() : [];
    return claudeDesignCandidates({ file: dc.file, text, shots });
  },
};

export default adapter;

const show = (v) => (typeof v === 'string' ? v : v === undefined ? 'undefined' : JSON.stringify(v));
const clip = (s, n = 200) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/**
 * Candidates from a .dc.html's text and its shot file names (pure).
 * @param {{ file: string, text: string, shots?: string[] }} input
 * @returns {{ id: string, kind: string, source: string, detail?: string, values?: string[] }[]}
 */
export function claudeDesignCandidates({ file, text, shots = [] }) {
  const parts = splitDcHtml(text);
  const out = [];
  const ids = new Map();
  const add = (c) => {
    const n = (ids.get(c.id) ?? 0) + 1;
    ids.set(c.id, n);
    out.push(n === 1 ? c : { ...c, id: `${c.id}.${n}` });
  };

  // 1. Every value of every data-props switch: the only way to reach a prop-only state.
  if (parts.props?.value) {
    for (const p of propValues(parts.props.value)) {
      add({
        id: `prop:${idPart(p.key)}:${idPart(show(p.value))}`,
        kind: 'prop-value',
        source: `${file}:${parts.props.line}`,
        detail: `data-props ${p.key} = ${show(p.value)}${p.isDefault ? ' (the default)' : ''}${p.section ? ` · ${p.section}` : ''}`,
        values: [show(p.value)],
      });
    }
  }

  // 2. Every this.set({...}) target and each literal value it is set to; computed values once per key.
  if (parts.script) {
    const toks = tokenize(parts.script.text, { line: parts.script.line });
    const writes = stateWrites(toks, parts.script.text);
    const setKeys = new Set(writes.filter((w) => !w.initial).flatMap((w) => w.entries.map((e) => e.key)));
    const byTarget = new Map();
    for (const w of writes) {
      for (const e of w.entries) {
        if (w.initial && !setKeys.has(e.key)) continue; // bookkeeping nothing ever changes
        const values = e.literals.filter((v) => !w.initial || isMeaningfulDefault(v)).map((v) => ({ v, computed: false }));
        if (e.computed && !w.initial) values.push({ v: null, computed: true });
        for (const { v, computed } of values) {
          const key = JSON.stringify([e.key, computed ? null : show(v), computed]);
          const hit = byTarget.get(key);
          if (hit) { hit.lines.push(w.line); continue; }
          byTarget.set(key, { key: e.key, value: v, computed, lines: [w.line], text: w.text, initial: w.initial });
        }
      }
    }
    for (const t of byTarget.values()) {
      const dialog = DIALOG_KEY.test(t.key);
      const lines = [...new Set(t.lines)].sort((a, b) => a - b);
      const sites = lines.length > 1 ? ` · ${lines.length} sites: ${lines.slice(0, 6).join(', ')}${lines.length > 6 ? ', …' : ''}` : '';
      add({
        id: `${dialog ? 'dialog' : 'set'}:${idPart(t.key)}:${t.computed ? 'computed' : idPart(show(t.value))}`,
        kind: dialog ? 'dialog' : 'set-target',
        source: `${file}:${lines[0]}`,
        detail: clip(`${t.key} = ${t.computed ? '(computed)' : show(t.value)}${t.initial ? ' (initial state)' : ''} · ${t.text}`) + sites,
        values: t.computed ? [] : [show(t.value)],
      });
    }

    // 3. Every ternary whose branches show different words.
    const perLine = new Map();
    for (const tern of textTernaries(toks, parts.script.text)) {
      const n = (perLine.get(tern.line) ?? 0) + 1;
      perLine.set(tern.line, n);
      add({
        id: `ternary:${tern.line}${n > 1 ? `.${n}` : ''}`,
        kind: 'ternary',
        source: `${file}:${tern.line}`,
        detail: clip(tern.text, 240),
        values: [...tern.whenTrue, ...tern.whenFalse],
      });
    }
  }

  // 4. Every list or table: each gets an empty candidate.
  if (parts.template) {
    for (const l of templateLists(parts.template.text, parts.template.line)) {
      add({ id: `list:${idPart(l.expr)}`, kind: 'list', source: `${file}:${l.line}`, detail: `${l.expr}: the list with no items`, values: ['empty'] });
    }
  }

  // 5. Every shot.
  for (const s of shots) add({ id: `shot:${idPart(s)}`, kind: 'shot', source: `shots/${s}`, detail: s });
  return out;
}

function isMeaningfulDefault(v) {
  if (v === null || v === undefined || v === false || v === '' || v === 0) return false;
  if (typeof v === 'object') return false;
  return true;
}
