// Candidate groups (design candidates --groups): which extractor reads which candidates.
//
// One group per in-scope design screen, one "shared" group for what several screens show or what
// the analysis cannot place (headers, menus, dialogs several screens open, and untied candidates),
// and one "other screens" group for untied candidates whose markup only screens without a group
// read (most of them end excluded as out of scope, after an extractor has read them). A group over the maximum splits by the <sc-if> sections its candidates sit in (a
// tab, a panel, a dialog), then by source order. Candidates the assembler excludes as out of scope
// go to no group. Grouping only decides who reads a candidate: it never maps or excludes one, so
// a wrong guess costs one extractor's glance and the assembler's unclaimed list catches the rest.

import { scopeScreens, outOfScopeReason } from './scope.mjs';

export const DEFAULT_MAX_GROUP = 150;
export const SHARED = 'shared';
export const OTHER = 'other-screens';

const lineOf = (c) => Number(String(c.source ?? '').split(':').pop()) || 0;

/** Upper-case letters for an id prefix, unique among those already taken (1 to 6 capitals). */
export function prefixFor(name, taken) {
  const letters = String(name).toUpperCase().replace(/[^A-Z]/g, '') || 'G';
  for (let n = 2; n <= Math.min(6, letters.length); n++) {
    const p = letters.slice(0, n);
    if (!taken.has(p)) { taken.add(p); return p; }
  }
  for (const extra of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    const p = `${letters.slice(0, 5)}${extra}`;
    if (!taken.has(p)) { taken.add(p); return p; }
  }
  throw new Error(`no free id prefix for ${name}`);
}

const slugOf = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'group';

/**
 * Split one group's candidates into parts of at most `max`, keeping each <sc-if> section whole
 * when it fits; a section larger than `max` is cut in source order.
 * @param {object[]} members candidates with their hints
 * @param {number} max
 * @param {(c: object) => { line: number, label: string } | null} sectionOf
 * @returns {{ ids: string[], sections: string[] }[]}
 */
function split(members, max, sectionOf) {
  const sorted = [...members].sort((a, b) => lineOf(a) - lineOf(b) || (a.id < b.id ? -1 : 1));
  if (sorted.length <= max) return [{ ids: sorted.map((c) => c.id), sections: [] }];
  const bySection = new Map();
  for (const c of sorted) {
    const s = sectionOf(c);
    const key = s ? `${String(s.line).padStart(8, '0')} ${s.label}` : '~ main';
    if (!bySection.has(key)) bySection.set(key, { label: s ? s.label : 'outside any section', ids: [] });
    bySection.get(key).ids.push(c.id);
  }
  const parts = [];
  let cur = { ids: [], sections: [] };
  const flush = () => { if (cur.ids.length) parts.push(cur); cur = { ids: [], sections: [] }; };
  for (const key of [...bySection.keys()].sort()) {
    const sec = bySection.get(key);
    if (sec.ids.length > max) {
      flush();
      for (let i = 0; i < sec.ids.length; i += max) parts.push({ ids: sec.ids.slice(i, i + max), sections: [sec.label] });
      continue;
    }
    if (cur.ids.length + sec.ids.length > max) flush();
    cur.ids.push(...sec.ids);
    cur.sections.push(sec.label);
  }
  flush();
  return parts;
}

/**
 * Group the candidates for the extractors (pure).
 * @param {{ candidates: object[], screens?: { key: string, values: string[] } | null, hints?: Map<string, { screens: string[], lines: number[], sections: { line: number, label: string, screens: string[] }[] }>, intent?: object | null, max?: number, feature?: string }} input
 * @returns {{ schemaVersion: 1, feature: string|null, screenKey: string|null, max: number, groups: { group: string, slug: string, prefix: string, screens: string[], part: number, parts: number, sections: string[], candidates: string[] }[], outOfScope: string[], counts: Record<string, number> }}
 */
export function candidateGroups({ candidates, screens = null, hints = new Map(), intent = null, max = DEFAULT_MAX_GROUP, feature = null }) {
  const scope = scopeScreens(intent);
  const all = screens?.values ?? [];
  // The screens that get a group: the in-scope ones when intent.json names them, else every one.
  const grouped = scope.inKeys.size ? all.filter((v) => scope.inKeys.has(v)) : all.filter((v) => !scope.outKeys.has(v));
  const groupedSet = new Set(grouped);
  const members = new Map([...grouped.map((v) => [v, []]), [SHARED, []], [OTHER, []]]);
  const outOfScope = [];
  const placedBy = { tied: 0, suggested: 0, shot: 0, shared: 0, otherScreens: 0 };

  for (const c of candidates) {
    if (outOfScopeReason(c, scope)) { outOfScope.push(c.id); continue; }
    const hint = hints.get(c.id) ?? { screens: [], lines: [], sections: [] };
    const tied = (c.screens ?? []).filter((v) => groupedSet.has(v));
    const suggested = hint.screens.filter((v) => groupedSet.has(v));
    let home = null;
    if (c.screens?.length) { if (tied.length === 1 && c.screens.length === 1) { home = tied[0]; placedBy.tied++; } }
    else if (suggested.length === 1) { home = suggested[0]; placedBy.suggested++; }
    else if (c.kind === 'shot') {
      const words = String(c.source).toLowerCase().split(/[^a-z0-9]+/);
      const named = grouped.filter((v) => words.includes(v.toLowerCase()));
      if (named.length === 1) { home = named[0]; placedBy.shot++; }
    }
    if (!home && !c.screens?.length && hint.screens.length && !suggested.length) { home = OTHER; placedBy.otherScreens++; }
    if (!home) { home = SHARED; placedBy.shared++; }
    members.get(home).push({ ...c, hint });
  }

  const taken = new Set();
  const groups = [];
  for (const [name, list] of members) {
    if (!list.length) continue;
    const isShared = name === SHARED || name === OTHER;
    // A candidate's section: the first <sc-if> section of a line that shows on this group's screen.
    const sectionOf = (c) => {
      const secs = c.hint.sections ?? [];
      return (isShared ? secs[0] : secs.find((s) => !s.screens?.length || s.screens.includes(name)) ?? secs[0]) ?? null;
    };
    const parts = split(list, max, sectionOf);
    const base = name === SHARED ? 'Shared parts' : name === OTHER ? 'Other screens' : name;
    parts.forEach((p, i) => {
      const n = parts.length > 1 ? ` ${i + 1} of ${parts.length}` : '';
      groups.push({
        group: `${base}${n}`,
        slug: `${slugOf(name)}${parts.length > 1 ? `-${i + 1}` : ''}`,
        prefix: prefixFor(name === SHARED ? 'SH' : name === OTHER ? 'OT' : name, taken),
        screens: isShared ? [] : [name],
        part: i + 1,
        parts: parts.length,
        sections: p.sections,
        candidates: p.ids,
      });
    });
  }
  return {
    schemaVersion: 1,
    feature,
    screenKey: screens?.key ?? null,
    max,
    groups,
    outOfScope,
    counts: { candidates: candidates.length, groups: groups.length, outOfScope: outOfScope.length, ...placedBy },
  };
}

/**
 * The group each candidate id is in, from a candidate-groups.json document.
 * @param {{ groups?: { slug: string, candidates: string[] }[] } | null} doc
 * @returns {Map<string, string>}
 */
export function groupOfCandidate(doc) {
  const out = new Map();
  for (const g of doc?.groups ?? []) for (const id of g.candidates ?? []) out.set(id, g.slug);
  return out;
}
