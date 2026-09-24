// Side-effect map derivation (spec 7.1). Every run reads the worker code afresh (there is no
// cache to trust), at the base branch the test environment runs and at the branch being built,
// and writes .delivery/<feature>/sidefx.json:
//   ts    `.from('<table>')` chains with literal filters in safety.workers.tsGlobs;
//   sql   the where clauses of the latest definition of every `.rpc('<fn>')` those files call;
//   cron  the test database's scheduled jobs, parsed like function bodies;
//   hand  safety.forbiddenStates.
// Every predicate is actionable by default: only a founder-approved guard makes a match acceptable.

import { DeliveryError, EXIT } from '../core/exit.mjs';
import { writeArtefact } from '../core/artefacts.mjs';
import { refReader, readGlobs } from './source.mjs';
import { extractTsChains } from './ts-chains.mjs';
import { indexFunctions, sqlPredicates, parseCronCommand, sqlTokenize } from './sql.mjs';

/**
 * Derive (and write) .delivery/<feature>/sidefx.json from the worker globs, the SQL definitions of
 * every .rpc() they call, the scheduled jobs and the hand-listed forbidden states. A worker file
 * whose hash changed since the last run is re-read, never trusted from a cache.
 * Called by the sidefx command and preflight P6 (A2).
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {{ refs?: string[], cron?: 'db'|'skip', write?: boolean }} [opts]
 *   refs: git refs to read (default origin/<base> and HEAD); cron: 'skip' leaves cron.job unread
 * @returns {Promise<object>} the sidefx.json value (schemas/sidefx.schema.json)
 */
export async function deriveSideEffects(ctx, opts = {}) {
  const { sidefx, failures } = await deriveWithReport(ctx, opts);
  if (failures.length) {
    throw new DeliveryError(EXIT.RED, `the side-effect map is incomplete (${failures.length} item(s)); seeding stays refused`, { code: 'sidefx', failures });
  }
  return sidefx;
}

/**
 * The same derivation, returning what could not be modelled instead of throwing.
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @param {{ refs?: string[], cron?: 'db'|'skip', write?: boolean }} [opts]
 * @returns {Promise<{ sidefx: object, failures: { code: string, message: string }[], notes: object }>}
 */
export async function deriveWithReport(ctx, opts = {}) {
  const profile = await ctx.profile();
  const { safety } = await ctx.safety();
  const refs = opts.refs?.length ? opts.refs : [`origin/${profile.repo.base}`, 'HEAD'];
  // The scheduled jobs come from the database and the worker files from git: read both at once.
  const cronRead = opts.cron === 'skip' ? null : readCronJobs(ctx).then((jobs) => ({ jobs }), (err) => ({ err }));
  const readers = [];
  for (const ref of refs) {
    const reader = await refReader(ctx.git, ref);
    if (!readers.some((r) => r.sha === reader.sha)) readers.push(reader);
  }
  const tsFiles = [];
  const sqlFiles = [];
  for (const reader of readers) {
    tsFiles.push(...(await readGlobs(reader, safety.workers.tsGlobs)).map((f) => ({ ...f, ref: reader.ref })));
    sqlFiles.push(...(await readGlobs(reader, safety.workers.sqlGlobs)).map((f) => ({ ...f, ref: reader.ref })));
  }
  let cronJobs = null;
  const failures = [];
  if (cronRead) {
    const { jobs, err } = await cronRead;
    if (err) failures.push({ code: 'cron-unread', message: `cron.job could not be read from the test database (${err.message}); a scheduled job would go unseen` });
    else cronJobs = jobs;
  }
  const result = deriveFromSources({
    tsFiles, sqlFiles, cronJobs, forbiddenStates: safety.forbiddenStates, derivedAt: ctx.clock.now().toISOString(),
  });
  failures.push(...result.failures);
  if (ctx.paths && opts.write !== false) await writeArtefact(ctx.paths, 'sidefx', result.sidefx);
  return { sidefx: result.sidefx, failures, notes: { ...result.notes, refs: readers.map((r) => `${r.ref}@${r.sha.slice(0, 9)}`), cron: cronJobs === null ? 'not read' : `${cronJobs.length} job(s)` } };
}

async function readCronJobs(ctx) {
  const { createDataAdapter } = await import('../../adapters/data/supabase.mjs');
  const db = await createDataAdapter(ctx);
  const ext = await db.query("select count(*) as n from pg_extension where extname = 'pg_cron'");
  if (!Number(ext?.[0]?.n)) return [];
  const rows = await db.query('select jobname, command from cron.job order by jobname');
  return rows.map((r) => ({ jobname: String(r.jobname ?? ''), command: String(r.command ?? '') }));
}

/**
 * Pure derivation from file contents.
 * @param {{
 *   tsFiles: { path: string, text: string, sha256: string, ref?: string }[],
 *   sqlFiles: { path: string, text: string, sha256?: string }[],
 *   cronJobs: { jobname: string, command: string }[] | null,
 *   forbiddenStates: object[], derivedAt: string,
 * }} src
 * @returns {{ sidefx: object, failures: { code: string, message: string }[], notes: object }}
 */
