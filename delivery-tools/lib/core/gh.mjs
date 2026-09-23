// A thin GitHub wrapper over the `gh` CLI, through the runner. tests/helpers/gh-stub.mjs implements
// the same interface in memory; commands only ever see ctx.gh, so every GitHub write in a test
// lands in that stub. Nothing here decides idempotency: callers search by marker first.

import { ConfigError, DeliveryError, EXIT, WaitError } from './exit.mjs';
import { hasMarker } from './markers.mjs';

/**
 * @typedef {{ number: number, title: string, body: string, state: 'open'|'closed', labels: string[], url: string, isPr: boolean }} Issue
 * @typedef {{ id: number, body: string, author: string, createdAt: string }} Comment
 * @typedef {{ number: number, title: string, body: string, state: 'open'|'closed'|'merged', isDraft: boolean,
 *             headRefName: string, headRefOid: string, baseRefName: string,
 *             mergeable: 'MERGEABLE'|'CONFLICTING'|'UNKNOWN', labels: string[], url: string,
 *             mergedAt: string|null, mergeCommit: string|null }} Pr
 * @typedef {object} Gh
 * @property {string} repo "owner/name"
 * @property {(i: { title: string, body: string, labels?: string[], type?: string|null }) => Promise<Issue>} issueCreate
 * @property {(n: number) => Promise<Issue|null>} issueGet
 * @property {(n: number, e: { title?: string, body?: string, state?: 'open'|'closed', addLabels?: string[], removeLabels?: string[] }) => Promise<Issue>} issueEdit
 * @property {(n: number, o?: { comment?: string }) => Promise<Issue>} issueClose
 * @property {(o?: { state?: 'open'|'closed'|'all', labels?: string[], limit?: number }) => Promise<Issue[]>} issueList  issues only, no PRs
 * @property {(marker: string, o?: { kind?: 'issue'|'pr'|'any' }) => Promise<Issue[]>} findByMarker  open and closed; exact marker in the body
 * @property {(n: number) => Promise<Comment[]>} commentList
 * @property {(n: number, body: string) => Promise<Comment>} commentCreate
 * @property {(id: number, body: string) => Promise<Comment>} commentEdit
 * @property {(n: number, marker: string) => Promise<Comment|null>} findCommentByMarker
 * @property {(p: { title: string, body: string, base: string, head: string, draft?: boolean, labels?: string[] }) => Promise<Pr>} prCreate
 * @property {(n: number) => Promise<Pr|null>} prGet
 * @property {(n: number, e: { title?: string, body?: string, addLabels?: string[] }) => Promise<Pr>} prEdit
 * @property {(o?: { state?: 'open'|'closed'|'merged'|'all', labels?: string[], search?: string, limit?: number }) => Promise<Pr[]>} prList
 * @property {(n: number) => Promise<string[]>} prFiles
 * @property {(name: string, o?: { color?: string, description?: string }) => Promise<void>} labelEnsure
 * @property {(parent: number, child: number) => Promise<void>} addSubIssue
 * @property {() => Promise<string>} whoami
 * @property {(method: string, path: string, o?: { body?: unknown, jq?: string, paginate?: boolean }) => Promise<any>} api
 */

const PR_FIELDS = 'number,title,body,state,isDraft,headRefName,headRefOid,baseRefName,mergeable,labels,url,mergedAt,mergeCommit';

/**
 * @param {import('./run.mjs').Runner} runner
 * @param {{ repo: string, cwd?: string }} opts
 * @returns {Gh}
 */
