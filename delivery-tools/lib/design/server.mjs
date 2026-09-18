// A static file server over loopback for the design snapshot (spec 4.2 step 3). It serves one
// directory, refuses anything outside it, and lives only as long as the command that started it.

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join, normalize, sep, extname } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

/** @param {string} path */
export function contentTypeFor(path) {
  return TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream';
}

/**
 * The file a request path maps to, or null when it escapes the root.
 * @param {string} root absolute
 * @param {string} urlPath
 */
export function resolveServedPath(root, urlPath) {
  let decoded;
  try { decoded = decodeURIComponent(String(urlPath).split('?')[0].split('#')[0]); } catch { return null; }
  if (decoded.includes('\0')) return null;
  const full = normalize(join(root, decoded));
  const withSep = root.endsWith(sep) ? root : root + sep;
  return full.startsWith(withSep) ? full : null;
}

/**
 * @param {string} root absolute directory to serve
 * @param {{ port?: number, host?: string }} [opts]
 * @returns {Promise<{ origin: string, port: number, url: (rel: string) => string, close: () => Promise<void> }>}
 */
export async function startStaticServer(root, opts = {}) {
  const host = opts.host ?? '127.0.0.1';
  const server = createServer(async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
    const file = resolveServedPath(root, req.url ?? '/');
    let st = null;
    if (file) { try { st = await stat(file); } catch { st = null; } }
    if (!file || !st || !st.isFile()) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found'); return; }
    res.writeHead(200, { 'content-type': contentTypeFor(file), 'content-length': st.size, 'cache-control': 'no-store' });
    if (req.method === 'HEAD') { res.end(); return; }
    createReadStream(file).on('error', () => res.destroy()).pipe(res);
  });
  const sockets = new Set();
  server.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port ?? 0, host, resolve);
  });
  const { port } = server.address();
  const origin = `http://${host}:${port}`;
  return {
    origin,
    port,
    url: (rel) => `${origin}/${String(rel).split('/').map(encodeURIComponent).join('/')}`,
    close: () => new Promise((resolve) => {
      for (const s of sockets) s.destroy();
      server.close(() => resolve());
    }),
  };
}
