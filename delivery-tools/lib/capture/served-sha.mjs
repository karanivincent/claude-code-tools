// The served-SHA probe (spec 6.2 item 3, M15). Owner: slice C (docs/ARCHITECTURE.md).

import { parseVersionProbe } from './job.mjs';

/**
 * A commit SHA in a version route's answer: JSON { sha | commit | gitSha | version | ... } or text.
 * @param {string} body
 * @returns {string|null}
 */
export function shaFromBody(body) {
  const text = String(body ?? '').trim();
  if (!text) return null;
  try {
    const v = JSON.parse(text);
    const pick = (o) => {
      if (!o || typeof o !== 'object') return null;
      for (const k of ['sha', 'commit', 'commitSha', 'gitSha', 'git_sha', 'revision', 'version', 'build']) {
        if (typeof o[k] === 'string' && /^[0-9a-f]{7,40}$/i.test(o[k].trim())) return o[k].trim().toLowerCase();
      }
      for (const val of Object.values(o)) { const s = pick(val); if (s) return s; }
      return null;
    };
    if (typeof v === 'string') return /^[0-9a-f]{7,40}$/i.test(v.trim()) ? v.trim().toLowerCase() : null;
    return pick(v);
  } catch {
    const m = /\b[0-9a-f]{40}\b/i.exec(text) ?? /\b[0-9a-f]{7,39}\b/i.exec(text);
    return m ? m[0].toLowerCase() : null;
  }
}

/**
 * Ask the deployment which commit it serves, with profile.commands.versionProbe (for example
 * "GET /api/version") against baseUrl. Null when the route is absent or unreadable.
 * Called by ready (A1) and capture (C).
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {string} baseUrl
 * @param {{ fetch?: typeof fetch, timeoutMs?: number }} [opts] fetch is injectable for tests
 * @returns {Promise<string|null>}
 */
export async function probeServedSha(ctx, baseUrl, opts = {}) {
  const profile = await ctx.profile();
  const probe = parseVersionProbe(profile.commands.versionProbe);
  if (!probe || !baseUrl) return null;
  let url;
  try { url = new URL(probe.path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`); } catch { return null; }
  const doFetch = opts.fetch ?? globalThis.fetch;
  try {
    const res = await doFetch(url, { method: probe.method, headers: { accept: 'application/json, text/plain' }, redirect: 'follow', signal: AbortSignal.timeout(opts.timeoutMs ?? 15000) });
    if (!res.ok) return null;
    return shaFromBody(await res.text());
  } catch {
    return null;
  }
}