export function createGh(runner, { repo, cwd }) {
  async function gh(args, { input, allow404 = false } = {}) {
    const r = await runner.run('gh', args, { cwd, input });
    if (r.code === 0) return r.stdout;
    const err = String(r.stderr);
    if (allow404 && /HTTP 404|Could not resolve|not found/i.test(err)) return null;
    throw classify(args, err, r.code);
  }
  async function api(method, path, { body, jq, paginate = false } = {}) {
    const args = ['api', '-X', method, path];
    if (paginate) args.push('--paginate');
    if (jq) args.push('--jq', jq);
    if (body !== undefined) args.push('--input', '-');
    const out = await gh(args, { input: body === undefined ? undefined : JSON.stringify(body), allow404: method === 'GET' });
    if (out === null) return null;
    if (jq) return out.split('\n').filter(Boolean).map((l) => JSON.parse(l));
    return out.trim() ? JSON.parse(out) : null;
  }
  const self = {
    repo,
    api,
    async issueCreate({ title, body, labels = [], type = null }) {
      return toIssue(await api('POST', `repos/${repo}/issues`, { body: { title, body, labels, ...(type ? { type } : {}) } }));
    },
    async issueGet(n) {
      const raw = await api('GET', `repos/${repo}/issues/${n}`);
      return raw ? toIssue(raw) : null;
    },
    async issueEdit(n, { title, body, state, addLabels = [], removeLabels = [] }) {
      const patch = {};
      if (title !== undefined) patch.title = title;
      if (body !== undefined) patch.body = body;
      if (state !== undefined) patch.state = state;
      if (Object.keys(patch).length) await api('PATCH', `repos/${repo}/issues/${n}`, { body: patch });
      if (addLabels.length) await api('POST', `repos/${repo}/issues/${n}/labels`, { body: { labels: addLabels } });
      for (const l of removeLabels) await api('DELETE', `repos/${repo}/issues/${n}/labels/${encodeURIComponent(l)}`);
      return self.issueGet(n);
    },
    async issueClose(n, { comment } = {}) {
      if (comment) await self.commentCreate(n, comment);
      return self.issueEdit(n, { state: 'closed' });
    },
    async issueList({ state = 'all', labels = [], limit = 1000 } = {}) {
      const q = `state=${state}&per_page=100${labels.length ? `&labels=${encodeURIComponent(labels.join(','))}` : ''}`;
      const rows = (await api('GET', `repos/${repo}/issues?${q}`, { paginate: true, jq: '.[]' })) ?? [];
      return rows.filter((r) => !r.pull_request).slice(0, limit).map(toIssue);
    },
    async findByMarker(marker, { kind = 'issue' } = {}) {
      const inner = marker.replace(/^<!--\s*/, '').replace(/\s*-->$/, '');
      const type = kind === 'issue' ? ' is:issue' : kind === 'pr' ? ' is:pr' : '';
      const q = encodeURIComponent(`repo:${repo}${type} in:body "${inner}"`);
      const rows = (await api('GET', `search/issues?q=${q}&per_page=100`, { jq: '.items[]' })) ?? [];
      return rows.map(toIssue).filter((i) => hasMarker(i.body, marker));
    },
    async commentList(n) {
      const rows = (await api('GET', `repos/${repo}/issues/${n}/comments?per_page=100`, { paginate: true, jq: '.[]' })) ?? [];
      return rows.map(toComment);
    },
    async commentCreate(n, body) {
      return toComment(await api('POST', `repos/${repo}/issues/${n}/comments`, { body: { body } }));
    },
    async commentEdit(id, body) {
      return toComment(await api('PATCH', `repos/${repo}/issues/comments/${id}`, { body: { body } }));
    },
    async findCommentByMarker(n, marker) {
      return (await self.commentList(n)).find((c) => hasMarker(c.body, marker)) ?? null;
    },
    async prCreate({ title, body, base, head, draft = true, labels = [] }) {
      const args = ['pr', 'create', '--repo', repo, '--title', title, '--body-file', '-', '--base', base, '--head', head];
      if (draft) args.push('--draft');
      for (const l of labels) args.push('--label', l);
      const out = await gh(args, { input: body });
      const n = Number(String(out).trim().match(/\/pull\/(\d+)/)?.[1]);
      if (!n) throw new DeliveryError(EXIT.RED, `gh pr create printed no PR URL: ${String(out).trim()}`, { code: 'gh' });
      return self.prGet(n);
    },
    async prGet(n) {
      const out = await gh(['pr', 'view', String(n), '--repo', repo, '--json', PR_FIELDS], { allow404: true });
      return out ? toPr(JSON.parse(out)) : null;
    },
    async prEdit(n, { title, body, addLabels = [] }) {
      const args = ['pr', 'edit', String(n), '--repo', repo];
      if (title !== undefined) args.push('--title', title);
      if (body !== undefined) args.push('--body-file', '-');
      for (const l of addLabels) args.push('--add-label', l);
      await gh(args, { input: body });
      return self.prGet(n);
    },
    async prList({ state = 'open', labels = [], search, limit = 100 } = {}) {
      const args = ['pr', 'list', '--repo', repo, '--state', state, '--json', PR_FIELDS, '--limit', String(limit)];
      for (const l of labels) args.push('--label', l);
      if (search) args.push('--search', search);
      return JSON.parse((await gh(args)) || '[]').map(toPr);
    },
    async prFiles(n) {
      const out = await gh(['pr', 'view', String(n), '--repo', repo, '--json', 'files', '--jq', '.files[].path']);
      return String(out).split('\n').filter(Boolean);
    },
    async labelEnsure(name, { color = 'ededed', description = '' } = {}) {
      await gh(['label', 'create', name, '--repo', repo, '--color', color, '--description', description, '--force']);
    },
    async addSubIssue(parent, child) {
      const c = await api('GET', `repos/${repo}/issues/${child}`);
      if (!c) throw new DeliveryError(EXIT.RED, `issue #${child} not found`, { code: 'gh' });
      await api('POST', `repos/${repo}/issues/${parent}/sub_issues`, { body: { sub_issue_id: c.id } });
    },
    async whoami() {
      return String(await gh(['api', 'user', '--jq', '.login'])).trim();
    },
  };
  return self;
}

