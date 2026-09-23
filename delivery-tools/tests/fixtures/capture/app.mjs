// A tiny app for delivery-tools' capture template test: sign-in through a confirm link, a version
// route, a widgets page in two locales, a duplicate action that creates a row, a refresh action a
// plan intercepts, a page that logs an error, and an analytics beacon a read-only capture must abort.
//   node app.mjs --port <n>        (BUILD_SHA in the environment is what /api/version reports)
import { createServer } from 'node:http';

const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const port = Number(arg('--port') || process.env.PORT || 0);
let copies = 0;
const posts = [];

const WORDS = {
  en: { title: 'Widgets', stock: (n) => `${n} widgets in stock`, empty: 'No widgets yet', dup: 'Duplicate', refresh: 'Refresh', del: 'Delete', made: 'Copy made', failed: 'Refresh failed' },
  fr: { title: 'Widgets', stock: (n) => `${n} widgets en stock`, empty: 'Pas encore de widgets', dup: 'Dupliquer', refresh: 'Actualiser', del: 'Supprimer', made: 'Copie faite', failed: 'Échec' },
};

function page(title, body, script = '') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;margin:24px} li{margin:4px 0} button{margin-right:8px}</style></head>
<body>${body}<script>${script}</script></body></html>`;
}

function widgets(locale, url) {
  const w = WORDS[locale];
  if (url.searchParams.get('empty') === '1') {
    return page(w.title, `<h1>${w.title}</h1><p data-testid="widget-empty">${w.empty}</p>`);
  }
  const n = 3 + copies;
  const broken = url.searchParams.get('broken') === '1';
  return page(w.title, `<h1>${w.title}</h1>
<p id="count">${w.stock(n)}</p>
<ul data-testid="widget-list"><li>Blue widget</li><li>Red widget</li><li>Green widget</li></ul>
<button data-testid="widget-duplicate">${w.dup}</button><button data-testid="widget-refresh">${w.refresh}</button><button data-testid="widget-delete" disabled>${w.del}</button>
<p id="status" role="status"></p>`, `
fetch('/api/track', { method: 'POST', body: 'view' }).catch(function () {});
${broken ? "console.error('widgets: boom');" : ''}
document.querySelector('[data-testid=widget-duplicate]').addEventListener('click', function () {
  fetch('/api/widgets', { method: 'POST' }).then(function (r) { return r.json(); }).then(function () {
    document.getElementById('status').textContent = ${JSON.stringify(w.made)};
  });
});
document.querySelector('[data-testid=widget-refresh]').addEventListener('click', function () {
  fetch('/api/refresh', { method: 'POST' }).then(function (r) {
    document.getElementById('status').textContent = r.ok ? 'Up to date' : ${JSON.stringify(w.failed)};
  });
});`);
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  const cookie = /(?:^|;\s*)session=([^;]+)/.exec(req.headers.cookie || '');
  const send = (status, body, type = 'text/html; charset=utf-8', extra = {}) => { res.writeHead(status, { 'content-type': type, ...extra }); res.end(body); };
  if (req.method === 'POST') {
    posts.push(url.pathname);
    if (url.pathname === '/api/widgets') { copies++; return send(201, JSON.stringify({ id: `w-copy-${copies}` }), 'application/json'); }
    if (url.pathname === '/api/refresh') return send(200, JSON.stringify({ ok: true }), 'application/json');
    if (url.pathname === '/api/track') return send(204, '');
    return send(404, 'no');
  }
  if (url.pathname === '/api/version') return send(200, JSON.stringify({ sha: process.env.BUILD_SHA || null }), 'application/json');
  if (url.pathname === '/api/posts') return send(200, JSON.stringify(posts), 'application/json');
  if (url.pathname === '/auth/confirm') {
    const email = url.searchParams.get('email') || '';
    const next = url.searchParams.get('next') || '/';
    return send(302, '', 'text/plain', { location: next, 'set-cookie': `session=${encodeURIComponent(email)}; Path=/; HttpOnly` });
  }
  if (url.pathname === '/login') return send(200, page('Sign in', '<h1>Sign in</h1>'));
  if (url.pathname === '/favicon.ico') return send(204, '');
  const m = /^\/(en|fr)\/widgets$/.exec(url.pathname);
  if (m) {
    if (!cookie) return send(302, '', 'text/plain', { location: '/login' });
    return send(200, widgets(m[1], url));
  }
  return send(404, page('Not found', '<h1>Not found</h1>'));
});
server.listen(port, '127.0.0.1');
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => server.close(() => process.exit(0)));