export function deriveFromSources(src) {
  const predicates = [];
  const failures = [];
  const ids = new Map();
  const seen = new Set();
  const push = (idBase, p) => {
    const key = JSON.stringify([p.origin, p.table, p.filters, p.source]);
    if (seen.has(key)) return;
    seen.add(key);
    const n = (ids.get(idBase) ?? 0) + 1;
    ids.set(idBase, n);
    predicates.push({ id: n === 1 ? idBase : `${idBase}.${n}`, ...p });
  };

  // ts
  const rpcCalls = new Map();
  let chainsWithoutLiterals = 0;
  const files = [];
  const fileSeen = new Set();
  for (const f of src.tsFiles) {
    const fk = `${f.path}\0${f.sha256}`;
    if (fileSeen.has(fk)) continue;
    fileSeen.add(fk);
    files.push({ path: f.path, sha256: f.sha256 });
    const { chains, rpcs } = extractTsChains(f.path, f.text);
    for (const c of chains) {
      if (!c.filters.length) { chainsWithoutLiterals++; continue; }
      push(`ts:${fileTag(f.path)}#${idPart(c.fn)}`, {
        origin: 'ts',
        table: c.table,
        filters: c.filters,
        source: `${f.path}:${c.fnLine} ${c.fn} (chain at lines ${c.line}-${c.endLine})`,
      });
    }
    for (const r of rpcs) {
      const name = r.name.toLowerCase().replace(/^public\./, '');
      if (!rpcCalls.has(name)) rpcCalls.set(name, []);
      rpcCalls.get(name).push(`${f.path}:${r.line}`);
    }
  }

  // sql
  const fnIndex = indexFunctions(src.sqlFiles);
  const usedSql = new Set();
  for (const [name, callers] of [...rpcCalls].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const entry = fnIndex.get(name);
    const calledFrom = `called from ${callers[0]}${callers.length > 1 ? ` and ${callers.length - 1} more` : ''}`;
    if (!entry) {
      failures.push({ code: 'rpc-undefined', message: `.rpc('${name}') (${calledFrom}) has no definition in the migrations read; hand-list what it touches (source "rpc:${name}")` });
      continue;
    }
    const visited = new Set();
    const visit = (def, depth) => {
      if (visited.has(def.name) || depth > 3) return;
      visited.add(def.name);
      usedSql.add(def.file);
      const lineOffset = def.bodyLine - 1;
      if (/\bexecute\b/i.test(stripSqlStrings(def.body))) {
        failures.push({ code: 'rpc-dynamic', message: `${def.file}:${def.line} ${def.name} runs dynamic SQL (execute), which cannot be read; hand-list what it touches (source "rpc:${def.name}")` });
      }
      for (const p of sqlPredicates(def.body, { lineOffset, vars: def.params })) {
        push(`sql:${idPart(def.name)}`, {
          origin: 'sql',
          table: p.table,
          filters: p.filters,
          source: `${def.file}:${def.line} ${def.name} (${p.kind}, where at lines ${p.line}-${p.endLine}), ${calledFrom}`,
        });
      }
      for (const inner of calledFunctions(def.body, fnIndex)) visit(fnIndex.get(inner).latest, depth + 1);
    };
    visit(entry.latest, 0);
  }

  // cron
  const handSources = (src.forbiddenStates ?? []).map((p) => String(p.source ?? ''));
  const handListed = (tag) => handSources.some((s) => s.includes(tag));
  for (const job of src.cronJobs ?? []) {
    const { predicates: preds, unparsed } = parseCronCommand(job.command, fnIndex);
    for (const p of preds) {
      push(`cron:${idPart(job.jobname)}`, { origin: 'sql', table: p.table, filters: p.filters, source: `cron.job ${job.jobname} via ${p.via} (${p.kind}, lines ${p.line}-${p.endLine})` });
    }
    if (unparsed.length && !handListed(`cron:${job.jobname}`)) {
      failures.push({ code: 'cron-unparsed', message: `cron.job ${job.jobname}: ${unparsed.join('; ')}; hand-list what it touches in the safety file (source "cron:${job.jobname}")` });
    }
  }
  for (const f of failures.filter((x) => x.code === 'rpc-undefined' || x.code === 'rpc-dynamic')) {
    const m = /source "(rpc:[^"]+)"/.exec(f.message);
    if (m && handListed(m[1])) f.code = 'hand-listed';
  }

  // hand
  (src.forbiddenStates ?? []).forEach((p, i) => {
    push(`hand:${i + 1}`, { origin: 'hand', table: p.table, filters: p.filters, source: p.source });
  });

  for (const f of src.sqlFiles) if (usedSql.has(f.path) && f.sha256) files.push({ path: f.path, sha256: f.sha256 });
  const sidefx = { schemaVersion: 1, derivedAt: src.derivedAt, files, predicates };
  return {
    sidefx,
    failures: failures.filter((f) => f.code !== 'hand-listed'),
    notes: { tsFiles: fileSeen.size, rpcs: [...rpcCalls.keys()], chainsWithoutLiterals, cronJobs: src.cronJobs?.length ?? null },
  };
}

function calledFunctions(body, fnIndex) {
  const out = new Set();
  const tokens = sqlTokenize(body);
  for (let i = 0; i < tokens.length - 1; i++) {
    const tk = tokens[i];
    if (tk.t === 'id' && !tk.quoted && tokens[i + 1].t === 'p' && tokens[i + 1].v === '(' && fnIndex.has(tk.low)) out.add(tk.low);
  }
  return out;
}

function stripSqlStrings(sql) {
  return sqlTokenize(sql).filter((t) => t.t === 'id').map((t) => t.v).join(' ');
}

/** `apps/x/src/jobs/sweep.ts` -> `jobs.sweep.ts` (ids allow letters, digits and . _ : # -). */
function fileTag(path) {
  const parts = path.split('/');
  return idPart(parts.slice(-2).join('.'));
}

function idPart(s) {
  return String(s).replace(/[^A-Za-z0-9._:#-]/g, '_').replace(/^[^A-Za-z0-9]+/, '') || 'x';
}
