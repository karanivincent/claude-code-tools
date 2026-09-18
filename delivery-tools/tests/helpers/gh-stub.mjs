// An in-memory GitHub implementing the Gh interface of lib/core/gh.mjs: issues, PRs, comments,
// labels, sub-issues, search by marker, and mergeable. Issues and PRs share one number sequence,
// as on GitHub. Inspect `db` in assertions; `setMergeable`, `setHead`, `merge` drive PR state.

import { hasMarker } from '../../lib/core/markers.mjs';
import { DeliveryError, EXIT } from '../../lib/core/exit.mjs';

/**
 * @param {{ repo?: string, login?: string, startAt?: number, clock?: { now(): Date } }} [opts]
 */
export function createGhStub(opts = {}) {
  const repo = opts.repo ?? 'example-org/example-repo';
  const login = opts.login ?? 'founder-login';
  const now = () => (opts.clock ? opts.clock.now() : new Date('2026-01-01T00:00:00Z')).toISOString();
  const db = { issues: new Map(), prs: new Map(), comments: new Map(), labels: new Map(), subIssues: new Map(), writes: [] };
  let next = opts.startAt ?? 1;
  let nextComment = 1000;

  const issueView = (i) => ({ number: i.number, title: i.title, body: i.body, state: i.state, labels: [...i.labels], url: `https://github.invalid/${repo}/issues/${i.number}`, isPr: false });
  const prView = (p) => ({
    number: p.number, title: p.title, body: p.body, state: p.state, isDraft: p.isDraft, headRefName: p.head,
    headRefOid: p.headSha, baseRefName: p.base, mergeable: p.mergeable, labels: [...p.labels],
    url: `https://github.invalid/${repo}/pull/${p.number}`, mergedAt: p.mergedAt, mergeCommit: p.mergeCommit,
  });
  const need = (map, n, what) => {
    const v = map.get(n);
    if (!v) throw new DeliveryError(EXIT.RED, `${what} #${n} not found`, { code: 'gh' });
    return v;
  };
  const log = (op, detail) => db.writes.push({ op, ...detail });

  const gh = {
    repo,
    db,
    async issueCreate({ title, body, labels = [], type = null }) {
      const i = { number: next++, title, body, state: 'open', labels: new Set(labels), type, createdAt: now() };
      db.issues.set(i.number, i);
      log('issueCreate', { number: i.number, title });
      return issueView(i);
    },
    async issueGet(n) { const i = db.issues.get(n); return i ? issueView(i) : null; },
    async issueEdit(n, { title, body, state, addLabels = [], removeLabels = [] }) {
      const i = need(db.issues, n, 'issue');
      if (title !== undefined) i.title = title;
      if (body !== undefined) i.body = body;
      if (state !== undefined) i.state = state;
      for (const l of addLabels) i.labels.add(l);
      for (const l of removeLabels) i.labels.delete(l);
      log('issueEdit', { number: n });
      return issueView(i);
    },
    async issueClose(n, { comment } = {}) {
      if (comment) await gh.commentCreate(n, comment);
      return gh.issueEdit(n, { state: 'closed' });
    },
    async issueList({ state = 'all', labels = [], limit = 1000 } = {}) {
      return [...db.issues.values()]
        .filter((i) => (state === 'all' || i.state === state) && labels.every((l) => i.labels.has(l)))
        .slice(0, limit).map(issueView);
    },
    async findByMarker(marker, { kind = 'issue' } = {}) {
      const out = [];
      if (kind !== 'pr') for (const i of db.issues.values()) if (hasMarker(i.body, marker)) out.push(issueView(i));
      if (kind !== 'issue') for (const p of db.prs.values()) if (hasMarker(p.body, marker)) out.push({ ...issueView({ ...p, labels: p.labels, state: p.state === 'open' ? 'open' : 'closed' }), isPr: true });
      return out;
    },
    async commentList(n) {
      if (!db.issues.has(n) && !db.prs.has(n)) need(db.issues, n, 'issue');
      return (db.comments.get(n) ?? []).map((c) => ({ ...c }));
    },
    async commentCreate(n, body, author = login) {
      if (!db.issues.has(n) && !db.prs.has(n)) need(db.issues, n, 'issue');
      const c = { id: nextComment++, body, author, createdAt: now() };
      db.comments.set(n, [...(db.comments.get(n) ?? []), c]);
      log('commentCreate', { number: n, id: c.id });
      return { ...c };
    },
    async commentEdit(id, body) {
      for (const list of db.comments.values()) {
        const c = list.find((x) => x.id === id);
        if (c) { c.body = body; log('commentEdit', { id }); return { ...c }; }
      }
      throw new DeliveryError(EXIT.RED, `comment ${id} not found`, { code: 'gh' });
    },
    async findCommentByMarker(n, marker) {
      return (await gh.commentList(n)).find((c) => hasMarker(c.body, marker)) ?? null;
    },
    async prCreate({ title, body, base, head, draft = true, labels = [] }) {
      const p = { number: next++, title, body, base, head, isDraft: draft, state: 'open', labels: new Set(labels), mergeable: 'MERGEABLE',
        headSha: 'a'.repeat(40), mergedAt: null, mergeCommit: null, files: [], createdAt: now() };
      db.prs.set(p.number, p);
      log('prCreate', { number: p.number, title });
      return prView(p);
    },
    async prGet(n) { const p = db.prs.get(n); return p ? prView(p) : null; },
    async prEdit(n, { title, body, addLabels = [] }) {
      const p = need(db.prs, n, 'PR');
      if (title !== undefined) p.title = title;
      if (body !== undefined) p.body = body;
      for (const l of addLabels) p.labels.add(l);
      log('prEdit', { number: n });
      return prView(p);
    },
    async prList({ state = 'open', labels = [], search, limit = 100 } = {}) {
      return [...db.prs.values()]
        .filter((p) => state === 'all' || p.state === state)
        .filter((p) => labels.every((l) => p.labels.has(l)))
        .filter((p) => !search || `${p.title}\n${p.body}`.includes(search))
        .slice(0, limit).map(prView);
    },
    async prFiles(n) { return [...need(db.prs, n, 'PR').files]; },
    async labelEnsure(name, { color = 'ededed', description = '' } = {}) {
      db.labels.set(name, { color, description });
      log('labelEnsure', { name });
    },
    async addSubIssue(parent, child) {
      need(db.issues, parent, 'issue');
      need(db.issues, child, 'issue');
      db.subIssues.set(parent, [...new Set([...(db.subIssues.get(parent) ?? []), child])]);
      log('addSubIssue', { parent, child });
    },
    async whoami() { return login; },
    async api(method, path) {
      throw new Error(`gh stub: api ${method} ${path} is not emulated; add it to tests/helpers/gh-stub.mjs`);
    },

    // Test drivers, not part of the Gh interface.
    setMergeable(n, value) { need(db.prs, n, 'PR').mergeable = value; },
    setHead(n, sha) { need(db.prs, n, 'PR').headSha = sha; },
    setFiles(n, files) { need(db.prs, n, 'PR').files = [...files]; },
    markReady(n) { need(db.prs, n, 'PR').isDraft = false; },
    merge(n, mergeCommit = 'b'.repeat(40)) {
      const p = need(db.prs, n, 'PR');
      Object.assign(p, { state: 'merged', mergedAt: now(), mergeCommit });
    },
    addComment(n, body, author) { return gh.commentCreate(n, body, author); },
  };
  return gh;
}
