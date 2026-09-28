// The `components` ready check (components-first spec §5): whether the run's screens use built
// components, whether a changed file bypasses a base or design component to import its owned
// library directly, whether an added file redraws a component instead of importing it, and
// whether a used component's target is actually wired into anything this PR changes. Pure:
// importsOf and importGraph are the file-reading edges, supplied by the caller
// (lib/run/ready-compute.mjs), so this module never touches disk.

import { libraryTargets } from './map.mjs';

const EXT_RE = /\.(tsx|ts|jsx|js|mjs|cjs)$/;

/** Extensionless form of a resolved path, with a trailing "/index" also dropped, for comparing an
 * import specifier (which may not carry a real extension) against a recorded target. */
export function normalisePath(path) {
  return String(path).replace(EXT_RE, '').replace(/\/index$/, '');
}

/** Union of the component names the run's design states show, sorted and deduped. */
export function usedComponents(stateNames) {
  const out = new Set();
  for (const names of stateNames ?? []) for (const n of names ?? []) out.add(n);
  return [...out].sort();
}

/** kebab-case of a PascalCase or camelCase name: "DatePicker" -> "date-picker". */
function kebab(name) {
  return String(name)
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

/** A file's basename, without its extension and a trailing ".test": "my-picker.test.tsx" -> "my-picker". */
function baseStem(file) {
  const name = String(file).slice(String(file).lastIndexOf('/') + 1).replace(EXT_RE, '');
  return name.endsWith('.test') ? name.slice(0, -5) : name;
}

function ownAllowed(allowOwns, library, file) {
  return (allowOwns ?? []).some((a) => a.library === library && a.file === file);
}

/**
 * The `components` ready check's problems (components-first spec §5, rules 1-4), one line per hit.
 * @param {object} map components.json
 * @param {string[]} [used] component names the run's screens show
 * @param {string[]} [changed] repo-relative paths changed in the PR
 * @param {string[]} [added] repo-relative paths added in the PR
 * @param {(path: string) => string[]} importsOf module specifiers a file imports: a relative or
 *   `@/` alias specifier resolved to a repo path by the caller (extensionless is fine); a package
 *   specifier left as its own name
 * @param {(paths: string[]) => Set<string>} importGraph those files plus what they import inside
 *   the repo, one level deep
 * @param {string[]} [buildingNow] component names a components run is building (skips rules 1 and 4)
 * @returns {string[]}
 */
export function componentProblems({ map, used = [], changed = [], added = [], importsOf, importGraph, buildingNow = [] }) {
  const problems = [];
  const design = (map.components ?? []).filter((c) => c.kind === 'design');
  const byName = new Map(design.map((c) => [c.name, c]));
  const building = new Set(buildingNow);

  // Rule 1: a used component not built, or built from a design hash the design has since moved past.
  for (const name of used) {
    if (building.has(name)) continue;
    const c = byName.get(name);
    if (!c) continue;
    if (c.status !== 'built' || c.builtHash !== c.design.hash) {
      problems.push(`${name}: used but not built (delivery components --mark-built ${name})`);
    }
  }

  // Rule 2: a changed file that imports a library some entry owns, without being one of its
  // targets or an allowed exception.
  const targets = libraryTargets(map);
  for (const file of changed) {
    for (const spec of importsOf(file) ?? []) {
      const owners = targets.get(spec);
      if (!owners || owners.has(file) || ownAllowed(map.allowOwns, spec, file)) continue;
      problems.push(`${file}: imports ${spec} directly; use ${[...owners].sort().join(' or ')} instead`);
    }
  }

  // Rule 3: an added file named like a component (a prefix or suffix around its kebab name) that
  // is not that component's own target.
  for (const file of added) {
    const stem = kebab(baseStem(file));
    for (const c of design) {
      if (!c.name || stem === '') continue;
      if (stem.includes(kebab(c.name)) && file !== c.target) {
        problems.push(`${file}: named like ${c.name}; import ${c.target ?? '(no target yet)'} instead of redrawing it`);
      }
    }
  }

  // Rule 4: a used component whose target nothing this PR changes, or what those changes import
  // one level deep, actually imports.
  const graphFiles = importGraph ? importGraph(changed) : new Set();
  const reached = new Set();
  for (const f of graphFiles) for (const spec of importsOf(f) ?? []) reached.add(normalisePath(spec));
  for (const name of used) {
    if (building.has(name)) continue;
    const c = byName.get(name);
    if (!c || !c.target) continue;
    if (!reached.has(normalisePath(c.target))) {
      problems.push(`${name}: its target ${c.target} is not imported by anything this PR changes`);
    }
  }

  return problems;
}
