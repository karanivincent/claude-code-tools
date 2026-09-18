// spec.md rendering (spec 4.3). Owner: slice B1 (docs/ARCHITECTURE.md).

import { notImplementedError } from '../core/exit.mjs';

/**
 * Render spec.md from plan.json; deterministic (same plan, same bytes).
 * Called by issues sync (A2), which posts it to the epic as one comment.
 * @param {object} plan a plan.json value (schemas/plan.schema.json)
 * @returns {string} markdown
 */
export function renderSpec(plan) {
  throw notImplementedError('B1', 'renderSpec');
}
