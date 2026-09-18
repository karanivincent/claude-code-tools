// The functions A2 calls in other slices (docs/ARCHITECTURE.md, Cross-slice functions), loaded
// lazily so one slice's unfinished module never breaks an A2 command that does not need it, and
// so no import cycle can form with A1's gates (which import A2's gate functions).
//
// Test seam: a test sets ctx.deps = { refreshBaseline: async () => ..., ... } and every A2 module
// reads its cross-slice calls through deps(ctx), so a test never depends on whether another slice
// has landed. Nothing in the CLI sets ctx.deps.

const lazy = (path, name) => async (...args) => (await import(path))[name](...args);

const DEFAULTS = Object.freeze({
  // A1
  recordDispatch: lazy('../run/inflight.mjs', 'recordDispatch'),
  clearDispatch: lazy('../run/inflight.mjs', 'clearDispatch'),
  checkReady: lazy('../run/ready.mjs', 'checkReady'),
  // B1
  renderSpec: lazy('../plan/render.mjs', 'renderSpec'),
  unitGateStatus: lazy('../gate/unit.mjs', 'unitGateStatus'),
  runChecks: lazy('../checks/index.mjs', 'runChecks'),
  // B2
  refreshBaseline: lazy('../baseline/refresh.mjs', 'refreshBaseline'),
  deriveSideEffects: lazy('../sidefx/derive.mjs', 'deriveSideEffects'),
  seedCheckGate: lazy('../seed/safety.mjs', 'seedCheckGate'),
  createDataAdapter: lazy('../../adapters/data/supabase.mjs', 'createDataAdapter'),
  // C
  getDesignAdapter: lazy('../../adapters/design/index.mjs', 'getDesignAdapter'),
  validateCaptureItems: lazy('../capture/validate.mjs', 'validateCaptureItems'),
  // time, so tests never sleep
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
});

/**
 * @param {{ deps?: Partial<typeof DEFAULTS> }} ctx
 * @returns {typeof DEFAULTS}
 */
export function deps(ctx) {
  return ctx?.deps ? { ...DEFAULTS, ...ctx.deps } : DEFAULTS;
}

/** True when an error is another slice's "not implemented" stub (exit 2, code not-implemented). */
export function isNotImplemented(err) {
  return Boolean(err && (err.code === 'not-implemented' || err.failures?.some?.((f) => f.code === 'not-implemented')));
}
