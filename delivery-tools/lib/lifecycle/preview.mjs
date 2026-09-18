// Preview resolution by SHA (spec 4.5, 4.6). Owner: slice A2 (docs/ARCHITECTURE.md).

import { notImplementedError } from '../core/exit.mjs';

/**
 * Resolve the preview URL serving exactly this SHA with profile.commands.previewUrl ({sha} filled).
 * With environments.previews "none", returns url null and detail naming the local production build
 * that stands in. A preview not built yet is { url: null, pending: true } (the caller exits 4).
 * Called by capture (C) for wave and full modes, and by ready (A1).
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {{ sha: string }} opts
 * @returns {Promise<{ url: string|null, pending: boolean, detail: string }>}
 */
export async function resolvePreview(ctx, { sha }) {
  throw notImplementedError('A2', 'resolvePreview');
}
