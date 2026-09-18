// Preview resolution by SHA (spec 4.5, 4.6). Owner: slice A2 (docs/ARCHITECTURE.md).
//
// The preview is found by the commit it serves, never by branch, so a capture of it grades exactly
// that commit (the version route then confirms). The profile's resolver prints the URL; the last
// http(s) URL in its output is taken. A resolver that is still waiting (our timeout, or its own
// "still building" / "within N s" message) is pending, not red.

import { fillCommand } from '../core/profile.mjs';
import { lastLine } from './run-info.mjs';

export const PREVIEW_TIMEOUT_MS = 16 * 60_000;

/** The last URL a resolver printed, without trailing punctuation. */
export function lastUrl(text) {
  const all = [...String(text ?? '').matchAll(/https?:\/\/[^\s"'<>`]+/g)].map((m) => m[0].replace(/[.,;:)\]]+$/, ''));
  return all.length ? all[all.length - 1] : null;
}

const PENDING_RE = /still building|pending|not (yet )?ready|timed out|timeout|within \d+\s*s/i;

/**
 * Resolve the preview URL serving exactly this SHA with profile.commands.previewUrl ({sha} filled).
 * With environments.previews "none", returns url null and detail naming the local production build
 * that stands in. A preview not built yet is { url: null, pending: true } (the caller exits 4).
 * Called by capture (C) for wave and full modes, and by ready (A1).
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {{ sha: string, timeoutMs?: number }} opts
 * @returns {Promise<{ url: string|null, pending: boolean, detail: string }>}
 */
export async function resolvePreview(ctx, { sha, timeoutMs = PREVIEW_TIMEOUT_MS }) {
  const profile = await ctx.profile();
  if (profile.environments.previews === 'none') {
    return {
      url: null, pending: false,
      detail: `this repo has no previews; a local production build stands in (${profile.commands.prodBuild}, then ${profile.commands.prodStart}), reported as such`,
    };
  }
  const cmd = fillCommand(profile.commands.previewUrl, { sha });
  const r = await ctx.runner.sh(cmd, { cwd: ctx.repoRoot, timeoutMs });
  const said = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
  if (r.code === 0) {
    const url = lastUrl(r.stdout) ?? lastUrl(r.stderr);
    if (url) return { url, pending: false, detail: `preview for ${sha.slice(0, 7)}: ${url}` };
    return { url: null, pending: false, detail: `the preview resolver exited 0 for ${sha.slice(0, 7)} but printed no URL: ${lastLine(r.stdout, r.stderr) || 'no output'}` };
  }
  if (r.code === 124 || PENDING_RE.test(said)) {
    return { url: null, pending: true, detail: `no preview serving ${sha.slice(0, 7)} yet (${lastLine(r.stderr, r.stdout) || `exit ${r.code}`})` };
  }
  return { url: null, pending: false, detail: `the preview resolver failed for ${sha.slice(0, 7)} (exit ${r.code}): ${lastLine(r.stderr, r.stdout) || 'no output'}` };
}
