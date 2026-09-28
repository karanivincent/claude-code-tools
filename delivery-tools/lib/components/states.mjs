// Component states (components-first spec §3): the design states a components run pictures for one
// component (its defaults, one state per distinct literal prop set among its import sites, plus the
// states it draws itself), and the gallery/inventory data built from them. Pure.

/** Derived states: added when the component declares the prop and no earlier state has that value. */
const DERIVED = [
  ['open', true],
  ['range', true],
  ['note', 'Example note'],
  ['bad', true],
  ['error', 'Example error'],
];

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** The literal-only attrs of one import site, as a plain object with keys sorted. */
function literalSet(site) {
  const entries = Object.entries(site.attrs ?? {})
    .filter(([, v]) => v && Object.prototype.hasOwnProperty.call(v, 'literal'))
    .map(([k, v]) => [k, v.literal])
    .sort(([a], [b]) => a.localeCompare(b));
  return Object.fromEntries(entries);
}

/** Whether some earlier prop set already carries this exact key/value pair. */
function has(sets, name, value) {
  return sets.some((props) => Object.prototype.hasOwnProperty.call(props, name) && props[name] === value);
}

/**
 * The design states one component draws: its defaults, one per distinct literal attribute set
 * among its sites (in order of first appearance, sites sorted by file then line, empty sets
 * dropped, duplicates dropped), then the states it declares itself (open, range, note, bad, error)
 * when the component declares that prop and no earlier state already has that value.
 * @param {import('../design/components.mjs').DesignComponent} component
 * @returns {{ id: string, props: object }[]}
 */
export function componentStates(component) {
  const propSets = [{}];

  const sites = [...(component.sites ?? [])].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  const seen = new Set();
  for (const site of sites) {
    const set = literalSet(site);
    if (Object.keys(set).length === 0) continue;
    const key = JSON.stringify(set);
    if (seen.has(key)) continue;
    seen.add(key);
    propSets.push(set);
  }

  const declared = component.props ?? {};
  for (const [name, value] of DERIVED) {
    if (!(name in declared)) continue;
    if (has(propSets, name, value)) continue;
    propSets.push({ [name]: value });
  }

  return propSets.map((props, i) => ({ id: `C-${component.name}-${pad2(i + 1)}`, props }));
}

/** Every component's states, in build order (components not present in `order` are skipped). */
function allStates(components, order) {
  const byName = new Map(components.map((c) => [c.name, c]));
  const out = [];
  for (const name of order) {
    const c = byName.get(name);
    if (!c) continue;
    for (const st of componentStates(c)) out.push({ component: c, id: st.id, props: st.props });
  }
  return out;
}

/**
 * gallery-states.json: what the built gallery page renders each state with. Written by intake, so
 * the design render and the gallery use the same values.
 * @param {import('../design/components.mjs').DesignComponent[]} components
 * @param {string[]} order component names, build order (componentOrder)
 * @returns {{ states: { id: string, component: string, props: object }[] }}
 */
export function galleryStates(components, order) {
  return { states: allStates(components, order).map(({ id, component, props }) => ({ id, component: component.name, props })) };
}

/** '<Name>: defaults', else '<Name>: label=Dates, range=true'. */
function summary(name, props) {
  const keys = Object.keys(props);
  const rest = keys.length ? keys.map((k) => `${k}=${props[k]}`).join(', ') : 'defaults';
  return `${name}: ${rest}`;
}

/**
 * The inventory rows a components run adds: one per component state, reached by rendering the
 * component's own file with these props (the same path a prop state with a file already renders).
 * The caller (intake) wraps this in the rest of the Inventory shape (schemaVersion, feature,
 * designTreeSha256, candidates).
 * @param {import('../design/components.mjs').DesignComponent[]} components
 * @param {string[]} order component names, build order (componentOrder)
 * @returns {{ states: object[] }}
 */
export function componentsInventory(components, order) {
  return {
    states: allStates(components, order).map(({ id, component, props }) => ({
      id,
      screen: component.name,
      name: summary(component.name, props),
      reach: { kind: 'prop', file: component.file, props },
      shots: [],
      render: { status: 'ok' },
      controls: [],
    })),
  };
}
