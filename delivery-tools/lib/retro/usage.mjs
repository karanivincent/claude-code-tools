// Tokens, model and minutes from Claude Code's own session transcripts, for the runs ledger.
// A transcript is JSON lines; an assistant line carries message.model, message.id and
// message.usage, and one message is split over several lines that repeat its usage, so each
// message counts once (its largest output). Subagents live in <session>/subagents/agent-<id>.jsonl
// with an agent-<id>.meta.json beside them naming the agent type and description.
// Reading is best effort: a transcript that is missing or unreadable is no agent, never an error.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { configuredExperiment, costOf, familyOf, roleConfig, roleOf } from './models.mjs';

/** Claude Code's folder of a worktree's transcripts: every character outside [A-Za-z0-9] becomes "-". Null with no home. */
export function projectDirFor(worktree, env = process.env) {
  if (!env.CLAUDE_CONFIG_DIR && !env.HOME) return null;
  const base = env.CLAUDE_CONFIG_DIR || join(env.HOME, '.claude');
  return join(base, 'projects', String(worktree).replace(/[^A-Za-z0-9]/g, '-'));
}

const textOf = (content) => (typeof content === 'string' ? content : Array.isArray(content) ? content.filter((c) => c?.type === 'text').map((c) => c.text).join('\n') : '');

/**
 * The usage in one transcript's text, optionally only the messages timed inside [from, to]. Pure.
 * @returns {{ model: string|null, tokensIn: number, tokensCached: number, tokensOut: number, start: number|null, end: number|null, minutes: number, prompt: string, lastText: string, messages: number }}
 */
export function usageOfTranscript(text, { from = -Infinity, to = Infinity } = {}) {
  const byId = new Map();
  const perModel = new Map();
  let start = null, end = null, prompt = '', lastText = '';
  for (const line of String(text ?? '').split('\n')) {
    if (!line.trim()) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    const t = Date.parse(e.timestamp);
    if (Number.isFinite(t) && (t < from || t > to)) continue;
    if (e.type === 'user' && !prompt) prompt = textOf(e.message?.content);
    if (e.type !== 'assistant' || !e.message?.usage) continue;
    if (Number.isFinite(t)) { start = start === null ? t : Math.min(start, t); end = end === null ? t : Math.max(end, t); }
    const said = textOf(e.message.content);
    if (said.trim()) lastText = said;
    const id = e.message.id ?? `${e.uuid ?? byId.size}`;
    const u = e.message.usage;
    const prev = byId.get(id);
    if (!prev || (u.output_tokens ?? 0) >= (prev.usage.output_tokens ?? 0)) byId.set(id, { model: e.message.model, usage: u });
  }
  let tokensIn = 0, tokensCached = 0, tokensOut = 0;
  for (const { model, usage: u } of byId.values()) {
    const i = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
    const c = u.cache_read_input_tokens ?? 0;
    const o = u.output_tokens ?? 0;
    tokensIn += i; tokensCached += c; tokensOut += o;
    perModel.set(model, (perModel.get(model) ?? 0) + i + c + o);
  }
  const model = [...perModel.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const minutes = start === null ? 0 : Math.round(((end - start) / 60000) * 10) / 10;
  return { model, tokensIn, tokensCached, tokensOut, start, end, minutes, prompt, lastText, messages: byId.size };
}

/** "Outcome: blocked" on a line of the agent's last message, else "done". */
export function outcomeOf(lastText) {
  const m = String(lastText ?? '').match(/^\s*\**outcome\**:\s*\**([a-z][a-z-]*)/im);
  return m ? m[1].toLowerCase() : 'done';
}

/**
 * One agent's ledger entry from its transcript and meta. Effort is the role's as models.json sets it
 * when `effortFromConfig`, else null (a backfill cannot know what effort an old run used).
 * @returns {object|null}
 */
export function agentFromTranscript({ id, text, meta = {}, effortFromConfig = true }) {
  const u = usageOfTranscript(text);
  if (!u.messages) return null;
  const role = roleOf({ prompt: u.prompt, agentType: meta.agentType, description: meta.description });
  let phase = null, effort = null;
  if (role !== 'other') { const r = roleConfig(role); phase = r.phase; if (effortFromConfig) effort = r.effort; }
  // D11: the experiment's agent runs the role at its own effort, not the role's usual one.
  const experiment = configuredExperiment();
  if (experiment && meta.agentType === experiment.agent && effortFromConfig) effort = experiment.effort;
  const tokens = { tokensIn: u.tokensIn, tokensCached: u.tokensCached, tokensOut: u.tokensOut };
  return {
    id: String(id), role, phase, agentType: meta.agentType ?? null, model: familyOf(u.model) ?? u.model ?? 'unknown', effort,
    minutes: u.minutes, ...tokens, costUsd: costOf(u.model, tokens), outcome: outcomeOf(u.lastText),
    startedAt: u.start === null ? null : new Date(u.start).toISOString(),
  };
}

/** Every subagent under a project folder whose first message is inside [from, to], oldest first. */
export function scanAgents(projectDir, { from = -Infinity, to = Infinity } = {}) {
  const out = [];
  let sessions = [];
  try { sessions = readdirSync(projectDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { return out; }
  for (const s of sessions) {
    const dir = join(projectDir, s, 'subagents');
    let files = [];
    try { files = readdirSync(dir).filter((n) => /^agent-.+\.jsonl$/.test(n)); } catch { continue; }
    for (const f of files) {
      const id = f.replace(/^agent-/, '').replace(/\.jsonl$/, '');
      const metaFile = join(dir, `agent-${id}.meta.json`);
      let meta = {};
      try { if (existsSync(metaFile)) meta = JSON.parse(readFileSync(metaFile, 'utf8')); } catch { meta = {}; }
      let text;
      try { text = readFileSync(join(dir, f), 'utf8'); } catch { continue; }
      const a = agentFromTranscript({ id, text, meta, effortFromConfig: false });
      if (!a || !a.startedAt) continue;
      const t = Date.parse(a.startedAt);
      if (t < from || t > to) continue;
      out.push(a);
    }
  }
  return out.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

/** The main sessions' own usage (not their subagents') inside [from, to], summed over every session file. */
export function scanMain(projectDir, { from = -Infinity, to = Infinity } = {}) {
  let files = [];
  try { files = readdirSync(projectDir).filter((n) => n.endsWith('.jsonl')); } catch { return null; }
  const sum = { models: new Map(), tokensIn: 0, tokensCached: 0, tokensOut: 0, costUsd: 0, found: false };
  for (const f of files) {
    let text;
    try { text = readFileSync(join(projectDir, f), 'utf8'); } catch { continue; }
    const u = usageOfTranscript(text, { from, to });
    if (!u.messages) continue;
    sum.found = true;
    sum.tokensIn += u.tokensIn; sum.tokensCached += u.tokensCached; sum.tokensOut += u.tokensOut;
    const fam = familyOf(u.model) ?? u.model ?? 'unknown';
    sum.models.set(fam, (sum.models.get(fam) ?? 0) + 1);
    sum.costUsd += costOf(u.model, u) ?? 0;
  }
  if (!sum.found) return null;
  const model = [...sum.models.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return { model, tokensIn: sum.tokensIn, tokensCached: sum.tokensCached, tokensOut: sum.tokensOut, costUsd: Math.round(sum.costUsd * 100) / 100 };
}
