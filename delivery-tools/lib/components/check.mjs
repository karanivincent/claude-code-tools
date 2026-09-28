// The `components` ready check (components-first spec §5): whether the run's screens use built
// components, whether a changed file bypasses a base or design component to import its owned
// library directly, whether an added file redraws a component instead of importing it, and
// whether a used component's target is actually wired into anything this PR changes. Pure:
// importsOf and importGraph are the file-reading edges, supplied by the caller
// (lib/run/ready-compute.mjs), so this module never touches disk.

import { effectiveComponentsFor, libraryTargets } from './map.mjs';

const EXT_RE = /\.(tsx|ts|jsx|js|mjs|cjs)$/;
const COMPANION_SUFFIXES = ['.test', '.spec', '.stories'];

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

/** kebab-cased, then split on `-`, `_` and `.`: "PeopleTable" -> ["people", "table"];
 * "my-picker" -> ["my", "picker"]; "timetable" (one word, no separator) -> ["timetable"]. */
function segmentsOf(name) {
  return kebab(name).split(/[-_.]+/).filter(Boolean);
}

/** Whether `needle` appears as a contiguous run of `haystack`'s segments (order and adjacency both matter). */
function containsRun(haystack, needle) {
  if (!needle.length || needle.length > haystack.length) return false;
  for (let i = 0; i + needle.length <= haystack.length; i++) {
    if (needle.every((seg, j) => haystack[i + j] === seg)) return true;
  }
  return false;
}

function ownAllowed(allowOwns, library, file) {
  return (allowOwns ?? []).some((a) => a.library === library && a.file === file);
}

/**
 * Whether `file` is a companion of `target` — the same path, minus extension, plus ".test",
 * ".spec" or ".stories" — rather than a copy of the component sitting somewhere else. Only an
 * exact colocated companion is exempt: a same-named file in a different directory (rule 3's own
 * "picker-panel.tsx" and "picker.stories.tsx" cases) still counts as a redraw.
 */
function isCompanionFile(file, target) {
  if (!target) return false;
  const stem = String(file).replace(EXT_RE, '');
  const targetStem = String(target).replace(EXT_RE, '');
  return COMPANION_SUFFIXES.some((suf) => stem === `${targetStem}${suf}`);
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
 * @param {boolean} [isComponentsRun] whether the run raising this check is itself a components run:
 *   only it can run --mark-built, so rule 1's message differs for a page run
 * @param {{name: string, hash: string}[]|null} [exportComponents] the run's design snapshot, from
 *   readExportComponents; when omitted, rule 1 falls back to each used name's own recorded design
 *   hash (fixing round 1's map-only view for a caller that has no snapshot handy)
 * @param {Set<string>} [importedAnywhere] normalisePath'd targets some tracked file in the repo
 *   imports, regardless of this PR's changes (rule 4's weaker form, spec correction: an update run
 *   that never touches the target's caller still passes when the target is wired in somewhere)
 * @returns {string[]}
 */
export function componentProblems({
  map, used = [], changed = [], added = [], importsOf, importGraph, buildingNow = [],
  isComponentsRun = false, exportComponents = null, importedAnywhere = null,
}) {
  const problems = [];
  const design = (map.components ?? []).filter((c) => c.kind === 'design');
  const byName = new Map(design.map((c) => [c.name, c]));
  const building = new Set(buildingNow);

  // Rule 1: a used component not built, built from a design hash the design has since moved past,
  // or one the map has never heard of at all — which blocks the same as "new" rather than being
  // silently skipped. Status comes from effectiveComponents, computed against the caller's real
  // design snapshot when it has one; without one, each used name's own map-recorded hash stands in,
  // which reproduces the old map-only check.
  const effective = effectiveComponentsFor(map, used, exportComponents);
  for (const name of used) {
    if (building.has(name)) continue;
    if (effective.get(name) === 'built') continue;
    problems.push(isComponentsRun
      ? `${name}: used but not built (delivery components --mark-built ${name}; commit components.json after it)`
      : `${name}: used but not built (run the components run first: delivery intake --components <export>)`);
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

  // Rule 3: an added file named like a component (its kebab name as a whole run of segments of the
  // file's basename, split on -, _ and ., with any prefix or suffix) that is not that component's
  // own target, and not that target's own colocated .test/.spec/.stories companion. A segment must
  // match whole: "Table" does not fire on "timetable.tsx".
  for (const file of added) {
    const fileSegs = segmentsOf(baseStem(file));
    for (const c of design) {
      const nameSegs = segmentsOf(c.name ?? '');
      if (containsRun(fileSegs, nameSegs) && file !== c.target && !isCompanionFile(file, c.target)) {
        problems.push(`${file}: named like ${c.name}; import ${c.target ?? '(no target yet)'} instead of redrawing it`);
      }
    }
  }

  // Rule 4: a used component whose target nothing this PR changes, or what those changes import one
  // level deep, actually imports — and that no other tracked file in the repo imports either. The
  // second half is the weaker form: an update run that never touches the target's own caller still
  // passes when the target is wired in somewhere; rules 2 and 3 remain the catchers for a component
  // quietly duplicated instead of imported.
  const graphFiles = importGraph ? importGraph(changed) : new Set();
  const reached = new Set();
  for (const f of graphFiles) for (const spec of importsOf(f) ?? []) reached.add(normalisePath(spec));
  for (const name of used) {
    if (building.has(name)) continue;
    const c = byName.get(name);
    if (!c || !c.target) continue;
    const target = normalisePath(c.target);
    if (reached.has(target) || importedAnywhere?.has(target)) continue;
    problems.push(`${name}: its target ${c.target} is not imported by anything this PR changes`);
  }

  return problems;
}
