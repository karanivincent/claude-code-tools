// The component map (components-first spec §2): one file for the whole product,
// docs/delivery/components.json (the profile's components.map). Every kind:"design" entry is a
// component Claude Design named; every kind:"base" entry is a shadcn-style part the design
// components are built from. Pure apart from componentsMapPath, readComponentsMap,
// writeComponentsMap, scanBase and findDesignSystemManifest, which touch the filesystem.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readJson, writeJsonAtomic } from '../core/fs.mjs';
import { validateAgainst } from '../core/schema.mjs';

const CODE_EXT = ['.tsx', '.ts', '.jsx', '.js'];
const IMPORT_SPEC_RE = /(?:from\s+|require\(\s*)['"]([^'"]+)['"]/g;

/**
 * @param {string} repoRoot
 * @param {object|null} profile
 * @returns {string|null} absolute path to the component map, or null with no profile.components.map
 */
export function componentsMapPath(repoRoot, profile) {
  const rel = profile?.components?.map;
  return rel ? join(repoRoot, rel) : null;
}

/**
 * @param {string|null} path
 * @returns {Promise<object|null>} null when path is null or the file does not exist
 */
export async function readComponentsMap(path) {
  if (!path) return null;
  return readJson(path, { optional: true });
}

/**
 * Write the map atomically, 2-space JSON with a trailing newline, entries sorted by kind then name.
 * @param {string} path
 * @param {object} map
 */
export async function writeComponentsMap(path, map) {
  const components = [...(map.components ?? [])].sort(
    (a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name),
  );
  await writeJsonAtomic(path, { ...map, components });
}

/**
 * Schema problems plus: a design entry's target or a base entry's file missing on disk (a design
 * entry the mapper has only just pointed at a not-yet-built file, status "new", is not reported —
 * the builder creates it; `--mark-built` still refuses a missing target when it is actually asked
 * to mark one built); duplicate names; a builtOn naming no base entry; an owns library with no
 * target.
 * @param {object} map
 * @param {{ repoRoot?: string }} [opts]
 * @returns {string[]}
 */
export function validateComponentsMap(map, opts = {}) {
  const { errors } = validateAgainst('components', map);
  if (errors.length) {
    // Deliberate early return: every check below assumes a schema-valid shape (c.kind, c.name,
    // c.owns and c.target all present with their schema types) and would throw or misreport on
    // a malformed map instead of adding anything a caller could act on.
    return errors.map((e) => `components.json${e.path === '/' ? '' : e.path}: ${e.message}`);
  }

  const problems = [];
  const components = map.components ?? [];
  // Keyed on kind + name, not name alone (fix round, I7): a design component and a base part that
  // happen to share a pascal name are different roles, not a collision.
  const seenAt = new Map();
  for (const [i, c] of components.entries()) {
    const key = `${c.kind}:${c.name}`;
    if (seenAt.has(key)) problems.push(`duplicate component name "${c.name}" (components/${seenAt.get(key)} and components/${i})`);
    else seenAt.set(key, i);
  }
  const baseNames = new Set(components.filter((c) => c.kind === 'base').map((c) => c.name));
  for (const c of components) {
    if (c.target && c.status !== 'new' && opts.repoRoot && !existsSync(join(opts.repoRoot, c.target))) {
      problems.push(`${c.name}: target ${c.target} does not exist on disk`);
    }
    if ((c.owns ?? []).length && !c.target) {
      problems.push(`${c.name}: owns a library but has no target yet`);
    }
    if (c.kind === 'design') {
      for (const b of c.builtOn ?? []) {
        if (!baseNames.has(b)) problems.push(`${c.name}: builtOn names "${b}", which is not a base entry`);
      }
    }
  }
  return problems;
}

/**
 * Add a "new" entry for every design component the map does not have yet, and refresh
 * design.hash, uses and status for entries it already has. Never touches target, props, owns,
 * builtOn, replaces or allowOwns: those are the mapper's.
 * @param {object} map
 * @param {{ name: string, file: string, hash: string, uses: string[] }[]} designComponents
 * @returns {{ map: object, changed: string[] }} changed: names added or whose design hash moved
 */
export function refreshDesignEntries(map, designComponents) {
  const byKey = new Map((map.components ?? []).map((c) => [`${c.kind}:${c.name}`, c]));
  const changed = [];
  const touched = new Set();
  const nextDesign = designComponents.map((dc) => {
    const key = `design:${dc.name}`;
    touched.add(key);
    const prev = byKey.get(key);
    if (!prev) {
      changed.push(dc.name);
      return {
        kind: 'design',
        name: dc.name,
        design: { file: dc.file, hash: dc.hash },
        target: null,
        status: 'new',
        builtHash: null,
        props: {},
        owns: [],
        builtOn: [],
        replaces: [],
        uses: [...(dc.uses ?? [])],
        states: [],
      };
    }
    if (prev.design.hash !== dc.hash) changed.push(dc.name);
    const builtHash = prev.builtHash ?? null;
    const status = builtHash === null ? 'new' : builtHash === dc.hash ? 'built' : 'stale';
    return { ...prev, design: { file: dc.file, hash: dc.hash }, uses: [...(dc.uses ?? [])], status };
  });
  const others = (map.components ?? []).filter((c) => !(c.kind === 'design' && touched.has(`design:${c.name}`)));
  return { map: { ...map, components: [...others, ...nextDesign] }, changed };
}

/**
 * A design component's status computed against the run's own design snapshot, rather than
 * whatever components.json last recorded (fix round: a page run's intake never calls
 * refreshDesignEntries, so the map's own status/design.hash can be stale, and a used component the
 * map has never heard of was silently skipped instead of blocking).
 * @param {object} map components.json
 * @param {{ name: string, hash: string }[]} exportComponents from readExportComponents (or, for a
 *   caller with no snapshot handy, a stand-in of the same shape)
 * @returns {Map<string, 'new'|'stale'|'built'>} keyed by name; missing from the map -> "new", a
 *   hash that has moved past what was last built -> "stale"
 */
export function effectiveComponents(map, exportComponents) {
  const byName = new Map((map?.components ?? []).filter((c) => c.kind === 'design').map((c) => [c.name, c]));
  const out = new Map();
  for (const dc of exportComponents ?? []) {
    const c = byName.get(dc.name);
    if (!c) { out.set(dc.name, 'new'); continue; }
    const builtHash = c.builtHash ?? null;
    out.set(dc.name, builtHash === null ? 'new' : builtHash === dc.hash ? 'built' : 'stale');
  }
  return out;
}

/**
 * effectiveComponents, but for a fixed list of names rather than a whole export: each name falls
 * back to its own map-recorded design hash when the real export (or no export at all) has nothing
 * to say about it. That reproduces the old map-only status for a caller with no snapshot handy,
 * while still using the live export's hash, and catching an unmapped name, when one is available.
 * @param {object} map components.json
 * @param {string[]} names
 * @param {{ name: string, hash: string }[]} [exportComponents]
 * @returns {Map<string, 'new'|'stale'|'built'>}
 */
export function effectiveComponentsFor(map, names, exportComponents = []) {
  const byName = new Map((map?.components ?? []).filter((c) => c.kind === 'design').map((c) => [c.name, c]));
  const forEffective = (names ?? []).map((name) => {
    const real = (exportComponents ?? []).find((e) => e.name === name);
    if (real) return real;
    const c = byName.get(name);
    return { name, hash: c?.design?.hash ?? null };
  });
  return effectiveComponents(map, forEffective);
}

/**
 * PascalCase of a kebab-case file stem: "date-picker" -> "DatePicker", "input-otp" -> "InputOtp".
 * @param {string} stem
 */
function pascalFromStem(stem) {
  return stem
    .split(/[-_]+/)
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
}

/** Whether an import specifier is covered by a profile.components.baseLibraries entry. */
function matchesLibrary(spec, glob) {
  if (glob.endsWith('/*')) {
    const prefix = glob.slice(0, -2);
    return spec === prefix || spec.startsWith(`${prefix}/`);
  }
  return spec === glob;
}

/** Every import specifier in `source` that matches one of `baseLibraries`, sorted and deduped. */
function importedLibraries(source, baseLibraries) {
  const found = new Set();
  for (const m of source.matchAll(IMPORT_SPEC_RE)) {
    const spec = m[1];
    if (baseLibraries.some((g) => matchesLibrary(spec, g))) found.add(spec);
  }
  return [...found].sort();
}

/**
 * One base entry per file in baseDir (.tsx, .ts, .jsx, .js, not *.test.*), recording the
 * third-party UI libraries (baseLibraries globs, a trailing /* matches any subpath) it imports. A
 * file that is already some design entry's own target is skipped: a design component built inside
 * baseDir is not also a base part, and scanning it fought the base scan (fix round, I7).
 * @param {string} repoRoot
 * @param {string} baseDir repo-relative
 * @param {string[]} [baseLibraries]
 * @param {Set<string>|string[]} [designTargets] repo-relative targets of the map's design entries
 * @returns {{ kind: 'base', name: string, target: string, owns: string[], source: 'scan' }[]}
 */
export function scanBase(repoRoot, baseDir, baseLibraries = [], designTargets = []) {
  const designSet = designTargets instanceof Set ? designTargets : new Set(designTargets);
  const dir = join(repoRoot, baseDir);
  const names = existsSync(dir) ? readdirSync(dir) : [];
  const cleanBaseDir = baseDir.replace(/\/+$/, '');
  const files = names
    .filter((n) => !/\.test\./.test(n))
    .filter((n) => CODE_EXT.some((ext) => n.endsWith(ext)))
    .filter((n) => !designSet.has(`${cleanBaseDir}/${n}`))
    .sort();
  return files.map((file) => {
    const ext = CODE_EXT.find((e) => file.endsWith(e));
    const stem = file.slice(0, file.length - ext.length);
    const source = readFileSync(join(dir, file), 'utf8');
    return {
      kind: 'base',
      name: pascalFromStem(stem),
      target: `${cleanBaseDir}/${file}`,
      owns: importedLibraries(source, baseLibraries),
      source: 'scan',
    };
  });
}

/** library -> every target (design or base) owning it. */
export function libraryTargets(map) {
  const out = new Map();
  for (const c of map.components ?? []) {
    if (!c.target) continue;
    for (const lib of c.owns ?? []) {
      if (!out.has(lib)) out.set(lib, new Set());
      out.get(lib).add(c.target);
    }
  }
  return out;
}

/** Names of map entries (design and base) absent from the design system export's manifest. */
export function missingFromDesignSystem(map, manifestComponents) {
  const have = new Set((manifestComponents ?? []).map((c) => c.name));
  return (map.components ?? []).filter((c) => !have.has(c.name)).map((c) => c.name).sort();
}

/** The first <exportDir>/_ds/*\/_ds_manifest.json, or null when the export carries none. */
export function findDesignSystemManifest(exportDir) {
  const dsDir = join(exportDir, '_ds');
  if (!existsSync(dsDir)) return null;
  let entries;
  try {
    entries = readdirSync(dsDir, { withFileTypes: true });
  } catch {
    return null;
  }
  const subs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  for (const sub of subs) {
    const p = join(dsDir, sub, '_ds_manifest.json');
    if (existsSync(p)) return p;
  }
  return null;
}