function classify(args, stderr, code) {
  const first = stderr.trim().split('\n')[0] || `exit ${code}`;
  const what = `gh ${args.slice(0, 3).join(' ')}`;
  if (/HTTP 5\d\d|rate limit|timeout|timed out|connection|ECONNRESET|EAI_AGAIN/i.test(stderr)) return new WaitError(`${what}: ${first}`);
  if (/HTTP 401|HTTP 403|auth|not logged in/i.test(stderr)) return new ConfigError(`${what}: ${first}`);
  return new DeliveryError(EXIT.RED, `${what}: ${first}`, { code: 'gh' });
}

function toIssue(r) {
  return {
    number: r.number,
    title: r.title ?? '',
    body: r.body ?? '',
    state: String(r.state ?? 'open').toLowerCase() === 'closed' ? 'closed' : 'open',
    labels: (r.labels ?? []).map((l) => (typeof l === 'string' ? l : l.name)),
    url: r.html_url ?? r.url ?? '',
    isPr: Boolean(r.pull_request),
  };
}

function toComment(r) {
  return { id: r.id, body: r.body ?? '', author: r.user?.login ?? r.author ?? '', createdAt: r.created_at ?? r.createdAt ?? '' };
}

function toPr(r) {
  const state = String(r.state ?? 'OPEN').toUpperCase();
  return {
    number: r.number,
    title: r.title ?? '',
    body: r.body ?? '',
    state: state === 'MERGED' ? 'merged' : state === 'CLOSED' ? 'closed' : 'open',
    isDraft: Boolean(r.isDraft),
    headRefName: r.headRefName ?? '',
    headRefOid: r.headRefOid ?? '',
    baseRefName: r.baseRefName ?? '',
    mergeable: ['MERGEABLE', 'CONFLICTING'].includes(r.mergeable) ? r.mergeable : 'UNKNOWN',
    labels: (r.labels ?? []).map((l) => (typeof l === 'string' ? l : l.name)),
    url: r.url ?? '',
    mergedAt: r.mergedAt ?? null,
    mergeCommit: r.mergeCommit?.oid ?? null,
  };
}
